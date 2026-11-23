'use strict';
/* =====================================================================
   interiors.js — 舰内四处概念空间 + 机库内部
   每个空间独立坐标，镜头在遮挡中切换
   ===================================================================== */

const DECK = PAL.deck, DECKD = PAL.deckDark, DECKL = PAL.deckLight;
const GST = PAL.glowCyan, GAM = PAL.glowAmber;

/* ---------------- 通用小工具 ---------------- */
function panelWall(v, x0, x1, y0, y1, z, th, color, o) {
  o = o || {};
  return v.box(x0, y0, z - th / 2, x1, y1, z + th / 2, color, o);
}

/* ================= 舰桥 =================
   横向 130（x ±65） 纵深 130（z ±65） 挑高 60（y 0..60）
   前方（+z）为观景开口 */
function buildBridge(gl) {
  const v = new Vox(9001);
  const rng = mulberry32(31337);
  const W = 65, D = 65, H = 60;

  // 地板与顶
  v.box(-W, -2, -D, W, 0, D, DECKD, { spec: 0.15 });
  v.box(-W, H, -D, W, H + 2, D, DECKD, { spec: 0.1 });
  // 地板分层（中庭下沉）
  v.box(-W, 0, -D, -30, 1.2, D, DECK, { spec: 0.2 });
  v.box(30, 0, -D, W, 1.2, D, DECK, { spec: 0.2 });
  v.box(-30, 0, -D, 30, 1.6, -10, DECK, { spec: 0.2 });
  v.box(-30, 0, 20, 30, 1.6, D, DECK, { spec: 0.2 });
  // 地板发光导引
  for (let z = -60; z < 60; z += 12) {
    v.box(-26, 1.25, z, 26, 1.5, z + 5, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  }
  // 侧壁
  for (const s of [-1, 1]) {
    v.box(s * W, 0, -D, s * (W + 3), H, D, DECKD, { spec: 0.12 });
    // 壁面层片
    for (let z = -60; z < 60; z += 14) {
      v.box(s * (W - 1), 4, z, s * (W - 4), 40, z + 9, DECK, { spec: 0.2 });
      v.box(s * (W - 4.5), 6, z + 1, s * (W - 4.2), 38, z + 8, ACCD, { unlit: true, e: 0.55, blend: 'add', noJit: true, noSpec: true });
    }
    // 柱
    for (let z = -52; z <= 52; z += 26) {
      v.box(s * (W - 4), 0, z - 3, s * (W - 1), H, z + 3, DECKL, { spec: 0.3 });
      v.box(s * (W - 5), 30, z - 4, s * (W - 4), 56, z + 4, ACC, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });
    }
  }
  // 后壁（含入口管）
  v.box(-W, 0, -D - 3, W, H, -D, DECKD, { spec: 0.12 });
  v.box(-8, 8, -D - 26, 8, 30, -D, DECKD, { spec: 0.05 });
  v.box(-10, 6, -D - 28, 10, 32, -D - 25, DP, { spec: 0.03 });
  v.box(-6, 10, -D - 27, 6, 28, -D - 26, ACC, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });

  // 前方观景开口（z = +D）
  v.box(-W, 0, D, -58, H, D + 3, DECKD, { spec: 0.12 });
  v.box(58, 0, D, W, H, D + 3, DECKD, { spec: 0.12 });
  v.box(-58, 52, D, 58, H, D + 3, DECKD, { spec: 0.12 });
  v.box(-58, 0, D, 58, 8, D + 3, DECKD, { spec: 0.12 });
  // 开口框架
  v.box(-62, 6, D - 1, 62, 10, D + 2, DECKL, { spec: 0.35 });
  v.box(-62, 50, D - 1, 62, 54, D + 2, DECKL, { spec: 0.35 });
  for (const s of [-1, 1]) v.box(s * 56, 8, D - 1, s * 60, 52, D + 2, DECKL, { spec: 0.35 });
  for (let x = -40; x <= 40; x += 20) v.box(x - 1.5, 10, D - 1, x + 1.5, 50, D + 2, DECK, { spec: 0.3 });
  // 开口下沿发光
  v.box(-58, 8.5, D + 1.5, 58, 9.5, D + 2.2, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
  v.box(-58, 50.5, D + 1.5, 58, 51.5, D + 2.2, ACC, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });

  // 跨空梁架（顶部）
  for (let z = -40; z <= 40; z += 20) {
    v.box(-W + 2, H - 6, z - 3, W - 2, H - 2, z + 3, DECKL, { spec: 0.3 });
    v.box(-W + 2, H - 2, z - 1, W - 2, H, z + 1, ACCD, { unlit: true, e: 0.7, blend: 'add', noJit: true, noSpec: true });
  }
  for (const s of [-1, 1]) {
    v.box(s * (W - 8), H - 14, -D, s * (W - 5), H, D, DECK, { spec: 0.25 });
  }

  /* 中央指挥中枢 */
  v.box(-14, 0, -6, 14, 3, 26, DECKL, { spec: 0.3 });
  v.box(-11, 3, -3, 11, 6, 23, DECK, { spec: 0.25 });
  v.box(-8, 6, 0, 8, 9, 20, DECKL, { spec: 0.3 });
  v.box(-6, 9, 3, 6, 12, 17, DECK, { spec: 0.25 });
  // 中枢发光芯
  v.box(-4, 12, 5, 4, 26, 15, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  v.box(-2, 26, 7, 2, 34, 13, GST, { unlit: true, e: 2.0, blend: 'add', noJit: true, noSpec: true });
  // 悬起的显示结构
  v.box(-16, 30, 2, 16, 32, 20, DECK, { spec: 0.25 });
  v.box(-14, 32, 4, 14, 33.5, 18, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  v.box(-18, 36, 6, 18, 37, 16, DECKL, { spec: 0.3 });
  v.box(-16, 37, 8, 16, 38, 14, ACCD, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });

  /* 成组控制台 */
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      const z0 = -40 + r * 26;
      const x = s * (34 + r * 8);
      v.box(x - 6, 0, z0, x + 6, 8, z0 + 18, DECK, { spec: 0.25 });
      v.box(x - 6, 8, z0, x + 6, 9, z0 + 18, DECKL, { spec: 0.3 });
      // 台面发光界面
      for (let i = 0; i < 4; i++) {
        v.box(x - 5 + i * 2.6, 9.2, z0 + 2, x - 3.6 + i * 2.6, 9.6, z0 + 14,
          (i % 2 ? ACC : GAM), { unlit: true, e: 1.5, blend: 'add', noJit: true, noSpec: true });
      }
      // 上方显示板
      v.box(x - 8, 22, z0 + 2, x + 8, 30, z0 + 5, DECKD, { spec: 0.2 });
      v.box(x - 7, 23, z0 + 5.2, x + 7, 29, z0 + 5.8, ACC, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });
      v.box(x - 6, 33, z0 + 8, x + 6, 40, z0 + 11, DECKD, { spec: 0.2 });
      v.box(x - 5, 34, z0 + 11.2, x + 5, 39, z0 + 11.8, GAM, { unlit: true, e: 0.8, blend: 'add', noJit: true, noSpec: true });
    }
  }
  // 中央操作台
  for (let i = 0; i < 5; i++) {
    const x = -20 + i * 10;
    v.box(x - 3, 0, -18, x + 3, 7, -12, DECK, { spec: 0.25 });
    v.box(x - 3, 7, -18, x + 3, 7.8, -12, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }

  /* 侧层平台（挑高上的回廊） */
  for (const s of [-1, 1]) {
    v.box(s * 46, 28, -50, s * 62, 30, 50, DECK, { spec: 0.25 });
    for (let z = -46; z < 50; z += 8) {
      v.box(s * 46, 30, z, s * 48, 34, z + 2, DECKL, { spec: 0.3 });
      v.box(s * 46.5, 33, z, s * 47.2, 33.6, z + 1.5, ACC, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });
    }
    // 斜梯
    for (let i = 0; i < 12; i++) {
      v.box(s * 46, 1.5 + i * 2.2, 44 - i * 1.6, s * 52, 3.5 + i * 2.2, 46 - i * 1.6, DECKL, { spec: 0.3 });
    }
  }

  /* 顶部悬置显示板与投影层 */
  for (let i = 0; i < 6; i++) {
    const x = -45 + i * 18, z = -30 + (i % 3) * 22;
    v.box(x - 7, 44, z - 1, x + 7, 52, z + 1, DECKD, { spec: 0.2 });
    v.box(x - 6, 45, z + 1.2, x + 6, 51, z + 1.8, (i % 2 ? ACC : GAM), { unlit: true, e: 0.85, blend: 'add', noJit: true, noSpec: true });
    v.box(x - 1, 42, z - 1, x + 1, 44, z + 1, DECKL, { spec: 0.3 });
  }

  /* 地板设备与细节 */
  for (let i = 0; i < 60; i++) {
    const x = (rng() * 2 - 1) * 58, z = (rng() * 2 - 1) * 58;
    if (Math.abs(x) < 22 && z > -20 && z < 28) continue;
    v.box(x, 0, z, x + 1 + rng() * 3, 1 + rng() * 2, z + 1 + rng() * 3, rng() < 0.5 ? DECK : DECKL, { spec: 0.2 });
  }

  /* 观景开口外的远景舰列（深色剪影 + 推进光点） */
  const far = [
    [-120, 60, 620, 260], [-40, 30, 760, 200], [60, 90, 700, 300],
    [150, 20, 820, 220], [10, -30, 660, 180], [-190, -10, 860, 240],
  ];
  for (const [fx, fy, fz, fs] of far) {
    v.box(fx - fs / 2, fy - fs * 0.09, fz, fx + fs / 2, fy + fs * 0.09, fz + fs * 0.22, [0.02, 0.03, 0.045], { spec: 0.05, noJit: true });
    v.box(fx - fs / 2, fy - fs * 0.05, fz - 2, fx - fs / 2 + fs * 0.3, fy + fs * 0.05, fz + 2, [0.05, 0.08, 0.11], { spec: 0.1, noJit: true });
    v.box(fx - fs / 2 - 6, fy - 3, fz + 2, fx - fs / 2 - 2, fy + 3, fz + 4, [0.6, 0.9, 1.0], { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
  }
  // 远处天体弧面
  v.boxc(-380, 120, 900, 300, 300, 300, [0.05, 0.07, 0.10], { spec: 0.05, noJit: true });
  v.boxc(-380, 120, 745, 300, 300, 20, [0.10, 0.16, 0.22], { spec: 0.05, noJit: true });

  const batch = v.compile(gl);

  /* 动态：全息舰队图形（简化立体舰船光点） */
  const holo = new Vox(9002);
  const holoShips = [];
  for (let i = 0; i < 9; i++) {
    holoShips.push({
      x: (rng() * 2 - 1) * 16, z: -14 + rng() * 34, y: 14 + rng() * 18,
      vx: (rng() * 2 - 1) * 0.6, vz: 0.4 + rng() * 0.8, s: 0.6 + rng() * 1.1,
    });
  }
  const holoBatch = new VoxelBatch(gl, 900);
  const holoAdd = { opaque: holoBatch, alpha: holoBatch, add: holoBatch, model: IDENTITY };

  return {
    name: 'bridge', batch, holoBatch, holoShips, holo,
    env: {
      fogColor: [0.012, 0.02, 0.03], fogDensity: 0.0016,
      exposure: 1.1, bloom: 0.9,
      dirDir: [-0.3, 0.8, -0.5], dirColor: [0.35, 0.45, 0.6],
      fillDir: [0.4, 0.2, 0.8], fillColor: [0.10, 0.16, 0.22],
      ambSky: [0.16, 0.22, 0.30], ambGround: [0.05, 0.07, 0.10],
      seam: 0.22, jitter: 0.07,
    },
    lights: [
      { pos: [0, 26, 8], col: [0.5, 0.95, 1.0], intensity: 1.1, radius: 90 },
      { pos: [-40, 34, -20], col: [0.4, 0.8, 1.0], intensity: 0.6, radius: 80 },
      { pos: [40, 34, -20], col: [1.0, 0.8, 0.5], intensity: 0.45, radius: 80 },
      { pos: [0, 40, 55], col: [0.6, 0.8, 1.0], intensity: 0.7, radius: 110 },
    ],
  };
}

/* ================= 动力核心中庭 =================
   横向 250（x ±125） 高度 250（y 0..250） 纵深 250（z ±125） */
function buildCore(gl) {
  const v = new Vox(9101);
  const rng = mulberry32(5150);
  const R = 125, H = 250;

  // 地板 / 顶
  v.box(-R, -4, -R, R, 0, R, DECKD, { spec: 0.12 });
  v.box(-R, H, -R, R, H + 4, R, DECKD, { spec: 0.1 });
  // 地板同心环
  for (let r = 20; r < R; r += 24) {
    v.box(-r, 0, -r, r, 1.2, r, DECK, { spec: 0.15 });
  }
  // 地板发光环
  for (let r = 32; r < R; r += 48) {
    v.box(-r, 1.25, -r, r, 1.6, r, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  }
  // 舱壁
  for (const s of [-1, 1]) {
    v.box(s * R, 0, -R, s * (R + 5), H, R, DECKD, { spec: 0.1 });
    v.box(s * R, 0, -R, s * (R + 5), H, R, DECKD, { spec: 0.1 });
  }
  v.box(-R, 0, -R, R, H, -R - 5, DECKD, { spec: 0.1 });
  v.box(-R, 0, R, R, H, R + 5, DECKD, { spec: 0.1 });
  // 壁面层片与凹腔
  for (const s of [-1, 1]) {
    for (let y = 8; y < H; y += 26) {
      v.box(s * (R - 3), y, -R + 6, s * (R - 8), y + 16, R - 6, DECK, { spec: 0.18 });
      v.box(s * (R - 8.5), y + 2, -R + 10, s * (R - 8.2), y + 14, R - 10, ACCD, { unlit: true, e: 0.5, blend: 'add', noJit: true, noSpec: true });
    }
    for (let z = -R + 14; z < R - 10; z += 34) {
      v.box(s * (R - 2), 0, z, s * (R + 1), H, z + 8, DECKL, { spec: 0.25 });
    }
  }
  for (let x = -R + 14; x < R - 10; x += 34) {
    v.box(x, 0, -R - 1, x + 8, H, R + 1, DECKL, { spec: 0.25 });
    v.box(x, 0, R + 1, x + 8, H, R + 2, DECKL, { spec: 0.25 });
  }

  /* 多层环形平台（5 层以上） */
  const levels = [16, 52, 92, 132, 172, 212];
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    const rr = 62 + (li % 2) * 14;
    // 环形走道（四段）
    for (let q = 0; q < 4; q++) {
      const a0 = q * PI / 2 + 0.12, a1 = (q + 1) * PI / 2 - 0.12;
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const t0 = lerp(a0, a1, i / segs), t1 = lerp(a0, a1, (i + 1) / segs);
        const x0 = Math.cos(t0) * rr, z0 = Math.sin(t0) * rr;
        const x1 = Math.cos(t1) * rr, z1 = Math.sin(t1) * rr;
        v.box(Math.min(x0, x1) - 4, y, Math.min(z0, z1) - 4, Math.max(x0, x1) + 4, y + 3, Math.max(z0, z1) + 4, DECK, { spec: 0.22 });
      }
    }
    // 护栏与发光
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      v.box(x - 1, y + 3, z - 1, x + 1, y + 7, z + 1, DECKL, { spec: 0.3 });
      if (i % 3 === 0) v.box(x - 1.2, y + 7, z - 1.2, x + 1.2, y + 7.8, z + 1.2, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
    }
    // 平台下方支撑
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      v.box(x - 2, y - 8, z - 2, x + 2, y, z + 2, DECKL, { spec: 0.25 });
    }
  }
  // 连接坡道
  for (let li = 0; li < levels.length - 1; li++) {
    const y0 = levels[li], y1 = levels[li + 1];
    const a = li * 1.3 + 0.5;
    const x = Math.cos(a) * 58, z = Math.sin(a) * 58;
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      v.box(x - 3, lerp(y0, y1, t), z - 3, x + 3, lerp(y0, y1, t) + 1.5, z + 3, DECKL, { spec: 0.25 });
    }
  }

  /* 巨大支撑：从舱壁伸向核心 */
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    const y = 20 + (i % 5) * 46;
    const cx = Math.cos(a), cz = Math.sin(a);
    const r0 = 30, r1 = 118;
    const segs = 8;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const x0 = cx * lerp(r0, r1, t0), z0 = cz * lerp(r0, r1, t0);
      const x1 = cx * lerp(r0, r1, t1), z1 = cz * lerp(r0, r1, t1);
      v.box(Math.min(x0, x1) - 5, y - 5, Math.min(z0, z1) - 5, Math.max(x0, x1) + 5, y + 5, Math.max(z0, z1) + 5, DECKL, { spec: 0.25 });
    }
    v.box(cx * r0 - 7, y - 8, cz * r0 - 7, cx * r0 + 7, y + 8, cz * r0 + 7, ACCD, { unlit: true, e: 0.7, blend: 'add', noJit: true, noSpec: true });
  }

  /* 中央核心：体素外构架 + 发光内层 */
  const coreV = new Vox(9102);
  const cy0 = 12, cy1 = 238;
  // 内层发光体
  coreV.box(-14, cy0, -14, 14, cy1, 14, ACC, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true, alpha: 0.55 });
  coreV.box(-9, cy0 + 8, -9, 9, cy1 - 8, 9, GST, { unlit: true, e: 1.8, blend: 'add', noJit: true, noSpec: true, alpha: 0.8 });
  coreV.box(-4, cy0 + 20, -4, 4, cy1 - 20, 4, [0.9, 1.0, 1.0], { unlit: true, e: 2.6, blend: 'add', noJit: true, noSpec: true, alpha: 0.9 });
  // 外构架（分段环与立柱）
  for (let y = cy0 + 6; y < cy1; y += 18) {
    coreV.box(-20, y, -20, 20, y + 4, 20, ST, { spec: 0.35 });
    coreV.box(-22, y - 2, -22, -18, y + 6, 22, HL, { spec: 0.4 });
    coreV.box(18, y - 2, -22, 22, y + 6, 22, HL, { spec: 0.4 });
    coreV.box(-22, y - 2, -22, 22, y + 6, -18, HL, { spec: 0.4 });
    coreV.box(-22, y - 2, 18, 22, y + 6, 22, HL, { spec: 0.4 });
  }
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4;
    const x = Math.cos(a) * 20, z = Math.sin(a) * 20;
    coreV.box(x - 3, cy0, z - 3, x + 3, cy1, z + 3, ST, { spec: 0.35 });
    coreV.box(x - 4, cy0, z - 4, x + 4, cy0 + 6, z + 4, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }
  const coreBatch = coreV.compile(gl);

  /* 旋转环带（独立动态） */
  const rings = [];
  const ringDefs = [
    { r: 34, y: 40, w: 5, speed: 0.11, col: HL },
    { r: 44, y: 86, w: 6, speed: -0.075, col: ST },
    { r: 52, y: 128, w: 5, speed: 0.055, col: HL },
    { r: 46, y: 170, w: 7, speed: -0.045, col: ST },
    { r: 38, y: 210, w: 5, speed: 0.065, col: HL },
  ];
  for (let i = 0; i < ringDefs.length; i++) {
    const rd = ringDefs[i];
    const rv = new Vox(9200 + i);
    const segs = 28;
    for (let s = 0; s < segs; s++) {
      const a0 = s / segs * TAU, a1 = (s + 1) / segs * TAU;
      const x0 = Math.cos(a0) * rd.r, z0 = Math.sin(a0) * rd.r;
      const x1 = Math.cos(a1) * rd.r, z1 = Math.sin(a1) * rd.r;
      rv.box(Math.min(x0, x1) - rd.w / 2, rd.y - 3, Math.min(z0, z1) - rd.w / 2,
        Math.max(x0, x1) + rd.w / 2, rd.y + 3, Math.max(z0, z1) + rd.w / 2, rd.col, { spec: 0.4 });
      if (s % 4 === 0) {
        rv.box(x0 - 2, rd.y + 3, z0 - 2, x0 + 2, rd.y + 9, z0 + 2, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
      }
    }
    // 连接臂
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU;
      rv.box(Math.cos(a) * 22 - 2, rd.y - 2, Math.sin(a) * 22 - 2, Math.cos(a) * rd.r + 2, rd.y + 2, Math.sin(a) * rd.r + 2, ST, { spec: 0.3 });
    }
    rings.push({ batch: rv.compile(gl), speed: rd.speed, y: rd.y, r: rd.r });
  }

  /* 入口管（镜头切换用） */
  v.box(-R + 20, 0, -R - 30, -R + 60, 26, -R, DECKD, { spec: 0.05 });
  v.box(-R + 18, -2, -R - 32, -R + 62, 28, -R - 28, DP, { spec: 0.02 });

  const batch = v.compile(gl);
  return {
    name: 'core', batch, coreBatch, rings,
    env: {
      fogColor: [0.010, 0.018, 0.028], fogDensity: 0.0012,
      exposure: 1.15, bloom: 1.0,
      dirDir: [-0.2, 0.9, -0.4], dirColor: [0.3, 0.4, 0.55],
      fillDir: [0.3, 0.1, 0.8], fillColor: [0.08, 0.12, 0.18],
      ambSky: [0.13, 0.18, 0.25], ambGround: [0.04, 0.06, 0.09],
      seam: 0.22, jitter: 0.07,
    },
    lights: [
      { pos: [0, 120, 0], col: [0.55, 0.95, 1.0], intensity: 1.5, radius: 200 },
      { pos: [0, 40, 0], col: [0.5, 0.9, 1.0], intensity: 0.8, radius: 120 },
      { pos: [0, 200, 0], col: [0.5, 0.9, 1.0], intensity: 0.8, radius: 120 },
      { pos: [90, 80, 90], col: [0.4, 0.7, 1.0], intensity: 0.5, radius: 130 },
      { pos: [-90, 160, -90], col: [1.0, 0.8, 0.5], intensity: 0.35, radius: 130 },
    ],
  };
}

/* ================= 能量装填与导能长廊 =================
   长 360（x ±180） 宽 100（z ±50） 高 70（y 0..70） */
function buildCorridor(gl) {
  const v = new Vox(9301);
  const rng = mulberry32(7777);
  const L = 180, W = 50, H = 70;

  v.box(-L, -3, -W, L, 0, W, DECKD, { spec: 0.12 });
  v.box(-L, H, -W, L, H + 3, W, DECKD, { spec: 0.1 });
  // 地板中央通道 + 发光
  v.box(-L, 0, -14, L, 1.2, 14, DECK, { spec: 0.18 });
  for (let x = -L + 6; x < L; x += 16) {
    v.box(x, 1.25, -12, x + 8, 1.6, -10, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
    v.box(x, 1.25, 10, x + 8, 1.6, 12, ACC, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
  }
  v.box(-L, 1.3, -2, L, 1.7, 2, GAM, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });

  // 侧壁
  for (const s of [-1, 1]) {
    v.box(s * W, 0, -L, s * (W + 4), H, L, DECKD, { spec: 0.1 });
    for (let x = -L + 8; x < L; x += 20) {
      v.box(s * (W - 2), 2, x, s * (W - 6), H - 4, x + 10, DECK, { spec: 0.18 });
      v.box(s * (W - 6.5), 6, x + 1, s * (W - 6.2), H - 8, x + 9, ACCD, { unlit: true, e: 0.5, blend: 'add', noJit: true, noSpec: true });
    }
  }
  // 端壁
  v.box(-L - 4, 0, -W, -L, H, W, DECKD, { spec: 0.1 });
  // 尽头更宽阔的发光腔口
  v.box(L, 0, -W, L + 40, H + 30, W, DP, { spec: 0.03 });
  v.box(L + 40, -30, -W - 10, L + 44, H + 34, W + 10, DECKD, { spec: 0.05 });
  v.box(L + 38, 10, -30, L + 42, H - 10, 30, ACC, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });
  v.box(L + 36, 20, -18, L + 40, H - 20, 18, GST, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });

  /* 高大的装填装置（两侧多列） */
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = -150 + i * 36;
      const w = 14 + (i % 3) * 3;
      const h = 34 + (i % 4) * 8;
      const z = s * (W - 12);
      // 厚重外构架
      v.box(x - w / 2, 0, z - 8, x + w / 2, h, z + 8, ST, { spec: 0.35 });
      v.box(x - w / 2 - 2, h, z - 10, x + w / 2 + 2, h + 5, z + 10, HL, { spec: 0.4 });
      v.box(x - w / 2 - 2, 0, z - 10, x - w / 2 + 2, h, z - 6, HL, { spec: 0.4 });
      v.box(x + w / 2 - 2, 0, z - 10, x + w / 2 + 2, h, z - 6, HL, { spec: 0.4 });
      // 深色夹层
      v.box(x - w / 2 + 3, 4, z - 6, x + w / 2 - 3, h - 4, z + 6, DP, { spec: 0.05 });
      // 内部亮核
      v.box(x - 2, 6, z - 3, x + 2, h - 6, z + 3, ACC, { unlit: true, e: 1.5, blend: 'add', noJit: true, noSpec: true });
      // 槽列
      for (let k = 0; k < 5; k++) {
        const yy = 8 + k * ((h - 14) / 5);
        v.box(x - w / 2 + 2, yy, z + 6.5, x - w / 2 + 4, yy + 3, z + 8, DECKL, { spec: 0.3 });
        v.box(x + w / 2 - 4, yy, z + 6.5, x + w / 2 - 2, yy + 3, z + 8, DECKL, { spec: 0.3 });
      }
      // 顶部口沿
      v.box(x - w / 2 - 3, h + 5, z - 11, x + w / 2 + 3, h + 8, z + 11, ACCD, { unlit: true, e: 0.8, blend: 'add', noJit: true, noSpec: true });
    }
  }

  /* 跨间框架（粗大框架跨间连续后退） */
  for (let i = 0; i < 10; i++) {
    const x = -162 + i * 36;
    v.box(x - 5, 0, -W + 2, x + 5, H, -W + 6, DECKL, { spec: 0.3 });
    v.box(x - 5, 0, W - 6, x + 5, H, W - 2, DECKL, { spec: 0.3 });
    v.box(x - 5, H - 8, -W + 2, x + 5, H, W - 2, DECKL, { spec: 0.3 });
    v.box(x - 5, H - 8, -W + 2, x + 5, H - 5, -W + 6, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
    v.box(x - 5, H - 8, W - 6, x + 5, H - 5, W - 2, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
    // 悬置导能构件
    const y = 22 + (i % 3) * 12;
    v.box(x - 8, y, -18, x + 8, y + 5, 18, ST, { spec: 0.35 });
    v.box(x - 6, y + 5, -14, x + 6, y + 7, 14, ACCD, { unlit: true, e: 0.9, blend: 'add', noJit: true, noSpec: true });
  }

  /* 顶部管道与侧壁挂件 */
  for (const s of [-1, 1]) {
    v.box(-L, H - 14, s * (W - 6), L, H - 8, s * (W - 2), ST, { spec: 0.3 });
    for (let x = -L + 20; x < L; x += 40) {
      v.box(x - 3, H - 22, s * (W - 10), x + 3, H - 14, s * (W - 4), DECKL, { spec: 0.3 });
    }
  }

  const batch = v.compile(gl);

  /* 动态：槽列中分批前进的能量光块 */
  const dyn = new Vox(9302);
  const dynBatch = new VoxelBatch(gl, 1200);
  const dynAdd = dynBatch;

  return {
    name: 'corridor', batch, dynBatch,
    update(t, add) {
      add.reset();
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x0 = -150 + i * 36;
          const ph = (t * 0.35 + i * 0.7 + (s > 0 ? 0.35 : 0)) % 1;
          const yy = 8 + ph * 22;
          add.box(x0 - 2, yy, s * 38 - 2, x0 + 2, yy + 4, s * 38 + 2, GST, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true });
        }
      }
      // 悬置构件的合分
      for (let i = 0; i < 5; i++) {
        const x = -162 + i * 72;
        const open = (Math.sin(t * 0.5 + i * 1.3) * 0.5 + 0.5) * 10;
        add.box(x - 10, 26, -16 + open * 0.2, x + 10, 28, -14 + open * 0.2, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
        add.box(x - 10, 26, 14 - open * 0.2, x + 10, 28, 16 - open * 0.2, ACC, { unlit: true, e: 1.3, blend: 'add', noJit: true, noSpec: true });
      }
    },
    env: {
      fogColor: [0.012, 0.02, 0.03], fogDensity: 0.0016,
      exposure: 0.92, bloom: 0.8,
      dirDir: [-0.7, 0.3, -0.6], dirColor: [0.35, 0.42, 0.55],
      fillDir: [0.5, 0.3, 0.7], fillColor: [0.10, 0.15, 0.22],
      ambSky: [0.15, 0.20, 0.27], ambGround: [0.05, 0.07, 0.10],
      seam: 0.22, jitter: 0.07,
    },
    lights: [
      { pos: [0, 40, 0], col: [0.5, 0.9, 1.0], intensity: 0.7, radius: 160 },
      { pos: [-120, 30, 0], col: [0.5, 0.85, 1.0], intensity: 0.5, radius: 120 },
      { pos: [120, 30, 0], col: [0.6, 0.9, 1.0], intensity: 0.6, radius: 140 },
      { pos: [180, 40, 0], col: [0.7, 0.95, 1.0], intensity: 0.9, radius: 130 },
      { pos: [0, 12, 20], col: [1.0, 0.8, 0.5], intensity: 0.3, radius: 90 },
    ],
  };
}

/* ================= 机库内部补充 =================
   腔体：x -90..150, y -16..20, z 32..52（开口在 z=52） */
function buildHangarExtras(gl) {
  const v = new Vox(9401);
  // 停泊小艇（3 艘静止）
  for (let i = 0; i < 3; i++) {
    const x = -110 + i * 90, z = 38;
    v.box(x - 10, -14, z - 4, x + 8, -8, z + 4, HULL, { spec: 0.4 });
    v.box(x + 8, -13, z - 3, x + 16, -9, z + 3, HL, { spec: 0.45 });
    v.box(x - 12, -13, z - 3, x - 9, -9, z + 3, HD, { spec: 0.4 });
    v.box(x - 2, -8, z - 3, x + 6, -6, z + 3, DP, { spec: 0.05 });
    v.box(x - 1, -7.5, z - 2.5, x + 5, -6.5, z + 2.5, ACC, { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true });
    for (const s of [-1, 1]) {
      v.box(x - 4, -13, z + s * 4, x + 4, -10, z + s * 8, HULL, { spec: 0.35 });
    }
    // 停泊支架
    v.box(x - 8, -16, z - 3, x - 5, -14, z + 3, ST, { spec: 0.3 });
    v.box(x + 5, -16, z - 3, x + 8, -14, z + 3, ST, { spec: 0.3 });
  }
  // 顶部检修桥
  v.box(-84, 10, 34, 144, 12, 50, ST, { spec: 0.3 });
  for (let x = -80; x < 140; x += 12) {
    v.box(x, 8, 36, x + 2, 10, 48, STD, { spec: 0.25 });
  }
  v.box(-84, 12, 34, 144, 13, 36, ACC, { unlit: true, e: 1.0, blend: 'add', noJit: true, noSpec: true });
  // 侧壁设备箱
  for (let i = 0; i < 12; i++) {
    const x = -80 + i * 20;
    v.box(x, -14, 33, x + 8, -6, 36, DECK, { spec: 0.2 });
    v.box(x + 1, -8, 36.4, x + 7, -7, 37, ACC, { unlit: true, e: 1.1, blend: 'add', noJit: true, noSpec: true });
  }
  const batch = v.compile(gl);
  return { name: 'hangar', batch };
}

function buildInteriors(gl) {
  return {
    bridge: buildBridge(gl),
    core: buildCore(gl),
    corridor: buildCorridor(gl),
    hangar: buildHangarExtras(gl),
  };
}
