// js/math.js - Fast 3D Math, Deterministic PRNG, Splines & Easing
window.App = window.App || {};

(function (App) {
  const M = {};

  M.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.smoothstep = (e0, e1, x) => {
    const t = M.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  M.smootherstep = (e0, e1, x) => {
    const t = M.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  M.easeOutCubic = (t) => 1 - Math.pow(1 - M.clamp(t, 0, 1), 3);
  M.easeInOutCubic = (t) => {
    t = M.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  M.easeOutExpo = (t) => {
    t = M.clamp(t, 0, 1);
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  };

  // Deterministic PRNG (Mulberry32)
  M.mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Deterministic integer hash -> [0, 1)
  M.hash3 = (x, y, z) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Smooth 3D value noise for procedural asteroid sculpture
  M.noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);
    const c000 = M.hash3(xi, yi, zi);
    const c100 = M.hash3(xi + 1, yi, zi);
    const c010 = M.hash3(xi, yi + 1, zi);
    const c110 = M.hash3(xi + 1, yi + 1, zi);
    const c001 = M.hash3(xi, yi, zi + 1);
    const c101 = M.hash3(xi + 1, yi, zi + 1);
    const c011 = M.hash3(xi, yi + 1, zi + 1);
    const c111 = M.hash3(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };

  M.fbm3 = (x, y, z, octaves = 3) => {
    let val = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < octaves; i++) {
      val += amp * M.noise3(x * freq, y * freq, z * freq);
      freq *= 2.03;
      amp *= 0.5;
    }
    return val;
  };

  // Vector3 operations (plain arrays [x, y, z])
  M.v3 = (x = 0, y = 0, z = 0) => [x, y, z];
  M.v3Add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  M.v3Sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  M.v3Scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  M.v3Lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  M.v3Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  M.v3Cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  M.v3Len = (a) => Math.hypot(a[0], a[1], a[2]);
  M.v3Dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  M.v3Norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  // 4x4 Column-major matrices (Float32Array)
  M.m4Create = () => {
    const out = new Float32Array(16);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  };

  M.m4Identity = (out) => {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  };

  M.m4Mul = (out, a, b) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4]     = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      out[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      out[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      out[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
  };

  M.m4Perspective = (out, fovyRad, aspect, near, far) => {
    const f = 1.0 / Math.tan(fovyRad * 0.5);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  };

  M.m4LookAt = (out, eye, target, up) => {
    const z = M.v3Norm(M.v3Sub(eye, target));
    const x = M.v3Norm(M.v3Cross(up, z));
    const y = M.v3Cross(z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -M.v3Dot(x, eye);
    out[13] = -M.v3Dot(y, eye);
    out[14] = -M.v3Dot(z, eye);
    out[15] = 1;
    return out;
  };

  M.m4ComposeTRS = (out, pos, rotXYZ, scale = [1, 1, 1]) => {
    const [rx, ry, rz] = rotXYZ;
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    // Rotation order: Y * X * Z (yaw -> pitch -> roll)
    const r00 = cy * cz + sy * sx * sz;
    const r01 = cx * sz;
    const r02 = -sy * cz + cy * sx * sz;
    const r10 = -cy * sz + sy * sx * cz;
    const r11 = cx * cz;
    const r12 = sy * sz + cy * sx * cz;
    const r20 = sy * cx;
    const r21 = -sx;
    const r22 = cy * cx;

    const sxv = scale[0], syv = scale[1], szv = scale[2];
    out[0] = r00 * sxv; out[1] = r01 * sxv; out[2] = r02 * sxv; out[3] = 0;
    out[4] = r10 * syv; out[5] = r11 * syv; out[6] = r12 * syv; out[7] = 0;
    out[8] = r20 * szv; out[9] = r21 * szv; out[10] = r22 * szv; out[11] = 0;
    out[12] = pos[0];   out[13] = pos[1];   out[14] = pos[2];   out[15] = 1;
    return out;
  };

  // Orient +Z axis along dir, +Y as close to upRef as possible
  M.m4FromPosDirScale = (out, pos, dir, scale = [1, 1, 1], upRef = [0, 1, 0]) => {
    const f = M.v3Norm(dir);
    let u = upRef;
    if (Math.abs(M.v3Dot(f, u)) > 0.995) u = [0, 0, 1];
    const r = M.v3Norm(M.v3Cross(u, f));
    const trueUp = M.v3Cross(f, r);
    out[0] = r[0] * scale[0];      out[1] = r[1] * scale[0];      out[2] = r[2] * scale[0];      out[3] = 0;
    out[4] = trueUp[0] * scale[1]; out[5] = trueUp[1] * scale[1]; out[6] = trueUp[2] * scale[1]; out[7] = 0;
    out[8] = f[0] * scale[2];      out[9] = f[1] * scale[2];      out[10] = f[2] * scale[2];     out[11] = 0;
    out[12] = pos[0];              out[13] = pos[1];              out[14] = pos[2];              out[15] = 1;
    return out;
  };

  M.m4TransformPoint = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];

  M.m4TransformDir = (m, d) => [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];

  // Catmull-Rom spline evaluation over timed keyframes: [{t, p:[x,y,z], ...}]
  M.evalSplineVec3 = (keys, prop, t) => {
    const n = keys.length;
    if (n === 0) return [0, 0, 0];
    if (n === 1 || t <= keys[0].t) return keys[0][prop].slice();
    if (t >= keys[n - 1].t) return keys[n - 1][prop].slice();
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) {
        idx = i;
        break;
      }
    }
    const k0 = keys[Math.max(0, idx - 1)];
    const k1 = keys[idx];
    const k2 = keys[idx + 1];
    const k3 = keys[Math.min(n - 1, idx + 2)];
    const dt = Math.max(1e-6, k2.t - k1.t);
    const u = (t - k1.t) / dt;
    const u2 = u * u, u3 = u2 * u;

    // Non-uniform Catmull-Rom tangents scaled to segment dt
    const p0 = k0[prop], p1 = k1[prop], p2 = k2[prop], p3 = k3[prop];
    const dt0 = Math.max(1e-6, k2.t - k0.t);
    const dt1 = Math.max(1e-6, k3.t - k1.t);
    const res = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const m1 = idx === 0
        ? (p2[c] - p1[c])
        : ((p2[c] - p0[c]) / dt0) * dt;
      const m2 = idx === n - 2
        ? (p2[c] - p1[c])
        : ((p3[c] - p1[c]) / dt1) * dt;
      res[c] =
        (2 * u3 - 3 * u2 + 1) * p1[c] +
        (u3 - 2 * u2 + u) * m1 +
        (-2 * u3 + 3 * u2) * p2[c] +
        (u3 - u2) * m2;
    }
    return res;
  };

  M.evalSplineScalar = (keys, prop, t, fallback = 0) => {
    const n = keys.length;
    if (n === 0) return fallback;
    if (t <= keys[0].t) return keys[0][prop] !== undefined ? keys[0][prop] : fallback;
    if (t >= keys[n - 1].t) return keys[n - 1][prop] !== undefined ? keys[n - 1][prop] : fallback;
    for (let i = 0; i < n - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) {
        const u = M.smoothstep(keys[i].t, keys[i + 1].t, t);
        const a = keys[i][prop] !== undefined ? keys[i][prop] : fallback;
        const b = keys[i + 1][prop] !== undefined ? keys[i + 1][prop] : fallback;
        return a + (b - a) * u;
      }
    }
    return fallback;
  };

  App.Math = M;
})(window.App);
