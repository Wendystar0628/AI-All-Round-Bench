// Node 自动布防模拟：用一个简单的“玩家”策略打完一张图，输出每波数据用于平衡
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { console, Math, Set, Map, Infinity, Object, Array, JSON }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/data.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, S = G.Sim;
const mapId = process.argv[2] || 'seg';
const fromWave = parseInt(process.argv[3] || '0', 10);
const g = S.createGame(mapId, { seed: 42, cpu: 260, intel: 4 });
const M = g.M;

function facingToward(p) { // 枚举 8 个朝向，选能覆盖最多路线格的朝向
  const cells = []; for (const k in g.routes.byEntry) for (const id of g.routes.byEntry[k]) cells.push(M.byId.get(id));
  let bestA = 0, bestN = -1;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; let n = 0; for (const c of cells) { const d = Math.hypot(c.wx - p.wx, c.wz - p.wz); if (d > 3.6 * S.CELL) continue; const ang = Math.atan2(-(c.wz - p.wz), c.wx - p.wx); let dd = ang - a; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; if (Math.abs(dd) <= Math.PI / 4 + 0.035) n++; } if (n > bestN) { bestN = n; bestA = a; } }
  return bestA;
}
function spend() {
  // 优先级：拦截器（覆盖路线的平台）→ 沙箱 → 修复 → 防火墙（出口前链路）→ 蜜罐（中段）→ 升级
  const plats = M.platforms.filter(p => !S.towerAt(g, p.id)).sort((a, b) => b.wz - a.wz);
  const plan = [];
  for (const p of plats) { const nearRoute = g.routes.byEntry && Object.values(g.routes.byEntry).some(r => r.some(id => { const c = M.byId.get(id); return c && Math.hypot(c.wx - p.wx, c.wz - p.wz) <= S.CELL * 2.2; })); if (nearRoute) plan.push(p); }
  let guard = 0;
  while (guard++ < 20) {
    const ints = g.towers.filter(t => t.type === 'interceptor').length, sands = g.towers.filter(t => t.type === 'sandbox').length, reps = g.towers.filter(t => t.type === 'repair').length, fws = g.towers.filter(t => t.type === 'firewall').length, hon = g.towers.filter(t => t.type === 'honeypot').length;
    let did = false;
    // 升级拦截器
    const up = g.towers.find(t => t.type === 'interceptor' && t.level === 1); if (up && g.cpu >= 220 && g.intel >= 1) { if (S.upgradeTower(g, up.id, 'pierce').ok) { did = true; continue; } }
    if (ints < 6 && plan.length && g.cpu >= 120) { const p = plan.shift(); if (S.deploy(g, 'interceptor', p.id, facingToward(p)).ok) { did = true; continue; } }
    if (sands < 3 && plan.length && g.cpu >= 100) { const p = plan.shift(); if (S.deploy(g, 'sandbox', p.id).ok) { did = true; continue; } }
    if (reps < 2 && plan.length && g.cpu >= 110) { const p = plan.shift(); if (S.deploy(g, 'repair', p.id).ok) { did = true; continue; } }
    if (fws < 4 && g.cpu >= 80) { const paths = M.cells.filter(c => (c.type === 'path') && !S.towerAt(g, c.id) && c.wz > 0).sort((a, b) => b.wz - a.wz); const c = paths.find(c => !g.towers.some(t => t.cell === c.id)); if (c && S.deploy(g, 'firewall', c.id).ok) { did = true; continue; } }
    if (hon < 2 && g.cpu >= 60) { const paths = M.cells.filter(c => c.type === 'path' && !S.towerAt(g, c.id) && c.wz < 2 && c.wz > -10); const c = paths[Math.floor(g.rng() * paths.length)]; if (c && S.deploy(g, 'honeypot', c.id).ok) { did = true; continue; } }
    const up2 = g.towers.find(t => (t.type === 'sandbox' || t.type === 'repair' || t.type === 'firewall') && t.level === 1); if (up2 && g.cpu >= 110) { if (S.upgradeTower(g, up2.id).ok) { did = true; continue; } }
    if (!did) break;
  }
}
function items() {
  for (const id of G.ITEM_ORDER) {
    if (g.itemCd[id] > g.t) continue;
    if (id === 'restore') { const t = g.towers.find(t => t.hp < t.maxHp * 0.5 || t.encUntil > g.t); if (t) S.useItem(g, id, t.id); }
    if (id === 'downgrade' && g.phase === 'wave') { const es = g.enemies.filter(e => !e.fly && !e.dead); if (es.length >= 6) { const e = es[0]; const c = M.byId.get(e.to || e.cell); if (c) S.useItem(g, id, c.id); } }
    if (id === 'isolator' && g.phase === 'wave') { const n = M.nodes.find(n => !n.iso && g.t >= n.reopenAt && S.checkIsolation(g, n.id).ok); if (n) S.useItem(g, id, n.id); }
  }
}
function skills() { for (const t of g.towers) { if (t.skillCd <= g.t && (t.type === 'repair' || t.type === 'sandbox' || t.type === 'honeypot')) S.castSkill(g, t.id); } }
spend();
g.waveIdx = fromWave - 1; g.interT = 0; g.phase = fromWave > 0 ? 'inter' : 'prep';
S.callNextWave(g);
let last = -1; const t0 = Date.now(); const rows = [];
for (let i = 0; i < 30 * 60 * 30; i++) {
  S.tick(g, 1 / 30); g.events.length = 0;
  if (g.waveIdx !== last) { last = g.waveIdx; rows.push({ wave: g.waveIdx + 1, label: g.def.waves[g.waveIdx].label, coreAtStart: Math.round(g.core), towers: g.towers.length }); }
  if (i % 150 === 0) { spend(); items(); skills(); }
  if ((g.phase === 'inter' || g.phase === 'prep') && g.interT < 2) S.callNextWave(g);
  if (g.finished) break;
}
console.log('地图', mapId, '结果', g.phase, '波次', g.waveIdx + 1 + '/' + g.def.waves.length, 'core', Math.round(g.core), 't', g.t.toFixed(0), 'cpu', g.cpu.toFixed(0), 'intel', g.intel, 'towers', g.towers.length, 'built', g.stats.built, 'lost', g.stats.lost, 'kills', g.stats.kills, 'leaks', g.stats.leaks, '耗时', Date.now() - t0 + 'ms');
console.log('击杀', JSON.stringify(g.stats.killByType));
for (const r of rows) console.log('  第' + r.wave + '波 ' + r.label + ' 开始时完整度 ' + r.coreAtStart + ' 塔数 ' + r.towers);
