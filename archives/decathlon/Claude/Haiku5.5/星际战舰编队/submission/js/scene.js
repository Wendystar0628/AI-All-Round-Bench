// 场景装配：资源上传、外部舰队绘制、战斗安排（一次开火的时序与击碎点）。

var NOSHIELD = /[#&]ns/.test(window.location.hash);

var SCENE = (function () {
  var TT = FLEET.T;
  var M = {};            // 已上传的 GL 网格
  var rockGL = [];       // [ri][li] -> GL 网格
  var BATTLE = null;     // 战斗调度（由 buildBattle 生成）

  // ---------- 战斗调度 ----------
  // 击碎点以陨石局部坐标给出：取陨石上朝向来袭方向的一点，加入小偏移
  function localAim(ri, t, fromWorld, jit) {
    var rk = FLEET.rocks()[ri];
    var pose = FLEET.rockPose(rk, t);
    var W = pose.W, Mm = pose.M;
    var d = MATH.V.sub(fromWorld, W);
    var l = MATH.V.len(d) || 1;
    var R = rk.def.R * 0.8;
    var v = [d[0] / l * R + jit[0], d[1] / l * R + jit[1], d[2] / l * R + jit[2]];
    // 世界向量 -> 局部：M^T v
    return [Mm[0] * v[0] + Mm[3] * v[1] + Mm[6] * v[2], Mm[1] * v[0] + Mm[4] * v[1] + Mm[7] * v[2], Mm[2] * v[0] + Mm[5] * v[1] + Mm[8] * v[2]];
  }

  function buildBattle() {
    var rnd = RND.rng(5150);
    function jit(s) { return [(rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s]; }
    var sched = { beam: null, pulses: [], ciws: [], missiles: [] };
    var impacts = [];

    // 旗舰主炮：蓄能 47.0–49.5，发射至 53.6，目标为最大的陨石 A
    var C50 = FLEET.flagCenter(50);
    var bowTip = [C50[0] + 560, C50[1] - 40, C50[2]];
    var aimB = localAim(0, 50, bowTip, [0, 0, 0]);
    sched.beam = { t0: 47.0, tFire: 49.5, tEnd: 53.6, rock: 0, aim: aimB };
    var beamTimes = [50.0, 51.2, 52.6, 53.3];
    var beamS = [4.4, 3.2, 2.4, 1.6], beamR = [6, 8, 7, 5];
    beamTimes.forEach(function (tt, k) {
      impacts.push({ rock: 0, t: tt, p: [aimB[0] + 2 * k, aimB[1] - 5 * k, aimB[2] + 4 * k], s: beamS[k], r: beamR[k] });
    });

    // 脉冲炮台齐射：目标 1,2,3
    var pulseDef = [[1, 52.6], [2, 53.0], [3, 53.4], [1, 54.2], [2, 54.8], [3, 55.1]];
    pulseDef.forEach(function (pd) {
      var C = FLEET.flagCenter(pd[1]);
      var from = [C[0] + 420, C[1] + 60, C[2] - 60];
      var aims = [0, 1, 2].map(function () { return localAim(pd[0], pd[1], from, jit(14)); });
      sched.pulses.push({ rock: pd[0], t: pd[1], aim: aims });
      aims.forEach(function (a, j) {
        impacts.push({ rock: pd[0], t: pd[1] + j * 0.08, p: a, s: 1.5, r: 3.2 });
      });
    });

    // 近卫近防炮：目标为小块 4–7，短点射
    for (var c = 0; c < 6; c++) {
      var tc = 53.6 + c * 0.7;
      var rk = 4 + (c % 4);
      var Cc = FLEET.flagCenter(tc);
      var aimsC = [];
      for (var q = 0; q < 4; q++) aimsC.push(localAim(rk, tc, [Cc[0] + 300, Cc[1] + 40, Cc[2] + 30], jit(6)));
      sched.ciws.push({ rock: rk, t: tc, n: 14, aim: aimsC });
      aimsC.forEach(function (a) { impacts.push({ rock: rk, t: tc + 0.1, p: a, s: 0.7, r: 2.2 }); });
    }

    // 前卫导弹：目标为 A、B 两块大陨石，依次发射
    var mdef = [[0, 55.6], [0, 56.0], [0, 56.4], [1, 56.8], [1, 57.2], [0, 57.6]];
    mdef.forEach(function (md, k) {
      var tm = md[1];
      var Cm = FLEET.flagCenter(tm);
      var aim = localAim(md[0], tm + 1.9, [Cm[0] + 500, Cm[1] + 120, Cm[2] + 20], jit(10));
      sched.missiles.push({ rock: md[0], t: tm, ph: k, vg: (k * 5) % 16, tube: k % 8, aim: aim });
      impacts.push({ rock: md[0], t: tm + 1.9, p: aim, s: 2.6, r: 7.0 });
    });

    BATTLE = sched;
    return impacts;
  }

  // ---------- 初始化 ----------
  function init() {
    var b = SHIPS.bakeAll();
    M.flag = GLR.uploadMesh(b.flag);
    M.pulse = GLR.uploadMesh(b.pulse);
    M.gun = GLR.uploadMesh(b.gun);
    M.ng = GLR.uploadMesh(b.ng);
    M.vg = GLR.uploadMesh(b.vg);
    M.boat = GLR.uploadMesh(b.boat);
    M.missile = GLR.uploadMesh(b.missile);
    FLEET.setupRocks();
    var impacts = buildBattle();
    FLEET.scheduleBreaks(impacts);
    FX.setup(BATTLE);
    FLEET.rocks().forEach(function (rk) {
      rockGL.push(rk.data.lumps.map(function (L) { return GLR.uploadMesh(L.md); }));
    });
    // 星点（方向）
    var rnd = RND.rng(4242);
    var N = 7000;
    var dirs = new Float32Array(N * 3), props = new Float32Array(N * 4);
    for (var i = 0; i < N; i++) {
      var z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      dirs[i * 3] = s * Math.cos(a); dirs[i * 3 + 1] = z; dirs[i * 3 + 2] = s * Math.sin(a);
      var mag = Math.pow(rnd(), 3.2);
      props[i * 4] = 0.25 + 1.6 * mag;
      props[i * 4 + 1] = 1.0 + 2.2 * mag * mag;
      props[i * 4 + 2] = rnd();
      props[i * 4 + 3] = rnd();
    }
    GLR.setStars(dirs, props);
  }

  // ---------- 绘制辅助 ----------
  // 由基（列向量）与位置构造相对相机的模型矩阵（可含各轴缩放）
  function xform(pos, bx, by, bz, camPos, sx, sy, sz) {
    var m = new Float32Array(16);
    sx = sx || 1; sy = sy || 1; sz = sz || 1;
    m[0] = bx[0] * sx; m[1] = bx[1] * sx; m[2] = bx[2] * sx; m[3] = 0;
    m[4] = by[0] * sy; m[5] = by[1] * sy; m[6] = by[2] * sy; m[7] = 0;
    m[8] = bz[0] * sz; m[9] = bz[1] * sz; m[10] = bz[2] * sz; m[11] = 0;
    m[12] = pos[0] - camPos[0]; m[13] = pos[1] - camPos[1]; m[14] = pos[2] - camPos[2]; m[15] = 1;
    return m;
  }
  function cols(Mrm) {
    return [[Mrm[0], Mrm[3], Mrm[6]], [Mrm[1], Mrm[4], Mrm[7]], [Mrm[2], Mrm[5], Mrm[8]]];
  }
  function localToWorld(basis, pos, v) {
    return [pos[0] + basis.x[0] * v[0] + basis.y[0] * v[1] + basis.z[0] * v[2],
      pos[1] + basis.x[1] * v[0] + basis.y[1] * v[1] + basis.z[1] * v[2],
      pos[2] + basis.x[2] * v[0] + basis.y[2] * v[1] + basis.z[2] * v[2]];
  }
  // 炮塔转向：权重 w 时在原朝向与目标方向之间插值
  function aimBasis(base, pos, aim) {
    if (!aim || aim.w <= 0) return base;
    var to = MATH.V.norm(MATH.V.sub(aim.T, pos));
    var fwd = MATH.V.norm(MATH.V.lerp(base.x, to, aim.w));
    return MATH.basis(fwd, [0, 1, 0]);
  }
  // 护盾：椭球代理，origin 为相机在单位球空间中的位置
  function drawShieldFor(center, basis, radii, camPos, amt, seed, t, col, wave, bright) {
    if (amt <= 0.001) return;
    var sc = 0.9 + 0.1 * amt;
    var rx = radii[0] * sc, ry = radii[1] * sc, rz = radii[2] * sc;
    var model = xform(center, basis.x, basis.y, basis.z, camPos, rx, ry, rz);
    var cr = [center[0] - camPos[0], center[1] - camPos[1], center[2] - camPos[2]];
    var o = [-(basis.x[0] * cr[0] + basis.x[1] * cr[1] + basis.x[2] * cr[2]) / rx,
      -(basis.y[0] * cr[0] + basis.y[1] * cr[1] + basis.y[2] * cr[2]) / ry,
      -(basis.z[0] * cr[0] + basis.z[1] * cr[1] + basis.z[2] * cr[2]) / rz];
    GLR.drawShield(model, o, col, amt, wave, bright, seed, t);
  }
  // 护盾展开的亮波：自舰首向舰尾掠过，持续约 4 秒，与护盾开始显现同步
  function shieldWave(t, delay) {
    var u = (t - (64 + delay)) / 4;
    if (u < 0 || u > 1) return { w: 5, b: 0 };
    return { w: 1 - 2 * u, b: 1.2 };
  }

  // ---------- 外部绘制 ----------
  function drawExterior(t, cam) {
    var camPos = cam.pos;
    var C = FLEET.flagCenter(t);
    var yaw = FLEET.flagYaw(t);
    var fb = MATH.rotateBasis(MATH.identityBasis(), [0, 1, 0], yaw);
    var th = FLEET.thrust(t);
    var charge = MATH.smooth(47.0, 49.5, t);
    var aims = FX.podAims(t);
    GLR.drawMesh(M.flag, xform(C, fb.x, fb.y, fb.z, camPos), { charge: charge, thrust: th, emit: 1.0 });
    SHIPS.FLAG_PODS.forEach(function (p, pi) {
      var local = [p.x - SHIPS.FLAG_ANCHOR[0], p.y - SHIPS.FLAG_ANCHOR[1], p.z - SHIPS.FLAG_ANCHOR[2]];
      var w = localToWorld(fb, C, local);
      var pb = aimBasis(fb, w, aims.pulse[pi]);
      GLR.drawMesh(M.pulse, xform(w, pb.x, pb.y, pb.z, camPos), {});
    });
    FLEET.NG.forEach(function (e, ni) {
      var st = FLEET.escortState(e, t, false);
      GLR.drawMesh(M.ng, xform(st.p, st.b.x, st.b.y, st.b.z, camPos), { thrust: th });
      SHIPS.NG_PODS.forEach(function (pd) {
        var w = localToWorld(st.b, st.p, [pd.x - SHIPS.NG_ANCHOR[0], pd.y - SHIPS.NG_ANCHOR[1], pd.z - SHIPS.NG_ANCHOR[2]]);
        var gb = aimBasis(st.b, w, aims.ciws[ni]);
        GLR.drawMesh(M.gun, xform(w, gb.x, gb.y, gb.z, camPos), {});
      });
    });
    FLEET.VG.forEach(function (e) {
      var st = FLEET.escortState(e, t, true);
      GLR.drawMesh(M.vg, xform(st.p, st.b.x, st.b.y, st.b.z, camPos), { thrust: th });
    });
    // 近掠的护卫：相对镜头沿左侧往返掠过画面边缘，周期与循环一致，首尾相接
    var fwd = 900 * Math.sin(2 * Math.PI * t / TT);
    var fp = [0, 1, 2].map(function (k) { return camPos[k] + cam.r[k] * -200 + cam.f[k] * fwd; });
    fp[1] -= 30;
    GLR.drawMesh(M.ng, xform(fp, fb.x, fb.y, fb.z, camPos), { thrust: th });
    for (var bi = 0; bi < FLEET.BOATS.length; bi++) {
      var bs = FLEET.boatState(bi, t);
      GLR.drawMesh(M.boat, xform(bs.p, bs.b.x, bs.b.y, bs.b.z, camPos), { thrust: 0.6 });
    }
    // 陨石岩块（含击碎后的脱离运动）
    var impactsAll = FLEET.IMPACTS();
    FLEET.rocks().forEach(function (rk, ri) {
      var imps = FLEET.impactsFor(ri, t);
      for (var li = 0; li < rk.data.lumps.length; li++) {
        var X = FLEET.lumpXform(ri, li, t);
        var cc = cols(X.M);
        GLR.drawMesh(rockGL[ri][li], xform(X.W, cc[0], cc[1], cc[2], camPos), { imp: imps });
      }
    });
    // 前卫导弹实体
    var missiles = BATTLE.missiles;
    for (var mi = 0; mi < missiles.length; mi++) {
      var ms = FX.missileState(missiles[mi], t);
      if (!ms) continue;
      var u = ms.u;
      var d = [2 * (1 - u) * (ms.ctl[0] - ms.S[0]) + 2 * u * (ms.Tt[0] - ms.ctl[0]),
        2 * (1 - u) * (ms.ctl[1] - ms.S[1]) + 2 * u * (ms.Tt[1] - ms.ctl[1]),
        2 * (1 - u) * (ms.ctl[2] - ms.S[2]) + 2 * u * (ms.Tt[2] - ms.ctl[2])];
      var bsm = MATH.basis(d, [0, 1, 0]);
      var P = [(1 - u) * (1 - u) * ms.S[0] + 2 * (1 - u) * u * ms.ctl[0] + u * u * ms.Tt[0],
        (1 - u) * (1 - u) * ms.S[1] + 2 * (1 - u) * u * ms.ctl[1] + u * u * ms.Tt[1],
        (1 - u) * (1 - u) * ms.S[2] + 2 * (1 - u) * u * ms.ctl[2] + u * u * ms.Tt[2]];
      GLR.drawMesh(M.missile, xform(P, bsm.x, bsm.y, bsm.z, camPos), {});
    }
    GLR.endVoxelBatch();
    // 护盾
    if (!NOSHIELD) {
      var fa = FLEET.shieldAmt(t, 0);
      var fw = shieldWave(t, 0);
      drawShieldFor(C, fb, [580, 210, 300], camPos, fa, 1.3, t, [0.35, 0.85, 1.0], fw.w, fw.b);
      FLEET.NG.forEach(function (e, i) {
        var st = FLEET.escortState(e, t, false);
        var a = FLEET.shieldAmt(t, e.shieldDelay);
        var w = shieldWave(t, e.shieldDelay);
        drawShieldFor(st.p, st.b, [112, 80, 82], camPos, a, 2.0 + i, t, [0.4, 0.9, 1.0], w.w, w.b);
      });
      FLEET.VG.forEach(function (e, i) {
        var st = FLEET.escortState(e, t, true);
        var a = FLEET.shieldAmt(t, e.shieldDelay);
        var w = shieldWave(t, e.shieldDelay);
        drawShieldFor(st.p, st.b, [150, 62, 90], camPos, a, 9.0 + i, t, [0.4, 0.9, 1.0], w.w, w.b);
      });
    }
    // 光效粒子
    var nP = FX.build(t, camPos, impactsAll.filter(function (im) { return t >= im.t - 0.01 && t <= im.t + 1.4; }));
    GLR.drawParticles(GLR.partData(), nP);
  }

  return {
    init: init, drawExterior: drawExterior, cols: cols, xform: xform,
    localToWorld: localToWorld, M: M, rockGL: function () { return rockGL; }
  };
})();
