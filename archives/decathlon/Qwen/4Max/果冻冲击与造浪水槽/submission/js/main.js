/* 主循环 / 场景管理 / 相机控制 */
'use strict';
const App = {
  DT: 1 / 120,
  scene: null, renderer: null,
  paused: false, slow: false, exportMode: false,
  acc: 0, lastT: -1, fps: 60, fpsSmooth: 60,
  simSteps: 0,
  async init() {
    const canvas = document.getElementById('view');
    await GFX.init(canvas);
    FL.init();
    this.renderer = new Renderer();
    Scene1.init();
    Scene2.init();
    this.scene = Scene1;
    this.resizeCanvas(false);
    window.addEventListener('resize', () => this.resizeCanvas(this.exportMode));
    this.bindCamera(canvas);
    UI.init();
    document.getElementById('loading').style.display = 'none';
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },
  resizeCanvas(forExport) {
    const canvas = GFX.canvas;
    const dpr = forExport ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(64, Math.floor(window.innerWidth * dpr));
    const h = Math.max(64, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      GFX.configureCanvas();
      if (this.renderer) this.renderer.resize(w, h);
    }
  },
  switchScene(idx, silent) {
    this.scene = idx === 0 ? Scene1 : Scene2;
    this.acc = 0;
    if (!silent) {
      UI.syncScene();
      UI.toast(idx === 0 ? '场景一 · 重球冲击果冻' : '场景二 · 多密度球与造浪水槽');
    }
  },
  drainEvents(sc) {
    for (const ev of sc.events) {
      Snd.handle(ev);
      if (ev.type === 'crack') this.renderer.shake = Math.min(1, this.renderer.shake + 0.5 * ev.intensity);
      if (ev.type === 'jellyImpact') this.renderer.shake = Math.min(0.7, this.renderer.shake + 0.16 * ev.intensity);
      if (ev.type === 'floorHit') this.renderer.shake = Math.min(0.5, this.renderer.shake + 0.08 * ev.intensity);
    }
    sc.events.length = 0;
  },
  async stepReal(dt) {
    if (Demos.active) {
      const st = Demos.active;
      const nt = st.demoTime + dt;
      if (nt >= st.def.duration) {
        await Demos.advanceTo(st.def.duration);
        this.finishDemo();
      } else {
        await Demos.advanceTo(nt);
      }
      return;
    }
    if (this.paused) return;
    this.acc += dt * (this.slow ? 0.25 : 1);
    let n = 0;
    while (this.acc >= this.DT && n < 5) {
      await this.scene.step(this.DT);
      this.acc -= this.DT; n++;
      this.drainEvents(this.scene);
    }
    if (n >= 5) this.acc = 0;
    if (this.scene === Scene2) {
      Snd.updateWave(Scene2.wave.env, Scene2.wave.amp, Scene2.wave.env * Scene2.wave.amp * 6);
    } else {
      Snd.updateWave(0, 0, 0);
    }
  },
  renderOnce() {
    const draw = this.scene.buildDraw(this.renderer);
    this.renderer.render(draw);
  },
  async loop(t) {
    if (this.exportMode) { this.lastT = t; requestAnimationFrame((tt) => this.loop(tt)); return; }
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (dt > 0.1) dt = 0.1;
    if (dt > 0) this.fpsSmooth = this.fpsSmooth * 0.95 + (1 / dt) * 0.05;
    const t0 = performance.now();
    try {
      await this.stepReal(dt);
      this.renderOnce();
      UI.updateStatus(this.fpsSmooth, performance.now() - t0);
      if (Demos.active) UI.updateDemoProgress();
    } catch (e) {
      console.error('loop error:', e);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  },
  startDemo(id) {
    if (this.exportMode) return;
    Snd.ensure();
    Demos.begin(id);
    this.paused = false;
    UI.showDemoUI(Demos.active.def);
    UI.toast('演示 · ' + Demos.active.def.title);
  },
  finishDemo() {
    const def = Demos.active ? Demos.active.def : null;
    Demos.end();
    UI.hideDemoUI();
    if (def) UI.toast('演示结束 · ' + def.title + '（可继续操作）');
  },
  exitDemo() {
    Demos.end();
    UI.hideDemoUI();
    UI.toast('已退出演示');
  },
  enterExport() {
    this.exportMode = true;
    Snd.exportMode = true;
    document.body.classList.add('exporting');
  },
  exitExport() {
    this.exportMode = false;
    Snd.exportMode = false;
    document.body.classList.remove('exporting');
    Demos.end();
    UI.hideDemoUI();
    this.scene.reset();
    this.acc = 0;
    this.paused = false;
    const cam = this.scene === Scene1 ? { pos: [2.7, 1.75, 3.3], target: [0, 0.32, 0], fov: 40 } : { pos: [2.7, 1.75, 3.5], target: [0, 0.32, 0], fov: 42 };
    this.scene.camera.pos = cam.pos; this.scene.camera.target = cam.target; this.scene.camera.fov = cam.fov;
    this.resizeCanvas(false);
    UI.syncScene();
    this.lastT = performance.now();
  },
  resetScene() {
    if (Demos.active) this.exitDemo();
    this.scene.reset();
    this.acc = 0;
    UI.toast('已重置');
  },
  rerun() {
    if (Demos.active) this.exitDemo();
    this.scene.reset();
    this.acc = 0;
    if (this.scene === Scene1) Scene1.trigger('center');
    else { Scene2.dropBalls(); Scene2.startWave(); }
    UI.toast('重新运行');
  },
  bindCamera(canvas) {
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (Demos.active || this.exportMode) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      const cam = this.scene.camera;
      const off = [cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]];
      let r = Math.hypot(off[0], off[1], off[2]) || 1;
      let theta = Math.atan2(off[0], off[2]);
      let phi = Math.acos(clamp(off[1] / r, -1, 1));
      theta -= dx * 0.005;
      phi = clamp(phi - dy * 0.004, 0.12, 1.50);
      cam.pos = [
        cam.target[0] + r * Math.sin(phi) * Math.sin(theta),
        cam.target[1] + r * Math.cos(phi),
        cam.target[2] + r * Math.sin(phi) * Math.cos(theta)
      ];
    });
    const up = () => { dragging = false; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      if (Demos.active || this.exportMode) return;
      e.preventDefault();
      const cam = this.scene.camera;
      const off = [cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]];
      let r = Math.hypot(off[0], off[1], off[2]) || 1;
      r = clamp(r * Math.exp(e.deltaY * 0.0012), 1.0, 10);
      const s = r / Math.hypot(off[0], off[1], off[2]);
      cam.pos = [cam.target[0] + off[0] * s, cam.target[1] + off[1] * s, cam.target[2] + off[2] * s];
    }, { passive: false });
  }
};
window.App = App;
window.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error(err);
    const el = document.getElementById('loading');
    el.innerHTML = '<div class="load-box"><h2>无法启动</h2><p>' + (err && err.message ? err.message : err) + '</p><p class="dim">需要支持 WebGPU 的 Chrome 浏览器。</p></div>';
  });
});
