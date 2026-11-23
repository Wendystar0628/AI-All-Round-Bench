'use strict';
// 生成直升机场景资源与默认演出记录（检查点由与 flight.os 一致的物理预计算）。
// 运行: node scripts/gen-scene.js
const fs = require('fs');
const path = require('path');

const DT = 1 / 120, G = 9.8, MASS = 1200, MAX_THRUST = 18000, RATED = 320, SKID = 1.05;
const terrain = {
  size: 400, segments: 96, base: 0, roughness: 0.95,
  color1: '#39543a', color2: '#77875a',
  waves: [
    { amp: 1.1, freq: 0.045, dx: 1, dz: 0.6, phase: 0.8 },
    { amp: 0.7, freq: 0.09, dx: -0.7, dz: 1, phase: 2.1 },
    { amp: 0.35, freq: 0.2, dx: 1, dz: -1.2, phase: 4.0 }
  ]
};
const pads = [
  { name: 'pad1', pos: [-18, 8], r: 7, label: '24', color: '#3a3f52' },
  { name: 'pad2', pos: [26, -20], r: 7, label: 'H2', color: '#3a3f52' }
];
function terrainH(x, z) {
  let h = terrain.base;
  for (const w of terrain.waves) h += w.amp * Math.sin(w.freq * (w.dx * x + w.dz * z) + w.phase);
  for (const pad of pads) {
    const d = Math.hypot(x - pad.pos[0], z - pad.pos[1]);
    if (d < pad.r * 1.6) {
      let ph = terrain.base;
      for (const w of terrain.waves) ph += w.amp * Math.sin(w.freq * (w.dx * pad.pos[0] + w.dz * pad.pos[1]) + w.phase);
      const k = Math.max(0, Math.min(1, (d - pad.r) / (pad.r * 0.6)));
      const s = k * k * (3 - 2 * k);
      h = ph * (1 - s) + h * s;
    }
  }
  return h;
}
let rng = 12345;
function rnd() { rng = (rng * 1664525 + 1013904223) % 4294967296; if (rng < 0) rng += 4294967296; return rng / 4294967296; }
function initialState() {
  const p = [-18, 0, 8];
  p[1] = terrainH(p[0], p[2]) + SKID;
  return { pos: p, vel: [0, 0, 0], att: [0, 0.6, 0], angVel: [0, 0, 0], rpm: 0, rotorAngle: 0, tailAngle: 0, damage: {}, crashed: false, landed: true, crashT: -1, crashPos: null, success: false };
}
function ctrlAt(cs, t) {
  if (!cs.length) return { col: 0, cx: 0, cy: 0, ped: 0 };
  if (t <= cs[0].t) return cs[0];
  for (let i = 0; i < cs.length - 1; i++) {
    if (t >= cs[i].t && t <= cs[i + 1].t) {
      const a = cs[i], b = cs[i + 1], k = (t - a.t) / Math.max(0.0001, b.t - a.t);
      return { col: a.col + (b.col - a.col) * k, cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, ped: a.ped + (b.ped - a.ped) * k };
    }
  }
  return cs[cs.length - 1];
}
function integrate(st, c, t, dt, fault) {
  const targetRpm = fault ? 95 : RATED;
  const spool = fault ? 0.55 : 1.4;
  st.rpm += (targetRpm - st.rpm) * Math.min(1, spool * dt);
  if (st.crashed) st.rpm = Math.max(0, st.rpm - 260 * dt);
  const rpmK = st.rpm / RATED;
  let thrust = c.col * MAX_THRUST * rpmK * rpmK * (fault ? 0.42 : 1);
  if (st.crashed) thrust = 0;
  const roll = st.att[0], pitch = st.att[1], yaw = st.att[2];
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const upx = cy * sp * cr + sy * sr, upy = cp * cr, upz = sy * sp * cr - cy * sr;
  const ax = upx * thrust / MASS - st.vel[0] * 0.12;
  const ay = upy * thrust / MASS - G - st.vel[1] * 0.06;
  const az = upz * thrust / MASS - st.vel[2] * 0.12;
  st.vel[0] += ax * dt; st.vel[1] += ay * dt; st.vel[2] += az * dt;
  st.pos[0] += st.vel[0] * dt; st.pos[1] += st.vel[1] * dt; st.pos[2] += st.vel[2] * dt;
  const vib = fault ? 1.7 : 0.06;
  const n1 = (rnd() - 0.5) * vib, n2 = (rnd() - 0.5) * vib, n3 = (rnd() - 0.5) * vib * 0.6;
  if (!st.crashed) {
    st.angVel[0] += (c.cx * 2.6 + roll * 0.5 + n1 - st.angVel[0] * 0.55) * dt;
    st.angVel[1] += (c.cy * 2.6 + pitch * 0.5 + n2 - st.angVel[1] * 0.55) * dt;
    st.angVel[2] += (c.ped * 2.0 + n3 - st.angVel[2] * 0.8) * dt;
    st.att[0] += st.angVel[0] * dt; st.att[1] += st.angVel[1] * dt; st.att[2] += st.angVel[2] * dt;
  } else {
    st.angVel[0] *= (1 - 2.2 * dt); st.angVel[1] *= (1 - 2.2 * dt); st.angVel[2] *= (1 - 1.4 * dt);
    st.att[0] += st.angVel[0] * dt; st.att[1] += st.angVel[1] * dt; st.att[2] += st.angVel[2] * dt;
    st.att[0] = st.att[0] * (1 - 0.7 * dt) + 0.32 * 0.7 * dt;
    st.att[1] = st.att[1] * (1 - 0.7 * dt) - 0.18 * 0.7 * dt;
  }
  st.rotorAngle += st.rpm / 60 * 6.28318 * dt;
  st.tailAngle += st.rpm / 60 * 6.28318 * 3.2 * dt;
  const gh = terrainH(st.pos[0], st.pos[2]) + SKID;
  if (st.pos[1] <= gh) {
    const impactV = -st.vel[1];
    const tilt = Math.abs(st.att[0]) + Math.abs(st.att[1]);
    if (!st.crashed && (impactV > 3.2 || tilt > 0.95 || (fault && impactV > 1.6))) {
      st.crashed = true; st.crashT = t; st.crashPos = st.pos.slice();
      st.damage = { body: 0.8, canopy: 1, tailBoom: 0.7, tailFin: 0.9, engine: 0.6, skidL: 0.8, skidR: 0.5, mainRotor: 0.9, tailRotor: 1 };
      st.angVel[0] = (rnd() - 0.5) * 5; st.angVel[1] = (rnd() - 0.5) * 4; st.angVel[2] = (rnd() - 0.5) * 6;
      st.vel[0] *= 0.35; st.vel[2] *= 0.35;
      st.vel[1] = impactV > 6 ? 2.2 : 0.6;
    } else if (!st.crashed) {
      st.landed = true; st.vel[1] = 0;
      st.vel[0] *= (1 - 3 * dt); st.vel[2] *= (1 - 3 * dt);
      st.att[0] *= (1 - 4 * dt); st.att[1] *= (1 - 4 * dt);
      st.angVel[0] = 0; st.angVel[1] = 0;
    }
    st.pos[1] = gh;
    if (st.crashed) {
      st.vel[1] -= G * dt;
      if (st.vel[1] < 0) st.vel[1] = 0;
      st.vel[0] *= (1 - 4 * dt); st.vel[2] *= (1 - 4 * dt);
    }
  } else st.landed = false;
  return st;
}

// 默认演出控制时序
const controls = [
  { t: 0.0, col: 0, cx: 0, cy: 0, ped: 0 },
  { t: 0.9, col: 0.5, cx: 0, cy: 0, ped: 0 },
  { t: 1.6, col: 0.86, cx: 0, cy: 0, ped: 0 },
  { t: 4.0, col: 0.86, cx: 0, cy: 0, ped: 0 },
  { t: 4.8, col: 0.635, cx: 0.03, cy: 0.1, ped: 0.04 },
  { t: 6.2, col: 0.64, cx: 0.1, cy: 0.06, ped: 0.12 },
  { t: 7.1, col: 0.635, cx: -0.06, cy: 0.02, ped: 0.06 },
  { t: 7.5, col: 0.635, cx: 0, cy: 0, ped: 0 },
  { t: 8.0, col: 0.92, cx: 0, cy: 0, ped: 0 },
  { t: 9.2, col: 1.0, cx: 0, cy: 0.04, ped: 0 },
  { t: 10.8, col: 0.3, cx: 0, cy: 0, ped: 0 },
  { t: 15.0, col: 0, cx: 0, cy: 0, ped: 0 }
];
const faults = [{ t: 7.5, kind: 'engine' }];

function simulate() {
  rng = 12345;
  let st = initialState();
  let t = 0;
  const checkpoints = [{ t: 0, state: JSON.parse(JSON.stringify(st)), rng }];
  let nextCp = 0.5;
  let crashReport = null;
  const samples = [];
  while (t < 15) {
    const c = ctrlAt(controls, t);
    const fault = faults.some(f => t >= f.t);
    st = integrate(st, c, t, DT, fault);
    t += DT;
    if (st.crashed && !crashReport) crashReport = { t: st.crashT, pos: st.crashPos.slice(), vel: st.vel.slice() };
    if (t >= nextCp) {
      checkpoints.push({ t: Math.round(t * 1000) / 1000, state: JSON.parse(JSON.stringify(st)), rng });
      nextCp += 0.5;
    }
    if (Math.abs(t - Math.round(t * 2) / 2) < DT / 2) samples.push({ t: Math.round(t * 100) / 100, y: Math.round(st.pos[1] * 100) / 100, x: Math.round(st.pos[0] * 100) / 100, z: Math.round(st.pos[2] * 100) / 100, rpm: Math.round(st.rpm), crashed: st.crashed });
  }
  return { checkpoints, crashReport, samples, final: st };
}

const sim = simulate();
console.log('坠机时刻:', sim.crashReport ? sim.crashReport.t.toFixed(2) + 's' : '未坠毁!');
if (sim.crashReport) console.log('坠机位置:', sim.crashReport.pos.map(v => v.toFixed(1)).join(', '));
console.log('轨迹采样:');
for (const s of sim.samples) console.log(`  t=${s.t}s pos=(${s.x}, ${s.y}, ${s.z}) rpm=${s.rpm}${s.crashed ? ' [CRASH]' : ''}`);

// ---------- 场景资源 ----------
const liveryOps = [
  { op: 'fill', color: '#5e3a86' },
  { op: 'gradient', from: '#6d46a0', to: '#4a2d6e', dir: 'v' },
  { op: 'rect', x: 0, y: 150, w: 512, h: 26, color: '#f5b942' },
  { op: 'rect', x: 0, y: 180, w: 512, h: 8, color: '#2a1d3d' },
  { op: 'text', text: '24', x: 128, y: 104, size: 96, color: '#f5b942', weight: 'bold' },
  { op: 'text', text: '24', x: 384, y: 104, size: 96, color: '#f5b942', weight: 'bold' },
  { op: 'text', text: 'NESTED OS', x: 128, y: 210, size: 22, color: 'rgba(255,255,255,0.55)' },
  { op: 'text', text: 'NESTED OS', x: 384, y: 210, size: 22, color: 'rgba(255,255,255,0.55)' },
  { op: 'noise', amount: 10, seed: 5 }
];
const buildingTex = [
  { op: 'fill', color: '#2c3050' },
  { op: 'noise', amount: 14, seed: 9 }
];
for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
  buildingTex.push({ op: 'rect', x: 14 + c * 40, y: 16 + r * 30, w: 22, h: 16, color: (r * 6 + c) % 3 === 0 ? '#f5c96a' : '#1a1e36' });
}
const scene = {
  format: 'nestedos-scene', version: 1,
  meta: { title: '直升机 24 · 起飞与坠毁', fps: 30, duration: 15 },
  environment: {
    skyTop: '#141b38', skyBottom: '#7a4f7e',
    fog: { color: '#3a3055', near: 90, far: 380 },
    sun: { pos: [60, 80, 30], color: '#ffd9a0', intensity: 1.9 },
    ambient: { color: '#8890c0', intensity: 0.55 }
  },
  terrain, pads,
  textures: {
    livery: { w: 512, h: 256, ops: liveryOps },
    building: { w: 256, h: 256, ops: buildingTex },
    canopy: { w: 64, h: 64, ops: [{ op: 'gradient', from: '#3b4a6b', to: '#141a2e', dir: 'v' }] }
  },
  materials: {
    heliPurple: { color: '#5e3a86', roughness: 0.42, metalness: 0.25 },
    heliBody: { color: '#ffffff', map: 'livery', roughness: 0.38, metalness: 0.3 },
    heliYellow: { color: '#f5b942', roughness: 0.45, metalness: 0.2 },
    dark: { color: '#23263a', roughness: 0.6, metalness: 0.4 },
    glass: { color: '#2c3a5c', roughness: 0.12, metalness: 0.85 },
    blade: { color: '#1d2030', roughness: 0.5, metalness: 0.3 },
    building: { color: '#ffffff', map: 'building', roughness: 0.8 },
    trunk: { color: '#4a3626', roughness: 0.95 },
    leaf: { color: '#3f6b3a', roughness: 0.95 },
    leaf2: { color: '#557a44', roughness: 0.95 },
    rock: { color: '#585d70', roughness: 0.9 }
  },
  geometries: {
    fuselage: { type: 'sphere', r: 1, ws: 28, hs: 20 },
    canopy: { type: 'sphere', r: 0.8, ws: 20, hs: 14 },
    tailBoom: { type: 'cylinder', rt: 0.14, rb: 0.34, h: 3.4, seg: 12 },
    tailFin: { type: 'box', w: 0.55, h: 1.35, d: 0.12 },
    tailBlade: { type: 'box', w: 0.1, h: 1.6, d: 0.14 },
    engine: { type: 'box', w: 1.5, h: 0.55, d: 0.85 },
    hub: { type: 'cylinder', rt: 0.16, rb: 0.2, h: 0.35, seg: 10 },
    bladeMain: { type: 'box', w: 10.6, h: 0.07, d: 0.32 },
    skid: { type: 'cylinder', rt: 0.07, rb: 0.07, h: 3.1, seg: 8 },
    strut: { type: 'cylinder', rt: 0.05, rb: 0.05, h: 0.75, seg: 6 },
    debrisBlade: { type: 'box', w: 2.2, h: 0.09, d: 0.32 },
    debrisPanel: { type: 'box', w: 1.2, h: 0.5, d: 0.12 },
    debrisChunk: { type: 'box', w: 0.55, h: 0.42, d: 0.6 },
    trunk: { type: 'cylinder', rt: 0.22, rb: 0.34, h: 2.4, seg: 8 },
    crown: { type: 'cone', r: 1.7, h: 3.4, seg: 9 },
    crown2: { type: 'sphere', r: 1.5, ws: 10, hs: 8 },
    rock: { type: 'sphere', r: 1, ws: 8, hs: 6 },
    bldA: { type: 'box', w: 9, h: 16, d: 9 },
    bldB: { type: 'box', w: 7, h: 11, d: 7 },
    bldC: { type: 'box', w: 12, h: 7, d: 8 }
  },
  nodes: [
    { name: 'heli', parent: null, geo: 'hub', mat: 'dark', pos: [0, 0, 0], scale: [0.001, 0.001, 0.001], shadow: 'none' },
    { name: 'body', parent: 'heli', geo: 'fuselage', mat: 'heliBody', pos: [0, 0, 0], scale: [2.7, 1.15, 1.2], shadow: 'both' },
    { name: 'canopy', parent: 'heli', geo: 'canopy', mat: 'glass', pos: [1.75, 0.32, 0], scale: [1.15, 0.85, 0.95], shadow: 'cast' },
    { name: 'tailBoom', parent: 'heli', geo: 'tailBoom', mat: 'heliPurple', pos: [-3.2, 0.28, 0], rot: [0, 0, 1.5708], shadow: 'both' },
    { name: 'tailFin', parent: 'heli', geo: 'tailFin', mat: 'heliYellow', pos: [-4.85, 0.85, 0], shadow: 'both' },
    { name: 'tailRotor', parent: 'heli', geo: 'hub', mat: 'dark', pos: [-4.9, 0.85, 0.28], scale: [0.5, 0.5, 0.5], shadow: 'cast' },
    { name: 'tailBladeA', parent: 'tailRotor', geo: 'tailBlade', mat: 'blade', pos: [0, 0, 0], shadow: 'cast' },
    { name: 'tailBladeB', parent: 'tailRotor', geo: 'tailBlade', mat: 'blade', pos: [0, 0, 0], rot: [1.5708, 0, 0], shadow: 'cast' },
    { name: 'engine', parent: 'heli', geo: 'engine', mat: 'dark', pos: [-0.35, 1.0, 0], shadow: 'both' },
    { name: 'mainRotor', parent: 'heli', geo: 'hub', mat: 'dark', pos: [-0.2, 1.42, 0], shadow: 'cast' },
    { name: 'bladeA', parent: 'mainRotor', geo: 'bladeMain', mat: 'blade', pos: [0, 0.12, 0], shadow: 'cast' },
    { name: 'bladeB', parent: 'mainRotor', geo: 'bladeMain', mat: 'blade', pos: [0, 0.12, 0], rot: [0, 1.5708, 0], shadow: 'cast' },
    { name: 'skidL', parent: 'heli', geo: 'skid', mat: 'dark', pos: [0.1, -1.05, 0.95], rot: [0, 0, 1.5708], shadow: 'cast' },
    { name: 'skidR', parent: 'heli', geo: 'skid', mat: 'dark', pos: [0.1, -1.05, -0.95], rot: [0, 0, 1.5708], shadow: 'cast' },
    { name: 'strutFL', parent: 'heli', geo: 'strut', mat: 'dark', pos: [0.9, -0.7, 0.8], rot: [0.35, 0, 0], shadow: 'cast' },
    { name: 'strutFR', parent: 'heli', geo: 'strut', mat: 'dark', pos: [0.9, -0.7, -0.8], rot: [-0.35, 0, 0], shadow: 'cast' },
    { name: 'strutBL', parent: 'heli', geo: 'strut', mat: 'dark', pos: [-0.9, -0.7, 0.8], rot: [0.35, 0, 0], shadow: 'cast' },
    { name: 'strutBR', parent: 'heli', geo: 'strut', mat: 'dark', pos: [-0.9, -0.7, -0.8], rot: [-0.35, 0, 0], shadow: 'cast' }
  ],
  rig: {
    root: 'heli', rotor: 'mainRotor', tailRotor: 'tailRotor', rotorRadius: 5.3,
    blades: ['bladeA', 'bladeB'],
    damageable: ['body', 'canopy', 'tailBoom', 'tailFin', 'engine', 'skidL', 'skidR', 'mainRotor', 'tailRotor', 'tailBladeA', 'tailBladeB']
  },
  scatter: { grass: { count: 650, range: 130, seed: 11, color: '#5d7a42' } },
  cameras: { default: { pos: [-30, 6, 24], target: [-18, 2, 8], fov: 55 } },
  showCams: [
    { t: 0, off: [-11, 2.2, 13], fov: 50 },
    { t: 2.5, off: [-13, 4.5, 10], fov: 52 },
    { t: 5, off: [10, 3.5, 14], fov: 55 },
    { t: 7.4, off: [-7.5, 1.6, 8.5], fov: 45 },
    { t: 9, off: [16, 8, 18], fov: 55 },
    { t: 10.4, off: [20, 7, 22], fov: 58 },
    { t: 12.5, off: [12, 4, 14], fov: 50 },
    { t: 15, off: [9, 3, 11], fov: 48 }
  ],
  record: {
    initial: { pos: [-18, 0, 8], yaw: 0.6 },
    controls, faults,
    checkpoints: sim.checkpoints,
    duration: 15
  }
};
// 环境对象：建筑、树木、岩石
const envNodes = [
  { name: 'bldA', geo: 'bldA', mat: 'building', x: 44, z: 34, ry: 0.3 },
  { name: 'bldB', geo: 'bldB', mat: 'building', x: -48, z: -38, ry: -0.2 },
  { name: 'bldC', geo: 'bldC', mat: 'building', x: 58, z: -48, ry: 0.5 }
];
for (const b of envNodes) {
  const g = scene.geometries[b.geo];
  scene.nodes.push({ name: b.name, parent: null, geo: b.geo, mat: b.mat, pos: [b.x, terrainH(b.x, b.z) + g.h / 2 - 0.3, b.z], rot: [0, b.ry, 0], shadow: 'both' });
}
const trees = [[-34, 26], [-40, 18], [-28, 34], [36, 14], [42, 6], [30, 26], [-12, -30], [-4, -36], [8, -32], [18, 38], [-46, -8], [50, 20], [-38, -24], [14, -40]];
trees.forEach((p, i) => {
  const y = terrainH(p[0], p[1]);
  const leaf = i % 2 === 0 ? 'leaf' : 'leaf2';
  const crown = i % 2 === 0 ? 'crown' : 'crown2';
  scene.nodes.push({ name: 'trunk' + i, parent: null, geo: 'trunk', mat: 'trunk', pos: [p[0], y + 1.2, p[1]], shadow: 'both' });
  scene.nodes.push({ name: 'crown' + i, parent: null, geo: crown, mat: leaf, pos: [p[0], y + 3.6, p[1]], scale: [1 + (i % 3) * 0.15, 1 + (i % 2) * 0.2, 1 + (i % 3) * 0.15], shadow: 'both' });
});
const rocks = [[-8, 18], [22, 4], [-26, -12], [38, -14], [4, 28]];
rocks.forEach((p, i) => {
  scene.nodes.push({ name: 'rock' + i, parent: null, geo: 'rock', mat: 'rock', pos: [p[0], terrainH(p[0], p[1]) + 0.3, p[1]], scale: [1.2 + i * 0.2, 0.7, 1 + i * 0.15], shadow: 'both' });
});

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'helicopter-24.scene.json'), JSON.stringify(scene));
console.log('已写入 helicopter-24.scene.json (' + (JSON.stringify(scene).length / 1024).toFixed(0) + ' KB)');

// 最小场景示例（一个物体、一盏灯、一台相机）
const minimal = {
  format: 'nestedos-scene', version: 1,
  meta: { title: '最小场景示例', fps: 30, duration: 4 },
  environment: { skyTop: '#10142a', skyBottom: '#3a3055', sun: { pos: [8, 12, 6], color: '#ffe8c0', intensity: 1.6 }, ambient: { color: '#8890c0', intensity: 0.6 } },
  terrain: { size: 60, segments: 24, base: 0, color1: '#3a4060', color2: '#4a5070', waves: [] },
  pads: [{ name: 'p1', pos: [0, 0], r: 4, label: 'H' }, { name: 'p2', pos: [10, 0], r: 3, label: '2' }],
  textures: {},
  materials: { cube: { color: '#f5b942', roughness: 0.35, metalness: 0.3 } },
  geometries: { cube: { type: 'box', w: 1.6, h: 1.6, d: 1.6 } },
  nodes: [{ name: 'cube', parent: null, geo: 'cube', mat: 'cube', pos: [0, 1.85, 0], shadow: 'both' }],
  rig: { root: 'cube', damageable: ['cube'] },
  cameras: { default: { pos: [5, 3.5, 6], target: [0, 1, 0], fov: 50 } },
  showCams: [{ t: 0, off: [5, 2.5, 6], fov: 50 }, { t: 4, off: [-5, 2.5, 6], fov: 50 }],
  record: { initial: { pos: [0, 0, 0], yaw: 0 }, controls: [{ t: 0, col: 0, cx: 0, cy: 0, ped: 0 }], faults: [], checkpoints: [], duration: 4 }
};
fs.writeFileSync(path.join(outDir, 'minimal.scene.json'), JSON.stringify(minimal));
console.log('已写入 minimal.scene.json');
if (!sim.crashReport) { console.error('警告: 默认演出未坠毁，需要调整控制时序'); process.exit(1); }
if (sim.crashReport.t < 9 || sim.crashReport.t > 12) { console.error('警告: 坠机时刻偏离 10s 附近'); }
