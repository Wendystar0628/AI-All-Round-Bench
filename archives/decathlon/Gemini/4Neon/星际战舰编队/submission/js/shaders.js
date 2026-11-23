// js/shaders.js - GLSL ES 3.00 Shaders:
// Cosmic Skybox & Ringed Planet, Master Voxel PBR+AO+MicroBevel+DynamicLights,
// Volumetric Beams/Plumes/Bolts/Explosions, Missile Trails, Lamellar Fleet Shields, HDR Dual-Kawase Bloom + ACES.
window.App = window.App || {};

(function (App) {
  const S = {};

  // =========================================================================
  // 1. COSMIC SKYBOX, MULTI-LAYER STARFIELD, DUAL-TONE NEBULA & RINGED PLANET
  // =========================================================================
  S.SKY_VS = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main() {
    vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
    vUv = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.9999, 1.0);
  }`;

  S.SKY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform mat4 uInvViewProj;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform float uTime;

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0,0,0));
    float n100 = hash13(i + vec3(1,0,0));
    float n010 = hash13(i + vec3(0,1,0));
    float n110 = hash13(i + vec3(1,1,0));
    float n001 = hash13(i + vec3(0,0,1));
    float n101 = hash13(i + vec3(1,0,1));
    float n011 = hash13(i + vec3(0,1,1));
    float n111 = hash13(i + vec3(1,1,1));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    mat3 rot = mat3(0.80, 0.60, 0.0, -0.60, 0.80, 0.0, 0.0, 0.0, 1.0);
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = rot * p * 2.04 + vec3(13.1, 7.7, 5.3);
      a *= 0.5;
    }
    return v;
  }

  // Smooth, shimmer-free star layer on spherical cells
  vec3 starLayer(vec3 dir, float scale, float density, float brightness) {
    vec3 p = dir * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id);
    if (h < density) return vec3(0.0);
    vec3 jitter = vec3(hash13(id + 11.3), hash13(id + 27.9), hash13(id + 51.7)) - 0.5;
    float d = length(f - jitter * 0.62);
    float size = mix(0.035, 0.105, fract(h * 19.7));
    float core = smoothstep(size, 0.0, d);
    core = core * core;
    float temp = fract(h * 73.1);
    vec3 tint = mix(vec3(0.68, 0.84, 1.0), vec3(1.0, 0.84, 0.65), temp);
    return tint * core * brightness * (0.45 + 0.55 * fract(h * 131.3));
  }

  void main() {
    vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec4 wp = uInvViewProj * ndc;
    vec3 dir = normalize(wp.xyz / wp.w - uCamPos);
    vec3 sunDir = normalize(uSunDir);

    // Deep cosmic background gradient
    vec3 col = vec3(0.008, 0.014, 0.028);

    // Galactic plane tilted diagonally across the sky
    float galBand = exp(-pow(dot(dir, normalize(vec3(-0.32, 0.84, 0.43))) * 3.1, 2.0));
    vec3 q = dir * 2.6;
    float n1 = fbm(q + vec3(0.0, 1.2, 2.1));
    float n2 = fbm(q * 2.1 + vec3(n1 * 1.4, -n1 * 0.9, 3.3));
    float darkLane = smoothstep(0.42, 0.68, fbm(dir * 4.5 + vec3(4.1, 2.2, 8.7)));

    // Cool oceanic teal & midnight sapphire nebula clouds
    vec3 nebCool = mix(vec3(0.02, 0.06, 0.14), vec3(0.06, 0.22, 0.36), smoothstep(0.35, 0.78, n2));
    col += nebCool * galBand * (0.65 + 0.65 * n1) * (1.0 - darkLane * 0.68);

    // Warm golden-amber sunlit nebula rim on key-light hemisphere
    float sunAlign = max(0.0, dot(dir, sunDir));
    float warmMask = smoothstep(0.46, 0.80, n2) * galBand * pow(sunAlign, 1.3);
    col += vec3(0.42, 0.20, 0.09) * warmMask * (1.0 - darkLane * 0.55);

    // Subtle deep cyan cosmic dust veil opposite the sun
    float antiAlign = max(0.0, dot(dir, -sunDir));
    col += vec3(0.02, 0.08, 0.16) * smoothstep(0.40, 0.78, n1) * (0.25 + 0.35 * antiAlign);

    // Multi-scale crisp starfields
    col += starLayer(dir, 95.0,  0.965, 1.45);
    col += starLayer(dir, 175.0, 0.945, 0.85);
    col += starLayer(dir, 310.0, 0.915, 0.42) * (0.45 + 0.75 * galBand);

    // --- COLOSSAL DISTANT RINGED GAS-GIANT CELESTIAL BODY (provides monumental backdrop arc!) ---
    vec3 planetDir = normalize(vec3(0.54, 0.20, 0.81));
    float planetAngR = 0.245; // Sweeping monumental crescent horizon!
    float cosP = dot(dir, planetDir);
    float sinP = sqrt(max(0.0, 1.0 - cosP * cosP));
    float planetMask = 0.0;

    // Planetary rings plane intersection
    vec3 ringNormal = normalize(vec3(-0.34, 0.88, 0.33));
    float denom = dot(dir, ringNormal);
    float ringAlpha = 0.0;
    vec3 ringColor = vec3(0.0);
    if (abs(denom) > 0.005) {
      float tRing = dot(planetDir * 1.0, ringNormal) / denom;
      if (tRing > 0.0) {
        vec3 hit = dir * tRing - planetDir;
        float rDist = length(hit);
        if (rDist > planetAngR * 1.24 && rDist < planetAngR * 2.32) {
          float rf = (rDist - planetAngR * 1.24) / (planetAngR * 1.08);
          float bands = 0.55 + 0.45 * sin(rf * 48.0) * sin(rf * 17.0 + 1.1);
          float cassini = 1.0 - smoothstep(0.02, 0.055, abs(rf - 0.62));
          float edgeFade = smoothstep(0.0, 0.08, rf) * smoothstep(1.0, 0.88, rf);
          // Planet shadow cast across back side of rings
          float shadow = smoothstep(-0.08, 0.14, dot(normalize(hit), sunDir));
          ringAlpha = edgeFade * (0.28 + 0.42 * bands) * (1.0 - cassini * 0.85) * (0.15 + 0.85 * shadow);
          ringColor = mix(vec3(0.32, 0.48, 0.62), vec3(0.95, 0.78, 0.54), 0.5 + 0.5 * bands) * (0.55 + 0.65 * shadow);
        }
      }
    }

    bool ringInFront = false;
    if (abs(denom) > 0.005) {
      float tRing = dot(planetDir, ringNormal) / denom;
      ringInFront = (tRing > 0.0 && tRing < 1.0);
    }

    // Back half of ring behind planet
    if (ringAlpha > 0.001 && !ringInFront) {
      col = mix(col, ringColor, ringAlpha * 0.75);
    }

    if (cosP > 0.0 && sinP < planetAngR * 1.14) {
      float rNorm = sinP / planetAngR;
      if (rNorm < 1.0) {
        planetMask = smoothstep(1.0, 0.992, rNorm);
        // Reconstruct sphere normal in planet frame
        vec3 pRight = normalize(cross(vec3(0.0, 1.0, 0.0), planetDir));
        vec3 pUp = cross(planetDir, pRight);
        vec2 pXY = vec2(dot(dir, pRight), dot(dir, pUp)) / planetAngR;
        float pz = sqrt(max(0.0, 1.0 - dot(pXY, pXY)));
        vec3 pNorm = normalize(pRight * pXY.x + pUp * pXY.y - planetDir * pz);

        float ndl = dot(pNorm, sunDir);
        float lat = pXY.y * 5.2 + fbm(pNorm * 4.2) * 0.65;
        float bandPattern = 0.5 + 0.5 * sin(lat * 3.8);
        vec3 surfCol = mix(vec3(0.09, 0.16, 0.25), vec3(0.45, 0.36, 0.30), bandPattern);
        surfCol = mix(surfCol, vec3(0.75, 0.62, 0.48), smoothstep(0.65, 0.95, bandPattern));

        float lit = smoothstep(-0.18, 0.55, ndl);
        float limb = pow(1.0 - pz, 3.2);
        vec3 atmoRim = mix(vec3(0.18, 0.58, 0.95), vec3(1.0, 0.76, 0.42), smoothstep(-0.1, 0.6, ndl));
        vec3 pCol = surfCol * (0.025 + 0.92 * lit) + atmoRim * limb * (0.14 + 1.15 * max(0.0, ndl + 0.22));
        col = mix(col, pCol, planetMask);
      }
      // Outer thin atmospheric halo crescent
      float halo = exp(-max(0.0, rNorm - 0.98) * 18.0) * smoothstep(0.92, 1.0, rNorm);
      float haloLit = smoothstep(-0.2, 0.65, dot(normalize(dir - planetDir * cosP), sunDir));
      col += mix(vec3(0.16, 0.58, 0.98), vec3(1.0, 0.72, 0.38), haloLit) * halo * (0.15 + 0.75 * haloLit);
    }

    // Front half of ring in front of planet
    if (ringAlpha > 0.001 && ringInFront) {
      col = mix(col, ringColor, ringAlpha * 0.85);
    }

    // --- RADIANT KEY-LIGHT STAR / CORONA ---
    float sunCore = smoothstep(0.9992, 0.99992, sunAlign);
    float sunGlow = pow(sunAlign, 18.0) * 0.38 + pow(sunAlign, 140.0) * 1.15;
    col += vec3(1.0, 0.84, 0.60) * sunGlow + vec3(2.8, 2.5, 2.1) * sunCore;

    fragColor = vec4(col, 1.0);
  }`;

  // =========================================================================
  // 2. MASTER VOXEL PBR + BAKED AO + ANTI-ALIASED MICRO-BEVEL + DYNAMIC LIGHTS
  // =========================================================================
  S.VOXEL_VS = `#version 300 es
  precision highp float;

  layout(location = 0) in vec3 aPos;
  layout(location = 1) in float aNormalIdx;
  layout(location = 2) in float aMatId;
  layout(location = 3) in float aAO;

  // Optional instancing transform (when uInstanced > 0.5, attributes 4..7 hold instance mat4!)
  layout(location = 4) in vec4 aInstCol0;
  layout(location = 5) in vec4 aInstCol1;
  layout(location = 6) in vec4 aInstCol2;
  layout(location = 7) in vec4 aInstCol3;

  uniform mat4 uViewProj;
  uniform mat4 uModel;
  uniform float uInstanced;

  out vec3 vWorldPos;
  out vec3 vWorldNormal;
  out vec3 vVoxelPos;
  out float vAO;
  flat out int vMatId;
  flat out int vNormalIdx;

  const vec3 NORMALS[6] = vec3[6](
    vec3( 1.0,  0.0,  0.0),
    vec3(-1.0,  0.0,  0.0),
    vec3( 0.0,  1.0,  0.0),
    vec3( 0.0, -1.0,  0.0),
    vec3( 0.0,  0.0,  1.0),
    vec3( 0.0,  0.0, -1.0)
  );

  void main() {
    mat4 M = (uInstanced > 0.5)
      ? mat4(aInstCol0, aInstCol1, aInstCol2, aInstCol3)
      : uModel;

    int ni = int(aNormalIdx + 0.5);
    vec3 localN = NORMALS[clamp(ni, 0, 5)];
    vec4 wp = M * vec4(aPos, 1.0);

    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(M) * localN);
    vVoxelPos = aPos;
    vAO = aAO;
    vMatId = int(aMatId + 0.5);
    vNormalIdx = ni;

    gl_Position = uViewProj * wp;
  }`;

  S.VOXEL_FS = `#version 300 es
  precision highp float;

  in vec3 vWorldPos;
  in vec3 vWorldNormal;
  in vec3 vVoxelPos;
  in float vAO;
  flat in int vMatId;
  flat in int vNormalIdx;

  out vec4 fragColor;

  uniform vec4 uMatColorAlpha[32];
  uniform vec4 uMatPBR[32]; // x=rough, y=metal, z=emit, w=flags

  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbientSky;
  uniform vec3 uAmbientGround;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  // Dynamic event / interior lighting (up to 16 lights!)
  uniform int uNumLights;
  uniform vec4 uLightPosRad[16];  // xyz = pos, w = radius
  uniform vec4 uLightColor[16];   // rgb = HDR color, w = unused

  // Special per-object animation uniforms
  uniform float uChargeProgress;  // 0..1 progressive main cannon slot ignition
  uniform float uHeat;            // 0..1 asteroid fracture molten glow
  uniform float uPulse;           // Power core breathing & thruster core modulation
  uniform float uShieldRim;       // 0..1 cyan hull rim reflection during shield activation
  uniform float uInteriorMode;    // 0 = exterior space lighting, 1 = interior atmospheric lighting
  uniform float uClipZMin;        // Optional object-space Z clip (e.g. hide aft citadel during live Bridge view)
  uniform float uTime;            // Global deterministic time for interior energy waves & holo shimmer
  uniform int uFlowMode;          // 0=none, 1=Power Core radial/axial wave, 2=Conduit Corridor axial wave, 3=Bridge holo scanlines

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // GGX specular helper
  float D_GGX(float ndh, float rough) {
    float a = rough * rough;
    float a2 = a * a;
    float d = ndh * ndh * (a2 - 1.0) + 1.0;
    return a2 / max(3.14159265 * d * d, 0.0001);
  }

  void main() {
    if (vVoxelPos.z < uClipZMin) discard;
    int mid = clamp(vMatId, 0, 31);
    vec4 ca = uMatColorAlpha[mid];
    vec4 pbr = uMatPBR[mid];

    vec3 albedo = ca.rgb;
    float alpha = ca.a;
    float rough = clamp(pbr.x, 0.08, 0.98);
    float metal = clamp(pbr.y, 0.0, 1.0);
    float emitStr = pbr.z;
    int flags = int(pbr.w + 0.5);

    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing && (flags & 1) != 0) N = -N;
    vec3 V = normalize(uCamPos - vWorldPos);
    float ndv = max(dot(N, V), 0.001);

    // --- ANTI-ALIASED 1-VOXEL MICRO-BEVEL & SUBTLE BLOCK IDENTITY ---
    // Computes exact integer voxel cell & edge distance, smoothly faded via fwidth so far hulls never shimmer!
    vec3 faceN = abs(vec3(
      vNormalIdx <= 1 ? 1.0 : 0.0,
      (vNormalIdx == 2 || vNormalIdx == 3) ? 1.0 : 0.0,
      vNormalIdx >= 4 ? 1.0 : 0.0
    ));
    vec3 cellCoord = floor(vVoxelPos - faceN * 0.002);
    vec3 fw = fwidth(vVoxelPos);
    float maxFw = max(max(fw.x * (1.0 - faceN.x), fw.y * (1.0 - faceN.y)), fw.z * (1.0 - faceN.z));
    // Fade micro-voxel detail smoothly out when a voxel is < ~2.5 pixels across
    float voxelDetailFade = 1.0 - smoothstep(0.18, 0.65, maxFw);

    if (voxelDetailFade > 0.005) {
      // Subtle per-voxel ceramic/rock tonal micro-variation (±3.5%)
      float h = hash31(cellCoord) - 0.5;
      albedo *= (1.0 + h * 0.075 * voxelDetailFade);

      // Crisp subtle micro-chamfer edge shade right on 1-unit voxel boundaries
      vec3 fracP = fract(vVoxelPos);
      vec3 edgeD = min(fracP, 1.0 - fracP) + faceN; // ignore normal axis
      float minEdge = min(edgeD.x, min(edgeD.y, edgeD.z));
      float seam = smoothstep(0.0, 0.075, minEdge);
      // Tiny dark groove right at block seam + tiny bright bevel catch next to seam
      albedo *= mix(0.91, 1.0, mix(1.0, seam, voxelDetailFade * 0.72));
    }

    // Baked Voxel Ambient Occlusion (smooth sculptural contact shadows in every trench & step!)
    float ao = mix(0.32, 1.0, pow(clamp(vAO, 0.0, 1.0), 0.85));

    // --- BASE KEY LIGHT & HEMISPHERE ENVIRONMENT LIGHTING ---
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    // Soft wrap diffuse for sculptural ceramic readability
    float wrapNdl = clamp((dot(N, L) + 0.16) / 1.16, 0.0, 1.0);
    float ndh = max(dot(N, H), 0.0);
    float vdh = max(dot(V, H), 0.0);

    vec3 F0 = mix(vec3(0.045), albedo, metal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - vdh, 5.0);
    float D = D_GGX(ndh, rough);
    vec3 kD = (1.0 - F) * (1.0 - metal);

    // Key sun direct illumination
    float keyScale = (uInteriorMode > 0.5) ? 0.24 : 1.0;
    vec3 spec = (D * F) * 0.34 * ndl;
    vec3 direct = (kD * albedo * wrapNdl * 0.92 + spec) * uSunColor * keyScale;

    // Hemisphere ambient fill (cool nebula cerulean on shadow face + deep indigo ventral bounce)
    // Dielectrics receive soft hemisphere diffuse; metals receive crisp dual-tone space IBL specular reflection!
    float hemi = N.y * 0.5 + 0.5;
    vec3 ambCol = mix(uAmbientGround, uAmbientSky, hemi);
    vec3 rimDir = normalize(-uSunDir + vec3(0.0, 0.35, 0.15));
    float rimDiff = max(dot(N, rimDir), 0.0) * (1.0 - uInteriorMode * 0.6);
    float fresnelRim = pow(1.0 - ndv, 3.2);
    // Diffuse ambient scaled cleanly by (1 - metal * 0.82) so gold/steel never muddies into olive in blue shadow!
    vec3 ambient = albedo * (1.0 - metal * 0.82) * (ambCol * 1.12 + vec3(0.10, 0.24, 0.42) * rimDiff * 0.42) * ao;

    // Dual-tone space/interior environment reflection along R = reflect(-V, N)
    vec3 R = reflect(-V, N);
    float envHemi = R.y * 0.5 + 0.5;
    vec3 envSky = mix(vec3(0.14, 0.18, 0.26), vec3(0.42, 0.52, 0.64), envHemi);
    // Warm starlight & planetary-ring horizon reflection band gives burnished gold & steel lustrous gleam even on shadow side!
    float horizBand = exp(-abs(R.y) * 2.6);
    float sunLobe = pow(max(dot(R, L), 0.0), mix(14.0, 2.5, rough));
    vec3 envCol = envSky * (uInteriorMode > 0.5 ? 0.62 : 0.72)
      + vec3(0.62, 0.52, 0.38) * horizBand * (uInteriorMode > 0.5 ? 0.35 : 0.52)
      + vec3(1.15, 0.96, 0.70) * sunLobe * (uInteriorMode > 0.5 ? 0.25 : 0.85);
    vec3 F_env = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - ndv, 4.0);
    ambient += F_env * envCol * mix(0.28, 1.05, metal) * (1.0 - rough * 0.65) * ao;

    // --- DYNAMIC EVENT & INTERIOR POINT LIGHTS ---
    vec3 dynLight = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      if (i >= uNumLights) break;
      vec3 lp = uLightPosRad[i].xyz;
      float rad = uLightPosRad[i].w;
      vec3 toL = lp - vWorldPos;
      float d2 = dot(toL, toL);
      float r2 = rad * rad;
      if (d2 >= r2) continue;
      float dist = sqrt(d2);
      vec3 ld = toL / max(dist, 0.001);
      float att = pow(clamp(1.0 - dist / rad, 0.0, 1.0), 1.85);
      float lndl = max(dot(N, ld), 0.0);
      float lWrap = clamp((dot(N, ld) + 0.22) / 1.22, 0.0, 1.0);
      vec3 lh = normalize(ld + V);
      float lSpec = D_GGX(max(dot(N, lh), 0.0), max(rough, 0.16)) * 0.28 * lndl;
      vec3 lc = uLightColor[i].rgb;
      dynLight += (kD * albedo * lWrap + F0 * lSpec) * lc * att;
    }

    // --- SHIELD ACTIVATION SOFT RIM REFLECTION ON HULL ARMOR ---
    if (uShieldRim > 0.005) {
      dynLight += vec3(0.08, 0.55, 0.88) * (0.10 + 0.48 * fresnelRim) * uShieldRim * (0.4 + 0.6 * ao);
    }

    // --- EMISSIVE & SPECIAL DYNAMIC MATERIALS ---
    vec3 emissive = vec3(0.0);
    if ((flags & 2) != 0) {
      // Flagship Main Cannon Sequential Charge Slots (z = +235 .. +475)
      float slotNorm = clamp((vVoxelPos.z - 230.0) / 245.0, 0.0, 1.0);
      float lit = smoothstep(slotNorm - 0.10, slotNorm + 0.04, uChargeProgress);
      float wave = smoothstep(0.16, 0.0, abs(uChargeProgress - slotNorm));
      float boost = 0.25 + lit * 2.1 + wave * 1.9;
      vec3 colC = mix(vec3(0.08, 0.62, 1.0), vec3(0.55, 0.95, 1.0), clamp(lit * 0.55 + wave * 0.6, 0.0, 1.0));
      emissive = colC * boost;
    } else if ((flags & 4) != 0) {
      // Asteroid Inner Cleavage / Fracture Plane -> Structured Volcanic Magma Cracks & Glowing Voxel Seams!
      if (uHeat > 0.005) {
        float c1 = hash31(floor(vVoxelPos * 0.45));
        float c2 = hash31(floor(vVoxelPos * 0.16));
        // Keep darker cooled basalt veins contrasting against blazing magma channels so voxel steps stay ultra-readable!
        float vein = smoothstep(0.24, 0.82, c1 * 0.55 + c2 * 0.45);
        float hGlow = uHeat * (0.28 + 0.95 * vein);
        vec3 molten = mix(vec3(0.85, 0.14, 0.02), vec3(2.35, 0.88, 0.14), clamp(hGlow, 0.0, 1.0));
        molten = mix(molten, vec3(2.8, 1.75, 0.65), smoothstep(0.85, 1.25, hGlow));
        emissive = molten * clamp(hGlow, 0.0, 1.25);
      }
    } else if (emitStr > 0.001) {
      float modP = ((flags & 8) != 0) ? uPulse : 1.0;
      if (uFlowMode == 1) {
        // Power Core Atrium: energy converges/diverges along vertical core veins & surges radially outward along pylons!
        float rad = length(vVoxelPos.xz);
        if (rad < 26.0) {
          float axialWave = 0.65 + 0.55 * sin(abs(vVoxelPos.y) * 0.14 - uTime * 4.2);
          float swirl = 0.85 + 0.25 * sin(atan(vVoxelPos.z, vVoxelPos.x) * 6.0 + vVoxelPos.y * 0.08 + uTime * 2.2);
          modP *= axialWave * swirl;
        } else {
          // Outward streaming luminous pulse waves along diagonal trusses & outer tier conduits!
          float outWave = 0.55 + 0.85 * pow(0.5 + 0.5 * sin(rad * 0.11 - uTime * 4.6), 3.0);
          modP *= outWave;
        }
      } else if (uFlowMode == 2) {
        // Energy Conduit Corridor: rapid longitudinal energy currents racing continuously forward toward discharge chamber!
        float zWave = 0.58 + 0.90 * pow(0.5 + 0.5 * sin(vVoxelPos.z * 0.085 - uTime * 8.2), 3.0);
        modP *= zWave;
      } else if (uFlowMode == 3 && (flags & 1) != 0) {
        // Command Bridge: subtle crisp holographic data scanlines drifting across floating displays & fleet map!
        float scan = 0.86 + 0.22 * sin(vVoxelPos.y * 3.8 - uTime * 5.5) * cos(vVoxelPos.x * 1.4 + uTime * 2.0);
        modP *= scan;
      }
      emissive = albedo * emitStr * modP;
    }

    vec3 color = direct + ambient + dynLight + emissive;

    // --- TRANSLUCENT 1-VOXEL GLASS / HOLOGRAM FRESNEL ENHANCEMENT ---
    if ((flags & 1) != 0) {
      float glassFres = pow(1.0 - ndv, 2.5);
      color += vec3(0.32, 0.78, 1.0) * glassFres * 0.55;
      alpha = clamp(alpha + glassFres * 0.32, 0.12, 0.88);
    }

    // --- SUBTLE AERIAL PERSPECTIVE / ATMOSPHERIC DEPTH HAZE ---
    if (uFogDensity > 0.000001) {
      float camDist = length(vWorldPos - uCamPos);
      float fogF = 1.0 - exp(-camDist * uFogDensity);
      color = mix(color, uFogColor, clamp(fogF, 0.0, 0.82));
    }

    fragColor = vec4(color, alpha);
  }`;

  // =========================================================================
  // 3. VOLUMETRIC FX SHADER (Thruster Plumes, Spinal Beam, Pulse Bolts, CIWS, Shock Rings, Bursts)
  // =========================================================================
  S.FX_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec3 aNormal;
  layout(location = 2) in vec2 aUv;

  uniform mat4 uViewProj;
  uniform mat4 uModel;

  out vec2 vUv;
  out vec3 vWorldPos;
  out vec3 vWorldNormal;

  void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(uModel) * aNormal);
    vUv = aUv;
    gl_Position = uViewProj * wp;
  }`;

  S.FX_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in vec3 vWorldPos;
  in vec3 vWorldNormal;
  out vec4 fragColor;

  uniform vec3 uCamPos;
  uniform vec3 uColorA;   // Core color
  uniform vec3 uColorB;   // Outer glow color
  uniform float uIntensity;
  uniform float uTime;
  uniform int uMode;      // 0=plume, 1=beam, 2=bolt/tracer, 3=shockring, 4=explosion/burst, 5=dust/spark

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vWorldNormal);
    float facing = abs(dot(N, V));

    if (uMode == 0) {
      // --- THRUSTER PLUME CONE (vUv.y: 0=nozzle root -> 1=exhaust tip) ---
      float axial = vUv.y;
      float streaks = noise2(vec2(vUv.x * 14.0, axial * 5.0 - uTime * 9.5)) * 0.55
                    + noise2(vec2(vUv.x * 28.0 + 3.1, axial * 11.0 - uTime * 16.0)) * 0.45;
      float taper = pow(clamp(1.0 - axial, 0.0, 1.0), 1.45);
      float edgeSoft = pow(facing, 1.35);
      float hotRoot = exp(-axial * 5.5);
      vec3 col = mix(uColorB, uColorA, clamp(hotRoot * 1.15 + edgeSoft * 0.45, 0.0, 1.0));
      float alpha = taper * edgeSoft * (0.58 + 0.55 * streaks) * smoothstep(0.0, 0.04, axial);
      fragColor = vec4(col * uIntensity * (0.85 + hotRoot * 1.4), clamp(alpha, 0.0, 1.0));
      return;
    }

    if (uMode == 1) {
      // --- SPINAL MAIN BEAM (vUv.y: 0=muzzle -> 1=target) ---
      float edge = pow(facing, 1.65);
      float helix1 = sin(vUv.x * 25.1327 + vUv.y * 28.0 - uTime * 28.0) * 0.5 + 0.5;
      float helix2 = noise2(vec2(vUv.x * 16.0, vUv.y * 22.0 - uTime * 24.0));
      float endFade = smoothstep(0.0, 0.025, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
      float coreHot = pow(facing, 4.0);
      vec3 col = mix(uColorB, uColorA, clamp(coreHot * 1.1 + helix1 * 0.25, 0.0, 1.0));
      float alpha = edge * (0.62 + 0.45 * helix2 + 0.30 * helix1) * endFade;
      fragColor = vec4(col * uIntensity * (0.9 + coreHot * 1.5), clamp(alpha, 0.0, 1.0));
      return;
    }

    if (uMode == 2) {
      // --- PULSE BOLT / CIWS TRACER ---
      float endFade = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
      float core = pow(facing, 2.2);
      vec3 col = mix(uColorB, uColorA, pow(facing, 3.2));
      fragColor = vec4(col * uIntensity, clamp(core * endFade, 0.0, 1.0));
      return;
    }

    if (uMode == 3) {
      // --- EXPANDING ENERGY SHOCK-RING (crisp thin delicate plasma wave) ---
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float ang = atan(p.y, p.x);
      float ring = exp(-pow((r - 0.80) * 20.0, 2.0));
      float innerGlow = exp(-pow((r - 0.72) * 8.0, 2.0)) * 0.18;
      float rays = 0.72 + 0.28 * sin(ang * 16.0 + uTime * 7.0);
      float a = (ring * rays + innerGlow) * smoothstep(1.0, 0.88, r);
      vec3 col = mix(uColorB, uColorA, ring);
      fragColor = vec4(col * uIntensity * 0.78, clamp(a, 0.0, 0.85));
      return;
    }

    // --- MODE 4, 5 & 6: BILLBOARD VOLUMETRIC EXPLOSION / SPARK / ROCK DUST PUFF ---
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    if (uMode == 4) {
      float ang = atan(p.y, p.x);
      float n = noise2(vec2(cos(ang) * 2.4 + uTime * 1.2, sin(ang) * 2.4 - r * 3.0));
      float core = exp(-r * r * 11.0);
      float halo = pow(clamp(1.0 - r, 0.0, 1.0), 2.1) * (0.58 + 0.62 * n);
      float spike = exp(-abs(p.x) * 18.0) * exp(-r * 3.2) * 0.35 + exp(-abs(p.y) * 18.0) * exp(-r * 3.2) * 0.35;
      vec3 col = mix(uColorB, uColorA, clamp(core * 1.25 + spike, 0.0, 1.0));
      float alpha = clamp(core + halo * 0.85 + spike, 0.0, 1.0);
      fragColor = vec4(col * uIntensity, alpha);
    } else if (uMode == 6) {
      // Soft billowing sunlit/ember-lit asteroid impact dust puff (alpha-blended)
      float n = noise2(p * 2.8 + vec2(uTime * 0.35, -uTime * 0.25)) * 0.6 + noise2(p * 5.6 + 3.1) * 0.4;
      float soft = pow(clamp(1.0 - r, 0.0, 1.0), 1.65) * (0.45 + 0.75 * n);
      vec3 col = mix(uColorB, uColorA, clamp(soft * 1.2, 0.0, 1.0));
      fragColor = vec4(col, clamp(soft * uIntensity, 0.0, 0.62));
    } else {
      // Soft glowing dust / spark / thruster mote
      float glow = pow(clamp(1.0 - r, 0.0, 1.0), 2.4);
      vec3 col = mix(uColorB, uColorA, glow);
      fragColor = vec4(col * uIntensity, glow);
    }
  }`;

  // =========================================================================
  // 4. MISSILE CURVED SMOKE & EMBER TRAIL RIBBON SHADER
  // =========================================================================
  S.TRAIL_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;
  layout(location = 1) in vec2 aUv;   // x: 0..1 across width, y: 0=head(hot) -> 1=tail(dissipating)
  layout(location = 2) in float aAlpha;

  uniform mat4 uViewProj;
  out vec2 vUv;
  out float vAlpha;

  void main() {
    vUv = aUv;
    vAlpha = aAlpha;
    gl_Position = uViewProj * vec4(aPos, 1.0);
  }`;

  S.TRAIL_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  in float vAlpha;
  out vec4 fragColor;

  uniform float uTime;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),
               mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
  }

  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    float puff = noise2(vec2(vUv.y * 18.0 - uTime * 2.5, vUv.x * 4.0)) * 0.6
               + noise2(vec2(vUv.y * 36.0, vUv.x * 8.0 + 5.1)) * 0.4;
    float edge = smoothstep(1.0, 0.15 + puff * 0.35, across);
    // Softly feather BOTH ends of lingering post-impact ribbons while keeping blazing flame while missile is flying!
    float liveFlame = smoothstep(0.60, 0.86, vAlpha);
    float hotHead = exp(-vUv.y * 10.5) * liveFlame;
    float midAmber = exp(-vUv.y * 3.8) * (0.30 + 0.70 * liveFlame);
    vec3 smokeCol = mix(vec3(0.28, 0.36, 0.48), vec3(0.85, 0.56, 0.34), midAmber);
    vec3 col = mix(smokeCol, vec3(2.8, 1.9, 0.85), hotHead);
    float headFeather = mix(smoothstep(0.0, 0.14, vUv.y), smoothstep(0.0, 0.02, vUv.y), liveFlame);
    float a = edge * vAlpha * (0.48 + 0.52 * puff) * headFeather * smoothstep(1.0, 0.72, vUv.y);
    fragColor = vec4(col, clamp(a, 0.0, 0.92));
  }`;

  // =========================================================================
  // 5. LAMELLAR FLEET ENERGY SHIELD SHADER (Deploy Sweep, Hex-Lamellar Flow, Fresnel Transparency)
  // =========================================================================
  S.SHIELD_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 aPos;    // Unit sphere/ellipsoid local pos [-1..1]
  layout(location = 1) in vec3 aNormal;

  uniform mat4 uViewProj;
  uniform mat4 uModel;
  uniform float uExpand; // Slight outward expansion during activation (0.84 -> 1.0)

  out vec3 vLocalPos;
  out vec3 vWorldPos;
  out vec3 vWorldNormal;

  void main() {
    vec3 lp = aPos * uExpand;
    vec4 wp = uModel * vec4(lp, 1.0);
    vLocalPos = aPos;
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(uModel) * aNormal);
    gl_Position = uViewProj * wp;
  }`;

  S.SHIELD_FS = `#version 300 es
  precision highp float;
  in vec3 vLocalPos;
  in vec3 vWorldPos;
  in vec3 vWorldNormal;
  out vec4 fragColor;

  uniform vec3 uCamPos;
  uniform float uTime;
  uniform float uDeploy;    // 0 -> 1 bow-to-stern deployment progress
  uniform float uAlpha;     // Overall shield opacity (allows smooth fading at loop start!)
  uniform float uGridScale; // Finer lamellar grid on colossal Flagship, bolder on Escorts!

  // Stepped hexagonal/lamellar distance field echoing the fleet's geometric language
  float hexEdge(vec2 p) {
    p.x *= 1.1547;
    vec2 r = vec2(1.0, 1.73205);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
    float d = max(abs(gv.x), dot(abs(gv), normalize(r)));
    return smoothstep(0.42, 0.495, d);
  }

  void main() {
    if (uAlpha <= 0.002 || uDeploy <= 0.002) discard;

    // Bow-to-stern coordinate zNorm: 0 at bow (+Z), 1 at stern (-Z)
    float zNorm = clamp((1.0 - vLocalPos.z) * 0.5, 0.0, 1.0);
    float phi = atan(vLocalPos.y, vLocalPos.x);

    // Triplanar-blended lamellar hex coordinates (zero polar pinch at bow & stern tips!)
    vec2 cylUv = vec2(phi * 1.55, vLocalPos.z * 2.5) * uGridScale;
    vec2 capUv = vLocalPos.xy * 3.2 * uGridScale;
    float poleBlend = smoothstep(0.62, 0.90, abs(vLocalPos.z));
    float hexCyl = hexEdge(cylUv + vec2(0.0, -uTime * 0.35));
    float hexCap = hexEdge(capUv + vec2(uTime * 0.12, -uTime * 0.12));
    float hex = mix(hexCyl, hexCap, poleBlend);

    // Early deployment phase (uDeploy 0 -> 0.38): crisp luminous meridian contour arcs & faceted ribs ignite hugging hull FIRST,
    // then expand outward & weave into full translucent shell as golden-cyan activation wave sweeps bow-to-stern!
    float earlyArcPhase = smoothstep(0.0, 0.32, uDeploy) * (1.0 - smoothstep(0.30, 0.72, uDeploy));
    float meridians = smoothstep(0.91, 0.99, abs(sin(phi * 6.0 + uTime * 0.5))) * (1.0 - poleBlend * 0.90)
                    + smoothstep(0.92, 0.99, abs(sin(vLocalPos.z * 12.0 - uTime * 2.5)));
    float earlyRibbon = (meridians * 0.85 + hex * 0.65) * earlyArcPhase;

    // Deployment wavefront sweeping from bow -> stern!
    float frontPos = uDeploy * 1.25;
    float behindFront = smoothstep(frontPos + 0.04, frontPos - 0.14, zNorm);
    if (behindFront <= 0.001 && earlyRibbon <= 0.01) discard;

    // Brilliant luminous leading deployment wave band
    float waveBand = exp(-pow((zNorm - frontPos + 0.04) * 16.0, 2.0)) * smoothstep(1.18, 0.92, frontPos);

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    float ndv = abs(dot(N, V));
    float fresnel = pow(1.0 - ndv, 2.55);

    // Flowing longitudinal lamellar contour ribs & traveling harmonic ripple
    float flowRibs = smoothstep(0.85, 0.98, abs(sin(vLocalPos.z * 18.0 - uTime * 3.8 + sin(phi * 3.0) * 0.35)));
    float ripple = 0.5 + 0.5 * sin(vLocalPos.z * 9.0 - uTime * 5.2);

    // Translucent crystal-clear center so every warship's voxel silhouette reads razor-sharp inside!
    float baseFill = 0.012 + 0.042 * ripple * (1.0 - ndv);
    float pattern = hex * (0.14 + 0.52 * fresnel + 0.85 * waveBand) + flowRibs * (0.09 + 0.36 * fresnel);

    vec3 cyanDeep = vec3(0.05, 0.54, 0.96);
    vec3 cyanCore = vec3(0.24, 0.86, 1.00);
    vec3 goldEdge = vec3(1.00, 0.74, 0.32);
    vec3 col = mix(cyanDeep, cyanCore, clamp(fresnel * 0.8 + pattern * 0.5 + earlyRibbon * 0.6, 0.0, 1.0));
    col = mix(col, goldEdge, clamp(waveBand * 0.72 + earlyRibbon * 0.35, 0.0, 0.78));

    float shellEnergy = (baseFill + pow(fresnel, 1.15) * 0.78 + pattern * 0.42 + waveBand * 1.45) * behindFront;
    float energy = (shellEnergy + earlyRibbon * (0.55 + 0.75 * fresnel)) * uAlpha;
    fragColor = vec4(col * (0.95 + waveBand * 1.25 + earlyRibbon * 0.55), clamp(energy, 0.0, 0.78));
  }`;

  // =========================================================================
  // 6. FULLSCREEN HDR POST-PROCESSING (5-Level Dual-Kawase Bloom + ACES Filmic)
  // =========================================================================
  S.QUAD_VS = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main() {
    vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
    vUv = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
  }`;

  // Bright extraction + soft knee Karis-weighted downsample (threshold 1.32 so regular sunlit hulls stay razor-crisp!)
  S.BLOOM_PRE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTex;
  uniform vec2 uTexelSize;

  vec3 prefilter(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float threshold = 1.32;
    float knee = 0.50;
    float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / (4.0 * knee + 0.0001);
    float contrib = max(soft, br - threshold) / max(br, 0.0001);
    return min(c * contrib, vec3(7.0));
  }

  void main() {
    vec2 o = uTexelSize;
    vec3 c0 = prefilter(texture(uTex, vUv + vec2(-o.x, -o.y)).rgb);
    vec3 c1 = prefilter(texture(uTex, vUv + vec2( o.x, -o.y)).rgb);
    vec3 c2 = prefilter(texture(uTex, vUv + vec2(-o.x,  o.y)).rgb);
    vec3 c3 = prefilter(texture(uTex, vUv + vec2( o.x,  o.y)).rgb);
    vec3 c4 = prefilter(texture(uTex, vUv).rgb);
    fragColor = vec4((c0 + c1 + c2 + c3) * 0.125 + c4 * 0.5, 1.0);
  }`;

  S.BLOOM_DOWN_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTex;
  uniform vec2 uTexelSize;

  void main() {
    vec2 o = uTexelSize;
    vec3 sum = texture(uTex, vUv).rgb * 4.0;
    sum += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb;
    sum += texture(uTex, vUv + vec2( o.x, -o.y)).rgb;
    sum += texture(uTex, vUv + vec2(-o.x,  o.y)).rgb;
    sum += texture(uTex, vUv + vec2( o.x,  o.y)).rgb;
    fragColor = vec4(sum * 0.125, 1.0);
  }`;

  S.BLOOM_UP_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTex;
  uniform vec2 uTexelSize;

  void main() {
    vec2 o = uTexelSize * 1.15;
    vec3 sum = vec3(0.0);
    sum += texture(uTex, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
    sum += texture(uTex, vUv + vec2( o.x * 2.0, 0.0)).rgb;
    sum += texture(uTex, vUv + vec2(0.0, -o.y * 2.0)).rgb;
    sum += texture(uTex, vUv + vec2(0.0,  o.y * 2.0)).rgb;
    sum += texture(uTex, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
    sum += texture(uTex, vUv + vec2( o.x, -o.y)).rgb * 2.0;
    sum += texture(uTex, vUv + vec2(-o.x,  o.y)).rgb * 2.0;
    sum += texture(uTex, vUv + vec2( o.x,  o.y)).rgb * 2.0;
    fragColor = vec4(sum / 12.0, 1.0);
  }`;

  S.COMPOSITE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D uSceneTex;
  uniform sampler2D uBloomTex;
  uniform float uExposure;
  uniform float uBloomStrength;

  // ACES Filmic Tone Mapping (preserves color saturation in strong highlights!)
  vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  void main() {
    vec3 hdr = texture(uSceneTex, vUv).rgb;
    vec3 bloom = texture(uBloomTex, vUv).rgb;
    vec3 col = (hdr + bloom * uBloomStrength) * uExposure;

    // Gentle theatrical edge framing (subtle vignette)
    vec2 d = vUv - 0.5;
    float vig = 1.0 - dot(d, d) * 0.28;
    col *= clamp(vig, 0.72, 1.0);

    // ACES Filmic curve + sRGB gamma
    col = aces(col);
    col = pow(col, vec3(1.0 / 2.2));
    fragColor = vec4(col, 1.0);
  }`;

  App.Shaders = S;
})(window.App);
