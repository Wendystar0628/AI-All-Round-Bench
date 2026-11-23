/* 基础工具：数学、哈希噪声、4x4 矩阵（列主序，与 WebGL 一致）。
 * 所有模块挂在全局命名空间 AE 下；本项目以经典脚本方式加载，可直接用 file:// 打开。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = (AE.U = {});

  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.mod = (a, b) => ((a % b) + b) % b;
  U.deg2rad = (d) => (d * Math.PI) / 180;
  U.rad2deg = (r) => (r * 180) / Math.PI;
  U.uid = (p) => (p || 'i') + Math.random().toString(36).slice(2, 9);
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.isArr = Array.isArray;

  // 向量（数组形式）
  U.vadd = (a, b) => a.map((v, i) => v + b[i]);
  U.vsub = (a, b) => a.map((v, i) => v - b[i]);
  U.vmul = (a, s) => a.map((v) => v * s);
  U.vdot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  U.vlen = (a) => Math.sqrt(U.vdot(a, a));
  U.vnorm = (a) => {
    const l = U.vlen(a) || 1;
    return a.map((v) => v / l);
  };
  U.vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  U.vlerp = (a, b, t) => {
    if (typeof a === 'number') return a + (b - a) * t;
    return a.map((v, i) => v + (b[i] - v) * t);
  };

  // 哈希与噪声：全部确定性，与调用次序无关
  U.hashU = (x) => {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  U.toInt = (v) => Math.floor(v * 4096) | 0;
  // 任意个数值 -> [0,1)
  U.hash = (...vals) => {
    let h = 0x345678;
    for (let i = 0; i < vals.length; i++) {
      h = Math.imul(h ^ U.toInt(vals[i]), 0x01000193) + i * 0x9e3779b1;
      h = (h ^ (h >>> 13)) | 0;
    }
    return U.hashU(h);
  };
  U.strHash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // 一维值噪声，返回 [-1,1]
  U.noise1 = (x, seed) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = U.hash(i, seed) * 2 - 1;
    const b = U.hash(i + 1, seed) * 2 - 1;
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
  // 三维值噪声，返回 [-1,1]
  U.noise3 = (x, y, z, seed) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    const v = (dx, dy, dz) => U.hash(ix + dx, iy + dy, iz + dz, seed) * 2 - 1;
    const x00 = U.lerp(v(0, 0, 0), v(1, 0, 0), sx);
    const x10 = U.lerp(v(0, 1, 0), v(1, 1, 0), sx);
    const x01 = U.lerp(v(0, 0, 1), v(1, 0, 1), sx);
    const x11 = U.lerp(v(0, 1, 1), v(1, 1, 1), sx);
    return U.lerp(U.lerp(x00, x10, sy), U.lerp(x01, x11, sy), sz);
  };

  // ---- 4x4 矩阵，列主序 Float32Array ----
  const M = (U.mat = {});
  M.ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  M.mul = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  };
  M.translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  M.scale = (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  M.rotX = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  };
  M.rotY = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  };
  M.rotZ = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  };
  M.persp = (fovy, aspect, n, f) => {
    const t = 1 / Math.tan(fovy / 2);
    return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (n + f) / (n - f), -1, 0, 0, (2 * n * f) / (n - f), 0]);
  };
  M.ortho = (l, r, b, t, n, f) =>
    new Float32Array([
      2 / (r - l), 0, 0, 0,
      0, 2 / (t - b), 0, 0,
      0, 0, -2 / (f - n), 0,
      -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1,
    ]);
  M.lookAt = (eye, center, up) => {
    const f = U.vnorm(U.vsub(center, eye));
    const s = U.vnorm(U.vcross(f, up));
    const u = U.vcross(s, f);
    return new Float32Array([
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -U.vdot(s, eye), -U.vdot(u, eye), U.vdot(f, eye), 1,
    ]);
  };
  M.transformPoint = (m, p) => {
    const x = p[0], y = p[1], z = p[2] || 0;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const iw = w ? 1 / w : 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * iw,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw,
    ];
  };
  M.transformDir = (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ];
  M.invert = (m) => {
    const o = new Float32Array(16);
    const a = m;
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
  // 2D 仿射辅助（用于路径与几何的平面变换）
  M.applyToXY = (m, x, y) => [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13]];
  // 从 4x4 矩阵分解出 EulerXYZ（与 transform 中 Rz*Ry*Rx 对应的近似）
  M.decomposeEuler = (m) => {
    const sy = -m[2];
    let ry = Math.asin(U.clamp(sy, -1, 1));
    let rx, rz;
    if (Math.abs(sy) < 0.99999) {
      rx = Math.atan2(m[6], m[10]);
      rz = Math.atan2(m[1], m[0]);
    } else {
      rx = 0;
      rz = Math.atan2(-m[4], m[5]);
    }
    return [rx, ry, rz];
  };
})();
