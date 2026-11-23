'use strict';
// ---------- 全局时间线与舰队 ----------
var TL = {
  T: 77,
  // 镜头分段（秒）
  bridgeIn: 15, core: 24, corridor: 33, hangar: 39, flank: 46, fireCam: 51, boom: 58, shieldOn: 62.4, boostOn: 64.5
};
var TAU2 = Math.PI * 2;
function per(n, t, ph) { return Math.sin(TAU2 * n * t / TL.T + (ph || 0)); }  // 以整圈数保证循环连续

// 前进速度曲线（循环连续）与累计路程表
function boostf(t) {
  if (t < 10) return 1 - sstep(0.8, 9.0, t);
  if (t < 64.5) return 0;
  return sstep(64.5, 71.0, t);
}
var VC = 14, VB = 118;
function speedAt(t) { return VC + (VB - VC) * boostf(t); }
var FLOW = (function () {
  var dt = 0.02, n = Math.ceil(TL.T / dt) + 2, tab = new Float64Array(n + 1);
  for (var i = 1; i <= n; i++) tab[i] = tab[i - 1] + speedAt((i - 0.5) * dt) * dt;
  return { dt: dt, tab: tab, L: tab[Math.round(TL.T / dt)] };
})();
function flowS(t) {
  var f = t / FLOW.dt, i = Math.floor(f), u = f - i;
  return FLOW.tab[i] + (FLOW.tab[i + 1] - FLOW.tab[i]) * u;
}

// ---------- 舰队阵列（舰队坐标系：旗舰在原点，航向 +X） ----------
function buildLayout() {
  var ships = [];
  var rng = new RNG(31337);
  ships.push({ kind: 'F', base: [0, 0, 0], ph: 0, rank: 0 });
  // 近卫舰：两侧 8 艘 + 后方 8 艘
  var side = [[-420, -36, 318], [-170, 66, 336], [90, -22, 312], [310, 54, 340]];
  [1, -1].forEach(function (s) {
    side.forEach(function (p, i) {
      ships.push({ kind: 'C', base: [p[0] + s * 30 * (i % 2), p[1] + (s < 0 ? 20 : 0), s * p[2]], ph: rng.next() * 6.28, rank: 1, group: 'flank', gi: i });
    });
  });
  var aft = [[-800, 34, 160], [-800, -42, -170], [-1010, 62, 70], [-1010, -34, -250], [-1040, 28, 260], [-1260, -48, 150], [-1280, 52, -130], [-1180, 6, 0]];
  aft.forEach(function (p, i) { ships.push({ kind: 'C', base: [p[0], p[1], p[2]], ph: rng.next() * 6.28, rank: 1, group: 'aft', gi: i }); });
  // 前卫舰：前方楔形 + 外层展开
  var van = [
    [1260, 40, 0], [1130, -26, 210], [1130, 62, -230], [1010, 14, 410], [1000, -50, -400], [880, 78, 120],
    [860, -30, -110], [740, 10, 520], [720, 50, -540], [600, -62, 660], [580, 40, -690], [450, 110, 470],
    [420, -110, -480], [260, 150, 640], [240, -140, -640], [80, 160, -590], [60, -130, 600], [-120, 140, 700],
    [-160, -100, -720], [1440, 10, 300], [1420, -30, -310], [920, 190, 0]
  ];
  van.forEach(function (p, i) { ships.push({ kind: 'V', base: p.slice(), ph: rng.next() * 6.28, rank: 2, gi: i }); });
  return ships;
}

// 舰船随时间的状态
function shipPose(s, t) {
  var dirOut = vnorm([0, s.base[1] * 0.0, s.base[2]]);
  // 开火前向外展开：46 → 54 展开，61 → 70 重新收拢
  var spread = sstep(44, 53, t) * (1 - sstep(60, 71, t));
  var amt = (s.kind === 'F') ? 0 : (s.kind === 'C' ? 34 : 48);
  var zDir = s.base[2] >= 0 ? 1 : -1;
  var yDir = s.base[1] >= 0 ? 1 : -1;
  var ox = 0, oy = 0, oz = 0;
  oz += zDir * amt * spread * (0.7 + 0.5 * Math.abs(Math.sin(s.ph)));
  oy += yDir * amt * 0.35 * spread;
  // 加速：前方的舰先动，沿舰列向后传开（循环连续，开头衰退）
  var lag = (1200 - s.base[0]) / 2200;           // 前方 0 → 后方 1
  var tb = boostf(Math.min(Math.max(t - lag * 2.2 + 0.0, 0), 77));
  var surge = (s.kind === 'F') ? 0.5 : 1.0;
  var bt = t < 10 ? 1 - sstep(0.8 + lag * 1.2, 9.0 + lag * 1.2, t) : sstep(64.5 + lag * 1.4, 71.0 + lag * 1.4, t);
  ox += bt * 46 * surge * (0.6 + 0.4 * (1 - lag));
  // 缓慢飘移
  var a = s.ph;
  ox += 5.0 * per(2, t, a) + 2.5 * per(5, t, a * 2.1);
  oy += 3.5 * per(3, t, a * 1.7);
  oz += 3.0 * per(4, t, a * 0.6);
  var yaw = 0.012 * per(3, t, a) + 0.05 * spread * zDir * 0.0, pitch = 0.008 * per(4, t, a * 1.3), roll = 0.018 * per(2, t, a * 0.9);
  // 展开时外偏
  yaw += -zDir * 0.07 * spread * (s.kind === 'F' ? 0 : 1);
  var R = m3mul(m3rotY(yaw), m3mul(m3rotZ(pitch), m3rotX(roll)));
  return { pos: [s.base[0] + ox, s.base[1] + oy, s.base[2] + oz], R: R, bt: bt, spread: spread };
}

// 推进强度 0..1.6
function thrustOf(s, t, pose) {
  var cruise = 0.5 + 0.06 * per(7, t, s.ph);
  return cruise + 1.0 * pose.bt;
}

// ---------- 护盾 ----------
function shieldState(s, t) {
  var d = s.rank * 0.0 + (s.kind === 'F' ? 0 : (s.kind === 'C' ? 0.45 : 0.85)) + Math.abs(Math.sin(s.ph * 3.7)) * 0.5 + (s.kind === 'V' ? (1300 - s.base[0]) / 3000 : 0);
  var on = TL.shieldOn + d;
  var steady = 0.7;
  if (t < 12) {
    // 循环开头：护盾余辉逐渐变薄
    var off = 9.0 + d * 2.2;
    var k = steady * (1 - sstep(0.6 + d * 0.8, off, t));
    return { k: k, p: 1.5, deploying: false };
  }
  if (t < on) return { k: 0, p: 0, deploying: false };
  var u = (t - on);
  var p = Math.min(1.5, u / 1.6);
  var kk = steady * Math.min(1, u / 0.45) + 0.55 * Math.exp(-u * 1.3) * (u < 3 ? 1 : 0);
  return { k: kk, p: p, deploying: u < 1.8 };
}

// ---------- 环境 ----------
var ENV_EXT = {
  sun: SUN_LOCAL, sunCol: [1.6, 1.42, 1.15], skyAmb: [0.10, 0.14, 0.27], gndAmb: [0.055, 0.048, 0.075], ambK: 1.0,
  fog: 0.00004, fogCol: [0.02, 0.03, 0.07], emiK: 1.0, glowK: 1.0, planetDir: vnorm([0.30, -0.82, -0.48])
};

// ---------- 资源（模型）装载 ----------
var ASSET = { ready: false, models: {}, meta: {} };
function meshOf(g, opts) {
  var m = meshGrid(g, Object.assign({ chunk: 96, groups: g._grp || null }, opts || {}));
  return GLR.upload(m);
}
