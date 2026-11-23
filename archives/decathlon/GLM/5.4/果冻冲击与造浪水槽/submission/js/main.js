'use strict';
/* ---------------------------------------------------------------------------
   App: owns the device, renderer, scenes, loop and camera input
--------------------------------------------------------------------------- */

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.gfx = new Gfx(this.canvas);
    this.R = new Renderer(this.gfx);
    this.audio = new AudioEngine();
    this.paused = false;
    this.timeScale = 1;
    this.sceneId = 1;
    this.camMode = 'free';
    this.shakeAmt = 0;
    this.lastT = 0;
    this.acc = 0;
    this.fps = 0;
    this.exporting = false;
  }

  async init() {
    await this.gfx.init();
    await this.R.init();
    this.scene1 = new SceneJelly(this);
    this.scene2 = new SceneTank(this);
    await this.scene2.init();
    this.scene = this.scene1;
    this.R.cam.set([2.55, 1.85, 3.35], [0.02, 0.52, 0.0], (40 * Math.PI) / 180);
    this.R.cam.snap();
    this.bindInput();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.lastT = performance.now() * 0.001;
    requestAnimationFrame((t) => this.loop(t));
    return this;
  }

  onResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gfx.resize(window.innerWidth, window.innerHeight, dpr);
    this.R.setSize(this.gfx.width, this.gfx.height);
  }

  setScene(n) {
    if (n !== 1 && n !== 2) return;
    this.sceneId = n;
    this.scene = n === 1 ? this.scene1 : this.scene2;
    if (this.ui) this.ui.onSceneChange(n);
    if (n === 1) {
      this.R.cam.set([2.55, 1.85, 3.35], [0.02, 0.52, 0.0], (40 * Math.PI) / 180);
    } else {
      this.scene2.setCameraHome();
    }
    this.camMode = 'free';
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  bindInput() {
    const c = this.canvas;
    let dragging = false, panning = false, lx = 0, ly = 0;
    c.addEventListener('pointerdown', (e) => {
      this.audio.ensure();
      dragging = e.button === 0; panning = e.button === 2;
      lx = e.clientX; ly = e.clientY;
      c.setPointerCapture(e.pointerId);
      if (this.app) this.camMode = 'free';
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragging && !panning) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragging) this.R.cam.orbit(dx, dy);
      else if (panning) this.R.cam.pan(dx, dy);
      this.camMode = 'free';
      if (this.ui) this.ui.demoCameraOff();
    });
    const up = (e) => { dragging = false; panning = false; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.R.cam.zoom(e.deltaY * 0.002);
      this.camMode = 'free';
    }, { passive: false });
    // first gesture unlocks audio
    const unlock = () => { this.audio.ensure(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
  }

  loop(t) {
    const now = t * 0.001;
    let dt = clamp(now - this.lastT, 0, 0.05);
    this.lastT = now;
    this.fps = this.fps * 0.92 + (1 / Math.max(dt, 1e-4)) * 0.08;

    if (!this.exporting) {
      const sdt = this.paused ? 0 : dt * this.timeScale;
      if (sdt > 0) {
        // fixed-ish stepping for the soft body
        let rem = sdt;
        const maxStep = 1 / 60;
        let guard = 0;
        while (rem > 1e-6 && guard++ < 8) {
          const h = Math.min(maxStep, rem);
          this.scene.update(h);
          rem -= h;
        }
      }
      this.R.cam.update(dt);
      this.updateCameraShake(dt);
      if (this.ui) this.ui.tick(dt);
    }
    this.render();
    requestAnimationFrame((tt) => this.loop(tt));
  }

  updateCameraShake(dt) {
    if (this.shakeAmt > 1e-5) {
      this.shakeAmt *= Math.exp(-9 * dt);
      if (this.shakeAmt < 1e-4) this.shakeAmt = 0;
    }
  }

  render() {
    const g = this.gfx, R = this.R;
    R.time = this.scene.time;
    // camera shake
    const sh = this.shakeAmt;
    if (sh > 0) {
      R.cam.pos[0] += (Math.random() - 0.5) * sh;
      R.cam.pos[1] += (Math.random() - 0.5) * sh;
      R.cam.pos[2] += (Math.random() - 0.5) * sh;
    }
    const enc = g.device.createCommandEncoder();
    const out = this.scene.render(R, enc);
    R.uploadGlobals(this.scene);
    const post = enc.beginRenderPass({
      colorAttachments: [{
        view: g.context.getCurrentTexture().createView(),
        loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    const bg = g.device.createBindGroup({
      layout: R.bglPost,
      entries: [
        { binding: 0, resource: { buffer: R.globalsBuf } },
        { binding: 1, resource: out.finalView },
        { binding: 2, resource: R.samplerLin },
      ],
    });
    drawFullscreen(post, R.pipePost, bg);
    post.end();
    g.device.queue.submit([enc.finish()]);
  }
}

window.addEventListener('load', async () => {
  const app = new App();
  window.__app = app;
  try {
    await app.init();
    app.ui = new UI(app);
    app.ui.init();
    app.demos = new Demos(app);
    window.videoExport = app.demos.api;
    console.log('[app] ready');
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;background:#0a0e14;font:14px sans-serif;z-index:99;padding:40px;line-height:1.8">
        <div><h2 style="color:#ff7a90">初始化失败</h2><p>${e.message}</p><p style="color:#889">需要支持 WebGPU 的 Chrome 浏览器。</p></div></div>`);
  }
});
