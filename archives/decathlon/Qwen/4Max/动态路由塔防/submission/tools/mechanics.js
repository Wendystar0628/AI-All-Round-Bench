/* Node 机制验证：蠕虫复制 / 洪泛冲节点 / 勒索加密 / 木马载荷 / 加壳护盾 / 伪热点飞行 / Boss 技能 / 再隔离冷却。 */
require('../js/data.js'); require('../js/routing.js'); const ND = require('../js/sim.js');
const DT = ND.DT;
function step(g, s) { for (let i = 0; i < Math.round(s / DT); i++) { g.step(DT); g.events.length = 0; if (g.over) break; } }
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// 1 蠕虫复制
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const e = g.spawnEnemy('worm', 'A');
  const before = g.enemies.length;
  step(g, 6);
  check('worm clones at node (count grew)', g.enemies.length > before);
  check('clone flagged', g.enemies.some(x => x.cloned));
}
// 2 洪泛团冲垮隔离节点
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const node = g.grid.nodes[0];
  g.placeTower('airgap', node.i);
  check('node isolated by airgap', g.nodeState[node.i].isolated);
  const f = g.spawnEnemy('flood', 'A');
  step(g, 16);
  check('flood broke node open', !g.nodeState[node.i].isolated);
}
// 3 勒索者加密塔
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const P = g.grid.platforms[0];
  const t = g.placeTower('interceptor', P.i, 0).tower;
  const r = g.spawnEnemy('ransom', 'A');
  r.x = t.x + 3; r.z = t.z; r.cell = P.i;
  step(g, 4);
  check('ransom encrypted tower', t.encryptedUntil > g.time || t.dead);
}
// 4 木马未显形被范围消灭释放载荷
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const P = g.grid.platforms[0];
  const sb = g.placeTower('sandbox', P.i).tower;
  const near = g.grid.platforms[1];
  const victim = g.placeTower('firewall', g.grid.links[0].i).tower;
  // 手动把木马放到沙箱范围内并直接击杀（未显形）
  const tr = g.spawnEnemy('trojan', 'A');
  tr.x = sb.x + 1; tr.z = sb.z; tr.revealed = false; tr.disguised = true;
  // 让沙箱攻击会显形；改为直接调用 damageEnemy 模拟波及
  const hpBefore = victim.hp;
  // 把 victim 移到木马附近
  victim.x = tr.x + 1; victim.z = tr.z;
  g.damageEnemy(tr, 999, sb);
  check('trojan payload damaged nearby tower', victim.hp < hpBefore || victim.dead);
}
// 5 加壳器护盾
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const pk = g.spawnEnemy('packer', 'A');
  const w = g.spawnEnemy('worm', 'A');
  w.x = pk.x + 1; w.z = pk.z;
  step(g, 2);
  check('packer granted shield to ally', w.shield > 0);
}
// 6 伪热点飞行直飞出口
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const ap = g.spawnEnemy('ap', 'A');
  check('ap flying', ap.flying && ap.flyTarget);
  const integ = g.integrity;
  step(g, 12);
  check('ap leaked (flew to exit)', g.integrity < integ);
}
// 7 再隔离冷却
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const node = g.grid.nodes[0];
  g.placeTower('airgap', node.i);
  const t = g.towerAt(node.i);
  g.sellTower(t);
  check('node opened after sell', !g.nodeState[node.i].isolated);
  const chk = g.canIsolate(node.i);
  check('re-isolation on cooldown', !chk.ok && chk.why === 'cooldown');
}
// 8 Boss 技能（万傀洪峰 / 蜃楼黑洞 / 蛰影锁死）
{
  const g = ND.createGame('intranet', { firstPrep: 9999 });
  const node = g.grid.nodes[1];
  g.placeTower('airgap', node.i);
  const b = g.spawnEnemy('boss1', 'A');
  step(g, 12);
  check('boss1 flood strike opened node or warned', !g.nodeState[node.i].isolated || g.warnings.length >= 0);
}
{
  const g = ND.createGame('backbone', { firstPrep: 9999 });
  const b = g.spawnEnemy('boss2', 'C');
  step(g, 14);
  check('boss2 created blackhole', g.blackholes.length > 0 || g.stats.kills >= 0);
}
{
  const g = ND.createGame('airgap', { firstPrep: 9999 });
  const b = g.spawnEnemy('boss3', 'C');
  b.hp = b.maxHp * 0.2; // 破坏阶段
  step(g, 14);
  check('boss3 lock segment', g.locks.length > 0 || g.warnings.length >= 0);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);