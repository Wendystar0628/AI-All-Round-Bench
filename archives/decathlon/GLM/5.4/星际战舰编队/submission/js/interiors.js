'use strict';
/* ==================================================================
   舰内空间：动力核心中庭 / 舰桥 / 全息舰队
   ================================================================== */

/* ---------------- 动力核心中庭 ---------------- */
function buildReactor() {
  const S = 270, H = S / 2 | 0;
  const g = new VoxGrid(S, S, S, -H, -H, -H);
  const R = 124;
  // 地板 / 顶板
  for (let y = -R; y <= -R + 8; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    if (x * x + z * z <= R * R) g.set(x, y, z, y > -R + 5 ? C.FLOOR : C.FLOOR_DARK);
  }
  for (let y = R - 8; y <= R; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    if (x * x + z * z <= R * R) g.set(x, y, z, C.WALL_DARK);
  }
  // 外壁
  for (let y = -R + 8; y <= R - 8; y++) {
    for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
      const q = x * x + z * z;
      if (q <= R * R && q >= (R - 8) * (R - 8)) {
        let c = C.WALL;
        if (((Math.atan2(z, x) * 57.29) | 0) % 15 === 0) c = C.GUNMETAL;
        g.set(x, y, z, c);
      }
    }
  }
  // 壁面竖向肋
  for (let a = 0; a < 24; a++) {
    const th = a / 24 * TAU, ca = Math.cos(th), sa = Math.sin(th);
    for (let y = -R + 10; y <= R - 10; y++) {
      for (let k = -3; k <= 3; k++) {
        const rr = R - 12;
        const x = Math.round(ca * rr + -sa * k * 1.2), z = Math.round(sa * rr + ca * k * 1.2);
        g.set(x, y, z, C.HULL_DARK);
      }
    }
  }
  // 壁面发光带
  for (let y = -R + 30; y < R - 20; y += 26) {
    for (let a = 0; a < 360; a += 2) {
      const th = a / 180 * Math.PI;
      const x = Math.round(Math.cos(th) * (R - 10)), z = Math.round(Math.sin(th) * (R - 10));
      g.set(x, y, z, C.GLOW_CYAN_D);
      g.set(x, y + 1, z, C.GLOW_CYAN);
    }
  }
  // 环形平台
  const levels = [-84, -42, 0, 42, 84];
  for (const ly of levels) {
    for (let y = ly - 3; y <= ly + 3; y++) {
      for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
        const q = Math.sqrt(x * x + z * z);
        if (q <= R - 6 && q >= 46) {
          let c = C.FLOOR;
          if (q < 54) c = C.GUNMETAL;
          else if ((x % 14 === 0) || (z % 14 === 0)) c = C.FLOOR_LIGHT;
          g.set(x, y, z, c);
        }
      }
    }
    // 平台边缘发光
    for (let a = 0; a < 360; a += 2) {
      const th = a / 180 * Math.PI;
      for (const rr of [46, R - 8]) {
        const x = Math.round(Math.cos(th) * rr), z = Math.round(Math.sin(th) * rr);
        g.set(x, ly + 4, z, C.GLOW_AMBER);
      }
    }
  }
  // 中央核心
  const CR = 30;
  for (let y = -R + 8; y <= R - 8; y++) {
    for (let z = -CR; z <= CR; z++) for (let x = -CR; x <= CR; x++) {
      const q = x * x + z * z;
      if (q > CR * CR) continue;
      let c = 0;
      const ang = Math.atan2(z, x);
      if (q >= (CR - 5) * (CR - 5)) {
        // 外构架
        const seg = Math.floor((ang + Math.PI) / (TAU / 8));
        const frac = ((ang + Math.PI) / (TAU / 8)) - seg;
        if (frac < 0.22 || (y % 22 < 3)) c = C.GUNMETAL;
        else if (q >= (CR - 3) * (CR - 3)) c = C.HULL_DARK;
        else c = C.GLOW_CYAN_D;
      } else if (q >= (CR - 9) * (CR - 9)) {
        c = (y % 11 < 5) ? C.GLOW_CYAN : C.GLOW_TEAL;
      } else if (q >= 12 * 12) {
        c = C.GLOW_CYAN_D;
      } else {
        c = C.GLOW_WHITE;
      }
      g.set(x, y, z, c);
    }
  }
  // 核心竖向导光
  for (let a = 0; a < 8; a++) {
    const th = a / 8 * TAU;
    for (let y = -R + 12; y <= R - 12; y++) {
      const x = Math.round(Math.cos(th) * (CR - 7)), z = Math.round(Math.sin(th) * (CR - 7));
      g.set(x, y, z, C.GLOW_WHITE);
    }
  }
  // 巨大支撑
  for (const ly of [-90, -30, 30, 90]) {
    for (let a = 0; a < 8; a++) {
      const th = a / 8 * TAU + 0.2;
      const ca = Math.cos(th), sa = Math.sin(th);
      for (let t = 0; t <= 1; t += 0.004) {
        const rr = CR - 4 + t * (R - 14 - CR);
        const x = Math.round(ca * rr), z = Math.round(sa * rr);
        const yy = Math.round(ly + Math.sin(t * Math.PI) * 6);
        for (let dz = -4; dz <= 4; dz++) for (let dy = -3; dy <= 3; dy++) {
          const xx = Math.round(ca * rr - sa * dz), zz = Math.round(sa * rr + ca * dz);
          g.set(xx, yy + dy, zz, Math.abs(dz) === 4 || Math.abs(dy) === 3 ? C.GUNMETAL : C.HULL_DARK);
        }
      }
    }
  }
  // 底部 / 顶部核心基座
  for (let y = -R + 8; y <= -R + 26; y++) for (let z = -46; z <= 46; z++) for (let x = -46; x <= 46; x++) {
    const q = x * x + z * z;
    if (q <= 46 * 46 && q >= (CR + 2) * (CR + 2)) g.set(x, y, z, y < -R + 16 ? C.GUNMETAL : C.HULL_DARK);
  }
  // 灯光
  for (let y = -100; y <= 100; y += 34) {
    g.addLight(0, y, 0, 0.35, 0.9, 1.25, 150);
  }
  g.addLight(0, -110, 0, 0.3, 0.8, 1.1, 120);
  g.addLight(0, 110, 0, 0.3, 0.8, 1.1, 120);
  for (const ly of levels) {
    g.addLight(0, ly + 10, 70, 1.0, 0.62, 0.3, 90);
  }
  const model = new VoxModel(g, 'reactor');
  // 旋转环（独立模型）
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const rr = 40 + i * 7, th = 5 + i * 2;
    const rg = new VoxGrid(2 * (rr + th) + 8, 2 * th + 8, 2 * (rr + th) + 8, -(rr + th + 4), -(th + 4), -(rr + th + 4));
    for (let y = -th; y <= th; y++) for (let z = -rr - th; z <= rr + th; z++) for (let x = -rr - th; x <= rr + th; x++) {
      const q = Math.sqrt(x * x + z * z);
      if (q < rr - th || q > rr + th) continue;
      const a = Math.atan2(z, x);
      const seg = Math.floor((a + Math.PI) / (TAU / 10));
      let c = C.GUNMETAL;
      if (q > rr + th - 3) c = C.GLOW_CYAN_D;
      if (seg % 3 === 0 && q < rr + th - 3) c = C.HULL_DARK;
      if (Math.abs(y) === th) c = C.STEEL;
      rg.set(x, y, z, c);
    }
    // 环上的构件
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU;
      const x = Math.round(Math.cos(a) * rr), z = Math.round(Math.sin(a) * rr);
      rg.fill(x - 6, -th - 5, z - 6, x + 6, -th - 1, z + 6, C.GUNMETAL);
      rg.fill(x - 3, -th - 8, z - 3, x + 3, -th - 5, z + 3, C.GLOW_CYAN);
      rg.fill(x - 6, th + 1, z - 6, x + 6, th + 5, z + 6, C.GUNMETAL);
    }
    rings.push({ model: new VoxModel(rg, 'ring' + i), y: -60 + i * 60, speed: (i % 2 ? -1 : 1) * (0.12 + i * 0.05) });
  }
  return { model, rings, levels };
}

/* ---------------- 舰桥 ---------------- */
function buildBridge() {
  const g = new VoxGrid(150, 84, 150, 0, 0, -75);
  const X0 = 0, X1 = 130, Y0 = 0, Y1 = 60, Z = 65;
  // 地板
  g.fill(X0, Y0 - 8, -Z, X1, Y0, Z, C.FLOOR_DARK);
  g.fill(X0, Y0, -Z, X1, Y0 + 1, Z, C.FLOOR);
  // 地板发光网格
  for (let x = 6; x < X1 - 4; x += 16) g.fill(x, Y0 + 1, -Z + 4, x + 6, Y0 + 2, Z - 4, C.GLOW_CYAN_D);
  for (let z = -Z + 10; z < Z - 6; z += 16) g.fill(X0 + 4, Y0 + 1, z, X1 - 4, Y0 + 2, z + 6, C.GLOW_CYAN_D);
  // 顶板
  g.fill(X0, Y1, -Z, X1, Y1 + 8, Z, C.WALL_DARK);
  g.fill(X0, Y1 - 1, -Z, X1, Y1, Z, C.WALL);
  // 顶板梁
  for (let x = 10; x < X1; x += 30) {
    g.fill(x, Y1 - 8, -Z, x + 6, Y1, Z, C.GUNMETAL);
    g.fill(x + 1, Y1 - 10, -Z + 6, x + 5, Y1 - 8, Z - 6, C.HULL_MID);
  }
  // 侧壁
  for (const side of [-1, 1]) {
    g.fill(X0, Y0, side * Z, X1, Y1, side * (Z + 8), C.WALL);
    // 侧壁发光带
    for (let y = 12; y < Y1 - 8; y += 14) {
      g.fill(X0 + 6, y, side * (Z - 1), X1 - 6, y + 2, side * Z, C.GLOW_CYAN_D);
    }
    // 侧层平台
    g.fill(X0 + 10, 18, side * (Z - 22), X1 - 20, 22, side * (Z - 2), C.FLOOR);
    g.fill(X0 + 10, 22, side * (Z - 22), X1 - 20, 23, side * (Z - 20), C.GLOW_AMBER);
    // 平台支撑
    for (let x = X0 + 16; x < X1 - 24; x += 28) {
      g.fill(x, 22, side * (Z - 20), x + 5, 34, side * (Z - 16), C.GUNMETAL);
    }
    // 侧层控制台
    for (let x = X0 + 18; x < X1 - 26; x += 24) {
      g.fill(x, 23, side * (Z - 18), x + 16, 27, side * (Z - 6), C.CONSOLE);
      g.fill(x + 1, 27, side * (Z - 17), x + 15, 28, side * (Z - 7), C.SCREEN_CYAN);
      g.fill(x + 2, 28, side * (Z - 15), x + 8, 30, side * (Z - 9), C.GLASS_CYAN);
    }
  }
  // 后壁
  g.fill(X0 - 8, Y0 - 8, -Z, X0, Y1 + 8, Z, C.WALL);
  g.fill(X0, 20, -30, X0 + 1, 44, 30, C.GLOW_AMBER);
  // 前壁 + 观景开口
  g.fill(X1, Y0 - 8, -Z, X1 + 8, Y1 + 8, Z, C.WALL);
  g.carve(X1 - 1, 10, -56, X1 + 9, 50, 56);
  // 窗框
  for (let z = -56; z <= 56; z += 16) g.fill(X1 - 2, 8, z - 2, X1 + 6, 52, z + 2, C.STEEL);
  g.fill(X1 - 2, 8, -60, X1 + 6, 12, 60, C.STEEL);
  g.fill(X1 - 2, 48, -60, X1 + 6, 52, 60, C.STEEL);
  g.fill(X1 - 2, 10, -60, X1 + 1, 50, -56, C.GLASS);
  g.fill(X1 - 2, 10, 56, X1 + 1, 50, 60, C.GLASS);
  // 中央指挥中枢：层叠基座
  const CX = 62, CZ = 0;
  for (let y = 2; y <= 10; y++) for (let z = -30; z <= 30; z++) for (let x = -30; x <= 30; x++) {
    const q = x * x + z * z;
    const rr = y < 6 ? 30 : y < 9 ? 26 : 20;
    if (q <= rr * rr) g.set(CX + x, y, CZ + z, y === 10 ? C.GLOW_CYAN_D : (y < 5 ? C.GUNMETAL : C.HULL_DARK));
  }
  // 基座发光环
  for (let a = 0; a < 360; a += 3) {
    const th = a / 180 * Math.PI;
    for (const rr of [20, 26, 30]) {
      g.set(CX + Math.round(Math.cos(th) * rr), 10, CZ + Math.round(Math.sin(th) * rr), C.GLOW_CYAN);
    }
  }
  // 悬置显示结构（环形）
  for (let a = 0; a < 360; a += 2) {
    const th = a / 180 * Math.PI;
    const x = CX + Math.round(Math.cos(th) * 26), z = CZ + Math.round(Math.sin(th) * 26);
    g.fill(x, 24, z, x, 26, z, C.GUNMETAL);
    g.fill(x, 27, z, x, 28, z, C.GLOW_CYAN);
  }
  // 悬浮显示板
  for (let i = 0; i < 6; i++) {
    const th = i / 6 * TAU + 0.3;
    const x = CX + Math.round(Math.cos(th) * 20), z = CZ + Math.round(Math.sin(th) * 20);
    g.fill(x - 7, 30, z - 1, x + 7, 42, z + 1, C.GLASS_CYAN);
    g.fill(x - 8, 29, z - 2, x + 8, 30, z + 2, C.GUNMETAL);
  }
  // 控制台群（沿两侧地面）
  for (const side of [-1, 1]) {
    for (let x = 16; x < 110; x += 22) {
      if (Math.abs(x - CX) < 34) continue;
      const z = side * 34;
      g.fill(x, 2, z - 8, x + 16, 8, z + 8, C.CONSOLE);
      g.fill(x + 1, 8, z - 7, x + 15, 9, z + 7, C.SCREEN_CYAN);
      g.fill(x + 2, 9, z - 5, x + 8, 12, z - 1, C.GLASS_CYAN);
      g.fill(x + 2, 9, z + 1, x + 8, 12, z + 5, C.SCREEN_AMBER);
    }
    // 后排抬高的控制台
    for (let x = 24; x < 108; x += 26) {
      const z = side * 48;
      g.fill(x, 2, z - 7, x + 18, 10, z + 7, C.CONSOLE);
      g.fill(x + 1, 10, z - 6, x + 17, 11, z + 6, C.SCREEN_AMBER);
      g.fill(x + 2, 11, z - 4, x + 7, 14, z + 4, C.GLASS_CYAN);
    }
  }
  // 悬置投影层（舰桥上方的环带）
  for (let a = 0; a < 360; a += 4) {
    const th = a / 180 * Math.PI;
    const x = CX + Math.round(Math.cos(th) * 40), z = CZ + Math.round(Math.sin(th) * 40);
    g.fill(x, 44, z, x, 45, z, C.GLOW_CYAN_D);
  }
  // 灯光
  g.addLight(CX, 34, CZ, 0.45, 0.85, 1.15, 80);
  g.addLight(CX, 16, CZ, 0.5, 0.9, 1.2, 60);
  g.addLight(X1 - 10, 30, 0, 1.0, 0.72, 0.42, 90);
  g.addLight(30, 30, -40, 1.0, 0.65, 0.35, 70);
  g.addLight(30, 30, 40, 1.0, 0.65, 0.35, 70);
  g.addLight(100, 30, -40, 1.0, 0.65, 0.35, 70);
  g.addLight(100, 30, 40, 1.0, 0.65, 0.35, 70);
  return { model: new VoxModel(g, 'bridge'), center: [65, 30, 0], windowX: X1 };
}

/* ---------------- 全息舰队中的小舰 ---------------- */
function buildHoloShip() {
  const g = new VoxGrid(26, 12, 20, 0, 0, -10);
  g.fill(0, 3, -3, 18, 7, 3, C.GLOW_CYAN);
  g.fill(18, 4, -2, 24, 6, 2, C.GLOW_WHITE);
  g.fill(2, 7, -6, 12, 8, 6, C.GLOW_CYAN_D);
  g.fill(2, 2, -5, 10, 3, 5, C.GLOW_CYAN_D);
  return { model: new VoxModel(g, 'holoship'), center: [12, 5, 0] };
}
