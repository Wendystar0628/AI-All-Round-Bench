'use strict';
// ---------- 近卫舰：紧凑厚实，短叉，密集近防炮 ----------
function buildEscortClose(variant) {
  var g = new Grid(-104, 104, -34, 52, -56, 56);
  var rng = new RNG(900 + variant * 31);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GC = M.GC, GCs = M.GCs, T0 = M.T0, TA = M.TA;
  var meta = { noz: [], pd: [], variant: variant };
  // 主体三层
  for (var x = -82; x < 66; x++) {
    var fr = x > 30 ? (x - 30) / 36 : 0;
    var wmid = qz(30 - 14 * fr, 2), wlow = qz(23 - 8 * fr, 2), wup = qz(21 - 7 * fr, 2);
    g.box(x, x + 1, -17, -7, -wlow, wlow, M.D1);
    g.box(x, x + 1, -7, 14, -wmid, wmid, H);
    if (x < 44) g.box(x, x + 1, 14, 25, -wup, wup, H);
    if (x > -66 && x < 8) g.box(x, x + 1, 25, 34, -10, 10, H);
  }
  g.box(-88, -80, -12, 12, -20, 20, D2);
  // 后部台阶
  g.box(-92, -82, -9, 9, -16, 16, D1);
  // 短翼（两层，错位）
  for (var z = 26; z < 50; z++) {
    var dz = z - 26;
    g.boxS(Math.round(-66 + dz * -0.3), Math.round(14 - dz * 0.9), -5, 4, z, z + 1, H);
    if (z < 42) g.boxS(Math.round(-54 + dz * -0.3), Math.round(2 - dz * 0.8), 4, 10, z, z + 1, H);
  }
  g.boxS(-44, 8, -5, 4, 49, 50, M.GCs);
  // 翼下梳齿
  for (var fx = -60; fx < -4; fx += 6) g.boxS(fx, fx + 2, -12, -5, 30, 44, D2);
  // 短叉鼻
  g.boxS(60, 100, -5, 10, 9, 18, H);
  g.boxS(76, 100, -5, -1, 9, 18, D1);
  for (var tx = 84; tx < 102; tx++) g.boxS(tx, tx + 1, -5 + Math.floor((tx - 84) * 0.2), 10 - Math.floor((tx - 84) * 0.45), 9, 18 - Math.floor((tx - 84) * 0.45), H);
  g.box(64, 94, 1, 3, -7, 7, GCs);
  g.box(60, 70, -8, 14, -9, 9, 0);
  g.box(60, 70, -8, 0, -9, 9, D0);
  g.box(60, 70, 0, 2, -9, 9, GC);
  // 背部叠层与深槽
  g.box(-70, 40, 22, 24, -22, 22, D1);
  g.boxS(-60, 36, 24, 26, 10, 22, T0);
  for (var q = -60; q < 30; q += 16) g.boxS(q, q + 8, 25, 27, 4, 21, M.H2);
  g.boxS(-70, 40, 13, 15, 29, 31, D1);
  g.boxS(-70, 40, 6, 7, 29, 30, GCs);
  g.sphere(-30, 37, 0, 4, M.XC); g.sphere(-30, 37, 0, 1.6, M.GC);
  g.sphere(-66, 29, 0, 3, M.XC); g.sphere(-66, 29, 0, 1.2, M.GCs);
  // 炮座（近防炮 ×6）
  var mounts = [[-48, 25, 15], [-6, 25, 15], [-30, 14, 28], [26, 14, 24], [-66, 14, 20], [8, 25, 18]];
  mounts = [[-46, 25, 15], [-4, 25, 15], [-24, 14, 29], [28, 14, 24], [-62, 14, 23], [18, 25, 15]];
  mounts.forEach(function (m, i) {
    [-1, 1].forEach(function (s) {
      var px = m[0], py = m[1], pz = s * m[2];
      addTurretBase(g, px, py, pz, 0.78);
      meta.pd.push({ p: [px + 0.5, py + 6, pz + 0.5], side: s });
    });
  });
  // 喷口
  meta.noz.push(addNozzle(g, -104, 4, 0, 9));
  [-1, 1].forEach(function (s) { meta.noz.push(addNozzle(g, -92, -2, s * 22, 6)); });
  g.plates([M.H0], [M.H0, M.H0, M.H1, M.H2], 22, 11 + variant);
  return { g: g, meta: meta };
}

// ---------- 前卫舰：舒展、长叉、外伸导弹吊舱 ----------
function buildVanguard(variant) {
  var g = new Grid(-116, 120, -26, 36, -76, 76);
  var rng = new RNG(1500 + variant * 17);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GC = M.GC, GCs = M.GCs, GA = M.GA, T0 = M.T0, TA = M.TA;
  var meta = { noz: [], rack: [], variant: variant };
  // 中央主脊
  for (var x = -96; x < 56; x++) {
    var tail = x < -70 ? (x + 96) / 26 : 1;
    var w = qz(9 + 5 * Math.sin((x + 96) / 152 * Math.PI) * 1.0, 1);
    g.box(x, x + 1, -8, 10, -w, w, H);
    if (x > -60 && x < 36) g.box(x, x + 1, 10, 17 + ((x % 24 < 14) ? 2 : 0), -6, 6, H);
  }
  g.box(-100, -90, -7, 9, -12, 12, D2);
  g.box(-30, 34, -12, -8, -14, 14, D1);
  // 前向长叉：自叉根向外微张
  for (var fx = 36; fx < 116; fx++) {
    var t = (fx - 36) / 80;
    var zc = Math.round(8 + 18 * t * t + 4 * t), hw = Math.max(2, Math.round(6 - 3.5 * t));
    var y0 = -5 + Math.floor(t * 3), y1 = 8 - Math.floor(t * 5);
    g.boxS(fx, fx + 1, y0, y1, zc - hw, zc + hw, H);
    if (fx % 16 < 3) g.boxS(fx, fx + 1, y0, y1 + 2, zc - hw - 1, zc + hw + 1, D1);
  }
  g.box(36, 112, 1, 3, -1, 2, GC);
  g.box(54, 100, -3, 0, -2, 3, D1);
  g.sphere(70, 3, 0, 3.5, M.XC); g.sphere(70, 3, 0, 1.4, M.GW);
  g.boxS(40, 112, 3, 4, 10, 12, GCs);
  // 三道系梁连接吊舱
  [-52, 0, 48].forEach(function (cx, ci) {
    g.boxS(cx, cx + 10, -4, 6, 14, 40, H);
    g.boxS(cx + 1, cx + 9, 6, 8, 14, 38, D2);
    g.boxS(cx + 3, cx + 7, -6, -4, 14, 40, D1);
  });
  // 吊舱 ×2
  [-1, 1].forEach(function (s) {
    function Z(a, b) { return s > 0 ? [a, b] : [-b, -a]; }
    function B(x0, x1, y0, y1, a, b, m) { var zz = Z(a, b); g.box(x0, x1, y0, y1, zz[0], zz[1], m); }
    B(-76, 62, -9, 9, 36, 58, H);
    for (var nx = 62; nx < 90; nx++) { var tt = (nx - 62) / 28; B(nx, nx + 1, -9 + Math.floor(tt * 6), 9 - Math.floor(tt * 6), 36 + Math.round(tt * 8), 58 - Math.round(tt * 10), H); }
    B(-80, -76, -7, 7, 38, 56, D2);
    B(-76, 60, -9, -6, 36, 58, D1);
    B(-70, 58, 9, 11, 34, 60, D0);              // 顶盖沿
    B(-70, 58, 9, 10, 33, 34, T0); B(-70, 58, 9, 10, 60, 61, T0);
    // 导弹槽列：2 行 × 8 列
    for (var k = 0; k < 8; k++) {
      var sx0 = -62 + k * 15;
      [[38, 46], [48, 56]].forEach(function (r, ri) {
        B(sx0, sx0 + 11, 4, 11, r[0], r[1], 0);
        B(sx0 - 1, sx0 + 12, 3, 4, r[0] - 1, r[1] + 1, D1);
        // 内部导弹（发光头，分组 1..4）
        var gz = s > 0 ? (r[0] + r[1]) / 2 : -(r[0] + r[1]) / 2;
        B(sx0 + 1, sx0 + 8, 5, 7, r[0] + 3, r[1] - 3, ME);
        B(sx0 + 8, sx0 + 10, 5, 7, r[0] + 3, r[1] - 3, GA);
        meta.rack.push({ col: k, row: ri, side: s, p: [sx0 + 5, 7, gz] });
      });
      B(sx0 + 11, sx0 + 15, 9, 11, 34, 60, k % 2 ? D2 : H);
    }
    // 吊舱尾喷
    meta.noz.push(addNozzle(g, -96, 0, s * 47, 7));
    // 外缘亮边
    B(-66, 56, 0, 1, 58, 59, GCs);
    B(-60, 50, -9, -8, 36, 58, T0);
  });
  meta.noz.push(addNozzle(g, -116, 0, 0, 8));
  // 导弹分组（用于发射后隐藏）
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  for (var zq = -60; zq < 61; zq++) for (var yq = 4; yq < 9; yq++) for (var xq = -62; xq < 56; xq++) {
    if (!g.inb(xq, yq, zq)) continue;
    var ii = g.idx(xq, yq, zq), mm = g.data[ii];
    if (mm !== M.ME && mm !== M.GA) continue;
    var col = Math.floor((xq + 62) / 15);
    if (col < 0 || col > 7) continue;
    grp[ii] = 1 + (col >> 1);
  }
  g.plates([M.H0], [M.H0, M.H0, M.H1, M.H2], 20, 21 + variant);
  return { g: g, meta: meta };
}

// ---------- 小艇：前叉、主体、喷口 ----------
function buildCraft(variant) {
  var g = new Grid(-20, 20, -8, 12, -16, 16);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GC = M.GC, GCs = M.GCs, GA = M.GA, T0 = M.T0;
  g.box(-12, 8, -2, 3, -3, 3, H);
  g.box(-11, -1, 3, 5, -2, 2, H);
  g.box(-1, 6, 3, 5, -2, 2, M.XC);         // 半透明座舱罩
  g.box(-1, 5, 2, 3, -1, 1, M.GCs);
  g.box(1, 4, 5, 6, -1, 1, M.GCs);
  g.boxS(8, 15, -1, 2, 1, 3, H);           // 前叉
  g.box(8, 13, 0, 1, -1, 1, GC);
  for (var z = 3; z < 12; z++) { var dz = z - 3; g.boxS(-9 - Math.floor(dz * 0.5), 3 - Math.floor(dz * 0.4), -1, 1, z, z + 1, H); }
  g.boxS(-8, 2, 1, 2, 3, 8, T0);
  g.boxS(-12, -6, -2, 0, 6, 9, D2);
  g.box(-12, -7, 3, 8, -1, 1, H);          // 尾鳍
  g.box(-13, -8, 7, 8, -1, 1, GCs);
  g.boxS(-6, 4, -3, -2, 2, 4, D1);
  var n = addNozzle(g, -17, 0, 0, 2.2, { len: 9 });
  g.boxS(-16, -12, -1, 1, 3, 4, D0);
  g.plates([M.H0], [M.H0, M.H1, M.H2], 7, 3 + variant);
  return { g: g, meta: { noz: [n] } };
}

// ---------- 炮台头部 ----------
function buildPDHead() {
  var g = new Grid(-8, 22, -6, 8, -9, 9);
  g.cylY(-2, 0, 0, 0, 4.5, M.D0);
  g.box(-4, 4, 0, 5, -4, 4, M.H0);
  g.box(-3, 3, 5, 7, -3, 3, M.D2);
  g.box(-5, -3, 1, 4, -3, 3, M.H2);
  g.boxS(2, 17, 1, 3, 1, 3, M.ME);        // 双管
  g.boxS(2, 6, 0, 4, 1, 3, M.D0);
  g.boxS(15, 18, 1, 3, 1, 3, M.GA);       // 炮口
  g.boxS(3, 8, 3, 4, 0, 1, M.GCs);
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  [15, 16, 17].forEach(function (x) { [1, 2].forEach(function (y) { [1, 2, -2, -3].forEach(function (z) { if (g.inb(x, y, z) && g.get(x, y, z) === M.GA) grp[g.idx(x, y, z)] = 1; }); }); });
  return g;
}
function buildPulseHead() {
  var g = new Grid(-12, 34, -8, 14, -14, 14);
  g.cylY(-3, 0, 0, 0, 7, M.D0);
  g.cylY(0, 2, 0, 0, 8.5, M.H2, 5);
  g.box(-7, 7, 0, 8, -7, 7, M.H0);
  g.box(-5, 5, 8, 11, -5, 5, M.D2);
  g.box(-8, -4, 1, 7, -5, 5, M.H1);
  g.boxS(6, 28, 2, 6, 2, 6, M.H0);
  g.boxS(6, 28, 3, 5, 3, 5, M.D1);
  [10, 18].forEach(function (x) { g.boxS(x, x + 3, 1, 7, 1, 7, M.ME); });
  g.boxS(25, 30, 2, 6, 2, 6, M.D0);
  g.boxS(28, 31, 3, 5, 3, 5, M.GC);
  g.boxS(30, 31, 3, 5, 3, 5, M.GW);
  g.boxS(7, 24, 6, 7, 3, 5, M.GCs);
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  for (var x = 6; x < 32; x++) for (var y = 2; y < 8; y++) for (var z = -6; z <= 6; z++) {
    if (!g.inb(x, y, z)) continue; var m = g.get(x, y, z);
    if (m === M.GC || m === M.GW) grp[g.idx(x, y, z)] = 1; else if (m === M.GCs) grp[g.idx(x, y, z)] = 2;
  }
  return g;
}
function buildFloatBase() {
  var g = new Grid(-14, 14, -12, 6, -14, 14);
  g.cylY(-4, 0, 0, 0, 11, M.D0);
  g.cylY(-4, -2, 0, 0, 11, M.H2, 7);
  g.cylY(0, 3, 0, 0, 8, M.H0);
  g.cylY(-6, -4, 0, 0, 7, M.D1);
  g.cylY(-9, -6, 0, 0, 4, M.D2);
  g.cylY(-10, -9, 0, 0, 3, M.GC);
  g.boxS(-12, 12, -3, -2, 8, 10, M.GCs);
  g.box(8, 12, -3, -2, -10, 10, M.GCs);
  g.box(-12, -8, -3, -2, -10, 10, M.GCs);
  return g;
}
function buildMissile() {
  var g = new Grid(-9, 9, -4, 4, -4, 4);
  g.box(-5, 4, -1, 1, -1, 1, M.ME);
  g.box(4, 6, -1, 1, -1, 1, M.GA);
  g.box(-2, 4, -1, 1, -1, 1, M.MS);
  g.box(-5, -2, -1, 1, -1, 1, M.D2);
  g.box(-5, -3, -3, 3, 0, 1, M.D1); g.box(-5, -3, 0, 1, -3, 3, M.D1);
  g.box(-7, -5, -1, 1, -1, 1, M.GA);
  return g;
}
