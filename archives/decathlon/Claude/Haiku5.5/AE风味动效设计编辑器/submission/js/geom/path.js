/* 路径几何：贝塞尔展开、弧长、重采样、布尔运算、修剪、描边与填充三角化。
 * 轮廓（contour）统一为 {pts:[[x,y],...], closed:boolean}，闭合轮廓的 pts 不重复首点。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const P = (AE.Path = {});
  // earcut 的 UMD 包可能导出为对象（default 为函数），统一取到函数本身
  const earcut = (window.earcut && window.earcut.default) || window.earcut;

  // 贝塞尔路径 -> 折线轮廓
  P.flattenBPath = (bp, tol) => {
    tol = tol || 0.4;
    const n = bp.v.length;
    const pts = [];
    const segs = bp.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = bp.v[k], b = bp.v[(k + 1) % n];
      const c1 = [a[0] + bp.o[k][0], a[1] + bp.o[k][1]];
      const c2 = [b[0] + bp.i[(k + 1) % n][0], b[1] + bp.i[(k + 1) % n][1]];
      const straight = !(bp.o[k][0] || bp.o[k][1] || bp.i[(k + 1) % n][0] || bp.i[(k + 1) % n][1]);
      if (straight) {
        pts.push([a[0], a[1]]);
        continue;
      }
      const approx = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
      const N = U.clamp(Math.ceil(approx / (tol * 4)), 3, 96);
      for (let s = 0; s < N; s++) {
        const t = s / N, m = 1 - t;
        pts.push([
          m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0],
          m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1],
        ]);
      }
    }
    if (!bp.closed) pts.push([bp.v[n - 1][0], bp.v[n - 1][1]]);
    return pts;
  };
  // 贝塞尔路径列表 -> 轮廓列表（保留闭合标记）
  P.contoursFromBPaths = (list, tol) =>
    (list || []).map((bp) => ({ pts: P.flattenBPath(bp, tol), closed: !!bp.closed })).filter((c) => c.pts.length > 1);

  // 字形命令（opentype.js path.commands）-> 轮廓
  // yDown：命令坐标已是屏幕方向（y 向下），为 true 时不翻转
  P.contoursFromCommands = (cmds, scale, ox, oy, yDown) => {
    const out = [];
    let cur = null, px = 0, py = 0, sx = 0, sy = 0;
    const flip = yDown ? 1 : -1;
    const T = (x, y) => [ox + x * scale, oy + flip * y * scale];
    const push = () => {
      if (cur && cur.length > 2) out.push({ pts: cur, closed: true });
      cur = null;
    };
    for (const c of cmds) {
      if (c.type === 'M') {
        push();
        const p = T(c.x, c.y);
        cur = [p];
        px = c.x;
        py = c.y;
        sx = c.x;
        sy = c.y;
      } else if (c.type === 'L') {
        cur.push(T(c.x, c.y));
        px = c.x;
        py = c.y;
      } else if (c.type === 'Q' || c.type === 'C') {
        const p0 = [px, py];
        const steps = 12;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, m = 1 - t;
          let x, y;
          if (c.type === 'Q') {
            x = m * m * p0[0] + 2 * m * t * c.x1 + t * t * c.x;
            y = m * m * p0[1] + 2 * m * t * c.y1 + t * t * c.y;
          } else {
            x = m * m * m * p0[0] + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t * t * t * c.x;
            y = m * m * m * p0[1] + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t * t * t * c.y;
          }
          cur.push(T(x, y));
        }
        px = c.x;
        py = c.y;
      } else if (c.type === 'Z') {
        push();
        px = sx;
        py = sy;
      }
    }
    push();
    return out;
  };

  // 轮廓的线段长度与累计
  P.polyLength = (pts, closed) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed && pts.length > 2) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return L;
  };
  // 闭合折线按弧长均匀重采样为 N 个点
  P.resampleClosed = (pts, N) => {
    const n = pts.length;
    const cum = [0];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[n] || 1;
    const out = [];
    let j = 0;
    for (let k = 0; k < N; k++) {
      const target = (k / N) * total;
      while (j < n - 1 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j] || 1e-9;
      const f = (target - cum[j]) / seg;
      const a = pts[j], b = pts[(j + 1) % n];
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    return out;
  };

  P.transform = (pts, m) => pts.map((p) => U.mat.applyToXY(m, p[0], p[1]));
  P.bounds = (contours) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    contours.forEach((c) =>
      c.pts.forEach((p) => {
        if (p[0] < x0) x0 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[0] > x1) x1 = p[0];
        if (p[1] > y1) y1 = p[1];
      })
    );
    if (x0 === Infinity) return null;
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  P.area = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  };
  P.pointInPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // 每个轮廓被几条其它轮廓包含（奇数为孔洞）
  P.nestingDepth = (contours) =>
    contours.map((c, i) => {
      if (!c.pts.length) return 0;
      const p = c.pts[0];
      let d = 0;
      contours.forEach((o, j) => {
        if (j !== i && o.pts.length > 2 && P.pointInPoly(p[0], p[1], o.pts)) d++;
      });
      return d;
    });

  // ---- 三角化填充（even-odd 嵌套，外轮廓与其直接孔洞一起交给 earcut）----
  P.fillTriangles = (contours) => {
    const cs = contours.filter((c) => c.pts.length >= 3);
    if (!cs.length) return [];
    const depth = P.nestingDepth(cs);
    const outers = [], holes = [];
    cs.forEach((c, i) => ((depth[i] % 2 === 0) ? outers : holes).push({ c, i, d: depth[i] }));
    const out = [];
    outers.forEach((o) => {
      const myHoles = holes.filter((h) => {
        if (h.d !== o.d + 1) return false;
        // 选择包含该孔洞的最小外轮廓：这里仅检查深度与包含关系
        return P.pointInPoly(h.c.pts[0][0], h.c.pts[0][1], o.c.pts);
      });
      const flat = [];
      const holeIdx = [];
      o.c.pts.forEach((p) => flat.push(p[0], p[1]));
      myHoles.forEach((h) => {
        holeIdx.push(flat.length / 2);
        h.c.pts.forEach((p) => flat.push(p[0], p[1]));
      });
      const idx = earcut(flat, holeIdx.length ? holeIdx : null, 2);
      for (let k = 0; k < idx.length; k++) {
        const p = idx[k] * 2;
        out.push(flat[p], flat[p + 1]);
      }
    });
    return out;
  };

  // ---- 描边：每段一个矩形，顶点处加圆形接头，两端为圆帽 ----
  P.strokeTriangles = (contours, width) => {
    const out = [];
    const hw = width / 2;
    if (hw <= 0) return out;
    const addQuad = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (L < 1e-6) return;
      const nx = (-dy / L) * hw, ny = (dx / L) * hw;
      const p0 = [a[0] + nx, a[1] + ny], p1 = [b[0] + nx, b[1] + ny];
      const p2 = [b[0] - nx, b[1] - ny], p3 = [a[0] - nx, a[1] - ny];
      out.push(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p0[0], p0[1], p2[0], p2[1], p3[0], p3[1]);
    };
    const addDisc = (c) => {
      const S = 10;
      for (let s = 0; s < S; s++) {
        const a0 = (s / S) * Math.PI * 2, a1 = ((s + 1) / S) * Math.PI * 2;
        out.push(c[0], c[1], c[0] + Math.cos(a0) * hw, c[1] + Math.sin(a0) * hw, c[0] + Math.cos(a1) * hw, c[1] + Math.sin(a1) * hw);
      }
    };
    contours.forEach((c) => {
      const pts = c.pts;
      const n = pts.length;
      if (n < 2) return;
      const segs = c.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) addQuad(pts[i], pts[(i + 1) % n]);
      for (let i = 0; i < n; i++) if (c.closed || (i > 0 && i < n - 1)) addDisc(pts[i]);
      if (!c.closed) {
        addDisc(pts[0]);
        addDisc(pts[n - 1]);
      }
    });
    return out;
  };

  // ---- 布尔运算（PolyBool，even-odd 区域）----
  const PB = () => window.PolyBool;
  const toPoly = (contours) => ({ regions: contours.filter((c) => c.closed !== false && c.pts.length >= 3).map((c) => c.pts.map((p) => [p[0], p[1]])), inverted: false });
  const fromPoly = (poly) => poly.regions.map((r) => ({ pts: r.map((p) => [p[0], p[1]]), closed: true }));
  // 对若干轮廓集合执行布尔运算：op = add | subtract | intersect | exclude
  P.booleanFold = (sets, op) => {
    const pb = PB();
    const valid = sets.filter((s) => s.length);
    if (!valid.length) return [];
    if (valid.length === 1) return valid[0];
    let seg = pb.segments(toPoly(valid[0]));
    for (let i = 1; i < valid.length; i++) {
      const other = pb.segments(toPoly(valid[i]));
      const comb = pb.combine(seg, other);
      if (op === 'subtract') seg = pb.selectDifference(comb);
      else if (op === 'intersect') seg = pb.selectIntersect(comb);
      else if (op === 'exclude') seg = pb.selectXor(comb);
      else seg = pb.selectUnion(comb);
    }
    return fromPoly(pb.polygon(seg));
  };

  // ---- 修剪路径：按累计弧长截取一段（窗口可跨越起点，返回开放折线）----
  P.trim = (contours, start, end, offset) => {
    const items = contours.map((c) => {
      const pts = c.closed ? c.pts.concat([c.pts[0]]) : c.pts;
      return { pts, closed: c.closed };
    });
    const lens = items.map((it) => P.polyLength(it.pts, false));
    const total = lens.reduce((a, b) => a + b, 0);
    if (total <= 1e-9) return [];
    let s = U.mod(start + offset, 1), e = U.mod(end + offset, 1);
    if (end - start >= 0.9999) {
      s = U.mod(offset, 1);
      e = s + 1;
    }
    const wins = [];
    if (e >= s) wins.push([s, e]);
    else {
      wins.push([s, 1]);
      wins.push([0, e]);
    }
    const out = [];
    wins.forEach(([a, b]) => {
      const A = a * total, B = b * total;
      let acc = 0;
      items.forEach((it, idx) => {
        const L = lens[idx];
        const s0 = acc, s1 = acc + L;
        acc = s1;
        if (s1 < A || s0 > B || L <= 0) return;
        // 每条轮廓在窗口内是连续的一段，遇到窗口终点即收尾
        const piece = [];
        let walked = 0;
        for (let i = 0; i < it.pts.length - 1; i++) {
          const p = it.pts[i], q = it.pts[i + 1];
          const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
          const g0 = s0 + walked, g1 = g0 + seg;
          walked += seg;
          if (g0 > B) break;
          if (g1 < A || seg <= 0) continue;
          const f0 = Math.max(0, (A - g0) / seg), f1 = Math.min(1, (B - g0) / seg);
          if (!piece.length) piece.push([p[0] + (q[0] - p[0]) * f0, p[1] + (q[1] - p[1]) * f0]);
          piece.push([p[0] + (q[0] - p[0]) * f1, p[1] + (q[1] - p[1]) * f1]);
          if (f1 < 1) break;
        }
        if (piece.length > 1) out.push({ pts: piece, closed: false });
      });
    });
    return out;
  };

  // 轮廓集合做逐顶点平移 / 旋转 / 缩放（局部中心）
  P.xformContours = (contours, m) => contours.map((c) => ({ pts: P.transform(c.pts, m), closed: c.closed }));
})();
