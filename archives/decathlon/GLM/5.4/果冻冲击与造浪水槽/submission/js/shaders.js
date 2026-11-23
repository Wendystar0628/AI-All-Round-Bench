'use strict';
/* ---------------------------------------------------------------------------
   WGSL shader sources. Kept as plain strings (classic scripts, works on file://)
--------------------------------------------------------------------------- */

const SH_COMMON = /* wgsl */`
struct Globals {
  viewProj     : mat4x4f,
  invViewProj  : mat4x4f,
  view         : mat4x4f,
  proj         : mat4x4f,
  invView      : mat4x4f,
  camPos       : vec4f,   // xyz, w = time
  camFwd       : vec4f,   // xyz, w = tan(fov/2)
  camRight     : vec4f,   // xyz, w = aspect
  camUp        : vec4f,
  lightDir     : vec4f,   // xyz, w = intensity
  lightColor   : vec4f,
  fillDir      : vec4f,
  fillColor    : vec4f,
  rimDir       : vec4f,
  rimColor     : vec4f,
  viewport     : vec4f,   // w, h, 1/w, 1/h
  params       : vec4f,   // exposure, grain, pad, pad
  shadowMat    : mat4x4f,
};
@group(0) @binding(0) var<uniform> G : Globals;

const PI : f32 = 3.14159265359;

fn hash21(p : vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn vnoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Studio environment: dark backdrop, soft key/fill boxes. Used for both the
// background dome and for reflections on metal and water.
fn envSky(dirIn : vec3f) -> vec3f {
  let dir = normalize(dirIn);
  let y = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var col = mix(vec3f(0.004, 0.006, 0.012), vec3f(0.022, 0.032, 0.055), pow(y, 1.5));
  col += vec3f(0.030, 0.048, 0.072) * pow(1.0 - abs(dir.y), 8.0) * 0.5;
  let L = normalize(G.lightDir.xyz);
  let d1 = max(dot(dir, L), 0.0);
  col += G.lightColor.rgb * (pow(d1, 28.0) * 3.2 + pow(d1, 5.0) * 0.10);
  let F = normalize(G.fillDir.xyz);
  let d2 = max(dot(dir, F), 0.0);
  col += G.fillColor.rgb * (pow(d2, 16.0) * 0.9 + pow(d2, 3.0) * 0.05);
  let R = normalize(G.rimDir.xyz);
  let d3 = max(dot(dir, R), 0.0);
  col += G.rimColor.rgb * pow(d3, 20.0) * 0.9;
  return col;
}

fn fresnelSchlick(cosT : f32, F0 : vec3f) -> vec3f {
  return F0 + (vec3f(1.0) - F0) * pow(clamp(1.0 - cosT, 0.0, 1.0), 5.0);
}
`;

const SH_SHADOW = /* wgsl */`
struct Draw { model : mat4x4f, color : vec4f, params : vec4f, extra : vec4f };
@group(1) @binding(0) var<uniform> D : Draw;

struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) uv  : vec2f,
};
struct VSOut { @builtin(position) pos : vec4f };

@vertex fn vs(i : VSIn) -> VSOut {
  var o : VSOut;
  let wp = D.model * vec4f(i.pos, 1.0);
  o.pos = G.shadowMat * wp;
  return o;
}
@fragment fn fs(i : VSOut) -> @location(0) vec4f {
  return vec4f(1.0);
}
`;

const SH_MESH = /* wgsl */`
struct Draw { model : mat4x4f, color : vec4f, params : vec4f, extra : vec4f };
@group(0) @binding(1) var shadowTex : texture_depth_2d;
@group(0) @binding(2) var shadowSmp : sampler_comparison;
@group(1) @binding(0) var<uniform> D : Draw;

struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) uv  : vec2f,
};
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) n : vec3f,
  @location(1) wp : vec3f,
  @location(2) col : vec3f,
  @location(3) uv : vec2f,
  @location(4) lp : vec3f,
};

@vertex fn vs(i : VSIn) -> VSOut {
  var o : VSOut;
  let wp = D.model * vec4f(i.pos, 1.0);
  o.wp = wp.xyz;
  o.pos = G.viewProj * wp;
  o.n = normalize((D.model * vec4f(i.nrm, 0.0)).xyz);
  o.col = i.col;
  o.uv = i.uv;
  let sp = G.shadowMat * wp;
  o.lp = sp.xyz / sp.w;
  return o;
}

fn shadowAt(lp : vec3f, ndl : f32) -> f32 {
  let inside = f32(lp.x > -1.02 && lp.x < 1.02 && lp.y > -1.02 && lp.y < 1.02);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let z = lp.z - clamp(0.0016 + 0.0035 * (1.0 - ndl), 0.0, 0.006);
  var s = 0.0;
  let texel = vec2f(1.0 / 2048.0, 1.0 / 2048.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompare(shadowTex, shadowSmp, uv + vec2f(f32(x), f32(y)) * texel, z);
    }
  }
  return mix(1.0, s / 9.0, inside);
}

fn D_GGX(ndoth : f32, a : f32) -> f32 {
  let a2 = a * a;
  let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}
fn V_Smith(ndotv : f32, ndotl : f32, a : f32) -> f32 {
  let k = a * 0.5;
  let gv = ndotv / (ndotv * (1.0 - k) + k);
  let gl = ndotl / (ndotl * (1.0 - k) + k);
  return gv * gl;
}

@fragment fn fs(i : VSOut, @builtin(front_facing) ff : bool) -> @location(0) vec4f {
  let mode = i32(D.params.w + 0.5);
  var N = normalize(i.n);
  if (!ff) { N = -N; }
  let V = normalize(G.camPos.xyz - i.wp);
  let L = normalize(G.lightDir.xyz);
  let albedo = i.col * D.color.rgb;
  let rough = max(D.params.x, 0.02);
  let metal = D.params.y;
  let alpha = D.params.z;

  if (mode == 1) {
    // ---- glass panel -------------------------------------------------
    let ndv = clamp(dot(N, V), 0.0, 1.0);
    let F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    var col = vec3f(0.0);
    // reflection of the studio
    let R = reflect(-V, N);
    col += envSky(R) * (0.35 + 0.9 * F);
    // tight specular from key light
    let H = normalize(L + V);
    let sp = pow(max(dot(N, H), 0.0), 420.0) * 3.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.25;
    col += G.lightColor.rgb * sp * G.lightDir.w * 0.35;
    // glass body tint
    col += D.color.rgb * 0.05;
    let edge = 1.0 - smoothstep(0.0, 0.055, min(min(i.uv.x, 1.0 - i.uv.x), min(i.uv.y, 1.0 - i.uv.y)));
    col += vec3f(0.55, 0.80, 0.95) * edge * 0.30;
    let a = clamp(0.055 + F * 0.85 + edge * 0.25, 0.0, 0.92);
    return vec4f(col * a, a);
  }

  let F0 = mix(vec3f(0.04), albedo, metal);
  var col = vec3f(0.0);
  let ndv = max(dot(N, V), 1e-4);

  // ambient hemisphere + environment
  let up = N.y * 0.5 + 0.5;
  let amb = mix(vec3f(0.020, 0.024, 0.034), vec3f(0.10, 0.13, 0.18), up);
  col += albedo * amb * (1.0 - metal * 0.85);
  let Rv = reflect(-V, N);
  let envR = envSky(Rv);
  let Fenv = fresnelSchlick(ndv, F0);
  col += envR * Fenv * mix(0.35, 1.0, metal) * (1.0 - rough * 0.55);

  // key light with shadows
  let ndl = max(dot(N, L), 0.0);
  let sh = shadowAt(i.lp, ndl);
  let H = normalize(L + V);
  let ndoth = max(dot(N, H), 0.0);
  let F1 = fresnelSchlick(max(dot(V, H), 0.0), F0);
  let spec = D_GGX(ndoth, rough * rough) * V_Smith(ndv, ndl, rough * rough) * F1 / max(4.0 * ndv * ndl, 1e-4);
  let kd = (vec3f(1.0) - F1) * (1.0 - metal);
  let li = G.lightColor.rgb * G.lightDir.w;
  col += (kd * albedo / PI + spec) * li * ndl * sh;

  // fill + rim (no shadow, cheap)
  let Fd = normalize(G.fillDir.xyz);
  let ndf = max(dot(N, Fd), 0.0);
  let Hf = normalize(Fd + V);
  let specF = D_GGX(max(dot(N, Hf), 0.0), rough * rough) * V_Smith(ndv, ndf, rough * rough) * F1 / max(4.0 * ndv * ndf, 1e-4);
  col += (kd * albedo / PI * 0.85 + specF) * G.fillColor.rgb * G.fillDir.w * ndf;

  let Rd = normalize(G.rimDir.xyz);
  let ndr = max(dot(N, Rd), 0.0);
  let Hr = normalize(Rd + V);
  let specR = pow(max(dot(N, Hr), 0.0), mix(600.0, 24.0, rough)) * 1.6;
  col += G.rimColor.rgb * G.rimDir.w * (specR + albedo * ndr * 0.18);

  // emissive
  col += D.extra.rgb * D.extra.w;
  col *= alpha;
  return vec4f(col, alpha);
}
`;

const SH_JELLY = /* wgsl */`
struct Draw { model : mat4x4f, color : vec4f, params : vec4f, extra : vec4f };
@group(0) @binding(1) var shadowTex : texture_depth_2d;
@group(0) @binding(2) var shadowSmp : sampler_comparison;
@group(0) @binding(3) var backDepthTex : texture_2d<f32>;
@group(0) @binding(4) var backSmp : sampler;
@group(1) @binding(0) var<uniform> D : Draw;

struct VSIn {
  @location(0) pos : vec3f,
  @location(1) nrm : vec3f,
  @location(2) col : vec3f,
  @location(3) uv  : vec2f,
};
struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) n : vec3f,
  @location(1) wp : vec3f,
  @location(2) col : vec3f,
  @location(3) uv : vec2f,
  @location(4) lp : vec3f,
};
@vertex fn vs(i : VSIn) -> VSOut {
  var o : VSOut;
  let wp = D.model * vec4f(i.pos, 1.0);
  o.wp = wp.xyz;
  o.pos = G.viewProj * wp;
  o.n = normalize((D.model * vec4f(i.nrm, 0.0)).xyz);
  o.col = i.col;
  o.uv = i.uv;
  let sp = G.shadowMat * wp;
  o.lp = sp.xyz / sp.w;
  return o;
}

fn shadowAt(lp : vec3f, ndl : f32) -> f32 {
  let inside = f32(lp.x > -1.02 && lp.x < 1.02 && lp.y > -1.02 && lp.y < 1.02);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let z = lp.z - 0.0025;
  var s = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompare(shadowTex, shadowSmp, uv + vec2f(f32(x), f32(y)) / 2048.0, z);
    }
  }
  return mix(1.0, s / 9.0, inside);
}

// back faces only: write the linear view depth of the exit surface
struct BDOut { @location(0) d : vec4f };
@fragment fn fsDepth(i : VSOut) -> BDOut {
  let vp = (G.view * vec4f(i.wp, 1.0)).xyz;
  return BDOut(vec4f(-vp.z, 0.0, 0.0, 0.0));
}

@fragment fn fs(i : VSOut) -> @location(0) vec4f {
  let N = normalize(i.n);
  let V = normalize(G.camPos.xyz - i.wp);
  let L = normalize(G.lightDir.xyz);
  let base = i.col * D.color.rgb;
  let soft = D.params.x;
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let fres = pow(1.0 - ndv, 3.0);

  // thickness from the back-face depth buffer
  let suv = i.pos.xy * G.viewport.zw;
  let bd = textureSampleLevel(backDepthTex, backSmp, suv, 0.0).x;
  let viewZ = -(G.view * vec4f(i.wp, 1.0)).z;
  let thickness = clamp(bd - viewZ, 0.0, 1.2);

  // absorption: thick parts go deep and saturated, thin parts stay bright
  let att = exp(-thickness * D.extra.xyz);
  let H = normalize(L + V);
  let ndl = max(dot(N, L), 0.0);
  let sh = shadowAt(i.lp, ndl);
  let wrap = clamp((dot(N, L) + 0.55) / 1.55, 0.0, 1.0);

  var col = base * (0.34 + 0.72 * wrap * sh) * mix(0.62, 1.25, fres);
  // light scattering through the body
  let back = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  col += base * back * (0.55 + 0.6 * soft) * (0.45 + 0.55 * sh);
  col += base * (1.0 - att) * 0.55;
  // absorbed body colour
  col *= mix(vec3f(1.0), att, 0.85);
  // fresnel rim / sky reflection
  col += mix(base, vec3f(1.0), 0.5) * fres * 1.15;
  col += envSky(reflect(-V, N)) * fres * 0.40;
  // glossy highlight
  let spec = pow(max(dot(N, H), 0.0), 280.0) * 3.2 + pow(max(dot(N, H), 0.0), 52.0) * 0.18;
  col += G.lightColor.rgb * spec * sh * G.lightDir.w * 0.55;
  let Fd = normalize(G.fillDir.xyz);
  col += G.fillColor.rgb * pow(max(dot(N, Fd), 0.0), 3.0) * 0.12;

  let a = clamp(0.30 + thickness * 3.2 + fres * 0.45 + spec * 0.20, 0.0, 0.97);
  return vec4f(col, a);
}
`;

const SH_SKY = /* wgsl */`
@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 1.0, 1.0);
}
@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = fc.xy * G.viewport.zw;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let p = G.invViewProj * vec4f(ndc, 1.0, 1.0);
  let dir = normalize(p.xyz / p.w - G.camPos.xyz);
  var col = envSky(dir);
  // soft radial backdrop glow behind the subject
  let aim = normalize(vec3f(0.0, 0.35, -1.0));
  let g = pow(max(dot(dir, aim), 0.0), 5.0);
  col += vec3f(0.05, 0.09, 0.14) * g;
  // gentle vertical falloff
  col *= 0.85 + 0.3 * clamp(dir.y + 0.4, 0.0, 1.0);
  return vec4f(col, 1.0);
}
`;

const SH_PARTICLE = /* wgsl */`
struct P { pos : vec4f, vel : vec4f };
@group(0) @binding(1) var<storage, read> pPos : array<vec4f>;
@group(0) @binding(2) var<storage, read> pVel : array<vec4f>;

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) corner : vec2f,
  @location(1) viewCenter : vec3f,
  @location(2) rad : f32,
  @location(3) speed : f32,
};

@vertex fn vs(@builtin(vertex_index) vi : u32) -> VOut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
                                 vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let pi = vi / 6u;
  let ci = vi % 6u;
  var o : VOut;
  let wp = pPos[pi].xyz;
  let vpos = (G.view * vec4f(wp, 1.0)).xyz;
  let rad = G.params.y;
  let dist = max(-vpos.z, 1e-3);
  let px = G.viewport.y * 0.5 * G.params.z;   // half-height in px
  let sizePx = clamp(rad * G.camFwd.w * px / dist, 1.2, 90.0);
  let sizeNdc = sizePx / (G.viewport.y * 0.5);
  let c = corners[ci];
  o.pos = vec4f(vpos.x / dist * G.camFwd.w * G.camRight.w + c.x * sizeNdc * G.camRight.w,
                vpos.y / dist * G.camFwd.w + c.y * sizeNdc, 0.0, 1.0);
  o.corner = c;
  o.viewCenter = vpos;
  o.rad = rad;
  o.speed = length(pVel[pi].xyz);
  return o;
}

struct FOut {
  @location(0) depth : vec4f,
  @location(1) thick : vec2f,
};

@fragment fn fs(i : VOut) -> FOut {
  var o : FOut;
  let r2 = dot(i.corner, i.corner);
  if (r2 > 1.0) { discard; }
  let nz = sqrt(max(1.0 - r2, 0.0));
  let dist = max(-i.viewCenter.z, 1e-3);
  let worldRad = i.rad;
  o.depth = vec4f(dist - nz * worldRad, 0.0, 0.0, 0.0);
  o.thick = vec2f(nz * worldRad * 2.0, 0.0);
  return o;
}
`;

// bilateral smoothing of the particle depth (ping-pong)
const SH_SMOOTH = /* wgsl */`
@group(0) @binding(1) var src : texture_2d<f32>;
@group(0) @binding(2) var smp : sampler;

@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = fc.xy * G.viewport.zw;
  let c = textureSampleLevel(src, smp, uv, 0.0).x;
  if (c > 1e5) { return vec4f(c, 0.0, 0.0, 0.0); }
  let px = G.viewport.zw * 1.5;
  var sum = 0.0;
  var wsum = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let d = textureSampleLevel(src, smp, uv + vec2f(f32(x), f32(y)) * px, 0.0).x;
      if (d > 1e5) { continue; }
      let w = exp(-abs(d - c) * 260.0) * (1.0 - length(vec2f(f32(x), f32(y))) / 3.2);
      sum += d * w;
      wsum += w;
    }
  }
  if (wsum < 1e-5) { return vec4f(c, 0.0, 0.0, 0.0); }
  return vec4f(sum / wsum, 0.0, 0.0, 0.0);
}
`;

// foam sprite pass (additive into foam texture)
const SH_FOAM = /* wgsl */`
@group(0) @binding(1) var<storage, read> fPos : array<vec4f>;   // xyz, w = life
@group(0) @binding(2) var<storage, read> fVel : array<vec4f>;

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) corner : vec2f,
  @location(1) life : f32,
  @location(2) speed : f32,
  @location(3) viewZ : f32,
};
@vertex fn vs(@builtin(vertex_index) vi : u32) -> VOut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
                                 vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let pi = vi / 6u;
  let ci = vi % 6u;
  var o : VOut;
  let life = fPos[pi].w;
  let wp = fPos[pi].xyz;
  let vpos = (G.view * vec4f(wp, 1.0)).xyz;
  let dist = max(-vpos.z, 1e-3);
  let rad = mix(0.006, 0.020, clamp(life, 0.0, 1.0)) * G.params.y;
  let px = G.viewport.y * 0.5 * G.params.z;
  let sizePx = clamp(rad * G.camFwd.w * px / dist, 0.8, 60.0);
  let sizeNdc = sizePx / (G.viewport.y * 0.5);
  let c = corners[ci];
  o.pos = vec4f(vpos.x / dist * G.camFwd.w * G.camRight.w + c.x * sizeNdc * G.camRight.w,
                vpos.y / dist * G.camFwd.w + c.y * sizeNdc, 0.0, 1.0);
  o.corner = c;
  o.life = life;
  o.speed = length(fVel[pi].xyz);
  o.viewZ = dist;
  return o;
}
@fragment fn fs(i : VOut) -> @location(0) vec4f {
  if (i.life <= 0.0) { discard; }
  let r = length(i.corner);
  if (r > 1.0) { discard; }
  let a = (1.0 - r * r);
  let a2 = a * a;
  return vec4f(vec3f(0.92, 0.96, 1.0) * a2 * 0.55, a2 * 0.55);
}
`;

const SH_WATER = /* wgsl */`
@group(0) @binding(1) var sceneCol : texture_2d<f32>;
@group(0) @binding(2) var waterDepth : texture_2d<f32>;
@group(0) @binding(3) var thickness : texture_2d<f32>;
@group(0) @binding(4) var foamTex : texture_2d<f32>;
@group(0) @binding(5) var sceneDepth : texture_depth_2d;
@group(0) @binding(6) var linSmp : sampler;
@group(0) @binding(7) var nearSmp : sampler;

@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

fn viewPosFromDepth(ndc : vec2f, depth : f32) -> vec3f {
  return vec3f(ndc.x / G.proj[0][0] * depth, ndc.y / G.proj[1][1] * depth, -depth);
}

@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = fc.xy * G.viewport.zw;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let d0 = textureSampleLevel(waterDepth, linSmp, uv, 0.0).x;

  var scene = textureSampleLevel(sceneCol, linSmp, uv, 0.0);
  let sdepth = textureLoad(sceneDepth, vec2i(fc.xy), 0);
  // scene depth (non-linear) -> linear view depth
  let sceneViewZ = G.proj[3][2] / (sdepth * G.proj[2][3] + G.proj[2][2]);
  let sceneLin = -sceneViewZ;

  if (d0 > 1e5) {
    return scene;
  }

  // --- reconstruct surface position & normal -----------------------------
  let px = G.viewport.zw * 1.0;
  let dR = textureSampleLevel(waterDepth, linSmp, uv + vec2f(px.x, 0.0), 0.0).x;
  let dL = textureSampleLevel(waterDepth, linSmp, uv - vec2f(px.x, 0.0), 0.0).x;
  let dU = textureSampleLevel(waterDepth, linSmp, uv + vec2f(0.0, px.y), 0.0).x;
  let dD = textureSampleLevel(waterDepth, linSmp, uv - vec2f(0.0, px.y), 0.0).x;
  var dr = dR; var dl = dL; var du = dU; var dd = dD;
  if (dr > 1e5) { dr = d0; }
  if (dl > 1e5) { dl = d0; }
  if (du > 1e5) { du = d0; }
  if (dd > 1e5) { dd = d0; }

  let pC = viewPosFromDepth(ndc, d0);
  let pR = viewPosFromDepth(ndc + vec2f(2.0 * px.x, 0.0), dr);
  let pL = viewPosFromDepth(ndc - vec2f(2.0 * px.x, 0.0), dl);
  let pU = viewPosFromDepth(ndc + vec2f(0.0, 2.0 * px.y), du);
  let pD = viewPosFromDepth(ndc - vec2f(0.0, 2.0 * px.y), dd);
  var N = normalize(cross(pR - pL, pU - pD));
  if (N.z > 0.0) { N = -N; }
  // make it face the camera
  let Vv = normalize(-pC);
  if (dot(N, Vv) < 0.0) { N = -N; }

  // small scale ripple detail
  let wp = (G.invView * vec4f(pC, 1.0)).xyz;
  let t = G.params.y;
  let ripple = vec3f(
    vnoise(wp.xz * 26.0 + vec2f(t * 0.7, t * 0.3)) - 0.5,
    vnoise(wp.xz * 41.0 + vec2f(-t * 0.5, t * 0.9)) - 0.5,
    vnoise(wp.xz * 33.0 + vec2f(t * 0.2, -t * 0.6)) - 0.5) * 0.05;
  var Nw = normalize(N + vec3f(ripple.x, 0.0, ripple.y) + vec3f(0.0, ripple.z * 0.3, 0.0));

  let V = normalize(G.camPos.xyz - wp);
  let ndv = clamp(dot(Nw, V), 0.0, 1.0);
  let F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // --- refraction -------------------------------------------------------
  let th = textureSampleLevel(thickness, linSmp, uv, 0.0).x;
  let thc = clamp(th, 0.0, 0.6);
  var refrUV = uv + Nw.xy * vec2f(0.055, -0.055) * clamp(thc * 5.0, 0.15, 1.0);
  // keep refraction inside the screen
  refrUV = clamp(refrUV, vec2f(0.001), vec2f(0.999));
  let refrDepth = textureSampleLevel(waterDepth, linSmp, refrUV, 0.0).x;
  let sceneSample = textureSampleLevel(sceneCol, linSmp, refrUV, 0.0);
  let sampleSceneZ = textureLoad(sceneDepth, vec2i(refrUV * G.viewport.xy), 0);
  let sampleSceneLin = -(G.proj[3][2] / (sampleSceneZ * G.proj[2][3] + G.proj[2][2]));
  // if the refracted tap hits something in front of the water surface, fall back
  let refrOk = select(0.0, 1.0, sampleSceneLin > d0 - 0.01);
  var refrCol = mix(scene.rgb, sceneSample.rgb, refrOk);

  // absorption / scattering tint by thickness
  let absorb = exp(-thc * vec3f(2.6, 1.05, 0.55));
  let scatter = vec3f(0.012, 0.055, 0.075) * (1.0 - exp(-thc * 9.0));
  var col = refrCol * absorb + scatter;

  // --- reflection -------------------------------------------------------
  let Rw = reflect(-V, Nw);
  let skyR = envSky(Rw);
  let L = normalize(G.lightDir.xyz);
  let H = normalize(L + V);
  let spec = pow(max(dot(Nw, H), 0.0), 380.0) * 3.0 + pow(max(dot(Nw, H), 0.0), 48.0) * 0.10;
  let Fenv = F * 1.0;
  col = mix(col, skyR, Fenv * 0.92);
  col += G.lightColor.rgb * spec * G.lightDir.w * 0.55 * (0.35 + 0.65 * F);

  // --- foam -------------------------------------------------------------
  let foam = textureSampleLevel(foamTex, linSmp, uv, 0.0);
  let foamAmt = clamp(foam.a * 1.35, 0.0, 1.0);
  let foamCol = vec3f(0.93, 0.97, 1.0) * (0.55 + 0.6 * max(dot(Nw, L), 0.0));
  col = mix(col, foamCol, foamAmt);

  // --- composite --------------------------------------------------------
  // fade near the silhouette so the surface melts into the scene
  let edge = smoothstep(0.0, 0.02, d0 - sceneLin);
  var outCol = col;
  outCol = mix(scene.rgb, outCol, edge);
  return vec4f(outCol, 1.0);
}
`;

const SH_POST = /* wgsl */`
@group(0) @binding(1) var srcTex : texture_2d<f32>;
@group(0) @binding(2) var smp : sampler;

@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

fn aces(x : vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let uv = fc.xy * G.viewport.zw;
  var col = textureSampleLevel(srcTex, smp, uv, 0.0).rgb;
  // subtle chromatic vignette / lens
  let d = uv - 0.5;
  let r2 = dot(d, d);
  col *= 1.0 - 0.32 * r2 * 1.6;
  col *= G.params.x;
  col = aces(col);
  col = pow(col, vec3f(1.0 / 2.2));
  // filmic grain
  let g = hash21(fc.xy + fract(G.params.y) * 100.0) - 0.5;
  col += g * 0.014;
  return vec4f(max(col, vec3f(0.0)), 1.0);
}
`;

const SH_BLIT = /* wgsl */`
@group(0) @binding(1) var srcTex : texture_2d<f32>;
@group(0) @binding(2) var smp : sampler;
@vertex fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  return textureSampleLevel(srcTex, smp, fc.xy * G.viewport.zw, 0.0);
}
`;
