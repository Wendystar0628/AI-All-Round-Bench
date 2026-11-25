'use strict';
/* ==========================================================================
   Main: renderer, build pipeline, loop
   ========================================================================== */
(function () {
  const P = window.P;
  const nextFrame = () => new Promise((r) => setTimeout(r, 0));
  P.ready = false;
  let resolveReady;
  P.readyPromise = new Promise((r) => (resolveReady = r));
  P.time = 0;

  function progress(f) {
    const el = document.getElementById('loadbar');
    if (el) el.style.width = (f * 100).toFixed(1) + '%';
  }
  P.progress = progress;

  function meshVoxelWorld(world, terrain, voxSize, scene, opts) {
    opts = opts || {};
    const res = P.meshWorld(world, terrain, { tile: opts.tile || 128, coarseOcc: opts.coarseOcc });
    const op = opts.opMat || P.makeVoxelMaterial(voxSize);
    const gl = opts.glMat || P.makeGlassMaterial(voxSize);
    const wa = opts.waMat || P.makeSlideWaterMaterial(voxSize);
    let tris = 0;
    for (const t of res.tiles.values()) {
      const add = (buf, mat, caster) => {
        const g = buf.toGeometry();
        if (!g) return;
        const m = new THREE.Mesh(g, mat);
        m.scale.setScalar(voxSize);
        m.matrixAutoUpdate = false; m.updateMatrix();
        if (caster) m.layers.enable(1);
        if (mat.transparent) m.renderOrder = 8;
        scene.add(m);
        tris += g.index.count / 3;
      };
      add(t.op, op, true);
      add(t.gl, gl, false);
      add(t.wa, wa, false);
    }
    return tris;
  }
  P.meshVoxelWorld = meshVoxelWorld;

  async function init() {
    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.sortObjects = true;
    P.renderer = renderer;
    P.R.init(renderer);
    const scene = (P.scene = new THREE.Scene());
    const camera = (P.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 40000));
    camera.layers.enableAll();

    P.makePaletteTexture();
    const t0 = performance.now();
    progress(0.04);
    await nextFrame();
    P.buildTerrain();
    progress(0.2);
    await nextFrame();
    const world = (P.world = new P.VoxelWorld(P.V));
    const fine = (P.fine = new P.VoxelWorld(P.FV));
    P.B = new P.Brush(world);
    P.FB = new P.Brush(fine);
    if (P.buildAll) await P.buildAll(progress);
    progress(0.7);
    await nextFrame();
    const t1 = performance.now();
    P.opMat = P.makeVoxelMaterial(P.V);
    let tris = meshVoxelWorld(world, P.terrain, P.V, scene, { opMat: P.opMat });
    progress(0.82);
    await nextFrame();
    // fine voxels: coarse occupancy as occluder
    const T = P.terrain;
    const coarseOcc = (x, y, z) => {
      const cx = x >> 1, cy = y >> 1, cz = z >> 1;
      const m = world.get(cx, cy, cz);
      if (m) return m !== 255 && P.pal.cls[m] === 1;
      return cy < T.h(cx, cz);
    };
    P.fineMat = P.makeVoxelMaterial(P.FV, { edge: 0.7 });
    tris += meshVoxelWorld(fine, null, P.FV, scene, { tile: 256, coarseOcc, opMat: P.fineMat });
    if (P.placeInstances) P.placeInstances(scene);
    const t2 = performance.now();
    console.log('mesh', (t2 - t1).toFixed(0), 'ms tris', tris, 'build', (t1 - t0).toFixed(0), 'chunks', world.chunks.size, fine.chunks.size);
    P.stats = { tris, mesh: t2 - t1, build: t1 - t0 };
    progress(0.9);
    await nextFrame();

    // environment
    scene.add(P.makeSky());
    scene.add(P.makeClouds());
    scene.add(P.makeSea());
    scene.add(P.makeFarLand());
    P.W.build(scene);
    if (P.buildDynamic) P.buildDynamic(scene);
    if (P.Tour) P.Tour.init();

    // shadows
    P.R.initShadows(renderer, scene);
    P.R.renderStaticShadow();

    // camera
    P.Cam.init(canvas, camera);
    P.Cam.buildUI();
    if (P.exportMode) P.Cam.setUIVisible(false);

    function resize() {
      const dpr = P.exportMode ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(2, Math.round(innerWidth * dpr)), h = Math.max(2, Math.round(innerHeight * dpr));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      P.R.resize(w, h);
    }
    P.resize = resize;
    addEventListener('resize', resize);
    resize();
    const loader = document.getElementById('loader');
    loader.style.opacity = '0';
    setTimeout(() => (loader.style.display = 'none'), 700);
    P.ready = true;
    resolveReady();
    P.clockStart = performance.now();
    P.liveOffset = 6;
    let last = performance.now();
    function loop() {
      requestAnimationFrame(loop);
      if (P.exportMode) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      P.time = (now - P.clockStart) / 1000 + P.liveOffset;
      P.renderAt(P.time, dt, false);
    }
    loop();
  }

  // render the full scene at time t
  P.renderAt = function (t, dt, exporting) {
    const camera = P.camera;
    P.U.uTime.value = t;
    P.updateCloudShadows(t);
    P.cloudsUpdate(t);
    if (P.Dyn) P.Dyn.update(t, dt);
    if (!exporting) P.Cam.update(t, dt, false);
    // adaptive near plane
    const camH = camera.position.y - P.groundY(camera.position.x, camera.position.z);
    camera.near = P.clamp((P.Cam && P.Cam.nearHint) || camH * 0.02, 0.08, 3.0);
    camera.far = 40000;
    camera.updateProjectionMatrix();
    P.R.renderDynamicShadow();
    P.R.renderFrame(P.scene, camera);
  };

  window.addEventListener('load', () => init().catch((e) => { console.error(e); const el = document.getElementById('err'); if (el) el.textContent = String(e.stack || e); }));
})();
