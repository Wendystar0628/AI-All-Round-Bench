// 光效与粒子：推进尾焰、主光束、脉冲弹、近防弹迹、导弹及尾迹、命中火花、漂浮光屑。
// 全部由时间 t 解析给出，便于任意定位到某一帧。坐标以世界单位给出，内部转为相对相机。

var FX = (function () {
  var buf = null;
  var n = 0;
  var cp = [0, 0, 0];
  var MAXP = 0;

  function push(p, w, ax, hl, col, kind, seed, p2, p3) {
    if (n >= MAXP) return;
    var o = n * 16;
    buf[o] = p[0] - cp[0]; buf[o + 1] = p[1] - cp[1]; buf[o + 2] = p[2] - cp[2]; buf[o + 3] = w;
    if (ax) { buf[o + 4] = ax[0]; buf[o + 5] = ax[1]; buf[o + 6] = ax[2]; } else { buf[o + 4] = 0; buf[o + 5] = 0; buf[o + 6] = 0; }
    buf[o + 7] = hl || 0;
    buf[o + 8] = col[0]; buf[o + 9] = col[1]; buf[o + 10] = col[2]; buf[o + 11] = col[3];
    buf[o + 12] = kind; buf[o + 13] = seed || 0; buf[o + 14] = p2 || 0; buf[o + 15] = p3 || 0;
    n++;
  }
  function frac(x) { return x - Math.floor(x); }
  function mixc(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function toWorld(bs, pos, local) {
    return [pos[0] + bs.x[0] * local[0] + bs.y[0] * local[1] + bs.z[0] * local[2],
      pos[1] + bs.x[1] * local[0] + bs.y[1] * local[1] + bs.z[1] * local[2],
      pos[2] + bs.x[2] * local[0] + bs.y[2] * local[1] + bs.z[2] * local[2]];
  }
  function rockWorld(ri, p, t) {
    var rk = FLEET.rocks()[ri];
    var pose = FLEET.rockPose(rk, t);
    var m = FLEET.m3v(pose.M, p);
    return [pose.W[0] + m[0], pose.W[1] + m[1], pose.W[2] + m[2]];
  }
  function norm(v) { return MATH.V.norm(v); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function len(v) { return Math.hypot(v[0], v[1], v[2]); }

  // 尾焰：沿 back 方向拖出的噪声团，近喷口明亮，远端透明
  function plume(nz, back, L, W, th, seed, rate) {
    var N = 9;
    for (var k = 0; k < N; k++) {
      var a = frac(SCENE_TIME * rate + k / N + seed);
      var p = [nz[0] + back[0] * a * L, nz[1] + back[1] * a * L, nz[2] + back[2] * a * L];
      var w = W * (0.45 + 0.9 * a);
      var alpha = Math.pow(1 - a, 1.3) * (0.35 + 0.65 * th);
      var col = mixc([1.0, 0.95, 1.0], [0.25, 0.7, 1.0], Math.min(1, a * 1.6));
      push(p, w, back, w * 1.5, [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, alpha], 3, seed + k, a, 0.9 * (0.5 + th));
    }
    // 喷口核心辉光
    push(nz, W * 0.7, null, 0, [0.6, 0.95, 1.0, 0.35 + 0.5 * th], 0, seed, 0, 0);
  }

  var SCENE_TIME = 0;

  // 推进尾焰（全部舰船）
  function emitEngines(t) {
    var C = FLEET.flagCenter(t);
    var th = FLEET.thrust(t);
    var fb = MATH.rotateBasis(MATH.identityBasis(), [0, 1, 0], FLEET.flagYaw(t));
    var back = [-fb.x[0], -fb.x[1], -fb.x[2]];
    var nys = [92, 130, 168], nzs = [-50, 0, 50];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var loc = [-550 + 1.5, nys[i] - 170, nzs[j]];
      plume(toWorld(fb, C, loc), back, 150 + 170 * th, 17, 0.5 + 0.5 * th, 10 + i * 3 + j, 0.7);
    }
    // 护卫
    FLEET.NG.forEach(function (e) {
      var st = FLEET.escortState(e, t, false);
      var bk = [-st.b.x[0], -st.b.x[1], -st.b.x[2]];
      for (var s = -1; s <= 1; s += 2) {
        var loc = [-85 - 1.5, 0, s * 16];
        plume(toWorld(st.b, st.p, loc), bk, 40 + 60 * th, 5, 0.5 + 0.5 * th, e.i * 2 + (s > 0 ? 1 : 0) + 3, 0.9);
      }
    });
    FLEET.VG.forEach(function (e) {
      var st = FLEET.escortState(e, t, true);
      var bk = [-st.b.x[0], -st.b.x[1], -st.b.x[2]];
      for (var s = -1; s <= 1; s += 2) {
        var loc = [-115 - 1.5, 3, s * 8];
        plume(toWorld(st.b, st.p, loc), bk, 50 + 60 * th, 7, 0.5 + 0.5 * th, e.i * 2 + (s > 0 ? 1 : 0) + 7, 0.8);
      }
    });
    for (var bi = 0; bi < FLEET.BOATS.length; bi++) {
      var bs = FLEET.boatState(bi, t);
      var bkb = [-bs.b.x[0], -bs.b.x[1], -bs.b.x[2]];
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        plume(toWorld(bs.b, bs.p, [-15 - 1, 1, s2 * 2]), bkb, 14, 1.8, 0.7, bi * 4 + s2 + 9, 1.4);
      }
    }
  }

  // 主光束：蓄能光团 + 三层光束 + 击中点辉光 + 收束的余辉
  function emitBeam(t) {
    var B = SCENE_BEAM;
    if (t < B.t0) return;
    var C = FLEET.flagCenter(t);
    var fb = MATH.rotateBasis(MATH.identityBasis(), [0, 1, 0], FLEET.flagYaw(t));
    var M = toWorld(fb, C, [550, -50, 0]);
    var tgt = rockWorld(B.rock, B.aim, t);
    var d = sub(tgt, M);
    var L = len(d);
    var dir = norm(d);
    var ch = MATH.smooth(B.t0, B.tFire, t);
    // 蓄能光团
    if (t < B.tFire + 0.3) {
      var orb = 6 + 26 * ch;
      push(M, orb * (1.0 + 0.2 * Math.sin(t * 40)), null, 0, [0.7, 1.0, 1.0, 0.5 + 0.5 * ch], 0, 3, 0, 0);
      push(M, orb * 2.6, null, 0, [0.2, 0.7, 1.0, 0.35 * ch], 0, 4, 0, 0);
    }
    if (t < B.tFire) return;
    // 起射光环：炮口在发射瞬间扩出一圈光环
    var rt = t - B.tFire;
    if (rt < 0.9) push(M, 30, null, 0, [0.8, 1.0, 1.0, 1.3 * (1 - rt / 0.9)], 8, 14, 0.15 + 0.85 * rt / 0.9, 1.0);
    // 束身：发射后从炮口延伸，结束后从炮口收回
    var s0 = MATH.smooth(B.tEnd, B.tEnd + 0.7, t);
    var s1 = 1.0;
    var fadeEnd = MATH.smooth(B.tEnd, B.tEnd + 1.2, t);
    var flow = t - B.tFire;
    var gain = (1 - fadeEnd) * (0.85 + 0.15 * Math.sin(t * 30));
    if (gain <= 0.001 && s0 >= 0.999) return;
    var c0 = [M[0] + d[0] * (s0 + s1) / 2, M[1] + d[1] * (s0 + s1) / 2, M[2] + d[2] * (s0 + s1) / 2];
    var hl = L * (s1 - s0) / 2;
    var widthK = (1 - 0.6 * s0) * (1 + 0.1 * Math.sin(t * 23) + 0.05 * Math.sin(t * 61));
    push(c0, 3.2 * widthK, dir, hl, [1.0, 1.0, 1.0, 1.4 * gain], 5, 1, 9, 1.0 + flow * 0.1);
    push(c0, 9 * widthK, dir, hl, [0.45, 0.9, 1.0, 0.9 * gain], 5, 2, 2.2, 1.0);
    push(c0, 26 * widthK, dir, hl, [0.15, 0.4, 1.0, 0.45 * gain], 5, 3, 0.9, 1.0);
    // 光束沿途的颗粒
    var nP = 10;
    for (var k = 0; k < nP; k++) {
      var s = frac(k / nP + t * 0.8);
      var q = [M[0] + d[0] * s, M[1] + d[1] * s, M[2] + d[2] * s];
      push(q, 1.4, null, 0, [0.7, 1.0, 1.0, 0.8 * gain * (1 - s)], 0, 40 + k, 0, 0);
    }
    // 停射之后：束身断开处的余辉光屑继续向前散去
    var ra = t - B.tEnd;
    if (ra > 0 && ra < 1.6) {
      for (var ks = 0; ks < 12; ks++) {
        var age2 = ra - ks * 0.05;
        if (age2 <= 0) continue;
        var sp2 = 0.25 + 0.1 * RND.hash1(ks * 13 + 7);
        var pq = [M[0] + d[0] * (s0 + age2 * sp2 * 0.5), M[1] + d[1] * (s0 + age2 * sp2 * 0.5), M[2] + d[2] * (s0 + age2 * sp2 * 0.5)];
        var aq = Math.max(0, 1 - age2 / 1.6);
        push(pq, 1.2, null, 0, [0.8, 1.0, 1.0, 0.9 * aq], 0, 300 + ks, 0, 0);
      }
    }
    // 击中点：裂口光与冲击光在击中瞬间达到峰值
    var hitGain = gain * (0.5 + 0.5 * Math.sin(t * 13));
    push(tgt, 18 + 6 * Math.sin(t * 7), null, 0, [1.0, 0.75, 0.4, 0.9 * hitGain], 4, 11, 0, 0.9 * hitGain);
    push(tgt, 8, null, 0, [1.0, 0.95, 0.9, 1.0 * hitGain], 0, 12, 0, 0);
    // 炮口余辉
    push(M, 14 * (1 - fadeEnd), null, 0, [0.8, 1.0, 1.0, 0.8 * (1 - fadeEnd)], 0, 13, 0, 0);
  }
  var SCENE_BEAM = null;

  // 脉冲：三发一组的能量弹，弹道从炮台飞向目标
  function emitPulses(t) {
    var C = FLEET.flagCenter(t);
    var fb = MATH.rotateBasis(MATH.identityBasis(), [0, 1, 0], FLEET.flagYaw(t));
    var pods = SHIPS.FLAG_PODS;
    SCENE_PULSES.forEach(function (pb, k) {
      for (var j = 0; j < 3; j++) {
        var tl = pb.t - 0.62 + j * 0.08;
        // 弹着点的爆闪：弹丸抵达后短暂绽放
        var hitAge = t - (tl + 0.62);
        if (hitAge > 0 && hitAge < 0.25) {
          var Th = rockWorld(pb.rock, pb.aim[j], pb.t + j * 0.08);
          push(Th, 5 + 14 * hitAge, null, 0, [0.6, 1.0, 0.9, 1.1 * (1 - hitAge / 0.25)], 4, 75 + k * 3 + j, 0, 1);
        }
        if (t < tl || t > tl + 0.62) continue;
        var pod = pods[(k * 3 + j * 5) % pods.length];
        var loc = [pod.x - SHIPS.FLAG_ANCHOR[0] + 13, pod.y - SHIPS.FLAG_ANCHOR[1], pod.z - SHIPS.FLAG_ANCHOR[2]];
        var S = toWorld(fb, C, loc);
        var T = rockWorld(pb.rock, pb.aim[j], pb.t + j * 0.08);
        var d = sub(T, S);
        var dir = norm(d);
        var u = (t - tl) / 0.62;
        var p = [S[0] + d[0] * u, S[1] + d[1] * u, S[2] + d[2] * u];
        var fade = 1 - MATH.smooth(0.85, 1.0, u);
        push(p, 6.5, dir, 40, [0.55, 1.0, 0.9, 2.4 * fade], 1, 60 + k * 3 + j, 0, 0);
        push(p, 16, null, 0, [0.5, 1.0, 0.9, 0.7 * fade], 0, 61 + k * 3 + j, 0, 0);
        if (t - tl < 0.15) push(S, 12 * (1 - (t - tl) / 0.15), null, 0, [0.6, 1.0, 0.9, 0.9], 0, 70 + j, 0, 0);
      }
    });
  }
  var SCENE_PULSES = [];

  // 近防炮：密集的弹迹，每发沿直线飞向目标碎块
  function emitCIWS(t) {
    SCENE_CIWS.forEach(function (cb, k) {
      var C = FLEET.flagCenter(t);
      var ng = FLEET.NG[(k * 2 + 1) % FLEET.NG.length];
      var st = FLEET.escortState(ng, t, false);
      for (var r = 0; r < cb.n; r++) {
        var tl = cb.t + r * 0.035;
        var T = rockWorld(cb.rock, cb.aim[r % cb.aim.length], tl);
        var pod = SHIPS.NG_PODS[r % 4];
        var S = toWorld(st.b, st.p, [pod.x - SHIPS.NG_ANCHOR[0] + 6, pod.y - SHIPS.NG_ANCHOR[1], pod.z - SHIPS.NG_ANCHOR[2]]);
        var d = sub(T, S);
        var dist = len(d);
        var flight = dist / 900;
        var u = (t - tl) / flight;
        if (u < 0 || u > 1.3) continue;
        var dir = norm(d);
        var lp = [S[0] + d[0] * u, S[1] + d[1] * u, S[2] + d[2] * u];
        var ga = u <= 1 ? 1 - u * 0.3 : (1.3 - u) / 0.3 * 0.7;
        push(lp, 0.7, dir, 16, [1.0, 0.8, 0.45, 1.6 * ga], 2, 80 + r, 0, 0);
        if (t - tl < 0.05) push(S, 5, null, 0, [1.0, 0.85, 0.5, 1.0], 0, 90 + r, 0, 0);
      }
    });
  }
  var SCENE_CIWS = [];

  // 导弹：飞行中的位置（用于绘制导弹实体与尾迹）
  function missileState(mb, t) {
    var T1 = MISSILE_T;
    var u = (t - mb.t) / T1;
    if (u < 0 || u > 1) return null;
    var i = mb.vg;
    var st = FLEET.escortState(FLEET.VG[i], mb.t, true);
    var tube = SHIPS.VG_TUBES[mb.tube];
    var S = toWorld(st.b, st.p, [tube.x - SHIPS.VG_ANCHOR[0], tube.y - SHIPS.VG_ANCHOR[1], tube.z - SHIPS.VG_ANCHOR[2]]);
    var Tt = rockWorld(mb.rock, mb.aim, mb.t + T1);
    var up = [0, 1, 0];
    var ctl = [S[0] + st.b.x[0] * 120 + up[0] * 110, S[1] + st.b.x[1] * 120 + up[1] * 110 + 40, S[2] + st.b.x[2] * 120 + up[2] * 110];
    return { S: S, Tt: Tt, ctl: ctl, u: u, mb: mb };
  }
  function bez(S, C, E, u) {
    var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return [a * S[0] + b * C[0] + c * E[0], a * S[1] + b * C[1] + c * E[1], a * S[2] + b * C[2] + c * E[2]];
  }
  function emitMissiles(t) {
    SCENE_MISSILES.forEach(function (mb) {
      var ms = missileState(mb, t);
      if (!ms) return;
      var u = ms.u;
      var P = bez(ms.S, ms.ctl, ms.Tt, u);
      for (var k = 0; k < 14; k++) {
        var uu = u - k * 0.012;
        if (uu < 0) break;
        var q = bez(ms.S, ms.ctl, ms.Tt, uu);
        var fade = (1 - k / 14);
        push(q, 1.7 * (1 - k / 22), null, 0, [1.0, 0.85, 0.6, 1.0 * fade * 0.7], 0, 100 + k + mb.ph * 20, 0, 0);
        if (k === 0) push(q, 3.5, null, 0, [1.0, 0.9, 0.7, 1.0], 0, 99, 0, 0);
      }
      var tail = bez(ms.S, ms.ctl, ms.Tt, Math.max(0, u - 0.02));
      var tdir = norm(sub(P, tail));
      push(P, 10, null, 0, [1.0, 0.6, 0.25, 0.8], 0, 77, 0, 0);
      var ign = MATH.smooth(0, 0.12, u);
      push(tail, 4.6, tdir, 5, [1.0, 0.55, 0.2, 1.8 * ign], 3, 110 + mb.ph, 0, 0.9);
      // 尾迹条带
      push(P, 2.5, tdir, 14, [0.9, 0.8, 0.7, 0.6], 6, 130 + mb.ph, 0.5, 0.9);
      if (u > 0.985) {
        var age = (u - 0.985) * MISSILE_T;
        // 命中爆闪
        push(ms.Tt, 14 + 10 * age, null, 0, [1.0, 0.7, 0.35, 0.9], 4, 150 + mb.ph, 0, 0.8);
      }
    });
  }
  var SCENE_MISSILES = [];
  var MISSILE_T = 1.9;

  // 命中之后：烟尘与余辉在空间中留存并缓缓扩散
  function emitMissileAfterglow(t) {
    SCENE_MISSILES.forEach(function (mb) {
      var ua = (t - mb.t) / MISSILE_T;
      if (ua <= 1 || ua >= 2.2) return;
      var age = ua - 1;
      var Tt = rockWorld(mb.rock, mb.aim, mb.t + MISSILE_T);
      var fadeA = Math.max(0, 1 - age / 1.2);
      for (var k = 0; k < 6; k++) {
        var dx = RND.hash1(mb.ph * 17 + k * 3) - 0.5, dy = RND.hash1(mb.ph * 5 + k * 7) - 0.3, dz = RND.hash1(mb.ph * 11 + k) - 0.5;
        var q = [Tt[0] + dx * 60 * age, Tt[1] + dy * 40 * age, Tt[2] + dz * 60 * age];
        push(q, 10 + 26 * age, null, 0, [0.42, 0.4, 0.42, 0.55 * fadeA], 0, 170 + k + mb.ph * 7, 0, 0);
      }
    });
  }

  // 击中火花：每次命中向外飞散的碎屑与短闪
  function emitSparks(t, impacts) {
    impacts.forEach(function (im, k) {
      var age = t - im.t;
      if (age < 0 || age > 1.3) return;
      var P = rockWorld(im.rock, im.p, im.t);
      for (var j = 0; j < 9; j++) {
        var rnd = RND.hash1(k * 31 + j * 7 + 3);
        var rnd2 = RND.hash1(k * 17 + j * 11 + 5);
        var dir = norm([rnd - 0.5, rnd2 - 0.3, RND.hash1(k + j * 13) - 0.5]);
        var sp = 40 + 110 * RND.hash1(j + k * 3);
        var q = [P[0] + dir[0] * sp * age, P[1] + dir[1] * sp * age, P[2] + dir[2] * sp * age];
        var a = Math.max(0, 1 - age / 1.3);
        push(q, 1.1, dir, 7, [1.0, 0.7, 0.35, 1.5 * a], 7, 200 + k * 9 + j, 0, 0);
      }
    });
  }

  // 漂浮光屑：环绕舰队的微小颗粒，随航行向后掠过
  // 光屑的周期取整个循环的航程：循环接缝处（舰队位置回绕）光屑分布不跳变
  var DUST = null, DUST_SPAN = 0;
  function emitDust(t, C) {
    for (var i = 0; i < DUST.length; i++) {
      var d = DUST[i];
      var span = DUST_SPAN;
      var k = Math.round((C[0] - d.x) / span);
      var x = d.x + k * span;
      var rel = x - C[0];
      if (Math.abs(rel) > 1100) continue;
      var a = (1 - Math.abs(rel) / 1100) * d.a;
      if (a < 0.02) continue;
      push([x, d.y + 170, d.z], d.w, null, 0, [0.85, 0.95, 1.0, a], 7, i, 0, 0);
    }
  }

  // 炮塔瞄准：返回各脉冲炮台与近防炮座的目标点及转向权重（0..1，平滑起止）
  function podAims(t) {
    var pulse = {}, ciws = {};
    SCENE_PULSES.forEach(function (pb, k) {
      for (var j = 0; j < 3; j++) {
        var tl = pb.t - 0.62 + j * 0.08;
        var w = MATH.smooth(tl - 0.25, tl, t) * (1 - MATH.smooth(tl + 0.62, tl + 0.9, t));
        if (w <= 0) continue;
        var idx = (k * 3 + j * 5) % SHIPS.FLAG_PODS.length;
        if (!pulse[idx] || pulse[idx].w < w) pulse[idx] = { T: rockWorld(pb.rock, pb.aim[j], pb.t + j * 0.08), w: w };
      }
    });
    SCENE_CIWS.forEach(function (cb, k) {
      var end = cb.t + cb.n * 0.035 + 0.3;
      var w = MATH.smooth(cb.t - 0.3, cb.t, t) * (1 - MATH.smooth(end, end + 0.6, t));
      if (w <= 0) return;
      ciws[(k * 2 + 1) % FLEET.NG.length] = { T: rockWorld(cb.rock, cb.aim[0], cb.t), w: w };
    });
    return { pulse: pulse, ciws: ciws };
  }

  function setup(schedule) {
    buf = GLR.partData();
    MAXP = GLR.MAXP;
    SCENE_BEAM = schedule.beam;
    SCENE_PULSES = schedule.pulses;
    SCENE_CIWS = schedule.ciws;
    SCENE_MISSILES = schedule.missiles;
    DUST = [];
    DUST_SPAN = FLEET.D(FLEET.T);
    var rnd = RND.rng(991);
    var nd = Math.round(520 * DUST_SPAN / 2400);   // 保持光屑密度
    for (var i = 0; i < nd; i++) {
      DUST.push({ x: rnd() * DUST_SPAN, y: (rnd() - 0.5) * 900, z: (rnd() - 0.5) * 1500, w: 0.6 + rnd() * 1.4, a: 0.25 + rnd() * 0.6 });
    }
  }

  // 每帧构建全部粒子，返回数量
  function build(t, camPos, impacts) {
    n = 0;
    cp = camPos;
    SCENE_TIME = t;
    emitDust(t, FLEET.flagCenter(t));
    emitEngines(t);
    emitBeam(t);
    emitPulses(t);
    emitCIWS(t);
    emitMissiles(t);
    emitMissileAfterglow(t);
    emitSparks(t, impacts || []);
    return n;
  }

  return {
    setup: setup, build: build, podAims: podAims, missileState: missileState, rockWorld: rockWorld, toWorld: toWorld,
    count: function () { return n; }
  };
})();
