'use strict';
/* 世界常量 + 底座 / 码头岸壁 / 水下环境 */
const QH = 0.9;               // 码头面高度
const SEA_Y = 0, BOT = -3;
const Systems = [];            // 每帧更新函数集合 (dt, t)
const AREA = {
  stem: { x0: -14, x1: -6, z0: -9.5, z1: 14 },
  foot: { x0: -6, x1: 9, z0: 6, z1: 14 },
  hill: { x0: -14, x1: -4, z0: -14, z1: -9.5 },
  jetty: { x0: -4, x1: 4.6, z0: -12.2, z1: -10.0 }
};
const MAT = {};
function initMaterials() {
  MAT.conc = toonMat({ color: '#c6cdc7', concrete: true, gloss: 0.5, vc: false });
  MAT.concIn = toonMat({ color: '#c3cac5', concrete: true, gloss: 0.5, vc: false, under: true });
  MAT.hazard = toonMat({ color: '#ffffff', hazard: true, vc: false });
  MAT.vc = toonMat({ vc: true });
  MAT.vcWet = toonMat({ vc: true, gloss: 0.45, drops: 0.9 });
  MAT.vcDrops = toonMat({ vc: true, drops: 1, gloss: 0.25 });
  MAT.vcUnder = toonMat({ vc: true, under: true });
  MAT.vcInterior = toonMat({ vc: true, lift: 0.30 });
  MAT.vcInteriorWet = toonMat({ vc: true, lift: 0.30, gloss: 0.5 });
  MAT.vcHaze = toonMat({ vc: true, haze: 0.5 });
  MAT.metal = toonMat({ vc: true, gloss: 0.6 });
  MAT.grass = toonMat({ vc: true, sway: 1, under: true });
  MAT.plinth = toonMat({ vc: true });
}

/* ---- 辅助：生成带朝向的墙面片 ---- */
function wallFace(P, axis, c, a0, a1, y0, y1, dir) {   // axis 'x': 墙在 x=c，沿 z 从a0到a1；'z': 墙在 z=c，沿 x
  const w = a1 - a0, h = y1 - y0, mid = (a0 + a1) / 2, my = (y0 + y1) / 2;
  if (axis === 'x') P.plane(w, h, [c, my, mid], P.curCol || '#fff', [0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
  else P.plane(w, h, [mid, my, c], P.curCol || '#fff', [0, dir > 0 ? 0 : Math.PI, 0]);
}
function topFace(P, y, x0, x1, z0, z1) { P.plane(x1 - x0, z1 - z0, [(x0 + x1) / 2, y, (z0 + z1) / 2], P.curCol || '#fff', [-Math.PI / 2, 0, 0]); }

function buildBase(scene) {
  const white = new Col('#ffffff');
  /* ======== 码头混凝土：顶面+外壁(无水下染色) ======== */
  const Pt = new Parts(); Pt.jit = 0; Pt.curCol = white;       // 顶面
  const Po = new Parts(); Po.jit = 0; Po.curCol = white;       // 外侧壁
  const Pi = new Parts(); Pi.jit = 0; Pi.curCol = white;       // 面向水域的内壁(水下染色)
  const S = AREA.stem, F = AREA.foot;
  topFace(Pt, QH, S.x0, S.x1, S.z0, S.z1);
  topFace(Pt, QH, F.x0, F.x1, F.z0, F.z1);
  // 外壁
  wallFace(Po, 'z', 14, -14, 9, BOT, QH, 1);              // 前壁 z=14
  wallFace(Po, 'x', -14, -9.5, 14, BOT, QH, -1);          // 左壁 x=-14 (朝-x)
  // 内壁（朝水）
  wallFace(Pi, 'x', -6, -9.5, 6, BOT, QH, 1);             // 栈桥右壁 x=-6 朝 +x
  wallFace(Pi, 'z', 6, -6, 9, BOT, QH, -1);               // 前台后壁 z=6 朝 -z
  wallFace(Pi, 'x', 9, 6, 14, BOT, QH, 1);                // 前台右端 x=9 朝 +x
  // 栈桥尽头 z=-9.5 的壁朝 +z 连到山坡: 由山坡覆盖
  const mTop = mesh(Pt.build(), MAT.conc), mOut = mesh(Po.build(), MAT.conc), mIn = mesh(Pi.build(), MAT.concIn);
  mTop.name = 'quayTop'; scene.add(mTop, mOut, mIn);

  /* ======== 码头面细节：护轮坎(黄黑斜纹)、排水篦、井盖、标线 ======== */
  const Ph = new Parts(); Ph.jit = 0;
  const kh = 0.2, kw = 0.32;
  const curbSeg = (x0, x1, z0, z1) => Ph.box(x1 - x0, kh, z1 - z0, [(x0 + x1) / 2, QH + kh / 2, (z0 + z1) / 2], '#fff');
  curbSeg(-6.32, -6.0, -9.5, 6.0);                 // 栈桥内沿
  curbSeg(-6.0, 0.7, 5.68, 6.0);                   // 前台后沿(台阶前)
  curbSeg(5.6, 9.0, 5.68, 6.0);                    // 台阶之后
  curbSeg(8.68, 9.0, 6.0, 7.8);                    // 前台右端(滑道前)
  curbSeg(8.68, 9.0, 11.8, 14.0);
  curbSeg(-14, -6.32, -9.5, -9.2);                 // 栈桥尽头小坎
  const mHaz = mesh(Ph.build(), MAT.hazard); scene.add(mHaz);

  const Pd = new Parts(); Pd.jit = 0.02;
  // 井盖
  Pd.cyl(0.42, 0.42, 0.03, 20, [-1.8, QH + 0.015, 9.6], '#6f7873');
  Pd.tor(0.34, 0.025, [-1.8, QH + 0.032, 9.6], '#53605d', [Math.PI / 2, 0, 0], 20, 5);
  for (let i = -2; i <= 2; i++) Pd.box(0.5, 0.012, 0.035, [-1.8, QH + 0.034, 9.6 + i * 0.1], '#4b5754');
  // 排水篦
  Pd.box(1.3, 0.025, 0.4, [3.6, QH + 0.0125, 11.4], '#59635f');
  for (let i = 0; i < 10; i++) Pd.box(0.05, 0.03, 0.34, [3.0 + i * 0.13, QH + 0.02, 11.4], '#2f3a39');
  // 白色停车线
  Pd.box(6.0, 0.006, 0.07, [-1.5, QH + 0.003, 7.2], '#eef1ec');
  Pd.box(0.07, 0.006, 3.4, [-8.0, QH + 0.003, 3.8], '#ecefe9');
  Pd.box(0.07, 0.006, 3.4, [-10.4, QH + 0.003, 8.3], '#e4e8e1');
  // 水泥修补块与裂缝
  Pd.box(1.6, 0.008, 1.1, [5.2, QH + 0.004, 9.2], '#c5cbc5');
  Pd.box(0.9, 0.008, 1.5, [-8.4, QH + 0.004, 9.7], '#c3c9c3');
  const mDet = mesh(Pd.build(), MAT.vc, { cast: false }); scene.add(mDet);

  /* ======== 垫座(收藏模型底托) ======== */
  const Pp = new Parts(); Pp.jit = 0;
  Pp.box(29.0, 0.16, 29.0, [0, BOT - 0.08, 0], '#2b7e82');           // 青色衬垫
  Pp.box(29.8, 0.5, 29.8, [0, BOT - 0.41, 0], '#efe7d6');            // 奶白木底
  Pp.box(30.6, 0.28, 30.6, [0, BOT - 0.80, 0], '#d9cdb4');
  Pp.box(30.65, 0.04, 30.65, [0, BOT - 0.57, 0], '#b98f5c');         // 黄铜细线
  const mPl = mesh(Pp.build(), MAT.plinth); scene.add(mPl);

  { // 底座铭牌
    const c = mkCanvas(1024, 96), x = c.getContext('2d');
    x.fillStyle = '#1e5f66'; x.fillRect(0, 0, 1024, 96);
    x.strokeStyle = '#d8b04a'; x.lineWidth = 4; x.strokeRect(6, 6, 1012, 84);
    x.fillStyle = '#f3e7c2'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const txt = '太阳雨中的小渔港堤岸  ·  HIYORI PORT';
    let fs = 52; x.font = `bold ${fs}px ${FONT_CJK}`; while (x.measureText(txt).width > 940 && fs > 20) { fs -= 2; x.font = `bold ${fs}px ${FONT_CJK}`; }
    x.fillText(txt, 512, 50);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 0.42), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false }));
    pm.position.set(0, BOT - 0.41, 14.92); scene.add(pm);
  }
  buildSeabed(scene);
  buildQuayWallDetail(scene);
}

/* ---- 海床：碎石 + 沉底旧轮胎 + 锚链 + 海草 ---- */
function seabedH(x, z) { return BOT + 0.10 + 0.18 * fbm2(x * 0.5, z * 0.5) + 0.07 * noise2(x * 2.2, z * 2.2) - 0.06; }
function buildSeabed(scene) {
  const N = 90, size = 28;
  const g = new THREE.PlaneGeometry(size, size, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, cols = [];
  const c1 = new Col('#a9b8a2'), c2 = new Col('#8aa497'), c3 = new Col('#c2c6a8');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, seabedH(x, z));
    const n = fbm2(x * 0.7 + 4, z * 0.7), c = c1.clone().lerp(n > 0.5 ? c3 : c2, Math.abs(n - 0.5) * 2);
    c.multiplyScalar(0.92 + 0.12 * noise2(x * 5, z * 5));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
  scene.add(mesh(g, MAT.vcUnder, { cast: false }));
  // 碎石（实例化）
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const NR = 650, im = new THREE.InstancedMesh(rock, toonMat({ vc: false, color: '#ffffff', under: true }), NR);
  const m4 = new M4(), q = new Q4(), e = new Eul(), cc = new Col();
  for (let i = 0; i < NR; i++) {
    const x = rnd(-13.7, 13.7), z = rnd(-13.7, 13.7), s = rnd(0.05, 0.16) * (R() < 0.08 ? 2.2 : 1);
    m4.compose(new V3(x, seabedH(x, z) + s * 0.25, z), q.setFromEuler(e.set(rnd(0, 6), rnd(0, 6), rnd(0, 6))), new V3(s * rnd(0.9, 1.5), s * rnd(0.55, 0.9), s * rnd(0.9, 1.4)));
    im.setMatrixAt(i, m4);
    cc.set(pick(['#9aa8a0', '#b3b6a4', '#7f9692', '#c9c5ad', '#8c9a8f', '#a2b3b0'])); im.setColorAt(i, cc);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
  // 旧轮胎(沉底) + 锚链 + 锚
  const Pt = new Parts(); Pt.jit = 0.03;
  const tire = (x, z, rot, s = 1) => {
    const y = seabedH(x, z);
    Pt.T([x, y + 0.2 * s, z], rot, null, () => { Pt.tor(0.42 * s, 0.17 * s, [0, 0, 0], '#26323a', [Math.PI / 2, 0, 0], 20, 10); Pt.cyl(0.26 * s, 0.26 * s, 0.05, 14, [0, 0.05, 0], '#3c4a52', [0, 0, 0], true); });
  };
  tire(10.8, 2.0, [0.15, 0.4, 0.1]); tire(11.3, 2.6, [0.1, 1.1, 0.2], 0.95); tire(-1.5, -4.2, [0.4, 2.0, 0.2]); tire(7.5, -3.0, [0.12, 0.3, 0.05], 1.05);
  tire(12.2, 10.7, [0.05, 0.9, 0.1], 0.9); tire(3.2, 2.4, [0.3, 1.9, 0.3], 0.9);
  // 锚链：一串椭圆环
  const chain = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const A = new V3(a[0], seabedH(a[0], a[1]) + 0.07, a[1]), B = new V3(b[0], seabedH(b[0], b[1]) + 0.07, b[1]);
      const len = A.distanceTo(B), n = Math.max(2, Math.floor(len / 0.16));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, pp = A.clone().lerp(B, t);
        const ang = Math.atan2(B.x - A.x, B.z - A.z);
        const flat = k % 2 === 0;
        Pt.tor(0.07, 0.016, [pp.x, pp.y + (flat ? 0 : 0.012), pp.z], '#5d514a', [flat ? Math.PI / 2 : 0, ang + (flat ? 0 : Math.PI / 2), 0], 8, 4);
      }
    }
  };
  chain([[-3.0, -1.0], [-1.6, -0.6], [-0.4, -1.2], [1.2, -0.7], [2.6, -1.6], [3.6, -3.2]]);
  chain([[9.5, 4.6], [10.6, 3.9], [11.8, 4.6], [12.6, 6.0]]);
  // 锚
  const ay = seabedH(3.9, -3.5);
  Pt.T([3.9, ay + 0.28, -3.5], [0.2, 0.6, 0.35], null, () => {
    Pt.cyl(0.04, 0.04, 1.1, 8, [0, 0, 0], '#4d4540'); Pt.tor(0.1, 0.02, [0, 0.58, 0], '#4d4540', [0, 0, 0], 10, 5);
    Pt.cyl(0.035, 0.035, 0.7, 8, [0, -0.5, 0], '#4d4540', [0, 0, Math.PI / 2]);
    Pt.tor(0.45, 0.04, [0, -0.5, 0], '#4d4540', [0, 0, Math.PI], 14, 6, Math.PI);
  });
  scene.add(mesh(Pt.build(), MAT.vcUnder));
  // 海草丛（摆动）
  const Pg = new Parts(); Pg.jit = 0.06;
  const blade = (x, z, h, w, col, ph) => {
    const y = seabedH(x, z) - 0.02;
    const seg = 5, pos = [], idx = [], nor = [], col2 = [], sw = [];
    // 细长条带，沿高度分段，权重随高度增大
    const g2 = new THREE.BufferGeometry();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, ww = w * (1 - t * 0.85);
      pos.push(-ww, t * h, 0, ww, t * h, 0); nor.push(0, 0, 1, 0, 0, 1);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g2.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g2.setIndex(idx);
    Pg.add(g2, [x, y, z], [0, rnd(0, 6.28), rnd(-0.18, 0.18)], null, (px, py, pz) => { const t = clamp((py - y) / h, 0, 1); return col.clone().lerp(new Col('#c8e8a0'), t * 0.45); }, (px, py, pz) => [clamp((py - y) / h, 0, 1), ph]);
  };
  const clump = (cx, cz, n, spread, hmin, hmax) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), d = rnd(0, spread);
      const col = new Col(pick(['#2f8a5f', '#3c9a6a', '#2a7d62', '#52a56c']));
      blade(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rnd(hmin, hmax), rnd(0.035, 0.07), col, rnd(0, 6.28));
    }
  };
  const clumps = [[-3, 3], [-2, 5], [0.5, 4.2], [4.5, 1.0], [8.5, -1.5], [11.2, -2.2], [10.3, 7.3], [12.5, 12.2], [11, 0.5], [6, -6.5], [8.5, -9], [0, -7.5], [-2.5, -3.5], [3, -8.5], [12.5, -7]];
  for (const c of clumps) clump(c[0], c[1], 14, 0.6, 0.6, 1.5);
  const mg = mesh(Pg.build(), MAT.grass, { cast: false }); mg.material.side = THREE.DoubleSide; scene.add(mg);
}

/* ---- 岸壁细节：藤壶、牡蛎、海藻、系船环、铁梯 ---- */
function buildQuayWallDetail(scene) {
  const P = new Parts(); P.jit = 0.05;
  const barn = new Col('#d9d5c4'), oyst = new Col('#9d9a8c');
  // 在一段墙面上撒藤壶/牡蛎 (axis,c 墙位置, a0..a1, dir 朝向)
  const crust = (axis, c, a0, a1, dir, ymin, ymax, n) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(a0, a1), y = rnd(ymin, ymax);
      const cl = rnd(0.5, 1) ; const isO = R() < 0.25;
      const off = 0.012;
      const p = axis === 'x' ? [c + dir * off, y, a] : [a, y, c + dir * off];
      const rot = axis === 'x' ? [0, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2] : [dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0];
      if (isO) P.sph(rnd(0.05, 0.09), p, oyst, axis === 'x' ? [0.35, 1.0, 1.5] : [1.5, 1.0, 0.35], 7, 5);
      else P.cone(rnd(0.022, 0.04), rnd(0.03, 0.05), 7, p, barn, rot);
    }
  };
  // 前壁 z=14 (朝 +z): 靠近水位线与水下部分
  crust('z', 14, -13.8, 8.8, 1, -2.8, 0.45, 520);
  crust('x', -14, -9.3, 13.8, -1, -2.8, 0.45, 300);
  crust('x', -6, -9.3, 5.8, 1, -2.8, 0.45, 260);
  crust('z', 6, -5.8, 8.8, -1, -2.8, 0.45, 260);
  crust('x', 9, 6.2, 13.8, 1, -2.8, 0.45, 80);
  const mC = mesh(P.build(), MAT.vcUnder, { cast: false }); scene.add(mC);

  // 海藻（沿壁摆动）
  const Pg = new Parts(); Pg.jit = 0.06;
  const kelp = (axis, c, a, dir, y0, h, col) => {
    const seg = 8, pos = [], idx = [], nor = [];
    const g2 = new THREE.BufferGeometry();
    for (let i = 0; i <= seg; i++) { const t = i / seg, ww = 0.095 * Math.sin(Math.PI * Math.pow(Math.min(1, 0.1 + t * 0.9), 0.85)) + 0.004; pos.push(-ww, t * h, t * t * 0.14, ww, t * h, t * t * 0.14); nor.push(0, 0, 1, 0, 0, 1); }
    for (let i = 0; i < seg; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g2.setIndex(idx);
    const ph = rnd(0, 6.28);
    const p = axis === 'x' ? [c + dir * 0.03, y0, a] : [a, y0, c + dir * 0.03];
    Pg.add(g2, p, [0, axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), rnd(-0.1, 0.1)], null, (px, py) => col.clone().lerp(new Col('#c7e69a'), clamp((py - y0) / h, 0, 1) * 0.35), (px, py) => [clamp((py - y0) / h, 0, 1), ph]);
  };
  const greens = ['#3a7f4b', '#4e8f4a', '#2d6e4c', '#6a9a45', '#356f55', '#6f7a3a', '#556b3a'];
  for (let i = 0; i < 150; i++) {
    const pick4 = rndi(0, 3), y0 = rnd(-1.0, 0.0), h = rnd(0.45, 1.1), col = new Col(pick(greens));
    if (pick4 === 0) kelp('z', 14, rnd(-13.6, 8.7), 1, y0, h, col);
    else if (pick4 === 1) kelp('x', -6, rnd(-9.2, 5.8), 1, y0, h, col);
    else if (pick4 === 2) kelp('z', 6, rnd(-5.8, 8.6), -1, y0, h, col);
    else kelp('x', -14, rnd(-9.2, 13.6), -1, y0, h, col);
  }
  const mK = mesh(Pg.build(), MAT.grass, { cast: false }); mK.material.side = THREE.DoubleSide; scene.add(mK);

  // 系船环 + 铁梯
  const Pm = new Parts(); Pm.jit = 0.03;
  const ring = (axis, c, a, dir, y) => {
    const p = axis === 'x' ? [c + dir * 0.06, y, a] : [a, y, c + dir * 0.06];
    const rot = axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0];
    Pm.tor(0.11, 0.022, p, '#a9743a', rot, 14, 6); // 黄铜色
    Pm.box(axis === 'x' ? 0.05 : 0.07, 0.07, axis === 'x' ? 0.07 : 0.05, axis === 'x' ? [c + dir * 0.025, y + 0.11, a] : [a, y + 0.11, c + dir * 0.025], '#6b4b34');
  };
  for (let a = -8.5; a <= 5.5; a += 2.5) ring('x', -6, a, 1, 0.52);
  for (let a = -4.5; a <= 8; a += 2.6) ring('z', 6, a, -1, 0.52);
  for (let a = -12; a <= 8; a += 3.0) ring('z', 14, a, 1, 0.52);
  for (let a = -8; a <= 12; a += 3.5) ring('x', -14, a, -1, 0.52);
  // 锈蚀铁梯（沿岸壁向下延伸到水里）
  const ladder = (axis, c, a, dir, ytop, ybot) => {
    const off = 0.10, wdt = 0.22;
    const pf = (u, y) => axis === 'x' ? [c + dir * off, y, a + u] : [a + u, y, c + dir * off];
    for (const u of [-wdt, wdt]) { const A = pf(u, ytop + 0.3), B = pf(u, ybot); Pm.rod(A, B, 0.02, '#8a4f2a', 6); }
    for (let y = ytop; y > ybot; y -= 0.24) {
      const A = pf(-wdt, y), B = pf(wdt, y); Pm.rod(A, B, 0.017, '#9a5c34', 6);
    }
    // 固定支架
    for (let y = ytop; y > ybot; y -= 0.72) for (const u of [-wdt, wdt]) { const A = pf(u, y), B = axis === 'x' ? [c, y, a + u] : [a + u, y, c]; Pm.rod(A, B, 0.015, '#6f3d20', 5); }
  };
  ladder('x', -6, -7.4, 1, 0.9, -2.3);
  ladder('z', 6, 6.2, -1, 0.9, -2.3);
  ladder('z', 14, -9.5, 1, 0.9, -2.7);
  ladder('x', -14, 5.0, -1, 0.9, -2.5);
  const mM = mesh(Pm.build(), MAT.metal); scene.add(mM);
}
