/* AE Forge Editor - keyframes, interpolation, spatial paths, speed */
(function (global) {
  'use strict';
  const { clamp, lerp, cubicBezier } = AEMath;

  function isArr(v) { return Array.isArray(v); }
  function pad(v, n, fill) {
    if (!isArr(v)) v = [v];
    const out = v.slice(0, n);
    while (out.length < n) out.push(fill === undefined ? out[out.length - 1] : fill);
    return out;
  }
  function num(v) { return typeof v === 'number' ? v : (isArr(v) ? v[0] : 0); }

  function createProp(value, opts) {
    const p = { value: value, keys: [], expr: '' };
    if (opts && opts.spatial) p.spatial = true;
    return p;
  }
  function isAnimated(p) { return !!(p && p.keys && p.keys.length); }
  function hasKeys(p) { return isAnimated(p) && p.keys.length > 0; }

  function keyDefaults(k) {
    if (k.hi === undefined) k.hi = [0.33, 0.33];
    if (k.ho === undefined) k.ho = [0.33, 0.33];
    if (k.hold === undefined) k.hold = false;
    return k;
  }
  function sortKeys(p) { if (p.keys) p.keys.sort((a, b) => a.t - b.t); }

  function segEase(k0, k1) {
    const a = keyDefaults(k0), b = keyDefaults(k1);
    const p1x = clamp(a.ho[0], 0, 1), p1y = a.ho[1];
    const p2x = clamp(1 - b.hi[0], 0, 1), p2y = 1 - b.hi[1];
    return cubicBezier(p1x, p1y, p2x, p2y);
  }
  function timeEase(k0, k1) {
    const a = keyDefaults(k0), b = keyDefaults(k1);
    return cubicBezier(clamp(a.ho[0], 0, 1), a.ho[1], clamp(1 - b.hi[0], 0, 1), 1 - b.hi[1]);
  }

  function lerpVal(a, b, t) {
    if (isArr(a) || isArr(b)) {
      const n = Math.max(isArr(a) ? a.length : 1, isArr(b) ? b.length : 1);
      const A = pad(a, n, isArr(a) ? a[a.length - 1] : a);
      const B = pad(b, n, isArr(b) ? b[b.length - 1] : b);
      const out = [];
      for (let i = 0; i < n; i++) out.push(lerp(A[i], B[i], t));
      return out;
    }
    return lerp(a, b, t);
  }

  // base value from keys only (no expression)
  function keysAt(p, t) {
    if (!p || !p.keys || !p.keys.length) return p ? p.value : 0;
    const ks = p.keys;
    if (t <= ks[0].t) return ks[0].v;
    const last = ks[ks.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
    const k0 = ks[i], k1 = ks[i + 1];
    if (k0.hold) return k0.v;
    const dt = k1.t - k0.t;
    if (dt <= 1e-9) return k1.v;
    const u = (t - k0.t) / dt;
    const e = segEase(k0, k1)(u);
    return lerpVal(k0.v, k1.v, e);
  }

  // spatial position sampling: returns [x,y]
  function spatialKeysAt(p, t) {
    const ks = p.keys;
    if (!ks || ks.length < 2) return keysAt(p, t);
    if (t <= ks[0].t) return ks[0].v;
    const last = ks[ks.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
    const k0 = ks[i], k1 = ks[i + 1];
    if (k0.hold) return k0.v;
    const dt = k1.t - k0.t;
    const u = clamp((t - k0.t) / dt, 0, 1);
    const ease = timeEase(k0, k1);
    const eu = ease(u);
    const p0 = [num(k0.v[0] !== undefined ? k0.v[0] : k0.v), num(k0.v[1] !== undefined ? k0.v[1] : 0)];
    const p3 = [num(k1.v[0] !== undefined ? k1.v[0] : k1.v), num(k1.v[1] !== undefined ? k1.v[1] : 0)];
    const so = k0.spatialOut || [0, 0];
    const si = k1.spatialIn || [0, 0];
    const hasCurve = Math.hypot(so[0], so[1]) > 1e-4 || Math.hypot(si[0], si[1]) > 1e-4;
    let pos;
    if (!hasCurve) {
      pos = [lerp(p0[0], p3[0], eu), lerp(p0[1], p3[1], eu)];
    } else {
      const c1 = [p0[0] + so[0], p0[1] + so[1]];
      const c2 = [p3[0] + si[0], p3[1] + si[1]];
      let param = eu;
      // constant speed when time is linear (handles on the time axis are linear)
      const linTime = Math.abs(k0.ho[1] - 0.33) < 0.02 && Math.abs(k1.hi[1] - 0.33) < 0.02;
      if (linTime) {
        // arc-length parameter table
        const N = 24;
        const lut = [0];
        let prev = bezierPoint(p0, c1, c2, p3, 0);
        let total = 0;
        for (let s = 1; s <= N; s++) {
          const pt = bezierPoint(p0, c1, c2, p3, s / N);
          total += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
          lut.push(total);
          prev = pt;
        }
        const target = eu * total;
        let k = 1;
        while (k < lut.length - 1 && lut[k] < target) k++;
        const span = lut[k] - lut[k - 1] || 1;
        param = (k - 1 + (target - lut[k - 1]) / span) / N;
      }
      pos = bezierPoint(p0, c1, c2, p3, clamp(param, 0, 1));
    }
    return [pos[0], pos[1]];
  }

  function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }
  function bezierTangent(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return [
      3 * mt * mt * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
      3 * mt * mt * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
    ];
  }

  // full evaluation incl. expression (ctx provided by expr.js)
  function evalProp(prop, t, ctx) {
    const base = (prop.spatial && isArr(prop.value)) ? spatialKeysAt(prop, t) : keysAt(prop, t);
    if (!prop.expr) return base;
    const eng = global.AEExpr;
    if (!eng) return base;
    const c = ctx ? Object.assign({}, ctx, { prop }) : { prop };
    const r = eng.evaluate(prop.expr, t, base, c);
    return r.ok ? r.value : base;
  }

  function propSpeed(prop, t, ctx, dt) {
    dt = dt || 1 / 120;
    const a = evalProp(prop, Math.max(0, t - dt), ctx);
    const b = evalProp(prop, t + dt, ctx);
    if (!isArr(a) || !isArr(b)) return Math.abs(b - a) / (2 * dt);
    let s = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) s += (b[i] - a[i]) ** 2;
    return Math.sqrt(s) / (2 * dt);
  }

  function setKey(prop, t, v, opts) {
    t = Math.round(t * 1000) / 1000;
    let k = prop.keys.find(k => Math.abs(k.t - t) < 1e-4);
    if (!k) { k = { t, v: v }; prop.keys.push(k); sortKeys(prop); }
    if (v !== undefined) k.v = v;
    if (opts) Object.assign(k, opts);
    if (opts && opts.resetEase) { k.hi = [0.33, 0.33]; k.ho = [0.33, 0.33]; k.hold = false; }
    return k;
  }

  function easeKeys(prop, mode) {
    if (!prop.keys) return;
    for (const k of prop.keys) {
      if (mode === 'ease') { k.hi = [0.33, 0.0]; k.ho = [0.33, 0.0]; k.hold = false; }
      else if (mode === 'linear') { k.hi = [0.33, 0.33]; k.ho = [0.33, 0.33]; k.hold = false; }
      else if (mode === 'hold') { k.hold = true; }
      else if (mode === 'easeIn') { k.ho = [0.5, 0]; }
      else if (mode === 'easeOut') { k.hi = [0.5, 0]; }
    }
  }

  function cloneProp(p) { return JSON.parse(JSON.stringify(p)); }

  function propValueAt(prop, t, ctx) { return evalProp(prop, t, ctx); }

  // Dense sampling for graph editors
  function sampleCurve(prop, t0, t1, n, ctx) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      out.push({ t, v: evalProp(prop, t, ctx) });
    }
    return out;
  }

  function keyframeTimes(prop) { return (prop.keys || []).map(k => k.t); }

  global.AEAnim = {
    createProp, isAnimated, hasKeys, keysAt, spatialKeysAt, evalProp, propSpeed,
    setKey, easeKeys, sortKeys, cloneProp, sampleCurve, keyframeTimes,
    lerpVal, segEase, timeEase, bezierPoint, bezierTangent, num, pad, isArr, keyDefaults,
  };
})(window);