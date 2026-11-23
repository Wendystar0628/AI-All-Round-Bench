// js/ui.js — Simplified Chinese Studio HUD, Orbit Camera Controls & Live Physics Parameter Bindings
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { clamp } = App.Math;

  class UIController {
    constructor(app) {
      this.app = app;
      this.lastScene1Action = 'center';
      this.lastDemoId = null;
      this._bindDOM();
      this._bindPointerCamera();
      this._bindKeyboard();
      this.syncFromParams();
    }

    _el(id) { return document.getElementById(id); }

    _bindDOM() {
      const app = this.app;

      // Unlock Web Audio on first user interaction anywhere in page
      const unlockAudio = () => App.Audio.unlock();
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });

      // Scene Switcher
      this._el('btn-scene-1').addEventListener('click', () => {
        app.demos.stopDemo();
        app.switchScene(1);
        this.syncFromParams();
      });
      this._el('btn-scene-2').addEventListener('click', () => {
        app.demos.stopDemo();
        app.switchScene(2);
        this.syncFromParams();
      });

      // Four Preset Demos
      document.querySelectorAll('[data-demo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const runId = btn.getAttribute('data-demo');
          this.lastDemoId = runId;
          app.paused = false;
          app.demos.startDemo(runId, false);
          this.syncFromParams();
        });
      });

      // Audio Toggle
      const btnAudio = this._el('btn-audio');
      btnAudio.addEventListener('click', () => {
        App.Audio.unlock();
        const next = !App.Audio.enabled;
        App.Audio.setEnabled(next);
        btnAudio.textContent = next ? '音效：开' : '音效：关';
        btnAudio.classList.toggle('is-muted', !next);
      });

      // Drawer Collapse Toggle
      const drawer = this._el('control-drawer');
      const btnToggle = this._el('btn-toggle-panel');
      btnToggle.addEventListener('click', () => {
        const collapsed = drawer.classList.toggle('collapsed');
        btnToggle.textContent = collapsed ? '展开面板' : '收起面板';
      });

      // Playback Dock
      this._el('btn-pause').addEventListener('click', () => {
        app.paused = !app.paused;
        this.syncPlaybackUI();
      });

      document.querySelectorAll('[data-speed]').forEach((btn) => {
        btn.addEventListener('click', () => {
          app.speedScale = parseFloat(btn.getAttribute('data-speed')) || 1.0;
          this.syncPlaybackUI();
        });
      });

      this._el('btn-reset').addEventListener('click', () => {
        app.demos.stopDemo();
        this.lastDemoId = null;
        if (app.activeScene === 1) {
          app.scene1.reset();
        } else {
          app.scene2.reset({ waveRunning: false, dropMode: 'interactive' });
        }
        this.syncFromParams();
      });

      this._el('btn-rerun').addEventListener('click', () => {
        app.paused = false;
        if (app.demos.activeDemo) {
          app.demos.startDemo(app.demos.activeDemo.id, false);
        } else if (this.lastDemoId && App.Demos.DEMOS[this.lastDemoId].scene === app.activeScene) {
          app.demos.startDemo(this.lastDemoId, false);
        } else if (app.activeScene === 1) {
          app.scene1.reset();
          app.scene1.triggerImpact(this.lastScene1Action || 'center');
        } else {
          const wasWave = app.scene2.waveRunning;
          app.scene2.reset({ waveRunning: wasWave, dropMode: 'interactive' });
        }
        this.syncFromParams();
      });

      // --- Scene 1 Controls ---
      const triggerS1 = (mode) => {
        app.demos.stopDemo();
        this.lastDemoId = null;
        this.lastScene1Action = mode;
        app.paused = false;
        app.scene1.triggerImpact(mode);
        this.syncPlaybackUI();
      };
      this._el('btn-s1-center').addEventListener('click', () => triggerS1('center'));
      this._el('btn-s1-offset').addEventListener('click', () => triggerS1('offset'));
      this._el('btn-s1-multi').addEventListener('click', () => triggerS1('multi'));
      this._el('btn-s1-all').addEventListener('click', () => triggerS1('all'));

      this._bindSlider('sl-stiffness', 'val-stiffness', (v) => {
        app.scene1.params.stiffness = v;
      }, (v) => v.toFixed(2) + '×');

      this._bindSlider('sl-toughness', 'val-toughness', (v) => {
        app.scene1.params.toughness = v;
      }, (v) => Math.round(v * 100) + '%');

      this._bindSlider('sl-ball-mass', 'val-ball-mass', (v) => {
        app.scene1.params.ballMass = v;
      }, (v) => v.toFixed(1) + ' kg');

      this._bindSlider('sl-drop-height', 'val-drop-height', (v) => {
        app.scene1.params.dropHeight = v;
      }, (v) => v.toFixed(2) + ' m');

      // --- Scene 2 Controls ---
      this._el('btn-s2-wave-start').addEventListener('click', () => {
        app.demos.stopDemo();
        app.paused = false;
        app.scene2.setWaveRunning(true);
        this.syncFromParams();
      });
      this._el('btn-s2-wave-stop').addEventListener('click', () => {
        app.demos.stopDemo();
        app.scene2.setWaveRunning(false);
        this.syncFromParams();
      });
      this._el('btn-s2-drop').addEventListener('click', () => {
        app.demos.stopDemo();
        app.paused = false;
        app.scene2.dropSpheres('interactive');
        this.syncPlaybackUI();
      });

      this._bindSlider('sl-wave-amp', 'val-wave-amp', (v) => {
        app.scene2.params.waveAmplitude = v;
      }, (v) => Math.round((v / 0.44) * 100) + '%');

      this._bindSlider('sl-wave-freq', 'val-wave-freq', (v) => {
        app.scene2.params.waveFrequency = v;
      }, (v) => v.toFixed(2) + ' Hz');

      for (let g = 0; g < 4; g++) {
        this._bindSlider('sl-rho-' + g, 'val-rho-' + g, (v) => {
          app.scene2.params.groupDensities[g] = v;
        }, (v) => v.toFixed(2));
      }
    }

    _bindSlider(sliderId, labelId, onInput, formatFn) {
      const sl = this._el(sliderId);
      const lb = this._el(labelId);
      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        onInput(v);
        lb.textContent = formatFn(v);
      });
    }

    _bindPointerCamera() {
      const canvas = this.app.canvas;
      let dragMode = 0; // 1 = orbit, 2 = pan
      let lastX = 0, lastY = 0;

      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => {
        if (this.app.demos.isExporting) return;
        // User manual drag takes over camera cleanly if demo was moving camera
        const cam = this.app.getActiveCamera();
        cam.clearOverride();
        dragMode = (e.button === 2 || e.shiftKey) ? 2 : 1;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!dragMode || this.app.demos.isExporting) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        const cam = this.app.getActiveCamera();

        if (dragMode === 1) {
          cam.yaw -= dx * 0.0065;
          cam.pitch = clamp(cam.pitch + dy * 0.0055, 0.04, 1.38);
        } else {
          const panScale = cam.distance * 0.0014;
          const rightX = Math.cos(cam.yaw), rightZ = -Math.sin(cam.yaw);
          cam.target[0] -= rightX * dx * panScale;
          cam.target[2] -= rightZ * dx * panScale;
          cam.target[1] = clamp(cam.target[1] + dy * panScale, -0.5, 3.0);
        }
      });

      const endDrag = (e) => {
        if (dragMode) {
          dragMode = 0;
          try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);

      canvas.addEventListener('wheel', (e) => {
        if (this.app.demos.isExporting) return;
        e.preventDefault();
        const cam = this.app.getActiveCamera();
        cam.clearOverride();
        cam.distance = clamp(cam.distance * Math.exp(e.deltaY * 0.001), cam.minDist, cam.maxDist);
      }, { passive: false });
    }

    _bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        if (this.app.demos.isExporting) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.app.paused = !this.app.paused;
          this.syncPlaybackUI();
        } else if (e.key === 'r' || e.key === 'R') {
          this._el('btn-reset').click();
        } else if (e.key === '1') {
          this._el('btn-scene-1').click();
        } else if (e.key === '2') {
          this._el('btn-scene-2').click();
        }
      });
    }

    setDemoBadge(label) {
      const badge = this._el('demo-status-badge');
      if (label) {
        badge.textContent = '演示中 · ' + label;
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
      document.querySelectorAll('[data-demo]').forEach((btn) => {
        const active = this.app.demos.activeDemo && btn.getAttribute('data-demo') === this.app.demos.activeDemo.id;
        btn.classList.toggle('active', !!active);
      });
    }

    syncPlaybackUI() {
      const btnPause = this._el('btn-pause');
      btnPause.textContent = this.app.paused ? '继续' : '暂停';
      btnPause.classList.toggle('is-paused', this.app.paused);

      document.querySelectorAll('[data-speed]').forEach((btn) => {
        const sp = parseFloat(btn.getAttribute('data-speed'));
        btn.classList.toggle('active', Math.abs(sp - this.app.speedScale) < 0.02);
      });
    }

    syncFromParams() {
      const app = this.app;
      const isS1 = app.activeScene === 1;
      this._el('btn-scene-1').classList.toggle('active', isS1);
      this._el('btn-scene-2').classList.toggle('active', !isS1);
      this._el('panel-scene-1').style.display = isS1 ? 'block' : 'none';
      this._el('panel-scene-2').style.display = isS1 ? 'none' : 'block';

      // Scene 1 sliders
      const p1 = app.scene1.params;
      this._el('sl-stiffness').value = p1.stiffness;
      this._el('val-stiffness').textContent = p1.stiffness.toFixed(2) + '×';
      this._el('sl-toughness').value = p1.toughness;
      this._el('val-toughness').textContent = Math.round(p1.toughness * 100) + '%';
      this._el('sl-ball-mass').value = p1.ballMass;
      this._el('val-ball-mass').textContent = p1.ballMass.toFixed(1) + ' kg';
      this._el('sl-drop-height').value = p1.dropHeight;
      this._el('val-drop-height').textContent = p1.dropHeight.toFixed(2) + ' m';

      // Scene 2 sliders & wave buttons
      const p2 = app.scene2.params;
      this._el('sl-wave-amp').value = p2.waveAmplitude;
      this._el('val-wave-amp').textContent = Math.round((p2.waveAmplitude / 0.44) * 100) + '%';
      this._el('sl-wave-freq').value = p2.waveFrequency;
      this._el('val-wave-freq').textContent = p2.waveFrequency.toFixed(2) + ' Hz';
      for (let g = 0; g < 4; g++) {
        this._el('sl-rho-' + g).value = p2.groupDensities[g];
        this._el('val-rho-' + g).textContent = p2.groupDensities[g].toFixed(2);
      }
      this._el('btn-s2-wave-start').classList.toggle('primary-active', app.scene2.waveRunning);
      this._el('btn-s2-wave-stop').classList.toggle('primary-active', !app.scene2.waveRunning);

      this.syncPlaybackUI();
    }
  }

  App.UIController = UIController;
})(window);
