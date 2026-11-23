/* Node 冒烟测试：模拟战斗运行、部署、改道、道具、技能、Boss。 */
require('../js/data.js');
require('../js/routing.js');
const ND = require('../js/sim.js');

function run(mapId, seconds, actions) {
  const g = ND.createGame(mapId, { seed: 42, firstPrep: 2 });
  let err = null;
  const dt = ND.DT;
  const steps = Math.round(seconds / dt);
  try {
    for (let i = 0; i < steps; i++) {
      if (actions) actions(g, i * dt);
      g.step(dt);
      g.events.length = 0;
      if (g.over) break;
    }
  } catch (e) { err = e; }
  console.log(`[${mapId}] t=${g.time.toFixed(1)} wave=${g.wave}/${g.mapDef.waves} state=${g.waveState} integrity=${g.integrity} compute=${Math.floor(g.compute)} intel=${Math.floor(g.intel)} kills=${g.stats.kills} leaked=${g.stats.leaked} towers=${g.towers.length} enemies=${g.enemies.filter(e=>!e.dead).length} over=${g.over} result=${g.result}`);
  if (err) { console.error('ERROR:', err.stack); process.exitCode = 1; }
  return g;
}

// 图1：部署 + 隔离 + 道具
const g1 = ND.createGame('intranet', { seed: 42, firstPrep: 2 });
const R = ND.Routing;
// 在平台上放拦截器/沙箱/修复，链路上放防火墙
const plats = g1.grid.platforms;
console.log('place interceptor:', g1.placeTower('interceptor', plats[0].i, 0).ok);
console.log('place sandbox:', g1.placeTower('sandbox', plats[1].i).ok);
console.log('place repair:', g1.placeTower('repair', plats[2].i).ok);
// 找一个链路格放防火墙
const linkCell = g1.grid.links.find(c => !g1.towerAt(c.i));
console.log('place firewall:', g1.placeTower('firewall', linkCell.i).ok);
// 隔离西边界节点
const wnode = g1.grid.nodes[0];
console.log('isolate node:', g1.isolateNode(wnode.i, 'test'));
console.log('routes after isolate:', JSON.stringify(g1.changedEntries));
// 升级
g1.compute = 500; g1.intel = 200;
const it = g1.towers[0];
console.log('upgrade branch:', g1.upgradeTower(it, 'pierce'));
// 道具
console.log('item isolator:', g1.useItem('isolator', g1.grid.nodes[1].i));
console.log('item downgrade:', g1.useItem('downgrade', g1.grid.links[5].i));
// 运行
for (let i = 0; i < 60 * 90; i++) { g1.step(ND.DT); g1.events.length = 0; if (g1.over) break; }
console.log(`[intranet] t=${g1.time.toFixed(1)} wave=${g1.wave} integrity=${g1.integrity} kills=${g1.stats.kills} leaked=${g1.stats.leaked} over=${g1.over} result=${g1.result}`);

// 图2/图3 长时间运行（含洪峰与Boss）
run('backbone', 400);
run('airgap', 420);
console.log('SMOKE DONE');