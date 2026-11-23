// fx.js — per-frame scene assembly: voxel draws + light-and-medium effects, all derived from the global time
(function () {
  'use strict';
  const SF = window.SF, { v3, m4, quat, sstep, sat, mix, pmod, hash3, clamp } = SF;
  const T = SF.T, TM = SF.TM, W = SF.W;
  const cubes = new SF.Batch(16, 16384), axial = new SF.Batch(18, 4096), sprites = new SF.Batch(16, 8192);
  const CY = [0.22, 0.82, 1.0], AMB = [1.0, 0.62, 0.22];
  const ROCKC = [[0.185, 0.165, 0.152], [0.275, 0.238, 0.205], [0.102, 0.10, 0.115], [0.23, 0.20, 0.18]];

  function ax(p0, p1, w0, w1, ext, col, a, type, par1, par2, par3) {
    const o = axial.alloc(), d = axial.a;
    d[o] = p0[0]; d[o + 1] = p0[1]; d[o + 2] = p0[2]; d[o + 3] = p1[0]; d[o + 4] = p1[1]; d[o + 5] = p1[2];
    d[o + 6] = w0; d[o + 7] = w1; d[o + 8] = ext || 0; d[o + 9] = 0;
    d[o + 10] = col[0]; d[o + 11] = col[1]; d[o + 12] = col[2]; d[o + 13] = a;
    d[o + 14] = type; d[o + 15] = par1 || 0; d[o + 16] = par2 || 0; d[o + 17] = par3 || 0;
  }
  function sp(p, size, col, a, type, par1, par2, axis, rot) {
    const o = sprites.alloc(), d = sprites.a;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = size;
    if (axis) { d[o + 4] = axis[0]; d[o + 5] = axis[1]; d[o + 6] = axis[2]; } else { d[o + 4] = d[o + 5] = d[o + 6] = 0; }
    d[o + 7] = rot || 0;
    d[o + 8] = col[0]; d[o + 9] = col[1]; d[o + 10] = col[2]; d[o + 11] = a;
    d[o + 12] = type; d[o + 13] = par1 || 0; d[o + 14] = par2 || 0; d[o + 15] = 0;
  }
  function cube(m, off, col, hot) {
    const o = cubes.alloc(), d = cubes.a;
    // rows of rotation; translation = m.t + R*off
    const tx = m[12] + m[0] * off[0] + m[4] * off[1] + m[8] * off[2], ty = m[13] + m[1] * off[0] + m[5] * off[1] + m[9] * off[2], tz = m[14] + m[2] * off[0] + m[6] * off[1] + m[10] * off[2];
    d[o] = m[0]; d[o + 1] = m[1]; d[o + 2] = m[2]; d[o + 3] = tx;
    d[o + 4] = m[4]; d[o + 5] = m[5]; d[o + 6] = m[6]; d[o + 7] = ty;
    d[o + 8] = m[8]; d[o + 9] = m[9]; d[o + 10] = m[10]; d[o + 11] = tz;
    d[o + 12] = col[0]; d[o + 13] = col[1]; d[o + 14] = col[2]; d[o + 15] = hot;
  }
  const hr = (i, j, k) => hash3(i, j, k, 91);
  const hdir = (i, j) => { const z = hr(i, j, 1) * 2 - 1, a = hr(i, j, 2) * 6.2832, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; };

  // ---------------------------------------------------------------- one-time particle tables
  let debrisReady = false;
  function prepDebris() {
    debrisReady = true;
    W.debris.forEach((e, ei) => {
      const n = e.n, P = e.P = new Float32Array(n * 9); e.shape = new Uint8Array(n); e.colI = new Uint8Array(n);
      const base = v3.norm(e.dir);
      for (let i = 0; i < n; i++) {
        const rd = hdir(ei * 131 + i, 7);
        let d = v3.norm(v3.addm(v3.mul(base, 1.0), rd, e.cone));
        const h = hr(ei, i, 3), spd = e.sp * (0.12 + 0.88 * h * h);
        const axv = hdir(ei * 17 + i, 9);
        P.set([d[0], d[1], d[2], spd, axv[0], axv[1], axv[2], 0.4 + hr(ei, i, 4) * 2.6, hr(ei, i, 5)], i * 9);
        const hs = hr(ei, i, 6); e.shape[i] = hs < 0.42 ? (hs < 0.21 ? 0 : 1) : Math.min(8, 2 + Math.floor((hs - 0.42) / 0.58 * 7));
        e.colI[i] = Math.floor(hr(ei, i, 8) * 4);
      }
    });
    // camera-space floaters (tiny rock chunks) and dust
    const r = SF.rng(3310);
    W.floaters = []; for (let i = 0; i < 150; i++) W.floaters.push({ b: [r.r(0, 1), r.r(0, 1), r.r(0, 1)], ax: v3.norm([r.s(), r.s(), r.s()]), w: r.r(0.2, 1.2), sh: r.i(0, 8), c: r.i(0, 3), k: r.i(1, 4) });
    W.dust = []; for (let i = 0; i < 720; i++) W.dust.push({ b: [r(), r(), r()], s: r.r(0.5, 1.5), br: r.r(0.3, 1) });
  }

  // ---------------------------------------------------------------- beam / cannon state
  function beamState(t) {
    const charge = t < TM.beamEnd ? sstep(TM.charge0, TM.beam0 - 0.25, t) : 1 - sstep(TM.beamEnd, TM.beamEnd + 2.2, t);
    const on = sstep(TM.beam0, TM.beam0 + 0.14, t) * (1 - sstep(TM.beam1, TM.beamEnd, t));
    return { charge: t < TM.charge0 ? 0 : charge, on };
  }

  // ================================================================= assemble
  SF.assemble = function (t, models, shot, cam, F) {
    if (!debrisReady) prepDebris();
    t = pmod(t, T);
    cubes.reset(); axial.reset(); sprites.reset();
    const draws = F.draws = SF._draws = [], plumes = F.plumes = [], shields = F.shields = [], lights = F.lights = (shot.lights ? shot.lights.slice() : []);
    F.cubes = cubes; F.axial = axial; F.sprites = sprites;
    const phase = t / T, tw = 6.2831853 * phase;
    const interior = shot.set || 'ext';

    if (interior === 'atrium') { atrium(t, models, draws, lights, F); return; }
    if (interior === 'corridor') { corridor(t, models, draws, lights); return; }

    const bs = beamState(t);
    const thr = SF.thrust(t), thrIn = SF.thrust(t + 0.9);
    // ---------- flagship
    const fs = SF.shieldState(W.ships[0], t);
    const shCol = k => [CY[0] * k, CY[1] * k, CY[2] * k, 0];
    draws.push({ model: models.flag, m: m4.ident(), dyn: [0.5 + 1.0 * thr, bs.charge, bs.on, 1], kind: 1, shield: shCol(0.05 * fs[0] * (1 + 2.5 * (1 - fs[2]))) });
    const camNearFlag = Math.abs(cam.pos[0]) < 1400 && Math.abs(cam.pos[2]) < 2200;
    // ---------- escorts
    const states = W.ships.map(s => SF.shipState(s, t));
    for (let i = 1; i < W.ships.length; i++) {
      const s = W.ships[i], st = states[i], md = s.type === 'guard' ? models.guard : models.van;
      const sh = SF.shieldState(s, t);
      draws.push({ model: md, m: st.m, dyn: [0.5 + 1.0 * st.thrust, 0, 0, 0], shield: shCol(0.06 * sh[0] * (1 + 2.5 * (1 - sh[2]))), seed: s.seed });
    }
    // ---------- shields
    for (let i = 0; i < W.ships.length; i++) {
      const s = W.ships[i], sh = SF.shieldState(s, t); if (sh[0] <= 0.003) continue;
      const rad = s.type === 'flag' ? [252, 186, 640] : (s.type === 'guard' ? [66, 56, 114] : [92, 44, 134]);
      const c = s.type === 'flag' ? [0, 24, 0] : (s.type === 'guard' ? [0, 2, 0] : [0, 3, 0]);
      const k = 0.42 + 0.85 * (1 - sh[2]);
      shields.push({ m: m4.mul(states[i].m, m4.trans(c)), rad, scale: 0.84 + 0.16 * sstep(0, 1, sh[0]) , color: [CY[0] * k, CY[1] * k, CY[2] * k], sh: [sh[0], sh[1], sh[2], s.seed] });
    }
    // ---------- engine plumes
    const plume = (st, nz, th, thI, big, seed) => {
      const hx = nz.hx, hy = nz.hy, L = Math.max(hx, hy) * (4.6 + 9.5 * th) * (0.8 + 0.25 * (nz.big || 1));
      const m = m4.mul(st.m, m4.trans(nz.p));
      plumes.push({ m, half: [hx, hy, L], par: [0.55 + 1.5 * thI, 0.55 + 0.95 * th, 0.42 + 0.3 * thI, 1280 + (seed % 7) * 32], colIn: [0.80, 0.98, 1.0], colOut: [0.07, 0.46, 0.95] });
    };
    models.flag.meta.nozzles.forEach((nz, k) => plume(states[0], nz, thr, thrIn, 1, k));
    for (let i = 1; i < W.ships.length; i++) {
      const s = W.ships[i], md = s.type === 'guard' ? models.guard : models.van, th = states[i].thrust, thI = SF.thrust(t - s.delay + 0.9);
      md.meta.nozzles.forEach((nz, k) => plume(states[i], nz, th, thI, 0, i + k));
    }
    // engine lights
    const eg = 0.35 + 1.5 * thr;
    lights.push({ p: [0, -4, -640], r: 150, c: [0.22 * eg, 0.85 * eg, 1.25 * eg] }, { p: [0, 70, -600], r: 80, c: [0.15 * eg, 0.6 * eg, 0.9 * eg] });
    {
      const near = []; for (let i = 1; i < W.ships.length; i++) near.push([v3.dist(states[i].pos, cam.pos), i]);
      near.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < 4 && k < near.length; k++) { const i = near[k][1], s = W.ships[i], e2 = 0.35 + 1.4 * states[i].thrust; lights.push({ p: m4.pt(states[i].m, [0, 0, s.type === 'guard' ? -112 : -130]), r: 44, c: [0.2 * e2, 0.8 * e2, 1.2 * e2] }); }
    }
    // engine sparks trailing off the flagship nozzle rims
    if (camNearFlag) {
      const nzs = models.flag.meta.nozzles;
      for (let i = 0; i < 150; i++) {
        const nz = nzs[i % nzs.length], rate = Math.round((0.5 + hr(i, 1, 1) * 0.9) * T) / T, f = (t * rate + hr(i, 2, 1)) % 1;
        const L = Math.max(nz.hx, nz.hy) * (5 + 9 * thr), a = hr(i, 3, 1) * 6.2832, e = 1 + f * 1.4;
        const p = [nz.p[0] + Math.cos(a) * nz.hx * e, nz.p[1] + Math.sin(a) * nz.hy * e, nz.p[2] - 10 - f * L * 1.1];
        sp(p, 1.3 + hr(i, 4, 1) * 1.5, [0.5, 0.95, 1.0], (1 - f) * (1 - f) * (0.7 + 1.6 * thr), 4);
      }
    }
    // ---------- turrets (pulse) + flashes at the emitters
    const tflash = new Float32Array(W.turrets.length);
    for (const pu of W.pulses) { const d = t - pu.t0; if (d >= 0 && d < 0.3) tflash[pu.tu.i] += Math.exp(-d * 16); }
    const tmats = W.turrets.map(tu => SF.turretMatrix(tu, t));
    W.turrets.forEach((tu, i) => {
      draws.push({ model: models.turret, m: tmats[i], dyn: [0, 0, Math.min(1.5, tflash[i]), 0], kind: 4 });
      if (tflash[i] > 0.05) { const mp = m4.pt(tmats[i], [0, 4.5, 27]); sp(mp, 13 + 9 * tflash[i], [0.4, 0.95, 1.0], 1.8 * tflash[i], 1); lights.push({ p: mp, r: 34, c: [0.5 * tflash[i], 2.2 * tflash[i], 3.0 * tflash[i]] }); }
    });
    // ---------- guard close-in guns
    const gflash = new Map();
    for (const c of W.ciws) { if (t < c.t0 || t > c.t1 + 2.5) continue; const key = c.s.i * 16 + c.gi; const d = t - Math.min(t, c.t1); const v = t <= c.t1 ? 0.75 + 0.25 * Math.sin(t * 138 + c.seed) : Math.exp(-d * 1.8) * 0.6; gflash.set(key, Math.max(gflash.get(key) || 0, v)); }
    for (let i = 1; i < W.ships.length; i++) {
      const s = W.ships[i]; if (s.type !== 'guard') continue;
      if (v3.dist(states[i].pos, cam.pos) > 2600) continue;
      s.guns.forEach((gn, gi) => { draws.push({ model: models.ciws, m: SF.gunMatrix(s, states[i], gn, t), dyn: [0, 0, gflash.get(s.i * 16 + gi) || 0, 0], kind: 4 }); });
    }
    // ---------- shuttles
    for (const sh of W.shuttles) {
      const st = SF.shuttleState(sh, t), e = clamp(st.speed / 90, 0.12, 1.1);
      draws.push({ model: models.shuttle, m: st.m, dyn: [0.10 + 0.45 * e, 0, 0, 0] });
      if (st.speed > 30 && v3.dist(st.pos, cam.pos) < 900) plumes.push({ m: m4.mul(st.m, m4.trans([0, 0.5, -12.5])), half: [2.6, 0.9, 3 + 15 * e * e], par: [0.7 * e, 0.55 * e, 0.5, 1280], colIn: [0.8, 0.98, 1.0], colOut: [0.07, 0.46, 0.95] });
    }
    for (const m of W.parked) draws.push({ model: models.shuttle, m, dyn: [0.06, 0, 0, 0] });

    // ---------- rocks: three cluster generations (previous, current, next)
    for (let gen = -1; gen <= 1; gen++) {
      const tau = t - gen * T, cz = SF.clusterZ(tau);
      if (cz > 15000 || cz < -9000) continue;
      for (const rk of W.rocks) {
        const rp = SF.rockPos(rk, tau);
        if (v3.dist(rp, cam.pos) > 16000) continue;
        const base = m4.trans(rp);
        if (rk.pieces) {
          let heat = 0, crack = [0, 0, 0, 400];
          if (rk.kind === 'A') { heat = 0.9 * sstep(TM.beam0, TM.beam0 + 0.5, tau) * (1 - 0.86 * sstep(TM.beam1 - 1.5, TM.beam1 + 4.5, tau)) * (1 - sstep(TM.beam1 + 5, TM.beam1 + 14, tau)); crack = [rk.crack[0], rk.crack[1], rk.crack[2], 16 + 62 * Math.max(0, tau - TM.beam0)]; }
          else if (rk.kind === 'B') { let h = 0; for (const ms of W.missiles) { const d = tau - ms.t1; if (d > 0) h += Math.exp(-d * 0.8) * 0.3; } heat = Math.min(0.85, h); crack = [rk.crack[0], rk.crack[1], rk.crack[2], 900]; }
          else { let last = -1e9; for (const p of rk.pieces) if (p.rel !== undefined && p.rel <= tau && p.rel > last) last = p.rel; heat = Math.exp(-(tau - last) * 0.7) * 0.9; crack = [0, 0, 0, 900]; }
          for (const p of rk.pieces) {
            if (!p.model) continue;
            const pm = SF.pieceMatrix(rk, p, tau);
            draws.push({ model: p.model, m: pm ? m4.mul(base, pm) : base, sunBake: 1 - SF.pieceMoving(rk, p, tau), heat, crack, seed: 3 });
          }
        } else {
          draws.push({ model: models[rk.key], m: rk.q ? m4.trs(rp, rk.q) : base, sunBake: rk.q ? 0 : 1, seed: 3 });
        }
      }
      // voxel debris
      const camz = cam.pos[2];
      for (const e of W.debris) {
        const s = tau - e.t0; if (s <= 0) continue;
        const rp = SF.rockPos(e.rk, tau);
        if (Math.abs(rp[2] - camz) > 5200) continue;
        const ox = rp[0] + e.o[0], oy = rp[1] + e.o[1], oz = rp[2] + e.o[2];
        const k1 = (1 - Math.exp(-1.1 * s)) / 1.1 + 0.2 * s, hot = e.hot * Math.exp(-s * 0.9);
        const P = e.P;
        for (let i = 0; i < e.n; i++) {
          const o = i * 9, tr = P[o + 3] * k1;
          const q = quat.axis([P[o + 4], P[o + 5], P[o + 6]], P[o + 7] * (0.5 * s + (1 - Math.exp(-s)) * 2));
          const m = m4.trs([ox + P[o] * tr, oy + P[o + 1] * tr, oz + P[o + 2] * tr], q);
          const shp = SF.debrisShapes[e.shape[i]], col = ROCKC[e.colI[i]];
          for (let k = 0; k < shp.length; k++) cube(m, shp[k], col, hot * (0.4 + 0.6 * P[o + 8]));
        }
      }
    }

    // ---------- floaters + dust (wrap around the camera, scroll with the fleet's travel)
    const trav = SF.dist(t), spd = SF.speed(t);
    {
      const BX = 760, BY = 460, WZ = SF.STOT / 4;
      for (let i = 0; i < W.floaters.length; i++) {
        const f = W.floaters[i];
        const x = cam.pos[0] + pmod(f.b[0] * 2 * BX - cam.pos[0] + BX, 2 * BX) - BX, y = cam.pos[1] + pmod(f.b[1] * 2 * BY - cam.pos[1] + BY, 2 * BY) - BY;
        const z = cam.pos[2] + pmod(f.b[2] * WZ - trav - cam.pos[2] + WZ / 2, WZ) - WZ / 2;
        if (Math.abs(x) < 250 && Math.abs(y) < 190 && Math.abs(z) < 700) continue;
        let hit = false; for (let k = 1; k < states.length; k++) { const sp2 = states[k].pos; if (Math.abs(x - sp2[0]) < 80 && Math.abs(y - sp2[1]) < 60 && Math.abs(z - sp2[2]) < 150) { hit = true; break; } }
        if (hit) continue;
        const m = m4.trs([x, y, z], quat.axis(f.ax, tw * f.k + i));
        const shp = SF.debrisShapes[f.sh];
        for (let k = 0; k < shp.length; k++) cube(m, shp[k], ROCKC[f.c], 0);
      }
      const DX = 420, DY = 300, DZ = SF.STOT / 8;
      const len = Math.max(1.6, spd * 0.045);
      for (let i = 0; i < W.dust.length; i++) {
        const f = W.dust[i];
        const x = cam.pos[0] + pmod(f.b[0] * 2 * DX - cam.pos[0] + DX, 2 * DX) - DX, y = cam.pos[1] + pmod(f.b[1] * 2 * DY - cam.pos[1] + DY, 2 * DY) - DY;
        const z = cam.pos[2] + pmod(f.b[2] * DZ - trav - cam.pos[2] + DZ / 2, DZ) - DZ / 2;
        if (Math.abs(x) < 215 && y > -95 && y < 150 && Math.abs(z) < 570) continue;
        // lit by the sun (weak) plus nearby event lights
        let lr = 0.10, lg = 0.10, lb = 0.11;
        for (let k = 0; k < lights.length; k++) { const l = lights[k], dx = l.p[0] - x, dy = l.p[1] - y, dz = l.p[2] - z, a = 1 / (1 + (dx * dx + dy * dy + dz * dz) / (l.r * l.r * 2.5)); const a2 = a * a * 0.07; lr += l.c[0] * a2; lg += l.c[1] * a2; lb += l.c[2] * a2; }
        const lm = Math.max(lr, lg, lb); if (lm > 0.42) { const k = 0.42 / lm; lr *= k; lg *= k; lb *= k; }
        ax([x, y, z + len * 0.5], [x, y, z - len * 0.5], 0.55 * f.s, 0.55 * f.s, 0.5, [lr, lg, lb], f.br * 0.9, 4);
      }
    }

    // ---------- main beam
    weaponsFx(t, bs, models, states, tmats, lights);

    // ---------- bridge hologram (always running; only visible from inside)
    if (shot.holo) hologram(t, models, states);
    F.dynCharge = bs.charge;
  };

  // ================================================================= weapons
  function weaponsFx(t, bs, models, states, tmats, lights) {
    const MZ = SF.models.flag.meta.muzzle, rkA = W.rocks[0];
    const tw = t * 6.2831853;
    // charge glow at the muzzle
    if (bs.charge > 0.01 && t < TM.beamEnd + 2.2) {
      const c = bs.charge, c2 = c * c, pre = t < TM.beam0 ? 1 : 0.55;
      sp([0, 0, MZ[2] + 4], (12 + 50 * c2) * (1 + 0.06 * Math.sin(t * 43)), [0.35, 0.92, 1.0], (0.6 + 4.4 * c2) * pre, 1, 0, 0, null, t * 0.6);
      sp([0, 0, MZ[2] + 2], 36 + 70 * c2, [0.10, 0.5, 0.9], 0.9 * c2 * pre, 0, 3.4);
      sp([0, 0, MZ[2] + 3], 9 + 20 * c2, [0.8, 1.0, 1.0], 3.0 * c2 * pre, 0, 2.2);
      lights.push({ p: [0, 0, MZ[2] + 16], r: 60 + 50 * c, c: [0.5 * c2 * 2.2, 1.9 * c2 * 2.2, 2.6 * c2 * 2.2] });
      if (t < TM.beam0 + 0.1) for (let i = 0; i < 46; i++) { // motes spiralling into the muzzle
        const f = (t * (0.9 + hr(i, 1, 5) * 0.8) + hr(i, 2, 5)) % 1, d = hdir(i, 55), R = (16 + 44 * hr(i, 3, 5)) * (1 - f) * (1 - f);
        sp([d[0] * R, d[1] * R, MZ[2] + 5 + Math.abs(d[2]) * R * 0.8], 0.7 + 0.9 * f, [0.5, 0.95, 1.0], c * f * 2.0, 4);
      }
    }
    if (bs.on > 0.002 || (t > TM.beam1 && t < TM.beamEnd + 2.4)) {
      const on = bs.on;
      const ra = SF.rockPos(rkA, t);
      const sSplit = t - TM.split;
      // burn-through: the end point advances through the rock, then the beam runs free through the gap
      const zHit = ra[2] + rkA.entry[2] + Math.max(0, sSplit) * 26;
      const through = sstep(2.9, 3.6, sSplit);
      const zEnd = mix(zHit, MZ[2] + 7600, through);
      // after cut-off the tail leaves the muzzle and runs forward
      const lift = t > TM.beam1 ? 5200 * Math.pow(sat((t - TM.beam1) / (TM.beamEnd - TM.beam1 + 0.5)), 1.6) : 0;
      const z0 = Math.min(MZ[2] + 2 + lift, zEnd - 1);
      const w = 13.5 * on * (1 + 0.07 * Math.sin(t * 37) + 0.05 * Math.sin(t * 61.3)) * (1 + 0.5 * Math.exp(-(t - TM.beam0) * 3.5));
      if (on > 0.002) {
        ax([0, 0, z0], [0, 0, zEnd], w * 1.25, w * 1.25, 0, CY, 1.0 * on, 0, 3.1, 0.004, mix(0.0005, 0.18, through));
        ax([0, 0, z0], [0, 0, zEnd], w * 3.6, w * 3.6, 0, [0.05, 0.3, 0.75], 0.16 * on, 4);
        lights.push({ p: [0, 0, 560], r: 120, c: [0.9 * on, 3.4 * on, 4.6 * on] }, { p: [0, 0, 420], r: 90, c: [0.5 * on, 1.9 * on, 2.6 * on] });
        // launch rings + rings riding down the beam
        for (let k = 0; k < 3; k++) { const a = (t - TM.beam0 - k * 0.11) / 0.7; if (a > 0 && a < 1) sp([0, 0, MZ[2] + 6 + a * 60], 26 + 60 * a, [0.4, 0.95, 1.0], 1.2 * (1 - a) * (1 - a), 2, 0.8, 0.04, [0, 0, 1]); }
        for (let k = 0; k < 4; k++) { const f = ((t - TM.beam0) * 1.1 + k / 4) % 1, z = z0 + f * Math.min(1300, zEnd - z0); if (z < zEnd) sp([0, 0, z], w * (1.55 + 0.3 * Math.sin(k * 2.1)), [0.35, 0.9, 1.0], 0.34 * on * (1 - f * 0.7), 2, 0.74, 0.06, [0, 0, 1]); }
        // impact on the rock face
        if (through < 0.98) {
          const k = (1 - through) * on, hp = [0, 0, zHit - 2];
          sp(hp, 62 * (1 + 0.12 * Math.sin(t * 53)), [1.0, 0.72, 0.38], 2.0 * k, 1, 0, 0, null, t * 1.3);
          sp(hp, 100, [1.0, 0.42, 0.12], 0.20 * k, 0, 3.4);
          sp(hp, 44, [0.5, 0.9, 1.0], 1.6 * k, 0, 4.0);
          lights.push({ p: [0, 0, zHit - 26], r: 120, c: [2.6 * k, 1.5 * k, 0.7 * k] });
          for (let i = 0; i < 90; i++) { // molten spray back toward the fleet
            const f = (t * (1.1 + hr(i, 1, 7)) + hr(i, 2, 7)) % 1, d = hdir(i, 77), sv = 60 + 240 * hr(i, 3, 7);
            sp([hp[0] + d[0] * sv * f, hp[1] + d[1] * sv * f, hp[2] - Math.abs(d[2]) * sv * f * 1.3 - 4], 1.4 + 2.2 * (1 - f), [1.0, 0.62, 0.22], 2.4 * k * (1 - f) * (1 - f), 4);
          }
        }
      }
      // afterglow: motes streaming forward along the old beam line
      if (t > TM.beam1 - 0.2) {
        const a = t - TM.beam1, fade = Math.max(0, 1 - a / 2.6);
        if (fade > 0) for (let i = 0; i < 150; i++) {
          const zb = MZ[2] + hr(i, 1, 9) * 2600, v = 380 + 700 * hr(i, 2, 9), d = hdir(i, 99);
          const rr = (3 + 11 * hr(i, 3, 9)) * (1 + Math.max(0, a) * 1.5);
          sp([d[0] * rr, d[1] * rr, zb + Math.max(0, a + 0.2) * v], 1.3 + 2.2 * hr(i, 4, 9), [0.4, 0.92, 1.0], 1.5 * fade * fade * sstep(-0.2, 0.25, a), 4);
        }
      }
    }
    // ---------- pulse bolts
    for (const pu of W.pulses) {
      if (t < pu.t0 || t > pu.t1) continue;
      const mm = SF.turretMatrix(pu.tu, pu.t0), p0 = m4.pt(mm, [pu.mz ? -5 : 5, 4.5, 26]), p1 = SF.targetPoint(pu.tg, pu.t1);
      const s = (t - pu.t0) / (pu.t1 - pu.t0), d = v3.norm(v3.sub(p1, p0));
      const hp = v3.lerp(p0, p1, s), L = Math.min(58, v3.dist(p0, hp));
      ax(v3.addm(hp, d, -L), hp, 1.1, 4.4, 0.4, [0.28, 0.86, 1.0], 2.6, 1);
      sp(hp, 12, [0.3, 0.85, 1.0], 0.9, 0, 5.0);
    }
    // ---------- close-in tracers
    const VC = 1050;
    for (const c of W.ciws) {
      if (t < c.t0 || t > c.t1 + 1.2) continue;
      const n1 = Math.floor((Math.min(t, c.t1) - c.t0) * c.rate);
      for (let n = n1; n >= 0; n--) {
        const tf = c.t0 + n / c.rate, age = t - tf; if (age > 1.1) break;
        const st = SF.shipState(c.s, tf), gm = SF.gunMatrix(c.s, st, c.s.guns[c.gi], tf);
        const mz = models.ciws.meta.muzzles[n % 4], p0 = m4.pt(gm, mz);
        const tp0 = SF.rockPos(c.rk, tf), dd = v3.dist(p0, tp0), fl = dd / VC;
        const tp = SF.rockPos(c.rk, tf + fl);
        const j = [(hr(n, c.gi, c.s.i) - 0.5) * 16, (hr(n, c.gi + 9, c.s.i) - 0.5) * 16, (hr(n, c.gi + 5, c.s.i) - 0.5) * 12];
        const p1 = [tp[0] + j[0], tp[1] + j[1], tp[2] + j[2]], d = v3.norm(v3.sub(p1, p0));
        if (age < 0.07) { sp(p0, 8.5, [1.0, 0.72, 0.36], 2.6 * (1 - age / 0.07), 1, 0, 0, null, n); }
        const miss = hr(n, 3, c.gi) < 0.3;   // some rounds pass by and keep going
        const hitT = c.rk.pieces && c.rk.pieces[0].rel < tf + fl ? 1e9 : fl;
        const s = age / fl;
        if (!miss && age > hitT) { if (age < hitT + 0.1) { sp(p1, 7, [1.0, 0.7, 0.35], 2.4, 4); sp(p1, 12, [1.0, 0.6, 0.25], 0.8, 0, 4.0); } continue; }
        const hp = v3.addm(p0, d, age * VC);
        ax(v3.addm(hp, d, -24), hp, 1.2, 1.9, 0.3, [1.0, 0.70, 0.36], 3.2 * (s > 1 ? Math.max(0, 1.6 - s * 0.6) : 1), 2);
      }
    }
    // ---------- missiles: bodies, motors, trails
    for (const ms of W.missiles) {
      if (t < ms.t0 || t > ms.t1 + 3.0) continue;
      const ign = ms.t0 + 0.42;
      if (t < ms.t1) {
        const p = SF.missileState(ms, t), pn = SF.missileState(ms, t + 0.03), pb = SF.missileState(ms, t - 0.03);
        let f = v3.sub(pn, pb); if (v3.len(f) < 1e-4 || t < ign) f = v3.lerp(ms.d0, f, sat((t - ms.t0) / 0.42)); f = v3.norm(f);
        const q = quat.look(f, [0, 1, 0]), on = t > ign ? 1 : 0;
        SF._draws.push({ model: models.missile, m: m4.trs(p, q), dyn: [on * 1.4, 0, 0, 0] });
        if (on) { const tp = v3.addm(p, f, -8); sp(tp, 9 + 2 * Math.sin(t * 90 + ms.i), [1.0, 0.72, 0.35], 2.4, 1, 0, 0, null, ms.i); lights.push({ p: tp, r: 22, c: [2.0, 1.1, 0.4] }); }
        else if (t - ms.t0 < 0.3) sp(ms.p0, 7 + 20 * (t - ms.t0), [0.5, 0.52, 0.56], 0.35 * (1 - (t - ms.t0) / 0.3), 3, 0, ms.seed);
      }
      // trail: sample the flown path backwards
      const te = Math.min(t, ms.t1), life = 2.7, N = 26, dts = 0.075;
      let prev = null, prevAge = 0;
      for (let k = 0; k <= N; k++) {
        const tk = te - k * dts; if (tk < ign) break;
        const age = t - tk; if (age > life) break;
        const p = SF.missileState(ms, tk);
        const loose = age * age * 1.6;
        p[0] += (hr(ms.i, k, 1) - 0.5) * loose; p[1] += (hr(ms.i, k, 2) - 0.5) * loose; p[2] += (hr(ms.i, k, 3) - 0.5) * loose;
        if (prev) {
          const a0 = prevAge / life, a1 = age / life, am = (a0 + a1) * 0.5;
          const hot = Math.exp(-am * life * 2.6);
          const col = [mix(0.30, 3.0, hot), mix(0.34, 1.7, hot), mix(0.42, 0.6, hot)];
          const alpha = Math.pow(1 - am, 1.6) * (0.5 + 0.5 * hr(ms.i, k, 4));
          ax(prev, p, 1.3 + prevAge * 5.5, 1.3 + age * 5.5, 0.25, col, alpha, 3, ms.seed + k * 7.3, 2.0, 0.55);
        }
        prev = p; prevAge = age;
      }
    }
    // ---------- flashes (impacts, blasts)
    for (let gen = 0; gen <= 0; gen++) {
      for (let fi = 0; fi < W.flashes.length; fi++) {
        const fl = W.flashes[fi], a = (t - fl.t) / fl.dur;
        if (a < 0 || a > (fl.kind === 'blast' ? 4.5 : 1.6)) continue;
        const p = SF.targetPoint(fl.tg, t), S = fl.size, c = fl.col;
        if (fl.kind === 'pulse') {
          if (a < 1) { const k = (1 - a) * (1 - a); sp(p, S * (0.7 + 1.1 * a), c, 2.2 * k, 1, 0, 0, null, fi); sp(p, S * 1.7 * (0.3 + a), c, 0.5 * k, 2, 0.75, 0.07); if (a < 0.5) lights.push({ p: v3.add(p, [0, 0, -10]), r: 30, c: [c[0] * 0.9 * k, c[1] * 0.9 * k, c[2] * 0.9 * k] }); }
        } else if (fl.kind === 'burst') {
          if (a < 1) { const k = (1 - a) * (1 - a); sp(p, S * (0.6 + 1.2 * a), c, 3.0 * k, 1, 0, 0, null, fi); sp(p, S * 2.2 * (0.25 + a), [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], 0.45 * k, 2, 0.78, 0.05); sp(p, S * 1.5, [1.0, 0.5, 0.16], 0.4 * k, 0, 3.0); lights.push({ p: v3.add(p, [0, 0, -20]), r: S * 2.2, c: [c[0] * 2.4 * k, c[1] * 2.4 * k, c[2] * 2.4 * k] }); }
          for (let i = 0; i < 2; i++) { const b = (t - fl.t) / (fl.dur * 3.4); if (b < 1) { const d = hdir(fi * 5 + i, 31); sp(v3.addm(p, d, S * (0.2 + 0.7 * b)), S * (0.4 + 0.5 * b), [0.10, 0.09, 0.09], 0.28 * (1 - b) * sstep(0, 0.1, b), 3, 0.12 * (1 - b) * (1 - b), fi + i * 0.37); } }
        } else { // blast: white-hot core, fireball, shock ring, dust, sparks
          if (a < 1) {
            const k = Math.pow(1 - a, 2.2);
            sp(p, S * (0.34 + 0.55 * a), [1.0, 0.86, 0.6], 3.4 * k, 1, 0, 0, null, fi * 1.7);
            sp(p, S * (0.5 + 0.6 * a), [1.0, 0.46, 0.13], 0.42 * k, 0, 3.8);
            if (S > 150) sp(p, S * 2.0 * (0.18 + a), [1.0, 0.75, 0.45], 0.28 * (1 - a) * (1 - a), 2, 0.8, 0.03);
            lights.push({ p: v3.add(p, [0, 0, -30]), r: S * 2.6, c: [c[0] * 2.6 * k, c[1] * 2.6 * k, c[2] * 2.6 * k] });
            for (let i = 0; i < 22; i++) { const d = hdir(fi * 7 + i, 41), sv = S * (1.4 + 2.2 * hr(fi, i, 6)); sp(v3.addm(p, d, sv * (1 - Math.pow(1 - a, 2))), 1.6 + 2.4 * (1 - a), [1.0, 0.66, 0.26], 2.6 * (1 - a) * (1 - a), 4); }
          }
          const b = (t - fl.t) / (fl.dur * 4.5);
          if (b < 1) for (let i = 0; i < 3; i++) { const d = hdir(fi * 5 + i, 31); sp(v3.addm(p, d, S * (0.12 + 0.7 * Math.sqrt(b))), S * (0.30 + 0.5 * b), [0.10, 0.09, 0.09], 0.30 * (1 - b) * sstep(0, 0.06, b), 3, 0.22 * Math.pow(1 - b, 4), fi + i * 0.61, null, i); }
        }
      }
    }
  }

  // ================================================================= bridge hologram: simplified fleet figure
  function hologram(t, models, states) {
    const H = SF.models.flag.meta.bridge.holo, sc = 1 / 82, sy = 1 / 44, tw = t / T * 6.2831853;
    const c1 = [0.25, 0.9, 1.0];
    for (let i = 0; i < W.ships.length; i++) {
      const s = W.ships[i], st = states[i];
      // amplified station-keeping so the figure visibly breathes
      const p = [H[0] + st.pos[0] * sc + (st.pos[0] - s.base[0]) * sc * 2, H[1] + st.pos[1] * sy, H[2] + (st.pos[2] - 80) * sc + (st.pos[2] - s.base[2]) * sc * 2];
      const big = s.type === 'flag';
      const gc = big ? [0.9, 1.0, 1.0] : (s.type === 'guard' ? c1 : [0.45, 1.0, 0.85]), gl = big ? 6.8 : (s.type === 'guard' ? 1.1 : 1.5), gw = big ? 1.5 : (s.type === 'guard' ? 0.5 : 0.75);
      sp(p, big ? 0.9 : 0.34, gc, big ? 2.2 : 1.6, 4);
      // fork glyph: two tines forward, short wake behind
      ax([p[0] - gw * 0.5, p[1], p[2] - gl * 0.6], [p[0] - gw * 0.5, p[1], p[2] + gl], 0.07 + (big ? 0.2 : 0), 0.05, 0, gc, 1.3, 4);
      ax([p[0] + gw * 0.5, p[1], p[2] - gl * 0.6], [p[0] + gw * 0.5, p[1], p[2] + gl], 0.07 + (big ? 0.2 : 0), 0.05, 0, gc, 1.3, 4);
      ax([p[0] - gw * 0.5, p[1], p[2] - gl * 0.6], [p[0] + gw * 0.5, p[1], p[2] - gl * 0.6], 0.06, 0.06, 0, gc, 1.1, 4);
      const tl = big ? 5 : 2.2 + 0.6 * Math.sin(tw * 9 + i);
      ax([p[0], p[1], p[2] - gl * 0.6 - tl], [p[0], p[1], p[2] - gl * 0.6], 0.02, 0.12, 0, c1, 0.7, 4);
      if (!big && i % 3 === 0) ax(p, [p[0], H[1] - 10, p[2]], 0.05, 0.05, 0, c1, 0.35, 4);
    }
    // range rings, sweeping line bands
    for (let k = 0; k < 3; k++) sp([H[0], H[1] - 10, H[2]], 13.5, c1, 0.5 - k * 0.1, 2, 0.34 + k * 0.3, 0.012, [0, 1, 0]);
    const sw = ((t * 0.21) % 1) * 2 - 1;
    ax([H[0] - 12, H[1] - 10, H[2] + sw * 13], [H[0] + 12, H[1] - 10, H[2] + sw * 13], 0.12, 0.12, 0, [0.5, 1.0, 1.0], 0.9, 4);
    for (let k = -2; k <= 2; k++) ax([H[0] + k * 5, H[1] - 10, H[2] - 13], [H[0] + k * 5, H[1] - 10, H[2] + 13], 0.04, 0.04, 0, c1, 0.3, 4);
    // heading band + asteroid contacts ahead
    ax([H[0], H[1] - 1, H[2] + 8], [H[0], H[1] - 1, H[2] + 15 + 2 * Math.sin(tw * 13)], 0.18, 0.02, 0, [0.6, 1.0, 1.0], 0.8, 4);
    for (const rk of W.rocks) {
      const rp = SF.rockPos(rk, t), z = (rp[2] - 80) * sc; if (z > 26 || z < -16) continue;
      sp([H[0] + rp[0] * sc, H[1] + rp[1] * sy, H[2] + z], rk.kind === 'A' ? 1.5 : 0.8, [1.0, 0.6, 0.2], 1.6, 4);
    }
  }

  // ================================================================= interior sets drawn alone
  function atrium(t, models, draws, lights, F) {
    const tw = t / T * 6.2831853, I = m4.ident();
    const breath = 0.72 + 0.28 * Math.sin(tw * 13) + 0.10 * Math.sin(tw * 31 + 1);
    F.env.core = breath;
    draws.push({ model: models.atrium, m: I, kind: 3, sunBake: 0 });
    const ry = (a, y, tilt, tax) => m4.trs([0, y, 0], quat.mul(quat.axis(tax || [1, 0, 0], tilt || 0), quat.axis([0, 1, 0], a)));
    draws.push({ model: models.ringA, m: ry(tw * 3, 2 * Math.sin(tw * 5)), kind: 3, sunBake: 0 });
    draws.push({ model: models.ringB, m: ry(-tw * 2 + 1, 22 + 3 * Math.sin(tw * 4), 0.16), kind: 3, sunBake: 0 });
    draws.push({ model: models.ringB, m: ry(-tw * 2 + 2.6, -22 - 3 * Math.sin(tw * 4), -0.16, [0, 0, 1]), kind: 3, sunBake: 0 });
    draws.push({ model: models.ringC, m: ry(tw * 1 + 0.4, -1 + 2 * Math.sin(tw * 3 + 1)), kind: 3, sunBake: 0 });
    lights.push({ p: [0, 0, 0], r: 86, c: [1.5 * breath, 4.0 * breath, 4.8 * breath] }, { p: [0, 46, 0], r: 60, c: [0.6 * breath, 1.6 * breath, 2.0 * breath] }, { p: [0, -46, 0], r: 60, c: [0.6 * breath, 1.6 * breath, 2.0 * breath] });
    // energy motes rising along the core
    for (let i = 0; i < 90; i++) {
      const f = (t * (0.10 + 0.12 * hr(i, 1, 3)) + hr(i, 2, 3)) % 1, a = hr(i, 3, 3) * 6.2832 + tw * (i % 2 ? 2 : -2), R = 24 + 10 * hr(i, 4, 3);
      sp([Math.cos(a) * R, -70 + f * 140, Math.sin(a) * R], 1.2 + 1.2 * hr(i, 5, 3), [0.5, 0.95, 1.0], 1.4 * Math.sin(f * Math.PI) * breath, 4);
    }
    sp([0, 0, 0], 120, [0.1, 0.5, 0.7], 0.22 * breath, 0, 2.0);
  }
  function corridor(t, models, draws, lights) {
    const tw = t / T * 6.2831853, I = m4.ident(), cm = models.corridor.meta;
    draws.push({ model: models.corridor, m: I, kind: 3, sunBake: 0 });
    // energy blocks advancing in batches along the two floor slots
    const SPc = 11, N = 30, v = SPc * 5 * 26 / T;      // 26 batch lengths per loop
    for (let side = -1; side <= 1; side += 2) for (let k = 0; k < N; k++) {
      if ((k + (side > 0 ? 2 : 0)) % 5 > 2) continue;
      const z = 4 + pmod(k * SPc + t * v + (side > 0 ? 17 : 0), N * SPc);
      if (z > 328) continue;
      draws.push({ model: models.eblock, m: m4.trans([side * 15.5, 2.5, z]), kind: 3, sunBake: 0, seed: k });
      if (k % 5 === 1) lights.push({ p: [side * 15.5, 8, z], r: 16, c: [0.5, 1.9, 2.4] });
    }
    // jaws closing and opening around the conduit axis
    cm.clamps.forEach((z, i) => {
      const c = 0.5 + 0.5 * Math.cos(tw * (4 + i) + i * 2.1), x = 5 + 15 * c * c;
      draws.push({ model: models.clamp, m: m4.trans([x, 72, z]), kind: 3, sunBake: 0 });
      draws.push({ model: models.clamp, m: m4.trs([-x, 72, z], quat.axis([0, 1, 0], Math.PI)), kind: 3, sunBake: 0 });
    });
    // conduit stream down the central void + breech glow
    for (let k = 0; k < 70; k++) { const f = (t * (0.16 + 0.1 * hr(k, 1, 4)) + hr(k, 2, 4)) % 1, a = hr(k, 3, 4) * 6.2832 + tw * 3, rr = 1.5 + 3.5 * hr(k, 4, 4); sp([Math.cos(a) * rr, 40 + Math.sin(a) * rr, 6 + f * 384], 0.7 + 0.8 * hr(k, 5, 4), [0.45, 0.95, 1.0], 1.5, 4); }
    const br = 0.8 + 0.2 * Math.sin(tw * 17);
    sp([0, 40, 388], 90, [0.25, 0.8, 1.0], 0.7 * br, 0, 2.2);
    lights.push({ p: [0, 40, 372], r: 70, c: [1.3 * br, 3.6 * br, 4.4 * br] });
  }
})();
