// js/main.js — Application Bootstrapper, Live Loop & Scene Management
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { OrbitCamera } = App.Math;

  class MainApp {
    constructor() {
      this.canvas = document.getElementById('gpu-canvas');
      this.activeScene = 1; // 1 = Jelly Impact, 2 = Wave Tank
      this.paused = false;
      this.speedScale = 1.0;

      this.cam1 = new OrbitCamera({
        target: [0.35, 0.56, 0.0],
        yaw: 0.32,
        pitch: 0.32,
        distance: 5.75,
        fov: 37,
        minDist: 1.8,
        maxDist: 12.0
      });
      this.cam2 = new OrbitCamera({
        target: [0.45, 0.96, 0.0],
        yaw: -0.04,
        pitch: 0.21,
        distance: 8.15,
        fov: 36,
        minDist: 2.2,
        maxDist: 15.0
      });

      this.gpu = null;
      this.scene1 = null;
      this.renderer1 = null;
      this.scene2 = null;
      this.renderer2 = null;
      this.ui = null;
      this.lastTime = 0;

      // Register window.videoExport synchronously before async WebGPU init completes
      this._resolveReady = null;
      this.readyPromise = new Promise((resolve) => { this._resolveReady = resolve; });
      this.demos = new App.Demos.DemoController(this);

      this.init().catch((err) => {
        console.error(err);
        const banner = document.getElementById('error-banner');
        if (banner) {
          banner.style.display = 'flex';
          banner.querySelector('.err-msg').textContent = err.message || String(err);
        }
      });
    }

    async init() {
      this.gpu = new App.GPU.GPUCore(this.canvas);
      await this.gpu.init();

      // Initialize Scene 1 (Volumetric Tetrahedral Stable Neo-Hookean XPBD + Dynamic Fracture)
      this.scene1 = new App.Scene1Physics();
      this.renderer1 = new App.Scene1Renderer(this.gpu);

      // Initialize Scene 2 (WebGPU Compute 3D APIC/FLIP + Two-Way Spheres + Diffuse Whitewater/Bubbles + Caustics)
      this.scene2 = new App.Scene2Sim(this.gpu);
      this.renderer2 = new App.Scene2Renderer(this.gpu, this.scene2);

      this.ui = new App.UIController(this);

      window.addEventListener('resize', () => {
        if (this.gpu) this.gpu.resize(false);
      });

      // Hide loading overlay
      const loader = document.getElementById('loading-overlay');
      if (loader) loader.classList.add('hidden');

      this._resolveReady();

      // Launch with an immediate lively center impact if not already taken over by videoExport!
      if (!this.demos.isExporting) {
        this.scene1.triggerImpact('center');
      }

      this.lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    getActiveCamera() {
      return this.activeScene === 1 ? this.cam1 : this.cam2;
    }

    switchScene(sceneNum, silent) {
      if (this.activeScene === sceneNum) return;
      this.activeScene = sceneNum;
      if (sceneNum === 1) {
        App.Audio.updateWaveSound(0, 0);
      }
      if (!silent && this.ui) {
        this.ui.syncFromParams();
      }
    }

    renderCurrentScene() {
      if (this.activeScene === 1) {
        this.renderer1.render(this.scene1, this.cam1);
      } else {
        this.renderer2.render(this.cam2);
      }
    }

    _loop(now) {
      requestAnimationFrame((t) => this._loop(t));

      // Yield completely to deterministic frame stepping during videoExport!
      if (this.demos.isExporting) {
        this.lastTime = now;
        return;
      }

      const rawDt = Math.min(0.04, Math.max(0.0, (now - this.lastTime) * 0.001));
      this.lastTime = now;

      this.gpu.resize(false);

      if (!this.paused) {
        const dt = rawDt * this.speedScale;
        if (this.demos.activeDemo) {
          this.demos.updateInteractive(dt);
        } else if (this.activeScene === 1) {
          this.scene1.step(dt);
        } else {
          this.scene2.step(dt, false);
        }
      } else {
        App.Audio.updateWaveSound(0, 0);
      }

      this.renderCurrentScene();
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    App.instance = new MainApp();
  });
})(window);
