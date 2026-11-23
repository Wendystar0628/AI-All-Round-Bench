'use strict';
// ---------- 光效与武器渲染（全部是时间的纯函数，便于任意帧定位）----------
var CUBES = { data: new Float32Array(12 * 16000), n: 0 };
var ROCKCOL = [[0.20, 0.14, 0.10], [0.15, 0.11, 0.09], [0.26, 0.19, 0.14], [0.07, 0.06, 0.06], [0.12, 0.20, 0.22], [0.22, 0.16, 0.12]];
var _F = null, _FposeCache = { t: -1, pose: null };

function flagPose(t) { if (_FposeCache.t !== t) { _FposeCache.t = t; _FposeCache.pose = shipPose(LAYOUT[0], t); } return _FposeCache.pose; }
function muzzleWorld(t) { return xfPoint(flagPose(t), ST.muzzleLocal); }
function tgtPoint(tg, t, local) { return vadd(metWorld(tg, t).pos, local); }

function rampv(t, a, b) { return sstep(a, b, t); }

// ---------- 炮台瞄准（头部旋转） ----------
function aimRot(restDir, aimDir, k) {
  var d = vnorm(vmix(restDir, aimDir, k));
  return m3look(d, [0, 1, 0]);
}
function pulseAimFn(tm, idx, pose, t) {
  var side = tm.side;
  var ti = tm.float ? (idx - 100 + 12) : tm.idx;
  if (idx >= 100) ti = 12 + (idx - 100);
  var mt = ST.mounts ? ST.mounts[ti] : null;
  var restR = m3mul(pose.R, headRot(side * 0.12, 0.18));
  var restDir = m3vec(restR, [1, 0, 0]);
  if (!mt || t < 51.8 || t > 61.5) return null;
  var wp = xfPoint(pose, tm.p);
  var tg = mt.target;
  var aim = vnorm(vsub(tgtPoint(tg, t, tg.imp[0]), wp));
  var k = sstep(52.0, 53.2, t) * (1 - sstep(59.0, 60.5, t));
  var R = aimRot(restDir, aim, k);
  // 闪光：最近一发
  var fl = 0.05;
  var tt = t - mt.t0;
  if (tt > -0.1 && tt < 6) {
    var kk = Math.floor(tt / 0.5), best = 0;
    for (var q = Math.max(0, kk - 1); q <= kk && q < 6; q++) for (var b = 0; b < 3; b++) {
      var dt = tt - (q * 0.5 + b * 0.07);
      if (dt >= 0) best = Math.max(best, Math.exp(-dt / 0.1));
    }
    fl = 0.05 + best * 1.6;
    // 蓄势聚光
    if (tt > -0.25 && tt < 0) fl = Math.max(fl, 0.9 * (1 + tt / 0.25));
  }
  return { R: R, flash: fl };
}
var PDMAP = null;
function pdAimFn(s, pi, pd, pose, t) {
  if (!PDMAP) { PDMAP = {}; PDBURSTS.forEach(function (b) { var k = b.ship.id * 64 + b.pd; (PDMAP[k] || (PDMAP[k] = [])).push(b); }); }
  var list = PDMAP[s.id * 64 + pi];
  if (!list) return null;
  var act = null, last = null;
  for (var i = 0; i < list.length; i++) { var b = list[i]; if (t > b.tb0 - 0.45 && t < b.tb1 + 0.6) { act = b; break; } }
  if (!act) return null;
  var restR = m3mul(pose.R, headRot(pd.side * 0.25, 0.2));
  var restDir = m3vec(restR, [1, 0, 0]);
  var wp = xfPoint(pose, pd.p);
  var tg = act.tg;
  var aim = vnorm(vsub(tgtPoint(tg, t, tg.imp[0]), wp));
  var k = sstep(act.tb0 - 0.45, act.tb0 - 0.05, t) * (1 - sstep(act.tb1 + 0.1, act.tb1 + 0.6, t));
  var fl = 0.04;
  if (t >= act.tb0 && t <= act.tb1) fl = 0.7 + 0.5 * (Math.sin(t * 68 + pi) > 0 ? 1 : 0);
  else if (t > act.tb1) fl = 0.45 * Math.exp(-(t - act.tb1) / 0.7);
  return { R: aimRot(restDir, aim, k), flash: fl };
}

// ---------- 帧准备：灯光、分组发光 ----------
function fxPrepare(ctx) {
  ctx.missileHidden = missileHiddenFn;
  ctx.pdAim = pdAimFn; ctx.pulseAim = pulseAimFn;
  CUBES.n = 0;
  var t = ctx.t;
  // 旗舰主炮分段发光
  var g = {};
  var idle = 0.28;
  for (var i = 1; i <= 5; i++) {
    var ramp = rampv(t, ST.tCharge + 0.32 * (i - 1), ST.tCharge + 0.32 * (i - 1) + 0.55);
    var decay = 1 - rampv(t, ST.tBeamEnd, ST.tBeamEnd + 2.2);
    g[i] = idle + (1.7 - idle) * ramp * (t < ST.tBeamEnd ? 1 : decay) + 0.0;
  }
  var mr = rampv(t, ST.tCharge + 0.8, ST.tFire) * (t < ST.tBeamEnd ? 1 : 1 - rampv(t, ST.tBeamEnd, ST.tBeamEnd + 1.5));
  g[6] = 0.35 + 2.4 * mr;
  ctx.flagGroups = g;
}

// ---------- 陨石 ----------
function meteorFrame(ctx) {
  var t = ctx.t, cam = ctx.cam;
  // 远处陨石群的淡淡尘雾，使它在远景里读作一簇而不是零散的点
  var Sx = flowS(t);
  [0, FLOW.L].forEach(function (off) {
    var cx = ST.C[0] + flowS(ST.tRef) - Sx + off;
    var d = Math.abs(cx - cam.pos[0]);
    if (d > 500) ctx.sp.add(0, cx, ST.C[1], ST.C[2], 520, 420, 0, 0, 0, 0.55, 0.42, 0.36, 0.05, 0, 0, 0);
  });
  for (var i = 0; i < METS.length; i++) {
    var m = METS[i];
    var w = metWorld(m, t);
    var d = vdist(w.pos, cam.pos);
    if (d > 9000) continue;
    var o = { model: m.model, R: w.R, pos: w.pos, lights: [], emiK: 1 };
    if (m.kind === 'target' && m.copy === false && m.frac) { o.timeOverride = t; o.fade = 1 - sstep(66.0, 70.8, t); }
    if (!(o.fade !== undefined && o.fade <= 0.001)) ctx.objs.push(o);
    if (m.kind === 'target') {
      // 复制体：保持完整（时间设为极小，使其不裂）
      var b = { model: m.model, R: w.R, pos: [w.pos[0] + FLOW.L, w.pos[1], w.pos[2]], lights: [], timeOverride: -1000 };
      ctx.objs.push(b);
    }
  }
}

// ---------- 碎屑立方体 ----------
function addCube(cam, x, y, z, size, ax, ay, az, ang, r, g, b, heat) {
  var C = CUBES; if (C.n >= 16000) return;
  var o = C.n * 12, d = C.data;
  d[o] = x - cam.pos[0]; d[o + 1] = y - cam.pos[1]; d[o + 2] = z - cam.pos[2]; d[o + 3] = size;
  d[o + 4] = ax; d[o + 5] = ay; d[o + 6] = az; d[o + 7] = ang;
  d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = heat;
  C.n++;
}
function debrisEvent(ctx, ev) {
  var t = ctx.t, tau = t - ev.t0;
  if (tau < 0) return;
  var S = flowS(t);
  var cam = ctx.cam;
  var base = ev.tg.base;
  var o = ev.local;
  var ox = base[0] + o[0], oy = base[1] + o[1], oz = base[2] + o[2];
  var life = ev.life || 20;
  if (tau > life) return;
  var n = ev.n, sd = ev.seed;
  var cf = t > 66.0 ? (t - 66.0) / 4.8 : 0;
  for (var i = 0; i < n; i++) {
    if (cf > 0 && hash1(sd * 0.7 + i * 9.31) < cf) continue;
    var h0 = hash1(sd + i * 1.713), h1 = hash1(sd * 1.7 + i * 3.11), h2 = hash1(sd * 2.3 + i * 5.07), h3 = hash1(sd * 3.1 + i * 7.9), h4 = hash1(sd + i * 11.3);
    var dx, dy, dz;
    var px = ox, py = oy, pz = oz;
    if (ev.vol) {
      // 体积内随机点
      var u = h0 * 2 - 1, v = h1 * 2 * Math.PI, rr = Math.cbrt(h2) * ev.vol;
      var q = Math.sqrt(1 - u * u);
      var lx = q * Math.cos(v) * rr, ly = u * rr, lz = q * Math.sin(v) * rr;
      px += lx; py += ly; pz += lz;
      var ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      dx = lx / ll + (h3 - 0.5) * 0.5; dy = ly / ll + (h4 - 0.5) * 0.5; dz = lz / ll + (hash1(sd + i * 2.9) - 0.5) * 0.5;
    } else {
      var u2 = h0 * 2 - 1, v2 = h1 * 2 * Math.PI, q2 = Math.sqrt(1 - u2 * u2);
      dx = q2 * Math.cos(v2); dy = u2; dz = q2 * Math.sin(v2);
      if (ev.bias) { dx += ev.bias[0] * ev.bk; dy += ev.bias[1] * ev.bk; dz += ev.bias[2] * ev.bk; }
    }
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    var spd = ev.spd[0] + (ev.spd[1] - ev.spd[0]) * h3;
    var kd = ev.drag || 0.5;
    var s = (1 - Math.exp(-kd * tau)) / kd;
    // 群块边长
    var side = h4 < 0.62 ? 1 : (h4 < 0.92 ? 2 : 3);
    var ang = (h2 - 0.5) * 2 * (ev.spin || 5) * tau * (1.0 - 0.0);
    var ax = h1 - 0.5, ay = h2 - 0.5, az = h0 - 0.5; var al = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= al; ay /= al; az /= al;
    var cx = px + dx * spd * s - S, cy = py + dy * spd * s, cz = pz + dz * spd * s;
    var ci = Math.floor(h3 * 5.99);
    var col = ROCKCOL[ci];
    var heat = ev.heat * Math.exp(-tau / (ev.cool || 1.1)) * (0.5 + 0.5 * h0);
    if (side === 1) addCube(cam, cx, cy, cz, 1, ax, ay, az, ang, col[0], col[1], col[2], heat);
    else {
      var cosA = Math.cos(ang), sinA = Math.sin(ang), off0 = -(side - 1) / 2;
      for (var a = 0; a < side; a++) for (var b = 0; b < side; b++) for (var c = 0; c < side; c++) {
        if (side === 3 && (a + b + c) % 2 === 1 && h0 > 0.5) continue;
        var lx2 = off0 + a, ly2 = off0 + b, lz2 = off0 + c;
        // Rodrigues
        var cr0 = ay * lz2 - az * ly2, cr1 = az * lx2 - ax * lz2, cr2 = ax * ly2 - ay * lx2, dt2 = (ax * lx2 + ay * ly2 + az * lz2) * (1 - cosA);
        var rx = lx2 * cosA + cr0 * sinA + ax * dt2, ry = ly2 * cosA + cr1 * sinA + ay * dt2, rz = lz2 * cosA + cr2 * sinA + az * dt2;
        addCube(cam, cx + rx, cy + ry, cz + rz, 1, ax, ay, az, ang, col[0], col[1], col[2], heat);
      }
    }
  }
}
var DEBPLAN = null;
function planDebris() {
  DEBPLAN = [];
  var M0 = TARGETS.M0, sd = 1;
  function ev(o) { o.seed = (sd++) * 13.37; DEBPLAN.push(o); }
  // 光束凹坑喷溅
  for (var t = ST.tBeamHit + 0.2; t < 56.4; t += 0.18) ev({ t0: t, tg: M0, local: vadd(M0.hitLocal, [0, 0, 0]), n: 8, spd: [20, 75], bias: M0.beamDir, bk: 1.6, heat: 1.0, drag: 0.55, spin: 6, cool: 1.0 });
  ev({ t0: 56.2, tg: M0, local: [0, 0, 0], vol: M0.r * 0.85, n: 150, spd: [10, 55], heat: 1.2, drag: 0.4, spin: 3, cool: 1.8 });
  ev({ t0: 56.5, tg: M0, local: [0, 0, 0], vol: M0.r * 0.5, n: 60, spd: [30, 90], heat: 1.0, drag: 0.5, spin: 6, cool: 1.0 });
  // 脉冲命中
  PULSES.forEach(function (p) { if (p.pi % 2 === 0) ev({ t0: p.ta, tg: p.tg, local: p.tg.imp[p.pi], n: 3, spd: [14, 48], bias: vnorm(p.tg.imp[p.pi]), bk: 1.4, heat: 0.9, drag: 0.7, spin: 7, cool: 0.8 }); });
  ['M1', 'M2'].forEach(function (nm) { var m = TARGETS[nm]; ev({ t0: m.splitT, tg: m, local: [0, 0, 0], vol: m.r * 0.8, n: 70, spd: [8, 45], heat: 0.9, drag: 0.45, spin: 4, cool: 1.5 }); });
  // 近防炮命中
  PDBURSTS.forEach(function (b, i) { if (i % 2 === 0) { var m = b.tg; var d = vdist(xfPoint(shipPose(b.ship, b.tb0), b.ship.meta.pd[b.pd].p), tgtPoint(m, b.tb0, [0, 0, 0])); ev({ t0: b.tb0 + d / 720 + 0.05, tg: m, local: m.imp[i % m.imp.length], n: 3, spd: [10, 40], bias: m.facing, bk: 1.3, heat: 0.6, drag: 0.8, spin: 9, cool: 0.5 }); } });
  STRAG.forEach(function (m) { ev({ t0: m.killT - 0.1, tg: m, local: [0, 0, 0], vol: m.r * 0.8, n: 26, spd: [10, 50], heat: 0.8, drag: 0.5, spin: 6, cool: 1.0 }); });
  // 导弹
  MSL.forEach(function (ms) { ev({ t0: ms.ta + 0.45, tg: ms.tg, local: ms.tg.imp[ms.pi], n: 7, spd: [20, 70], bias: vnorm(ms.tg.imp[ms.pi]), bk: 1.2, heat: 1.1, drag: 0.5, spin: 5, cool: 1.1 }); });
  ['M3', 'M4'].forEach(function (nm) { var m = TARGETS[nm]; ev({ t0: m.splitT, tg: m, local: [0, 0, 0], vol: m.r * 0.85, n: 120, spd: [10, 60], heat: 1.2, drag: 0.4, spin: 3, cool: 1.8 }); ev({ t0: m.splitT + 0.3, tg: m, local: [0, 0, 0], vol: m.r * 0.5, n: 50, spd: [30, 90], heat: 1.0, drag: 0.5, spin: 6, cool: 1.0 }); });
}

// ---------- 光效帧 ----------
function fxFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, cam = ctx.cam;
  if (!DEBPLAN) planDebris();
  var fp = flagPose(t);
  // 碎屑
  if (t > ST.tBeamHit) { for (var i = 0; i < DEBPLAN.length; i++) { var e = DEBPLAN[i]; if (t >= e.t0) debrisEvent(ctx, e); } }
  fxBeam(ctx, fp);
  fxPulses(ctx);
  fxPD(ctx);
  fxMissiles(ctx);
  fxShatterGlow(ctx);
}

function fxBeam(ctx, fp) {
  var t = ctx.t, sp = ctx.sp;
  var M0 = TARGETS.M0;
  var P = muzzleWorld(t);
  var tp = tgtPoint(M0, t, M0.hitLocal);
  var dv = vsub(tp, P), L = vlen(dv), dir = vmul(dv, 1 / L);
  var Lb = L - 3;
  var cc = rampv(t, ST.tCharge, ST.tFire);
  // 蓄势：聚光球 + 向心光屑
  if (t > ST.tCharge && t < ST.tFire + 0.05) {
    var sz = 4 + 40 * cc * cc;
    sp.add(0, P[0] + dir[0] * 2, P[1] + dir[1] * 2, P[2] + dir[2] * 2, sz, sz, 0, 0, 0, 0.45, 0.95, 1.3, 1.0 + cc, 0, 0, 0);
    sp.add(3, P[0], P[1], P[2], sz * 2.2, sz * 2.2, 0, 0, 0, 0.5, 0.95, 1.3, 0.55 * cc, 0, 2.0, 0);
    for (var k = 0; k < 22; k++) {
      var fr = fract(t * (1.8 + hash1(k) * 0.9) + hash1(k * 3.3));
      var rad = (1 - fr) * (30 + 50 * (1 - cc));
      var a1 = hash1(k * 7.1) * 6.283, a2 = (hash1(k * 5.3) - 0.5) * 3.0;
      var up = [0, 1, 0], rr = vnorm(vcross(dir, up)), uu = vcross(rr, dir);
      var px = P[0] + dir[0] * (6 + rad * 0.3) + (rr[0] * Math.cos(a1) + uu[0] * Math.sin(a1)) * rad;
      var py = P[1] + dir[1] * (6 + rad * 0.3) + (rr[1] * Math.cos(a1) + uu[1] * Math.sin(a1)) * rad;
      var pz = P[2] + dir[2] * (6 + rad * 0.3) + (rr[2] * Math.cos(a1) + uu[2] * Math.sin(a1)) * rad;
      sp.add(8, px, py, pz, 1.2, 1.2, 0, 0, 0, 0.5, 1.0, 1.3, cc * fr * 1.4, 0, 0, 0);
    }
    ctx.lights.push({ p: P, c: [0.4 * cc * 2.0, 0.9 * cc * 2.0, 1.3 * cc * 2.0], r: 280 });
  }
  if (t >= ST.tFire) {
    var tt = t - ST.tFire;
    var Hh = Math.min(Lb, 3200 * tt);
    var Tl = t > ST.tCut ? Math.min(Lb, 3200 * (t - ST.tCut)) : 0;
    if (Tl < Lb - 0.5) {
      var w0 = 11 * rampv(tt, 0, 0.18) * (t > ST.tCut - 0.55 ? 1 - 0.75 * rampv(t, ST.tCut - 0.55, ST.tBeamEnd) : 1);
      var pul = 1 + 0.07 * Math.sin(t * 22) + 0.04 * Math.sin(t * 37 + 1);
      var wv = w0 * pul;
      var nseg = Math.max(1, Math.min(60, Math.ceil((Hh - Tl) / 150)));
      for (var sg = 0; sg < nseg; sg++) {
        var s0b = Tl + (Hh - Tl) * sg / nseg, s1b = Tl + (Hh - Tl) * (sg + 1) / nseg;
        var midb = (s0b + s1b) * 0.5, hlb = (s1b - s0b) * 0.5;
        sp.add(4, P[0] + dir[0] * midb, P[1] + dir[1] * midb, P[2] + dir[2] * midb, hlb + 0.5, wv * 2.2, dir[0], dir[1], dir[2], 0.4, 0.8, 1.25, 1.35, 0.3, 1.0, sg === nseg - 1 ? -(s0b + 1) : s0b);
      }
      // 近炮口较粗的光团，使束身起射处更厚
      var gl = wv * (3.8 + 0.6 * Math.sin(t * 30));
      sp.add(0, P[0] + dir[0] * 12, P[1] + dir[1] * 12, P[2] + dir[2] * 12, gl, gl, 0, 0, 0, 0.5, 0.95, 1.3, 1.3 * (w0 / 11), 0, 0, 0);
      // 起射光环
      for (var r = 0; r < 4; r++) {
        var rt = tt - r * 0.1;
        if (rt > 0 && rt < 0.8) {
          var rs = 10 + 62 * Math.sqrt(rt / 0.8), ra = (1 - rt / 0.8);
          sp.add(2, P[0] + dir[0] * (10 + rt * 260), P[1] + dir[1] * (10 + rt * 260), P[2] + dir[2] * (10 + rt * 260), rs, rs, 0, 0, 0, 0.5, 0.95, 1.3, ra * 0.9, 0, 0.07, 0);
        }
      }
      // 沿束身分布的光团（保证端射/远观时有体积）
      for (var q = 0; q < 12; q++) {
        var s0 = Tl + (Hh - Tl) * (q + 0.5) / 12;
        var wq = w0 * 2.4 * (0.9 + 0.2 * Math.sin(t * 9 + q * 1.3));
        sp.add(0, P[0] + dir[0] * s0, P[1] + dir[1] * s0, P[2] + dir[2] * s0, wq, wq, 0, 0, 0, 0.35, 0.8, 1.2, 0.5, 0, 0, 0);
      }
      ctx.lights.push({ p: vadd(P, vmul(dir, 14)), c: [0.7 * (w0 / 11) + 0.3, 1.5 * (w0 / 11) + 0.3, 2.2 * (w0 / 11) + 0.3], r: 420 });
    }
    // 命中点
    var reached = tt * 3200 >= Lb;
    var tl2 = Math.min(1, Math.max(0, t - ST.tBeamHit));
    var beamOn = t < ST.tBeamEnd && Tl < Lb - 0.5;
    if (reached && (beamOn || t < ST.tBeamEnd + 0.8)) {
      var hw = tp;
      var fade = beamOn ? 1 : Math.max(0, 1 - (t - ST.tBeamEnd) / 0.8);
      var heatk = rampv(t, ST.tBeamHit, 55.5);
      var gs = 20 + 30 * heatk + 4 * Math.sin(t * 35);
      sp.add(0, hw[0] - dir[0] * 4, hw[1] - dir[1] * 4, hw[2] - dir[2] * 4, gs * 1.5, gs * 1.5, 0, 0, 0, 1.3, 0.75, 0.35, (0.8 + 0.5 * heatk) * fade, 0, 0, 0);
      sp.add(9, hw[0] - dir[0] * 3, hw[1] - dir[1] * 3, hw[2] - dir[2] * 3, gs * 0.9, gs * 0.9, 0, 0, 0, 1.4, 0.85, 0.5, 1.1 * fade, t * 3, 0, 0);
      sp.add(3, hw[0] - dir[0] * 3, hw[1] - dir[1] * 3, hw[2] - dir[2] * 3, gs * 2.8, gs * 2.8, 0, 0, 0, 1.2, 0.8, 0.5, 0.4 * fade, 0, 1.6, 0);
      // 迸溅的火星
      for (var k2 = 0; k2 < 26; k2++) {
        var ph = fract(t * (1.1 + hash1(k2) * 0.8) + hash1(k2 * 9.1));
        var sx = (hash1(k2 * 3.7) - 0.5), sy = (hash1(k2 * 5.9) - 0.5), sz2 = (hash1(k2 * 8.3) - 0.5);
        var spd = 60 + hash1(k2 * 2.7) * 140;
        var d2 = vnorm([-dir[0] * 1.2 + sx * 2, -dir[1] * 1.2 + sy * 2, -dir[2] * 1.2 + sz2 * 2]);
        var ds = spd * ph;
        sp.add(8, hw[0] + d2[0] * ds, hw[1] + d2[1] * ds, hw[2] + d2[2] * ds, 1.8, 1.8, 0, 0, 0, 1.4, 0.7, 0.28, (1 - ph) * 1.5 * fade, 0, 0, 0);
      }
      ctx.lights.push({ p: vsub(hw, vmul(dir, 14)), c: [2.6 * fade * (0.5 + heatk), 1.2 * fade * (0.5 + heatk), 0.4 * fade * (0.5 + heatk)], r: 300 });
    }
    // 断开后的余辉与光屑沿射向散去
    if (t > ST.tCut) {
      var ta = t - ST.tCut;
      for (var k3 = 0; k3 < 36; k3++) {
        var s1 = Math.min(Lb, 120 + hash1(k3 * 1.7) * Lb * 0.9) ;
        var drift = 260 * ta * (0.4 + hash1(k3 * 4.1));
        var pos = s1 + drift;
        if (pos > Lb) continue;
        var fa = Math.max(0, 1 - ta / 2.2) * (0.5 + 0.5 * hash1(k3 * 7.7));
        if (fa <= 0) continue;
        var lat = (hash1(k3 * 6.1) - 0.5) * 30 * (1 + ta), lat2 = (hash1(k3 * 9.1) - 0.5) * 30 * (1 + ta);
        var up2 = vnorm(vcross(dir, [0, 1, 0])), uu2 = vcross(up2, dir);
        sp.add(8, P[0] + dir[0] * pos + up2[0] * lat + uu2[0] * lat2, P[1] + dir[1] * pos + up2[1] * lat + uu2[1] * lat2, P[2] + dir[2] * pos + up2[2] * lat + uu2[2] * lat2, 2.2, 2.2, 0, 0, 0, 0.5, 1.0, 1.3, fa * 1.1, 0, 0, 0);
      }
    }
  }
  // 炮口余辉
  if (t > ST.tCharge && t < ST.tBeamEnd + 2.5) {
    var mg = t < ST.tFire ? 0 : (t < ST.tBeamEnd ? 1 : Math.max(0, 1 - (t - ST.tBeamEnd) / 2.5));
    if (mg > 0) sp.add(0, P[0], P[1], P[2], 36 * mg + 8, 36 * mg + 8, 0, 0, 0, 0.45, 0.95, 1.3, 0.9 * mg, 0, 0, 0);
  }
}

// 脉冲弹
function fxPulses(ctx) {
  var t = ctx.t, sp = ctx.sp, nLight = 0, nFlash = 0;
  for (var i = 0; i < PULSES.length; i++) {
    var p = PULSES[i];
    if (t < p.tf - 0.02 || t > p.ta + 0.6) continue;
    var dv = vsub(p.p1, p.p0), L = vlen(dv), dir = vmul(dv, 1 / L);
    if (t >= p.tf && t <= p.ta) {
      var u = (t - p.tf) / (p.ta - p.tf);
      var H = vadd(p.p0, vmul(dir, L * u));
      var tail = 30;
      var cx = H[0] - dir[0] * tail * 0.5, cy = H[1] - dir[1] * tail * 0.5, cz = H[2] - dir[2] * tail * 0.5;
      sp.add(1, cx, cy, cz, tail * 0.5, 3.6, dir[0], dir[1], dir[2], 0.45, 1.3, 0.85, 1.5, 0, 2.2, 0);
      sp.add(0, H[0], H[1], H[2], 9, 9, 0, 0, 0, 0.5, 1.4, 0.95, 1.3, 0, 0, 0);
    }
    // 炮口闪光
    if (t >= p.tf && t < p.tf + 0.12) {
      var fl = 1 - (t - p.tf) / 0.12;
      sp.add(0, p.p0[0], p.p0[1], p.p0[2], 14 * fl + 3, 14 * fl + 3, 0, 0, 0, 0.5, 1.4, 1.0, 1.4 * fl, 0, 0, 0);
      if (nFlash < 7 && Math.abs(p.p0[0] - ctx.cam.pos[0]) < 900) { ctx.lights.push({ p: p.p0, c: [0.5 * fl * 1.6, 1.4 * fl * 1.6, 1.0 * fl * 1.6], r: 80 }); nFlash++; }
    }
    // 命中爆闪
    if (t >= p.ta && t < p.ta + 0.35) {
      var f2 = 1 - (t - p.ta) / 0.35;
      var H2 = p.tg === null ? p.p1 : vadd(metWorld(p.tg, t).pos, p.tg.imp[p.pi]);
      sp.add(9, H2[0], H2[1], H2[2], 12 * f2 + 4, 12 * f2 + 4, 0, 0, 0, 1.4, 1.2, 0.7, 1.4 * f2, i * 1.3, 0, 0);
      sp.add(0, H2[0], H2[1], H2[2], 26 * f2, 26 * f2, 0, 0, 0, 1.2, 0.7, 0.3, 0.7 * f2, 0, 0, 0);
      for (var k = 0; k < 5; k++) {
        var dd = vnorm([hash1(i + k * 3.1) - 0.5, hash1(i * 2 + k * 5.3) - 0.5, hash1(i * 3 + k * 7.7) - 0.5]);
        var s = (t - p.ta) * (80 + hash1(k + i) * 70);
        sp.add(8, H2[0] + dd[0] * s, H2[1] + dd[1] * s, H2[2] + dd[2] * s, 1.3, 1.3, 0, 0, 0, 1.3, 0.8, 0.35, f2, 0, 0, 0);
      }
      if (t < p.ta + 0.1 && nLight < 6) { ctx.lights.push({ p: H2, c: [2.0, 1.0, 0.4], r: 160 }); nLight++; }
    }
  }
}

// 近防炮点射
function fxPD(ctx) {
  var t = ctx.t, sp = ctx.sp, nPD = 0;
  for (var i = 0; i < PDBURSTS.length; i++) {
    var b = PDBURSTS[i];
    if (t < b.tb0 - 0.02 || t > b.tb1 + 1.3) continue;
    var pose = ctx.poses ? ctx.poses[b.ship.id] : shipPose(b.ship, t);
    var pd = b.ship.meta.pd[b.pd];
    var hp = xfPoint(pose, pd.p);
    var tg = b.tg;
    var aimP = tgtPoint(tg, t, tg.imp[(i) % tg.imp.length]);
    var dv = vsub(aimP, hp), D = vlen(dv), dir = vmul(dv, 1 / D);
    var P0 = vadd(hp, vmul(dir, 14));
    var v = 760, spacing = 5.5;
    var headD = Math.min(D - 8, v * Math.max(0, t - b.tb0));
    var tailD = Math.max(0, v * (t - b.tb1));
    if (tailD < headD - 0.5) {
      var len = headD - tailD;
      var mid = (headD + tailD) * 0.5;
      sp.add(7, P0[0] + dir[0] * mid, P0[1] + dir[1] * mid, P0[2] + dir[2] * mid, len * 0.5, 0.9, dir[0], dir[1], dir[2], 1.5, 1.1, 0.55, 1.5, tailD / spacing, len / spacing, 0);
    }
    // 炮口交替闪光
    if (t >= b.tb0 && t <= b.tb1) {
      var alt = Math.sin(t * 68 + b.pd) > 0 ? 1 : -1;
      var side = m3vec(pose.R, [0, 0, alt * 2]);
      var fk = 0.6 + 0.4 * Math.sin(t * 140);
      sp.add(0, P0[0] + side[0], P0[1] + side[1], P0[2] + side[2], 5 * fk + 2, 5 * fk + 2, 0, 0, 0, 1.5, 1.1, 0.5, 1.2, 0, 0, 0);
      if (nPD < 6 && vdist(P0, ctx.cam.pos) < 700) { ctx.lights.push({ p: P0, c: [1.3 * fk, 0.9 * fk, 0.4 * fk], r: 46 }); nPD++; }
    }
    // 命中短闪
    var arr0 = b.tb0 + (D - 8) / v, arr1 = b.tb1 + (D - 8) / v;
    if (t >= arr0 && t <= arr1 + 0.05) {
      var k = Math.floor(t * 26 + i);
      var hpt = tgtPoint(tg, t, tg.imp[k % tg.imp.length]);
      var flick = 0.5 + 0.5 * Math.sin(t * 90 + i * 2.1);
      sp.add(9, hpt[0], hpt[1], hpt[2], 3.6 + 2 * flick, 3.6 + 2 * flick, 0, 0, 0, 1.5, 1.0, 0.45, 1.1, k * 1.7, 0, 0);
      sp.add(0, hpt[0], hpt[1], hpt[2], 9, 9, 0, 0, 0, 1.3, 0.8, 0.35, 0.5, 0, 0, 0);
    }
  }
}

// 导弹
function msPos(ms, tau) {
  var u = clamp(tau / ms.tf, 0, 1);
  var f = Math.pow(u, 1.75);
  var P0 = ms.p0, P2 = ms.hit;
  var P1 = [P0[0] + ms.up[0] * (40 + ms.arc) + ms.out[0] * ms.arc * 1.6 + 80, P0[1] + ms.up[1] * (40 + ms.arc) + ms.out[1] * ms.arc * 1.6, P0[2] + ms.up[2] * (40 + ms.arc) + ms.out[2] * ms.arc * 1.6];
  var a = (1 - f) * (1 - f), b = 2 * (1 - f) * f, c = f * f;
  return [a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1], a * P0[2] + b * P1[2] + c * P2[2]];
}
function fxMissiles(ctx) {
  var t = ctx.t, sp = ctx.sp, nl = 0;
  for (var i = 0; i < MSL.length; i++) {
    var ms = MSL[i];
    var tau = t - ms.tl;
    if (tau < 0 || tau > ms.tf + 2.2) continue;
    // 随目标缓慢漂移的终点：路径终点用固定点即可（目标流速很慢）
    var fl = Math.min(tau, ms.tf);
    var pos = msPos(ms, fl);
    var pos2 = msPos(ms, Math.max(0, fl - 0.03)), pos3 = msPos(ms, Math.min(ms.tf, fl + 0.03));
    var tan = vnorm(vsub(pos3, pos2));
    var arrived = tau >= ms.tf;
    var ign = rampv(tau, ms.coast - 0.05, ms.coast + 0.15);
    if (!arrived) {
      ctx.objs.push({ model: ASSET.models.missile, R: m3look(tan, [0, 1, 0]), pos: pos, lights: [], groups: {} });
      var gs = 3 + 5 * ign;
      sp.add(0, pos[0] - tan[0] * 6, pos[1] - tan[1] * 6, pos[2] - tan[2] * 6, gs * 1.3, gs * 1.3, 0, 0, 0, 1.4, 0.8, 0.35, 0.4 + 1.0 * ign, 0, 0, 0);
      if (ign > 0.01 && ign < 1 && tau < ms.coast + 0.2) sp.add(9, pos[0], pos[1], pos[2], 7, 7, 0, 0, 0, 1.4, 0.9, 0.5, 1.0 * (1 - (tau - ms.coast) / 0.2), i, 0, 0);
    }
    // 拖尾：沿路径取三段
    var tfade = arrived ? Math.max(0, 1 - (tau - ms.tf) / 1.8) : 1;
    var tlen = 1.2 * Math.min(1, tau / 0.9);
    var segs = [[1.0, 0.65, 0.35], [0.65, 0.33, 0.7], [0.33, 0.0, 1.0]];
    var tau0 = fl;
    if (ign > 0.01) {
      for (var s = 0; s < 3; s++) {
        var ta0 = Math.max(ms.coast * 0.6, tau0 - tlen * segs[s][0]), ta1 = Math.max(ms.coast * 0.6, tau0 - tlen * segs[s][1]);
        if (ta1 - ta0 < 1e-3) continue;
        var a0 = msPos(ms, ta0), a1 = msPos(ms, ta1);
        var dvv = vsub(a1, a0), ll = vlen(dvv); if (ll < 0.5) continue;
        var dd = vmul(dvv, 1 / ll);
        var wid = 3.0 * (0.4 + 0.6 * Math.pow(segs[s][2], 0.8));
        sp.add(6, (a0[0] + a1[0]) * 0.5, (a0[1] + a1[1]) * 0.5, (a0[2] + a1[2]) * 0.5, ll * 0.5, wid, dd[0], dd[1], dd[2], 1.3, 0.62, 0.28, (0.5 + 0.9 * segs[s][2]) * tfade * ign, ms.seed * 10 + s, 1.0 + s * 0.4, 0);
      }
    }
    // 命中：先小闪，再延迟大爆
    if (tau >= ms.tf) {
      var hp = tgtPoint(ms.tg, t, ms.tg.imp[ms.pi]);
      var a = t - ms.ta;
      if (a < 0.4) { var f1 = 1 - a / 0.4; sp.add(9, hp[0], hp[1], hp[2], 7 * f1 + 2, 7 * f1 + 2, 0, 0, 0, 1.3, 0.85, 0.45, 1.0 * f1, i, 0, 0); }
      var b = a - 0.45;
      if (b > 0 && b < 1.6) {
        var fb = Math.exp(-b * 2.8), sz = 10 + 26 * Math.sqrt(Math.min(1, b / 0.45));
        sp.add(9, hp[0], hp[1], hp[2], sz * (0.35 + fb * 0.65), sz * (0.35 + fb * 0.65), 0, 0, 0, 1.3, 0.78, 0.36, 1.0 * fb, i * 1.1, 0, 0);
        sp.add(0, hp[0], hp[1], hp[2], sz * 1.5, sz * 1.5, 0, 0, 0, 1.2, 0.6, 0.26, 0.28 * fb, 0, 0, 0);
        sp.add(2, hp[0], hp[1], hp[2], 14 + b * 80, 14 + b * 80, 0, 0, 0, 1.2, 0.7, 0.35, 0.32 * Math.exp(-b * 1.8), 0, 0.07, 0);
        for (var k = 0; k < 14; k++) {
          var dd2 = vnorm([hash1(i * 1.1 + k) - 0.5, hash1(i * 2.2 + k * 3.1) - 0.5, hash1(i * 3.3 + k * 4.7) - 0.5]);
          var sv = b * (60 + hash1(k + i * 5) * 120);
          sp.add(8, hp[0] + dd2[0] * sv, hp[1] + dd2[1] * sv, hp[2] + dd2[2] * sv, 1.5, 1.5, 0, 0, 0, 1.3, 0.7, 0.3, fb * 1.0, 0, 0, 0);
        }
        if (b < 0.5 && nl < 5) { ctx.lights.push({ p: hp, c: [2.2 * fb, 1.0 * fb, 0.4 * fb], r: 300 }); nl++; }
      }
    }
  }
}

// 陨石分离时的明亮裂面光晕与余辉（球状辅助光，保持体素形状可读）
function fxShatterGlow(ctx) {
  var t = ctx.t, sp = ctx.sp;
  for (var key in TARGETS) {
    var m = TARGETS[key];
    var ts = m.splitT || m.killT; if (!ts) continue;
    var a = t - ts;
    if (a > -0.3 && a < 2.2) {
      var w = metWorld(m, t).pos;
      var f = a < 0 ? Math.max(0, 1 + a / 0.3) * 0.5 : Math.exp(-a * 1.6);
      var s = m.r * (1.0 + 0.5 * Math.min(1, Math.max(a, 0)));
      sp.add(0, w[0], w[1], w[2], s * 1.1, s * 1.1, 0, 0, 0, 1.2, 0.62, 0.28, 0.22 * f, 0, 0, 0);
      if (a > 0 && a < 0.8) sp.add(2, w[0], w[1], w[2], s * (0.7 + a * 1.6), s * (0.7 + a * 1.6), 0, 0, 0, 1.2, 0.75, 0.38, 0.4 * (1 - a / 0.8), 0, 0.08, 0);
      if (a > -0.1 && a < 0.6) ctx.lights.push({ p: w, c: [2.2 * f, 1.0 * f, 0.4 * f], r: s * 4 });
    }
  }
}

// 近镜头漂浮光屑
function dustFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, cam = ctx.cam;
  var S = flowS(t), v = speedAt(t);
  var N = 220, BOX = 140, PX = FLOW.L / 9;
  var flowLen = Math.min(60, v * 0.045 + 1.2);
  var lit = sstep(51.0, 52.6, t) * (1 - sstep(60, 63, t));   // 炮火与命中亮光使附近颗粒短暂显现
  for (var i = 0; i < N; i++) {
    var bx = hash1(i * 1.37) * PX, by = hash1(i * 2.11) * BOX * 2, bz = hash1(i * 3.07) * BOX * 2;
    var x = ((bx - S - cam.pos[0]) % PX + PX) % PX - PX / 2 + cam.pos[0];
    var y = ((by - cam.pos[1]) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX + cam.pos[1];
    var z = ((bz - cam.pos[2]) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX + cam.pos[2];
    var d = Math.sqrt((x - cam.pos[0]) * (x - cam.pos[0]) + (y - cam.pos[1]) * (y - cam.pos[1]) + (z - cam.pos[2]) * (z - cam.pos[2]));
    var a = (0.25 + 0.5 * hash1(i * 5.3)) * (1 - d / (BOX * 1.1)) * (1 + 1.6 * lit) * Math.min(1, d / 30);
    if (a <= 0) continue;
    var warm = hash1(i * 9.1) < 0.4;
    if (flowLen > 3) sp.add(1, x + flowLen * 0.5, y, z, flowLen * 0.5, 0.18, 1, 0, 0, warm ? 1.0 : 0.6, warm ? 0.8 : 0.85, warm ? 0.55 : 1.0, a * 1.4, 0, 1.4, 0);
    else sp.add(8, x, y, z, 0.35, 0.35, 0, 0, 0, warm ? 1.0 : 0.6, warm ? 0.8 : 0.85, warm ? 0.55 : 1.0, a * 1.5, 0, 0, 0);
  }
}
