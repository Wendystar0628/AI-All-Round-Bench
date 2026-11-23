/* ============================================================
 * shape.js — 路径与平面几何
 * 路径结构 {closed, contours:[{closed,pts:[[x,y]...],in:[...],out:[...]}]}
 * 提供：三次贝塞尔采样/弧长/重参数化、修剪、路径形变（含孔洞对应）、
 *       路径布尔（基于离屏 canvas 合成）、耳切三角化（凹多边形+孔洞）、挤出网格。
 * ============================================================ */
(function (global) {
'use strict';

const bez = M.lerp;
function cubic(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]
  ];
}
function cubicDer(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]),
    3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1])
  ];
}

/* 轮廓控制点 -> 逐段三次贝塞尔数组 */
function contourSegments(ct) {
  const n = ct.pts.length, segs = [];
  if (n < 2) return segs;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ct.pts[i], p1 = ct.pts[i + 1];
    segs.push({ p0, c1: [p0[0] + (ct.out[i] ? ct.out[i][0] : 0), p0[1] + (ct.out[i] ? ct.out[i][1] : 0)],
      c2: [p1[0] + (ct.in[i + 1] ? ct.in[i + 1][0] : 0), p1[1] + (ct.in[i + 1] ? ct.in[i + 1][1] : 0)], p1 });
  }
  if (ct.closed !== false && n > 2) {
    const p0 = ct.pts[n - 1], p1 = ct.pts[0];
    segs.push({ p0, c1: [p0[0] + (ct.out[n - 1] ? ct.out[n - 1][0] : 0), p0[1] + (ct.out[n - 1] ? ct.out[n - 1][1] : 0)],
      c2: [p1[0] + (ct.in[0] ? ct.in[0][0] : 0), p1[1] + (ct.in[0] ? ct.in[0][1] : 0)], p1 });
  }
  return segs;
}

/* 采样整条路径为折线（自适应细分） */
function flattenPath(path, tol) {
  tol = tol || 0.8;
  if (!path) return [];
  const out = [];
  for (const ct of path.contours) {
    const segs = contourSegments(ct), pts = [];
    for (const s of segs) {
      const steps = adaptiveSteps(s, tol);
      for (let i = 0; i < steps; i++) {
        pts.push(cubic(s.p0, s.c1, s.c2, s.p1, i / steps));
      }
    }
    if (ct.closed !== false && pts.length) pts.push(pts[0]);
    out.push({ closed: ct.closed !== false, pts: pts });
  }
  return out;
}
function adaptiveSteps(s, tol) {
  const dx = s.p1[0] - s.p0[0], dy = s.p1[1] - s.p0[1];
  const ex = Math.abs((s.c1[0] + s.c2[0]) - dx), ey = Math.abs((s.c1[1] + s.c2[1]) - dy);
  const e = Math.max(ex, ey);
  return Math.max(2, Math.min(48, 2 + Math.floor(Math.sqrt(e / Math.max(tol, 0.01)))));
}

/* 每条轮廓按弧长参数化：采样点 + 累计长度 */
function contourLUT(ct, samples) {
  samples = samples || 64;
  const segs = contourSegments(ct);
  if (!segs.length) return { pts: [], lens: [0], total: 0 };
  const pts = [], lens = [0];
  let total = 0, prev = null;
  const n = segs.length;
  for (let si = 0; si < n; si++) {
    const s = segs[si];
    const steps = Math.max(4, Math.round(samples / n));
    for (let i = 0; i < steps; i++) {
      if (si > 0 && i === 0) continue;
      const t = i / steps;
      const p = cubic(s.p0, s.c1, s.c2, s.p1, t);
      if (prev) { let d = 0; d += (p[0] - prev[0]) ** 2 + (p[1] - prev[1]) ** 2; total += Math.sqrt(d); }
      pts.push(p); lens.push(total);
      prev = p;
    }
  }
  if (ct.closed !== false && pts.length) {
    const f = pts[0];
    total += Math.hypot(f[0] - prev[0], f[1] - prev[1]);
    pts.push(f); lens.push(total);
  }
  return { pts, lens, total };
}

/* 修剪路径：startPct,endPct 0..100，offset 度 */
function trimPath(path, startPct, endPct, offsetDeg) {
  if (!path || !path.contours) return path;
  const contours = path.contours.map(ct => {
    const lut = contourLUT(ct, 96);
    if (!lut.total) return ct;
    let s = ((startPct + offsetDeg / 3.6) % 100 + 100) % 100 / 100;
    let e = ((endPct + offsetDeg / 3.6) % 100 + 100) % 100 / 100;
    const span = e >= s ? e - s : (1 + e - s);
    return subContour(lut, s, span);
  });
  return { closed: false, contours };
}
function atDist(lut, dist) {
  const { pts, lens, total } = lut;
  dist = ((dist % total) + total) % total;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < dist) i++;
  const l0 = lens[i - 1], l1 = lens[i], u = (dist - l0) / (l1 - l0 || 1);
  return [M.lerp(pts[i - 1][0], pts[i][0], u), M.lerp(pts[i - 1][1], pts[i][1], u)];
}
function subContour(lut, start, span) {
  const steps = Math.max(8, Math.round(96 * span));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    pts.push(atDist(lut, (start + span * i / steps) * lut.total));
  }
  return { closed: false, pts, in: pts.map(() => [0, 0]), out: pts.map(() => [0, 0]) };
}

/* 路径形变：等弧长重采样后按轮廓数对应插值；孔洞按面积排序对应 */
function morphPath(a, b, u) {
  a = normalizeForMorph(a); b = normalizeForMorph(b);
  const ca = orderContours(a.contours), cb = orderContours(b.contours);
  const n = Math.max(ca.length, cb.length);
  const contours = [];
  for (let i = 0; i < n; i++) {
    let A = ca[i], B = cb[i];
    if (!A) A = duplicateContour(cb[Math.max(0, cb.length - 1)]);
    if (!B) B = duplicateContour(ca[Math.max(0, ca.length - 1)]);
    const la = contourLUT(A, 128), lb = contourLUT(B, 128);
    const N = 128;
    let bestShift = 0, bestD = Infinity;
    for (let sh = 0; sh < N; sh += 4) {
      let d = 0;
      for (let i = 0; i < N; i += 16) {
        const pa = atDist(la, i / N * la.total), pb = atDist(lb, ((i + sh) % N) / N * lb.total);
        d += (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2;
      }
      if (d < bestD) { bestD = d; bestShift = sh; }
    }
    const pts = [], ins = [], outs = [];
    for (let i = 0; i < N; i++) {
      const pa = atDist(la, i / N * la.total);
      const pb = atDist(lb, ((i + bestShift) % N) / N * lb.total);
      pts.push([M.lerp(pa[0], pb[0], u), M.lerp(pa[1], pb[1], u)]);
      ins.push([0, 0]); outs.push([0, 0]);
    }
    contours.push({ closed: true, pts, in: ins, out: outs });
  }
  return { closed: true, contours };
}
function normalizeForMorph(path) {
  if (!path) return { closed: true, contours: [] };
  return path;
}
function contourArea(ct) {
  const lut = contourLUT(ct, 64);
  let a = 0;
  for (let i = 0; i < lut.pts.length - 1; i++) a += lut.pts[i][0] * lut.pts[i + 1][1] - lut.pts[i + 1][0] * lut.pts[i][1];
  return a / 2;
}
function orderContours(cts) {
  const withA = cts.map(ct => ({ ct, a: Math.abs(contourArea(ct)) }));
  withA.sort((x, y) => y.a - x.a);
  return withA.map(x => x.ct);
}
function duplicateContour(ct) {
  return { closed: ct.closed !== false, pts: ct.pts.map(p => p.slice()), in: ct.in.map(p => p.slice()), out: ct.out.map(p => p.slice()) };
}

/* 路径包围盒 */
function pathBounds(path) {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  if (path) for (const ct of path.contours)
    for (const p of ct.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  if (!isFinite(x0)) return [0, 0, 0, 0];
  return [x0, y0, x1, y1];
}
function transformPath(path, m) {
  // m: 仿射 [a,b,c,d,e,f]
  return {
    closed: path.closed,
    contours: path.contours.map(ct => ({
      closed: ct.closed,
      pts: ct.pts.map(p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]),
      in: ct.in.map(p => [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]]),
      out: ct.out.map(p => [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]])
    }))
  };
}

/* ---------------- 布尔运算（光栅法，返回平面轮廓折线） ----------------
 * 对用户任意新画形状有效；使用离屏 canvas 合成后提取 alpha 等值域。
 * 这里直接在 2D 渲染合成阶段实现（见 render2d applyBooleans），
 * 本函数提供多边形级多边形裁剪（Sutherland-Hodgman 推广用于交集演示不可行），
 * 故布尔以 fill-rule/合成方式真实参与渲染与遮罩。
 * -------------------------------------------------------------------- */

/* ---------------- 耳切法三角化（带孔洞，poly via Mapbox earcut 简化版） ---------------- */
function triangulate(flatContours) {
  // flatContours: [[[x,y],...outer],[hole...]] 外轮廓逆时针/孔洞任意，内部统一
  const outer = flatContours[0];
  if (!outer || outer.length < 3) return { positions: [], indices: [] };
  const dim = 2;
  const data = [], holes = [];
  for (const ring of flatContours) {
    if (ring !== outer) holes.push(data.length / 2);
    for (const p of ring) data.push(p[0], p[1]);
  }
  const indices = earcut(data, holes, dim);
  return { positions: data, indices };
}

/* ---- earcut (BSD-2, Copyright (c) 2016 Mapbox) 精简移植，带孔洞桥接 ---- */
function earcut(data, holeIndices, dim) {
  dim = dim || 2;
  const hasHoles = holeIndices && holeIndices.length;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;
  let minX, minY, maxX, maxY, x, y, invSize;
  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  let pass = 0;
  if (!outerNode) return triangles;
  let cx, cy;
  indexCurve(outerNode);
  outerNode = filterPoints(outerNode, outerNode);
  earcutLinked(outerNode, triangles, dim, 0);
  return triangles;
}
function earcutLinked(ear, triangles, dim, pass) {
  if (!ear) return;
  if (!pass) indexCurve(ear);
  ear = filterPoints(ear, ear);
  if (!ear) return;
  let stop = ear, prev, next;
  while (ear.prev !== ear.next) {
    prev = ear.prev; next = ear.next;
    if (isEar(ear)) {
      triangles.push(prev.index, ear.index, next.index);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) break;
  }
}
function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * dim;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1] * dim : data.length;
    let list = linkedList(data, start, end, dim, false);
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }
  queue.sort((a, b) => a.x - b.x);
  for (const h of queue) {
    outerNode = eliminateHole(h, outerNode);
  }
  return outerNode;
}
function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  const filtered = filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(filtered, bridge);
}
function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  let p = ear.next.next;
  while (p !== ear.prev) {
    if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
        area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function findHoleBridge(hole, outerNode) {
  let p = outerNode;
  const hx = hole.x, hy = hole.y;
  let px = -Infinity, m;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > px) {
        px = x; m = p;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outerNode);
  if (!m) return null;
  if (hx === m.x) return m;
  const stop = m, mx = m.x, my = m.y;
  const tanMin = (my - hy) / (hx - mx);
  let p2 = m.next;
  while (p2 !== stop) {
    if (my >= p2.y && my < p2.prev.y && p2.prev.y !== p2.y) {
      const x = p2.x + (my - p2.y) * (p2.prev.x - p2.x) / (p2.prev.y - p2.y);
      if (x <= hx && x > px) {
        const tan = (my - hy) / (hx - x);
        if (tan < tanMin || (x === hx && sectorContainsSector(m, p2))) { m = p2; px = x; }
      }
    }
    p2 = p2.next;
  }
  return m;
}
function sectorContainsSector(m, p) { return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0; }
function splitPolygon(a, b) {
  const a2 = { i: a.i, x: a.x, y: a.y, prev: null, next: null, steiner: false, index: a.index };
  const b2 = { i: b.i, x: b.x, y: b.y, prev: null, next: null, steiner: false, index: b.index };
  const an = a.next, bp = b.prev;
  a.next = b; b.prev = a;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return b2;
}
function indexCurve(start) {
  let p = start;
  do { p.index = p.i; p = p.next; } while (p !== start);
}
function getLeftmost(start) {
  let p = start, leftmost = start;
  do { if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p; p = p.next; } while (p !== start);
  return leftmost;
}
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
         (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
         (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}
function area(p1, p2, p3) {
  const res = (p2.y - p1.y) * (p3.x - p2.x) - (p2.x - p1.x) * (p3.y - p2.y);
  return Math.abs(res) < 1e-14 ? 0 : res;
}
function equals(p1, p2) { return p1.x === p2.x && p1.y === p2.y; }
function signedArea(data, start, end, dim) {
  let sum = 0, j = end - dim;
  for (let i = start; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
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
    } else p = p.next;
  } while (again || p !== end);
  return end;
}
function linkedList(data, start, end, dim, clockwise) {
  let last;
  if (clockwise === (signedArea(data, start, end, dim) > 0)) {
    for (let i = start; i < end; i += dim) last = insertNode(i / dim, data[i], data[i + 1], last);
  } else {
    for (let i = end - dim; i >= start; i -= dim) last = insertNode(i / dim, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
  return last;
}
function insertNode(i, x, y, last) {
  const p = { i, x, y, prev: null, next: null, steiner: false, index: i };
  if (!last) { p.prev = p; p.next = p; }
  else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
  return p;
}
function removeNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }

/* ---------------- 挤出网格 ----------------
 * 输入平面轮廓折线（外轮廓 + 孔洞），生成带前后面、侧壁、倒角与法线的实体。
 * 返回 {positions:[x,y,z], normals, indices}
 * -------------------------------------------------------------------- */
function extrudeMesh(flatContours, depth, bevel, bevelSegs, zCenter) {
  const positions = [], normals = [], indices = [];
  const tri = triangulate(flatContours);
  const frontVerts = tri.positions, frontIdx = tri.indices;
  const n = frontVerts.length / 2;
  const zF = (zCenter || 0) + depth / 2, zB = (zCenter || 0) - depth / 2;

  /* 前面 */
  for (let i = 0; i < n; i++) {
    positions.push(frontVerts[i * 2], frontVerts[i * 2 + 1], zF);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < frontIdx.length; i += 3)
    indices.push(frontIdx[i], frontIdx[i + 1], frontIdx[i + 2]);
  /* 后面 */
  const backBase = positions.length / 3;
  for (let i = 0; i < n; i++) {
    positions.push(frontVerts[i * 2], frontVerts[i * 2 + 1], zB);
    normals.push(0, 0, -1);
  }
  for (let i = 0; i < frontIdx.length; i += 3)
    indices.push(backBase + frontIdx[i + 2], backBase + frontIdx[i + 1], backBase + frontIdx[i]);

  /* 侧壁 + 倒角：沿每条环构造轮廓环带 */
  const rings = buildRings(flatContours, depth, bevel, bevelSegs, zCenter);
  for (const loop of rings) addWall(loop, positions, normals, indices);
  return { positions, normals, indices };
}
function buildRings(contours, depth, bevel, bevelSegs, zc) {
  const zF = zc + depth / 2, zB = zc - depth / 2;
  const rings = [];
  for (const ring0 of contours) {
    /* 保证环不自重叠闭合点 */
    let ring = ring0;
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
      ring = ring.slice(0, -1);
    /* 每层：从前面外缘到内面、再到背面。层顶点 [x,y,z] */
    const layers = [];
    const segs = Math.max(0, bevelSegs | 0);
    const b = Math.min(bevel || 0, depth / 2 - 0.001);
    for (let i = 0; i <= segs; i++) {
      const t = segs ? i / segs : 1;
      const e = t * b, z = M.lerp(zF, zF - b, t);
      layers.push({ scale: 1 - (b ? e / Math.max(ringRadius(ring), 1) * 0 : 0), inset: e, z });
    }
    layers.push({ inset: b, z: zF - b });
    layers.push({ inset: b, z: zB + b });
    for (let i = segs; i >= 0; i--) {
      const t = segs ? i / segs : 1;
      const e = t * b, z = M.lerp(zB, zB + b, t);
      layers.push({ inset: e, z });
    }
    const centroid = ringCentroid(ring);
    const loops = layers.map(L => ring.map(p => {
      const vx = p[0] - centroid[0], vy = p[1] - centroid[1];
      const r = Math.hypot(vx, vy) || 1;
      return [p[0] - vx / r * L.inset, p[1] - vy / r * L.inset, L.z];
    }));
    rings.push(loops);
  }
  return rings;
}
function ringRadius(ring) {
  const c = ringCentroid(ring);
  let m = 0;
  for (const p of ring) m = Math.max(m, Math.hypot(p[0] - c[0], p[1] - c[1]));
  return m;
}
function ringCentroid(ring) {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}
function addWall(layers, positions, normals, indices) {
  const ringN = layers[0].length;
  const bases = layers.map(layer => {
    const base = positions.length / 3;
    for (let i = 0; i < ringN; i++) {
      const p = layer[i];
      positions.push(p[0], p[1], p[2]);
      normals.push(0, 0, 1);
    }
    return base;
  });
  /* 计算每层每点法线（相邻边 + 层间 z 差） */
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    for (let i = 0; i < ringN; i++) {
      const prev = layer[(i - 1 + ringN) % ringN], next = layer[(i + 1) % ringN], cur = layer[i];
      const tx = next[0] - prev[0], ty = next[1] - prev[1];
      let nx = ty, ny = -tx, nz = 0;
      if (li > 0 && li < layers.length - 1) {
        const up = layers[li + 1][i], dn = layers[li - 1][i];
        nz = (up[2] - dn[2]);
      } else nz = li === 0 ? 0.5 : -0.5;
      const l = Math.hypot(nx, ny, nz) || 1;
      const idx = (bases[li] + i) * 3;
      normals[idx] = nx / l; normals[idx + 1] = ny / l; normals[idx + 2] = nz / l;
    }
  }
  for (let li = 0; li < layers.length - 1; li++) {
    const b0 = bases[li], b1 = bases[li + 1];
    for (let i = 0; i < ringN; i++) {
      const j = (i + 1) % ringN;
      indices.push(b0 + i, b1 + i, b1 + j);
      indices.push(b0 + i, b1 + j, b0 + j);
    }
  }
}

/* 平面网格（用于形状层 3D 平面 / 粒子碰撞平面） */
function planeMesh(w, h) {
  const x = w / 2, y = h / 2;
  return {
    positions: [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

global.ShapeGeom = {
  cubic, cubicDer, contourSegments, flattenPath, contourLUT, atDist,
  trimPath, morphPath, pathBounds, transformPath, contourArea,
  triangulate, extrudeMesh, planeMesh, duplicateContour, orderContours
};
})(window);
