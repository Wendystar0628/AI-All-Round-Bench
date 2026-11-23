/* Node 校验脚本：检查三张地图的路由约束（题面 3.2）。 */
const ND = require('../js/data.js');
require('../js/routing.js');
const R = ND.Routing;

let failures = 0;
for (const map of ND.MAPS) {
  console.log('\n=== ' + map.name + ' (' + map.id + ') ===');
  const g = R.build(map);
  console.log('nodes:', g.nodes.map(n => `(${n.x},${n.y})`).join(' '), '| entries:', g.entries.map(e => e.entry).join(','), '| exits:', g.exits.map(e => e.exit).join(','), '| platforms:', g.platforms.length);
  const base = R.field(g, new Set(), new Set());
  const baseRoutes = R.entryRoutes(g, base);
  const conn0 = R.connected(g, base, []);
  if (!conn0.ok) { console.log('!! base disconnected'); failures++; }
  for (const k of Object.keys(baseRoutes)) {
    const p = baseRoutes[k];
    console.log('  base route ' + k + ': ' + (p ? p.map(i => `(${g.cells[i].x},${g.cells[i].y})`).join('→') : 'NULL') + ' cost=' + (p ? base.dist[g.entryMap[k].i].toFixed(1) : 'inf'));
  }
  let multi = 0;
  for (const node of g.nodes) {
    const blocked = new Set([node.i]);
    const ev = R.evaluate(g, blocked, new Set(), []);
    const changed = R.changedEntries(baseRoutes, ev.routes);
    // 变化幅度：新旧路线不同的格数
    let detail = [];
    for (const k of changed) {
      const oldSet = new Set(baseRoutes[k] || []);
      const newP = ev.routes[k] || [];
      const diff = newP.filter(i => !oldSet.has(i)).length;
      detail.push(`${k}:+${diff}cells`);
      if (diff < 2) { console.log(`  !! node (${node.x},${node.y}) changes ${k} by only ${diff} cell(s) — 需大幅改道`); failures++; }
    }
    if (!ev.connected.ok) { console.log(`  !! node (${node.x},${node.y}) DISCONNECTS (${ev.connected.why} at ${ev.connected.cell})`); failures++; }
    if (changed.length === 0) { console.log(`  !! node (${node.x},${node.y}) changes NO entry route`); failures++; }
    if (changed.length >= 2) multi++;
    console.log(`  node (${node.x},${node.y}): ${ev.connected.ok ? 'conn-ok' : 'DISCONNECT'} changed=[${detail.join(', ') || 'none'}]`);
  }
  if (multi === 0) { console.log('  !! no node changes >=2 entries'); failures++; }
  else console.log('  multi-entry nodes: ' + multi);
  // 双节点组合抽查（核心前节点 + 汇聚节点等）不强制
}
console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);