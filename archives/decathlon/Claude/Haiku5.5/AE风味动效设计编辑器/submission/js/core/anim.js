/* 关键帧求值：时间插值（线性 / 贝塞尔 / 定格）、空间路径（弧长参数化）、循环外推，
 * 以及对外统一的属性取值入口 value()（先关键帧，再表达式）。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const Model = AE.Model;
  const Anim = (AE.Anim = {});

  // ---------- 时间缓动：三次贝塞尔，x 为时间比例，y 为值比例 ----------
  const bez = (s, a, b) => {
    const m = 1 - s;
    return 3 * m * m * s * a + 3 * m * s * s * b + s * s * s;
  };
  function solveX(p, x1, x2) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // 两关键帧之间的时间缓动：返回 0..1（可能略超出以表示过冲）
  Anim.ease = (k0, k1, p) => {
    if (k0.outT === 'linear' && k1.inT === 'linear') return p;
    const lo = k0.outT === 'linear';
    const li = k1.inT === 'linear';
    const x1 = lo ? 1 / 3 : U.clamp(k0.outI, 0.0001, 1);
    const y1 = lo ? 1 / 3 : k0.outS * x1;
    const x2 = li ? 2 / 3 : U.clamp(1 - k1.inI, 0, 0.9999);
    const y2 = li ? 2 / 3 : 1 - k1.inS * (1 - x2);
    const s = solveX(U.clamp(p, 0, 1), x1, x2);
    return bez(s, y1, y2);
  };

  // ---------- 空间路径 ----------
  const zeroVec = (n) => new Array(n).fill(0);
  const isZeroVec = (v) => !v || v.every((x) => Math.abs(x) < 1e-9);
  const spatialCache = new WeakMap();
  // 构造一段空间曲线的弧长表
  function spatialLUT(k0, k1) {
    const cache = spatialCache.get(k0);
    if (cache && cache.k1 === k1 && cache.ver === Model.version) return cache.lut;
    const n = k0.v.length;
    const cOut = k0.corner ? zeroVec(n) : k0.sOut || zeroVec(n);
    const cIn = k1.corner ? zeroVec(n) : k1.sIn || zeroVec(n);
    const p0 = k0.v, p3 = k1.v;
    const p1 = p0.map((v, i) => v + (cOut[i] || 0));
    const p2 = p3.map((v, i) => v + (cIn[i] || 0));
    const straight = isZeroVec(cOut) && isZeroVec(cIn);
    const N = 160;
    const pts = [];
    const acc = [0];
    for (let i = 0; i <= N; i++) {
      const s = i / N, m = 1 - s;
      const pt = [];
      for (let d = 0; d < n; d++) pt.push(m * m * m * p0[d] + 3 * m * m * s * p1[d] + 3 * m * s * s * p2[d] + s * s * s * p3[d]);
      if (i > 0) acc.push(acc[i - 1] + U.vlen(U.vsub(pt, pts[i - 1])));
      pts.push(pt);
    }
    const lut = { pts, acc, total: acc[N], straight };
    spatialCache.set(k0, { k1, ver: Model.version, lut });
    return lut;
  }
  function spatialPoint(k0, k1, e) {
    const lut = spatialLUT(k0, k1);
    if (lut.straight || lut.total < 1e-9) return U.vlerp(k0.v, k1.v, e);
    const target = U.clamp(e, 0, 1) * lut.total;
    const acc = lut.acc;
    let lo = 0, hi = acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (acc[mid] <= target) lo = mid;
      else hi = mid;
    }
    const seg = acc[hi] - acc[lo] || 1e-9;
    const f = (target - acc[lo]) / seg;
    return U.vlerp(lut.pts[lo], lut.pts[hi], f);
  }

  // ---------- 形状路径形变（轮廓列表） ----------
  // 将两组轮廓按索引配对（孔洞与外轮廓保持对应），顶点数不同时重采样后再插值
  Anim.morphPaths = (A, B, e) => {
    if (!A || !B || !A.length || !B.length) return e < 0.5 ? A || B : B || A;
    const out = [];
    const n = Math.max(A.length, B.length);
    for (let c = 0; c < n; c++) {
      const a = A[Math.min(c, A.length - 1)];
      const b = B[Math.min(c, B.length - 1)];
      out.push(morphPath(a, b, e));
    }
    return out;
  };
  function morphPath(a, b, e) {
    if (a.v.length === b.v.length) {
      const lerpArr = (x, y) => x.map((p, i) => [p[0] + (y[i][0] - p[0]) * e, p[1] + (y[i][1] - p[1]) * e]);
      return { closed: a.closed, v: lerpArr(a.v, b.v), i: lerpArr(a.i, b.i), o: lerpArr(a.o, b.o) };
    }
    // 顶点数不同：两者都采样为相同数目的点，再做插值（闭合则以弧长对齐起点）
    const N = Math.max(24, Math.min(240, Math.max(a.v.length, b.v.length) * 6));
    const pa = resamplePath(a, N), pb = resamplePath(b, N);
    // 通过循环偏移对齐起点，使两条轮廓的对应点距离之和最小
    let best = 0, bestD = Infinity;
    for (let sh = 0; sh < N; sh += Math.max(1, Math.floor(N / 32))) {
      let d = 0;
      for (let k = 0; k < N; k += 4) d += U.vlen(U.vsub(pa[k], pb[(k + sh) % N]));
      if (d < bestD) (bestD = d), (best = sh);
    }
    const v = pa.map((p, k) => U.vlerp(p, pb[(k + best) % N], e));
    return { closed: a.closed, v, i: v.map(() => [0, 0]), o: v.map(() => [0, 0]) };
  }
  function resamplePath(path, N) {
    const poly = AE.Path.flattenBPath(path, 0.5);
    return AE.Path.resampleClosed(poly, N);
  }

  // ---------- 原始关键帧值 ----------
  // lt：图层本地时间；opts.loopOut / loopIn 可覆盖属性上的循环设置
  Anim.keyValue = (prop, lt, opts) => {
    if (!prop.animated || !prop.keys.length) return prop.v;
    const keys = prop.keys;
    const first = keys[0].t, last = keys[keys.length - 1].t;
    const lo = (opts && opts.loopOut !== undefined ? opts.loopOut : prop.loopOut) || null;
    const li = (opts && opts.loopIn !== undefined ? opts.loopIn : prop.loopIn) || null;
    let tt = lt;
    if (keys.length > 1) {
      const period = last - first;
      if (period > 1e-9) {
        if (lt > last && lo) tt = loopTime(lt, first, last, lo, true);
        else if (lt < first && li) tt = loopTime(lt, first, last, li, false);
      }
    }
    if (tt <= first) return cloneVal(keys[0].v);
    if (tt >= last) return cloneVal(keys[keys.length - 1].v);
    // 二分查找所在区间
    let lo_ = 0, hi_ = keys.length - 1;
    while (hi_ - lo_ > 1) {
      const mid = (lo_ + hi_) >> 1;
      if (keys[mid].t <= tt) lo_ = mid;
      else hi_ = mid;
    }
    const k0 = keys[lo_], k1 = keys[hi_];
    if (prop.kind === 'bool' || prop.kind === 'enum' || prop.kind === 'text' || prop.kind === 'hold') return cloneVal(k0.v);
    if (k0.outT === 'hold') return cloneVal(k0.v);
    const dt = k1.t - k0.t || 1e-9;
    const p = (tt - k0.t) / dt;
    const e = Anim.ease(k0, k1, p);
    if (prop.kind === 'path') return Anim.morphPaths(k0.v, k1.v, e);
    if (prop.spatial && Array.isArray(k0.v)) return spatialPoint(k0, k1, e);
    if (Array.isArray(k0.v)) return k0.v.map((x, i) => x + (k1.v[i] - x) * e);
    return k0.v + (k1.v - k0.v) * e;
  };
  function cloneVal(v) {
    return Array.isArray(v) ? (v.length && typeof v[0] === 'object' ? U.clone(v) : v.slice()) : v;
  }
  function loopTime(lt, first, last, mode, out) {
    const period = last - first;
    if (mode === 'pingpong') {
      const u = U.mod(lt - first, 2 * period);
      return u <= period ? first + u : first + 2 * period - u;
    }
    // cycle：out 方向重复、in 方向反向重复
    if (out) return first + U.mod(lt - first, period);
    return last - U.mod(last - lt, period);
  }

  // ---------- 对外取值（含表达式） ----------
  const memoCache = new WeakMap();
  const PENDING = { pending: true }; // 求值进行中的占位，用于检测循环引用
  // comp / layer：属性所属合成与图层；t：所属合成时间（秒）
  Anim.value = (comp, layer, prop, t) => {
    const lt = layer ? t - (layer.startTime || 0) : t;
    if (!prop.animated && !(prop.expr && prop.exprOn)) return prop.v;
    let memo = memoCache.get(prop);
    if (!memo || memo.ver !== Model.version) {
      memo = { ver: Model.version, map: new Map() };
      memoCache.set(prop, memo);
    }
    const key = t.toFixed(6);
    if (memo.map.has(key)) {
      const hit = memo.map.get(key);
      if (hit === PENDING) throw new Error('循环引用：表达式之间互相依赖');
      return hit;
    }
    if (memo.map.size > 4000) memo.map.clear();
    const raw = Anim.keyValue(prop, lt);
    if (!(prop.expr && prop.exprOn && AE.Expr)) return raw;
    memo.map.set(key, PENDING);
    let result;
    try {
      result = AE.Expr.evaluate(comp, layer, prop, t, raw);
    } catch (e) {
      memo.map.delete(key);
      throw e;
    }
    memo.map.set(key, result);
    return result;
  };

  // ---------- 编辑：关键帧增删改 ----------
  // 在图层本地时间 lt 写入一个值：动画属性写关键帧，静态属性直接改值
  Anim.write = (layer, prop, lt, value) => {
    if (!prop.animated) {
      prop.v = Array.isArray(value) ? value.slice() : value;
      return;
    }
    Anim.setKey(prop, lt, value);
  };
  Anim.setKey = (prop, lt, value) => {
    const keys = prop.keys;
    const tol = 1e-4;
    const existing = keys.find((k) => Math.abs(k.t - lt) < tol);
    if (existing) {
      existing.v = Array.isArray(value) ? value.slice() : value;
      return existing;
    }
    const prev = [...keys].reverse().find((k) => k.t < lt);
    const nk = Model.key(lt, value, prev ? { inT: prev.outT, outT: prev.outT, inI: prev.outI, inS: prev.outS, outI: prev.outI, outS: prev.outS } : { inT: 'bezier', outT: 'bezier' });
    if (prop.spatial) nk.sOut = null;
    keys.push(nk);
    keys.sort((a, b) => a.t - b.t);
    return nk;
  };
  // 开启 / 关闭动画（秒表）
  Anim.enable = (prop, lt, currentValue) => {
    if (prop.animated) return;
    prop.animated = true;
    prop.keys = [Model.key(lt, currentValue, { inT: 'bezier', outT: 'bezier' })];
  };
  Anim.disable = (prop, lt) => {
    if (!prop.animated) return;
    prop.v = Anim.keyValue(prop, lt);
    prop.animated = false;
    prop.keys = [];
  };
  Anim.removeKey = (prop, key) => {
    prop.keys = prop.keys.filter((k) => k !== key);
    if (!prop.keys.length) prop.animated = false;
  };
  // 空间路径的采样点（供画布绘制运动路径使用）
  Anim.segmentCurve = (k0, k1) => {
    const lut = spatialLUT(k0, k1);
    return lut.pts;
  };
  // 按速度：沿路径实际速度（像素/秒）或数值变化速度
  Anim.speedAt = (comp, layer, prop, t) => {
    const h = 1 / 240;
    const a = Anim.value(comp, layer, prop, t - h);
    const b = Anim.value(comp, layer, prop, t + h);
    if (prop.spatial && Array.isArray(a)) {
      return U.vlen(U.vsub(b, a)) / (2 * h);
    }
    if (Array.isArray(a)) return U.vlen(U.vsub(b, a)) / (2 * h);
    return (b - a) / (2 * h);
  };
})();
