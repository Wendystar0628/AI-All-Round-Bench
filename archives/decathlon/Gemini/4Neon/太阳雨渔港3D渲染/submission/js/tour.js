// 60-Second 11-Shot Cinematic Tour Choreography & Fixed window.videoExport API (Section 10.7)
(function () {
  const { clamp } = window.HARBOR;

  const TOUR_DURATION = 60.0;

  function easeInOutCubic(u) {
    const t = clamp(u, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutQuad(u) {
    const t = clamp(u, 0, 1);
    return 1 - (1 - t) * (1 - t);
  }
  function easeLinearSoft(u) {
    const t = clamp(u, 0, 1);
    return t * 0.4 + easeInOutCubic(t) * 0.6;
  }

  // 11 Cinematic Japanese Anime Shots spanning exactly [0.0s .. 60.0s]
  const SHOTS = [
    {
      name: 'wide_establishing',
      start: 0.0, end: 6.5,
      pos0: [26.5, 16.2, 27.5], pos1: [18.8, 11.4, 21.8],
      tgt0: [-1.0, 1.8, -1.2],  tgt1: [-1.2, 1.7, -0.8],
      fov0: 38, fov1: 38, ease: easeLinearSoft
    },
    {
      name: 'quay_berths_track',
      start: 6.5, end: 11.5,
      pos0: [8.4, 4.5, 10.6],   pos1: [6.0, 4.1, -0.6],
      tgt0: [-1.6, 1.5, 3.6],   tgt1: [-2.2, 1.4, -2.8],
      fov0: 40, fov1: 40, ease: easeLinearSoft
    },
    {
      name: 'seagull_bollard_flush',
      start: 11.5, end: 16.0,
      pos0: [4.6, 2.75, 14.3],  pos1: [3.6, 2.65, 13.5],
      tgt0: [1.52, 2.08, 12.65], tgt1: [2.35, 3.25, 11.85],
      fov0: 40, fov1: 40, ease: easeInOutCubic
    },
    {
      name: 'still_life_puddle',
      start: 16.0, end: 21.0,
      pos0: [-1.45, 2.82, 15.1], pos1: [-2.55, 2.60, 14.4],
      tgt0: [-0.05, 1.72, 9.7],  tgt1: [0.05, 1.80, 9.4],
      fov0: 40, fov1: 40, ease: easeLinearSoft
    },
    {
      name: 'cat_under_skiff',
      start: 21.0, end: 25.5,
      pos0: [-2.28, 1.48, 7.95], pos1: [-2.78, 1.28, 7.45],
      tgt0: [-3.96, 0.94, 6.08], tgt1: [-3.96, 0.98, 6.08],
      fov0: 36, fov1: 35, ease: easeOutQuad
    },
    {
      name: 'sea_gust_sequence',
      start: 25.5, end: 31.0,
      pos0: [3.2, 4.3, 15.2],   pos1: [0.6, 4.5, 13.5],
      tgt0: [-4.5, 2.5, 8.8],   tgt1: [-5.4, 3.0, 7.2],
      fov0: 41, fov1: 41, ease: easeLinearSoft
    },
    {
      name: 'boat_cabin_interior',
      start: 31.0, end: 36.5,
      pos0: [-1.42, 1.72, -3.55], pos1: [-2.58, 1.36, -3.12],
      tgt0: [-4.32, 1.22, -2.50], tgt1: [-4.32, 1.20, -2.46],
      fov0: 38, fov1: 36, ease: easeInOutCubic
    },
    {
      name: 'warehouse_waiting_dolly',
      start: 36.5, end: 42.5,
      pos0: [-4.4, 2.90, -1.7], pos1: [-4.5, 2.68, 8.2],
      tgt0: [-12.0, 2.65, -1.7], tgt1: [-11.2, 2.35, 6.6],
      fov0: 45, fov1: 45, ease: easeLinearSoft
    },
    {
      name: 'cutaway_underwater_descent',
      start: 42.5, end: 48.0,
      pos0: [8.4, 2.5, 24.4],   pos1: [9.6, -1.05, 22.8],
      tgt0: [6.8, -1.25, 12.2], tgt1: [8.8, -1.55, 11.8],
      fov0: 40, fov1: 40, ease: easeInOutCubic
    },
    {
      name: 'lighthouse_tetrapods_blink',
      start: 48.0, end: 53.0,
      pos0: [14.6, 5.0, -1.6],  pos1: [14.4, 5.4, -11.4],
      tgt0: [4.5, 3.65, -6.9],  tgt1: [4.3, 3.55, -7.0],
      fov0: 42, fov1: 42, ease: easeLinearSoft
    },
    {
      name: 'departing_boat_finale',
      start: 53.0, end: 60.0,
      pos0: [11.2, 5.6, 11.8],  pos1: [23.2, 15.0, 24.2],
      tgt0: [4.8, 1.1, 3.6],    tgt1: [0.6, 1.8, -0.5],
      fov0: 40, fov1: 38, ease: easeInOutCubic
    }
  ];

  const vPos = new THREE.Vector3();
  const vTgt = new THREE.Vector3();

  function evaluateTourCamera(t, camera) {
    const clampedT = clamp(t, 0, TOUR_DURATION - 0.0001);
    let shot = SHOTS[SHOTS.length - 1];
    for (let i = 0; i < SHOTS.length; i++) {
      if (clampedT >= SHOTS[i].start && clampedT < SHOTS[i].end) {
        shot = SHOTS[i];
        break;
      }
    }
    const rawU = clamp((clampedT - shot.start) / (shot.end - shot.start), 0, 1);
    const u = shot.ease ? shot.ease(rawU) : rawU;

    vPos.set(
      shot.pos0[0] + (shot.pos1[0] - shot.pos0[0]) * u,
      shot.pos0[1] + (shot.pos1[1] - shot.pos0[1]) * u,
      shot.pos0[2] + (shot.pos1[2] - shot.pos0[2]) * u
    );
    vTgt.set(
      shot.tgt0[0] + (shot.tgt1[0] - shot.tgt0[0]) * u,
      shot.tgt0[1] + (shot.tgt1[1] - shot.tgt0[1]) * u,
      shot.tgt0[2] + (shot.tgt1[2] - shot.tgt0[2]) * u
    );
    const fov = shot.fov0 + (shot.fov1 - shot.fov0) * u;

    camera.position.copy(vPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(vTgt);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    return shot.name;
  }

  function installVideoExport(controller) {
    let exportActive = false;
    let exportFps = 60;
    let exportFrames = 3600;
    let savedCamState = null;

    function waitForPaint() {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        requestAnimationFrame(() => finish());
        setTimeout(finish, 40);
      });
    }

    window.videoExport = {
      runs: ['tour'],

      async begin(runId, opts) {
        if (runId !== 'tour') {
          throw new Error('Unknown videoExport runId: ' + runId);
        }
        const fps = (opts && opts.fps && opts.fps > 0) ? opts.fps : 60;
        exportFps = fps;
        exportFrames = Math.round(TOUR_DURATION * fps);

        if (!exportActive) {
          savedCamState = controller.saveCameraState();
        }
        exportActive = true;
        controller.setExportMode(true);
        controller.syncViewportSize();

        // Prepare initial frame 0 state immediately
        evaluateTourCamera(0, controller.camera);
        controller.renderDeterministicFrame(0);
        await waitForPaint();

        return { frames: exportFrames };
      },

      async frame(i) {
        if (!exportActive) {
          throw new Error('videoExport.frame called before begin()');
        }
        const idx = clamp(i, 0, Math.max(0, exportFrames - 1));
        const t = idx / exportFps;
        controller.syncViewportSize();
        evaluateTourCamera(t, controller.camera);
        controller.renderDeterministicFrame(t);
        await waitForPaint();
      },

      end() {
        if (!exportActive) return;
        exportActive = false;
        controller.setExportMode(false);
        if (savedCamState) {
          controller.restoreCameraState(savedCamState);
          savedCamState = null;
        }
      }
    };
  }

  window.HARBOR_TOUR = {
    TOUR_DURATION,
    SHOTS,
    evaluateTourCamera,
    installVideoExport
  };
})();
