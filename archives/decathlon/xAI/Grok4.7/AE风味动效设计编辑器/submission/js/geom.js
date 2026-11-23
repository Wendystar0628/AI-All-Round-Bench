/* Paths, booleans, triangulation, extrusion, stroke, trim, morph, deform. */
(function (G) {
  const AE = (G.AE = G.AE || {});
  const M = AE.math;
  const Geo = (AE.geom = {});

  function pt(x, y) { return { x, y }; }
  function cloneRing(r) { return r.map((p) => ({ x: p.x, y: p.y })); }
  function ringArea(r) { return M.signedArea(r); }

  function ensureCCW(r) {
    return ringArea(r) < 0 ? r.slice().reverse() : r.slice();
  }
  function ensureCW(r) {
    return ringArea(r) > 0 ? r.slice().reverse() : r.slice();
  }

  function sampleCubic(p0, p1, p2, p3, tol, out) {
    function rec(a, b, c, d, depth) {
      const dx = d.x - a.x, dy = d.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      const d1 = Math.abs(dy * (b.x - a.x) - dx * (b.y - a.y)) / L;
      const d2 = Math.abs(dy * (c.x - a.x) - dx * (c.y - a.y)) / L;
      if (depth > 10 || (d1 <= tol && d2 <= tol)) {
        out.push(d);
        return;
      }
      const ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      const cd = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      const abbc = { x: (ab.x + bc.x) / 2, y: (ab.y + bc.y) / 2 };
      const bccd = { x: (bc.x + cd.x) / 2, y: (bc.y + cd.y) / 2 };
      const mid = { x: (abbc.x + bccd.x) / 2, y: (abbc.y + bccd.y) / 2 };
      rec(a, ab, abbc, mid, depth + 1);
      rec(mid, bccd, cd, d, depth + 1);
    }
    rec(p0, p1, p2, p3, 0);
  }

  /** Cubic path {closed, v:[{p,in,out}]} → polyline ring. Handles are absolute. */
  function pathToRing(path, tol) {
    const v = path.v || [];
    if (v.length === 0) return [];
    const out = [{ x: v[0].p[0], y: v[0].p[1] }];
    const n = v.length;
    const segN = path.closed ? n : n - 1;
    for (let i = 0; i < segN; i++) {
      const a = v[i], b = v[(i + 1) % n];
      const p0 = { x: a.p[0], y: a.p[1] };
      const p1 = { x: a.out[0], y: a.out[1] };
      const p2 = { x: b.in[0], y: b.in[1] };
      const p3 = { x: b.p[0], y: b.p[1] };
      const flat = Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.01 && Math.hypot(p2.x - p3.x, p2.y - p3.y) < 0.01;
      if (flat) out.push(p3);
      else sampleCubic(p0, p1, p2, p3, tol || 0.75, out);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.05) out.pop();
    }
    return out;
  }

  function rectPath(w, h, radius) {
    const x = -w / 2, y = -h / 2;
    const r = Math.max(0, Math.min(radius || 0, w / 2, h / 2));
    if (r < 0.5) {
      const p = (px, py) => ({ p: [px, py], in: [px, py], out: [px, py] });
      return { closed: true, v: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] };
    }
    const k = r * 0.5522847498;
    const v = [];
    const add = (px, py, ix, iy, ox, oy) => v.push({ p: [px, py], in: [ix, iy], out: [ox, oy] });
    add(x + r, y, x + r - k, y, x + r, y);
    add(x + w - r, y, x + w - r, y, x + w - r + k, y);
    add(x + w, y + r, x + w, y + r - k, x + w, y + r);
    add(x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + k);
    add(x + w - r, y + h, x + w - r + k, y + h, x + w - r, y + h);
    add(x + r, y + h, x + r, y + h, x + r - k, y + h);
    add(x, y + h - r, x, y + h - r + k, x, y + h - r);
    add(x, y + r, x, y + r, x, y + r - k);
    return { closed: true, v };
  }
  function ellipseRing(w, h, segs) {
    const n = segs || 48;
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push({ x: Math.cos(a) * w / 2, y: Math.sin(a) * h / 2 });
    }
    return ring;
  }

  function offsetRing(ring, dist) {
    if (!ring.length || Math.abs(dist) < 1e-6) return cloneRing(ring);
    const n = ring.length;
    const ccw = ringArea(ring) >= 0;
    const sign = ccw ? 1 : -1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = ring[(i - 1 + n) % n];
      const cur = ring[i];
      const next = ring[(i + 1) % n];
      let t1x = cur.x - prev.x, t1y = cur.y - prev.y;
      let t2x = next.x - cur.x, t2y = next.y - cur.y;
      const l1 = Math.hypot(t1x, t1y) || 1;
      const l2 = Math.hypot(t2x, t2y) || 1;
      t1x /= l1; t1y /= l1; t2x /= l2; t2y /= l2;
      // left normals
      let n1x = -t1y * sign, n1y = t1x * sign;
      let n2x = -t2y * sign, n2y = t2x * sign;
      let nx = n1x + n2x, ny = n1y + n2y;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-4) { nx = n1x; ny = n1y; }
      else { nx /= nl; ny /= nl; }
      const denom = nx * n1x + ny * n1y;
      let miter = Math.abs(denom) > 0.2 ? dist / denom : dist;
      miter = M.clamp(miter, -Math.abs(dist) * 4, Math.abs(dist) * 4);
      out.push({ x: cur.x + nx * miter, y: cur.y + ny * miter });
    }
    return out;
  }

  // ---------- earcut (ears + hole bridging) ----------
  function earcut(rings) {
    // rings[0] outer, rest holes. Any winding; we link them.
    if (!rings.length || rings[0].length < 3) return [];
    const outer = ensureCCW(rings[0]);
    const holes = rings.slice(1).map(ensureCW);
    const verts = [];
    function pushRing(ring, hole) {
      const base = verts.length;
      for (let i = 0; i < ring.length; i++) {
        verts.push({ x: ring[i].x, y: ring[i].y, i: verts.length, hole, prev: null, next: null, z: null, steiner: false });
      }
      for (let i = 0; i < ring.length; i++) {
        const v = verts[base + i];
        v.prev = verts[base + ((i - 1 + ring.length) % ring.length)];
        v.next = verts[base + ((i + 1) % ring.length)];
      }
      return verts[base];
    }
    let start = pushRing(outer, false);
    const holeStarts = holes.map((h) => pushRing(h, true));
    for (let h = 0; h < holeStarts.length; h++) bridgeHole(start, holeStarts[h], verts);
    const tris = [];
    let n = 0, guard = verts.length * verts.length;
    let v = start;
    while (v.next !== v.prev && v.next.next !== v && guard-- > 0) {
      const a = v.prev, b = v, c = v.next;
      if (isEar(a, b, c, verts)) {
        tris.push(a.i, b.i, c.i);
        a.next = c;
        c.prev = a;
        v = c;
        n = 0;
        continue;
      }
      v = v.next;
      if (++n > verts.length) break;
    }
    return { indices: tris, verts: verts.map((p) => ({ x: p.x, y: p.y })) };
  }
  function isEar(a, b, c, verts) {
    if (M.cross2(M.sub2(b, a), M.sub2(c, b)) <= 1e-10) return false;
    let p = a.next;
    const guardMax = verts.length + 2;
    let g = 0;
    while (p !== a && g++ < guardMax) {
      if (p !== b && p !== c && pointInTri(p, a, b, c) && M.cross2(M.sub2(p.next, p), M.sub2(p.prev, p)) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function pointInTri(p, a, b, c) {
    const c1 = M.cross2(M.sub2(b, a), M.sub2(p, a));
    const c2 = M.cross2(M.sub2(c, b), M.sub2(p, b));
    const c3 = M.cross2(M.sub2(a, c), M.sub2(p, c));
    return (c1 >= -1e-8 && c2 >= -1e-8 && c3 >= -1e-8) || (c1 <= 1e-8 && c2 <= 1e-8 && c3 <= 1e-8);
  }
  function bridgeHole(outerStart, holeStart, verts) {
    // rightmost hole vertex
    let hr = holeStart, p = holeStart.next;
    do {
      if (p.x > hr.x) hr = p;
      p = p.next;
    } while (p !== holeStart);
    // find a visible outer vertex: ray to +x, closest intersection, then closest vertex
    let best = null, bestX = Infinity;
    p = outerStart;
    do {
      const a = p, b = p.next;
      if ((a.y > hr.y) !== (b.y > hr.y)) {
        const x = a.x + ((b.x - a.x) * (hr.y - a.y)) / (b.y - a.y);
        if (x >= hr.x - 1e-8 && x < bestX) {
          bestX = x;
          best = Math.abs(a.y - hr.y) < Math.abs(b.y - hr.y) ? a : b;
          if (a.x > b.x) best = a.x >= hr.x ? a : b;
        }
      }
      p = p.next;
    } while (p !== outerStart);
    if (!best) best = outerStart;
    // choose the outer vertex closest to hr that sees it, preferring the intersection endpoint
    let chosen = best;
    let bestD = Infinity;
    p = outerStart;
    do {
      if (p.x >= hr.x - 1e-6) {
        const d = (p.x - hr.x) * (p.x - hr.x) + (p.y - hr.y) * (p.y - hr.y);
        if (d < bestD && segmentClear(hr, p, outerStart, holeStart)) {
          bestD = d;
          chosen = p;
        }
      }
      p = p.next;
    } while (p !== outerStart);
    // link
    const hs = hr;
    const hn = { x: hs.x, y: hs.y, i: verts.length, hole: true, prev: null, next: null, steiner: true };
    const on = { x: chosen.x, y: chosen.y, i: verts.length + 1, hole: false, prev: null, next: null, steiner: true };
    verts.push(hn, on);
    // chosen -> hn -> hole chain -> hs -> on -> chosen.next
    const cNext = chosen.next;
    const hPrev = hs.prev;
    chosen.next = hn;
    hn.prev = chosen;
    hn.next = hs.next;
    hs.next.prev = hn;
    hPrev.next = on;
    on.prev = hPrev;
    on.next = cNext;
    cNext.prev = on;
    hs.next = on; // overwritten? Wait I already used hs.next. This linking is wrong.
    // I'll use a cleaner bridge below if this fails tests. Re-do properly:
    return chosen;
  }

  function segmentClear() { return true; }

  // The bridge above got tangled. Replace earcut with a cleaner implementation.
  function earcutClean(rings) {
    if (!rings || !rings.length || rings[0].length < 3) return { indices: [], verts: [] };
    const data = [];
    const holeIndex = [];
    function add(ring) {
      if (data.length / 2 > 0) holeIndex.push(data.length / 2);
      for (let i = 0; i < ring.length; i++) {
        data.push(ring[i].x, ring[i].y);
      }
    }
    add(ensureCCW(rings[0]));
    for (let i = 1; i < rings.length; i++) if (rings[i].length >= 3) add(ensureCW(rings[i]));
    const idx = earcutLib(data, holeIndex.length ? holeIndex : null, 2);
    const verts = [];
    for (let i = 0; i < data.length; i += 2) verts.push({ x: data[i], y: data[i + 1] });
    return { indices: idx, verts };
  }

  // Mapbox earcut, compacted.
  function earcutLib(data, holeIndices, dim) {
    dim = dim || 2;
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    let outerNode = linkedList(data, 0, outerLen, dim, true);
    const triangles = [];
    if (!outerNode || outerNode.next === outerNode.prev) return triangles;
    let minX, minY, maxX, maxY, invSize;
    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    if (data.length > 80 * dim) {
      minX = maxX = data[0];
      minY = maxY = data[1];
      for (let i = dim; i < outerLen; i += dim) {
        const x = data[i], y = data[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      invSize = Math.max(maxX - minX, maxY - minY);
      invSize = invSize === 0 ? 0 : 32767 / invSize;
    }
    earcutNode(outerNode, triangles, dim, minX, minY, invSize, 0);
    return triangles;
  }
  function linkedList(data, start, end, dim, clockwise) {
    let last;
    if (clockwise === signedAreaData(data, start, end, dim) > 0) {
      for (let i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
      for (let i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }
    if (last && equals(last, last.next)) {
      removeNode(last);
      last = last.next;
    }
    return last;
  }
  function signedAreaData(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }
  function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];
    for (let i = 0, len = holeIndices.length; i < len; i++) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
      const list = linkedList(data, start, end, dim, false);
      if (list === list.next) list.steiner = true;
      let left = list;
      let p = list.next;
      do {
        if (p.x < left.x) left = p;
        p = p.next;
      } while (p !== list);
      queue.push(left);
    }
    queue.sort((a, b) => a.x - b.x);
    for (let i = 0; i < queue.length; i++) {
      outerNode = eliminateHole(queue[i], outerNode);
    }
    return outerNode;
  }
  function eliminateHole(hole, outerNode) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) return outerNode;
    const b = splitPolygon(bridge, hole);
    filterPoints(b, b.next);
    return filterPoints(bridge, bridge.next);
  }
  function findHoleBridge(hole, outerNode) {
    let p = outerNode;
    const hx = hole.x, hy = hole.y;
    let qx = -Infinity, m;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          m = p.x < p.next.x ? p : p.next;
          if (x === hx) return m;
        }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    if (hx === qx) return m;
    const stop = m;
    const mx = m.x, my = m.y;
    let tanMin = Infinity;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
          m = p;
          tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  }
  function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }
  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
  }
  function earcutNode(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);
    let stop = ear, prev, next;
    while (ear.prev !== ear.next) {
      prev = ear.prev;
      next = ear.next;
      if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEarSimple(ear)) {
        triangles.push(prev.i / dim, ear.i / dim, next.i / dim);
        removeNode(ear);
        ear = next.next;
        stop = next.next;
        continue;
      }
      ear = next;
      if (ear === stop) {
        if (!pass) earcutNode(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
        else if (pass === 1) {
          ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
          earcutNode(ear, triangles, dim, minX, minY, invSize, 2);
        } else if (pass === 2) splitEarcut(ear, triangles, dim, minX, minY, invSize);
        break;
      }
    }
  }
  function isEarSimple(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    let p = ear.next.next;
    while (p !== ear.prev) {
      if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function isEarHashed(ear, minX, minY, invSize) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    const minTX = a.x < b.x ? (a.x < c.x ? a.x : c.x) : (b.x < c.x ? b.x : c.x);
    const minTY = a.y < b.y ? (a.y < c.y ? a.y : c.y) : (b.y < c.y ? b.y : c.y);
    const maxTX = a.x > b.x ? (a.x > c.x ? a.x : c.x) : (b.x > c.x ? b.x : c.x);
    const maxTY = a.y > b.y ? (a.y > c.y ? a.y : c.y) : (b.y > c.y ? b.y : c.y);
    const minZ = zOrder(minTX, minTY, minX, minY, invSize);
    const maxZ = zOrder(maxTX, maxTY, minX, minY, invSize);
    let p = ear.prevZ, n = ear.nextZ;
    while (p && p.z >= minZ && n && n.z <= maxZ) {
      if (p.x >= minTX && p.x <= maxTX && p.y >= minTY && p.y <= maxTY && p !== a && p !== c && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;
      if (n.x >= minTX && n.x <= maxTX && n.y >= minTY && n.y <= maxTY && n !== a && n !== c && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }
    while (p && p.z >= minZ) {
      if (p.x >= minTX && p.x <= maxTX && p.y >= minTY && p.y <= maxTY && p !== a && p !== c && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;
    }
    while (n && n.z <= maxZ) {
      if (n.x >= minTX && n.x <= maxTX && n.y >= minTY && n.y <= maxTY && n !== a && n !== c && pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }
    return true;
  }
  function cureLocalIntersections(start, triangles, dim) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        triangles.push(a.i / dim, p.i / dim, b.i / dim);
        removeNode(p);
        removeNode(p.next);
        p = start = b;
      }
      p = p.next;
    } while (p !== start);
    return filterPoints(p);
  }
  function splitEarcut(start, triangles, dim, minX, minY, invSize) {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          let c = splitPolygon(a, b);
          a = filterPoints(a, a.next);
          c = filterPoints(c, c.next);
          earcutNode(a, triangles, dim, minX, minY, invSize, 0);
          earcutNode(c, triangles, dim, minX, minY, invSize, 0);
          return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }
  function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) && (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) || area(a, b.prev, b)) || equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
  }
  function middleInside(a, b) {
    let p = a;
    let inside = false;
    const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do {
      if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
      p = p.next;
    } while (p !== a);
    return inside;
  }
  function intersectsPolygon(a, b) {
    let p = a;
    do {
      if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
      p = p.next;
    } while (p !== a);
    return false;
  }
  function intersects(p1, q1, p2, q2) {
    const o1 = area(p1, q1, p2), o2 = area(p1, q1, q2), o3 = area(p2, q2, p1), o4 = area(p2, q2, q1);
    if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
    return false;
  }
  function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }
  function area(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function insertNode(i, x, y, last) {
    const p = { i, x, y, prev: null, next: null, z: 0, prevZ: null, nextZ: null, steiner: false };
    if (!last) { p.prev = p; p.next = p; return p; }
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
    return p;
  }
  function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;
    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
  }
  function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
        removeNode(p);
        p = end = p.prev;
        if (p === p.next) break;
        again = true;
      } else {
        p = p.next;
      }
    } while (again || p !== end);
    return end;
  }
  function equals(a, b) { return a.x === b.x && a.y === b.y; }
  function splitPolygon(a, b) {
    const a2 = { i: a.i, x: a.x, y: a.y, prev: null, next: null, z: 0, prevZ: null, nextZ: null, steiner: false };
    const b2 = { i: b.i, x: b.x, y: b.y, prev: null, next: null, z: 0, prevZ: null, nextZ: null, steiner: false };
    const an = a.next, bp = b.prev;
    a.next = b;
    b.prev = a;
    a2.next = an;
    an.prev = a2;
    b2.next = a2;
    a2.prev = b2;
    bp.next = b2;
    b2.prev = bp;
    return b2;
  }
  function indexCurve(start, minX, minY, invSize) {
    let p = start;
    do {
      if (p.z == null || p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
      p.prevZ = p.prev;
      p.nextZ = p.next;
      p = p.next;
    } while (p !== start);
    p.prevZ.nextZ = null;
    p.prevZ = null;
    sortLinked(p);
  }
  function sortLinked(list) {
    let i, p, q, e, tail, numMerges, pSize, qSize, inSize = 1;
    do {
      p = list;
      list = null;
      tail = null;
      numMerges = 0;
      while (p) {
        numMerges++;
        q = p;
        pSize = 0;
        for (i = 0; i < inSize; i++) {
          pSize++;
          q = q.nextZ;
          if (!q) break;
        }
        qSize = inSize;
        while (pSize > 0 || (qSize > 0 && q)) {
          if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
            e = p; p = p.nextZ; pSize--;
          } else {
            e = q; q = q.nextZ; qSize--;
          }
          if (tail) tail.nextZ = e; else list = e;
          e.prevZ = tail;
          tail = e;
        }
        p = q;
      }
      tail.nextZ = null;
      inSize *= 2;
    } while (numMerges > 1);
    return list;
  }
  function zOrder(x, y, minX, minY, invSize) {
    let ix = 32767 * (x - minX) * invSize;
    let iy = 32767 * (y - minY) * invSize;
    ix = (ix | (ix << 8)) & 0x00ff00ff;
    ix = (ix | (ix << 4)) & 0x0f0f0f0f;
    ix = (ix | (ix << 2)) & 0x33333333;
    ix = (ix | (ix << 1)) & 0x55555555;
    iy = (iy | (iy << 8)) & 0x00ff00ff;
    iy = (iy | (iy << 4)) & 0x0f0f0f0f;
    iy = (iy | (iy << 2)) & 0x33333333;
    iy = (iy | (iy << 1)) & 0x55555555;
    return ix | (iy << 1);
  }

  // ---------- boolean ----------
  function snap(p) {
    const g = 1000;
    return { x: Math.round(p.x * g) / g, y: Math.round(p.y * g) / g };
  }
  function cleanRing(r) {
    const o = [];
    for (let i = 0; i < r.length; i++) {
      const p = snap(r[i]);
      const q = o[o.length - 1];
      if (!q || q.x !== p.x || q.y !== p.y) o.push(p);
    }
    if (o.length > 1 && o[0].x === o[o.length - 1].x && o[0].y === o[o.length - 1].y) o.pop();
    return o.length >= 3 ? o : [];
  }

  function classifySeg(seg, rings) {
    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const mx = (seg.a.x + seg.b.x) / 2, my = (seg.a.y + seg.b.y) / 2;
    const eps = Math.max(1e-3, Math.min(0.25, L * 0.02));
    const left = M.pointInRings({ x: mx + nx * eps, y: my + ny * eps }, rings) !== 0;
    const right = M.pointInRings({ x: mx - nx * eps, y: my - ny * eps }, rings) !== 0;
    // CCW rings keep their interior on the left.
    // same: the other shape's interior lies on our interior side (shared outer edge)
    // opposite: interiors lie on opposite sides (shared edge between neighbors)
    if (left && right) return "in";
    if (!left && !right) return "out";
    if (left && !right) return "same";
    return "opposite";
  }

  function splitSegs(segs, cuts) {
    // cuts: array of t per seg
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const ts = (cuts[i] || []).filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b);
      let a = s.a;
      let prev = 0;
      const uniq = [];
      for (const t of ts) if (!uniq.length || t - uniq[uniq.length - 1] > 1e-5) uniq.push(t);
      for (const t of uniq) {
        const p = snap({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
        if (Math.hypot(p.x - a.x, p.y - a.y) > 1e-4) out.push({ a, b: p, src: s.src });
        a = p;
        prev = t;
      }
      const b = s.b;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-4) out.push({ a, b, src: s.src });
      void prev;
    }
    return out;
  }

  function ringsToSegs(rings, src) {
    const segs = [];
    for (const ring of rings) {
      const r = cleanRing(ring);
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-4) segs.push({ a, b, src });
      }
    }
    return segs;
  }

  function booleanRings(subjRings, clipRings, op) {
    let A = (subjRings || []).map(cleanRing).filter((r) => r.length >= 3);
    let B = (clipRings || []).map(cleanRing).filter((r) => r.length >= 3);
    if (!A.length) return op === "intersect" ? [] : B.map(cloneRing);
    if (!B.length) return op === "intersect" ? [] : (op === "subtract" ? A.map(cloneRing) : A.map(cloneRing));
    // normalize winding: positive (CCW) outers. Holes should already be opposite.
    const segsA = ringsToSegs(A, "a");
    const segsB = ringsToSegs(B, "b");
    const cutsA = segsA.map(() => []);
    const cutsB = segsB.map(() => []);
    for (let i = 0; i < segsA.length; i++) {
      for (let j = 0; j < segsB.length; j++) {
        const hit = M.segIntersect(segsA[i].a, segsA[i].b, segsB[j].a, segsB[j].b, 1e-7);
        if (!hit) continue;
        if (hit.t > 1e-5 && hit.t < 1 - 1e-5) cutsA[i].push(hit.t);
        if (hit.u > 1e-5 && hit.u < 1 - 1e-5) cutsB[j].push(hit.u);
      }
    }
    const SA = splitSegs(segsA, cutsA);
    const SB = splitSegs(segsB, cutsB);
    const kept = [];
    function keep(seg, reverse) {
      const a = reverse ? seg.b : seg.a;
      const b = reverse ? seg.a : seg.b;
      kept.push({ a, b });
    }
    for (const s of SA) {
      const c = classifySeg(s, B);
      if (op === "union" && (c === "out" || c === "same")) keep(s, false);
      else if (op === "intersect" && (c === "in" || c === "same")) keep(s, false);
      else if (op === "subtract" && (c === "out" || c === "opposite")) keep(s, false);
    }
    for (const s of SB) {
      const c = classifySeg(s, A);
      if (op === "union" && c === "out") keep(s, false);
      else if (op === "intersect" && c === "in") keep(s, false);
      else if (op === "subtract" && c === "in") keep(s, true);
    }
    return chainSegs(kept);
  }

  function chainSegs(segs) {
    const key = (p) => p.x.toFixed(3) + "," + p.y.toFixed(3);
    const map = new Map();
    for (const s of segs) {
      const k = key(s.a);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    const used = new Set();
    const rings = [];
    for (const s0 of segs) {
      if (used.has(s0)) continue;
      const ring = [];
      let s = s0;
      let guard = 0;
      while (s && !used.has(s) && guard++ < segs.length + 5) {
        used.add(s);
        ring.push(s.a);
        const nexts = (map.get(key(s.b)) || []).filter((n) => !used.has(n));
        if (!nexts.length) break;
        if (nexts.length === 1) { s = nexts[0]; continue; }
        const idx = incomingDir(s);
        let best = nexts[0], bestAng = 1e9;
        for (const n of nexts) {
          let ang = Math.atan2(n.b.y - n.a.y, n.b.x - n.a.x) - idx;
          while (ang <= 0) ang += Math.PI * 2;
          if (ang < bestAng) { bestAng = ang; best = n; }
        }
        s = best;
      }
      const cleaned = cleanRing(ring);
      if (cleaned.length >= 3 && Math.abs(ringArea(cleaned)) > 1e-4) rings.push(cleaned);
    }
    return rings;
  }
  function incomingDir(s) {
    return Math.atan2(s.a.y - s.b.y, s.a.x - s.b.x);
  }

  function separateHoles(rings) {
    // Sort by abs area descending. A ring inside another becomes a hole.
    const items = rings.map((r) => ({ r, a: ringArea(r), abs: Math.abs(ringArea(r)) })).filter((it) => it.abs > 1e-4);
    items.sort((a, b) => b.abs - a.abs);
    const shapes = [];
    for (const it of items) {
      const c = centroid(it.r);
      let parent = null;
      for (const s of shapes) {
        if (M.pointInRings(c, [s.outer, ...s.holes]) !== 0) {
          if (!parent || Math.abs(ringArea(s.outer)) < Math.abs(ringArea(parent.outer))) parent = s;
        }
      }
      if (!parent) shapes.push({ outer: ensureCCW(it.r), holes: [] });
      else parent.holes.push(ensureCW(it.r));
    }
    return shapes;
  }
  function centroid(r) {
    let x = 0, y = 0;
    for (const p of r) { x += p.x; y += p.y; }
    const n = r.length || 1;
    return { x: x / n, y: y / n };
  }

  function boolShapes(shapeA, shapeB, op) {
    // shapes: [{outer, holes}]
    const ringsA = flattenShapes(shapeA);
    const ringsB = flattenShapes(shapeB);
    const rings = booleanRings(ringsA, ringsB, op);
    return separateHoles(rings);
  }
  function flattenShapes(shapes) {
    const rings = [];
    for (const s of shapes) {
      rings.push(s.outer);
      for (const h of s.holes || []) rings.push(h);
    }
    return rings;
  }

  // ---------- trim ----------
  function trimRings(rings, start, end, offset) {
    // start/end/offset are 0..1 fractions of total length. end can wrap.
    const closed = rings.map(() => true);
    const lengths = rings.map((r) => M.polyLen(r, true));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let s = ((start || 0) + (offset || 0)) % 1;
    if (s < 0) s += 1;
    let e = ((end == null ? 1 : end) + (offset || 0)) % 1;
    if (e < 0) e += 1;
    const spans = [];
    if (Math.abs(e - s) < 1e-6) return [];
    if (e > s) spans.push([s, e]);
    else { spans.push([s, 1]); spans.push([0, e]); }
    const out = [];
    for (const [a, b] of spans) {
      let cursor = 0;
      for (let i = 0; i < rings.length; i++) {
        const L = lengths[i];
        const r0 = cursor / total, r1 = (cursor + L) / total;
        const lo = Math.max(a, r0), hi = Math.min(b, r1);
        if (hi - lo > 1e-5) {
          const part = sliceRing(rings[i], (lo - r0) / (r1 - r0), (hi - r0) / (r1 - r0));
          if (part.length >= 2) out.push(part);
        }
        cursor += L;
      }
    }
    return out;
  }
  function sliceRing(ring, u0, u1) {
    const n = ring.length;
    const seg = [];
    for (let i = 0; i < n; i++) seg.push(Math.hypot(ring[(i + 1) % n].x - ring[i].x, ring[(i + 1) % n].y - ring[i].y));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    const d0 = u0 * total, d1 = u1 * total;
    const out = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      const sl = seg[i];
      const nacc = acc + sl;
      if (nacc >= d0 && acc <= d1 && sl > 0) {
        const t0 = M.clamp((d0 - acc) / sl, 0, 1);
        const t1 = M.clamp((d1 - acc) / sl, 0, 1);
        if (!out.length) out.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
        if (t1 > t0 + 1e-6) out.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
      }
      acc = nacc;
    }
    return out;
  }

  // ---------- morph ----------
  function resampleRing(ring, n) {
    const closed = true;
    const L = M.polyLen(ring, closed) || 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const d = (k / n) * L;
      let acc = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const sl = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc + sl >= d || i === ring.length - 1) {
          const t = sl > 1e-8 ? M.clamp((d - acc) / sl, 0, 1) : 0;
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          break;
        }
        acc += sl;
      }
    }
    return out;
  }
  function rotateMatch(a, b) {
    // rotate b so its start is closest to a's start, preserving order
    let best = 0, bestD = Infinity;
    for (let i = 0; i < b.length; i++) {
      const d = (a[0].x - b[i].x) ** 2 + (a[0].y - b[i].y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const r = [];
    for (let i = 0; i < b.length; i++) r.push(b[(i + best) % b.length]);
    // flip if reverse matches better
    let dF = 0, dR = 0;
    for (let i = 0; i < a.length; i++) {
      const rb = r[r.length - 1 - i];
      dF += (a[i].x - r[i].x) ** 2 + (a[i].y - r[i].y) ** 2;
      dR += (a[i].x - rb.x) ** 2 + (a[i].y - rb.y) ** 2;
    }
    if (dR < dF) return r.slice().reverse();
    return r;
  }
  function morphShapes(A, B, t) {
    const nA = A.length, nB = B.length;
    const n = Math.max(nA, nB);
    const out = [];
    // pair by centroid
    const used = new Set();
    for (let i = 0; i < nA; i++) {
      const ca = centroid(A[i].outer);
      let bj = 0, bd = Infinity;
      for (let j = 0; j < nB; j++) {
        if (used.has(j)) continue;
        const cb = centroid(B[j].outer);
        const d = (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2;
        if (d < bd) { bd = d; bj = j; }
      }
      if (nB) used.add(bj);
      const Sb = nB ? B[bj] : { outer: A[i].outer.map(() => centroid(A[i].outer)), holes: [] };
      out.push(morphOne(A[i], Sb, nB ? t : 0));
    }
    for (let j = 0; j < nB; j++) {
      if (used.has(j)) continue;
      const fake = { outer: B[j].outer.map(() => centroid(B[j].outer)), holes: [] };
      out.push(morphOne(fake, B[j], t));
    }
    return out;
  }
  function morphOne(A, B, t) {
    const N = 64;
    const ao = rotateMatch(resampleRing(A.outer, N), resampleRing(B.outer, N));
    const bo = resampleRing(B.outer, N);
    const matchedB = rotateMatch(resampleRing(A.outer, N), bo);
    const outer = [];
    const ra = resampleRing(A.outer, N);
    for (let i = 0; i < N; i++) outer.push({ x: M.lerp(ra[i].x, matchedB[i].x, t), y: M.lerp(ra[i].y, matchedB[i].y, t) });
    const hc = Math.max((A.holes || []).length, (B.holes || []).length);
    const holes = [];
    for (let h = 0; h < hc; h++) {
      const ha = (A.holes || [])[h] || centroidRing(A.outer, 24);
      const hb = (B.holes || [])[h] || centroidRing(B.outer, 24);
      const sa = resampleRing(ha, 32);
      const sb = rotateMatch(sa, resampleRing(hb, 32));
      const hole = [];
      for (let i = 0; i < 32; i++) hole.push({ x: M.lerp(sa[i].x, sb[i].x, t), y: M.lerp(sa[i].y, sb[i].y, t) });
      holes.push(hole);
    }
    void ao;
    return { outer, holes };
  }
  function centroidRing(ring, n) {
    const c = centroid(ring);
    return new Array(n).fill(0).map(() => ({ x: c.x, y: c.y }));
  }

  // ---------- stroke ----------
  function strokeMesh(ring, width, closed) {
    if (!ring || ring.length < 2 || width <= 0) return { pos: new Float32Array(0), idx: new Uint32Array(0) };
    const n = ring.length;
    const hw = width / 2;
    const pos = [];
    const count = closed ? n : n;
    const left = [], right = [];
    for (let i = 0; i < count; i++) {
      const prev = ring[(i - 1 + n) % n];
      const cur = ring[i];
      const next = ring[(i + 1) % n];
      let tx, ty;
      if (!closed && i === 0) { tx = next.x - cur.x; ty = next.y - cur.y; }
      else if (!closed && i === n - 1) { tx = cur.x - prev.x; ty = cur.y - prev.y; }
      else {
        const t1x = cur.x - prev.x, t1y = cur.y - prev.y;
        const t2x = next.x - cur.x, t2y = next.y - cur.y;
        tx = t1x / (Math.hypot(t1x, t1y) || 1) + t2x / (Math.hypot(t2x, t2y) || 1);
        ty = t1y / (Math.hypot(t1x, t1y) || 1) + t2y / (Math.hypot(t2x, t2y) || 1);
      }
      const L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L, ny = tx / L;
      left.push(cur.x + nx * hw, cur.y + ny * hw, 0);
      right.push(cur.x - nx * hw, cur.y - ny * hw, 0);
    }
    const m = left.length / 3;
    const arr = new Float32Array(m * 6);
    for (let i = 0; i < m; i++) {
      arr[i * 6] = left[i * 3]; arr[i * 6 + 1] = left[i * 3 + 1]; arr[i * 6 + 2] = 0;
      arr[i * 6 + 3] = right[i * 3]; arr[i * 6 + 4] = right[i * 3 + 1]; arr[i * 6 + 5] = 0;
    }
    const seg = closed ? m : m - 1;
    const idx = new Uint32Array(seg * 6);
    for (let i = 0; i < seg; i++) {
      const a = i, b = (i + 1) % m;
      const i0 = a * 2, i1 = a * 2 + 1, i2 = b * 2, i3 = b * 2 + 1;
      idx[i * 6] = i0; idx[i * 6 + 1] = i2; idx[i * 6 + 2] = i1;
      idx[i * 6 + 3] = i1; idx[i * 6 + 4] = i2; idx[i * 6 + 5] = i3;
    }
    return { pos: arr, idx };
  }

  // ---------- extrude ----------
  function extrudeShapes(shapes, depth, bevel, bevelSize) {
    const d = Math.max(0.001, depth);
    const bv = Math.max(0, bevel || 0);
    const bs = Math.max(0, bevelSize || 0);
    const frontZ = d / 2;
    const backZ = -d / 2;
    const pos = [], nrm = [], idx = [];
    function push(x, y, z, nx, ny, nz) {
      pos.push(x, y, z);
      nrm.push(nx, ny, nz);
      return (pos.length / 3) - 1;
    }
    function tri(a, b, c) { idx.push(a, b, c); }
    for (const shape of shapes) {
      const outer = shape.outer;
      const holes = shape.holes || [];
      if (!outer || outer.length < 3) continue;
      let capOuter = outer, capHoles = holes;
      const sideOuter = outer, sideHoles = holes;
      if (bs > 0.4 && bv > 0.001) {
        capOuter = offsetRing(ensureCCW(outer), -bs);
        capHoles = holes.map((h) => offsetRing(ensureCW(h), bs));
        if (capOuter.length < 3) capOuter = outer;
      }
      const cap = earcutClean([capOuter, ...capHoles]);
      const zf = frontZ;
      const zb = backZ;
      const base = pos.length / 3;
      for (const v of cap.verts) push(v.x, v.y, zf, 0, 0, 1);
      for (let i = 0; i < cap.indices.length; i += 3) tri(base + cap.indices[i], base + cap.indices[i + 1], base + cap.indices[i + 2]);
      const baseB = pos.length / 3;
      for (const v of cap.verts) push(v.x, v.y, zb, 0, 0, -1);
      for (let i = 0; i < cap.indices.length; i += 3) tri(baseB + cap.indices[i], baseB + cap.indices[i + 2], baseB + cap.indices[i + 1]);

      const contours = [sideOuter, ...sideHoles];
      const capContours = [capOuter, ...capHoles];
      for (let c = 0; c < contours.length; c++) {
        const ring = contours[c];
        const inner = bs > 0.4 && bv > 0.001 ? capContours[c] : null;
        const m = ring.length;
        const hole = c > 0;
        for (let i = 0; i < m; i++) {
          const a = ring[i], b = ring[(i + 1) % m];
          const dx = b.x - a.x, dy = b.y - a.y;
          const L = Math.hypot(dx, dy) || 1;
          // CCW outer: outward normal is to the right of the edge direction if Y-up CCW... 
          // CCW edge direction, outward is right = (dy, -dx)
          let nx = dy / L, ny = -dx / L;
          if (hole) { nx = -nx; ny = -ny; }
          if (inner && inner.length === m) {
            const ia = inner[i], ib = inner[(i + 1) % m];
            // bevel quad from outer front-inset to outer edge, both ends
            const z1 = zf, z2 = zf - Math.min(bv, d * 0.49);
            const ia0 = push(ia.x, ia.y, z1, 0, 0, 1);
            const ib0 = push(ib.x, ib.y, z1, 0, 0, 1);
            // already have cap at inner. Bevel side:
            const bz = z2;
            const a1 = push(a.x, a.y, bz, nx, ny, 0.6);
            const b1 = push(b.x, b.y, bz, nx, ny, 0.6);
            const a0 = push(ia.x, ia.y, z1, nx, ny, 0.6);
            const b0 = push(ib.x, ib.y, z1, nx, ny, 0.6);
            tri(a0, b0, b1); tri(a0, b1, a1);
            void ia0; void ib0;
            // wall
            const a2 = push(a.x, a.y, bz, nx, ny, 0);
            const b2 = push(b.x, b.y, bz, nx, ny, 0);
            const a3 = push(a.x, a.y, -bz, nx, ny, 0);
            const b3 = push(b.x, b.y, -bz, nx, ny, 0);
            tri(a2, b2, b3); tri(a2, b3, a3);
            // back bevel
            const a4 = push(a.x, a.y, -bz, nx, ny, -0.6);
            const b4 = push(b.x, b.y, -bz, nx, ny, -0.6);
            const a5 = push(ia.x, ia.y, zb, nx, ny, -0.6);
            const b5 = push(ib.x, ib.y, zb, nx, ny, -0.6);
            tri(a4, b4, b5); tri(a4, b5, a5);
          } else {
            const a0 = push(a.x, a.y, zf, nx, ny, 0);
            const b0 = push(b.x, b.y, zf, nx, ny, 0);
            const a1 = push(a.x, a.y, zb, nx, ny, 0);
            const b1 = push(b.x, b.y, zb, nx, ny, 0);
            tri(a0, b0, b1); tri(a0, b1, a1);
          }
        }
      }
    }
    return {
      pos: new Float32Array(pos),
      nrm: normalizeNrms(nrm),
      idx: new Uint32Array(idx),
    };
  }
  function normalizeNrms(nrm) {
    const o = new Float32Array(nrm.length);
    for (let i = 0; i < nrm.length; i += 3) {
      let x = nrm[i], y = nrm[i + 1], z = nrm[i + 2];
      const L = Math.hypot(x, y, z) || 1;
      o[i] = x / L; o[i + 1] = y / L; o[i + 2] = z / L;
    }
    return o;
  }

  function transformMesh(mesh, mat) {
    const pos = new Float32Array(mesh.pos.length);
    const nrm = new Float32Array(mesh.nrm.length);
    const invT = M.invert4(mat);
    // normal uses inverse-transpose upper 3x3. For pure TRS without shear, transformDir of inverse is ok if we invert scale.
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const p = M.transformPoint(mat, [mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]);
      pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
      const n = M.transformDir(invT, [mesh.nrm[i], mesh.nrm[i + 1], mesh.nrm[i + 2]]);
      // wait, inverse-transpose of M is (M^-1)^T, transforming normals by (M^-1)^T means n' = M^-T * n, which is NOT transformDir(inv).
      // transformDir(inv) is M^-1 * n. For rotation-only they're equal. For nonuniform scale we need transpose.
      // I'll apply upper 3x3 of inverse transposed manually below.
    }
    for (let i = 0; i < mesh.nrm.length; i += 3) {
      const x = mesh.nrm[i], y = mesh.nrm[i + 1], z = mesh.nrm[i + 2];
      // columns of inv are rows of inv^T
      const nx = invT[0] * x + invT[1] * y + invT[2] * z;
      const ny = invT[4] * x + invT[5] * y + invT[6] * z;
      const nz = invT[8] * x + invT[9] * y + invT[10] * z;
      const L = Math.hypot(nx, ny, nz) || 1;
      nrm[i] = nx / L; nrm[i + 1] = ny / L; nrm[i + 2] = nz / L;
    }
    return { pos, nrm, idx: mesh.idx, heat: mesh.heat };
  }

  function mergeMeshes(list) {
    let vc = 0, ic = 0;
    for (const m of list) { vc += m.pos.length / 3; ic += m.idx.length; }
    const pos = new Float32Array(vc * 3);
    const nrm = new Float32Array(vc * 3);
    const idx = new Uint32Array(ic);
    const heat = new Float32Array(vc);
    let v = 0, ii = 0;
    for (const m of list) {
      const base = v;
      pos.set(m.pos, v * 3);
      nrm.set(m.nrm, v * 3);
      if (m.heat) heat.set(m.heat, v);
      for (let k = 0; k < m.idx.length; k++) idx[ii++] = m.idx[k] + base;
      v += m.pos.length / 3;
    }
    return { pos, nrm, idx, heat };
  }

  function boxMesh(sx, sy, sz) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const faces = [
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
      [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]],
      [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]],
      [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]],
      [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]],
      [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]],
    ];
    const pos = [], nrm = [], idx = [];
    for (const f of faces) {
      const b = pos.length / 3;
      for (let i = 0; i < 4; i++) {
        pos.push(f[i][0], f[i][1], f[i][2]);
        nrm.push(f[4][0], f[4][1], f[4][2]);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx), heat: new Float32Array(pos.length / 3) };
  }

  function planeMesh(w, h) {
    const x = w / 2, y = h / 2;
    const pos = new Float32Array([-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0]);
    const nrm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
    return { pos, nrm, idx, heat: new Float32Array(4) };
  }

  // Deform a mesh in place (copy). pins: [{bind:[x,y,z], offset:[x,y,z], rot:[degx,y,z], scale, radius}]
  function deformMesh(mesh, opts) {
    const o = {
      pos: new Float32Array(mesh.pos),
      nrm: new Float32Array(mesh.nrm),
      idx: mesh.idx,
      heat: new Float32Array(mesh.pos.length / 3),
    };
    const pins = opts.pins || [];
    const bend = opts.bend || 0;
    const twist = opts.twist || 0;
    const field = opts.field || null;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < o.pos.length; i += 3) {
      const y = o.pos[i + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const H = Math.max(1, maxY - minY);
    for (let i = 0; i < o.pos.length; i += 3) {
      let x = o.pos[i], y = o.pos[i + 1], z = o.pos[i + 2];
      const ox = x, oy = y, oz = z;
      if (Math.abs(bend) > 0.0001) {
        const ang = ((y - minY) / H - 0.5) * bend;
        const c = Math.cos(ang), s = Math.sin(ang);
        const z2 = z * c - (y - (minY + maxY) / 2) * s * 0.15;
        const y2 = (y - (minY + maxY) / 2) * c + z * s * 0.15;
        y = y2 + (minY + maxY) / 2;
        z = z2;
      }
      if (Math.abs(twist) > 0.0001) {
        const ang = ((y - minY) / H - 0.5) * twist;
        const c = Math.cos(ang), s = Math.sin(ang);
        const x2 = x * c - z * s;
        const z2 = x * s + z * c;
        x = x2; z = z2;
      }
      if (field) {
        const f = field([x, y, z]);
        x += f[0]; y += f[1]; z += f[2];
      }
      if (pins.length) {
        let ax = 0, ay = 0, az = 0, wsum = 0, wId = 1;
        for (const pin of pins) {
          const dx = ox - pin.bind[0], dy = oy - pin.bind[1], dz = oz - (pin.bind[2] || 0);
          const dist = Math.hypot(dx, dy, dz);
          const r = pin.radius || 200;
          const u = M.clamp(1 - dist / r, 0, 1);
          const w = u * u * (3 - 2 * u);
          wId *= 1 - w;
          if (w < 1e-4) continue;
          const sc = pin.scale == null ? 1 : pin.scale;
          let px = dx * sc, py = dy * sc, pz = dz * sc;
          const rot = pin.rot || [0, 0, 0];
          if (rot[0] || rot[1] || rot[2]) {
            const m = M.trs([0, 0, 0], rot, [1, 1, 1], [0, 0, 0]);
            const tp = M.transformPoint(m, [px, py, pz]);
            px = tp[0]; py = tp[1]; pz = tp[2];
          }
          const off = pin.offset || [0, 0, 0];
          ax += w * (pin.bind[0] + px + off[0]);
          ay += w * (pin.bind[1] + py + off[1]);
          az += w * ((pin.bind[2] || 0) + pz + (off[2] || 0));
          wsum += w;
        }
        const idw = Math.max(0, wId);
        ax += idw * x; ay += idw * y; az += idw * z;
        wsum += idw;
        if (wsum > 1e-6) { x = ax / wsum; y = ay / wsum; z = az / wsum; }
        o.heat[i / 3] = M.clamp(1 - wId, 0, 1);
      }
      o.pos[i] = x; o.pos[i + 1] = y; o.pos[i + 2] = z;
    }
    recomputeNormals(o);
    return o;
  }
  function recomputeNormals(mesh) {
    const nrm = new Float32Array(mesh.pos.length);
    const idx = mesh.idx;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
      const ax = mesh.pos[ia], ay = mesh.pos[ia + 1], az = mesh.pos[ia + 2];
      const bx = mesh.pos[ib], by = mesh.pos[ib + 1], bz = mesh.pos[ib + 2];
      const cx = mesh.pos[ic], cy = mesh.pos[ic + 1], cz = mesh.pos[ic + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      nrm[ia] += nx; nrm[ia + 1] += ny; nrm[ia + 2] += nz;
      nrm[ib] += nx; nrm[ib + 1] += ny; nrm[ib + 2] += nz;
      nrm[ic] += nx; nrm[ic + 1] += ny; nrm[ic + 2] += nz;
    }
    for (let i = 0; i < nrm.length; i += 3) {
      const L = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
      nrm[i] /= L; nrm[i + 1] /= L; nrm[i + 2] /= L;
    }
    mesh.nrm = nrm;
  }

  function bounds2(rings) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const list = Array.isArray(rings[0]) || (rings[0] && rings[0].x != null && !rings[0].outer) ? (rings[0] && rings[0].x != null ? [rings] : rings) : null;
    const all = [];
    if (rings[0] && rings[0].outer) {
      for (const s of rings) { all.push(s.outer); for (const h of s.holes || []) all.push(h); }
    } else if (rings[0] && rings[0].x != null) all.push(rings);
    else for (const r of rings) all.push(r);
    for (const r of all) for (const p of r) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }

  Object.assign(Geo, {
    pt, cloneRing, pathToRing, rectPath, ellipseRing, offsetRing,
    earcut: earcutClean, booleanRings, separateHoles, boolShapes, cleanRing,
    trimRings, morphShapes, strokeMesh, extrudeShapes, transformMesh, mergeMeshes,
    boxMesh, planeMesh, deformMesh, recomputeNormals, bounds2, resampleRing, centroid,
  });
})(typeof window !== "undefined" ? window : globalThis);
