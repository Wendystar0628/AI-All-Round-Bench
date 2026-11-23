// js/scene1-renderer.js — Unified WebGPU Studio Renderer for Scene 1 (Refractive SSS Jelly + PBR Balls + Caustic Shadows)
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { Mat4 } = App.Math;
  const { COMMON_STUDIO_WGSL, createBoxMesh, uploadMesh } = App.GPU;

  const MAX_JELLY_VERTS = 180000;
  const MAX_BALLS = 12;

  const SCENE1_COMMON_UNIFORMS_WGSL = /* wgsl */ `
struct FrameUniforms {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  screenSize: vec4<f32>, // w, h, 1/w, 1/h
  jellyCenters: array<vec4<f32>, 3>, // xyz = center, w = radius
  jellyTints: array<vec4<f32>, 3>,   // rgb = caustic tint, w = active
};

struct BallInstance {
  model: mat4x4<f32>,
  params: vec4<f32>, // x = materialId (0 steel, 1 stone, 2 brass), y = radius, z,w unused
};
`;

  const SHADOW_SHADER_WGSL = /* wgsl */ `
${SCENE1_COMMON_UNIFORMS_WGSL}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> balls: array<BallInstance>;

@vertex
fn vsStatic(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  return frame.lightViewProj * vec4<f32>(pos, 1.0);
}

@vertex
fn vsBall(@location(0) pos: vec3<f32>, @builtin(instance_index) inst: u32) -> @builtin(position) vec4<f32> {
  let wp = balls[inst].model * vec4<f32>(pos, 1.0);
  return frame.lightViewProj * wp;
}

@vertex
fn vsJelly(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  return frame.lightViewProj * vec4<f32>(pos, 1.0);
}
`;

  const OPAQUE_SHADER_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE1_COMMON_UNIFORMS_WGSL}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<storage, read> balls: array<BallInstance>;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSamp: sampler_comparison;

// --- Fullscreen Architectural Studio Cyclorama ---
struct BgOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsBackdrop(@builtin(vertex_index) vid: u32) -> BgOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: BgOut;
  out.pos = vec4<f32>(p[vid], 0.99999, 1.0);
  out.uv = vec2<f32>(p[vid].x * 0.5 + 0.5, 0.5 - p[vid].y * 0.5);
  return out;
}

@fragment
fn fsBackdrop(in: BgOut) -> @location(0) vec4<f32> {
  let ndc = vec4<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0, 1.0, 1.0);
  let wp = frame.invViewProj * ndc;
  let rayDir = normalize(wp.xyz / wp.w - frame.camPos.xyz);
  let bg = evalStudioBackdrop(rayDir, in.uv);
  return vec4<f32>(bg, 1.0);
}

// --- Studio Pedestal Table & Trim ---
struct MeshOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNorm: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) localPos: vec3<f32>,
  @location(4) @interpolate(flat) matId: u32,
};

@vertex
fn vsBench(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>, @location(2) uv: vec2<f32>) -> MeshOut {
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos;
  out.worldNorm = norm;
  out.uv = uv;
  out.localPos = pos;
  out.matId = 0u;
  return out;
}

@vertex
fn vsTrim(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>, @location(2) uv: vec2<f32>) -> MeshOut {
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos;
  out.worldNorm = norm;
  out.uv = uv;
  out.localPos = pos;
  out.matId = 1u;
  return out;
}

@fragment
fn fsBench(in: MeshOut) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNorm);
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let lightPos = frame.lightViewProj * vec4<f32>(in.worldPos + N * 0.004, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0018);

  if (in.matId == 1u) {
    // Sleek brushed anodized aluminum bench rim
    let grain = valueNoise3D(in.worldPos * vec3<f32>(4.0, 40.0, 4.0));
    let albedo = vec3<f32>(0.62, 0.65, 0.69) * (0.94 + 0.08 * grain);
    let col = evalStudioPBR(N, V, albedo, 0.82, 0.28, shadow, 1.0);
    return vec4<f32>(col, 1.0);
  }

  // Precision brushed limestone / architectural terrazzo bench surface (balanced gallery tone for vivid jelly caustics & shadows!)
  let n1 = valueNoise3D(in.worldPos * 6.5);
  let n2 = valueNoise3D(in.worldPos * 28.0);
  let speck = smoothstep(0.76, 0.88, valueNoise3D(in.worldPos * 62.0));
  var albedo = vec3<f32>(0.47, 0.48, 0.49) * (0.94 + 0.07 * n1 + 0.03 * n2) - vec3<f32>(0.035) * speck;
  var rough = 0.62 + 0.10 * n2;

  // Crisp subtle engraved studio metric grid on top surface (y ~ 0)
  if (N.y > 0.8) {
    let gx = abs(fract(in.worldPos.x * 2.0 + 0.5) - 0.5) * 2.0;
    let gz = abs(fract(in.worldPos.z * 2.0 + 0.5) - 0.5) * 2.0;
    let minorLine = 1.0 - smoothstep(0.012, 0.028, min(gx, gz));

    let mx = abs(fract(in.worldPos.x * 1.0 + 0.5) - 0.5) * 2.0;
    let mz = abs(fract(in.worldPos.z * 1.0 + 0.5) - 0.5) * 2.0;
    let majorLine = 1.0 - smoothstep(0.008, 0.020, min(mx, mz));

    // Center impact bullseye target ring under center jelly
    let rCenter = length(in.worldPos.xz);
    let targetRing = (1.0 - smoothstep(0.007, 0.018, abs(rCenter - 1.02))) * 0.62;

    let edgeFade = smoothstep(3.55, 3.05, abs(in.worldPos.x)) * smoothstep(2.25, 1.85, abs(in.worldPos.z));
    albedo = mix(albedo, vec3<f32>(0.38, 0.42, 0.48), (minorLine * 0.25 + majorLine * 0.42 + targetRing) * edgeFade);
    rough = mix(rough, 0.42, (minorLine * 0.3 + majorLine * 0.5) * edgeFade);
  }

  // Contact AO + translucent colored jelly caustic glow projected along KEY_DIR onto the bench!
  var ao = 1.0;
  var causticGlow = vec3<f32>(0.0);
  if (N.y > 0.8) {
    for (var i = 0u; i < 3u; i++) {
      let jc = frame.jellyCenters[i];
      let jt = frame.jellyTints[i];
      if (jt.w < 0.5) { continue; }
      let dFoot = length(in.worldPos.xz - jc.xz);
      // Soft contact darkening right under jelly perimeter
      ao *= mix(0.68, 1.0, smoothstep(jc.w * 0.4, jc.w * 1.25, dFoot));
      // Projected light-transmission spot along KEY_DIR
      let shift = -KEY_DIR.xz * (jc.y / max(KEY_DIR.y, 0.2));
      let cPos = jc.xz + shift;
      let dCaust = length(in.worldPos.xz - cPos);
      let spot = exp(-pow(dCaust / max(jc.w * 0.82, 0.25), 2.2));
      // Colored light transmits through the shadowed zone!
      causticGlow += jt.rgb * spot * (0.28 + 0.52 * (1.0 - shadow));
    }
  }

  // Soften shadow slightly where colored jelly light passes through
  let effectiveShadow = clamp(shadow + length(causticGlow) * 0.35, 0.0, 1.0);
  var col = evalStudioPBR(N, V, albedo, 0.02, rough, effectiveShadow, ao);
  col += causticGlow * 0.58;
  return vec4<f32>(col, 1.0);
}

// --- Heavy Rigid Balls (Steel / Granite Stone / Burnished Brass) ---
@vertex
fn vsBall(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>, @location(2) uv: vec2<f32>, @builtin(instance_index) inst: u32) -> MeshOut {
  let b = balls[inst];
  let wp = b.model * vec4<f32>(pos, 1.0);
  // Orthogonal rotation + uniform scale -> model upper 3x3 normalizes cleanly
  let wn = normalize((b.model * vec4<f32>(norm, 0.0)).xyz);
  var out: MeshOut;
  out.pos = frame.viewProj * wp;
  out.worldPos = wp.xyz;
  out.worldNorm = wn;
  out.uv = uv;
  out.localPos = pos;
  out.matId = u32(b.params.x + 0.5);
  return out;
}

@fragment
fn fsBall(in: MeshOut) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNorm);
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let lp = normalize(in.localPos);
  let lightPos = frame.lightViewProj * vec4<f32>(in.worldPos + N * 0.008, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0022);

  var albedo = vec3<f32>(0.5);
  var metallic = 0.0;
  var roughness = 0.4;

  // Machined equatorial + meridian indicator rings make 3D spin & rolling immediately visible!
  let eqBand = 1.0 - smoothstep(0.035, 0.065, abs(lp.y));
  let merBand = (1.0 - smoothstep(0.028, 0.055, abs(lp.x))) * smoothstep(0.25, 0.45, abs(lp.y));

  if (in.matId == 0u) {
    // Brushed Dark Tungsten / Chrome-Steel Heavy Sphere
    let latNoise = valueNoise3D(vec3<f32>(lp.y * 42.0, atan2(lp.z, lp.x) * 3.0, 1.0));
    albedo = mix(vec3<f32>(0.42, 0.45, 0.49), vec3<f32>(0.54, 0.57, 0.62), latNoise);
    metallic = 0.94;
    roughness = 0.16 + 0.08 * latNoise;
    // Recessed satin dark lathe groove
    albedo = mix(albedo, vec3<f32>(0.16, 0.18, 0.21), eqBand * 0.85 + merBand * 0.55);
    roughness = mix(roughness, 0.44, eqBand * 0.8 + merBand * 0.5);
  } else if (in.matId == 1u) {
    // Speckled Dark Basalt / Granite Stone Sphere
    let g1 = valueNoise3D(lp * 9.0);
    let g2 = valueNoise3D(lp * 28.0);
    let mica = smoothstep(0.75, 0.90, valueNoise3D(lp * 46.0));
    albedo = mix(vec3<f32>(0.18, 0.19, 0.21), vec3<f32>(0.36, 0.35, 0.33), g1 * 0.65 + g2 * 0.35);
    albedo += vec3<f32>(0.24, 0.23, 0.21) * mica;
    albedo = mix(albedo, vec3<f32>(0.55, 0.52, 0.46), eqBand * 0.45);
    metallic = 0.04;
    roughness = 0.76 - 0.22 * mica;
  } else {
    // Burnished Precision Brass / Bronze Sphere
    let brush = valueNoise3D(vec3<f32>(lp.y * 36.0, lp.x * 6.0, lp.z * 6.0));
    albedo = mix(vec3<f32>(0.84, 0.62, 0.27), vec3<f32>(0.94, 0.76, 0.38), brush);
    metallic = 0.91;
    roughness = 0.20 + 0.07 * brush;
    let twinRing = 1.0 - smoothstep(0.025, 0.048, abs(abs(lp.y) - 0.16));
    albedo = mix(albedo, vec3<f32>(0.28, 0.20, 0.11), twinRing * 0.85 + merBand * 0.45);
    roughness = mix(roughness, 0.46, twinRing * 0.8);
  }

  // Ground contact AO
  let floorAO = smoothstep(0.0, 0.22, in.worldPos.y) * 0.32 + 0.68;
  let col = evalStudioPBR(N, V, albedo, metallic, roughness, shadow, floorAO);
  return vec4<f32>(col, 1.0);
}
`;

  const JELLY_SHADER_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE1_COMMON_UNIFORMS_WGSL}

struct JellyMatParams {
  absorption: array<vec4<f32>, 3>,
  scatter: array<vec4<f32>, 3>,
  tint: array<vec4<f32>, 3>,
};

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<uniform> jellyMat: JellyMatParams;
@group(0) @binding(2) var bgColorTex: texture_2d<f32>;
@group(0) @binding(3) var thickTex: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
@group(0) @binding(5) var shadowMap: texture_depth_2d;
@group(0) @binding(6) var shadowSamp: sampler_comparison;
@group(0) @binding(7) var<storage, read> balls: array<BallInstance>;

struct JellyVOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNorm: vec3<f32>,
  @location(2) viewNorm: vec3<f32>,
  @location(3) isFracture: f32,
  @location(4) @interpolate(flat) jellyId: u32,
};

@vertex
fn vsJelly(
  @location(0) pos: vec3<f32>,
  @location(1) norm: vec3<f32>,
  @location(2) jMeta: vec2<f32> // x = isFracture, y = jellyId
) -> JellyVOut {
  var out: JellyVOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos;
  out.worldNorm = normalize(norm);
  out.viewNorm = normalize((frame.view * vec4<f32>(norm, 0.0)).xyz);
  out.isFracture = jMeta.x;
  out.jellyId = u32(jMeta.y + 0.5);
  return out;
}

// Pass 3: Additive optical thickness estimator (front+back depth-tested against opaque scene)
@fragment
fn fsThickness(in: JellyVOut) -> @location(0) vec4<f32> {
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let N = normalize(in.worldNorm);
  let ndv = abs(dot(N, V));
  let contrib = 0.14 + 0.56 * ndv;
  return vec4<f32>(contrib, 0.0, 0.0, 1.0);
}

// Pass 4: Photorealistic Translucent Gelatin with Screen-Space Refraction, Beer-Lambert Absorption, SSS & Glossy Wet Specular
@fragment
fn fsJelly(in: JellyVOut, @builtin(front_facing) isFront: bool) -> @location(0) vec4<f32> {
  let N = normalize(select(-in.worldNorm, in.worldNorm, isFront));
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let NdotV = max(dot(N, V), 0.001);

  let jid = min(in.jellyId, 2u);
  let sigmaA = jellyMat.absorption[jid].rgb;
  let scatterCol = jellyMat.scatter[jid].rgb;
  let baseTint = jellyMat.tint[jid].rgb;

  let uv = in.pos.xy * frame.screenSize.zw;
  let thickness = max(textureSampleLevel(thickTex, linSamp, uv, 0.0).r, 0.22);

  // Screen-space refraction (IOR ~ 1.38 gelatin -> visibly refracts bench grid & steel ball inside!)
  let vN = normalize(in.viewNorm);
  let refractScale = mix(0.036, 0.055, clamp(thickness * 0.45, 0.0, 1.0)) * (1.0 - 0.35 * in.isFracture);
  let refrUV = clamp(uv + vec2<f32>(-vN.x, vN.y) * refractScale, vec2<f32>(0.002), vec2<f32>(0.998));
  let bgRefr = textureSampleLevel(bgColorTex, linSamp, refrUV, 0.0).rgb;

  // Beer-Lambert optical absorption through gelatin volume: luminous jewel thin edges, deep ruby/amber/emerald cores!
  let optDepth = clamp(thickness * 1.48, 0.25, 3.4);
  let transmittance = exp(-sigmaA * optDepth);

  // Real 3D ball-in-crater contact occlusion & internal shadow (makes ball cupping & dimple contact look ultra-tactile!)
  var ballContactAO = 1.0;
  let bCount = u32(clamp(frame.camPos.w + 0.5, 0.0, 12.0));
  for (var bi = 0u; bi < bCount; bi++) {
    let bCenter = balls[bi].model[3].xyz;
    let bRad = balls[bi].params.y;
    let distToSurf = length(in.worldPos - bCenter) - bRad;
    let occ = smoothstep(0.0, 0.28, distToSurf);
    ballContactAO *= (0.42 + 0.58 * occ);
  }

  // Light shadow on surface
  let lightPos = frame.lightViewProj * vec4<f32>(in.worldPos + N * 0.006, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0020) * ballContactAO;

  // Subsurface scattering: wrap diffuse + back-lit internal transmission glow!
  let wrapKey = clamp((dot(N, KEY_DIR) + 0.52) / 1.52, 0.0, 1.0);
  let wrapFill = clamp((dot(N, FILL_DIR) + 0.48) / 1.48, 0.0, 1.0);
  let backLightKey = pow(clamp(dot(V, -KEY_DIR + N * 0.46), 0.0, 1.0), 2.8);
  let backLightRim = pow(clamp(dot(V, -RIM_DIR + N * 0.38), 0.0, 1.0), 2.4);
  let thinGlow = exp(-optDepth * 0.72);

  let sss = scatterCol * (
    wrapKey * KEY_COL * (0.36 + 0.64 * shadow) * 0.25 +
    wrapFill * FILL_COL * 0.18 +
    (backLightKey * 0.72 + backLightRim * 0.52) * thinGlow * 1.05
  ) * ballContactAO;

  // Rich jewel gelatin body scatter so surface undulations & radial ripples pop unmistakably
  let bodyBody = baseTint * (0.12 + 0.30 * wrapKey * (0.38 + 0.62 * shadow)) * (1.0 - exp(-optDepth * 1.25)) * ballContactAO;

  // Wet gelatin Fresnel (IOR = 1.38 -> F0 = 0.026): crisp glossy studio reflections without pastel wash-out!
  let fresnel = 0.026 + 0.974 * pow(1.0 - NdotV, 4.9);
  let R = reflect(-V, N);
  let envRefl = sampleStudioEnv(R, mix(0.03, 0.11, in.isFracture));

  // Dual-lobe glossy wet gelatin specular highlights (wide sheen + razor-sharp wet highlight across ripples!)
  let Hk = normalize(V + KEY_DIR);
  let Hr = normalize(V + RIM_DIR);
  let specWide = pow(max(dot(N, Hk), 0.0), 54.0) * 0.38 * KEY_COL * (0.30 + 0.70 * shadow);
  let specSharp = pow(max(dot(N, Hk), 0.0), 340.0) * 2.65 * KEY_COL * (0.22 + 0.78 * shadow);
  let specRim = pow(max(dot(N, Hr), 0.0), 115.0) * 1.05 * RIM_COL * ballContactAO;

  // Newly fractured interior gelatin faces catch crisp wet conchoidal facets & luminous crack-edge scattering!
  var fracBoost = vec3<f32>(0.0);
  if (in.isFracture > 0.5) {
    let facetSparkle = pow(max(dot(N, Hk), 0.0), 88.0) * 1.85 + pow(1.0 - NdotV, 1.9) * 0.75;
    fracBoost = mix(scatterCol, vec3<f32>(1.0, 0.90, 0.92), 0.34) * (0.15 + facetSparkle * 0.58);
  }

  // Combine refracted background + rich jewel SSS + razor-sharp glossy reflections
  var color = bgRefr * transmittance * (0.72 + 0.28 * ballContactAO) + sss + bodyBody + fracBoost;
  color = mix(color, envRefl, clamp(fresnel * 0.64, 0.0, 0.68));
  color += specWide + specSharp + specRim;

  // Deep saturated jewel internal-reflection rim at grazing silhouettes (defines contours & ripples dramatically!)
  let edgeContour = pow(1.0 - NdotV, 2.6) * 0.42;
  color = mix(color, color * (0.28 + 0.72 * baseTint) + envRefl * 0.24, edgeContour);

  return vec4<f32>(color, 1.0);
}
`;

  const TONEMAP_SHADER_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}

@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var linSamp: sampler;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vsFull(@builtin(vertex_index) vid: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VOut;
  out.pos = vec4<f32>(p[vid], 0.0, 1.0);
  out.uv = vec2<f32>(p[vid].x * 0.5 + 0.5, 0.5 - p[vid].y * 0.5);
  return out;
}

@fragment
fn fsTonemap(in: VOut) -> @location(0) vec4<f32> {
  let hdr = textureSample(hdrTex, linSamp, in.uv).rgb;
  let mapped = acesTonemap(hdr * 0.96);
  return vec4<f32>(linearToSrgb(mapped), 1.0);
}
`;

  class Scene1Renderer {
    constructor(gpuCore) {
      this.gpu = gpuCore;
      this.device = gpuCore.device;

      this._createStaticMeshes();
      this._createBuffers();
      this._createPipelines();
      this._createScreenTargets(gpuCore.width, gpuCore.height);

      gpuCore.onResize((w, h) => this._createScreenTargets(w, h));
    }

    _createStaticMeshes() {
      const dev = this.device;
      // Main architectural limestone bench top slab: 7.2 x 0.26 x 4.6, top at y = 0
      this.benchMesh = uploadMesh(dev, createBoxMesh(7.2, 0.26, 4.6, 0, -0.13, 0));
      // Sleek aluminum recessed trim rails around perimeter (sits 0.06 above bench surface)
      const trimParts = [
        createBoxMesh(7.32, 0.08, 0.08, 0, 0.02, -2.30),
        createBoxMesh(7.32, 0.08, 0.08, 0, 0.02, 2.30),
        createBoxMesh(0.08, 0.08, 4.52, -3.62, 0.02, 0),
        createBoxMesh(0.08, 0.08, 4.52, 3.62, 0.02, 0)
      ];
      // Merge trim boxes into one buffer
      let vLen = 0, iLen = 0;
      for (const p of trimParts) { vLen += p.vertices.length; iLen += p.indices.length; }
      const verts = new Float32Array(vLen);
      const inds = new Uint32Array(iLen);
      let vOff = 0, iOff = 0, vBase = 0;
      for (const p of trimParts) {
        verts.set(p.vertices, vOff);
        for (let k = 0; k < p.indices.length; k++) inds[iOff + k] = p.indices[k] + vBase;
        vOff += p.vertices.length;
        iOff += p.indices.length;
        vBase += p.vertices.length / 8;
      }
      this.trimMesh = uploadMesh(dev, { vertices: verts, indices: inds });
    }

    _createBuffers() {
      const dev = this.device;
      // FrameUniforms: 4 mat4 (256) + 2 vec4 (32) + 6 vec4 (96) = 384 bytes -> round to 400
      this.frameUniformBuf = dev.createBuffer({
        size: 416,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.frameUniformData = new Float32Array(104);

      // Jelly material buffer: 9 vec4 = 144 bytes
      this.jellyMatBuf = dev.createBuffer({
        size: 160,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      // Dynamic rigid ball instance storage buffer (12 balls * 80 bytes)
      this.ballBuf = dev.createBuffer({
        size: MAX_BALLS * 80,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.ballData = new Float32Array(MAX_BALLS * 20);

      // Dynamic jelly vertex buffer (8 floats per vertex: pos3, norm3, frac, jellyId)
      this.jellyVB = dev.createBuffer({
        size: MAX_JELLY_VERTS * 8 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    }

    _createPipelines() {
      const dev = this.device;
      const meshLayout = [{
        arrayStride: 32,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' }
        ]
      }];
      const jellyLayout = [{
        arrayStride: 32,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' }
        ]
      }];

      // --- Shadow Pipelines ---
      const shadowMod = dev.createShaderModule({ code: SHADOW_SHADER_WGSL });
      const shadowBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
        ]
      });
      const shadowPL = dev.createPipelineLayout({ bindGroupLayouts: [shadowBGL] });
      this.shadowBG = dev.createBindGroup({
        layout: shadowBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf } },
          { binding: 1, resource: { buffer: this.ballBuf } }
        ]
      });
      const makeShadowPipe = (entry, vLayout) => dev.createRenderPipeline({
        layout: shadowPL,
        vertex: { module: shadowMod, entryPoint: entry, buffers: vLayout },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 }
      });
      this.shadowStaticPipe = makeShadowPipe('vsStatic', meshLayout);
      this.shadowBallPipe = makeShadowPipe('vsBall', meshLayout);
      this.shadowJellyPipe = makeShadowPipe('vsJelly', jellyLayout);

      // --- Opaque Studio Pass Pipelines ---
      const opaqueMod = dev.createShaderModule({ code: OPAQUE_SHADER_WGSL });
      const opaqueBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
        ]
      });
      const opaquePL = dev.createPipelineLayout({ bindGroupLayouts: [opaqueBGL] });
      this.opaqueBG = dev.createBindGroup({
        layout: opaqueBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf } },
          { binding: 1, resource: { buffer: this.ballBuf } },
          { binding: 2, resource: this.gpu.shadowView },
          { binding: 3, resource: this.gpu.shadowSampler }
        ]
      });

      this.backdropPipe = dev.createRenderPipeline({
        layout: opaquePL,
        vertex: { module: opaqueMod, entryPoint: 'vsBackdrop' },
        fragment: { module: opaqueMod, entryPoint: 'fsBackdrop', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' }
      });

      const makeOpaqueMeshPipe = (vEntry, fEntry) => dev.createRenderPipeline({
        layout: opaquePL,
        vertex: { module: opaqueMod, entryPoint: vEntry, buffers: meshLayout },
        fragment: { module: opaqueMod, entryPoint: fEntry, targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
      });
      this.benchPipe = makeOpaqueMeshPipe('vsBench', 'fsBench');
      this.trimPipe = makeOpaqueMeshPipe('vsTrim', 'fsBench');
      this.ballPipe = makeOpaqueMeshPipe('vsBall', 'fsBall');

      // --- Jelly Thickness & Translucent Refraction Pipelines ---
      const jellyMod = dev.createShaderModule({ code: JELLY_SHADER_WGSL });
      const thickBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
        ]
      });
      this.thickBG = dev.createBindGroup({
        layout: thickBGL,
        entries: [{ binding: 0, resource: { buffer: this.frameUniformBuf } }]
      });
      this.jellyBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
          { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
        ]
      });
      const thickPL = dev.createPipelineLayout({ bindGroupLayouts: [thickBGL] });
      const jellyPL = dev.createPipelineLayout({ bindGroupLayouts: [this.jellyBGL] });

      this.thickPipe = dev.createRenderPipeline({
        layout: thickPL,
        vertex: { module: jellyMod, entryPoint: 'vsJelly', buffers: jellyLayout },
        fragment: {
          module: jellyMod,
          entryPoint: 'fsThickness',
          targets: [{
            format: 'r16float',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' }
      });

      this.jellyPipe = dev.createRenderPipeline({
        layout: jellyPL,
        vertex: { module: jellyMod, entryPoint: 'vsJelly', buffers: jellyLayout },
        fragment: { module: jellyMod, entryPoint: 'fsJelly', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
      });

      // --- Tonemap Pipeline ---
      const tmMod = dev.createShaderModule({ code: TONEMAP_SHADER_WGSL });
      this.tonemapBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
        ]
      });
      this.tonemapPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.tonemapBGL] }),
        vertex: { module: tmMod, entryPoint: 'vsFull' },
        fragment: { module: tmMod, entryPoint: 'fsTonemap', targets: [{ format: this.gpu.format }] },
        primitive: { topology: 'triangle-list' }
      });
    }

    _createScreenTargets(w, h) {
      if (this.opaqueColorTex) this.opaqueColorTex.destroy();
      if (this.hdrFinalTex) this.hdrFinalTex.destroy();
      if (this.depthTex) this.depthTex.destroy();
      if (this.thickTex) this.thickTex.destroy();

      const dev = this.device;
      this.opaqueColorTex = dev.createTexture({
        size: [w, h],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
      });
      this.hdrFinalTex = dev.createTexture({
        size: [w, h],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });
      this.depthTex = dev.createTexture({
        size: [w, h],
        format: 'depth32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.thickTex = dev.createTexture({
        size: [w, h],
        format: 'r16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });

      this.opaqueColorView = this.opaqueColorTex.createView();
      this.hdrFinalView = this.hdrFinalTex.createView();
      this.depthView = this.depthTex.createView();
      this.thickView = this.thickTex.createView();

      this.jellyBG = dev.createBindGroup({
        layout: this.jellyBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf } },
          { binding: 1, resource: { buffer: this.jellyMatBuf } },
          { binding: 2, resource: this.opaqueColorView },
          { binding: 3, resource: this.thickView },
          { binding: 4, resource: this.gpu.linearSampler },
          { binding: 5, resource: this.gpu.shadowView },
          { binding: 6, resource: this.gpu.shadowSampler },
          { binding: 7, resource: { buffer: this.ballBuf } }
        ]
      });

      this.tonemapBG = dev.createBindGroup({
        layout: this.tonemapBGL,
        entries: [
          { binding: 0, resource: this.hdrFinalView },
          { binding: 1, resource: this.gpu.linearSampler }
        ]
      });
    }

    render(physics, camera) {
      const dev = this.device;
      const w = this.gpu.width, h = this.gpu.height;
      camera.updateMatrices(w / Math.max(1, h));

      // Compute directional key-light view-proj covering bench & airborne balls
      const lView = Mat4.create();
      const lProj = Mat4.create();
      const lVP = Mat4.create();
      Mat4.lookAt(lView, [4.25, 8.18, 3.88], [0, 0.5, 0], [0, 1, 0]);
      Mat4.orthoZO(lProj, -4.8, 4.8, -3.8, 4.6, 1.0, 22.0);
      Mat4.multiply(lVP, lProj, lView);

      // Update frame uniforms (camPos.w stores active ball count for ball-in-crater contact AO!)
      const ballCount = Math.min(physics.balls.length, MAX_BALLS);
      const fu = this.frameUniformData;
      fu.set(camera.viewProj, 0);
      fu.set(camera.invViewProj, 16);
      fu.set(camera.view, 32);
      fu.set(lVP, 48);
      fu[64] = camera.eye[0]; fu[65] = camera.eye[1]; fu[66] = camera.eye[2]; fu[67] = ballCount;
      fu[68] = w; fu[69] = h; fu[70] = 1 / w; fu[71] = 1 / h;

      // Update jelly bounds & material properties for colored caustic shadows & translucent shading
      const jm = new Float32Array(36);
      for (let i = 0; i < 3; i++) {
        const j = physics.jellies[i];
        if (j) {
          const b = j.computeBounds();
          fu[72 + i * 4] = b.cx;
          fu[72 + i * 4 + 1] = b.cy;
          fu[72 + i * 4 + 2] = b.cz;
          fu[72 + i * 4 + 3] = Math.max(b.rx, b.rz, 0.35);
          fu[84 + i * 4] = j.scatterColor[0];
          fu[84 + i * 4 + 1] = j.scatterColor[1];
          fu[84 + i * 4 + 2] = j.scatterColor[2];
          fu[84 + i * 4 + 3] = 1.0;

          jm[i * 4] = j.absorption[0]; jm[i * 4 + 1] = j.absorption[1]; jm[i * 4 + 2] = j.absorption[2];
          jm[12 + i * 4] = j.scatterColor[0]; jm[12 + i * 4 + 1] = j.scatterColor[1]; jm[12 + i * 4 + 2] = j.scatterColor[2];
          jm[24 + i * 4] = j.baseTint[0]; jm[24 + i * 4 + 1] = j.baseTint[1]; jm[24 + i * 4 + 2] = j.baseTint[2];
        } else {
          fu[84 + i * 4 + 3] = 0.0;
        }
      }
      dev.queue.writeBuffer(this.frameUniformBuf, 0, fu);
      dev.queue.writeBuffer(this.jellyMatBuf, 0, jm);

      // Upload rigid ball instances
      const tmpMat = Mat4.create();
      for (let i = 0; i < ballCount; i++) {
        const b = physics.balls[i];
        Mat4.fromRotationTranslationScale(tmpMat, b.quat, b.pos, [b.radius, b.radius, b.radius]);
        this.ballData.set(tmpMat, i * 20);
        this.ballData[i * 20 + 16] = b.material;
        this.ballData[i * 20 + 17] = b.radius;
      }
      if (ballCount > 0) {
        dev.queue.writeBuffer(this.ballBuf, 0, this.ballData.subarray(0, ballCount * 20));
      }

      // Upload packed jelly triangle vertices
      const jVertCount = Math.min(physics.renderVertCount, MAX_JELLY_VERTS);
      if (jVertCount > 0) {
        dev.queue.writeBuffer(this.jellyVB, 0, physics.renderVerts.subarray(0, jVertCount * 8));
      }

      const enc = dev.createCommandEncoder();

      // --- Pass 1: Shadow Map ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.gpu.shadowView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.shadowBG);
        pass.setPipeline(this.shadowStaticPipe);
        pass.setVertexBuffer(0, this.benchMesh.vb);
        pass.setIndexBuffer(this.benchMesh.ib, 'uint32');
        pass.drawIndexed(this.benchMesh.indexCount);

        if (ballCount > 0) {
          pass.setPipeline(this.shadowBallPipe);
          pass.setVertexBuffer(0, this.gpu.sphereMesh.vb);
          pass.setIndexBuffer(this.gpu.sphereMesh.ib, 'uint32');
          pass.drawIndexed(this.gpu.sphereMesh.indexCount, ballCount);
        }
        if (jVertCount > 0) {
          pass.setPipeline(this.shadowJellyPipe);
          pass.setVertexBuffer(0, this.jellyVB);
          pass.draw(jVertCount);
        }
        pass.end();
      }

      // --- Pass 2: Opaque Studio Scene (Cyclorama + Bench + Trim + Rigid Balls) ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.opaqueColorView,
            clearValue: { r: 0.82, g: 0.86, b: 0.90, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: this.depthView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.opaqueBG);

        pass.setPipeline(this.backdropPipe);
        pass.draw(3);

        pass.setPipeline(this.benchPipe);
        pass.setVertexBuffer(0, this.benchMesh.vb);
        pass.setIndexBuffer(this.benchMesh.ib, 'uint32');
        pass.drawIndexed(this.benchMesh.indexCount);

        pass.setPipeline(this.trimPipe);
        pass.setVertexBuffer(0, this.trimMesh.vb);
        pass.setIndexBuffer(this.trimMesh.ib, 'uint32');
        pass.drawIndexed(this.trimMesh.indexCount);

        if (ballCount > 0) {
          pass.setPipeline(this.ballPipe);
          pass.setVertexBuffer(0, this.gpu.sphereMesh.vb);
          pass.setIndexBuffer(this.gpu.sphereMesh.ib, 'uint32');
          pass.drawIndexed(this.gpu.sphereMesh.indexCount, ballCount);
        }
        pass.end();
      }

      // --- Pass 3: Jelly Optical Thickness ---
      if (jVertCount > 0) {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.thickView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: this.depthView,
            depthLoadOp: 'load',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.thickBG);
        pass.setPipeline(this.thickPipe);
        pass.setVertexBuffer(0, this.jellyVB);
        pass.draw(jVertCount);
        pass.end();
      }

      // Copy opaque HDR buffer to hdrFinalTex so Jelly pass can sample opaqueColorTex for screen-space refraction!
      enc.copyTextureToTexture(
        { texture: this.opaqueColorTex },
        { texture: this.hdrFinalTex },
        [w, h, 1]
      );

      // --- Pass 4: Translucent Refractive SSS Jelly onto hdrFinalTex ---
      if (jVertCount > 0) {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.hdrFinalView,
            loadOp: 'load',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: this.depthView,
            depthLoadOp: 'load',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.jellyBG);
        pass.setPipeline(this.jellyPipe);
        pass.setVertexBuffer(0, this.jellyVB);
        pass.draw(jVertCount);
        pass.end();
      }

      // --- Pass 5: ACES Filmic Tonemap -> Swapchain ---
      {
        const swapView = this.gpu.context.getCurrentTexture().createView();
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: swapView,
            clearValue: { r: 0.85, g: 0.88, b: 0.92, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        pass.setBindGroup(0, this.tonemapBG);
        pass.setPipeline(this.tonemapPipe);
        pass.draw(3);
        pass.end();
      }

      dev.queue.submit([enc.finish()]);
    }
  }

  App.Scene1Renderer = Scene1Renderer;
})(window);
