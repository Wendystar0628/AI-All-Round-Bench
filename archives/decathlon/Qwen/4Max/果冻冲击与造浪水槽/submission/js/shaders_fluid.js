/* FLIP 流体计算着色器：MAC 网格 + PCG 压力投影 + 粒子平流 + 白水状态
   网格 120×42×40，h=0.025m；粒子 4/单元；全部在 WebGPU compute 求解 */
'use strict';
const FLUID_WGSL = `
struct FP {
  a: vec4f, // dt, gravity, flipRatio, damping
  b: vec4f, // nx, ny, nz, h
  c: vec4f, // paddleX, paddleV, paddleTop, time
  d: vec4f, // particleCount, restCellMass, seed, extraDamp
  e: vec4f, // waterDepth, ballCount, iters, foamGain
};
struct Particle { pos: vec4f, vel: vec4f };
struct Ball { pos: vec4f, vel: vec4f };
@group(0) @binding(0) var<uniform> P: FP;
@group(0) @binding(1) var<storage, read_write> grid: array<f32>;
@group(0) @binding(2) var<storage, read_write> atom: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(4) var<storage, read> balls: array<Ball>;
@group(0) @binding(5) var<storage, read_write> bforce: array<vec4f>;
@group(0) @binding(6) var surfInfo: texture_storage_2d<rgba16float, write>;

const NX = 120u; const NY = 42u; const NZ = 40u;
const H = 0.025;
const CSIZE = NX * NY * NZ;
const USIZE = (NX + 1u) * NY * NZ;
const VSIZE = NX * (NY + 1u) * NZ;
const WSIZE = NX * NY * (NZ + 1u);
const OU = 0u;
const OV = OU + USIZE;
const OW = OV + VSIZE;
const OUO = OW + WSIZE;
const OVO = OUO + USIZE;
const OWO = OVO + VSIZE;
const OP = OWO + WSIZE;
const OR = OP + CSIZE;
const OZ = OR + CSIZE;
const OAP = OZ + CSIZE;
const OPV = OAP + CSIZE;
const ODIAG = OPV + CSIZE;
const OTYPE = ODIAG + CSIZE;
const OSCAL = OTYPE + CSIZE;
const GRID_TOTAL = OSCAL + 16u;
const OUMM = 0u;
const OUMV = OUMM + USIZE;
const OVMM = OUMV + USIZE;
const OVMV = OVMM + VSIZE;
const OWMM = OVMV + VSIZE;
const OWMV = OWMM + WSIZE;
const OCM = OWMV + WSIZE;
const ODOTS = OCM + CSIZE;
const ATOM_TOTAL = ODOTS + 8u;
const MASS_SCALE = 1024.0;
const DOT_SCALE = 1024.0;
const AIR = 0.0; const FLUID = 1.0; const SOLID = 2.0;

fn cIdx(i: u32, j: u32, k: u32) -> u32 { return i + NX * (j + NY * k); }
fn uIdx(i: u32, j: u32, k: u32) -> u32 { return i + (NX + 1u) * (j + NY * k); }
fn vIdx(i: u32, j: u32, k: u32) -> u32 { return i + NX * (j + (NY + 1u) * k); }
fn wIdx(i: u32, j: u32, k: u32) -> u32 { return i + NX * (j + NZ * k); }
fn cellAt(i: i32, j: i32, k: i32) -> f32 {
  if (i < 0 || j < 0 || k < 0 || i >= i32(NX) || j >= i32(NY) || k >= i32(NZ)) { return SOLID; }
  return grid[OTYPE + cIdx(u32(i), u32(j), u32(k))];
}
fn terrainH(x: f32, z: f32) -> f32 {
  let bx = (x - 2.15) / 0.40;
  let ridge = 0.27 * exp(-bx * bx);
  let zmod = 0.52 + 0.48 * smoothstep(0.12, 0.80, z);
  let bump2 = 0.05 * exp(-pow((x - 1.05) / 0.30, 2.0)) * exp(-pow((z - 0.72) / 0.28, 2.0));
  return ridge * zmod + bump2;
}
fn solidVelAt(p: vec3f) -> vec3f {
  if (p.x < P.c.x && p.y < P.c.z) { return vec3f(P.c.y, 0.0, 0.0); }
  let nb = u32(P.e.y);
  for (var b = 0u; b < nb; b++) {
    let d = p - balls[b].pos.xyz;
    let r = balls[b].pos.w + 0.30 * H;
    if (dot(d, d) < r * r) { return balls[b].vel.xyz; }
  }
  return vec3f(0.0);
}
fn isSolidCell(i: u32, j: u32, k: u32) -> bool {
  let cx = (f32(i) + 0.5) * H; let cy = (f32(j) + 0.5) * H; let cz = (f32(k) + 0.5) * H;
  if (cy < terrainH(cx, cz)) { return true; }
  if (cx < P.c.x && cy < P.c.z) { return true; }
  let nb = u32(P.e.y);
  for (var b = 0u; b < nb; b++) {
    let d = vec3f(cx, cy, cz) - balls[b].pos.xyz;
    let r = balls[b].pos.w + 0.30 * H;
    if (dot(d, d) < r * r) { return true; }
  }
  return false;
}
fn sampleU(p: vec3f, base: u32) -> f32 {
  let gx = clamp(p.x / H, 0.0, f32(NX) - 0.001);
  let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
  let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
  let i = u32(gx); let j = u32(gy); let k = u32(gz);
  let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
  var s = 0.0;
  for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
    let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
    s += w * grid[base + uIdx(min(i + di, NX), j + dj, k + dk)];
  }}}
  return s;
}
fn sampleV(p: vec3f, base: u32) -> f32 {
  let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
  let gy = clamp(p.y / H, 0.0, f32(NY) - 0.001);
  let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
  let i = u32(gx); let j = u32(gy); let k = u32(gz);
  let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
  var s = 0.0;
  for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
    let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
    s += w * grid[base + vIdx(i + di, min(j + dj, NY), k + dk)];
  }}}
  return s;
}
fn sampleW(p: vec3f, base: u32) -> f32 {
  let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
  let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
  let gz = clamp(p.z / H, 0.0, f32(NZ) - 0.001);
  let i = u32(gx); let j = u32(gy); let k = u32(gz);
  let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
  var s = 0.0;
  for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
    let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
    s += w * grid[base + wIdx(i + di, j + dj, min(k + dk, NZ))];
  }}}
  return s;
}
fn sampleVel(p: vec3f, base: u32) -> vec3f {
  return vec3f(sampleU(p, base), sampleV(p, base), sampleW(p, base));
}
fn sampleCellMass(p: vec3f) -> f32 {
  let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
  let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
  let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
  let i = u32(gx); let j = u32(gy); let k = u32(gz);
  let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
  var s = 0.0;
  for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
    let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
    s += w * f32(atomicLoad(&atom[OCM + cIdx(i + di, j + dj, k + dk)]));
  }}}
  return s;
}
var<workgroup> sh: array<f32, 128>;
fn wgSum(v: f32, lid: u32) -> f32 {
  sh[lid] = v;
  workgroupBarrier();
  var stride = 64u;
  loop {
    if (stride == 0u) { break; }
    if (lid < stride) { sh[lid] += sh[lid + stride]; }
    workgroupBarrier();
    stride = stride / 2u;
  }
  let r = sh[0];
  workgroupBarrier();
  return r;
}
// ---------- 清空 ----------
@compute @workgroup_size(128) fn clearAll(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i < GRID_TOTAL) { grid[i] = 0.0; }
  if (i < ATOM_TOTAL) { atomicStore(&atom[i], 0); }
}
// ---------- P2G ----------
@compute @workgroup_size(128) fn p2g(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= u32(P.d.x)) { return; }
  let p = parts[idx].pos.xyz;
  let v = parts[idx].vel.xyz;
  {
    let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
    let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
    let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
    let i = u32(gx); let j = u32(gy); let k = u32(gz);
    let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
    for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
      let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
      atomicAdd(&atom[OCM + cIdx(i + di, j + dj, k + dk)], i32(w * MASS_SCALE));
    }}}
  }
  {
    let gx = clamp(p.x / H, 0.0, f32(NX) - 0.001);
    let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
    let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
    let i = u32(gx); let j = u32(gy); let k = u32(gz);
    let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
    for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
      let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
      let id = uIdx(min(i + di, NX), j + dj, k + dk);
      atomicAdd(&atom[OUMM + id], i32(w * MASS_SCALE));
      atomicAdd(&atom[OUMV + id], i32(w * v.x * MASS_SCALE));
    }}}
  }
  {
    let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
    let gy = clamp(p.y / H, 0.0, f32(NY) - 0.001);
    let gz = clamp(p.z / H - 0.5, 0.0, f32(NZ) - 1.001);
    let i = u32(gx); let j = u32(gy); let k = u32(gz);
    let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
    for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
      let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
      let id = vIdx(i + di, min(j + dj, NY), k + dk);
      atomicAdd(&atom[OVMM + id], i32(w * MASS_SCALE));
      atomicAdd(&atom[OVMV + id], i32(w * v.y * MASS_SCALE));
    }}}
  }
  {
    let gx = clamp(p.x / H - 0.5, 0.0, f32(NX) - 1.001);
    let gy = clamp(p.y / H - 0.5, 0.0, f32(NY) - 1.001);
    let gz = clamp(p.z / H, 0.0, f32(NZ) - 0.001);
    let i = u32(gx); let j = u32(gy); let k = u32(gz);
    let fx = gx - f32(i); let fy = gy - f32(j); let fz = gz - f32(k);
    for (var dk = 0u; dk < 2u; dk++) { for (var dj = 0u; dj < 2u; dj++) { for (var di = 0u; di < 2u; di++) {
      let w = select(1.0 - fx, fx, di == 1u) * select(1.0 - fy, fy, dj == 1u) * select(1.0 - fz, fz, dk == 1u);
      let id = wIdx(i + di, j + dj, min(k + dk, NZ));
      atomicAdd(&atom[OWMM + id], i32(w * MASS_SCALE));
      atomicAdd(&atom[OWMV + id], i32(w * v.z * MASS_SCALE));
    }}}
  }
}
// ---------- 单元类型 ----------
@compute @workgroup_size(128) fn cellType(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= CSIZE) { return; }
  let i = idx % NX; let j = (idx / NX) % NY; let k = idx / (NX * NY);
  var t = AIR;
  if (isSolidCell(i, j, k)) { t = SOLID; }
  else if (atomicLoad(&atom[OCM + idx]) > 64) { t = FLUID; }
  grid[OTYPE + idx] = t;
}
// ---------- 归一化 + 体力 + 固体边界 ----------
@compute @workgroup_size(128) fn normU(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= USIZE) { return; }
  let i = idx % (NX + 1u); let j = (idx / (NX + 1u)) % NY; let k = idx / ((NX + 1u) * NY);
  let m = f32(atomicLoad(&atom[OUMM + idx]));
  var vel = 0.0;
  if (m > 0.5) { vel = f32(atomicLoad(&atom[OUMV + idx])) / m; }
  let cl = cellAt(i32(i) - 1, i32(j), i32(k));
  let cr = cellAt(i32(i), i32(j), i32(k));
  if (cl == SOLID || cr == SOLID) {
    vel = solidVelAt(vec3f(f32(i) * H, (f32(j) + 0.5) * H, (f32(k) + 0.5) * H)).x;
  }
  grid[OU + idx] = vel;
  grid[OUO + idx] = vel;
}
@compute @workgroup_size(128) fn normV(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= VSIZE) { return; }
  let i = idx % NX; let j = (idx / NX) % (NY + 1u); let k = idx / (NX * (NY + 1u));
  let m = f32(atomicLoad(&atom[OVMM + idx]));
  var vel = 0.0;
  if (m > 0.5) { vel = f32(atomicLoad(&atom[OVMV + idx])) / m; }
  let cd = cellAt(i32(i), i32(j) - 1, i32(k));
  let cu = cellAt(i32(i), i32(j), i32(k));
  if (cd == FLUID || cu == FLUID) { vel -= P.a.y * P.a.x; }
  if (cd == SOLID || cu == SOLID) {
    vel = solidVelAt(vec3f((f32(i) + 0.5) * H, f32(j) * H, (f32(k) + 0.5) * H)).y;
  }
  grid[OV + idx] = vel;
  grid[OVO + idx] = vel;
}
@compute @workgroup_size(128) fn normW(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= WSIZE) { return; }
  let i = idx % NX; let j = (idx / NX) % NY; let k = idx / (NX * NY);
  let m = f32(atomicLoad(&atom[OWMM + idx]));
  var vel = 0.0;
  if (m > 0.5) { vel = f32(atomicLoad(&atom[OWMV + idx])) / m; }
  let cb = cellAt(i32(i), i32(j), i32(k) - 1);
  let cf = cellAt(i32(i), i32(j), i32(k));
  if (cb == SOLID || cf == SOLID) {
    vel = solidVelAt(vec3f((f32(i) + 0.5) * H, (f32(j) + 0.5) * H, f32(k) * H)).z;
  }
  grid[OW + idx] = vel;
  grid[OWO + idx] = vel;
}
// ---------- 散度 / PCG ----------
@compute @workgroup_size(128) fn divergence(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let idx = gid.x;
  var rz = 0.0;
  if (idx < CSIZE) {
    let i = idx % NX; let j = (idx / NX) % NY; let k = idx / (NX * NY);
    let t = grid[OTYPE + idx];
    if (t == FLUID) {
      let px = (f32(i) + 0.5) * H; let py = (f32(j) + 0.5) * H; let pz = (f32(k) + 0.5) * H;
      var uR = grid[OU + uIdx(i + 1u, j, k)];
      var uL = grid[OU + uIdx(i, j, k)];
      var vU = grid[OV + vIdx(i, j + 1u, k)];
      var vD = grid[OV + vIdx(i, j, k)];
      var wF = grid[OW + wIdx(i, j, k + 1u)];
      var wB = grid[OW + wIdx(i, j, k)];
      if (cellAt(i32(i) + 1, i32(j), i32(k)) == SOLID) { uR = solidVelAt(vec3f(px + 0.5 * H, py, pz)).x; }
      if (cellAt(i32(i) - 1, i32(j), i32(k)) == SOLID) { uL = solidVelAt(vec3f(px - 0.5 * H, py, pz)).x; }
      if (cellAt(i32(i), i32(j) + 1, i32(k)) == SOLID) { vU = solidVelAt(vec3f(px, py + 0.5 * H, pz)).y; }
      if (cellAt(i32(i), i32(j) - 1, i32(k)) == SOLID) { vD = solidVelAt(vec3f(px, py - 0.5 * H, pz)).y; }
      if (cellAt(i32(i), i32(j), i32(k) + 1) == SOLID) { wF = solidVelAt(vec3f(px, py, pz + 0.5 * H)).z; }
      if (cellAt(i32(i), i32(j), i32(k) - 1) == SOLID) { wB = solidVelAt(vec3f(px, py, pz - 0.5 * H)).z; }
      let div = (uR - uL + vU - vD + wF - wB) / H;
      let rhs = -H * H * div / P.a.x;
      var n = 0.0;
      if (cellAt(i32(i) + 1, i32(j), i32(k)) != SOLID) { n += 1.0; }
      if (cellAt(i32(i) - 1, i32(j), i32(k)) != SOLID) { n += 1.0; }
      if (cellAt(i32(i), i32(j) + 1, i32(k)) != SOLID) { n += 1.0; }
      if (cellAt(i32(i), i32(j) - 1, i32(k)) != SOLID) { n += 1.0; }
      if (cellAt(i32(i), i32(j), i32(k) + 1) != SOLID) { n += 1.0; }
      if (cellAt(i32(i), i32(j), i32(k) - 1) != SOLID) { n += 1.0; }
      n = max(n, 1.0);
      grid[OR + idx] = rhs;
      grid[ODIAG + idx] = n;
      let zz = rhs / n;
      grid[OZ + idx] = zz;
      grid[OPV + idx] = zz;
      grid[OP + idx] = 0.0;
      rz = rhs * zz;
    } else {
      grid[OR + idx] = 0.0;
      grid[OZ + idx] = 0.0;
      grid[OPV + idx] = 0.0;
      grid[OP + idx] = 0.0;
      grid[ODIAG + idx] = 1.0;
    }
  }
  let s = wgSum(rz, lid.x);
  if (lid.x == 0u) { atomicAdd(&atom[ODOTS + 1], i32(s * DOT_SCALE)); }
}
@compute @workgroup_size(128) fn spmv(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let idx = gid.x;
  var pa = 0.0;
  if (idx < CSIZE && grid[OTYPE + idx] == FLUID) {
    let i = idx % NX; let j = (idx / NX) % NY; let k = idx / (NX * NY);
    let pc = grid[OPV + idx];
    var s = grid[ODIAG + idx] * pc;
    if (cellAt(i32(i) + 1, i32(j), i32(k)) == FLUID) { s -= grid[OPV + idx + 1u]; }
    if (cellAt(i32(i) - 1, i32(j), i32(k)) == FLUID) { s -= grid[OPV + idx - 1u]; }
    if (cellAt(i32(i), i32(j) + 1, i32(k)) == FLUID) { s -= grid[OPV + idx + NX]; }
    if (cellAt(i32(i), i32(j) - 1, i32(k)) == FLUID) { s -= grid[OPV + idx - NX]; }
    if (cellAt(i32(i), i32(j), i32(k) + 1) == FLUID) { s -= grid[OPV + idx + NX * NY]; }
    if (cellAt(i32(i), i32(j), i32(k) - 1) == FLUID) { s -= grid[OPV + idx - NX * NY]; }
    grid[OAP + idx] = s;
    pa = pc * s;
  } else if (idx < CSIZE) {
    grid[OAP + idx] = 0.0;
  }
  let s = wgSum(pa, lid.x);
  if (lid.x == 0u) { atomicAdd(&atom[ODOTS + 0], i32(s * DOT_SCALE)); }
}
@compute @workgroup_size(128) fn updateX(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let idx = gid.x;
  var rz = 0.0;
  if (idx < CSIZE && grid[OTYPE + idx] == FLUID) {
    let rho = grid[OSCAL];
    let pap = f32(atomicLoad(&atom[ODOTS + 0])) / DOT_SCALE;
    let alpha = rho / max(pap, 1e-9);
    let pv = grid[OPV + idx];
    grid[OP + idx] += alpha * pv;
    let r = grid[OR + idx] - alpha * grid[OAP + idx];
    grid[OR + idx] = r;
    let zz = r / grid[ODIAG + idx];
    grid[OZ + idx] = zz;
    rz = r * zz;
  }
  let s = wgSum(rz, lid.x);
  if (lid.x == 0u) { atomicAdd(&atom[ODOTS + 1], i32(s * DOT_SCALE)); }
}
@compute @workgroup_size(128) fn updateP(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= CSIZE) { return; }
  if (grid[OTYPE + idx] != FLUID) { grid[OPV + idx] = 0.0; return; }
  let rho = max(grid[OSCAL], 1e-9);
  let rz = f32(atomicLoad(&atom[ODOTS + 1])) / DOT_SCALE;
  let beta = rz / rho;
  grid[OPV + idx] = grid[OZ + idx] + beta * grid[OPV + idx];
}
@compute @workgroup_size(1) fn scalarStep(@builtin(global_invocation_id) gid: vec3u) {
  grid[OSCAL] = f32(atomicLoad(&atom[ODOTS + 1])) / DOT_SCALE;
  atomicStore(&atom[ODOTS + 0], 0);
  atomicStore(&atom[ODOTS + 1], 0);
}
// ---------- 减去压力梯度 ----------
@compute @workgroup_size(128) fn gradU(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= USIZE) { return; }
  let i = idx % (NX + 1u); let j = (idx / (NX + 1u)) % NY; let k = idx / ((NX + 1u) * NY);
  let cl = cellAt(i32(i) - 1, i32(j), i32(k));
  let cr = cellAt(i32(i), i32(j), i32(k));
  if (cl == SOLID || cr == SOLID) { return; }
  if (cl != FLUID && cr != FLUID) { return; }
  let pL = select(0.0, grid[OP + cIdx(i - 1u, j, k)], cl == FLUID);
  let pR = select(0.0, grid[OP + cIdx(i, j, k)], cr == FLUID);
  grid[OU + idx] -= P.a.x * (pR - pL) / H;
}
@compute @workgroup_size(128) fn gradV(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= VSIZE) { return; }
  let i = idx % NX; let j = (idx / NX) % (NY + 1u); let k = idx / (NX * (NY + 1u));
  let cd = cellAt(i32(i), i32(j) - 1, i32(k));
  let cu = cellAt(i32(i), i32(j), i32(k));
  if (cd == SOLID || cu == SOLID) { return; }
  if (cd != FLUID && cu != FLUID) { return; }
  let pD = select(0.0, grid[OP + cIdx(i, j - 1u, k)], cd == FLUID);
  let pU = select(0.0, grid[OP + cIdx(i, j, k)], cu == FLUID);
  grid[OV + idx] -= P.a.x * (pU - pD) / H;
}
@compute @workgroup_size(128) fn gradW(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= WSIZE) { return; }
  let i = idx % NX; let j = (idx / NX) % NY; let k = idx / (NX * NY);
  let cb = cellAt(i32(i), i32(j), i32(k) - 1);
  let cf = cellAt(i32(i), i32(j), i32(k));
  if (cb == SOLID || cf == SOLID) { return; }
  if (cb != FLUID && cf != FLUID) { return; }
  let pB = select(0.0, grid[OP + cIdx(i, j, k - 1u)], cb == FLUID);
  let pF = select(0.0, grid[OP + cIdx(i, j, k)], cf == FLUID);
  grid[OW + idx] -= P.a.x * (pF - pB) / H;
}
// ---------- 速度外推 ----------
fn uValid(i: i32, j: i32, k: i32) -> bool {
  if (i < 0 || i > i32(NX) || j < 0 || j >= i32(NY) || k < 0 || k >= i32(NZ)) { return false; }
  let a = cellAt(i - 1, j, k); let b = cellAt(i, j, k);
  return a == FLUID || b == FLUID || a == SOLID || b == SOLID;
}
fn vValid(i: i32, j: i32, k: i32) -> bool {
  if (i < 0 || i >= i32(NX) || j < 0 || j > i32(NY) || k < 0 || k >= i32(NZ)) { return false; }
  let a = cellAt(i, j - 1, k); let b = cellAt(i, j, k);
  return a == FLUID || b == FLUID || a == SOLID || b == SOLID;
}
fn wValid(i: i32, j: i32, k: i32) -> bool {
  if (i < 0 || i >= i32(NX) || j < 0 || j >= i32(NY) || k < 0 || k > i32(NZ)) { return false; }
  let a = cellAt(i, j, k - 1); let b = cellAt(i, j, k);
  return a == FLUID || b == FLUID || a == SOLID || b == SOLID;
}
@compute @workgroup_size(128) fn extrapU(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= USIZE) { return; }
  let i = i32(idx % (NX + 1u)); let j = i32((idx / (NX + 1u)) % NY); let k = i32(idx / ((NX + 1u) * NY));
  if (uValid(i, j, k)) { return; }
  var s = 0.0; var n = 0.0;
  if (uValid(i + 1, j, k)) { s += grid[OU + uIdx(u32(i + 1), u32(j), u32(k))]; n += 1.0; }
  if (uValid(i - 1, j, k)) { s += grid[OU + uIdx(u32(i - 1), u32(j), u32(k))]; n += 1.0; }
  if (uValid(i, j + 1, k)) { s += grid[OU + uIdx(u32(i), u32(j + 1), u32(k))]; n += 1.0; }
  if (uValid(i, j - 1, k)) { s += grid[OU + uIdx(u32(i), u32(j - 1), u32(k))]; n += 1.0; }
  if (uValid(i, j, k + 1)) { s += grid[OU + uIdx(u32(i), u32(j), u32(k + 1))]; n += 1.0; }
  if (uValid(i, j, k - 1)) { s += grid[OU + uIdx(u32(i), u32(j), u32(k - 1))]; n += 1.0; }
  if (n > 0.0) { grid[OU + idx] = s / n; }
}
@compute @workgroup_size(128) fn extrapV(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= VSIZE) { return; }
  let i = i32(idx % NX); let j = i32((idx / NX) % (NY + 1u)); let k = i32(idx / (NX * (NY + 1u)));
  if (vValid(i, j, k)) { return; }
  var s = 0.0; var n = 0.0;
  if (vValid(i + 1, j, k)) { s += grid[OV + vIdx(u32(i + 1), u32(j), u32(k))]; n += 1.0; }
  if (vValid(i - 1, j, k)) { s += grid[OV + vIdx(u32(i - 1), u32(j), u32(k))]; n += 1.0; }
  if (vValid(i, j + 1, k)) { s += grid[OV + vIdx(u32(i), u32(j + 1), u32(k))]; n += 1.0; }
  if (vValid(i, j - 1, k)) { s += grid[OV + vIdx(u32(i), u32(j - 1), u32(k))]; n += 1.0; }
  if (vValid(i, j, k + 1)) { s += grid[OV + vIdx(u32(i), u32(j), u32(k + 1))]; n += 1.0; }
  if (vValid(i, j, k - 1)) { s += grid[OV + vIdx(u32(i), u32(j), u32(k - 1))]; n += 1.0; }
  if (n > 0.0) { grid[OV + idx] = s / n; }
}
@compute @workgroup_size(128) fn extrapW(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= WSIZE) { return; }
  let i = i32(idx % NX); let j = i32((idx / NX) % NY); let k = i32(idx / (NX * NY));
  if (wValid(i, j, k)) { return; }
  var s = 0.0; var n = 0.0;
  if (wValid(i + 1, j, k)) { s += grid[OW + wIdx(u32(i + 1), u32(j), u32(k))]; n += 1.0; }
  if (wValid(i - 1, j, k)) { s += grid[OW + wIdx(u32(i - 1), u32(j), u32(k))]; n += 1.0; }
  if (wValid(i, j + 1, k)) { s += grid[OW + wIdx(u32(i), u32(j + 1), u32(k))]; n += 1.0; }
  if (wValid(i, j - 1, k)) { s += grid[OW + wIdx(u32(i), u32(j - 1), u32(k))]; n += 1.0; }
  if (wValid(i, j, k + 1)) { s += grid[OW + wIdx(u32(i), u32(j), u32(k + 1))]; n += 1.0; }
  if (wValid(i, j, k - 1)) { s += grid[OW + wIdx(u32(i), u32(j), u32(k - 1))]; n += 1.0; }
  if (n > 0.0) { grid[OW + idx] = s / n; }
}
// ---------- G2P (FLIP) + 白水 ----------
@compute @workgroup_size(128) fn g2p(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= u32(P.d.x)) { return; }
  let p = parts[idx].pos.xyz;
  var v = parts[idx].vel.xyz;
  let vn = sampleVel(p, OU);
  let vo = sampleVel(p, OUO);
  let flip = P.a.z;
  v = flip * (v + vn - vo) + (1.0 - flip) * vn;
  v *= max(0.0, 1.0 - P.a.w * P.a.x) * (1.0 - P.d.w);
  let spd = length(v);
  if (spd > 6.0) { v = v * (6.0 / spd); }
  let dens = sampleCellMass(p) / P.d.y;
  var foam = parts[idx].pos.w;
  foam *= exp(-P.a.x * 0.85);
  if (dens < 0.58 && spd > 1.05) {
    foam += (0.58 - dens) * spd * P.a.x * P.e.w;
  }
  let nb = u32(P.e.y);
  for (var b = 0u; b < nb; b++) {
    let d = length(p - balls[b].pos.xyz);
    let rr = balls[b].pos.w * 2.4;
    let bs = length(balls[b].vel.xyz);
    if (d < rr && bs > 0.35) {
      foam += P.a.x * 2.0 * (1.0 - d / rr) * min(bs, 3.0);
    }
  }
  parts[idx].pos.w = clamp(foam, 0.0, 1.0);
  parts[idx].vel = vec4f(v, dens);
}
// ---------- 平流 + 碰撞 ----------
@compute @workgroup_size(128) fn advect(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= u32(P.d.x)) { return; }
  let dt = P.a.x;
  var p = parts[idx].pos.xyz;
  var v = parts[idx].vel.xyz;
  let v1 = sampleVel(p, OU);
  let p1 = p + dt * v1;
  let v2 = sampleVel(p1, OU);
  let p2 = 0.75 * p + 0.25 * (p1 + dt * v2);
  let v3 = sampleVel(p2, OU);
  p = p / 3.0 + (2.0 / 3.0) * (p2 + dt * v3);
  // 槽壁
  if (p.x < 0.006) { p.x = 0.006; if (v.x < 0.0) { v.x = 0.0; } }
  if (p.x > 3.0 - 0.006) { p.x = 3.0 - 0.006; if (v.x > 0.0) { v.x = 0.0; } }
  if (p.z < 0.006) { p.z = 0.006; if (v.z < 0.0) { v.z = 0.0; } }
  if (p.z > 1.0 - 0.006) { p.z = 1.0 - 0.006; if (v.z > 0.0) { v.z = 0.0; } }
  if (p.y > 1.05 - 0.004) { p.y = 1.05 - 0.004; if (v.y > 0.0) { v.y *= 0.2; } }
  // 地形
  let th = terrainH(p.x, p.z);
  if (p.y < th + 0.007) {
    p.y = th + 0.007;
    if (v.y < 0.0) { v.y *= -0.04; }
    v.x *= 0.985; v.z *= 0.985;
  }
  // 造浪板
  if (p.x < P.c.x + 0.007 && p.y < P.c.z) {
    p.x = P.c.x + 0.007;
    v.x = max(v.x, P.c.y);
  }
  // 球
  let nb = u32(P.e.y);
  for (var b = 0u; b < nb; b++) {
    let d = p - balls[b].pos.xyz;
    let r = balls[b].pos.w + 0.007;
    let l2 = dot(d, d);
    if (l2 < r * r && l2 > 1e-10) {
      let l = sqrt(l2);
      let n = d / l;
      p = balls[b].pos.xyz + n * r;
      let rel = v - balls[b].vel.xyz;
      let rn = dot(rel, n);
      if (rn < 0.0) { v -= n * rn * 1.05; }
    }
  }
  parts[idx].pos = vec4f(p, parts[idx].pos.w);
  parts[idx].vel = vec4f(v, parts[idx].vel.w);
}
// ---------- 球受流体作用 ----------
fn cellVelAt(i: u32, j: u32, k: u32, base: u32) -> vec3f {
  let u = 0.5 * (grid[base + uIdx(i, j, k)] + grid[base + uIdx(i + 1u, j, k)]);
  let v = 0.5 * (grid[base + vIdx(i, j, k)] + grid[base + vIdx(i, j + 1u, k)]);
  let w = 0.5 * (grid[base + wIdx(i, j, k)] + grid[base + wIdx(i, j, k + 1u)]);
  return vec3f(u, v, w);
}
@compute @workgroup_size(64) fn ballForces(@builtin(global_invocation_id) gid: vec3u) {
  let b = gid.x;
  if (b >= u32(P.e.y)) { return; }
  let bp = balls[b].pos.xyz;
  let r = balls[b].pos.w;
  let i0 = max(i32(floor((bp.x - r - 2.0 * H) / H)), 0);
  let i1 = min(i32(ceil((bp.x + r + 2.0 * H) / H)), i32(NX) - 1);
  let j0 = max(i32(floor((bp.y - r - 2.0 * H) / H)), 0);
  let j1 = min(i32(ceil((bp.y + r + 2.0 * H) / H)), i32(NY) - 1);
  let k0 = max(i32(floor((bp.z - r - 2.0 * H) / H)), 0);
  let k1 = min(i32(ceil((bp.z + r + 2.0 * H) / H)), i32(NZ) - 1);
  var totalW = 0.0; var subW = 0.0;
  var velSum = vec3f(0.0); var accSum = vec3f(0.0);
  for (var k = k0; k <= k1; k++) { for (var j = j0; j <= j1; j++) { for (var i = i0; i <= i1; i++) {
    let cc = vec3f((f32(i) + 0.5) * H, (f32(j) + 0.5) * H, (f32(k) + 0.5) * H);
    let d = length(cc - bp);
    let w = clamp((r + 1.2 * H - d) / (1.2 * H), 0.0, 1.0);
    if (w <= 0.0) { continue; }
    let t = grid[OTYPE + cIdx(u32(i), u32(j), u32(k))];
    if (t == SOLID) { continue; }
    totalW += w;
    if (t == FLUID) {
      subW += w;
      let cv = cellVelAt(u32(i), u32(j), u32(k), OU);
      let cvO = cellVelAt(u32(i), u32(j), u32(k), OUO);
      velSum += w * cv;
      accSum += w * (cv - cvO) / P.a.x;
    }
  }}}
  let sub = select(0.0, subW / totalW, totalW > 0.0);
  let avgV = select(vec3f(0.0), velSum / subW, subW > 0.0);
  let avgA = select(vec3f(0.0), accSum / subW, subW > 0.0);
  // 表面高度
  let ci = clamp(u32(bp.x / H), 0u, NX - 1u);
  let ck = clamp(u32(bp.z / H), 0u, NZ - 1u);
  var surfY = 0.0;
  for (var j = i32(NY) - 1; j >= 0; j--) {
    if (grid[OTYPE + cIdx(ci, u32(j), ck)] == FLUID) { surfY = (f32(j) + 1.0) * H; break; }
  }
  bforce[b * 2u] = vec4f(sub, avgV);
  bforce[b * 2u + 1u] = vec4f(surfY, avgA);
}
// ---------- 表面信息（焦散 / 活动度） ----------
@compute @workgroup_size(128) fn surfInfoK(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= NX * NZ) { return; }
  let i = idx % NX; let k = idx / NX;
  var surfY = 0.0; var act = 0.0; var foam = 0.0; var cnt = 0.0;
  var top = -1;
  for (var j = i32(NY) - 1; j >= 0; j--) {
    if (grid[OTYPE + cIdx(i, u32(j), k)] == FLUID) { top = j; surfY = (f32(j) + 1.0) * H; break; }
  }
  if (top >= 0) {
    for (var j = max(top - 6, 0); j <= top; j++) {
      let cv = cellVelAt(i, u32(j), k, OU);
      act += length(cv);
      cnt += 1.0;
    }
    act = act / max(cnt, 1.0) / 2.5;
  }
  textureStore(surfInfo, vec2i(i32(i), i32(k)), vec4f(surfY, clamp(act, 0.0, 1.0), foam, 1.0));
}
`;
window.FLUID_WGSL = FLUID_WGSL;
