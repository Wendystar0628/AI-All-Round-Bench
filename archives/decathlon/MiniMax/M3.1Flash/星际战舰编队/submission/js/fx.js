/* 星际战舰编队 — weapons, shields and light effects
 * Everything is a pure function of the round clock, so the exporter can jump
 * to any time and reproduce the exact same frame.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, V = F.Vox, P = F.Palette;

  /* ---------------------------------------------------------------- */
  /* schedule                                                         */
  /* ---------------------------------------------------------------- */
  const SCHED = {
    beamCharge: 61.6,
    beamFire: 63.0,
    beamEnd: 68.6,
    beamFade: 69.8,
    pulseStart: 64.0,
    pulseEnd: 69.0,
    ciwsStart: 65.0,
    ciwsEnd: 71.0,
    missileStart: 67.0,
    missileEnd: 72.4,
    shieldStart: 71.8,
    shieldEnd: 75.6,
    accelStart: 73.2,
    accelEnd: 78.0,
  };

  /* ---------------------------------------------------------------- */
  /* superellipsoid mesh used as a shield shell                       */
  /* ---------------------------------------------------------------- */
  function buildShieldMesh() {
    const m = new V.VoxMesh('shield');
    const LAT = 20, LON = 28, N = 4.0;
    const pt = (a, b) => {
      const c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / N) * Math.sign(Math.cos(b));
      const y = Math.sign(Math.cos(b)) * Math.pow(Math.abs(Math.cos(b)), 2 / N);
      const z = Math.sign(s) * Math.pow(Math.abs(s), 2 / N) * Math.sign(Math.cos(b));
      return [x, y, z];
    };
    for (let i = 0; i < LAT; i++) {
      const b0 = (i / LAT) * Math.PI - Math.PI / 2, b1 = ((i + 1) / LAT) * Math.PI - Math.PI / 2;
      for (let j = 0; j < LON; j++) {
        const a0 = (j / LON) * Math.PI * 2, a1 = ((j + 1) / LON) * Math.PI * 2;
        const p00 = pt(a0, b0), p10 = pt(a1, b0), p11 = pt(a1, b1), p01 = pt(a0, b1);
        m.quad(p00, p10, p11, p01, P.glow, { ao: [1, 1, 1, 1] });
      }
    }
    return m;
  }

  /* ---------------------------------------------------------------- */
  /* helpers                                                          */
  /* ---------------------------------------------------------------- */
  function pushSprite(out, p, size, col, a, kind, phase) {
    out.push({ p: p, size: size, c: col, a: a, kind: kind || 0, phase: phase || 0 });
  }
  const CYAN = [0.32, 0.86, 1.0];
  const CYAN_HOT = [0.75, 0.98, 1.0];
  const AMBER = [1.0, 0.66, 0.28];
  const AMBER_HOT = [1.0, 0.92, 0.72];
  const RED = [1.0, 0.30, 0.20];
  const WHITE = [1.0, 0.97, 0.92];

  /* muzzle flash */
  function muzzleFlash(out, p, dir, size, col) {
    pushSprite(out, p, size * 1.9, col || AMBER_HOT, 0.9, 2, 0);
    pushSprite(out, p, size * 0.9, col || WHITE, 1.0, 0, 0);
  }

  /* explosion: shell + sparks + dust */
  function blast(out, p, age, scale, col) {
    if (age < 0 || age > 2.4) return;
    const c = col || AMBER;
    // core shell
    const s = scale * (0.5 + age * 3.4);
    pushSprite(out, p, s, c, Math.max(0, 1.0 - age / 1.1) * 0.95, 3, 0);
    pushSprite(out, p, s * 0.55, WHITE, Math.max(0, 1.0 - age / 0.42) * 1.0, 0, 0);
    // dust
    for (let i = 0; i < 5; i++) {
      const a = Core.hash(i * 7.3) * 6.28, b = Core.hash(i * 3.1) * 2 - 1;
      const r = Math.sqrt(1 - b * b);
      const d = scale * age * (2.0 + i * 0.5);
      pushSprite(out, [p[0] + Math.cos(a) * r * d, p[1] + b * d * 0.8, p[2] + Math.sin(a) * r * d],
        scale * (1.6 + age * 2.2), [0.42, 0.34, 0.30], Math.max(0, 0.5 - age * 0.28), 4, i * 1.37);
    }
    // sparks
    for (let i = 0; i < 9; i++) {
      const a = Core.hash(i * 11.7) * 6.28, b = Core.hash(i * 5.9) * 2 - 1;
      const r = Math.sqrt(1 - b * b);
      const sp = scale * (3.2 + Core.hash(i * 2.3) * 4);
      const d = sp * age;
      pushSprite(out, [p[0] + Math.cos(a) * r * d, p[1] + b * d, p[2] + Math.sin(a) * r * d],
        scale * 0.5, i % 3 ? AMBER_HOT : CYAN_HOT, Math.max(0, 1 - age / 0.8), 2, i);
    }
  }

  /* ---------------------------------------------------------------- */
  /* main evaluation                                                  */
  /* ---------------------------------------------------------------- */
  /* ctx: { t, world }  — world holds ships, rocks, turrets, craft ... */
  function evaluate(ctx) {
    const t = ctx.t, w = ctx.world;
    const S = ctx.sprites, B = ctx.beams, H = ctx.shields;

    /* ---------- flagship beam main cannon ---------- */
    const charge = Core.smoothstep(SCHED.beamCharge, SCHED.beamFire, t);
    const fire = Core.smoothstep(SCHED.beamFire, SCHED.beamFire + 0.35, t) *
      (1 - Core.smoothstep(SCHED.beamEnd, SCHED.beamFade, t));
    const muzzle = w.flagship.muzzleWorld;
    const cbase = w.flagship.cannonBaseWorld || muzzle;
    const tgt = w.beamTarget;
    /* the barrel's glow channel lights up stage by stage while it charges */
    if (t > SCHED.beamCharge - 1.1 && t < SCHED.beamFire + 0.3) {
      B.push({
        a: cbase, b: muzzle, color: [0.30, 0.78, 1.0],
        radius: 5 + charge * 9, intensity: charge * 0.85,
      });
      for (let i = 0; i < 8; i++) {
        const u = (i + 0.5) / 8;
        const p = [
          cbase[0] + (muzzle[0] - cbase[0]) * u,
          cbase[1] + (muzzle[1] - cbase[1]) * u,
          cbase[2] + (muzzle[2] - cbase[2]) * u,
        ];
        const lit = Core.smoothstep(0.02 + i * 0.10, 0.20 + i * 0.10, charge);
        if (lit > 0.02) {
          pushSprite(S, p, 6 + lit * 10, CYAN_HOT, lit * 0.85, 0, i);
          pushSprite(S, p, 16 + lit * 16, CYAN, lit * 0.28, 3, i);
        }
      }
      // charge glow gathering at the muzzle
      const cs = 6 + charge * 30 * (0.82 + 0.18 * Math.sin(t * 34));
      pushSprite(S, muzzle, cs, CYAN, 0.35 + charge * 0.65, 0, 0);
      pushSprite(S, muzzle, cs * 2.1, CYAN, 0.12 + charge * 0.34, 3, 0);
      // launch rings sliding off the muzzle
      for (let i = 0; i < 3; i++) {
        const ph = Core.wrap(t * 0.85 - i * 0.34, 1);
        pushSprite(S, muzzle, 14 + ph * 52, CYAN, (1 - ph) * (1 - ph) * 0.55 * charge, 3, i);
      }
    }
    if (fire > 0.01) {
      B.push({
        a: muzzle, b: tgt, color: [0.42, 0.92, 1.0], radius: 20.0 + charge * 6.0,
        intensity: fire * (0.85 + 0.15 * Math.sin(t * 22)),
      });
      // muzzle bloom
      pushSprite(S, muzzle, 52 * fire, CYAN_HOT, 0.95 * fire, 0, 0);
      pushSprite(S, muzzle, 130 * fire, CYAN, 0.38 * fire, 3, 0);
      // impact bloom at the rock
      pushSprite(S, tgt, 70 * fire, WHITE, 0.85 * fire, 3, 0);
      pushSprite(S, tgt, 210 * fire, AMBER, 0.48 * fire, 0, 0);
    }

    /* ---------- pulse turrets ---------- */
    for (const tu of w.turrets) {
      const delay = tu.idx * 0.22;
      const start = SCHED.pulseStart + delay;
      for (let k = 0; k < 4; k++) {
        const ts = start + k * 0.42;
        if (t < ts || t > ts + 1.9) continue;
        const age = t - ts;
        const target = w.pulseTargets[tu.idx % w.pulseTargets.length];
        const from = tu.muzzleWorld;
        const flight = Core.V3.dist(from, target) / 520;
        const dir = Core.V3.norm([0, 0, 0], Core.V3.sub([0, 0, 0], target, from));
        if (age < flight) {
          const u = age / flight;
          const p = [
            from[0] + (target[0] - from[0]) * u,
            from[1] + (target[1] - from[1]) * u,
            from[2] + (target[2] - from[2]) * u,
          ];
          pushSprite(S, p, 9, CYAN_HOT, 0.95, 0, 0);
          pushSprite(S, p, 20, CYAN, 0.4, 3, 0);
          // short tail
          const tp = [p[0] - dir[0] * 12, p[1] - dir[1] * 12, p[2] - dir[2] * 12];
          pushSprite(S, tp, 5, CYAN, 0.5, 0, 0);
        } else {
          if (age - flight < 0.1) muzzleFlash(S, from, dir, 13, AMBER_HOT);
          blast(S, target, age - flight, 13, CYAN);
        }
      }
    }

    /* ---------- escort CIWS ---------- */
    for (const c of w.ciws) {
      const start = SCHED.ciwsStart + c.idx * 0.11 + (c.side > 0 ? 0.05 : 0);
      for (let k = 0; k < 14; k++) {
        const ts = start + k * 0.14;
        if (t < ts || t > ts + 1.2) continue;
        const age = t - ts;
        const target = w.ciwsTargets[c.idx % w.ciwsTargets.length];
        const from = c.muzzleWorld;
        const d = Core.V3.dist(from, target);
        const flight = d / 900;
        if (age < flight) {
          const u = age / flight;
          const p = [
            from[0] + (target[0] - from[0]) * u,
            from[1] + (target[1] - from[1]) * u,
            from[2] + (target[2] - from[2]) * u,
          ];
          // a spaced line of dots reads as a tracer stream
          pushSprite(S, p, 5.5, AMBER_HOT, 0.95, 2, 0);
          pushSprite(S, p, 13, AMBER, 0.32, 0, 0);
        } else if (age - flight < 0.08) {
          muzzleFlash(S, from, [0, 0, 1], 9, AMBER_HOT);
          blast(S, target, age - flight, 7, AMBER);
        }
      }
    }

    /* ---------- vanguard missiles ---------- */
    const M4 = Core.M4;
    for (const mi of w.missiles) {
      const ts = SCHED.missileStart + mi.idx * 0.28;
      if (t < ts || t > ts + 4.2) { if (mi.renderable) mi.renderable.visible = false; continue; }
      const age = t - ts;
      const from = mi.launchWorld;
      const target = mi.target;
      const flight = 2.2 + Core.hash(mi.idx) * 0.5;
      if (age < flight) {
        const u = age / flight;
        // arcing path: rises then dives onto the target
        const arc = Math.sin(u * Math.PI) * 150;
        const p = [
          from[0] + (target[0] - from[0]) * u,
          from[1] + (target[1] - from[1]) * u + arc,
          from[2] + (target[2] - from[2]) * u,
        ];
        mi.pos = p;
        mi.alive = true;
        if (mi.renderable) {
          const u2 = Math.min(1, u + 0.01);
          const arc2 = Math.sin(u2 * Math.PI) * 150;
          const q = [
            from[0] + (target[0] - from[0]) * u2,
            from[1] + (target[1] - from[1]) * u2 + arc2,
            from[2] + (target[2] - from[2]) * u2,
          ];
          const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
          const L = Math.hypot(dx, dy, dz) || 1;
          mi.renderable.visible = true;
          M4.compose(mi.renderable.m, p, Math.atan2(dx, dz), -Math.asin(dy / L), 0, 1);
        }
        // engine plume + trail
        pushSprite(S, p, 11, AMBER_HOT, 0.85, 1, mi.idx);
        pushSprite(S, p, 26, AMBER, 0.35, 1, mi.idx + 0.5);
        for (let q = 1; q <= 5; q++) {
          const u2 = Math.max(0, u - q * 0.035);
          const arc2 = Math.sin(u2 * Math.PI) * 150;
          const tp = [
            from[0] + (target[0] - from[0]) * u2,
            from[1] + (target[1] - from[1]) * u2 + arc2,
            from[2] + (target[2] - from[2]) * u2,
          ];
          pushSprite(S, tp, 9 - q * 1.1, AMBER, 0.24 / q, 1, mi.idx + q);
        }
      } else {
        mi.alive = false;
        if (mi.renderable) mi.renderable.visible = false;
        if (age - flight < 1.6) blast(S, target, age - flight, 26, AMBER);
      }
    }

    /* ---------- rock impacts from the beam ---------- */
    for (const im of w.impacts) {
      const age = t - im.t;
      if (age < 0 || age > 2.2) continue;
      blast(S, im.p, age, im.scale, im.color);
    }

    /* ---------- thruster plumes ---------- */
    const thrust = w.thrust;
    for (const sh of w.ships) {
      const sc = sh.thrustScale || 1;
      for (const e of sh.engineOffsets) {
        const p = [
          sh.pos[0] + e[0], sh.pos[1] + e[1], sh.pos[2] + e[2],
        ];
        const len = sh.flameLen * thrust * sc;
        pushSprite(S, p, len * 0.8, CYAN, 0.75 * thrust, 1, sh.seed);
        pushSprite(S, p, len * 0.38, CYAN_HOT, 0.9 * thrust, 1, sh.seed + 1);
      }
    }

    /* ---------- shields ---------- */
    for (const sh of w.ships) {
      const idx = sh.shieldIndex;
      const t0 = SCHED.shieldStart + idx * 0.055;
      const a = Core.smoothstep(t0, t0 + 1.4, t);
      if (a <= 0.002) continue;
      const expand = Core.smoothstep(t0, t0 + 1.9, t);
      const wave = (t - t0) * 0.55;
      H.push({
        gpu: w.shieldGpu, m: sh.shieldMatrix, nm: sh.shieldNormal,
        color: sh.shieldColor, alpha: a * 0.9, wave: wave, scale: 1,
      });
    }

    /* ---------- interior motion: corridor energy blocks ---------- */
    if (w.corridor) {
      const c = w.corridor;
      for (let i = 0; i < 14; i++) {
        const ph = (t * 0.16 + i * 0.0717) % 1;
        const z = 268 - ph * 350;
        const side = i % 2 === 0 ? 1 : -1;
        const p = [side > 0 ? 82 : 50, -46 + (i % 3) * 8, z];
        pushSprite(S, p, 9, side > 0 ? CYAN_HOT : AMBER_HOT, 0.85, 0, i);
        pushSprite(S, p, 22, side > 0 ? CYAN : AMBER, 0.3, 3, i);
      }
    }
    /* ---------- interior motion: bridge fleet hologram ---------- */
    if (w.hologram) {
      const H0 = w.hologram;
      // a flat tactical volume: ship marks, drifting tracks, faint projection haze
      for (let i = 0; i < 34; i++) {
        const ph = (t * 0.09 + i * 0.0294) % 1;
        const a2 = i * 2.399;
        const r = 10 + (i % 6) * 5;
        const p = [
          H0[0] + Math.cos(a2 + ph * 2.4) * r,
          H0[1] + Math.sin(a2 * 1.7 + ph * 2.2) * 3 + ph * 5,
          H0[2] + Math.sin(a2 + ph * 2.4) * r * 0.55,
        ];
        pushSprite(S, p, i % 7 === 0 ? 3.0 : 1.9, i % 3 ? CYAN_HOT : AMBER_HOT, 0.85, 0, i);
        // short trailing track
        const tp = [p[0] - Math.cos(a2 + ph * 2.4) * 5, p[1], p[2] - Math.sin(a2 + ph * 2.4) * 3];
        pushSprite(S, tp, 1.3, CYAN, 0.32, 2, i);
      }
      // projection haze under the plot
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.22 + i * 0.33) % 1;
        pushSprite(S, [H0[0], H0[1] - 12 + ph * 16, H0[2]], 20 + ph * 16, CYAN, 0.07 * (1 - ph), 0, i);
      }
    }
    /* ---------- interior motion: core energy flow ---------- */
    if (w.atriumCore) {
      for (let i = 0; i < 10; i++) {
        const ph = (t * 0.13 + i * 0.1) % 1;
        const y = -105 + ph * 210;
        const p = [0, y, -300];
        pushSprite(S, p, 16 + Math.sin(ph * 6.28) * 8, CYAN_HOT, 0.55 * Math.sin(ph * Math.PI), 0, i);
        pushSprite(S, p, 34, CYAN, 0.22 * Math.sin(ph * Math.PI), 3, i);
      }
    }
  }

  F.FX = {
    SCHED: SCHED,
    buildShieldMesh: buildShieldMesh,
    evaluate: evaluate,
    pushSprite: pushSprite,
    blast: blast,
    muzzleFlash: muzzleFlash,
    CYAN: CYAN, AMBER: AMBER, WHITE: WHITE,
  };
})(window);
