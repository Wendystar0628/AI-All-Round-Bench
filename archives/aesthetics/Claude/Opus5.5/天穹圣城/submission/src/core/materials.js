import * as THREE from 'three';
import { U, sharedUniforms } from './uniforms.js';
import { GLSL_UNIFORMS, GLSL_HELPERS, GLSL_CLOUDSHADOW } from './shaderlib.js';
import { makeVineTexture, makeBalusterTexture, makeNetTexture } from './textures.js';

// Wind sway for vegetation / vines (object space == world space for merged meshes)
const SWAY_GLSL = /* glsl */`
vec3 swayOffset(vec3 p, float w, float ph) {
  float along = dot(p.xz, uWindDir);
  float g = uGust.z * exp(-pow((along - uGust.x) / uGust.y, 2.0));
  float t = uTime;
  float s = sin(t * 1.3 + ph * 6.283 + p.x * 0.05) * 0.5 + sin(t * 2.1 + ph * 3.1 + p.z * 0.07) * 0.3;
  float amp = (0.18 + g * 0.9) * w;
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y) * (amp * (0.6 + 0.4 * s) + g * w * 0.6);
  d.x += sin(t * 2.7 + ph * 11.0) * 0.05 * w; d.z += cos(t * 2.3 + ph * 7.0) * 0.05 * w;
  d.y -= abs(d.x + d.z) * 0.15;
  return d;
}
`;

// per-kind albedo / roughness / bump code (fragment). Inputs: vWPos, vWNrm, vAux, vUv(if any), diffuseColor
const KIND_FRAG = {
  stone: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 9.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 1.7);
    vec4 tC = triplanar(tNoise2D, vWPos, n, 1.0 / 0.45);
    float blotch = tA.r - 0.5;
    float grain = (tB.b - 0.5) * 0.10 + (tC.b - 0.5) * 0.08;
    vec3 col = diffuseColor.rgb;
    col *= 1.0 + grain + blotch * 0.16;
    col = mix(col, col * vec3(1.03, 0.96, 0.82), smoothstep(0.05, 0.35, blotch) * 0.55);
    // water stains: vertical streaks, stronger near piece bottoms and on faces away from the sun
    float vert = 1.0 - abs(n.y);
    float streak = texture(tNoise2D, vec2((vWPos.x + vWPos.z) * 0.21, vWPos.y * 0.018)).b;
    float away = clamp(0.5 - dot(n, uSunDir) * 0.8, 0.0, 1.0);
    float stain = vert * smoothstep(0.52, 0.8, streak) * (0.25 + 0.75 * vAux.x) * (0.45 + 0.55 * away);
    col = mix(col, col * vec3(0.70, 0.70, 0.64), stain * 0.55);
    // moss on upward faces and low parts on the shady side
    float mossN = smoothstep(0.45, 0.85, tA.g + tB.a * 0.25);
    float moss = mossN * (smoothstep(0.6, 0.95, n.y) * 0.55 + vAux.x * away * 0.75) * uMoss;
    col = mix(col, vec3(0.20, 0.25, 0.09), clamp(moss, 0.0, 0.85));
    col *= mix(1.0, 0.82, vAux.x * 0.5);
    #ifdef ASHLAR
    {
      vec2 tdir = normalize(vec2(-n.z, n.x) + 1e-5);
      float along = dot(vWPos.xz, tdir);
      float cy = vWPos.y / 0.62;
      float row = floor(cy);
      float cx = along / 1.3 + row * 0.5 + hash12(vec2(row, 3.1)) * 0.3;
      float fy = fract(cy), fx = fract(cx);
      float fw = fwidth(cy) + fwidth(cx);
      float vis = (1.0 - smoothstep(0.08, 0.35, fw)) * (1.0 - abs(n.y));
      float joint = max(1.0 - smoothstep(0.0, 0.045 + fw, fy), 1.0 - smoothstep(0.0, 0.03 + fw, min(fx, 1.0 - fx)));
      float blockTone = hash12(vec2(floor(cx), row));
      col *= mix(1.0, 0.93 + 0.12 * blockTone, vis);
      col *= 1.0 - joint * 0.22 * vis;
      bumpH -= joint * 0.5 * vis;
    }
    #endif
    diffuseColor.rgb = col;
    bumpH += tC.b * 0.6 + tB.b * 0.4 + tA.r * 0.3;
    roughAdd = moss * 0.1 - stain * 0.12;
  `,
  plaster: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 6.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 0.8);
    vec3 col = diffuseColor.rgb;
    col *= 1.0 + (tA.r - 0.5) * 0.14 + (tB.b - 0.5) * 0.06;
    float away = clamp(0.5 - dot(n, uSunDir) * 0.8, 0.0, 1.0);
    float streak = texture(tNoise2D, vec2((vWPos.x + vWPos.z) * 0.3, vWPos.y * 0.03)).b;
    float stain = (1.0 - abs(n.y)) * smoothstep(0.55, 0.85, streak) * (0.3 + 0.7 * vAux.x);
    col = mix(col, col * vec3(0.78, 0.76, 0.70), stain * 0.5);
    col *= mix(1.0, 0.8, vAux.x * 0.55);
    diffuseColor.rgb = col;
    bumpH = tB.b * 0.5 + tA.r * 0.2;
  `,
  roof: /* glsl */`
    // vUv in meters: x along eaves, y up the slope
    vec2 uvm = vUv;
    float rowH = 0.34; float rowI = floor(uvm.y / rowH); float row = fract(uvm.y / rowH);
    float tile = fract(uvm.x / 0.27 + rowI * 0.5);
    float tileI = floor(uvm.x / 0.27 + rowI * 0.5);
    float fw = fwidth(uvm.y / rowH) + fwidth(uvm.x / 0.27);
    float detail = 1.0 - smoothstep(0.35, 0.9, fw);
    float shade = mix(0.72, 1.0, smoothstep(0.0, 0.35, row));
    float gap = smoothstep(0.0, 0.07, tile) * smoothstep(1.0, 0.93, tile);
    float h1 = hash12(vec2(tileI, rowI) + vAux.y * 37.0);
    vec3 col = diffuseColor.rgb * (0.9 + 0.2 * h1);
    col *= mix(1.0, shade * mix(0.82, 1.0, gap), detail);
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 7.0);
    col *= 0.9 + 0.2 * tA.r;
    // lichen / weathering
    col = mix(col, col * vec3(0.85, 0.9, 0.75), smoothstep(0.55, 0.8, tA.g) * 0.4);
    diffuseColor.rgb = col;
    bumpH = mix(0.5, row * 0.9 + gap * 0.2, detail);
    roughAdd = (h1 - 0.5) * 0.15;
  `,
  copper: /* glsl */`
    vec2 uvm = vUv;
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 5.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 1.1);
    float seam = fract(uvm.x / 0.9);
    float fw = fwidth(uvm.x / 0.9);
    float seamL = (1.0 - smoothstep(0.0, 0.08 + fw, seam)) * (1.0 - smoothstep(0.3, 0.9, fw));
    float band = 1.0 - smoothstep(0.0, 0.06 + fwidth(uvm.y / 1.6), abs(fract(uvm.y / 1.6) - 0.5) * 2.0 - 0.94);
    vec3 col = diffuseColor.rgb;
    col *= 0.86 + 0.28 * tA.r + (tB.b - 0.5) * 0.12;
    // streaks of darker patina running down
    float streak = texture(tNoise2D, vec2(uvm.x * 0.35, uvm.y * 0.03)).b;
    col = mix(col, col * vec3(0.72, 0.8, 0.78), smoothstep(0.55, 0.85, streak) * 0.5);
    // copper showing through at worn spots
    float worn = smoothstep(0.72, 0.9, tA.g * 0.7 + tB.r * 0.5);
    col = mix(col, vec3(0.55, 0.28, 0.12), worn * 0.45);
    col *= 1.0 + seamL * 0.18;
    diffuseColor.rgb = col;
    metalAdd = worn * 0.5;
    roughAdd = -worn * 0.25 + (tB.b - 0.5) * 0.1;
    bumpH = seamL * 0.6 + tB.b * 0.15;
  `,
  metal: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 2.5);
    diffuseColor.rgb *= 0.9 + 0.2 * tA.r;
    roughAdd = (tA.b - 0.5) * 0.2;
    bumpH = tA.b * 0.2;
  `,
  iron: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 3.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 0.7);
    float rust = smoothstep(0.45, 0.75, tA.g * 0.6 + tB.b * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.15, 0.07), rust * 0.75);
    metalAdd = -rust * 0.6;
    roughAdd = rust * 0.35;
    bumpH = tB.b * 0.6 + rust * 0.4;
  `,
  wood: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec3 p = vWPos;
    // grain stretched along the dominant horizontal axis
    float g1 = texture(tNoise2D, vec2(p.x * 0.08 + p.z * 0.08, p.y * 2.2 + (p.x - p.z) * 0.7)).b;
    float g2 = texture(tNoise2D, vec2(p.y * 0.1, (p.x + p.z) * 2.5)).b;
    float grain = mix(g1, g2, abs(n.y));
    vec4 tA = triplanar(tNoise2D, p, n, 1.0 / 3.0);
    vec3 col = diffuseColor.rgb * (0.78 + 0.4 * grain) * (0.85 + 0.3 * tA.r);
    col = mix(col, col * vec3(0.82, 0.86, 0.9), smoothstep(0.5, 0.8, tA.g) * 0.35); // silvered weathering
    col *= mix(1.0, 0.78, vAux.x * 0.5);
    diffuseColor.rgb = col;
    bumpH = grain * 0.8;
  `,
  rock: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 26.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 6.5);
    vec4 tC = triplanar(tNoise2D, vWPos, n, 1.0 / 1.6);
    vec3 col = diffuseColor.rgb;
    // strata banding by height
    float sy = vWPos.y + (tA.r - 0.5) * 14.0;
    float band = texture(tNoise2D, vec2(sy * 0.021, 0.13)).r;
    float band2 = texture(tNoise2D, vec2(sy * 0.09, 0.57)).b;
    col *= 0.78 + 0.34 * band + (band2 - 0.5) * 0.18;
    col = mix(col, col * vec3(1.12, 0.98, 0.82), smoothstep(0.55, 0.8, band) * 0.5);
    col *= 0.88 + 0.24 * tB.r + (tC.b - 0.5) * 0.18;
    // cracks: dark thin lines
    float crack = smoothstep(0.86, 0.97, tB.a) * (1.0 - abs(n.y));
    col *= 1.0 - crack * 0.55;
    // moss on ledges (upward faces), more near the top of each island (vAux.x carries moss amount)
    float mossN = smoothstep(0.35, 0.75, tA.g * 0.7 + tB.g * 0.5);
    float moss = (smoothstep(0.25, 0.75, n.y) * 0.9 + 0.25) * mossN * vAux.x;
    col = mix(col, mix(vec3(0.17, 0.23, 0.07), vec3(0.28, 0.33, 0.12), tC.r), clamp(moss, 0.0, 0.92));
    // wet darker zones (vAux.y)
    col *= 1.0 - vAux.y * 0.38;
    diffuseColor.rgb = col;
    bumpH = tC.b * 0.45 + tB.b * 0.9 + band2 * 0.5 - crack * 0.6;
    roughAdd = -vAux.y * 0.3 + moss * 0.05;
  `,
  foliage: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 0.9);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 4.0);
    float leaf = tB.a;
    vec3 col = diffuseColor.rgb * (0.7 + 0.55 * leaf) * (0.85 + 0.3 * tA.r);
    col *= mix(0.55, 1.0, clamp(vAux.x * 1.4, 0.0, 1.0));
    diffuseColor.rgb = col;
    bumpH = leaf * 1.2 + tB.b * 0.4;
  `,
  grass: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 12.0);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 1.5);
    vec3 col = diffuseColor.rgb * (0.8 + 0.4 * tA.r) * (0.85 + 0.3 * tB.b);
    col = mix(col, col * vec3(1.25, 1.1, 0.6), smoothstep(0.55, 0.8, tA.g) * 0.35);
    diffuseColor.rgb = col;
    bumpH = tB.b * 0.6;
  `,
  paving: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec2 q = vWPos.xz / 0.75;
    vec2 cell = floor(q + vec2(0.0, floor(q.x) * 0.5));
    vec2 f = fract(q + vec2(0.0, floor(q.x) * 0.5));
    float fw = fwidth(q.x) + fwidth(q.y);
    float detail = 1.0 - smoothstep(0.25, 0.8, fw);
    float edge = smoothstep(0.0, 0.1, f.x) * smoothstep(1.0, 0.9, f.x) * smoothstep(0.0, 0.1, f.y) * smoothstep(1.0, 0.9, f.y);
    float h1 = hash12(cell);
    vec4 tA = triplanar(tNoise2D, vWPos, n, 1.0 / 8.0);
    vec3 col = diffuseColor.rgb * (0.88 + 0.18 * h1 * detail) * (0.86 + 0.28 * tA.r);
    col *= mix(1.0, mix(0.72, 1.0, edge), detail * smoothstep(0.7, 0.95, n.y));
    float moss = smoothstep(0.55, 0.8, tA.g) * (1.0 - edge) * detail * 0.6;
    col = mix(col, vec3(0.22, 0.27, 0.1), moss * uMoss);
    col *= mix(1.0, 0.8, vAux.x * 0.4);
    diffuseColor.rgb = col;
    bumpH = edge * 0.5 * detail + tA.b * 0.2;
  `,
  fabric: /* glsl */`
    vec3 n = normalize(vWNrm);
    vec4 tB = triplanar(tNoise2D, vWPos, n, 1.0 / 0.6);
    diffuseColor.rgb *= 0.88 + 0.2 * tB.b;
    bumpH = tB.b * 0.3;
  `,
  glass: /* glsl */`
    vec3 n = normalize(vWNrm);
    diffuseColor.rgb *= 0.9 + 0.2 * hash12(floor(vWPos.xz * 0.7) + floor(vWPos.y * 0.7));
  `,
  plain: ``,
};

// Patch a MeshStandardMaterial with world varyings, procedural detail, cloud shadow, optional sway
export function patchMaterial(mat, kind = 'plain', opts = {}) {
  const sway = !!opts.sway;
  const bumpScale = opts.bump !== undefined ? opts.bump : 0.0;
  const moss = opts.moss !== undefined ? opts.moss : 1.0;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, sharedUniforms());
    sh.uniforms.uMoss = { value: moss };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${GLSL_UNIFORMS}
        attribute vec2 aux;
        varying vec2 vAux; varying vec3 vWPos; varying vec3 vWNrm;
        ${sway ? SWAY_GLSL : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAux = aux;
        ${sway ? 'transformed += swayOffset(transformed, aux.x, aux.y);' : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 wq = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wq = instanceMatrix * wq;
          #endif
          wq = modelMatrix * wq; vWPos = wq.xyz; }
        vWNrm = inverseTransformDirection(transformedNormal, viewMatrix);`);
    // make sure vUv exists for roof/copper (MeshStandardMaterial only defines vUv with maps) -> use our own
    const needUv = kind === 'roof' || kind === 'copper';
    if (needUv) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vUvM;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvM = uv;');
    }
    let frag = KIND_FRAG[kind] || '';
    if (needUv) frag = frag.replace(/vUv/g, 'vUvM');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${GLSL_UNIFORMS}
        uniform float uMoss;
        varying vec2 vAux; varying vec3 vWPos; varying vec3 vWNrm;
        ${needUv ? 'varying vec2 vUvM;' : ''}
        ${GLSL_HELPERS}
        ${GLSL_CLOUDSHADOW}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bumpH = 0.0; float roughAdd = 0.0; float metalAdd = 0.0;
        { ${frag} }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + roughAdd, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor + metalAdd, 0.0, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${bumpScale > 0 ? `normal = bumpPerturb(normal, -vViewPosition, bumpH, ${bumpScale.toFixed(4)});` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${opts.emissiveFrag || ''}`)
      .replace('#include <lights_fragment_begin>', `float cloudSh = cloudShadow(vWPos);\n` +
        THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= cloudSh;'));
    if (opts.extraFrag) sh.fragmentShader = opts.extraFrag(sh.fragmentShader);
    if (opts.extraVert) sh.vertexShader = opts.extraVert(sh.vertexShader);
  };
  if (opts.defines) mat.defines = Object.assign(mat.defines || {}, opts.defines);
  mat.customProgramCacheKey = () => `pm_${kind}_${sway ? 1 : 0}_${bumpScale}_${moss}_${opts.key || ''}`;
  return mat;
}

export function createMaterials(envMap) {
  const S = (params, kind, opts) => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, envMap, envMapIntensity: 0.62, ...params }), kind, opts);
  const M = {};
  M.stone = S({ roughness: 0.86, metalness: 0.0 }, 'stone', { bump: 0.014, defines: { ASHLAR: 1 } });
  M.marble = S({ roughness: 0.5, metalness: 0.0 }, 'stone', { bump: 0.006, moss: 0.25, key: 'marble' });
  M.plaster = S({ roughness: 0.92 }, 'plaster', { bump: 0.008 });
  M.roof = S({ roughness: 0.62, metalness: 0.08 }, 'roof', { bump: 0.02 });
  M.copper = S({ roughness: 0.45, metalness: 0.32 }, 'copper', { bump: 0.012 });
  M.gold = S({ color: 0xffffff, roughness: 0.26, metalness: 1.0, envMapIntensity: 1.3 }, 'metal', { bump: 0.004 });
  M.iron = S({ roughness: 0.55, metalness: 0.75 }, 'iron', { bump: 0.02 });
  M.bronze = S({ roughness: 0.38, metalness: 0.95 }, 'metal', { bump: 0.004, key: 'bronze' });
  M.wood = S({ roughness: 0.86 }, 'wood', { bump: 0.012 });
  M.rock = S({ roughness: 0.93 }, 'rock', { bump: 0.075 });
  M.foliage = S({ roughness: 0.82 }, 'foliage', { bump: 0.03, sway: true });
  M.foliageStatic = S({ roughness: 0.85 }, 'foliage', { bump: 0.03, key: 'static' });
  M.grass = S({ roughness: 0.95 }, 'grass', { bump: 0.01 });
  M.paving = S({ roughness: 0.82 }, 'paving', { bump: 0.012 });
  M.fabric = S({ roughness: 0.88, side: THREE.DoubleSide }, 'fabric', { bump: 0.004 });
  M.fabricSway = S({ roughness: 0.88, side: THREE.DoubleSide }, 'fabric', { bump: 0.004, sway: true, key: 'sway' });
  M.glass = S({ roughness: 0.16, metalness: 0.1, envMapIntensity: 0.55 }, 'glass', {});
  M.plain = S({ roughness: 0.8 }, 'plain', {});
  M.rope = S({ roughness: 0.95 }, 'plain', { key: 'rope' });
  M.balustrade = S({ map: makeBalusterTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, 'stone', { bump: 0.0, moss: 0.6, key: 'balus' });
  M.net = S({ map: makeNetTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }, 'plain', { key: 'net' });
  M.vine = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, map: makeVineTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, envMap, envMapIntensity: 0.7 }), 'plain', { sway: true, key: 'vine' });
  M.stainedA = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, envMap, envMapIntensity: 1.2, emissive: 0xffffff, emissiveIntensity: 1.0 }), 'plain', { key: 'stained', emissiveFrag: 'totalEmissiveRadiance = diffuseColor.rgb * 0.55;' });
  // glowing crystals (pale blue, inner light, slow breathing)
  M.crystal = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xc8f2ff, emissive: 0x58c8ff, emissiveIntensity: 2.6, roughness: 0.12, metalness: 0.05, envMap, envMapIntensity: 1.5 }), 'plain', {
    key: 'crystal',
    emissiveFrag: `
      float fres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float pulse = 0.72 + 0.28 * sin(uTime * 0.55 + vWPos.x * 0.031 + vWPos.y * 0.047 + vAux.y * 6.28);
      totalEmissiveRadiance *= pulse * (0.45 + 1.1 * (1.0 - fres * fres)) * (0.55 + 0.9 * vAux.x);`,
  });
  // emissive warm interior/lamp glow (unlit, HDR)
  M.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.4).multiplyScalar(6.0), toneMapped: false });
  M.glowSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(2.2), toneMapped: false });
  M.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(9.0), toneMapped: false });
  M.dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.011, 0.014) });
  M.dark.onBeforeCompile = () => {}; // no patch
  return M;
}

// helper colors (sRGB hex -> linear)
export const COL = {
  stoneWhite: 0xe9e0cd, stoneWarm: 0xe2d3b5, stoneBeige: 0xd6c4a2, stoneGrey: 0xb9b2a5, stoneDark: 0x8e8577,
  plasterWhite: 0xf0e8d8, plasterCream: 0xeadbbf, plasterOchre: 0xe2c79a, plasterRose: 0xe8cdb8,
  copperGreen: 0x5fa391, copperGreen2: 0x6fb0a0, copperDark: 0x467e70,
  terracotta: 0xb8643e, terracotta2: 0xa45534, terracotta3: 0xc47a4c,
  gold: 0xe8bd62, iron: 0x3a3836, bronze: 0xb27a3c,
  wood: 0x8a6a4c, woodDark: 0x5d4632, woodGrey: 0x8b8278,
  rock: 0x8a7d6e, rockDark: 0x5e554c, rockWarm: 0x9a8670,
  leaf: 0x58773a, leafDark: 0x2f4a26, olive: 0x7f8f5a, cypress: 0x2f4a2c, grass: 0x6f8f3e,
};
export function lin(hex) { return new THREE.Color(hex); }
