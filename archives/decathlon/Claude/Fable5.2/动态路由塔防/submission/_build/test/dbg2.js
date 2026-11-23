const { TD } = require('./bot.js');
// 富裕 bot：检验中后期波次与 Boss 逻辑不出错
function run(mapId, mul, isoKeys) {
  const sim = new TD.Sim(mapId, { passiveMul: mul }); sim.compute += 400 * mul;
  const g = sim.grid, plats = g.cells.filter(c => c.type === 'platform'); const ev = [];
  sim.on('bossPhase', d => ev.push('phase' + d.phase + '@' + Math.round(sim.time))); sim.on('bossAct', d => ev.push(d.kind + '@' + Math.round(sim.time))); sim.on('bossDie', d => ev.push('bossDie@' + Math.round(sim.time)));
  const rcW = () => { const s = new Map(); for (const id in sim.routes) sim.routes[id].cells.forEach(c => s.set(c, (s.get(c) || 0) + 1)); return s; };
  const order = ['firewall', 'interceptor', 'interceptor', 'sandbox', 'repair', 'interceptor', 'firewall', 'interceptor', 'sandbox', 'interceptor', 'honeypot', 'repair']; let oi = 0, n = 0;
  function build() {
    const type = order[oi % order.length], d = TD.TOWERS[type]; if (sim.compute < d.cost + 20) return; const rc = rcW();
    // 每个出口轮流布防
    const ex = g.exits[n % g.exits.length]; const near = c => Math.hypot(c.x - ex.x, c.y - ex.y);
    let best = null, bs = -1e9;
    if (d.place.includes('platform')) { for (const p of plats) { if (sim.towerAt[p.i]) continue; for (let f = 0; f < (type === 'interceptor' ? 4 : 1); f++) { let sc = 0; if (type === 'interceptor') { for (const c of sim.areaCells(p.i, f, TD.towerStats(type, 1))) if (rc.has(c)) sc += rc.get(c); } else { for (const [c, w] of rc) { const cc = g.cells[c]; if (Math.hypot(cc.x - p.x, cc.y - p.y) <= 2) sc += w; } } sc -= near(p) * 0.6; if (sc > bs) { bs = sc; best = [p.i, f]; } } } }
    else { for (const [c, w] of rc) { const cc = g.cells[c]; if (cc.type !== 'link' || sim.towerAt[c]) continue; const dd = sim.field.dist[c]; if (dd < 2) continue; const sc = w * 2 - Math.abs(dd - 4) - near(cc) * 0.3 - sim.towers.filter(t => t.blocker && Math.hypot(t.x - cc.x, t.y - cc.y) < 2).length * 4; if (sc > bs) { bs = sc; best = [c, 0]; } } }
    if (best && sim.place(type, best[0], best[1])) { oi++; n++; }
    const ups = sim.towers.filter(t => t.level < 2); if (sim.compute > 500 && ups.length) { const t = ups[0]; sim.upgrade(t.id, TD.TOWERS[t.type].B ? (t.id % 2 ? 'a' : 'b') : null); }
  }
  let ticks = 0; const lost0 = [];
  while (!sim.over && ticks < 60 * 60 * 45) { sim.step(); ticks++; if (ticks % 20 === 0) { build(); for (const t of sim.towers) { if (sim.checkSkill(t).ok && (t.type !== 'repair' || sim.towers.some(o => o !== t && (o.encT > 0 || o.hp < o.maxHp * 0.6) && Math.hypot(o.x - t.x, o.y - t.y) < t.S.range))) { if (t.type === 'repair' || t.hp < t.maxHp * 0.7 || t.blocked.length || t.target) sim.castSkill(t.id); } }
      if (isoKeys && sim.phase === 'active') for (const k of isoKeys) { const ns = sim.nodes[k]; if (ns && !ns.tower && !ns.iso && ns.reT <= 0 && sim.checkPlace('gateway', +k).ok) sim.place('gateway', +k, 0); } }
    if (sim.phase === 'prep' && sim.prepT > 3) sim.prepT = 3; }
  return { map: mapId, mul, result: sim.over, wave: sim.wave + 1, integ: sim.integrity, t: Math.round(sim.time), tw: sim.towers.length, lost: sim.stats.lost, kills: sim.stats.killN, rer: sim.stats.reroutes, intel: sim.intel, ev: ev.join(' ') };
}
for (const [m, mul, iso] of [['intranet', 1, null], ['backbone', 1, null], ['backbone', 1.6, null], ['airgap', 1, null], ['airgap', 1.6, null], ['backbone', 1.6, [5 * 25 + 18]], ['intranet', 1, [8 * 23 + 8]]]) console.log(JSON.stringify(run(m, mul, iso)));
