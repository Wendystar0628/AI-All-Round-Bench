// fleet.js — deterministic world state: every position, break-up and shot is a pure function of the global loop time
(function () {
  'use strict';
  const SF = window.SF, { v3, m4, quat, sstep, sat, mix, pmod, hash3 } = SF;
  const T = SF.T = 78;
  const TM = SF.TM = {
    charge0: 51.4, beam0: 54.3, beam1: 59.9, beamEnd: 60.8, split: 54.6,
    pulse0: 55.5, pulse1: 61.3, miss0: 54.9, missHit0: 59.6, bSplit: 61.7,
    ciws0: 57.8, ciws1: 63.4, shield0: 64.3, fireRef: 55,
  };
  const W = SF.W = { ships: [], rocks: [], shuttles: [], pulses: [], missiles: [], ciws: [], debris: [], flashes: [] };

  // ---------------------------------------------------------------- envelopes
  const boost = SF.boost = t => { t = pmod(t, T); if (t >= 68) return sstep(68, 75.5, t); if (t < 8) return 1 - sstep(0, 8, t); return 0; };
  const thrust = SF.thrust = t => { t = pmod(t, T); if (t >= 66.2) return sstep(66.2, 72.5, t); if (t < 7.5) return 1 - sstep(0.4, 7.5, t); return 0; };
  const spreadEnv = SF.spreadEnv = t => { t = pmod(t, T); return sstep(43.5, 54, t) * (1 - sstep(63.5, 71.5, t)); };
  const V0 = 30, V1 = 400;
  const speed = SF.speed = t => V0 + (V1 - V0) * boost(t);
  const NS = T * 120, Stab = new Float64Array(NS + 1);
  for (let i = 1; i <= NS; i++) Stab[i] = Stab[i - 1] + 0.5 * (speed((i - 1) / 120) + speed(i / 120)) / 120;
  const STOT = SF.STOT = Stab[NS];
  // travelled distance, extended beyond one loop
  const dist = SF.dist = t => { const k = Math.floor(t / T), r = (t - k * T) * 120, i = Math.min(NS - 1, Math.floor(r)); return k * STOT + Stab[i] + (Stab[i + 1] - Stab[i]) * (r - i); };
  const ZF = 1720;
  const clusterZ = SF.clusterZ = tau => ZF - (dist(tau) - dist(TM.fireRef));
  const ease = s => s <= 0 ? 0 : s * s / (s + 0.6);

  // ---------------------------------------------------------------- ships
  function addShip(type, base, spread) {
    const i = W.ships.length, r = SF.rng(1000 + i * 37);
    const d = Math.hypot(base[0], base[1], base[2]);
    const s = { i, type, base, spread: spread || [0, 0, 0], delay: type === 'flag' ? 0 : 0.25 + 2.0 * sat(d / 1300), sdelay: type === 'flag' ? 0 : 0.7 + d / 430 + r() * 0.3,
      wob: type === 'flag' ? [0, 0, 0] : [r.r(4, 8), r.r(4, 8), r.r(6, 12)], k: [r.i(3, 6), r.i(4, 7), r.i(3, 7)], p: [r() * 6.28, r() * 6.28, r() * 6.28], seed: r() * 100 };
    W.ships.push(s); return s;
  }
  function setupShips() {
    addShip('flag', [0, 0, 0]);
    const G = [
      [330, 78, 330, 90, 10, 0], [320, -112, 70, 60, -24, 0], [430, 34, -200, 50, 0, 0], [286, 152, -390, 40, 20, 0],
      [345, -92, -630, 30, -10, 0], [176, 196, -810, 20, 20, 0], [486, 22, -960, 30, 0, 0],
    ];
    for (const g of G) { addShip('guard', [g[0], g[1], g[2]], [g[3], g[4], g[5]]); addShip('guard', [-g[0], g[1] + 14, g[2] - 26], [-g[3], g[4], g[5]]); }
    addShip('guard', [-46, -214, -430], [0, -30, 0]); addShip('guard', [54, 256, -170], [0, 34, 0]);
    const V = [
      [150, 104, 980, 110, 30, 0], [436, -72, 1050, 110, -20, 0], [654, 112, 820, 80, 20, 0], [146, -58, 1240, 190, 40, 0], [300, 40, 1420, 150, 20, 0],
      [764, -44, 420, 60, 0, 0], [884, 152, 20, 40, 0, 0], [704, -184, -300, 40, -20, 0], [984, 32, -520, 30, 0, 0], [700, 120, -760, 30, 20, 0],
    ];
    for (const g of V) { addShip('van', [g[0], g[1], g[2]], [g[3], g[4], g[5]]); addShip('van', [-g[0], g[1] - 16, g[2] + 34], [-g[3], g[4], g[5]]); }
  }
  const shipState = SF.shipState = (s, t) => {
    if (s.type === 'flag') return { pos: [0, 0, 0], q: [0, 0, 0, 1], m: m4.ident(), thrust: thrust(t) };
    const E = spreadEnv(t), dE = (spreadEnv(t + 0.3) - spreadEnv(t - 0.3)) / 0.6;
    const lag = -250 * (boost(t) - boost(t - s.delay));
    const ph = pmod(t, T) / T * 6.2831853, w = s.wob;
    const pos = [s.base[0] + s.spread[0] * E + w[0] * Math.sin(ph * s.k[0] + s.p[0]), s.base[1] + s.spread[1] * E + w[1] * Math.sin(ph * s.k[1] + s.p[1]), s.base[2] + s.spread[2] * E + w[2] * Math.sin(ph * s.k[2] + s.p[2]) + lag];
    const yaw = 0.016 * Math.sin(ph * s.k[1] + s.p[2]) + Math.atan2(s.spread[0] * dE, 70) * 0.8;
    const roll = 0.024 * Math.sin(ph * s.k[2] + s.p[1]) - s.spread[0] * dE * 0.007;
    const pitch = 0.008 * Math.sin(ph * s.k[0] + s.p[0] * 1.7) - s.spread[1] * dE * 0.004;
    const q = quat.euler(yaw, pitch, roll);
    return { pos, q, m: m4.trs(pos, q), thrust: thrust(t - s.delay) };
  };
  // shield state: [appear 0..1, wave position (+1 bow .. -1.3 stern), stable 0..1]
  SF.shieldState = (s, t) => {
    t = pmod(t, T);
    const ts = TM.shield0 + s.sdelay;
    if (t >= ts) { const a = t - ts; return [sstep(0, 1.3, a), 1.25 - a * 1.25, sstep(1.6, 3.0, a)]; }
    const o = (s.seed % 1) * 0.8 + s.sdelay * 0.25;
    const f = 1 - sstep(0.6 + o, 5.6 + o, t);
    return f > 0 ? [f, -3, 1] : [0, -3, 1];
  };

  // ---------------------------------------------------------------- rocks
  function setupRocks(models) {
    const add = (o) => { W.rocks.push(o); return o; };
    const nA = v3.norm([0.86, -0.5, 0.06]);
    add({ id: 'A', key: 'rockA', pos: [0, 6, 0], kind: 'A', n: nA });
    add({ id: 'B', key: 'rockB', pos: [-300, 326, -620], kind: 'B' });
    add({ id: 'C', key: 'rockC', pos: [292, -296, -250], kind: 'C' });
    const S = [[560, 64, -900], [-580, 96, -960], [470, -150, -1010], [-470, -168, -1080]];
    S.forEach((p, i) => add({ id: 'S' + i, key: 'rockS' + i, pos: p, kind: 'S', si: i }));
    // untargeted mediums: lanes clear of every ship
    const r = SF.rng(5151); let k = 0, guard = 0;
    const lanes = W.ships.map(s => [s.base[0] + s.spread[0] * 0.5, s.base[1] + s.spread[1] * 0.5, Math.abs(s.spread[0]) * 0.5 + (s.type === 'flag' ? 250 : 95)]);
    const NM = SF.rockMedN;
    while (k < NM + 4 && guard++ < 4000) {
      const far = k >= NM;
      const a = r() * 6.2832, rad = far ? r.r(700, 2000) : r.r(330, 1150);
      const p = [Math.cos(a) * rad, Math.sin(a) * rad * 0.62, far ? r.r(900, 2600) : r.r(-700, 800)];
      const key = far ? 'rockD' + (k % 2) : 'rockM' + k, md = models[key], rr = md.meta.Rm * 1.25;
      let ok = true;
      for (const L of lanes) if (Math.hypot(p[0] - L[0], p[1] - L[1]) < L[2] + rr) { ok = false; break; }
      for (const o of W.rocks) if (v3.dist(o.pos, p) < rr + models[o.key].meta.Rm * 1.3 + 40) { ok = false; break; }
      if (!ok) continue;
      add({ id: 'M' + k, key, pos: p, kind: 'M', q: far && k % 4 > 1 ? quat.euler(2.2, 0.6, 1.1) : null });
      k++;
    }
  }
  // world position of a rock (cluster instance time tau)
  const rockPos = SF.rockPos = (rk, tau) => [rk.pos[0], rk.pos[1], rk.pos[2] + clusterZ(tau)];

  // piece motion: returns local matrix (relative to the rock origin) for piece p at tau
  function rigid(com, disp, axis, ang) {
    const q = quat.axis(axis, ang), c = quat.rot(q, com);
    return m4.trs([com[0] - c[0] + disp[0], com[1] - c[1] + disp[1], com[2] - c[2] + disp[2]], q);
  }
  SF.pieceMatrix = (rk, p, tau) => {
    let m = null;
    if (rk.kind === 'A') {
      const s = tau - TM.split, sg = p.side ? 1 : -1, n = rk.n;
      if (s > 0) {
        const d = 1.3 * sstep(0, 2.4, s) + 27 * ease(s - 2.3);
        const disp = [n[0] * sg * d, n[1] * sg * d, n[2] * sg * d + 5 * ease(s - 2.3)];
        m = rigid(rk.halfCom[p.side], disp, [0.15, 0.2 * sg, 1], sg * 0.03 * ease(s - 2.3));
      }
    } else if (rk.kind === 'B') {
      const s = tau - TM.bSplit;
      if (s > 0 && p.big >= 0) { const d = ease(s) * p.bv; m = rigid(rk.bigCom[p.big], [p.bdir[0] * d, p.bdir[1] * d, p.bdir[2] * d], p.bax, p.bw * ease(s)); }
    }
    if (p.rel !== undefined && tau > p.rel) {
      const s = tau - p.rel, d = ease(s * 1.3) * p.v / 1.3;
      const pm = rigid(p.com, [p.dir[0] * d, p.dir[1] * d, p.dir[2] * d], p.ax, p.w * ease(s * 1.5));
      m = m ? m4.mul(m, pm) : pm;
    }
    return m;
  };
  // how much baked sun to keep (pieces that tumble lose their baked shadow)
  SF.pieceMoving = (rk, p, tau) => {
    let a = 0;
    if (rk.kind === 'A') a = sstep(2.2, 5, tau - TM.split);
    if (rk.kind === 'B' && p.big >= 0) a = sstep(0, 2, tau - TM.bSplit);
    if (p.rel !== undefined) a = Math.max(a, sstep(0, 1.2, tau - p.rel));
    return a;
  };

  // ---------------------------------------------------------------- shuttles (flagship coordinates)
  function setupShuttles(flagMeta) {
    const Track = SF.Track;
    const mk = (keys, mirror) => new Track(keys.map(k => [k[0], [mirror ? -k[1] : k[1], k[2], k[3]], k[4]]), { loop: T });
    // hero: returns through the aft mouth with the camera behind it, later leaves by the side mouth
    const hero = [[2, -300, 150, 330], [8, -420, 120, -500], [13, -400, 70, -1150], [17, -300, 30, -930], [20.2, -200, 6, -640], [22.6, -163, -5, -430], [24.2, -160, -6, -352], [26.6, -160, -11, -236], [28.6, -160, -13, -150],
      [30.4, -161, -14, -84], [32, -163, -16, -40], [34, -166, -18, -22, 1], [47, -166, -18, -22, 1], [50, -172, -12, -10], [52.4, -204, -4, -4], [55, -266, 6, 44], [59, -280, 60, 330], [63, -240, 120, 560], [68, -150, 150, 640], [72, -170, 170, 560], [76, -240, 170, 420]];
    W.shuttles.push({ tr: mk(hero), ph: 0 });
    // departure seen from inside the hangar: lifts off a deep bay, passes under the gantries, leaves by the side mouth
    const dep = [[0, -130, -21, -263, 1], [22.2, -130, -21, -263, 1], [23.3, -146, -18, -258], [24.4, -158, -15, -240], [26.2, -161, -14, -170], [28.2, -163, -12, -96], [29.4, -176, -8, -40], [30.6, -206, -2, -4],
      [32.4, -270, 10, 60], [38, -320, 50, 330], [43, -300, 110, 560], [48, -390, 90, 100], [52, -330, 30, -520], [54.5, -210, 2, -610], [56.2, -165, -5, -440], [57.6, -160, -6, -352], [59.6, -160, -13, -300], [60.8, -150, -18, -274], [62, -130, -21, -263, 1]];
    W.shuttles.push({ tr: mk(dep), ph: 0 });
    // patrol loops around the hull (both sides, three per side, each with its own upper-tier bay)
    const PZ = [-175, -131, -87];
    for (let side = 0; side < 2; side++) for (let n = 0; n < 3; n++) {
      const pz = PZ[n];
      const keys = [[0, -130, 1, pz, 1], [2, -130, 1, pz, 1], [3.5, -157, -5, pz + 9], [5.8, -162, -8, -44], [7.1, -188, -2, -8], [8.6, -250, 4, 40], [12, -252, 30, 250], [15.5, -150, 44, 470], [18, -70, 60, 590], [20, 0, 74, 520],
        [23, -40, 90, 300], [26, -96, 150, 60], [30, -120, 120, -200], [34, -150, 90, -480], [37, -230, 40, -700], [39.5, -190, 0, -640], [41.5, -162, -4, -470], [43.2, -160, -6, -352], [45.4, -160, -9, -250], [47.6 + (pz + 175) * 0.012, -158, -7, pz - 14], [49.2 + (pz + 175) * 0.012, -150, -3, pz - 5], [50.6 + (pz + 175) * 0.012, -130, 1, pz, 1]];
      W.shuttles.push({ tr: mk(keys, side === 1), ph: n * 26 + side * 11 });
    }
    // escorts weaving past the cannon and prongs
    const esc = [[0, 130, 60, 620], [7, 60, 44, 380], [13, 44, 60, 150], [19, 150, 110, -150], [26, 260, 70, -500], [33, 330, 0, -200], [40, 260, -70, 150], [47, 150, -90, 420], [54, 190, -30, 640], [61, 240, 30, 720], [68, 200, 70, 700], [74, 160, 70, 660]];
    W.shuttles.push({ tr: mk(esc), ph: 0 }); W.shuttles.push({ tr: mk(esc, true), ph: 31 }); W.shuttles.push({ tr: mk(esc), ph: 47 });
    const esc2 = [[0, -20, -120, 300], [9, -130, -110, -60], [18, -240, -90, -420], [26, -120, -130, -640], [34, 80, -150, -420], [43, 130, -120, -40], [52, 60, -100, 330], [60, 0, -96, 520], [69, -40, -110, 460]];
    W.shuttles.push({ tr: mk(esc2), ph: 0 }); W.shuttles.push({ tr: mk(esc2, true), ph: 39 });
    // parked shuttles in the bays
    W.parked = [];
    for (const b of flagMeta.bays) {
      if (!b.occupied) continue;
      const x = b.p[0];
      // keep the bays used by scripted shuttles free
      if (Math.abs(Math.abs(x) - 130) < 2 && Math.abs(b.p[2] + 291) < 30 && b.tier === 0 && x < 0) continue;
      if (Math.abs(Math.abs(x) - 130) < 2 && Math.abs(b.p[2] + 131) < 50 && b.tier === 1) continue;
      const yaw = hash3(b.k, b.side, b.tier, 9) > 0.5 ? 0 : Math.PI;
      W.parked.push(m4.trs([x, b.p[1], b.p[2]], quat.euler(yaw, 0, 0)));
    }
  }
  SF.shuttleState = (sh, t) => {
    const tt = t + sh.ph, p = sh.tr.at(tt), a = sh.tr.at(tt - 0.12), b = sh.tr.at(tt + 0.12);
    let vel = v3.sub(b, a); const sp = v3.len(vel) / 0.24;
    const pp = sh.tr.at(tt - 0.5), pn = sh.tr.at(tt + 0.5);
    const acc = v3.sub(v3.add(pp, pn), v3.mul(p, 2));
    let q;
    if (sp < 1.5) { // parked / hovering: keep the nose along +z
      const f = v3.norm(v3.sub(sh.tr.at(tt + 1.4), sh.tr.at(tt - 1.4)));
      q = v3.len(v3.sub(sh.tr.at(tt + 1.4), sh.tr.at(tt - 1.4))) > 2 ? quat.look([f[0], f[1] * 0.3, f[2]], [0, 1, 0]) : quat.euler(0, 0, 0);
    } else {
      const f = v3.norm(vel), right = v3.norm(v3.cross([0, 1, 0], f));
      const bank = SF.clamp(v3.dot(acc, right) * 0.035, -0.7, 0.7);
      const up = v3.norm(v3.addm([0, 1, 0], right, bank));
      q = quat.look(f, up);
    }
    return { pos: p, q, m: m4.trs(p, q), speed: sp };
  };

  // ---------------------------------------------------------------- turret aiming
  const turretBasis = (pivot, up, f) => {
    const u0 = [0, up, 0]; let r = v3.cross(u0, f); if (v3.len(r) < 1e-3) r = [1, 0, 0]; r = v3.norm(r); const u = v3.cross(f, r);
    return m4.basis(pivot, r, u, f);
  };
  SF.turretMatrix = (tr, t) => {
    const a = SF.pulse(TM.pulse0 - 1.5, TM.pulse0 - 0.3, TM.pulse1 + 0.4, TM.pulse1 + 2.2, pmod(t, T));
    const ph = pmod(t, T) / T * 6.2831853;
    const idle = v3.norm([Math.sin(ph * tr.k + tr.ph) * 0.35 + (tr.p[0] > 0 ? 0.12 : -0.12), tr.up * 0.06, 1]);
    let f = idle;
    if (a > 0 && tr.target) { const tp = SF.targetPoint(tr.target, Math.max(t, TM.pulse0)); f = v3.norm(v3.lerp(idle, v3.norm(v3.sub(tp, tr.p)), a)); }
    return turretBasis(tr.p, tr.up, f);
  };
  // world point of a target {rk, local} at time t (follows the unbroken rock)
  SF.targetPoint = (tg, t) => { const rp = rockPos(tg.rk, t); return [rp[0] + tg.local[0], rp[1] + tg.local[1], rp[2] + tg.local[2]]; };
  SF.gunMatrix = (ship, st, gun, t) => {
    const a = SF.pulse(TM.ciws0 - 1.6, TM.ciws0 - 0.3, TM.ciws1 + 0.3, TM.ciws1 + 2, pmod(t, T));
    const ph = pmod(t, T) / T * 6.2831853;
    let f = v3.norm([Math.sin(ph * gun.k + gun.ph) * 0.5 + (gun.p[0] > 0 ? 0.3 : -0.3), gun.up * 0.15, 1]);
    if (a > 0 && ship.ciwsTarget) {
      const wp = m4.pt(st.m, gun.p), tp = SF.targetPoint(ship.ciwsTarget, t);
      const dl = quat.rot([-st.q[0], -st.q[1], -st.q[2], st.q[3]], v3.norm(v3.sub(tp, wp)));
      f = v3.norm(v3.lerp(f, dl, a));
    }
    return m4.mul(st.m, turretBasis(gun.p, gun.up, f));
  };

  // ---------------------------------------------------------------- weapons schedule + break-up events
  function setupWeapons(models) {
    const flag = models.flag.meta, r = SF.rng(8842);
    const rkA = W.rocks[0], rkB = W.rocks[1], rkC = W.rocks[2];
    const gA = models.rockA.grid, gB = models.rockB.grid, gC = models.rockC.grid;
    const posF = rk => rockPos(rk, TM.fireRef);
    // --- beam entry point on A (beam axis: x=0,y=0, +z)
    const pa = posF(rkA);
    const hit = SF.rayRock(gA, [0 - pa[0], 0 - pa[1], -200], [0, 0, 1], 400) || [0, -6, -90];
    rkA.entry = hit; rkA.crack = [hit[0], hit[1], hit[2]];
    // A: halves + chips
    const pcsA = models.rockA.pieces; rkA.pieces = pcsA;
    rkA.halfCom = [0, 1].map(sd => { let a = [0, 0, 0], n = 0; for (const p of pcsA) if (p.side === sd) { a = v3.addm(a, p.com, p.n); n += p.n; } return v3.mul(a, 1 / Math.max(n, 1)); });
    let ci = 0;
    for (const p of pcsA) if (p.chip && p.n > 30) {
      const sgA = p.side ? 1 : -1;
      const out = v3.norm([(p.com[0] - hit[0]) * 0.02 + rkA.n[0] * sgA * 1.0 + r.s() * 0.25, (p.com[1] - hit[1]) * 0.02 + rkA.n[1] * sgA * 1.0 + r.s() * 0.25, -0.55 + r.s() * 0.15]);
      p.rel = TM.beam0 + 0.5 + ci * 0.42; p.dir = out; p.v = r.r(18, 36); p.ax = v3.norm([r.s(), r.s(), r.s()]); p.w = r.r(0.5, 1.4); ci++;
      W.debris.push({ rk: rkA, t0: p.rel, o: p.com, n: 46, sp: 30, dir: out, cone: 0.9, hot: 1 });
    }
    // crack line debris + dust along the split while the beam cuts
    for (let k = 0; k < 9; k++) W.debris.push({ rk: rkA, t0: TM.beam0 + 0.3 + k * 0.55, o: [hit[0] + r.s() * 10, hit[1] + r.s() * 46, hit[2] + 6 + k * 8], n: 40, sp: 26, dir: [0, 0, -1], cone: 1.3, hot: 1 });
    // --- C: pulse target. pieces facing the fleet get knocked off one by one
    const pcsC = models.rockC.pieces; rkC.pieces = pcsC; rkC.crack = [0, 0, -40];
    const facing = pcsC.filter(p => p.n > 40).sort((a, b) => (a.com[2] - b.com[2]));
    const cTargets = facing.slice(0, 8);
    // --- B: missile target
    const pcsB = models.rockB.pieces; rkB.pieces = pcsB;
    const bigB = pcsB.filter(p => !p.chip), chipsB = pcsB.filter(p => p.chip && p.n > 30);
    let cb = [0, 0, 0], nb = 0; for (const p of pcsB) { cb = v3.addm(cb, p.com, p.n); nb += p.n; } cb = v3.mul(cb, 1 / nb);
    rkB.bigCom = bigB.map(p => p.com); rkB.crack = cb;
    bigB.forEach((p, i) => { p.big = i; { const rd = v3.norm(v3.sub(p.com, cb)); p.bdir = v3.norm([rd[0] * 0.75 - 0.55, rd[1] * 0.75 + 0.62, rd[2] * 0.75]); } p.bv = r.r(15, 24); p.bax = v3.norm([r.s(), r.s(), r.s()]); p.bw = r.r(0.08, 0.22); });
    // chips ride on the nearest big piece
    for (const p of chipsB) { let bi = 0, bd = 1e9; bigB.forEach((q, i) => { const d = v3.dist(q.com, p.com); if (d < bd) { bd = d; bi = i; } }); p.big = bi; p.bdir = bigB[bi].bdir; p.bv = bigB[bi].bv; p.bax = bigB[bi].bax; p.bw = bigB[bi].bw; }
    for (const p of pcsB) if (p.big === undefined) p.big = -1;

    // --- pulse turrets: bursts, neighbours half a beat apart
    const turrets = W.turrets = flag.turrets.map((tu, i) => ({ p: tu.p, up: tu.up, k: 3 + (i % 4), ph: i * 1.7, i }));
    const fwd = turrets.filter(tu => tu.p[2] > -300).sort((a, b) => (a.p[0] - b.p[0]) || (a.p[2] - b.p[2]));
    const BOLT_V = 950, beat = 0.92;
    let cHit = 0; const cHits = [];
    fwd.forEach((tu, n) => {
      const toC = tu.p[0] > 0 || tu.up < 0;
      // aim point
      let tg;
      if (toC) { const pc = cTargets[n % cTargets.length]; const sp = SF.rayRock(gC, [pc.com[0] * 1.0, pc.com[1], pc.com[2] - 120], [0, 0, 1], 260) || pc.com; tg = { rk: rkC, local: sp, piece: pc }; }
      else { const y = (n % 5 - 2) * 26, x = -34 - (n % 3) * 22; const sp = SF.rayRock(gA, [x, y, -220], [0, 0, 1], 420) || [x, y, -80]; tg = { rk: rkA, local: sp }; }
      tu.target = tg;
      const off = (n % 2) * beat * 0.5 + (n % 5) * 0.03;
      for (let b = 0; TM.pulse0 + off + b * beat < TM.pulse1 - 0.4; b++) for (let k = 0; k < 4; k++) {
        const t0 = TM.pulse0 + off + b * beat + k * 0.105;
        const tp = SF.targetPoint(tg, t0 + 1.4), d = v3.dist(tu.p, tp), t1 = t0 + d / BOLT_V;
        const jit = [r.s() * 5, r.s() * 5, r.s() * 3];
        W.pulses.push({ t0, t1, tu, mz: k % 2, tg: { rk: tg.rk, local: v3.add(tg.local, jit) }, first: k === 0, burst: b });
        if (toC && k === 3) cHits.push({ t: t1, pc: tg.piece });
        W.flashes.push({ t: t1, tg: { rk: tg.rk, local: v3.add(tg.local, jit) }, size: 20, col: [0.5, 2.2, 3.0], dur: 0.32, kind: 'pulse' });
      }
    });
    // release C pieces when their bursts land (each piece once, spaced out)
    cHits.sort((a, b) => a.t - b.t);
    const seen = new Set(); let lastRel = 0;
    for (const h of cHits) {
      if (seen.has(h.pc) || h.t < lastRel + 0.45) continue; seen.add(h.pc); lastRel = h.t;
      const p = h.pc; p.rel = h.t; { const cd = v3.norm(p.com); p.dir = v3.norm([cd[0] * 0.55 + 0.70 + r.s() * 0.15, cd[1] * 0.55 - 0.72 + r.s() * 0.15, cd[2] * 0.4 - 0.25]); } p.v = r.r(13, 24); p.ax = v3.norm([r.s(), r.s(), r.s()]); p.w = r.r(0.4, 1.2);
      W.debris.push({ rk: rkC, t0: h.t, o: p.com, n: 70, sp: 34, dir: p.dir, cone: 1.2, hot: 1 });
      W.flashes.push({ t: h.t, tg: { rk: rkC, local: p.com }, size: 52, col: [0.7, 2.4, 3.2], dur: 0.6, kind: 'burst' });
    }
    // --- vanguard missiles on B
    const vans = W.ships.filter(s => s.type === 'van' && s.base[2] > 700);
    const cells = models.van.meta.cells;
    const chipsRel = chipsB.slice();
    let mi = 0;
    vans.forEach((s, vi) => {
      const left = s.base[0] < 0;
      for (let k = 0; k < 3; k++) {
        const t0 = TM.miss0 + vi * 0.29 + k * 0.27 + (left ? 0 : 0.13);
        const side = (k % 2 === 0) === left ? -1 : 1;
        const cs = cells.filter(c => (c.p[0] * side > 0) && c.d[1] > 0);
        const cell = cs[(k * 5 + vi * 3) % cs.length];
        const st = shipState(s, t0), p0 = m4.pt(st.m, cell.p), d0 = m4.dir(st.m, v3.norm(cell.d));
        const pb0 = v3.add(rockPos(rkB, t0 + 4.4), cb), dist0 = v3.dist(p0, pb0), dd = v3.norm(v3.sub(pb0, p0));
        const fl = 3.9 + dist0 / 1000 + (mi % 5) * 0.11, t1 = t0 + fl;
        const dirIn = v3.norm([dd[0] + r.s() * 0.4, dd[1] + r.s() * 0.4, dd[2] + r.s() * 0.25]);
        const lp = SF.rayRock(gB, [cb[0] - dirIn[0] * 150 + r.s() * 26, cb[1] - dirIn[1] * 150 + r.s() * 22, cb[2] - dirIn[2] * 150 + r.s() * 22], dirIn, 320) || cb;
        const tg = { rk: rkB, local: lp };
        const p3 = SF.targetPoint(tg, t1);
        const reach = Math.min(420, dist0 * 0.5), lvl = ((mi % 3) - 1) * 70;
        const p1 = v3.add(v3.addm(v3.addm(p0, d0, 120), dd, dist0 * 0.22), [(left ? -1 : 1) * (40 + (mi % 3) * 50), 90 + (mi % 4) * 40, 0]);
        const p2 = v3.add(v3.addm(p3, dirIn, -reach), [r.s() * 40, lvl + 60, r.s() * 40]);
        const ms = { t0, t1, p0, p1, p2, p3, d0, tg, i: mi, seed: r() * 100 };
        W.missiles.push(ms);
        const bigHit = mi % 3 === 0;
        W.flashes.push({ t: t1, tg, size: bigHit ? 104 : 74, col: [3.4, 1.9, 0.7], dur: 0.8, kind: 'blast' });
        W.debris.push({ rk: rkB, t0: t1, o: lp, n: bigHit ? 90 : 55, sp: 44, dir: v3.mul(dirIn, -1), cone: 1.2, hot: 1 });
        mi++;
      }
    });
    W.missiles.sort((a, b) => a.t1 - b.t1);
    // early hits knock chips off B, the last ones split it
    const hitsB = W.missiles.map(m => m.t1);
    TM.bSplit = hitsB[Math.floor(hitsB.length * 0.62)] + 0.12;
    chipsRel.forEach((p, i) => {
      const t = hitsB[Math.min(hitsB.length - 1, 1 + i * 2)];
      p.rel = t + 0.05; { const rd = v3.norm(v3.sub(p.com, cb)); p.dir = v3.norm([rd[0] * 0.7 - 0.5 + r.s() * 0.2, rd[1] * 0.7 + 0.55 + r.s() * 0.2, rd[2] * 0.7 - 0.2]); } p.v = r.r(16, 30); p.ax = v3.norm([r.s(), r.s(), r.s()]); p.w = r.r(0.5, 1.5);
    });
    W.debris.push({ rk: rkB, t0: TM.bSplit, o: cb, n: 420, sp: 52, dir: [0, 0, -1], cone: 3.2, hot: 1 });
    W.flashes.push({ t: TM.bSplit, tg: { rk: rkB, local: cb }, size: 170, col: [3.6, 2.2, 0.9], dur: 1.2, kind: 'blast' });
    // --- guard close-in guns on the small rocks
    const guards = W.ships.filter(s => s.type === 'guard');
    const gmeta = models.guard.meta;
    const smalls = W.rocks.filter(o => o.kind === 'S');
    smalls.forEach((rk, si) => {
      // nearest two guards
      const cand = [{ s: W.ships[[1, 2, 3, 4][si]] }];
      const t0 = TM.ciws0 + si * 0.55, tBreak = t0 + 1.9;
      rk.pieces = models[rk.key].pieces; rk.crack = [0, 0, 0];
      rk.pieces.forEach((p) => { p.rel = tBreak + r() * 0.5; { const rd = v3.norm([p.com[0] + r.s() * 3, p.com[1] + r.s() * 3, p.com[2] + r.s() * 3]), ox = Math.sign(rk.pos[0]), oy = Math.sign(rk.pos[1]); p.dir = v3.norm([rd[0] * 0.6 + ox * 0.7, rd[1] * 0.6 + oy * 0.5, rd[2] * 0.5 + 0.3]); } p.v = r.r(9, 20); p.ax = v3.norm([r.s(), r.s(), r.s()]); p.w = r.r(0.8, 2.2); });
      W.debris.push({ rk, t0: tBreak, o: [0, 0, 0], n: 150, sp: 30, dir: [0, 0, -1], cone: 3.2, hot: 1 });
      W.flashes.push({ t: tBreak, tg: { rk, local: [0, 0, 0] }, size: 46, col: [3.0, 2.0, 0.9], dur: 0.7, kind: 'burst' });
      for (let k = 0; k < 9; k++) W.debris.push({ rk, t0: t0 + 0.3 + k * 0.42, o: [r.s() * 6, r.s() * 6, -8], n: 14, sp: 26, dir: [0, 0, -1], cone: 1.6, hot: 0.6 });
      cand.forEach((c, ci2) => {
        c.s.ciwsTarget = { rk, local: [0, 0, 0] };
        const guns = gmeta.guns.map((gn, gi) => ({ gn, gi })).filter(o => (o.gn.up > 0) === (rk.pos[1] > c.s.base[1] - 60) && ((o.gn.p[0] > 0) === (rk.pos[0] > c.s.base[0]) || Math.abs(o.gn.p[0]) < 30)).slice(0, 4);
        guns.forEach((o, n) => {
          // 3 short bursts per gun, alternating barrels
          for (let b = 0; b < 4; b++) {
            const ta = t0 + ci2 * 0.21 + n * 0.13 + b * 1.18, tb = Math.min(ta + 0.78, TM.ciws1);
            if (ta >= TM.ciws1) break;
            W.ciws.push({ s: c.s, gun: o.gn, gi: o.gi, t0: ta, t1: tb, rate: 30, rk, seed: r() * 100 });
          }
        });
      });
    });
    // per-ship gun descriptors
    for (const s of guards) s.guns = gmeta.guns.map((gn, gi) => ({ p: gn.p, up: gn.up, k: 2 + (gi % 3), ph: gi * 2.1 + s.i }));
  }

  // bezier with eject-then-ignite timing
  SF.missileState = (ms, t) => {
    const fl = ms.t1 - ms.t0, s = sat((t - ms.t0) / fl), se = 0.42 / fl;
    const u = s < se ? 0.03 * (s / se) : 0.03 + 0.97 * Math.pow((s - se) / (1 - se), 1.75);
    return SF.bez(ms, u);
  };
  SF.missileU = (ms, t) => { const fl = ms.t1 - ms.t0, s = sat((t - ms.t0) / fl), se = 0.42 / fl; return s < se ? 0.03 * (s / se) : 0.03 + 0.97 * Math.pow((s - se) / (1 - se), 1.75); };
  SF.bez = (ms, u) => {
    const a = 1 - u, b0 = a * a * a, b1 = 3 * a * a * u, b2 = 3 * a * u * u, b3 = u * u * u, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = b0 * ms.p0[k] + b1 * ms.p1[k] + b2 * ms.p2[k] + b3 * ms.p3[k];
    return o;
  };

  SF.setupWorld = function (models) {
    setupShips(); setupRocks(models); setupShuttles(models.flag.meta); setupWeapons(models);
  };
})();
