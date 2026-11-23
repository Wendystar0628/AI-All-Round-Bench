/* 路由引擎：网格解析、代价场（多源 Dijkstra）、路线追踪、连通性校验。
 * 纯逻辑，浏览器与 Node 共用。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const C = ND.CELL;

  function cellType(ch) {
    switch (ch) {
      case '#': return C.OBSTACLE;
      case '=': return C.LINK;
      case '-': return C.LEGACY;
      case 'o': return C.NODE;
      case 'P': return C.PLATFORM;
      case 'A': case 'B': case 'C': return C.ENTRY;
      case 'X': case 'Y': return C.EXIT;
      default: return C.VOID;
    }
  }
  function isRoadType(t) { return t === C.LINK || t === C.LEGACY || t === C.NODE || t === C.ENTRY || t === C.EXIT; }

  ND.Routing = {
    build(mapDef) {
      const rows = mapDef.grid, h = rows.length, w = rows[0].length;
      const cells = [];
      const g = { w, h, cells, nodes: [], entries: [], exits: [], platforms: [], links: [], def: mapDef };
      for (let y = 0; y < h; y++) {
        if (rows[y].length !== w) throw new Error('grid row width mismatch ' + mapDef.id + ' row ' + y);
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          const t = cellType(ch);
          const cell = { i: y * w + x, x, y, ch, type: t, road: isRoadType(t) };
          if (t === C.ENTRY) { cell.entry = ch; g.entries.push(cell); }
          if (t === C.EXIT) { cell.exit = ch; g.exits.push(cell); }
          if (t === C.NODE) g.nodes.push(cell);
          if (t === C.PLATFORM) g.platforms.push(cell);
          if (t === C.LINK || t === C.LEGACY) g.links.push(cell);
          cells.push(cell);
        }
      }
      g.entryMap = {}; g.entries.forEach(e => g.entryMap[e.entry] = e);
      g.exitMap = {}; g.exits.forEach(e => g.exitMap[e.exit] = e);
      // 邻接表（仅道路格）
      g.adj = cells.map(c => {
        if (!c.road) return [];
        const out = [];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx, ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = cells[ny * w + nx];
          if (n.road) out.push(n.i);
        }
        return out;
      });
      return g;
    },

    cellCost(g, i, legacySet) {
      const c = g.cells[i];
      if (c.type === C.LEGACY) return ND.LEGACY_COST;
      if (legacySet && legacySet.has(i)) return ND.LEGACY_COST;
      return 1;
    },
    isLegacy(g, i, legacySet) {
      return g.cells[i].type === C.LEGACY || (legacySet && legacySet.has(i));
    },

    /* 多源 Dijkstra：从所有出口反向扩展。blocked: Set(不可通行格)。
     * 返回 {dist, next}；next[i] 为 i 沿最短路走向的下一格。 */
    field(g, blocked, legacySet) {
      const n = g.cells.length;
      const dist = new Float64Array(n).fill(Infinity);
      const next = new Int32Array(n).fill(-1);
      const done = new Uint8Array(n);
      const pq = []; // [dist, idx] 简单二叉堆
      const push = (d, i) => {
        pq.push([d, i]);
        let k = pq.length - 1;
        while (k > 0) { const p = (k - 1) >> 1; if (pq[p][0] <= pq[k][0]) break; const t = pq[p]; pq[p] = pq[k]; pq[k] = t; k = p; }
      };
      const pop = () => {
        const top = pq[0], last = pq.pop();
        if (pq.length) {
          pq[0] = last;
          let k = 0;
          for (;;) {
            let l = 2 * k + 1, r = l + 1, m = k;
            if (l < pq.length && pq[l][0] < pq[m][0]) m = l;
            if (r < pq.length && pq[r][0] < pq[m][0]) m = r;
            if (m === k) break;
            const t = pq[m]; pq[m] = pq[k]; pq[k] = t; k = m;
          }
        }
        return top;
      };
      for (const e of g.exits) {
        if (blocked && blocked.has(e.i)) continue;
        dist[e.i] = 0; push(0, e.i);
      }
      while (pq.length) {
        const [d, u] = pop();
        if (done[u]) continue;
        done[u] = 1;
        for (const v of g.adj[u]) {
          if (blocked && blocked.has(v)) continue;
          const nd = d + this.cellCost(g, v, legacySet);
          if (nd < dist[v] - 1e-9) { dist[v] = nd; next[v] = u; push(nd, v); }
        }
      }
      return { dist, next };
    },

    trace(g, field, start) {
      const path = [];
      let cur = start, guard = 0;
      if (!isFinite(field.dist[cur])) return null;
      while (cur !== -1 && guard++ < 2000) {
        path.push(cur);
        const c = g.cells[cur];
        if (c.type === C.EXIT) break;
        cur = field.next[cur];
      }
      return path;
    },

    entryRoutes(g, field) {
      const out = {};
      for (const e of g.entries) out[e.entry] = this.trace(g, field, e.i);
      return out;
    },
    routeKey(path) { return path ? path.join(',') : 'null'; },

    /* 连通性：所有入口与给定场上地面敌人位置都必须可达至少一个出口 */
    connected(g, field, extraCells) {
      for (const e of g.entries) if (!isFinite(field.dist[e.i])) return { ok: false, cell: e.i, why: 'entry' };
      if (extraCells) for (const i of extraCells) if (!isFinite(field.dist[i])) return { ok: false, cell: i, why: 'enemy' };
      return { ok: true };
    },

    /* 评估一次通行变化：返回新场、新路线、变化的入口、连通性 */
    evaluate(g, blocked, legacySet, extraCells) {
      const f = this.field(g, blocked, legacySet);
      const conn = this.connected(g, f, extraCells);
      const routes = this.entryRoutes(g, f);
      return { field: f, connected: conn, routes };
    },

    changedEntries(oldRoutes, newRoutes) {
      const changed = [];
      for (const k of Object.keys(newRoutes)) {
        if (this.routeKey(oldRoutes[k]) !== this.routeKey(newRoutes[k])) changed.push(k);
      }
      return changed;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ND;
})(typeof window !== 'undefined' ? window : globalThis);