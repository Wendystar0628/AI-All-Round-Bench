/* 太阳雨中的小渔港堤岸 —— 核心工具：配色、卡通材质、描边、程序化贴图 */
'use strict';
window.HARBOR = window.HARBOR || {};
(function (H) {

  // ---------- 数学 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash11(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function hash21(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  // 平滑关键帧曲线（循环）
  function keyCurve(keys, t) {
    const T = keys[keys.length - 1][0];
    let tt = ((t % T) + T) % T;
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
      if (tt >= t0 && tt <= t1) return lerp(v0, v1, smooth((tt - t0) / (t1 - t0)));
    }
    return keys[0][1];
  }
  function pulse(t, t0, t1, fade) {
    return smoothstep(t0 - fade, t0 + fade, t) * (1 - smoothstep(t1 - fade, t1 + fade, t));
  }

  // ---------- 配色（海玻璃青 × 湿润灰白 × 暖金） ----------
  const PAL = {
    skyTop: 0xbfe6ea, skyHorizon: 0xeef8f4,
    concrete: 0xd3dbd7, concreteDark: 0xb9c4c0, concreteWet: 0xc2cfcb,
    wall: 0xc4cdc9, tide: 0x5d7a76, algae: 0x6d8a72,
    waterShallow: 0x9fe0d2, waterMid: 0x5fbcae, waterDeep: 0x2e7f8f,
    waterSide: 0x74c9bd, seabed: 0x8a9a90, seabedDark: 0x5f7a74,
    ink: 0x2a4d54,
    boatWhite: 0xf6f8f5, boatShadow: 0x39626c, rust: 0xb26a44, rustDark: 0x8a4f33,
    iron: 0x3a4245, ironRust: 0x7a5240,
    rope: 0xd8874f, ropeWet: 0x8a5a3c,
    warnYellow: 0xf2c230, warnBlack: 0x33383a,
    lifeOrange: 0xf08a3c,
    gold: 0xffe6a8, goldDeep: 0xf5c86a,
    wood: 0xb98d5e, woodDark: 0x8a6242,
    tileRoof: 0x5d7078, tileRoof2: 0x77675e,
    leaf: 0x6fae7c, leafDark: 0x4d8a63, leafLight: 0x93c98d,
    glass: 0xcfeef0,
    red: 0xd95f4c, lighthouseRed: 0xe0574a,
    catFur: 0xd9a05e, catDark: 0x8a6242, catWhite: 0xf3efe6,
    gullWhite: 0xf7f9f6, gullGray: 0xb9c6c9, gullTip: 0x46565c, beak: 0xf0a03c,
    fish: 0x7fb8c9, fishBelly: 0xe8f2ee,
    crateWhite: 0xeef1ec, crateBlue: 0x4d8fb8,
    vending: 0xd95f4c, vendingGlow: 0xfff2cc,
    umbrella: 0xdff2f2,
    caseSilver: 0xb9c2c4, caseDark: 0x6e7a7e,
    buoyRed: 0xd9764f, buoyWhite: 0xeef1ec,
    net: 0x9fb8a8, floatBall: 0xf0d9a0,
    paper: 0xf4f1e4, chartPaper: 0xe8e2c8,
    raincoat: 0xf2c230,
    thermos: 0xb9c6c9, enamel: 0xf3f5f0, enamelRim: 0x4d8fb8,
    omamori: 0xd95f4c,
    screenRadar: 0x64e8a8, screenFish: 0x7fc8f0,
    foam: 0xf5fbf8,
    rainbow: [0xe86a5a, 0xf0a04c, 0xf2d264, 0x8fce7e, 0x64b8d9, 0x7a86d9, 0xa87ac9]
  };

  // ---------- 卡通渐变（4 阶） ----------
  const gradData = new Uint8Array([105, 160, 214, 255]);
  const gradientMap = new THREE.DataTexture(gradData, 4, 1, THREE.LuminanceFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;

  //  authored 颜色为 sRGB 显示值；渲染管线转线性，输出再编码回 sRGB
  function srgbColor(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  const matCache = {};
  function toon(color, opts) {
    opts = opts || {};
    const key = color + '|' + (opts.emissive || 0) + '|' + (opts.emissiveIntensity || 0) + '|' + (opts.map ? opts.map.uuid : '') + '|' + (opts.transparent ? 1 : 0) + '|' + (opts.opacity !== undefined ? opts.opacity : 1) + '|' + (opts.side || 0);
    if (matCache[key]) return matCache[key];
    const o = Object.assign({}, opts);
    o.color = srgbColor(color);
    if (o.emissive !== undefined) o.emissive = srgbColor(o.emissive);
    const m = new THREE.MeshToonMaterial(Object.assign({ gradientMap: gradientMap }, o));
    matCache[key] = m;
    return m;
  }

  // ---------- 描边（背面法线外扩） ----------
  const outlineMatCache = {};
  function outlineMaterial(thickness) {
    const key = thickness.toFixed(4);
    if (outlineMatCache[key]) return outlineMatCache[key];
    const m = new THREE.ShaderMaterial({
      uniforms: { uThick: { value: thickness }, uColor: { value: new THREE.Color(PAL.ink) } },
      vertexShader: `
        uniform float uThick;
        void main() {
          vec3 p = position + normal * uThick;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, 1.0); }`,
      side: THREE.BackSide
    });
    outlineMatCache[key] = m;
    return m;
  }
  function outline(mesh, thickness) {
    if (!mesh.geometry || !mesh.geometry.attributes.normal) return mesh;
    const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
    o.raycast = function () {};
    mesh.add(o);
    return mesh;
  }

  // ---------- 几何小工具 ----------
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function sph(r, mat, x, y, z, parent, wSeg, hSeg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg || 14, hSeg || 10), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function grp(x, y, z, parent, ry) {
    const g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    if (ry) g.rotation.y = ry;
    if (parent) parent.add(g);
    return g;
  }
  function tubeAlong(points, radius, mat, segs) {
    const curve = new THREE.CatmullRomCurve3(points);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs || 24, radius, 6, false), mat);
    m.castShadow = true;
    return m;
  }

  // ---------- 程序化 Canvas 贴图 ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function speckle(ctx, w, h, n, colors, rMin, rMax, alpha, rnd) {
    rnd = rnd || mulberry32(7);
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
      ctx.fillStyle = colors[(rnd() * colors.length) | 0];
      const r = rMin + rnd() * (rMax - rMin);
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 湿润水泥贴图
  function concreteTexture(seed, wet) {
    return canvasTex(512, 512, (ctx, w, h) => {
      const rnd = mulberry32(seed);
      ctx.fillStyle = wet ? '#c6d2ce' : '#d5ddd8';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 900, ['#bcc8c3', '#e2e9e4', '#aab8b2', '#cfd8d3'], 1, 5, 0.25, rnd);
      // 水渍
      for (let i = 0; i < (wet ? 14 : 7); i++) {
        const x = rnd() * w, y = rnd() * h, r = 26 + rnd() * 80;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(120,145,140,0.16)');
        g.addColorStop(1, 'rgba(120,145,140,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // 裂缝
      ctx.strokeStyle = 'rgba(120,135,130,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let x = rnd() * w, y = rnd() * h;
        ctx.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * 60; y += rnd() * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // 模板缝
      ctx.strokeStyle = 'rgba(140,155,150,0.30)'; ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke(); }
    }, [2, 2]);
  }

  // 岸壁潮位贴图：墙高 3.4（y -2.4..1.0），水面 y=0.45 → v≈0.84（canvas y≈0.16h）
  function seawallTexture() {
    return canvasTex(512, 512, (ctx, w, h) => {
      const rnd = mulberry32(21);
      ctx.fillStyle = '#c8d1cc';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 700, ['#b3bfb9', '#dde4df', '#9fb0a9'], 1, 6, 0.3, rnd);
      // 砌块缝
      ctx.strokeStyle = 'rgba(110,128,124,0.4)'; ctx.lineWidth = 2;
      for (let row = 0; row < 8; row++) {
        const y = h * row / 8;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        const off = (row % 2) * 64;
        for (let x = off; x < w; x += 128) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h / 8); ctx.stroke(); }
      }
      // 浸水区青绿 tint（canvas y 0.14h..0.9h）
      const g = ctx.createLinearGradient(0, h * 0.12, 0, h * 0.92);
      g.addColorStop(0, 'rgba(58,92,86,0.78)');
      g.addColorStop(0.4, 'rgba(74,108,98,0.5)');
      g.addColorStop(1, 'rgba(96,126,112,0.18)');
      ctx.fillStyle = g; ctx.fillRect(0, h * 0.12, w, h * 0.8);
      // 水线浮沫痕
      ctx.fillStyle = 'rgba(46,76,70,0.55)';
      ctx.fillRect(0, h * 0.155, w, 9);
      ctx.fillStyle = 'rgba(230,240,235,0.30)';
      ctx.fillRect(0, h * 0.145, w, 4);
      // 低潮位深色条
      ctx.fillStyle = 'rgba(52,82,76,0.4)';
      ctx.fillRect(0, h * 0.46, w, 12);
      // 藻类抹痕（浸水区）
      ctx.save();
      ctx.beginPath(); ctx.rect(0, h * 0.2, w, h * 0.66); ctx.clip();
      speckle(ctx, w, h, 200, ['#5d7a62', '#6d8a72', '#4d6a56'], 2, 9, 0.35, rnd);
      ctx.restore();
      // 上部雨渍流痕
      for (let i = 0; i < 16; i++) {
        const x = rnd() * w;
        ctx.fillStyle = 'rgba(130,148,142,' + (0.08 + rnd() * 0.1) + ')';
        ctx.fillRect(x, rnd() * h * 0.1, 2 + rnd() * 4, 20 + rnd() * 50);
      }
    });
  }

  // 瓦顶贴图
  function roofTexture(base) {
    return canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(30,45,50,0.35)'; ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        for (let x = ((y / 22) % 2) * 16; x < w; x += 32) {
          ctx.beginPath(); ctx.arc(x, y + 11, 10, Math.PI, 0); ctx.stroke();
        }
      }
    }, [3, 2]);
  }

  // 黄黑警示条（磨损）
  function hazardTexture() {
    return canvasTex(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#33383a';
      for (let x = -h; x < w + h; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, h); ctx.lineTo(x + 24, h); ctx.lineTo(x + 24 + h, 0); ctx.lineTo(x + h, 0);
        ctx.closePath(); ctx.fill();
      }
      const rnd = mulberry32(5);
      speckle(ctx, w, h, 160, ['#d5ddd8', '#b9c4c0', '#f2c230'], 1, 5, 0.5, rnd);
    }, [4, 1]);
  }

  H.anim = {};   // 动画对象注册表
  H.refs = {};   // 跨模块引用

  H.clamp = clamp; H.lerp = lerp; H.smooth = smooth; H.smoothstep = smoothstep;
  H.easeInOut = easeInOut; H.mulberry32 = mulberry32; H.hash11 = hash11; H.hash21 = hash21;
  H.keyCurve = keyCurve; H.pulse = pulse;
  H.PAL = PAL; H.gradientMap = gradientMap;
  H.toon = toon; H.srgbColor = srgbColor; H.outline = outline; H.outlineMaterial = outlineMaterial;
  H.box = box; H.cyl = cyl; H.sph = sph; H.plane = plane; H.grp = grp; H.tubeAlong = tubeAlong;
  H.canvasTex = canvasTex; H.speckle = speckle;
  H.concreteTexture = concreteTexture; H.seawallTexture = seawallTexture;
  H.roofTexture = roofTexture; H.hazardTexture = hazardTexture;

  // 场景常量（布局）
  H.LAYOUT = {
    base: 11,          // 底座半边长
    quayY: 1.0,        // 堤岸顶面
    waterY: 0.45,      // 水面
    seabedY: -1.7,     // 海床
    baseBottom: -2.4,
    waterMinX: -4.5,   // 水域左界（左臂码头内缘）
    waterMaxZ: 4.5,    // 水域前界（前景堤岸内缘）
    lighthouse: { x: -0.6, z: -8.6 }
  };

})(window.HARBOR);