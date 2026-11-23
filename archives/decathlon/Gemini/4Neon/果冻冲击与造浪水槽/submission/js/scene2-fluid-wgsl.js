// js/scene2-fluid-wgsl.js — 3D WebGPU APIC/FLIP Fluid + Two-Way Rigid Spheres + Whitewater/Bubbles + Caustics Compute Shaders
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  // Shared tank constants & analytical sculpted reef terrain used by BOTH compute & render shaders!
  const SCENE2_DOMAIN_WGSL = /* wgsl */ `
const NX: u32 = 104u;
const NY: u32 = 40u;
const NZ: u32 = 32u;
const CELL_H: f32 = 0.0625;
const INV_H: f32 = 16.0;
const TANK_L: f32 = 6.5;   // NX * CELL_H
const TANK_H: f32 = 2.5;   // NY * CELL_H
const TANK_W: f32 = 2.0;   // NZ * CELL_H
const N_SPHERES: u32 = 28u;
const MAX_DIFFUSE: u32 = 65536u;
const CAUST_W: u32 = 208u;
const CAUST_H: u32 = 64u;

const CELL_N: u32 = 133120u; // 104 * 40 * 32
const U_N: u32 = 134400u;    // 105 * 40 * 32
const V_N: u32 = 136448u;    // 104 * 41 * 32
const W_N: u32 = 137280u;    // 104 * 40 * 33

// Packed atomic grid offsets (1 storage buffer!)
const AOFF_USUM: u32 = 0u;
const AOFF_UWT: u32  = 134400u;
const AOFF_VSUM: u32 = 268800u;
const AOFF_VWT: u32  = 405248u;
const AOFF_WSUM: u32 = 541696u;
const AOFF_WWT: u32  = 678976u;
const AOFF_DENS: u32 = 816256u;
const ATOMIC_TOTAL: u32 = 949376u;

// Packed float velocity grid offsets (1 storage buffer!)
const VOFF_U: u32     = 0u;
const VOFF_V: u32     = 134400u;
const VOFF_W: u32     = 270848u;
const VOFF_UPREV: u32 = 408128u;
const VOFF_VPREV: u32 = 542528u;
const VOFF_WPREV: u32 = 678976u;

// Packed float scalar grid offsets (1 storage buffer!)
const SOFF_DENS: u32 = 0u;
const SOFF_PRES: u32 = 133120u;
const SOFF_DIV: u32  = 266240u;

const CELL_AIR: u32 = 0u;
const CELL_FLUID: u32 = 1u;
const CELL_SOLID: u32 = 2u;

// Sculpted Asymmetric Shoaling Reef & Front Bypass Channel inside the glass flume:
// - Back-center shoaling reef rises cleanly to y ~ 0.64 -> forces waves to climb, steepen, curl & plunge-break!
// - Deeper sculpted front bypass channel (z > 1.25) + right-front cobble mound -> water visibly overtops AND flows around!
fn terrainHeight(x: f32, z: f32) -> f32 {
  let dx1 = (x - 3.88) / 1.08;
  let dz1 = (z - 0.46) / 0.78;
  let ridge1 = 0.64 * exp(-(dx1 * dx1 * 1.15 + dz1 * dz1 * 1.05));

  let dxA = (x - 3.55) / 0.95;
  let dzA = (z - 1.05) / 0.68;
  let apron = 0.14 * exp(-(dxA * dxA + dzA * dzA));

  let dx2 = (x - 4.78) / 0.52;
  let dz2 = (z - 1.50) / 0.42;
  let mound2 = 0.32 * exp(-(dx2 * dx2 + dz2 * dz2));

  let endSlope = 0.08 * smoothstep(5.4, 6.45, x);
  let leftMask = smoothstep(1.85, 2.55, x);
  return (ridge1 + apron + mound2 + endSlope) * leftMask;
}

fn terrainNormal(x: f32, z: f32) -> vec3<f32> {
  let eps = 0.03;
  let hx0 = terrainHeight(clamp(x - eps, 0.0, TANK_L), z);
  let hx1 = terrainHeight(clamp(x + eps, 0.0, TANK_L), z);
  let hz0 = terrainHeight(x, clamp(z - eps, 0.0, TANK_W));
  let hz1 = terrainHeight(x, clamp(z + eps, 0.0, TANK_W));
  return normalize(vec3<f32>(-(hx1 - hx0) / (2.0 * eps), 1.0, -(hz1 - hz0) / (2.0 * eps)));
}

fn cellIdx(ix: u32, iy: u32, iz: u32) -> u32 {
  return (iz * NY + iy) * NX + ix;
}
fn uIdx(ix: u32, iy: u32, iz: u32) -> u32 {
  return (iz * NY + iy) * (NX + 1u) + ix;
}
fn vIdx(ix: u32, iy: u32, iz: u32) -> u32 {
  return (iz * (NY + 1u) + iy) * NX + ix;
}
fn wIdx(ix: u32, iy: u32, iz: u32) -> u32 {
  return (iz * NY + iy) * NX + ix;
}
`;

  const FLUID_STRUCTS_WGSL = /* wgsl */ `
struct SimParams {
  dt: f32,
  paddleX: f32,
  paddleVel: f32,
  flipRatio: f32,
  restDensity: f32,
  driftGain: f32,
  waveActive: f32,
  frameSeed: u32,
  particleCount: u32,
  sorParity: u32,
  sorOmega: f32,
  calmDamping: f32,
  groupDensities: vec4<f32>,
  sphereActiveCount: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

struct FluidParticle {
  pos: vec4<f32>, // xyz = world pos, w = foam/aeration energy [0..1]
  vel: vec4<f32>, // xyz = world vel, w = active (>0.5)
};

struct DiffuseParticle {
  posLife: vec4<f32>, // xyz = pos, w = life (>0 active)
  velType: vec4<f32>, // xyz = vel, w = kind (0=spray, 1=foam, 2=bubble)
};

struct RigidSphere {
  posRad: vec4<f32>,   // xyz = pos, w = radius
  velGroup: vec4<f32>, // xyz = vel, w = groupId (0..3)
  quat: vec4<f32>,     // xyzw orientation quaternion
  angSub: vec4<f32>,   // xyz = angular vel, w = submerged fraction [0..1]
};
`;

  // Compute Shader Module A: Only 6 storage buffers total! (Spec-universal <= 8!)
  const GRID_COMPUTE_WGSL = /* wgsl */ `
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> sim: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<FluidParticle>;
@group(0) @binding(2) var<storage, read_write> spheres: array<RigidSphere>;
@group(0) @binding(3) var<storage, read_write> atomicGrid: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> velGrid: array<f32>;
@group(0) @binding(5) var<storage, read_write> scalarGrid: array<f32>;
@group(0) @binding(6) var<storage, read_write> cellType: array<u32>;

const V_SCALE: f32 = 4096.0;
const W_SCALE: f32 = 4096.0;
const D_SCALE: f32 = 256.0;

fn findSphereContaining(p: vec3<f32>, radScale: f32) -> i32 {
  let count = sim.sphereActiveCount;
  for (var s = 0u; s < count; s++) {
    let sp = spheres[s].posRad;
    let d = p - sp.xyz;
    let r = sp.w * radScale;
    if (dot(d, d) < r * r) {
      return i32(s);
    }
  }
  return -1;
}

// 1. Clear packed atomic accumulation buffer
@compute @workgroup_size(256)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx < ATOMIC_TOTAL) {
    atomicStore(&atomicGrid[idx], 0);
  }
}

// 2. Particle-to-MAC-Grid (Trilinear Scatter)
@compute @workgroup_size(256)
fn p2g(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= sim.particleCount) { return; }
  let pt = particles[pid];
  if (pt.vel.w < 0.5) { return; }

  let p = pt.pos.xyz * INV_H;
  let v = clamp(pt.vel.xyz, vec3<f32>(-14.0), vec3<f32>(14.0));

  // Cell-center density scatter
  {
    let gc = p - vec3<f32>(0.5);
    let i0 = clamp(i32(floor(gc.x)), 0, i32(NX) - 2);
    let j0 = clamp(i32(floor(gc.y)), 0, i32(NY) - 2);
    let k0 = clamp(i32(floor(gc.z)), 0, i32(NZ) - 2);
    let f = clamp(gc - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
    for (var dz = 0u; dz < 2u; dz++) {
      let wz = select(1.0 - f.z, f.z, dz == 1u);
      for (var dy = 0u; dy < 2u; dy++) {
        let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
        for (var dx = 0u; dx < 2u; dx++) {
          let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
          let iw = i32(w * D_SCALE);
          if (iw > 0) {
            atomicAdd(&atomicGrid[AOFF_DENS + cellIdx(u32(i0) + dx, u32(j0) + dy, u32(k0) + dz)], iw);
          }
        }
      }
    }
  }

  // U velocity scatter
  {
    let gu = vec3<f32>(p.x, p.y - 0.5, p.z - 0.5);
    let i0 = clamp(i32(floor(gu.x)), 0, i32(NX) - 1);
    let j0 = clamp(i32(floor(gu.y)), 0, i32(NY) - 2);
    let k0 = clamp(i32(floor(gu.z)), 0, i32(NZ) - 2);
    let f = clamp(gu - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
    for (var dz = 0u; dz < 2u; dz++) {
      let wz = select(1.0 - f.z, f.z, dz == 1u);
      for (var dy = 0u; dy < 2u; dy++) {
        let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
        for (var dx = 0u; dx < 2u; dx++) {
          let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
          if (w > 1e-4) {
            let id = uIdx(u32(i0) + dx, u32(j0) + dy, u32(k0) + dz);
            atomicAdd(&atomicGrid[AOFF_USUM + id], i32(round(v.x * w * V_SCALE)));
            atomicAdd(&atomicGrid[AOFF_UWT + id], i32(round(w * W_SCALE)));
          }
        }
      }
    }
  }

  // V velocity scatter
  {
    let gv = vec3<f32>(p.x - 0.5, p.y, p.z - 0.5);
    let i0 = clamp(i32(floor(gv.x)), 0, i32(NX) - 2);
    let j0 = clamp(i32(floor(gv.y)), 0, i32(NY) - 1);
    let k0 = clamp(i32(floor(gv.z)), 0, i32(NZ) - 2);
    let f = clamp(gv - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
    for (var dz = 0u; dz < 2u; dz++) {
      let wz = select(1.0 - f.z, f.z, dz == 1u);
      for (var dy = 0u; dy < 2u; dy++) {
        let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
        for (var dx = 0u; dx < 2u; dx++) {
          let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
          if (w > 1e-4) {
            let id = vIdx(u32(i0) + dx, u32(j0) + dy, u32(k0) + dz);
            atomicAdd(&atomicGrid[AOFF_VSUM + id], i32(round(v.y * w * V_SCALE)));
            atomicAdd(&atomicGrid[AOFF_VWT + id], i32(round(w * W_SCALE)));
          }
        }
      }
    }
  }

  // W velocity scatter
  {
    let gw = vec3<f32>(p.x - 0.5, p.y - 0.5, p.z);
    let i0 = clamp(i32(floor(gw.x)), 0, i32(NX) - 2);
    let j0 = clamp(i32(floor(gw.y)), 0, i32(NY) - 2);
    let k0 = clamp(i32(floor(gw.z)), 0, i32(NZ) - 1);
    let f = clamp(gw - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
    for (var dz = 0u; dz < 2u; dz++) {
      let wz = select(1.0 - f.z, f.z, dz == 1u);
      for (var dy = 0u; dy < 2u; dy++) {
        let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
        for (var dx = 0u; dx < 2u; dx++) {
          let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
          if (w > 1e-4) {
            let id = wIdx(u32(i0) + dx, u32(j0) + dy, u32(k0) + dz);
            atomicAdd(&atomicGrid[AOFF_WSUM + id], i32(round(v.z * w * V_SCALE)));
            atomicAdd(&atomicGrid[AOFF_WWT + id], i32(round(w * W_SCALE)));
          }
        }
      }
    }
  }
}

// 3. Classify cells (SOLID / FLUID / AIR) and normalize MAC velocities
@compute @workgroup_size(4, 4, 4)
fn normalizeAndClassify(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  if (ix < NX && iy < NY && iz < NZ) {
    let cid = cellIdx(ix, iy, iz);
    let dens = f32(atomicLoad(&atomicGrid[AOFF_DENS + cid])) / D_SCALE;
    scalarGrid[SOFF_DENS + cid] = dens;

    let wp = vec3<f32>(f32(ix) + 0.5, f32(iy) + 0.5, f32(iz) + 0.5) * CELL_H;
    var cType = CELL_AIR;
    let isWall = (ix == 0u || ix == NX - 1u || iy == 0u || iz == 0u || iz == NZ - 1u);
    let isPaddle = (wp.x <= sim.paddleX);
    let isTerrain = (wp.y <= terrainHeight(wp.x, wp.z));
    let spIdx = findSphereContaining(wp, 0.90);

    if (isWall || isPaddle || isTerrain || spIdx >= 0) {
      cType = CELL_SOLID;
    } else if (dens > 0.22) {
      cType = CELL_FLUID;
    }
    cellType[cid] = cType;
    if (cType != CELL_FLUID) {
      scalarGrid[SOFF_PRES + cid] = 0.0;
    }
  }

  if (ix <= NX && iy < NY && iz < NZ) {
    let uid = uIdx(ix, iy, iz);
    let wt = atomicLoad(&atomicGrid[AOFF_UWT + uid]);
    let val = select(0.0, f32(atomicLoad(&atomicGrid[AOFF_USUM + uid])) / f32(wt), wt > 0);
    velGrid[VOFF_U + uid] = val;
    velGrid[VOFF_UPREV + uid] = val;
  }

  if (ix < NX && iy <= NY && iz < NZ) {
    let vid = vIdx(ix, iy, iz);
    let wt = atomicLoad(&atomicGrid[AOFF_VWT + vid]);
    let val = select(0.0, f32(atomicLoad(&atomicGrid[AOFF_VSUM + vid])) / f32(wt), wt > 0);
    velGrid[VOFF_V + vid] = val;
    velGrid[VOFF_VPREV + vid] = val;
  }

  if (ix < NX && iy < NY && iz <= NZ) {
    let wid = wIdx(ix, iy, iz);
    let wt = atomicLoad(&atomicGrid[AOFF_WWT + wid]);
    let val = select(0.0, f32(atomicLoad(&atomicGrid[AOFF_WSUM + wid])) / f32(wt), wt > 0);
    velGrid[VOFF_W + wid] = val;
    velGrid[VOFF_WPREV + wid] = val;
  }
}

// 4. Add gravity + Enforce moving solid boundary velocities
@compute @workgroup_size(4, 4, 4)
fn applyForcesAndBoundaries(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  let damp = 1.0 - sim.calmDamping;

  if (ix <= NX && iy < NY && iz < NZ) {
    let uid = uIdx(ix, iy, iz);
    var u = velGrid[VOFF_U + uid] * damp;
    let wp = vec3<f32>(f32(ix), f32(iy) + 0.5, f32(iz) + 0.5) * CELL_H;
    let leftSolid = (ix == 0u) || (cellType[cellIdx(ix - 1u, iy, iz)] == CELL_SOLID);
    let rightSolid = (ix == NX) || (cellType[cellIdx(ix, iy, iz)] == CELL_SOLID);

    if (leftSolid || rightSolid) {
      if (ix > 0u && ix < NX - 1u && abs(wp.x - sim.paddleX) <= CELL_H * 1.15 && wp.y > terrainHeight(wp.x, wp.z) && iz > 0u && iz < NZ - 1u) {
        u = sim.paddleVel;
      } else {
        let sp = findSphereContaining(wp, 1.06);
        if (sp >= 0) {
          u = spheres[u32(sp)].velGroup.x;
        } else {
          u = 0.0;
        }
      }
    }
    velGrid[VOFF_U + uid] = u;
  }

  if (ix < NX && iy <= NY && iz < NZ) {
    let vid = vIdx(ix, iy, iz);
    var v = velGrid[VOFF_V + vid] * damp;
    let botSolid = (iy == 0u) || (cellType[cellIdx(ix, iy - 1u, iz)] == CELL_SOLID);
    let topSolid = (iy == NY) || (cellType[cellIdx(ix, iy, iz)] == CELL_SOLID);
    let botFluid = (iy > 0u) && (cellType[cellIdx(ix, iy - 1u, iz)] == CELL_FLUID);
    let topFluid = (iy < NY) && (cellType[cellIdx(ix, iy, iz)] == CELL_FLUID);

    if (botFluid || topFluid) {
      v -= 9.81 * sim.dt;
    }
    if (botSolid || topSolid) {
      let wp = vec3<f32>(f32(ix) + 0.5, f32(iy), f32(iz) + 0.5) * CELL_H;
      let sp = findSphereContaining(wp, 1.06);
      if (sp >= 0 && iy > 1u) {
        v = spheres[u32(sp)].velGroup.y;
      } else {
        v = 0.0;
      }
    }
    velGrid[VOFF_V + vid] = v;
  }

  if (ix < NX && iy < NY && iz <= NZ) {
    let wid = wIdx(ix, iy, iz);
    var w = velGrid[VOFF_W + wid] * damp;
    let backSolid = (iz == 0u) || (cellType[cellIdx(ix, iy, iz - 1u)] == CELL_SOLID);
    let frontSolid = (iz == NZ) || (cellType[cellIdx(ix, iy, iz)] == CELL_SOLID);
    if (backSolid || frontSolid) {
      let wp = vec3<f32>(f32(ix) + 0.5, f32(iy) + 0.5, f32(iz)) * CELL_H;
      let sp = findSphereContaining(wp, 1.06);
      if (sp >= 0 && iz > 1u && iz < NZ - 1u) {
        w = spheres[u32(sp)].velGroup.z;
      } else {
        w = 0.0;
      }
    }
    velGrid[VOFF_W + wid] = w;
  }
}

// 5. Compute MAC Divergence + Positive Density Drift Stabilization
@compute @workgroup_size(4, 4, 4)
fn computeDivergence(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  if (ix >= NX || iy >= NY || iz >= NZ) { return; }
  let cid = cellIdx(ix, iy, iz);
  if (cellType[cid] != CELL_FLUID) {
    scalarGrid[SOFF_DIV + cid] = 0.0;
    return;
  }

  let div = (velGrid[VOFF_U + uIdx(ix + 1u, iy, iz)] - velGrid[VOFF_U + uIdx(ix, iy, iz)] +
             velGrid[VOFF_V + vIdx(ix, iy + 1u, iz)] - velGrid[VOFF_V + vIdx(ix, iy, iz)] +
             velGrid[VOFF_W + wIdx(ix, iy, iz + 1u)] - velGrid[VOFF_W + wIdx(ix, iy, iz)]) * INV_H;

  let excess = max(0.0, (scalarGrid[SOFF_DENS + cid] - sim.restDensity) / max(sim.restDensity, 1.0));
  let drift = sim.driftGain * excess / max(sim.dt, 0.002);
  scalarGrid[SOFF_DIV + cid] = div - drift;
}

// 6. Red-Black Gauss-Seidel SOR 3D Poisson Solver
fn doPressureSOR(id: vec3<u32>, parity: u32) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  if (ix == 0u || ix >= NX - 1u || iy == 0u || iy >= NY - 1u || iz == 0u || iz >= NZ - 1u) { return; }
  if (((ix + iy + iz) & 1u) != parity) { return; }

  let cid = cellIdx(ix, iy, iz);
  if (cellType[cid] != CELL_FLUID) { return; }

  var pSum = 0.0;
  var nOpen = 0.0;

  let cXm = cellIdx(ix - 1u, iy, iz);
  if (cellType[cXm] != CELL_SOLID) { nOpen += 1.0; if (cellType[cXm] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cXm]; } }
  let cXp = cellIdx(ix + 1u, iy, iz);
  if (cellType[cXp] != CELL_SOLID) { nOpen += 1.0; if (cellType[cXp] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cXp]; } }

  let cYm = cellIdx(ix, iy - 1u, iz);
  if (cellType[cYm] != CELL_SOLID) { nOpen += 1.0; if (cellType[cYm] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cYm]; } }
  let cYp = cellIdx(ix, iy + 1u, iz);
  if (cellType[cYp] != CELL_SOLID) { nOpen += 1.0; if (cellType[cYp] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cYp]; } }

  let cZm = cellIdx(ix, iy, iz - 1u);
  if (cellType[cZm] != CELL_SOLID) { nOpen += 1.0; if (cellType[cZm] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cZm]; } }
  let cZp = cellIdx(ix, iy, iz + 1u);
  if (cellType[cZp] != CELL_SOLID) { nOpen += 1.0; if (cellType[cZp] == CELL_FLUID) { pSum += scalarGrid[SOFF_PRES + cZp]; } }

  if (nOpen < 0.5) { return; }

  let rhs = scalarGrid[SOFF_DIV + cid] * (CELL_H * CELL_H / max(sim.dt, 0.002));
  let pNew = (pSum - rhs) / nOpen;
  let pOld = scalarGrid[SOFF_PRES + cid];
  scalarGrid[SOFF_PRES + cid] = pOld + sim.sorOmega * (pNew - pOld);
}

@compute @workgroup_size(4, 4, 4)
fn pressureSOR_Red(@builtin(global_invocation_id) id: vec3<u32>) { doPressureSOR(id, 0u); }

@compute @workgroup_size(4, 4, 4)
fn pressureSOR_Black(@builtin(global_invocation_id) id: vec3<u32>) { doPressureSOR(id, 1u); }

// 7. Subtract pressure gradient -> divergence-free MAC velocities!
@compute @workgroup_size(4, 4, 4)
fn subtractPressure(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  let scale = sim.dt * INV_H;

  if (ix > 0u && ix < NX && iy < NY && iz < NZ) {
    let cL = cellIdx(ix - 1u, iy, iz);
    let cR = cellIdx(ix, iy, iz);
    let tL = cellType[cL]; let tR = cellType[cR];
    if (tL != CELL_SOLID && tR != CELL_SOLID && (tL == CELL_FLUID || tR == CELL_FLUID)) {
      let uid = uIdx(ix, iy, iz);
      velGrid[VOFF_U + uid] -= scale * (scalarGrid[SOFF_PRES + cR] - scalarGrid[SOFF_PRES + cL]);
    }
  }

  if (ix < NX && iy > 0u && iy < NY && iz < NZ) {
    let cB = cellIdx(ix, iy - 1u, iz);
    let cT = cellIdx(ix, iy, iz);
    let tB = cellType[cB]; let tT = cellType[cT];
    if (tB != CELL_SOLID && tT != CELL_SOLID && (tB == CELL_FLUID || tT == CELL_FLUID)) {
      let vid = vIdx(ix, iy, iz);
      velGrid[VOFF_V + vid] -= scale * (scalarGrid[SOFF_PRES + cT] - scalarGrid[SOFF_PRES + cB]);
    }
  }

  if (ix < NX && iy < NY && iz > 0u && iz < NZ) {
    let cBk = cellIdx(ix, iy, iz - 1u);
    let cFr = cellIdx(ix, iy, iz);
    let tBk = cellType[cBk]; let tFr = cellType[cFr];
    if (tBk != CELL_SOLID && tFr != CELL_SOLID && (tBk == CELL_FLUID || tFr == CELL_FLUID)) {
      let wid = wIdx(ix, iy, iz);
      velGrid[VOFF_W + wid] -= scale * (scalarGrid[SOFF_PRES + cFr] - scalarGrid[SOFF_PRES + cBk]);
    }
  }
}

// 7b. Extrapolate fluid face velocities 1 cell outward into AIR
@compute @workgroup_size(4, 4, 4)
fn extrapolateAirFaces(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;

  if (ix > 0u && ix < NX && iy > 0u && iy < NY - 1u && iz > 0u && iz < NZ - 1u) {
    let tL = cellType[cellIdx(ix - 1u, iy, iz)];
    let tR = cellType[cellIdx(ix, iy, iz)];
    if (tL == CELL_AIR && tR == CELL_AIR) {
      var sum = 0.0; var cnt = 0.0;
      if (cellType[cellIdx(ix - 1u, iy - 1u, iz)] == CELL_FLUID || cellType[cellIdx(ix, iy - 1u, iz)] == CELL_FLUID) { sum += velGrid[VOFF_U + uIdx(ix, iy - 1u, iz)]; cnt += 1.0; }
      if (cellType[cellIdx(ix - 1u, iy + 1u, iz)] == CELL_FLUID || cellType[cellIdx(ix, iy + 1u, iz)] == CELL_FLUID) { sum += velGrid[VOFF_U + uIdx(ix, iy + 1u, iz)]; cnt += 1.0; }
      if (ix > 1u && cellType[cellIdx(ix - 2u, iy, iz)] == CELL_FLUID) { sum += velGrid[VOFF_U + uIdx(ix - 1u, iy, iz)]; cnt += 1.0; }
      if (ix + 1u < NX && cellType[cellIdx(ix + 1u, iy, iz)] == CELL_FLUID) { sum += velGrid[VOFF_U + uIdx(ix + 1u, iy, iz)]; cnt += 1.0; }
      if (cnt > 0.0) { velGrid[VOFF_U + uIdx(ix, iy, iz)] = sum / cnt; }
    }
  }

  if (ix > 0u && ix < NX - 1u && iy > 0u && iy < NY && iz > 0u && iz < NZ - 1u) {
    let tB = cellType[cellIdx(ix, iy - 1u, iz)];
    let tT = cellType[cellIdx(ix, iy, iz)];
    if (tB == CELL_AIR && tT == CELL_AIR) {
      var sum = 0.0; var cnt = 0.0;
      if (iy > 1u && cellType[cellIdx(ix, iy - 2u, iz)] == CELL_FLUID) { sum += velGrid[VOFF_V + vIdx(ix, iy - 1u, iz)]; cnt += 1.0; }
      if (cellType[cellIdx(ix - 1u, iy - 1u, iz)] == CELL_FLUID || cellType[cellIdx(ix - 1u, iy, iz)] == CELL_FLUID) { sum += velGrid[VOFF_V + vIdx(ix - 1u, iy, iz)]; cnt += 1.0; }
      if (cellType[cellIdx(ix + 1u, iy - 1u, iz)] == CELL_FLUID || cellType[cellIdx(ix + 1u, iy, iz)] == CELL_FLUID) { sum += velGrid[VOFF_V + vIdx(ix + 1u, iy, iz)]; cnt += 1.0; }
      if (cnt > 0.0) { velGrid[VOFF_V + vIdx(ix, iy, iz)] = sum / cnt; }
    }
  }
}
`;

  // Compute Shader Module B: Only 9 storage buffers across 2 groups (well under our 16 limit!)
  const PARTICLE_AND_COUPLING_WGSL = /* wgsl */ `
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> sim: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<FluidParticle>;
@group(0) @binding(2) var<storage, read_write> diffuse: array<DiffuseParticle>;
@group(0) @binding(3) var<storage, read_write> spheres: array<RigidSphere>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read> velGrid: array<f32>;
@group(0) @binding(6) var<storage, read> scalarGrid: array<f32>;

@group(1) @binding(0) var<storage, read_write> surfHeight: array<f32>;
@group(1) @binding(1) var<storage, read_write> causticAccum: array<atomic<u32>>;
@group(1) @binding(2) var<storage, read_write> causticOut: array<f32>;

fn pcgHash(vIn: u32) -> f32 {
  var s = vIn * 747796405u + 2891336453u;
  let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return f32((word >> 22u) ^ word) / 4294967296.0;
}

fn sampleU(pos: vec3<f32>, usePrev: bool) -> f32 {
  let g = vec3<f32>(pos.x * INV_H, pos.y * INV_H - 0.5, pos.z * INV_H - 0.5);
  let i0 = u32(clamp(i32(floor(g.x)), 0, i32(NX) - 1));
  let j0 = u32(clamp(i32(floor(g.y)), 0, i32(NY) - 2));
  let k0 = u32(clamp(i32(floor(g.z)), 0, i32(NZ) - 2));
  let f = clamp(g - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
  let base = select(VOFF_U, VOFF_UPREV, usePrev);
  var sum = 0.0;
  for (var dz = 0u; dz < 2u; dz++) {
    let wz = select(1.0 - f.z, f.z, dz == 1u);
    for (var dy = 0u; dy < 2u; dy++) {
      let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
      for (var dx = 0u; dx < 2u; dx++) {
        let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
        sum += w * velGrid[base + uIdx(i0 + dx, j0 + dy, k0 + dz)];
      }
    }
  }
  return sum;
}

fn sampleV(pos: vec3<f32>, usePrev: bool) -> f32 {
  let g = vec3<f32>(pos.x * INV_H - 0.5, pos.y * INV_H, pos.z * INV_H - 0.5);
  let i0 = u32(clamp(i32(floor(g.x)), 0, i32(NX) - 2));
  let j0 = u32(clamp(i32(floor(g.y)), 0, i32(NY) - 1));
  let k0 = u32(clamp(i32(floor(g.z)), 0, i32(NZ) - 2));
  let f = clamp(g - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
  let base = select(VOFF_V, VOFF_VPREV, usePrev);
  var sum = 0.0;
  for (var dz = 0u; dz < 2u; dz++) {
    let wz = select(1.0 - f.z, f.z, dz == 1u);
    for (var dy = 0u; dy < 2u; dy++) {
      let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
      for (var dx = 0u; dx < 2u; dx++) {
        let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
        sum += w * velGrid[base + vIdx(i0 + dx, j0 + dy, k0 + dz)];
      }
    }
  }
  return sum;
}

fn sampleW(pos: vec3<f32>, usePrev: bool) -> f32 {
  let g = vec3<f32>(pos.x * INV_H - 0.5, pos.y * INV_H - 0.5, pos.z * INV_H);
  let i0 = u32(clamp(i32(floor(g.x)), 0, i32(NX) - 2));
  let j0 = u32(clamp(i32(floor(g.y)), 0, i32(NY) - 2));
  let k0 = u32(clamp(i32(floor(g.z)), 0, i32(NZ) - 1));
  let f = clamp(g - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
  let base = select(VOFF_W, VOFF_WPREV, usePrev);
  var sum = 0.0;
  for (var dz = 0u; dz < 2u; dz++) {
    let wz = select(1.0 - f.z, f.z, dz == 1u);
    for (var dy = 0u; dy < 2u; dy++) {
      let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
      for (var dx = 0u; dx < 2u; dx++) {
        let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
        sum += w * velGrid[base + wIdx(i0 + dx, j0 + dy, k0 + dz)];
      }
    }
  }
  return sum;
}

fn sampleVel(pos: vec3<f32>, usePrev: bool) -> vec3<f32> {
  return vec3<f32>(sampleU(pos, usePrev), sampleV(pos, usePrev), sampleW(pos, usePrev));
}

fn sampleCellDensity(pos: vec3<f32>) -> f32 {
  let g = pos * INV_H - vec3<f32>(0.5);
  let i0 = u32(clamp(i32(floor(g.x)), 0, i32(NX) - 2));
  let j0 = u32(clamp(i32(floor(g.y)), 0, i32(NY) - 2));
  let k0 = u32(clamp(i32(floor(g.z)), 0, i32(NZ) - 2));
  let f = clamp(g - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
  var sum = 0.0;
  for (var dz = 0u; dz < 2u; dz++) {
    let wz = select(1.0 - f.z, f.z, dz == 1u);
    for (var dy = 0u; dy < 2u; dy++) {
      let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
      for (var dx = 0u; dx < 2u; dx++) {
        let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
        sum += w * scalarGrid[SOFF_DENS + cellIdx(i0 + dx, j0 + dy, k0 + dz)];
      }
    }
  }
  return sum;
}

fn samplePressure(pos: vec3<f32>) -> f32 {
  let g = pos * INV_H - vec3<f32>(0.5);
  let i0 = u32(clamp(i32(floor(g.x)), 0, i32(NX) - 2));
  let j0 = u32(clamp(i32(floor(g.y)), 0, i32(NY) - 2));
  let k0 = u32(clamp(i32(floor(g.z)), 0, i32(NZ) - 2));
  let f = clamp(g - vec3<f32>(f32(i0), f32(j0), f32(k0)), vec3<f32>(0.0), vec3<f32>(1.0));
  var sum = 0.0;
  for (var dz = 0u; dz < 2u; dz++) {
    let wz = select(1.0 - f.z, f.z, dz == 1u);
    for (var dy = 0u; dy < 2u; dy++) {
      let wy = select(1.0 - f.y, f.y, dy == 1u) * wz;
      for (var dx = 0u; dx < 2u; dx++) {
        let w = select(1.0 - f.x, f.x, dx == 1u) * wy;
        sum += w * scalarGrid[SOFF_PRES + cellIdx(i0 + dx, j0 + dy, k0 + dz)];
      }
    }
  }
  return sum;
}

fn emitDiffuse(pos: vec3<f32>, vel: vec3<f32>, life: f32, kind: f32) {
  let slot = atomicAdd(&counters[0], 1u) % MAX_DIFFUSE;
  diffuse[slot].posLife = vec4<f32>(pos, life);
  diffuse[slot].velType = vec4<f32>(vel, kind);
}

// 8. G2P (95% FLIP + 5% PIC), Midpoint Advection, Boundary & Sphere Enforcement, Spray/Foam/Bubble Emission!
@compute @workgroup_size(256)
fn g2pAndAdvect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pid = gid.x;
  if (pid >= sim.particleCount) { return; }
  let pt = particles[pid];
  if (pt.vel.w < 0.5) { return; }

  var p = pt.pos.xyz;
  var foam = pt.pos.w;
  var v = pt.vel.xyz;

  let dens = sampleCellDensity(p);
  let vPic = sampleVel(p, false);
  let vOld = sampleVel(p, true);

  if (dens < 0.65 && p.y > terrainHeight(p.x, p.z) + 0.12) {
    v.y -= 9.81 * sim.dt;
    v *= (1.0 - 0.15 * sim.dt);
  } else {
    let vFlip = v + (vPic - vOld);
    v = mix(vPic, vFlip, sim.flipRatio);
    v *= (1.0 - sim.calmDamping * 0.4);
  }

  v = clamp(v, vec3<f32>(-12.0), vec3<f32>(12.0));

  let midP = clamp(p + v * (0.5 * sim.dt), vec3<f32>(CELL_H), vec3<f32>(TANK_L - CELL_H, TANK_H - CELL_H, TANK_W - CELL_H));
  let vMid = select(sampleVel(midP, false), v, dens < 0.65);
  p += mix(v, vMid, 0.5) * sim.dt;

  let minX = max(CELL_H * 1.08, sim.paddleX + 0.012);
  if (p.x < minX) {
    p.x = minX;
    if (v.x < sim.paddleVel) { v.x = sim.paddleVel; }
  }
  let maxX = TANK_L - CELL_H * 1.08;
  var hitWall = false;
  if (p.x > maxX) {
    if (v.x > 1.35) { hitWall = true; }
    p.x = maxX;
    if (v.x > 0.0) { v.x *= -0.18; }
  }
  let minZ = CELL_H * 1.08;
  let maxZ = TANK_W - CELL_H * 1.08;
  if (p.z < minZ) { p.z = minZ; if (v.z < 0.0) { v.z *= -0.15; } }
  if (p.z > maxZ) { p.z = maxZ; if (v.z > 0.0) { v.z *= -0.15; } }

  let th = terrainHeight(p.x, p.z) + CELL_H * 1.04;
  if (p.y < th) {
    let tn = terrainNormal(p.x, p.z);
    p.y = th;
    let vn = dot(v, tn);
    if (vn < 0.0) { v -= tn * vn * 1.05; }
  }
  if (p.y > TANK_H - CELL_H * 0.6) {
    p.y = TANK_H - CELL_H * 0.6;
    if (v.y > 0.0) { v.y *= -0.2; }
  }

  let hSeed = pid * 1973u + sim.frameSeed * 9277u;
  let rnd = pcgHash(hSeed);
  let rnd2 = pcgHash(hSeed + 17u);
  let spCount = sim.sphereActiveCount;

  for (var s = 0u; s < spCount; s++) {
    let sp = spheres[s];
    let diff = p - sp.posRad.xyz;
    let dist = length(diff);
    let r = sp.posRad.w + 0.014;
    let sVel = sp.velGroup.xyz;
    let sSpeed = length(sVel);

    // Entry crown splash rim impulse around fast plunging spheres crossing the free surface!
    if (sVel.y < -1.8 && dist < r * 1.85 && dist >= r && dens > 0.5 && dens < 4.4 && p.y > 0.78) {
      let rimDir = normalize(vec3<f32>(diff.x, 0.0, diff.z) + vec3<f32>(1e-4, 0.0, 0.0));
      let falloff = (1.0 - (dist - r) / (r * 0.85));
      let crownKick = (-sVel.y) * falloff * 0.52;
      v += (rimDir * 0.62 + vec3<f32>(0.0, 1.0, 0.0)) * crownKick * clamp(sim.dt * 28.0, 0.0, 0.8);
      foam = min(1.0, foam + falloff * 0.25);
    }

    if (dist < r && dist > 1e-5) {
      let n = diff / dist;
      p = sp.posRad.xyz + n * r;
      let relVn = dot(v - sVel, n);
      if (relVn < 0.0) {
        v -= n * relVn * 1.24;
      }
      if (sSpeed > 1.25 && rnd < 0.18) {
        if (dens > 1.8 && sVel.y < -0.6) {
          let bVel = sVel * 0.45 + vec3<f32>((rnd - 0.5) * 0.7, 0.28, (rnd2 - 0.5) * 0.7);
          emitDiffuse(p - n * 0.01, bVel, 1.5 + rnd2 * 1.8, 2.0);
        } else if (dens < 4.5 && sSpeed > 1.5) {
          let spVel = v + n * (0.75 + sSpeed * 0.38) + vec3<f32>(0.0, 1.25 + rnd2 * 1.0, 0.0);
          emitDiffuse(p + vec3<f32>(0.0, 0.03, 0.0), spVel, 0.75 + rnd2 * 0.85, 0.0);
        }
        foam = min(1.0, foam + 0.40);
      }
    }
  }

  let speed = length(v);
  let isSurface = (dens > 0.48 && dens < 4.6);
  // Waves grow clean out of the paddle, then steepen, curl & break into whitewater over the reef & far wall!
  let awayFromPaddle = smoothstep(sim.paddleX + 0.55, sim.paddleX + 1.55, p.x);
  let reefBoost = 1.0 + 0.85 * smoothstep(2.3, 3.6, p.x) * smoothstep(5.7, 4.3, p.x);
  let crestEnergy = max(0.0, speed - 1.25) * clamp((p.y - 0.84) * 2.0, 0.0, 1.8) * awayFromPaddle * reefBoost;
  let wallEnergy = select(0.0, max(0.0, speed - 0.95) * 1.65, hitWall || p.x > 5.85);
  let shearEnergy = max(0.0, length(v - vPic) - 0.50) * 0.85 * awayFromPaddle;
  let breakDriver = crestEnergy + wallEnergy * 0.85 + shearEnergy;

  if (isSurface && breakDriver > 0.26) {
    foam = min(1.0, foam + breakDriver * sim.dt * 2.8);
    let emitProb = clamp(breakDriver * 0.022, 0.0, 0.068);
    if (rnd < emitProb) {
      let jitter = vec3<f32>(rnd - 0.5, rnd2 - 0.3, pcgHash(hSeed + 31u) - 0.5) * 0.055;
      if (v.y > 0.55 || (speed > 2.1 && rnd2 > 0.52)) {
        emitDiffuse(p + jitter + vec3<f32>(0.0, 0.025, 0.0), v * 1.08 + vec3<f32>(0.0, 0.45 * rnd2, 0.0), 0.78 + rnd2 * 0.85, 0.0);
      } else {
        emitDiffuse(p + jitter + vec3<f32>(0.0, 0.018, 0.0), v * 0.92, 2.2 + rnd2 * 2.3, 1.0);
      }
      atomicAdd(&counters[2], 1u);
    }
  } else {
    let decay = select(0.98, 0.34, sim.waveActive > 0.5);
    foam = max(0.0, foam - decay * sim.dt);
  }

  particles[pid].pos = vec4<f32>(p, foam);
  particles[pid].vel = vec4<f32>(v, 1.0);
}

// 9. Advect Diffuse Spray / Foam / Underwater Bubble Particles
@compute @workgroup_size(256)
fn stepDiffuse(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= MAX_DIFFUSE) { return; }
  var d = diffuse[idx];
  var life = d.posLife.w;
  if (life <= 0.0) { return; }

  var p = d.posLife.xyz;
  var v = d.velType.xyz;
  var kind = d.velType.w;

  let dens = sampleCellDensity(p);
  let uFluid = sampleVel(p, false);
  let rnd = pcgHash(idx * 3571u + sim.frameSeed * 5381u);

  if (dens < 0.48) {
    kind = 0.0;
    v.y -= 9.81 * sim.dt;
    v *= (1.0 - 0.35 * sim.dt);
    p += v * sim.dt;
    life -= sim.dt * 1.15;
  } else if (dens > 3.5) {
    kind = 2.0;
    let wobble = vec3<f32>(sin(f32(sim.frameSeed) * 0.12 + f32(idx)) * 0.18, 0.0, cos(f32(sim.frameSeed) * 0.15 + f32(idx)) * 0.18);
    let targetV = uFluid + vec3<f32>(0.0, 0.95, 0.0) + wobble;
    v = mix(v, targetV, clamp(sim.dt * 9.0, 0.0, 1.0));
    p += v * sim.dt;
    life -= sim.dt * 0.55;
  } else {
    kind = 1.0;
    v = mix(v, uFluid, clamp(sim.dt * 10.0, 0.0, 1.0));
    let gradUp = sampleCellDensity(p + vec3<f32>(0.0, CELL_H * 0.6, 0.0)) - sampleCellDensity(p - vec3<f32>(0.0, CELL_H * 0.6, 0.0));
    if (dens > 1.8) { v.y += 0.45 * sim.dt; }
    else if (gradUp < -0.5) { v.y -= 0.35 * sim.dt; }
    p += v * sim.dt;
    let fadeRate = select(1.45, 0.44, sim.waveActive > 0.5);
    life -= sim.dt * fadeRate * (0.8 + 0.4 * rnd);
  }

  let minX = max(CELL_H * 1.1, sim.paddleX + 0.015);
  if (p.x < minX) { p.x = minX; v.x = max(v.x, sim.paddleVel); }
  if (p.x > TANK_L - CELL_H * 1.1) { p.x = TANK_L - CELL_H * 1.1; v.x = min(v.x, 0.0); }
  if (p.z < CELL_H * 1.1) { p.z = CELL_H * 1.1; v.z = max(v.z, 0.0); }
  if (p.z > TANK_W - CELL_H * 1.1) { p.z = TANK_W - CELL_H * 1.1; v.z = min(v.z, 0.0); }
  let th = terrainHeight(p.x, p.z) + CELL_H * 1.08;
  if (p.y < th) { p.y = th; v.y = max(v.y, 0.0); }
  if (p.y > TANK_H - CELL_H * 0.5) { life = 0.0; }

  diffuse[idx].posLife = vec4<f32>(p, max(0.0, life));
  diffuse[idx].velType = vec4<f32>(v, kind);
}

// 10. Two-Way Coupled Multi-Density Rigid Spheres
var<workgroup> shPosRad: array<vec4<f32>, 28>;
var<workgroup> shVelMass: array<vec4<f32>, 28>;
var<workgroup> shAng: array<vec4<f32>, 28>;

fn quatIntegrate(q: vec4<f32>, w: vec3<f32>, dt: f32) -> vec4<f32> {
  let h = 0.5 * dt;
  let nq = vec4<f32>(
    q.x + h * (w.x * q.w + w.y * q.z - w.z * q.y),
    q.y + h * (w.y * q.w + w.z * q.x - w.x * q.z),
    q.z + h * (w.z * q.w + w.x * q.y - w.y * q.x),
    q.w + h * (-w.x * q.x - w.y * q.y - w.z * q.z)
  );
  return normalize(nq);
}

@compute @workgroup_size(28)
fn stepSpheres(@builtin(local_invocation_id) lid: vec3<u32>) {
  let i = lid.x;
  let isAct = i < sim.sphereActiveCount;
  var sp = spheres[i];
  var pos = sp.posRad.xyz;
  let r = sp.posRad.w;
  var vel = sp.velGroup.xyz;
  let grp = u32(clamp(sp.velGroup.w + 0.5, 0.0, 3.0));
  var quat = sp.quat;
  var ang = sp.angSub.xyz;
  let prevSub = sp.angSub.w;

  var rhoS = sim.groupDensities[0];
  if (grp == 1u) { rhoS = sim.groupDensities[1]; }
  else if (grp == 2u) { rhoS = sim.groupDensities[2]; }
  else if (grp == 3u) { rhoS = sim.groupDensities[3]; }
  rhoS = max(0.15, rhoS);

  let vol = (4.0 / 3.0) * 3.14159265 * r * r * r;
  let mass = rhoS * vol;
  let invMass = 1.0 / mass;

  var fSub = 0.0;

  if (isAct) {
    var subWt = 0.0;
    var uSum = vec3<f32>(0.0);
    var pGrad = vec3<f32>(0.0);
    var curlTorque = vec3<f32>(0.0);
    var wetCount = 0.0;
    let shellR = r + CELL_H * 0.88;
    let golden = 2.39996323;

    for (var k = 0u; k < 32u; k++) {
      let yk = 1.0 - (f32(k) + 0.5) / 16.0;
      let rk = sqrt(max(0.0, 1.0 - yk * yk));
      let theta = golden * f32(k);
      let dir = vec3<f32>(cos(theta) * rk, yk, sin(theta) * rk);
      let sampleP = pos + dir * shellR;

      let dVal = sampleCellDensity(sampleP);
      // Sample exact 3D-grid-derived local water surface height at (sampleP.x, sampleP.z) so touching
      // neighboring spheres or the terrain underwater NEVER causes false buoyancy loss!
      let sx = u32(clamp(i32(sampleP.x * INV_H), 0, i32(NX) - 1));
      let sz = u32(clamp(i32(sampleP.z * INV_H), 0, i32(NZ) - 1));
      let localSurfH = surfHeight[sz * NX + sx];
      let bySurf = select(0.0, smoothstep(localSurfH + 0.04, localSurfH - 0.06, sampleP.y), localSurfH > 0.05);
      let byDens = smoothstep(0.65, 3.2, dVal);
      // In open splash/air use density; submerged below the 3D free surface combine smoothly so neighbors never cancel buoyancy!
      let wet = max(byDens, bySurf * select(0.0, 1.0, localSurfH > 0.05 && sampleP.y < localSurfH));
      subWt += wet;

      if (wet > 0.05) {
        let uf = sampleVel(sampleP, false);
        uSum += uf * wet;
        wetCount += wet;
        curlTorque += cross(dir, uf - vel) * wet;
        let pr = samplePressure(sampleP);
        pGrad -= dir * pr * wet;
      }
    }

    fSub = clamp(subWt / 32.0, 0.0, 1.0);
    let uFluid = select(vec3<f32>(0.0), uSum / wetCount, wetCount > 0.1);

    if (prevSub < 0.08 && fSub >= 0.08 && vel.y < -1.1) {
      let impactE = u32(clamp((-vel.y) * sqrt(rhoS) * 18.0, 2.0, 250.0));
      atomicMax(&counters[1], impactE);
      for (var b = 0u; b < 10u; b++) {
        let angB = f32(b) * 0.6283 + f32(sim.frameSeed) * 0.1;
        let outDir = vec3<f32>(cos(angB), 0.0, sin(angB));
        let bPos = pos + outDir * (r * 0.95) + vec3<f32>(0.0, 0.03, 0.0);
        let bVel = outDir * (0.85 + (-vel.y) * 0.32) + vec3<f32>(0.0, 1.15 + (-vel.y) * 0.42, 0.0);
        emitDiffuse(bPos, bVel, 0.78, 0.0);
      }
    }

    // Exact Archimedes buoyancy for vertical equilibrium (NO double-counted hydrostatic pGrad.y!),
    // so neutral-buoyancy spheres (rho = 1.00) hover EXACTLY suspended in mid-water!
    let effMass = mass + 0.5 * fSub * vol;
    let Fgrav = vec3<f32>(0.0, -9.81 * mass, 0.0);
    let Fbuoy = vec3<f32>(0.0, 9.81 * 1.0 * vol * fSub, 0.0);

    // Realistic high-Reynolds hydrodynamic drag (couples neutral & floating spheres cleanly to 3D orbital wave velocities!)
    let relV = uFluid - vel;
    let relSpd = length(relV);
    let crossA = 3.14159265 * r * r;
    let Fdrag = relV * (0.5 * 1.0 * 1.25 * crossA * fSub * relSpd + 2.2 * r * fSub);

    // Horizontal dynamic wave pressure surge (X/Z only -> zero artificial vertical float on neutral spheres!)
    let dynPScale = vol * 1.85;
    let Fpress = clamp(vec3<f32>(pGrad.x, 0.0, pGrad.z) * dynPScale, vec3<f32>(-1.1), vec3<f32>(1.1));

    // Hydrodynamic Bernoulli shear lift on bottom heavy spheres during fast wave surges -> brief bottom liftoff in big waves!
    let horizFluidSpd = length(uFluid.xz);
    let thNow = terrainHeight(pos.x, pos.z);
    let nearBed = smoothstep(thNow + r * 3.0, thNow + r * 1.05, pos.y);
    let Flift = vec3<f32>(0.0, 0.5 * 1.0 * 2.4 * crossA * horizFluidSpd * horizFluidSpd * nearBed * fSub, 0.0);

    // Breaking wave-crest launch for surface floaters caught in fast curling crests!
    let surfCrestBoost = select(0.0, 1.0, fSub > 0.10 && fSub < 0.85 && uFluid.x > 1.10 && pos.y > 0.98);
    let Fcrest = vec3<f32>(uFluid.x * 0.35, max(0.0, uFluid.y) * 0.55 + 0.36, 0.0) * surfCrestBoost * vol * 16.0;

    let totalF = Fgrav + Fbuoy + Fdrag + Fpress + Flift + Fcrest;
    vel += (totalF / effMass) * sim.dt;

    if (fSub > 0.05) {
      vel *= (1.0 - (0.24 + sim.calmDamping * 2.6) * fSub * sim.dt);
    }
    vel = clamp(vel, vec3<f32>(-10.0), vec3<f32>(10.0));

    ang += (curlTorque / max(wetCount, 1.0)) * (8.5 / max(rhoS, 0.35)) * fSub * sim.dt;
    ang *= (1.0 - (1.8 * fSub + 0.15) * sim.dt);

    pos += vel * sim.dt;
  }

  shPosRad[i] = vec4<f32>(pos, r);
  shVelMass[i] = vec4<f32>(vel, select(0.0, invMass, isAct));
  shAng[i] = vec4<f32>(ang, 0.0);
  workgroupBarrier();

  for (var iter = 0u; iter < 4u; iter++) {
    var pI = shPosRad[i].xyz;
    var vI = shVelMass[i].xyz;
    var aI = shAng[i].xyz;
    let wI = shVelMass[i].w;

    if (isAct) {
      for (var j = 0u; j < sim.sphereActiveCount; j++) {
        if (j == i) { continue; }
        let pJ = shPosRad[j].xyz;
        let rJ = shPosRad[j].w;
        let vJ = shVelMass[j].xyz;
        let wJ = shVelMass[j].w;
        let d = pI - pJ;
        let dist = length(d);
        let rSum = r + rJ;
        if (dist < rSum && dist > 1e-5) {
          let n = d / dist;
          let pen = rSum - dist;
          let wSum = wI + wJ;
          pI += n * (pen * (wI / wSum) * 0.85);
          let vn = dot(vI - vJ, n);
          if (vn < 0.0) {
            let e = 0.58;
            let jImp = (-(1.0 + e) * vn) / wSum;
            vI += n * (jImp * wI);
            let relT = (vI - vJ) - n * vn;
            aI += cross(-n, relT) * 1.2;
            if (-vn > 0.65 && iter == 0u) {
              atomicMax(&counters[3], u32(clamp((-vn) * 40.0, 5.0, 200.0)));
            }
          }
        }
      }

      let minX = max(CELL_H + r, sim.paddleX + r + 0.01);
      if (pI.x < minX) {
        pI.x = minX;
        if (vI.x < sim.paddleVel) { vI.x = sim.paddleVel + (sim.paddleVel - vI.x) * 0.42; }
      }
      let maxX = TANK_L - CELL_H - r;
      if (pI.x > maxX) {
        pI.x = maxX;
        if (vI.x > 0.0) {
          if (vI.x > 0.85 && iter == 0u) { atomicMax(&counters[3], u32(clamp(vI.x * 35.0, 5.0, 180.0))); }
          vI.x *= -0.52;
        }
      }
      let minZ = CELL_H + r;
      let maxZ = TANK_W - CELL_H - r;
      if (pI.z < minZ) { pI.z = minZ; if (vI.z < 0.0) { vI.z *= -0.52; } }
      if (pI.z > maxZ) { pI.z = maxZ; if (vI.z > 0.0) { vI.z *= -0.52; } }

      let th = terrainHeight(pI.x, pI.z);
      let tn = terrainNormal(pI.x, pI.z);
      let minY = th + CELL_H + r;
      if (pI.y < minY) {
        pI.y = minY;
        let vn = dot(vI, tn);
        if (vn < 0.0) {
          vI -= tn * ((1.0 + 0.34) * vn);
        }
        let vTan = vI - tn * dot(vI, tn);
        let rollOmega = cross(tn, vTan) / max(r, 0.05);
        aI = mix(aI, rollOmega, 0.35);
        vI -= vTan * 0.04;
      }
      if (pI.y > TANK_H + 1.4) {
        pI.y = TANK_H + 1.4;
        if (vI.y > 0.0) { vI.y = 0.0; }
      }
    }

    workgroupBarrier();
    shPosRad[i] = vec4<f32>(pI, r);
    shVelMass[i] = vec4<f32>(vI, wI);
    shAng[i] = vec4<f32>(aI, 0.0);
    workgroupBarrier();
  }

  if (isAct) {
    let finalPos = shPosRad[i].xyz;
    let finalVel = shVelMass[i].xyz;
    let finalAng = shAng[i].xyz;
    let finalQuat = quatIntegrate(quat, finalAng, sim.dt);

    spheres[i].posRad = vec4<f32>(finalPos, r);
    spheres[i].velGroup = vec4<f32>(finalVel, sp.velGroup.w);
    spheres[i].quat = finalQuat;
    spheres[i].angSub = vec4<f32>(finalAng, fSub);
  }
}

// 11. Physically-Driven Underwater Caustics from 3D FLIP Fluid Surface!
@compute @workgroup_size(256)
fn clearCaustics(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx < CAUST_W * CAUST_H) {
    atomicStore(&causticAccum[idx], 0u);
  }
}

@compute @workgroup_size(8, 8)
fn extractSurfaceHeight(@builtin(global_invocation_id) id: vec3<u32>) {
  let ix = id.x;
  let kz = id.y;
  if (ix >= NX || kz >= NZ) { return; }
  var topH = -1.0;
  for (var iy = i32(NY) - 2; iy >= 1; iy--) {
    let d = scalarGrid[SOFF_DENS + cellIdx(ix, u32(iy), kz)];
    if (d > 0.65) {
      let dUp = scalarGrid[SOFF_DENS + cellIdx(ix, u32(iy + 1), kz)];
      let frac = clamp((d - 0.65) / max(d - dUp, 0.25), 0.0, 1.0);
      topH = (f32(iy) + frac) * CELL_H;
      break;
    }
  }
  surfHeight[kz * NX + ix] = topH;
}

@compute @workgroup_size(8, 8)
fn traceCausticRays(@builtin(global_invocation_id) id: vec3<u32>) {
  let cx = id.x; let cz = id.y;
  if (cx >= CAUST_W || cz >= CAUST_H) { return; }

  let fx = (f32(cx) + 0.5) / f32(CAUST_W) * f32(NX - 1u);
  let fz = (f32(cz) + 0.5) / f32(CAUST_H) * f32(NZ - 1u);
  let ix = u32(clamp(i32(fx), 1, i32(NX) - 2));
  let iz = u32(clamp(i32(fz), 1, i32(NZ) - 2));

  let hC = surfHeight[iz * NX + ix];
  if (hC < 0.05) { return; }

  let hXm = max(surfHeight[iz * NX + (ix - 1u)], hC);
  let hXp = max(surfHeight[iz * NX + (ix + 1u)], hC);
  let hZm = max(surfHeight[(iz - 1u) * NX + ix], hC);
  let hZp = max(surfHeight[(iz + 1u) * NX + ix], hC);

  let N = normalize(vec3<f32>(-(hXp - hXm) / (2.0 * CELL_H), 1.0, -(hZp - hZm) / (2.0 * CELL_H)));
  let I = normalize(vec3<f32>(-0.425, -0.818, -0.388));
  let R = refract(I, N, 0.75);

  let wx = (f32(cx) + 0.5) / f32(CAUST_W) * TANK_L;
  let wz = (f32(cz) + 0.5) / f32(CAUST_H) * TANK_W;
  let bedY = terrainHeight(wx, wz);
  let depth = max(0.05, hC - bedY);
  let t = depth / max(-R.y, 0.25);
  let hitX = wx + R.x * t;
  let hitZ = wz + R.z * t;

  let tx = i32((hitX / TANK_L) * f32(CAUST_W));
  let tz = i32((hitZ / TANK_W) * f32(CAUST_H));
  if (tx >= 0 && tx < i32(CAUST_W) && tz >= 0 && tz < i32(CAUST_H)) {
    atomicAdd(&causticAccum[u32(tz) * CAUST_W + u32(tx)], 100u);
  }
}

@compute @workgroup_size(8, 8)
fn blurCaustics(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x; let z = id.y;
  if (x >= CAUST_W || z >= CAUST_H) { return; }
  var sum = 0.0;
  var wSum = 0.0;
  for (var dz = -1; dz <= 1; dz++) {
    for (var dx = -1; dx <= 1; dx++) {
      let sx = u32(clamp(i32(x) + dx, 0, i32(CAUST_W) - 1));
      let sz = u32(clamp(i32(z) + dz, 0, i32(CAUST_H) - 1));
      let w = select(1.0, 2.0, dx == 0 && dz == 0);
      sum += f32(atomicLoad(&causticAccum[sz * CAUST_W + sx])) * 0.01 * w;
      wSum += w;
    }
  }
  causticOut[z * CAUST_W + x] = clamp(sum / wSum, 0.0, 3.8);
}
`;

  App.Scene2WGSL = {
    SCENE2_DOMAIN_WGSL,
    FLUID_STRUCTS_WGSL,
    GRID_COMPUTE_WGSL,
    PARTICLE_AND_COUPLING_WGSL
  };
})(window);
