'use strict';
// ---------- 单帧组装 ----------
var SPR = new SpriteBatch(40000);
var FLOATERS = [[-100, 108, 214], [-10, 92, 226], [-200, 100, 226], [-100, 108, -214], [-10, 92, -226], [-200, 100, -226]];

function lookRot(dir, up) { // 让模型 +X 指向 dir
  return m3look(dir, up || [0, 1, 0]);
}
// 以 yaw/pitch 构造头部旋转（相对舰体）
function headRot(yaw, pitch) { return m3mul(m3rotY(yaw), m3rotZ(pitch)); }

function fleetFrame(ctx) {
  var t = ctx.t, sp = ctx.sp, objs = ctx.objs;
  var camPos = ctx.cam.pos;
  ctx.poses = ctx.poses || [];
  for (var i = 0; i < LAYOUT.length; i++) {
    var s = LAYOUT[i];
    var pose = shipPose(s, t);
    ctx.poses[i] = pose;
    var thr = thrustOf(s, t, pose);
    pose.thr = thr;
    var groups = { 7: 0.45 + 0.8 * thr };
    if (s.kind === 'F' && ctx.flagGroups) for (var fgk in ctx.flagGroups) groups[fgk] = ctx.flagGroups[fgk];
    // 发射后隐藏导弹分组
    if (s.kind === 'V' && ctx.missileHidden) { var mh = ctx.missileHidden(s, t); for (var gk in mh) groups[gk] = mh[gk]; }
    var sh = shieldState(s, t);
    var obj = { model: s.model, R: pose.R, pos: pose.pos, groups: groups, lights: [], emiK: 1 };
    // 舰体自带的内部与推进光
    var aft = (s.kind === 'F') ? -600 : (s.kind === 'C' ? -112 : -126);
    var rr = (s.kind === 'F') ? 260 : (s.kind === 'C' ? 70 : 80);
    var ep = xfPoint(pose, [aft, 0, 0]);
    obj.lights.push({ p: ep, c: [0.28 * (0.5 + thr), 0.78 * (0.5 + thr), 1.0 * (0.5 + thr)], r: rr * (0.8 + 0.3 * thr) });
    if (s.kind === 'F') {
      var meta = s.meta;
      [[-250, -6, 64], [-110, -6, 64], [10, -4, 64], [-250, -6, -64], [-110, -6, -64], [10, -4, -64]].forEach(function (lp) { obj.lights.push({ p: xfPoint(pose, lp), c: [0.95, 1.5, 1.75], r: 150 }); });
      obj.lights.push({ p: xfPoint(pose, [112, 108, 0]), c: [0.22, 0.45, 0.6], r: 150 });
      obj.lights.push({ p: xfPoint(pose, [100, 112, 44]), c: [0.4, 0.3, 0.14], r: 80 });
    }
    if (sh.k > 0.001) {
      var p01 = Math.min(1, sh.p), front = (1 - 2 * Math.min(sh.p, 1.3));
      obj.shield = { tint: [0.15, 0.65, 1.0], k: sh.k * 0.5, waveX: front * s.rad[0] + s.cen[0], waveW: s.rad[0] * 0.22 };
      var k2 = 0.82 + 0.18 * easeOut(p01);
      ctx.shields.push({
        pos: xfPoint(pose, s.cen), R: pose.R, radii: [s.rad[0] * k2, s.rad[1] * k2, s.rad[2] * k2], k: sh.k * (s.kind === 'F' ? 0.75 : 0.65),
        p: sh.p, seed: s.id * 1.37, col: [0.20, 0.78, 1.0], cell: s.cell
      });
    }
    objs.push(obj);
    if (s.kind === 'F') objs.push({ model: ASSET.models.wings, R: pose.R, pos: pose.pos, lights: obj.lights, shield: obj.shield, emiK: 1 });
    // 尾焰
    s.meta.noz.forEach(function (nz, ni) {
      if (!nz) return;
      addFlame(sp, pose, nz, thr, s.id * 3.1 + ni * 1.7, t, s.kind === 'F' ? 1.0 : 1.0);
    });
    // 炮台头部
    if (s.kind === 'C') {
      s.meta.pd.forEach(function (pd, pi) {
        var hr = ctx.pdAim ? ctx.pdAim(s, pi, pd, pose, t) : null;
        var R;
        if (hr) R = hr.R; else R = m3mul(pose.R, headRot(pd.side * 0.25 + 0.0, 0.2));
        var hobj = { model: ASSET.models.pd, R: R, pos: xfPoint(pose, pd.p), groups: { 1: hr ? hr.flash : 0.05 }, lights: [], emiK: 1 };
        objs.push(hobj);
      });
    }
    if (s.kind === 'F') {
      s.meta.turretMounts.forEach(function (tm, ti) {
        var hr = ctx.pulseAim ? ctx.pulseAim(tm, ti, pose, t, false) : null;
        var R = hr ? hr.R : m3mul(pose.R, headRot(tm.side * 0.12 + 0.0, 0.18));
        objs.push({ model: ASSET.models.pulse, R: R, pos: xfPoint(pose, tm.p), groups: { 1: hr ? hr.flash : 0.05, 2: 0.6 }, lights: [] });
      });
      FLOATERS.forEach(function (fp, fi) {
        var bob = 3 * per(5, t, fi * 1.3);
        var lp = [fp[0], fp[1] + bob, fp[2]];
        var wp = xfPoint(pose, lp);
        objs.push({ model: ASSET.models.fbase, R: pose.R, pos: wp, lights: [] });
        var hp = xfPoint(pose, [lp[0], lp[1] + 6, lp[2]]);
        var hr2 = ctx.pulseAim ? ctx.pulseAim({ p: lp, side: fp[2] > 0 ? 1 : -1, float: true }, 100 + fi, pose, t, true) : null;
        var R2 = hr2 ? hr2.R : m3mul(pose.R, headRot((fp[2] > 0 ? 1 : -1) * 0.2, 0.25));
        objs.push({ model: ASSET.models.pulse, R: R2, pos: hp, groups: { 1: hr2 ? hr2.flash : 0.05, 2: 0.6 }, lights: [] });
        sp.add(0, wp[0], wp[1] - 10, wp[2], 8, 8, 0, 0, 0, 0.3, 0.85, 1.0, 1.2, 0, 0, 0);
      });
    }
  }
}

function envFor(ctx) { return ENV_EXT; }

function buildFrame(t, W, H, shot) {
  var cam = shot.cam;
  var sp = SPR; sp.reset(cam.pos);
  var ctx = { t: t, cam: cam, sp: sp, objs: [], shields: [], lights: [], env: ENV_EXT, scene: shot.scene || 'ext' };
  if (typeof fxPrepare === 'function') fxPrepare(ctx);
  if (ctx.scene === 'ext') {
    fleetFrame(ctx);
    if (typeof meteorFrame === 'function') meteorFrame(ctx);
    if (typeof craftFrame === 'function') craftFrame(ctx);
    if (typeof fxFrame === 'function') fxFrame(ctx);
    if (typeof dustFrame === 'function') dustFrame(ctx);
  } else {
    if (typeof interiorFrame === 'function') interiorFrame(ctx);
  }
  return {
    t: t, cam: cam, env: ctx.env, objects: ctx.objs, sprites: sp, shields: ctx.shields, lights: ctx.lights,
    sky: ctx.sky || { k: 1, tint: [1, 1, 1] }, post: ctx.post || shot.post || {},
    cubes: (ctx.scene === 'ext' && typeof CUBES !== 'undefined') ? CUBES : null
  };
}
