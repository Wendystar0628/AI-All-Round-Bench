/* 场景二：多密度球与造浪水槽（FLIP 流体耦合） */
'use strict';
const Scene2 = {
  id: 1,
  OX: -1.5, OZ: -0.5,
  balls: [],
  groups: [
    { density: 0.32, color: [1.00, 0.30, 0.42], name: '轻浮组' },
    { density: 0.60, color: [1.00, 0.69, 0.13], name: '次浮组' },
    { density: 1.00, color: [0.24, 0.86, 0.52], name: '中性组' },
    { density: 2.30, color: [0.31, 0.54, 1.00], name: '重底组' }
  ],
  wave: { on: false, amp: 0.065, freq: 0.75, phase: 0, env: 0 },
  paddle: { x: 0.14, v: 0, top: 0.90 },
  time: 0, extraDamp: 0,
  camera: { pos: [2.7, 1.75, 3.5], target: [0, 0.32, 0], fov: 42 },
  events: [],
  R_BALL: 0.048,
  init() { this.reset(); },
  ballVolume() { return 4 / 3 * Math.PI * Math.pow(this.R_BALL, 3); },
  reset() {
    this.time = 0; this.extraDamp = 0;
    this.wave.on = false; this.wave.env = 0; this.wave.phase = 0;
    this.paddle.x = 0.14; this.paddle.v = 0;
    this.events = [];
    FL.resetParticles();
    const rng = makeRng(42);
    this.balls = [];
    const V = this.ballVolume();
    for (let g = 0; g < 4; g++) {
      for (let i = 0; i < 7; i++) {
        const x = 0.72 + g * 0.52 + (i % 3) * 0.15 + (rng() - 0.5) * 0.06;
        const z = 0.22 + Math.floor(i / 3) * 0.24 + (rng() - 0.5) * 0.08;
        const dens = this.groups[g].density;
        let y;
        if (dens < 0.98) y = FL.WATER_DEPTH + this.R_BALL * (1 - 2 * Math.min(dens, 0.95)) + 0.005;
        else if (dens < 1.05) y = FL.WATER_DEPTH - this.R_BALL - 0.03 - i * 0.012;
        else y = FL.terrainH(x, z) + this.R_BALL + 0.004;
        this.balls.push(this.makeBall(x, y, z, dens, g));
      }
    }
  },
  makeBall(x, y, z, density, group) {
    const V = this.ballVolume();
    const m = density * 1000 * V;
    return {
      x, y, z, vx: 0, vy: 0, vz: 0, r: this.R_BALL, m, invM: 1 / m,
      density, group, quat: [0, 0, 0, 1], angVel: [0, 0, 0],
      sub: 0, prevSub: 0, surfY: FL.WATER_DEPTH, lastSplash: -9
    };
  },
  dropBalls() {
    const rng = makeRng((this.time * 1000 | 0) + 13);
    const V = this.ballVolume();
    this.balls = [];
    for (let g = 0; g < 4; g++) {
      for (let i = 0; i < 7; i++) {
        const x = 0.70 + g * 0.50 + (i % 3) * 0.17 + (rng() - 0.5) * 0.08;
        const z = 0.20 + Math.floor(i / 3) * 0.26 + (rng() - 0.5) * 0.10;
        const y = 0.98 + i * 0.075 + g * 0.05 + rng() * 0.03;
        const b = this.makeBall(x, y, z, this.groups[g].density, g);
        b.vy = -0.4 - rng() * 0.3;
        b.vx = (rng() - 0.5) * 0.1;
        this.balls.push(b);
      }
    }
    this.events.push({ type: 'release' });
  },
  startWave() { this.wave.on = true; this.events.push({ type: 'waveStart' }); },
  stopWave() { this.wave.on = false; this.events.push({ type: 'waveStop' }); },
  async step(dt) {
    this.time += dt;
    const W = this.wave;
    const target = W.on ? 1 : 0;
    const rate = W.on ? 0.9 : 1.4;
    W.env += clamp(target - W.env, -rate * dt, rate * dt);
    if (W.env > 0.001 || W.on) W.phase += 2 * Math.PI * W.freq * dt;
    const amp = W.amp * W.env;
    this.paddle.x = 0.14 + amp * Math.sin(W.phase);
    this.paddle.v = amp * 2 * Math.PI * W.freq * Math.cos(W.phase);
    if (this.paddle.x < 0.03) { this.paddle.x = 0.03; this.paddle.v = Math.max(0, this.paddle.v); }
    const V = this.ballVolume();
    const AW = Math.PI * this.R_BALL * this.R_BALL;
    for (let bi = 0; bi < this.balls.length; bi++) {
      const b = this.balls[bi];
      const f0 = FL.forces[bi * 8], f1 = FL.forces[bi * 8 + 1], f2 = FL.forces[bi * 8 + 2], f3 = FL.forces[bi * 8 + 3];
      const f4 = FL.forces[bi * 8 + 4], f5 = FL.forces[bi * 8 + 5], f6 = FL.forces[bi * 8 + 6], f7 = FL.forces[bi * 8 + 7];
      const sub = clamp(f0, 0, 1);
      b.prevSub = b.sub; b.sub = sub; b.surfY = f4;
      let fx = 0, fy = -b.m * 9.8, fz = 0;
      fy += 1000 * V * sub * 9.8;
      // Froude-Krylov（流体加速度压力）
      const amax = 26;
      fx += 1000 * V * sub * clamp(f5, -amax, amax);
      fy += 1000 * V * sub * clamp(f6, -amax, amax);
      fz += 1000 * V * sub * clamp(f7, -amax, amax);
      // 阻力
      const ux = f1 - b.vx, uy = f2 - b.vy, uz = f3 - b.vz;
      const um = Math.hypot(ux, uy, uz);
      const cd = 0.5 * 1000 * 0.85 * AW * um * sub + 0.9 * sub;
      fx += cd * ux; fy += cd * uy; fz += cd * uz;
      const meff = b.m + 0.5 * 1000 * V * sub;
      b.vx += fx / meff * dt; b.vy += fy / meff * dt; b.vz += fz / meff * dt;
      const spd = Math.hypot(b.vx, b.vy, b.vz);
      if (spd > 6) { b.vx *= 6 / spd; b.vy *= 6 / spd; b.vz *= 6 / spd; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      // 槽底 / 地形
      const bh = FL.terrainH(b.x, b.z) + b.r;
      if (b.y < bh) {
        b.y = bh;
        if (b.vy < 0) b.vy = -b.vy * 0.18;
        b.vx *= Math.max(0, 1 - 2.6 * dt); b.vz *= Math.max(0, 1 - 2.6 * dt);
        b.angVel[0] = b.vz / b.r * 0.8; b.angVel[2] = -b.vx / b.r * 0.8;
      }
      // 壁
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * 0.3; }
      if (b.x > FL.LX - b.r) { b.x = FL.LX - b.r; if (b.vx > 0) b.vx = -b.vx * 0.3; }
      if (b.z < b.r) { b.z = b.r; if (b.vz < 0) b.vz = -b.vz * 0.3; }
      if (b.z > FL.LZ - b.r) { b.z = FL.LZ - b.r; if (b.vz > 0) b.vz = -b.vz * 0.3; }
      if (b.y > 2.2) { b.y = 2.2; b.vy = Math.min(b.vy, 0); }
      // 入水事件
      if (b.prevSub < 0.08 && sub > 0.12 && Math.abs(b.vy) > 0.7 && this.time - b.lastSplash > 0.3) {
        this.events.push({ type: 'splash', intensity: clamp(Math.abs(b.vy) / 3.5, 0.2, 1) * clamp(b.density, 0.4, 2) });
        b.lastSplash = this.time;
      }
      // 滚动
      const q = b.quat, av = b.angVel;
      const hx = av[0] * dt * 0.5, hy = av[1] * dt * 0.5, hz = av[2] * dt * 0.5;
      const qw = q[3], qx = q[0], qy = q[1], qz = q[2];
      q[0] += hx * qw + hy * qz - hz * qy;
      q[1] += hy * qw + hz * qx - hx * qz;
      q[2] += hz * qw + hx * qy - hy * qx;
      q[3] += -hx * qx - hy * qy - hz * qz;
      const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
      b.angVel[0] *= 0.99; b.angVel[2] *= 0.99;
    }
    // 球-球
    for (let a = 0; a < this.balls.length; a++) for (let c = a + 1; c < this.balls.length; c++) {
      const A = this.balls[a], B = this.balls[c];
      const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const rr = A.r + B.r;
      if (d < rr) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const pen = (rr - d) * 0.5;
        A.x -= nx * pen; A.y -= ny * pen; A.z -= nz * pen;
        B.x += nx * pen; B.y += ny * pen; B.z += nz * pen;
        const rn = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny + (B.vz - A.vz) * nz;
        if (rn < 0) {
          const jimp = -(1 + 0.3) * rn / (A.invM + B.invM);
          A.vx -= jimp * A.invM * nx; A.vy -= jimp * A.invM * ny; A.vz -= jimp * A.invM * nz;
          B.vx += jimp * B.invM * nx; B.vy += jimp * B.invM * ny; B.vz += jimp * B.invM * nz;
        }
      }
    }
    await FL.step({
      dt, gravity: 9.8, flip: 0.95, damp: 0.05, extraDamp: this.extraDamp,
      paddleX: this.paddle.x, paddleV: this.paddle.v, paddleTop: this.paddle.top,
      time: this.time, balls: this.balls, foamGain: 2.6
    });
  },
  buildDraw(R) {
    const opaque = [], glass = [];
    const add = (mesh, model, color, params, noShadow) => opaque.push({ mesh, model, color, params, noShadow });
    const OX = this.OX, OZ = this.OZ;
    add(R.meshes.plane, M4.compose(M4.create(), 0, -0.95, 0, 34, 1, 34, [0, 0, 0, 1]), [0.10, 0.12, 0.17], [3, 0, 0, 1], true);
    // 底座
    add(R.meshes.box, M4.compose(M4.create(), 0, -0.49, 0, 3.34, 0.87, 1.34, [0, 0, 0, 1]), [0.13, 0.14, 0.18], [0, 0.35, 0.5, 1]);
    add(R.meshes.box, M4.compose(M4.create(), 0, -0.045, 0, 3.42, 0.03, 1.42, [0, 0, 0, 1]), [0.28, 0.30, 0.36], [0, 0.7, 0.3, 1]);
    // 槽底（焦散）
    add(R.meshes.box, M4.compose(M4.create(), 0, -0.014, 0, 3.04, 0.028, 1.04, [0, 0, 0, 1]), [0.55, 0.53, 0.44], [4, 0, 0.8, 1], true);
    // 地形
    if (!R.meshes.terrain) R.meshes.terrain = R.makeTerrain();
    add(R.meshes.terrain, M4.compose(M4.create(), OX, 0.001, OZ, 1, 1, 1, [0, 0, 0, 1]), [0.60, 0.56, 0.45], [4, 0, 0.8, 1], true);
    // 造浪板 + 机构
    const px = this.paddle.x + OX;
    add(R.meshes.box, M4.compose(M4.create(), px - 0.026, 0.45, OZ + 0.5, 0.052, 0.90, 0.99, [0, 0, 0, 1]), [0.68, 0.70, 0.76], [0, 0.9, 0.32, 1]);
    add(R.meshes.box, M4.compose(M4.create(), px - 0.30, 0.93, OZ + 0.5, 0.56, 0.055, 0.07, [0, 0, 0, 1]), [0.45, 0.47, 0.52], [0, 0.85, 0.4, 1]);
    add(R.meshes.box, M4.compose(M4.create(), OX - 0.36, 0.90, OZ + 0.5, 0.30, 0.30, 0.42, [0, 0, 0, 1]), [0.22, 0.24, 0.30], [0, 0.5, 0.45, 1]);
    // 框架
    const fc = [0.38, 0.40, 0.46], fp = [0, 0.85, 0.38, 1];
    const hw = 1.52, hd = 0.52, th = 0.042;
    for (const sx of [-hw, hw]) for (const sz of [-hd, hd]) {
      add(R.meshes.box, M4.compose(M4.create(), sx, 0.53, sz, th, 1.10, th, [0, 0, 0, 1]), fc, fp);
    }
    for (const sy of [0.0, 1.06]) {
      add(R.meshes.box, M4.compose(M4.create(), 0, sy, -hd, 2 * hw + th, th, th, [0, 0, 0, 1]), fc, fp);
      add(R.meshes.box, M4.compose(M4.create(), 0, sy, hd, 2 * hw + th, th, th, [0, 0, 0, 1]), fc, fp);
      add(R.meshes.box, M4.compose(M4.create(), -hw, sy, 0, th, th, 2 * hd + th, [0, 0, 0, 1]), fc, fp);
      add(R.meshes.box, M4.compose(M4.create(), hw, sy, 0, th, th, 2 * hd + th, [0, 0, 0, 1]), fc, fp);
    }
    // 玻璃
    const gc = [0.72, 0.86, 0.92, 1], gp = [2, 0, 0, 1];
    glass.push({ mesh: R.meshes.box, model: M4.compose(M4.create(), 0, 0.525, OZ - 0.016, 3.06, 1.05, 0.028, [0, 0, 0, 1]), color: gc, params: gp });
    glass.push({ mesh: R.meshes.box, model: M4.compose(M4.create(), 0, 0.525, OZ + 1.016, 3.06, 1.05, 0.028, [0, 0, 0, 1]), color: gc, params: gp });
    glass.push({ mesh: R.meshes.box, model: M4.compose(M4.create(), OX - 0.016, 0.525, OZ + 0.5, 0.028, 1.05, 1.06, [0, 0, 0, 1]), color: gc, params: gp });
    glass.push({ mesh: R.meshes.box, model: M4.compose(M4.create(), OX + 3.016, 0.525, OZ + 0.5, 0.028, 1.05, 1.06, [0, 0, 0, 1]), color: gc, params: gp });
    // 球
    const n = this.balls.length;
    for (let i = 0; i < n; i++) {
      const b = this.balls[i];
      const c = this.groups[b.group].color;
      M4.compose(R.instData.subarray(i * 24, i * 24 + 16), b.x + OX, b.y, b.z + OZ, b.r, b.r, b.r, b.quat);
      R.instData.set([c[0], c[1], c[2], 1], i * 24 + 16);
      R.instData.set([5, 0.1, 0.30, 1], i * 24 + 20);
    }
    if (n > 0) GFX.device.queue.writeBuffer(R.instBuf, 0, R.instData.subarray(0, n * 24));
    return {
      camera: this.camera, time: this.time, sceneId: 1,
      opaque, jellyDraws: [], glass,
      balls: { count: n }, water: true,
      opts: { shadowCenter: [0, 0.3, 0], shadowExtent: 3.2, subject: [0, 0, 0], rimColor: [0.25, 0.62, 0.95], exposure: 1.12 }
    };
  }
};
window.Scene2 = Scene2;
