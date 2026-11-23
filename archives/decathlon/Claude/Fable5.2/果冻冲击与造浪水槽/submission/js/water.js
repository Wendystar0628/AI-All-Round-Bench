'use strict';
/* 场景二：造浪水槽。
   水体 = 三维 APIC 粒子-网格混合法（交错 MAC 网格 + 红黑 SOR 压力投影），全部在 WebGPU 计算着色器中求解。
   固体（地形 / 造浪推板 / 小球）用面积分数（变分边界）耦合；小球受力由压力场在球面上的积分得到（浮力、砰击、附加质量），
   小球反过来以运动边界推开水体。白水/水雾来自粒子自身携带的“掺气度”。 */
(function () {
  const GPU = JW.GPU;

  /* ---------- 槽内地形（JS 与 WGSL 两份实现必须一致） ---------- */
  JW.terrainH = function (x, z) {
    const ss = JW.smooth;
    const ramp = 0.155 * ss(0.62, 1.28, x) - 0.105 * ss(1.42, 1.72, x);
    const dxm = x - 1.33, dz = z - 0.13;
    const mound = 0.15 * Math.exp(-(dxm * dxm / (0.11 * 0.11) + dz * dz / (0.085 * 0.085)));
    const rip = 0.004 * Math.sin(x * 23.0 + z * 7.0) * Math.sin(z * 29.0 - x * 5.0) * ss(0.5, 0.9, x);
    return Math.max(0, ramp + mound + rip);
  };
  JW.terrainSD = function (x, y, z) {
    const e = 0.004, h = JW.terrainH(x, z);
    const hx = (JW.terrainH(x + e, z) - JW.terrainH(x - e, z)) / (2 * e);
    const hz = (JW.terrainH(x, z + e) - JW.terrainH(x, z - e)) / (2 * e);
    return (y - h) / Math.sqrt(1 + hx * hx + hz * hz);
  };
  JW.WGSL_TERRAIN = /* wgsl */`
fn terrainH(x: f32, z: f32) -> f32 {
  let ramp = 0.155*smoothstep(0.62, 1.28, x) - 0.105*smoothstep(1.42, 1.72, x);
  let dxm = x - 1.33;
  let dz = z - 0.13;
  let mound = 0.15*exp(-(dxm*dxm/(0.11*0.11) + dz*dz/(0.085*0.085)));
  let rip = 0.004*sin(x*23.0 + z*7.0)*sin(z*29.0 - x*5.0)*smoothstep(0.5, 0.9, x);
  return max(0.0, ramp + mound + rip);
}
fn terrainSD(p: vec3f) -> vec4f {
  let e = 0.004;
  let h = terrainH(p.x, p.z);
  let hx = (terrainH(p.x + e, p.z) - terrainH(p.x - e, p.z))/(2.0*e);
  let hz = (terrainH(p.x, p.z + e) - terrainH(p.x, p.z - e))/(2.0*e);
  let inv = inverseSqrt(1.0 + hx*hx + hz*hz);
  return vec4f(vec3f(-hx, 1.0, -hz)*inv, (p.y - h)*inv);
}
`;

  const HEAD = /* wgsl */`
struct Sim {
  dims: vec4u,   // nx, ny, nz, 粒子数
  f0: vec4f,     // dx, 1/dx, dt, time
  f1: vec4f,     // g, 推板位置, 推板速度, SOR 松弛因子
  f2: vec4f,     // 密度修正系数, 静水位, 分层系数, 备用
  i0: vec4u,     // 球数, 步号, 备用, 备用
  f3: vec4f,     // 槽内尺寸 Lx, Ly, Lz, 备用
};
@group(0) @binding(0) var<uniform> U: Sim;
const SM = 65536.0;
const SW = 65536.0;
fn cidx(c: vec3i) -> u32 { return u32((c.z*i32(U.dims.y) + c.y)*i32(U.dims.x) + c.x); }
fn inb(c: vec3i) -> bool { return all(c >= vec3i(0)) && all(c < vec3i(U.dims.xyz)); }
fn cl(c: vec3i) -> vec3i { return clamp(c, vec3i(0), vec3i(U.dims.xyz) - vec3i(1)); }
fn unit(a: u32) -> vec3i { var e = vec3i(0); e[a] = 1; return e; }
`;

  /* ---- 1. 把球“盖章”到网格（单元 → 球号+1） ---- */
  const STAMP = HEAD + JW.WGSL_BALL + /* wgsl */`
@group(0) @binding(7) var<storage, read> balls: array<Ball>;
@group(0) @binding(6) var<storage, read_write> ballGrid: array<atomic<u32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let b = gid.x/1728u;
  let l = gid.x%1728u;
  if (b >= U.i0.x) { return; }
  let B = balls[b];
  if (B.alive < 0.5) { return; }
  let o = vec3i(i32(l%12u), i32((l/12u)%12u), i32(l/144u)) - vec3i(6);
  let c = vec3i(floor(B.pos*U.f0.y)) + o;
  if (!inb(c)) { return; }
  let cc = (vec3f(c) + 0.5)*U.f0.x;
  let rr = B.radius + 1.3*U.f0.x;
  let d = cc - B.pos;
  if (dot(d, d) < rr*rr) { atomicMax(&ballGrid[cidx(c)], b + 1u); }
}
`;

  /* ---- 2. P2G：粒子动量散布到交错网格（定点原子累加，结果与线程顺序无关） ---- */
  const P2G = HEAD + /* wgsl */`
@group(0) @binding(1) var<storage, read> pos: array<vec4f>;
@group(0) @binding(2) var<storage, read> vel: array<vec4f>;
@group(0) @binding(3) var<storage, read> aff: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> ga: array<atomic<i32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= U.dims.w) { return; }
  let P = pos[pi];
  if (P.w < 0.0) { return; }
  let p = P.xyz*U.f0.y;
  let v = vel[pi].xyz;
  let dx = U.f0.x;
  let c = cl(vec3i(floor(p)));
  atomicAdd(&ga[cidx(c)*8u + 6u], 1);
  for (var a = 0u; a < 3u; a++) {
    var off = vec3f(0.5);
    off[a] = 0.0;
    let g = p - off;
    let b = floor(g);
    let f = g - b;
    let bi = vec3i(b);
    let ca = aff[pi*3u + a].xyz;
    let va = v[a];
    for (var n = 0u; n < 8u; n++) {
      let o = vec3u(n & 1u, (n >> 1u) & 1u, (n >> 2u) & 1u);
      let ofs = vec3f(o);
      let wv = mix(vec3f(1.0) - f, f, ofs);
      let w = wv.x*wv.y*wv.z;
      let node = cl(bi + vec3i(o));
      let val = va + dot(ca, (ofs - f)*dx);
      let id = cidx(node)*8u;
      atomicAdd(&ga[id + a], i32(round(w*val*SM)));
      atomicAdd(&ga[id + 3u + a], i32(round(w*SW)));
    }
  }
}
`;

  /* ---- 3. 网格装配：归一化速度、重力、固体面积分数与固体速度、单元类型 ---- */
  const SETUP = HEAD + JW.WGSL_BALL + /* wgsl */`
@group(0) @binding(4) var<storage, read> ga: array<i32>;
@group(0) @binding(5) var<storage, read> gstat: array<vec4f>;
@group(0) @binding(6) var<storage, read> ballGrid: array<u32>;
@group(0) @binding(7) var<storage, read> balls: array<Ball>;
@group(0) @binding(8) var<storage, read_write> gv: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> gs: array<vec4f>;
@group(0) @binding(10) var<storage, read_write> gsv: array<vec4f>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  let c = vec3i(gid);
  let id = cidx(c);
  let dx = U.f0.x;
  let stat = gstat[id];
  let cnt = ga[id*8u + 6u];
  let cc = (vec3f(c) + 0.5)*dx;
  var phiC = min(stat.w, cc.x - U.f1.y);
  let bg = ballGrid[id];
  if (bg > 0u) {
    let B = balls[bg - 1u];
    phiC = min(phiC, length(cc - B.pos) - B.radius);
  }
  var typ = 0.0;
  if (cnt > 0) { typ = 1.0; }
  else if (phiC < 0.0) {
    // 固体内部的“幽灵液体”单元：邻居有水时参与压力求解，防止压力在固体边界泄漏
    var has = false;
    for (var a = 0u; a < 3u; a++) {
      let e = unit(a);
      if (c[a] > 0) { if (ga[cidx(c - e)*8u + 6u] > 0) { has = true; } }
      if (c[a] < i32(U.dims[a]) - 1) { if (ga[cidx(c + e)*8u + 6u] > 0) { has = true; } }
    }
    if (has) { typ = 1.0; }
  }
  var vel3 = vec3f(0.0);
  var alpha = stat.xyz;
  var sv = vec3f(0.0);
  var mask = 0u;
  for (var a = 0u; a < 3u; a++) {
    let wgt = ga[id*8u + 3u + a];
    var u = 0.0;
    if (wgt > 0) {
      u = f32(ga[id*8u + a])/f32(wgt)*(SW/SM);
      u *= 1.0 - U.f2.w*U.f0.z;            // 停机后的消波阻尼（造浪时为 0）
      if (a == 1u) { u -= U.f1.x*U.f0.z; }
      mask |= (1u << a);
    }
    var fo = vec3f(0.5);
    fo[a] = 0.0;
    let xf = (vec3f(c) + fo)*dx;
    var al = alpha[a];
    var us = 0.0;
    let ap = clamp(0.5 + (xf.x - U.f1.y)*U.f0.y, 0.0, 1.0);
    if (ap < al) { al = ap; if (a == 0u) { us = U.f1.z; } }
    var bid = bg;
    if (bid == 0u && c[a] > 0) { bid = ballGrid[cidx(c - unit(a))]; }
    if (bid > 0u) {
      let B = balls[bid - 1u];
      let r = xf - B.pos;
      let ab = clamp(0.5 + (length(r) - B.radius)*U.f0.y, 0.0, 1.0);
      if (ab < al) { al = ab; let vb = B.vel + cross(B.ang, r); us = vb[a]; }
    }
    alpha[a] = al; sv[a] = us; vel3[a] = u;
  }
  gv[id] = vec4f(vel3, typ);
  gs[id] = vec4f(alpha, f32(mask));
  gsv[id] = vec4f(sv, 0.0);
}
`;

  /* ---- 4. 散度与泊松方程系数（含粒子过密时的体积修正源项） ---- */
  const DIVERGE = HEAD + /* wgsl */`
@group(0) @binding(4) var<storage, read> ga: array<i32>;
@group(0) @binding(8) var<storage, read> gv: array<vec4f>;
@group(0) @binding(9) var<storage, read> gs: array<vec4f>;
@group(0) @binding(10) var<storage, read> gsv: array<vec4f>;
@group(0) @binding(11) var<storage, read_write> coefA: array<vec4f>;
@group(0) @binding(12) var<storage, read_write> coefB: array<vec4f>;
@group(0) @binding(13) var<storage, read_write> pr: array<f32>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  let c = vec3i(gid);
  let id = cidx(c);
  let me = gv[id];
  if (me.w < 0.5) {
    coefA[id] = vec4f(0.0); coefB[id] = vec4f(0.0); pr[id] = 0.0;
    return;
  }
  let als = gs[id];
  let svs = gsv[id];
  var diag = 0.0;
  var div = 0.0;
  var lo = vec3f(0.0);
  var hi = vec3f(0.0);
  var nsum = 0.0;
  for (var a = 0u; a < 3u; a++) {
    let e = unit(a);
    let al = als[a];
    div -= al*me[a] + (1.0 - al)*svs[a];
    if (c[a] > 0) {
      let idm = cidx(c - e);
      nsum += f32(ga[idm*8u + 6u]);
      if (al > 0.0) { diag += al; if (gv[idm].w > 0.5) { lo[a] = al; } }
    }
    if (c[a] < i32(U.dims[a]) - 1) {
      let idp = cidx(c + e);
      let nb = gv[idp];
      let au = gs[idp][a];
      div += au*nb[a] + (1.0 - au)*gsv[idp][a];
      nsum += f32(ga[idp*8u + 6u]);
      if (au > 0.0) { diag += au; if (nb.w > 0.5) { hi[a] = au; } }
    }
  }
  if (diag < 1e-3) {
    coefA[id] = vec4f(0.0); coefB[id] = vec4f(0.0); pr[id] = 0.0;
    return;
  }
  let cnt = f32(ga[id*8u + 6u]);
  let rho = (2.0*cnt + nsum)/8.0;
  let over = max(cnt - 12.0, 0.0)/8.0 + max(rho - 9.0, 0.0)/8.0;
  let rhs = -div + U.f2.x*min(over, 1.5)*U.f0.x/U.f0.z;
  coefA[id] = vec4f(lo.x, hi.x, lo.y, hi.y);
  coefB[id] = vec4f(lo.z, hi.z, 1.0/diag, rhs);
}
`;

  /* ---- 5. 红黑高斯-赛德尔 + SOR 压力迭代（热启动） ---- */
  const PRESSURE = HEAD + /* wgsl */`
struct Col { c: vec4u };
@group(0) @binding(15) var<uniform> C: Col;
@group(0) @binding(11) var<storage, read> coefA: array<vec4f>;
@group(0) @binding(12) var<storage, read> coefB: array<vec4f>;
@group(0) @binding(13) var<storage, read_write> pr: array<f32>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  if (((gid.x + gid.y + gid.z) & 1u) != C.c.x) { return; }
  let id = cidx(vec3i(gid));
  let B = coefB[id];
  if (B.z == 0.0) { return; }
  let A = coefA[id];
  let sy = U.dims.x;
  let sz = U.dims.x*U.dims.y;
  var s = B.w;
  if (A.x != 0.0) { s += A.x*pr[id - 1u]; }
  if (A.y != 0.0) { s += A.y*pr[id + 1u]; }
  if (A.z != 0.0) { s += A.z*pr[id - sy]; }
  if (A.w != 0.0) { s += A.w*pr[id + sy]; }
  if (B.x != 0.0) { s += B.x*pr[id - sz]; }
  if (B.y != 0.0) { s += B.y*pr[id + sz]; }
  let old = pr[id];
  pr[id] = old + (s*B.z - old)*U.f1.w;
}
`;

  /* ---- 6. 压力梯度修正速度 ---- */
  const PROJECT = HEAD + /* wgsl */`
@group(0) @binding(8) var<storage, read> gv: array<vec4f>;
@group(0) @binding(9) var<storage, read> gs: array<vec4f>;
@group(0) @binding(13) var<storage, read> pr: array<f32>;
@group(0) @binding(14) var<storage, read_write> gv2: array<vec4f>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  let c = vec3i(gid);
  let id = cidx(c);
  let me = gv[id];
  let als = gs[id];
  let mask = u32(als.w);
  let p0 = pr[id];
  var outv = vec3f(0.0);
  var om = 0u;
  for (var a = 0u; a < 3u; a++) {
    var u = me[a];
    var ok = (mask >> a) & 1u;
    if (als[a] <= 0.0) { ok = 0u; u = 0.0; }
    else if (c[a] > 0) {
      let idm = cidx(c - unit(a));
      if (me.w > 0.5 || gv[idm].w > 0.5) { u -= (p0 - pr[idm]); ok = 1u; }
    }
    outv[a] = u;
    om |= (ok << a);
  }
  gv2[id] = vec4f(outv, f32(om));
}
`;

  /* ---- 7. 向无效面外推一层速度（自由滑移 / 自由面外侧取样） ---- */
  const EXTRAP = HEAD + /* wgsl */`
@group(0) @binding(14) var<storage, read> gv2: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> gv: array<vec4f>;
@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= U.dims.xyz)) { return; }
  let c = vec3i(gid);
  let id = cidx(c);
  let me = gv2[id];
  let mask = u32(me.w);
  var outv = me.xyz;
  if (mask != 7u) {
    var sum = vec3f(0.0);
    var n = vec3f(0.0);
    for (var a = 0u; a < 3u; a++) {
      let e = unit(a);
      for (var s = 0; s < 2; s++) {
        let q = c + e*(s*2 - 1);
        if (!inb(q)) { continue; }
        let o = gv2[cidx(q)];
        let m = u32(o.w);
        let sel = vec3f(f32(m & 1u), f32((m >> 1u) & 1u), f32((m >> 2u) & 1u));
        sum += o.xyz*sel;
        n += sel;
      }
    }
    for (var a = 0u; a < 3u; a++) {
      if (((mask >> a) & 1u) == 0u) { outv[a] = select(0.0, sum[a]/max(n[a], 1.0), n[a] > 0.0); }
    }
  }
  gv[id] = vec4f(outv, f32(mask));
}
`;

  /* ---- 8. 小球：压力积分受力 + 阻力 + 碰撞 + 积分 ---- */
  const BALLSTEP = HEAD + JW.WGSL_BALL + JW.WGSL_BALL_COLLIDE + JW.WGSL_TERRAIN + /* wgsl */`
@group(0) @binding(7) var<storage, read> balls: array<Ball>;
@group(0) @binding(16) var<storage, read_write> bout: array<Ball>;
@group(0) @binding(13) var<storage, read> pr: array<f32>;
@group(0) @binding(12) var<storage, read> coefB: array<vec4f>;
@group(0) @binding(8) var<storage, read> gv: array<vec4f>;
const DIRS = array<vec3f, 14>(
  vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, -1.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
  vec3f(0.577, 0.577, 0.577), vec3f(-0.577, 0.577, 0.577), vec3f(0.577, -0.577, 0.577), vec3f(-0.577, -0.577, 0.577),
  vec3f(0.577, 0.577, -0.577), vec3f(-0.577, 0.577, -0.577), vec3f(0.577, -0.577, -0.577), vec3f(-0.577, -0.577, -0.577));
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let bi = gid.x;
  if (bi >= U.i0.x) { return; }
  let A0 = balls[bi];
  var B = A0;
  if (B.alive < 0.5) { bout[bi] = B; return; }
  let dx = U.f0.x; let inv = U.f0.y; let dt = U.f0.z; let time = U.f0.w;
  let g = U.f1.x;
  let r = B.radius;
  let rhoW = 1000.0;
  let vol = 4.18879*r*r*r;
  // --- 压力在球面上的积分（变分耦合：F = -Σ(1-α)Δp）---
  let ci = vec3i(floor(B.pos*inv));
  let R = i32(ceil(r*inv)) + 1;
  var F = vec3f(0.0);
  var Vs = vec3f(0.0);
  let rq = (r + 1.4*dx)*(r + 1.4*dx);
  for (var z = -R; z <= R + 1; z++) {
    for (var y = -R; y <= R + 1; y++) {
      for (var x = -R; x <= R + 1; x++) {
        let c = ci + vec3i(x, y, z);
        if (!inb(c)) { continue; }
        let dc = (vec3f(c) + 0.5)*dx - B.pos;
        if (dot(dc, dc) > rq) { continue; }
        let pc = pr[cidx(c)];
        for (var a = 0u; a < 3u; a++) {
          if (c[a] == 0) { continue; }
          var fo = vec3f(0.5);
          fo[a] = 0.0;
          let xf = (vec3f(c) + fo)*dx;
          let cov = 1.0 - clamp(0.5 + (length(xf - B.pos) - r)*inv, 0.0, 1.0);
          if (cov > 0.0) {
            let pm = pr[cidx(c - unit(a))];
            F[a] -= cov*(pc - pm);
            Vs[a] += cov;
          }
        }
      }
    }
  }
  let vcell = vol*inv*inv*inv;
  let sc = vec3f(vcell)/max(Vs, vec3f(0.6*vcell));
  let Fp = rhoW*dx*dx*dx*F*sc/dt;
  // --- 浸湿比例与周围水速 ---
  var dirs = DIRS;
  var wet = 0.0;
  var uf = vec3f(0.0);
  for (var s = 0u; s < 14u; s++) {
    let sp = B.pos + dirs[s]*(r + 1.0*dx);
    let c = vec3i(floor(sp*inv));
    if (inb(c)) {
      let id = cidx(c);
      if (coefB[id].z > 0.0) { wet += 1.0; uf += gv[id].xyz; }
    }
  }
  if (wet > 0.0) { uf /= wet; }
  wet /= 14.0;
  let urel = B.vel - uf;
  let Fd = -0.5*0.45*rhoW*3.14159*r*r*wet*length(urel)*urel;
  var Fs = vec3f(0.0);
  if (wet > 0.9) { Fs.y = rhoW*vol*g*U.f2.z*(0.5*U.f2.y - B.pos.y)/U.f2.y; }
  // 弱耦合的附加质量稳定化: (m + m')a = F + m' a_prev
  let ma = 0.75*rhoW*vol*max(wet, 0.0);
  var acc = (Fp + Fd + Fs + vec3f(0.0, -B.mass*g, 0.0) + ma*B.acc)/(B.mass + ma);
  let al = length(acc);
  if (al > 300.0) { acc *= 300.0/al; }
  B.acc = acc;
  B.vel += acc*dt;
  B.ang *= (1.0 - min(1.0, 2.0*wet*dt));
  if (A0.wet < 0.05 && wet >= 0.05 && B.vel.y < -0.3) { B.ev2.x = time; B.ev2.y = length(B.vel); }
  B.wet = wet;
  // --- 球-球 ---
  var dv = vec3f(0.0); var dw = vec3f(0.0); var dp = vec3f(0.0);
  var hs = 0.0; var hk = 0.0;
  for (var j = 0u; j < U.i0.x; j++) {
    if (j == bi) { continue; }
    let O = balls[j];
    if (O.alive < 0.5) { continue; }
    let h = ballPair(A0, O, 0.55, 0.2);
    dv += h.dv; dw += h.dw; dp += h.dp;
    if (h.s > hs) { hs = h.s; hk = 2.0; }
  }
  B.vel += dv; B.ang += dw; B.pos += dp;
  // --- 槽壁 / 推板 / 地形 ---
  let L = U.f3.xyz;
  var s1 = 0.0;
  let xmin = U.f1.y + r;
  if (B.pos.x < xmin) { s1 = max(s1, ballPlane(&B, vec3f(1.0, 0.0, 0.0), xmin - B.pos.x, vec3f(U.f1.z, 0.0, 0.0), 0.4, 0.25)); }
  if (B.pos.x > L.x - r) { s1 = max(s1, ballPlane(&B, vec3f(-1.0, 0.0, 0.0), B.pos.x - (L.x - r), vec3f(0.0), 0.45, 0.25)); }
  if (B.pos.z < r) { s1 = max(s1, ballPlane(&B, vec3f(0.0, 0.0, 1.0), r - B.pos.z, vec3f(0.0), 0.45, 0.25)); }
  if (B.pos.z > L.z - r) { s1 = max(s1, ballPlane(&B, vec3f(0.0, 0.0, -1.0), B.pos.z - (L.z - r), vec3f(0.0), 0.45, 0.25)); }
  let T = terrainSD(B.pos);
  if (T.w < r) { s1 = max(s1, ballPlane(&B, T.xyz, r - T.w, vec3f(0.0), 0.3, 0.4)); }
  if (s1 > hs) { hs = s1; hk = 1.0; }
  if (hs > 0.1) { B.ev.x = time; B.ev.y = hs; B.ev.z = hk; }
  let sp = length(B.vel);
  if (sp > 12.0) { B.vel *= 12.0/sp; }
  B.pos += B.vel*dt;
  B.quat = qintegrate(B.quat, B.ang, dt);
  B.pos.x = clamp(B.pos.x, r*0.5, L.x - r*0.5);
  B.pos.z = clamp(B.pos.z, r*0.5, L.z - r*0.5);
  B.pos.y = max(B.pos.y, r*0.5);
  bout[bi] = B;
}
`;

  /* ---- 9. G2P：取回速度与仿射矩阵、推进粒子、固体碰撞、掺气度演化 ---- */
  const G2P = HEAD + JW.WGSL_BALL + JW.WGSL_TERRAIN + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> aff: array<vec4f>;
@group(0) @binding(4) var<storage, read> ga: array<i32>;
@group(0) @binding(6) var<storage, read> ballGrid: array<u32>;
@group(0) @binding(7) var<storage, read> balls: array<Ball>;
@group(0) @binding(8) var<storage, read> gv: array<vec4f>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pi = gid.x;
  if (pi >= U.dims.w) { return; }
  let P = pos[pi];
  if (P.w < 0.0) { return; }
  let dx = U.f0.x; let inv = U.f0.y; let dt = U.f0.z;
  let p = P.xyz*inv;
  var vnew = vec3f(0.0);
  var g2 = 0.0;
  for (var a = 0u; a < 3u; a++) {
    var off = vec3f(0.5);
    off[a] = 0.0;
    let g = p - off;
    let b = floor(g);
    let f = g - b;
    let bi = vec3i(b);
    var sum = 0.0;
    var grad = vec3f(0.0);
    for (var n = 0u; n < 8u; n++) {
      let o = vec3u(n & 1u, (n >> 1u) & 1u, (n >> 2u) & 1u);
      let ofs = vec3f(o);
      let wv = mix(vec3f(1.0) - f, f, ofs);
      let sg = ofs*2.0 - 1.0;
      let u = gv[cidx(cl(bi + vec3i(o)))][a];
      sum += wv.x*wv.y*wv.z*u;
      grad += vec3f(sg.x*wv.y*wv.z, wv.x*sg.y*wv.z, wv.x*wv.y*sg.z)*u;
    }
    grad *= inv;
    vnew[a] = sum;
    g2 += dot(grad, grad);
    aff[pi*3u + a] = vec4f(grad, 0.0);
  }
  let sp0 = length(vnew);
  if (sp0 > 9.0) { vnew *= 9.0/sp0; }
  var x = P.xyz + vnew*dt;
  let eps = 0.12*dx;
  // 小球
  let cN = cl(vec3i(floor(x*inv)));
  let bid = ballGrid[cidx(cN)];
  var nearBall = 0.0;
  if (bid > 0u) {
    let B = balls[bid - 1u];
    let d = x - B.pos;
    let l = length(d);
    if (l < B.radius + eps) {
      let n = d/max(l, 1e-5);
      x = B.pos + n*(B.radius + eps);
      let vr = vnew - (B.vel + cross(B.ang, d));
      let vn = dot(vr, n);
      if (vn < 0.0) { vnew -= vn*n; }
    }
    nearBall = smoothstep(0.8, 2.0, length(B.vel))*step(l, B.radius + 1.6*dx);
  }
  // 地形
  let T = terrainSD(x);
  if (T.w < eps) { x += T.xyz*(eps - T.w); }
  // 推板与槽壁
  let lo = vec3f(max(eps, U.f1.y + eps), eps, eps);
  let hi = U.f3.xyz - vec3f(eps);
  x = clamp(x, lo, hi);
  // --- 掺气度（白水来源）：稀疏飞溅、浪顶强剪切、球体尾迹 ---
  let cO = cl(vec3i(floor(p)));
  let n0 = ga[cidx(cO)*8u + 6u];
  let n1 = ga[cidx(cl(cO + vec3i(0, 1, 0)))*8u + 6u];
  let n2 = ga[cidx(cl(cO + vec3i(0, 2, 0)))*8u + 6u];
  let surf = (n1 + n2) <= 6;
  let speed = length(vnew);
  let gradN = sqrt(g2);
  var aer = clamp(P.w/0.99, 0.0, 1.0);
  var da = 0.0;
  if (n0 <= 3) { da += 5.0*smoothstep(0.5, 1.5, speed); }
  if (surf) { da += 3.5*smoothstep(14.0, 40.0, gradN)*smoothstep(0.4, 1.0, speed); }
  da += 6.0*nearBall;
  da -= select(0.32, 1.1, !surf && n0 >= 6);
  aer = clamp(aer + da*dt, 0.0, 1.0);
  pos[pi] = vec4f(x, aer*0.99);
  vel[pi] = vec4f(vnew, 0.0);
}
`;

  JW.WaterSim = class {
    constructor() {
      const d = GPU.device;
      this.dx = 0.01;
      this.NX = 201; this.NY = 65; this.NZ = 41;
      this.L = [(this.NX - 1) * this.dx, (this.NY - 1) * this.dx, (this.NZ - 1) * this.dx];
      this.N = this.NX * this.NY * this.NZ;
      this.dt = 1 / 240;
      this.maxP = 1500000;
      this.maxBalls = 64;
      this.waterLevel = 0.26;
      this.paddleX0 = 0.10;
      this.ballRadius = 0.03;
      this.params = { gravity: 9.81, sor: 1.8, iters: 36, densK: 0.12, strat: 0.03 };
      this.paddle = { amp: 0, ampTarget: 0, freq: 1.25, phase: 0, x: this.paddleX0, v: 0, on: false };
      this.time = 0; this.stepCount = 0; this.np = 0; this.nBalls = 0; this.ballSlot = 0;
      this.ballInfo = [];   // JS 侧记录每个槽位的分组
      const N = this.N;
      const B = this.buf = {};
      this.uData = new ArrayBuffer(96);
      this.uU32 = new Uint32Array(this.uData); this.uF32 = new Float32Array(this.uData);
      B.U = GPU.uniform(96);
      B.col = [GPU.uniform(16, new Uint32Array([0, 0, 0, 0])), GPU.uniform(16, new Uint32Array([1, 0, 0, 0]))];
      B.pos = GPU.storage(this.maxP * 16, null, 'w.pos');
      B.vel = GPU.storage(this.maxP * 16, null, 'w.vel');
      B.aff = GPU.storage(this.maxP * 48, null, 'w.aff');
      B.ga = GPU.storage(N * 32, null, 'w.ga');
      B.gstat = GPU.storage(N * 16, null, 'w.gstat');
      B.ballGrid = GPU.storage(N * 4, null, 'w.ballGrid');
      B.balls = GPU.storage(this.maxBalls * 128, null, 'w.balls');
      B.ballsOut = GPU.storage(this.maxBalls * 128, null, 'w.ballsOut');
      for (const k of ['gv', 'gs', 'gsv', 'coefA', 'coefB', 'gv2']) B[k] = GPU.storage(N * 16, null, 'w.' + k);
      B.pr = GPU.storage(N * 4, null, 'w.pr');

      const P = this.pipe = {
        stamp: GPU.compute(STAMP, 'w.stamp'), p2g: GPU.compute(P2G, 'w.p2g'), setup: GPU.compute(SETUP, 'w.setup'),
        div: GPU.compute(DIVERGE, 'w.div'), pres: GPU.compute(PRESSURE, 'w.pres'), proj: GPU.compute(PROJECT, 'w.proj'),
        ext: GPU.compute(EXTRAP, 'w.ext'), ball: GPU.compute(BALLSTEP, 'w.ball'), g2p: GPU.compute(G2P, 'w.g2p'),
      };
      this.bg = {
        stamp: GPU.bind(P.stamp, { 0: B.U, 7: B.balls, 6: B.ballGrid }),
        p2g: GPU.bind(P.p2g, { 0: B.U, 1: B.pos, 2: B.vel, 3: B.aff, 4: B.ga }),
        setup: GPU.bind(P.setup, { 0: B.U, 4: B.ga, 5: B.gstat, 6: B.ballGrid, 7: B.balls, 8: B.gv, 9: B.gs, 10: B.gsv }),
        div: GPU.bind(P.div, { 0: B.U, 4: B.ga, 8: B.gv, 9: B.gs, 10: B.gsv, 11: B.coefA, 12: B.coefB, 13: B.pr }),
        pres: [0, 1].map(i => GPU.bind(P.pres, { 0: B.U, 15: B.col[i], 11: B.coefA, 12: B.coefB, 13: B.pr })),
        proj: GPU.bind(P.proj, { 0: B.U, 8: B.gv, 9: B.gs, 13: B.pr, 14: B.gv2 }),
        ext: GPU.bind(P.ext, { 0: B.U, 14: B.gv2, 8: B.gv }),
        ball: GPU.bind(P.ball, { 0: B.U, 7: B.balls, 16: B.ballsOut, 13: B.pr, 12: B.coefB, 8: B.gv }),
        g2p: GPU.bind(P.g2p, { 0: B.U, 1: B.pos, 2: B.vel, 3: B.aff, 4: B.ga, 6: B.ballGrid, 7: B.balls, 8: B.gv }),
      };
      this._buildStatic();
      this.reset();
    }

    _buildStatic() {
      const { NX, NY, NZ, dx } = this;
      const st = new Float32Array(this.N * 4);
      const sd = JW.terrainSD;
      const frac = (phi) => Math.min(1, Math.max(0, 0.5 + phi / dx));
      let o = 0;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++, o += 4) {
        const x = i * dx, y = j * dx, z = k * dx, h = 0.5 * dx;
        let au = frac(sd(x, y + h, z + h)), av = frac(sd(x + h, y, z + h)), aw = frac(sd(x + h, y + h, z));
        if (i === 0 || i === NX - 1) au = 0;
        if (j === 0 || j === NY - 1) av = 0;
        if (k === 0 || k === NZ - 1) aw = 0;
        if (i === NX - 1 || j === NY - 1 || k === NZ - 1) { // 最外一层为墙体
          if (i === NX - 1) { av = 0; aw = 0; }
          if (j === NY - 1) { au = 0; aw = 0; }
          if (k === NZ - 1) { au = 0; av = 0; }
        }
        st[o] = au; st[o + 1] = av; st[o + 2] = aw;
        st[o + 3] = (i === NX - 1 || j === NY - 1 || k === NZ - 1) ? -dx : sd(x + h, y + h, z + h);
      }
      GPU.device.queue.writeBuffer(this.buf.gstat, 0, st);
    }

    /* 恢复静水初态（确定性） */
    reset() {
      const { NX, NY, NZ, dx } = this;
      const rnd = JW.rng(20251);
      const pos = new Float32Array(this.maxP * 4);
      let n = 0;
      const lvl = this.waterLevel, x0 = this.paddleX0 + 0.15 * dx;
      const jmax = Math.ceil(lvl / dx);
      for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < jmax; j++) for (let i = Math.floor(x0 / dx); i < NX - 1; i++) {
        for (let s = 0; s < 8; s++) {
          const px = (i + ((s & 1) ? 0.75 : 0.25) + (rnd() - 0.5) * 0.3) * dx;
          const py = (j + ((s & 2) ? 0.75 : 0.25) + (rnd() - 0.5) * 0.3) * dx;
          const pz = (k + ((s & 4) ? 0.75 : 0.25) + (rnd() - 0.5) * 0.3) * dx;
          if (py > lvl || px < x0) continue;
          if (py - JW.terrainH(px, pz) < 0.2 * dx) continue;
          if (n >= this.maxP) continue;
          pos[n * 4] = px; pos[n * 4 + 1] = py; pos[n * 4 + 2] = pz; pos[n * 4 + 3] = 0;
          n++;
        }
      }
      for (let i = n; i < this.maxP; i++) pos[i * 4 + 3] = -1;
      this.np = n;
      const q = GPU.device.queue;
      q.writeBuffer(this.buf.pos, 0, pos);
      const enc = GPU.device.createCommandEncoder();
      for (const k of ['vel', 'aff', 'pr', 'balls', 'ballsOut', 'gv', 'gv2']) enc.clearBuffer(this.buf[k]);
      q.submit([enc.finish()]);
      this.time = 0; this.stepCount = 0; this.nBalls = 0; this.ballSlot = 0; this.ballInfo = [];
      const pd = this.paddle;
      pd.amp = 0; pd.ampTarget = 0; pd.phase = 0; pd.x = this.paddleX0; pd.v = 0; pd.on = false;
      this.calm = 0; this.calmTarget = 0;
    }

    /* 写入若干小球。list: [{pos:[x,y,z], vel:[..], density, group}] */
    spawnBalls(list) {
      const f = new Float32Array(32);
      for (const b of list) {
        const slot = this.ballSlot % this.maxBalls;
        this.ballSlot++;
        this.nBalls = Math.min(this.maxBalls, Math.max(this.nBalls, slot + 1));
        const r = b.radius || this.ballRadius;
        const vol = 4 / 3 * Math.PI * r * r * r;
        f.fill(0);
        f[0] = b.pos[0]; f[1] = b.pos[1]; f[2] = b.pos[2]; f[3] = r;
        f[4] = b.vel ? b.vel[0] : 0; f[5] = b.vel ? b.vel[1] : 0; f[6] = b.vel ? b.vel[2] : 0; f[7] = b.density * 1000 * vol;
        const a = (b.spin || 0);
        f[8] = Math.sin(a) * 0.3; f[9] = Math.sin(a * 1.7) * 0.3; f[10] = 0; f[11] = 1;
        const ql = Math.hypot(f[8], f[9], f[10], f[11]); f[8] /= ql; f[9] /= ql; f[11] /= ql;
        f[12] = b.ang ? b.ang[0] : 0; f[13] = b.ang ? b.ang[1] : 0; f[14] = b.ang ? b.ang[2] : 0; f[15] = 1;
        f[16] = 0; f[17] = -this.params.gravity; f[18] = 0; f[19] = 0;
        f[20] = -10; f[23] = b.group;
        f[24] = -10; f[27] = b.density;
        GPU.device.queue.writeBuffer(this.buf.balls, slot * 128, f);
        this.ballInfo[slot] = { group: b.group, radius: r };
      }
    }

    /* 修改某一组的密度（只改质量字段，不打断运动） */
    setGroupDensity(group, density) {
      const q = GPU.device.queue, m = new Float32Array(1), dd = new Float32Array([density]);
      for (let s = 0; s < this.nBalls; s++) {
        const info = this.ballInfo[s];
        if (!info || info.group !== group) continue;
        const r = info.radius;
        m[0] = density * 1000 * (4 / 3 * Math.PI * r * r * r);
        q.writeBuffer(this.buf.balls, s * 128 + 28, m);
        q.writeBuffer(this.buf.balls, s * 128 + 108, dd);
      }
    }

    _advancePaddle() {
      const pd = this.paddle, dt = this.dt;
      this.calm += (this.calmTarget - this.calm) * Math.min(1, dt / 0.6);
      const tgt = pd.on ? pd.ampTarget : 0;
      const k = Math.min(1, dt / 0.3);
      const dA = (tgt - pd.amp) * k;
      pd.amp += dA;
      const w = 2 * Math.PI * pd.freq;
      pd.phase += w * dt;
      if (pd.phase > 2 * Math.PI) pd.phase -= 2 * Math.PI;
      const s = Math.sin(pd.phase), c = Math.cos(pd.phase);
      pd.x = this.paddleX0 + pd.amp * s;
      pd.v = pd.amp * w * c + (dA / dt) * s;
      if (!pd.on && pd.amp < 1e-5) { pd.amp = 0; pd.v = 0; pd.x = this.paddleX0; }
    }

    _writeU() {
      const u = this.uU32, f = this.uF32, p = this.params;
      u[0] = this.NX; u[1] = this.NY; u[2] = this.NZ; u[3] = this.np;
      f[4] = this.dx; f[5] = 1 / this.dx; f[6] = this.dt; f[7] = this.time;
      f[8] = p.gravity; f[9] = this.paddle.x; f[10] = this.paddle.v; f[11] = p.sor;
      f[12] = p.densK; f[13] = this.waterLevel; f[14] = p.strat; f[15] = this.calm;
      u[16] = this.nBalls; u[17] = this.stepCount; u[18] = 0; u[19] = 0;
      f[20] = this.L[0]; f[21] = this.L[1]; f[22] = this.L[2]; f[23] = this.paddle.amp;
      GPU.device.queue.writeBuffer(this.buf.U, 0, this.uData);
    }

    /* 推进一个固定子步 */
    substep() {
      const d = GPU.device, B = this.buf, P = this.pipe, G = this.bg;
      this._advancePaddle();
      this._writeU();
      const gx = Math.ceil(this.NX / 8), gy = Math.ceil(this.NY / 4), gz = Math.ceil(this.NZ / 4);
      const enc = d.createCommandEncoder();
      enc.clearBuffer(B.ga);
      enc.clearBuffer(B.ballGrid);
      let cp = enc.beginComputePass();
      if (this.nBalls > 0) { cp.setPipeline(P.stamp); cp.setBindGroup(0, G.stamp); cp.dispatchWorkgroups(Math.ceil(this.nBalls * 1728 / 256)); }
      cp.setPipeline(P.p2g); cp.setBindGroup(0, G.p2g); cp.dispatchWorkgroups(Math.ceil(this.np / 256));
      cp.setPipeline(P.setup); cp.setBindGroup(0, G.setup); cp.dispatchWorkgroups(gx, gy, gz);
      cp.setPipeline(P.div); cp.setBindGroup(0, G.div); cp.dispatchWorkgroups(gx, gy, gz);
      cp.setPipeline(P.pres);
      for (let i = 0; i < this.params.iters; i++) {
        cp.setBindGroup(0, G.pres[0]); cp.dispatchWorkgroups(gx, gy, gz);
        cp.setBindGroup(0, G.pres[1]); cp.dispatchWorkgroups(gx, gy, gz);
      }
      cp.setPipeline(P.proj); cp.setBindGroup(0, G.proj); cp.dispatchWorkgroups(gx, gy, gz);
      cp.setPipeline(P.ext); cp.setBindGroup(0, G.ext); cp.dispatchWorkgroups(gx, gy, gz);
      if (this.nBalls > 0) { cp.setPipeline(P.ball); cp.setBindGroup(0, G.ball); cp.dispatchWorkgroups(Math.ceil(this.nBalls / 64)); }
      cp.end();
      if (this.nBalls > 0) enc.copyBufferToBuffer(B.ballsOut, 0, B.balls, 0, this.nBalls * 128);
      cp = enc.beginComputePass();
      cp.setPipeline(P.g2p); cp.setBindGroup(0, G.g2p); cp.dispatchWorkgroups(Math.ceil(this.np / 256));
      cp.end();
      d.queue.submit([enc.finish()]);
      this.time += this.dt; this.stepCount++;
    }

    step(n) { for (let i = 0; i < n; i++) this.substep(); }

    /* 调试统计 */
    async stats() {
      const n = this.np;
      const p = new Float32Array(await JW.readBuffer(this.buf.pos, 0, n * 16));
      const v = new Float32Array(await JW.readBuffer(this.buf.vel, 0, n * 16));
      let ymax = -1e9, ysum = 0, vmax = 0, nan = 0, aer = 0, top = 0, ke = 0;
      for (let i = 0; i < n; i++) {
        const y = p[i * 4 + 1];
        if (!(y === y)) { nan++; continue; }
        ysum += y; if (y > ymax) ymax = y;
        const s = Math.hypot(v[i * 4], v[i * 4 + 1], v[i * 4 + 2]);
        if (s > vmax) vmax = s;
        ke += s * s;
        if (p[i * 4 + 3] > 0.3) aer++;
        if (y > this.waterLevel + 0.01) top++;
      }
      return { n, ymean: ysum / n, ymax, vmax, nan, aer, top, rms: Math.sqrt(ke / n) };
    }
    async readBalls() {
      if (!this.nBalls) return [];
      const f = new Float32Array(await JW.readBuffer(this.buf.balls, 0, this.nBalls * 128));
      const out = [];
      for (let i = 0; i < this.nBalls; i++) out.push(Array.from(f.subarray(i * 32, i * 32 + 32)));
      return out;
    }
  };
})();
