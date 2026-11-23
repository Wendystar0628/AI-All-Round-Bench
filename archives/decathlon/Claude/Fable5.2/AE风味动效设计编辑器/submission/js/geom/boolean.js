// 多边形布尔运算：线段排布 + 环绕数分类 + 边链接。输入为折线轮廓，支持并集/交集/差集/异或
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});

  function ruleFn(rule) {
    if (rule === 'evenodd') return (w) => (w & 1) !== 0;
    if (rule === 'positive') return (w) => w > 0;
    return (w) => w !== 0;
  }

  // groups: [{polys:[{pts}], rule}]（最多两组），classify(inA,inB)->bool
  function run(groups, classify, grid) {
    // --- 自动网格 ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, total = 0;
    for (const g of groups) for (const p of g.polys) { const a = p.pts; total += a.length >> 1; for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
    if (!total || !isFinite(minX)) return [];
    const ext = Math.max(maxX - minX, maxY - minY, 1e-9);
    if (!grid) grid = Math.pow(2, Math.ceil(Math.log2(ext / 4194304)));
    const inv = 1 / grid, tol = grid * 1.5;
    const ox = Math.floor(minX * inv) - 4, oy = Math.floor(minY * inv) - 4;
    const vmap = new Map(), vx = [], vy = [];
    function vid(x, y) {
      const kx = Math.round(x * inv) - ox, ky = Math.round(y * inv) - oy;
      const key = kx * 67108864 + ky;
      let id = vmap.get(key);
      if (id === undefined) { id = vx.length; vmap.set(key, id); vx.push((kx + ox) * grid); vy.push((ky + oy) * grid); }
      return id;
    }
    // --- 线段 ---
    const sa = [], sb = [], sg = [];
    groups.forEach((g, gi) => {
      for (const p of g.polys) {
        const a = p.pts, n = a.length >> 1; if (n < 3) continue;
        let prev = vid(a[(n - 1) * 2], a[(n - 1) * 2 + 1]);
        for (let i = 0; i < n; i++) { const cur = vid(a[i * 2], a[i * 2 + 1]); if (cur !== prev) { sa.push(prev); sb.push(cur); sg.push(gi); } prev = cur; }
      }
    });
    const ns = sa.length; if (!ns) return [];
    const splits = new Array(ns);
    const order = new Array(ns), mnx = new Float64Array(ns), mxx = new Float64Array(ns), mny = new Float64Array(ns), mxy = new Float64Array(ns);
    for (let i = 0; i < ns; i++) {
      order[i] = i; const ax = vx[sa[i]], bx = vx[sb[i]], ay = vy[sa[i]], by = vy[sb[i]];
      mnx[i] = Math.min(ax, bx) - tol; mxx[i] = Math.max(ax, bx) + tol; mny[i] = Math.min(ay, by) - tol; mxy[i] = Math.max(ay, by) + tol;
    }
    order.sort((p, q) => mnx[p] - mnx[q]);
    const addSplit = (i, t, id) => { (splits[i] = splits[i] || []).push(t, id); };
    for (let oi = 0; oi < ns; oi++) {
      const i = order[oi], imax = mxx[i];
      const a = sa[i], b = sb[i], ax = vx[a], ay = vy[a], bx = vx[b], by = vy[b];
      const rX = bx - ax, rY = by - ay, lenR = Math.hypot(rX, rY);
      for (let oj = oi + 1; oj < ns; oj++) {
        const j = order[oj];
        if (mnx[j] > imax) break;
        if (mny[j] > mxy[i] || mxy[j] < mny[i]) continue;
        const c = sa[j], d = sb[j];
        if ((a === c && b === d) || (a === d && b === c)) continue;
        const cx = vx[c], cy = vy[c], dx = vx[d], dy = vy[d];
        const sX = dx - cx, sY = dy - cy, lenS = Math.hypot(sX, sY);
        const den = rX * sY - rY * sX;
        const qx = cx - ax, qy = cy - ay;
        if (Math.abs(den) < 1e-12 * lenR * lenS + 1e-300) {
          // 平行：检查共线重叠
          if (Math.abs(qx * rY - qy * rX) / lenR > tol) continue;
          const tc = (qx * rX + qy * rY) / (lenR * lenR), td = ((dx - ax) * rX + (dy - ay) * rY) / (lenR * lenR);
          const e1 = tol / lenR;
          if (tc > e1 && tc < 1 - e1 && c !== a && c !== b) addSplit(i, tc, c);
          if (td > e1 && td < 1 - e1 && d !== a && d !== b) addSplit(i, td, d);
          const ua = ((ax - cx) * sX + (ay - cy) * sY) / (lenS * lenS), ub = ((bx - cx) * sX + (by - cy) * sY) / (lenS * lenS);
          const e2 = tol / lenS;
          if (ua > e2 && ua < 1 - e2 && a !== c && a !== d) addSplit(j, ua, a);
          if (ub > e2 && ub < 1 - e2 && b !== c && b !== d) addSplit(j, ub, b);
          continue;
        }
        const t = (qx * sY - qy * sX) / den, u = (qx * rY - qy * rX) / den;
        const et = tol / lenR, eu = tol / lenS;
        if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
        let id;
        if (t <= et) id = a; else if (t >= 1 - et) id = b; else if (u <= eu) id = c; else if (u >= 1 - eu) id = d;
        else id = vid(ax + t * rX, ay + t * rY);
        if (id !== a && id !== b) addSplit(i, t, id);
        if (id !== c && id !== d) addSplit(j, u, id);
      }
    }
    // --- 唯一边 ---
    const emap = new Map(), eu_ = [], ev_ = [], dA = [], dB = [];
    function addEdge(p, q, g) {
      if (p === q) return;
      const lo = p < q ? p : q, hi = p < q ? q : p, key = lo * 4294967296 + hi;
      let e = emap.get(key);
      if (e === undefined) { e = eu_.length; emap.set(key, e); eu_.push(lo); ev_.push(hi); dA.push(0); dB.push(0); }
      const s = p < q ? 1 : -1;
      if (g === 0) dA[e] += s; else dB[e] += s;
    }
    for (let i = 0; i < ns; i++) {
      const sp = splits[i];
      if (!sp) { addEdge(sa[i], sb[i], sg[i]); continue; }
      const m = sp.length >> 1, idx = new Array(m);
      for (let k = 0; k < m; k++) idx[k] = k;
      idx.sort((p, q) => sp[p * 2] - sp[q * 2]);
      let prev = sa[i];
      for (let k = 0; k < m; k++) { const id = sp[idx[k] * 2 + 1]; if (id !== prev) { addEdge(prev, id, sg[i]); prev = id; } }
      addEdge(prev, sb[i], sg[i]);
    }
    const ne = eu_.length;
    // --- y 条带加速 ---
    const NS = Math.max(1, Math.min(512, Math.ceil(Math.sqrt(ne) * 1.5)));
    const y0 = minY - tol * 4, sh = (maxY - minY + tol * 8) / NS || 1;
    const strips = new Array(NS); for (let i = 0; i < NS; i++) strips[i] = [];
    for (let e = 0; e < ne; e++) {
      if (!dA[e] && !dB[e]) continue;
      const ya = vy[eu_[e]], yb = vy[ev_[e]];
      if (ya === yb) continue;
      const s0 = MF.clamp(Math.floor((Math.min(ya, yb) - y0) / sh), 0, NS - 1), s1 = MF.clamp(Math.floor((Math.max(ya, yb) - y0) / sh), 0, NS - 1);
      for (let s = s0; s <= s1; s++) strips[s].push(e);
    }
    const fA = ruleFn(groups[0].rule), fB = ruleFn(groups[1] ? groups[1].rule : 'nonzero');
    const eps = grid * 6;
    // --- 分类并定向 ---
    const rs = [], re = [];
    for (let e = 0; e < ne; e++) {
      const da = dA[e], db = dB[e];
      if (!da && !db) continue;
      const u = eu_[e], v = ev_[e];
      const x1 = vx[u], y1 = vy[u], x2 = vx[v], y2 = vy[v];
      const ex = x2 - x1, ey = y2 - y1, len = Math.hypot(ex, ey);
      const off = Math.min(eps, len * 0.25 + grid);
      const px = (x1 + x2) / 2 - (ey / len) * off, py = (y1 + y2) / 2 + (ex / len) * off;
      let wA = 0, wB = 0;
      const st = strips[MF.clamp(Math.floor((py - y0) / sh), 0, NS - 1)];
      for (let k = 0; k < st.length; k++) {
        const f = st[k], a = eu_[f], b = ev_[f];
        const ya = vy[a], yb = vy[b];
        if ((ya <= py) === (yb <= py)) continue;
        const xi = vx[a] + ((py - ya) / (yb - ya)) * (vx[b] - vx[a]);
        if (xi > px) { const dir = yb > ya ? 1 : -1; wA += dir * dA[f]; wB += dir * dB[f]; }
      }
      const inL = classify(fA(wA), fB(wB)), inR = classify(fA(wA - da), fB(wB - db));
      if (inL === inR) continue;
      if (inL) { rs.push(u); re.push(v); } else { rs.push(v); re.push(u); }
    }
    // --- 链接成环（内部在左，选最左转）---
    const nr = rs.length, out = new Map();
    const ang = new Float64Array(nr), used = new Uint8Array(nr);
    for (let i = 0; i < nr; i++) {
      ang[i] = Math.atan2(vy[re[i]] - vy[rs[i]], vx[re[i]] - vx[rs[i]]);
      let l = out.get(rs[i]); if (!l) out.set(rs[i], (l = [])); l.push(i);
    }
    const loops = [], TWO = Math.PI * 2;
    for (let s = 0; s < nr; s++) {
      if (used[s]) continue;
      const chain = []; let cur = s, ok = false, guard = 0;
      while (guard++ < nr + 5) {
        used[cur] = 1; chain.push(cur);
        const end = re[cur];
        if (end === rs[s]) { ok = true; break; }
        const cand = out.get(end); if (!cand) break;
        const back = ang[cur] + Math.PI;
        let best = -1, bd = Infinity;
        for (const c of cand) {
          if (used[c]) continue;
          let d = (back - ang[c]) % TWO; if (d < 0) d += TWO; if (d < 1e-9) d = TWO;
          if (d < bd) { bd = d; best = c; }
        }
        if (best < 0) break;
        cur = best;
      }
      if (!ok || chain.length < 3) continue;
      const pts = [];
      for (const c of chain) pts.push(vx[rs[c]], vy[rs[c]]);
      const cl = cleanLoop(pts, grid);
      if (cl.length >= 6 && Math.abs(area(cl)) > grid * grid * 16) loops.push({ pts: cl, closed: true });
    }
    return loops;
  }
  function area(p) { let s = 0; const n = p.length; for (let i = 0, j = n - 2; i < n; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1]; return s / 2; }
  // 去掉共线点
  function cleanLoop(p, grid) {
    const n = p.length >> 1; if (n < 3) return p;
    const o = [], e2 = grid * grid * 0.25;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const ax = p[a * 2], ay = p[a * 2 + 1], x = p[i * 2], y = p[i * 2 + 1], bx = p[b * 2], by = p[b * 2 + 1];
      const cr = (x - ax) * (by - ay) - (y - ay) * (bx - ax), dot = (x - ax) * (bx - x) + (y - ay) * (by - y);
      const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      if (dot > 0 && cr * cr <= e2 * l2 * 0.01) continue;
      o.push(x, y);
    }
    return o.length >= 6 ? o : p;
  }

  const MODES = {
    union: (a, b) => a || b, intersect: (a, b) => a && b, difference: (a, b) => a && !b, xor: (a, b) => a !== b,
  };
  MF.Bool = {
    area,
    // A、B 为轮廓数组 [{pts, closed}]；非闭合轮廓被忽略
    op(A, B, mode, ruleA, ruleB, grid) {
      const fa = (A || []).filter((c) => c.closed !== false && c.pts.length >= 6), fb = (B || []).filter((c) => c.closed !== false && c.pts.length >= 6);
      return run([{ polys: fa, rule: ruleA || 'nonzero' }, { polys: fb, rule: ruleB || 'nonzero' }], MODES[mode] || MODES.union, grid);
    },
    union(polys, grid, rule) {
      const f = (polys || []).filter((c) => c.closed !== false && c.pts.length >= 6);
      return run([{ polys: f, rule: rule || 'nonzero' }], (a) => a, grid);
    },
    // 规范化：外轮廓面积为正、孔为负（内部在左）
    normalize(polys, rule) { return MF.Bool.union(polys, 0, rule || 'evenodd'); },
  };
})();
