'use strict';
/* =====================================================================
   battle.js — 陨石群、四种武器、命中碎裂、护盾、粒子
   全部状态为全局时间 t 的纯函数（确定性）
   ===================================================================== */

const ROCK = PAL.rock, ROCKL = PAL.rockLight, ROCKD = PAL.rockDark, ROCKDP = PAL.rockDeep;

/* ---------------- 陨石 ---------------- */
function makeAsteroid(rng, pos, r, seed) {
  const chunks = [];
  const step = Math.max(5, r / 3.0);
  const cols = [ROCK, ROCK, ROCKD, ROCKL, ROCKD];
  for (let x = -r; x <= r; x += step) {
    for (let y = -r; y <= r; y += step) {
      for (let z = -r; z <= r; z += step) {
        const jx = x + (rng() - 0.5) * step * 0.55;
        const jy = y + (rng() - 0.5) * step * 0.55;
        const jz = z + (rng() - 0.5) * step * 0.55;
        const d = Math.hypot(jx / r, jy / (r * 0.82), jz / r) + (rng() - 0.5) * 0.22;
        if (d > 1.02) continue;
        if (rng() < 0.10) continue;
        const s = step * (0.92 + rng() * 0.22);
        chunks.push({
          home: [pos[0] + jx, pos[1] + jy, pos[2] + jz],
          size: [s, s * (0.8 + rng() * 0.4), s],
          color: cols[Math.floor(rng() * cols.length)],
          rot: quatFromYawPitchRoll(rng() * TAU, rng() * TAU, rng() * TAU),
          axis: V3.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]),
          ang: 0.2 + rng() * 1.4,
          vel: [0, 0, 0],
          breakTime: 1e9,
          group: 0,
        });
      }
    }
  }
  return { pos, r, chunks, seed };
}

function buildAsteroids() {
  const rng = mulberry32(20240607);
  const list = [];
  // 镜头航道（第八段相机位置），陨石避开
  const lanes = [
    [2650, 320, 1450], [2580, 290, 1380], [2500, 260, 1300], [2400, 230, 1200], [1500, 200, 900],
    [200, 150, 780], [-566, 78, 680], [-260, 60, 500],
  ];
  const clear = (p, r) => {
    for (const L of lanes) {
      const d = Math.hypot(p[0] - L[0], p[1] - L[1], p[2] - L[2]);
      if (d < r + 320) return false;
    }
    return true;
  };
  // 环境陨石（不碎裂）
  for (let i = 0; i < 26; i++) {
    const big = i < 6;
    const r = big ? 60 + rng() * 90 : 18 + rng() * 40;
    let pos = [1400 + rng() * 2200, (rng() * 2 - 1) * 340, (rng() * 2 - 1) * 720];
    let guard = 0;
    while (!clear(pos, r) && guard++ < 20) {
      pos = [1400 + rng() * 2200, (rng() * 2 - 1) * 340, (rng() * 2 - 1) * 720];
    }
    const a = makeAsteroid(rng, pos, r, i);
    a.breakTime = 1e9;
    list.push(a);
  }
  // 目标陨石
  const targets = [
    { pos: [1900, 40, -140], r: 130, breakTime: 60.6, kind: 'beam' },
    { pos: [2120, -70, 190], r: 100, breakTime: 61.8, kind: 'pulse' },
    { pos: [2440, 100, -30], r: 150, breakTime: 66.6, kind: 'missile' },
    { pos: [1720, -140, -300], r: 85, breakTime: 62.8, kind: 'pulse' },
    { pos: [1560, 160, 240], r: 60, breakTime: 63.4, kind: 'ciws' },
    { pos: [1480, -40, 420], r: 55, breakTime: 64.2, kind: 'ciws' },
  ];
  for (const tg of targets) {
    const a = makeAsteroid(rng, tg.pos, tg.r, tg.pos[0]);
    a.breakTime = tg.breakTime;
    a.kind = tg.kind;
    // 断裂方向：由命中方向决定
    const impact = tg.kind === 'beam' ? [566, 0, 0] : [tg.pos[0] - tg.r * 2, tg.pos[1], tg.pos[2]];
    const n = V3.norm(V3.sub(tg.pos, impact));
    a.normal = n;
    for (const c of a.chunks) {
      const side = V3.dot(V3.sub(c.home, tg.pos), n) > 0 ? 1 : -1;
      const sp = 14 + rng() * 30;
      c.vel = [
        n[0] * side * sp + (rng() - 0.5) * 22,
        n[1] * side * sp + (rng() - 0.5) * 22 + 6,
        n[2] * side * sp + (rng() - 0.5) * 22,
      ];
      c.breakTime = tg.breakTime + rng() * 0.8;
      c.group = side;
    }
    list.push(a);
  }
  // 近处小岩块（近防炮目标）
  for (let i = 0; i < 16; i++) {
    const r = 5 + rng() * 10;
    let pos = [1150 + rng() * 700, (rng() * 2 - 1) * 260, (rng() * 2 - 1) * 520];
    let guard = 0;
    while (!clear(pos, r) && guard++ < 20) {
      pos = [1150 + rng() * 700, (rng() * 2 - 1) * 260, (rng() * 2 - 1) * 520];
    }
    const a = makeAsteroid(rng, pos, r, 9000 + i);
    a.breakTime = 62 + rng() * 5;
    a.kind = 'ciws';
    const n = V3.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    a.normal = n;
    for (const c of a.chunks) {
      const side = V3.dot(V3.sub(c.home, pos), n) > 0 ? 1 : -1;
      c.vel = [n[0] * side * 22 + (rng() - 0.5) * 16, n[1] * side * 22 + (rng() - 0.5) * 16, n[2] * side * 22 + (rng() - 0.5) * 16];
      c.breakTime = a.breakTime + rng() * 0.5;
    }
    list.push(a);
  }
  return list;
}

/* ---------------- 战斗系统 ---------------- */
function createBattle(gl, world) {
  const asteroids = buildAsteroids();
  const debrisMax = 4000;
  const debrisBatch = new VoxelBatch(gl, debrisMax);
  const dynAdd = new VoxelBatch(gl, 6000);
  const dynOpaque = new VoxelBatch(gl, 2000);
  const particles = world.particles;

  const B = {
    asteroids, debrisBatch, dynAdd, dynOpaque, particles,
    shieldMesh: new ShieldMesh(gl, [26, 18]),
    beam: { t0: 58.4, t1: 66.6, charge: 56.8, from: [566, 0, 0], target: 0 },
    events: [],
  };

  /* ---- 粒子预计算 ---- */
  buildParticles(B, world);

  /* ---- 武器事件 ---- */
  buildWeapons(B, world);

  return B;
}

/* 引擎尾焰粒子（连续） */
function buildParticles(B, world) {
  const P = B.particles;
  P.clear();
  const rng = mulberry32(8888);
  const ships = [world.fleet.flagship, ...world.fleet.escorts, ...world.fleet.distant];
  // 引擎粒子
  for (const s of ships) {
    const n = s.kind === 'flagship' ? 90 : (s.kind === 'boat' ? 8 : 34);
    for (const e of s.engines) {
      for (let i = 0; i < n; i++) {
        const t0 = rng() * DURATION;
        const dur = 0.8 + rng() * 1.6;
        const wp = [s.pos[0] + e.pos[0], s.pos[1] + e.pos[1], s.pos[2] + e.pos[2]];
        const sp = 60 + rng() * 120;
        P.spawn(t0, dur, wp[0], wp[1] + (rng() - 0.5) * e.r, wp[2] + (rng() - 0.5) * e.r,
          -sp, (rng() - 0.5) * 14, (rng() - 0.5) * 14,
          {
            s0: e.r * (0.5 + rng() * 0.6), s1: e.r * (1.4 + rng() * 1.6),
            r: 0.55 + rng() * 0.35, g: 0.42 + rng() * 0.3, b: 0.25 + rng() * 0.3,
            drag: 0.6, fade: 1.4,
          });
      }
    }
  }
  // 环境漂浮尘（近处快速后掠）
  for (let i = 0; i < 900; i++) {
    const t0 = rng() * DURATION;
    const x = 600 + rng() * 2600, y = (rng() * 2 - 1) * 500, z = (rng() * 2 - 1) * 900;
    P.spawn(t0, 2 + rng() * 4, x, y, z, -180 - rng() * 420, (rng() - 0.5) * 20, (rng() - 0.5) * 20,
      { s0: 1 + rng() * 3, s1: 0.5, r: 0.5, g: 0.55, b: 0.65, drag: 0, fade: 1.6, acc: 1 });
  }
  // 命中/碎裂粒子由 buildWeapons 追加
}

/* 武器与事件 */
function buildWeapons(B, world) {
  const P = B.particles;
  const rng = mulberry32(4455);
  const fleet = world.fleet;
  const targets = B.asteroids.filter(a => a.kind);

  /* 光束主炮：命中点粒子 + 炮口光 */
  const A = targets.find(a => a.kind === 'beam');
  const beamDir = V3.norm(V3.sub(A.pos, B.beam.from));
  const hitA = V3.add(A.pos, V3.scale(beamDir, -A.r * 0.55));
  B.beamHit = hitA;
  for (let i = 0; i < 260; i++) {
    const t0 = B.beam.t0 + rng() * (B.beam.t1 - B.beam.t0);
    const life = 0.5 + rng() * 1.2;
    P.spawn(t0, life, hitA[0], hitA[1], hitA[2],
      (rng() - 0.5) * 90, (rng() - 0.5) * 90, (rng() - 0.5) * 90,
      { s0: 3 + rng() * 7, s1: 1, r: 1.0, g: 0.85, b: 0.6, drag: 1.2, fade: 1.2 });
  }
  // 炮口蓄能粒子
  for (let i = 0; i < 120; i++) {
    const t0 = B.beam.charge + rng() * (B.beam.t0 - B.beam.charge);
    const a = rng() * TAU, rr = 6 + rng() * 22;
    P.spawn(t0, 0.5 + rng() * 0.4, B.beam.from[0] + Math.cos(a) * rr, B.beam.from[1] + Math.sin(a) * rr, B.beam.from[2] + (rng() - 0.5) * rr,
      -Math.cos(a) * 40, -Math.sin(a) * 40, 0,
      { s0: 2 + rng() * 4, s1: 0.6, r: 0.7, g: 0.95, b: 1.0, drag: 2, fade: 1.5 });
  }

  /* 脉冲炮台：能量弹 */
  const pulseTurrets = [];
  for (const s of [fleet.flagship, ...fleet.escorts]) {
    for (const tr of s.turrets) {
      if (tr.kind !== 'pulse') continue;
      pulseTurrets.push({ ship: s, tr });
    }
  }
  B.pulseTurrets = pulseTurrets;
  const boltTarget = [targets.find(a => a.kind === 'pulse'), targets.find(a => a.kind === 'pulse' && a.pos[2] > 0)];
  for (let i = 0; i < pulseTurrets.length; i++) {
    const pt = pulseTurrets[i];
    const tg = boltTarget[i % 2] || targets[0];
    const wm = shipMatrix(pt.ship, 0);
    const mp = quatRotate(wm.quat, pt.tr.pivot);
    const muz = [wm.m[12] + mp[0], wm.m[13] + mp[1], wm.m[14] + mp[2]];
    const aim = V3.sub(tg.pos, muz);
    const dist = V3.len(aim);
    const dir = V3.scale(aim, 1 / dist);
    const speed = 820;
    for (let k = 0; k < 9; k++) {
      const t0 = 60.2 + i * 0.09 + k * 0.13 + rng() * 0.05;
      B.events.push({
        type: 'bolt', t0, dur: dist / speed,
        from: muz, dir, speed,
        col: [0.65, 0.95, 1.0], size: 3.2, len: 16,
      });
      // 命中闪
      P.spawn(t0 + dist / speed, 0.35, tg.pos[0], tg.pos[1], tg.pos[2],
        (rng() - 0.5) * 30, (rng() - 0.5) * 30, (rng() - 0.5) * 30,
        { s0: 8 + rng() * 8, s1: 1, r: 0.8, g: 0.95, b: 1.0, drag: 2, fade: 1.2 });
    }
    // 炮口闪
    for (let k = 0; k < 9; k++) {
      const t0 = 60.2 + i * 0.09 + k * 0.13;
      P.spawn(t0, 0.12, muz[0] + dir[0] * 18, muz[1] + dir[1] * 18, muz[2] + dir[2] * 18,
        0, 0, 0, { s0: 6, s1: 1, r: 0.7, g: 0.95, b: 1.0, drag: 0, fade: 1 });
    }
  }

  /* 近防炮：细密弹流 */
  const ciwsShips = fleet.escorts.filter(s => s.kind === 'close');
  const smallTargets = B.asteroids.filter(a => a.kind === 'ciws');
  B.ciws = [];
  for (let i = 0; i < ciwsShips.length; i++) {
    const s = ciwsShips[i];
    for (let ti = 0; ti < s.turrets.length; ti++) {
      const tr = s.turrets[ti];
      const tg = smallTargets[(i * 2 + ti) % smallTargets.length];
      const wm = shipMatrix(s, 0);
      const mp = quatRotate(wm.quat, tr.pivot);
      const muz = [wm.m[12] + mp[0], wm.m[13] + mp[1], wm.m[14] + mp[2]];
      const aim = V3.sub(tg.pos, muz);
      const dist = V3.len(aim);
      const dir = V3.scale(aim, 1 / dist);
      const speed = 1250;
      for (let k = 0; k < 22; k++) {
        const t0 = 61.6 + i * 0.16 + ti * 0.07 + k * 0.055 + rng() * 0.02;
        B.events.push({
          type: 'tracer', t0, dur: dist / speed,
          from: muz, dir, speed,
          col: [1.0, 0.85, 0.55], size: 1.5, len: 14,
        });
      }
      for (let k = 0; k < 8; k++) {
        const t0 = 61.6 + i * 0.16 + ti * 0.07 + rng() * 1.2;
        P.spawn(t0, 0.1, muz[0] + dir[0] * 16, muz[1] + dir[1] * 16, muz[2] + dir[2] * 16,
          0, 0, 0, { s0: 5, s1: 0.8, r: 1.0, g: 0.9, b: 0.6, drag: 0, fade: 1 });
      }
      // 击中碎屑
      for (let k = 0; k < 14; k++) {
        const t0 = 62.4 + i * 0.16 + rng() * 2.2;
        P.spawn(t0, 0.5 + rng() * 0.5, tg.pos[0] + (rng() - 0.5) * 8, tg.pos[1] + (rng() - 0.5) * 8, tg.pos[2] + (rng() - 0.5) * 8,
          (rng() - 0.5) * 60, (rng() - 0.5) * 60, (rng() - 0.5) * 60,
          { s0: 1.5 + rng() * 2, s1: 0.4, r: 1.0, g: 0.8, b: 0.5, drag: 1.5, fade: 1.2 });
      }
    }
  }

  /* 导弹 */
  const vangs = fleet.escorts.filter(s => s.kind === 'vanguard');
  const missileTargets = [targets.find(a => a.kind === 'missile'), targets.find(a => a.kind === 'beam'), targets.find(a => a.kind === 'pulse')];
  B.missiles = [];
  let mi = 0;
  for (let i = 0; i < vangs.length; i++) {
    const s = vangs[i];
    const tubes = s.missileTubes || [];
    for (let k = 0; k < Math.min(3, tubes.length); k++) {
      const tube = tubes[k * 3 % tubes.length];
      const wm = shipMatrix(s, 0);
      const tp = quatRotate(wm.quat, tube.pos);
      const from = [wm.m[12] + tp[0], wm.m[13] + tp[1], wm.m[14] + tp[2]];
      const tg = missileTargets[mi % missileTargets.length];
      const t0 = 63.0 + mi * 0.28;
      const dur = 2.6 + (mi % 3) * 0.35;
      const ctrl = [lerp(from[0], tg.pos[0], 0.45), from[1] + 120 + (mi % 4) * 40, lerp(from[2], tg.pos[2], 0.45) - 80];
      B.missiles.push({ from, ctrl, to: tg.pos, t0, dur, seed: rng() * 10 });
      // 尾迹粒子
      for (let j = 0; j < 70; j++) {
        const tt = j / 70;
        const p = bez(from, ctrl, tg.pos, tt);
        P.spawn(t0 + tt * dur, 0.7 + rng() * 0.7, p[0], p[1], p[2],
          (rng() - 0.5) * 12, (rng() - 0.5) * 12, (rng() - 0.5) * 12,
          { s0: 2.5 + rng() * 3, s1: 5 + rng() * 5, r: 1.0, g: 0.72, b: 0.4, drag: 0.8, fade: 1.5 });
      }
      // 命中爆炸
      for (let j = 0; j < 90; j++) {
        const tt = j / 90;
        P.spawn(t0 + dur + tt * 0.9, 0.7 + rng() * 1.2, tg.pos[0], tg.pos[1], tg.pos[2],
          (rng() - 0.5) * 150, (rng() - 0.5) * 150, (rng() - 0.5) * 150,
          { s0: 8 + rng() * 12, s1: 1.5, r: 1.0, g: 0.8, b: 0.5, drag: 1.4, fade: 1.1 });
      }
      mi++;
    }
  }
  B.missileCount = mi;

  /* 碎裂时的尘屑 */
  for (const a of B.asteroids) {
    if (!a.kind) continue;
    for (let j = 0; j < 40; j++) {
      const t0 = a.breakTime + rng() * 1.2;
      P.spawn(t0, 1 + rng() * 2, a.pos[0] + (rng() - 0.5) * a.r, a.pos[1] + (rng() - 0.5) * a.r, a.pos[2] + (rng() - 0.5) * a.r,
        (rng() - 0.5) * 70, (rng() - 0.5) * 70, (rng() - 0.5) * 70,
        { s0: 2 + rng() * 4, s1: 0.5, r: 0.75, g: 0.65, b: 0.5, drag: 1.2, fade: 1.4 });
    }
  }
}

function bez(a, c, b, t) {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
  ];
}

/* ---------------- 每帧更新 ---------------- */
function updateBattle(B, world, t) {
  const gl = world.gl;
  const add = B.dynAdd, opq = B.dynOpaque, deb = B.debrisBatch;
  add.reset(); opq.reset(); deb.reset();
  const rng = mulberry32(1);

  /* 陨石碎块 */
  let di = 0;
  for (const a of B.asteroids) {
    for (const c of a.chunks) {
      if (di >= 4000) break;
      let p, q;
      if (t < c.breakTime) {
        p = c.home; q = c.rot;
      } else {
        const dt = t - c.breakTime;
        p = [
          c.home[0] + c.vel[0] * dt,
          c.home[1] + c.vel[1] * dt,
          c.home[2] + c.vel[2] * dt,
        ];
        q = quatMul(quatFromAxis(c.axis, c.ang * dt), c.rot);
      }
      deb.boxc(p[0], p[1], p[2], c.size[0], c.size[1], c.size[2], c.color,
        { quat: q, spec: 0.2, seed: 0.3 });
      di++;
    }
  }
  deb.count = di;

  /* 光束主炮 */
  const beam = B.beam;
  const charge = clamp((t - beam.charge) / (beam.t0 - beam.charge), 0, 1);
  const firing = t >= beam.t0 && t <= beam.t1;
  const wm = shipMatrix(world.fleet.flagship, t);
  const muz = quatRotate(wm.quat, beam.from);
  const muzW = [wm.m[12] + muz[0], wm.m[13] + muz[1], wm.m[14] + muz[2]];
  const hit = B.beamHit;
  // 蓄能光团
  if (charge > 0 && !firing) {
    const s = 4 + charge * 26;
    add.boxc(muzW[0], muzW[1], muzW[2], s, s, s, [0.7, 0.95, 1.0],
      { unlit: true, e: 2.4 * charge + 0.4, blend: 'add', noJit: true, noSpec: true, alpha: 0.8 });
    add.boxc(muzW[0], muzW[1], muzW[2], s * 2.4, s * 2.4, s * 2.4, [0.5, 0.85, 1.0],
      { unlit: true, e: 0.8 * charge, blend: 'add', noJit: true, noSpec: true, alpha: 0.35 });
  }
  if (firing) {
    const ft = (t - beam.t0) / (beam.t1 - beam.t0);
    const fade = ft > 0.86 ? (1 - ft) / 0.14 : (ft < 0.06 ? ft / 0.06 : 1);
    const dir = V3.norm(V3.sub(hit, muzW));
    const len = V3.len(V3.sub(hit, muzW));
    const mid = V3.add(muzW, V3.scale(dir, len * 0.5));
    const pulse = 0.8 + Math.sin(t * 22) * 0.12 + Math.sin(t * 7.3) * 0.08;
    const w = 5.5 * pulse * fade;
    const qBeam = quatFromTo([1, 0, 0], dir);
    // 外辉光
    add.boxc(mid[0], mid[1], mid[2], len, w, w,
      [0.35, 0.75, 1.0], { unlit: true, e: 0.8 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.30, quat: qBeam });
    // 主束
    add.boxc(mid[0], mid[1], mid[2], len, w * 0.55, w * 0.55,
      [0.75, 0.95, 1.0], { unlit: true, e: 1.7 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.6, quat: qBeam });
    // 亮核
    add.boxc(mid[0], mid[1], mid[2], len, 1.4, 1.4,
      [1.0, 1.0, 1.0], { unlit: true, e: 2.6 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.85, quat: qBeam });
    // 起射光环
    if (ft < 0.25) {
      const rr = 6 + ft / 0.25 * 60;
      add.boxc(muzW[0], muzW[1], muzW[2], rr, rr, rr, [0.8, 0.97, 1.0],
        { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true, alpha: 0.5 * (1 - ft / 0.25) });
    }
    // 受击处亮斑
    add.boxc(hit[0], hit[1], hit[2], 26 * fade, 26 * fade, 26 * fade, [1.0, 0.9, 0.7],
      { unlit: true, e: 1.8 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.55 });
  }

  /* 脉冲能量弹 / 近防弹流 */
  for (const ev of B.events) {
    const age = t - ev.t0;
    if (age < 0 || age > ev.dur) continue;
    const k = age / ev.dur;
    const p = [
      ev.from[0] + ev.dir[0] * ev.speed * age,
      ev.from[1] + ev.dir[1] * ev.speed * age,
      ev.from[2] + ev.dir[2] * ev.speed * age,
    ];
    const L = ev.len * (ev.type === 'bolt' ? 1 : 0.8);
    const q = quatFromTo([1, 0, 0], ev.dir);
    add.boxc(p[0], p[1], p[2], L, ev.size, ev.size,
      ev.col, { unlit: true, e: 2.4, blend: 'add', noJit: true, noSpec: true, alpha: 0.9, quat: q });
    add.boxc(p[0], p[1], p[2], ev.size * 2.4, ev.size * 2.4, ev.size * 2.4,
      ev.col, { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true, alpha: 0.5 });
  }

  /* 导弹 */
  for (const m of B.missiles) {
    const age = t - m.t0;
    if (age < 0 || age > m.dur) continue;
    const k = age / m.dur;
    const p = bez(m.from, m.ctrl, m.to, k);
    const p2 = bez(m.from, m.ctrl, m.to, Math.min(1, k + 0.02));
    const dir = V3.norm(V3.sub(p2, p));
    const qM = quatFromTo([1, 0, 0], dir);
    // 弹体（体素）
    opq.boxc(p[0], p[1], p[2], 8, 2, 2,
      PAL.hullLight, { spec: 0.5, seed: 0.2, quat: qM });
    opq.boxc(p[0] - dir[0] * 5, p[1] - dir[1] * 5, p[2] - dir[2] * 5, 3, 3, 3,
      [1.0, 0.85, 0.5], { unlit: true, e: 2.6, blend: 'add', noJit: true, noSpec: true });
    add.boxc(p[0], p[1], p[2], 6, 6, 6, [1.0, 0.8, 0.45], { unlit: true, e: 1.6, blend: 'add', noJit: true, noSpec: true, alpha: 0.7 });
  }

  /* 护盾展开亮波（每舰） */
  // 由 renderWorld 处理护盾网格

  /* 裂纹辉光（受击陨石） */
  for (const a of B.asteroids) {
    if (!a.kind) continue;
    const bt = a.breakTime;
    if (t < bt - 0.5 || t > bt + 6) continue;
    const fade = t < bt ? 0 : Math.max(0, 1 - (t - bt) / 6);
    const n = a.normal || [1, 0, 0];
    const c = a.pos;
    const s = a.r * 0.9;
    add.boxc(c[0], c[1], c[2], s, s * 0.5, s * 0.5, [1.0, 0.85, 0.6],
      { unlit: true, e: 2.2 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.5 * fade });
    add.boxc(c[0] + n[0] * s * 0.4, c[1] + n[1] * s * 0.4, c[2] + n[2] * s * 0.4,
      s * 0.5, s * 0.28, s * 0.28, [1.0, 0.95, 0.85],
      { unlit: true, e: 2.8 * fade, blend: 'add', noJit: true, noSpec: true, alpha: 0.7 * fade });
  }

  B.particles.evaluate(t);
}
