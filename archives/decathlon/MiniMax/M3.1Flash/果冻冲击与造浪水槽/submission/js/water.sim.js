/* water.sim.js — WGSL compute kernels for the 3D MPM (APIC) water solver:
   particle->grid transfer, grid solve, grid->particle transfer, foam,
   rigid balls coupled to the fluid field, and naive surface nets for the
   free surface (free surface, spray and white water all come from particles). */
(function (global) {
  'use strict';

  global.WGSL_SIM = /* wgsl */`
struct SimU {
  grid : vec4f,   // nx, ny, nz, dx
  org  : vec4f,   // x0, y0, z0, _
  dtv  : vec4f,   // dt, gravity, time, waveAmp
  wave : vec4f,   // freq, paddleBase, waveOn, paddleVel
  mat  : vec4f,   // bulkMod, iso, numParticles, numBalls
  misc : vec4f,   // waterLevel, foamTau, rho0, paddleWidth
};

@group(0) @binding(0) var<uniform> SU : SimU;
@group(0) @binding(1) var<storage, read_write> P : array<f32>;

@group(1) @binding(0) var<storage, read_write> gMass  : array<atomic<i32>>;
@group(1) @binding(1) var<storage, read_write> gMom   : array<atomic<i32>>;
@group(1) @binding(2) var<storage, read_write> gForce : array<atomic<i32>>;
@group(1) @binding(3) var<storage, read_write> gFoamA : array<atomic<i32>>;

@group(2) @binding(0) var<storage, read_write> gVel  : array<f32>;
@group(2) @binding(1) var<storage, read_write> gRho  : array<f32>;
@group(2) @binding(2) var<storage, read_write> gFoam : array<f32>;
@group(2) @binding(3) var<storage, read_write> gDiv  : array<f32>;
@group(2) @binding(4) var<storage, read>       gSolid: array<u32>;

@group(3) @binding(0) var<storage, read_write> Balls : array<f32>;

const SM : f32 = 1.0e8;   // fixed point scale: mass & momentum
const SF : f32 = 1.0e6;   // fixed point scale: force
const SB : f32 = 1.0e6;   // fixed point scale: foam
const PSTRIDE : u32 = 32u;

fn nnodes() -> u32 {
  return u32(SU.grid.x) * u32(SU.grid.y) * u32(SU.grid.z);
}
fn nodeIndex(i: i32, j: i32, k: i32) -> u32 {
  return u32(i) + u32(SU.grid.x) * (u32(j) + u32(SU.grid.y) * u32(k));
}
fn nodePos(n: u32) -> vec3f {
  let nx = i32(SU.grid.x); let ny = i32(SU.grid.y);
  let i = i32(n % u32(nx));
  let j = i32((n / u32(nx)) % u32(ny));
  let k = i32(n / u32(nx * ny));
  return SU.org.xyz + vec3f(f32(i), f32(j), f32(k)) * SU.grid.w;
}
fn terrainH(x: f32, z: f32) -> f32 {
  let L = SU.grid.x * SU.grid.w;
  let t = clamp(x / L, 0.0, 1.0);
  var h = 0.120 + 0.055 * t + 0.090 * smoothstep(0.68, 1.0, t);
  let mx = (x - 0.35 * L) / 0.115;
  let mz = z / 0.105;
  h += 0.105 * exp(-0.5 * (mx * mx + mz * mz));
  h -= 0.020 * exp(-0.5 * (z / 0.115) * (z / 0.115));
  return h;
}
fn paddleFace(t: f32) -> f32 {
  let amp = SU.dtv.w;
  let w = SU.wave.x * 6.2831853;
  return SU.wave.y + amp * sin(w * t);
}
fn paddleVel(t: f32) -> f32 {
  let amp = SU.dtv.w;
  let w = SU.wave.x * 6.2831853;
  return amp * w * cos(w * t) * SU.wave.z;
}

// quadratic B-spline weights for the 3 point stencil
struct Spl { base: i32, w: vec3f, dw: vec3f };
fn spline1(t: f32) -> Spl {
  let b = i32(floor(t)) - 1;
  let f = t - f32(b);
  var s: Spl;
  s.base = b;
  s.w = vec3f(0.5 * (1.5 - f) * (1.5 - f), 0.75 - (f - 1.0) * (f - 1.0), 0.5 * (f - 0.5) * (f - 0.5));
  s.dw = vec3f(-(1.5 - f), -2.0 * (f - 1.0), (f - 0.5));
  return s;
}

fn solidAt(i: i32, j: i32, k: i32) -> bool {
  if (i < 0 || j < 0 || k < 0) { return true; }
  if (i >= i32(SU.grid.x) || j >= i32(SU.grid.y) || k >= i32(SU.grid.z)) { return true; }
  return gSolid[nodeIndex(i, j, k)] == 1u;
}

/* ---------------- clear ---------------- */
@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid: vec3u) {
  let n = gid.x;
  if (n >= nnodes()) { return; }
  atomicStore(&gMass[n], 0);
  atomicStore(&gFoamA[n], 0);
  atomicStore(&gMom[n * 3u + 0u], 0);
  atomicStore(&gMom[n * 3u + 1u], 0);
  atomicStore(&gMom[n * 3u + 2u], 0);
  atomicStore(&gForce[n * 3u + 0u], 0);
  atomicStore(&gForce[n * 3u + 1u], 0);
  atomicStore(&gForce[n * 3u + 2u], 0);
}

/* ---------------- particle -> grid ---------------- */
@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= u32(SU.mat.z)) { return; }
  let b = pi * PSTRIDE;
  let p = vec3f(P[b], P[b + 1u], P[b + 2u]);
  let v = vec3f(P[b + 3u], P[b + 4u], P[b + 5u]);
  let m = P[b + 24u];
  let foam = P[b + 25u];
  let C = mat3x3f(
    vec3f(P[b + 6u],  P[b + 7u],  P[b + 8u]),
    vec3f(P[b + 9u],  P[b + 10u], P[b + 11u]),
    vec3f(P[b + 12u], P[b + 13u], P[b + 14u]));
  let F = mat3x3f(
    vec3f(P[b + 15u], P[b + 16u], P[b + 17u]),
    vec3f(P[b + 18u], P[b + 19u], P[b + 20u]),
    vec3f(P[b + 21u], P[b + 22u], P[b + 23u]));

  let J = determinant(F);
  let pressure = SU.mat.x * (J - 1.0);          // negative when compressed
  let V0 = m / SU.misc.z;                        // rest volume
  let dx = SU.grid.w;

  let sx = spline1((p.x - SU.org.x) / dx);
  let sy = spline1((p.y - SU.org.y) / dx);
  let sz = spline1((p.z - SU.org.z) / dx);

  for (var a = 0; a < 3; a = a + 1) {
  for (var b = 0; b < 3; b = b + 1) {
  for (var c = 0; c < 3; c = c + 1) {
    let i = sx.base + a; let j = sy.base + b; let k = sz.base + c;
    if (i < 0 || j < 0 || k < 0) { continue; }
    if (i >= i32(SU.grid.x) || j >= i32(SU.grid.y) || k >= i32(SU.grid.z)) { continue; }
    let n = nodeIndex(i, j, k);
    let wx = sx.w[a]; let wy = sy.w[b]; let wz = sz.w[c];
    let w = wx * wy * wz;
    if (w <= 0.0) { continue; }
    let grad = vec3f(sx.dw[a] * wy * wz, wx * sy.dw[b] * wz, wx * wy * sz.dw[c]) / dx;
    let dpos = nodePos(n) - p;
    let vAffine = v + C * dpos;
    atomicAdd(&gMass[n], i32(w * m * SM));
    atomicAdd(&gMom[n * 3u + 0u], i32(w * m * vAffine.x * SM));
    atomicAdd(&gMom[n * 3u + 1u], i32(w * m * vAffine.y * SM));
    atomicAdd(&gMom[n * 3u + 2u], i32(w * m * vAffine.z * SM));
    atomicAdd(&gFoamA[n], i32(w * foam * SB));
    // elastic (pressure) force transmitted to the grid
    let f = -V0 * J * pressure * grad;
    atomicAdd(&gForce[n * 3u + 0u], i32(f.x * SF));
    atomicAdd(&gForce[n * 3u + 1u], i32(f.y * SF));
    atomicAdd(&gForce[n * 3u + 2u], i32(f.z * SF));
  }}}
}

/* ---------------- grid solve ---------------- */
@compute @workgroup_size(64)
fn gridSolve(@builtin(global_invocation_id) gid: vec3u) {
  let n = gid.x;
  if (n >= nnodes()) { return; }
  let mass = f32(atomicLoad(&gMass[n])) / SM;
  let mom = vec3f(
    f32(atomicLoad(&gMom[n * 3u + 0u])) / SM,
    f32(atomicLoad(&gMom[n * 3u + 1u])) / SM,
    f32(atomicLoad(&gMom[n * 3u + 2u])) / SM);
  let force = vec3f(
    f32(atomicLoad(&gForce[n * 3u + 0u])) / SF,
    f32(atomicLoad(&gForce[n * 3u + 1u])) / SF,
    f32(atomicLoad(&gForce[n * 3u + 2u])) / SF);

  var v = vec3f(0.0);
  if (mass > 1.0e-9) { v = mom / mass; }
  let dt = SU.dtv.x;

  // solid nodes hold no velocity
  if (gSolid[n] == 1u) {
    gVel[n * 3u + 0u] = 0.0; gVel[n * 3u + 1u] = 0.0; gVel[n * 3u + 2u] = 0.0;
    gRho[n] = 0.0; gFoam[n] = 0.0; gDiv[n] = 0.0;
    return;
  }

  v.y = v.y + SU.dtv.y * dt;
  if (mass > 1.0e-9) { v = v + dt * force / mass; }

  // ---- boundary conditions ----
  let dx = SU.grid.w;
  let nx = i32(SU.grid.x); let ny = i32(SU.grid.y); let nz = i32(SU.grid.z);
  let i = i32(n % u32(nx));
  let j = i32((n / u32(nx)) % u32(ny));
  let k = i32(n / u32(nx * ny));
  let wp = nodePos(n);

  // wave maker paddle (a moving wall that pushes the water column)
  let face = paddleFace(SU.dtv.z);
  let pvel = paddleVel(SU.dtv.z);
  if (wp.x - dx < face && wp.x > SU.wave.y - dx * 1.5) {
    if (v.x < pvel) { v.x = pvel; }
  } else if (i == 0) {
    if (v.x < 0.0) { v.x = 0.0; }
  }
  if (i == nx - 1) { if (v.x > 0.0) { v.x = 0.0; } }
  if (k == 0) { if (v.z < 0.0) { v.z = 0.0; } }
  if (k == nz - 1) { if (v.z > 0.0) { v.z = 0.0; } }
  if (j == 0) { if (v.y < 0.0) { v.y = 0.0; } }
  if (j == ny - 1) { if (v.y > 0.0) { v.y = 0.0; } }

  // free-slip against solid neighbours
  if (solidAt(i - 1, j, k) && v.x < 0.0) { v.x = 0.0; }
  if (solidAt(i + 1, j, k) && v.x > 0.0) { v.x = 0.0; }
  if (solidAt(i, j, k - 1) && v.z < 0.0) { v.z = 0.0; }
  if (solidAt(i, j, k + 1) && v.z > 0.0) { v.z = 0.0; }
  if (solidAt(i, j - 1, k) && v.y < 0.0) { v.y = 0.0; }
  if (solidAt(i, j + 1, k) && v.y > 0.0) { v.y = 0.0; }

  // gentle numerical viscosity: blend a little with the neighbours
  if (mass > 1.0e-9) {
    let ax = gVel[n * 3u + 0u]; let ay = gVel[n * 3u + 1u]; let az = gVel[n * 3u + 2u];
    if (i > 0 && i < nx - 1 && j > 0 && j < ny - 1 && k > 0 && k < nz - 1) {
      let vx = (gVel[nodeIndex(i + 1, j, k) * 3u] + gVel[nodeIndex(i - 1, j, k) * 3u]) * 0.5;
      let vy = (gVel[nodeIndex(i, j + 1, k) * 3u + 1u] + gVel[nodeIndex(i, j - 1, k) * 3u + 1u]) * 0.5;
      let vz = (gVel[nodeIndex(i, j, k + 1) * 3u + 2u] + gVel[nodeIndex(i, j, k - 1) * 3u + 2u]) * 0.5;
      let blend = 0.035;
      v = mix(v, vec3f(vx, vy, vz), blend);
    }
    gVel[n * 3u + 0u] = v.x; gVel[n * 3u + 1u] = v.y; gVel[n * 3u + 2u] = v.z;
    gRho[n] = mass / (SU.misc.z * dx * dx * dx);
    gFoam[n] = f32(atomicLoad(&gFoamA[n])) / SB;
  } else {
    gVel[n * 3u + 0u] = v.x; gVel[n * 3u + 1u] = v.y; gVel[n * 3u + 2u] = v.z;
    gRho[n] = 0.0;
    gFoam[n] = 0.0;
  }
}

/* ---------------- divergence (for foam generation) ---------------- */
@compute @workgroup_size(64)
fn gridDiv(@builtin(global_invocation_id) gid: vec3u) {
  let n = gid.x;
  if (n >= nnodes()) { return; }
  let dx = SU.grid.w;
  let nx = i32(SU.grid.x); let ny = i32(SU.grid.y); let nz = i32(SU.grid.z);
  let i = i32(n % u32(nx));
  let j = i32((n / u32(nx)) % u32(ny));
  let k = i32(n / u32(nx * ny));
  var d = 0.0;
  if (i > 0 && i < nx - 1 && j > 0 && j < ny - 1 && k > 0 && k < nz - 1) {
    let ux = (gVel[nodeIndex(i + 1, j, k) * 3u] - gVel[nodeIndex(i - 1, j, k) * 3u]) / (2.0 * dx);
    let uy = (gVel[nodeIndex(i, j + 1, k) * 3u + 1u] - gVel[nodeIndex(i, j - 1, k) * 3u + 1u]) / (2.0 * dx);
    let uz = (gVel[nodeIndex(i, j, k + 1) * 3u + 2u] - gVel[nodeIndex(i, j, k - 1) * 3u + 2u]) / (2.0 * dx);
    d = ux + uy + uz;
  }
  gDiv[n] = d;
}

/* ---------------- grid -> particle ---------------- */
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= u32(SU.mat.z)) { return; }
  let b = pi * PSTRIDE;
  let p = vec3f(P[b], P[b + 1u], P[b + 2u]);
  let dt = SU.dtv.x;
  let dx = SU.grid.w;

  let sx = spline1((p.x - SU.org.x) / dx);
  let sy = spline1((p.y - SU.org.y) / dx);
  let sz = spline1((p.z - SU.org.z) / dx);

  var vel = vec3f(0.0);
  var C = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
  var rho = 0.0;
  var foamN = 0.0;
  var divv = 0.0;
  var vmag = 0.0;

  for (var a = 0; a < 3; a = a + 1) {
  for (var b2 = 0; b2 < 3; b2 = b2 + 1) {
  for (var c = 0; c < 3; c = c + 1) {
    let i = sx.base + a; let j = sy.base + b2; let k = sz.base + c;
    if (i < 0 || j < 0 || k < 0) { continue; }
    if (i >= i32(SU.grid.x) || j >= i32(SU.grid.y) || k >= i32(SU.grid.z)) { continue; }
    let n = nodeIndex(i, j, k);
    let w = sx.w[a] * sy.w[b2] * sz.w[c];
    let u = vec3f(gVel[n * 3u], gVel[n * 3u + 1u], gVel[n * 3u + 2u]);
    let dpos = nodePos(n) - p;
    vel = vel + w * u;
    C = C + mat3x3f(u * dpos.x, u * dpos.y, u * dpos.z) * w;
    rho = rho + w * gRho[n];
    foamN = foamN + w * gFoam[n];
    divv = divv + w * gDiv[n];
    vmag = vmag + w * length(u);
  }}}

  vel = vel / 1.0;
  let scale = 4.0 / (dx * dx);
  let Cn = mat3x3f(C[0] * scale, C[1] * scale, C[2] * scale);

  // deformation gradient update (MPM elasticity)
  let F = mat3x3f(
    vec3f(P[b + 15u], P[b + 16u], P[b + 17u]),
    vec3f(P[b + 18u], P[b + 19u], P[b + 20u]),
    vec3f(P[b + 21u], P[b + 22u], P[b + 23u]));
  let I = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  let Fn = (I + Cn * dt) * F;

  // position update
  let pn = p + vel * dt;

  // foam: compression of the flow and airborne spray become white water
  var foam = P[b + 25u];
  let comp = max(0.0, -divv);
  foam = foam + comp * 0.9 * dt;
  let speed = length(vel);
  if (rho < 0.45 && speed > 0.9) {
    foam = foam + (0.45 - rho) * speed * 0.55 * dt;
  }
  foam = foam * exp(-dt / max(SU.misc.y, 0.05));
  foam = clamp(foam, 0.0, 1.0);

  P[b] = pn.x; P[b + 1u] = pn.y; P[b + 2u] = pn.z;
  P[b + 3u] = vel.x; P[b + 4u] = vel.y; P[b + 5u] = vel.z;
  P[b + 6u] = Cn[0][0]; P[b + 7u] = Cn[0][1]; P[b + 8u] = Cn[0][2];
  P[b + 9u] = Cn[1][0]; P[b + 10u] = Cn[1][1]; P[b + 11u] = Cn[1][2];
  P[b + 12u] = Cn[2][0]; P[b + 13u] = Cn[2][1]; P[b + 14u] = Cn[2][2];
  P[b + 15u] = Fn[0][0]; P[b + 16u] = Fn[0][1]; P[b + 17u] = Fn[0][2];
  P[b + 18u] = Fn[1][0]; P[b + 19u] = Fn[1][1]; P[b + 20u] = Fn[1][2];
  P[b + 21u] = Fn[2][0]; P[b + 22u] = Fn[2][1]; P[b + 23u] = Fn[2][2];
  P[b + 25u] = foam;
  P[b + 26u] = rho;
  P[b + 27u] = vmag;
}

/* ---------------- rigid balls coupled to the fluid ---------------- */
fn sampleGridVel(p: vec3f) -> vec3f {
  let dx = SU.grid.w;
  let g = (p - SU.org.xyz) / dx;
  let i0 = i32(floor(g.x)); let j0 = i32(floor(g.y)); let k0 = i32(floor(g.z));
  let fx = g.x - f32(i0); let fy = g.y - f32(j0); let fz = g.z - f32(k0);
  var acc = vec3f(0.0);
  for (var a = 0; a < 2; a = a + 1) {
  for (var b2 = 0; b2 < 2; b2 = b2 + 1) {
  for (var c = 0; c < 2; c = c + 1) {
    let i = i0 + a; let j = j0 + b2; let k = k0 + c;
    if (i < 0 || j < 0 || k < 0) { continue; }
    if (i >= i32(SU.grid.x) || j >= i32(SU.grid.y) || k >= i32(SU.grid.z)) { continue; }
    let n = nodeIndex(i, j, k);
    let w = select(1.0 - fx, fx, a == 1) * select(1.0 - fy, fy, b2 == 1) * select(1.0 - fz, fz, c == 1);
    acc = acc + w * vec3f(gVel[n * 3u], gVel[n * 3u + 1u], gVel[n * 3u + 2u]);
  }}}
  return acc;
}
fn sampleGridRho(p: vec3f) -> f32 {
  let dx = SU.grid.w;
  let g = (p - SU.org.xyz) / dx;
  let i0 = i32(floor(g.x)); let j0 = i32(floor(g.y)); let k0 = i32(floor(g.z));
  let fx = g.x - f32(i0); let fy = g.y - f32(j0); let fz = g.z - f32(k0);
  var acc = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
  for (var b2 = 0; b2 < 2; b2 = b2 + 1) {
  for (var c = 0; c < 2; c = c + 1) {
    let i = i0 + a; let j = j0 + b2; let k = k0 + c;
    if (i < 0 || j < 0 || k < 0) { continue; }
    if (i >= i32(SU.grid.x) || j >= i32(SU.grid.y) || k >= i32(SU.grid.z)) { continue; }
    let w = select(1.0 - fx, fx, a == 1) * select(1.0 - fy, fy, b2 == 1) * select(1.0 - fz, fz, c == 1);
    acc = acc + w * gRho[nodeIndex(i, j, k)];
  }}}
  return acc;
}
// fraction of the ball that lies below the free surface
fn submergedFraction(c: vec3f, r: f32) -> f32 {
  let dx = SU.grid.w;
  // walk up from the ball centre until the fluid density drops away
  var yTop = c.y;
  var found = false;
  for (var s = 0; s < 14; s = s + 1) {
    let y = c.y + f32(s) * dx * 0.5;
    let rho = sampleGridRho(vec3f(c.x, y, c.z));
    if (rho < 0.42) { found = true; yTop = y; break; }
    yTop = y;
  }
  if (!found) { return 1.0; }
  if (sampleGridRho(vec3f(c.x, c.y, c.z)) < 0.30) { return 0.0; }
  let d = clamp((yTop - c.y) / r, -1.0, 1.0);
  return clamp((2.0 - 3.0 * d + d * d * d) * 0.25, 0.0, 1.0);
}

@compute @workgroup_size(1)
fn stepBalls() {
  let dt = SU.dtv.x;
  let n = u32(SU.mat.w);
  let rho0 = SU.misc.z;
  let g = SU.dtv.y;

  for (var i = 0u; i < n; i = i + 1u) {
    let b = i * 24u;
    if (Balls[b + 19u] < 0.5) { continue; }
    var pos = vec3f(Balls[b], Balls[b + 1u], Balls[b + 2u]);
    var vel = vec3f(Balls[b + 3u], Balls[b + 4u], Balls[b + 5u]);
    let r = Balls[b + 13u];
    let relD = Balls[b + 14u];
    let V = 4.0 / 3.0 * 3.14159265 * r * r * r;
    let m = relD * rho0 * V;

    let fs = submergedFraction(pos, r);
    let ufl = sampleGridVel(pos);
    let vrel = vel - ufl;

    // buoyancy from the hydrostatic pressure of the fluid column
    var acc = vec3f(0.0, g, 0.0);
    acc.y = acc.y + rho0 * (-g) * fs * V / m;

    // quadratic drag against the local fluid velocity
    let area = 3.14159265 * r * r;
    let cd = 0.9;
    let sp = length(vrel);
    if (sp > 1.0e-4) {
      let fd = -0.5 * rho0 * cd * area * sp * vrel;
      acc = acc + fd / m;
    }
    // gentle lift from the flow gradient (waves push the floaters up)
    let uUp = sampleGridVel(pos + vec3f(0.0, r * 1.2, 0.0));
    let uDn = sampleGridVel(pos - vec3f(0.0, r * 1.2, 0.0));
    acc = acc + vec3f(0.0, (uUp.y - uDn.y) * 0.9 * rho0 * V / m, 0.0);

    vel = vel + acc * dt;
    vel = vel * (1.0 - 0.35 * dt);

    // tank walls
    let L = SU.grid.x * SU.grid.w;
    let W = SU.grid.z * SU.grid.w;
    let H = SU.grid.y * SU.grid.w;
    let z0 = SU.org.z;
    let minX = SU.org.x + r; let maxX = SU.org.x + L - r;
    let minZ = z0 + r; let maxZ = z0 + W - r;
    if (pos.x < minX) { pos.x = minX; if (vel.x < 0.0) { vel.x = -vel.x * 0.25; } }
    if (pos.x > maxX) { pos.x = maxX; if (vel.x > 0.0) { vel.x = -vel.x * 0.25; } }
    if (pos.z < minZ) { pos.z = minZ; if (vel.z < 0.0) { vel.z = -vel.z * 0.25; } }
    if (pos.z > maxZ) { pos.z = maxZ; if (vel.z > 0.0) { vel.z = -vel.z * 0.25; } }
    // floor / terrain
    let th = terrainH(pos.x, pos.z) + r;
    if (pos.y < th) {
      pos.y = th;
      if (vel.y < 0.0) { vel.y = -vel.y * 0.18; }
      // roll along the bed
      let gx = (terrainH(pos.x + 0.02, pos.z) - terrainH(pos.x - 0.02, pos.z)) / 0.04;
      let gz = (terrainH(pos.x, pos.z + 0.02) - terrainH(pos.x, pos.z - 0.02)) / 0.04;
      vel.x = vel.x + gx * 0.35 * dt * 9.0;
      vel.z = vel.z + gz * 0.35 * dt * 9.0;
    }
    if (pos.y > H - r) { pos.y = H - r; if (vel.y > 0.0) { vel.y = -vel.y * 0.2; } }

    pos = pos + vel * dt;
    Balls[b] = pos.x; Balls[b + 1u] = pos.y; Balls[b + 2u] = pos.z;
    Balls[b + 3u] = vel.x; Balls[b + 4u] = vel.y; Balls[b + 5u] = vel.z;
  }

  // ball vs ball
  for (var i = 0u; i < n; i = i + 1u) {
    let bi = i * 24u;
    let pi = vec3f(Balls[bi], Balls[bi + 1u], Balls[bi + 2u]);
    let ri = Balls[bi + 13u];
    let vi = vec3f(Balls[bi + 3u], Balls[bi + 4u], Balls[bi + 5u]);
    for (var j = i + 1u; j < n; j = j + 1u) {
      let bj = j * 24u;
      let pj = vec3f(Balls[bj], Balls[bj + 1u], Balls[bj + 2u]);
      let rj = Balls[bj + 13u];
      let vj = vec3f(Balls[bj + 3u], Balls[bj + 4u], Balls[bj + 5u]);
      var d = pj - pi;
      let rr = ri + rj;
      let l = length(d);
      if (l > rr || l < 1.0e-6) { continue; }
      let nrm = d / l;
      let pen = rr - l;
      let mi = Balls[bi + 14u] * 1000.0 * 4.0 / 3.0 * 3.14159265 * ri * ri * ri;
      let mj = Balls[bj + 14u] * 1000.0 * 4.0 / 3.0 * 3.14159265 * rj * rj * rj;
      let tm = 1.0 / mi + 1.0 / mj;
      Balls[bi] = Balls[bi] - nrm.x * pen / tm * (1.0 / mi);
      Balls[bi + 1u] = Balls[bi + 1u] - nrm.y * pen / tm * (1.0 / mi);
      Balls[bi + 2u] = Balls[bi + 2u] - nrm.z * pen / tm * (1.0 / mi);
      Balls[bj] = Balls[bj] + nrm.x * pen / tm * (1.0 / mj);
      Balls[bj + 1u] = Balls[bj + 1u] + nrm.y * pen / tm * (1.0 / mj);
      Balls[bj + 2u] = Balls[bj + 2u] + nrm.z * pen / tm * (1.0 / mj);
      let rv = vj - vi;
      let vn = dot(rv, nrm);
      if (vn < 0.0) {
        let jj = -(1.0 + 0.25) * vn / tm;
        Balls[bi + 3u] = Balls[bi + 3u] - nrm.x * jj / mi;
        Balls[bi + 4u] = Balls[bi + 4u] - nrm.y * jj / mi;
        Balls[bi + 5u] = Balls[bi + 5u] - nrm.z * jj / mi;
        Balls[bj + 3u] = Balls[bj + 3u] + nrm.x * jj / mj;
        Balls[bj + 4u] = Balls[bj + 4u] + nrm.y * jj / mj;
        Balls[bj + 5u] = Balls[bj + 5u] + nrm.z * jj / mj;
      }
    }
  }
}
`;
})(window);
