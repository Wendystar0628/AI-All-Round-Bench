/* ============================================================
   util.js — 数学 / 随机 / 缓动 / 颜色 / 矩阵
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};

  const U = AE.util = {};

  U.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.mod = (a, n) => ((a % n) + n) % n;
  U.round = (v, d = 3) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
  U.deg = r => r * 180 / Math.PI;
  U.rad = d => d * Math.PI / 180;
  U.smoothstep = t => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.fract = x => x - Math.floor(x);
  U.sign = x => x < 0 ? -1 : (x > 0 ? 1 : 0);
  U.approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;

  /* ---------- 可复现随机 ---------- */
  U.hashStr = function (s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  U.mulberry32 = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.rngFrom = function (str) { return U.mulberry32(U.hashStr(str)); };
  /* 一维值噪声（可复现），wiggle 依赖它 */
  U.valueNoise1 = function (x, seed) {
    const i = Math.floor(x), f = x - i;
    const h = n => {
      let t = (n + seed * 374761393) >>> 0;
      t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
      return ((t ^ (t >>> 16)) >>> 0) / 4294967296 * 2 - 1;
    };
    const a = h(i), b = h(i + 1);
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
  U.noise2 = function (x, y, seed) {
    const h = (ix, iy) => {
      let t = (ix * 374761393 + iy * 668265263 + seed * 1442695040) >>> 0;
      t = Math.imul(t ^ (t >>> 13), 1274126177) >>> 0;
      return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
    };
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
  };
  U.fbm2 = function (x, y, seed, oct = 3) {
    let v = 0, amp = .5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * U.noise2(x * f, y * f, seed + i * 17); f *= 2; amp *= .5; }
    return v;
  };

  /* ---------- 缓动 ---------- */
  U.ease = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => 1 - (1 - t) * (1 - t),
    easeInOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    sineIn: t => 1 - Math.cos(t * Math.PI / 2),
    sineOut: t => Math.sin(t * Math.PI / 2),
    sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
    expoIn: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    expoOut: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    circIn: t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
    circOut: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
    backIn: t => 2.70158 * t * t * t - 1.70158 * t * t,
    backOut: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    bounceOut: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
      return n * (t -= 2.625 / d) * t + .984375;
    }
  };
  U.easeNames = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'sineIn', 'sineOut', 'sineInOut', 'expoIn', 'expoOut', 'circIn', 'circOut', 'backIn', 'backOut', 'bounceOut'];

  /* ---------- 向量 ---------- */
  const V = U.vec = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], (a[2] || 0) + (b[2] || 0)],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)],
    mul: (a, s) => [a[0] * s, a[1] * s, (a[2] || 0) * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + (a[2] || 0) * (b[2] || 0),
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2] || 0),
    norm: function (a) { const l = V.len(a) || 1; return [a[0] / l, a[1] / l, (a[2] || 0) / l]; },
    lerp: (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2] || 0, b[2] || 0, t)],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0))
  };

  /* ---------- 4x4 矩阵（列主序，WebGL 风格） ---------- */
  const M = U.mat4 = {};
  M.create = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  M.identity = function (o) { o = o || M.create(); o.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return o; };
  M.copy = (a) => new Float32Array(a);
  M.multiply = function (a, b, o) {
    o = o || M.create();
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };
  M.perspective = function (fovy, aspect, near, far, o) {
    o = o || M.create(); const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };
  M.ortho = function (l, r, b, t, n, f, o) {
    o = o || M.create();
    o[0] = 2 / (r - l); o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 2 / (t - b); o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = -2 / (f - n); o[11] = 0;
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  };
  M.lookAt = function (eye, center, up, o) {
    o = o || M.create();
    let z = V.norm(V.sub(eye, center));
    if (V.len(z) < 1e-6) z = [0, 0, 1];
    let x = V.cross(up, z);
    if (V.len(x) < 1e-6) { x = V.cross([0, 0, 1], z); if (V.len(x) < 1e-6) x = [1, 0, 0]; }
    x = V.norm(x);
    const y = V.cross(z, x);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[3] = 0;
    o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[7] = 0;
    o[8] = x[2]; o[9] = y[2]; o[10] = z[2]; o[11] = 0;
    o[12] = -V.dot(x, eye); o[13] = -V.dot(y, eye); o[14] = -V.dot(z, eye); o[15] = 1;
    return o;
  };
  M.fromTRS = function (t, r, s, o) {
    o = o || M.create();
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    // R = Rz * Ry * Rx  (AE: X then Y then Z)
    const m00 = cz * cy, m01 = cz * sy * sx - sz * cx, m02 = cz * sy * cx + sz * sx;
    const m10 = sz * cy, m11 = sz * sy * sx + cz * cx, m12 = sz * sy * cx - cz * sx;
    const m20 = -sy, m21 = cy * sx, m22 = cy * cx;
    o[0] = m00 * s[0]; o[1] = m10 * s[0]; o[2] = m20 * s[0]; o[3] = 0;
    o[4] = m01 * s[1]; o[5] = m11 * s[1]; o[6] = m21 * s[1]; o[7] = 0;
    o[8] = m02 * s[2]; o[9] = m12 * s[2]; o[10] = m22 * s[2]; o[11] = 0;
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  };
  M.translate = function (x, y, z, o) {
    o = o || M.create(); M.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
  };
  M.scale = function (x, y, z, o) {
    o = o || M.create(); M.identity(o); o[0] = x; o[5] = y; o[10] = z === undefined ? 1 : z; return o;
  };
  M.rotationX = function (a, o) { o = o || M.create(); M.identity(o); const c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; };
  M.rotationY = function (a, o) { o = o || M.create(); M.identity(o); const c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; };
  M.rotationZ = function (a, o) { o = o || M.create(); M.identity(o); const c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; };
  M.invert = function (a, o) {
    o = o || M.create();
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M.identity(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };
  M.transpose = function (a, o) {
    o = o || M.create();
    o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
    o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = a[13];
    o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = a[14];
    o[12] = a[3]; o[13] = a[7]; o[14] = a[11]; o[15] = a[15];
    return o;
  };
  M.xformPoint = function (m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * (p[2] || 0) + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * (p[2] || 0) + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * (p[2] || 0) + m[14]
    ];
  };
  M.xformDir = function (m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * (p[2] || 0),
      m[1] * p[0] + m[5] * p[1] + m[9] * (p[2] || 0),
      m[2] * p[0] + m[6] * p[1] + m[10] * (p[2] || 0)
    ];
  };
  M.mulPoint = function (m, p) {
    const x = p[0], y = p[1];
    return [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], m[2] * x + m[6] * y + m[14]];
  };

  /* ---------- 颜色 ---------- */
  const C = U.color = {};
  C.hex2rgb = function (hex) {
    if (Array.isArray(hex)) return hex.slice(0, 3);
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (isNaN(n)) return [1, 1, 1];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  C.rgb2hex = function (rgb) {
    const h = v => Math.round(U.clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
    return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
  };
  C.rgb2hsl = function ([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  };
  C.hsl2rgb = function ([h, s, l]) {
    h = U.mod(h, 1);
    if (s === 0) return [l, l, l];
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => {
      t = U.mod(t, 1);
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  };
  C.mix = (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)];

  /* ---------- 杂项 ---------- */
  U.uid = (function () { let n = 1; return p => (p || 'id') + '_' + (n++).toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); })();
  U.deepClone = o => (typeof structuredClone === 'function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
  U.isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.pad = (n, w = 2) => String(n).padStart(w, '0');
  U.timecode = function (t, fps) {
    const f = Math.round(t * fps);
    const h = Math.floor(f / (fps * 3600)), m = Math.floor(f / (fps * 60)) % 60, s = Math.floor(f / fps) % 60, ff = f % fps;
    return `${U.pad(h)}:${U.pad(m)}:${U.pad(s)}:${U.pad(ff)}`;
  };
  U.fmtTime = function (t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${U.pad(m)}:${s.toFixed(2).padStart(5, '0')}`;
  };
  U.dom = function (tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  U.download = function (filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  /* 数值输入拖动（Ctrl+Z 等不冲突） */
  U.makeNumeric = function (input, get, set, opts) {
    opts = opts || {};
    const step = opts.step || 1;
    let dragging = false, sx = 0, sv = 0, moved = false;
    input.addEventListener('pointerdown', e => {
      if (document.activeElement === input) return;
      dragging = true; moved = false; sx = e.clientX; sv = get();
      input.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    input.addEventListener('pointermove', e => {
      if (!dragging) return;
      const d = (e.clientX - sx);
      if (Math.abs(d) > 1) moved = true;
      const mult = e.shiftKey ? .1 : (e.ctrlKey ? 10 : 1);
      let v = sv + d * step * mult;
      if (opts.min !== undefined) v = Math.max(opts.min, v);
      if (opts.max !== undefined) v = Math.min(opts.max, v);
      set(v);
      input.value = opts.fmt ? opts.fmt(v) : U.round(v, 3);
    });
    input.addEventListener('pointerup', e => {
      if (dragging) { dragging = false; try { input.releasePointerCapture(e.pointerId); } catch (_) { } }
      if (moved) { if (opts.commit) opts.commit(); }
      else { input.focus(); input.select(); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { input.blur(); if (opts.commit) opts.commit(); }
      else if (e.key === 'Escape') { input.value = opts.fmt ? opts.fmt(get()) : U.round(get(), 3); input.blur(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => { if (opts.commit) opts.commit(); });
  };
})(window);
