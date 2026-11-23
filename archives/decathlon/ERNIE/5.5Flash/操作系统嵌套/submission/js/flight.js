// 飞行简化动力学：不稳定被控对象 + 飞控输入 + 风 + 故障 + 地面接触
import { terrainHeight } from './terrain.js';
import { clamp, deg } from './util.js';

const DT = 0.02;

export class FlightSim {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.terrainDef = { ...(scene.terrain || {}), pads: scene.pads || [] };
    this.targetPadIndex = opts.targetPad ?? scene.flight?.targetPad ?? 1;
    this.reset(opts);
  }

  reset(opts = {}) {
    const pads = this.scene.pads || [];
    const pad = pads[this.targetPadIndex] || pads[0] || { x: 0, z: 0, r: 10 };
    const start = opts.start || this.scene.flight?.start || [0, 0, 0];
    const sx = start[0] ?? 0, sz = start[2] ?? 0;
    const gy = terrainHeight(sx, sz, this.terrainDef);
    const y = opts.y ?? (gy + 3.4);
    const bearing = Math.atan2(pad.x - sx, pad.z - sz);
    this.state = {
      t: 0,
      pos: { x: sx, y, z: sz },
      vel: { x: 0, y: 0, z: 0 },
      yaw: bearing, pitch: 0, roll: 0,
      p: 0, q: 0, r: 0,
      rotor: opts.rotor ?? 1,
      throttle: 0.42,
      alive: true,
      onGround: false,
      damage: 0,
      crashT: -1,
      crashPos: null,
      reason: '',
      wind: opts.wind ?? this.scene.flight?.wind ?? 2.2,
      faultAt: opts.faultAt ?? this.scene.flight?.faultAt ?? 0,
      targetX: pad.x, targetZ: pad.z, targetPad: this.targetPadIndex,
      controls: { thr: 0.42, roll: 0, pitch: 0, yaw: 0 },
      lastControlT: -1,
      maxAlt: y,
      landedAt: -1,
      distance: Math.hypot(pad.x - sx, pad.z - sz)
    };
    this.acc = 0;
    this.startState = JSON.parse(JSON.stringify(this.state));
    this.initial = { start: [sx, y, sz], yaw: bearing, rotor: this.state.rotor, wind: this.state.wind, faultAt: this.state.faultAt, targetPad: this.targetPadIndex };
  }

  setEnvironment(patch) {
    if (patch.wind != null) this.state.wind = Number(patch.wind);
    if (patch.faultAt != null) this.state.faultAt = Number(patch.faultAt);
    if (patch.heading != null) {
      const hv = Number(patch.heading);
      this.state.headingOverride = hv ? ((hv % 360) + 360) % 360 : null;
    }
    if (patch.targetPad != null) {
      this.targetPadIndex = Number(patch.targetPad);
      const pad = (this.scene.pads || [])[this.targetPadIndex];
      if (pad) { this.state.targetX = pad.x; this.state.targetZ = pad.z; this.state.targetPad = this.targetPadIndex; }
    }
  }

  setControls(c) {
    const s = this.state;
    s.controls = {
      thr: clamp(Number(c.thr ?? s.controls.thr), 0, 1),
      roll: clamp(Number(c.roll ?? s.controls.roll), -1, 1),
      pitch: clamp(Number(c.pitch ?? s.controls.pitch), -1, 1),
      yaw: clamp(Number(c.yaw ?? s.controls.yaw), -1, 1)
    };
    s.lastControlT = s.t;
  }

  sensors() {
    const s = this.state;
    const dx = s.targetX - s.pos.x, dz = s.targetZ - s.pos.z;
    const dist = Math.hypot(dx, dz);
    let brg = (deg(Math.atan2(dx, dz)) + 360) % 360;
    if (s.headingOverride != null && s.headingOverride !== undefined) brg = ((s.headingOverride % 360) + 360) % 360;
    const hdg = (deg(s.yaw) + 360) % 360;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const fwd = s.vel.x * fx + s.vel.z * fz;
    const gy = terrainHeight(s.pos.x, s.pos.z, this.terrainDef);
    return [
      deg(s.roll), deg(s.pitch), Math.max(0, s.pos.y - gy - 1.15), s.vel.y,
      hdg, dist, brg, fwd, s.rotor, s.onGround ? 1 : 0,
      s.throttle, s.alive ? 1 : 0,
      deg(s.q), deg(s.p), deg(s.r)
    ];
  }

  crash(reason) {
    const s = this.state;
    if (!s.alive) return;
    s.alive = false;
    s.crashT = s.t;
    s.crashPos = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    s.reason = reason || '失控坠毁';
    s.damage = 1;
    s.rotor = Math.min(s.rotor, 0.25);
  }

  step(dt = DT) {
    const s = this.state;
    s.t += dt;
    const t = s.t;
    const auth = Math.pow(clamp(s.rotor, 0, 1.2), 1.25);
    const fault = s.faultAt > 0 && t >= s.faultAt;
    const rotorTarget = fault ? Math.max(0, 1 - (t - s.faultAt) / 2.4) : (s.alive ? 1 : 0);
    const rate = rotorTarget > s.rotor ? 1.4 : 0.9;
    s.rotor += clamp(rotorTarget - s.rotor, -rate * dt, rate * dt);
    s.rotor = clamp(s.rotor, 0, 1);

    if (s.alive) {
      const c = s.controls;
      const gust = s.wind * 0.006 * Math.sin(t * 1.7 + 0.7) + s.wind * 0.004 * Math.sin(t * 4.3);
      const pitchAcc = c.pitch * 6.0 * auth - s.q * 0.7 + s.pitch * 1.4 + gust * 0.35;
      const rollAcc = c.roll * 6.0 * auth - s.p * 0.7 + s.roll * 1.4 - gust * 0.3;
      const yawAcc = c.yaw * 2.6 * auth - s.r * 1.35 + s.wind * 0.002 * Math.sin(t * 0.7);
      s.q += pitchAcc * dt; s.p += rollAcc * dt; s.r += yawAcc * dt;
      s.pitch += s.q * dt; s.roll += s.p * dt; s.yaw += s.r * dt;
      s.pitch = clamp(s.pitch, -1.5, 1.5); s.roll = clamp(s.roll, -1.5, 1.5);
      s.q = clamp(s.q, -4, 4); s.p = clamp(s.p, -4, 4); s.r = clamp(s.r, -3, 3);
      if (Math.abs(s.pitch) >= 1.49 || Math.abs(s.roll) >= 1.49) this.crash('姿态失控');

      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
      const lift = c.thr * 24 * auth;
      const cosP = Math.cos(s.pitch), cosR = Math.cos(s.roll);
      const ay = lift * cosP * cosR - 9.8;
      const ax = lift * Math.sin(s.pitch) * fx + lift * Math.sin(s.roll) * rx + s.wind * 0.16;
      const az = lift * Math.sin(s.pitch) * fz + lift * Math.sin(s.roll) * rz + s.wind * 0.05;
      s.vel.x += ax * dt; s.vel.y += ay * dt; s.vel.z += az * dt;
      const drag = Math.exp(-0.12 * dt);
      s.vel.x *= drag; s.vel.z *= drag;
      s.vel.y *= Math.exp(-0.06 * dt);
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      const gy = terrainHeight(s.pos.x, s.pos.z, this.terrainDef) + 1.15;
      const agl = s.pos.y - gy;
      s.maxAlt = Math.max(s.maxAlt, Math.max(0, agl));
      if (s.pos.y <= gy) {
        const impact = -s.vel.y;
        const tilt = Math.max(Math.abs(s.pitch), Math.abs(s.roll));
        const speed = Math.hypot(s.vel.x, s.vel.z);
        if (impact > 3.8 || tilt > 0.52 || speed > 7.5) {
          this.crash(impact > 3.8 ? '接地速度过大' : (tilt > 0.52 ? '撞击地面' : '接地速度过大'));
          s.pos.y = gy;
        } else {
          s.onGround = true;
          s.pos.y = gy;
          if (s.vel.y < 0) s.vel.y = 0;
          s.vel.x *= 0.86; s.vel.z *= 0.86;
          s.pitch *= 0.8; s.roll *= 0.8;
          s.q *= 0.6; s.p *= 0.6;
          if (s.landedAt < 0) s.landedAt = t;
        }
      } else {
        if (s.pos.y > gy + 0.08) s.onGround = false;
      }
      if (Math.abs(s.pos.x) > 280 || Math.abs(s.pos.z) > 280) this.crash('飞出山谷边界');
      if (s.pos.y < -5) this.crash('坠入地形');
      s.distance = Math.hypot(s.targetX - s.pos.x, s.targetZ - s.pos.z);
    } else {
      s.vel.y -= 9.8 * dt;
      s.vel.x *= Math.exp(-1.4 * dt); s.vel.z *= Math.exp(-1.4 * dt);
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      s.pitch += s.q * dt; s.roll += s.p * dt; s.yaw += s.r * dt;
      s.q *= Math.exp(-0.8 * dt); s.p *= Math.exp(-0.8 * dt); s.r *= Math.exp(-0.6 * dt);
      s.pitch = clamp(s.pitch, -1.6, 1.6); s.roll = clamp(s.roll, -1.6, 1.6);
      const gy = terrainHeight(s.pos.x, s.pos.z, this.terrainDef) + 1.0;
      if (s.pos.y <= gy) {
        s.pos.y = gy;
        if (s.vel.y < -0.8) s.vel.y = -s.vel.y * 0.22; else s.vel.y = 0;
        s.vel.x *= 0.7; s.vel.z *= 0.7;
        s.q *= 0.5; s.p *= 0.5; s.r *= 0.5;
      }
    }
  }

  advance(dtVirtual, maxSteps = 40) {
    this.acc += Math.min(dtVirtual, 1000);
    let n = 0;
    while (this.acc >= DT && n < maxSteps) {
      this.step(DT);
      this.acc -= DT;
      n++;
    }
    if (n >= maxSteps) this.acc = 0;
    return n;
  }

  static replay(initial, samples, toTime) {
    const sceneObj = typeof initial.scene === 'string' ? (initial.sceneData || initial.scene) : initial.scene;
    const sim = new FlightSim(sceneObj, initial.opts || {});
    sim.reset(initial.opts || {});
    if (initial.state) {
      sim.state = JSON.parse(JSON.stringify(initial.state));
      sim.state.t = 0;
    }
    let idx = 0;
    const target = Math.max(0, toTime);
    let guard = 0;
    while (sim.state.t < target - 1e-6 && guard < 20000) {
      while (idx + 1 < samples.length && samples[idx + 1].t <= sim.state.t + 1e-6) idx++;
      const sm = samples[idx];
      if (sm) sim.setControls({ thr: sm.thr, roll: sm.roll, pitch: sm.pitch, yaw: sm.yaw });
      sim.step(DT);
      guard++;
    }
    return sim.state;
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  restore(state) { this.state = JSON.parse(JSON.stringify(state)); this.acc = 0; }
}

// 与预置飞控程序等价的参考实现，用于自动化检查与无界面测试
export function referenceController(sens) {
  const [roll, pitch, alt, vy, hdg, dist, brg, spd, rotor, ground, thr0, alive, q, p, r] = sens;
  let targetAlt = 3.2;
  if (dist < 14) targetAlt = 0.0;
  let thr = 0.408 + (targetAlt - alt) * 0.12 - vy * 0.2;
  if (dist < 14 && alt < 1.0) thr = 0.26;
  thr = clamp(thr, 0, 1);
  let desired = 8.0;
  if (dist < 16) desired = dist * 0.32;
  if (ground === 1 && dist > 14) desired = 5.0;
  const pitchR = pitch * Math.PI / 180;
  const rollR = roll * Math.PI / 180;
  const qR = q * Math.PI / 180;
  const pR = p * Math.PI / 180;
  const rR = r * Math.PI / 180;
  let dh = brg - hdg;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  let desiredPitch = clamp((desired - spd) * 0.06, -0.35, 0.35);
  let pitchCmd = clamp((desiredPitch - pitchR) * 3.0 - qR * 0.9, -1, 1);
  let desiredRoll = clamp(dh * 0.02, -0.55, 0.55);
  let rollCmd = clamp((desiredRoll - rollR) * 3.0 - pR * 0.9, -1, 1);
  let desiredRate = clamp(dh * 0.02, -0.5, 0.5);
  let yawCmd = clamp((desiredRate - rR) * 1.5, -1, 1);
  return { thr, roll: rollCmd, pitch: pitchCmd, yaw: yawCmd };
}

export { DT as FLIGHT_DT };