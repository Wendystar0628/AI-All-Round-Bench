'use strict';
/* ---------------------------------------------------------------------------
   Fluid: 3D particle-in-cell / FLIP water solved in WebGPU compute shaders.
   - collocated MAC grid, pressure projection with Jacobi iterations
   - free surface / splashes / whitewater all derived from particle state
   - rigid balls are two-way coupled: they are solid cells in the grid, get
     pressure + drag forces from the water, and push particles out of their way
--------------------------------------------------------------------------- */

const FLUID_H = 0.024;
const FLUID_NX = 86, FLUID_NY = 40, FLUID_NZ = 36;
const FLUID_PPC = 3;
const FLUID_MAX_BALLS = 24;
const FLUID_MAX_PARTICLES = 200000;

const FLUID_HEAD = /* wgsl */`
struct FP {
  gridSize : vec4u,   // nx, ny, nz, numParticles
  dom      : vec4f,   // minX, minY, minZ, h
  grav     : vec4f,   // gx, gy, gz, dt
  water    : vec4f,   // restLevel, foamRate, numBalls, time
  paddle   : vec4f,   // x, velX, amplitude, freq
  misc     : vec4f,   // flipBlend, pressIters, maxSpeed, foamScale
};
@group(0) @binding(0) var<uniform> P : FP;
@group(0) @binding(1) var<storage, read_write> pPos     : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> pVel     : array<vec4f>;
@group(0) @binding(3) var<storage, read_write> cellVel  : array<vec4f>;
@group(0) @binding(4) var<storage, read_write> cellOld  : array<vec4f>;
@group(0) @binding(5) var<storage, read_write> cellType : array<u32>;
@group(0) @binding(6) var<storage, read_write> acc      : array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> foamPos  : array<vec4f>;
@group(0) @binding(8) var<storage, read_write> foamVel  : array<vec4f>;

const SCALE : f32 = 262144.0;

fn ci(c : vec3u) -> u32 { return c.x + P.gridSize.x * (c.y + P.gridSize.y * c.z); }
fn inGrid(c : vec3i) -> bool {
  return c.x >= 0 && c.y >= 0 && c.z >= 0 &&
         c.x < i32(P.gridSize.x) && c.y < i32(P.gridSize.y) && c.z < i32(P.gridSize.z);
}
fn cellOf(c : vec3i) -> u32 { return u32(c.x) + P.gridSize.x * (u32(c.y) + P.gridSize.y * u32(c.z)); }
fn accIdx(i : u32, c : u32) -> u32 { return i * 4u + c; }

fn terrainH(x : f32, z : f32) -> f32 {
  var h = 0.34 * smoothstep(1.35, 1.90, x);
  let ridge = exp(-pow(x - 0.95, 2.0) / (2.0 * 0.10 * 0.10));
  h += 0.075 * ridge * smoothstep(0.02, 0.14, z) * (1.0 - smoothstep(0.56, 0.72, z));
  return h;
}

fn gather(pos : vec3f) -> vec3f {
  let c = (pos - P.dom.xyz) / P.dom.w - vec3f(0.5);
  let base = vec3i(floor(c));
  let f = c - vec3f(base);
  var out = vec3f(0.0);
  var wsum = 0.0;
  for (var dk = 0; dk < 2; dk++) {
    for (var dj = 0; dj < 2; dj++) {
      for (var di = 0; di < 2; di++) {
        let cc = base + vec3i(di, dj, dk);
        if (!inGrid(cc)) { continue; }
        let w = (select(1.0 - f.x, f.x, di == 1)) *
                (select(1.0 - f.y, f.y, dj == 1)) *
                (select(1.0 - f.z, f.z, dk == 1));
        out += cellVel[cellOf(cc)].xyz * w;
        wsum += w;
      }
    }
  }
  if (wsum > 1e-5) { return out / wsum; }
  return vec3f(0.0);
}

fn divergenceAt(gid : vec3u, u : vec3f) -> f32 {
  let h = P.dom.w;
  var d = 0.0;
  if (gid.x + 1u < P.gridSize.x) {
    let j = ci(gid + vec3u(1u, 0u, 0u));
    d += select(0.0, cellVel[j].x - u.x, cellType[j] != 0u) / h;
  }
  if (gid.x > 0u) {
    let j = ci(gid - vec3u(1u, 0u, 0u));
    d += select(0.0, u.x - cellVel[j].x, cellType[j] != 0u) / h;
  }
  if (gid.y + 1u < P.gridSize.y) {
    let j = ci(gid + vec3u(0u, 1u, 0u));
    d += select(0.0, cellVel[j].y - u.y, cellType[j] != 0u) / h;
  }
  if (gid.y > 0u) {
    let j = ci(gid - vec3u(0u, 1u, 0u));
    d += select(0.0, u.y - cellVel[j].y, cellType[j] != 0u) / h;
  }
  if (gid.z + 1u < P.gridSize.z) {
    let j = ci(gid + vec3u(0u, 0u, 1u));
    d += select(0.0, cellVel[j].z - u.z, cellType[j] != 0u) / h;
  }
  if (gid.z > 0u) {
    let j = ci(gid - vec3u(0u, 0u, 1u));
    d += select(0.0, u.z - cellVel[j].z, cellType[j] != 0u) / h;
  }
  return d;
}
`;

const FLUID_G1 = /* wgsl */`
@group(1) @binding(0) var<storage, read_write> press    : array<f32>;
@group(1) @binding(1) var<storage, read_write> pressTmp : array<f32>;
`;

const FLUID_G2 = /* wgsl */`
@group(2) @binding(0) var<storage, read_write> ballPos  : array<vec4f>;
@group(2) @binding(1) var<storage, read_write> ballVel  : array<vec4f>;
@group(2) @binding(2) var<storage, read_write> ballAng  : array<vec4f>;
@group(2) @binding(3) var<storage, read_write> ballQuat : array<vec4f>;
`;

const FLUID_G3 = /* wgsl */`
@group(3) @binding(0) var<storage, read_write> ballForce: array<vec4f>;
@group(3) @binding(1) var<storage, read_write> ballTorq : array<vec4f>;
`;

const K_CLEAR = /* wgsl */`
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (any(gid >= P.gridSize.xyz)) { return; }
  let i = ci(gid);
  cellVel[i] = vec4f(0.0);
  cellOld[i] = vec4f(0.0);
  cellType[i] = 0u;
  atomicStore(&acc[accIdx(i, 0u)], 0i);
  atomicStore(&acc[accIdx(i, 1u)], 0i);
  atomicStore(&acc[accIdx(i, 2u)], 0i);
  atomicStore(&acc[accIdx(i, 3u)], 0i);
}
`;

const K_SOLID = /* wgsl */`
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (any(gid >= P.gridSize.xyz)) { return; }
  let n = P.gridSize.xyz;
  let i = ci(gid);
  let p = P.dom.xyz + (vec3f(gid) + 0.5) * P.dom.w;
  var t = 0u;
  var v = vec3f(0.0);
  if (gid.x == 0u || gid.y == 0u || gid.z == 0u ||
      gid.x == n.x - 1u || gid.y == n.y - 1u || gid.z == n.z - 1u) {
    t = 2u;
  } else {
    if (p.y < terrainH(p.x, p.z)) { t = 2u; }
    if (p.x < P.paddle.x && p.y < 0.56) { t = 2u; v = vec3f(P.paddle.y, 0.0, 0.0); }
    let nb = i32(P.water.z);
    for (var b = 0; b < nb; b++) {
      let bc = ballPos[b].xyz;
      let d = length(p - bc);
      if (d < ballPos[b].w) {
        t = 2u;
        v = ballVel[b].xyz + cross(ballAng[b].xyz, p - bc);
      }
    }
  }
  if (t == 2u) {
    cellType[i] = 2u;
    cellVel[i] = vec4f(v, 1.0);
  }
}
`;

const K_P2G = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  let pos = pPos[pi].xyz;
  let vel = pVel[pi].xyz;
  let c = (pos - P.dom.xyz) / P.dom.w - vec3f(0.5);
  let base = vec3i(floor(c));
  let f = c - vec3f(base);
  for (var dk = 0; dk < 2; dk++) {
    for (var dj = 0; dj < 2; dj++) {
      for (var di = 0; di < 2; di++) {
        let cc = base + vec3i(di, dj, dk);
        if (!inGrid(cc)) { continue; }
        let w = (select(1.0 - f.x, f.x, di == 1)) *
                (select(1.0 - f.y, f.y, dj == 1)) *
                (select(1.0 - f.z, f.z, dk == 1));
        let i = cellOf(cc);
        if (cellType[i] == 2u) { continue; }
        atomicAdd(&acc[accIdx(i, 0u)], i32(vel.x * w * SCALE));
        atomicAdd(&acc[accIdx(i, 1u)], i32(vel.y * w * SCALE));
        atomicAdd(&acc[accIdx(i, 2u)], i32(vel.z * w * SCALE));
        atomicAdd(&acc[accIdx(i, 3u)], i32(w * SCALE));
      }
    }
  }
}
`;

const K_NORMALIZE = /* wgsl */`
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (any(gid >= P.gridSize.xyz)) { return; }
  let i = ci(gid);
  if (cellType[i] == 2u) { return; }
  let w = f32(atomicLoad(&acc[accIdx(i, 3u)])) / SCALE;
  if (w > 1e-5) {
    cellType[i] = 1u;
    cellVel[i] = vec4f(f32(atomicLoad(&acc[accIdx(i, 0u)])) / SCALE / w,
                       f32(atomicLoad(&acc[accIdx(i, 1u)])) / SCALE / w,
                       f32(atomicLoad(&acc[accIdx(i, 2u)])) / SCALE / w, 1.0);
  } else {
    cellVel[i] = vec4f(0.0, 0.0, 0.0, 0.0);
  }
  // FLIP needs the pre-projection grid velocity
  cellOld[i] = cellVel[i];
}
`;

const K_PRESSURE = /* wgsl */`
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (any(gid >= P.gridSize.xyz)) { return; }
  let i = ci(gid);
  if (cellType[i] != 1u) { pressTmp[i] = 0.0; return; }
  let h = P.dom.w;
  let dt = P.grav.w;
  let rhs = divergenceAt(gid, cellVel[i].xyz) * h * h / max(dt, 1e-5);
  var sum = 0.0;
  var count = 0.0;
  if (gid.x + 1u < P.gridSize.x) {
    let j = ci(gid + vec3u(1u, 0u, 0u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (gid.x > 0u) {
    let j = ci(gid - vec3u(1u, 0u, 0u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (gid.y + 1u < P.gridSize.y) {
    let j = ci(gid + vec3u(0u, 1u, 0u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (gid.y > 0u) {
    let j = ci(gid - vec3u(0u, 1u, 0u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (gid.z + 1u < P.gridSize.z) {
    let j = ci(gid + vec3u(0u, 0u, 1u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (gid.z > 0u) {
    let j = ci(gid - vec3u(0u, 0u, 1u));
    if (cellType[j] == 1u) { sum += press[j]; count += 1.0; }
    else if (cellType[j] == 0u) { count += 1.0; }
  }
  if (count < 0.5) { pressTmp[i] = 0.0; return; }
  pressTmp[i] = (sum - rhs) / count;
}
`;

const K_GRADIENT = /* wgsl */`
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (any(gid >= P.gridSize.xyz)) { return; }
  let i = ci(gid);
  if (cellType[i] != 1u) { return; }
  let h = P.dom.w;
  let dt = P.grav.w;
  let p0 = press[i];
  var g = vec3f(0.0);
  if (gid.x + 1u < P.gridSize.x) {
    let j = ci(gid + vec3u(1u, 0u, 0u));
    g.x += select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  if (gid.x > 0u) {
    let j = ci(gid - vec3u(1u, 0u, 0u));
    g.x -= select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  if (gid.y + 1u < P.gridSize.y) {
    let j = ci(gid + vec3u(0u, 1u, 0u));
    g.y += select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  if (gid.y > 0u) {
    let j = ci(gid - vec3u(0u, 1u, 0u));
    g.y -= select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  if (gid.z + 1u < P.gridSize.z) {
    let j = ci(gid + vec3u(0u, 0u, 1u));
    g.z += select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  if (gid.z > 0u) {
    let j = ci(gid - vec3u(0u, 0u, 1u));
    g.z -= select(0.0, press[j] - p0, cellType[j] == 1u);
  }
  cellVel[i] = vec4f(cellVel[i].xyz - g * dt / h, 1.0);
}
`;

const K_ADVECT = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  var pos = pPos[pi].xyz;
  let vel = pVel[pi].xyz;
  pos += vel * P.grav.w;
  let lo = P.dom.xyz + vec3f(P.dom.w * 1.01);
  let hi = P.dom.xyz + vec3f(P.gridSize.xyz) * P.dom.w - vec3f(P.dom.w * 1.01);
  pos = clamp(pos, lo, hi);
  pPos[pi] = vec4f(pos, 0.0);
}
`;

const K_G2P = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  let pos = pPos[pi].xyz;
  let c = (pos - P.dom.xyz) / P.dom.w - vec3f(0.5);
  let base = vec3i(floor(c));
  let f = c - vec3f(base);
  var vn = vec3f(0.0);
  var vo = vec3f(0.0);
  var wsum = 0.0;
  for (var dk = 0; dk < 2; dk++) {
    for (var dj = 0; dj < 2; dj++) {
      for (var di = 0; di < 2; di++) {
        let cc = base + vec3i(di, dj, dk);
        if (!inGrid(cc)) { continue; }
        let w = (select(1.0 - f.x, f.x, di == 1)) *
                (select(1.0 - f.y, f.y, dj == 1)) *
                (select(1.0 - f.z, f.z, dk == 1));
        let i = cellOf(cc);
        vn += cellVel[i].xyz * w;
        vo += cellOld[i].xyz * w;
        wsum += w;
      }
    }
  }
  if (wsum > 1e-5) { vn /= wsum; vo /= wsum; }
  var v = pVel[pi].xyz + (vn - vo);
  v = mix(v, vn, P.misc.x);
  let sp = length(v);
  if (sp > P.misc.z) { v *= P.misc.z / sp; }
  pVel[pi] = vec4f(v, 0.0);
}
`;

const K_COLLIDE = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  var pos = pPos[pi].xyz;
  var vel = pVel[pi].xyz;
  let nb = i32(P.water.z);
  for (var b = 0; b < nb; b++) {
    let bc = ballPos[b].xyz;
    let r = ballPos[b].w;
    let d = pos - bc;
    let dl = length(d);
    if (dl < r && dl > 1e-6) {
      let n = d / dl;
      pos = bc + n * (r + 0.0006);
      let bv = ballVel[b].xyz + cross(ballAng[b].xyz, n * r);
      let rel = vel - bv;
      let vn = dot(rel, n);
      if (vn < 0.0) { vel -= n * vn * 1.3; }
    }
  }
  pPos[pi] = vec4f(pos, 0.0);
  pVel[pi] = vec4f(vel, 0.0);
}
`;

const K_BALLFORCE = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let b = gid.x;
  if (b >= u32(P.water.z)) { return; }
  let c = ballPos[b].xyz;
  let r = ballPos[b].w;
  let h = P.dom.w;
  var F = vec3f(0.0);
  var T = vec3f(0.0);
  let ext = r + h * 1.7;
  let lo = vec3i(floor((c - vec3f(ext) - P.dom.xyz) / h));
  let hi = vec3i(ceil((c + vec3f(ext) - P.dom.xyz) / h));
  for (var k = lo.z; k <= hi.z; k++) {
    for (var j = lo.y; j <= hi.y; j++) {
      for (var i = lo.x; i <= hi.x; i++) {
        let cc = vec3i(i, j, k);
        if (!inGrid(cc)) { continue; }
        let idx = cellOf(cc);
        if (cellType[idx] != 1u) { continue; }
        let cp = P.dom.xyz + (vec3f(cc) + 0.5) * h;
        let d = cp - c;
        let dl = length(d);
        if (dl < r * 0.9 || dl > r + h * 1.8) { continue; }
        let n = d / max(dl, 1e-5);
        F += -press[idx] * n * h * h;
        let rel = cellVel[idx].xyz - ballVel[b].xyz - cross(ballAng[b].xyz, d);
        F += rel * 42.0 * h * h * h * 1000.0;
        T += cross(n * r, rel * 42.0 * h * h * h * 1000.0) * 0.2;
      }
    }
  }
  ballForce[b] = vec4f(F, 0.0);
  ballTorq[b] = vec4f(T, 0.0);
}
`;

const K_BALLINTEGRATE = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let b = gid.x;
  if (b >= u32(P.water.z)) { return; }
  let dt = P.grav.w;
  var v = ballVel[b].xyz + (P.grav.xyz + ballForce[b].xyz * ballVel[b].w) * dt;
  var p = ballPos[b].xyz + v * dt;
  var w = ballAng[b].xyz + ballTorq[b].xyz * ballAng[b].w * dt;
  let r = ballPos[b].w;
  let lo = P.dom.xyz + vec3f(P.dom.w * 1.2) + vec3f(r);
  let hi = P.dom.xyz + vec3f(P.gridSize.xyz) * P.dom.w - vec3f(P.dom.w * 1.2) - vec3f(r);
  let rest = 0.32;
  for (var a = 0; a < 3; a++) {
    if (p[a] < lo[a]) { p[a] = lo[a]; if (v[a] < 0.0) { v[a] = -v[a] * rest; } w *= 0.92; }
    if (p[a] > hi[a]) { p[a] = hi[a]; if (v[a] > 0.0) { v[a] = -v[a] * rest; } w *= 0.92; }
  }
  let th = terrainH(p.x, p.z);
  let pen = r - (p.y - th);
  if (pen > 0.0) {
    p.y += pen;
    let e = 0.01;
    let hx = (terrainH(p.x + e, p.z) - terrainH(p.x - e, p.z)) / (2.0 * e);
    let hz = (terrainH(p.x, p.z + e) - terrainH(p.x, p.z - e)) / (2.0 * e);
    let n = normalize(vec3f(-hx, 1.0, -hz));
    let vn = dot(v, n);
    if (vn < 0.0) { v -= n * vn * (1.0 + rest); w *= 0.9; }
  }
  ballVel[b] = vec4f(v, ballVel[b].w);
  ballPos[b] = vec4f(p, ballPos[b].w);
  ballAng[b] = vec4f(w, ballAng[b].w);
  let wl = length(w);
  if (wl > 1e-6) {
    let axis = w / wl;
    let ang = wl * dt;
    let dq = vec4f(axis * sin(ang * 0.5), cos(ang * 0.5));
    let q = ballQuat[b];
    ballQuat[b] = vec4f(
      q.w * dq.x + q.x * dq.w + q.y * dq.z - q.z * dq.y,
      q.w * dq.y - q.x * dq.z + q.y * dq.w + q.z * dq.x,
      q.w * dq.z + q.x * dq.y - q.y * dq.x + q.z * dq.w,
      q.w * dq.w - q.x * dq.x - q.y * dq.y - q.z * dq.z);
  }
}
`;

const K_BALLPAIR = /* wgsl */`
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let nb = i32(P.water.z);
  for (var i = 0; i < nb; i++) {
    for (var j = i + 1; j < nb; j++) {
      let pa = ballPos[i].xyz;
      let pb = ballPos[j].xyz;
      let d = pb - pa;
      let dl = length(d);
      let rr = ballPos[i].w + ballPos[j].w;
      if (dl >= rr || dl < 1e-6) { continue; }
      let n = d / dl;
      let pen = rr - dl;
      let wa = ballVel[i].w;
      let wb = ballVel[j].w;
      let ws = wa + wb;
      ballPos[i] = vec4f(pa - n * pen * (wa / ws), ballPos[i].w);
      ballPos[j] = vec4f(pb + n * pen * (wb / ws), ballPos[j].w);
      let va = ballVel[i].xyz + cross(ballAng[i].xyz, n * ballPos[i].w);
      let vb = ballVel[j].xyz + cross(ballAng[j].xyz, -n * ballPos[j].w);
      let rel = vb - va;
      let vn = dot(rel, n);
      if (vn < 0.0) {
        let jn = -(1.3) * vn / (ws * 1.0);
        ballVel[i] = vec4f(ballVel[i].xyz - n * jn * wa, wa);
        ballVel[j] = vec4f(ballVel[j].xyz + n * jn * wb, wb);
      }
    }
  }
}
`;

const K_FOAM = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  let dt = P.grav.w;
  var fp = foamPos[pi];
  var fv = foamVel[pi];
  if (fp.w > 0.0) {
    let u = gather(fp.xyz);
    fv.xyz += (u - fv.xyz) * clamp(3.0 * dt, 0.0, 1.0);
    fv.y -= 2.2 * dt;
    fp.xyz += fv.xyz * dt;
    fp.w -= dt * 0.55;
    if (fp.y < terrainH(fp.x, fp.z) + 0.01) { fp.w = min(fp.w, 0.0); }
  }
  let pos = pPos[pi].xyz;
  let vel = pVel[pi].xyz;
  let sp = length(vel);
  let above = pos.y - P.water.x;
  let pot = smoothstep(0.9, 3.2, sp) * smoothstep(-0.12, 0.06, above) * P.misc.w;
  if (pot > 0.25) {
    fp = vec4f(pos + vec3f(0.0, 0.004, 0.0), min(1.0, pot * 1.6));
    fv = vec4f(vel * 0.55, 0.0);
  }
  foamPos[pi] = fp;
  foamVel[pi] = fv;
}
`;

const K_SETTLE = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let pi = gid.x;
  if (pi >= P.gridSize.w) { return; }
  pVel[pi] = vec4f(0.0, 0.0, 0.0, 0.0);
  foamPos[pi] = vec4f(foamPos[pi].xyz, 0.0);
}
`;

const K_CLEAR_FORCE = /* wgsl */`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let b = gid.x;
  if (b >= u32(P.water.z)) { return; }
  ballForce[b] = vec4f(0.0);
  ballTorq[b] = vec4f(0.0);
}
`;

class FluidSim {
  constructor(app) {
    this.app = app;
    this.gfx = app.gfx;
    this.nx = FLUID_NX; this.ny = FLUID_NY; this.nz = FLUID_NZ;
    this.h = FLUID_H;
    this.numParticles = 0;
    this.numBalls = 0;
    this.params = {
      restLevel: 0.42,
      waveAmp: 0.055,
      waveFreq: 0.95,
      waving: false,
      wavePhase: 0,
      flipBlend: 0.06,
      pressIters: 56,
      maxSpeed: 7.0,
    };
    this.time = 0;
    this.dt = 1 / 120;
    this.ballDefs = [];
    this.groups = [
      { density: 300, color: [1.0, 0.79, 0.29] },
      { density: 650, color: [1.0, 0.54, 0.36] },
      { density: 1000, color: [0.36, 0.89, 0.63] },
      { density: 1400, color: [0.31, 0.70, 1.0] },
      { density: 2200, color: [0.91, 0.36, 1.0] },
    ];
    this.ready = false;
  }

  async init() {
    const g = this.gfx, dev = g.device;
    const nCells = this.nx * this.ny * this.nz;
    this.nCells = nCells;

    const rng = makeRng(1337);
    const pts = [];
    const rest = this.params.restLevel;
    for (let k = 1; k < this.nz - 1; k++) {
      for (let j = 1; j < this.ny - 1; j++) {
        for (let i = 1; i < this.nx - 1; i++) {
          const cx = (i + 0.5) * this.h, cy = (j + 0.5) * this.h, cz = (k + 0.5) * this.h;
          if (cy > rest) continue;
          if (cy < this.terrainH(cx, cz)) continue;
          for (let p = 0; p < FLUID_PPC; p++) {
            pts.push(cx + (rng() - 0.5) * this.h * 0.9,
              cy + (rng() - 0.5) * this.h * 0.9,
              cz + (rng() - 0.5) * this.h * 0.9, 0);
          }
        }
      }
    }
    this.numParticles = Math.min(pts.length / 4, FLUID_MAX_PARTICLES);
    const posArr = new Float32Array(pts);
    const velArr = new Float32Array(pts.length);
    this.pPos = g.storage(posArr.byteLength, posArr);
    this.pVel = g.storage(velArr.byteLength, velArr);
    this.foamPos = g.storage(posArr.byteLength, posArr.slice());
    this.foamVel = g.storage(velArr.byteLength, velArr);

    const f4 = new Float32Array(nCells * 4);
    this.cellVel = g.storage(f4.byteLength, f4);
    this.cellOld = g.storage(f4.byteLength, f4);
    this.cellType = g.storage(nCells * 4, new Uint32Array(nCells));
    this.press = g.storage(nCells * 4, new Float32Array(nCells));
    this.pressTmp = g.storage(nCells * 4, new Float32Array(nCells));

    const b4 = new Float32Array(FLUID_MAX_BALLS * 4);
    this.ballPos = g.storage(b4.byteLength, b4);
    this.ballVel = g.storage(b4.byteLength, b4);
    this.ballAng = g.storage(b4.byteLength, b4);
    this.ballQuat = g.storage(b4.byteLength, b4);
    this.ballForce = g.storage(b4.byteLength, b4);
    this.ballTorq = g.storage(b4.byteLength, b4);
    this.ballMeta = g.storage(b4.byteLength, b4);

    this.paramBuf = g.uniform(96, new Float32Array(24));

    const mkL = (types) => dev.createBindGroupLayout({
      entries: types.map((t, i) => ({
        binding: i, visibility: GPUShaderStage.COMPUTE,
        buffer: t === 'u' ? { type: 'uniform' } : { type: 'storage' },
      })),
    });
    this.L0 = mkL(['u', 's', 's', 's', 's', 's', 's', 's', 's']);
    this.L1 = mkL(['s', 's']);
    this.L2 = mkL(['s', 's', 's', 's']);
    this.L3 = mkL(['s', 's']);
    this.emptyLayout = dev.createBindGroupLayout({ entries: [] });
    this.emptyBG = dev.createBindGroup({ layout: this.emptyLayout, entries: [] });

    this.acc = g.storage(this.nCells * 4 * 4, new Int32Array(this.nCells * 4));
    const g0e = (pressBuf, tmpBuf) => ([
      { binding: 0, resource: { buffer: this.paramBuf } },
      { binding: 1, resource: { buffer: this.pPos } },
      { binding: 2, resource: { buffer: this.pVel } },
      { binding: 3, resource: { buffer: this.cellVel } },
      { binding: 4, resource: { buffer: this.cellOld } },
      { binding: 5, resource: { buffer: this.cellType } },
      { binding: 6, resource: { buffer: this.acc } },
      { binding: 7, resource: { buffer: this.foamPos } },
      { binding: 8, resource: { buffer: this.foamVel } },
    ]);
    this.bgs = [
      dev.createBindGroup({ layout: this.L0, entries: g0e() }),
      dev.createBindGroup({ layout: this.L1, entries: [
        { binding: 0, resource: { buffer: this.press } },
        { binding: 1, resource: { buffer: this.pressTmp } },
      ] }),
      dev.createBindGroup({ layout: this.L2, entries: [
        { binding: 0, resource: { buffer: this.ballPos } },
        { binding: 1, resource: { buffer: this.ballVel } },
        { binding: 2, resource: { buffer: this.ballAng } },
        { binding: 3, resource: { buffer: this.ballQuat } },
      ] }),
      dev.createBindGroup({ layout: this.L3, entries: [
        { binding: 0, resource: { buffer: this.ballForce } },
        { binding: 1, resource: { buffer: this.ballTorq } },
      ] }),
    ];
    this.bgsSwap = this.bgs.map((bg, i) => {
      if (i !== 1) return bg;
      return dev.createBindGroup({ layout: this.L1, entries: [
        { binding: 0, resource: { buffer: this.pressTmp } },
        { binding: 1, resource: { buffer: this.press } },
      ] });
    });

    const layouts = [this.L0, this.L1, this.L2, this.L3];
    this.useMap = new Map();
    const mk = async (code, label, use) => {
      let src = FLUID_HEAD;
      if (use[1]) src += FLUID_G1;
      if (use[2]) src += FLUID_G2;
      if (use[3]) src += FLUID_G3;
      src += code;
      const mod = await makeShaderModule(dev, src, 'fluid-' + label);
      const pl = dev.createPipelineLayout({
        bindGroupLayouts: layouts.map((l, i) => (use[i] ? l : this.emptyLayout)),
      });
      const pipe = await dev.createComputePipelineAsync({ layout: pl, compute: { module: mod, entryPoint: 'main' } });
      this.useMap.set(pipe, use);
      return pipe;
    };
    this.pClear = await mk(K_CLEAR, 'clear', [1, 0, 0, 0]);
    this.pSolid = await mk(K_SOLID, 'solid', [1, 0, 1, 0]);
    this.pP2G = await mk(K_P2G, 'p2g', [1, 0, 0, 0]);
    this.pNorm = await mk(K_NORMALIZE, 'norm', [1, 0, 0, 0]);
    this.pPress = await mk(K_PRESSURE, 'press', [1, 1, 0, 0]);
    this.pGrad = await mk(K_GRADIENT, 'grad', [1, 1, 0, 0]);
    this.pAdvect = await mk(K_ADVECT, 'advect', [1, 0, 0, 0]);
    this.pG2P = await mk(K_G2P, 'g2p', [1, 0, 0, 0]);
    this.pCollide = await mk(K_COLLIDE, 'collide', [1, 0, 1, 0]);
    this.pBallForce = await mk(K_BALLFORCE, 'ballforce', [1, 1, 1, 1]);
    this.pBallInt = await mk(K_BALLINTEGRATE, 'ballint', [1, 0, 1, 1]);
    this.pBallPair = await mk(K_BALLPAIR, 'ballpair', [1, 0, 1, 0]);
    this.pFoam = await mk(K_FOAM, 'foam', [1, 0, 0, 0]);
    this.pSettle = await mk(K_SETTLE, 'settle', [1, 0, 0, 0]);
    this.pClearF = await mk(K_CLEAR_FORCE, 'clearf', [1, 0, 0, 1]);

    this.resetBalls();
    this.ready = true;
    return this;
  }

  terrainH(x, z) {
    let h = 0.34 * smoothstep(1.35, 1.90, x);
    const ridge = Math.exp(-Math.pow(x - 0.95, 2) / (2 * 0.10 * 0.10));
    h += 0.075 * ridge * smoothstep(0.02, 0.14, z) * (1 - smoothstep(0.56, 0.72, z));
    return h;
  }

  writeParams() {
    const p = this.params;
    const arr = new Float32Array(24);
    arr[0] = this.nx; arr[1] = this.ny; arr[2] = this.nz; arr[3] = this.numParticles;
    arr[4] = 0; arr[5] = 0; arr[6] = 0; arr[7] = this.h;
    arr[8] = 0; arr[9] = -9.8; arr[10] = 0; arr[11] = this.dt || 1 / 120;
    arr[12] = p.restLevel; arr[13] = 0.5; arr[14] = this.numBalls; arr[15] = this.time;
    arr[16] = this.paddleX !== undefined ? this.paddleX : 0.035;
    arr[17] = this.paddleV || 0; arr[18] = p.waveAmp; arr[19] = p.waveFreq;
    arr[20] = p.flipBlend; arr[21] = p.pressIters; arr[22] = p.maxSpeed; arr[23] = 1.0;
    this.gfx.device.queue.writeBuffer(this.paramBuf, 0, arr);
  }

  reset() {
    this.time = 0;
    this.params.wavePhase = 0;
    this.params.waving = false;
    this.paddleX = 0.035;
    this.paddleV = 0;
    const g = this.gfx;
    const rng = makeRng(1337);
    const pos = new Float32Array(this.numParticles * 4);
    const rest = this.params.restLevel;
    let n = 0;
    for (let k = 1; k < this.nz - 1 && n < this.numParticles; k++) {
      for (let j = 1; j < this.ny - 1 && n < this.numParticles; j++) {
        for (let i = 1; i < this.nx - 1 && n < this.numParticles; i++) {
          const cx = (i + 0.5) * this.h, cy = (j + 0.5) * this.h, cz = (k + 0.5) * this.h;
          if (cy > rest) continue;
          if (cy < this.terrainH(cx, cz)) continue;
          for (let p = 0; p < FLUID_PPC && n < this.numParticles; p++) {
            pos[n * 4] = cx + (rng() - 0.5) * this.h * 0.9;
            pos[n * 4 + 1] = cy + (rng() - 0.5) * this.h * 0.9;
            pos[n * 4 + 2] = cz + (rng() - 0.5) * this.h * 0.9;
            pos[n * 4 + 3] = 0;
            n++;
          }
        }
      }
    }
    g.device.queue.writeBuffer(this.pPos, 0, pos);
    g.device.queue.writeBuffer(this.pVel, 0, new Float32Array(this.numParticles * 4));
    g.device.queue.writeBuffer(this.foamPos, 0, pos.slice());
    g.device.queue.writeBuffer(this.foamVel, 0, new Float32Array(this.numParticles * 4));
    g.device.queue.writeBuffer(this.cellVel, 0, new Float32Array(this.nCells * 4));
    g.device.queue.writeBuffer(this.cellOld, 0, new Float32Array(this.nCells * 4));
    g.device.queue.writeBuffer(this.cellType, 0, new Uint32Array(this.nCells));
    g.device.queue.writeBuffer(this.press, 0, new Float32Array(this.nCells));
    g.device.queue.writeBuffer(this.pressTmp, 0, new Float32Array(this.nCells));
    g.device.queue.writeBuffer(this.acc, 0, new Int32Array(this.nCells * 4));
    this.resetBalls();
  }

  resetBalls() {
    const g = this.gfx;
    const pos = new Float32Array(FLUID_MAX_BALLS * 4);
    const vel = new Float32Array(FLUID_MAX_BALLS * 4);
    const ang = new Float32Array(FLUID_MAX_BALLS * 4);
    const quat = new Float32Array(FLUID_MAX_BALLS * 4);
    const meta = new Float32Array(FLUID_MAX_BALLS * 4);
    const rng = makeRng(777);
    const groups = this.groups;
    const r = 0.058;
    let n = 0;
    this.ballDefs = [];
    for (let gi = 0; gi < groups.length; gi++) {
      for (let b = 0; b < 4; b++) {
        const x = 0.30 + (b / 3) * 1.30 + (rng() - 0.5) * 0.10 + gi * 0.05;
        const z = 0.16 + ((b + gi) % 4) * 0.17 + (rng() - 0.5) * 0.07;
        const y = 0.58 + rng() * 0.40;
        pos[n * 4] = x; pos[n * 4 + 1] = y; pos[n * 4 + 2] = z; pos[n * 4 + 3] = r;
        vel[n * 4] = 0; vel[n * 4 + 1] = 0; vel[n * 4 + 2] = 0;
        vel[n * 4 + 3] = 1 / ((4 / 3) * Math.PI * r * r * r * groups[gi].density);
        ang[n * 4] = 0; ang[n * 4 + 1] = 0; ang[n * 4 + 2] = 0;
        ang[n * 4 + 3] = 1 / ((2 / 5) * (4 / 3) * Math.PI * r * r * r * groups[gi].density * r * r);
        quat[n * 4] = 0; quat[n * 4 + 1] = 0; quat[n * 4 + 2] = 0; quat[n * 4 + 3] = 1;
        meta[n * 4] = groups[gi].density; meta[n * 4 + 1] = gi; meta[n * 4 + 2] = 0.32; meta[n * 4 + 3] = 0.5;
        this.ballDefs.push({ group: gi, color: groups[gi].color, density: groups[gi].density });
        n++;
      }
    }
    this.numBalls = n;
    g.device.queue.writeBuffer(this.ballPos, 0, pos);
    g.device.queue.writeBuffer(this.ballVel, 0, vel);
    g.device.queue.writeBuffer(this.ballAng, 0, ang);
    g.device.queue.writeBuffer(this.ballQuat, 0, quat);
    g.device.queue.writeBuffer(this.ballMeta, 0, meta);
    g.device.queue.writeBuffer(this.ballForce, 0, new Float32Array(FLUID_MAX_BALLS * 4));
    g.device.queue.writeBuffer(this.ballTorq, 0, new Float32Array(FLUID_MAX_BALLS * 4));
    this.writeParams();
  }

  setGroupDensity(i, v) {
    if (!this.groups[i]) return;
    this.groups[i].density = v;
    this.resetBalls();
  }

  setWaveAmp(a) { this.params.waveAmp = a; this.writeParams(); }
  setWaveFreq(f) { this.params.waveFreq = f; this.writeParams(); }
  setWaving(on) { this.params.waving = on; this.writeParams(); }

  settle() {
    const g = this.gfx;
    const enc = g.device.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(this.pSettle);
    {
      const use = this.useMap.get(this.pSettle);
      for (let i = 0; i < 4; i++) p.setBindGroup(i, use[i] ? this.bgs[i] : this.emptyBG);
    }
    p.dispatchWorkgroups(Math.ceil(this.numParticles / 64)); p.end();
    g.device.queue.submit([enc.finish()]);
  }

  step(dt) {
    if (!this.ready) return;
    const g = this.gfx, dev = g.device;
    this.dt = dt;
    this.time += dt;
    if (this.params.waving) {
      this.params.wavePhase += dt * this.params.waveFreq * Math.PI * 2;
      const A = this.params.waveAmp;
      this.paddleX = 0.035 + A * Math.sin(this.params.wavePhase);
      this.paddleV = A * Math.cos(this.params.wavePhase) * this.params.waveFreq * Math.PI * 2;
    } else {
      this.paddleX += (0.035 - this.paddleX) * Math.min(1, dt * 3);
      this.paddleV = 0;
    }
    this.writeParams();

    const enc = dev.createCommandEncoder();
    const c = enc.beginComputePass();
    const gw = [Math.ceil(this.nx / 4), Math.ceil(this.ny / 4), Math.ceil(this.nz / 4)];
    const pw = [Math.ceil(this.numParticles / 64)];
    const bw = [Math.max(1, Math.ceil(this.numBalls / 64))];
    const setGroups = (pipe, swap) => {
      const use = this.useMap.get(pipe);
      for (let i = 0; i < 4; i++) {
        const bgs = (swap && i === 1) ? this.bgsSwap : this.bgs;
        c.setBindGroup(i, use[i] ? bgs[i] : this.emptyBG);
      }
    };
    const run = (pipe, w) => {
      c.setPipeline(pipe);
      setGroups(pipe, false);
      c.dispatchWorkgroups(w[0], w[1] || 1, w[2] || 1);
    };

    run(this.pAdvect, pw);
    run(this.pCollide, pw);
    run(this.pClear, gw);
    run(this.pSolid, gw);
    run(this.pP2G, pw);
    run(this.pNorm, gw);
    const iters = Math.round(this.params.pressIters);
    for (let i = 0; i < iters; i++) {
      c.setPipeline(this.pPress);
      setGroups(this.pPress, i % 2 === 1);
      c.dispatchWorkgroups(gw[0], gw[1], gw[2]);
    }
    run(this.pGrad, gw);
    run(this.pG2P, pw);
    run(this.pFoam, pw);
    run(this.pClearF, bw);
    run(this.pBallForce, bw);
    run(this.pBallInt, bw);
    run(this.pBallPair, [1]);
    c.end();
    dev.queue.submit([enc.finish()]);
  }
}
