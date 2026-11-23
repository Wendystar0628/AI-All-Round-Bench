/* 星际战舰编队 — core math, rng, easing, timeline helpers
 * Global namespace: FLEET
 */
(function (global) {
  'use strict';

  const Core = {};

  /* ---------------- scalar ---------------- */
  Core.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  Core.lerp = (a, b, t) => a + (b - a) * t;
  Core.smoothstep = (e0, e1, x) => {
    const t = Core.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  Core.smootherstep = (e0, e1, x) => {
    const t = Core.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  Core.wrap = (v, m) => ((v % m) + m) % m;
  Core.deg = (d) => (d * Math.PI) / 180;

  Core.Ease = {
    linear: (t) => t,
    in2: (t) => t * t,
    out2: (t) => 1 - (1 - t) * (1 - t),
    in3: (t) => t * t * t,
    out3: (t) => 1 - Math.pow(1 - t, 3),
    out5: (t) => 1 - Math.pow(1 - t, 5),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => {
      if (t === 0 || t === 1) return t;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
  };

  /* ---------------- rng ---------------- */
  Core.makeRNG = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // integer hash -> [0,1)
  Core.hash = function (n) {
    n = (n | 0) ^ 0x9e3779b9;
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  };
  Core.hash2 = function (x, y) {
    return Core.hash((x | 0) * 73856093 ^ (y | 0) * 19349663);
  };
  Core.hash3 = function (x, y, z) {
    return Core.hash((x | 0) * 73856093 ^ (y | 0) * 19349663 ^ (z | 0) * 83492791);
  };

  // value noise 3d (smooth)
  Core.noise3 = function (x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let r = 0;
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const wx = i ? u : 1 - u, wy = j ? v : 1 - v, wz = k ? w : 1 - w;
          r += wx * wy * wz * Core.hash3(xi + i, yi + j, zi + k);
        }
      }
    }
    return r * 2 - 1;
  };
  Core.fbm3 = function (x, y, z, oct) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < (oct || 3); i++) {
      s += a * Core.noise3(x * f, y * f, z * f);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  };

  /* ---------------- vec3 (plain arrays) ---------------- */
  const V3 = {};
  V3.create = (x, y, z) => [x || 0, y || 0, z || 0];
  V3.set = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
  V3.copy = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
  V3.add = (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; };
  V3.sub = (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  V3.scale = (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; };
  V3.addScaled = (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; };
  V3.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  V3.cross = (o, a, b) => {
    const x = a[1] * b[2] - a[2] * b[1];
    const y = a[2] * b[0] - a[0] * b[2];
    const z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  };
  V3.len = (a) => Math.hypot(a[0], a[1], a[2]);
  V3.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  V3.norm = (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
  };
  V3.lerp = (o, a, b, t) => {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  };
  V3.copyInto = V3.copy;
  Core.V3 = V3;

  /* ---------------- mat4 (column-major, WebGL order) ---------------- */
  const M4 = {};
  M4.create = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  M4.identity = (m) => { m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return m; };
  M4.copy = (o, a) => { o.set(a); return o; };

  M4.multiply = (o, a, b) => {
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
  };

  M4.translation = (o, x, y, z) => {
    M4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
  };
  M4.scaling = (o, x, y, z) => {
    o.set([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); return o;
  };
  M4.rotationX = (o, r) => {
    const c = Math.cos(r), s = Math.sin(r);
    o.set([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); return o;
  };
  M4.rotationY = (o, r) => {
    const c = Math.cos(r), s = Math.sin(r);
    o.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); return o;
  };
  M4.rotationZ = (o, r) => {
    const c = Math.cos(r), s = Math.sin(r);
    o.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return o;
  };

  // compose translation * rotY * rotX * rotZ * scale
  M4.compose = (o, pos, ry, rx, rz, scale) => {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz;
    const m01 = -cy * sz + sy * sx * cz;
    const m02 = sy * cx;
    const m10 = cx * sz;
    const m11 = cx * cz;
    const m12 = -sx;
    const m20 = -sy * cz + cy * sx * sz;
    const m21 = sy * sz + cy * sx * cz;
    const m22 = cy * cx;
    const s = scale === undefined ? 1 : scale;
    o[0] = m00 * s; o[1] = m10 * s; o[2] = m20 * s; o[3] = 0;
    o[4] = m01 * s; o[5] = m11 * s; o[6] = m21 * s; o[7] = 0;
    o[8] = m02 * s; o[9] = m12 * s; o[10] = m22 * s; o[11] = 0;
    o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
    return o;
  };

  M4.perspective = (o, fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[11] = -1;
    o[12] = 0; o[13] = 0; o[15] = 0;
    const nf = 1 / (near - far);
    o[10] = (far + near) * nf;
    o[14] = 2 * far * near * nf;
    return o;
  };

  const _z = [0, 0, 0], _x = [0, 0, 0], _y = [0, 0, 0], _t = [0, 0, 0];
  M4.lookAt = (o, eye, center, up) => {
    V3.norm(_z, V3.sub(_t, eye, center));
    V3.norm(_x, V3.cross(_t, up, _z));
    V3.cross(_y, _z, _x);
    o[0] = _x[0]; o[1] = _y[0]; o[2] = _z[0]; o[3] = 0;
    o[4] = _x[1]; o[5] = _y[1]; o[6] = _z[1]; o[7] = 0;
    o[8] = _x[2]; o[9] = _y[2]; o[10] = _z[2]; o[11] = 0;
    o[12] = -V3.dot(_x, eye); o[13] = -V3.dot(_y, eye); o[14] = -V3.dot(_z, eye); o[15] = 1;
    return o;
  };

  M4.transformPoint = (o, m, p) => {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  };
  Core.M4 = M4;

  /* ---------------- catmull-rom ---------------- */
  Core.catmull = function (p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  Core.catmullVec = function (out, p0, p1, p2, p3, t) {
    out[0] = Core.catmull(p0[0], p1[0], p2[0], p3[0], t);
    out[1] = Core.catmull(p0[1], p1[1], p2[1], p3[1], t);
    out[2] = Core.catmull(p0[2], p1[2], p2[2], p3[2], t);
    return out;
  };

  /* ---------------- tiny event/timeline helpers ---------------- */
  Core.Timeline = function (dur) {
    this.duration = dur;
    this.items = [];
  };
  Core.Timeline.prototype.at = function (t, fn) { this.items.push({ t: t, fn: fn }); return this; };
  Core.Timeline.prototype.range = function (t0, t1, fn) {
    this.items.push({ t0: t0, t1: t1, fn: fn, ranged: true }); return this;
  };
  Core.Timeline.prototype.eval = function (time) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.ranged) {
        if (time >= it.t0 && time <= it.t1) it.fn(time, it.t0, it.t1);
      } else if (Math.abs(time - it.t) < 1e-6) {
        it.fn(time);
      }
    }
  };

  global.FLEET = global.FLEET || {};
  global.FLEET.Core = Core;
})(window);
