/* harbour water: posterized reflection surface, translucent section panes, shore mask, dynamic disturbance map */
(function () {
  'use strict';
  var H = window.H, U = H.U, L = H.L, HALF = L.HALF;

  // clusters of tetrapods (shared by the mask and the landscape builder)
  H.TETRA = [
    { x: -12.3, z: -12.6, r: 1.9, n: 6 },      // around the lighthouse head
    { x: -10.6, z: -15.6, r: 1.7, n: 5 },
    { x: -7.0, z: -15.9, r: 1.6, n: 5 },
    { x: -3.4, z: -15.7, r: 1.5, n: 4 },
    { x: -29.6, z: -30.2, r: 2.2, n: 8 },      // far-left corner of the base
    { x: -30.6, z: -26.4, r: 1.5, n: 4 },
    { x: 3.6, z: -28.9, r: 1.7, n: 5 },        // east end of the far breakwater
    { x: 10.6, z: -17.0, r: 1.6, n: 5 }        // foot of the hill shore
  ];

  var S_GLSL = 'vec3 S(float r, float g, float b){ return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }';

  H.buildWater = function (scene) {
    var k, i;
    // ------------------------------------------------ static shore mask (R: near shore, G: wide shallows)
    (function () {
      var Sz = 1024, c = document.createElement('canvas'); c.width = c.height = Sz;
      var x = c.getContext('2d'); k = Sz / (HALF * 2);
      function p(v) { return (v + HALF) * k; }
      function rect(x0, z0, x1, z1) { x.fillRect(p(x0), p(z0), (x1 - x0) * k, (z1 - z0) * k); }
      x.fillStyle = '#000'; x.fillRect(0, 0, Sz, Sz);
      x.fillStyle = '#fff';
      rect(-HALF - 2, L.FRONT_Z, HALF + 2, HALF + 2);
      rect(L.ARM_X, L.ARM_Z, HALF + 2, L.FRONT_Z + 1);
      rect(L.HILL_X, -HALF - 2, HALF + 2, L.ARM_Z + 1);
      rect(L.BW.x0, L.BW.z0, L.BW.x1 + 1, L.BW.z1);
      x.beginPath(); x.arc(p(L.LH.x), p(L.LH.z), 2.7 * k, 0, 7); x.fill();
      rect(L.FBW.x0, L.FBW.z0, L.FBW.x1, L.FBW.z1);
      rect(L.STEPS.x0 - 0.35, L.FRONT_Z - 4.75, L.STEPS.x1, L.FRONT_Z + 0.1);
      rect(L.PLAT.x0, L.PLAT.z0, L.PLAT.x1, L.PLAT.z1 + 0.1);
      rect(L.SLIP.x0, L.FRONT_Z - 0.75, L.SLIP.x1, L.FRONT_Z + 0.1);
      H.TETRA.forEach(function (t) { x.beginPath(); x.arc(p(t.x), p(t.z), t.r * 0.82 * k, 0, 7); x.fill(); });
      function blurred(px) {
        var b = document.createElement('canvas'); b.width = b.height = Sz;
        var bx = b.getContext('2d'); bx.filter = 'blur(' + px + 'px)'; bx.drawImage(c, 0, 0);
        return bx.getImageData(0, 0, Sz, Sz).data;
      }
      var near = blurred(7), wide = blurred(30);
      var out = new Uint8Array(Sz * Sz * 4);
      for (i = 0; i < Sz * Sz; i++) { out[i * 4] = near[i * 4]; out[i * 4 + 1] = wide[i * 4]; out[i * 4 + 2] = 0; out[i * 4 + 3] = 255; }
      var t = new THREE.DataTexture(out, Sz, Sz, THREE.RGBAFormat);
      t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      H.wMaskTex = t;
    })();

    // ------------------------------------------------ dynamic disturbance map
    var D = H.Dist = { size: 512 };
    D.canvas = document.createElement('canvas'); D.canvas.width = D.canvas.height = D.size;
    D.ctx = D.canvas.getContext('2d');
    D.tex = new THREE.CanvasTexture(D.canvas);
    D.tex.minFilter = D.tex.magFilter = THREE.LinearFilter; D.tex.generateMipmaps = false; D.tex.flipY = false;
    D.k = D.size / (HALF * 2);
    D.px = function (v) { return (v + HALF) * D.k; };
    D.begin = function () {
      var c = D.ctx; c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, D.size, D.size);
      c.globalCompositeOperation = 'lighter';
      // world units -> pixels
      c.setTransform(D.k, 0, 0, D.k, HALF * D.k, HALF * D.k);
    };
    D.end = function () { D.tex.needsUpdate = true; };
    D.begin(); D.end();
    U.uDist.value = D.tex;

    // ------------------------------------------------ surface
    var mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.onBeforeCompile = function (sh) {
      ['uTime', 'uCloud', 'uSunK', 'uGust', 'uBreeze', 'uRain', 'uReflW', 'uReflWMat', 'uDist', 'uSunDirW'].forEach(function (n) { sh.uniforms[n] = U[n]; });
      sh.uniforms.uWMask = { value: H.wMaskTex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      var fs = sh.fragmentShader;
      fs = fs.replace('#include <common>', ['#include <common>', 'varying vec3 vWPos;',
        'uniform sampler2D uReflW; uniform mat4 uReflWMat; uniform sampler2D uDist; uniform sampler2D uWMask; uniform float uRain; uniform vec3 uSunDirW;',
        H.GLSL.common, H.GLSL.rings, S_GLSL].join('\n'));
      fs = fs.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
      fs = fs.replace(/vec3 outgoingLight = [^;]+;/, [
        'vec2 p = vWPos.xz; float t = uTime;',
        'vec3 Vw = normalize(cameraPosition - vWPos);',
        'float shd = getShadowMask();',
        'float cK = cloudSun(p);',
        'vec2 muv = p / ' + (HALF * 2).toFixed(1) + ' + 0.5;',
        'vec4 wm = texture2D(uWMask, muv);',
        'vec4 ds = texture2D(uDist, muv);',
        'vec3 outgoingLight; float alpha;',
        'if (!gl_FrontFacing) {',
        // seen from below (through the section panes)
        '  float w = fbm2(p * vec2(0.5, 1.2) + vec2(t * 0.08, -t * 0.06));',
        '  outgoingLight = mix(S(150.0, 222.0, 214.0), S(214.0, 244.0, 236.0), step(0.52, w)); alpha = 0.34 + step(0.52, w) * 0.10;',
        '} else {',
        // wave fields
        '  float w1 = fbm2(p * vec2(0.20, 0.46) + vec2(t * 0.045, t * 0.10));',
        '  float w2 = fbm2(p * vec2(0.50, 1.30) + vec2(-t * 0.085, t * 0.06) + 13.0);',
        '  float w3 = vnoise(p * vec2(1.25, 3.1) + vec2(t * 0.19, -t * 0.15));',
        '  float gust = ds.b;',
        // posterized shard displacement : the reflection breaks into flat blocks that drift and regroup
        '  float brk = 0.62 + 0.38 * sin(t * 0.37 + w1 * 6.0) + gust * 1.2 + ds.g * 1.5;',
        '  float q1 = floor((w1 * 0.7 + w2 * 0.5) * 6.0) / 6.0;',
        '  float q2 = floor(w3 * 3.0 + 0.5) / 3.0;',
        '  vec2 disp = vec2((q1 - 0.5) * 2.6, (q2 - 0.5) * 0.9) * brk;',
        '  vec4 rc = uReflWMat * vec4(vWPos.x + disp.x, 0.0, vWPos.z + disp.y, 1.0);',
        '  vec4 refl = texture2D(uReflW, rc.xy / rc.w);',
        '  float lum = dot(refl.rgb, vec3(0.30, 0.59, 0.11));',
        '  vec3 blockC = lum > 0.60 ? S(246.0, 252.0, 249.0) : (lum > 0.30 ? S(84.0, 180.0, 174.0) : S(52.0, 114.0, 154.0));',
        '  float isObj = step(0.5, refl.a);',
        // base water : three flat aqua tones following slow swell shapes
        '  float sw = fbm2(p * vec2(0.085, 0.24) + vec2(t * 0.028, -t * 0.04)) + (w2 - 0.5) * 0.22;',
        '  vec3 base = sw > 0.585 ? S(176.0, 229.0, 221.0) : (sw > 0.455 ? S(138.0, 211.0, 207.0) : S(104.0, 191.0, 194.0));',
        '  float shallow = step(0.30, wm.g + (w2 - 0.5) * 0.12);',
        '  base = mix(base, base * vec3(1.06, 1.06, 0.98) + vec3(0.02, 0.04, 0.02), shallow * 0.45);',
        // deep-teal shadows of hulls and quay walls
        '  float shK = 1.0 - smoothstep(0.38, 0.52, shd);',
        '  vec3 shadeC = sw > 0.52 ? S(56.0, 137.0, 148.0) : S(41.0, 118.0, 133.0);',
        '  base = mix(base, shadeC, shK);',
        '  base = mix(base, base * vec3(0.84, 0.90, 0.93), (1.0 - cK) * 0.55);',
        // thin drifting contour strokes
        '  float cl = abs(fract(sw * 9.0 + w3 * 0.25) - 0.5);',
        '  float stroke = (1.0 - smoothstep(0.012, 0.035, cl)) * step(0.50, vnoise(p * vec2(0.5, 1.6) + t * 0.05 + 3.0));',
        '  base = mix(base, base * 1.10 + 0.05, stroke * (1.0 - shK * 0.5));',
        '  vec3 col = mix(base, blockC, isObj);',
        '  alpha = mix(0.66, 0.93, isObj); alpha = max(alpha, shK * 0.84);',
        '  float fres = pow(1.0 - max(Vw.y, 0.0), 3.0); alpha = min(1.0, alpha + fres * 0.30);',
        // gust : a band of fine dark ripples marching with the wind
        '  vec2 gu = vec2(dot(p, uGust.zw), dot(p, vec2(-uGust.w, uGust.z)));',
        '  float gr = step(0.50, vnoise(vec2(gu.x * 5.2 - t * 6.0, gu.y * 0.62)));',
        '  float gr2 = step(0.60, vnoise(vec2(gu.x * 10.5 - t * 9.0, gu.y * 1.5 + 3.0)));',
        '  float gk = smoothstep(0.02, 0.30, gust);',
        '  col = mix(col, S(98.0, 176.0, 184.0), gr * gk * 0.62 * (1.0 - isObj * 0.6));',
        '  col = mix(col, S(66.0, 148.0, 164.0), gr2 * gk * 0.40 * (1.0 - isObj * 0.6));',
        '  col = mix(col, S(228.0, 248.0, 245.0), step(0.86, vnoise(vec2(gu.x * 7.0 - t * 8.0, gu.y * 1.2) + 9.0)) * gk * 0.6);',
        '  float gEdge = smoothstep(0.84, 0.90, gust) * step(0.48, vnoise(vec2(gu.y * 2.6, t * 0.9)));',
        '  col = mix(col, S(236.0, 250.0, 247.0), gEdge * 0.38); alpha = max(alpha, gk * 0.8);',
        // rain rings
        '  float rr = rainRings(p * 1.25, t, 0.22 + uRain * 0.70);',
        '  col = mix(col, S(236.0, 251.0, 248.0), rr * 0.78); alpha = max(alpha, rr * 0.9);',
        // sparkles : flat little diamonds in drifting patches
        '  vec2 sc = vec2(gu.y * 1.9, gu.x * 4.4); vec2 ci = floor(sc); vec2 cf = fract(sc);',
        '  float hs = hash21(ci);',
        '  float tw = sin(t * (1.6 + hs * 2.6) + hs * 40.0);',
        '  float zone = smoothstep(0.50, 0.62, fbm2(p * 0.15 + vec2(t * 0.035, t * 0.02) + 5.0));',
        '  float dm = abs(cf.x - 0.5) * 1.1 + abs(cf.y - 0.5) * 2.4;',
        '  float spk = step(0.72, tw) * step(0.66, hs) * zone * step(dm, 0.36 + 0.2 * tw);',
        '  col = mix(col, vec3(1.0, 0.975, 0.86), spk * cK * (1.0 - shK)); alpha = max(alpha, spk * cK * (1.0 - shK));',
        // foam : shoreline lapping + wake
        '  float lap = sin(t * 0.8 + p.x * 0.45 + p.y * 0.3) * 0.035;',
        '  float fn = (vnoise(p * 2.3 + vec2(t * 0.25, -t * 0.2)) - 0.5);',
        '  float sf = wm.r + fn * 0.20 + lap;',
        '  float foam = smoothstep(0.405, 0.42, sf);',
        '  float foam2 = smoothstep(0.25, 0.262, sf) * (1.0 - smoothstep(0.278, 0.29, sf)) * step(0.08, fn);',
        '  float slap = smoothstep(0.10, 0.16, ds.g * wm.r * 2.4 + fn * 0.05 * step(0.02, ds.g * wm.r));',
        '  float wk = smoothstep(0.42, 0.47, ds.r + fn * 0.55 * step(0.03, ds.r));',
        '  float wl = smoothstep(0.30, 0.36, ds.g + fn * 0.35 * step(0.03, ds.g));',
        '  float fo = max(max(foam, foam2 * 0.8), max(max(wk, wl * 0.75), slap));',
        '  vec3 foamC = mix(S(250.0, 254.0, 252.0), S(196.0, 232.0, 232.0), shK * 0.75);',
        '  col = mix(col, foamC, fo); alpha = max(alpha, fo * 0.96);',
        '  outgoingLight = col;',
        '}',
        'diffuseColor.a = alpha;'
      ].join('\n'));
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = function () { return 'harbourWater'; };

    function surfRect(x0, z0, x1, z1) {
      var g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, L.WATER_Y, (z0 + z1) / 2);
      var m = new THREE.Mesh(g, mat);
      m.layers.set(1); m.receiveShadow = true; m.renderOrder = 10; m.name = 'water';
      scene.add(m); return m;
    }
    H.waterMeshes = [surfRect(-HALF, -HALF, L.HILL_X, L.ARM_Z), surfRect(-HALF, L.ARM_Z, L.ARM_X, L.FRONT_Z)];

    // ------------------------------------------------ translucent section panes on the cut faces
    var paneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uCloud: U.uCloud, uSunK: U.uSunK, uGust: U.uGust, uBreeze: U.uBreeze },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'varying vec3 vW;', H.GLSL.common, S_GLSL,
        'void main(){',
        '  float a = abs(vW.x) > abs(vW.z) ? vW.z : vW.x;',
        '  float d = clamp(-vW.y / 5.2, 0.0, 1.0);',
        '  float wob = (vnoise(vec2(a * 0.35 + uTime * 0.05, vW.y * 0.8)) - 0.5) * 0.16;',
        '  float dd = d + wob;',
        '  vec3 col = dd < 0.26 ? S(160.0, 226.0, 216.0) : (dd < 0.62 ? S(112.0, 198.0, 198.0) : S(72.0, 162.0, 174.0));',
        '  float alpha = dd < 0.26 ? 0.20 : (dd < 0.62 ? 0.27 : 0.35);',
        // slanted light shafts under the surface
        '  float cK = cloudSun(vec2(vW.x, vW.z));',
        '  float sx = a + vW.y * 0.55;',
        '  float sh = step(0.74, vnoise(vec2(sx * 0.42 + uTime * 0.03, 1.0))) * (1.0 - d) * cK;',
        '  col = mix(col, S(226.0, 250.0, 240.0), sh * 0.5); alpha += sh * 0.05;',
        // bright meniscus line at the surface
        '  float top = smoothstep(-0.085, -0.035, vW.y + sin(a * 1.3 + uTime * 0.9) * 0.012);',
        '  col = mix(col, S(244.0, 253.0, 250.0), top); alpha = mix(alpha, 0.9, top);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n')
    });
    function pane(a0, a1, fixed, axis) {
      var len = a1 - a0, hgt = 5.9;
      var g = new THREE.PlaneGeometry(len, hgt);
      if (axis === 'z') { g.rotateY(Math.PI / 2); g.translate(fixed, -hgt / 2, (a0 + a1) / 2); }
      else g.translate((a0 + a1) / 2, -hgt / 2, fixed);
      var m = new THREE.Mesh(g, paneMat); m.layers.set(1); m.renderOrder = 12; m.name = 'pane'; scene.add(m);
      return m;
    }
    pane(-HALF, L.FRONT_Z, -HALF + 0.012, 'z');
    pane(-HALF, L.HILL_X, -HALF + 0.012, 'x');
  };
})();
