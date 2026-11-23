'use strict';
// ---------- 舰桥内部（雕刻在旗舰网格里）----------
function flagshipBridgeInterior(g, meta, rng) {
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, MS = M.MS, GC = M.GC, GCs = M.GCs, GA = M.GA, GW = M.GW;
  var F0 = M.F0, F1 = M.F1, F2 = M.F2, F3 = M.F3, W0 = M.W0, W1 = M.W1, P0 = M.P0, P1 = M.P1, P2 = M.P2;
  var x0 = 64, x1 = 194, y0 = 70, hy1 = 130;
  // 地面与导引光
  g.box(x0, x1, y0 - 3, y0, -65, 65, F1);
  g.box(x0, x1, y0 - 1, y0, -65, 65, F0);
  for (var z = -60; z <= 60; z += 12) g.box(x0 + 4, x1 - 6, y0 - 1, y0, z, z + 1, F2);
  for (var x = x0 + 8; x < x1 - 8; x += 14) g.box(x, x + 1, y0 - 1, y0, -62, 62, F2);
  // 通往中枢的导引光线
  [-1, 1].forEach(function (s) {
    for (var k = 0; k < 7; k++) g.box(166 - k * 8, 172 - k * 8, y0 - 1, y0, s * (36 - k * 4.5) - 1, s * (36 - k * 4.5) + 1, GCs);
  });
  g.box(150, 190, y0 - 1, y0, -1, 1, GC);
  // 中枢：层叠基座
  var hx = 124, hz = 0;
  g.cylY(y0, y0 + 3, hx, hz, 31, D2);
  g.cylY(y0 + 3, y0 + 6, hx, hz, 27, H);
  g.cylY(y0 + 6, y0 + 10, hx, hz, 23, D1);
  g.cylY(y0 + 9, y0 + 10, hx, hz, 24, GC, 22);
  g.cylY(y0 + 10, y0 + 14, hx, hz, 18, H);
  g.cylY(y0 + 14, y0 + 16, hx, hz, 19, D0);
  g.cylY(y0 + 14, y0 + 15, hx, hz, 19, GCs, 17);
  for (var a = 0; a < 8; a++) { var ang = a * Math.PI / 4, px = Math.round(hx + Math.cos(ang) * 28), pz = Math.round(hz + Math.sin(ang) * 28); g.box(px - 2, px + 2, y0 + 3, y0 + 8, pz - 2, pz + 2, MS); g.box(px - 1, px + 1, y0 + 8, y0 + 9, pz - 1, pz + 1, GA); }
  g.cylY(y0 + 16, y0 + 36, hx, hz, 4.5, GC);
  g.cylY(y0 + 16, y0 + 36, hx, hz, 2, GW);
  for (var qy = y0 + 18; qy < y0 + 36; qy += 6) g.cylY(qy, qy + 2, hx, hz, 7, D0, 4);
  // 悬起的显示结构：上下两只扁环 + 四根立柱
  g.cylY(y0 + 36, y0 + 39, hx, hz, 24, D0, 20);
  g.cylY(y0 + 38, y0 + 39, hx, hz, 24, GCs, 23);
  g.cylY(y0 + 50, y0 + 52, hx, hz, 26, D0, 22);
  g.cylY(y0 + 51, y0 + 52, hx, hz, 22, GC, 21);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
    g.box(hx + c[0] * 22 - 1, hx + c[0] * 22 + 2, y0 + 36, y0 + 52, hz + c[1] * 22 - 1, hz + c[1] * 22 + 2, MS);
    g.box(hx + c[0] * 22, hx + c[0] * 22 + 1, y0 + 38, y0 + 50, hz + c[1] * 22, hz + c[1] * 22 + 1, GC);
  });
  // 中枢与穹顶间的四根斜撑
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
    g.line([hx + c[0] * 26, y0 + 52, hz + c[1] * 26], [hx + c[0] * 44, hy1 - 6, hz + c[1] * 44], 2, D0);
    g.line([hx + c[0] * 26, y0 + 52, hz + c[1] * 26], [hx + c[0] * 44, hy1 - 6, hz + c[1] * 44], 0, GCs);
  });
  // 两侧三层控制平台（台阶式，朝中枢方向抬升）
  [-1, 1].forEach(function (s) {
    function Z(a, b) { return s > 0 ? [a, b] : [-b, -a]; }
    function B(xa, xb, ya, yb, za, zb, m) { var zz = Z(za, zb); g.box(xa, xb, ya, yb, zz[0], zz[1], m); }
    B(x0 + 8, x1 - 6, y0, y0 + 4, 32, 44, F2);
    B(x0 + 8, x1 - 6, y0, y0 + 8, 44, 54, F2);
    B(x0 + 8, x1 - 6, y0, y0 + 12, 54, 65, F1);
    B(x0 + 8, x1 - 6, y0 + 3, y0 + 4, 32, 33, GCs);
    B(x0 + 8, x1 - 6, y0 + 7, y0 + 8, 44, 45, GCs);
    B(x0 + 8, x1 - 6, y0 + 11, y0 + 12, 54, 55, GCs);
    // 台面上的成组控制台：每 14 格一台
    [[36, 42, 4], [47, 53, 8], [58, 64, 12]].forEach(function (tier, ti) {
      for (var cx = x0 + 14; cx < x1 - 14; cx += 14) {
        if (ti === 0 && cx > 108 && cx < 142) continue;
        var base = y0 + tier[2];
        B(cx, cx + 10, base, base + 5, tier[0], tier[1], D1);
        B(cx, cx + 10, base + 5, base + 6, tier[0] + 1, tier[1], D2);
        B(cx + 1, cx + 9, base + 5, base + 6, tier[0] + 2, tier[1] - 1, (cx / 14 + ti) % 3 === 0 ? P2 : P1);   // 发光界面
        B(cx + 1, cx + 9, base + 6, base + 11, tier[1] - 1, tier[1], D0);                  // 立起的屏
        B(cx + 2, cx + 8, base + 7, base + 10, tier[1] - 1, tier[1], (cx / 14 + ti) % 2 === 0 ? P1 : P0);
        B(cx + 3, cx + 7, base + 10, base + 11, tier[1] - 1, tier[1], GC);
      }
    });
    // 悬挂显示板与投影层（用大小不同的实体板悬在台面上方）
    [[84, 20, 12, 36, 104], [114, 14, 9, 44, 108], [146, 18, 11, 40, 106], [170, 12, 8, 50, 110]].forEach(function (d, di) {
      B(d[0], d[0] + d[1], d[4], d[4] + d[2], d[3], d[3] + 1, D0);
      B(d[0] + 1, d[0] + d[1] - 1, d[4] + 1, d[4] + d[2] - 1, d[3] - 1, d[3], di % 2 ? P1 : P0);
      B(d[0] + 2, d[0] + d[1] - 2, d[4] + 2, d[4] + 3, d[3] - 1, d[3], GC);
      B(d[0] + 2, d[0] + 3, d[4] + d[2], hy1 - 8, d[3], d[3] + 1, MS);
      B(d[0] + d[1] - 3, d[0] + d[1] - 2, d[4] + d[2], hy1 - 8, d[3], d[3] + 1, MS);
    });
    // 侧壁：壁柱 + 发光缝
    for (var wx = x0 + 6; wx < x1 - 4; wx += 14) { B(wx, wx + 4, y0, hy1 - 4, 61, 65, F2); B(wx + 1, wx + 3, y0 + 14, y0 + 40, 60, 61, F3); }
    B(x0, x1, 112, 113, 62, 65, GCs);
    B(x0, x1, 94, 95, 63, 65, GCs);
  });
  // 穹顶跨梁（横跨大厅）与灯带
  for (var bx = x0 + 10; bx < x1 - 4; bx += 26) {
    g.box(bx, bx + 8, hy1 - 8, hy1, -65, 65, D0);
    g.box(bx + 1, bx + 7, hy1 - 9, hy1 - 8, -60, 60, GCs);
    g.box(bx, bx + 8, hy1 - 12, hy1 - 8, -65, -58, D2); g.box(bx, bx + 8, hy1 - 12, hy1 - 8, 58, 65, D2);
  }
  g.box(x0, x1, hy1 - 1, hy1, -2, 2, GCs);
  // 后墙：层层退让的暗色壁板、发光缝与后门
  g.box(x0, x0 + 6, y0, hy1, -65, 65, D1);
  for (var k = 0; k < 5; k++) { g.box(x0 + 6, x0 + 8, y0 + 4 + k * 11, y0 + 12 + k * 11, -60, 60, D0); }
  g.box(x0 + 6, x0 + 7, y0 + 14, y0 + 16, -58, 58, GCs);
  g.box(x0 + 6, x0 + 7, y0 + 38, y0 + 40, -58, 58, GCs);
  // 后门通道：穿过后墙并延伸成一段突出的暗风道（转场遮挡），尽端是闸门
  g.box(20, 46, y0 - 8, y0 + 28, -20, 20, D1);
  g.box(20, 46, y0 - 8, y0 - 2, -17, 17, D2);
  g.box(62, 76, y0 + 1, y0 + 25, -15, 15, D2);
  g.box(22, 78, y0 + 2, y0 + 24, -13, 13, 0);
  g.box(22, 78, y0 + 1, y0 + 2, -13, 13, F1);
  g.box(22, 78, y0 + 24, y0 + 25, -13, 13, F1);
  g.box(62, 76, y0 + 24, y0 + 26, -15, 15, D0);
  g.box(66, 76, y0 + 24, y0 + 25, -13, 13, GA);
  g.box(66, 76, y0 + 1, y0 + 2, -13, 13, GA);
  for (var q4 = 24; q4 < 64; q4 += 8) { g.box(q4, q4 + 2, y0 + 2, y0 + 24, -14, -13, D2); g.box(q4, q4 + 2, y0 + 2, y0 + 24, 13, 14, D2); g.box(q4, q4 + 1, y0 + 2, y0 + 3, -13, 13, GCs); }
  g.box(30, 64, y0 + 11, y0 + 12, -14, -13, GA); g.box(30, 64, y0 + 11, y0 + 12, 13, 14, GA);
  g.box(22, 28, y0 + 2, y0 + 24, -13, 13, D1);
  g.box(28, 29, y0 + 10, y0 + 12, -12, 12, GA);
  g.box(28, 30, y0 + 2, y0 + 24, -2, 2, F2);
  // 前窗内侧窗台设备
  g.box(180, 192, y0, y0 + 6, -56, 56, D1);
  g.box(180, 192, y0 + 6, y0 + 7, -56, 56, GCs);
  for (var wz = -50; wz <= 50; wz += 10) g.box(182, 190, y0 + 6, y0 + 9, wz, wz + 4, wz % 20 === 0 ? P1 : P0);
  // 窗前投影层：稀疏的透明发光方格（同尺寸体素）
  [[172, -40, -14, 94, 114], [168, 14, 40, 92, 112]].forEach(function (pl) {
    for (var z2 = pl[1]; z2 < pl[2]; z2 += 2) for (var y2 = pl[3]; y2 < pl[4]; y2 += 2) {
      var on = ((z2 / 2 + y2 / 2) % 4 + 4) % 4 === 0 || (z2 === pl[1] || y2 === pl[3] || z2 === pl[2] - 2 || y2 === pl[4] - 2);
      if (on) g.box(pl[0], pl[0] + 1, y2, y2 + 1, z2, z2 + 1, (z2 / 2 + y2 / 2) % 5 === 0 ? M.XA : M.XC);
    }
  });
}

// ---------- 动力核心中庭 ----------
function buildCoreAtrium() {
  var g = new Grid(-204, 204, -10, 264, -142, 142);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, MS = M.MS, GC = M.GC, GCs = M.GCs, GA = M.GA, GW = M.GW;
  var F0 = M.F0, F1 = M.F1, F2 = M.F2, F3 = M.F3, W0 = M.W0, W1 = M.W1;
  var meta = {};
  function oct(x, z) { var ax = Math.abs(x), az = Math.abs(z); return Math.max(ax, az, (ax + az) * 0.7071); }
  var R = 126, WALL = 12;
  // 墙体与地面、穹顶
  for (var z = -141; z < 141; z++) for (var x = -141; x < 141; x++) {
    var d = oct(x + 0.5, z + 0.5);
    if (d > R + WALL) continue;
    var ang = Math.atan2(z, x);
    if (d > R) {
      g.box(x, x + 1, -8, 258, z, z + 1, d > R + 5 ? D1 : F0);
    } else {
      g.box(x, x + 1, -8, 0, z, z + 1, F1);
      g.box(x, x + 1, 250, 258, z, z + 1, D1);
      // 肋柱：沿墙周每 ~22 格一根
      var s = (ang + Math.PI) * R;
      var rib = (s % 22) < 8;
      if (d > R - 7 && rib) g.box(x, x + 1, 0, 250, z, z + 1, F2);
      if (d > R - 4 && !rib) g.box(x, x + 1, 0, 250, z, z + 1, F0);
    }
  }
  // 水平带：各层平台的墙端拱座与发光缝
  var levels = [34, 72, 108, 166, 208, 236];
  levels.forEach(function (ly) {
    for (var z2 = -128; z2 < 128; z2++) for (var x2 = -128; x2 < 128; x2++) {
      var d2 = oct(x2 + 0.5, z2 + 0.5);
      if (d2 > R - 10 && d2 <= R) {
        g.box(x2, x2 + 1, ly - 7, ly + 3, z2, z2 + 1, D0);
        g.box(x2, x2 + 1, ly - 8, ly - 7, z2, z2 + 1, (d2 > R - 3 && (x2 + z2) % 6 !== 0) ? GCs : D1);
      }
    }
  });
  // 墙面发光缝（每层之间）
  [52, 90, 138, 188, 224].forEach(function (ly) {
    for (var z3 = -128; z3 < 128; z3++) for (var x3 = -128; x3 < 128; x3++) {
      var d3 = oct(x3 + 0.5, z3 + 0.5);
      if (d3 > R - 2 && d3 <= R + 1 && ((Math.atan2(z3, x3) * R) % 22) > 10) g.box(x3, x3 + 1, ly, ly + 2, z3, z3 + 1, GC);
    }
  });
  // 环形/分叉平台
  function ring(ly, rin, rout, thick, mat, arcs) {
    for (var zz = -128; zz < 128; zz++) for (var xx = -128; xx < 128; xx++) {
      var r = Math.sqrt((xx + 0.5) * (xx + 0.5) + (zz + 0.5) * (zz + 0.5));
      if (r < rin || r > rout) continue;
      var an = Math.atan2(zz, xx);
      if (arcs && !arcs(an, r)) continue;
      g.box(xx, xx + 1, ly - thick, ly, zz, zz + 1, mat);
      if (r < rin + 1.5) { g.box(xx, xx + 1, ly, ly + 3, zz, zz + 1, D2); }
      if (r < rin + 1.2) g.box(xx, xx + 1, ly + 3, ly + 4, zz, zz + 1, GCs);
      if (r < rin + 2.5 && r >= rin + 1) g.box(xx, xx + 1, ly - thick - 1, ly - thick, zz, zz + 1, GCs);
    }
  }
  var ARM = function (n, w) { return function (a, r) { for (var k = 0; k < n; k++) { var da = Math.abs(((a - (k * Math.PI * 2 / n) + Math.PI * 3) % (Math.PI * 2)) - Math.PI); var arc = Math.min(da, Math.PI * 2 - da); } var best = 9; for (var k2 = 0; k2 < n; k2++) { var dd = Math.abs(Math.atan2(Math.sin(a - k2 * Math.PI * 2 / n), Math.cos(a - k2 * Math.PI * 2 / n))); best = Math.min(best, dd); } return best * r < w; }; };
  var ARCS = function (n, gapFrac, off) { return function (a, r) { var u = ((a + Math.PI + off) / (Math.PI * 2) * n) % 1; return u < 1 - gapFrac; }; };
  ring(34, 92, 124, 5, F2, null);
  ring(72, 92, 124, 4, F1, ARM(4, 14));
  ring(72, 92, 108, 4, F2, ARCS(8, 0.35, 0.2));
  ring(108, 94, 114, 4, F2, ARCS(5, 0.3, 0.5));
  ring(166, 90, 124, 5, F2, null);
  ring(208, 92, 124, 4, F1, ARM(3, 18));
  ring(208, 92, 106, 4, F2, ARCS(6, 0.4, 0.1));
  ring(236, 110, 124, 4, F2, null);
  // 中央底座与能量柱
  g.cylY(0, 6, 0, 0, 34, D0); g.cylY(6, 10, 0, 0, 28, F2); g.cylY(10, 14, 0, 0, 20, D1);
  g.cylY(0, 3, 0, 0, 36, GCs, 34);
  g.cylY(14, 100, 0, 0, 8, D0);
  g.cylY(158, 250, 0, 0, 8, D0);
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  // 能量柱上的流光槽：按高度分组，形成向核心汇聚的脉冲
  for (var y = 14; y < 250; y++) {
    if (y >= 100 && y < 158) continue;
    for (var a2 = 0; a2 < 4; a2++) {
      var ax = [1, 0, -1, 0][a2], az = [0, 1, 0, -1][a2];
      for (var w = -1; w <= 1; w += 2) {
        var px = ax * 8 + (az !== 0 ? w : 0) * (az !== 0 ? 1 : 0), pz = az * 8 + (ax !== 0 ? w : 0);
        var gx = ax * 8 - (ax > 0 ? 0 : 0), gz = az * 8;
        g.set(ax * 7 + (az !== 0 ? (w > 0 ? 0 : -1) : 0), y, az * 7 + (ax !== 0 ? (w > 0 ? 0 : -1) : 0), GC);
        var gi = g.idx(ax * 7 + (az !== 0 ? (w > 0 ? 0 : -1) : 0), y, az * 7 + (ax !== 0 ? (w > 0 ? 0 : -1) : 0));
        var yy = y < 100 ? (100 - y) : (y - 158);
        grp[gi] = 2 + (Math.floor(yy / 9) % 6);
      }
    }
  }
  // 核心：发光内层 + 外构架
  var cy = 128;
  g.sphere(0, cy, 0, 21, M.GW);
  g.sphere(0, cy, 0, 18, M.GC);
  for (var yq = cy - 24; yq <= cy + 24; yq++) for (var zq = -24; zq <= 24; zq++) for (var xq = -24; xq <= 24; xq++) {
    var rr = Math.sqrt(xq * xq + (yq - cy) * (yq - cy) + zq * zq);
    if (rr > 28 || rr < 19) continue;
    var lat = Math.asin((yq - cy) / rr), lon = Math.atan2(zq, xq);
    // 流光脉络（分组 2..7）
    var vein = Math.abs(Math.sin(lon * 6 + lat * 2.5)) < 0.12 && rr < 22.5;
    var meridian = Math.abs(Math.sin(lon * 4)) < 0.16 && rr > 24;
    var parallel = Math.abs(Math.sin(lat * 7)) < 0.14 && rr > 24;
    if (vein) { g.set(xq, yq, zq, GW); var gi2 = g.idx(xq, yq, zq); grp[gi2] = 2 + (Math.floor((lon + Math.PI) / (Math.PI * 2) * 6) % 6); }
    else if (rr < 22 && rr >= 21) { g.set(xq, yq, zq, GC); grp[g.idx(xq, yq, zq)] = 1; }
    else if ((meridian || parallel) && rr <= 27.5) { g.set(xq, yq, zq, ((xq + yq + zq) & 3) === 0 ? ME : H); }
  }
  // 核心内层标记分组 1
  for (var y2 = cy - 21; y2 <= cy + 21; y2++) for (var z2b = -21; z2b <= 21; z2b++) for (var x2b = -21; x2b <= 21; x2b++) {
    if (!g.inb(x2b, y2, z2b)) continue; var ii = g.idx(x2b, y2, z2b); var mm = g.data[ii];
    if ((mm === GW || mm === GC) && grp[ii] === 0) grp[ii] = 1;
  }
  // 从舱壁伸向核心的巨大支撑（两层，各 6 根）
  [[128, 0.5236], [190, 0.0], [64, 0.0]].forEach(function (L, li) {
    for (var k = 0; k < 6; k++) {
      var an = L[1] + k * Math.PI / 3;
      var w = li === 0 ? 7 : 5;
      var p0 = [Math.cos(an) * 30, L[0], Math.sin(an) * 30], p1 = [Math.cos(an) * (R - 8), L[0] + (li === 0 ? 0 : (li === 1 ? 18 : -18)), Math.sin(an) * (R - 8)];
      g.line(p0, p1, w, D0);
      g.line([p0[0], p0[1] + w + 1, p0[2]], [p1[0], p1[1] + w + 1, p1[2]], 1, GCs);
      g.box(Math.round(p1[0]) - w - 2, Math.round(p1[0]) + w + 3, Math.round(p1[1]) - w - 2, Math.round(p1[1]) + w + 3, Math.round(p1[2]) - w - 2, Math.round(p1[2]) + w + 3, D2);
    }
  });
  // 入口与出口通道（封闭的突出风道，内壁暗，作转场遮挡）
  function duct(cx, cy2, cz, dirx, dirz, len) {
    // 以 +x 或 -x 方向的通道，截面 28×24
    var x0 = dirx > 0 ? cx : cx - len, x1 = dirx > 0 ? cx + len : cx;
    g.box(x0, x1, cy2 - 18, cy2 + 18, cz - 24, cz + 24, D1);
    g.box(x0, x1, cy2 - 12, cy2 + 12, cz - 14, cz + 14, 0);
    g.box(x0, x1, cy2 - 12, cy2 - 11, cz - 14, cz + 14, F1);
    g.box(x0, x1, cy2 + 11, cy2 + 12, cz - 14, cz + 14, F1);
    for (var q = Math.ceil(x0 / 8) * 8; q < x1; q += 8) { g.box(q, q + 2, cy2 - 12, cy2 + 12, cz - 14, cz - 13, D2); g.box(q, q + 2, cy2 - 12, cy2 + 12, cz + 13, cz + 14, D2); g.box(q, q + 1, cy2 - 11, cy2 - 10, cz - 13, cz + 13, GCs); }
    g.box(x0, x1, cy2 - 1, cy2 + 1, cz - 14, cz - 13, GCs); g.box(x0, x1, cy2 - 1, cy2 + 1, cz + 13, cz + 14, GCs);
    g.box(x0, x1, cy2 - 12, cy2 - 11, cz - 14, cz + 14, W1); g.box(x0, x1, cy2 + 11, cy2 + 12, cz - 14, cz + 14, W1);
    // 近核心一侧与舱壁打通
    var wx0 = dirx > 0 ? R - 16 : -R - 20, wx1 = dirx > 0 ? R + 20 : -R + 16;
    g.box(wx0, wx1, cy2 - 12, cy2 + 12, cz - 14, cz + 14, 0);
    g.box(wx0, wx1, cy2 - 13, cy2 - 12, cz - 14, cz + 14, F1);
    g.box(wx0, wx1, cy2 + 12, cy2 + 13, cz - 14, cz + 14, F1);
    // 洞口边框
    var fx = dirx > 0 ? R - 6 : -R - 1;
    g.box(fx, fx + 7, cy2 - 15, cy2 - 12, cz - 17, cz + 17, D0); g.box(fx, fx + 7, cy2 + 12, cy2 + 15, cz - 17, cz + 17, D0);
    g.box(fx, fx + 7, cy2 - 12, cy2 + 12, cz - 17, cz - 14, D0); g.box(fx, fx + 7, cy2 - 12, cy2 + 12, cz + 14, cz + 17, D0);
    g.box(fx + (dirx > 0 ? 5 : 0), fx + (dirx > 0 ? 7 : 2), cy2 - 13, cy2 + 13, cz - 15, cz - 14, GA); g.box(fx + (dirx > 0 ? 5 : 0), fx + (dirx > 0 ? 7 : 2), cy2 - 13, cy2 + 13, cz + 14, cz + 15, GA);
  }
  duct(R + 8, 221, 0, 1, 0, 52);       // 入口：东墙上层
  duct(-R - 8, 126, 0, -1, 0, 52);     // 出口：西墙核心高度
  g.box(-R - 62, -R - 58, 114, 138, -14, 14, W1);
  g.box(-R - 58, -R - 57, 118, 134, -13, 13, GCs);
  // 外端封闭：入口通道远端略亮（接舰桥后门）
  g.box(R + 60, R + 64, 209, 233, -14, 14, W1);
  g.box(R + 59, R + 60, 215, 227, -13, 13, GCs);
  meta.core = [0, cy, 0];
  g.plates([], [], 1, 1);
  return { g: g, meta: meta };
}

// 旋转环（单独模型，可围绕任意轴旋转）
function buildCoreRing(rin, rout, hh, seed, notch) {
  var half = Math.ceil(rout) + 4;
  var g = new Grid(-half, half, -hh - 6, hh + 6, -half, half);
  var rng = new RNG(seed);
  for (var z = -half; z < half; z++) for (var x = -half; x < half; x++) {
    var r = Math.sqrt((x + 0.5) * (x + 0.5) + (z + 0.5) * (z + 0.5));
    if (r < rin || r > rout) continue;
    var an = Math.atan2(z, x), u = ((an + Math.PI) / (Math.PI * 2) * notch) % 1;
    var gap = u > 0.88;
    if (gap) { g.box(x, x + 1, -2, 2, z, z + 1, M.D1); continue; }
    g.box(x, x + 1, -hh, hh, z, z + 1, u < 0.1 ? M.H2 : M.H0);
    // 外缘亮边、内缘暗槽
    if (r > rout - 1.4) g.box(x, x + 1, -hh, -hh + 1, z, z + 1, M.GCs);
    if (r < rin + 1.4) g.box(x, x + 1, -1, 1, z, z + 1, M.D1);
    if (r > rout - 3 && r <= rout - 1.4 && u > 0.3 && u < 0.7) g.box(x, x + 1, hh - 1, hh, z, z + 1, M.GC);
    if (u > 0.45 && u < 0.55) g.box(x, x + 1, hh, hh + 3, z, z + 1, M.D2);
  }
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  for (var i = 0; i < g.data.length; i++) { var m = g.data[i]; if (m === M.GC || m === M.GCs) grp[i] = 1; }
  return g;
}

// ---------- 能量装填与导能长廊 ----------
function buildCorridor() {
  var g = new Grid(-60, 392, -6, 84, -72, 72);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, MS = M.MS, GC = M.GC, GCs = M.GCs, GA = M.GA, GW = M.GW;
  var F0 = M.F0, F1 = M.F1, F2 = M.F2, F3 = M.F3, W0 = M.W0, W1 = M.W1;
  var grp = new Uint8Array(g.data.length); g._grp = grp;
  function G(x0, x1, y0, y1, z0, z1, m, gp) {
    g.box(x0, x1, y0, y1, z0, z1, m);
    if (gp) for (var z = z0; z < z1; z++) for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) if (g.inb(x, y, z)) grp[g.idx(x, y, z)] = gp;
  }
  var L = 350;
  // 壳体
  g.box(-30, 372, -6, 84, -72, 72, D1);
  g.box(-30, L + 12, 0, 74, -54, 54, 0);          // 主腔
  g.box(-30, L + 12, -2, 0, -54, 54, F1);
  g.box(-30, L + 12, 74, 78, -54, 54, F0);
  // 地面：中央导槽 + 两侧轨道
  g.box(-30, L + 12, 0, 1, -9, 9, D1);
  g.box(-30, L + 12, 0, 1, -10, -9, GCs); g.box(-30, L + 12, 0, 1, 9, 10, GCs);
  [-1, 1].forEach(function (s) {
    g.box(-30, L + 12, 0, 3, s > 0 ? 22 : -26, s > 0 ? 26 : -22, D2);
    g.box(-30, L + 12, 3, 4, s > 0 ? 23 : -25, s > 0 ? 25 : -23, GC);
    g.box(-30, L + 12, 0, 2, s > 0 ? 44 : -54, s > 0 ? 54 : -44, F2);
    g.box(-30, L + 12, 2, 3, s > 0 ? 44 : -45, s > 0 ? 45 : -44, GCs);
  });
  for (var xx = -20; xx < L; xx += 10) g.box(xx, xx + 5, 0, 1, -8, 8, F2);
  // 侧壁：壁板 + 槽列
  [-1, 1].forEach(function (s) {
    for (var x = -20; x < L; x += 12) {
      g.box(x, x + 8, 0, 74, s > 0 ? 50 : -54, s > 0 ? 54 : -50, F2);
      g.box(x + 8, x + 12, 8, 66, s > 0 ? 52 : -54, s > 0 ? 54 : -52, F0);
      g.box(x + 9, x + 11, 14, 60, s > 0 ? 51 : -52, s > 0 ? 52 : -51, GCs);
    }
  });
  // 跨间框架：每 40 一道，粗大
  var frames = [];
  for (var fx = 20; fx < L - 10; fx += 40) {
    frames.push(fx);
    G(fx, fx + 8, 0, 74, -54, -42, D0); G(fx, fx + 8, 0, 74, 42, 54, D0);
    G(fx, fx + 8, 62, 74, -54, 54, D0);
    G(fx + 1, fx + 7, 60, 62, -42, 42, F2);
    G(fx + 2, fx + 6, 2, 60, -43, -42, GC, 1 + (fx / 40 | 0) % 6); G(fx + 2, fx + 6, 2, 60, 42, 43, GC, 1 + ((fx / 40 | 0) + 3) % 6);
    G(fx + 2, fx + 6, 61, 62, -42, 42, GC, 1 + (fx / 40 | 0) % 6);
    G(fx - 2, fx, 0, 12, -54, -40, D2); G(fx - 2, fx, 0, 12, 40, 54, D2);
    G(fx + 8, fx + 10, 0, 12, -54, -40, D2); G(fx + 8, fx + 10, 0, 12, 40, 54, D2);
  }
  // 高大装填装置：每个跨间两侧各一座
  for (var bi = 0; bi < frames.length; bi++) {
    var bx = frames[bi] + 24;
    [-1, 1].forEach(function (s) {
      var cz = s * 33;
      g.cylY(0, 4, bx, cz, 13, D0);
      g.cylY(4, 6, bx, cz, 14, ME, 12);
      g.cylY(6, 62, bx, cz, 11, H);
      g.cylY(6, 62, bx, cz, 11, D2, 9.5);
      // 竖向槽列与内部亮核
      for (var k = 0; k < 8; k++) {
        var an = k * Math.PI / 4 + 0.3;
        var px = Math.round(bx + Math.cos(an) * 10), pz = Math.round(cz + Math.sin(an) * 10);
        G(px, px + 1, 10, 56, pz, pz + 1, GC, 1 + ((bi + k) % 6));
      }
      g.cylY(10, 56, bx, cz, 4.5, GW);
      for (var y = 10; y < 56; y += 1) for (var q = -5; q <= 5; q++) for (var q2 = -5; q2 <= 5; q2++) if (q * q + q2 * q2 <= 20 && g.inb(Math.round(bx + q), y, Math.round(cz + q2))) { var gi = g.idx(Math.round(bx + q), y, Math.round(cz + q2)); if (g.data[gi] === GW) grp[gi] = 1 + ((bi * 2 + (s > 0 ? 1 : 0)) % 6); }
      g.cylY(62, 66, bx, cz, 12, D0); g.cylY(66, 68, bx, cz, 8, D2);
      g.cylY(6, 8, bx, cz, 12.5, ME, 11); g.cylY(34, 36, bx, cz, 12.5, ME, 11); g.cylY(52, 54, bx, cz, 12.5, ME, 11);
      // 与框架的连接梁
      g.box(bx - 14, bx + 14, 62, 66, cz - 2, cz + 2, D2);
    });
  }
  // 悬置导能构件：吊在顶部的粗管，沿 x 分段发光（分组 = 位置桶）
  [-1, 1].forEach(function (s) {
    for (var x = -20; x < L; x += 6) {
      var gp = 1 + ((x / 6 | 0) % 6);
      g.box(x, x + 5, 56, 62, s * 14 - 5, s * 14 + 5, D2);
      G(x + 1, x + 4, 57, 61, s * 14 - 1, s * 14 + 1, GC, gp);
      g.box(x + 5, x + 6, 58, 60, s * 14 - 4, s * 14 + 4, D0);
    }
  });
  // 顶部导光条
  G(-20, L, 73, 74, -2, 2, GCs, 0);
  // 尽头：更宽阔的发光腔口
  var ex = L + 12;
  g.box(ex - 30, ex + 6, 0, 76, -72, 72, D1);
  g.box(ex - 30, ex, 0, 74, -54, 54, 0);
  // 向外扩的喇叭口
  for (var k2 = 0; k2 < 22; k2++) { var w = 54 + k2 * 0.8; g.box(L + 12 - k2, L + 13 - k2, 0, 74 + Math.floor(k2 * 0.1), -Math.round(w), Math.round(w), 0); }
  g.box(ex - 8, ex + 6, 0, 76, -72, 72, D1);
  g.cylX(ex - 9, ex + 5, 38, 0, 33, 0);
  g.cylX(ex - 12, ex - 8, 38, 0, 38, D0, 33);
  g.cylX(ex - 12, ex - 11, 38, 0, 34, GA, 33);
  g.cylX(ex - 3, ex + 6, 38, 0, 33, M.GD);
  g.cylX(ex - 3, ex + 6, 38, 0, 20, GCs);
  g.cylX(ex - 3, ex + 6, 38, 0, 10, GC);
  g.cylX(ex - 3, ex + 6, 38, 0, 4, GW);
  g.cylX(ex - 3, ex + 2, 38, 0, 27, GA, 22);
  for (var yq = 0; yq < 76; yq++) for (var zq = -34; zq < 34; zq++) for (var xq = ex - 3; xq < ex + 6; xq++) { if (!g.inb(xq, yq, zq)) continue; var gi3 = g.idx(xq, yq, zq); if (g.data[gi3] === GW || g.data[gi3] === GC) grp[gi3] = 7; }
  // 起始通道（封闭的暗风道，作转场遮挡）
  g.box(-60, -28, 0, 60, -26, 26, D1);
  g.box(-60, -28, 6, 30, -14, 14, 0);
  g.box(-60, -28, 5, 6, -14, 14, F1); g.box(-60, -28, 30, 31, -14, 14, F1);
  for (var q3 = -60; q3 < -30; q3 += 8) { g.box(q3, q3 + 2, 6, 30, -14, -13, D2); g.box(q3, q3 + 2, 6, 30, 13, 14, D2); g.box(q3, q3 + 1, 6, 7, -13, 13, GCs); }
  g.box(-62, -58, 4, 32, -16, 16, W1);
  g.box(-60, -28, 17, 19, -14, -13, GCs); g.box(-60, -28, 17, 19, 13, 14, GCs);
  return { g: g, meta: { frames: frames, L: L, endX: ex } };
}

// 小型机械：合拢的夹臂、能量块
function buildClamp() {
  var g = new Grid(-10, 12, -4, 38, -26, 26);
  g.box(-6, 8, 0, 30, -4, 4, M.D0);
  g.box(-8, 10, 28, 36, -6, 6, M.D2);
  g.box(-4, 6, 6, 8, -22, 22, M.D2);
  g.box(-4, 6, 4, 6, -22, -16, M.H0); g.box(-4, 6, 4, 6, 16, 22, M.H0);
  g.box(-2, 4, 8, 9, -20, -4, M.GC); g.box(-2, 4, 8, 9, 4, 20, M.GC);
  g.box(-3, 5, 14, 16, -3, 3, M.GA);
  return g;
}
function buildEnergyBlock() {
  var g = new Grid(-5, 5, -5, 5, -5, 5);
  g.box(-3, 3, -3, 3, -3, 3, M.GW);
  g.box(-4, 4, -2, 2, -2, 2, M.GC); g.box(-2, 2, -4, 4, -2, 2, M.GC); g.box(-2, 2, -2, 2, -4, 4, M.GC);
  return g;
}

// ---------- 旗舰外翼（独立模型，与旗舰共用姿态）：从主壳侧部继续向外展开的羽状层片 ----------
function buildFlagshipWings() {
  var g = new Grid(-400, 60, -34, 34, -274, 274);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, GC = M.GC, GCs = M.GCs, T0 = M.T0, TA = M.TA;
  // y0,y1, 翼尖z, 前缘x(根部)、前缘斜率、后缘x、后缘斜率、根部z（与主壳羽片公式一致）
  var leaves = [
    [-16, -6, 266, 50, -0.85, -340, -0.18, 118],
    [-6, 4, 250, 84, -0.80, -290, -0.20, 116],
    [4, 14, 232, 106, -0.78, -240, -0.22, 114],
    [14, 22, 212, 118, -0.70, -180, -0.25, 112]
  ];
  var zStart = [184, 170, 156, 142];
  leaves.forEach(function (lf, li) {
    for (var z = zStart[li]; z < lf[2]; z++) {
      var dz = z - lf[7];
      var lead = Math.round(lf[3] + lf[4] * dz), trail = Math.round(lf[5] + lf[6] * dz);
      var tooth = ((Math.floor(z / 9) % 2) ? 14 : 0);
      g.boxS(trail + tooth, lead, lf[0], lf[1], z, z + 1, H);
      // 外侧逐渐变薄的上缘叠板，形成层片感
      if (z > zStart[li] + 4 && z < lf[2] - 8) g.boxS(trail + tooth + 8, lead - 10, lf[1], lf[1] + 1, z, z + 1, li % 2 ? M.H2 : M.H1);
      // 前缘冷光细线（断续）
      if ((z + li * 5) % 14 < 9) g.boxS(lead - 2, lead, lf[1] - 2, lf[1], z, z + 1, GCs);
    }
    var zt = lf[2], dzt = zt - lf[7];
    var leadT = Math.round(lf[3] + lf[4] * dzt);
    // 翼尖：发光亮边 + 导航灯
    g.boxS(leadT - 34, leadT, lf[0], lf[1], zt - 1, zt, li === 1 ? GC : ME);
    g.boxS(leadT - 4, leadT - 1, lf[1], lf[1] + 2, zt - 3, zt - 1, li % 2 ? GC : TA);
    // 羽片之间的深槽
    for (var zz = zStart[li] + 6; zz < zt - 6; zz += 18) {
      var tr = Math.round(lf[5] + lf[6] * (zz - lf[7])), ld = Math.round(lf[3] + lf[4] * (zz - lf[7]));
      g.boxS(tr - 6, ld - 40, lf[0] + 1, lf[1] - 1, zz, zz + 2, D1);
    }
  });
  // 翼下梳齿散热片与暗色肋
  for (var fx = -350; fx < -10; fx += 7) {
    var span = 24 + Math.floor(hash1(fx * 0.17) * 40);
    g.boxS(fx, fx + 2, -30, -16, 186, 186 + span, D2);
  }
  for (var rx = -340; rx < -20; rx += 44) g.boxS(rx, rx + 4, -22, -16, 176, 256, D0);
  // 翼根的连接托梁（与主壳羽片衔接，遮住接缝）
  g.boxS(-352, 4, -18, -2, 168, 176, D2);
  g.boxS(-352, 4, -17, -16, 168, 176, GCs);
  // 机库舷侧口范围内不能被外翼挡住
  g.box(-92, 72, -34, 34, 138, 164, 0); g.box(-92, 72, -34, 34, -164, -138, 0);
  g.plates([M.H0], [M.H0, M.H0, M.H1, M.H2], 30, 9);
  return { g: g };
}
