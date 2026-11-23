'use strict';
/* ==================================================================
   镜头时间线：关键帧采样 + 房间切换
   ================================================================== */
const REACTOR_POS = [0, -4200, 0];

const SHOTS = [
  { // 1 沿旗舰左舷推进（开场：加速后的稳定航行）
    t0: 0, t1: 10, room: 'ship', fov: [50, 46],
    keys: [
      { t: 0, p: [-840, 390, 790], tg: [150, 140, 0] },
      { t: 3.5, p: [-560, 320, 690], tg: [290, 132, 30] },
      { t: 7, p: [-250, 238, 580], tg: [400, 116, 70] },
      { t: 10, p: [40, 176, 470], tg: [430, 100, 110] },
    ],
  },
  { // 2 进入机库口
    t0: 10, t1: 15, room: 'ship', fov: [46, 52],
    keys: [
      { t: 10, p: [40, 176, 470], tg: [430, 100, 110] },
      { t: 12.5, p: [252, 132, 344], tg: [412, 94, 152] },
      { t: 14, p: [352, 108, 252], tg: [402, 88, 150] },
      { t: 15, p: [380, 100, 186], tg: [412, 86, 80] },
    ],
  },
  { // 3 机库纵深
    t0: 15, t1: 25, room: 'ship', fov: [52, 58],
    keys: [
      { t: 15, p: [380, 100, 186], tg: [412, 86, 80] },
      { t: 18, p: [402, 94, 122], tg: [492, 84, 22] },
      { t: 21, p: [452, 90, 96], tg: [566, 82, 0] },
      { t: 25, p: [540, 88, 70], tg: [626, 80, 0] },
    ],
  },
  { // 4 导能长廊
    t0: 25, t1: 34, room: 'ship', fov: [58, 54],
    keys: [
      { t: 25, p: [540, 88, 30], tg: [626, 80, 0] },
      { t: 27.5, p: [598, 86, 18], tg: [688, 80, 0] },
      { t: 30.5, p: [692, 84, 8], tg: [790, 80, 0] },
      { t: 34, p: [800, 84, -8], tg: [872, 86, -22] },
    ],
  },
  { // 5 进入侧向暗通道
    t0: 34, t1: 35.6, room: 'ship', fov: [54, 50],
    keys: [
      { t: 34, p: [800, 84, -8], tg: [872, 86, -22] },
      { t: 35.6, p: [842, 84, -48], tg: [900, 84, -72] },
    ],
  },
  { // 6 动力核心中庭
    t0: 35.6, t1: 47, room: 'reactor', fov: [62, 56],
    keys: [
      { t: 35.6, p: [-96, -112, 56], tg: [-18, -58, 8] },
      { t: 38.5, p: [-82, -84, 50], tg: [0, -18, 0] },
      { t: 41.5, p: [-62, -38, 42], tg: [0, 22, 0] },
      { t: 44.5, p: [-46, 12, 36], tg: [0, 62, 0] },
      { t: 47, p: [-30, 66, 30], tg: [0, 102, 0] },
    ],
  },
  { // 7 升入顶部暗井
    t0: 47, t1: 49, room: 'reactor', fov: [56, 52],
    keys: [
      { t: 47, p: [-30, 66, 30], tg: [0, 102, 0] },
      { t: 49, p: [-18, 100, 20], tg: [0, 126, 0] },
    ],
  },
  { // 8 舰桥
    t0: 49, t1: 58, room: 'bridge', fov: [54, 60],
    keys: [
      { t: 49, p: [616, 150, -46], tg: [690, 148, -8] },
      { t: 52, p: [640, 148, -32], tg: [702, 146, 0] },
      { t: 55, p: [668, 146, -16], tg: [722, 144, 0] },
      { t: 58, p: [700, 144, -6], tg: [762, 140, 0] },
    ],
  },
  { // 9 穿出观景窗
    t0: 58, t1: 60.5, room: 'bridge', fov: [60, 64],
    keys: [
      { t: 58, p: [700, 144, -6], tg: [762, 140, 0] },
      { t: 59.4, p: [748, 142, -2], tg: [856, 132, 4] },
      { t: 60.5, p: [812, 150, 12], tg: [986, 120, 24] },
    ],
  },
  { // 10 攻击
    t0: 60.5, t1: 70, room: 'ext', fov: [64, 56],
    keys: [
      { t: 60.5, p: [812, 150, 12], tg: [986, 120, 24] },
      { t: 63.2, p: [884, 192, 124], tg: [1156, 100, 204] },
      { t: 66.4, p: [962, 242, 268], tg: [1356, 78, 386] },
      { t: 70, p: [1040, 282, 386], tg: [1502, 58, 486] },
    ],
  },
  { // 11 护盾展开
    t0: 70, t1: 73.2, room: 'ext', fov: [56, 60],
    keys: [
      { t: 70, p: [1040, 282, 386], tg: [1502, 58, 486] },
      { t: 73.2, p: [420, 290, 520], tg: [1080, 96, 220] },
    ],
  },
  { // 12 加速航行 → 接回开场
    t0: 73.2, t1: 76, room: 'ext', fov: [60, 50],
    keys: [
      { t: 73.2, p: [420, 290, 520], tg: [1080, 96, 220] },
      { t: 76, p: [-480, 175, 440], tg: [140, 125, 70] },
    ],
  },
];

function catmullScalar(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (t >= s.t0 && t < s.t1) return i;
  }
  return SHOTS.length - 1;
}

function sampleShot(s, t) {
  const keys = s.keys;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[Math.min(keys.length - 1, i + 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = clamp((t - k1.t) / Math.max(1e-5, k2.t - k1.t), 0, 1);
  const e = u * u * (3 - 2 * u); // 平滑
  const p = [0, 0, 0], tg = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    p[c] = catmullScalar(k0.p[c], k1.p[c], k2.p[c], k3.p[c], e);
    tg[c] = catmullScalar(k0.tg[c], k1.tg[c], k2.tg[c], k3.tg[c], e);
  }
  const fov = lerp(s.fov[0], s.fov[1], clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
  return { p, tg, fov };
}

function roomAt(t) {
  const i = shotAt(t);
  return SHOTS[i].room;
}

/* 过渡：曝光压暗（穿舱） */
function exposureAt(t) {
  let e = 1;
  for (const tt of [35.6, 49]) {
    const d = Math.abs(t - tt);
    if (d < 0.45) e = Math.min(e, smoothstep(0.45, 0.12, d) * 0.92 + 0.08);
  }
  return e;
}

function updateCamera(t) {
  if (window.__cam) { cam.set(window.__cam.p, window.__cam.tg, window.__cam.fov || 55, 0); cam.update(renderer.W / renderer.H); return; }
  const i = shotAt(t);
  const s = SHOTS[i];
  const sm = sampleShot(s, t);
  let p = sm.p, tg = sm.tg;
  if (s.room === 'reactor') { p = V3.add(p, REACTOR_POS); tg = V3.add(tg, REACTOR_POS); }
  cam.set(p, tg, sm.fov, 0);
  cam.update(renderer.W / renderer.H);
}
