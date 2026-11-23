/* 场景一：重球冲击果冻 */
'use strict';
const Scene1 = {
  id: 0,
  jellies: [], balls: [], pending: [],
  time: 0, stepCount: 0,
  params: { softness: 0.55, toughness: 0.5, mass: 6, height: 1.3, material: 'metal', target: 0 },
  camera: { pos: [2.7, 1.75, 3.3], target: [0, 0.32, 0], fov: 40 },
  events: [],
  floorAt(x, z) { return (Math.abs(x) < 1.9 && Math.abs(z) < 1.2) ? 0 : -0.95; },
  init() { this.reset(); },
  makeJellies() {
    const P = this.params;
    const soft = P.softness, tough = P.toughness;
    this.jellies = [
      new Jelly({ shape: 'box', center: [-0.05, 0, 0.12], size: [0.52, 0.44, 0.52], gridN: [8, 7, 8], color: [0.96, 0.26, 0.40], softness: soft, toughness: tough, density: 150 }),
      new Jelly({ shape: 'cyl', center: [0.95, 0, -0.18], size: [0.60, 0.46, 0.60], gridN: [10, 8, 10], color: [0.46, 0.86, 0.26], softness: clamp(soft * 0.8, 0.05, 1), toughness: clamp(tough + 0.15, 0, 1), density: 160 }),
      new Jelly({ shape: 'pudding', center: [-0.98, 0, -0.15], size: [0.46, 0.58, 0.46], gridN: [8, 9, 8], color: [0.38, 0.48, 0.96], softness: clamp(soft * 0.6, 0.05, 1), toughness: clamp(tough + 0.30, 0, 1), density: 170 })
    ];
    for (const j of this.jellies) j.updateBounds();
  },
  reset() {
    this.time = 0; this.stepCount = 0;
    this.pending = [];
    this.events = [];
    this.makeJellies();
    const rng = makeRng(7);
    this.balls = [
      this.makeBall(0.45, 0.11, 0.60, 0.11, 3.2, 'metal'),
      this.makeBall(-0.50, 0.11, 0.66, 0.10, 2.6, 'stone')
    ];
    this.balls[0].prop = true; this.balls[1].prop = true;
  },
  makeBall(x, y, z, r, m, material) {
    return {
      x, y, z, vx: 0, vy: 0, vz: 0, r, m, invM: 1 / m,
      px: x, py: y, pz: z,
      quat: [0, 0, 0, 1], angVel: [0, 0, 0],
      material, color: material === 'metal' ? [0.78, 0.79, 0.83] : [0.58, 0.53, 0.47],
      contact: false, jellyHit: 0, lastSnd: -9, active: true, sleep: false
    };
  },
  applyParams() {
    const P = this.params;
    const j0 = this.jellies[0];
    if (j0) { j0.softness = P.softness; j0.toughness = P.toughness; }
    if (this.jellies[1]) { this.jellies[1].softness = clamp(P.softness * 0.8, 0.05, 1); this.jellies[1].toughness = clamp(P.toughness + 0.15, 0, 1); }
    if (this.jellies[2]) { this.jellies[2].softness = clamp(P.softness * 0.6, 0.05, 1); this.jellies[2].toughness = clamp(P.toughness + 0.30, 0, 1); }
  },
  targetJelly() { return this.jellies[this.params.target] || this.jellies[0]; },
  trigger(mode) {
    const P = this.params;
    const j = this.targetJelly();
    const topY = j.bounds ? j.bounds[4] : j.size[1];
    const cx = j.center[0], cz = j.center[2];
    const r = P.material === 'metal' ? 0.13 : 0.16;
    const spawn = (x, y, z, vx, vy, vz, m) => {
      const b = this.makeBall(x, y, z, r, m, P.material);
      b.vx = vx; b.vy = vy; b.vz = vz;
      this.balls.push(b);
      return b;
    };
    if (mode === 'center') {
      spawn(cx, topY + P.height, cz, 0, -0.2, 0, P.mass);
    } else if (mode === 'offset') {
      const hw = j.size[0] * 0.5;
      spawn(cx + hw * 0.72, topY + P.height * 0.85, cz + 0.05, -0.55, -0.4, 0.08, P.mass);
    } else if (mode === 'multi') {
      const now = this.time;
      this.pending.push({ t: now, x: cx, z: cz, h: P.height * 0.75, m: P.mass * 0.75, r });
      this.pending.push({ t: now + 0.55, x: cx + 0.04, z: cz - 0.03, h: P.height * 1.05, m: P.mass * 1.35, r });
      this.pending.push({ t: now + 1.10, x: cx - 0.03, z: cz + 0.02, h: P.height * 1.5, m: P.mass * 2.1, r });
    }
    this.events.push({ type: 'trigger', mode });
  },
  step(dt) {
    this.time += dt; this.stepCount++;
    const P = this.params;
    // 待投放
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (this.time >= p.t) {
        const j = this.targetJelly();
        const topY = j.bounds ? j.bounds[4] : j.size[1];
        const b = this.makeBall(p.x, topY + p.h, p.z, p.r, p.m, P.material);
        b.vy = -0.2;
        this.balls.push(b);
        this.pending.splice(i, 1);
      }
    }
    // 球自由积分
    for (const b of this.balls) {
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.contact = false; b.jellyHit = 0;
      b.vy -= 9.8 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
    // 果冻 XPBD 子步
    const SUB = 6, h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const j of this.jellies) j.substep(h, this.balls, 0, this);
    }
    Jelly.fragmentCollide(this.jellies);
    for (const j of this.jellies) j.updateBounds();
    // 球速度回写 + 碰撞
    for (const b of this.balls) {
      if (b.contact) {
        b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt; b.vz = (b.z - b.pz) / dt;
        // 滚动角速度
        const tx = b.vx, tz = b.vz;
        b.angVel[0] = tz / b.r * 0.7; b.angVel[2] = -tx / b.r * 0.7;
        if (b.jellyHit > 0.004 && this.time - b.lastSnd > 0.18) {
          const spd = Math.hypot(b.vx, b.vy, b.vz);
          this.events.push({ type: 'jellyImpact', intensity: clamp(spd / 5, 0.15, 1) * clamp(b.m / 8, 0.3, 1.4) });
          b.lastSnd = this.time;
        }
      }
      const fl = this.floorAt(b.x, b.z) + b.r;
      if (b.y < fl) {
        b.y = fl;
        if (b.vy < 0) {
          const rest = b.material === 'metal' ? 0.42 : 0.28;
          if (Math.abs(b.vy) > 0.6) this.events.push({ type: 'floorHit', intensity: clamp(Math.abs(b.vy) / 5, 0.1, 1) });
          b.vy = -b.vy * rest;
          if (Math.abs(b.vy) < 0.25) b.vy = 0;
        }
        b.vx *= 0.988; b.vz *= 0.988;
        b.angVel[0] = b.vz / b.r; b.angVel[2] = -b.vx / b.r;
      }
      // 角速度积分
      const q = b.quat, av = b.angVel;
      const hx = av[0] * dt * 0.5, hy = av[1] * dt * 0.5, hz = av[2] * dt * 0.5;
      const qw = q[3], qx = q[0], qy = q[1], qz = q[2];
      q[0] += hx * qw + hy * qz - hz * qy;
      q[1] += hy * qw + hz * qx - hx * qz;
      q[2] += hz * qw + hx * qy - hy * qx;
      q[3] += -hx * qx - hy * qy - hz * qz;
      const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
      b.angVel[0] *= 0.995; b.angVel[1] *= 0.995; b.angVel[2] *= 0.995;
    }
    // 球-球
    for (let a = 0; a < this.balls.length; a++) for (let c = a + 1; c < this.balls.length; c++) {
      const A = this.balls[a], B = this.balls[c];
      const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const rr = A.r + B.r;
      if (d < rr) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const pen = rr - d;
        const wa = A.invM / (A.invM + B.invM), wb = B.invM / (A.invM + B.invM);
        A.x -= nx * pen * wa; A.y -= ny * pen * wa; A.z -= nz * pen * wa;
        B.x += nx * pen * wb; B.y += ny * pen * wb; B.z += nz * pen * wb;
        const rvx = B.vx - A.vx, rvy = B.vy - A.vy, rvz = B.vz - A.vz;
        const rn = rvx * nx + rvy * ny + rvz * nz;
        if (rn < 0) {
          const e = 0.45;
          const jimp = -(1 + e) * rn / (A.invM + B.invM);
          A.vx -= jimp * A.invM * nx; A.vy -= jimp * A.invM * ny; A.vz -= jimp * A.invM * nz;
          B.vx += jimp * B.invM * nx; B.vy += jimp * B.invM * ny; B.vz += jimp * B.invM * nz;
          if (Math.abs(rn) > 0.5) this.events.push({ type: 'clink', intensity: clamp(Math.abs(rn) / 4, 0.1, 1) });
        }
      }
    }
    // 断裂判据
    if (this.stepCount % 3 === 0) {
      for (const j of this.jellies) {
        const stretchLimit = 0.42 + j.toughness * 1.30;
        const volLimit = 0.50 + j.toughness * 0.90;
        const nb = j.fracture(stretchLimit, volLimit, 55);
        if (nb > 0) {
          this.events.push({ type: 'crack', intensity: clamp(nb / 30, 0.3, 1) });
        }
      }
    }
    // 清理出界球
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.y < -3 || Math.abs(b.x) > 8 || Math.abs(b.z) > 8) this.balls.splice(i, 1);
    }
  },
  buildDraw(R) {
    const opaque = [];
    const add = (mesh, model, color, params, noShadow) => opaque.push({ mesh, model, color, params, noShadow });
    // 地面
    add(R.meshes.plane, M4.compose(M4.create(), 0, -0.95, 0, 34, 1, 34, [0, 0, 0, 1]), [0.10, 0.12, 0.17], [3, 0, 0, 1], true);
    // 舞台
    add(R.meshes.box, M4.compose(M4.create(), 0, -0.08, 0, 3.8, 0.16, 2.4, [0, 0, 0, 1]), [0.17, 0.18, 0.23], [0, 0.15, 0.45, 1]);
    add(R.meshes.box, M4.compose(M4.create(), 0, -0.005, 0, 3.84, 0.012, 2.44, [0, 0, 0, 1]), [0.30, 0.32, 0.40], [0, 0.6, 0.3, 1]);
    for (const sx of [-1.7, 1.7]) for (const sz of [-1.0, 1.0]) {
      add(R.meshes.box, M4.compose(M4.create(), sx, -0.555, sz, 0.12, 0.79, 0.12, [0, 0, 0, 1]), [0.12, 0.13, 0.16], [0, 0.4, 0.5, 1]);
    }
    const jellyDraws = this.jellies.map(j => ({ jelly: j, color: [j.color[0], j.color[1], j.color[2], 0.90] }));
    // 球实例
    const n = this.balls.length;
    for (let i = 0; i < n; i++) {
      const b = this.balls[i];
      M4.compose(R.instData.subarray(i * 24, i * 24 + 16), b.x, b.y, b.z, b.r, b.r, b.r, b.quat);
      R.instData.set([b.color[0], b.color[1], b.color[2], 1], i * 24 + 16);
      const metal = b.material === 'metal' ? 1 : 0;
      R.instData.set([5, metal, metal ? 0.24 : 0.75, 1], i * 24 + 20);
    }
    if (n > 0) GFX.device.queue.writeBuffer(R.instBuf, 0, R.instData.subarray(0, n * 24));
    return {
      camera: this.camera, time: this.time, sceneId: 0,
      opaque, jellyDraws, glass: [],
      balls: { count: n }, water: false,
      opts: { shadowCenter: [0, 0.3, 0], shadowExtent: 3.0, subject: [0, 0, 0], rimColor: [0.85, 0.30, 0.62], exposure: 1.12 }
    };
  }
};
window.Scene1 = Scene1;
