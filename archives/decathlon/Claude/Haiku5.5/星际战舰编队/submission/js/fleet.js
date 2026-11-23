// 舰队运动学与绘制。所有状态都是循环时间 t 的解析函数（可任意定位到某一帧）。
// 世界单位：格。舰队沿 +X 航行；旗舰中心 C(t) 为基准，护卫与小艇按相对编组偏移。

var SPL = (function () {
  // 三次 Hermite 样条（时间不均匀），keys: [[t, v0, v1, ...], ...]，按 t 升序
  function eval_(keys, t) {
    var n = keys.length, d = keys[0].length - 1;
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    var i = 0;
    while (i < n - 2 && keys[i + 1][0] <= t) i++;
    var k0 = keys[i], k1 = keys[i + 1];
    var dt = k1[0] - k0[0];
    var u = (t - k0[0]) / dt;
    var out = new Array(d);
    var u2 = u * u, u3 = u2 * u;
    var h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (var c = 1; c <= d; c++) {
      var p0 = k0[c], p1 = k1[c];
      var m0, m1;
      if (i > 0) m0 = (p1 - keys[i - 1][c]) / (k1[0] - keys[i - 1][0]) * dt;
      else m0 = (p1 - p0);
      if (i + 2 < n) m1 = (keys[i + 2][c] - p0) / (keys[i + 2][0] - k0[0]) * dt;
      else m1 = (p1 - p0);
      out[c - 1] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
    }
    return out;
  }
  return { eval: eval_ };
})();

var FLEET = (function () {
  var T = 78;
  // 航速关键帧（格/秒）：循环首尾相等，保证接续
  var VK = [[0, 52], [8, 44], [20, 40], [40, 38], [52, 36], [62, 40], [70, 50], [78, 52]];
  var DT = 0.01;
  var Dtab = null;
  function speedAt(t) {
    var r = SPL.eval(VK.map(function (k) { return [k[0], k[1]]; }), t);
    return r[0];
  }
  function buildDisp() {
    var n = Math.round(T / DT);
    Dtab = new Float64Array(n + 1);
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var t0 = i * DT, t1 = (i + 1) * DT;
      acc += 0.5 * (speedAt(t0) + speedAt(t1)) * DT;
      Dtab[i + 1] = acc;
    }
  }
  // 舰队位移（积分）
  function D(t) {
    if (!Dtab) buildDisp();
    var x = t / DT;
    var i = Math.floor(x);
    if (i < 0) i = 0;
    if (i >= Dtab.length - 1) return Dtab[Dtab.length - 1];
    var f = x - i;
    return Dtab[i] * (1 - f) + Dtab[i + 1] * f;
  }
  function cyc(t) { return 2 * Math.PI * t / T; }

  // 推进强度：随航速变化（0..1）
  function thrust(t) {
    var v = speedAt(t);
    return Math.max(0, Math.min(1, (v - 20) / 10));
  }

  // 旗舰中心（世界）、偏航
  function flagCenter(t) {
    return [D(t) + SHIPS.FLAG_ANCHOR[0], 170 + 3.0 * Math.sin(cyc(t) * 3), 4.0 * Math.sin(cyc(t) * 2 + 0.6)];
  }
  function flagYaw(t) { return 0.012 * Math.sin(cyc(t) * 2 + 1.0); }

  // 护卫的相对编组（随时间周期运动）
  var NG = [], VG = [];
  (function () {
    var rnd = RND.rng(20240611);
    for (var i = 0; i < 17; i++) {
      var side = (i % 2) ? 1 : -1;
      NG.push({
        i: i,
        base: [-330 + 1150 * ((i * 0.37 + 0.11) % 1), ((i % 3) - 1) * 150 + 30 * (rnd() - 0.5), side * (400 + 70 * ((i * 0.61) % 1) + (i % 4 === 3 ? 160 : 0))],
        amp: [90 + 240 * rnd(), 36 * rnd(), 40 * rnd()],
        k: 1 + (i % 2),
        ph: rnd() * 6.28
      });
    }
    for (i = 0; i < 16; i++) {
      var sd = (i % 2) ? 1 : -1;
      VG.push({
        i: i,
        base: [1150 + 500 * ((i * 0.31 + 0.2) % 1), -90 + 270 * ((i * 0.17 + 0.3) % 1), sd * (240 + 680 * ((i * 0.53 + 0.1) % 1))],
        amp: [50 + 40 * rnd(), 20 * rnd(), 60 * rnd()],
        k: 1,
        ph: rnd() * 6.28
      });
    }
    // 远景舰列：阵列的一侧延伸到远处（侧后方 1500–2700 格，远离陨石群），在背景中仍能看出舰形与尾焰
    for (i = 16; i < 24; i++) {
      VG.push({
        i: i,
        base: [-100 + 1500 * ((i * 0.37 + 0.2) % 1), -40 + 140 * ((i * 0.618) % 1), -(1500 + 1200 * ((i * 0.53 + 0.4) % 1))],
        amp: [60 + 40 * rnd(), 20 * rnd(), 80 * rnd()],
        k: 1,
        ph: rnd() * 6.28
      });
    }
    // 护盾依次开启：旗舰最先，护卫按距旗舰的远近由近及远接续（展开延迟 1.5–5.8 秒）
    var escorts = NG.concat(VG).sort(function (a, b) {
      return Math.hypot(a.base[0], a.base[1], a.base[2]) - Math.hypot(b.base[0], b.base[1], b.base[2]);
    });
    escorts.forEach(function (e, k) { e.shieldDelay = 1.5 + 4.3 * k / (escorts.length - 1); });
  })();

  // 护卫相对旗舰中心的偏移（展开时外扩）
  function spread(t) {
    // 开火前护卫外展：约 40–50 秒达到峰值，射击后收拢
    var a = SPL.eval([[36, 0], [46, 1], [56, 0.3], [62, 0]], t);
    return a[0] < 0 ? 0 : a[0];
  }

  function escortOffset(e, t, isVG) {
    var c = cyc(t) * e.k + e.ph;
    var sp = spread(t) * (isVG ? 0.35 : 0.22);
    var z = e.base[2] * (1 + sp);
    return [
      e.base[0] + e.amp[0] * Math.sin(c),
      e.base[1] + e.amp[1] * Math.sin(c * 2 + 1.1),
      z + e.amp[2] * Math.sin(c + 0.7)
    ];
  }

  // 护卫位置与朝向（世界）
  function escortState(e, t, isVG) {
    var C = flagCenter(t);
    var off = escortOffset(e, t, isVG);
    var p = [C[0] + off[0], C[1] + off[1], C[2] + off[2]];
    var yaw = flagYaw(t) + 0.02 * Math.sin(cyc(t) * e.k + e.ph) * (isVG ? 0.5 : 1);
    var b = MATH.rotateBasis(MATH.identityBasis(), [0, 1, 0], yaw);
    return { p: p, b: b };
  }

  // 护卫的护盾强度（开盾依次展开，射击后关闭，循环末尾渐薄）
  function shieldAmt(t, delay) {
    var up = SPL.eval([[60, 0], [64 + delay, 0], [70 + delay, 1], [76, 1]], t)[0];
    var down = SPL.eval([[0, 1], [2 + delay, 0.8], [6 + delay, 0.35], [10 + delay, 0], [20, 0]], t)[0];
    return Math.max(0, Math.min(1, Math.max(up, down)));
  }

  // 小艇：出港、伴飞、返航的样条路径（相对旗舰中心，左右舷）
  var BOATS = [
    { side: 1, keys: [[0, 60, -60, 104], [6, 60, -60, 104], [11, 60, -62, 112], [13, 120, -70, 160], [16, 230, -55, 260], [19, 170, -50, 350], [22, 90, -70, 320], [24, 70, -72, 220], [26, 62, -58, 116], [30, 60, -60, 104], [78, 60, -60, 104]] },
    { side: -1, keys: [[0, 60, -60, -104], [14, 60, -60, -104], [17, 140, -64, -160], [20, 190, -64, -300], [24, 90, -40, -380], [28, -120, -22, -400], [32, -220, -12, -320], [36, -200, -30, -150], [40, 60, -60, -104], [78, 60, -60, -104]] },
    { side: 1, keys: [[0, 100, -70, 110], [50, 100, -70, 110], [53, 100, -66, 150], [58, 40, -20, 310], [63, -60, -10, 360], [68, -180, -20, 330], [72, -120, -40, 180], [75, 60, -60, 110], [78, 100, -70, 110]] }
  ];
  function boatState(bi, t) {
    var b = BOATS[bi];
    var p = SPL.eval(b.keys, t);
    var q = SPL.eval(b.keys, Math.min(78, t + 0.05));
    var r = SPL.eval(b.keys, Math.max(0, t - 0.05));
    var dir = [q[0] - r[0], q[1] - r[1], q[2] - r[2]];
    if (MATH.V.len(dir) < 1e-4) dir = [1, 0, 0];
    dir = MATH.V.norm(dir);
    var up = [0, 1, 0];
    var bas = MATH.basis(dir, up);
    var C = flagCenter(t);
    return { p: [C[0] + p[0], C[1] + p[1], C[2] + p[2]], b: bas, dir: dir };
  }

  // 陨石群（世界坐标）：固定于前方，循环开始时位于远处
  var XC = 3380;
  var ROCK_DEF = [
    { R: 46, lumps: 9, seed: 11, p: [XC, 30, -120], spin: 0.02 },
    { R: 34, lumps: 8, seed: 12, p: [XC - 40, 120, 130], spin: -0.03 },
    { R: 24, lumps: 6, seed: 13, p: [XC + 90, -10, 40], spin: 0.04 },
    { R: 15, lumps: 4, seed: 14, p: [XC + 10, 80, -40], spin: 0.05 },
    { R: 9, lumps: 2, seed: 15, p: [XC + 150, 40, -160], spin: 0.08 },
    { R: 8, lumps: 2, seed: 16, p: [XC - 110, 10, 200], spin: -0.07 },
    { R: 6, lumps: 1, seed: 17, p: [XC + 40, 150, 120], spin: 0.1 },
    { R: 5, lumps: 1, seed: 18, p: [XC + 210, 100, -20], spin: 0.1 }
  ];
  var rocks = [];

  // 陨石在世界中的当前姿态与位置（几乎静止，缓慢自转）
  function rockPose(r, t) {
    var ang = r.def.spin * t + r.ph;
    var M = MATH.rotAxis([0.3, 1, 0.2], ang);
    return { W: r.def.p, M: M };
  }
  // 矩阵乘向量（行优先 3x3 数组）
  function m3v(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
  function m3m(A, B) { return MATH.mat3Mul(A, B); }

  // 击碎事件：{t, p(局部坐标), s, r}
  var IMPACTS = [];

  function setupRocks() {
    rocks = [];
    for (var i = 0; i < ROCK_DEF.length; i++) {
      var d = ROCK_DEF[i];
      var rk = ROCKS.make(d.seed, d.R, d.lumps);
      rocks.push({ def: d, data: rk, ph: RND.hash1(d.seed) * 6.28, breaks: [] });
    }
  }

  // 生成击碎安排（在绘制前调用一次）
  function scheduleBreaks(impacts) {
    // impacts: [{rock: idx, t, p: [局部], s, r}]
    IMPACTS = impacts;
    for (var i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      rk.breaks = [];
      var imps = impacts.filter(function (im) { return im.rock === i; });
      var rnd = RND.rng(777 + i * 13);
      rk.data.lumps.forEach(function (L, li) {
        // 每个岩块都会在最近的一次命中之后脱离（距离越远，脱离越晚）
        var best = null, bestT = 1e9;
        for (var j = 0; j < imps.length; j++) {
          var im = imps[j];
          var dx = L.c[0] - im.p[0], dy = L.c[1] - im.p[1], dz = L.c[2] - im.p[2];
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          var lim = Math.max(im.r + L.rad * 0.8, rk.def.R * 1.2);
          var tb = im.t + 0.15 + 1.6 * Math.min(1, dist / lim) + 0.2 * rnd();
          if (tb < bestT) { bestT = tb; best = { im: im, dist: dist, dx: dx, dy: dy, dz: dz }; }
        }
        if (!best) return;
        var len = Math.sqrt(best.dx * best.dx + best.dy * best.dy + best.dz * best.dz) || 1;
        var dirv = [best.dx / len, best.dy / len, best.dz / len];
        // 大块慢、小块快；方向沿撞击远离
        var sp = L.rad > 7 ? 2.5 : (L.rad > 3.5 ? 6 : 10);
        sp *= 0.7 + 0.6 * rnd();
        // 脱离后随航行向后掠去：世界中的后退速度使碎块在镜头前滑向舰尾
        var back = L.rad > 7 ? 12 : (L.rad > 3.5 ? 26 : 38);
        back *= 0.7 + 0.6 * rnd();
        var vel = [dirv[0] * sp - back, dirv[1] * sp, dirv[2] * sp];
        vel[1] += 0.8 * rnd();
        var axis = MATH.V.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
        rk.breaks.push({ li: li, t: bestT, vel: vel, tau: 40, axis: axis, w: (0.6 + 2.2 * rnd()) * (L.rad > 7 ? 0.4 : 1) * (rnd() < 0.5 ? -1 : 1) });
      });
    }
  }

  // 陨石岩块的当前变换（相对于旗舰中心无关，直接在世界中）
  // 返回 {basis(3x3 行优先), trans(世界), broken:boolean}
  function lumpXform(ri, li, t) {
    var rk = rocks[ri];
    var pose = rockPose(rk, t);
    var L = rk.data.lumps[li];
    var M = pose.M;
    var W = pose.W;
    var br = null;
    for (var k = 0; k < rk.breaks.length; k++) if (rk.breaks[k].li === li) br = rk.breaks[k];
    if (!br || t < br.t) return { M: M, W: W, c: L.c, brk: false };
    var tau = t - br.t;
    var td = br.tau;
    var f = td * (1 - Math.exp(-tau / td));
    var d = [br.vel[0] * f, br.vel[1] * f, br.vel[2] * f];
    var ang = br.w * tau;
    var Rr = MATH.rotAxis(br.axis, ang);
    var Mtot = m3m(M, Rr);
    var MC = m3v(M, L.c);
    var MRC = m3v(Mtot, L.c);
    var trans = [W[0] + m3v(M, d)[0] + MC[0] - MRC[0], W[1] + m3v(M, d)[1] + MC[1] - MRC[1], W[2] + m3v(M, d)[2] + MC[2] - MRC[2]];
    return { M: Mtot, W: trans, c: L.c, brk: true, tau: tau };
  }

  // 陨石的冲击余辉（局部坐标；供着色器使用）
  function impactsFor(ri, t) {
    var out = [];
    for (var i = 0; i < IMPACTS.length; i++) {
      var im = IMPACTS[i];
      if (im.rock !== ri) continue;
      var age = t - im.t;
      if (age < 0 || age > 4.5) continue;
      var grow = 0.35 + 0.65 * MATH.smooth(0, 1.2, age);
      var s = im.s * Math.exp(-age / 1.6) * MATH.smooth(0, 0.08, age);
      out.push({ p: im.p, s: s, r: im.r * grow, age: age });
    }
    return out;
  }

  return {
    T: T, D: D, speedAt: speedAt, thrust: thrust, flagCenter: flagCenter, flagYaw: flagYaw,
    NG: NG, VG: VG, escortState: escortState, shieldAmt: shieldAmt, spread: spread,
    boatState: boatState, BOATS: BOATS, XC: XC, ROCK_DEF: ROCK_DEF, rocks: function () { return rocks; },
    setupRocks: setupRocks, scheduleBreaks: scheduleBreaks, lumpXform: lumpXform, impactsFor: impactsFor,
    rockPose: rockPose, m3v: m3v, m3m: m3m, IMPACTS: function () { return IMPACTS; }
  };
})();
