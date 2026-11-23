/* =========================================================================
 *  动态路由塔防 · 视频导出接口
 *  videoexport.js — window.videoExport
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});

  const VE = {
    runs: ['demo-1', 'demo-2', 'demo-3'],
    runId: null, fps: 30, frames: 0, cursor: -1, active: false
  };

  function app() { return global.RTApp; }

  VE.begin = function (runId, opts) {
    opts = opts || {};
    const a = app();
    if (!a) return Promise.reject(new Error('作品未就绪'));
    if (VE.runs.indexOf(runId) < 0) return Promise.reject(new Error('未知演示：' + runId));
    VE.runId = runId;
    VE.fps = opts.fps || 30;
    VE.cursor = 0;
    VE.active = true;
    a.exportMode = true;
    a.mode = 'export';
    a.scriptLock = true;
    RT.Demo.start(runId);
    // 首帧：起始局面
    VE.frames = Math.max(1, Math.round(RT.Demo.list.filter((d) => d.id === runId)[0].duration * VE.fps));
    render();
    return Promise.resolve({ frames: VE.frames, fps: VE.fps, runId: runId });
  };

  VE.frame = function (i) {
    const a = app();
    if (!a) return Promise.reject(new Error('作品未就绪'));
    const step = 1 / VE.fps;
    // 顺序推进到第 i 帧
    let guard = 0;
    while (VE.cursor < i && guard < 900) {
      RT.Demo.update(step);
      if (a.stepWorld) a.stepWorld(step);
      RT.FX.update(step, a.camera);
      RT.RouteViz.update(step);
      RT.UI.update(step);
      VE.cursor++;
      guard++;
    }
    render();
    return Promise.resolve({ frame: i });
  };

  VE.end = function () {
    const a = app();
    VE.active = false;
    VE.runId = null;
    if (a) {
      a.exportMode = false;
      a.scriptLock = false;
      a.mode = 'idle';
      RT.Demo.active = false;
      if (RT.Demo.cursor) RT.Demo.cursor.style.display = 'none';
      const o = document.getElementById('demo-overlay');
      if (o) { o.classList.remove('show'); o.innerHTML = ''; }
      RT.UI.showScreen('menu');
    }
    return Promise.resolve(true);
  };

  function render() {
    const a = app();
    if (!a || !a.renderer) return;
    a.renderer.render(a.scene, a.camera);
  }

  global.videoExport = VE;
  RT.VideoExport = VE;
})(typeof window !== 'undefined' ? window : globalThis);
