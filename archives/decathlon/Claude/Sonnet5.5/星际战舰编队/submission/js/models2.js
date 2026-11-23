'use strict';
var WK_MAIN = [[-546, 54], [-530, 70], [-500, 94], [-440, 118], [-380, 132], [-250, 146], [-100, 148], [20, 140], [112, 124], [130, 112]];

// ---------- 旗舰：背脊、上层体块、舰桥塔 ----------
function flagshipUpper(g, meta, rng) {
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GC = M.GC, GCs = M.GCs, T0 = M.T0, TA = M.TA;
  // 背脊：断续的阶梯脊
  for (var i = 0; i < 8; i++) {
    var x0 = -520 + i * 60, hh = 64 + (i % 3) * 5 + (i === 4 ? 4 : 0);
    g.box(x0, x0 + 50, 56, hh, -17, 17, H);
    g.box(x0 + 6, x0 + 44, hh, hh + 3, -10, 10, D2);
    g.box(x0 + 50, x0 + 60, 56, 60, -9, 9, D0);
    g.box(x0 + 8, x0 + 42, hh - 2, hh, -18, -17, GCs); g.box(x0 + 8, x0 + 42, hh - 2, hh, 17, 18, GCs);
  }
  // 尾部塔群：三层阶梯
  g.box(-472, -350, 56, 80, -48, 48, H);
  g.box(-470, -352, 80, 98, -36, 36, H);
  g.box(-460, -362, 98, 110, -22, 22, H);
  g.box(-448, -374, 110, 114, -12, 12, D1);
  g.box(-472, -350, 74, 78, -49, 49, D1);
  g.box(-470, -352, 94, 96, -37, 37, D1);
  for (var k = -3; k <= 3; k++) g.box(-466, -356, 60, 70, k * 13 - 3, k * 13 + 3, D2);
  g.box(-412, -408, 114, 142, -2, 2, ME); g.box(-413, -407, 140, 143, -3, 3, GC);
  [-1, 1].forEach(function (s) { g.box(-400, -397, 98, 124, s * 22 - 1, s * 22 + 2, ME); g.box(-401, -396, 123, 126, s * 22 - 2, s * 22 + 3, GCs); });
  // 中段塔：错落体块
  g.box(-300, -186, 56, 76, -56, 56, H);
  g.box(-290, -196, 76, 90, -40, 40, H);
  g.box(-282, -226, 90, 102, -26, 26, D2);
  g.box(-300, -186, 70, 73, -57, 57, D1);
  g.box(-270, -240, 102, 106, -14, 14, H);
  [-1, 1].forEach(function (s) { for (var q = 0; q < 4; q++) g.box(-290 + q * 24, -284 + q * 24, 76, 84, s * 46 - 2, s * 46 + 3, ME); });
  // 中央甲板
  g.box(-176, 40, 56, 62, -46, 46, H);
  g.box(-170, 34, 62, 66, -30, 30, D0);
  for (var q2 = 0; q2 < 6; q2++) g.box(-160 + q2 * 32, -146 + q2 * 32, 66, 71 + (q2 % 2) * 3, -22, 22, q2 % 2 ? D2 : H);
  // 贯通的拱形空隙：塔群下方露出能看穿的通道，框边有冷光
  g.box(-262, -232, 58, 72, -70, 70, 0);
  g.box(-264, -230, 71, 73, -58, 58, D1); g.box(-262, -232, 72, 73, -56, 56, GCs);
  g.box(-424, -396, 58, 70, -60, 60, 0);
  g.box(-426, -394, 69, 71, -52, 52, D1); g.box(-424, -396, 70, 71, -50, 50, GCs);
  [-232, -262].forEach(function (ax) { g.box(ax - 1, ax + 1, 57, 59, -56, 56, GCs); });
  // 半透明的传感圆罩（与体素同格距）
  [[-380, 116, 24], [-380, 116, -24], [-250, 108, 0]].forEach(function (d) { g.sphere(d[0], d[1], d[2], 5, M.XC); g.sphere(d[0], d[1], d[2], 2, M.GC); });
  // ===== 舰桥塔 =====
  g.box(108, 218, 38, 58, -102, 102, H);
  g.box(108, 218, 38, 44, -102, 102, D1);
  g.box(214, 226, 44, 58, -80, 80, D0);
  g.box(44, 206, 56, 100, -78, 78, H);
  g.box(48, 204, 100, 132, -74, 74, H);
  g.box(54, 200, 132, 150, -66, 66, H);
  g.box(64, 190, 150, 160, -52, 52, D2);
  g.box(80, 170, 160, 166, -34, 34, H);
  g.box(100, 150, 166, 170, -16, 16, D1);
  g.box(194, 230, 126, 134, -70, 70, H); g.box(194, 232, 134, 138, -62, 62, D0);
  g.boxS(60, 200, 108, 112, 66, 82, D0);
  g.boxS(46, 206, 58, 62, 78, 90, H);
  g.box(44, 206, 98, 101, -80, 80, D1);
  g.boxS(44, 206, 120, 122, 74, 76, GCs);
  g.boxS(50, 200, 146, 148, 66, 68, GC);
  // 大厅挖空
  g.box(64, 194, 70, 130, -65, 65, 0);
  // 前方观景开口
  g.box(190, 232, 78, 126, -56, 56, 0);
  g.box(194, 206, 130, 138, -56, 56, H);
  [-1, 1].forEach(function (s) {
    g.box(194, 206, 78, 126, s > 0 ? 56 : -65, s > 0 ? 65 : -56, H);
    g.box(206, 214, 70, 130, s > 0 ? 56 : -60, s > 0 ? 60 : -56, D2);
    g.box(194, 202, 78, 126, s > 0 ? 36 : -40, s > 0 ? 40 : -36, D0);
    g.box(194, 202, 78, 126, s > 0 ? 36 : -37, s > 0 ? 37 : -36, GCs);
  });
  g.box(194, 206, 126, 131, -56, 56, D2);
  g.box(194, 206, 70, 78, -56, 56, D0);
  g.box(194, 204, 77, 79, -56, 56, GC);
  g.box(194, 204, 125, 127, -56, 56, GCs);
  [[70, 163, 46], [70, 163, -46], [184, 163, 46], [184, 163, -46]].forEach(function (d) { g.sphere(d[0], d[1], d[2], 4, M.XC); g.sphere(d[0], d[1], d[2], 1.6, M.GC); });
  meta.bridge = { x0: 64, x1: 194, z0: -65, z1: 65, y0: 70, y1: 130, frontX: 194 };
}

// ---------- 旗舰：机库（左右各一） ----------
function flagshipHangar(g, meta, rng) {
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, MS = M.MS, GC = M.GC, GCs = M.GCs, GA = M.GA, GW = M.GW, F0 = M.F0, F1 = M.F1, F2 = M.F2, T0 = M.T0;
  var hx0 = -300, hx1 = 66, hy0 = -36, hy1 = 26, hz0 = 16, hz1 = 112;
  [1, -1].forEach(function (sg) {
    function bz(a, b) { return sg > 0 ? [a, b] : [-b, -a]; }
    function B(x0, x1, y0, y1, za, zb, m) { var z = bz(za, zb); g.box(x0, x1, y0, y1, z[0], z[1], m); }
    B(hx0, hx1, hy0, hy1, hz0, hz1, 0);
    B(-86, hx1 + 4, -32, 22, hz1 - 1, 160, 0);
    B(-90, hx1 + 6, 22, 30, hz1 - 2, 152, D0);
    B(-90, hx1 + 6, -36, -32, hz1 - 2, 152, D1);
    B(-92, -86, -36, 30, hz1 - 2, 150, D2);
    B(hx1 - 4, hx1 + 6, -36, 30, hz1, 150, D0);
    B(-90, hx1 + 6, 30, 31, 112, 152, GCs);
    // 舷侧口前端的收口墙：肋板、深槽与琥珀导引灯
    for (var fz = 116; fz < 148; fz += 8) { B(hx1 - 8, hx1 - 4, -30, 20, fz, fz + 4, F2); B(hx1 - 9, hx1 - 8, -26, 16, fz + 1, fz + 3, D1); }
    B(hx1 - 9, hx1 - 8, -32, 24, 129, 131, GA);
    B(hx1 - 9, hx1 - 8, -4, -2, 112, 150, GCs);
    B(hx1 - 9, hx1 - 8, 12, 14, 112, 150, GCs);
    // 口沿下的阶面踏板
    B(-86, hx1 + 4, -36, -34, 150, 158, D2);
    // 地板与导引光
    B(hx0, hx1, hy0 - 3, hy0, hz0, hz1, F1);
    for (var gx = hx0 + 6; gx < hx1; gx += 12) { B(gx, gx + 6, hy0, hy0 + 1, 44, 46, GC); B(gx, gx + 6, hy0, hy0 + 1, 86, 88, GC); }
    B(hx0 + 10, hx1 - 6, hy0, hy0 + 1, 64, 68, F2);
    for (var gx2 = hx0 + 18; gx2 < hx1 - 20; gx2 += 26) B(gx2, gx2 + 10, hy0, hy0 + 1, 65, 67, GA);
    // 顶部梁架与灯带
    for (var bx = hx0 + 6; bx < hx1; bx += 24) B(bx, bx + 8, hy1 - 6, hy1, hz0, hz1, D0);
    B(hx0, hx1, hy1 - 2, hy1, 38, 42, GW); B(hx0, hx1, hy1 - 2, hy1, 86, 90, GW);
    B(hx0, hx1, hy1 - 8, hy1 - 6, hz0, hz1, F2);
    // 内侧泊位凹槽
    for (var px = hx0 + 14; px < hx1 - 20; px += 40) {
      B(px, px + 30, hy0, hy0 + 20, hz0 - 12, hz0, 0);
      B(px, px + 30, hy0, hy0 + 20, hz0 - 14, hz0 - 12, D1);
      B(px + 4, px + 26, hy0 + 18, hy0 + 20, hz0 - 11, hz0 - 10, GC);
      B(px - 2, px + 32, hy0 + 20, hy0 + 24, hz0 - 12, hz0 + 2, D0);
      B(px - 2, px, hy0, hy0 + 24, hz0 - 12, hz0 + 4, F2);
      B(px + 30, px + 32, hy0, hy0 + 24, hz0 - 12, hz0 + 4, F2);
    }
    // 外侧泊位（封闭段）
    for (var ox = hx0 + 14; ox < -100; ox += 40) {
      B(ox, ox + 30, hy0, hy0 + 20, hz1, hz1 + 16, 0);
      B(ox, ox + 30, hy0, hy0 + 20, hz1 + 16, hz1 + 18, D1);
      B(ox + 4, ox + 26, hy0 + 18, hy0 + 20, hz1 + 15, hz1 + 16, GCs);
      B(ox - 2, ox + 32, hy0 + 20, hy0 + 24, hz1 - 2, hz1 + 16, D0);
    }
    // 跨舱桥架
    [-270, -200, -128, -40].forEach(function (cx, ci) {
      B(cx, cx + 10, hy1 - 18, hy1 - 12, hz0, hz1, D0);
      B(cx + 2, cx + 8, hy1 - 12, hy1 - 6, hz0 + 4, hz1 - 4, F2);
      B(cx, cx + 10, hy1 - 22, hy1 - 12, hz0, hz0 + 6, D2); B(cx, cx + 10, hy1 - 22, hy1 - 12, hz1 - 6, hz1, D2);
      B(cx + 3, cx + 7, hy1 - 14, hy1 - 12, hz0 + 6, hz1 - 6, GCs);
      var zc = (ci % 2) ? 40 : 88;
      B(cx + 3, cx + 7, hy1 - 34, hy1 - 18, zc - 2, zc + 2, MS);
      B(cx, cx + 10, hy1 - 38, hy1 - 34, zc - 8, zc + 8, D2);
      B(cx + 2, cx + 8, hy1 - 36, hy1 - 35, zc - 6, zc + 6, GA);
    });
    // 侧边伸出的维修构架
    [-236, -164, -84].forEach(function (ax) {
      B(ax, ax + 4, hy0 + 14, hy0 + 18, hz0, hz0 + 26, MS);
      B(ax, ax + 4, hy0 + 14, hy0 + 40, hz0 + 22, hz0 + 26, MS);
      B(ax - 3, ax + 7, hy0 + 40, hy0 + 44, hz0 + 18, hz0 + 34, D2);
      B(ax - 1, ax + 5, hy0 + 41, hy0 + 42, hz0 + 22, hz0 + 32, GA);
    });
    // 第二重舱口 x=-150
    B(-154, -146, hy0, hy1, hz0, hz1, D0);
    B(-154, -146, hy0 + 2, hy1 - 8, 38, 92, 0);
    B(-156, -144, hy1 - 8, hy1 - 6, 36, 94, D2);
    B(-157, -143, hy0 + 2, hy0 + 8, 34, 38, D2); B(-157, -143, hy0 + 2, hy0 + 8, 92, 96, D2);
    B(-156, -146, hy1 - 9, hy1 - 8, 38, 92, GA);
    B(-155, -153, hy0 + 2, hy1 - 9, 37, 38, GA); B(-155, -153, hy0 + 2, hy1 - 9, 92, 93, GA);
    // 远端：气闸舱 + 发光大门
    B(hx0 - 40, hx0 + 4, hy0 + 2, hy1 - 14, 42, 94, 0);
    B(hx0 - 44, hx0 - 38, hy0, hy1 - 10, 36, 100, F1);
    B(hx0 - 42, hx0 - 38, hy0 + 4, hy1 - 16, 46, 90, GW);
    B(hx0 - 40, hx0 - 6, hy0 + 3, hy1 - 15, 42, 44, GW); B(hx0 - 40, hx0 - 6, hy0 + 3, hy1 - 15, 92, 94, GW);
    B(hx0 - 40, hx0 - 6, hy0 + 2, hy0 + 3, 44, 92, GC);
    B(hx0 - 40, hx0 - 8, hy0 + 2, hy0 + 3, 42, 94, GC);
    B(hx0 - 40, hx0 - 8, hy1 - 15, hy1 - 14, 42, 94, GC);
    B(hx0, hx0 + 4, hy0, hy1, hz0, 42, D0); B(hx0, hx0 + 4, hy0, hy1, 94, hz1, D0);
    B(hx0, hx0 + 4, hy1 - 14, hy1, 42, 94, D0);
    B(hx0 + 4, hx0 + 8, hy0, hy1 - 14, 40, 41, GCs); B(hx0 + 4, hx0 + 8, hy0, hy1 - 14, 95, 96, GCs);
    B(hx0 + 4, hx0 + 8, hy1 - 14, hy1 - 12, 40, 96, GA);
    for (var wx = hx0 + 10; wx < hx1; wx += 18) {
      B(wx, wx + 2, hy0 + 20, hy1 - 8, hz0, hz0 + 1, F0);
      if (wx < -92) B(wx, wx + 2, hy0 + 2, hy1 - 8, hz1 - 1, hz1, F0);
    }
    meta['hangar' + (sg > 0 ? 'P' : 'N')] = { x0: hx0, x1: hx1, y0: hy0, y1: hy1, z0: sg * hz0, z1: sg * hz1 };
  });
}

// ---------- 旗舰：腹部 ----------
function flagshipBelly(g, meta, rng) {
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, GCs = M.GCs;
  g.box(-440, 100, -72, -64, -12, 12, D0);
  for (var x = -430; x < 80; x += 36) {
    g.boxS(x, x + 8, -76, -64, 30, 36, H);
    g.box(x, x + 8, -80, -76, -36, 36, D2);
    g.box(x + 2, x + 6, -81, -80, -34, 34, GCs);
    g.boxS(x + 18, x + 22, -72, -64, 6, 40, D1);
  }
  g.box(-420, 80, -66, -64, -40, 40, D1);
  g.boxS(-440, 90, -52, -49, 38, 41, D1);
  g.boxS(-440, 90, -50, -49, 40, 41, GCs);
  for (var fx = -310; fx < -20; fx += 7) {
    var span = 40 + Math.floor(hash1(fx * 0.1) * 30);
    g.boxS(fx, fx + 2, -30, -16, 122, 122 + span, D2);
  }
  for (var rx = 130; rx < 400; rx += 30) g.boxS(rx, rx + 8, -50, -38, 24, 36, H);
  g.boxS(-86, 70, -40, -36, 150, 170, H);
  g.boxS(-86, 70, -40, -39, 148, 150, D0);
  g.boxS(-86, 70, -41, -40, 150, 170, GCs);
}

// ---------- 旗舰：表面细节 ----------
function flagshipGreeble(g, meta, rng) {
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, GCs = M.GCs, T0 = M.T0, TA = M.TA;
  var hm = heightMap(g), nx = g.nx;
  function hAt(x, z) { return hm[(x - g.ox) + nx * (z - g.oz)]; }
  var placed = 0;
  for (var i = 0; i < 9000 && placed < 1400; i++) {
    var x = Math.floor(rng.range(-520, 520)), z = Math.floor(rng.range(-150, 150));
    var sx = rng.int(6, 24), sz = rng.int(5, 18);
    var h0 = hAt(x, z);
    if (h0 < 20) continue;
    var flat = true;
    for (var a = 0; a <= sx && flat; a += 4) for (var b = 0; b <= sz; b += 4) { if (hAt(x + a, z + b) !== h0) { flat = false; break; } }
    if (!flat) continue;
    if (h0 < 30 && Math.abs(z) > 96) continue;
    var kind = rng.next();
    if (kind < 0.45) {
      g.box(x + 1, x + sx - 1, h0 + 1, h0 + 2, z + 1, z + sz - 1, rng.next() < 0.3 ? M.H2 : H);
      if (sx > 10 && sz > 8) g.box(x + 3, x + sx - 3, h0 + 2, h0 + 3, z + 3, z + sz - 3, M.H1);
    } else if (kind < 0.7) {
      for (var q = 0; q < sx - 2; q += 3) g.box(x + q, x + q + 2, h0, h0 + 1, z + 1, z + sz - 1, D1);
    } else if (kind < 0.85) {
      g.box(x + 1, x + 4, h0 + 1, h0 + 4, z + 1, z + 4, D2);
      g.box(x + 2, x + 3, h0 + 4, h0 + 5, z + 2, z + 3, rng.next() < 0.5 ? GCs : TA);
    } else {
      g.box(x + 1, x + sx - 1, h0 - 1, h0, z + 1, z + sz - 1, D1);
    }
    placed++;
  }
  // 主壳侧面肋架（避开机库口）
  for (var rx = -500; rx < 100; rx += 24) {
    var w2 = qz(lerpKeys(WK_MAIN, rx), 4);
    var inMouth = (rx > -98 && rx < 70);
    [-1, 1].forEach(function (s) {
      if (s > 0 && inMouth) return;
      g.box(rx, rx + 8, -20, 22, s > 0 ? w2 - 1 : -w2 - 4, s > 0 ? w2 + 4 : -w2 + 1, M.H2);
      g.box(rx + 1, rx + 7, 22, 24, s > 0 ? w2 - 1 : -w2 - 3, s > 0 ? w2 + 3 : -w2 + 1, M.D0);
      g.box(rx + 12, rx + 20, -18, 20, s > 0 ? w2 - 3 : -w2 - 1, s > 0 ? w2 : -w2 + 3, M.D1);
      g.box(rx + 13, rx + 19, -4, -2, s > 0 ? w2 - 3 : -w2 - 1, s > 0 ? w2 - 2 : -w2, M.GCs);
    });
  }
  // 青色涂装带
  for (var bx = -490; bx < 110; bx++) {
    var wl = qz(lerpKeys(WK_MAIN, bx) * 0.80, 4);
    g.box(bx, bx + 1, 28, 33, wl - 1, wl, T0); g.box(bx, bx + 1, 28, 33, -wl, -wl + 1, T0);
    if (bx % 40 < 3) { g.box(bx, bx + 1, 33, 40, wl - 2, wl, TA); g.box(bx, bx + 1, 33, 40, -wl, -wl + 2, TA); }
  }
  // 炮位底座
  var mounts = [];
  [-330, -250, -170, -90, -10, 70].forEach(function (x) {
    [-1, 1].forEach(function (s) {
      var z = s * 100;
      addTurretBase(g, x, 42, z, 1.15);
      mounts.push({ p: [x + 0.5, 48, z + 0.5], side: s, idx: mounts.length });
    });
  });
  meta.turretMounts = mounts;
  for (var cx = 170; cx < 500; cx += 34) { g.boxS(cx, cx + 22, 38, 39, 52, 53, GCs); }
  // 板片调色
  g.plates([M.H0], [M.H0, M.H0, M.H1, M.H2, M.H0, M.H1], 34, 5);
}

// ---------- 旗舰：叉臂外侧装甲板片、肋与槽带 ----------
function flagshipProngDetail(g, meta, rng) {
  var H = M.H0, H1 = M.H1, H2 = M.H2, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GCs = M.GCs, GC = M.GC, T0 = M.T0, TA = M.TA;
  function zoAt(x) { var t = (x - 112) / 456; return qz(124 - 62 * Math.pow(Math.max(0, Math.min(1, t)), 0.9), 4); }
  // 外侧装甲板：一块块凸起的壳片，板间留深槽
  var px = 126;
  var seq = 0;
  while (px < 500) {
    var len = 26 + Math.floor(hash1(px * 0.37) * 30);
    var x1 = Math.min(px + len, 520);
    var lift = 2 + (seq % 3);
    var y0 = -6 - (seq % 2) * 3, y1 = 16 + ((seq + 1) % 3) * 3;
    for (var x = px + 2; x < x1 - 1; x++) {
      var zo = zoAt(x);
      g.boxS(x, x + 1, y0, y1, zo - 1, zo + lift, seq % 4 === 0 ? H2 : (seq % 3 === 0 ? H1 : H));
      g.boxS(x, x + 1, y0, y0 + 1, zo + lift - 1, zo + lift, D2);
      if (seq % 2 === 0) g.boxS(x, x + 1, y0 + 4, y0 + 5, zo + lift - 1, zo + lift, D1);
    }
    // 板间深槽
    for (var gx = x1 - 1; gx < x1 + 2; gx++) { var zg = zoAt(gx); g.boxS(gx, gx + 1, -12, 20, zg - 2, zg + 1, D1); }
    // 槽内的发光细线与连接梁
    var zg2 = zoAt(x1); g.boxS(x1 - 1, x1 + 1, -4, -2, zg2 - 2, zg2 - 1, GCs);
    g.boxS(x1 - 2, x1 + 2, 8, 12, zg2 - 2, zg2 + 3, MS_());
    px = x1 + 3; seq++;
  }
  // 竖向肋与通风槽阵
  for (var rx = 140; rx < 510; rx += 34) {
    var zr = zoAt(rx);
    g.boxS(rx, rx + 5, -16, 24, zr + 1, zr + 5, D0);
    g.boxS(rx + 1, rx + 4, -16, 24, zr + 5, zr + 6, ME);
    for (var vy = -2; vy < 14; vy += 4) g.boxS(rx + 9, rx + 22, vy, vy + 2, zr + 0, zr + 1, D1);
  }
  // 青色涂装带：沿叉臂外侧，断续
  for (var tx = 130; tx < 520; tx++) {
    if ((tx - 130) % 46 > 34) continue;
    var zt = zoAt(tx);
    g.boxS(tx, tx + 1, 20, 23, zt - 1, zt + 1, T0);
  }
  // 内侧与上冠：发光缝加强
  for (var cx = 150; cx < 510; cx += 18) { g.boxS(cx, cx + 8, 24, 25, zoAt(cx) - 18, zoAt(cx) - 17, GCs); }
  // 下缘斜裙板
  for (var sx = 124; sx < 520; sx += 2) { var zs = zoAt(sx); g.boxS(sx, sx + 2, -40, -36, zs - 8 - ((sx / 2) % 2), zs - 4, D2); }
}
function MS_() { return M.MS; }
