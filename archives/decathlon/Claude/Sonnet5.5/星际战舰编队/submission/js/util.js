'use strict';
// ---------- 数学与随机工具 ----------
var PI = Math.PI, TAU = Math.PI * 2;
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function mix(a, b, t) { return a + (b - a) * t; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function sstep5(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
function fract(x) { return x - Math.floor(x); }
function hash1(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function hash3(x, y, z) {
  var h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hash2(x, y) { return hash3(x, y, 17); }
// 可复现随机数（mulberry32）
function RNG(seed) {
  var s = seed >>> 0;
  this.next = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  this.range = function (a, b) { return a + (b - a) * this.next(); };
  this.int = function (a, b) { return Math.floor(a + (b - a + 1) * this.next()); };
  this.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  this.sign = function () { return this.next() < 0.5 ? -1 : 1; };
}
// 三维值噪声
function vnoise(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  var xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  var a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  var e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  var x1 = a + (b - a) * xf, x2 = c + (d - c) * xf, x3 = e + (f - e) * xf, x4 = g + (h - g) * xf;
  var y1 = x1 + (x2 - x1) * yf, y2 = x3 + (x4 - x3) * yf;
  return y1 + (y2 - y1) * zf;
}
function fbm3(x, y, z, oct) {
  var s = 0, a = 0.5;
  for (var i = 0; i < oct; i++) { s += a * vnoise(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}

// ---------- 向量 ----------
function v3(x, y, z) { return [x, y, z]; }
function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vmul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function vmix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function vdist(a, b) { return vlen(vsub(a, b)); }

// ---------- 3x3 矩阵（列主序，Float32 友好） ----------
function m3ident() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
function m3mul(a, b) { // a*b
  var r = new Array(9);
  for (var c = 0; c < 3; c++) for (var rr = 0; rr < 3; rr++) {
    r[c * 3 + rr] = a[0 * 3 + rr] * b[c * 3 + 0] + a[1 * 3 + rr] * b[c * 3 + 1] + a[2 * 3 + rr] * b[c * 3 + 2];
  }
  return r;
}
function m3vec(m, v) {
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}
function m3transpose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
function m3rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
function m3rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }
function m3rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
function m3axis(ax, a) {
  var x = ax[0], y = ax[1], z = ax[2], l = Math.sqrt(x * x + y * y + z * z) || 1; x /= l; y /= l; z /= l;
  var c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c];
}
// 以 forward 为 +X 轴、up 为 +Y 轴的朝向矩阵（模型局部 X 指向 fwd）
function m3look(fwd, up) {
  var f = vnorm(fwd);
  var r = vcross(f, up); if (vlen(r) < 1e-6) r = [0, 0, 1];
  r = vnorm(r);
  var u = vcross(r, f);
  // 列：x=f, y=u, z=r ，右手系：f × u = r
  return [f[0], f[1], f[2], u[0], u[1], u[2], r[0], r[1], r[2]];
}

// ---------- 4x4 矩阵 ----------
function m4persp(fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2);
  var m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
  return m;
}

// ---------- 曲线 ----------
function catmull(p0, p1, p2, p3, t) {
  var t2 = t * t, t3 = t2 * t, r = new Array(p1.length);
  for (var i = 0; i < p1.length; i++) {
    r[i] = 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return r;
}
// keys: [{t, v:[...]}]，按时间做 Catmull-Rom（时间不均匀时用端点切线修正）
function splineEval(keys, t) {
  var n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  var i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
  var k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
  var u = (t - k1.t) / (k2.t - k1.t);
  return catmull(k0.v, k1.v, k2.v, k3.v, u);
}
function easeInOut(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); }
function easeIn(t) { t = clamp(t, 0, 1); return t * t; }
