// 三维 PIC/FLIP 水体（WebGPU 计算着色器，粒子—网格混合，MAC 交错网格）
// storage buffer（单阶段上限 8）：
//  g0: P uniform, particles, pvel(w=泡沫)
//  g1: velAll(面速度, atomic/vec4 复用), velOld, press(压力+计数), infoField(水面信息)
const WATER_COMMON = `
struct P {
  dims    : vec4<u32>,   // nx, ny, nz, nParticles
  phys    : vec4<f32>,   // h, dt, gravity, flip
  sim     : vec4<f32>,   // restMass, iters, unused, time
  tank    : vec4<f32>,   // Lx, Ly, Lz, paddleX
  extra   : vec4<f32>,   // paddleV, divSign, radius, ballCount
  nfaces  : vec4<u32>,   // U, V, NF, 0
  balls   : array<vec4<f32>, 16>,
  ballVel : array<vec4<f32>, 16>,
};
@group(0) @binding(0) var<uniform> p : P;
@group(0) @binding(1) var<storage, read_write> particles : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> pvel : array<vec4<f32>>;
@group(1) @binding(0) var<storage, read_write> velAll : array<atomic<i32>>;
@group(1) @binding(1) var<storage, read_write> velOld : array<vec4<f32>>;
@group(1) @binding(2) var<storage, read_write> press  : array<atomic<i32>>;
@group(1) @binding(3) var<storage, read_write> infoF  : array<vec4<f32>>;

const FIX : f32 = 65536.0;

fn cellIdx(i: i32, j: i32, k: i32) -> u32 {
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  return u32(i + nx * (j + ny * k));
}
fn cellCount() -> u32 { return p.dims.x * p.dims.y * p.dims.z; }
fn uIdx(i: i32, j: i32, k: i32) -> u32 {
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  return u32(i + (nx + 1) * (j + ny * k));
}
fn vIdx(i: i32, j: i32, k: i32) -> u32 {
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  return p.nfaces.x + u32(i + nx * (j + (ny + 1) * k));
}
fn wIdx(i: i32, j: i32, k: i32) -> u32 {
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  return p.nfaces.x + p.nfaces.y + u32(i + nx * (j + ny * k));
}
fn vGet(id: u32) -> vec4<f32> {
  return vec4<f32>(
    bitcast<f32>(atomicLoad(&velAll[id * 4u])),
    bitcast<f32>(atomicLoad(&velAll[id * 4u + 1u])),
    bitcast<f32>(atomicLoad(&velAll[id * 4u + 2u])),
    bitcast<f32>(atomicLoad(&velAll[id * 4u + 3u])));
}
fn vSet(id: u32, v: vec4<f32>) {
  atomicExchange(&velAll[id * 4u], bitcast<i32>(v.x));
  atomicExchange(&velAll[id * 4u + 1u], bitcast<i32>(v.y));
  atomicExchange(&velAll[id * 4u + 2u], bitcast<i32>(v.z));
  atomicExchange(&velAll[id * 4u + 3u], bitcast<i32>(v.w));
}
fn pGet(id: u32) -> f32 { return bitcast<f32>(atomicLoad(&press[id * 4u])); }
fn pSet(id: u32, val: f32) { atomicExchange(&press[id * 4u], bitcast<i32>(val)); }
fn pMass(id: u32) -> f32 { return f32(atomicLoad(&press[id * 4u + 2u])) / FIX; }
fn pRhs(id: u32) -> f32 { return bitcast<f32>(atomicLoad(&press[id * 4u + 1u])); }
fn isSolidFace(id: u32) -> bool { return vGet(id).w < -0.5; }
`;

const WATER_CLEAR = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.nfaces.z) { return; }
  let cur = vGet(id);
  if (cur.w < -0.5) { return; }
  vSet(id, vec4<f32>(0.0));
}
`;

const WATER_COPYOLD = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.nfaces.z) { return; }
  let v = vGet(id);
  velOld[id] = vec4<f32>(v.xyz, 0.0);
}
`;

const WATER_MARK = WATER_COMMON + `
fn faceSolid(axis: i32, i: i32, j: i32, k: i32) -> bool {
  let h = p.phys.x;
  var x = f32(i) * h;
  var y = (f32(j) + 0.5) * h;
  var z = (f32(k) + 0.5) * h;
  if (axis == 1) { x = (f32(i) + 0.5) * h; y = f32(j) * h; }
  if (axis == 2) { x = (f32(i) + 0.5) * h; y = (f32(j) + 0.5) * h; z = f32(k) * h; }
  if (axis == 0 && (i <= 0 || i >= i32(p.dims.x))) { return true; }
  if (axis == 1 && (j <= 0 || j >= i32(p.dims.y))) { return true; }
  if (axis == 2 && (k <= 0 || k >= i32(p.dims.z))) { return true; }
  if (x < p.tank.w) { return true; }
  let bc = i32(p.extra.w);
  for (var b = 0; b < 16; b = b + 1) {
    if (b >= bc) { break; }
    let bb = p.balls[b];
    let dx = x - bb.x; let dy = y - bb.y; let dz = z - bb.z;
    if (dx * dx + dy * dy + dz * dz < bb.w * bb.w) { return true; }
  }
  return false;
}
fn faceVel(axis: i32, i: i32, j: i32, k: i32) -> vec3<f32> {
  let h = p.phys.x;
  var x = f32(i) * h;
  var y = (f32(j) + 0.5) * h;
  var z = (f32(k) + 0.5) * h;
  if (axis == 1) { x = (f32(i) + 0.5) * h; y = f32(j) * h; }
  if (axis == 2) { x = (f32(i) + 0.5) * h; y = (f32(j) + 0.5) * h; z = f32(k) * h; }
  if (x < p.tank.w) { return vec3<f32>(p.extra.x, 0.0, 0.0); }
  let bc = i32(p.extra.w);
  for (var b = 0; b < 16; b = b + 1) {
    if (b >= bc) { break; }
    let bb = p.balls[b];
    let dx = x - bb.x; let dy = y - bb.y; let dz = z - bb.z;
    if (dx * dx + dy * dy + dz * dz < bb.w * bb.w) { return p.ballVel[b].xyz; }
  }
  return vec3<f32>(0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.nfaces.z) { return; }
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  let U = p.nfaces.x; let V = p.nfaces.y;
  var axis = 0; var i = 0; var j = 0; var k = 0;
  if (id < U) {
    axis = 0; let t = i32(id); i = t % (nx + 1); j = (t / (nx + 1)) % ny; k = t / ((nx + 1) * ny);
  } else if (id < U + V) {
    axis = 1; let t = i32(id - U); i = t % nx; j = (t / nx) % (ny + 1); k = t / (nx * (ny + 1));
  } else {
    axis = 2; let t = i32(id - U - V); i = t % nx; j = (t / nx) % ny; k = t / (nx * ny);
  }
  if (faceSolid(axis, i, j, k)) {
    vSet(id, vec4<f32>(faceVel(axis, i, j, k), -1.0));
  } else {
    let cur = vGet(id);
    if (cur.w < -0.5) { vSet(id, vec4<f32>(0.0)); }
  }
}
`;

const WATER_P2G = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.dims.w) { return; }
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let pos = particles[id].xyz;
  let vel = pvel[id].xyz;
  let m = p.sim.x * FIX;
  let mx = i32(m * vel.x);
  let my = i32(m * vel.y);
  let mz = i32(m * vel.z);
  let mm = i32(m);

  let fx = pos.x / h;
  let fy = pos.y / h - 0.5;
  let fz = pos.z / h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = i0 + dx; let jj = j0 + dy; let kk = k0 + dz;
    if (ii < 0 || jj < 0 || kk < 0 || ii > nx || jj >= ny || kk >= nz) { continue; }
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    let fi = uIdx(ii, jj, kk);
    if (isSolidFace(fi)) { continue; }
    atomicAdd(&velAll[fi * 4u], i32(f32(mx) * wgt));
    atomicAdd(&velAll[fi * 4u + 3u], i32(f32(mm) * wgt));
  }
  let gx = pos.x / h - 0.5;
  let gy = pos.y / h;
  let gz = pos.z / h - 0.5;
  let i1 = i32(floor(gx)); let j1 = i32(floor(gy)); let k1 = i32(floor(gz));
  let wx2 = gx - f32(i1); let wy2 = gy - f32(j1); let wz2 = gz - f32(k1);
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = i1 + dx; let jj = j1 + dy; let kk = k1 + dz;
    if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj > ny || kk >= nz) { continue; }
    let wgt = select(1.0 - wx2, wx2, dx == 1) * select(1.0 - wy2, wy2, dy == 1) * select(1.0 - wz2, wz2, dz == 1);
    let fi = vIdx(ii, jj, kk);
    if (isSolidFace(fi)) { continue; }
    atomicAdd(&velAll[fi * 4u + 1u], i32(f32(my) * wgt));
    atomicAdd(&velAll[fi * 4u + 3u], i32(f32(mm) * wgt));
  }
  let gx3 = pos.x / h - 0.5;
  let gy3 = pos.y / h - 0.5;
  let gz3 = pos.z / h;
  let i2 = i32(floor(gx3)); let j2 = i32(floor(gy3)); let k2 = i32(floor(gz3));
  let wx3 = gx3 - f32(i2); let wy3 = gy3 - f32(j2); let wz3 = gz3 - f32(k2);
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = i2 + dx; let jj = j2 + dy; let kk = k2 + dz;
    if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk > nz) { continue; }
    let wgt = select(1.0 - wx3, wx3, dx == 1) * select(1.0 - wy3, wy3, dy == 1) * select(1.0 - wz3, wz3, dz == 1);
    let fi = wIdx(ii, jj, kk);
    if (isSolidFace(fi)) { continue; }
    atomicAdd(&velAll[fi * 4u + 2u], i32(f32(mz) * wgt));
    atomicAdd(&velAll[fi * 4u + 3u], i32(f32(mm) * wgt));
  }
  let ci = i32(clamp(pos.x / h, 0.0, f32(nx - 1)));
  let cj = i32(clamp(pos.y / h, 0.0, f32(ny - 1)));
  let ck = i32(clamp(pos.z / h, 0.0, f32(nz - 1)));
  atomicAdd(&press[cellIdx(ci, cj, ck) * 4u + 2u], i32(p.sim.x * FIX));
}
`;

const WATER_GRID = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.nfaces.z) { return; }
  let rv = vGet(id);
  if (rv.w < -0.5) { return; }
  let w = f32(bitcast<i32>(atomicLoad(&velAll[id * 4u + 3u]))) / FIX;
  var v = vec3<f32>(
    f32(bitcast<i32>(atomicLoad(&velAll[id * 4u]))) / FIX,
    f32(bitcast<i32>(atomicLoad(&velAll[id * 4u + 1u]))) / FIX,
    f32(bitcast<i32>(atomicLoad(&velAll[id * 4u + 2u]))) / FIX);
  if (w > 1e-6) { v = v / w; } else { v = vec3<f32>(0.0); }
  vSet(id, vec4<f32>(v, 1.0));

  let ncol = u32(i32(p.dims.x) * i32(p.dims.z));
  if (id < ncol) {
    let nx = i32(p.dims.x); let ny = i32(p.dims.y);
    let i = i32(id) % nx;
    let k = i32(id) / nx;
    var top = p.phys.x * 0.5;
    var vs = vec3<f32>(0.0);
    for (var j = ny - 1; j >= 0; j = j - 1) {
      if (pMass(cellIdx(i, j, k)) > 1.0) {
        top = (f32(j) + 0.85) * p.phys.x;
        vs = vec3<f32>(vGet(uIdx(i, j, k)).x, vGet(vIdx(i, j, k)).y, vGet(wIdx(i, j, k)).z);
        break;
      }
    }
    let vb = vec3<f32>(vGet(uIdx(i, 0, k)).x, vGet(vIdx(i, 0, k)).y, vGet(wIdx(i, 0, k)).z);
    infoF[id * 2u] = vec4<f32>(top, vs);
    infoF[id * 2u + 1u] = vec4<f32>(vb, 0.0);
  }
}
`;

const WATER_DIV = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= cellCount()) { return; }
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  let k = i32(id) / (nx * ny);
  let j = (i32(id) / nx) % ny;
  let i = i32(id) % nx;
  let h = p.phys.x;
  let uR = vGet(uIdx(i + 1, j, k)).x;
  let uL = vGet(uIdx(i, j, k)).x;
  let vU = vGet(vIdx(i, j + 1, k)).y;
  let vD = vGet(vIdx(i, j, k)).y;
  let wF = vGet(wIdx(i, j, k + 1)).z;
  let wB = vGet(wIdx(i, j, k)).z;
  let div = (uR - uL + vU - vD + wF - wB) / h;
  let alpha = h * h / p.phys.y;
  atomicExchange(&press[id * 4u + 1u], bitcast<i32>(-p.extra.y * alpha * div));
}
`;

const WATER_PRESSURE = WATER_COMMON + `
fn solve(id: u32, i: i32, j: i32, k: i32, nx: i32, ny: i32, nz: i32) {
  let m = pMass(id);
  if (m < 0.9) { pSet(id, 0.0); atomicExchange(&press[id * 4u + 1u], 0); return; }
  var sum = 0.0;
  var cnt = 0.0;
  if (i > 0) { let n = cellIdx(i - 1, j, k); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (i < nx - 1) { let n = cellIdx(i + 1, j, k); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (j > 0) { let n = cellIdx(i, j - 1, k); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (j < ny - 1) { let n = cellIdx(i, j + 1, k); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (k > 0) { let n = cellIdx(i, j, k - 1); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (k < nz - 1) { let n = cellIdx(i, j, k + 1); if (pMass(n) >= 0.9) { sum += pGet(n); } cnt += 1.0; }
  if (cnt < 1.0) { cnt = 1.0; }
  let om = p.sim.z;
  let target = (sum + pRhs(id)) / cnt;
  pSet(id, mix(pGet(id), target, om));
}

@compute @workgroup_size(64)
fn mainEven(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= cellCount()) { return; }
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  let k = i32(id) / (nx * ny);
  let j = (i32(id) / nx) % ny;
  let i = i32(id) % nx;
  if (((i + j + k) & 1) != 0) { return; }
  solve(id, i, j, k, nx, ny, i32(p.dims.z));
}

@compute @workgroup_size(64)
fn mainOdd(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= cellCount()) { return; }
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  let k = i32(id) / (nx * ny);
  let j = (i32(id) / nx) % ny;
  let i = i32(id) % nx;
  if (((i + j + k) & 1) != 1) { return; }
  solve(id, i, j, k, nx, ny, i32(p.dims.z));
}
`;

const WATER_GRAD = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.nfaces.z) { return; }
  let nx = i32(p.dims.x); let ny = i32(p.dims.y);
  let U = p.nfaces.x; let V = p.nfaces.y;
  var axis = 0; var i = 0; var j = 0; var k = 0;
  if (id < U) {
    axis = 0; let t = i32(id); i = t % (nx + 1); j = (t / (nx + 1)) % ny; k = t / ((nx + 1) * ny);
  } else if (id < U + V) {
    axis = 1; let t = i32(id - U); i = t % nx; j = (t / nx) % (ny + 1); k = t / (nx * (ny + 1));
  } else {
    axis = 2; let t = i32(id - U - V); i = t % nx; j = (t / nx) % ny; k = t / (nx * ny);
  }
  let cur = vGet(id);
  if (cur.w < -0.5) { return; }
  let h = p.phys.x;
  let dt = p.phys.y;
  var v = cur.xyz;
  if (axis == 0) {
    var pl = 0.0;
    var pr = 0.0;
    if (i > 0) { let n = cellIdx(i - 1, j, k); if (pMass(n) >= 0.9) { pl = pGet(n); } }
    if (i < nx) { let n = cellIdx(i, j, k); if (pMass(n) >= 0.9) { pr = pGet(n); } }
    v.x = v.x - dt * (pr - pl) / h;
  } else if (axis == 1) {
    var pd = 0.0;
    var pu = 0.0;
    if (j > 0) { let n = cellIdx(i, j - 1, k); if (pMass(n) >= 0.9) { pd = pGet(n); } }
    if (j < ny) { let n = cellIdx(i, j, k); if (pMass(n) >= 0.9) { pu = pGet(n); } }
    v.y = v.y - dt * (pu - pd) / h;
  } else {
    var pb = 0.0;
    var pf = 0.0;
    if (k > 0) { let n = cellIdx(i, j, k - 1); if (pMass(n) >= 0.9) { pb = pGet(n); } }
    if (k < i32(p.dims.z)) { let n = cellIdx(i, j, k); if (pMass(n) >= 0.9) { pf = pGet(n); } }
    v.z = v.z - dt * (pf - pb) / h;
  }
  vSet(id, vec4<f32>(v, 1.0));
}
`;

const WATER_G2P = WATER_COMMON + `
fn sU(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h; let fy = pos.y / h - 0.5; let fz = pos.z / h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx); let jj = clamp(j0 + dy, 0, ny - 1); let kk = clamp(k0 + dz, 0, nz - 1);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += vGet(uIdx(ii, jj, kk)).x * wgt;
  }
  return s;
}
fn sV(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h - 0.5; let fy = pos.y / h; let fz = pos.z / h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx - 1); let jj = clamp(j0 + dy, 0, ny); let kk = clamp(k0 + dz, 0, nz - 1);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += vGet(vIdx(ii, jj, kk)).y * wgt;
  }
  return s;
}
fn sW(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h - 0.5; let fy = pos.y / h - 0.5; let fz = pos.z / h;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx - 1); let jj = clamp(j0 + dy, 0, ny - 1); let kk = clamp(k0 + dz, 0, nz);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += vGet(wIdx(ii, jj, kk)).z * wgt;
  }
  return s;
}
fn oU(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h; let fy = pos.y / h - 0.5; let fz = pos.z / h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx); let jj = clamp(j0 + dy, 0, ny - 1); let kk = clamp(k0 + dz, 0, nz - 1);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += velOld[uIdx(ii, jj, kk)].x * wgt;
  }
  return s;
}
fn oV(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h - 0.5; let fy = pos.y / h; let fz = pos.z / h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx - 1); let jj = clamp(j0 + dy, 0, ny); let kk = clamp(k0 + dz, 0, nz - 1);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += velOld[vIdx(ii, jj, kk)].y * wgt;
  }
  return s;
}
fn oW(pos: vec3<f32>) -> f32 {
  let h = p.phys.x;
  let nx = i32(p.dims.x); let ny = i32(p.dims.y); let nz = i32(p.dims.z);
  let fx = pos.x / h - 0.5; let fy = pos.y / h - 0.5; let fz = pos.z / h;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let wx = fx - f32(i0); let wy = fy - f32(j0); let wz = fz - f32(k0);
  var s = 0.0;
  for (var c = 0; c < 8; c = c + 1) {
    let dx = (c >> 0) & 1; let dy = (c >> 1) & 1; let dz = (c >> 2) & 1;
    let ii = clamp(i0 + dx, 0, nx - 1); let jj = clamp(j0 + dy, 0, ny - 1); let kk = clamp(k0 + dz, 0, nz);
    let wgt = select(1.0 - wx, wx, dx == 1) * select(1.0 - wy, wy, dy == 1) * select(1.0 - wz, wz, dz == 1);
    s += velOld[wIdx(ii, jj, kk)].z * wgt;
  }
  return s;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.dims.w) { return; }
  let pos = particles[id].xyz;
  let gv = vec3<f32>(sU(pos), sV(pos), sW(pos));
  let go = vec3<f32>(oU(pos), oV(pos), oW(pos));
  let flip = p.phys.w;
  var v = pvel[id].xyz;
  v = v + (gv - go) * flip;
  v = mix(v, gv, (1.0 - flip) * 0.9);
  pvel[id] = vec4<f32>(v, pvel[id].w);
}
`;

const WATER_ADVECT = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.dims.w) { return; }
  var pos = particles[id].xyz;
  var vel = pvel[id].xyz;
  if (!(pos.x == pos.x) || !(vel.x == vel.x)) {
    particles[id] = vec4<f32>(1.0, 0.4, 0.7, 1.0);
    pvel[id] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return;
  }
  let dt = p.phys.y;
  vel.y = vel.y - 9.8 * dt;
  let sp = length(vel);
  if (sp > 10.0) { vel = vel * (10.0 / sp); }
  var np = pos + vel * dt;

  let r = p.extra.z;
  let Lx = p.tank.x; let Ly = p.tank.y; let Lz = p.tank.z;
  if (np.x < r) { np.x = r; if (vel.x < 0.0) { vel.x = -vel.x * 0.2; } }
  if (np.x > Lx - r) { np.x = Lx - r; if (vel.x > 0.0) { vel.x = -vel.x * 0.2; } }
  if (np.z < r) { np.z = r; if (vel.z < 0.0) { vel.z = -vel.z * 0.2; } }
  if (np.z > Lz - r) { np.z = Lz - r; if (vel.z > 0.0) { vel.z = -vel.z * 0.2; } }
  if (np.y < r) {
    np.y = r;
    if (vel.y < 0.0) { vel.y = -vel.y * 0.08; vel.x = vel.x * 0.92; vel.z = vel.z * 0.92; }
  }
  if (np.y > Ly - r) { np.y = Ly - r; if (vel.y > 0.0) { vel.y = 0.0; } }
  let pd = p.tank.w;
  if (np.x < pd + r * 0.5) { np.x = pd + r * 0.5; if (vel.x < p.extra.x) { vel.x = p.extra.x; } }

  let bc = i32(p.extra.w);
  for (var b = 0; b < 16; b = b + 1) {
    if (b >= bc) { break; }
    let bb = p.balls[b];
    let dvec = np - bb.xyz;
    let dl = length(dvec);
    if (dl < bb.w + r * 0.6 && dl > 1e-5) {
      let nrm = dvec / dl;
      np = bb.xyz + nrm * (bb.w + r * 0.6);
      let vn = dot(vel, nrm);
      let bv = p.ballVel[b].xyz;
      if (vn < dot(bv, nrm)) { vel = vel + nrm * (dot(bv, nrm) - vn); }
    }
  }

  particles[id] = vec4<f32>(np, 1.0);
  let tg = smoothstep(1.0, 4.0, length(vel));
  let foam = max(pvel[id].w * 0.98, tg);
  pvel[id] = vec4<f32>(vel, foam);
}
`;

const WATER_PUSH = WATER_COMMON + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= p.dims.w) { return; }
  let pos = particles[id].xyz;
  let pd = p.tank.w;
  let r = p.extra.z;
  let band = 0.16;
  if (pos.x < pd + r + band) {
    var v = pvel[id].xyz;
    let wgt = 1.0 - smoothstep(pd + r, pd + r + band, pos.x);
    v.x = mix(v.x, p.extra.x, wgt * 0.9);
    pvel[id] = vec4<f32>(v, pvel[id].w);
  }
}
`;

const WATER_SPLAT = `
struct SU {
  viewProj : mat4x4<f32>,
  misc : vec4<f32>,
  camPos : vec4<f32>,
  res : vec4<f32>,
};
@group(0) @binding(0) var<uniform> su : SU;
@group(0) @binding(1) var<storage, read> particles : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> pvel : array<vec4<f32>>;

struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) depth : f32,
  @location(1) local : vec2<f32>,
  @location(2) foam : f32,
};

@vertex fn vs(@builtin(instance_index) ii: u32, @builtin(vertex_index) vi: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let c = corners[vi];
  let pw = particles[ii].xyz;
  let clip = su.viewProj * vec4<f32>(pw, 1.0);
  var o: VOut;
  if (clip.w <= 0.03) {
    o.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    o.depth = 1.0; o.local = vec2<f32>(0.0); o.foam = 0.0;
    return o;
  }
  let r = su.misc.x;
  let ndc = vec2<f32>(r * su.misc.y / clip.w, r * su.misc.z / clip.w);
  o.clip = vec4<f32>(clip.xy + c * ndc * clip.w, clip.z, clip.w);
  o.depth = clip.w - r * sqrt(max(1.0 - dot(c, c), 0.0)) * 0.8;
  o.local = c;
  o.foam = pvel[ii].w;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4<f32> {
  let w = sqrt(max(1.0 - dot(i.local, i.local), 0.0));
  return vec4<f32>(0.0, w, i.foam * w * 7.0, 0.0);
}

@fragment fn fsDepth(i: VOut) -> @location(0) f32 {
  return i.depth;
}
`;

function createWater(cfg) {
  const d = GPU.device;
  const Lx = cfg.Lx, Ly = cfg.Ly, Lz = cfg.Lz;
  const h = cfg.h;
  const nx = Math.max(4, Math.round(Lx / h));
  const ny = Math.max(4, Math.round(Ly / h));
  const nz = Math.max(4, Math.round(Lz / h));
  const cells = nx * ny * nz;
  const cols = nx * nz;
  const U = (nx + 1) * ny * nz;
  const V = nx * (ny + 1) * nz;
  const NF = U + V + nx * ny * (nz + 1);

  const W = {
    Lx, Ly, Lz, h, nx, ny, nz, cells, cols, NF, U, V,
    nParticles: 0, time: 0, substeps: 3, pressureIters: 20,
    paddleBase: 0.05, paddleAmp: 0.0, paddleFreq: 0.8, waveOn: false,
    paddleX: 0.05, paddleV: 0,
    balls: [],
    info: null, infoReady: false, readBusy: false,
    flip: 0.95, divSign: 1.0, omega: 1.0,
  };

  const mkbuf = (size, usage, label) => d.createBuffer({ size, usage, label });

  W.velBuf = mkbuf(NF * 16, BUF.STORAGE | BUF.COPY_DST | BUF.COPY_SRC, 'water-vel');
  W.velOldBuf = mkbuf(NF * 16, BUF.STORAGE | BUF.COPY_DST | BUF.COPY_SRC, 'water-velOld');
  W.pressBuf = mkbuf(cells * 16, BUF.STORAGE | BUF.COPY_DST | BUF.COPY_SRC, 'water-press');
  W.infoBuf = mkbuf(cols * 32, BUF.STORAGE | BUF.COPY_SRC | BUF.COPY_DST, 'water-info');
  W.infoRead = mkbuf(cols * 32, BUF.COPY_DST | BUF.MAP_READ, 'water-info-read');

  W.ub = mkbuf(1024, BUF.UNIFORM | BUF.COPY_DST, 'water-params');
  W.params = new Float32Array(256);
  W.paramsU32 = new Uint32Array(W.params.buffer);
  W.ballData = new Float32Array(16 * 4);
  W.ballVelData = new Float32Array(16 * 4);

  const mods = {
    clear: d.createShaderModule({ code: WATER_CLEAR }),
    copyOld: d.createShaderModule({ code: WATER_COPYOLD }),
    mark: d.createShaderModule({ code: WATER_MARK }),
    p2g: d.createShaderModule({ code: WATER_P2G }),
    grid: d.createShaderModule({ code: WATER_GRID }),
    div: d.createShaderModule({ code: WATER_DIV }),
    pressure: d.createShaderModule({ code: WATER_PRESSURE }),
    grad: d.createShaderModule({ code: WATER_GRAD }),
    g2p: d.createShaderModule({ code: WATER_G2P }),
    advect: d.createShaderModule({ code: WATER_ADVECT }),
    push: d.createShaderModule({ code: WATER_PUSH }),
  };
  const bgl0 = d.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const bgl1 = d.createBindGroupLayout({
    entries: [0, 1, 2, 3].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } })),
  });
  const layout = d.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });
  const mk = (mod, ep) => d.createComputePipeline({ layout, compute: { module: mod, entryPoint: ep } });
  W.pipe = {
    clear: mk(mods.clear, 'main'),
    copyOld: mk(mods.copyOld, 'main'),
    mark: mk(mods.mark, 'main'),
    p2g: mk(mods.p2g, 'main'),
    grid: mk(mods.grid, 'main'),
    div: mk(mods.div, 'main'),
    pEven: mk(mods.pressure, 'mainEven'),
    pOdd: mk(mods.pressure, 'mainOdd'),
    grad: mk(mods.grad, 'main'),
    g2p: mk(mods.g2p, 'main'),
    advect: mk(mods.advect, 'main'),
    push: mk(mods.push, 'main'),
  };

  const splatBGL = d.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const splatLayout = d.createPipelineLayout({ bindGroupLayouts: [splatBGL] });
  const suUB = mkbuf(128, BUF.UNIFORM | BUF.COPY_DST, 'splat-ub');
  W.suUB = suUB;
  W.suData = new Float32Array(24);
  const splatMod = d.createShaderModule({ code: WATER_SPLAT });
  W.pipes = {
    thick: d.createRenderPipeline({
      layout: splatLayout,
      vertex: { module: splatMod, entryPoint: 'vs' },
      fragment: {
        module: splatMod, entryPoint: 'fs',
        targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    }),
    depth: d.createRenderPipeline({
      layout: splatLayout,
      vertex: { module: splatMod, entryPoint: 'vs' },
      fragment: { module: splatMod, entryPoint: 'fsDepth', targets: [{ format: 'r32float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    }),
  };

  W.rebuild = function () {
    W.bg = [
      d.createBindGroup({
        layout: bgl0,
        entries: [
          { binding: 0, resource: { buffer: W.ub } },
          { binding: 1, resource: { buffer: W.pPosBuf } },
          { binding: 2, resource: { buffer: W.pVelBuf } },
        ],
      }),
      d.createBindGroup({
        layout: bgl1,
        entries: [
          { binding: 0, resource: { buffer: W.velBuf } },
          { binding: 1, resource: { buffer: W.velOldBuf } },
          { binding: 2, resource: { buffer: W.pressBuf } },
          { binding: 3, resource: { buffer: W.infoBuf } },
        ],
      }),
    ];
    W.splatBG = d.createBindGroup({
      layout: splatBGL,
      entries: [
        { binding: 0, resource: { buffer: suUB } },
        { binding: 1, resource: { buffer: W.pPosBuf } },
        { binding: 2, resource: { buffer: W.pVelBuf } },
      ],
    });
  };

  W.init = function (seed = 7) {
    const rng = makeRng(seed);
    const spacing = h * 0.5;
    const pts = [];
    const nxp = Math.floor((Lx - 2 * h) / spacing);
    const nzp = Math.floor((Lz - 2 * h) / spacing);
    const nyp = Math.floor((cfg.waterLevel - h) / spacing);
    for (let k = 0; k < nzp; k++) {
      for (let i = 0; i < nxp; i++) {
        for (let j = 0; j < nyp; j++) {
          pts.push(
            h + (i + 0.5) * spacing + (rng() - 0.5) * spacing * 0.12,
            h + (j + 0.5) * spacing + (rng() - 0.5) * spacing * 0.12,
            h + (k + 0.5) * spacing + (rng() - 0.5) * spacing * 0.12);
        }
      }
    }
    const n = pts.length / 3;
    W.nParticles = n;
    W.pPosBuf = d.createBuffer({ size: n * 16, usage: BUF.STORAGE | BUF.COPY_DST | BUF.COPY_SRC, label: 'water-pPos' });
    W.pVelBuf = d.createBuffer({ size: n * 16, usage: BUF.STORAGE | BUF.COPY_DST | BUF.COPY_SRC, label: 'water-pVel' });
    const parr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      parr[i * 4] = pts[i * 3];
      parr[i * 4 + 1] = pts[i * 3 + 1];
      parr[i * 4 + 2] = pts[i * 3 + 2];
      parr[i * 4 + 3] = 1;
    }
    d.queue.writeBuffer(W.pPosBuf, 0, parr);
    d.queue.writeBuffer(W.pVelBuf, 0, new Float32Array(n * 4));
    d.queue.writeBuffer(W.velBuf, 0, new Float32Array(NF * 4));
    d.queue.writeBuffer(W.velOldBuf, 0, new Float32Array(NF * 4));
    d.queue.writeBuffer(W.pressBuf, 0, new Float32Array(cells * 4));
    W.rebuild();
    W.time = 0;
    W.info = null;
    W.infoReady = false;
    W.readBusy = false;
  };

  W.setParams = function (dt, balls) {
    const p = W.params;
    const pu = W.paramsU32;
    const bc = Math.min(16, balls ? balls.length : 0);
    for (let i = 0; i < 16; i++) {
      const b = balls && i < bc ? balls[i] : null;
      this.ballData[i * 4] = b ? b.x : 0;
      this.ballData[i * 4 + 1] = b ? b.y : -99;
      this.ballData[i * 4 + 2] = b ? b.z : 0;
      this.ballData[i * 4 + 3] = b ? b.r : 0;
      this.ballVelData[i * 4] = b ? b.vx : 0;
      this.ballVelData[i * 4 + 1] = b ? b.vy : 0;
      this.ballVelData[i * 4 + 2] = b ? b.vz : 0;
      this.ballVelData[i * 4 + 3] = 0;
    }
    pu[0] = nx; pu[1] = ny; pu[2] = nz; pu[3] = W.nParticles;
    pu[20] = U; pu[21] = V; pu[22] = NF; pu[23] = 0;
    p[4] = h; p[5] = dt; p[6] = -9.8; p[7] = W.flip;
    p[8] = 1.0; p[9] = W.pressureIters; p[10] = W.omega; p[11] = W.time;
    p[12] = Lx; p[13] = Ly; p[14] = Lz; p[15] = W.paddleX;
    p[16] = W.paddleV; p[17] = W.divSign; p[18] = h * 0.7; p[19] = bc;
    p.set(this.ballData, 24);
    p.set(this.ballVelData, 88);
    d.queue.writeBuffer(W.ub, 0, p);
  };

  W.prime = function () {
    if (!W.nParticles) return;
    W.setParams(1 / 180, W.balls);
    const cg = (n) => Math.ceil(n / 64);
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, W.bg[0]);
    pass.setBindGroup(1, W.bg[1]);
    pass.setPipeline(W.pipe.clear); pass.dispatchWorkgroups(cg(NF));
    pass.setPipeline(W.pipe.p2g); pass.dispatchWorkgroups(cg(W.nParticles));
    pass.setPipeline(W.pipe.grid); pass.dispatchWorkgroups(cg(NF));
    pass.end();
    d.queue.submit([enc.finish()]);
  };

  W.step = function (dt, balls) {
    if (balls) W.balls = balls;
    if (!W.nParticles) return;
    if (W.waveOn) {
      const w = 2 * Math.PI * W.paddleFreq;
      W.paddleX = W.paddleBase + (Math.sin(W.time * w) * 0.5 + 0.5) * 2 * W.paddleAmp;
      W.paddleV = Math.cos(W.time * w) * W.paddleAmp * w;
    } else {
      W.paddleX += (W.paddleBase - W.paddleX) * Math.min(1, dt * 4);
      W.paddleV = 0;
    }
    const sub = W.substeps;
    const sdt = dt / sub;
    const cg = (n) => Math.ceil(n / 64);
    for (let s = 0; s < sub; s++) {
      W.setParams(sdt, W.balls);
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setBindGroup(0, W.bg[0]);
      pass.setBindGroup(1, W.bg[1]);
      pass.setPipeline(W.pipe.copyOld); pass.dispatchWorkgroups(cg(NF));
      pass.setPipeline(W.pipe.mark); pass.dispatchWorkgroups(cg(NF));
      pass.setPipeline(W.pipe.clear); pass.dispatchWorkgroups(cg(NF));
      pass.setPipeline(W.pipe.push); pass.dispatchWorkgroups(cg(W.nParticles));
      pass.setPipeline(W.pipe.p2g); pass.dispatchWorkgroups(cg(W.nParticles));
      pass.setPipeline(W.pipe.grid); pass.dispatchWorkgroups(cg(NF));
      pass.setPipeline(W.pipe.div); pass.dispatchWorkgroups(cg(cells));
      let iters = W.pressureIters;
      if (iters % 2 === 1) iters += 1;
      for (let it = 0; it < iters; it++) {
        pass.setPipeline(it % 2 === 0 ? W.pipe.pEven : W.pipe.pOdd);
        pass.dispatchWorkgroups(cg(cells));
      }
      pass.setPipeline(W.pipe.grad); pass.dispatchWorkgroups(cg(NF));
      pass.setPipeline(W.pipe.g2p); pass.dispatchWorkgroups(cg(W.nParticles));
      pass.setPipeline(W.pipe.advect); pass.dispatchWorkgroups(cg(W.nParticles));
      pass.end();
      if (s === sub - 1 && !W.readBusy) enc.copyBufferToBuffer(W.infoBuf, 0, W.infoRead, 0, cols * 32);
      d.queue.submit([enc.finish()]);
      W.time += sdt;
    }
  };

  W.asyncReadInfo = async function () {
    if (W.readBusy) return;
    W.readBusy = true;
    try {
      await d.queue.onSubmittedWorkDone();
      await W.infoRead.mapAsync(GPUMapMode.READ);
      const arr = new Float32Array(W.infoRead.getMappedRange().slice(0));
      W.infoRead.unmap();
      W.info = { nx, nz, data: arr };
      W.infoReady = true;
    } catch (e) { /* ignore */ }
    W.readBusy = false;
  };

  function sampleInfo(x, z, off) {
    if (!W.info) return 0;
    const fx = Math.min(Math.max(x / h - 0.5, 0), nx - 1.001);
    const fz = Math.min(Math.max(z / h - 0.5, 0), nz - 1.001);
    const i0 = Math.floor(fx), k0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - k0;
    const dd = W.info.data;
    const s = (i, k) => dd[(i + nx * k) * 8 + off];
    const h00 = s(i0, k0), h10 = s(i0 + 1, k0), h01 = s(i0, k0 + 1), h11 = s(i0 + 1, k0 + 1);
    const a = h00 + (h10 - h00) * tx, b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }
  W.sampleHeight = function (x, z) {
    if (!W.info) return cfg.waterLevel;
    return Math.max(sampleInfo(x, z, 1), h * 0.4);
  };
  W.sampleSurfVel = function (x, z) {
    return [sampleInfo(x, z, 2), sampleInfo(x, z, 3), sampleInfo(x, z, 4)];
  };
  W.sampleBottomVel = function (x, z) {
    return [sampleInfo(x, z, 5), sampleInfo(x, z, 6), sampleInfo(x, z, 7)];
  };

  W.writeSplatUniform = function (viewProj, camPos, radius, fy, fx) {
    const s = W.suData;
    s.set(viewProj, 0);
    s[16] = radius; s[17] = fy; s[18] = fx; s[19] = W.time;
    s[20] = camPos[0]; s[21] = camPos[1]; s[22] = camPos[2]; s[23] = 1;
    d.queue.writeBuffer(W.suUB, 0, s);
  };
  W.renderDepth = function (pass, viewProj, camPos, radius, fy, fx) {
    W.writeSplatUniform(viewProj, camPos, radius, fy, fx);
    pass.setPipeline(W.pipes.depth);
    pass.setBindGroup(0, W.splatBG);
    pass.draw(6, W.nParticles);
  };
  W.renderThick = function (pass, viewProj, camPos, radius, fy, fx) {
    W.writeSplatUniform(viewProj, camPos, radius, fy, fx);
    pass.setPipeline(W.pipes.thick);
    pass.setBindGroup(0, W.splatBG);
    pass.draw(6, W.nParticles);
  };

  return W;
}