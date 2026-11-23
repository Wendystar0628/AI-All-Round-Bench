// core.js — math, rng, palette, helpers
(function () {
  'use strict';
  const C = {};

  C.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  C.lerp = (a, b, t) => a + (b - a) * t;
  C.smooth = (t) => { t = C.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  C.smoother = (t) => { t = C.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  C.easeInOut = C.smoother;
  C.easeOut = (t) => 1 - (1 - C.clamp(t, 0, 1)) * (1 - C.clamp(t, 0, 1));
  C.easeIn = (t) => { t = C.clamp(t, 0, 1); return t * t; };
  C.fract = (x) => x - Math.floor(x);
  C.TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  C.rng = mulberry32;
  C.rnd = (r, a, b) => a + (b - a) * r();
  C.rndi = (r, a, b) => Math.floor(a + (b - a + 1) * r());
  C.pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  // vec3 (plain arrays)
  C.v3 = (x, y, z) => [x || 0, y || 0, z || 0];
  C.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  C.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  C.scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  C.len = (a) => Math.hypot(a[0], a[1], a[2]);
  C.norm = (a) => { const l = C.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  C.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  C.cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  C.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  C.mixv = (a, b, t) => [C.lerp(a[0], b[0], t), C.lerp(a[1], b[1], t), C.lerp(a[2], b[2], t)];

  // mat4 column-major
  C.m4 = {
    ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul: (a, b, out) => {
      const o = out || new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    translate: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
    scale: (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]),
    rotY: (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rotX: (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    rotZ: (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    compose: (pos, rot, scl) => {
      // rot: [rx,ry,rz]
      const cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
      const cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
      const cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
      const m00 = cz * cy + sz * sx * sy, m01 = sz * cx, m02 = -cz * sy + sz * sx * cy;
      const m10 = -sz * cy + cz * sx * sy, m11 = cz * cx, m12 = sz * sy + cz * sx * cy;
      const m20 = cx * sy, m21 = -sx, m22 = cx * cy;
      return new Float32Array([
        m00 * scl[0], m01 * scl[0], m02 * scl[0], 0,
        m10 * scl[1], m11 * scl[1], m12 * scl[1], 0,
        m20 * scl[2], m21 * scl[2], m22 * scl[2], 0,
        pos[0], pos[1], pos[2], 1]);
    },
    perspective: (fovy, aspect, near, far) => {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      const o = new Float32Array(16);
      o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
      return o;
    },
    lookAt: (eye, center, up) => {
      const z = C.norm(C.sub(eye, center));
      let x = C.cross(up, z);
      if (C.len(x) < 1e-5) x = C.cross([0, 0, 1], z);
      x = C.norm(x);
      const y = C.cross(z, x);
      return new Float32Array([
        x[0], y[0], z[0], 0,
        x[1], y[1], z[1], 0,
        x[2], y[2], z[2], 0,
        -C.dot(x, eye), -C.dot(y, eye), -C.dot(z, eye), 1]);
    },
    transformPoint: (m, p) => [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
    transformDir: (m, p) => [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]
  };

  // catmull-rom through points
  C.catmull = (p0, p1, p2, p3, t, out) => {
    const o = out || [0, 0, 0];
    const t2 = t * t, t3 = t2 * t;
    for (let i = 0; i < 3; i++) {
      o[i] = 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
    }
    return o;
  };

  // palette — fleet design language colors
  C.PAL = {
    hullA: [70, 88, 107],      // main steel blue-grey
    hullA2: [58, 74, 92],
    hullB: [38, 48, 62],       // dark inset plates
    hullC: [24, 31, 41],       // deep slots
    hullD: [96, 116, 138],     // light trim
    hullE: [140, 160, 180],    // edge highlight
    under: [30, 38, 50],
    glow: [86, 242, 216],      // cyan energy
    glowDim: [40, 130, 126],
    engine: [255, 150, 60],
    engineHot: [255, 214, 140],
    shield: [110, 214, 255],
    warm: [255, 176, 90],
    red: [255, 96, 72],
    green: [166, 255, 96],
    yellow: [255, 214, 96],
    violet: [150, 128, 255],
    rock: [96, 88, 82],
    rock2: [70, 64, 60],
    rockDark: [44, 40, 38],
    rockLit: [128, 116, 104],
    white: [235, 245, 255]
  };
  C.rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';

  window.C = C;
})();
