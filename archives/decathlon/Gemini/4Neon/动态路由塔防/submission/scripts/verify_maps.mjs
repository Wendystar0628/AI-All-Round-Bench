import { MAPS } from '../src/data/maps.js';
import { computeAllEntryRoutes, diffEntryRoutes, tileKey, validateConnectivity } from '../src/core/pathfinding.js';

function pathDiffCount(p1, p2) {
  const s1 = new Set(p1.map((t) => `${t.x},${t.y}`));
  const s2 = new Set(p2.map((t) => `${t.x},${t.y}`));
  let symDiff = 0;
  for (const k of s1) if (!s2.has(k)) symDiff++;
  for (const k of s2) if (!s1.has(k)) symDiff++;
  return symDiff;
}

let allPass = true;

for (const map of MAPS) {
  console.log(`\n==================== ${map.name} (${map.id}) ${map.width}x${map.height} ====================`);
  const base = computeAllEntryRoutes(map, null, null);
  console.log('Default routes:');
  for (const e of map.entries) {
    const r = base.routes[e.id];
    if (!r) {
      console.error(`  FAIL: Entry ${e.id} has NO default route!`);
      allPass = false;
    } else {
      const legacySteps = r.path.filter((p) => map.grid[p.y][p.x].type === 'legacy').length;
      console.log(`  ${e.id} (${e.name}) -> Exit ${r.exitId} | len=${r.path.length} cost=${r.cost.toFixed(2)} legacy=${legacySteps} | nodes=${r.path.filter((p) => map.grid[p.y][p.x].type === 'node').map((p) => map.grid[p.y][p.x].nodeId).join(',')}`);
    }
  }

  let hasMultiEntryNode = false;
  for (const node of map.nodes) {
    const ov = { extraBlocked: new Set([tileKey(node.x, node.y)]) };
    const res = validateConnectivity(map, null, ov, []);
    const changed = diffEntryRoutes(base.routes, res.routes);
    if (!res.ok) {
      console.error(`  FAIL: Isolating ${node.id} (${node.name}) alone SEALS entries: ${res.sealedEntries.map((e) => e.id).join(',')}`);
      allPass = false;
      continue;
    }
    if (changed.length === 0) {
      console.error(`  FAIL: Isolating ${node.id} (${node.name}) alone changes ZERO entry routes!`);
      allPass = false;
    }
    if (changed.length >= 2) hasMultiEntryNode = true;

    const details = changed.map((eid) => {
      const oldR = base.routes[eid];
      const newR = res.routes[eid];
      const diff = pathDiffCount(oldR.path, newR.path);
      if (diff < 4) {
        console.error(`  WARN: ${node.id} only changed ${eid} by ${diff} tiles!`);
      }
      return `${eid}: ${oldR.exitId}->${newR.exitId} (len ${oldR.path.length}->${newR.path.length}, cost ${oldR.cost.toFixed(1)}->${newR.cost.toFixed(1)}, symDiff=${diff})`;
    });
    console.log(`  Isolate ${node.id} (${node.name} @ ${node.x},${node.y}): changed [${changed.join(',')}] -> ${details.join(' | ')}`);
  }

  if (!hasMultiEntryNode) {
    console.error(`  FAIL: Map ${map.id} has NO single node that simultaneously reroutes multiple entries!`);
    allPass = false;
  }
}

console.log('\n=== Specific Demo Scenario Checks ===');
// Demo 1: Map 1 isolate N1 -> A traverses DMZ (y=2, x=7)
{
  const m1 = MAPS[0];
  const n1 = m1.nodes.find((n) => n.id === 'N1');
  const res = computeAllEntryRoutes(m1, null, { extraBlocked: new Set([tileKey(n1.x, n1.y)]) });
  const usesDMZ = res.routes.A.path.some((p) => p.y === 2 && p.x === 7);
  console.log(`Demo 1 (Map 1 N1 -> A via DMZ): ${usesDMZ ? 'PASS' : 'FAIL'} | A path y=2 count=${res.routes.A.path.filter((p) => p.y === 2).length}`);
  if (!usesDMZ) allPass = false;
}
// Demo 2: Map 2 isolate N2 -> C & B go to Exit X; un-isolate -> C & B return to Exit Y via legacy
{
  const m2 = MAPS[1];
  const n2 = m2.nodes.find((n) => n.id === 'N2');
  const base = computeAllEntryRoutes(m2, null, null);
  const iso = computeAllEntryRoutes(m2, null, { extraBlocked: new Set([tileKey(n2.x, n2.y)]) });
  const ok = base.routes.C.exitId === 'Y' && base.routes.B.exitId === 'Y' && iso.routes.C.exitId === 'X' && iso.routes.B.exitId === 'X';
  console.log(`Demo 2 (Map 2 N2 switch C&B Y<->X): ${ok ? 'PASS' : 'FAIL'} | base C=${base.routes.C.exitId},B=${base.routes.B.exitId} | iso C=${iso.routes.C.exitId},B=${iso.routes.B.exitId}`);
  if (!ok) allPass = false;
}
// Demo 3: Map 3 Boss locks (10,4),(10,5) -> B & C converge to X
{
  const m3 = MAPS[2];
  const lock = validateConnectivity(m3, null, { extraBlocked: new Set([tileKey(10, 4), tileKey(10, 5)]) }, []);
  const ok = lock.ok && lock.routes.B.exitId === 'X' && lock.routes.C.exitId === 'X';
  console.log(`Demo 3 (Map 3 Boss locks East Ops Ring -> B&C converge X): ${ok ? 'PASS' : 'FAIL'} | B->${lock.routes.B?.exitId}, C->${lock.routes.C?.exitId}`);
  if (!ok) allPass = false;
}

if (!allPass) {
  console.error('\nTOPOLOGY VERIFICATION FAILED!');
  process.exit(1);
} else {
  console.log('\nALL TOPOLOGY & ROUTING CHECKS PASSED PERFECTLY!');
}
