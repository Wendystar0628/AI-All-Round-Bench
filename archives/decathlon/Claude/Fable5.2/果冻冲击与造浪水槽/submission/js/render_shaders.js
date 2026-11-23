'use strict';
/* 渲染用 WGSL。两个场景共用同一套灯光、材质与后期（统一风格）。
   绑定号约定（group 0）：
   0 Frame | 1 线性采样器 | 2 阴影比较采样器 | 3 阴影图 | 4 光向吸收图 | 5 焦散图 | 6 水面高度图 | 7 球 | 8 实例 | 9 粒子
   10 场景颜色 | 11 场景深度 | 12 流体法线 | 13 厚度A | 14 厚度B | 15/16 通用输入 | 17 小 uniform */
(function () {
  const S = JW.SH = {};

  S.FRAME = /* wgsl */`
struct Frame {
  viewProj: mat4x4f, view: mat4x4f, projM: mat4x4f, lightVP: mat4x4f,
  camPos: vec4f,
  lightDir: vec4f,   // xyz 指向光源, w 光强
  res: vec4f, fres: vec4f,
  proj: vec4f,       // tan(fovx/2), tan(fovy/2), near, far
  simOff: vec4f,     // 世界 = 仿真 - simOff.xyz; w = 表面粒子半径
  p0: vec4f,         // 厚度粒子半径, 厚度归一系数, 平滑世界半径, 折射强度
  tank: vec4f,       // 水槽内尺寸 Lx Ly Lz, 静水位
  p1: vec4f,         // 推板位置, 球数, 曝光, 时间
  p2: vec4f,         // 光空间缩放 x y, 场景号(0 果冻 1 水槽), 水体开关
  matAbs: array<vec4f, 8>,   // 每种材质的吸收系数(1/m) rgb, w = 白化增益
  matCol: array<vec4f, 8>,   // rgb 体散射色调, w 散射强度
  grp: array<vec4f, 8>,      // 小球分组颜色
};
@group(0) @binding(0) var<uniform> F: Frame;
fn linDepth(d: f32) -> f32 { return F.proj.z*F.proj.w/(F.proj.w - d*(F.proj.w - F.proj.z)); }
fn hash21(p: vec2f) -> f32 { var q = fract(p*vec2f(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x*q.y); }
fn hash31(p: vec3f) -> f32 { var q = fract(p*vec3f(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash31(i), hash31(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 0.0)), hash31(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y),
             mix(mix(hash31(i + vec3f(0.0, 0.0, 1.0)), hash31(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(hash31(i + vec3f(0.0, 1.0, 1.0)), hash31(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y), u.z);
}
fn fbm(p: vec3f) -> f32 { return 0.5*vnoise(p) + 0.25*vnoise(p*2.03 + 7.1) + 0.125*vnoise(p*4.01 + 3.7) + 0.0625*vnoise(p*8.1 + 1.3); }
`;

  /* 摄影棚环境：深色背景 + 顶部柔光箱 + 侧面灯带（解析环境贴图，无需图片） */
  S.ENV = /* wgsl */`
fn backdrop(d: vec3f) -> vec3f {
  let t = smoothstep(-0.10, 0.70, d.y);
  var c = mix(vec3f(0.060, 0.068, 0.082), vec3f(0.012, 0.015, 0.022), t);
  c += vec3f(0.030, 0.034, 0.042)*exp(-5.0*abs(d.y - 0.05));
  return c;
}
fn envMap(d: vec3f, rough: f32) -> vec3f {
  var col = backdrop(d);
  col = mix(col, vec3f(0.22, 0.21, 0.20), smoothstep(0.02, -0.45, d.y));
  let e = 0.06 + rough*1.6;
  // 两侧的大面积柔光板：让侧向反射有内容，避免轮廓发黑
  col += vec3f(0.34, 0.37, 0.43)*smoothstep(0.15, 1.0, -d.x)*smoothstep(-0.35, 0.35, d.y);
  col += vec3f(0.30, 0.26, 0.21)*smoothstep(0.25, 1.0, d.x)*smoothstep(-0.35, 0.35, d.y);
  if (d.y > 0.02) {
    let p = d.xz*(3.2/d.y);
    let m = smoothstep(1.5 + e, 1.5 - e, abs(p.x + 0.3))*smoothstep(0.8 + e, 0.8 - e, abs(p.y - 0.7));
    col += vec3f(7.5, 7.3, 7.0)*m/(1.0 + rough*3.0);
    let m2 = smoothstep(0.5 + e, 0.5 - e, abs(p.x - 2.6))*smoothstep(1.6 + e, 1.6 - e, abs(p.y + 0.2));
    col += vec3f(2.6, 2.9, 3.4)*m2/(1.0 + rough*3.0);
  }
  if (d.z < -0.05) {
    let p = d.xy*(4.0/(-d.z));
    let m = smoothstep(0.35 + e, 0.35 - e, abs(p.x + 3.4))*smoothstep(1.3 + e, 1.3 - e, abs(p.y - 1.6));
    col += vec3f(3.2, 3.0, 2.6)*m/(1.0 + rough*3.0);
  }
  return col;
}
fn envDiffuse(n: vec3f) -> vec3f {
  return mix(vec3f(0.115, 0.108, 0.100), vec3f(0.21, 0.23, 0.265), n.y*0.5 + 0.5);
}
`;

  S.LIGHT = JW.WGSL_BALL + S.ENV + /* wgsl */`
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(2) var cmp: sampler_comparison;
@group(0) @binding(3) var shadowTex: texture_depth_2d;
@group(0) @binding(4) var absTex: texture_2d<f32>;
@group(0) @binding(5) var causTex: texture_2d<f32>;
@group(0) @binding(6) var heightTex: texture_2d<f32>;
@group(0) @binding(7) var<storage, read> balls: array<Ball>;
@group(0) @binding(18) var absZTex: texture_2d<f32>;
const POIS = array<vec2f, 12>(
  vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f(0.962, -0.195), vec2f(0.473, -0.480),
  vec2f(0.519, 0.767), vec2f(0.185, -0.893), vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));
fn shadowVis(P: vec3f, N: vec3f) -> f32 {
  let q = F.lightVP*vec4f(P + N*0.004, 1.0);
  let uv = q.xy*vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 1.0; }
  let z = q.z - 0.0012;
  var pp = POIS;
  let a = hash21(P.xz*917.0 + P.y*313.0)*6.283;
  let rot = mat2x2f(cos(a), sin(a), -sin(a), cos(a));
  var s = 0.0;
  for (var i = 0; i < 12; i++) {
    s += textureSampleCompareLevel(shadowTex, cmp, uv + rot*pp[i]*(2.6/2048.0), z);
  }
  return s/12.0;
}
// 半透明体（果冻/水体）沿光线方向的着色衰减：彩色影子
fn transVis(P: vec3f) -> vec3f {
  let q = F.lightVP*vec4f(P, 1.0);
  let uv = q.xy*vec2f(0.5, -0.5) + 0.5;
  let a = textureSampleLevel(absTex, lin, uv, 0.0);
  let zmin = textureSampleLevel(absZTex, lin, uv, 0.0).r;
  let behind = smoothstep(zmin + 0.0008, zmin + 0.0036, q.z);   // 只有位于半透明体之后的点才被染色
  let k = select(1.0, 0.55, F.p2.z > 0.5);
  let att = exp(-a.rgb*k)*exp(-a.a*select(9.0, 0.6, F.p2.z > 0.5));
  return mix(vec3f(1.0), att, behind);
}
fn spotAtten(P: vec3f) -> f32 {
  let r = length(P.xz - vec2f(0.0, 0.1));
  return mix(0.07, 1.0, smoothstep(3.3, 0.55, r));
}
fn causticAt(P: vec3f, N: vec3f) -> f32 {
  if (F.p2.w < 0.5) { return 1.0; }
  let s = P + F.simOff.xyz;
  if (s.x < 0.0 || s.x > F.tank.x || s.z < 0.0 || s.z > F.tank.z || s.y < -0.002) { return 1.0; }
  let uv = s.xz/F.tank.xz;
  let hs = textureSampleLevel(heightTex, lin, uv, 0.0).r;
  let under = smoothstep(0.0, 0.012, hs - s.y);
  let ca = textureSampleLevel(causTex, lin, uv, 0.0).r;
  return mix(1.0, 0.25 + 0.9*ca, under*0.9*clamp(N.y*1.6 + 0.15, 0.0, 1.0));
}
fn lightAt(P: vec3f, N: vec3f) -> vec3f {
  return vec3f(F.lightDir.w)*vec3f(1.0, 0.965, 0.92)*shadowVis(P, N)*transVis(P)*spotAtten(P)*causticAt(P, N);
}
fn ballAO(P: vec3f, N: vec3f) -> f32 {
  var ao = 1.0;
  let nb = u32(F.p1.y);
  for (var i = 0u; i < nb; i++) {
    let B = balls[i];
    if (B.alive < 0.5) { continue; }
    let d = (B.pos - F.simOff.xyz) - P;
    let l2 = dot(d, d);
    let r2 = B.radius*B.radius;
    if (l2 > r2*20.0) { continue; }
    let l = sqrt(l2);
    ao *= 1.0 - clamp(max(dot(N, d)/l, 0.0)*r2/l2, 0.0, 1.0)*0.85;
  }
  return ao;
}
fn ggx(N: vec3f, V: vec3f, L: vec3f, rough: f32, f0: vec3f) -> vec3f {
  let H = normalize(V + L);
  let nh = max(dot(N, H), 0.0); let nv = max(dot(N, V), 1e-3); let nl = max(dot(N, L), 0.0);
  let a = max(rough*rough, 0.002); let a2 = a*a;
  let dd = nh*nh*(a2 - 1.0) + 1.0;
  let Dg = a2/(3.14159*dd*dd);
  let k = (rough + 1.0)*(rough + 1.0)/8.0;
  let G = (nv/(nv*(1.0 - k) + k))*(nl/(nl*(1.0 - k) + k));
  let Fr = f0 + (vec3f(1.0) - f0)*pow(1.0 - max(dot(H, V), 0.0), 5.0);
  return Fr*(Dg*G/(4.0*nv*max(nl, 1e-3)))*nl;
}
fn pbr(P: vec3f, N: vec3f, V: vec3f, albedo: vec3f, rough: f32, metal: f32, ao: f32) -> vec3f {
  let L = F.lightDir.xyz;
  let f0 = mix(vec3f(0.04), albedo, metal);
  let li = lightAt(P, N);
  let nl = max(dot(N, L), 0.0);
  let diff = albedo*(1.0 - metal)/3.14159;
  var col = (diff*nl + ggx(N, V, L, rough, f0))*li*3.14159;
  let nv = max(dot(N, V), 0.0);
  let Fr = f0 + (max(vec3f(1.0 - rough), f0) - f0)*pow(1.0 - nv, 5.0);
  let cau = mix(1.0, causticAt(P, N), 0.5);
  col += albedo*(1.0 - metal)*envDiffuse(N)*ao*cau*spotAtten(P)*1.25;
  col += envMap(reflect(-V, N), rough)*Fr*ao*mix(1.0, 0.45, rough);
  return col;
}
`;

  const FSQ = /* wgsl */`
struct VQ { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VQ {
  var o: VQ;
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.pos = vec4f(p*2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
`;
  S.FSQ = FSQ;

  /* ---------- 背景与台面 ---------- */
  S.FLOOR = S.FRAME + S.LIGHT + FSQ + /* wgsl */`
struct FO { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs(in: VQ) -> FO {
  var o: FO;
  let ndc = vec2f(in.uv.x*2.0 - 1.0, 1.0 - in.uv.y*2.0);
  let R = mat3x3f(F.view[0].xyz, F.view[1].xyz, F.view[2].xyz);
  let rd = normalize(vec3f(ndc*F.proj.xy, -1.0))*R;
  let ro = F.camPos.xyz;
  var col = backdrop(rd);
  var depth = 1.0;
  if (rd.y < -1e-4) {
    let t = -ro.y/rd.y;
    if (t < 80.0) {
      let P = ro + rd*t;
      let N = vec3f(0.0, 1.0, 0.0);
      // 浅色哑光台面 + 细刻度网格（透过果冻/水体能看到折射扭曲）
      let fw = vec2f(t*2.0*F.proj.y*F.res.w/max(-rd.y, 0.06));
      let g1 = abs(fract(P.xz*10.0 + 0.5) - 0.5)/(fw*10.0);
      let g5 = abs(fract(P.xz*2.0 + 0.5) - 0.5)/(fw*2.0);
      let l1 = 1.0 - clamp(min(g1.x, g1.y)*0.9, 0.0, 1.0);
      let l5 = 1.0 - clamp(min(g5.x, g5.y)*0.6, 0.0, 1.0);
      let fade = smoothstep(7.0, 1.5, t);
      let sp = fbm(vec3f(P.xz*38.0, 1.7));
      var alb = vec3f(0.118, 0.115, 0.110)*(0.90 + 0.18*sp);
      alb = mix(alb, vec3f(0.050, 0.052, 0.058), max(l1*0.55, l5*0.8)*fade);
      let rough = 0.52 + 0.2*sp;
      let V = -rd;
      let ao = ballAO(P, N);
      var c = pbr(P, N, V, alb, rough, 0.0, ao);
      let fog = smoothstep(3.0, 16.0, length(P.xz));
      col = mix(c, backdrop(vec3f(rd.x, 0.0, rd.z)), fog);
      let q = F.viewProj*vec4f(P, 1.0);
      depth = clamp(q.z/q.w, 0.0, 1.0);
    }
  }
  o.color = vec4f(col, 1.0);
  o.depth = depth;
  return o;
}
`;

  /* ---------- 实例化盒体/圆柱（水槽底座、造浪机构等） ---------- */
  S.MESH = S.FRAME + S.LIGHT + /* wgsl */`
struct Inst { model: mat4x4f, color: vec4f, prm: vec4f };   // color.a = 材质号; prm: rough, metal, emissive, flag
@group(0) @binding(8) var<storage, read> inst: array<Inst>;
struct VO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) ii: u32, @location(3) lp: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let I = inst[ii];
  let wp = (I.model*vec4f(p, 1.0)).xyz;
  let c0 = I.model[0].xyz; let c1 = I.model[1].xyz; let c2 = I.model[2].xyz;
  o.n = normalize(c0*(n.x/dot(c0, c0)) + c1*(n.y/dot(c1, c1)) + c2*(n.z/dot(c2, c2)));
  o.wp = wp; o.ii = ii; o.lp = p*vec3f(length(c0), length(c1), length(c2));
  o.pos = F.viewProj*vec4f(wp, 1.0);
  return o;
}
@vertex fn vsShadow(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  return F.lightVP*(inst[ii].model*vec4f(p, 1.0));
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let I = inst[in.ii];
  let N = normalize(in.n);
  let V = normalize(F.camPos.xyz - in.wp);
  var alb = I.color.rgb;
  var rough = I.prm.x;
  let mat = u32(I.color.a);
  if (mat == 1u) {            // 拉丝金属
    let s = vnoise(vec3f(in.lp.x*4.0, in.lp.y*320.0, in.lp.z*4.0));
    rough = clamp(rough + (s - 0.5)*0.18, 0.08, 1.0);
    alb *= 0.92 + 0.14*s;
  } else if (mat == 2u) {     // 喷砂/粉末涂层
    alb *= 0.9 + 0.2*vnoise(in.lp*260.0);
  }
  var col = pbr(in.wp, N, V, alb, rough, I.prm.y, 1.0);
  col += I.color.rgb*I.prm.z;
  return vec4f(col, 1.0);
}
// 玻璃：菲涅耳反射 + 边缘高光，反射保持克制，不遮挡槽内运动
@fragment fn fsGlass(in: VO) -> @location(0) vec4f {
  let I = inst[in.ii];
  var N = normalize(in.n);
  let V = normalize(F.camPos.xyz - in.wp);
  if (dot(N, V) < 0.0) { N = -N; }
  let nv = max(dot(N, V), 0.0);
  let fr = 0.04 + 0.96*pow(1.0 - nv, 5.0);
  let Rr = reflect(-V, N);
  var refl = envMap(Rr, 0.02)*fr*0.75;
  refl += ggx(N, V, F.lightDir.xyz, 0.06, vec3f(0.04))*F.lightDir.w*0.6;
  var a = fr*0.75 + 0.035;
  var col = refl + vec3f(0.55, 0.72, 0.68)*0.012;
  if (I.prm.w > 0.5) {        // 玻璃断面/倒角：通透的青绿色亮边
    let e = envDiffuse(N)*1.3 + vec3f(F.lightDir.w)*max(dot(N, F.lightDir.xyz), 0.0)*0.5*shadowVis(in.wp, N);
    col = vec3f(0.50, 0.86, 0.76)*e*0.62 + refl;
    a = 0.60;
  }
  return vec4f(col, a);
}
`;

  /* ---------- 槽内地形 ---------- */
  S.TERRAIN = S.FRAME + S.LIGHT + /* wgsl */`
struct VO { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) sp: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  o.sp = p; o.wp = p - F.simOff.xyz; o.n = n;
  o.pos = F.viewProj*vec4f(o.wp, 1.0);
  return o;
}
@vertex fn vsShadow(@location(0) p: vec3f, @location(1) n: vec3f) -> @builtin(position) vec4f {
  return F.lightVP*vec4f(p - F.simOff.xyz, 1.0);
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  var N = normalize(in.n);
  let V = normalize(F.camPos.xyz - in.wp);
  let sp = in.sp;
  let n1 = fbm(sp*vec3f(34.0, 60.0, 34.0));
  let n2 = fbm(sp*140.0 + 11.0);
  // 沙色斜坡 + 深色礁石（坡度与高度决定）
  let rock = smoothstep(0.165, 0.215, sp.y + 0.03*n1) + smoothstep(0.55, 0.9, 1.0 - N.y);
  let sand = mix(vec3f(0.74, 0.66, 0.50), vec3f(0.62, 0.53, 0.38), n1)*(0.86 + 0.28*n2);
  let rk = mix(vec3f(0.27, 0.28, 0.30), vec3f(0.42, 0.41, 0.39), n1)*(0.75 + 0.5*n2);
  var alb = mix(sand, rk, clamp(rock, 0.0, 1.0));
  // 侧面剖切面略暗，带层理
  let side = step(abs(N.y), 0.2);
  alb = mix(alb, vec3f(0.50, 0.44, 0.34)*(0.8 + 0.3*fbm(vec3f(sp.x*20.0, sp.y*160.0, sp.z*20.0))), side);
  N = normalize(N + (vec3f(n2, 0.0, fbm(sp*150.0 + 5.0)) - 0.5)*0.35*(1.0 - side));
  let col = pbr(in.wp, N, V, alb, 0.85, 0.0, ballAO(in.wp, N));
  return vec4f(col, 1.0);
}
`;

  /* ---------- 球（光线求交的精确球体，带自转可见的程序纹理） ---------- */
  S.BALLS = S.FRAME + S.LIGHT + /* wgsl */`
struct VO { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) ii: u32, @location(1) vp: vec3f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let B = balls[ii];
  let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u))*2.0 - 1.0;
  let vc = (F.view*vec4f(B.pos - F.simOff.xyz, 1.0)).xyz;
  let vp = vc + vec3f(corner*B.radius*1.25, B.radius);
  o.vp = vp; o.ii = ii;
  o.pos = F.projM*vec4f(vp, 1.0);
  if (B.alive < 0.5) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
struct FO { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
fn isect(ro: vec3f, rd: vec3f, c: vec3f, r: f32) -> f32 {
  let oc = ro - c; let b = dot(oc, rd); let cc = dot(oc, oc) - r*r; let h = b*b - cc;
  if (h < 0.0) { return -1.0; }
  return -b - sqrt(h);
}
@fragment fn fs(in: VO) -> FO {
  var o: FO;
  let B = balls[in.ii];
  let R = mat3x3f(F.view[0].xyz, F.view[1].xyz, F.view[2].xyz);
  let rd = normalize(in.vp)*R;
  let ro = F.camPos.xyz;
  let c = B.pos - F.simOff.xyz;
  let t = isect(ro, rd, c, B.radius);
  if (t < 0.0) { discard; }
  let P = ro + rd*t;
  let N = normalize(P - c);
  let V = -rd;
  let q = vec4f(-B.quat.xyz, B.quat.w);
  let nl = qrot(q, N);       // 物体坐标系方向（随球转动）
  let kind = u32(B.ev.w + 0.5);
  var alb = vec3f(0.8); var rough = 0.3; var metal = 0.0;
  if (kind == 0u) {          // 抛光钢球：刻线 + 细微划痕
    let band = smoothstep(0.035, 0.02, abs(nl.y)) + smoothstep(0.03, 0.018, abs(abs(nl.y) - 0.62));
    let sc = vnoise(vec3f(nl.x*6.0, nl.y*240.0, nl.z*6.0));
    alb = mix(vec3f(0.78, 0.80, 0.83), vec3f(0.20, 0.21, 0.23), clamp(band, 0.0, 1.0));
    rough = mix(0.10 + 0.10*sc, 0.5, clamp(band, 0.0, 1.0));
    metal = 1.0;
    let dot1 = smoothstep(0.16, 0.14, length(nl - vec3f(0.0, 1.0, 0.0))) + smoothstep(0.16, 0.14, length(nl + vec3f(0.0, 1.0, 0.0)));
    alb = mix(alb, vec3f(0.85, 0.25, 0.12), clamp(dot1, 0.0, 1.0)); metal = mix(metal, 0.2, clamp(dot1, 0.0, 1.0));
  } else if (kind == 1u) {   // 花岗岩石球
    let g = fbm(nl*9.0 + 3.0);
    let sp = step(0.62, vnoise(nl*46.0)) ;
    let vein = smoothstep(0.04, 0.0, abs(fbm(nl*3.2 + 9.0) - 0.5));
    let big = smoothstep(0.42, 0.58, fbm(nl*2.1 + 1.7));
    alb = mix(vec3f(0.115, 0.125, 0.145), vec3f(0.30, 0.31, 0.33), g);
    alb = mix(alb, vec3f(0.42, 0.33, 0.27), big*0.55);
    alb = mix(alb, vec3f(0.045, 0.045, 0.055), sp*0.7);
    alb = mix(alb, vec3f(0.74, 0.72, 0.68), vein*0.8);
    rough = 0.30 + 0.3*g; metal = 0.0;
  } else if (kind == 2u) {   // 黄铜球
    let band = smoothstep(0.05, 0.03, abs(nl.x)) ;
    let sc = vnoise(vec3f(nl.x*200.0, nl.y*8.0, nl.z*8.0));
    alb = mix(vec3f(0.93, 0.70, 0.33), vec3f(0.40, 0.26, 0.10), band);
    rough = 0.16 + 0.12*sc + 0.3*band; metal = 1.0;
  } else {                   // 水槽小球：分组颜色 + 白色腰带与端点，便于看清滚动
    let gi = (kind - 10u) % 8u;
    let base = F.grp[gi].rgb;
    let band = smoothstep(0.17, 0.14, abs(nl.y));
    let cap = smoothstep(0.30, 0.27, length(nl.xz))*step(0.0, nl.y);
    alb = mix(base, vec3f(0.93, 0.93, 0.90), max(band, cap));
    alb *= 0.94 + 0.10*vnoise(nl*60.0);
    rough = 0.32; metal = 0.0;
  }
  var col = pbr(P, N, V, alb, rough, metal, 1.0);
  // 与台面/地形接触处的环境遮蔽
  let cq = F.viewProj*vec4f(P, 1.0);
  o.color = vec4f(col, 1.0);
  o.depth = clamp(cq.z/cq.w, 0.0, 1.0);
  return o;
}
// 阴影：光空间里的球
struct VS { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) rz: f32 };
@vertex fn vsShadow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VS {
  var o: VS;
  let B = balls[ii];
  let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u))*2.0 - 1.0;
  let q = F.lightVP*vec4f(B.pos - F.simOff.xyz, 1.0);
  o.pos = vec4f(q.xy + corner*B.radius*F.p2.xy, q.z, 1.0);
  o.uv = corner;
  o.rz = B.radius*F.p2.x*0.5;
  if (B.alive < 0.5) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsShadow(in: VS) -> @builtin(frag_depth) f32 {
  let d2 = dot(in.uv, in.uv);
  if (d2 > 1.0) { discard; }
  return in.pos.z;
}
`;

  /* ---------- 半透明粒子体：深度 / 厚度 / 光向吸收 / 俯视高度 ---------- */
  S.PART = S.FRAME + /* wgsl */`
@group(0) @binding(9) var<storage, read> ppos: array<vec4f>;
@group(0) @binding(11) var sceneDepth: texture_depth_2d;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) vc: vec3f, @location(2) @interpolate(flat) w: f32 };
fn corner(vi: u32) -> vec2f { return vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u))*2.0 - 1.0; }
@vertex fn vsDepth(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let P = ppos[ii];
  let c = corner(vi);
  let vc = (F.view*vec4f(P.xyz - F.simOff.xyz, 1.0)).xyz;
  // 飞溅/孤立水滴略小，表面更细腻
  let r = F.simOff.w*mix(1.0, 0.8, clamp(fract(P.w)/0.99, 0.0, 1.0)*F.p2.w);
  o.pos = F.projM*vec4f(vc + vec3f(c*r, 0.0), 1.0);
  o.uv = c; o.vc = vc; o.w = r;
  if (P.w < 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
struct DO { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fsDepth(in: VO) -> DO {
  var o: DO;
  let d2 = dot(in.uv, in.uv);
  if (d2 > 1.0) { discard; }
  let vz = in.vc.z + sqrt(1.0 - d2)*in.w;
  let cz = (F.projM[2][2]*vz + F.projM[3][2])/(-vz);
  let sp = vec2i(in.pos.xy*F.res.xy*F.fres.zw);
  if (cz > textureLoad(sceneDepth, sp, 0)) { discard; }
  o.color = vec4f(-vz, 0.0, 0.0, 1.0);
  o.depth = cz;
  return o;
}
@vertex fn vsThick(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let P = ppos[ii];
  let c = corner(vi);
  let vc = (F.view*vec4f(P.xyz - F.simOff.xyz, 1.0)).xyz;
  o.pos = F.projM*vec4f(vc + vec3f(c*F.p0.x, 0.0), 1.0);
  o.uv = c; o.vc = vc; o.w = P.w;
  if (P.w < 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
struct TO { @location(0) a: vec4f, @location(1) b: vec4f };
@fragment fn fsThick(in: VO) -> TO {
  var o: TO;
  let d2 = dot(in.uv, in.uv);
  if (d2 > 1.0) { discard; }
  let vz = in.vc.z;
  let cz = (F.projM[2][2]*vz + F.projM[3][2])/(-vz);
  let sp = vec2i(in.pos.xy*F.res.xy*F.fres.zw*2.0);
  if (cz > textureLoad(sceneDepth, sp, 0)) { discard; }
  let chord = 2.0*F.p0.x*sqrt(1.0 - d2)*F.p0.y;
  let mat = u32(in.w);
  var wh = clamp(fract(in.w)/0.99, 0.0, 1.0);
  if (F.p2.w < 0.5) { wh = smoothstep(0.45, 1.0, wh); }
  let M = F.matAbs[mat];
  o.a = vec4f(M.rgb*chord*(1.0 - 0.7*wh), wh*chord*M.w);
  o.b = vec4f(chord, f32(mat)*chord, 0.0, 0.0);
  return o;
}
// 光源视角的吸收累积（彩色影子、水体对槽底的遮暗）
@vertex fn vsAbs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let P = ppos[ii];
  let c = corner(vi);
  let q = F.lightVP*vec4f(P.xyz - F.simOff.xyz, 1.0);
  o.pos = vec4f(q.xy + c*F.p0.x*F.p2.xy, clamp(q.z, 0.0, 1.0), 1.0);
  o.uv = c; o.vc = vec3f(0.0); o.w = P.w;
  if (P.w < 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsAbs(in: VO) -> TO {
  var o: TO;
  let d2 = dot(in.uv, in.uv);
  if (d2 > 1.0) { discard; }
  let chord = 2.0*F.p0.x*sqrt(1.0 - d2)*F.p0.y;
  let M = F.matAbs[u32(in.w)];
  o.a = vec4f(M.rgb*chord, chord);
  o.b = vec4f(in.pos.z, 0.0, 0.0, 1.0);
  return o;
}
// 俯视水面高度（用于焦散与水下判断）
@vertex fn vsTop(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let P = ppos[ii];
  let c = corner(vi);
  let r = F.simOff.w*1.15;
  let uv = P.xz/F.tank.xz;
  o.pos = vec4f((uv.x*2.0 - 1.0) + c.x*r/F.tank.x*2.0, (1.0 - uv.y*2.0) + c.y*r/F.tank.z*2.0, 1.0 - P.y/F.tank.y, 1.0);
  o.uv = c; o.vc = vec3f(P.y, r, 0.0); o.w = P.w;
  if (P.w < 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsTop(in: VO) -> DO {
  var o: DO;
  let d2 = dot(in.uv, in.uv);
  if (d2 > 1.0) { discard; }
  let h = in.vc.x + in.vc.y*sqrt(1.0 - d2);
  o.color = vec4f(h, 0.0, 0.0, 1.0);
  o.depth = clamp(1.0 - h/F.tank.y, 0.0, 1.0);
  return o;
}
`;

  /* ---------- 深度平滑（窄域滤波，可分离） ---------- */
  S.SMOOTH = S.FRAME + FSQ + /* wgsl */`
@group(0) @binding(15) var src: texture_2d<f32>;
@group(0) @binding(17) var<uniform> D: vec4f;
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy);
  let zc = textureLoad(src, p, 0).r;
  if (zc > 900.0) { return vec4f(zc, 0.0, 0.0, 1.0); }
  let dim = vec2i(textureDimensions(src));
  let R = clamp(F.p0.z*F.fres.y*0.5/(F.proj.y*zc), 1.5, 44.0)*D.z;
  let sig = R*0.48;
  let delta = F.simOff.w*5.0;
  let mu = F.simOff.w*0.6;
  let dir = vec2i(D.xy);
  var sum = zc; var ws = 1.0;
  let n = i32(ceil(R));
  for (var i = 1; i <= n; i++) {
    let w = exp(-f32(i*i)/(2.0*sig*sig));
    for (var s = -1; s <= 1; s += 2) {
      let q = clamp(p + dir*(i*s), vec2i(0), dim - vec2i(1));
      let zq = textureLoad(src, q, 0).r;
      if (zq < zc - delta) { continue; }
      if (zq > zc + delta) { sum += w*(zc + mu); ws += w; }
      else { sum += w*zq; ws += w; }
    }
  }
  return vec4f(sum/ws, 0.0, 0.0, 1.0);
}
`;

  /* ---------- 由平滑深度重建视空间法线 ---------- */
  S.NORMAL = S.FRAME + FSQ + /* wgsl */`
@group(0) @binding(15) var src: texture_2d<f32>;
fn vpos(p: vec2i, z: f32) -> vec3f {
  let uv = (vec2f(p) + 0.5)*F.fres.zw;
  return vec3f(vec2f(uv.x*2.0 - 1.0, 1.0 - uv.y*2.0)*F.proj.xy*z, -z);
}
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy);
  let zc = textureLoad(src, p, 0).r;
  if (zc > 900.0) { return vec4f(0.0); }
  let dim = vec2i(textureDimensions(src));
  let pr = min(p + vec2i(1, 0), dim - vec2i(1)); let pl = max(p - vec2i(1, 0), vec2i(0));
  let pd = min(p + vec2i(0, 1), dim - vec2i(1)); let pu = max(p - vec2i(0, 1), vec2i(0));
  let zr = textureLoad(src, pr, 0).r; let zl = textureLoad(src, pl, 0).r;
  let zd = textureLoad(src, pd, 0).r; let zu = textureLoad(src, pu, 0).r;
  let c = vpos(p, zc);
  var ddx = vpos(pr, zr) - c;
  if (abs(zl - zc) < abs(zr - zc)) { ddx = c - vpos(pl, zl); }
  var ddy = vpos(pd, zd) - c;
  if (abs(zu - zc) < abs(zd - zc)) { ddy = c - vpos(pu, zu); }
  var n = cross(ddy, ddx);
  let l = length(n);
  if (l < 1e-12 || min(abs(zl - zc), abs(zr - zc)) > 0.05 || min(abs(zu - zc), abs(zd - zc)) > 0.05) { n = vec3f(0.0, 0.0, 1.0); } else { n /= l; }
  if (n.z < 0.0) { n = -n; }
  let bg = f32(zl > 900.0) + f32(zr > 900.0) + f32(zu > 900.0) + f32(zd > 900.0);
  let a = 1.0 - 0.22*bg;
  return vec4f(n.xy*a, zc*a, a);
}
`;

  /* ---------- 合成：折射 + 比尔-朗伯吸收 + 体散射 + 菲涅耳反射 + 高光 + 白水/裂面 ---------- */
  S.COMPOSITE = S.FRAME + S.LIGHT + FSQ + /* wgsl */`
@group(0) @binding(10) var sceneColor: texture_2d<f32>;
@group(0) @binding(11) var sceneDepth: texture_depth_2d;
@group(0) @binding(12) var fnTex: texture_2d<f32>;
@group(0) @binding(13) var thA: texture_2d<f32>;
@group(0) @binding(14) var thB: texture_2d<f32>;
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  let px = vec2i(in.pos.xy);
  let scene = textureLoad(sceneColor, px, 0).rgb;
  let fnv = textureSampleLevel(fnTex, lin, in.uv, 0.0);
  if (fnv.a < 0.03) { return vec4f(scene, 1.0); }
  let cov = fnv.a;
  let depth = fnv.b/cov;
  let sd = linDepth(textureLoad(sceneDepth, px, 0));
  if (depth > sd + 0.004) { return vec4f(scene, 1.0); }
  var nv = vec3f(fnv.rg/cov, 0.0);
  nv.z = sqrt(max(1.0 - dot(nv.xy, nv.xy), 0.0004));
  nv = normalize(nv);
  let R = mat3x3f(F.view[0].xyz, F.view[1].xyz, F.view[2].xyz);
  let N = normalize(nv*R);
  let ndc = vec2f(in.uv.x*2.0 - 1.0, 1.0 - in.uv.y*2.0);
  let vp = vec3f(ndc*F.proj.xy*depth, -depth);
  let P = F.camPos.xyz + vp*R;
  let V = normalize(F.camPos.xyz - P);
  let A = textureSampleLevel(thA, lin, in.uv, 0.0);
  let Bt = textureSampleLevel(thB, lin, in.uv, 0.0);
  let T = max(Bt.r, 1e-5);
  let isWater = F.p2.w > 0.5;
  let mi = u32(clamp(Bt.g/T + 0.5, 0.0, 7.0));
  let MC = F.matCol[mi];
  // 折射：按法线偏移采样背景，厚处偏移更大
  let rs = F.p0.w*clamp(T*8.0, 0.0, 1.0)*clamp(0.6/depth, 0.3, 2.0);
  var uv2 = in.uv + nv.xy*vec2f(-1.0, 1.0)*rs*vec2f(F.res.y*F.res.z, 1.0);
  let d2 = linDepth(textureLoad(sceneDepth, clamp(vec2i(uv2*F.res.xy), vec2i(0), vec2i(F.res.xy) - vec2i(1)), 0));
  if (d2 < depth) { uv2 = in.uv; }
  let ca = select(0.0025, 0.0009, isWater)*clamp(T*10.0, 0.0, 1.0);
  let dir2 = normalize(nv.xy + vec2f(1e-4));
  var refr = vec3f(textureSampleLevel(sceneColor, lin, uv2 + dir2*ca, 0.0).r,
                   textureSampleLevel(sceneColor, lin, uv2, 0.0).g,
                   textureSampleLevel(sceneColor, lin, uv2 - dir2*ca, 0.0).b);
  let nvd = max(dot(N, V), 0.0);
  // 轮廓处给一个最小等效厚度，边缘保持有颜色的实体感而不是发虚
  let Te = select(max(T, 0.028 + 0.03*(1.0 - nvd)*(1.0 - nvd)), T, isWater);
  let absb = A.rgb*(Te/T);
  let trans = exp(-absb);
  var col = refr*trans;
  // 体散射（本体颜色）：由光源照亮，受阴影影响
  let L = F.lightDir.xyz;
  let ao = ballAO(P, N);
  let sh = shadowVis(P, N)*spotAtten(P)*ao;
  let hue = exp(-A.rgb/T*0.05);
  let wrap = clamp((dot(N, L) + 0.6)/1.6, 0.0, 1.0);
  let lit = vec3f(F.lightDir.w)*wrap*sh + envDiffuse(N)*1.1*ao;
  let dens = 1.0 - exp(-Te*MC.w);
  var sc = mix(hue, MC.rgb, 0.35)*lit*dens*select(0.40, 0.24, isWater);
  // 透光增亮：光从背面穿过薄处
  sc += hue*pow(clamp(dot(-V, L)*0.5 + 0.5, 0.0, 1.0), 3.0)*F.lightDir.w*0.40*dens*sh;
  col += sc;
  // 白水 / 裂面：掺气或损伤的粒子把光散成白色
  let wamt = 1.0 - exp(-A.a*select(10.0, 34.0, isWater));
  let wcol = select(mix(vec3f(0.97, 0.94, 0.92), hue, 0.55), vec3f(0.93, 0.97, 1.0), isWater)*(vec3f(F.lightDir.w)*wrap*sh*0.85 + envDiffuse(N)*1.5);
  col = mix(col, wcol, clamp(wamt, 0.0, select(0.72, 0.94, isWater)));
  // 表面反射与高光
  let f0 = select(0.045, 0.022, isWater);
  let fr = min(f0 + (1.0 - f0)*pow(1.0 - nvd, 5.0), select(0.42, 1.0, isWater));
  let rough = mix(0.035, 0.3, clamp(wamt, 0.0, 1.0));
  let refl = envMap(reflect(-V, N), rough);
  col = mix(col*mix(0.55, 1.0, ao), refl, fr*(1.0 - 0.6*wamt)*mix(0.4, 1.0, ao));
  col += ggx(N, V, L, max(rough, 0.07), vec3f(f0))*F.lightDir.w*3.14159*sh*(1.0 - 0.5*wamt);
  return vec4f(mix(scene, col, smoothstep(0.03, 0.6, cov)), 1.0);
}
`;

  /* ---------- 焦散：水面高度 → 折射光线落点的面积比 ---------- */
  S.HBLUR = S.FRAME + JW.WGSL_TERRAIN + FSQ + /* wgsl */`
@group(0) @binding(15) var src: texture_2d<f32>;
@group(0) @binding(17) var<uniform> D: vec4f;
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  let p = vec2i(in.pos.xy);
  let dim = vec2i(textureDimensions(src));
  let dir = vec2i(D.xy);
  var sum = 0.0; var ws = 0.0;
  for (var i = -6; i <= 6; i++) {
    let q = clamp(p + dir*i, vec2i(0), dim - vec2i(1));
    var h = textureLoad(src, q, 0).r;
    if (D.z > 0.5) {   // 第一遍：无水处用地形高度填充
      let xz = (vec2f(q) + 0.5)/vec2f(dim)*F.tank.xz;
      h = max(h, terrainH(xz.x, xz.y));
    }
    let w = exp(-f32(i*i)/14.0);
    sum += h*w; ws += w;
  }
  return vec4f(sum/ws, 0.0, 0.0, 1.0);
}
`;
  S.CAUSTIC = S.FRAME + JW.WGSL_TERRAIN + /* wgsl */`
@group(0) @binding(15) var hTex: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) src: vec2f, @location(1) dst: vec2f, @location(2) k: f32 };
const GW = 400u; const GH = 100u;
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var o: VO;
  let quad = vi/6u; let cidx = vi%6u;
  let qx = quad%GW; let qy = quad/GW;
  var offs = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u));
  let g = vec2f(vec2u(qx, qy) + offs[cidx])/vec2f(f32(GW), f32(GH));
  let dim = vec2f(textureDimensions(hTex));
  let tc = vec2i(clamp(g*dim, vec2f(1.0), dim - vec2f(2.0)));
  let h = textureLoad(hTex, tc, 0).r;
  let hx = (textureLoad(hTex, tc + vec2i(1, 0), 0).r - textureLoad(hTex, tc - vec2i(1, 0), 0).r)*dim.x/(2.0*F.tank.x);
  let hz = (textureLoad(hTex, tc + vec2i(0, 1), 0).r - textureLoad(hTex, tc - vec2i(0, 1), 0).r)*dim.y/(2.0*F.tank.z);
  let n = normalize(vec3f(-hx, 1.0, -hz));
  let r = refract(-F.lightDir.xyz, n, 0.752);
  let xz = g*F.tank.xz;
  let dep = max(h - terrainH(xz.x, xz.y), 0.0);
  let hit = xz + r.xz/max(-r.y, 0.2)*dep;
  o.src = xz; o.dst = hit; o.k = smoothstep(0.0, 0.02, dep);
  let uv = hit/F.tank.xz;
  o.pos = vec4f(uv.x*2.0 - 1.0, 1.0 - uv.y*2.0, 0.5, 1.0);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let a0 = abs(dpdx(in.src).x*dpdy(in.src).y - dpdx(in.src).y*dpdy(in.src).x);
  let a1 = abs(dpdx(in.dst).x*dpdy(in.dst).y - dpdx(in.dst).y*dpdy(in.dst).x);
  let I = clamp(a0/max(a1, 1e-9), 0.0, 6.0);
  return vec4f(mix(1.0, I, in.k), 0.0, 0.0, 1.0);
}
`;

  /* ---------- 后期：泛光、色调映射、FXAA ---------- */
  S.POST = FSQ + /* wgsl */`
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(15) var src: texture_2d<f32>;
@fragment fn fsPrefilter(in: VQ) -> @location(0) vec4f {
  let ts = 1.0/vec2f(textureDimensions(src));
  var c = vec3f(0.0);
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, -1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, -1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, 1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, 1.0), 0.0).rgb;
  c *= 0.25;
  c = min(c, vec3f(24.0));
  let l = max(c.r, max(c.g, c.b));
  let k = max(l - 1.05, 0.0)/max(l, 1e-4);
  return vec4f(c*k, 1.0);
}
@fragment fn fsDown(in: VQ) -> @location(0) vec4f {
  let ts = 1.0/vec2f(textureDimensions(src));
  var c = vec3f(0.0);
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, -1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, -1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, 1.0), 0.0).rgb;
  c += textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, 1.0), 0.0).rgb;
  return vec4f(c*0.25, 1.0);
}
@fragment fn fsUp(in: VQ) -> @location(0) vec4f {
  let ts = 1.0/vec2f(textureDimensions(src));
  var c = textureSampleLevel(src, lin, in.uv, 0.0).rgb*4.0;
  c += (textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, 0.0), 0.0).rgb + textureSampleLevel(src, lin, in.uv - ts*vec2f(1.0, 0.0), 0.0).rgb
      + textureSampleLevel(src, lin, in.uv + ts*vec2f(0.0, 1.0), 0.0).rgb + textureSampleLevel(src, lin, in.uv - ts*vec2f(0.0, 1.0), 0.0).rgb)*2.0;
  c += textureSampleLevel(src, lin, in.uv + ts, 0.0).rgb + textureSampleLevel(src, lin, in.uv - ts, 0.0).rgb
     + textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, -1.0), 0.0).rgb + textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, 1.0), 0.0).rgb;
  return vec4f(c/16.0, 1.0);
}
`;
  S.TONEMAP = FSQ + /* wgsl */`
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(15) var hdr: texture_2d<f32>;
@group(0) @binding(16) var bloom: texture_2d<f32>;
@group(0) @binding(17) var<uniform> D: vec4f;   // 曝光, 泛光强度, 暗角, 时间
fn aces(x: vec3f) -> vec3f {
  let a = x*(x*2.51 + 0.03);
  let b = x*(x*2.43 + 0.59) + 0.14;
  return clamp(a/b, vec3f(0.0), vec3f(1.0));
}
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  var c = textureSampleLevel(hdr, lin, in.uv, 0.0).rgb;
  c += textureSampleLevel(bloom, lin, in.uv, 0.0).rgb*D.y;
  c *= D.x;
  let q = in.uv - 0.5;
  c *= 1.0 - D.z*smoothstep(0.25, 0.95, length(q*vec2f(1.15, 1.0))*1.4);
  c = aces(c);
  c = mix(vec3f(dot(c, vec3f(0.2126, 0.7152, 0.0722))), c, 1.06);
  c = pow(max(c, vec3f(0.0)), vec3f(1.0/2.2));
  let n = fract(sin(dot(in.pos.xy, vec2f(12.9898, 78.233)))*43758.5453) - 0.5;
  c += n/255.0;
  return vec4f(c, 1.0);
}
`;
  S.FXAA = FSQ + /* wgsl */`
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(15) var src: texture_2d<f32>;
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
@fragment fn fs(in: VQ) -> @location(0) vec4f {
  let ts = 1.0/vec2f(textureDimensions(src));
  let m = textureSampleLevel(src, lin, in.uv, 0.0).rgb;
  let lNW = luma(textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, -1.0), 0.0).rgb);
  let lNE = luma(textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, -1.0), 0.0).rgb);
  let lSW = luma(textureSampleLevel(src, lin, in.uv + ts*vec2f(-1.0, 1.0), 0.0).rgb);
  let lSE = luma(textureSampleLevel(src, lin, in.uv + ts*vec2f(1.0, 1.0), 0.0).rgb);
  let lM = luma(m);
  let lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  let lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax*0.09)) { return vec4f(m, 1.0); }
  var dir = vec2f(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  let red = max((lNW + lNE + lSW + lSE)*0.03125, 1.0/128.0);
  let rc = 1.0/(min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir*rc, vec2f(-8.0), vec2f(8.0))*ts;
  let a = 0.5*(textureSampleLevel(src, lin, in.uv + dir*(1.0/3.0 - 0.5), 0.0).rgb + textureSampleLevel(src, lin, in.uv + dir*(2.0/3.0 - 0.5), 0.0).rgb);
  let b = a*0.5 + 0.25*(textureSampleLevel(src, lin, in.uv - dir*0.5, 0.0).rgb + textureSampleLevel(src, lin, in.uv + dir*0.5, 0.0).rgb);
  let lB = luma(b);
  if (lB < lMin || lB > lMax) { return vec4f(a, 1.0); }
  return vec4f(b, 1.0);
}
`;
})();
