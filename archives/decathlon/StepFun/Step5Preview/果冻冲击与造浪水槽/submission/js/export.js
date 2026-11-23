window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;

  function install(main) {
    const runs = ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'];
    const api = {
      runs,
      async begin(runId, opts) {
        const fps = Math.max(1, Math.floor((opts && opts.fps) || 30));
        if (runs.indexOf(runId) < 0) throw new Error('unknown run ' + runId);
        await main.beginExport(runId, fps);
        const dur = APP.scenes.demoTarget(runId);
        return { frames: Math.ceil(dur * fps), fps, duration: dur };
      },
      async frame(i) { await main.exportFrame(i); },
      end() { main.endExport(); },
    };
    window.videoExport = api;
    return api;
  }
  APP.exportApi = { install };
})();
