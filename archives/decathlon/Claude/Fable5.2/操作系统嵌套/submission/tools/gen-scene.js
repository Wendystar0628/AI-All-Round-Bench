'use strict';
// 生成直升机场景资源（纯数据）：地形、停机坪、建筑、树木、草地、24 号直升机的部件与涂装贴图。
// 产物 tools/out/scene-base.json；飞行记录由 tools/gen-flight.js 实际运行飞行程序后写入最终的 .scene 文件。
const fs = require('fs');
const path = require('path');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const R2 = (v) => Math.round(v * 100) / 100;

// ---------- 地形 ----------
const SIZE = 960, N = 80;
const PADS = [{ name: 'A', x: 0, z: 0, r: 9, h: 0 }, { name: 'B', x: 112, z: -46, r: 9, h: 5.2 }];
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function rawHeight(x, z) {
  let h = 1.5 * Math.sin(x / 38 + 1.3) * Math.cos(z / 31) + 1.0 * Math.sin((x + z) / 23) + 0.6 * Math.sin(x / 11 - z / 14);
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const m = smooth(230, 440, r);
  h += m * (58 + 36 * Math.sin(a * 3 + 1.1) + 22 * Math.sin(a * 7 + 0.4) + 10 * Math.sin(a * 13));
  h += 5.2 * Math.exp(-((x - 112) ** 2 + (z + 46) ** 2) / (2 * 40 * 40));          // 二号坪所在的小丘
  h += 9 * Math.exp(-(((x - 58) ** 2) / (2 * 20 * 20) + ((z - 92) ** 2) / (2 * 38 * 38)));  // 东侧土梁
  h += 6 * Math.exp(-(((x + 120) ** 2) / (2 * 46 * 46) + ((z + 70) ** 2) / (2 * 30 * 30)));
  h -= 2.2 * Math.exp(-((z - 0.35 * x + 62) ** 2) / (2 * 9 * 9)) * smooth(-200, -40, x) * (1 - smooth(60, 160, x)); // 干河沟
  return h;
}
function height(x, z) {
  let h = rawHeight(x, z);
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); const k = 1 - smooth(p.r + 8, p.r + 34, d); h = h * (1 - k) + p.h * k; }
  // 机库与塔台一带压平
  { const d = Math.hypot(x + 46, z - 30); const k = 1 - smooth(26, 52, d); h = h * (1 - k) + 0.2 * k; }
  return h;
}
const heights = [];
for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) heights.push(R2(height(-SIZE / 2 + ix * SIZE / N, -SIZE / 2 + iz * SIZE / N)));
function gridHeight(x, z) {   // 与显示设备、飞行程序相同的双线性取样
  let fx = (x + SIZE / 2) / SIZE * N, fz = (z + SIZE / 2) / SIZE * N;
  fx = Math.max(0, Math.min(N - 0.0001, fx)); fz = Math.max(0, Math.min(N - 0.0001, fz));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, row = N + 1;
  const a = heights[iz * row + ix], b = heights[iz * row + ix + 1], c = heights[(iz + 1) * row + ix], d = heights[(iz + 1) * row + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// ---------- 贴图 ----------
const PURPLE = '#5b2a9d', PURPLE_D = '#3d1c70', YELLOW = '#f7c41f';
const textures = {
  livery: { w: 1024, h: 512, ops: [
    ['fill', PURPLE],
    ['grad', 0, 0, 0, 512, [[0, '#2a2a33'], [0.07, '#3b1d6c'], [0.2, PURPLE], [0.42, '#6a35b3'], [0.5, '#2c1650'], [0.58, '#6a35b3'], [0.8, PURPLE], [0.93, '#3b1d6c'], [1, '#2a2a33']]],
    ['rect', 0, 366, 1024, 16, YELLOW], ['rect', 0, 130, 1024, 16, YELLOW],
    ['poly', [0, 300, 150, 300, 250, 382, 0, 382], YELLOW], ['poly', [0, 212, 150, 212, 250, 130, 0, 130], YELLOW],
    ['poly', [930, 262, 1024, 300, 1024, 212, 930, 250], YELLOW],
    ['rect', 0, 392, 1024, 5, '#ffffff'], ['rect', 0, 115, 1024, 5, '#ffffff'],
    ['text', '24', 470, 322, 104, YELLOW, 0, 900, '#1d0d3a', 10],
    ['text', '24', 470, 190, 104, YELLOW, 180, 900, '#1d0d3a', 10],
    ['text', 'NOS·24', 700, 418, 26, '#ffffff', 0, 700], ['text', 'NOS·24', 700, 94, 26, '#ffffff', 180, 700],
    ['rect', 596, 300, 6, 60, '#1d0d3a'], ['rect', 596, 152, 6, 60, '#1d0d3a'],
    ['noise', 3, 0.05, 4]
  ] },
  fin: { w: 256, h: 256, ops: [['fill', YELLOW], ['rect', 0, 0, 256, 44, PURPLE], ['rect', 0, 212, 256, 44, PURPLE], ['text', '24', 128, 128, 120, PURPLE_D, 0, 900], ['noise', 5, 0.05, 4]] },
  pad: { w: 1024, h: 1024, ops: [['fill', '#4a4d52'], ['noise', 11, 0.07, 2], ['noise', 12, 0.05, 16], ['speckle', 2, 260, 5, '#3c3f44'], ['circle', 512, 512, 448, '#f2c21c', 30], ['circle', 512, 512, 300, '#e8e8e8', 12],
    ['rect', 392, 340, 56, 344, '#f4f4f4'], ['rect', 576, 340, 56, 344, '#f4f4f4'], ['rect', 392, 484, 240, 56, '#f4f4f4'], ['text', 'A', 512, 880, 90, '#f2c21c', 0, 900]] },
  ground: { w: 512, h: 512, repeat: [40, 40], ops: [['fill', '#c8c2a2'], ['noise', 21, 0.1, 2], ['noise', 22, 0.08, 16], ['noise', 23, 0.06, 64], ['speckle', 4, 140, 3, '#a39d7c']] },
  concrete: { w: 256, h: 256, repeat: [2, 2], ops: [['fill', '#b9b3a8'], ['noise', 31, 0.14, 2], ['line', 0, 128, 256, 128, '#8f897e', 2], ['line', 128, 0, 128, 256, '#8f897e', 2]] },
  metal: { w: 256, h: 256, repeat: [4, 1], ops: [['fill', '#8d99a6'], ['noise', 41, 0.1, 2], ['rect', 0, 0, 6, 256, '#6e7a86'], ['rect', 64, 0, 4, 256, '#76828e'], ['rect', 128, 0, 6, 256, '#6e7a86'], ['rect', 192, 0, 4, 256, '#76828e']] },
  stripe: { w: 128, h: 128, repeat: [3, 1], ops: [['fill', '#f2f2f2'], ['poly', [0, 0, 64, 0, 0, 128], '#d8322c'], ['poly', [64, 128, 128, 128, 128, 0], '#d8322c']] }
};
const materials = {
  body: { color: '#ffffff', map: 'livery', rough: 0.34, metal: 0.25 },
  purple: { color: PURPLE, rough: 0.36, metal: 0.25 }, purpleDark: { color: PURPLE_D, rough: 0.5, metal: 0.2 },
  yellow: { color: YELLOW, rough: 0.4, metal: 0.1 }, fin: { color: '#ffffff', map: 'fin', rough: 0.4, metal: 0.1, double: true },
  glass: { color: '#10141f', rough: 0.06, metal: 0.92, opacity: 0.86 },
  blade: { color: '#1b1c21', rough: 0.55, metal: 0.3 }, bladeTip: { color: YELLOW, rough: 0.5 },
  steel: { color: '#aab3bd', rough: 0.28, metal: 0.9 }, darkSteel: { color: '#3b4048', rough: 0.45, metal: 0.8 },
  rubber: { color: '#16171a', rough: 0.9 },
  navRed: { color: '#ff3030', emissive: '#ff2020', glow: 3 }, navGreen: { color: '#30ff60', emissive: '#20ff50', glow: 3 }, navWhite: { color: '#ffffff', emissive: '#ffffff', glow: 2.5 },
  ground: { color: '#ffffff', map: 'ground', rough: 0.96 }, pad: { color: '#ffffff', map: 'pad', rough: 0.82 },
  concrete: { color: '#ffffff', map: 'concrete', rough: 0.88 }, hangar: { color: '#ffffff', map: 'metal', rough: 0.5, metal: 0.55 },
  roof: { color: '#58606b', rough: 0.45, metal: 0.6 }, window: { color: '#182434', rough: 0.08, metal: 0.9, emissive: '#ffb45a', glow: 0.5 },
  bark: { color: '#4a3524', rough: 0.95 }, leaf: { color: '#3f6b3a', rough: 0.9, flat: true }, leaf2: { color: '#6a7f33', rough: 0.9, flat: true },
  rock: { color: '#7f786d', rough: 0.95, flat: true }, tank: { color: '#d9dde2', rough: 0.3, metal: 0.7 }, stripe: { color: '#ffffff', map: 'stripe', rough: 0.6 },
  crateA: { color: '#2f6f8f', rough: 0.6, metal: 0.4 }, crateB: { color: '#b0522f', rough: 0.6, metal: 0.4 }, sock: { color: '#ff7a1a', rough: 0.8, double: true },
  lamp: { color: '#fff3c4', emissive: '#ffd27a', glow: 1.6 }
};

// ---------- 场景物体 ----------
const objects = [];
for (const p of PADS) {
  objects.push({ name: '停机坪 ' + p.name, pos: [p.x, p.h, p.z], shapes: [{ type: 'cyl', r: p.r, h: 0.3, seg: 48, pos: [0, 0.15, 0], material: 'pad' }, { type: 'cyl', r: p.r + 0.5, h: 0.2, seg: 48, pos: [0, 0.05, 0], material: 'concrete' }], solid: { type: 'cyl', r: p.r, top: p.h + 0.3 }, shadow: false });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; objects.push({ name: '坪灯', pos: [p.x + Math.cos(a) * (p.r + 0.2), p.h + 0.32, p.z + Math.sin(a) * (p.r + 0.2)], shapes: [{ type: 'cyl', r: 0.09, h: 0.16, seg: 8, material: 'lamp', noShadow: true }], shadow: false }); }
}
const g0 = (x, z) => gridHeight(x, z);
// 机库
objects.push({ name: '机库', pos: [-52, g0(-52, 34), 34], rot: [0, 18, 0], shapes: [
  { type: 'box', size: [26, 8.5, 18], pos: [0, 4.25, 0], material: 'hangar' },
  { type: 'cyl', r: 9.6, h: 26.2, seg: 28, axis: 'x', scale: [1, 0.42, 1], pos: [0, 8.4, 0], material: 'roof' },
  { type: 'box', size: [0.3, 6.4, 12], pos: [13.1, 3.2, 0], material: 'purpleDark' },
  { type: 'box', size: [26.4, 0.5, 18.4], pos: [0, 0.25, 0], material: 'concrete' }],
  solid: { type: 'box', size: [26, 12, 18] } });
// 塔台
objects.push({ name: '塔台', pos: [-30, g0(-30, 12), 12], shapes: [
  { type: 'box', size: [4.6, 15, 4.6], pos: [0, 7.5, 0], material: 'concrete' },
  { type: 'cyl', r: 4.6, r2: 5.4, h: 3.2, seg: 8, pos: [0, 16.6, 0], material: 'window' },
  { type: 'cyl', r: 5.8, h: 0.5, seg: 8, pos: [0, 18.4, 0], material: 'roof' },
  { type: 'cyl', r: 0.08, h: 5, pos: [0, 21, 0], material: 'steel' }, { type: 'sphere', r: 0.22, pos: [0, 23.5, 0], material: 'navRed' }],
  solid: { type: 'box', size: [9, 19, 9] } });
// 油罐与集装箱
objects.push({ name: '油罐', pos: [-74, g0(-74, 8), 8], shapes: [{ type: 'cyl', r: 3.4, h: 7, seg: 24, pos: [0, 3.5, 0], material: 'tank' }, { type: 'cyl', r: 3.5, h: 0.5, seg: 24, pos: [0, 5.2, 0], material: 'stripe' }, { type: 'sphere', r: 3.4, scale: [1, 0.3, 1], pos: [0, 7, 0], material: 'tank' }], solid: { type: 'box', size: [6.8, 8, 6.8] } });
objects.push({ name: '油罐', pos: [-83, g0(-83, 14), 14], shapes: [{ type: 'cyl', r: 3.4, h: 7, seg: 24, pos: [0, 3.5, 0], material: 'tank' }, { type: 'cyl', r: 3.5, h: 0.5, seg: 24, pos: [0, 5.2, 0], material: 'stripe' }, { type: 'sphere', r: 3.4, scale: [1, 0.3, 1], pos: [0, 7, 0], material: 'tank' }], solid: { type: 'box', size: [6.8, 8, 6.8] } });
const crates = [[38, 30, 12, 'crateA'], [41, 36, -20, 'crateB'], [36, 33.2, 40, 'crateA'], [70, -78, 8, 'crateB'], [64, -74, 60, 'crateA'], [150, -20, 30, 'crateB'], [58, 22, 76, 'crateA']];
for (const [x, z, ry, m] of crates) objects.push({ name: '集装箱', pos: [x, g0(x, z), z], rot: [0, ry, 0], shapes: [{ type: 'box', size: [6.1, 2.6, 2.44], pos: [0, 1.3, 0], material: m }, { type: 'box', size: [6.2, 0.12, 2.5], pos: [0, 2.62, 0], material: 'darkSteel' }], solid: { type: 'box', size: [6.1, 2.7, 2.6] } });
objects.push({ name: '集装箱', pos: [38.6, g0(38, 30) + 2.62, 30.6], rot: [0, 24, 0], shapes: [{ type: 'box', size: [6.1, 2.6, 2.44], pos: [0, 1.3, 0], material: 'crateB' }], solid: { type: 'box', size: [6.1, 5.4, 2.6] } });
// 风向袋
objects.push({ name: '风向袋', pos: [16, g0(16, -18), -18], shapes: [{ type: 'cyl', r: 0.07, h: 6, pos: [0, 3, 0], material: 'steel' }, { type: 'cone', r: 0.42, h: 2.2, axis: 'x', pos: [1.15, 5.8, 0], material: 'sock' }] });
// 灯杆
for (const [x, z] of [[-18, -22], [22, 20], [96, -64], [128, -30]]) objects.push({ name: '灯杆', pos: [x, g0(x, z), z], shapes: [{ type: 'cyl', r: 0.09, h: 7, pos: [0, 3.5, 0], material: 'darkSteel' }, { type: 'box', size: [0.9, 0.18, 0.4], pos: [0.3, 7, 0], material: 'darkSteel' }, { type: 'sphere', r: 0.2, pos: [0.5, 6.86, 0], material: 'lamp', noShadow: true }], solid: { type: 'box', size: [0.5, 7.2, 0.5] } });
// 树木（实例）与石块
const r = rng(2024);
const trees = [], trees2 = [], rocks = [];
function freeSpot(x, z, clear) {
  for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < p.r + clear) return false;
  if (Math.hypot(x + 46, z - 28) < 46) return false;
  if (Math.abs(z - (-0.41 * x)) < 16 && x > -20 && x < 135) return false;      // 两坪之间的航线走廊
  return true;
}
let guard = 0;
while (trees.length + trees2.length < 170 && guard++ < 5000) {
  const a = r() * Math.PI * 2, d = 34 + Math.pow(r(), 0.7) * 300, x = Math.cos(a) * d + 40, z = Math.sin(a) * d - 10;
  if (!freeSpot(x, z, 26)) continue;
  const s = 0.8 + r() * 0.9;
  (r() < 0.62 ? trees : trees2).push([R2(x), R2(z), R2(s), Math.round(r() * 360)]);
}
// 航线附近特意留几棵树：飞得太低会碰到
trees.push([62, -3, 1.5, 40], [70, -52, 1.4, 10], [142, -70, 1.3, 90], [26, 34, 1.2, 0]);
while (rocks.length < 60) { const x = (r() - 0.5) * 520 + 40, z = (r() - 0.5) * 520; if (!freeSpot(x, z, 14)) continue; rocks.push([R2(x), R2(z), R2(0.5 + r() * 1.6), Math.round(r() * 360)]); }
objects.push({ name: '松树', instances: trees, shapes: [{ type: 'cyl', r: 0.32, r2: 0.2, h: 3.2, seg: 7, pos: [0, 1.6, 0], material: 'bark' }, { type: 'cone', r: 2.3, h: 4.2, seg: 8, pos: [0, 4.2, 0], material: 'leaf' }, { type: 'cone', r: 1.7, h: 3.6, seg: 8, pos: [0, 6.3, 0], material: 'leaf' }, { type: 'cone', r: 1.0, h: 2.6, seg: 8, pos: [0, 8.2, 0], material: 'leaf' }], solid: { type: 'cyl', r: 1.5, h: 9 } });
objects.push({ name: '阔叶树', instances: trees2, shapes: [{ type: 'cyl', r: 0.36, r2: 0.24, h: 3.6, seg: 7, pos: [0, 1.8, 0], material: 'bark' }, { type: 'sphere', r: 2.6, seg: 8, scale: [1, 0.86, 1], pos: [0, 5.2, 0], material: 'leaf2' }, { type: 'sphere', r: 1.8, seg: 7, pos: [1.2, 6.2, 0.6], material: 'leaf2' }], solid: { type: 'cyl', r: 1.8, h: 8 } });
objects.push({ name: '石块', instances: rocks, shapes: [{ type: 'sphere', r: 0.9, seg: 6, scale: [1.3, 0.7, 1], pos: [0, 0.3, 0], material: 'rock' }] });

// ---------- 24 号直升机 ----------
const fus = [
  { x: -3.1, cy: 0.62, w: 0.30, h: 0.34, e: 2.2 }, { x: -2.5, cy: 0.5, w: 0.56, hu: 0.6, hd: 0.52, e: 2.3 }, { x: -1.7, cy: 0.3, w: 0.92, hu: 0.98, hd: 0.9, e: 2.5 },
  { x: -0.7, cy: 0.2, w: 1.1, hu: 1.16, hd: 1.08, e: 2.7 }, { x: 0.5, cy: 0.18, w: 1.13, hu: 1.17, hd: 1.1, e: 2.7 }, { x: 1.5, cy: 0.1, w: 1.06, hu: 1.02, hd: 1.02, e: 2.6 },
  { x: 2.3, cy: -0.04, w: 0.88, hu: 0.78, hd: 0.84, e: 2.4 }, { x: 2.9, cy: -0.18, w: 0.56, hu: 0.5, hd: 0.52, e: 2.2 }, { x: 3.25, cy: -0.26, w: 0.24, h: 0.22, e: 2 }, { x: 3.36, cy: -0.28, w: 0.04, h: 0.04, e: 2 }
];
const glassSecs = fus.filter(s => s.x >= 0.5).map(s => ({ x: s.x, cy: s.cy, w: s.w * 1.012 + 0.012, hu: (s.hu != null ? s.hu : s.h) * 1.012 + 0.012, hd: (s.hd != null ? s.hd : s.h) * 0.4, e: s.e }));
const blade = (ang) => ({ rot: [0, ang, 0] });
const parts = [
  { name: '机身', pos: [0, 0, 0], shapes: [{ type: 'loft', sections: fus, seg: 40, material: 'body' },
      { type: 'box', size: [1.5, 0.12, 0.5], pos: [0.4, -0.96, 0], material: 'purpleDark' }],
    col: { c: [0.1, 0.15, 0], h: [3.2, 1.2, 1.15] }, mass: 1 },
  { name: '座舱玻璃', parent: '机身', pos: [0, 0, 0], shapes: [{ type: 'loft', sections: glassSecs, seg: 40, arc: [0.2, 0.8], cap: false, material: 'glass' }], col: { c: [1.9, 0.5, 0], h: [1.4, 0.6, 1.0] } },
  { name: '发动机罩', parent: '机身', pos: [-0.75, 1.3, 0], shapes: [
      { type: 'loft', sections: [{ x: -1.6, cy: 0, w: 0.3, h: 0.22, e: 2.4 }, { x: -1.0, cy: 0.08, w: 0.6, h: 0.42, e: 2.6 }, { x: 0.2, cy: 0.12, w: 0.66, h: 0.48, e: 2.6 }, { x: 1.0, cy: 0.04, w: 0.5, h: 0.34, e: 2.4 }, { x: 1.5, cy: -0.1, w: 0.2, h: 0.14, e: 2 }], seg: 24, material: 'purpleDark' },
      { type: 'cyl', r: 0.13, h: 0.7, axis: 'x', pos: [-1.7, 0.02, 0.26], material: 'darkSteel' }, { type: 'cyl', r: 0.13, h: 0.7, axis: 'x', pos: [-1.7, 0.02, -0.26], material: 'darkSteel' },
      { type: 'box', size: [0.5, 0.2, 0.06], pos: [0.5, 0.2, 0.67], material: 'darkSteel' }, { type: 'box', size: [0.5, 0.2, 0.06], pos: [0.5, 0.2, -0.67], material: 'darkSteel' }],
    col: { c: [0, 0.1, 0], h: [1.5, 0.45, 0.6] } },
  { name: '尾梁', parent: '机身', pos: [0, 0, 0], shapes: [
      { type: 'loft', sections: [{ x: -7.75, cy: 1.04, w: 0.13, h: 0.15, e: 2 }, { x: -6.6, cy: 0.98, w: 0.17, h: 0.2, e: 2 }, { x: -4.6, cy: 0.82, w: 0.25, h: 0.28, e: 2.1 }, { x: -2.9, cy: 0.64, w: 0.34, h: 0.38, e: 2.2 }], seg: 20, material: 'purple' },
      { type: 'cyl', r: 0.262, h: 0.32, axis: 'x', pos: [-4.4, 0.8, 0], material: 'yellow' }, { type: 'cyl', r: 0.215, h: 0.26, axis: 'x', pos: [-5.9, 0.93, 0], material: 'yellow' }],
    col: { c: [-5.3, 0.84, 0], h: [2.5, 0.3, 0.3] } },
  { name: '垂尾', parent: '尾梁', pos: [-7.3, 1.0, 0], shapes: [
      { type: 'plate', poly: [[-0.75, 1.75], [-0.28, 1.75], [0.62, 0.1], [0.5, -0.5], [0.1, -0.78], [-0.28, -0.72], [-0.35, 0.1]], t: 0.09, material: 'fin' },
      { type: 'sphere', r: 0.07, pos: [-0.5, 1.78, 0], material: 'navWhite', noShadow: true }],
    col: { c: [-0.1, 0.5, 0], h: [0.6, 1.25, 0.08] } },
  { name: '平尾', parent: '尾梁', pos: [-6.2, 0.98, 0], shapes: [
      { type: 'box', size: [0.72, 0.06, 2.5], pos: [0, 0, 0], material: 'purple' }, { type: 'box', size: [0.6, 0.5, 0.05], pos: [0, 0.1, 1.25], material: 'yellow' }, { type: 'box', size: [0.6, 0.5, 0.05], pos: [0, 0.1, -1.25], material: 'yellow' }],
    col: { c: [0, 0, 0], h: [0.4, 0.3, 1.3] } },
  { name: '主旋翼', parent: '机身', pos: [0.05, 2.05, 0], shapes: [
      { type: 'cyl', r: 0.11, h: 0.75, pos: [0, -0.3, 0], material: 'steel' }, { type: 'cyl', r: 0.3, h: 0.16, seg: 16, pos: [0, 0.06, 0], material: 'darkSteel' }, { type: 'cyl', r: 0.17, r2: 0.05, h: 0.22, pos: [0, 0.24, 0], material: 'yellow' }],
    blur: { r: 5.75, axis: 'y', color: '#16171c', pos: [0, 0.07, 0] }, rotor: true, col: { c: [0, 0, 0], h: [0.5, 0.3, 0.5] } },
  { name: '尾桨', parent: '尾梁', pos: [-7.55, 1.72, 0.3], shapes: [
      { type: 'cyl', r: 0.07, h: 0.28, axis: 'z', pos: [0, 0, -0.1], material: 'steel' }, { type: 'box', size: [0.15, 2.05, 0.035], pos: [0, 0, 0.05], material: 'blade' },
      { type: 'box', size: [0.15, 0.2, 0.04], pos: [0, 0.95, 0.05], material: 'bladeTip' }, { type: 'box', size: [0.15, 0.2, 0.04], pos: [0, -0.95, 0.05], material: 'bladeTip' }],
    blur: { r: 1.06, axis: 'z', color: '#16171c', pos: [0, 0, 0.05] }, rotor: true, col: { c: [0, 0, 0], h: [0.2, 1.0, 0.1] } },
  { name: '左滑橇', parent: '机身', pos: [0, 0, -1.12], shapes: [
      { type: 'tube', path: [[-1.9, -1.42, 0], [-1.5, -1.5, 0], [1.6, -1.5, 0], [2.1, -1.42, 0], [2.35, -1.2, 0]], r: 0.055, material: 'steel' },
      { type: 'tube', path: [[1.2, -0.8, 0.5], [1.25, -1.2, 0.12], [1.25, -1.5, 0]], r: 0.045, steps: 8, material: 'darkSteel' }, { type: 'tube', path: [[-0.9, -0.8, 0.5], [-0.95, -1.2, 0.12], [-0.95, -1.5, 0]], r: 0.045, steps: 8, material: 'darkSteel' }],
    col: { c: [0.2, -1.4, 0], h: [2.2, 0.15, 0.12] } },
  { name: '右滑橇', parent: '机身', pos: [0, 0, 1.12], shapes: [
      { type: 'tube', path: [[-1.9, -1.42, 0], [-1.5, -1.5, 0], [1.6, -1.5, 0], [2.1, -1.42, 0], [2.35, -1.2, 0]], r: 0.055, material: 'steel' },
      { type: 'tube', path: [[1.2, -0.8, -0.5], [1.25, -1.2, -0.12], [1.25, -1.5, 0]], r: 0.045, steps: 8, material: 'darkSteel' }, { type: 'tube', path: [[-0.9, -0.8, -0.5], [-0.95, -1.2, -0.12], [-0.95, -1.5, 0]], r: 0.045, steps: 8, material: 'darkSteel' }],
    col: { c: [0.2, -1.4, 0], h: [2.2, 0.15, 0.12] } },
  { name: '航行灯', parent: '机身', pos: [0, 0, 0], shapes: [{ type: 'sphere', r: 0.07, pos: [0.6, 0.2, -1.15], material: 'navRed', noShadow: true }, { type: 'sphere', r: 0.07, pos: [0.6, 0.2, 1.15], material: 'navGreen', noShadow: true }, { type: 'sphere', r: 0.09, pos: [0.3, -0.98, 0], material: 'navRed', noShadow: true }] }
];
for (let i = 0; i < 4; i++) {
  parts.push({ name: '桨叶 ' + (i + 1), parent: '主旋翼', pos: [0, 0.07, 0], rot: [0, i * 90, 0], shapes: [
    { type: 'box', size: [5.0, 0.045, 0.34], pos: [3.05, 0, 0], rot: [5, 0, 0], material: 'blade' }, { type: 'box', size: [0.5, 0.05, 0.345], pos: [5.45, 0, 0], rot: [5, 0, 0], material: 'bladeTip' }, { type: 'box', size: [0.6, 0.07, 0.16], pos: [0.45, 0, 0], material: 'darkSteel' }],
    blade: true, col: { c: [3.0, 0, 0], h: [2.7, 0.05, 0.18] } });
}
const vehicle = {
  name: '24 号直升机', parts,
  rotor: { part: '主旋翼', radius: 5.7, hub: [0.05, 2.12, 0], blades: ['桨叶 1', '桨叶 2', '桨叶 3', '桨叶 4'] },
  tailRotor: { part: '尾桨', pos: [-7.55, 1.72, 0.3] },
  // 物理参数（飞行程序使用）：质量、转动惯量（滚转/偏航/俯仰）、接触点
  phys: { mass: 2200, inertia: [2400, 7600, 6800], cgToSkid: 1.56,
    contacts: [
      { part: '右滑橇', p: [1.9, -1.56, 1.12], kind: 'skid' }, { part: '右滑橇', p: [-1.6, -1.56, 1.12], kind: 'skid' }, { part: '左滑橇', p: [1.9, -1.56, -1.12], kind: 'skid' }, { part: '左滑橇', p: [-1.6, -1.56, -1.12], kind: 'skid' },
      { part: '机身', p: [3.3, -0.25, 0], kind: 'body' }, { part: '机身', p: [0.2, -0.95, 0], kind: 'body' }, { part: '机身', p: [0.5, 0.3, 1.13], kind: 'body' }, { part: '机身', p: [0.5, 0.3, -1.13], kind: 'body' }, { part: '座舱玻璃', p: [2.0, 0.9, 0], kind: 'body' }, { part: '发动机罩', p: [-0.8, 1.75, 0], kind: 'body' },
      { part: '尾梁', p: [-5.0, 0.6, 0], kind: 'tail' }, { part: '垂尾', p: [-7.7, 0.2, 0], kind: 'tail' }, { part: '垂尾', p: [-7.9, 2.7, 0], kind: 'tail' }, { part: '尾桨', p: [-7.55, 1.72, 0.45], kind: 'tailrotor' },
      { part: '桨叶 1', p: [5.75, 2.14, 0], kind: 'rotor' }, { part: '桨叶 2', p: [0.05, 2.14, 5.7], kind: 'rotor' }, { part: '桨叶 3', p: [-5.65, 2.14, 0], kind: 'rotor' }, { part: '桨叶 4', p: [0.05, 2.14, -5.7], kind: 'rotor' }
    ] }
};

const scene = {
  format: 'nos-scene', version: 1, name: '24 号直升机 · 黄昏试飞场',
  about: '场景资源是纯数据：几何与部件层级、材质与贴图、灯光、镜头，以及飞行记录形式的时序。修改后重新打开即可看到变化。',
  env: { time: '黄昏 18:20', weather: '晴，低空薄雾，西南风 2 米/秒', sky: { top: '#2a3c78', horizon: '#f6b47c', bottom: '#8d7460', sun: [-0.78, 0.24, 0.57], sunColor: '#ffe6b0' }, fog: { color: '#e2b08c', density: 0.0019 }, wind: [1.6, -1.2] },
  lights: [{ type: 'sun', dir: [-0.78, 0.3, 0.57], color: '#ffc98e', intensity: 3.3, shadow: true, range: 44 }, { type: 'hemi', sky: '#a9bdf0', ground: '#6b5846', intensity: 0.82 }],
  cameras: { default: { p: [15, 4.2, 13], look: [0, 1.6, 0], fov: 40 }, follow: { dist: 21, height: 5.5, fov: 42 }, orbit: { dist: 24, yaw: 38, pitch: 12, fov: 42 } },
  textures, materials,
  terrain: { size: SIZE, n: N, heights, material: 'ground', colors: [[-3, '#6f7a44'], [1, '#7f8a4c'], [8, '#8f8a52'], [30, '#8f8060'], [70, '#8c7f74'], [120, '#a39a94']] },
  grass: { center: [52, -20], radius: 135, count: 90000, seed: 7, height: 0.5, width: 0.05, color: '#6f8a3c', color2: '#a8a455', exclude: PADS.map(p => [p.x, p.z, p.r + 0.6]).concat([[-46, 28, 34]]) },
  pads: PADS.map(p => ({ name: p.name, pos: [p.x, p.h + 0.3, p.z], r: p.r })),
  objects, vehicle,
  timeline: { duration: 15, fps: 30 }
};
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'scene-base.json'), JSON.stringify(scene));
console.log('scene-base.json', JSON.stringify(scene).length, 'bytes; trees', trees.length + trees2.length, 'objects', objects.length);

// 最小场景：一个物体、一盏灯、一台相机（操作说明里的例子）
const minimal = {
  format: 'nos-scene', version: 1, name: '最小场景',
  env: { sky: { top: '#1d2a4d', horizon: '#9db7e8', bottom: '#555', sun: [0.4, 0.6, 0.5] } },
  lights: [{ type: 'sun', dir: [0.4, 0.8, 0.5], color: '#ffffff', intensity: 2.5 }],
  cameras: { default: { p: [6, 4, 8], look: [0, 1, 0], fov: 40 } },
  materials: { paint: { color: '#f7c41f', rough: 0.4 }, floor: { color: '#5b2a9d', rough: 0.8 } },
  objects: [{ name: '地板', pos: [0, 0, 0], shapes: [{ type: 'box', size: [12, 0.2, 12], pos: [0, -0.1, 0], material: 'floor' }] }],
  vehicle: { name: '方块', parts: [{ name: '方块', pos: [0, 1.2, 0], shapes: [{ type: 'box', size: [2, 2, 2], material: 'paint' }], col: { c: [0, 0, 0], h: [1, 1, 1] } }] },
  timeline: { duration: 6, fps: 30, tracks: [{ part: '方块', prop: 'rot', keys: [[0, 0, 0, 0], [3, 0, 180, 30], [6, 0, 360, 0]] }, { part: '方块', prop: 'pos', keys: [[0, 0, 1.2, 0], [3, 0, 2.4, 0], [6, 0, 1.2, 0]] }] }
};
fs.writeFileSync(path.join(__dirname, '..', 'guest', 'Demo', 'minimal.scene'), JSON.stringify(minimal, null, 1));
