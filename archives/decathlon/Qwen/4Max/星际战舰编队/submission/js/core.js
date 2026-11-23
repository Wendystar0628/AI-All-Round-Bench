/* 核心数学 / 时间线 / 调色板 —— 全部状态都是全局时间 t 的确定函数 */
'use strict';
const SF = {};

SF.LOOP = 78;                 // 一轮总时长（秒）
SF.TAU = Math.PI * 2;

/* ---------- 随机（仅初始化期使用，运行时完全确定） ---------- */
SF.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
SF.hash1 = function (n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ---------- 标量工具 ---------- */
SF.clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
SF.lerp = (a, b, u) => a + (b - a) * u;
SF.smooth = function (a, b, x) {
  const u = SF.clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
SF.easeIO = u => u * u * (3 - 2 * u);
SF.bump = (t, a, b, c, d) => SF.smooth(a, b, t) * (1 - SF.smooth(c, d, t)); // 升起-保持-回落

/* ---------- 向量 / 矩阵（列主序 mat4） ---------- */
SF.v3 = (x = 0, y = 0, z = 0) => [x, y, z];
SF.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
SF.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
SF.scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
SF.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
SF.cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
SF.len = a => Math.hypot(a[0], a[1], a[2]);
SF.norm = function (a) { const l = SF.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
SF.lerp3 = (a, b, u) => [SF.lerp(a[0], b[0], u), SF.lerp(a[1], b[1], u), SF.lerp(a[2], b[2], u)];

SF.m4Ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
SF.m4Mul = function (a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};
SF.m4Persp = function (fovDeg, aspect, near, far) {
  const f = 1 / Math.tan(fovDeg * Math.PI / 360), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
};
SF.m4LookAt = function (eye, target, up) {
  const z = SF.norm(SF.sub(eye, target));
  const x = SF.norm(SF.cross(up, z));
  const y = SF.cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -SF.dot(x, eye), -SF.dot(y, eye), -SF.dot(z, eye), 1];
};
/* 平移 + 旋转(yaw绕Y, pitch绕X, roll绕Z) + 等比缩放 */
SF.m4TRS = function (p, yaw, pitch, roll, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry * Rx * Rz
  const m00 = cy * cr + sy * sp * sr, m01 = -cy * sr + sy * sp * cr, m02 = sy * cp;
  const m10 = cp * sr, m11 = cp * cr, m12 = -sp;
  const m20 = -sy * cr + cy * sp * sr, m21 = sy * sr + cy * sp * cr, m22 = cy * cp;
  return [m00 * s, m10 * s, m20 * s, 0, m01 * s, m11 * s, m21 * s, 0, m02 * s, m12 * s, m22 * s, 0, p[0], p[1], p[2], 1];
};
SF.m4Point = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
SF.m4AxisAngle = function (axis, ang) {
  const [x, y, z] = SF.norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
};

/* 非均匀关键帧 Catmull-Rom 轨道采样 */
SF.track = function (keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0;
  while (i < n - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const dt = k2.t - k1.t, u = (t - k1.t) / dt;
  const out = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const m1 = (k2.v[a] - k0.v[a]) / (k2.t - k0.t) * dt;
    const m2 = (k3.v[a] - k1.v[a]) / (k3.t - k1.t) * dt;
    const u2 = u * u, u3 = u2 * u;
    out[a] = (2 * u3 - 3 * u2 + 1) * k1.v[a] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2.v[a] + (u3 - u2) * m2;
  }
  return out;
};
SF.trackScalar = function (keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const dt = k2.t - k1.t, u = (t - k1.t) / dt;
  const m1 = (k2.v - k0.v) / (k2.t - k0.t) * dt, m2 = (k3.v - k1.v) / (k3.t - k1.t) * dt;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1.v + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2.v + (u3 - u2) * m2;
};

/* ---------- 调色板（舰队的离子青 + 炉火琥珀 + 深空靛蓝） ---------- */
SF.PAL = {
  hull:      [0.29, 0.34, 0.45],   // 主壳 · 靛蓝钢
  hullLite:  [0.38, 0.44, 0.56],   // 受光甲板
  plate:     [0.23, 0.28, 0.39],   // 次级壳片
  deep:      [0.09, 0.12, 0.17],   // 深层暗槽
  dark:      [0.055, 0.075, 0.11], // 吸光构件
  edge:      [0.58, 0.66, 0.78],   // 金属亮边
  cyan:      [0.31, 0.85, 1.0],    // 离子青 · 推进/缝隙
  amber:     [1.0, 0.68, 0.28],    // 炉火琥珀 · 武器
  red:       [1.0, 0.34, 0.38],    // 警示红 · 导弹
  shield:    [0.39, 1.0, 0.78],    // 极光绿 · 护盾
  rock:      [0.36, 0.32, 0.28],
  rockDark:  [0.21, 0.185, 0.16],
  rockLite:  [0.47, 0.42, 0.36],
  hot:       [1.0, 0.55, 0.22]
};
SF.tint = function (c, k) { return [c[0] * k, c[1] * k, c[2] * k]; };
SF.mixc = (a, b, u) => [SF.lerp(a[0], b[0], u), SF.lerp(a[1], b[1], u), SF.lerp(a[2], b[2], u)];

/* ---------- 全局时间线（所有周期量在 t=0 与 t=78 处连续） ---------- */
SF.timeline = {
  // 环境推进速度：开头承接上一轮加速余速，随后落回巡航；结尾再次加速
  speed(t) {
    const decay = 1 - SF.smooth(0, 8, t);
    const rise = SF.smooth(62, 72, t);
    return 30 + 185 * Math.max(decay, rise);
  },
  boost(t) { // 推进增强 0..1
    return Math.max(1 - SF.smooth(0.5, 8, t), SF.smooth(62, 71, t));
  },
  shield(t) { // 护盾强度：开头余辉渐薄 → 攻击后依次展开
    if (t < 7) return 1 - SF.smooth(0.8, 6.5, t);
    return SF.smooth(60.4, 63.6, t);
  },
  spread(t) { // 开火前编队外扩
    return SF.bump(t, 42, 46.5, 58, 66);
  },
  surge(t) { // 加速时各舰沿航向的错峰前涌（周期收拢）
    return SF.smooth(63, 72, t) * (1 - SF.smooth(74.5, 78, t));
  }
};

/* 航行累计位移（查表，确定且首尾可用于尘埃环绕） */
SF.travelTable = null;
SF.travelTotal = 0;
SF.initTravel = function () {
  const N = 1560, dt = SF.LOOP / N;
  const tab = new Float32Array(N + 1);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += SF.timeline.speed(i * dt) * dt;
    tab[i + 1] = acc;
  }
  SF.travelTable = tab;
  SF.travelTotal = acc;
};
SF.travel = function (t) {
  const tab = SF.travelTable, N = tab.length - 1;
  const x = SF.clamp(t, 0, SF.LOOP) / SF.LOOP * N;
  const i = Math.min(N - 1, Math.floor(x));
  return SF.lerp(tab[i], tab[i + 1], x - i);
};