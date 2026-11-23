/* ============================================================
   anim.js — 关键帧 / 时间插值 / 空间路径 / 曲线采样
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const A = AE.anim = {};

  A.isVector = v => Array.isArray(v);
  A.isNum = v => typeof v === 'number';

  function lerpVal(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * t;
    if (Array.isArray(a)) {
      const out = new Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = a[i] + ((b[i] !== undefined ? b[i] : a[i]) - a[i]) * t;
      return out;
    }
    return t < 1 ? a : b;
  }
  A.lerpVal = lerpVal;

  A.cloneKey = k => ({
    t: k.t, v: Array.isArray(k.v) ? k.v.slice() : k.v,
    inInterp: k.inInterp || 'bezier', outInterp: k.outInterp || 'bezier',
    inEase: k.inEase || null, outEase: k.outEase || null,
    hi: k.hi ? { dt: k.hi.dt, dv: k.hi.dv } : { dt: 0, dv: 0 },
    ho: k.ho ? { dt: k.ho.dt, dv: k.ho.dv } : { dt: 0, dv: 0 },
    sp: k.sp ? { in: { x: k.sp.in.x, y: k.sp.in.y }, out: { x: k.sp.out.x, y: k.sp.out.y } } : null,
    selected: !!k.selected
  });

  A.newKey = function (t, v) {
    return {
      t, v: Array.isArray(v) ? v.slice() : v,
      inInterp: 'bezier', outInterp: 'bezier', inEase: null, outEase: null,
      hi: { dt: 0, dv: 0 }, ho: { dt: 0, dv: 0 }, sp: null, selected: false
    };
  };

  /** 插入关键帧（同一时刻存在则更新） */
  A.addKey = function (track, t, v, opts) {
    opts = opts || {};
    t = Math.round(t * 1e5) / 1e5;
    const k = A.newKey(t, v);
    if (opts.interp) { k.inInterp = k.outInterp = opts.interp; }
    if (opts.ease) { k.inEase = k.outEase = opts.ease; }
    let i = track.keys.findIndex(kk => Math.abs(kk.t - t) < 1e-4);
    if (i >= 0) { track.keys[i] = Object.assign(track.keys[i], { v: Array.isArray(v) ? v.slice() : v }); }
    else {
      track.keys.push(k);
      track.keys.sort((a, b) => a.t - b.t);
      i = track.keys.indexOf(k);
    }
    A.refreshHandles(track);
    if (opts.spatial) A.autoSpatial(track);
    return track.keys[i];
  };

  /** 重算默认手柄（线性 1/3） */
  A.refreshHandles = function (track) {
    const ks = track.keys;
    const third = (a, b) => Array.isArray(a)
      ? a.map((_, i) => (((b[i] !== undefined ? b[i] : a[i]) - a[i]) / 3))
      : ((b - a) / 3);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], prev = ks[i - 1], next = ks[i + 1];
      if (prev) {
        const dt = (k.t - prev.t) / 3, dv = third(k.v, prev.v);
        if (!k.hiCustom) k.hi = { dt, dv };
      } else if (!k.hiCustom) k.hi = { dt: 0, dv: zeroDv(k.v) };
      if (next) {
        const dt = (next.t - k.t) / 3, dv = third(next.v, k.v);
        if (!k.hoCustom) k.ho = { dt, dv };
      } else if (!k.hoCustom) k.ho = { dt: 0, dv: zeroDv(k.v) };
    }
  };
  function zeroDv(v) { return Array.isArray(v) ? v.map(() => 0) : 0; }

  /** 自动生成空间切线（AE 风格：朝向相邻关键帧，1/3 距离） */
  A.autoSpatial = function (track) {
    const ks = track.keys;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], prev = ks[i - 1], next = ks[i + 1];
      if (!k.sp) k.sp = { in: { x: 0, y: 0 }, out: { x: 0, y: 0 } };
      if (prev) {
        const dx = k.v[0] - prev.v[0], dy = k.v[1] - prev.v[1];
        k.sp.in = { x: dx / 3, y: dy / 3 };
      } else k.sp.in = { x: 0, y: 0 };
      if (next) {
        const dx = next.v[0] - k.v[0], dy = next.v[1] - k.v[1];
        k.sp.out = { x: dx / 3, y: dy / 3 };
      } else k.sp.out = { x: 0, y: 0 };
    }
  };

  A.getKey = (track, t) => track.keys.find(k => Math.abs(k.t - t) < 1e-4);
  A.removeKey = function (track, t) {
    const i = track.keys.findIndex(k => Math.abs(k.t - t) < 1e-4);
    if (i >= 0) { track.keys.splice(i, 1); A.refreshHandles(track); return true; }
    return false;
  };

  /* ---------- 三次贝塞尔求解 ---------- */
  function bez(a, b, c, d, u) {
    const mu = 1 - u;
    return mu * mu * mu * a + 3 * mu * mu * u * b + 3 * mu * u * u * c + u * u * u * d;
  }
  function solveU(x0, x1, x2, x3, x) {
    // 单调性假设，二分求解
    let lo = 0, hi = 1, u = 0.5;
    for (let i = 0; i < 40; i++) {
      u = (lo + hi) / 2;
      const v = bez(x0, x1, x2, x3, u);
      if (v < x) lo = u; else hi = u;
    }
    return u;
  }

  /**
   * 段内求值
   * 返回 { prog: 时间进度 0..1（缓动后）, val: 标量贝塞尔求得的最终值 }
   * 句柄语义：ho = 出把手（k.t+dt, k.v+dv）；hi = 入把手（k.t-dt, k.v-dv）
   */
  function segmentProgress(k1, k2, t) {
    const t1 = k1.t, t2 = k2.t;
    if (t2 - t1 <= 1e-9) return { prog: 1, val: null };
    let u = U.clamp((t - t1) / (t2 - t1), 0, 1);
    if (k1.outInterp === 'hold') return { prog: 0, val: null };
    if (k1.outEase) {
      const fn = U.ease[k1.outEase] || U.ease.linear;
      return { prog: fn(u), val: null };
    }
    if (k1.outInterp === 'linear') return { prog: u, val: null };
    // 贝塞尔：先由时间手柄解出参数 uu，再按各分量求值
    const x0 = t1, x1 = t1 + (k1.ho ? k1.ho.dt : 0), x2 = t2 - (k2.hi ? k2.hi.dt : 0), x3 = t2;
    const xm = bez(x0, x1, x2, x3, u);
    const uu = solveU(x0, x1, x2, x3, xm);
    const dvOf = (h, sign) => {
      if (!h) return null;
      const d = h.dv;
      if (Array.isArray(d)) return d.map(v => v * sign);
      return d * sign;
    };
    const y0 = k1.v, y3 = k2.v;
    const y1 = addVal(y0, dvOf(k1.ho, 1));
    const y2 = addVal(y3, dvOf(k2.hi, -1));
    if (Array.isArray(y0)) {
      const n = Math.max(y0.length, y3.length);
      const val = [];
      for (let i = 0; i < n; i++) {
        const a = y0[i] !== undefined ? y0[i] : y3[i];
        const b = y3[i] !== undefined ? y3[i] : y0[i];
        const c1 = y1 ? (y1[i] !== undefined ? y1[i] : a) : a;
        const c2 = y2 ? (y2[i] !== undefined ? y2[i] : b) : b;
        val.push(bez(a, c1, c2, b, uu));
      }
      return { prog: uu, val };
    }
    return { prog: uu, val: bez(y0, y1, y2, y3, uu) };
  }
  function addVal(a, d) {
    if (d === null || d === undefined) return a;
    if (Array.isArray(a)) {
      const out = a.slice();
      for (let i = 0; i < out.length; i++) out[i] += (Array.isArray(d) ? (d[i] || 0) : d);
      return out;
    }
    return a + d;
  }

  /** 数值轨迹（用于曲线编辑器） */
  A.evalTrack = function (track, t) {
    const ks = track.keys;
    if (!ks.length) return undefined;
    if (t <= ks[0].t) return ks[0].v;
    if (t >= ks[ks.length - 1].t) return ks[ks.length - 1].v;
    let i = 0;
    for (let j = 0; j < ks.length - 1; j++) if (t >= ks[j].t && t < ks[j + 1].t) { i = j; break; }
    const k1 = ks[i], k2 = ks[i + 1];
    const seg = segmentProgress(k1, k2, t);
    if (track.spatial && Array.isArray(k1.v) && k1.v.length >= 2) {
      return A.spatialPoint(track, k1, k2, seg.prog);
    }
    if (seg.val !== null && seg.val !== undefined) return seg.val;
    return lerpVal(k1.v, k2.v, seg.prog);
  };

  /* ---------- 空间路径 ---------- */
  A.spatialCtrl = function (k1, k2) {
    const p0 = k1.v, p3 = k2.v;
    const o = (k1.sp && k1.sp.out) || { x: 0, y: 0 };
    const i = (k2.sp && k2.sp.in) || { x: 0, y: 0 };
    return {
      p0: [p0[0], p0[1]], p1: [p0[0] + o.x, p0[1] + o.y],
      p2: [p3[0] + i.x, p3[1] + i.y], p3: [p3[0], p3[1]]
    };
  };
  function arcTable(c, n = 48) {
    const pts = [], len = [0];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = bez(c.p0[0], c.p1[0], c.p2[0], c.p3[0], u);
      const y = bez(c.p0[1], c.p1[1], c.p2[1], c.p3[1], u);
      pts.push([x, y]);
      if (i > 0) len.push(len[i - 1] + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]));
    }
    return { pts, len, total: len[n] || 1 };
  }
  /** 沿路径按弧长取点（保证线性时间下匀速） */
  A.spatialPoint = function (track, k1, k2, p) {
    const c = A.spatialCtrl(k1, k2);
    const { pts, len, total } = arcTable(c);
    const target = U.clamp(p, 0, 1) * total;
    let i = 1;
    while (i < len.length && len[i] < target) i++;
    if (i >= len.length) return pts[pts.length - 1].slice();
    const l0 = len[i - 1], l1 = len[i];
    const f = l1 - l0 > 1e-9 ? (target - l0) / (l1 - l0) : 0;
    return [U.lerp(pts[i - 1][0], pts[i][0], f), U.lerp(pts[i - 1][1], pts[i][1], f)];
  };

  /** 采样整条运动路径（画布绘制用） */
  A.samplePath = function (track, t0, t1, samples) {
    const out = [];
    const ks = track.keys;
    if (ks.length < 2) return out;
    samples = samples || 60;
    for (let s = 0; s <= samples; s++) {
      const t = U.lerp(t0, t1, s / samples);
      let i = 0;
      for (let j = 0; j < ks.length - 1; j++) if (t >= ks[j].t && t < ks[j + 1].t) { i = j; break; }
      const k1 = ks[i], k2 = ks[Math.min(i + 1, ks.length - 1)];
      const seg = segmentProgress(k1, k2, t);
      out.push(A.spatialPoint(track, k1, k2, seg.prog));
    }
    return out;
  };

  /** 速度曲线（位置为沿路径的实际速度） */
  A.speedAt = function (track, t, dt = 1 / 60) {
    const a = A.evalTrack(track, Math.max(t - dt, 0));
    const b = A.evalTrack(track, t + dt);
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(b - a) / (2 * dt);
    if (Array.isArray(a) && Array.isArray(b)) {
      let s = 0;
      for (let i = 0; i < a.length; i++) { const d = (b[i] - a[i]) / (2 * dt); s += d * d; }
      return Math.sqrt(s);
    }
    return 0;
  };

  /** 采样曲线（值曲线 / 速度曲线） */
  A.sampleCurve = function (track, t0, t1, n, mode) {
    const out = [];
    n = n || 120;
    for (let i = 0; i <= n; i++) {
      const t = U.lerp(t0, t1, i / n);
      let v;
      if (mode === 'speed') v = A.speedAt(track, t);
      else {
        v = A.evalTrack(track, t);
        if (Array.isArray(v)) v = v[0];
        if (typeof v !== 'number') v = 0;
      }
      out.push([t, v]);
    }
    return out;
  };

  /** 关键帧选择与批量操作 */
  A.moveKeys = function (track, times, dt) {
    for (const t of times) {
      const k = A.getKey(track, t);
      if (k) { k.t = Math.round((k.t + dt) * 1e5) / 1e5; }
    }
    track.keys.sort((a, b) => a.t - b.t);
    A.refreshHandles(track);
  };
  A.scaleKeys = function (track, t0, t1, pivot, factor) {
    for (const k of track.keys) {
      if (k.t >= t0 - 1e-6 && k.t <= t1 + 1e-6) {
        k.t = pivot + (k.t - pivot) * factor;
      }
    }
    track.keys.sort((a, b) => a.t - b.t);
    A.refreshHandles(track);
  };
  A.copyKeys = function (track, times) {
    return times.map(t => A.getKey(track, t)).filter(Boolean).map(A.cloneKey);
  };
  A.pasteKeys = function (track, keys, tOffset) {
    for (const src of keys) {
      const k = A.cloneKey(src);
      k.t = Math.round((k.t + tOffset) * 1e5) / 1e5;
      const ex = A.getKey(track, k.t);
      if (ex) Object.assign(ex, { v: Array.isArray(k.v) ? k.v.slice() : k.v });
      else track.keys.push(k);
    }
    track.keys.sort((a, b) => a.t - b.t);
    A.refreshHandles(track);
  };
  /** F9：缓入缓出 */
  A.easyEase = function (track, times) {
    for (const k of track.keys) {
      if (!times || times.some(t => Math.abs(t - k.t) < 1e-4)) {
        k.inEase = null; k.outEase = null;
        k.inInterp = 'bezier'; k.outInterp = 'bezier';
        k.hi = { dt: 0, dv: 0 }; k.ho = { dt: 0, dv: 0 };
        k.hiCustom = true; k.hoCustom = true;
      }
    }
  };
  A.setInterpolation = function (track, times, interp, easeName) {
    for (const k of track.keys) {
      if (!times || times.some(t => Math.abs(t - k.t) < 1e-4)) {
        k.inInterp = interp; k.outInterp = interp;
        k.inEase = easeName || null; k.outEase = easeName || null;
        k.hiCustom = false; k.hoCustom = false;
        k.hi = { dt: 0, dv: 0 }; k.ho = { dt: 0, dv: 0 };
      }
    }
    A.refreshHandles(track);
  };
})(window);
