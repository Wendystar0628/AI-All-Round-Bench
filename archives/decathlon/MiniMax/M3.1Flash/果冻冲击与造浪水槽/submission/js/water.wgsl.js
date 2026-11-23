/* water.wgsl.js — free surface shading: refraction, reflection, foam, caustics. */
(function (global) {
  'use strict';

  global.WGSL_BALL = {
    vs: /* wgsl */`
struct BVSOut {
  @builtin(position) pos   : vec4f,
  @location(0) world  : vec3f,
  @location(1) normal : vec3f,
  @location(2) color  : vec4f,
  @location(3) params : vec4f,
  @location(4) local  : vec3f,
};
@group(1) @binding(1) var<storage, read> Balls : array<f32>;

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vsBall(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @builtin(instance_index) ii: u32) -> BVSOut {
  let b = ii * 24u;
  let cpos = vec3f(Balls[b], Balls[b + 1u], Balls[b + 2u]);
  let q = vec4f(Balls[b + 6u], Balls[b + 7u], Balls[b + 8u], Balls[b + 9u]);
  let r = Balls[b + 13u];
  let rp = qrot(q, inPos * (r * 2.0));
  var o: BVSOut;
  o.pos = G.viewProj * vec4f(cpos + rp, 1.0);
  o.world = cpos + rp;
  o.normal = normalize(qrot(q, inNrm));
  o.color = vec4f(Balls[b + 16u], Balls[b + 17u], Balls[b + 18u], 1.0);
  o.params = vec4f(0.30, 0.12, 0.0, 0.0);
  o.local = inPos;
  return o;
}
`
  };

  global.WGSL_WATER = {
    vs: /* wgsl */`
struct VSOut {
  @builtin(position) pos   : vec4f,
  @location(0) world  : vec3f,
  @location(1) normal : vec3f,
  @location(2) foam   : f32,
  @location(3) speed  : f32,
  @location(4) color  : vec4f,
  @location(5) params : vec4f,
};

@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @location(2) inFoam: f32,
      @location(3) inSpeed: f32) -> VSOut {
  let wp = vec4f(inPos, 1.0);
  var o: VSOut;
  o.pos = G.viewProj * wp;
  o.world = inPos;
  o.normal = normalize(inNrm);
  o.foam = inFoam;
  o.speed = inSpeed;
  o.color = vec4f(0.62, 0.82, 0.90, 1.0);
  o.params = vec4f(0.03, 0.0, 0.0, 0.0);
  return o;
}
`,

    fs: /* wgsl */`
@group(3) @binding(0) var sceneTex : texture_2d<f32>;
@group(3) @binding(1) var sceneSamp: sampler;
@group(3) @binding(2) var depthTex  : texture_depth_2d;

fn linearDepth(z: f32) -> f32 {
  let n = G.nearFar.x; let f = G.nearFar.y;
  return f * n / max(f + z * (n - f), 1e-5);
}

// moving light pattern on the tank floor, driven by the surface normal
fn caustic(p: vec2f, t: f32) -> f32 {
  var v = 0.0;
  let q = p * 6.5;
  v = v + sin(q.x * 1.7 + t * 2.05) * sin(q.y * 1.31 - t * 1.67);
  v = v + 0.55 * sin((q.x + q.y) * 2.31 + t * 3.05);
  v = v + 0.40 * sin((q.x - q.y) * 3.11 - t * 2.55);
  v = v + 0.30 * sin(q.x * 5.3 - t * 4.1) * sin(q.y * 4.7 + t * 3.3);
  return pow(clamp(0.5 + 0.33 * v, 0.0, 1.0), 3.2);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(G.camPos.xyz - in.world);
  let L = normalize(G.sunDir.xyz);
  let ndv = max(dot(N, V), 1.0e-4);
  let F0 = vec3f(0.02);
  let fres = fresnelSchlick(ndv, F0);

  let uv = in.pos.xy * G.screen.zw;
  let refr = refract(-V, N, 1.0 / 1.333);
  let off = vec2f(refr.x, -refr.y) * G.fx.w * (0.4 + 0.6 * (1.0 - ndv));
  let ruv = clamp(uv + off, vec2f(0.002), vec2f(0.998));
  var behind = textureSampleLevel(sceneTex, sceneSamp, ruv, 0.0).rgb;

  let px = vec2i(i32(ruv.x * G.screen.x), i32(ruv.y * G.screen.y));
  let sc = textureLoad(depthTex, px, 0);
  let dScene = linearDepth(sc);
  let dSelf = linearDepth(in.pos.z);
  let thick = clamp(dScene - dSelf, 0.0, 0.9);

  // absorption (slightly tinted water)
  let absorb = vec3f(1.05, 0.32, 0.22);
  let trans = exp(-absorb * thick);
  var col = behind * trans;

  // caustic light patterns on submerged geometry
  let caus = caustic(in.world.xz + N.xz * 0.6, G.misc.x);
  col = col + G.sunColor.rgb * caus * 0.55 * clamp(thick * 4.0, 0.0, 1.0);

  // reflection of the environment
  let R = reflect(-V, N);
  var refl = envColor(R);
  let spec = ggxSpec(N, V, L, 0.035, F0) * G.sunColor.w;
  refl = refl + spec * G.sunColor.rgb * 1.4;

  var outc = mix(col, refl, clamp(fres * 1.25, 0.0, 1.0));

  // white water / foam
  let foam = clamp(in.foam, 0.0, 1.0);
  let foamMask = smoothstep(0.08, 0.75, foam);
  let bubble = 0.5 + 0.5 * sin(in.world.x * 130.0 + G.misc.x * 6.0) * sin(in.world.z * 120.0 - G.misc.x * 5.0);
  let foamCol = vec3f(0.92, 0.96, 1.0) * (0.72 + 0.28 * bubble);
  outc = mix(outc, foamCol, foamMask * 0.92);
  let alpha = mix(clamp(0.62 + 0.4 * fres.x, 0.0, 1.0), 1.0, foamMask);

  // crest sparkle
  let sparkle = pow(max(dot(reflect(-V, N), L), 0.0), 220.0);
  outc = outc + G.sunColor.rgb * sparkle * 1.2;

  outc = applyFog(outc, in.world);
  return vec4f(outc * G.misc.y, alpha);
}
`
  };
})(window);
