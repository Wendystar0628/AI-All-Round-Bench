'use strict';
/* =====================================================================
   timeline.js — 世界组装、镜头程序、全局时间线
   一轮 80 秒，循环播放
   ===================================================================== */

const DURATION = 80;
const OFFSETS = { bridge: [0, -3000, 0], core: [0, -6000, 0], corridor: [0, -9000, 0] };

/* ---------------- 镜头 ---------------- */
class Shot {
  constructor(o) {
    this.t0 = o.t0; this.t1 = o.t1;
    this.keys = o.keys;
    this.fov = (o.fov || 50) * PI / 180;
    this.scene = o.scene || 'fleet';
    this.env = o.env;
    this.roll = o.roll || 0;
  }
  eval(t) {
    const k = this.keys;
    let i = 0;
    while (i < k.length - 2 && t >= k[i + 1].t) i++;
    const a = k[i], b = k[i + 1];
    const dt = Math.max(0.0001, b.t - a.t);
    const u = clamp((t - a.t) / dt, 0, 1);
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const tanP = (j) => {
      const p0 = k[Math.max(0, j - 1)], p1 = k[Math.min(k.length - 1, j + 1)];
      const span = Math.max(0.0001, p1.t - p0.t);
      return [(p1.p[0] - p0.p[0]) / span, (p1.p[1] - p0.p[1]) / span, (p1.p[2] - p0.p[2]) / span];
    };
    const tanL = (j) => {
      const p0 = k[Math.max(0, j - 1)], p1 = k[Math.min(k.length - 1, j + 1)];
      const span = Math.max(0.0001, p1.t - p0.t);
      const q0 = p0.l || p0.p, q1 = p1.l || p1.p;
      return [(q1[0] - q0[0]) / span, (q1[1] - q0[1]) / span, (q1[2] - q0[2]) / span];
    };
    const ma = tanP(i), mb = tanP(i + 1), la = tanL(i), lb = tanL(i + 1);
    const A = a.p, B = b.p, LA = a.l || a.p, LB = b.l || b.p;
    const pos = [0, 1, 2].map(c => h00 * A[c] + h10 * dt * ma[c] + h01 * B[c] + h11 * dt * mb[c]);
    const look = [0, 1, 2].map(c => h00 * LA[c] + h10 * dt * la[c] + h01 * LB[c] + h11 * dt * lb[c]);
    return { pos, look, fov: lerp(a.fov || this.fov, b.fov || this.fov, u) };
  }
}

function makeShots() {
  return [
    /* 1. 舰外展开：近卫掠过，沿旗舰侧壳向舰首掠行 */
    new Shot({
      t0: 0, t1: 12, scene: 'fleet', fov: 52,
      keys: [
        { t: 0, p: [-260, 60, 500], l: [-150, 25, 150] },
        { t: 3, p: [80, 40, 420], l: [150, 10, 100] },
        { t: 6, p: [40, 30, 320], l: [200, 0, 40] },
        { t: 9, p: [160, 26, 260], l: [300, 0, 0] },
        { t: 12, p: [360, 34, 300], l: [480, 10, 0] },
      ],
    }),
    /* 2. 接近并进入机库口 */
    new Shot({
      t0: 12, t1: 20, scene: 'fleet', fov: 55,
      keys: [
        { t: 12, p: [360, 34, 300], l: [480, 10, 0] },
        { t: 14, p: [400, 20, 230], l: [350, 5, 0] },
        { t: 16, p: [360, 10, 170], l: [300, 0, 40] },
        { t: 18, p: [280, 4, 120], l: [240, 0, 45] },
        { t: 20, p: [190, 0, 66], l: [120, 0, 34] },
      ],
    }),
    /* 3. 机库内部：掠过停泊位与桥架，进入后壁暗管 */
    new Shot({
      t0: 20, t1: 28, scene: 'fleet', fov: 60,
      keys: [
        { t: 20, p: [190, 0, 66], l: [120, 0, 34] },
        { t: 22, p: [120, 2, 46], l: [40, 0, 38] },
        { t: 24, p: [20, 3, 42], l: [-60, 0, 36] },
        { t: 26, p: [-60, 2, 40], l: [-100, 0, 34] },
        { t: 28, p: [55, 0, 20], l: [55, 0, 8] },
      ],
    }),
    /* 4. 舰桥 */
    new Shot({
      t0: 28, t1: 38, scene: 'bridge', fov: 58,
      keys: [
        { t: 28, p: [0, 18, -84], l: [0, 20, -64] },
        { t: 30, p: [0, 20, -54], l: [0, 22, -10] },
        { t: 32, p: [-14, 24, -30], l: [0, 22, 10] },
        { t: 34, p: [-34, 30, 0], l: [10, 22, 30] },
        { t: 36, p: [-30, 36, 34], l: [30, 20, 50] },
        { t: 38, p: [0, 22, -74], l: [0, 20, -94] },
      ],
    }),
    /* 5. 动力核心中庭 */
    new Shot({
      t0: 38, t1: 48, scene: 'core', fov: 62,
      keys: [
        { t: 38, p: [-85, 12, -146], l: [-85, 16, -116] },
        { t: 40, p: [-70, 22, -92], l: [-20, 50, 0] },
        { t: 42, p: [-30, 45, -42], l: [0, 80, 0] },
        { t: 44, p: [30, 80, 30], l: [0, 110, 0] },
        { t: 46, p: [55, 130, -10], l: [0, 150, 0] },
        { t: 48, p: [-10, 180, -70], l: [0, 200, 0] },
      ],
    }),
    /* 6. 能量装填与导能长廊 */
    new Shot({
      t0: 48, t1: 56, scene: 'corridor', fov: 62,
      keys: [
        { t: 48, p: [-170, 30, 0], l: [-120, 30, 0] },
        { t: 50, p: [-120, 32, 6], l: [-60, 30, 0] },
        { t: 52, p: [-60, 30, -6], l: [0, 30, 0] },
        { t: 54, p: [0, 34, 4], l: [80, 32, 0] },
        { t: 56, p: [90, 36, 0], l: [180, 40, 0] },
      ],
    }),
    /* 7. 旗舰炮位：蓄势与起射 */
    new Shot({
      t0: 56, t1: 61.5, scene: 'fleet', fov: 58,
      keys: [
        { t: 56, p: [900, 90, 420], l: [560, 10, 0] },
        { t: 58, p: [800, 60, 340], l: [566, 0, 0] },
        { t: 60, p: [700, 45, 300], l: [900, 10, -60] },
        { t: 61.5, p: [620, 35, 280], l: [1200, 0, -100] },
      ],
    }),
    /* 8. 陨石一侧回望：弹道抵达、命中碎裂，随后拉远开盾加速 */
    new Shot({
      t0: 61.5, t1: 80, scene: 'fleet', fov: 42,
      keys: [
        { t: 61.5, p: [2650, 320, 1450], l: [1200, 0, -50] },
        { t: 64, p: [2580, 290, 1380], l: [1300, 10, -60] },
        { t: 66.5, p: [2500, 260, 1300], l: [1450, 20, -60] },
        { t: 69, p: [2400, 230, 1200], l: [1600, 20, -40] },
        { t: 71, p: [1500, 200, 900], l: [1200, 0, 0] },
        { t: 74, p: [200, 150, 780], l: [400, 10, 100] },
        { t: 77, p: [-566, 78, 680], l: [-400, 20, 160] },
        { t: 80, p: [-260, 60, 500], l: [-150, 25, 150] },
      ],
    }),
  ];
}

/* ---------------- 世界 ---------------- */
function createWorld(renderer) {
  const gl = renderer.gl;
  const fleet = buildFleet(gl);
  const interiors = buildInteriors(gl);
  const dyn = {
    opaque: new VoxelBatch(gl, 2000),
    alpha: new VoxelBatch(gl, 2000),
    add: new VoxelBatch(gl, 9000),
  };
  const world = {
    gl, renderer, fleet, interiors, dyn,
    particles: new ParticlePool(gl, 30000),
    shots: makeShots(),
    throttle: 1,
    accel: 0,
    time: 0,
    build() {
      this.battle = createBattle(gl, this);
      this.stars = new StarField(gl, 2600, 99);
      this.starsBridge = new StarField(gl, 1400, 51, OFFSETS.bridge);
      this.starsCore = new StarField(gl, 1400, 52, OFFSETS.core);
      this.starsCorridor = new StarField(gl, 1200, 53, OFFSETS.corridor);
      this.planet = new PlanetMesh(gl, 1050, [40, 26]);
      this.floatDebris = new VoxelBatch(gl, 220);
      addNebulas(this);
    },
    reset(t) { this.time = t; },
    update(t, dt) { updateWorld(this, t, dt); },
    render(r, t, camOverride) { renderWorld(this, r, t, camOverride); },
  };
  return world;
}

function addNebulas(world) {
  const P = world.particles;
  if (window.__noneb) return;
  const rng = mulberry32(2024);
  const neb = [
    { p: [-4000, 1500, -5000], s: 2600, c: [0.020, 0.012, 0.030], a: 0.5 },
    { p: [5000, -800, -6000], s: 2200, c: [0.010, 0.018, 0.032], a: 0.45 },
    { p: [2000, 3000, -4000], s: 2000, c: [0.026, 0.014, 0.020], a: 0.4 },
    { p: [-6000, -2000, 3000], s: 2400, c: [0.007, 0.016, 0.028], a: 0.4 },
    { p: [3000, 500, 6000], s: 2100, c: [0.018, 0.012, 0.026], a: 0.35 },
  ];
  for (const n of neb) {
    P.spawn(0, DURATION, n.p[0], n.p[1], n.p[2], 0, 0, 0,
      { s0: n.s, s1: n.s * 1.02, r: n.c[0], g: n.c[1], b: n.c[2], drag: 0, fade: 3, rot: rng() * 3 });
  }
  // 主光天体（亮星）与光晕
  P.spawn(0, DURATION, -2750, 2100, -3600, 0, 0, 0, { s0: 130, s1: 130, r: 1.0, g: 0.95, b: 0.85, drag: 0, fade: 4 });
  P.spawn(0, DURATION, -2750, 2100, -3600, 0, 0, 0, { s0: 420, s1: 420, r: 0.22, g: 0.27, b: 0.35, drag: 0, fade: 4 });
  P.spawn(0, DURATION, -2750, 2100, -3600, 0, 0, 0, { s0: 1300, s1: 1300, r: 0.05, g: 0.065, b: 0.09, drag: 0, fade: 4 });
}

/* 舰船变换 */
function shipMatrix(ship, t) {
  const sw = ship.sway;
  const ox = Math.sin(t * sw.fx * TAU + sw.pa) * sw.ax;
  const oy = Math.sin(t * sw.fy * TAU + sw.pb) * sw.ay;
  const oz = Math.sin(t * sw.fz * TAU + sw.pc) * sw.az;
  const yaw = (ship.yaw || 0) + Math.sin(t * 0.11 + sw.pa) * 0.012;
  const pitch = (ship.pitch || 0) + Math.sin(t * 0.083 + sw.pb) * 0.008;
  const roll = (ship.roll || 0) + Math.sin(t * 0.067 + sw.pc) * 0.010;
  const q = quatFromYawPitchRoll(yaw, pitch, roll);
  const p = [ship.pos[0] + ox, ship.pos[1] + oy, ship.pos[2] + oz];
  // 开火前编队向外展开，射击后重新收拢
  const spread = smoothstep(52, 58, t) * (1 - smoothstep(70, 78, t));
  if (spread > 0 && ship.outDir) {
    const k = spread * 78;
    p[0] += ship.outDir[0] * k;
    p[1] += ship.outDir[1] * k;
    p[2] += ship.outDir[2] * k;
  }
  return { m: m4Compose(p, q, [ship.scale, ship.scale, ship.scale]), pos: p, quat: q };
}

function collectShip(ship, m, out) {
  out.opaque.push([ship.hull.opaque, m]);
  out.alpha.push([ship.hull.alpha, m]);
  out.add.push([ship.hull.add, m]);
  for (const tr of ship.turrets) {
    const tb = tr.batch;
    if (!tb) continue;
    let mm = m4Mul(m, m4Compose(tr.pivot, [0, 0, 0, 1], [1, 1, 1]));
    if (tr.aim) mm = m4Mul(m, m4FromQuatPos(tr.aim, tr.pivot));
    out.opaque.push([tb.opaque, mm]);
    out.alpha.push([tb.alpha, mm]);
    out.add.push([tb.add, mm]);
  }
}

function drawPass(r, list, blend) {
  const gl = r.gl;
  if (blend === 0) { gl.disable(gl.BLEND); gl.depthMask(true); }
  else if (blend === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
  else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); }
  for (const [b, m] of list) {
    if (!b || b.count === 0) continue;
    b.upload();
    b.draw(r.boxProg, m, blend);
  }
  if (blend !== 0) { gl.depthMask(true); gl.disable(gl.BLEND); }
}

/* 引擎尾焰（动态体素） */
function emitEngineGlow(world, ship, t, sm, dyn) {
  const throttle = world.throttle;
  const m = sm.m, q = sm.quat;
  for (const e of ship.engines) {
    const wp = quatRotate(q, e.pos);
    const base = [m[12] + wp[0], m[13] + wp[1], m[14] + wp[2]];
    const dir = quatRotate(q, e.dir);
    const len = e.r * (2.6 + throttle * 2.4);
    const wob = 1 + Math.sin(t * 3.1 + e.pos[1] * 0.7 + e.pos[2]) * 0.12;
    const L = len * wob;
    dyn.boxc(base[0] + dir[0] * L * 0.5, base[1] + dir[1] * L * 0.5, base[2] + dir[2] * L * 0.5,
      Math.abs(dir[0]) * L + e.r, Math.abs(dir[1]) * L + e.r, Math.abs(dir[2]) * L + e.r,
      [1.0, 0.62, 0.26], { unlit: true, e: 0.45 + throttle * 0.28, blend: 'add', noJit: true, noSpec: true, alpha: 0.30 });
    const L2 = L * 0.62;
    dyn.boxc(base[0] + dir[0] * L2 * 0.5, base[1] + dir[1] * L2 * 0.5, base[2] + dir[2] * L2 * 0.5,
      Math.abs(dir[0]) * L2 + e.r * 0.5, Math.abs(dir[1]) * L2 + e.r * 0.5, Math.abs(dir[2]) * L2 + e.r * 0.5,
      [1.0, 0.92, 0.72], { unlit: true, e: 1.15 + throttle * 0.55, blend: 'add', noJit: true, noSpec: true, alpha: 0.55 });
    dyn.boxc(base[0], base[1], base[2], e.r * 1.5, e.r * 1.5, e.r * 1.5,
      [1.0, 0.85, 0.6], { unlit: true, e: 1.2, blend: 'add', noJit: true, noSpec: true, alpha: 0.5 });
  }
}

function updateWorld(world, t, dt) {
  world.time = t;
  const accel = smoothstep(71.5, 78, t);
  world.accel = accel;
  world.throttle = 1 + accel * 1.6;
  world.particles.accelScale = accel * 2.2;
  if (world.battle) updateBattle(world.battle, world, t);
}

/* ---------------- 渲染 ---------------- */
function findShot(shots, t) {
  for (let i = 0; i < shots.length; i++) if (t < shots[i].t1) return shots[i];
  return shots[shots.length - 1];
}

function fadeAt(t, tb) {
  const d = Math.abs(t - tb);
  if (d > 0.30) return 0;
  return 1 - d / 0.30;
}


const FLEET_ENV = {
  fogColor: [0.008, 0.012, 0.026], fogDensity: 0.00010,
  exposure: 1.12, bloom: 0.72,
  dirDir: [-0.55, 0.42, -0.72], dirColor: [1.25, 1.16, 1.02],
  fillDir: [0.6, -0.15, 0.75], fillColor: [0.22, 0.28, 0.36],
  ambSky: [0.19, 0.23, 0.30], ambGround: [0.075, 0.09, 0.115],
  seam: 0.26, jitter: 0.08,
};

function renderWorld(world, r, t, camOverride) {
  const gl = r.gl;
  const shot = findShot(world.shots, t);
  const isInterior = !!OFFSETS[shot.scene];
  const off = isInterior ? OFFSETS[shot.scene] : [0, 0, 0];
  const cam = camOverride ? { pos: camOverride.p.slice(), look: camOverride.l.slice(), fov: camOverride.fov } : shot.eval(t);
  cam.pos = [cam.pos[0] + off[0], cam.pos[1] + off[1], cam.pos[2] + off[2]];
  cam.look = [cam.look[0] + off[0], cam.look[1] + off[1], cam.look[2] + off[2]];

  r.setEnv(shot.env || FLEET_ENV);
  if (isInterior) {
    const inter = world.interiors[shot.scene];
    if (inter && inter.env) r.setEnv(inter.env);
  }
  r.addScale = isInterior ? (shot.scene === 'corridor' ? 0.30 : shot.scene === 'core' ? 0.55 : 0.72) : 0.92;
  const aspect = canvas.width / Math.max(1, canvas.height);
  let proj;
  if (window.__ortho) proj = m4Ortho(window.__ortho, window.__ortho / aspect, 1, 40000);
  else proj = m4Perspective(cam.fov, aspect, 1.0, 30000);
  r.clay = window.__clay || 0;
  if (r.clay) {
    r.dirDir = V3.norm(V3.sub(cam.pos, cam.look));
    r.dirColor = [1.0, 1.0, 1.0];
    r.ambSky = [0.22, 0.24, 0.27]; r.ambGround = [0.12, 0.13, 0.15];
    r.fillColor = [0.1, 0.1, 0.1];
    r.fogDensity = 0.00002;
  }
  const view = m4LookAt(cam.pos, cam.look, [0, 1, 0]);
  r.camPos = cam.pos;

  // 切换遮挡（舱口式转场）
  let fade = 0;
  if (!camOverride) {
    for (let si = 1; si < world.shots.length; si++) {
      const s = world.shots[si], prev = world.shots[si - 1];
      if (prev.scene === s.scene) continue;
      const d = Math.abs(t - s.t0);
      if (d < 0.24) fade = Math.max(fade, 0.94 * (1 - d / 0.24));
    }
  }
  r.post.fade = fade;

  r.post.bindScene();
  r.clearLights();
  if (!isInterior) {
    const sm0 = shipMatrix(world.fleet.flagship, t);
    r.setLight(10, sm0.pos, [0.5, 0.85, 1.0], 0.25 + world.accel * 1.4, 900);
    if (world.battle && world.battle.beam) {
      const B = world.battle;
      if (t > B.beam.charge && t < B.beam.t1 + 0.5) {
        const m = shipMatrix(world.fleet.flagship, t);
        const muz = quatRotate(m.quat, B.beam.from);
        r.setLight(11, [m.m[12] + muz[0], m.m[13] + muz[1], m.m[14] + muz[2]],
          [0.6, 0.9, 1.0], 1.15, 420);
        r.setLight(12, B.beamHit, [1.0, 0.85, 0.6], 0.9, 320);
      }
      // 陨石区战斗照明
      if (t > 58 && t < 72) {
        const k = smoothstep(58, 62, t) * (1 - smoothstep(69, 73, t));
        r.setLight(13, [2050, 20, 0], [1.0, 0.82, 0.6], 4.2 * k, 3400);
        r.setLight(14, [1750, -60, 220], [0.7, 0.85, 1.0], 2.6 * k, 2800);
        r.setLight(15, [2450, 120, -60], [1.0, 0.9, 0.75], 2.6 * k, 2400);
        // 战斗期间补光（跟随镜头，托起舰体暗面）
        r.setLight(16, cam.pos, [0.55, 0.68, 0.85], 1.5 * k, 5200);
      }
    }
  }

  const out = { opaque: [], alpha: [], add: [] };

  if (!isInterior) {
    /* 舰外 */
    r.drawStars(world.stars, proj, view);
    // 远景行星
    if (world.planet) {
      const pm = m4Compose([-8200, 1500, -5200], quatFromAxis([0, 1, 0], t * 0.01), [1, 1, 1]);
      world.planet.draw(proj, view, pm, r.camPos, r.dirDir, [0.10, 0.15, 0.23], [0.012, 0.025, 0.05], 0.45);
    }
    // 近处漂浮物（体素碎块）
    const fd = world.floatDebris;
    fd.reset();
    for (let i = 0; i < 90; i++) {
      const sd = i * 97.13;
      const sp = 26 + (i % 6) * 16;
      const x = 4200 - ((sd * 3.7 + t * sp) % 6400);
      const y = ((sd * 1.31) % 760) - 380;
      const z = ((sd * 2.17) % 1700) - 850;
      const s = 1.5 + (i % 4) * 1.1;
      const c = i % 3 === 0 ? [0.42, 0.38, 0.33] : [0.30, 0.35, 0.42];
      fd.boxc(x, y, z, s, s, s, c, { spec: 0.25, seed: 0.4 });
    }
    out.opaque.push([fd, IDENTITY]);
    gl.useProgram(r.boxProg.prog);
    r.applyBoxUniforms(r.boxProg, proj, view);
    const drawList = [world.fleet.flagship, ...world.fleet.escorts, ...world.fleet.distant];
    const mats = [];
    for (const s of drawList) {
      const sm = shipMatrix(s, t);
      mats.push(sm);
      collectShip(s, sm.m, out);
    }
    // 机库内部补充件
    const hang = world.interiors.hangar.batch;
    out.opaque.push([hang.opaque, IDENTITY]);
    out.alpha.push([hang.alpha, IDENTITY]);
    out.add.push([hang.add, IDENTITY]);
    // 小艇（动态路径）
    emitBoats(world, t, out);
    // 尾焰
    const dyn = world.dyn;
    dyn.add.reset();
    for (let i = 0; i < drawList.length; i++) emitEngineGlow(world, drawList[i], t, mats[i], dyn.add);
    out.add.push([dyn.add, IDENTITY]);
    // 战斗
    if (world.battle) {
      const B = world.battle;
      out.add.push([B.dynAdd, IDENTITY]);
      out.opaque.push([B.dynOpaque, IDENTITY]);
      out.opaque.push([B.debrisBatch, IDENTITY]);
    }
    drawPass(r, out.opaque, 0);
    drawPass(r, out.alpha, 1);
    drawPass(r, out.add, 2);
    // 护盾
    drawShields(world, r, t, proj, view, drawList);
    // 粒子
    r.drawParticles(world.particles, proj, view);
  } else {
    /* 舰内 */
    const inter = world.interiors[shot.scene];
    const mOff = m4Compose(off, [0, 0, 0, 1], [1, 1, 1]);
    r.drawStars(world['stars' + (shot.scene === 'bridge' ? 'Bridge' : shot.scene === 'core' ? 'Core' : 'Corridor')], proj, view);
    gl.useProgram(r.boxProg.prog);
    r.applyBoxUniforms(r.boxProg, proj, view);
    if (inter.lights) {
      for (let i = 0; i < inter.lights.length; i++) {
        const L = inter.lights[i];
        r.setLight(i, [L.pos[0] + off[0], L.pos[1] + off[1], L.pos[2] + off[2]], L.col, L.intensity, L.radius);
      }
    }
    out.opaque.push([inter.batch.opaque, mOff]);
    out.alpha.push([inter.batch.alpha, mOff]);
    out.add.push([inter.batch.add, mOff]);
    if (shot.scene === 'core') {
      out.opaque.push([inter.coreBatch.opaque, mOff]);
      out.add.push([inter.coreBatch.add, mOff]);
      // 核心呼吸光
      const dd = world.dyn.add;
      dd.reset();
      const pu = 0.72 + Math.sin(t * 1.25) * 0.28;
      const pu2 = 0.72 + Math.sin(t * 1.25 + 1.1) * 0.28;
      dd.boxc(0, 125, 0, 60 * pu, 250 * pu, 60 * pu, [0.45, 0.9, 1.0],
        { unlit: true, e: 1.5 * pu, blend: 'add', noJit: true, noSpec: true, alpha: 0.4 });
      dd.boxc(0, 125, 0, 26 * pu2, 250 * pu2, 26 * pu2, [0.8, 1.0, 1.0],
        { unlit: true, e: 2.2 * pu2, blend: 'add', noJit: true, noSpec: true, alpha: 0.6 });
      out.add.push([dd, mOff]);
      for (const rg of inter.rings) {
        const ang = t * rg.speed * TAU;
        const mm = m4Mul(mOff, m4FromQuatPos(quatFromAxis([0, 1, 0], ang), [0, 0, 0]));
        out.opaque.push([rg.batch.opaque, mm]);
        out.add.push([rg.batch.add, mm]);
      }
    }
    if (shot.scene === 'bridge') {
      const hb = inter.holoBatch;
      hb.reset();
      for (const hs of inter.holoShips) {
        const x = hs.x + Math.sin(t * 0.21 + hs.z) * 3;
        const z = hs.z + ((t * hs.vz + hs.x) % 30) - 15;
        const y = hs.y + Math.sin(t * 0.5 + hs.x) * 1.2;
        hb.boxc(x, y, z, 6 * hs.s, 1.2 * hs.s, 1.2 * hs.s, [0.55, 0.95, 1.0],
          { unlit: true, e: 1.5, blend: 'add', noJit: true, noSpec: true, alpha: 0.8 });
        hb.boxc(x - 4 * hs.s, y, z, 2 * hs.s, 0.8 * hs.s, 0.8 * hs.s, [0.7, 0.95, 1.0],
          { unlit: true, e: 1.4, blend: 'add', noJit: true, noSpec: true, alpha: 0.7 });
      }
      out.add.push([hb, mOff]);
    }
    if (shot.scene === 'corridor' && inter.update) {
      inter.update(t, world.dyn.add);
      world.dyn.add.count = Math.min(world.dyn.add.count, 9000);
      out.add.push([world.dyn.add, mOff]);
    }
    drawPass(r, out.opaque, 0);
    drawPass(r, out.alpha, 1);
    drawPass(r, out.add, 2);
  }

  r.present(t);
}

/* 小艇路径：停泊、离港、伴飞、返回 */
function emitBoats(world, t, out) {
  const boats = world.fleet.boats;
  const hang = { x0: -90, x1: 150, y0: -16, y1: 20, z0: 32, z1: 52 };
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i];
    const ph = t + i * 1.7;
    const cyc = (ph % 24) / 24;         // 24 秒一轮
    let p, q;
    if (cyc < 0.35) {
      // 停泊在机库
      const k = cyc / 0.35;
      const sx = -110 + i * 75, sz = 38;
      p = [sx, -12, sz];
      q = quatFromYawPitchRoll(0, 0, 0);
    } else if (cyc < 0.65) {
      // 离港：从机库口飞出并伴飞
      const k = easeOut((cyc - 0.35) / 0.30);
      const sx = -110 + i * 75;
      p = [lerp(sx, 200, k), lerp(-12, -6, k), lerp(38, 260, k)];
      q = quatFromYawPitchRoll(Math.sin(k * 3) * 0.2, 0, Math.sin(k * 2) * 0.15);
    } else if (cyc < 0.9) {
      // 沿舰壳伴飞：经过主炮、侧壳与喷口
      const k = (cyc - 0.65) / 0.25;
      const a = k * TAU;
      p = [lerp(420, -300, k), 40 + Math.sin(a * 2) * 26, 190 + Math.sin(a) * 70];
      q = quatFromYawPitchRoll(Math.PI * 0.06, 0, 0.12);
    } else {
      // 返回机库
      const k = easeInOut((cyc - 0.9) / 0.1);
      const sx = -110 + i * 75;
      p = [lerp(-300, sx, k), lerp(40, -12, k), lerp(190, 38, k)];
      q = quatFromYawPitchRoll(Math.PI, 0, 0);
    }
    const m = m4Compose(p, q, [b.scale, b.scale, b.scale]);
    collectShip(b, m, out);
  }
}

/* 护盾 */
function drawShields(world, r, t, proj, view, drawList) {
  const B = world.battle;
  if (!B) return;
  const mesh = B.shieldMesh;
  let any = false;
  for (let i = 0; i < drawList.length; i++) {
    const s = drawList[i];
    const d = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
    const tAct = 71.0 + d / 900 * 1.6 + (i % 5) * 0.05;
    let tt = t;
    if (tt < 14) tt += DURATION;      // 循环接续：护盾余辉延续到开头
    const act = clamp((tt - tAct) / 1.4, 0, 1);
    if (act <= 0) continue;
    any = true;
    const sm = shipMatrix(s, t);
    const sc = s.shieldScale || [100, 40, 40];
    const m = m4Compose(sm.pos, sm.quat, sc);
    let persist = 1;
    if (tt > 78) persist = lerp(1, 0.3, clamp((tt - 78) / 8, 0, 1));
    const glow = (0.55 + act * 0.7 + world.accel * 0.4) * persist;
    r.drawShield(mesh, m, t, easeOut(act), (i % 7) * 0.13, glow,
      [0.25, 0.75, 1.0], [0.65, 0.95, 1.0], proj, view);
  }
}
