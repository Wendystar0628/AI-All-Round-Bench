const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
const mi = +process.argv[2] || 0; const strat = process.argv[3] || 'basic';
const g = new G.Game(mi);
const dt = 1 / 30;
// 候选平台 & 评分
const routeTiles = new Set(); g.entrances.forEach(e => e.route.forEach(t => routeTiles.add(t)));
const alt = [];
for (const n of g.nodes) { const pv = g.preview({ block: [n] }); for (const id in pv.routes) pv.routes[id].tiles.forEach(t => alt.push(t)); }
function score(x, y, R) { let s = 0; for (const t of routeTiles) { const tx = g.tx(t), ty = g.ty(t); if ((tx - x) ** 2 + (ty - y) ** 2 <= R * R) s++; } return s; }
const plats = []; for (let i = 0; i < g.N; i++) if (g.kind[i] === G.K.PLAT) plats.push({ i, x: g.tx(i), y: g.ty(i), s: score(g.tx(i), g.ty(i), 3.6) });
plats.sort((a, b) => b.s - a.s);
function bestFace(x, y, R) { let best = 0, bs = -1; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; let c = 0; for (const t of routeTiles) { const dx = g.tx(t) - x, dy = g.ty(t) - y, d = Math.hypot(dx, dy); if (d > R || d < 0.1) continue; if (Math.abs(G.angDiff(Math.atan2(dy, dx), a)) < 0.9) c++; } if (c > bs) { bs = c; best = a; } } return best; }
const roadSpots = []; for (const t of routeTiles) if (g.kind[t] === G.K.ROAD || g.kind[t] === G.K.OLD || g.kind[t] === G.K.TUN) roadSpots.push({ x: g.tx(t), y: g.ty(t), d: g.field.dist[t] });
roadSpots.sort((a, b) => a.d - b.d);
let plan = [];
const used = new Set();
const cover = {}; g.entrances.forEach(e => cover[e.id] = 0);
function covOf(p, e) { let c = 0; for (const t of e.route) { if ((g.tx(t)-p.x)**2 + (g.ty(t)-p.y)**2 <= 3.6*3.6) c++; } return c; }
function pickPlat() {
  // 先照顾覆盖最少的入口（按近期波次出现的入口）
  const need = g.entrances.slice().sort((a,b)=>cover[a.id]-cover[b.id])[0];
  let best=null,bs=-1; for (const p of plats) { if (used.has(p.i)||g.towerAt[p.i]) continue; const c = covOf(p, need); if (c>bs) {bs=c;best=p;} }
  if (!best) return null; used.add(best.i); g.entrances.forEach(e=>{ cover[e.id]+=covOf(best,e); }); return best;
}
// 构建计划
const seq = ['interceptor', 'interceptor', 'firewall', 'sandbox', 'interceptor', 'repair', 'interceptor', 'firewall', 'sandbox', 'interceptor', 'repair', 'interceptor', 'firewall', 'interceptor', 'sandbox', 'interceptor'];
let si = 0, fwIdx = 0;
function build() {
  const k = seq[si % seq.length];
  if (g.compute < G.TOWERS[k].cost) return false;
  if (k === 'firewall') { // 靠近出口的路上
    for (let j = 0; j < roadSpots.length; j++) { const r = roadSpots[(j + 3 + fwIdx * 4) % Math.min(roadSpots.length, 40)]; const res = g.deploy('firewall', r.x, r.y); if (res.ok) { fwIdx++; si++; return true; } } si++; return false;
  }
  const p = pickPlat(); if (!p) { si++; return false; }
  const res = g.deploy(k, p.x, p.y, k === 'interceptor' ? bestFace(p.x, p.y, 4.5) : 0); if (res.ok) { if (k === 'interceptor') res.tw.face = bestFace(p.x, p.y, 4.5); si++; return true; } return false;
}
let nextUp = 0;
function upgrade() {
  for (const tw of g.towers.slice()) { if (tw.level >= 2 || tw.onNode) continue; const d = G.TOWERS[tw.kind]; let br = null; if (d.branches) br = (tw.id % 2) ? 'A' : 'B'; const r = g.upgrade(tw, br); if (r.ok) return true; }
  return false;
}
let log = []; const leakBy = {};
g.on((t,d)=>{ if (t==='leak') { const k = d.e.type+'@w'+d.e.wave; leakBy[k]=(leakBy[k]||0)+1; } });
g.on((t, d) => { if (t === 'wave') log.push('W' + d.n + ' t=' + g.time.toFixed(0) + ' core=' + g.core + ' towers=' + g.towers.length + ' comp=' + Math.floor(g.compute)); });
let n = 0, tAct = 0;
while (!g.over && n < 30 * 60 * 40) {
  g.step(dt); n++; tAct += dt;
  if (tAct > 1.5) { tAct = 0; let k = 0; while (k < 3 && (build() || (g.towers.length > 8 && upgrade()))) k++; // 自动修复：卖掉死的不需要
    // 技能：修复 / 蜜罐
    g.towers.forEach(tw => { if (tw.kind === 'repair' && tw.skillCd <= 0 && g.towers.some(o => o.encT > 0)) g.useSkill(tw); });
    if (g.compute > 400 && g.intel > 40) g.towers.forEach(tw=>{}); }
}
console.log('map', mi, g.map.name, 'over', g.over, 'win', g.win, 'time', g.time.toFixed(0), 'core', Math.round(g.core), 'wave', g.waveIdx + '/' + g.map.waves.length, 'towers', g.towers.length, 'destroyed', g.stats.destroyed, 'kills', g.stats.kills, 'leaks', g.stats.leaks);
console.log(log.join('\n'));
console.log(g.towers.map(t => t.kind + '@' + t.x + ',' + t.y + ' f=' + (t.face * 180 / Math.PI).toFixed(0)).join(' | '));
console.log('routes', g.entrances.map(e => e.id + ':' + e.route.map(t => g.tx(t) + ',' + g.ty(t)).join(' ')).join('\n'));
