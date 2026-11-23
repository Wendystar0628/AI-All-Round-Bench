/* 地图校验：在 node 中运行。检查 3.2.1 / 3.2.4 等路由性质 */
'use strict';
require('../js/data.js');
require('../js/route.js');
const TD = globalThis.TD;
const R = TD.Route;

function mkSt(isolated, down, black, locked, pref) {
  return { isolated: isolated || new Set(), down: down || new Set(), black: black || new Set(), locked: locked || new Set(), pref: pref || {} };
}
function prefSet(list) { const o = {}; for (const x of (list || [])) o[x] = true; return o; }

/* 每张地图的入口->出口 分配 */
const ASSIGN = {
  m1: { A: 'X', B: 'X' },
  m2: { A: 'X', C: 'Y', B: 'Y' },
  m3: { A: 'X', B: 'Y', C: 'Y' }
};

let fail = 0;
for (const map of TD.DATA.MAPS) {
  const G = R.build(map);
  const entries = map.nodes.filter(n => n.kind === 'entry').map(n => n.id);
  const exits = map.nodes.filter(n => n.kind === 'exit').map(n => n.id);
  const assign = ASSIGN[map.id] || {};
  console.log('\n=== ' + map.name + ' (' + map.id + ') 节点 ' + map.nodes.length + ' 边 ' + G.edges.length + ' ===');
  const prefByEntry = {};
  for (const e of entries) prefByEntry[e] = prefSet(map.pref && map.pref[e]);
  const base = mkSt(null, null, null, null, prefByEntry);
  const routes = R.entryRoutes(G, map, base, assign);
  for (const e of entries) console.log('  ' + e + ' -> ' + (routes[e] ? routes[e].exit + ' [' + routes[e].path.join('>') + '] cost=' + routes[e].cost.toFixed(1) : '无路'));
  if (entries.some(e => !routes[e])) { console.log('  !! 入口无路'); fail++; }

  // 汇总各波次偏好（按入口）
  const prefSets = [{}];
  for (const w of map.waves) for (const e in w.pref) prefSets.push({ entry: e, set: prefSet(w.pref[e]), assign: w.assign || {} });

  const swNodes = map.nodes.filter(n => n.sw);
  const changedMulti = [], noDefault = [];
  for (const n of swNodes) {
    let okDefault = false, okAny = false, multi = false;
    for (const ps of prefSets) {
      const asg = Object.assign({}, assign, ps.assign);
      const st = mkSt(new Set([n.id]), null, null, null, ps.set ? Object.assign({}, prefByEntry, { [ps.entry]: ps.set }) : prefByEntry);
      const r2 = R.entryRoutes(G, map, st, asg);
      const changed = entries.filter(e => {
        const a = routes[e], b = r2[e];
        if (!b) return true;
        if (!a) return false;
        return a.exit !== b.exit || a.path.join('>') !== b.path.join('>');
      });
      if (!entries.every(e => r2[e])) { console.log('  !! 隔离 ' + n.id + ' 导致某入口无路'); fail++; }
      if (changed.length) { okAny = true; if (!ps.entry) okDefault = true; }
      if (changed.length >= 2) multi = true;
    }
    if (multi) changedMulti.push(n.id);
    if (!okDefault) noDefault.push(n.id);
    if (!okAny) { console.log('  !! ' + n.id + '(' + n.name + '): 任何情况下隔离都不改道'); fail++; }
  }
  console.log('  可隔离交换节点(' + swNodes.length + '): ' + swNodes.map(n => n.id).join(','));
  console.log('  默认状态下即改道: ' + swNodes.filter(n => !noDefault.includes(n.id)).map(n => n.id).join(','));
  console.log('  仅特定波次改道: ' + (noDefault.join(',') || '无'));
  console.log('  同时改变多入口: ' + (changedMulti.join(',') || '无'));
  if (!changedMulti.length) { console.log('  !! 没有节点能同时改变多个入口'); fail++; }
  for (const p of map.platforms) {
    for (const o of (map.obstacles || [])) {
      if (Math.abs(p.x - o.x) < o.w / 2 + 5 && Math.abs(p.y - o.y) < o.h / 2 + 5) { console.log('  !! 平台与障碍重叠', JSON.stringify(p), o.label); fail++; }
    }
    for (const n of map.nodes) if (Math.hypot(p.x - n.x, p.y - n.y) < 9) { console.log('  !! 平台与节点过近', JSON.stringify(p), n.id); fail++; }
  }
  for (const e of G.edges) {
    const A = G.nodes.get(e.a), B = G.nodes.get(e.b);
    for (const o of (map.obstacles || [])) {
      for (let t = 0.05; t < 1; t += 0.05) {
        const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
        if (Math.abs(x - o.x) < o.w / 2 + 2 && Math.abs(y - o.y) < o.h / 2 + 2) { console.log('  !! 道路穿过障碍 ' + e.a + '-' + e.b + ' @' + o.label); fail++; break; }
      }
    }
  }
}
console.log('\n' + (fail ? '发现问题 ' + fail + ' 项' : '全部通过'));
