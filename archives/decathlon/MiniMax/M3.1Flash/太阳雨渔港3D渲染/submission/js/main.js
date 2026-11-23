/* =====================================================================
   main.js — 渲染器 / 相机控制 / 主循环 / 导出接口接线
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;

  const main = {
    renderer: null, scene: null, camera: null,
    worldTime: 0, clock: null, running: false,
    controls: null,
  };

  /* ---------------- 相机控制（自写，无 UI） ---------------- */
  function makeControls(camera, dom) {
    const c = {
      target: new THREE.Vector3(-1.1, 0.5, -1.0),
      theta: 0.60, phi: 1.07, radius: 33,
      tTheta: 0.60, tPhi: 1.07, tRadius: 33,
      tTarget: new THREE.Vector3(-1.1, 0.5, -1.0),
      enabled: true, dragging: 0, lx: 0, ly: 0,
    };
    const clampPhi = (v) => U.clamp(v, 0.12, 1.52);
    const clampR = (v) => U.clamp(v, 5.5, 62);

    function apply() {
      c.theta += (c.tTheta - c.theta) * 0.16;
      c.phi += (c.tPhi - c.phi) * 0.16;
      c.radius += (c.tRadius - c.radius) * 0.16;
      c.target.lerp(c.tTarget, 0.16);
      const sp = Math.sin(c.phi), cp = Math.cos(c.phi);
      camera.position.set(
        c.target.x + c.radius * sp * Math.sin(c.theta),
        c.target.y + c.radius * cp,
        c.target.z + c.radius * sp * Math.cos(c.theta));
      camera.lookAt(c.target);
    }
    c.apply = apply;

    function onDown(e) {
      if (!c.enabled) return;
      c.dragging = (e.button === 2 || e.shiftKey) ? 2 : 1;
      c.lx = e.clientX; c.ly = e.clientY;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!c.dragging || !c.enabled) return;
      const dx = e.clientX - c.lx, dy = e.clientY - c.ly;
      c.lx = e.clientX; c.ly = e.clientY;
      if (c.dragging === 1) {
        c.tTheta -= dx * 0.0055;
        c.tPhi = clampPhi(c.tPhi - dy * 0.0045);
      } else {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const s = c.radius * 0.0013;
        c.tTarget.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
        c.tTarget.x = U.clamp(c.tTarget.x, -14, 14);
        c.tTarget.y = U.clamp(c.tTarget.y, -3, 8);
        c.tTarget.z = U.clamp(c.tTarget.z, -14, 14);
      }
    }
    function onUp(e) {
      c.dragging = 0;
      dom.releasePointerCapture && e.pointerId !== undefined && dom.releasePointerCapture(e.pointerId);
    }
    function onWheel(e) {
      if (!c.enabled) return;
      e.preventDefault();
      c.tRadius = clampR(c.tRadius * (1 + Math.sign(e.deltaY) * 0.09));
    }
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    c.syncFromCamera = function () {
      const off = camera.position.clone().sub(c.target);
      const r = off.length();
      c.radius = c.tRadius = U.clamp(r, 5.5, 62);
      c.phi = c.tPhi = Math.acos(U.clamp(off.y / (r || 1), -1, 1));
      c.theta = c.tTheta = Math.atan2(off.x, off.z);
    };
    return c;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const canvas = document.getElementById('scene');
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: false, stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0xd9e9ee, 1);
    main.renderer = renderer;

    const scene = new THREE.Scene();
    main.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(13.6, 9.2, 14.6);
    main.camera = camera;

    /* ---- 构建场景 ---- */
    TY.buildMaterials();
    TY.sky.build(scene, renderer);
    TY.water.build(scene, renderer, TY.LAYOUT);
    TY.quay.build(scene);
    TY.props.build(scene);
    TY.buildings.build(scene);
    TY.boats.build(scene);
    TY.boats.buildMooring(scene);
    TY.life.build(scene);
    TY.life.initDeparture();
    TY.weather.build(scene, renderer);

    /* 消波块位置传给水面着色器 */
    const tu = TY.water.surface.material.uniforms.uTetra.value;
    TY.quay.tetra.forEach((tg, i) => {
      if (i < tu.length) tu[i].set(tg.position.x, tg.position.y, tg.position.z);
    });

    /* 滴水来源 */
    const W = TY.weather;
    const um = TY.props.umbrella;
    if (um) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        W.addDripSource(um.position.x + Math.cos(a) * 0.42, um.position.y - 0.28, um.position.z + Math.sin(a) * 0.42, 3.2 + i * 0.9, i + 1);
      }
    }
    TY.props.lampPosts.forEach((p, i) => {
      W.addDripSource(p.x + 0.2, p.y - 0.09, p.z, 2.4 + i * 0.7, 10 + i);
    });
    TY.boats.list.forEach((b, i) => {
      W.addDripSource(b.group.position.x + 0.6, b.group.position.y + b.spec.depth * 0.95, b.group.position.z, 4 + i * 1.3, 40 + i);
      W.addDripSource(b.group.position.x - 0.6, b.group.position.y + b.spec.depth * 0.95, b.group.position.z, 4 + i * 1.7, 60 + i);
    });

    /* ---- 控制 ---- */
    const controls = makeControls(camera, canvas);
    main.controls = controls;
    controls.apply();

    window.addEventListener('resize', onResize);
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    main.running = true;
    main.clock = new THREE.Clock();
    requestAnimationFrame(loop);
    window.addEventListener('load', () => { /* 保持 */ });
  }

  /* ---------------- 世界更新 ---------------- */
  function updateWorld(t, dt, camera) {
    TY.sky.update(t, camera);
    TY.shared.uTime.value = t;
    TY.quay.update(t, dt, camera);
    TY.boats.update(t, dt);
    TY.life.update(t, dt, camera);
    TY.props.update(t, dt, TY.life.gustAmount);
    TY.buildings.update(t, dt);
    TY.weather.update(t, dt, camera, main.renderer, main.scene);
    TY.water.update(t, camera, main.renderer, main.scene);
    TY.sky.updateFog(camera);
  }

  /* ---------------- 渲染 ---------------- */
  function renderNow() {
    const renderer = main.renderer;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(main.scene, main.camera);
    TY.outlineU.uScale.value = 2 * Math.tan((main.camera.fov * Math.PI / 180) / 2) / renderer.domElement.height;
  }

  main.renderNow = renderNow;

  /* ---------------- 主循环 ---------------- */
  let lastT = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!main.running) return;
    const dt = Math.min(0.05, main.clock.getDelta());

    if (TY.tour.exportMode) {
      // 导出模式：时间只由 frame(i) 推进，这里只重绘
      renderNow();
      return;
    }

    main.worldTime += dt;
    const t = main.worldTime;

    if (main.controls.enabled) main.controls.apply();
    updateWorld(t, dt, main.camera);
    renderNow();
    lastT = t;
  }

  /* ---------------- 导出模式接口 ---------------- */
  main.setExportTime = function (t) {
    main.worldTime = t;
    const fps = TY.tour.fps || 60;
    const dt = 1 / fps;
    // 先把镜头放到该时刻，再更新世界：角色（海鸥、猫）才能对正确机位做出反应
    TY.tour.applyTime(t, main.camera);
    updateWorld(t, dt, main.camera);
    main.controls.syncFromCamera();
  };
  main.resumeClock = function () {
    main.controls.enabled = true;
    main.controls.syncFromCamera();
  };

  TY.main = main;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
