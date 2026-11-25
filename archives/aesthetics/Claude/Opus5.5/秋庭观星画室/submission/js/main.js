/* bootstrap & main loop */
(function () {
  'use strict';
  const W = window.W;
  W.buckets = {};
  W.bucket = (n) => W.buckets[n] || (W.buckets[n] = new W.Bucket(n));
  W.clock = { t: 0, last: 0, exporting: false };

  function finalize() {
    for (const k in W.buckets) {
      const b = W.buckets[k];
      if (b.count === 0) continue;
      const m = b.mesh(W.mat);
      m.name = k;
      W.scene.add(m);
    }
    W.parts.forEach((p) => {
      const m = p.b.mesh(W.mat);
      m.name = p.name;
      p.mesh = m;
      m.position.copy(p.pivot);
      if (p.parent && p.parent.mesh) p.parent.mesh.add(m); else W.scene.add(m);
    });
  }

  function shiftStudio(dz, snapB, p0, c0) {
    for (const k in W.buckets) {
      const b = W.buckets[k]; const from = snapB[k] || 0;
      for (let i = from + 2; i < b.pos.n; i += 3) b.pos.a[i] += dz;
    }
    W.parts.slice(p0).forEach((p) => { if (!p.parent) p.pivot.z += dz; });
    W.scene.children.slice(c0).forEach((o) => { o.position.z += dz; });
    const vs = [W.roundWin, W.skylight, W.orreryPos, W.orreryCenter, W.kettleSpout, W.catHome, W.deskLamp, W.sideLamp, W.andonPos].concat(W.teaCups || [], W.lanternPos || []);
    vs.forEach((v) => { if (v) v.z += dz; });
    if (W.roofInfo) { W.roofInfo.ridgeZ += dz; W.roofInfo.eaveZ += dz; }
    if (W.eave) W.eave.zFront += dz;
    W.U.uOrrC.value.copy(W.orreryCenter);
  }

  function init() {
    const canvas = document.getElementById('c');
    W.render.init(canvas);
    W.scene = W.render.scene;
    W.paintAtlas();
    W.atlas.finish(W.renderer);
    W.mat = W.makeToon({ side: THREE.DoubleSide });
    W.matDS = W.mat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 48, 24), W.makeSkyMat());
    sky.layers.set(W.LAYER.SKY); sky.renderOrder = -10; sky.frustumCulled = false;
    W.scene.add(sky); W.sky = sky;
    const t0 = performance.now();
    W.terrain.build();
    // studio + interior are authored in their own frame and moved forward by STUDIO_SHIFT
    const snapB = {}; for (const k in W.buckets) snapB[k] = W.buckets[k].pos.n;
    const p0 = (W.parts || []).length, c0 = W.scene.children.length;
    W.studio.build();
    W.interior.build();
    shiftStudio(W.L.STUDIO_SHIFT, snapB, p0, c0);
    W.shrine.build();
    W.garden.build();
    W.pond.build();
    W.ginkgoTree(W.L.GINKGO.x, W.L.TERR_Y, W.L.GINKGO.z);
    if (W.life) W.life.build();
    finalize();
    W.buildMs = performance.now() - t0;
    W.render.updateShadowCam();
    if (W.cam && W.cam.init) W.cam.init(); else { W.render.camera.position.set(9, 32, 52); W.render.camera.lookAt(0, 1, 0); }
    W.debugCam = (p, t, fov) => { W.cam = null; const c = W.render.camera; c.position.set(p[0], p[1], p[2]); c.lookAt(t[0], t[1], t[2]); if (fov) { c.fov = fov; c.updateProjectionMatrix(); } };
    if (W.tour) W.tour.init();
    W.clock.last = performance.now();
    requestAnimationFrame(loop);
    W._readyResolve(true);
    setTimeout(() => document.getElementById('veil').classList.add('off'), 120);
  }

  W.step = function (t, dt) {
    if (W.tourActive && W.tour) W.tour.apply(t);
    W.U.uTime.value = t;
    if (W.life) W.life.update(t, dt);
  };

  W.renderNow = function () {
    const w = Math.max(2, Math.floor(window.innerWidth * (W.clock.exporting ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 1.5))));
    const h = Math.max(2, Math.floor(window.innerHeight * (W.clock.exporting ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 1.5))));
    W.render.setSize(w, h);
    W.render.frame();
  };

  function loop(now) {
    requestAnimationFrame(loop);
    if (W.clock.exporting) return;
    let dt = (now - W.clock.last) / 1000;
    W.clock.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    W.clock.t += dt;
    if (W.cam && W.cam.update) W.cam.update(dt);
    W.stepSim(W.clock.t);
    W.renderNow();
  }

  // fixed-step simulation advance to absolute time T (deterministic)
  W.sim = { t: 0 };
  W.stepSim = function (T) {
    const h = 1 / 60;
    let n = 0;
    if (T < W.sim.t) { W.sim.t = T; }
    const cap = W.clock.exporting ? 1e9 : 600;
    while (W.sim.t + h <= T + 1e-9 && n < cap) { W.sim.t += h; W.step(W.sim.t, h); n++; }
    if (!W.clock.exporting && W.sim.t + h <= T) W.sim.t = T;
    if (n === 0) W.step(W.sim.t, 0);
  };

  window.addEventListener('load', init);
})();
