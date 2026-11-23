// 果冻场景的灯光、四段预置演示（jelly-center / jelly-multi / jelly-offset）与时间线。
// 演示参数、触发时序和镜头都预置在这里，导出方只按 run 调用。
const JELLY_RUNS = {
  // 一记重球正中落下：包住球、压扁、四周鼓出，再把球弹起，余振平息；果冻不裂
  'jelly-center': {
    title: '正中单击',
    duration: 8.0,
    preset: { soft: 0.62, firm: 0.62 },
    slow: [{ a: 0.8, b: 1.75, f: 0.25 }],
    events: [
      { T: 0.45, fn: (s) => s.spawnBall({ x: 0.004, z: -0.003, h: 0.42, mass: 3.2, radius: 0.058, material: 'stone' }) },
    ],
    cam: (T) => ({ target: [0.0, 0.6, 0.0], yaw: 0.55 + 0.25 * (T / 8), pitch: 0.2 + 0.05 * (T / 8), dist: 1.2 - 0.22 * smooth01(T / 8), fovy: 0.6 }),
  },
  // 一记比一记重的冲击接连落下，最后一击把果冻砸裂，碎块分开后仍在晃动
  'jelly-multi': {
    title: '连击',
    duration: 10.0,
    preset: { soft: 0.5, firm: 0.5 },
    slow: [{ a: 5.7, b: 7.0, f: 0.22 }],
    events: [
      { T: 0.4, fn: (s) => s.spawnBall({ x: 0.0, z: 0.0, h: 0.22, mass: 1.2, radius: 0.05, material: 'stone' }) },
      { T: 2.1, fn: (s) => { s.clearBalls(); s.spawnBall({ x: 0.0, z: 0.0, h: 0.36, mass: 2.2, radius: 0.055, material: 'stone' }); } },
      { T: 3.7, fn: (s) => { s.clearBalls(); s.spawnBall({ x: 0.0, z: 0.0, h: 0.5, mass: 3.4, radius: 0.058, material: 'metal' }); } },
      { T: 5.4, fn: (s) => { s.clearBalls(); s.spawnBall({ x: 0.0, z: 0.0, h: 0.85, mass: 5.5, radius: 0.062, material: 'metal' }); } },
    ],
    cam: (T) => ({ target: [0.0, 0.62, 0.0], yaw: 0.2 - 0.3 * (T / 10), pitch: 0.24, dist: 1.22 - 0.1 * smooth01(T / 10), fovy: 0.6 }),
  },
  // 球偏离中心斜向撞上果冻：果冻倾斜、滑移，球滚落后与台上其他物体相碰；果冻不裂
  'jelly-offset': {
    title: '偏击',
    duration: 8.0,
    preset: { soft: 0.6, firm: 0.62 },
    slow: [{ a: 0.95, b: 1.9, f: 0.25 }],
    events: [
      { T: 0.4, fn: (s) => s.spawnBall({ x: 0.1, z: 0.03, h: 0.42, mass: 3.0, radius: 0.055, material: 'stone', vx: -0.45 }) },
    ],
    cam: (T) => ({ target: [-0.04, 0.6, 0.0], yaw: 0.9 - 0.4 * (T / 8), pitch: 0.2, dist: 1.25 - 0.2 * smooth01(T / 8), fovy: 0.6 }),
  },
};

JellyScene.prototype.runIds = Object.keys(JELLY_RUNS);

// 灯光：方向光（指向光源）与阴影投影矩阵
JellyScene.prototype.lighting = function () {
  if (!this._light) {
    const dir = Vec3.norm([0.42, 0.85, 0.34]);
    const c = [0, 0.55, 0];
    const eye = Vec3.add(c, Vec3.scale(dir, 3));
    const view = Mat4.lookAt(eye, c, [0, 1, 0]);
    const proj = Mat4.ortho(-0.9, 0.9, -0.9, 0.9, 0.5, 6);
    this._light = { dir, vp: Mat4.mul(proj, view) };
  }
  return this._light;
};

// 准备一段演示：恢复初态、套用预置参数、排定事件。返回帧数计算所需的 run。
JellyScene.prototype.beginRun = function (runId) {
  const run = JELLY_RUNS[runId];
  if (!run) throw new Error('未知演示: ' + runId);
  this.resetState();
  if (run.preset) {
    this.params.soft = run.preset.soft;
    this.params.firm = run.preset.firm;
    this.writeMaterials();
  }
  this.run = run;
  this.runId = runId;
  this.timeMap = Timeline.build(run.duration, run.slow);
  for (const ev of run.events) {
    this.scheduleAt(this.timeMap.toSim(ev.T), () => ev.fn(this));
  }
  return run;
};

// 演示时间 T 对应的模拟时间推进
JellyScene.prototype.advanceDemo = function (T) {
  this.advanceTo(this.timeMap.toSim(T));
};

// 演示镜头（返回轨道参数）
JellyScene.prototype.camAt = function (T) {
  if (this.run && this.run.cam) return this.run.cam(T);
  return null;
};
