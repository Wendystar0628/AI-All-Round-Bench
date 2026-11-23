// Main Entry: Scene Setup, High-Key Sunlit Rain Lighting, OrbitControls, Loop & videoExport Wiring
(function () {
  const { SUN_DIR, PALETTE, evaluateCloud } = window.HARBOR;
  const { updateGlobalUniforms } = window.HARBOR_MATERIALS;

  function init() {
    // 1. Renderer (WebGL2, high-res shadow maps, preserveDrawingBuffer for clean screenshots/export)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NoToneMapping; // Handled cleanly inside anime post-process composite pass!
    renderer.setClearColor(0xdcf4f7, 1.0);

    document.body.appendChild(renderer.domElement);

    // 2. Scene & Atmospheric Distant Mist Fog (subtle so diorama stays crystal sharp, distant breakwater stays misty!)
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xdcf1f5, 0.0028);

    // 3. Camera (Establishing Anime Miniature Diorama Angle: entire 34x34 square base cleanly framed!)
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.15, 360);
    const DEFAULT_CAM_POS = new THREE.Vector3(24.8, 16.0, 27.6);
    const DEFAULT_CAM_TGT = new THREE.Vector3(-0.6, 1.4, -0.4);
    camera.position.copy(DEFAULT_CAM_POS);

    // 4. OrbitControls (PC mouse drag/rotate/zoom; allows dipping gently below waterline to inspect cutaway!)
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(DEFAULT_CAM_TGT);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.80;
    controls.minDistance = 2.0;
    controls.maxDistance = 68.0;
    controls.maxPolarAngle = Math.PI * 0.62; // Can view underwater cross-section cleanly!
    controls.minPolarAngle = 0.14;
    controls.update();

    // 5. High-Key Sunlit-Rain Lighting Rig
    // Primary sunlit key light (warm pale gold, crisp 4096x4096 shadows!)
    const sunLight = new THREE.DirectionalLight(PALETTE.sunLight, 1.38);
    sunLight.position.copy(SUN_DIR).multiplyScalar(42);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 6;
    sunLight.shadow.camera.far = 96;
    const sc = 22.5;
    sunLight.shadow.camera.left = -sc;
    sunLight.shadow.camera.right = sc;
    sunLight.shadow.camera.top = sc;
    sunLight.shadow.camera.bottom = -sc;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.052;
    scene.add(sunLight);

    // High-key airy sky/ground hemisphere fill (keeps shadows luminous sea-glass teal!)
    const hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, 0x3b7282, 0.88);
    scene.add(hemiLight);

    // Subtle cool sea-bounce rim/fill directional from opposite azimuth
    const fillLight = new THREE.DirectionalLight(0x88cedb, 0.34);
    fillLight.position.set(-24, 16, -20);
    scene.add(fillLight);

    // Soft localized daylight bounce inside open interiors (makes warehouse & waiting room details pop!)
    const whInteriorLight = new THREE.PointLight(0xffecc0, 0.75, 8.5, 1.5);
    whInteriorLight.position.set(-11.4, 3.2, -1.7);
    scene.add(whInteriorLight);

    const wrInteriorLight = new THREE.PointLight(0xe2f5f7, 0.65, 7.5, 1.5);
    wrInteriorLight.position.set(-11.2, 3.2, 6.2);
    scene.add(wrInteriorLight);

    const vmLight = new THREE.PointLight(0xfff1c4, 0.55, 4.5, 1.6);
    vmLight.position.set(-8.35, 2.55, 9.15);
    scene.add(vmLight);

    // 6. Build All World Modules
    const baseRef = window.HARBOR_BASE.buildDioramaBase(scene);
    const buildingsRef = window.HARBOR_BUILDINGS.buildBuildings(scene);
    const propsRef = window.HARBOR_PROPS.buildProps(scene);
    const boatsRef = window.HARBOR_BOATS.buildBoats(scene, propsRef);
    const wildlifeRef = window.HARBOR_WILDLIFE.buildWildlife(scene, propsRef, boatsRef);
    const waterRef = window.HARBOR_WATER.buildWaterAndWeather(scene, baseRef, propsRef);

    // 7. Create Multi-Pass Anime Post-Processing & Planar Reflection Pipeline
    const pipeline = window.HARBOR_POST.createAnimePipeline(renderer, scene, camera, waterRef);

    // Viewport sizing (adapts cleanly up to 3840x2160!)
    let lastW = 0, lastH = 0, lastDpr = 0;
    function syncViewportSize() {
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      const dpr = Math.min(window.devicePixelRatio || 1, w >= 2560 ? 1 : 2);
      if (w !== lastW || h !== lastH || dpr !== lastDpr) {
        lastW = w; lastH = h; lastDpr = dpr;
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = w + 'px';
        renderer.domElement.style.height = h + 'px';
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        pipeline.resize(w, h, dpr);
      }
    }
    window.addEventListener('resize', syncViewportSize);
    syncViewportSize();

    // 8. Core Scene Update & Render Driver
    let isExportMode = false;
    let simTime = 0.0;
    let lastRealMs = performance.now();

    function stepAndRender(t, dt) {
      updateGlobalUniforms(t);

      // Modulate global sun intensity slightly with moving cloud veil over center
      const cloud = evaluateCloud(t);
      const centerCloudDist = Math.hypot(cloud.cloudX, cloud.cloudZ) / Math.max(cloud.cloudRadius, 1);
      const centerDim = Math.exp(-centerCloudDist * centerCloudDist * 1.1) * cloud.darkness;
      sunLight.intensity = 1.38 * (1.0 - centerDim * 0.48);
      whInteriorLight.intensity = 0.75 * (1.0 - centerDim * 0.45);

      const wakeSources = boatsRef.update(t);
      baseRef.update(t, camera);
      propsRef.update(t, wakeSources);
      wildlifeRef.update(t, camera, isExportMode, dt);
      waterRef.update(t, wakeSources);

      pipeline.render();
    }

    // 9. Install Fixed window.videoExport API (Section 10.7)
    window.HARBOR_TOUR.installVideoExport({
      camera,
      syncViewportSize,
      setExportMode(flag) {
        isExportMode = !!flag;
        controls.enabled = !isExportMode;
        if (!isExportMode) {
          lastRealMs = performance.now();
        }
      },
      saveCameraState() {
        return {
          pos: camera.position.clone(),
          tgt: controls.target.clone(),
          fov: camera.fov
        };
      },
      restoreCameraState(st) {
        camera.position.copy(st.pos);
        controls.target.copy(st.tgt);
        camera.fov = st.fov;
        camera.updateProjectionMatrix();
        controls.update();
      },
      renderDeterministicFrame(t) {
        stepAndRender(t, 1 / 60);
      }
    });

    // Expose tiny debug handle for programmatic camera inspection during QA (zero UI!)
    window.__harborDebug = {
      scene,
      camera,
      controls,
      setView(px, py, pz, tx, ty, tz, fov) {
        camera.position.set(px, py, pz);
        controls.target.set(tx, ty, tz);
        if (fov) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        controls.update();
        stepAndRender(simTime, 0.016);
      },
      renderAt(t) {
        simTime = t;
        stepAndRender(simTime, 0.016);
      }
    };

    // 10. Real-Time Interactive Loop (paused automatically during videoExport!)
    function animate(now) {
      requestAnimationFrame(animate);
      if (isExportMode) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastRealMs) / 1000));
      lastRealMs = now;
      simTime += dt;
      controls.update();
      stepAndRender(simTime, dt);
    }

    // Render initial frame synchronously right away
    stepAndRender(0.0, 0.016);
    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
