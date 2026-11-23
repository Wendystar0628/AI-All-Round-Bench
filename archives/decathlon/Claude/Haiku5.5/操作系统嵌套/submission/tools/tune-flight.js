'use strict';
// 飞控离线调参：与 assets/flight/controller.ns 的 control() 逐行对应，在同一物理库中飞行，检查悬停、前飞与降落。
// 用法：node tools/tune-flight.js
const fs = require('fs');
const path = require('path');
const S = require('../src/runtime/sim-natives.js');
const text = fs.readFileSync(path.join(__dirname, '..', 'assets', 'demo', 'helicopter-24.scene'), 'utf8');
const sc = S.sceneOf(text);

const HOVER_ALT = 6.5, LAND_ALT = 1.4;
const clamp1 = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function control(s) {
  const dx = s.tgtX - s.x, dz = s.tgtZ - s.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  let altT = HOVER_ALT;
  if (dist < 7) altT = LAND_ALT + Math.max(0, dist - 1.5) * 0.7;
  if (dist < 4) altT = 0.0;               // 停机坪半径 9 米，进入范围后直接下降接地
  let c = 0.5 + 0.25 * (altT - s.alt) - 0.45 * s.vy;
  c = clamp1(c, 0, 1);
  let ax = clamp1(0.3 * dx - 0.7 * s.vx, -2.2, 2.2);
  let az = clamp1(0.3 * dz - 0.7 * s.vz, -2.2, 2.2);
  if (dist < 2.5) { ax = clamp1(-0.8 * s.vx, -1, 1); az = clamp1(-0.8 * s.vz, -1, 1); }
  const fwd = ax * Math.sin(s.yaw) + az * Math.cos(s.yaw);
  const rgt = ax * Math.cos(s.yaw) - az * Math.sin(s.yaw);
  const lon = clamp1(-fwd / 9.81 / 0.35 - 0.3 * s.pitch, -1, 1);
  const lat = clamp1(rgt / 9.81 / 0.35 - 0.3 * s.roll, -1, 1);
  let wantYaw = 0;
  if (dist > 4) wantYaw = Math.atan2(dx, dz);
  let dy = wantYaw - s.yaw;
  while (dy > 3.14159) dy -= 6.28318;
  while (dy < -3.14159) dy += 6.28318;
  const tail = clamp1(1.6 * dy - 0.9 * s.yawRate, -1, 1);
  return { c, lon, lat, tail };
}

function run(seconds, quiet) {
  const st = S.newState(sc);
  st.preset = false;
  const ticks = [];
  let nextCtl = 0;
  let ctl = { c: 0.5, lon: 0, lat: 0, tail: 0 };
  while (st.t < seconds) {
    if (st.t >= nextCtl - 1e-9) {
      const sensed = S.sense ? null : null;
      const s = { t: st.t, alt: st.y - S.terrainH(sc, st.x, st.z), x: st.x, y: st.y, z: st.z, vx: st.vx, vy: st.vy, vz: st.vz, pitch: st.pitch, roll: st.roll, yaw: st.yaw, yawRate: st.yawRate, rotor: st.omega, tgtX: st.target[0], tgtZ: st.target[1] };
      ctl = control(s);
      S.applyEvent(st, [st.t, 'ctl', ctl]);
      nextCtl += 0.02;
    }
    S.substep(st, sc);
    if (Math.round(st.t * 100) % 300 === 0) ticks.push([st.t.toFixed(1), st.x.toFixed(1), st.y.toFixed(1), st.z.toFixed(1), st.vx.toFixed(1), st.vz.toFixed(1), st.pitch.toFixed(2), st.roll.toFixed(2), st.crashed]);
    if (st.crashed) break;
  }
  if (!quiet) for (const r of ticks) console.log(r.join('  '));
  return st;
}

const st = run(70, false);
console.log('final', st.x.toFixed(1), st.y.toFixed(2), st.z.toFixed(1), 'v', Math.hypot(st.vx, st.vy, st.vz).toFixed(2), 'crashed', st.crashed, st.crashWhy);
console.log('target', st.target, 'ground', S.terrainH(sc, st.x, st.z).toFixed(2));
