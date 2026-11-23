// timeline.js — master clock, camera program, fleet motion, combat schedule, render
(function () {
  'use strict';
  const C = window.C, FX = window.FX, P = C.PAL;
  const LOOP = 72;

  // ---------------- path helpers ----------------
  function makePath(pts) {
    return function (u) {
      const n = pts.length - 1;
      const x = C.clamp(u, 0, 1) * n;
      const i = Math.min(Math.floor(x), n - 1);
      const t = x - i;
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
      return {
        p: C.catmull(p0.p, p1.p, p2.p, p3.p, t),
        l: C.catmull(p0.l, p1.l, p2.l, p3.l, t),
        f: C.lerp(p1.f, p2.f, t)
      };
    };
  }
  function closedPath(pts, period, phase) {
    const n = pts.length;
    return function (u) {
      const x = ((u * n) % n + n) % n;
      const i = Math.floor(x), t = x - i;
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      return C.catmull(p0, p1, p2, p3, t);
    };
  }

  // ---------------- shots ----------------
  const SHOTS = [
    { t0: 0, t1: 6, path: makePath([
      { p: [-560, 70, 430], l: [-150, 25, 60], f: 55 },
      { p: [-430, 110, 360], l: [60, 20, 20], f: 52 },
      { p: [-250, 90, 300], l: [220, 15, 0], f: 50 }]) },
    { t0: 6, t1: 12, path: makePath([
      { p: [-520, 60, -330], l: [-300, 10, 0], f: 50 },
      { p: [-260, 120, -270], l: [0, 15, 0], f: 48 },
      { p: [60, 80, -300], l: [260, 10, 0], f: 46 },
      { p: [330, 40, -260], l: [520, 5, 0], f: 48 }]) },
    { t0: 12, t1: 17, path: makePath([
      { p: [330, -140, -170], l: [100, -50, -60], f: 52 },
      { p: [60, -190, -40], l: [-200, -30, 0], f: 55 },
      { p: [-300, -120, 60], l: [-560, 0, 20], f: 50 },
      { p: [-520, -50, 150], l: [-600, 5, 30], f: 55 }]) },
    { t0: 17, t1: 23, path: makePath([
      { p: [0, 80, 400], l: [-290, 5, 74], f: 55 },
      { p: [-170, 40, 250], l: [-320, 0, 60], f: 60 },
      { p: [-290, 10, 120], l: [-400, 0, 10], f: 65 },
      { p: [-350, 2, 30], l: [-440, 5, -20], f: 68 },
      { p: [-400, 5, -20], l: [-448, 8, -30], f: 70 }]) },
    { t0: 23, t1: 28, path: makePath([
      { p: [196, 20, -34], l: [230, 24, 0], f: 62 },
      { p: [240, 16, 10], l: [262, 22, 0], f: 65 },
      { p: [272, 26, -20], l: [300, 24, -20], f: 60 },
      { p: [250, 34, 46], l: [312, 26, 0], f: 58 },
      { p: [296, 22, 20], l: [310, 24, 10], f: 62 }]) },
    { t0: 28, t1: 35, path: makePath([
      { p: [-150, 42, 110], l: [-20, 0, 0], f: 62 },
      { p: [-110, -30, 84], l: [-20, -40, 0], f: 66 },
      { p: [-70, 84, -60], l: [-20, 50, 0], f: 60 },
      { p: [10, 10, 120], l: [-20, 10, 0], f: 64 },
      { p: [90, -40, 60], l: [-20, -30, 0], f: 68 }]) },
    { t0: 35, t1: 41, path: makePath([
      { p: [170, 6, -52], l: [300, -42, -52], f: 64 },
      { p: [250, -30, -74], l: [400, -44, -52], f: 68 },
      { p: [370, -50, -34], l: [486, -46, -52], f: 66 },
      { p: [300, -26, -86], l: [470, -46, -54], f: 70 },
      { p: [460, -46, -52], l: [488, -46, -52], f: 72 }]) },
    { t0: 41, t1: 46, path: makePath([
      { p: [500, 20, -260], l: [700, 0, -150], f: 55 },
      { p: [900, 60, -300], l: [1100, 10, -60], f: 50 },
      { p: [1000, 40, -120], l: [400, 20, 0], f: 52 },
      { p: [700, 60, 60], l: [0, 20, 0], f: 55 }]) },
    { t0: 46, t1: 58, path: makePath([
      { p: [640, 60, 140], l: [736, 0, 0], f: 50 },
      { p: [880, 30, 90], l: [1180, -55, 180], f: 46 },
      { p: [700, 90, -120], l: [1400, 60, -240], f: 52 },
      { p: [520, -50, 220], l: [900, -30, 200], f: 56 },
      { p: [820, 40, -60], l: [1700, -20, 120], f: 50 },
      { p: [600, 80, 40], l: [200, 20, 0], f: 54 }]) },
    { t0: 58, t1: 65, path: makePath([
      { p: [600, 80, 40], l: [0, 20, 0], f: 54 },
      { p: [500, 140, 200], l: [0, 10, 0], f: 58 },
      { p: [200, 180, 420], l: [0, 0, 0], f: 62 },
      { p: [-200, 150, 520], l: [-200, 10, 0], f: 66 },
      { p: [-500, 100, 560], l: [-400, 20, 0], f: 70 }]) },
    { t0: 65, t1: 72, path: makePath([
      { p: [-500, 100, 560], l: [-400, 20, 0], f: 70 },
      { p: [-620, 120, 520], l: [-300, 30, 40], f: 62 },
      { p: [-600, 90, 470], l: [-200, 25, 60], f: 56 },
      { p: [-570, 80, 445], l: [-160, 25, 60], f: 55 },
      { p: [-560, 70, 430], l: [-150, 25, 60], f: 55 }]) }
  ];

  function shotAt(T) {
    for (let i = SHOTS.length - 1; i >= 0; i--) if (T >= SHOTS[i].t0) return SHOTS[i];
    return SHOTS[0];
  }

  // ---------------- motion envelopes ----------------
  function travelAmt(T) {
    if (T < 44) return 6.2 * T;
    if (T < 58) return 44 * 6.2;
    const d = T - 58;
    return 44 * 6.2 + 22 * d * d * d * 0.35;
  }
  function spreadAmt(T) {
    return C.smoother(C.clamp((T - 43) / 3.5, 0, 1)) * (1 - C.smoother(C.clamp((T - 57.5) / 2.5, 0, 1)));
  }
  function accelAmt(T) {
    return C.smoother(C.clamp((T - 59.5) / 2.6, 0, 1));
  }
  function shieldAlpha(start, T) {
    const age = T - start;
    if (age < 0) return 0;
    const up = C.smoother(C.clamp(age / 0.9, 0, 1));
    const down = 1 - 0.6 * C.smoother(C.clamp((T - 63) / 7, 0, 1));
    return up * down;
  }

  // ---------------- fleet update ----------------
  function updateFleet(fleet, T) {
    const sp = spreadAmt(T);
    const flag = fleet.flagship;
    flag.rot = [Math.sin(T * 0.13) * 0.006, Math.sin(T * 0.09) * 0.005, Math.sin(T * 0.11) * 0.005];
    flag.pos = [0, 0, 0];
    flag.model = C.m4.compose(flag.pos, flag.rot, [1, 1, 1]);
    for (const s of fleet.escorts) {
      const h = s.home;
      const l = Math.hypot(h[0], h[1], h[2]) || 1;
      s.pos = [h[0] + (h[0] / l) * sp * 210 + Math.sin(T * 0.23 + h[2]) * 4,
      h[1] + (h[1] / l) * sp * 110 + Math.sin(T * 0.31 + h[0]) * 5,
      h[2] + (h[2] / l) * sp * 210 + Math.cos(T * 0.19 + h[0]) * 4];
      s.rot = [Math.sin(T * 0.17 + h[1]) * 0.014, Math.sin(T * 0.21 + h[2] * 0.01) * 0.06 + (s.type === 'vanguard' ? 0.03 : -0.01), Math.sin(T * 0.15 + h[0]) * 0.013];
      s.model = C.m4.compose(s.pos, s.rot, [1, 1, 1]);
    }
    for (const b of fleet.boats) {
      const tr = boatTransform(b.idx, T);
      b.pos = tr.p; b.rot = tr.r; b.model = C.m4.compose(b.pos, b.rot, [1, 1, 1]);
    }
  }

  // boat paths
  const BOAT_LOOPS = [
    { pts: [[-450, 20, 200], [-300, 62, 268], [-100, 30, 300], [110, 70, 240], [260, 20, 180], [100, -24, 130], [-200, 8, 132], [-400, 34, 158]], period: 26 },
    { pts: [[-350, 4, 112], [-292, 28, 136], [-248, 2, 96], [-300, -22, 68], [-356, -8, 84]], period: 18 },
    { pts: [[-420, 26, 90], [-300, 60, 150], [-160, 20, 190], [40, 54, 150], [-160, -20, 90]], period: 30 }
  ];
  function boatTransform(i, T) {
    const bob = Math.sin(T * 0.9 + i) * 2;
    if (i >= 4) {
      const berth = i === 4 ? [-360, -10, 34] : [-300, -10, 34];
      return { p: [berth[0], berth[1] + bob * 0.4, berth[2]], r: [0, Math.PI / 2, 0] };
    }
    if (i === 3) {
      if (T < 20.5) return { p: [-300, -10 + bob * 0.3, 40], r: [0, Math.PI / 2, 0] };
      const u = (T - 20.5) / 30;
      const L = BOAT_LOOPS[2];
      const f = closedPath(L.pts, L.period);
      const p0 = f(0), p1 = f(0.02);
      const p = C.mixv(p0, p1, C.smoother(C.clamp(u * 6, 0, 1)));
      const d = C.sub(p1, p0);
      return { p: [p[0], p[1] + bob, p[2]], r: [0, Math.atan2(-d[2], d[0]), 0] };
    }
    const L = BOAT_LOOPS[i];
    const f = closedPath(L.pts, L.period);
    const u = T / L.period + i * 0.31;
    const p = f(u), p2 = f(u + 0.004);
    const d = C.sub(p2, p);
    return { p: [p[0], p[1] + bob, p[2]], r: [0, Math.atan2(-d[2], d[0]), 0] };
  }

  // ---------------- combat data ----------------
  function rockAt(rocks, i) { return rocks.list[i]; }
  function impactPoint(rock, from) {
    const c = rock.worldCenter();
    const d = C.norm(C.sub(c, from));
    return [c[0] + d[0] * rock.R * 0.72, c[1] + d[1] * rock.R * 0.72, c[2] + d[2] * rock.R * 0.72];
  }

  function buildSchedule(scene) {
    const rocks = scene.rocks;
    const s = {
      beam: { t0: 48.6, charge: 1.4, dur: 3.0, fade: 0.9, target: 0, shooter: [736, 0, 0] },
      pulses: [], ciws: [], missiles: [], hits: [], explosions: []
    };
    // pulses from flagship turrets
    const ttargets = [1, 2, 1, 2, 5, 6];
    const thomes = [[-300, 32, 34], [-140, 33, -34], [40, 32, 36], [220, 24, -30], [-220, 56, 0], [160, 54, 0]];
    for (let k = 0; k < 6; k++) {
      const rk = rockAt(rocks, ttargets[k]);
      const tt = C.dist(thomes[k], rk.home) / 900;
      s.pulses.push({ turret: k, target: ttargets[k], t0: 50.1 + k * 0.42 + (k % 2) * 0.21, speed: 900, hit: 50.1 + k * 0.42 + (k % 2) * 0.21 + tt });
      const rk2 = rockAt(rocks, ttargets[(k + 2) % 6]);
      const tt2 = C.dist(thomes[k], rk2.home) / 900;
      s.pulses.push({ turret: k, target: ttargets[(k + 2) % 6], t0: 51.3 + k * 0.42 + (k % 2) * 0.21, speed: 900, hit: 51.3 + k * 0.42 + (k % 2) * 0.21 + tt2 });
    }
    // ciws from guardians
    const gpos = [];
    scene.fleet.escorts.forEach((e, i) => { if (e.type === 'guardian') gpos.push(i); });
    const ctargets = [8, 9, 10, 13, 14, 15, 16, 17];
    for (let k = 0; k < 8; k++) {
      const e = scene.fleet.escorts[gpos[k % gpos.length]];
      const rk = rockAt(rocks, ctargets[k]);
      const tt = C.dist(e.home, rk.home) / 1500;
      s.ciws.push({ ship: gpos[k % gpos.length], gun: k % 4, target: ctargets[k], t0: 52.7 + k * 0.33, speed: 1500, hit: 52.7 + k * 0.33 + tt });
    }
    // missiles from vanguards
    const vpos = [];
    scene.fleet.escorts.forEach((e, i) => { if (e.type === 'vanguard') vpos.push(i); });
    const mtargets = [3, 0, 4, 1];
    for (let k = 0; k < 4; k++) {
      s.missiles.push({ ship: vpos[k], slot: k % 4, target: mtargets[k], t0: 54.3 + k * 0.7, dur: 1.5, hit: 54.3 + k * 0.7 + 1.5 });
    }
    // rock hit times
    const hitTimes = {};
    const addHit = (idx, t) => { if (!(idx in hitTimes) || hitTimes[idx] > t) hitTimes[idx] = t; };
    addHit(0, 49.5);
    for (const p of s.pulses) addHit(p.target, p.hit);
    for (const c of s.ciws) addHit(c.target, c.hit);
    for (const m of s.missiles) addHit(m.target, m.hit);
    for (const k in hitTimes) rocks.list[k].hitTime = hitTimes[k];
    // explosions
    const exList = [
      { idx: 0, t: 50.0, scale: 90 }, { idx: 1, t: 52.6, scale: 70 }, { idx: 2, t: 53.2, scale: 60 },
      { idx: 3, t: 56.0, scale: 80 }, { idx: 4, t: 56.8, scale: 66 },
      { idx: 8, t: 54.0, scale: 34 }, { idx: 9, t: 54.6, scale: 30 }, { idx: 10, t: 55.2, scale: 36 },
      { idx: 13, t: 55.8, scale: 26 }, { idx: 14, t: 56.2, scale: 24 }
    ];
    for (const e of exList) {
      const r = rocks.list[e.idx];
      const c = r.worldCenter();
      const rng = C.rng(1000 + e.idx);
      const sparks = [];
      for (let i = 0; i < 26; i++) {
        const th = rng() * 6.283, ph = Math.acos(rng() * 2 - 1);
        const sp = 26 + rng() * 70;
        sparks.push({
          p: [(rng() - 0.5) * r.R, (rng() - 0.5) * r.R, (rng() - 0.5) * r.R],
          v: [Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp * 0.7, Math.sin(ph) * Math.sin(th) * sp],
          s: 1.2 + rng() * 3.2, ph: rng() * 6.28, w: (rng() - 0.5) * 5,
          col: rng() < 0.4 ? [255, 200, 130] : [rng() < 0.5 ? 130 : 96, rng() < 0.5 ? 118 : 88, rng() < 0.5 ? 104 : 80]
        });
      }
      s.explosions.push({ c, t0: e.t, scale: e.scale, col: [1.0, 0.72, 0.4], sparks });
    }
    return s;
  }

  // ---------------- main render ----------------
  const TL = { LOOP, SHOTS, shotAt, travelAmt, spreadAmt, accelAmt, shieldAlpha, updateFleet, boatTransform, buildSchedule, impactPoint, rockAt };

  function renderFrame(r, scene, T) {
    const fleet = scene.fleet, rocks = scene.rocks, sched = scene.sched;
    updateFleet(fleet, T);
    const travel = travelAmt(T);
    for (const a of rocks.list) a.update(travel);

    const shot = shotAt(T);
    const u = C.clamp((T - shot.t0) / (shot.t1 - shot.t0), 0, 1);
    const cam = shot.path(u);
    const acc = accelAmt(T);
    r.setCamera(cam.p, cam.l, [0, 1, 0], cam.f);
    r.time = T;
    r.lightDir = C.norm([-0.55, 0.42, 0.72]);
    r.amb = [0.10, 0.13, 0.20];
    r.fogDens = 0.00036;
    // interior core light
    const insideCore = cam.p[0] > -170 && cam.p[0] < 140 && Math.abs(cam.p[2]) < 130 && cam.p[1] > -130 && cam.p[1] < 130 && T > 27 && T < 36;
    r.extraLight = insideCore ? [0.5, 0.95, 1.05] : [0, 0, 0];
    const inside = cam.p[0] > -170 && cam.p[0] < 500 && Math.abs(cam.p[2]) < 130 && cam.p[1] > -95 && cam.p[1] < 60;

    r.beginScene();

    // ---- rocks
    for (const a of rocks.list) a.draw(r, T);

    // ---- ships
    for (const e of fleet.escorts) r.drawMesh(e.mesh, e.model);
    for (const b of fleet.boats) r.drawMesh(b.mesh, b.model);
    r.drawMesh(fleet.flagship.mesh, fleet.flagship.model);

    // flagship turrets
    const fm = fleet.flagship.model;
    for (let i = 0; i < fleet.turrets.length; i++) {
      const t = fleet.turrets[i];
      const base = C.m4.transformPoint(fm, t.pos);
      let aim = null;
      for (const p of sched.pulses) {
        if (p.turret !== i) continue;
        const age = T - p.t0;
        if (age > -0.6 && age < 1.2) { aim = p; break; }
      }
      if (!aim) {
        for (const p of sched.pulses) if (p.turret === i) { aim = p; break; }
      }
      let d;
      if (aim) {
        const rk = TL.rockAt(rocks, aim.target);
        d = C.norm(C.sub(rk.worldCenter(), base));
      } else d = [1, 0.04, 0];
      const yaw = Math.atan2(-d[2], d[0]);
      const roll = Math.asin(C.clamp(d[1], -1, 1));
      const tm = C.m4.compose(base, [0, yaw, roll], [1, 1, 1]);
      r.drawMesh(t.mesh, tm);
      t.aimMatrix = tm;
      t.baseWorld = base;
      t.dir = d;
    }

    // ---- interiors
    r.drawMesh(scene.hangar.mesh, IDENT);
    r.drawMesh(scene.core.mesh, IDENT);
    for (const ring of scene.core.rings) {
      const m = C.m4.compose([scene.core.corePos[0], ring.y, scene.core.corePos[2]],
        [ring.tilt, T * ring.speed, 0], [1, 1, 1]);
      r.drawMesh(ring.mesh, m);
    }
    r.drawMesh(scene.corridor.mesh, IDENT);
    r.drawMesh(scene.bridge.mesh, IDENT);

    // ---- FX: plumes
    const pl = 1 + 2.6 * acc;
    for (const e of fleet.escorts) {
      for (const n of e.nozzles) {
        const w = C.m4.transformPoint(e.model, n);
        FX.plume(r, w, [-1, 0, 0], 26 * pl, 3.4, 0.85 * pl, T, [1.0, 0.6, 0.25]);
      }
    }
    for (const b of fleet.boats) {
      for (const n of b.nozzles) {
        const w = C.m4.transformPoint(b.model, n);
        FX.plume(r, w, [-1, 0, 0], 12 * pl, 2.0, 0.8 * pl, T, [0.7, 0.85, 1.0]);
      }
    }
    const fnoz = fleet.flagship.nozzles;
    for (const n of fnoz) {
      const w = C.m4.transformPoint(fm, n);
      FX.plume(r, w, [-1, 0, 0], 62 * pl, 8.5, 1.0 * pl, T, [1.0, 0.62, 0.24]);
    }
    // cannon muzzle idle glow
    const cmuz = C.m4.transformPoint(fm, [736, 0, 0]);
    FX.muzzleGlow(r, cmuz, 10 + 6 * Math.sin(T * 2), [0.55, 0.95, 1.0], 0.5);

    // ---- weapons
    const beam = sched.beam;
    const bstart = C.m4.transformPoint(fm, beam.shooter);
    const rk0 = TL.rockAt(rocks, beam.target);
    const bend = impactPoint(rk0, bstart);
    FX.cannonBeam(r, bstart, bend, beam.t0, beam.charge, beam.dur, beam.fade, T, [0.6, 0.94, 1.0]);
    // beam impact light on nearby surfaces
    if (T > beam.t0 + beam.charge && T < beam.t0 + beam.charge + beam.dur) {
      r.extraLight = [0.9, 1.0, 1.05];
    }

    for (const p of sched.pulses) {
      const t = fleet.turrets[p.turret];
      if (!t.baseWorld) continue;
      const rk = TL.rockAt(rocks, p.target);
      const end = impactPoint(rk, t.baseWorld);
      const mz = C.m4.transformPoint(t.aimMatrix, t.muzzle);
      FX.bolt(r, mz, end, p.t0, p.speed, T, [0.72, 1.0, 0.55], 5);
      if (T > p.t0 - 0.2 && T < p.t0 + 0.1) FX.muzzleGlow(r, mz, 16, [0.7, 1.0, 0.5], 0.9);
    }
    for (const c of sched.ciws) {
      const e = fleet.escorts[c.ship];
      if (!e || !e.ciws || !e.ciws[c.gun]) continue;
      const mz = C.m4.transformPoint(e.model, e.ciws[c.gun].pos);
      const rk = TL.rockAt(rocks, c.target);
      const end = impactPoint(rk, mz);
      FX.tracer(r, mz, end, c.t0, c.speed, T, [1.0, 0.85, 0.35]);
      if (T > c.t0 - 0.12 && T < c.t0 + 0.06) FX.muzzleGlow(r, mz, 8, [1.0, 0.8, 0.3], 0.8);
    }
    for (const m of sched.missiles) {
      const e = fleet.escorts[m.ship];
      if (!e || !e.slots) continue;
      const slot = e.slots[(m.slot * 3) % e.slots.length];
      const st = C.m4.transformPoint(e.model, slot);
      const rk = TL.rockAt(rocks, m.target);
      const end = impactPoint(rk, st);
      const mid = [(st[0] + end[0]) / 2, (st[1] + end[1]) / 2 + 90, (st[2] + end[2]) / 2];
      FX.missile(r, st, mid, end, m.t0, m.dur, T);
    }
    for (const ex of sched.explosions) FX.explosion(r, ex, T);

    // ---- environment fx
    FX.dust(r, rocks.dust, travel, T, 1 + acc * 3);
    FX.holo(r, scene.bridge.holo, T, 1.0);
    FX.corridorFlow(r, scene.corridor.devices, T);
    FX.coreGlow(r, scene.core.corePos, T);

    // ---- shields
    const order = scene.shieldOrder;
    for (let i = 0; i < order.length; i++) {
      const o = order[i];
      const a = shieldAlpha(58.4 + i * 0.11, T);
      if (a <= 0.002) continue;
      const ship = o.ship;
      const b = ship.bbox;
      const sx = (b.max[0] - b.min[0]) * 0.5 * 1.16;
      const sy = (b.max[1] - b.min[1]) * 0.5 * 1.55 + 6;
      const sz = (b.max[2] - b.min[2]) * 0.5 * 1.55 + 6;
      const grow = 0.55 + 0.45 * C.smoother(C.clamp((T - (58.4 + i * 0.11)) / 1.1, 0, 1));
      const m = C.m4.compose(ship.pos, ship.rot, [sx * grow, sy * grow, sz * grow]);
      r.drawShield(null, m, P.shield, T, a * 0.9, 1.0, sx * 2);
    }

    r.flushFX();
    r.endFrame();
  }

  const IDENT = C.m4.ident();
  TL.renderFrame = renderFrame;
  window.Timeline = TL;
})();
