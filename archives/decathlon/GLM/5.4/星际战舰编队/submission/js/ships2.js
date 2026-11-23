'use strict';
/* ==================================================================
   近卫舰 / 前卫舰 / 小艇 / 炮台 / 导弹 / 陨石
   ================================================================== */

function secLerp(SEC, x) {
  if (x <= SEC[0][0]) return SEC[0];
  for (let i = 1; i < SEC.length; i++) if (x <= SEC[i][0]) {
    const a = SEC[i - 1], b = SEC[i], t = (x - a[0]) / (b[0] - a[0]);
    return [x, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
  }
  return SEC[SEC.length - 1];
}

/* ---------------- 近卫舰：紧凑厚实 ---------------- */
function buildEscort() {
  const g = new VoxGrid(230, 110, 180, 0, 0, -90);
  const SEC = [[10, 30, 24, 62], [40, 42, 20, 68], [90, 46, 18, 70], [140, 44, 20, 68], [175, 34, 26, 62], [200, 9, 38, 52]];
  const HW = x => secLerp(SEC, x)[1], YB = x => secLerp(SEC, x)[2], YT = x => secLerp(SEC, x)[3];
  for (let x = 10; x <= 200; x++) { const s = secLerp(SEC, x); g.ringX(x, s[1], s[2], s[3], 9, 5, C.HULL_DARK); }
  for (let x = 10; x <= 18; x++) solidX(g, x, HW(x), YB(x), YT(x), 9, C.HULL_DEEP);
  for (let x = 194; x <= 200; x++) solidX(g, x, HW(x), YB(x), YT(x), 9, C.HULL_MID);
  // 叠层壳片
  for (let k = 0; k < 3; k++) {
    for (let x = 30 + k * 34; x <= 170 - k * 12; x++) {
      ringXAt(g, x, 0, 42 - k * 7, 24 + k * 10, 66 - k * 6, 7, 3, k % 2 ? C.HULL_MID : C.HULL);
    }
  }
  // 舰首楔形
  for (let x = 175; x <= 206; x++) {
    const t = (x - 175) / 31;
    solidX(g, x, Math.max(2, 30 * (1 - t)), 38 + 4 * t, 54 - 4 * t, 6, x > 195 ? C.HULL_LIGHT : C.HULL_MID);
  }
  g.fill(182, 44, -20, 196, 48, 20, C.GLOW_EMBER);
  g.fill(196, 45, -12, 202, 47, 12, C.GLOW_AMBER);
  // 短翼
  for (const side of [-1, 1]) {
    for (let x = 52; x <= 142; x++) {
      const t = (x - 52) / 90, zo = 44 + 34 * t * t;
      g.fill(x, 34, side > 0 ? 42 : -zo, x, 46, side > 0 ? zo : -42, C.HULL);
      if (t > 0.15) g.fill(x, 46, side > 0 ? 46 : -zo + 3, x, 48, side > 0 ? zo - 3 : -46, C.HULL_MID);
      if (t > 0.5) g.fill(x, 30, side > 0 ? 50 : -zo + 6, x, 34, side > 0 ? zo - 6 : -50, C.HULL_DARK);
    }
    g.fill(130, 34, side * 70, 146, 48, side * 80, C.GUNMETAL);
    g.fill(134, 36, side * 72, 142, 46, side * 78, C.GLOW_EMBER);
    for (let x = 60; x < 140; x += 16) {
      const t = (x - 52) / 90, zo = 44 + 34 * t * t;
      g.fill(x, 46, side * (zo - 4), x + 8, 47, side * (zo - 1), C.GLOW_AMBER);
    }
  }
  // 背脊
  for (let x = 55; x <= 165; x++) {
    const hw = x < 70 ? 16 : x > 150 ? 12 : 22;
    const y1 = x < 70 ? 76 : x > 150 ? 74 : 82;
    g.fill(x, 68, -hw, x, y1, hw, C.HULL);
    g.fill(x, y1, -hw + 3, x, y1 + 2, hw - 3, C.HULL_MID);
  }
  for (let x = 70; x < 155; x += 22) {
    g.fill(x, 82, -14, x + 10, 83, -10, C.GLOW_AMBER);
    g.fill(x, 82, 10, x + 10, 83, 14, C.GLOW_AMBER);
  }
  // 腹部龙骨
  for (let x = 40; x <= 175; x++) { const yb = YB(x); g.fill(x, yb - 10, -16, x, yb, 16, C.HULL_DEEP); }
  for (let x = 55; x <= 165; x += 26) { const yb = YB(x); g.fill(x, yb - 14, -22, x + 7, yb - 8, 22, C.GUNMETAL); }
  // 侧板
  for (const side of [-1, 1]) {
    for (let x = 34; x < 168; x += 34) {
      for (let y = 30; y < 62; y += 16) {
        let ok = true;
        for (let xx = x; xx <= x + 26; xx++) if (y < YB(xx) + 11 || y + 12 > YT(xx) - 11) ok = false;
        if (!ok) continue;
        plateSide(g, x, x + 26, y, y + 12, side, 2, ((x / 34 + y / 16) | 0) % 2 ? C.HULL : C.HULL_MID, HW);
      }
    }
  }
  // 尾喷口
  const noz = [];
  for (const z of [-26, 0, 26]) {
    nozzle(g, 10, 44, z, 22, 26, 20, C.GLOW_AMBER, C.HULL_MID);
    noz.push({ x: 10, y: 44, z, w: 22, h: 26 });
  }
  g.fill(10, 26, -46, 26, 66, 46, C.HULL_DARK);
  g.frameBox(6, 20, -50, 16, 70, 50, 6, C.GUNMETAL);
  return {
    model: new VoxModel(g, 'escort'), nozzles: noz, length: 206,
    ciws: [{ x: 80, y: 83, z: 0 }, { x: 132, y: 83, z: 0 }, { x: 60, y: 71, z: 36 }, { x: 60, y: 71, z: -36 }],
    center: [110, 45, 0],
  };
}

/* ---------------- 前卫舰：舒展延伸 ---------------- */
function buildVanguard() {
  const g = new VoxGrid(270, 90, 230, 0, 0, -115);
  const SEC = [[15, 26, 26, 54], [60, 20, 28, 52], [150, 18, 30, 50], [200, 14, 34, 46], [245, 4, 38, 44]];
  const HW = x => secLerp(SEC, x)[1], YB = x => secLerp(SEC, x)[2], YT = x => secLerp(SEC, x)[3];
  for (let x = 15; x <= 245; x++) { const s = secLerp(SEC, x); g.ringX(x, s[1], s[2], s[3], 6, 4, C.HULL_DARK); }
  for (let x = 15; x <= 22; x++) solidX(g, x, HW(x), YB(x), YT(x), 6, C.HULL_DEEP);
  for (let x = 238; x <= 245; x++) solidX(g, x, HW(x), YB(x), YT(x), 6, C.HULL_LIGHT);
  for (let k = 0; k < 3; k++) {
    for (let x = 40 + k * 26; x <= 215 - k * 16; x++) {
      ringXAt(g, x, 0, 19 - k * 4, 29 + k * 5, 51 - k * 4, 5, 2, k % 2 ? C.HULL_MID : C.HULL);
    }
  }
  // 舰首
  for (let x = 220; x <= 252; x++) {
    const t = (x - 220) / 32;
    solidX(g, x, Math.max(1, 12 * (1 - t)), 37 + 2 * t, 45 - 2 * t, 4, C.HULL_MID);
  }
  g.fill(228, 41, -8, 246, 43, 8, C.GLOW_CYAN_D);
  g.fill(246, 41, -4, 250, 43, 4, C.GLOW_CYAN);
  // 外伸桁架 + 发射部
  for (const side of [-1, 1]) {
    for (let x = 60; x <= 190; x++) {
      const t = (x - 60) / 130, zo = 36 + 62 * Math.sin(t * Math.PI * 0.92);
      g.fill(x, 34, side > 0 ? 18 : -zo, x, 40, side > 0 ? zo : -18, C.HULL);
      g.fill(x, 40, side > 0 ? 20 : -zo + 3, x, 42, side > 0 ? zo - 3 : -20, C.HULL_MID);
    }
    for (let x = 70; x < 185; x += 22) {
      const t = (x - 60) / 130, zo = 36 + 62 * Math.sin(t * Math.PI * 0.92);
      g.fill(x, 42, side * (zo - 5), x + 10, 43, side * (zo - 1), C.GLOW_AMBER);
    }
    const z0 = side > 0 ? 62 : -102, z1 = side > 0 ? 102 : -62;
    g.fill(92, 26, z0, 184, 52, z1, C.GUNMETAL);
    g.fill(96, 30, z0 + 4, 180, 48, z1 - 4, C.HULL_DEEP);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const xx = 104 + i * 15, zz = z0 + 8 + row * 16;
        g.carve(xx, 34, zz, 184, 44, zz + 9);
        g.fill(xx + 1, 36, zz + 1, xx + 3, 42, zz + 3, C.GLOW_EMBER);
        g.fill(xx + 1, 36, zz + 1, xx + 2, 42, zz + 8, C.GLOW_AMBER);
      }
    }
    g.fill(184, 30, z0 + 4, 190, 48, z1 - 4, C.HULL_MID);
    g.fill(188, 34, z0 + 8, 190, 44, z1 - 8, C.GLOW_AMBER);
  }
  const noz = [];
  for (const z of [-20, 20]) {
    nozzle(g, 15, 40, z, 28, 26, 22, C.GLOW_AMBER, C.HULL_MID);
    noz.push({ x: 15, y: 40, z, w: 28, h: 26 });
  }
  g.fill(15, 28, -40, 30, 54, 40, C.HULL_DARK);
  return {
    model: new VoxModel(g, 'vanguard'), nozzles: noz, length: 250,
    tubes: [{ x: 188, y: 39, z: 62 }, { x: 188, y: 39, z: -62 }, { x: 188, y: 39, z: 82 }, { x: 188, y: 39, z: -82 }],
    center: [130, 40, 0],
  };
}

/* ---------------- 小艇 ---------------- */
function buildSmallCraft(tint) {
  const g = new VoxGrid(44, 26, 34, 0, 0, -17);
  const body = tint || C.HULL_MID;
  g.fill(6, 7, -6, 30, 15, 6, body);
  g.fill(6, 15, -5, 28, 17, 5, C.HULL_LIGHT);
  g.fill(30, 8, -5, 36, 14, 5, C.HULL_MID);
  g.fill(36, 10, -3, 40, 12, 3, C.GLOW_WHITE);
  g.fill(22, 17, -4, 30, 21, 4, C.GLASS_CYAN);
  g.fill(23, 21, -3, 29, 22, 3, C.HULL_DARK);
  for (const side of [-1, 1]) {
    g.fill(12, 9, side * 6, 26, 12, side * 15, C.HULL);
    g.fill(14, 12, side * 15, 22, 13, side * 16, C.GLOW_AMBER);
    g.fill(10, 8, side * 6, 14, 12, side * 10, C.HULL_DARK);
  }
  g.fill(4, 8, -4, 6, 14, -1, C.GLOW_AMBER);
  g.fill(4, 8, 1, 6, 14, 4, C.GLOW_AMBER);
  g.fill(2, 9, -3, 4, 13, -2, C.GLOW_WHITE);
  g.fill(2, 9, 2, 4, 13, 3, C.GLOW_WHITE);
  g.fill(10, 13, -7, 26, 14, -6, C.GLOW_CYAN);
  g.fill(10, 13, 6, 26, 14, 7, C.GLOW_CYAN);
  return { model: new VoxModel(g, 'smallcraft'), nozzles: [{ x: 4, y: 11, z: -2, w: 4, h: 5 }, { x: 4, y: 11, z: 2, w: 4, h: 5 }], length: 38, center: [22, 13, 0] };
}

/* ---------------- 脉冲炮台 ---------------- */
function buildPulseTurret() {
  const g = new VoxGrid(60, 46, 60, 0, 0, -30);
  g.fill(12, 0, -16, 48, 6, 16, C.GUNMETAL);
  g.fill(16, 6, -12, 44, 10, 12, C.HULL_DARK);
  g.fill(22, 10, -9, 38, 14, 9, C.GUNMETAL);
  g.fill(18, 14, -11, 42, 30, 11, C.HULL);
  g.fill(20, 30, -9, 40, 33, 9, C.HULL_MID);
  g.fill(14, 16, -13, 18, 28, 13, C.HULL_DARK);
  g.fill(42, 20, -4, 58, 26, 4, C.GUNMETAL);
  g.fill(46, 19, -5, 54, 27, 5, C.STEEL);
  g.fill(50, 20, -4, 52, 26, 4, C.GLOW_CYAN);
  g.fill(56, 21, -3, 59, 25, 3, C.GLOW_WHITE);
  g.fill(34, 15, -11, 38, 29, 11, C.GLOW_EMBER);
  g.fill(24, 16, -11, 27, 28, 11, C.GLOW_EMBER);
  return { model: new VoxModel(g, 'turret'), muzzle: [58, 23, 0], center: [30, 23, 0], size: [60, 46, 60] };
}

/* ---------------- 近防炮座 ---------------- */
function buildCIWS() {
  const g = new VoxGrid(36, 30, 36, 0, 0, -18);
  g.fill(6, 0, -10, 28, 4, 10, C.GUNMETAL);
  g.fill(9, 4, -7, 25, 8, 7, C.HULL_DARK);
  g.fill(11, 8, -6, 23, 20, 6, C.HULL);
  g.fill(13, 20, -5, 21, 23, 5, C.HULL_MID);
  g.fill(22, 12, -5, 33, 15, -2, C.STEEL);
  g.fill(22, 12, 2, 33, 15, 5, C.STEEL);
  g.fill(33, 12, -5, 35, 15, -2, C.GLOW_AMBER);
  g.fill(33, 12, 2, 35, 15, 5, C.GLOW_AMBER);
  g.fill(16, 9, -6, 18, 19, 6, C.GLOW_EMBER);
  return { model: new VoxModel(g, 'ciws'), muzzles: [[34, 13.5, -3.5], [34, 13.5, 3.5]], center: [18, 13, 0] };
}

/* ---------------- 导弹 ---------------- */
function buildMissile() {
  const g = new VoxGrid(28, 12, 12, 0, 0, -6);
  g.fill(0, 3, -2, 18, 8, 2, C.HULL_LIGHT);
  g.fill(18, 4, -1, 23, 7, 1, C.GLOW_WHITE);
  g.fill(0, 3, -2, 2, 8, 2, C.GUNMETAL);
  g.fill(1, 1, -1, 5, 3, 1, C.GUNMETAL);
  g.fill(1, 8, -1, 5, 10, 1, C.GUNMETAL);
  g.fill(1, 3, -4, 5, 8, -2, C.GUNMETAL);
  g.fill(1, 3, 2, 5, 8, 4, C.GUNMETAL);
  g.fill(-2, 4, -1, 0, 7, 1, C.GLOW_AMBER);
  g.fill(-4, 4, -1, -2, 7, 1, C.GLOW_WHITE);
  return { model: new VoxModel(g, 'missile'), length: 27, center: [10, 5.5, 0] };
}

/* ---------------- 陨石 ---------------- */
function buildAsteroid(seed, radius) {
  const n = Math.ceil(radius * 2.7) | 1;
  const c = (n / 2) | 0;
  const g = new VoxGrid(n, n, n, -c, -c, -c);
  const chunk = new Uint8Array(n * n * n);
  const planes = [];
  for (let i = 0; i < 3; i++) {
    const a = hash1(seed * 7.3 + i * 13.1) * TAU, b = (hash1(seed * 11.7 + i * 17.3) - 0.5) * 1.9;
    planes.push([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]);
  }
  const R = radius;
  const idx = (x, y, z) => (x + c) + n * ((y + c) + n * (z + c));
  for (let z = -R; z <= R; z++) for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.sqrt(x * x + y * y * 1.15 + z * z * 0.92) / R;
    const nz = fbm3(x * 0.055 + seed * 31.7, y * 0.055, z * 0.055, 4);
    if (d + (nz - 0.5) * 0.62 > 1.0) continue;
    let crack = false, nearCrack = false;
    for (let p = 0; p < 3; p++) {
      const pl = planes[p];
      const dist = x * pl[0] + y * pl[1] + z * pl[2] + (hash3(x * 1.3, y * 1.3, z * 1.3) - 0.5) * R * 0.22;
      if (Math.abs(dist) < 1.15) crack = true;
      if (Math.abs(dist) < 3.2) nearCrack = true;
    }
    if (crack && d > 0.4) continue;
    let id = 1;
    for (let p = 0; p < 3; p++) {
      const pl = planes[p];
      if (x * pl[0] + y * pl[1] + z * pl[2] > 0) id |= 1 << p;
    }
    let col = C.ROCK;
    const hh = hash3(x + seed, y, z);
    if (d > 0.86) col = hh < 0.5 ? C.ROCK : C.ROCK_LIGHT;
    else if (d < 0.6) col = hh < 0.35 ? C.ROCK_DARK : C.ROCK;
    else col = hh < 0.18 ? C.ROCK_WARM : C.ROCK;
    if (nearCrack) col = C.ROCK_CRACK;
    g.set(x, y, z, col);
    chunk[idx(x, y, z)] = id;
  }
  const frags = [];
  for (let id = 1; id < 8; id++) {
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9, cnt = 0, sx = 0, sy = 0, sz = 0;
    for (let z = -R; z <= R; z++) for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      if (chunk[idx(x, y, z)] !== id) continue;
      cnt++; sx += x; sy += y; sz += z;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    if (cnt < 6) continue;
    const cx = Math.round(sx / cnt), cy = Math.round(sy / cnt), cz = Math.round(sz / cnt);
    const w = mxx - mnx + 3, h = mxy - mny + 3, dd = mxz - mnz + 3;
    const fg = new VoxGrid(w, h, dd, mnx - 1, mny - 1, mnz - 1);
    for (let z = -R; z <= R; z++) for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      if (chunk[idx(x, y, z)] !== id) continue;
      fg.set(x, y, z, g.get(x, y, z));
    }
    frags.push({ model: new VoxModel(fg, 'frag' + id), offset: [cx, cy, cz], count: cnt });
  }
  return { model: new VoxModel(g, 'asteroid'), fragments: frags, radius };
}
