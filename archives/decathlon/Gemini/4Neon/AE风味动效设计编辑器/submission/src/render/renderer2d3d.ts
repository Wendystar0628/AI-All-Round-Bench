import {
  BlendMode, ColorRGBA, Composition, Layer, LayerEffect, MaskItem, Poly2D,
  Project, TriMesh3D, Vec2, Vec3,
} from '../core/types';
import {
  clamp, DEG2RAD, lerp, m4Identity, m4LookAt, m4Mul, m4Ortho, m4Scale,
  m4TransformPoint, m4Translate, Mat4, v3Add, v3Cross, v3Norm, v3Scale, v3Sub,
} from '../core/math';
import { EvalContext } from '../core/expressions';
import { evaluateLayerLocalTransform, getLayerWorldMatrix } from '../core/project';
import { evaluateShapeLayer, flattenPathData } from '../geometry/pathOps';
import { evaluateTextLayout } from '../geometry/fontEngine';
import { applyPuppetPins2D, triangulatePolys2D } from '../geometry/mesh3d';
import {
  EvaluatedCamera, EvaluatedLight, EvaluatedMeshInstance, EvaluatedSceneSnapshot,
  evaluateSceneSnapshot,
} from '../simulation/sceneEval';
import { particleEngine, RenderParticle } from '../simulation/particleEngine';
import {
  createProceduralEnvCubemap, createProgram, createRenderTarget,
  createShadowMapTarget, destroyRenderTarget, RenderTarget, ShadowMapTarget,
} from './glUtils';

// ============================================================================
// GLSL ES 3.00 Shaders
// ============================================================================

const QUAD_VS = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[](vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(-1.0,1.0), vec2(1.0,1.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main() {
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision highp float;
void main() {}`;

const PBR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in float aHeat;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vUv;
out float vHeat;
out float vViewDepth;
out vec4 vLightSpacePos;

void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  mat3 nMat = transpose(inverse(mat3(uModel)));
  vWorldNormal = normalize(nMat * aNormal);
  vUv = aUv;
  vHeat = aHeat;
  vec4 vp = uView * wp;
  vViewDepth = -vp.z;
  vLightSpacePos = uLightVP * wp;
  gl_Position = uProj * vp;
}`;

const PBR_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec2 vUv;
in float vHeat;
in float vViewDepth;
in vec4 vLightSpacePos;

uniform vec3 uCamPos;
uniform vec4 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uEmissiveColor;
uniform float uEmissiveIntensity;
uniform float uOpacity;
uniform vec3 uHeatColor;
uniform float uHeatIntensity;
uniform int uReceiveShadow;
uniform int uHasShadowMap;
uniform float uShadowBias;
uniform float uShadowSoftness;

uniform int uLightCount;
uniform vec4 uLightPosType[6];    // xyz = pos or dir, w = 0(dir) | 1(point)
uniform vec4 uLightColorInt[6];   // rgb = color, a = intensity
uniform float uLightRange[6];

uniform samplerCube uEnvMap;
uniform float uEnvScale;
uniform sampler2D uShadowMap;

layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outDepth;

const float PI = 3.14159265359;

// Subtle procedural micro-forge surface variation (scales down cleanly when roughness is low)
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x),
        mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x),
        mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z
  );
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denom * denom, 1e-5);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / max(NdotV * (1.0 - k) + k, 1e-5);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  return geometrySchlickGGX(max(dot(N, V), 0.0), roughness) *
         geometrySchlickGGX(max(dot(N, L), 0.0), roughness);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

const vec2 POISSON16[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2( 0.94558609, -0.76890725),
  vec2(-0.09418410, -0.92938870), vec2( 0.34495938,  0.29387760),
  vec2(-0.91588581,  0.45771432), vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543,  0.27676845), vec2( 0.97484398,  0.75648379),
  vec2( 0.44323325, -0.97511554), vec2( 0.53742981, -0.47373420),
  vec2(-0.26496911, -0.41893023), vec2( 0.79197514,  0.19090188),
  vec2(-0.24188840,  0.99706507), vec2(-0.81409955,  0.91437590),
  vec2( 0.19984126,  0.78641367), vec2( 0.14383161, -0.14100790)
);

float calcShadow(vec4 lsPos, vec3 N, vec3 L) {
  if (uReceiveShadow == 0 || uHasShadowMap == 0) return 1.0;
  vec3 proj = lsPos.xyz / max(lsPos.w, 1e-5);
  proj = proj * 0.5 + 0.5;
  if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;

  float bias = max(uShadowBias * (1.0 - max(dot(N, L), 0.0)) * 2.2, uShadowBias * 0.45);
  vec2 texelSize = vec2(1.0) / vec2(textureSize(uShadowMap, 0));
  float spread = max(0.8, uShadowSoftness);
  float lit = 0.0;
  for (int i = 0; i < 16; i++) {
    float closest = texture(uShadowMap, proj.xy + POISSON16[i] * texelSize * spread).r;
    lit += (proj.z - bias <= closest) ? 1.0 : 0.0;
  }
  return lit / 16.0;
}

void main() {
  float alpha = clamp(uBaseColor.a * uOpacity, 0.0, 1.0);
  if (alpha < 0.015) discard;

  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorldPos);

  // Subtle forged metal micro-grain modulation (only noticeable on semi-rough metallic surfaces)
  float grain = vnoise(vWorldPos * 0.095) * 0.5 + vnoise(vWorldPos * 0.24) * 0.5;
  float roughMod = clamp(uRoughness + (grain - 0.5) * 0.09 * smoothstep(0.08, 0.45, uRoughness), 0.04, 1.0);
  float metallic = clamp(uMetallic, 0.0, 1.0);
  vec3 albedo = uBaseColor.rgb * (0.94 + 0.12 * grain * smoothstep(0.1, 0.6, uRoughness));

  // Perturb normal ever so slightly on rough metal for tactile hammered sheen
  float bumpAmp = 0.045 * smoothstep(0.12, 0.55, uRoughness) * metallic;
  if (bumpAmp > 0.002) {
    vec3 gGrad = vec3(
      vnoise(vWorldPos * 0.12 + vec3(0.4, 0.0, 0.0)) - vnoise(vWorldPos * 0.12 - vec3(0.4, 0.0, 0.0)),
      vnoise(vWorldPos * 0.12 + vec3(0.0, 0.4, 0.0)) - vnoise(vWorldPos * 0.12 - vec3(0.0, 0.4, 0.0)),
      vnoise(vWorldPos * 0.12 + vec3(0.0, 0.0, 0.4)) - vnoise(vWorldPos * 0.12 - vec3(0.0, 0.0, 0.4))
    );
    N = normalize(N + gGrad * bumpAmp);
  }

  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  vec3 Lo = vec3(0.0);
  float keyShadow = 1.0;

  for (int i = 0; i < 6; i++) {
    if (i >= uLightCount) break;
    float lType = uLightPosType[i].w;
    vec3 lColor = uLightColorInt[i].rgb * uLightColorInt[i].a;
    vec3 L;
    float atten = 1.0;
    if (lType < 0.5) {
      L = normalize(uLightPosType[i].xyz);
    } else {
      vec3 toL = uLightPosType[i].xyz - vWorldPos;
      float dist = length(toL);
      L = toL / max(dist, 1e-4);
      float r = max(uLightRange[i], 10.0);
      float ratio = clamp(1.0 - pow(dist / r, 2.0), 0.0, 1.0);
      atten = (ratio * ratio) / (1.0 + 0.000012 * dist * dist);
    }

    vec3 H = normalize(V + L);
    float NdotL = max(dot(N, L), 0.0);
    if (NdotL <= 0.0) continue;

    float D = distributionGGX(N, H, roughMod);
    float G = geometrySmith(N, V, L, roughMod);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 spec = (D * G * F) / max(4.0 * max(dot(N, V), 0.0) * NdotL, 1e-4);
    vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);
    float shadow = (i == 0 && lType < 0.5) ? calcShadow(vLightSpacePos, N, L) : 1.0;
    if (i == 0 && lType < 0.5) keyShadow = shadow;
    Lo += (kD * albedo / PI + spec) * lColor * atten * NdotL * shadow;
  }

  // Image-Based Lighting from procedural HDRI Cubemap (sharp reflections on smooth metal, soft on rough!)
  float NdotV = max(dot(N, V), 0.0);
  vec3 F_ibl = fresnelSchlickRoughness(NdotV, F0, roughMod);
  vec3 kD_ibl = (1.0 - F_ibl) * (1.0 - metallic);
  vec3 irradiance = textureLod(uEnvMap, N, 5.8).rgb * uEnvScale;
  vec3 R = reflect(-V, N);
  float mip = roughMod * roughMod * 6.2;
  vec3 prefiltered = textureLod(uEnvMap, R, mip).rgb * uEnvScale;
  // Energy-conserving specular BRDF approximation + shadow AO contrast so hole shadows pop cleanly!
  vec2 brdfApprox = vec2(1.0 - roughMod * 0.45, roughMod * 0.12);
  vec3 specIBL = prefiltered * (F_ibl * brdfApprox.x + brdfApprox.y);
  float shadowAo = mix(0.42, 1.0, keyShadow);
  vec3 ambient = (kD_ibl * irradiance * albedo * 0.85 + specIBL * 1.15) * shadowAo;

  // Emissive + Incandescent Heat Field glow (realistic forged blackbody iron: cooler dark oxide flat faces, glowing hot bevels & white-hot struck crater!)
  vec3 emissive = uEmissiveColor * uEmissiveIntensity;
  if (uEmissiveIntensity > 0.05) {
    float scaleCrust = smoothstep(0.25, 0.85, grain);
    float bevelRim = pow(1.0 - NdotV, 1.75);
    float heatPattern = mix(0.32, 1.15, bevelRim * 0.72 + scaleCrust * 0.45);
    // Keep stroke silhouette & bevel shading unmistakable even at peak forge heat!
    vec3 coreEmber = mix(uEmissiveColor * 0.65, vec3(1.0, 0.68, 0.16), clamp(bevelRim * 0.8 + uEmissiveIntensity * 0.18, 0.0, 1.0));
    emissive = coreEmber * uEmissiveIntensity * heatPattern;
  }
  float h = clamp(vHeat, 0.0, 2.0);
  if (h > 0.01 && uHeatIntensity > 0.01) {
    vec3 whiteHot = mix(uHeatColor, vec3(1.0, 0.96, 0.78), smoothstep(0.45, 1.25, h));
    emissive += whiteHot * pow(h, 1.15) * uHeatIntensity;
  }

  vec3 color = ambient + Lo + emissive;
  outColor = vec4(color * alpha, alpha);
  outDepth = vec4(vViewDepth, 1.0, 0.0, 1.0);
}`;

const PLANE3D_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
out vec2 vUv;
out float vViewDepth;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  vUv = aUv;
  vViewDepth = -vp.z;
  gl_Position = uProj * vp;
}`;

const PLANE3D_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vViewDepth;
uniform sampler2D uTex;
uniform float uOpacity;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outDepth;
void main() {
  vec4 c = texture(uTex, vUv) * uOpacity;
  if (c.a < 0.02) discard;
  outColor = c;
  outDepth = vec4(vViewDepth, 1.0, 0.0, 1.0);
}`;

const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aCorner;
layout(location=2) in vec4 aColor;
layout(location=3) in float aSize;
layout(location=4) in float aEmissive;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

out vec2 vCorner;
out vec4 vColor;
out float vEmissive;
out float vViewDepth;

void main() {
  vec3 worldP = aPos + (uCamRight * aCorner.x + uCamUp * aCorner.y) * aSize;
  vec4 vp = uView * vec4(worldP, 1.0);
  vCorner = aCorner;
  vColor = aColor;
  vEmissive = aEmissive;
  vViewDepth = -vp.z;
  gl_Position = uProj * vp;
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec4 vColor;
in float vEmissive;
in float vViewDepth;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outDepth;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float core = exp(-d * d * 15.0);
  float halo = pow(max(0.0, 1.0 - d), 3.4);
  float alpha = clamp((core * 0.95 + halo * 0.36) * vColor.a, 0.0, 1.0);
  vec3 col = mix(vColor.rgb, vec3(1.0, 0.98, 0.92), core * 0.82) * (1.0 + vEmissive * (core * 1.55 + halo * 0.32));
  outColor = vec4(col * alpha, alpha);
  outDepth = vec4(vViewDepth, alpha, 0.0, 1.0);
}`;

const TRAIL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in float aEdge; // -1..1 across ribbon width
uniform mat4 uView;
uniform mat4 uProj;
out vec4 vColor;
out float vEdge;
out float vViewDepth;
void main() {
  vec4 vp = uView * vec4(aPos, 1.0);
  vColor = aColor;
  vEdge = aEdge;
  vViewDepth = -vp.z;
  gl_Position = uProj * vp;
}`;

const TRAIL_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vEdge;
in float vViewDepth;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outDepth;
void main() {
  float radial = max(0.0, 1.0 - abs(vEdge));
  float alpha = clamp(pow(radial, 1.6) * vColor.a, 0.0, 1.0);
  if (alpha < 0.005) discard;
  vec3 col = mix(vColor.rgb, vec3(1.0, 0.95, 0.82), pow(radial, 3.0) * 0.55) * 1.85;
  outColor = vec4(col * alpha, alpha);
  outDepth = vec4(vViewDepth, alpha, 0.0, 1.0);
}`;

const DOF_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColorTex;
uniform sampler2D uDepthTex;
uniform vec2 uTexelSize;
uniform float uFocalDistance;
uniform float uAperture; // 0..100
uniform float uDofScale;
out vec4 outColor;

float computeCoC(float viewZ, float valid) {
  if (valid < 0.5 || viewZ <= 0.1) return 0.0;
  float rel = abs(viewZ - uFocalDistance) / max(uFocalDistance, 10.0);
  return clamp(rel * uAperture * 0.58 * uDofScale, 0.0, 22.0 * uDofScale);
}

void main() {
  vec4 centerCol = texture(uColorTex, vUv);
  vec4 centerD = texture(uDepthTex, vUv);
  float centerCoC = computeCoC(centerD.r, centerD.g);
  if (uAperture < 0.5 || centerCoC < 0.35) {
    outColor = centerCol;
    return;
  }

  vec4 accum = centerCol;
  float totalW = 1.0;
  const float GOLDEN = 2.39996323;
  const int TAPS = 20;
  for (int i = 1; i <= TAPS; i++) {
    float r = sqrt(float(i) / float(TAPS)) * centerCoC;
    float ang = float(i) * GOLDEN;
    vec2 off = vec2(cos(ang), sin(ang)) * r * uTexelSize;
    vec2 suv = clamp(vUv + off, vec2(0.001), vec2(0.999));
    vec4 sc = texture(uColorTex, suv);
    vec4 sd = texture(uDepthTex, suv);
    float sCoC = computeCoC(sd.r, sd.g);
    // Depth-aware weight prevents crisp foreground from bleeding improperly into background
    float w = (sd.g < 0.5) ? 0.35 : clamp(sCoC / max(centerCoC, 0.5), 0.25, 1.0);
    if (sd.r < centerD.r - 20.0 && sCoC < 1.5) w *= 0.15;
    accum += sc * w;
    totalW += w;
  }
  outColor = accum / totalW;
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir; // (1/w, 0) or (0, 1/h)
uniform float uRadius;
out vec4 outColor;
void main() {
  if (uRadius < 0.25) {
    outColor = texture(uTex, vUv);
    return;
  }
  float sigma = max(0.5, uRadius * 0.45);
  int steps = int(clamp(ceil(uRadius), 1.0, 28.0));
  float stride = max(1.0, uRadius / float(steps));
  vec4 sum = texture(uTex, vUv);
  float wSum = 1.0;
  for (int i = 1; i <= 28; i++) {
    if (i > steps) break;
    float dist = float(i) * stride;
    float w = exp(-(dist * dist) / (2.0 * sigma * sigma));
    vec2 off = uDir * dist;
    sum += texture(uTex, clamp(vUv + off, vec2(0.0), vec2(1.0))) * w;
    sum += texture(uTex, clamp(vUv - off, vec2(0.0), vec2(1.0))) * w;
    wSum += 2.0 * w;
  }
  outColor = sum / wSum;
}`;

const GLOW_EXTRACT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
uniform vec3 uGlowColor;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float knee = smoothstep(uThreshold * 0.75, uThreshold + 0.22, lum);
  outColor = vec4(c.rgb * uGlowColor * knee, c.a * knee);
}`;

const GLOW_COMBINE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform float uIntensity;
out vec4 outColor;
void main() {
  vec4 src = texture(uSrc, vUv);
  vec4 blm = texture(uBloom, vUv) * uIntensity;
  float bloomA = clamp(max(blm.a, max(blm.r, max(blm.g, blm.b)) * 0.65), 0.0, 1.0);
  outColor = vec4(src.rgb + blm.rgb, clamp(src.a + bloomA * (1.0 - src.a), 0.0, 1.0));
}`;

const DROPSHADOW_EXTRACT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uOffsetUv;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 outColor;
void main() {
  vec2 suv = vUv - uOffsetUv;
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  float a = texture(uTex, suv).a * uOpacity;
  outColor = vec4(uColor * a, a);
}`;

const DROPSHADOW_COMBINE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uShadow;
out vec4 outColor;
void main() {
  vec4 src = texture(uSrc, vUv);
  vec4 sh = texture(uShadow, vUv);
  // Source over Shadow (premultiplied Porter-Duff)
  outColor = src + sh * (1.0 - src.a);
}`;

const HSL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uHue;   // -0.5..0.5
uniform float uSat;   // -1..1
uniform float uLight; // -1..1
out vec4 outColor;

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float s = 0.0, h = 0.0;
  float d = mx - mn;
  if (d > 1e-5) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y < 1e-5) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

void main() {
  vec4 c = texture(uTex, vUv);
  if (c.a < 1e-4) { outColor = vec4(0.0); return; }
  vec3 straight = c.rgb / c.a;
  vec3 hsl = rgb2hsl(clamp(straight, 0.0, 1.0));
  hsl.x = fract(hsl.x + uHue);
  hsl.y = clamp(hsl.y + uSat * (uSat > 0.0 ? (1.0 - hsl.y) : hsl.y), 0.0, 1.0);
  hsl.z = clamp(hsl.z + uLight * (uLight > 0.0 ? (1.0 - hsl.z) : hsl.z), 0.0, 1.0);
  vec3 res = hsl2rgb(hsl) + max(straight - 1.0, vec3(0.0)); // preserve HDR highlights!
  outColor = vec4(res * c.a, c.a);
}`;

const MASK_APPLY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform int uMode; // 0: alpha, 1: alphaInv, 2: luma, 3: lumaInv
out vec4 outColor;
void main() {
  vec4 s = texture(uSrc, vUv);
  vec4 m = texture(uMask, vUv);
  float factor = 1.0;
  if (uMode == 0) factor = m.a;
  else if (uMode == 1) factor = 1.0 - m.a;
  else if (uMode == 2) factor = dot(m.rgb, vec3(0.2126, 0.7152, 0.0722));
  else if (uMode == 3) factor = 1.0 - dot(m.rgb, vec3(0.2126, 0.7152, 0.0722));
  outColor = s * clamp(factor, 0.0, 1.0);
}`;

// Exact W3C Porter-Duff Premultiplied Blend Modes (Normal, Add, Screen, Multiply, Overlay)
const BLEND_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDst;
uniform sampler2D uSrc;
uniform int uMode; // 0: normal, 1: add, 2: screen, 3: multiply, 4: overlay
uniform float uOpacity;
out vec4 outColor;

vec3 blendOverlay(vec3 b, vec3 s) {
  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
}

void main() {
  vec4 dst = texture(uDst, vUv);
  vec4 src = texture(uSrc, vUv) * uOpacity;
  float as = clamp(src.a, 0.0, 1.0);
  float ad = clamp(dst.a, 0.0, 1.0);

  if (uMode == 0) {
    // Normal (premultiplied Src Over Dst)
    outColor = vec4(src.rgb + dst.rgb * (1.0 - as), as + ad * (1.0 - as));
    return;
  }
  if (uMode == 1) {
    // Add (Linear Dodge, preserves alpha cleanly on transparent backgrounds)
    outColor = vec4(dst.rgb + src.rgb, clamp(ad + as * (1.0 - ad), 0.0, 1.0));
    return;
  }

  vec3 Cs = as > 1e-5 ? src.rgb / as : vec3(0.0);
  vec3 Cd = ad > 1e-5 ? dst.rgb / ad : vec3(0.0);
  vec3 B = Cs;
  if (uMode == 2) {
    // Screen: 1 - (1 - Cd)*(1 - Cs)
    B = vec3(1.0) - (vec3(1.0) - clamp(Cd, 0.0, 1.0)) * (vec3(1.0) - clamp(Cs, 0.0, 1.0)) + max(Cs - 1.0, 0.0) + max(Cd - 1.0, 0.0);
  } else if (uMode == 3) {
    // Multiply
    B = Cd * Cs;
  } else if (uMode == 4) {
    // Overlay
    B = blendOverlay(clamp(Cd, 0.0, 1.0), clamp(Cs, 0.0, 1.0));
  }

  // Exact W3C Premultiplied Alpha Compositing:
  // Co = as*(1-ad)*Cs + ad*(1-as)*Cd + as*ad*B(Cd, Cs)
  vec3 outRgb = src.rgb * (1.0 - ad) + dst.rgb * (1.0 - as) + as * ad * B;
  float outA = as + ad - as * ad;
  outColor = vec4(outRgb, clamp(outA, 0.0, 1.0));
}`;

const ACCUM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uWeight;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUv) * uWeight;
}`;

const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uShowChecker;
uniform vec2 uResolution;
out vec4 outColor;

vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec4 c = texture(uTex, vUv);
  float a = clamp(c.a, 0.0, 1.0);
  vec3 straight = a > 1e-4 ? c.rgb / a : vec3(0.0);
  if (uShowChecker == 0) {
    // Subtle dark-foundry radial atmosphere depth behind opaque compositions
    vec2 centered = (vUv - vec2(0.5, 0.46)) * vec2(1.45, 1.15);
    float radial = exp(-dot(centered, centered) * 1.8);
    straight += vec3(0.012, 0.016, 0.026) * radial;
  }
  vec3 mapped = acesToneMap(max(straight, vec3(0.0)));
  vec3 srgb = pow(mapped, vec3(1.0 / 2.2));

  vec3 bg = vec3(0.04, 0.045, 0.055);
  if (uShowChecker == 1) {
    vec2 cell = floor(gl_FragCoord.xy / 14.0);
    float chk = mod(cell.x + cell.y, 2.0);
    bg = mix(vec3(0.14), vec3(0.20), chk);
  }
  vec3 finalRgb = srgb * a + bg * (1.0 - a);
  outColor = vec4(finalRgb, 1.0);
}`;

const BLEND_MODE_IDX: Record<BlendMode, number> = {
  normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4,
};

// ============================================================================
// Main WebGL 2 Engine Class
// ============================================================================
export class WebGL2StudioRenderer {
  public canvas: HTMLCanvasElement;
  public gl: WebGL2RenderingContext;
  private hasFloatExt = false;

  // Programs
  private shadowProg: WebGLProgram;
  private pbrProg: WebGLProgram;
  private plane3dProg: WebGLProgram;
  private particleProg: WebGLProgram;
  private trailProg: WebGLProgram;
  private dofProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private glowExtractProg: WebGLProgram;
  private glowCombineProg: WebGLProgram;
  private dropShadowExtractProg: WebGLProgram;
  private dropShadowCombineProg: WebGLProgram;
  private hslProg: WebGLProgram;
  private maskApplyProg: WebGLProgram;
  private blendProg: WebGLProgram;
  private accumProg: WebGLProgram;
  private displayProg: WebGLProgram;

  // Shared GPU resources
  private quadVao: WebGLVertexArrayObject;
  private envCubemap: WebGLTexture;
  private shadowMap: ShadowMapTarget;

  // Dynamic mesh & particle VBOs
  private meshVao: WebGLVertexArrayObject;
  private meshPosBuf: WebGLBuffer;
  private meshNormBuf: WebGLBuffer;
  private meshUvBuf: WebGLBuffer;
  private meshHeatBuf: WebGLBuffer;
  private meshIdxBuf: WebGLBuffer;

  private planeVao: WebGLVertexArrayObject;
  private planeBuf: WebGLBuffer;

  private particleVao: WebGLVertexArrayObject;
  private particleBuf: WebGLBuffer;

  private trailVao: WebGLVertexArrayObject;
  private trailBuf: WebGLBuffer;

  // Reusable 2D Canvas for crisp vector shape/text/mask rasterization -> GPU upload
  private rasterCanvas: HTMLCanvasElement;
  private rasterCtx: CanvasRenderingContext2D;
  private rasterTex: WebGLTexture;
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private maskTex: WebGLTexture;

  // FBO pool keyed by size+flags
  private rtPool: Map<string, RenderTarget[]> = new Map();
  private lastSceneSnapshot: EvaluatedSceneSnapshot | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true, // CRITICAL for screenshot & videoExport reliability!
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('浏览器不支持 WebGL 2');
    this.gl = gl;
    this.hasFloatExt = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    // Compile all shaders
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS);
    this.pbrProg = createProgram(gl, PBR_VS, PBR_FS);
    this.plane3dProg = createProgram(gl, PLANE3D_VS, PLANE3D_FS);
    this.particleProg = createProgram(gl, PARTICLE_VS, PARTICLE_FS);
    this.trailProg = createProgram(gl, TRAIL_VS, TRAIL_FS);
    this.dofProg = createProgram(gl, QUAD_VS, DOF_FS);
    this.blurProg = createProgram(gl, QUAD_VS, BLUR_FS);
    this.glowExtractProg = createProgram(gl, QUAD_VS, GLOW_EXTRACT_FS);
    this.glowCombineProg = createProgram(gl, QUAD_VS, GLOW_COMBINE_FS);
    this.dropShadowExtractProg = createProgram(gl, QUAD_VS, DROPSHADOW_EXTRACT_FS);
    this.dropShadowCombineProg = createProgram(gl, QUAD_VS, DROPSHADOW_COMBINE_FS);
    this.hslProg = createProgram(gl, QUAD_VS, HSL_FS);
    this.maskApplyProg = createProgram(gl, QUAD_VS, MASK_APPLY_FS);
    this.blendProg = createProgram(gl, QUAD_VS, BLEND_FS);
    this.accumProg = createProgram(gl, QUAD_VS, ACCUM_FS);
    this.displayProg = createProgram(gl, QUAD_VS, DISPLAY_FS);

    this.quadVao = gl.createVertexArray()!;
    this.envCubemap = createProceduralEnvCubemap(gl, 128);
    this.shadowMap = createShadowMapTarget(gl, 2048);

    // Mesh VAO
    this.meshVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVao);
    this.meshPosBuf = gl.createBuffer()!;
    this.meshNormBuf = gl.createBuffer()!;
    this.meshUvBuf = gl.createBuffer()!;
    this.meshHeatBuf = gl.createBuffer()!;
    this.meshIdxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshNormBuf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshUvBuf);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshHeatBuf);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIdxBuf);
    gl.bindVertexArray(null);

    // 3D Plane VAO (pos3 + uv2)
    this.planeVao = gl.createVertexArray()!;
    this.planeBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.planeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);

    // Particle Billboard VAO (pos3, corner2, color4, size1, emissive1 -> 11 floats = 44 bytes)
    this.particleVao = gl.createVertexArray()!;
    this.particleBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 44, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 44, 36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
    gl.bindVertexArray(null);

    // Trail Ribbon VAO (pos3, color4, edge1 -> 8 floats = 32 bytes)
    this.trailVao = gl.createVertexArray()!;
    this.trailBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
    gl.bindVertexArray(null);

    // Offscreen 2D Canvas rasterizers
    this.rasterCanvas = document.createElement('canvas');
    this.rasterCtx = this.rasterCanvas.getContext('2d')!;
    this.rasterTex = this.createLinearTex();

    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d')!;
    this.maskTex = this.createLinearTex();
  }

  private createLinearTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private acquireRT(w: number, h: number, opts: { hdr?: boolean; hasDepth?: boolean; hasMRT?: boolean } = {}): RenderTarget {
    const key = `${w}x${h}|${opts.hdr ? 1 : 0}|${opts.hasDepth ? 1 : 0}|${opts.hasMRT ? 1 : 0}`;
    const list = this.rtPool.get(key);
    if (list && list.length > 0) return list.pop()!;
    return createRenderTarget(this.gl, w, h, { ...opts, hasFloatExt: this.hasFloatExt });
  }

  private releaseRT(rt: RenderTarget): void {
    const key = `${rt.width}x${rt.height}|${rt.hdr ? 1 : 0}|${rt.depthRb ? 1 : 0}|${rt.hasMRT ? 1 : 0}`;
    let list = this.rtPool.get(key);
    if (!list) { list = []; this.rtPool.set(key, list); }
    if (list.length < 14) list.push(rt);
    else destroyRenderTarget(this.gl, rt);
  }

  public getLastSceneSnapshot(): EvaluatedSceneSnapshot | null {
    return this.lastSceneSnapshot;
  }

  /**
   * Main Entry Point: Render active Composition at `time` to display Canvas!
   */
  public renderFrame(
    project: Project,
    comp: Composition,
    time: number,
    outWidth: number,
    outHeight: number,
    showTransparentChecker = true
  ): EvaluatedSceneSnapshot {
    const gl = this.gl;
    const rw = clamp(Math.round(outWidth), 64, 3840);
    const rh = clamp(Math.round(outHeight), 64, 2160);
    if (this.canvas.width !== rw || this.canvas.height !== rh) {
      this.canvas.width = rw;
      this.canvas.height = rh;
    }

    // Evaluate center-time scene snapshot (always returned for viewport overlays & picking!)
    const centerSnap = evaluateSceneSnapshot(comp, time);
    this.lastSceneSnapshot = centerSnap;

    const finalRT = this.renderCompositionToRT(project, comp, time, rw, rh, 0, centerSnap);

    // Final ACES ToneMap + sRGB display pass to default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rw, rh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.displayProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, finalRT.colorTex);
    gl.uniform1i(gl.getUniformLocation(this.displayProg, 'uTex'), 0);
    gl.uniform1i(gl.getUniformLocation(this.displayProg, 'uShowChecker'), comp.bgTransparent && showTransparentChecker ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(this.displayProg, 'uResolution'), rw, rh);
    this.drawFullscreenQuad();

    this.releaseRT(finalRT);
    return centerSnap;
  }

  /**
   * Render a Composition (handling Shutter Motion Blur + Pre-compositions recursively!) into an RT.
   */
  private renderCompositionToRT(
    project: Project,
    comp: Composition,
    time: number,
    rw: number,
    rh: number,
    depth: number,
    precomputedCenterSnap?: EvaluatedSceneSnapshot
  ): RenderTarget {
    if (depth > 6) {
      const empty = this.acquireRT(rw, rh, { hdr: true });
      this.clearRT(empty, [0, 0, 0, 0]);
      return empty;
    }

    // Check if true multi-sample Shutter Motion Blur is active on this comp
    const hasBlurLayer = comp.motionBlur && comp.layers.some(
      (l) => l.visible && l.motionBlur && time >= l.inPoint && time <= l.outPoint
    );

    if (!hasBlurLayer || comp.shutterAngle <= 1) {
      return this.renderCompSingleInstant(project, comp, time, time, rw, rh, depth, precomputedCenterSnap);
    }

    const gl = this.gl;
    const samples = clamp(Math.round(comp.motionBlurSamples || 7), 3, 12);
    const frameDur = 1 / Math.max(1, comp.fps || 30);
    const tStart = time + (comp.shutterPhase / 360) * frameDur;
    const tSpan = (comp.shutterAngle / 360) * frameDur;

    const accumRT = this.acquireRT(rw, rh, { hdr: true });
    this.clearRT(accumRT, [0, 0, 0, 0]);

    const weight = 1 / samples;
    for (let s = 0; s < samples; s++) {
      const u = samples === 1 ? 0.5 : (s + 0.5) / samples;
      const subTime = Math.max(0, tStart + u * tSpan);
      const sampleRT = this.renderCompSingleInstant(project, comp, subTime, time, rw, rh, depth);

      // Additive accumulation into accumRT
      gl.bindFramebuffer(gl.FRAMEBUFFER, accumRT.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.accumProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sampleRT.colorTex);
      gl.uniform1i(gl.getUniformLocation(this.accumProg, 'uTex'), 0);
      gl.uniform1f(gl.getUniformLocation(this.accumProg, 'uWeight'), weight);
      this.drawFullscreenQuad();
      gl.disable(gl.BLEND);

      this.releaseRT(sampleRT);
    }

    return accumRT;
  }

  /**
   * Render a Composition at a single sample instant:
   * - Layers with `motionBlur === true` evaluate at `sampleTime`
   * - Layers with `motionBlur === false` evaluate at `centerTime` (stay razor sharp!)
   */
  private renderCompSingleInstant(
    project: Project,
    comp: Composition,
    sampleTime: number,
    centerTime: number,
    rw: number,
    rh: number,
    depth: number,
    precomputedSnap?: EvaluatedSceneSnapshot
  ): RenderTarget {
    const gl = this.gl;
    const snapSample = (sampleTime === centerTime && precomputedSnap)
      ? precomputedSnap
      : evaluateSceneSnapshot(comp, sampleTime);
    const snapCenter = sampleTime === centerTime
      ? snapSample
      : (precomputedSnap ?? evaluateSceneSnapshot(comp, centerTime));

    let compRT = this.acquireRT(rw, rh, { hdr: true });
    const bg: ColorRGBA = comp.bgTransparent ? [0, 0, 0, 0] : comp.bgColor;
    // Clear with premultiplied linear background
    this.clearRT(compRT, [
      Math.pow(bg[0], 2.2) * bg[3],
      Math.pow(bg[1], 2.2) * bg[3],
      Math.pow(bg[2], 2.2) * bg[3],
      bg[3],
    ]);

    // Check solo flag (if any visible renderable layer is soloed, render only soloed renderables)
    const hasSolo = comp.layers.some((l) => l.solo && l.type !== 'camera' && l.type !== 'light' && l.type !== 'null' && l.type !== 'field' && l.type !== 'audio');

    // Identify Track Matte source indices (in AE, if layer i has trackMatte !== 'none', layer i-1 is its matte!)
    const matteSourceIndices = new Set<number>();
    for (let i = 1; i < comp.layers.length; i++) {
      const l = comp.layers[i];
      if (l.visible && l.trackMatte !== 'none') {
        matteSourceIndices.add(i - 1);
      }
    }

    // Iterate layers bottom-to-top (AE order: index N-1 at bottom, index 0 on top!)
    // Group contiguous 3D layers (mesh3d, particle, 3D shape/text/precomp) into ONE unified 3D depth space pass!
    let idx = comp.layers.length - 1;
    while (idx >= 0) {
      const layer = comp.layers[idx];
      if (
        !layer.visible ||
        matteSourceIndices.has(idx) ||
        layer.type === 'camera' || layer.type === 'light' || layer.type === 'null' || layer.type === 'field' || layer.type === 'audio'
      ) {
        idx--;
        continue;
      }
      const lTime = layer.motionBlur ? sampleTime : centerTime;
      if (lTime < layer.inPoint || lTime > layer.outPoint) {
        idx--;
        continue;
      }
      if (hasSolo && !layer.solo) {
        idx--;
        continue;
      }

      // 1) Adjustment Layer: applies its effects stack to compRT below, clipped by its masks & opacity!
      if (layer.type === 'adjustment') {
        const snap = layer.motionBlur ? snapSample : snapCenter;
        const tr = evaluateLayerLocalTransform(comp, layer, lTime, snap.ec);
        const effOpacity = clamp(tr.opacity / 100, 0, 1);
        if (effOpacity > 0.005 && layer.effects.some((e) => e.enabled)) {
          let adjusted = this.applyEffectsStack(comp, layer, compRT, lTime, snap.ec, rw, rh, true);
          if (layer.masks.some((m) => m.enabled)) {
            adjusted = this.applyLayerMasks(comp, layer, adjusted, lTime, snap.ec, rw, rh);
          }
          const blended = this.compositeBlend(compRT, adjusted, layer.blendMode, effOpacity);
          this.releaseRT(adjusted);
          this.releaseRT(compRT);
          compRT = blended;
        }
        idx--;
        continue;
      }

      // 2) Contiguous 3D Layer Group (renders ALL 3D solids, 3D planes, 3D particles & trails in ONE shared depth buffer + DoF!)
      if (layer.is3D && layer.trackMatte === 'none' && layer.masks.length === 0 && layer.effects.length === 0 && layer.blendMode === 'normal') {
        const group3D: Layer[] = [];
        while (idx >= 0) {
          const cur = comp.layers[idx];
          if (cur.type === 'camera' || cur.type === 'light' || cur.type === 'null' || cur.type === 'field' || cur.type === 'audio') {
            idx--;
            continue;
          }
          if (!cur.visible || matteSourceIndices.has(idx)) {
            idx--;
            continue;
          }
          if (hasSolo && !cur.solo) {
            idx--;
            continue;
          }
          if (cur.is3D && cur.type !== 'adjustment' && cur.trackMatte === 'none' && cur.masks.length === 0 && cur.effects.length === 0 && cur.blendMode === 'normal') {
            const ct = cur.motionBlur ? sampleTime : centerTime;
            if (ct >= cur.inPoint && ct <= cur.outPoint) group3D.push(cur);
            idx--;
          } else {
            break;
          }
        }
        if (group3D.length > 0) {
          const pass3DRT = this.render3DGroupPass(project, comp, group3D, sampleTime, centerTime, snapSample, snapCenter, rw, rh, depth);
          const blended = this.compositeBlend(compRT, pass3DRT, 'normal', 1.0);
          this.releaseRT(pass3DRT);
          this.releaseRT(compRT);
          compRT = blended;
        }
        continue;
      }

      // 3) Individual Layer Pass (2D shape/text/precomp OR isolated 3D layer with effects/masks/blendMode/trackMatte!)
      const snap = layer.motionBlur ? snapSample : snapCenter;
      let layerRT: RenderTarget | null = null;
      if (layer.is3D) {
        layerRT = this.render3DGroupPass(project, comp, [layer], sampleTime, centerTime, snapSample, snapCenter, rw, rh, depth);
      } else {
        layerRT = this.render2DLayerToRT(project, comp, layer, lTime, snap, rw, rh, depth);
      }

      if (layerRT) {
        // Apply per-layer Masks
        if (layer.masks.some((m) => m.enabled)) {
          layerRT = this.applyLayerMasks(comp, layer, layerRT, lTime, snap.ec, rw, rh);
        }
        // Apply Track Matte (from layer above: idx - 1)
        if (layer.trackMatte !== 'none' && idx > 0) {
          const matteLayer = comp.layers[idx - 1];
          const mTime = matteLayer.motionBlur ? sampleTime : centerTime;
          const mSnap = matteLayer.motionBlur ? snapSample : snapCenter;
          const matteRT = matteLayer.is3D
            ? this.render3DGroupPass(project, comp, [matteLayer], sampleTime, centerTime, snapSample, snapCenter, rw, rh, depth)
            : this.render2DLayerToRT(project, comp, matteLayer, mTime, mSnap, rw, rh, depth);
          if (matteRT) {
            const modeIdx = layer.trackMatte === 'alpha' ? 0 : layer.trackMatte === 'alphaInverted' ? 1 : layer.trackMatte === 'luma' ? 2 : 3;
            const masked = this.applyMaskTexture(layerRT, matteRT.colorTex, modeIdx);
            this.releaseRT(matteRT);
            this.releaseRT(layerRT);
            layerRT = masked;
          }
        }
        // Apply Ordered Layer Effects Stack (Gaussian Blur, Glow, Drop Shadow, HSL!)
        if (layer.effects.some((e) => e.enabled)) {
          layerRT = this.applyEffectsStack(comp, layer, layerRT, lTime, snap.ec, rw, rh, false);
        }

        const tr = evaluateLayerLocalTransform(comp, layer, lTime, snap.ec);
        const layerOpacity = layer.is3D ? 1.0 : clamp(tr.opacity / 100, 0, 1);
        const blended = this.compositeBlend(compRT, layerRT, layer.blendMode, layerOpacity);
        this.releaseRT(layerRT);
        this.releaseRT(compRT);
        compRT = blended;
      }

      idx--;
    }

    return compRT;
  }

  // ==========================================================================
  // Unified 3D Space Pass (Shadow Map + PBR Solids + 3D Planes + Particles + Trails + DoF!)
  // ==========================================================================
  private render3DGroupPass(
    project: Project,
    comp: Composition,
    layers3D: Layer[],
    sampleTime: number,
    centerTime: number,
    snapSample: EvaluatedSceneSnapshot,
    snapCenter: EvaluatedSceneSnapshot,
    rw: number,
    rh: number,
    depth: number
  ): RenderTarget {
    const gl = this.gl;
    // Camera uses sampleTime if camera layer has motionBlur (or comp motionBlur), else centerTime
    const camLayer = comp.layers.find((l) => l.id === snapSample.camera.layerId);
    const cam = (camLayer && !camLayer.motionBlur) ? snapCenter.camera : snapSample.camera;
    const lights = snapSample.lights;

    // Collect evaluated mesh instances for this 3D group
    const meshInstances: EvaluatedMeshInstance[] = [];
    const planeLayers: Layer[] = [];
    const particleLayers: Layer[] = [];

    for (const l of layers3D) {
      const snap = l.motionBlur ? snapSample : snapCenter;
      if (l.type === 'mesh3d') {
        const inst = snap.meshes.get(l.id);
        if (inst && inst.localMesh.indices.length > 0) meshInstances.push(inst);
      } else if (l.type === 'particle') {
        particleLayers.push(l);
      } else if (l.type === 'shape' || l.type === 'text' || l.type === 'precomp') {
        planeLayers.push(l);
      }
    }

    // 1) Shadow Map Pass (Directional Shadow-Casting Light)
    const shadowLight = lights.find((l) => l.lightType === 'directional' && l.castShadow);
    let lightVP = m4Identity();
    let hasShadowMap = false;

    if (shadowLight && meshInstances.some((m) => m.castShadow)) {
      hasShadowMap = true;
      const extent = 520;
      const lightEye = v3Add(shadowLight.target, v3Scale(shadowLight.direction, 900));
      const lightView = m4LookAt(lightEye, shadowLight.target, [0, 1, 0]);
      const lightProj = m4Ortho(-extent, extent, -extent, extent, 80, 2200);
      lightVP = m4Mul(lightProj, lightView);

      gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowMap.fbo);
      gl.viewport(0, 0, this.shadowMap.size, this.shadowMap.size);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.shadowProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uLightVP'), false, lightVP);

      for (const inst of meshInstances) {
        if (!inst.castShadow || inst.opacity * inst.material.opacity < 0.05) continue;
        gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uModel'), false, inst.worldMatrix);
        this.uploadAndDrawMesh(inst.localMesh);
      }
    }

    // 2) Main 3D Pass into MRT FBO (COLOR_ATTACHMENT0 = HDR color, COLOR_ATTACHMENT1 = linear view depth, DEPTH24)
    const sceneRT = this.acquireRT(rw, rh, { hdr: true, hasDepth: true, hasMRT: true });
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneRT.fbo);
    gl.viewport(0, 0, rw, rh);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 0]));
    gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0, 0, 0, 0]));
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    // 2a) Opaque 3D PBR Meshes
    const opaqueMeshes = meshInstances.filter((m) => m.opacity * m.material.opacity >= 0.99);
    const transMeshes = meshInstances.filter((m) => m.opacity * m.material.opacity < 0.99);

    gl.disable(gl.BLEND);
    this.drawPBRMeshes(opaqueMeshes, cam, lights, lightVP, hasShadowMap, shadowLight);

    // 2b) 3D Planes (3D Shape / Text / Precomp layers rendered into shared depth buffer with alpha cutout!)
    for (const pl of planeLayers) {
      const lt = pl.motionBlur ? sampleTime : centerTime;
      const snap = pl.motionBlur ? snapSample : snapCenter;
      const texRT = this.render2DLayerLocalTexture(project, comp, pl, lt, snap, depth);
      if (texRT) {
        const wm = getLayerWorldMatrix(comp, pl, lt, snap.ec);
        const tr = evaluateLayerLocalTransform(comp, pl, lt, snap.ec);
        const op = clamp(tr.opacity / 100, 0, 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneRT.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this.drawTexturedPlane3D(texRT.colorTex, texRT.width, texRT.height, wm, cam, op);
        this.releaseRT(texRT);
      }
    }

    // 2c) Semi-transparent 3D Meshes (sorted back-to-front by camera view depth)
    if (transMeshes.length > 0) {
      transMeshes.sort((a, b) => {
        const ca = m4TransformPoint(cam.view, m4TransformPoint(a.worldMatrix, [0, 0, 0]));
        const cb = m4TransformPoint(cam.view, m4TransformPoint(b.worldMatrix, [0, 0, 0]));
        return ca[2] - cb[2];
      });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.drawPBRMeshes(transMeshes, cam, lights, lightVP, hasShadowMap, shadowLight);
    }

    // 2d) 3D Particles & 3D Trajectory Trails (depth-tested against all 3D solids & holes!)
    if (particleLayers.length > 0) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Camera right & up axes in World Space (rows 0 and 1 of view matrix)
      const camRight: Vec3 = [cam.view[0], cam.view[4], cam.view[8]];
      const camUp: Vec3 = [cam.view[1], cam.view[5], cam.view[9]];

      for (const pl of particleLayers) {
        const lt = pl.motionBlur ? sampleTime : centerTime;
        const particles = particleEngine.queryRenderParticles(comp, pl, lt);
        if (particles.length === 0) continue;
        // Additive-friendly glowing spark blend
        gl.blendFunc(gl.ONE, gl.ONE);
        if (pl.particle?.trailsEnabled) {
          this.drawParticleTrails3D(particles, cam);
        }
        this.drawParticles3D(particles, cam, camRight, camUp);
      }
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // 3) True Depth-of-Field Post-Pass (driven by actual scene view depth!)
    if (cam.dofEnabled && cam.aperture > 0.5 && sceneRT.depthTex) {
      const dofRT = this.acquireRT(rw, rh, { hdr: true });
      gl.bindFramebuffer(gl.FRAMEBUFFER, dofRT.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(this.dofProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneRT.colorTex);
      gl.uniform1i(gl.getUniformLocation(this.dofProg, 'uColorTex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sceneRT.depthTex);
      gl.uniform1i(gl.getUniformLocation(this.dofProg, 'uDepthTex'), 1);
      gl.uniform2f(gl.getUniformLocation(this.dofProg, 'uTexelSize'), 1 / rw, 1 / rh);
      gl.uniform1f(gl.getUniformLocation(this.dofProg, 'uFocalDistance'), cam.focalDistance);
      gl.uniform1f(gl.getUniformLocation(this.dofProg, 'uAperture'), cam.aperture);
      gl.uniform1f(gl.getUniformLocation(this.dofProg, 'uDofScale'), rw / comp.width);
      this.drawFullscreenQuad();
      this.releaseRT(sceneRT);
      return dofRT;
    }

    return sceneRT;
  }

  private drawPBRMeshes(
    instances: EvaluatedMeshInstance[],
    cam: EvaluatedCamera,
    lights: EvaluatedLight[],
    lightVP: Mat4,
    hasShadowMap: boolean,
    shadowLight?: EvaluatedLight
  ): void {
    if (instances.length === 0) return;
    const gl = this.gl;
    const p = this.pbrProg;
    gl.useProgram(p);

    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, cam.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, cam.proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uLightVP'), false, lightVP);
    gl.uniform3fv(gl.getUniformLocation(p, 'uCamPos'), cam.eye);

    // Upload lights (put shadow-casting directional light first at index 0!)
    const orderedLights = shadowLight
      ? [shadowLight, ...lights.filter((l) => l !== shadowLight)].slice(0, 6)
      : lights.slice(0, 6);
    gl.uniform1i(gl.getUniformLocation(p, 'uLightCount'), orderedLights.length);

    const posType = new Float32Array(24);
    const colInt = new Float32Array(24);
    const ranges = new Float32Array(6);
    for (let i = 0; i < orderedLights.length; i++) {
      const l = orderedLights[i];
      if (l.lightType === 'directional') {
        posType[i * 4 + 0] = l.direction[0];
        posType[i * 4 + 1] = l.direction[1];
        posType[i * 4 + 2] = l.direction[2];
        posType[i * 4 + 3] = 0;
      } else {
        posType[i * 4 + 0] = l.position[0];
        posType[i * 4 + 1] = l.position[1];
        posType[i * 4 + 2] = l.position[2];
        posType[i * 4 + 3] = 1;
      }
      colInt[i * 4 + 0] = Math.pow(l.color[0], 2.2);
      colInt[i * 4 + 1] = Math.pow(l.color[1], 2.2);
      colInt[i * 4 + 2] = Math.pow(l.color[2], 2.2);
      colInt[i * 4 + 3] = l.intensity;
      ranges[i] = l.range;
    }
    gl.uniform4fv(gl.getUniformLocation(p, 'uLightPosType'), posType);
    gl.uniform4fv(gl.getUniformLocation(p, 'uLightColorInt'), colInt);
    gl.uniform1fv(gl.getUniformLocation(p, 'uLightRange'), ranges);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envCubemap);
    gl.uniform1i(gl.getUniformLocation(p, 'uEnvMap'), 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uEnvScale'), (this.envCubemap as any).__envScale ?? 1.0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap.depthTex);
    gl.uniform1i(gl.getUniformLocation(p, 'uShadowMap'), 1);
    gl.uniform1i(gl.getUniformLocation(p, 'uHasShadowMap'), hasShadowMap ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uShadowBias'), shadowLight?.shadowBias ?? 0.0025);
    gl.uniform1f(gl.getUniformLocation(p, 'uShadowSoftness'), shadowLight?.shadowSoftness ?? 2.0);

    for (const inst of instances) {
      const m = inst.material;
      gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uModel'), false, inst.worldMatrix);
      gl.uniform4f(
        gl.getUniformLocation(p, 'uBaseColor'),
        Math.pow(m.baseColor[0], 2.2), Math.pow(m.baseColor[1], 2.2), Math.pow(m.baseColor[2], 2.2), m.baseColor[3]
      );
      gl.uniform1f(gl.getUniformLocation(p, 'uMetallic'), m.metallic);
      gl.uniform1f(gl.getUniformLocation(p, 'uRoughness'), m.roughness);
      gl.uniform3f(
        gl.getUniformLocation(p, 'uEmissiveColor'),
        Math.pow(m.emissiveColor[0], 2.2), Math.pow(m.emissiveColor[1], 2.2), Math.pow(m.emissiveColor[2], 2.2)
      );
      gl.uniform1f(gl.getUniformLocation(p, 'uEmissiveIntensity'), m.emissiveIntensity);
      gl.uniform1f(gl.getUniformLocation(p, 'uOpacity'), inst.opacity * m.opacity);
      gl.uniform3f(
        gl.getUniformLocation(p, 'uHeatColor'),
        Math.pow(m.heatColor[0], 2.2), Math.pow(m.heatColor[1], 2.2), Math.pow(m.heatColor[2], 2.2)
      );
      gl.uniform1f(gl.getUniformLocation(p, 'uHeatIntensity'), m.heatIntensity);
      gl.uniform1i(gl.getUniformLocation(p, 'uReceiveShadow'), inst.receiveShadow ? 1 : 0);

      this.uploadAndDrawMesh(inst.localMesh);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  }

  private uploadAndDrawMesh(mesh: TriMesh3D): void {
    const gl = this.gl;
    if (mesh.indices.length === 0) return;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshNormBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshUvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshHeatBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.heat, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  private drawTexturedPlane3D(
    tex: WebGLTexture,
    w: number,
    h: number,
    worldMat: Mat4,
    cam: EvaluatedCamera,
    opacity: number
  ): void {
    const gl = this.gl;
    const hw = w * 0.5, hh = h * 0.5;
    const verts = new Float32Array([
      -hw, -hh, 0, 0, 0,
       hw, -hh, 0, 1, 0,
      -hw,  hh, 0, 0, 1,
       hw, -hh, 0, 1, 0,
       hw,  hh, 0, 1, 1,
      -hw,  hh, 0, 0, 1,
    ]);
    gl.useProgram(this.plane3dProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uModel'), false, worldMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uView'), false, cam.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uProj'), false, cam.proj);
    gl.uniform1f(gl.getUniformLocation(this.plane3dProg, 'uOpacity'), opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(this.plane3dProg, 'uTex'), 0);

    gl.bindVertexArray(this.planeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private drawParticles3D(particles: RenderParticle[], cam: EvaluatedCamera, camRight: Vec3, camUp: Vec3): void {
    const gl = this.gl;
    const n = particles.length;
    if (n === 0) return;
    // 6 vertices per quad × 11 floats = 66 floats per particle
    const data = new Float32Array(n * 66);
    const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, -1], [1, 1], [-1, 1]];

    let off = 0;
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      const r = Math.pow(p.color[0], 2.2), g = Math.pow(p.color[1], 2.2), b = Math.pow(p.color[2], 2.2), a = p.color[3];
      for (let c = 0; c < 6; c++) {
        data[off++] = p.pos[0]; data[off++] = p.pos[1]; data[off++] = p.pos[2];
        data[off++] = corners[c][0]; data[off++] = corners[c][1];
        data[off++] = r; data[off++] = g; data[off++] = b; data[off++] = a;
        data[off++] = p.size;
        data[off++] = p.emissiveBoost;
      }
    }

    gl.useProgram(this.particleProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.particleProg, 'uView'), false, cam.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.particleProg, 'uProj'), false, cam.proj);
    gl.uniform3fv(gl.getUniformLocation(this.particleProg, 'uCamRight'), camRight);
    gl.uniform3fv(gl.getUniformLocation(this.particleProg, 'uCamUp'), camUp);

    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, n * 6);
    gl.bindVertexArray(null);
  }

  private drawParticleTrails3D(particles: RenderParticle[], cam: EvaluatedCamera): void {
    const gl = this.gl;
    const verts: number[] = [];

    for (const p of particles) {
      const tr = p.trail;
      if (tr.length < 2) continue;
      const r = Math.pow(p.color[0], 2.2), g = Math.pow(p.color[1], 2.2), b = Math.pow(p.color[2], 2.2);

      for (let i = 0; i < tr.length - 1; i++) {
        const a = tr[i], c = tr[i + 1];
        const seg = v3Sub(c.pos, a.pos);
        if (Math.hypot(seg[0], seg[1], seg[2]) < 1e-3) continue;
        const toCam = v3Norm(v3Sub(cam.eye, a.pos));
        const side = v3Norm(v3Cross(seg, toCam));
        const sA = v3Scale(side, a.width * 0.5);
        const sB = v3Scale(side, c.width * 0.5);

        const aL = v3Sub(a.pos, sA), aR = v3Add(a.pos, sA);
        const bL = v3Sub(c.pos, sB), bR = v3Add(c.pos, sB);

        const pushV = (pos: Vec3, alpha: number, edge: number) => {
          verts.push(pos[0], pos[1], pos[2], r, g, b, alpha, edge);
        };
        pushV(aL, a.alpha, -1); pushV(aR, a.alpha, 1); pushV(bL, c.alpha, -1);
        pushV(aR, a.alpha, 1); pushV(bR, c.alpha, 1); pushV(bL, c.alpha, -1);
      }
    }
    if (verts.length === 0) return;

    gl.useProgram(this.trailProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.trailProg, 'uView'), false, cam.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.trailProg, 'uProj'), false, cam.proj);
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 8);
    gl.bindVertexArray(null);
  }

  // ==========================================================================
  // 2D Layer Rendering (Shape, Text, Precomp -> GPU Texture / RT)
  // ==========================================================================
  private render2DLayerToRT(
    project: Project,
    comp: Composition,
    layer: Layer,
    time: number,
    snap: EvaluatedSceneSnapshot,
    rw: number,
    rh: number,
    depth: number
  ): RenderTarget | null {
    const gl = this.gl;
    if (layer.type === 'precomp' && layer.precomp) {
      const subComp = project.compositions.find((c) => c.id === layer.precomp!.compId);
      if (!subComp) return null;
      const subTime = layer.precomp.timeRemapEnabled
        ? (snap.ec.evaluateProp(layer, layer.precomp.timeRemap, 'precomp.timeRemap', time) as number)
        : (time - layer.startTime);
      const clampedSubT = clamp(subTime, 0, Math.max(0, subComp.duration));
      const subRT = this.renderCompositionToRT(project, subComp, clampedSubT, rw, rh, depth + 1);

      // Apply layer's 2D transform onto a comp-sized RT
      const wm = getLayerWorldMatrix(comp, layer, time, snap.ec);
      const outRT = this.acquireRT(rw, rh, { hdr: true });
      this.clearRT(outRT, [0, 0, 0, 0]);
      // Render subRT textured quad using orthographic comp projection
      const proj2D = m4Ortho(0, comp.width, comp.height, 0, -1000, 1000);
      const hw = subComp.width * 0.5, hh = subComp.height * 0.5;
      const verts = new Float32Array([
        -hw, -hh, 0, 0, 1,
         hw, -hh, 0, 1, 1,
        -hw,  hh, 0, 0, 0,
         hw, -hh, 0, 1, 1,
         hw,  hh, 0, 1, 0,
        -hw,  hh, 0, 0, 0,
      ]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outRT.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(this.plane3dProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uModel'), false, wm);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uView'), false, m4Identity());
      gl.uniformMatrix4fv(gl.getUniformLocation(this.plane3dProg, 'uProj'), false, proj2D);
      gl.uniform1f(gl.getUniformLocation(this.plane3dProg, 'uOpacity'), 1.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, subRT.colorTex);
      gl.uniform1i(gl.getUniformLocation(this.plane3dProg, 'uTex'), 0);
      gl.bindVertexArray(this.planeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.releaseRT(subRT);
      return outRT;
    }

    // 2D Shape or Text rasterized cleanly in comp-pixel coordinates -> uploaded to HDR RT
    if (this.rasterCanvas.width !== rw || this.rasterCanvas.height !== rh) {
      this.rasterCanvas.width = rw;
      this.rasterCanvas.height = rh;
    }
    const ctx = this.rasterCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, rw, rh);

    const sx = rw / comp.width, sy = rh / comp.height;
    const wm = getLayerWorldMatrix(comp, layer, time, snap.ec);
    // Apply comp->render scale + 2D affine portion of world matrix
    ctx.setTransform(
      wm[0] * sx, wm[1] * sy,
      wm[4] * sx, wm[5] * sy,
      wm[12] * sx, wm[13] * sy
    );

    if (layer.type === 'shape' && layer.shape) {
      this.drawShapeOnCanvas2D(ctx, comp, layer, time, snap.ec);
    } else if (layer.type === 'text' && layer.text) {
      this.drawTextOnCanvas2D(ctx, comp, layer, time, snap.ec);
    }

    // Upload rasterized premultiplied RGBA into GPU texture & convert sRGB->linear into RT
    return this.uploadCanvasToRT(this.rasterCanvas, rw, rh);
  }

  /** Render a 3D-enabled Shape/Text/Precomp into a local-space RT for 3D quad projection */
  private render2DLayerLocalTexture(
    project: Project,
    comp: Composition,
    layer: Layer,
    time: number,
    snap: EvaluatedSceneSnapshot,
    depth: number
  ): RenderTarget | null {
    if (layer.type === 'precomp' && layer.precomp) {
      const subComp = project.compositions.find((c) => c.id === layer.precomp!.compId);
      if (!subComp) return null;
      const subTime = layer.precomp.timeRemapEnabled
        ? (snap.ec.evaluateProp(layer, layer.precomp.timeRemap, 'precomp.timeRemap', time) as number)
        : (time - layer.startTime);
      return this.renderCompositionToRT(project, subComp, clamp(subTime, 0, subComp.duration), subComp.width, subComp.height, depth + 1);
    }
    const tw = Math.min(1024, comp.width);
    const th = Math.min(1024, comp.height);
    if (this.rasterCanvas.width !== tw || this.rasterCanvas.height !== th) {
      this.rasterCanvas.width = tw;
      this.rasterCanvas.height = th;
    }
    const ctx = this.rasterCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, tw, th);
    ctx.translate(tw * 0.5, th * 0.5);

    if (layer.type === 'shape' && layer.shape) {
      this.drawShapeOnCanvas2D(ctx, comp, layer, time, snap.ec);
    } else if (layer.type === 'text' && layer.text) {
      this.drawTextOnCanvas2D(ctx, comp, layer, time, snap.ec);
    }
    return this.uploadCanvasToRT(this.rasterCanvas, tw, th);
  }

  private drawShapeOnCanvas2D(
    ctx: CanvasRenderingContext2D,
    comp: Composition,
    layer: Layer,
    time: number,
    ec: EvalContext
  ): void {
    const sh = layer.shape!;
    const evalRes = evaluateShapeLayer(comp, layer, sh, time, ec, 12);
    const fillCol = ec.evaluateProp(layer, sh.fillColor, 'shape.fillColor', time) as ColorRGBA;
    const fillOp = clamp((ec.evaluateProp(layer, sh.fillOpacity, 'shape.fillOpacity', time) as number) / 100, 0, 1);
    const strokeCol = ec.evaluateProp(layer, sh.strokeColor, 'shape.strokeColor', time) as ColorRGBA;
    const strokeW = Math.max(0, ec.evaluateProp(layer, sh.strokeWidth, 'shape.strokeWidth', time) as number);
    const strokeOp = clamp((ec.evaluateProp(layer, sh.strokeOpacity, 'shape.strokeOpacity', time) as number) / 100, 0, 1);

    const pins = sh.puppetPins && sh.puppetPins.length > 0
      ? sh.puppetPins.map((p) => ({
        rest: p.restPos,
        target: ec.evaluateProp(layer, p.position, `pin.${p.id}.pos`, time) as Vec2,
        rotDeg: ec.evaluateProp(layer, p.rotation, `pin.${p.id}.rot`, time) as number,
        scalePct: ec.evaluateProp(layer, p.scale, `pin.${p.id}.scl`, time) as number,
        radius: p.radius,
      }))
      : null;

    if (pins && sh.fillEnabled) {
      // Watertight triangulated 2D puppet deformation! (2.8)
      const tri = triangulatePolys2D(evalRes.polys, 22, false);
      const moved = applyPuppetPins2D(tri.points, pins);
      ctx.fillStyle = `rgba(${Math.round(fillCol[0] * 255)},${Math.round(fillCol[1] * 255)},${Math.round(fillCol[2] * 255)},${fillCol[3] * fillOp})`;
      for (let i = 0; i < tri.indices.length; i += 3) {
        const a = moved[tri.indices[i]], b = moved[tri.indices[i + 1]], c = moved[tri.indices[i + 2]];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    ctx.beginPath();
    for (const poly of evalRes.polys) {
      if (poly.points.length < 2) continue;
      ctx.moveTo(poly.points[0][0], poly.points[0][1]);
      for (let i = 1; i < poly.points.length; i++) ctx.lineTo(poly.points[i][0], poly.points[i][1]);
      if (poly.closed) ctx.closePath();
    }
    if (sh.fillEnabled && fillOp > 0.002) {
      ctx.fillStyle = `rgba(${Math.round(fillCol[0] * 255)},${Math.round(fillCol[1] * 255)},${Math.round(fillCol[2] * 255)},${fillCol[3] * fillOp})`;
      ctx.fill('evenodd');
    }
    if (sh.strokeEnabled && strokeW > 0.05 && strokeOp > 0.002) {
      ctx.strokeStyle = `rgba(${Math.round(strokeCol[0] * 255)},${Math.round(strokeCol[1] * 255)},${Math.round(strokeCol[2] * 255)},${strokeCol[3] * strokeOp})`;
      ctx.lineWidth = strokeW;
      ctx.lineCap = sh.strokeCap || 'round';
      ctx.lineJoin = sh.strokeJoin || 'round';
      ctx.stroke();
    }
  }

  private drawTextOnCanvas2D(
    ctx: CanvasRenderingContext2D,
    comp: Composition,
    layer: Layer,
    time: number,
    ec: EvalContext
  ): void {
    const tc = layer.text!;
    const layout = evaluateTextLayout(comp, layer, tc, time, ec);
    const fillCol = ec.evaluateProp(layer, tc.fillColor, 'text.fillColor', time) as ColorRGBA;
    const strokeCol = ec.evaluateProp(layer, tc.strokeColor, 'text.strokeColor', time) as ColorRGBA;
    const strokeW = Math.max(0, ec.evaluateProp(layer, tc.strokeWidth, 'text.strokeWidth', time) as number);
    const glowCol = ec.evaluateProp(layer, tc.writeOnGlowColor, 'text.writeOnGlowColor', time) as ColorRGBA;

    const pins = tc.puppetPins && tc.puppetPins.length > 0
      ? tc.puppetPins.map((p) => ({
        rest: p.restPos,
        target: ec.evaluateProp(layer, p.position, `pin.${p.id}.pos`, time) as Vec2,
        rotDeg: ec.evaluateProp(layer, p.rotation, `pin.${p.id}.rot`, time) as number,
        scalePct: ec.evaluateProp(layer, p.scale, `pin.${p.id}.scl`, time) as number,
        radius: p.radius,
      }))
      : null;

    if (pins && tc.fillEnabled) {
      const polys = flattenPathData(layout.combinedPath, 8);
      const tri = triangulatePolys2D(polys, 22, false);
      const moved = applyPuppetPins2D(tri.points, pins);
      ctx.fillStyle = `rgba(${Math.round(fillCol[0] * 255)},${Math.round(fillCol[1] * 255)},${Math.round(fillCol[2] * 255)},${fillCol[3]})`;
      for (let i = 0; i < tri.indices.length; i += 3) {
        const a = moved[tri.indices[i]], b = moved[tri.indices[i + 1]], c = moved[tri.indices[i + 2]];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    for (const glyph of layout.glyphs) {
      if (glyph.opacity < 0.005 || glyph.contours.length === 0) continue;
      ctx.save();
      ctx.globalAlpha = clamp(glyph.opacity, 0, 1);
      ctx.beginPath();
      for (const c of glyph.contours) {
        const vs = c.vertices;
        if (vs.length < 2) continue;
        ctx.moveTo(vs[0].x, vs[0].y);
        const segN = c.closed ? vs.length : vs.length - 1;
        for (let i = 0; i < segN; i++) {
          const a = vs[i], b = vs[(i + 1) % vs.length];
          ctx.bezierCurveTo(a.x + a.outX, a.y + a.outY, b.x + b.inX, b.y + b.inY, b.x, b.y);
        }
        if (c.closed) ctx.closePath();
      }
      if (tc.fillEnabled) {
        ctx.fillStyle = `rgba(${Math.round(fillCol[0] * 255)},${Math.round(fillCol[1] * 255)},${Math.round(fillCol[2] * 255)},${fillCol[3]})`;
        ctx.fill('evenodd');
      }
      if (tc.strokeEnabled && strokeW > 0.05) {
        ctx.strokeStyle = `rgba(${Math.round(strokeCol[0] * 255)},${Math.round(strokeCol[1] * 255)},${Math.round(strokeCol[2] * 255)},${strokeCol[3]})`;
        ctx.lineWidth = strokeW;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();
    }

    // Glowing molten brush tips during calligraphic write-on!
    if (tc.writeOnEnabled && layout.brushTips.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const tip of layout.brushTips) {
        const rad = Math.max(16, (ec.evaluateProp(layer, tc.fontSize, 'text.fontSize', time) as number) * 0.14);
        const grad = ctx.createRadialGradient(tip[0], tip[1], 1, tip[0], tip[1], rad);
        grad.addColorStop(0, 'rgba(255,252,230,1)');
        grad.addColorStop(0.28, `rgba(${Math.round(glowCol[0] * 255)},${Math.round(glowCol[1] * 255)},${Math.round(glowCol[2] * 255)},0.92)`);
        grad.addColorStop(1, 'rgba(255,90,10,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private uploadCanvasToRT(canvas: HTMLCanvasElement, rw: number, rh: number): RenderTarget {
    const gl = this.gl;
    // Acquire target RT FIRST before binding rasterTex to TEXTURE0 so createRenderTarget never clobbers TEXTURE0!
    const rt = this.acquireRT(rw, rh, { hdr: true });

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.rasterTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    // Copy into linear HDR RT via identity shader
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.viewport(0, 0, rw, rh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.accumProg);
    gl.uniform1i(gl.getUniformLocation(this.accumProg, 'uTex'), 0);
    gl.uniform1f(gl.getUniformLocation(this.accumProg, 'uWeight'), 1.0);
    this.drawFullscreenQuad();
    return rt;
  }

  // ==========================================================================
  // Multi-Mask Rasterization + Feathering + Track Matte Application (2.9)
  // ==========================================================================
  private applyLayerMasks(
    comp: Composition,
    layer: Layer,
    srcRT: RenderTarget,
    time: number,
    ec: EvalContext,
    rw: number,
    rh: number
  ): RenderTarget {
    const gl = this.gl;
    if (this.maskCanvas.width !== rw || this.maskCanvas.height !== rh) {
      this.maskCanvas.width = rw;
      this.maskCanvas.height = rh;
    }
    const ctx = this.maskCtx;
    const sx = rw / comp.width, sy = rh / comp.height;
    const wm = layer.type === 'adjustment' ? m4Identity() : getLayerWorldMatrix(comp, layer, time, ec);

    // Compose multiple masks sequentially (with per-mask feather!)
    let combinedMaskRT = this.acquireRT(rw, rh, { hdr: false });
    this.clearRT(combinedMaskRT, [0, 0, 0, 0]);
    let firstMask = true;

    for (const m of layer.masks) {
      if (!m.enabled) continue;
      const mOp = clamp((ec.evaluateProp(layer, m.opacity, `msk.${m.id}.opacity`, time) as number) / 100, 0, 1);
      const feather = Math.max(0, ec.evaluateProp(layer, m.feather, `msk.${m.id}.feather`, time) as number) * sx;
      const pd = ec.evaluateProp(layer, m.path, `msk.${m.id}.path`, time);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, rw, rh);
      if (m.inverted) {
        ctx.fillStyle = `rgba(255,255,255,${mOp})`;
        ctx.fillRect(0, 0, rw, rh);
      }

      ctx.save();
      if (layer.type === 'adjustment') {
        ctx.setTransform(sx, 0, 0, sy, rw * 0.5, rh * 0.5);
      } else {
        ctx.setTransform(wm[0] * sx, wm[1] * sy, wm[4] * sx, wm[5] * sy, wm[12] * sx, wm[13] * sy);
      }
      ctx.beginPath();
      for (const c of pd.contours) {
        const vs = c.vertices;
        if (vs.length < 2) continue;
        ctx.moveTo(vs[0].x, vs[0].y);
        const segN = c.closed ? vs.length : vs.length - 1;
        for (let i = 0; i < segN; i++) {
          const a = vs[i], b = vs[(i + 1) % vs.length];
          ctx.bezierCurveTo(a.x + a.outX, a.y + a.outY, b.x + b.inX, b.y + b.inY, b.x, b.y);
        }
        if (c.closed) ctx.closePath();
      }
      if (m.inverted) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.fill('evenodd');
      } else {
        ctx.fillStyle = `rgba(255,255,255,${mOp})`;
        ctx.fill('evenodd');
      }
      ctx.restore();

      let thisMaskRT = this.acquireRT(rw, rh, { hdr: false });
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.maskCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, thisMaskRT.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.disable(gl.BLEND);
      gl.useProgram(this.accumProg);
      gl.uniform1i(gl.getUniformLocation(this.accumProg, 'uTex'), 0);
      gl.uniform1f(gl.getUniformLocation(this.accumProg, 'uWeight'), 1.0);
      this.drawFullscreenQuad();

      if (feather > 0.3) {
        const blurred = this.runGaussianBlur(thisMaskRT, feather);
        this.releaseRT(thisMaskRT);
        thisMaskRT = blurred;
      }

      if (firstMask) {
        this.releaseRT(combinedMaskRT);
        combinedMaskRT = thisMaskRT;
        firstMask = false;
      } else {
        const nextCombined = this.combineMaskRTs(combinedMaskRT, thisMaskRT, m.mode);
        this.releaseRT(combinedMaskRT);
        this.releaseRT(thisMaskRT);
        combinedMaskRT = nextCombined;
      }
    }

    const out = this.applyMaskTexture(srcRT, combinedMaskRT.colorTex, 0);
    this.releaseRT(combinedMaskRT);
    this.releaseRT(srcRT);
    return out;
  }

  private combineMaskRTs(dst: RenderTarget, src: RenderTarget, mode: MaskItem['mode']): RenderTarget {
    if (mode === 'add') return this.compositeBlend(dst, src, 'add', 1.0);
    if (mode === 'intersect') return this.applyMaskTexture(dst, src.colorTex, 0);
    // subtract
    return this.applyMaskTexture(dst, src.colorTex, 1);
  }

  private applyMaskTexture(src: RenderTarget, maskTex: WebGLTexture, modeIdx: number): RenderTarget {
    const gl = this.gl;
    const out = this.acquireRT(src.width, src.height, { hdr: src.hdr });
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, src.width, src.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.maskApplyProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.colorTex);
    gl.uniform1i(gl.getUniformLocation(this.maskApplyProg, 'uSrc'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(gl.getUniformLocation(this.maskApplyProg, 'uMask'), 1);
    gl.uniform1i(gl.getUniformLocation(this.maskApplyProg, 'uMode'), modeIdx);
    this.drawFullscreenQuad();
    return out;
  }

  // ==========================================================================
  // Ordered Layer Effect Stack (Gaussian Blur, Glow, Drop Shadow, HSL!) (2.9)
  // ==========================================================================
  private applyEffectsStack(
    comp: Composition,
    layer: Layer,
    inputRT: RenderTarget,
    time: number,
    ec: EvalContext,
    rw: number,
    rh: number,
    preserveInput: boolean
  ): RenderTarget {
    const gl = this.gl;
    const scale = rw / comp.width;
    let cur = inputRT;
    let ownsCur = !preserveInput;

    for (const fx of layer.effects) {
      if (!fx.enabled) continue;
      let next: RenderTarget | null = null;

      if (fx.type === 'gaussianBlur' && fx.blurRadius) {
        const rad = Math.max(0, (ec.evaluateProp(layer, fx.blurRadius, `fx.${fx.id}.blurRadius`, time) as number) * scale);
        next = this.runGaussianBlur(cur, rad);
      } else if (fx.type === 'glow') {
        const thresh = fx.glowThreshold ? (ec.evaluateProp(layer, fx.glowThreshold, `fx.${fx.id}.glowThreshold`, time) as number) : 0.45;
        const rad = (fx.glowRadius ? (ec.evaluateProp(layer, fx.glowRadius, `fx.${fx.id}.glowRadius`, time) as number) : 20) * scale;
        const inten = fx.glowIntensity ? (ec.evaluateProp(layer, fx.glowIntensity, `fx.${fx.id}.glowIntensity`, time) as number) : 1.2;
        const col = fx.glowColor ? (ec.evaluateProp(layer, fx.glowColor, `fx.${fx.id}.glowColor`, time) as ColorRGBA) : ([1, 0.85, 0.5, 1] as ColorRGBA);

        const ext = this.acquireRT(rw, rh, { hdr: true });
        gl.bindFramebuffer(gl.FRAMEBUFFER, ext.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.disable(gl.BLEND);
        gl.useProgram(this.glowExtractProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.glowExtractProg, 'uTex'), 0);
        gl.uniform1f(gl.getUniformLocation(this.glowExtractProg, 'uThreshold'), thresh);
        gl.uniform3f(gl.getUniformLocation(this.glowExtractProg, 'uGlowColor'), Math.pow(col[0], 2.2), Math.pow(col[1], 2.2), Math.pow(col[2], 2.2));
        this.drawFullscreenQuad();

        const b1 = this.runGaussianBlur(ext, rad);
        this.releaseRT(ext);
        const b2 = this.runGaussianBlur(b1, rad * 0.55);
        this.releaseRT(b1);

        next = this.acquireRT(rw, rh, { hdr: true });
        gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.useProgram(this.glowCombineProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.glowCombineProg, 'uSrc'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b2.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.glowCombineProg, 'uBloom'), 1);
        gl.uniform1f(gl.getUniformLocation(this.glowCombineProg, 'uIntensity'), inten);
        this.drawFullscreenQuad();
        this.releaseRT(b2);
      } else if (fx.type === 'dropShadow') {
        const col = fx.shadowColor ? (ec.evaluateProp(layer, fx.shadowColor, `fx.${fx.id}.shadowColor`, time) as ColorRGBA) : ([0, 0, 0, 1] as ColorRGBA);
        const op = clamp((fx.shadowOpacity ? (ec.evaluateProp(layer, fx.shadowOpacity, `fx.${fx.id}.shadowOpacity`, time) as number) : 70) / 100, 0, 1);
        const ang = (fx.shadowAngle ? (ec.evaluateProp(layer, fx.shadowAngle, `fx.${fx.id}.shadowAngle`, time) as number) : 135) * DEG2RAD;
        const dist = (fx.shadowDistance ? (ec.evaluateProp(layer, fx.shadowDistance, `fx.${fx.id}.shadowDistance`, time) as number) : 16) * scale;
        const blur = (fx.shadowBlur ? (ec.evaluateProp(layer, fx.shadowBlur, `fx.${fx.id}.shadowBlur`, time) as number) : 18) * scale;

        const offX = (Math.cos(ang) * dist) / rw;
        const offY = (-Math.sin(ang) * dist) / rh; // UV +Y is up

        const rawSh = this.acquireRT(rw, rh, { hdr: true });
        gl.bindFramebuffer(gl.FRAMEBUFFER, rawSh.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.disable(gl.BLEND);
        gl.useProgram(this.dropShadowExtractProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.dropShadowExtractProg, 'uTex'), 0);
        gl.uniform2f(gl.getUniformLocation(this.dropShadowExtractProg, 'uOffsetUv'), offX, offY);
        gl.uniform3f(gl.getUniformLocation(this.dropShadowExtractProg, 'uColor'), Math.pow(col[0], 2.2), Math.pow(col[1], 2.2), Math.pow(col[2], 2.2));
        gl.uniform1f(gl.getUniformLocation(this.dropShadowExtractProg, 'uOpacity'), op);
        this.drawFullscreenQuad();

        const softSh = this.runGaussianBlur(rawSh, blur);
        this.releaseRT(rawSh);

        next = this.acquireRT(rw, rh, { hdr: true });
        gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.useProgram(this.dropShadowCombineProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.dropShadowCombineProg, 'uSrc'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, softSh.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.dropShadowCombineProg, 'uShadow'), 1);
        this.drawFullscreenQuad();
        this.releaseRT(softSh);
      } else if (fx.type === 'hsl') {
        const hue = (fx.hue ? (ec.evaluateProp(layer, fx.hue, `fx.${fx.id}.hue`, time) as number) : 0) / 360;
        const sat = (fx.saturation ? (ec.evaluateProp(layer, fx.saturation, `fx.${fx.id}.saturation`, time) as number) : 0) / 100;
        const light = (fx.lightness ? (ec.evaluateProp(layer, fx.lightness, `fx.${fx.id}.lightness`, time) as number) : 0) / 100;

        next = this.acquireRT(rw, rh, { hdr: true });
        gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
        gl.viewport(0, 0, rw, rh);
        gl.disable(gl.BLEND);
        gl.useProgram(this.hslProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
        gl.uniform1i(gl.getUniformLocation(this.hslProg, 'uTex'), 0);
        gl.uniform1f(gl.getUniformLocation(this.hslProg, 'uHue'), hue);
        gl.uniform1f(gl.getUniformLocation(this.hslProg, 'uSat'), sat);
        gl.uniform1f(gl.getUniformLocation(this.hslProg, 'uLight'), light);
        this.drawFullscreenQuad();
      }

      if (next) {
        if (ownsCur) this.releaseRT(cur);
        cur = next;
        ownsCur = true;
      }
    }

    if (!ownsCur) {
      // Copy inputRT so caller always owns returned RT
      const copy = this.acquireRT(rw, rh, { hdr: cur.hdr });
      gl.bindFramebuffer(gl.FRAMEBUFFER, copy.fbo);
      gl.viewport(0, 0, rw, rh);
      gl.useProgram(this.accumProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.colorTex);
      gl.uniform1i(gl.getUniformLocation(this.accumProg, 'uTex'), 0);
      gl.uniform1f(gl.getUniformLocation(this.accumProg, 'uWeight'), 1.0);
      this.drawFullscreenQuad();
      return copy;
    }
    return cur;
  }

  private runGaussianBlur(src: RenderTarget, radius: number): RenderTarget {
    const gl = this.gl;
    const w = src.width, h = src.height;
    const tmp = this.acquireRT(w, h, { hdr: src.hdr });
    const out = this.acquireRT(w, h, { hdr: src.hdr });

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blurProg);
    gl.uniform1f(gl.getUniformLocation(this.blurProg, 'uRadius'), radius);

    // Horizontal
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fbo);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.colorTex);
    gl.uniform1i(gl.getUniformLocation(this.blurProg, 'uTex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurProg, 'uDir'), 1 / w, 0);
    this.drawFullscreenQuad();

    // Vertical
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tmp.colorTex);
    gl.uniform2f(gl.getUniformLocation(this.blurProg, 'uDir'), 0, 1 / h);
    this.drawFullscreenQuad();

    this.releaseRT(tmp);
    return out;
  }

  private compositeBlend(dst: RenderTarget, src: RenderTarget, mode: BlendMode, opacity: number): RenderTarget {
    const gl = this.gl;
    const out = this.acquireRT(dst.width, dst.height, { hdr: dst.hdr });
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, dst.width, dst.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blendProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.colorTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, 'uDst'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.colorTex);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, 'uSrc'), 1);
    gl.uniform1i(gl.getUniformLocation(this.blendProg, 'uMode'), BLEND_MODE_IDX[mode] ?? 0);
    gl.uniform1f(gl.getUniformLocation(this.blendProg, 'uOpacity'), clamp(opacity, 0, 1));
    this.drawFullscreenQuad();
    return out;
  }

  private clearRT(rt: RenderTarget, rgba: ColorRGBA): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.viewport(0, 0, rt.width, rt.height);
    gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private drawFullscreenQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    // Unbind texture units cleanly to prevent any FBO-pool feedback loops!
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
