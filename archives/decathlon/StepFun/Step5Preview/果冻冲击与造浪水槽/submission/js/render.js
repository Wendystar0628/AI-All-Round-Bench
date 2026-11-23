window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  const U = APP.util;

  let device = null, ctx = null, canvas = null, canvasFormat = 'bgra8unorm';
  let W = 2, H = 2;
  let colorTex = null, depthTex = null, shadowTex = null, shadowSampler = null, shadowSize = 2048;
  let frameUni = null, objUni = null, shadowUni = null, waterUni = null, compUni = null;
  const frameData = new Float32Array(96);
  const objData = new Float32Array(64 * 240);
  const shadowData = new Float32Array(16);
  const waterData = new Float32Array(32);
  const compData = new ArrayBuffer(16);
  const compF = new Float32Array(compData);
  const FLOATS_PER_OBJ = 64;
  const OBJ_STRIDE = FLOATS_PER_OBJ * 4;
  const MAX_OBJ = 240;
  let objCount = 0;
  let densityView = null, densityDummyView = null;

  const queues = { shadow: [], opaque: [], jelly: [], blend: [], sky: [] };
  let instQueue = [], sprayQueue = [], waterReq = null;
  const meshes = {};
  const pipelines = {};
  const layouts = {};

  const WGSL_COMMON = `
struct FrameU {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  ambTop: vec4<f32>,
  ambBottom: vec4<f32>,
  shadowVP: mat4x4<f32>,
  misc: vec4<f32>,
  misc2: vec4<f32>,
  misc3: vec4<f32>,
  misc4: vec4<f32>,
};
@group(0) @binding(0) var<uniform> frame: FrameU;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSamp: sampler_comparison;
@group(0) @binding(4) var denTex: texture_3d<f32>;

struct ObjU {
  model: mat4x4<f32>,
  normalM: mat4x4<f32>,
  baseColor: vec4<f32>,
  params: vec4<f32>,
  params2: vec4<f32>,
};
@group(0) @binding(1) var<uniform> obj: ObjU;

fn envColor(d: vec3<f32>) -> vec3<f32> {
  let t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3<f32>(0.05, 0.055, 0.07), vec3<f32>(0.30, 0.40, 0.58), pow(t, 1.1));
  c = mix(c, vec3<f32>(0.09, 0.11, 0.15), clamp(-d.y, 0.0, 1.0));
  let sd = normalize(frame.lightDir.xyz);
  let s = max(dot(d, sd), 0.0);
  c += vec3<f32>(1.0, 0.94, 0.82) * pow(s, 900.0) * 6.0;
  c += vec3<f32>(1.0, 0.95, 0.85) * pow(s, 24.0) * 0.22;
  let bx = abs(dot(d, normalize(vec3<f32>(0.75, 0.5, 0.45))));
  c += vec3<f32>(0.9, 0.93, 1.0) * pow(max(1.0 - bx, 0.0), 14.0) * 0.5;
  return c;
}
fn ggxD(ndh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = (ndh * ndh) * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * d * d, 1e-7);
}
fn smithG(nv: f32, nl: f32, a: f32) -> f32 {
  let k = a * 0.5;
  let gv = nv / (nv * (1.0 - k) + k);
  let gl = nl / (nl * (1.0 - k) + k);
  return gv * gl;
}
fn fres(vh: f32, f0: vec3<f32>) -> vec3<f32> { return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - clamp(vh, 0.0, 1.0), 5.0); }
fn shadowFactor(wp: vec3<f32>, ndl: f32) -> f32 {
  let lp = frame.shadowVP * vec4<f32>(wp, 1.0);
  if (lp.w <= 0.0) { return 1.0; }
  var uv = lp.xy / lp.w * 0.5 + vec2<f32>(0.5);
  uv.y = 1.0 - uv.y;
  if (uv.x < 0.004 || uv.x > 0.996 || uv.y < 0.004 || uv.y > 0.996) { return 1.0; }
  let refD = lp.z / lp.w + frame.misc.x * 2.0;
  let texel = frame.misc.y;
  var s = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      s = s + textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2<f32>(f32(x), f32(y)) * texel, refD);
    }
  }
  s = s / 9.0;
  let slope = clamp(1.0 - ndl, 0.0, 1.0);
  return mix(1.0, s, frame.misc.z * (1.0 - slope * 0.5));
}
fn bit0(f: f32) -> bool { return f - 2.0 * floor(f / 2.0) >= 1.0; }
fn bit1(f: f32) -> bool { return floor(f / 2.0) - 2.0 * floor(f / 4.0) >= 1.0; }
fn bit2(f: f32) -> bool { return floor(f / 4.0) - 2.0 * floor(f / 8.0) >= 1.0; }
fn bit3(f: f32) -> bool { return floor(f / 8.0) - 2.0 * floor(f / 16.0) >= 1.0; }
fn denAt(p: vec3<f32>) -> f32 {
  let org = frame.misc3.xyz;
  let h = frame.misc3.w;
  let g = (p - org) / h;
  let i0 = vec3<i32>(floor(g));
  let f = g - vec3<f32>(i0);
  let dims = vec3<i32>(i32(frame.misc4.x), i32(frame.misc4.y), i32(frame.misc4.z));
  var acc = 0.0;
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let ii = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        let w = vec3<f32>(select(1.0 - f.x, f.x, dx > 0), select(1.0 - f.y, f.y, dy > 0), select(1.0 - f.z, f.z, dz > 0));
        acc = acc + w.x * w.y * w.z * textureLoad(denTex, ii, 0).r;
      }
    }
  }
  return acc;
}
`;

  const VS_STD = `
struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>) -> VOut {
  var out: VOut;
  let wp = obj.model * vec4<f32>(pos, 1.0);
  out.clip = frame.viewProj * wp;
  out.wpos = wp.xyz;
  out.nrm = normalize((obj.normalM * vec4<f32>(nrm, 0.0)).xyz);
  out.uv = uv;
  return out;
}`;

  const FS_STD = `
@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
  if (bit3(obj.params.w)) {
    let d = normalize(in.wpos - frame.camPos.xyz);
    return vec4<f32>(envColor(d), 1.0);
  }
  let N0 = normalize(in.nrm);
  let V = normalize(frame.camPos.xyz - in.wpos);
  let L = normalize(frame.lightDir.xyz);
  let base = obj.baseColor;
  var metallic = obj.params.x;
  var roughness = clamp(obj.params.y, 0.045, 1.0);
  var alpha = base.a;
  let flags = obj.params.w;
  var col = vec3<f32>(0.0);
  let amb = mix(frame.ambBottom.rgb, frame.ambTop.rgb, clamp(N0.y * 0.5 + 0.5, 0.0, 1.0));
  var F0 = mix(vec3<f32>(0.04), base.rgb, metallic);
  if (bit0(flags)) {
    let fres = pow(1.0 - clamp(abs(dot(N0, V)), 0.0, 1.0), 5.0);
    alpha = clamp(0.05 + fres * 0.95, 0.0, 1.0) * base.a;
    let R = reflect(-V, N0);
    col = envColor(R) * (0.5 + fres * 1.5) + base.rgb * 0.18;
    metallic = 1.0; roughness = 0.05;
  } else {
    let ndl = max(dot(N0, L), 0.0);
    let H = normalize(L + V);
    let ndh = max(dot(N0, H), 1e-5);
    let nv = max(dot(N0, V), 1e-5);
    let sh = shadowFactor(in.wpos, ndl);
    let diff = base.rgb * (1.0 - metallic);
    col = diff * frame.lightColor.rgb * frame.lightDir.w * ndl * sh;
    let spec = ggxD(ndh, roughness) * smithG(nv, ndl, roughness) * fres(max(dot(H, V), 0.0), F0);
    col = col + spec * frame.lightColor.rgb * frame.lightDir.w * ndl * sh;
    col = col + diff * amb;
    let R = reflect(-V, N0);
    let env = mix(envColor(R), amb, roughness * 0.85);
    col = col + env * fres(nv, F0);
    if (bit1(flags)) {
      if (frame.misc2.w > -100.0) {
        let sy = i32(clamp((frame.misc2.w - frame.misc3.y) / frame.misc3.w, 1.0, f32(frame.misc4.y) - 2.0));
        let gx = i32(floor((in.wpos.x - frame.misc3.x) / frame.misc3.w));
        let gz = i32(floor((in.wpos.z - frame.misc3.z) / frame.misc3.w));
        if (gx > 0 && gx < i32(frame.misc4.x) - 1 && gz > 0 && gz < i32(frame.misc4.z) - 1) {
          let c0 = textureLoad(denTex, vec3<i32>(gx, sy, gz), 0).r;
          let cx = textureLoad(denTex, vec3<i32>(gx + 1, sy, gz), 0).r + textureLoad(denTex, vec3<i32>(gx - 1, sy, gz), 0).r;
          let cz = textureLoad(denTex, vec3<i32>(gx, sy, gz + 1), 0).r + textureLoad(denTex, vec3<i32>(gx, sy, gz - 1), 0).r;
          let lap = (cx + cz - 4.0 * c0) / max(frame.misc4.w, 0.001);
          col = col * clamp(1.0 - lap * 1.4, 0.5, 1.7);
          col = col + vec3<f32>(0.04, 0.11, 0.15) * clamp(1.0 - (in.wpos.y - frame.misc3.y) * 0.5, 0.0, 1.0);
        }
      }
    }
  }
  col = col + base.rgb * obj.params2.x;
  return vec4<f32>(col, alpha);
}`;

  const VS_JELLY = `
struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos: vec3<f32>,
  @location(1) nrm: vec3<f32>,
};
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>) -> VOut {
  var out: VOut;
  let wp = obj.model * vec4<f32>(pos, 1.0);
  out.clip = frame.viewProj * wp;
  out.wpos = wp.xyz;
  out.nrm = normalize((obj.normalM * vec4<f32>(nrm, 0.0)).xyz);
  return out;
}`;

  const FS_JELLY_FRONT = `
@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
  let N = normalize(in.nrm);
  let V = normalize(frame.camPos.xyz - in.wpos);
  let L = normalize(frame.lightDir.xyz);
  let base = obj.baseColor;
  let ndl = max(dot(N, L), 0.0);
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let rim = pow(1.0 - ndv, 3.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), 80.0) * 0.6;
  let sh = shadowFactor(in.wpos, ndl);
  var col = base.rgb * (0.28 + 0.8 * ndl * sh);
  col = col + vec3<f32>(0.85, 0.92, 1.0) * rim * 0.6;
  col = col + vec3<f32>(1.0) * spec * sh;
  let back = max(dot(-N, L), 0.0);
  col = col + base.rgb * back * 0.4;
  let alpha = clamp(0.30 + rim * 0.45 + ndl * 0.12, 0.0, 1.0) * base.a;
  return vec4<f32>(col, alpha);
}`;

  const FS_JELLY_BACK = `
@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
  let N = normalize(in.nrm);
  let V = normalize(frame.camPos.xyz - in.wpos);
  let L = normalize(frame.lightDir.xyz);
  let base = obj.baseColor;
  let ndl = max(dot(-N, L), 0.0);
  let thin = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.0);
  var col = base.rgb * (0.08 + 0.5 * ndl) * (0.6 + thin * 0.9);
  col = col + base.rgb * 0.22;
  let alpha = (0.18 + thin * 0.3) * base.a;
  return vec4<f32>(col, alpha);
}`;

  const VS_INST = `
struct BallData {
  pos: vec4<f32>,
  vel: vec4<f32>,
  color: vec4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(5) var<storage, read> balls: array<BallData>;
struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) bcol: vec4<f32>,
  @location(3) bpar: vec4<f32>,
};
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @builtin(instance_index) ii: u32) -> VOut {
  var out: VOut;
  let b = balls[ii];
  let wp = vec4<f32>(b.pos.xyz + pos * b.params.x, 1.0);
  out.clip = frame.viewProj * wp;
  out.wpos = wp.xyz;
  out.nrm = nrm;
  out.bcol = b.color;
  out.bpar = b.params;
  return out;
}`;

  const FS_INST = `
@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
  let N = normalize(in.nrm);
  let V = normalize(frame.camPos.xyz - in.wpos);
  let L = normalize(frame.lightDir.xyz);
  let base = in.bcol;
  var metallic = in.bpar.y;
  var roughness = clamp(in.bpar.z, 0.045, 1.0);
  var alpha = base.a;
  let sub = clamp(in.bpar.w, 0.0, 1.0);
  if (sub > 0.01) {
    alpha = mix(alpha, 0.68, sub);
    roughness = mix(roughness, 0.5, sub);
  }
  var F0 = mix(vec3<f32>(0.04), base.rgb, metallic);
  let ndl = max(dot(N, L), 0.0);
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 1e-5);
  let nv = max(dot(N, V), 1e-5);
  let sh = shadowFactor(in.wpos, ndl);
  let diff = base.rgb * (1.0 - metallic);
  var col = diff * frame.lightColor.rgb * frame.lightDir.w * ndl * sh;
  let spec = ggxD(ndh, roughness) * smithG(nv, ndl, roughness) * fres(max(dot(H, V), 0.0), F0);
  col = col + spec * frame.lightColor.rgb * frame.lightDir.w * ndl * sh;
  let amb = mix(frame.ambBottom.rgb, frame.ambTop.rgb, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  col = col + diff * amb;
  let R = reflect(-V, N);
  let env = mix(envColor(R), amb, roughness * 0.85);
  col = col + env * fres(nv, F0);
  if (sub > 0.01) {
    col = mix(col, col * vec3<f32>(0.5, 0.85, 1.0) + vec3<f32>(0.015, 0.05, 0.07), sub * 0.85);
  }
  return vec4<f32>(col, alpha);
}`;

  const VS_SPRAY = `
struct POut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) amt: f32,
  @location(2) spd: f32,
};
@group(0) @binding(5) var<storage, read> ppos: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> pvel: array<vec4<f32>>;
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> POut {
  var out: POut;
  let p = ppos[ii];
  let v = pvel[ii];
  out.amt = v.w;
  out.spd = length(v.xyz);
  var c = vec2<f32>(0.0);
  if (vi == 0u) { c = vec2<f32>(-1.0, -1.0); }
  if (vi == 1u) { c = vec2<f32>(1.0, -1.0); }
  if (vi == 2u) { c = vec2<f32>(-1.0, 1.0); }
  if (vi == 3u) { c = vec2<f32>(1.0, -1.0); }
  if (vi == 4u) { c = vec2<f32>(-1.0, 1.0); }
  if (vi == 5u) { c = vec2<f32>(1.0, 1.0); }
  let w = frame.viewProj * vec4<f32>(p.xyz, 1.0);
  let sz = p.w * frame.misc4.x / max(w.w, 0.06);
  out.clip = vec4<f32>(w.xy + c * sz, w.z, w.w);
  out.uv = c;
  return out;
}`;

  const FS_SPRAY = `
@fragment fn fs(in: POut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }
  let a = pow(1.0 - r, 1.7) * clamp(in.amt, 0.0, 1.0);
  let t = clamp(in.spd * 0.3, 0.0, 1.0);
  var col = mix(vec3<f32>(0.72, 0.86, 0.96), vec3<f32>(1.0), t);
  col = col * (0.5 + 0.65 * t);
  return vec4<f32>(col * a, a);
}`;

  const VS_FULL = `
struct FOut { @builtin(position) clip: vec4<f32>, @location(0) ndc: vec2<f32> }
@vertex fn vs(@builtin(vertex_index) vi: u32) -> FOut {
  var out: FOut;
  var p = vec2<f32>(0.0);
  if (vi == 0u) { p = vec2<f32>(-1.0, -1.0); }
  if (vi == 1u) { p = vec2<f32>(3.0, -1.0); }
  if (vi == 2u) { p = vec2<f32>(-1.0, 3.0); }
  out.clip = vec4<f32>(p, 1.0, 1.0);
  out.ndc = p;
  return out;
}`;

  const FS_WATER = `
struct WU {
  boxMin: vec4<f32>,
  boxMax: vec4<f32>,
  shallow: vec4<f32>,
  deep: vec4<f32>,
  params: vec4<f32>,
  params2: vec4<f32>,
};
@group(0) @binding(1) var<uniform> wu: WU;
@group(0) @binding(7) var sceneCol: texture_2d<f32>;
@group(0) @binding(8) var sceneSamp: sampler;
@group(0) @binding(9) var sceneDep: texture_depth_2d;
struct WOut {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};
fn sD(p: vec3<f32>) -> f32 {
  let org = frame.misc3.xyz;
  let h = frame.misc3.w;
  let g = (p - org) / h;
  let i0 = vec3<i32>(floor(g));
  let f = g - vec3<f32>(i0);
  let dims = vec3<i32>(i32(frame.misc4.x), i32(frame.misc4.y), i32(frame.misc4.z));
  var acc = 0.0;
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let ii = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        let w = vec3<f32>(select(1.0 - f.x, f.x, dx > 0), select(1.0 - f.y, f.y, dy > 0), select(1.0 - f.z, f.z, dz > 0));
        acc = acc + w.x * w.y * w.z * textureLoad(denTex, ii, 0).r;
      }
    }
  }
  return acc;
}
fn sF(p: vec3<f32>) -> f32 {
  let org = frame.misc3.xyz;
  let h = frame.misc3.w;
  let g = (p - org) / h;
  let i0 = vec3<i32>(floor(g));
  let f = g - vec3<f32>(i0);
  let dims = vec3<i32>(i32(frame.misc4.x), i32(frame.misc4.y), i32(frame.misc4.z));
  var acc = 0.0;
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let ii = clamp(i0 + vec3<i32>(dx, dy, dz), vec3<i32>(0), dims - vec3<i32>(1));
        let w = vec3<f32>(select(1.0 - f.x, f.x, dx > 0), select(1.0 - f.y, f.y, dy > 0), select(1.0 - f.z, f.z, dz > 0));
        acc = acc + w.x * w.y * w.z * textureLoad(denTex, ii, 0).g;
      }
    }
  }
  return acc;
}
@fragment fn fs(@location(0) ndc: vec2<f32>) -> WOut {
  var out: WOut;
  let p1 = frame.invViewProj * vec4<f32>(ndc, -1.0, 1.0);
  let p2 = frame.invViewProj * vec4<f32>(ndc, 1.0, 1.0);
  let ro = p1.xyz / p1.w;
  let rd = normalize(p2.xyz / p2.w - ro);
  var uv = ndc * 0.5 + vec2<f32>(0.5);
  uv.y = 1.0 - uv.y;
  let tminv = 1.0 / rd;
  let t1v = (wu.boxMin.xyz - ro) * tminv;
  let t2v = (wu.boxMax.xyz - ro) * tminv;
  let tlo = min(t1v, t2v);
  let thi = max(t1v, t2v);
  let tnear = max(max(tlo.x, tlo.y), tlo.z);
  let tfar = min(min(thi.x, thi.y), thi.z);
  if (tfar < tnear || tfar < 0.0) { discard; }
  let start = max(tnear, 0.0);
  let h = frame.misc3.w;
  let stepLen = h * wu.params.y;
  let nsteps = i32(clamp((tfar - start) / stepLen, 0.0, 200.0));
  let thr = wu.params.x;
  var sprayA = 0.0;
  var sprayC = vec3<f32>(0.0);
  var surfT = -1.0;
  var surfP = vec3<f32>(0.0);
  var surfN = vec3<f32>(0.0, 1.0, 0.0);
  var i = 0;
  loop {
    if (i > nsteps) { break; }
    let t = start + (f32(i) + 0.5) * stepLen;
    let p = ro + rd * t;
    let d = sD(p);
    if (d <= 0.0001) { i = i + 1; continue; }
    if (d < thr) {
      let fa = clamp(d / max(thr, 0.0001), 0.0, 1.0);
      let fm = sF(p);
      let a = fa * 0.5 * (0.45 + fm);
      sprayA = sprayA + a * stepLen / h * 0.5;
      sprayC = sprayC + mix(vec3<f32>(0.72, 0.86, 0.95), vec3<f32>(1.0), clamp(fm * 1.5, 0.0, 1.0)) * a;
    } else {
      surfT = t;
      surfP = p;
      let e = h * 0.85;
      let gx = sD(p + vec3<f32>(e, 0.0, 0.0)) - sD(p - vec3<f32>(e, 0.0, 0.0));
      let gy = sD(p + vec3<f32>(0.0, e, 0.0)) - sD(p - vec3<f32>(0.0, e, 0.0));
      let gz = sD(p + vec3<f32>(0.0, 0.0, e)) - sD(p - vec3<f32>(0.0, 0.0, e));
      surfN = normalize(vec3<f32>(-gx, -max(gy, -0.4), -gz));
      break;
    }
    i = i + 1;
  }
  let sdi = vec2<i32>(clamp(vec2<i32>(uv * vec2<f32>(f32(frame.misc4.x), f32(frame.misc4.y))), vec2<i32>(0), vec2<i32>(i32(frame.misc4.x) - 1, i32(frame.misc4.y) - 1)));\n  let sd = textureLoad(sceneDep, sdi, 0);
  if (surfT < 0.0) {
    if (sprayA < 0.004) { discard; }
    let pt = ro + rd * (start + f32(nsteps) * stepLen);
    let cp = frame.viewProj * vec4<f32>(pt, 1.0);
    let dz = cp.z / cp.w;
    if (sd < dz - 0.0002) { discard; }
    out.depth = dz;
    let c = sprayC / max(sprayA, 0.001);
    out.color = vec4<f32>(c * sprayA, clamp(sprayA, 0.0, 1.0));
    return out;
  }
  let cp = frame.viewProj * vec4<f32>(surfP, 1.0);
  let dz = cp.z / cp.w;
  if (sd < dz - 0.0002) { discard; }
  out.depth = dz;
  let N = normalize(surfN);
  let V = -rd;
  let L = normalize(frame.lightDir.xyz);
  let fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0) * 0.92 + 0.05;
  let R = reflect(rd, N);
  let refl = envColor(R);
  let fmv = sF(surfP);
  var depthBelow = 0.0;
  var absorb = vec3<f32>(1.0);
  var inscatter = vec3<f32>(0.0);
  let absC = wu.params2.w;
  var j = 1;
  loop {
    if (j > 28) { break; }
    let t2 = surfT + f32(j) * stepLen * 1.15;
    if (t2 > tfar) { break; }
    let p2 = ro + rd * t2;
    if (sD(p2) < thr) { break; }
    depthBelow = depthBelow + stepLen * 1.15;
    absorb = exp(-absC * depthBelow * vec3<f32>(1.0, 0.35, 0.22));
    inscatter = inscatter + vec3<f32>(0.05, 0.18, 0.24) * absorb * stepLen;
    j = j + 1;
  }
  let thickness = max(depthBelow, h * 1.5);
  let refrOff = N.xz * thickness * wu.params.z * 0.05;
  let refrUv = clamp(uv + refrOff, vec2<f32>(0.002), vec2<f32>(0.998));
  var sceneC = textureSampleLevel(sceneCol, sceneSamp, refrUv, 0.0).rgb * absorb;
  let body = mix(wu.shallow.rgb, wu.deep.rgb, clamp(depthBelow * 1.5, 0.0, 1.0)) * (0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0));
  var waterC = mix(sceneC, body, clamp(wu.params2.y * (1.0 - exp(-thickness * 0.8)), 0.0, 1.0));
  waterC = waterC + inscatter * 0.6;
  waterC = waterC + refl * fres * wu.params2.z;
  let spec = pow(max(dot(reflect(-V, N), L), 0.0), 700.0) * 2.4;
  waterC = waterC + vec3<f32>(1.0, 0.97, 0.9) * spec;
  let foam = clamp(fmv * 1.25, 0.0, 1.0);
  waterC = mix(waterC, vec3<f32>(0.93, 0.96, 0.99), foam * 0.8);
  var alpha = clamp(0.60 + fres * 0.34 + foam * 0.45 + sprayA * 0.5, 0.0, 1.0);
  var outc = waterC;
  if (sprayA > 0.003) {
    outc = outc * (1.0 - sprayA * 0.55) + (sprayC / max(sprayA, 0.001)) * sprayA * 0.55;
    alpha = clamp(alpha + sprayA * 0.3, 0.0, 1.0);
  }
  out.color = vec4<f32>(outc, alpha);
  return out;
}`;

  const OBJU_STRUCT = `
struct ObjU {
  model: mat4x4<f32>,
  normalM: mat4x4<f32>,
  baseColor: vec4<f32>,
  params: vec4<f32>,
  params2: vec4<f32>,
};`;
  const VS_SHADOW_STD = `
@group(0) @binding(0) var<uniform> shVP: mat4x4<f32>;
@group(1) @binding(0) var<uniform> obj: ObjU;
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @location(2) uv: vec2<f32>) -> @builtin(position) vec4<f32> {
  return shVP * obj.model * vec4<f32>(pos, 1.0);
}`;
  const VS_SHADOW_JELLY = `
@group(0) @binding(0) var<uniform> shVP: mat4x4<f32>;
@group(1) @binding(0) var<uniform> obj: ObjU;
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>) -> @builtin(position) vec4<f32> {
  return shVP * obj.model * vec4<f32>(pos, 1.0);
}`;
  const VS_SHADOW_INST = `
struct BallData {
  pos: vec4<f32>,
  vel: vec4<f32>,
  color: vec4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> shVP: mat4x4<f32>;
@group(1) @binding(0) var<storage, read> balls: array<BallData>;
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nrm: vec3<f32>, @builtin(instance_index) ii: u32) -> @builtin(position) vec4<f32> {
  let b = balls[ii];
  return shVP * vec4<f32>(b.pos.xyz + pos * b.params.x, 1.0);
}`;

  const FS_COMPOSITE = `
@group(0) @binding(2) var<uniform> compU: vec4<f32>;
@group(0) @binding(0) var cTex: texture_2d<f32>;
@group(0) @binding(1) var cSamp: sampler;
fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}
@fragment fn fs(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  var uv = ndc * 0.5 + vec2<f32>(0.5);
  uv.y = 1.0 - uv.y;
  var c = textureSampleLevel(cTex, cSamp, uv, 0.0).rgb * compU.x;
  let vig = 1.0 - 0.14 * dot(uv - vec2<f32>(0.5), uv - vec2<f32>(0.5)) * 2.2;
  c = c * vig;
  c = aces(c);
  return vec4<f32>(pow(c, vec3<f32>(1.0 / 2.2)), 1.0);
}`;

  function makeMesh(pos, nrm, uv, idx) {
    const vb = device.createBuffer({ size: pos.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, pos);
    const nb = device.createBuffer({ size: nrm.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(nb, 0, nrm);
    let ub = null;
    if (uv) {
      ub = device.createBuffer({ size: uv.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(ub, 0, uv);
    }
    const ib = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, idx);
    return { vb, nb, ub, ib, nIdx: idx.length };
  }

  function createGeoms() {
    const segX = 28, segY = 20;
    {
      const sp = [], sn = [], su = [], si = [];
      for (let y = 0; y <= segY; y++) {
        const v = y / segY, phi = v * Math.PI;
        for (let x = 0; x <= segX; x++) {
          const u = x / segX, th = u * Math.PI * 2;
          const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
          sp.push(nx, ny, nz); sn.push(nx, ny, nz); su.push(u, 1 - v);
        }
      }
      for (let y = 0; y < segY; y++) for (let x = 0; x < segX; x++) {
        const a = y * (segX + 1) + x, b = a + segX + 1;
        si.push(a, b, a + 1, a + 1, b, b + 1);
      }
      meshes.sphere = makeMesh(new Float32Array(sp), new Float32Array(sn), new Float32Array(su), new Uint16Array(si));
    }
    {
      const p = [], n = [], u = [], idx = [];
      const faces = [
        { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
        { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
        { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
        { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
        { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
        { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
      ];
      for (const f of faces) {
        const base = p.length / 3;
        for (let k = 0; k < 4; k++) {
          p.push(f.v[k][0], f.v[k][1], f.v[k][2]);
          n.push(f.n[0], f.n[1], f.n[2]);
          u.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      meshes.box = makeMesh(new Float32Array(p), new Float32Array(n), new Float32Array(u), new Uint16Array(idx));
    }
    {
      const p = [], n = [], u = [], idx = [];
      const base = p.length / 3;
      p.push(-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5);
      for (let k = 0; k < 4; k++) { n.push(0, 1, 0); u.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      meshes.plane = makeMesh(new Float32Array(p), new Float32Array(n), new Float32Array(u), new Uint16Array(idx));
    }
  }

  async function init(cnv) {
    canvas = cnv;
    if (!navigator.gpu) throw new Error('no webgpu');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no adapter');
    device = await adapter.requestDevice({});
    ctx = canvas.getContext('webgpu');
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: canvasFormat, alphaMode: 'opaque' });

    frameUni = device.createBuffer({ size: 384, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    objUni = device.createBuffer({ size: OBJ_STRIDE * MAX_OBJ, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    compUni = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    shadowUni = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    waterUni = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const dummy = device.createTexture({ size: [1, 1, 1], dimension: '3d', format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: dummy }, new Float32Array([0, 0, 0, 1]), { bytesPerRow: 8 }, [1, 1, 1]);
    densityDummyView = dummy.createView();

    shadowTex = device.createTexture({ size: [shadowSize, shadowSize], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    shadowSampler = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

    createGeoms();

    const layoutStd = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: OBJ_STRIDE } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } },
      ],
    });
    const layoutInst = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    });
    const layoutSpray = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const layoutShadowFrame = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    const layoutShadowObj = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: OBJ_STRIDE } }],
    });
    const layoutShadowInst = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    const layoutWater = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float', viewDimension: '3d' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      ],
    });
    const layoutComposite = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    Object.assign(layouts, { layoutStd, layoutInst, layoutSpray, layoutShadowFrame, layoutShadowObj, layoutShadowInst, layoutWater, layoutComposite });

    const blendSTD = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const buf3 = [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
    ];
    const buf2 = [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
    ];
    const plStd = device.createPipelineLayout({ bindGroupLayouts: [layoutStd] });
    const plInst = device.createPipelineLayout({ bindGroupLayouts: [layoutInst] });
    const plSpray = device.createPipelineLayout({ bindGroupLayouts: [layoutSpray] });
    const plShadowA = device.createPipelineLayout({ bindGroupLayouts: [layoutShadowFrame, layoutShadowObj] });
    const plShadowB = device.createPipelineLayout({ bindGroupLayouts: [layoutShadowFrame, layoutShadowInst] });
    const plWater = device.createPipelineLayout({ bindGroupLayouts: [layoutWater] });
    const plComposite = device.createPipelineLayout({ bindGroupLayouts: [layoutComposite] });
    const mk = (name, code, layout, o) => {
      pipelines[name] = device.createRenderPipeline({
        layout,
        vertex: { module: device.createShaderModule({ code }), entryPoint: 'vs', buffers: o.bufs },
        fragment: o.frag === false ? undefined : { module: device.createShaderModule({ code }), entryPoint: 'fs', targets: [{ format: o.fmt || 'rgba16float', blend: o.blend ? blendSTD : undefined }] },
        primitive: { topology: o.topology || 'triangle-list', cullMode: o.cull || 'back' },
        depthStencil: o.noDepth ? undefined : { format: 'depth24plus', depthWriteEnabled: o.depthWrite !== false, depthCompare: o.depthCompare || 'less' },
      });
    };
    mk('opaque', WGSL_COMMON + VS_STD + FS_STD, plStd, { bufs: buf3 });
    mk('sky', WGSL_COMMON + VS_STD + FS_STD, plStd, { bufs: buf3, cull: 'front' });
    mk('glass', WGSL_COMMON + VS_STD + FS_STD, plStd, { bufs: buf3, blend: true });
    mk('jellyFront', WGSL_COMMON + VS_JELLY + FS_JELLY_FRONT, plStd, { bufs: buf2, blend: true, depthWrite: false });
    mk('jellyBack', WGSL_COMMON + VS_JELLY + FS_JELLY_BACK, plStd, { bufs: buf2, blend: true, depthWrite: false, cull: 'front' });
    mk('inst', WGSL_COMMON + VS_INST + FS_INST, plInst, { bufs: buf2, blend: true });
    mk('spray', WGSL_COMMON + VS_SPRAY + FS_SPRAY, plSpray, { bufs: [], blend: true, depthWrite: false });
    mk('water', WGSL_COMMON + VS_FULL + FS_WATER, plWater, { bufs: [], depthCompare: 'always' });
    mk('composite', VS_FULL + FS_COMPOSITE, plComposite, { bufs: [], noDepth: true, fmt: canvasFormat });
    mk('shadowStd', OBJU_STRUCT + VS_SHADOW_STD, plShadowA, { bufs: buf3, frag: false });
    mk('shadowJelly', OBJU_STRUCT + VS_SHADOW_JELLY, plShadowA, { bufs: buf2, frag: false });
    mk('instShadow', VS_SHADOW_INST, plShadowB, { bufs: buf2, frag: false });
    return true;
  }

  function resize(w, h, dpr) {
    W = Math.max(2, Math.floor(w * dpr));
    H = Math.max(2, Math.floor(h * dpr));
    canvas.width = W; canvas.height = H;
    if (colorTex) colorTex.destroy();
    if (depthTex) depthTex.destroy();
    colorTex = device.createTexture({ size: [W, H], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    depthTex = device.createTexture({ size: [W, H], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    instBGs.clear(); waterBG = null; compBG = null;
  }

  function writeObj(slot, p) {
    const o = slot * FLOATS_PER_OBJ;
    objData.set(p.model, o);
    objData.set(p.normalM || p.model, o + 16);
    objData[o + 32] = p.color[0]; objData[o + 33] = p.color[1]; objData[o + 34] = p.color[2]; objData[o + 35] = p.color[3];
    objData[o + 36] = p.metallic || 0; objData[o + 37] = p.roughness === undefined ? 0.5 : p.roughness;
    objData[o + 38] = p.alpha === undefined ? 1 : p.alpha; objData[o + 39] = p.flags || 0;
    objData[o + 40] = p.emissive || 0; objData[o + 41] = p.sss || 0; objData[o + 42] = p.tint || 0; objData[o + 43] = p.foam || 0;
  }
  function pushOpaque(mesh, p) {
    const slot = objCount++;
    writeObj(slot, p);
    queues.opaque.push({ mesh, slot });
    if (p.castShadow !== false) queues.shadow.push({ mesh, slot, kind: 'std' });
  }
  function pushSky(mesh, p) {
    const slot = objCount++;
    p.flags = (p.flags || 0) | 8;
    writeObj(slot, p);
    queues.sky.push({ mesh, slot });
  }
  function pushGlass(mesh, p) {
    const slot = objCount++;
    p.flags = (p.flags || 0) | 1;
    writeObj(slot, p);
    queues.blend.push({ mesh, slot });
  }
  function pushJelly(mesh, p) {
    const slot = objCount++;
    writeObj(slot, p);
    queues.jelly.push({ mesh, slot });
    if (p.castShadow !== false) queues.shadow.push({ mesh, slot, kind: 'jelly' });
  }
  function pushInstanced(mesh, count, buf) { instQueue.push({ mesh, count, buf }); }
  function pushSpray(count, posBuf, velBuf) { sprayQueue.push({ count, posBuf, velBuf }); }
  function setWater(req) { waterReq = req; }

  const _ortho = U.m4(), _view = U.m4(), _vp = U.m4();
  function begin(cam, light, shadowCfg, env) {
    objCount = 0;
    queues.shadow.length = 0; queues.opaque.length = 0; queues.jelly.length = 0; queues.blend.length = 0; queues.sky.length = 0;
    instQueue.length = 0; sprayQueue.length = 0;
    if (!cam.invViewProjCache) cam.invViewProjCache = U.m4();
    U.m4invert(cam.viewProj, cam.invViewProjCache);
    frameData.set(cam.viewProj, 0);
    frameData.set(cam.invViewProjCache, 16);
    frameData[32] = cam.pos.x; frameData[33] = cam.pos.y; frameData[34] = cam.pos.z; frameData[35] = W / H;
    frameData[36] = light.dir[0]; frameData[37] = light.dir[1]; frameData[38] = light.dir[2]; frameData[39] = light.intensity;
    frameData[40] = light.color[0]; frameData[41] = light.color[1]; frameData[42] = light.color[2]; frameData[43] = 0;
    frameData[44] = env.top[0]; frameData[45] = env.top[1]; frameData[46] = env.top[2]; frameData[47] = 0;
    frameData[48] = env.bottom[0]; frameData[49] = env.bottom[1]; frameData[50] = env.bottom[2]; frameData[51] = 0;
    const c = shadowCfg.center, r = shadowCfg.radius, d = light.dir;
    U.m4ortho(-r, r, -r, r, -r * 2.4, r * 2.4, _ortho);
    U.m4lookAt(c[0] - d[0] * r * 1.7, c[1] - d[1] * r * 1.7, c[2] - d[2] * r * 1.7, c[0], c[1], c[2], 0, 1, 0, _view);
    U.m4mul(_ortho, _view, _vp);
    frameData.set(_vp, 52);
    frameData[68] = 0.0018; frameData[69] = 1 / shadowSize; frameData[70] = shadowCfg.strength === undefined ? 1 : shadowCfg.strength; frameData[71] = env.time || 0;
    frameData[72] = env.exposure || 1.0; frameData[73] = cam.near; frameData[74] = cam.far; frameData[75] = env.waterLevel === undefined ? -999 : env.waterLevel;
    frameData[76] = env.gridOrigin ? env.gridOrigin[0] : 0;
    frameData[77] = env.gridOrigin ? env.gridOrigin[1] : 0;
    frameData[78] = env.gridOrigin ? env.gridOrigin[2] : 0;
    frameData[79] = env.cellH || 1;
    frameData[80] = env.gridDim ? env.gridDim[0] : 1;
    frameData[81] = env.gridDim ? env.gridDim[1] : 1;
    frameData[82] = env.gridDim ? env.gridDim[2] : 1;
    frameData[83] = env.restDensity || 1;
    frameData[84] = W; frameData[85] = H; frameData[86] = 1 / Math.tan(cam.fov * 0.5); frameData[87] = 0;
    device.queue.writeBuffer(frameUni, 0, frameData.buffer, 0, 384);
    compF[0] = env.exposure || 1.0;
    device.queue.writeBuffer(compUni, 0, compData, 0, 16);
    shadowData.set(_vp);
    device.queue.writeBuffer(shadowUni, 0, shadowData.buffer, 0, 64);
  }

  let shadowStdBG = null, shadowObjBG = null, instShadowBGs = new Map(), instBGs = new Map(), sprayBGs = new Map(), waterBG = null, compBG = null, compSamp = null, compViewW = 0;
  function present() {
    const enc = device.createCommandEncoder();
    if (objCount > 0) device.queue.writeBuffer(objUni, 0, objData.buffer, 0, OBJ_STRIDE * objCount);
    if (queues.shadow.length || instQueue.length) {
      const pass = enc.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowTex.createView(), depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' },
      });
      if (!shadowStdBG) shadowStdBG = device.createBindGroup({ layout: layouts.layoutShadowFrame, entries: [{ binding: 0, resource: { buffer: shadowUni } }] });
      pass.setBindGroup(0, shadowStdBG, []);
      if (!shadowObjBG) shadowObjBG = device.createBindGroup({ layout: layouts.layoutShadowObj, entries: [{ binding: 0, resource: { buffer: objUni, size: OBJ_STRIDE } }] });
      for (const d of queues.shadow) {
        pass.setPipeline(d.kind === 'std' ? pipelines.shadowStd : pipelines.shadowJelly);
        pass.setBindGroup(1, shadowObjBG, [d.slot * OBJ_STRIDE]);
        pass.setVertexBuffer(0, d.mesh.vb);
        pass.setVertexBuffer(1, d.mesh.nb);
        if (d.mesh.ub) pass.setVertexBuffer(2, d.mesh.ub);
        pass.setIndexBuffer(d.mesh.ib, 'uint16');
        pass.drawIndexed(d.mesh.nIdx);
      }
      for (const d of instQueue) {
        if (!instShadowBGs.has(d.buf)) instShadowBGs.set(d.buf, device.createBindGroup({ layout: layouts.layoutShadowInst, entries: [{ binding: 0, resource: { buffer: d.buf } }] }));
        pass.setPipeline(pipelines.instShadow);
        pass.setBindGroup(1, instShadowBGs.get(d.buf), []);
        pass.setVertexBuffer(0, d.mesh.vb);
        pass.setVertexBuffer(1, d.mesh.nb);
        pass.setIndexBuffer(d.mesh.ib, 'uint16');
        pass.drawIndexed(d.mesh.nIdx, d.count);
      }
      pass.end();
    }
    const cview = colorTex.createView(), dview = depthTex.createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: cview, loadOp: 'clear', clearValue: { r: 0.02, g: 0.025, b: 0.035, a: 1 }, storeOp: 'store' }],
      depthStencilAttachment: { view: dview, depthLoadOp: 'clear', depthClearValue: 1, depthStoreOp: 'store' },
    });
    APP.R._dbg = { op: queues.opaque.length, sh: queues.shadow.length, inst: instQueue.length, size: [W, H] };
    for (const d of queues.sky) {
      pass.setPipeline(pipelines.sky);
      pass.setBindGroup(0, stdObjBG(), [d.slot * OBJ_STRIDE]);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      if (d.mesh.ub) pass.setVertexBuffer(2, d.mesh.ub);
      pass.setIndexBuffer(d.mesh.ib, 'uint16');
      pass.drawIndexed(d.mesh.nIdx);
    }
    for (const d of queues.opaque) {
      pass.setPipeline(pipelines.opaque);
      pass.setBindGroup(0, stdObjBG(), [d.slot * OBJ_STRIDE]);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      if (d.mesh.ub) pass.setVertexBuffer(2, d.mesh.ub);
      pass.setIndexBuffer(d.mesh.ib, 'uint16');
      pass.drawIndexed(d.mesh.nIdx);
    }
    for (const d of queues.jelly) {
      pass.setPipeline(pipelines.jellyBack);
      pass.setBindGroup(0, stdObjBG(), [d.slot * OBJ_STRIDE]);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      pass.setIndexBuffer(d.mesh.ib, 'uint32');
      pass.drawIndexed(d.mesh.nIdx);
      pass.setPipeline(pipelines.jellyFront);
      pass.setBindGroup(0, stdObjBG(), [d.slot * OBJ_STRIDE]);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      pass.setIndexBuffer(d.mesh.ib, 'uint32');
      pass.drawIndexed(d.mesh.nIdx);
    }
    if (waterReq) {
      waterData.set(waterReq.boxMin); waterData.set(waterReq.boxMax, 4);
      waterData.set(waterReq.shallow, 8); waterData.set(waterReq.deep, 12);
      waterData[16] = waterReq.thr; waterData[17] = waterReq.stepScale; waterData[18] = waterReq.refract; waterData[19] = waterReq.foamAmt;
      waterData[20] = waterReq.restDensity; waterData[21] = waterReq.cellH; waterData[22] = waterReq.envAmt; waterData[23] = waterReq.absorb;
      device.queue.writeBuffer(waterUni, 0, waterData.buffer, 0, 128);
      const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      waterBG = device.createBindGroup({
        layout: layouts.layoutWater,
        entries: [
          { binding: 0, resource: { buffer: frameUni } },
          { binding: 1, resource: { buffer: waterUni } },
          { binding: 4, resource: densityView || densityDummyView },
          { binding: 7, resource: cview },
          { binding: 8, resource: samp },
          { binding: 9, resource: dview },
        ],
      });
      pass.setPipeline(pipelines.water);
      pass.setBindGroup(0, waterBG, []);
      pass.draw(3);
    }
    for (const d of instQueue) {
      if (!instBGs.has(d.buf)) instBGs.set(d.buf, device.createBindGroup({
        layout: layouts.layoutInst,
        entries: [
          { binding: 0, resource: { buffer: frameUni } },
          { binding: 2, resource: shadowTex.createView() },
          { binding: 3, resource: shadowSampler },
          { binding: 4, resource: densityView || densityDummyView },
          { binding: 5, resource: { buffer: d.buf } },
        ],
      }));
      pass.setPipeline(pipelines.inst);
      pass.setBindGroup(0, instBGs.get(d.buf), []);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      pass.setIndexBuffer(d.mesh.ib, 'uint16');
      pass.drawIndexed(d.mesh.nIdx, d.count);
    }
    for (const d of queues.blend) {
      pass.setPipeline(pipelines.glass);
      pass.setBindGroup(0, stdObjBG(), [d.slot * OBJ_STRIDE]);
      pass.setVertexBuffer(0, d.mesh.vb);
      pass.setVertexBuffer(1, d.mesh.nb);
      if (d.mesh.ub) pass.setVertexBuffer(2, d.mesh.ub);
      pass.setIndexBuffer(d.mesh.ib, 'uint16');
      pass.drawIndexed(d.mesh.nIdx);
    }
    for (const d of sprayQueue) {
      if (!sprayBGs.has(d.posBuf)) sprayBGs.set(d.posBuf, device.createBindGroup({
        layout: layouts.layoutSpray,
        entries: [
          { binding: 0, resource: { buffer: frameUni } },
          { binding: 5, resource: { buffer: d.posBuf } },
          { binding: 6, resource: { buffer: d.velBuf } },
        ],
      }));
      pass.setPipeline(pipelines.spray);
      pass.setBindGroup(0, sprayBGs.get(d.posBuf), []);
      pass.draw(6, d.count);
    }
    pass.end();
    const cpass = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }],
    });
    if (!compSamp) compSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    if (!compBG || compViewW !== W) {
      compBG = device.createBindGroup({ layout: layouts.layoutComposite, entries: [{ binding: 0, resource: cview }, { binding: 1, resource: compSamp }, { binding: 2, resource: { buffer: compUni } }] });
      compViewW = W;
    }
    cpass.setPipeline(pipelines.composite);
    cpass.setBindGroup(0, compBG, []);
    cpass.draw(3);
    cpass.end();
    device.queue.submit([enc.finish()]);
    waterReq = null;
  }

  let _stdBG = null;
  function stdObjBG() {
    if (!_stdBG) {
      _stdBG = device.createBindGroup({
        layout: layouts.layoutStd,
        entries: [
          { binding: 0, resource: { buffer: frameUni } },
          { binding: 1, resource: { buffer: objUni, size: OBJ_STRIDE } },
          { binding: 2, resource: shadowTex.createView() },
          { binding: 3, resource: shadowSampler },
          { binding: 4, resource: densityView || densityDummyView },
        ],
      });
    }
    return _stdBG;
  }

  function setDensityView(view) {
    densityView = view || null;
    _stdBG = null; instBGs.clear();
  }

  function createDynMesh(maxVerts, maxIdx) {
    const vb = device.createBuffer({ size: maxVerts * 12, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const nb = device.createBuffer({ size: maxVerts * 12, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const ib = device.createBuffer({ size: maxIdx * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    return { vb, nb, ib, nIdx: 0, maxIdx };
  }
  function updateDynMesh(mesh, positions, normals, indices) {
    device.queue.writeBuffer(mesh.vb, 0, positions);
    device.queue.writeBuffer(mesh.nb, 0, normals);
    device.queue.writeBuffer(mesh.ib, 0, indices);
    mesh.nIdx = indices.length;
  }

  APP.R = {
    init, resize, present, begin, pushOpaque, pushGlass, pushSky, pushJelly, pushInstanced, pushSpray, setWater, setDensityView,
    createDynMesh, updateDynMesh, makeMesh, meshes,
    device: () => device,
    size: () => [W, H],
    onDone: () => device.queue.onSubmittedWorkDone(),
    createBuffer: (size, usage) => device.createBuffer({ size, usage }),
    writeBuffer: (b, d) => device.queue.writeBuffer(b, 0, d),
    layouts: () => layouts,
  };
})();


















