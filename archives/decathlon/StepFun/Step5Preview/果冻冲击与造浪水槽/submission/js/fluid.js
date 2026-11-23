window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;

  const LX = 2.002, LY = 1.056, LZ = 1.012;
  const NX = 91, NY = 48, NZ = 46, H = LX / NX;
  const N = NX * NY * NZ;
  const WATER_Y = 0.56;
  const PPC = 5;
  const MAXB = 26;
  const HINGE = [0.30, 0.0, 0.5], PLEN = 0.66, PHW = 0.44, PHT = 0.014;

  let dev = null, ready = false;
  let numP = 0;
  let bufs = {}, pipes = {}, bgl = null, bg = null, paramsUBO = null;
  const paramsData = new ArrayBuffer(96);
  const pF = new Float32Array(paramsData);
  const pU = new Uint32Array(paramsData);
  let denTex = null, denView = null;
  let ballBuf = null;
  const ballData = new Float32Array(MAXB * 16);
  let ballFluidBuf = null, ballStageBuf = null, mapPending = false;
  const ballFluidRead = new Float32Array(MAXB * 8);
  let paddle = { amp: 0.0, freq: 1.0, omega: 0, angle: 0, time: 0 };
  const substeps = 4, sweeps = 20, flipFrac = 0.955;
  let restDensity = PPC;
  let surfThr = PPC * 0.42;
  let seed = 987654321;

  const WG = `
struct P {
  dt: f32, h: f32, gx: f32, gy: f32,
  nx: u32, ny: u32, nz: u32, numP: u32,
  paddleA: f32, paddleF: f32, paddleT: f32, paddleW: f32,
  restDens: f32, flip: f32, foamSpd: f32, foamDecay: f32,
  nBalls: u32, pRad: f32, surfThr: f32, waterY: f32,
  red: u32, pad0: u32, pad1: u32, pad2: u32,
};
@group(0) @binding(0) var<uniform> P: P;
@group(0) @binding(1) var<storage, read> pPos: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read_write> pVel: array<vec3<f32>>;
@group(0) @binding(3) var<storage, read_write> gVel: array<vec3<f32>>;
@group(0) @binding(4) var<storage, read_write> gVelPrev: array<vec3<f32>>;
@group(0) @binding(5) var<storage, read_write> gVelI: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> gW: array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> gVld: array<atomic<u32>>;
@group(0) @binding(8) var<storage, read_write> gPress: array<f32>;
@group(0) @binding(9) var<storage, read_write> gPress2: array<f32>;
@group(0) @binding(10) var<storage, read_write> gDiv: array<f32>;
@group(0) @binding(11) var<storage, read_write> solid: array<u32>;
@group(0) @binding(12) var<storage, read> balls: array<vec4<f32>>;
@group(0) @binding(13) var<storage, read_write> pDisp: array<vec4<f32>>;
@group(0) @binding(14) var<storage, read_write> pDispVel: array<vec4<f32>>;
@group(0) @binding(15) var<storage, read_write> densA: array<atomic<i32>>;
@group(0) @binding(16) var<storage, read_write> foamA: array<atomic<i32>>;
@group(0) @binding(17) var denTex: texture_storage_3d<rgba16float, write>;
@group(0) @binding(18) var<storage, read_write> ballFluid: array<vec4<f32>>;
@group(0) @binding(19) var<storage, read_write> gFluid: array<u32>;

fn idx(i: i32, j: i32, k: i32) -> i32 { return (k * i32(P.ny) + j) * i32(P.nx) + i; }
fn bPos(b: u32) -> vec4<f32> { return balls[b * 4u]; }
fn bVel(b: u32) -> vec4<f32> { return balls[b * 4u + 1u]; }
fn toI(x: f32) -> i32 { let s = sign(x); return i32(s * floor(abs(x) * 65536.0 + 0.5)); }
fn terrainH(x: f32, z: f32) -> f32 {
  var t = 0.0;
  t = t + 0.215 * smoothstep(1.02, 1.86, x);
  let dx = x - 0.50; let dz = z - 0.50;
  t = t + 0.155 * exp(-(dx * dx / 0.10 + dz * dz / 0.15));
  let ex = x - 0.98; let ez = z - 0.30;
  t = t - 0.075 * exp(-(ex * ex / 0.045 + ez * ez / 0.05));
  let fx = x - 1.60; let fz = z - 0.74;
  t = t + 0.055 * exp(-(fx * fx / 0.02 + fz * fz / 0.02));
  return max(t, 0.0);
}
fn paddleLocal(p: vec3<f32>) -> vec3<f32> {
  let ca = cos(P.paddleA); let sa = sin(P.paddleA);
  let d = p - vec3<f32>(0.30, 0.0, 0.5);
  return vec3<f32>(d.x * sa + d.y * ca, d.x * ca - d.y * sa, d.z);
}
fn paddleWorld(q: vec3<f32>) -> vec3<f32> {
  let ca = cos(P.paddleA); let sa = sin(P.paddleA);
  return vec3<f32>(0.30, 0.0, 0.5) + vec3<f32>(q.x * sa + q.y * ca, q.x * ca - q.y * sa, q.z);
}
`;

  const SH_CLEAR = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  if (i >= i32(P.nx) * i32(P.ny) * i32(P.nz)) { return; }
  gVel[i] = vec3<f32>(0.0);
  gVelPrev[i] = vec3<f32>(0.0);
  gPress[i] = 0.0;
  gPress2[i] = 0.0;
  gDiv[i] = 0.0;
  gFluid[i] = 0u;
  atomicStore(&gVelI[i * 3 + 0], 0);
  atomicStore(&gVelI[i * 3 + 1], 0);
  atomicStore(&gVelI[i * 3 + 2], 0);
  atomicStore(&gW[i], 0);
  atomicStore(&gVld[i], 0u);
}`;

  const SH_SOLID = WG + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x); let j = i32(gid.y); let k = i32(gid.z);
  if (i >= i32(P.nx) || j >= i32(P.ny) || k >= i32(P.nz)) { return; }
  let p = vec3<f32>((f32(i) + 0.5) * P.h, (f32(j) + 0.5) * P.h, (f32(k) + 0.5) * P.h);
  var s = 0u;
  if (i <= 0 || i >= i32(P.nx) - 1 || k <= 0 || k >= i32(P.nz) - 1 || j <= 0) { s = 1u; }
  if (p.y < terrainH(p.x, p.z) + 0.004) { s = 1u; }
  let q = paddleLocal(p);
  if (q.x > -0.02 && q.x < 0.68 && abs(q.z) < 0.45 && abs(q.y) < 0.018) { s = 1u; }
  solid[idx(i, j, k)] = s;
}`;

  const SH_P2G = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pi = gid.x;
  if (pi >= P.numP) { return; }
  let p = pPos[pi];
  let v = pVel[pi];
  let gc = p / P.h - vec3<f32>(0.5);
  let i0 = vec3<i32>(floor(gc));
  let fr = gc - vec3<f32>(i0);
  let dims = vec3<i32>(i32(P.nx), i32(P.ny), i32(P.nz));
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let w = vec3<f32>(select(1.0 - fr.x, fr.x, dx > 0), select(1.0 - fr.y, fr.y, dy > 0), select(1.0 - fr.z, fr.z, dz > 0));
        let ww = w.x * w.y * w.z;
        if (ww <= 0.0001) { continue; }
        let c = i0 + vec3<i32>(dx, dy, dz);
        if (c.x < 0 || c.y < 0 || c.z < 0 || c.x >= dims.x || c.y >= dims.y || c.z >= dims.z) { continue; }
        let id = idx(c.x, c.y, c.z);
        atomicAdd(&gVelI[id * 3 + 0], toI(ww * v.x));
        atomicAdd(&gVelI[id * 3 + 1], toI(ww * v.y));
        atomicAdd(&gVelI[id * 3 + 2], toI(ww * v.z));
        atomicAdd(&gW[id], toI(ww));
        atomicMax(&gVld[id], 1u);
      }
    }
  }
}`;

  const SH_NORM = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  if (i >= i32(P.nx) * i32(P.ny) * i32(P.nz)) { return; }
  let w = f32(gW[i]) / 65536.0;
  let vld = atomicLoad(&gVld[i]);
  if (vld > 0u && w > 0.01 && solid[i] == 0u) {
    gVel[i] = vec3<f32>(f32(gVelI[i * 3 + 0]), f32(gVelI[i * 3 + 1]), f32(gVelI[i * 3 + 2])) / 65536.0 / w;
    gFluid[i] = 1u;
  } else {
    gVel[i] = vec3<f32>(0.0);
    gFluid[i] = 0u;
  }
}`;

  const SH_DIV = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let tot = i32(P.nx) * i32(P.ny) * i32(P.nz);
  if (i >= tot) { return; }
  if (solid[i] != 0u) { gDiv[i] = 0.0; return; }
  let k = i / (i32(P.nx) * i32(P.ny));
  let rem = i - k * i32(P.nx) * i32(P.ny);
  let j = rem / i32(P.nx);
  let ix = rem - j * i32(P.nx);
  let c = vec3<i32>(ix, j, k);
  let u = gVel[i];
  var a = 0.0;
  let offs = array<vec3<i32>, 6>(vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0), vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0), vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
  for (var m = 0; m < 6; m = m + 1) {
    let n = c + offs[m];
    let nrm = vec3<f32>(f32(offs[m].x), f32(offs[m].y), f32(offs[m].z));
    if (n.x < 0 || n.y < 0 || n.z < 0 || n.x >= i32(P.nx) || n.y >= i32(P.ny) || n.z >= i32(P.nz)) {
      a = a + dot(-u, nrm);
    } else {
      let ni = idx(n.x, n.y, n.z);
      if (solid[ni] != 0u) { a = a + dot(-u, nrm); }
      else { a = a + 0.5 * dot(gVel[ni] - u, nrm); }
    }
  }
  gDiv[i] = a;
}`;

  const SH_JAC = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let tot = i32(P.nx) * i32(P.ny) * i32(P.nz);
  if (i >= tot) { return; }
  if (solid[i] != 0u || gFluid[i] == 0u) { return; }
  let k = i / (i32(P.nx) * i32(P.ny));
  let rem = i - k * i32(P.nx) * i32(P.ny);
  let j = rem / i32(P.nx);
  let ix = rem - j * i32(P.nx);
  let colr = (ix + j + k) & 1;
  if (colr != i32(P.red)) { return; }
  let c = vec3<i32>(ix, j, k);
  var sum = 0.0;
  var cnt = 0.0;
  let offs = array<vec3<i32>, 6>(vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0), vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0), vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
  for (var m = 0; m < 6; m = m + 1) {
    let n = c + offs[m];
    if (n.x < 0 || n.y < 0 || n.z < 0 || n.x >= i32(P.nx) || n.y >= i32(P.ny) || n.z >= i32(P.nz)) { continue; }
    let ni = idx(n.x, n.y, n.z);
    if (solid[ni] != 0u) { continue; }
    sum = sum + gPress[ni];
    cnt = cnt + 1.0;
  }
  if (cnt < 0.5) { return; }
  let scale = P.h * P.h / P.dt;
  if (P.red == 0u) { gPress2[i] = (sum - scale * gDiv[i]) / cnt; }
  else { gPress[i] = (sum - scale * gDiv[i]) / cnt; }
}`;

  const SH_APPLY = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let tot = i32(P.nx) * i32(P.ny) * i32(P.nz);
  if (i >= tot) { return; }
  if (solid[i] != 0u || gFluid[i] == 0u) { return; }
  let k = i / (i32(P.nx) * i32(P.ny));
  let rem = i - k * i32(P.nx) * i32(P.ny);
  let j = rem / i32(P.nx);
  let ix = rem - j * i32(P.nx);
  let c = vec3<i32>(ix, j, k);
  let pi = gPress[i];
  var grad = vec3<f32>(0.0);
  let offs = array<vec3<i32>, 6>(vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0), vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0), vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
  for (var m = 0; m < 6; m = m + 1) {
    let n = c + offs[m];
    var pn = 0.0;
    if (n.x >= 0 && n.y >= 0 && n.z >= 0 && n.x < i32(P.nx) && n.y < i32(P.ny) && n.z < i32(P.nz)) {
      let ni = idx(n.x, n.y, n.z);
      pn = select(0.0, gPress[ni], solid[ni] == 0u);
    }
    grad = grad + (pn - pi) * vec3<f32>(f32(offs[m].x), f32(offs[m].y), f32(offs[m].z));
  }
  gVel[i] = gVel[i] - (P.dt / (P.h * P.h)) * grad;
}`;

  const SH_G2P = WG + `
fn tri(p: vec3<f32>, src: u32) -> vec3<f32> {
  let gc = p / P.h - vec3<f32>(0.5);
  let i0 = vec3<i32>(floor(gc));
  let fr = gc - vec3<f32>(i0);
  let dims = vec3<i32>(i32(P.nx), i32(P.ny), i32(P.nz));
  var acc = vec3<f32>(0.0);
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let w = vec3<f32>(select(1.0 - fr.x, fr.x, dx > 0), select(1.0 - fr.y, fr.y, dy > 0), select(1.0 - fr.z, fr.z, dz > 0));
        let ww = w.x * w.y * w.z;
        if (ww <= 0.0) { continue; }
        let c = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        let id = idx(c.x, c.y, c.z);
        if (src == 0u) { acc = acc + ww * gVel[id]; } else { acc = acc + ww * gVelPrev[id]; }
      }
    }
  }
  return acc;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pi = gid.x;
  if (pi >= P.numP) { return; }
  let p = pPos[pi];
  let vn = tri(p, 0u);
  let vo = tri(p, 1u);
  let v = pVel[pi];
  let vflip = v + (vn - vo);
  pVel[pi] = P.flip * vflip + (1.0 - P.flip) * vn;
}`;

  const SH_ADV = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pi = gid.x;
  if (pi >= P.numP) { return; }
  var v = pVel[pi];
  v.y = v.y - 9.81 * P.dt;
  var p = pPos[pi] + v * P.dt;
  let pr = P.pRad;
  let th = terrainH(p.x, p.z) + pr;
  if (p.y < th) {
    p.y = th;
    v.y = max(v.y, 0.0) * 0.25;
    v.x = v.x * 0.86; v.z = v.z * 0.86;
  }
  {
    let q = paddleLocal(p);
    let pl = 0.66; let pw = 0.44; let pt = 0.014;
    let dx = max(-q.x, q.x - pl);
    let dy = abs(q.y) - pt;
    let dz = abs(q.z) - pw;
    let od = length(vec3<f32>(max(dx, 0.0), max(dy, 0.0), max(dz, 0.0)));
    if (od < pr) {
      var lp = vec3<f32>(0.0);
      if (dx > 0.0 || dy > 0.0 || dz > 0.0) {
        lp = normalize(vec3<f32>(max(dx, 0.0), max(dy, 0.0), max(dz, 0.0)) + vec3<f32>(1e-6)) * (pr - od);
      } else {
        var d0 = q.x; lp = vec3<f32>(-1.0, 0.0, 0.0);
        let d1 = pl - q.x; if (d1 < d0) { d0 = d1; lp = vec3<f32>(1.0, 0.0, 0.0); }
        let d2 = pt - abs(q.y); if (d2 < d0) { d0 = d2; lp = vec3<f32>(0.0, select(-1.0, 1.0, q.y > 0.0), 0.0); }
        let d3 = pw - abs(q.z); if (d3 < d0) { d0 = d3; lp = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, q.z > 0.0)); }
        lp = lp * (d0 + pr);
      }
      p = paddleWorld(q + lp);
      let r = p - vec3<f32>(0.30, 0.0, 0.5);
      let vp = vec3<f32>(-P.paddleW * r.y, P.paddleW * r.x, 0.0);
      v = mix(v, vp, 0.9);
    }
  }
  for (var b = 0u; b < P.nBalls; b = b + 1u) {
    let bp = bPos(b).xyz;
    let br = bPos(b).w;
    let bv = bVel(b).xyz;
    let d = p - bp;
    let dist = length(d);
    if (dist < br + pr && dist > 0.00001) {
      let nrm = d / dist;
      p = bp + nrm * (br + pr);
      v = mix(v, bv, 0.7);
    }
  }
  p.x = clamp(p.x, pr, 2.002 - pr);
  p.z = clamp(p.z, pr, 1.012 - pr);
  p.y = min(p.y, 1.056 - pr);
  if (p.y < pr) { p.y = pr; v.y = max(v.y, 0.0) * 0.25; }
  pPos[pi] = p;
  pVel[pi] = v;
  let spd = length(v);
  var amt = 0.0;
  if (p.y > P.waterY + 0.010 && spd > P.foamSpd) {
    amt = clamp((spd - P.foamSpd) / (P.foamSpd * 2.5), 0.0, 1.0);
  }
  pDisp[pi] = vec4<f32>(p, clamp(spd * 0.0055, 0.006, 0.034));
  pDispVel[pi] = vec4<f32>(v, amt);
}`;

  const SH_SPLAT = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let pi = gid.x;
  if (pi >= P.numP) { return; }
  let p = pPos[pi];
  let v = pVel[pi];
  let gc = p / P.h - vec3<f32>(0.5);
  let i0 = vec3<i32>(floor(gc));
  let fr = gc - vec3<f32>(i0);
  let dims = vec3<i32>(i32(P.nx), i32(P.ny), i32(P.nz));
  let spd = length(v);
  let foam = clamp(spd / P.foamSpd - 0.9, 0.0, 1.0);
  for (var dz = -1; dz <= 1; dz = dz + 1) {
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        let w = max(0.0, 1.0 - abs(fr.x - f32(dx))) * max(0.0, 1.0 - abs(fr.y - f32(dy))) * max(0.0, 1.0 - abs(fr.z - f32(dz)));
        if (w <= 0.0001) { continue; }
        let c = i0 + vec3<i32>(dx, dy, dz);
        if (c.x < 0 || c.y < 0 || c.z < 0 || c.x >= dims.x || c.y >= dims.y || c.z >= dims.z) { continue; }
        let id = idx(c.x, c.y, c.z);
        atomicAdd(&densA[id], toI(w));
        if (foam > 0.001) { atomicAdd(&foamA[id], toI(w * foam)); }
      }
    }
  }
}`;

  const SH_CONV = WG + `
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let tot = i32(P.nx) * i32(P.ny) * i32(P.nz);
  if (i >= tot) { return; }
  let c = vec3<i32>(i % i32(P.nx), (i / i32(P.nx)) % i32(P.ny), i / (i32(P.nx) * i32(P.ny)));
  let d = f32(densA[i]) / 65536.0;
  let fnew = f32(foamA[i]) / 65536.0;
  let old = textureLoad(denTex, c).g;
  let f = max(fnew, old * P.foamDecay);
  textureStore(denTex, c, vec4<f32>(d, f, 0.0, 1.0));
}`;

  const SH_BALLS = WG + `
fn triD(p: vec3<f32>) -> f32 {
  let gc = p / P.h - vec3<f32>(0.5);
  let i0 = vec3<i32>(floor(gc));
  let fr = gc - vec3<f32>(i0);
  let dims = vec3<i32>(i32(P.nx), i32(P.ny), i32(P.nz));
  var acc = 0.0;
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let w = vec3<f32>(select(1.0 - fr.x, fr.x, dx > 0), select(1.0 - fr.y, fr.y, dy > 0), select(1.0 - fr.z, fr.z, dz > 0));
        let ww = w.x * w.y * w.z;
        if (ww <= 0.0) { continue; }
        let c = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        acc = acc + ww * textureLoad(denTex, c).r;
      }
    }
  }
  return acc;
}
fn triV(p: vec3<f32>) -> vec3<f32> {
  let gc = p / P.h - vec3<f32>(0.5);
  let i0 = vec3<i32>(floor(gc));
  let fr = gc - vec3<f32>(i0);
  let dims = vec3<i32>(i32(P.nx), i32(P.ny), i32(P.nz));
  var acc = vec3<f32>(0.0);
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let w = vec3<f32>(select(1.0 - fr.x, fr.x, dx > 0), select(1.0 - fr.y, fr.y, dy > 0), select(1.0 - fr.z, fr.z, dz > 0));
        let ww = w.x * w.y * w.z;
        if (ww <= 0.0) { continue; }
        let c = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        acc = acc + ww * gVel[idx(c.x, c.y, c.z)];
      }
    }
  }
  return acc;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let b = gid.x;
  if (b >= P.nBalls) { return; }
  let bp = bPos(b).xyz;
  let br = bPos(b).w;
  let dc = triD(bp);
  var acc = dc;
  acc = acc + triD(bp + vec3<f32>(br, 0.0, 0.0));
  acc = acc + triD(bp - vec3<f32>(br, 0.0, 0.0));
  acc = acc + triD(bp + vec3<f32>(0.0, br, 0.0));
  acc = acc + triD(bp - vec3<f32>(0.0, br, 0.0));
  acc = acc + triD(bp + vec3<f32>(0.0, 0.0, br));
  acc = acc + triD(bp - vec3<f32>(0.0, 0.0, br));
  let rho = acc / (7.0 * max(P.restDens, 0.001));
  let vf = triV(bp);
  ballFluid[b * 2u] = vec4<f32>(rho, vf.x, vf.y, vf.z);
  ballFluid[b * 2u + 1u] = vec4<f32>(clamp(dc / max(P.restDens, 0.001), 0.0, 1.0), 0.0, 0.0, 0.0);
}`;

  function rnd() {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 8) & 0xffffff) / 0xffffff;
  }

  async function init() {
    if (ready) return true;
    dev = APP.R.device();
    let cnt = 0;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cx = (i + 0.5) * H, cy = (j + 0.5) * H, cz = (k + 0.5) * H;
      if (cy > WATER_Y) continue;
      if (cx < 0.34) continue;
      if (cy < terrainHJS(cx, cz) + 0.012) continue;
      cnt += PPC;
    }
    numP = cnt;
    const B = (size, usage) => dev.createBuffer({ size, usage });
    bufs.pPos = B(numP * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.pVel = B(numP * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gVel = B(N * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gVelPrev = B(N * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gVelI = B(N * 12, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gW = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gVld = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gPress = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gPress2 = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gDiv = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.solid = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.gFluid = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.pDisp = B(numP * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.pDispVel = B(numP * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.densA = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    bufs.foamA = B(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    ballBuf = B(MAXB * 64, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    ballFluidBuf = B(MAXB * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    ballStageBuf = B(MAXB * 32, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    paramsUBO = B(96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    denTex = dev.createTexture({ size: [NX, NY, NZ], dimension: '3d', format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    denView = denTex.createView();

    bgl = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 11, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 12, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 13, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 14, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 15, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 16, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 17, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write', format: 'rgba16float', viewDimension: '3d' } },
        { binding: 18, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 19, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    bg = dev.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: paramsUBO } },
        { binding: 1, resource: { buffer: bufs.pPos } },
        { binding: 2, resource: { buffer: bufs.pVel } },
        { binding: 3, resource: { buffer: bufs.gVel } },
        { binding: 4, resource: { buffer: bufs.gVelPrev } },
        { binding: 5, resource: { buffer: bufs.gVelI } },
        { binding: 6, resource: { buffer: bufs.gW } },
        { binding: 7, resource: { buffer: bufs.gVld } },
        { binding: 8, resource: { buffer: bufs.gPress } },
        { binding: 9, resource: { buffer: bufs.gPress2 } },
        { binding: 10, resource: { buffer: bufs.gDiv } },
        { binding: 11, resource: { buffer: bufs.solid } },
        { binding: 12, resource: { buffer: ballBuf } },
        { binding: 13, resource: { buffer: bufs.pDisp } },
        { binding: 14, resource: { buffer: bufs.pDispVel } },
        { binding: 15, resource: { buffer: bufs.densA } },
        { binding: 16, resource: { buffer: bufs.foamA } },
        { binding: 17, resource: denView },
        { binding: 18, resource: { buffer: ballFluidBuf } },
        { binding: 19, resource: { buffer: bufs.gFluid } },
      ],
    });
    const pl = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const mk = (name, code) => {
      pipes[name] = dev.createComputePipeline({ layout: pl, compute: { module: dev.createShaderModule({ code }), entryPoint: 'main' } });
    };
    mk('clear', SH_CLEAR); mk('solid', SH_SOLID); mk('p2g', SH_P2G); mk('norm', SH_NORM);
    mk('div', SH_DIV); mk('jac', SH_JAC); mk('apply', SH_APPLY); mk('g2p', SH_G2P);
    mk('adv', SH_ADV); mk('splat', SH_SPLAT); mk('conv', SH_CONV); mk('balls', SH_BALLS);
    APP.R.setDensityView(denView);
    ready = true;
    return true;
  }

  function smoothstepJS(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function terrainHJS(x, z) {
    let t = 0;
    t += 0.215 * smoothstepJS(1.02, 1.86, x);
    const dx = x - 0.50, dz = z - 0.50;
    t += 0.155 * Math.exp(-(dx * dx / 0.10 + dz * dz / 0.15));
    const ex = x - 0.98, ez = z - 0.30;
    t -= 0.075 * Math.exp(-(ex * ex / 0.045 + ez * ez / 0.05));
    const fx = x - 1.60, fz = z - 0.74;
    t += 0.055 * Math.exp(-(fx * fx / 0.02 + fz * fz / 0.02));
    return Math.max(t, 0);
  }

  function setParams(dt, nBalls) {
    pF[0] = dt; pF[1] = H; pF[2] = 0; pF[3] = -9.81;
    pU[4] = NX; pU[5] = NY; pU[6] = NZ; pU[7] = numP;
    pF[8] = paddle.angle; pF[9] = paddle.freq; pF[10] = paddle.time; pF[11] = paddle.omega;
    pF[12] = restDensity; pF[13] = flipFrac; pF[14] = 1.9; pF[15] = 0.982;
    pU[16] = nBalls; pF[17] = H * 0.42; pF[18] = surfThr; pF[19] = WATER_Y;
    pU[20] = 0; pU[21] = 0; pU[22] = 0; pU[23] = 0;
    dev.queue.writeBuffer(paramsUBO, 0, paramsData);
  }

  function reset() {
    seed = 987654321;
    const pos = new Float32Array(numP * 3);
    const vel = new Float32Array(numP * 3);
    let w = 0;
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cx = (i + 0.5) * H, cy = (j + 0.5) * H, cz = (k + 0.5) * H;
      if (cy > WATER_Y) continue;
      if (cx < 0.34) continue;
      if (cy < terrainHJS(cx, cz) + 0.012) continue;
      for (let m = 0; m < PPC; m++) {
        pos[w * 3] = cx + (rnd() - 0.5) * H * 0.85;
        pos[w * 3 + 1] = cy + (rnd() - 0.5) * H * 0.85;
        pos[w * 3 + 2] = cz + (rnd() - 0.5) * H * 0.85;
        w++;
      }
    }
    dev.queue.writeBuffer(bufs.pPos, 0, pos);
    dev.queue.writeBuffer(bufs.pVel, 0, vel);
    dev.queue.clearBuffer(bufs.densA);
    dev.queue.clearBuffer(bufs.foamA);
    paddle.angle = 0; paddle.omega = 0; paddle.time = 0; paddle.amp = 0; paddle.freq = 1.0;
    mapPending = false;
    for (let i = 0; i < ballFluidRead.length; i++) ballFluidRead[i] = 0;
    const zf = new Float32Array(N);
    dev.queue.writeBuffer(bufs.gVel, 0, zf);
    dev.queue.writeBuffer(bufs.gVelPrev, 0, zf);
    dev.queue.writeBuffer(bufs.gPress, 0, zf);
    dev.queue.writeBuffer(bufs.gPress2, 0, zf);
    dev.queue.writeBuffer(bufs.gFluid, 0, new Uint32Array(N));
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, bg);
    pass.setPipeline(pipes.solid);
    pass.dispatchWorkgroups(Math.ceil(NX / 64), NY, NZ);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  function step(dt, nBalls) {
    if (!ready) return;
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, bg);
    const cellWG = Math.ceil(N / 256);
    const parWG = Math.ceil(numP / 256);
    setParams(dt, nBalls);
    pass.setPipeline(pipes.clear);
    pass.dispatchWorkgroups(cellWG);
    pass.setPipeline(pipes.solid);
    pass.dispatchWorkgroups(Math.ceil(NX / 64), NY, NZ);
    pass.setPipeline(pipes.p2g);
    pass.dispatchWorkgroups(parWG);
    pass.setPipeline(pipes.norm);
    pass.dispatchWorkgroups(cellWG);
    pass.setPipeline(pipes.div);
    pass.dispatchWorkgroups(cellWG);
    for (let s = 0; s < sweeps; s++) {
      pU[20] = 0; dev.queue.writeBuffer(paramsUBO, 0, paramsData);
      pass.setPipeline(pipes.jac);
      pass.dispatchWorkgroups(cellWG);
      pU[20] = 1; dev.queue.writeBuffer(paramsUBO, 0, paramsData);
      pass.setPipeline(pipes.jac);
      pass.dispatchWorkgroups(cellWG);
    }
    pU[20] = 0; dev.queue.writeBuffer(paramsUBO, 0, paramsData);
    pass.setPipeline(pipes.apply);
    pass.dispatchWorkgroups(cellWG);
    pass.setPipeline(pipes.g2p);
    pass.dispatchWorkgroups(parWG);
    pass.setPipeline(pipes.adv);
    pass.dispatchWorkgroups(parWG);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  function postFrame(nBalls) {
    if (!ready) return;
    setParams(1 / 60, nBalls);
    dev.queue.clearBuffer(bufs.densA);
    dev.queue.clearBuffer(bufs.foamA);
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, bg);
    pass.setPipeline(pipes.splat);
    pass.dispatchWorkgroups(Math.ceil(numP / 256));
    pass.setPipeline(pipes.conv);
    pass.dispatchWorkgroups(Math.ceil(N / 256));
    pass.setPipeline(pipes.balls);
    pass.dispatchWorkgroups(Math.ceil(Math.max(nBalls, 1) / 64));
    pass.end();
    enc.copyBufferToBuffer(ballFluidBuf, 0, ballStageBuf, 0, MAXB * 32);
    dev.queue.submit([enc.finish()]);
    if (!mapPending) {
      mapPending = true;
      ballStageBuf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Float32Array(ballStageBuf.getMappedRange());
        ballFluidRead.set(src.subarray(0, MAXB * 8));
        ballStageBuf.unmap();
        mapPending = false;
      }).catch(() => { mapPending = false; });
    }
  }

  function updatePaddle(dt, active) {
    if (!ready) return;
    if (active) {
      paddle.time += dt;
      const w = 2 * Math.PI * paddle.freq;
      paddle.omega = paddle.amp * w * Math.cos(w * paddle.time);
      paddle.angle = paddle.amp * Math.sin(w * paddle.time);
    } else {
      paddle.time += dt;
      const w = 2 * Math.PI * paddle.freq;
      const decay = Math.exp(-dt * 2.2);
      paddle.omega *= decay;
      paddle.angle = paddle.amp * Math.sin(w * paddle.time) * decay;
      if (Math.abs(paddle.angle) < 0.002) { paddle.angle = 0; paddle.omega = 0; }
    }
  }

  APP.F = {
    init, reset, step, postFrame, updatePaddle, terrainHJS,
    dims: () => ({ NX, NY, NZ, H, LX, LY, LZ, WATER_Y, N }),
    numParticles: () => numP,
    ballBuf: () => ballBuf,
    ballData,
    denView: () => denView,
    dispBufs: () => ({ pos: bufs.pDisp, vel: bufs.pDispVel, n: numP }),
    paddle,
    setPaddle: (a, f) => { paddle.amp = a; paddle.freq = f; },
    ballFluidRead,
    isReady: () => ready,
    surfThr,
  };
})();
