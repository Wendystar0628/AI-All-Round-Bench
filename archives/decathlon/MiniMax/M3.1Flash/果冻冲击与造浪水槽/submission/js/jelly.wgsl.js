/* jelly.wgsl.js — translucent soft-body (jelly) shading. */
(function (global) {
  'use strict';
  const S = global.WGSL;

  global.WGSL_JELLY = {
    vs: /* wgsl */`
struct VSOut {
  @builtin(position) pos   : vec4f,
  @location(0) world  : vec3f,
  @location(1) normal : vec3f,
  @location(2) damage : f32,
  @location(3) color  : vec4f,
  @location(4) params : vec4f,
};

@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @location(2) inDmg: f32,
      @builtin(instance_index) ii: u32) -> VSOut {
  let I = insts[ii];
  let wp = I.model * vec4f(inPos, 1.0);
  var o: VSOut;
  o.pos = G.viewProj * wp;
  o.world = wp.xyz;
  o.normal = normalize((I.model * vec4f(inNrm, 0.0)).xyz);
  o.damage = inDmg;
  o.color = I.color;
  o.params = I.params;
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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let V = normalize(G.camPos.xyz - in.world);
  let L = normalize(G.sunDir.xyz);
  let ndv = max(dot(N, V), 1.0e-4);
  let rough = clamp(in.params.x, 0.04, 1.0);
  let F0 = vec3f(0.035);
  let fres = fresnelSchlick(ndv, F0);

  let uv = in.pos.xy * G.screen.zw;
  let ndcX = in.pos.x * G.screen.zw * 2.0 - 1.0;
  let ndcY = 1.0 - in.pos.y * G.screen.zw * 2.0;

  // refraction: bend the view ray through the surface
  let refr = refract(-V, N, 1.0 / 1.34);
  let off = vec2f(refr.x, -refr.y) * G.fx.w * (0.35 + 0.65 * (1.0 - ndv));
  let ruv = clamp(uv + off, vec2f(0.002), vec2f(0.998));
  var behind = textureSampleLevel(sceneTex, sceneSamp, ruv, 0.0).rgb;

  // thickness of gel between the surface and whatever is behind it
  let sc = textureLoad(depthTex, vec2i(i32(ruv.x * f32(i32(G.screen.x))), i32(ruv.y * f32(i32(G.screen.y)))), 0);
  let dScene = linearDepth(sc);
  let dSelf  = linearDepth(in.pos.z);
  let thick = clamp(dScene - dSelf, 0.0, 0.6);

  // Beer-Lambert absorption through the gel
  let tint = in.color.rgb;
  let absorb = vec3f(0.9, 0.35, 0.45) * 6.0;
  let trans = exp(-absorb * thick);
  var col = behind * trans * 1.05;

  // interior scattering: soft glow that thickens the body
  let sss = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.6);
  col = col + tint * (0.16 + 0.55 * sss) * (0.35 + 0.65 * exp(-thick * 4.0));
  col = col + tint * 0.10;

  // specular highlights (wet, glossy gel)
  let spec = ggxSpec(N, V, L, rough, F0) * shadowFactor(in.world, N) * G.sunColor.w;
  col = col + spec * G.sunColor.rgb * 1.6;

  // environment reflection on the surface
  let R = reflect(-V, N);
  col = col + envColor(R) * fres * 0.55;

  // crack interior looks matte and pale
  let dmg = clamp(in.damage, 0.0, 1.0);
  let crackCol = mix(col, vec3f(0.92, 0.95, 1.0) * (0.35 + 0.5 * max(dot(N, L), 0.0)), dmg * 0.8);
  let rough2 = mix(rough, 0.75, dmg);

  // back rim light so the silhouette reads against the background
  let rim = pow(1.0 - ndv, 3.0);
  col = crackCol + mix(G.skyTop.rgb, vec3f(0.55, 0.75, 1.0), 0.6) * rim * 0.55;

  let alpha = clamp(0.42 + 0.5 * fres.x + dmg * 0.35, 0.0, 1.0);
  col = applyFog(col, in.world);
  return vec4f(col * G.misc.y, alpha);
}
`,

    shadowVS: /* wgsl */`
@vertex
fn vs(@location(0) inPos: vec3f, @location(1) inNrm: vec3f, @location(2) inDmg: f32,
      @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  let I = insts[ii];
  return G.lightViewProj * (I.model * vec4f(inPos, 1.0));
}
`
  };
})(window);
