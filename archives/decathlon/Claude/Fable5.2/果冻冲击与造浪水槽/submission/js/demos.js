'use strict';
/* 四段预置演示：参数、触发时序、慢放曲线与镜头全部预置。
   所有关键帧都以“仿真时间 τ”为轴；演示时间 t 由 dt = dτ / rate(τ) 积分得到，因此与取样帧率无关。 */
(function () {
  const lerp = JW.lerp;

  JW.Director = class {
    constructor(run) {
      this.run = run;
      const h = this.h = 1 / 1200;
      const n = Math.ceil(run.simEnd / h);
      const tab = this.tab = new Float64Array(n + 1);
      let t = 0;
      for (let i = 0; i < n; i++) { tab[i] = t; t += h / this.rateAt((i + 0.5) * h); }
      tab[n] = t;
      this.duration = t;
    }
    rateAt(tau) {
      const k = this.run.rate;
      if (tau <= k[0][0]) return k[0][1];
      for (let i = 1; i < k.length; i++) {
        if (tau <= k[i][0]) { const u = (tau - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return lerp(k[i - 1][1], k[i][1], u); }
      }
      return k[k.length - 1][1];
    }
    /* 演示时间 → 仿真时间 */
    simTime(t) {
      const tab = this.tab;
      if (t <= 0) return 0;
      if (t >= this.duration) return this.run.simEnd;
      let lo = 0, hi = tab.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] <= t) lo = m; else hi = m; }
      return (lo + (t - tab[lo]) / (tab[hi] - tab[lo])) * this.h;
    }
    /* 镜头：对关键帧做 Catmull-Rom（非均匀时间）插值，速度连续 */
    camAt(tau) {
      const K = this.run.cam, n = K.length;
      let i = 0;
      while (i < n - 2 && tau > K[i + 1].t) i++;
      const a = K[i], b = K[i + 1];
      const u = JW.clamp((tau - a.t) / (b.t - a.t), 0, 1);
      const p = K[Math.max(i - 1, 0)], q = K[Math.min(i + 2, n - 1)];
      const dt = b.t - a.t;
      const hermite = (v0, v1, vp, vq) => {
        const m0 = i > 0 ? (v1 - vp) / (b.t - p.t) * dt : (v1 - v0);
        const m1 = i < n - 2 ? (vq - v0) / (q.t - a.t) * dt : (v1 - v0);
        const u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
      };
      const f = (key) => hermite(a[key], b[key], p[key], q[key]);
      const g = (key, j) => hermite(a[key][j], b[key][j], p[key][j], q[key][j]);
      return { tg: [g('tg', 0), g('tg', 1), g('tg', 2)], d: f('d'), yaw: f('yaw'), pitch: f('pitch'), fov: f('fov') };
    }
  };

  const K = (t, tg, d, yaw, pitch, fov) => ({ t, tg, d, yaw, pitch, fov: fov || 34 });

  JW.DEMOS = {
    /* 正中单击：重球正中落在软果冻上——包住球、压扁、四周鼓出，再把球弹起，余振平息；不裂 */
    'jelly-center': {
      title: '正中单击', scene: 0, limit: 8, simEnd: 4.3,
      jelly: [{ E: 9, strength: 80, visc: 0.03 }, {}, {}],
      setup(A) {
        A.spawnBall({ jelly: 0, off: [0, 0], h: 0.34, mass: 1.25, mat: 0, vel: [0, -1.25, 0] });
      },
      events: [],
      rate: [[0, 1], [0.15, 1], [0.19, 0.2], [0.50, 0.2], [0.60, 0.5], [0.78, 0.5], [0.9, 1], [4.3, 1]],
      cam: [
        K(0.0, [-0.43, 0.30, 0], 1.02, -24, 12, 34),
        K(0.19, [-0.43, 0.15, 0], 0.76, -16, 11, 34),
        K(0.50, [-0.43, 0.13, 0], 0.68, -8, 9, 34),
        K(0.95, [-0.43, 0.16, 0], 0.80, 0, 12, 34),
        K(2.2, [-0.43, 0.13, 0], 0.88, 8, 15, 34),
        K(4.3, [-0.43, 0.12, 0], 0.95, 14, 17, 34),
      ],
    },
    /* 连击：一记比一记重，后一击落在尚未平息的振荡上；最后一击把果冻砸裂，碎块分开后仍在晃动 */
    'jelly-multi': {
      title: '连击', scene: 0, limit: 10, simEnd: 4.9,
      jelly: [{}, { E: 15, strength: 5.2 }, {}],
      setup(A) {
        A.spawnBall({ jelly: 1, off: [0.03, 0.01], h: 0.24, mass: 0.40, mat: 0, vel: [0.12, -1.2, 0] });
      },
      events: [
        [0.46, (A) => A.spawnBall({ jelly: 1, off: [-0.03, -0.01], h: 0.36, mass: 0.95, mat: 0, vel: [-0.1, -1.4, 0] })],
        [0.98, (A) => A.spawnBall({ jelly: 1, off: [0.0, 0.0], h: 0.60, mass: 2.6, mat: 0, vel: [0, -2.2, 0] })],
      ],
      rate: [[0, 1], [1.16, 1], [1.20, 0.16], [1.50, 0.16], [1.62, 0.5], [1.9, 1], [4.9, 1]],
      cam: [
        K(0.0, [0, 0.27, 0.02], 1.04, -14, 13, 34),
        K(0.6, [0, 0.18, 0.02], 0.92, -8, 14, 34),
        K(1.18, [0, 0.14, 0.02], 0.80, 0, 15, 34),
        K(1.6, [0, 0.11, 0.02], 0.80, 8, 20, 34),
        K(2.6, [0, 0.09, 0.02], 0.92, 18, 30, 34),
        K(4.9, [0, 0.08, 0.02], 1.0, 28, 36, 34),
      ],
    },
    /* 偏击：球斜向撞上高柱果冻的一侧——倾斜、滑移、摇晃；球滚落后撞上台面上的另一颗球；不裂 */
    'jelly-offset': {
      title: '偏击', scene: 0, limit: 8, simEnd: 5.6,
      jelly: [{}, {}, { E: 20, strength: 90, visc: 0.03 }],
      setup(A) {
        A.spawnBall({ jelly: 2, off: [-0.105, 0.012], h: 0.24, mass: 2.4, mat: 1, vel: [1.2, -1.6, 0.0] });
        A.spawnBallAt({ pos: [0.84, 0.045, 0.02], mass: 1.03, mat: 0 });
        A.spawnBallAt({ pos: [0.97, 0.03, -0.06], mass: 0.88, mat: 2 });
      },
      events: [],
      rate: [[0, 1], [0.07, 1], [0.11, 0.25], [0.36, 0.25], [0.46, 1], [5.6, 1]],
      cam: [
        K(0.0, [0.40, 0.33, 0], 1.02, -10, 12, 34),
        K(0.12, [0.44, 0.24, 0], 0.86, -5, 10, 34),
        K(0.45, [0.48, 0.19, 0], 0.90, 2, 11, 34),
        K(1.2, [0.66, 0.13, 0], 1.20, 8, 15, 34),
        K(2.6, [0.76, 0.10, 0], 1.42, 12, 18, 34),
        K(5.6, [0.78, 0.10, 0], 1.50, 16, 19, 34),
      ],
    },
    /* 风浪：入水分层 → 浪由小变大、变陡、破碎拍壁 → 停机后风平浪静 */
    'tank-full': {
      title: '风浪', scene: 1, limit: 20, simEnd: 17.2,
      setup(A) {
        A.dropBalls({ seed: 11, perGroup: 3, y0: 0.40, spread: 0.14, vy: -2.6 });
      },
      events: [
        [1.0, (A) => A.dropBalls({ seed: 23, perGroup: 3, y0: 0.52, spread: 0.10, vy: -1.6 })],
        [3.0, (A) => A.setWave(true, 0.012, 1.25)],
        [5.2, (A) => A.setWave(true, 0.030, 1.25)],
        [7.2, (A) => A.setWave(true, 0.054, 1.2)],
        [12.3, (A) => A.setWave(false)],
      ],
      rate: [[0, 1], [0.05, 1], [0.08, 0.28], [0.36, 0.28], [0.46, 1], [9.86, 1], [9.92, 0.3], [10.28, 0.3], [10.36, 1], [17.2, 1]],
      cam: [
        K(0.0, [-0.32, 0.34, 0], 1.22, 8, 7, 34),
        K(0.45, [-0.30, 0.27, 0], 1.18, 10, 6, 34),
        K(1.6, [-0.28, 0.25, 0], 1.45, 6, 6, 34),
        K(3.2, [-0.05, 0.25, 0], 2.02, 0, 8, 34),
        K(5.6, [-0.38, 0.22, 0], 1.38, 4, 5, 34),
        K(7.4, [0.05, 0.28, 0], 1.62, -8, 9, 34),
        K(9.2, [0.34, 0.31, 0], 1.22, -16, 11, 34),
        K(10.3, [0.40, 0.31, 0], 1.16, -19, 11, 34),
        K(11.6, [0.62, 0.32, 0], 1.25, -30, 13, 34),
        K(12.8, [0.45, 0.30, 0], 1.60, -18, 12, 34),
        K(14.6, [0.05, 0.26, 0], 2.02, -4, 9, 34),
        K(17.2, [0.0, 0.25, 0], 2.10, 4, 8, 34),
      ],
    },
  };
  JW.RUNS = ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'];
})();
