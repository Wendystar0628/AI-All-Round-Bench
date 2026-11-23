'use strict';
/* 泊位船只、系船柱、缆绳 */
const Boats = [];
const BOLLARDS = [];     // 世界坐标 {x,z,top}
let _haloTex = null;
function haloTexture() {
  if (_haloTex) return _haloTex;
  const c = mkCanvas(64, 64), x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return _haloTex = canvasTex(c);
}
function namePlateTexture(txt, sub) {
  const c = mkCanvas(256, 96), x = c.getContext('2d');
  x.clearRect(0, 0, 256, 96);
  x.fillStyle = '#183a52'; x.font = `bold 52px ${FONT_CJK}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(txt, 128, 38);
  x.fillStyle = '#b43a30'; x.font = `bold 24px ${FONT_CJK}`; x.fillText(sub, 128, 80);
  const t = canvasTex(c); return t;
}

class Rope {
  constructor(parent, a, b, opt = {}) {
    this.a = a; this.b = b; this.n = opt.n || 14; this.r = opt.r || 0.035; this.slack = opt.slack !== undefined ? opt.slack : 0.25;
    this.phase = rnd(0, 6.28); this.sides = 6; this.color1 = new Col(opt.c1 || '#e4602f'); this.color2 = new Col(opt.c2 || '#c64a22');
    const nv = (this.n + 1) * this.sides;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3); this.col = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    const idx = [];
    for (let i = 0; i < this.n; i++) for (let j = 0; j < this.sides; j++) {
      const a0 = i * this.sides + j, a1 = i * this.sides + (j + 1) % this.sides, b0 = a0 + this.sides, b1 = a1 + this.sides;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, MAT.rope); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    parent.add(this.mesh);
    this.pts = Array.from({ length: this.n + 1 }, () => new V3());
    this.A = new V3(); this.B = new V3();
  }
  update(t, A, B, slackAdd = 0) {
    const n = this.n, S = this.sides; const pts = this.pts;
    const sag = Math.max(0.02, this.slack + slackAdd) ;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts[i].lerpVectors(A, B, u); pts[i].y -= sag * 4 * u * (1 - u) * (1 + 0.15 * Math.sin(t * 0.8 + this.phase));
    }
    const tan = new V3(), ref = new V3(), nrm = new V3(), bin = new V3();
    for (let i = 0; i <= n; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n, i + 1)];
      tan.subVectors(p1, p0).normalize();
      ref.set(0, 1, 0); if (Math.abs(tan.y) > 0.9) ref.set(1, 0, 0);
      nrm.crossVectors(tan, ref).normalize(); bin.crossVectors(tan, nrm).normalize();
      const wet = pts[i].y < 0.08 ? 0.5 : (pts[i].y < 0.5 ? 0.8 : 1.0);
      const cc = (i % 2 ? this.color1 : this.color2);
      for (let j = 0; j < S; j++) {
        const a = j / S * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const k = (i * S + j) * 3;
        const nx = nrm.x * ca + bin.x * sa, ny = nrm.y * ca + bin.y * sa, nz = nrm.z * ca + bin.z * sa;
        this.pos[k] = pts[i].x + nx * this.r; this.pos[k + 1] = pts[i].y + ny * this.r; this.pos[k + 2] = pts[i].z + nz * this.r;
        this.nor[k] = nx; this.nor[k + 1] = ny; this.nor[k + 2] = nz;
        this.col[k] = cc.r * wet; this.col[k + 1] = cc.g * wet; this.col[k + 2] = cc.b * wet;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
}

function lifeRing(P, pos, rot, s = 1) {
  P.T(pos, rot, null, () => {
    for (let k = 0; k < 8; k++) P.T([0, 0, 0], [0, 0, k * Math.PI / 4], null, () => P.tor(0.19 * s, 0.055 * s, [0, 0, 0], k % 2 ? '#f6f4ec' : '#ee6a2c', [0, 0, 0], 4, 8, Math.PI / 4));
    P.tor(0.19 * s, 0.01, [0, 0, 0.0], '#2c2c2c', [0, 0, 0], 16, 3);
  });
}
function fenderTire(P, pos) {
  P.T(pos, [0, 0, 0], null, () => {
    P.tor(0.15, 0.065, [0, 0, 0], '#252b2f', [0, Math.PI / 2, 0], 14, 8);
    P.rod([0, 0.22, 0], [0, 0.34, 0.05], 0.012, '#d6d1c0', 4);
  });
}
function fishBox(P, pos, col, rot) {   // 白色塑料鱼箱（简化）
  P.T(pos, rot, null, () => {
    P.box(0.5, 0.26, 0.34, [0, 0.13, 0], col);
    P.box(0.46, 0.03, 0.30, [0, 0.265, 0], shade(col, 0.88));
    P.box(0.1, 0.03, 0.02, [0, 0.2, 0.175], shade(col, 0.8)); P.box(0.1, 0.03, 0.02, [0, 0.2, -0.175], shade(col, 0.8));
  });
}
function shade(c, k) { return toColor(c).clone().multiplyScalar(k); }

function createBoat(cfg) {
  const sh = hullShape(cfg.L, cfg.B, cfg.D, cfg.F);
  const group = new THREE.Group(); group.rotation.order = 'YXZ'; group.userData.spinners = [];
  const colors = { top: new Col(cfg.hull || '#f4f6f1'), accent: new Col(cfg.accent || '#2a8f94'), bottom: new Col(cfg.bottom || '#356574') };
  const hullG = hullGeometry(sh, colors, cfg.seed || 1);
  const hull = new THREE.Mesh(hullG, MAT.hull); hull.castShadow = true; hull.receiveShadow = true; group.add(hull);
  const P = new Parts(); P.jit = 0.02; const Pin = new Parts(); Pin.jit = 0.02; const Pg = new Parts(); Pg.jit = 0;
  const out = { screens: [], paper: [], wheel: null };
  const yd = cfg.deckY || 0.34;
  // 甲板
  const deckGeo = deckGeometry(sh, yd);
  const deck = new THREE.Mesh(deckGeo, toonMat({ color: cfg.deck || '#c9b894', vc: false, drops: 0.8, gloss: 0.2 })); deck.receiveShadow = true; group.add(deck);
  const { L, B } = cfg;
  // 舷墙压条与栏杆
  const rail = (side) => {
    let prev = null;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, z = -L / 2 + t * L, y = sh.gun(t) + 0.015, x = side * (sh.halfW(z, y) - 0.005);
      const p = [x, y, z]; if (prev) P.rod(prev, p, 0.022, cfg.rail || '#e9ece6', 5); prev = p;
    }
  };
  rail(-1); rail(1);
  { const pts = []; for (const side of [-1, 1]) for (let i = 1; i < 28; i++) { const t = i / 28 * 0.98 + 0.01, z = -L / 2 + t * L, y = sh.gun(t) + 0.04; pts.push([side * (sh.halfW(z, y) - 0.005) + rnd(-0.01, 0.01), y + 0.012, z + rnd(-0.03, 0.03)]); } group.add(makeBeads(pts, 0.012, 0.027)); }
  P.box(B * 0.72, 0.06, 0.07, [0, 0.4, -L / 2 + 0.03], '#e7ebe5');
  // 钢缆桩 cleats
  const cleats = [];
  const cleat = (x, z) => { P.box(0.16, 0.035, 0.05, [x, sh.gun(clamp((z + L / 2) / L, 0, 1)) + 0.05, z], '#9aa3a3'); P.box(0.04, 0.05, 0.05, [x, sh.gun(clamp((z + L / 2) / L, 0, 1)) + 0.03, z], '#80898a'); };
  const cl = (x, z) => { cleat(x, z); cleats.push(new V3(x, sh.gun(clamp((z + L / 2) / L, 0, 1)) + 0.07, z)); };
  const bowZ = L / 2 - 0.55, sternZ = -L / 2 + 0.45;
  cl(0, bowZ); cl(0.5 * (B / 2), sternZ); cl(-0.5 * (B / 2), sternZ);
  cl(B / 2 - 0.12, bowZ - 0.3); cl(B / 2 - 0.12, sternZ + 0.2);
  out.cleats = cleats;
  { // 斑驳锈迹：舷边、甲板角落与舷侧水渍锈痕
    const rustC = ['#9c6a4e', '#85604a', '#a77a58', '#7a5646'];
    for (let i = 0; i < 9; i++) { const t = rnd(0.08, 0.92), z = -L / 2 + t * L, side = R() < 0.5 ? -1 : 1, y = sh.gun(t) + 0.045; P.box(rnd(0.03, 0.07), 0.006, rnd(0.03, 0.07), [side * (sh.halfW(z, y) - rnd(0.02, 0.05)), y, z], pick(rustC), [0, rnd(-0.5, 0.5), 0]); }
    for (let i = 0; i < 6; i++) { const z = rnd(-L / 2 + 0.3, L / 2 - 0.5), side = R() < 0.5 ? -1 : 1; P.box(rnd(0.08, 0.18), 0.006, rnd(0.06, 0.14), [side * rnd(0.1, B / 2 - 0.12), yd + 0.005, z], pick(rustC), [0, rnd(-0.6, 0.6), 0]); }
    for (let i = 0; i < 9; i++) { const t = rnd(0.12, 0.9), z = -L / 2 + t * L, side = R() < 0.5 ? -1 : 1, y = rnd(0.2, 0.44); P.box(0.005, rnd(0.07, 0.2), rnd(0.015, 0.035), [side * (sh.halfW(z, y) + 0.008), y, z], pick(rustC)); }
  }
  // 护舷轮胎（靠岸侧 +x 多一些）
  for (const z of [-L * 0.28, 0, L * 0.26]) { const y = 0.38, x = sh.halfW(z, y) + 0.06; fenderTire(P, [x, y, z]); }
  for (const z of [-L * 0.2, L * 0.24]) { const y = 0.38, x = -(sh.halfW(z, y) + 0.06); fenderTire(P, [x, y, z]); }
  if (cfg.cabin) { // 船舷外侧挂的橙白救生圈（朝水面一侧）
    const zr = L * 0.04, yr = 0.44, xr = -(sh.halfW(zr, yr) + 0.05);
    lifeRing(P, [xr, yr, zr], [0, -Math.PI / 2, 0], 0.9);
    P.box(0.03, 0.12, 0.05, [xr + 0.03, yr + 0.27, zr], '#8a8f8d'); P.rod([xr, yr + 0.24, zr - 0.1], [xr + 0.03, yr + 0.34, zr - 0.04], 0.01, '#d6cfb8', 4);
  }
  // 灯
  P.sph(0.035, [-B * 0.45, 0.8, L * 0.2], '#d63a35', null, 6, 5); P.sph(0.035, [B * 0.45, 0.8, L * 0.2], '#3aa660', null, 6, 5);
  // 船首滚轮/锚
  P.box(0.1, 0.06, 0.34, [0, sh.gun(1) + 0.02, L / 2 - 0.22], '#7d8786'); P.cyl(0.04, 0.04, 0.12, 8, [0, sh.gun(1) + 0.06, L / 2 - 0.1], '#6d7878', [0, 0, Math.PI / 2]);
  // 名牌
  const plateTex = namePlateTexture(cfg.name, cfg.sub);
  for (const side of [-1, 1]) {
    const z = L * 0.22, y = 0.34, x = side * (sh.halfW(z, y) + 0.03);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), toonMat({ map: plateTex, vc: false, color: 0xffffff, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide }));
    pm.position.set(x, y, z); pm.rotation.y = side * Math.PI / 2; pm.rotation.z = 0; pm.layers.set(LAYER.GLASS); group.add(pm);
  }
  { // 水线浪花环 + 船舷水光
    const ring = [];
    for (let i = 0; i <= 26; i++) { const t = i / 26, z = -L / 2 + t * L; ring.push([sh.halfW(z, 0.0) + 0.0, z]); }
    for (let i = 26; i >= 0; i--) { const t = i / 26, z = -L / 2 + t * L; ring.push([-sh.halfW(z, 0.0), z]); }
    ring.push(ring[0]);
    const pts = ring.map((p, i) => { const a = ring[Math.max(0, i - 1)], b = ring[Math.min(ring.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; return [p[0], p[1], tz, -tx]; });
    group.add(makeFoamRibbon(pts, 0.2, 0.03));
    for (const side of [-1, 1]) group.add(makeCaustic(L * 0.9, 0.45, [side * (sh.halfW(0, 0.3) + 0.02), 0.3, 0.0], [0, side * Math.PI / 2, 0], { amt: 0.28, scale: 1.2, color: '#d6fbf2' }));
  }
  if (cfg.cabin) {
    const c = cfg.cabin;
    addCabin(P, Pin, Pg, { ...c, y0: yd, seed: cfg.seed, roof: cfg.roof, accent: cfg.accent }, out);
    addHelm(P, Pin, null, { ...c, y0: yd }, out);
    addCabinDetails(P, Pin, { ...c, y0: yd, seed: cfg.seed }, out);
    { // 阳光穿过舱窗形成的光柱 + 舱顶棚上摇曳的水面反光
      const qh = new Q4().setFromEuler(new Eul(0, cfg.heading || 0, 0));
      const sl = Env.sunDir.clone().applyQuaternion(qh.clone().invert());
      const sgn = Math.sign(sl.x) || 1, ld = sl.clone().negate();
      const xx = sgn * c.hw, yb = yd + 0.36, yt = yd + c.h - 0.2, za = c.z0 + 0.12, zb = c.z1 - 0.12;
      const top = [new V3(xx, yb, za), new V3(xx, yb, zb), new V3(xx, yt, zb), new V3(xx, yt, za)];
      group.add(makeShaft(top, ld, (yb - yd - 0.03) / Math.abs(ld.y), { amt: 0.55, color: '#ffe9b0' }));
      const se = Shafts[Shafts.length - 1]; se.owner = group; se.localC = se.c.clone();
      group.add(makeCaustic(2 * c.hw - 0.12, c.z1 - c.z0 - 0.1, [0, yd + c.h - 0.02, (c.z0 + c.z1) / 2], [Math.PI / 2, 0, 0], { amt: 0.42, scale: 1.6 }));
      const ce = Caustics[Caustics.length - 1]; ce.owner = group; ce.localC = ce.c.clone();
    }
  }
  if (cfg.extra) cfg.extra({ P, Pin, Pg, group, out, sh, yd, cfg });
  const mExt = mesh(P.build(), MAT.boatExt); group.add(mExt);
  const mInt = mesh(Pin.build(), MAT.vcCabin || (MAT.vcCabin = toonMat({ vc: true, lift: 0.42 }))); group.add(mInt);
  if (Pg.cnt) { const mg = new THREE.Mesh(Pg.build(), MAT.glass); mg.layers.set(LAYER.GLASS); mg.renderOrder = 12; group.add(mg); }
  // 发光屏 / 纸张
  out.screenObjs = [];
  for (const s of out.screens) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), screenMat(s.tex.tex)); m.position.set(...s.pos); m.rotation.set(...s.rot); m.rotation.order = 'YXZ'; group.add(m);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0] * 2.4, s.size[1] * 2.4), new THREE.MeshBasicMaterial({ map: haloTexture(), color: s.kind === 'radar' ? '#6dffb8' : '#6fd8ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    halo.position.set(s.pos[0], s.pos[1], s.pos[2]); halo.rotation.set(...s.rot); halo.rotation.order = 'YXZ'; halo.translateZ(0.03); halo.layers.set(LAYER.FX); halo.renderOrder = 15; group.add(halo);
    out.screenObjs.push({ s, m, halo });
  }
  for (const p of out.paper) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), new THREE.MeshBasicMaterial({ map: p.tex, toneMapped: false, color: 0xe9f1f0 }));
    m.position.set(...p.pos); m.rotation.set(...p.rot); m.rotation.order = 'YXZ'; group.add(m);
  }
  if (cfg.cabin) { // 局部点光源：驾驶舱微微的暖光
    // 用发光半透明小片表现，不增加真实光源数量
  }
  Object.assign(group.userData, { cfg, sh, out, cleats });
  return group;
}

/* ---------- 具体船只 ---------- */
function extraTypeA(ctx) {
  const { P, Pin, group, sh, yd, cfg } = ctx; const c = cfg.cabin;
  const hw = c.hw, y0 = yd, h = c.h, zc = (c.z0 + c.z1) / 2;
  const roofY = y0 + h + 0.07;
  // 舱顶：雷达罩、桅杆、天线、遮阳铁架
  P.cyl(0.04, 0.05, 0.4, 8, [-0.42, roofY + 0.2, c.z0 + 0.5], '#c8d0cf');
  P.sph(0.22, [-0.42, roofY + 0.52, c.z0 + 0.5], '#f6f8f5', [1, 0.82, 1], 14, 10);
  P.tor(0.22, 0.012, [-0.42, roofY + 0.50, c.z0 + 0.5], '#a8b3b2', [Math.PI / 2, 0, 0], 16, 4);
  P.cyl(0.03, 0.04, 1.35, 7, [0.32, roofY + 0.68, c.z0 + 0.4], '#d7dcd8');
  P.rod([0.32, roofY + 1.33, c.z0 + 0.4], [0.32, roofY + 1.92, c.z0 + 0.4], 0.012, '#8b9493', 5);
  P.rod([0.32, roofY + 1.55, c.z0 + 0.4], [0.32, roofY + 1.55, c.z0 + 0.4 + 0.3], 0.008, '#8b9493', 4);
  P.rod([0.32, roofY + 1.2, c.z0 + 0.4], [0.32 + 0.45, roofY + 1.2, c.z0 + 0.4], 0.01, '#8b9493', 4);
  for (const [a, b] of [[[0.32, roofY + 1.0, c.z0 + 0.4], [0.32, roofY + 0.8, c.z0 + 0.75]], [[0.32, roofY + 1.0, c.z0 + 0.4], [-0.1, roofY + 0.1, c.z0 + 0.5]]]) P.rod(a, b, 0.006, '#a4aaa7', 3);
  P.sph(0.03, [0.32, roofY + 1.93, c.z0 + 0.4], '#d63a35', null, 6, 5);
  // 风速杯（旋转）
  const cups = new THREE.Group(); cups.position.set(0.32, roofY + 1.35, c.z0 + 0.4);
  const pc = new Parts(); pc.jit = 0;
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3; pc.rod([0, 0, 0], [Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13], 0.006, '#9aa4a4', 4); pc.sph(0.035, [Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13], '#e9eeee', [1, 0.7, 1], 6, 4); }
  cups.add(mesh(pc.build(), MAT.vc)); group.add(cups); group.userData.spinners.push({ o: cups, s: 3 });
  // 开放阵列式雷达天线（缓转）
  const arr = new THREE.Group(); arr.position.set(0.25, roofY + 0.5, c.z0 + 0.45);
  const pr = new Parts(); pr.jit = 0; pr.cyl(0.02, 0.03, 0.3, 6, [0, -0.2, 0], '#aab2b0'); pr.box(0.62, 0.035, 0.07, [0, 0, 0], '#dadfdc'); pr.box(0.06, 0.05, 0.08, [0, 0, 0], '#8f9896');
  arr.add(mesh(pr.build(), MAT.vc)); group.add(arr); group.userData.spinners.push({ o: arr, s: 1.6 });
  // 遮阳铁架（后甲板上方）：四根立柱+框，帆布一半
  const zf0 = c.z0 - 1.55, zf1 = c.z0 - 0.02, fy = y0 + h + 0.12, fw = 0.78;
  for (const sx of [-1, 1]) for (const z of [zf0, zf1]) P.rod([sx * fw, y0 + 0.02, z], [sx * fw, fy, z], 0.025, '#9e5b34', 6);
  P.rod([-fw, fy, zf0], [fw, fy, zf0], 0.022, '#a4623a', 6); P.rod([-fw, fy, zf1], [fw, fy, zf1], 0.022, '#a4623a', 6);
  for (const sx of [-1, 1]) P.rod([sx * fw, fy, zf0], [sx * fw, fy, zf1], 0.022, '#a4623a', 6);
  for (let k = 1; k < 4; k++) P.rod([-fw, fy, zf0 + (zf1 - zf0) * k / 4], [fw, fy, zf0 + (zf1 - zf0) * k / 4], 0.012, '#9e5b34', 5);
  P.box(fw * 2 + 0.1, 0.012, (zf1 - zf0) * 0.55, [0, fy + 0.02, zf0 + (zf1 - zf0) * 0.275], '#5b9fb3');
  // 后甲板：钓座、插竿筒、冰桶、渔具
  P.cyl(0.015, 0.015, 0.28, 6, [-0.38, y0 + 0.14, -cfg.L / 2 + 0.7], '#4b565a'); P.cyl(0.15, 0.15, 0.07, 12, [-0.38, y0 + 0.31, -cfg.L / 2 + 0.7], '#25506b');
  P.box(0.05, 0.16, 0.2, [-0.38, y0 + 0.45, -cfg.L / 2 + 0.58], '#25506b');
  for (const x of [-0.7, -0.5, 0.5, 0.7]) { P.cyl(0.03, 0.03, 0.18, 8, [x, y0 + 0.09, -cfg.L / 2 + 0.25], '#363f42'); P.rod([x, y0 + 0.14, -cfg.L / 2 + 0.25], [x + (x < 0 ? -0.2 : 0.2), y0 + 1.3, -cfg.L / 2 - 0.5], 0.012, '#2a2f31', 4); }
  P.box(0.55, 0.38, 0.38, [0.4, y0 + 0.19, -cfg.L / 2 + 1.05], '#2f7fa6'); P.box(0.58, 0.04, 0.41, [0.4, y0 + 0.4, -cfg.L / 2 + 1.05], '#e8f0f2');
  fishBox(P, [-0.45, y0, -cfg.L / 2 + 1.5], '#f2f3ef', [0, 0.2, 0]);
  lifeRing(P, [c.hw - 0.04, roofY + 0.27, zc + 0.15], [0, Math.PI / 2, 0]); P.box(0.04, 0.08, 0.06, [c.hw - 0.04, roofY + 0.04, zc + 0.15 - 0.1], '#9aa3a3'); P.box(0.04, 0.08, 0.06, [c.hw - 0.04, roofY + 0.04, zc + 0.15 + 0.1], '#9aa3a3');
  // 船首甲板
  P.box(0.5, 0.05, 0.6, [0, y0 + 0.03, cfg.L / 2 - 0.9], '#a86b44');
}
function extraTypeB(ctx) {
  const { P, group, yd, cfg } = ctx; const c = cfg.cabin; const y0 = yd;
  const roofY = y0 + c.h + 0.07;
  P.cyl(0.025, 0.03, 0.9, 7, [-0.2, roofY + 0.45, c.z0 + 0.1], '#d7dcd8');
  P.rod([-0.2, roofY + 0.9, c.z0 + 0.1], [-0.2, roofY + 1.35, c.z0 + 0.1], 0.01, '#8b9493', 4);
  P.sph(0.14, [0.3, roofY + 0.16, c.z0 - 0.08], '#f6f8f5', [1, 0.8, 1], 12, 8);
  const flag = new Parts(); // 小旗（摆动）
  const g = new THREE.PlaneGeometry(0.28, 0.17, 6, 2); g.translate(0.14, 0, 0);
  const sw = (x, y, z) => [clamp((x - (0)) / 0.3, 0, 1), 1.3];
  flag.add(g, [-0.188, roofY + 1.26, c.z0 + 0.1], [0, Math.PI / 2 + 0.2, 0], null, '#e65a3a', (x, y, z) => [clamp((Math.hypot(x - 0, z - (c.z0 + 0.1))) / 0.3, 0, 1), 0.5]);
  const mf = mesh(flag.build(), toonMat({ vc: true, sway: 2, side: THREE.DoubleSide }), { cast: false }); group.add(mf);
  // 后甲板：鱼箱堆、渔网、吊杆
  fishBox(P, [0.3, y0, -cfg.L / 2 + 0.7], '#f2f3ef'); fishBox(P, [0.3, y0 + 0.26, -cfg.L / 2 + 0.7], '#2d77b8', [0, 0.1, 0]); fishBox(P, [-0.35, y0, -cfg.L / 2 + 0.75], '#f2f3ef', [0, -0.1, 0]);
  fishBox(P, [-0.3, y0, -cfg.L / 2 + 1.35], '#2d77b8', [0, 0.3, 0]);
  P.rod([0.5, y0, -cfg.L / 2 + 0.3], [0.5, y0 + 1.1, -cfg.L / 2 + 0.3], 0.03, '#a85d34', 6); P.rod([0.5, y0 + 1.1, -cfg.L / 2 + 0.3], [0.15, y0 + 1.25, -cfg.L / 2 + 0.9], 0.02, '#a85d34', 6);
  P.rod([0.15, y0 + 1.25, -cfg.L / 2 + 0.9], [0.15, y0 + 0.75, -cfg.L / 2 + 0.9], 0.006, '#cfcab8', 3); P.sph(0.04, [0.15, y0 + 0.72, -cfg.L / 2 + 0.9], '#e8553a', null, 6, 5);
  P.tor(0.16, 0.035, [-0.42, y0 + 0.05, cfg.L / 2 - 1.35], '#d94a2a', [Math.PI / 2, 0, 0], 12, 6);
  lifeRing(P, [-c.hw + 0.04, roofY + 0.27, (c.z0 + c.z1) / 2], [0, -Math.PI / 2, 0]);
  { const fw = 0.55, fy = roofY + 0.02, za = c.z0 - 1.05, zb = c.z0 - 0.04;   // 遮阳铁架
    for (const sx of [-1, 1]) for (const z of [za, zb]) P.rod([sx * fw, y0 + 0.02, z], [sx * fw, fy, z], 0.022, '#a4623a', 6);
    P.rod([-fw, fy, za], [fw, fy, za], 0.02, '#a4623a', 6); P.rod([-fw, fy, zb], [fw, fy, zb], 0.02, '#a4623a', 6);
    for (const sx of [-1, 1]) P.rod([sx * fw, fy, za], [sx * fw, fy, zb], 0.02, '#a4623a', 6);
    P.rod([-fw, fy, za], [fw, fy, zb], 0.012, '#9e5b34', 5); P.box(fw * 2 + 0.06, 0.012, (zb - za) * 0.45, [0, fy + 0.02, za + (zb - za) * 0.225], '#d9a14a'); }
  P.cyl(0.11, 0.1, 0.22, 10, [0.18, y0 + 0.11, cfg.L / 2 - 1.1], '#e8873a');    // 水桶
  P.tor(0.11, 0.008, [0.18, y0 + 0.22, cfg.L / 2 - 1.1], '#7b6a58', [Math.PI / 2, 0, 0], 10, 3);
}
function extraTypeC(ctx) {
  const { P, group, yd, cfg } = ctx; const c = cfg.cabin; const y0 = yd; const zc = (c.z0 + c.z1) / 2; const roofY = y0 + c.h + 0.07;
  P.cyl(0.035, 0.045, 1.1, 7, [0, roofY + 0.55, c.z0 + 0.2], '#e0e5e1');
  P.rod([0, roofY + 1.1, c.z0 + 0.2], [0, roofY + 1.7, c.z0 + 0.2], 0.012, '#8e9796', 5);
  P.rod([-0.34, roofY + 1.26, c.z0 + 0.2], [0.34, roofY + 1.26, c.z0 + 0.2], 0.012, '#8e9796', 5);
  P.sph(0.2, [0.3, roofY + 0.14, c.z0 + 0.25], '#f6f8f5', [1, 0.8, 1], 12, 8);
  for (const [a, b] of [[[0, roofY + 1.62, c.z0 + 0.2], [0, roofY + 1.0, zc - 0.65]], [[0, roofY + 1.62, c.z0 + 0.2], [0, roofY + 1.0, zc + 0.85]]]) P.rod(a, b, 0.005, '#adb2af', 3);
  const flag = new Parts();
  const g = new THREE.PlaneGeometry(0.34, 0.2, 6, 2); g.translate(0.17, 0, 0);
  flag.add(g, [0.012, roofY + 1.6, c.z0 + 0.2], [0, Math.PI / 2, 0], null, '#d9453a', (x, y, z) => [clamp(Math.abs(z - (c.z0 + 0.2)) / 0.34, 0, 1), 0.2]);
  group.add(mesh(flag.build(), toonMat({ vc: true, sway: 2, side: THREE.DoubleSide }), { cast: false }));
  // 起网机 / 吊杆 / 浮球
  P.box(0.4, 0.36, 0.34, [0, y0 + 0.18, -cfg.L / 2 + 0.7], '#6c7f86'); P.cyl(0.11, 0.11, 0.18, 10, [0, y0 + 0.45, -cfg.L / 2 + 0.7], '#4d5d63', [0, 0, Math.PI / 2]);
  P.rod([-0.55, y0, -cfg.L / 2 + 0.45], [-0.55, y0 + 1.3, -cfg.L / 2 + 0.45], 0.03, '#aab2b0', 6); P.rod([-0.55, y0 + 1.3, -cfg.L / 2 + 0.45], [-0.3, y0 + 1.2, -cfg.L / 2 + 1.0], 0.02, '#aab2b0', 6);
  for (let i = 0; i < 6; i++) P.sph(0.075, [0.35 + (i % 3) * 0.17, y0 + 0.08, cfg.L / 2 - 0.95 + Math.floor(i / 3) * 0.17], i % 2 ? '#f4a62b' : '#e8553a', null, 8, 6);
  fishBox(P, [0.5, y0, -cfg.L / 2 + 1.35], '#f2f3ef'); fishBox(P, [0.5, y0 + 0.26, -cfg.L / 2 + 1.35], '#f2f3ef', [0, 0.2, 0]); fishBox(P, [-0.5, y0, -cfg.L / 2 + 1.5], '#2d77b8', [0, 0.1, 0]);
  lifeRing(P, [c.hw - 0.04, roofY + 0.27, zc - 0.1], [0, Math.PI / 2, 0]);
  lifeRing(P, [-c.hw + 0.04, roofY + 0.27, zc - 0.1], [0, -Math.PI / 2, 0]);
  P.tor(0.2, 0.04, [0.4, y0 + 0.05, -cfg.L / 2 + 0.35], '#e0c7a3', [Math.PI / 2, 0, 0], 12, 6);
  // 铁架
  const fw = 0.62, fy = y0 + c.h + 0.1, zf0 = c.z0 - 0.9, zf1 = c.z0 - 0.02;
  for (const sx of [-1, 1]) for (const z of [zf0, zf1]) P.rod([sx * fw, y0 + 0.02, z], [sx * fw, fy, z], 0.022, '#a4623a', 6);
  P.rod([-fw, fy, zf0], [fw, fy, zf0], 0.02, '#a4623a', 6); P.rod([-fw, fy, zf1], [fw, fy, zf1], 0.02, '#a4623a', 6);
  for (const sx of [-1, 1]) P.rod([sx * fw, fy, zf0], [sx * fw, fy, zf1], 0.02, '#a4623a', 6);
}
function extraTypeD(ctx) {
  const { P, Pin, group, yd, cfg } = ctx; const y0 = yd; const L = cfg.L;
  // 船外机
  P.box(0.28, 0.4, 0.22, [0, y0 + 0.22, -L / 2 - 0.02], '#d9dede'); P.box(0.3, 0.1, 0.24, [0, y0 + 0.5, -L / 2 - 0.02], '#2c8a8e');
  P.cyl(0.03, 0.03, 0.6, 6, [0, y0 - 0.1, -L / 2 - 0.1], '#c6cccc'); P.sph(0.06, [0, y0 - 0.38, -L / 2 - 0.1], '#c6cccc', [1.4, 0.9, 1.0], 8, 6);
  P.rod([0, y0 + 0.3, -L / 2 - 0.12], [0, y0 + 0.28, -L / 2 + 0.7], 0.018, '#555', 5);
  // 长椅与桶
  P.box(1.2, 0.06, 0.28, [0, y0 + 0.28, 0.1], '#cbb48c'); P.box(1.2, 0.05, 0.26, [0, y0 + 0.28, -0.8], '#cbb48c');
  P.cyl(0.14, 0.12, 0.28, 12, [0.3, y0 + 0.14, L / 2 - 0.8], '#e8873a'); P.tor(0.14, 0.008, [0.3, y0 + 0.28, L / 2 - 0.8], '#6e5b4a', [Math.PI / 2, 0, 0], 10, 3);
  P.rod([-0.3, y0 + 0.05, L / 2 - 0.6], [-0.1, y0 + 0.4, -0.5], 0.012, '#2a2f31', 4);
  P.tor(0.14, 0.03, [-0.35, y0 + 0.05, L / 2 - 1.1], '#e0c7a3', [Math.PI / 2, 0, 0], 12, 6);
  fishBox(P, [0.2, y0, -0.2], '#2d77b8', [0, 0.3, 0]);
  lifeRing(P, [0.0, y0 + 0.05, -L / 2 + 0.4], [Math.PI / 2, 0, 0], 0.9);
}

function buildBoats(scene) {
  MAT.hull = toonMat({ vc: true, side: THREE.DoubleSide, gloss: 0.4, drops: 0.9, under: false });
  MAT.boatExt = toonMat({ vc: true, gloss: 0.35, drops: 0.9 });
  MAT.glass = glassMat({ tint: '#c8eef0', opacity: 0.16 });
  MAT.rope = toonMat({ vc: true, under: true, side: THREE.DoubleSide });
  const cfgs = [
    { id: 'B1', L: 4.3, B: 1.62, D: 0.46, F: 0.58, name: '日和丸', sub: 'HIYORI 3', seed: 3, accent: '#e0572e', roof: '#f4f6f2', deck: '#a8c6c4', x: -4.95, z: 3.5, heading: Math.PI, extra: extraTypeB, rope: [[5.9, 1.2]],
      cabin: { z0: 0.2, z1: 1.2, hw: 0.6, h: 0.98 } },
    { id: 'B2', L: 5.0, B: 1.92, D: 0.52, F: 0.62, name: '凪風丸', sub: 'NAGIKAZE', seed: 5, accent: '#2a8f94', roof: '#f6f7f2', deck: '#cdb994', x: -4.78, z: -1.3, heading: Math.PI, extra: extraTypeA,
      cabin: { z0: -0.95, z1: 0.95, hw: 0.74, h: 1.04 } },
    { id: 'B3', L: 4.6, B: 1.82, D: 0.5, F: 0.6, name: '海月丸', sub: 'UMITSUKI', seed: 9, accent: '#cf3d34', roof: '#f4f6f2', deck: '#9fc1c3', x: -4.83, z: -6.3, heading: Math.PI, extra: extraTypeC, hull: '#f7f8f3',
      cabin: { z0: -0.6, z1: 0.6, hw: 0.66, h: 1.0 } },
    { id: 'B4', L: 3.5, B: 1.45, D: 0.4, F: 0.5, name: '小凪', sub: 'NO.7', seed: 12, accent: '#2a8f94', deck: '#b9a47e', x: -1.6, z: 5.0, heading: Math.PI / 2, extra: extraTypeD, rope: [] }
  ];
  for (const c of cfgs) {
    const g = createBoat(c);
    g.position.set(c.x, 0, c.z); g.rotation.y = c.heading;
    scene.add(g); g.updateMatrixWorld(true);
    for (const arr of [Shafts, Caustics]) for (const e of arr) if (e.owner === g) e.c = g.localToWorld(e.localC.clone());
    const b = { g, cfg: c, home: new V3(c.x, 0, c.z), homeHead: c.heading, ph: [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)], ropes: [], nudge: 0, nudgeLast: 0, mode: 'moored' };
    Boats.push(b);
  }
  // 系船柱（黑色铸铁，哑光），绕缆
  const Pb = new Parts(); Pb.jit = 0.02;
  const bollard = (x, z, dir) => {   // dir: 缆绳朝向(指向水域)
    const y = QH;
    Pb.cyl(0.19, 0.22, 0.1, 12, [x, y + 0.05, z], '#1d2225'); Pb.cyl(0.12, 0.15, 0.2, 12, [x, y + 0.2, z], '#1d2225');
    Pb.cyl(0.19, 0.12, 0.1, 12, [x, y + 0.35, z], '#22282b'); Pb.sph(0.19, [x, y + 0.4, z], '#242a2d', [1, 0.45, 1], 12, 6);
    Pb.box(0.4, 0.05, 0.07, [x, y + 0.32, z], '#161a1c');
    BOLLARDS.push({ x, z, top: new V3(x + dir[0] * 0.1, y + 0.3, z + dir[1] * 0.1) });
  };
  [5.8, 3.4, 1.0, -1.3, -3.9, -6.2, -8.8].forEach(z => bollard(-6.64, z, [1, 0]));
  [-4.0, -1.7, 0.45].forEach(x => bollard(x, 6.64, [0, -1]));
  scene.add(mesh(Pb.build(), MAT.bollard || (MAT.bollard = toonMat({ vc: true, gloss: 0.08 }))));
  // 绕缆圈：在系船柱颈部绕数圈
  const Pc = new Parts(); Pc.jit = 0.03;
  const wraps = [[-6.64, 5.8], [-6.64, 1.0], [-6.64, -3.9], [-6.64, -8.8], [-6.64, 3.4], [-6.64, -1.3], [-6.64, -6.2], [-4.0, 6.64], [-1.7, 6.64], [0.45, 6.64]];
  for (const [x, z] of wraps) {
    const turns = 3 + ((x * 7 + z * 3) & 1);
    for (let k = 0; k < turns; k++) Pc.tor(0.15 - k * 0.0, 0.046, [x, QH + 0.16 + k * 0.045, z], k % 2 ? '#e4602f' : '#cf4f25', [Math.PI / 2 + 0.06 * (k % 2 ? 1 : -1), 0, 0.04 * k], 14, 6);
  }
  scene.add(mesh(Pc.build(), MAT.vcWet));
  // 缆绳实体
  const bol = (x, z) => BOLLARDS.find(b => Math.abs(b.x - x) < 0.05 && Math.abs(b.z - z) < 0.05);
  const link = (boat, cleatIdx, bx, bz, slack, r = 0.055) => {
    const rope = new Rope(scene, boat.g.userData.cleats[cleatIdx], bol(bx, bz).top, { slack, r });
    boat.ropes.push({ rope, ci: cleatIdx, bt: bol(bx, bz).top });
  };
  const [B1, B2, B3, B4] = Boats;
  link(B1, 1, -6.64, 5.8, 0.28); link(B1, 0, -6.64, 1.0, 0.35); link(B1, 3, -6.64, 3.4, 0.22);
  link(B2, 0, -6.64, -3.9, 0.35); link(B2, 1, -6.64, 1.0, 0.3); link(B2, 3, -6.64, -1.3, 0.2);
  link(B3, 0, -6.64, -8.8, 0.35); link(B3, 1, -6.64, -3.9, 0.3); link(B3, 3, -6.64, -6.2, 0.2);
  link(B4, 0, 0.45, 6.64, 0.3); link(B4, 2, -4.0, 6.64, 0.28);
  // 垂入水中的闲置缆绳
  const hang = (x, z, dx, dz = 0.2) => { const top = bol(x, z).top.clone(); const end = new V3(top.x + dx, -0.55, top.z + dz); const r = new Rope(scene, top, end, { slack: 0.0, r: 0.052, n: 12 }); r.fixed = [top, end]; Boats.hang = Boats.hang || []; Boats.hang.push(r); };
  hang(-6.64, 5.8, 0.85); hang(-6.64, -6.2, 0.9); hang(-1.7, 6.64, 0.0, -1.2); hang(-6.64, -1.3, 0.8);

  Systems.push(updateBoats);
}

const _bp = new V3();
function updateBoats(dt, t) {
  for (const b of Boats) {
    const g = b.g, ph = b.ph;
    if (b.mode === 'moored') {
      const w = Wake.at(b.home.x, b.home.z);
      // 轻微起伏、摇摆；偶尔贴近岸壁轻碰
      const nudge = Math.pow(Math.max(0, Math.sin(t * 0.21 + ph[3] * 3)), 8);
      const hit = nudge > 0.93 && b.nudgeLast <= 0.93;
      b.nudgeLast = nudge;
      const lat = Math.sin(t * 0.43 + ph[0]) * 0.05, toWall = lat * 0.6 + nudge * 0.17, sway = toWall;
      const heave = Math.sin(t * 1.15 + ph[0]) * 0.035 + Math.sin(t * 1.9 + ph[1]) * 0.012 + w * 0.05 * Math.sin(t * 5 + ph[2]);
      const dirx = Math.sin(b.homeHead), dirz = Math.cos(b.homeHead);   // 船首方向
      // 靠岸侧为船体局部 +x
      const rx = Math.cos(b.homeHead), rz = -Math.sin(b.homeHead);
      const toward = -(sway) ;
      g.position.set(b.home.x - (b.cfg.id === 'B4' ? 0 : sway), heave + 0.02, b.home.z + (b.cfg.id === 'B4' ? sway : 0) + Math.sin(t * 0.31 + ph[1]) * 0.07);
      g.rotation.y = b.homeHead + Math.sin(t * 0.37 + ph[1]) * 0.018 + w * 0.03 * Math.sin(t * 3 + ph[0]);
      g.rotation.z = Math.sin(t * 1.0 + ph[2]) * 0.028 + nudge * 0.015 + w * 0.08 * Math.sin(t * 4.5);
      g.rotation.x = Math.sin(t * 0.8 + ph[3]) * 0.014 + w * 0.05 * Math.sin(t * 3.7);
      if (hit) Ripples.add(b.home.x + (b.cfg.id === 'B4' ? 0 : -0.95), b.home.z + (b.cfg.id === 'B4' ? 0.7 : 0.3), 1.0);
    }
    // 缆绳：随船摇晃时紧时松
    g.updateMatrixWorld(true);
    for (const r of b.ropes) {
      _bp.copy(g.userData.cleats[r.ci]); g.localToWorld(_bp);
      const dist = _bp.distanceTo(r.bt);
      const slackAdd = 0.12 * Math.sin(t * 0.9 + r.rope.phase) - 0.04 + (b.mode !== 'moored' ? 0.4 : 0);
      r.rope.update(t, _bp, r.bt, slackAdd);
    }
    // 旋转件
    for (const s of g.userData.spinners) s.o.rotation.y += dt * s.s * (1 + Env.windAt(g.position.x, g.position.z) * 4);
    // 驾驶舱屏幕
    if (g.userData.out.screenObjs.length && (Math.floor(t * 12) !== b._sf)) {
      b._sf = Math.floor(t * 12);
      for (const so of g.userData.out.screenObjs) so.s.tex.draw(t + so.s.pos[0] * 3);
      const k = 0.85 + 0.15 * Math.sin(t * 3);
      for (const so of g.userData.out.screenObjs) so.halo.material.opacity = 0.4 * k * (1 + Env.dark * 0.8);
    }
  }
  if (Boats.hang) for (const r of Boats.hang) {
    const sw = Math.sin(Env.t * 0.9 + r.phase) * 0.06;
    const end = r.fixed[1].clone(); end.x += sw; end.z += sw * 0.6;
    r.update(Env.t, r.fixed[0], end, 0.0);
  }
}
