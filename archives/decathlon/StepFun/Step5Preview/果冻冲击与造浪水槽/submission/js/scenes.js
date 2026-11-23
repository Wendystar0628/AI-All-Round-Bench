window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  const U = APP.util;

  function smooth(a, b, t) { const x = Math.max(0, Math.min(1, (t - a) / (b - a || 1))); return x * x * (3 - 2 * x); }

  function evalTrack(track, t) {
    if (!track || !track.length) return null;
    if (t <= track[0].t) return { p: track[0].p.slice(), tg: track[0].t2.slice(), f: track[0].f };
    for (let i = 0; i < track.length - 1; i++) {
      const a = track[i], b = track[i + 1];
      if (t <= b.t) {
        const k = smooth(a.t, b.t, t);
        return {
          p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k],
          tg: [a.t2[0] + (b.t2[0] - a.t2[0]) * k, a.t2[1] + (b.t2[1] - a.t2[1]) * k, a.t2[2] + (b.t2[2] - a.t2[2]) * k],
          f: a.f + (b.f - a.f) * k,
        };
      }
    }
    const l = track[track.length - 1];
    return { p: l.p.slice(), tg: l.t2.slice(), f: l.f };
  }

  function simTimeAt(segs, t) {
    let s = 0, last = 0;
    for (const sg of segs) {
      const t1 = Math.min(t, sg[1]);
      if (t1 > last) s += (t1 - last) * sg[2];
      if (t <= sg[1]) return s;
      last = sg[1];
    }
    return s;
  }

  const LIGHT = { dir: [0.42, 0.82, 0.38], intensity: 3.1, color: [1.0, 0.95, 0.88] };
  const ENV_BASE = { top: [0.26, 0.35, 0.52], bottom: [0.055, 0.062, 0.085], exposure: 1.0 };

  function ballBuf(n) {
    return APP.R.createBuffer(n * 64, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  }

  // ================= SCENE 1 : JELLY =================
  class SceneJelly {
    constructor() {
      this.id = 'jelly';
      this.title = '重球冲击果冻';
      this.cam = new U.OrbitCam();
      this.cam.target = { x: -0.1, y: 0.4, z: 0.05 };
      this.cam.dist = 3.7; this.cam.yaw = 0.72; this.cam.pitch = 0.2; this.cam.fov = 42 * U.DEG;
      this.params = { softness: 0.62, sturdiness: 0.85, ballDensity: 4200, dropHeight: 0.85, ballRadius: 0.09 };
      this.balls = [];
      this.maxBalls = 8;
      this.demo = null; this.demoT = 0; this.simT = 0; this.fired = [];
      this.time = 0;
    }

    async init() {
      this.ballBuf = ballBuf(this.maxBalls);
      this.ballData = new Float32Array(this.maxBalls * 16);
      this.reset();
      return true;
    }

    reset() {
      const P = this.params;
      this.jellies = [];
      this.jellies.push(new APP.Jelly({
        id: 0, size: [0.42, 0.34, 0.30], segs: [8, 7, 6], center: [-0.62, 0.17, 0.0],
        color: [0.95, 0.32, 0.42, 1], softness: P.softness, sturdiness: P.sturdiness, density: 1400,
      }));
      this.jellies.push(new APP.Jelly({
        id: 1, size: [0.3, 0.4, 0.3], segs: [6, 8, 6], center: [0.82, 0.2, -0.5],
        color: [0.3, 0.82, 0.5, 1], softness: 0.12, sturdiness: 0.97, density: 1500,
      }));
      this.jellies.push(new APP.Jelly({
        id: 2, size: [0.32, 0.28, 0.32], segs: [7, 6, 7], center: [0.1, 0.14, 0.72],
        color: [0.55, 0.45, 0.95, 1], softness: 0.45, sturdiness: 0.72, density: 1400, roundTop: true,
      }));
      this.balls = [];
      this.props = [
        { x: 1.5, y: 0.085, z: 0.42, r: 0.085, color: [0.42, 0.4, 0.38, 1], metallic: 0.0, roughness: 0.9, static: true },
        { x: 1.72, y: 0.06, z: -0.1, r: 0.06, color: [0.75, 0.72, 0.66, 1], metallic: 0.0, roughness: 0.75, static: true },
      ];
      this.fractureCount = 0;
      this.sfxT = 0;
      this.demoT = 0; this.simT = 0; this.fired = [];
    }

    setParam(name, v) {
      this.params[name] = v;
      if (name === 'softness' && this.jellies) this.jellies[0].softness = v;
      if (name === 'sturdiness' && this.jellies) this.jellies[0].sturdiness = v;
    }

    dropBall(o) {
      if (this.balls.length >= this.maxBalls) this.balls.shift();
      const r = o.radius || this.params.ballRadius;
      const dens = o.density === undefined ? this.params.ballDensity : o.density;
      const V = 4 / 3 * Math.PI * r * r * r;
      const metal = o.material !== 'stone';
      const b = {
        x: o.x, y: o.y, z: o.z,
        vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
        r, mass: dens * V, density: dens,
        color: metal ? [0.93, 0.94, 0.96, 1] : [0.5, 0.47, 0.44, 1],
        metallic: metal ? 1.0 : 0.0, roughness: metal ? 0.13 : 0.85,
        alive: true, contact: 0, wob: 0,
      };
      this.balls.push(b);
      return b;
    }

    trigger(kind) {
      const P = this.params;
      const j0 = this.jellies[0];
      if (kind === 'center') {
        this.dropBall({ x: j0.cx, y: j0.cy + j0.sy / 2 + P.dropHeight, z: j0.cz, density: P.ballDensity, material: 'metal' });
      } else if (kind === 'offset') {
        this.dropBall({ x: j0.cx + 0.19, y: j0.cy + j0.sy / 2 + P.dropHeight + 0.15, z: j0.cz - 0.12, vx: -0.55, vz: 0.35, density: P.ballDensity, material: 'metal' });
      } else if (kind === 'multi') {
        const hs = [0.45, 0.62, 0.85, 1.15];
        const ds = [2600, 4200, 6200, 8200];
        for (let i = 0; i < 4; i++) this.dropBall({ x: j0.cx + (i % 2 ? 0.05 : -0.05), y: j0.cy + j0.sy / 2 + hs[i], z: j0.cz + (i % 2 ? 0.05 : -0.05), density: ds[i], material: 'metal' });
      }
    }

    step(dt) {
      const g = 9.81;
      const nsub = 4;
      const h = dt / nsub;
      const world = this;
      for (let s = 0; s < nsub; s++) {
        for (const b of this.balls) {
          if (!b.alive) continue;
          b.vy -= g * h;
          b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
          if (b.y < b.r) { b.y = b.r; if (b.vy < -0.4) APP.audio.click(Math.min(1.2, -b.vy * 0.2)); b.vy = Math.abs(b.vy) * 0.32; b.vx *= 0.86; b.vz *= 0.86; }
          if (Math.abs(b.x) > 2.05) { b.x = Math.sign(b.x) * 2.05; b.vx *= -0.5; }
          if (Math.abs(b.z) > 1.45) { b.z = Math.sign(b.z) * 1.45; b.vz *= -0.5; }
          const sp = Math.hypot(b.vx, b.vy, b.vz);
          if (sp > 22) { const k = 22 / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
        }
        for (const p of this.props) {
          if (!p.static) continue;
        }
        for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
          const a = this.balls[i], b = this.balls[j];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.hypot(dx, dy, dz), R = a.r + b.r;
          if (d < R && d > 1e-6) {
            const nx = dx / d, ny = dy / d, nz = dz / d;
            const pen = R - d;
            const w = b.mass / (a.mass + b.mass);
            a.x -= nx * pen * w; a.y -= ny * pen * w; a.z -= nz * pen * w;
            b.x += nx * pen * (1 - w); b.y += ny * pen * (1 - w); b.z += nz * pen * (1 - w);
            const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rvz = b.vz - a.vz;
            const vn = rvx * nx + rvy * ny + rvz * nz;
            if (vn < 0) {
              const e = 0.45;
              const jimp = -(1 + e) * vn / (1 / a.mass + 1 / b.mass);
              a.vx -= nx * jimp / a.mass; a.vy -= ny * jimp / a.mass; a.vz -= nz * jimp / a.mass;
              b.vx += nx * jimp / b.mass; b.vy += ny * jimp / b.mass; b.vz += nz * jimp / b.mass;
              if (-vn > 0.7) APP.audio.click(Math.min(1.2, -vn * 0.35));
            }
          }
        }
        for (const p of this.props) {
          for (const b of this.balls) {
            const dx = b.x - p.x, dy = b.y - p.y, dz = b.z - p.z;
            const d = Math.hypot(dx, dy, dz), R = p.r + b.r;
            if (d < R && d > 1e-6) {
              const nx = dx / d, ny = dy / d, nz = dz / d;
              b.x = p.x + nx * R; b.y = p.y + ny * R; b.z = p.z + nz * R;
              const vn = b.vx * nx + b.vy * ny + b.vz * nz;
              if (vn < 0) {
                const e = 0.4;
                const jimp = -(1 + e) * vn * b.mass;
                b.vx += nx * jimp / b.mass * 0.9; b.vy += ny * jimp / b.mass * 0.9; b.vz += nz * jimp / b.mass * 0.9;
                if (-vn > 0.6) APP.audio.click(Math.min(1.1, -vn * 0.3));
              }
              b.vx *= 0.94; b.vz *= 0.94;
            }
          }
        }
        for (const j of this.jellies) j.step(h, world);
        this.sfxT += h;
      }
      for (const j of this.jellies) if (j.fractureEvents > this.fractureCount) {
        this.fractureCount = j.fractureEvents;
        APP.audio.crack(1.1);
      }
      this.writeBalls();
    }

    collideJelly(jelly, h) {
      for (const b of this.balls) {
        if (!b.alive) continue;
        const pos = jelly.pos, R = b.r + jelly.pr;
        let ax = 0, ay = 0, az = 0, cnt = 0, penSum = 0;
        const vpx = 0, vpy = 0, vpz = 0;
        for (let i = 0; i < jelly.nP; i++) {
          if (!jelly.pAlive[i]) continue;
          const dx = pos[i * 3] - b.x, dy = pos[i * 3 + 1] - b.y, dz = pos[i * 3 + 2] - b.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > R * R || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const pen = R - d;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          pos[i * 3] += nx * pen; pos[i * 3 + 1] += ny * pen; pos[i * 3 + 2] += nz * pen;
          jelly.vel[i * 3] = jelly.vel[i * 3] * 0.55 + b.vx * 0.45;
          jelly.vel[i * 3 + 1] = jelly.vel[i * 3 + 1] * 0.55 + b.vy * 0.45;
          jelly.vel[i * 3 + 2] = jelly.vel[i * 3 + 2] * 0.55 + b.vz * 0.45;
          ax += nx; ay += ny; az += nz; cnt++; penSum += pen;
        }
        if (cnt === 0) continue;
        const nl = Math.hypot(ax, ay, az) || 1;
        const nx = ax / nl, ny = ay / nl, nz = az / nl;
        const mp = cnt * jelly.pMass;
        const w = mp / (mp + b.mass);
        b.x -= nx * penSum * w * 0.8; b.y -= ny * penSum * w * 0.8; b.z -= nz * penSum * w * 0.8;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < -0.35 && this.sfxT - (b.lastHit || -1) > 0.09) {
          b.lastHit = this.sfxT;
          const st = Math.min(1.4, -vn * 0.22 + b.mass * 0.006);
          APP.audio.impact(st);
          if (b.mass > 8) APP.audio.wobble(1 + Math.random() * 0.4);
        }
        if (vn < 0) {
          const e = 0.45;
          const jimp = -(1 + e) * vn / (1 / b.mass + 1 / mp);
          b.vx += nx * jimp / b.mass; b.vy += ny * jimp / b.mass; b.vz += nz * jimp / b.mass;
        }
        b.vx *= 0.995; b.vz *= 0.995;
      }
    }

    postSolve(jelly, h) {
      if (this.jellies.length < 2) return;
      const cell = jelly.pr * 2.2;
      const grid = this._grid || (this._grid = new Map());
      grid.clear();
      for (let j = 0; j < this.jellies.length; j++) {
        const jl = this.jellies[j];
        for (let i = 0; i < jl.nP; i++) {
          if (!jl.pAlive[i]) continue;
          const k = (Math.floor(jl.pos[i * 3] / cell)) + ',' + (Math.floor(jl.pos[i * 3 + 1] / cell)) + ',' + (Math.floor(jl.pos[i * 3 + 2] / cell));
          let a = grid.get(k);
          if (!a) { a = []; grid.set(k, a); }
          a.push(j * 100000 + i);
        }
      }
      const others = this.jellies.filter(j => j !== jelly);
      if (!others.length) return;
      const R = jelly.pr * 2;
      for (let i = 0; i < jelly.nP; i++) {
        if (!jelly.pAlive[i]) continue;
        const x = jelly.pos[i * 3], y = jelly.pos[i * 3 + 1], z = jelly.pos[i * 3 + 2];
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const a = grid.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
          if (!a) continue;
          for (const code of a) {
            const oj = Math.floor(code / 100000), oi = code % 100000;
            if (oj === jelly.id) continue;
            const o = others[oj] || this.jellies[oj];
            if (!o || o === jelly) continue;
            const ddx = x - o.pos[oi * 3], ddy = y - o.pos[oi * 3 + 1], ddz = z - o.pos[oi * 3 + 2];
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 > R * R || d2 < 1e-10) continue;
            const d = Math.sqrt(d2), pen = (R - d) * 0.5;
            const nx = ddx / d, ny = ddy / d, nz = ddz / d;
            jelly.pos[i * 3] += nx * pen; jelly.pos[i * 3 + 1] += ny * pen; jelly.pos[i * 3 + 2] += nz * pen;
            o.pos[oi * 3] -= nx * pen; o.pos[oi * 3 + 1] -= ny * pen; o.pos[oi * 3 + 2] -= nz * pen;
          }
        }
      }
    }

    writeBalls() {
      const d = this.ballData;
      d.fill(0);
      const all = this.balls.slice();
      for (const p of this.props) all.push({ x: p.x, y: p.y, z: p.z, r: p.r, color: p.color, metallic: p.metallic, roughness: p.roughness, vx: 0, vy: 0, vz: 0, sub: 0 });
      const n = Math.min(all.length, this.maxBalls);
      for (let i = 0; i < n; i++) {
        const b = all[i];
        d[i * 16] = b.x; d[i * 16 + 1] = b.y; d[i * 16 + 2] = b.z; d[i * 16 + 3] = b.r;
        d[i * 16 + 4] = b.vx; d[i * 16 + 5] = b.vy; d[i * 16 + 6] = b.vz; d[i * 16 + 7] = 0;
        d[i * 16 + 8] = b.color[0]; d[i * 16 + 9] = b.color[1]; d[i * 16 + 10] = b.color[2]; d[i * 16 + 11] = 1;
        d[i * 16 + 12] = b.metallic; d[i * 16 + 13] = b.roughness; d[i * 16 + 14] = b.sub || 0; d[i * 16 + 15] = 0;
      }
      APP.R.writeBuffer(this.ballBuf, d);
      this.ballCount = n;
    }

    render() {
      const R = APP.R, m = U.m4id();
      R.pushSky(R.meshes.sphere, { model: skyModel(this.cam), color: [1, 1, 1, 1], metallic: 0, roughness: 1, flags: 0 });
      U.m4compose(0, -0.06, 0, 0, 0, 0, 4.5, 0.12, 3.3, m);
      R.pushOpaque(R.meshes.box, { model: m, color: [0.5, 0.53, 0.58, 1], metallic: 0.05, roughness: 0.42 });
      U.m4compose(0, -0.075, 0, 0, 0, 0, 12, 0.01, 12, m);
      R.pushOpaque(R.meshes.plane, { model: m, color: [0.14, 0.15, 0.18, 1], metallic: 0.0, roughness: 0.7 });
      for (const j of this.jellies) {
        U.m4id(m);
        R.pushJelly(j.dmesh, { model: m, normalM: m, color: j.color, metallic: 0, roughness: 0.25, alpha: 1, sss: 0.6 });
      }
      R.pushInstanced(R.meshes.sphere, this.ballCount, this.ballBuf);
    }

    startDemo(id) {
      this.reset();
      const d = DEMOS_JELLY[id];
      this.demo = d;
      this.demoT = 0; this.simT = 0; this.fired = [];
      this.cam.setScripted({ x: d.cam[0].p[0], y: d.cam[0].p[1], z: d.cam[0].p[2] }, { x: d.cam[0].t2[0], y: d.cam[0].t2[1], z: d.cam[0].t2[2] }, d.cam[0].f * U.DEG);
      for (const e of d.events) if (e.t <= 0) e.fn(this);
    }
    demoAdvance(t) {
      if (!this.demo) return;
      const d = this.demo;
      for (let i = 0; i < d.events.length; i++) {
        if (!this.fired[i] && d.events[i].t <= t) { this.fired[i] = 1; d.events[i].fn(this); }
      }
      const c = evalTrack(d.cam, t);
      if (c) this.cam.setScripted({ x: c.p[0], y: c.p[1], z: c.p[2] }, { x: c.tg[0], y: c.tg[1], z: c.tg[2] }, c.f * U.DEG);
    }
    timeScaleAt(t) {
      if (!this.demo) return 1;
      for (const sg of this.demo.ts) if (t <= sg[1]) return sg[2];
      return 1;
    }
    simTarget(t) { return this.demo ? simTimeAt(this.demo.ts, t) : t; }
  }

  let _sky = null;
  function skyModel(cam) {
    if (!_sky) _sky = U.m4();
    U.m4compose(cam.pos.x, cam.pos.y, cam.pos.z, 0, 0, 0, 40, 40, 40, _sky);
    return _sky;
  }

  const DEMOS_JELLY = {
    'jelly-center': {
      duration: 7.4,
      ts: [[0, 0.34, 1], [0.34, 1.5, 0.32], [1.5, 2.4, 0.55], [2.4, 7.4, 1]],
      events: [
        { t: 0, fn: s => s.dropBall({ x: s.jellies[0].cx, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 1.05, z: s.jellies[0].cz, density: 7800, material: 'metal' }) },
      ],
      cam: [
        { t: 0, p: [-1.75, 1.35, 2.25], t2: [-0.5, 0.35, 0.0], f: 40 },
        { t: 0.34, p: [-1.35, 1.05, 1.75], t2: [-0.58, 0.4, 0.0], f: 36 },
        { t: 1.1, p: [-1.12, 0.92, 1.42], t2: [-0.6, 0.42, 0.0], f: 34 },
        { t: 2.2, p: [-1.0, 1.15, 1.5], t2: [-0.6, 0.5, 0.0], f: 38 },
        { t: 4.0, p: [-1.55, 1.5, 2.15], t2: [-0.5, 0.4, 0.0], f: 42 },
        { t: 7.4, p: [-2.15, 1.8, 2.65], t2: [-0.4, 0.35, 0.0], f: 44 },
      ],
    },
    'jelly-multi': {
      duration: 9.6,
      ts: [[0, 0.5, 1], [0.5, 1.35, 0.45], [1.35, 1.9, 0.8], [1.9, 2.5, 0.4], [2.5, 3.1, 0.8], [3.1, 3.9, 0.35], [3.9, 4.5, 0.8], [4.5, 5.9, 0.3], [5.9, 6.6, 0.75], [6.6, 9.6, 1]],
      events: [
        { t: 0.05, fn: s => s.dropBall({ x: s.jellies[0].cx - 0.04, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 0.5, z: s.jellies[0].cz - 0.03, density: 2400, material: 'metal' }) },
        { t: 1.15, fn: s => s.dropBall({ x: s.jellies[0].cx + 0.03, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 0.72, z: s.jellies[0].cz + 0.04, density: 4600, material: 'metal' }) },
        { t: 2.45, fn: s => s.dropBall({ x: s.jellies[0].cx - 0.02, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 0.95, z: s.jellies[0].cz - 0.02, density: 6600, material: 'metal' }) },
        { t: 4.35, fn: s => s.dropBall({ x: s.jellies[0].cx, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 1.35, z: s.jellies[0].cz, density: 8600, material: 'metal' }) },
      ],
      cam: [
        { t: 0, p: [-1.6, 1.25, 2.1], t2: [-0.55, 0.35, 0.0], f: 40 },
        { t: 0.7, p: [-1.25, 0.98, 1.6], t2: [-0.58, 0.4, 0.0], f: 35 },
        { t: 2.2, p: [-1.05, 0.9, 1.45], t2: [-0.6, 0.42, 0.0], f: 34 },
        { t: 4.4, p: [-0.95, 0.85, 1.4], t2: [-0.6, 0.45, 0.0], f: 33 },
        { t: 5.9, p: [-1.0, 1.0, 1.5], t2: [-0.58, 0.5, 0.0], f: 36 },
        { t: 7.6, p: [-1.5, 1.35, 2.0], t2: [-0.5, 0.42, 0.0], f: 40 },
        { t: 9.6, p: [-2.0, 1.7, 2.5], t2: [-0.42, 0.38, 0.0], f: 43 },
      ],
    },
    'jelly-offset': {
      duration: 7.6,
      ts: [[0, 0.3, 1], [0.3, 1.35, 0.34], [1.35, 2.0, 0.6], [2.0, 3.2, 0.8], [3.2, 7.6, 1]],
      events: [
        { t: 0, fn: s => s.dropBall({ x: s.jellies[0].cx + 0.2, y: s.jellies[0].cy + s.jellies[0].sy / 2 + 1.0, z: s.jellies[0].cz - 0.13, vx: -0.75, vz: 0.5, density: 7000, material: 'metal' }) },
      ],
      cam: [
        { t: 0, p: [-0.7, 1.35, 2.2], t2: [-0.4, 0.4, 0.0], f: 40 },
        { t: 0.75, p: [-0.35, 1.0, 1.7], t2: [-0.42, 0.42, 0.0], f: 36 },
        { t: 1.7, p: [0.1, 0.95, 1.6], t2: [-0.3, 0.4, 0.05], f: 38 },
        { t: 3.0, p: [0.75, 1.0, 1.7], t2: [0.35, 0.3, 0.1], f: 40 },
        { t: 4.8, p: [1.35, 1.15, 1.9], t2: [0.8, 0.25, 0.2], f: 42 },
        { t: 7.6, p: [0.6, 1.7, 2.6], t2: [0.2, 0.35, 0.1], f: 44 },
      ],
    },
  };

  // ================= SCENE 2 : TANK =================
  const FD = null;
  class SceneTank {
    constructor() {
      this.id = 'tank';
      this.title = '多密度球与造浪水槽';
      this.cam = new U.OrbitCam();
      this.cam.target = { x: 1.0, y: 0.42, z: 0.5 };
      this.cam.dist = 3.3; this.cam.yaw = 0.85; this.cam.pitch = 0.18; this.cam.fov = 42 * U.DEG;
      this.params = {
        densLow: 180, densMid: 900, densHigh: 2700, densNeutral: 1000,
        waveAmp: 0.14, waveFreq: 1.0, waveOn: false, ballRadius: 0.06,
      };
      this.balls = [];
      this.maxBalls = 20;
      this.demo = null; this.demoT = 0; this.simT = 0; this.fired = [];
      this.waveOn = false;
      this.time = 0;
      this.ready = false;
    }

    async init() {
      if (this.ready) return true;
      await APP.F.init();
      this.ballBuf = APP.F.ballBuf();
      this.ballData = APP.F.ballData;
      this.terrainMesh = this.buildTerrain();
      this.ready = true;
      this.reset();
      return true;
    }

    buildTerrain() {
      const D = APP.F.dims();
      const N = 56, M = 30;
      const pos = [], nrm = [], uv = [], idx = [];
      const hAt = (x, z) => APP.F.terrainHJS(x, z);
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
        const x = (i / N) * D.LX, z = (j / M) * D.LZ;
        const y = hAt(x, z);
        pos.push(x, y, z);
        nrm.push(0, 1, 0);
        uv.push(i / N, j / M);
      }
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const mesh = APP.R.makeMesh(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), new Uint32Array(idx));
      return mesh;
    }

    reset() {
      if (!this.ready) return;
      APP.F.reset();
      this.balls = [];
      this.waveOn = false;
      APP.F.setPaddle(0, this.params.waveFreq);
      this.fractureCount = 0;
      this.demoT = 0; this.simT = 0; this.fired = [];
      this.ambientWave = 0;
    }

    setParam(name, v) {
      this.params[name] = v;
      if (name === 'waveFreq') APP.F.setPaddle(this.params.waveAmp, v);
      if (name === 'waveAmp' && this.waveOn) APP.F.setPaddle(v, this.params.waveFreq);
      if (name.indexOf('dens') === 0) {
        for (const b of this.balls) {
          if (b.group === 'low') b.density = v;
          else if (b.group === 'neutral') b.density = v;
          else if (b.group === 'high') b.density = v;
          else if (b.group === 'mid') b.density = v;
          b.mass = b.density * b.vol;
        }
      }
    }

    groups() {
      const P = this.params;
      return [
        { key: 'low', name: '低密度', density: P.densLow, color: [0.98, 0.76, 0.22, 1], metallic: 0.05, roughness: 0.55 },
        { key: 'mid', name: '较轻', density: 640, color: [0.95, 0.45, 0.2, 1], metallic: 0.05, roughness: 0.5 },
        { key: 'neutral', name: '中性', density: P.densNeutral, color: [0.28, 0.85, 0.55, 1], metallic: 0.1, roughness: 0.35 },
        { key: 'high', name: '高密度', density: P.densHigh, color: [0.4, 0.55, 0.95, 1], metallic: 0.85, roughness: 0.22 },
      ];
    }

    releaseBalls(pattern) {
      const D = APP.F.dims();
      const gs = this.groups();
      const r = this.params.ballRadius;
      const list = [];
      const n = pattern === 'few' ? 4 : 12;
      for (let i = 0; i < n; i++) {
        const g = gs[i % gs.length];
        const row = Math.floor(i / gs.length);
        list.push({
          x: 0.72 + (i % 4) * 0.26 + (row % 2) * 0.12,
          z: 0.22 + row * 0.24 + (i % 3) * 0.06,
          y: 0.98 + (i % 3) * 0.05,
          g,
        });
      }
      for (const e of list) {
        const V = 4 / 3 * Math.PI * r * r * r;
        this.balls.push({
          x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 0.15, vy: 0, vz: (Math.random() - 0.5) * 0.15,
          r, vol: V, density: e.g.density, mass: e.g.density * V, group: e.g.key,
          color: e.g.color, metallic: e.g.metallic, roughness: e.g.roughness, sub: 0, wasIn: false,
        });
      }
      if (this.balls.length > this.maxBalls) this.balls.splice(0, this.balls.length - this.maxBalls);
    }

    startWave(on) {
      this.waveOn = on;
      APP.F.setPaddle(on ? this.params.waveAmp : 0, this.params.waveFreq);
      APP.audio.waveGain(on ? this.params.waveAmp * 2.2 : 0);
    }

    step(dt) {
      if (!this.ready) return;
      const D = APP.F.dims();
      const nsub = 2;
      const h = dt / nsub;
      this.stepBalls(dt);
      APP.F.updatePaddle(dt, this.waveOn);
      this.writeBallData();
      for (let s = 0; s < nsub; s++) APP.F.step(h, this.balls.length);
      APP.F.postFrame(this.balls.length);
      APP.audio.waveGain(this.waveOn ? this.params.waveAmp * 2.4 : 0);
    }

    stepBalls(dt) {
      const D = APP.F.dims();
      const rd = APP.F.ballFluidRead;
      const g = 9.81;
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i];
        const rho = Math.max(0, Math.min(1.15, rd[i * 8 + 0]));
        const sub = Math.max(0, Math.min(1, rd[i * 8 + 4]));
        const vf = [rd[i * 8 + 1], rd[i * 8 + 2], rd[i * 8 + 3]];
        b.sub = b.sub * 0.75 + sub * 0.25;
        const V = b.vol;
        const m = Math.max(b.mass, 1e-4);
        const rhoW = 1000;
        let fy = rho * rhoW * V * g - m * g;
        const rx = b.vx - vf[0], ry = b.vy - vf[1], rz = b.vz - vf[2];
        const sp = Math.hypot(rx, ry, rz);
        const A = Math.PI * b.r * b.r;
        const fd = 0.5 * rho * rhoW * 0.47 * A * sp;
        const mEff = m + 0.5 * rho * rhoW * V;
        let ax = 0, ay = fy / mEff, az = 0;
        if (sp > 1e-5) {
          ax = -rx / sp * fd / mEff;
          ay += -ry / sp * fd / mEff;
          az = -rz / sp * fd / mEff;
        }
        b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (b.sub > 0.4 && !b.wasIn) {
          b.wasIn = true;
          APP.audio.splash(Math.min(1.4, 0.4 + Math.hypot(b.vx, b.vy, b.vz) * 0.2));
        }
        if (b.sub < 0.15) b.wasIn = false;
        const th = APP.F.terrainHJS(b.x, b.z) + b.r;
        if (b.y < th) {
          b.y = th;
          if (b.vy < -0.5) APP.audio.click(Math.min(1.0, -b.vy * 0.25));
          b.vy = Math.abs(b.vy) * 0.25;
          const nx = (APP.F.terrainHJS(b.x + 0.02, b.z) - APP.F.terrainHJS(b.x - 0.02, b.z)) * 0.5 / 0.02;
          const nz = (APP.F.terrainHJS(b.x, b.z + 0.02) - APP.F.terrainHJS(b.x, b.z - 0.02)) * 0.5 / 0.02;
          const nl = Math.hypot(nx, 1, nz) || 1;
          const tnx = -nx / nl, tnz = -nz / nl;
          const slope = Math.hypot(nx, nz);
          if (slope > 0.02) { b.vx += tnx * g * dt * 1.2; b.vz += tnz * g * dt * 1.2; }
          b.vx *= 0.985; b.vz *= 0.985;
        }
        const pad = 0.012;
        if (b.x < pad) { b.x = pad; b.vx = Math.abs(b.vx) * 0.4; }
        if (b.x > D.LX - pad) { b.x = D.LX - pad; b.vx = -Math.abs(b.vx) * 0.4; }
        if (b.z < pad) { b.z = pad; b.vz = Math.abs(b.vz) * 0.4; }
        if (b.z > D.LZ - pad) { b.z = D.LZ - pad; b.vz = -Math.abs(b.vz) * 0.4; }
        if (b.y > D.LY - b.r) { b.y = D.LY - b.r; b.vy = -Math.abs(b.vy) * 0.2; }
        const sp2 = Math.hypot(b.vx, b.vy, b.vz);
        if (sp2 > 14) { const k = 14 / sp2; b.vx *= k; b.vy *= k; b.vz *= k; }
      }
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz), R = a.r + b.r;
        if (d < R && d > 1e-6) {
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = R - d;
          const w = b.mass / (a.mass + b.mass);
          a.x -= nx * pen * w; a.y -= ny * pen * w; a.z -= nz * pen * w;
          b.x += nx * pen * (1 - w); b.y += ny * pen * (1 - w); b.z += nz * pen * (1 - w);
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rvz = b.vz - a.vz;
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            const e = 0.35;
            const jimp = -(1 + e) * vn / (1 / a.mass + 1 / b.mass);
            a.vx -= nx * jimp / a.mass; a.vy -= ny * jimp / a.mass; a.vz -= nz * jimp / a.mass;
            b.vx += nx * jimp / b.mass; b.vy += ny * jimp / b.mass; b.vz += nz * jimp / b.mass;
            if (-vn > 0.5) APP.audio.click(Math.min(1.0, -vn * 0.3));
          }
        }
      }
    }

    writeBallData() {
      const d = this.ballData;
      d.fill(0);
      const n = Math.min(this.balls.length, this.maxBalls);
      for (let i = 0; i < n; i++) {
        const b = this.balls[i];
        d[i * 16] = b.x; d[i * 16 + 1] = b.y; d[i * 16 + 2] = b.z; d[i * 16 + 3] = b.r;
        d[i * 16 + 4] = b.vx; d[i * 16 + 5] = b.vy; d[i * 16 + 6] = b.vz; d[i * 16 + 7] = 0;
        d[i * 16 + 8] = b.color[0]; d[i * 16 + 9] = b.color[1]; d[i * 16 + 10] = b.color[2]; d[i * 16 + 11] = 1;
        d[i * 16 + 12] = b.metallic; d[i * 16 + 13] = b.roughness; d[i * 16 + 14] = b.sub; d[i * 16 + 15] = 0;
      }
      APP.R.writeBuffer(APP.F.ballBuf(), d);
      this.ballCount = n;
    }

    render() {
      const R = APP.R, m = U.m4id();
      const D = APP.F.dims();
      R.pushSky(R.meshes.sphere, { model: skyModel(this.cam), color: [1, 1, 1, 1], metallic: 0, roughness: 1, flags: 0 });
      U.m4compose(1.0, -0.11, 0.5, 0, 0, 0, 5.4, 0.2, 4.0, m);
      R.pushOpaque(R.meshes.box, { model: m, color: [0.2, 0.21, 0.24, 1], metallic: 0.1, roughness: 0.5 });
      U.m4compose(1.0, -0.02, 0.5, 0, 0, 0, 7, 0.01, 7, m);
      R.pushOpaque(R.meshes.plane, { model: m, color: [0.1, 0.11, 0.14, 1], metallic: 0.0, roughness: 0.65, flags: 0 });
      U.m4compose(D.LX / 2, 0.0, D.LZ / 2, 0, 0, 0, D.LX, 1, D.LZ, m);
      R.pushOpaque(this.terrainMesh, { model: m, color: [0.32, 0.34, 0.38, 1], metallic: 0.05, roughness: 0.75, flags: 2 });
      const glass = { color: [0.72, 0.86, 0.95, 1], metallic: 0.0, roughness: 0.04 };
      U.m4compose(D.LX / 2, -0.011, D.LZ / 2, 0, 0, 0, D.LX, 0.022, D.LZ, m);
      R.pushGlass(R.meshes.box, { model: m, ...glass });
      U.m4compose(-0.011, D.LY / 2, D.LZ / 2, 0, 0, 0, 0.022, D.LY, D.LZ, m);
      R.pushGlass(R.meshes.box, { model: m, ...glass });
      U.m4compose(D.LX + 0.011, D.LY / 2, D.LZ / 2, 0, 0, 0, 0.022, D.LY, D.LZ, m);
      R.pushGlass(R.meshes.box, { model: m, ...glass });
      U.m4compose(D.LX / 2, D.LY / 2, -0.011, 0, 0, 0, D.LX, D.LY, 0.022, m);
      R.pushGlass(R.meshes.box, { model: m, ...glass });
      U.m4compose(D.LX / 2, D.LY / 2, D.LZ + 0.011, 0, 0, 0, D.LX, D.LY, 0.022, m);
      R.pushGlass(R.meshes.box, { model: m, ...glass });
      const frameC = [0.16, 0.17, 0.2, 1];
      const fr = (px, py, pz, sx, sy, sz) => { U.m4compose(px, py, pz, 0, 0, 0, sx, sy, sz, m); R.pushOpaque(R.meshes.box, { model: m, color: frameC, metallic: 0.7, roughness: 0.35 }); };
      fr(D.LX / 2, D.LY + 0.012, D.LZ / 2, D.LX + 0.05, 0.024, D.LZ + 0.05);
      fr(-0.014, D.LY / 2, D.LZ / 2, 0.028, D.LY, D.LZ + 0.05);
      fr(D.LX + 0.014, D.LY / 2, D.LZ / 2, 0.028, D.LY, D.LZ + 0.05);
      fr(D.LX / 2, D.LY / 2, -0.014, D.LX + 0.05, D.LY, 0.028);
      fr(D.LX / 2, D.LY / 2, D.LZ + 0.014, D.LX + 0.05, D.LY, 0.028);
      const pa = APP.F.paddle.angle;
      U.m4compose(0.30 + 0.33 * Math.sin(pa), 0.33 * Math.cos(pa), 0.5, 0, 0, pa, 0.66, 0.028, 0.88, m);
      R.pushOpaque(R.meshes.box, { model: m, color: [0.85, 0.55, 0.2, 1], metallic: 0.6, roughness: 0.3 });
      U.m4compose(0.30, 0.035, 0.5, 0, 0, 0, 0.1, 0.07, 0.95, m);
      R.pushOpaque(R.meshes.box, { model: m, color: [0.3, 0.31, 0.34, 1], metallic: 0.8, roughness: 0.3 });
      R.pushInstanced(R.meshes.sphere, this.ballCount, APP.F.ballBuf());
      const disp = APP.F.dispBufs();
      R.pushSpray(disp.n, disp.pos, disp.vel);
      R.setWater({
        boxMin: new Float32Array([0.008, -0.002, 0.008, 0]),
        boxMax: new Float32Array([D.LX - 0.008, D.LY - 0.004, D.LZ - 0.008, 0]),
        shallow: new Float32Array([0.16, 0.5, 0.55, 1]),
        deep: new Float32Array([0.02, 0.14, 0.24, 1]),
        thr: APP.F.surfThr, stepScale: 0.8, refract: 1.0, foamAmt: 1.0,
        restDensity: 5, cellH: D.H, envAmt: 0.5, absorb: 1.5,
      });
    }

    startDemo(id) {
      this.reset();
      const d = DEMOS_TANK[id];
      this.demo = d;
      this.demoT = 0; this.simT = 0; this.fired = [];
      this.cam.setScripted({ x: d.cam[0].p[0], y: d.cam[0].p[1], z: d.cam[0].p[2] }, { x: d.cam[0].t2[0], y: d.cam[0].t2[1], z: d.cam[0].t2[2] }, d.cam[0].f * U.DEG);
      for (const e of d.events) if (e.t <= 0) e.fn(this);
    }
    demoAdvance(t) {
      if (!this.demo) return;
      const d = this.demo;
      for (let i = 0; i < d.events.length; i++) {
        if (!this.fired[i] && d.events[i].t <= t) { this.fired[i] = 1; d.events[i].fn(this); }
      }
      const c = evalTrack(d.cam, t);
      if (c) this.cam.setScripted({ x: c.p[0], y: c.p[1], z: c.p[2] }, { x: c.tg[0], y: c.tg[1], z: c.tg[2] }, c.f * U.DEG);
    }
    timeScaleAt(t) {
      if (!this.demo) return 1;
      for (const sg of this.demo.ts) if (t <= sg[1]) return sg[2];
      return 1;
    }
    simTarget(t) { return this.demo ? simTimeAt(this.demo.ts, t) : t; }
  }

  const DEMOS_TANK = {
    'tank-full': {
      duration: 19.4,
      ts: [[0, 0.5, 1], [0.5, 1.1, 0.55], [1.1, 2.4, 1], [2.4, 4.2, 0.85], [4.2, 6.0, 1], [6.0, 7.4, 0.9],
      [7.4, 8.6, 1], [8.6, 11.6, 0.62], [11.6, 13.2, 1], [13.2, 15.4, 0.85], [15.4, 19.4, 1]],
      events: [
        { t: 0.05, fn: s => { s.releaseBalls(); } },
        { t: 0.9, fn: s => { for (const b of s.balls) b.vy = -1.2; } },
        { t: 3.6, fn: s => { s.startWave(true); s.setParam('waveAmp', 0.055); } },
        { t: 6.4, fn: s => s.setParam('waveAmp', 0.13) },
        { t: 8.5, fn: s => s.setParam('waveAmp', 0.26) },
        { t: 9.2, fn: s => s.setParam('waveFreq', 1.35) },
        { t: 13.6, fn: s => s.setParam('waveAmp', 0.1) },
        { t: 16.4, fn: s => { s.setParam('waveAmp', 0.03); s.setParam('waveFreq', 0.8); } },
        { t: 18.0, fn: s => s.startWave(false) },
      ],
      cam: [
        { t: 0, p: [1.05, 1.35, 3.0], t2: [1.0, 0.5, 0.5], f: 42 },
        { t: 1.4, p: [1.5, 1.15, 2.45], t2: [1.05, 0.55, 0.5], f: 40 },
        { t: 3.4, p: [2.2, 1.0, 2.1], t2: [1.2, 0.5, 0.5], f: 38 },
        { t: 6.2, p: [2.85, 0.95, 1.85], t2: [1.5, 0.5, 0.5], f: 40 },
        { t: 8.7, p: [1.6, 0.85, 1.65], t2: [0.85, 0.5, 0.5], f: 42 },
        { t: 11.0, p: [0.85, 0.72, 1.55], t2: [0.35, 0.45, 0.5], f: 44 },
        { t: 13.4, p: [1.9, 0.8, 1.6], t2: [1.1, 0.48, 0.5], f: 42 },
        { t: 16.2, p: [2.6, 1.15, 2.3], t2: [1.4, 0.5, 0.5], f: 40 },
        { t: 19.4, p: [1.15, 1.55, 3.1], t2: [1.0, 0.5, 0.5], f: 43 },
      ],
    },
  };

  APP.scenes = {
    create: (id) => (id === 'jelly' ? new SceneJelly() : new SceneTank()),
    DEMOS_JELLY, DEMOS_TANK,
    LIGHT, ENV_BASE,
    demoTarget: (id) => (id === 'tank-full' ? 19.4 : (id === 'jelly-multi' ? 9.6 : 7.4)),
  };
})();



