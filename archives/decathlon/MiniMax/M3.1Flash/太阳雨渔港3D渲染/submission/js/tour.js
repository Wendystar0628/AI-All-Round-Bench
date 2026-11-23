/* =====================================================================
   tour.js — 内置镜头组（tour）与 window.videoExport 接口
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const L = TY.LAYOUT;

  /* 镜头表：每段含起止机位、视点、焦段与运镜节奏 */
  const SHOTS = [
    {
      name: '远景 · 推向 L 形码头', dur: 7.0,
      p0: [30.0, 21.5, 30.0], p1: [18.4, 12.6, 18.8],
      t0: [0.4, 0.3, 0.6], t1: [-1.4, 1.0, -1.1],
      f0: 40, f1: 37, ease: 'inout',
    },
    {
      name: '中景 · 沿堤岸横移过泊位', dur: 5.5,
      p0: [2.85, 2.60, 5.30], p1: [2.95, 2.50, -3.40],
      t0: [-2.30, 1.28, 2.10], t1: [-2.40, 1.15, -4.30],
      f0: 40, f1: 40, ease: 'linear',
    },
    {
      name: '特写 · 系船柱上的海鸥', dur: 4.5,
      p0: [-1.30, 2.50, -4.05], p1: [-2.40, 2.32, -3.32],
      t0: [-3.82, 2.01, -2.35], t1: [-3.82, 1.98, -2.35],
      f0: 36, f1: 30, ease: 'inout',
    },
    {
      name: '中景 · 乐器硬箱 · 透明雨伞 · 水洼', dur: 5.5,
      p0: [3.45, 2.35, 8.20], p1: [2.62, 1.98, 7.10],
      t0: [1.00, 1.32, 5.45], t1: [1.16, 1.30, 5.25],
      f0: 40, f1: 34, ease: 'inout',
    },
    {
      name: '特写 · 舢板下的港猫', dur: 4.5,
      p0: [8.25, 1.88, 3.25], p1: [7.82, 1.72, 3.98],
      t0: [6.60, 1.30, 5.58], t1: [6.56, 1.28, 5.56],
      f0: 34, f1: 28, ease: 'inout',
    },
    {
      name: '中景 · 一阵风掠过码头', dur: 6.0,
      p0: [7.20, 2.50, 4.55], p1: [7.45, 2.60, 4.88],
      t0: [7.10, 3.45, 8.80], t1: [7.40, 3.32, 8.72],
      f0: 44, f1: 39, ease: 'inout',
    },
    {
      name: '特写 · 驾驶舱玻璃内的仪表', dur: 5.5,
      p0: [0.30, 2.00, -2.35], p1: [-0.75, 1.80, -2.58],
      t0: [-2.05, 1.62, -2.58], t1: [-2.05, 1.55, -2.65],
      f0: 40, f1: 31, ease: 'inout',
    },
    {
      name: '中景 · 街巷与半拉起的卷帘门', dur: 5.5,
      p0: [-4.22, 2.28, 1.80], p1: [-4.24, 1.96, -3.30],
      t0: [-6.25, 1.92, 0.20], t1: [-6.45, 1.72, -2.75],
      f0: 42, f1: 36, ease: 'linear',
    },
    {
      name: '中景 · 候船室落地玻璃', dur: 5.0,
      p0: [-4.12, 1.98, 3.75], p1: [-4.02, 1.82, -0.10],
      t0: [-6.45, 1.72, 2.70], t1: [-6.35, 1.58, 0.50],
      f0: 40, f1: 36, ease: 'linear',
    },
    {
      name: '中景 · 沿底座侧壁下沉看水下', dur: 5.5,
      p0: [13.4, 3.60, 4.30], p1: [11.5, -0.85, -0.90],
      t0: [9.60, 0.20, -1.10], t1: [9.45, -1.45, -1.90],
      f0: 40, f1: 36, ease: 'inout',
    },
    {
      name: '中景 · 防波堤尽头的灯塔', dur: 4.5,
      p0: [9.10, 3.10, -4.40], p1: [7.45, 2.25, -6.55],
      t0: [5.30, 2.25, -8.30], t1: [5.00, 2.05, -8.78],
      f0: 40, f1: 33, ease: 'inout',
    },
    {
      name: '远景 · 跟随出港的白色渔船', dur: 8.0,
      follow: true,
      f0: 42, f1: 36, ease: 'inout',
    },
  ];

  const tour = {
    shots: SHOTS,
    duration: SHOTS.reduce((a, s) => a + s.dur, 0),
    exportMode: false,
    fps: 60,
    frames: 0,
    _pos: new THREE.Vector3(),
    _tgt: new THREE.Vector3(),
  };

  /* 计算 t 时刻的镜头 */
  tour.cameraAt = function (t, out) {
    let acc = 0;
    for (const s of SHOTS) {
      if (t <= acc + s.dur || s === SHOTS[SHOTS.length - 1]) {
        const u = U.clamp((t - acc) / s.dur, 0, 1);
        const e = s.ease === 'inout' ? U.easeInOut(u) : (s.ease === 'out' ? U.easeOut(u) : u);
        if (s.follow) {
          const b = TY.life && TY.life.departBoat ? TY.life.departBoat.group.position : null;
          if (b) {
            const ang = b.rotation.y;
            const off = new THREE.Vector3(Math.cos(ang) * -3.2, 3.4, Math.sin(ang) * -3.2 + 4.6);
            out.pos.set(b.x + off.x * (1 - e * 0.35) + e * 1.2, off.y + e * 5.0, b.z + off.z);
            out.tgt.set(b.x, b.y + 0.9, b.z);
          } else {
            out.pos.set(6, 8, 2); out.tgt.set(0, 1, 0);
          }
          out.fov = U.lerp(s.f0, s.f1, e);
          return out;
        }
        out.pos.set(
          U.lerp(s.p0[0], s.p1[0], e),
          U.lerp(s.p0[1], s.p1[1], e),
          U.lerp(s.p0[2], s.p1[2], e));
        out.tgt.set(
          U.lerp(s.t0[0], s.t1[0], e),
          U.lerp(s.t0[1], s.t1[1], e),
          U.lerp(s.t0[2], s.t1[2], e));
        out.fov = U.lerp(s.f0, s.f1, e);
        return out;
      }
      acc += s.dur;
    }
    out.pos.set(0, 10, 20); out.tgt.set(0, 1, 0); out.fov = 40;
    return out;
  };

  const _tmp = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40 };

  tour.applyTime = function (t, camera) {
    tour.cameraAt(U.clamp(t, 0, tour.duration), _tmp);
    camera.position.copy(_tmp.pos);
    camera.lookAt(_tmp.tgt);
    if (Math.abs(camera.fov - _tmp.fov) > 0.01) {
      camera.fov = _tmp.fov;
      camera.updateProjectionMatrix();
    }
  };

  /* ---------------- videoExport 接口 ---------------- */
  function nextFrame() {
    return new Promise((res) => requestAnimationFrame(() => res()));
  }

  const videoExport = {
    runs: ['tour'],
    async begin(runId, opts) {
      if (runId !== 'tour') {
        throw new Error('unknown run: ' + runId);
      }
      const fps = (opts && opts.fps) ? opts.fps : 60;
      tour.exportMode = true;
      tour.fps = fps;
      tour.frames = Math.round(tour.duration * fps);
      if (TY.main) {
        TY.main.setExportTime(0);
        TY.main.renderNow();
      }
      await nextFrame();
      return { frames: tour.frames };
    },
    async frame(i) {
      if (!tour.exportMode) {
        tour.exportMode = true;
      }
      const t = i / tour.fps;
      if (TY.main) {
        TY.main.setExportTime(t);
        TY.main.renderNow();
      }
      await nextFrame();
      await nextFrame();
    },
    end() {
      tour.exportMode = false;
      if (TY.main) TY.main.resumeClock();
    },
  };

  TY.tour = tour;
  window.videoExport = videoExport;
})();
