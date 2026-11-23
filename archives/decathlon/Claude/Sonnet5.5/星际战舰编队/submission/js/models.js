'use strict';
// ---------- 舰队造型：形态母题 ----------
// 母题：「裂首层片」—— 舰首向前分叉成两支长叉，叉间空腔里生长出发亮的炮身；
// 壳体由层层错开的阶梯板片叠成，板片之间是深色槽带；青色冷光串起缝隙、喷口与炮口。
var SUN_LOCAL = vnorm([0.30, 0.50, 0.82]);   // 太阳方向（舰体局部＝世界）
var HV = [M.H0, M.H1, M.H2, M.H3, M.H4];

function lerpKeys(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (var i = 0; i < keys.length - 1; i++) {
    if (x <= keys[i + 1][0]) { var t = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * t; }
  }
  return keys[keys.length - 1][1];
}
function qz(v, s) { return Math.round(v / s) * s; }

// 顶面高度图（按列扫描）
function heightMap(g) {
  var hm = new Int16Array(g.nx * g.nz), nx = g.nx, ny = g.ny, nz = g.nz, d = g.data;
  for (var z = 0; z < nz; z++) for (var x = 0; x < nx; x++) {
    var y = ny - 1, h = -9999;
    var base = x + nx * ny * z;
    for (; y >= 0; y--) { if (d[base + nx * y]) { h = y + g.oy; break; } }
    hm[x + nx * z] = h;
  }
  return hm;
}

// 沿 X 轴的喷口：xe 为喷口外端，朝 -x 开口；返回喷口信息
function addNozzle(g, xe, y0, z0, r, opts) {
  opts = opts || {};
  var len = opts.len || Math.round(r * 2.4 + 8);
  // 外壳：深色，叠层口沿
  g.cylX(xe, xe + len, y0, z0, r + 5, M.D0);
  g.cylX(xe, xe + 3, y0, z0, r + 8, M.ME);
  g.cylX(xe + 3, xe + 8, y0, z0, r + 7, M.H2);
  g.cylX(xe + 8, xe + 12, y0, z0, r + 5.5, M.D2);
  g.cylX(xe + 14, xe + 18, y0, z0, r + 6.5, M.H1);
  g.cylX(xe + Math.round(len * 0.55), xe + Math.round(len * 0.55) + 4, y0, z0, r + 7.5, M.H3);
  // 内腔
  var cav = Math.round(len * 0.78);
  g.cylX(xe - 1, xe + cav, y0, z0, r, 0);
  // 内壁分层环（深色）
  g.cylX(xe, xe + cav, y0, z0, r, M.D1, r - 1.6);
  for (var k = 4; k < cav - 3; k += 7) g.cylX(xe + k, xe + k + 2, y0, z0, r, M.D2, r - 2.4);
  // 发亮的内部：发光塞（分组 7 受推力调节）与白热中心
  var gx = xe + cav - 3;
  g.cylX(gx, xe + cav, y0, z0, r - 0.5, M.GC);
  g.cylX(gx + 1, xe + cav, y0, z0, Math.max(1.5, r * 0.5), M.GW);
  if (opts.groups) {
    var gp = opts.groups, gi = (g.ox === undefined) ? 0 : 0;
    gp.push([gx, xe + cav, y0, z0, r]);
  }
  return { x: xe, y: y0, z: z0, r: r, cav: cav };
}

// 体素炮台底座（旋转头部另成模型）
function addTurretBase(g, x, y, z, s) {
  s = s || 1;
  var r = Math.round(7 * s);
  g.box(x - r - 1, x + r + 2, y, y + 3, z - r - 1, z + r + 2, M.D0);
  g.cylY(y + 3, y + 5, x, z, r + 1, M.H2);
  g.cylY(y + 5, y + 6, x, z, r - 1, M.D1);
  g.cylY(y + 3, y + 4, x, z, r + 2, M.ME, r);
}

// ---------- 旗舰 ----------
function buildFlagship() {
  var X0 = -576, X1 = 576, Y0 = -82, Y1 = 170, Z0 = -190, Z1 = 190;
  var g = new Grid(X0, X1, Y0, Y1, Z0, Z1);
  var rng = new RNG(20240611);
  var H = M.H0, D0 = M.D0, D1 = M.D1, D2 = M.D2, ME = M.ME, MS = M.MS, GC = M.GC, GCs = M.GCs, T0 = M.T0, T1 = M.T1, GW = M.GW;
  var meta = { nozzles: [], turretMounts: [], noz: [] };

  // ====== 主壳：从舰尾到叉根，五层错位阶梯 ======
  var WK = [[-546, 54], [-530, 70], [-500, 94], [-440, 118], [-380, 132], [-250, 146], [-100, 148], [20, 140], [112, 124], [130, 112]];
  var LAY = [
    [-64, -46, 0.56, D1], [-46, -22, 0.86, H], [-22, 24, 1.0, H], [24, 42, 0.80, H], [42, 56, 0.44, H]
  ];
  for (var x = -546; x < 130; x++) {
    var W = lerpKeys(WK, x);
    var topCut = x < -500 ? (x + 546) / 46 : 1; // 尾部收束
    for (var li = 0; li < LAY.length; li++) {
      var L = LAY[li];
      var w = qz(W * L[2], 4);
      var y0 = L[0], y1 = L[1];
      if (x < -480) { var sh = Math.round((-480 - x) / 12); y0 += sh; y1 -= (li >= 3 ? sh * 2 : sh); }
      if (y1 > y0 && w > 0) g.box(x, x + 1, y0, y1, -w, w, L[3]);
    }
  }
  // 尾部阶梯收束（逐层退让）
  var stern = [[-576, -540, 50, 30], [-560, -520, 74, 40], [-540, -490, 100, 48], [-520, -460, 120, 56]];
  stern.forEach(function (s, i) { g.box(s[0], s[1], -s[3] + 6 - i * 2, s[3] - i * 3, -s[2], s[2], H); });
  g.box(-576, -566, -26, 28, -48, 48, D2); // 尾端暗板
  // ====== 侧部层片（羽状展开） ======
  var leaves = [
    // y0,y1, zroot, ztip, leadX(root), trailX(root), sweepLead, sweepTrail
    [-16, -6, 118, 184, 50, -340, -0.85, -0.18],
    [-6, 4, 116, 170, 84, -290, -0.80, -0.20],
    [4, 14, 114, 156, 106, -240, -0.78, -0.22],
    [14, 22, 112, 142, 118, -180, -0.7, -0.25]
  ];
  leaves.forEach(function (lf, li) {
    for (var z = lf[2]; z < lf[3]; z++) {
      var dz = z - lf[2];
      var lead = lf[4] + lf[6] * dz, trail = lf[5] + lf[7] * dz;
      // 羽片锯齿后缘
      var tooth = ((Math.floor(z / 9) % 2) ? 14 : 0);
      var m = (li % 2 === 0) ? H : H;
      g.boxS(Math.round(trail + tooth), Math.round(lead), lf[0], lf[1], z, z + 1, m);
    }
    // 羽片之间深槽：沿 x 向每隔 18 一条
    for (var zz = lf[2] + 8; zz < lf[3] - 4; zz += 18) {
      g.boxS(Math.round(lf[5] + lf[7] * (zz - lf[2])) - 6, Math.round(lf[4] + lf[6] * (zz - lf[2]) - 38), lf[0] + 1, lf[1] - 1, zz, zz + 2, D1);
    }
    // 外缘亮边（青色）
    g.boxS(Math.round(lf[4] + lf[6] * (lf[3] - lf[2])) - 26, Math.round(lf[4] + lf[6] * (lf[3] - lf[2])), lf[0], lf[1], lf[3] - 1, lf[3], li === 1 ? GCs : ME);
  });
  // ====== 舰首分叉：两支长叉 ======
  var zIn = 38;
  for (var x2 = 112; x2 < 568; x2++) {
    var t = (x2 - 112) / 456;
    var zo = qz(124 - 62 * Math.pow(t, 0.9), 4);
    var tipC = x2 > 520 ? Math.round((x2 - 520) * 0.35) : 0;
    // 下板、中板、上板（逐步收窄）
    g.boxS(x2, x2 + 1, -38 + tipC, -12, zIn, zo - 4, H);
    g.boxS(x2, x2 + 1, -12, 22 - tipC, zIn, zo, H);
    if (x2 < 530) g.boxS(x2, x2 + 1, 22, 38 - Math.floor(t * 8), zIn + 10, zo - 14, H);
    if (x2 > 150 && x2 < 520) {
      // 上冠：断续的竖板
      var seg = Math.floor((x2 - 150) / 34);
      if ((x2 - 150) % 34 < 24) g.boxS(x2, x2 + 1, 38 - Math.floor(t * 8), 48 - Math.floor(t * 10) + (seg % 2 ? 0 : 3), zIn + 14, zo - 24, seg % 3 === 0 ? T0 : H);
    }
  }
  // 叉尖：斜削 + 亮缝
  for (var tx = 530; tx < 568; tx++) {
    var cut = (tx - 530);
    g.boxS(tx, tx + 1, -30 + cut * 0.6, 18 - cut * 0.5, zIn, 64 - cut * 0.55, H);
  }
  // 叉内壁肋齿 + 发光槽
  for (var rx = 160; rx < 520; rx += 20) g.boxS(rx, rx + 7, -10, 18, zIn - 4, zIn, D2);
  g.boxS(140, 520, 6, 8, zIn - 1, zIn, GC);
  g.boxS(140, 520, -22, -20, zIn - 1, zIn, GCs);
  // 叉间系梁
  [[262, 270], [398, 406], [485, 491]].forEach(function (b) { g.box(b[0], b[1], -30, -20, -zIn - 2, zIn + 2, D0); g.box(b[0] - 2, b[1] + 2, -20, -17, -zIn, zIn, H); });
  // 叉下龙骨托梁
  g.box(112, 420, -40, -28, -zIn + 2, zIn - 2, D1);
  g.box(112, 400, -46, -40, -22, 22, D0);

  // ====== 光束主炮 ======
  // 基部（宽大）
  g.box(30, 190, -26, 42, -36, 36, H);
  g.box(30, 190, -26, -12, -36, 36, D1);
  g.box(24, 196, 8, 20, -32, 32, D2);
  g.box(60, 176, 42, 52, -22, 22, H);
  g.boxS(40, 180, 20, 22, 34, 37, GC);
  for (var bx = 46; bx < 186; bx += 18) g.boxS(bx, bx + 6, -26, 42, 33, 38, D0);
  // 炮身：圆截面，轴心 y=8
  var cy = 8, bR = 18.5;
  g.cylX(190, 548, cy, 0, bR, H);
  g.cylX(190, 548, cy, 0, bR, M.D2, bR - 1.5);
  // 炮身上的暗色套环
  var collars = [[210, 222], [284, 298], [356, 368], [428, 442], [496, 512]];
  collars.forEach(function (c) { g.cylX(c[0], c[1], cy, 0, 24, H); g.cylX(c[0], c[1], cy, 0, 24, D0, 22); g.cylX(c[0] + 1, c[1] - 1, cy, 0, 25.5, ME, 24); });
  // 发光槽分段（分组 1..5）
  var segs = [[222, 284], [298, 356], [368, 428], [442, 496], [512, 540]];
  var grpGrid = new Uint8Array(g.data.length);
  g._grp = grpGrid;
  segs.forEach(function (s, si) {
    for (var ang = 0; ang < 4; ang++) {
      var a = ang * Math.PI / 2 + Math.PI / 4;
      var uy = Math.sin(a), uz = Math.cos(a);
      for (var xx = s[0] + 3; xx < s[1] - 3; xx++) {
        for (var rr = bR - 3; rr <= bR + 0.6; rr += 0.5) {
          var yy = Math.floor(cy + uy * rr), zz = Math.floor(uz * rr);
          g.set(xx, yy, zz, GC);
          grpGrid[g.idx(xx, yy, zz)] = si + 1;
          g.set(xx, yy + (uy > 0 ? 1 : -1) * 0, zz + (Math.abs(uz) > 0.5 ? (uz > 0 ? 1 : -1) * 0 : 1), GC);
          grpGrid[g.idx(xx, yy, zz + 1)] = si + 1;
        }
      }
    }
  });
  // 发射口：深凹 + 炽亮
  g.cylX(534, 549, cy, 0, 12, 0);
  g.cylX(534, 549, cy, 0, 12, D1, 10.5);
  g.cylX(534, 536, cy, 0, 11, M.GR); g.cylX(535, 538, cy, 0, 7, M.GA); g.cylX(536, 539, cy, 0, 3.5, GW);
  for (var gx = 534; gx < 540; gx++) for (var yy2 = cy - 12; yy2 <= cy + 12; yy2++) for (var zz2 = -12; zz2 <= 12; zz2++) { var ii = g.idx(gx, yy2, zz2); if (g.inb(gx, yy2, zz2) && g.data[ii] >= M.GC && g.data[ii] <= M.GR) grpGrid[ii] = 6; }
  // 炮口花瓣（外展）
  for (var pi = 0; pi < 8; pi++) {
    var pa = pi * Math.PI / 4;
    var py = cy + Math.sin(pa) * 22, pz = Math.cos(pa) * 22;
    g.box(538, 552, Math.round(py) - 2, Math.round(py) + 3, Math.round(pz) - 2, Math.round(pz) + 3, pi % 2 ? D0 : H);
  }
  meta.muzzle = [549, cy + 0.5, 0];
  meta.cannonCy = cy;

  // ====== 舰尾喷口（五组，深内腔） ======
  var noz = [];
  var N0 = addNozzle(g, -576, 0, 0, 24); noz.push(N0);
  [-1, 1].forEach(function (s) {
    noz.push(addNozzle(g, -562, -4, s * 62, 16));
    noz.push(addNozzle(g, -540, -8, s * 90, 12));
    noz.push(addNozzle(g, -552, 30, s * 34, 10));
  });
  meta.noz = noz;
  // 喷口发光塞整体打上分组 7
  noz.forEach(function (n) {
    for (var xx = n.x + n.cav - 3; xx < n.x + n.cav + 1; xx++) for (var yy = Math.floor(n.y - n.r); yy <= Math.ceil(n.y + n.r); yy++) for (var zz = Math.floor(n.z - n.r); zz <= Math.ceil(n.z + n.r); zz++) {
      if (!g.inb(xx, yy, zz)) continue; var ii = g.idx(xx, yy, zz); var m = g.data[ii]; if (m === M.GC || m === M.GW) grpGrid[ii] = 7;
    }
  });

  flagshipUpper(g, meta, rng);
  flagshipBridgeInterior(g, meta, rng);
  flagshipHangar(g, meta, rng);
  flagshipBelly(g, meta, rng);
  flagshipProngDetail(g, meta, rng);
  flagshipGreeble(g, meta, rng);
  return { g: g, meta: meta, rng: rng };
}
