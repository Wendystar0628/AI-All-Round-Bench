// Wet, worn hard-surface materials for the mech (MeshPhysicalMaterial + injected GLSL).
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uWet: { value: 1 },
  uNoise: { value: null },
  uDrops: { value: null },
  uScratch: { value: null },
  uHeat: { value: [new THREE.Vector4(0, -999, 0, 1), new THREE.Vector4(0, -999, 0, 1), new THREE.Vector4(0, -999, 0, 1), new THREE.Vector4(0, -999, 0, 1)] },
  uReactorC: { value: new THREE.Vector3() },
  uReactorN: { value: new THREE.Vector3(0, 0, 1) },
  uReactorPulse: { value: 1 },
  uVisorC: { value: new THREE.Vector3() },
  uVisorF: { value: new THREE.Vector3(0, 0, 1) },
  uBladeO: { value: new THREE.Vector3() },
  uBladeA: { value: new THREE.Vector3(0, -1, 0) },
  uBladeS: { value: new THREE.Vector3(0, 0, 1) },
  uFlash: { value: 0 },
};

const COMMON_PARS = /* glsl */`
uniform float uTime;
uniform float uWet;
uniform sampler3D uNoise;
uniform sampler2D uDrops;
uniform sampler2D uScratch;
uniform vec4 uHeat[4];
varying vec3 vWPos;
varying vec3 vWNorm;
varying float vEdge;
varying float vSeed;
vec3 triTex(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
}
vec3 bumpN(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

const VERT_PARS = /* glsl */`
attribute float aEdge;
attribute float aSeed;
varying vec3 vWPos;
varying vec3 vWNorm;
varying float vEdge;
varying float vSeed;
`;
const VERT_MAIN = /* glsl */`
  vEdge = aEdge; vSeed = aSeed;
  vec4 wpos_ = modelMatrix * vec4(transformed, 1.0);
  vWPos = wpos_.xyz;
  vWNorm = normalize(mat3(modelMatrix) * objectNormal);
`;

// surface evaluation shared by paint / metal / blade
const SURFACE = /* glsl */`
  vec3 wp = vWPos; vec3 wn = normalize(vWNorm);
  float sd = vSeed * 7.31;
  vec4 nA = texture(uNoise, wp * 0.017 + sd);
  vec4 nB = texture(uNoise, wp * 0.072 + sd * 0.7);
  vec4 nC = texture(uNoise, wp * 0.29 + sd * 0.3);
  vec4 nD = texture(uNoise, wp * 1.25);
  vec3 scr = triTex(uScratch, wp, wn, 0.21);
  vec3 scr2 = triTex(uScratch, wp + 3.7, wn, 0.83);
  float pv = (nA.r - 0.5) * 0.34 + (nB.g - 0.5) * 0.24 + (nC.a - 0.5) * 0.08;
  float chip = smoothstep(0.52, 0.68, vEdge * 1.0 + (nC.g * 0.7 + nD.r * 0.55) * 0.55 - 0.17);
  float scrPatch = smoothstep(0.45, 0.68, nB.r);
  float scratch = clamp(scr.r * 2.0 * scrPatch + scr2.r * 1.1 * smoothstep(0.52, 0.76, nA.g), 0.0, 1.0);
  float bare = max(chip, smoothstep(0.28, 0.62, scratch) * 0.9);
  vec3 sp = vec3(wp.x * 1.5, wp.y * 0.1, wp.z * 1.5);
  float st = texture(uNoise, sp * 0.33 + sd).g;
  float sideF = 1.0 - smoothstep(0.55, 0.95, abs(wn.y));
  float streak = smoothstep(0.5, 0.86, st) * smoothstep(0.42, 0.7, nA.g) * sideF * 0.75;
  float rustZone = exp(-pow((wp.y - 24.5) / 3.0, 2.0)) + exp(-pow((wp.y - 47.0) / 2.6, 2.0)) * 0.8;
  float rustP = smoothstep(0.62, 0.8, nB.b * 0.55 + nC.r * 0.55 + vEdge * 0.22 + rustZone * 0.22);
  vec3 rustCol = vec3(0.20, 0.085, 0.03) * (0.7 + nD.a * 0.6);
  vec3 grimeCol = vec3(0.022, 0.02, 0.018);
  vec3 steelCol = vec3(0.62, 0.63, 0.66) * (0.78 + nD.a * 0.3);
  // heat discolouration around thrusters
  float heat = 0.0;
  for (int i = 0; i < 4; i++) { float d = distance(wp, uHeat[i].xyz) / uHeat[i].w; heat = max(heat, 1.0 - d); }
  heat = clamp(heat, 0.0, 1.0);
  vec3 heatCol = mix(vec3(0.35, 0.24, 0.08), vec3(0.12, 0.08, 0.28), smoothstep(0.25, 0.55, heat));
  heatCol = mix(heatCol, vec3(0.015, 0.013, 0.012), smoothstep(0.55, 0.85, heat));
  float heatMix = smoothstep(0.05, 0.55, heat) * (0.75 + nC.g * 0.25);
`;

function patch(mat, kind) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_MAIN);
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + COMMON_PARS + (kind === 'visor' ? VISOR_PARS : '') + (kind === 'reactor' ? REACTOR_PARS : '') + (kind === 'blade' ? BLADE_PARS : ''));
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + SURFACE + (BODY[kind] || ''));
    fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = sRough;');
    fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = sMetal;');
    fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMAL_MOD);
    fs = fs.replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n' + WATER_MOD);
    fs = fs.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + COAT_MOD);
    fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += sEmis;');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'mech_' + kind;
  return mat;
}

const BODY = {
  paint: /* glsl */`
  vec3 col = diffuseColor.rgb * (1.0 + pv);
  col = mix(col, col * vec3(0.72, 0.74, 0.8), smoothstep(0.6, 0.9, nB.a) * 0.4);
  col = mix(col, grimeCol, streak * 0.32);
  col = mix(col, rustCol, rustP * 0.42 + streak * 0.18 * nC.b);
  col = mix(col, heatCol, heatMix);
  col = mix(col, steelCol, bare * (1.0 - heatMix * 0.7));
  float sMetal = bare * 0.95;
  float sRough = mix(0.46 + nC.a * 0.1, 0.32, bare);
  sRough = mix(sRough, 0.75, rustP * 0.5);
  float hgt = scr.b * 0.55 - scratch * 0.35;
  vec3 sEmis = vec3(0.0);
  float coatAmt = 1.0;
`,
  metal: /* glsl */`
  vec3 col = diffuseColor.rgb * (0.82 + nD.a * 0.3 + (nB.g - 0.5) * 0.25);
  float oil = smoothstep(0.52, 0.78, nB.g) * 0.6 + streak * 0.45;
  col = mix(col, grimeCol, clamp(oil, 0.0, 0.85));
  col = mix(col, rustCol, rustP * 0.35);
  col = mix(col, heatCol, heatMix);
  col = mix(col, steelCol, chip * 0.8);
  float sMetal = 0.88;
  float sRough = 0.5 + nC.a * 0.18 - scratch * 0.15 - oil * 0.18;
  float hgt = scr2.g * 0.12 + scr.b * 0.3;
  vec3 sEmis = vec3(0.0);
  float coatAmt = 0.75;
`,
  chrome: /* glsl */`
  vec3 col = diffuseColor.rgb;
  col = mix(col, col * vec3(0.8, 0.78, 0.72), smoothstep(0.5, 0.8, nC.g) * 0.5);
  float sMetal = 1.0;
  float sRough = 0.07 + nD.a * 0.05;
  float hgt = 0.0;
  vec3 sEmis = vec3(0.0);
  float coatAmt = 0.5;
`,
  blade: /* glsl */`
  vec3 col = diffuseColor.rgb;
  vec3 rel = wp - uBladeO;
  float along = dot(rel, uBladeA);
  float across = dot(rel, uBladeS);
  float edgeD = clamp(abs(across) / 2.0, 0.0, 1.2);
  // brushed grain along blade axis
  float grain = texture(uNoise, vec3(across * 2.6, along * 0.04, 0.3)).a;
  col *= 1.15 + grain * 0.8;
  // temper colours near the edges (blue-purple -> straw)
  float tmp = smoothstep(0.6, 0.98, edgeD);
  vec3 temper = mix(vec3(0.45, 0.32, 0.12), vec3(0.16, 0.1, 0.34), smoothstep(0.7, 0.88, edgeD));
  temper = mix(temper, vec3(0.08, 0.16, 0.36), smoothstep(0.88, 1.0, edgeD));
  col = mix(col, temper, tmp * 0.85);
  float sMetal = 0.78;
  float sRough = 0.3 + grain * 0.16;
  float hgt = grain * 0.15;
  vec3 sEmis = vec3(0.0);
  float coatAmt = 0.8;
`,
  rubber: /* glsl */`
  vec3 col = diffuseColor.rgb * (0.9 + nC.a * 0.2);
  float sMetal = 0.0;
  float sRough = 0.62;
  float hgt = nD.r * 0.1;
  vec3 sEmis = vec3(0.0);
  float coatAmt = 0.8;
`,
  visor: /* glsl */`
  vec3 col = vec3(0.02, 0.025, 0.02);
  // hex grid in visor space
  vec3 rel = wp - uVisorC;
  vec3 F = normalize(vec3(uVisorF.x, 0.0, uVisorF.z));
  vec3 Rr = vec3(F.z, 0.0, -F.x);
  float ang = atan(dot(rel, Rr), dot(rel, F));
  vec2 huv = vec2(ang * 3.1, rel.y) / 0.13;
  vec4 hx = hexCoords(huv);
  float cellEdge = smoothstep(0.03, 0.11, hx.y);
  float cellN = texture(uNoise, vec3(hx.zw * 0.013, uTime * 0.02)).a;
  float band = 1.0 - smoothstep(0.0, 1.4, abs(rel.y + 0.05));
  float scan = 0.85 + 0.15 * sin(rel.y * 9.0 - uTime * 2.4);
  vec3 glow = vec3(1.0, 0.7, 0.2);
  vec3 sEmis = glow * (0.45 + 1.5 * band) * cellEdge * (0.65 + cellN * 0.7) * scan;
  sEmis += glow * 0.12 * (1.0 - cellEdge);
  float sMetal = 0.2;
  float sRough = 0.25;
  float hgt = (1.0 - cellEdge) * 0.6;
  float coatAmt = 1.0;
`,
  reactor: /* glsl */`
  vec3 rel = wp - uReactorC;
  vec3 N = normalize(uReactorN);
  vec3 pl = rel - N * dot(rel, N);
  float r = length(pl);
  float rn = clamp(r / 3.0, 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.92, 0.7);
  vec3 orange = vec3(1.0, 0.42, 0.06);
  vec3 dred = vec3(0.45, 0.05, 0.01);
  vec3 e = mix(hot, orange, smoothstep(0.18, 0.5, rn));
  e = mix(e, dred, smoothstep(0.55, 1.0, rn));
  float inten = mix(3.2, 0.35, smoothstep(0.1, 1.0, rn)) * uReactorPulse;
  float flick = 0.9 + 0.1 * texture(uNoise, vec3(pl.xy * 0.1, uTime * 0.3)).a;
  vec3 sEmis = e * inten * flick * REACTOR_GAIN;
  vec3 col = diffuseColor.rgb * 0.2;
  float sMetal = 0.7;
  float sRough = 0.35;
  float hgt = 0.0;
  float coatAmt = 0.0;
`,
};

const VISOR_PARS = /* glsl */`
uniform vec3 uVisorC; uniform vec3 uVisorF;
float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
vec4 hexCoords(vec2 uv) {
  const vec2 r = vec2(1.0, 1.7320508);
  const vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = uv - gv;
  return vec4(gv.x, 0.5 - hexDist(gv), id);
}
`;
const REACTOR_PARS = /* glsl */`
uniform vec3 uReactorC; uniform vec3 uReactorN; uniform float uReactorPulse;
`;
const BLADE_PARS = /* glsl */`
uniform vec3 uBladeO; uniform vec3 uBladeA; uniform vec3 uBladeS;
`;

const NORMAL_MOD = /* glsl */`
  normal = bumpN(-vViewPosition, normal, vec2(dFdx(hgt), dFdy(hgt)) * 0.9, faceDirection);
`;
const WATER_MOD = /* glsl */`
#ifdef USE_CLEARCOAT
  {
    float upF = smoothstep(0.2, 0.75, wn.y);
    vec4 dr = texture2D(uDrops, wp.xz * 0.75 + vSeed * 13.0);
    vec2 dn = (dr.rg - 0.5) * 2.0;
    float pop = step(0.985, fract(dr.a * 7.0 + uTime * 0.9 + vSeed));
    vec3 tH = normalize(vec3(-wn.z, 0.0, wn.x) + vec3(1e-4, 0.0, 0.0));
    float u = dot(wp, tH);
    float rv = texture(uNoise, vec3(u * 0.85 + vSeed * 5.0, (wp.y + uTime * 2.4) * 0.042, vSeed * 3.0 + 0.5)).a;
    float rv2 = texture(uNoise, vec3(u * 2.3 + 0.37, (wp.y + uTime * 3.1) * 0.09, vSeed * 2.0)).a;
    float riv = (smoothstep(0.6, 0.67, rv) + smoothstep(0.66, 0.71, rv2) * 0.6) * (1.0 - upF) * sideF * uWet;
    vec3 wpert = vec3(dn.x, 0.0, dn.y) * dr.b * upF * 0.85 * uWet;
    vec3 vpert = (viewMatrix * vec4(wpert, 0.0)).xyz;
    clearcoatNormal = normalize(clearcoatNormal + vpert);
    clearcoatNormal = bumpN(-vViewPosition, clearcoatNormal, vec2(dFdx(riv), dFdy(riv)) * 0.35, faceDirection);
    sWaterSpark = pop * dr.b * upF;
    sRiv = riv;
  }
#endif
`;
const COAT_MOD = /* glsl */`
#ifdef USE_CLEARCOAT
  material.clearcoat = clamp(coatAmt * (0.75 + 0.25 * uWet) + sRiv * 0.3, 0.0, 1.0);
  material.clearcoatRoughness = clamp(0.06 - sRiv * 0.04 + (1.0 - uWet) * 0.3, 0.03, 1.0);
#endif
  material.roughness = max(material.roughness * mix(1.0, 0.72, uWet), 0.05);
`;

export function makeMechMaterials(envMap) {
  const env = envMap || null;
  const phys = (o) => new THREE.MeshPhysicalMaterial({ envMap: env, ...o });
  const pre = (m) => { m.onBeforeCompile; return m; };
  const mats = {};
  const add = (key, kind, opts) => {
    const m = phys(opts);
    patch(m, kind);
    // pre-declare variables used by WATER_MOD/COAT_MOD
    const old = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      old(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n float sWaterSpark = 0.0; float sRiv = 0.0;');
    };
    mats[key] = m;
    return m;
  };
  add('paint', 'paint', { vertexColors: true, roughness: 0.45, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.0 });
  add('metal', 'metal', { vertexColors: true, roughness: 0.5, metalness: 0.88, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 1.0 });
  add('hose', 'metal', { vertexColors: true, roughness: 0.45, metalness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  add('chrome', 'chrome', { vertexColors: true, roughness: 0.06, metalness: 1, clearcoat: 0.4, clearcoatRoughness: 0.05, iridescence: 0.35, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 520] });
  add('blade', 'blade', { vertexColors: true, roughness: 0.22, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.05 });
  add('rubber', 'rubber', { vertexColors: true, roughness: 0.6, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.08 });
  add('visor', 'visor', { color: 0x050605, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x000000 });
  const reactorDisc = add('reactorDisc', 'reactor', { color: 0x2a1408, roughness: 0.35, metalness: 0.6, emissive: 0x000000 });
  reactorDisc.defines = { REACTOR_GAIN: '1.0' };
  const blades = add('reactorBlade', 'reactor', { color: 0x3a2010, roughness: 0.3, metalness: 0.8, emissive: 0x000000 });
  blades.defines = { REACTOR_GAIN: '1.35' };
  blades.customProgramCacheKey = () => 'mech_reactor_blade';
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.85, metalness: 0.1, envMap: env, envMapIntensity: 0.3 });
  mats.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.92, 0.96, 1.0).multiplyScalar(4), toneMapped: false });
  mats.lampRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.1, 0.05).multiplyScalar(5), toneMapped: false });
  mats.lampGreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1.0, 0.3).multiplyScalar(4), toneMapped: false });
  mats.thruster = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.32, 0.06).multiplyScalar(6), toneMapped: false });
  mats.grille = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.18).multiplyScalar(3.2), toneMapped: false });
  mats.hub = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.88, 0.62).multiplyScalar(7), toneMapped: false });
  mats.crystal = new THREE.MeshPhysicalMaterial({
    color: 0xffe2c0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, envMap: env, envMapIntensity: 0.9,
    clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, specularIntensity: 1,
  });
  return mats;
}
