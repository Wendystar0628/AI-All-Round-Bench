window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  const $ = (id) => document.getElementById(id);

  function bindRange(id, out, fmt, onChange) {
    const el = $(id), o = $(out);
    const upd = () => { const v = parseFloat(el.value); o.textContent = fmt(v); onChange(v); };
    el.addEventListener('input', upd);
    upd();
    return el;
  }

  function init(main) {
    bindRange('sSoft', 'oSoft', v => v.toFixed(2), v => main.scene().setParam('softness', v));
    bindRange('sStur', 'oStur', v => v.toFixed(2), v => main.scene().setParam('sturdiness', v));
    bindRange('sMass', 'oMass', v => (v / 1000).toFixed(1) + ' 千', v => main.scene().setParam('ballDensity', v));
    bindRange('sDrop', 'oDrop', v => v.toFixed(2) + ' m', v => main.scene().setParam('dropHeight', v));
    bindRange('sLow', 'oLow', v => v.toFixed(0), v => main.scene().setParam('densLow', v));
    bindRange('sNeu', 'oNeu', v => v.toFixed(0), v => main.scene().setParam('densNeutral', v));
    bindRange('sHigh', 'oHigh', v => v.toFixed(0), v => main.scene().setParam('densHigh', v));
    bindRange('sAmp', 'oAmp', v => v.toFixed(3), v => main.scene().setParam('waveAmp', v));
    bindRange('sFreq', 'oFreq', v => v.toFixed(2) + ' Hz', v => main.scene().setParam('waveFreq', v));

    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => main.switchScene(t.dataset.scene)));
    document.querySelectorAll('.btn.demo').forEach(b => b.addEventListener('click', () => main.playDemo(b.dataset.demo)));
    document.querySelectorAll('.btn.act[data-act]').forEach(b => b.addEventListener('click', () => {
      const sc = main.scene();
      if (sc.trigger) sc.trigger(b.dataset.act);
    }));
    $('dropBtn').addEventListener('click', () => {
      const sc = main.scene();
      if (sc.trigger) sc.trigger('center');
    });
    $('releaseBtn').addEventListener('click', () => {
      const sc = main.scene();
      if (sc.releaseBalls) sc.releaseBalls();
    });
    $('waveBtn').addEventListener('click', () => main.toggleWave());
    $('resetJelly').addEventListener('click', () => main.resetScene());
    $('resetTank').addEventListener('click', () => main.resetScene());
    $('playBtn').addEventListener('click', () => main.togglePause());
    $('slowBtn').addEventListener('click', () => main.cycleSlow());
    $('restartBtn').addEventListener('click', () => main.restartDemo());
    $('audioBtn').addEventListener('click', () => main.toggleAudio());

    addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); main.togglePause(); }
      if (e.key === '1') main.scene().trigger && main.scene().trigger('center');
      if (e.key === '2') main.scene().trigger && main.scene().trigger('offset');
      if (e.key === '3') main.scene().trigger && main.scene().trigger('multi');
      if (e.key === 'r' || e.key === 'R') main.resetScene();
    });

    const cv = $('c');
    let drag = null;
    cv.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; APP.audio.resume(); });
    addEventListener('mouseup', () => drag = null);
    addEventListener('mousemove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const cam = main.scene().cam;
      if (drag.b === 2) cam.pan(dx, dy); else cam.orbit(dx, dy);
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); main.scene().cam.zoom(e.deltaY); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }

  APP.ui = { init };
})();
