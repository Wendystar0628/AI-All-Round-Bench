import * as THREE from "../node_modules/three/build/three.module.js";

const UP = new THREE.Vector3(0, 1, 0);
const NOSE = new THREE.Vector3(0, 0, -1);

export function axes(yaw, pitch, roll) {
  const e = new THREE.Euler(-pitch, yaw, -roll, "YXZ");
  return {
    up: UP.clone().applyEuler(e),
    nose: NOSE.clone().applyEuler(e),
  };
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function terrain(x, z) {
  return Math.sin(x * 0.09) * 0.55 + Math.cos(z * 0.07) * 0.4;
}

export function stepHeli(s, cmd, dt) {
  const a = axes(s.yaw, s.pitch, s.roll);
  let rpmT = 1;
  if (s.fault && s.sim >= s.fault) rpmT = 0.28;
  s.rpm += (rpmT - s.rpm) * Math.min(1, 1.4 * dt);
  const lift = Math.max(0, s.rpm * s.rpm * cmd.collective * 21.5);
  s.vx += (a.up.x * lift + s.wind) * dt;
  s.vy += (a.up.y * lift - 9.8) * dt;
  s.vz += (a.up.z * lift) * dt;
  s.vx *= Math.exp(-0.45 * dt);
  s.vz *= Math.exp(-0.45 * dt);
  // 常值滚转力矩：零杆会自己倾覆。控制器必须持续配平。
  s.rr += (cmd.roll * 3.2 + s.roll * 0.85 + 0.35 - s.rr * 1.1) * dt;
  s.pr += (cmd.pitch * 3.2 + s.pitch * 0.85 - s.pr * 1.1) * dt;
  s.yr += (cmd.yaw * 1.8 - s.yr * 0.8) * dt;
  s.roll += s.rr * dt;
  s.pitch += s.pr * dt;
  s.yaw += s.yr * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  let gy = terrain(s.x, s.z);
  for (const p of s.pads) {
    const dx = s.x - p.x, dz = s.z - p.z;
    if (dx * dx + dz * dz < p.r * p.r) gy = Math.min(gy, p.y);
  }
  if (s.y < gy + 0.55) {
    if (s.vy < -3.2) { s.crashed = 1; s.damage = 1; }
    s.y = gy + 0.55;
    s.vy = 0;
    s.vx *= 0.5;
    s.vz *= 0.5;
    s.roll *= 0.85;
    s.pitch *= 0.85;
  }
  for (const o of s.obstacles) {
    if (s.x > o.x - o.w && s.x < o.x + o.w && s.z > o.z - o.d && s.z < o.z + o.d && s.y < o.h) {
      s.crashed = 1;
      s.damage = 1;
      s.vx = 0; s.vz = 0; s.vy = Math.min(0, s.vy);
    }
  }
  s.sim += dt;
}

export function control(s) {
  const altErr = s.ty - s.y;
  let col = 9.8 / 21.5 + altErr * 0.05 - s.vy * 0.09;
  const ex = s.tx - s.x;
  const ez = s.tz - s.z;
  const a = axes(s.yaw, s.pitch, s.roll);
  const fwd = ex * a.nose.x + ez * a.nose.z;
  const right = ex * (-a.nose.z) + ez * a.nose.x;
  let pitch = clamp(fwd * 0.03 - (s.vx * a.nose.x + s.vz * a.nose.z) * 0.07 - s.pitch * 1.6 - s.pr * 0.55, -0.35, 0.35);
  let roll = clamp(right * 0.03 - s.roll * 1.6 - s.rr * 0.55 - 0.12, -0.4, 0.4);
  const dy = wrap(s.heading - s.yaw);
  const yaw = clamp(dy * 0.85 - s.yr * 0.35, -0.8, 0.8);
  if (s.crashed) col = 0;
  return { collective: clamp(col, 0, 1), roll, pitch, yaw };
}

function fresh() {
  return {
    x: 0, y: terrain(0, 0) + 0.55, z: 0,
    vx: 0, vy: 0, vz: 0,
    roll: 0, pitch: 0, yaw: 0, rr: 0, pr: 0, yr: 0,
    rpm: 1, wind: 0, fault: 0, sim: 0, crashed: 0, damage: 0,
    tx: 34, ty: 8, tz: -16, heading: 0.6,
    pads: [{ x: 0, z: 0, r: 7, y: 0.15 }, { x: 34, z: -16, r: 7, y: 0.15 }],
    obstacles: [{ x: 16, z: 10, w: 3, d: 3, h: 7 }],
  };
}

const zero = axes(0, 0, 0);
console.log("level up", zero.up.toArray().map((n) => +n.toFixed(3)), "nose", zero.nose.toArray().map((n) => +n.toFixed(3)));
const pitched = axes(0, 0.2, 0);
console.log("pitch+ up", pitched.up.toArray().map((n) => +n.toFixed(3)), "nose", pitched.nose.toArray().map((n) => +n.toFixed(3)));

let s = fresh();
let cmd = control(s);
for (let i = 0; i < 20 * 26; i++) {
  if (s.sim > 10 && Math.hypot(s.tx - s.x, s.tz - s.z) < 3.5) s.ty = 0.7;
  cmd = control(s);
  stepHeli(s, cmd, 0.05);
  if (i % 40 === 0) console.log("t", s.sim.toFixed(1), "p", s.x.toFixed(1), s.y.toFixed(1), s.z.toFixed(1), "r", s.roll.toFixed(2), "c", s.crashed);
}
console.log("full budget", { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), crashed: s.crashed, roll: +s.roll.toFixed(2), dist: +Math.hypot(s.tx - s.x, s.tz - s.z).toFixed(2) });

s = fresh();
s.y = 8;
cmd = { collective: 0.456, roll: 0, pitch: 0, yaw: 0 };
for (let i = 0; i < 20 * 6; i++) stepHeli(s, cmd, 0.05);
console.log("air no cyclic", { y: +s.y.toFixed(2), roll: +s.roll.toFixed(2), crashed: s.crashed, x: +s.x.toFixed(1) });

s = fresh();
cmd = control(s);
for (let i = 0; i < 20 * 16; i++) {
  if (i % 10 === 0) cmd = control(s);
  stepHeli(s, cmd, 0.05);
}
console.log("slow 2Hz", { x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1), crashed: s.crashed, dist: +Math.hypot(34 - s.x, -16 - s.z).toFixed(1), roll: +s.roll.toFixed(2) });
