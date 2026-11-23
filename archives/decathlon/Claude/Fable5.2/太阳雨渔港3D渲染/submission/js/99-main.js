/* assemble the scene, run the fixed-step simulation and the render loop */
(function () {
  'use strict';
  var H = window.H, U = H.U;

  H.Render.init();
  var scene = H.scene;
  H.world = new THREE.Group(); H.world.name = 'world'; scene.add(H.world);

  // ---- static world, merged per material
  var B = H.SB = new H.Builder();
  var steps = ['buildBase', 'buildQuay', 'buildBuildings', 'buildProps', 'buildLandscape', 'buildExtras'];
  steps.forEach(function (fn) { if (H[fn]) H[fn](B, scene); });
  B.build(H.world, { name: 'static' });
  H.buildShoreMask();
  H.buildWater(scene);
  ['buildBoats', 'buildWeather', 'buildCreatures', 'buildEvents'].forEach(function (fn) { if (H[fn]) H[fn](scene); });

  H.Controls.init(H.Render.renderer.domElement, H.camera);

  // ---- simulation: fixed 60 Hz steps, fully deterministic from reset()
  var Sim = H.Sim = { t: 0, n: 0, mode: 'free' };
  Sim.reset = function (mode) {
    Sim.t = 0; Sim.n = 0; Sim.mode = mode || 'free';
    U.uTime.value = 0; H.windState.time = 0;
    for (var i = 0; i < H.systems.length; i++) if (H.systems[i].reset) H.systems[i].reset(Sim.mode);
  };
  Sim.step = function () {
    Sim.n++; Sim.t = Sim.n * H.DT;
    U.uTime.value = Sim.t; H.windState.time = Sim.t;
    for (var i = 0; i < H.systems.length; i++) H.systems[i].update(H.DT, Sim.t);
  };
  // things that only need doing once per rendered frame (uploads, matrices)
  Sim.present = function () {
    for (var i = 0; i < H.systems.length; i++) if (H.systems[i].present) H.systems[i].present(Sim.t);
  };
  H.camPos = H.camera.position;
  Sim.reset('free');

  if (H.setupTour) H.setupTour();

  var last = performance.now(), acc = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (H.exporting) { last = now; return; }
    var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (H.Render.resize(false)) { /* window size changed */ }
    H.Controls.update(dt);
    acc += dt; var n = 0;
    while (acc >= H.DT && n < 5) { Sim.step(); acc -= H.DT; n++; }
    if (n === 5) acc = 0;
    Sim.present();
    H.Render.frame();
  }
  requestAnimationFrame(tick);
})();
