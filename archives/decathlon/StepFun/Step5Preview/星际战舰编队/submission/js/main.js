// main.js — bootstrap, scene assembly, playback loop
(function () {
  'use strict';
  const canvas = document.getElementById('gl');
  const boot = document.getElementById('boot');
  const app = { renderer: null, scene: null, exporting: false };
  window.__app = app;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (app.renderer && (app.renderer.w !== w || app.renderer.h !== h)) app.renderer.resize(w, h);
  }
  window.addEventListener('resize', resize);

  function build() {
    const t0 = performance.now();
    app.renderer = new Renderer(canvas);
    window.__gl = app.renderer.gl;
    const r = app.renderer;
    const fleet = Ships.buildFleet();
    const hangar = Interiors.buildHangar();
    const bridge = Interiors.buildBridge();
    const core = Interiors.buildCore();
    const corridor = Interiors.buildCorridor();
    const rocks = Asteroids.buildAsteroids(11);
    const sched = Timeline.buildSchedule({ fleet: fleet, rocks: rocks });
    const d = (s) => Math.hypot(s.home[0], s.home[1], s.home[2]);
    const shieldOrder = [{ ship: fleet.flagship }].concat(fleet.escorts.slice().sort((a, b) => d(a) - d(b)));
    app.scene = { fleet, hangar, bridge, core, corridor, rocks, sched, shieldOrder };
    resize();
    let total = fleet.flagship.voxels + hangar.voxels + bridge.voxels + core.voxels + corridor.voxels;
    for (const e of fleet.escorts) total += 0;
    console.log('build ms', (performance.now() - t0) | 0, 'flagship faces', fleet.flagship.mesh.count,
      'hangar', hangar.mesh.count, 'bridge', bridge.mesh.count, 'core', core.mesh.count, 'corr', corridor.mesh.count);
    boot.style.display = 'none';
  }

  let T = 0, last = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (!app.exporting) {
      T += dt;
      if (T >= Timeline.LOOP) T -= Timeline.LOOP;
    }
    if (app.scene && !app.exporting) Timeline.renderFrame(app.renderer, app.scene, T);
  }

  function start() {
    try {
      build();
    } catch (e) {
      boot.textContent = '初始化失败: ' + e.message;
      console.error(e);
      return;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(() => setTimeout(start, 30));
})();
