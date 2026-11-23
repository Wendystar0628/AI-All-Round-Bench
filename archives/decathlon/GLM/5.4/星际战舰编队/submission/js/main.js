'use strict';
/* ==================================================================
   主程序：场景装配 / 相机 / 时间线 / 导出接口
   ================================================================== */

let renderer = null;
let gl = null;
const canvas = document.getElementById('c');

const STATE = {
  t: 0,
  playing: true,
  exportMode: false,
  room: 'ext',
  quality: 1,
};

/* ---------------- 相机 ---------------- */
class Camera {
  constructor() {
    this.pos = [0, 0, 0]; this.target = [0, 0, 0]; this.up = [0, 1, 0];
    this.fov = 55; this.roll = 0;
    this.view = M4.create(); this.proj = M4.create(); this.vp = M4.create();
    this.right = [1, 0, 0]; this.upv = [0, 1, 0]; this.fwd = [0, 0, -1];
    this.near = 0.35; this.far = 26000;
  }
  set(pos, target, fov, roll) {
    this.pos = pos; this.target = target;
    if (fov !== undefined) this.fov = fov;
    if (roll !== undefined) this.roll = roll;
  }
  update(aspect) {
    const f = V3.norm(V3.sub(this.target, this.pos));
    let r = V3.cross(f, this.up);
    const rl = V3.len(r);
    r = rl < 1e-5 ? [1, 0, 0] : V3.mul(r, 1 / rl);
    let u = V3.cross(r, f);
    if (this.roll) {
      const c = Math.cos(this.roll), s = Math.sin(this.roll);
      const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      const u2 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
      r = r2; u = u2;
    }
    this.right = r; this.upv = u; this.fwd = f;
    M4.lookAt(this.view, this.pos, this.target, this.up);
    // 手工重建含 roll 的视图矩阵
    if (this.roll) {
      const m = this.view;
      m[0] = r[0]; m[4] = r[1]; m[8] = r[2];
      m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
      m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
      m[12] = -V3.dot(r, this.pos); m[13] = -V3.dot(u, this.pos); m[14] = V3.dot(f, this.pos);
    }
    M4.persp(this.proj, this.fov * Math.PI / 180, aspect, this.near, this.far);
    M4.mul(this.vp, this.proj, this.view);
  }
}
const cam = new Camera();

/* ---------------- 模型矩阵 ---------------- */
const _tmpM = new Float32Array(16), _tmpM2 = new Float32Array(16);
function modelMatrix(out, pos, quat, center, scale) {
  const s = scale || 1;
  M4.fromQuatPosScale(_tmpM, quat || Q.ident(), [0, 0, 0], [s, s, s]);
  // out = T(pos) * R * T(-center)
  const cx = -(center ? center[0] : 0), cy = -(center ? center[1] : 0), cz = -(center ? center[2] : 0);
  out[0] = _tmpM[0]; out[1] = _tmpM[1]; out[2] = _tmpM[2]; out[3] = 0;
  out[4] = _tmpM[4]; out[5] = _tmpM[5]; out[6] = _tmpM[6]; out[7] = 0;
  out[8] = _tmpM[8]; out[9] = _tmpM[9]; out[10] = _tmpM[10]; out[11] = 0;
  out[12] = _tmpM[0] * cx + _tmpM[4] * cy + _tmpM[8] * cz + pos[0];
  out[13] = _tmpM[1] * cx + _tmpM[5] * cy + _tmpM[9] * cz + pos[1];
  out[14] = _tmpM[2] * cx + _tmpM[6] * cy + _tmpM[10] * cz + pos[2];
  out[15] = 1;
  return out;
}

/* ---------------- 场景数据 ---------------- */
const SCENE = {
  models: {},
  ships: [],
  asteroids: [],
  turrets: [],
  smallcraft: [],
  frags: [],
};

/* ---------------- 全局时间线参数 ---------------- */
const DUR = 76;

function fleetSpeed(t) {
  // 0-18: 高速巡航后回落；18-62 巡航；62-70 加速；70-76 高速
  const a = smoothstep(0, 18, t);
  let v = lerp(64, 30, a);
  if (t > 60) v = lerp(30, 78, smoothstep(60, 71, t));
  return v;
}
let _speedIntegral = null;
function fleetDist(t) {
  if (_speedIntegral === null) {
    _speedIntegral = [0];
    const dt = 0.01;
    let s = 0;
    for (let i = 1; i <= DUR / dt; i++) { s += fleetSpeed((i - 0.5) * dt) * dt; _speedIntegral.push(s); }
  }
  const i = clamp(t / 0.01, 0, _speedIntegral.length - 1);
  const i0 = Math.floor(i), i1 = Math.min(_speedIntegral.length - 1, i0 + 1);
  return lerp(_speedIntegral[i0], _speedIntegral[i1], i - i0);
}
const WRAP = 4200; // 陨石带环绕周期

/* ---------------- 初始化 ---------------- */
async function nextFrame() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); }

async function buildAll() {
  const log = (s) => { const el = document.getElementById('load'); if (el) el.textContent = s; };
  log('构建旗舰…'); await nextFrame();
  const flagship = buildFlagship();
  flagship.build(gl);
  SCENE.models.flagship = flagship;
  log('构建护卫舰…'); await nextFrame();
  const escort = buildEscort(); escort.model.build(gl); SCENE.models.escort = escort;
  const vanguard = buildVanguard(); vanguard.model.build(gl); SCENE.models.vanguard = vanguard;
  log('构建小艇与武器…'); await nextFrame();
  const sc = buildSmallCraft(); sc.model.build(gl); SCENE.models.smallcraft = sc;
  const turret = buildPulseTurret(); turret.model.build(gl); SCENE.models.turret = turret;
  const ciws = buildCIWS(); ciws.model.build(gl); SCENE.models.ciws = ciws;
  const missile = buildMissile(); missile.model.build(gl); SCENE.models.missile = missile;
  log('构建陨石…'); await nextFrame();
  SCENE.models.asteroids = [];
  for (let i = 0; i < 6; i++) {
    const a = buildAsteroid(100 + i * 37.7, 34 + (i % 3) * 10);
    a.model.build(gl);
    for (const f of a.fragments) f.model.build(gl);
    SCENE.models.asteroids.push(a);
  }
  log('构建舰内空间…'); await nextFrame();
  const reactor = buildReactor();
  reactor.model.build(gl);
  for (const r of reactor.rings) r.model.build(gl);
  SCENE.models.reactor = reactor;
  const bridge = buildBridge(); bridge.model.build(gl); SCENE.models.bridge = bridge;
  const holo = buildHoloShip(); holo.model.build(gl); SCENE.models.holoship = holo;
  log('');
  buildFleet();
  buildAsteroidField();
  initFX();
}

/* ---------------- 舰队编组 ---------------- */
function buildFleet() {
  const ships = SCENE.ships;
  // 旗舰
  ships.push({
    kind: 'flagship', model: SCENE.models.flagship,
    pos: [560, 140, 0], quat: Q.ident(),
    nozzles: [[0, 78, -58], [0, 78, 0], [0, 78, 58], [0, 120, -58], [0, 120, 0], [0, 120, 58], [0, 100, -88], [0, 100, 88]],
    nozzleSize: [1.0, 1.0],
    throttle: 1, scale: 1, center: [560, 140, 0],
    formation: [560, 140, 0], spread: 0, idx: 0,
  });
  // 近卫舰
  const e = SCENE.models.escort;
  const escortSlots = [
    [140, 40, 250], [300, -30, 300], [480, 60, 260], [620, -20, 290],
    [120, 30, -260], [330, -50, -310], [520, 50, -270], [660, -10, -240],
    [-120, 70, 190], [-160, -40, -210], [220, 120, 120], [430, -90, -140],
  ];
  for (let i = 0; i < escortSlots.length; i++) {
    const s = escortSlots[i];
    ships.push({
      kind: 'escort', model: e.model, center: e.center, length: e.length,
      pos: [s[0] - 300, s[1], s[2]], quat: Q.ident(), nozzles: e.nozzles, nozzleSize: [0.85, 0.85],
      throttle: 1, scale: 1, formation: [s[0] - 300, s[1], s[2]], spread: 0, ciws: e.ciws, idx: i,
    });
  }
  // 前卫舰
  const v = SCENE.models.vanguard;
  const vanSlots = [
    [820, 60, 620], [900, -40, 380], [860, 30, -420], [940, -60, -660],
    [1080, 80, 120], [1120, -70, -140], [760, 140, 760], [800, -120, -780],
    [1250, 40, 420], [1290, -30, -360], [1180, 150, -60],
  ];
  for (let i = 0; i < vanSlots.length; i++) {
    const s = vanSlots[i];
    ships.push({
      kind: 'vanguard', model: v.model, center: v.center, length: v.length,
      pos: [s[0] - 250, s[1], s[2]], quat: Q.ident(), nozzles: v.nozzles, nozzleSize: [0.9, 0.9],
      throttle: 1, scale: 1, formation: [s[0] - 250, s[1], s[2]], spread: 0, tubes: v.tubes, idx: i,
    });
  }
  // 远景舰列
  const farSlots = [];
  for (let i = 0; i < 14; i++) {
    const a = hash1(i * 3.7) * TAU;
    farSlots.push([-900 - hash1(i * 7.1) * 1400, (hash1(i * 11.3) - 0.5) * 420, (hash1(i * 5.9) - 0.5) * 1600]);
  }
  for (let i = 0; i < farSlots.length; i++) {
    const s = farSlots[i];
    const useV = i % 3 === 0;
    ships.push({
      kind: useV ? 'vanguard' : 'escort', model: useV ? v.model : e.model,
      center: useV ? v.center : e.center, length: useV ? v.length : e.length,
      pos: s, quat: Q.ident(), nozzles: useV ? v.nozzles : e.nozzles, nozzleSize: [0.8, 0.8],
      throttle: 0.8, scale: 1, formation: s.slice(), spread: 0, far: true, idx: 100 + i,
    });
  }
  // 炮台
  const t = SCENE.models.turret;
  const turretSlots = [
    [300, 238, 0], [430, 238, 0], [350, 216, -46], [350, 216, 46],
    [330, 152, 178], [330, 152, -178], [520, 152, 172], [520, 152, -172],
    [700, 152, 60], [700, 152, -60],
  ];
  for (const s of turretSlots) {
    SCENE.turrets.push({ model: t.model, center: t.center, pos: s, base: s.slice(), kind: 'ship', yaw: hash1(s[0] * 0.7) * TAU, pitch: 0, fire: -1 });
  }
  // 悬浮炮台
  for (let i = 0; i < 6; i++) {
    const s = [880 + (i % 2) * 150, 150 + (i % 3) * 40, (i % 2 ? 1 : -1) * (120 + (i % 3) * 30)];
    SCENE.turrets.push({ model: t.model, center: t.center, pos: s, base: s.slice(), kind: 'float', yaw: hash1(i * 9.1) * TAU, pitch: 0, fire: -1, bob: i * 1.7 });
  }
  // 小艇
  const sc = SCENE.models.smallcraft;
  for (let i = 0; i < 9; i++) {
    SCENE.smallcraft.push({ model: sc.model, center: sc.center, nozzles: sc.nozzles, pos: [0, 0, 0], quat: Q.ident(), idx: i, trail: 0 });
  }
}

/* ---------------- 陨石带 ---------------- */
function buildAsteroidField() {
  const list = SCENE.asteroids;
  // 攻击目标群（前侧方）
  const cluster = [
    [2980, -120, 780, 1.0], [3160, 60, 980, 0.75], [2860, 180, 620, 0.62], [3300, -180, 700, 0.55],
    [3060, -260, 1080, 0.48], [3220, 220, 860, 0.4], [2920, -40, 920, 0.34], [3400, 40, 1120, 0.3],
    [2780, 260, 900, 0.26], [3120, -320, 820, 0.22], [3260, 300, 640, 0.2], [3000, 120, 1180, 0.18],
  ];
  for (let i = 0; i < cluster.length; i++) {
    const c = cluster[i];
    list.push({
      field: [c[0], c[1], c[2]], scale: c[3], rot: Q.fromEuler(hash1(i * 3.1) * TAU, hash1(i * 5.3) * TAU, 0),
      variant: i % 6, radius: SCENE.models.asteroids[i % 6].radius, dead: false, target: true, id: i,
      spinAxis: V3.norm([hash1(i * 7.7) - 0.5, hash1(i * 9.1) - 0.5, hash1(i * 2.3) - 0.5]), spinSpeed: (hash1(i * 4.4) - 0.5) * 0.12,
    });
  }
  // 环境散布
  for (let i = 0; i < 46; i++) {
    const x = hash1(i * 13.3) * WRAP;
    const y = (hash1(i * 7.9) - 0.5) * 900;
    const z = (hash1(i * 5.1) - 0.5) * 2200;
    if (Math.abs(z) < 260 && y > -160 && y < 160) continue;
    list.push({
      field: [x, y, z], scale: 0.25 + hash1(i * 3.3) * 0.85, rot: Q.fromEuler(hash1(i * 2.1) * TAU, hash1(i * 6.7) * TAU, 0),
      variant: (i + 2) % 6, radius: SCENE.models.asteroids[(i + 2) % 6].radius, dead: false, target: false, id: 100 + i,
      spinAxis: V3.norm([hash1(i * 1.7) - 0.5, hash1(i * 8.3) - 0.5, hash1(i * 4.9) - 0.5]), spinSpeed: (hash1(i * 6.1) - 0.5) * 0.08,
    });
  }
}

/* ---------------- 渲染 ---------------- */
const SUN = { dir: V3.norm([0.52, 0.46, -0.72]), color: [2.5, 2.2, 1.8] };
const SKYCOL = [0.30, 0.36, 0.56];
const GROUNDCOL = [0.09, 0.10, 0.18];
const FOGCOL = [0.02, 0.026, 0.055];

/* ---------------- 启动 ---------------- */
async function start() {
  renderer = new Renderer(canvas);
  gl = renderer.gl;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.floor(innerWidth * dpr)), h = Math.max(2, Math.floor(innerHeight * dpr));
  canvas.width = w; canvas.height = h;
  renderer.resize(w, h);
  window.addEventListener('resize', () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.floor(innerWidth * dpr)), h = Math.max(2, Math.floor(innerHeight * dpr));
    canvas.width = w; canvas.height = h;
    renderer.resize(w, h);
  });
  await buildAll();
  const el = document.getElementById('load'); if (el) el.style.display = 'none';
  window.__seek = (tt) => { window.__pause = true; STATE.t = tt; update(tt); render(); };
  window.__play = () => { window.__pause = false; };
  window.__ready = true;
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!STATE.exportMode && !window.__pause) {
      STATE.t = (STATE.t + dt) % DUR;
      update(STATE.t);
      render();
    }
  }
  requestAnimationFrame(loop);
}
window.addEventListener('error', (e) => {
  const el = document.getElementById('load');
  if (el) { el.style.display = 'block'; el.style.color = '#f66'; el.textContent = 'ERROR: ' + e.message; }
});
start().catch(e => {
  const el = document.getElementById('load');
  if (el) { el.style.display = 'block'; el.style.color = '#f66'; el.textContent = 'ERROR: ' + e.message + '\n' + e.stack; }
  console.error(e);
});
