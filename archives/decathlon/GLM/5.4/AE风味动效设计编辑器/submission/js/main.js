/* ============================================================
   main.js — 启动、渲染循环、videoExport 接口
   ============================================================ */
(function (global) {
  'use strict';
  const M = MODEL;
  let exportMode = false;
  let exportFps = 30;
  let lastTime = 0;
  let frames = 0, fpsTime = 0;

  function boot() {
    const canvas = document.getElementById('glcanvas');
    try { R.init(canvas); }
    catch (e) {
      document.body.innerHTML = '<div style="color:#fff;padding:40px;font:14px sans-serif">WebGL2 初始化失败：' + e.message + '</div>';
      return;
    }
    try { FONT.detectFonts(); } catch (e) { console.warn(e); }
    MODEL.Project = DEMO.build();
    M.Undo.reset();
    M.Undo.push('初始状态');
    UI.init();
    UI_TIMELINE.init();
    UI_NODES.init();
    UI.refresh();
    UI_TIMELINE.resize();
    UI.updateTransport();
    window.addEventListener('resize', () => { UI.invalidate(); UI_TIMELINE.resize(); });
    requestAnimationFrame(loop);
    // 首次交互解锁音频
    const unlock = () => { AUDIO.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const P = M.Project;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (P.playing && !exportMode) {
      const c = M.activeComp();
      if (c) {
        let t = P.time + dt;
        const wa = c.workArea || [0, c.duration];
        if (P.loop && t > wa[1]) t = wa[0];
        if (t > c.duration) { if (P.loop) t = 0; else { t = c.duration; P.playing = false; AUDIO.stop(); UI.updateTransport(); } }
        P.time = t;
        UI.updateTransport();
        UI.dirty = true;
        UI_TIMELINE.drawRuler(); UI_TIMELINE.drawKeys();
      }
    }
    if (UI.dirty) {
      const t0 = performance.now();
      UI.renderViewer();
      UI.dirty = false; UI.overlayDirty = false;
      const t1 = performance.now();
      frames++; fpsTime += t1 - t0;
      if (fpsTime > 500) { UI.fps = frames * 1000 / fpsTime; frames = 0; fpsTime = 0; }
    } else if (UI.overlayDirty) {
      UI.drawOverlay();
      UI.overlayDirty = false;
    }
  }

  /* ---------------- 导出接口 ---------------- */
  function raf2() { return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }

  const videoExport = {
    runs: ['demo'],
    async begin(runId, opts = {}) {
      exportMode = true;
      exportFps = opts.fps || 30;
      const P = M.Project;
      P.playing = false;
      AUDIO.stop();
      // 重置模拟缓存，保证从第 0 帧开始取样
      SIM.clearCache();
      P.time = 0;
      UI.updateTransport();
      UI.renderViewer();
      UI_TIMELINE.resize();
      await raf2();
      return { frames: Math.round(15 * exportFps) };
    },
    async frame(i) {
      const P = M.Project;
      exportMode = true;
      const c = M.activeComp();
      P.time = U.clamp(i / exportFps, 0, c ? c.duration : 15);
      UI.updateTransport();
      UI.renderViewer();
      UI_TIMELINE.drawRuler(); UI_TIMELINE.drawKeys(); UI_TIMELINE.drawGraph();
      UI.drawOverlay();
      await raf2();
      return true;
    },
    end() {
      exportMode = false;
      const P = M.Project;
      P.playing = false;
      P.time = 0;
      UI.updateTransport();
      UI.invalidate();
    },
    get exporting() { return exportMode; }
  };
  global.videoExport = videoExport;

  window.addEventListener('load', boot);
})(window);
