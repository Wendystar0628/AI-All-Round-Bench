const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
for (const [mi, bt, ent] of [[0, 'boss1', 'A'], [1, 'boss2', 'C'], [2, 'boss3', 'A']]) {
  const g = new G.Game(mi); g.autoWave = false; g.leakScale = 0; g.core = 1e6; g.coreMax = 1e6;
  g.placeFree('airgap', g.tx(g.nodes[0]), g.ty(g.nodes[0]));
  const e = g.spawnEnemy(bt, ent, 0.6, 0); e.slowT = 9999; e.slowF = 0.7; let haz = 0, hazOn = 0, rer = 0, sur = 0, phases = [];
  g.on((t, d) => { if (t === 'hazard' && d.phase === 'warn') haz++; if (t === 'hazard' && d.phase === 'on') hazOn++; if (t === 'reroute' && d.reason === 'hazard') rer++; if (t === 'surge') sur++; if (t === 'bossPhase') phases.push(d.phase); });
  for (let n = 0; n < 30 * 120; n++) { g.step(1 / 30); if (n === 600) e.hp = e.maxhp * 0.45; if (n === 1500) e.hp = e.maxhp * 0.25; }
  console.log(bt, 'warns', haz, 'active', hazOn, 'hazard-reroutes', rer, 'surges', sur, 'phases', phases.join(','), 'alive', !e.dead);
}
