const { TD } = require('./bot.js');
// 手工编排的“正常玩家”方案：按顺序部署，钱够就建；被毁重建；会放技能、备份还原、升级
const PLANS = {
  backbone: { build: [['gateway', 18, 5], ['firewall', 5, 10], ['interceptor', 6, 9, 3], ['interceptor', 17, 4, 0], ['sandbox', 19, 4], ['repair', 17, 5], ['interceptor', 4, 10, 0], ['sandbox', 6, 10], ['firewall', 19, 3], ['interceptor', 21, 4, 3], ['interceptor', 7, 10, 2], ['repair', 6, 12], ['interceptor', 20, 4, 3], ['interceptor', 8, 12, 3], ['firewall', 8, 11], ['repair', 19, 5], ['interceptor', 10, 12, 2], ['sandbox', 8, 10], ['interceptor', 16, 4, 0], ['interceptor', 4, 9, 0], ['honeypot', 6, 11], ['interceptor', 6, 3, 1], ['sandbox', 6, 5], ['interceptor', 17, 2, 0], ['interceptor', 7, 12, 3], ['interceptor', 10, 10, 2], ['sandbox', 4, 4], ['interceptor', 15, 2, 1]] },
  airgap: { build: [['gateway', 17, 11], ['firewall', 7, 12], ['interceptor', 6, 12, 0], ['interceptor', 6, 10, 1], ['sandbox', 6, 11], ['repair', 18, 11], ['interceptor', 8, 13, 2], ['interceptor', 16, 13, 0], ['repair', 6, 13], ['interceptor', 5, 10, 0], ['sandbox', 6, 7], ['firewall', 7, 10], ['interceptor', 6, 8, 0], ['interceptor', 18, 13, 2], ['interceptor', 5, 12, 0], ['honeypot', 6, 9], ['sandbox', 9, 13], ['interceptor', 6, 5, 1], ['interceptor', 5, 7, 0], ['repair', 18, 10], ['interceptor', 10, 13, 2], ['interceptor', 6, 6, 0], ['sandbox', 5, 11], ['interceptor', 3, 12, 0]] },
  intranet: { build: [['firewall', 11, 12], ['interceptor', 12, 11, 3], ['interceptor', 10, 11, 3], ['sandbox', 10, 9], ['interceptor', 12, 9, 2], ['repair', 9, 11], ['firewall', 11, 11], ['interceptor', 9, 9, 0], ['sandbox', 13, 9], ['interceptor', 13, 11, 3], ['interceptor', 8, 11, 0], ['repair', 13, 7], ['interceptor', 9, 7, 2], ['interceptor', 13, 6, 1], ['sandbox', 9, 8], ['honeypot', 12, 10], ['interceptor', 7, 9, 0], ['interceptor', 15, 9, 2]] }
};
function run(mapId, verbose) {
  const sim = new TD.Sim(mapId, {}), P = PLANS[mapId], at = (x, y) => y * sim.W + x, ev = [];
  sim.on('leak', d => ev.push('L' + (sim.wave + 1) + d.enemy.type[0] + d.enemy.entry)); sim.on('bossDie', () => ev.push('BOSSDIE')); sim.on('bossAct', d => ev.push(d.kind)); const perWave = [];
  sim.on('waveClear', d => perWave.push(d.n + ':' + sim.integrity + '/' + sim.towers.length + '/$' + Math.round(sim.compute)));
  let ticks = 0, upI = 0;
  while (!sim.over && ticks < 60 * 60 * 40) {
    sim.step(); ticks++;
    if (ticks % 20) continue;
    for (const b of P.build) { const ci = at(b[1], b[2]); if (sim.towerAt[ci]) continue; const chk = sim.checkPlace(b[0], ci); if (chk.ok) sim.place(b[0], ci, b[3] || 0); break; }
    if (P.build.every(b => sim.towerAt[at(b[1], b[2])]) || sim.compute > 420) { const order = ['sandbox', 'firewall', 'interceptor', 'repair', 'gateway', 'honeypot']; const c = sim.towers.filter(t => t.level < 2).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0]; if (c) { const br = TD.TOWERS[c.type].B ? ((upI++) % 2 ? 'a' : 'b') : null; if (sim.checkUpgrade(c, br).ok && sim.compute > TD.TOWERS[c.type].upCost + 100) sim.upgrade(c.id, br); } }
    for (const t of sim.towers) { const ck = sim.checkSkill(t); if (!ck.ok) continue; if (t.type === 'repair') { if (sim.towers.some(o => o !== t && (o.encT > 1 || o.hp < o.maxHp * 0.55) && Math.hypot(o.x - t.x, o.y - t.y) <= t.S.range)) sim.castSkill(t.id); } else if (t.type === 'firewall') { if (t.hp < t.maxHp * 0.6 && t.blocked.length) sim.castSkill(t.id); } else if (t.type === 'honeypot') { if (t.blocked.length >= 2) sim.castSkill(t.id); } else if (t.type === 'sandbox') { if (sim.enemies.filter(e => !e.fly && Math.hypot(e.x - t.x, e.y - t.y) < t.S.aoe).length >= 4) sim.castSkill(t.id); } else if (t.target || t.branch === 'a') { if (sim.enemies.filter(e => sim.inArea(t, t.S, e.x, e.y)).length >= 3) sim.castSkill(t.id); } }
    if (sim.itemCd.restore <= 0 && sim.compute > 160) { const w = sim.towers.filter(t => t.hp < t.maxHp * 0.4 || (t.type === 'repair' && t.encT > 1)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (w) sim.useItem('restore', w.id); }
    if (sim.phase === 'prep' && sim.prepT > 6) sim.prepT = 6;
  }
  const r = { map: mapId, result: sim.over, wave: sim.wave + 1, integ: sim.integrity, t: Math.round(sim.time), tw: sim.towers.length, lost: sim.stats.lost, kills: sim.stats.killN, intel: sim.intel, compute: Math.round(sim.compute) };
  console.log(JSON.stringify(r)); if (verbose) { console.log('  waves', perWave.join(' ')); console.log('  ev', ev.join(' ').slice(0, 600)); }
  return r;
}
module.exports = { run, PLANS };
if (require.main === module) for (const m of ['intranet', 'backbone', 'airgap']) run(m, true);
