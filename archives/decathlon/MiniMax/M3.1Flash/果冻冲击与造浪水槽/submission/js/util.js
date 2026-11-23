/* util.js — minimal math library (column-major mat4, quaternions, vectors). */
(function (global) {
  'use strict';

  const V3 = {
    create(x = 0, y = 0, z = 0) { return new Float32Array([x, y, z]); },
    set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
    copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
    add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
    addScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    len(a) { return Math.hypot(a[0], a[1], a[2]); },
    cross(o, a, b) {
      const x = a[1] * b[2] - a[2] * b[1];
      const y = a[2] * b[0] - a[0] * b[2];
      const z = a[0] * b[1] - a[1] * b[0];
      o[0] = x; o[1] = y; o[2] = z; return o;
    },
    normalize(o, a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
    },
    lerp(o, a, b, t) {
      o[0] = a[0] + (b[0] - a[0]) * t;
      o[1] = a[1] + (b[1] - a[1]) * t;
      o[2] = a[2] + (b[2] - a[2]) * t;
      return o;
    }
  };

  const M4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity(o) {
      o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o;
    },
    copy(o, a) { o.set(a); return o; },
    multiply(o, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return o;
    },
    perspective(o, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      o.fill(0);
      o[0] = f / aspect; o[5] = f; o[11] = -1;
      o[10] = far / (near - far);
      o[14] = (far * near) / (near - far);
      return o;
    },
    ortho(o, l, r, b, t, n, f) {
      o.fill(0);
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = 1 / (n - f);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = n / (n - f); o[15] = 1;
      return o;
    },
    lookAt(o, eye, center, up) {
      const z = V3.normalize(V3.create(), V3.sub(V3.create(), eye, center));
      const x = V3.normalize(V3.create(), V3.cross(V3.create(), up, z));
      const y = V3.cross(V3.create(), z, x);
      o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[3] = 0;
      o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[7] = 0;
      o[8] = x[2]; o[9] = y[2]; o[10] = z[2]; o[11] = 0;
      o[12] = -V3.dot(x, eye); o[13] = -V3.dot(y, eye); o[14] = -V3.dot(z, eye); o[15] = 1;
      return o;
    },
    fromTranslation(o, x, y, z) {
      M4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
    },
    fromScale(o, x, y, z) {
      M4.identity(o); o[0] = x; o[5] = y; o[10] = z; return o;
    },
    fromRotationY(o, a) {
      M4.identity(o); const c = Math.cos(a), s = Math.sin(a);
      o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o;
    },
    fromRotationX(o, a) {
      M4.identity(o); const c = Math.cos(a), s = Math.sin(a);
      o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o;
    },
    fromRotationZ(o, a) {
      M4.identity(o); const c = Math.cos(a), s = Math.sin(a);
      o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o;
    },
    translate(o, m, x, y, z) {
      M4.identity(o); o[12] = x; o[13] = y; o[14] = z;
      return M4.multiply(o, m, o);
    },
    invert(o, m) {
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return M4.identity(o);
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
    // transform a point (w=1)
    transformPoint(out, m, p) {
      const x = p[0], y = p[1], z = p[2];
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    },
    transformDir(out, m, p) {
      const x = p[0], y = p[1], z = p[2];
      out[0] = m[0] * x + m[4] * y + m[8] * z;
      out[1] = m[1] * x + m[5] * y + m[9] * z;
      out[2] = m[2] * x + m[6] * y + m[10] * z;
      return out;
    }
  };

  const QT = {
    create() { return new Float32Array([0, 0, 0, 1]); },
    identity(o) { o[0] = o[1] = o[2] = 0; o[3] = 1; return o; },
    multiply(o, a, b) {
      const ax = a[0], ay = a[1], az = a[2], aw = a[3];
      const bx = b[0], by = b[1], bz = b[2], bw = b[3];
      o[0] = ax * bw + aw * bx + ay * bz - az * by;
      o[1] = ay * bw + aw * by + az * bx - ax * bz;
      o[2] = az * bw + aw * bz + ax * by - ay * bx;
      o[3] = aw * bw - ax * bx - ay * by - az * bz;
      return o;
    },
    normalize(o, a) {
      const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
      o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
    },
    fromAxisAngle(o, ax, ay, az, ang) {
      const h = ang * 0.5, s = Math.sin(h);
      const l = Math.hypot(ax, ay, az) || 1;
      o[0] = ax / l * s; o[1] = ay / l * s; o[2] = az / l * s; o[3] = Math.cos(h);
      return o;
    },
    toMat3(out, q) {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy;
      out[3] = xy - wz; out[4] = 1 - (xx + zz); out[5] = yz + wx;
      out[6] = xz + wy; out[7] = yz - wx; out[8] = 1 - (xx + yy);
      return out;
    }
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  // deterministic pseudo random
  function hash1(n) {
    const s = Math.sin(n * 127.1) * 43758.5453123;
    return s - Math.floor(s);
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  global.U = { V3, M4, QT, clamp, lerp, smoothstep, easeInOut, hash1, mulberry32 };
})(window);
