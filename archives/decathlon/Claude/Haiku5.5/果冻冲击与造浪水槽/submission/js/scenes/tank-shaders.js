// 场景二：造浪水槽的 WGSL 代码。
// 水体：MLS-MPM（APIC）在计算着色器上求解；网格质量与动量用定点整数原子累加，结果与线程顺序无关。
// 球：刚性球以动量交换与网格耦合（球内节点取球速，并把动量变化记为球的冲量）。
// 画面：粒子→屏幕空间液面（深度+厚度，双边模糊，折射与菲涅尔），玻璃与背景另行绘制。
const TankWGSL = {
  common: /* wgsl */ `
struct TP {
  a: vec4f,  // dt, h, invH, gravity
  b: vec4f,  // K（体积模量）, mP（粒子质量）, V0（粒子体积）, damping
  c: vec4u,  // NX, NY, NZ, nParticles
  d: vec4f,  // LX, LY, LZ, WH（水面高度）
  e: vec4f,  // paddleX（造浪板前沿）, paddleV, paddleH, waveOn
  f: vec4f,  // rampX0, 0, rampMaxH, 0（远端斜坡）
  g: vec4f,  // barX0, barX1, barH, ballR（水下礁石）
  h: vec4u,  // nBalls, 0, 0, 0
};

struct Particle {
  pos: vec4f,  // xyz 位置, w 体积比 J
  vel: vec4f,
  c0: vec4f,   // APIC 仿射矩阵的三列
  c1: vec4f,
  c2: vec4f,
};

struct Ball {
  pos: vec4f,    // xyz 球心, w 半径
  vel: vec4f,    // xyz 速度, w 质量
  omega: vec4f,  // xyz 角速度, w 是否激活
  quat: vec4f,
  info: vec4f,   // x 累计冲量大小
  color: vec4f,  // rgb 颜色, w 材质 0金属 1石质 2塑料
};

fn terrainH(x: f32, z: f32, tp: TP) -> f32 {
  let rx = clamp((x - tp.f.x) / max(tp.d.x - tp.f.x, 1e-4), 0.0, 1.0);
  var hgt = rx * tp.f.z;
  if (x > tp.g.x && x < tp.g.y) {
    hgt = max(hgt, tp.g.z);
  }
  return hgt;
}

fn nodeIndex(i: u32, j: u32, k: u32, tp: TP) -> u32 {
  return i + (tp.c.x + 1u) * (j + (tp.c.y + 1u) * k);
}
`,

  sim: /* wgsl */ `
@group(0) @binding(0) var<uniform> T: TP;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(2) var<storage, read_write> gridAcc: array<atomic<i32>>;   // 每节点 4 个：动量xyz, 质量
@group(0) @binding(3) var<storage, read_write> gridV: array<vec4f>;           // xyz 速度, w 质量
@group(0) @binding(4) var<storage, read_write> balls: array<Ball>;
@group(0) @binding(5) var<storage, read_write> ballAcc: array<atomic<i32>>;   // 每球 6 个：冲量xyz, 力矩xyz

const SF: f32 = 16777216.0;   // 网格定点比例
const FPB: f32 = 1048576.0;   // 球冲量定点比例

struct Dyn {
  v: vec3f,
  w: vec3f,
};

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

// 粒子到网格的权重（二次 B 样条）
fn bspline(fx: vec3f) -> array<vec3f, 3> {
  let w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
  let w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
  let w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
  return array<vec3f, 3>(w0, w1, w2);
}

@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3u) {
  let p = gid.x;
  if (p >= T.c.w) {
    return;
  }
  let pa = parts[p];
  let inv = T.a.z;
  let h = T.a.y;
  let xs = pa.pos.xyz * inv;
  let base = vec3u(vec3i(floor(xs - vec3f(0.5))));
  let fx = xs - vec3f(base);
  let W = bspline(fx);
  let J = pa.pos.w;
  // 压力：tau = K J (J-1)，仿射项 -dt V0 4/h^2 tau
  let affS = -T.a.x * T.b.z * 4.0 * inv * inv * (T.b.x * J * (J - 1.0));
  let mP = T.b.y;
  let v = pa.vel.xyz;
  for (var i = 0u; i < 3u; i++) {
    for (var j = 0u; j < 3u; j++) {
      for (var k = 0u; k < 3u; k++) {
        let wgt = W[i].x * W[j].y * W[k].z;
        let dpos = (vec3f(f32(i), f32(j), f32(k)) - fx) * h;
        let mv = mP * (v + pa.c0.xyz * dpos.x + pa.c1.xyz * dpos.y + pa.c2.xyz * dpos.z) + affS * dpos;
        let idx = nodeIndex(base.x + i, base.y + j, base.z + k, T);
        let q = mv * wgt * SF;
        atomicAdd(&gridAcc[idx * 4u + 0u], i32(round(q.x)));
        atomicAdd(&gridAcc[idx * 4u + 1u], i32(round(q.y)));
        atomicAdd(&gridAcc[idx * 4u + 2u], i32(round(q.z)));
        atomicAdd(&gridAcc[idx * 4u + 3u], i32(round(wgt * mP * SF)));
      }
    }
  }
}

// 网格更新：除以质量得速度，加重力，处理墙、地形、造浪板与球（动量交换），并清零累加器
@compute @workgroup_size(64)
fn gridUpdate(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  let nNodes = (T.c.x + 1u) * (T.c.y + 1u) * (T.c.z + 1u);
  if (idx >= nNodes) {
    return;
  }
  let sx = T.c.x + 1u;
  let sy = T.c.y + 1u;
  let i = idx % sx;
  let j = (idx / sx) % sy;
  let k = idx / (sx * sy);
  let m = f32(atomicLoad(&gridAcc[idx * 4u + 3u])) / SF;
  let mom = vec3f(f32(atomicLoad(&gridAcc[idx * 4u])), f32(atomicLoad(&gridAcc[idx * 4u + 1u])), f32(atomicLoad(&gridAcc[idx * 4u + 2u]))) / SF;
  for (var q = 0u; q < 4u; q++) {
    atomicStore(&gridAcc[idx * 4u + q], 0);
  }
  if (m < 1e-10) {
    gridV[idx] = vec4f(0.0);
    return;
  }
  let h = T.a.y;
  let x = vec3f(f32(i), f32(j), f32(k)) * h;
  var v = mom / m;
  v.y = v.y - T.a.w * T.a.x;
  // 容器墙（自由滑移）：固壁层与粒子夹持范围一致（两层节点），避免边界处水被挤压下沉
  if (i <= 1u && v.x < 0.0) { v.x = 0.0; }
  if (i + 2u >= T.c.x && v.x > 0.0) { v.x = 0.0; }
  if (j <= 1u && v.y < 0.0) { v.y = 0.0; }
  if (k <= 1u && v.z < 0.0) { v.z = 0.0; }
  if (k + 2u >= T.c.z && v.z > 0.0) { v.z = 0.0; }
  // 地形（礁石与斜坡）：实体内及其上一层静止
  if (x.y <= terrainH(x.x, x.z, T) + h) {
    v = vec3f(0.0);
  }
  // 造浪板：x < paddleX 的区域为实体，以造浪板速度运动
  if (x.x <= T.e.x && x.y <= T.e.z) {
    v = vec3f(T.e.y, 0.0, 0.0);
  }
  // 球：球内节点取球速，并把动量变化记为球的冲量
  for (var b = 0u; b < T.h.x; b++) {
    let bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let R = bs.pos.w;
    let dv = x - bs.pos.xyz;
    let dist = length(dv);
    if (dist < R + 0.5 * h) {
      // 半松弛的黏附边界：节点速度只向球速靠近 35%，避免轻球（节点内水量超过球质量）显式耦合发散
      let vb = bs.vel.xyz + cross(bs.omega.xyz, dv);
      let dp = 0.35 * m * (vb - v);
      v = v + 0.35 * (vb - v);
      let imp = -dp * FPB;
      let tq = -cross(dv, dp) * FPB;
      let base = b * 6u;
      atomicAdd(&ballAcc[base + 0u], i32(round(imp.x)));
      atomicAdd(&ballAcc[base + 1u], i32(round(imp.y)));
      atomicAdd(&ballAcc[base + 2u], i32(round(imp.z)));
      atomicAdd(&ballAcc[base + 3u], i32(round(tq.x)));
      atomicAdd(&ballAcc[base + 4u], i32(round(tq.y)));
      atomicAdd(&ballAcc[base + 5u], i32(round(tq.z)));
    }
  }
  gridV[idx] = vec4f(v, m);
}

// 刚球积分（单线程）：冲量、重力、容器与地形、球与球
@compute @workgroup_size(1)
fn ballStep() {
  let dt = T.a.x;
  let g = T.a.w;
  let LX = T.d.x; let LY = T.d.y; let LZ = T.d.z;
  for (var b = 0u; b < T.h.x; b++) {
    let base = b * 6u;
    let imp = vec3f(f32(atomicLoad(&ballAcc[base])), f32(atomicLoad(&ballAcc[base + 1u])), f32(atomicLoad(&ballAcc[base + 2u]))) / FPB;
    let tq = vec3f(f32(atomicLoad(&ballAcc[base + 3u])), f32(atomicLoad(&ballAcc[base + 4u])), f32(atomicLoad(&ballAcc[base + 5u]))) / FPB;
    for (var q = 0u; q < 6u; q++) {
      atomicStore(&ballAcc[base + q], 0);
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
    v.y = v.y - g * dt;
    // 浮力：按浸没比例计算（球心以下的水深近似为水面高度 WH）。平衡时浸没比例 = 密度比。
    let volB = 4.18879 * r * r * r;
    let dens = m / (1000.0 * volB);
    let sub = clamp((T.d.w - (bs.pos.y - r)) / (2.0 * r), 0.0, 1.0);
    v.y = v.y + g * dt * sub / dens;
    // 速度安全上限（数值保护）
    let sp = length(v);
    if (sp > 4.0) { v = v * (4.0 / sp); }
    let wl = length(w);
    if (wl > 60.0) { w = w * (60.0 / wl); }
    // 浮力与阻力已由网格动量交换给出，这里只加轻微的空气阻尼
    v = v * (1.0 - 0.02 * dt);
    w = w * (1.0 - 0.3 * dt);
    var pos = bs.pos.xyz + v * dt;
    var dyn = Dyn(v, w);
    bs.info = vec4f(bs.info.x + length(imp), 0.0, 0.0, 0.0);
    // 容器壁与底
    if (pos.x - r < 0.0) { pos.x = r; dyn = staticContact(dyn, vec3f(1.0, 0.0, 0.0), vec3f(-r, 0.0, 0.0), m, I, 0.35, 0.3); }
    if (pos.x + r > LX) { pos.x = LX - r; dyn = staticContact(dyn, vec3f(-1.0, 0.0, 0.0), vec3f(r, 0.0, 0.0), m, I, 0.35, 0.3); }
    if (pos.z - r < 0.0) { pos.z = r; dyn = staticContact(dyn, vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -r), m, I, 0.35, 0.3); }
    if (pos.z + r > LZ) { pos.z = LZ - r; dyn = staticContact(dyn, vec3f(0.0, 0.0, -1.0), vec3f(0.0, 0.0, r), m, I, 0.35, 0.3); }
    if (pos.y - r < 0.0) { pos.y = r; dyn = staticContact(dyn, vec3f(0.0, 1.0, 0.0), vec3f(0.0, -r, 0.0), m, I, 0.35, 0.4); }
    // 地形（取高度场的近似法向）
    let hgt = terrainH(pos.x, pos.z, T);
    if (pos.y - r < hgt) {
      let e = 0.01;
      let gx = terrainH(pos.x + e, pos.z, T) - terrainH(pos.x - e, pos.z, T);
      var n = normalize(vec3f(-gx / (2.0 * e), 1.0, 0.0));
      if (abs(gx) < 1e-6) { n = vec3f(0.0, 1.0, 0.0); }
      let depth = hgt + r - pos.y;
      pos = pos + n * (depth / max(n.y, 0.3));
      dyn = staticContact(dyn, n, -n * r, m, I, 0.35, 0.4);
    }
    bs.pos = vec4f(pos, r);
    bs.vel = vec4f(dyn.v, m);
    bs.omega = vec4f(dyn.w, bs.omega.w);
    balls[b] = bs;
  }
  // 球与球
  for (var a = 0u; a < T.h.x; a++) {
    for (var o = a + 1u; o < T.h.x; o++) {
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
          let jn = -1.4 * vn / tot;
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
  // 旋转
  for (var b = 0u; b < T.h.x; b++) {
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

// G2P：粒子速度与仿射矩阵，推进位置，处理墙、地形、造浪板与球的边界
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3u) {
  let p = gid.x;
  if (p >= T.c.w) {
    return;
  }
  let inv = T.a.z;
  let h = T.a.y;
  let dt = T.a.x;
  var pa = parts[p];
  let xs = pa.pos.xyz * inv;
  let base = vec3u(vec3i(floor(xs - vec3f(0.5))));
  let fx = xs - vec3f(base);
  let W = bspline(fx);
  var v = vec3f(0.0);
  var C0 = vec3f(0.0);
  var C1 = vec3f(0.0);
  var C2 = vec3f(0.0);
  for (var i = 0u; i < 3u; i++) {
    for (var j = 0u; j < 3u; j++) {
      for (var k = 0u; k < 3u; k++) {
        let wgt = W[i].x * W[j].y * W[k].z;
        let dpos = (vec3f(f32(i), f32(j), f32(k)) - fx) * h;
        let idx = nodeIndex(base.x + i, base.y + j, base.z + k, T);
        let gv = gridV[idx].xyz;
        v = v + wgt * gv;
        let wv = wgt * gv;
        C0 = C0 + wv * dpos.x;
        C1 = C1 + wv * dpos.y;
        C2 = C2 + wv * dpos.z;
      }
    }
  }
  let s4 = 4.0 * inv * inv;
  C0 = C0 * s4;
  C1 = C1 * s4;
  C2 = C2 * s4;
  let trC = C0.x + C1.y + C2.z;
  var J = pa.pos.w * (1.0 + dt * trC);
  J = clamp(J, 0.6, 1.4);
  v = v * (1.0 - T.b.w * dt);
  var x = pa.pos.xyz + dt * v;

  // 容器边界
  let LX = T.d.x; let LY = T.d.y; let LZ = T.d.z;
  let lo = 1.2 * h;
  if (x.x < lo) { x.x = lo; v.x = max(v.x, 0.0); }
  if (x.x > LX - lo) { x.x = LX - lo; v.x = min(v.x, 0.0); }
  if (x.z < lo) { x.z = lo; v.z = max(v.z, 0.0); }
  if (x.z > LZ - lo) { x.z = LZ - lo; v.z = min(v.z, 0.0); }
  if (x.y > LY - lo) { x.y = LY - lo; v.y = min(v.y, 0.0); }
  // 地形
  let hgt = terrainH(x.x, x.z, T);
  if (x.y < hgt + lo) { x.y = hgt + lo; v.y = max(v.y, 0.0); }
  // 造浪板
  if (x.x < T.e.x + lo) { x.x = T.e.x + lo; v.x = max(v.x, T.e.y); }
  // 球：粒子不能进入球内
  for (var b = 0u; b < T.h.x; b++) {
    let bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let R = bs.pos.w + 0.4 * h;
    let d = x - bs.pos.xyz;
    let dist = length(d);
    if (dist < R && dist > 1e-6) {
      let n = d / dist;
      x = bs.pos.xyz + n * R;
      let vb = bs.vel.xyz + cross(bs.omega.xyz, n * bs.pos.w);
      let vr = v - vb;
      let vn = dot(vr, n);
      if (vn < 0.0) {
        v = v - vn * n;
      }
    }
  }
  pa.pos = vec4f(x, J);
  pa.vel = vec4f(v, 0.0);
  pa.c0 = vec4f(C0, 0.0);
  pa.c1 = vec4f(C1, 0.0);
  pa.c2 = vec4f(C2, 0.0);
  parts[p] = pa;
}
`,

  // 渲染：粒子液面、背景、静态物体、球、玻璃
  render: /* wgsl */ `
struct Cam {
  viewProj: mat4x4f,
  view: mat4x4f,
  proj: mat4x4f,
  lightVP: mat4x4f,
  eye: vec4f,
  lightDir: vec4f,
  screen: vec4f,
  misc: vec4f,
};

@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<uniform> T: TP;
@group(0) @binding(2) var<storage, read> parts: array<Particle>;
@group(0) @binding(3) var<storage, read> balls: array<Ball>;

fn envColor(R: vec3f) -> vec3f {
  let t = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  let sky = mix(vec3f(0.04, 0.045, 0.05), vec3f(0.36, 0.42, 0.5), t);
  let L = normalize(cam.lightDir.xyz);
  let sun = pow(max(dot(R, L), 0.0), 80.0) * 4.5;
  let win = smoothstep(0.5, 0.95, dot(R, normalize(vec3f(-0.5, 0.45, 0.75)))) * 0.8;
  return sky + vec3f(1.0, 0.97, 0.92) * (sun + win);
}

// ---- 粒子液面：球面公告板，写入深度与厚度 ----
struct WOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) cv: vec3f,   // 视空间球心
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) spd: f32,    // 粒子速度（白水用）
};

const PR: f32 = 0.0092;   // 粒子渲染半径（米）

@vertex fn vsWater(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> WOut {
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let p = parts[ii].pos.xyz;
  let cv = (cam.view * vec4f(p, 1.0)).xyz;
  var o: WOut;
  o.cv = cv;
  o.uv = c;
  o.spd = length(parts[ii].vel.xyz);
  let vpos = cv + vec3f(c * PR, 0.0);
  o.pos = cam.proj * vec4f(vpos, 1.0);
  return o;
}

struct WFrag {
  @builtin(frag_depth) depth: f32,
  @location(0) dist: f32,
  @location(1) thick: f32,
  @location(2) foam: f32,
};

@fragment fn fsWater(i: WOut) -> WFrag {
  let d2 = dot(i.uv, i.uv);
  if (d2 > 1.0) {
    discard;
  }
  let hz = sqrt(1.0 - d2);
  let zs = i.cv.z + hz * PR;   // 视空间中最靠近相机的表面点
  var o: WFrag;
  let clip = cam.proj * vec4f(i.cv.x, i.cv.y, zs, 1.0);
  o.depth = clip.z / clip.w;
  o.dist = -zs;
  o.thick = 2.0 * PR * hz;
  // 白水：速度较大的粒子（破碎、飞溅处）产生泡沫
  o.foam = clamp((i.spd - 0.55) / 1.0, 0.0, 1.0) * hz;
  return o;
}

// ---- 双边模糊（水面深度）----
@group(2) @binding(0) var blurSrc: texture_2d<f32>;
struct BOutFull {
  @builtin(position) pos: vec4f,
};
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(i & 2u) * 2.0 - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}

fn blurPass(coord: vec2i, dir: vec2i) -> f32 {
  let dims = vec2i(textureDimensions(blurSrc));
  let c0 = textureLoad(blurSrc, coord, 0).r;
  if (c0 <= 0.0) {
    return 0.0;
  }
  var acc = 0.0;
  var wsum = 0.0;
  for (var k = -6; k <= 6; k++) {
    let q = clamp(coord + dir * k, vec2i(0), dims - vec2i(1));
    let d = textureLoad(blurSrc, q, 0).r;
    if (d <= 0.0) {
      continue;
    }
    let sp = exp(-f32(k * k) / 20.0);
    let rd = (d - c0) / 0.012;
    let w = sp * exp(-rd * rd);
    acc = acc + w * d;
    wsum = wsum + w;
  }
  if (wsum <= 0.0) {
    return c0;
  }
  return acc / wsum;
}

@fragment fn fsBlurH(@builtin(position) fc: vec4f) -> @location(0) f32 {
  return blurPass(vec2i(fc.xy), vec2i(1, 0));
}
@fragment fn fsBlurV(@builtin(position) fc: vec4f) -> @location(0) f32 {
  return blurPass(vec2i(fc.xy), vec2i(0, 1));
}

// ---- 合成：背景/实体 + 水体（折射、吸收、菲涅尔、高光）----
@group(1) @binding(0) var sceneCol: texture_2d<f32>;
@group(1) @binding(1) var sceneDep: texture_2d<f32>;
@group(1) @binding(2) var waterDep: texture_2d<f32>;
@group(1) @binding(3) var waterThk: texture_2d<f32>;
@group(1) @binding(4) var foamTex: texture_2d<f32>;

fn viewRay(uv: vec2f) -> vec3f {
  let aspect = cam.screen.x / cam.screen.y;
  let tanH = 1.0 / cam.proj[1][1];
  let ndc = uv * 2.0 - vec2f(1.0);
  return vec3f(ndc.x * tanH * aspect, ndc.y * tanH, -1.0);
}

@fragment fn fsComp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2i(cam.screen.xy);
  let coord = clamp(vec2i(fc.xy), vec2i(0), dims - vec2i(1));
  let uv = (vec2f(coord) + 0.5) / cam.screen.xy;
  let sc = textureLoad(sceneCol, coord, 0).rgb;
  let sd = textureLoad(sceneDep, coord, 0).r;
  let wd = textureLoad(waterDep, coord, 0).r;
  let wt = textureLoad(waterThk, coord, 0).r;
  // 白水：周围 3x3 的平均，使泡沫连成片
  var fm = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      fm = fm + textureLoad(foamTex, clamp(coord + vec2i(i, j) * 2, vec2i(0), dims - vec2i(1)), 0).r;
    }
  }
  fm = fm / 9.0;
  if (wd <= 0.0 || wt <= 0.0005 || wd >= sd) {
    return vec4f(sc, 1.0);
  }
  // 由深度场求法向（视空间）：相邻像素的视线与深度交点的叉积
  let px = textureLoad(waterDep, clamp(coord + vec2i(1, 0), vec2i(0), dims - vec2i(1)), 0).r;
  let py = textureLoad(waterDep, clamp(coord + vec2i(0, 1), vec2i(0), dims - vec2i(1)), 0).r;
  let dxZ = select(wd, px, px > 0.0);
  let dyZ = select(wd, py, py > 0.0);
  let dirC = viewRay(uv);
  let P = dirC * wd;
  let PX = viewRay(uv + vec2f(1.0 / cam.screen.x, 0.0)) * dxZ;
  let PY = viewRay(uv + vec2f(0.0, 1.0 / cam.screen.y)) * dyZ;
  var N = normalize(cross(PX - P, PY - P));
  if (N.z < 0.0) { N = -N; }
  let V = normalize(-P);
  let ndv = max(dot(N, V), 0.0);
  // 折射：用法线的屏幕投影偏移取背景
  let refrOff = N.xy * 0.035 * clamp(wt * 6.0, 0.2, 1.0);
  let ruv = uv + refrOff;
  let rc = clamp(vec2i(ruv * cam.screen.xy), vec2i(0), dims - vec2i(1));
  var refr = textureLoad(sceneCol, rc, 0).rgb;
  let rd = textureLoad(sceneDep, rc, 0).r;
  if (rd < wd) {
    refr = sc;
  }
  // 吸收：从水面到背景的路径长度（不超过水体厚度）
  let path = clamp(min(rd, sd) - wd, 0.0, wt * 1.3);
  let sigma = vec3f(2.3, 0.85, 0.42);
  let trans = exp(-sigma * path);
  let body = vec3f(0.02, 0.12, 0.16);
  let scat = body * (1.0 - exp(-wt * 2.5));
  var under = refr * trans + scat;
  // 菲涅尔反射
  let F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let R = reflect(-V, N);
  let refl = envColor(vec3f(R.x, R.y, R.z));
  var col = mix(under, refl, clamp(F * 1.4, 0.0, 0.9));
  // 水面高光
  let L = normalize(cam.lightDir.xyz);
  let H = normalize(L + V);
  col = col + vec3f(1.0, 0.97, 0.9) * pow(max(dot(N, H), 0.0), 220.0) * 1.6;
  // 白水混合
  let foamA = clamp(fm * 2.2, 0.0, 0.9);
  col = mix(col, vec3f(0.92, 0.95, 0.97) * (0.8 + 0.2 * N.y), foamA);
  return vec4f(col, 1.0);
}

// ---- 静态物体与背景（输出颜色与线性深度）----
struct SOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) nn: vec3f,
  @location(2) col: vec3f,
};

struct SFrag {
  @location(0) col: vec4f,
  @location(1) depth: vec4f,
};

@vertex fn vsStatic(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec3f) -> SOut {
  var o: SOut;
  o.wp = p;
  o.nn = n;
  o.col = c;
  o.pos = cam.viewProj * vec4f(p, 1.0);
  return o;
}

@fragment fn fsStatic(i: SOut) -> SFrag {
  let N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  let L = normalize(cam.lightDir.xyz);
  // 球的落影：从表面点沿光线方向与每个球求交（解析，柔化边缘）
  var occl = 1.0;
  for (var b = 0u; b < T.h.x; b++) {
    let bs = balls[b];
    if (bs.omega.w < 0.5) {
      continue;
    }
    let oc = bs.pos.xyz - i.wp;
    let tt = dot(oc, L);
    if (tt > 0.0) {
      let dd = length(oc - L * tt);
      let rr = bs.pos.w;
      occl = min(occl, 0.4 + 0.6 * smoothstep(rr * 0.8, rr * 1.3, dd));
    }
  }
  let diff = max(dot(N, L), 0.0) * occl;
  let amb = 0.3 + 0.25 * N.y;
  var col = i.col * (amb + diff * 0.85);
  let H = normalize(L + V);
  col = col + vec3f(pow(max(dot(N, H), 0.0), 40.0) * 0.08);
  let zv = (cam.view * vec4f(i.wp, 1.0)).z;
  var o: SFrag;
  o.col = vec4f(col, 1.0);
  o.depth = vec4f(-zv, 0.0, 0.0, 1.0);
  return o;
}

// 造浪板：本地坐标的前沿在 x=0，运行时平移到当前 paddleX
@vertex fn vsPaddle(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec3f) -> SOut {
  var o: SOut;
  let wp = p + vec3f(T.e.x, 0.0, 0.0);
  o.wp = wp;
  o.nn = n;
  o.col = c;
  o.pos = cam.viewProj * vec4f(wp, 1.0);
  return o;
}

@vertex fn vsBall(@location(0) lp: vec3f, @builtin(instance_index) ii: u32) -> SOut {
  let b = balls[ii];
  let r = b.pos.w;
  let ln = normalize(lp);
  let rot = qrot(b.quat, ln);
  var o: SOut;
  o.wp = b.pos.xyz + rot * r;
  o.nn = rot;
  o.col = b.color.rgb;
  o.pos = cam.viewProj * vec4f(o.wp, 1.0);
  return o;
}

@fragment fn fsBall(i: SOut) -> SFrag {
  let N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  let L = normalize(cam.lightDir.xyz);
  let diff = max(dot(N, L), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), 60.0) * 0.9;
  let ndv = max(dot(N, V), 0.0);
  let fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  let amb = 0.32 + 0.25 * N.y;
  var col = i.col * (amb + diff * 0.85) + vec3f(spec) + envColor(reflect(-V, N)) * fres * 0.35;
  let zv = (cam.view * vec4f(i.wp, 1.0)).z;
  var o: SFrag;
  o.col = vec4f(col, 1.0);
  o.depth = vec4f(-zv, 0.0, 0.0, 1.0);
  return o;
}

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// ---- 玻璃：半透明反射与边缘高光 ----
struct GOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) nn: vec3f,
  @location(2) edge: f32,
};

@vertex fn vsGlass(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) e: f32) -> GOut {
  var o: GOut;
  o.wp = p;
  o.nn = n;
  o.edge = e;
  o.pos = cam.viewProj * vec4f(p, 1.0);
  return o;
}

@fragment fn fsGlass(i: GOut) -> @location(0) vec4f {
  let N = normalize(i.nn);
  let V = normalize(cam.eye.xyz - i.wp);
  let ndv = abs(dot(N, V));
  let fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  let refl = envColor(reflect(-V, N));
  if (i.edge > 0.5) {
    // 边缘玻璃：较亮的高光
    return vec4f(vec3f(0.85, 0.92, 0.95) * (0.5 + 0.5 * refl), 0.85);
  }
  return vec4f(refl * fres * 0.9 + vec3f(0.6, 0.7, 0.75) * 0.012, fres * 0.7 + 0.03);
}
`,
};
