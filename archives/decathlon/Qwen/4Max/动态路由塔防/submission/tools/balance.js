/* Node 平衡测试：用一套像样的静态防线自动推进全部波次，观察通关与完整度损耗。 */
require('../js/data.js'); require('../js/routing.js'); const ND = require('../js/sim.js');
const DT = ND.DT;
function build(g, plan) { g.compute = 2000; g.intel = 500; for (const [type, x, y, f, br] of plan) { const r = g.placeTower(type, y * g.w + x, f); if (r.tower && br) g.upgradeTower(r.tower, br); else if (r.tower && ND.TOWERS[type].lv2) g.upgradeTower(r.tower); } }
function run(mapId, plan) {
  const g = ND.createGame(mapId, { seed: 5, firstPrep: 3 });
  build(g, plan);
  let guard = 0;
  while (!g.over && guard++ < 60 * 60 * 12) { if (g.waveState === 'prep') g.prepTimer = 0.01; g.step(DT); g.events.length = 0; }
  console.log(`[${mapId}] result=${g.result} wave=${g.wave}/${g.mapDef.waves} integrity=${g.integrity}/${g.maxIntegrity} kills=${g.stats.kills} leaked=${g.stats.leaked} destroyed=${g.stats.destroyed} towers=${g.towers.length}`);
}
// 分段内网：中心走廊双层火力
run('intranet', [
  ['interceptor', 6, 4, Math.PI / 2, 'suppress'], ['interceptor', 12, 4, -Math.PI / 2, 'suppress'],
  ['sandbox', 6, 7, 0], ['sandbox', 12, 7, 0], ['repair', 5, 10, 0], ['interceptor', 13, 10, Math.PI, 'pierce'],
  ['firewall', 9, 6, 0], ['honeypot', 9, 4, 0],
]);
// 骨干流域：西隧道 + 中心旧专线
run('backbone', [
  ['interceptor', 3, 4, Math.PI / 2, 'suppress'], ['interceptor', 7, 4, Math.PI / 2, 'pierce'],
  ['sandbox', 3, 8, 0], ['sandbox', 7, 8, 0], ['repair', 3, 6, 0], ['interceptor', 11, 10, -Math.PI / 2, 'suppress'],
  ['firewall', 1, 6, 0], ['firewall', 9, 8, 0],
]);
// 气隙深层：两侧通道 + 环
run('airgap', [
  ['interceptor', 4, 5, 0, 'suppress'], ['interceptor', 14, 5, Math.PI / 4, 'suppress'],
  ['sandbox', 4, 9, 0], ['interceptor', 14, 9, Math.PI / 4, 'pierce'], ['repair', 4, 2, 0], ['repair', 14, 2, 0],
  ['firewall', 3, 6, 0], ['firewall', 15, 6, 0],
]);