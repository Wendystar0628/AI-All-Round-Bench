const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
const mi = +process.argv[2] || 0, skill = process.argv[3] !== 'noskill', toggle = process.argv[4] === 'toggle';
const g = new G.Game(mi); const dt = 1 / 30; const K = G.K;
const used = new Set();
function platsNear(x, y, R) { const out = []; for (let i = 0; i < g.N; i++) if (g.kind[i] === K.PLAT && !used.has(i) && !g.towerAt[i] && (g.tx(i) - x) ** 2 + (g.ty(i) - y) ** 2 <= R * R) out.push(i); return out; }
// 为每个入口找杀伤区：路线上（非节点）周围平台最多的路面
const zones = [];
g.entrances.forEach(e => {
  let best = null, bs = -1;
  e.route.forEach((t, k) => { if (k < 4 || k > e.route.length - 5) return; if (g.kind[t] === K.NODE || g.kind[t] === K.OLD) return; const n = platsNear(g.tx(t), g.ty(t), 2.6).length; const sc = n + (zones.some(z => z.t === t) ? -3 : 0); if (sc > bs) { bs = sc; best = t; } });
  zones.push({ ent: e.id, t: best, x: g.tx(best), y: g.ty(best) });
});
const queue = []; // 建造队列
zones.forEach(z => { queue.push({ k: 'firewall', z }); queue.push({ k: 'interceptor', z }); });
zones.forEach(z => { queue.push({ k: 'interceptor', z }); queue.push({ k: 'sandbox', z }); });
zones.forEach(z => { queue.push({ k: 'repair', z }); queue.push({ k: 'interceptor', z }); });
zones.forEach(z => { queue.push({ k: 'firewall2', z }); queue.push({ k: 'sandbox', z }); queue.push({ k: 'interceptor', z }); });
let qi = 0;
function tryBuild() {
  if (qi >= queue.length) return false; const q = queue[qi]; const z = q.z; const kind = q.k.replace('2', '');
  if (g.compute < G.TOWERS[kind].cost) return false;
  if (kind === 'firewall') {
    const cand = [z.t]; const r = g.entrances.find(e => e.id === z.ent).route; const k0 = r.indexOf(z.t); [1, -1, 2, -2].forEach(d => { if (r[k0 + d] != null) cand.push(r[k0 + d]); });
    for (const t of cand) { if (g.kind[t] === K.NODE || g.kind[t] === K.IN || g.kind[t] === K.OUT) continue; const res = g.deploy('firewall', g.tx(t), g.ty(t)); if (res.ok) { qi++; return true; } } qi++; return false;
  }
  const ps = platsNear(z.x, z.y, 3.0); ps.sort((a, b) => Math.hypot(g.tx(a) - z.x, g.ty(a) - z.y) - Math.hypot(g.tx(b) - z.x, g.ty(b) - z.y));
  if (!ps.length) { qi++; return false; }
  const i = ps[0]; used.add(i); const face = Math.round(Math.atan2(z.y - g.ty(i), z.x - g.tx(i)) / (Math.PI / 4)) * Math.PI / 4;
  const res = g.deploy(kind, g.tx(i), g.ty(i), face); if (res.ok) { res.tw.face = face; qi++; return true; } return false;
}
function upgrade() { for (const tw of g.towers.slice()) { if (tw.level >= 2 || tw.onNode || tw.kind === 'honeypot') continue; const d = G.TOWERS[tw.kind]; let br = d.branches ? ((tw.id % 2) ? 'A' : 'B') : null; if (g.upgrade(tw, br).ok) return true; } return false; }
const log = []; g.on((t, d) => { if (t === 'wave') log.push('W' + d.n + ' t=' + g.time.toFixed(0) + ' core=' + Math.round(g.core) + ' towers=' + g.towers.length + ' comp=' + Math.floor(g.compute) + ' intel=' + Math.floor(g.intel)); });
const leakBy = {}; g.on((t, d) => { if (t === 'leak') { const k = d.e.type; leakBy[k] = (leakBy[k] || 0) + 1; } });
let n = 0, ta = 0;
while (!g.over && n < 30 * 60 * 40) {
  g.step(dt); n++; ta += dt;
  if (toggle && n % 30 === 0) { const nd = g.nodes[0]; const tw = g.towerAt[nd]; if (tw && g.time - tw.born > 10) g.sell(tw); else if (!tw) g.deploy('airgap', g.tx(nd), g.ty(nd)); }
  if (ta > 1.2) { ta = 0; let k = 0; while (k < 3 && (tryBuild() || (qi >= queue.length && upgrade()))) k++;
    if (skill) g.towers.forEach(tw => { if (tw.kind === 'repair' && tw.skillCd <= 0 && g.towers.some(o => o.encT > 0)) g.useSkill(tw); if (tw.kind === 'firewall' && tw.skillCd <= 0 && tw.blocked.length >= 2) g.useSkill(tw); }); }
}
console.log('toggle', toggle, 'intelSpent', Math.round(g.stats.intelSpent), 'intelGain', Math.round(g.stats.intelGain), 'reroutes', g.stats.reroutes, 'map', mi, g.map.name, 'win', g.win, 't', g.time.toFixed(0), 'core', Math.round(g.core), 'wave', g.waveIdx + '/' + g.map.waves.length, 'towers', g.towers.length, 'destroyed', g.stats.destroyed, 'kills', g.stats.kills, 'leaks', g.stats.leaks);
console.log(log.join('\n')); console.log(JSON.stringify(leakBy));
