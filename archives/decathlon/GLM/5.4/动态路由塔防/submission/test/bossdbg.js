const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { console, Math, Set, Map, Infinity, Object, Array, JSON }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/data.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, S = G.Sim;
const g = S.createGame('airgap', { seed: 3, cpu: 5000, intel: 50 }); g.phase = 'wave'; g.waveIdx = g.def.waves.length - 1;
const e = S.spawnEnemy(g, 'A', 'boss_zhe'); g.wave = { idx: 0, t: 0, queue: [], total: 1, spawned: 1, def: { label: 'test' } };
e.hp = e.maxHp * 0.3;
for (let i = 0; i < 30 * 40; i++) {
  try { S.tick(g, 1 / 30); } catch (err) {
    console.log('crash t=' + g.t.toFixed(2), err.message);
    for (const en of g.enemies) console.log('  enemy', en.type, 'cell=', en.cell, 'to=', en.to, 'prog=', en.prog && en.prog.toFixed(2), 'mode=', en.mode, 'pos=', en.x.toFixed(1), en.z.toFixed(1));
    console.log('  blocked:', [...g.terrain.blockedUntil.keys()], 'warnings:', JSON.stringify(g.terrain.warnings));
    const bad = g.enemies.find(en => en.to && !g.M.byId.get(en.to)); if (bad) console.log('  BAD', bad.type, bad.cell, bad.to, bad.mode, bad.path);
    break;
  }
  g.events.length = 0;
}
