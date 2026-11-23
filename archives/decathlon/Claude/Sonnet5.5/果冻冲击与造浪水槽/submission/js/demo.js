/* ===== demo.js : 四段预置演示（镜头、变速、触发时序）与视频导出接口 ===== */
'use strict';

/* ---------- 关键帧工具 ---------- */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// 相机关键帧：[{t, target:[x,y,z], dist, yaw, pitch, fov?}]
function camFromKeys(keys, T) {
  const n = keys.length;
  if (T <= keys[0].t) return keyToCam(keys[0]);
  if (T >= keys[n - 1].t) return keyToCam(keys[n - 1]);
  let i = 0; while (i < n - 2 && T > keys[i + 1].t) i++;
  const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
  let u = (T - k1.t) / (k2.t - k1.t);
  u = u * u * (3 - 2 * u) * 0.65 + u * 0.35;      // 轻微缓入缓出
  const f = (a, b, c, d) => catmull(a, b, c, d, u);
  const out = {
    target: [0, 1, 2].map(j => f(k0.target[j], k1.target[j], k2.target[j], k3.target[j])),
    dist: f(k0.dist, k1.dist, k2.dist, k3.dist), yaw: f(k0.yaw, k1.yaw, k2.yaw, k3.yaw), pitch: f(k0.pitch, k1.pitch, k2.pitch, k3.pitch),
    fov: f(k0.fov || 36, k1.fov || 36, k2.fov || 36, k3.fov || 36) * Math.PI / 180,
  };
  return out;
}
function keyToCam(k) { return { target: k.target.slice(), dist: k.dist, yaw: k.yaw, pitch: k.pitch, fov: (k.fov || 36) * Math.PI / 180 }; }
// 变速曲线：[[T, 速度]]，段内平滑插值；返回 视频时间 → 模拟时间 的累积表
function buildTimeMap(keys, duration) {
  const N = Math.ceil(duration * 1000) + 2, tab = new Float64Array(N);
  const spd = T => {
    if (T <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) if (T <= keys[i + 1][0]) {
      const u = smooth01((T - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
      return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * u;
    }
    return keys[keys.length - 1][1];
  };
  for (let i = 1; i < N; i++) tab[i] = tab[i - 1] + spd((i - 0.5) / 1000) / 1000;
  return T => { const x = clamp(T, 0, duration) * 1000, i = Math.floor(x); return tab[i] + (tab[Math.min(i + 1, N - 1)] - tab[i]) * (x - i); };
}

/* ---------- 四段演示定义 ---------- */
const DEMO_RUNS = {
  'jelly-center': {
    scene: 'jelly', title: '正中单击', duration: 7.8,
    speed: [[0, 1.0], [0.3, 1.0], [0.55, 0.12], [2.5, 0.12], [3.3, 0.45], [4.8, 1.0], [7.8, 1.0]],
    camera: [
      { t: 0, target: [0.0, 0.2, 0.0], dist: 2.5, yaw: 0.45, pitch: 0.36 },
      { t: 0.5, target: [0.03, 0.15, 0.0], dist: 1.5, yaw: 0.2, pitch: 0.2 },
      { t: 1.2, target: [0.03, 0.14, 0.0], dist: 1.05, yaw: 0.02, pitch: 0.1 },
      { t: 3.0, target: [0.05, 0.16, 0.0], dist: 1.1, yaw: -0.3, pitch: 0.15 },
      { t: 5.0, target: [0.1, 0.18, 0.0], dist: 1.65, yaw: -0.5, pitch: 0.28 },
      { t: 7.8, target: [0.1, 0.18, 0.0], dist: 2.1, yaw: -0.38, pitch: 0.36 },
    ],
  },
  'jelly-multi': {
    scene: 'jelly', title: '连击击裂', duration: 9.8,
    speed: [[0, 0.65], [2.2, 0.65], [2.5, 0.15], [5.2, 0.15], [6.4, 0.8], [7.2, 1.0], [9.8, 1.0]],
    camera: [
      { t: 0, target: [0.0, 0.2, 0.0], dist: 1.9, yaw: 0.35, pitch: 0.3 },
      { t: 1.5, target: [0.0, 0.17, 0.0], dist: 1.3, yaw: 0.1, pitch: 0.17 },
      { t: 2.6, target: [0.0, 0.15, 0.0], dist: 1.0, yaw: -0.15, pitch: 0.14 },
      { t: 5.0, target: [0.0, 0.14, 0.0], dist: 1.1, yaw: -0.45, pitch: 0.22 },
      { t: 7.5, target: [0.0, 0.14, 0.05], dist: 1.45, yaw: -0.6, pitch: 0.34 },
      { t: 9.8, target: [0.0, 0.14, 0.05], dist: 1.8, yaw: -0.5, pitch: 0.4 },
    ],
  },
  'jelly-offset': {
    scene: 'jelly', title: '偏击滑移', duration: 7.8,
    speed: [[0, 1.0], [0.2, 1.0], [0.5, 0.25], [2.2, 0.25], [3.2, 0.7], [4.2, 1.0], [7.8, 1.0]],
    camera: [
      { t: 0, target: [0.0, 0.2, 0.05], dist: 2.2, yaw: 0.5, pitch: 0.36 },
      { t: 0.8, target: [-0.2, 0.15, 0.03], dist: 1.35, yaw: 0.25, pitch: 0.2 },
      { t: 2.2, target: [0.0, 0.13, 0.08], dist: 1.45, yaw: -0.1, pitch: 0.24 },
      { t: 4.0, target: [0.25, 0.12, 0.1], dist: 1.7, yaw: -0.3, pitch: 0.34 },
      { t: 7.8, target: [0.2, 0.12, 0.1], dist: 2.1, yaw: -0.25, pitch: 0.4 },
    ],
  },
  'tank-full': {
    scene: 'tank', title: '风浪全程', duration: 19.6,
    speed: [[0, 1.0], [0.8, 1.0], [1.4, 0.5], [3.0, 0.5], [3.8, 1.0], [8.5, 1.0], [9.5, 0.55], [12.5, 0.55], [13.6, 1.0], [15.0, 1.5], [19.6, 1.5]],
    camera: [
      { t: 0, target: [1.2, 0.3, 0.22], dist: 3.5, yaw: 0.16, pitch: 0.2 },
      { t: 1.4, target: [0.6, 0.3, 0.22], dist: 1.9, yaw: 0.1, pitch: 0.13 },
      { t: 3.2, target: [0.8, 0.22, 0.22], dist: 2.2, yaw: 0.22, pitch: 0.12 },
      { t: 6.0, target: [1.3, 0.24, 0.22], dist: 2.7, yaw: 0.28, pitch: 0.2 },
      { t: 9.6, target: [1.95, 0.22, 0.22], dist: 1.6, yaw: 0.35, pitch: 0.12 },
      { t: 12.4, target: [2.15, 0.3, 0.22], dist: 1.7, yaw: -0.25, pitch: 0.16 },
      { t: 14.6, target: [1.3, 0.28, 0.22], dist: 3.2, yaw: 0.05, pitch: 0.2 },
      { t: 19.6, target: [1.2, 0.28, 0.22], dist: 3.5, yaw: 0.1, pitch: 0.2 },
    ],
    events: [
      { at: 2.4, fn: sc => { sc.sim.params.amp = 0.35; sc.sim.params.freq = 1.0; sc.sim.params.running = true; } },
      { at: 4.0, fn: sc => { sc.sim.params.amp = 0.6; sc.sim.params.freq = 1.05; } },
      { at: 5.5, fn: sc => { sc.sim.params.amp = 0.85; sc.sim.params.freq = 1.1; } },
      { at: 7.0, fn: sc => { sc.sim.params.amp = 1.0; sc.sim.params.freq = 1.15; } },
      { at: 11.0, fn: sc => { sc.sim.params.running = false; } },
    ],
  },
};
for (const id in JELLY_DEMOS) DEMO_RUNS[id].events = JELLY_DEMOS[id].events;
for (const id in DEMO_RUNS) DEMO_RUNS[id].timeMap = buildTimeMap(DEMO_RUNS[id].speed, DEMO_RUNS[id].duration);

/* ---------- 演示控制器 ---------- */
const Demo = {
  runs: Object.keys(DEMO_RUNS),
  active: false, run: null, runId: null, T: 0, evIdx: 0, fps: 30, saved: null,

  /* 回到这一段的初始状态 */
  prepare(runId) {
    const run = DEMO_RUNS[runId];
    if (!run) throw new Error('未知演示：' + runId);
    this.run = run; this.runId = runId;
    App.switchScene(run.scene);
    const sc = App.scene;
    if (run.scene === 'jelly') {
      const J = JELLY_DEMOS[runId];
      for (const k in J.jelly) sc.jellyParams[k] = Object.assign({}, J.jelly[k]);
      sc.params.target = J.slot; sc.splitK = J.K;
      sc.reset(J.layout);
    } else {
      sc.sim.params.amp = 0.4; sc.sim.params.freq = 1.0; sc.sim.params.running = false;
      sc.reset();
    }
    sc.setupView();
    sc.drainEvents();
    this.evIdx = 0; this.T = 0;
    this.applyCamera(0);
    return run;
  },
  applyCamera(T) {
    const c = camFromKeys(this.run.camera, T);
    Object.assign(App.R.cam, c, { target: c.target.slice() });
  },
  /* 推进模拟到指定模拟时间，期间按时刻触发事件 */
  advanceSim(target) {
    const sc = App.scene, run = this.run, evs = run.events || [];
    const dt = sc.dtPhys;
    const now = () => sc.simTime;
    for (let guard = 0; guard < 64; guard++) {
      const ev = evs[this.evIdx];
      const limit = ev && ev.at <= target + 1e-9 ? ev.at : target;
      const n = Math.round((limit - now()) / dt);
      if (n > 0) { if (sc.stepN) sc.stepN(n); }
      if (ev && ev.at <= target + 1e-9 && now() + dt * 0.5 >= ev.at - 1e-9) { ev.fn(sc); this.evIdx++; continue; }
      break;
    }
  },

  /* ---- 实时演示播放 ---- */
  start(runId) {
    if (App.mode === 'export') return;
    this.stop(true);
    this.prepare(runId);
    this.active = true; App.mode = 'demo'; App.demo = this;
    App.setPaused(false);
    $('#demoHud').style.display = 'block'; $('#demoName').textContent = '演示 · ' + this.run.title;
    $$('.demoBtn').forEach(b => b.classList.toggle('on', b.dataset.run === runId));
  },
  stop(silent) {
    if (!this.active) return;
    this.active = false; App.mode = 'live';
    $('#demoHud').style.display = 'none';
    $$('.demoBtn').forEach(b => b.classList.remove('on'));
    if (!silent) { App.scene.reset(App.scene.layout); App.scene.setupView(); App.buildSide(); }
  },
  advance(dtReal) {
    const run = this.run, sc = App.scene;
    if (!App.paused) this.T = Math.min(this.T + dtReal * App.speed, run.duration);
    const target = run.timeMap(this.T);
    const cap = sc.name === 'tank' ? 0.02 : 0.03;
    const goal = Math.min(target, sc.simTime + cap);
    this.advanceSim(goal);
    this.applyCamera(this.T);
    $('#demoBar2').style.width = (this.T / run.duration * 100).toFixed(1) + '%';
    if (this.T >= run.duration) { /* 结尾停稳，保持画面 */ }
  },
};
App.demo = Demo;

/* ---------- 视频导出接口 ---------- */
const VideoExport = {
  runs: Demo.runs.slice(),
  _frames: 0, _fps: 30, _active: false,
  async begin(runId, opts) {
    const fps = Math.max(1, Math.round((opts && opts.fps) || 30));
    if (!App.ready) throw new Error('作品尚未就绪');
    if (Demo.active) Demo.stop(true);
    App.mode = 'export'; App.scene && (App.scene.noPoll = true);
    $('#ui').style.display = 'none';
    $('#ui').classList.add('exporting');
    this._active = true; this._fps = fps;
    const run = Demo.prepare(runId);
    if (App.scene.noPoll !== undefined) App.scene.noPoll = true;
    App.R.resize(true);
    this._frames = Math.max(1, Math.floor(run.duration * fps + 1e-6));
    // 显示初始状态，确保管线就绪
    await this._present();
    return { frames: this._frames };
  },
  async frame(i) {
    if (!this._active) throw new Error('请先调用 begin');
    i = Math.max(0, Math.min(this._frames - 1, i | 0));
    const T = i / this._fps, run = Demo.run;
    Demo.T = T;
    Demo.advanceSim(run.timeMap(T));
    Demo.applyCamera(T);
    await this._present();
  },
  async _present() {
    const sc = App.scene;
    App.R.resize();
    const enc = GPUX.device.createCommandEncoder();
    sc.render(enc);
    GPUX.device.queue.submit([enc.finish()]);
    await GPUX.device.queue.onSubmittedWorkDone();
    await new Promise(res => { let done = false; const f = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(() => requestAnimationFrame(f)); setTimeout(f, 300); });
  },
  end() {
    if (!this._active) return;
    this._active = false;
    App.mode = 'live';
    if (App.scene) App.scene.noPoll = false;
    $('#ui').style.display = ''; $('#ui').classList.remove('exporting');
    Demo.active = false;
    App.scene.reset(App.scene.layout); App.scene.setupView(); App.buildSide();
    App.setPaused(false); App.last = 0;
    App.R.resize(true);
  },
};
Object.defineProperty(VideoExport, 'runs', { value: Demo.runs.slice(), writable: false, enumerable: true });
window.videoExport = VideoExport;
