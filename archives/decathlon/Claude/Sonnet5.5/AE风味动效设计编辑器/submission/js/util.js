/* util.js — 基础数学、矩阵、颜色、随机、噪声、贝塞尔 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U = {};
  const DEG = Math.PI / 180;
  U.DEG = DEG;
  U.clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sat = x => x < 0 ? 0 : (x > 1 ? 1 : x);
  U.smoothstep = (a, b, x) => { const t = U.sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  U.isArr = Array.isArray;
  U.round = (x, n = 3) => { const k = Math.pow(10, n); return Math.round(x * k) / k; };
  let _uid = 0;
  U.uid = (p = 'id') => p + (++_uid).toString(36) + Math.floor(Math.random() * 46656).toString(36);
  U.clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  U.hashStr = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  U.hash2 = (a, b) => { let h = (a ^ Math.imul(b, 0x9E3779B1)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
  U.rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  U.fmt = (v, n = 2) => { if (typeof v !== 'number') return String(v); const r = U.round(v, n); return Object.is(r, -0) ? '0' : String(r); };

  // ---- 向量（数组） ----
  const V = U.V = {};
  V.add = (a, b) => a.map((x, i) => x + (b[i] || 0));
  V.sub = (a, b) => a.map((x, i) => x - (b[i] || 0));
  V.mul = (a, k) => a.map(x => x * k);
  V.dot = (a, b) => a.reduce((s, x, i) => s + x * (b[i] || 0), 0);
  V.len = a => Math.hypot(...a);
  V.norm = a => { const l = V.len(a) || 1; return a.map(x => x / l); };
  V.cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  V.lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  V.eq = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

  // ---- 4x4 矩阵（列主序，数组长度16）----
  const M = U.M = {};
  M.id = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  M.mul = (a, b, o) => {
    o = o || new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  };
  M.translate = (x, y, z = 0) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  M.scale = (x, y, z = 1) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  M.rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  M.rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  M.rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  M.invert = m => {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M.id();
    det = 1 / det;
    return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det];
  };
  M.pt = (m, p) => { const x = p[0], y = p[1], z = p[2] || 0; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; const iw = w && w !== 1 ? 1 / w : 1; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) * iw, (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw, (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw]; };
  M.dir = (m, p) => { const x = p[0], y = p[1], z = p[2] || 0; return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; };
  // 旋转矩阵 Rz*Ry*Rx（角度制）
  M.rotXYZ = (rx, ry, rz) => M.mul(M.rotZ(rz * DEG), M.mul(M.rotY(ry * DEG), M.rotX(rx * DEG)));
  M.trs = (pos, rot, scl) => M.mul(M.translate(pos[0], pos[1], pos[2] || 0), M.mul(M.rotXYZ(rot[0], rot[1], rot[2]), M.scale(scl[0], scl[1], scl[2])));
  // 2D 仿射 -> 6 元数组 [a,b,c,d,e,f]  (x' = a x + c y + e)
  M.to2d = m => [m[0], m[1], m[4], m[5], m[12], m[13]];
  M.from2d = a => [a[0], a[1], 0, 0, a[2], a[3], 0, 0, 0, 0, 1, 0, a[4], a[5], 0, 1];
  // 分解 2D 仿射: 返回 {x,y,rot(deg),sx,sy}
  M.decompose2d = m => {
    const a = m[0], b = m[1], c = m[4], d = m[5];
    const sx = Math.hypot(a, b); const rot = Math.atan2(b, a);
    let sy = Math.hypot(c, d); const det = a * d - b * c; if (det < 0) sy = -sy;
    return { x: m[12], y: m[13], rot: rot / DEG, sx, sy };
  };
  M.decompose3d = m => {
    const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
    const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx, r21 = m[6] / sy, r22 = m[10] / sz;
    // R = Rz*Ry*Rx
    const ry = Math.asin(-U.clamp(r20, -1, 1));
    let rx, rz;
    if (Math.abs(r20) < 0.99999) { rx = Math.atan2(r21, r22); rz = Math.atan2(r10, r00); }
    else { rx = Math.atan2(-m[9] / sz, m[5] / sy); rz = 0; }
    return { pos: [m[12], m[13], m[14]], rot: [rx / DEG, ry / DEG, rz / DEG], scale: [sx, sy, sz] };
  };

  // ---- 颜色 ----
  const C = U.C = {};
  C.hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; };
  C.toHex = c => '#' + [0, 1, 2].map(i => Math.round(U.sat(c[i]) * 255).toString(16).padStart(2, '0')).join('');
  C.css = (c, a) => `rgba(${Math.round(U.sat(c[0]) * 255)},${Math.round(U.sat(c[1]) * 255)},${Math.round(U.sat(c[2]) * 255)},${a === undefined ? (c[3] === undefined ? 1 : c[3]) : a})`;
  C.mix = (a, b, t) => [0, 1, 2, 3].map(i => (a[i] === undefined ? 1 : a[i]) * (1 - t) + (b[i] === undefined ? 1 : b[i]) * t);
  C.srgb2lin = x => Math.pow(x, 2.2);
  C.hsl2rgb = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
  C.rgb2hsl = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; const d = mx - mn; if (d > 1e-9) { s = d / (1 - Math.abs(2 * l - 1)); if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; } return [h, s, l]; };

  // ---- 贝塞尔 ----
  U.cubic = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
  U.cubicD = (p0, p1, p2, p3, t) => { const u = 1 - t; return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2); };
  // 求解时间贝塞尔 x(u)=x → 返回 y(u) ; P0=(0,0) P1=(x1,y1) P2=(x2,y2) P3=(1,1)
  U.bezierEase = (x1, y1, x2, y2, x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const xv = U.cubic(0, x1, x2, 1, u) - x; if (Math.abs(xv) < 1e-6) break;
      const d = U.cubicD(0, x1, x2, 1, u); if (Math.abs(d) < 1e-6) break; u -= xv / d;
    }
    if (u < 0 || u > 1 || !isFinite(u)) { let lo = 0, hi = 1; u = x; for (let i = 0; i < 30; i++) { const xv = U.cubic(0, x1, x2, 1, u); if (xv < x) lo = u; else hi = u; u = (lo + hi) / 2; } }
    return U.cubic(0, y1, y2, 1, u);
  };

  // ---- 噪声 ----
  const hash3 = (x, y, z, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0; return h / 4294967296; };
  U.noise1 = (x, seed = 0) => { const i = Math.floor(x), f = x - i; const u = f * f * f * (f * (f * 6 - 15) + 10); const a = hash3(i, 0, 0, seed) * 2 - 1, b = hash3(i + 1, 0, 0, seed) * 2 - 1; return a + (b - a) * u; };
  U.noise3 = (x, y, z, seed = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash3(ix + a, iy + b, iz + c, seed) * 2 - 1;
    const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * ux, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * ux;
    const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * ux, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * ux;
    const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
    return y0 + (y1 - y0) * uz;
  };
  U.fbm1 = (x, seed, oct = 1, mult = 0.5) => { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += U.noise1(x * f, seed + i * 17) * a; n += a; a *= mult; f *= 2; } return s / n; };

  // ---- 事件 ----
  U.Emitter = class { constructor() { this._h = {}; } on(e, f) { (this._h[e] = this._h[e] || []).push(f); return () => this.off(e, f); } off(e, f) { this._h[e] = (this._h[e] || []).filter(x => x !== f); } emit(e, ...a) { for (const f of (this._h[e] || []).slice()) f(...a); } };

  // 包围盒
  U.bbox = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
})();
