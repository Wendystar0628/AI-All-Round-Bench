// 果冻场景的 WGSL 代码。仿真部分（计算着色器）与渲染部分分开，绑定布局也分开。
// 约定：四面体 t 的顶点编号为 4t+k（每个四面体独占 4 个顶点）；面 e = 4t+f 的邻接信息见 faceInfo。
const JellyWGSL = {
  // 结构体与公共函数，仿真与渲染共用
  common: /* wgsl */ `
const NONE: u32 = 0xffffffffu;

struct Ball {
  pos: vec4f,    // xyz 球心, w 半径
  vel: vec4f,    // xyz 速度, w 质量
  omega: vec4f,  // xyz 角速度, w 是否激活
  quat: vec4f,   // 朝向（x,y,z,w）
  info: vec4f,   // x 累计接触冲量（用于声音）
  color: vec4f,  // rgb 颜色, w 材质 0金属 1石质
};

fn loc(f: u32, k: u32) -> u32 {
  return select(k, k + 1u, k >= f);
}

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
`,

  sim: /* wgsl */ `
struct Params {
  dt: f32, gravity: f32, damping: f32, vrad: f32,
  nTets: u32, nVerts: u32, nBalls: u32, nNodes: u32,
  restitution: f32, friction: f32, weldDamp: f32, ballRest: f32,
  tmin: vec4f, tmax: vec4f,
};

const FP: f32 = 1048576.0;
const CRACK_IDX: u32 = 48u;     // 裂纹计数放在 ballAcc 的末尾

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> vpos: array<vec4f>;      // xyz 位置, w 质量
@group(0) @binding(2) var<storage, read_write> vvel: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vforce: array<vec4f>;
@group(0) @binding(4) var<storage, read> vnode: array<u32>;
@group(0) @binding(5) var<storage, read> tetDinv: array<mat3x3f>;
// 每个四面体 2 个 vec4：[V0, mu, lambda, 断裂应力] 与 [焊接刚度 kw, E, 0, 0]
@group(0) @binding(6) var<storage, read_write> tetPar: array<vec4f>;
// 每个面（4 个/四面体）4 个 u32：[邻居面编号或 NONE, 配对顶点 0, 1, 2]
@group(0) @binding(7) var<storage, read> faceInfo: array<u32>;
@group(0) @binding(8) var<storage, read_write> faceBroken: array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> faceStress: array<f32>;
@group(0) @binding(10) var<storage, read_write> faceVis: array<u32>;
@group(0) @binding(11) var<storage, read_write> balls: array<Ball>;
@group(0) @binding(12) var<storage, read_write> ballAcc: array<atomic<i32>>;
@group(0) @binding(13) var<storage, read_write> nodeAcc: array<atomic<i32>>;
@group(0) @binding(14) var<storage, read_write> nodeNrm: array<vec4f>;

fn addBallImpulse(b: u32, dp: vec3f, arm: vec3f) {
  let imp = dp * FP;
  let tq = cross(arm, dp) * FP;
  let base = b * 6u;
  atomicAdd(&ballAcc[base + 0u], i32(round(imp.x)));
  atomicAdd(&ballAcc[base + 1u], i32(round(imp.y)));
  atomicAdd(&ballAcc[base + 2u], i32(round(imp.z)));
  atomicAdd(&ballAcc[base + 3u], i32(round(tq.x)));
  atomicAdd(&ballAcc[base + 4u], i32(round(tq.y)));
  atomicAdd(&ballAcc[base + 5u], i32(round(tq.z)));
}

// 顶点与静止/运动表面接触：位置已推出表面，这里处理速度（法向恢复 + 库仑摩擦）
fn contactVel(v: vec3f, vs: vec3f, n: vec3f, e: f32, mu: f32) -> vec3f {
  let vr = v - vs;
  let vn = dot(vr, n);
  if (vn >= 0.0) {
    return v;
  }
  let vnNew = -e * vn;
  let dvn = vnNew - vn;
  let vt = vr - vn * n;
  let vtl = length(vt);
  var vtNew = vt;
  if (vtl > 1e-7) {
    vtNew = vt * max(0.0, 1.0 - mu * dvn / vtl);
  }
  return vs + vnNew * n + vtNew;
}

// 第 f 个面的外法向（单位向量）
fn outwardNormal(x: array<vec3f, 4>, f: u32) -> vec3f {
  let a = x[loc(f, 0u)];
  let b = x[loc(f, 1u)];
  let c = x[loc(f, 2u)];
  var n = cross(b - a, c - a);
  n = n / max(length(n), 1e-12);
  if (dot(n, x[f] - a) > 0.0) {
    n = -n;
  }
  return n;
}

// 四面体有限元（新胡克）：节点力、焊接力与面法向应力
@compute @workgroup_size(64)
fn tetForce(@builtin(global_invocation_id) gid: vec3u) {
  let t = gid.x;
  if (t >= P.nTets) {
    return;
  }
  let vi = vec4u(4u * t, 4u * t + 1u, 4u * t + 2u, 4u * t + 3u);
  var x: array<vec3f, 4>;
  for (var k = 0u; k < 4u; k++) {
    x[k] = vpos[vi[k]].xyz;
  }
  let Dinv = tetDinv[t];
  let Ds = mat3x3f(x[1] - x[0], x[2] - x[0], x[3] - x[0]);
  let F = Ds * Dinv;
  let J = determinant(F);
  let Jc = max(J, 1e-3);
  let FiT = mat3x3f(cross(F[1], F[2]), cross(F[2], F[0]), cross(F[0], F[1])) * (1.0 / J);
  let par = tetPar[2u * t];
  let mu = par.y;
  let lam = par.z;
  // 第一类皮奥拉-基尔霍夫应力 P = mu (F - F^-T) + lam ln(J) F^-T
  let Pk = mu * (F - FiT) + lam * log(Jc) * FiT;
  // 粘性阻尼：应变率的对称部分乘以粘度，让振荡逐渐衰减（不计入断裂判据）
  let v0 = vvel[vi[0]].xyz;
  let dFdot = mat3x3f(vvel[vi[1]].xyz - v0, vvel[vi[2]].xyz - v0, vvel[vi[3]].xyz - v0) * Dinv;
  let Ed = 0.5 * (dFdot + transpose(dFdot));
  let eta = tetPar[2u * t + 1u].z;
  // 节点力：f_{j+1} = -V0 * P * Dm^-T 的第 j 列
  let H = par.x * ((Pk + eta * Ed) * transpose(Dinv));
  var fl: array<vec3f, 4>;
  fl[1] = -H[0];
  fl[2] = -H[1];
  fl[3] = -H[2];
  fl[0] = H[0] + H[1] + H[2];

  // 焊接弹簧：只作用在本四面体的顶点上，保证每个顶点只被一个线程写入
  let kw = tetPar[2u * t + 1u].x;
  for (var f = 0u; f < 4u; f++) {
    let e = t * 4u + f;
    if (faceInfo[4u * e] == NONE) {
      continue;
    }
    if (atomicLoad(&faceBroken[e]) != 0u) {
      continue;
    }
    for (var k = 0u; k < 3u; k++) {
      let lk = loc(f, k);
      let own = vi[lk];
      let part = faceInfo[4u * e + 1u + k];
      let mo = vpos[own].w;
      let dx = vpos[part].xyz - vpos[own].xyz;
      let dv = vvel[part].xyz - vvel[own].xyz;
      let cw = P.weldDamp * sqrt(kw * mo);
      fl[lk] = fl[lk] + kw * dx + cw * dv;
    }
  }
  for (var k = 0u; k < 4u; k++) {
    vforce[vi[k]] = vec4f(fl[k], 0.0);
  }

  // 柯西应力 sigma = P F^T / J，取每个面的法向拉应力
  let sigma = (Pk * transpose(F)) * (1.0 / Jc);
  for (var f = 0u; f < 4u; f++) {
    let n = outwardNormal(x, f);
    faceStress[t * 4u + f] = dot(n, sigma * n);
  }
}

// 断裂判据：面上的法向拉应力超过材料结实程度时焊接断开（两侧同时断开）
@compute @workgroup_size(64)
fn faceCrack(@builtin(global_invocation_id) gid: vec3u) {
  let e = gid.x;
  if (e >= P.nTets * 4u) {
    return;
  }
  let nb = faceInfo[4u * e];
  if (nb == NONE) {
    return;
  }
  if (atomicLoad(&faceBroken[e]) != 0u) {
    return;
  }
  // 脆性断裂从自由表面萌生：两侧至少一个四面体位于外壳（与边界面相邻），内部不直接开裂
  let shell = tetPar[2u * (e >> 2u) + 1u].w > 0.5 || tetPar[2u * (nb >> 2u) + 1u].w > 0.5;
  if (!shell) {
    return;
  }
  let s0 = faceStress[e];
  let s1 = faceStress[nb];
  let thr0 = tetPar[2u * (e >> 2u)].w;
  let thr1 = tetPar[2u * (nb >> 2u)].w;
  if (s0 > thr0 || s1 > thr1) {
    atomicStore(&faceBroken[e], 1u);
    atomicStore(&faceBroken[nb], 1u);
    if (e < nb) {
      atomicAdd(&ballAcc[CRACK_IDX], 1);
    }
  }
}

// 顶点积分 + 与台面、地面、刚球的接触
@compute @workgroup_size(64)
fn vertexStep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.nVerts) {
    return;
  }
  let pm = vpos[i];
  let m = pm.w;
  var x = pm.xyz;
  var v = vvel[i].xyz;
  let f = vforce[i].xyz;
  v = (v + (f / m + vec3f(0.0, -P.gravity, 0.0)) * P.dt) * P.damping;
  x = x + v * P.dt;
  let r = P.vrad;

  // 地面
  if (x.y < r) {
    x.y = r;
    v = contactVel(v, vec3f(0.0), vec3f(0.0, 1.0, 0.0), P.restitution, P.friction);
  }

  // 台面（实心长方体）：沿最浅的面推出
  let tmin = P.tmin.xyz;
  let tmax = P.tmax.xyz;
  if (x.x > tmin.x - r && x.x < tmax.x + r && x.z > tmin.z - r && x.z < tmax.z + r && x.y > tmin.y - r && x.y < tmax.y + r) {
    let pxp = tmax.x + r - x.x;
    let pxm = x.x - (tmin.x - r);
    let pzp = tmax.z + r - x.z;
    let pzm = x.z - (tmin.z - r);
    let pyp = tmax.y + r - x.y;
    var best = pyp;
    var n = vec3f(0.0, 1.0, 0.0);
    if (pxp < best) { best = pxp; n = vec3f(1.0, 0.0, 0.0); }
    if (pxm < best) { best = pxm; n = vec3f(-1.0, 0.0, 0.0); }
    if (pzp < best) { best = pzp; n = vec3f(0.0, 0.0, 1.0); }
    if (pzm < best) { best = pzm; n = vec3f(0.0, 0.0, -1.0); }
    x = x + n * best;
    v = contactVel(v, vec3f(0.0), n, P.restitution, P.friction);
  }

  // 刚球
  for (var b = 0u; b < P.nBalls; b++) {
    let bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let rb = bs.pos.w;
    let c = bs.pos.xyz;
    let dv = x - c;
    let dist = length(dv);
    let R = rb + r;
    if (dist < R && dist > 1e-6) {
      let n = dv / dist;
      x = c + n * R;
      let vs = bs.vel.xyz + cross(bs.omega.xyz, n * rb);
      let vnew = contactVel(v, vs, n, P.restitution, P.friction);
      let dvx = vnew - v;
      v = vnew;
      addBallImpulse(b, -m * dvx, n * rb);
    }
  }

  vpos[i] = vec4f(x, m);
  vvel[i] = vec4f(v, 0.0);
}

struct Dyn {
  v: vec3f,
  w: vec3f,
};

// 刚体与静态表面接触（带旋转的冲量 + 库仑摩擦）
fn staticContact(d: Dyn, n: vec3f, ra: vec3f, m: f32, inertia: f32, e: f32, mu: f32) -> Dyn {
  var o = d;
  let vc = o.v + cross(o.w, ra);
  let vn = dot(vc, n);
  if (vn >= 0.0) {
    return o;
  }
  let rxn = cross(ra, n);
  let kN = 1.0 / m + dot(rxn, rxn) / inertia;
  let jn = -(1.0 + e) * vn / kN;
  let dpn = n * jn;
  o.v = o.v + dpn / m;
  o.w = o.w + cross(ra, dpn) / inertia;
  let vc2 = o.v + cross(o.w, ra);
  let vt = vc2 - dot(vc2, n) * n;
  let vtl = length(vt);
  if (vtl > 1e-6) {
    let t = vt / vtl;
    let rxt = cross(ra, t);
    let kT = 1.0 / m + dot(rxt, rxt) / inertia;
    let jt = min(vtl / kT, mu * jn);
    let dpt = -t * jt;
    o.v = o.v + dpt / m;
    o.w = o.w + cross(ra, dpt) / inertia;
  }
  return o;
}

// 滚动阻力：接触时水平速度与自旋逐渐衰减
fn rollingLoss(d: Dyn, dt: f32) -> Dyn {
  var o = d;
  let sp = length(o.v.xz);
  if (sp > 1e-6) {
    let dec = min(sp, 0.12 * P.gravity * dt);
    o.v = vec3f(o.v.x - o.v.x / sp * dec, o.v.y, o.v.z - o.v.z / sp * dec);
  }
  o.w = o.w * (1.0 - 1.2 * dt);
  return o;
}

// 刚球积分（单线程）：吸收接触冲量、重力、地面与台面、球与球
@compute @workgroup_size(1)
fn ballStep() {
  let dt = P.dt;
  let tmin = P.tmin.xyz;
  let tmax = P.tmax.xyz;
  for (var b = 0u; b < P.nBalls; b++) {
    let base = b * 6u;
    let imp = vec3f(f32(atomicLoad(&ballAcc[base])), f32(atomicLoad(&ballAcc[base + 1u])), f32(atomicLoad(&ballAcc[base + 2u]))) / FP;
    let tq = vec3f(f32(atomicLoad(&ballAcc[base + 3u])), f32(atomicLoad(&ballAcc[base + 4u])), f32(atomicLoad(&ballAcc[base + 5u]))) / FP;
    for (var k = 0u; k < 6u; k++) {
      atomicStore(&ballAcc[base + k], 0);
    }
    var bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let m = bs.vel.w;
    let r = bs.pos.w;
    let I = 0.4 * m * r * r;
    var v = bs.vel.xyz + imp / m;
    var w = bs.omega.xyz + tq / I;
    v.y = v.y - P.gravity * dt;
    var pos = bs.pos.xyz + v * dt;
    var dyn = Dyn(v, w);
    bs.info = vec4f(bs.info.x + length(imp), 0.0, 0.0, 0.0);

    // 地面
    let dfl = r - pos.y;
    if (dfl > 0.0) {
      pos.y = pos.y + dfl;
      dyn = staticContact(dyn, vec3f(0.0, 1.0, 0.0), vec3f(0.0, -r, 0.0), m, I, P.ballRest, P.friction);
      dyn = rollingLoss(dyn, dt);
    }
    // 台面（长方体）
    let cp = clamp(pos, tmin, tmax);
    let dd = pos - cp;
    let dist = length(dd);
    if (dist < r) {
      var n = vec3f(0.0, 1.0, 0.0);
      if (dist > 1e-5) {
        n = dd / dist;
        pos = pos + n * (r - dist);
      } else {
        pos.y = tmax.y + r;
      }
      dyn = staticContact(dyn, n, -n * r, m, I, P.ballRest, P.friction);
      dyn = rollingLoss(dyn, dt);
    }
    // 空气阻力与自旋阻尼
    dyn.v = dyn.v * (1.0 - 0.05 * dt);
    dyn.w = dyn.w * (1.0 - 0.4 * dt);
    bs.pos = vec4f(pos, r);
    bs.vel = vec4f(dyn.v, m);
    bs.omega = vec4f(dyn.w, bs.omega.w);
    balls[b] = bs;
  }

  // 球与球（按质量分配位置修正，法向冲量）
  for (var a = 0u; a < P.nBalls; a++) {
    for (var o = a + 1u; o < P.nBalls; o++) {
      var A = balls[a];
      var B = balls[o];
      if (A.omega.w < 0.5 || B.omega.w < 0.5) {
        continue;
      }
      let d = A.pos.xyz - B.pos.xyz;
      let dist = length(d);
      let R = A.pos.w + B.pos.w;
      if (dist < R && dist > 1e-6) {
        let n = d / dist;
        let depth = R - dist;
        let wa = 1.0 / A.vel.w;
        let wb = 1.0 / B.vel.w;
        let tot = wa + wb;
        A.pos = vec4f(A.pos.xyz + n * depth * (wa / tot), A.pos.w);
        B.pos = vec4f(B.pos.xyz - n * depth * (wb / tot), B.pos.w);
        let vn = dot(A.vel.xyz - B.vel.xyz, n);
        if (vn < 0.0) {
          let jn = -(1.0 + 0.5) * vn / tot;
          A.vel = vec4f(A.vel.xyz + n * jn * wa, A.vel.w);
          B.vel = vec4f(B.vel.xyz - n * jn * wb, B.vel.w);
          A.info = vec4f(A.info.x + jn, 0.0, 0.0, 0.0);
          B.info = vec4f(B.info.x + jn, 0.0, 0.0, 0.0);
        }
        balls[a] = A;
        balls[o] = B;
      }
    }
  }

  // 旋转积分
  for (var b = 0u; b < P.nBalls; b++) {
    var bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let w = bs.omega.xyz;
    let q = bs.quat;
    let dq = 0.5 * vec4f(q.w * w + cross(w, q.xyz), -dot(w, q.xyz));
    var qn = q + dq * dt;
    qn = qn / max(length(qn), 1e-9);
    bs.quat = qn;
    balls[b] = bs;
  }
}

// 每个面的可见性（断裂后的面才显示），并累加节点法向
@compute @workgroup_size(64)
fn nrmAccum(@builtin(global_invocation_id) gid: vec3u) {
  let t = gid.x;
  if (t >= P.nTets) {
    return;
  }
  let vi = vec4u(4u * t, 4u * t + 1u, 4u * t + 2u, 4u * t + 3u);
  var x: array<vec3f, 4>;
  for (var k = 0u; k < 4u; k++) {
    x[k] = vpos[vi[k]].xyz;
  }
  for (var f = 0u; f < 4u; f++) {
    let e = t * 4u + f;
    let vis = faceInfo[4u * e] == NONE || atomicLoad(&faceBroken[e]) != 0u;
    faceVis[e] = select(0u, 1u, vis);
    if (!vis) {
      continue;
    }
    let n = outwardNormal(x, f);
    let s = n * 1048576.0;
    for (var k = 0u; k < 3u; k++) {
      let node = vnode[vi[loc(f, k)]];
      atomicAdd(&nodeAcc[node * 3u + 0u], i32(round(s.x)));
      atomicAdd(&nodeAcc[node * 3u + 1u], i32(round(s.y)));
      atomicAdd(&nodeAcc[node * 3u + 2u], i32(round(s.z)));
    }
  }
}

// 归一化节点法向，并清零累加器，供下一次渲染使用
@compute @workgroup_size(64)
fn nrmFinal(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.nNodes) {
    return;
  }
  let s = vec3f(f32(atomicLoad(&nodeAcc[i * 3u])), f32(atomicLoad(&nodeAcc[i * 3u + 1u])), f32(atomicLoad(&nodeAcc[i * 3u + 2u]))) / 1048576.0;
  atomicStore(&nodeAcc[i * 3u], 0);
  atomicStore(&nodeAcc[i * 3u + 1u], 0);
  atomicStore(&nodeAcc[i * 3u + 2u], 0);
  var nn = vec3f(0.0, 1.0, 0.0);
  if (length(s) > 1e-6) {
    nn = normalize(s);
  }
  nodeNrm[i] = vec4f(nn, 0.0);
}
`,

  // 渲染：果冻（只画可见面）、刚球（实例化）、静态长方体（台面、地面）
  render: /* wgsl */ `
struct Cam {
  viewProj: mat4x4f,
  view: mat4x4f,
  lightVP: mat4x4f,
  eye: vec4f,
  lightDir: vec4f,
  screen: vec4f,
  misc: vec4f,
};

@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<storage, read> vpos: array<vec4f>;
@group(0) @binding(2) var<storage, read> vnode: array<u32>;
@group(0) @binding(3) var<storage, read> faceVis: array<u32>;
@group(0) @binding(4) var<storage, read> nodeNrm: array<vec4f>;
@group(0) @binding(5) var<storage, read> tetMat: array<u32>;
@group(0) @binding(6) var<storage, read> balls: array<Ball>;
@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSamp: sampler_comparison;

fn envColor(R: vec3f) -> vec3f {
  let t = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  let sky = mix(vec3f(0.05, 0.05, 0.06), vec3f(0.42, 0.45, 0.52), t);
  let L = normalize(cam.lightDir.xyz);
  let sun = pow(max(dot(R, L), 0.0), 90.0) * 5.0;
  let box = smoothstep(0.55, 0.9, dot(R, normalize(vec3f(-0.6, 0.5, 0.7)))) * 0.9;
  return sky + vec3f(1.0, 0.97, 0.92) * (sun + box);
}

// 阴影：3x3 百分比渐进过滤（在非均匀控制流中也可用的 Level 版本）
fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  let lp = cam.lightVP * vec4f(wp + n * 0.003, 1.0);
  let ndc = lp.xyz / lp.w;
  if (abs(ndc.x) > 1.0 || abs(ndc.y) > 1.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let d = ndc.z - 0.0008;
  var s = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      s = s + textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2f(f32(i), f32(j)) / 2048.0, d);
    }
  }
  return s / 9.0;
}

fn hash3(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash3(i);
  let b = hash3(i + vec3f(1.0, 0.0, 0.0));
  let c = hash3(i + vec3f(0.0, 1.0, 0.0));
  let d = hash3(i + vec3f(1.0, 1.0, 0.0));
  let e = hash3(i + vec3f(0.0, 0.0, 1.0));
  let g = hash3(i + vec3f(1.0, 0.0, 1.0));
  let h = hash3(i + vec3f(0.0, 1.0, 1.0));
  let k = hash3(i + vec3f(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

// ---- 果冻 ----
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) nn: vec3f,
  @location(2) @interpolate(flat) mat: u32,
  @location(3) @interpolate(flat) gn: vec3f,
};

@vertex fn vsJelly(@builtin(vertex_index) vi: u32) -> VOut {
  let t = vi / 12u;
  let rem = vi % 12u;
  let f = rem / 3u;
  let c = rem % 3u;
  let e = t * 4u + f;
  var o: VOut;
  if (faceVis[e] == 0u) {
    o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    return o;
  }
  let g = 4u * t + loc(f, c);
  let p = vpos[g].xyz;
  o.wp = p;
  o.nn = nodeNrm[vnode[g]].xyz;
  o.pos = cam.viewProj * vec4f(p, 1.0);
  o.mat = tetMat[t];
  // 本面的几何外法向（用于区分正面与缝隙中看到的内壁）
  let a = vpos[4u * t + loc(f, 0u)].xyz;
  let b = vpos[4u * t + loc(f, 1u)].xyz;
  let cc = vpos[4u * t + loc(f, 2u)].xyz;
  var gn = normalize(cross(b - a, cc - a));
  if (dot(gn, vpos[4u * t + f].xyz - a) > 0.0) {
    gn = -gn;
  }
  o.gn = gn;
  return o;
}

@fragment fn fsJelly(i: VOut) -> @location(0) vec4f {
  var N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  var base = vec3f(0.85, 0.12, 0.16);
  if (i.mat == 1u) {
    base = vec3f(0.22, 0.78, 0.5);
  } else if (i.mat == 2u) {
    base = vec3f(0.98, 0.72, 0.18);
  }
  // 缝隙中看到的内壁：按透光的果冻色着色，避免出现暗线
  if (dot(i.gn, V) < 0.0) {
    let thin = 0.55 + 0.35 * abs(dot(N, V));
    return vec4f(base * thin * 0.85 + base * base * 0.15, 1.0);
  }
  if (dot(N, V) < 0.0) {
    N = -N;
  }
  let L = normalize(cam.lightDir.xyz);
  let sh = shadowAt(i.wp, N);
  let ndl = dot(N, L);
  let diff = max(ndl, 0.0);
  // 半透明近似：包裹光（光穿透果冻的部分）与内部发光
  let wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);
  let sss = pow(wrap, 2.0) * (1.0 - diff) * 0.35;
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), 120.0) * 1.2 * sh;
  let ndv = max(dot(N, V), 0.0);
  let fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  let amb = 0.28 + 0.2 * N.y;
  var col = base * (amb * 0.8 + diff * sh * 0.95 + sss * sh);
  col = col + base * base * sss * 0.6;
  col = col + spec * vec3f(1.0, 0.97, 0.92);
  col = mix(col, envColor(reflect(-V, N)) * 0.8, fres * 0.6);
  // 边缘的透光感
  let rim = pow(1.0 - ndv, 2.5) * 0.25;
  col = col + base * rim * (0.5 + 0.5 * sh);
  return vec4f(col, 1.0);
}

// ---- 刚球（实例化，每个球一个实例）----
struct BOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) nn: vec3f,
  @location(2) lp: vec3f,
  @location(3) @interpolate(flat) mat: f32,
  @location(4) @interpolate(flat) col: vec3f,
};

@vertex fn vsBall(@location(0) lp: vec3f, @builtin(instance_index) ii: u32) -> BOut {
  let b = balls[ii];
  let r = b.pos.w;
  let ln = normalize(lp);
  let wp = b.pos.xyz + qrot(b.quat, ln) * r;
  var o: BOut;
  o.wp = wp;
  o.nn = qrot(b.quat, ln);
  o.lp = ln;
  o.mat = b.color.w;
  o.col = b.color.rgb;
  o.pos = cam.viewProj * vec4f(wp, 1.0);
  return o;
}

@fragment fn fsBall(i: BOut) -> @location(0) vec4f {
  let N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  let L = normalize(cam.lightDir.xyz);
  let sh = shadowAt(i.wp, N);
  let ndv = max(dot(N, V), 0.0);
  var col: vec3f;
  if (i.mat < 0.5) {
    // 金属：强反射，颜色由反射环境决定
    let F0 = i.col;
    let fres = F0 + (vec3f(1.0) - F0) * pow(1.0 - ndv, 5.0);
    let refl = envColor(reflect(-V, N));
    col = fres * refl * (0.9 + 0.1 * sh) + F0 * 0.06 * max(dot(N, L), 0.0) * sh;
  } else {
    // 石质：粗糙表面，细小的斑点纹理（随球一起转动）
    let n3 = vnoise(i.lp * 18.0) * 0.6 + vnoise(i.lp * 53.0) * 0.4;
    let base = i.col * (0.78 + 0.34 * n3);
    let diff = max(dot(N, L), 0.0) * sh;
    let amb = 0.3 + 0.25 * N.y;
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), 18.0) * 0.12 * sh;
    col = base * (amb * 0.7 + diff * 0.95) + vec3f(spec);
  }
  return vec4f(col, 1.0);
}

// ---- 静态长方体（台面、地面）----
struct SOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) nn: vec3f,
  @location(2) col: vec3f,
};

@vertex fn vsStatic(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec3f) -> SOut {
  var o: SOut;
  o.wp = p;
  o.nn = n;
  o.col = c;
  o.pos = cam.viewProj * vec4f(p, 1.0);
  return o;
}

@fragment fn fsStatic(i: SOut) -> @location(0) vec4f {
  let N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  let L = normalize(cam.lightDir.xyz);
  let sh = shadowAt(i.wp, N);
  let diff = max(dot(N, L), 0.0) * sh;
  let amb = 0.32 + 0.2 * N.y;
  var col = i.col * (amb + diff * 0.9);
  let H = normalize(L + V);
  col = col + vec3f(pow(max(dot(N, H), 0.0), 40.0) * 0.08 * sh);
  // 远处的雾，让地面与背景融合
  let dist = length(cam.eye.xyz - i.wp);
  let fog = 1.0 - exp(-dist * 0.05);
  col = mix(col, vec3f(0.035, 0.036, 0.042), clamp(fog, 0.0, 1.0));
  return vec4f(col, 1.0);
}
`,
};
