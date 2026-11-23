/* toon materials (patched MeshToonMaterial), atlas, palette */
(function () {
  'use strict';
  var H = window.H, U = H.U, L = H.L;

  // ---------------------------------------------------------------- palette (sRGB hex)
  H.C = {
    conc: 0xd9dfdb, conc2: 0xcfd6d2, conc3: 0xc0c9c6, concDark: 0xa9b6b4, concWarm: 0xe6e3d8,
    white: 0xf7f8f3, offwhite: 0xeaeee8, cream: 0xf1ead8,
    bottom: 0x2f7f8f, bottomRed: 0xb85a48, stripeBlue: 0x3f8fb6, navy: 0x35566e,
    rust: 0xb46a3e, rustDark: 0x8e4f2f, rustLight: 0xd59c6c,
    iron: 0x2c3136, ironLight: 0x444c53, steel: 0xaab6bb, steelDark: 0x7f8c93, chrome: 0xdfe7ea,
    rope: 0xe9743c, ropeWet: 0x9a4226, ropeOld: 0xc9b48a,
    orange: 0xf08a2c, yellow: 0xf4cb3c, black: 0x2a2b30, red: 0xd9503f, redDeep: 0xc5433a,
    wood: 0xb98e5e, woodDark: 0x8c6846, woodLight: 0xd8b98c, woodGrey: 0xa39683,
    tile: 0x5f7887, tileDark: 0x4d6472, tileLight: 0x7690a0,
    leaf: 0x73b56d, leaf2: 0x529e66, leaf3: 0x3f8862, leafLight: 0xa3d37e, grass: 0x8fc57a,
    case1: 0xcdd4d8, case2: 0xb3bcc2, caseTrim: 0x3b4148, brass: 0xe4b85c,
    crateBlue: 0x3f88cb, crateBlueDark: 0x2f6ea8, fishBox: 0xf3f5f2, ice: 0xd9f1f6,
    tyre: 0x34383d, rubber: 0x2a2d31,
    gravel: 0x9aa7a3, gravel2: 0x7f8e8b, sand: 0xc9c7ac, rock: 0x8d9a98,
    seaweed: 0x3f7a55, seaweed2: 0x5b8c4a, kelp: 0x6b7a3a,
    skin: 0xf2e2d0, tin: 0xcfd8dc
  };

  // ---------------------------------------------------------------- gradient map (toon bands)
  (function () {
    // 16 texels over dotNL in [-1, 1]; bands: <0 shadow, 0..0.25, 0.25..0.5, 0.5..0.625, >0.625
    var vals = [0, 0, 0, 0, 0, 0, 0, 0, 0.28, 0.28, 0.56, 0.56, 0.82, 1, 1, 1];
    var data = new Uint8Array(16 * 4);
    for (var i = 0; i < 16; i++) { var v = Math.round(vals[i] * 255); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    var t = new THREE.DataTexture(data, 16, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    H.gradientMap = t;
  })();

  // ---------------------------------------------------------------- rain rings GLSL (water + puddles)
  H.GLSL.rings = [
    'float rainRings(vec2 p, float t, float density){',
    '  float acc = 0.0;',
    '  for (int k = 0; k < 2; k++) {',
    '    vec2 q = p * (k == 0 ? 1.0 : 0.71) + float(k) * 17.3;',
    '    vec2 cell = floor(q); vec2 f = fract(q);',
    '    vec2 h = hash22(cell + 0.5);',
    '    float period = 1.5 + h.x * 1.9;',
    '    float ph = t / period + h.y * 7.0;',
    '    float cyc = floor(ph); float lt = fract(ph);',
    '    vec2 c = hash22(cell + cyc * 3.7 + 1.5) * 0.5 + 0.25;',
    '    float alive = step(hash21(cell + cyc * 1.31 + 5.0), density);',
    '    float r = 0.04 + lt * 0.30;',
    '    float d = length(f - c);',
    '    float ring = (1.0 - smoothstep(0.0, 0.03, abs(d - r))) * (1.0 - lt) * alive;',
    '    float ring2 = (1.0 - smoothstep(0.0, 0.022, abs(d - r * 0.55))) * (1.0 - lt) * alive * step(0.25, lt) * 0.7;',
    '    acc = max(acc, max(ring, ring2));',
    '  }',
    '  return acc;',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------- toon patch
  var VERT_PARS = [
    'attribute vec2 aSway;',
    'varying vec3 vWPos;', 'varying vec3 vOPos;', 'varying vec2 vFx;', 'varying vec3 vNrmW;',
    H.GLSL.common, H.GLSL.sway
  ].join('\n');

  var VERT_BEGIN = [
    'vec3 transformed = vec3(position);',
    'vOPos = position;',
    '#ifdef FX_UV',
    '  vFx = uv;',
    '#else',
    '  vFx = vec2(SWAY_FX, 0.0);',
    '#endif',
    '{',
    '  vec4 wp0 = vec4(position, 1.0);',
    '  mat3 nm = mat3(modelMatrix);',
    '  #ifdef USE_INSTANCING',
    '    wp0 = instanceMatrix * wp0;',
    '    nm = nm * mat3(instanceMatrix);',
    '  #endif',
    '  wp0 = modelMatrix * wp0;',
    '  vNrmW = normalize(nm * objectNormal);',
    '  vec3 so = swayOffset(wp0.xyz, aSway, vFx.x, vNrmW);',
    '  if (aSway.x > 0.0) transformed += inverse(nm) * so;',
    '  vWPos = wp0.xyz + so;',
    '}'
  ].join('\n');

  var FRAG_PARS = [
    'varying vec3 vWPos;', 'varying vec3 vOPos;', 'varying vec2 vFx;', 'varying vec3 vNrmW;',
    'uniform float uClipY;', 'uniform vec3 uMistCol;', 'uniform vec3 uDeepCol;', 'uniform float uRain;',
    '#ifdef GROUND',
    'uniform sampler2D uShore; uniform sampler2D uReflQ; uniform mat4 uReflQMat;',
    '#endif',
    H.GLSL.common, H.GLSL.caustic, H.GLSL.rings,
    'vec3 skyRefl(float up){ return mix(vec3(0.83, 0.94, 0.95), vec3(0.60, 0.84, 0.92), clamp(up, 0.0, 1.0)); }'
  ].join('\n');

  // albedo stage: procedural surface detail selected by the fx id
  var FRAG_ALBEDO = [
    'float fxId = vFx.x; float gloss = vFx.y;',
    'vec3 nW = normalize(vNrmW);',
    'float insideBase = step(abs(vWPos.x), ' + (L.HALF - 0.03).toFixed(2) + ') * step(abs(vWPos.z), ' + (L.HALF - 0.03).toFixed(2) + ');',
    '#ifdef FX_UV',
    'if (fxId > 0.5 && fxId < 1.5) {',                                  // --- concrete
    '  vec2 pp = abs(nW.y) > 0.5 ? vWPos.xz : (abs(nW.x) > 0.5 ? vWPos.zy : vWPos.xy);',
    '  float st = fbm2(pp * 0.42 + 11.0);',
    '  float st2 = fbm2(pp * vec2(2.4, 0.33) + 3.7);',
    '  float stain = smoothstep(0.50, 0.56, st) * 0.055 + smoothstep(0.57, 0.63, st2) * 0.07 * (1.0 - abs(nW.y));',
    '  float speck = step(0.90, hash21(floor(pp * 9.0))) * 0.035;',
    '  float lightp = smoothstep(0.62, 0.66, fbm2(pp * 0.8 + 40.0)) * 0.035;',
    '  diffuseColor.rgb *= 1.0 - stain - speck + lightp;',
    '  if (insideBase > 0.5 && vWPos.y < 1.3) {',                        // tide marks near the waterline
    '    float y = vWPos.y + (vnoise(pp * vec2(0.7, 0.2)) - 0.5) * 0.16;',
    '    float wet = 1.0 - smoothstep(0.50, 0.56, y);',
    '    float algae = smoothstep(0.06, 0.12, y) * (1.0 - smoothstep(0.24, 0.31, y));',
    '    float salt = smoothstep(0.58, 0.61, y) * (1.0 - smoothstep(0.68, 0.72, y));',
    '    float old = smoothstep(0.88, 0.91, y) * (1.0 - smoothstep(0.95, 0.99, y)) + 0.6 * smoothstep(1.12, 1.14, y) * (1.0 - smoothstep(1.16, 1.19, y));',
    '    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.60, 0.72, 0.74), wet);',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.38, 0.24), algae * 0.72);',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.92), salt * 0.7);',
    '    diffuseColor.rgb *= 1.0 - old * 0.20;',
    '    float bar = step(0.80, hash21(floor(pp * vec2(7.0, 9.0)))) * (1.0 - smoothstep(0.02, 0.10, abs(y + 0.02)));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.80), bar * 0.8);',
    '    float deepAl = smoothstep(0.0, -0.5, y) * (0.4 + 0.6 * fbm2(pp * 1.3));',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.27, 0.22), deepAl * 0.55);',
    '  }',
    '} else if (fxId > 1.5 && fxId < 2.5) {',                           // --- hull paint with rust
    '  float band = 1.0 - smoothstep(0.15, 1.0, vOPos.y);',
    '  float n1 = fbm2(vec2(vOPos.x * 6.5 + vOPos.z * 6.5, vOPos.y * 0.42) + 5.0);',
    '  float n2 = fbm2(vOPos.xz * 7.0 + vOPos.y * 5.0 + 9.0);',
    '  float streak = smoothstep(0.735 - band * 0.09, 0.755 - band * 0.09, n1);',
    '  float blot = smoothstep(0.76, 0.78, n2) * band;',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.30, 0.10), streak * 0.60);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.15, 0.05), blot * 0.75);',
    '  float scuff = smoothstep(0.60, 0.64, fbm2(vOPos.xz * 1.1 + 2.0)) * 0.05;',
    '  diffuseColor.rgb *= 1.0 - scuff;',
    '} else if (fxId > 2.5 && fxId < 3.5) {',                           // --- rusty metal
    '  vec3 q = vWPos * 6.5;',
    '  float n1 = fbm2(q.xz + q.y * 1.7);',
    '  float n2 = fbm2(q.xy * 1.9 + q.z + 4.0);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.22, 0.10), smoothstep(0.50, 0.54, n1) * 0.42);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.52, 0.30), smoothstep(0.62, 0.65, n2) * 0.36);',
    '} else if (fxId > 7.5 && fxId < 8.5) {',                           // --- wood grain
    '  vec3 q = vOPos;',
    '  float g1 = vnoise(vec2((q.x + q.z) * 2.2, q.y * 34.0 + (q.x - q.z) * 21.0));',
    '  diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.70, g1) * 0.085;',
    '} else if (fxId > 8.5 && fxId < 10.5) {',                          // --- corrugated sheet
    '  float a = abs(nW.y) > 0.5 ? (fxId < 9.5 ? vWPos.z : vWPos.x) : (abs(nW.z) > 0.5 ? vWPos.x : vWPos.z);',
    '  float rib = fract(a * 3.2);',
    '  diffuseColor.rgb *= 1.0 - step(0.72, rib) * 0.10 + step(rib, 0.16) * 0.03;',
    '  float rr = fbm2(vec2(a * 2.6, vWPos.y * 0.55) + 2.0);',
    '  float low = 1.0 - smoothstep(1.7, 3.0, vWPos.y);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.60, 0.33, 0.16), smoothstep(0.80 - low * 0.26, 0.83 - low * 0.26, rr) * 0.42 * step(abs(nW.y), 0.5));',
    '} else if (fxId > 11.5 && fxId < 12.5) {',                         // --- hazard stripes (wheel stop)
    '  float a = (vWPos.x + vWPos.z + vWPos.y) / 0.62;',
    '  float s = step(0.5, fract(a));',
    '  vec3 yel = vec3(0.90, 0.60, 0.045); vec3 blk = vec3(0.028, 0.03, 0.035);',
    '  vec3 paintC = mix(yel, blk, s);',
    '  float wear = smoothstep(0.60, 0.64, fbm2(vWPos.xz * 2.2 + vWPos.y * 3.0 + 1.0));',
    '  float chip = step(0.95, hash21(floor((vWPos.xz + vWPos.y) * 17.0)));',
    '  diffuseColor.rgb = mix(paintC, diffuseColor.rgb, clamp(wear * 0.85 + chip * 0.7, 0.0, 1.0));',
    '}',
    '#endif',
    '#ifdef GROUND',
    'vec2 gp = vWPos.xz;',
    'vec4 shoreS = texture2D(uShore, gp / ' + (L.HALF * 2).toFixed(1) + ' + 0.5);',
    'float pudRaw = shoreS.r + (vnoise(gp * 1.3 + 2.0) - 0.5) * 0.10;',
    'float pud = smoothstep(0.50, 0.53, pudRaw);',
    'float outdoors = 1.0 - shoreS.g;',
    'float damp = smoothstep(0.26, 0.42, shoreS.r + (fbm2(gp * 0.7 + 9.0) - 0.5) * 0.30);',
    '{',
    '  float st = fbm2(gp * 0.33 + 11.0);',
    '  float st2 = fbm2(gp * vec2(0.9, 0.5) + 23.7);',
    '  float stain = smoothstep(0.50, 0.55, st) * 0.065 + smoothstep(0.58, 0.62, st2) * 0.05 + smoothstep(0.40, 0.44, fbm2(gp * 0.11 + 7.0)) * 0.035;',
    '  float speck = step(0.91, hash21(floor(gp * 8.0))) * 0.03;',
    '  float patchL = smoothstep(0.60, 0.63, fbm2(gp * 0.21 + 60.0)) * 0.03;',
    '  float worn = shoreS.b;',
    '  diffuseColor.rgb *= 1.0 - stain - speck + patchL - worn * 0.10;',
    '  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.83, 0.89, 0.90), damp * 0.8);',
    '}',
    '#endif'
  ].join('\n');

  // lighting stage (replaces the "vec3 outgoingLight = ..." line)
  var FRAG_LIGHT = [
    'float cloudK = cloudSun(vWPos.xz);',
    'vec3 dirL = reflectedLight.directDiffuse * cloudK;',
    'vec3 outgoingLight = dirL + reflectedLight.indirectDiffuse * (0.90 + 0.10 * cloudK) + totalEmissiveRadiance;',
    'float litAmt = clamp(dot(dirL, vec3(0.6)) / max(dot(diffuseColor.rgb, vec3(0.33)), 0.03), 0.0, 1.0);',
    '#if NUM_DIR_LIGHTS > 0',
    'vec3 sunV = directionalLights[0].direction;',
    'vec3 viewV = normalize(vViewPosition);',
    '#ifdef FX_UV',
    'if (gloss > 0.01) {',
    '  vec3 hv = normalize(sunV + viewV);',
    '  float sp = pow(max(dot(normal, hv), 0.0), mix(14.0, 70.0, gloss));',
    '  float rim = pow(1.0 - max(dot(normal, viewV), 0.0), 3.0) * max(dot(normal, sunV) * 0.5 + 0.5, 0.0);',
    '  outgoingLight += vec3(1.0, 0.94, 0.80) * (step(0.5, sp) * 0.50 + step(0.62, rim) * 0.10) * gloss * litAmt;',
    '}',
    '#endif',
    '#endif',
    '#ifdef GROUND',
    '{',
    '  vec3 Vw = normalize(cameraPosition - vWPos);',
    '  float fres = pow(1.0 - max(Vw.y, 0.0), 2.6);',
    '  float rr = rainRings(gp * 2.6, uTime, 0.25 + uRain * 0.65) * pud * outdoors;',
    '  vec2 rip = vec2(vnoise(gp * 5.0 + uTime * 0.7) - 0.5, vnoise(gp * 5.0 + 7.0 - uTime * 0.6) - 0.5) * (0.05 * pud + 0.012) + rr * 0.10;',
    '  vec4 rc = uReflQMat * vec4(vWPos.x + rip.x, ' + (L.QUAY_Y + 0.001).toFixed(3) + ', vWPos.z + rip.y, 1.0);',
    '  vec4 refl = texture2D(uReflQ, rc.xy / rc.w);',
    '  vec3 skyC = skyRefl(Vw.y) * (0.88 + 0.12 * cloudK);',
    '  vec3 rcol = mix(skyC, refl.rgb, refl.a);',
    '  float sheen = (0.07 + 0.26 * fres) * (0.6 + 0.4 * damp);',
    '  outgoingLight = mix(outgoingLight, rcol, sheen);',
    '  vec3 pcol = mix(outgoingLight * vec3(0.74, 0.82, 0.84), rcol, 0.50 + 0.42 * fres);',
    '  float edge = smoothstep(0.455, 0.50, pudRaw) * (1.0 - pud);',
    '  outgoingLight *= 1.0 - edge * 0.16;',
    '  outgoingLight = mix(outgoingLight, pcol, pud);',
    '  outgoingLight += vec3(0.95, 0.98, 0.98) * rr * 0.45;',
    '  #if NUM_DIR_LIGHTS > 0',
    '  vec3 hvw = normalize(uSunDirW + Vw);',
    '  float gl = pow(max(hvw.y, 0.0), 220.0);',
    '  float gn = fbm2(gp * 1.9 + 31.0);',
    '  float glint = step(0.42, gl * (0.55 + gn)) * litAmt * (0.35 + 0.65 * max(damp, pud));',
    '  outgoingLight += vec3(1.0, 0.93, 0.76) * glint * 0.34;',
    // soft flat sheen patches at glancing angles: the wet film catching the bright sky
    '  float film = step(0.57, fbm2(gp * 0.42 + 70.0)) * smoothstep(0.30, 0.36, fres) * (0.55 + 0.45 * damp) * (1.0 - pud);',
    '  outgoingLight = mix(outgoingLight, vec3(1.0, 0.975, 0.90) * (0.82 + 0.18 * cloudK), film * 0.22 * litAmt);',
    '  float sparkle = step(0.988, hash21(floor(gp * 22.0) + floor(uTime * 1.7))) * max(pud, step(0.9, damp) * 0.5) * litAmt;',
    '  outgoingLight += vec3(1.0, 0.92, 0.72) * sparkle * 0.35 * (0.3 + fres);',
    '  #endif',
    '}',
    '#endif',
    // underwater: depth tint + caustics
    'if (insideBase > 0.5 && vWPos.y < 0.0) {',
    '  float dep = -vWPos.y;',
    '  float k = 1.0 - exp(-dep * 0.36);',
    '  float ca = causticNet(vWPos.xz * 0.55 + vWPos.y * 0.21, uTime) * max(nW.y, 0.0);',
    '  outgoingLight = mix(outgoingLight * vec3(0.72, 0.97, 0.97), uDeepCol * (0.75 + 0.5 * litAmt), k * 0.74);',
    '  outgoingLight += vec3(0.55, 0.85, 0.80) * ca * cloudK * 0.20 * (1.0 - k * 0.45);',
    '}',
    // far-sea mist (aerial perspective baked into the diorama)
    '{',
    '  float mz = smoothstep(-19.0, -34.0, vWPos.z) * (1.0 - smoothstep(9.0, 15.0, vWPos.x));',
    '  outgoingLight = mix(outgoingLight, uMistCol, mz * 0.60);',
    '}'
  ].join('\n');

  var UNI = ['uTime', 'uCloud', 'uSunK', 'uGust', 'uBreeze', 'uClipY', 'uMistCol', 'uDeepCol', 'uRain', 'uSunDirW'];

  H.patchToon = function (mat, opts) {
    opts = opts || {};
    var defs = opts.defines || {};
    mat.onBeforeCompile = function (shader) {
      var i;
      for (i = 0; i < UNI.length; i++) shader.uniforms[UNI[i]] = U[UNI[i]];
      if (defs.GROUND) { shader.uniforms.uShore = U.uShore; shader.uniforms.uReflQ = U.uReflQ; shader.uniforms.uReflQMat = U.uReflQMat; }
      if (opts.uniforms) for (var k in opts.uniforms) shader.uniforms[k] = opts.uniforms[k];
      var dstr = '';
      for (var d in defs) dstr += '#define ' + d + ' ' + defs[d] + '\n';
      if (!defs.FX_UV && !defs.SWAY_FX) dstr += '#define SWAY_FX 0.0\n';
      shader.vertexShader = dstr + shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <begin_vertex>', VERT_BEGIN);
      var fs = shader.fragmentShader;
      fs = fs.replace('#include <common>', '#include <common>\nuniform vec3 uSunDirW;\n' + FRAG_PARS + (opts.fragPars || ''));
      fs = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWPos.y < uClipY) discard;');
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_ALBEDO + (opts.fragAlbedo || ''));
      fs = fs.replace(/vec3 outgoingLight = [^;]+;/, FRAG_LIGHT + (opts.fragLight || ''));
      shader.fragmentShader = dstr + fs;
    };
    var key = 'toon|' + JSON.stringify(defs) + '|' + (opts.key || '');
    mat.customProgramCacheKey = function () { return key; };
    return mat;
  };

  H.makeToon = function (params, opts) {
    var p = Object.assign({ gradientMap: H.gradientMap, vertexColors: true }, params || {});
    return H.patchToon(new THREE.MeshToonMaterial(p), opts);
  };

  // ---------------------------------------------------------------- atlas (all printed / painted details)
  var Atlas = H.Atlas = { size: 4096, regions: {}, x: 4, y: 4, rowH: 0 };
  Atlas.canvas = document.createElement('canvas');
  Atlas.canvas.width = Atlas.canvas.height = Atlas.size;
  Atlas.ctx = Atlas.canvas.getContext('2d');
  Atlas.ctx.fillStyle = '#ffffff'; Atlas.ctx.fillRect(0, 0, Atlas.size, Atlas.size);
  Atlas.tex = new THREE.CanvasTexture(Atlas.canvas);
  Atlas.tex.colorSpace = THREE.SRGBColorSpace;
  Atlas.tex.anisotropy = 8;
  Atlas.tex.minFilter = THREE.LinearMipmapLinearFilter;
  Atlas.add = function (name, w, h, draw) {
    if (this.regions[name]) return this.regions[name];
    var pad = 6;
    if (this.x + w + pad > this.size) { this.x = 4; this.y += this.rowH + pad; this.rowH = 0; }
    if (this.y + h + pad > this.size) { console.error('atlas full', name); }
    var r = { x: this.x, y: this.y, w: w, h: h };
    this.x += w + pad; if (h > this.rowH) this.rowH = h;
    var c = this.ctx;
    c.save(); c.translate(r.x, r.y);
    // bleed frame: draw once scaled up slightly so mip bleeding picks the right colours
    c.save(); c.beginPath(); c.rect(-3, -3, w + 6, h + 6); c.clip();
    c.translate(-3, -3); c.scale((w + 6) / w, (h + 6) / h); draw(c, w, h); c.restore();
    c.beginPath(); c.rect(0, 0, w, h); c.clip();
    draw(c, w, h);
    c.restore();
    this.regions[name] = r; this.tex.needsUpdate = true;
    return r;
  };
  // quad (w x h, facing +z, centred) mapped to a region
  Atlas.quad = function (name, w, h, tintHex) {
    var r = this.regions[name];
    if (!r) { console.error('atlas region missing', name); r = { x: 0, y: 0, w: 8, h: 8 }; }
    var g = new THREE.PlaneGeometry(w, h);
    var S = this.size, u0 = r.x / S, u1 = (r.x + r.w) / S, v1 = 1 - r.y / S, v0 = 1 - (r.y + r.h) / S;
    var uv = g.attributes.uv.array;
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    uv[0] = u0; uv[1] = v1; uv[2] = u1; uv[3] = v1; uv[4] = u0; uv[5] = v0; uv[6] = u1; uv[7] = v0;
    H.G.paint(g, tintHex === undefined ? 0xffffff : tintHex);
    g._keepUV = true;
    return g;
  };
  // map an arbitrary geometry's existing 0..1 uvs into a region
  Atlas.remap = function (g, name) {
    var r = this.regions[name], S = this.size, uv = g.attributes.uv.array;
    for (var i = 0; i < uv.length; i += 2) {
      uv[i] = (r.x + uv[i] * r.w) / S;
      uv[i + 1] = 1 - (r.y + (1 - uv[i + 1]) * r.h) / S;
    }
    g._keepUV = true;
    return g;
  };
  H.FONT_JP = '"Yu Gothic", "YuGothic", "Meiryo", "MS Gothic", "Microsoft YaHei", "SimHei", sans-serif';
  H.FONT_JPB = '"Yu Gothic UI", "Meiryo", "Microsoft YaHei", "SimHei", sans-serif';
  H.FONT_MIN = '"Yu Mincho", "MS Mincho", "SimSun", "Songti SC", serif';
  H.FONT_HAND = '"KaiTi", "STKaiti", "Yu Mincho", "FangSong", "SimSun", serif';
  H.FONT_EN = '"Bahnschrift", "Segoe UI", "Arial Narrow", Arial, sans-serif';

  // ---------------------------------------------------------------- materials registry
  var M = H.M = {};
  function reg(key, mat, o) { M[key] = Object.assign({ mat: mat, layer: 0, cast: true, receive: true, order: 0 }, o || {}); return mat; }

  reg('solid', H.makeToon({}, { defines: { FX_UV: 1 } }));
  reg('solidDS', H.makeToon({ side: THREE.DoubleSide }, { defines: { FX_UV: 1 } }));
  // interior parts: receive shadows but do not cast (keeps sunlight patches clean)
  reg('solidNC', M.solid.mat, { cast: false });
  reg('ground', H.makeToon({}, { defines: { GROUND: 1 } }), { cast: false });
  reg('atlas', H.makeToon({ map: Atlas.tex, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }, {}), { cast: false });
  // unlit glowing prints (light boxes, lamps)
  var glow = new THREE.MeshBasicMaterial({ map: Atlas.tex, vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  reg('glow', glow, { cast: false, receive: false });
  var glowFlat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  reg('glowFlat', glowFlat, { cast: false, receive: false });

  // ---------------------------------------------------------------- glass
  function makeGlass(baseA, beadK, streakK) { return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uCloud: U.uCloud, uSunK: U.uSunK, uGust: U.uGust, uBreeze: U.uBreeze, uSunDirW: U.uSunDirW, uRain: U.uRain,
      uA: { value: baseA }, uBeadK: { value: beadK }, uStreakK: { value: streakK } },
    vertexShader: [
      'varying vec3 vW; varying vec3 vN; varying vec3 vO; attribute vec3 color; varying vec3 vC;',
      'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vO = position; vC = color;',
      '  vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vC;',
      'uniform vec3 uSunDirW; uniform float uRain; uniform float uA, uBeadK, uStreakK;',
      H.GLSL.common,
      'void main(){',
      '  vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  float cK = cloudSun(vW.xz);',
      // diagonal anime glass streaks, anchored in object space so they ride with boats
      '  float d = (vO.x + vO.z) * 1.0 + vO.y * 0.9;',
      '  float s1 = step(0.80, fract(d * 0.55)) * step(fract(d * 0.55), 0.93);',
      '  float s2 = step(0.30, fract(d * 0.55)) * step(fract(d * 0.55), 0.34);',
      '  float streak = (s1 * 0.20 + s2 * 0.14) * (0.4 + 0.6 * cK) * uStreakK;',
      // rain beads sliding down slowly
      '  vec2 gp = abs(N.y) > 0.6 ? vO.xz : vec2(vO.x + vO.z, vO.y);',
      '  vec2 cell = floor(gp * vec2(15.0, 9.5)); vec2 h = hash22(cell);',
      '  vec2 f = fract(gp * vec2(15.0, 9.5));',
      '  float slide = fract(h.y * 5.0 - uTime * (0.03 + h.x * 0.05));',
      '  float bead = step(length((f - vec2(0.3 + h.x * 0.4, slide)) * vec2(1.0, 0.62)), 0.07) * step(h.x, (0.22 + uRain * 0.40) * uBeadK);',
      '  float glint = bead * step(0.75, h.y) * cK;',
      '  vec3 col = mix(vC, vec3(1.0), streak * 2.0 + bead * 0.7 + fres * 0.5);',
      '  col = mix(col, vec3(1.0, 0.95, 0.80), glint * 0.8);',
      '  float a = uA + fres * 0.30 + streak + bead * 0.30;',
      '  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));',
      '}'
    ].join('\n')
  }); }
  reg('glass', makeGlass(0.085, 1.0, 1.0), { layer: 1, cast: false, receive: false, order: 20 });
  reg('vinyl', makeGlass(0.20, 1.9, 0.45), { layer: 1, cast: false, receive: false, order: 21 });

  // ---------------------------------------------------------------- net (alpha cut-out mesh pattern)
  (function () {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = '#ffffff'; x.lineWidth = 5; x.lineCap = 'round';
    for (var i = -1; i < 5; i++) {
      x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 128, 128); x.stroke();
      x.beginPath(); x.moveTo(i * 32 + 128, 0); x.lineTo(i * 32, 128); x.stroke();
    }
    x.fillStyle = '#ffffff';
    for (var a = 0; a <= 4; a++) for (var b = 0; b <= 4; b++) { x.beginPath(); x.arc(a * 32, b * 32, 5, 0, 7); x.fill(); x.beginPath(); x.arc(a * 32 + 16, b * 32 + 16, 5, 0, 7); x.fill(); }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    H.netTex = t;
    reg('net', H.makeToon({ map: t, alphaTest: 0.42, side: THREE.DoubleSide }, { defines: { SWAY_FX: '6.0' }, key: 'net' }), { layer: 1, cast: true });
    reg('netStill', H.makeToon({ map: t, alphaTest: 0.42, side: THREE.DoubleSide }, { defines: { SWAY_FX: '0.0' }, key: 'netStill' }), { layer: 1, cast: true });
  })();

  // ---------------------------------------------------------------- additive / flat effect materials helpers
  H.makeAdd = function (uniforms, vs, fs, opts) {
    var u = { uTime: U.uTime, uCloud: U.uCloud, uSunK: U.uSunK, uGust: U.uGust, uBreeze: U.uBreeze };
    Object.assign(u, uniforms || {});
    return new THREE.ShaderMaterial(Object.assign({
      uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }, opts || {}));
  };
})();
