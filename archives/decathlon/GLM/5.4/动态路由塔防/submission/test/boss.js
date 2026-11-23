const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { console, Math, Set, Map, Infinity, Object, Array, JSON }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['js/data.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, S = G.Sim;
function run(mapId, bossType, setup) {
  const g = S.createGame(mapId, { seed: 3, cpu: 5000, intel: 50 }); g.phase = 'wave'; g.waveIdx = g.def.waves.length - 1;
  const M = g.M; const e = S.spawnEnemy(g, 'A', bossType); g.wave = { idx: 0, t: 0, queue: [], total: 1, spawned: 1, def: { label: 'test' } };
  setup(g, e, M);
  const seen = {};
  for (let i = 0; i < 30 * 40; i++) { S.tick(g, 1 / 30); for (const ev of g.events) { seen[ev.type] = (seen[ev.type] || 0) + 1; if (ev.type === 'bossPhase') console.log('   bossPhase', ev.phase, 't=' + g.t.toFixed(1)); if (ev.type === 'slam') console.log('   slam t=' + g.t.toFixed(1)); if (ev.type === 'bossWarn') console.log('   bossWarn', ev.kind, ev.cells.length, 'cells t=' + g.t.toFixed(1)); if (ev.type === 'terrainApply') console.log('   terrainApply', ev.kind, 't=' + g.t.toFixed(1), 'blocked=', g.terrain.blockedUntil.size); } g.events.length = 0; }
  console.log(mapId, bossType, 'phase=', e.bossPhase, 'hp=', e.hp.toFixed(0), 'enemies=', g.enemies.length, JSON.stringify(seen));
}
// 蛰影
run('airgap', 'boss_zhe', (g, e) => { });
run('airgap', 'boss_zhe', (g, e) => { e.hp = e.maxHp * 0.65; });
run('airgap', 'boss_zhe', (g, e) => { e.hp = e.maxHp * 0.3; });
// 万傀：在路径上放网闸隔离节点，boss 走到附近触发洪峰
run('seg', 'boss_wan', (g, e, M) => { const n = M.nodes[4]; S.deploy(g, 'gate', n.id); e.cell = M.byId.get('0:9:7') ? '0:9:7' : e.cell; e.to = g.routes.next.get(e.cell); });
run('seg', 'boss_wan', (g, e) => { e.hp = e.maxHp * 0.45; });
// 蜃楼
run('backbone', 'boss_shen', (g, e) => { });
run('backbone', 'boss_shen', (g, e) => { e.hp = e.maxHp * 0.45; });
