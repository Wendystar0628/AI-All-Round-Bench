/* 网络安全攻防战 — 渲染核心：渲染器、后期、材质、程序化纹理、几何工具、镜头 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE;
  const GX = TD.GX = {};
  const V3 = THREE.Vector3;

  // ---------- 程序化纹理 ----------
  GX.canvasTex = function (w, h, draw, opts) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = (opts && opts.linear) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (opts && opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    return t;
  };
  const rnd = TD.makeRng(4242);
  function panelTex(base, line, accent, kind) {
    return GX.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},255,${rnd() * 0.035})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
      g.strokeStyle = line; g.lineWidth = 2;
      if (kind === 'link') {
        g.strokeRect(10, 10, w - 20, h - 20);
        g.lineWidth = 1; g.globalAlpha = 0.55;
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(10, i * 64); g.lineTo(w - 10, i * 64); g.moveTo(i * 64, 10); g.lineTo(i * 64, h - 10); g.stroke(); }
        g.globalAlpha = 1; g.fillStyle = accent;
        for (const [x, y] of [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
      } else if (kind === 'legacy') {
        g.save(); g.beginPath(); g.rect(0, 0, w, 26); g.rect(0, h - 26, w, 26); g.rect(0, 0, 26, h); g.rect(w - 26, 0, 26, h); g.clip();
        for (let i = -h; i < w + h; i += 28) { g.fillStyle = accent; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 14, 0); g.lineTo(i + 14 + h, h); g.lineTo(i + h, h); g.fill(); }
        g.restore();
        g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(27, 27, w - 54, h - 54);
        g.lineWidth = 5; g.globalAlpha = 0.6;
        for (let i = 0; i < 5; i++) { const y = 52 + i * 38; g.beginPath(); g.moveTo(40, y); g.lineTo(w - 40, y); g.stroke(); }
        g.globalAlpha = 1;
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,10,0,${0.15 + rnd() * 0.25})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 9, 0, 7); g.fill(); }
      } else if (kind === 'plat') {
        g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
        g.lineWidth = 2; g.beginPath();
        const cx = w / 2, cy = h / 2;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6, x = cx + Math.cos(a) * 70, y = cy + Math.sin(a) * 70; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.closePath(); g.stroke();
        g.fillStyle = accent; g.globalAlpha = 0.9;
        for (const [x, y, ww, hh] of [[14, 14, 34, 6], [14, 14, 6, 34], [w - 48, 14, 34, 6], [w - 20, 14, 6, 34], [14, h - 20, 34, 6], [14, h - 48, 6, 34], [w - 48, h - 20, 34, 6], [w - 20, h - 48, 6, 34]]) g.fillRect(x, y, ww, hh);
        g.globalAlpha = 1;
      } else if (kind === 'rack') {
        for (let y = 8; y < h; y += 20) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(8, y, w - 16, 14); for (let x = 14; x < w - 20; x += 9) { if (rnd() < 0.55) { g.fillStyle = rnd() < 0.8 ? accent : line; g.globalAlpha = 0.4 + rnd() * 0.6; g.fillRect(x, y + 4, 5, 5); g.globalAlpha = 1; } } }
      } else if (kind === 'hull') {
        g.lineWidth = 1.5; g.globalAlpha = 0.5;
        for (let i = 0; i < 9; i++) { const x = rnd() * w, y = rnd() * h, ww = 30 + rnd() * 90, hh = 20 + rnd() * 70; g.strokeRect(x, y, ww, hh); }
        g.globalAlpha = 1;
      }
    });
  }
  function emisTex(kind, col) {
    return GX.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.strokeStyle = col;
      if (kind === 'rack') { const r2 = TD.makeRng(77); for (let y = 8; y < h; y += 20) for (let x = 14; x < w - 20; x += 9) if (r2() < 0.42) { g.globalAlpha = 0.5 + r2() * 0.5; g.fillStyle = r2() < 0.85 ? col : '#ffffff'; g.fillRect(x, y + 4, 5, 5); } }
      else if (kind === 'win') { const r2 = TD.makeRng(31); for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 14) if (r2() < 0.5) { g.globalAlpha = 0.25 + r2() * 0.75; g.fillRect(x, y, 8, 9); } }
      else if (kind === 'edge') { g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); }
    });
  }
  GX.makeGlowTex = function () {
    return GX.canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  };

  // ---------- 主题 ----------
  GX.THEMES = {
    corp: { sky: [0x030914, 0x0a2440, 0x123e5c], fog: 0x061426, slab: '#1a2a40', slabLine: '#3b6f9c', accent: '#49d6ff', plat: '#27405c', platLine: '#7ec8f2', legacy: '#4a3520', legLine: '#c98a3a', legAcc: '#e0a030', key: 0xdcecff, fill: 0x2a6fb0, rim: 0x4de0ff, grid: 0x2a9fd8, layer: [0x1c6ea8, 0x1a4f9a, 0x243c8c, 0x2a2a70], fac: '#22344c', facAcc: '#58e0ff' },
    wan: { sky: [0x05030f, 0x1a0e3a, 0x3a1a5c], fog: 0x0b0720, slab: '#1f2140', slabLine: '#5a5cb0', accent: '#8f9dff', plat: '#2e2f5c', platLine: '#a9b2ff', legacy: '#4a3020', legLine: '#d08a3a', legAcc: '#e8a23a', key: 0xe8e2ff, fill: 0x5a3fb0, rim: 0xff7ae0, grid: 0x7a5cff, layer: [0x5a3fc0, 0x7030a0, 0x8a2a80, 0x5a1e60], fac: '#28264c', facAcc: '#b79cff' },
    ics: { sky: [0x040605, 0x0e1a16, 0x24382a], fog: 0x070d0b, slab: '#232a2c', slabLine: '#5f7f78', accent: '#6fe0b8', plat: '#34403e', platLine: '#9fd0c0', legacy: '#4d3a1c', legLine: '#d8962e', legAcc: '#f0b030', key: 0xfff1dc, fill: 0x2f7060, rim: 0xffa040, grid: 0x38b890, layer: [0x2a8a6a, 0x3a7a3a, 0x7a6a20, 0x7a3a18], fac: '#2c3432', facAcc: '#ffb040' }
  };

  // ---------- 材质 ----------
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (hex, k) => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: hex, emissiveIntensity: k == null ? 2.2 : k, roughness: 0.5, metalness: 0 });
  const basicAdd = (hex, op) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op == null ? 1 : op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  GX.glow = glow; GX.basicAdd = basicAdd;

  GX.buildMaterials = function () {
    const M = GX.M = {};
    // 己方：白瓷 + 钛钢 + 青色光
    M.tWhite = std({ color: 0xc9d3de, metalness: 0.2, roughness: 0.36 });
    M.tSteel = std({ color: 0x8794a6, metalness: 0.9, roughness: 0.28 });
    M.tDark = std({ color: 0x232d3a, metalness: 0.65, roughness: 0.42 });
    M.tGlow = glow(0x3fdcff, 2.4);
    M.tHeal = glow(0x55ff9a, 2.4);
    M.tAmber = glow(0xffb53a, 2.4);
    M.tWarn = glow(0xff7a2e, 2.6);
    M.tGlass = new THREE.MeshPhysicalMaterial({ color: 0x7fd8ff, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.16, emissive: 0x1a6f8f, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.4 });
    M.tBarrier = basicAdd(0x49d8ff, 0.32);
    // 敌方：深紫黑甲壳 + 红/品红光
    M.eBody = std({ color: 0x1c1020, metalness: 0.55, roughness: 0.38 });
    M.eShell = std({ color: 0x47123a, metalness: 0.7, roughness: 0.3 });
    M.eBone = std({ color: 0x6d5a68, metalness: 0.3, roughness: 0.6 });
    M.eGlow = glow(0xff2a55, 2.8);
    M.eGlow2 = glow(0xc23cff, 2.6);
    M.ePink = glow(0xff4fa2, 2.4);
    M.pkt = std({ color: 0xdde8ff, metalness: 0.1, roughness: 0.35, emissive: 0x3a66ff, emissiveIntensity: 0.25 });
    M.pktGlow = glow(0x8fb8ff, 1.6);
    M.eShield = new THREE.MeshBasicMaterial({ color: 0xff5fd0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    M.tShield = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    M.black = std({ color: 0x07080b, metalness: 0.3, roughness: 0.7 });
    M.chain = glow(0xff3344, 2.0);
    return M;
  };
  GX.themeMaterials = function (th) {
    const T = {};
    T.slab = std({ map: panelTex(th.slab, th.slabLine, th.accent, 'link'), metalness: 0.55, roughness: 0.5 });
    T.slabSide = std({ color: new THREE.Color(th.slab).multiplyScalar(0.6), metalness: 0.6, roughness: 0.5 });
    T.legacy = std({ map: panelTex(th.legacy, th.legLine, th.legAcc, 'legacy'), metalness: 0.75, roughness: 0.62 });
    T.plat = std({ map: panelTex(th.plat, th.platLine, th.accent, 'plat'), metalness: 0.45, roughness: 0.4 });
    T.platSide = std({ color: new THREE.Color(th.plat).multiplyScalar(0.75), metalness: 0.6, roughness: 0.45 });
    T.hull = std({ map: panelTex(th.fac, th.slabLine, th.accent, 'hull'), metalness: 0.6, roughness: 0.45 });
    T.rack = std({ map: panelTex('#0c1420', th.slabLine, th.facAcc, 'rack'), emissiveMap: emisTex('rack', th.facAcc), emissive: 0xffffff, emissiveIntensity: 1.6, metalness: 0.5, roughness: 0.5 });
    T.win = std({ color: 0x0a1018, emissiveMap: emisTex('win', th.facAcc), emissive: 0xffffff, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.6 });
    T.metal = std({ color: 0x73808e, metalness: 0.9, roughness: 0.32 });
    T.dark = std({ color: 0x141a22, metalness: 0.6, roughness: 0.5 });
    T.node = std({ color: 0xaab6c4, metalness: 0.75, roughness: 0.32 });
    T.accent = glow(new THREE.Color(th.accent).getHex(), 1.8);
    T.accentDim = glow(new THREE.Color(th.accent).getHex(), 0.7);
    T.legGlow = glow(new THREE.Color(th.legAcc).getHex(), 1.5);
    T.facGlow = glow(new THREE.Color(th.facAcc).getHex(), 2.0);
    T.rust = std({ color: 0x6b4526, metalness: 0.7, roughness: 0.7 });
    T.hazard = std({ map: GX.canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#18181a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0b020'; for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + h, h); g.lineTo(i + h, h); g.fill(); } }), metalness: 0.4, roughness: 0.6 });
    return T;
  };

  // ---------- 几何缓存与合批 ----------
  const gc = new Map();
  const geo = (key, f) => { let g = gc.get(key); if (!g) { g = f(); gc.set(key, g); } return g; };
  GX.G = {
    box: (w, h, d) => geo('b' + w + ',' + h + ',' + d, () => new THREE.BoxGeometry(w, h, d)),
    rbox: (w, h, d, r) => geo('rb' + w + ',' + h + ',' + d + ',' + r, () => new THREE.RoundedBoxGeometry(w, h, d, 3, r)),
    cyl: (rt, rb, h, s, open) => geo('c' + rt + ',' + rb + ',' + h + ',' + s + (open ? 'o' : ''), () => new THREE.CylinderGeometry(rt, rb, h, s || 16, 1, !!open)),
    sph: (r, ws, hs) => geo('s' + r + ',' + ws + ',' + hs, () => new THREE.SphereGeometry(r, ws || 16, hs || 12)),
    hemi: (r, ws) => geo('h' + r + ',' + ws, () => new THREE.SphereGeometry(r, ws || 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    cone: (r, h, s) => geo('k' + r + ',' + h + ',' + s, () => new THREE.ConeGeometry(r, h, s || 12)),
    tor: (r, t, rs, ts, arc) => geo('t' + r + ',' + t + ',' + rs + ',' + ts + ',' + arc, () => new THREE.TorusGeometry(r, t, rs || 8, ts || 24, arc || Math.PI * 2)),
    oct: (r, d) => geo('o' + r + ',' + (d || 0), () => new THREE.OctahedronGeometry(r, d || 0)),
    ico: (r, d) => geo('i' + r + ',' + (d || 0), () => new THREE.IcosahedronGeometry(r, d || 0)),
    tet: (r) => geo('te' + r, () => new THREE.TetrahedronGeometry(r, 0)),
    ring: (ri, ro, s) => geo('r' + ri + ',' + ro + ',' + s, () => { const g = new THREE.RingGeometry(ri, ro, s || 32); g.rotateX(-Math.PI / 2); return g; }),
    plane: (w, h) => geo('p' + w + ',' + h, () => { const g = new THREE.PlaneGeometry(w, h); g.rotateX(-Math.PI / 2); return g; }),
    lathe: (key, pts, seg) => geo('l' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 20)),
    prism: (r, h, n) => geo('pr' + r + ',' + h + ',' + n, () => new THREE.CylinderGeometry(r, r, h, n, 1))
  };
  // 生成网格部件
  GX.mk = function (g, m, p, r, s) {
    const o = new THREE.Mesh(g, m);
    if (p) o.position.set(p[0], p[1], p[2]);
    if (r) o.rotation.set(r[0], r[1], r[2]);
    if (s != null) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
    o.castShadow = true; o.receiveShadow = true;
    return o;
  };
  GX.grp = function (p, kids) { const o = new THREE.Group(); if (p) o.position.set(p[0], p[1], p[2]); if (kids) for (const k of kids) o.add(k); return o; };

  class Batch {
    constructor() { this.m = new Map(); this._mx = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new V3(); this._s = new V3(); }
    add(g, mat, p, r, s) {
      const gg = (g.index ? g.toNonIndexed() : g.clone());
      this._e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); this._q.setFromEuler(this._e);
      this._p.set(p[0], p[1], p[2]);
      if (s == null) this._s.set(1, 1, 1); else if (typeof s === 'number') this._s.set(s, s, s); else this._s.set(s[0], s[1], s[2]);
      gg.applyMatrix4(this._mx.compose(this._p, this._q, this._s));
      for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
      let a = this.m.get(mat); if (!a) { a = []; this.m.set(mat, a); } a.push(gg);
    }
    build(parent, o) {
      o = o || {}; const out = [];
      for (const [mat, list] of this.m) {
        const g = THREE.BufferGeometryUtils.mergeGeometries(list, false);
        for (const x of list) x.dispose();
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = o.cast !== false; mesh.receiveShadow = o.receive !== false;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        parent.add(mesh); out.push(mesh);
      }
      this.m.clear(); return out;
    }
  }
  GX.Batch = Batch;

  // ---------- 文本贴图 ----------
  GX.FONT = '"HarmonyOS Sans SC","MiSans","Source Han Sans SC","Noto Sans SC","Microsoft YaHei UI","Microsoft YaHei",sans-serif';
  GX.MONO = '"JetBrains Mono","Cascadia Mono","Cascadia Code","Consolas","Menlo",monospace';
  GX.textSprite = function (text, o) {
    o = o || {}; const fs = o.size || 44, pad = 18, font = (o.bold === false ? '500 ' : '700 ') + fs + 'px ' + (o.mono ? GX.MONO + ',' : '') + GX.FONT;
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font;
    const lines = String(text).split('\n'); let tw = 0; for (const l of lines) tw = Math.max(tw, g.measureText(l).width);
    const w = Math.ceil(tw + pad * 2 + (o.tag ? fs * 1.3 : 0)), h = Math.ceil(fs * 1.35 * lines.length + pad);
    c.width = w; c.height = h; g.font = font; g.textBaseline = 'middle';
    if (o.bg) { g.fillStyle = o.bg; rr(g, 2, 2, w - 4, h - 4, 10); g.fill(); if (o.border) { g.strokeStyle = o.border; g.lineWidth = 3; g.stroke(); } }
    let x = pad;
    if (o.tag) { g.fillStyle = o.tagBg || '#fff'; rr(g, 8, 8, fs * 1.15, h - 16, 8); g.fill(); g.fillStyle = o.tagFg || '#000'; g.textAlign = 'center'; g.fillText(o.tag, 8 + fs * 0.575, h / 2 + 2); g.textAlign = 'left'; x = fs * 1.3 + 16; }
    g.fillStyle = o.color || '#fff'; if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 12; }
    lines.forEach((l, i) => g.fillText(l, x, pad / 2 + fs * 0.7 + i * fs * 1.35));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, toneMapped: false, opacity: o.opacity == null ? 1 : o.opacity });
    const s = new THREE.Sprite(m); const k = (o.scale || 0.012); s.scale.set(w * k, h * k, 1); s.userData.aspect = w / h; s.renderOrder = 20;
    return s;
  };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  GX.roundRect = rr;
  GX.flatText = function (text, o) {   // 贴地文字
    o = o || {}; const fs = 64, font = '700 ' + fs + 'px ' + GX.FONT;
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font; const tw = g.measureText(text).width;
    c.width = Math.ceil(tw + 40); c.height = 96; g.font = font; g.textBaseline = 'middle'; g.fillStyle = o.color || '#fff'; g.fillText(text, 20, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o.opacity == null ? 0.5 : o.opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const hh = o.h || 0.42, mesh = new THREE.Mesh(new THREE.PlaneGeometry(hh * c.width / c.height, hh), m); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 3;
    return mesh;
  };

  // ---------- 渲染器与镜头 ----------
  class Stage {
    constructor(canvas) {
      this.canvas = canvas;
      const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
      r.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 600);
      const pm = new THREE.PMREMGenerator(r);
      this.envTex = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTex; this.scene.environmentIntensity = 0.42;
      pm.dispose();
      GX.buildMaterials();
      GX.glowTex = GX.makeGlowTex();
      this.cam = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.95, dist: 30 };
      this.camDef = Object.assign({}, this.cam);
      this.safe = { l: 0.153, r: 0.175, t: 0.082, b: 0.172 };
      this.w = 0; this.h = 0; this.shake = 0; this._shakeV = new V3();
      this._setupComposer(1280, 720);
      this.quality = 1;
    }
    _setupComposer(w, h) {
      const r = this.renderer;
      if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const c = this.composer = new THREE.EffectComposer(r, rt);
      c.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.5, 1.0);
      c.addPass(this.bloom);
      c.addPass(new THREE.OutputPass());
    }
    resize(w, h, dpr) {
      w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
      const pr = Math.min(dpr || 1, w * h > 2600000 ? 1 : 1.5);
      if (w === this.w && h === this.h && pr === this.pr) return;
      this.w = w; this.h = h; this.pr = pr;
      this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    applyCam() {
      const c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      const x = c.tx + Math.sin(c.yaw) * cp * c.dist, y = c.ty + sp * c.dist, z = c.tz + Math.cos(c.yaw) * cp * c.dist;
      this.camera.position.set(x, y, z);
      if (this.shake > 0.001) { this.camera.position.add(this._shakeV); }
      this.camera.lookAt(c.tx, c.ty, c.tz);
      this.camera.updateMatrixWorld();
    }
    // 让给定包围范围在安全区内完整可见
    fit(minX, maxX, minZ, maxZ, pitch, yaw) {
      const c = this.cam; c.pitch = pitch == null ? 0.98 : pitch; c.yaw = yaw || 0; c.ty = 0;
      c.tx = (minX + maxX) / 2; c.tz = (minZ + maxZ) / 2;
      const pts = []; for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of [0, 1.2]) pts.push(new V3(x, y, z));
      const s = this.safe, v = new V3();
      const L = -1 + 2 * s.l, Rr = 1 - 2 * s.r, T = 1 - 2 * s.t, B = -1 + 2 * s.b;
      const bounds = () => { this.applyCam(); let a = 1e9, b = -1e9, cc = 1e9, d = -1e9; for (const p of pts) { v.copy(p).project(this.camera); a = Math.min(a, v.x); b = Math.max(b, v.x); cc = Math.min(cc, v.y); d = Math.max(d, v.y); } return [a, b, cc, d]; };
      let lo = 6, hi = 140;
      for (let it = 0; it < 26; it++) {
        c.dist = (lo + hi) / 2;
        for (let k = 0; k < 10; k++) { // 平移使投影居中于安全区
          const [a, b, cc, d] = bounds(); const ex = ((a + b) / 2 - (L + Rr) / 2), ey = ((cc + d) / 2 - (T + B) / 2);
          const span = Math.tan(this.camera.fov * Math.PI / 360) * c.dist;
          c.tx += ex * span * this.camera.aspect * 0.95; c.tz += -ey * span / Math.sin(c.pitch) * 0.95;
        }
        const [a, b, cc, d] = bounds();
        if ((b - a) <= (Rr - L) && (d - cc) <= (T - B)) hi = c.dist; else lo = c.dist;
      }
      c.dist = hi * 1.015;
      for (let k = 0; k < 10; k++) { const [a, b, cc, d] = bounds(); const ex = ((a + b) / 2 - (L + Rr) / 2), ey = ((cc + d) / 2 - (T + B) / 2); const span = Math.tan(this.camera.fov * Math.PI / 360) * c.dist; c.tx += ex * span * this.camera.aspect * 0.95; c.tz += -ey * span / Math.sin(c.pitch) * 0.95; }
      this.applyCam();
      this.camDef = Object.assign({}, c);
    }
    render(dt) {
      if (this.shake > 0.001) { this.shake *= Math.pow(0.02, dt || 0.016); const s = this.shake; this._shakeV.set(Math.sin(this.shakeT * 61) * s, Math.cos(this.shakeT * 47) * s, Math.sin(this.shakeT * 53) * s); this.shakeT += dt || 0.016; }
      this.applyCam();
      this.composer.render(dt);
    }
    addShake(a) { this.shake = Math.min(0.35, this.shake + a); this.shakeT = this.shakeT || 0; }
    project(x, y, z, out) {
      const v = (out || new V3()).set(x, y, z).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, behind: v.z > 1 };
    }
    // 屏幕坐标射线与水平面 y=h 求交
    rayPlane(sx, sy, h) {
      const v = new V3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5).unproject(this.camera);
      const o = this.camera.position, d = v.sub(o).normalize();
      if (Math.abs(d.y) < 1e-5) return null;
      const t = ((h || 0) - o.y) / d.y; if (t < 0) return null;
      return new V3(o.x + d.x * t, h || 0, o.z + d.z * t);
    }
  }
  GX.Stage = Stage;
})(window);
