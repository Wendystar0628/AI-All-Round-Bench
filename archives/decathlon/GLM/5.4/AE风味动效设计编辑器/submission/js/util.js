/* ============================================================
   util.js — 数学、随机、缓动、颜色、折线简化、三角化
   ============================================================ */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (v - a) / (b - a || 1e-9);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
  const sign = (v) => v < 0 ? -1 : (v > 0 ? 1 : 0);

  /* ---------- 可复现随机 ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class RNG {
    constructor(seed) { this._r = mulberry32((seed | 0) || 1); }
    next() { return this._r(); }
    range(a, b) { return a + (b - a) * this._r(); }
    int(n) { return Math.floor(this._r() * n); }
    pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
    gauss() { let u = 0, v = 0; while (u === 0) u = this._r(); while (v === 0) v = this._r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
    sign() { return this._r() < 0.5 ? -1 : 1; }
  }
  function hash1(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }

  /* ---------- 缓动 ---------- */
  const Ease = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => t * (2 - t),
    inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    inCubic: t => t * t * t,
    outCubic: t => (--t) * t * t + 1,
    inOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    outQuart: t => 1 - (--t) * t * t * t,
    inOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
    outQuint: t => 1 + (--t) * t * t * t * t,
    inOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
    outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: t => { const c4 = TAU / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; }
  };

  // CSS 风格三次贝塞尔缓动（x1,y1,x2,y2），用于关键帧时间缓动
  function bezierY(x, x1, y1, x2, y2) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // 牛顿迭代求参数 u
    let u = x;
    for (let i = 0; i < 8; i++) {
      const xu = cubic1(u, x1, x2) - x;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(xu) < 1e-6) break;
      if (Math.abs(dx) < 1e-9) break;
      u -= xu / dx;
      if (u < 0) u = 0; else if (u > 1) u = 1;
    }
    return cubic1(u, y1, y2);
  }
  function cubic1(u, a, b) { const v = 1 - u; return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u; }
  // 默认缓入缓出
  const EASE_IN_OUT = [0.42, 0, 0.58, 1];
  const EASE_IN = [0.55, 0.055, 0.675, 0.19];
  const EASE_OUT = [0.215, 0.61, 0.355, 1];

  /* ---------- 颜色 ---------- */
  function hex2rgb(hex) {
    if (typeof hex !== 'string') return hex;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function rgb2hex(r, g, b) {
    const f = v => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = t => { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  function rgb2hsl(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
    return [h * 360, s, l];
  }
  function mixColor(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }
  function rgbaStr(c, a) { const C = hex2rgb(c); return `rgba(${Math.round(C[0] * 255)},${Math.round(C[1] * 255)},${Math.round(C[2] * 255)},${a})`; }

  /* ---------- 矩阵 ---------- */
  // 2D 仿射 [a,b,c,d,e,f]
  const M2 = {
    ident: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
    translate: (x, y) => [1, 0, 0, 1, x, y],
    scale: (x, y) => [x, 0, 0, y, 0, 0],
    rotate: (r) => { const c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; },
    apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    det: (m) => m[0] * m[3] - m[1] * m[2],
    inv: (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; }
  };

  /* ---------- 4x4 矩阵（列主序） ---------- */
  const M4 = {
    ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    translation(x, y, z) { const m = M4.ident(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scale(x, y, z) { const m = M4.ident(); m[0] = x; m[5] = y === undefined ? x : y; m[10] = z === undefined ? x : z; return m; },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a), m = M4.ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a), m = M4.ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a), m = M4.ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      const m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
      return m;
    },
    lookAt(eye, center, up) {
      let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
      let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = M4.ident();
      m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
      m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
      m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
      m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      return m;
    },
    transpose(m) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = m[r * 4 + c]; return o; },
    inverse(m) {
      const o = new Float32Array(16);
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return M4.ident();
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
    },
    // 分解出平移/旋转/缩放（假设无斜切）
    decompose(m) {
      const pos = [m[12], m[13], m[14]];
      const sx = Math.hypot(m[0], m[1], m[2]);
      const sy = Math.hypot(m[4], m[5], m[6]);
      const sz = Math.hypot(m[8], m[9], m[10]);
      // 旋转：Z-Y-X 欧拉
      let rx = 0, ry = 0, rz = 0;
      const a = m[0] / (sx || 1), b = m[1] / (sx || 1), c = m[2] / (sx || 1);
      const d = m[4] / (sy || 1), e = m[5] / (sy || 1), f = m[6] / (sy || 1);
      const g = m[8] / (sz || 1), h = m[9] / (sz || 1), i = m[10] / (sz || 1);
      ry = Math.asin(clamp(-g, -1, 1));
      if (Math.abs(Math.cos(ry)) > 1e-6) { rx = Math.atan2(h, i); rz = Math.atan2(b, a); }
      else { rx = Math.atan2(-f, e); rz = 0; }
      return { pos, rot: [rx, ry, rz], scale: [sx, sy, sz] };
    }
  };

  /* ---------- 折线 / 几何 ---------- */
  function polylineLength(pts, closed) {
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (closed && pts.length > 1) L += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return L;
  }
  // 按弧长采样，返回 [{p:[x,y], t}]
  function resamplePolyline(pts, n, closed) {
    const segs = [];
    let total = 0;
    const cnt = pts.length;
    const lim = closed ? cnt : cnt - 1;
    for (let i = 0; i < lim; i++) {
      const a = pts[i], b = pts[(i + 1) % cnt];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a, b, l, s: total }); total += l;
    }
    const out = [];
    for (let k = 0; k < n; k++) {
      const target = total * (closed ? k / n : k / (n - 1));
      let s = segs[0], idx = 0;
      for (let j = 0; j < segs.length; j++) { if (segs[j].s <= target) { s = segs[j]; idx = j; } else break; }
      const u = s.l > 1e-9 ? (target - s.s) / s.l : 0;
      out.push([lerp(s.a[0], s.b[0], u), lerp(s.a[1], s.b[1], u)]);
    }
    return out;
  }
  // Douglas-Peucker 简化
  function simplify(pts, eps, closed) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      let maxD = 0, idx = -1;
      const a = pts[i0], b = pts[i1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      for (let i = i0 + 1; i < i1; i++) {
        const p = pts[i];
        let d;
        if (len2 < 1e-12) d = Math.hypot(p[0] - a[0], p[1] - a[1]);
        else {
          const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
          d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
        }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([i0, idx], [idx, i1]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    if (closed && out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < eps) out.pop();
    return out;
  }
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function distPointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + t * dx, qy = ay + t * dy;
    return { d: Math.hypot(px - qx, py - qy), t, x: qx, y: qy };
  }
  function segIntersect(a, b, c, d) {
    const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = d[0] - c[0], d2y = d[1] - c[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den;
    const u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) return { t, u, x: a[0] + t * d1x, y: a[1] + t * d1y };
    return null;
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x1, y1 };
  }
  function bboxUnion(a, b) {
    if (!a) return b; if (!b) return a;
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x1, y1 };
  }

  /* ---------- 三角化：耳切法（支持孔洞） ---------- */
  function ensureWinding(pts, ccw) {
    const a = polygonArea(pts);
    if ((a > 0) !== ccw) pts.reverse();
    return pts;
  }
  function pointInTriangle(p, a, b, c) {
    const d1 = (p[0] - c[0]) * (a[1] - c[1]) - (a[1] - c[1]) * (p[1] - c[1]);
    const d2 = (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    const d3 = (b[0] - c[0]) * (p[1] - c[1]) - (p[0] - c[0]) * (b[1] - c[1]);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }
  function isEar(poly, i, n) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12) return false;
    for (let j = 0; j < n; j++) {
      if (j === (i - 1 + n) % n || j === i || j === (i + 1) % n) continue;
      const p = poly[j];
      if (p[0] < Math.min(a[0], b[0], c[0]) || p[0] > Math.max(a[0], b[0], c[0]) || p[1] < Math.min(a[1], b[1], c[1]) || p[1] > Math.max(a[1], b[1], c[1])) continue;
      if (pointInTriangle(p, a, b, c)) return false;
    }
    return true;
  }
  function onTriEdge(p, a, b, c, eps) {
    eps = eps || 1e-7;
    const d1 = U.distPointSeg(p[0], p[1], a[0], a[1], b[0], b[1]).d;
    const d2 = U.distPointSeg(p[0], p[1], b[0], b[1], c[0], c[1]).d;
    const d3 = U.distPointSeg(p[0], p[1], c[0], c[1], a[0], a[1]).d;
    return Math.min(d1, d2, d3) < eps;
  }
  function earClip(poly) {
    const n = poly.length;
    const tris = [];
    if (n < 3) return tris;
    let idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    let guard = 0;
    while (idx.length > 3 && guard++ < 50000) {
      let found = false;
      for (let k = 0; k < idx.length; k++) {
        const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
        const a = poly[i0], b = poly[i1], c = poly[i2];
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross <= 1e-10) continue;
        let ok = true;
        for (let j = 0; j < idx.length; j++) {
          const jj = idx[j];
          if (jj === i0 || jj === i1 || jj === i2) continue;
          const p = poly[jj];
          if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 1e-7 || Math.hypot(p[0] - b[0], p[1] - b[1]) < 1e-7 || Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-7) continue;
          if (onTriEdge(p, a, b, c, 1e-7)) continue;
          if (pointInTriangle(p, a, b, c)) { ok = false; break; }
        }
        if (ok) { tris.push([i0, i1, i2]); idx.splice(k, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) {
      // 兜底扇形
      for (let k = 1; k < idx.length - 1; k++) tris.push([idx[0], idx[k], idx[k + 1]]);
    }
    return tris;
  }
  // contours: [[pt,...], hole1, hole2...]  返回 {verts:[[x,y]], tris:[[i,j,k]]}
  function triangulate(contours) {
    let polys = contours.filter(c => c && c.length >= 3).map(c => c.slice());
    if (!polys.length) return { verts: [], tris: [] };
    // 移除重复点
    polys = polys.map(p => {
      const out = [];
      for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-7) out.push([q[0], q[1]]); }
      if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-7) out.pop();
      return out;
    }).filter(p => p.length >= 3);
    if (!polys.length) return { verts: [], tris: [] };
    // 面积最大者为外轮廓
    let outerIdx = 0, maxA = -Infinity;
    polys.forEach((p, i) => { const a = Math.abs(polygonArea(p)); if (a > maxA) { maxA = a; outerIdx = i; } });
    let outer = polys[outerIdx];
    const holes = polys.filter((_, i) => i !== outerIdx).filter(p => Math.abs(polygonArea(p)) > 1e-9);
    ensureWinding(outer, true); // 外轮廓逆时针
    holes.forEach(h => ensureWinding(h, false)); // 孔洞顺时针
    // 将孔洞桥接到外轮廓
    let merged = outer.slice();
    const usedHoles = holes.slice();
    let guard = 0;
    while (usedHoles.length && guard++ < 50) {
      let bestH = 0, bestHi = 0, bestOi = 0, bestD = Infinity;
      for (let hi = 0; hi < usedHoles.length; hi++) {
        const h = usedHoles[hi];
        // 孔洞最右点
        let mi = 0; for (let i = 1; i < h.length; i++) if (h[i][0] > h[mi][0]) mi = i;
        const hp = h[mi];
        for (let oi = 0; oi < merged.length; oi++) {
          const op = merged[oi];
          if (op[0] < hp[0]) continue;
          const d = Math.hypot(op[0] - hp[0], op[1] - hp[1]);
          if (d < bestD && visible(merged, h, oi, mi, polys)) { bestD = d; bestH = hi; bestHi = mi; bestOi = oi; }
        }
      }
      if (bestD === Infinity) {
        // 找不到可见点，退化为直接连接最近点
        const h = usedHoles[0]; let mi = 0; for (let i = 1; i < h.length; i++) if (h[i][0] > h[mi][0]) mi = i;
        const hp = h[mi]; let oi = 0, d = Infinity;
        for (let i = 0; i < merged.length; i++) { const dd = Math.hypot(merged[i][0] - hp[0], merged[i][1] - hp[1]); if (dd < d) { d = dd; oi = i; } }
        bestH = 0; bestHi = mi; bestOi = oi;
      }
      const h = usedHoles.splice(bestH, 1)[0];
      const ring = [];
      for (let i = 0; i <= bestHi; i++) ring.push(h[i]);
      for (let i = 0; i < h.length; i++) ring.push(h[i]);
      // 插入：merged[bestOi] 后接 ring 再回到 merged[bestOi]
      merged = merged.slice(0, bestOi + 1).concat(ring, [merged[bestOi]], merged.slice(bestOi + 1));
    }
    const tris = earClip(merged);
    return { verts: merged, tris: tris.map(t => t.slice()) };
  }
  function visible(outer, hole, oi, hi, allPolys) {
    const a = outer[oi], b = hole[hi];
    for (let i = 0; i < outer.length; i++) {
      const c = outer[i], d = outer[(i + 1) % outer.length];
      if (c === a || d === a) continue;
      if (segIntersect(a, b, c, d)) return false;
    }
    for (const p of allPolys) {
      if (p === hole) continue;
      for (let i = 0; i < p.length; i++) {
        const c = p[i], d = p[(i + 1) % p.length];
        if (c === b || d === b) continue;
        if (segIntersect(a, b, c, d)) return false;
      }
    }
    return true;
  }

  /* ---------- 贝塞尔 ---------- */
  function cubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  }
  function cubicTangent(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return [3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])];
  }
  // 自适应细分三次贝塞尔为折线
  function flattenCubic(p0, p1, p2, p3, tol, out) {
    const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
    const d1 = Math.abs((p1[0] - p0[0]) * dy - (p1[1] - p0[1]) * dx);
    const d2 = Math.abs((p2[0] - p0[0]) * dy - (p2[1] - p0[1]) * dx);
    if (Math.max(d1, d2) <= tol || out.length > 4000) { out.push([p3[0], p3[1]]); return; }
    const m01 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const m23 = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
    const m012 = [(m01[0] + m12[0]) / 2, (m01[1] + m12[1]) / 2];
    const m123 = [(m12[0] + m23[0]) / 2, (m12[1] + m23[1]) / 2];
    const m = [(m012[0] + m123[0]) / 2, (m012[1] + m123[1]) / 2];
    flattenCubic(p0, m01, m012, m, tol, out);
    flattenCubic(m, m123, m23, p3, tol, out);
  }

  /* ---------- 杂项 ---------- */
  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9); }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function formatTime(t, fps) {
    const f = Math.round(t * fps);
    const s = Math.floor(f / fps);
    const fr = f % fps;
    return `${s}s${fr}f`;
  }
  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function readFileText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file, 'utf-8');
    });
  }

  global.U = {
    TAU, DEG, clamp, lerp, invLerp, smoothstep, sign, RNG, mulberry32, hash1, hash2, hash3,
    Ease, bezierY, EASE_IN_OUT, EASE_IN, EASE_OUT,
    hex2rgb, rgb2hex, hsl2rgb, rgb2hsl, mixColor, rgbaStr,
    M2, M4, polylineLength, resamplePolyline, simplify, polygonArea, pointInPolygon,
    distPointSeg, segIntersect, bbox, bboxUnion, triangulate, earClip,
    cubicPoint, cubicTangent, flattenCubic, uid, deepClone, formatTime, download, readFileText
  };
})(window);
