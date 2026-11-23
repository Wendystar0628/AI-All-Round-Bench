// 启动：初始化字体与界面，载入示例工程
(function () {
  'use strict';
  const MF = window.MF;
  function boot() {
    MF.Fonts.init();
    MF.Shell.init(document.getElementById('app'));
    if (MF.Keys) MF.Keys.init();
    try {
      if (MF.Demo) MF.Demo.load(true); else MF.App.newProject();
    } catch (e) { console.error('示例载入失败', e); MF.App.newProject(); MF.App.toast('示例载入失败：' + e.message, 'err'); }
    const ld = document.getElementById('loading'); if (ld) ld.remove();
    MF.ready = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
