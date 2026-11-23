/* 镜头组 tour 与视频导出接口 */
'use strict';
(function (H) {
  const L = H.LAYOUT;
  const TOUR_DUR = 68;

  function V(x, y, z) { return new THREE.Vector3(x, y, z); }

  // 镜头表：远景推近 → 堤岸横移 → 海鸥特写 → 静物水洼 → 港猫 → 阵风 → 驾驶舱 → 仓库 → 候船室 → 剖面 → 灯塔 → 出港
  const shots = [
    { t0: 0, t1: 7, cf: V(27, 18, 30), ct: V(17, 11, 21), lf: V(0, 0.6, -1), lt: V(-0.5, 0.7, -1.5) },
    { t0: 7, t1: 13, cf: V(-6.5, 2.5, 9.8), ct: V(6.5, 2.3, 9.2), lf: V(-2, 1.0, 3.4), lt: V(4.2, 0.9, 3.0) },
    { t0: 13, t1: 18, cf: V(-0.4, 2.0, 7.4), ct: V(-1.2, 1.62, 6.3), lf: V(-1.8, 1.44, 4.88), lt: V(-1.8, 1.5, 4.88) },
    { t0: 18, t1: 24, cf: V(4.8, 2.3, 9.4), ct: V(2.9, 1.5, 8.0), lf: V(1.3, 1.0, 5.9), lt: V(1.6, 1.05, 5.4) },
    { t0: 24, t1: 29, cf: V(6.0, 1.8, 8.6), ct: V(6.5, 1.3, 7.4), lf: V(6.9, 1.08, 5.95), lt: V(6.8, 1.12, 6.1) },
    { t0: 29, t1: 35, cf: V(-1.5, 3.0, 8.8), ct: V(-6.0, 2.4, 6.2), lf: V(-6.8, 1.6, 2.9), lt: V(-6.2, 1.7, 1.5) },
    { t0: 35, t1: 41, cf: V(-0.6, 1.5, -2.3), ct: V(-2.2, 1.32, -2.0), lf: V(-3.2, 1.2, -2.3), lt: V(-3.12, 1.34, -1.85) },
    { t0: 41, t1: 47, cf: V(-5.3, 2.1, 3.6), ct: V(-5.5, 1.6, -0.2), lf: V(-7.0, 1.4, -0.8), lt: V(-7.2, 1.3, -1.2) },
    { t0: 47, t1: 52, cf: V(-5.4, 1.75, 5.9), ct: V(-10.2, 1.7, 5.9), lf: V(-7.2, 1.35, 8.0), lt: V(-8.6, 1.5, 8.2) },
    { t0: 52, t1: 57, cf: V(13.8, 3.2, -0.5), ct: V(13.2, -0.7, -2.8), lf: V(7.0, -0.2, -2.8), lt: V(3.8, -0.8, -3.2) },
    { t0: 57, t1: 62, cf: V(3.8, 2.4, -4.6), ct: V(1.2, 1.7, -6.4), lf: V(-0.6, 2.2, -8.6), lt: V(-0.6, 2.5, -8.6) },
    { t0: 62, t1: 68, follow: true }
  ];

  const _pos = new THREE.Vector3(), _look = new THREE.Vector3();
  function tourView(t, outPos, outLook) {
    t = H.clamp(t, 0, TOUR_DUR);
    let s = shots[shots.length - 1];
    for (let i = 0; i < shots.length; i++) {
      if (t >= shots[i].t0 && t < shots[i].t1) { s = shots[i]; break; }
    }
    if (s.follow) {
      const k = H.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
      const bc = H.sim.boatCState(t);
      outPos.set(bc.x + 4.2 + k * 2.0, 3.2 + k * 5.5, bc.z + 5.2 + k * 2.5);
      outLook.set(bc.x, 0.7, bc.z);
    } else {
      const k = H.easeInOut(H.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
      outPos.lerpVectors(s.cf, s.ct, k);
      outLook.lerpVectors(s.lf, s.lt, k);
    }
    return s;
  }
  H.tourView = tourView;
  H.TOUR_DUR = TOUR_DUR;

  // ---------- 导出接口 ----------
  let exporting = false;
  let fps = 60;
  const camPos = new THREE.Vector3(), lookPos = new THREE.Vector3();

  window.videoExport = {
    runs: ['tour'],
    begin: async function (runId, opts) {
      if (runId !== 'tour') throw new Error('unknown run: ' + runId);
      fps = (opts && opts.fps) || 60;
      exporting = true;
      H.main.setExport(true);
      H.sim.reset();
      await this.frame(0);
      return { frames: Math.round(TOUR_DUR * fps) };
    },
    frame: async function (i) {
      const t = i / fps;
      H.sim.advanceTo(t, function (tt, out) { tourView(tt, out, lookPos); });
      tourView(t, camPos, lookPos);
      H.main.applyCamera(camPos, lookPos);
      H.main.updateVisuals(t);
      H.main.renderFrame();
    },
    end: function () {
      exporting = false;
      H.main.setExport(false);
    }
  };
  H.isExporting = function () { return exporting; };

})(window.HARBOR);