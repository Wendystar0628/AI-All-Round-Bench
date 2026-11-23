// js/scene2-renderer.js — 6-Pass WebGPU SSFR Water, Narrow-Range Filter, Caustics, Multi-Density Spheres & Optical Glass Tank
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { Mat4 } = App.Math;
  const { COMMON_STUDIO_WGSL, createBoxMesh, createCylinderXMesh, uploadMesh } = App.GPU;
  const { SCENE2_DOMAIN_WGSL, FLUID_STRUCTS_WGSL } = App.Scene2WGSL;

  const SCENE2_FRAME_UNIFORM_WGSL = /* wgsl */ `
struct Frame2Uniforms {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  invProj: mat4x4<f32>,
  invView: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  screenSize: vec4<f32>,  // w, h, 1/w, 1/h
  tankOffset: vec4<f32>,  // (-3.25, 0.0, -1.0, paddleX)
  filterParams: vec4<f32>, // x = dirX, y = dirY, z = radiusPx, w = simTime
};

fn tankToWorld(p: vec3<f32>, off: vec3<f32>) -> vec3<f32> {
  return p + off;
}
`;

  // Shader 1: Shadow Map (Bench + Terrain + Wavemaker Paddle + 28 Rigid Spheres)
  const S2_SHADOW_WGSL = /* wgsl */ `
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var<storage, read> spheres: array<RigidSphere>;

fn rotateByQuat(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vsStatic(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  return frame.lightViewProj * vec4<f32>(pos, 1.0);
}

@vertex
fn vsPaddle(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
  let wp = pos + vec3<f32>(frame.tankOffset.x + frame.tankOffset.w, 0.0, 0.0);
  return frame.lightViewProj * vec4<f32>(wp, 1.0);
}

@vertex
fn vsSphere(@location(0) pos: vec3<f32>, @builtin(instance_index) inst: u32) -> @builtin(position) vec4<f32> {
  let sp = spheres[inst];
  let lp = rotateByQuat(pos * sp.posRad.w, sp.quat);
  let wp = lp + sp.posRad.xyz + frame.tankOffset.xyz;
  return frame.lightViewProj * vec4<f32>(wp, 1.0);
}
`;

  // Shader 2: Opaque Scene (Cyclorama + Studio Bench + Sculpted Reef with Live Caustics + Mechanical Wavemaker + 4-Group Density Spheres)
  const S2_OPAQUE_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var<storage, read> spheres: array<RigidSphere>;
@group(0) @binding(2) var<storage, read> causticMap: array<f32>;
@group(0) @binding(3) var<storage, read> surfHeight: array<f32>;
@group(0) @binding(4) var shadowMap: texture_depth_2d;
@group(0) @binding(5) var shadowSamp: sampler_comparison;

fn rotateByQuat(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn sampleCausticBilinear(tankX: f32, tankZ: f32) -> f32 {
  let fx = clamp((tankX / TANK_L) * f32(CAUST_W) - 0.5, 0.0, f32(CAUST_W) - 1.001);
  let fz = clamp((tankZ / TANK_W) * f32(CAUST_H) - 0.5, 0.0, f32(CAUST_H) - 1.001);
  let x0 = u32(floor(fx)); let z0 = u32(floor(fz));
  let x1 = min(x0 + 1u, CAUST_W - 1u); let z1 = min(z0 + 1u, CAUST_H - 1u);
  let tx = fx - f32(x0); let tz = fz - f32(z0);
  let c00 = causticMap[z0 * CAUST_W + x0];
  let c10 = causticMap[z0 * CAUST_W + x1];
  let c01 = causticMap[z1 * CAUST_W + x0];
  let c11 = causticMap[z1 * CAUST_W + x1];
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), tz);
}

fn sampleWaterSurfH(tankX: f32, tankZ: f32) -> f32 {
  let ix = u32(clamp(i32(tankX * INV_H), 0, i32(NX) - 1));
  let iz = u32(clamp(i32(tankZ * INV_H), 0, i32(NZ) - 1));
  return surfHeight[iz * NX + ix];
}

// --- Backdrop ---
struct BgOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
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
  return vec4<f32>(evalStudioBackdrop(rayDir, in.uv), 1.0);
}

struct MeshOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNorm: vec3<f32>,
  @location(2) localPos: vec3<f32>,
  @location(3) @interpolate(flat) matId: u32,
};

@vertex
fn vsBench(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> MeshOut {
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos; out.worldNorm = norm; out.localPos = pos; out.matId = 0u;
  return out;
}

@vertex
fn vsFrameMetal(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> MeshOut {
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos; out.worldNorm = norm; out.localPos = pos; out.matId = 1u;
  return out;
}

@vertex
fn vsTerrain(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> MeshOut {
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos; out.worldNorm = norm; out.localPos = pos - frame.tankOffset.xyz; out.matId = 2u;
  return out;
}

@vertex
fn vsPaddleBoard(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> MeshOut {
  let wp = pos + vec3<f32>(frame.tankOffset.x + frame.tankOffset.w, 0.0, 0.0);
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(wp, 1.0);
  out.worldPos = wp; out.worldNorm = norm; out.localPos = pos; out.matId = 3u;
  return out;
}

@vertex
fn vsPaddleRod(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> MeshOut {
  // Extends left from moving paddle through left collar
  let wp = pos + vec3<f32>(frame.tankOffset.x + frame.tankOffset.w, 0.0, 0.0);
  var out: MeshOut;
  out.pos = frame.viewProj * vec4<f32>(wp, 1.0);
  out.worldPos = wp; out.worldNorm = norm; out.localPos = pos; out.matId = 4u;
  return out;
}

@fragment
fn fsOpaque(in: MeshOut) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNorm);
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let lightPos = frame.lightViewProj * vec4<f32>(in.worldPos + N * 0.008, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0020);

  if (in.matId == 0u) {
    // Unified Architectural Limestone Studio Bench (identical gallery tone to Scene 1!)
    let n1 = valueNoise3D(in.worldPos * 6.5);
    let n2 = valueNoise3D(in.worldPos * 26.0);
    var albedo = vec3<f32>(0.47, 0.48, 0.49) * (0.94 + 0.07 * n1 + 0.03 * n2);
    if (N.y > 0.8) {
      let gx = abs(fract(in.worldPos.x * 2.0 + 0.5) - 0.5) * 2.0;
      let gz = abs(fract(in.worldPos.z * 2.0 + 0.5) - 0.5) * 2.0;
      let grid = 1.0 - smoothstep(0.010, 0.024, min(gx, gz));
      albedo = mix(albedo, vec3<f32>(0.34, 0.38, 0.44), grid * 0.30);
    }
    let col = evalStudioPBR(N, V, albedo, 0.02, 0.64, shadow, 1.0);
    return vec4<f32>(col, 1.0);
  }

  if (in.matId == 1u) {
    // Dark anodized brushed architectural aluminum tank base rail & actuator housing
    let br = valueNoise3D(in.worldPos * vec3<f32>(8.0, 40.0, 8.0));
    let albedo = vec3<f32>(0.24, 0.27, 0.31) * (0.92 + 0.12 * br);
    return vec4<f32>(evalStudioPBR(N, V, albedo, 0.84, 0.30, shadow, 1.0), 1.0);
  }

  if (in.matId == 3u) {
    // Visible Mechanical Wavemaker Paddle Board (Precision ribbed slate-aluminum with hazard/scale marker bars!)
    let rib = smoothstep(0.45, 0.55, sin(in.localPos.y * 28.0) * 0.5 + 0.5);
    let stripe = 1.0 - smoothstep(0.04, 0.07, abs(in.localPos.y - 1.02));
    var albedo = mix(vec3<f32>(0.32, 0.36, 0.41), vec3<f32>(0.48, 0.52, 0.58), rib);
    albedo = mix(albedo, vec3<f32>(0.90, 0.42, 0.16), stripe * 0.85); // Clean orange waterline calibration stripe!
    let col = evalStudioPBR(N, V, albedo, 0.78, 0.32, shadow, 1.0);
    return vec4<f32>(col, 1.0);
  }

  if (in.matId == 4u) {
    // Gleaming Chrome Hydraulic Actuator Push-Rods
    let col = evalStudioPBR(N, V, vec3<f32>(0.84, 0.87, 0.90), 0.96, 0.12, shadow, 1.0);
    return vec4<f32>(col, 1.0);
  }

  // matId == 2u: Sculpted Underwater Travertine / Sandstone Reef Terrain + LIVE ANIMATED UNDERWATER CAUSTICS!
  let tp = in.localPos; // tank coordinates [0..6.5, 0..2.5, 0..2.0]
  let n1 = valueNoise3D(tp * 5.0);
  let n2 = valueNoise3D(tp * 20.0);
  // Subtle bathymetric contour bands make underwater slope & reef geometry ultra clear!
  let contour = 1.0 - smoothstep(0.03, 0.08, abs(fract(tp.y * 8.0) - 0.5) * 2.0);
  let sandLow = vec3<f32>(0.76, 0.77, 0.75);
  let rockHigh = vec3<f32>(0.64, 0.67, 0.69);
  var albedo = mix(sandLow, rockHigh, smoothstep(0.08, 0.52, tp.y)) * (0.93 + 0.10 * n1 + 0.04 * n2);
  albedo = mix(albedo, vec3<f32>(0.52, 0.56, 0.60), contour * 0.18 * smoothstep(0.04, 0.12, tp.y));

  // Subtle floor distance ticks along tank length
  let xTick = (1.0 - smoothstep(0.012, 0.025, abs(fract(tp.x) - 0.5) * 2.0)) * smoothstep(0.18, 0.05, tp.y);
  albedo = mix(albedo, vec3<f32>(0.58, 0.62, 0.66), xTick * 0.25);

  var col = evalStudioPBR(N, V, albedo, 0.02, 0.72, shadow, 1.0);

  // Project live 3D-surface-derived ray-traced underwater caustics onto submerged tank bed & reef!
  let surfH = sampleWaterSurfH(tp.x, tp.z);
  let isUnderwater = smoothstep(tp.y - 0.02, tp.y + 0.08, surfH);
  if (isUnderwater > 0.01 && tp.x > frame.tankOffset.w + 0.02) {
    let caust = sampleCausticBilinear(tp.x, tp.z);
    // Crisp dancing bright aqua-sunlight ribbons + dark caustic troughs (high contrast!)
    let caustIntensity = clamp(caust, 0.0, 3.2);
    let darkMod = mix(0.76, 1.0, smoothstep(0.25, 0.95, caustIntensity));
    let brightRibbon = max(0.0, caustIntensity - 0.85) * 0.92;
    let caustCol = vec3<f32>(0.72, 0.96, 1.05) * brightRibbon * max(dot(N, KEY_DIR), 0.15) * (0.35 + 0.65 * shadow);
    col = col * mix(1.0, darkMod, isUnderwater) + caustCol * isUnderwater;
  }

  return vec4<f32>(col, 1.0);
}

// --- 28 Same-Size Multi-Density Rigid Spheres (4 vivid studio groups + rolling indicator stripe + underwater caustics!) ---
struct SphereOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNorm: vec3<f32>,
  @location(2) localPos: vec3<f32>,
  @location(3) tankPos: vec3<f32>,
  @location(4) @interpolate(flat) groupId: u32,
  @location(5) fSub: f32,
};

@vertex
fn vsSphere(
  @location(0) pos: vec3<f32>,
  @location(1) norm: vec3<f32>,
  @builtin(instance_index) inst: u32
) -> SphereOut {
  let sp = spheres[inst];
  let rp = rotateByQuat(pos * sp.posRad.w, sp.quat);
  let rn = normalize(rotateByQuat(norm, sp.quat));
  let tp = rp + sp.posRad.xyz;
  let wp = tp + frame.tankOffset.xyz;
  var out: SphereOut;
  out.pos = frame.viewProj * vec4<f32>(wp, 1.0);
  out.worldPos = wp;
  out.worldNorm = rn;
  out.localPos = pos;
  out.tankPos = tp;
  out.groupId = u32(clamp(sp.velGroup.w + 0.5, 0.0, 3.0));
  out.fSub = sp.angSub.w;
  return out;
}

@fragment
fn fsSphere(in: SphereOut) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNorm);
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let lp = normalize(in.localPos);
  let lightPos = frame.lightViewProj * vec4<f32>(in.worldPos + N * 0.008, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0022);

  // Clean dual meridian + equatorial band reveals spinning/rolling motion in waves & along floor!
  let eqBand = 1.0 - smoothstep(0.05, 0.085, abs(lp.y));
  let merBand = (1.0 - smoothstep(0.045, 0.078, abs(lp.x))) * smoothstep(0.20, 0.40, abs(lp.y));
  let stripe = clamp(eqBand + merBand * 0.85, 0.0, 1.0);

  var baseCol = vec3<f32>(0.95, 0.25, 0.14);
  var stripeCol = vec3<f32>(0.98, 0.96, 0.94);
  var metallic = 0.06;
  var rough = 0.24;

  if (in.groupId == 0u) {
    // Group 0: Low Density (0.35) — Vivid Coral-Orange Floater
    baseCol = vec3<f32>(0.96, 0.22, 0.11);
    stripeCol = vec3<f32>(0.98, 0.95, 0.90);
    rough = 0.26;
  } else if (in.groupId == 1u) {
    // Group 1: Light Buoyant (0.72) — Radiant Sunburst Gold-Yellow
    baseCol = vec3<f32>(0.94, 0.68, 0.05);
    stripeCol = vec3<f32>(0.24, 0.20, 0.14);
    rough = 0.22;
  } else if (in.groupId == 2u) {
    // Group 2: Neutral Buoyancy (1.00) — Vivid Royal Violet-Cobalt
    baseCol = vec3<f32>(0.17, 0.30, 0.92);
    stripeCol = vec3<f32>(0.90, 0.95, 1.0);
    rough = 0.20;
  } else {
    // Group 3: High Density (2.40) — Dark Obsidian-Slate Metallic with Warm Copper Band
    baseCol = vec3<f32>(0.15, 0.17, 0.22);
    stripeCol = vec3<f32>(0.88, 0.58, 0.30);
    metallic = 0.68;
    rough = 0.24;
  }

  let albedo = mix(baseCol, stripeCol, stripe);
  let finMetal = select(metallic, 0.85, in.groupId == 3u && stripe > 0.5);
  var col = evalStudioPBR(N, V, albedo, finMetal, rough, shadow, 1.0);

  // Dynamic underwater caustics dappled onto submerged spheres!
  let surfH = sampleWaterSurfH(in.tankPos.x, in.tankPos.z);
  let under = smoothstep(in.tankPos.y - 0.02, in.tankPos.y + 0.06, surfH);
  if (under > 0.01) {
    let caust = sampleCausticBilinear(in.tankPos.x, in.tankPos.z);
    let boost = max(0.0, caust - 0.85) * 0.72 * max(dot(N, KEY_DIR), 0.0);
    col += vec3<f32>(0.68, 0.95, 1.05) * boost * under;
  }

  return vec4<f32>(col, 1.0);
}
`;

  // Shader 3: Screen-Space Fluid Particle Splatting (Depth + Foam + Optical Thickness)
  const S2_FLUID_SPLAT_WGSL = /* wgsl */ `
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var<storage, read> particles: array<FluidParticle>;
@group(0) @binding(2) var bgDepthTex: texture_depth_2d;

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) localUV: vec2<f32>,
  @location(1) viewCenter: vec3<f32>,
  @location(2) radFoam: vec2<f32>, // x = radius, y = foamFactor
};

const QUAD_OFFS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
);

fn splatVert(vid: u32, inst: u32, radius: f32) -> SplatOut {
  let pt = particles[inst];
  var out: SplatOut;
  if (pt.vel.w < 0.5) {
    out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.localUV = vec2<f32>(0.0);
    out.viewCenter = vec3<f32>(0.0);
    out.radFoam = vec2<f32>(0.0);
    return out;
  }
  let wp = pt.pos.xyz + frame.tankOffset.xyz;
  let vp = (frame.view * vec4<f32>(wp, 1.0)).xyz;
  let q = QUAD_OFFS[vid];
  let cornerView = vp + vec3<f32>(q * radius, 0.0);
  out.pos = frame.proj * vec4<f32>(cornerView, 1.0);
  out.localUV = q;
  out.viewCenter = vp;
  out.radFoam = vec2<f32>(radius, pt.pos.w);
  return out;
}

@vertex
fn vsDepth(@builtin(vertex_index) vid: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  return splatVert(vid, inst, 0.064);
}

@vertex
fn vsThick(@builtin(vertex_index) vid: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  return splatVert(vid, inst, 0.076);
}

struct DepthFragOut {
  @builtin(frag_depth) fragDepth: f32,
  @location(0) linDepth: vec4<f32>, // r = linear view depth (-viewZ)
  @location(1) foam: vec4<f32>,
};

@fragment
fn fsDepth(in: SplatOut) -> DepthFragOut {
  let r2 = dot(in.localUV, in.localUV);
  if (r2 > 1.0) { discard; }
  let zOff = sqrt(1.0 - r2) * in.radFoam.x;
  let sphereView = vec3<f32>(in.viewCenter.xy + in.localUV * in.radFoam.x, in.viewCenter.z + zOff);
  let clip = frame.proj * vec4<f32>(sphereView, 1.0);
  let ndcZ = clip.z / clip.w;
  if (ndcZ < 0.0 || ndcZ > 1.0) { discard; }

  // Exact occlusion against opaque spheres, terrain, paddle & bench!
  let px = vec2<i32>(in.pos.xy);
  let bgZ = textureLoad(bgDepthTex, px, 0);
  if (ndcZ >= bgZ) { discard; }

  var out: DepthFragOut;
  out.fragDepth = ndcZ;
  out.linDepth = vec4<f32>(-sphereView.z, 0.0, 0.0, 1.0);
  out.foam = vec4<f32>(in.radFoam.y, 0.0, 0.0, 1.0);
  return out;
}

@fragment
fn fsThick(in: SplatOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.localUV, in.localUV);
  if (r2 > 1.0) { discard; }
  let sphereView = vec3<f32>(in.viewCenter.xy + in.localUV * in.radFoam.x, in.viewCenter.z);
  let clip = frame.proj * vec4<f32>(sphereView, 1.0);
  let ndcZ = clip.z / clip.w;
  let px = vec2<i32>(in.pos.xy);
  let bgZ = textureLoad(bgDepthTex, px, 0);
  if (ndcZ >= bgZ) { discard; }
  let w = (1.0 - r2);
  return vec4<f32>(w * w * 0.052, 0.0, 0.0, 1.0);
}
`;

  // Shader 4: Narrow-Range Bilateral Depth Smoothing (Truong & Yuksel 2018) + Water Composite!
  const S2_FILTER_AND_COMPOSITE_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE2_DOMAIN_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var depthInTex: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vsFull(@builtin(vertex_index) vid: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VOut;
  out.pos = vec4<f32>(p[vid], 0.0, 1.0);
  out.uv = vec2<f32>(p[vid].x * 0.5 + 0.5, 0.5 - p[vid].y * 0.5);
  return out;
}

// Separable Narrow-Range Bilateral Filter -> liquid-glass smooth water surface while preserving crisp splash edges!
@fragment
fn fsNarrowRangeFilter(in: VOut) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(i32(frame.screenSize.x), i32(frame.screenSize.y));
  let p = vec2<i32>(in.pos.xy);
  let dC = textureLoad(depthInTex, p, 0).r;
  if (dC > 500.0) { return vec4<f32>(dC, 0.0, 0.0, 1.0); }

  let dir = vec2<i32>(i32(round(frame.filterParams.x)), i32(round(frame.filterParams.y)));
  let rad = i32(clamp(frame.filterParams.z, 2.0, 14.0));
  let sigmaS = f32(rad) * 0.55;
  let inv2SS = 1.0 / (2.0 * sigmaS * sigmaS);

  // Adaptive narrow-range threshold (preserves discontinuities between splashing crests & background water!)
  let thresh = 0.095 + 0.012 * dC;
  var lower = dC - thresh;
  var upper = dC + thresh;
  var sum = dC;
  var wSum = 1.0;

  for (var k = 1; k <= 14; k++) {
    if (k > rad) { break; }
    let wS = exp(-f32(k * k) * inv2SS);

    let p1 = clamp(p + dir * k, vec2<i32>(0), dims - vec2<i32>(1));
    let d1 = textureLoad(depthInTex, p1, 0).r;
    if (d1 < 500.0) {
      if (d1 >= lower && d1 <= upper) {
        sum += d1 * wS;
        wSum += wS;
        upper = max(upper, d1 + thresh * 0.35);
        lower = min(lower, d1 - thresh * 0.35);
      } else if (d1 > upper && d1 < dC + thresh * 2.4) {
        // Clamp background sample to upper edge (narrow-range edge preservation!)
        sum += upper * wS * 0.35;
        wSum += wS * 0.35;
      }
    }

    let p2 = clamp(p - dir * k, vec2<i32>(0), dims - vec2<i32>(1));
    let d2 = textureLoad(depthInTex, p2, 0).r;
    if (d2 < 500.0) {
      if (d2 >= lower && d2 <= upper) {
        sum += d2 * wS;
        wSum += wS;
        upper = max(upper, d2 + thresh * 0.35);
        lower = min(lower, d2 - thresh * 0.35);
      } else if (d2 > upper && d2 < dC + thresh * 2.4) {
        sum += upper * wS * 0.35;
        wSum += wS * 0.35;
      }
    }
  }

  return vec4<f32>(sum / wSum, 0.0, 0.0, 1.0);
}
`;

  // Shader 5: Water Optical Composite (Refraction + Beer-Lambert Clear Aqua + Fresnel Studio Reflection + Surface Foam)
  const S2_WATER_COMPOSITE_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE2_DOMAIN_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var bgColorTex: texture_2d<f32>;
@group(0) @binding(2) var bgDepthTex: texture_depth_2d;
@group(0) @binding(3) var fluidDepthTex: texture_2d<f32>;
@group(0) @binding(4) var fluidThickTex: texture_2d<f32>;
@group(0) @binding(5) var fluidFoamTex: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;
@group(0) @binding(7) var shadowMap: texture_depth_2d;
@group(0) @binding(8) var shadowSamp: sampler_comparison;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vsFull(@builtin(vertex_index) vid: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VOut;
  out.pos = vec4<f32>(p[vid], 0.0, 1.0);
  out.uv = vec2<f32>(p[vid].x * 0.5 + 0.5, 0.5 - p[vid].y * 0.5);
  return out;
}

fn viewPosFromLinearDepth(uv: vec2<f32>, linD: f32) -> vec3<f32> {
  // Reconstruct exact view-space ray from invProj
  let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 1.0, 1.0);
  let ray = frame.invProj * ndc;
  let dir = ray.xyz / ray.w;
  return dir * (linD / max(-dir.z, 1e-4));
}

@fragment
fn fsWaterComposite(in: VOut) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(i32(frame.screenSize.x), i32(frame.screenSize.y));
  let px = vec2<i32>(in.pos.xy);
  let bgBase = textureSampleLevel(bgColorTex, linSamp, in.uv, 0.0).rgb;

  let dC = textureLoad(fluidDepthTex, px, 0).r;
  if (dC > 500.0) {
    return vec4<f32>(bgBase, 1.0);
  }

  let vpC = viewPosFromLinearDepth(in.uv, dC);
  let texel = frame.screenSize.zw;

  // Edge-aware finite differences with depth-cliff guard -> eliminates any dark Fresnel squiggle along floor/wall seams!
  let dR = textureLoad(fluidDepthTex, clamp(px + vec2<i32>(1, 0), vec2<i32>(0), dims - 1), 0).r;
  let dL = textureLoad(fluidDepthTex, clamp(px - vec2<i32>(1, 0), vec2<i32>(0), dims - 1), 0).r;
  let dU = textureLoad(fluidDepthTex, clamp(px - vec2<i32>(0, 1), vec2<i32>(0), dims - 1), 0).r;
  let dD = textureLoad(fluidDepthTex, clamp(px + vec2<i32>(0, 1), vec2<i32>(0), dims - 1), 0).r;

  var ddx = vec3<f32>(1.0, 0.0, 0.0);
  let diffR = abs(dR - dC); let diffL = abs(dL - dC);
  if (diffR < diffL && dR < 500.0 && diffR < 0.16) {
    ddx = viewPosFromLinearDepth(in.uv + vec2<f32>(texel.x, 0.0), dR) - vpC;
  } else if (dL < 500.0 && diffL < 0.16) {
    ddx = vpC - viewPosFromLinearDepth(in.uv - vec2<f32>(texel.x, 0.0), dL);
  } else {
    ddx = viewPosFromLinearDepth(in.uv + vec2<f32>(texel.x, 0.0), dC) - vpC;
  }

  var ddy = vec3<f32>(0.0, 1.0, 0.0);
  let diffU = abs(dU - dC); let diffD = abs(dD - dC);
  if (diffU < diffD && dU < 500.0 && diffU < 0.16) {
    ddy = viewPosFromLinearDepth(in.uv - vec2<f32>(0.0, texel.y), dU) - vpC;
  } else if (dD < 500.0 && diffD < 0.16) {
    ddy = vpC - viewPosFromLinearDepth(in.uv + vec2<f32>(0.0, texel.y), dD);
  } else {
    ddy = viewPosFromLinearDepth(in.uv - vec2<f32>(0.0, texel.y), dC) - vpC;
  }

  var viewN = cross(ddx, ddy);
  if (length(viewN) < 1e-7) { viewN = vec3<f32>(0.0, 0.0, 1.0); }
  else { viewN = normalize(viewN); }
  if (viewN.z < 0.0) { viewN = -viewN; }

  let worldPos = (frame.invView * vec4<f32>(vpC, 1.0)).xyz;
  var worldN = normalize((frame.invView * vec4<f32>(viewN, 0.0)).xyz);
  let tankPos = worldPos - frame.tankOffset.xyz;
  // Smooth normal right against bottom/back glass seams so Fresnel never creates a dark seam line!
  let seamCalm = smoothstep(0.05, 0.14, tankPos.y - terrainHeight(clamp(tankPos.x, 0.0, TANK_L), clamp(tankPos.z, 0.0, TANK_W)));
  worldN = normalize(mix(vec3<f32>(0.0, 0.0, 1.0), worldN, clamp(seamCalm, 0.25, 1.0)));
  let V = normalize(frame.camPos.xyz - worldPos);
  let NdotV = max(dot(worldN, V), 0.001);

  // Measure smoothed optical thickness (and blur slightly via 4 taps for velvety depth tint)
  let thick = 0.25 * (
    textureSampleLevel(fluidThickTex, linSamp, in.uv + vec2<f32>(texel.x * 2.0, 0.0), 0.0).r +
    textureSampleLevel(fluidThickTex, linSamp, in.uv - vec2<f32>(texel.x * 2.0, 0.0), 0.0).r +
    textureSampleLevel(fluidThickTex, linSamp, in.uv + vec2<f32>(0.0, texel.y * 2.0), 0.0).r +
    textureSampleLevel(fluidThickTex, linSamp, in.uv - vec2<f32>(0.0, texel.y * 2.0), 0.0).r
  );

  // Smooth 9-tap lacy blur of fluidFoamTex -> silky photographic sea-foam lace instead of particle circles!
  var foamSum = 0.0;
  for (var fy = -1; fy <= 1; fy++) {
    for (var fx = -1; fx <= 1; fx++) {
      foamSum += textureSampleLevel(fluidFoamTex, linSamp, in.uv + vec2<f32>(f32(fx), f32(fy)) * texel * 4.5, 0.0).r;
    }
  }
  let foamAmt = clamp(foamSum / 9.0, 0.0, 1.0);

  // Screen-space water refraction (tapered smoothly near floor/wall edges to prevent dark frame bleeding!)
  let wallSafe = smoothstep(0.06, 0.24, tankPos.y) * smoothstep(0.06, 0.22, TANK_L - tankPos.x);
  let refrStrength = 0.024 * clamp(thick * 0.55 + 0.20, 0.0, 1.0) * (0.25 + 0.75 * wallSafe);
  let refrUV = clamp(in.uv + vec2<f32>(-viewN.x, viewN.y) * refrStrength, vec2<f32>(0.002), vec2<f32>(0.998));
  let refrPx = clamp(vec2<i32>(refrUV * frame.screenSize.xy), vec2<i32>(0), dims - 1);
  let refrBgZ = textureLoad(bgDepthTex, refrPx, 0);
  let clipC = frame.proj * vec4<f32>(vpC, 1.0);
  let waterNdcZ = clipC.z / clipC.w;
  let safeUV = select(in.uv, refrUV, refrBgZ >= waterNdcZ - 0.001);
  let refrCol = textureSampleLevel(bgColorTex, linSamp, safeUV, 0.0).rgb;

  // Crystal-clear architectural pool/flume water Beer-Lambert absorption (subtle turquoise tint, keeps all 4 sphere colors vivid!)
  let sigmaWater = vec3<f32>(0.42, 0.13, 0.085);
  let optD = clamp(thick * 0.62, 0.04, 2.4);
  let transmit = exp(-sigmaWater * optD);
  let waterScatter = vec3<f32>(0.05, 0.24, 0.30) * (1.0 - exp(-optD * 0.65)) * 0.55;

  // Schlick Fresnel for Water (IOR = 1.333 -> F0 = 0.02), slightly richer sky mirror on undulating top free surface!
  let topSurf = smoothstep(0.35, 0.85, worldN.y);
  let fresnel = clamp((0.02 + 0.98 * pow(1.0 - NdotV, 4.6)) * (0.85 + 0.35 * topSurf), 0.0, 0.92);
  let R = reflect(-V, worldN);
  let envRefl = sampleStudioEnv(R, 0.022);

  // Crisp studio key & rim sun glints on curling waves & ripples
  let lightPos = frame.lightViewProj * vec4<f32>(worldPos + worldN * 0.01, 1.0);
  let shadow = sampleShadowPCF(shadowMap, shadowSamp, lightPos, 0.0025);
  let Hk = normalize(V + KEY_DIR);
  let Hr = normalize(V + RIM_DIR);
  let specKey = pow(max(dot(worldN, Hk), 0.0), 320.0) * 2.6 * KEY_COL * (0.35 + 0.65 * shadow);
  let specBroad = pow(max(dot(worldN, Hk), 0.0), 42.0) * 0.20 * KEY_COL * (0.4 + 0.6 * shadow);
  let specRim = pow(max(dot(worldN, Hr), 0.0), 96.0) * 0.65 * RIM_COL;

  // Lacy frothy whitewater sheen on breaking wave crests & wall impacts (soft wispy breakup)
  let lacyN1 = valueNoise3D(worldPos * 14.0 + vec3<f32>(frame.filterParams.w * 0.35, 0.0, 0.0));
  let lacyN2 = valueNoise3D(worldPos * 34.0 - vec3<f32>(0.0, frame.filterParams.w * 0.25, 0.0));
  let lacy = lacyN1 * 0.65 + lacyN2 * 0.35;
  let surfFoam = smoothstep(0.24, 0.85, foamAmt * (0.55 + 0.85 * lacy));
  let foamCol = vec3<f32>(0.97, 0.995, 1.02) * (0.80 + 0.32 * max(dot(worldN, KEY_DIR), 0.0));

  var col = refrCol * transmit + waterScatter;
  col = mix(col, envRefl, clamp(fresnel * 0.90, 0.0, 0.90));
  col += specKey + specBroad + specRim;
  col = mix(col, foamCol, surfFoam * 0.68);

  // Crisp subtle meniscus line where water surface touches front glass pane!
  let nearFrontGlass = smoothstep(0.11, 0.04, abs(tankPos.z - (TANK_W - CELL_H)));
  let topNormal = smoothstep(0.35, 0.82, abs(worldN.y));
  col += vec3<f32>(0.65, 0.86, 0.94) * nearFrontGlass * topNormal * 0.24;

  return vec4<f32>(col, 1.0);
}
`;

  // Shader 6: Diffuse Whitewater Foam, Airborne Spray Droplets & Underwater Silvery Bubbles!
  const S2_DIFFUSE_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE2_DOMAIN_WGSL}
${FLUID_STRUCTS_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;
@group(0) @binding(1) var<storage, read> diffuse: array<DiffuseParticle>;
@group(0) @binding(2) var bgDepthTex: texture_depth_2d;
@group(0) @binding(3) var fluidDepthTex: texture_2d<f32>;

const QUAD_OFFS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0)
);

struct DiffOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) localUV: vec2<f32>,
  @location(1) viewDepth: f32,
  @location(2) clipDepth: f32,
  @location(3) lifeKind: vec3<f32>, // x = life, y = kind, z = seed
};

fn instRand(i: u32) -> f32 {
  var s = i * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return f32((w >> 22u) ^ w) / 4294967296.0;
}

@vertex
fn vsDiffuse(@builtin(vertex_index) vid: u32, @builtin(instance_index) inst: u32) -> DiffOut {
  let d = diffuse[inst];
  var out: DiffOut;
  let life = d.posLife.w;
  if (life <= 0.01) {
    out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.localUV = vec2<f32>(0.0);
    out.viewDepth = 1000.0;
    out.clipDepth = 1.0;
    out.lifeKind = vec3<f32>(0.0);
    return out;
  }

  let kind = d.velType.w;
  let rnd = instRand(inst);
  // Varied organic particle radii: crisp fine spray beads, wispy varied foam flecks, delicate sparkling micro-bubbles!
  let baseR = select(
    select(0.009 + rnd * 0.008, 0.014 + rnd * 0.016, kind > 0.5 && kind < 1.5),
    0.008 + rnd * 0.008,
    kind >= 1.5
  );
  let r = baseR * clamp(life * 0.9, 0.35, 1.12);

  let wp = d.posLife.xyz + frame.tankOffset.xyz;
  let vp = (frame.view * vec4<f32>(wp, 1.0)).xyz;
  let q = QUAD_OFFS[vid];
  let corner = vp + vec3<f32>(q * r, 0.0);
  let clip = frame.proj * vec4<f32>(corner, 1.0);

  out.pos = clip;
  out.localUV = q;
  out.viewDepth = -vp.z;
  out.clipDepth = clip.z / clip.w;
  out.lifeKind = vec3<f32>(life, kind, rnd);
  return out;
}

@fragment
fn fsDiffuse(in: DiffOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.localUV, in.localUV);
  if (r2 > 1.0) { discard; }

  let px = vec2<i32>(in.pos.xy);
  let bgZ = textureLoad(bgDepthTex, px, 0);
  if (in.clipDepth >= bgZ) { discard; }

  let life = in.lifeKind.x;
  let kind = in.lifeKind.y;
  let seed = in.lifeKind.z;
  let fade = clamp(life * 1.15, 0.0, 1.0);
  let r = sqrt(r2);

  if (kind < 0.5) {
    // 0: Airborne glistening water spray droplet (crisp sunlit micro-bead)
    let spec = pow(clamp(1.0 - length(in.localUV - vec2<f32>(-0.28, 0.32)) * 1.7, 0.0, 1.0), 3.0);
    let col = mix(vec3<f32>(0.88, 0.95, 1.0), vec3<f32>(2.1, 2.15, 2.2), spec);
    let alpha = pow(1.0 - r2, 1.4) * 0.78 * fade;
    return vec4<f32>(col, alpha);
  }

  if (kind < 1.5) {
    // 1: Organic wispy ocean whitewater foam cluster (NO flat circular polka-dots!)
    let waterLinD = textureLoad(fluidDepthTex, px, 0).r;
    if (in.viewDepth > waterLinD + 0.16) { discard; }
    let ang = seed * 6.283;
    let ca = cos(ang); let sa = sin(ang);
    let rotUV = vec2<f32>(ca * in.localUV.x - sa * in.localUV.y, sa * in.localUV.x + ca * in.localUV.y);
    // Multi-lobe frothy breakup pattern
    let wisp = 0.65 + 0.35 * sin(rotUV.x * 5.0 + seed * 12.0) * cos(rotUV.y * 5.5 - seed * 9.0);
    let soft = pow(max(0.0, 1.0 - r), 1.85) * wisp;
    let col = vec3<f32>(1.04, 1.07, 1.10);
    let alpha = clamp(soft * 0.52 * fade, 0.0, 0.68);
    return vec4<f32>(col, alpha);
  }

  // 2: Delicate shimmering underwater entrained air bubble!
  let rim = smoothstep(0.42, 0.84, r) * (1.0 - smoothstep(0.84, 1.0, r));
  let glint = pow(clamp(1.0 - length(in.localUV - vec2<f32>(-0.30, 0.34)) * 2.2, 0.0, 1.0), 3.2);
  let col = vec3<f32>(0.86, 0.98, 1.06) * (0.45 + 0.85 * rim) + vec3<f32>(2.0, 2.1, 2.2) * glint;
  let alpha = clamp((0.18 + 0.55 * rim + 0.85 * glint) * (1.0 - r2 * 0.35) * fade, 0.0, 0.78);
  return vec4<f32>(col, alpha);
}
`;

  // Shader 7: Optical Clear Glass Tank Panels + Bright Specular Chamfered Glass Edges
  const S2_GLASS_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}
${SCENE2_FRAME_UNIFORM_WGSL}

@group(0) @binding(0) var<uniform> frame: Frame2Uniforms;

struct GlassOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNorm: vec3<f32>,
  @location(2) @interpolate(flat) isEdge: u32,
};

@vertex
fn vsGlassPane(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> GlassOut {
  var out: GlassOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos; out.worldNorm = norm; out.isEdge = 0u;
  return out;
}

@vertex
fn vsGlassEdge(@location(0) pos: vec3<f32>, @location(1) norm: vec3<f32>) -> GlassOut {
  var out: GlassOut;
  out.pos = frame.viewProj * vec4<f32>(pos, 1.0);
  out.worldPos = pos; out.worldNorm = norm; out.isEdge = 1u;
  return out;
}

@fragment
fn fsGlass(in: GlassOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4<f32> {
  let N = normalize(select(-in.worldNorm, in.worldNorm, frontFacing));
  let V = normalize(frame.camPos.xyz - in.worldPos);
  let NdotV = max(dot(N, V), 0.001);
  let R = reflect(-V, N);
  let env = sampleStudioEnv(R, 0.02);
  let Hk = normalize(V + KEY_DIR);
  let Hr = normalize(V + RIM_DIR);

  if (in.isEdge == 1u) {
    // Architectural thick optical glass chamfered edges: crisp green-white glass rim + bright specular highlight!
    let spec = pow(max(dot(N, Hk), 0.0), 96.0) * 2.8 * KEY_COL + pow(max(dot(N, Hr), 0.0), 64.0) * 1.5 * RIM_COL;
    let edgeTint = vec3<f32>(0.76, 0.94, 0.92);
    let col = mix(edgeTint * 0.85, env * 1.15, 0.45) + spec;
    return vec4<f32>(col, 0.76);
  }

  // Transparent glass panes: crystal clear in center so reflections NEVER obscure spheres/water inside!
  let fresnel = 0.02 + 0.34 * pow(1.0 - NdotV, 4.4);
  let spec = pow(max(dot(N, Hk), 0.0), 280.0) * 0.95 * KEY_COL;
  let col = env * 0.75 + spec + vec3<f32>(0.02, 0.07, 0.07);
  let alpha = clamp(fresnel * 0.42 + length(spec) * 0.08, 0.015, 0.22);
  return vec4<f32>(col, alpha);
}
`;

  const S2_TONEMAP_WGSL = /* wgsl */ `
${COMMON_STUDIO_WGSL}

@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var linSamp: sampler;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
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

  // Merge an array of { vertices, indices } meshes into a single mesh
  function mergeMeshes(list) {
    let vLen = 0, iLen = 0;
    for (const m of list) { vLen += m.vertices.length; iLen += m.indices.length; }
    const vertices = new Float32Array(vLen);
    const indices = new Uint32Array(iLen);
    let vOff = 0, iOff = 0, vBase = 0;
    for (const m of list) {
      vertices.set(m.vertices, vOff);
      for (let k = 0; k < m.indices.length; k++) indices[iOff + k] = m.indices[k] + vBase;
      vOff += m.vertices.length;
      iOff += m.indices.length;
      vBase += m.vertices.length / 8;
    }
    return { vertices, indices };
  }

  // Build smooth analytical terrain mesh matching terrainHeightJS(x, z)
  function buildTerrainMesh(tankL, tankW, offX, offZ) {
    const segX = 104, segZ = 32;
    const verts = [];
    const inds = [];
    const th = App.terrainHeightJS;
    const eps = 0.03;
    const floorThick = 0.072; // Meets bottom water particles seamlessly with zero gap line!

    // Top contoured terrain surface
    for (let iz = 0; iz <= segZ; iz++) {
      const z = (iz / segZ) * tankW;
      for (let ix = 0; ix <= segX; ix++) {
        const x = (ix / segX) * tankL;
        const y = th(x, z) + floorThick;
        const hx0 = th(Math.max(0, x - eps), z), hx1 = th(Math.min(tankL, x + eps), z);
        const hz0 = th(x, Math.max(0, z - eps)), hz1 = th(x, Math.min(tankW, z + eps));
        let nx = -(hx1 - hx0) / (2 * eps), ny = 1.0, nz = -(hz1 - hz0) / (2 * eps);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        verts.push(x + offX, y, z + offZ, nx, ny, nz, ix / segX, iz / segZ);
      }
    }
    const stride = segX + 1;
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = iz * stride + ix;
        const b = a + stride;
        inds.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }

    // Add neat side skirts along front & back edges of terrain so the cross-section through glass looks solid & architectural!
    const addSkirt = (isFront) => {
      const z = isFront ? tankW : 0;
      const nz = isFront ? 1 : -1;
      const base = verts.length / 8;
      for (let ix = 0; ix <= segX; ix++) {
        const x = (ix / segX) * tankL;
        const yTop = th(x, z) + floorThick;
        verts.push(x + offX, 0.0, z + offZ, 0, 0, nz, ix / segX, 0);
        verts.push(x + offX, yTop, z + offZ, 0, 0, nz, ix / segX, 1);
      }
      for (let ix = 0; ix < segX; ix++) {
        const b = base + ix * 2;
        if (isFront) inds.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        else inds.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    };
    addSkirt(true);
    addSkirt(false);

    return { vertices: new Float32Array(verts), indices: new Uint32Array(inds) };
  }

  class Scene2Renderer {
    constructor(gpuCore, sim) {
      this.gpu = gpuCore;
      this.device = gpuCore.device;
      this.sim = sim;
      this.tankOffX = -sim.TANK_L * 0.5;
      this.tankOffZ = -sim.TANK_W * 0.5;

      this._createStaticMeshes();
      this._createBuffers();
      this._createPipelines();
      this._createScreenTargets(gpuCore.width, gpuCore.height);

      gpuCore.onResize((w, h) => this._createScreenTargets(w, h));
    }

    _createStaticMeshes() {
      const dev = this.device;
      const L = this.sim.TANK_L; // 6.5
      const H = this.sim.TANK_H; // 2.5
      const W = this.sim.TANK_W; // 2.0
      const ox = this.tankOffX;
      const oz = this.tankOffZ;

      // 1. Unified Studio Limestone Bench Slab (slightly wider to frame the 6.5m wave tank gracefully!)
      this.benchMesh = uploadMesh(dev, createBoxMesh(8.8, 0.28, 3.8, 0, -0.14, 0));

      // 2. Sculpted Underwater Travertine Reef Terrain
      this.terrainMesh = uploadMesh(dev, buildTerrainMesh(L, W, ox, oz));

      // 3. Sleek Anodized Aluminum Tank Cradle Base Frame + Left Actuator Housing Mounts
      const frameParts = [
        // Bottom metal cradle rails around glass base
        createBoxMesh(L + 0.16, 0.08, 0.08, 0, 0.03, oz - 0.05),
        createBoxMesh(L + 0.16, 0.08, 0.08, 0, 0.03, -oz + 0.05),
        createBoxMesh(0.08, 0.08, W + 0.06, ox - 0.05, 0.03, 0),
        createBoxMesh(0.08, 0.08, W + 0.06, -ox + 0.05, 0.03, 0),
        // Left mechanical wavemaker external motor housing & guide rail brackets!
        createBoxMesh(0.46, 0.52, 1.45, ox - 0.30, 1.15, 0),
        createBoxMesh(0.18, 2.38, 0.10, ox - 0.09, 1.20, -0.68),
        createBoxMesh(0.18, 2.38, 0.10, ox - 0.09, 1.20, 0.68),
        // Top longitudinal guide rails for wavemaker carriage on left section
        createBoxMesh(1.32, 0.055, 0.06, ox + 0.58, H + 0.04, oz - 0.03),
        createBoxMesh(1.32, 0.055, 0.06, ox + 0.58, H + 0.04, -oz + 0.03)
      ];
      this.frameMetalMesh = uploadMesh(dev, mergeMeshes(frameParts));

      // 4. Moving Wavemaker Paddle Board (local X = 0 corresponds to front face at paddleX)
      const paddleParts = [
        // Main vertical wave plate spanning inner width
        createBoxMesh(0.065, H - 0.10, W - 0.09, -0.035, H * 0.5 + 0.02, 0),
        // Top sliding carriage crossbar riding on tank rim
        createBoxMesh(0.14, 0.07, W + 0.12, -0.04, H + 0.045, 0),
        // Rear reinforcement vertical gussets
        createBoxMesh(0.14, 1.55, 0.06, -0.11, 1.15, -0.52),
        createBoxMesh(0.14, 1.55, 0.06, -0.11, 1.15, 0.52)
      ];
      this.paddleBoardMesh = uploadMesh(dev, mergeMeshes(paddleParts));

      // 5. Dual Chrome Hydraulic Actuator Rods connected to rear of paddle
      const rod1 = createCylinderXMesh(0.042, 1.25, 20);
      const rod2 = createCylinderXMesh(0.042, 1.25, 20);
      for (let i = 0; i < rod1.vertices.length; i += 8) {
        rod1.vertices[i] -= 0.68; rod1.vertices[i + 1] += 1.15; rod1.vertices[i + 2] -= 0.52;
        rod2.vertices[i] -= 0.68; rod2.vertices[i + 1] += 1.15; rod2.vertices[i + 2] += 0.52;
      }
      this.paddleRodMesh = uploadMesh(dev, mergeMeshes([rod1, rod2]));

      // 6. Optical Clear Glass Tank Panels (Front, Back, Left, Right)
      const gThick = 0.028;
      const glassPanes = [
        createBoxMesh(L, H, gThick, 0, H * 0.5 + 0.02, -oz + gThick * 0.5),       // Front glass
        createBoxMesh(L, H, gThick, 0, H * 0.5 + 0.02, oz - gThick * 0.5),        // Back glass
        createBoxMesh(gThick, H, W, -ox + gThick * 0.5, H * 0.5 + 0.02, 0),       // Right far wall
        createBoxMesh(gThick, H, W, ox - gThick * 0.5, H * 0.5 + 0.02, 0)         // Left end wall
      ];
      this.glassPaneMesh = uploadMesh(dev, mergeMeshes(glassPanes));

      // 7. Crisp Chamfered Glass Edges (top polished edges + 4 vertical optical corner seams!)
      const eW = 0.036;
      const glassEdges = [
        createBoxMesh(L + 0.06, 0.036, eW, 0, H + 0.025, -oz + 0.015),
        createBoxMesh(L + 0.06, 0.036, eW, 0, H + 0.025, oz - 0.015),
        createBoxMesh(eW, 0.036, W + 0.06, -ox + 0.015, H + 0.025, 0),
        createBoxMesh(eW, 0.036, W + 0.06, ox - 0.015, H + 0.025, 0),
        createBoxMesh(eW, H + 0.04, eW, -ox + 0.015, H * 0.5 + 0.02, -oz + 0.015),
        createBoxMesh(eW, H + 0.04, eW, ox - 0.015, H * 0.5 + 0.02, -oz + 0.015),
        createBoxMesh(eW, H + 0.04, eW, -ox + 0.015, H * 0.5 + 0.02, oz - 0.015),
        createBoxMesh(eW, H + 0.04, eW, ox - 0.015, H * 0.5 + 0.02, oz - 0.015)
      ];
      this.glassEdgeMesh = uploadMesh(dev, mergeMeshes(glassEdges));
    }

    _createBuffers() {
      const dev = this.device;
      // Frame2Uniforms: 7 mat4 (448) + 4 vec4 (64) = 512 bytes
      // Create 7 uniform slices (base + 6 bilateral filter passes) so all filter directions submit in 1 CommandEncoder!
      this.uniformStride = 512;
      this.frameUniformBuf = dev.createBuffer({
        size: this.uniformStride * 7,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.frameUniformAll = new Float32Array((this.uniformStride / 4) * 7);
    }

    _createPipelines() {
      const dev = this.device;
      const meshLayout = [{
        arrayStride: 32,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' }
        ]
      }];

      // --- 1. Shadow Pipelines ---
      const shMod = dev.createShaderModule({ code: S2_SHADOW_WGSL });
      const shBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
        ]
      });
      const shPL = dev.createPipelineLayout({ bindGroupLayouts: [shBGL] });
      this.shadowBG = dev.createBindGroup({
        layout: shBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: { buffer: this.sim.sphereBuf } }
        ]
      });
      const mkSh = (entry) => dev.createRenderPipeline({
        layout: shPL,
        vertex: { module: shMod, entryPoint: entry, buffers: meshLayout },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 }
      });
      this.shStaticPipe = mkSh('vsStatic');
      this.shPaddlePipe = mkSh('vsPaddle');
      this.shSpherePipe = mkSh('vsSphere');

      // --- 2. Opaque Studio + Reef + Paddle + Spheres Pipelines ---
      const opMod = dev.createShaderModule({ code: S2_OPAQUE_WGSL });
      const opBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
        ]
      });
      const opPL = dev.createPipelineLayout({ bindGroupLayouts: [opBGL] });
      this.opaqueBG = dev.createBindGroup({
        layout: opBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: { buffer: this.sim.sphereBuf } },
          { binding: 2, resource: { buffer: this.sim.causticOutBuf } },
          { binding: 3, resource: { buffer: this.sim.surfHeightBuf } },
          { binding: 4, resource: this.gpu.shadowView },
          { binding: 5, resource: this.gpu.shadowSampler }
        ]
      });

      this.backdropPipe = dev.createRenderPipeline({
        layout: opPL,
        vertex: { module: opMod, entryPoint: 'vsBackdrop' },
        fragment: { module: opMod, entryPoint: 'fsBackdrop', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' }
      });
      const mkOp = (vEntry, fEntry, cull) => dev.createRenderPipeline({
        layout: opPL,
        vertex: { module: opMod, entryPoint: vEntry, buffers: meshLayout },
        fragment: { module: opMod, entryPoint: fEntry, targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list', cullMode: cull || 'back' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
      });
      this.benchPipe = mkOp('vsBench', 'fsOpaque', 'back');
      this.frameMetalPipe = mkOp('vsFrameMetal', 'fsOpaque', 'back');
      this.terrainPipe = mkOp('vsTerrain', 'fsOpaque', 'none');
      this.paddleBoardPipe = mkOp('vsPaddleBoard', 'fsOpaque', 'back');
      this.paddleRodPipe = mkOp('vsPaddleRod', 'fsOpaque', 'none');
      this.spherePipe = mkOp('vsSphere', 'fsSphere', 'back');

      // --- 3. Fluid Particle Splatting (Depth+Foam & Additive Thickness) ---
      const splatMod = dev.createShaderModule({ code: S2_FLUID_SPLAT_WGSL });
      this.splatBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }
        ]
      });
      const splatPL = dev.createPipelineLayout({ bindGroupLayouts: [this.splatBGL] });

      this.fluidDepthPipe = dev.createRenderPipeline({
        layout: splatPL,
        vertex: { module: splatMod, entryPoint: 'vsDepth' },
        fragment: {
          module: splatMod,
          entryPoint: 'fsDepth',
          targets: [{ format: 'r32float' }, { format: 'r16float' }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' }
      });

      this.fluidThickPipe = dev.createRenderPipeline({
        layout: splatPL,
        vertex: { module: splatMod, entryPoint: 'vsThick' },
        fragment: {
          module: splatMod,
          entryPoint: 'fsThick',
          targets: [{
            format: 'r16float',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });

      // --- 4. Narrow-Range Bilateral Filter ---
      const filtMod = dev.createShaderModule({ code: S2_FILTER_AND_COMPOSITE_WGSL });
      this.filtBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }
        ]
      });
      this.filtPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.filtBGL] }),
        vertex: { module: filtMod, entryPoint: 'vsFull' },
        fragment: { module: filtMod, entryPoint: 'fsNarrowRangeFilter', targets: [{ format: 'r32float' }] },
        primitive: { topology: 'triangle-list' }
      });

      // --- 5. Water Composite ---
      const compMod = dev.createShaderModule({ code: S2_WATER_COMPOSITE_WGSL });
      this.compBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
        ]
      });
      this.compPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.compBGL] }),
        vertex: { module: compMod, entryPoint: 'vsFull' },
        fragment: { module: compMod, entryPoint: 'fsWaterComposite', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' }
      });

      // --- 6. Diffuse Spray / Foam / Underwater Bubbles ---
      const diffMod = dev.createShaderModule({ code: S2_DIFFUSE_WGSL });
      this.diffBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }
        ]
      });
      this.diffPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.diffBGL] }),
        vertex: { module: diffMod, entryPoint: 'vsDiffuse' },
        fragment: {
          module: diffMod,
          entryPoint: 'fsDiffuse',
          targets: [{
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list' }
      });

      // --- 7. Optical Clear Glass Tank Panels & Edges ---
      const glMod = dev.createShaderModule({ code: S2_GLASS_WGSL });
      const glBGL = dev.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
      });
      const glPL = dev.createPipelineLayout({ bindGroupLayouts: [glBGL] });
      this.glassBG = dev.createBindGroup({
        layout: glBGL,
        entries: [{ binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } }]
      });
      const mkGlass = (entry, cull) => dev.createRenderPipeline({
        layout: glPL,
        vertex: { module: glMod, entryPoint: entry, buffers: meshLayout },
        fragment: {
          module: glMod,
          entryPoint: 'fsGlass',
          targets: [{
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }]
        },
        primitive: { topology: 'triangle-list', cullMode: cull },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' }
      });
      this.glassPanePipe = mkGlass('vsGlassPane', 'back');
      this.glassEdgePipe = mkGlass('vsGlassEdge', 'back');

      // --- 8. ACES Tonemap ---
      const tmMod = dev.createShaderModule({ code: S2_TONEMAP_WGSL });
      this.tmBGL = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
        ]
      });
      this.tmPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.tmBGL] }),
        vertex: { module: tmMod, entryPoint: 'vsFull' },
        fragment: { module: tmMod, entryPoint: 'fsTonemap', targets: [{ format: this.gpu.format }] },
        primitive: { topology: 'triangle-list' }
      });
    }

    _createScreenTargets(w, h) {
      const destroy = (t) => { if (t) t.destroy(); };
      destroy(this.bgColorTex); destroy(this.bgDepthTex);
      destroy(this.fluidDepthATex); destroy(this.fluidDepthBTex); destroy(this.fluidDepthDSTex);
      destroy(this.fluidFoamTex); destroy(this.fluidThickTex); destroy(this.hdrFinalTex);

      const dev = this.device;
      const mkTex = (format, usage) => dev.createTexture({ size: [w, h], format, usage });

      this.bgColorTex = mkTex('rgba16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.bgDepthTex = mkTex('depth32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.fluidDepthATex = mkTex('r32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.fluidDepthBTex = mkTex('r32float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.fluidDepthDSTex = mkTex('depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
      this.fluidFoamTex = mkTex('r16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.fluidThickTex = mkTex('r16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
      this.hdrFinalTex = mkTex('rgba16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);

      this.bgColorView = this.bgColorTex.createView();
      this.bgDepthView = this.bgDepthTex.createView();
      this.fluidDepthAView = this.fluidDepthATex.createView();
      this.fluidDepthBView = this.fluidDepthBTex.createView();
      this.fluidDepthDSView = this.fluidDepthDSTex.createView();
      this.fluidFoamView = this.fluidFoamTex.createView();
      this.fluidThickView = this.fluidThickTex.createView();
      this.hdrFinalView = this.hdrFinalTex.createView();

      this.splatBG = dev.createBindGroup({
        layout: this.splatBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: { buffer: this.sim.particleBuf } },
          { binding: 2, resource: this.bgDepthView }
        ]
      });

      this.filtBGA = dev.createBindGroup({
        layout: this.filtBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: this.fluidDepthAView }
        ]
      });
      this.filtBGB = dev.createBindGroup({
        layout: this.filtBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: this.fluidDepthBView }
        ]
      });

      this.compBG = dev.createBindGroup({
        layout: this.compBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: this.bgColorView },
          { binding: 2, resource: this.bgDepthView },
          { binding: 3, resource: this.fluidDepthAView },
          { binding: 4, resource: this.fluidThickView },
          { binding: 5, resource: this.fluidFoamView },
          { binding: 6, resource: this.gpu.linearSampler },
          { binding: 7, resource: this.gpu.shadowView },
          { binding: 8, resource: this.gpu.shadowSampler }
        ]
      });

      this.diffBG = dev.createBindGroup({
        layout: this.diffBGL,
        entries: [
          { binding: 0, resource: { buffer: this.frameUniformBuf, offset: 0, size: 512 } },
          { binding: 1, resource: { buffer: this.sim.diffuseBuf } },
          { binding: 2, resource: this.bgDepthView },
          { binding: 3, resource: this.fluidDepthAView }
        ]
      });

      this.tmBG = dev.createBindGroup({
        layout: this.tmBGL,
        entries: [
          { binding: 0, resource: this.hdrFinalView },
          { binding: 1, resource: this.gpu.linearSampler }
        ]
      });
    }

    render(camera) {
      const dev = this.device;
      const w = this.gpu.width, h = this.gpu.height;
      camera.updateMatrices(w / Math.max(1, h));

      const lView = Mat4.create();
      const lProj = Mat4.create();
      const lVP = Mat4.create();
      Mat4.lookAt(lView, [4.25, 8.18, 3.88], [0, 0.8, 0], [0, 1, 0]);
      Mat4.orthoZO(lProj, -5.6, 5.6, -3.5, 4.2, 1.0, 24.0);
      Mat4.multiply(lVP, lProj, lView);

      // Fill base uniform slice + 6 separable narrow-range filter slices scaled smoothly to screen resolution!
      const resScale = Math.max(0.85, Math.min(2.2, h / 900));
      const filterPasses = [
        [0, 0, 0],
        [1, 0, Math.round(7 * resScale)],
        [0, 1, Math.round(7 * resScale)],
        [1, 0, Math.round(5 * resScale)],
        [0, 1, Math.round(5 * resScale)],
        [1, 0, Math.round(3 * resScale)],
        [0, 1, Math.round(3 * resScale)]
      ];

      for (let s = 0; s < 7; s++) {
        const o = s * 128; // 512 bytes = 128 floats
        const buf = this.frameUniformAll;
        buf.set(camera.viewProj, o + 0);
        buf.set(camera.invViewProj, o + 16);
        buf.set(camera.view, o + 32);
        buf.set(camera.proj, o + 48);
        buf.set(camera.invProj, o + 64);
        buf.set(camera.invView, o + 80);
        buf.set(lVP, o + 96);
        buf[o + 112] = camera.eye[0]; buf[o + 113] = camera.eye[1]; buf[o + 114] = camera.eye[2]; buf[o + 115] = 1;
        buf[o + 116] = w; buf[o + 117] = h; buf[o + 118] = 1 / w; buf[o + 119] = 1 / h;
        buf[o + 120] = this.tankOffX; buf[o + 121] = 0.0; buf[o + 122] = this.tankOffZ; buf[o + 123] = this.sim.paddleX;
        buf[o + 124] = filterPasses[s][0];
        buf[o + 125] = filterPasses[s][1];
        buf[o + 126] = filterPasses[s][2];
        buf[o + 127] = this.sim.simTime;
      }
      dev.queue.writeBuffer(this.frameUniformBuf, 0, this.frameUniformAll);

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
        pass.setPipeline(this.shStaticPipe);
        for (const m of [this.benchMesh, this.terrainMesh, this.frameMetalMesh]) {
          pass.setVertexBuffer(0, m.vb);
          pass.setIndexBuffer(m.ib, 'uint32');
          pass.drawIndexed(m.indexCount);
        }
        pass.setPipeline(this.shPaddlePipe);
        pass.setVertexBuffer(0, this.paddleBoardMesh.vb);
        pass.setIndexBuffer(this.paddleBoardMesh.ib, 'uint32');
        pass.drawIndexed(this.paddleBoardMesh.indexCount);

        pass.setPipeline(this.shSpherePipe);
        pass.setVertexBuffer(0, this.gpu.sphereMesh.vb);
        pass.setIndexBuffer(this.gpu.sphereMesh.ib, 'uint32');
        pass.drawIndexed(this.gpu.sphereMesh.indexCount, this.sim.sphereActiveCount);
        pass.end();
      }

      // --- Pass 2: Opaque Scene (Cyclorama + Bench + Reef with Caustics + Mechanical Wavemaker + 28 Density Spheres) ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.bgColorView,
            clearValue: { r: 0.82, g: 0.86, b: 0.90, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: this.bgDepthView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.opaqueBG);
        pass.setPipeline(this.backdropPipe);
        pass.draw(3);

        const drawM = (pipe, m) => {
          pass.setPipeline(pipe);
          pass.setVertexBuffer(0, m.vb);
          pass.setIndexBuffer(m.ib, 'uint32');
          pass.drawIndexed(m.indexCount);
        };
        drawM(this.benchPipe, this.benchMesh);
        drawM(this.frameMetalPipe, this.frameMetalMesh);
        drawM(this.terrainPipe, this.terrainMesh);
        drawM(this.paddleBoardPipe, this.paddleBoardMesh);
        drawM(this.paddleRodPipe, this.paddleRodMesh);

        pass.setPipeline(this.spherePipe);
        pass.setVertexBuffer(0, this.gpu.sphereMesh.vb);
        pass.setIndexBuffer(this.gpu.sphereMesh.ib, 'uint32');
        pass.drawIndexed(this.gpu.sphereMesh.indexCount, this.sim.sphereActiveCount);
        pass.end();
      }

      // --- Pass 3a: Fluid Particle Sphere-Impostor Depth + Surface Foam ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [
            { view: this.fluidDepthAView, clearValue: { r: 1000.0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
            { view: this.fluidFoamView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
          ],
          depthStencilAttachment: {
            view: this.fluidDepthDSView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.splatBG);
        pass.setPipeline(this.fluidDepthPipe);
        pass.draw(6, this.sim.particleCount);
        pass.end();
      }

      // --- Pass 3b: 6-Pass Separable Narrow-Range Bilateral Depth Filter (A -> B -> A -> B -> A -> B -> A) ---
      for (let s = 1; s <= 6; s++) {
        const readA = (s & 1) === 1;
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: readA ? this.fluidDepthBView : this.fluidDepthAView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 1000.0, g: 0, b: 0, a: 1 }
          }]
        });
        pass.setPipeline(this.filtPipe);
        pass.setBindGroup(0, readA ? this.filtBGA : this.filtBGB, [s * this.uniformStride]);
        pass.draw(3);
        pass.end();
      }

      // --- Pass 3c: Fluid Additive Optical Thickness ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.fluidThickView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        pass.setBindGroup(0, this.splatBG);
        pass.setPipeline(this.fluidThickPipe);
        pass.draw(6, this.sim.particleCount);
        pass.end();
      }

      // --- Pass 4: Water Optical Refraction, Reflection & Beer-Lambert Composite -> hdrFinalTex ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.hdrFinalView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.85, g: 0.88, b: 0.92, a: 1 }
          }]
        });
        pass.setBindGroup(0, this.compBG);
        pass.setPipeline(this.compPipe);
        pass.draw(3);
        pass.end();
      }

      // --- Pass 5: Diffuse Spray, Whitewater Foam & Underwater Silvery Bubbles -> hdrFinalTex ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.hdrFinalView,
            loadOp: 'load',
            storeOp: 'store'
          }]
        });
        pass.setBindGroup(0, this.diffBG);
        pass.setPipeline(this.diffPipe);
        pass.draw(6, this.sim.MAX_DIFFUSE);
        pass.end();
      }

      // --- Pass 6: Optical Clear Glass Tank Panels & Specular Edges -> hdrFinalTex ---
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: this.hdrFinalView,
            loadOp: 'load',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: this.bgDepthView,
            depthLoadOp: 'load',
            depthStoreOp: 'store'
          }
        });
        pass.setBindGroup(0, this.glassBG);
        pass.setPipeline(this.glassPanePipe);
        pass.setVertexBuffer(0, this.glassPaneMesh.vb);
        pass.setIndexBuffer(this.glassPaneMesh.ib, 'uint32');
        pass.drawIndexed(this.glassPaneMesh.indexCount);

        pass.setPipeline(this.glassEdgePipe);
        pass.setVertexBuffer(0, this.glassEdgeMesh.vb);
        pass.setIndexBuffer(this.glassEdgeMesh.ib, 'uint32');
        pass.drawIndexed(this.glassEdgeMesh.indexCount);
        pass.end();
      }

      // --- Pass 7: ACES Filmic Tonemap -> Swapchain ---
      {
        const swapView = this.gpu.context.getCurrentTexture().createView();
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: swapView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.85, g: 0.88, b: 0.92, a: 1 }
          }]
        });
        pass.setBindGroup(0, this.tmBG);
        pass.setPipeline(this.tmPipe);
        pass.draw(3);
        pass.end();
      }

      dev.queue.submit([enc.finish()]);
    }
  }

  App.Scene2Renderer = Scene2Renderer;
})(window);
