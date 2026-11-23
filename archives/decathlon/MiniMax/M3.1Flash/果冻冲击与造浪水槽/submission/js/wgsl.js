/* wgsl.js — shared WGSL shader chunks (globals, environment, shadows, PBR, glass, blit). */
(function (global) {
  'use strict';

  const S = {};

  /* ---------- shared structs / bindings ---------- */
  S.globals = /* wgsl */`
struct Globals {
  view         : mat4x4f,
  proj         : mat4x4f,
  viewProj     : mat4x4f,
  invViewProj  : mat4x4f,
  lightViewProj: mat4x4f,
  camPos       : vec4f,
  sunDir       : vec4f,
  sunColor     : vec4f,
  skyTop       : vec4f,
  skyBot       : vec4f,
  misc         : vec4f,   // x time, y exposure, z sceneId, w waterLevel
  screen       : vec4f,   // w, h, 1/w, 1/h
  nearFar      : vec4f,   // near, far, tanHalfFov, aspect
  fx           : vec4f,   // x fogDensity, y shadowTexel, z foamTime, w refractStrength
};
@group(0) @binding(0) var<uniform> G : Globals;
`;

  S.inst = /* wgsl */`
struct Inst {
  model : mat4x4f,
  color : vec4f,   // rgb + alpha
  params: vec4f,   // x roughness, y metallic, z translucency, w emissive
};
@group(1) @binding(0) var<storage, read> insts : array<Inst>;
`;

  /* ---------- environment / lighting helpers ---------- */
  S.env = /* wgsl */`
fn envColor(d: vec3f) -> vec3f {
  let t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(G.skyBot.rgb, G.skyTop.rgb, smoothstep(0.0, 1.0, t));
  // large soft box light (upper left front)
  let key = normalize(vec3f(-0.42, 0.80, 0.42));
  c += vec3f(1.00, 0.96, 0.90) * pow(max(dot(d, key), 0.0), 10.0) * 0.60;
  c += vec3f(0.85, 0.90, 1.00) * pow(max(dot(d, key), 0.0), 2.5) * 0.10;
  // cool rim from the right rear
  let rim = normalize(vec3f(0.75, 0.22, -0.62));
  c += vec3f(0.35, 0.52, 0.72) * pow(max(dot(d, rim), 0.0), 5.0) * 0.35;
  // warm bounce from below
  c += vec3f(0.22, 0.14, 0.09) * pow(clamp(-d.y, 0.0, 1.0), 1.5) * 0.5;
  return c;
}

fn ambientIBL(n: vec3f) -> vec3f {
  let up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  let sky = mix(G.skyBot.rgb, G.skyTop.rgb, up);
  let key = normalize(vec3f(-0.42, 0.80, 0.42));
  return sky * 0.85 + G.sunColor.rgb * 0.10 * pow(max(dot(n, key), 0.0), 3.0);
}

fn fresnelSchlick(cosT: f32, F0: vec3f) -> vec3f {
  return F0 + (vec3f(1.0) - F0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
}

fn ggxSpec(N: vec3f, V: vec3f, L: vec3f, rough: f32, F0: vec3f) -> vec3f {
  let H = normalize(L + V);
  let a = clamp(rough * rough, 0.002, 1.0);
  let a2 = a * a;
  let NdH = max(dot(N, H), 0.0);
  let dd = NdH * NdH * (a2 - 1.0) + 1.0;
  let D = a2 / (3.14159265 * dd * dd);
  let NdV = max(dot(N, V), 1e-4);
  let NdL = max(dot(N, L), 0.0);
  let k = a * 0.5;
  let Gv = NdV / (NdV * (1.0 - k) + k);
  let Gl = NdL / (NdL * (1.0 - k) + k);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  return (D * Gv * Gl * F) / (4.0 * NdV * max(NdL, 1e-4)) * NdL;
}

fn applyFog(c: vec3f, wp: vec3f) -> vec3f {
  let d = length(wp - G.camPos.xyz);
  let f = 1.0 - exp(-G.fx.x * max(d - 1.2, 0.0));
  let fogCol = mix(G.skyBot.rgb, G.skyTop.rgb, 0.35);
  return mix(c, fogCol, clamp(f, 0.0, 0.85));
}
`;

  /* ---------- shadow map ---------- */
  S.shadow = /* wgsl */`
@group(2) @binding(0) var shadowTex  : texture_depth_2d;
@group(2) @binding(1) var shadowSamp : sampler_comparison;

fn shadowFactor(wp: vec3f, n: vec3f) -> f32 {
  let lp = G.lightViewProj * vec4f(wp, 1.0);
  let ndc = lp.xyz / max(lp.w, 1e-6);
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z > 1.0 || ndc.z < 0.0) {
    return 1.0;
  }
  let L = normalize(G.sunDir.xyz);
  let bias = max(0.0022 * (1.0 - dot(n, L)), 0.00035);
  let tx = G.fx.y;
  var s = 0.0;
  for (var i = -1; i <= 1; i = i + 1) {
    for (var j = -1; j <= 1; j = j + 1) {
      s = s + textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(i), f32(j)) * tx, ndc.z - bias);
    }
  }
  return s / 9.0;
}
`;

  /* ---------- opaque instanced pipeline ---------- */
  S.opaqueVS = /* wgsl */`
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) world  : vec3f,
  @location(1) normal : vec3f,
  @location(2) color  : vec4f,
  @location(3) params : vec4f,
  @location(4) local  : vec3f,
};

@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @builtin(instance_index) ii: u32) -> VSOut {
  let I = insts[ii];
  let wp = I.model * vec4f(inPos, 1.0);
  let nrm = normalize((I.model * vec4f(inNrm, 0.0)).xyz);
  var o: VSOut;
  o.pos = G.viewProj * wp;
  o.world = wp.xyz;
  o.normal = nrm;
  o.color = I.color;
  o.params = I.params;
  o.local = inPos;
  return o;
}
`;

  S.opaqueFS = /* wgsl */`
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(G.camPos.xyz - in.world);
  let L = normalize(G.sunDir.xyz);
  let rough = clamp(in.params.x, 0.03, 1.0);
  let metal = clamp(in.params.y, 0.0, 1.0);
  let albedo = in.color.rgb;
  let F0 = mix(vec3f(0.04), albedo, metal);
  let ndl = max(dot(N, L), 0.0);
  let sh = shadowFactor(in.world, N);

  let diffuse = albedo * (1.0 - metal) * ndl * sh;
  let spec = ggxSpec(N, V, L, rough, F0) * sh * G.sunColor.w;

  let R = reflect(-V, N);
  let env = mix(ambientIBL(N), envColor(R), clamp(1.0 - rough * 0.85, 0.0, 1.0));
  let fr = fresnelSchlick(max(dot(N, V), 0.0), F0);
  var col = (diffuse + albedo * (1.0 - metal) * ambientIBL(N) * 0.55) * G.sunColor.rgb;
  col = col + spec * G.sunColor.rgb + env * fr * (0.55 + 0.45 * (1.0 - rough));

  // subtle rim light to separate silhouettes from the background
  let rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  col = col + mix(G.skyTop.rgb, vec3f(0.5, 0.7, 1.0), 0.5) * rim * 0.35;

  col = applyFog(col, in.world);
  return vec4f(col * G.misc.y, in.color.a);
}
`;

  /* ---------- depth-only (shadow) pipeline ---------- */
  S.shadowVS = /* wgsl */`
@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  let I = insts[ii];
  return G.lightViewProj * (I.model * vec4f(inPos, 1.0));
}
`;

  /* ---------- glass panel ---------- */
  S.glassVS = /* wgsl */`
struct GVSOut {
  @builtin(position) pos : vec4f,
  @location(0) world  : vec3f,
  @location(1) normal : vec3f,
  @location(2) edge   : f32,
  @location(3) color  : vec4f,
  @location(4) params : vec4f,
};
@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @location(2) inEdge: f32,
      @builtin(instance_index) ii: u32) -> GVSOut {
  let I = insts[ii];
  let wp = I.model * vec4f(inPos, 1.0);
  var o: GVSOut;
  o.pos = G.viewProj * wp;
  o.world = wp.xyz;
  o.normal = normalize((I.model * vec4f(inNrm, 0.0)).xyz);
  o.edge = inEdge;
  o.color = I.color;
  o.params = I.params;
  return o;
}
`;

  S.glassFS = /* wgsl */`
@fragment
fn fs(in: GVSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(G.camPos.xyz - in.world);
  let L = normalize(G.sunDir.xyz);
  let ndv = max(dot(N, V), 0.0);
  let F0 = vec3f(0.04);
  let fres = fresnelSchlick(ndv, F0);
  let R = reflect(-V, N);
  let refl = envColor(R);
  let spec = ggxSpec(N, V, L, 0.06, F0) * G.sunColor.w;
  // bright glass edges
  let edgeGlow = pow(clamp(in.edge, 0.0, 1.0), 2.5);
  var col = refl * (0.10 + 0.90 * fres) + spec * G.sunColor.rgb;
  col = col + vec3f(0.55, 0.85, 1.0) * edgeGlow * 0.55;
  let alpha = clamp(0.06 + 0.55 * fres.x + edgeGlow * 0.45 + in.params.z, 0.0, 0.96);
  col = applyFog(col, in.world);
  return vec4f(col * G.misc.y, alpha);
}
`;

  /* ---------- fullscreen blit ---------- */
  S.blitVS = /* wgsl */`
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
`;

  S.blitFS = /* wgsl */`
@group(2) @binding(0) var srcTex : texture_2d<f32>;
@group(2) @binding(1) var srcSamp : sampler;
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * G.screen.zw;
  var c = textureSample(srcTex, srcSamp, uv).rgb;
  // filmic-ish tonemap
  c = c / (c + vec3f(0.85));
  c = pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2));
  return vec4f(c, 1.0);
}
`;

  global.WGSL = S;
})(window);
