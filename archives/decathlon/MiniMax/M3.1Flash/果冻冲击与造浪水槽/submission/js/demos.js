/* demos.js — the four scripted demonstrations and the timeline engine.
   Each run owns its camera keyframes, event list and time-warp segments. */
(function (global) {
  'use strict';
  const U = global.U;

  /* ------------------------------------------------------------------ */
  const RUNS = [
    {
      id: 'jelly-center',
      title: '正中单击',
      scene: 1,
      duration: 7.0,
      /* recorded time -> simulation speed (slow motion segments) */
      rate: [
        { t0: 0.00, t1: 0.44, r: 1.0 },
        { t0: 0.44, t1: 1.30, r: 0.26 },
        { t0: 1.30, t1: 2.35, r: 1.0 },
        { t0: 2.35, t1: 3.10, r: 0.34 },
        { t0: 3.10, t1: 7.00, r: 1.0 }
      ],
      events: [
        { t: 0.00, type: 'impact', kind: 'center' }
      ],
      camera: [
        { t: 0.00, p: [1.42, 1.02, 1.62], look: [-0.02, 0.30, 0.02], fov: 0.62 },
        { t: 0.55, p: [0.86, 0.74, 1.02], look: [0.00, 0.28, 0.00], fov: 0.58 },
        { t: 1.45, p: [0.60, 0.58, 0.76], look: [0.00, 0.26, 0.00], fov: 0.54 },
        { t: 3.20, p: [0.58, 0.56, 0.72], look: [0.00, 0.25, 0.00], fov: 0.53 },
        { t: 5.20, p: [0.95, 0.78, 1.18], look: [0.00, 0.22, 0.00], fov: 0.58 },
        { t: 7.00, p: [1.20, 0.92, 1.45], look: [-0.02, 0.22, 0.00], fov: 0.62 }
      ]
    },
    {
      id: 'jelly-multi',
      title: '连击砸裂',
      scene: 1,
      duration: 9.6,
      rate: [
        { t0: 0.00, t1: 0.42, r: 1.0 },
        { t0: 0.42, t1: 0.95, r: 0.30 },
        { t0: 0.95, t1: 1.18, r: 1.0 },
        { t0: 1.18, t1: 1.68, r: 0.30 },
        { t0: 1.68, t1: 1.90, r: 1.0 },
        { t0: 1.90, t1: 2.40, r: 0.30 },
        { t0: 2.40, t1: 2.62, r: 1.0 },
        { t0: 2.62, t1: 3.60, r: 0.20 },
        { t0: 3.60, t1: 9.60, r: 1.0 }
      ],
      events: [
        { t: 0.00, type: 'impact', kind: 'multi' }
      ],
      camera: [
        { t: 0.00, p: [1.30, 1.05, 1.55], look: [0.00, 0.30, 0.00], fov: 0.62 },
        { t: 1.10, p: [0.82, 0.76, 1.00], look: [0.00, 0.28, 0.00], fov: 0.58 },
        { t: 2.60, p: [0.56, 0.56, 0.70], look: [0.00, 0.25, 0.00], fov: 0.54 },
        { t: 4.20, p: [0.62, 0.60, 0.78], look: [0.00, 0.24, 0.00], fov: 0.55 },
        { t: 7.00, p: [0.92, 0.80, 1.14], look: [0.00, 0.22, 0.00], fov: 0.60 },
        { t: 9.60, p: [1.18, 0.94, 1.42], look: [-0.02, 0.20, 0.00], fov: 0.63 }
      ]
    },
    {
      id: 'jelly-offset',
      title: '偏心撞击',
      scene: 1,
      duration: 7.6,
      rate: [
        { t0: 0.00, t1: 0.46, r: 1.0 },
        { t0: 0.46, t1: 1.45, r: 0.28 },
        { t0: 1.45, t1: 3.10, r: 1.0 },
        { t0: 3.10, t1: 3.85, r: 0.38 },
        { t0: 3.85, t1: 7.60, r: 1.0 }
      ],
      events: [
        { t: 0.00, type: 'impact', kind: 'offset' }
      ],
      camera: [
        { t: 0.00, p: [1.55, 1.00, 1.45], look: [0.05, 0.26, 0.05], fov: 0.64 },
        { t: 0.70, p: [1.10, 0.80, 1.10], look: [0.02, 0.24, 0.02], fov: 0.60 },
        { t: 1.60, p: [0.95, 0.66, 0.92], look: [0.02, 0.20, 0.02], fov: 0.58 },
        { t: 3.40, p: [1.30, 0.78, 1.25], look: [0.10, 0.16, 0.02], fov: 0.62 },
        { t: 5.40, p: [1.42, 0.86, 1.38], look: [0.14, 0.14, 0.02], fov: 0.64 },
        { t: 7.60, p: [1.48, 0.90, 1.44], look: [0.16, 0.12, 0.02], fov: 0.65 }
      ]
    },
    {
      id: 'tank-full',
      title: '风浪全开',
      scene: 2,
      duration: 19.0,
      rate: [
        { t0: 0.00, t1: 3.20, r: 1.0 },
        { t0: 3.20, t1: 4.10, r: 0.45 },
        { t0: 4.10, t1: 9.60, r: 1.0 },
        { t0: 9.60, t1: 12.20, r: 0.26 },
        { t0: 12.20, t1: 15.20, r: 1.0 },
        { t0: 15.20, t1: 16.60, r: 0.42 },
        { t0: 16.60, t1: 19.00, r: 1.0 }
      ],
      events: [
        { t: 0.00, type: 'release', index: 0 },
        { t: 0.18, type: 'release', index: 1 },
        { t: 0.30, type: 'release', index: 2 },
        { t: 0.42, type: 'release', index: 3 },
        { t: 0.54, type: 'release', index: 4 },
        { t: 0.66, type: 'release', index: 5 },
        { t: 0.78, type: 'release', index: 6 },
        { t: 0.90, type: 'release', index: 7 },
        { t: 1.02, type: 'release', index: 8 },
        { t: 1.14, type: 'release', index: 9 },
        { t: 1.26, type: 'release', index: 10 },
        { t: 1.38, type: 'release', index: 11 },
        { t: 1.50, type: 'release', index: 12 },
        { t: 1.62, type: 'release', index: 13 },
        { t: 1.74, type: 'release', index: 14 },
        { t: 1.86, type: 'release', index: 15 },
        { t: 1.98, type: 'release', index: 16 },
        { t: 2.10, type: 'release', index: 17 },
        { t: 2.22, type: 'release', index: 18 },
        { t: 2.34, type: 'release', index: 19 },
        { t: 2.80, type: 'wave', on: true },
        { t: 2.80, type: 'amp', amp: 0.028 },
        { t: 5.20, type: 'amp', amp: 0.062 },
        { t: 7.60, type: 'amp', amp: 0.098 },
        { t: 10.40, type: 'amp', amp: 0.125 },
        { t: 13.60, type: 'wave', on: false },
        { t: 13.60, type: 'amp', amp: 0.0 }
      ],
      camera: [
        { t: 0.00, p: [0.86, 0.60, 1.95], look: [0.86, 0.26, 0.00], fov: 0.62 },
        { t: 1.60, p: [0.80, 0.48, 1.42], look: [0.80, 0.27, 0.00], fov: 0.60 },
        { t: 3.40, p: [0.88, 0.42, 1.30], look: [0.92, 0.28, 0.00], fov: 0.58 },
        { t: 6.60, p: [1.10, 0.40, 1.18], look: [1.18, 0.28, 0.00], fov: 0.56 },
        { t: 9.80, p: [1.42, 0.38, 1.05], look: [1.48, 0.29, 0.00], fov: 0.54 },
        { t: 12.40, p: [1.50, 0.40, 1.15], look: [1.50, 0.27, 0.00], fov: 0.55 },
        { t: 15.60, p: [1.05, 0.52, 1.55], look: [0.95, 0.25, 0.00], fov: 0.60 },
        { t: 19.00, p: [0.88, 0.66, 2.05], look: [0.88, 0.24, 0.00], fov: 0.63 }
      ]
    }
  ];

  const RUN_MAP = {};
  RUNS.forEach(r => { RUN_MAP[r.id] = r; });

  /* recorded time -> simulation time */
  function simTimeAt(run, t) {
    let acc = 0;
    for (const s of run.rate) {
      if (t <= s.t0) break;
      const t1 = Math.min(t, s.t1);
      acc += (t1 - s.t0) * s.r;
      if (t <= s.t1) break;
    }
    return acc;
  }

  function cameraAt(run, simT, out) {
    const keys = run.camera;
    if (!keys.length) return;
    if (simT <= keys[0].t) {
      out.pos = keys[0].p.slice(); out.target = keys[0].look.slice(); out.fov = keys[0].fov; return;
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (simT >= a.t && simT <= b.t) {
        const k = U.smoothstep(a.t, b.t, simT);
        out.pos = [U.lerp(a.p[0], b.p[0], k), U.lerp(a.p[1], b.p[1], k), U.lerp(a.p[2], b.p[2], k)];
        out.target = [U.lerp(a.look[0], b.look[0], k), U.lerp(a.look[1], b.look[1], k), U.lerp(a.look[2], b.look[2], k)];
        out.fov = U.lerp(a.fov, b.fov, k);
        return;
      }
    }
    const last = keys[keys.length - 1];
    out.pos = last.p.slice(); out.target = last.look.slice(); out.fov = last.fov;
  }

  global.DEMOS = { RUNS, RUN_MAP, simTimeAt, cameraAt };
})(window);
