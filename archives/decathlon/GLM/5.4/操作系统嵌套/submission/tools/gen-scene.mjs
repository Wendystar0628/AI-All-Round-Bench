// 生成三维场景资源：直升机 24、默认演出记录、最小场景
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

// ---- 与 programs/Flight.nsl 完全一致的物理 ----
function groundAt(x, z) { const d = Math.sqrt(x * x + z * z); return d < 60 ? 0 : (d - 60) * 0.02; }
function initState() {
  return { pos: [0, 0.55, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, rpm: 0, rotor: 0, damage: 0, crashed: false };
}
function crash(p) {
  if (p.crashed) return null;
  p.crashed = true; p.damage = 1;
  const debris = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.399, r = 0.6 + (i % 5) * 0.35;
    debris.push({
      p: [p.pos[0] + Math.cos(a) * r, p.pos[1] + 0.4 + (i % 3) * 0.3, p.pos[2] + Math.sin(a) * r],
      v: [Math.cos(a) * (2 + (i % 4)), 2 + (i % 5) * 1.2, Math.sin(a) * (2 + (i % 3))],
      r: [a, a * 0.7, a * 1.3],
      s: [0.25 + (i % 4) * 0.12, 0.08, 0.5 + (i % 3) * 0.3],
      k: i % 3, rest: false
    });
  }
  p.vel = [0, 0, 0]; p.rpm = 0;
  return debris;
}
function step(p, dt, coll, cyc, tail, wind, t, fault) {
  p.rotor += p.rpm * 22 * dt;
  p.rpm += (coll * 34 - p.rpm) * dt * 1.6;
  if (p.rpm < 0) p.rpm = 0;
  const eff = fault > 0 ? 1 - fault * 0.75 : 1;
  const lift = p.rpm * p.rpm * 0.019 * coll * eff - 9.8;
  p.pitch += ((cyc * 0.9) - p.pitch) * dt * 3.2;
  p.roll += ((tail * 0.55) - p.roll) * dt * 3.2;
  if (fault > 0) {
    p.pitch += Math.sin(t * 7.3) * fault * dt * 2.2;
    p.roll += Math.cos(t * 6.1) * fault * dt * 2.6;
    p.yaw += fault * dt * 1.6;
  }
  const ax = Math.sin(p.yaw) * p.pitch * 11 + wind[0];
  const az = -Math.cos(p.yaw) * p.pitch * 11 + wind[1];
  p.vel[0] += ax * dt; p.vel[1] += lift * dt; p.vel[2] += az * dt;
  p.vel[0] *= (1 - 0.12 * dt); p.vel[2] *= (1 - 0.12 * dt);
  p.pos[0] += p.vel[0] * dt; p.pos[1] += p.vel[1] * dt; p.pos[2] += p.vel[2] * dt;
  const g = groundAt(p.pos[0], p.pos[2]);
  let debris = null;
  if (p.pos[1] < g + 0.55) {
    p.pos[1] = g + 0.55;
    const sp = Math.abs(p.vel[0]) + Math.abs(p.vel[1]) + Math.abs(p.vel[2]);
    if (sp > 6 || fault > 0.2) debris = crash(p);
    else { p.vel[1] = 0; p.vel[0] *= 0.8; p.vel[2] *= 0.8; }
  }
  if (p.pos[1] > 90) { p.pos[1] = 90; p.vel[1] = 0; }
  return debris;
}
function updateDebris(debris, dt) {
  for (const d of debris) {
    if (d.rest) continue;
    d.v[1] -= 9.8 * dt;
    d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt;
    d.r[0] += dt * 3; d.r[1] += dt * 4;
    const g = groundAt(d.p[0], d.p[2]) + 0.12;
    if (d.p[1] < g) {
      d.p[1] = g;
      if (Math.abs(d.v[1]) < 1.2) { d.rest = true; d.v = [0, 0, 0]; }
      else { d.v[1] = -d.v[1] * 0.32; d.v[0] *= 0.6; d.v[2] *= 0.6; }
    }
  }
}

// ---- 演出控制脚本（15 秒）----
const DURATION = 15;
function controlAt(t) {
  // 返回 [总距, 周期变距, 尾舵]
  if (t < 1.3) return [0.5, 0.0, 0.0];
  if (t < 2.4) return [0.93, 0.03, 0.02];
  if (t < 3.4) return [0.755, 0.06, 0.0];
  if (t < 5.2) return [0.775, 0.15, 0.1];
  if (t < 7.2) return [0.765, 0.13, -0.09];
  if (t < 9.0) return [0.775, 0.14, 0.06];
  if (t < 10.4) return [0.7, 0.06, 0.0];
  return [0.5, 0.0, 0.0];
}
function faultAtT(t) { return t < 9.6 ? 0 : Math.min(1, (t - 9.6) * 0.55); }

const p = initState();
let debris = [];
const controls = [];
const checkpoints = [];
let crashT = -1;
const dt = 1 / 60;
for (let i = 0; i <= DURATION * 60; i++) {
  const t = i * dt;
  const c = controlAt(t);
  const f = faultAtT(t);
  const d = step(p, dt, c[0], c[1], c[2], [0, 0], t, f);
  if (d) { debris = debris.concat(d); crashT = t; }
  updateDebris(debris, dt);
  if (i % 3 === 0) controls.push([Number(t.toFixed(3)), c[0], c[1], c[2]]);
  if (i % 30 === 0) {
    checkpoints.push([Number(t.toFixed(3)), p.pos.slice(), p.vel.slice(), p.yaw, p.pitch, p.roll, p.rpm, p.rotor, p.damage, p.crashed, JSON.parse(JSON.stringify(debris))]);
  }
}
console.log('撞击时刻', crashT.toFixed(2), '末态高度', p.pos[1].toFixed(2));

// ---- 直升机模型（部件层级）----
const PURPLE = '#6d3fb0', PURPLE_D = '#4a2a7a', YELLOW = '#f5c542', DARK = '#23262f', GLASS = '#1b2436';
const parts = [
  { name: 'body', parent: null, geo: { type: 'cylinder', r: 0.95, h: 3.2, axis: 'z' }, mat: { color: PURPLE, rough: 0.42, metal: 0.35 }, pos: [0, 1.35, 0] },
  { name: 'nose', parent: 'body', geo: { type: 'sphere', r: 0.92 }, mat: { color: PURPLE, rough: 0.38, metal: 0.4 }, pos: [0, 0, 1.55], scale: [0.95, 0.9, 1.15] },
  { name: 'canopy', parent: 'body', geo: { type: 'sphere', r: 0.86 }, mat: { color: GLASS, rough: 0.12, metal: 0.75 }, pos: [0, 0.18, 1.28], scale: [0.82, 0.72, 1.0] },
  { name: 'tail', parent: 'body', geo: { type: 'cylinder', r: 0.17, h: 3.6, axis: 'z' }, mat: { color: PURPLE, rough: 0.45, metal: 0.3 }, pos: [0, 0.32, -3.2] },
  { name: 'tailfin', parent: 'tail', geo: { type: 'box', size: [0.12, 1.15, 0.75] }, mat: { color: YELLOW, rough: 0.5, metal: 0.2 }, pos: [0, 0.5, -1.7] },
  { name: 'tailhub', parent: 'tail', geo: { type: 'cylinder', r: 0.13, h: 0.16, axis: 'x' }, mat: { color: DARK, rough: 0.6 }, pos: [0.16, 0.5, -1.7], spin: 'x' },
  { name: 'tailblade1', parent: 'tailhub', geo: { type: 'box', size: [0.04, 0.1, 1.5] }, mat: { color: DARK, rough: 0.6 }, pos: [0, 0, 0] },
  { name: 'tailblade2', parent: 'tailhub', geo: { type: 'box', size: [0.04, 1.5, 0.1] }, mat: { color: DARK, rough: 0.6 }, pos: [0, 0, 0] },
  { name: 'engine', parent: 'body', geo: { type: 'box', size: [0.95, 0.5, 1.5] }, mat: { color: '#2c2f3a', rough: 0.55, metal: 0.5 }, pos: [0, 0.95, -0.15] },
  { name: 'exhaust', parent: 'engine', geo: { type: 'cylinder', r: 0.14, h: 0.6, axis: 'z' }, mat: { color: '#3a3d47', rough: 0.4, metal: 0.8 }, pos: [0.3, 0.1, -0.9] },
  { name: 'mast', parent: 'body', geo: { type: 'cylinder', r: 0.11, h: 0.5, axis: 'y' }, mat: { color: DARK, rough: 0.5, metal: 0.7 }, pos: [0, 1.25, 0.1] },
  { name: 'rotorhub', parent: 'mast', geo: { type: 'cylinder', r: 0.24, h: 0.16, axis: 'y' }, mat: { color: '#8a8f9c', rough: 0.35, metal: 0.8 }, pos: [0, 0.25, 0], spin: 'y' },
  { name: 'blade1', parent: 'rotorhub', geo: { type: 'box', size: [4.6, 0.05, 0.3] }, mat: { color: '#2b2e37', rough: 0.55, metal: 0.4 }, pos: [2.2, 0, 0], tip: YELLOW },
  { name: 'blade2', parent: 'rotorhub', geo: { type: 'box', size: [4.6, 0.05, 0.3] }, mat: { color: '#2b2e37', rough: 0.55, metal: 0.4 }, pos: [-2.2, 0, 0], tip: YELLOW },
  { name: 'blade3', parent: 'rotorhub', geo: { type: 'box', size: [0.3, 0.05, 4.6] }, mat: { color: '#2b2e37', rough: 0.55, metal: 0.4 }, pos: [0, 0, 2.2], tip: YELLOW },
  { name: 'blade4', parent: 'rotorhub', geo: { type: 'box', size: [0.3, 0.05, 4.6] }, mat: { color: '#2b2e37', rough: 0.55, metal: 0.4 }, pos: [0, 0, -2.2], tip: YELLOW },
  { name: 'skidl', parent: 'body', geo: { type: 'cylinder', r: 0.07, h: 2.9, axis: 'z' }, mat: { color: '#3a3d47', rough: 0.4, metal: 0.8 }, pos: [-0.78, -1.3, 0] },
  { name: 'skidr', parent: 'body', geo: { type: 'cylinder', r: 0.07, h: 2.9, axis: 'z' }, mat: { color: '#3a3d47', rough: 0.4, metal: 0.8 }, pos: [0.78, -1.3, 0] },
  { name: 'strut1', parent: 'body', geo: { type: 'cylinder', r: 0.05, h: 0.95, axis: 'y' }, mat: { color: '#3a3d47', rough: 0.5, metal: 0.7 }, pos: [-0.55, -0.85, 0.75], rot: [0, 0, 0.32] },
  { name: 'strut2', parent: 'body', geo: { type: 'cylinder', r: 0.05, h: 0.95, axis: 'y' }, mat: { color: '#3a3d47', rough: 0.5, metal: 0.7 }, pos: [0.55, -0.85, 0.75], rot: [0, 0, -0.32] },
  { name: 'strut3', parent: 'body', geo: { type: 'cylinder', r: 0.05, h: 0.95, axis: 'y' }, mat: { color: '#3a3d47', rough: 0.5, metal: 0.7 }, pos: [-0.55, -0.85, -0.75], rot: [0, 0, 0.32] },
  { name: 'strut4', parent: 'body', geo: { type: 'cylinder', r: 0.05, h: 0.95, axis: 'y' }, mat: { color: '#3a3d47', rough: 0.5, metal: 0.7 }, pos: [0.55, -0.85, -0.75], rot: [0, 0, -0.32] },
  { name: 'decalL', parent: 'body', geo: { type: 'decal', text: '24', w: 1.05, h: 0.72 }, mat: { color: YELLOW, rough: 0.55 }, pos: [-0.9, 0.05, 0.15], rot: [0, -Math.PI / 2, 0] },
  { name: 'decalR', parent: 'body', geo: { type: 'decal', text: '24', w: 1.05, h: 0.72 }, mat: { color: YELLOW, rough: 0.55 }, pos: [0.9, 0.05, 0.15], rot: [0, Math.PI / 2, 0] },
  { name: 'light', parent: 'body', geo: { type: 'sphere', r: 0.09 }, mat: { color: '#ff5566', emissive: '#ff2233', emissiveI: 2 }, pos: [0, 0.95, -2.9] }
];
const trees = [];
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 90; i++) {
  const a = rnd() * Math.PI * 2, d = 26 + rnd() * 120;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
  trees.push({ pos: [Number(x.toFixed(1)), 0, Number(z.toFixed(1))], s: Number((0.7 + rnd() * 1.1).toFixed(2)), k: i % 3 });
}
const scene = {
  name: '直升机 24 · 默认演出',
  duration: DURATION,
  fps: 60,
  env: {
    sky: { top: '#141b3d', bottom: '#e79a5c', sun: [70, 46, -90], sunColor: '#ffd9a8', fog: '#3a4066', fogNear: 90, fogFar: 300, ambient: 0.42, sunI: 2.4 },
    weather: '黄昏 · 微风'
  },
  terrain: { size: 340, segments: 110, height: 3.2, seed: 11, color: '#3d5a3c', color2: '#5b7a4e' },
  pads: [{ pos: [0, 0.06, 0], r: 9 }, { pos: [46, 0.06, -34], r: 9 }],
  props: trees,
  heli: { root: 'body', parts },
  record: { init: { pos: [0, 0.55, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, rpm: 0 }, controls, checkpoints, faultAt: 9.6 }
};
fs.writeFileSync(path.join(outDir, 'helicopter-24.scene'), JSON.stringify(scene));
fs.writeFileSync(path.join(outDir, 'default-performance.rec'), JSON.stringify({ name: '默认演出', duration: DURATION, record: scene.record }));
console.log('场景已生成，控制点', controls.length, '检查点', checkpoints.length, '体积', (fs.statSync(path.join(outDir, 'helicopter-24.scene')).size / 1024).toFixed(0), 'KB');

// 最小场景：一个物体、一盏灯、一台相机
const minimal = {
  name: '最小场景', duration: 6, fps: 60,
  env: { sky: { top: '#101828', bottom: '#2b3a5a', sun: [20, 30, 20], sunColor: '#ffffff', fog: '#1a2238', fogNear: 40, fogFar: 160, ambient: 0.5, sunI: 2.0 } },
  terrain: { size: 120, segments: 40, height: 0, seed: 1, color: '#2b3140', color2: '#39415a' },
  pads: [], props: [],
  heli: { root: 'cube', parts: [
    { name: 'cube', parent: null, geo: { type: 'box', size: [2, 2, 2] }, mat: { color: '#f5b942', rough: 0.4, metal: 0.3 }, pos: [0, 2, 0] },
    { name: 'light', parent: null, geo: { type: 'sphere', r: 0.25 }, mat: { color: '#ffffff', emissive: '#fff6d8', emissiveI: 3 }, pos: [4, 6, 4], light: { color: '#fff2d0', i: 3, dist: 40 } }
  ] },
  record: { init: { pos: [0, 2, 0], vel: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, rpm: 0 }, controls: [], checkpoints: [[0, [0, 2, 0], [0, 0, 0], 0, 0, 0, 0, 0, 0, false, []]], faultAt: -1 }
};
fs.writeFileSync(path.join(outDir, 'minimal.scene'), JSON.stringify(minimal));
console.log('最小场景已生成');
