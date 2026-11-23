/* ============================================================
   path.js — 矢量路径 / 填充三角化 / 布尔运算 / 修剪 / 重复 / 形变
   路径数据结构： { closed, pts:[{x,y,in:{x,y},out:{x,y}}] }
   in/out 为相对节点的位置偏移（切线方向与长度）
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const P = AE.path = {};

  /* ---------------- 构造 ---------------- */
  P.create = function (pts, closed) {
    return { closed: !!closed, pts: pts.map(p => ({ x: p.x, y: p.y, in: p.in ? { ...p.in } : { x: 0, y: 0 }, out: p.out ? { ...p.out } : { x: 0, y: 0 } })) };
  };
  P.node = (x, y) => ({ x, y, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } });

  P.rect = function (x, y, w, h, r) {
    r = r || 0;
    if (r <= 0) {
      return P.create([P.node(x, y), P.node(x + w, y), P.node(x + w, y + h), P.node(x, y + h)], true);
    }
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    const pts = [
      P.node(x + r, y), P.node(x + w - r, y), P.node(x + w, y + r), P.node(x + w, y + h - r),
      P.node(x + w - r, y + h), P.node(x + r, y + h), P.node(x, y + h - r), P.node(x, y + r)
    ];
    const d = r * 0.5523;
    pts[0].out = { x: d, y: 0 }; pts[1].in = { x: -d, y: 0 };
    pts[1].out = { x: 0, y: d }; pts[2].in = { x: 0, y: -d };
    pts[2].out = { x: d, y: 0 }; pts[3].in = { x: -d, y: 0 };
    pts[3].out = { x: 0, y: d }; pts[4].in = { x: 0, y: -d };
    pts[4].out = { x: -d, y: 0 }; pts[5].in = { x: d, y: 0 };
    pts[5].out = { x: 0, y: -d }; pts[6].in = { x: 0, y: d };
    pts[6].out = { x: -d, y: 0 }; pts[7].in = { x: d, y: 0 };
    pts[7].out = { x: 0, y: -d }; pts[0].in = { x: 0, y: d };
    return P.create(pts, true);
  };

  P.ellipse = function (cx, cy, rx, ry) {
    const k = 0.5522847498;
    const pts = [
      { x: cx, y: cy - ry, in: { x: -rx * k, y: 0 }, out: { x: rx * k, y: 0 } },
      { x: cx + rx, y: cy, in: { x: 0, y: -ry * k }, out: { x: 0, y: ry * k } },
      { x: cx, y: cy + ry, in: { x: rx * k, y: 0 }, out: { x: -rx * k, y: 0 } },
      { x: cx - rx, y: cy, in: { x: 0, y: ry * k }, out: { x: 0, y: -ry * k } }
    ];
    return P.create(pts, true);
  };

  P.polygon = function (cx, cy, r, n, rot) {
    n = n || 5; rot = rot || -Math.PI / 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * Math.PI * 2;
      pts.push(P.node(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return P.create(pts, true);
  };

  P.star = function (cx, cy, r1, r2, n, rot) {
    n = n || 5; rot = rot || -Math.PI / 2;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i / (n * 2) * Math.PI * 2;
      const r = i % 2 ? r2 : r1;
      pts.push(P.node(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return P.create(pts, true);
  };

  P.polyline = function (points, closed) {
    return P.create(points.map(p => P.node(p[0], p[1])), closed);
  };

  P.clone = p => P.create(p.pts, p.closed);

  /* ---------------- 展平 / 度量 ---------------- */
  P.flatten = function (path, tol) {
    tol = tol || 0.35;
    const pts = path.pts, out = [];
    const n = pts.length;
    if (!n) return out;
    const push = (x, y) => {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - x) > 1e-6 || Math.abs(last[1] - y) > 1e-6) out.push([x, y]);
    };
    const segCount = path.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      const p0x = p0.x, p0y = p0.y;
      const p1x = p1.x, p1y = p1.y;
      const c1x = p0.x + p0.out.x, c1y = p0.y + p0.out.y;
      const c2x = p1.x + p1.in.x, c2y = p1.y + p1.in.y;
      const dx = p1x - p0x, dy = p1y - p0y;
      const d1 = Math.hypot(c1x - p0x, c1y - p0y), d2 = Math.hypot(c2x - p1x, c2y - p1y), d3 = Math.hypot(p1x - c2x, p1y - c2y);
      const dd = d1 + d2 + d3;
      if (dd < 1e-6) { push(p1x, p1y); continue; }
      const nSeg = Math.max(2, Math.min(160, Math.ceil(Math.sqrt(dd / Math.max(tol, 1e-3)) * 2.2)));
      for (let s = 0; s <= nSeg; s++) {
        const u = s / nSeg, mu = 1 - u;
        const x = mu * mu * mu * p0x + 3 * mu * mu * u * c1x + 3 * mu * u * u * c2x + u * u * u * p1x;
        const y = mu * mu * mu * p0y + 3 * mu * mu * u * c1y + 3 * mu * u * u * c2y + u * u * u * p1y;
        push(x, y);
      }
    }
    if (path.closed && out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) out.pop();
    }
    return out;
  };

  P.length = function (path) {
    const f = P.flatten(path, 0.6);
    let L = 0;
    for (let i = 1; i < f.length; i++) L += Math.hypot(f[i][0] - f[i - 1][0], f[i][1] - f[i - 1][1]);
    if (path.closed && f.length > 1) L += Math.hypot(f[0][0] - f[f.length - 1][0], f[0][1] - f[f.length - 1][1]);
    return L;
  };

  P.bounds = function (path) {
    const f = P.flatten(path, 0.6);
    if (!f.length) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of f) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };

  P.contoursBounds = function (contours) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (const p of c) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };

  /* ---------------- 变换 ---------------- */
  P.transform = function (path, mat) {
    const out = P.create(path.pts, path.closed);
    for (const p of out.pts) {
      const a = U.mat4.xformPoint(mat, [p.x, p.y]);
      const ai = U.mat4.xformPoint(mat, [p.x + p.in.x, p.y + p.in.y]);
      const ao = U.mat4.xformPoint(mat, [p.x + p.out.x, p.y + p.out.y]);
      p.x = a[0]; p.y = a[1];
      p.in = { x: ai[0] - a[0], y: ai[1] - a[1] };
      p.out = { x: ao[0] - a[0], y: ao[1] - a[1] };
    }
    return out;
  };

  /* ---------------- 描边轮廓 ---------------- */
  /** 由折线生成描边多边形轮廓 */
  P.strokeOutline = function (pts, width, closed, cap) {
    cap = cap || 'round';
    const hw = Math.max(width, 1e-4) / 2;
    const n = pts.length;
    if (n < 2) return [];
    const normals = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dy) || 1;
      normals.push([-dy / l, dx / l]);
    }
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      let nx, ny;
      if (i === 0) { nx = normals[0][0]; ny = normals[0][1]; }
      else if (i === n - 1) { nx = normals[n - 2][0]; ny = normals[n - 2][1]; }
      else {
        const a = normals[i - 1], b = normals[i];
        let mx = a[0] + b[0], my = a[1] + b[1];
        const l = Math.hypot(mx, my);
        if (l < 1e-6) { mx = b[0]; my = b[1]; }
        else {
          mx /= l; my /= l;
          const cosHalf = mx * b[0] + my * b[1];
          const scale = Math.min(3.2, 1 / Math.max(cosHalf, 0.25));
          mx *= scale; my *= scale;
        }
        nx = mx; ny = my;
      }
      left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
      right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
    }
    const contour = [];
    contour.push(...left);
    // 末端封口
    if (cap === 'round') {
      const a = pts[n - 1], dir = [pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]];
      const l = Math.hypot(dir[0], dir[1]) || 1;
      const base = Math.atan2(dir[1], dir[0]);
      for (let k = 1; k < 10; k++) {
        const ang = base - Math.PI * k / 10;
        contour.push([a[0] + Math.cos(ang) * hw, a[1] + Math.sin(ang) * hw]);
      }
    } else {
      contour.push(right[n - 1]);
    }
    contour.push(...right.reverse());
    if (cap === 'round') {
      const a = pts[0], dir = [pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]];
      const l = Math.hypot(dir[0], dir[1]) || 1;
      const base = Math.atan2(dir[1], dir[0]);
      for (let k = 1; k < 10; k++) {
        const ang = base - Math.PI * k / 10;
        contour.push([a[0] + Math.cos(ang) * hw, a[1] + Math.sin(ang) * hw]);
      }
    } else {
      contour.push(right[0]);
    }
    return contour;
  };

  /* ---------------- 耳切三角化（支持孔洞） ---------------- */
  function Node(i, x, y) { this.i = i; this.x = x; this.y = y; this.prev = null; this.next = null; this.steiner = false; }
  function insertNode(i, x, y, last) {
    const p = new Node(i, x, y);
    if (!last) { p.prev = p; p.next = p; }
    else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
    return p;
  }
  function removeNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }
  function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }
  function linkedList(data, start, end, dim, clockwise) {
    let last = null;
    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
      for (let i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
      for (let i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }
    if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
    return last;
  }
  function filterPoints(start, end) {
    if (!start) return start; if (!end) return end;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
        removeNode(p); p = end = p.prev; if (p === p.next) break; again = true;
      } else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function area(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function equals(p1, p2) { return p1.x === p2.x && p1.y === p2.y; }
  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
      (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
      (bx - px) * (cy - py) >= (cx - px) * (by - py);
  }
  function isEar(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
    const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
    let p = c.next;
    while (p !== a) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
        pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
      (((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) &&
        (area(a.prev, a, b.prev) || area(a, b.prev, b))) ||
        (polygonContains(a, b) && polygonContains(b, a))) &&
        (area(a.prev, a, b.prev) || area(a, b.prev, b)));
  }
  function intersects(p1, q1, p2, q2) {
    const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
    return false;
  }
  function onSegment(p, q, r) { return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y); }
  function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }
  function intersectsPolygon(a, b) {
    let p = a;
    do {
      if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
      p = p.next;
    } while (p !== a);
    return false;
  }
  function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 : area(a, a.prev, b) >= 0;
  }
  function middleInside(a, b) {
    let p = a, inside = false;
    const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do {
      if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
        (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
      p = p.next;
    } while (p !== a);
    return inside;
  }
  function polygonContains(a, b) {
    let p = a;
    do {
      if (p.i !== a.i && p.next.i !== a.i && p.next.i !== b.i && pointInTriangle(a.x, a.y, b.x, b.y, p.next.x, p.next.y, p.x, p.y)) return true;
      p = p.next;
    } while (p !== a);
    return false;
  }
  function splitPolygon(a, b) {
    const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y);
    const an = a.next, bp = b.prev;
    a.next = b; b.prev = a; a2.next = an; an.prev = a2;
    b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
    return b2;
  }
  function cureLocalIntersections(start, triangles, dim) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0);
        removeNode(p); removeNode(p.next); p = start = b;
      }
      p = p.next;
    } while (p !== start);
    return filterPoints(p);
  }
  function splitEarcut(start, triangles, dim, depth) {
    if (!start) return start;
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          let c = splitPolygon(a, b);
          a = filterPoints(a, a.next); c = filterPoints(c, c.next);
          const out = splitEarcut(a, triangles, dim, depth + 1);
          const out2 = splitEarcut(c, triangles, dim, depth + 1);
          return out || out2;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
    return start;
  }
  function earcutLinked(ear, triangles, dim, pass) {
    if (!ear) return;
    let stop = ear, prev, next;
    while (ear.prev !== ear.next) {
      prev = ear.prev; next = ear.next;
      if (isEar(ear)) {
        triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0);
        removeNode(ear);
        ear = next.next; stop = next.next;
        continue;
      }
      ear = next;
      if (ear === stop) {
        if (!pass) earcutLinked(filterPoints(ear), triangles, dim, 1);
        else if (pass === 1) { ear = cureLocalIntersections(filterPoints(ear), triangles, dim); earcutLinked(ear, triangles, dim, 2); }
        else if (pass === 2) splitEarcut(ear, triangles, dim, 0);
        break;
      }
    }
  }
  /** 耳切三角化入口：data 为扁平顶点数组，holeIndices 为各环起点 */
  function earcut(data, holeIndices, dim) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    let outerNode = linkedList(data, 0, outerLen, dim, true);
    const triangles = [];
    if (!outerNode || outerNode.next === outerNode.prev) return triangles;
    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    earcutLinked(outerNode, triangles, dim);
    return triangles;
  }
  function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];
    for (let i = 0, len = holeIndices.length; i < len; i++) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
      const list = linkedList(data, start, end, dim, false);
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
    queue.sort((a, b) => a.x - b.x);
    for (const hole of queue) outerNode = eliminateHole(hole, outerNode);
    return outerNode;
  }
  function eliminateHole(hole, outerNode) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) return outerNode;
    const bridgeReverse = splitPolygon(bridge, hole);
    filterPoints(bridgeReverse, bridgeReverse.next);
    return filterPoints(bridge, bridge.next);
  }
  function findHoleBridge(hole, outerNode) {
    let p = outerNode, qx = -Infinity, m = null;
    const hx = hole.x, hy = hole.y;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x; m = p.x < p.next.x ? p : p.next;
          if (x === hx) return m;
        }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    const stop = m;
    const mx = m.x, my = m.y;
    let tanMin = Infinity;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x &&
        pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
          m = p; tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  }
  function getLeftmost(start) {
    let p = start, leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
      p = p.next;
    } while (p !== start);
    return leftmost;
  }

  /**
   * 三角化轮廓集合（外轮廓 + 孔洞）
   * contours: [[ [x,y], ... ], ...]  外轮廓逆时针、孔洞顺时针（自动判定）
   * 返回 { verts:[x,y,...], indices:[...] }
   */
  P.triangulate = function (contours) {
    const res = { verts: [], indices: [] };
    if (!contours || !contours.length) return res;
    // 统一输入：既接受点数组，也接受 {pts, hole}
    const norm = contours.map(c => Array.isArray(c) ? { pts: c, hole: false } : { pts: c.pts || [], hole: !!c.hole });
    // 判定外轮廓 / 孔洞：按包含关系与面积
    const items = norm.map(c => {
      const pts = dedupe(c.pts);
      let a = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
      return { pts, area: a / 2, hole: c.hole };
    }).filter(it => it.pts.length >= 3);
    if (!items.length) return res;

    // 判断包含关系
    const parent = items.map((_, i) => -1);
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        if (containsPoint(items[i].pts, items[j].pts[0])) {
          if (Math.abs(items[i].area) > Math.abs(items[j].area)) parent[j] = i;
        }
      }
    }
    const isHole = items.map((it, i) => {
      const p = parent[i];
      const contained = p >= 0 && Math.abs(items[p].area) > Math.abs(it.area);
      return it.hole || contained;
    });
    const outers = items.filter((_, i) => !isHole[i]);
    if (!outers.length) return res;
    const holes = items.filter((_, i) => isHole[i]);

    // 每个外轮廓单独做一次耳切（earcut 只支持单一外环 + 其孔洞）
    const allVerts = [];
    const allIdx = [];
    for (const o of outers) {
      const data = [];
      const holeIndices = [];
      const ccw = o.area > 0 ? o.pts : o.pts.slice().reverse();
      for (const p of ccw) data.push(p[0], p[1]);
      // 收集属于该外轮廓的孔洞（holeIndices 记录各孔洞起点，外环占据开头）
      for (const h of holes) {
        const hp = h.pts;
        const cx = hp.reduce((s, p) => s + p[0], 0) / hp.length;
        const cy = hp.reduce((s, p) => s + p[1], 0) / hp.length;
        if (!containsPoint(ccw, [cx, cy])) continue;
        holeIndices.push(data.length / 2);
        const cw = h.area > 0 ? hp.slice().reverse() : hp;
        for (const p of cw) data.push(p[0], p[1]);
      }
      const tris = earcut(data, holeIndices, 2);
      const base = allVerts.length / 2;
      for (const v of data) allVerts.push(v);
      for (const i of tris) allIdx.push(base + i);
    }
    res.verts = allVerts;
    res.indices = allIdx;
    return res;
  };

  function dedupe(c) {
    const out = [];
    for (const p of c) {
      const l = out[out.length - 1];
      if (!l || Math.abs(l[0] - p[0]) > 1e-7 || Math.abs(l[1] - p[1]) > 1e-7) out.push([p[0], p[1]]);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) out.pop();
    }
    return out;
  }

  function containsPoint(poly, pt) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + 1e-12) + xi)) inside = !inside;
    }
    return inside;
  }
  P.containsPoint = containsPoint;

  /* ---------------- 光栅化（用于布尔运算 / 字形描摹） ---------------- */
  /** 将轮廓集渲染为覆盖率场 */
  P.rasterize = function (contours, bbox, W, H, ss) {
    ss = ss || 2;
    const field = new Float32Array(W * H);
    const sx = W / Math.max(bbox.x1 - bbox.x0, 1e-6);
    const sy = H / Math.max(bbox.y1 - bbox.y0, 1e-6);
    const edges = [];
    for (const c of contours) {
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        edges.push([(a[0] - bbox.x0) * sx, (a[1] - bbox.y0) * sy, (b[0] - bbox.x0) * sx, (b[1] - bbox.y0) * sy]);
      }
    }
    for (let py = 0; py < H; py++) {
      for (let sy2 = 0; sy2 < ss; sy2++) {
        const y = py + (sy2 + 0.5) / ss;
        const xs = [];
        for (const e of edges) {
          const [x1, y1, x2, y2] = e;
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
          }
        }
        if (!xs.length) continue;
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const xa = xs[i], xb = xs[i + 1];
          if (xb <= 0 || xa >= W) continue;
          const pa = Math.max(0, xa), pb = Math.min(W, xb);
          const i0 = Math.floor(pa), i1 = Math.min(W - 1, Math.ceil(pb) - 1);
          for (let px = i0; px <= i1; px++) {
            const cov = Math.max(0, Math.min(pb, px + 1) - Math.max(pa, px));
            if (cov > 0) field[py * W + px] += cov / ss;
          }
        }
      }
    }
    for (let i = 0; i < field.length; i++) field[i] = U.clamp(field[i], 0, 1);
    return field;
  };

  /** Marching squares：提取等值线轮廓（无向线段拼接，保证独立环不被合并） */
  P.marchingSquares = function (field, W, H, level) {
    level = level === undefined ? 0.5 : level;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : field[y * W + x];
    const segs = [];
    const interp = (v1, v2, p1, p2) => {
      const d = v2 - v1;
      const t = Math.abs(d) < 1e-9 ? 0.5 : (level - v1) / d;
      return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
    };
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const v0 = at(x, y), v1 = at(x + 1, y), v2 = at(x + 1, y + 1), v3 = at(x, y + 1);
        let idx = 0;
        if (v0 > level) idx |= 8;
        if (v1 > level) idx |= 4;
        if (v2 > level) idx |= 2;
        if (v3 > level) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const p0 = [x, y], p1 = [x + 1, y], p2 = [x + 1, y + 1], p3 = [x, y + 1];
        const eTop = () => interp(v0, v1, p0, p1);
        const eRight = () => interp(v1, v2, p1, p2);
        const eBottom = () => interp(v3, v2, p3, p2);
        const eLeft = () => interp(v0, v3, p0, p3);
        switch (idx) {
          case 1: segs.push([eLeft(), eBottom()]); break;
          case 2: segs.push([eBottom(), eRight()]); break;
          case 3: segs.push([eLeft(), eRight()]); break;
          case 4: segs.push([eRight(), eTop()]); break;
          case 5: {
            const center = (v0 + v1 + v2 + v3) / 4;
            if (center > level) { segs.push([eLeft(), eTop()]); segs.push([eBottom(), eRight()]); }
            else { segs.push([eLeft(), eBottom()]); segs.push([eRight(), eTop()]); }
            break;
          }
          case 6: segs.push([eBottom(), eTop()]); break;
          case 7: segs.push([eLeft(), eTop()]); break;
          case 8: segs.push([eTop(), eLeft()]); break;
          case 9: segs.push([eTop(), eBottom()]); break;
          case 10: {
            const center = (v0 + v1 + v2 + v3) / 4;
            if (center > level) { segs.push([eTop(), eRight()]); segs.push([eBottom(), eLeft()]); }
            else { segs.push([eTop(), eLeft()]); segs.push([eBottom(), eRight()]); }
            break;
          }
          case 11: segs.push([eTop(), eRight()]); break;
          case 12: segs.push([eRight(), eLeft()]); break;
          case 13: segs.push([eRight(), eBottom()]); break;
          case 14: segs.push([eBottom(), eLeft()]); break;
        }
      }
    }
    // 端点索引 + 无向拼接
    const key = p => p[0].toFixed(3) + ',' + p[1].toFixed(3);
    const map = new Map();
    segs.forEach((s, i) => {
      for (const p of s) {
        const k = key(p);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(i);
      }
    });
    const used = new Array(segs.length).fill(false);
    const contours = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const loop = [segs[i][0], segs[i][1]];
      let cur = segs[i][1];
      let guard = 0;
      while (guard++ < 200000) {
        const k = key(cur);
        const cands = (map.get(k) || []).filter(si => !used[si]);
        if (!cands.length) break;
        const si = cands[0];
        used[si] = true;
        const s = segs[si];
        const other = key(s[0]) === k ? s[1] : s[0];
        if (key(other) === key(loop[0])) { loop.push(other); break; }
        loop.push(other);
        cur = other;
      }
      if (loop.length > 3) contours.push(loop);
    }
    return contours;
  };

  /** 布尔运算：op = union | subtract | intersect | xor */
  P.boolean = function (contoursA, contoursB, op, resolution) {
    const all = contoursA.concat(contoursB);
    const bb = P.contoursBounds(all);
    if (bb.w <= 0 || bb.h <= 0) return op === 'intersect' ? [] : (op === 'subtract' ? contoursA.slice() : contoursB.slice());
    const pad = Math.max(bb.w, bb.h) * 0.02 + 1;
    const bbox = { x0: bb.x0 - pad, y0: bb.y0 - pad, x1: bb.x1 + pad, y1: bb.y1 + pad };
    const maxDim = resolution || 420;
    const W = Math.max(8, Math.min(maxDim, Math.round((bbox.x1 - bbox.x0) / Math.max(bb.w, bb.h) * maxDim)));
    const H = Math.max(8, Math.min(maxDim, Math.round((bbox.y1 - bbox.y0) / Math.max(bb.w, bb.h) * maxDim)));
    const fa = P.rasterize(contoursA, bbox, W, H, 2);
    const fb = P.rasterize(contoursB, bbox, W, H, 2);
    const out = new Float32Array(W * H);
    for (let i = 0; i < out.length; i++) {
      const a = fa[i], b = fb[i];
      switch (op) {
        case 'union': out[i] = Math.max(a, b); break;
        case 'subtract': out[i] = Math.min(a, b); break;
        case 'intersect': out[i] = Math.min(a, b); break;
        case 'xor': out[i] = Math.abs(a - b); break;
      }
    }
    // intersect 需要 a 与 b 都覆盖：使用乘法
    if (op === 'intersect') for (let i = 0; i < out.length; i++) out[i] = fa[i] * fb[i];
    const contours = P.marchingSquares(out, W, H, 0.5);
    const sx = (bbox.x1 - bbox.x0) / W, sy = (bbox.y1 - bbox.y0) / H;
    return contours.map(c => c.map(p => [bbox.x0 + p[0] * sx, bbox.y0 + p[1] * sy]));
  };

  /* ---------------- 修剪路径 ---------------- */
  /** start/end 为 0..1 百分比，offset 为周期偏移 */
  P.trim = function (path, start, end, offset) {
    const flat = P.flatten(path, 0.4);
    if (flat.length < 2) return P.create([], path.closed);
    const closed = path.closed;
    const pts = closed ? flat.concat([flat[0]]) : flat;
    const segLen = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segLen.push(l); total += l;
    }
    if (total <= 0) return P.create([], path.closed);
    offset = offset || 0;
    let s = U.clamp(start, 0, 1) + offset;
    let e = U.clamp(end, 0, 1) + offset;
    if (e <= s) e += 1;
    const segStart = s * total, segEnd = e * total;
    const out = [];
    let acc = 0;
    const cuts = [];
    for (let i = 0; i < segLen.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = segLen[i];
      if (acc + l >= segStart && acc <= segEnd) {
        const t0 = U.clamp((segStart - acc) / l, 0, 1);
        const t1 = U.clamp((segEnd - acc) / l, 0, 1);
        const p0 = [U.lerp(a[0], b[0], t0), U.lerp(a[1], b[1], t0)];
        const p1 = [U.lerp(a[0], b[0], t1), U.lerp(a[1], b[1], t1)];
        out.push(p0);
        if (t1 > 0) out.push(p1);
      }
      acc += l;
      if (acc > segEnd) break;
    }
    if (!out.length) out.push(pts[0]);
    return P.polyline(out, false);
  };

  /* ---------------- 重复器 ---------------- */
  /** count 份，每次变换；返回轮廓数组 */
  P.repeat = function (contours, count, transformFn) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const fn = transformFn(i);
      for (const c of contours) {
        out.push(c.map(p => {
          const q = fn(p);
          return [q[0], q[1]];
        }));
      }
    }
    return out;
  };

  /* ---------------- 形变（路径 morph） ---------------- */
  P.resample = function (contour, n) {
    const pts = dedupe(contour);
    if (!pts.length) return [];
    const closed = true;
    const p = pts.slice();
    if (closed) p.push(pts[0]);
    const segLen = [];
    let total = 0;
    for (let i = 1; i < p.length; i++) {
      const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      segLen.push(l); total += l;
    }
    if (total <= 0) return new Array(n).fill(0).map(() => [pts[0][0], pts[0][1]]);
    const out = [];
    for (let i = 0; i < n; i++) {
      let d = (i / n) * total, k = 0;
      while (k < segLen.length && d > segLen[k]) { d -= segLen[k]; k++; }
      if (k >= segLen.length) { out.push([p[p.length - 1][0], p[p.length - 1][1]]); continue; }
      const t = segLen[k] > 0 ? d / segLen[k] : 0;
      out.push([U.lerp(p[k][0], p[k + 1][0], t), U.lerp(p[k][1], p[k + 1][1], t)]);
    }
    return out;
  };

  /** 对应两组轮廓的形变 */
  P.morph = function (contoursA, contoursB, t) {
    const out = [];
    const n = Math.max(contoursA.length, contoursB.length);
    for (let i = 0; i < n; i++) {
      const a = contoursA[i % contoursA.length] || [];
      const b = contoursB[i % contoursB.length] || [];
      if (!a.length || !b.length) { out.push(a.length ? a : b); continue; }
      const N = Math.max(a.length, b.length, 24);
      const ra = P.resample(a, N), rb = P.resample(b, N);
      // 起点对齐：寻找最优旋转偏移
      let best = 0, bestD = Infinity;
      const step = Math.max(1, Math.floor(N / 24));
      for (let off = 0; off < N; off += step) {
        let d = 0;
        for (let k = 0; k < N; k += 3) {
          const bb = rb[(k + off) % N];
          d += (ra[k][0] - bb[0]) ** 2 + (ra[k][1] - bb[1]) ** 2;
        }
        if (d < bestD) { bestD = d; best = off; }
      }
      const merged = [];
      for (let k = 0; k < N; k++) {
        const bb = rb[(k + best) % N];
        merged.push([U.lerp(ra[k][0], bb[0], t), U.lerp(ra[k][1], bb[1], t)]);
      }
      out.push(merged);
    }
    return out;
  };

  /* ---------------- 路径工具 ---------------- */
  P.pointInPath = function (path, x, y) {
    const f = P.flatten(path, 0.4);
    let inside = false;
    for (let i = 0, j = f.length - 1; i < f.length; j = i++) {
      if (((f[i][1] > y) !== (f[j][1] > y)) && (x < (f[j][0] - f[i][0]) * (y - f[i][1]) / (f[j][1] - f[i][1] + 1e-12) + f[i][0])) inside = !inside;
    }
    return inside;
  };
  P.closestOnPath = function (path, x, y) {
    const f = P.flatten(path, 0.4);
    let best = null, bd = Infinity;
    for (let i = 0; i < f.length; i++) {
      const d = (f[i][0] - x) ** 2 + (f[i][1] - y) ** 2;
      if (d < bd) { bd = d; best = f[i]; }
    }
    return { pt: best, dist: Math.sqrt(bd) };
  };
})(window);
