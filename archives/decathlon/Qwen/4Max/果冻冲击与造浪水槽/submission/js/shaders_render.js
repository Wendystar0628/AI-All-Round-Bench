/* 渲染 WGSL：网格材质 / 阴影 / 背景 / 屏幕空间水体 / 后期 */
'use strict';
const SH = {};

SH.frame = `
struct Frame {
  viewProj: mat4x4f, view: mat4x4f, proj: mat4x4f, invViewProj: mat4x4f,
  invView: mat4x4f, shadowMat: mat4x4f,
  camPos: vec4f, lightDir: vec4f, lightColor: vec4f, rimDir: vec4f, rimColor: vec4f,
  params: vec4f, screen: vec4f, ambient: vec4f, misc: vec4f
};
struct Draw { model: mat4x4f, color: vec4f, params: vec4f, params2: vec4f };
struct BallInst { model: mat4x4f, color: vec4f, params: vec4f };
`;

SH.common = `
fn envColor(d: vec3f) -> vec3f {
  let t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.010, 0.014, 0.028), vec3f(0.055, 0.085, 0.145), pow(t, 1.4));
  let g = pow(max(dot(d, F.lightDir.xyz), 0.0), 6.0);
  c += F.lightColor.rgb * g * 0.30;
  let g2 = pow(max(dot(d, F.rimDir.xyz), 0.0), 4.0);
  c += F.rimColor.rgb * g2 * 0.20;
  c += vec3f(0.045, 0.075, 0.110) * pow(1.0 - abs(d.y), 8.0) * 0.65;
  return c;
}
fn causticPattern(p: vec2f, t: f32) -> f32 {
  var v = sin(p.x * 21.0 + t * 1.4 + sin(p.y * 15.0 - t * 1.9));
  v += sin(p.y * 23.0 - t * 1.15 + sin(p.x * 17.0 + t * 2.2));
  v += sin((p.x + p.y) * 13.0 + t * 0.9);
  v = v / 3.0 * 0.5 + 0.5;
  return pow(v, 4.0) * 2.2;
}
`;

SH.shadowFn = `
fn shadowFactor(pw: vec3f, ndl: f32) -> f32 {
  let sc = F.shadowMat * vec4f(pw, 1.0);
  let uv = vec2f(sc.x / sc.w * 0.5 + 0.5, 0.5 - sc.y / sc.w * 0.5);
  let dref = sc.z / sc.w - 0.0018 * (1.0 - ndl) - 0.0008;
  if (uv.x < 0.002 || uv.x > 0.998 || uv.y < 0.002 || uv.y > 0.998 || sc.w <= 0.0) { return 1.0; }
  let ts = 1.0 / 2048.0;
  var s = 0.0;
  for (var i = -1; i <= 1; i++) {
    for (var j = -1; j <= 1; j++) {
      s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(f32(i), f32(j)) * ts, dref);
    }
  }
  return s / 9.0;
}
`;

SH.mesh = SH.frame + `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowSmp: sampler_comparison;
@group(0) @binding(3) var surfTex: texture_2d<f32>;
@group(0) @binding(4) var surfSmp: sampler;
@group(1) @binding(0) var<uniform> D: Draw;
@group(1) @binding(1) var<storage, read> insts: array<BallInst>;
` + SH.common + SH.shadowFn + `
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) pw: vec3f,
  @location(1) nw: vec3f,
  @location(2) nl: vec3f,
  @location(3) col: vec4f,
  @location(4) prm: vec4f,
  @location(5) prm2: vec4f
};
@vertex fn vsMain(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  let pw = (D.model * vec4f(p, 1.0)).xyz;
  o.pw = pw; o.pos = F.viewProj * vec4f(pw, 1.0);
  o.nw = normalize((D.model * vec4f(n, 0.0)).xyz);
  o.nl = n; o.col = D.color; o.prm = D.params; o.prm2 = D.params2;
  return o;
}
@vertex fn vsInst(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let inst = insts[ii];
  let pw = (inst.model * vec4f(p, 1.0)).xyz;
  o.pw = pw; o.pos = F.viewProj * vec4f(pw, 1.0);
  o.nw = normalize((inst.model * vec4f(n, 0.0)).xyz);
  o.nl = n; o.col = inst.color; o.prm = inst.params; o.prm2 = vec4f(0.0);
  return o;
}
fn shadeStd(P: vec3f, N: vec3f, V: vec3f, base: vec3f, metallic: f32, rough: f32, sh: f32) -> vec3f {
  let L = F.lightDir.xyz;
  let ndl = max(dot(N, L), 0.0);
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let specPow = mix(160.0, 10.0, rough);
  let spec = pow(ndh, specPow) * mix(0.05, 1.2, metallic) * (1.0 - rough * 0.65);
  var c = base * (1.0 - metallic) * ndl * F.lightColor.rgb * sh;
  c += F.lightColor.rgb * spec * sh;
  let rl = max(dot(N, F.rimDir.xyz), 0.0);
  c += base * rl * F.rimColor.rgb * 0.4;
  let hemi = mix(F.ambient.rgb * 0.45, F.ambient.rgb, N.y * 0.5 + 0.5);
  c += base * hemi * (1.0 - metallic * 0.55);
  let R = reflect(-V, N);
  let fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  let envS = mix(envColor(R), F.ambient.rgb * 0.8, rough * 0.85);
  c += envS * mix(vec3f(0.05), base, metallic) * (0.4 + fres * 0.8) * (1.0 - rough * 0.55);
  return c;
}
@fragment fn fsMain(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let mode = i.prm.x;
  var N = normalize(i.nw);
  if (!ff) { N = -N; }
  let V = normalize(F.camPos.xyz - i.pw);
  let base = i.col.rgb;
  let ndl = max(dot(N, F.lightDir.xyz), 0.0);
  var sh = shadowFactor(i.pw, ndl);
  var c = vec3f(0.0);
  var alpha = i.col.a;
  if (mode < 0.5) {
    c = shadeStd(i.pw, N, V, base, i.prm.y, i.prm.z, sh);
  } else if (mode < 1.5) {
    // 果冻：半透明 + 近似次表面散射
    let L = F.lightDir.xyz;
    let wrap = clamp(dot(N, L) * 0.55 + 0.45, 0.0, 1.0);
    let thick = clamp(0.55 - dot(N, V) * 0.3, 0.1, 1.0);
    let sss = pow(clamp(dot(V, -L + N * 0.55), 0.0, 1.0), 2.5) * thick;
    let hemi = mix(F.ambient.rgb * 0.5, F.ambient.rgb, N.y * 0.5 + 0.5);
    c = base * wrap * F.lightColor.rgb * (0.35 + 0.65 * sh) * 0.85;
    c += base * sss * F.lightColor.rgb * 0.9;
    c += base * hemi * 0.8;
    c += base * base * 0.30;
    let H = normalize(L + V);
    let sp = pow(max(dot(N, H), 0.0), 220.0) * 1.6 + pow(max(dot(N, H), 0.0), 40.0) * 0.22;
    c += F.lightColor.rgb * sp * (0.4 + 0.6 * sh);
    let R = reflect(-V, N);
    let fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    c += envColor(R) * (0.10 + fres * 0.85);
    let rl = pow(max(dot(N, F.rimDir.xyz), 0.0), 2.0);
    c += F.rimColor.rgb * rl * 0.16 + base * rl * 0.22;
    let rf = refract(-V, N, 0.74);
    c += envColor(rf) * base * 0.45;
    alpha = i.col.a * (0.82 + fres * 0.18);
  } else if (mode < 2.5) {
    // 玻璃
    let R = reflect(-V, N);
    let fres = pow(1.0 - abs(dot(N, V)), 4.0);
    c = envColor(R) * (0.10 + fres * 1.35);
    let L = F.lightDir.xyz;
    let H = normalize(L + V);
    c += F.lightColor.rgb * pow(max(dot(N, H), 0.0), 300.0) * 2.2;
    c += F.rimColor.rgb * pow(max(dot(reflect(-V, N), F.rimDir.xyz), 0.0), 60.0) * 0.8;
    c += base * 0.02;
    alpha = 0.045 + fres * 0.42;
  } else if (mode < 3.5) {
    // 地面：网格 + 径向衰减
    let g2 = abs(fract(i.pw.xz * 0.85) - 0.5);
    let line = 1.0 - smoothstep(0.0, 0.035, min(g2.x, g2.y));
    let rad = length(i.pw.xz - F.misc.xy);
    let fade = exp(-rad * rad * 0.020);
    var bcol = base * (0.55 + 0.45 * fade);
    bcol += vec3f(0.10, 0.16, 0.22) * line * fade * 0.5;
    c = shadeStd(i.pw, N, V, bcol, 0.05, 0.62, sh);
    c = mix(c, envColor(vec3f(0.0, -1.0, 0.0)) * 0.55, 1.0 - fade);
    alpha = 1.0;
  } else if (mode < 4.5) {
    // 槽底 / 地形：沙纹 + 焦散
    let suv = vec2f((i.pw.x - F.misc.z) / F.misc.w, (i.pw.z - F.ambient.w) / F.params.w);
    let sinfo = textureSampleLevel(surfTex, surfSmp, suv, 0.0);
    let under = clamp(sinfo.r * 3.0, 0.0, 1.0);
    let ca = causticPattern(i.pw.xz * 1.6, F.params.x) * (0.25 + sinfo.g * 1.6) * under;
    let sand = base * (0.85 + 0.15 * sin(i.pw.x * 40.0) * sin(i.pw.z * 37.0));
    c = shadeStd(i.pw, N, V, sand, 0.0, 0.8, sh * (1.0 - under * 0.25));
    c += F.lightColor.rgb * ca * vec3f(0.55, 0.85, 0.95) * 0.55;
    c = mix(c, c * vec3f(0.62, 0.82, 0.92), under * 0.55);
    alpha = 1.0;
  } else {
    // 球体：双色条纹显示滚动
    var b2 = base;
    let band = smoothstep(0.10, 0.045, abs(i.nl.y));
    let cap = smoothstep(0.80, 0.86, i.nl.y);
    b2 = mix(b2, b2 * 0.35 + vec3f(0.06), band * 0.85);
    b2 = mix(b2, vec3f(0.92, 0.94, 0.96), cap * 0.8);
    c = shadeStd(i.pw, N, V, b2, i.prm.y, i.prm.z, sh);
    alpha = 1.0;
  }
  // 距离雾
  let dist = length(F.camPos.xyz - i.pw);
  let fog = 1.0 - exp(-dist * dist * 0.0016);
  c = mix(c, F.ambient.rgb * 0.35, fog * 0.55);
  return vec4f(c, alpha);
}
`;

SH.shadow = SH.frame + `
@group(0) @binding(0) var<uniform> F: Frame;
@group(1) @binding(0) var<uniform> D: Draw;
@group(1) @binding(1) var<storage, read> insts: array<BallInst>;
@vertex fn vsShadow(@location(0) p: vec3f, @location(1) n: vec3f) -> @builtin(position) vec4f {
  return F.shadowMat * D.model * vec4f(p, 1.0);
}
@vertex fn vsShadowInst(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  return F.shadowMat * insts[ii].model * vec4f(p, 1.0);
}
@fragment fn fsShadow() {}
`;

SH.fullscreenVS = `
@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
`;

SH.bg = SH.frame + SH.fullscreenVS + `
@group(0) @binding(0) var<uniform> F: Frame;
@fragment fn fsBg(@builtin(position) sp: vec4f) -> @location(0) vec4f {
  let uv = sp.xy / F.screen.xy;
  let y = 1.0 - uv.y;
  var c = mix(vec3f(0.012, 0.016, 0.032), vec3f(0.043, 0.062, 0.105), pow(y, 1.35));
  let gpos = vec2f(0.42, 0.58);
  let g = exp(-dot(uv - gpos, uv - gpos) * 5.5);
  let sceneTint = mix(vec3f(0.10, 0.055, 0.10), vec3f(0.035, 0.10, 0.13), F.params.y);
  c += sceneTint * g * 0.9;
  let g2 = exp(-dot(uv - vec2f(0.85, 0.25), uv - vec2f(0.85, 0.25)) * 9.0);
  c += vec3f(0.07, 0.05, 0.03) * g2 * 0.5;
  // 细微扫描线纹理
  c *= 0.97 + 0.03 * sin(sp.y * 1.7);
  return vec4f(c, 1.0);
}
`;

SH.splat = SH.frame + `
struct Particle { pos: vec4f, vel: vec4f };
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<uniform> SP: vec4f; // x: 半径 y: 亮度 z: 未用 w: 未用
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) cv: vec3f,
  @location(2) rad: f32,
  @location(3) foam: f32,
  @location(4) dens: f32
};
@vertex fn vsSplat(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let p = parts[ii];
  let cv = (F.view * vec4f(p.pos.xyz, 1.0)).xyz;
  let spray = 1.0 - smoothstep(0.28, 0.55, p.vel.w);
  let R = SP.x * mix(1.0, 0.62, spray);
  let c = corners[vi];
  var o: VO;
  let vp = cv + vec3f(c.x * R, c.y * R, 0.0);
  o.pos = F.proj * vec4f(vp, 1.0);
  o.uv = c; o.cv = cv; o.rad = R; o.foam = p.pos.w; o.dens = p.vel.w;
  return o;
}
struct FO {
  @builtin(frag_depth) depth: f32,
  @location(0) thick: vec4f
};
@fragment fn fsSplat(i: VO) -> FO {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let zoff = sqrt(1.0 - r2) * i.rad;
  let vp = vec3f(i.cv.x + i.uv.x * i.rad, i.cv.y + i.uv.y * i.rad, i.cv.z + zoff);
  var o: FO;
  let cp = F.proj * vec4f(vp, 1.0);
  o.depth = cp.z / cp.w;
  let w = (1.0 - r2);
  o.thick = vec4f(w * 0.030, w * i.foam * 0.05, w * 0.030, w);
  return o;
}
`;

SH.blur = SH.frame + SH.fullscreenVS + `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var srcDepth: texture_depth_2d;
@group(0) @binding(2) var srcFloat: texture_2d<f32>;
@group(0) @binding(3) var<uniform> BP: vec4f; // xy: 方向(像素) z: 半径 w: 0=读深度 1=读float
fn readD(px: vec2i) -> f32 {
  let dim = vec2i(textureDimensions(srcFloat));
  let p = clamp(px, vec2i(0), dim - vec2i(1));
  if (BP.w < 0.5) {
    let ndc = textureLoad(srcDepth, p, 0);
    if (ndc >= 0.99999) { return 1e6; }
    return F.proj[3][2] / (ndc + F.proj[2][2]);
  } else {
    return textureLoad(srcFloat, p, 0).r;
  }
}
@fragment fn fsBlur(@builtin(position) sp: vec4f) -> @location(0) vec4f {
  let px = vec2i(sp.xy);
  let d0 = readD(px);
  if (d0 > 1e5) { return vec4f(1e6, 0.0, 0.0, 0.0); }
  let dir = vec2i(BP.xy);
  let rad = i32(BP.z);
  var sum = 0.0; var wsum = 0.0;
  let sigS = f32(rad) * 0.55;
  let sigD = 0.055;
  for (var k = -8; k <= 8; k++) {
    if (abs(k) > rad) { continue; }
    let d = readD(px + dir * k);
    if (d > 1e5) { continue; }
    let ws = exp(-f32(k * k) / (2.0 * sigS * sigS));
    let wd = exp(-abs(d - d0) / sigD);
    let w = ws * wd;
    sum += d * w; wsum += w;
  }
  let res = select(d0, sum / wsum, wsum > 0.0);
  return vec4f(res, 0.0, 0.0, 0.0);
}
`;

SH.waterComposite = SH.frame + SH.fullscreenVS + `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var sceneSmp: sampler;
@group(0) @binding(3) var blurTex: texture_2d<f32>;
@group(0) @binding(4) var thickTex: texture_2d<f32>;
` + SH.common + `
struct FO { @builtin(frag_depth) depth: f32, @location(0) color: vec4f };
fn viewRay(uv: vec2f) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let tf = 1.0 / F.proj[1][1];
  return vec3f(ndc.x * tf * (F.screen.x / F.screen.y), ndc.y * tf, -1.0);
}
fn posAt(uv: vec2f, d: f32) -> vec3f { return viewRay(uv) * d; }
@fragment fn fsWater(@builtin(position) sp: vec4f) -> FO {
  let uv = sp.xy / F.screen.xy;
  let px = vec2i(sp.xy);
  let d = textureLoad(blurTex, px, 0).r;
  var o: FO;
  o.depth = 1.0;
  o.color = vec4f(0.0);
  if (d > 1e5) { discard; }
  let tex = 1.0 / F.screen.xy;
  let dx1 = textureLoad(blurTex, px + vec2i(1, 0), 0).r;
  let dx0 = textureLoad(blurTex, px - vec2i(1, 0), 0).r;
  let dy1 = textureLoad(blurTex, px + vec2i(0, 1), 0).r;
  let dy0 = textureLoad(blurTex, px - vec2i(0, 1), 0).r;
  let pxr = select(px + vec2i(1,0), px, dx1 > 1e5 || abs(dx1 - d) > 0.16);
  let pxl = select(px - vec2i(1,0), px, dx0 > 1e5 || abs(dx0 - d) > 0.16);
  let pyu = select(px + vec2i(0,1), px, dy1 > 1e5 || abs(dy1 - d) > 0.16);
  let pyd = select(px - vec2i(0,1), px, dy0 > 1e5 || abs(dy0 - d) > 0.16);
  let dr = textureLoad(blurTex, pxr, 0).r;
  let dl = textureLoad(blurTex, pxl, 0).r;
  let du = textureLoad(blurTex, pyu, 0).r;
  let dd = textureLoad(blurTex, pyd, 0).r;
  let Pr = posAt((vec2f(pxr) + 0.5) * tex, min(dr, d + 0.16));
  let Pl = posAt((vec2f(pxl) + 0.5) * tex, min(dl, d + 0.16));
  let Pu = posAt((vec2f(pyu) + 0.5) * tex, min(du, d + 0.16));
  let Pd = posAt((vec2f(pyd) + 0.5) * tex, min(dd, d + 0.16));
  var Nv = cross(Pr - Pl, Pu - Pd);
  if (dot(Nv, Nv) < 1e-12) { Nv = vec3f(0.0, 0.0, 1.0); }
  Nv = normalize(Nv);
  if (Nv.z < 0.0) { Nv = -Nv; }
  let Pv = posAt(uv, d);
  let Pw = (F.invView * vec4f(Pv, 1.0)).xyz;
  let Nw = normalize((F.invView * vec4f(Nv, 0.0)).xyz);
  let V = normalize(F.camPos.xyz - Pw);
  let th = textureSampleLevel(thickTex, sceneSmp, uv, 0.0);
  let thickness = th.r;
  let foam = clamp(th.g * 6.0, 0.0, 1.0);
  let fres = 0.022 + 0.978 * pow(1.0 - max(dot(Nw, V), 0.0), 5.0);
  let R = reflect(-V, Nw);
  var refl = envColor(R) * 1.25;
  let L = F.lightDir.xyz;
  refl += F.lightColor.rgb * pow(max(dot(R, L), 0.0), 260.0) * 3.2;
  refl += F.rimColor.rgb * pow(max(dot(R, F.rimDir.xyz), 0.0), 90.0) * 0.9;
  let uvR = uv + vec2f(Nv.x, -Nv.y) * 0.055 * clamp(thickness * 3.0, 0.15, 1.0);
  let refr = textureSampleLevel(sceneTex, sceneSmp, clamp(uvR, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  let absorb = exp(-thickness * vec3f(2.6, 1.25, 0.85));
  let scatter = vec3f(0.10, 0.34, 0.42) * (1.0 - absorb) * 0.55;
  var water = refr * absorb * vec3f(0.80, 0.93, 0.99) + scatter;
  // 水下焦散光斑透射
  water += F.lightColor.rgb * causticPattern(Pw.xz * 1.6, F.params.x) * 0.06 * clamp(thickness * 2.0, 0.0, 1.0);
  var c = mix(water, refl, clamp(fres, 0.0, 1.0));
  c = mix(c, vec3f(0.92, 0.96, 1.0) * (0.55 + 0.45 * max(dot(Nw, L), 0.0)), foam * 0.8);
  let alpha = clamp(thickness * 16.0, 0.0, 1.0) * 0.965;
  o.color = vec4f(c, alpha);
  let ndcZ = F.proj[3][2] / d - F.proj[2][2];
  o.depth = clamp(ndcZ, 0.0, 1.0);
  return o;
}
`;

SH.foam = SH.frame + `
struct Particle { pos: vec4f, vel: vec4f };
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;
@group(0) @binding(2) var<uniform> SP: vec4f;
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) foam: f32,
  @location(2) dens: f32,
  @location(3) spd: f32
};
@vertex fn vsFoam(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
  let p = parts[ii];
  let cv = (F.view * vec4f(p.pos.xyz, 1.0)).xyz;
  let spray = 1.0 - smoothstep(0.25, 0.55, p.vel.w);
  let R = SP.x * (1.15 + spray * 0.5 + p.pos.w * 0.9);
  let c = corners[vi];
  var o: VO;
  o.pos = F.proj * vec4f(cv + vec3f(c.x * R, c.y * R, 0.0), 1.0);
  o.uv = c; o.foam = p.pos.w; o.dens = p.vel.w; o.spd = length(p.vel.xyz);
  return o;
}
@fragment fn fsFoam(i: VO) -> @location(0) vec4f {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let soft = smoothstep(1.0, 0.25, r2);
  let spray = 1.0 - smoothstep(0.25, 0.55, i.dens);
  var a = i.foam * soft * 0.85;
  var c = vec3f(0.94, 0.97, 1.0);
  if (spray > 0.4) {
    a = max(a, spray * soft * 0.5);
    c = mix(c, vec3f(0.82, 0.93, 1.0), 0.4);
  }
  if (a < 0.015) { discard; }
  return vec4f(c, a);
}
`;

SH.post = SH.frame + SH.fullscreenVS + `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
@fragment fn fsPost(@builtin(position) sp: vec4f) -> @location(0) vec4f {
  let uv = sp.xy / F.screen.xy;
  var c = textureSampleLevel(src, smp, uv, 0.0).rgb;
  c *= F.params.z;
  c = aces(c);
  c = pow(c, vec3f(1.0 / 2.2));
  let q = uv - 0.5;
  let vig = 1.0 - dot(q, q) * 0.55;
  c *= vig;
  let gr = fract(sin(dot(sp.xy + F.params.x * 60.0, vec2f(12.9898, 78.233))) * 43758.5453);
  c += (gr - 0.5) * 0.014;
  return vec4f(c, 1.0);
}
`;
window.SH = SH;
