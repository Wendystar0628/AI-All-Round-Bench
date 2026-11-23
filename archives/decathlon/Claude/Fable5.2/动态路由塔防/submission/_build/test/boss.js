const { TD } = require('./bot.js');
for (const [map, boss] of [['backbone', 'boss2'], ['airgap', 'boss3'], ['intranet', 'boss1']]) {
  const s = new TD.Sim(map, { noAutoWave: true }); s.phase = 'active'; s.spawnQ = [{ t: 9999, type: 'worm', entry: 'A' }]; s.wave = s.totalWaves - 1; s.integrity = 999;
  const ev = []; s.on('bossWarn', d => ev.push('warn:' + d.warn.kind + '@' + s.time.toFixed(0) + '[' + d.warn.cells.map(c => s.grid.cells[c].x + ',' + s.grid.cells[c].y).join(' ') + ']')); s.on('bossAct', d => ev.push(d.kind + '@' + s.time.toFixed(0))); s.on('bossPhase', d => ev.push('P' + d.phase + '@' + s.time.toFixed(0))); s.on('routes', d => { if (d.changed.length) ev.push('routes:' + d.changed.join('') + '@' + s.time.toFixed(0)); });
  if (map === 'intranet') { s.compute = 999; s.intel = 99; s.place('gateway', 8 * s.W + 8, 0); }
  const b = s.spawnEnemy(boss, map === 'backbone' ? 'C' : 'A', {});
  for (let i = 0; i < 60 * 70 && !b.dead; i++) { s.step(); if (i === 60 * 20) b.hp = b.maxHp * 0.6; if (i === 60 * 28) b.hp = b.maxHp * 0.3; }
  console.log(map, ev.join(' '));
}
