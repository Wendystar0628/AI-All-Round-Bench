'use strict';
/* 启动、相机控制、主循环 */
class OrbitRig {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.target = new V3(0, 0.6, 0); this.tgtD = this.target.clone();
    this.az = 0.62; this.el = 0.42; this.dist = 39;
    this.azD = this.az; this.elD = this.el; this.distD = this.dist;
    this.drag = null; this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new V3(0, 1, 0), -0.9);
    this.mouse = new THREE.Vector2(); this.lastInput = 0;
    const el = dom;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, mode: (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rot' };
    });
    el.addEventListener('pointermove', e => {
      this.updateMouse(e);
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.lastInput = performance.now();
      if (this.drag.mode === 'rot') {
        this.azD -= dx * 0.0058; this.elD = clamp(this.elD + dy * 0.0050, -0.12, 1.5);
      } else {
        const k = this.distD * 0.0011;
        const right = new V3(Math.cos(this.az), 0, -Math.sin(this.az)), fwd = new V3(-Math.sin(this.az), 0, -Math.cos(this.az));
        this.tgtD.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
        this.clampTarget();
      }
    });
    const up = e => { this.drag = null; try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      e.preventDefault(); this.updateMouse(e); this.lastInput = performance.now();
      const f = Math.exp(clamp(e.deltaY, -240, 240) * 0.0014);
      const nd = clamp(this.distD * f, 2.0, 78);
      // 朝光标位置推近
      this.ray.setFromCamera(this.mouse, this.cam);
      const hit = new V3();
      if (this.ray.ray.intersectPlane(this.plane, hit)) {
        const frac = 1 - nd / this.distD;
        if (frac > 0) this.tgtD.lerp(hit, frac * 0.75);
        else this.tgtD.lerp(new V3(0, 0.6, 0), clamp(-frac * 0.35, 0, 0.3));
      }
      this.distD = nd; this.clampTarget();
    }, { passive: false });
    el.addEventListener('dblclick', e => {
      this.updateMouse(e); this.ray.setFromCamera(this.mouse, this.cam);
      const hit = new V3();
      if (this.ray.ray.intersectPlane(this.plane, hit)) { this.tgtD.copy(hit); this.distD = Math.min(this.distD, 14); this.clampTarget(); }
    });
  }
  updateMouse(e) { const r = this.dom.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  clampTarget() { const t = this.tgtD; t.x = clamp(t.x, -15, 15); t.z = clamp(t.z, -15, 15); t.y = clamp(t.y, -2.5, 6); }
  update(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.az += (this.azD - this.az) * k; this.el += (this.elD - this.el) * k; this.dist += (this.distD - this.dist) * k;
    this.target.lerp(this.tgtD, k);
    const ce = Math.cos(this.el);
    this.cam.position.set(this.target.x + Math.sin(this.az) * ce * this.dist, this.target.y + Math.sin(this.el) * this.dist, this.target.z + Math.cos(this.az) * ce * this.dist);
    if (this.cam.position.y < -2.2) this.cam.position.y = -2.2;
    this.cam.lookAt(this.target);
    this.cam.near = clamp(this.dist * 0.04, 0.08, 1.2); this.cam.far = 420; this.cam.updateProjectionMatrix();
  }
}

(function main() {
  const T0 = performance.now();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
  // 内部缓冲分辨率：至少 1.35 倍超采样，但总像素不超过约 480 万，避免在超大屏上占满显存
  const calcPR = () => { const w = window.innerWidth, h = window.innerHeight; const want = Math.min(2, Math.max(1.35, window.devicePixelRatio || 1)); const cap = Math.sqrt(4.8e6 / Math.max(1, w * h)); return Math.max(1.0, Math.min(want, cap)); };
  renderer.setPixelRatio(calcPR());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.autoClear = false;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.2, 420);
  camera.layers.enableAll();

  window.APP = { renderer, scene, camera, Env, U, MAT };
  initMaterials();
  setupEnvironment(scene, renderer);
  const sky = makeSky(); scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color('#e4f3f0'), 40, 125);

  const reflW = new Reflector(SEA_Y, 0.5, 0.0), reflP = new Reflector(QH, 0.6, 0.045);
  window.REFL = { reflW, reflP };

  // 场景内容
  buildBase(scene);
  const builders = ['buildWater', 'buildBoats', 'buildBuildings', 'buildTerrain', 'buildProps', 'buildCreatures', 'buildWeather'];
  for (const b of builders) { if (typeof window[b] === 'function') { try { window[b](scene, { reflW, reflP }); } catch (err) { console.error(b, err); } } }

  // 注册参与轮廓线的网格
  scene.traverse(o => {
    if (o.isMesh && !o.material.isShaderMaterial && o.layers.isEnabled(LAYER.WORLD)) ALL_MESHES.push(o);
  });

  const rig = new OrbitRig(camera, renderer.domElement);
  let fitAspect = -1;
  const fitDist = () => { if (!rig.lastInput && Math.abs(camera.aspect - fitAspect) > 0.03) { fitAspect = camera.aspect; const d = 39 * Math.max(1, 1.72 / camera.aspect); rig.distD = rig.dist = Math.min(d, 70); } };
  fitDist();
  const pipe = new Pipeline(renderer, scene, camera, [reflW, reflP]);
  pipe.resize();
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(calcPR()); renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    pipe.resize(); fitDist();
  });
  APP.rig = rig; APP.pipe = pipe;

  // 导出专用入口；普通浏览不经过这里，保持原来的相机与动画循环。
  window.HarborVideoExport.attach({
    advance(dt, time) {
      Env.t = time - dt;
      updateEnv(dt);
      for (const s of Systems) s(dt, Env.t);
    },
    render(position, target) {
      camera.position.fromArray(position); camera.lookAt(new V3(...target));
      const distance = camera.position.distanceTo(new V3(...target));
      camera.near = 0.06; camera.far = 420; camera.updateProjectionMatrix();
      const fn = Math.max(42, distance * 1.15);
      scene.fog.near = fn; scene.fog.far = fn + 85; U.uFogNear.value = fn;
      sky.position.copy(camera.position);
      pipe.render();
      renderer.getContext().finish();
    },
    aim(position, target) {
      camera.position.fromArray(position); camera.lookAt(new V3(...target));
    }
  });

  if (window.HarborVideoExport.isExportView) return;

  console.log('场景构建耗时 ' + (performance.now() - T0).toFixed(0) + ' ms');
  let last = performance.now(), frame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (window.HarborVideoExport.paused) { last = now; return; }
    let dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (window.__freeze) dt = 0;
    if (window.__ts) dt *= window.__ts;
    try { updateEnv(dt); } catch (e) { if (!loop._e1) { loop._e1 = 1; console.error(e); } }
    for (const s of Systems) { try { s(dt, Env.t); } catch (e) { if (!s._err) { s._err = 1; console.error(e); } } }
    rig.update(dt);
    { const fn = Math.max(42, rig.dist * 1.15); scene.fog.near = fn; scene.fog.far = fn + 85; U.uFogNear.value = fn; }
    sky.position.copy(camera.position);
    try { pipe.render(); } catch (e) { if (!loop._e2) { loop._e2 = 1; console.error(e); } }
    frame++;
    if (frame === 1) { APP.renderer.getContext().finish(); console.log('首帧完成(含着色器编译)耗时 ' + (performance.now() - T0).toFixed(0) + ' ms'); }
  }
  requestAnimationFrame(loop);
})();
