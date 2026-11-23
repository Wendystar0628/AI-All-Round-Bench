/* global JW */
var JW = JW || {};

JW.FLUID_WGSL = `
const NX: i32 = 56;
const NY: i32 = 36;
const NZ: i32 = 24;
const MAXB: i32 = 40;

struct Params {
  g0: vec4<f32>,
  g1: vec4<f32>,
  g2: vec4<f32>,
  g3: vec4<f32>,
  g4: vec4<f32>,
  g5: vec4<f32>,
  g6: vec4<f32>,
  g7: vec4<f32>,
  g8: vec4<f32>,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> posA: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velA: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> massU: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> momU: array<atomic<i32>>;
@group(0) @binding(5) var<storage, read_write> massV: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> momV: array<atomic<i32>>;
@group(0) @binding(7) var<storage, read_write> massW: array<atomic<i32>>;
@group(0) @binding(8) var<storage, read_write> momW: array<atomic<i32>>;
@group(0) @binding(9) var<storage, read_write> cellMass: array<atomic<i32>>;
@group(0) @binding(10) var<storage, read_write> u: array<f32>;
@group(0) @binding(11) var<storage, read_write> v: array<f32>;
@group(0) @binding(12) var<storage, read_write> w: array<f32>;
@group(0) @binding(13) var<storage, read_write> uPre: array<f32>;
@group(0) @binding(14) var<storage, read_write> vPre: array<f32>;
@group(0) @binding(15) var<storage, read_write> wPre: array<f32>;
@group(0) @binding(16) var<storage, read_write> cellT: array<u32>;
@group(0) @binding(17) var<storage, read_write> lockU: array<u32>;
@group(0) @binding(18) var<storage, read_write> lockV: array<u32>;
@group(0) @binding(19) var<storage, read_write> lockW: array<u32>;
@group(0) @binding(20) var<storage, read_write> pA: array<f32>;
@group(0) @binding(21) var<storage, read_write> pB: array<f32>;
@group(0) @binding(22) var<storage, read_write> divF: array<f32>;
@group(0) @binding(23) var<storage, read_write> ballA: array<vec4<f32>>;
@group(0) @binding(24) var<storage, read_write> ballB: array<vec4<f32>>;
@group(0) @binding(25) var<storage, read> ballInfo: array<vec4<f32>>;
@group(0) @binding(26) var<storage, read_write> foamP: array<vec4<f32>>;
@group(0) @binding(27) var<storage, read_write> foamV: array<vec4<f32>>;
@group(0) @binding(28) var<storage, read_write> counter: array<atomic<u32>>;
@group(0) @binding(29) var<storage, read> spawns: array<vec4<f32>>;
@group(0) @binding(30) var<storage, read_write> stats: array<atomic<i32>>;

fn nx() -> i32 { return i32(P.g0.x); }
fn ny() -> i32 { return i32(P.g0.y); }
fn nz() -> i32 { return i32(P.g0.z); }
fn dx() -> f32 { return P.g0.w; }
fn dt() -> f32 { return P.g1.x; }
fn rho() -> f32 { return P.g1.y; }
fn grav() -> f32 { return P.g1.z; }
fn flip() -> f32 { return P.g1.w; }
fn origin() -> vec3<f32> { return P.g2.xyz; }
fn pcount() -> u32 { return u32(P.g2.w); }
fn pMass() -> f32 { return P.g3.z; }
fn SCALE() -> f32 { return P.g6.x; }
fn ballCount() -> i32 { return i32(P.g5.w); }
fn ballSide() -> f32 { return P.g8.y; }

fn cId(i: i32, j: i32, k: i32) -> i32 { return (k * ny() + j) * nx() + i; }
fn uId(i: i32, j: i32, k: i32) -> i32 { return (k * ny() + j) * (nx() + 1) + i; }
fn vId(i: i32, j: i32, k: i32) -> i32 { return (k * (ny() + 1) + j) * nx() + i; }
fn wId(i: i32, j: i32, k: i32) -> i32 { return (k * ny() + j) * nx() + i; }

fn inCell(i: i32, j: i32, k: i32) -> bool {
  return i >= 0 && j >= 0 && k >= 0 && i < nx() && j < ny() && k < nz();
}

fn terrainH(x: f32, z: f32) -> f32 {
  let floorY = 0.07;
  let dxv = x - 1.78;
  let dzv = z - 0.58;
  let reef = exp(-(dxv * dxv) / (2.0 * 0.15 * 0.15) - (dzv * dzv) / (2.0 * 0.20 * 0.20)) * 0.18;
  var t = (x - 2.05) / (2.46 - 2.05);
  t = clamp(t, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return floorY + reef + t * 0.40;
}

fn bbase(i: i32) -> i32 { return i * 4; }

fn readBall(i: i32, comp: i32) -> vec4<f32> {
  let id = bbase(i) + comp;
  if (ballSide() < 0.5) { return ballA[id]; }
  return ballB[id];
}

fn writeBall(i: i32, comp: i32, val: vec4<f32>) {
  let id = bbase(i) + comp;
  if (ballSide() < 0.5) { ballB[id] = val; }
  else { ballA[id] = val; }
}

fn ballProps(i: i32) -> vec4<f32> { return ballInfo[i * 2]; }
fn ballColor(i: i32) -> vec4<f32> { return ballInfo[i * 2 + 1]; }

fn hash13(p: vec3<f32>) -> f32 {
  let n = sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453;
  return fract(n);
}

fn sampleU(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x;
  let gy = gp.y - 0.5;
  let gz = gp.z - 0.5;
  let ix = i32(floor(gx));
  let iy = i32(floor(gy));
  let iz = i32(floor(gz));
  let fx = fract(gx);
  let fy = fract(gy);
  let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi > nx() || yi >= ny() || zi >= nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + u[uId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}

fn sampleV(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x - 0.5;
  let gy = gp.y;
  let gz = gp.z - 0.5;
  let ix = i32(floor(gx));
  let iy = i32(floor(gy));
  let iz = i32(floor(gz));
  let fx = fract(gx);
  let fy = fract(gy);
  let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi > ny() || zi >= nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + v[vId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}

fn sampleW(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x - 0.5;
  let gy = gp.y - 0.5;
  let gz = gp.z;
  let ix = i32(floor(gx));
  let iy = i32(floor(gy));
  let iz = i32(floor(gz));
  let fx = fract(gx);
  let fy = fract(gy);
  let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi >= ny() || zi > nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + w[wId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}

fn sampleVel(pos: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(sampleU(pos), sampleV(pos), sampleW(pos));
}

fn sampleUPre(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x; let gy = gp.y - 0.5; let gz = gp.z - 0.5;
  let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
  let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi > nx() || yi >= ny() || zi >= nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + uPre[uId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}
fn sampleVPre(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x - 0.5; let gy = gp.y; let gz = gp.z - 0.5;
  let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
  let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi > ny() || zi >= nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + vPre[vId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}
fn sampleWPre(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx();
  let gx = gp.x - 0.5; let gy = gp.y - 0.5; let gz = gp.z;
  let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
  let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi >= ny() || zi > nz()) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + wPre[wId(xi, yi, zi)] * wx * wy * wz;
      }
    }
  }
  return s;
}
fn sampleVelPre(pos: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(sampleUPre(pos), sampleVPre(pos), sampleWPre(pos));
}

fn sampleMass(pos: vec3<f32>) -> f32 {
  let gp = (pos - origin()) / dx() - vec3<f32>(0.5);
  let ix = i32(floor(gp.x));
  let iy = i32(floor(gp.y));
  let iz = i32(floor(gp.z));
  let fx = fract(gp.x); let fy = fract(gp.y); let fz = fract(gp.z);
  var s = 0.0;
  for (var a = 0; a < 2; a = a + 1) {
    for (var b = 0; b < 2; b = b + 1) {
      for (var c = 0; c < 2; c = c + 1) {
        let xi = ix + a; let yi = iy + b; let zi = iz + c;
        if (!inCell(xi, yi, zi)) { continue; }
        let wx = select(1.0 - fx, fx, a == 1);
        let wy = select(1.0 - fy, fy, b == 1);
        let wz = select(1.0 - fz, fz, c == 1);
        s = s + f32(atomicLoad(&cellMass[cId(xi, yi, zi)])) / SCALE() * wx * wy * wz;
      }
    }
  }
  return s;
}

fn cellOf(pos: vec3<f32>) -> vec3<i32> {
  let gp = (pos - origin()) / dx();
  return vec3<i32>(i32(floor(gp.x)), i32(floor(gp.y)), i32(floor(gp.z)));
}

fn spawnFoam(p: vec3<f32>, v: vec3<f32>, life: f32, ty: f32) {
  let slot = atomicAdd(&counter[0], 1u) % 7000u;
  foamP[slot] = vec4<f32>(p, life);
  foamV[slot] = vec4<f32>(v, ty);
}

fn solidVelAt(p: vec3<f32>) -> vec3<f32> {
  var sv = vec3<f32>(0.0);
  let px0 = P.g3.x;
  let thick = P.g8.x;
  if (p.x > px0 && p.x < px0 + thick && p.z > P.g7.x && p.z < P.g7.y && p.y > P.g7.z && p.y < P.g7.w) {
    sv = vec3<f32>(P.g3.y, 0.0, 0.0);
  }
  let bc = ballCount();
  for (var i = 0; i < MAXB; i = i + 1) {
    if (i >= bc) { break; }
    let bp = readBall(i, 0).xyz;
    let r = ballProps(i).x;
    let d = p - bp;
    if (dot(d, d) < r * r) {
      sv = readBall(i, 1).xyz;
    }
  }
  return sv;
}

@compute @workgroup_size(64)
fn clearAll(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let nU = (nx() + 1) * ny() * nz();
  let nV = nx() * (ny() + 1) * nz();
  let nW = nx() * ny() * (nz() + 1);
  let nC = nx() * ny() * nz();
  if (i < nU) {
    atomicStore(&massU[i], 0);
    atomicStore(&momU[i], 0);
    lockU[i] = 0u;
  }
  if (i < nV) {
    atomicStore(&massV[i], 0);
    atomicStore(&momV[i], 0);
    lockV[i] = 0u;
  }
  if (i < nW) {
    atomicStore(&massW[i], 0);
    atomicStore(&momW[i], 0);
    lockW[i] = 0u;
  }
  if (i < nC) {
    atomicStore(&cellMass[i], 0);
    cellT[i] = 0u;
  }
  if (i == 0) {
    atomicStore(&stats[0], 0);
    atomicStore(&stats[1], 0);
  }
}

@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= pcount()) { return; }
  if (posA[i].w > 0.5) { return; }
  let pos = posA[i].xyz;
  let vel = velA[i].xyz;
  let mass = pMass();
  let gp = (pos - origin()) / dx();
  let sc = SCALE();
  // U
  {
    let gx = gp.x; let gy = gp.y - 0.5; let gz = gp.z - 0.5;
    let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
    let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
    for (var a = 0; a < 2; a = a + 1) {
      for (var b = 0; b < 2; b = b + 1) {
        for (var c = 0; c < 2; c = c + 1) {
          let xi = ix + a; let yi = iy + b; let zi = iz + c;
          if (xi < 0 || yi < 0 || zi < 0 || xi > nx() || yi >= ny() || zi >= nz()) { continue; }
          let wx = select(1.0 - fx, fx, a == 1);
          let wy = select(1.0 - fy, fy, b == 1);
          let wz = select(1.0 - fz, fz, c == 1);
          let wgt = wx * wy * wz;
          let id = uId(xi, yi, zi);
          atomicAdd(&massU[id], i32(mass * wgt * sc));
          atomicAdd(&momU[id], i32(vel.x * mass * wgt * sc));
        }
      }
    }
  }
  {
    let gx = gp.x - 0.5; let gy = gp.y; let gz = gp.z - 0.5;
    let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
    let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
    for (var a = 0; a < 2; a = a + 1) {
      for (var b = 0; b < 2; b = b + 1) {
        for (var c = 0; c < 2; c = c + 1) {
          let xi = ix + a; let yi = iy + b; let zi = iz + c;
          if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi > ny() || zi >= nz()) { continue; }
          let wx = select(1.0 - fx, fx, a == 1);
          let wy = select(1.0 - fy, fy, b == 1);
          let wz = select(1.0 - fz, fz, c == 1);
          let wgt = wx * wy * wz;
          let id = vId(xi, yi, zi);
          atomicAdd(&massV[id], i32(mass * wgt * sc));
          atomicAdd(&momV[id], i32(vel.y * mass * wgt * sc));
        }
      }
    }
  }
  {
    let gx = gp.x - 0.5; let gy = gp.y - 0.5; let gz = gp.z;
    let ix = i32(floor(gx)); let iy = i32(floor(gy)); let iz = i32(floor(gz));
    let fx = fract(gx); let fy = fract(gy); let fz = fract(gz);
    for (var a = 0; a < 2; a = a + 1) {
      for (var b = 0; b < 2; b = b + 1) {
        for (var c = 0; c < 2; c = c + 1) {
          let xi = ix + a; let yi = iy + b; let zi = iz + c;
          if (xi < 0 || yi < 0 || zi < 0 || xi >= nx() || yi >= ny() || zi > nz()) { continue; }
          let wx = select(1.0 - fx, fx, a == 1);
          let wy = select(1.0 - fy, fy, b == 1);
          let wz = select(1.0 - fz, fz, c == 1);
          let wgt = wx * wy * wz;
          let id = wId(xi, yi, zi);
          atomicAdd(&massW[id], i32(mass * wgt * sc));
          atomicAdd(&momW[id], i32(vel.z * mass * wgt * sc));
        }
      }
    }
  }
  {
    let gp2 = gp - vec3<f32>(0.5);
    let ix = i32(floor(gp2.x)); let iy = i32(floor(gp2.y)); let iz = i32(floor(gp2.z));
    let fx = fract(gp2.x); let fy = fract(gp2.y); let fz = fract(gp2.z);
    for (var a = 0; a < 2; a = a + 1) {
      for (var b = 0; b < 2; b = b + 1) {
        for (var c = 0; c < 2; c = c + 1) {
          let xi = ix + a; let yi = iy + b; let zi = iz + c;
          if (!inCell(xi, yi, zi)) { continue; }
          let wx = select(1.0 - fx, fx, a == 1);
          let wy = select(1.0 - fy, fy, b == 1);
          let wz = select(1.0 - fz, fz, c == 1);
          atomicAdd(&cellMass[cId(xi, yi, zi)], i32(mass * wx * wy * wz * sc));
        }
      }
    }
  }
}

@compute @workgroup_size(64)
fn normalize(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let nU = (nx() + 1) * ny() * nz();
  let nV = nx() * (ny() + 1) * nz();
  let nW = nx() * ny() * (nz() + 1);
  let sc = SCALE();
  if (i < nU) {
    let m = f32(atomicLoad(&massU[i])) / sc;
    let mo = f32(atomicLoad(&momU[i])) / sc;
    var vel = 0.0;
    if (m > 1e-5) { vel = mo / m; }
    u[i] = vel;
    uPre[i] = vel;
  }
  if (i < nV) {
    let m = f32(atomicLoad(&massV[i])) / sc;
    let mo = f32(atomicLoad(&momV[i])) / sc;
    var vel = 0.0;
    if (m > 1e-5) { vel = mo / m; }
    v[i] = vel;
    vPre[i] = vel;
  }
  if (i < nW) {
    let m = f32(atomicLoad(&massW[i])) / sc;
    let mo = f32(atomicLoad(&momW[i])) / sc;
    var vel = 0.0;
    if (m > 1e-5) { vel = mo / m; }
    w[i] = vel;
    wPre[i] = vel;
  }
}

@compute @workgroup_size(64)
fn markFluid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let nC = nx() * ny() * nz();
  if (i >= nC) { return; }
  let m = f32(atomicLoad(&cellMass[i])) / SCALE();
  if (m > pMass() * 0.55) { cellT[i] = 1u; }
  else { cellT[i] = 0u; }
}

@compute @workgroup_size(64)
fn gravity(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = i32(gid.x);
  let nV = nx() * (ny() + 1) * nz();
  if (id >= nV) { return; }
  let x = id % nx();
  let yz = id / nx();
  let y = yz % (ny() + 1);
  let z = yz / (ny() + 1);
  var touch = false;
  if (y < ny() && cellT[cId(x, y, z)] == 1u) { touch = true; }
  if (y > 0 && cellT[cId(x, y - 1, z)] == 1u) { touch = true; }
  if (touch) { v[id] = v[id] - grav() * dt(); }
}

@compute @workgroup_size(64)
fn solids(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = i32(gid.x);
  let nC = nx() * ny() * nz();
  if (id >= nC) { return; }
  let x = id % nx();
  let yz = id / nx();
  let y = yz % ny();
  let z = yz / ny();
  let p = origin() + (vec3<f32>(f32(x), f32(y), f32(z)) + vec3<f32>(0.5)) * dx();
  let im = P.g4.xyz;
  let iMx = P.g4.w;
  let iMy = P.g5.x;
  let iMz = P.g5.y;
  var solid = false;
  if (p.x < im.x || p.x > iMx || p.z < im.z || p.z > iMz || p.y > iMy) { solid = true; }
  if (p.y < terrainH(p.x, p.z)) { solid = true; }
  let px0 = P.g3.x;
  let thick = P.g8.x;
  if (p.x > px0 && p.x < px0 + thick && p.z > P.g7.x && p.z < P.g7.y && p.y > P.g7.z && p.y < P.g7.w) { solid = true; }
  let bc = ballCount();
  for (var bi = 0; bi < MAXB; bi = bi + 1) {
    if (bi >= bc) { break; }
    let bp = readBall(bi, 0).xyz;
    let r = ballProps(bi).x;
    let d = p - bp;
    if (dot(d, d) < r * r) { solid = true; }
  }
  if (solid) { cellT[id] = 2u; }
}

@compute @workgroup_size(64)
fn lockFaces(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let nU = (nx() + 1) * ny() * nz();
  if (i < nU) {
    let x = i % (nx() + 1);
    let yz = i / (nx() + 1);
    let y = yz % ny();
    let z = yz / ny();
    var sL = false; var sR = false;
    if (x > 0) { sL = cellT[cId(x - 1, y, z)] == 2u; }
    else { sL = true; }
    if (x < nx()) { sR = cellT[cId(x, y, z)] == 2u; }
    else { sR = true; }
    if (sL || sR) {
      let fp = origin() + vec3<f32>(f32(x), f32(y) + 0.5, f32(z) + 0.5) * dx();
      u[i] = solidVelAt(fp).x;
      lockU[i] = 1u;
    }
  }
  let nV = nx() * (ny() + 1) * nz();
  if (i < nV) {
    let x = i % nx();
    let yz = i / nx();
    let y = yz % (ny() + 1);
    let z = yz / (ny() + 1);
    var sB = false; var sT = false;
    if (y > 0) { sB = cellT[cId(x, y - 1, z)] == 2u; }
    else { sB = true; }
    if (y < ny()) { sT = cellT[cId(x, y, z)] == 2u; }
    else { sT = true; }
    if (sB || sT) {
      let fp = origin() + vec3<f32>(f32(x) + 0.5, f32(y), f32(z) + 0.5) * dx();
      v[i] = solidVelAt(fp).y;
      lockV[i] = 1u;
    }
  }
  let nW = nx() * ny() * (nz() + 1);
  if (i < nW) {
    let x = i % nx();
    let yz = i / nx();
    let y = yz % ny();
    let z = yz / ny();
    var sN = false; var sF = false;
    if (z > 0) { sN = cellT[cId(x, y, z - 1)] == 2u; }
    else { sN = true; }
    if (z < nz()) { sF = cellT[cId(x, y, z)] == 2u; }
    else { sF = true; }
    if (sN || sF) {
      let fp = origin() + vec3<f32>(f32(x) + 0.5, f32(y) + 0.5, f32(z)) * dx();
      w[i] = solidVelAt(fp).z;
      lockW[i] = 1u;
    }
  }
}

@compute @workgroup_size(64)
fn divergence(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = i32(gid.x);
  let nC = nx() * ny() * nz();
  if (id >= nC) { return; }
  if (cellT[id] != 1u) { divF[id] = 0.0; return; }
  let x = id % nx();
  let yz = id / nx();
  let y = yz % ny();
  let z = yz / ny();
  let du = u[uId(x + 1, y, z)] - u[uId(x, y, z)];
  let dv = v[vId(x, y + 1, z)] - v[vId(x, y, z)];
  let dw = w[wId(x, y, z + 1)] - w[wId(x, y, z)];
  divF[id] = (du + dv + dw) / dx();
}

fn jacobiAt(id: i32, readA: bool) {
  if (cellT[id] != 1u) {
    if (readA) { pB[id] = 0.0; } else { pA[id] = 0.0; }
    return;
  }
  let x = id % nx();
  let yz = id / nx();
  let y = yz % ny();
  let z = yz / ny();
  var diag = 0.0;
  var sum = 0.0;
  // -x
  if (x == 0 || cellT[cId(x - 1, y, z)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x - 1, y, z)] == 1u) {
      let pid = cId(x - 1, y, z);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  if (x == nx() - 1 || cellT[cId(x + 1, y, z)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x + 1, y, z)] == 1u) {
      let pid = cId(x + 1, y, z);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  if (y == 0 || cellT[cId(x, y - 1, z)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x, y - 1, z)] == 1u) {
      let pid = cId(x, y - 1, z);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  if (y == ny() - 1 || cellT[cId(x, y + 1, z)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x, y + 1, z)] == 1u) {
      let pid = cId(x, y + 1, z);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  if (z == 0 || cellT[cId(x, y, z - 1)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x, y, z - 1)] == 1u) {
      let pid = cId(x, y, z - 1);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  if (z == nz() - 1 || cellT[cId(x, y, z + 1)] == 2u) {
  } else {
    diag = diag + 1.0;
    if (cellT[cId(x, y, z + 1)] == 1u) {
      let pid = cId(x, y, z + 1);
      sum = sum + select(pB[pid], pA[pid], readA);
    }
  }
  var pr = 0.0;
  if (diag > 0.0) {
    let rhs = (rho() * dx() * dx() / dt()) * divF[id];
    pr = (sum - rhs) / diag;
  }
  if (readA) { pB[id] = pr; } else { pA[id] = pr; }
}

@compute @workgroup_size(64)
fn jacobiAB(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = i32(gid.x);
  if (id >= nx() * ny() * nz()) { return; }
  jacobiAt(id, true);
}
@compute @workgroup_size(64)
fn jacobiBA(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = i32(gid.x);
  if (id >= nx() * ny() * nz()) { return; }
  jacobiAt(id, false);
}

@compute @workgroup_size(64)
fn project(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let scale = dt() / (rho() * dx());
  let nU = (nx() + 1) * ny() * nz();
  if (i < nU && lockU[i] == 0u) {
    let x = i % (nx() + 1);
    let yz = i / (nx() + 1);
    let y = yz % ny();
    let z = yz / ny();
    var pR = 0.0; var pL = 0.0;
    var fluid = false;
    if (x < nx() && cellT[cId(x, y, z)] == 1u) { pR = pA[cId(x, y, z)]; fluid = true; }
    if (x > 0 && cellT[cId(x - 1, y, z)] == 1u) { pL = pA[cId(x - 1, y, z)]; fluid = true; }
    if (fluid) { u[i] = u[i] - scale * (pR - pL); }
  }
  let nV = nx() * (ny() + 1) * nz();
  if (i < nV && lockV[i] == 0u) {
    let x = i % nx();
    let yz = i / nx();
    let y = yz % (ny() + 1);
    let z = yz / (ny() + 1);
    var pT = 0.0; var pBtm = 0.0;
    var fluid = false;
    if (y < ny() && cellT[cId(x, y, z)] == 1u) { pT = pA[cId(x, y, z)]; fluid = true; }
    if (y > 0 && cellT[cId(x, y - 1, z)] == 1u) { pBtm = pA[cId(x, y - 1, z)]; fluid = true; }
    if (fluid) { v[i] = v[i] - scale * (pT - pBtm); }
  }
  let nW = nx() * ny() * (nz() + 1);
  if (i < nW && lockW[i] == 0u) {
    let x = i % nx();
    let yz = i / nx();
    let y = yz % ny();
    let z = yz / ny();
    var pF = 0.0; var pN = 0.0;
    var fluid = false;
    if (z < nz() && cellT[cId(x, y, z)] == 1u) { pF = pA[cId(x, y, z)]; fluid = true; }
    if (z > 0 && cellT[cId(x, y, z - 1)] == 1u) { pN = pA[cId(x, y, z - 1)]; fluid = true; }
    if (fluid) { w[i] = w[i] - scale * (pF - pN); }
  }
}

@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= pcount()) { return; }
  var pos = posA[i].xyz;
  var vel = velA[i].xyz;
  let oldPhase = posA[i].w;
  let massHere = sampleMass(pos);
  let thresh = pMass() * 0.35;
  var phase = 0.0;
  if (massHere < thresh) {
    vel.y = vel.y - grav() * dt();
    phase = 1.0;
  } else {
    let pic = sampleVel(pos);
    let pre = sampleVelPre(pos);
    let fl = vel + (pic - pre);
    vel = mix(pic, fl, flip());
    let visc = P.g3.w;
    vel = vel * exp(-visc * dt());
    phase = 0.0;
    if (oldPhase > 0.5) {
      let h = hash13(pos + vec3<f32>(P.g6.w));
      let h2 = hash13(pos.yzx + vec3<f32>(3.1));
      vel.x = vel.x + (h - 0.5) * 0.55;
      vel.z = vel.z + (h2 - 0.5) * 0.55;
      vel.y = vel.y - 0.25;
      spawnFoam(pos, vel * 0.3, 1.1, 1.0);
    }
  }
  vel = clamp(vel, vec3<f32>(-7.5), vec3<f32>(7.5));
  pos = pos + vel * dt();

  let im = P.g4.xyz;
  let iMx = P.g4.w; let iMy = P.g5.x; let iMz = P.g5.y;
  let th = terrainH(pos.x, pos.z);
  if (pos.y < th + 0.01) {
    pos.y = th + 0.01;
    if (vel.y < 0.0) { vel.y = 0.0; }
    vel.x = vel.x * 0.92;
    vel.z = vel.z * 0.92;
  }
  if (pos.x < im.x) { pos.x = im.x; vel.x = max(vel.x, 0.0); }
  if (pos.x > iMx) { pos.x = iMx; vel.x = min(vel.x, 0.0); }
  if (pos.z < im.z) { pos.z = im.z; vel.z = max(vel.z, 0.0); }
  if (pos.z > iMz) { pos.z = iMz; vel.z = min(vel.z, 0.0); }
  if (pos.y > iMy - 0.02) { pos.y = iMy - 0.02; vel.y = min(vel.y, 0.0); }

  let px0 = P.g3.x;
  let thick = P.g8.x;
  if (pos.z > P.g7.x && pos.z < P.g7.y && pos.y > P.g7.z && pos.y < P.g7.w && pos.x > px0 && pos.x < px0 + thick) {
    pos.x = px0 + thick + 0.002;
    vel.x = max(vel.x, P.g3.y);
  }

  let bc = ballCount();
  for (var bi = 0; bi < MAXB; bi = bi + 1) {
    if (bi >= bc) { break; }
    let bp = readBall(bi, 0).xyz;
    let bv = readBall(bi, 1).xyz;
    let r = ballProps(bi).x;
    let d = pos - bp;
    let dist = length(d);
    if (dist < r && dist > 1e-5) {
      let n = d / dist;
      pos = bp + n * (r + 0.004);
      let vn = dot(vel - bv, n);
      if (vn < 0.0) { vel = vel - n * vn; }
      if (bv.y < -0.4 && abs(n.y) < 0.65) {
        let kick = -bv.y;
        vel.y = vel.y + kick * (0.85 - abs(n.y));
        vel = vel + n * kick * 0.65;
      } else {
        vel = vel + n * max(0.0, dot(bv, n)) * 0.35;
      }
      phase = select(phase, 1.0, length(vel) > 1.6 && pos.y > P.g5.z - 0.05);
    }
  }

  let cc = cellOf(pos);
  var nearSurf = false;
  if (inCell(cc.x, cc.y, cc.z) && cellT[cId(cc.x, cc.y, cc.z)] == 1u) {
    if (cc.y + 1 < ny() && cellT[cId(cc.x, cc.y + 1, cc.z)] == 0u) { nearSurf = true; }
  }
  let spd = length(vel);
  if (nearSurf && spd > 1.15 && vel.y > 0.35 && hash13(pos) > 0.55) {
    spawnFoam(pos + vec3<f32>(0.0, 0.01, 0.0), vel * 0.45 + vec3<f32>(0.0, 0.2, 0.0), 0.7 + hash13(vel) * 1.3, 1.0);
  }
  if (phase > 0.5 && spd > 0.8 && hash13(pos + vel) > 0.82) {
    spawnFoam(pos, vel, 0.45, 1.0);
  }

  let domMax = origin() + vec3<f32>(f32(nx() - 1), f32(ny() - 1), f32(nz() - 1)) * dx();
  pos = clamp(pos, origin() + vec3<f32>(dx()), domMax);
  if (pos.x != pos.x) { pos = vec3<f32>(1.2, 0.3, 0.5); vel = vec3<f32>(0.0); }
  posA[i] = vec4<f32>(pos, phase);
  velA[i] = vec4<f32>(vel, massHere);
}

@compute @workgroup_size(64)
fn foamStep(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= 7000u) { return; }
  var life = foamP[i].w;
  if (life <= 0.0) { return; }
  life = life - dt();
  var p = foamP[i].xyz;
  var vel = foamV[i].xyz;
  let ty = foamV[i].w;
  let fv = sampleVel(p);
  let m = sampleMass(p);
  if (ty > 1.5) {
    // bubble
    vel = mix(vel, fv, 0.35);
    vel.y = vel.y + 1.35 * dt() * 8.0;
    p = p + vel * dt();
    let c = cellOf(p);
    if (!inCell(c.x, c.y, c.z) || (inCell(c.x, c.y, c.z) && cellT[cId(c.x, c.y, c.z)] != 1u && p.y > P.g5.z - 0.02)) {
      foamP[i] = vec4<f32>(p, 0.9);
      foamV[i] = vec4<f32>(fv.x, 0.15, fv.z, 1.0);
      return;
    }
  } else {
    if (m > pMass() * 0.2) {
      vel = mix(vel, vec3<f32>(fv.x, 0.0, fv.z), 0.45);
      p.x = p.x + vel.x * dt();
      p.z = p.z + vel.z * dt();
      let c = cellOf(p);
      if (inCell(c.x, c.y, c.z) && cellT[cId(c.x, c.y, c.z)] == 1u) {
        p.y = p.y + dx() * 0.85;
      } else {
        p.y = p.y - dx() * 0.25;
      }
    } else {
      vel.y = vel.y - grav() * dt();
      p = p + vel * dt();
    }
  }
  if (life <= 0.0) { life = 0.0; }
  foamP[i] = vec4<f32>(p, life);
  foamV[i] = vec4<f32>(vel, ty);
}

@compute @workgroup_size(64)
fn consumeSpawns(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  let n = i32(P.g8.z);
  if (i >= n) { return; }
  let p = spawns[i * 2];
  let v = spawns[i * 2 + 1];
  spawnFoam(p.xyz, v.xyz, p.w, v.w);
}

@compute @workgroup_size(64)
fn integrateBalls(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = i32(gid.x);
  if (i >= ballCount()) { return; }
  var p = readBall(i, 0);
  var vel = readBall(i, 1);
  var q = readBall(i, 2);
  var ang = readBall(i, 3);
  let props = ballProps(i);
  let r = props.x;
  let invM = props.y;
  let mass = props.z;
  let resti = props.w;
  let oldY = p.y;
  var nFluid = 0;
  var vsum = vec3<f32>(0.0);
  for (var a = 0; a < 3; a = a + 1) {
    for (var b = 0; b < 3; b = b + 1) {
      for (var c = 0; c < 3; c = c + 1) {
        let qv = vec3<f32>(f32(a) - 1.0, f32(b) - 1.0, f32(c) - 1.0) * r * 0.55;
        if (dot(qv, qv) > r * r) { continue; }
        let sp = p.xyz + qv;
        let cc = cellOf(sp);
        if (!inCell(cc.x, cc.y, cc.z)) { continue; }
        if (cellT[cId(cc.x, cc.y, cc.z)] == 1u) {
          nFluid = nFluid + 1;
          vsum = vsum + sampleVel(sp);
        }
      }
    }
  }
  let sub = f32(nFluid) / 14.0;
  var vf = vec3<f32>(0.0);
  if (nFluid > 0) { vf = vsum / f32(nFluid); }
  let fullV = 4.1887902 * r * r * r;
  let subV = fullV * clamp(sub, 0.0, 1.0);
  var force = vec3<f32>(0.0, grav() * rho() * subV, 0.0);
  if (nFluid > 0) {
    let rel = vf - vel.xyz;
    let sp = length(rel) + 1e-4;
    let area = 3.14159 * r * r;
    force = force + rel * (0.55 * rho() * area * sp + 18.0 * r * rho() * 0.002);
  }
  vel = vec4<f32>(vel.xyz + (vec3<f32>(0.0, -grav(), 0.0) + force * invM) * dt(), vel.w);
  p = vec4<f32>(p.xyz + vel.xyz * dt(), p.w);

  let th = terrainH(p.x, p.z);
  if (p.y < th + r) {
    p.y = th + r;
    if (vel.y < 0.0) { vel.y = -vel.y * resti * 0.35; }
    vel.x = vel.x * 0.86;
    vel.z = vel.z * 0.86;
    ang.z = ang.z + vel.x / max(r, 0.02) * 0.15;
    ang.x = ang.x - vel.z / max(r, 0.02) * 0.15;
  }
  let imn = P.g4.xyz;
  let iMx = P.g4.w; let iMy = P.g5.x; let iMz = P.g5.y;
  if (p.x < imn.x + r) { p.x = imn.x + r; vel.x = abs(vel.x) * resti; }
  if (p.x > iMx - r) { p.x = iMx - r; vel.x = -abs(vel.x) * resti; }
  if (p.z < imn.z + r) { p.z = imn.z + r; vel.z = abs(vel.z) * resti; }
  if (p.z > iMz - r) { p.z = iMz - r; vel.z = -abs(vel.z) * resti; }
  if (p.y > iMy - r) { p.y = iMy - r; vel.y = -abs(vel.y) * 0.2; }

  let px0 = P.g3.x;
  let thick = P.g8.x;
  if (p.z > P.g7.x && p.z < P.g7.y && p.y < P.g7.w && p.x > px0 - r && p.x < px0 + thick + r) {
    p.x = px0 + thick + r;
    vel.x = max(vel.x, P.g3.y);
  }

  // ball-ball using pre-integrate positions
  for (var j = 0; j < MAXB; j = j + 1) {
    if (j >= ballCount() || j == i) { continue; }
    let op = readBall(j, 0).xyz;
    let ov = readBall(j, 1).xyz;
    let orr = ballProps(j).x;
    let oinv = ballProps(j).y;
    let d = p.xyz - op;
    let dist = length(d);
    let minD = r + orr;
    if (dist < minD && dist > 1e-5) {
      let n = d / dist;
      let pen = minD - dist;
      p = vec4<f32>(p.xyz + n * pen * (invM / (invM + oinv)), p.w);
      let rv = dot(vel.xyz - ov, n);
      if (rv < 0.0) {
        let jimp = -(1.0 + resti) * rv / (invM + oinv);
        vel = vec4<f32>(vel.xyz + n * jimp * invM, vel.w);
        atomicAdd(&stats[1], i32(max(0.0, -rv) * 100.0));
      }
    }
  }

  let waterY = P.g5.z;
  if (oldY - r > waterY - 0.02 && p.y - r < waterY && vel.y < -0.35) {
    atomicAdd(&stats[0], i32(clamp(-vel.y, 0.0, 8.0) * 100.0));
    let rear = normalize(vec3<f32>(vel.x, min(vel.y, -0.2), vel.z));
    for (var k = 0; k < 4; k = k + 1) {
      let hh = hash13(p.xyz + vec3<f32>(f32(k), P.g6.w, 0.2));
      let hh2 = hash13(p.zyx + vec3<f32>(f32(k) + 2.0, 0.3, 1.0));
      let bp = p.xyz - rear * r * 0.8 + vec3<f32>(hh - 0.5, -0.02, hh2 - 0.5) * r;
      spawnFoam(bp, -rear * 0.2 + vec3<f32>(0.0, 0.4, 0.0), 1.4, 2.0);
    }
  }

  // quaternion integrate
  let wdt = ang.xyz * (dt() * 0.5);
  let qw = q.w; let qx = q.x; let qy = q.y; let qz = q.z;
  let nxq = qx + wdt.x * qw + wdt.y * qz - wdt.z * qy;
  let nyq = qy + wdt.y * qw + wdt.z * qx - wdt.x * qz;
  let nzq = qz + wdt.z * qw + wdt.x * qy - wdt.y * qx;
  let nwq = qw - wdt.x * qx - wdt.y * qy - wdt.z * qz;
  let ql = max(length(vec4<f32>(nxq, nyq, nzq, nwq)), 1e-6);
  q = vec4<f32>(nxq, nyq, nzq, nwq) / ql;
  ang.x = ang.x * 0.998;
  ang.y = ang.y * 0.998;
  ang.z = ang.z * 0.998;

  writeBall(i, 0, p);
  writeBall(i, 1, vel);
  writeBall(i, 2, q);
  writeBall(i, 3, ang);
}
`;

JW.createFluid = function (device) {
  var C = JW.CFG;
  var nx = C.nx, ny = C.ny, nz = C.nz;
  var nCell = nx * ny * nz;
  var nU = (nx + 1) * ny * nz;
  var nV = nx * (ny + 1) * nz;
  var nW = nx * ny * (nz + 1);
  var nFace = Math.max(nU, nV, nW);
  var maxP = C.maxParticles;
  var maxF = 7000;
  var maxB = 40;

  function buf(size, usage) {
    return device.createBuffer({ size: size, usage: usage });
  }
  var U = GPUBufferUsage;
  var S = U.STORAGE | U.COPY_DST | U.COPY_SRC;
  var buffers = {
    params: buf(256, U.UNIFORM | U.COPY_DST),
    pos: buf(maxP * 16, S),
    vel: buf(maxP * 16, S),
    massU: buf(nU * 4, S),
    momU: buf(nU * 4, S),
    massV: buf(nV * 4, S),
    momV: buf(nV * 4, S),
    massW: buf(nW * 4, S),
    momW: buf(nW * 4, S),
    cellMass: buf(nCell * 4, S),
    u: buf(nU * 4, S),
    v: buf(nV * 4, S),
    w: buf(nW * 4, S),
    uPre: buf(nU * 4, S),
    vPre: buf(nV * 4, S),
    wPre: buf(nW * 4, S),
    cellT: buf(nCell * 4, S),
    lockU: buf(nU * 4, S),
    lockV: buf(nV * 4, S),
    lockW: buf(nW * 4, S),
    pA: buf(nCell * 4, S),
    pB: buf(nCell * 4, S),
    div: buf(nCell * 4, S),
    ballA: buf(maxB * 4 * 16, S),
    ballB: buf(maxB * 4 * 16, S),
    ballInfo: buf(maxB * 2 * 16, S),
    foamP: buf(maxF * 16, S),
    foamV: buf(maxF * 16, S),
    counter: buf(16, S),
    spawns: buf(48 * 2 * 16, S),
    stats: buf(16, S | U.COPY_SRC),
    statsStage: buf(16, U.MAP_READ | U.COPY_DST)
  };

  var module = device.createShaderModule({ code: JW.FLUID_WGSL });
  module.getCompilationInfo().then(function (info) {
    info.messages.forEach(function (m) {
      if (m.type === "error" || m.type === "warning") {
        console.warn("WGSL", m.type, "line", m.lineNum, m.message);
        if (m.type === "error") sim.compileError = (sim.compileError || "") + m.message + "\n";
      }
    });
  });
  var layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 11, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 12, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 13, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 14, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 15, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 16, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 17, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 18, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 19, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 20, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 21, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 22, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 23, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 24, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 25, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 26, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 27, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 28, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 29, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 30, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  });
  var names = ["params", "pos", "vel", "massU", "momU", "massV", "momV", "massW", "momW", "cellMass", "u", "v", "w", "uPre", "vPre", "wPre", "cellT", "lockU", "lockV", "lockW", "pA", "pB", "div", "ballA", "ballB", "ballInfo", "foamP", "foamV", "counter", "spawns", "stats"];
  var entries = names.map(function (n, i) { return { binding: i, resource: { buffer: buffers[n] } }; });
  var bind = device.createBindGroup({ layout: layout, entries: entries });
  var pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  function pipe(entry) {
    return device.createComputePipeline({
      layout: pipeLayout,
      compute: { module: module, entryPoint: entry }
    });
  }
  var pipes = {
    clearAll: pipe("clearAll"),
    p2g: pipe("p2g"),
    normalize: pipe("normalize"),
    markFluid: pipe("markFluid"),
    gravity: pipe("gravity"),
    solids: pipe("solids"),
    lockFaces: pipe("lockFaces"),
    divergence: pipe("divergence"),
    jacobiAB: pipe("jacobiAB"),
    jacobiBA: pipe("jacobiBA"),
    project: pipe("project"),
    g2p: pipe("g2p"),
    foamStep: pipe("foamStep"),
    consumeSpawns: pipe("consumeSpawns"),
    integrateBalls: pipe("integrateBalls")
  };

  var sim = {
    device: device,
    buffers: buffers,
    particleCount: 0,
    ballCount: 0,
    renderRadius: 0.02,
    spacing: 0.03,
    simTime: 0,
    amp: 0,
    freq: 0.6,
    targetAmp: 0,
    visc: 0.35,
    ballSide: 0,
    stats: { splash: 0, hit: 0 },
    mapping: false,
    module: module
  };

  function seedParticles() {
    var spacing = C.dx * 0.5;
    var pts = [];
    var guard = 0;
    while (guard < 4) {
      pts = [];
      var rng = 1;
      function rnd() { rng = (rng * 16807) % 2147483647; return (rng & 2147483647) / 2147483647; }
      var y0 = C.innerMin[1] + spacing * 0.6;
      for (var y = y0; y < C.waterY - spacing * 0.2; y += spacing) {
        for (var x = C.innerMin[0] + spacing; x < C.innerMax[0] - spacing; x += spacing) {
          for (var z = C.innerMin[2] + spacing; z < C.innerMax[2] - spacing; z += spacing) {
            var jx = x + (rnd() - 0.5) * spacing * 0.35;
            var jy = y + (rnd() - 0.5) * spacing * 0.25;
            var jz = z + (rnd() - 0.5) * spacing * 0.35;
            if (jy <= JW.terrainHeight(jx, jz) + spacing * 0.45) continue;
            pts.push(jx, jy, jz);
          }
        }
      }
      if (pts.length / 3 <= maxP) break;
      spacing *= 1.08;
      guard++;
    }
    var count = Math.min(maxP, pts.length / 3);
    var pos = new Float32Array(count * 4);
    var vel = new Float32Array(count * 4);
    for (var i = 0; i < count; i++) {
      pos[i * 4] = pts[i * 3];
      pos[i * 4 + 1] = pts[i * 3 + 1];
      pos[i * 4 + 2] = pts[i * 3 + 2];
      pos[i * 4 + 3] = 0;
    }
    device.queue.writeBuffer(buffers.pos, 0, pos);
    device.queue.writeBuffer(buffers.vel, 0, vel);
    device.queue.writeBuffer(buffers.foamP, 0, new Float32Array(maxF * 4));
    device.queue.writeBuffer(buffers.foamV, 0, new Float32Array(maxF * 4));
    device.queue.writeBuffer(buffers.counter, 0, new Uint32Array(4));
    device.queue.writeBuffer(buffers.pA, 0, new Float32Array(nCell));
    device.queue.writeBuffer(buffers.pB, 0, new Float32Array(nCell));
    sim.particleCount = count;
    sim.spacing = spacing;
    sim.renderRadius = spacing * 0.78;
    sim.pMass = C.rho * spacing * spacing * spacing;
    return count;
  }

  var paramData = new Float32Array(64);
  function writeParams(spawnCount) {
    paramData[0] = nx; paramData[1] = ny; paramData[2] = nz; paramData[3] = C.dx;
    paramData[4] = sim._h || JW.TUNE.fluidDt; paramData[5] = C.rho; paramData[6] = C.gravity; paramData[7] = C.flip;
    paramData[8] = C.origin[0]; paramData[9] = C.origin[1]; paramData[10] = C.origin[2]; paramData[11] = sim.particleCount;
    var mot = JW.paddleMotion(sim.simTime, sim.amp, sim.freq);
    sim.paddleX = mot.x; sim.paddleVx = mot.vx;
    paramData[12] = mot.x; paramData[13] = mot.vx; paramData[14] = sim.pMass || 0.02; paramData[15] = sim.visc;
    paramData[16] = C.innerMin[0]; paramData[17] = C.innerMin[1]; paramData[18] = C.innerMin[2]; paramData[19] = C.innerMax[0];
    paramData[20] = C.innerMax[1]; paramData[21] = C.innerMax[2]; paramData[22] = C.waterY; paramData[23] = sim.ballCount;
    paramData[24] = 100000; paramData[25] = sim.spacing; paramData[26] = 0; paramData[27] = sim.simTime;
    paramData[28] = C.paddle.z0; paramData[29] = C.paddle.z1; paramData[30] = C.paddle.y0; paramData[31] = C.paddle.y1;
    paramData[32] = C.paddle.thick; paramData[33] = sim.ballSide; paramData[34] = spawnCount || 0; paramData[35] = sim.renderRadius;
    device.queue.writeBuffer(buffers.params, 0, paramData);
  }

  function dispatch(enc, p, n) {
    var pass = enc.beginComputePass();
    pass.setPipeline(p);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.max(1, Math.ceil(n / 64)));
    pass.end();
  }

  sim.seed = seedParticles;
  sim.writeParams = writeParams;

  sim.setBalls = function (list) {
    var dyn = new Float32Array(maxB * 16);
    var info = new Float32Array(maxB * 8);
    sim.ballCount = Math.min(maxB, list.length);
    for (var i = 0; i < sim.ballCount; i++) {
      var b = list[i];
      var o = i * 16;
      dyn[o] = b.x; dyn[o + 1] = b.y; dyn[o + 2] = b.z;
      dyn[o + 4] = b.vx || 0; dyn[o + 5] = b.vy || 0; dyn[o + 6] = b.vz || 0;
      dyn[o + 8] = 0; dyn[o + 9] = 0; dyn[o + 10] = 0; dyn[o + 11] = 1;
      var io = i * 8;
      info[io] = b.r; info[io + 1] = 1 / b.mass; info[io + 2] = b.mass; info[io + 3] = b.restitution == null ? 0.25 : b.restitution;
      info[io + 4] = b.color[0]; info[io + 5] = b.color[1]; info[io + 6] = b.color[2]; info[io + 7] = b.group || 0;
    }
    device.queue.writeBuffer(buffers.ballA, 0, dyn);
    device.queue.writeBuffer(buffers.ballB, 0, dyn);
    device.queue.writeBuffer(buffers.ballInfo, 0, info);
    sim.ballSide = 0;
    sim._info = info;
  };

  sim.setGroupDensity = function (group, density) {
    if (!sim._info) return;
    var r = 0.058;
    var vol = (4 / 3) * Math.PI * r * r * r;
    var mass = Math.max(0.02, density * C.rho * vol);
    for (var i = 0; i < sim.ballCount; i++) {
      if (Math.round(sim._info[i * 8 + 7]) !== group) continue;
      sim._info[i * 8 + 1] = 1 / mass;
      sim._info[i * 8 + 2] = mass;
    }
    device.queue.writeBuffer(buffers.ballInfo, 0, sim._info);
  };

  sim.spawnQueue = [];
  sim.queueSpawn = function (p, v, life, type) {
    if (sim.spawnQueue.length > 40) return;
    sim.spawnQueue.push(p[0], p[1], p[2], life, v[0], v[1], v[2], type);
  };

  function pullStats() {
    if (sim.mapping) return;
    sim.mapping = true;
    var enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(buffers.stats, 0, buffers.statsStage, 0, 16);
    device.queue.submit([enc.finish()]);
    buffers.statsStage.mapAsync(GPUMapMode.READ).then(function () {
      var data = new Int32Array(buffers.statsStage.getMappedRange().slice(0));
      buffers.statsStage.unmap();
      sim.stats.splash = data[0] / 100;
      sim.stats.hit = data[1] / 100;
      sim.mapping = false;
    }).catch(function () { sim.mapping = false; });
  }

  sim.substep = function () {
    var nSpawn = Math.min(40, sim.spawnQueue.length / 8);
    if (nSpawn > 0) {
      var arr = new Float32Array(nSpawn * 8);
      for (var i = 0; i < nSpawn * 8; i++) arr[i] = sim.spawnQueue[i];
      device.queue.writeBuffer(buffers.spawns, 0, arr);
      sim.spawnQueue.splice(0, nSpawn * 8);
    }
    writeParams(nSpawn);
    var enc = device.createCommandEncoder();
    dispatch(enc, pipes.clearAll, nFace);
    dispatch(enc, pipes.p2g, sim.particleCount);
    dispatch(enc, pipes.normalize, nFace);
    dispatch(enc, pipes.markFluid, nCell);
    dispatch(enc, pipes.gravity, nV);
    dispatch(enc, pipes.solids, nCell);
    dispatch(enc, pipes.lockFaces, nFace);
    dispatch(enc, pipes.divergence, nCell);
    var jacobi = JW.CFG.jacobi + (JW.CFG.jacobi % 2); // even so pressure ends in pA
    for (var j = 0; j < jacobi; j++) {
      dispatch(enc, (j % 2 === 0) ? pipes.jacobiAB : pipes.jacobiBA, nCell);
    }
    dispatch(enc, pipes.project, nFace);
    dispatch(enc, pipes.g2p, sim.particleCount);
    if (nSpawn) dispatch(enc, pipes.consumeSpawns, nSpawn);
    dispatch(enc, pipes.foamStep, maxF);
    if (sim.ballCount) dispatch(enc, pipes.integrateBalls, sim.ballCount);
    device.queue.submit([enc.finish()]);
    if (sim.ballCount) sim.ballSide = 1 - sim.ballSide;
    sim.simTime += sim._h || JW.TUNE.fluidDt;
  };

  sim.step = function (dt) {
    if (!sim.particleCount) return;
    sim.visc = sim.amp > 0.035 ? 0.2 : 1.7;
    var left = Math.min(dt, 0.05);
    var guard = 0;
    while (left > 1e-5 && guard < 10) {
      sim._h = Math.min(JW.TUNE.fluidDt, left);
      sim.substep();
      left -= sim._h;
      guard++;
    }
    var k = 1 - Math.exp(-Math.max(dt, 0.001) * 1.6);
    sim.amp += (sim.targetAmp - sim.amp) * k;
    pullStats();
  };

  sim.resetWater = function () {
    sim.simTime = 0;
    sim.amp = 0;
    sim.targetAmp = 0;
    seedParticles();
  };

  seedParticles();
  sim.ready = true;
  sim.nFace = nFace;
  return sim;
};
