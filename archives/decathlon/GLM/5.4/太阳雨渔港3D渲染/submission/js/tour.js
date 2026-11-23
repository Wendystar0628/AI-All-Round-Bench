/* ============================================================
   tour.js — 镜头组与视频导出接口
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const TOUR_DURATION = 68;

  // 每个镜头：起止时刻 / 起止机位与注视点 / 缓动
  const SHOTS = [
    { t0: 0.0, t1: 7.5, p0: [40, 24, 37], p1: [26, 14.5, 23], q0: [0, 0.5, -2], q1: [0, -0.6, -1], e: 'inout' },
    { t0: 7.5, t1: 14.0, p0: [-9.5, 5.4, 15.8], p1: [4.8, 5.0, 14.6], q0: [-1, 0.2, 3.4], q1: [2.2, 0.2, 3.0], e: 'inout' },
    { t0: 14.0, t1: 18.4, p0: [5.6, 2.8, 13.6], p1: [2.3, 1.8, 8.8], q0: [0.9, 1.0, 6.15], q1: [0.9, 0.95, 6.15], e: 'inout' },
    { t0: 19.0, t1: 24.0, p0: [11.9, 3.1, 10.9], p1: [10.3, 2.15, 9.1], q0: [8.9, 0.75, 6.4], q1: [9.1, 0.75, 6.35], e: 'inout' },
    { t0: 24.0, t1: 28.5, p0: [-8.05, 1.62, 10.55], p1: [-7.35, 1.22, 9.72], q0: [-6.18, 0.32, 8.32], q1: [-6.18, 0.40, 8.32], e: 'out' },
    { t0: 28.5, t1: 35.0, p0: [6.8, 3.7, 13.8], p1: [3.0, 3.0, 11.0], q0: [-3.6, 1.6, 7.6], q1: [-3.2, 1.5, 7.4], e: 'inout' },
    { t0: 35.0, t1: 42.0, p0: [-0.85, 1.30, 2.05], p1: [-1.52, 1.08, 1.45], q0: [-3.55, 0.60, 0.98], q1: [-3.55, 0.56, 0.95], e: 'inout' },
    { t0: 42.0, t1: 49.0, p0: [-5.4, 2.6, 9.8], p1: [-6.3, 2.0, 4.3], q0: [-8.6, 1.6, 3.0], q1: [-8.5, 1.45, 2.6], e: 'in' },
    { t0: 49.0, t1: 54.0, p0: [-6.1, 2.15, -5.9], p1: [-6.1, 2.15, -1.1], q0: [-9.7, 1.3, -2.7], q1: [-9.7, 1.35, -2.5], e: 'inout' },
    { t0: 54.0, t1: 59.5, p0: [17.6, 0.9, 7.6], p1: [16.9, -1.9, 3.0], q0: [12.6, -1.6, -0.4], q1: [12.4, -2.3, -0.6], e: 'inout' },
    { t0: 59.5, t1: 64.5, p0: [10.6, 4.7, -0.4], p1: [7.7, 3.5, -4.2], q0: [2.6, 1.05, -9.0], q1: [2.55, 1.0, -9.0], e: 'out' },
    { t0: 64.5, t1: 68.0, follow: true, e: 'inout' }
  ];

  const easeFns = {
    inout: S.easeInOutSine,
    in: t => t * t * (3 - 2 * t) * t,
    out: t => 1 - Math.pow(1 - t, 2.2),
    linear: t => t
  };

  function shotAt(t) {
    for (let i = 0; i < SHOTS.length; i++) {
      if (t >= SHOTS[i].t0 && t <= SHOTS[i].t1) return SHOTS[i];
    }
    return SHOTS[SHOTS.length - 1];
  }

  const _p = new THREE.Vector3(), _q = new THREE.Vector3();

  // 纯函数：返回 t 时刻的机位（不产生副作用）
  S.tourCameraPoseAt = function (t) {
    const sh = shotAt(t);
    const k = S.clamp((t - sh.t0) / (sh.t1 - sh.t0), 0, 1);
    const e = (easeFns[sh.e] || easeFns.inout)(k);
    if (sh.follow) {
      let bp = { x: 5, z: -6 };
      if (S.heroBoat) { bp.x = S.heroBoat.position.x; bp.z = S.heroBoat.position.z; }
      const rise = S.ease(k);
      _p.set(bp.x + 5.0 + rise * 6.0, 2.6 + rise * 9.0, bp.z + 6.5 + rise * 7.5);
      _q.set(bp.x, 0.4, bp.z - 1.0);
    } else {
      _p.set(
        S.lerp(sh.p0[0], sh.p1[0], e),
        S.lerp(sh.p0[1], sh.p1[1], e),
        S.lerp(sh.p0[2], sh.p1[2], e)
      );
      _q.set(
        S.lerp(sh.q0[0], sh.q1[0], e),
        S.lerp(sh.q0[1], sh.q1[1], e),
        S.lerp(sh.q0[2], sh.q1[2], e)
      );
    }
    const hx = Math.sin(t * 0.83) * 0.035 + Math.sin(t * 1.91 + 1.2) * 0.014;
    const hy = Math.cos(t * 0.71 + 0.4) * 0.028 + Math.sin(t * 2.13) * 0.010;
    _p.x += hx; _p.y += hy;
    return { pos: _p, target: _q };
  };

  S.updateTourCamera = function (t) {
    const pose = S.tourCameraPoseAt(t);
    const cam = S.camera;
    cam.position.copy(pose.pos);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
  };

  /* ---------------- 导出接口 ---------------- */
  S.exportState = {
    active: false,
    fps: 60,
    runId: null,
    startTime: 0
  };

  function resetLifeState() {
    if (S.gulls) for (const g of S.gulls) { g.userData.startle = 0; g.userData.flap = 0; }
    if (S.fish) S.fish._s = 0;
  }

  S.videoExport = {
    runs: ['tour'],
    begin: async function (runId, opts) {
      opts = opts || {};
      const fps = opts.fps || 60;
      S.exportState.active = true;
      S.exportState.fps = fps;
      S.exportState.runId = runId;
      S.exportMode = true;
      S.controls.enabled = false;
      resetLifeState();
      S.tourStart = 0;
      const frames = Math.round(TOUR_DURATION * fps);
      // 渲染第 0 帧
      S.renderAt(0);
      return { frames: frames };
    },
    frame: async function (i) {
      const fps = S.exportState.fps;
      const t = i / fps;
      S.renderAt(t);
      return true;
    },
    end: async function () {
      S.exportMode = false;
      S.exportState.active = false;
      S.controls.enabled = true;
      S.controls.set(0.74, 1.00, 40, new THREE.Vector3(0.2, -0.6, -0.6));
      S.renderAt(S.time);
      return true;
    }
  };
  global.videoExport = S.videoExport;

  S.TOUR_DURATION = TOUR_DURATION;

})(window);

/* ---------------- 调试：接触表 ---------------- */
(function (global) {
  const S = global.S;
  S.contactSheet = async function (times, cols, cw, ch) {
    cols = cols || 3; cw = cw || 480; ch = ch || 270;
    const renderer = S.__renderer;
    const canvas = renderer.domElement;
    const out = document.createElement('canvas');
    out.width = cols * cw;
    out.height = Math.ceil(times.length / cols) * ch;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < times.length; i++) {
      S.exportMode = true;
      S.renderAt(times[i]);
      const url = canvas.toDataURL('image/png');
      const img = new Image();
      await new Promise(res => { img.onload = res; img.src = url; });
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      ctx.drawImage(img, x, y, cw, ch);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, 64, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(times[i].toFixed(1) + 's', x + 4, y + 13);
    }
    return out.toDataURL('image/jpeg', 0.9);
  };
})(window);
