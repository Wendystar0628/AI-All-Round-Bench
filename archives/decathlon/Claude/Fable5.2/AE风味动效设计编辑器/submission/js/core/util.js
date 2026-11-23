// 基础工具：命名空间、事件、随机/噪声、颜色、矩阵与向量
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});

  MF.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  MF.lerp = (a, b, t) => a + (b - a) * t;
  MF.smoothstep = (a, b, x) => { let t = MF.clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
  MF.DEG = Math.PI / 180;
  MF.clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  MF.isNum = (x) => typeof x === 'number' && isFinite(x);
  MF.fmt = (x, d = 1) => { if (!isFinite(x)) return '—'; const s = x.toFixed(d); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; };

  // ---------- 事件 ----------
  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); }
    off(ev, fn) { const a = this._h[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    emit(ev, ...args) { const a = this._h[ev]; if (a) for (const fn of a.slice()) { try { fn(...args); } catch (e) { console.error('[事件 ' + ev + ']', e); } } }
  }
  MF.Emitter = Emitter;

  // ---------- 确定性哈希/随机/噪声 ----------
  MF.hash32 = function (a, b, c) {
    let h = (a | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h ^= (b | 0) + 0x7f4a7c15; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= (c | 0) + 0x165667b1; h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return h >>> 0;
  };
  MF.rand01 = (a, b, c) => MF.hash32(a, b, c) / 4294967296;
  MF.strHash = function (s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // 平滑一维噪声（-1..1）
  MF.noise1 = function (x, seed) {
    const i = Math.floor(x), f = x - i;
    const g0 = MF.rand01(i, seed, 11) * 2 - 1, g1 = MF.rand01(i + 1, seed, 11) * 2 - 1;
    // 梯度噪声
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    return ((g0 * f) * (1 - u) + (g1 * (f - 1)) * u) * 2.2;
  };
  // 三维值噪声（-1..1）
  MF.noise3 = function (x, y, z, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const s = seed | 0;
    const h = (a, b, c) => MF.hash32(a * 73856093 ^ b * 19349663, c * 83492791 ^ s, 7) / 2147483648 - 1;
    const c000 = h(xi, yi, zi), c100 = h(xi + 1, yi, zi), c010 = h(xi, yi + 1, zi), c110 = h(xi + 1, yi + 1, zi);
    const c001 = h(xi, yi, zi + 1), c101 = h(xi + 1, yi, zi + 1), c011 = h(xi, yi + 1, zi + 1), c111 = h(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };

  // ---------- 颜色 ----------
  MF.hexToRgb = function (hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  };
  MF.rgbToHex = function (c) {
    const f = (x) => { const v = Math.round(MF.clamp(x, 0, 1) * 255); return (v < 16 ? '0' : '') + v.toString(16); };
    return '#' + f(c[0]) + f(c[1]) + f(c[2]);
  };
  MF.cssColor = (c, a) => `rgba(${Math.round(MF.clamp(c[0], 0, 1) * 255)},${Math.round(MF.clamp(c[1], 0, 1) * 255)},${Math.round(MF.clamp(c[2], 0, 1) * 255)},${a === undefined ? (c[3] === undefined ? 1 : c[3]) : a})`;

  // ---------- 向量 ----------
  const V3 = (MF.V3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  });

  // ---------- 4x4 矩阵（列主序 Float64Array）----------
  const M4 = (MF.M4 = {
    ident() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul(a, b) {
      const o = new Float64Array(16);
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return o;
    },
    trans(x, y, z) { const m = M4.ident(); m[12] = x; m[13] = y; m[14] = z || 0; return m; },
    scale(x, y, z) { const m = M4.ident(); m[0] = x; m[5] = y; m[10] = z === undefined ? 1 : z; return m; },
    rotX(a) { const m = M4.ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    rotY(a) { const m = M4.ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rotZ(a) { const m = M4.ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    // T * Rx * Ry * Rz * S * T(-anchor)
    compose(pos, rot, scl, anc) {
      let m = M4.trans(pos[0], pos[1], pos[2] || 0);
      if (rot[0]) m = M4.mul(m, M4.rotX(rot[0] * MF.DEG));
      if (rot[1]) m = M4.mul(m, M4.rotY(rot[1] * MF.DEG));
      if (rot[2]) m = M4.mul(m, M4.rotZ(rot[2] * MF.DEG));
      m = M4.mul(m, M4.scale(scl[0], scl[1], scl[2] === undefined ? 1 : scl[2]));
      if (anc && (anc[0] || anc[1] || anc[2])) m = M4.mul(m, M4.trans(-anc[0], -anc[1], -(anc[2] || 0)));
      return m;
    },
    invert(a) {
      const o = new Float64Array(16);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (Math.abs(det) < 1e-30) return M4.ident();
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    // 变换点（含透视除法）
    tp(m, p) {
      const x = p[0], y = p[1], z = p[2] || 0;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const iw = w ? 1 / w : 1;
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) * iw, (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw, (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw];
    },
    tp4(m, p) {
      const x = p[0], y = p[1], z = p[2] || 0;
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
    },
    // 变换方向
    td(m, d) { return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]]; },
    // 摄像机局部矩阵：x 右，y 下，z 前
    lookAt(pos, poi, roll) {
      let f = V3.sub(poi, pos);
      if (V3.len(f) < 1e-9) f = [0, 0, 1];
      f = V3.norm(f);
      let r = V3.cross([0, 1, 0], f);
      if (V3.len(r) < 1e-6) r = [1, 0, 0]; else r = V3.norm(r);
      const d = V3.cross(f, r);
      const m = M4.ident();
      m[0] = r[0]; m[1] = r[1]; m[2] = r[2];
      m[4] = d[0]; m[5] = d[1]; m[6] = d[2];
      m[8] = f[0]; m[9] = f[1]; m[10] = f[2];
      m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2];
      return roll ? M4.mul(m, M4.rotZ(roll * MF.DEG)) : m;
    },
    // 从矩阵分解 位置/缩放/旋转（XYZ，度），忽略斜切
    decompose(m) {
      const pos = [m[12], m[13], m[14]];
      let sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
      // 行列式为负时翻转 X
      const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
      if (det < 0) sx = -sx;
      const r00 = m[0] / (sx || 1), r10 = m[1] / (sx || 1), r20 = m[2] / (sx || 1);
      const r01 = m[4] / (sy || 1), r11 = m[5] / (sy || 1), r21 = m[6] / (sy || 1);
      const r02 = m[8] / (sz || 1), r12 = m[9] / (sz || 1), r22 = m[10] / (sz || 1);
      // R = Rx * Ry * Rz
      let rx, ry, rz;
      const sy_ = MF.clamp(r02, -1, 1);
      ry = Math.asin(sy_);
      if (Math.abs(sy_) < 0.99999) { rx = Math.atan2(-r12, r22); rz = Math.atan2(-r01, r00); }
      else { rx = Math.atan2(r21, r11); rz = 0; }
      return { pos, scale: [sx, sy, sz], rot: [rx / MF.DEG, ry / MF.DEG, rz / MF.DEG] };
    },
    toF32(m) { return new Float32Array(m); },
  });

  // 贝塞尔工具
  MF.bez = {
    pt(p0, p1, p2, p3, t) { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; },
    d(p0, p1, p2, p3, t) { const u = 1 - t; return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2); },
    // 解 x(s)=x，x 单调
    solve(x0, x1, x2, x3, x) {
      if (x <= x0) return 0; if (x >= x3) return 1;
      let lo = 0, hi = 1, s = (x - x0) / (x3 - x0 || 1);
      for (let i = 0; i < 8; i++) {
        const fx = MF.bez.pt(x0, x1, x2, x3, s) - x;
        if (Math.abs(fx) < 1e-9) return s;
        const dx = MF.bez.d(x0, x1, x2, x3, s);
        if (fx > 0) hi = s; else lo = s;
        let ns = Math.abs(dx) > 1e-12 ? s - fx / dx : (lo + hi) / 2;
        if (ns <= lo || ns >= hi) ns = (lo + hi) / 2;
        s = ns;
      }
      for (let i = 0; i < 30; i++) { const fx = MF.bez.pt(x0, x1, x2, x3, s) - x; if (Math.abs(fx) < 1e-10) break; if (fx > 0) hi = s; else lo = s; s = (lo + hi) / 2; }
      return s;
    },
  };

  // DOM 小助手
  MF.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) { if (c === null || c === undefined || c === false) continue; el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); }
    return el;
  };
})();
