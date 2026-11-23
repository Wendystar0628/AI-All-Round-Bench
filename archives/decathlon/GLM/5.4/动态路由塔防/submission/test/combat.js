// Node 战斗模拟：自动布防 + 跑完波次 + 道具 + Boss，检查异常与数值
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { console, Math, Set, Map, Infinity, Object, Array, JSON };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/data.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, S = G.Sim;
const mapId = process.argv[2] || 'seg';
const fromWave = parseInt(process.argv[3] || '0', 10);
const verbose = process.argv.includes('-v');

const M = S.buildMap(G.MAPS[mapId]);
const g = S.createGame(mapId, { seed: 42, cpu: 1500, intel: 30 });
// 自动布防：平台上放拦截器(朝向最近路径)与沙箱/修复，路径上放防火墙/蜜罐
const placed = { interceptor: 0, sandbox: 0, repair: 0, firewall: 0, honeypot: 0, gate: 0 };
function nearestPathDir(c) {
  let best = null, bd = Infinity;
  for (const cc of M.cells) { if (!M.walkable[cc.type]) continue; const d = Math.hypot(cc.wx - c.wx, cc.wz - c.wz); if (d < bd && d > 0.1) { bd = d; best = cc; } }
  const ang = Math.atan2(-(best.wz - c.wz), best.wx - c.wx); const oct = Math.round(ang / (Math.PI / 4)); return oct * (Math.PI / 4);
}
let pi = 0;
for (const p of M.platforms) {
  const t = pi % 3; pi++;
  if (t === 0) { const r = S.deploy(g, 'interceptor', p.id, nearestPathDir(p)); if (r.ok) placed.interceptor++; }
  else if (t === 1) { const r = S.deploy(g, 'sandbox', p.id); if (r.ok) placed.sandbox++; }
  else { const r = S.deploy(g, 'repair', p.id); if (r.ok) placed.repair++; }
}
// 在距离出口较近的路径上放防火墙与蜜罐
const paths = M.cells.filter(c => c.type === 'path' || c.type === 'old');
paths.sort((a, b) => b.z - a.z);
let fi = 0;
for (const c of paths) {
  if (fi % 4 === 0) { const r = S.deploy(g, 'firewall', c.id); if (r.ok) placed.firewall++; }
  else if (fi % 4 === 2) { const r = S.deploy(g, 'honeypot', c.id); if (r.ok) placed.honeypot++; }
  fi++; if (placed.firewall >= 4 && placed.honeypot >= 3) break;
}
console.log('布防:', JSON.stringify(placed), '剩余算力', g.cpu.toFixed(0));
// 升级一部分
for (const t of g.towers.slice()) { if (t.type === 'interceptor') S.upgradeTower(g, t.id, 'pierce'); if (t.type === 'honeypot') S.upgradeTower(g, t.id, 'cluster'); if (t.type === 'sandbox' || t.type === 'repair') S.upgradeTower(g, t.id); }
// 跳波
g.waveIdx = fromWave - 1; g.interT = 0; g.phase = fromWave > 0 ? 'inter' : 'prep';
S.callNextWave(g);
let lastWave = -1, itemT = 0, isoT = 0, err = null;
const evCount = {};
const t0 = Date.now();
try {
  for (let i = 0; i < 30 * 60 * 25; i++) {
    S.tick(g, 1 / 30);
    for (const e of g.events) evCount[e.type] = (evCount[e.type] || 0) + 1; g.events.length = 0;
    if (g.waveIdx !== lastWave) { lastWave = g.waveIdx; console.log(`  t=${g.t.toFixed(0)} 第${g.waveIdx + 1}波「${g.def.waves[g.waveIdx].label}」 core=${g.core.toFixed(0)} cpu=${g.cpu.toFixed(0)} intel=${g.intel} towers=${g.towers.length}`); }
    if (g.phase === 'inter' && g.interT < 3) S.callNextWave(g);
    if (g.t > itemT) { itemT += 20; const it = G.ITEM_ORDER[Math.floor(g.t / 20) % 3]; if (it === 'isolator') { const n = M.nodes.find(n => !n.iso && g.t >= n.reopenAt); if (n) S.useItem(g, 'isolator', n.id); } else if (it === 'downgrade') { const c = paths[Math.floor(g.rng() * paths.length)]; S.useItem(g, 'downgrade', c.id); } else { const t = g.towers.find(t => t.hp < t.maxHp * 0.8); if (t) S.useItem(g, 'restore', t.id); } }
    if (g.t > isoT) { isoT += 25; const n = M.nodes.find(n => !n.iso && g.t >= n.reopenAt); if (n) { const r = S.canDeploy(g, 'gate', n.id); if (r.ok) S.deploy(g, 'gate', n.id); } }
    if (verbose && i % 300 === 0) console.log(`    t=${g.t.toFixed(0)} enemies=${g.enemies.length} towers=${g.towers.length} core=${g.core.toFixed(0)}`);
    if (g.finished) break;
  }
} catch (e) { err = e; }
console.log(`结果: phase=${g.phase} t=${g.t.toFixed(0)}s wave=${g.waveIdx + 1}/${g.def.waves.length} core=${g.core.toFixed(0)} cpu=${g.cpu.toFixed(0)} intel=${g.intel} towers=${g.towers.length} built=${g.stats.built} lost=${g.stats.lost} kills=${g.stats.kills} leaks=${g.stats.leaks} dmg=${g.stats.dmg.toFixed(0)} isolated=${g.stats.isolated} 耗时${Date.now() - t0}ms`);
console.log('击杀:', JSON.stringify(g.stats.killByType));
console.log('事件:', JSON.stringify(evCount));
if (err) { console.log('异常:', err.stack); process.exit(1); }
