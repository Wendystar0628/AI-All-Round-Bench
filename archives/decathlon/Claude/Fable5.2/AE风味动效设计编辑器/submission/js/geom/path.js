// 路径工具：贝塞尔路径值、展平、修剪、偏移、描边轮廓、形变（含孔洞对应）
// 路径值 PathValue: { c: [ { closed, v: [[x,y, ix,iy, ox,oy], ...] } ] }，切线为相对坐标
// 折线轮廓: { pts:[x,y,...], closed }
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const K = 0.5522847498;

  const P = (MF.Path = {
    rect(w, h, r, cx, cy) {
      cx = cx || 0; cy = cy || 0; const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
      r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
      if (r < 1e-6) return { c: [{ closed: true, v: [[x0, y0, 0, 0, 0, 0], [x1, y0, 0, 0, 0, 0], [x1, y1, 0, 0, 0, 0], [x0, y1, 0, 0, 0, 0]] }] };
      const k = r * K;
      return { c: [{ closed: true, v: [
        [x0 + r, y0, -k, 0, 0, 0], [x1 - r, y0, 0, 0, k, 0], [x1, y0 + r, 0, -k, 0, 0], [x1, y1 - r, 0, 0, 0, k],
        [x1 - r, y1, k, 0, 0, 0], [x0 + r, y1, 0, 0, -k, 0], [x0, y1 - r, 0, k, 0, 0], [x0, y0 + r, 0, 0, 0, -k]] }] };
    },
    ellipse(w, h, cx, cy) {
      cx = cx || 0; cy = cy || 0; const rx = w / 2, ry = h / 2, kx = rx * K, ky = ry * K;
      return { c: [{ closed: true, v: [[cx, cy - ry, -kx, 0, kx, 0], [cx + rx, cy, 0, -ky, 0, ky], [cx, cy + ry, kx, 0, -kx, 0], [cx - rx, cy, 0, ky, 0, -ky]] }] };
    },
    star(points, outer, inner, rot, cx, cy, isPolygon) {
      const v = []; const n = Math.max(3, Math.round(points));
      const m = isPolygon ? n : n * 2;
      for (let i = 0; i < m; i++) {
        const a = (rot || 0) * MF.DEG - Math.PI / 2 + (i / m) * Math.PI * 2;
        const r = isPolygon ? outer : i % 2 === 0 ? outer : inner;
        v.push([(cx || 0) + Math.cos(a) * r, (cy || 0) + Math.sin(a) * r, 0, 0, 0, 0]);
      }
      return { c: [{ closed: true, v }] };
    },
    fromContours(cs) { return { c: cs.map((c) => { const v = []; for (let i = 0; i < c.pts.length; i += 2) v.push([c.pts[i], c.pts[i + 1], 0, 0, 0, 0]); return { closed: c.closed !== false, v }; }) }; },
    // 展平贝塞尔路径值
    flattenValue(pv, tol) {
      tol = tol || 0.2; const out = [];
      if (!pv || !pv.c) return out;
      for (const c of pv.c) {
        const v = c.v, n = v.length; if (!n) continue;
        const pts = [v[0][0], v[0][1]];
        const m = c.closed ? n : n - 1;
        for (let i = 0; i < m; i++) {
          const a = v[i], b = v[(i + 1) % n];
          if (!a[4] && !a[5] && !b[2] && !b[3]) { pts.push(b[0], b[1]); continue; }
          P.flatCubic(a[0], a[1], a[0] + a[4], a[1] + a[5], b[0] + b[2], b[1] + b[3], b[0], b[1], tol, pts);
        }
        if (c.closed && pts.length >= 4) { const k = pts.length; if (Math.abs(pts[k - 2] - pts[0]) < 1e-9 && Math.abs(pts[k - 1] - pts[1]) < 1e-9) pts.length = k - 2; }
        out.push({ pts, closed: !!c.closed });
      }
      return out;
    },
    flatCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol, out) {
      const dev = Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
      const n = Math.max(1, Math.min(96, Math.ceil(Math.sqrt((dev * 0.75) / tol))));
      for (let k = 1; k <= n; k++) { const t = k / n; out.push(MF.bez.pt(x0, x1, x2, x3, t), MF.bez.pt(y0, y1, y2, y3, t)); }
    },
    area(p) { let s = 0; const n = p.length; for (let i = 0, j = n - 2; i < n; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1]; return s / 2; },
    length(c) { const p = c.pts; let L = 0; const n = p.length >> 1; const m = c.closed ? n : n - 1; for (let i = 0; i < m; i++) { const j = (i + 1) % n; L += Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]); } return L; },
    centroid(p) { let x = 0, y = 0; const n = p.length >> 1; for (let i = 0; i < n; i++) { x += p[i * 2]; y += p[i * 2 + 1]; } return [x / (n || 1), y / (n || 1)]; },
    bbox(cs) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of cs) { const p = c.pts; for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; } }
      return isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
    },
    pointIn(p, x, y) { let inside = false; const n = p.length; for (let i = 0, j = n - 2; i < n; j = i, i += 2) { const yi = p[i + 1], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside; } return inside; },
    pointInContours(cs, x, y) { let k = 0; for (const c of cs) if (c.closed !== false && P.pointIn(c.pts, x, y)) k++; return (k & 1) === 1; },
    // 2D 仿射 [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f
    xf(cs, m) { return cs.map((c) => { const p = c.pts, o = new Array(p.length); for (let i = 0; i < p.length; i += 2) { o[i] = m[0] * p[i] + m[2] * p[i + 1] + m[4]; o[i + 1] = m[1] * p[i] + m[3] * p[i + 1] + m[5]; } return Object.assign({}, c, { pts: o }); }); },
    affine(pos, rotDeg, scale, anchor) {
      const r = (rotDeg || 0) * MF.DEG, c = Math.cos(r), s = Math.sin(r), sx = scale ? scale[0] : 1, sy = scale ? scale[1] : 1, ax = anchor ? anchor[0] : 0, ay = anchor ? anchor[1] : 0;
      const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
      return [a, b, cc, d, pos[0] - (a * ax + cc * ay), pos[1] - (b * ax + d * ay)];
    },
    affMul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; },

    // 修剪：start/end 为 0..1，offset 为圈数（可为任意实数）；mode 'each' 逐条 | 'seq' 首尾相接
    trim(cs, start, end, offset, mode) {
      let s = MF.clamp(Math.min(start, end), 0, 1), e = MF.clamp(Math.max(start, end), 0, 1);
      if (e - s <= 1e-9) return [];
      const out = [];
      if (mode === 'seq') {
        const lens = cs.map((c) => P.length(c)); const total = lens.reduce((a, b) => a + b, 0); if (total <= 0) return [];
        let o = offset - Math.floor(offset);
        const a0 = (s + o) * total, a1 = (e + o) * total; let acc = 0;
        for (let pass = 0; pass < 2; pass++) {
          acc = pass * total;
          for (let i = 0; i < cs.length; i++) {
            const l0 = acc, l1 = acc + lens[i]; acc = l1;
            const x0 = Math.max(a0, l0), x1 = Math.min(a1, l1);
            if (x1 - x0 > 1e-9 && lens[i] > 0) { if (x0 <= l0 + 1e-9 && x1 >= l1 - 1e-9) out.push(cs[i]); else P._cut(cs[i], (x0 - l0), (x1 - l0), out, false); }
          }
        }
        return out;
      }
      for (const c of cs) {
        const L = P.length(c); if (L <= 0) continue;
        if (s <= 0 && e >= 1) { out.push(c); continue; }
        let o = offset - Math.floor(offset);
        if (!c.closed) { // 开放路径：偏移后环绕
          let a = (s + o), b = (e + o);
          if (b <= 1 + 1e-9) P._cut(c, a * L, Math.min(b, 1) * L, out, false);
          else if (a >= 1) P._cut(c, (a - 1) * L, (b - 1) * L, out, false);
          else { P._cut(c, a * L, L, out, false); P._cut(c, 0, (b - 1) * L, out, false); }
        } else P._cut(c, (s + o) * L, (e + o) * L, out, true);
      }
      return out;
    },
    // 沿弧长截取 [a,b]（闭合路径可越过接缝）
    _cut(c, a, b, out, wrap) {
      const p = c.pts, n = p.length >> 1; if (n < 2) return;
      const segN = c.closed ? n : n - 1;
      const L = P.length(c);
      if (wrap) { while (a >= L) { a -= L; b -= L; } }
      const res = []; let acc = 0, started = false;
      const maxLoop = wrap ? segN * 2 : segN;
      for (let k = 0; k < maxLoop; k++) {
        const i = k % n, j = (k + 1) % n;
        const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1];
        const l = Math.hypot(x1 - x0, y1 - y0);
        const s0 = acc, s1 = acc + l; acc = s1;
        if (l <= 0) continue;
        if (s1 < a) continue;
        if (s0 > b) break;
        if (!started) { const t = MF.clamp((a - s0) / l, 0, 1); res.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); started = true; }
        if (s1 >= b) { const t = MF.clamp((b - s0) / l, 0, 1); res.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); break; }
        res.push(x1, y1);
      }
      if (res.length >= 4) out.push({ pts: res, closed: false });
    },
    // 按弧长取点与切线
    pointAt(c, dist) {
      const p = c.pts, n = p.length >> 1; const segN = c.closed ? n : n - 1; let acc = 0;
      for (let k = 0; k < segN; k++) {
        const i = k, j = (k + 1) % n; const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1];
        const l = Math.hypot(x1 - x0, y1 - y0);
        if (acc + l >= dist && l > 0) { const t = (dist - acc) / l; return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (x1 - x0) / l, (y1 - y0) / l]; }
        acc += l;
      }
      const m = n - 1; return [p[(c.closed ? 0 : m) * 2], p[(c.closed ? 0 : m) * 2 + 1], 1, 0];
    },
    // 按给定的归一化弧长参数取样（params 升序 0..1）
    sampleParams(c, params, shift, reverse) {
      const p = c.pts, n = p.length >> 1; const closed = c.closed !== false; const segN = closed ? n : n - 1;
      const cum = new Float64Array(segN + 1);
      for (let k = 0; k < segN; k++) { const j = (k + 1) % n; cum[k + 1] = cum[k] + Math.hypot(p[j * 2] - p[k * 2], p[j * 2 + 1] - p[k * 2 + 1]); }
      const L = cum[segN] || 1e-9, out = new Array(params.length * 2);
      for (let q = 0; q < params.length; q++) {
        let u = params[q]; if (reverse) u = 1 - u; u += shift || 0;
        if (closed) u -= Math.floor(u); else u = MF.clamp(u, 0, 1);
        const d = u * L; let lo = 0, hi = segN;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
        const l = cum[lo + 1] - cum[lo], t = l > 0 ? (d - cum[lo]) / l : 0, j = (lo + 1) % n;
        out[q * 2] = p[lo * 2] + (p[j * 2] - p[lo * 2]) * t; out[q * 2 + 1] = p[lo * 2 + 1] + (p[j * 2 + 1] - p[lo * 2 + 1]) * t;
      }
      return out;
    },
    vertexParams(c) {
      const p = c.pts, n = p.length >> 1; const closed = c.closed !== false; const segN = closed ? n : n - 1; const cum = [0];
      for (let k = 0; k < segN; k++) { const j = (k + 1) % n; cum.push(cum[k] + Math.hypot(p[j * 2] - p[k * 2], p[j * 2 + 1] - p[k * 2 + 1])); }
      const L = cum[segN] || 1e-9; const out = []; const m = closed ? n : n;
      for (let k = 0; k < m; k++) out.push(cum[k] / L);
      return out;
    },

    // ---- 偏移（正值向外）：逐顶点斜接偏移后用正环绕规则清理 ----
    offset(cs, d, join, miterLimit) {
      if (Math.abs(d) < 1e-9) return cs;
      const norm = MF.Bool.normalize(cs, 'nonzero');
      const raw = [];
      const round = join === 'round';
      for (const c of norm) {
        const p = c.pts, n = p.length >> 1; if (n < 3) continue; const o = [];
        for (let i = 0; i < n; i++) {
          const a = (i + n - 1) % n, b = (i + 1) % n;
          const x = p[i * 2], y = p[i * 2 + 1];
          let e1x = x - p[a * 2], e1y = y - p[a * 2 + 1], e2x = p[b * 2] - x, e2y = p[b * 2 + 1] - y;
          const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1; e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
          // 内部在左 → 外法线为右法线 (dy, -dx)
          const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;
          const cross = e1x * e2y - e1y * e2x, dot = e1x * e2x + e1y * e2y;
          const convex = cross * d > 0; // 向外偏移时外凸角需要连接
          if (convex && (round || dot < -0.2)) {
            if (round) {
              const a0 = Math.atan2(n1y, n1x), a1 = Math.atan2(n2y, n2x);
              const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
              const steps = Math.max(1, Math.ceil(Math.abs(da) / 0.35));
              for (let s = 0; s <= steps; s++) { const an = a0 + (da * s) / steps; o.push(x + Math.cos(an) * d, y + Math.sin(an) * d); }
            } else { o.push(x + n1x * d, y + n1y * d, x + n2x * d, y + n2y * d); }
          } else {
            let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my);
            if (ml < 1e-6) { o.push(x + n1x * d, y + n1y * d); continue; }
            mx /= ml; my /= ml; const cosH = mx * n1x + my * n1y; const k = Math.min(1 / Math.max(cosH, 0.05), miterLimit || 3);
            o.push(x + mx * d * k, y + my * d * k);
          }
        }
        raw.push({ pts: o, closed: true });
      }
      return MF.Bool.union(raw, 0, 'positive');
    },
    // ---- 描边转轮廓：各段四边形 + 圆形连接，取并集 ----
    strokeOutline(cs, width, cap) {
      const r = width / 2; if (r <= 0) return [];
      const polys = []; const NC = Math.max(8, Math.min(24, Math.ceil(r * 0.6) + 8));
      const circle = (x, y) => { const o = []; for (let i = 0; i < NC; i++) { const a = (i / NC) * Math.PI * 2; o.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } polys.push({ pts: o, closed: true }); };
      for (const c of cs) {
        const p = c.pts, n = p.length >> 1; if (n < 1) continue;
        if (n === 1) { circle(p[0], p[1]); continue; }
        const segN = c.closed ? n : n - 1;
        for (let k = 0; k < segN; k++) {
          const j = (k + 1) % n; const x0 = p[k * 2], y0 = p[k * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1];
          const l = Math.hypot(x1 - x0, y1 - y0); if (l < 1e-9) continue;
          const nx = (-(y1 - y0) / l) * r, ny = ((x1 - x0) / l) * r;
          polys.push({ pts: [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], closed: true });
          if (k > 0 || c.closed) circle(x0, y0);
        }
        if (!c.closed && cap !== 'butt') { circle(p[0], p[1]); circle(p[(n - 1) * 2], p[(n - 1) * 2 + 1]); }
      }
      // 统一方向后并集
      for (const q of polys) if (P.area(q.pts) < 0) { const a = q.pts, o = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); q.pts = o; }
      return MF.Bool.union(polys, 0, 'nonzero');
    },

    // ---- 嵌套分析：返回 [{outer, holes:[...] }] ----
    nest(cs) {
      const closed = cs.filter((c) => c.closed !== false && c.pts.length >= 6);
      const n = closed.length, depth = new Array(n).fill(0), areas = closed.map((c) => Math.abs(P.area(c.pts)));
      const cont = closed.map(() => []);
      for (let i = 0; i < n; i++) {
        const p = closed[i].pts;
        for (let j = 0; j < n; j++) {
          if (i === j || areas[j] <= areas[i]) continue;
          // 取多个点投票，避免顶点正好在边上
          let v = 0; const m = p.length >> 1; const st = Math.max(1, Math.floor(m / 5));
          let cnt = 0; for (let k = 0; k < m; k += st) { cnt++; if (P.pointIn(closed[j].pts, p[k * 2], p[k * 2 + 1])) v++; }
          if (v * 2 > cnt) { depth[i]++; cont[i].push(j); }
        }
      }
      const groups = [], gi = new Map();
      for (let i = 0; i < n; i++) if (depth[i] % 2 === 0) { gi.set(i, groups.length); groups.push({ outer: closed[i], holes: [], area: areas[i] }); }
      for (let i = 0; i < n; i++) if (depth[i] % 2 === 1) {
        let best = -1; for (const j of cont[i]) if (depth[j] === depth[i] - 1 && (best < 0 || areas[j] < areas[best])) best = j;
        if (best >= 0 && gi.has(best)) groups[gi.get(best)].holes.push(closed[i]);
      }
      return groups;
    },

    // ---- 形变：外轮廓与孔洞各自配对，逐对按弧长参数对应 ----
    morph(A, B, t) {
      if (t <= 0) return A; if (t >= 1) return B;
      const key = A; let cache = P._mc.get(key);
      if (!cache || cache.B !== B) { cache = { B, pairs: P._morphPairs(A, B) }; P._mc.set(key, cache); }
      const out = [];
      for (const pr of cache.pairs) {
        const a = pr.a, b = pr.b, n = a.length, o = new Array(n);
        for (let i = 0; i < n; i++) o[i] = a[i] + (b[i] - a[i]) * t;
        out.push({ pts: o, closed: pr.closed });
      }
      return out;
    },
    _mc: new WeakMap(),
    _pairContour(ca, cb) {
      const closed = ca.closed !== false && cb.closed !== false;
      let a = ca, b = cb;
      if (closed && (P.area(a.pts) < 0) !== (P.area(b.pts) < 0)) { const q = []; for (let i = b.pts.length - 2; i >= 0; i -= 2) q.push(b.pts[i], b.pts[i + 1]); b = { pts: q, closed: true }; }
      // 找最佳起点偏移
      let shift = 0;
      if (closed) {
        const Kn = 48, par = []; for (let i = 0; i < Kn; i++) par.push(i / Kn);
        const sa = P.sampleParams(a, par, 0), ca_ = P.centroid(sa);
        let best = Infinity;
        for (let s = 0; s < Kn; s++) {
          const sb = P.sampleParams(b, par, s / Kn), cb_ = P.centroid(sb); let e = 0;
          for (let i = 0; i < Kn; i++) { const dx = (sa[i * 2] - ca_[0]) - (sb[i * 2] - cb_[0]), dy = (sa[i * 2 + 1] - ca_[1]) - (sb[i * 2 + 1] - cb_[1]); e += dx * dx + dy * dy; }
          if (e < best) { best = e; shift = s / Kn; }
        }
      }
      // 合并两条轮廓的顶点参数，保证两端形状精确
      const pa = P.vertexParams(a), pb = P.vertexParams(b).map((u) => { let v = u - shift; if (closed) v -= Math.floor(v); return v; });
      let params = pa.concat(pb).sort((x, y) => x - y);
      const merged = []; for (const u of params) if (!merged.length || u - merged[merged.length - 1] > 1e-5) merged.push(u);
      if (!closed && merged[merged.length - 1] < 1) merged.push(1);
      return { a: P.sampleParams(a, merged, 0), b: P.sampleParams(b, merged, shift), closed };
    },
    _morphPairs(A, B) {
      const pairs = [];
      const openA = A.filter((c) => c.closed === false), openB = B.filter((c) => c.closed === false);
      const ga = P.nest(A), gb = P.nest(B);
      const cen = (c) => P.centroid(c.pts);
      const point = (c, at) => { const o = new Array(c.pts.length); for (let i = 0; i < o.length; i += 2) { o[i] = at[0]; o[i + 1] = at[1]; } return o; };
      const bb = P.bbox(A.concat(B)); const scale = Math.max(bb[2] - bb[0], bb[3] - bb[1], 1e-6);
      // 贪心配对：按质心距离 + 面积比
      function match(la, lb, getC) {
        const res = [], usedB = new Set(); const cand = [];
        for (let i = 0; i < la.length; i++) for (let j = 0; j < lb.length; j++) {
          const c1 = cen(getC(la[i])), c2 = cen(getC(lb[j])); const a1 = Math.abs(P.area(getC(la[i]).pts)) + 1e-9, a2 = Math.abs(P.area(getC(lb[j]).pts)) + 1e-9;
          cand.push([Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) / scale + 0.35 * Math.abs(Math.log(a1 / a2)), i, j]);
        }
        cand.sort((x, y) => x[0] - y[0]); const usedA = new Set();
        for (const c of cand) if (!usedA.has(c[1]) && !usedB.has(c[2])) { usedA.add(c[1]); usedB.add(c[2]); res.push([la[c[1]], lb[c[2]]]); }
        for (let i = 0; i < la.length; i++) if (!usedA.has(i)) res.push([la[i], null]);
        for (let j = 0; j < lb.length; j++) if (!usedB.has(j)) res.push([null, lb[j]]);
        return res;
      }
      const gm = match(ga, gb, (g) => g.outer);
      const anyA = ga.length ? cen(ga[0].outer) : [0, 0], anyB = gb.length ? cen(gb[0].outer) : [0, 0];
      for (const [x, y] of gm) {
        if (x && y) {
          pairs.push(P._pairContour(x.outer, y.outer));
          const hm = match(x.holes, y.holes, (h) => h);
          const cx = cen(x.outer), cy = cen(y.outer);
          for (const [h1, h2] of hm) {
            if (h1 && h2) pairs.push(P._pairContour(h1, h2));
            else if (h1) { const c = cen(h1); pairs.push({ a: h1.pts.slice(), b: point(h1, [c[0] + cy[0] - cx[0], c[1] + cy[1] - cx[1]]), closed: true }); }
            else { const c = cen(h2); pairs.push({ a: point(h2, [c[0] + cx[0] - cy[0], c[1] + cx[1] - cy[1]]), b: h2.pts.slice(), closed: true }); }
          }
        } else if (x) {
          const c = cen(x.outer); const tgt = gb.length ? anyB : c;
          pairs.push({ a: x.outer.pts.slice(), b: point(x.outer, tgt), closed: true });
          for (const h of x.holes) pairs.push({ a: h.pts.slice(), b: point(h, tgt), closed: true });
        } else if (y) {
          const c = cen(y.outer); const src = ga.length ? anyA : c;
          pairs.push({ a: point(y.outer, src), b: y.outer.pts.slice(), closed: true });
          for (const h of y.holes) pairs.push({ a: point(h, src), b: h.pts.slice(), closed: true });
        }
      }
      const om = Math.max(openA.length, openB.length);
      for (let i = 0; i < om; i++) {
        const x = openA[i], y = openB[i];
        if (x && y) pairs.push(P._pairContour(x, y));
        else if (x) pairs.push({ a: x.pts.slice(), b: point(x, cen(x)), closed: false });
        else pairs.push({ a: point(y, cen(y)), b: y.pts.slice(), closed: false });
      }
      return pairs;
    },
    // 路径值之间插值：顶点数一致时逐点插值（保持贝塞尔），否则走折线形变
    lerpValue(a, b, t) {
      if (t <= 0) return a; if (t >= 1) return b;
      let same = a.c.length === b.c.length;
      if (same) for (let i = 0; i < a.c.length; i++) if (a.c[i].v.length !== b.c[i].v.length || !!a.c[i].closed !== !!b.c[i].closed) { same = false; break; }
      if (same) return { c: a.c.map((ca, i) => ({ closed: ca.closed, v: ca.v.map((va, j) => { const vb = b.c[i].v[j]; return [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t, va[3] + (vb[3] - va[3]) * t, va[4] + (vb[4] - va[4]) * t, va[5] + (vb[5] - va[5]) * t]; }) })) };
      let fa = P._fc.get(a); if (!fa) { fa = P.flattenValue(a, 0.2); P._fc.set(a, fa); }
      let fb = P._fc.get(b); if (!fb) { fb = P.flattenValue(b, 0.2); P._fc.set(b, fb); }
      return { c: null, flat: P.morph(fa, fb, t) };
    },
    _fc: new WeakMap(),
    // 取路径值的折线（兼容形变产生的 flat）
    flat(pv, tol) { if (!pv) return []; if (pv.flat) return pv.flat; return P.flattenValue(pv, tol); },
    reverse(c) { const a = c.pts, o = []; for (let i = a.length - 2; i >= 0; i -= 2) o.push(a[i], a[i + 1]); return { pts: o, closed: c.closed }; },
  });
})();
