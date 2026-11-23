'use strict';
// ---------- 舱内场景：装载、帧组装、镜头路径 ----------
function loadInteriors() { }
var ENV_INT = {
  sun: [0, 1, 0], sunCol: [0, 0, 0], skyAmb: [0.075, 0.115, 0.19], gndAmb: [0.035, 0.05, 0.085], ambK: 1.0,
  fog: 0.0024, fogCol: [0.015, 0.04, 0.075], emiK: 1.0, glowK: 1.0
};
var ENV_COR = Object.assign({}, ENV_INT, { skyAmb: [0.07, 0.11, 0.17], fog: 0.0018, fogCol: [0.01, 0.035, 0.07] });

function loadInteriorA(A) {
  var hg = new Grid(-3, 4, -3, 4, -3, 4); hg.box(-1, 2, -1, 2, -1, 2, M.XC);
  A.models.holoDot = meshOf(hg, {});
  var hb = new Grid(-16, 17, -4, 9, -11, 12);
  hb.box(-11, 10, -1, 2, -3, 3, M.XW);                 // 主体
  hb.boxS(8, 14, -1, 1, 2, 4, M.XC);                   // 分叉的双叉
  hb.box(9, 13, 0, 1, -1, 1, M.XA);                    // 叉间炮身
  hb.boxS(-8, 3, 0, 1, 3, 9, M.XC);                    // 侧部层片
  hb.boxS(-5, 1, 1, 2, 3, 6, M.XB);
  hb.box(1, 6, 2, 5, -2, 2, M.XW);                     // 舰桥塔
  hb.box(-8, -3, 2, 4, -1, 1, M.XC);                   // 背脊
  hb.box(-14, -11, -1, 2, -2, 3, M.XA);                // 舰尾推进
  A.models.holoShip = meshOf(hb, {});
  var oa = new Grid(-3, 4, -3, 4, -3, 4); oa.box(-1, 2, -1, 2, -1, 2, M.XA);
  A.models.holoRock = meshOf(oa, {});
}
function loadInteriorCore(A) {
  var c = buildCoreAtrium();
  A.models.core = meshOf(c.g, { bleed: true });
  A.meta.core = c.meta;
  A.models.ringA = meshOf(buildCoreRing(34, 42, 7, 11, 18), {});
  A.models.ringB = meshOf(buildCoreRing(46, 52, 5, 12, 14), {});
  A.models.ringC = meshOf(buildCoreRing(57, 63, 4, 13, 24), {});
  if (window.__KEEP_GRIDS) window.__GRID_CORE = c.g;
}
function loadInteriorCorridor(A) {
  var c = buildCorridor();
  A.models.cor = meshOf(c.g, { bleed: true });
  A.meta.cor = c.meta;
  A.models.clamp = meshOf(buildClamp(), {});
  A.models.eblock = meshOf(buildEnergyBlock(), {});
  if (window.__KEEP_GRIDS) window.__GRID_COR = c.g;
}

// ---------- 舱内帧 ----------
function pulseFlow(t, i, n, speed) { var ph = fract(t * speed - i / n); return Math.pow(Math.max(0, Math.sin(ph * Math.PI)), 3); }

function motesFrame(ctx, N, BOX, col) {
  var sp = ctx.sp, cam = ctx.cam, t = ctx.t;
  for (var i = 0; i < N; i++) {
    var bx = hash1(i * 1.31) * BOX * 2, by = hash1(i * 2.17) * BOX * 2, bz = hash1(i * 3.11) * BOX * 2;
    var x = ((bx + t * (2 + hash1(i) * 5) - cam.pos[0]) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX + cam.pos[0];
    var y = ((by + t * 1.5 * hash1(i * 4.1) - cam.pos[1]) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX + cam.pos[1];
    var z = ((bz - cam.pos[2]) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX + cam.pos[2];
    var d = Math.sqrt(Math.pow(x - cam.pos[0], 2) + Math.pow(y - cam.pos[1], 2) + Math.pow(z - cam.pos[2], 2));
    var a = (0.2 + 0.5 * hash1(i * 5.3)) * Math.max(0, 1 - d / BOX);
    sp.add(8, x, y, z, 0.35, 0.35, 0, 0, 0, col[0], col[1], col[2], a * 1.4, 0, 0, 0);
  }
}

function interiorFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, A = ASSET;
  ctx.sky = { k: 0, tint: [1, 1, 1] };
  ctx.post = { bloom: 0.32, exposure: 1.0, vig: 0.4 };
  if (ctx.scene === 'core') coreFrame(ctx);
  else corridorFrame(ctx);
}

function coreFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, A = ASSET, objs = ctx.objs;
  ctx.env = ENV_INT;
  var breath = 0.5 + 0.5 * Math.sin(t * 1.6);
  var grp = { 1: 0.9 + 0.9 * breath };
  for (var g = 2; g <= 7; g++) grp[g] = 0.35 + 1.5 * pulseFlow(t, g - 2, 6, 0.55);
  var lights = [
    { p: [0, 128, 0], c: [0.55 * (1.2 + 0.9 * breath), 1.0 * (1.2 + 0.9 * breath), 1.4 * (1.2 + 0.9 * breath)], r: 360 },
    { p: [0, 40, 0], c: [0.25, 0.7, 0.9], r: 160 }, { p: [0, 220, 0], c: [0.25, 0.7, 0.9], r: 160 },
    { p: [-150, 126, 0], c: [0.35, 0.8, 1.0], r: 90 }, { p: [160, 221, 0], c: [0.35, 0.8, 1.0], r: 90 }
  ];
  objs.push({ model: A.models.core, R: m3ident(), pos: [0, 0, 0], groups: grp, lights: lights, glowK: 1.0 + 0.5 * breath });
  var c = [0, 128, 0];
  objs.push({ model: A.models.ringA, R: m3rotY(t * 0.42), pos: c, groups: { 1: 0.6 + 0.8 * breath }, lights: lights });
  objs.push({ model: A.models.ringB, R: m3mul(m3rotZ(0.62), m3rotY(-t * 0.31)), pos: c, groups: { 1: 0.7 + 0.6 * breath }, lights: lights });
  objs.push({ model: A.models.ringC, R: m3mul(m3rotX(-0.9), m3mul(m3rotZ(0.25), m3rotY(t * 0.2))), pos: c, groups: { 1: 0.5 + 0.7 * breath }, lights: lights });
  // 核心辉光与向核心汇聚的光屑
  var gs = 70 + 22 * breath;
  sp.add(0, c[0], c[1], c[2], gs, gs, 0, 0, 0, 0.45, 0.95, 1.3, 0.85 + 0.4 * breath, 0, 0, 0);
  sp.add(3, c[0], c[1], c[2], gs * 2.2, gs * 2.2, 0, 0, 0, 0.5, 0.95, 1.3, 0.28 + 0.15 * breath, 0, 1.6, 0);
  for (var k = 0; k < 70; k++) {
    var ph = fract(t * (0.3 + hash1(k) * 0.3) + hash1(k * 3.3));
    var a1 = hash1(k * 5.1) * 6.283, a2 = (hash1(k * 7.7) - 0.5) * 2.6;
    var rad = 110 * (1 - ph) + 26;
    sp.add(8, c[0] + Math.cos(a1) * Math.cos(a2) * rad, c[1] + Math.sin(a2) * rad * 0.9, c[2] + Math.sin(a1) * Math.cos(a2) * rad, 1.5, 1.5, 0, 0, 0, 0.5, 1.0, 1.3, ph * 1.1, 0, 0, 0);
  }
  motesFrame(ctx, 90, 70, [0.55, 0.85, 1.0]);
}

function corridorFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, A = ASSET, objs = ctx.objs, meta = A.meta.cor;
  ctx.env = ENV_COR;
  var grp = {};
  for (var g = 1; g <= 6; g++) grp[g] = 0.25 + 1.6 * pulseFlow(t, g - 1, 6, 0.9);
  grp[7] = 1.4 + 0.5 * Math.sin(t * 5);
  var lights = [];
  var cam = ctx.cam;
  // 沿廊灯光：只取镜头附近的几盏
  for (var lx = 0; lx <= meta.L + 20; lx += 50) if (Math.abs(lx - cam.pos[0]) < 170) lights.push({ p: [lx + 12, 52, 0], c: [0.4, 0.9, 1.1], r: 110 });
  var endk = sstep(300, 360, cam.pos[0]);
  lights.push({ p: [meta.endX - 10, 38, 0], c: [1.0 * (0.4 + endk * 1.1), 1.5 * (0.4 + endk * 1.1), 1.7 * (0.4 + endk * 1.1)], r: 380 });
  lights.push({ p: [-46, 18, 0], c: [0.35, 0.8, 1.0], r: 90 });
  objs.push({ model: A.models.cor, R: m3ident(), pos: [0, 0, 0], groups: grp, lights: lights, glowK: 1.1 });
  // 抽象机械：夹臂合拢/分开
  meta.frames.forEach(function (fx, fi) {
    var open = 0.5 + 0.5 * Math.sin(t * 0.9 + fi * 0.8);
    [-1, 1].forEach(function (s) {
      var zc = s * (30 + 14 * open);
      var R = s > 0 ? m3ident() : m3rotY(Math.PI);
      objs.push({ model: A.models.clamp, R: R, pos: [fx + 4, 2, zc - s * 10], lights: lights });
    });
  });
  // 能量光块：分批沿轨道前进
  var L = meta.L;
  for (var k = 0; k < 12; k++) {
    var ph = fract(t * 0.11 + k / 12 + (k % 3) * 0.013);
    var x = -10 + ph * (L - 20);
    var z = (k % 2 ? 24 : -24);
    objs.push({ model: A.models.eblock, R: m3rotY(t * 1.5 + k), pos: [x, 7, z], groups: {}, lights: lights, emiK: 1 });
    sp.add(0, x, 7, z, 9, 9, 0, 0, 0, 0.45, 0.95, 1.3, 0.5, 0, 0, 0);
    sp.add(1, x - 10, 7, z, 10, 1.4, 1, 0, 0, 0.4, 0.9, 1.3, 0.8, 0, 2.0, 0);
  }
  for (var k2 = 0; k2 < 5; k2++) {
    var ph2 = fract(t * 0.16 + k2 / 5);
    var x2 = -10 + ph2 * (L - 20);
    objs.push({ model: A.models.eblock, R: m3rotY(-t * 1.2 + k2), pos: [x2, 3, 0], groups: {}, lights: lights });
    sp.add(0, x2, 4, 0, 8, 8, 0, 0, 0, 0.5, 1.0, 1.3, 0.6, 0, 0, 0);
  }
  // 尽头腔口的辉光
  var ex = meta.endX;
  var pul = 0.85 + 0.15 * Math.sin(t * 4);
  sp.add(0, ex - 6, 38, 0, 80 * pul, 80 * pul, 0, 0, 0, 0.55, 1.0, 1.4, 0.55 * (0.35 + 0.65 * endk), 0, 0, 0);
  sp.add(3, ex - 6, 38, 0, 170, 170, 0, 0, 0, 0.55, 1.0, 1.4, 0.22 * (0.35 + 0.65 * endk), 0, 1.5, 0);
  motesFrame(ctx, 100, 60, [0.5, 0.85, 1.0]);
}

// ---------- 舱内镜头 ----------
var CAM_CORE = [
  K(24.0, [172, 221, 0], [110, 221, 0], 1.12),
  K(25.3, [134, 221, 0], [70, 205, 0], 1.12),
  K(26.0, [81, 214, 11], [0, 150, 0], 1.06),
  K(27.2, [63, 196, 53], [0, 140, 0], 1.04),
  K(28.6, [0, 172, 82], [0, 132, 0], 1.04),
  K(30.0, [-58, 158, 58], [0, 128, 0], 1.04),
  K(30.7, [-74, 148, 34], [-20, 128, 0], 1.04),
  K(31.3, [-81, 134, 13], [-100, 126, 0], 1.06),
  K(31.9, [-102, 126, 3], [-170, 126, 0], 1.1),
  K(32.4, [-120, 126, 0], [-180, 126, 0], 1.12),
  K(33.0, [-152, 126, 0], [-210, 126, 0], 1.12)
];
var CAM_COR = [
  K(33.0, [-54, 18, 0], [30, 18, 0], 1.12),
  K(34.0, [8, 21, 5], [100, 25, 0], 1.1),
  K(35.1, [98, 26, -14], [190, 30, 0], 1.04),
  K(36.2, [186, 30, 12], [270, 32, 0], 1.02),
  K(37.3, [266, 34, -6], [340, 36, 0], 1.02),
  K(38.2, [294, 36, 0], [380, 38, 0], 1.04),
  K(39.0, [312, 38, 0], [420, 38, 0], 1.08)
];
var _KS_CORE = null, _KS_COR = null;
function camCore(t) {
  if (!_KS_CORE) _KS_CORE = CAM_CORE.map(function (k) { return { t: k.t, v: k.p.concat(k.g, [k.f]) }; });
  var v = splineEval(_KS_CORE, t); return { p: v.slice(0, 3), g: v.slice(3, 6), f: v[6] };
}
function camCorridor(t) {
  if (!_KS_COR) _KS_COR = CAM_COR.map(function (k) { return { t: k.t, v: k.p.concat(k.g, [k.f]) }; });
  var v = splineEval(_KS_COR, t); return { p: v.slice(0, 3), g: v.slice(3, 6), f: v[6] };
}

// ---------- 小艇（舰外/机库） ----------
var CRAFT_PARK = [];
(function () {
  // 机库内泊位：+z 侧内壁与外壁的停放位
  var inner = [-286, -246, -206, -126, -86, -46];
  inner.forEach(function (px, i) { CRAFT_PARK.push({ p: [px + 15, -29, 15], R: 0, v: i % 2 }); });
  [-286, -246, -206].forEach(function (px, i) { CRAFT_PARK.push({ p: [px + 15, -29, 119], R: 0, v: (i + 1) % 2 }); });
})();
var CRAFT_PATROL = [
  { v: 0, z: 128, y: 12, x0: -460, x1: 420, per: 3, ph: 0.0 },
  { v: 1, z: 152, y: 34, x0: -380, x1: 500, per: 2, ph: 1.3 },
  { v: 0, z: -140, y: 20, x0: -420, x1: 460, per: 3, ph: 2.2 },
  { v: 1, z: -170, y: -6, x0: -300, x1: 520, per: 2, ph: 4.0 }
];

function craftFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, objs = ctx.objs, fp = ctx.poses ? ctx.poses[0] : flagPose(t);
  var A = ASSET;
  function putCraft(lp, dirLocal, v, thr, seed, scaleFlame) {
    var w = xfPoint(fp, lp);
    var dir = m3vec(fp.R, vnorm(dirLocal));
    var R = m3look(dir, [0, 1, 0]);
    objs.push({ model: A.models.craft[v], R: R, pos: w, lights: [], groups: { 7: 0.6 + thr * 0.8 } });
    var pose = { pos: w, R: R };
    addFlame(sp, pose, { x: -17, y: 0, z: 0, r: 2.2 }, thr, seed, t, 1);
  }
  // 停放
  CRAFT_PARK.forEach(function (c, i) {
    var w = xfPoint(fp, c.p);
    objs.push({ model: A.models.craft[c.v], R: fp.R, pos: w, lights: [], groups: { 7: 0.4 } });
    sp.add(0, w[0], w[1], w[2], 4, 4, 0, 0, 0, 0.3, 0.85, 1.0, 0.5, 0, 0, 0);
  });
  // 巡航伴飞：沿舷侧往返
  CRAFT_PATROL.forEach(function (cp, i) {
    var u = 0.5 + 0.5 * Math.sin(TAU2 * cp.per * t / TL.T + cp.ph);
    var du = Math.cos(TAU2 * cp.per * t / TL.T + cp.ph);
    var x = cp.x0 + (cp.x1 - cp.x0) * u;
    var y = cp.y + 6 * Math.sin(TAU2 * 4 * t / TL.T + i);
    putCraft([x, y, cp.z + 5 * Math.sin(TAU2 * 3 * t / TL.T + i)], [du >= 0 ? 1 : -1, 0.0, 0.05 * Math.sin(t)], cp.v, 0.9, 40 + i, 1);
  });
  // 领航艇：39–51 在镜头前方引路，穿过机库口飞向舰首
  if (t >= 38.6 && t < 60) {
    var ahead = evalCached(CAM_STRIKE, 'strike', Math.min(t + 3.0, 62.4)).p;
    var behind = evalCached(CAM_STRIKE, 'strike', Math.min(t + 2.9, 62.4)).p;
    var d = vnorm(vsub(ahead, behind));
    if (t > 51.5) { // 离队：向前上方爬升，加速远去
      var k = t - 51.5; ahead = vadd(ahead, [k * 90, k * 12, k * 9]);
      d = vnorm([1, 0.14, 0.1]);
    }
    var lp = [ahead[0], ahead[1] - 4, ahead[2] - 0.0];
    putCraft(lp, d, 0, 1.2, 77, 1);
  }
  // 返航艇：沿入口返回机库口（舰桥镜头窗外与机库飞出镜头都可见）
  var tr = t;
  if (tr >= 43 && tr < 49.5) {
    var k2 = (tr - 43) / 6.5;
    var p0 = [220, 40, 280], p1 = [90, 10, 190], p2 = [-10, -10, 122], p3 = [-110, -14, 84];
    var pos = catmull(p0, p0, p1, p2, Math.min(1, k2 * 3)); // 起段
    if (k2 > 0.33) pos = catmull(p0, p1, p2, p3, (k2 - 0.33) / 0.67);
    var pos2 = catmull(p0, p1, p2, p3, Math.min(1, (k2 + 0.02 - 0.33) / 0.67));
    var dd = vnorm(vsub(pos2, pos)); if (vlen(vsub(pos2, pos)) < 1e-3) dd = [-1, 0, -0.5];
    putCraft(pos, dd, 1, 0.5, 91, 1);
  }
  // 窗外横穿的小艇（接近舰桥与舰桥镜头）
  if (t >= 12 && t < 24) {
    var kk = (t - 12) / 12;
    putCraft([330 + kk * 20, 96 + 6 * Math.sin(kk * 4), 260 - kk * 420], [0.15, 0.0, -1], 1, 0.9, 61, 1);
    putCraft([360 + kk * 30, 112 + 5 * Math.sin(kk * 3), 240 - kk * 430], [0.1, 0.0, -1], 0, 0.9, 62, 1);
  }
  // 驶出机库的小艇（开头可见）
  if (t < 12 || t > 70) {
    var te = t < 12 ? t + 7 : t - 70;
    var kq = clamp(te / 14, 0, 1);
    var p = [catmull([-120, -8, 90], [-60, -6, 100], [40, -2, 150], [180, 14, 210], kq)];
    var pp = p[0], pq = catmull([-120, -8, 90], [-60, -6, 100], [40, -2, 150], [180, 14, 210], Math.min(1, kq + 0.03));
    putCraft(pp, vnorm(vsub(pq, pp)), 0, 1.0, 55, 1);
  }
  // 舰桥全息：中枢上方的舰队立体图形与光点
  if (t > 13 && t < 25) holoFrame(ctx, fp);
}

function holoFrame(ctx, fp) {
  var t = ctx.t, sp = ctx.sp, A = ASSET, objs = ctx.objs;
  var hub = [124, 70 + 44, 0], sc = 0.026;
  var phase = t;
  LAYOUT.forEach(function (s, i) {
    var ps = ctx.poses ? ctx.poses[i] : shipPose(s, t);
    var lp = [hub[0] + (ps.pos[0]) * sc, hub[1] + ps.pos[1] * sc * 1.6, hub[2] + ps.pos[2] * sc];
    var w = xfPoint(fp, lp);
    var mdl = s.kind === 'F' ? A.models.holoShip : A.models.holoDot;
    objs.push({ model: mdl, R: fp.R, pos: w, lights: [], emiK: s.kind === 'F' ? 1.3 : 1.0 });
    if (s.kind !== 'F') {
      var tl = m3vec(fp.R, [-1, 0, 0]);
      sp.add(1, w[0] + tl[0] * 4, w[1] + tl[1] * 4, w[2] + tl[2] * 4, 4, 0.5, -tl[0], -tl[1], -tl[2], 0.3, 0.8, 1.2, 0.8, 0, 1.5, 0);
    }
  });
  // 前方陨石群光点
  for (var k = 0; k < 8; k++) {
    var m = METS[k * 3 % METS.length];
    if (!m || m.kind === 'field') continue;
    var wp = metWorld(m, t).pos;
    if (wp[0] > 4200 || wp[0] < -100) continue;
    var lp2 = [hub[0] + wp[0] * sc, hub[1] + wp[1] * sc * 1.6, hub[2] + wp[2] * sc];
    if (Math.abs(lp2[0] - hub[0]) > 70) continue;
    objs.push({ model: A.models.holoRock, R: fp.R, pos: xfPoint(fp, lp2), lights: [], emiK: 1.1 });
  }
  // 航迹线带与扫描环
  for (var r = 0; r < 3; r++) {
    var a = t * 0.8 + r * 2.09;
    var sx = hub[0] + Math.cos(a) * 24, sz = Math.sin(a) * 24;
    var w2 = xfPoint(fp, [sx, hub[1] - 8 + r * 8, sz]);
    sp.add(0, w2[0], w2[1], w2[2], 3, 3, 0, 0, 0, 0.4, 0.9, 1.3, 0.8, 0, 0, 0);
  }
  var hc = xfPoint(fp, hub);
  sp.add(0, hc[0], hc[1], hc[2], 40, 40, 0, 0, 0, 0.25, 0.75, 1.2, 0.35 + 0.1 * Math.sin(t * 3), 0, 0, 0);
}
