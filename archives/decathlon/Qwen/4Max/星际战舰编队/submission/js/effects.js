/* 武器时间表 / 光效数据 / 护盾 / 尾焰 / 事件照明 —— 全部由全局时间确定 */
'use strict';

SF.fx = { events: [], lights: [], plumes: [], shields: [], missiles: [], beam: {} };

SF.flagshipPose = function (t) {
  const w = SF.TAU / SF.LOOP;
  return { p: [Math.sin(w * t) * 1.5, Math.sin(w * t * 2 + 1) * 1.5, 0], yaw: 0, pitch: 0, roll: Math.sin(w * t + 2) * 0.004 };
};

SF.initEffects = function () {
  const FX = SF.fx, rng = SF.mulberry32(4242);
  const W = SF.world;

  /* ---------- 脉冲炮台弹组 ---------- */
  const bolts = [];
  const pulseTargets = [3, 4, 5, 6, 7, 3, 4, 5];
  SF.fleet.turrets.forEach((tu, ti) => {
    const target = W.rocks[pulseTargets[ti]];
    for (let burst = 0; burst < 6; burst++) {
      const tBurst = 48.4 + ti * 0.22 + burst * 0.86;
      for (let k = 0; k < 5; k++) {
        const t0 = tBurst + k * 0.09;
        const origin = SF.add(tu.p, [0, 4, 14]);
        const tImp = t0 + 1.6;
        const tp = SF.rockWorldPos(target, tImp);
        const aim = SF.add(tp, [(rng() - 0.5) * target.r, (rng() - 0.5) * target.r, (rng() - 0.5) * target.r * 0.5]);
        const dir = SF.norm(SF.sub(aim, origin));
        const dist = SF.len(SF.sub(aim, origin));
        const speed = 540;
        bolts.push({ o: origin, d: dir, t0, speed, life: dist / speed, size: 2.6, c: [0.55, 0.92, 1.0] });
        FX.events.push({ t0: t0 + dist / speed, p: SF.sub(aim, SF.scale(dir, target.r * 0.5)), r: 13 + rng() * 8, kind: 'pulse' });
      }
    }
  });
  FX.bolts = bolts;

  /* ---------- 近防弹流 ---------- */
  const tracers = [];
  const ciwsTargets = [8, 9, 10, 11, 12, 13, 14];
  SF.fleet.escorts.filter(e => e.type === 'guard').forEach((e, gi) => {
    const mounts = SF.fleet.anchors.guardMounts;
    mounts.forEach((m, mi) => {
      const target = W.rocks[ciwsTargets[(gi + mi) % ciwsTargets.length]];
      for (let burst = 0; burst < 4; burst++) {
        const tBurst = 49.7 + gi * 0.18 + mi * 0.13 + burst * 0.55;
        for (let k = 0; k < 8; k++) {
          const t0 = tBurst + k * 0.07;
          const pose = SF.shipPose(e, t0);
          const mm = SF.m4TRS(pose.p, pose.yaw, pose.pitch, pose.roll, 1);
          const mw = SF.m4Point(mm, m);
          const tImp = t0 + 1.1;
          const tp = SF.rockWorldPos(target, tImp);
          const aim = SF.add(tp, [(rng() - 0.5) * target.r * 1.4, (rng() - 0.5) * target.r * 1.4, 0]);
          const dir = SF.norm(SF.sub(aim, mw));
          const dist = SF.len(SF.sub(aim, mw));
          tracers.push({ o: SF.add(mw, SF.scale(dir, 9)), d: dir, t0, speed: 980, life: dist / 980, size: 0.8, c: [1.0, 0.78, 0.4] });
          if (k % 3 === 0) FX.events.push({ t0: t0 + dist / 980, p: aim, r: 4.5, kind: 'ciws' });
        }
      }
    });
  });
  FX.tracers = tracers;

  /* ---------- 导弹 ---------- */
  const firingPickets = SF.fleet.escorts.filter(e => e.type === 'picket').slice(0, 4);
  let mk = 0;
  for (const e of firingPickets) {
    for (let j = 0; j < 4; j++) {
      const t0 = 50.2 + mk * 0.26;
      const target = W.rocks[mk % 2 === 0 ? 1 : 2];
      const cell = SF.fleet.anchors.picketCells[(j * 3 + mk) % 12];
      const pose = SF.shipPose(e, t0);
      const mm = SF.m4TRS(pose.p, pose.yaw, pose.pitch, pose.roll, 1);
      const p0 = SF.m4Point(mm, cell);
      const dur = 3.9 + rng() * 0.8;
      const tImp = t0 + dur;
      const tp = SF.rockWorldPos(target, tImp);
      const surf = SF.add(tp, SF.scale(SF.norm([(rng() - 0.5), (rng() - 0.5), -0.6]), target.r * 0.72));
      const mid = SF.lerp3(p0, surf, 0.5);
      const side = (mk % 2 ? 1 : -1);
      const p1 = SF.add(mid, [side * (120 + rng() * 160), 90 + rng() * 160, -60]);
      FX.missiles.push({ p0, p1, p2: surf, t0, dur, target, idx: mk, cellOwner: e.idx, cellLocal: cell });
      FX.events.push({ t0: tImp, p: surf, r: 52 + rng() * 16, kind: 'missile' });
      mk++;
    }
  }
  // 光束命中持续灼烧 + 起射光环
  FX.events.push({ t0: 47.6, p: null, r: 40, kind: 'beamHit', until: 53.0 });
  FX.events.push({ t0: 47.42, p: SF.fleet.anchors.muzzle.slice(), r: 16, kind: 'ring' });

  /* ---------- 护盾参数 ---------- */
  FX.shieldDefs = [{ flagship: true, radii: [96, 72, 648], delay: 0 }];
  SF.fleet.escorts.forEach(e => {
    const d = Math.hypot(e.base[0], e.base[1], e.base[2] * 0.35);
    FX.shieldDefs.push({ e, radii: e.type === 'guard' ? [42, 26, 104] : [36, 20, 118], delay: 0.18 + d / 1400 });
  });

  /* ---------- 尘埃种子 ---------- */
  const dust = [];
  for (let i = 0; i < 950; i++) {
    dust.push({ x: (rng() - 0.5) * 1800, y: (rng() - 0.5) * 800, z: rng() * SF.travelTotal, s: 0.5 + rng() * 1.9, ph: rng() * SF.TAU });
  }
  FX.dust = dust;

  FX.beamTarget = W.rocks[0];
};

/* 每帧计算：瞄准 / 光束 / 导弹 / 尾焰 / 护盾 / 灯光 */
SF.fxCompute = function (t, poses) {
  const FX = SF.fx, TL = SF.timeline;
  const boost = TL.boost(t);

  // 光束主炮
  const charge = SF.smooth(45.5, 47.3, t) * (1 - SF.smooth(52.7, 53.4, t));
  const on = SF.smooth(47.35, 47.62, t) * (1 - SF.smooth(52.5, 52.85, t));
  const cut = SF.smooth(52.6, 53.35, t);
  const muzzle = SF.add(SF.fleet.anchors.muzzle, poses.flag.p);
  const bt = SF.fx.beamTarget;
  const tp = SF.rockWorldPos(bt, t);
  const impact = SF.add(tp, [0, -6, -bt.r * 0.72]);
  FX.beam = { charge, on, cut, muzzle, impact, len: SF.len(SF.sub(impact, muzzle)) };

  // 炮台瞄准
  FX.turretAim = SF.fleet.turrets.map((tu, i) => {
    const active = SF.bump(t, 48.2 + i * 0.22, 48.8 + i * 0.22, 54.2, 55.0);
    const target = SF.rockWorldPos(SF.world.rocks[[3, 4, 5, 6, 7, 3, 4, 5][i]], t);
    const d = SF.norm(SF.sub(target, tu.p));
    return { yaw: Math.atan2(d[0], d[2]) * active, pitch: -Math.asin(d[1]) * active, flash: active };
  });
  // 近防瞄准
  FX.ciwsAim = {};
  SF.fleet.escorts.forEach(e => {
    if (e.type !== 'guard') return;
    const active = SF.bump(t, 49.6 + e.idx * 0.18, 50.1 + e.idx * 0.18, 56.0, 56.8);
    const target = SF.rockWorldPos(SF.world.rocks[8 + (e.idx % 7)], t);
    const d = SF.norm(SF.sub(target, poses.escorts[e.idx].p));
    FX.ciwsAim[e.idx] = { yaw: Math.atan2(d[0], d[2]) * active, pitch: -Math.asin(d[1]) * active, flash: active };
  });

  // 导弹位置
  FX.missileNow = FX.missiles.map(m => {
    const u = SF.clamp((t - m.t0) / m.dur, 0, 1);
    if (t < m.t0 || u >= 1) return null;
    const a = SF.lerp3(m.p0, m.p1, u), b = SF.lerp3(m.p1, m.p2, u);
    const p = SF.lerp3(a, b, u);
    const da = SF.sub(m.p1, m.p0), db = SF.sub(m.p2, m.p1);
    const d = SF.norm(SF.add(SF.scale(da, 1 - u), SF.scale(db, u)));
    return { p, d, u, m };
  });

  // 尾焰
  FX.plumes = [];
  const addPlume = (p, yaw, pitch, r, k) => {
    const dir = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    FX.plumes.push({ p, dir: SF.scale(dir, -1), len: r * (4.2 + boost * 10) * k, r: r * 0.82, i: 0.62 + boost * 0.75 });
  };
  SF.fleet.anchors.nozzles.forEach(n => addPlume(SF.add(n.p, poses.flag.p), 0, 0, n.r, 1));
  poses.shuttles.forEach((sp, i) => { // 小艇尾焰
    if (SF.fleet.shuttles[i].parked) return;
    const back = [Math.sin(sp.yaw) * Math.cos(sp.pitch), -Math.sin(sp.pitch), Math.cos(sp.yaw) * Math.cos(sp.pitch)];
    addPlume(SF.sub(sp.p, SF.scale(back, 14)), sp.yaw, sp.pitch, 1.5, 0.4);
  });
  SF.fleet.escorts.forEach(e => {
    const po = poses.escorts[e.idx];
    const nz = e.type === 'guard' ? SF.fleet.anchors.guardNozzles : SF.fleet.anchors.picketNozzles;
    const mm = SF.m4TRS(po.p, po.yaw, po.pitch, po.roll, 1);
    nz.forEach(n => addPlume(SF.m4Point(mm, [n[0], n[1], n[2]]), po.yaw, po.pitch, n[3], 0.8));
  });

  // 护盾
  const shieldGlobal = TL.shield(t);
  FX.shields = FX.shieldDefs.map(sd => {
    const dep = SF.smooth(60.4 + sd.delay, 61.3 + sd.delay, t);
    const inten = shieldGlobal * (t < 7 ? 1 : dep);
    if (inten < 0.004) return null;
    const p = sd.flagship ? poses.flag.p : poses.escorts[sd.e.idx].p;
    const pose = sd.flagship ? poses.flag : poses.escorts[sd.e.idx];
    return { p, radii: sd.radii, yaw: pose.yaw, inten, deploy: t < 7 ? 1 : dep, wave: t < 7 ? 1 : SF.clamp((t - 60.4 - sd.delay) / 0.9, 0, 1) };
  }).filter(Boolean);

  // 事件照明
  FX.lights = [];
  const push = (p, c, i, r) => { if (i > 0.01) FX.lights.push({ p, c, i, r }); };
  push(FX.beam.impact, [0.5, 0.9, 1.0], on * 3.4 * (1 + 0.25 * Math.sin(t * 37)), 600);
  push(muzzle, [1.0, 0.7, 0.3], charge * 2.2, 300);
  push(SF.add(poses.flag.p, [0, 0, -560]), [0.35, 0.8, 1.0], 0.8 + boost * 2.4, 500);
  let exCount = 0;
  for (const ev of FX.events) {
    if (ev.kind === 'beamHit' || !ev.p) continue;
    const age = t - ev.t0;
    if (age > 0 && age < 1.4 && exCount < 4) {
      const I = (ev.kind === 'missile' ? 5.5 : ev.kind === 'pulse' ? 2.2 : 0.8) * (1 - SF.smooth(0.05, 1.3, age));
      push(ev.p, [1.0, 0.62, 0.28], I, ev.r * 9);
      exCount++;
    }
  }
  if (shieldGlobal > 0.05 && t > 60) push(SF.add(poses.flag.p, [0, 30, 0]), [0.3, 1.0, 0.75], shieldGlobal * 0.7, 900);

  // 爆炸激活列表
  FX.activeEvents = FX.events.filter(ev => {
    if (ev.kind === 'beamHit') return t >= ev.t0 && t <= ev.until;
    const age = t - ev.t0;
    return age > -0.02 && age < (ev.kind === 'missile' ? 2.4 : 1.5);
  });
};

/* 导出用：事件光斑 / 火花参数（供渲染器生成 billboard） */
SF.eventVisual = function (ev, t) {
  const age = t - ev.t0;
  if (ev.kind === 'beamHit') {
    const bp = SF.fx.beam;
    return { p: bp.impact, r: ev.r * (0.8 + 0.2 * Math.sin(t * 29)), a: bp.on * 0.9, hot: 1 };
  }
  const grow = SF.smooth(0, 0.12, age);
  const fade = 1 - SF.smooth(ev.kind === 'missile' ? 0.3 : 0.12, ev.kind === 'missile' ? 2.2 : 1.1, age);
  return { p: ev.p, r: ev.r * (0.35 + grow * 0.9 + age * 0.5), a: fade, hot: Math.max(0, 1 - age * 2.2) };
};