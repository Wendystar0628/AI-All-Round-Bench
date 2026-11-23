'use strict';
/* ==================================================================
   世界更新 / 攻击编排 / 特效
   ================================================================== */
const _m4 = new Float32Array(16);
function shipMatrix(s, out) { return modelMatrix(out || _m4, s.pos, s.quat, s.center, s.scale); }
function xf(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function xdir(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}
function spreadAt(t) { return smoothstep(53.5, 59, t) * (1 - smoothstep(67.5, 72.5, t)); }

function updateFleet(t) {
  const spread = spreadAt(t);
  for (const s of SCENE.ships) {
    const f = s.formation;
    const k = 1 + 0.36 * spread * (s.far ? 0.45 : 1);
    const i = s.idx || 0;
    const dx = Math.sin(t * 0.31 + i * 1.7) * 6 + Math.sin(t * 0.13 + i * 0.7) * 4;
    const dy = Math.sin(t * 0.24 + i * 2.3) * 4;
    const dz = Math.cos(t * 0.27 + i * 1.1) * 6;
    s.pos = [f[0] * k + dx, f[1] * k + dy, f[2] * k + dz];
    s.quat = Q.fromEuler(Math.sin(t * 0.21 + i) * 0.028, Math.sin(t * 0.17 + i * 2) * 0.02, Math.sin(t * 0.15 + i * 3) * 0.04);
    s.throttle = 0.92 + 0.08 * Math.sin(t * 0.6 + i) + smoothstep(69, 76, t) * 0.85;
    if (!s.mat) s.mat = new Float32Array(16);
    shipMatrix(s, s.mat);
  }
}

function updateTurrets(t) {
  for (const tr of SCENE.turrets) {
    const p = tr.base.slice();
    if (tr.kind === 'float') { p[1] += Math.sin(t * 0.6 + tr.bob) * 7; p[2] += Math.cos(t * 0.45 + tr.bob) * 4; }
    tr.pos = p;
    const aim = t > 60 && t < 70;
    let yaw = tr.yaw, pitch = tr.pitch || 0;
    if (aim) {
      const tgt = asteroidWorld(SCENE.asteroids[1 + ((tr.base[0] | 0) % 4)], t);
      const d = V3.sub(tgt, p);
      yaw = Math.atan2(-d[2], d[0]);
      pitch = Math.asin(clamp(d[1] / Math.max(1, V3.len(d)), -1, 1)) * 0.6;
    } else {
      yaw += Math.sin(t * 0.2 + tr.bob) * 0.0025;
      pitch = Math.sin(t * 0.17 + tr.bob) * 0.05;
    }
    tr.yaw = yaw; tr.pitch = pitch;
    tr.quat = Q.fromEuler(yaw, pitch, 0);
  }
}

function asteroidWorld(a, t) {
  const d = fleetDist(t);
  let xr = ((a.field[0] - d) % WRAP + WRAP) % WRAP;
  if (xr > WRAP / 2) xr -= WRAP;
  return [xr, a.field[1], a.field[2]];
}

const CRAFT_LOOP = [
  [392, 84, 96], [430, 100, 205], [560, 128, 320], [820, 168, 330],
  [980, 150, 250], [860, 128, 360], [620, 110, 400], [470, 96, 290],
];
function updateSmallCraft(t) {
  for (const c of SCENE.smallcraft) {
    const i = c.idx;
    if (i < 3) { c.pos = [300 + i * 72, 62, 40]; c.quat = Q.ident(); c.parked = true; continue; }
    c.parked = false;
    const ph = ((t * 0.028 + (i - 3) * 0.19) % 1 + 1) % 1;
    const n = CRAFT_LOOP.length;
    const f = ph * n;
    const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, u = f - Math.floor(f);
    const p0 = CRAFT_LOOP[(i0 - 1 + n) % n], p1 = CRAFT_LOOP[i0], p2 = CRAFT_LOOP[i1], p3 = CRAFT_LOOP[(i1 + 1) % n];
    const e = u * u * (3 - 2 * u);
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = catmullScalar(p0[k], p1[k], p2[k], p3[k], e);
    c.pos = p;
    const d = V3.sub(p2, p1);
    c.quat = Q.fromEuler(Math.atan2(-d[2], d[0]), Math.asin(clamp(d[1] / Math.max(1, V3.len(d)), -1, 1)), 0);
  }
}

const FRAG_DEFS = [
  { id: 0, t: 65.1, kind: 'beam' },
  { id: 1, t: 67.7, kind: 'missile' },
  { id: 4, t: 68.3, kind: 'missile' },
];
function updateAsteroids(t) {
  for (const a of SCENE.asteroids) {
    a.worldPos = asteroidWorld(a, t);
    a.rotNow = Q.mul(Q.fromAxis(a.spinAxis, t * a.spinSpeed), a.rot);
    const def = FRAG_DEFS.find(f => f.id === a.id);
    if (def && t >= def.t && !a.dead) { a.dead = true; spawnFragments(a, def.t, a.rotNow); }
  }
  for (const f of SCENE.frags) {
    const dt = t - f.t0;
    f.pos = V3.add(f.pos0, V3.add(V3.mul(f.vel, dt), [-(fleetDist(t) - fleetDist(f.t0)), 0, 0]));
    f.quat = Q.mul(Q.fromAxis(f.axis, dt * f.spin), f.rot0);
  }
}
function spawnFragments(a, t0, rot) {
  const variant = SCENE.models.asteroids[a.variant];
  const m = new Float32Array(16);
  M4.fromQuatPosScale(m, rot, [0, 0, 0], [a.scale, a.scale, a.scale]);
  const impactLocal = [a.radius * 0.85, a.radius * 0.15, -a.radius * 0.2];
  const impactWorld = V3.add(a.worldPos, xf(m, impactLocal));
  for (const f of variant.fragments) {
    const off = xf(m, f.offset);
    const world = V3.add(a.worldPos, off);
    let dir = V3.sub(world, impactWorld);
    if (V3.len(dir) < 1e-3) dir = [0, 1, 0];
    const sp = (16 + 46 * hash1(f.offset[0] * 3.1 + f.offset[2] * 1.7)) * (f.count < 40 ? 1.8 : 1.0);
    SCENE.frags.push({
      model: f.model, center: f.offset, pos0: world, t0, pos: world,
      vel: V3.mul(V3.norm(dir), sp),
      rot0: rot, quat: rot,
      axis: V3.norm([hash1(f.offset[1]) - 0.5, hash1(f.offset[2] + 3) - 0.5, hash1(f.offset[0] + 7) - 0.5]),
      spin: (hash1(f.offset[0] + f.offset[2]) - 0.5) * 1.6,
      scale: a.scale,
    });
  }
}

/* ---------------- 攻击编排 ---------------- */
const ATTACK = {
  beam: { t0: 62.2, t1: 66.9, target: 0 },
  pulses: [62.9, 64.0, 65.1, 66.2],
  ciws: [63.2, 68.4],
  missiles: [
    { launch: 64.4, impact: 67.6, target: 1, ship: 0 },
    { launch: 64.8, impact: 67.8, target: 1, ship: 1 },
    { launch: 65.2, impact: 68.0, target: 4, ship: 2 },
    { launch: 65.6, impact: 68.3, target: 4, ship: 3 },
    { launch: 66.0, impact: 68.5, target: 4, ship: 0 },
    { launch: 66.3, impact: 68.7, target: 1, ship: 2 },
  ],
};
const LIGHTS = [];
const MISSILE_DRAW = [];
const _plumeM = new Float32Array(16);

function updateFX(t) {
  FX.reset();
  LIGHTS.length = 0;
  MISSILE_DRAW.length = 0;
  if (STATE.room === 'reactor') { updateReactorFX(t); return; }
  for (const s of SCENE.ships) {
    const m = s.mat;
    const back = [-m[0], -m[1], -m[2]];
    const baseLen = s.kind === 'flagship' ? 210 : s.kind === 'escort' ? 92 : 112;
    const thr = s.throttle;
    for (let ni = 0; ni < s.nozzles.length; ni++) {
      const nz = s.nozzles[ni];
      const wp = xf(m, Array.isArray(nz) ? nz : [nz.x, nz.y, nz.z]);
      const flick = 0.86 + 0.14 * Math.sin(t * 9 + ni * 2.1 + (s.idx || 0));
      dirMatrix(_plumeM, wp, back, baseLen * thr * flick, (nz.w || 26) * 0.62);
      FX.plume(_plumeM, [1.0, 0.55, 0.18], 1.1 * Math.min(1.4, thr));
      FX.sprite(wp, (nz.w || 26) * 1.35, [1.0, 0.72, 0.35], 0.85 * thr, 0, 1, 0);
    }
  }
  for (let i = 0; i < SCENE.ships.length; i++) {
    const s = SCENE.ships[i];
    if (s.far) continue;
    const o = shieldOpacity(t, i);
    if (o <= 0.003) continue;
    const r = s.kind === 'flagship' ? [600, 205, 225] : s.kind === 'escort' ? [118, 62, 82] : [140, 52, 100];
    FX.shield(s.pos, r, s.quat, [0.42, 0.86, 1.0], o, i * 1.3);
  }
  if (t > 60 && t < 70.5) updateAttackFX(t);
  updateDust(t);
}

function shieldOpacity(t, idx) {
  const t0 = 70.0 + idx * 0.11;
  let o = smoothstep(t0, t0 + 1.0, t) * 0.62 * (1 - smoothstep(73.5, 76, t) * 0.85);
  if (t < 6) o = Math.max(o, (1 - smoothstep(0, 6, t)) * 0.13);
  return o;
}

function updateReactorFX(t) {
  for (let i = 0; i < 70; i++) {
    const a = hash1(i * 3.7) * TAU, r = 18 + hash1(i * 7.1) * 30;
    const y = ((t * 26 + i * 37) % 250) - 125;
    FX.sprite([REACTOR_POS[0] + Math.cos(a) * r, REACTOR_POS[1] + y, REACTOR_POS[2] + Math.sin(a) * r], 3 + hash1(i) * 5, [0.45, 0.9, 1.0], 0.85, 0, 1, 0);
  }
  for (const ly of SCENE.models.reactor.levels) {
    for (let k = 0; k < 3; k++) {
      const a = t * 0.15 + k * 2.1;
      FX.sprite([REACTOR_POS[0] + Math.cos(a) * 90, REACTOR_POS[1] + ly + 8, REACTOR_POS[2] + Math.sin(a) * 90], 26, [0.35, 0.8, 1.0], 0.22, 0, 1, 0);
    }
  }
}

function updateDust(t) {
  const spd = fleetSpeed(t);
  const stretch = 1 + spd * 0.03;
  for (let i = 0; i < 120; i++) {
    const seed = i * 17.31;
    const x = ((hash1(seed) * 1400 - t * spd) % 1400 + 1400) % 1400 - 700;
    const y = (hash1(seed + 1) - 0.5) * 520;
    const z = (hash1(seed + 2) - 0.5) * 720;
    if (Math.abs(z) < 70 && Math.abs(y) < 50) continue;
    FX.sprite([x, y, z], 0.9 + hash1(seed + 3) * 2.8, [0.55, 0.65, 0.9], 0.32, 0, stretch, 2);
  }
}

function updateAttackFX(t) {
  const fl = SCENE.ships[0];
  const muzzle = xf(fl.mat, [1120, 88, 0]);
  const b = ATTACK.beam;
  const target = SCENE.asteroids[b.target];
  const tw = asteroidWorld(target, Math.min(t, b.t1));
  const tm = new Float32Array(16);
  M4.fromQuatPosScale(tm, target.rotNow, [0, 0, 0], [target.scale, target.scale, target.scale]);
  const hitLocal = xf(tm, [target.radius * 0.86, target.radius * 0.12, -target.radius * 0.18]);
  const hit = V3.add(tw, hitLocal);

  if (t > b.t0 - 1.7 && t < b.t1 + 0.5) {
    const charge = smoothstep(b.t0 - 1.7, b.t0, t);
    const on = smoothstep(b.t0, b.t0 + 0.45, t) * (1 - smoothstep(b.t1 - 0.5, b.t1 + 0.35, t));
    FX.sprite(muzzle, 24 + charge * 44, [1.0, 0.72, 0.32], 0.45 + charge * 0.8, 0, 1, 0);
    FX.sprite(muzzle, 9 + charge * 15, [1.0, 0.96, 0.85], 0.6 + charge * 1.1, 0, 1, 0);
    if (on > 0.01) {
      const mid = V3.lerp(muzzle, hit, 0.5);
      FX.beam(muzzle, mid, 5.5 * on + 1.2, [1.0, 0.62, 0.24], 1.5 * on);
      FX.beam(mid, hit, 4.2 * on + 1.0, [1.0, 0.72, 0.34], 1.2 * on);
      FX.beam(muzzle, hit, 1.6 * on + 0.5, [1.0, 0.96, 0.86], 2.2 * on);
      FX.sprite(hit, 40 + 30 * on, [1.0, 0.8, 0.45], 0.9 * on, 0, 1, 0);
      LIGHTS.push({ p: hit, r: 300, c: [3.4, 1.8, 0.75], i: on });
    }
    LIGHTS.push({ p: muzzle, r: 200, c: [2.6, 1.5, 0.6], i: charge });
  }
  for (const pt of ATTACK.pulses) {
    if (t < pt - 0.1 || t > pt + 1.6) continue;
    const turrets = SCENE.turrets;
    for (let i = 0; i < turrets.length; i++) {
      const tr = turrets[i];
      const st = pt + i * 0.05;
      if (t < st) continue;
      const tgt = SCENE.asteroids[1 + (i % 4)];
      const twp = asteroidWorld(tgt, t);
      const m = new Float32Array(16);
      modelMatrix(m, tr.pos, tr.quat || Q.ident(), tr.center, 1);
      const mz = xf(m, [58, 23, 0]);
      const u = clamp((t - st) / 0.75, 0, 1);
      if (u >= 1) continue;
      const p = V3.lerp(mz, twp, u);
      const a = Math.sin(u * Math.PI) * 1.4;
      FX.sprite(p, 11, [0.45, 0.9, 1.0], a, 0, 2.2, 2);
      FX.sprite(p, 5, [0.9, 1.0, 1.0], a, 0, 1, 0);
      if (u < 0.12) LIGHTS.push({ p: mz, r: 100, c: [0.6, 1.6, 2.2], i: 1 });
    }
  }
  if (t > ATTACK.ciws[0] && t < ATTACK.ciws[1]) {
    const k = t - ATTACK.ciws[0];
    for (let i = 0; i < SCENE.ships.length; i++) {
      const s = SCENE.ships[i];
      if (s.kind !== 'escort' || !s.ciws || s.far) continue;
      const tgt = SCENE.asteroids[6 + (i % 5)];
      const twp = asteroidWorld(tgt, t);
      const m = s.mat;
      for (let c = 0; c < 2; c++) {
        const ci = s.ciws[c];
        const mz = xf(m, [ci.x + 16, ci.y + 13, ci.z]);
        const ph = (k * 9 + i * 0.7 + c * 0.5) % 1;
        if (ph > 0.55) continue;
        const u = ph / 0.55;
        const p = V3.lerp(mz, twp, u);
        FX.sprite(p, 3.2, [1.0, 0.86, 0.5], 1.0 - u * 0.6, 0, 3.2, 2);
        if (u < 0.1) FX.sprite(mz, 9, [1.0, 0.8, 0.45], 0.9, 0, 1, 0);
      }
    }
  }
  const vships = SCENE.ships.filter(s => s.kind === 'vanguard' && !s.far);
  for (const ms of ATTACK.missiles) {
    if (t < ms.launch || t > ms.impact + 1.2) continue;
    const vship = vships[ms.ship % vships.length];
    if (!vship) continue;
    const tube = vship.tubes[ms.ship % vship.tubes.length];
    const start = xf(vship.mat, [tube.x, tube.y, tube.z]);
    const tgt = SCENE.asteroids[ms.target];
    const twp = asteroidWorld(tgt, ms.impact);
    const u = clamp((t - ms.launch) / (ms.impact - ms.launch), 0, 1);
    const arc = V3.add(V3.lerp(start, twp, u), [0, Math.sin(u * Math.PI) * 70, 0]);
    if (u < 1) {
      // 导弹体素模型沿弧线飞行，朝向取弧线切向
      const ua = Math.max(0, u - 0.01), ub = Math.min(1, u + 0.01);
      const d = V3.sub(V3.add(V3.lerp(start, twp, ub), [0, Math.sin(ub * Math.PI) * 70, 0]),
                       V3.add(V3.lerp(start, twp, ua), [0, Math.sin(ua * Math.PI) * 70, 0]));
      MISSILE_DRAW.push({ pos: arc, quat: Q.fromEuler(Math.atan2(-d[2], d[0]), Math.asin(clamp(d[1] / Math.max(1e-6, V3.len(d)), -1, 1)), 0) });
      FX.sprite(arc, 7, [1.0, 0.9, 0.7], 1.0, 0, 1, 0);
      FX.sprite(arc, 15, [1.0, 0.55, 0.2], 0.55, 0, 1, 0);
      for (let k = 1; k < 8; k++) {
        const uu = Math.max(0, u - k * 0.022);
        const pp = V3.add(V3.lerp(start, twp, uu), [0, Math.sin(uu * Math.PI) * 70, 0]);
        FX.sprite(pp, 8 - k * 0.7, [1.0, 0.5, 0.18], 0.4 * (1 - k / 8), 0, 1, 0);
      }
    } else {
      const e = clamp((t - ms.impact) / 0.9, 0, 1);
      if (e < 1) {
        FX.sprite(twp, 30 + e * 90, [1.0, 0.72, 0.35], (1 - e) * 1.3, 0, 1, 1);
        FX.sprite(twp, 16 + e * 40, [1.0, 0.95, 0.8], (1 - e) * 1.5, 0, 1, 0);
        LIGHTS.push({ p: twp, r: 340, c: [3.0, 1.8, 0.8], i: (1 - e) * 1.4 });
      }
    }
  }
  if (t > b.t0 && t < b.t1 + 0.3) {
    const heat = smoothstep(b.t0, b.t0 + 1.2, t) * (1 - smoothstep(b.t1, b.t1 + 0.3, t));
    FX.sprite(hit, 60 * heat + 20, [1.0, 0.55, 0.2], 0.8 * heat, 0, 1, 1);
  }
}
