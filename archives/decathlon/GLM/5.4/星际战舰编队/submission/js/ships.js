'use strict';
/* ==================================================================
   舰船 / 武器 / 陨石 体素模型
   统一体素尺寸 = 1 格。旗舰长约 1120 格，护卫 200~230 格，小艇 30 格。
   ================================================================== */

/* ---------------- 小工具 ---------------- */
function solidX(g, x, hw, yb, yt, ch, c) {
  for (let y = yb; y <= yt; y++) {
    let zw = hw;
    if (y < yb + ch) zw = hw - (yb + ch - y);
    else if (y > yt - ch) zw = hw - (y - yt + ch);
    if (zw > 0) g.fill(x, y, -zw, x, y, zw, c);
  }
}
// 沿 X 的环形截面，中心在 z=cz
function ringXAt(g, x, cz, hw, yb, yt, ch, t, c) {
  for (let y = yb; y <= yt; y++) {
    let zw = hw;
    if (y < yb + ch) zw = hw - (yb + ch - y);
    else if (y > yt - ch) zw = hw - (y - yt + ch);
    if (zw <= 0) continue;
    const inner = (y >= yb + t && y <= yt - t);
    if (!inner) { g.fill(x, y, cz - zw, x, y, cz + zw, c); continue; }
    const zi = zw - t;
    if (zi > 0) { g.fill(x, y, cz - zw, x, y, cz - zi, c); g.fill(x, y, cz + zi, x, y, cz + zw, c); }
    else g.fill(x, y, cz - zw, x, y, cz + zw, c);
  }
}
// 阶梯板：在 x0..x1 区间沿 hull 表面贴一层厚度 h 的板
function plateSide(g, x0, x1, y0, y1, side, h, c, hwFn) {
  for (let x = x0; x <= x1; x++) {
    const hw = hwFn(x);
    const z0 = side > 0 ? hw : -hw - h;
    g.fill(x, y0, z0, x, y1, z0 + h, c);
  }
}
function plateTop(g, x0, x1, z0, z1, h, c, ytFn) {
  for (let x = x0; x <= x1; x++) {
    const yt = ytFn(x);
    g.fill(x, yt - 1, z0, x, yt + h - 1, z1, c);
  }
}
function plateBottom(g, x0, x1, z0, z1, h, c, ybFn) {
  for (let x = x0; x <= x1; x++) {
    const yb = ybFn(x);
    g.fill(x, yb - h + 1, z0, x, yb, z1, c);
  }
}
// 喷口：在 x 处向 -X 方向凹陷的腔体
function nozzle(g, x, y, z, w, h, depth, glowCol, rimCol) {
  g.carve(x, y - h / 2, z - w / 2, x + depth, y + h / 2, z + w / 2);
  // 阶梯口沿
  g.frameBox(x, y - h / 2 - 5, z - w / 2 - 5, x + 3, y + h / 2 + 5, z + w / 2 + 5, 5, rimCol);
  g.frameBox(x + 3, y - h / 2 - 9, z - w / 2 - 9, x + 5, y + h / 2 + 9, z + w / 2 + 9, 4, rimCol);
  // 内腔壁
  g.fill(x + 3, y - h / 2, z - w / 2, x + depth, y + h / 2, z - w / 2 + 2, C.HULL_DEEP);
  g.fill(x + 3, y - h / 2, z + w / 2 - 2, x + depth, y + h / 2, z + w / 2, C.HULL_DEEP);
  g.fill(x + 3, y - h / 2, z - w / 2, x + depth, y - h / 2 + 2, z + w / 2, C.HULL_DEEP);
  g.fill(x + 3, y + h / 2 - 2, z - w / 2, x + depth, y + h / 2, z + w / 2, C.HULL_DEEP);
  // 发光内环 + 亮芯
  const gw = w * 0.62, gh = h * 0.62;
  g.fill(x + depth - 2, y - gh / 2, z - gw / 2, x + depth, y + gh / 2, z + gw / 2, glowCol);
  g.fill(x + depth - 3, y - gh * 0.28, z - gw * 0.28, x + depth - 1, y + gh * 0.28, z + gw * 0.28, C.GLOW_WHITE);
}

/* ==================================================================
   旗舰
   ================================================================== */
const DBG = { citadel: 1, panels: 1, sponson: 1, prongs: 1, hangar: 1, engine: 1, top: 1, side: 1, bottom: 1 };
(function(){ const h = location.hash.replace('#',''); if (!h) return; for (const kv of h.split(',')) { const [k,v] = kv.split('='); if (k in DBG) DBG[k] = +v; } })();

function buildFlagship() {
  const g = new VoxGrid(1120, 280, 400, 0, 0, -200);
  const SEC = [
    [0, 90, 50, 146], [60, 102, 42, 152], [140, 118, 36, 156], [240, 134, 31, 160],
    [340, 146, 28, 164], [440, 150, 27, 166], [540, 147, 29, 164], [640, 136, 35, 158],
    [730, 118, 43, 150], [820, 100, 53, 140], [900, 84, 63, 130],
  ];
  function secAt(x) {
    if (x <= SEC[0][0]) return SEC[0];
    for (let i = 1; i < SEC.length; i++) {
      if (x <= SEC[i][0]) {
        const a = SEC[i - 1], b = SEC[i], t = (x - a[0]) / (b[0] - a[0]);
        return [x, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      }
    }
    return SEC[SEC.length - 1];
  }
  const HW = x => secAt(x)[1], YB = x => secAt(x)[2], YT = x => secAt(x)[3];
  const CH = 18, TH = 10;

  /* ---------- 主壳体 ---------- */
  for (let x = 0; x <= 900; x++) {
    const s = secAt(x);
    g.ringX(x, s[1], s[2], s[3], CH, TH, C.HULL_DARK);
  }
  // 尾部封口
  for (let x = 0; x <= 14; x++) solidX(g, x, HW(x), YB(x), YT(x), CH, x < 8 ? C.HULL_DEEP : C.DARK_METAL);
  // 艏部封口
  for (let x = 890; x <= 900; x++) solidX(g, x, HW(x), YB(x), YT(x), CH, C.HULL_DEEP);

  /* ---------- 尾部喷口 ---------- */
  const noz = [[-58, 78], [0, 78], [58, 78], [-58, 120], [0, 120], [58, 120]];
  for (const [z, y] of noz) nozzle(g, 0, y, z, 44, 38, 26, C.GLOW_AMBER, C.HULL_MID);
  // 两侧小喷口
  for (const [z, y] of [[-88, 100], [88, 100]]) nozzle(g, 0, y, z, 22, 20, 18, C.GLOW_EMBER, C.GUNMETAL);

  /* ---------- 舰首分叉 ---------- */
  for (let x = 900; x <= 1090; x++) {
    const t = (x - 900) / 190;
    const hw = lerp(27, 9, t * t);
    const yb = lerp(20, 58, t);
    const yt = lerp(108, 88, t);
    ringXAt(g, x, 57, hw, yb, yt, 10, 6, C.HULL_DARK);
    ringXAt(g, x, -57, hw, yb, yt, 10, 6, C.HULL_DARK);
  }
  // 分叉舰首上层阶面
  for (let x = 900; x <= 1060; x += 40) {
    const t = (x - 900) / 190;
    const hw = lerp(27, 9, t * t) + 2;
    const yt = lerp(108, 88, t);
    g.fill(x, yt, 30, x + 34, yt + 3, 84, C.HULL_MID);
    g.fill(x, yt, -84, x + 34, yt + 3, -30, C.HULL_MID);
  }
  // 中央沟槽底板
  for (let x = 900; x <= 1090; x++) {
    g.fill(x, 18, -30, x, 24, 30, C.HULL_DEEP);
    if (x % 30 < 12) g.fill(x, 24, -4, x, 25, 4, C.GLOW_EMBER);
  }

  /* ---------- 光束主炮 ---------- */
  // 基部（舰体内）
  for (let x = 770; x <= 900; x++) {
    const t = (x - 770) / 130;
    const hw = lerp(52, 40, t);
    const yb = lerp(18, 26, t), yt = lerp(146, 132, t);
    solidX(g, x, hw, yb, yt, 12, C.GUNMETAL);
  }
  // 基部外壳阶面
  g.fill(760, 10, -60, 800, 150, 60, C.HULL_DARK);
  g.fill(770, 16, -54, 796, 144, 54, C.GUNMETAL);
  g.fill(780, 22, -48, 790, 138, 48, C.HULL_MID);
  // 充能槽
  for (let x = 800; x <= 890; x += 22) {
    g.fill(x, 40, -44, x + 10, 130, -38, C.GLOW_EMBER);
    g.fill(x, 40, 38, x + 10, 130, 44, C.GLOW_EMBER);
    g.fill(x, 26, -30, x + 10, 32, 30, C.GLOW_EMBER);
  }
  // 炮身
  g.fill(900, 62, -20, 1090, 108, 20, C.GUNMETAL);
  g.fill(900, 66, -24, 1080, 104, -20, C.HULL_DARK);
  g.fill(900, 66, 20, 1080, 104, 24, C.HULL_DARK);
  for (let x = 910; x < 1080; x += 18) {
    g.fill(x, 68, -27, x + 8, 102, -24, C.GLOW_AMBER);
    g.fill(x, 68, 24, x + 8, 102, 27, C.GLOW_AMBER);
    g.fill(x, 104, -16, x + 8, 107, 16, C.GLOW_EMBER);
  }
  // 炮身环箍
  for (let x = 930; x <= 1070; x += 35) {
    g.fill(x, 58, -27, x + 5, 112, 27, C.STEEL);
  }
  // 炮口
  g.fill(1085, 50, -30, 1118, 116, 30, C.GUNMETAL);
  g.fill(1085, 46, -34, 1092, 120, 34, C.HULL_DARK);
  g.fill(1092, 52, -28, 1112, 114, 28, C.HULL_MID);
  g.fill(1112, 60, -20, 1120, 106, 20, C.STEEL);
  // 发射口发光
  g.fill(1116, 68, -15, 1120, 98, 15, C.GLOW_AMBER);
  g.fill(1118, 74, -9, 1121, 92, 9, C.GLOW_WHITE);
  g.fill(1090, 56, -26, 1112, 60, 26, C.GLOW_EMBER);

  /* ---------- 背部上层结构 ---------- */
  if (DBG.citadel) {
  const tiers = [
    [200, 600, 95, 160, 190, C.HULL_DARK],
    [260, 540, 75, 190, 214, C.HULL],
    [320, 480, 55, 214, 236, C.HULL_MID],
    [360, 440, 34, 236, 250, C.HULL_DARK],
  ];
  for (const [x0, x1, hw, y0, y1, col] of tiers) {
    g.fill(x0, y0, -hw, x1, y0 + 4, hw, col);
    g.fill(x0, y1 - 4, -hw, x1, y1, hw, C.HULL_MID);
    g.shellBox(x0, y0, -hw, x1, y1, hw, 5, col);
    // 层间深槽
    g.fill(x0 + 10, y0 - 2, -hw + 6, x1 - 10, y0, hw - 6, C.HULL_DEEP);
  }
  // 上层结构侧面板
  for (let x = 220; x < 590; x += 46) {
    plateSide(g, x, x + 38, 166, 186, 1, 2, C.HULL_LIGHT, () => 95);
    plateSide(g, x, x + 38, 166, 186, -1, 2, C.HULL_LIGHT, () => 95);
  }
  // 顶部甲板板
  for (let x = 210; x < 590; x += 50) {
    for (let z = -85; z < 85; z += 42) {
      plateTop(g, x, x + 42, z, z + 34, 2, C.HULL_MID, () => 190);
      plateTop(g, x, x + 42, z, z + 34, 2, C.HULL_MID, () => 214);
    }
  }
  // 桅杆 / 传感器
  g.fill(390, 250, -8, 402, 262, 8, C.STEEL);
  g.fill(394, 262, -3, 398, 274, 3, C.GUNMETAL);
  g.fill(395, 274, -2, 397, 276, 2, C.GLOW_CYAN);
  g.fill(330, 236, -4, 334, 252, 4, C.GUNMETAL);
  g.fill(450, 236, -4, 454, 250, 4, C.GUNMETAL);
  // 舰桥舱室外壳（内部由独立模型提供，窗口贯通）
  g.shellBox(594, 111, -76, 746, 193, 76, 6, C.HULL_DARK);
  g.carve(732, 128, -56, 748, 182, 56);
  // 窗框
  for (let z = -54; z <= 54; z += 18) g.fill(744, 124, z - 2, 750, 186, z + 2, C.STEEL);
  g.fill(744, 124, -60, 750, 129, 60, C.STEEL);
  g.fill(744, 181, -60, 750, 186, 60, C.STEEL);
  // 舰桥顶部
  g.fill(600, 193, -60, 740, 199, 60, C.HULL_MID);
  g.fill(650, 199, -30, 700, 203, 30, C.HULL_DARK);
  g.fill(668, 203, -4, 682, 217, 4, C.GUNMETAL);

  }
  /* ---------- 侧部延伸（sponson） ---------- */
  if (DBG.sponson) {
  const sponExt = (x) => {
    const t = clamp((x - 250) / 410, 0, 1);
    return 12 + 36 * Math.sin(Math.PI * t);
  };
  for (const side of [-1, 1]) {
    for (let x = 250; x <= 660; x++) {
      const e = sponExt(x), h = HW(x);
      const zi = side > 0 ? h - 6 : -h - e + 6;
      const zo = side > 0 ? h + e : -h + 6;
      const z0 = Math.min(zi, zo), z1 = Math.max(zi, zo);
      g.fill(x, 66, z0, x, 142, z1, C.HULL);
      g.fill(x, 142, z0, x, 145, z1, C.HULL_MID);
      g.fill(x, 62, z0, x, 66, z1, C.HULL_DARK);
      // 前后缘斜切
      if (x < 300) { const k = (300 - x) / 50; g.carve(x, 66 + k * 30, z0, x, 142, z1); }
      if (x > 620) { const k = (x - 620) / 40; g.carve(x, 66 + k * 30, z0, x, 142, z1); }
    }
    // 外缘阶面与发光缝
    for (let x = 292; x <= 616; x += 46) {
      const e = sponExt(x), h = HW(x);
      const zo = side > 0 ? h + e : -h - e;
      g.fill(x, 74, Math.min(zo, zo - side * 3), x + 36, 78, Math.max(zo, zo - side * 3), C.HULL_MID);
      g.fill(x, 100, Math.min(zo, zo - side * 3), x + 36, 104, Math.max(zo, zo - side * 3), C.GLOW_AMBER);
      g.fill(x, 126, Math.min(zo, zo - side * 3), x + 36, 130, Math.max(zo, zo - side * 3), C.HULL_MID);
    }
    // 侧部面板
    for (let x = 300; x <= 600; x += 60) {
      const e = sponExt(x), h = HW(x);
      plateSide(g, x, x + 46, 72, 100, side, 2, C.HULL_MID, (xx) => HW(xx) + sponExt(xx) - 1);
      plateSide(g, x, x + 46, 108, 138, side, 2, C.HULL, (xx) => HW(xx) + sponExt(xx) - 1);
    }
  }

  }
  /* ---------- 腹部龙骨与肋架 ---------- */
  if (DBG.bottom) {
  for (let x = 180; x <= 760; x++) {
    const yb = YB(x);
    g.fill(x, yb - 16, -34, x, yb, 34, C.HULL_DEEP);
  }
  for (let x = 210; x <= 740; x += 44) {
    const yb = YB(x);
    // 横向肋
    g.fill(x, yb - 26, -70, x + 9, yb - 14, 70, C.GUNMETAL);
    g.fill(x, yb - 26, -70, x + 9, yb - 22, -60, C.HULL_MID);
    g.fill(x, yb - 26, 60, x + 9, yb - 22, 70, C.HULL_MID);
    // 纵向梁
    g.fill(x, yb - 22, -8, x + 9, yb - 16, 8, C.HULL_DARK);
  }
  // 腹部凹槽发光
  for (let x = 240; x <= 720; x += 88) {
    const yb = YB(x);
    g.fill(x, yb - 14, -22, x + 30, yb - 12, 22, C.GLOW_CYAN_D);
  }

  }
  /* ---------- 船体面板 ---------- */
  if (DBG.panels) {
  for (const side of [-1, 1]) {
    for (let x = 110; x < 860; x += 76) {
      for (let y = 46; y < 140; y += 34) {
        const x1 = Math.min(x + 66, 858), y1 = Math.min(y + 26, 142);
        // 避开机库口
        if (side > 0 && x1 > 290 && x < 470 && y1 > 50 && y < 140) continue;
        let ok = true;
        for (let xx = x; xx <= x1; xx++) { if (y < YB(xx) + CH + 4 || y1 > YT(xx) - CH - 4) { ok = false; break; } }
        if (!ok) continue;
        plateSide(g, x, x1, y, y1, side, 2, ((x / 76 + y / 34) | 0) % 2 ? C.HULL : C.HULL_MID, HW);
      }
    }
  }
  // 顶部板
  for (let x = 100; x < 870; x += 76) {
    for (let z = -100; z < 100; z += 44) {
      const x1 = Math.min(x + 66, 868);
      if (x < 620 && x1 > 190 && Math.abs(z) < 100) continue; // 上层结构区域
      let ok = true;
      for (let xx = x; xx <= x1; xx++) { if (Math.abs(z) + 44 > HW(xx) - CH - 6) { ok = false; break; } }
      if (!ok) continue;
      plateTop(g, x, x1, z, z + 36, 2, ((x / 76 + z / 44) | 0) % 2 ? C.HULL_MID : C.HULL, YT);
    }
  }
  // 底部板
  for (let x = 160; x < 800; x += 76) {
    for (let z = -70; z < 70; z += 44) {
      let ok = true;
      for (let xx = x; xx <= Math.min(x + 66, 798); xx++) { if (Math.abs(z) + 44 > HW(xx) - CH - 8) { ok = false; break; } }
      if (!ok) continue;
      plateBottom(g, x, Math.min(x + 66, 798), z, z + 36, 2, C.HULL_DARK, YB);
    }
  }

  }
  /* ---------- 机库 ---------- */
  if (DBG.hangar) {
  buildHangar(g);

  }
  /* ---------- 导能长廊 ---------- */
  if (DBG.hangar) {
  buildCorridor(g);

  }
  /* ---------- 灯光（烘焙） ---------- */
  // 机库
  for (let x = 280; x <= 590; x += 55) {
    g.addLight(x, 112, 45, 4.4, 3.3, 1.9, 155);
    g.addLight(x, 112, 110, 4.4, 3.3, 1.9, 155);
    g.addLight(x, 62, 76, 2.2, 1.6, 0.95, 105);
  }
  // 长廊
  for (let x = 630; x <= 870; x += 45) {
    g.addLight(x, 106, 0, 3.2, 4.4, 5.4, 115);
    g.addLight(x, 58, 0, 5.2, 3.1, 1.5, 95);
  }
  g.addLight(884, 84, 0, 3.2, 4.6, 5.8, 175);
  // 舰桥
  g.addLight(660, 158, 0, 1.6, 2.8, 3.8, 130);
  g.addLight(728, 150, 0, 3.0, 2.3, 1.4, 110);

  return new VoxModel(g, 'flagship');
}

/* ---------------- 机库内部 ---------------- */
function buildHangar(g) {
  const X0 = 250, X1 = 600, Y0 = 50, Y1 = 140, Z0 = 20, Z1 = 135;
  // 地板
  g.fill(X0, Y0 - 6, Z0, X1, Y0, Z1, C.HANGAR_FLOOR);
  g.fill(X0, Y0, Z0, X1, Y0 + 1, Z1, C.FLOOR);
  // 地板导引光
  for (let x = X0 + 10; x < X1 - 10; x += 26) {
    g.fill(x, Y0 + 1, 70, x + 12, Y0 + 2, 76, C.GLOW_CYAN_D);
    g.fill(x, Y0 + 1, 78, x + 12, Y0 + 2, 84, C.GLOW_AMBER);
  }
  for (let z = Z0 + 8; z < Z1 - 8; z += 22) {
    g.fill(X0 + 8, Y0 + 1, z, X0 + 20, Y0 + 2, z + 10, C.GLOW_CYAN_D);
  }
  // 天花板
  g.fill(X0, Y1, Z0, X1, Y1 + 6, Z1, C.HANGAR_WALL);
  // 天花板梁
  for (let x = X0 + 20; x < X1 - 10; x += 46) {
    g.fill(x, Y1 - 10, Z0, x + 8, Y1, Z1, C.GUNMETAL);
    g.fill(x, Y1 - 10, Z0 + 10, x + 8, Y1 - 8, Z1 - 10, C.HULL_MID);
  }
  // 纵向梁
  g.fill(X0, Y1 - 8, 40, X1, Y1 - 4, 46, C.GUNMETAL);
  g.fill(X0, Y1 - 8, 110, X1, Y1 - 4, 116, C.GUNMETAL);
  // 顶灯
  for (let x = X0 + 30; x < X1 - 20; x += 40) {
    g.fill(x, Y1 - 5, 66, x + 20, Y1 - 3, 74, C.GLOW_GOLD);
    g.fill(x, Y1 - 5, 82, x + 20, Y1 - 3, 90, C.GLOW_GOLD);
  }
  // 后壁（第二重舱口）
  g.fill(X0 - 8, Y0 - 6, Z0, X0, Y1 + 6, Z1, C.HANGAR_WALL);
  g.carve(X0 - 10, Y0 + 12, 52, X0 + 1, Y1 - 16, 104);
  g.fill(X0 - 12, Y0 + 12, 50, X0 - 9, Y1 - 16, 106, C.SHADOW);
  g.fill(X0 - 13, Y0 + 18, 58, X0 - 11, Y1 - 22, 98, C.GLOW_CYAN_D);
  // 后壁框架
  g.frameBox(X0 - 12, Y0 + 8, 46, X0 - 2, Y1 - 12, 110, 6, C.HULL_MID);
  // 前壁（通往长廊）
  g.fill(X1, Y0 - 6, Z0, X1 + 8, Y1 + 6, Z1, C.HANGAR_WALL);
  g.carve(X1 - 2, Y0, 20, X1 + 10, 116, 134);
  g.frameBox(X1 - 4, Y0 - 4, 16, X1 + 6, 120, 138, 8, C.HULL_MID);
  // 左壁（厚壁，内含停泊凹位）
  g.fill(X0, Y0 - 8, Z0 - 40, X1, Y1 + 8, Z0, C.HANGAR_WALL);
  // 右侧（船壳内壁）
  g.fill(X0, Y0, Z1, X1, Y1, Z1 + 10, C.HANGAR_WALL);
  // 停泊凹位（左壁，深凹）
  for (let x = X0 + 24; x < X1 - 50; x += 72) {
    g.carve(x, Y0 + 4, Z0 - 34, x + 52, Y0 + 62, Z0 + 2);
    g.fill(x, Y0 + 62, Z0 - 34, x + 52, Y0 + 66, Z0, C.HULL_MID);
    g.fill(x, Y0, Z0 - 34, x + 52, Y0 + 4, Z0, C.GUNMETAL);
    g.fill(x, Y0 + 4, Z0 - 38, x + 52, Y0 + 62, Z0 - 34, C.HULL_DARK);
    g.fill(x + 6, Y0 + 58, Z0 - 30, x + 46, Y0 + 60, Z0 - 26, C.GLOW_GOLD);
    g.fill(x + 6, Y0 + 6, Z0 - 30, x + 46, Y0 + 8, Z0 - 26, C.GLOW_CYAN_D);
    g.fill(x + 4, Y0 + 30, Z0 - 33, x + 8, Y0 + 40, Z0 - 31, C.GLOW_AMBER);
    g.frameBox(x - 4, Y0, Z0 - 6, x + 56, Y0 + 66, Z0, 4, C.GUNMETAL);
  }
  // 右壁浅凹位
  for (let x = X0 + 50; x < X1 - 40; x += 84) {
    g.carve(x, Y0 + 8, Z1 - 8, x + 46, Y0 + 56, Z1 + 2);
    g.fill(x, Y0 + 56, Z1 - 8, x + 46, Y0 + 60, Z1, C.HULL_MID);
    g.fill(x, Y0 + 8, Z1 - 8, x + 46, Y0 + 12, Z1, C.GUNMETAL);
    g.fill(x + 4, Y0 + 14, Z1 - 6, x + 42, Y0 + 16, Z1 - 4, C.GLOW_GOLD);
  }
  // 跨舱桥架
  for (const bx of [330, 410, 490, 560]) {
    g.fill(bx, Y1 - 26, Z0, bx + 10, Y1 - 12, Z1, C.GUNMETAL);
    g.fill(bx, Y1 - 26, Z0, bx + 10, Y1 - 23, Z1, C.HULL_MID);
    g.fill(bx + 2, Y1 - 30, Z0 + 6, bx + 8, Y1 - 26, Z0 + 40, C.STEEL);
    g.fill(bx + 2, Y1 - 30, Z1 - 40, bx + 8, Y1 - 26, Z1 - 6, C.STEEL);
    // 桥架上的灯
    g.fill(bx + 3, Y1 - 27, Z0 + 8, bx + 7, Y1 - 26, Z0 + 38, C.GLOW_GOLD);
    g.fill(bx + 3, Y1 - 27, Z1 - 38, bx + 7, Y1 - 26, Z1 - 8, C.GLOW_GOLD);
  }
  // 维修构架（抽象）
  for (const bx of [300, 380, 460, 540]) {
    g.fill(bx, Y0 + 2, Z0 + 2, bx + 6, Y0 + 70, Z0 + 8, C.GUNMETAL);
    g.fill(bx, Y0 + 62, Z0 + 2, bx + 22, Y0 + 68, Z0 + 8, C.GUNMETAL);
    g.fill(bx + 16, Y0 + 50, Z0 + 3, bx + 22, Y0 + 62, Z0 + 7, C.GLOW_CYAN_D);
  }
  // 机库口（贯穿船壳与侧部延伸，形成内退的 throat）
  g.carve(300, 56, 128, 470, 136, 210);
  // 口沿结构（位于延伸部外缘）
  g.frameBox(292, 48, 178, 310, 144, 196, 9, C.HULL_MID);
  g.frameBox(452, 48, 178, 474, 144, 196, 9, C.HULL_MID);
  g.fill(300, 136, 178, 470, 144, 196, C.HULL_MID);
  g.fill(300, 48, 178, 470, 56, 196, C.HULL_MID);
  // 内退 throat 的上下导轨
  g.fill(300, 136, 150, 470, 140, 178, C.GUNMETAL);
  g.fill(300, 52, 150, 470, 56, 178, C.GUNMETAL);
  // 口沿发光
  g.fill(304, 57, 192, 466, 59, 196, C.GLOW_AMBER);
  g.fill(304, 134, 192, 466, 136, 196, C.GLOW_AMBER);
  for (let x = 306; x < 466; x += 32) g.fill(x, 57, 194, x + 16, 59, 196, C.GLOW_GOLD);
  // throat 内壁灯
  for (let x = 310; x < 460; x += 30) {
    g.fill(x, 134, 152, x + 14, 136, 176, C.GLOW_GOLD);
  }
}

/* ---------------- 导能长廊 ---------------- */
function buildCorridor(g) {
  const X0 = 600, X1 = 880, Y0 = 50, Y1 = 116, Z = 42;
  // 地板 / 顶板 / 侧壁
  g.fill(X0, Y0 - 8, -Z - 8, X1, Y0, Z + 8, C.FLOOR_DARK);
  g.fill(X0, Y0, -Z, X1, Y0 + 2, Z, C.FLOOR);
  g.fill(X0, Y1, -Z - 8, X1, Y1 + 8, Z + 8, C.WALL_DARK);
  g.fill(X0, Y1 - 2, -Z, X1, Y1, Z, C.WALL);
  g.fill(X0, Y0, -Z - 8, X1, Y1, -Z, C.WALL_DARK);
  g.fill(X0, Y0, Z, X1, Y1, Z + 8, C.WALL_DARK);
  // 地板导引光
  for (let x = X0 + 10; x < X1; x += 30) {
    g.fill(x, Y0 + 2, -6, x + 14, Y0 + 3, -3, C.GLOW_CYAN);
    g.fill(x, Y0 + 2, 3, x + 14, Y0 + 3, 6, C.GLOW_CYAN);
  }
  // 侧壁发光缝
  for (let x = X0 + 12; x < X1 - 10; x += 24) {
    g.fill(x, Y0 + 30, -Z, x + 12, Y0 + 34, -Z + 1, C.GLOW_AMBER);
    g.fill(x, Y0 + 30, Z - 1, x + 12, Y0 + 34, Z, C.GLOW_AMBER);
    g.fill(x, Y1 - 20, -Z, x + 12, Y1 - 16, -Z + 1, C.GLOW_CYAN_D);
    g.fill(x, Y1 - 20, Z - 1, x + 12, Y1 - 16, Z, C.GLOW_CYAN_D);
  }
  // 跨间框架
  for (let x = X0 + 18; x < X1 - 10; x += 44) {
    g.frameBox(x, Y0 - 4, -Z - 6, x + 10, Y1 + 4, Z + 6, 6, C.GUNMETAL);
    g.fill(x, Y1 - 12, -Z, x + 10, Y1 - 6, Z, C.HULL_MID);
    // 顶部导能构件
    g.fill(x + 3, Y1 - 30, -8, x + 7, Y1 - 12, 8, C.GLOW_CYAN_D);
    g.fill(x + 3, Y1 - 30, -2, x + 7, Y1 - 12, 2, C.GLOW_CYAN);
  }
  // 装填装置（两侧高大装置）
  for (let x = X0 + 30; x < 770; x += 56) {
    for (const side of [-1, 1]) {
      const z0 = side * (Z - 22), z1 = side * (Z - 4);
      g.fill(x, Y0 + 4, Math.min(z0, z1), x + 26, Y1 - 18, Math.max(z0, z1), C.GUNMETAL);
      g.fill(x + 4, Y0 + 8, Math.min(z0, z1) + 3, x + 22, Y1 - 22, Math.max(z0, z1) - 3, C.HULL_DEEP);
      // 发光槽列
      for (let i = 0; i < 3; i++) {
        const zz = side * (Z - 20 + i * 6);
        g.fill(x + 6, Y0 + 12, Math.min(zz, zz + 2), x + 20, Y1 - 26, Math.max(zz, zz + 2), C.GLOW_AMBER);
      }
      // 顶部构件
      g.fill(x + 2, Y1 - 22, Math.min(z0, z1), x + 24, Y1 - 16, Math.max(z0, z1), C.STEEL);
    }
  }
  // 尽头发光腔口
  g.fill(X1 - 6, Y0 - 8, -Z - 8, X1 + 6, Y1 + 8, Z + 8, C.HULL_DEEP);
  g.carve(X1 - 10, Y0 + 4, -Z + 6, X1 + 8, Y1 - 4, Z - 6);
  g.fill(X1 + 2, Y0 + 6, -Z + 8, X1 + 6, Y1 - 6, Z - 8, C.GLOW_CYAN);
  g.fill(X1 + 5, Y0 + 18, -Z + 18, X1 + 8, Y1 - 18, Z - 18, C.GLOW_WHITE);
  g.frameBox(X1 - 12, Y0 - 2, -Z - 4, X1 + 10, Y1 + 2, Z + 4, 8, C.STEEL);
  // 侧面检修口
  for (let x = X0 + 40; x < X1 - 50; x += 90) {
    g.carve(x, Y0 + 40, Z, x + 24, Y0 + 62, Z + 10);
    g.fill(x, Y0 + 40, Z + 8, x + 24, Y0 + 62, Z + 10, C.SHADOW);
  }
  // 尽端侧向暗通道（通往动力核心中庭）
  g.carve(796, Y0, -86, 866, Y1, -Z + 4);
  g.fill(792, Y0 - 6, -92, 870, Y0, -30, C.SHADOW);
  g.fill(792, Y1, -92, 870, Y1 + 6, -30, C.SHADOW);
  g.fill(792, Y0 - 6, -92, 870, Y1 + 6, -86, C.SHADOW);
  g.fill(792, Y0 - 6, -36, 870, Y1 + 6, -30, C.SHADOW);
  g.fill(792, Y0, -86, 800, Y1, -30, C.SHADOW);
}
