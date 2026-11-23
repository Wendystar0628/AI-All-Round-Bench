/* 网络安全攻防战 — 路由计算（按通行时间的最短路）与连通性校验 */
(function (root) {
  'use strict';
  const TD = root.TD;

  // 简单二叉堆
  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop(); const n = k.length;
      if (n > 0) {
        let i = 0;
        for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
  }

  /**
   * 计算路由场。
   * grid: parseMap 结果；pass(i) -> 是否可通行；cost(i) -> 该格通行时间系数
   * 返回 { dist: Float64Array, next: Int32Array, exit: Array }
   */
  TD.computeField = function (grid, pass, cost) {
    const n = grid.cells.length;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const exitOf = new Array(n).fill(null);
    const heap = new Heap();
    for (const ex of grid.exits) { if (!pass(ex.i)) continue; dist[ex.i] = 0; exitOf[ex.i] = ex.id; heap.push(0, ex.i); }
    const done = new Uint8Array(n);
    while (heap.size) {
      const u = heap.pop();
      if (done[u]) continue; done[u] = 1;
      const cu = grid.cells[u], du = dist[u], ku = cost(u);
      for (let d = 0; d < 4; d++) {
        const v = cu.nb[d];
        if (v < 0 || done[v] || !grid.cells[v].walk || !pass(v)) continue;
        const nd = du + (ku + cost(v)) * 0.5;
        if (nd < dist[v] - 1e-9) { dist[v] = nd; next[v] = u; exitOf[v] = exitOf[u]; heap.push(nd, v); }
      }
    }
    return { dist, next, exit: exitOf };
  };

  // 沿路由场提取某格出发的路线
  TD.traceRoute = function (field, start) {
    const cells = [];
    if (!isFinite(field.dist[start])) return null;
    let c = start, guard = 0;
    while (c >= 0 && guard++ < 4000) { cells.push(c); c = field.next[c]; }
    return { cells, cost: field.dist[start], exit: field.exit[start] };
  };

  // 不可通行格上的单位：找最优的可通行邻格
  TD.bestNeighbor = function (grid, field, pass, cost, i) {
    const c = grid.cells[i]; let best = -1, bd = Infinity;
    for (let d = 0; d < 4; d++) {
      const v = c.nb[d];
      if (v < 0 || !grid.cells[v].walk || !pass(v)) continue;
      const nd = field.dist[v] + (cost(i) + cost(v)) * 0.5;
      if (nd < bd) { bd = nd; best = v; }
    }
    return best;
  };

  // 广度优先：从 start 在可通行格内寻找满足 goal(i) 的最近格，返回路径（不含 start）
  TD.bfsPath = function (grid, pass, start, goal, maxDepth) {
    const n = grid.cells.length;
    const prev = new Int32Array(n).fill(-2);
    const depth = new Int16Array(n);
    const q = [start]; prev[start] = -1;
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      if (u !== start && goal(u)) { const path = []; let c = u; while (c !== start) { path.push(c); c = prev[c]; } path.reverse(); return path; }
      if (goal(u) && u === start) return [];
      if (depth[u] >= maxDepth) continue;
      const cu = grid.cells[u];
      for (let d = 0; d < 4; d++) {
        const v = cu.nb[d];
        if (v < 0 || prev[v] !== -2 || !grid.cells[v].walk || !pass(v)) continue;
        prev[v] = u; depth[v] = depth[u] + 1; q.push(v);
      }
    }
    return null;
  };

  // 两条路线的差异格数
  TD.routeDiff = function (a, b) {
    if (!a || !b) return 999;
    const sb = new Set(b.cells); let diff = 0;
    for (const c of a.cells) if (!sb.has(c)) diff++;
    return diff;
  };
})(typeof window !== 'undefined' ? window : globalThis);
