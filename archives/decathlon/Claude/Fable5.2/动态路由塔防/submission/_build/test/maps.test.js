globalThis.window = globalThis;
require('../../js/core.js'); require('../../js/maps.js'); require('../../js/path.js');
const TD = globalThis.TD;
for (const id of TD.MAP_ORDER) {
  const g = TD.parseMap(TD.MAPS[id]);
  const cost = i => g.cells[i].legacy ? TD.LEGACY_COST : 1;
  const base = TD.computeField(g, i => true, cost);
  const br = {}; for (const e of g.entries) br[e.id] = TD.traceRoute(base, e.i);
  console.log('==', id, g.W + 'x' + g.H, 'nodes', g.nodes.length, 'platforms', g.cells.filter(c => c.type === 'platform').length, 'waves', TD.MAPS[id].waves.length);
  for (const e of g.entries) console.log('  entry', e.id, '->', br[e.id].exit, 'cost', br[e.id].cost.toFixed(2), 'len', br[e.id].cells.length, 'nodes on route:', br[e.id].cells.filter(c => g.cells[c].type === 'node').map(c => g.cells[c].name).join(','));
  let multi = 0;
  for (const nd of g.nodes) {
    const f = TD.computeField(g, i => i !== nd.i, cost);
    const res = []; let sealed = false; let changed = 0;
    for (const e of g.entries) { const r = TD.traceRoute(f, e.i); if (!r) { sealed = true; res.push(e.id + ':SEALED'); continue; } const d = TD.routeDiff(r, br[e.id]); if (d > 2) changed++; res.push(e.id + '->' + r.exit + ' ' + r.cost.toFixed(1) + ' (diff ' + d + ')'); }
    if (changed >= 2) multi++;
    console.log('  isolate', nd.name, '(' + nd.x + ',' + nd.y + ')', sealed ? 'SEALED!' : '', 'changed', changed, '|', res.join(' | '));
    if (sealed || changed < 1) console.log('  !!!! PROBLEM');
  }
  console.log('  multi-entry nodes:', multi);
  // all nodes defined?
  for (const k in TD.MAPS[id].nodes) { const [x, y] = k.split(',').map(Number); if (g.cells[y * g.W + x].type !== 'node') console.log('  !!!! node def mismatch', k); }
}
