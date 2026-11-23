'use strict';
// ---------- 攻击计划：陨石群、目标、四种武器的时间表 ----------
var ST = {
  tCharge: 49.4, tFire: 51.6, tBeamHit: 51.95, tCut: 56.0, tBeamEnd: 56.55,
  muzzleLocal: [549.5, 8.5, 0],
  tRef: 55,
  C: [1700, 40, -60]
};
var METS = [];        // 全部陨石实例
var STRAG = [];       // 近防炮目标
var TARGETS = {};     // 目标表
var MSL = [];         // 导弹表
var PULSES = [];      // 脉冲弹表
var PDBURSTS = [];    // 近防点射表
var DEBRIS = [];      // 碎屑发射器
var HITFX = [];       // 命中闪光事件

function metBase(posAtRef) { return [posAtRef[0] + flowS(ST.tRef), posAtRef[1], posAtRef[2]]; }
function metWorld(m, t) {
  var x = m.base[0] - flowS(t) + (m.copy ? FLOW.L : 0);
  if (m.wrapP) {
    var xmin = m.wrapMin, P = m.wrapP;
    x = m.base[0] - flowS(t);
    x = ((x - xmin) % P + P) % P + xmin;
  }
  var ang = m.rate * t + m.phase;
  return { pos: [x, m.base[1], m.base[2]], R: m.rate ? m3axis(m.axis, ang) : m3ident() };
}

function loadMeteors(A) {
  var rng = new RNG(4242);
  var C = ST.C;
  // ---- 岩石模板 ----
  var pool = { mid: [], small: [] };
  var specs = [[26, 1], [22, 2], [18, 3], [30, 4], [15, 5], [24, 6]];
  specs.forEach(function (s) { pool.mid.push(rockModel(genRock(s[0], 500 + s[1] * 13, {}))); });
  [[7, 21], [5, 22], [9, 23], [4, 24], [6, 25]].forEach(function (s) { pool.small.push(rockModel(genRock(s[0], 700 + s[1] * 11, { lobes: 4, cracks: 1, tunnel: false }))); });
  pool.large = [];
  [[44, 41], [52, 42], [60, 43]].forEach(function (s) { pool.large.push(rockModel(genRock(s[0], 900 + s[1] * 7, { lobes: 8 }))); });
  A.rocks = pool;
  // ---- 目标陨石 ----
  var flagMuz = vadd([0, 0, 0], ST.muzzleLocal);
  function mkTarget(name, r, posRef, seed, fn, noGrid) {
    var base = metBase(posRef);
    var m = { name: name, kind: 'target', r: r, base: base, rate: 0, phase: 0, axis: [0, 1, 0], copy: false };
    var g = noGrid ? null : genRock(r, seed, { lobes: 7, cracks: 3 });
    fn(m, g);
    METS.push(m); TARGETS[name] = m;
    return m;
  }
  function worldAt(m, t) { return metWorld(m, t).pos; }
  // 光束目标 M0
  mkTarget('M0', 54, [C[0] + 60, C[1] + 20, C[2] - 80], 3101, function (m, g) {
    var c52 = worldAt(m, ST.tBeamHit); var dm = vnorm(vsub(flagMuz, c52));
    var hp = vmul(dm, m.r * 0.86);
    m.hitLocal = hp; m.beamDir = dm;
    var T0 = ST.tBeamHit - 0.01, scale = 4.6 / 250;
    var frac = fractureRock(g, { r: m.r, hit: { p: hp, t: ST.tBeamHit }, splitT: 56.2, nbig: 7, nsmall: 14, heat: 1.0, T0: T0, scale: scale,
      craters: [{ p: hp, dir: vmul(dm, -1), Rw: 16, Rl: m.r * 0.8, t0: ST.tBeamHit, dur: 4.0 }] }, 3102);
    m.model = rockModel(g, frac); m.frac = frac; m.splitT = 56.2; m.craterT0 = T0;
  });
  // 脉冲目标 M1 / M2
  [['M1', 34, [C[0] - 250, C[1] - 70, C[2] + 160], 3201, 57.9], ['M2', 28, [C[0] - 150, C[1] + 150, C[2] + 190], 3301, 58.3]].forEach(function (d) {
    mkTarget(d[0], d[1], d[2], d[3], function (m, g) {
      var c = worldAt(m, 55); var toF = vnorm(vsub([0, 0, 0], c));
      var pts = [];
      for (var i = 0; i < 6; i++) {
        var o = vnorm([toF[0] + rng.range(-0.7, 0.7), toF[1] + rng.range(-0.7, 0.7), toF[2] + rng.range(-0.7, 0.7)]);
        pts.push(vmul(o, m.r * 0.9));
      }
      m.imp = pts;
      m.splitT = d[4];
    }, true);
  });
  // 导弹目标 M3 / M4
  [['M3', 44, [C[0] + 300, C[1] - 60, C[2] - 190], 3401, 59.55], ['M4', 38, [C[0] + 230, C[1] + 130, C[2] + 120], 3501, 60.0]].forEach(function (d) {
    mkTarget(d[0], d[1], d[2], d[3], function (m, g) {
      var c = worldAt(m, 55); var toF = vnorm(vsub([1300, 0, 0], c));
      var pts = [];
      for (var i = 0; i < 4; i++) { var o = vnorm([toF[0] + rng.range(-0.8, 0.8), toF[1] + rng.range(-0.8, 0.8), toF[2] + rng.range(-0.8, 0.8)]); pts.push(vmul(o, m.r * 0.9)); }
      m.imp = pts; m.splitT = d[4];
    }, true);
  });
  // 近防炮目标（游离的小岩块）
  var sp = [[640, 230, 360], [780, -210, 330], [560, 240, -350], [700, -220, -320], [350, 250, 420], [400, -240, -430]];
  sp.forEach(function (p, i) {
    var m = mkTarget('S' + i, 9 + (i % 3), p, 3600 + i * 13, function (m, g) { m.imp = []; });
    STRAG.push(m);
  });
  // 在 fx 阶段需要的命中点与时间：先建立弹道表，再回头给目标生成凹坑图
  planWeapons();
  // 目标岩石的凹坑和分片
  ['M1', 'M2', 'M3', 'M4'].forEach(function (nm) {
    var m = TARGETS[nm]; var g = genRock(m.r, nm === 'M1' ? 3201 : nm === 'M2' ? 3301 : nm === 'M3' ? 3401 : 3501, { lobes: 7, cracks: 3 });
    var craters = [], tmin = 1e9, tmax = 0;
    (m.arrive || []).forEach(function (a) { tmin = Math.min(tmin, a.t); tmax = Math.max(tmax, a.t); });
    var T0 = tmin - 0.01, scale = Math.max(0.01, (tmax - T0 + 0.8) / 250);
    m.imp.forEach(function (p, pi) {
      var first = 1e9; (m.arrive || []).forEach(function (a) { if (a.pi === pi && a.t < first) first = a.t; });
      if (first > 1e8) return;
      var dn = vnorm(p);
      var big = (nm === 'M3' || nm === 'M4');
      craters.push({ p: p, dir: vmul(dn, -1), Rw: big ? 13 : 8, Rl: big ? 18 : 11, t0: first, dur: big ? 0.9 : 0.4 });
    });
    var hp = m.imp[0];
    var frac = fractureRock(g, { r: m.r, hit: { p: hp, t: T0 }, splitT: m.splitT, nbig: nm === 'M3' || nm === 'M4' ? 6 : 4, nsmall: 9, heat: 0.9, T0: T0, scale: scale, craters: craters }, 7000 + m.r);
    m.model = rockModel(g, frac); m.frac = frac;
  });
  STRAG.forEach(function (m, si) {
    var g = genRock(m.r, 3600 + si * 13, { lobes: 5, cracks: 1, tunnel: false });
    var tmin = m.engageT + 0.5, T0 = tmin - 0.01;
    var craters = [];
    for (var k = 0; k < 3; k++) { var dd = vnorm([m.facing[0] + rng.range(-0.5, 0.5), m.facing[1] + rng.range(-0.5, 0.5), m.facing[2] + rng.range(-0.5, 0.5)]); craters.push({ p: vmul(dd, m.r * 0.85), dir: vmul(dd, -1), Rw: 3.2, Rl: 4.5, t0: tmin + k * 0.35, dur: 0.3 }); }
    var frac = fractureRock(g, { r: m.r, hit: { p: craters[0].p, t: tmin }, splitT: m.killT, nbig: 2, nsmall: 5, heat: 0.8, T0: T0, scale: 2.4 / 250, craters: craters }, 8000 + si);
    m.model = rockModel(g, frac); m.frac = frac; m.imp = craters.map(function (c) { return c.p; });
  });
  // ---- 背景陨石群（含 B 副本，保证循环）----
  var N = 0;
  // 舰船姿态采样表：用于保证陨石的流经路径不会穿过任何舰船
  var SPT = [];
  for (var ts = 30; ts <= 77; ts += 1) SPT.push({ t: ts, poses: LAYOUT.map(function (sh) { return shipPose(sh, ts); }) });
  function trackClear(m) {
    for (var q = 0; q < SPT.length; q++) {
      var w = metWorld(m, SPT[q].t).pos, P = SPT[q].poses;
      for (var i = 0; i < LAYOUT.length; i++) {
        var sh = LAYOUT[i], ps = P[i];
        var rel = [w[0] - ps.pos[0], w[1] - ps.pos[1], w[2] - ps.pos[2]];
        var loc = m3vec(m3transpose(ps.R), rel), rr = m.r * 1.1 + 18;
        var k = Math.pow((loc[0] - sh.cen[0]) / (sh.rad[0] * 0.85 + rr), 2) + Math.pow((loc[1] - sh.cen[1]) / (sh.rad[1] * 0.85 + rr), 2) + Math.pow((loc[2] - sh.cen[2]) / (sh.rad[2] * 0.85 + rr), 2);
        if (k < 1) return false;
      }
    }
    return true;
  }
  function placeBg(pos, model, r) {
    var ax = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    var m = { kind: 'bg', model: model, base: metBase(pos), axis: ax, rate: TAU2 * rng.int(1, 3) / TL.T * (rng.next() < 0.5 ? -1 : 1), phase: rng.range(0, 6.28), r: r, copy: false };
    if (!trackClear(m)) return false;
    METS.push(m); var m2 = Object.assign({}, m); m2.copy = true; METS.push(m2); N++;
    return true;
  }
  // 与目标保持间距的簇内岩块
  var tpos = [];
  for (var k in TARGETS) tpos.push({ p: worldAt(TARGETS[k], 55), r: TARGETS[k].r });
  var tries = 0;
  while (N < 38 && tries < 20000) {
    tries++;
    var huge = N < 6, big = N < 18;
    var pos = [C[0] + rng.range(-620, 620), C[1] + rng.range(-340, 340), C[2] + rng.range(-560, 560)];
    var rr = huge ? 50 : (big ? 20 : 8);
    var ok = true;
    for (var q = 0; q < tpos.length; q++) { if (vdist(pos, tpos[q].p) < tpos[q].r + rr + 90) { ok = false; break; } }
    if (!ok) continue;
    for (var q2 = 0; q2 < METS.length; q2++) { var mm = METS[q2]; if (mm.kind === 'bg' && !mm.copy) { var wp = metWorld(mm, 55).pos; if (vdist(pos, wp) < mm.r + rr + 40) { ok = false; break; } } }
    if (!ok) continue;
    var mdl = huge ? pool.large[N % pool.large.length] : (big ? pool.mid[N % pool.mid.length] : pool.small[N % pool.small.length]);
    if (!placeBg(pos, mdl, huge ? 52 : (big ? 24 : 6))) continue;
    tpos.push({ p: pos, r: rr });
  }
  // ---- 沿途漂浮岩块（周期环绕，避开舰船）----
  var field = [];
  var ships = buildLayout();
  var tries2 = 0, nf = 0;
  while (nf < 120 && tries2 < 6000) {
    tries2++;
    var y = rng.range(-620, 620), z = rng.range(-1000, 1000);
    var r2 = rng.next() < 0.3 ? rng.range(10, 22) : rng.range(3, 8);
    var okf = true;
    for (var si2 = 0; si2 < ships.length && okf; si2++) {
      var sh = ships[si2], rr2 = (sh.kind === 'F' ? 330 : (sh.kind === 'C' ? 110 : 120)) + r2 + 40;
      var dy = y - sh.base[1] - (sh.kind === 'F' ? 30 : 0), dz = z - sh.base[2];
      if (dy * dy + dz * dz < rr2 * rr2) okf = false;
    }
    if (!okf) continue;
    var mdl2 = r2 > 9 ? pool.mid[nf % pool.mid.length] : pool.small[nf % pool.small.length];
    var ax2 = vnorm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    METS.push({ kind: 'field', model: mdl2, base: [rng.range(-1000, FLOW.L - 1000) + 0, y, z], axis: ax2, rate: TAU2 * rng.int(1, 3) / TL.T * rng.sign(), phase: rng.range(0, 6.28), r: r2 * 1.5, copy: false, wrapP: FLOW.L, wrapMin: -1000 });
    nf++;
  }
}

// ---------- 武器时间表 ----------
function planWeapons() {
  var rng = new RNG(9001);
  var F = LAYOUT.filter(function (s) { return s.kind === 'F'; })[0];
  var P0 = shipPose(F, 55);
  // 脉冲弹
  PULSES.length = 0;
  var mounts = F.meta.turretMounts.map(function (m) { return { p: m.p, side: m.side, float: false }; });
  FLOATERS.forEach(function (fp) { mounts.push({ p: [fp[0], fp[1] + 8, fp[2]], side: fp[2] > 0 ? 1 : -1, float: true }); });
  var arriveM = { M1: [], M2: [] };
  mounts.forEach(function (mt, ti) {
    var tg = (ti % 2 === 0) ? TARGETS.M1 : TARGETS.M2;
    mt.target = tg; mt.t0 = 53.5 + (ti % 6) * 0.085 + (ti % 2) * 0.25;
    for (var k = 0; k < 6; k++) {
      for (var b = 0; b < 3; b++) {
        var tf = mt.t0 + k * 0.5 + b * 0.07;
        var pi = (ti * 7 + k * 3 + b) % 6;
        var pF = shipPose(F, tf), headW = xfPoint(pF, mt.p);
        var hw = vadd(metWorld(tg, tf + 1.6).pos, tg.imp[pi]);
        var wm = vadd(headW, vmul(vnorm(vsub(hw, headW)), 30));
        var dist = vdist(wm, hw), flight = dist / 1050;
        var hit = vadd(metWorld(tg, tf + flight).pos, tg.imp[pi]);
        dist = vdist(wm, hit); flight = dist / 1050;
        PULSES.push({ ti: ti, tf: tf, ta: tf + flight, tg: tg, pi: pi, float: mt.float, p0: wm, p1: hit });
        arriveM[tg.name].push({ t: tf + flight, pi: pi });
      }
    }
  });
  TARGETS.M1.arrive = arriveM.M1; TARGETS.M2.arrive = arriveM.M2;
  ST.mounts = mounts;
  // 近防炮：每艘近卫舰对最近的游离岩块点射
  PDBURSTS.length = 0;
  STRAG.forEach(function (m, i) { m.engageT = 54.6 + 0.35 * i; m.killT = m.engageT + 2.3; m.facing = [0, 0, 0]; });
  var ces = LAYOUT.filter(function (s) { return s.kind === 'C'; });
  STRAG.forEach(function (m, i) {
    var wp = metWorld(m, m.engageT + 1).pos;
    // 选择 4 艘最近的近卫舰参战
    var cand = ces.map(function (c) { return { c: c, d: vdist(wp, c.base) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 4);
    m.shooters = cand.map(function (x) { return x.c; });
    var fc = vnorm(vsub(cand[0].c.base, wp)); m.facing = fc;
    cand.forEach(function (cc) {
      cc.c.meta.pd.forEach(function (pd, pi) {
        if ((pi + i) % 3 !== 0) return;
        var ph = rng.range(0, 0.6);
        for (var k = 0; k < 4; k++) {
          var tb0 = m.engageT + 0.05 + ph + k * 0.62, tb1 = tb0 + 0.42;
          if (tb0 > m.killT) break;
          PDBURSTS.push({ ship: cc.c, pd: pi, tb0: tb0, tb1: tb1, tg: m });
        }
      });
    });
  });
  // 导弹
  MSL.length = 0;
  var vgs = LAYOUT.filter(function (s) { return s.kind === 'V' && s.base[0] >= 860; }).sort(function (a, b) { return b.base[0] - a.base[0]; }).slice(0, 8);
  var arrive34 = { M3: [], M4: [] };
  vgs.forEach(function (v, vi) {
    v.fireIdx = vi;
    var tg = (vi % 2 === 0) ? TARGETS.M3 : TARGETS.M4;
    for (var c = 0; c < 4; c++) for (var side = -1; side <= 1; side += 2) {
      var tl = 56.0 + vi * 0.14 + c * 0.3 + (side > 0 ? 0.05 : 0);
      var slot = null; v.meta.rack.forEach(function (r) { if (r.col === c * 2 && r.row === 0 && r.side === side) slot = r; });
      if (!slot) continue;
      var pi = (vi * 3 + c * 2 + (side > 0 ? 1 : 0)) % 4;
      var pose = shipPose(v, tl);
      var p0 = xfPoint(pose, [slot.p[0], 8, slot.p[2]]);
      var tf = 1.55 + 0.5 * rng.next();
      var hit = vadd(metWorld(tg, tl + tf).pos, tg.imp[pi]);
      var out = m3vec(pose.R, [0, 0.0, side]);
      var up = [0, 1, 0];
      MSL.push({ v: v, tl: tl, p0: p0, hit: hit, tg: tg, pi: pi, tf: tf, coast: 0.5, arc: rng.range(25, 70), side: side, up: up, out: out, ta: tl + tf, col: c, seed: rng.next() });
      arrive34[tg.name].push({ t: tl + tf, pi: pi });
    }
  });
  TARGETS.M3.arrive = arrive34.M3; TARGETS.M4.arrive = arrive34.M4;
}

// ---------- 导弹隐藏分组（发射后） ----------
function missileHiddenFn(s, t) {
  var h = {};
  if (s.fireIdx === undefined) return h;
  for (var c = 0; c < 4; c++) {
    var tl = 56.0 + s.fireIdx * 0.14 + c * 0.3 + 0.0;
    if (t >= tl) h[1 + c] = -1;
  }
  return h;
}
