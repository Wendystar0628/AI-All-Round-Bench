/* 星际战舰编队 — camera director
 * One continuous 78 second round.  Every shot is a designed move that reveals
 * a new scale or space; cuts keep the heading and the motion connected, and
 * the last shot lands exactly on the first shot's framing so the loop closes.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core;

  const D = F.Director = {};
  D.PERIOD = 78.0;

  const FLEET = [0, 0, 0];

  /* helper: {a:'rock', o:[x,y,z]} -> position relative to a moving anchor */
  const A = (a, o) => ({ a: a, o: o });

  D.SHOTS = [
    /* 1 — the lead escort crosses the near field, the flagship's flank
     *     recedes to the bow and the fleet opens out ahead */
    {
      t0: 0, t1: 8.5, fov: 52, space: 'exterior', slowIn: true,
      keys: [
        { t: 0.00, pos: [-430, 96, -430], look: [-150, 44, -60] },
        { t: 0.34, pos: [-392, 72, -230], look: [-120, 40, 220] },
        { t: 0.68, pos: [-330, 52, 30], look: [-60, 48, 480] },
        { t: 1.00, pos: [-250, 40, 290], look: [10, 58, 600] },
      ]
    },
    /* 2 — port flank sweep, armour steps, turrets, hangar mouth */
    {
      t0: 8.5, t1: 16.5, fov: 48, space: 'exterior',
      keys: [
        { t: 0.00, pos: [-148, 80, 440], look: [-70, 40, 540] },
        { t: 0.28, pos: [-186, 58, 310], look: [-104, 26, 570] },
        { t: 0.58, pos: [-216, 26, 150], look: [-132, 8, 600] },
        { t: 0.82, pos: [-238, -6, -30], look: [-150, -8, 520] },
        { t: 1.00, pos: [-250, -24, -180], look: [-160, -16, 440] },
      ]
    },
    /* 3 — swing outboard around the lead escort and rise over the dorsal
     *     spine; the whole array opens up */
    {
      t0: 16.5, t1: 23.0, fov: 56, space: 'exterior',
      keys: [
        { t: 0.00, pos: [-250, -24, -180], look: [-150, -10, 60] },
        { t: 0.24, pos: [-336, 44, -120], look: [-120, 30, 60] },
        { t: 0.50, pos: [-352, 140, -30], look: [-60, 90, 120] },
        { t: 0.76, pos: [-288, 248, 78], look: [-20, 40, 330] },
        { t: 1.00, pos: [-214, 336, 230], look: [60, 16, 590] },
      ]
    },
    /* 4 — dive to the port hangar mouth and enter */
    {
      t0: 23.0, t1: 28.0, fov: 48, space: 'exterior',
      keys: [
        { t: 0.00, pos: [-430, 130, 430], look: [-190, 6, 300] },
        { t: 0.34, pos: [-370, 62, 330], look: [-168, -10, 250] },
        { t: 0.68, pos: [-262, 2, 226], look: [-142, -18, 186] },
        { t: 1.00, pos: [-126, -22, 136], look: [-112, -20, 60] },
      ]
    },
    /* 5 — hangar interior, bays and gantries receding */
    {
      t0: 28.0, t1: 35.0, fov: 44, space: 'hangar',
      keys: [
        { t: 0.00, pos: [-98, -18, 120], look: [-95, -18, 20] },
        { t: 0.36, pos: [-96, -20, 40], look: [-94, -16, -56] },
        { t: 0.70, pos: [-94, -16, -40], look: [-92, -14, -132] },
        { t: 1.00, pos: [-92, -12, -116], look: [-90, -12, -200] },
      ]
    },
    /* 6 — energy loading corridor, machines closing in */
    {
      t0: 35.0, t1: 43.0, fov: 42, space: 'corridor',
      keys: [
        { t: 0.00, pos: [62, -34, 262], look: [66, -40, 160] },
        { t: 0.34, pos: [64, -40, 160], look: [64, -46, 40] },
        { t: 0.66, pos: [64, -46, 44], look: [63, -54, -60] },
        { t: 1.00, pos: [62, -54, -36], look: [64, -60, -120] },
      ]
    },
    /* 7 — power core atrium, rise past the rings */
    {
      t0: 43.0, t1: 50.0, fov: 50, space: 'atrium',
      keys: [
        { t: 0.00, pos: [24, -90, -286], look: [0, -46, -300] },
        { t: 0.28, pos: [-22, -48, -288], look: [0, 0, -300] },
        { t: 0.56, pos: [-24, -6, -286], look: [0, 46, -300] },
        { t: 0.80, pos: [6, 40, -318], look: [0, 86, -300] },
        { t: 1.00, pos: [24, 86, -288], look: [0, 116, -300] },
      ]
    },
    /* 8 — command bridge, lateral move past the hub to the viewport */
    {
      t0: 50.0, t1: 57.0, fov: 46, space: 'bridge',
      keys: [
        { t: 0.00, pos: [-54, 112, 224], look: [-10, 122, 286] },
        { t: 0.36, pos: [-46, 118, 252], look: [0, 126, 318] },
        { t: 0.70, pos: [-36, 124, 284], look: [2, 130, 348] },
        { t: 1.00, pos: [-24, 130, 316], look: [0, 132, 392] },
      ]
    },
    /* 9 — out through the viewport into open space */
    {
      t0: 57.0, t1: 61.4, fov: 54, space: 'exterior',
      keys: [
        { t: 0.00, pos: [8, 142, 314], look: [0, 126, 430] },
        { t: 0.40, pos: [6, 146, 430], look: [0, 90, 600] },
        { t: 0.72, pos: [16, 118, 520], look: [26, 40, 780] },
        { t: 1.00, pos: [40, 92, 596], look: [58, 22, 980] },
      ]
    },
    /* 10 — the main cannon gathers and fires; the port flank, the barrel and
     *       the departing beam all read in one frame */
    {
      t0: 61.4, t1: 65.4, fov: 46, space: 'exterior', slowIn: true,
      keys: [
        { t: 0.00, pos: [-430, 300, 420], look: [-40, 70, 540] },
        { t: 0.30, pos: [-370, 250, 460], look: [-30, 62, 545] },
        { t: 0.62, pos: [-310, 200, 505], look: [-20, 56, 550] },
        { t: 1.00, pos: [-250, 150, 560], look: [-8, 54, 570] },
      ]
    },
    /* 11 — riding the beam down onto the rock */
    {
      t0: 65.4, t1: 70.0, fov: 48, space: 'exterior',
      keys: [
        { t: 0.00, pos: [-340, 100, 690], look: [0, 30, 1500] },
        { t: 0.34, pos: [-190, 66, 1180], look: [0, 14, 1850] },
        { t: 0.68, pos: [-80, 40, 1560], look: [0, 2, 2050] },
        { t: 1.00, pos: A('rock', [210, 78, -330]), look: A('rock', [0, 0, 0]) },
      ]
    },
    /* 12 — pull back: point defence and missiles over the rock */
    {
      t0: 70.0, t1: 72.5, fov: 52, space: 'exterior',
      keys: [
        { t: 0.00, pos: A('rock', [140, 30, -260]), look: A('rock', [0, 10, 0]) },
        { t: 0.45, pos: A('rock', [300, 90, -430]), look: [0, 30, 700] },
        { t: 1.00, pos: A('rock', [470, 150, -620]), look: [-40, 20, 260] },
      ]
    },
    /* 13 — shields bloom along the whole formation */
    {
      t0: 72.5, t1: 75.6, fov: 56, space: 'exterior',
      keys: [
        { t: 0.00, pos: A('rock', [470, 150, -620]), look: [-40, 20, 260] },
        { t: 0.40, pos: [-260, 210, -700], look: [-20, 30, -160] },
        { t: 0.74, pos: [-230, 260, -520], look: [-10, 20, 140] },
        { t: 1.00, pos: [-202, 244, -378], look: [0, 10, 360] },
      ]
    },
    /* 14 — the surge carries the camera wide and round, back to the lead
     *       escort; the last key is the first key of shot 1, so the loop
     *       closes on exactly the same frame */
    {
      t0: 75.6, t1: 78.0, fov: 52, space: 'exterior', slowOut: true,
      keys: [
        { t: 0.00, pos: [-202, 244, -378], look: [0, 10, 360] },
        { t: 0.34, pos: [-404, 196, -448], look: [-160, 90, -140] },
        { t: 0.70, pos: [-462, 132, -500], look: [-190, 60, -120] },
        { t: 1.00, pos: [-430, 96, -430], look: [-150, 44, -60] },
      ]
    },
  ];

  /* ---------------------------------------------------------------- */
  function shotAt(t) {
    const u = Core.wrap(t, D.PERIOD);
    for (const s of D.SHOTS) if (u >= s.t0 && u < s.t1) return s;
    return D.SHOTS[D.SHOTS.length - 1];
  }

  function resolve(k, ctx, which) {
    if (typeof k === 'object' && k && k.a) {
      const base = ctx.anchors[k.a] || FLEET;
      return [base[0] + k.o[0], base[1] + k.o[1], base[2] + k.o[2]];
    }
    return k;
  }

  /* evaluate the camera for round time t */
  D.evaluate = function (t, ctx) {
    const u = Core.wrap(t, D.PERIOD);
    const s = shotAt(u);
    const local = (u - s.t0) / (s.t1 - s.t0);
    let p = local;
    // gentle ease at the head / tail of a shot
    if (s.slowIn && local < 0.16) p = Core.lerp(Core.smootherstep(0, 1, local / 0.16) * 0.16, local, Core.smoothstep(0, 1, local / 0.16));
    if (s.slowOut && local > 0.84) {
      const q = (local - 0.84) / 0.16;
      p = Core.lerp(0.84 + Core.smootherstep(0, 1, q) * 0.16, local, Core.smoothstep(0, 1, q));
    }
    const keys = s.keys;
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1].t) i++;
    const k1 = keys[i], k2 = keys[Math.min(i + 1, keys.length - 1)];
    const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const span = Math.max(1e-5, k2.t - k1.t);
    let lt = Core.clamp((p - k1.t) / span, 0, 1);
    const P0 = resolve(k0.pos, ctx), P1 = resolve(k1.pos, ctx), P2 = resolve(k2.pos, ctx), P3 = resolve(k3.pos, ctx);
    const L0 = resolve(k0.look, ctx), L1 = resolve(k1.look, ctx), L2 = resolve(k2.look, ctx), L3 = resolve(k3.look, ctx);
    const pos = [0, 0, 0], look = [0, 0, 0];
    Core.catmullVec(pos, P0, P1, P2, P3, lt);
    Core.catmullVec(look, L0, L1, L2, L3, lt);
    const fov = (k1.fov !== undefined ? k1.fov : s.fov);
    return { pos: pos, look: look, fov: fov * Math.PI / 180, shot: s, space: s.space, local: local };
  };

  D.shotAt = shotAt;
})(window);
