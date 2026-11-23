'use strict';
/* =====================================================================
   fleet.js — 旗舰 / 近卫舰 / 前卫舰 / 小艇 / 编队
   坐标系：+X 为航行方向（舰首），+Y 上，+Z 右舷
   ===================================================================== */

const HULL = PAL.hull, HL = PAL.hullLight, HD = PAL.hullDark, HDP = PAL.hullDeep;
const ST = PAL.struct, STD = PAL.structDark, DP = PAL.deep, JNT = PAL.joint;
const ACC = PAL.accent, ACCD = PAL.accentDim, ACCDP = PAL.accentDeep;
const WAM = PAL.warm, WAMH = PAL.warmHot, WAMD = PAL.warmDeep;

/* ---------------- 旗舰 ---------------- */
function buildFlagship(gl) {
  const v = new Vox(101);
  const rng = mulberry32(777);
  const secs = [
    [-540, -440, 44, 32, 0],
    [-440, -340, 48, 35, 0],
    [-340, -210, 52, 38, 1],
    [-210, -150, 55, 40, 1],
    [240, 280, 46, 33, 0],
    [280, 360, 38, 28, 0],
    [360, 430, 30, 23, 0],
    [430, 490, 23, 18, 0],
    [490, 560, 16, 13, 0],
  ];

  function hullSection(x0, x1, hw, hh, yc) {
    v.box(x0, yc - hh, -hw, x1, yc + hh, hw, HULL, { spec: 0.34 });
    v.box(x0, yc - hh + 1.5, -hw + 1.5, x0 + 7, yc + hh - 1.5, hw - 1.5, HL, { spec: 0.42 });
    v.box(x0 + 7, yc - hh + 3, -hw + 3, x0 + 12, yc + hh - 3, hw - 3, HDP, { spec: 0.10 });
    for (const s of [-1, 1]) {
      v.box(x0 + 12, yc - 22, s * (hw + 0.6), x1 - 6, yc - 17, s * (hw + 2.4), HD, { spec: 0.26 });
      v.box(x0 + 12, yc + 17, s * (hw + 0.6), x1 - 6, yc + 22, s * (hw + 2.4), HD, { spec: 0.26 });
      v.box(x0 + 12, yc - 2, s * (hw + 0.4), x1 - 6, yc + 2, s * (hw + 1.8), STD, { spec: 0.18 });
    }
    v.box(x0 + 12, yc + hh - 1, -hw * 0.55, x1 - 6, yc + hh + 2.5, hw * 0.55, HD, { spec: 0.3 });
    v.box(x0 + 12, yc - hh - 2.5, -hw * 0.4, x1 - 6, yc - hh + 1, hw * 0.4, HD, { spec: 0.3 });
    const n = Math.max(1, Math.floor((x1 - x0 - 20) / 26));
    for (let i = 1; i <= n; i++) {
      const x = x0 + 12 + (x1 - x0 - 20) * (i / (n + 0.0001));
      v.box(x, yc - hh - 1.2, -hw - 1.2, x + 2.2, yc + hh + 1.2, hw + 1.2, HL, { spec: 0.45 });
    }
    const np = Math.max(1, Math.floor((x1 - x0 - 24) / 34));
    for (let i = 0; i < np; i++) {
      const x = x0 + 16 + (x1 - x0 - 24) * (i / np) + rng() * 6;
      const w = 16 + rng() * 22, h = 12 + rng() * 14;
      for (const s of [-1, 1]) {
        v.box(x, yc - h, s * (hw + 0.2), x + w, yc + h, s * (hw + 1.4), (rng() < 0.5 ? HL : HULL), { spec: 0.4 });
      }
      const w2 = 14 + rng() * 18, h2 = 10 + rng() * 12;
      v.box(x + 3, yc + hh - h2, -w2, x + 3 + w2 * 0.7, yc + hh + 1.2, w2, HD, { spec: 0.3 });
    }
    for (let i = 0; i < (x1 - x0) / 40; i++) {
      const x = x0 + 12 + rng() * (x1 - x0 - 24);
      const zz = (rng() * 2 - 1) * (hw - 6);
      const yy = yc + hh + 1;
      v.box(x, yy, zz, x + 2 + rng() * 5, yy + 1 + rng() * 4, zz + 2 + rng() * 5,
        rng() < 0.6 ? STD : HD, { spec: 0.2 });
    }
    for (let i = 0; i < (x1 - x0) / 48; i++) {
      const x = x0 + 12 + rng() * (x1 - x0 - 24);
      const s = rng() < 0.5 ? -1 : 1;
      const yy = yc + (rng() * 2 - 1) * (hh - 8);
      v.box(x, yy, s * (hw + 0.4), x + 2 + rng() * 6, yy + 2 + rng() * 4, s * (hw + 2.0), rng() < 0.5 ? STD : DP, { spec: 0.15 });
    }
    for (let i = 0; i < (x1 - x0) / 130; i++) {
      const x = x0 + 20 + rng() * (x1 - x0 - 40);
      v.box(x, yc - 1, -hw - 0.6, x + 10 + rng() * 14, yc + 1, -hw - 0.9, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
      v.box(x, yc - 1, hw + 0.6, x + 10 + rng() * 14, yc + 1, hw + 0.9, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
    }
  }

  for (const [x0, x1, hw, hh, yc] of secs) hullSection(x0, x1, hw, hh, yc);

  /* 机库段（右舷开口），长约 390 格 */
  {
    const x0 = -150, x1 = 240, hw = 52, hh = 38;
    v.box(x0, -hh, -hw, x1, -16, hw, HULL, { spec: 0.34 });
    v.box(x0, 20, -hw, x1, hh, hw, HULL, { spec: 0.34 });
    v.box(x0, -16, -hw, x0 + 6, 20, hw, HULL, { spec: 0.34 });
    v.box(x1 - 6, -16, -hw, x1, 20, hw, HULL, { spec: 0.34 });
    v.box(x0, -16, 26, 40, 20, 32, HULL, { spec: 0.34 });
    v.box(x0, 14, 26, 40, 20, 32, HULL, { spec: 0.34 });
    v.box(70, -16, 26, x1, 20, 32, HULL, { spec: 0.34 });
    v.box(70, 14, 26, x1, 20, 32, HULL, { spec: 0.34 });
    v.box(40, 14, 26, 70, 20, 32, HULL, { spec: 0.34 });
    v.box(40, -16, 12, 70, 14, 26, DP, { spec: 0.05 });
    v.box(38, -18, 10, 72, 16, 28, STD, { spec: 0.05 });
    v.box(x0 - 3, -20, hw, x1 + 3, -15, hw + 4, HL, { spec: 0.5 });
    v.box(x0 - 3, 19, hw, x1 + 3, 24, hw + 4, HL, { spec: 0.5 });
    v.box(x0 - 3, -16, hw, x0 + 1, 20, hw + 4, HL, { spec: 0.5 });
    v.box(x1 - 1, -16, hw, x1 + 3, 20, hw + 4, HL, { spec: 0.5 });
    v.box(x0 + 2, -16, -hw, x1 - 2, -14.5, 32, PAL.deck, { spec: 0.2 });
    v.box(x0 + 2, 18.5, -hw, x1 - 2, 20, 32, STD, { spec: 0.12 });
    for (let x = x0 + 10; x < x1 - 6; x += 16) {
      v.box(x, -16, 30.5, x + 2, 20, 32, HD, { spec: 0.25 });
      v.box(x, 17, -hw, x + 2, 20, 32, HD, { spec: 0.2 });
      v.box(x, -16, -hw, x + 2, -13, 32, HD, { spec: 0.2 });
    }
    for (let x = x0 + 22; x < x1 - 10; x += 40) {
      v.box(x, 12, -hw + 4, x + 10, 14, 32, ST, { spec: 0.3 });
      v.box(x, 8, -hw + 4, x + 2, 12, 32, STD, { spec: 0.2 });
    }
    v.box(x0 + 4, -14.4, -6, x1 - 4, -14.1, -4, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    v.box(x0 + 4, -14.4, 4, x1 - 4, -14.1, 6, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    for (let x = x0 + 8; x < x1 - 8; x += 24) {
      v.box(x, 6, 31.4, x + 6, 8, 31.9, WAM, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
    }
    for (let i = 0; i < 6; i++) {
      const x = x0 + 30 + i * 56;
      v.box(x, -14, 24, x + 34, 18, 30, STD, { spec: 0.1 });
      v.box(x, -14, 23, x + 34, 18, 24.5, DP, { spec: 0.05 });
      v.box(x, -13.8, 24.5, x + 34, -13.2, 30, HD, { spec: 0.15 });
    }
    for (let i = 0; i < 3; i++) {
      const x = x0 + 40 + i * 60;
      v.box(x, -14, -hw + 6, x + 2, 12, -hw + 12, ST, { spec: 0.3 });
      v.box(x, 12, -hw + 6, x + 14, 14, -hw + 12, ST, { spec: 0.3 });
      v.box(x + 12, 6, -hw + 6, x + 14, 14, -hw + 12, STD, { spec: 0.25 });
    }
  }

  /* 左舷小型凹腔 */
  {
    const x0 = 0, x1 = 120, hw = 52, hh = 38;
    v.box(x0, -hh, -hw, x1, -8, -hw + 14, HULL, { spec: 0.3 });
    v.box(x0, 6, -hw, x1, hh, -hw + 14, HULL, { spec: 0.3 });
    v.box(x0, -8, -hw, x0 + 5, 6, -hw + 14, HULL, { spec: 0.3 });
    v.box(x1 - 5, -8, -hw, x1, 6, -hw + 14, HULL, { spec: 0.3 });
    v.box(x0, -8, -hw - 1.5, x1, 6, -hw + 1, HD, { spec: 0.2 });
    v.box(x0, -8, -hw - 1.5, x1, -6, -hw + 1, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }

  /* 舰首分叉 + 光束主炮 */
  {
    v.box(286, -20, -18, 400, 20, 18, ST, { spec: 0.35 });
    v.box(292, -24, -22, 330, 24, 22, HD, { spec: 0.4 });
    v.box(330, -22, -20, 360, 22, 20, HL, { spec: 0.45 });
    v.box(360, -19, -17, 396, 19, 17, HULL, { spec: 0.4 });
    v.box(400, -11, -11, 470, 11, 11, ST, { spec: 0.45 });
    v.box(470, -8.5, -8.5, 520, 8.5, 8.5, HL, { spec: 0.5 });
    v.box(520, -6.5, -6.5, 556, 6.5, 6.5, ST, { spec: 0.5 });
    for (const [yy, zz] of [[0, 11.4], [0, -11.4], [11.4, 0], [-11.4, 0]]) {
      v.box(404, yy - 1.5, zz - 1.5, 466, yy + 1.5, zz + 1.5, ACC, { unlit: true, e: 1.8, blend: 'add', noJit: true, noSpec: true });
    }
    for (const [yy, zz] of [[0, 8.9], [0, -8.9], [8.9, 0], [-8.9, 0]]) {
      v.box(474, yy - 1.2, zz - 1.2, 516, yy + 1.2, zz + 1.2, ACC, { unlit: true, e: 2.0, blend: 'add', noJit: true, noSpec: true });
    }
    v.box(556, -9, -9, 566, 9, 9, HL, { spec: 0.6 });
    v.box(560, -6, -6, 566, 6, 6, DP, { spec: 0.05 });
    v.box(561, -3.5, -3.5, 565, 3.5, 3.5, WAMH, { unlit: true, e: 3.2, blend: 'add', noJit: true, noSpec: true });
    v.box(420, -20, -14, 470, -11, 14, STD, { spec: 0.2 });
    v.box(420, 11, -14, 470, 20, 14, STD, { spec: 0.2 });
    for (const s of [-1, 1]) {
      v.box(470, -6, s * 14 - 5, 596, 6, s * 14 + 5, HULL, { spec: 0.4 });
      v.box(520, -4.5, s * 15 - 3.5, 610, 4.5, s * 15 + 3.5, HL, { spec: 0.5 });
      v.box(596, -6, s * 14 - 5, 606, 6, s * 14 + 5, ACCDP, { unlit: true, e: 0.8, blend: 'add', noJit: true, noSpec: true });
      v.box(500, -2, s * 6 - 2, 560, 2, s * 6 + 2, STD, { spec: 0.2 });
    }
    v.box(470, -16, -6, 580, -8, 6, HULL, { spec: 0.35 });
    v.box(560, -15, -4, 600, -9, 4, HL, { spec: 0.45 });
    v.box(440, 6, -8, 470, 18, 8, DP, { spec: 0.05 });
    v.box(442, 8, -6, 468, 16, 6, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }

  /* 舰尾动力段 */
  {
    v.box(-560, -30, -40, -520, 30, 40, HULL, { spec: 0.35 });
    v.box(-580, -26, -36, -556, 26, 36, HD, { spec: 0.4 });
    v.box(-596, -22, -32, -580, 22, 32, HL, { spec: 0.45 });
    v.box(-610, -18, -28, -596, 18, 28, ST, { spec: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const yy = Math.cos(a) * 30, zz = Math.sin(a) * 30;
      v.box(-570, yy - 2, zz - 2, -520, yy + 2, zz + 2, STD, { spec: 0.2 });
    }
    v.box(-470, 34, -26, -300, 52, 26, HULL, { spec: 0.35 });
    v.box(-460, 52, -20, -320, 62, 20, HD, { spec: 0.3 });
    v.box(-450, 62, -14, -340, 70, 14, HL, { spec: 0.4 });
  }
  const engines = [];
  const noz = [
    [-18, -32, 8], [-18, -11, 8], [-18, 11, 8], [-18, 32, 8],
    [18, -32, 8], [18, -11, 8], [18, 11, 8], [18, 32, 8],
    [0, 0, 12], [0, -26, 9], [0, 26, 9],
  ];
  for (const [yy, zz, rr] of noz) {
    const x = -610;
    v.box(x, yy - rr, zz - rr, x + 26, yy + rr, zz + rr, STD, { spec: 0.25 });
    v.box(x - 2, yy - rr * 0.8, zz - rr * 0.8, x + 8, yy + rr * 0.8, zz + rr * 0.8, DP, { spec: 0.05 });
    v.box(x - 2, yy - rr * 0.55, zz - rr * 0.55, x + 4, yy + rr * 0.55, zz + rr * 0.55, WAMH, { unlit: true, e: 2.8, blend: 'add', noJit: true, noSpec: true });
    engines.push({ pos: [x - 2, yy, zz], dir: [-1, 0, 0], r: rr });
  }

  /* 上层建筑 */
  {
    v.box(-240, 38, -40, 180, 52, 40, HULL, { spec: 0.35 });
    v.box(-220, 52, -32, 160, 64, 32, HD, { spec: 0.35 });
    v.box(-190, 64, -24, 120, 74, 24, HULL, { spec: 0.4 });
    v.box(-150, 74, -16, 60, 82, 16, HL, { spec: 0.45 });
    v.box(-110, 82, -10, 10, 88, 10, ST, { spec: 0.4 });
    v.box(60, 40, -26, 190, 58, 26, HULL, { spec: 0.4 });
    v.box(80, 58, -20, 170, 70, 20, HD, { spec: 0.4 });
    v.box(100, 70, -14, 150, 78, 14, HL, { spec: 0.5 });
    v.box(110, 78, -10, 140, 84, 10, ST, { spec: 0.4 });
    v.box(186, 50, -24, 191, 56, 24, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    v.box(166, 62, -18, 171, 68, 18, ACCD, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });
    for (const s of [-1, 1]) {
      v.box(62, 44, s * 26.4, 188, 48, s * 27.0, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
      v.box(-236, 42, s * 40.4, 176, 46, s * 41.0, ACCD, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });
    }
    v.box(0, 88, -3, 8, 116, 3, STD, { spec: 0.3 });
    v.box(-6, 104, -2, 14, 108, 2, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    v.box(-40, 84, -8, -36, 100, 8, STD, { spec: 0.3 });
    const rng2 = mulberry32(55);
    for (let i = 0; i < 45; i++) {
      const x = -230 + rng2() * 400, y = 40 + rng2() * 44;
      const z = (rng2() * 2 - 1) * 38;
      if (Math.abs(z) < 8 && y > 70) continue;
      v.box(x, y, z, x + 2 + rng2() * 6, y + 2 + rng2() * 4, z + 2 + rng2() * 6,
        rng2() < 0.5 ? STD : HD, { spec: 0.2 });
    }
    for (const s of [-1, 1]) {
      v.box(-120, 52, s * 41.4, -40, 62, s * 42.0, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
    }
  }

  /* 侧部突出结构 */
  {
    for (const s of [-1, 1]) {
      v.box(-280, -24, s * 52, 60, 24, s * 78, HULL, { spec: 0.35 });
      v.box(-260, -18, s * 78, 40, 18, s * 86, HD, { spec: 0.35 });
      v.box(-240, -12, s * 86, 20, 12, s * 92, HL, { spec: 0.4 });
      for (let i = 0; i < 5; i++) {
        const x = -250 + i * 55;
        v.box(x, 24, s * 60, x + 14, 32, s * 70, ST, { spec: 0.3 });
        v.box(x + 3, 32, s * 62, x + 11, 38, s * 68, HD, { spec: 0.25 });
      }
      v.box(-270, 2, s * 78.4, 50, 5, s * 79.0, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
      v.box(-200, -34, s * 60, -60, -24, s * 78, HULL, { spec: 0.35 });
      v.box(-180, -24, s * 78, -80, -18, s * 84, HD, { spec: 0.3 });
    }
  }

  /* 腹部结构 */
  {
    v.box(-200, -40, -30, 160, -54, 30, HULL, { spec: 0.35 });
    v.box(-160, -54, -22, 120, -64, 22, HD, { spec: 0.3 });
    v.box(-120, -64, -14, 60, -72, 14, HL, { spec: 0.4 });
    for (let i = 0; i < 6; i++) {
      const x = -180 + i * 50;
      v.box(x, -44, 28, x + 16, -40, 40, ST, { spec: 0.25 });
      v.box(x, -44, -40, x + 16, -40, -28, ST, { spec: 0.25 });
    }
    v.box(-190, -44, -34, 150, -41, -31, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
    v.box(-190, -44, 31, 150, -41, 34, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  }

  /* 脉冲炮台 */
  const turretPivots = [];
  const turretDefs = [
    [40, 92, 0, 0], [-80, 86, 30, 1], [-80, 86, -30, 1], [160, 80, 0, 0],
    [240, 40, 60, 2], [240, 40, -60, 2],
  ];
  for (const [tx, ty, tz, kind] of turretDefs) {
    const tv = new Vox(200 + tx);
    tv.box(-9, -4, -9, 9, 2, 9, ST, { spec: 0.4 });
    tv.box(-6, 2, -6, 6, 6, 6, HD, { spec: 0.4 });
    tv.box(-11, -6, -11, -7, 0, 11, HL, { spec: 0.45 });
    tv.box(7, -6, -11, 11, 0, 11, HL, { spec: 0.45 });
    tv.box(0, 1, -3.5, 26, 4, -0.5, STD, { spec: 0.5 });
    tv.box(0, 1, 0.5, 26, 4, 3.5, STD, { spec: 0.5 });
    tv.box(24, 1, -3.5, 28, 4, -0.5, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    tv.box(24, 1, 0.5, 28, 4, 3.5, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    tv.box(-6, -2, 6.4, 6, 0, 7.0, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
    tv.box(-6, -2, -7.0, 6, 0, -6.4, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
    const b = tv.compile(gl);
    turretPivots.push({ pivot: [tx, ty, tz], batch: b, kind: 'pulse' });
  }
  const floatDefs = [
    [0, 74, 96], [0, -74, 96], [0, 74, -96], [0, -74, -96], [150, 40, 108], [-160, 30, -104],
  ];
  for (const [tx, ty, tz] of floatDefs) {
    const tv = new Vox(300 + tx);
    tv.box(-10, -5, -10, 10, 3, 10, ST, { spec: 0.4 });
    tv.box(-7, 3, -7, 7, 8, 7, HD, { spec: 0.4 });
    tv.box(0, 4, -3, 24, 7, 0, STD, { spec: 0.5 });
    tv.box(0, 4, 0, 24, 7, 3, STD, { spec: 0.5 });
    tv.box(22, 4, -3, 26, 7, 0, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    tv.box(22, 4, 0, 26, 7, 3, ACC, { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true });
    tv.box(-8, -7, -8, 8, -5, 8, HL, { spec: 0.45 });
    tv.box(-4, -9, -4, 4, -7, 4, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
    const b = tv.compile(gl);
    turretPivots.push({ pivot: [tx, ty, tz], batch: b, kind: 'pulse', float: true });
  }

  const hull = v.compile(gl);
  return {
    name: 'flagship', hull, turrets: turretPivots, engines,
    len: 1170, hw: 96, hh: 92, kind: 'flagship',
    pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, scale: 1,
    sway: { ax: 2.2, ay: 1.6, az: 2.0, fx: 0.055, fy: 0.071, fz: 0.063, pa: 0.3, pb: 1.7, pc: 2.6 },
    shieldScale: [620, 120, 130],
  };
}

/* ---------------- 近卫舰 ---------------- */
function buildCloseEscort(gl, seed, detail) {
  const v = new Vox(seed);
  const rng = mulberry32(seed * 13 + 5);
  const secs = [
    [-95, -70, 15, 13],
    [-70, -30, 18, 15],
    [-30, 20, 20, 16],
    [20, 60, 17, 14],
    [60, 90, 12, 10],
    [90, 110, 7, 6],
  ];
  for (const [x0, x1, hw, hh] of secs) {
    v.box(x0, -hh, -hw, x1, hh, hw, HULL, { spec: 0.35 });
    v.box(x0, -hh + 1.5, -hw + 1.5, x0 + 4, hh - 1.5, hw - 1.5, HL, { spec: 0.42 });
    v.box(x0 + 4, -hh + 2.5, -hw + 2.5, x0 + 7, hh - 2.5, hw - 2.5, HDP, { spec: 0.1 });
    for (const s of [-1, 1]) {
      v.box(x0 + 7, -8, s * (hw + 0.6), x1 - 3, -4, s * (hw + 2.0), HD, { spec: 0.26 });
      v.box(x0 + 7, 4, s * (hw + 0.6), x1 - 3, 8, s * (hw + 2.0), HD, { spec: 0.26 });
    }
    v.box(x0 + 7, hh - 1, -hw * 0.6, x1 - 3, hh + 2, hw * 0.6, HD, { spec: 0.3 });
    v.box(x0 + 7, -hh - 2, -hw * 0.5, x1 - 3, -hh + 1, hw * 0.5, HD, { spec: 0.3 });
  }
  for (const s of [-1, 1]) {
    v.box(-40, -6, s * 20, 30, 8, s * 36, HULL, { spec: 0.35 });
    v.box(-30, -4, s * 36, 20, 6, s * 42, HD, { spec: 0.35 });
    v.box(-20, -2, s * 42, 10, 4, s * 46, HL, { spec: 0.4 });
    v.box(-36, 8, s * 24, -24, 10, s * 34, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  }
  v.box(104, -5, -6, 122, 5, 6, HL, { spec: 0.45 });
  v.box(118, -3, -3, 132, 3, 3, ST, { spec: 0.4 });
  v.box(96, 6, -8, 108, 12, 8, DP, { spec: 0.05 });
  v.box(98, 7, -6, 106, 11, 6, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
  v.box(-104, -12, -14, -92, 12, 14, HD, { spec: 0.35 });
  v.box(-112, -10, -12, -104, 10, 12, HL, { spec: 0.4 });
  const engines = [];
  for (const [yy, zz, rr] of [[-5, -7, 4.5], [-5, 7, 4.5], [6, 0, 5]]) {
    const x = -112;
    v.box(x, yy - rr, zz - rr, x + 14, yy + rr, zz + rr, STD, { spec: 0.25 });
    v.box(x - 2, yy - rr * 0.6, zz - rr * 0.6, x + 4, yy + rr * 0.6, zz + rr * 0.6, WAMH, { unlit: true, e: 2.6, blend: 'add', noJit: true, noSpec: true });
    engines.push({ pos: [x - 2, yy, zz], dir: [-1, 0, 0], r: rr });
  }
  const turrets = [];
  const defs = [[-10, 18, 0], [30, 17, 0], [-10, -17, 0], [30, -17, 0], [58, 12, 10], [58, 12, -10]];
  for (const [tx, ty, tz] of defs) {
    const tv = new Vox(seed + tx * 3 + 900);
    tv.box(-5, -3, -5, 5, 2, 5, ST, { spec: 0.4 });
    tv.box(-3, 2, -3, 3, 5, 3, HD, { spec: 0.4 });
    tv.box(0, 3, -2.2, 18, 5, -0.4, STD, { spec: 0.5 });
    tv.box(0, 3, 0.4, 18, 5, 2.2, STD, { spec: 0.5 });
    tv.box(17, 3, -2.2, 19, 5, -0.4, ACC, { unlit: true, e: 1.8, blend: 'add', noJit: true, noSpec: true });
    tv.box(17, 3, 0.4, 19, 5, 2.2, ACC, { unlit: true, e: 1.8, blend: 'add', noJit: true, noSpec: true });
    tv.box(-3, -5, -3, 3, -3, 3, HL, { spec: 0.45 });
    const b = tv.compile(gl);
    turrets.push({ pivot: [tx, ty, tz], batch: b, kind: 'ciws' });
  }
  const nd = detail ? 40 : 12;
  for (let i = 0; i < nd; i++) {
    const x = -80 + rng() * 160, s = rng() < 0.5 ? -1 : 1;
    v.box(x, (rng() * 2 - 1) * 12, s * (18 + rng() * 2), x + 1 + rng() * 4, (rng() * 2 - 1) * 12 + 2, s * (18 + rng() * 2) + 2, rng() < 0.5 ? STD : HD, { spec: 0.2 });
  }
  for (const s of [-1, 1]) {
    v.box(-60, 0, s * 20.4, -20, 1.6, s * 21.0, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
    v.box(10, 0, s * 20.4, 50, 1.6, s * 21.0, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
  }
  const hull = v.compile(gl);
  return {
    name: 'close', hull, turrets, engines, len: 245, hw: 46, hh: 24, kind: 'close',
    pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, scale: 1,
    sway: { ax: 1.4, ay: 1.1, az: 1.3, fx: 0.11, fy: 0.17, fz: 0.13, pa: 0.7, pb: 1.9, pc: 2.4 },
    shieldScale: [135, 42, 34],
  };
}

/* ---------------- 前卫舰 ---------------- */
function buildVanguard(gl, seed, detail) {
  const v = new Vox(seed);
  const rng = mulberry32(seed * 7 + 11);
  const secs = [
    [-100, -70, 12, 11],
    [-70, -20, 14, 12],
    [-20, 40, 15, 13],
    [40, 80, 12, 10],
    [80, 110, 8, 7],
    [110, 140, 4, 4],
  ];
  for (const [x0, x1, hw, hh] of secs) {
    v.box(x0, -hh, -hw, x1, hh, hw, HULL, { spec: 0.35 });
    v.box(x0, -hh + 1.5, -hw + 1.5, x0 + 4, hh - 1.5, hw - 1.5, HL, { spec: 0.42 });
    v.box(x0 + 4, -hh + 2.5, -hw + 2.5, x0 + 7, hh - 2.5, hw - 2.5, HDP, { spec: 0.1 });
    for (const s of [-1, 1]) {
      v.box(x0 + 7, -5, s * (hw + 0.6), x1 - 3, -2, s * (hw + 1.8), HD, { spec: 0.26 });
      v.box(x0 + 7, 2, s * (hw + 0.6), x1 - 3, 5, s * (hw + 1.8), HD, { spec: 0.26 });
    }
    v.box(x0 + 7, hh - 1, -hw * 0.6, x1 - 3, hh + 1.8, hw * 0.6, HD, { spec: 0.3 });
  }
  for (const s of [-1, 1]) {
    v.box(100, -3, s * 8, 190, 3, s * 13, HULL, { spec: 0.4 });
    v.box(150, -2, s * 13, 200, 2, s * 17, HL, { spec: 0.45 });
    v.box(190, -2, s * 8, 204, 2, s * 13, ACCDP, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });
  }
  v.box(96, 4, -5, 196, 9, 5, HULL, { spec: 0.4 });
  v.box(180, 5, -3, 206, 8, 3, HL, { spec: 0.45 });
  const missileTubes = [];
  for (const s of [-1, 1]) {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 6; i++) {
        const x = -60 + i * 22;
        const yy = -6 + r * 11;
        const zz = s * (14.2 + r * 0.5);
        v.box(x, yy - 3, zz - 3.4, x + 16, yy + 3, zz + 3.4, STD, { spec: 0.3 });
        v.box(x + 1, yy - 2, zz - 2.4, x + 15, yy + 2, zz + 2.4, DP, { spec: 0.05 });
        v.box(x + 2, yy - 1.5, zz - 1.5, x + 12, yy + 1.5, zz + 1.5, HL, { spec: 0.5 });
        v.box(x + 10, yy - 1, zz - 1, x + 13, yy + 1, zz + 1, WAM, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });
        missileTubes.push({ pos: [x + 8, yy, zz + s * 2], dir: [1, 0, s * 0.25] });
      }
    }
  }
  v.box(-112, -9, -10, -98, 9, 10, HD, { spec: 0.35 });
  v.box(-120, -8, -9, -112, 8, 9, HL, { spec: 0.4 });
  const engines = [];
  for (const [yy, zz, rr] of [[0, -5, 4], [0, 5, 4]]) {
    const x = -120;
    v.box(x, yy - rr, zz - rr, x + 12, yy + rr, zz + rr, STD, { spec: 0.25 });
    v.box(x - 2, yy - rr * 0.6, zz - rr * 0.6, x + 3, yy + rr * 0.6, zz + rr * 0.6, WAMH, { unlit: true, e: 2.6, blend: 'add', noJit: true, noSpec: true });
    engines.push({ pos: [x - 2, yy, zz], dir: [-1, 0, 0], r: rr });
  }
  const turrets = [];
  const tv = new Vox(seed + 500);
  tv.box(-6, 0, -6, 6, 4, 6, ST, { spec: 0.4 });
  tv.box(0, 4, -2.5, 20, 6.5, -0.5, STD, { spec: 0.5 });
  tv.box(0, 4, 0.5, 20, 6.5, 2.5, STD, { spec: 0.5 });
  tv.box(19, 4, -2.5, 21, 6.5, -0.5, ACC, { unlit: true, e: 1.7, blend: 'add', noJit: true, noSpec: true });
  tv.box(19, 4, 0.5, 21, 6.5, 2.5, ACC, { unlit: true, e: 1.7, blend: 'add', noJit: true, noSpec: true });
  turrets.push({ pivot: [10, 13, 0], batch: tv.compile(gl), kind: 'pulse' });
  const nd = detail ? 34 : 10;
  for (let i = 0; i < nd; i++) {
    const x = -90 + rng() * 170, s = rng() < 0.5 ? -1 : 1;
    v.box(x, (rng() * 2 - 1) * 10, s * (14 + rng() * 2), x + 1 + rng() * 5, (rng() * 2 - 1) * 10 + 2, s * 16, rng() < 0.5 ? STD : HD, { spec: 0.2 });
  }
  for (const s of [-1, 1]) {
    v.box(-70, 0, s * 15.4, 60, 1.6, s * 16.0, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }
  const hull = v.compile(gl);
  return {
    name: 'vanguard', hull, turrets, engines, missileTubes, len: 330, hw: 26, hh: 22, kind: 'vanguard',
    pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, scale: 1,
    sway: { ax: 1.8, ay: 1.4, az: 1.6, fx: 0.09, fy: 0.14, fz: 0.12, pa: 1.1, pb: 0.4, pc: 2.0 },
    shieldScale: [180, 34, 28],
  };
}

/* ---------------- 小艇 ---------------- */
function buildBoat(gl, seed) {
  const v = new Vox(seed);
  v.box(-14, -4, -5, 10, 4, 5, HULL, { spec: 0.4 });
  v.box(10, -3, -4, 20, 3, 4, HL, { spec: 0.45 });
  v.box(20, -2, -3, 27, 2, 3, ST, { spec: 0.4 });
  v.box(-16, -3, -4, -12, 3, 4, HD, { spec: 0.4 });
  for (const s of [-1, 1]) {
    v.box(18, -1.5, s * 3 - 1.5, 32, 1.5, s * 3 + 1.5, HULL, { spec: 0.4 });
    v.box(30, -1, s * 3 - 1, 36, 1, s * 3 + 1, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
  }
  v.box(2, 4, -3, 12, 6, 3, DP, { spec: 0.05 });
  v.box(3, 4.5, -2.5, 11, 5.5, 2.5, ACC, { unlit: true, e: 1.5, blend: 'add', noJit: true, noSpec: true });
  v.box(-8, 4, -4, 4, 6, 4, HD, { spec: 0.35 });
  v.box(-4, 6, -3, 2, 8, 3, HL, { spec: 0.4 });
  for (const s of [-1, 1]) {
    v.box(-6, -2, s * 5, 6, 3, s * 10, HULL, { spec: 0.35 });
    v.box(-2, -1, s * 10, 4, 2, s * 13, HD, { spec: 0.3 });
  }
  v.box(-22, -3, -4, -16, 3, 4, STD, { spec: 0.3 });
  v.box(-24, -2, -3, -21, 2, 3, WAMH, { unlit: true, e: 2.6, blend: 'add', noJit: true, noSpec: true });
  const hull = v.compile(gl);
  return {
    name: 'boat', hull, turrets: [], engines: [{ pos: [-24, 0, 0], dir: [-1, 0, 0], r: 3.5 }],
    len: 60, hw: 14, hh: 9, kind: 'boat', missileTubes: [],
    pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, scale: 1,
    sway: { ax: 1, ay: 1, az: 1, fx: 0.2, fy: 0.3, fz: 0.25, pa: 0, pb: 0, pc: 0 },
    shieldScale: [40, 16, 20],
  };
}

/* ---------------- 编队 ---------------- */
function buildFleet(gl) {
  const flagship = buildFlagship(gl);
  const escorts = [];
  const closePos = [
    [-190, 62, 168], [-190, 62, -168], [90, 78, 188], [90, 78, -188],
    [-120, -64, 176], [-120, -64, -176], [260, 52, 140], [260, 52, -140],
    [-360, 40, 120], [-360, 40, -120],
  ];
  for (let i = 0; i < closePos.length; i++) {
    const s = buildCloseEscort(gl, 1000 + i * 17, i < 6);
    s.pos = closePos[i].slice();
    s.yaw = (i % 2 ? 1 : -1) * 0.012;
    s.home = s.pos.slice();
    s.scale = 0.85;
    s.outDir = V3.norm([closePos[i][0] === 0 ? 0.001 : closePos[i][0], 0, closePos[i][2]]);
    escorts.push(s);
  }
  const vanguardPos = [
    [420, 20, 260], [420, 20, -260], [520, 60, 180], [520, 60, -180],
    [600, -30, 300], [600, -30, -300], [700, 40, 80], [700, 40, -80],
    [780, -60, 200], [780, -60, -200], [860, 10, 340], [860, 10, -340],
  ];
  for (let i = 0; i < vanguardPos.length; i++) {
    const s = buildVanguard(gl, 2000 + i * 23, i < 8);
    s.pos = vanguardPos[i].slice();
    s.home = s.pos.slice();
    s.scale = 0.85;
    s.outDir = V3.norm([vanguardPos[i][0] === 0 ? 0.001 : vanguardPos[i][0], 0, vanguardPos[i][2]]);
    escorts.push(s);
  }
  const distant = [];
  const rng = mulberry32(4242);
  for (let i = 0; i < 22; i++) {
    const isV = rng() < 0.5;
    const s = isV ? buildVanguard(gl, 3000 + i * 31, false) : buildCloseEscort(gl, 3000 + i * 31, false);
    const x = -900 + rng() * 2200;
    const y = (rng() * 2 - 1) * 260;
    let z = (rng() < 0.5 ? -1 : 1) * (520 + rng() * 900);
    // 避开镜头航道
    if (Math.abs(z) < 980 && x > -1100 && x < 2100) {
      z = (z < 0 ? -1 : 1) * (1000 + rng() * 500);
    }
    s.pos = [x, y, z];
    s.home = s.pos.slice();
    s.scale = 0.85;
    s.yaw = (rng() - 0.5) * 0.05;
    s.outDir = V3.norm([x === 0 ? 0.001 : x, 0, z]);
    distant.push(s);
  }
  const boats = [];
  for (let i = 0; i < 7; i++) {
    const b = buildBoat(gl, 5000 + i * 41);
    b.pos = [0, 0, 0];
    b.scale = 0.6;
    boats.push(b);
  }
  return { flagship, escorts, distant, boats };
}
