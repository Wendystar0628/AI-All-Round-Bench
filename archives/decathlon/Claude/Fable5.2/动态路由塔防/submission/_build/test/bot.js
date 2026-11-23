globalThis.window = globalThis;
for (const f of ['core','maps','path','data','sim','sim2']) require('../../js/' + f + '.js');
const TD = globalThis.TD;
function runBot(mapId, opts = {}) {
  const sim = new TD.Sim(mapId, {});
  const g = sim.grid; const log = [];
  let rejects = 0; sim.on('reject', r => { rejects++; });
  const routeCells = () => { const s = new Map(); const w = {}; for (const wi of [sim.wave, sim.wave + 1]) { const f = sim.forecast(wi); if (!f) continue; for (const id in f.by) w[id] = (w[id] || 0) + f.by[id].filter(o => o.type !== 'hotspot').reduce((a, o) => a + o.n, 0) * (wi === sim.wave ? 1 : 0.5); }
    for (const id in sim.routes) { const ww = 0.15 + (w[id] || 0) / 8; sim.routes[id].cells.forEach((c, k) => s.set(c, (s.get(c) || 0) + ww)); } return s; };
  const plats = g.cells.filter(c => c.type === 'platform');
  const order = opts.order || ['firewall','interceptor','interceptor','interceptor','sandbox','firewall','interceptor','repair','interceptor','sandbox','interceptor','firewall','interceptor','repair','sandbox','interceptor','honeypot','interceptor','sandbox','interceptor','firewall','interceptor','interceptor','repair','interceptor','sandbox'];
  let oi = 0; let upIdx = 0;
  function tryBuild() {
    const type = order[oi % order.length]; const d = TD.TOWERS[type];
    if (oi >= order.length) { // upgrades
      const cands = sim.towers.filter(t => t.level < 2);
      if (!cands.length) { oi = 0; return; }
      const t = cands[upIdx++ % cands.length]; const br = TD.TOWERS[t.type].B ? (t.id % 2 ? 'a' : 'b') : null;
      if (sim.checkUpgrade(t, br).ok) sim.upgrade(t.id, br);
      return;
    }
    if (sim.compute < d.cost) return;
    const rc = routeCells();
    if (type === 'interceptor') {
      let best = null, bs = 0; const S = TD.towerStats(type, 1);
      for (const p of plats) { if (sim.towerAt[p.i]) continue; for (let f = 0; f < 4; f++) { let sc = 0; for (const c of sim.areaCells(p.i, f, S)) if (rc.has(c)) sc += rc.get(c) * (1 + 6 / (4 + sim.field.dist[c])); for (const t of sim.towers) if (t.blocker && sim.areaCells(p.i, f, S).includes(t.ci)) sc += 4; sc -= sim.towers.filter(t => t.type === 'interceptor' && Math.hypot(t.x - p.x, t.y - p.y) < 1.5).length * 1.0; if (sc > bs) { bs = sc; best = [p.i, f]; } } }
      if (best) { sim.place(type, best[0], best[1]); oi++; }
    } else if (type === 'sandbox' || type === 'repair') {
      let best = null, bs = 0; const S = TD.towerStats(type, 1);
      for (const p of plats) { if (sim.towerAt[p.i]) continue; let sc = 0;
        if (type === 'sandbox') { for (const [c, w] of rc) { const cc = g.cells[c]; if (Math.hypot(cc.x - p.x, cc.y - p.y) <= S.aoe) sc += w; } sc -= sim.towers.filter(t => t.type === 'sandbox' && Math.hypot(t.x - p.x, t.y - p.y) < 3).length * 3; }
        else { for (const t of sim.towers) if (Math.hypot(t.x - p.x, t.y - p.y) <= S.range) sc += (t.blocker || t.onNode) ? 3 : 1; sc -= sim.towers.filter(t => t.type === 'repair' && Math.hypot(t.x - p.x, t.y - p.y) < 3).length * 4; }
        if (sc > bs) { bs = sc; best = p.i; } }
      if (best != null) { sim.place(type, best, 0); oi++; } else oi++;
    } else if (type === 'firewall' || type === 'honeypot') {
      let best = null, bs = -1;
      for (const [c, w] of rc) { const cc = g.cells[c]; if (cc.type !== 'link' || sim.towerAt[c]) continue; let cov = 0; for (const t of sim.towers) { if (t.type === 'interceptor' && sim.inArea(t, t.S, cc.x, cc.y)) cov += 2; if (t.type === 'sandbox' && Math.hypot(t.x - cc.x, t.y - cc.y) <= t.S.aoe) cov += 2; } const sc = cov + w * 2 + 6 / (3 + sim.field.dist[c]) - sim.towers.filter(t => t.blocker && Math.hypot(t.x - cc.x, t.y - cc.y) < 2.5).length * 3 - (sim.field.dist[c] < 2 ? 5 : 0); if (sc > bs) { bs = sc; best = c; } }
      if (best != null) { sim.place(type, best, 0); oi++; }
    }
  }
  let ticks = 0; const maxT = 60 * 60 * 40;
  let minInteg = sim.integrity;
  while (!sim.over && ticks < maxT) {
    sim.step(); ticks++;
    if (ticks % 30 === 0) { tryBuild();
      // use skills
      for (const t of sim.towers) { if (t.type === 'repair' && sim.checkSkill(t).ok && sim.towers.some(o => o !== t && (o.encT > 0 || o.hp < o.maxHp * 0.5) && Math.hypot(o.x - t.x, o.y - t.y) < t.S.range)) sim.castSkill(t.id); if (t.type === 'firewall' && t.hp < t.maxHp * 0.6 && sim.checkSkill(t).ok) sim.castSkill(t.id); if (t.type==='honeypot' && t.blocked.length && sim.checkSkill(t).ok) sim.castSkill(t.id); if (t.type==='sandbox' && sim.checkSkill(t).ok && sim.enemies.filter(e=>Math.hypot(e.x-t.x,e.y-t.y)<t.S.aoe).length>=3) sim.castSkill(t.id);}
      if (opts.iso && sim.phase === 'active') { for (const k of opts.iso) { const ns = sim.nodes[k]; if (!ns.tower && !ns.iso && ns.reT <= 0 && sim.checkPlace('gateway', +k).ok) sim.place('gateway', +k, 0); } }
    }
    if (opts.fast && sim.phase === 'prep') sim.startWave(true);
    if (sim.integrity < minInteg) { minInteg = sim.integrity; log.push('w' + (sim.wave + 1) + ':' + sim.integrity); }
  }
  return { map: mapId, result: sim.over, wave: sim.wave + (sim.over === 'win' ? 0 : 1), integ: sim.integrity, time: Math.round(sim.time), towers: sim.towers.length, lost: sim.stats.lost, kills: sim.stats.killN, leaks: sim.stats.leaks, compute: Math.round(sim.compute), intel: sim.intel, rer: sim.stats.reroutes, log: log.join(' ') };
}
module.exports = { runBot, TD };
if (require.main === module) {
  for (const id of TD.MAP_ORDER) console.log(JSON.stringify(runBot(id)));
}
