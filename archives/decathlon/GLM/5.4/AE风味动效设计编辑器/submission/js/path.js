/* ============================================================
   path.js — 矢量路径：轮廓/控制点、压平、修剪、偏移、布尔、形变
   路径结构: { contours: [ { closed:true, pts:[{x,y,ix,iy,ox,oy}] } ] }
   控制柄为相对偏移：seg 从 p[i] 经 p[i]+(ox,oy), p[i+1]+(ix,iy) 到 p[i+1]
   ============================================================ */
(function (global) {
  'use strict';
  const { TAU, clamp, lerp, triangulate, polygonArea, simplify, flattenCubic, cubicPoint } = U;

  /* ---------- 基础构造 ---------- */
  function P(x, y) { return { x, y, ix: 0, iy: 0, ox: 0, oy: 0 }; }
  function contourFromPoints(pts, closed = true) { return { closed, pts: pts.map(p => Array.isArray(p) ? P(p[0], p[1]) : P(p.x, p.y)) }; }
  function pathFromPolylines(polys, closed = true) {
    return { contours: polys.map(p => ({ closed, pts: p.map(q => Array.isArray(q) ? P(q[0], q[1]) : P(q.x, q.y)) })) };
  }
  function rectPath(x, y, w, h, r = 0) {
    if (r <= 0) {
      return { contours: [{ closed: true, pts: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)] }] };
    }
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    const k = 0.5522847498 * r;
    const pts = [
      P(x + r, y), P(x + w - r, y), P(x + w, y + r), P(x + w, y + h - r), P(x + w - r, y + h), P(x + r, y + h), P(x, y + h - r), P(x, y + r)
    ];
    pts[0].ox = -k; pts[0].oy = 0; pts[0].ix = k; pts[0].iy = 0;
    pts[1].ox = k; pts[1].oy = 0; pts[1].ix = -k; pts[1].iy = 0;
    pts[2].ox = 0; pts[2].oy = -k; pts[2].ix = 0; pts[2].iy = k;
    pts[3].ox = 0; pts[3].oy = k; pts[3].ix = 0; pts[3].iy = -k;
    pts[4].ox = -k; pts[4].oy = 0; pts[4].ix = k; pts[4].iy = 0;
    pts[5].ox = k; pts[5].oy = 0; pts[5].ix = -k; pts[5].iy = 0;
    pts[6].ox = 0; pts[6].oy = k; pts[6].ix = 0; pts[6].iy = -k;
    pts[7].ox = 0; pts[7].oy = -k; pts[7].ix = 0; pts[7].iy = k;
    return { contours: [{ closed: true, pts }] };
  }
  function ellipsePath(cx, cy, rx, ry, rot = 0) {
    const pts = [];
    const k = 0.5522847498;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      const tx = -Math.sin(a) * rx * k, ty = Math.cos(a) * ry * k;
      const p = P(cx + px * c - py * s, cy + px * s + py * c);
      p.ix = (-tx * c + ty * s); p.iy = (-tx * s - ty * c);
      p.ox = (tx * c - ty * s); p.oy = (tx * s + ty * c);
      pts.push(p);
    }
    return { contours: [{ closed: true, pts }] };
  }
  function starPath(cx, cy, r1, r2, n, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n;
      pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return { contours: [{ closed: true, pts }] };
  }
  function polylinePath(pts, closed = true) { return { contours: [{ closed, pts: pts.map(p => Array.isArray(p) ? P(p[0], p[1]) : P(p.x, p.y)) }] }; }

  /* ---------- 压平 ---------- */
  function flattenContour(c, tol = 0.2) {
    const pts = c.pts;
    if (!pts.length) return [];
    const out = [[pts[0].x, pts[0].y]];
    const n = pts.length;
    const lim = c.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      flattenCubic([a.x, a.y], [a.x + a.ox, a.y + a.oy], [b.x + b.ix, b.y + b.iy], [b.x, b.y], tol, out);
    }
    if (!c.closed) { /* 保留 */ }
    return out;
  }
  function flatten(path, tol = 0.25) {
    return path.contours.filter(c => c.pts.length > 1).map(c => ({ pts: flattenContour(c, tol), closed: c.closed }));
  }
  function flattenToPolys(path, tol = 0.25) {
    return flatten(path, tol).map(c => c.pts);
  }

  /* ---------- Catmull-Rom → 贝塞尔（带角点检测） ---------- */
  function smoothToContour(pts, closed, cornerCos = 0.55, tension = 1) {
    const n = pts.length;
    if (n < 2) return { closed, pts: pts.map(p => P(p[0], p[1])) };
    const out = pts.map(p => P(p[0], p[1]));
    const corner = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) { corner[i] = true; continue; }
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
      const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      if (l1 < 1e-9 || l2 < 1e-9) { corner[i] = true; continue; }
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      corner[i] = cos < cornerCos;
    }
    for (let i = 0; i < n; i++) {
      if (corner[i]) continue;
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const t = tension / 6;
      out[i].ix = (a[0] - c[0]) * t; out[i].iy = (a[1] - c[1]) * t;
      out[i].ox = (c[0] - a[0]) * t; out[i].oy = (c[1] - a[1]) * t;
    }
    return { closed, pts: out };
  }

  /* ---------- 变换 ---------- */
  function transformContour(c, m) {
    return { closed: c.closed, pts: c.pts.map(p => {
      const q = U.M2.apply(m, p.x, p.y);
      const ih = U.M2.apply(m, p.ix, p.iy);
      const oh = U.M2.apply(m, p.ox, p.oy);
      return { x: q[0], y: q[1], ix: ih[0], iy: ih[1], ox: oh[0], oy: oh[1] };
    }) };
  }
  function transformPath(path, m) { return { contours: path.contours.map(c => transformContour(c, m)) }; }
  function translatePath(path, x, y) { return transformPath(path, [1, 0, 0, 1, x, y]); }
  function scalePath(path, sx, sy, cx = 0, cy = 0) { return transformPath(path, U.M2.mul(U.M2.translate(cx, cy), U.M2.mul(U.M2.scale(sx, sy), U.M2.translate(-cx, -cy)))); }

  /* ---------- 包围盒 / 长度 ---------- */
  function pathBBox(path) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of path.contours) for (const p of c.pts) {
      x0 = Math.min(x0, p.x, p.x + p.ix, p.x + p.ox); x1 = Math.max(x1, p.x, p.x + p.ix, p.x + p.ox);
      y0 = Math.min(y0, p.y, p.y + p.iy, p.y + p.oy); y1 = Math.max(y1, p.y, p.y + p.iy, p.y + p.oy);
    }
    if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0, x1: 0, y1: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x1, y1 };
  }
  function contourLength(c) {
    const f = flattenContour(c, 0.5);
    let L = 0; for (let i = 0; i < f.length - 1; i++) L += Math.hypot(f[i + 1][0] - f[i][0], f[i + 1][1] - f[i][1]);
    return L;
  }
  function pathLength(path) { return path.contours.reduce((s, c) => s + contourLength(c), 0); }

  /* ---------- 修剪路径（精确贝塞尔切分） ---------- */
  function segLens(c, per = 16) {
    const n = c.pts.length, lim = c.closed ? n : n - 1, out = [];
    for (let i = 0; i < lim; i++) {
      const a = c.pts[i], b = c.pts[(i + 1) % n];
      let L = 0, prev = [a.x, a.y];
      for (let k = 1; k <= per; k++) {
        const t = k / per;
        const p = cubicPoint([a.x, a.y], [a.x + a.ox, a.y + a.oy], [b.x + b.ix, b.y + b.iy], [b.x, b.y], t);
        L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
      }
      out.push({ L, u: L });
    }
    let total = 0; for (const s of out) { s.s = total; total += s.L; }
    return { segs: out, total };
  }
  function splitAt(c, dist, lens) {
    // 返回 {i, t}：第 i 段参数 t
    if (dist <= 0) return { i: 0, t: 0 };
    if (dist >= lens.total) return { i: lens.segs.length - 1, t: 1 };
    for (let i = 0; i < lens.segs.length; i++) {
      const s = lens.segs[i];
      if (dist <= s.s + s.L) return { i, t: (dist - s.s) / (s.L || 1e-9) };
    }
    return { i: lens.segs.length - 1, t: 1 };
  }
  function deCasteljau(p0, p1, p2, p3, t) {
    const m01 = [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)];
    const m12 = [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)];
    const m23 = [lerp(p2[0], p3[0], t), lerp(p2[1], p3[1], t)];
    const m012 = [lerp(m01[0], m12[0], t), lerp(m01[1], m12[1], t)];
    const m123 = [lerp(m12[0], m23[0], t), lerp(m12[1], m23[1], t)];
    const m = [lerp(m012[0], m123[0], t), lerp(m012[1], m123[1], t)];
    return { left: [p0, m01, m012, m], right: [m, m123, m23, p3], mid: m };
  }
  // 返回修剪后的轮廓（点列，带控制柄）
  function trimContour(c, sFrac, eFrac) {
    const lens = segLens(c, 24);
    if (lens.total < 1e-9) return null;
    const wrap = eFrac < sFrac;
    let s = sFrac * lens.total, e = eFrac * lens.total;
    const n = c.pts.length;
    if (Math.abs(eFrac - sFrac) < 1e-6) return { closed: false, pts: [] };
    const full = Math.abs((eFrac - sFrac + 1) % 1 - 1) < 1e-6 && c.closed;
    if (full) return c;
    const out = [];
    const pushPoint = (p, inH, outH) => { const q = P(p[0], p[1]); q.ix = inH[0] - p[0]; q.iy = inH[1] - p[1]; q.ox = outH[0] - p[0]; q.oy = outH[1] - p[1]; out.push(q); };
    const getSeg = (i) => { const a = c.pts[i % n], b = c.pts[(i + 1) % n]; return { a: [a.x, a.y], b: [a.x + a.ox, a.y + a.oy], c: [b.x + b.ix, b.y + b.iy], d: [b.x, b.y] }; };
    if (!wrap) {
      const st = splitAt(c, s, lens), en = splitAt(c, e, lens);
      const sg0 = getSeg(st.i);
      const left0 = deCasteljau(sg0.a, sg0.b, sg0.c, sg0.d, st.t);
      pushPoint(left0.mid, left0.mid, left0.right[1]);
      for (let i = st.i; i < en.i; i++) { const sg = getSeg(i); pushPoint(sg.d, sg.c, sg.d); }
      const sgE = getSeg(en.i);
      const leftE = deCasteljau(sgE.a, sgE.b, sgE.c, sgE.d, en.t);
      pushPoint(leftE.mid, leftE.left[2], leftE.mid);
    } else {
      // 跨过闭合点
      const st = splitAt(c, s, lens), en = splitAt(c, e, lens);
      const sg0 = getSeg(st.i);
      const l0 = deCasteljau(sg0.a, sg0.b, sg0.c, sg0.d, st.t);
      pushPoint(l0.mid, l0.mid, l0.right[1]);
      for (let i = st.i; i < lens.segs.length; i++) { const sg = getSeg(i); pushPoint(sg.d, sg.c, sg.d); }
      // 回到起点（闭合）
      pushPoint(c.pts[0], [c.pts[0].x + c.pts[0].ix, c.pts[0].y + c.pts[0].iy], [c.pts[0].x + c.pts[0].ox, c.pts[0].y + c.pts[0].oy]);
      for (let i = 0; i < en.i; i++) { const sg = getSeg(i); pushPoint(sg.d, sg.c, sg.d); }
      const sgE = getSeg(en.i);
      const lE = deCasteljau(sgE.a, sgE.b, sgE.c, sgE.d, en.t);
      pushPoint(lE.mid, lE.left[2], lE.mid);
    }
    return { closed: false, pts: out };
  }
  function trimPath(path, start, end) {
    const contours = [];
    for (const c of path.contours) {
      if (c.pts.length < 2) continue;
      const t = trimContour(c, clamp(start, 0, 1), clamp(end, 0, 1));
      if (t && t.pts.length >= 2) contours.push(t);
    }
    return { contours };
  }

  /* ---------- 采样路径上的点（用于笔尖/发射器） ---------- */
  function samplePath(path, u) {
    // u: 0..1 沿整个路径长度
    const cs = path.contours.filter(c => c.pts.length > 1);
    if (!cs.length) return null;
    const lens = cs.map(c => segLens(c, 12));
    let total = lens.reduce((s, l) => s + l.total, 0);
    let d = clamp(u, 0, 1) * total;
    for (let i = 0; i < cs.length; i++) {
      if (d <= lens[i].total || i === cs.length - 1) {
        const sp = splitAt(cs[i], d, lens[i]);
        const n = cs[i].pts.length;
        const a = cs[i].pts[sp.i % n], b = cs[i].pts[(sp.i + 1) % n];
        const p = cubicPoint([a.x, a.y], [a.x + a.ox, a.y + a.oy], [b.x + b.ix, b.y + b.iy], [b.x, b.y], sp.t);
        const tg = U.cubicTangent([a.x, a.y], [a.x + a.ox, a.y + a.oy], [b.x + b.ix, b.y + b.iy], [b.x, b.y], sp.t);
        const l = Math.hypot(tg[0], tg[1]) || 1;
        return { p, tangent: [tg[0] / l, tg[1] / l], contour: i };
      }
      d -= lens[i].total;
    }
    return null;
  }

  /* ---------- 多边形偏移 ---------- */
  function offsetPolyline(pts, d, closed = true) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const area = polygonArea(pts);
    const dir = area > 0 ? 1 : -1; // 使 d>0 向外扩张
    const out = [];
    const miterLimit = 2.5;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const n1 = [-(p1[1] - p0[1]), p1[0] - p0[0]];
      const n2 = [-(p2[1] - p1[1]), p2[0] - p1[0]];
      const l1 = Math.hypot(n1[0], n1[1]) || 1, l2 = Math.hypot(n2[0], n2[1]) || 1;
      n1[0] /= l1; n1[1] /= l1; n2[0] /= l2; n2[1] /= l2;
      let mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const ml = Math.hypot(mx, my);
      if (ml < 1e-9) { mx = n1[0]; my = n1[1]; } else { mx /= ml; my /= ml; }
      const cosHalf = Math.max(0.3, (n1[0] * mx + n1[1] * my));
      const scale = Math.min(1 / cosHalf, miterLimit);
      out.push([p1[0] + mx * d * dir * scale, p1[1] + my * d * dir * scale]);
    }
    return out;
  }

  /* ---------- 布尔运算 ---------- */
  function pointInSet(x, y, polys) {
    let inside = false;
    for (const pts of polys) {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
    }
    return inside;
  }
  // A, B: 数组的轮廓（每个是点列）；mode: 'union'|'subtract'|'intersect'|'exclude'
  function booleanOp(A, B, mode) {
    const EPS = 1e-7;
    const segsA = [], segsB = [];
    const collect = (polys, arr) => {
      for (const pts of polys) {
        if (pts.length < 3) continue;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) arr.push({ a: [a[0], a[1]], b: [b[0], b[1]], owner: arr === segsA ? 0 : 1 });
        }
      }
    };
    collect(A, segsA); collect(B, segsB);
    // 求交点并切分
    const cutsA = segsA.map(() => []), cutsB = segsB.map(() => []);
    for (let i = 0; i < segsA.length; i++) {
      for (let j = 0; j < segsB.length; j++) {
        const r = U.segIntersect(segsA[i].a, segsA[i].b, segsB[j].a, segsB[j].b);
        if (r && r.t > 1e-6 && r.t < 1 - 1e-6) cutsA[i].push(r.t);
        if (r && r.u > 1e-6 && r.u < 1 - 1e-6) cutsB[j].push(r.u);
      }
    }
    const subsegs = [];
    const emit = (s, cuts, polysOther, other) => {
      cuts.sort((x, y) => x - y);
      let prev = 0;
      const parts = cuts.concat([1]);
      for (const t of parts) {
        if (t - prev < 1e-7) { prev = t; continue; }
        const p0 = [lerp(s.a[0], s.b[0], prev), lerp(s.a[1], s.b[1], prev)];
        const p1 = [lerp(s.a[0], s.b[0], t), lerp(s.a[1], s.b[1], t)];
        prev = t;
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
        // 沿法线略微内推，避免共享边歧义
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * 1e-4, ny = dx / l * 1e-4;
        const inside = pointInSet(mx + nx, my + ny, polysOther);
        subsegs.push({ a: p0, b: p1, owner: s.owner, insideOther: inside });
      }
    };
    segsA.forEach((s, i) => emit(s, cutsA[i], B, 1));
    segsB.forEach((s, i) => emit(s, cutsB[i], A, 0));
    // 依据运算选择保留
    const want = (sg) => {
      if (mode === 'union') return !sg.insideOther;
      if (mode === 'subtract') return sg.owner === 0 ? !sg.insideOther : sg.insideOther;
      if (mode === 'intersect') return sg.insideOther;
      if (mode === 'exclude') return true;
      return !sg.insideOther;
    };
    let kept = subsegs.filter(want);
    if (mode === 'exclude') {
      // 异或：两侧都在外部的保留，内部保留（不共有）
      kept = subsegs.filter(sg => true);
    }
    // 连接成环
    const key = (p) => Math.round(p[0] / 0.01) + ',' + Math.round(p[1] / 0.01);
    const buckets = new Map();
    kept.forEach((sg, i) => {
      const k = key(sg.a);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    const used = new Array(kept.length).fill(false);
    const loops = [];
    for (let i = 0; i < kept.length; i++) {
      if (used[i]) continue;
      const loop = [kept[i].a];
      let cur = i; used[i] = true;
      let guard = 0;
      while (guard++ < 10000) {
        const sg = kept[cur];
        loop.push(sg.b);
        const k = key(sg.b);
        const cands = (buckets.get(k) || []).filter(j => !used[j]);
        if (!cands.length) break;
        // 选择转角最小者
        let best = cands[0], bestScore = Infinity;
        const d0 = [sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]];
        for (const j of cands) {
          const c = kept[j];
          const d1 = [c.b[0] - c.a[0], c.b[1] - c.a[1]];
          const l0 = Math.hypot(d0[0], d0[1]) || 1, l1 = Math.hypot(d1[0], d1[1]) || 1;
          const cross = d0[0] * d1[1] - d0[1] * d1[0];
          const dot = (d0[0] * d1[0] + d0[1] * d1[1]) / (l0 * l1);
          const score = Math.atan2(cross, dot); // 左转优先
          if (score > bestScore) { bestScore = score; best = j; }
        }
        used[best] = true; cur = best;
        if (Math.hypot(kept[cur].a[0] - loop[0][0], kept[cur].a[1] - loop[0][1]) < 1e-4) break;
      }
      loop.pop();
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  /* ---------- 路径形变 ---------- */
  function contourCentroid(pts) {
    let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length];
  }
  function resampleContour(pts, n, closed) {
    return U.resamplePolyline(pts, n, closed);
  }
  function morphPath(A, B, u) {
    u = clamp(u, 0, 1);
    const ca = A.contours.map(c => ({ c, poly: flattenContour(c, 0.5), closed: c.closed }));
    const cb = B.contours.map(c => ({ c, poly: flattenContour(c, 0.5), closed: c.closed }));
    if (!ca.length) return B;
    if (!cb.length) return A;
    // 匹配轮廓：按质心最近
    const used = new Array(cb.length).fill(false);
    const pairs = [];
    for (const a of ca) {
      let best = -1, bd = Infinity;
      const cen = contourCentroid(a.poly);
      for (let j = 0; j < cb.length; j++) {
        if (used[j]) continue;
        const d = Math.hypot(contourCentroid(cb[j].poly)[0] - cen[0], contourCentroid(cb[j].poly)[1] - cen[1]);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) { used[best] = true; pairs.push([a, cb[best]]); }
      else pairs.push([a, null]);
    }
    const out = [];
    for (const [a, b] of pairs) {
      if (!b) { out.push({ closed: a.closed, pts: a.poly.map(p => P(p[0], p[1])) }); continue; }
      const n = Math.max(16, Math.max(a.poly.length, b.poly.length));
      let pa = resampleContour(a.poly, n, a.closed);
      let pb = resampleContour(b.poly, n, b.closed);
      // 旋转对齐起点
      let bestOff = 0, bd = Infinity;
      for (let off = 0; off < n; off += Math.max(1, Math.floor(n / 24))) {
        let d = 0;
        for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 16))) {
          d += Math.hypot(pa[k][0] - pb[(k + off) % n][0], pa[k][1] - pb[(k + off) % n][1]);
        }
        if (d < bd) { bd = d; bestOff = off; }
      }
      const rot = (arr) => arr.map((_, i) => arr[(i + bestOff) % n]);
      pb = rot(pb);
      // 若方向相反则反转
      if (polygonArea(pa) * polygonArea(pb) < 0) pb.reverse();
      const pts = pa.map((p, i) => [lerp(p[0], pb[i][0], u), lerp(p[1], pb[i][1], u)]);
      out.push(smoothToContour(pts, a.closed, 0.7, 0.8));
    }
    return { contours: out };
  }
  // 通用：按点数重采样并插值（用于 trim 出的折线等）
  function resamplePath(path, n) {
    return { contours: path.contours.map(c => ({ closed: c.closed, pts: smoothToContour(resampleContour(flattenContour(c, 0.5), n, c.closed), c.closed, 0.5, 1).pts })) };
  }

  global.PT = {
    P, contourFromPoints, pathFromPolylines, rectPath, ellipsePath, starPath, polylinePath,
    flattenContour, flatten, flattenToPolys, smoothToContour,
    transformContour, transformPath, translatePath, scalePath,
    pathBBox, contourLength, pathLength, segLens, splitAt, trimContour, trimPath, samplePath,
    offsetPolyline, booleanOp, pointInSet, morphPath, resamplePath, contourCentroid
  };
})(window);
