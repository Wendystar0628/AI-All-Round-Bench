// 场景二的演示编排、镜头、灯光与界面绑定。
const TANK_RUNS = {
  // 风浪：平静的水中各组小球入水、按密度分化；浪由小变大、变陡、破碎拍壁；球被托起、抛起、卷走；停机后风平浪静
  'tank-full': {
    title: '风浪',
    duration: 20.0,
    slow: [{ a: 10.2, b: 12.6, f: 0.3 }],
    events: [
      { T: 0.6, fn: (s) => s.spawnBatch([0, 1], 0.3) },
      { T: 2.4, fn: (s) => s.spawnBatch([2], 0.28) },
      { T: 3.6, fn: (s) => s.spawnBatch([3], 0.3) },
      { T: 5.0, fn: (s) => s.setWave({ on: true, amp: 0.03, freq: 0.9 }) },
      { T: 8.0, fn: (s) => s.setWave({ amp: 0.07, freq: 1.2 }) },
      { T: 11.0, fn: (s) => s.setWave({ amp: 0.12, freq: 1.5 }) },
      { T: 13.5, fn: (s) => s.setWave({ on: false }) },
    ],
    cam: (T) => ({ target: [0.5, 0.26, 0.18], yaw: 0.22 + 0.25 * smooth01(T / 20), pitch: 0.2 + 0.05 * smooth01(T / 20), dist: 2.05 - 0.25 * smooth01(T / 20), fovy: 0.62 }),
  },
};

TankScene.prototype.runIds = Object.keys(TANK_RUNS);

// 造浪参数：开关、幅度（0~1 对应冲程）、频率（0~1 对应 0.8~2.2 Hz）
TankScene.prototype.setWave = function (opt) {
  const w = this.wave;
  if (opt.on !== undefined) w.on = opt.on;
  if (opt.amp !== undefined) w.ampT = opt.amp;
  if (opt.freq !== undefined) w.freqT = opt.freq;
};

TankScene.prototype.lightingFor = TankScene.prototype.lighting;

TankScene.prototype.beginRun = function (runId) {
  const run = TANK_RUNS[runId];
  if (!run) throw new Error('未知演示: ' + runId);
  this.resetState();
  this.run = run;
  this.runId = runId;
  this.timeMap = Timeline.build(run.duration, run.slow);
  // 演示开始前把造浪参数恢复到默认，之后由事件驱动
  this.wave.ampT = 0.03;
  this.wave.freqT = 0.9;
  this.wave.amp = 0.03;
  this.wave.freq = 0.9;
  for (const ev of run.events) {
    this.scheduleAt(this.timeMap.toSim(ev.T), () => ev.fn(this));
  }
  return run;
};

TankScene.prototype.advanceDemo = function (T) {
  this.advanceTo(this.timeMap.toSim(T));
};

TankScene.prototype.camAt = function (T) {
  if (this.run && this.run.cam) return this.run.cam(T);
  return null;
};

// 界面：造浪、释放小球、密度滑条
function bindTankUI(app) {
  const $ = (id) => document.getElementById(id);
  const ts = app.scenes.tank;
  if (!ts) return;
  const btnWave = $('btn-wave');
  const setWaveBtn = () => {
    btnWave.textContent = ts.wave.on ? '停止造浪' : '开始造浪';
    btnWave.classList.toggle('active', ts.wave.on);
  };
  btnWave.addEventListener('click', () => {
    Sound.unlock();
    ts.setWave({ on: !ts.wave.on });
    if (ts.wave.on) Sound.wave(0.7);
    setWaveBtn();
  });
  const bindRange = (id, fmt, set) => {
    const el = $(id);
    const out = $(id + '-val');
    const apply = () => {
      const v = parseFloat(el.value);
      if (out) out.textContent = fmt(v);
      set(v);
    };
    el.addEventListener('input', apply);
    apply();
  };
  bindRange('tank-amp', (v) => (0.02 + 0.1 * v).toFixed(3) + ' m', (v) => ts.setWave({ amp: v }));
  bindRange('tank-freq', (v) => (0.8 + 1.4 * v).toFixed(2) + ' Hz', (v) => ts.setWave({ freq: v }));
  for (let g = 0; g < 4; g++) {
    bindRange('tank-d' + g, (v) => v.toFixed(2), (v) => { ts.densities[g] = v; });
  }
  $('btn-drop').addEventListener('click', () => {
    Sound.unlock();
    app.paused = false;
    ts.spawnBatch([0, 1, 2, 3], 0.25);
  });
  setWaveBtn();
}
