'use strict';
/* 场景一：重球冲击果冻。
   果冻 = 体积软体，离散为物质点（每个体素 8 个质点），MLS-MPM 显式求解 Neo-Hookean 超弹性 + Kelvin-Voigt 粘性阻尼；
   开裂来自最大主拉应力（Rankine）断裂判据驱动的损伤演化：损伤后的质点失去抗拉与抗剪能力，裂口自行出现并扩展，
   没有任何预先切好的碎块。重球为 GPU 上的刚体，经由网格动量交换与果冻双向耦合。 */
(function () {
  const GPU = JW.GPU;

  const HEAD = /* wgsl */`
struct Sim {
  dims: vec4u,   // nx, ny, nz, 质点数
  f0: vec4f,     // dx, 1/dx, dt, time
  f1: vec4f,     // g, 台面高度(仿真坐标), 台面摩擦, 球面摩擦
  f2: vec4f,     // 损伤速率, 接触半径修正, 质点质量(kg), 批内子步时间
  i0: vec4u,     // 球数, 步号, 0, 0
};
@group(0) @binding(0) var<uniform> U: Sim;
@group(0) @binding(1) var<uniform> mats: array<vec4f, 8>;   // mu/rho, lambda/rho, 抗拉强度/rho, 粘性
const SM = 262144.0;
const SW = 65536.0;
const SI = 4096.0;
fn nidx(c: vec3i) -> u32 { return u32((c.z*i32(U.dims.y) + c.y)*i32(U.dims.x) + c.x); }
fn ident() -> mat3x3f { return mat3x3f(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0); }
`;

  /* ---- P2G：质点质量、动量与内力（应力散度）散布到背景网格 ---- */
  const P2G = HEAD + /* wgsl */`
@group(0) @binding(2) var<storage, read> pos: array<vec4f>;
@group(0) @binding(3) var<storage, read> vel: array<vec4f>;
@group(0) @binding(4) var<storage, read> aC: array<vec4f>;
@group(0) @binding(5) var<storage, read> aF: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> gm: array<atomic<i32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= U.dims.w) { return; }
  let P = pos[pi];
  if (P.w < 0.0) { return; }
  let dx = U.f0.x; let inv = U.f0.y; let dt = U.f0.z;
  let mat = u32(P.w);
  let D = clamp(fract(P.w)/0.99, 0.0, 1.0);
  let v = vel[pi].xyz;
  let F = mat3x3f(aF[pi*3u].xyz, aF[pi*3u + 1u].xyz, aF[pi*3u + 2u].xyz);
  let C = mat3x3f(aC[pi*3u].xyz, aC[pi*3u + 1u].xyz, aC[pi*3u + 2u].xyz);
  let M = mats[mat];
  let J = max(determinant(F), 0.12);
  let b = F*transpose(F);
  let trb = b[0][0] + b[1][1] + b[2][2];
  let gd = (1.0 - D)*(1.0 - D);
  let I = ident();
  // Neo-Hookean 的 Kirchhoff 应力: tau = mu*(b - I) + lambda*ln(J)*I，拆成偏量 + 球量；损伤只削弱偏量与拉伸球量
  var s = M.x*(trb/3.0 - 1.0) + M.y*log(J);
  if (s > 0.0) { s *= gd; }
  var tau = (gd*M.x)*(b - (trb/3.0)*I) + s*I;
  tau += (M.w*max(gd, 0.12))*(C + transpose(C));
  let A = C - (dt*4.0*inv*inv)*tau;
  let xp = P.xyz*inv;
  let base = vec3i(floor(xp - 0.5));
  let fx = xp - vec3f(base);
  var w: array<vec3f, 3>;
  w[0] = 0.5*(1.5 - fx)*(1.5 - fx);
  w[1] = 0.75 - (fx - 1.0)*(fx - 1.0);
  w[2] = 0.5*(fx - 0.5)*(fx - 0.5);
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      for (var k = 0; k < 3; k++) {
        let wt = w[i].x*w[j].y*w[k].z;
        let dpos = (vec3f(f32(i), f32(j), f32(k)) - fx)*dx;
        let mv = (v + A*dpos)*wt;
        let id = nidx(base + vec3i(i, j, k))*4u;
        atomicAdd(&gm[id], i32(round(mv.x*SM)));
        atomicAdd(&gm[id + 1u], i32(round(mv.y*SM)));
        atomicAdd(&gm[id + 2u], i32(round(mv.z*SM)));
        atomicAdd(&gm[id + 3u], i32(round(wt*SW)));
      }
    }
  }
}
`;

  /* ---- 网格更新：重力、台面库仑摩擦、刚体球接触（把冲量原子累加回球） ---- */
  const GRID = HEAD + JW.WGSL_BALL + /* wgsl */`
@group(0) @binding(6) var<storage, read> gm: array<i32>;
@group(0) @binding(7) var<storage, read_write> gvel: array<vec4f>;
@group(0) @binding(8) var<storage, read> balls: array<Ball>;
@group(0) @binding(9) var<storage, read_write> bacc: array<atomic<i32>>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  let c = vec3i(gid);
  let id = nidx(c);
  let mi = gm[id*4u + 3u];
  if (mi <= 0) { gvel[id] = vec4f(0.0); return; }
  let m = f32(mi)/SW;
  var v = vec3f(f32(gm[id*4u]), f32(gm[id*4u + 1u]), f32(gm[id*4u + 2u]))/(SM*m);
  let dt = U.f0.z;
  v.y -= U.f1.x*dt;
  let xn = vec3f(c)*U.f0.x;
  let nb = U.i0.x;
  for (var bi = 0u; bi < nb; bi++) {
    let B = balls[bi];
    if (B.alive < 0.5) { continue; }
    let d = xn - B.pos;
    let R = B.radius + U.f2.y;
    let l2 = dot(d, d);
    if (l2 >= R*R) { continue; }
    let l = sqrt(l2);
    let n = d/max(l, 1e-6);
    let vr = v - (B.vel + cross(B.ang, d));
    let vn = dot(vr, n);
    if (vn < 0.0) {
      var dv = -vn*n;
      let vt = vr - vn*n;
      let lt = length(vt);
      if (lt > 1e-6) { dv -= vt/lt*min(lt, U.f1.w*(-vn)); }
      v += dv;
      let imp = -m*dv;
      let tq = cross(n*B.radius, imp);
      let o = bi*8u;
      atomicAdd(&bacc[o], i32(round(imp.x*SI)));
      atomicAdd(&bacc[o + 1u], i32(round(imp.y*SI)));
      atomicAdd(&bacc[o + 2u], i32(round(imp.z*SI)));
      atomicAdd(&bacc[o + 3u], i32(round(tq.x*SI*64.0)));
      atomicAdd(&bacc[o + 4u], i32(round(tq.y*SI*64.0)));
      atomicAdd(&bacc[o + 5u], i32(round(tq.z*SI*64.0)));
      atomicAdd(&bacc[o + 6u], 1);
    }
  }
  // 台面：不可穿透 + 库仑摩擦，允许离开台面（倾斜、翻倒）
  if (xn.y <= U.f1.y + 1e-5) {
    if (v.y < 0.0) {
      let dvn = -v.y;
      v.y = 0.0;
      let lt = length(v.xz);
      if (lt > 1e-7) { v = vec3f(v.x, 0.0, v.z)*max(0.0, 1.0 - U.f1.z*dvn/lt); }
    }
  }
  // 计算域边界
  let hi = vec3i(U.dims.xyz) - vec3i(3);
  if (c.x < 2 && v.x < 0.0) { v.x = 0.0; }
  if (c.z < 2 && v.z < 0.0) { v.z = 0.0; }
  if (c.x > hi.x && v.x > 0.0) { v.x = 0.0; }
  if (c.y > hi.y && v.y > 0.0) { v.y = 0.0; }
  if (c.z > hi.z && v.z > 0.0) { v.z = 0.0; }
  gvel[id] = vec4f(v, m);
}
`;

  /* ---- G2P：更新速度/仿射矩阵/形变梯度，断裂判据与损伤演化 ---- */
  const G2P = HEAD + /* wgsl */`
@group(0) @binding(2) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> aC: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> aF: array<vec4f>;
@group(0) @binding(7) var<storage, read> gvel: array<vec4f>;
@group(0) @binding(10) var<storage, read_write> stat: array<atomic<u32>>;
fn hash1(n: u32) -> f32 {
  var x = n*747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x)*277803737u;
  x = (x >> 22u) ^ x;
  return f32(x & 0xffffffu)/16777216.0;
}
fn maxEig(A: mat3x3f) -> f32 {
  let q = (A[0][0] + A[1][1] + A[2][2])/3.0;
  let p1 = A[0][1]*A[0][1] + A[0][2]*A[0][2] + A[1][2]*A[1][2];
  let d0 = A[0][0] - q; let d1 = A[1][1] - q; let d2 = A[2][2] - q;
  let p2 = d0*d0 + d1*d1 + d2*d2 + 2.0*p1;
  if (p2 < 1e-10) { return q; }
  let p = sqrt(p2/6.0);
  let ip = 1.0/p;
  let b00 = d0*ip; let b11 = d1*ip; let b22 = d2*ip;
  let b01 = A[0][1]*ip; let b02 = A[0][2]*ip; let b12 = A[1][2]*ip;
  let det = b00*(b11*b22 - b12*b12) - b01*(b01*b22 - b12*b02) + b02*(b01*b12 - b11*b02);
  let phi = acos(clamp(det*0.5, -1.0, 1.0))/3.0;
  return q + 2.0*p*cos(phi);
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= U.dims.w) { return; }
  let P = pos[pi];
  if (P.w < 0.0) { return; }
  let dx = U.f0.x; let inv = U.f0.y; let dt = U.f0.z;
  let mat = u32(P.w);
  var D = clamp(fract(P.w)/0.99, 0.0, 1.0);
  let xp = P.xyz*inv;
  let base = vec3i(floor(xp - 0.5));
  let fx = xp - vec3f(base);
  var w: array<vec3f, 3>;
  w[0] = 0.5*(1.5 - fx)*(1.5 - fx);
  w[1] = 0.75 - (fx - 1.0)*(fx - 1.0);
  w[2] = 0.5*(fx - 0.5)*(fx - 0.5);
  var v = vec3f(0.0);
  var c0 = vec3f(0.0); var c1 = vec3f(0.0); var c2 = vec3f(0.0);
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      for (var k = 0; k < 3; k++) {
        let wt = w[i].x*w[j].y*w[k].z;
        let dpos = (vec3f(f32(i), f32(j), f32(k)) - fx)*dx;
        let gv = gvel[nidx(base + vec3i(i, j, k))].xyz*wt;
        v += gv;
        c0 += gv*dpos.x; c1 += gv*dpos.y; c2 += gv*dpos.z;
      }
    }
  }
  let k4 = 4.0*inv*inv;
  let C = mat3x3f(c0*k4, c1*k4, c2*k4);
  let sp = length(v);
  if (sp > 14.0) { v *= 14.0/sp; }
  var x = P.xyz + v*dt;
  let lo = vec3f(2.0*dx);
  let hi = (vec3f(U.dims.xyz) - 3.0)*dx;
  x = clamp(x, lo, hi);
  let F0 = aF[pi*3u];
  let sfac = F0.w;      // 逐点强度系数（空间相关的“弱脉”，让裂纹沿薄弱面局部化）
  let F = mat3x3f(F0.xyz, aF[pi*3u + 1u].xyz, aF[pi*3u + 2u].xyz);
  let I = ident();
  var Fn = (I + dt*C)*F;
  var J = determinant(Fn);
  let M = mats[mat];
  if (D < 1.0) {
    // 断裂判据：最大主拉应力（Cauchy）超过材料抗拉强度（带逐点随机涨落）
    let b = Fn*transpose(Fn);
    let Jc = max(J, 0.2);
    let sig = (M.x*(b - I) + (M.y*log(Jc))*I)*(1.0/Jc);
    let smax = maxEig(sig);
    // 受压区更难被拉裂（压力相关强度）：球正下方被压实的材料不碎，裂纹从受拉的鼓出面与坑壁萌生
    let pm = max(-(sig[0][0] + sig[1][1] + sig[2][2])/3.0, 0.0);
    let sc = M.z*sfac*(0.92 + 0.16*hash1(pi*7u + 13u)) + U.f2.w*pm;
    if (smax > sc) {
      D = min(1.0, D + dt*U.f2.x*(smax/sc - 1.0));
      if (D >= 1.0) { atomicAdd(&stat[0], 1u); }
    }
  }
  if (D >= 1.0) {
    // 完全损伤：只保留体积（抗压），不再记忆形状
    let s = pow(clamp(J, 0.3, 1.0), 1.0/3.0);
    Fn = mat3x3f(s, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, s);
  } else if (J < 0.12 || J > 8.0 || !(J == J)) {
    Fn = I;
  }
  pos[pi] = vec4f(x, f32(mat) + min(D, 1.0)*0.99);
  vel[pi] = vec4f(v, 0.0);
  aC[pi*3u] = vec4f(C[0], 0.0); aC[pi*3u + 1u] = vec4f(C[1], 0.0); aC[pi*3u + 2u] = vec4f(C[2], 0.0);
  aF[pi*3u] = vec4f(Fn[0], sfac); aF[pi*3u + 1u] = vec4f(Fn[1], 0.0); aF[pi*3u + 2u] = vec4f(Fn[2], 0.0);
}
`;

  /* ---- 刚体球：果冻反作用冲量 + 台面 + 球-球 ---- */
  const BALLSTEP = HEAD + JW.WGSL_BALL + JW.WGSL_BALL_COLLIDE + /* wgsl */`
@group(0) @binding(8) var<storage, read> balls: array<Ball>;
@group(0) @binding(11) var<storage, read_write> bout: array<Ball>;
@group(0) @binding(9) var<storage, read> bacc: array<i32>;
@compute @workgroup_size(16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let bi = gid.x;
  if (bi >= U.i0.x) { return; }
  let A0 = balls[bi];
  var B = A0;
  if (B.alive < 0.5) { bout[bi] = B; return; }
  let dt = U.f0.z;
  let time = U.f0.w;
  let r = B.radius;
  let mp = U.f2.z;
  let o = bi*8u;
  let Jl = vec3f(f32(bacc[o]), f32(bacc[o + 1u]), f32(bacc[o + 2u]))*(mp/SI);
  let Ja = vec3f(f32(bacc[o + 3u]), f32(bacc[o + 4u]), f32(bacc[o + 5u]))*(mp/(SI*64.0));
  let cnt = bacc[o + 6u];
  let vBefore = length(B.vel);
  B.vel += Jl/B.mass;
  B.ang += Ja/(0.4*B.mass*r*r);
  B.vel.y -= U.f1.x*dt;
  // 接触力（平滑）与撞击事件
  let force = length(Jl)/dt;
  let prevF = B.ev2.z;
  B.ev2.z = mix(prevF, force, 0.02);
  if (cnt > 0 && B.ev3.w < 0.5 && vBefore > 0.25) { B.ev3.x = time; B.ev3.y = vBefore; }
  if (cnt > 0) { B.ev3.w = 1.0; } else { B.ev3.w = max(0.0, B.ev3.w - dt*8.0); }
  // 球-球
  var dv = vec3f(0.0); var dw = vec3f(0.0); var dp = vec3f(0.0);
  var hs = 0.0; var hk = 0.0;
  for (var j = 0u; j < U.i0.x; j++) {
    if (j == bi) { continue; }
    let O = balls[j];
    if (O.alive < 0.5) { continue; }
    let h = ballPair(A0, O, 0.6, 0.25);
    dv += h.dv; dw += h.dw; dp += h.dp;
    if (h.s > hs) { hs = h.s; hk = 2.0; }
  }
  B.vel += dv; B.ang += dw; B.pos += dp;
  // 台面
  let ty = U.f1.y;
  if (B.pos.y - r < ty) {
    let s1 = ballPlane(&B, vec3f(0.0, 1.0, 0.0), ty - (B.pos.y - r), vec3f(0.0), 0.42, 0.4);
    if (s1 > hs) { hs = s1; hk = 1.0; }
    // 滚动阻力
    let sp = length(B.vel.xz);
    if (sp > 1e-4) {
      let k = max(0.0, 1.0 - 0.5*dt/sp - 0.35*dt);
      B.vel = vec3f(B.vel.x*k, B.vel.y, B.vel.z*k);
      B.ang *= k;
    }
    B.ev3.z += sp*dt;
  }
  if (hs > 0.12) { B.ev.x = time; B.ev.y = hs; B.ev.z = hk; }
  B.pos += B.vel*dt;
  B.quat = qintegrate(B.quat, B.ang, dt);
  if (abs(B.pos.x) > 30.0 || abs(B.pos.z) > 30.0) { B.alive = 0.0; }
  bout[bi] = B;
}
`;

  /* 形状：圆角盒 / 圆台（布丁）/ 圆顶 的符号距离（局部坐标，y=0 为底面） */
  function sdRoundBox(p, h, r) {
    const qx = Math.abs(p[0]) - h[0] + r, qy = Math.abs(p[1] - h[1]) - h[1] + r, qz = Math.abs(p[2]) - h[2] + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  function sdFrustum(p, r0, r1, h, rr) {
    const rad = Math.hypot(p[0], p[2]);
    const t = JW.clamp(p[1] / h, 0, 1);
    const rAt = r0 + (r1 - r0) * t;
    const slope = Math.sqrt(1 + ((r0 - r1) / h) ** 2);
    const dSide = (rad - rAt) / slope;
    const dY = Math.abs(p[1] - h / 2) - h / 2;
    const a = dSide + rr, b = dY + rr;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - rr;
  }
  function sdDome(p, r, h) {  // 半椭球
    const k = Math.hypot(p[0] / r, p[1] / h, p[2] / r);
    return p[1] < 0 ? Math.max(-p[1], (k - 1) * Math.min(r, h)) : (k - 1) * Math.min(r, h);
  }
  JW.jellyShapeSD = function (shape, p) {
    if (shape.type === 'box') return sdRoundBox(p, shape.half, shape.round || 0.02);
    if (shape.type === 'frustum') return sdFrustum(p, shape.r0, shape.r1, shape.h, shape.round || 0.02);
    return sdDome(p, shape.r, shape.h);
  };

  /* 空间相关的强度涨落：约 3~5 cm 尺度的弱脉（0.55~1.5 倍） */
  function h3(i, j, k, s) {
    let n = (i * 374761393 + j * 668265263 + k * 2147483647 + s * 362437) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vn3(x, y, z, s) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const fx = x - i, fy = y - j, fz = z - k;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h3(i, j, k, s), h3(i + 1, j, k, s), u), L(h3(i, j + 1, k, s), h3(i + 1, j + 1, k, s), u), v),
      L(L(h3(i, j, k + 1, s), h3(i + 1, j, k + 1, s), u), L(h3(i, j + 1, k + 1, s), h3(i + 1, j + 1, k + 1, s), u), v), w);
  }
  function strengthNoise(x, y, z, seed) {
    const a = vn3(x * 26, y * 26, z * 26, seed), b = vn3(x * 61 + 3.1, y * 61 + 1.7, z * 61 + 9.2, seed + 5);
    const ridge = Math.abs(a - 0.5) * 2;                 // 0 处为“脉”
    return 0.55 + 0.75 * Math.pow(ridge, 0.7) + 0.25 * (b - 0.5);
  }

  JW.JellySim = class {
    constructor() {
      this.dx = 0.01;
      this.NX = 156; this.NY = 76; this.NZ = 96;
      this.N = this.NX * this.NY * this.NZ;
      this.dt = 1 / 4000;
      this.maxP = 420000;
      this.maxBalls = 16;
      this.floorJ = 3;
      this.floorY = this.floorJ * this.dx;
      // 世界坐标 = 仿真坐标 - origin；台面位于世界 y = 0
      this.origin = [this.NX * this.dx * 0.5, this.floorY, this.NZ * this.dx * 0.5];
      this.params = { gravity: 9.81, floorMu: 0.55, ballMu: 0.3, dmgRate: 5000, contactPad: -0.002, visc: 0.022, pressK: 2.6 };
      this.rho = 1000;
      this.mp = this.rho * Math.pow(this.dx / 2, 3);
      this.time = 0; this.stepCount = 0; this.np = 0; this.nBalls = 0; this.ballSlot = 0;
      this.jellies = [];
      const N = this.N, B = this.buf = {};
      this.uData = new ArrayBuffer(80);
      this.uU32 = new Uint32Array(this.uData); this.uF32 = new Float32Array(this.uData);
      this.matData = new Float32Array(32);
      B.U = GPU.uniform(80);
      B.mats = GPU.uniform(128);
      B.pos = GPU.storage(this.maxP * 16, null, 'j.pos');
      B.vel = GPU.storage(this.maxP * 16, null, 'j.vel');
      B.aC = GPU.storage(this.maxP * 48, null, 'j.C');
      B.aF = GPU.storage(this.maxP * 48, null, 'j.F');
      B.gm = GPU.storage(N * 16, null, 'j.gm');
      B.gvel = GPU.storage(N * 16, null, 'j.gvel');
      B.balls = GPU.storage(this.maxBalls * 128, null, 'j.balls');
      B.ballsOut = GPU.storage(this.maxBalls * 128, null, 'j.ballsOut');
      B.bacc = GPU.storage(this.maxBalls * 32, null, 'j.bacc');
      B.stat = GPU.storage(64, null, 'j.stat');
      const P = this.pipe = {
        p2g: GPU.compute(P2G, 'j.p2g'), grid: GPU.compute(GRID, 'j.grid'),
        g2p: GPU.compute(G2P, 'j.g2p'), ball: GPU.compute(BALLSTEP, 'j.ball'),
      };
      this.bg = {
        p2g: GPU.bind(P.p2g, { 0: B.U, 1: B.mats, 2: B.pos, 3: B.vel, 4: B.aC, 5: B.aF, 6: B.gm }),
        grid: GPU.bind(P.grid, { 0: B.U, 6: B.gm, 7: B.gvel, 8: B.balls, 9: B.bacc }),
        g2p: GPU.bind(P.g2p, { 0: B.U, 1: B.mats, 2: B.pos, 3: B.vel, 4: B.aC, 5: B.aF, 7: B.gvel, 10: B.stat }),
        ball: GPU.bind(P.ball, { 0: B.U, 8: B.balls, 11: B.ballsOut, 9: B.bacc }),
      };
    }

    /* jellies: [{shape, center:[x,z](世界), E(kPa), nu, strength(kPa), ...}] */
    reset(jellies) {
      this.jellies = jellies.map(j => Object.assign({}, j));
      const dx = this.dx, hs = dx / 2;
      const pos = new Float32Array(this.maxP * 4);
      const F = new Float32Array(this.maxP * 12);
      const rnd = JW.rng(777);
      let n = 0;
      this.jellies.forEach((jl, mi) => {
        const cx = jl.center[0] + this.origin[0], cz = jl.center[1] + this.origin[2];
        const ext = jl.shape.type === 'box' ? [jl.shape.half[0], jl.shape.half[1] * 2, jl.shape.half[2]]
          : jl.shape.type === 'frustum' ? [Math.max(jl.shape.r0, jl.shape.r1), jl.shape.h, Math.max(jl.shape.r0, jl.shape.r1)]
            : [jl.shape.r, jl.shape.h, jl.shape.r];
        const i0 = Math.floor((cx - ext[0]) / hs) - 1, i1 = Math.ceil((cx + ext[0]) / hs) + 1;
        const k0 = Math.floor((cz - ext[2]) / hs) - 1, k1 = Math.ceil((cz + ext[2]) / hs) + 1;
        const j1 = Math.ceil(ext[1] / hs) + 1;
        const start = n;
        for (let k = k0; k <= k1; k++) for (let j = 0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * hs, y = this.floorY + (j + 0.5) * hs, z = (k + 0.5) * hs;
          const lp = [x - cx, y - this.floorY, z - cz];
          const sd = JW.jellyShapeSD(jl.shape, lp);
          if (sd > 0.3 * hs) continue;
          if (n >= this.maxP) continue;
          let ox = 0, oy = 0, oz = 0;
          if (sd > -0.8 * hs && lp[1] > 0.6 * hs) {
            // 表层质点沿距离场梯度贴合到真实曲面，轮廓不留体素台阶
            const e = hs * 0.25, S = jl.shape;
            const gx = JW.jellyShapeSD(S, [lp[0] + e, lp[1], lp[2]]) - JW.jellyShapeSD(S, [lp[0] - e, lp[1], lp[2]]);
            const gy = JW.jellyShapeSD(S, [lp[0], lp[1] + e, lp[2]]) - JW.jellyShapeSD(S, [lp[0], lp[1] - e, lp[2]]);
            const gz = JW.jellyShapeSD(S, [lp[0], lp[1], lp[2] + e]) - JW.jellyShapeSD(S, [lp[0], lp[1], lp[2] - e]);
            const gl = Math.hypot(gx, gy, gz) || 1;
            const mv = (-0.3 * hs - sd) * JW.smooth(-0.8 * hs, -0.3 * hs, sd);
            ox = gx / gl * mv; oy = gy / gl * mv; oz = gz / gl * mv;
          }
          pos[n * 4] = x + ox + (rnd() - 0.5) * hs * 0.1; pos[n * 4 + 1] = y + oy + (rnd() - 0.5) * hs * 0.1; pos[n * 4 + 2] = z + oz + (rnd() - 0.5) * hs * 0.1;
          pos[n * 4 + 3] = mi;
          F[n * 12] = 1; F[n * 12 + 5] = 1; F[n * 12 + 10] = 1;
          F[n * 12 + 3] = strengthNoise(lp[0], lp[1], lp[2], mi);
          n++;
        }
        jl.start = start; jl.count = n - start;
      });
      for (let i = n; i < this.maxP; i++) pos[i * 4 + 3] = -1;
      this.np = n;
      const q = GPU.device.queue;
      q.writeBuffer(this.buf.pos, 0, pos);
      q.writeBuffer(this.buf.aF, 0, F);
      const enc = GPU.device.createCommandEncoder();
      for (const k of ['vel', 'aC', 'balls', 'ballsOut', 'stat', 'gvel']) enc.clearBuffer(this.buf[k]);
      q.submit([enc.finish()]);
      this.time = 0; this.stepCount = 0; this.nBalls = 0; this.ballSlot = 0; this.ballInfo = [];
      this.updateMaterials();
    }

    updateMaterials() {
      const m = this.matData;
      this.jellies.forEach((jl, i) => {
        const E = jl.E * 1000, nu = jl.nu || 0.42;
        m[i * 4] = E / (2 * (1 + nu)) / this.rho;
        m[i * 4 + 1] = E * nu / ((1 + nu) * (1 - 2 * nu)) / this.rho;
        m[i * 4 + 2] = jl.strength * 1000 / this.rho;
        m[i * 4 + 3] = (jl.visc !== undefined ? jl.visc : this.params.visc);
      });
      GPU.device.queue.writeBuffer(this.buf.mats, 0, m);
    }

    /* b: {pos:[世界], vel, radius, mass, kind} */
    spawnBall(b) {
      const slot = this.ballSlot % this.maxBalls;
      this.ballSlot++;
      this.nBalls = Math.min(this.maxBalls, Math.max(this.nBalls, slot + 1));
      const f = new Float32Array(32);
      f[0] = b.pos[0] + this.origin[0]; f[1] = b.pos[1] + this.origin[1]; f[2] = b.pos[2] + this.origin[2]; f[3] = b.radius;
      f[4] = b.vel ? b.vel[0] : 0; f[5] = b.vel ? b.vel[1] : 0; f[6] = b.vel ? b.vel[2] : 0; f[7] = b.mass;
      const a = slot * 1.7 + 0.4;
      f[8] = Math.sin(a) * 0.4; f[9] = Math.cos(a * 1.3) * 0.4; f[10] = Math.sin(a * 0.7) * 0.3; f[11] = 0.8;
      const ql = Math.hypot(f[8], f[9], f[10], f[11]); f[8] /= ql; f[9] /= ql; f[10] /= ql; f[11] /= ql;
      f[12] = b.ang ? b.ang[0] : 0; f[13] = b.ang ? b.ang[1] : 0; f[14] = b.ang ? b.ang[2] : 0; f[15] = 1;
      f[20] = -10; f[23] = b.kind || 0;
      f[24] = -10; f[28] = -10;
      GPU.device.queue.writeBuffer(this.buf.balls, slot * 128, f);
      this.ballInfo[slot] = { kind: b.kind || 0, radius: b.radius, mass: b.mass };
      return slot;
    }

    _writeU() {
      const u = this.uU32, f = this.uF32, p = this.params;
      u[0] = this.NX; u[1] = this.NY; u[2] = this.NZ; u[3] = this.np;
      f[4] = this.dx; f[5] = 1 / this.dx; f[6] = this.dt; f[7] = this.time;
      f[8] = p.gravity; f[9] = this.floorY; f[10] = p.floorMu; f[11] = p.ballMu;
      f[12] = p.dmgRate; f[13] = p.contactPad; f[14] = this.mp; f[15] = p.pressK;
      u[16] = this.nBalls; u[17] = this.stepCount; u[18] = 0; u[19] = 0;
      GPU.device.queue.writeBuffer(this.buf.U, 0, this.uData);
    }

    /* 推进 n 个固定子步（分批提交） */
    step(n) {
      const d = GPU.device, B = this.buf, P = this.pipe, G = this.bg;
      const gx = Math.ceil(this.NX / 8), gy = Math.ceil(this.NY / 4), gz = Math.ceil(this.NZ / 4);
      const pg = Math.ceil(this.np / 256);
      while (n > 0) {
        const m = Math.min(n, 25);
        this._writeU();
        const enc = d.createCommandEncoder();
        for (let i = 0; i < m; i++) {
          enc.clearBuffer(B.gm);
          if (this.nBalls > 0) enc.clearBuffer(B.bacc);
          const cp = enc.beginComputePass();
          cp.setPipeline(P.p2g); cp.setBindGroup(0, G.p2g); cp.dispatchWorkgroups(pg);
          cp.setPipeline(P.grid); cp.setBindGroup(0, G.grid); cp.dispatchWorkgroups(gx, gy, gz);
          cp.setPipeline(P.g2p); cp.setBindGroup(0, G.g2p); cp.dispatchWorkgroups(pg);
          if (this.nBalls > 0) { cp.setPipeline(P.ball); cp.setBindGroup(0, G.ball); cp.dispatchWorkgroups(1); }
          cp.end();
          if (this.nBalls > 0) enc.copyBufferToBuffer(B.ballsOut, 0, B.balls, 0, this.nBalls * 128);
        }
        d.queue.submit([enc.finish()]);
        this.time += m * this.dt; this.stepCount += m;
        n -= m;
      }
    }

    async stats() {
      const n = this.np;
      const p = new Float32Array(await JW.readBuffer(this.buf.pos, 0, n * 16));
      const v = new Float32Array(await JW.readBuffer(this.buf.vel, 0, n * 16));
      const out = { n, nan: 0, vmax: 0, jel: [] };
      for (const jl of this.jellies) {
        let ymax = -1e9, ysum = 0, xs = 0, zs = 0, dmg = 0, full = 0, xmin = 1e9, xmax = -1e9;
        for (let i = jl.start; i < jl.start + jl.count; i++) {
          const y = p[i * 4 + 1];
          if (!(y === y)) { out.nan++; continue; }
          ysum += y; if (y > ymax) ymax = y; xs += p[i * 4]; zs += p[i * 4 + 2];
          if (p[i * 4] < xmin) xmin = p[i * 4]; if (p[i * 4] > xmax) xmax = p[i * 4];
          const d = (p[i * 4 + 3] % 1) / 0.99; if (d > 0.05) dmg++; if (d > 0.98) full++;
          const s = Math.hypot(v[i * 4], v[i * 4 + 1], v[i * 4 + 2]); if (s > out.vmax) out.vmax = s;
        }
        const c = jl.count;
        out.jel.push({ n: c, top: +(ymax - this.floorY).toFixed(4), ymean: +(ysum / c - this.floorY).toFixed(4), cx: +(xs / c - this.origin[0]).toFixed(4), cz: +(zs / c - this.origin[2]).toFixed(4), w: +(xmax - xmin).toFixed(4), dmg, full });
      }
      return out;
    }
    async readBalls() {
      if (!this.nBalls) return [];
      const f = new Float32Array(await JW.readBuffer(this.buf.balls, 0, this.nBalls * 128));
      const out = [];
      for (let i = 0; i < this.nBalls; i++) {
        const a = Array.from(f.subarray(i * 32, i * 32 + 32));
        a[0] -= this.origin[0]; a[1] -= this.origin[1]; a[2] -= this.origin[2];
        out.push(a);
      }
      return out;
    }
  };
})();
