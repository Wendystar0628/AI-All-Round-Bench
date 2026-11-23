'use strict';
// 生成三维场景资源 assets/demo/helicopter-24.scene（JSON）。
// 包含：地形高度网格、停机坪 A/B、建筑与天线障碍、树木、相机关键帧、直升机参数，
// 以及默认演出的飞行记录（输入的控制时序与尾桨故障）。记录由一个脚本化的飞控在本物理库中生成，
// 之后作为输入回放：结局只取决于输入，与运行时的预算无关。
// 用法：node tools/make-scene.js
const fs = require('fs');
const path = require('path');
const { prepareScene, terrainH, substep, newState, applyEvent, SUB, G } = require('../src/runtime/sim-natives.js');

const N = 129;
const SIZE = 480;
const X0 = -SIZE / 2, Z0 = -SIZE / 2;
const step = SIZE / (N - 1);

const PADS = [
  { id: 'A', x: -40, z: -20, r: 9 },
  { id: 'B', x: 60, z: 50, r: 9 },
];

function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// 地形：多个正弦叠加加上若干山丘，停机坪周围压平
const hills = [[-120, 90, 22, 34], [130, -110, 28, 40], [150, 120, 20, 26], [-160, -140, 26, 30], [20, 160, 30, 28]];
function rawHeight(x, z) {
  let h = 4.2 * Math.sin(x * 0.021) + 3.1 * Math.cos(z * 0.026) + 1.8 * Math.sin((x + z) * 0.047) + 1.2 * Math.cos((x - z) * 0.09);
  for (const [cx, cz, r, a] of hills) {
    const d2 = ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r);
    h += a * Math.exp(-d2);
  }
  return h + 2;
}
function padFlat(x, z) {
  let w = 1;
  let base = null;
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 14) {
      const k = Math.min(1, Math.max(0, (d - p.r) / 14));
      w = Math.min(w, k);
      base = base === null ? rawHeight(p.x, p.z) : base;
    }
  }
  return { w, base };
}

const heights = [];
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = X0 + i * step, z = Z0 + j * step;
    const raw = rawHeight(x, z);
    let h = raw;
    let flatten = 1;
    for (const p of PADS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 14) {
        const k = Math.min(1, Math.max(0, (d - p.r) / 14));
        flatten = Math.min(flatten, k);
      }
    }
    if (flatten < 1) {
      const pad = PADS.reduce((best, p) => (Math.hypot(x - p.x, z - p.z) < Math.hypot(x - best.x, z - best.z) ? p : best));
      const base = rawHeight(pad.x, pad.z);
      h = base + (raw - base) * flatten;
    }
    heights.push(Math.round(h * 100) / 100);
  }
}

const obstacles = [
  { id: 'hangar', x: -95, z: 60, y: 0, sx: 26, sy: 9, sz: 16, rot: 0.3 },
  { id: 'tower', x: 118, z: -86, y: 0, sx: 7, sy: 26, sz: 7, rot: 0 },
  { id: 'antenna', x: 24, z: -70, y: 0, sx: 2.4, sy: 34, sz: 2.4, rot: 0 },
  { id: 'store', x: 96, z: 128, y: 0, sx: 18, sy: 7, sz: 12, rot: -0.2 },
];
for (const b of obstacles) b.y = Math.round(terrainH({ terrain: { x0: X0, z0: Z0, size: SIZE, n: N, h: heights, step } }, b.x, b.z) * 100) / 100;

// 树木：避开停机坪与障碍
const rng = rnd(20261109);
const trees = [];
let guard = 0;
while (trees.length < 170 && guard < 20000) {
  guard++;
  const x = X0 + 6 + rng() * (SIZE - 12);
  const z = Z0 + 6 + rng() * (SIZE - 12);
  if (PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 16)) continue;
  if (obstacles.some((b) => Math.abs(x - b.x) < b.sx / 2 + 6 && Math.abs(z - b.z) < b.sz / 2 + 6)) continue;
  const gh = terrainH({ terrain: { x0: X0, z0: Z0, size: SIZE, n: N, h: heights, step } }, x, z);
  trees.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(gh * 100) / 100, Math.round((4.5 + rng() * 4) * 10) / 10]);
}

const scene = {
  format: 'scene',
  version: 1,
  name: '直升机 24 号 · 停机坪演出',
  env: {
    time: 17.6,              // 傍晚时刻（小时）
    weather: 'dusk-breeze',
    wind: [1.2, 0.4],        // 默认风速（米/秒，东、北）
    sun: [-0.55, 0.7, 0.35],
    fogNear: 220,
    fogFar: 620,
  },
  terrain: { x0: X0, z0: Z0, size: SIZE, n: N, heights },
  helipads: PADS.map((p) => ({ id: p.id, x: p.x, z: p.z, r: p.r, y: Math.round(rawHeight(p.x, p.z) * 100) / 100 })),
  obstacles,
  trees,
  heli: {
    name: '24',
    mass: 1,
    rotorR: 7.2,
    fuselage: { length: 11.5, width: 2.6, height: 3.2 },
    skid: 0.6,
    colors: { body: '#7c3fd6', stripe: '#ffd23f', dark: '#2a2140', glass: '#9fd8ff' },
  },
  start: { pos: [PADS[0].x, Math.round((rawHeight(PADS[0].x, PADS[0].z) + 0.6) * 100) / 100, PADS[0].z], yaw: 0, target: [PADS[1].x, PADS[1].z] },
  camera: {
    // 演出镜头关键帧：[时刻, 机位, 注视点, 视场角]
    keys: [
      [0, [-70, 9, -54], [-40, 3, -20], 42],
      [4, [-28, 16, -60], [-30, 6, -18], 40],
      [9, [14, 22, -48], [-6, 10, -6], 38],
      [12, [32, 14, -6], [-2, 9, 2], 44],
      [15, [40, 7, -26], [-6, 8, 2], 40],
    ],
  },
  record: { duration: 15, events: [] },
};

// ---------------- 默认演出记录 ----------------
// 脚本化飞控：由测量值计算控制量（悬停、前飞、转向），在第 8 秒注入尾桨故障。
function scriptedControl(s, t) {
  const alt = s.y - terrainH({ terrain: { x0: X0, z0: Z0, size: SIZE, n: N, h: heights, step } }, s.x, s.z);
  let c = 0.5;
  if (t < 2.5) c = 0.5 + 0.1 * (t / 2.5);       // 旋翼启动后缓慢离地
  if (t >= 2.5 && t < 4.0) c = 0.62;
  const climbErr = 4.6 - alt;
  c = Math.max(0, Math.min(1, c + 0.25 * climbErr - 0.22 * s.vy));
  // 前飞：先离地后向 B 方向略微前飞（沿世界 +z 方向）
  let lon = 0, lat = 0;
  if (t > 5 && t < 9) lon = -0.18;
  if (t > 9) lon = 0.05;
  lat = Math.max(-0.5, Math.min(0.5, -0.5 * s.roll - 0.8 * (s.x + 40) * 0.01 - 0.25 * s.vx));
  lon = Math.max(-0.6, Math.min(0.6, lon - 0.9 * s.pitch - 0.25 * s.vz));
  const tail = Math.max(-1, Math.min(1, -1.6 * s.yaw * 0 - 0.8 * s.yawRate));
  return { c, lon, lat, tail };
}

const st = newState({ terrain: { x0: X0, z0: Z0, size: SIZE, n: N, h: heights, step }, start: scene.start, env: scene.env, record: { events: [] } });
st.preset = false;
const sc = prepareScene(scene);
// 使用同一个准备好的场景对象进行模拟
const events = [];
const P = sc;
P.record = { events: [] };
const sim = newState(P);
sim.preset = false;
let tNext = 0;
const dtCtl = 0.1;
const FAULT_T = 8.0;
const END_T = 15.0;
let faultDone = false;
const wind = [1.2, 0.4];
events.push([0, 'wind', wind]);
events.push([0, 'target', [PADS[1].x, PADS[1].z]]);
let ctl = { c: 0.5, lon: 0, lat: 0, tail: 0 };
const setCtl = (c) => { ctl = c; events.push([Math.round(sim.t * 1000) / 1000, 'ctl', { c: round3(c.c), lon: round3(c.lon), lat: round3(c.lat), tail: round3(c.tail) }]); };
function round3(v) { return Math.round(v * 1000) / 1000; }
setCtl({ c: 0, lon: 0, lat: 0, tail: 0 });
while (sim.t < END_T - 1e-9) {
  if (sim.t >= tNext - 1e-9) {
    if (!faultDone && sim.t >= FAULT_T) {
      faultDone = true;
      events.push([round3(sim.t), 'fault', 'tail']);
      applyEvent(sim, [sim.t, 'fault', 'tail']);
    }
    const cmd = sim.crashed ? { c: 0, lon: 0, lat: 0, tail: 0 } : scriptedControl(sim, sim.t);
    setCtl(cmd);
    applyEvent(sim, [sim.t, 'ctl', { c: cmd.c, lon: cmd.lon, lat: cmd.lat, tail: cmd.tail }]);
    tNext += dtCtl;
  }
  substep(sim, P);
}
P.record.events = events;
scene.record.events = events;
// 目视检查：生成过程中的关键结果
const finalSt = sim;
console.log('crash:', finalSt.crashed, 'at', finalSt.crashT.toFixed(2), 's', finalSt.crashWhy, 'pos', finalSt.crashPos && finalSt.crashPos.map((v) => v.toFixed(1)).join(','));
console.log('final pos', [finalSt.x, finalSt.y, finalSt.z].map((v) => v.toFixed(1)).join(','), 'yaw rate', finalSt.yawRate.toFixed(2));

const out = path.join(__dirname, '..', 'assets', 'demo', 'helicopter-24.scene');
fs.writeFileSync(out, JSON.stringify(scene), 'utf8');
console.log('wrote', path.relative(process.cwd(), out), (fs.statSync(out).size / 1024).toFixed(1), 'KB, events', events.length);
