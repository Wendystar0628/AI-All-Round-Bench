/* ============ world: base, quay, water, seabed, shore ============ */
(function () {
  const HB = (window.HB = window.HB || {});
  const C = HB.C, P = HB.P, U = HB.U;

  const W = HB.world = {};

  // water region helpers ---------------------------------------------
  // box A: x[-20,-13] z[-14,8] ; box B: x[-13,6] z[-20,8]
  W.A = { x0: -20, x1: -13, z0: -14, z1: 8 };
  W.B = { x0: -13, x1: 6, z0: -20, z1: 8 };
  W.waterMin = [-20, -20], W.waterMax = [6, 8];

  W.inWater = function (x, z) {
    if (x < -20 || x > 6 || z < -20 || z > 8) return false;
    if (x < -13 && z < -14) return false;   // hill corner
    return true;
  };

  // ---------------------------------------------------------------- foam mask
  function buildFoamMask(tetras, rocks) {
    const MW = 512, MH = 416;
    const px = (x) => (x - W.waterMin[0]) / (W.waterMax[0] - W.waterMin[0]) * MW;
    const pz = (z) => (z - W.waterMin[1]) / (W.waterMax[1] - W.waterMin[1]) * MH;

    // --- depth field ---
    const dcv = document.createElement('canvas'); dcv.width = MW; dcv.height = MH;
    const dctx = dcv.getContext('2d');
    dctx.fillStyle = '#000'; dctx.fillRect(0, 0, MW, MH);
    dctx.fillStyle = '#fff';
    dctx.beginPath();
    dctx.moveTo(px(-20), pz(-14));
    dctx.lineTo(px(-13), pz(-14));
    dctx.lineTo(px(-13), pz(-20));
    dctx.lineTo(px(6), pz(-20));
    dctx.lineTo(px(6), pz(8));
    dctx.lineTo(px(-20), pz(8));
    dctx.closePath(); dctx.fill();
    // blur for distance field
    const bcv = document.createElement('canvas'); bcv.width = MW; bcv.height = MH;
    const bctx = bcv.getContext('2d');
    bctx.filter = 'blur(14px)';
    bctx.drawImage(dcv, 0, 0);
    bctx.filter = 'none';

    // --- foam field ---
    const fcv = document.createElement('canvas'); fcv.width = MW; fcv.height = MH;
    const fctx = fcv.getContext('2d');
    fctx.fillStyle = '#000'; fctx.fillRect(0, 0, MW, MH);
    fctx.lineCap = 'round'; fctx.lineJoin = 'round';
    // shoreline (quay edges + base outer edges)
    fctx.strokeStyle = '#fff'; fctx.shadowColor = '#fff'; fctx.shadowBlur = 16;
    [[[-20, 8], [-13, 8], [-13, -20], [6, -20], [6, 8], [-20, 8]]].forEach(function (loop) {
      fctx.beginPath();
      loop.forEach(function (p, i) { i ? fctx.lineTo(px(p[0]), pz(p[1])) : fctx.moveTo(px(p[0]), pz(p[1])); });
      fctx.closePath();
      fctx.lineWidth = 26; fctx.globalAlpha = .55; fctx.stroke();
      fctx.lineWidth = 12; fctx.globalAlpha = .8; fctx.stroke();
      fctx.lineWidth = 4; fctx.globalAlpha = 1; fctx.stroke();
    });
    fctx.globalAlpha = 1;
    // tetrapod clusters
    tetras.forEach(function (t) {
      const x = px(t[0]), y = pz(t[1]), r = 16 + t[2] * 9;
      const g = fctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.55, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, r, 0, 7); fctx.fill();
    });
    rocks.forEach(function (t) {
      const x = px(t[0]), y = pz(t[1]), r = 10 + t[2] * 7;
      const g = fctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, r, 0, 7); fctx.fill();
    });
    fctx.shadowBlur = 0;
    // open-water crest lines
    fctx.strokeStyle = 'rgba(255,255,255,.5)'; fctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      fctx.globalAlpha = .18 + Math.random() * .2;
      fctx.beginPath();
      const zz = -18 + i * 2.8;
      for (let x = -20; x <= 6; x += 1) {
        const y = pz(zz + Math.sin(x * 0.6 + i) * 0.9);
        x === -20 ? fctx.moveTo(px(x), y) : fctx.lineTo(px(x), y);
      }
      fctx.stroke();
    }
    fctx.globalAlpha = 1;

    // --- merge channels ---
    const out = document.createElement('canvas'); out.width = MW; out.height = MH;
    const octx = out.getContext('2d');
    const fd = fctx.getImageData(0, 0, MW, MH).data;
    const bd = bctx.getImageData(0, 0, MW, MH).data;
    const od = octx.createImageData(MW, MH);
    for (let i = 0; i < fd.length; i += 4) {
      od.data[i] = fd[i];
      od.data[i + 1] = bd[i];
      od.data[i + 2] = 0;
      od.data[i + 3] = 255;
    }
    octx.putImageData(od, 0, 0);
    const t = new THREE.CanvasTexture(out);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.encoding = THREE.LinearEncoding;
    return t;
  }

  // ---------------------------------------------------------------- shaders
  const WAVE_GLSL = `
    float waveH(vec2 p, float t){
      float h = 0.055*sin(p.x*0.62 + t*1.05);
      h += 0.045*sin(p.y*0.78 - t*0.85);
      h += 0.030*sin((p.x+p.y)*1.35 + t*1.45);
      h += 0.018*sin((p.x-p.y*1.3)*2.1 - t*1.9);
      return h;
    }
    vec3 waveN(vec2 p, float t){
      float e = 0.35;
      float h  = waveH(p, t);
      float hx = waveH(p+vec2(e,0.0), t);
      float hz = waveH(p+vec2(0.0,e), t);
      return normalize(vec3(h-hx, e, h-hz));
    }`;

  function waterSurfaceMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.time, uRefl: U.refl, uFoam: { value: null }, uCam: U.camPos,
        uBlock: U.block, uSun: U.sun, uRain: U.rain, uWind: U.wind,
        uTextureMatrix: { value: new THREE.Matrix4() },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        uniform mat4 uTextureMatrix; uniform float uTime;
        varying vec3 vW; varying vec4 vR; varying vec2 vF; varying vec3 vN;
        ${WAVE_GLSL}
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          float h = waveH(wp.xz, uTime);
          wp.y += h;
          vW = wp.xyz;
          vN = waveN(wp.xz, uTime);
          vR = uTextureMatrix * vec4(position,1.0);
          vF = vec2((wp.x + 20.0)/26.0, (wp.z + 20.0)/28.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uRefl, uFoam; uniform float uTime, uSun, uRain, uWind, uBlock;
        uniform vec3 uCam;
        varying vec3 vW; varying vec4 vR; varying vec2 vF; varying vec3 vN;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec3 n = normalize(vN);
          vec3 v = normalize(uCam - vW);
          float f = pow(1.0 - clamp(dot(v,n),0.0,1.0), 2.0);
          vec2 ruv = vR.xy / max(abs(vR.w), 0.0001);
          vec2 dist = n.xz * (0.035 + 0.075*f) * (0.6 + 0.4*sin(uTime*0.6 + vW.x*0.2));
          vec2 suv = clamp(ruv + dist, vec2(0.001), vec2(0.999));
          float bs = max(uBlock, 4.0);
          vec2 buv = (floor(suv*bs)+0.5)/bs;
          vec3 refl = texture2D(uRefl, buv).rgb;
          float steps = 5.0;
          refl = floor(refl*steps + 0.5)/steps;
          refl *= vec3(0.66, 0.88, 0.96);
          vec4 fm = texture2D(uFoam, vF);
          float depth = fm.g;
          vec3 shallow = vec3(0.30,0.66,0.63);
          vec3 deep    = vec3(0.05,0.27,0.32);
          vec3 base = mix(deep, shallow, clamp(depth*1.15,0.0,1.0));
          vec3 col = mix(base, refl, clamp(0.10 + 0.55*f, 0.0, 1.0));
          vec2 sp = floor(buv*bs*2.7);
          float s = hash(sp + floor(uTime*2.2)*0.137);
          float glint = smoothstep(0.993, 1.0, s) * (0.45+0.55*sin(uTime*3.1 + s*40.0));
          col += glint * vec3(1.0,0.85,0.52) * 0.85 * (0.35+0.65*uSun);
          float pulse = 0.6 + 0.4*sin(uTime*1.25 + vW.x*0.55 + vW.z*0.4);
          float foam = smoothstep(0.30, 0.80, fm.r*pulse);
          col = mix(col, vec3(0.93,0.975,0.965), foam*0.92);
          float alpha = mix(0.78, 0.985, f) - foam*0.10;
          gl_FragColor = vec4(col, clamp(alpha,0.0,1.0));
        }`,
    });
  }

  function waterSideMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: U.time, uSun: U.sun },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv; varying float vY; varying vec3 vW;
        void main(){
          vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0);
          vY = wp.y; vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        precision mediump float; uniform float uTime, uSun; varying vec2 vUv; varying float vY; varying vec3 vW;
        void main(){
          float d = clamp((vY + 6.0)/6.0, 0.0, 1.0);   // 0 bottom .. 1 surface
          vec3 shallow = vec3(0.50,0.85,0.79);
          vec3 deep    = vec3(0.06,0.32,0.38);
          vec3 col = mix(deep, shallow, pow(d, 1.25));
          float c = sin(vUv.x*46.0 + uTime*0.5) * sin(vY*3.0 - uTime*0.35);
          col += c*0.035;
          col += smoothstep(0.86,1.0,d)*0.10*uSun;
          float a = mix(0.60, 0.34, d);
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  // ---------------------------------------------------------------- tetrapod
  function tetrapod(size, mat) {
    const g = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.SphereGeometry(size * 0.20, 8, 6), mat);
    g.add(hub);
    const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    const up = new THREE.Vector3(0, 1, 0);
    dirs.forEach(function (d, i) {
      const v = new THREE.Vector3(d[0], d[1] * 0.82, d[2]).normalize();
      const h = size * (1.25 + 0.15 * ((i % 2)));
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.13, size * 0.40, h, 7), mat);
      leg.quaternion.setFromUnitVectors(up, v);
      leg.position.copy(v).multiplyScalar(h * 0.5);
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 6, 5), mat);
      foot.position.copy(v).multiplyScalar(h * 0.96);
      g.add(foot);
    });
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // ---------------------------------------------------------------- build
  W.build = function (scene) {
    const G = W.group = new THREE.Group();
    scene.add(G);

    // ---- materials
    function rep(tex, rx, ry) {
      const t = tex.clone(); t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
      return t;
    }
    const deckMat = function (w, d) { return HB.toon(0xffffff, { map: rep(HB.TEX.deck, w / 5, d / 5) }); };
    const wallMat = function (w, h) { return HB.toon(0xffffff, { map: rep(HB.TEX.wall, w / 6, h / 6) }); };
    const seabedMat = HB.toon(0xffffff, { map: rep(HB.TEX.seabed, 8, 8) });
    const stripeMat = HB.toon(0xffffff, { map: rep(HB.TEX.stripes, 6, 1) });

    // ---- quay solid (two boxes, y -6..0)
    function quayBox(w, h, d, x, z) {
      const top = deckMat(w, d), side = wallMat(Math.max(w, d), h);
      const mats = [side, side, top, side, side, side];
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.set(x, C.BOTTOM + h / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      G.add(m);
      return m;
    }
    quayBox(40, 6, 12, 0, 14);      // front strip  z 8..20
    quayBox(14, 6, 28, 13, -6);     // east arm     x 6..20

    // ---- water surfaces
    const tetras = [
      [-16.5, -11.5, 1.15], [-14.6, -10.0, 0.95], [-12.2, -12.6, 1.3], [-17.8, -9.4, 1.0],
      [-11.0, -14.0, 0.85], [-9.2, -12.2, 1.1], [-16.0, -7.6, 0.9],
      [-4.5, -17.5, 1.0], [-1.6, -15.0, 1.25], [1.5, -18.0, 0.9],
      [-6.0, 6.6, 0.8], [-9.5, 6.9, 0.7], [-12.5, 6.6, 0.75],
      [-18.5, 2.0, 0.9], [-19.0, -3.0, 1.05],
    ];
    const rocks = [
      [-13.5, -13.2, 1.5], [-14.6, -12.0, 1.1], [-12.4, -13.8, 1.3], [-19.2, 4.0, 1.2],
      [-18.6, -6.0, 1.0], [-8.0, 7.4, 1.1], [-4.0, 7.2, 0.9], [4.6, -6.5, 1.0], [3.2, -12.0, 1.2],
    ];
    const foamTex = buildFoamMask(tetras, rocks);
    W.foamTex = foamTex;

    const surfMatA = waterSurfaceMaterial(), surfMatB = waterSurfaceMaterial();
    surfMatA.uniforms.uFoam.value = foamTex; surfMatB.uniforms.uFoam.value = foamTex;
    W.surfMats = [surfMatA, surfMatB];

    function waterTop(bx) {
      const w = bx.x1 - bx.x0, d = bx.z1 - bx.z0;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 26, 26), bx === W.A ? surfMatA : surfMatB);
      m.rotation.x = -Math.PI / 2;
      m.position.set((bx.x0 + bx.x1) / 2, C.WATER, (bx.z0 + bx.z1) / 2);
      m.renderOrder = 3;
      G.add(m);
      return m;
    }
    const topA = waterTop(W.A), topB = waterTop(W.B);
    W.surfaces = [topA, topB];

    const sideMat = waterSideMaterial();
    // outer walls of the base on the water side
    function waterSide(w, h, x, y, z, ry) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sideMat);
      m.position.set(x, y, z); m.rotation.y = ry;
      m.renderOrder = 4;
      G.add(m);
      return m;
    }
    waterSide(22, 6, -20, C.BOTTOM + 3, -3, Math.PI / 2);      // west wall  z -14..8
    waterSide(19, 6, -3.5, C.BOTTOM + 3, -20, 0);              // north wall x -13..6
    W.hiddenInReflection = [topA, topB];
    HB.app.celExempt.push(topA, topB);

    // ---- seabed
    const sbA = new THREE.Mesh(new THREE.PlaneGeometry(7, 22), seabedMat);
    sbA.rotation.x = -Math.PI / 2; sbA.position.set(-16.5, C.BOTTOM + 0.06, -3); sbA.receiveShadow = true; G.add(sbA);
    const sbB = new THREE.Mesh(new THREE.PlaneGeometry(19, 28), seabedMat);
    sbB.rotation.x = -Math.PI / 2; sbB.position.set(-3.5, C.BOTTOM + 0.06, -6); sbB.receiveShadow = true; G.add(sbB);

    // ---- tetrapods
    const tetraMat = HB.toon(0xffffff, { map: rep(HB.TEX.wall, 1, 1) });
    W.tetras = [];
    tetras.forEach(function (t, i) {
      const m = tetrapod(t[2], i % 3 === 0 ? HB.toon(0xc2c7c0) : (i % 3 === 1 ? tetraMat : HB.toon(0xb4b9b2)));
      const depth = 5.2 + Math.random() * 0.8;
      m.position.set(t[0], C.BOTTOM + depth, t[1]);
      m.rotation.y = Math.random() * 6.28;
      m.rotation.x = (Math.random() - .5) * .18;
      m.rotation.z = (Math.random() - .5) * .18;
      G.add(m);
      W.tetras.push(m);
    });

    // ---- shore rocks
    const rockMat = HB.toon(0xffffff, { map: rep(HB.TEX.rock, 1.5, 1.5) });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    rocks.forEach(function (t, i) {
      const s = t[2] * 1.15;
      const m = new THREE.Mesh(rockGeo, i % 2 ? rockMat : HB.toon(0x9aa29c));
      m.position.set(t[0], C.BOTTOM + 0.55 + s * 0.42, t[1]);
      m.scale.set(s * 1.25, s * 0.78, s * 1.1);
      m.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
      m.castShadow = true; m.receiveShadow = true;
      G.add(m);
    });
    // extra small pebbles along the waterline
    for (let i = 0; i < 46; i++) {
      const s = 0.18 + Math.random() * 0.3;
      const m = new THREE.Mesh(rockGeo, HB.toon(0x8f968e));
      const along = Math.random();
      let x, z;
      if (along < .5) { x = -19 + Math.random() * 25; z = 7.0 + Math.random() * 1.0; }
      else { x = 5.0 + Math.random() * 1.0; z = -19 + Math.random() * 27; }
      m.position.set(x, C.WATER - 0.12 + s * 0.3, z);
      m.scale.set(s * 1.4, s * 0.7, s * 1.2);
      m.rotation.set(Math.random() * 3, Math.random() * 6, Math.random() * 3);
      m.castShadow = true;
      G.add(m);
    }

    // ---- underwater: tyres, chain, weeds
    const tireMat = HB.toon(0xffffff, { map: rep(HB.TEX.tire, 2, 1) });
    const tireGeo = new THREE.TorusGeometry(0.62, 0.24, 8, 16);
    [[-6.5, -4.5, 0.3], [-2.0, -9.0, 2.1], [-16.0, -2.0, 1.4]].forEach(function (p, i) {
      const m = new THREE.Mesh(tireGeo, tireMat);
      m.position.set(p[0], C.BOTTOM + 0.34, p[1]);
      m.rotation.set(Math.PI / 2, 0, p[2]);
      m.scale.setScalar(1.1);
      m.castShadow = true; G.add(m);
      // moss on tyre
      const moss = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), HB.toon(i % 2 ? 0x5f7a52 : 0x6d8a5c));
      moss.scale.set(1.2, .3, 1.1); moss.position.set(p[0] + .2, C.BOTTOM + .3, p[1] - .1); G.add(moss);
    });

    // anchor chain on the seabed
    const linkMat = HB.toon(0x3a4045);
    const linkGeo = new THREE.TorusGeometry(0.14, 0.055, 5, 8);
    const chainPts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      chainPts.push(new THREE.Vector3(-9 + t * 9, C.BOTTOM + 0.16 + Math.sin(t * 3.1) * 0.28, -6.5 + Math.sin(t * 6.2) * 2.2));
    }
    W.chain = [];
    for (let i = 0; i < 16; i++) {
      const a = chainPts[i], b = chainPts[i + 1];
      const m = new THREE.Mesh(linkGeo, linkMat);
      m.position.copy(a).lerp(b, .5);
      m.lookAt(b);
      m.rotateX(Math.PI / 2);
      if (i % 2) m.rotateZ(Math.PI / 2);
      G.add(m); W.chain.push(m);
    }

    // seabed weed clumps + wall seaweed
    W.seaweed = [];
    const weedMat = HB.toon(0x4c7a4a, { side: THREE.DoubleSide });
    const weedMat2 = HB.toon(0x6b8f4a, { side: THREE.DoubleSide });
    function weedClump(x, z, n, scale, yBase) {
      const g = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const h = (1.4 + Math.random() * 1.6) * scale;
        const w = (0.16 + Math.random() * 0.14) * scale;
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 3), i % 2 ? weedMat : weedMat2);
        blade.position.y = h / 2;
        const holder = new THREE.Group();
        holder.add(blade);
        const a = Math.random() * 6.28, r = Math.random() * 0.5 * scale;
        holder.position.set(x + Math.cos(a) * r, yBase, z + Math.sin(a) * r);
        holder.rotation.y = Math.random() * 6.28;
        holder.rotation.z = (Math.random() - .5) * .5;
        g.add(holder);
        W.seaweed.push({ o: holder, ph: Math.random() * 6.28, amp: 0.10 + Math.random() * 0.16 });
      }
      G.add(g);
    }
    weedClump(-5, -2.5, 7, 1.0, C.BOTTOM + 0.1);
    weedClump(-11, -8, 6, 0.9, C.BOTTOM + 0.1);
    weedClump(-1, -14, 8, 1.15, C.BOTTOM + 0.1);
    weedClump(-17, -5, 6, 0.95, C.BOTTOM + 0.1);
    // hanging from the quay wall
    [[-8, 7.4], [-14, 7.5], [2.5, 7.5], [7.4, -4], [7.4, -10], [7.4, -15]].forEach(function (p, i) {
      const n = 5 + (i % 3);
      for (let k = 0; k < n; k++) {
        const h = 1.2 + Math.random() * 1.5;
        const holder = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.13, h, 1, 3), k % 2 ? weedMat : weedMat2);
        blade.position.y = -h / 2;
        holder.add(blade);
        const along = (k / n - .5) * 1.6;
        if (p[0] < 0) { holder.position.set(p[0] + along, C.WATER - 0.05, p[1] - 0.06); holder.rotation.y = Math.PI / 2; }
        else { holder.position.set(p[0] - 0.06, C.WATER - 0.05, p[1] + along); holder.rotation.y = 0; }
        holder.rotation.z = (Math.random() - .5) * .3;
        G.add(holder);
        W.seaweed.push({ o: holder, ph: Math.random() * 6.28, amp: 0.12 + Math.random() * 0.14 });
      }
    });

    // ---- wheel-stop stripes along the waterside edges
    function curb(len, x, z, ry) {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.34, 0.42), [
        stripeMat, stripeMat, HB.toon(0x8f968e), HB.toon(0x8f968e), stripeMat, stripeMat
      ]);
      bar.castShadow = true; bar.receiveShadow = true;
      g.add(bar);
      g.position.set(x, 0.17, z); g.rotation.y = ry;
      G.add(g);
      return g;
    }
    curb(26, -7, 7.72, 0);            // front strip water edge (x -20..6)
    curb(28, 6.79, -6, Math.PI / 2);  // east arm water edge (z -20..8)
    curb(40, 0, 19.72, 0);            // outer south edge

    // ---- deck edge kerb detail: thin darker line where wall meets deck
    // (visual anchor for the waterline)

    return W;
  };

  // ---------------------------------------------------------------- update
  W.update = function (t) {
    for (let i = 0; i < W.seaweed.length; i++) {
      const s = W.seaweed[i];
      s.o.rotation.z = Math.sin(t * 1.1 + s.ph) * s.amp + Math.sin(t * 0.37 + s.ph) * s.amp * 0.5;
      s.o.rotation.x = Math.cos(t * 0.9 + s.ph * 1.7) * s.amp * 0.6;
    }
  };

  // ---------------------------------------------------------------- reflection
  const reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -C.WATER);
  const mirrorCam = new THREE.PerspectiveCamera();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -C.WATER);

  W.updateTextureMatrix = function (camera, renderer) {
    const rp = tmpV.set(0, C.WATER, 0);
    const cp = tmpV2.setFromMatrixPosition(camera.matrixWorld);
    const view = new THREE.Vector3().subVectors(rp, cp);
    const normal = new THREE.Vector3(0, 1, 0);
    if (view.dot(normal) > 0) return;         // camera under water
    view.reflect(normal).negate().add(rp);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const lap = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    const target = new THREE.Vector3().subVectors(rp, lap);
    target.reflect(normal).negate().add(rp);
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0);
    mirrorCam.lookAt(target);
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorCam.updateMatrixWorld(true);

    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    const texMat = new THREE.Matrix4().multiplyMatrices(bias, mirrorCam.projectionMatrix);
    texMat.multiply(mirrorCam.matrixWorldInverse);
    W.surfMats.forEach(function (m) { m.uniforms.uTextureMatrix.value.copy(texMat); });
    W.mirrorCam = mirrorCam;
    W.clipPlane = clipPlane;
  };
})();

