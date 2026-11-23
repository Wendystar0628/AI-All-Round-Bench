// export.js — deterministic frame export interface
(function () {
  'use strict';
  let mode = false, fps = 60, frames = 0, runId = null;

  function renderAt(T) {
    const app = window.__app;
    if (!app || !app.scene) return;
    Timeline.renderFrame(app.renderer, app.scene, T);
    app.renderer.gl.finish();
  }

  window.videoExport = {
    get runs() { return ['tour']; },
    begin: async function (id, opts) {
      mode = true;
      runId = id || 'tour';
      fps = (opts && opts.fps) || 60;
      frames = Math.max(1, Math.round(Timeline.LOOP * fps));
      const app = window.__app;
      if (app) app.exporting = true;
      renderAt(0);
      return { frames: frames, fps: fps, run: runId };
    },
    frame: async function (i) {
      const T = i / fps;
      renderAt(T);
      return { index: i, time: T };
    },
    end: function () {
      mode = false;
      const app = window.__app;
      if (app) app.exporting = false;
    }
  };
  window.__exportMode = () => mode;
})();
