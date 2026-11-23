/* ===== water_sim.js : 三维 MLS-MPM（APIC）水体，WebGPU 计算着色器；小球与水双向耦合 ===== */
'use strict';

const WATER_CFG = {
  dx: 0.02, pad: 3,
  LX: 2.4, LY: 0.8, LZ: 0.44,
  level: 0.38,             // 静水深
  ppc: 8,                  // 每格粒子数（2×2×2）
  dt: 4.0e-4,
  c: 13.0,                 // 弱可压缩声速
  paddleX0: 0.2, paddleThick: 0.03, ampMax: 0.13,
  maxBalls: 24,
  fixed: 2.0e8,            // 定点数精度
};

const WGSL_WATER_COMPUTE = /* wgsl */`
struct Particle { x: vec3f, foam: f32, v: vec3f, rho: f32, C: mat3x3f };
struct Ball {
  pos: vec3f, r: f32,
  vel: vec3f, invM: f32,
  w: vec3f, dens: f32,
  q: vec4f,
  col: vec3f, kind: f32,
  aux: vec4f,   // x=释放时间, y=分组, z=浸没率, w=状态(<-0.5 无效)
  uf: vec4f,    // 平滑后的水流速度, w=备用
};
struct P {
  dims: vec4u,     // gx gy gz np
  g0: vec4f,       // dx invDx dt gravity
  f0: vec4f,       // rho0 k gamma visc
  f1: vec4f,       // S invS time pmass
  tank: vec4f,     // LX LY LZ pad
  paddle: vec4f,   // xp vp enabled thick
  nb: vec4u,       // numBalls ...
  foam: vec4f,     // gen decay ...
  terr: vec4f,     // nx nz step 0
  ball: vec4f,     // restitution, cd, ...
};
@group(0) @binding(0) var<uniform> U: P;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> gMass: array<atomic<i32>>;
@group(0) @binding(3) var<storage, read_write> gMom: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> gVel: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> ballsA: array<Ball>;
@group(0) @binding(6) var<storage, read_write> ballAcc: array<atomic<i32>>;
@group(0) @binding(7) var<storage, read> terrain: array<f32>;
@group(0) @binding(8) var<storage, read_write> ballsB: array<Ball>;

const PAD: f32 = 3.0;
const BACC: u32 = 12u;

fn gIndex(c: vec3i) -> u32 { return u32(c.x) + U.dims.x * (u32(c.y) + U.dims.y * u32(c.z)); }

fn terrH(xz: vec2f) -> f32 {
  let st = U.terr.z;
  let fx = clamp(xz.x / st, 0.0, U.terr.x - 1.001);
  let fz = clamp(xz.y / st, 0.0, U.terr.y - 1.001);
  let ix = u32(fx); let iz = u32(fz);
  let tx = fx - f32(ix); let tz = fz - f32(iz);
  let nx = u32(U.terr.x);
  let a = terrain[iz * nx + ix]; let b = terrain[iz * nx + ix + 1u];
  let c = terrain[(iz + 1u) * nx + ix]; let d = terrain[(iz + 1u) * nx + ix + 1u];
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}
// xyz = 法线, w = 近似有向距离
fn terrSdf(p: vec3f) -> vec4f {
  let e = 0.012;
  let h = terrH(p.xz);
  let hx = terrH(p.xz + vec2f(e, 0.0)) - terrH(p.xz - vec2f(e, 0.0));
  let hz = terrH(p.xz + vec2f(0.0, e)) - terrH(p.xz - vec2f(0.0, e));
  let n = normalize(vec3f(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
  return vec4f(n, (p.y - h) * n.y);
}

// ---- 二次 B 样条权重 ----
fn bw(fx: vec3f) -> array<vec3f, 3> {
  var w: array<vec3f, 3>;
  w[0] = 0.5 * (1.5 - fx) * (1.5 - fx);
  w[1] = 0.75 - (fx - 1.0) * (fx - 1.0);
  w[2] = 0.5 * (fx - 0.5) * (fx - 0.5);
  return w;
}

// ① 质量散射（定点原子加）
@compute @workgroup_size(64)
fn p2gMass(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= U.dims.w) { return; }
  let p = parts[i];
  let gp = p.x * U.g0.y + vec3f(PAD);
  let base = vec3i(floor(gp - 0.5));
  let fx = gp - vec3f(base);
  let w = bw(fx);
  let mp = U.f1.w * U.f1.x;
  for (var k = 0; k < 3; k++) { for (var j = 0; j < 3; j++) { for (var l = 0; l < 3; l++) {
    let wt = w[l].x * w[j].y * w[k].z;
    atomicAdd(&gMass[gIndex(base + vec3i(l, j, k))], i32(wt * mp));
  } } }
}

// ② 密度 → 压强 → 动量散射
@compute @workgroup_size(64)
fn p2gMom(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= U.dims.w) { return; }
  var p = parts[i];
  let dx = U.g0.x; let dt = U.g0.z;
  let gp = p.x * U.g0.y + vec3f(PAD);
  let base = vec3i(floor(gp - 0.5));
  let fx = gp - vec3f(base);
  let w = bw(fx);
  var dens = 0.0;
  for (var k = 0; k < 3; k++) { for (var j = 0; j < 3; j++) { for (var l = 0; l < 3; l++) {
    let wt = w[l].x * w[j].y * w[k].z;
    dens += wt * f32(atomicLoad(&gMass[gIndex(base + vec3i(l, j, k))])) * U.f1.y;
  } } }
  dens = dens / (dx * dx * dx);
  let ratio = dens / U.f0.x;
  p.rho = ratio;
  let mp = U.f1.w;
  let vol = mp / max(dens, 1.0);
  var press = U.f0.y / U.f0.z * (pow(max(ratio, 0.0), U.f0.z) - 1.0);
  press = max(press, 0.0);
  let k4 = dt * vol * 4.0 * U.g0.y * U.g0.y;
  var aff = mp * p.C;
  // 压强项 + 少量黏性
  let sym = p.C + transpose(p.C);
  aff = aff + mat3x3f(vec3f(k4 * press, 0.0, 0.0), vec3f(0.0, k4 * press, 0.0), vec3f(0.0, 0.0, k4 * press)) - sym * (k4 * U.f0.w);
  parts[i] = p;
  for (var k = 0; k < 3; k++) { for (var j = 0; j < 3; j++) { for (var l = 0; l < 3; l++) {
    let wt = w[l].x * w[j].y * w[k].z;
    let dpos = (vec3f(f32(l), f32(j), f32(k)) - fx) * dx;
    let mom = wt * (mp * p.v + aff * dpos) * U.f1.x;
    let id = gIndex(base + vec3i(l, j, k)) * 3u;
    atomicAdd(&gMom[id], i32(mom.x));
    atomicAdd(&gMom[id + 1u], i32(mom.y));
    atomicAdd(&gMom[id + 2u], i32(mom.z));
  } } }
}

// ③ 网格更新：重力、边界、造浪板、地形、小球（含耦合统计）
@compute @workgroup_size(64)
fn gridUpdate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let nn = U.dims.x * U.dims.y * U.dims.z;
  if (i >= nn) { return; }
  let dx = U.g0.x; let dt = U.g0.z;
  let ix = i % U.dims.x; let iy = (i / U.dims.x) % U.dims.y; let iz = i / (U.dims.x * U.dims.y);
  let pos = (vec3f(f32(ix), f32(iy), f32(iz)) - vec3f(PAD)) * dx;
  let m = f32(atomicExchange(&gMass[i], 0)) * U.f1.y;
  let mom = vec3f(f32(atomicExchange(&gMom[3u * i], 0)), f32(atomicExchange(&gMom[3u * i + 1u], 0)), f32(atomicExchange(&gMom[3u * i + 2u], 0))) * U.f1.y;
  var v = vec3f(0.0);
  if (m > 1e-9) {
    v = mom / m;
    v.y = v.y - U.g0.w * dt;
  }
  let fillFull = U.f0.x * dx * dx * dx;
  let fill = clamp(m / fillFull, 0.0, 1.0);
  // 固体判断（用于小球统计时排除）
  let ts = terrSdf(pos);
  var solid = ts.w < 0.3 * dx || pos.x < U.paddle.x + 0.5 * dx || pos.x > U.tank.x || pos.z < 0.0 || pos.z > U.tank.z;
  // 小球：先统计水流（BC 之前），再施加边界
  let nb = U.nb.x;
  var inBall = false;
  var ballV = vec3f(0.0);
  var ballN = vec3f(0.0);
  var inShell = false;
  for (var b = 0u; b < nb; b++) {
    let ball = ballsA[b];
    if (ball.aux.w < -0.5) { continue; }
    if (U.f1.z < ball.aux.x) { continue; }
    let d = length(pos - ball.pos);
    let R = ball.r;
    if (d < R + 3.0 * dx && d > R + 0.9 * dx && !solid) {
      let o = b * BACC;
      atomicAdd(&ballAcc[o], i32(1.0e4));
      atomicAdd(&ballAcc[o + 1u], i32(fill * 1.0e4));
      atomicAdd(&ballAcc[o + 2u], i32(fill * v.x * 1.0e4));
      atomicAdd(&ballAcc[o + 3u], i32(fill * v.y * 1.0e4));
      atomicAdd(&ballAcc[o + 4u], i32(fill * v.z * 1.0e4));
    }
    if (d < R + 0.3 * dx) {
      inBall = true; ballV = ball.vel + cross(ball.w, pos - ball.pos);
    } else if (d < R + 1.0 * dx) {
      let n = (pos - ball.pos) / max(d, 1e-5);
      let vr = v - ball.vel;
      let vn = dot(vr, n);
      if (vn < 0.0) { v = v - n * vn; }
    }
  }
  if (inBall) { v = ballV; }
  // 外壁（滑移）
  let gx = f32(ix); let gy = f32(iy); let gz = f32(iz);
  if (gz <= PAD) { v.z = max(v.z, 0.0); }
  if (gz >= PAD + U.tank.z / dx) { v.z = min(v.z, 0.0); }
  if (gx >= PAD + U.tank.x / dx) { v.x = min(v.x, 0.0); }
  if (gx <= PAD) { v.x = max(v.x, 0.0); }
  if (gy >= PAD + U.tank.y / dx) { v.y = min(v.y, 0.0); }
  // 造浪板（活塞）
  if (U.paddle.z > 0.5) {
    if (pos.x < U.paddle.x) { v.x = U.paddle.y; }
    else if (pos.x < U.paddle.x + 0.6 * dx) { v.x = max(v.x, U.paddle.y); }
  }
  // 地形
  if (ts.w < 0.45 * dx) {
    let vn = dot(v, ts.xyz);
    if (vn < 0.0) { v = v - ts.xyz * vn; }
    v = v * (1.0 - 0.0006);
  }
  gVel[i] = vec4f(v, m);
}

// ④ 小球动力学（读 A 写 B，避免读写竞争）
@compute @workgroup_size(32)
fn ballStep(@builtin(global_invocation_id) gid: vec3u) {
  let bi = gid.x; if (bi >= U.nb.x) { return; }
  var b = ballsA[bi];
  let dt = U.g0.z; let g = U.g0.w; let rho0 = U.f0.x;
  let o = bi * BACC;
  let cnt = f32(atomicExchange(&ballAcc[o], 0)) * 1.0e-4;
  let fillSum = f32(atomicExchange(&ballAcc[o + 1u], 0)) * 1.0e-4;
  let velSum = vec3f(f32(atomicExchange(&ballAcc[o + 2u], 0)), f32(atomicExchange(&ballAcc[o + 3u], 0)), f32(atomicExchange(&ballAcc[o + 4u], 0))) * 1.0e-4;
  if (b.aux.w < -0.5 || U.f1.z < b.aux.x) { ballsB[bi] = b; return; }
  let R = b.r;
  let V = 4.0 / 3.0 * 3.14159265 * R * R * R;
  let m = b.dens * rho0 * V;
  var phi = 0.0; var uf = vec3f(0.0);
  if (cnt > 0.5) {
    phi = clamp(fillSum / cnt, 0.0, 1.0);
    if (fillSum > 0.02) { uf = velSum / fillSum; }
  }
  // 平滑
  let phiS = mix(b.aux.z, phi, 0.12);
  let ufPrev = b.uf.xyz;
  let ufS = mix(ufPrev, uf, 0.10);
  let dudt = clamp((ufS - ufPrev) / dt, vec3f(-30.0), vec3f(30.0));
  var F = vec3f(0.0, -m * g, 0.0);
  F.y = F.y + phiS * rho0 * V * g;
  let vr = ufS - b.vel;
  let sp = length(vr);
  let A = 3.14159265 * R * R;
  let cdEff = U.ball.y + 1.2 * 4.0 * phiS * (1.0 - phiS);
  F = F + 0.5 * rho0 * cdEff * A * sp * vr * clamp(phiS * 1.5, 0.0, 1.0);
  F = F + vr * (6.0 * 3.14159265 * 0.08 * R) * phiS;
  F = F + rho0 * V * phiS * dudt * 0.55;
  let meff = m + 0.5 * rho0 * V * phiS;
  var vel = b.vel + F / meff * dt;
  var pos = b.pos;
  var w = b.w;
  w = w * exp(-dt * phiS * 2.2);
  let I = 0.4 * m * R * R;
  let eRest = U.ball.x;
  // 墙与地形的接触
  // 造浪板
  var n = vec3f(0.0); var depth = 0.0; var vWall = vec3f(0.0); var hit = false;
  let xmin = U.paddle.x + R;
  if (pos.x < xmin) { n = vec3f(1.0, 0.0, 0.0); depth = xmin - pos.x; vWall = vec3f(U.paddle.y, 0.0, 0.0); hit = true; }
  if (hit) {
    pos = pos + n * depth;
    let rel = vel - vWall; let vn = dot(rel, n);
    if (vn < 0.0) { vel = vel - (1.0 + eRest) * vn * n; }
  }
  if (pos.x > U.tank.x - R) { pos.x = U.tank.x - R; if (vel.x > 0.0) { vel.x = -vel.x * eRest; } }
  if (pos.z < R) { pos.z = R; if (vel.z < 0.0) { vel.z = -vel.z * eRest; } }
  if (pos.z > U.tank.z - R) { pos.z = U.tank.z - R; if (vel.z > 0.0) { vel.z = -vel.z * eRest; } }
  if (pos.y > U.tank.y - R) { pos.y = U.tank.y - R; if (vel.y > 0.0) { vel.y = -vel.y * 0.3; } }
  // 地形与槽底
  var ts = terrSdf(pos);
  var sd = ts.w - R;
  if (sd < 0.0) {
    let nn = ts.xyz;
    pos = pos + nn * (-sd);
    let vn = dot(vel, nn);
    var Jn = m * g * dt * 0.8;
    if (vn < 0.0) {
      let e = select(0.0, eRest, -vn > 0.35);
      Jn = max(Jn, m * (-vn) * (1.0 + e));
      vel = vel - (1.0 + e) * vn * nn;
    }
    // 滚动摩擦（库仑）
    let vt = vel - nn * dot(vel, nn);
    let vc = vt + cross(w, -nn * R);
    let vcl = length(vc);
    if (vcl > 1e-6) {
      let Jt = min(vcl * m / 3.5, 0.55 * Jn * clamp(1.0 - phiS / max(b.dens, 0.5), 0.2, 1.0));
      let dir = -vc / vcl;
      vel = vel + dir * Jt / m;
      w = w + cross(-nn * R, dir * Jt) / I;
    }
    w = w * (1.0 - 0.8 * dt);
  }
  // 球-球
  for (var j = 0u; j < U.nb.x; j++) {
    if (j == bi) { continue; }
    let o2 = ballsA[j];
    if (o2.aux.w < -0.5 || U.f1.z < o2.aux.x) { continue; }
    let d = b.pos - o2.pos;
    let dist = length(d);
    let rr = R + o2.r;
    if (dist < rr && dist > 1e-6) {
      let nn = d / dist;
      let m2 = o2.dens * rho0 * (4.0 / 3.0 * 3.14159265 * o2.r * o2.r * o2.r);
      let wsum = 1.0 / m + 1.0 / m2;
      pos = pos + nn * (rr - dist) * (1.0 / m) / wsum;
      let vrel = dot(vel - o2.vel, nn);
      if (vrel < 0.0) {
        let e = 0.5;
        let J = -(1.0 + e) * vrel / wsum;
        vel = vel + nn * J / m;
        // 切向摩擦产生自旋
        let vt = (vel - o2.vel) - nn * dot(vel - o2.vel, nn);
        let tl = length(vt);
        if (tl > 1e-5) { let Jt = min(0.2 * J, tl * m * 0.3); w = w + cross(-nn * R, -vt / tl * Jt) / I; vel = vel - vt / tl * Jt / m; }
      }
    }
  }
  vel = clamp(vel, vec3f(-9.0), vec3f(9.0));
  pos = pos + vel * dt;
  // 姿态
  let wl = length(w);
  var q = b.q;
  if (wl > 1e-5) {
    let ang = wl * dt * 0.5; let s = sin(ang) / wl;
    let dq = vec4f(w * s, cos(ang));
    q = vec4f(dq.w * q.xyz + q.w * dq.xyz + cross(dq.xyz, q.xyz), dq.w * q.w - dot(dq.xyz, q.xyz));
    q = normalize(q);
  }
  b.pos = pos; b.vel = vel; b.w = w; b.q = q;
  b.aux.z = phiS; b.uf = vec4f(ufS, 0.0);
  ballsB[bi] = b;
}
@compute @workgroup_size(32)
fn ballCopy(@builtin(global_invocation_id) gid: vec3u) {
  let bi = gid.x; if (bi >= U.nb.x) { return; }
  ballsA[bi] = ballsB[bi];
}

// ⑤ 网格 → 粒子
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= U.dims.w) { return; }
  var p = parts[i];
  let dx = U.g0.x; let dt = U.g0.z;
  let gp = p.x * U.g0.y + vec3f(PAD);
  let base = vec3i(floor(gp - 0.5));
  let fx = gp - vec3f(base);
  let w = bw(fx);
  var v = vec3f(0.0);
  var C = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
  let kc = 4.0 * U.g0.y * U.g0.y;
  for (var k = 0; k < 3; k++) { for (var j = 0; j < 3; j++) { for (var l = 0; l < 3; l++) {
    let wt = w[l].x * w[j].y * w[k].z;
    let gv = gVel[gIndex(base + vec3i(l, j, k))].xyz;
    let dpos = (vec3f(f32(l), f32(j), f32(k)) - fx) * dx;
    v += wt * gv;
    C = C + mat3x3f(gv * (dpos.x * wt * kc), gv * (dpos.y * wt * kc), gv * (dpos.z * wt * kc));
  } } }
  let sp = length(v);
  if (sp > 14.0) { v = v * (14.0 / sp); }
  var x = p.x + v * dt;
  // 约束：槽壁、造浪板、地形
  x.x = clamp(x.x, 0.35 * dx, U.tank.x - 0.35 * dx);
  x.z = clamp(x.z, 0.35 * dx, U.tank.z - 0.35 * dx);
  x.y = min(x.y, U.tank.y - 0.35 * dx);
  if (U.paddle.z > 0.5 && x.x < U.paddle.x + 0.35 * dx) { x.x = U.paddle.x + 0.35 * dx; v.x = max(v.x, U.paddle.y); }
  let ts = terrSdf(x);
  if (ts.w < 0.3 * dx) {
    x = x + ts.xyz * (0.3 * dx - ts.w);
    let vn = dot(v, ts.xyz);
    if (vn < 0.0) { v = v - ts.xyz * vn; }
  }
  // 白水：由粒子的速度梯度、速度与表层程度得出
  let ratio = p.rho;
  let surf = 1.0 - smoothstep(0.55, 0.95, ratio);
  let strain = sqrt(dot(C[0], C[0]) + dot(C[1], C[1]) + dot(C[2], C[2]));
  var gen = surf * (smoothstep(6.0, 26.0, strain) * 3.2 + smoothstep(1.3, 3.2, sp) * 1.6);
  gen = gen + (1.0 - smoothstep(0.05, 0.35, ratio)) * smoothstep(1.0, 2.5, sp) * 1.4;
  var f = p.foam + gen * dt;
  f = f - dt * (U.foam.y + U.foam.z * (1.0 - surf));
  p.foam = clamp(f, 0.0, 1.0);
  p.x = x; p.v = v; p.C = C;
  parts[i] = p;
}
`;

/* 水面高度图 + 焦散（由粒子的最高层得出，只用于光照） */
const WGSL_WATER_SURF = /* wgsl */`
struct Particle { x: vec3f, foam: f32, v: vec3f, rho: f32, C: mat3x3f };
struct SU { dims: vec4u, tank: vec4f, misc: vec4f };   // sx sz np 0 ; LX LZ cell 0
@group(0) @binding(0) var<uniform> S: SU;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> surf: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> hbuf: array<f32>;
@group(0) @binding(4) var outTex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var<storage, read_write> stats: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read> terrain: array<f32>;

@compute @workgroup_size(64)
fn clearSurf(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= S.dims.x * S.dims.y) { return; }
  atomicStore(&surf[i], 0u);
  if (i < 4u) { atomicStore(&stats[i], 0u); }
}
var<workgroup> wsum: atomic<u32>;
@compute @workgroup_size(64)
fn splat(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&wsum, 0u); }
  workgroupBarrier();
  let i = gid.x;
  if (i < S.dims.z) {
    let p = parts[i];
    if (p.rho > 0.55) {
      let cx = u32(clamp(p.x.x / S.misc.z, 0.0, f32(S.dims.x - 1u)));
      let cz = u32(clamp(p.x.z / S.misc.z, 0.0, f32(S.dims.y - 1u)));
      atomicMax(&surf[cz * S.dims.x + cx], u32((p.x.y + 0.5) * 2000.0));
    }
    atomicAdd(&wsum, u32(p.foam * 100.0));
  }
  workgroupBarrier();
  if (li == 0u) { atomicAdd(&stats[0], atomicLoad(&wsum)); }
}
fn getS(x: i32, z: i32) -> f32 {
  let cx = clamp(x, 0, i32(S.dims.x) - 1); let cz = clamp(z, 0, i32(S.dims.y) - 1);
  let v = atomicLoad(&surf[u32(cz) * S.dims.x + u32(cx)]);
  return select(-9.0, f32(v) / 2000.0 - 0.5, v > 0u);
}
@compute @workgroup_size(8, 8)
fn smoothH(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= S.dims.x || gid.y >= S.dims.y) { return; }
  var s = 0.0; var ws = 0.0;
  for (var dz = -3; dz <= 3; dz++) { for (var dx = -3; dx <= 3; dx++) {
    let h = getS(i32(gid.x) + dx, i32(gid.y) + dz);
    if (h > -5.0) {
      let w = exp(-f32(dx * dx + dz * dz) / 6.0);
      s += h * w; ws += w;
    }
  } }
  hbuf[gid.y * S.dims.x + gid.x] = select(-9.0, s / ws, ws > 0.6);
}
fn getH(x: i32, z: i32) -> f32 {
  let cx = clamp(x, 0, i32(S.dims.x) - 1); let cz = clamp(z, 0, i32(S.dims.y) - 1);
  return hbuf[u32(cz) * S.dims.x + u32(cx)];
}
@compute @workgroup_size(8, 8)
fn caustic(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= S.dims.x || gid.y >= S.dims.y) { return; }
  let x = i32(gid.x); let z = i32(gid.y);
  let h = getH(x, z);
  if (h < -5.0) { textureStore(outTex, vec2i(x, z), vec4f(-1.0, 1.0, 0.0, 1.0)); return; }
  var lap = 0.0; var cnt = 0.0;
  let rr = 3;
  for (var k = 1; k <= 2; k++) {
    let hx1 = getH(x + k * rr / 2 + 1, z); let hx0 = getH(x - k * rr / 2 - 1, z);
    let hz1 = getH(x, z + k * rr / 2 + 1); let hz0 = getH(x, z - k * rr / 2 - 1);
    if (hx1 > -5.0 && hx0 > -5.0 && hz1 > -5.0 && hz0 > -5.0) {
      let st = f32(k * rr / 2 + 1) * S.misc.z;
      lap += (hx1 + hx0 + hz1 + hz0 - 4.0 * h) / (st * st); cnt += 1.0;
    }
  }
  if (cnt > 0.0) { lap = lap / cnt; }
  // 地形高度（深度）
  let fx = clamp(f32(x) * S.misc.z / 0.01, 0.0, 239.0); let fz = clamp(f32(z) * S.misc.z / 0.01, 0.0, 43.0);
  let floorY = terrain[u32(fz) * 241u + u32(fx)];
  let D = max(h - floorY, 0.02);
  let I = clamp(1.0 - 0.26 * D * lap, 0.25, 3.2);
  textureStore(outTex, vec2i(x, z), vec4f(h, I, 0.0, 1.0));
}
`;

/* ---------- 地形（槽底）高度图：同时供模拟与渲染 ---------- */
function terrainHeight(x, z) {
  const C = WATER_CFG;
  // 远端沙滩斜坡（越往岸边越浅，浪变陡、破碎）
  let h = 0;
  if (x > 0.95) { const t = clamp((x - 0.95) / 1.45, 0, 1); h = 0.33 * Math.pow(t, 1.25); }
  if (typeof window !== 'undefined' && window.__NOOBS) return h;
  // 水下横脊：只占一部分宽度，另一侧留出缺口（浪越过与绕行）
  const rx = (x - 1.02) / 0.15;
  const zz = clamp((0.285 - z) / 0.06, 0, 1); // z<0.285 有脊，之后渐出
  const ridge = 0.15 * Math.exp(-rx * rx * 1.6) * smooth01(zz);
  // 圆形礁石
  const dx = x - 1.62, dz = z - 0.30;
  const rock = 0.20 * Math.exp(-(dx * dx + dz * dz) / (2 * 0.075 * 0.075));
  return Math.max(h, ridge, rock);
}

class WaterSim {
  constructor(R) {
    this.R = R; this.D = R.D;
    const C = WATER_CFG;
    this.cfg = C;
    this.nx = Math.round(C.LX / C.dx); this.ny = Math.round(C.LY / C.dx); this.nz = Math.round(C.LZ / C.dx);
    this.gx = this.nx + 2 * C.pad + 1; this.gy = this.ny + 2 * C.pad + 1; this.gz = this.nz + 2 * C.pad + 1;
    this.cells = this.gx * this.gy * this.gz;
    this.rho0 = 1000; this.mp = this.rho0 * C.dx ** 3 / C.ppc;
    this.k = this.rho0 * C.c * C.c; this.gamma = 3.0;
    this.time = 0; this.substeps = 0;
    this.paddle = { x: C.paddleX0, v: 0, phase: 0, amp: 0, ampTarget: 0, freq: 1.0, on: true };
    this.params = { amp: 0.4, freq: 1.0, running: false };
    this.makeTerrain();
    this.build();
  }
  makeTerrain() {
    const nxT = 241, nzT = 45; // 步长 0.01
    const t = new Float32Array(nxT * nzT);
    for (let k = 0; k < nzT; k++) for (let i = 0; i < nxT; i++) t[k * nxT + i] = terrainHeight(i * 0.01, k * 0.01);
    this.terrain = t; this.terrDims = [nxT, nzT];
  }
  build() {
    const D = this.D, C = this.cfg;
    this.mod = GPUX.module(WGSL_WATER_COMPUTE, 'waterCompute');
    this.surfMod = GPUX.module(WGSL_WATER_SURF, 'waterSurf');
    // 缓冲区
    this.maxP = 420000;
    this.partBuf = GPUX.buffer(this.maxP * 80, BU.STORAGE | BU.COPY_DST | BU.COPY_SRC, 'particles');
    this.gMass = GPUX.buffer(this.cells * 4, BU.STORAGE | BU.COPY_DST, 'gMass');
    this.gMom = GPUX.buffer(this.cells * 12, BU.STORAGE | BU.COPY_DST, 'gMom');
    this.gVel = GPUX.buffer(this.cells * 16, BU.STORAGE, 'gVel');
    this.ballBuf = GPUX.buffer(C.maxBalls * BALL_B, BU.STORAGE | BU.COPY_DST | BU.COPY_SRC, 'ballsA');
    this.ballBufB = GPUX.buffer(C.maxBalls * BALL_B, BU.STORAGE | BU.COPY_DST, 'ballsB');
    this.ballAcc = GPUX.buffer(C.maxBalls * 12 * 4, BU.STORAGE | BU.COPY_DST, 'ballAcc');
    this.terrBuf = GPUX.bufferFrom(this.terrain, BU.STORAGE, 'terrain');
    this.ballRead = GPUX.buffer(C.maxBalls * BALL_B, BU.COPY_DST | BU.MAP_READ, 'ballRead');
    // 每个子步一份 uniform（动态偏移）
    this.maxSub = 128; this.uStride = 256;
    this.uBuf = GPUX.buffer(this.maxSub * this.uStride, BU.UNIFORM | BU.COPY_DST, 'P');
    this.uData = new Float32Array(this.maxSub * this.uStride / 4);
    this.uDataU = new Uint32Array(this.uData.buffer);
    this.bgl = D.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SS.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
        BL.rw(1), BL.rw(2), BL.rw(3), BL.rw(4), BL.rw(5), BL.rw(6), BL.ro(7, SS.COMPUTE), BL.rw(8),
      ]
    });
    this.bg = D.createBindGroup({
      layout: this.bgl, entries: [
        { binding: 0, resource: { buffer: this.uBuf, size: 256 } },
        { binding: 1, resource: { buffer: this.partBuf } }, { binding: 2, resource: { buffer: this.gMass } },
        { binding: 3, resource: { buffer: this.gMom } }, { binding: 4, resource: { buffer: this.gVel } },
        { binding: 5, resource: { buffer: this.ballBuf } }, { binding: 6, resource: { buffer: this.ballAcc } },
        { binding: 7, resource: { buffer: this.terrBuf } }, { binding: 8, resource: { buffer: this.ballBufB } },
      ]
    });
    const pl = D.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const mk = e => D.createComputePipeline({ layout: pl, compute: { module: this.mod, entryPoint: e } });
    this.pP2GMass = mk('p2gMass'); this.pP2GMom = mk('p2gMom'); this.pGrid = mk('gridUpdate');
    this.pBall = mk('ballStep'); this.pBallCopy = mk('ballCopy'); this.pG2P = mk('g2p');
    // 水面高度/焦散
    this.sx = 240; this.sz = 44;
    this.surfBuf = GPUX.buffer(this.sx * this.sz * 4, BU.STORAGE, 'surf');
    this.hBuf = GPUX.buffer(this.sx * this.sz * 4, BU.STORAGE | BU.COPY_SRC, 'hbuf');
    this.statBuf = GPUX.buffer(16, BU.STORAGE | BU.COPY_SRC, 'stats');
    this.statRead = GPUX.buffer(16, BU.COPY_DST | BU.MAP_READ, 'statRead');
    this.causticTex = GPUX.tex(this.sx, this.sz, 'rgba32float', TU.STORAGE_BINDING | TU.TEXTURE_BINDING, 'caustic');
    this.sU = GPUX.buffer(64, BU.UNIFORM | BU.COPY_DST, 'SU');
    this.sBGL = D.createBindGroupLayout({
      entries: [BL.u(0, SS.COMPUTE), BL.ro(1, SS.COMPUTE), BL.rw(2), BL.rw(3), BL.st(4, 'rgba32float'), BL.rw(5), BL.ro(6, SS.COMPUTE)]
    });
    this.sBG = D.createBindGroup({
      layout: this.sBGL, entries: [
        { binding: 0, resource: { buffer: this.sU } }, { binding: 1, resource: { buffer: this.partBuf } }, { binding: 2, resource: { buffer: this.surfBuf } },
        { binding: 3, resource: { buffer: this.hBuf } }, { binding: 4, resource: this.causticTex.createView() }, { binding: 5, resource: { buffer: this.statBuf } },
        { binding: 6, resource: { buffer: this.terrBuf } },
      ]
    });
    const spl = D.createPipelineLayout({ bindGroupLayouts: [this.sBGL] });
    const smk = e => D.createComputePipeline({ layout: spl, compute: { module: this.surfMod, entryPoint: e } });
    this.pClearS = smk('clearSurf'); this.pSplat = smk('splat'); this.pSmooth = smk('smoothH'); this.pCaustic = smk('caustic');
  }

  /* 初始粒子：按格子抖动采样，覆盖静水位以下、地形以上 */
  seedParticles() {
    const C = this.cfg, dx = C.dx, rng = mulberry32(12345);
    const arr = [];
    const xmin = this.paddle.x + 0.6 * dx;
    for (let kz = 0; kz < this.nz; kz++) for (let ky = 0; ky < this.ny; ky++) for (let kx = 0; kx < this.nx; kx++) {
      const cx = kx * dx, cy = ky * dx, cz = kz * dx;
      if (cy > C.level) break;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        const px = cx + (a * 0.5 + 0.25 + (rng() - 0.5) * 0.3) * dx;
        const py = cy + (b * 0.5 + 0.25 + (rng() - 0.5) * 0.3) * dx;
        const pz = cz + (c * 0.5 + 0.25 + (rng() - 0.5) * 0.3) * dx;
        if (py > C.level || px < xmin) continue;
        if (py < terrainHeight(px, pz) + 0.25 * dx) continue;
        arr.push(px, py, pz);
      }
    }
    return new Float32Array(arr);
  }
  reset() {
    const C = this.cfg;
    this.paddle = { x: C.paddleX0, v: 0, phase: 0, amp: 0, ampTarget: 0, freq: this.params.freq, on: true };
    this.time = 0; this.substeps = 0;
    const pos = this.seedParticles();
    this.np = pos.length / 3;
    if (this.np > this.maxP) throw new Error('粒子数超限 ' + this.np);
    const data = new Float32Array(this.np * 20);
    for (let i = 0; i < this.np; i++) {
      const o = i * 20;
      data[o] = pos[i * 3]; data[o + 1] = pos[i * 3 + 1]; data[o + 2] = pos[i * 3 + 2];
      data[o + 7] = 1.0; // rho ratio
    }
    this.D.queue.writeBuffer(this.partBuf, 0, data);
    const zero = new Uint8Array(this.cells * 12);
    this.D.queue.writeBuffer(this.gMass, 0, zero, 0, this.cells * 4);
    this.D.queue.writeBuffer(this.gMom, 0, zero, 0, this.cells * 12);
    this.D.queue.writeBuffer(this.ballAcc, 0, new Uint8Array(C.maxBalls * 48));
    this.D.queue.writeBuffer(this.bubBuf, 0, new Uint8Array(this.nBub * 32));
    this.lastBubTime = 0; this.bubSeed = 1;
    this.params.running = false;
  }
  /* 写入一个子步的 uniform（槽位 slot） */
  writeU(slot, o) {
    const C = this.cfg, f = this.uData, u = this.uDataU, b = slot * 64;
    u[b] = this.gx; u[b + 1] = this.gy; u[b + 2] = this.gz; u[b + 3] = this.np;
    f[b + 4] = C.dx; f[b + 5] = 1 / C.dx; f[b + 6] = C.dt; f[b + 7] = 9.81;
    f[b + 8] = this.rho0; f[b + 9] = this.k; f[b + 10] = this.gamma; f[b + 11] = this.visc !== undefined ? this.visc : 0.0;
    f[b + 12] = C.fixed; f[b + 13] = 1 / C.fixed; f[b + 14] = o.time; f[b + 15] = this.mp;
    f[b + 16] = C.LX; f[b + 17] = C.LY; f[b + 18] = C.LZ; f[b + 19] = C.pad;
    f[b + 20] = o.px; f[b + 21] = o.pv; f[b + 22] = 1; f[b + 23] = C.paddleThick;
    u[b + 24] = this.nballs || 0; u[b + 25] = 0; u[b + 26] = 0; u[b + 27] = 0;
    f[b + 28] = 0; f[b + 29] = 0.35; f[b + 30] = 1.1; f[b + 31] = 0;
    f[b + 32] = this.terrDims[0]; f[b + 33] = this.terrDims[1]; f[b + 34] = 0.01; f[b + 35] = 0;
    f[b + 36] = this.ballRest !== undefined ? this.ballRest : 0.35; f[b + 37] = 0.5; f[b + 38] = 0; f[b + 39] = 0;
  }
  /* 推进 n 个子步（造浪板运动在 CPU 一侧按子步计算）。每批单独提交，保证 uniform 顺序正确 */
  step(n) {
    const C = this.cfg, dt = C.dt, pd = this.paddle, pr = this.params;
    let k = 0;
    while (k < n) {
      const m = Math.min(n - k, this.maxSub);
      for (let s = 0; s < m; s++) {
        // 造浪板：振幅一阶滤波趋近目标；相位按频率累积
        const target = pr.running ? pr.amp * C.ampMax : 0;
        pd.amp += (target - pd.amp) * Math.min(1, dt / (target > pd.amp ? 0.9 : 0.5));
        pd.freq = pr.freq; pd.phase += 2 * Math.PI * pd.freq * dt;
        const xNew = C.paddleX0 + pd.amp * Math.sin(pd.phase);
        const v = (xNew - pd.x) / dt;
        pd.x = xNew; pd.v = v;
        this.time += dt; this.substeps++;
        this.writeU(s, { time: this.time, px: pd.x, pv: pd.v });
      }
      this.D.queue.writeBuffer(this.uBuf, 0, this.uData, 0, m * 64);
      const enc = this.D.createCommandEncoder();
      const p = enc.beginComputePass();
      const gridGroups = Math.ceil(this.cells / 64), partGroups = Math.ceil(this.np / 64), ballGroups = Math.ceil(Math.max(this.nballs, 1) / 32);
      for (let s = 0; s < m; s++) {
        p.setBindGroup(0, this.bg, [s * this.uStride]);
        p.setPipeline(this.pP2GMass); p.dispatchWorkgroups(partGroups);
        p.setPipeline(this.pP2GMom); p.dispatchWorkgroups(partGroups);
        p.setPipeline(this.pGrid); p.dispatchWorkgroups(gridGroups);
        if (this.nballs > 0) {
          p.setPipeline(this.pBall); p.dispatchWorkgroups(ballGroups);
          p.setPipeline(this.pBallCopy); p.dispatchWorkgroups(ballGroups);
        }
        p.setPipeline(this.pG2P); p.dispatchWorkgroups(partGroups);
      }
      p.end();
      this.D.queue.submit([enc.finish()]);
      k += m;
    }
  }
  /* 每帧一次：水面高度图与焦散 */
  surfaceMaps(enc) {
    const D = this.D;
    const all = new ArrayBuffer(64), u = new Uint32Array(all), f = new Float32Array(all);
    u[0] = this.sx; u[1] = this.sz; u[2] = this.np; u[3] = 0;
    f[4] = this.cfg.LX; f[5] = this.cfg.LZ; f[6] = 0; f[7] = 0;
    f[8] = 0; f[9] = 0; f[10] = 0.01; f[11] = 0;
    D.queue.writeBuffer(this.sU, 0, all);
    const p = enc.beginComputePass();
    p.setBindGroup(0, this.sBG);
    p.setPipeline(this.pClearS); p.dispatchWorkgroups(Math.ceil(this.sx * this.sz / 64));
    p.setPipeline(this.pSplat); p.dispatchWorkgroups(Math.ceil(this.np / 64));
    p.setPipeline(this.pSmooth); p.dispatchWorkgroups(Math.ceil(this.sx / 8), Math.ceil(this.sz / 8));
    p.setPipeline(this.pCaustic); p.dispatchWorkgroups(Math.ceil(this.sx / 8), Math.ceil(this.sz / 8));
    p.end();
  }
}

/* ---------- 气泡：球入水与高速运动时带下，随水流上浮，到水面破灭 ---------- */
const WGSL_BUBBLES = /* wgsl */`
struct Bubble { pos: vec3f, life: f32, vel: vec3f, size: f32 };
struct Ball {
  pos: vec3f, r: f32, vel: vec3f, invM: f32, w: vec3f, dens: f32, q: vec4f, col: vec3f, kind: f32, aux: vec4f, uf: vec4f,
};
struct BU { n: vec4u, f0: vec4f, tank: vec4f, g: vec4u };  // n: numBubbles numBalls seed time bits ; f0: dt dx 0 0 ; tank: LX LY LZ 0 ; g: gx gy gz 0
@group(0) @binding(0) var<uniform> B: BU;
@group(0) @binding(1) var<storage, read_write> bubbles: array<Bubble>;
@group(0) @binding(2) var<storage, read> balls: array<Ball>;
@group(0) @binding(3) var<storage, read> gVel: array<vec4f>;
@group(0) @binding(4) var<storage, read> hbuf: array<f32>;

fn pcg(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn rnd(seed: u32) -> f32 { return f32(pcg(seed) & 0xffffffu) / 16777216.0; }

@compute @workgroup_size(64)
fn bubbleStep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= B.n.x) { return; }
  var b = bubbles[i];
  let dt = B.f0.x; let dx = B.f0.y;
  let seed = B.n.z * 1664525u + i * 22695477u;
  if (b.life <= 0.0) {
    let nb = max(B.n.y, 1u);
    let bi = i % nb;
    let ball = balls[bi];
    if (ball.aux.w < -0.5 || ball.aux.x > f32(B.n.w) * 0.001) { bubbles[i] = b; return; }
    let sp = length(ball.vel);
    let phi = ball.aux.z;
    let wet = smoothstep(0.04, 0.45, phi);
    // 入水瞬间（浸没率在 0~0.7）与水下快速运动时释放气泡
    let entry = smoothstep(1.2, 3.0, sp) * (1.0 - smoothstep(0.55, 0.95, phi)) * smoothstep(0.02, 0.15, phi);
    let rate = wet * smoothstep(0.5, 1.8, sp) * 0.6 + entry * 3.0;
    let slots = f32(max(B.n.x / nb, 1u));
    let prob = clamp(rate * 100.0 * dt / slots, 0.0, 1.0);
    if (rnd(seed) < prob) {
      let dirv = select(vec3f(0.0, 1.0, 0.0), normalize(ball.vel), sp > 0.05);
      let off = vec3f(rnd(seed + 11u) - 0.5, rnd(seed + 23u) - 0.5, rnd(seed + 37u) - 0.5) * 1.1;
      b.pos = ball.pos - dirv * ball.r * 1.05 + off * ball.r;
      b.vel = ball.vel * 0.25 + off * 0.3;
      b.size = 0.0035 + 0.0085 * rnd(seed + 53u) * rnd(seed + 59u) + 0.003 * rnd(seed + 61u);
      b.life = 1.5 + 2.5 * rnd(seed + 71u);
    }
    bubbles[i] = b; return;
  }
  // 存活：被水流带动，叠加浮力上升
  let gp = b.pos / dx + vec3f(3.0);
  let ci = vec3i(round(gp));
  var uf = vec3f(0.0);
  if (ci.x >= 0 && ci.y >= 0 && ci.z >= 0 && u32(ci.x) < B.g.x && u32(ci.y) < B.g.y && u32(ci.z) < B.g.z) {
    let gv = gVel[u32(ci.x) + B.g.x * (u32(ci.y) + B.g.y * u32(ci.z))];
    uf = gv.xyz * smoothstep(0.0, 1.0e-4, gv.w);
  }
  let rise = 0.16 + 14.0 * b.size;
  let target = uf + vec3f(0.0, rise, 0.0);
  let k = min(1.0, dt * 9.0);
  b.vel = b.vel + (target - b.vel) * k + vec3f(rnd(seed + 3u) - 0.5, rnd(seed + 5u) - 0.5, rnd(seed + 7u) - 0.5) * 0.35 * dt * 9.0 * 0.3;
  b.pos = b.pos + b.vel * dt;
  b.life = b.life - dt;
  // 触到水面或出槽则破灭
  let cx = i32(clamp(b.pos.x / 0.01, 0.0, 239.0)); let cz = i32(clamp(b.pos.z / 0.01, 0.0, 43.0));
  let hs = hbuf[u32(cz) * 240u + u32(cx)];
  if (hs < -5.0 || b.pos.y > hs - 0.004 || b.pos.x < 0.0 || b.pos.x > B.tank.x || b.pos.z < 0.0 || b.pos.z > B.tank.z || b.pos.y < 0.0) { b.life = 0.0; }
  bubbles[i] = b;
}
`;
