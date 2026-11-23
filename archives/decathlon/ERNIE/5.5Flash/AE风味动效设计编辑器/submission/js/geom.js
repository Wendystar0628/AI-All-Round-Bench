/* AE Forge Editor - geometry toolkit: polygons, triangulation, extrusion, glyph outlines, booleans */
(function (global) {
  'use strict';
  const M4 = AEMath.M4;

  // ---------- basic polygon helpers ----------
  function signedArea(pts) {
    let s = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  function polyArea(pts) { return Math.abs(signedArea(pts)); }
  function centroid(pts) {
    let x = 0, y = 0, a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const c = p[0] * q[1] - q[0] * p[1];
      a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
    }
    if (Math.abs(a) < 1e-9) {
      let sx = 0, sy = 0;
      for (const p of pts) { sx += p[0]; sy += p[1]; }
      return [sx / pts.length, sy / pts.length];
    }
    return [x / (3 * a), y / (3 * a)];
  }
  function bbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return [minX, minY, maxX, maxY];
  }
  function pointInPoly(pt, pts) {
    const x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function distToSegment(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const L = vx * vx + vy * vy;
    let t = L ? (wx * vx + wy * vy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
  }
  function simplify(pts, tol) {
    if (pts.length < 4) return pts.slice();
    const sq = tol * tol;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let maxD = sq, idx = -1;
      for (let i = first + 1; i < last; i++) {
        const d = distToSegment(pts[i], pts[first], pts[last]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx > 0) { keep[idx] = 1; stack.push([first, idx], [idx, last]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }
  function resample(pts, count) {
    // arc-length resample closed polyline
    const n = pts.length;
    const segLen = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segLen.push(l); total += l;
    }
    const out = [];
    if (total < 1e-9) return pts.slice();
    for (let k = 0; k < count; k++) {
      let d = total * k / count;
      let i = 0;
      while (i < n && d > segLen[i]) { d -= segLen[i]; i++; }
      i = Math.min(i, n - 1);
      const a = pts[i], b = pts[(i + 1) % n];
      const t = segLen[i] > 0 ? d / segLen[i] : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }

  // ---------- earcut style triangulation with holes ----------
  function ENode(x, y, pt) { this.x = x; this.y = y; this.pt = pt || [x, y]; this.prev = null; this.next = null; this.isInter = false; }
  function eArea(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function eRemove(p) { p.next.prev = p.prev; p.prev.next = p.next; }
  function eLinkedList(points, clockwise) {
    let last = null, node = null;
    const nodes = [];
    for (let i = 0; i < points.length; i++) {
      node = new ENode(points[i][0], points[i][1], points[i]);
      if (last) { node.prev = last; last.next = node; } 
      nodes.push(node);
      last = node;
    }
    if (!last) return null;
    node.prev = last; last.next = node;
    // signed area
    let s = 0;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i], b = nodes[(i + 1) % nodes.length];
      s += (b.x - a.x) * (a.y + b.y);
    }
    const isCW = s > 0;
    if (isCW !== clockwise) {
      const arr = nodes.slice().reverse();
      for (let i = 0; i < arr.length; i++) { arr[i].prev = arr[(i - 1 + arr.length) % arr.length]; arr[i].next = arr[(i + 1) % arr.length]; }
      return arr[0];
    }
    return nodes[0];
  }
  function eFilterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (eArea(p.prev, p, p.next) === 0 && (Math.abs(p.x - p.next.x) < 1e-12 && Math.abs(p.y - p.next.y) < 1e-12)) { eRemove(p); p = end = p.prev; if (p === p.next) break; again = true; }
      else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function ePointInTri(ax, ay, bx, by, cx, cy, px, py) {
    return ((cx - px) * (ay - py) - (ax - px) * (cy - py)) >= 0 &&
      ((ax - px) * (by - py) - (bx - px) * (ay - py)) >= 0 &&
      ((bx - px) * (cy - py) - (cx - px) * (by - py)) >= 0;
  }
  function eIsEar(ear) {
    if (!ear) return false;
    const a = ear.prev, b = ear, c = ear.next;
    if (eArea(a, b, c) >= 0) return false;
    let p = ear.next.next;
    while (p !== ear.prev) {
      if (ePointInTri(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && eArea(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function eLocallyInside(a, b) {
    return eArea(a.prev, a, a.next) < 0
      ? (eArea(a, b, a.next) >= 0 && eArea(a, a.prev, b) >= 0)
      : (eArea(a, b, a.prev) < 0 || eArea(a, a.next, b) < 0);
  }
  function eSplit(a, b) {
    const a2 = new ENode(a.x, a.y, a.pt), b2 = new ENode(b.x, b.y, b.pt);
    const an = a.next, bp = b.prev;
    a.next = b; b.prev = a;
    a2.next = an; an.prev = a2;
    b2.next = a2; a2.prev = b2;
    return b2;
  }
  function eFindHoleBridge(hole, outerNode) {
    let p = outerNode;
    const hx = hole.x, hy = hole.y;
    let qx = -Infinity, m = null;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    if (hx === qx) return m;
    const stop = m, mx = m.x, my = m.y;
    let tanMin = Infinity, tanPoint = m;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x &&
        ePointInTri(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (eLocallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > tanPoint.x || (p.x === tanPoint.x && p.y === tanPoint.y))))) { tanMin = tan; tanPoint = p; }
      }
      p = p.next;
    } while (p !== stop);
    return tanPoint;
  }
  function eEliminateHole(hole, outerNode) {
    const bridge = eFindHoleBridge(hole, outerNode);
    if (!bridge) return outerNode;
    eSplit(bridge, hole);
    eFilterPoints(hole, hole.next);
    return hole.next;
  }
  function eEarcutLinked(ear, triangles) {
    if (!ear) return;
    let stop = ear, guard = 0;
    while (ear.prev !== ear.next && guard++ < 100000) {
      const prev = ear.prev, next = ear.next;
      if (eIsEar(ear)) {
        triangles.push([prev.pt, ear.pt, next.pt]);
        eRemove(ear);
        ear = next.next; stop = next.next;
        continue;
      }
      ear = next;
      if (ear === stop) {
        // no ear found: try dropping a collinear point, otherwise bail
        let p = ear, removed = false;
        do {
          if (eArea(p.prev, p, p.next) === 0) { eRemove(p); removed = true; break; }
          p = p.next;
        } while (p !== ear);
        if (!removed) break;
        ear = ear.prev; stop = ear.next;
      }
    }
  }
  function triangulate(outer, holes) {
    const pts = outer.map(p => [p[0], p[1]]);
    let outerNode = eLinkedList(pts, true);
    if (!outerNode) return [];
    eFilterPoints(outerNode, null);
    const holeNodes = [];
    for (const h of (holes || [])) {
      const hn = eLinkedList(h.map(p => [p[0], p[1]]), false);
      if (!hn) continue;
      eFilterPoints(hn, null);
      holeNodes.push(hn);
    }
    holeNodes.sort((a, b) => b.x - a.x);
    for (const hn of holeNodes) {
      outerNode = eEliminateHole(hn, outerNode);
      if (!outerNode) break;
    }
    const tris = [];
    if (outerNode) eEarcutLinked(outerNode, tris);
    return tris;
  }

  // ---------- extrusion ----------
  function MeshBuilder() {
    this.pos = []; this.nrm = [];
  }
  MeshBuilder.prototype.tri = function (a, b, c, normal) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (!normal) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      normal = [nx, ny, nz];
    }
    for (let i = 0; i < 3; i++) this.nrm.push(normal[0], normal[1], normal[2]);
  };
  MeshBuilder.prototype.quad = function (a, b, c, d, normal) {
    this.tri(a, b, c, normal);
    this.tri(a, c, d, normal);
  };
  MeshBuilder.prototype.build = function () {
    return { pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), count: this.pos.length / 3 };
  };

  function ensureCCW(pts) { return signedArea(pts) < 0 ? pts.slice().reverse() : pts; }

  function extrudeContours(contours, depth, opts) {
    opts = opts || {};
    const mb = new MeshBuilder();
    const z0 = 0, z1 = depth;
    // normalize: outer CCW, holes CW
    const outers = [], holes = [];
    for (const c of contours) {
      const pts = ensureCCW(c.pts);
      if (c.hole) holes.push({ pts: pts.slice().reverse(), container: c.container });
      else outers.push({ pts, container: -1 });
    }
    // assign holes to smallest containing outer
    for (const h of holes) {
      let best = null, bestA = Infinity;
      for (let i = 0; i < outers.length; i++) {
        if (pointInPoly(h.pts[0], outers[i].pts)) {
          const a = polyArea(outers[i].pts);
          if (a < bestA) { bestA = a; best = i; }
        }
      }
      h.container = best;
    }
    const allOuters = outers;
    for (let oi = 0; oi < allOuters.length; oi++) {
      const outer = allOuters[oi];
      const hs = holes.filter(h => h.container === oi).map(h => h.pts);
      const tris = triangulate(outer.pts, hs);
      for (const t of tris) {
        let [a, b, c] = t;
        const ar = signedArea([a, b, c]);
        if (ar < 0) { const tmp = b; b = c; c = tmp; }
        // front cap (z1)
        mb.tri([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], [0, 0, 1]);
        // back cap (z0), reversed
        mb.tri([a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0], [0, 0, -1]);
      }
      // sides
      const rings = [outer.pts].concat(hs);
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) continue;
          let nx = q[1] - p[1], ny = -(q[0] - p[0]);
          const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          // outward for CCW ring is (dy,-dx); holes are CW so this points into the hole = outward of material
          mb.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], [nx, ny, 0]);
        }
      }
    }
    return mb.build();
  }

  // ---------- marching squares ----------
  function maskToContours(alpha, w, h, threshold) {
    threshold = threshold === undefined ? 127 : threshold;
    const segs = [];
    const val = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : alpha[y * w + x];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const tl = val(x, y), tr = val(x + 1, y), br = val(x + 1, y + 1), bl = val(x, y + 1);
        const idx = (tl > threshold ? 1 : 0) | (tr > threshold ? 2 : 0) | (br > threshold ? 4 : 0) | (bl > threshold ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const top = [x + (threshold - tl) / ((tr - tl) || 1e-6), y];
        const right = [x + 1, y + (threshold - tr) / ((br - tr) || 1e-6)];
        const bottom = [x + (threshold - bl) / ((br - bl) || 1e-6), y + 1];
        const left = [x, y + (threshold - tl) / ((bl - tl) || 1e-6)];
        const push = (a, b) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) segs.push([a, b]); };
        switch (idx) {
          case 1: case 14: push(left, top); break;
          case 2: case 13: push(top, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(right, bottom); break;
          case 6: case 9: push(top, bottom); break;
          case 7: case 8: push(left, bottom); break;
          case 5: {
            const center = (tl + tr + br + bl) / 4 > threshold;
            if (center) { push(left, bottom); push(top, right); }
            else { push(left, top); push(right, bottom); }
            break;
          }
          case 10: {
            const center = (tl + tr + br + bl) / 4 > threshold;
            if (center) { push(left, top); push(right, bottom); }
            else { push(left, bottom); push(top, right); }
            break;
          }
        }
      }
    }
    // link segments
    const key = (p) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);
    const map = new Map();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      for (const p of s) {
        const k = key(p);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(i);
      }
    }
    const used = new Uint8Array(segs.length);
    const contours = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const pts = [segs[i][0], segs[i][1]];
      let guard = 0;
      while (guard++ < 200000) {
        const tail = pts[pts.length - 1];
        const cands = map.get(key(tail)) || [];
        let next = -1;
        for (const ci of cands) { if (!used[ci]) { next = ci; break; } }
        if (next < 0) break;
        used[next] = 1;
        const s = segs[next];
        const a = s[0], b = s[1];
        if (key(a) === key(tail)) pts.push(b); else pts.push(a);
        if (key(pts[pts.length - 1]) === key(pts[0])) { pts.pop(); break; }
      }
      if (pts.length >= 3) contours.push(pts);
    }
    return contours;
  }

  // ---------- glyph outlines ----------
  const glyphCache = new Map();
  const GLYPH_FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC","SimHei",sans-serif';
  function glyphContours(ch, fontSize, weight) {
    const key = ch + '|' + Math.round(fontSize) + '|' + (weight || 700);
    if (glyphCache.has(key)) return glyphCache.get(key);
    const px = 180;
    const cw = Math.ceil(px * 1.5), chh = Math.ceil(px * 1.5);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = chh;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, cw, chh);
    ctx.fillStyle = '#fff';
    ctx.font = (weight || 700) + ' ' + px + 'px ' + GLYPH_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const baseY = chh * 0.78;
    ctx.fillText(ch, cw / 2, baseY);
    const img = ctx.getImageData(0, 0, cw, chh).data;
    const alpha = new Uint8Array(cw * chh);
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = img[j];
    const raw = maskToContours(alpha, cw, chh, 110);
    const scale = 1 / px;
    const contours = [];
    for (const r of raw) {
      let pts = r.map(p => [(p[0] - cw / 2) * scale, (baseY - p[1]) * scale]);
      if (pts.length < 3) continue;
      pts = simplify(pts, 1.1 * scale);
      if (pts.length < 3) continue;
      if (polyArea(pts) * px * px < 6) continue;
      contours.push({ pts, hole: false });
    }
    // classify holes by containment
    for (let i = 0; i < contours.length; i++) {
      let depth = 0;
      for (let j = 0; j < contours.length; j++) {
        if (i === j) continue;
        if (pointInPoly(contours[i].pts[0], contours[j].pts)) depth++;
      }
      contours[i].hole = depth % 2 === 1;
      contours[i].container = -1;
    }
    const out = contours.map(c => ({ pts: c.pts, hole: c.hole }));
    glyphCache.set(key, out);
    return out;
  }

  function contoursToPath2D(contours) {
    const p = new Path2D();
    for (const c of contours) {
      const pts = c.pts;
      if (!pts.length) continue;
      p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      p.closePath();
    }
    return p;
  }

  // ---------- Greiner-Hormann boolean ----------
  function cleanPoly(pts) {
    const out = [];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-7) out.push([p[0], p[1]]);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) out.pop();
    }
    return out;
  }
  function segIntersect(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    const qp = [c[0] - a[0], c[1] - a[1]];
    if (Math.abs(den) < 1e-12) return null;
    const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
    const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    if (t <= 1e-7 || t >= 1 - 1e-7 || u <= 1e-7 || u >= 1 - 1e-7) return null;
    return [a[0] + r[0] * t, a[1] + r[1] * t, t, u];
  }
  function buildAugmented(polyA, polyB) {
    // returns {listA, listB, intersections}
    const nodesA = [], nodesB = [];
    const n = polyA.length, m = polyB.length;
    for (let i = 0; i < n; i++) {
      const a = polyA[i], b = polyA[(i + 1) % n];
      nodesA.push({ pt: a.slice(), inter: false, entry: false, neighbor: null, poly: 0, visited: false });
      const hits = [];
      for (let j = 0; j < m; j++) {
        const c = polyB[j], d = polyB[(j + 1) % m];
        const r = segIntersect(a, b, c, d);
        if (r) hits.push({ j, t: r[2], pt: [r[0], r[1]] });
        else {
          // collinear overlap: add endpoints that lie strictly inside the other segment
          const onSeg = (p, s0, s1) => {
            const cross = (p[0] - s0[0]) * (s1[1] - s0[1]) - (p[1] - s0[1]) * (s1[0] - s0[0]);
            if (Math.abs(cross) > 1e-7) return false;
            const dot = (p[0] - s0[0]) * (p[0] - s1[0]) + (p[1] - s0[1]) * (p[1] - s1[1]);
            return dot < -1e-9;
          };
          if (onSeg(c, a, b)) hits.push({ j, t: ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2), pt: c.slice() });
          if (onSeg(d, a, b)) hits.push({ j, t: ((d[0] - a[0]) * (b[0] - a[0]) + (d[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2), pt: d.slice() });
        }
      }
      hits.sort((h1, h2) => h1.t - h2.t);
      let lastT = -1;
      for (const h of hits) {
        if (h.t - lastT < 1e-7) continue;
        lastT = h.t;
        // mid point before intersection
        const tPrev = Math.max(0, h.t - 1e-4);
        const mp = [a[0] + (b[0] - a[0]) * tPrev, a[1] + (b[1] - a[1]) * tPrev];
        const inside = pointInPoly(mp, polyB);
        const node = { pt: h.pt, inter: true, entry: inside, neighbor: null, poly: 0, visited: false };
        node.t = h.t; node.edge = i; node.j = h.j;
        nodesA.push(node);
      }
    }
    for (let j = 0; j < m; j++) {
      const c = polyB[j], d = polyB[(j + 1) % m];
      nodesB.push({ pt: c.slice(), inter: false, entry: false, neighbor: null, poly: 1, visited: false });
      const hits = [];
      for (let i = 0; i < n; i++) {
        const a = polyA[i], b = polyA[(i + 1) % n];
        const r = segIntersect(c, d, a, b);
        if (r) hits.push({ i, t: r[3], pt: [r[0], r[1]] });
        else {
          const onSeg = (p, s0, s1) => {
            const cross = (p[0] - s0[0]) * (s1[1] - s0[1]) - (p[1] - s0[1]) * (s1[0] - s0[0]);
            if (Math.abs(cross) > 1e-7) return false;
            return (p[0] - s0[0]) * (p[0] - s1[0]) + (p[1] - s0[1]) * (p[1] - s1[1]) < -1e-9;
          };
          if (onSeg(a, c, d)) hits.push({ i, t: ((a[0] - c[0]) * (d[0] - c[0]) + (a[1] - c[1]) * (d[1] - c[1])) / ((d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2), pt: a.slice() });
          if (onSeg(b, c, d)) hits.push({ i, t: ((b[0] - c[0]) * (d[0] - c[0]) + (b[1] - c[1]) * (d[1] - c[1])) / ((d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2), pt: b.slice() });
        }
      }
      hits.sort((h1, h2) => h1.t - h2.t);
      let lastT = -1;
      for (const h of hits) {
        if (h.t - lastT < 1e-7) continue;
        lastT = h.t;
        const tPrev = Math.max(0, h.t - 1e-4);
        const mp = [c[0] + (d[0] - c[0]) * tPrev, c[1] + (d[1] - c[1]) * tPrev];
        const inside = pointInPoly(mp, polyA);
        const node = { pt: h.pt, inter: true, entry: inside, neighbor: null, poly: 1, visited: false };
        node.t = h.t; node.edge = j; node.i = h.i;
        nodesB.push(node);
      }
    }
    // link neighbors
    for (const na of nodesA) {
      if (!na.inter) continue;
      let best = null, bd = Infinity;
      for (const nb of nodesB) {
        if (!nb.inter) continue;
        const d = Math.hypot(na.pt[0] - nb.pt[0], na.pt[1] - nb.pt[1]);
        if (d < bd && d < 1e-4 && !nb.neighbor) { bd = d; best = nb; }
      }
      if (best) { na.neighbor = best; best.neighbor = na; }
    }
    // build linked lists with intersections inserted in order
    const linkify = (baseNodes, poly, otherPoly) => {
      // baseNodes: vertex + intersection nodes interleaved; sort by construction order
      const list = baseNodes.slice();
      for (let i = 0; i < list.length; i++) { list[i].prev = list[(i - 1 + list.length) % list.length]; list[i].next = list[(i + 1) % list.length]; }
      return list;
    };
    // Interleave: iterate edges, collecting vertex at start and intersections sorted by t
    const interleave = (poly, list) => {
      const out = [];
      const n = poly.length;
      const interByEdge = new Map();
      for (const nd of list) {
        if (!nd.inter) continue;
        if (!interByEdge.has(nd.edge)) interByEdge.set(nd.edge, []);
        interByEdge.get(nd.edge).push(nd);
      }
      for (const arr of interByEdge.values()) arr.sort((a, b) => a.t - b.t);
      for (let i = 0; i < n; i++) {
        const v = list.find(nd => !nd.inter && nd.pt[0] === poly[i][0] && nd.pt[1] === poly[i][1]);
        if (v) out.push(v);
        for (const nd of (interByEdge.get(i) || [])) out.push(nd);
      }
      for (let i = 0; i < out.length; i++) { out[i].prev = out[(i - 1 + out.length) % out.length]; out[i].next = out[(i + 1) % out.length]; }
      return out;
    };
    const listA = interleave(polyA, nodesA);
    const listB = interleave(polyB, nodesB);
    const intersections = listA.filter(n => n.inter);
    return { listA, listB, intersections };
  }

  function clipPolys(polyA, polyB, mode) {
    // mode: 'union' | 'diff'
    const A = cleanPoly(polyA), B = cleanPoly(polyB);
    if (A.length < 3 || B.length < 3) return [];
    const bUse = mode === 'diff' ? B.slice().reverse() : B;
    const { listA, listB, intersections } = buildAugmented(A, bUse);
    // no intersections -> containment
    if (!intersections.length) {
      if (mode === 'union') {
        if (pointInPoly(A[0], bUse)) return [bUse.map(p => p.slice())];
        if (pointInPoly(bUse[0], A)) return [A.map(p => p.slice())];
        return [A.map(p => p.slice()), bUse.map(p => p.slice())];
      } else {
        if (pointInPoly(A[0], bUse)) return [];
        return [A.map(p => p.slice())];
      }
    }
    const results = [];
    let guard = 0;
    let start = null;
    for (const nd of intersections) if (!nd.entry) { start = nd; break; }
    if (!start) start = intersections[0];
    const startNode = start;
    let cur = start;
    const out = [];
    let steps = 0;
    do {
      if (steps++ > 5000) break;
      out.push(cur.pt.slice());
      cur.visited = true;
      if (cur.neighbor) cur.neighbor.visited = true;
      let p = cur.next;
      let localGuard = 0;
      while (!p.inter && localGuard++ < 5000) { out.push(p.pt.slice()); p = p.next; }
      if (!p.inter) break;
      if (p.visited) break;
      out.push(p.pt.slice());
      p.visited = true;
      if (p.neighbor) p.neighbor.visited = true;
      if (p.entry) p = p.neighbor ? p.neighbor.next : p.next;
      else p = p.next;
      cur = p;
      if (cur === startNode || cur.visited) break;
    } while (guard++ < 20000);
    // If traversal ended at start, out contains closed loop
    if (out.length >= 3) {
      const cleaned = cleanPoly(out);
      if (cleaned.length >= 3 && polyArea(cleaned) > 1e-6) results.push(cleaned);
    }
    return results;
  }

  // normalize contours: outer CCW, holes CW, based on containment depth
  function normalizeContours(contours) {
    const items = contours.map(c => ({ pts: cleanPoly(c.pts), hole: false, depth: 0 }));
    for (const it of items) {
      let d = 0;
      for (const ot of items) {
        if (ot === it) continue;
        if (pointInPoly(it.pts[0], ot.pts)) d++;
      }
      it.depth = d;
      it.hole = d % 2 === 1;
    }
    for (const it of items) if (!it.hole && signedArea(it.pts) < 0) it.pts.reverse();
    for (const it of items) if (it.hole && signedArea(it.pts) > 0) it.pts.reverse();
    return items;
  }

  // ---------- primitives ----------
  function boxMesh(w, h, d) {
    const mb = new MeshBuilder();
    const x = w / 2, y = h / 2, z = d / 2;
    const p = [
      [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
      [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    ];
    const faces = [
      [0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]],
      [0, 1, 5, 4, [0, -1, 0]], [3, 7, 6, 2, [0, 1, 0]],
      [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]],
    ];
    for (const f of faces) {
      const a = p[f[0]], b = p[f[1]], c = p[f[2]], d2 = p[f[3]];
      const n = f[4];
      // fix winding so face normal matches
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) mb.quad(a, d2, c, b, n);
      else mb.quad(a, b, c, d2, n);
    }
    return mb.build();
  }
  function cylinderMesh(r, h, seg, caps) {
    const mb = new MeshBuilder();
    const hy = h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const p0 = [Math.cos(a0) * r, -hy, Math.sin(a0) * r];
      const p1 = [Math.cos(a1) * r, -hy, Math.sin(a1) * r];
      const p2 = [Math.cos(a1) * r, hy, Math.sin(a1) * r];
      const p3 = [Math.cos(a0) * r, hy, Math.sin(a0) * r];
      const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      // smooth normals
      mb.pos.push(...p0, ...p1, ...p2); mb.nrm.push(...n0, ...n1, ...n1);
      mb.pos.push(...p0, ...p2, ...p3); mb.nrm.push(...n0, ...n1, ...n0);
      if (caps !== false) {
        mb.tri([0, hy, 0], p3, p2, [0, 1, 0]);
        mb.tri([0, -hy, 0], p1, p0, [0, -1, 0]);
      }
    }
    return mb.build();
  }
  function sphereMesh(r, seg) {
    seg = seg || 20;
    const mb = new MeshBuilder();
    const rings = Math.max(6, Math.floor(seg / 2));
    for (let i = 0; i < rings; i++) {
      const p0 = i / rings * Math.PI, p1 = (i + 1) / rings * Math.PI;
      for (let j = 0; j < seg; j++) {
        const t0 = j / seg * Math.PI * 2, t1 = (j + 1) / seg * Math.PI * 2;
        const v = (p, t) => [Math.sin(p) * Math.cos(t) * r, Math.cos(p) * r, Math.sin(p) * Math.sin(t) * r];
        const n = (p, t) => [Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t)];
        const a = v(p0, t0), b = v(p1, t0), c = v(p1, t1), d = v(p0, t1);
        const na = n(p0, t0), nb = n(p1, t0), nc = n(p1, t1), nd = n(p0, t1);
        mb.pos.push(...a, ...b, ...c); mb.nrm.push(...na, ...nb, ...nc);
        mb.pos.push(...a, ...c, ...d); mb.nrm.push(...na, ...nc, ...nd);
      }
    }
    return mb.build();
  }
  function planeMesh(w, h) {
    const mb = new MeshBuilder();
    const x = w / 2, y = h / 2;
    mb.quad([-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], [0, 0, 1]);
    return mb.build();
  }
  function mergeMeshes(list) {
    let total = 0;
    for (const m of list) total += m.pos.length;
    const pos = new Float32Array(total), nrm = new Float32Array(total);
    let o = 0;
    for (const m of list) { pos.set(m.pos, o); nrm.set(m.nrm, o); o += m.pos.length; }
    return { pos, nrm, count: total / 3 };
  }
  function transformMesh(mesh, mat) {
    const out = { pos: new Float32Array(mesh.pos.length), nrm: new Float32Array(mesh.nrm.length), count: mesh.count };
    const nm = M4.invert(M4.create(), mat);
    for (let i = 0; i < mesh.count; i++) {
      const p = M4.transformPoint(mat, [mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]]);
      out.pos[i * 3] = p[0]; out.pos[i * 3 + 1] = p[1]; out.pos[i * 3 + 2] = p[2];
      const n = M4.transformDir(nm, [mesh.nrm[i * 3], mesh.nrm[i * 3 + 1], mesh.nrm[i * 3 + 2]]);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      out.nrm[i * 3] = n[0] / l; out.nrm[i * 3 + 1] = n[1] / l; out.nrm[i * 3 + 2] = n[2] / l;
    }
    return out;
  }

  global.AEGeom = {
    signedArea, polyArea, centroid, bbox, pointInPoly, simplify, resample,
    triangulate, extrudeContours, maskToContours, glyphContours, contoursToPath2D,
    clipPolys, normalizeContours, boxMesh, cylinderMesh, sphereMesh, planeMesh, mergeMeshes, transformMesh,
    MeshBuilder,
  };
})(window);