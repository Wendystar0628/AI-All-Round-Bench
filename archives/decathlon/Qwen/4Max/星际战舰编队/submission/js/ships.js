/* 舰队造型：母题 = 前缘分叉 + 退台层壳。旗舰「玄枢」/ 近卫「棘卫」/ 前卫「彗矛」/ 小艇「梭影」 */
'use strict';

SF.shipGeo = {};
SF.fleet = { escorts: [], turrets: [], shuttles: [], anchors: {} };

/* ---------------- 旗舰 ---------------- */
SF.buildFlagship = function () {
  const P = SF.PAL, b = new SF.VoxelBuilder(101);
  const W = z => { // 半宽
    if (z < -430) return 48 + (z + 550) * 0.05;
    if (z < -260) return 52 + (z + 430) * 0.07;
    if (z < 120) return 64 + (z + 260) * 0.02;
    if (z < 330) return 70 - (z - 120) * 0.13;
    if (z < 430) return 56 - (z - 330) * 0.2;
    return 36;
  };
  const H = z => { // 半高
    if (z < -430) return 24;
    if (z < -260) return 26;
    if (z < 120) return 29 + (z + 260) * 0.01;
    if (z < 330) return 32 - (z - 120) * 0.03;
    return 26 - (z - 330) * 0.05;
  };
  const YC = z => z > -260 && z < 330 ? 2 : 0;

  // 主壳：逐段切片，单层外壳 + 切角
  for (let z = -550; z <= 430; z++) {
    const w = Math.round(W(z)), h = Math.round(H(z)), yc = YC(z);
    const band = ((z + 550) % 56) < 22; // 退台装甲带
    const ww = band ? w + 5 : w, hh = band ? h + 3 : h;
    const c = band ? P.plate : P.hull;
    const groove = (z + 550) % 56 === 22 || (z + 550) % 56 === 0;
    for (let x = -ww; x <= ww; x++) for (let y = yc - hh; y <= yc + hh; y++) {
      const dx = Math.abs(x), dy = Math.abs(y - yc);
      const edge = dx === ww || dy === hh;
      const cornerCut = dx > ww - 9 && dy > hh - 8; // 切角
      if (!edge || cornerCut) continue;
      let cc = c;
      if (dy === hh && dx < ww - 10) cc = P.hullLite;
      if (groove) cc = P.deep; // 深槽带
      b.set(x, y, z, cc);
    }
    // 槽带里的离子青缝灯（稀疏）
    if ((z + 550) % 56 === 23 && z % 8 === 0) {
      b.set(-ww + 2, yc, z, P.cyan, 1.0);
      b.set(ww - 2, yc, z, P.cyan, 1.0);
      b.set(0, yc + hh - 2, z, P.cyan, 0.8);
    }
  }

  // 舰首分叉：中央棱脊 + 两侧前伸叉角
  for (let z = 430; z <= 550; z++) {
    const u = (z - 430) / 120;
    const cw = Math.round(13 - u * 7), ch = Math.round(11 - u * 6);
    for (let x = -cw; x <= cw; x++) for (let y = -ch; y <= ch; y++) {
      if (Math.abs(x) < cw - 1 && Math.abs(y) < ch - 1 && z < 545) continue;
      b.set(x, y + 2, z, Math.abs(x) === cw || Math.abs(y) === ch ? P.plate : P.hull);
    }
    const sw = Math.round(9 - u * 5), sh = Math.round(7 - u * 4), sx = Math.round(30 - u * 8);
    for (const s of [-1, 1]) for (let x = -sw; x <= sw; x++) for (let y = -sh; y <= sh; y++) {
      if (Math.abs(x) < sw - 1 && Math.abs(y) < sh - 1 && z < 516) continue;
      b.set(s * sx + x, y - 2, z, Math.abs(x) === sw ? P.edge : P.plate);
    }
    if (z === 548) { b.set(0, 2, z, P.cyan, 1.2); }
    if (z === 518) for (const s of [-1, 1]) b.set(s * (sx + sw), -2, z, P.red, 0.9);
  }

  // 背脊上层：退台塔群（桥舱区留出）
  const tower = (z0, z1, w0, y1) => {
    for (let z = z0; z <= z1; z++) {
      const u = (z - z0) / (z1 - z0);
      const w = Math.round(w0 * (1 - u * 0.45));
      const top = Math.round(SF.lerp(H(z) + YC(z), y1, Math.min(1, u * 1.6)));
      for (let x = -w; x <= w; x++) for (let y = Math.round(H(z) + YC(z)) - 2; y <= top; y++) {
        const edge = Math.abs(x) === w || y === top;
        if (!edge) continue;
        b.set(x, y, z, y === top ? P.hullLite : P.plate);
      }
      if (z % 14 === 0) { b.set(-w, top, z, P.cyan, 0.7); b.set(w, top, z, P.cyan, 0.7); }
    }
  };
  tower(-420, -300, 26, 40);
  tower(-240, -120, 30, 46);
  tower(-60, 40, 34, 52);
  tower(210, 320, 26, 44);
  tower(340, 420, 18, 34);

  // 舰桥舱段外部整流罩（内部陈设见 interiors.js）
  b.box(-68, 88, 58, 68, 88, 192, P.plate); // 顶板
  for (let z = 58; z <= 192; z++) {
    b.set(-68, 87, z, P.hull); b.set(68, 87, z, P.hull);
    if (z % 26 < 4) { b.box(-70, 30, z, -68, 88, z, P.hull); b.box(68, 30, z, 70, 88, z, P.hull); }
  }
  for (let x = -68; x <= 68; x++) { b.set(x, 88, 58, P.edge); b.set(x, 88, 192, P.edge); }
  b.box(-70, 22, 56, 70, 24, 194, P.deep, 0, 0, true); // 底座

  // 腹部肋架与第二层壳
  for (let z = -430; z <= 380; z += 44) {
    const w = Math.round(W(z)), h = Math.round(H(z));
    b.box(-Math.round(w * 0.55), -h - 12, z, Math.round(w * 0.55), -h - 8, z + 5, P.deep);
    b.box(-4, -h - 16, z - 2, 4, -h - 6, z + 8, P.plate);
    b.set(0, -h - 16, z + 3, P.cyan, 0.8);
  }
  for (let z = -380; z <= 300; z++) { // 腹部退叠壳
    if ((z + 380) % 70 > 46) continue;
    const w = Math.round(W(z) * 0.62), h = Math.round(H(z));
    for (let x = -w; x <= w; x++) {
      b.set(x, -h - 4, z, P.plate);
      if (Math.abs(x) > w - 3) b.set(x, -h - 3, z, P.deep);
    }
  }

  // 侧部裙壳（机库口在左舷）
  for (const s of [-1, 1]) for (let z = -330; z <= 160; z++) {
    const w = Math.round(W(z));
    const out = w + ((z + 330) % 48 < 30 ? 9 : 5);
    for (let y = -11; y <= 11; y++) {
      b.set(s * out, y, z, Math.abs(y) > 8 ? P.deep : P.plate);
    }
    if (z % 6 === 0) for (let y = -9; y <= 9; y += 3) b.set(s * (out - 1), y, z, P.dark);
    if (z % 24 === 0) b.set(s * out, 0, z, P.cyan, 0.7);
  }

  // 机库开口（左舷 x=-70 附近，z -260..-160）
  b.carve(-82, -9, -262, -60, 19, -158);
  for (let z = -266; z <= -154; z += 4) { // 开口阶面框
    b.box(-80, 19, z, -64, 22, z + 2, P.edge);
    b.box(-80, -12, z, -64, -9, z + 2, P.deep);
  }
  for (let y = -9; y <= 19; y += 5) {
    b.box(-80, y, -266, -64, y + 2, -262, P.edge);
    b.box(-80, y, -158, -64, y + 2, -154, P.edge);
  }
  b.set(-72, 21, -210, P.red, 1.0); b.set(-72, -11, -210, P.red, 1.0);

  // 舰尾推进：层叠退让 + 五组喷口内腔
  b.box(-46, -22, -552, 46, 22, -540, P.deep, 0, 0, true);
  const nozzles = [[0, 0, 13], [-30, 12, 8], [30, 12, 8], [-30, -12, 8], [30, -12, 8]];
  for (const [nx, ny, r] of nozzles) {
    for (let z = -552; z <= -528; z++) {
      const rr = r + (z + 552) * 0.12;
      for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) for (let y = -Math.ceil(rr); y <= Math.ceil(rr); y++) {
        const d = Math.hypot(x, y);
        if (d <= rr && d >= rr - 2.2) b.set(nx + x, ny + y, z, z < -546 ? P.edge : P.dark);
        else if (d < rr - 2.2 && z >= -536) b.del(nx + x, ny + y, z);
      }
    }
    for (let x = -Math.ceil(r * 0.7); x <= Math.ceil(r * 0.7); x++) for (let y = -Math.ceil(r * 0.7); y <= Math.ceil(r * 0.7); y++) {
      if (Math.hypot(x, y) <= r * 0.7) b.set(nx + x, ny + y, -530, P.cyan, 1.6);
    }
  }
  // 尾部退台环
  for (let z = -540; z <= -430; z += 22) {
    const w = Math.round(W(z)) + 3, h = Math.round(H(z)) + 2;
    for (let x = -w; x <= w; x++) { b.set(x, h, z, P.plate); b.set(x, -h, z, P.plate); }
  }

  // 光束主炮基部（背脊中线）
  b.box(-16, 30, 210, 16, 44, 340, P.hull);
  b.box(-12, 44, 230, 12, 50, 330, P.plate);
  b.box(-8, 50, 250, 8, 54, 320, P.deep);
  for (let z = 220; z <= 330; z += 18) { b.set(-16, 40, z, P.amber, 0.9); b.set(16, 40, z, P.amber, 0.9); }

  // 开出舰桥与机库的空腔（内部陈设见 interiors.js）
  b.carve(-65, 27, 62, 65, 83, 188);          // 舰桥大厅
  b.carve(-50, 32, 186, 50, 74, 196);         // 观景开口
  b.carve(-12, 27, 54, 12, 55, 64);           // 舰桥 rear 入口
  b.carve(-68, -10, -320, -16, 26, 30);       // 机库贯通舱
  b.carve(-82, -9, -262, -60, 19, -158);      // 机库舷侧口（与裙壳连通）

  const hull = b.build();

  // 炮身（独立单元，蓄势时发光槽渐亮）
  const bb = new SF.VoxelBuilder(102);
  for (let z = 336; z <= 654; z++) {
    const u = (z - 336) / 318;
    const w = Math.round(7 - u * 3), h = Math.round(6 - u * 2);
    for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
      if (Math.abs(x) < w - 1 && Math.abs(y) < h - 1 && z < 648) continue;
      bb.set(x, y + 46, z, Math.abs(y) === h ? P.plate : P.hull);
    }
    if (z % 22 < 3) { // 发光槽
      bb.set(-w, 46, z, P.amber, 1.4); bb.set(w, 46, z, P.amber, 1.4);
      bb.set(0, 46 + h, z, P.amber, 1.1);
    }
  }
  for (let z = 648; z <= 660; z++) { // 发射口环
    const r = z < 654 ? 9 : 7;
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) {
      const d = Math.hypot(x, y);
      if (d <= r && d >= r - 2) bb.set(x, y + 46, z, P.edge);
      else if (d < r - 2) bb.set(x, y + 46, z, P.amber, 1.8);
    }
  }
  const barrel = bb.build();

  // 脉冲炮台（悬浮）
  const tb = new SF.VoxelBuilder(103);
  tb.box(-5, -2, -5, 5, 0, 5, P.deep);
  tb.box(-4, 0, -4, 4, 1, 4, P.plate);
  tb.set(-5, -1, 0, P.cyan, 0.9); tb.set(5, -1, 0, P.cyan, 0.9);
  const turretBase = tb.build();
  const th = new SF.VoxelBuilder(104);
  th.box(-4, 0, -4, 4, 4, 3, P.hull);
  th.box(-3, 4, -3, 3, 5, 2, P.plate);
  th.box(-3, 1, 3, -1, 3, 14, P.deep);
  th.box(1, 1, 3, 3, 3, 14, P.deep);
  th.set(-2, 2, 14, P.amber, 1.3); th.set(2, 2, 14, P.amber, 1.3);
  const turretHead = th.build();

  SF.shipGeo.flagHull = hull;
  SF.shipGeo.flagBarrel = barrel;
  SF.shipGeo.turretBase = turretBase;
  SF.shipGeo.turretHead = turretHead;
  SF.fleet.anchors.nozzles = nozzles.map(([x, y, r]) => ({ p: [x, y, -553], r }));
  SF.fleet.anchors.muzzle = [0, 46, 662];
  SF.fleet.anchors.mouth = [-76, 5, -210];
};

/* ---------------- 护卫舰 ---------------- */
SF.buildEscort = function (type, lod = false) {
  const P = SF.PAL, b = new SF.VoxelBuilder((type === 'guard' ? 201 : 202) + (lod ? 50 : 0) + (lod === 2 ? 100 : 0));
  if (lod === 2) {
    // 远景剪影：同一网格上的简化轮廓
    const L = type === 'guard' ? 90 : 105, W0 = type === 'guard' ? 17 : 10, H0 = type === 'guard' ? 12 : 8;
    for (let z = -L; z <= L; z++) {
      const taper = Math.max(0, (Math.abs(z) - L * 0.55) / (L * 0.45));
      const w = Math.max(2, Math.round(W0 * (1 - taper * 0.75))), h = Math.max(2, Math.round(H0 * (1 - taper * 0.7)));
      for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
        if (Math.abs(x) !== w && Math.abs(y) !== h) continue;
        if (Math.abs(x) > w - 3 && Math.abs(y) > h - 3) continue;
        b.set(x, y, z, Math.abs(y) === h ? P.hullLite : P.plate);
      }
      if (z === -L + 2) for (let x = -3; x <= 3; x++) b.set(x, 0, z, P.cyan, 1.4);
    }
    if (type === 'picket') for (const s of [-1, 1]) b.box(s * 12, -4, -50, s * 24, 5, 40, P.plate, 0, 0, true);
    return b.build();
  }
  if (type === 'guard') {
    // 棘卫：紧凑厚实，中央主体 + 短翼咬合
    for (let z = -60; z <= 50; z++) {
      const band = !lod && ((z + 60) % 30) < 12;
      const w = band ? 19 : 17, h = band ? 14 : 12;
      for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
        const edge = Math.abs(x) === w || Math.abs(y) === h;
        const cut = Math.abs(x) > w - 4 && Math.abs(y) > h - 4;
        if (!edge || cut) continue;
        b.set(x, y, z, band ? P.plate : P.hull);
      }
      if (!lod && (z + 60) % 30 === 12 && z % 6 === 0) { b.set(-w + 1, 0, z, P.cyan, 0.9); b.set(w - 1, 0, z, P.cyan, 0.9); }
    }
    for (let z = 50; z <= 90; z++) { // 舰首收束 + 双叉尖
      const u = (z - 50) / 40, w = Math.round(17 - u * 10), h = Math.round(12 - u * 6);
      for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
        if (Math.abs(x) !== w && Math.abs(y) !== h && z < 86) continue;
        b.set(x, y, z, P.plate);
      }
      if (z > 78) for (const s of [-1, 1]) b.box(s * 8 - 1, -2, z, s * 8 + 1, 2, z, P.edge);
    }
    b.box(-14, -10, -90, 14, 10, -60, P.deep, 0, 0, true); // 尾段
    for (const [nx, ny, r] of [[0, 0, 5], [-10, 0, 3], [10, 0, 3]]) {
      for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) {
        const d = Math.hypot(x, y);
        if (d <= r && d >= r - 1.6) b.set(nx + x, ny + y, -88, P.edge);
        else if (d < r - 1.6) b.set(nx + x, ny + y, -86, P.cyan, 1.5);
      }
    }
    for (const s of [-1, 1]) { // 短翼叠层
      b.box(s * 17, -4, -40, s * 30, 4, 20, P.plate, 0, 0, true);
      if (!lod) { b.box(s * 20, -2, -30, s * 33, 2, 8, P.hull, 0, 0, true); b.set(s * 33, 0, -10, P.cyan, 0.8); }
    }
    if (!lod) for (let z = -30; z <= 40; z += 6) b.box(-4, 12, z, 4, 16 - Math.abs(z) * 0.08, z + 2, P.hull, 0, 0, true);
    const mounts = [[-9, 14, 22], [9, 14, 22], [0, 15, -32], [-22, 5, -8], [22, 5, -8]];
    for (const [mx, my, mz] of mounts) b.box(mx - 3, my - 3, mz - 3, mx + 3, my, mz + 3, P.deep, 0, 0, true);
    SF.fleet.anchors.guardMounts = mounts;
    SF.fleet.anchors.guardNozzles = [[0, 0, -90, 5], [-10, 0, -90, 3], [10, 0, -90, 3]];
  } else {
    // 彗矛：舒展延伸，长脊 + 外伸导弹发射部
    for (let z = -80; z <= 85; z++) {
      const band = !lod && ((z + 80) % 34) < 14;
      const w = band ? 10 : 9, h = band ? 8 : 7;
      for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
        const edge = Math.abs(x) === w || Math.abs(y) === h;
        if (!edge) continue;
        b.set(x, y, z, band ? P.plate : P.hull);
      }
      if (!lod && (z + 80) % 34 === 14 && z % 6 === 0) { b.set(0, h - 1, z, P.cyan, 0.9); }
    }
    for (let z = 85; z <= 105; z++) { // 舰首双叉
      const u = (z - 85) / 20;
      for (const s of [-1, 1]) {
        const w = Math.round(4 - u * 2);
        b.box(s * 5 - w, -3, z, s * 5 + w, 3, z, P.plate, 0, 0, true);
      }
      if (z === 105) for (const s of [-1, 1]) b.set(s * 5, 0, z, P.red, 1.0);
    }
    b.box(-11, -6, -105, 11, 6, -80, P.deep, 0, 0, true);
    for (const s of [-1, 1]) { // 双喷口
      for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) {
        const d = Math.hypot(x, y);
        if (d <= 4 && d >= 2.6) b.set(s * 6 + x, y, -103, P.edge);
        else if (d < 2.6) b.set(s * 6 + x, y, -101, P.cyan, 1.5);
      }
    }
    for (const s of [-1, 1]) { // 导弹发射部：成排槽列
      b.box(s * 12, -5, -55, s * 26, 6, 45, P.plate, 0, 0, true);
      if (!lod) {
        b.box(s * 14, 6, -52, s * 24, 8, 42, P.hull, 0, 0, true);
        for (let i = 0; i < 6; i++) {
          const z = -46 + i * 16;
          b.carve(s * 15 - 2, 7, z - 2, s * 15 + 2, 9, z + 2);
          b.carve(s * 21 - 2, 7, z - 2, s * 21 + 2, 9, z + 2);
          b.set(s * 15, 6, z, P.dark); b.set(s * 21, 6, z, P.dark);
        }
      }
      b.set(s * 26, 0, 0, P.cyan, 0.8);
    }
    SF.fleet.anchors.picketNozzles = [[-6, 0, -105, 4], [6, 0, -105, 4]];
    SF.fleet.anchors.picketCells = [];
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) for (const x of [15, 21]) {
      SF.fleet.anchors.picketCells.push([s * x, 8, -46 + i * 16]);
    }
  }
  return b.build();
};

SF.buildCIWSHead = function () {
  const b = new SF.VoxelBuilder(203), P = SF.PAL;
  b.box(-2, 0, -2, 2, 2, 2, P.hull);
  b.box(-2, 1, 2, -1, 2, 9, P.deep);
  b.box(1, 1, 2, 2, 2, 9, P.deep);
  b.set(-1.5 | 0, 1, 9, P.amber, 1.2); b.set(1, 1, 9, P.amber, 1.2);
  return b.build();
};

SF.buildMissileTip = function () {
  const b = new SF.VoxelBuilder(204), P = SF.PAL;
  b.set(0, 0, 0, P.red, 1.1); b.set(0, -1, 0, P.edge);
  return b.build();
};

SF.buildMissile = function () {
  const b = new SF.VoxelBuilder(205), P = SF.PAL;
  b.box(0, 0, -3, 0, 0, 2, P.edge);
  b.set(0, 0, 3, P.red, 1.2);
  b.set(-1, 0, -3, P.plate); b.set(1, 0, -3, P.plate);
  b.set(0, 1, -3, P.plate); b.set(0, -1, -3, P.plate);
  b.set(0, 0, -4, P.amber, 1.5);
  return b.build();
};

SF.buildShuttle = function () {
  // 梭影小艇：约 28 格长（旗舰的 ~1/39），概括舰队母题
  const b = new SF.VoxelBuilder(206), P = SF.PAL;
  for (let z = -8; z <= 8; z++) { // 主体
    const w = z > 4 ? 3 : 4, h = z > 4 ? 2 : 3;
    for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
      if (Math.abs(x) !== w && Math.abs(y) !== h && z < 8) continue;
      b.set(x, y, z, Math.abs(y) === h ? P.hullLite : P.hull);
    }
  }
  for (let z = 9; z <= 14; z++) { // 前部收束
    const w = Math.max(1, 4 - Math.round((z - 8) * 0.6)), h = Math.max(1, 3 - Math.round((z - 8) * 0.4));
    for (let x = -w; x <= w; x++) for (let y = -h; y <= h; y++) {
      if (Math.abs(x) !== w && Math.abs(y) !== h && z < 14) continue;
      b.set(x, y, z, P.plate);
    }
  }
  b.set(0, 0, 14, P.edge);
  b.set(0, 2, 2, P.cyan, 0.8); // 座舱光带
  b.set(-4, 0, 0, P.cyan, 0.7); b.set(4, 0, 0, P.cyan, 0.7);
  for (const s of [-1, 1]) { // 短翼
    b.box(s * 4, -1, -6, s * 7, 1, 2, P.plate, 0, 0, true);
    b.set(s * 7, 0, -2, P.red, 0.8);
  }
  b.box(-3, -2, -14, 3, 2, -8, P.deep, 0, 0, true); // 尾段
  for (const s of [-1, 1]) for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    if (Math.hypot(x, y) <= 1.5) b.set(s * 2 + x, y, -14, P.cyan, 1.6);
  }
  b.box(-1, 3, -6, 1, 5, -2, P.plate, 0, 0, true); // 背鳍
  b.set(0, 5, -4, P.edge);
  return b.build();
};

/* ---------------- 编队布局 ---------------- */
SF.initFleet = function () {
  const guards = [
    [-215, 14, 60], [255, -12, 40], [-320, 60, -280], [330, 48, -220],
    [-270, -55, 200], [280, -60, 260], [-180, 95, -430], [190, 100, -470],
    [-160, -90, -520], [170, -95, -560], [-420, 10, 60], [430, 5, 120]
  ];
  const pickets = [];
  const rows = [
    { z: 700, xs: [-220, 220, -430, 430], ys: [30, -25, 90, -80] },
    { z: 960, xs: [-140, 140, -370, 370, -600, 600], ys: [-40, 55, 15, -60, 120, -110] },
    { z: 1260, xs: [-270, 270, -510, 510, -730, 730], ys: [70, -35, -90, 100, 20, -140] }
  ];
  rows.forEach(r => r.xs.forEach((x, i) => pickets.push([x, r.ys[i], r.z + (i % 2) * 60])));
  const distant = [
    [-190, 40, 1950, 'picket'], [240, -70, 2100, 'guard'], [-480, 120, 2350, 'picket'],
    [520, -130, 2500, 'picket'], [-120, -90, 2750, 'guard'], [360, 150, 2900, 'picket'],
    [-620, -40, 3150, 'picket'], [150, 60, 3350, 'guard']
  ];
  SF.fleet.escorts = [];
  guards.forEach((p, i) => SF.fleet.escorts.push({ type: 'guard', base: p, phase: i * 0.61, idx: i }));
  pickets.forEach((p, i) => SF.fleet.escorts.push({ type: 'picket', base: p, phase: i * 0.47 + 2, idx: i + 12 }));
  distant.forEach((d, i) => SF.fleet.escorts.push({ type: d[3], base: [d[0], d[1], d[2]], phase: i * 0.83 + 4, idx: i + 28, distant: true }));

  // 悬浮脉冲炮台
  const tp = [[-100, 62, -320], [104, 58, -300], [-112, 36, -80], [116, 40, -60],
    [-98, 72, 160], [102, 76, 180], [-76, 90, 330], [80, 92, 350]];
  SF.fleet.turrets = tp.map((p, i) => ({ p, phase: i * 0.77 }));
};

/* 舰船姿态（周期量保证循环连续） */
SF.shipPose = function (e, t) {
  const L = SF.LOOP, w = SF.TAU / L;
  const bob = [Math.sin(w * t * 2 + e.phase * 3) * 4, Math.sin(w * t * 3 + e.phase * 5) * 5, Math.sin(w * t + e.phase) * 3];
  const sp = SF.timeline.spread(t);
  const dir = SF.norm([e.base[0], e.base[1] * 0.4, 0]);
  const dist = e.type === 'guard' ? 70 : 110;
  const surge = SF.timeline.surge(t - (e.base[2] > 600 ? 0.8 : 0)) * (e.type === 'picket' ? 55 : 30);
  const p = [e.base[0] + bob[0] + dir[0] * sp * dist, e.base[1] + bob[1] + dir[1] * sp * dist, e.base[2] + bob[2] + surge];
  const yaw = Math.sin(w * t * 2 + e.phase * 2) * 0.025;
  const pitch = Math.sin(w * t * 3 + e.phase) * 0.012;
  return { p, yaw, pitch, roll: Math.sin(w * t + e.phase * 4) * 0.02 };
};

/* ---------------- 小艇航线 ---------------- */
SF.closedRoute = function (pts) {
  const n = pts.length;
  return function (u) {
    u = ((u % 1) + 1) % 1;
    const x = u * n, i = Math.floor(x), f = x - i;
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i % n], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const out = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const m1 = (p2[a] - p0[a]) * 0.5, m2 = (p3[a] - p1[a]) * 0.5;
      const f2 = f * f, f3 = f2 * f;
      out[a] = (2 * f3 - 3 * f2 + 1) * p1[a] + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * p2[a] + (f3 - f2) * m2;
    }
    return out;
  };
};

SF.initShuttles = function () {
  const S = SF.fleet.shuttles = [];
  const loopA = SF.closedRoute([[-120, 34, 470], [-165, 55, 200], [-150, 22, -150], [-125, 44, -430],
    [0, 75, -580], [135, 48, -380], [155, 26, -60], [135, 64, 300], [60, 85, 540]]);
  const loopB = SF.closedRoute([[150, -40, 380], [200, -60, 60], [170, -45, -300], [60, -80, -520],
    [-80, -70, -480], [-170, -50, -160], [-190, -38, 200], [-60, -60, 500], [80, -50, 560]]);
  const hangarRoute = SF.closedRoute([[-58, 1, -292], [-42, 5, -250], [-52, 7, -212], [-95, 9, -210],
    [-190, 20, -170], [-270, 34, 40], [-215, 44, 300], [-130, 34, 430], [-60, 26, 300],
    [-120, 18, 60], [-150, 12, -140], [-95, 8, -205], [-55, 5, -235]]);
  const escortLoop = SF.closedRoute([[330, 30, 160], [400, 10, -40], [340, -20, -200], [240, 0, -120], [250, 25, 60]]);
  const add = (route, period, phase, scale = 1) => S.push({ route, period, phase, scale });
  add(loopA, 39, 0); add(loopA, 39, 0.5); add(loopB, 78, 0.2); add(loopB, 78, 0.65);
  add(hangarRoute, 39, 0.08); add(hangarRoute, 39, 0.42); add(hangarRoute, 39, 0.74);
  add(escortLoop, 26, 0.1); add(escortLoop, 26, 0.55);
  add(SF.closedRoute([[-320, 80, -350], [-250, 100, -480], [-160, 110, -380], [-220, 90, -260]]), 19.5, 0.3);
  // 停泊艇
  S.push({ parked: [-62, -4, -285] }, { parked: [-62, -4, -225] }, { parked: [-22, -4, -120] },
    { parked: [-22, -4, -30] }, { parked: [30, 58, -180] }, { parked: [-34, 58, -150] });
};

SF.shuttlePose = function (s, t) {
  if (s.parked) return { p: s.parked, yaw: Math.PI, pitch: 0, roll: 0 };
  const u = t / s.period + s.phase;
  const p = s.route(u), p2 = s.route(u + 0.004);
  const d = SF.sub(p2, p);
  const l = SF.len(d) || 1;
  const yaw = Math.atan2(d[0], d[2]), pitch = -Math.asin(SF.clamp(d[1] / l, -1, 1));
  const p3 = s.route(u + 0.01);
  const d2 = SF.sub(p3, p2);
  const turn = (d[0] * d2[2] - d[2] * d2[0]) / (l * (SF.len(d2) || 1));
  return { p, yaw, pitch, roll: SF.clamp(turn * 260, -0.7, 0.7) };
};