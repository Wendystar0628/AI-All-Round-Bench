// 三角剖分（带孔耳切法）、网格细分、边界环提取
// Mesh2: { type:'mesh2', verts: Float64Array(2n), tris: Uint32Array(3m), loops: [[i0,i1,...], ...] }
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});

  // ---------------- 耳切（参照经典 earcut 算法思路自行实现的精简版） ----------------
  function Node(i, x, y) { this.i = i; this.x = x; this.y = y; this.prev = null; this.next = null; this.steiner = false; }
  function insertNode(i, x, y, last) { const p = new Node(i, x, y); if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; } return p; }
  function removeNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }
  function signedArea(d, s, e) { let sum = 0; for (let i = s, j = e - 2; i < e; i += 2) { sum += (d[j] - d[i]) * (d[i + 1] + d[j + 1]); j = i; } return sum; }
  function linkedList(d, s, e, cw, base) {
    let last = null;
    if (cw === signedArea(d, s, e) > 0) { for (let i = s; i < e; i += 2) last = insertNode(base + ((i - s) >> 1), d[i], d[i + 1], last); }
    else { for (let i = e - 2; i >= s; i -= 2) last = insertNode(base + ((i - s) >> 1), d[i], d[i + 1], last); }
    if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
    return last;
  }
  function area(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function equals(a, b) { return a.x === b.x && a.y === b.y; }
  function filterPoints(start, end) {
    if (!start) return start; if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) { removeNode(p); p = end = p.prev; if (p === p.next) break; again = true; }
      else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function pit(ax, ay, bx, by, cx, cy, px, py) { return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py); }
  function isEar(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    const x0 = Math.min(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), x1 = Math.max(a.x, b.x, c.x), y1 = Math.max(a.y, b.y, c.y);
    let p = c.next;
    while (p !== a) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !(p.x === a.x && p.y === a.y) && !(p.x === c.x && p.y === c.y) && pit(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function onSeg(p, q, r) { return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y); }
  function intersects(p1, q1, p2, q2) {
    const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSeg(p1, p2, q1)) return true; if (o2 === 0 && onSeg(p1, q2, q1)) return true;
    if (o3 === 0 && onSeg(p2, p1, q2)) return true; if (o4 === 0 && onSeg(p2, q1, q2)) return true;
    return false;
  }
  function locallyInside(a, b) { return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0; }
  function middleInside(a, b) {
    let p = a, inside = false; const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do { if ((p.y > py) !== (p.next.y > py) && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside; p = p.next; } while (p !== a);
    return inside;
  }
  function intersectsPolygon(a, b) {
    let p = a;
    do { if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true; p = p.next; } while (p !== a);
    return false;
  }
  function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
      ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) || area(a, b.prev, b))) || (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0));
  }
  function splitPolygon(a, b) {
    const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y), an = a.next, bp = b.prev;
    a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
    return b2;
  }
  function cureLocal(start, tris) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) { tris.push(a.i, p.i, b.i); removeNode(p); removeNode(p.next); p = start = b; }
      p = p.next;
    } while (p !== start);
    return filterPoints(p);
  }
  function splitEarcut(start, tris) {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) { let c = splitPolygon(a, b); a = filterPoints(a, a.next); c = filterPoints(c, c.next); earcutLinked(a, tris, 0); earcutLinked(c, tris, 0); return; }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }
  function earcutLinked(ear, tris, pass) {
    if (!ear) return;
    let stop = ear, guard = 0;
    while (ear.prev !== ear.next) {
      if (guard++ > 2000000) break;
      const prev = ear.prev, next = ear.next;
      if (isEar(ear)) { tris.push(prev.i, ear.i, next.i); removeNode(ear); ear = next.next; stop = next.next; continue; }
      ear = next;
      if (ear === stop) {
        if (!pass) earcutLinked(filterPoints(ear), tris, 1);
        else if (pass === 1) { ear = cureLocal(filterPoints(ear), tris); earcutLinked(ear, tris, 2); }
        else if (pass === 2) splitEarcut(ear, tris);
        break;
      }
    }
  }
  function getLeftmost(start) { let p = start, l = start; do { if (p.x < l.x || (p.x === l.x && p.y < l.y)) l = p; p = p.next; } while (p !== start); return l; }
  function sectorContainsSector(m, p) { return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0; }
  function findHoleBridge(hole, outer) {
    let p = outer; const hx = hole.x, hy = hole.y; let qx = -Infinity, m = null;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
        if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
      }
      p = p.next;
    } while (p !== outer);
    if (!m) return null;
    const stop = m, mx = m.x, my = m.y; let tanMin = Infinity;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x && pit(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) { m = p; tanMin = tan; }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  function eliminateHole(hole, outer) {
    const bridge = findHoleBridge(hole, outer);
    if (!bridge) return outer;
    const br = splitPolygon(bridge, hole);
    filterPoints(br, br.next);
    return filterPoints(bridge, bridge.next);
  }

  const Tri = (MF.Tri = {
    // 轮廓组（可带孔，任意嵌套）→ Mesh2
    triangulate(contours) {
      const groups = MF.Path.nest(contours);
      const verts = [], tris = [];
      for (const g of groups) {
        const base = verts.length >> 1;
        const op = dedupe(g.outer.pts); if (op.length < 6) continue;
        let off = base; for (let i = 0; i < op.length; i++) verts.push(op[i]);
        let outer = linkedList(op, 0, op.length, true, off); off += op.length >> 1;
        if (!outer || outer.next === outer.prev) continue;
        const queue = [];
        for (const h of g.holes) {
          const hp = dedupe(h.pts); if (hp.length < 6) continue;
          for (let i = 0; i < hp.length; i++) verts.push(hp[i]);
          const list = linkedList(hp, 0, hp.length, false, off); off += hp.length >> 1;
          if (list) { if (list === list.next) list.steiner = true; queue.push(getLeftmost(list)); }
        }
        queue.sort((a, b) => a.x - b.x);
        for (const q of queue) outer = eliminateHole(q, outer);
        earcutLinked(outer, tris, 0);
      }
      return Tri.finish(new Float64Array(verts), tris);
    },
    // 统一三角形朝向（正面积）、去退化、求边界环
    finish(verts, tris) {
      const out = [];
      for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i], b = tris[i + 1], c = tris[i + 2];
        const cr = (verts[b * 2] - verts[a * 2]) * (verts[c * 2 + 1] - verts[a * 2 + 1]) - (verts[b * 2 + 1] - verts[a * 2 + 1]) * (verts[c * 2] - verts[a * 2]);
        if (Math.abs(cr) < 1e-12) continue;
        if (cr > 0) out.push(a, b, c); else out.push(a, c, b);
      }
      const m = { type: 'mesh2', verts, tris: new Uint32Array(out), loops: null };
      m.loops = Tri.boundaryLoops(m);
      return m;
    },
    boundaryLoops(m) {
      const t = m.tris, nv = m.verts.length >> 1;
      const half = new Set();
      for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) half.add(t[i + k] * nv + t[i + (k + 1) % 3]);
      const next = new Map();
      for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) {
        const a = t[i + k], b = t[i + (k + 1) % 3];
        if (!half.has(b * nv + a)) { let l = next.get(a); if (!l) next.set(a, (l = [])); l.push(b); }
      }
      const loops = [];
      for (const [start] of next) {
        let l = next.get(start);
        while (l && l.length) {
          const loop = [start]; let cur = l.pop(), guard = 0;
          while (cur !== start && guard++ < 1e6) { loop.push(cur); const nl = next.get(cur); if (!nl || !nl.length) break; cur = nl.pop(); }
          if (loop.length >= 3) loops.push(loop);
        }
      }
      return loops;
    },
    // 最长边细分直到所有边 ≤ maxEdge（保持网格共形）
    refine(m, maxEdge, maxVerts) {
      let verts = Array.from(m.verts), tris = Array.from(m.tris);
      maxVerts = maxVerts || 20000; const h2 = maxEdge * maxEdge;
      for (let pass = 0; pass < 12; pass++) {
        const nv0 = verts.length >> 1; if (nv0 > maxVerts) break;
        const KEY = 4194304; const mid = new Map(); let any = false;
        const el2 = (a, b) => { const dx = verts[a * 2] - verts[b * 2], dy = verts[a * 2 + 1] - verts[b * 2 + 1]; return dx * dx + dy * dy; };
        const mark = (a, b) => { const k = a < b ? a * KEY + b : b * KEY + a; let id = mid.get(k); if (id === undefined) { id = verts.length >> 1; verts.push((verts[a * 2] + verts[b * 2]) / 2, (verts[a * 2 + 1] + verts[b * 2 + 1]) / 2); mid.set(k, id); } return id; };
        // 标记每个三角形的最长边
        for (let i = 0; i < tris.length; i += 3) {
          const a = tris[i], b = tris[i + 1], c = tris[i + 2];
          const lab = el2(a, b), lbc = el2(b, c), lca = el2(c, a), mx = Math.max(lab, lbc, lca);
          if (mx <= h2) continue; any = true;
          if (mx === lab) mark(a, b); else if (mx === lbc) mark(b, c); else mark(c, a);
        }
        if (!any) break;
        const get = (a, b) => mid.get(a < b ? a * KEY + b : b * KEY + a);
        const nt = [];
        for (let i = 0; i < tris.length; i += 3) {
          let a = tris[i], b = tris[i + 1], c = tris[i + 2];
          let mab = get(a, b), mbc = get(b, c), mca = get(c, a);
          const cnt = (mab !== undefined) + (mbc !== undefined) + (mca !== undefined);
          if (!cnt) { nt.push(a, b, c); continue; }
          // 旋转使最长的被标记边为 ab
          const lab = mab !== undefined ? el2(a, b) : -1, lbc = mbc !== undefined ? el2(b, c) : -1, lca = mca !== undefined ? el2(c, a) : -1;
          if (lbc >= lab && lbc >= lca) { const t = a; a = b; b = c; c = t; const tm = mab; mab = mbc; mbc = mca; mca = tm; }
          else if (lca >= lab && lca >= lbc) { const t = c; c = b; b = a; a = t; const tm = mca; mca = mbc; mbc = mab; mab = tm; }
          // 先沿 ab 的中点一分为二： (a, m, c) 与 (m, b, c)
          if (mca !== undefined) nt.push(a, mab, mca, mab, c, mca); else nt.push(a, mab, c);
          if (mbc !== undefined) nt.push(mab, b, mbc, mab, mbc, c); else nt.push(mab, b, c);
        }
        tris = nt;
      }
      return Tri.finish(new Float64Array(verts), tris);
    },
    // Mesh2 → 轮廓（边界环）
    toContours(m) { return m.loops.map((l) => { const p = new Array(l.length * 2); for (let i = 0; i < l.length; i++) { p[i * 2] = m.verts[l[i] * 2]; p[i * 2 + 1] = m.verts[l[i] * 2 + 1]; } return { pts: p, closed: true }; }); },
    // 点是否在网格内，返回三角形索引（或 -1）
    locate(m, x, y) {
      const v = m.verts, t = m.tris;
      for (let i = 0; i < t.length; i += 3) {
        const ax = v[t[i] * 2], ay = v[t[i] * 2 + 1], bx = v[t[i + 1] * 2], by = v[t[i + 1] * 2 + 1], cx = v[t[i + 2] * 2], cy = v[t[i + 2] * 2 + 1];
        const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return i / 3;
      }
      return -1;
    },
  });
  function dedupe(p) {
    const o = []; const n = p.length >> 1;
    for (let i = 0; i < n; i++) { const x = p[i * 2], y = p[i * 2 + 1]; const k = o.length; if (k >= 2 && Math.abs(o[k - 2] - x) < 1e-9 && Math.abs(o[k - 1] - y) < 1e-9) continue; o.push(x, y); }
    const k = o.length; if (k >= 4 && Math.abs(o[k - 2] - o[0]) < 1e-9 && Math.abs(o[k - 1] - o[1]) < 1e-9) o.length = k - 2;
    return o;
  }
})();
