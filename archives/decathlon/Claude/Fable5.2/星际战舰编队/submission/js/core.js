// core.js — math, rng, noise, splines
(function () {
  'use strict';
  const SF = window.SF = window.SF || {};

  const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
  const sat = x => x < 0 ? 0 : (x > 1 ? 1 : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const smoother = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
  const pulse = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
  const fract = x => x - Math.floor(x);
  const pmod = (x, m) => ((x % m) + m) % m;

  // ---------- vec3 (plain arrays) ----------
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    mulv: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    addm: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  };

  // ---------- quaternions [x,y,z,w] ----------
  const quat = {
    ident: () => [0, 0, 0, 1],
    axis: (ax, ang) => { const s = Math.sin(ang / 2), n = v3.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; },
    mul: (a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
    // yaw about y, pitch about x, roll about z (applied roll, then pitch, then yaw)
    euler: (yaw, pitch, roll) => quat.mul(quat.mul(quat.axis([0, 1, 0], yaw), quat.axis([1, 0, 0], pitch)), quat.axis([0, 0, 1], roll)),
    rot: (q, v) => {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
    },
    // orientation whose +z is fwd and +y is roughly up
    look: (fwd, up) => {
      const f = v3.norm(fwd); let r = v3.cross(up || [0, 1, 0], f);
      if (v3.len(r) < 1e-5) r = v3.cross([1, 0, 0], f);
      r = v3.norm(r); const u = v3.cross(f, r);
      return quat.fromBasis(r, u, f);
    },
    fromBasis: (r, u, f) => {
      const m00 = r[0], m01 = u[0], m02 = f[0], m10 = r[1], m11 = u[1], m12 = f[1], m20 = r[2], m21 = u[2], m22 = f[2];
      const tr = m00 + m11 + m22; let x, y, z, w;
      if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
      else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
      else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
      else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
      return [x, y, z, w];
    },
    slerp: (a, b, t) => {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b;
      if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
      if (d > 0.9995) { const r = [mix(a[0], bb[0], t), mix(a[1], bb[1], t), mix(a[2], bb[2], t), mix(a[3], bb[3], t)]; const l = Math.hypot(r[0], r[1], r[2], r[3]); return [r[0] / l, r[1] / l, r[2] / l, r[3] / l]; }
      const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
    },
  };

  // ---------- mat4 (column-major Float32Array) ----------
  const m4 = {
    ident: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul: (a, b, o) => {
      o = o || new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      return o;
    },
    persp: (fovy, asp, n, f) => {
      const m = new Float32Array(16), t = 1 / Math.tan(fovy / 2);
      m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
    },
    lookAt: (e, t, up) => {
      const f = v3.norm(v3.sub(t, e)); let r = v3.cross(f, up); if (v3.len(r) < 1e-5) r = [1, 0, 0]; r = v3.norm(r); const u = v3.cross(r, f);
      const m = new Float32Array(16);
      m[0] = r[0]; m[4] = r[1]; m[8] = r[2]; m[12] = -v3.dot(r, e);
      m[1] = u[0]; m[5] = u[1]; m[9] = u[2]; m[13] = -v3.dot(u, e);
      m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2]; m[14] = v3.dot(f, e);
      m[15] = 1; return m;
    },
    trs: (p, q, s) => {
      const m = new Float32Array(16); s = s === undefined ? 1 : s;
      const sx = typeof s === 'number' ? s : s[0], sy = typeof s === 'number' ? s : s[1], sz = typeof s === 'number' ? s : s[2];
      const x = q[0], y = q[1], z = q[2], w = q[3];
      m[0] = (1 - 2 * (y * y + z * z)) * sx; m[1] = 2 * (x * y + z * w) * sx; m[2] = 2 * (x * z - y * w) * sx;
      m[4] = 2 * (x * y - z * w) * sy; m[5] = (1 - 2 * (x * x + z * z)) * sy; m[6] = 2 * (y * z + x * w) * sy;
      m[8] = 2 * (x * z + y * w) * sz; m[9] = 2 * (y * z - x * w) * sz; m[10] = (1 - 2 * (x * x + y * y)) * sz;
      m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m;
    },
    trans: p => { const m = m4.ident(); m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; return m; },
    basis: (p, r, u, f) => { const m = new Float32Array(16); m[0] = r[0]; m[1] = r[1]; m[2] = r[2]; m[4] = u[0]; m[5] = u[1]; m[6] = u[2]; m[8] = f[0]; m[9] = f[1]; m[10] = f[2]; m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m; },
    pt: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
    dir: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]],
    // inverse of a rigid (rotation + translation, uniform scale 1) matrix
    invRigid: m => {
      const o = new Float32Array(16);
      o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
      o[12] = -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]);
      o[13] = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
      o[14] = -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]);
      o[15] = 1; return o;
    },
    inv: m => {
      const o = new Float32Array(16);
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
  };

  // ---------- rng / hash / noise ----------
  function rng(seed) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.r = (a, b) => a + (b - a) * f();
    f.i = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.s = () => f() * 2 - 1;
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    return f;
  }
  function hash3(x, y, z, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul((s | 0) + 1, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const a = hash3(xi, yi, zi, s), b = hash3(xi + 1, yi, zi, s), c = hash3(xi, yi + 1, zi, s), d = hash3(xi + 1, yi + 1, zi, s);
    const e = hash3(xi, yi, zi + 1, s), f = hash3(xi + 1, yi, zi + 1, s), g = hash3(xi, yi + 1, zi + 1, s), h = hash3(xi + 1, yi + 1, zi + 1, s);
    return mix(mix(mix(a, b, fx), mix(c, d, fx), fy), mix(mix(e, f, fx), mix(g, h, fx), fy), fz);
  }
  function fbm(x, y, z, s, oct) {
    let v = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { v += a * vnoise(x, y, z, s + i * 17); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; }
    return v / n;
  }

  // ---------- keyframe track (Catmull-Rom on non-uniform knots) ----------
  // keys: [[t, value], ...] value = number or array. opts.loop = period (keys must cover [0,period)) ; opts.lin = linear
  class Track {
    constructor(keys, opts) {
      opts = opts || {};
      this.loop = opts.loop || 0; this.lin = !!opts.lin;
      this.t = keys.map(k => k[0]);
      this.v = keys.map(k => (typeof k[1] === 'number' ? [k[1]] : k[1].slice()));
      this.scalar = typeof keys[0][1] === 'number';
      this.flat = keys.map(k => !!k[2]); // third element truthy => zero tangent (hold / ease)
      const n = this.t.length, d = this.v[0].length;
      this.m = [];
      for (let i = 0; i < n; i++) {
        const m = new Array(d).fill(0);
        if (!this.flat[i] && n > 1) {
          let ip = i - 1, inx = i + 1, tp, tn;
          if (this.loop) {
            if (ip < 0) { ip = n - 1; tp = this.t[ip] - this.loop; } else tp = this.t[ip];
            if (inx >= n) { inx = 0; tn = this.t[0] + this.loop; } else tn = this.t[inx];
          } else {
            if (ip < 0) ip = i; if (inx >= n) inx = i;
            tp = this.t[ip]; tn = this.t[inx];
          }
          const dt = tn - tp;
          if (dt > 1e-9) for (let k = 0; k < d; k++) m[k] = (this.v[inx][k] - this.v[ip][k]) / dt;
        }
        this.m.push(m);
      }
    }
    at(t) {
      const n = this.t.length; let i0, i1, t0, t1;
      if (this.loop) {
        t = pmod(t, this.loop);
        if (t < this.t[0]) { i0 = n - 1; i1 = 0; t0 = this.t[n - 1] - this.loop; t1 = this.t[0]; }
        else {
          i0 = n - 1; for (let i = 0; i < n - 1; i++) if (t < this.t[i + 1]) { i0 = i; break; }
          if (i0 === n - 1) { i1 = 0; t0 = this.t[n - 1]; t1 = this.t[0] + this.loop; } else { i1 = i0 + 1; t0 = this.t[i0]; t1 = this.t[i1]; }
        }
      } else {
        if (t <= this.t[0]) return this._out(this.v[0]);
        if (t >= this.t[n - 1]) return this._out(this.v[n - 1]);
        i0 = 0; for (let i = 0; i < n - 1; i++) if (t < this.t[i + 1]) { i0 = i; break; }
        i1 = i0 + 1; t0 = this.t[i0]; t1 = this.t[i1];
      }
      const h = t1 - t0, s = h > 1e-9 ? (t - t0) / h : 0;
      const a = this.v[i0], b = this.v[i1], d = a.length, o = new Array(d);
      if (this.lin) { for (let k = 0; k < d; k++) o[k] = a[k] + (b[k] - a[k]) * s; return this._out(o); }
      const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      const ma = this.m[i0], mb = this.m[i1];
      for (let k = 0; k < d; k++) o[k] = h00 * a[k] + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k];
      return this._out(o);
    }
    _out(o) { return this.scalar ? o[0] : o.slice(); }
  }

  SF.SUN = v3.norm([-0.74, 0.42, 0.52]);
  Object.assign(SF, { clamp, sat, mix, sstep, smoother, pulse, fract, pmod, v3, quat, m4, rng, hash3, vnoise, fbm, Track });
})();
