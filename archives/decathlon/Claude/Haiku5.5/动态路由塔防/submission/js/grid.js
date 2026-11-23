// 网格地图与寻路：解析地图字符串，计算各格到出口的最短代价场（流向场）。
(function () {
  const PASSABLE = { link: 1, old: 1, node: 1, entry: 1, exit: 1 };
  const CHAR_TYPE = { '=': 'link', o: 'old', N: 'node', P: 'plat', '#': 'block', '.': 'void' };

  class GridMap {
    constructor(def) {
      this.def = def;
      const rows = def.rows;
      this.w = rows[0].length;
      this.h = rows.length;
      this.n = this.w * this.h;
      this.type = new Array(this.n);
      this.ch = new Array(this.n);
      this.x = new Int16Array(this.n);
      this.y = new Int16Array(this.n);
      this.entries = [];
      this.exits = [];
      this.nodes = [];
      this.plats = [];
      this.links = [];
      this.passable = new Uint8Array(this.n);
      this.adj = [];
      for (let y = 0; y < this.h; y++) {
        if (rows[y].length !== this.w) throw new Error(`${def.id} 第 ${y} 行宽度不一致`);
        for (let x = 0; x < this.w; x++) {
          const i = y * this.w + x;
          const c = rows[y][x];
          this.ch[i] = c;
          this.x[i] = x;
          this.y[i] = y;
          let t;
          if (c === 'A' || c === 'B' || c === 'C') t = 'entry';
          else if (c === 'X' || c === 'Y') t = 'exit';
          else t = CHAR_TYPE[c] || 'void';
          this.type[i] = t;
          if (PASSABLE[t]) this.passable[i] = 1;
          if (t === 'node') this.nodes.push(i);
          if (t === 'plat') this.plats.push(i);
          if (t === 'link' || t === 'old') this.links.push(i);
          if (t === 'entry') this.entries.push({ id: c, cell: i, def: def.entries.find((e) => e.id === c) });
          if (t === 'exit') this.exits.push({ id: c, cell: i, def: def.exits.find((e) => e.id === c) });
        }
      }
      for (let i = 0; i < this.n; i++) {
        const out = [];
        if (this.passable[i]) {
          const x = this.x[i], y = this.y[i];
          const cand = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
          for (const [nx, ny] of cand) {
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
            const j = ny * this.w + nx;
            if (this.passable[j]) out.push(j);
          }
        }
        this.adj.push(out);
      }
    }
    idx(x, y) { return y * this.w + x; }
    isLinkType(i) { return this.type[i] === 'link' || this.type[i] === 'old'; }
    // 与格相邻的可通行格
    neighbors(i) { return this.adj[i]; }
    // 四邻格（不论类型）
    nbrs4(i) {
      const out = [];
      const x = this.x[i], y = this.y[i];
      if (x > 0) out.push(i - 1);
      if (x < this.w - 1) out.push(i + 1);
      if (y > 0) out.push(i - this.w);
      if (y < this.h - 1) out.push(i + this.w);
      return out;
    }
    // 世界坐标（地图中心为原点，格子边长 1）
    worldX(i) { return this.x[i] - (this.w - 1) / 2; }
    worldZ(i) { return this.y[i] - (this.h - 1) / 2; }
  }

  // 反向 Dijkstra：从目标集合出发，求每个格到目标的代价与下一步。
  // passable(i): 当前是否可通行；cost(i): 进入格 i 的代价。
  // 返回 { dist: Float64Array, next: Int32Array }，next 为 -1 表示无路可走。
  function computeField(map, passable, cost, targets) {
    const n = map.n;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    for (const t of targets) {
      if (passable(t)) dist[t] = 0;
    }
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u < 0) break;
      done[u] = 1;
      const cu = cost(u);
      for (const v of map.adj[u]) {
        if (done[v] || !passable(v)) continue;
        const cand = dist[u] + cu;
        if (cand < dist[v] - 1e-9) {
          dist[v] = cand;
          next[v] = u;
        }
      }
    }
    return { dist, next };
  }

  // 沿流向场从起点走到目标，返回格序列（含起点）。
  function walkField(field, start) {
    const path = [start];
    let cur = start;
    let guard = 0;
    while (field.next[cur] >= 0 && guard++ < 1000) {
      cur = field.next[cur];
      path.push(cur);
    }
    return path;
  }

  window.GridMap = GridMap;
  window.GridRouting = { computeField, walkField };
})();
