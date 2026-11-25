/* =====================================================================
   main.js — 启动
   ===================================================================== */
(function () {
  'use strict';
  function boot() {
    G.fit();
    window.addEventListener('resize', () => G.fit());
    G.BG.init();
    G.Cursor.init();
    G.wireInput();
    G.TOC.init();
    G.resetState();
    G.App.swap('title', {});
    G.startLoop();
    setTimeout(() => { if (!G.exporting) G.BG.warm(); }, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
