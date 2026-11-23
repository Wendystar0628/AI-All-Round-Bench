// js/demos.js — Four Pre-Choreographed Demos & Exact Deterministic window.videoExport API (Section 5)
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { clamp, smoothstep, evalKeyframes } = App.Math;

  const RUN_IDS = ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'];

  // Helper: smooth time-scale envelope built from slow-mo / speed-up intervals
  // Each window: { t0, t1, scale, blend }
  function evalTimeScale(windows, t) {
    let s = 1.0;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const b = w.blend || 0.22;
      const enter = smoothstep(w.t0, w.t0 + b, t);
      const exit = 1.0 - smoothstep(w.t1 - b, w.t1, t);
      const env = enter * exit;
      s += (w.scale - 1.0) * env;
    }
    return Math.max(0.12, s);
  }

  // Integrate videoTime -> exact physics simTime using midpoint quadrature (completely fps-independent!)
  function videoToSimTime(demo, videoT) {
    const steps = 400;
    const clampedT = clamp(videoT, 0, demo.duration);
    if (clampedT <= 0) return 0;
    const dt = clampedT / steps;
    let acc = 0;
    for (let i = 0; i < steps; i++) {
      acc += evalTimeScale(demo.timeWindows, (i + 0.5) * dt) * dt;
    }
    return acc;
  }

  const DEMOS = {
    'jelly-center': {
      id: 'jelly-center',
      label: '正中单击',
      scene: 1,
      duration: 7.2, // <= 8s limit
      simDt: 1 / 120,
      timeWindows: [
        // Deep slow-motion right across peak squash, wide radial bulge, ball cupping & elastic launch!
        { t0: 0.06, t1: 2.30, scale: 0.23, blend: 0.14 },
        { t0: 5.0, t1: 7.2, scale: 1.25, blend: 0.45 }
      ],
      cameraKeys: [
        { t: 0.0, eye: [2.15, 1.95, 4.15], target: [0.0, 0.72, 0.0], fov: 37 },
        { t: 0.65, eye: [1.55, 1.32, 3.25], target: [0.0, 0.56, 0.0], fov: 36 },
        { t: 1.85, eye: [1.10, 1.72, 4.25], target: [0.0, 1.08, 0.0], fov: 40 },
        { t: 3.10, eye: [-1.15, 1.95, 4.45], target: [0.0, 1.05, 0.0], fov: 40 },
        { t: 5.00, eye: [-1.45, 1.62, 4.05], target: [0.0, 0.55, 0.0], fov: 37 },
        { t: 7.20, eye: [-0.95, 1.65, 4.15], target: [0.0, 0.52, 0.0], fov: 37 }
      ],
      setup(app) {
        const s1 = app.scene1;
        s1.params.stiffness = 0.85;
        s1.params.toughness = 0.98; // High toughness -> massive squash, wrap-around & launch, NEVER crack!
        s1.params.ballMass = 3.1;
        s1.params.dropHeight = 2.8;
        s1.reset();
        // Ball already plunging directly above center ruby dome -> impact starts immediately!
        s1.spawnBall({
          pos: [0.0, 1.44, 0.0],
          vel: [0.0, -5.55, 0.0],
          radius: 0.35,
          mass: 3.1,
          material: 0 // Brushed tungsten steel
        });
      },
      events: []
    },

    'jelly-multi': {
      id: 'jelly-multi',
      label: '连击开裂',
      scene: 1,
      duration: 9.5, // <= 10s limit
      simDt: 1 / 120,
      timeWindows: [
        // Slow-mo wraps right around Hit #3 impact & coherent crack unzipping!
        { t0: 1.18, t1: 4.85, scale: 0.25, blend: 0.20 },
        { t0: 7.20, t1: 9.50, scale: 1.25, blend: 0.40 }
      ],
      cameraKeys: [
        { t: 0.0, eye: [2.15, 2.02, 4.35], target: [0.0, 0.68, 0.0], fov: 38 },
        { t: 1.15, eye: [1.65, 1.78, 4.15], target: [0.0, 0.58, 0.0], fov: 38 },
        { t: 2.35, eye: [0.95, 1.88, 4.45], target: [0.0, 0.52, 0.0], fov: 39 },
        { t: 4.40, eye: [-0.95, 1.98, 4.75], target: [0.0, 0.45, 0.0], fov: 40 },
        { t: 6.50, eye: [-1.35, 2.02, 4.75], target: [0.0, 0.42, 0.0], fov: 39 },
        { t: 9.50, eye: [-0.55, 1.98, 4.65], target: [0.0, 0.40, 0.0], fov: 38 }
      ],
      setup(app) {
        const s1 = app.scene1;
        s1.params.stiffness = 0.95;
        // Toughness calibrated so Hit #1 wobbles, Hit #2 amplifies oscillation, Hit #3 cleaves ruby dome into bouncing chunks!
        s1.params.toughness = 0.26;
        s1.params.ballMass = 2.6;
        s1.params.dropHeight = 2.8;
        s1.reset();
        // Hit #1 (Medium granite stone ball)
        s1.spawnBall({
          pos: [-0.08, 1.40, 0.04],
          vel: [0.22, -4.15, -0.10],
          radius: 0.28,
          mass: 1.45,
          material: 1
        });
      },
      events: [
        {
          // Hit #2: Heavier brass ball lands mid-oscillation -> superimposed elastic wave!
          simTime: 0.50,
          action(app) {
            app.scene1.spawnBall({
              pos: [0.10, 1.56, -0.05],
              vel: [-0.28, -5.55, 0.14],
              radius: 0.32,
              mass: 2.45,
              material: 2
            });
          }
        },
        {
          // Hit #3: Massive heavy tungsten ball smashes straight down -> slow-mo cleave into elastic chunks!
          simTime: 1.06,
          action(app) {
            app.scene1.spawnBall({
              pos: [0.0, 1.66, 0.02],
              vel: [0.04, -7.85, -0.04],
              radius: 0.38,
              mass: 4.90,
              material: 0
            });
          }
        }
      ]
    },

    'jelly-offset': {
      id: 'jelly-offset',
      label: '偏心撞击',
      scene: 1,
      duration: 7.5, // <= 8s limit
      simDt: 1 / 120,
      timeWindows: [
        // Slow-mo across off-center shoulder strike, dramatic ruby tilt/slide & steel ball rolling down the curved flank!
        { t0: 0.08, t1: 2.05, scale: 0.28, blend: 0.16 },
        { t0: 5.20, t1: 7.50, scale: 1.25, blend: 0.45 }
      ],
      cameraKeys: [
        { t: 0.0, eye: [-0.15, 1.88, 4.55], target: [0.32, 0.58, 0.0], fov: 38 },
        { t: 0.70, eye: [0.18, 1.42, 3.65], target: [0.22, 0.54, 0.0], fov: 37 },
        { t: 2.30, eye: [0.85, 1.55, 3.95], target: [0.68, 0.48, 0.05], fov: 38 },
        { t: 4.30, eye: [1.35, 1.85, 4.35], target: [0.65, 0.48, 0.0], fov: 38 },
        { t: 7.50, eye: [0.55, 1.92, 4.70], target: [0.35, 0.48, 0.0], fov: 38 }
      ],
      setup(app) {
        const s1 = app.scene1;
        s1.params.stiffness = 0.88;
        s1.params.toughness = 0.98; // Extra-tough: dramatic tilt, rock & slide, NEVER cracks!
        s1.params.ballMass = 2.8;
        s1.params.dropHeight = 2.5;
        // Resting burnished brass ball positioned directly in the steel ball's roll-off path toward the emerald jelly!
        s1.reset({
          restingBalls: [
            { pos: [1.05, 0.23, 0.10], vel: [0, 0, 0], radius: 0.23, mass: 1.15, material: 2 }
          ]
        });
        // Off-center glancing strike onto the RIGHT-UPPER SHOULDER of center ruby dome:
        // Pushes & tilts ruby dome sharply leftward (sliding cleanly across the bench!),
        // while the steel ball hugs & rolls straight down the sloping ruby flank into the brass sphere & emerald jelly!
        s1.spawnBall({
          pos: [0.34, 1.28, 0.03],
          vel: [0.85, -4.55, 0.06],
          angVel: [0, 0, -5.2],
          radius: 0.33,
          mass: 2.85,
          material: 0
        });
      },
      events: []
    },

    'tank-full': {
      id: 'tank-full',
      label: '造浪风浪',
      scene: 2,
      duration: 18.8, // <= 20s limit
      simDt: 1 / 120,
      timeWindows: [
        // Slow-mo 1: Crisp splash entry crowns, craters & trailing bubbles!
        { t0: 0.12, t1: 1.65, scale: 0.45, blend: 0.20 },
        // Slow-mo 2: Steep shoaling wave curling & plunging into whitewater over the reef!
        { t0: 7.60, t1: 11.20, scale: 0.44, blend: 0.32 },
        // Brisk tail so post-shutdown calm-down reaches serene equilibrium smoothly by 18.8s!
        { t0: 14.00, t1: 18.80, scale: 1.55, blend: 0.50 }
      ],
      cameraKeys: [
        // Act 1: Close 3/4 view of spheres plunging into calm water -> crowns, bubbles & caustics!
        { t: 0.0, eye: [0.35, 2.25, 5.25], target: [0.15, 1.05, 0.0], fov: 36 },
        { t: 1.60, eye: [0.75, 1.88, 4.95], target: [0.22, 0.92, 0.0], fov: 36 },
        // Pull back to full glass flume hero view: all 4 density layers (top/shallow/mid/bottom) + wavemaker!
        { t: 3.40, eye: [-0.15, 2.15, 7.15], target: [0.0, 0.96, 0.0], fov: 36 },
        // Act 2: Track wave train building from left mechanical paddle across deep basin
        { t: 5.80, eye: [-0.55, 2.08, 6.85], target: [0.15, 1.02, 0.0], fov: 36 },
        // Act 2b: Push-in on shoaling reef plunging breaker, whitewater foam & thrown floaters!
        { t: 8.40, eye: [1.05, 1.92, 4.85], target: [0.95, 1.08, 0.0], fov: 36 },
        { t: 11.20, eye: [1.75, 1.90, 5.05], target: [1.45, 1.08, 0.0], fov: 36 },
        // Act 3: Wide framing of far-wall run-up, reflection collision & multi-layer circulation!
        { t: 13.50, eye: [0.35, 2.15, 6.95], target: [0.20, 0.98, 0.0], fov: 36 },
        // Act 4: Serene full-flume view showing calm water & all 4 density layers settled!
        { t: 18.80, eye: [-0.10, 2.04, 7.10], target: [0.0, 0.94, 0.0], fov: 36 }
      ],
      setup(app) {
        const s2 = app.scene2;
        s2.params.groupDensities = [0.35, 0.72, 1.00, 2.40];
        s2.params.waveAmplitude = 0.14;
        s2.params.waveFrequency = 0.58;
        s2.reset({ waveRunning: false, dropMode: 'demo' });
      },
      events: [
        {
          // Start gentle swell waves right after 4-layer stratification is unmistakably clear!
          simTime: 2.05,
          action(app) {
            app.scene2.params.waveAmplitude = 0.14;
            app.scene2.params.waveFrequency = 0.52;
            app.scene2.setWaveRunning(true);
          }
        },
        {
          // Ramp strongly to resonant steep shoaling & plunging breaking waves over the reef!
          simTime: 3.30,
          action(app) {
            app.scene2.params.waveAmplitude = 0.41;
            app.scene2.params.waveFrequency = 0.55;
          }
        },
        {
          // Maximum plunging surf & towering far-wall run-up + reflection!
          simTime: 6.00,
          action(app) {
            app.scene2.params.waveAmplitude = 0.44;
            app.scene2.params.waveFrequency = 0.58;
          }
        },
        {
          // Stop wavemaker cleanly -> waves diminish, foam clears, spheres settle at equilibrium layers!
          simTime: 9.80,
          action(app) {
            app.scene2.setWaveRunning(false);
          }
        }
      ]
    }
  };

  class DemoController {
    constructor(app) {
      this.app = app;
      this.activeDemo = null;
      this.videoTime = 0;
      this.simTimeReached = 0;
      this.firedEvents = new Set();
      this.isExporting = false;
      this.exportFps = 60;
      this.exportFrames = 0;
      this._setupVideoExport();
    }

    startDemo(runId, forExport) {
      const demo = DEMOS[runId];
      if (!demo) throw new Error('Unknown demo runId: ' + runId);

      this.activeDemo = demo;
      this.videoTime = 0;
      this.simTimeReached = 0;
      this.firedEvents = new Set();

      // Switch active scene cleanly
      this.app.switchScene(demo.scene, true);
      // Initialize deterministic demo state
      demo.setup(this.app);
      // Apply frame-0 camera immediately
      const pose = evalKeyframes(demo.cameraKeys, 0);
      this.app.getActiveCamera().setPose(pose.eye, pose.target, pose.fov);

      if (!forExport && this.app.ui) {
        this.app.ui.syncFromParams();
        this.app.ui.setDemoBadge(demo.label);
      }
    }

    stopDemo() {
      if (this.activeDemo) {
        this.app.getActiveCamera().clearOverride();
      }
      this.activeDemo = null;
      if (this.app.ui) this.app.ui.setDemoBadge(null);
    }

    // Advance active interactive demo by real frame dt (respecting pause & user slow-mo!)
    updateInteractive(realDt) {
      if (!this.activeDemo) return false;
      const demo = this.activeDemo;
      const nextVideoT = Math.min(demo.duration, this.videoTime + realDt);
      this._advanceToVideoTime(nextVideoT, false);

      if (this.videoTime >= demo.duration - 1e-4) {
        // Hold calm final state and hand control back cleanly to user!
        this.stopDemo();
      }
      return true;
    }

    // Core deterministic stepping: advances physics from simTimeReached -> exact videoToSimTime(targetVideoT)
    _advanceToVideoTime(targetVideoT, isExport) {
      const demo = this.activeDemo;
      const targetSim = videoToSimTime(demo, targetVideoT);
      const simDt = demo.simDt;

      // Step in exact fixed SIM_DT increments so physics is 100% independent of export FPS!
      while (this.simTimeReached + simDt * 0.5 < targetSim) {
        const nextSim = this.simTimeReached + simDt;
        // Fire any events scheduled before or at this tick
        for (let i = 0; i < demo.events.length; i++) {
          if (!this.firedEvents.has(i) && this.simTimeReached >= demo.events[i].simTime - 1e-6) {
            this.firedEvents.add(i);
            demo.events[i].action(this.app);
            if (!isExport && this.app.ui) this.app.ui.syncFromParams();
          }
        }
        if (demo.scene === 1) {
          this.app.scene1.step(simDt);
        } else {
          this.app.scene2.step(simDt, isExport);
        }
        this.simTimeReached = nextSim;
      }

      // Check boundary events at exact end
      for (let i = 0; i < demo.events.length; i++) {
        if (!this.firedEvents.has(i) && targetSim >= demo.events[i].simTime - 1e-6) {
          this.firedEvents.add(i);
          demo.events[i].action(this.app);
        }
      }

      this.videoTime = targetVideoT;
      const pose = evalKeyframes(demo.cameraKeys, this.videoTime);
      this.app.getActiveCamera().setPose(pose.eye, pose.target, pose.fov);
    }

    _setupVideoExport() {
      const self = this;
      global.videoExport = {
        runs: RUN_IDS.slice(),

        async begin(runId, opts) {
          if (!DEMOS[runId]) {
            throw new Error('Invalid runId: ' + runId + '. Expected one of: ' + RUN_IDS.join(', '));
          }
          const fps = Math.max(1, Math.round((opts && opts.fps) || 60));

          // Wait until WebGPU & both scenes are 100% initialized!
          await self.app.readyPromise;

          self.isExporting = true;
          self.exportFps = fps;
          App.Audio.setExportMuted(true);
          App.Audio.updateWaveSound(0, 0);

          // Hide all UI overlays and expand canvas to 100% full window resolution (supports up to 3840x2160!)
          document.body.classList.add('export-mode');
          self.app.gpu.resize(true);

          self.startDemo(runId, true);
          const demo = self.activeDemo;
          const frames = Math.max(1, Math.round(demo.duration * fps));
          self.exportFrames = frames;

          // Ensure initial GPU uploads are complete
          await self.app.gpu.device.queue.onSubmittedWorkDone();
          return { frames };
        },

        async frame(i) {
          if (!self.isExporting || !self.activeDemo) {
            throw new Error('videoExport.frame called before videoExport.begin');
          }
          // Handle any viewport resize between frames cleanly (including up to 3840x2160!)
          self.app.gpu.resize(false);

          const videoT = i / self.exportFps;
          if (i === 0) {
            const pose = evalKeyframes(self.activeDemo.cameraKeys, 0);
            self.app.getActiveCamera().setPose(pose.eye, pose.target, pose.fov);
          } else {
            self._advanceToVideoTime(videoT, true);
          }

          // Render exact frame i to swapchain canvas
          self.app.renderCurrentScene();
          // Guarantee GPU command completion AND compositor presentation before returning!
          await self.app.gpu.device.queue.onSubmittedWorkDone();
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        },

        end() {
          self.isExporting = false;
          self.stopDemo();
          document.body.classList.remove('export-mode');
          App.Audio.setExportMuted(false);
          self.app.gpu.resize(true);
          if (self.app.ui) self.app.ui.syncFromParams();
        }
      };
    }
  }

  App.Demos = {
    RUN_IDS,
    DEMOS,
    DemoController
  };
})(window);
