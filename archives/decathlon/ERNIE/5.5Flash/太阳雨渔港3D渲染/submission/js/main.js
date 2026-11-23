// ---------- main ----------
let CAMERA = null;
let SCENE = null;
let RENDERER = null;
const STATE = {
  mode: 'normal',
  time: 0,
  lastNow: 0,
  exportFps: 60,
  exportT: 0,
  frames: 0
};

  const CTL = {
    theta: 0.62, phi: 1.05, radius: 70,
  tTheta: 0.62, tPhi: 1.05, tRadius: 70,
  target: new THREE.Vector3(0, 0.6, 0),
  tTarget: new THREE.Vector3(0, 0.6, 0),
  dragging: false, panning: false, lastX: 0, lastY: 0,
  lastInput: 0
};

function init() {
  SCENE = new THREE.Scene();
  SCENE.fog = new THREE.FogExp2(0xdceff1, 0.0040);

  RENDERER = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
    alpha: false
  });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const maxDim = Math.max(window.innerWidth, window.innerHeight);
  const cap = maxDim > 0 ? Math.min(1, 3840 / maxDim) : 1;
  RENDERER.setPixelRatio(Math.max(0.5, dpr * cap));
  RENDERER.setSize(window.innerWidth, window.innerHeight);
  RENDERER.outputEncoding = THREE.sRGBEncoding;
  RENDERER.toneMapping = THREE.ACESFilmicToneMapping;
  RENDERER.toneMappingExposure = 1.07;
  RENDERER.shadowMap.enabled = true;
  RENDERER.shadowMap.type = THREE.PCFSoftShadowMap;
  RENDERER.shadowMap.autoUpdate = false;
  RENDERER.setClearColor(0xdceff1, 1);
  RENDERER.domElement.id = 'scene';
  document.body.appendChild(RENDERER.domElement);

  CAMERA = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.08, 700);
  CAMERA.position.set(56, 38, 60);

  initTextures();
  initMaterials();
  initSharedMaterials();
  initSky(SCENE);
  initWater(SCENE);
  initBase(SCENE);
  initBuildings(SCENE);
  initBoats(SCENE);
  initProps(SCENE);
  initLife(SCENE);
  initRain(SCENE);
  initTour();

  setupControls();
  updateCameraFromControls(true);
  STATE.lastNow = performance.now();

  window.videoExport = {
    runs: ['tour'],
    begin: function (runId, opts) {
      opts = opts || {};
      const fps = opts.fps || 60;
      STATE.mode = 'export';
      STATE.exportFps = fps;
      STATE.exportT = 0;
      STATE.frames = Math.max(1, Math.round(TOUR.duration * fps));
      update(0);
      renderFrame();
      return { frames: STATE.frames };
    },
    frame: function (i) {
      if (STATE.mode !== 'export') return false;
      const t = Math.max(0, i) / STATE.exportFps;
      STATE.exportT = t;
      update(t);
      renderFrame();
      return true;
    },
    end: function () {
      if (STATE.mode !== 'export') return true;
      STATE.mode = 'normal';
      STATE.time = STATE.exportT;
      STATE.lastNow = performance.now();
      CAMERA.fov = 32;
      CAMERA.updateProjectionMatrix();
      updateCameraFromControls(true);
      return true;
    }
  };

  requestAnimationFrame(loop);
  window.__DBG = { scene: SCENE, renderer: RENDERER, camera: CAMERA, THREE: THREE };
}

function updateCameraFromControls(instant) {
  const k = instant ? 1 : 0.16;
  CTL.theta += (CTL.tTheta - CTL.theta) * k;
  CTL.phi += (CTL.tPhi - CTL.phi) * k;
  CTL.radius += (CTL.tRadius - CTL.radius) * k;
  CTL.target.lerp(CTL.tTarget, k);
  const sp = Math.sin(CTL.phi), cp = Math.cos(CTL.phi);
  CAMERA.position.set(
    CTL.target.x + CTL.radius * sp * Math.sin(CTL.theta),
    CTL.target.y + CTL.radius * cp,
    CTL.target.z + CTL.radius * sp * Math.cos(CTL.theta)
  );
  CAMERA.lookAt(CTL.target);
}

function update(t) {
  const wind = windAt(t);
  const rain = rainAt(t);
  const cloud = cloudAt(t);
  RAIN.intensity = rain;

  // boats first so follow-cameras and perched gulls see the current boat
  updateBoats(t, wind);
  if (STATE.mode === 'export') {
    const tc = tourCameraAt(t);
    CAMERA.position.copy(tc.pos);
    CAMERA.fov = tc.fov;
    CAMERA.updateProjectionMatrix();
    CAMERA.lookAt(tc.target);
  } else {
    updateCameraFromControls(false);
  }

  updateSky(t, wind, rain, cloud);
  updateWater(t, rain, wind);
  updateLife(t, wind);
  updateProps(t, wind);
  updateBuildings(t, wind, rain, cloud);
  updateRain(t, wind);
}

function updateBuildings(t, wind, rain, cloud) {
  // warehouse interior caustics + dust + light shaft
  if (BUILD.warehouseCaustic) {
    BUILD.warehouseCaustic.opacity = 0.20 + 0.14 * cloud + 0.04 * Math.sin(t * 1.1);
  }
  if (TEX.caustic) {
    // water.js already offsets the shared caustic texture; add a slow second drift via rotation of the mesh
    if (BUILD.warehouseCaustic && BUILD.warehouseCaustic.map) {
      BUILD.warehouseCaustic.map.rotation = Math.sin(t * 0.05) * 0.05;
    }
  }
  if (BUILD.shaft) {
    BUILD.shaft.material.uniforms.uOpacity.value = 0.10 + 0.12 * cloud;
  }
  if (BASE.trees) {
    BASE.trees.forEach((tr, i) => {
      const delay = (24 - tr.g.position.x) * 0.05;
      const w = windAt(t - delay);
      tr.g.rotation.z = Math.sin(t * 1.25 + tr.phase) * (0.006 + w * 0.055);
      tr.g.rotation.x = Math.cos(t * 0.95 + tr.phase) * (0.004 + w * 0.032);
    });
  }
  if (BUILD.dust) {
    BUILD.dust.rotation.y = Math.sin(t * 0.05) * 0.02;
    BUILD.dust.position.y = Math.sin(t * 0.11) * 0.05;
  }
  // lighthouse lamp: rare daytime glow
  if (BASE.lampGlow) {
    const cycle = 43;
    const p = ((t % cycle) + cycle) % cycle;
    let on = smoothstep(0.0, 2.0, p) * (1 - smoothstep(8.0, 11.0, p));
    on = Math.max(on, smoothstep(0.45, 0.25, cloud) * 0.7);
    BASE.lampGlow.material.opacity = 0.10 + on * 0.75;
    BASE.lampGlow.scale.setScalar(5.5 + on * 3.0);
    if (BASE.lampLight) BASE.lampLight.intensity = on * 2.2;
    if (BASE.lamp) BASE.lamp.material.opacity = 0.55 + on * 0.45;
  }
}

function updateReflections() {
  const hideA = [WATER.surface].concat(WATER.puddles).concat([WATER.under]);
  renderPlanarReflection(RENDERER, SCENE, CAMERA, {
    cam: WATER.reflCam, rt: WATER.reflRT, texMat: WATER.texMat, planeY: WATER_Y
  }, hideA);
  const hideB = [WATER.surface].concat(WATER.puddles).concat([WATER.under]);
  renderPlanarReflection(RENDERER, SCENE, CAMERA, {
    cam: WATER.pudCam, rt: WATER.pudRT, texMat: WATER.pudTexMat, planeY: WATER.pudPlaneY
  }, hideB);
}

let _frameCount = 0;
function renderFrame() {
  _frameCount++;
  RENDERER.shadowMap.needsUpdate = true;
  // puddle reflection is small and can lag one frame in interactive mode
  const pudEvery = (STATE.mode === 'export') ? 1 : 2;
  if (_frameCount % pudEvery === 0) {
    const hideB = [WATER.surface].concat(WATER.puddles).concat([WATER.under]);
    renderPlanarReflection(RENDERER, SCENE, CAMERA, {
      cam: WATER.pudCam, rt: WATER.pudRT, texMat: WATER.pudTexMat, planeY: WATER.pudPlaneY
    }, hideB);
  }
  const hideA = [WATER.surface].concat(WATER.puddles).concat([WATER.under]);
  renderPlanarReflection(RENDERER, SCENE, CAMERA, {
    cam: WATER.reflCam, rt: WATER.reflRT, texMat: WATER.texMat, planeY: WATER_Y
  }, hideA);
  RENDERER.setRenderTarget(null);
  RENDERER.setClearColor(0xdceff1, 1);
  RENDERER.render(SCENE, CAMERA);
}

function loop(now) {
  requestAnimationFrame(loop);
  if (STATE.mode === 'export') {
    STATE.lastNow = now;
    return;
  }
  let dt = (now - STATE.lastNow) / 1000;
  STATE.lastNow = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);
  STATE.time += dt;

  // idle drift
  if (now - CTL.lastInput > 14000 && !CTL.dragging && !CTL.panning) {
    CTL.tTheta += 0.012 * dt;
  }
  update(STATE.time);
  renderFrame();
}

function setupControls() {
  const el = RENDERER.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => {
    if (e.button === 0) CTL.dragging = true;
    else if (e.button === 2 || e.shiftKey) CTL.panning = true;
    CTL.lastX = e.clientX; CTL.lastY = e.clientY;
    CTL.lastInput = performance.now();
    try { el.setPointerCapture(e.pointerId); } catch (err) { }
  });
  el.addEventListener('pointermove', e => {
    const dx = e.clientX - CTL.lastX;
    const dy = e.clientY - CTL.lastY;
    CTL.lastX = e.clientX; CTL.lastY = e.clientY;
    if (CTL.dragging) {
      CTL.tTheta -= dx * 0.0052;
      CTL.tPhi = clamp(CTL.tPhi - dy * 0.0045, 0.16, 1.45);
      CTL.lastInput = performance.now();
    } else if (CTL.panning) {
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      CAMERA.matrixWorld.extractBasis(right, up, new THREE.Vector3());
      CTL.tTarget.addScaledVector(right, -dx * 0.055);
      CTL.tTarget.addScaledVector(up, dy * 0.055);
      CTL.tTarget.x = clamp(CTL.tTarget.x, -30, 30);
      CTL.tTarget.z = clamp(CTL.tTarget.z, -30, 30);
      CTL.tTarget.y = clamp(CTL.tTarget.y, -2.5, 14);
      CTL.lastInput = performance.now();
    }
  });
  const endDrag = e => {
    CTL.dragging = false; CTL.panning = false;
    try { el.releasePointerCapture(e.pointerId); } catch (err) { }
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('wheel', e => {
    e.preventDefault();
    CTL.tRadius = clamp(CTL.tRadius * Math.exp(e.deltaY * 0.0011), 15, 175);
    CTL.lastInput = performance.now();
  }, { passive: false });

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cap = Math.min(1, 3840 / Math.max(w, h));
    RENDERER.setPixelRatio(Math.max(0.5, dpr * cap));
    RENDERER.setSize(w, h);
    CAMERA.aspect = w / h;
    CAMERA.updateProjectionMatrix();
  });

  // keyboard: R resets view
  window.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
      CTL.tTheta = 0.62; CTL.tPhi = 1.05; CTL.tRadius = 70;
      CTL.tTarget.set(0, 0.6, 0);
    }
  });
}

window.addEventListener('load', function () {
  try {
    init();
  } catch (err) {
    console.error(err);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;color:#345;background:#eaf4f4;font:14px monospace;padding:24px;white-space:pre-wrap';
    d.textContent = '初始化失败: ' + err.message;
    document.body.appendChild(d);
  }
});
