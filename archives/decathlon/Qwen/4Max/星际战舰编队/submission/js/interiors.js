/* 四处舰内概念空间：舰桥与机库嵌在旗舰实体内，动力中庭与能量长廊为独立概念舱段 */
'use strict';

SF.interGeo = {};
SF.INTER = { atrium: [8000, 0, 0], corridor: [4000, 0, 0] };

/* ---------------- 舰桥（旗舰背脊 z 60..190） ---------------- */
SF.buildBridge = function () {
  const P = SF.PAL, b = new SF.VoxelBuilder(301);
  b.box(-64, 25, 62, 64, 25, 188, P.dark); // 地板
  for (let z = 66; z <= 184; z += 6) { b.set(-20, 26, z, P.cyan, 0.45); b.set(20, 26, z, P.cyan, 0.45); }
  b.box(-64, 85, 62, 64, 85, 188, P.deep); // 顶板
  for (let z = 62; z <= 188; z++) { // 侧壁
    for (let y = 26; y <= 84; y++) {
      const c = y % 12 < 2 ? P.deep : P.plate;
      b.set(-66, y, z, c); b.set(66, y, z, c);
    }
    if (z % 18 === 0) { b.set(-65, 52, z, P.cyan, 0.6); b.set(65, 52, z, P.cyan, 0.6); }
  }
  b.box(-66, 25, 189, 66, 85, 190, P.plate); // 前壁（观景开口）
  b.carve(-50, 32, 188, 50, 74, 191);
  b.box(-66, 25, 60, 66, 85, 61, P.plate); // 后壁（入口）
  b.carve(-12, 27, 59, 12, 55, 62);
  // 中央指挥中枢：层叠基座
  const pedestal = (r, y0, y1, c) => {
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      if (Math.hypot(x, z) > r) continue;
      for (let y = y0; y <= y1; y++) {
        const edge = Math.hypot(x, z) > r - 1.6 || y === y1;
        if (edge) b.set(x, y, 128 + z, y === y1 ? P.hullLite : c);
      }
      if (Math.hypot(x, z) > r - 1.6 && Math.hypot(x, z) <= r && (x + z) % 4 === 0) b.set(x, y1, 128 + z, P.cyan, 1.0);
    }
  };
  pedestal(20, 27, 30, P.plate);
  pedestal(14, 30, 34, P.hull);
  pedestal(8, 34, 38, P.deep);
  // 悬起显示环
  for (let a = 0; a < 12; a++) {
    const ang = a / 12 * SF.TAU;
    const x = Math.round(Math.cos(ang) * 12), z = 128 + Math.round(Math.sin(ang) * 12);
    b.box(x - 2, 48 + (a % 3), z - 1, x + 2, 52 + (a % 3), z + 1, a % 2 ? P.cyan : P.amber, 0.5, 0, true);
  }
  b.box(-2, 40, 126, 2, 46, 130, P.edge);
  b.set(0, 47, 128, P.cyan, 1.0);
  // 两侧控制台组（两层平台）
  for (const s of [-1, 1]) {
    for (let z = 74; z <= 176; z += 14) {
      const x = s * 38;
      b.box(x - 5, 27, z - 3, x + 5, 29, z + 3, P.plate);
      b.box(x - 4, 30, z - 2, x + 4, 30, z + 2, P.cyan, 0.8);
      b.box(x - 4, 35, z - 1, x + 4, 39, z, P.deep, 0, 0, true);
      b.box(x - 3, 36, z, x + 3, 38, z, (z / 14) % 2 ? P.cyan : P.amber, 0.4);
    }
    b.box(s * 48, 44, 70, s * 63, 46, 180, P.plate); // 侧层平台
    for (let z = 72; z <= 178; z += 10) b.set(s * 49, 47, z, P.edge);
    for (let z = 78; z <= 172; z += 18) {
      const x = s * 55;
      b.box(x - 4, 47, z - 2, x + 4, 49, z + 2, P.hull);
      b.box(x - 3, 50, z - 1, x + 3, 50, z + 1, P.cyan, 0.4);
      b.box(x - 3, 54, z, x + 3, 58, z, P.amber, 0.35, 0, true);
    }
  }
  // 跨空梁架与悬置显示板
  for (let z = 70; z <= 182; z += 26) {
    b.box(-64, 80, z, 64, 83, z + 4, P.hull);
    b.set(-30, 79, z + 2, P.cyan, 0.45); b.set(30, 79, z + 2, P.cyan, 0.45);
    const hx = ((z / 26) % 2 ? -1 : 1) * 22;
    b.box(hx - 6, 68, z + 8, hx + 6, 76, z + 9, P.deep, 0, 0, true);
    b.box(hx - 5, 69, z + 9, hx + 5, 75, z + 9, (z / 26) % 3 ? P.cyan : P.amber, 0.35);
  }
  // 观景开口框（前方 z=190）
  for (let x = -54; x <= 54; x += 4) { b.box(x, 74, 186, x + 2, 78, 192, P.edge); b.box(x, 28, 186, x + 2, 32, 192, P.deep); }
  for (let y = 32; y <= 74; y += 6) { b.box(-54, y, 186, -50, y + 3, 192, P.edge); b.box(50, y, 186, 54, y + 3, 192, P.edge); }
  return b.build();
};

/* ---------------- 机库（左舷贯通 z -320..30） ---------------- */
SF.buildHangar = function () {
  const P = SF.PAL, b = new SF.VoxelBuilder(302);
  b.box(-68, -10, -320, -16, -10, 30, P.dark); // 地面
  for (let z = -316; z <= 26; z += 5) { b.set(-52, -9, z, P.cyan, 0.5); b.set(-32, -9, z, P.cyan, 0.5); }
  for (let z = -310; z <= 20; z += 40) b.set(-42, -9, z, P.amber, 0.45);
  b.box(-68, 26, -320, -16, 26, 30, P.deep); // 顶
  for (let z = -300; z <= 20; z += 40) {
    b.box(-68, 21, z, -16, 24, z + 4, P.hull); // 跨舱桥架
    b.set(-60, 20, z + 2, P.cyan, 0.5); b.set(-24, 20, z + 2, P.cyan, 0.5);
    b.box(-46, 12, z + 1, -42, 20, z + 3, P.plate); // 悬置维修构架
    b.box(-48, 10, z + 1, -40, 12, z + 3, P.deep);
    b.set(-44, 9, z + 2, P.amber, 0.5);
  }
  b.box(-68, 8, -320, -66, 14, 30, P.plate); // 侧壁带
  b.box(-18, 8, -320, -16, 14, 30, P.plate);
  // 停泊凹位（内侧壁）
  for (let z = -300; z <= 0; z += 44) {
    b.carve(-16, -8, z - 9, -8, 12, z + 9);
    b.box(-16, -9, z - 10, -8, -8, z + 10, P.plate);
    b.box(-16, 12, z - 10, -8, 13, z + 10, P.plate);
    b.box(-9, -8, z - 10, -8, 12, z - 9, P.edge);
    b.box(-9, -8, z + 9, -8, 12, z + 10, P.edge);
    b.set(-12, 12, z, P.amber, 0.5);
    b.set(-12, -8, z, P.cyan, 0.4);
  }
  // 深处第二重舱口
  b.box(-68, -10, 28, -16, 26, 32, P.hull);
  b.carve(-52, -6, 27, -32, 18, 33);
  for (let x = -54; x <= -30; x += 4) b.box(x, 18, 27, x + 2, 21, 33, P.edge);
  b.box(-50, -4, 33, -34, 16, 34, P.cyan, 0.6);
  return b.build();
};

/* ---------------- 动力核心中庭 ---------------- */
SF.buildAtrium = function () {
  const P = SF.PAL, b = new SF.VoxelBuilder(303);
  // 八方舱壁
  for (let y = -125; y <= 125; y++) {
    const band = ((y + 125) % 50) < 6;
    const R = band ? 118 : 124;
    for (let a = 0; a < 48; a++) {
      const ang = a / 48 * SF.TAU;
      const x = Math.round(Math.cos(ang) * R), z = Math.round(Math.sin(ang) * R);
      const c = band ? P.plate : P.deep;
      b.set(x, y, z, c); b.set(x - Math.sign(Math.cos(ang)) * 1, y, z, P.dark);
      if (band && a % 6 === 0) b.set(Math.round(Math.cos(ang) * (R - 2)), y, Math.round(Math.sin(ang) * (R - 2)), P.cyan, 0.6);
    }
  }
  // 五层分叉平台
  for (const ly of [-100, -50, 0, 50, 100]) {
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI / 2 + Math.PI / 4;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      for (let r = 46; r <= 118; r += 3) {
        const w = 12 - (r - 46) * 0.04;
        for (let t = -w; t <= w; t++) {
          const x = Math.round(dx * r - dz * t), z = Math.round(dz * r + dx * t);
          b.set(x, ly, z, P.plate); b.set(x, ly - 1, z, P.deep);
          if (Math.abs(t) > w - 1.5) b.set(x, ly + 1, z, P.edge);
        }
        if (r % 18 === 0) {
          const x = Math.round(dx * r), z = Math.round(dz * r);
          b.set(x, ly - 2, z, P.cyan, 0.9);
        }
      }
    }
  }
  // 核心外构架
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * SF.TAU;
    const x = Math.round(Math.cos(ang) * 16), z = Math.round(Math.sin(ang) * 16);
    for (let y = -120; y <= 120; y++) { b.set(x, y, z, P.hull); b.set(x * 1.12 | 0, y, z * 1.12 | 0, P.plate); }
  }
  for (let y = -118; y <= 118; y += 16) {
    for (let a = 0; a < 32; a++) {
      if (a % 4 === 3) continue;
      const ang = a / 32 * SF.TAU;
      b.set(Math.round(Math.cos(ang) * 19), y, Math.round(Math.sin(ang) * 19), P.edge);
      b.set(Math.round(Math.cos(ang) * 19), y + 1, Math.round(Math.sin(ang) * 19), P.deep);
    }
  }
  // 发光内层
  for (let y = -116; y <= 116; y++) for (let a = 0; a < 24; a++) {
    const ang = a / 24 * SF.TAU;
    b.set(Math.round(Math.cos(ang) * 10), y, Math.round(Math.sin(ang) * 10), P.cyan, 1.5);
  }
  // 巨型支撑
  for (const ly of [-75, 0, 75]) for (const s of [-1, 1]) {
    for (let x = 20; x <= 120; x += 2) {
      const w = 5 - (x - 20) * 0.015;
      for (let t = -w; t <= w; t++) {
        b.set(s * x, ly + t * 0.4 | 0, t | 0, P.hull);
        b.set(s * x, (ly + t * 0.4 | 0) - 2, t | 0, P.deep);
      }
      if (x % 16 === 0) b.set(s * x, ly + 3, 0, P.amber, 0.9);
    }
  }
  b.box(-30, -125, -30, 30, -123, 30, P.plate); // 底
  b.box(-30, 123, -30, 30, 125, 30, P.plate); // 顶
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * SF.TAU;
    b.set(Math.round(Math.cos(ang) * 24), -122, Math.round(Math.sin(ang) * 24), P.cyan, 1.0);
    b.set(Math.round(Math.cos(ang) * 24), 122, Math.round(Math.sin(ang) * 24), P.cyan, 1.0);
  }
  const shell = b.build();

  // 旋转环带（三个独立单元）
  const ring = (r, seed) => {
    const rb = new SF.VoxelBuilder(seed);
    for (let a = 0; a < 28; a++) {
      if (a % 7 === 6) continue;
      const ang = a / 28 * SF.TAU;
      const cx = Math.cos(ang), sz = Math.sin(ang);
      for (let t = -2; t <= 2; t++) for (let y = -2; y <= 2; y++) {
        const rr = r + t;
        rb.set(Math.round(cx * rr), y, Math.round(sz * rr), Math.abs(t) === 2 || Math.abs(y) === 2 ? P.plate : P.deep);
      }
      if (a % 4 === 0) rb.set(Math.round(cx * (r + 3)), 0, Math.round(sz * (r + 3)), P.amber, 1.1);
    }
    return rb.build();
  };
  SF.interGeo.atriumShell = shell;
  SF.interGeo.rings = [
    { built: ring(30, 304), y: -30, speed: SF.TAU / SF.LOOP },
    { built: ring(42, 305), y: 25, speed: -SF.TAU / SF.LOOP * 2 },
    { built: ring(54, 306), y: 80, speed: SF.TAU / SF.LOOP * 3 }
  ];
};

/* ---------------- 能量装填与导能长廊 ---------------- */
SF.buildCorridor = function () {
  const P = SF.PAL, b = new SF.VoxelBuilder(307);
  for (let z = -180; z <= 180; z++) { // 格栅地面 / 顶
    const solid = ((z + 180) % 8) < 5;
    for (let x = -50; x <= 50; x++) {
      if (solid || Math.abs(x) > 44 || x % 6 === 0) b.set(x, 0, z, P.dark);
      if (solid || Math.abs(x) > 44 || x % 8 === 0) b.set(x, 70, z, P.deep);
    }
  }
  for (let z = -176; z <= 176; z += 6) { b.set(-8, 1, z, P.cyan, 0.45); b.set(8, 1, z, P.cyan, 0.45); }
  for (const s of [-1, 1]) {
    for (let z = -180; z <= 180; z++) for (let y = 1; y <= 69; y++) {
      if (((z + 180) % 10) < 7 || y < 4 || y > 66) b.set(s * 50, y, z, P.plate);
    }
    // 高大装填装置
    for (let z = -156; z <= 150; z += 32) {
      const x = s * 43;
      b.box(x - 5, 2, z - 7, x + 5, 56, z + 7, P.deep, 0, 0, true);
      b.box(x - 3, 4, z - 5, x + 3, 54, z + 5, P.hull, 0, 0, true);
      b.box(x - 1, 6, z - 2, x + 1, 52, z + 2, (z / 32) % 2 ? P.amber : P.cyan, 0.55);
      for (let y = 12; y <= 48; y += 12) b.box(x - 5, y, z - 8, x + 5, y, z + 8, P.plate);
    }
  }
  // 粗大框架跨间
  for (const z of [-150, -80, -10, 60, 130]) {
    b.box(-50, 1, z - 3, -36, 69, z + 3, P.hull, 0, 0, true);
    b.box(36, 1, z - 3, 50, 69, z + 3, P.hull, 0, 0, true);
    b.box(-50, 60, z - 3, 50, 69, z + 3, P.hull, 0, 0, true);
    b.box(-50, 1, z - 3, 50, 6, z + 3, P.deep, 0, 0, true);
    b.set(-36, 40, z, P.cyan, 0.5); b.set(36, 40, z, P.cyan, 0.5);
    b.box(-20, 63, z - 2, 20, 66, z + 2, P.plate, 0, 0, true);
  }
  // 尽头宽阔发光腔口
  b.box(-60, -4, 178, 60, 74, 182, P.hull, 0, 0, true);
  b.carve(-44, 4, 177, 44, 66, 183);
  for (let x = -48; x <= 48; x += 6) { b.box(x, 66, 178, x + 3, 72, 182, P.edge); b.box(x, -2, 178, x + 3, 4, 182, P.edge); }
  b.box(-40, 8, 182, 40, 62, 183, P.cyan, 0.85);
  b.box(-16, 20, 184, 16, 50, 185, P.amber, 1.0);
  SF.interGeo.corridorShell = b.build();

  // 悬置导能构件（缓慢移动）
  const cb = new SF.VoxelBuilder(308);
  cb.box(-6, -3, -10, 6, 3, 10, P.plate, 0, 0, true);
  cb.box(-4, -1, -8, 4, 1, 8, P.cyan, 0.55);
  SF.interGeo.conduit = cb.build();
  // 抽象机械臂
  const ab = new SF.VoxelBuilder(309);
  ab.box(-2, 0, -3, 2, 18, 3, P.hull);
  ab.box(-3, 18, -4, 3, 22, 4, P.plate);
  ab.set(0, 22, 0, P.amber, 0.6);
  SF.interGeo.arm = ab.build();
  // 能量光块
  const eb = new SF.VoxelBuilder(310);
  eb.box(-1, -1, -1, 1, 1, 1, P.cyan, 1.1);
  SF.interGeo.energyBlock = eb.build();
};