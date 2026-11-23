// 关键帧：时间插值（线性/贝塞尔/定格，进出分别设置）、空间插值（位置的运动路径，弧长参数化）
// 关键帧: { t, v, it, ot ('l'|'b'|'h'), ii, oi (影响 %), is, os (速度: 数值或逐维数组), to, ti (空间切线，相对), sl (空间线性), sc (切线断开) }
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const EPS = 1e-5;
  const segCache = new WeakMap();

  function sp(s, d) { return Array.isArray(s) ? s[d] || 0 : s || 0; }
  function ease1(k0, k1, u, dt, v0, v1, d) {
    const avg = (v1 - v0) / dt;
    const oi = k0.ot === 'b' ? MF.clamp((k0.oi === undefined ? 33.333 : k0.oi) / 100, 0.001, 1) : 1 / 6, os = k0.ot === 'b' ? sp(k0.os, d) : avg;
    const ii = k1.it === 'b' ? MF.clamp((k1.ii === undefined ? 33.333 : k1.ii) / 100, 0.001, 1) : 1 / 6, is = k1.it === 'b' ? sp(k1.is, d) : avg;
    const s = MF.bez.solve(0, oi, 1 - ii, 1, u);
    return MF.bez.pt(v0, v0 + os * oi * dt, v1 - is * ii * dt, v1, s);
  }
  function segIndex(k, t) { let lo = 0, hi = k.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m].t <= t) lo = m; else hi = m; } return lo; }

  const A = (MF.Anim = {
    EPS,
    mkKey(t, v) { return { t, v: MF.clone(v), it: 'l', ot: 'l' }; },
    // 空间切线（自动贝塞尔：穿过相邻关键帧的平滑切线）
    outTan(keys, i, dims) {
      const k = keys[i];
      if (k.sl) return zeros(dims);
      if (k.to) return k.to;
      return autoTan(keys, i, dims, 1);
    },
    inTan(keys, i, dims) {
      const k = keys[i];
      if (k.sl) return zeros(dims);
      if (k.ti) return k.ti;
      return autoTan(keys, i, dims, -1);
    },
    // 空间段：三次贝塞尔 + 弧长表
    spatialSeg(keys, i) {
      const k0 = keys[i], k1 = keys[i + 1], dims = k0.v.length;
      const to = A.outTan(keys, i, dims), ti = A.inTan(keys, i + 1, dims);
      let c = segCache.get(k0); let same = !!c && c.dims === dims;
      if (same) for (let d = 0; d < dims; d++) if (c.P0[d] !== k0.v[d] || c.P3[d] !== k1.v[d] || c.P1[d] !== k0.v[d] + to[d] || c.P2[d] !== k1.v[d] + ti[d]) { same = false; break; }
      if (same) return c;
      const P0 = k0.v.slice(), P3 = k1.v.slice(), P1 = P0.map((x, d) => x + (to[d] || 0)), P2 = P3.map((x, d) => x + (ti[d] || 0));
      let straight = true; for (let d = 0; d < dims; d++) if (to[d] || ti[d]) straight = false;
      const NL = straight ? 1 : 40; const lut = new Float64Array(NL + 1); let L = 0; let prev = P0;
      for (let s = 1; s <= NL; s++) { const u = s / NL; const p = bezPt(P0, P1, P2, P3, u, dims); let dd = 0; for (let d = 0; d < dims; d++) dd += (p[d] - prev[d]) * (p[d] - prev[d]); L += Math.sqrt(dd); lut[s] = L; prev = p; }
      c = { dims, P0, P1, P2, P3, L, lut, NL, straight };
      segCache.set(k0, c);
      return c;
    },
    pointAtDist(seg, dist) {
      const { lut, NL, L, dims } = seg;
      if (L <= 1e-12) return seg.P0.slice();
      dist = MF.clamp(dist, 0, L);
      let lo = 0, hi = NL; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lut[m] <= dist) lo = m; else hi = m; }
      const l = lut[lo + 1] - lut[lo]; const u = (lo + (l > 0 ? (dist - lut[lo]) / l : 0)) / NL;
      return bezPt(seg.P0, seg.P1, seg.P2, seg.P3, u, dims);
    },
    // 关键帧值（不含表达式）
    value(prop, t, meta) {
      const k = prop.k; if (!k || !k.length) return prop.v;
      const n = k.length;
      if (t <= k[0].t) return k[0].v; if (t >= k[n - 1].t) return k[n - 1].v;
      const i = segIndex(k, t), k0 = k[i], k1 = k[i + 1];
      if (k0.ot === 'h') return k0.v;
      const dt = k1.t - k0.t; if (dt <= 0) return k1.v;
      const u = (t - k0.t) / dt, bez = k0.ot === 'b' || k1.it === 'b';
      const v0 = k0.v, v1 = k1.v;
      if (typeof v0 === 'number') return bez ? ease1(k0, k1, u, dt, v0, v1, 0) : v0 + (v1 - v0) * u;
      if (Array.isArray(v0)) {
        if (meta && meta.spatial) {
          const seg = A.spatialSeg(k, i);
          if (seg.L > 1e-9) { const dist = bez ? ease1(k0, k1, u, dt, 0, seg.L, 0) : u * seg.L; return A.pointAtDist(seg, dist); }
          return v0.slice();
        }
        const o = new Array(v0.length);
        for (let d = 0; d < v0.length; d++) o[d] = bez ? ease1(k0, k1, u, dt, v0[d], v1[d], d) : v0[d] + (v1[d] - v0[d]) * u;
        return o;
      }
      if (v0 && v0.c !== undefined) { const f = bez ? MF.clamp(ease1(k0, k1, u, dt, 0, 1, 0), 0, 1) : u; return MF.Path.lerpValue(v0, v1, f); }
      return v0;
    },
    keyAt(prop, t) { const k = prop.k; if (!k) return -1; for (let i = 0; i < k.length; i++) if (Math.abs(k[i].t - t) < 1e-4) return i; return -1; },
    // 写入值：开启动画时只在当前时刻创建/更新关键帧
    setValue(prop, t, v, meta) {
      if (!prop.k) { prop.v = MF.clone(v); return -1; }
      let i = A.keyAt(prop, t);
      if (i >= 0) { prop.k[i].v = MF.clone(v); return i; }
      const key = A.mkKey(t, v);
      // 继承相邻关键帧的插值风格
      const k = prop.k; let j = 0; while (j < k.length && k[j].t < t) j++;
      const nb = k[j - 1] || k[j];
      if (nb && nb.ot === 'h') { key.ot = 'h'; }
      k.splice(j, 0, key);
      prop.v = MF.clone(v);
      return j;
    },
    addKey(prop, t, meta) { if (!prop.k) prop.k = []; const v = prop.k.length ? A.value(prop, t, meta) : prop.v; return A.setValue(prop, t, v, meta); },
    removeKey(prop, i) { if (!prop.k) return; prop.k.splice(i, 1); },
    toggleAnimated(prop, t, meta) {
      if (prop.k) { prop.v = MF.clone(A.value(prop, t, meta)); delete prop.k; }
      else prop.k = [A.mkKey(t, prop.v)];
    },
    sort(prop) { if (prop.k) prop.k.sort((a, b) => a.t - b.t); },
    // 缓动预设
    setEase(key, mode, dims) {
      const z = dims > 1 ? new Array(dims).fill(0) : 0;
      if (mode === 'linear') { key.it = 'l'; key.ot = 'l'; delete key.ii; delete key.oi; delete key.is; delete key.os; }
      else if (mode === 'hold') { key.ot = 'h'; }
      else if (mode === 'ease') { key.it = 'b'; key.ot = 'b'; key.ii = 33.333; key.oi = 33.333; key.is = MF.clone(z); key.os = MF.clone(z); }
      else if (mode === 'easeIn') { key.it = 'b'; key.ii = 33.333; key.is = MF.clone(z); }
      else if (mode === 'easeOut') { key.ot = 'b'; key.oi = 33.333; key.os = MF.clone(z); }
    },
    // 数值导数（速度）。空间属性返回沿路径的实际速率
    speed(valueFn, t, meta, h) {
      h = h || 1 / 600;
      const a = valueFn(t - h), b = valueFn(t + h);
      if (typeof a === 'number') return (b - a) / (2 * h);
      if (Array.isArray(a)) { if (meta && meta.spatial) { let s = 0; for (let d = 0; d < a.length; d++) s += (b[d] - a[d]) * (b[d] - a[d]); return Math.sqrt(s) / (2 * h); } return a.map((x, d) => (b[d] - x) / (2 * h)); }
      return 0;
    },
    // 关键帧处的平均速度（用于线性侧的贝塞尔手柄显示）
    segAvg(prop, i, d, meta) {
      const k = prop.k, k0 = k[i], k1 = k[i + 1]; const dt = k1.t - k0.t || 1e-9;
      if (meta && meta.spatial && Array.isArray(k0.v)) return A.spatialSeg(k, i).L / dt;
      if (typeof k0.v === 'number') return (k1.v - k0.v) / dt;
      if (Array.isArray(k0.v)) return (k1.v[d] - k0.v[d]) / dt;
      return 1 / dt;
    },
    segIndex,
  });
  function zeros(n) { return n === 2 ? Z2 : Z3; }
  const Z2 = [0, 0], Z3 = [0, 0, 0];
  function autoTan(keys, i, dims, dir) {
    const p = keys[i - 1], n = keys[i + 1]; if (!p || !n) return zeros(dims);
    const o = new Array(dims); for (let d = 0; d < dims; d++) o[d] = (dir * ((n.v[d] || 0) - (p.v[d] || 0))) / 6;
    return o;
  }
  function bezPt(P0, P1, P2, P3, u, dims) { const o = new Array(dims), w = 1 - u; const a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, e = u * u * u; for (let d = 0; d < dims; d++) o[d] = a * P0[d] + b * P1[d] + c * P2[d] + e * P3[d]; return o; }
  A.bezPt = bezPt;
})();
