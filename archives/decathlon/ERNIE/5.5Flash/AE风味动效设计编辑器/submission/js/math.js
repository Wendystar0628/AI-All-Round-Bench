/* AE Forge Editor - math utilities */
(function (global) {
  'use strict';

  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    copy(out, a) { out.set(a); return out; },
    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return out;
    },
    fromTranslation(out, x, y, z) { M4.identity(out); out[12] = x; out[13] = y; out[14] = z; return out; },
    fromScale(out, x, y, z) { M4.identity(out); out[0] = x; out[5] = y; out[10] = z; return out; },
    fromRotationX(out, r) {
      const c = Math.cos(r), s = Math.sin(r); M4.identity(out);
      out[5] = c; out[6] = s; out[9] = -s; out[10] = c; return out;
    },
    fromRotationY(out, r) {
      const c = Math.cos(r), s = Math.sin(r); M4.identity(out);
      out[0] = c; out[2] = -s; out[8] = s; out[10] = c; return out;
    },
    fromRotationZ(out, r) {
      const c = Math.cos(r), s = Math.sin(r); M4.identity(out);
      out[0] = c; out[1] = s; out[4] = -c + c; out[4] = -s; out[5] = c; return out;
    },
    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },
    ortho(out, l, r, b, t, n, f) {
      out.fill(0);
      out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n); out[15] = 1;
      out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n);
      return out;
    },
    lookAt(out, eye, center, up) {
      let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      let len = Math.hypot(z0, z1, z2) || 1; z0 /= len; z1 /= len; z2 /= len;
      let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
      len = Math.hypot(x0, x1, x2);
      if (!len) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }
      const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
      out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
      out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
      out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
      out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      out[15] = 1;
      return out;
    },
    invert(out, a) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1 / det;
      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
    },
    transpose(out, a) {
      if (out === a) {
        const a01 = a[1], a02 = a[2], a03 = a[3], a12 = a[6], a13 = a[7], a23 = a[11];
        out[1] = a[4]; out[2] = a[8]; out[3] = a[12]; out[6] = a[9]; out[7] = a[13]; out[11] = a[14];
        out[4] = a01; out[8] = a02; out[12] = a03; out[9] = a12; out[13] = a13; out[14] = a23;
      } else {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i * 4 + j] = a[j * 4 + i];
      }
      return out;
    },
    transformPoint(m, p) {
      const x = p[0], y = p[1], z = p[2], w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const iw = w ? 1 / w : 1;
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) * iw,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw,
      ];
    },
    transformDir(m, p) {
      return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
      ];
    },
    compose(pos, rotDeg, scl) {
      const out = M4.create();
      const rx = (rotDeg[0] || 0) * Math.PI / 180, ry = (rotDeg[1] || 0) * Math.PI / 180, rz = (rotDeg[2] || 0) * Math.PI / 180;
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
      const m00 = cz * cy, m01 = cz * sy * sx - sz * cx, m02 = cz * sy * cx + sz * sx;
      const m10 = sz * cy, m11 = sz * sy * sx + cz * cx, m12 = sz * sy * cx - cz * sx;
      const m20 = -sy, m21 = cy * sx, m22 = cy * cx;
      out[0] = m00 * scl[0]; out[1] = m10 * scl[0]; out[2] = m20 * scl[0];
      out[4] = m01 * scl[1]; out[5] = m11 * scl[1]; out[6] = m21 * scl[1];
      out[8] = m02 * scl[2]; out[9] = m12 * scl[2]; out[10] = m22 * scl[2];
      out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
      return out;
    },
  };

  const V3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hash1(n) {
    n = (n << 13) ^ n;
    return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0;
  }

  function smoothNoise(x, seed) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash1(i * 157 + (seed || 0) * 131);
    const b = hash1((i + 1) * 157 + (seed || 0) * 131);
    return a + (b - a) * u;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function hexToRgb(hex) {
    if (Array.isArray(hex)) return hex;
    if (typeof hex !== 'string') return [1, 1, 1];
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function rgbToHex(c) {
    const f = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
    return '#' + f(c[0]) + f(c[1]) + f(c[2]);
  }

  // cubic bezier timing function solver (CSS-like), control points in [0,1]
  function cubicBezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const xe = sampleX(t) - x;
        if (Math.abs(xe) < 1e-5) break;
        const d = dX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= xe / d;
      }
      return sampleY(clamp(t, 0, 1));
    };
  }

  global.AEMath = { M4, V3, mulberry32, hash1, smoothNoise, clamp, lerp, hexToRgb, rgbToHex, cubicBezier };
})(window);