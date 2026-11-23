/* 主程序：场景装配 / 绘制 / 自动循环 / 确定性导出接口 */
'use strict';

SF.units = {};
SF.bootFade = 0;
SF.export = null;
SF.time = 0;

/* ---------- 实例化四边形缓冲 ---------- */
SF.makeInstQuad = function (gl, data, stride, layout) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, SF.R.quadVB);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  for (const [loc, size, off] of layout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, SF.R.quadIB);
  gl.bindVertexArray(null);
  return { vao, count: data.length / stride };
};

SF.initStaticBuffers = function (gl) {
  const R = SF.R;
  // 共享四边形几何
  R.quadVB = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, R.quadVB);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1, -1, 1, 0, 1]), gl.STATIC_DRAW);
  R.quadIB = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.quadIB);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  const packBolts = arr => {
    const d = new Float32Array(arr.length * 13);
    arr.forEach((b, i) => {
      const o = i * 13;
      d.set(b.o, o); d.set(b.d, o + 3);
      d[o + 6] = b.t0; d[o + 7] = b.speed; d[o + 8] = b.life; d[o + 9] = b.size;
      d.set(b.c, o + 10);
    });
    return d;
  };
  const layoutB = [[1, 3, 0], [2, 3, 3], [3, 4, 6], [4, 3, 10]];
  R.boltBuf = SF.makeInstQuad(gl, packBolts(SF.fx.bolts), 13, layoutB);
  R.tracerBuf = SF.makeInstQuad(gl, packBolts(SF.fx.tracers), 13, layoutB);

  // 火花
  const rng = SF.mulberry32(99);
  const sparks = [];
  for (const ev of SF.fx.events) {
    if (!ev.p || ev.kind === 'beamHit' || ev.kind === 'ring') continue;
    const n = ev.kind === 'missile' ? 26 : ev.kind === 'pulse' ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const dir = SF.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
      const sp = (ev.kind === 'missile' ? 46 : ev.kind === 'pulse' ? 26 : 14) * (0.4 + rng());
      sparks.push({
        o: ev.p, v: SF.scale(dir, sp), t0: ev.t0, life: 0.5 + rng() * (ev.kind === 'missile' ? 1.6 : 0.8),
        s: ev.kind === 'missile' ? 1.6 + rng() * 2.2 : 0.7 + rng() * 1.1,
        c: rng() > 0.4 ? [1.0, 0.62, 0.25] : [1.0, 0.92, 0.75]
      });
    }
  }
  const sd = new Float32Array(sparks.length * 13);
  sparks.forEach((s, i) => {
    const o = i * 13;
    sd.set(s.o, o); sd.set(s.v, o + 3);
    sd[o + 6] = s.t0; sd[o + 7] = s.life; sd[o + 8] = s.s; sd.set(s.c, o + 9);
    sd[o + 12] = SF.travel(Math.min(s.t0, SF.LOOP));
  });
  R.sparkBuf = SF.makeInstQuad(gl, sd, 13, [[1, 3, 0], [2, 3, 3], [3, 3, 6], [4, 3, 9], [5, 1, 12]]);

  // 尘埃
  const dd = new Float32Array(SF.fx.dust.length * 5);
  SF.fx.dust.forEach((p, i) => { const o = i * 5; dd[o] = p.x; dd[o + 1] = p.y; dd[o + 2] = p.z; dd[o + 3] = p.s; dd[o + 4] = p.ph; });
  R.dustBuf = SF.makeInstQuad(gl, dd, 5, [[1, 4, 0], [2, 1, 4]]);

  // 动态缓冲的 VAO 布局（一次性配置）
  const fl = R.dynFlash;
  gl.bindVertexArray(fl.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, R.quadVB);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, fl.buf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 12); gl.vertexAttribDivisor(2, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.quadIB);
  for (const dyn of [R.dynTrail, R.dynHolo]) {
    gl.bindVertexArray(dyn.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 24);
  }
  gl.bindVertexArray(null);
};

/* ---------- 初始化 ---------- */
SF.init = function () {
  SF.initTravel();
  SF.buildFlagship();
  SF.shipGeo.guard = SF.buildEscort('guard');
  SF.shipGeo.picket = SF.buildEscort('picket');
  SF.shipGeo.guardFar = SF.buildEscort('guard', true);
  SF.shipGeo.picketFar = SF.buildEscort('picket', true);
  SF.shipGeo.guardSil = SF.buildEscort('guard', 2);
  SF.shipGeo.picketSil = SF.buildEscort('picket', 2);
  SF.shipGeo.ciws = SF.buildCIWSHead();
  SF.shipGeo.tip = SF.buildMissileTip();
  SF.shipGeo.missile = SF.buildMissile();
  SF.shipGeo.shuttle = SF.buildShuttle();
  SF.interGeo.bridge = SF.buildBridge();
  SF.interGeo.hangar = SF.buildHangar();
  SF.buildAtrium();
  SF.buildCorridor();
  SF.initFleet();
  SF.initShuttles();
  SF.initWorld();
  SF.initEffects();
  SF.initCamera();

  const canvas = document.getElementById('view');
  if (!SF.initRender(canvas)) return;
  const gl = SF.gl, U = SF.units;
  U.flagHull = SF.makeVoxelUnit(gl, SF.shipGeo.flagHull);
  U.flagBarrel = SF.makeVoxelUnit(gl, SF.shipGeo.flagBarrel);
  U.turretBase = SF.makeVoxelUnit(gl, SF.shipGeo.turretBase);
  U.turretHead = SF.makeVoxelUnit(gl, SF.shipGeo.turretHead);
  U.guard = SF.makeVoxelUnit(gl, SF.shipGeo.guard);
  U.picket = SF.makeVoxelUnit(gl, SF.shipGeo.picket);
  U.guardFar = SF.makeVoxelUnit(gl, SF.shipGeo.guardFar);
  U.picketFar = SF.makeVoxelUnit(gl, SF.shipGeo.picketFar);
  U.guardSil = SF.makeVoxelUnit(gl, SF.shipGeo.guardSil);
  U.picketSil = SF.makeVoxelUnit(gl, SF.shipGeo.picketSil);
  U.ciws = SF.makeVoxelUnit(gl, SF.shipGeo.ciws);
  U.tip = SF.makeVoxelUnit(gl, SF.shipGeo.tip);
  U.missile = SF.makeVoxelUnit(gl, SF.shipGeo.missile);
  U.shuttle = SF.makeVoxelUnit(gl, SF.shipGeo.shuttle);
  U.bridge = SF.makeVoxelUnit(gl, SF.interGeo.bridge);
  U.hangar = SF.makeVoxelUnit(gl, SF.interGeo.hangar);
  U.atrium = SF.makeVoxelUnit(gl, SF.interGeo.atriumShell);
  U.rings = SF.interGeo.rings.map(r => ({ unit: SF.makeVoxelUnit(gl, r.built), y: r.y, speed: r.speed }));
  U.corridor = SF.makeVoxelUnit(gl, SF.interGeo.corridorShell);
  U.conduit = SF.makeVoxelUnit(gl, SF.interGeo.conduit);
  U.arm = SF.makeVoxelUnit(gl, SF.interGeo.arm);
  U.eblock = SF.makeVoxelUnit(gl, SF.interGeo.energyBlock);
  U.rocks = SF.world.rocks.map(r => r.chunks.map(c => SF.makeVoxelUnit(gl, c.built)));
  U.minis = SF.world.minis.map(m => SF.makeVoxelUnit(gl, m.rock.chunks[0].built));
  SF.initStaticBuffers(gl);
  window.addEventListener('resize', () => SF.resize());
  console.log('fleet ready. voxels:',
    SF.shipGeo.flagHull.count + SF.shipGeo.flagBarrel.count,
    'flagship;', SF.world.rocks.reduce((s, r) => s + r.chunks.reduce((a, c) => a + c.built.count, 0), 0), 'rock');
};

/* ---------- 每帧场景 ---------- */
SF.KEY_DIR = SF.norm([-0.52, 0.6, -0.42]);
SF.KEY_COL = [1.0, 0.88, 0.72];
SF.AMB_UP = [0.16, 0.22, 0.32];
SF.AMB_DN = [0.03, 0.04, 0.06];

SF.renderFrame = function (t) {
  const gl = SF.gl, R = SF.R, U = SF.units, P = R.progs;
  t = ((t % SF.LOOP) + SF.LOOP) % SF.LOOP;
  const travel = SF.travel(t);
  const TL = SF.timeline;

  // 姿态
  const poses = { flag: SF.flagshipPose(t), escorts: [], shuttles: [] };
  SF.fleet.escorts.forEach(e => { poses.escorts[e.idx] = SF.shipPose(e, t); });
  SF.fleet.shuttles.forEach(s => { poses.shuttles.push(SF.shuttlePose(s, t)); });
  SF.fxCompute(t, poses);
  const FX = SF.fx;

  const cam = SF.cameraAt(t);
  const mode = cam.interior;
  const up = [Math.sin(cam.roll), Math.cos(cam.roll), 0];
  const view = SF.m4LookAt(cam.pos, cam.look, up);
  const aspect = R.w / R.h;
  const proj = SF.m4Persp(cam.fov, aspect, 0.5, 14000);
  const vp = SF.m4Mul(proj, view);
  const planes = SF.frustumPlanes(vp);
  const fwd = SF.norm(SF.sub(cam.look, cam.pos));
  const right = SF.norm(SF.cross(fwd, [0, 1, 0]));
  const upv = SF.cross(right, fwd);

  // 灯光
  const lights = FX.lights.slice();
  const addL = (p, c, i, r) => lights.push({ p, c, i, r });
  if (mode === 1) { addL([-42, 14, -100], [0.3, 0.8, 1], 0.6, 160); addL([-42, 8, 22], [1, 0.7, 0.3], 0.45, 120); addL([-76, 8, -210], [0.5, 0.8, 1], 0.35, 120); }
  if (mode === 2) { const C = SF.INTER.corridor; addL([C[0], 35, -60], [0.3, 0.8, 1], 0.7, 180); addL([C[0], 35, 120], [1, 0.7, 0.3], 0.6, 180); addL([C[0], 35, 195], [0.5, 0.9, 1], 1.2, 240); }
  if (mode === 3) { const A = SF.INTER.atrium; addL([A[0], 0, 0], [0.3, 0.85, 1], 1.5, 320); addL([A[0], 85, 0], [1, 0.7, 0.3], 0.6, 220); addL([A[0], -90, 0], [0.3, 0.8, 1], 0.5, 200); }
  if (mode === 4) { addL([0, 52, 128], [0.35, 0.85, 1], 0.5, 120); addL([0, 50, 186], [1, 0.85, 0.6], 0.35, 140); addL([0, 70, 100], [0.3, 0.7, 1], 0.2, 120); }
  const ln = Math.min(8, lights.length);
  const lArr = new Float32Array(32), lcArr = new Float32Array(24), lrArr = new Float32Array(8);
  for (let i = 0; i < ln; i++) {
    lArr.set(lights[i].p, i * 4); lArr[i * 4 + 3] = lights[i].i;
    lcArr.set(lights[i].c, i * 3); lrArr[i] = lights[i].r;
  }

  const fog = mode === 0 ? { c: [0.012, 0.02, 0.038], d: 0.00026 }
    : mode === 3 ? { c: [0.006, 0.012, 0.02], d: 0.0011 }
    : { c: [0.006, 0.01, 0.016], d: 0.0016 };

  /* ===== 主通道 ===== */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.samples ? R.msaa : R.resolve.f);
  gl.viewport(0, 0, R.w, R.h);
  gl.clearColor(fog.c[0], fog.c[1], fog.c[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  // 背景
  gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P.bg);
  gl.uniform3fv(P.bg.u.uRight, right); gl.uniform3fv(P.bg.u.uUp, upv); gl.uniform3fv(P.bg.u.uFwd, fwd);
  gl.uniform3fv(P.bg.u.uKeyDir, SF.KEY_DIR);
  gl.uniform1f(P.bg.u.uTan, Math.tan(cam.fov * Math.PI / 360));
  gl.uniform1f(P.bg.u.uAspect, aspect); gl.uniform1f(P.bg.u.uTime, t);
  gl.bindVertexArray(R.triVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

  // 体素
  gl.useProgram(P.voxel);
  gl.uniformMatrix4fv(P.voxel.u.uVP, false, vp);
  gl.uniform3fv(P.voxel.u.uCam, cam.pos);
  gl.uniform3fv(P.voxel.u.uKeyDir, SF.KEY_DIR);
  // 舱内无直射天光：主光衰减，由装置发光与点光组织明暗
  const kScale = mode === 0 ? 1 : 0.26;
  gl.uniform3f(P.voxel.u.uKeyCol, SF.KEY_COL[0] * kScale, SF.KEY_COL[1] * kScale, SF.KEY_COL[2] * kScale);
  gl.uniform3f(P.voxel.u.uAmbUp, SF.AMB_UP[0] * kScale, SF.AMB_UP[1] * kScale, SF.AMB_UP[2] * kScale);
  gl.uniform3f(P.voxel.u.uAmbDn, SF.AMB_DN[0] * kScale, SF.AMB_DN[1] * kScale, SF.AMB_DN[2] * kScale);
  gl.uniform3fv(P.voxel.u.uFogCol, fog.c);
  gl.uniform1f(P.voxel.u.uFogDen, fog.d);
  gl.uniform1f(P.voxel.u.uTime, t);
  gl.uniform4fv(P.voxel.u.uL, lArr);
  gl.uniform3fv(P.voxel.u.uLC, lcArr);
  gl.uniform1fv(P.voxel.u.uLR, lrArr);
  gl.uniform1i(P.voxel.u.uLN, ln);

  const drawU = (unit, m, pulse = 1, heat = 0) => {
    const c = SF.m4Point(m, unit.center);
    if (!SF.sphereVisible(planes, c, unit.radius)) return;
    gl.uniformMatrix4fv(P.voxel.u.uModel, false, m);
    gl.uniform1f(P.voxel.u.uPulse, pulse);
    gl.uniform1f(P.voxel.u.uHeat, heat);
    SF.drawVoxelUnit(gl, unit);
  };
  const I = SF.m4Ident();
  const T = p => SF.m4TRS(p, 0, 0, 0, 1);

  const exterior = mode === 0 || mode === 1 || mode === 4;
  const flagM = SF.m4TRS(poses.flag.p, poses.flag.yaw, poses.flag.pitch, poses.flag.roll, 1);
  if (exterior) {
    drawU(U.flagHull, flagM);
    drawU(U.flagBarrel, flagM, 0.4 + FX.beam.charge * 1.8);
    // 脉冲炮台
    SF.fleet.turrets.forEach((tu, i) => {
      const bob = Math.sin(SF.TAU / SF.LOOP * t * 3 + tu.phase * 4) * 2;
      const base = SF.add(tu.p, [0, bob, 0]);
      drawU(U.turretBase, T(base));
      const aim = FX.turretAim[i];
      drawU(U.turretHead, SF.m4TRS(SF.add(base, [0, 2, 0]), aim.yaw, aim.pitch, 0, 1), 1 + aim.flash * 0.8);
    });
    // 护卫舰
    const launched = new Set();
    FX.missiles.forEach(m => { if (t >= m.t0) launched.add(m.cellOwner + ':' + m.cellLocal.join(',')); });
    SF.fleet.escorts.forEach(e => {
      const po = poses.escorts[e.idx];
      const m = SF.m4TRS(po.p, po.yaw, po.pitch, po.roll, 1);
      const dist = SF.len(SF.sub(po.p, cam.pos));
      const unit = e.distant ? (e.type === 'guard' ? U.guardSil : U.picketSil)
        : e.type === 'guard' ? (dist > 1300 ? U.guardFar : U.guard) : (dist > 1300 ? U.picketFar : U.picket);
      drawU(unit, m);
      if (e.type === 'guard') {
        const aim = FX.ciwsAim[e.idx] || { yaw: 0, pitch: 0, flash: 0 };
        SF.fleet.anchors.guardMounts.forEach(mm => {
          const mw = SF.m4Point(m, mm);
          drawU(U.ciws, SF.m4TRS(mw, po.yaw + aim.yaw, po.pitch + aim.pitch, 0, 1), 1 + aim.flash * 0.7);
        });
      } else {
        SF.fleet.anchors.picketCells.forEach(cell => {
          if (launched.has(e.idx + ':' + cell.join(','))) return;
          drawU(U.tip, SF.m4TRS(SF.m4Point(m, cell), po.yaw, po.pitch, 0, 1));
        });
      }
    });
    // 小艇
    SF.fleet.shuttles.forEach((s, i) => {
      const po = poses.shuttles[i];
      drawU(U.shuttle, SF.m4TRS(po.p, po.yaw, po.pitch, po.roll, 1));
    });
    // 陨石
    const drawRocks = nextLoop => {
      SF.world.rocks.forEach((r, ri) => {
        const rp = SF.rockWorldPos(r, t, nextLoop);
        const heat = nextLoop ? 0 : SF.rockHeat(r, t);
        r.chunks.forEach((c, ci) => {
          let m;
          const fr = nextLoop ? Infinity : c.frac;
          if (t < fr) {
            m = T(SF.add(rp, c.rest));
          } else {
            const age = t - fr;
            const scroll = travel - SF.travel(Math.min(fr, SF.LOOP));
            const p = SF.add(SF.add(rp, c.rest), SF.add(SF.scale(c.vel, age), [0, 0, -scroll]));
            m = SF.m4TRS(p, 0, 0, 0, 1);
            const ang = c.spin * age;
            const rot = SF.m4AxisAngle(c.axis, ang);
            m = SF.m4Mul(T(p), rot);
          }
          drawU(U.rocks[ri][ci], m, 1, heat);
        });
      });
    };
    drawRocks(false);
    if (t > 66) drawRocks(true);
    // 近景漂浮岩
    SF.world.minis.forEach((mn, i) => {
      const z = ((mn.z0 - travel) % SF.travelTotal + SF.travelTotal) % SF.travelTotal - SF.travelTotal * 0.5;
      const p = [mn.x, mn.y, z];
      const m = SF.m4Mul(T(p), SF.m4AxisAngle([0.3, 1, 0.2], t * mn.spin));
      drawU(U.minis[i], m);
    });
    // 导弹实体
    FX.missileNow.forEach(mn => {
      if (!mn) return;
      const yaw = Math.atan2(mn.d[0], mn.d[2]), pitch = -Math.asin(SF.clamp(mn.d[1], -1, 1));
      drawU(U.missile, SF.m4TRS(mn.p, yaw, pitch, 0, 1), 1.3);
    });
    if (t > 34.5 && t < 44.5) drawU(U.bridge, I);
    if (t > 12 && t < 22.5) drawU(U.hangar, I);
  }
  if (mode === 2) {
    const C = SF.INTER.corridor;
    drawU(U.corridor, T(C));
    for (const s of [-1, 1]) {
      const z = C[2] + Math.sin(t * SF.TAU / 26 + s) * 24;
      drawU(U.conduit, T([C[0] + s * 14, 62, z]));
    }
    [[-45, 0], [95, 2.1]].forEach(([zz, ph]) => {
      for (const s of [-1, 1]) {
        const ang = Math.sin(t * SF.TAU / 13 + ph) * 0.42 * s;
        const m = SF.m4Mul(T([C[0] + s * 34, 8, C[2] + zz]), SF.m4AxisAngle([0, 0, 1], -ang));
        drawU(U.arm, m);
      }
    });
    for (let ch = 0; ch < 4; ch++) {
      const s = ch < 2 ? -1 : 1, y = ch % 2 ? 52 : 12;
      for (let i = 0; i < 4; i++) {
        const z = ((t * 26 + i * 90 + ch * 30) % 360) - 180;
        drawU(U.eblock, T([C[0] + s * 30, y, C[2] + z]), 1.2 + 0.3 * Math.sin(t * 3 + i));
      }
    }
  }
  if (mode === 3) {
    const A = SF.INTER.atrium;
    drawU(U.atrium, T(A));
    U.rings.forEach(r => {
      const m = SF.m4Mul(T([A[0], r.y, A[2]]), SF.m4AxisAngle([0, 1, 0], t * r.speed));
      drawU(r.unit, m, 1.1);
    });
  }
  if (mode === 4) drawU(U.bridge, I);

  /* =====  additive 光效 ===== */
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.disable(gl.CULL_FACE);

  const setCam2 = (p, extra) => {
    gl.uniform3fv(p.u.uCam, cam.pos);
    gl.uniform3fv(p.u.uRight, right);
    gl.uniform3fv(p.u.uUp, upv);
    gl.uniform1f(p.u.uTime, t);
  };

  if (exterior) {
    // 尾焰
    gl.useProgram(P.plume);
    gl.uniformMatrix4fv(P.plume.u.uVP, false, vp);
    gl.uniform1f(P.plume.u.uTime, t);
    gl.bindVertexArray(R.plumeMesh.vao);
    for (const pl of FX.plumes) {
      const d = pl.dir;
      const s = SF.norm(SF.cross(d, [0, 1, 0.001])), u2 = SF.cross(s, d);
      const m = [s[0] * pl.r, s[1] * pl.r, s[2] * pl.r, 0, d[0] * pl.len, d[1] * pl.len, d[2] * pl.len, 0,
        u2[0] * pl.r, u2[1] * pl.r, u2[2] * pl.r, 0, pl.p[0], pl.p[1], pl.p[2], 1];
      gl.uniformMatrix4fv(P.plume.u.uModel, false, m);
      gl.uniform1f(P.plume.u.uInt, pl.i);
      gl.drawElements(gl.TRIANGLES, R.plumeMesh.count, gl.UNSIGNED_SHORT, 0);
    }
    // 光束
    const bm = FX.beam;
    if (bm.on > 0.01) {
      gl.useProgram(P.beam);
      gl.uniformMatrix4fv(P.beam.u.uVP, false, vp);
      gl.uniform3fv(P.beam.u.uCam, cam.pos);
      gl.uniform1f(P.beam.u.uTime, t);
      const dir = SF.norm(SF.sub(bm.impact, bm.muzzle));
      const s = SF.norm(SF.cross(dir, [0, 1, 0.001])), u2 = SF.cross(s, dir);
      const start = SF.add(bm.muzzle, SF.scale(dir, bm.cut * 220));
      const len = bm.len - bm.cut * 220;
      const rad = (1 - bm.cut * 0.85) * (1 + 0.1 * Math.sin(t * 40));
      gl.bindVertexArray(R.beamMesh.vao);
      const passes = [[2.4 * rad, 0.95, 1], [8.5 * rad, 0.34, 0]];
      for (const [rr, aa, cc] of passes) {
        const m = [s[0] * rr, s[1] * rr, s[2] * rr, 0, u2[0] * rr, u2[1] * rr, u2[2] * rr, 0,
          dir[0] * len, dir[1] * len, dir[2] * len, 0, start[0], start[1], start[2], 1];
        gl.uniformMatrix4fv(P.beam.u.uModel, false, m);
        gl.uniform3f(P.beam.u.uCol, 0.35, 0.8, 1.0);
        gl.uniform1f(P.beam.u.uAlpha, aa * bm.on);
        gl.uniform1f(P.beam.u.uCore, cc);
        gl.drawElements(gl.TRIANGLES, R.beamMesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    // 能量弹 / 弹迹
    gl.useProgram(P.bolt);
    gl.uniformMatrix4fv(P.bolt.u.uVP, false, vp);
    setCam2(P.bolt);
    gl.uniform1f(P.bolt.u.uLen, 5.5);
    gl.bindVertexArray(R.boltBuf.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, R.boltBuf.count);
    gl.uniform1f(P.bolt.u.uLen, 8.0);
    gl.bindVertexArray(R.tracerBuf.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, R.tracerBuf.count);
    // 火花
    gl.useProgram(P.spark);
    gl.uniformMatrix4fv(P.spark.u.uVP, false, vp);
    setCam2(P.spark);
    gl.uniform1f(P.spark.u.uScroll, travel);
    gl.bindVertexArray(R.sparkBuf.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, R.sparkBuf.count);
    // 爆闪
    const fl = R.dynFlash;
    let fn = 0;
    const pushFlash = (p, r, a, hot, ring) => {
      if (fn >= fl.max - 8) return;
      const o = fn * 8;
      fl.data[o] = p[0]; fl.data[o + 1] = p[1]; fl.data[o + 2] = p[2];
      fl.data[o + 3] = r; fl.data[o + 4] = a; fl.data[o + 5] = hot; fl.data[o + 6] = ring; fl.data[o + 7] = 0;
      fn++;
    };
    for (const ev of FX.activeEvents) {
      if (ev.kind === 'ring') {
        const age = t - ev.t0;
        pushFlash(ev.p, ev.r * (1 + age * 7), (1 - SF.smooth(0, 0.6, age)) * 0.8, 1, 1);
        continue;
      }
      const v = SF.eventVisual(ev, t);
      if (v.a <= 0.01) continue;
      pushFlash(v.p, v.r, v.a * (ev.kind === 'ciws' ? 0.5 : 0.9), v.hot, 0);
      if (ev.kind === 'missile') {
        const age = t - ev.t0;
        pushFlash(ev.p, ev.r * (0.6 + age * 2.6), (1 - SF.smooth(0.1, 1.6, age)) * 0.55, v.hot, 1);
      }
    }
    if (FX.beam.charge > 0.02 && FX.beam.on < 0.5) pushFlash(FX.beam.muzzle, 5 + FX.beam.charge * 15, FX.beam.charge * 0.85, 1, 0);
    if (fn) {
      gl.useProgram(P.flash);
      gl.uniformMatrix4fv(P.flash.u.uVP, false, vp);
      gl.uniform3fv(P.flash.u.uRight, right); gl.uniform3fv(P.flash.u.uUp, upv);
      gl.bindBuffer(gl.ARRAY_BUFFER, fl.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, fl.data.subarray(0, fn * 8));
      gl.bindVertexArray(fl.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, fn);
    }
    // 导弹尾迹
    const tr = R.dynTrail;
    let tn = 0;
    const pushTrailVert = (p, u, v, a, mixv) => {
      const o = tn * 7;
      tr.data[o] = p[0]; tr.data[o + 1] = p[1]; tr.data[o + 2] = p[2];
      tr.data[o + 3] = u; tr.data[o + 4] = v; tr.data[o + 5] = a; tr.data[o + 6] = mixv;
      tn++;
    };
    for (const mn of FX.missileNow) {
      const m = mn ? mn.m : null;
      const missiles = m ? [mn] : [];
      for (const mm of missiles) {
        const N = 20;
        const u1 = mm.u, u0 = Math.max(0, u1 - 0.3);
        const fade = 1;
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const u = SF.lerp(u0, u1, i / N);
          const a = SF.lerp3(mm.m.p0, mm.m.p1, u), b = SF.lerp3(mm.m.p1, mm.m.p2, u);
          const p = SF.lerp3(a, b, u);
          const da = SF.sub(mm.m.p1, mm.m.p0), db = SF.sub(mm.m.p2, mm.m.p1);
          const d = SF.norm(SF.add(SF.scale(da, 1 - u), SF.scale(db, u)));
          const s = SF.norm(SF.cross(d, SF.norm(SF.sub(cam.pos, p))));
          const w = (2.6 * (i / N) + 0.3);
          const al = Math.pow(i / N, 1.5) * 0.8 * fade;
          const pL = SF.add(p, SF.scale(s, w)), pR = SF.sub(p, SF.scale(s, w));
          if (prev) {
            pushTrailVert(prev[0], 0, -1, prev[2], 1 - i / N);
            pushTrailVert(prev[1], 0, 1, prev[2], 1 - i / N);
            pushTrailVert(pL, 1, -1, al, 1 - i / N);
            pushTrailVert(prev[1], 0, 1, prev[2], 1 - i / N);
            pushTrailVert(pR, 1, 1, al, 1 - i / N);
            pushTrailVert(pL, 1, -1, al, 1 - i / N);
          }
          prev = [pL, pR, al];
        }
      }
    }
    // 残存尾迹（命中后短暂保留）
    for (const m of FX.missiles) {
      const age = t - (m.t0 + m.dur);
      if (age < 0 || age > 2.2) continue;
      const fade = 1 - SF.smooth(0.2, 2.2, age);
      const N = 16;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const u = SF.lerp(0.55, 1, i / N);
        const a = SF.lerp3(m.p0, m.p1, u), b = SF.lerp3(m.p1, m.p2, u);
        const p = SF.lerp3(a, b, u);
        const da = SF.sub(m.p1, m.p0), db = SF.sub(m.p2, m.p1);
        const d = SF.norm(SF.add(SF.scale(da, 1 - u), SF.scale(db, u)));
        const s = SF.norm(SF.cross(d, SF.norm(SF.sub(cam.pos, p))));
        const w = 2.2 * (i / N) + 0.4 + age * 1.5;
        const al = Math.pow(i / N, 1.3) * 0.5 * fade;
        const pL = SF.add(p, SF.scale(s, w)), pR = SF.sub(p, SF.scale(s, w));
        if (prev) {
          pushTrailVert(prev[0], 0, -1, prev[2], 0.8);
          pushTrailVert(prev[1], 0, 1, prev[2], 0.8);
          pushTrailVert(pL, 1, -1, al, 0.8);
          pushTrailVert(prev[1], 0, 1, prev[2], 0.8);
          pushTrailVert(pR, 1, 1, al, 0.8);
          pushTrailVert(pL, 1, -1, al, 0.8);
        }
        prev = [pL, pR, al];
      }
    }
    if (tn) {
      gl.useProgram(P.trail);
      gl.uniformMatrix4fv(P.trail.u.uVP, false, vp);
      gl.uniform3f(P.trail.u.uColA, 1.0, 0.55, 0.2);
      gl.uniform3f(P.trail.u.uColB, 0.9, 0.85, 0.75);
      gl.uniform1f(P.trail.u.uGain, 1.3);
      gl.bindBuffer(gl.ARRAY_BUFFER, tr.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, tr.data.subarray(0, tn * 7));
      gl.bindVertexArray(tr.vao);
      gl.drawArrays(gl.TRIANGLES, 0, tn);
    }
    // 尘埃
    gl.useProgram(P.dust);
    gl.uniformMatrix4fv(P.dust.u.uVP, false, vp);
    setCam2(P.dust);
    gl.uniform1f(P.dust.u.uTravel, travel);
    gl.uniform1f(P.dust.u.uTravelTotal, SF.travelTotal);
    gl.uniform1f(P.dust.u.uGlow, SF.bump(t, 47, 48.5, 58, 61));
    gl.bindVertexArray(R.dustBuf.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, R.dustBuf.count);
    // 护盾
    if (FX.shields.length) {
      gl.useProgram(P.shield);
      gl.uniformMatrix4fv(P.shield.u.uVP, false, vp);
      gl.uniform3fv(P.shield.u.uCam, cam.pos);
      gl.uniform1f(P.shield.u.uTime, t);
      gl.bindVertexArray(R.sphereMesh.vao);
      for (const sh of FX.shields) {
        const m = SF.m4Mul(SF.m4TRS(sh.p, sh.yaw, 0, 0, 1),
          [sh.radii[0], 0, 0, 0, 0, sh.radii[1], 0, 0, 0, 0, sh.radii[2], 0, 0, 0, 0, 1]);
        gl.uniformMatrix4fv(P.shield.u.uModel, false, m);
        gl.uniform1f(P.shield.u.uInt, sh.inten);
        gl.uniform1f(P.shield.u.uWave, sh.wave);
        gl.drawElements(gl.TRIANGLES, R.sphereMesh.count, gl.UNSIGNED_SHORT, 0);
      }
    }
  }
  // 舰桥全息投影
  if (mode === 4) {
    const ho = R.dynHolo;
    let hn = 0;
    const hv = (p, u, v, a, mixv) => {
      const o = hn * 7;
      ho.data[o] = p[0]; ho.data[o + 1] = p[1]; ho.data[o + 2] = p[2];
      ho.data[o + 3] = u; ho.data[o + 4] = v; ho.data[o + 5] = a; ho.data[o + 6] = mixv;
      hn++;
    };
    for (let i = 0; i < 26; i++) {
      const sx = SF.hash1(i * 3.7) * 30 - 15;
      const sy = 44 + SF.hash1(i * 9.1) * 12;
      const sz = 114 + ((SF.hash1(i * 5.3) * 28 + t * 2.4) % 28);
      const p = [sx, sy, sz];
      const s = 0.7 + SF.hash1(i * 2.2) * 0.8;
      const q = [SF.add(p, SF.scale(right, s)), SF.sub(p, SF.scale(right, s)), SF.add(p, SF.scale(upv, s)), SF.sub(p, SF.scale(upv, s))];
      const mixv = i % 4 === 0 ? 1 : 0;
      hv(q[0], -1, -1, 0.9, mixv); hv(q[1], 1, -1, 0.9, mixv); hv(q[2], 1, 1, 0.9, mixv);
      hv(q[0], -1, -1, 0.9, mixv); hv(q[2], 1, 1, 0.9, mixv); hv(q[3], -1, 1, 0.9, mixv);
      const tail = SF.sub(p, [0, 0, 3.5]);
      hv(p, 0.5, -0.4, 0.5, mixv); hv(p, 0.5, 0.4, 0.5, mixv); hv(tail, 0, -0.2, 0, mixv);
      hv(p, 0.5, 0.4, 0.5, mixv); hv(tail, 0, 0.2, 0, mixv); hv(tail, 0, -0.2, 0, mixv);
    }
    gl.useProgram(P.trail);
    gl.uniformMatrix4fv(P.trail.u.uVP, false, vp);
    gl.uniform3f(P.trail.u.uColA, 0.3, 0.85, 1.0);
    gl.uniform3f(P.trail.u.uColB, 1.0, 0.7, 0.3);
    gl.uniform1f(P.trail.u.uGain, 1.1);
    gl.bindBuffer(gl.ARRAY_BUFFER, ho.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ho.data.subarray(0, hn * 7));
    gl.bindVertexArray(ho.vao);
    gl.drawArrays(gl.TRIANGLES, 0, hn);
  }

  /* ===== 解析 + 泛光 + 合成 ===== */
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (R.samples) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.msaa);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.resolve.f);
    gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  const post = (prog, src, dst, uniforms) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(prog.u.uTex, 0);
    if (uniforms) uniforms(prog);
    gl.bindVertexArray(R.triVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  gl.disable(gl.DEPTH_TEST);
  post(P.bright, R.resolve.t, R.halfA, p => gl.uniform1f(p.u.uThr, R.floatOK ? 0.72 : 0.6));
  post(P.blur, R.halfA.t, R.halfB, p => gl.uniform2f(p.u.uDir, 1.4 / R.halfA.w, 0));
  post(P.blur, R.halfB.t, R.halfA, p => gl.uniform2f(p.u.uDir, 0, 1.4 / R.halfA.h));
  post(P.blur, R.halfA.t, R.quartA, p => gl.uniform2f(p.u.uDir, 2.6 / R.quartA.w, 0));
  post(P.blur, R.quartA.t, R.quartB, p => gl.uniform2f(p.u.uDir, 0, 2.6 / R.quartA.h));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R.w, R.h);
  gl.useProgram(P.comp);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.resolve.t); gl.uniform1i(P.comp.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.halfA.t); gl.uniform1i(P.comp.u.uBloomA, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.quartB.t); gl.uniform1i(P.comp.u.uBloomB, 2);
  gl.uniform1f(P.comp.u.uTime, t);
  gl.uniform1f(P.comp.u.uWipe, SF.wipeAt(t));
  gl.uniform1f(P.comp.u.uFade, SF.export ? 1 : SF.bootFade);
  gl.uniform2f(P.comp.u.uRes, R.w, R.h);
  gl.bindVertexArray(R.triVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();
};

/* ---------- 播放循环 ---------- */
SF.lastNow = 0;
SF.tick = function (now) {
  requestAnimationFrame(SF.tick);
  if (SF.export) { SF.lastNow = now; return; }
  const dt = Math.min(0.1, (now - SF.lastNow) / 1000);
  SF.lastNow = now;
  SF.time = (SF.time + dt) % SF.LOOP;
  SF.bootFade = Math.min(1, SF.bootFade + dt / 1.1);
  SF.renderFrame(SF.time);
};

/* ---------- 导出接口 ---------- */
window.videoExport = {
  runs: ['tour'],
  async begin(runId, opts) {
    const fps = (opts && opts.fps) || 60;
    SF.export = { fps, frames: Math.round(SF.LOOP * fps) };
    SF.bootFade = 1;
    SF.renderFrame(0);
    return { frames: SF.export.frames };
  },
  async frame(i) {
    SF.renderFrame(i / SF.export.fps);
  },
  end() {
    SF.export = null;
    SF.lastNow = performance.now();
  }
};

/* ---------- 启动 ---------- */
window.addEventListener('load', () => {
  try {
    SF.init();
    const boot = document.getElementById('boot');
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 1000);
    SF.lastNow = performance.now();
    requestAnimationFrame(SF.tick);
  } catch (err) {
    console.error(err);
    const boot = document.getElementById('boot');
    if (boot) boot.textContent = '初始化失败：' + err.message;
  }
});