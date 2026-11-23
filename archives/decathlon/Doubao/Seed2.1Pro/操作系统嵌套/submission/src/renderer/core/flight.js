/* 直升机被控对象物理（排演）。
 * 状态随系统虚拟时间连续演化，不等待飞控；没有新控制输入时控制量保持。
 * 飞控进程经 flight-sensors / flight-control 两个宿主服务参与。
 * 物理落后于虚拟时间时按 dt 补算（不会变成慢动作）。 */
'use strict';
window.NOS = window.NOS || {};

const DEFAULT_PHYS = {
  mass: 900, radius: 2.4, gravity: 14.0,
  liftFactor: 0.062, pitchControl: 0.9, yawControl: 1.6, rollControl: 1.4,
  drag: 0.35, angularDrag: 1.6, instability: 0.55,
  hoverCollective: 50, groundY: 1.05, crashSpeed: 11, crashTilt: 1.05
};

class FlightModel {
  constructor(scene) {
    this.scene = scene;
    this.P = Object.assign({}, DEFAULT_PHYS, (scene.actor && scene.actor.physics) || {});
    this.reset();
  }

  reset(initial) {
    const root = (this.scene.actor && this.scene.actor.root) || { pos: [0, 1.05, 0], rot: [0, 0, 0] };
    this.pos = initial && initial.pos ? initial.pos.slice() : root.pos.slice();
    this.vel = initial && initial.vel ? initial.vel.slice() : [0, 0, 0];
    this.rot = initial && initial.rot ? initial.rot.slice() : [0, 0, 0]; // pitch, yaw, roll
    this.angvel = [0, 0, 0];
    this.rotorMain = 0;
    this.rotorTail = 0;
    this.controls = { collective: 0, pitch: 0, roll: 0, yaw: 0 };
    this.fault = null;
    this.damage = {};
    this.wind = [0, 0, 0];
    this.target = [90, -60];
    this.headingCmd = null;
    this.flying = false;
    this.crashed = false;
    this.settled = false;
    this.impact = null;
    this.time = 0;
    this.lastControlTime = -1;
    this.controlPeriods = [];
    this.smoke = 0; this.fire = 0;
  }

  setRehearsalInputs(inp) {
    if (inp.wind) this.wind = [inp.wind[0] || 0, 0, inp.wind[1] || 0];
    if (inp.target) this.target = inp.target;
    if (inp.heading !== undefined && inp.heading !== null) this.headingCmd = inp.heading;
    if (inp.faultAt !== undefined) this.faultAt = inp.faultAt;
  }

  triggerFault(kind) {
    if (this.crashed) return;
    this.fault = kind || 'tail-loss';
    this.damage['tail-rotor'] = 60;
  }

  /* 飞控写入控制量（保持到下次写入） */
  writeControl(c, simTime) {
    if (this.crashed) return;
    this.controls = {
      collective: clamp(c.collective || 0, 0, 100),
      pitch: clamp(c.pitch || 0, -1, 1),
      roll: clamp(c.roll || 0, -1, 1),
      yaw: clamp(c.yaw || 0, -1, 1)
    };
    if (this.lastControlTime >= 0) this.controlPeriods.push(simTime - this.lastControlTime);
    if (this.controlPeriods.length > 60) this.controlPeriods.shift();
    this.lastControlTime = simTime;
  }

  sensors(simTime) {
    return {
      t: simTime,
      pos: this.pos.slice(), vel: this.vel.slice(),
      rot: this.rot.slice(), angvel: this.angvel.slice(),
      rotorMain: this.rotorMain, rotorTail: this.rotorTail,
      fault: this.fault, wind: this.wind.slice(),
      target: this.target ? this.target.slice() : null,
      heading: this.headingCmd === null ? this.rot[1] : this.headingCmd,
      cruiseAlt: 12, flying: !this.crashed,
      controlPeriod: this.controlPeriods.length ? this.controlPeriods[this.controlPeriods.length - 1] : null,
      damage: Object.assign({}, this.damage)
    };
  }

  /* 推进 dt 毫秒（虚拟时间） */
  step(dtMs) {
    if (this.crashed) {
      this.time += dtMs;
      this.settleAftermath(dtMs);
      return;
    }
    const dt = dtMs / 1000;
    this.time += dtMs;
    const P = this.P;

    // 旋翼转速由总距驱动（有惯性）
    const mainTarget = this.controls.collective * 0.82;
    this.rotorMain += (mainTarget - this.rotorMain) * Math.min(1, dt * 1.8);
    const tailTarget = (this.fault === 'tail-loss' ? 0 : this.controls.collective * 4.9);
    this.rotorTail += (tailTarget - this.rotorTail) * Math.min(1, dt * 2.2);

    const onGround = this.pos[1] <= P.groundY + 0.02;
    // 升力：旋翼转速平方项（失速），总距
    let lift = P.liftFactor * this.rotorMain * this.rotorMain * 0.16 * (this.controls.collective / P.hoverCollective);
    lift = Math.min(lift, 22);

    // 姿态目标 -> 角加速度（无控制输入时不稳定：instability）
    const inst = P.instability * dt;
    const pitchTarget = this.controls.pitch * P.pitchControl * 0.35;
    const rollTarget = this.controls.roll * P.rollControl * 0.35;
    let yawTorque = this.controls.yaw * P.yawControl * 0.9;
    // 尾桨失效：偏航不可控，产生自旋
    if (this.fault === 'tail-loss') {
      yawTorque = 1.8 + Math.sin(this.time * 0.01) * 0.5;
      this.angvel[1] += yawTorque * dt;
      this.angvel[0] += 0.7 * dt;
      this.angvel[2] += (0.9 + Math.sin(this.time * 0.013) * 0.4) * dt;
    } else {
      this.angvel[0] += ((pitchTarget - this.rot[0]) * 3.2 - this.angvel[0] * P.angularDrag + (Math.random() - 0.5) * inst) * dt;
      this.angvel[2] += ((rollTarget - this.rot[2]) * 3.2 - this.angvel[2] * P.angularDrag + (Math.random() - 0.5) * inst) * dt;
      this.angvel[1] += (yawTorque * 0.9 - this.angvel[1] * P.angularDrag * 1.4) * dt;
    }
    for (let i = 0; i < 3; i++) {
      this.angvel[i] = clamp(this.angvel[i], -6, 6);
      this.rot[i] += this.angvel[i] * dt;
    }
    if (!this.fault) {
      this.rot[0] = clamp(this.rot[0], -0.9, 0.9);
      this.rot[2] = clamp(this.rot[2], -0.9, 0.9);
    }

    // 水平加速来自姿态
    const yaw = this.rot[1];
    const ax = Math.sin(this.rot[0]) * 10 * Math.cos(yaw) + Math.sin(this.rot[2]) * 6 * Math.sin(yaw);
    const az = -Math.sin(this.rot[0]) * 10 * Math.sin(yaw) + Math.sin(this.rot[2]) * 6 * Math.cos(yaw);

    this.vel[0] += (ax - this.vel[0] * P.drag + this.wind[0] * 0.35) * dt;
    this.vel[2] += (az - this.vel[2] * P.drag + this.wind[2] * 0.35) * dt;
    this.vel[1] += (lift - P.gravity - this.vel[1] * 0.25) * dt;

    for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;

    // 地面（地形高度由碰撞器提供）
    const ground = this.groundHeight ? this.groundHeight(this.pos) : P.groundY;
    if (this.pos[1] <= ground) {
      this.pos[1] = ground;
      const speed = Math.hypot(this.vel[0], this.vel[1], this.vel[2]);
      const tilt = Math.max(Math.abs(this.rot[0]), Math.abs(this.rot[2]));
      if (speed > P.crashSpeed || tilt > P.crashTilt || this.fault === 'tail-loss') {
        this.crash(speed);
      } else {
        this.vel[1] = 0;
        this.vel[0] *= 0.6; this.vel[2] *= 0.6;
        if (this.controls.collective < 5 && speed < 1) this.settled = true;
      }
    }
    if (this.pos[1] > 1.2) this.flying = true;

    // 与建筑/树木碰撞（简单球检测由碰撞器）
    if (this.collide) {
      const hit = this.collide(this.pos, P.radius);
      if (hit) {
        const speed = Math.hypot(...this.vel);
        if (speed > 6) this.crash(speed, hit);
      }
    }
  }

  crash(speed, hit) {
    if (this.crashed) return;
    this.crashed = true;
    this.impact = { at: this.time, pos: this.pos.slice(), speed };
    this.fault = 'crashed';
    const dmg = this.damage;
    dmg['skid-l'] = 100; dmg['skid-r'] = 80;
    dmg['fuselage'] = Math.min(100, (dmg['fuselage'] || 0) + 45 + speed * 2);
    dmg['main-rotor'] = 70; dmg['cockpit'] = 30;
    if (hit) dmg[hit.part] = 100;
    this.vel = [this.vel[0] * 0.2, -1, this.vel[2] * 0.2];
    this.rot[0] = 1.1; this.rot[2] = 1.2;
    this.smoke = this.scene.effects && this.scene.effects.impact ? this.scene.effects.impact.smoke : 40;
    this.fire = this.scene.effects && this.scene.effects.impact ? this.scene.effects.impact.fire : 18;
  }

  settleAftermath(dt) {
    this.rotorMain *= (1 - Math.min(1, dt * 1.5));
    this.rotorTail = 0;
    this.pos[1] = Math.max(0.55, this.pos[1] + this.vel[1] * dt);
    this.vel[1] = Math.max(0, this.vel[1] - 4 * dt);
    if (this.pos[1] <= 0.55) { this.pos[1] = 0.55; this.vel[1] = 0; }
    this.fire = Math.max(0, this.fire - dt * 0.6);
    // 烟在火灭后继续一小段
    this.smoke = Math.max(0, this.smoke - dt * 0.15);
  }

  /* 快照状态 */
  serialize() {
    return JSON.parse(JSON.stringify({
      pos: this.pos, vel: this.vel, rot: this.rot, angvel: this.angvel,
      rotorMain: this.rotorMain, rotorTail: this.rotorTail,
      controls: this.controls, fault: this.fault, damage: this.damage,
      wind: this.wind, target: this.target, headingCmd: this.headingCmd,
      flying: this.flying, crashed: this.crashed, settled: this.settled,
      impact: this.impact, time: this.time, lastControlTime: this.lastControlTime,
      controlPeriods: this.controlPeriods, smoke: this.smoke, fire: this.fire
    }));
  }
  restore(d) {
    d = typeof d === 'string' ? JSON.parse(d) : d;
    Object.assign(this, d);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

NOS.FlightModel = FlightModel;
