// js/main.js - Entry Point, Real-Time Auto-Loop & Deterministic window.videoExport Interface
(function () {
  const App = window.App;
  const Scene = App.Scene;
  const canvas = document.getElementById('viewport');

  let renderer = null;
  let readyPromise = null;
  let exportMode = false;
  let activeRun = null;
  let exportFps = 60;
  let lastFrameMs = performance.now();
  let simTime = 0.0;
  let rafId = 0;

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(16, Math.min(3840, Math.round(window.innerWidth * dpr)));
    const h = Math.max(16, Math.min(2160, Math.round(window.innerHeight * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (renderer) renderer.resize(canvas.width, canvas.height);
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve) => {
      syncCanvasSize();
      renderer = new App.Renderer(canvas);
      window._renderer = renderer;
      syncCanvasSize();
      renderer.render(0.0);
      renderer.gl.finish();
      resolve(renderer);
    });
    return readyPromise;
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (exportMode || !renderer) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastFrameMs) * 0.001));
    lastFrameMs = now;
    simTime = (simTime + dt) % Scene.TOTAL_DURATION;
    syncCanvasSize();
    renderer.render(simTime);
  }

  function waitNextPaint() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      requestAnimationFrame(() => finish());
      setTimeout(finish, 40);
    });
  }

  // Fixed Video Export Interface (Section 2.12)
  window.videoExport = {
    runs: Scene.RUNS.map((r) => r.id),

    async begin(runId, opts = {}) {
      await init();
      const fps = Number(opts.fps) > 0 ? Number(opts.fps) : 60;
      const run = Scene.RUNS.find((r) => r.id === runId) || Scene.RUNS[0];
      exportMode = true;
      activeRun = run;
      exportFps = fps;
      syncCanvasSize();
      // Immediately reconstruct the run's exact global initial state!
      simTime = run.start % Scene.TOTAL_DURATION;
      renderer.render(run.start);
      renderer.gl.finish();
      const frames = Math.round(run.duration * fps);
      return { frames };
    },

    async frame(i) {
      await init();
      if (!activeRun) activeRun = Scene.RUNS[0];
      exportMode = true;
      syncCanvasSize();
      const t = activeRun.start + i / exportFps;
      simTime = t % Scene.TOTAL_DURATION;
      renderer.render(t);
      renderer.gl.finish();
      await waitNextPaint();
    },

    end() {
      exportMode = false;
      activeRun = null;
      lastFrameMs = performance.now();
    },
  };

  // Optional inspection helper (no UI footprint)
  window._seekTime = async (t) => {
    await init();
    exportMode = true;
    syncCanvasSize();
    simTime = ((t % Scene.TOTAL_DURATION) + Scene.TOTAL_DURATION) % Scene.TOTAL_DURATION;
    renderer.render(simTime);
    renderer.gl.finish();
    await waitNextPaint();
    return { t: simTime, mode: Scene.evaluate(simTime).cam.mode };
  };

  window.addEventListener('resize', () => {
    syncCanvasSize();
    if (renderer && exportMode) {
      renderer.render(simTime);
    }
  });

  // Auto-boot immediately on load!
  init().then(() => {
    lastFrameMs = performance.now();
    rafId = requestAnimationFrame(tick);
  });
})();
