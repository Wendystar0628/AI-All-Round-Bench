// 应用层：画布与相机、实时循环、界面绑定、演示播放，以及 window.videoExport 导出接口。
const App = {
  canvas: null,
  scenes: {},
  key: 'jelly',
  mode: 'free',          // free: 自由操作；demo: 播放预置演示
  paused: false,
  slow: false,
  demoRun: null,
  demoT: 0,
  exporting: false,
  exportInfo: null,
  orbits: {},
  lastTs: 0,
  exposure: 1.0,
  soundPrev: null,
  soundCrack: 0,
  soundLast: 0,
  booted: false,

  scene() {
    return this.scenes[this.key];
  },

  sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.round(window.innerWidth * dpr);
    let h = Math.round(window.innerHeight * dpr);
    const maxPix = 3840 * 2160;
    if (w * h > maxPix) {
      const k = Math.sqrt(maxPix / (w * h));
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    w = Math.max(64, w);
    h = Math.max(64, h);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      for (const s of Object.values(this.scenes)) {
        if (s.ready) s.resize(w, h);
      }
    }
  },

  // 每个场景的自由视角轨道相机
  orbitFor(key) {
    if (!this.orbits[key]) {
      const d = key === 'tank'
        ? { target: [0.5, 0.2, 0.18], yaw: 0.3, pitch: 0.14, dist: 1.75, fovy: 0.62 }
        : { target: [0, 0.6, 0], yaw: 0.45, pitch: 0.22, dist: 1.2, fovy: 0.6 };
      this.orbits[key] = d;
    }
    return this.orbits[key];
  },

  // 轨道参数 -> 相机位置
  camFromOrbit(o) {
    const cp = Math.cos(o.pitch);
    const eye = [
      o.target[0] + o.dist * cp * Math.sin(o.yaw),
      o.target[1] + o.dist * Math.sin(o.pitch),
      o.target[2] + o.dist * cp * Math.cos(o.yaw),
    ];
    return { eye, target: o.target, fovy: o.fovy };
  },

  renderScene(s, cam, timeSec) {
    const dev = GPUX.device;
    const enc = dev.createCommandEncoder();
    const L = s.lighting();
    const hdr = s.renderFrame(enc, cam, L.dir, L.vp, timeSec || 0);
    Post.draw(enc, hdr, GPUX.context.getCurrentTexture().createView(), s.width, s.height, this.exposure);
    if (!this.exporting && Sound.ready()) s.requestReadback(enc);
    dev.queue.submit([enc.finish()]);
    if (!this.exporting) s.pollReadback();
  },

  // 根据回读的球状态与裂纹数触发声音
  checkSound(s) {
    if (!Sound.ready() || !s.latestBalls) return;
    const now = performance.now();
    const cur = s.latestBalls;
    if (!this.soundPrev) this.soundPrev = new Float32Array(cur.length);
    if (s.key === 'tank') {
      // 水槽：小球入水（穿过水面下落）与球之间的碰撞
      const WH = TANK.WH;
      for (let b = 0; b < TANK.MAX_BALLS; b++) {
        if (cur[b * 24 + 11] < 0.5) continue;
        const y = cur[b * 24 + 1], py = this.soundPrev[b * 24 + 1];
        if (py > WH && y <= WH && cur[b * 24 + 5] < -0.2 && now - this.soundLast > 120) {
          Sound.splash(clamp(-cur[b * 24 + 5] / 2, 0.2, 1));
          this.soundLast = now;
        }
        const d = cur[b * 24 + 16] - this.soundPrev[b * 24 + 16];
        if (d > 0.01 && now - this.soundLast > 120) {
          Sound.clink(d * 4);
          this.soundLast = now;
        }
      }
      this.soundPrev.set(cur);
      return;
    }
    if (now - this.soundLast > 90) {
      for (let b = 0; b < JELLY_MAX_BALLS; b++) {
        const d = cur[b * 24 + 16] - this.soundPrev[b * 24 + 16];
        if (d > 0.04 && cur[b * 24 + 11] > 0.5) {
          Sound.impact(d / 1.2);
          this.soundLast = now;
          break;
        }
      }
    }
    if (s.crackTotal > this.soundCrack) {
      Sound.crack(0.8);
      this.soundCrack = s.crackTotal;
    }
    this.soundPrev.set(cur);
  },

  tick(ts) {
    requestAnimationFrame((t) => this.tick(t));
    if (!this.booted || this.exporting) return;
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.sizeCanvas();
    const s = this.scene();
    if (s && s.ready) {
      if (!this.paused) {
        const rate = this.slow ? 0.25 : 1;
        if (this.mode === 'demo' && this.demoRun) {
          this.demoT = Math.min(this.demoT + dt * rate, this.demoRun.duration);
          s.advanceDemo(this.demoT);
          if (this.demoT >= this.demoRun.duration) {
            this.paused = true;
            this.demoDone = true;
          }
        } else {
          s.advanceTo(s.simTime() + dt * rate);
        }
      }
      let cam;
      if (this.mode === 'demo' && this.demoRun) {
        cam = this.camFromOrbit(s.camAt(this.demoT));
      } else {
        cam = this.camFromOrbit(this.orbitFor(this.key));
      }
      this.renderScene(s, cam, this.demoT);
      this.checkSound(s);
    }
    this.updateHud();
  },

  updateHud() {
    const s = this.scene();
    const el = document.getElementById('status');
    if (!el || !s) return;
    const modeText = this.mode === 'demo' ? (this.demoDone ? '演示结束' : '演示：' + this.demoRun.title) : '自由操作';
    const timeText = this.mode === 'demo' ? this.demoT.toFixed(2) + ' s' : s.simTime().toFixed(2) + ' s';
    el.textContent = modeText + '　|　时间 ' + timeText + (this.paused ? '　|　已暂停' : '') + (this.slow ? '　|　慢放' : '');
    const cr = document.getElementById('crack-count');
    if (cr && s.key === 'jelly') cr.textContent = '裂纹 ' + s.crackTotal;
  },

  // ---------------- 演示播放 ----------------
  playDemo(runId) {
    const s = this.sceneForRun(runId);
    if (!s || !s.ready) return;
    const def = JELLY_RUNS[runId] || TANK_RUNS[runId];
    this.key = s.key;
    this.mode = 'demo';
    this.demoRun = { id: runId, title: def.title || runId, duration: def.duration };
    this.demoT = 0;
    this.demoDone = false;
    this.paused = false;
    s.beginRun(runId);
    this.soundCrack = 0;
    this.soundPrev = null;
    this.setUI();
  },

  resetAll() {
    const s = this.scene();
    if (!s) return;
    s.resetState();
    this.mode = 'free';
    this.demoRun = null;
    this.demoDone = false;
    this.paused = false;
    this.soundCrack = 0;
    this.soundPrev = null;
    this.setUI();
  },

  setUI() {
    document.querySelectorAll('[data-scene]').forEach((b) => b.classList.toggle('active', b.dataset.scene === this.key));
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== this.key));
    const pb = document.getElementById('btn-pause');
    if (pb) pb.textContent = this.paused ? '继续' : '暂停';
    const sb = document.getElementById('btn-slow');
    if (sb) sb.classList.toggle('active', this.slow);
    const title = document.getElementById('scene-title');
    const s = this.scene();
    if (title && s) title.textContent = s.title;
  },

  // ---------------- 导出接口 ----------------
  sceneForRun(runId) {
    if (JELLY_RUNS[runId]) return this.scenes.jelly;
    if (typeof TANK_RUNS !== 'undefined' && TANK_RUNS[runId]) return this.scenes.tank;
    return null;
  },

  async exportBegin(runId, fps) {
    const s = this.sceneForRun(runId);
    if (!s) throw new Error('未知的演示: ' + runId);
    while (!this.booted) await new Promise((r) => setTimeout(r, 20));
    this.exporting = true;
    document.body.classList.add('exporting');
    this.sizeCanvas();
    const run = s.beginRun(runId);
    this.exportInfo = { runId, fps, scene: s, duration: run.duration };
    const frames = Math.floor(run.duration * fps + 1e-9) + 1;
    return { frames };
  },

  async exportFrame(i) {
    const info = this.exportInfo;
    if (!info) throw new Error('尚未调用 begin');
    const s = info.scene;
    const T = Math.min(i / info.fps, info.duration);
    this.sizeCanvas();
    s.advanceDemo(T);
    const cam = this.camFromOrbit(s.camAt(T));
    this.renderScene(s, cam, T);
    await GPUX.settle(200);
  },

  exportEnd() {
    if (this.exportInfo) {
      this.exportInfo.scene.resetState();
    }
    this.exportInfo = null;
    this.exporting = false;
    this.mode = 'free';
    this.demoRun = null;
    this.paused = false;
    this.soundCrack = 0;
    this.soundPrev = null;
    document.body.classList.remove('exporting');
    this.setUI();
  },

  // ---------------- 启动与界面 ----------------
  async boot() {
    this.canvas = document.getElementById('gl');
    try {
      await GPUX.init(this.canvas);
    } catch (e) {
      document.getElementById('error').textContent = '无法启动 WebGPU：' + e.message;
      document.getElementById('error').classList.remove('hidden');
      return;
    }
    Post.create();
    this.sizeCanvas();
    const w = this.canvas.width, h = this.canvas.height;
    const js = new JellyScene();
    this.scenes.jelly = js;
    await js.init(w, h);
    if (typeof TankScene !== 'undefined') {
      const ts = new TankScene();
      this.scenes.tank = ts;
      await ts.init(w, h);
    }
    this.bindUI();
    this.booted = true;
    this.setUI();
    requestAnimationFrame((t) => this.tick(t));
  },

  bindUI() {
    const $ = (id) => document.getElementById(id);
    document.querySelectorAll('[data-scene]').forEach((b) => {
      b.addEventListener('click', () => {
        this.key = b.dataset.scene;
        this.mode = 'free';
        this.demoRun = null;
        this.paused = false;
        this.setUI();
      });
    });
    $('btn-pause').addEventListener('click', () => {
      if (this.mode === 'demo' && this.demoDone) return;
      this.paused = !this.paused;
      this.setUI();
    });
    $('btn-slow').addEventListener('click', () => {
      this.slow = !this.slow;
      this.setUI();
    });
    $('btn-reset').addEventListener('click', () => this.resetAll());
    $('btn-sound').addEventListener('click', (e) => {
      Sound.unlock();
      Sound.setOn(!Sound.on);
      e.currentTarget.textContent = Sound.on ? '声音：开' : '声音：关';
    });
    document.body.addEventListener('pointerdown', () => Sound.unlock(), { once: false });

    // 轨道相机：拖动旋转，滚轮推拉
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (drag = null));
    window.addEventListener('pointermove', (e) => {
      if (!drag || this.mode === 'demo') return;
      const o = this.orbitFor(this.key);
      o.yaw -= (e.clientX - drag.x) * 0.006;
      o.pitch = clamp(o.pitch + (e.clientY - drag.y) * 0.004, -0.2, 1.3);
      drag = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode === 'demo') return;
      const o = this.orbitFor(this.key);
      o.dist = clamp(o.dist * Math.exp(e.deltaY * 0.001), 0.35, 3.5);
      e.preventDefault();
    }, { passive: false });

    // 键盘：空格暂停，R 重置，S 慢放
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { $('btn-pause').click(); e.preventDefault(); }
      if (e.key === 'r' || e.key === 'R') $('btn-reset').click();
      if (e.key === 's' || e.key === 'S') $('btn-slow').click();
    });

    // 果冻面板
    const js = this.scenes.jelly;
    const bindRange = (id, fn) => {
      const el = $(id);
      const out = $(id + '-val');
      const apply = () => {
        const v = parseFloat(el.value);
        if (out) out.textContent = fn.fmt(v);
        fn.set(v);
      };
      el.addEventListener('input', apply);
      apply();
    };
    bindRange('ui-soft', { fmt: (v) => v.toFixed(2), set: (v) => { js.params.soft = v; js.writeMaterials(); } });
    bindRange('ui-firm', { fmt: (v) => v.toFixed(2), set: (v) => { js.params.firm = v; js.writeMaterials(); } });
    bindRange('ui-mass', { fmt: (v) => v.toFixed(1) + ' kg', set: (v) => { js.params.mass = v; } });
    bindRange('ui-height', { fmt: (v) => v.toFixed(2) + ' m', set: (v) => { js.params.height = v; } });
    bindRange('ui-radius', { fmt: (v) => (v * 100).toFixed(1) + ' cm', set: (v) => { js.params.radius = v; } });
    document.querySelectorAll('input[name="ballMat"]').forEach((r) => {
      r.addEventListener('change', () => { if (r.checked) js.params.material = r.value; });
    });

    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', () => {
        Sound.unlock();
        if (this.mode === 'demo') { this.mode = 'free'; this.demoRun = null; this.setUI(); }
        this.paused = false;
        const act = b.dataset.act;
        const now = js.simTime();
        const p = js.params;
        if (act === 'center') {
          js.spawnBall({ x: 0, z: 0 });
        } else if (act === 'offset') {
          js.spawnBall({ x: 0.1, z: 0.03, vx: -0.45 });
        } else if (act === 'multi') {
          const seq = [
            { t: 0, m: p.mass * 0.4, h: p.height * 0.6 },
            { t: 1.0, m: p.mass * 0.7, h: p.height * 0.85 },
            { t: 2.0, m: p.mass, h: p.height },
          ];
          for (const q of seq) {
            js.scheduleAt(now + q.t, () => js.spawnBall({ x: 0, z: 0, mass: q.m, h: q.h }));
          }
        }
      });
    });

    document.querySelectorAll('[data-demo]').forEach((b) => {
      b.addEventListener('click', () => {
        Sound.unlock();
        this.playDemo(b.dataset.demo);
      });
    });

    if (typeof TankScene !== 'undefined') bindTankUI(this);
  },
};

window.videoExport = {
  runs: ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'],
  begin(runId, opts) {
    return App.exportBegin(runId, (opts && opts.fps) || 30);
  },
  frame(i) {
    return App.exportFrame(i);
  },
  end() {
    App.exportEnd();
  },
};

window.addEventListener('load', () => {
  App.boot();
});
