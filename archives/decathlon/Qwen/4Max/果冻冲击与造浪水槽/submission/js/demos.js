/* 四段演示：时间弯曲（慢放）+ 镜头关键帧 + 预置触发 */
'use strict';
const Demos = {
  active: null,
  defs: {
    'jelly-center': {
      title: '正中单击', scene: 0, duration: 7.5,
      warp: [{ d: 0.34, r: 1 }, { d: 3.30, r: 0.30 }, { d: 7.5, r: 1 }],
      cams: [
        { t: 0.00, pos: [1.35, 0.66, 1.95], tgt: [-0.05, 0.36, 0.12], fov: 38 },
        { t: 0.34, pos: [1.05, 0.52, 1.50], tgt: [-0.05, 0.30, 0.12], fov: 36 },
        { t: 3.60, pos: [0.82, 0.44, 1.12], tgt: [-0.05, 0.26, 0.12], fov: 33 },
        { t: 5.30, pos: [1.90, 1.10, 2.50], tgt: [0.00, 0.30, 0.05], fov: 38 },
        { t: 7.50, pos: [2.60, 1.60, 3.20], tgt: [0.00, 0.30, 0.00], fov: 40 }
      ],
      setup() {
        Scene1.params.softness = 0.55; Scene1.params.toughness = 0.94;
        Scene1.params.mass = 6; Scene1.params.height = 0.62; Scene1.params.material = 'metal'; Scene1.params.target = 0;
        Scene1.reset();
        const j = Scene1.jellies[0];
        const b = Scene1.makeBall(j.center[0], j.bounds[4] + 0.60, j.center[2], 0.13, 6, 'metal');
        b.vy = -0.6;
        Scene1.balls.push(b);
      },
      simEvents: [
        { t: 3.8, fn() { for (const j of Scene1.jellies) j.damping = 2.6; } },
        { t: 4.6, fn() { for (const b of Scene1.balls) { b.vx *= 0.6; b.vz *= 0.6; } } }
      ]
    },
    'jelly-multi': {
      title: '连击碎裂', scene: 0, duration: 9.6,
      warp: [{ d: 2.00, r: 1 }, { d: 5.60, r: 0.35 }, { d: 9.6, r: 1 }],
      cams: [
        { t: 0.00, pos: [1.60, 0.95, 2.30], tgt: [-0.05, 0.38, 0.12], fov: 40 },
        { t: 2.00, pos: [1.20, 0.72, 1.80], tgt: [-0.05, 0.34, 0.12], fov: 37 },
        { t: 4.10, pos: [0.80, 0.46, 1.18], tgt: [-0.05, 0.26, 0.12], fov: 33 },
        { t: 6.60, pos: [1.80, 1.05, 2.40], tgt: [0.00, 0.28, 0.05], fov: 38 },
        { t: 9.60, pos: [2.70, 1.60, 3.30], tgt: [0.00, 0.30, 0.00], fov: 40 }
      ],
      setup() {
        Scene1.params.softness = 0.62; Scene1.params.toughness = 0.34;
        Scene1.params.mass = 5.5; Scene1.params.height = 1.0; Scene1.params.material = 'metal'; Scene1.params.target = 0;
        Scene1.reset();
      },
      simEvents: [
        { t: 0.00, fn() { const j = Scene1.jellies[0]; const b = Scene1.makeBall(j.center[0], j.bounds[4] + 0.72, j.center[2], 0.125, 4.2, 'metal'); b.vy = -0.5; Scene1.balls.push(b); } },
        { t: 1.00, fn() { const j = Scene1.jellies[0]; const b = Scene1.makeBall(j.center[0] + 0.04, j.bounds[4] + 1.02, j.center[2] - 0.03, 0.135, 7.0, 'metal'); b.vy = -0.5; Scene1.balls.push(b); } },
        { t: 2.05, fn() { const j = Scene1.jellies[0]; const b = Scene1.makeBall(j.center[0] - 0.03, j.bounds[4] + 1.45, j.center[2] + 0.02, 0.15, 12.5, 'metal'); b.vy = -0.6; Scene1.balls.push(b); } },
        { t: 5.6, fn() { for (const j of Scene1.jellies) j.damping = 2.8; } },
        { t: 6.4, fn() { for (const b of Scene1.balls) { b.vx *= 0.5; b.vz *= 0.5; } } }
      ]
    },
    'jelly-offset': {
      title: '偏心偏击', scene: 0, duration: 7.6,
      warp: [{ d: 0.40, r: 1 }, { d: 2.60, r: 0.40 }, { d: 7.6, r: 1 }],
      cams: [
        { t: 0.00, pos: [-0.10, 0.85, 2.20], tgt: [-0.90, 0.42, -0.10], fov: 40 },
        { t: 1.20, pos: [-0.55, 0.55, 1.60], tgt: [-0.88, 0.32, -0.10], fov: 36 },
        { t: 3.60, pos: [0.40, 0.72, 2.00], tgt: [-0.30, 0.26, 0.20], fov: 38 },
        { t: 5.60, pos: [1.60, 1.10, 2.70], tgt: [-0.10, 0.28, 0.05], fov: 39 },
        { t: 7.60, pos: [2.60, 1.60, 3.20], tgt: [0.00, 0.30, 0.00], fov: 40 }
      ],
      setup() {
        Scene1.params.softness = 0.45; Scene1.params.toughness = 0.96;
        Scene1.params.mass = 5; Scene1.params.height = 0.9; Scene1.params.material = 'stone'; Scene1.params.target = 2;
        Scene1.reset();
        const j = Scene1.jellies[2];
        const b = Scene1.makeBall(j.center[0] + 0.21, j.bounds[4] + 0.72, j.center[2] + 0.10, 0.16, 5, 'stone');
        b.vx = -0.35; b.vy = -0.8; b.vz = 0.05;
        Scene1.balls.push(b);
      },
      simEvents: [
        { t: 4.6, fn() { for (const j of Scene1.jellies) j.damping = 2.6; } },
        { t: 5.4, fn() { for (const b of Scene1.balls) { b.vx *= 0.55; b.vz *= 0.55; } } }
      ]
    },
    'tank-full': {
      title: '风浪全程', scene: 1, duration: 19.8,
      warp: [{ d: 0.45, r: 1 }, { d: 1.25, r: 0.55 }, { d: 10.00, r: 1 }, { d: 13.30, r: 0.50 }, { d: 19.8, r: 1 }],
      cams: [
        { t: 0.00, pos: [2.90, 1.50, 3.40], tgt: [0.00, 0.45, 0.00], fov: 44 },
        { t: 1.60, pos: [1.60, 0.95, 2.60], tgt: [-0.40, 0.45, 0.00], fov: 42 },
        { t: 4.50, pos: [0.40, 0.80, 2.90], tgt: [-0.60, 0.42, 0.00], fov: 42 },
        { t: 8.00, pos: [-0.40, 0.62, 2.40], tgt: [0.30, 0.45, 0.00], fov: 40 },
        { t: 10.20, pos: [0.90, 0.44, 1.70], tgt: [0.65, 0.42, 0.05], fov: 36 },
        { t: 13.30, pos: [1.40, 0.72, 2.20], tgt: [0.80, 0.40, 0.00], fov: 38 },
        { t: 16.20, pos: [2.20, 0.95, 2.90], tgt: [0.00, 0.34, 0.00], fov: 41 },
        { t: 19.80, pos: [2.90, 1.60, 3.50], tgt: [0.00, 0.35, 0.00], fov: 42 }
      ],
      setup() {
        Scene2.wave.amp = 0.035; Scene2.wave.freq = 0.72;
        Scene2.reset();
        Scene2.dropBalls();
      },
      simEvents: [
        { t: 2.80, fn() { Scene2.wave.amp = 0.035; Scene2.startWave(); } },
        { t: 5.60, fn() { Scene2.wave.amp = 0.070; } },
        { t: 8.60, fn() { Scene2.wave.amp = 0.105; } },
        { t: 13.80, fn() { Scene2.stopWave(); } },
        { t: 15.60, fn() { Scene2.extraDamp = 0.020; } },
        { t: 17.00, fn() { Scene2.extraDamp = 0.050; } }
      ]
    }
  },
  simAtDemo(def, t) {
    let sim = 0, prev = 0;
    for (const s of def.warp) {
      const end = s.d;
      if (t <= end) { sim += (t - prev) * s.r; return sim; }
      sim += (end - prev) * s.r; prev = end;
    }
    return sim;
  },
  totalSim(def) { return this.simAtDemo(def, def.duration); },
  cameraAt(def, t, out) {
    const keys = def.cams;
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    }
    const span = Math.max(1e-5, b.t - a.t);
    const u = smootherstep(clamp((t - a.t) / span, 0, 1));
    out.pos = [lerp(a.pos[0], b.pos[0], u), lerp(a.pos[1], b.pos[1], u), lerp(a.pos[2], b.pos[2], u)];
    out.target = [lerp(a.tgt[0], b.tgt[0], u), lerp(a.tgt[1], b.tgt[1], u), lerp(a.tgt[2], b.tgt[2], u)];
    out.fov = lerp(a.fov, b.fov, u);
    return out;
  },
  begin(id) {
    const def = this.defs[id];
    if (!def) throw new Error('unknown run: ' + id);
    App.switchScene(def.scene, true);
    def.setup();
    const st = {
      id, def, demoTime: 0, simTime: 0, evIdx: 0,
      camera: { pos: def.cams[0].pos.slice(), target: def.cams[0].tgt.slice(), fov: def.cams[0].fov }
    };
    this.active = st;
    this.cameraAt(def, 0, st.camera);
    this.applyCamera(st);
    return st;
  },
  applyCamera(st) {
    const sc = st.def.scene === 0 ? Scene1 : Scene2;
    sc.camera.pos = st.camera.pos;
    sc.camera.target = st.camera.target;
    sc.camera.fov = st.camera.fov;
  },
  /* 推进到演示时间 t（秒），固定步长，确定性 */
  async advanceTo(t) {
    const st = this.active;
    if (!st) return;
    const def = st.def;
    t = clamp(t, 0, def.duration);
    const targetSim = this.simAtDemo(def, t);
    const DT = App.DT;
    const sc = def.scene === 0 ? Scene1 : Scene2;
    let guard = 0;
    while (st.simTime < targetSim - 1e-9 && guard < 6000) {
      // 事件
      while (st.evIdx < def.simEvents.length && def.simEvents[st.evIdx].t <= st.simTime + 1e-9) {
        def.simEvents[st.evIdx].fn(); st.evIdx++;
      }
      await sc.step(DT);
      st.simTime += DT;
      guard++;
      if (def.scene === 0) App.drainEvents(Scene1);
      else App.drainEvents(Scene2);
    }
    while (st.evIdx < def.simEvents.length && def.simEvents[st.evIdx].t <= targetSim + 1e-9) {
      def.simEvents[st.evIdx].fn(); st.evIdx++;
    }
    st.demoTime = t;
    this.cameraAt(def, t, st.camera);
    this.applyCamera(st);
  },
  end() {
    this.active = null;
  }
};
window.Demos = Demos;
