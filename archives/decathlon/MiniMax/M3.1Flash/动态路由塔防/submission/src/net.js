/* =========================================================================
 *  动态路由塔防 · 网络与路由
 *  net.js — 拓扑构建 / 最短路 / 隔离与改道 / 连通性保障
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const CELL = 2.4;
  const OLD_FACTOR = 1.35;   // 旧链路的通行惩罚（敌人也会考虑）
  const TIER_H = 0.85;       // 每层高度差

  /* ---------------- 构建拓扑 ---------------- */
  function build(mapDef) {
    const net = {
      def: mapDef,
      cols: mapDef.cols, rows: mapDef.rows,
      cell: CELL,
      v: {}, vlist: [], edges: [], edgeMap: {},
      obstacles: {}, platforms: {},
      entries: [], exits: [], switches: []
    };

    mapDef.vertices.forEach((vd) => {
      const v = {
        id: vd.id, kind: vd.kind, name: vd.name || vd.id,
        gx: vd.x, gy: vd.y, x: 0, y: 0, z: 0, h: vd.h || 0.35,
        color: vd.color || null, edges: [], tierSum: 0, tierN: 0
      };
      net.v[vd.id] = v; net.vlist.push(v);
      if (v.kind === 'entry') net.entries.push(v);
      else if (v.kind === 'exit') net.exits.push(v);
      else if (v.kind === 'switch') net.switches.push(v);
    });

    mapDef.edges.forEach((ed, i) => {
      const a = net.v[ed.a], b = net.v[ed.b];
      const cells = ed.path.map((p) => ({ gx: p[0], gy: p[1] }));
      const edge = {
        id: i, a: a.id, b: b.id, kind: ed.kind || 'normal', tier: ed.tier || 0,
        w: ed.w === undefined ? 1 : ed.w, cells,
        segs: cells.length - 1, blocked: false, degraded: false
      };
      edge.cost = edge.segs * edge.w * (edge.kind === 'old' ? OLD_FACTOR : 1);
      net.edges.push(edge); net.edgeMap[a.id + '|' + b.id] = edge;
      a.edges.push(edge); b.edges.push(edge);
      a.tierSum += edge.tier; a.tierN++;
      b.tierSum += edge.tier; b.tierN++;
    });

    // 顶点高度 = 相邻链路层级均值（形成自然的立体悬浮）
    net.vlist.forEach((v) => {
      const avg = v.tierN ? v.tierSum / v.tierN : 0;
      v.h = 0.35 + avg * TIER_H;
    });

    // 网格 -> 世界坐标
    const halfW = (net.cols - 1) / 2, halfH = (net.rows - 1) / 2;
    function place(v) {
      v.x = (v.gx - halfW) * CELL;
      v.z = (v.gy - halfH) * CELL;
      v.y = v.h;
    }
    net.vlist.forEach(place);

    // 每条边的路径点（含高度）
    net.edges.forEach((e) => {
      const A = net.v[e.a], B = net.v[e.b];
      e.pts = e.cells.map((c, i) => {
        const t = e.cells.length > 1 ? i / (e.cells.length - 1) : 0;
        const x = (c.gx - halfW) * CELL, z = (c.gy - halfH) * CELL;
        const y = A.h + (B.h - A.h) * t;
        return { x, y, z, gx: c.gx, gy: c.gy };
      });
      e.len = 0;
      for (let i = 1; i < e.pts.length; i++) {
        const p = e.pts[i - 1], q = e.pts[i];
        e.len += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      }
    });

    // 障碍与平台
    (mapDef.obstacles || []).forEach((o) => {
      net.obstacles[o.x + ',' + o.y] = o;
    });
    (mapDef.platforms || []).forEach((p) => {
      net.platforms[p.x + ',' + p.y] = p;
    });

    // 网格占用信息：某格属于哪些链路
    net.cellEdges = {};
    net.edges.forEach((e) => {
      e.cells.forEach((c) => {
        const k = c.gx + ',' + c.gy;
        (net.cellEdges[k] = net.cellEdges[k] || []).push(e);
      });
    });

    net.pref = mapDef.entryPref || {};
    return net;
  }

  /* ---------------- 通行状态 ---------------- */
  // 隔离节点集合 / 被封锁链路集合（ Boss 黑洞、锁死段）
  function passable(edge, st) {
    if (edge.blocked) return false;
    if (st && st.blockedEdges && st.blockedEdges[edge.id]) return false;
    return true;
  }
  function vertexOpen(v, st) {
    if (st && st.isolatedNodes && st.isolatedNodes[v.id]) return false;
    return true;
  }

  /* ---------------- Dijkstra ---------------- */
  function dijkstra(net, st, srcId, dstId) {
    const dist = {}, prev = {}, seen = {};
    dist[srcId] = 0;
    const queue = [[0, srcId]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const cur = queue.shift();
      const [d, id] = cur;
      if (seen[id]) continue;
      seen[id] = true;
      if (id === dstId) break;
      const v = net.v[id];
      if (!v) continue;
      for (let i = 0; i < v.edges.length; i++) {
        const e = v.edges[i];
        if (!passable(e, st)) continue;
        const other = e.a === id ? e.b : e.a;
        const ov = net.v[other];
        if (!vertexOpen(ov, st)) continue;
        const nd = d + e.cost;
        if (dist[other] === undefined || nd < dist[other] - 1e-6) {
          dist[other] = nd;
          prev[other] = e;
          queue.push([nd, other]);
        }
      }
    }
    if (dist[dstId] === undefined) return null;
    // 回溯
    const verts = [dstId], edges = [];
    let cur = dstId;
    while (cur !== srcId) {
      const e = prev[cur];
      if (!e) return null;
      edges.unshift(e);
      cur = e.a === cur ? e.b : e.a;
      verts.unshift(cur);
    }
    return { cost: dist[dstId], verts: verts, edges: edges };
  }

  /* ---------------- 路线计算 ---------------- */
  function routeFor(net, st, entryId) {
    const pref = net.pref[entryId] || [];
    const exits = pref.length ? pref.map((id) => net.v[id]).filter(Boolean) : net.exits;
    for (let i = 0; i < exits.length; i++) {
      const r = dijkstra(net, st, entryId, exits[i].id);
      if (r) return buildRoute(net, r);
    }
    // 偏好出口不可达时，退回任一可达出口
    for (let i = 0; i < net.exits.length; i++) {
      const r = dijkstra(net, st, entryId, net.exits[i].id);
      if (r) return buildRoute(net, r);
    }
    return null;
  }

  function buildRoute(net, r) {
    const pts = [];
    r.edges.forEach((e, idx) => {
      const fwd = e.a === r.verts[idx];
      const seq = fwd ? e.pts : e.pts.slice().reverse();
      for (let i = 0; i < seq.length; i++) {
        if (i === 0 && idx > 0) continue; // 与上一条边首尾重合
        pts.push({ x: seq[i].x, y: seq[i].y, z: seq[i].z, gx: seq[i].gx, gy: seq[i].gy, e: e.id });
      }
    });
    // 累计长度
    let total = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      total += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      cum.push(total);
    }
    return {
      verts: r.verts, edges: r.edges.map((e) => e.id), pts: pts, cum: cum,
      len: total, cost: r.cost, exit: r.verts[r.verts.length - 1]
    };
  }

  function computeRoutes(net, st) {
    const out = {};
    net.entries.forEach((e) => {
      out[e.id] = routeFor(net, st, e.id);
    });
    return out;
  }

  /* ---------------- 连通性检查 ---------------- */
  // 假设隔离某些节点后，是否有入口失去全部可达出口
  function strandedEntries(net, st, extraIsolated) {
    const st2 = { isolatedNodes: Object.assign({}, st ? st.isolatedNodes : {}), blockedEdges: st ? st.blockedEdges : {} };
    Object.assign(st2.isolatedNodes, extraIsolated || {});
    const bad = [];
    net.entries.forEach((e) => {
      const r = routeFor(net, st2, e.id);
      if (!r) bad.push(e);
    });
    return bad;
  }

  // 场上敌人是否会因为改道而无路可走（近似：任一入口仍有可达出口即可）
  function wouldStrand(net, st, extraIsolated) {
    return strandedEntries(net, st, extraIsolated);
  }

  /* ---------------- 路线差异 ---------------- */
  function sameRoute(a, b) {
    if (!a || !b) return a === b;
    if (a.verts.length !== b.verts.length) return false;
    for (let i = 0; i < a.verts.length; i++) if (a.verts[i] !== b.verts[i]) return false;
    return true;
  }

  /* ---------------- 网格工具 ---------------- */
  function edgeAtCell(net, gx, gy, tierMin) {
    const list = net.cellEdges[gx + ',' + gy];
    if (!list) return null;
    // 就近取一条非旧链路（或等级最高的一条）
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (tierMin !== undefined && e.tier < tierMin) continue;
      if (!best || (e.kind === 'normal' && best.kind === 'old')) best = e;
    }
    return best;
  }

  function edgeBetween(net, aId, bId) {
    return net.edgeMap[aId + '|' + bId] || net.edgeMap[bId + '|' + aId] || null;
  }

  /* ---------------- 开发期校验 ---------------- */
  function validate(net) {
    const issues = [];
    const st0 = { isolatedNodes: {}, blockedEdges: {} };
    const base = computeRoutes(net, st0);
    net.entries.forEach((e) => {
      if (!base[e.id]) issues.push('入口 ' + e.id + ' 在初始状态下无可达出口');
    });
    // 每个交换节点被单独隔离后，至少一个入口的路线必须改变
    net.switches.forEach((s) => {
      const st = { isolatedNodes: { [s.id]: true }, blockedEdges: {} };
      const after = computeRoutes(net, st);
      let changed = false, lost = false;
      net.entries.forEach((e) => {
        if (!after[e.id]) lost = true;
        if (!sameRoute(base[e.id], after[e.id])) changed = true;
      });
      if (lost) issues.push('隔离 ' + s.id + ' 会使入口失去出口');
      if (!changed) issues.push('隔离 ' + s.id + ' 未改变任何入口路线');
    });
    return issues;
  }

  RT.Net = {
    CELL, OLD_FACTOR, build, dijkstra, routeFor, computeRoutes, buildRoute,
    strandedEntries, wouldStrand, sameRoute, edgeAtCell, edgeBetween, validate,
    passable, vertexOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
