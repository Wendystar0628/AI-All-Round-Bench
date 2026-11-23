/* geom.js — 路径、折线、描边、布尔运算、路径形变 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U;
  const G = AE.G = {};

  // ===== 形状数据：shape = {contours:[{closed, v:[[x,y]], i:[[dx,dy]], o:[[dx,dy]]}]} =====
  G.emptyShape = () => ({ contours: [] });
  G.contourFromPts = (pts, closed = true) => ({ closed, v: pts.map(p => [p[0], p[1]]), i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]) });
  G.polyShape = (pts, closed = true) => ({ contours: [G.contourFromPts(pts, closed)] });
  G.rectShape = (w, h, r = 0, cx = 0, cy = 0) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    r = Math.min(Math.abs(r), Math.abs(w) / 2, Math.abs(h) / 2);
    if (r <= 0.001) return G.polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    const k = r * 0.5523;
    const v = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
    const i = [[0, 0], [-0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
    const o = [[k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k], [0, 0]];
    i[1] = [-k, 0]; i[2] = [0, -k]; i[3] = [0, 0]; i[4] = [k, 0]; i[5] = [0, 0]; i[6] = [0, k]; i[7] = [0, 0];
    // 重新按顺序生成: 每个圆角由 (直边终点 -> 圆弧) 构成
    const vv = [], ii = [], oo = [];
    const add = (p, a, b) => { vv.push(p); ii.push(a); oo.push(b); };
    add([x0 + r, y0], [-k, 0], [0, 0]); add([x1 - r, y0], [0, 0], [k, 0]);
    add([x1, y0 + r], [0, -k], [0, 0]); add([x1, y1 - r], [0, 0], [0, k]);
    add([x1 - r, y1], [k, 0], [0, 0]); add([x0 + r, y1], [0, 0], [-k, 0]);
    add([x0, y1 - r], [0, k], [0, 0]); add([x0, y0 + r], [0, 0], [0, -k]);
    return { contours: [{ closed: true, v: vv, i: ii, o: oo }] };
  };
  G.ellipseShape = (w, h, cx = 0, cy = 0) => {
    const rx = w / 2, ry = h / 2, kx = rx * 0.5523, ky = ry * 0.5523;
    return { contours: [{ closed: true, v: [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]], i: [[-kx, 0], [0, -ky], [kx, 0], [0, ky]], o: [[kx, 0], [0, ky], [-kx, 0], [0, -ky]] }] };
  };
  G.starShape = (points, outerR, innerR, rot = 0, outerRound = 0, cx = 0, cy = 0) => {
    const n = Math.max(3, Math.round(points)), pts = [];
    for (let k = 0; k < n * 2; k++) { const r = k % 2 === 0 ? outerR : innerR; const a = (k / (n * 2)) * Math.PI * 2 + (rot - 90) * U.DEG; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return G.polyShape(innerR <= 0 ? pts.filter((_, k) => k % 2 === 0) : pts);
  };
  G.cloneShape = s => ({ contours: s.contours.map(c => ({ closed: c.closed, v: c.v.map(p => p.slice()), i: c.i.map(p => p.slice()), o: c.o.map(p => p.slice()) })) });
  G.transformShape = (s, m) => ({ contours: s.contours.map(c => ({ closed: c.closed, v: c.v.map(p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]), i: c.i.map(p => [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]]), o: c.o.map(p => [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1]]) })) });

  // 2D 仿射 [a,b,c,d,e,f]
  const A2 = G.A2 = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
    inv: m => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; const a = m[3] / d, b = -m[1] / d, c = -m[2] / d, dd = m[0] / d; return [a, b, c, dd, -(a * m[4] + c * m[5]), -(b * m[4] + dd * m[5])]; },
    pt: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    trs: (tx, ty, rotDeg, sx, sy) => { const c = Math.cos(rotDeg * U.DEG), s = Math.sin(rotDeg * U.DEG); return [c * sx, s * sx, -s * sy, c * sy, tx, ty]; },
  };

  // ===== 展平 =====
  // 返回 flat 数组 [x0,y0,...]；closed 不重复首点
  G.flattenContour = (c, tol = 0.25) => {
    const out = []; const n = c.v.length; if (!n) return out;
    const segs = c.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = c.v[k], b = c.v[(k + 1) % n]; const o = c.o[k], i = c.i[(k + 1) % n];
      out.push(a[0], a[1]);
      if ((o[0] || o[1] || i[0] || i[1])) {
        const p1x = a[0] + o[0], p1y = a[1] + o[1], p2x = b[0] + i[0], p2y = b[1] + i[1];
        const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1e-9;
        const d1 = Math.abs((p1x - a[0]) * dy - (p1y - a[1]) * dx) / L, d2 = Math.abs((p2x - a[0]) * dy - (p2y - a[1]) * dx) / L;
        const ctrl = Math.hypot(o[0], o[1]) + Math.hypot(i[0], i[1]);
        const dev = Math.max(d1, d2, ctrl > L * 1.01 ? (ctrl - L) * 0.5 : 0);
        const steps = Math.min(96, Math.max(2, Math.ceil(Math.sqrt(0.75 * dev / tol)) + (dev > tol ? 1 : 0)));
        for (let s = 1; s < steps; s++) { const t = s / steps; out.push(U.cubic(a[0], p1x, p2x, b[0], t), U.cubic(a[1], p1y, p2y, b[1], t)); }
      }
    }
    if (!c.closed) { const l = c.v[n - 1]; out.push(l[0], l[1]); }
    return out;
  };
  // 返回 [{pts:flat, closed}]
  G.flattenShape = (s, tol = 0.25) => s.contours.filter(c => c.v.length > 1).map(c => ({ pts: G.flattenContour(c, tol), closed: c.closed }));
  G.polyLength = (pts, closed) => { let L = 0; const n = pts.length / 2; for (let i = 1; i < n; i++) L += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]); if (closed && n > 2) L += Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1]); return L; };
  G.polyArea = pts => { let a = 0; const n = pts.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; } return a / 2; };
  G.shapeBBox = (s) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const c of s.contours) for (const p of c.v) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1]; };
  G.polysBBox = polys => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) { const pts = p.pts || p; for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1]; };

  // 修剪折线（沿实际弧长），返回 [{pts, closed:false}]
  G.trimPoly = (pts, closed, s0, s1) => {
    // s0,s1 为 0..1 弧长比例；允许 s0>s1 绕回（对闭合路径）
    const n = pts.length / 2; if (n < 2) return [];
    const P = []; for (let i = 0; i < n; i++) P.push([pts[2 * i], pts[2 * i + 1]]); if (closed) P.push([pts[0], pts[1]]);
    const lens = [0]; for (let i = 1; i < P.length; i++) lens.push(lens[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = lens[lens.length - 1]; if (L <= 1e-9) return [];
    const sub = (a, b) => {
      const A = a * L, B = b * L; const out = [];
      const at = d => { let k = 1; while (k < lens.length - 1 && lens[k] < d) k++; const l0 = lens[k - 1], l1 = lens[k]; const t = l1 > l0 ? (d - l0) / (l1 - l0) : 0; return [P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t]; };
      const p = at(A); out.push(p[0], p[1]);
      for (let k = 1; k < P.length - 0; k++) { if (lens[k] > A + 1e-9 && lens[k] < B - 1e-9) out.push(P[k][0], P[k][1]); }
      const q = at(B); out.push(q[0], q[1]);
      return { pts: out, closed: false };
    };
    s0 = U.clamp(s0, 0, 1e9); s1 = U.clamp(s1, -1e9, 1e9);
    if (!closed) { const a = U.clamp(Math.min(s0, s1), 0, 1), b = U.clamp(Math.max(s0, s1), 0, 1); if (b - a < 1e-6) return []; return [sub(a, b)]; }
    // 闭合: 允许偏移后的环绕
    let a = s0, b = s1; if (b < a) { const t = a; a = b; b = t; }
    if (b - a >= 1 - 1e-9) return [{ pts: pts.slice(), closed: true }];
    if (b - a < 1e-6) return [];
    a = ((a % 1) + 1) % 1; b = a + (s1 - s0 > 0 ? (b - (Math.min(s0, s1))) : (b - Math.min(s0, s1)));
    const len = Math.abs(s1 - s0);
    a = (((Math.min(s0, s1)) % 1) + 1) % 1; b = a + len;
    if (b <= 1) return [sub(a, b)];
    return [sub(a, 1), sub(0, b - 1)];
  };

  // ===== 描边（三角形，用于蒙版渲染）=====
  G.dashPoly = (pts, closed, pattern, offset = 0) => {
    const P = []; for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]); if (closed) P.push([pts[0], pts[1]]);
    const tot = pattern.reduce((a, b) => a + b, 0); if (tot <= 0.01) return [{ pts, closed }];
    const out = []; let cur = null; let pi = 0; let rem = pattern[0]; let on = true;
    let off = ((offset % tot) + tot) % tot; while (off > 0) { if (off >= rem) { off -= rem; pi = (pi + 1) % pattern.length; rem = pattern[pi]; on = !on; } else { rem -= off; off = 0; } }
    if (on) cur = [P[0][0], P[0][1]];
    for (let k = 1; k < P.length; k++) {
      let x0 = P[k - 1][0], y0 = P[k - 1][1]; const x1 = P[k][0], y1 = P[k][1]; let L = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / (L || 1), uy = (y1 - y0) / (L || 1);
      while (L > 1e-9) {
        const step = Math.min(L, rem); x0 += ux * step; y0 += uy * step; L -= step; rem -= step;
        if (on && cur) cur.push(x0, y0);
        if (rem <= 1e-9) { if (on && cur && cur.length >= 4) out.push({ pts: cur, closed: false }); on = !on; pi = (pi + 1) % pattern.length; rem = Math.max(pattern[pi], 0.01); cur = on ? [x0, y0] : null; }
      }
    }
    if (on && cur && cur.length >= 4) out.push({ pts: cur, closed: false });
    return out;
  };

  // 输出三角形顶点 flat 数组 [x,y,...]（每 3 点一个三角形）
  G.strokeTris = (pts, closed, width, cap = 'butt', join = 'miter', miter = 4, out = []) => {
    const h = width / 2; if (h <= 0) return out;
    // 去重
    const P = []; for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (!P.length || Math.hypot(x - P[P.length - 1][0], y - P[P.length - 1][1]) > 1e-6) P.push([x, y]); }
    if (closed && P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P.pop();
    const n = P.length; if (n < 1) return out;
    const tri = (a, b, c) => out.push(a[0], a[1], b[0], b[1], c[0], c[1]);
    if (n === 1) { if (cap === 'round') G._fan(out, P[0], h, 0, Math.PI * 2); else if (cap === 'square') { const p = P[0]; tri([p[0] - h, p[1] - h], [p[0] + h, p[1] - h], [p[0] + h, p[1] + h]); tri([p[0] - h, p[1] - h], [p[0] + h, p[1] + h], [p[0] - h, p[1] + h]); } return out; }
    const segs = closed ? n : n - 1; const dirs = [];
    for (let k = 0; k < segs; k++) { const a = P[k], b = P[(k + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dirs.push([dx / l, dy / l]); }
    for (let k = 0; k < segs; k++) {
      const a = P[k], b = P[(k + 1) % n], d = dirs[k]; const nx = -d[1] * h, ny = d[0] * h;
      tri([a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] + nx, b[1] + ny]); tri([a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]);
    }
    const joinAt = (p, d0, d1) => {
      const cr = d0[0] * d1[1] - d0[1] * d1[0]; const dt = d0[0] * d1[0] + d0[1] * d1[1];
      if (Math.abs(cr) < 1e-6 && dt > 0) return;
      const s = cr > 0 ? -1 : 1; // 外侧法线方向符号
      const n0 = [-d0[1] * h * s, d0[0] * h * s], n1 = [-d1[1] * h * s, d1[0] * h * s];
      const a = [p[0] + n0[0], p[1] + n0[1]], b = [p[0] + n1[0], p[1] + n1[1]];
      if (join === 'round') { const a0 = Math.atan2(n0[1], n0[0]); let a1 = Math.atan2(n1[1], n1[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; G._fan(out, p, h, a0, a0 + da); }
      else if (join === 'miter') {
        const cosHalf = Math.sqrt(Math.max(0, (1 + dt) / 2)); // cos(θ/2) 其中 θ 为转角
        const ml = cosHalf > 1e-4 ? 1 / cosHalf : 1e9;
        if (ml <= miter) { const mx = n0[0] + n1[0], my = n0[1] + n1[1]; const ml2 = Math.hypot(mx, my) || 1; const k = h * ml / ml2; const tip = [p[0] + mx * k, p[1] + my * k]; tri(p, a, tip); tri(p, tip, b); }
        else tri(p, a, b);
      } else tri(p, a, b);
    };
    for (let k = closed ? 0 : 1; k < (closed ? n : n - 1); k++) { const d0 = dirs[(k - 1 + segs) % segs], d1 = dirs[k % segs]; joinAt(P[k], d0, d1); }
    if (!closed) {
      const capAt = (p, d, hd) => { // hd: 朝外方向
        const nx = -d[1] * h, ny = d[0] * h;
        if (cap === 'square') { const ex = d[0] * h * hd, ey = d[1] * h * hd; tri([p[0] + nx, p[1] + ny], [p[0] - nx, p[1] - ny], [p[0] + nx + ex, p[1] + ny + ey]); tri([p[0] - nx, p[1] - ny], [p[0] - nx + ex, p[1] - ny + ey], [p[0] + nx + ex, p[1] + ny + ey]); }
        else if (cap === 'round') { const a0 = Math.atan2(d[1] * hd, d[0] * hd); G._fan(out, p, h, a0 - Math.PI / 2, a0 + Math.PI / 2); }
      };
      capAt(P[0], dirs[0], -1); capAt(P[n - 1], dirs[segs - 1], 1);
    }
    return out;
  };
  G._fan = (out, c, r, a0, a1) => {
    const steps = Math.max(3, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 12) * Math.min(3, Math.max(1, r / 6)) )); let px = c[0] + Math.cos(a0) * r, py = c[1] + Math.sin(a0) * r;
    for (let s = 1; s <= steps; s++) { const a = a0 + (a1 - a0) * s / steps; const x = c[0] + Math.cos(a) * r, y = c[1] + Math.sin(a) * r; out.push(c[0], c[1], px, py, x, y); px = x; py = y; }
  };

  // 以折线为骨架生成笔画多边形（用于字形）：返回 flat 多边形（米勒连接）
  G.strokePolygon = (pts, width, cap = 'butt', capSeg = 8) => {
    const h = width / 2; const P = []; for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (!P.length || Math.hypot(x - P[P.length - 1][0], y - P[P.length - 1][1]) > 1e-6) P.push([x, y]); }
    const n = P.length; if (n < 2) return [];
    const dirs = []; for (let k = 0; k < n - 1; k++) { const dx = P[k + 1][0] - P[k][0], dy = P[k + 1][1] - P[k][1]; const l = Math.hypot(dx, dy) || 1; dirs.push([dx / l, dy / l]); }
    const side = sgn => {
      const res = [];
      for (let k = 0; k < n; k++) {
        let nx, ny;
        if (k === 0) { nx = -dirs[0][1] * sgn; ny = dirs[0][0] * sgn; res.push([P[0][0] + nx * h, P[0][1] + ny * h]); }
        else if (k === n - 1) { nx = -dirs[n - 2][1] * sgn; ny = dirs[n - 2][0] * sgn; res.push([P[k][0] + nx * h, P[k][1] + ny * h]); }
        else {
          const a = [-dirs[k - 1][1] * sgn, dirs[k - 1][0] * sgn], b = [-dirs[k][1] * sgn, dirs[k][0] * sgn];
          let mx = a[0] + b[0], my = a[1] + b[1]; const ml = Math.hypot(mx, my);
          if (ml < 1e-6) { res.push([P[k][0] + a[0] * h, P[k][1] + a[1] * h], [P[k][0] + b[0] * h, P[k][1] + b[1] * h]); }
          else { mx /= ml; my /= ml; const c = mx * a[0] + my * a[1]; const k2 = Math.min(1 / Math.max(c, 0.25), 2.2); res.push([P[k][0] + mx * h * k2, P[k][1] + my * h * k2]); }
        }
      }
      return res;
    };
    const L = side(1), R = side(-1).reverse();
    const poly = [];
    for (const p of L) poly.push(p[0], p[1]);
    const capPts = (p, d, hd) => {
      const out = []; if (cap === 'round') { const a0 = Math.atan2(d[1] * hd, d[0] * hd); for (let s = 1; s < capSeg; s++) { const a = a0 - Math.PI / 2 * (hd > 0 ? 1 : 1) + (Math.PI * s / capSeg) * (1); out.push([p[0] + Math.cos(a) * h, p[1] + Math.sin(a) * h]); } }
      else if (cap === 'square') { out.push([P[0][0], P[0][1]]); out.length = 0; const ex = d[0] * h * hd, ey = d[1] * h * hd; const nx = -d[1] * h, ny = d[0] * h; if (hd > 0) { out.push([p[0] + nx + ex, p[1] + ny + ey], [p[0] - nx + ex, p[1] - ny + ey]); } else { out.push([p[0] - nx + ex, p[1] - ny + ey], [p[0] + nx + ex, p[1] + ny + ey]); } }
      return out;
    };
    // 末端帽（从左侧到右侧）：方向 d_end，角度由左法线转到右法线
    const dEnd = dirs[n - 2], dStart = dirs[0];
    if (cap === 'round') {
      const aL = Math.atan2(dEnd[0], -dEnd[1]); // 左法线 (-dy, dx) 的角度
      for (let s = 1; s < capSeg; s++) { const a = aL - Math.PI * s / capSeg; poly.push(P[n - 1][0] + Math.cos(a) * h, P[n - 1][1] + Math.sin(a) * h); }
    } else if (cap === 'square') { const ex = dEnd[0] * h, ey = dEnd[1] * h; const l = L[L.length - 1], r = R[0]; poly.push(l[0] + ex, l[1] + ey, r[0] + ex, r[1] + ey); }
    for (const p of R) poly.push(p[0], p[1]);
    if (cap === 'round') {
      const aR = Math.atan2(-dStart[0], dStart[1]); // 右法线 (dy,-dx)
      for (let s = 1; s < capSeg; s++) { const a = aR - Math.PI * s / capSeg; poly.push(P[0][0] + Math.cos(a) * h, P[0][1] + Math.sin(a) * h); }
    } else if (cap === 'square') { const ex = -dStart[0] * h, ey = -dStart[1] * h; const l = L[0], r = R[R.length - 1]; poly.push(r[0] + ex, r[1] + ey, l[0] + ex, l[1] + ey); }
    // 保证为正向面积（便于非零填充叠加）
    if (G.polyArea(poly) < 0) { const q = []; for (let i = poly.length / 2 - 1; i >= 0; i--) q.push(poly[2 * i], poly[2 * i + 1]); return q; }
    return poly;
  };

  // ===== 点与多边形 =====
  G.windingAt = (x, y, polys) => {
    let w = 0;
    for (const poly of polys) {
      const pts = poly.pts || poly; const n = pts.length / 2; if (n < 3) continue;
      let x0 = pts[2 * n - 2], y0 = pts[2 * n - 1];
      for (let i = 0; i < n; i++) {
        const x1 = pts[2 * i], y1 = pts[2 * i + 1];
        if (y0 <= y) { if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) w++; }
        else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) w--;
        x0 = x1; y0 = y1;
      }
    }
    return w;
  };
  G.insidePolys = (x, y, polys, evenodd) => { const w = G.windingAt(x, y, polys); return evenodd ? (w & 1) !== 0 : w !== 0; };
  G.distToSeg = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; const l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)); };
  G.distToPoly = (px, py, pts, closed = true) => { const n = pts.length / 2; let d = Infinity; const m = closed ? n : n - 1; for (let i = 0; i < m; i++) { const j = (i + 1) % n; d = Math.min(d, G.distToSeg(px, py, pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1])); } return d; };

  // ===== 布尔运算（平面排列 + 缠绕数判定）=====
  // A,B: flat 多边形数组（非零缠绕规则）。op: union|intersect|diff|xor
  G.boolean = (A, B, op = 'union') => {
    const segs = [];
    const add = (polys, src) => { for (const poly of polys) { const pts = poly.pts || poly; const n = pts.length / 2; if (n < 3) continue; for (let i = 0; i < n; i++) { const j = (i + 1) % n; const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * j], y1 = pts[2 * j + 1]; if (Math.abs(x0 - x1) < 1e-12 && Math.abs(y0 - y1) < 1e-12) continue; segs.push({ x0, y0, x1, y1, splits: [] }); } } };
    add(A, 0); add(B, 1);
    const N = segs.length; if (!N) return [];
    const bb = G.polysBBox(A.concat(B)); const scale = Math.max(bb[2] - bb[0], bb[3] - bb[1], 1e-6); const eps = scale * 1e-9;
    const vt = scale * 1e-7;
    // 交点
    const order = segs.map((_, i) => i).sort((a, b) => Math.min(segs[a].x0, segs[a].x1) - Math.min(segs[b].x0, segs[b].x1));
    const mx = segs.map(s => Math.max(s.x0, s.x1));
    for (let oi = 0; oi < N; oi++) {
      const i = order[oi], s = segs[i]; const sminx = Math.min(s.x0, s.x1);
      const sminy = Math.min(s.y0, s.y1), smaxy = Math.max(s.y0, s.y1);
      for (let oj = oi + 1; oj < N; oj++) {
        const j = order[oj], q = segs[j]; const qminx = Math.min(q.x0, q.x1);
        if (qminx > mx[i] + vt) break;
        if (Math.min(q.y0, q.y1) > smaxy + vt || Math.max(q.y0, q.y1) < sminy - vt) continue;
        const rx = s.x1 - s.x0, ry = s.y1 - s.y0, tx = q.x1 - q.x0, ty = q.y1 - q.y0;
        const den = rx * ty - ry * tx; const ls = Math.hypot(rx, ry), lq = Math.hypot(tx, ty);
        const qpx = q.x0 - s.x0, qpy = q.y0 - s.y0;
        if (Math.abs(den) < 1e-10 * ls * lq) {
          // 平行：判断共线
          const dist = Math.abs(qpx * ry - qpy * rx) / (ls || 1); if (dist > vt * 2) continue;
          const proj = (px, py) => ((px - s.x0) * rx + (py - s.y0) * ry) / (ls * ls);
          const projq = (px, py) => ((px - q.x0) * tx + (py - q.y0) * ty) / (lq * lq);
          for (const [px, py] of [[q.x0, q.y0], [q.x1, q.y1]]) { const t = proj(px, py); if (t > 1e-9 && t < 1 - 1e-9) s.splits.push([t, px, py]); }
          for (const [px, py] of [[s.x0, s.y0], [s.x1, s.y1]]) { const u = projq(px, py); if (u > 1e-9 && u < 1 - 1e-9) q.splits.push([u, px, py]); }
          continue;
        }
        const t = (qpx * ty - qpy * tx) / den, u = (qpx * ry - qpy * rx) / den;
        const et = vt / (ls || 1), eu = vt / (lq || 1);
        if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
        // 交点坐标：若在端点附近取端点
        let px = s.x0 + rx * t, py = s.y0 + ry * t;
        if (u <= eu) { px = q.x0; py = q.y0; } else if (u >= 1 - eu) { px = q.x1; py = q.y1; }
        else if (t <= et) { px = s.x0; py = s.y0; } else if (t >= 1 - et) { px = s.x1; py = s.y1; }
        if (t > et && t < 1 - et) s.splits.push([t, px, py]);
        if (u > eu && u < 1 - eu) q.splits.push([u, px, py]);
      }
    }
    // 顶点合并
    const verts = []; const cell = vt * 4; const grid = new Map();
    const getV = (x, y) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = grid.get((cx + dx) + ',' + (cy + dy)); if (l) for (const id of l) { const v = verts[id]; if (Math.abs(v[0] - x) <= vt && Math.abs(v[1] - y) <= vt) return id; } }
      const id = verts.length; verts.push([x, y]); const k = cx + ',' + cy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id); return id;
    };
    const edgeSet = new Map();
    for (const s of segs) {
      s.splits.sort((a, b) => a[0] - b[0]);
      let prev = getV(s.x0, s.y0);
      for (const sp of s.splits) { const id = getV(sp[1], sp[2]); if (id !== prev) { const k = prev < id ? prev + '_' + id : id + '_' + prev; if (!edgeSet.has(k)) edgeSet.set(k, [prev, id]); prev = id; } }
      const e = getV(s.x1, s.y1); if (e !== prev) { const k = prev < e ? prev + '_' + e : e + '_' + prev; if (!edgeSet.has(k)) edgeSet.set(k, [prev, e]); }
    }
    const f = op === 'union' ? (a, b) => a || b : op === 'intersect' ? (a, b) => a && b : op === 'diff' ? (a, b) => a && !b : (a, b) => a !== b;
    const keep = [];
    const off = Math.max(scale * 1e-5, 1e-7);
    const Apolys = A.map(p => p.pts || p), Bpolys = B.map(p => p.pts || p);
    for (const [u, v] of edgeSet.values()) {
      const a = verts[u], b = verts[v]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); if (l < vt) continue;
      const mx2 = (a[0] + b[0]) / 2, my2 = (a[1] + b[1]) / 2; const e = Math.min(off, l * 0.25); const nx = -dy / l * e, ny = dx / l * e;
      const lA = G.windingAt(mx2 + nx, my2 + ny, Apolys) !== 0, lB = G.windingAt(mx2 + nx, my2 + ny, Bpolys) !== 0;
      const rA = G.windingAt(mx2 - nx, my2 - ny, Apolys) !== 0, rB = G.windingAt(mx2 - nx, my2 - ny, Bpolys) !== 0;
      const fl = f(lA, lB), fr = f(rA, rB); if (fl === fr) continue;
      keep.push(fl ? [u, v] : [v, u]);
    }
    // 串联
    const out = new Map(); keep.forEach((e, k) => { if (!out.has(e[0])) out.set(e[0], []); out.get(e[0]).push(k); });
    const used = new Uint8Array(keep.length); const loops = [];
    for (let k = 0; k < keep.length; k++) {
      if (used[k]) continue; const loop = []; let cur = k; let guard = 0;
      while (cur !== undefined && !used[cur] && guard++ < 100000) {
        used[cur] = 1; const e = keep[cur]; loop.push(e[0]); const nxt = out.get(e[1]); if (!nxt) { cur = undefined; break; }
        const din = [verts[e[1]][0] - verts[e[0]][0], verts[e[1]][1] - verts[e[0]][1]]; const ain = Math.atan2(din[1], din[0]);
        let best, bestTurn = -Infinity;
        for (const c of nxt) { if (used[c]) continue; const e2 = keep[c]; const d2 = [verts[e2[1]][0] - verts[e2[0]][0], verts[e2[1]][1] - verts[e2[0]][1]]; let turn = Math.atan2(d2[1], d2[0]) - ain; while (turn > Math.PI) turn -= 2 * Math.PI; while (turn <= -Math.PI) turn += 2 * Math.PI; if (turn > bestTurn) { bestTurn = turn; best = c; } }
        cur = best;
        if (cur !== undefined && keep[cur][0] === loop[0] && keep[cur][1] === undefined) break;
      }
      if (loop.length >= 3) { const pts = []; for (const id of loop) pts.push(verts[id][0], verts[id][1]); loops.push(pts); }
    }
    return loops.map(G.simplifyCollinear).filter(p => p.length >= 6 && Math.abs(G.polyArea(p)) > scale * scale * 1e-12);
  };
  G.simplifyCollinear = pts => {
    const n = pts.length / 2; if (n < 4) return pts; const out = [];
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, q = (i + 1) % n; const ax = pts[2 * i] - pts[2 * p], ay = pts[2 * i + 1] - pts[2 * p + 1], bx = pts[2 * q] - pts[2 * i], by = pts[2 * q + 1] - pts[2 * i + 1];
      const cr = ax * by - ay * bx; const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la > 0 && lb > 0 && Math.abs(cr) < 1e-9 * la * lb && ax * bx + ay * by > 0) continue;
      out.push(pts[2 * i], pts[2 * i + 1]);
    }
    return out.length >= 6 ? out : pts;
  };
  // 解析重叠：把一组（非零）多边形整理成无自交的外轮廓+孔洞
  G.resolve = polys => G.boolean(polys, [], 'union');
  G.booleanMany = (shapes, op) => {
    if (!shapes.length) return []; if (shapes.length === 1) return G.resolve(shapes[0]);
    let acc = shapes[0];
    for (let i = 1; i < shapes.length; i++) acc = G.boolean(acc, shapes[i], op);
    return acc;
  };

  // Ramer–Douglas–Peucker（闭合）
  G.rdp = (pts, tol, closed = true) => {
    const n = pts.length / 2; if (n < 4) return pts;
    const keep = new Uint8Array(n);
    const rec = (a, b) => { let md = 0, mi = -1; const x0 = pts[2 * a], y0 = pts[2 * a + 1], x1 = pts[2 * b], y1 = pts[2 * b + 1]; for (let i = a + 1; i < b; i++) { const d = G.distToSeg(pts[2 * i], pts[2 * i + 1], x0, y0, x1, y1); if (d > md) { md = d; mi = i; } } if (md > tol && mi > 0) { keep[mi] = 1; rec(a, mi); rec(mi, b); } };
    if (closed) { // 找距离首点最远的点分割
      let fi = 0, fd = 0; for (let i = 1; i < n; i++) { const d = Math.hypot(pts[2 * i] - pts[0], pts[2 * i + 1] - pts[1]); if (d > fd) { fd = d; fi = i; } }
      keep[0] = 1; keep[fi] = 1; rec(0, fi); const tmp = []; for (let i = fi; i < n; i++) tmp.push(pts[2 * i], pts[2 * i + 1]); tmp.push(pts[0], pts[1]);
      const sub = G.rdp(tmp, tol, false); const out = []; for (let i = 0; i < n; i++) if (keep[i] && i <= fi) out.push(pts[2 * i], pts[2 * i + 1]);
      for (let i = 2; i < sub.length - 2; i += 2) out.push(sub[i], sub[i + 1]); return out;
    }
    keep[0] = 1; keep[n - 1] = 1; rec(0, n - 1); const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]); return out;
  };

  // ===== 路径形变 =====
  const resampleClosed = (pts, N, closed) => {
    const n = pts.length / 2; const P = []; for (let i = 0; i < n; i++) P.push([pts[2 * i], pts[2 * i + 1]]); if (closed) P.push(P[0]);
    const lens = [0]; for (let i = 1; i < P.length; i++) lens.push(lens[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = lens[lens.length - 1]; const out = []; let k = 1;
    for (let s = 0; s < N; s++) { const d = closed ? L * s / N : L * s / (N - 1); while (k < lens.length - 1 && lens[k] < d) k++; const l0 = lens[k - 1], l1 = lens[k]; const t = l1 > l0 ? (d - l0) / (l1 - l0) : 0; out.push([P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t]); }
    return out;
  };
  const cArea = c => { let a = 0; const n = c.v.length; for (let i = 0; i < n; i++) { const p = c.v[i], q = c.v[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const cCentroid = c => { let x = 0, y = 0; for (const p of c.v) { x += p[0]; y += p[1]; } return [x / c.v.length, y / c.v.length]; };
  // 预处理一对形状：返回可插值的 {pairs:[{a,b}]}，a/b 为顶点数相同的轮廓
  G.prepMorph = (A, B) => {
    const ca = A.contours.filter(c => c.v.length > 1), cb = B.contours.filter(c => c.v.length > 1);
    const sameTopo = ca.length === cb.length && ca.every((c, k) => c.v.length === cb[k].v.length && c.closed === cb[k].closed);
    if (sameTopo) return { pairs: ca.map((c, k) => ({ a: c, b: cb[k] })) };
    const info = (cs) => { const big = cs.reduce((m, c) => Math.abs(cArea(c)) > Math.abs(cArea(m)) ? c : m, cs[0]); const sg = Math.sign(cArea(big)) || 1; return cs.map(c => ({ c, area: Math.abs(cArea(c)), hole: Math.sign(cArea(c)) !== sg && cs.length > 1, cen: cCentroid(c) })); };
    const ia = info(ca), ib = info(cb); const pairs = []; const usedB = new Set();
    const sortA = ia.slice().sort((x, y) => y.area - x.area);
    for (const x of sortA) {
      let best = null, bd = Infinity;
      for (const y of ib) { if (usedB.has(y) || y.hole !== x.hole) continue; const d = Math.hypot(x.cen[0] - y.cen[0], x.cen[1] - y.cen[1]) + Math.abs(x.area - y.area) / (x.area + y.area + 1) * 50; if (d < bd) { bd = d; best = y; } }
      if (best) { usedB.add(best); pairs.push({ a: x.c, b: best.c, ra: true }); } else pairs.push({ a: x.c, b: null });
    }
    for (const y of ib) if (!usedB.has(y)) pairs.push({ a: null, b: y.c });
    const res = [];
    for (const p of pairs) {
      let a = p.a, b = p.b;
      if (!a) a = { closed: b.closed, v: b.v.map(() => cCentroid(b)), i: b.v.map(() => [0, 0]), o: b.v.map(() => [0, 0]) };
      if (!b) b = { closed: a.closed, v: a.v.map(() => cCentroid(a)), i: a.v.map(() => [0, 0]), o: a.v.map(() => [0, 0]) };
      if (a.v.length === b.v.length && a.closed === b.closed) { res.push({ a, b }); continue; }
      // 重采样：转折线并对齐起点
      const N = Math.min(240, Math.max(48, a.v.length * 4, b.v.length * 4, 64));
      const closed = a.closed && b.closed;
      const fa = G.flattenContour(a, 0.3), fb = G.flattenContour(b, 0.3);
      const ra = resampleClosed(fa, N, closed), rb0 = resampleClosed(fb, N, closed);
      let rb = rb0;
      if (closed) {
        if (cArea({ v: ra }) * cArea({ v: rb0 }) < 0) rb = rb0.slice().reverse();
        let bestK = 0, bestD = Infinity; const step = Math.max(1, Math.floor(N / 64));
        for (let k = 0; k < N; k += 1) { let d = 0; for (let s = 0; s < N; s += step) { const p = ra[s], q = rb[(s + k) % N]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; } if (d < bestD) { bestD = d; bestK = k; } }
        rb = rb.map((_, s) => rb[(s + bestK) % N]);
      }
      res.push({ a: { closed, v: ra, i: ra.map(() => [0, 0]), o: ra.map(() => [0, 0]) }, b: { closed, v: rb, i: rb.map(() => [0, 0]), o: rb.map(() => [0, 0]) } });
    }
    return { pairs: res };
  };
  G.lerpShapePrepped = (prep, t) => ({
    contours: prep.pairs.map(({ a, b }) => ({
      closed: a.closed,
      v: a.v.map((p, k) => [p[0] + (b.v[k][0] - p[0]) * t, p[1] + (b.v[k][1] - p[1]) * t]),
      i: a.i.map((p, k) => [p[0] + (b.i[k][0] - p[0]) * t, p[1] + (b.i[k][1] - p[1]) * t]),
      o: a.o.map((p, k) => [p[0] + (b.o[k][0] - p[0]) * t, p[1] + (b.o[k][1] - p[1]) * t]),
    }))
  });
  const morphCache = new WeakMap();
  G.lerpShape = (A, B, t) => {
    let m = morphCache.get(A); if (!m) { m = new WeakMap(); morphCache.set(A, m); }
    let prep = m.get(B); if (!prep) { prep = G.prepMorph(A, B); m.set(B, prep); }
    return G.lerpShapePrepped(prep, t);
  };
})();
