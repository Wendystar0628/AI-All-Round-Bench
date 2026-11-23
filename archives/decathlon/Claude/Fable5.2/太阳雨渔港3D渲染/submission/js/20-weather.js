/* sky, sun-rain streaks, light shafts, caustic reflections, sea mist, rainbow, drips */
(function () {
  'use strict';
  var H = window.H, G = H.G, U = H.U, L = H.L;
  var QY = L.QUAY_Y, HALF = L.HALF;

  // global weather state driven by the director (22-events.js)
  H.state = { rain: 0.5, rainbow: 0, dark: 0, lighthouse: 0, sunVis: 1, skyShift: 0 };

  // sky light shafts: ground point (x,z), radius, strength
  var SKY_SHAFTS = [[-13.5, 17.5, 3.0, 1.0], [5.0, 1.5, 3.6, 0.85], [-21.0, -7.0, 3.2, 0.8], [19.0, 21.5, 2.6, 0.75], [-3.0, -21.5, 3.4, 0.7]];
  H.SKY_SHAFTS = SKY_SHAFTS;
  var shaftU = { value: SKY_SHAFTS.map(function (s) { return new THREE.Vector4(s[0], s[1], s[2], s[3]); }) };
  U.uShafts = shaftU;
  var SHAFT_GLSL = [
    'uniform vec4 uShafts[5]; uniform vec3 uSunDirW;',
    'float inShaft(vec3 p){',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 5; i++) {',
    '    vec3 g = vec3(uShafts[i].x, 0.0, uShafts[i].y);',
    '    vec3 d = p - g; vec3 perp = d - dot(d, uSunDirW) * uSunDirW;',
    '    float r = length(perp);',
    '    acc = max(acc, (1.0 - smoothstep(uShafts[i].z * 0.72, uShafts[i].z, r)) * uShafts[i].w * cloudSun(g.xz));',
    '  }',
    '  return acc;',
    '}'
  ].join('\n');

  // ground / water level under a point (for drips and rain cut-off)
  H.groundY = function (x, z) {
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) return -8;
    var S = L.SLIP;
    if (x > S.x0 && x < S.x1 && z < S.zTop && z > 11.3) return Math.max(0, H.slipY(z));
    if (z >= L.FRONT_Z) return QY;
    if (x >= L.ARM_X && z >= L.ARM_Z) return QY;
    if (x >= L.HILL_X && z < L.ARM_Z) return H.hillY ? H.hillY(x, z) : QY;
    if (x > L.BW.x0 && x < L.BW.x1 && z > L.BW.z0 && z < L.BW.z1) return L.BW.top;
    if (x > L.STEPS.x0 && x < L.STEPS.x1 && z > 6.6) { var i = Math.floor((L.FRONT_Z - z) / 0.6); return Math.max(0, QY - 0.2 * (i + 1)); }
    if (x > L.PLAT.x0 && x < L.PLAT.x1 && z > L.PLAT.z0) return L.PLAT.y;
    return 0;
  };

  H.buildWeather = function (scene) {
    var i;
    // =================================================================== sky dome
    var skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { uTime: U.uTime, uSunDirW: U.uSunDirW, uSunVis: { value: 1 }, uDark: { value: 0 }, uCloudPass: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }',
      fragmentShader: [
        'varying vec3 vDir; uniform float uTime, uSunVis, uDark, uCloudPass; uniform vec3 uSunDirW;',
        'float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fbm(vec2 p){ return vnoise(p) * 0.5 + vnoise(p * 2.1 + 3.0) * 0.28 + vnoise(p * 4.3 + 7.0) * 0.14 + vnoise(p * 8.7) * 0.08; }',
        'vec3 S(float r, float g, float b){ return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float up = d.y;',
        '  vec3 zen = S(168.0, 219.0, 234.0), hor = S(228.0, 245.0, 242.0), low = S(223.0, 241.0, 241.0);',
        '  vec3 col = mix(hor, zen, smoothstep(0.0, 0.75, up));',
        '  col = mix(low, col, smoothstep(-0.12, 0.06, up));',
        // thin veils of cloud, flat-toned with soft stepped edges
        '  vec2 cp = d.xz / (max(up, 0.0) + 0.42);',
        '  float c1 = fbm(cp * 1.25 + vec2(uTime * 0.006, uTime * 0.003));',
        '  float c2 = fbm(cp * vec2(0.6, 1.9) + vec2(-uTime * 0.004, 5.0));',
        '  float cl = c1 * 0.65 + c2 * 0.45 + uCloudPass * 0.10 + uDark * 0.22;',
        '  float veil = smoothstep(0.47, 0.51, cl) * 0.40 + smoothstep(0.57, 0.60, cl) * 0.30 + smoothstep(0.66, 0.68, cl) * 0.22;',
        '  veil *= smoothstep(-0.02, 0.22, up);',
        '  vec3 cloudC = mix(S(250.0, 253.0, 251.0), S(214.0, 228.0, 234.0), uDark * 0.9);',
        '  col = mix(col, cloudC, veil);',
        // sun: warm disc + two flat halos, dimmed when a cloud passes
        '  float sd = dot(d, normalize(uSunDirW));',
        '  float vis = uSunVis;',
        '  col = mix(col, S(255.0, 250.0, 232.0), smoothstep(0.90, 0.905, sd) * 0.30 * vis);',
        '  col = mix(col, S(255.0, 248.0, 222.0), smoothstep(0.972, 0.976, sd) * 0.50 * vis);',
        '  col = mix(col, S(255.0, 253.0, 244.0), smoothstep(0.9930, 0.9945, sd) * (0.35 + 0.65 * vis));',
        '  col = mix(col, col * vec3(0.80, 0.86, 0.90), uDark * 0.85);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat);
    sky.layers.set(1); sky.frustumCulled = false; sky.renderOrder = -100; sky.name = 'sky';
    scene.add(sky);

    // soft contact shadow of the model on the display table
    var tableMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vP;',
        'void main(){ vec2 q = max(abs(vP + vec2(1.6, -2.2)) - vec2(31.5), 0.0); float d = length(q);',
        '  float a = (1.0 - smoothstep(0.0, 13.0, d)); a = a * a * 0.34;',
        '  gl_FragColor = vec4(0.13, 0.33, 0.42, a); }'
      ].join('\n')
    });
    var tg = new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2).translate(0, L.SLAB_Y - 0.96, 0);
    var table = new THREE.Mesh(tg, tableMat); table.layers.set(1); table.renderOrder = -50; scene.add(table);

    // =================================================================== rain streaks
    var NR = 11000;
    var rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    rg.setIndex([0, 1, 2, 0, 2, 3]);
    var seeds = new Float32Array(NR * 4), rr = H.mulberry(777);
    for (i = 0; i < NR * 4; i++) seeds[i] = rr();
    rg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    rg.instanceCount = NR;
    var wb = H.WAREHOUSE, wr = H.WAITROOM;
    var rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uCloud: U.uCloud, uSunK: U.uSunK, uGust: U.uGust, uBreeze: U.uBreeze, uRain: U.uRain, uShafts: shaftU, uSunDirW: U.uSunDirW, uPix: { value: 0.001 } },
      vertexShader: [
        'attribute vec4 aSeed; uniform float uRain, uPix;',
        'varying float vA; varying float vT; varying float vGold;',
        H.GLSL.common, SHAFT_GLSL,
        'void main(){',
        '  float speed = 15.0 + aSeed.w * 7.0;',
        '  float span = 30.0;',
        '  float tt = uTime * speed / span + aSeed.z * 13.0;',
        '  float cyc = floor(tt), f = fract(tt);',
        '  vec2 xz = (hash22(aSeed.xy * 37.0 + cyc * 0.371) - 0.5) * 92.0;',
        '  float w = windAt(xz);',
        '  vec2 hv = uGust.zw * (1.5 + w * 6.5);',
        '  float fallT = f * span / speed;',
        '  vec3 p = vec3(xz.x + hv.x * fallT, 28.5 - f * span, xz.y + hv.y * fallT);',
        '  vec3 vel = normalize(vec3(hv.x, -speed, hv.y));',
        '  float len = 0.50 + aSeed.w * 0.45;',
        // hide drops that are switched off by the density, below the ground / water, or under a roof
        '  float on = step(aSeed.x, 0.30 + uRain * 0.70);',
        '  float inX = step(abs(p.x), 32.0) * step(abs(p.z), 32.0);',
        '  float land = max(step(12.0, p.z), step(14.0, p.x) * step(-14.0, p.z));',
        '  float gy = mix(-7.5, mix(0.0, 1.6, land), inX);',
        '  on *= step(gy + 0.05, p.y);',
        '  on *= 1.0 - step(' + wb.x0.toFixed(1) + ', p.x) * step(p.x, ' + (wb.x1 + 0.6).toFixed(1) + ') * step(' + (wb.z0 - 0.6).toFixed(1) + ', p.z) * step(p.z, ' + (wb.z1 + 0.6).toFixed(1) + ') * step(p.y, ' + (wb.ey + 0.6).toFixed(1) + ');',
        '  on *= 1.0 - step(' + (wr.x0 - 1.3).toFixed(1) + ', p.x) * step(p.x, ' + (wr.x1 + 0.3).toFixed(1) + ') * step(' + (wr.z0 - 0.3).toFixed(1) + ', p.z) * step(p.z, ' + (wr.z1 + 1.3).toFixed(1) + ') * step(p.y, ' + (wr.y + wr.h + 0.2).toFixed(1) + ');',
        '  vec3 toCam = cameraPosition - p; float dist = length(toCam);',
        '  vec3 side = normalize(cross(vel, toCam / dist));',
        '  float wid = max(0.011, dist * uPix * 1.05);',
        '  vec3 wp = p - vel * (position.y * len) + side * (position.x * wid);',
        '  float sh = inShaft(p);',
        '  float cK = cloudSun(p.xz);',
        '  vGold = sh; vT = position.y;',
        '  vA = on * (0.26 + 0.20 * aSeed.y) * (0.55 + 0.45 * cK) + on * sh * 0.5;',
        '  vA *= smoothstep(1.2, 4.0, dist);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
        '  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vA; varying float vT; varying float vGold;',
        'void main(){',
        '  float fade = smoothstep(1.0, 0.25, vT);',                 // bright head, fading tail
        '  vec3 col = mix(vec3(0.97, 0.98, 0.94), vec3(1.0, 0.92, 0.66), 0.42 + vGold * 0.58);',
        '  gl_FragColor = vec4(col, vA * (0.35 + 0.65 * fade));',
        '}'
      ].join('\n')
    });
    var rain = new THREE.Mesh(rg, rainMat); rain.layers.set(1); rain.frustumCulled = false; rain.renderOrder = 40; rain.name = 'rain';
    scene.add(rain);

    // =================================================================== sky shafts (soft ribbons from cloud gaps)
    var sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    var sdat = new Float32Array(SKY_SHAFTS.length * 4);
    SKY_SHAFTS.forEach(function (s, k) { sdat.set(s, k * 4); });
    var shaftAttr = new THREE.InstancedBufferAttribute(sdat, 4);
    sg.setAttribute('aShaft', shaftAttr);
    sg.instanceCount = SKY_SHAFTS.length;
    var skyShaftMat = H.makeAdd({ uSunDirW: U.uSunDirW }, [
      'attribute vec4 aShaft; uniform vec3 uSunDirW; varying vec2 vQ; varying float vK; varying float vDist;',
      H.GLSL.common,
      'void main(){',
      '  vec3 g = vec3(aShaft.x, -1.0, aShaft.y);',
      '  vec3 p = g + uSunDirW * (position.y * 46.0);',
      '  vec3 toCam = normalize(cameraPosition - p);',
      '  vec3 side = normalize(cross(uSunDirW, toCam));',
      '  vec3 wp = p + side * (position.x * aShaft.z * (1.12 - position.y * 0.35));',
      '  vQ = vec2(position.x, position.y);',
      '  float axial = abs(dot(normalize(cameraPosition - g), uSunDirW));',
      '  vK = aShaft.w * cloudSun(g.xz) * (1.0 - 0.9 * axial * axial);',
      '  vDist = distance(cameraPosition, wp);',
      '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
      '}'
    ].join('\n'), [
      'varying vec2 vQ; varying float vK; varying float vDist; uniform float uTime;',
      'void main(){',
      '  float x = abs(vQ.x);',
      '  float band = (1.0 - smoothstep(0.55, 0.60, x)) * 0.6 + (1.0 - smoothstep(0.86, 0.92, x)) * 0.4;',      // two flat steps
      '  float streak = 0.82 + 0.18 * step(0.5, fract(vQ.x * 3.5 + 0.3 * sin(uTime * 0.2)));',
      '  float along = smoothstep(0.0, 0.07, vQ.y) * (1.0 - smoothstep(0.14, 0.85, vQ.y) * 0.9);',
      '  float a = band * streak * along * vK * 0.50 * mix(0.38, 1.0, smoothstep(14.0, 70.0, vDist));',
      '  gl_FragColor = vec4(vec3(1.0, 0.86, 0.46), a);',
      '}'
    ].join('\n'), { blending: THREE.NormalBlending });
    var skyShafts = new THREE.Mesh(sg, skyShaftMat); skyShafts.layers.set(1); skyShafts.frustumCulled = false; skyShafts.renderOrder = 30;
    scene.add(skyShafts);

    // =================================================================== interior shafts (prisms from window quads to the floor)
    var prismMat = H.makeAdd({}, [
      'attribute float aAlong; attribute float aK; varying float vAlong; varying float vK; varying vec3 vW;',
      H.GLSL.common,
      'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vAlong = aAlong; vK = aK * cloudSun(w.xz); gl_Position = projectionMatrix * viewMatrix * w; }'
    ].join('\n'), [
      'varying float vAlong; varying float vK; varying vec3 vW; uniform float uTime;',
      'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
      'void main(){',
      '  float a = (0.23 - vAlong * 0.10) * vK;',
      '  float dust = 0.0;',
      '  gl_FragColor = vec4(vec3(1.0, 0.905, 0.62), min(0.6, a * 0.7));',
      '}'
    ].join('\n'), { blending: THREE.NormalBlending });
    function prismGeom(list, sunDir) {
      var pos = [], along = [], kk = [], idx = [], base = 0;
      list.forEach(function (s) {
        var ends = s.p.map(function (c) {
          var t = (c[1] - s.floor) / sunDir.y;
          return [c[0] - sunDir.x * t, s.floor + 0.01, c[2] - sunDir.z * t];
        });
        for (var e = 0; e < 4; e++) {
          var a = s.p[e], b = s.p[(e + 1) % 4], c = ends[(e + 1) % 4], d = ends[e];
          pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
          along.push(0, 0, 1, 1); kk.push(s.k, s.k, s.k, s.k);
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3); base += 4;
        }
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(along), 1));
      g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(kk), 1));
      g.setIndex(idx);
      return g;
    }
    var prism = new THREE.Mesh(prismGeom(H.SHAFTS, H.SUN), prismMat); prism.layers.set(1); prism.renderOrder = 31; prism.frustumCulled = false;
    scene.add(prism);
    // wheelhouse windows: shafts built in boat space for the moored heading
    (H.BOATS || []).forEach(function (bt) {
      var cb = bt.info.cabin; if (!cb) return;
      var ls = H.SUN.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -bt.berth.ry);   // sun dir in boat space
      var sill = 0.84, top = sill + 0.72, hw = cb.w / 2, hl = cb.l / 2, list = [];
      // side that faces the sun, and the windscreen / aft glass if lit
      var sx = ls.x > 0 ? 1 : -1;
      if (Math.abs(ls.x) > 0.2) [[-hl + 0.1, -0.05], [0.05, hl - 0.1]].forEach(function (zz) {
        list.push({ p: [[sx * (hw - 0.06), cb.y + sill + 0.04, cb.z + zz[0]], [sx * (hw - 0.06), cb.y + sill + 0.04, cb.z + zz[1]], [sx * (hw - 0.06), cb.y + top, cb.z + zz[1]], [sx * (hw - 0.06), cb.y + top, cb.z + zz[0]]], floor: cb.y + 0.04, k: 0.22 });
      });
      if (ls.z > 0.2) list.push({ p: [[-hw + 0.1, cb.y + sill + 0.04, cb.z + hl - 0.06], [hw - 0.1, cb.y + sill + 0.04, cb.z + hl - 0.06], [hw - 0.1, cb.y + top, cb.z + hl - 0.06], [-hw + 0.1, cb.y + top, cb.z + hl - 0.06]], floor: cb.y + 0.04, k: 0.22 });
      if (!list.length) return;
      var m = new THREE.Mesh(prismGeom(list, ls), prismMat); m.layers.set(1); m.renderOrder = 31; m.frustumCulled = false;
      bt.inner.add(m); bt.shafts = m;
    });

    // =================================================================== caustic light (ceilings of warehouse / waiting room / wheelhouses)
    var cauMat = H.makeAdd({}, [
      'attribute float aK; attribute vec2 aS; varying vec2 vUv; varying float vK; varying vec2 vP;',
      H.GLSL.common,
      'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vUv = uv; vP = uv * aS; vK = aK * cloudSun(w.xz); gl_Position = projectionMatrix * viewMatrix * w; }'
    ].join('\n'), [
      'varying vec2 vUv; varying float vK; varying vec2 vP; uniform float uTime;',
      H.GLSL.caustic,
      'void main(){',
      '  vec2 p = vP * 1.25;',
      '  float c = causticNet(p, uTime * 0.85);',
      '  float c2 = causticNet(p * 0.63 + 4.0, uTime * 0.6 + 2.0);',
      '  float v = step(0.5, c) * 0.62 + step(0.5, c2) * 0.38;',
      '  vec2 e = min(vUv, 1.0 - vUv); float edge = smoothstep(0.0, 0.16, e.x) * smoothstep(0.0, 0.16, e.y);',
      '  float a = v * edge * vK * 0.55;',
      '  gl_FragColor = vec4(vec3(1.0, 0.985, 0.90), a);',
      '}'
    ].join('\n'), { blending: THREE.NormalBlending });
    function causticGeom(list) {
      var pos = [], uv = [], kk = [], ss = [], idx = [], base = 0;
      list.forEach(function (c) {
        var p = c.p, sc = c.s || 1;
        var lu = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]), lv = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
        pos.push.apply(pos, p[0].concat(p[1], p[2], p[3]));
        uv.push(0, 0, 1, 0, 1, 1, 0, 1); kk.push(c.k, c.k, c.k, c.k); ss.push(lu, lv, lu, lv, lu, lv, lu, lv);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3); base += 4;
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(ss), 2));
      g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(kk), 1));
      g.setIndex(idx);
      return g;
    }
    var cau = new THREE.Mesh(causticGeom(H.CAUSTICS), cauMat); cau.layers.set(1); cau.renderOrder = 32; cau.frustumCulled = false;
    scene.add(cau);
    (H.BOATS || []).forEach(function (bt) {
      var cb = bt.info.cabin; if (!cb) return;
      var y = cb.y + 0.84 + 0.78 - 0.02, hw = cb.w / 2 - 0.07, hl = cb.l / 2 - 0.07;
      var list = [{ p: [[-hw, y, cb.z - hl], [hw, y, cb.z - hl], [hw, y, cb.z + hl], [-hw, y, cb.z + hl]], k: 1.15 }];
      // a little on the upper inside of the aft wall too
      list.push({ p: [[-hw, cb.y + 1.0, cb.z - hl + 0.02], [0.1, cb.y + 1.0, cb.z - hl + 0.02], [0.1, y, cb.z - hl + 0.02], [-hw, y, cb.z - hl + 0.02]], k: 0.5 });
      var m = new THREE.Mesh(causticGeom(list), cauMat); m.layers.set(1); m.renderOrder = 32; m.frustumCulled = false;
      bt.inner.add(m);
    });
    // light reflected off the water onto the quay wall above the waterline
    var wallCau = [];
    wallCau.push({ p: [[L.STEPS.x1 + 5.4, 0.05, L.FRONT_Z - 0.09], [L.ARM_X - 0.2, 0.05, L.FRONT_Z - 0.09], [L.ARM_X - 0.2, 1.3, L.FRONT_Z - 0.09], [L.STEPS.x1 + 5.4, 1.3, L.FRONT_Z - 0.09]], k: 0.45 });
    wallCau.push({ p: [[L.ARM_X - 0.09, 0.05, L.FRONT_Z - 0.2], [L.ARM_X - 0.09, 0.05, L.BW.z1 + 0.2], [L.ARM_X - 0.09, 1.3, L.BW.z1 + 0.2], [L.ARM_X - 0.09, 1.3, L.FRONT_Z - 0.2]], k: 0.55 });
    var wc = new THREE.Mesh(causticGeom(wallCau), cauMat); wc.layers.set(1); wc.renderOrder = 32; scene.add(wc);

    // =================================================================== sea mist: flat, stepped veils drifting over the far water
    var mistMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uSeed: { value: 0 }, uK: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime, uSeed, uK;',
        'float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'void main(){',
        '  vec2 p = vec2(vUv.x * 5.0 + uSeed * 7.3 - uTime * 0.022 * (0.6 + fract(uSeed * 3.7)), vUv.y * 1.5 + uSeed);',
        '  float n = vnoise(p) * 0.6 + vnoise(p * 2.3 + 2.0) * 0.4;',
        '  float body = sin(vUv.y * 3.1416);',
        '  float ends = smoothstep(0.0, 0.2, vUv.x) * smoothstep(0.0, 0.2, 1.0 - vUv.x);',
        '  float v = n * body * ends;',
        '  float a = smoothstep(0.30, 0.33, v) * 0.20 + smoothstep(0.42, 0.45, v) * 0.18 + smoothstep(0.54, 0.57, v) * 0.14;',
        '  gl_FragColor = vec4(0.905, 0.955, 0.955, a * uK);',
        '}'
      ].join('\n')
    });
    var mists = [];
    var mdef = [[-18, 1.3, -26.6, 20, 2.6, 0.9], [-4, 1.7, -29.2, 24, 3.0, 1.0], [-22, 1.0, -30.6, 18, 2.2, 1.0], [4, 1.1, -24.6, 14, 2.0, 0.7], [-12, 2.3, -31.4, 30, 3.4, 0.9], [-28, 0.9, -23.0, 10, 1.8, 0.6], [-30.0, 1.4, -30.8, 7, 3.2, 1.3], [8.5, 1.4, -30.9, 7, 3.2, 1.3]];
    mdef.forEach(function (d, k) {
      var m = mistMat.clone(); m.uniforms.uTime = U.uTime; m.uniforms.uSeed = { value: k * 0.37 + 0.11 }; m.uniforms.uK = { value: d[5] };
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(d[3], d[4]), m);
      mesh.position.set(d[0], d[1], d[2]); mesh.layers.set(1); mesh.renderOrder = 35 + k * 0.01;
      scene.add(mesh); mists.push({ mesh: mesh, x: d[0], sp: 0.05 + (k % 3) * 0.02, ph: k * 1.7 });
    });

    // =================================================================== rainbow (flat colour bands, very faint)
    var rbMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec2 vP; uniform float uA;',
        'void main(){',
        '  float r = length(vP); float t = (r - 15.0) / 1.9;',
        '  if (t < 0.0 || t > 1.0) discard;',
        '  float k = floor(t * 6.0);',
        '  vec3 col = k < 0.5 ? vec3(0.62, 0.50, 0.86) : (k < 1.5 ? vec3(0.42, 0.66, 0.95) : (k < 2.5 ? vec3(0.45, 0.86, 0.66) : (k < 3.5 ? vec3(0.98, 0.93, 0.50) : (k < 4.5 ? vec3(1.0, 0.72, 0.42) : vec3(0.98, 0.50, 0.48)))));',
        '  float ang = atan(vP.y, abs(vP.x));',
        '  float fadeEnd = smoothstep(0.10, 0.50, ang);',
        '  float edge = smoothstep(0.0, 0.06, t) * smoothstep(0.0, 0.06, 1.0 - t);',
        '  gl_FragColor = vec4(col, uA * fadeEnd * edge);',
        '}'
      ].join('\n')
    });
    var rainbow = new THREE.Mesh(new THREE.RingGeometry(15.0, 16.9, 72, 1, 0, Math.PI), rbMat);
    rainbow.position.set(-5, -2.0, -23.5); rainbow.layers.set(1); rainbow.renderOrder = 28; rainbow.visible = false;
    scene.add(rainbow);

    // =================================================================== drips (drops swelling on an edge, then falling) + tiny splash rings
    var dripGeo = new THREE.SphereGeometry(1, 6, 5);
    var dripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.0, 0.965, 0.84), toneMapped: false });
    var MAXD = 96;
    var drips = new THREE.InstancedMesh(dripGeo, dripMat, MAXD); drips.layers.set(1); drips.frustumCulled = false; drips.renderOrder = 41;
    scene.add(drips);
    var ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float aLife; varying float vL; varying vec2 vUv; void main(){ vUv = uv; vL = aLife; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vL; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = (1.0 - smoothstep(0.0, 0.10, abs(r - 0.8))) ; gl_FragColor = vec4(1.0, 0.99, 0.94, ring * (1.0 - vL) * 0.8); }'
    });
    var ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    var lifeAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAXD), 1);
    ringGeo.setAttribute('aLife', lifeAttr);
    var rings = new THREE.InstancedMesh(ringGeo, ringMat, MAXD); rings.layers.set(1); rings.frustumCulled = false; rings.renderOrder = 15;
    scene.add(rings);
    // sources: static world points + boat-local points
    var src = [];
    H.DRIPS.forEach(function (d, k) { src.push({ x: d.x, y: d.y, z: d.z, rate: d.rate || 0.5, small: d.small, ph: H.hash1(k * 3.3 + 1.7), boat: null, key: d.key }); });
    (H.BOATS || []).forEach(function (bt, bi) {
      (bt.info.drips || []).forEach(function (d, k) { src.push({ local: new THREE.Vector3(d[0], d[1], d[2]), rate: 0.45 + 0.2 * H.hash1(bi * 7 + k), ph: H.hash1(bi * 13.1 + k * 5.7), boat: bt }); });
      // gunwale drips along the hull side
      [0.3, 0.55, 0.75].forEach(function (s, k) {
        var p = bt.info.S.pt(s, 3);
        src.push({ local: new THREE.Vector3((k % 2 ? 1 : -1) * (p[0] + 0.05), p[1] - 0.02, p[2]), rate: 0.35 + 0.15 * H.hash1(bi + k), ph: H.hash1(bi * 3.1 + k * 9.7), boat: bt, small: true });
      });
    });
    H.dripSources = src;
    var _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

    // =================================================================== per-frame update
    var sunC = H.Render.sun.color, hemi = H.Render.hemi, base = H.Render;
    H.addSystem({
      reset: function () { },
      update: function (dt, t) {
        var st = H.state;
        U.uRain.value = st.rain;
        skyMat.uniforms.uSunVis.value = st.sunVis; skyMat.uniforms.uDark.value = st.dark;
        // darker spell: cooler, dimmer light (still daytime)
        var dk = st.dark;
        U.uSunK.value = 1 - dk * 0.72; H.cloudState.sunK = U.uSunK.value;
        hemi.color.copy(base.baseHemi).multiplyScalar(1 - dk * 0.22); hemi.groundColor.copy(base.baseHemiG).multiplyScalar(1 - dk * 0.22);
      },
      present: function (t) {
        var cam = H.camera, k, i;
        rainMat.uniforms.uPix.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(200, H.U.uRes.value.y);
        // sky shafts drift slowly with the clouds
        for (i = 0; i < SKY_SHAFTS.length; i++) {
          var s = SKY_SHAFTS[i], v = shaftU.value[i];
          var dx = Math.sin(t * 0.021 + i * 1.9) * 2.6, dz = Math.cos(t * 0.017 + i * 2.7) * 2.0;
          v.set(s[0] + dx, s[1] + dz, s[2] * (0.9 + 0.1 * Math.sin(t * 0.05 + i)), s[3] * (0.72 + 0.28 * Math.sin(t * 0.043 + i * 2.2)));
          sdat[i * 4] = v.x; sdat[i * 4 + 1] = v.y; sdat[i * 4 + 2] = v.z; sdat[i * 4 + 3] = v.w;
        }
        shaftAttr.needsUpdate = true;
        // mist veils face the camera around the vertical axis and drift sideways
        for (i = 0; i < mists.length; i++) {
          var m = mists[i];
          m.mesh.position.x = m.x + Math.sin(t * m.sp * 0.25 + m.ph) * 2.2;
          m.mesh.rotation.y = Math.atan2(cam.position.x - m.mesh.position.x, cam.position.z - m.mesh.position.z);
        }
        // rainbow
        var ra = H.state.rainbow;
        rainbow.visible = ra > 0.004;
        if (rainbow.visible) {
          rbMat.uniforms.uA.value = ra * 0.20;
          rainbow.rotation.y = Math.atan2(cam.position.x - rainbow.position.x, cam.position.z - rainbow.position.z);
        }
        // drips
        var n = 0, rainK = 0.45 + H.state.rain * 0.9;
        for (i = 0; i < src.length && n < MAXD; i++) {
          var d = src[i], px, py, pz;
          if (d.boat) { _v.copy(d.local).applyMatrix4(d.boat.inner.matrixWorld); px = _v.x; py = _v.y; pz = _v.z; }
          else { px = d.x; py = d.y; pz = d.z; }
          var period = (2.4 + d.ph * 2.2) / (d.rate * rainK * 1.6);
          var ph = t / period + d.ph * 9.0, f = ph - Math.floor(ph), tl = f * period;
          var gy = H.groundY(px, pz), hgt = Math.max(0.02, py - gy), fall = Math.sqrt(2 * hgt / 9.0);
          var swell = 0.55, sz = d.small ? 0.016 : 0.024, show = false, life = 1;
          if (tl < swell) { var gk = tl / swell; _s.set(sz * gk, sz * (0.6 + 0.9 * gk), sz * gk); _v.set(px, py - sz * gk * 0.9, pz); show = true; }
          else if (tl < swell + fall) { var tf = tl - swell; _s.set(sz * 0.8, sz * (1.5 + tf * 3.0), sz * 0.8); _v.set(px, py - 4.5 * tf * tf, pz); show = true; }
          else if (tl < swell + fall + 0.5) { life = (tl - swell - fall) / 0.5; }
          if (show) { _m.compose(_v, _q.identity(), _s); } else { _m.makeScale(0, 0, 0); }
          drips.setMatrixAt(n, _m);
          if (life < 1) { var rs = 0.08 + life * (d.small ? 0.34 : 0.5); _v.set(px, gy + 0.012, pz); _s.set(rs, 1, rs); _m.compose(_v, _q.identity(), _s); lifeAttr.array[n] = life; }
          else { _m.makeScale(0, 0, 0); lifeAttr.array[n] = 1; }
          rings.setMatrixAt(n, _m);
          n++;
        }
        drips.count = n; rings.count = n;
        drips.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true; lifeAttr.needsUpdate = true;
      }
    });
  };
})();
