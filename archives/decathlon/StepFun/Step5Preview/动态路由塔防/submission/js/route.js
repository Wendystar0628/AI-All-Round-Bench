/* 路由：图构建、寻路、改道判定（浏览器与 Node 校验共用） */
(function (g) {
'use strict';
const TD = g.TD || (g.TD = {});

function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

function build(map) {
  const nodes = new Map(), adj = new Map(), edges = [];
  for (const n of map.nodes) { nodes.set(n.id, n); adj.set(n.id, []); }
  for (const e of map.edges) {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    if (!A || !B) continue;
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const ed = { a: e.a, b: e.b, len, legacy: !!e.legacy, tunnel: !!e.tunnel, id: key(e.a, e.b), mid: [(A.x + B.x) / 2, (A.y + B.y) / 2] };
    edges.push(ed);
    adj.get(e.a).push({ to: e.b, ed });
    adj.get(e.b).push({ to: e.a, ed });
  }
  return { map, nodes, adj, edges };
}

/* st: {isolated:Set, locked:Set, black:Set(edgeId), down:Set(edgeId), pref:{nodeId:true}} */
function nodeBlocked(G, id, st) {
  return st.isolated.has(id) || st.locked.has(id);
}
function edgeUsable(G, ed, st) {
  if (nodeBlocked(G, ed.a, st) || nodeBlocked(G, ed.b, st)) return false;
  if (st.black.has(ed.id)) return false;
  return true;
}
function edgeCost(G, ed, st) {
  let c = ed.len;
  if (ed.legacy) c *= 1.5;
  if (st.down.has(ed.id)) c *= 1.5;
  if (ed.tunnel) c *= 0.82;
  return c;
}
function nodeCost(G, id, st, pref) {
  return (pref && pref[id]) ? 0 : 26;
}

/* Dijkstra：从 start 到最近/指定出口。pref 为该入口的偏好节点集合 */
function dijkstra(G, start, exits, st, wantExit, pref) {
  const dist = new Map(), prev = new Map();
  dist.set(start, 0);
  const visited = new Set();
  const pq = [[0, start]];
  let best = null;
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, id] = pq.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (exits.has(id)) {
      if (!wantExit || id === wantExit) { best = id; break; }
      if (!best) best = id;
    }
    for (const nb of G.adj.get(id)) {
      if (!edgeUsable(G, nb.ed, st)) continue;
      if (nodeBlocked(G, nb.to, st)) continue;
      const nd = d + edgeCost(G, nb.ed, st) + nodeCost(G, nb.to, st, pref);
      if (nd < (dist.get(nb.to) ?? Infinity)) {
        dist.set(nb.to, nd); prev.set(nb.to, id);
        pq.push([nd, nb.to]);
      }
    }
  }
  if (!best) return null;
  const path = [best];
  let cur = best, guard = 0;
  while (cur !== start) {
    cur = prev.get(cur);
    if (cur === undefined || guard++ > 500) return null;
    path.unshift(cur);
  }
  return { exit: best, path, cost: dist.get(best) };
}

/* 各入口当前路由。st.pref: {entryId:{nodeId:true}} */
function entryRoutes(G, map, st, assign) {
  const exits = new Set(map.nodes.filter(n => n.kind === 'exit').map(n => n.id));
  const out = {};
  for (const n of map.nodes) {
    if (n.kind !== 'entry') continue;
    const want = assign ? assign[n.id] : null;
    const pref = st.pref ? st.pref[n.id] : null;
    let r = dijkstra(G, n.id, exits, st, want, pref);
    if (!r && want) r = dijkstra(G, n.id, exits, st, null, pref);
    out[n.id] = r;
  }
  return out;
}

/* 从某节点到指定出口（供场上敌人重新寻路） */
function pathFrom(G, fromId, assign, st, entryId) {
  const exits = new Set();
  for (const [, n] of G.nodes) if (n.kind === 'exit') exits.add(n.id);
  const pref = st.pref && entryId ? st.pref[entryId] : null;
  let r = dijkstra(G, fromId, exits, st, assign || null, pref);
  if (!r && assign) r = dijkstra(G, fromId, exits, st, null, pref);
  return r;
}

function sig(routes) {
  const o = {};
  for (const k in routes) o[k] = routes[k] ? routes[k].exit + ':' + routes[k].path.join('>') : 'none';
  return JSON.stringify(o);
}

TD.Route = { build, key, nodeBlocked, edgeUsable, edgeCost, nodeCost, dijkstra, entryRoutes, pathFrom, sig };
})(typeof window !== 'undefined' ? window : globalThis);
