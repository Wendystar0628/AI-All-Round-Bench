// 生成默认场景资源 ns/Demo/helicopter-24.scene（场景是数据：几何图元、材质、贴图描述、地形高度场、障碍、部件层级、镜头）
// 用法：node tools/gen-scene.mjs   （飞行记录由 tools/bake-record.mjs 另行烘焙写入 flight.record）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// ---------------- 地形 ----------------
const SIZE = [260, 260], RES = [66, 66];
const pads = [{ name: 'A', pos: [-48, 26], r: 7.5, h: 0.3, ring: '#ffc83d', color: '#4a4660' }, { name: 'B', pos: [34, -36], r: 7.5, h: 0.3, ring: '#ffc83d', color: '#463f66' }];
function baseH(x, z) {
  let h = 5 * Math.sin(x / 33 + 1.3) * Math.cos(z / 29) + 2.8 * Math.sin(x / 14) * Math.sin(z / 18 + 2) + 1.2 * Math.sin(x / 7 + z / 9);
  h += 26 * Math.exp(-((x - 88) ** 2 + (z + 70) ** 2) / 2200);
  h += 14 * Math.exp(-((x + 95) ** 2 + (z + 80) ** 2) / 1800);
  h += 3.5 * Math.exp(-((x - 34) ** 2 + (z + 36) ** 2) / 900); // 第二停机坪所在的小台地
  return h;
}
const padBase = pads.map((p) => baseH(p.pos[0], p.pos[1]));
function height(x, z) {
  let h = baseH(x, z);
  pads.forEach((p, i) => { const d = Math.hypot(x - p.pos[0], z - p.pos[1]); const t = Math.max(0, Math.min(1, (d - p.r - 1) / 14)); const k = t * t * (3 - 2 * t); h = padBase[i] * (1 - k) + h * k; });
  return h;
}
const heights = []; for (let j = 0; j < RES[1]; j++) for (let i = 0; i < RES[0]; i++) { const x = (i / (RES[0] - 1) - 0.5) * SIZE[0], z = (j / (RES[1] - 1) - 0.5) * SIZE[1]; heights.push(round(height(x, z), 2)); }
pads.forEach((p, i) => { p.base = round(padBase[i], 2); });

// ---------------- 障碍 ----------------
const obstacles = [
  { type: 'box', name: '机库', pos: [-74, 34], size: [17, 7.5, 10], rotY: 12, mat: 'building', roof: 'roof' },
  { type: 'box', name: '塔楼', pos: [6, 8], size: [6, 17, 6], rotY: 0, mat: 'tower', roof: 'roof' },
  { type: 'box', name: '住宅', pos: [58, -6], size: [10, 5.5, 8], rotY: -20, mat: 'building', roof: 'roof' },
  { type: 'box', name: '仓库', pos: [-22, -44], size: [15, 6.5, 9], rotY: 5, mat: 'building', roof: 'roof' },
  { type: 'box', name: '信号站', pos: [62, -48], size: [4, 11, 4], rotY: 30, mat: 'tower', roof: 'roof' },
];
const treeSpots = [];
for (let i = 0; i < 400 && treeSpots.length < 90; i++) {
  const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
  if (pads.some((p) => Math.hypot(x - p.pos[0], z - p.pos[1]) < p.r + 9)) continue;
  if (obstacles.some((o) => Math.abs(x - o.pos[0]) < o.size[0] / 2 + 6 && Math.abs(z - o.pos[1]) < o.size[2] / 2 + 6)) continue;
  if (treeSpots.some((t) => Math.hypot(x - t[0], z - t[1]) < 5)) continue;
  if (Math.abs(z + 8) < 12 && x > -40 && x < 40) continue; // 留出飞行通道
  treeSpots.push([x, z]);
}
for (const [x, z] of treeSpots) obstacles.push({ type: 'tree', pos: [round(x, 1), round(z, 1)], h: round(6.5 + rnd() * 5, 1), r: 0.45, crown: round(2 + rnd() * 1.4, 2) });

// ---------------- 直升机：部件（单位：米；机头朝 +Z，机顶朝 +Y）----------------
const prof = [[0.08, -2.7], [0.5, -2.45], [0.9, -1.8], [1.2, -0.9], [1.38, 0.1], [1.4, 0.9], [1.28, 1.7], [1.0, 2.4], [0.58, 2.9], [0.12, 3.2]];
const radiusAt = (y) => { for (let i = 0; i < prof.length - 1; i++) { const a = prof[i], b = prof[i + 1]; if (y >= a[1] && y <= b[1]) { const t = (y - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; } } return 0.1; };
const sub = (y0, y1, n, off) => { const p = []; for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n; p.push([round(radiusAt(y) + off, 3), round(y, 3)]); } return p; };

const geoms = {
  cabin: { type: 'lathe', profile: prof, seg: 40 },
  belt: { type: 'lathe', profile: sub(0.25, 0.7, 6, 0.012), seg: 40 },
  canopy: { type: 'lathe', profile: sub(0.55, 3.1, 14, 0.022), seg: 28, phiStart: Math.PI / 2, phiLength: Math.PI },
  decalR: { type: 'lathe', profile: sub(-1.9, 0.0, 10, 0.014), seg: 12, phiStart: Math.PI / 2 - 0.46, phiLength: 0.92 },
  decalL: { type: 'lathe', profile: sub(-1.9, 0.0, 10, 0.014), seg: 12, phiStart: Math.PI * 1.5 - 0.46, phiLength: 0.92 },
  boom: { type: 'cylinder', rt: 0.11, rb: 0.42, h: 4.7, seg: 16 },
  fin: { type: 'box', size: [0.13, 2.1, 1.15] },
  finTip: { type: 'box', size: [0.14, 0.55, 0.9] },
  stab: { type: 'box', size: [2.6, 0.08, 0.7] },
  skid: { type: 'cylinder', r: 0.065, h: 3.8, seg: 10 },
  strut: { type: 'box', size: [0.07, 1.05, 0.07] },
  cowl: { type: 'box', size: [1.6, 0.62, 1.9] },
  exhaust: { type: 'cylinder', r: 0.17, h: 0.7, seg: 10 },
  mast: { type: 'cylinder', r: 0.15, h: 0.95, seg: 10 },
  hub: { type: 'cylinder', r: 0.32, h: 0.22, seg: 14 },
  blade: { type: 'box', size: [4.3, 0.05, 0.38] },
  bladeTip: { type: 'box', size: [0.8, 0.052, 0.385] },
  tblade: { type: 'box', size: [0.05, 1.7, 0.2] },
  blur: { type: 'circle', r: 5.2, seg: 48 },
  tblur: { type: 'circle', r: 0.95, seg: 24 },
  shard: { type: 'box', size: [1.2, 0.08, 0.8] },
  chunk: { type: 'box', size: [0.7, 0.5, 0.9] },
  grassTuft: { type: 'cone', r: 0.075, h: 0.7, seg: 4 },
};
const materials = {
  grass: { color: '#ffffff', roughness: 0.96, vertexColors: true, map: 'grassTex' },
  pad: { color: '#4a4660', roughness: 0.9 },
  bark: { color: '#4a3326', roughness: 0.95 }, leaf: { color: '#2d6a3f', roughness: 0.88 }, leaf2: { color: '#3d8248', roughness: 0.86 },
  building: { color: '#d8cfe8', roughness: 0.78, map: 'facade' }, tower: { color: '#c9c0dc', roughness: 0.6, metalness: 0.15, map: 'facadeTall' }, roof: { color: '#3a3050', roughness: 0.7 },
  grassBlade: { color: '#6cbf55', roughness: 0.9, side: 'double' },
  body: { color: '#6b2fd6', metalness: 0.55, roughness: 0.26 }, body2: { color: '#4a1fa0', metalness: 0.45, roughness: 0.34 },
  yellow: { color: '#ffcc1a', metalness: 0.3, roughness: 0.34 }, glass: { color: '#1b2a58', metalness: 0.9, roughness: 0.06, opacity: 0.62 },
  dark: { color: '#25232e', metalness: 0.75, roughness: 0.42 }, bladeMat: { color: '#2b2a35', metalness: 0.5, roughness: 0.46 },
  decalR: { color: '#ffffff', map: 'decal24R', roughness: 0.3, metalness: 0.2, opacity: 0.99, alphaTest: 0.05, polygonOffset: true },
  decalL: { color: '#ffffff', map: 'decal24L', roughness: 0.3, metalness: 0.2, opacity: 0.99, alphaTest: 0.05, polygonOffset: true },
  blur: { color: '#cfc8ff', roughness: 1, opacity: 0.0 },
};
const textures = {
  grassTex: { type: 'noise', base: '#5a9a45', variation: 0.5, dots: 9000, grain: 3, seed: 3, repeat: [26, 26], size: 256 },
  facade: { type: 'windows', base: '#6a5f8a', cols: 5, rows: 3, lit: 0.45, seed: 4, size: 256 },
  facadeTall: { type: 'windows', base: '#58507a', cols: 3, rows: 9, lit: 0.4, seed: 8, size: 256 },
  decal24R: { type: 'text', text: '24', w: 512, h: 256, rot: 90, flipX: false, fill: '#ffd21f', stroke: '#2a0a52', strokeW: 14, font: '900 150px "Arial Black", Impact, sans-serif' },
  decal24L: { type: 'text', text: '24', w: 512, h: 256, rot: -90, flipX: false, fill: '#ffd21f', stroke: '#2a0a52', strokeW: 14, font: '900 150px "Arial Black", Impact, sans-serif' },
};

const P = []; // parts
const part = (o) => { P.push(o); return o; };
part({ name: 'fuselage', pos: [0, 0, 0] });
const body = (name, geom, mat, pos, rot, extra) => part({ name, parent: 'fuselage', geom, mat, pos, rot, ...extra });
body('cabin', 'cabin', 'body', [0, 0, 0], [90, 0, 0]);
body('belt', 'belt', 'yellow', [0, 0, 0], [90, 0, 0]);
body('canopy', 'canopy', 'glass', [0, 0, 0], [90, 0, 0], { shadow: false });
body('decalR', 'decalR', 'decalR', [0, 0, 0], [90, 0, 0], { shadow: false });
body('decalL', 'decalL', 'decalL', [0, 0, 0], [90, 0, 0], { shadow: false });
body('tailBoom', 'boom', 'body2', [0, 0.42, -4.75], [-90, 0, 0]);
body('fin', 'fin', 'body', [0, 1.45, -6.75], [-14, 0, 0]);
body('finTip', 'finTip', 'yellow', [0, 2.55, -6.98], [-14, 0, 0]);
body('stabR', 'stab', 'body2', [0, 0.5, -6.0], [0, 0, 0]);
body('cowl', 'cowl', 'body2', [0, 1.5, -0.55], [0, 0, 0]);
body('exhaust', 'exhaust', 'dark', [0.45, 1.5, -1.65], [90, 0, 0]);
body('skidL', 'skid', 'dark', [1.18, -1.38, 0.2], [90, 0, 0]);
body('skidR', 'skid', 'dark', [-1.18, -1.38, 0.2], [90, 0, 0]);
for (const [n, x, z] of [['strutLF', 1.1, 1.0], ['strutLB', 1.1, -0.8], ['strutRF', -1.1, 1.0], ['strutRB', -1.1, -0.8]]) body(n, 'strut', 'dark', [x, -0.86, z], [0, 0, x > 0 ? -12 : 12]);
body('mast', 'mast', 'dark', [0, 2.0, 0], [0, 0, 0]);
body('hub', 'hub', 'dark', [0, 2.5, 0], [0, 0, 0]);
part({ name: 'mainRotor', parent: 'fuselage', pos: [0, 2.58, 0] });
for (let i = 0; i < 4; i++) {
  const a = i * 90, ar = a * Math.PI / 180;
  part({ name: 'blade' + (i + 1), parent: 'mainRotor', geom: 'blade', mat: 'bladeMat', pos: [round(2.45 * Math.cos(ar)), 0, round(-2.45 * Math.sin(ar))], rot: [0, a, 0] });
  part({ name: 'bladeTip' + (i + 1), parent: 'mainRotor', geom: 'bladeTip', mat: 'yellow', pos: [round(4.9 * Math.cos(ar)), 0, round(-4.9 * Math.sin(ar))], rot: [0, a, 0] });
}
part({ name: 'mainBlur', parent: 'mainRotor', geom: 'blur', mat: 'blur', pos: [0, 0.03, 0], rot: [-90, 0, 0], shadow: false, vis: false });
part({ name: 'tailRotor', parent: 'fuselage', pos: [0.2, 2.0, -7.0] });
part({ name: 'tblade1', parent: 'tailRotor', geom: 'tblade', mat: 'bladeMat', pos: [0, 0, 0], rot: [0, 0, 0] });
part({ name: 'tblade2', parent: 'tailRotor', geom: 'tblade', mat: 'bladeMat', pos: [0, 0, 0], rot: [90, 0, 0] });
part({ name: 'tailBlur', parent: 'tailRotor', geom: 'tblur', mat: 'blur', pos: [0.02, 0, 0], rot: [0, 90, 0], shadow: false, vis: false });
// 可脱落的碎片（初始隐藏；飞行场景按实际接触决定哪些脱落并给出它们的位姿）
const debris = [];
for (let i = 1; i <= 4; i++) { part({ name: 'dBlade' + i, geom: 'blade', mat: 'bladeMat', vis: false }); part({ name: 'dTip' + i, geom: 'bladeTip', mat: 'yellow', vis: false }); debris.push({ part: 'dBlade' + i, tip: 'dTip' + i, from: 'blade' + i, tipFrom: 'bladeTip' + i, kind: 'blade', mass: 1 }); }
part({ name: 'dBoom', geom: 'boom', mat: 'body2', vis: false }); debris.push({ part: 'dBoom', from: 'tailBoom', kind: 'boom', mass: 3 });
part({ name: 'dFin', geom: 'fin', mat: 'body', vis: false }); debris.push({ part: 'dFin', from: 'fin', kind: 'fin', mass: 1.5 });
part({ name: 'dSkidL', geom: 'skid', mat: 'dark', vis: false }); debris.push({ part: 'dSkidL', from: 'skidL', kind: 'skid', mass: 1.2 });
part({ name: 'dSkidR', geom: 'skid', mat: 'dark', vis: false }); debris.push({ part: 'dSkidR', from: 'skidR', kind: 'skid', mass: 1.2 });
part({ name: 'dShard1', geom: 'shard', mat: 'body', vis: false }); debris.push({ part: 'dShard1', kind: 'panel', mass: 0.8 });
part({ name: 'dShard2', geom: 'shard', mat: 'yellow', vis: false }); debris.push({ part: 'dShard2', kind: 'panel', mass: 0.8 });
part({ name: 'dChunk', geom: 'chunk', mat: 'body2', vis: false }); debris.push({ part: 'dChunk', kind: 'chunk', mass: 1.4 });

const shots = [
  { t0: 0, t1: 3.4, kind: 'static', at: [-42.5, 2.1, 17.5], to: [-40.5, 2.5, 18.5], look: 'fuselage', lookDy: 0.5, fov: 40 },
  { t0: 3.4, t1: 7.6, kind: 'chase', off: [7.5, 3.0, -15], look: [0, 0.2, 10], fov: 54 },
  { t0: 7.6, t1: 12.2, kind: 'track', off: [17, 6.5, 13], look: 'fuselage', lookDy: 0, fov: 48 },
  { t0: 12.2, t1: 999, kind: 'orbit', center: 'crash', dist: 14, dist1: 9.5, h: 3.2, a0: 35, a1: 125, rate: 60, fov: 48, look: 'crash', lookDy: 1.2 },
];

const scene = {
  format: 'nested-os-scene', version: 1, name: '24号直升机：起飞与坠机', fps: 30, duration: 15,
  environment: { skyTop: '#1b1450', skyHorizon: '#ff8a5c', skyGround: '#3a2a55', sunDir: [0.55, 0.26, -0.72], sunColor: '#ffb066', sunIntensity: 3.0, ambientIntensity: 1.55, envIntensity: 1.1, fillIntensity: 1.2, fog: { color: '#d98a8f', density: 0.0026 }, time: '黄昏', weather: '晴，微风' },
  textures, materials, geoms: geoms,
  terrain: { size: SIZE, res: RES, heights, material: 'grass', colors: { low: '#4f8f3d', high: '#a08c58', dirt: '#6b5a45' }, edge: 0, scatter: [{ geom: 'grassTuft', mat: 'grassBlade', count: 1700, seed: 7, region: [-110, -110, 110, 110], minS: 0.7, maxS: 1.7, color: '#5fae52', h: 0.7 }] },
  pads, obstacles, parts: P,
  cameras: { default: { fov: 50 } },
  timeline: { shots },
  flight: {
    params: { mass: 1, hoverC: 0.52, g: 9.81, rotorR: 5.2, gear: 1.38, spoolTau: 1.4, dt: 1 / 60, ctlRate: 30, start: { pos: [pads[0].pos[0], 0, pads[0].pos[1]], yawDeg: 90 } },
    debris, record: null,
  },
};
const out = path.join(ROOT, 'ns', 'Demo', 'helicopter-24.scene');
fs.mkdirSync(path.dirname(out), { recursive: true });
// 保留已烘焙的记录
let prev = null; try { prev = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { }
if (prev && prev.flight && prev.flight.record) scene.flight.record = prev.flight.record;
fs.writeFileSync(out, JSON.stringify(scene));
console.log('场景已生成', out, (fs.statSync(out).size / 1024).toFixed(1) + ' KB', '部件', P.length, '障碍', obstacles.length);
