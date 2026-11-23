/* main.js — 启动、场景管理、主循环、交互 */
(function () {
  const App = (window.App = window.App || {});
  const { el, M4, V3 } = App.util;

  const engine = (App.engine = {
    renderer: null,
    canvas: null,
    camera: null,
    scene: null,
    sceneName: 'jelly',
    playing: true,
    timeScale: 1,
    slowMo: false,
    time: 0,
    lastT: 0,
    sound: true,
    demos: null,
    fps: 60,
    _acc: 0,
    _frames: 0,
  });

  // ---------- 测试场景（后续替换为真实场景） ----------
  class TestScene {
    constructor(renderer) {
      this.renderer = renderer;
      this.camera = new App.util.OrbitCamera();
      this.camera.target = new Float32Array([0, 0.25, 0]);
      this.camera.distance = 2.2;
      this.camera.yaw = -0.7;
      this.camera.pitch = 0.35;
      this.floor = renderer.createMesh(App.PRIM.primBox(6, 0.1, 6));
      this.ball = renderer.createMesh(App.PRIM.primSphere(0.22, 32));
      this.box = renderer.createMesh(App.PRIM.primBox(0.4, 0.4, 0.4));
      this.t = 0;
      renderer.shadowExtent = 1.6;
      renderer.shadowCenter = new Float32Array([0, 0.2, 0]);
      renderer.setLight([0.55, 0.95, 0.42], [1.0, 0.96, 0.88, 1.0]);
      renderer.setAmbient([0.30, 0.42, 0.60, 1.0], [0.10, 0.11, 0.14, 1.0]);
    }
    reset() { this.t = 0; }
    update(dt) { this.t += dt; }
    render(renderer) {
      renderer.setTime(this.t);
      renderer.begin(this.camera);
      renderer.endShadow();
      const pass = renderer.beginMain();
      const I = null;
      renderer.drawMesh(pass, this.floor, I, [0.34, 0.36, 0.40, 1], [0.85, 0.0, 1, App.RENDER_MODE.FLOOR], [0, 0, 0, 0]);
      const m = M4.create();
      M4.multiply(m, M4.translation(0, 0.25 + Math.sin(this.t * 2) * 0.08, 0), M4.scaling(1, 1, 1));
      renderer.drawMesh(pass, this.ball, m, [0.85, 0.35, 0.3, 1], [0.25, 0.75, 1, App.RENDER_MODE.OPAQUE], [0, 0, 0, 0]);
      const m2 = M4.create();
      M4.multiply(m2, M4.translation(0.7, 0.2, 0.3), M4.scaling(1, 1, 1));
      renderer.drawMesh(pass, this.box, m2, [0.3, 0.7, 0.5, 1], [0.5, 0.0, 1, App.RENDER_MODE.OPAQUE], [0, 0, 0, 0]);
      renderer.finishMainAndCopy();
      const tp = renderer.beginTransparent();
      renderer.end();
    }
  }

  // ---------- 初始化 ----------
  async function boot() {
    const canvas = document.getElementById('view');
    engine.canvas = canvas;
    const status = document.getElementById('load-text');
    try {
      status.textContent = '正在初始化 WebGPU…';
      const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr0));
      canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr0));
      const renderer = new App.Renderer();
      await renderer.create(canvas);
      engine.renderer = renderer;
      engine.camera = new App.util.OrbitCamera();

      status.textContent = '正在搭建场景…';
      await frame();

      // 场景注册
      App.scenes = App.scenes || {};
      setupUI();
      resize();
      window.addEventListener('resize', resize);
      setupPointer();
      setScene('jelly');

      document.getElementById('loading').classList.add('hidden');
      engine.lastT = performance.now();
      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('fatal').classList.remove('hidden');
      document.getElementById('fatal-text').textContent = String(e && e.message || e);
    }
  }

  function resize() {
    const c = engine.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(c.clientWidth * dpr));
    const h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      engine.renderer.resize(w, h);
    }
  }

  function setScene(name) {
    engine.sceneName = name;
    const def = App.scenes[name];
    if (!def) return;
    engine.scene = def.create(engine.renderer);
    engine.scene.name = name;
    engine.time = 0;
    document.querySelectorAll('.scene-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.scene === name));
    buildPanel();
    buildActions();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - engine.lastT) / 1000;
    engine.lastT = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    engine.fps = engine.fps * 0.92 + (1 / Math.max(dt, 1e-4)) * 0.08;
    const scene = engine.scene;
    if (!scene) return;
    if (engine.playing) {
      const scale = engine.slowMo ? 0.22 : 1.0;
      scene.update(dt * scale);
      engine.time += dt * scale;
    }
    try {
      scene.render(engine.renderer);
    } catch (e) {
      console.error('render error', e);
    }
  }
  function frame() { return new Promise(r => requestAnimationFrame(() => r())); }

  // ---------- UI ----------
  function setupUI() {
    document.querySelectorAll('.scene-tabs .tab').forEach(b => {
      b.addEventListener('click', () => setScene(b.dataset.scene));
    });
    document.getElementById('btn-play').addEventListener('click', () => {
      engine.playing = !engine.playing;
      document.getElementById('btn-play').textContent = engine.playing ? '暂停' : '继续';
    });
    document.getElementById('btn-slow').addEventListener('click', () => {
      engine.slowMo = !engine.slowMo;
      document.getElementById('btn-slow').textContent = engine.slowMo ? '慢放 0.2x' : '慢放 1x';
      document.getElementById('btn-slow').classList.toggle('on', engine.slowMo);
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (engine.scene && engine.scene.reset) engine.scene.reset();
    });
    document.getElementById('btn-sound').addEventListener('click', () => {
      engine.sound = !engine.sound;
      if (App.audio) App.audio.setEnabled(engine.sound);
      document.getElementById('btn-sound').textContent = engine.sound ? '音效 开' : '音效 关';
      document.getElementById('btn-sound').classList.toggle('off', !engine.sound);
    });
    document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help').classList.remove('hidden'));
    document.getElementById('help-close').addEventListener('click', () => document.getElementById('help').classList.add('hidden'));
    document.getElementById('panel-collapse').addEventListener('click', () => {
      const b = document.getElementById('panel-body');
      const hidden = b.classList.toggle('hidden');
      document.getElementById('panel-collapse').textContent = hidden ? '+' : '—';
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); document.getElementById('btn-play').click(); }
      else if (e.key === 'r' || e.key === 'R') { if (engine.scene && engine.scene.reset) engine.scene.reset(); }
      else if (e.key === 's' || e.key === 'S') { document.getElementById('btn-slow').click(); }
      else if (e.key === '1') setScene('jelly');
      else if (e.key === '2') setScene('tank');
    });
    // 演示由 demos.js 注入
    if (App.demos) App.demos.attach();
  }

  function buildPanel() {
    const body = document.getElementById('panel-body');
    body.innerHTML = '';
    const scene = engine.scene;
    if (scene && scene.buildPanel) scene.buildPanel(body);
    document.getElementById('panel-title').textContent = (App.scenes[engine.sceneName] || {}).title || '参数';
  }

  function buildActions() {
    const box = document.getElementById('actions');
    box.innerHTML = '';
    const scene = engine.scene;
    if (scene && scene.buildActions) scene.buildActions(box);
  }

  // ---------- 指针交互 ----------
  function setupPointer() {
    const c = engine.canvas;
    let drag = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, b: e.button, yaw: 0, pitch: 0, target: null };
      const cam = engine.scene && engine.scene.camera;
      if (cam) { drag.yaw = cam.yaw; drag.pitch = cam.pitch; drag.target = cam.target.slice(); }
    });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const cam = engine.scene && engine.scene.camera;
      if (!cam) return;
      if (drag.b === 0) {
        cam.yaw = drag.yaw - dx * 0.006;
        cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + dy * 0.006));
      } else {
        const s = cam.distance * 0.0016;
        const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
        cam.target[0] = drag.target[0] - (dx * cy) * s * -1 + 0;
        cam.target[2] = drag.target[2] - (dx * sy) * s;
        cam.target[1] = drag.target[1] + dy * s;
      }
    });
    const up = (e) => { drag = null; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cam = engine.scene && engine.scene.camera;
      if (!cam) return;
      cam.distance = Math.max(0.35, Math.min(12, cam.distance * Math.exp(e.deltaY * 0.0011)));
    }, { passive: false });
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
