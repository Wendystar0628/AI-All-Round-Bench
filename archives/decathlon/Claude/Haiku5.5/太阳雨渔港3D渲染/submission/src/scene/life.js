import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { hash1, wob, smooth, rainAt, rainbowAt } from '../core/wave.js';
import { SUN_DIR } from './sky.js';
import { WAREHOUSE, WAITING, WATER_Y } from './layout.js';
import { toonGradient } from '../core/materials.js';

// ---------- 海鸥 ----------
const PERCHES = [
  [-1.2, 0.37, 3.45],
  [4.2, 0.37, 3.45],
  [-4.45, 0.37, -1.1],
  [9.2, 3.14, 4.4],
  [-5.4, 2.6, 7.2],
];

// 停靠点：固定的世界坐标数组，或挂在船上的 {obj, p}（p 为船的局部坐标，随船运动）
const _pp = new THREE.Vector3();
function perchPos(spec, out) {
  if (Array.isArray(spec)) return out.set(spec[0], spec[1], spec[2]);
  spec.obj.updateWorldMatrix(true, false);
  out.set(spec.p[0], spec.p[1], spec.p[2]);
  return spec.obj.localToWorld(out);
}

function gullModel(scale) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  const body = new Builder();
  body.ell(0.07, 0.06, 0.17, P.gull, { k: 'solid' }, 10, 7);
  body.sph(0.055, P.gull, { y: 0.03, z: 0.14, k: 'solid' }, 8, 6);
  body.cone(0.018, 0.075, P.beak, { y: 0.02, z: 0.2, rx: Math.PI / 2, k: 'solid' }, 5);
  body.box(0.09, 0.02, 0.1, P.gull, { y: 0.01, z: -0.16, k: 'solid' });
  body.box(0.02, 0.02, 0.06, '#3b4a4f', { y: 0.05, z: -0.2, k: 'solid' });
  body.finish(g);
  const wings = [];
  for (const s of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(s * 0.03, 0.04, 0.02);
    g.add(wg);
    const wb = new Builder();
    wb.box(0.34, 0.012, 0.09, P.gull, { x: s * 0.17, k: 'solid' });
    wb.box(0.1, 0.014, 0.085, '#2c3a40', { x: s * 0.33, k: 'solid' });
    wb.finish(wg);
    wings.push({ g: wg, s });
  }
  return { g, wings };
}

function makeGulls(scene, pool) {
  const list = [];
  for (let i = 0; i < 6; i++) {
    const { g, wings } = gullModel(1.6);
    scene.add(g);
    list.push({
      g,
      wings,
      cx: 2.2 + Math.cos(i * 1.3) * 3.4,
      cz: -1.2 + Math.sin(i * 1.7) * 4.2,
      R: 4.6 + i * 0.7,
      Y: 4.2 + hash1(i * 3.3) * 2.8,
      w: (0.32 + 0.06 * i) * (i % 2 ? -1 : 1),
      ph: i * 2.1,
      period: 15 + 4 * i,
      perch: pool[i % pool.length],
      perch2: pool[(i + 3) % pool.length],
      off: i * 3.7,
    });
  }
  return list;
}

function updateGulls(list, t, cam) {
  for (const k of list) {
    // 停歇：周期内的一段时间落在某个停靠点上
    const ph = (((t + k.off) / k.period) % 1 + 1) % 1;
    const pw = smooth(0.42, 0.56, ph) * (1 - smooth(0.82, 0.92, ph));
    const perch = perchPos(ph > 0.5 ? k.perch2 : k.perch, _pp);
    // 镜头推近时停歇的海鸥扑翅飞走
    const dist = Math.hypot(cam.x - perch.x, cam.y - perch.y, cam.z - perch.z);
    const scare = smooth(11, 6, dist);
    const perchW = pw * (1 - scare);
    const a = k.w * t + k.ph;
    const R = k.R + scare * 2.5;
    const cx = k.cx, cz = k.cz;
    const fx = cx + R * Math.cos(a), fz = cz + R * Math.sin(a);
    const fy = k.Y + scare * 2.0 + 0.4 * Math.sin(t * 0.7 + k.ph);
    // 飞行朝向：切线方向
    const tx = -Math.sin(a) * k.w, tz = Math.cos(a) * k.w;
    const flyYaw = Math.atan2(tx, tz);
    const perchYaw = (ph > 0.5 ? 1.2 : -0.4) + k.ph;
    const x = fx + (perch.x - fx) * perchW;
    const y = fy + (perch.y - fy) * perchW;
    const z = fz + (perch.z - fz) * perchW;
    k.g.position.set(x, y, z);
    k.g.rotation.set(0.0, flyYaw + (perchYaw - flyYaw) * perchW, 0);
    // 扑翅：飞行时快速拍动，停歇时收拢
    const flap = (Math.sin(t * 9 + k.ph) * 0.7 + 0.2) * (1 - perchW) + (-0.08) * perchW;
    for (const w of k.wings) w.g.rotation.z = w.s * (flap + 0.05 * Math.sin(t * 14 + k.ph));
  }
}

// ---------- 港猫 ----------
const CAT_HIDE = [-2.2, 5.1];
const CAT_LOOP = [
  [-2.2, 5.1],
  [-0.4, 5.6],
  [0.8, 7.2],
  [1.1, 9.1],
  [-1.6, 9.4],
  [-3.6, 8.2],
  [-4.4, 6.4],
  [-2.2, 5.1],
];
const catCurve = new THREE.CatmullRomCurve3(CAT_LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const CAT_LEN = catCurve.getLength();
const CAT_PERIOD = 46;
const CAT_WALK = 30;

function catModel() {
  const g = new THREE.Group();
  const b = new Builder();
  b.ell(0.085, 0.075, 0.2, P.catOrange, { y: 0.1, k: 'solid' }, 12, 8);
  for (const z of [-0.05, 0.06]) b.box(0.028, 0.016, 0.02, '#7a4b2f', { x: 0.0, y: 0.165, z, k: 'solid' });
  b.box(0.02, 0.09, 0.02, '#f6e3c6', { x: 0.0, y: 0.04, z: -0.06, rx: 0, k: 'thin' });
  b.finish(g);
  const head = new THREE.Group();
  head.position.set(0, 0.16, 0.18);
  g.add(head);
  const hb = new Builder();
  hb.sph(0.07, P.catOrange, { k: 'solid' }, 10, 7);
  hb.cone(0.025, 0.05, P.catOrange, { x: -0.035, y: 0.07, z: 0.0, k: 'solid' }, 4);
  hb.cone(0.025, 0.05, P.catOrange, { x: 0.035, y: 0.07, z: 0.0, k: 'solid' }, 4);
  hb.sph(0.012, '#2c2a25', { x: -0.025, y: 0.01, z: 0.06, k: 'solid' }, 4, 3);
  hb.sph(0.012, '#2c2a25', { x: 0.025, y: 0.01, z: 0.06, k: 'solid' }, 4, 3);
  hb.finish(head);
  // 尾巴：一段向上翘起的曲线
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.12, -0.18), new THREE.Vector3(0, 0.13, -0.3), new THREE.Vector3(0, 0.24, -0.34), new THREE.Vector3(0, 0.36, -0.3),
    ]), 10, 0.022, 6, false),
    new THREE.MeshToonMaterial({ color: P.catOrange, gradientMap: toonGradient }),
  );
  g.add(tail);
  // 四条腿（行走时摆动）
  const legs = [];
  for (const [x, z] of [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.1], [0.05, -0.1]]) {
    const lg = new THREE.Group();
    lg.position.set(x, 0.07, z);
    g.add(lg);
    const lb = new Builder();
    lb.box(0.03, 0.08, 0.03, P.catOrange, { y: -0.04, k: 'solid' });
    lb.finish(lg);
    legs.push(lg);
  }
  return { g, head, legs };
}

// 本趟的进度（0 = 避雨处，1 = 绕完一圈回到避雨处）：雨小时向前走，雨大时折回。
// 按时间逐步积分，因此仍然是时间的纯函数，任意时刻都可以直接求值。
function catTrip(t) {
  const k = Math.floor(t / CAT_PERIOD);
  const start = k * CAT_PERIOD + 6;
  const end = start + CAT_WALK;
  const stop = Math.min(t, end);
  const dt = 0.1;
  let u = 0;
  for (let x = start; x < stop; x += dt) {
    const step = Math.min(dt, stop - x);
    u += ((rainAt(x) < 0.72 ? 1 : -1.6) * step) / CAT_WALK;
    u = Math.min(1, Math.max(0, u));
  }
  // 本趟的时间到了，不论走到哪里，都在几秒内慢慢回到避雨处
  if (t > end) u *= Math.max(0, 1 - (t - end) / 4);
  return { k, u, walking: u > 0.002 };
}

function catUpdate(cat, t, cam) {
  const { k, u, walking } = catTrip(t);
  // 每一趟的走法不同：奇数趟沿相反的方向绕行（环路两端都是避雨处，所以首尾衔接）
  const reverse = k % 2 === 1;
  const s = reverse ? 1 - u : u;
  const p = catCurve.getPointAt(s);
  const tg = catCurve.getTangentAt(s);
  if (reverse) tg.negate();
  // 折回时朝向反过来
  if (rainAt(t) >= 0.72) tg.negate();
  cat.g.position.set(p.x, 0.0, p.z);
  const yaw = Math.atan2(tg.x, tg.z);
  cat.g.rotation.y = walking ? yaw : 0.4;
  const ph = walking ? t * 6.2 : 0;
  cat.legs.forEach((lg, i) => {
    lg.rotation.x = walking ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI * 0.5 : 0)) * 0.45 : 0;
  });
  // 抬头看镜头（镜头靠近时才转向）
  const dx = cam.x - p.x, dz = cam.z - p.z;
  const dist = Math.hypot(dx, cam.y - 0.2, dz);
  const look = smooth(14, 6, dist);
  const rel = Math.atan2(dx, dz) - cat.g.rotation.y;
  const wrapped = Math.atan2(Math.sin(rel), Math.cos(rel));
  cat.head.rotation.y = Math.max(-1.1, Math.min(1.1, wrapped)) * look;
  cat.head.rotation.x = -0.35 * look;
  // 被看时抬起的头，平时微微歪着
  cat.head.rotation.z = 0.08 * Math.sin(t * 0.9) * (1 - look);
}

// ---------- 雨（线段，逐帧由顶点着色器计算位置，时间是唯一的推进量）----------
export function buildRain(scene) {
  const N = 1800;
  const pos = new Float32Array(N * 2 * 3);
  const seed = new Float32Array(N * 2 * 4);
  const endv = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const s = [hash1(i * 1.1 + 0.5), hash1(i * 2.3 + 1.7), hash1(i * 3.7 + 2.9), hash1(i * 4.9 + 3.3)];
    for (let e = 0; e < 2; e++) {
      const k = i * 2 + e;
      seed.set(s, k * 4);
      endv[k] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(endv, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.6 },
      uGust: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uRain; uniform float uGust;
      attribute vec4 aSeed; attribute float aEnd;
      varying float vA; varying float vS;
      void main() {
        float H = 26.0;
        // 无界相位决定水平位置（不会在落地回绕时跳变），回绕的相位只决定高度
        float s = aSeed.y * H - uTime * (8.5 + aSeed.z * 2.0);
        float fall = mod(s, H);
        float y = fall - 4.0;
        // 风越大，雨丝越斜（顶端与底端的水平错位）
        float slant = 0.06 + 0.16 * uGust;
        float x = mod((aSeed.x - 0.5) * 30.0 - s * slant + 15.0, 30.0) - 15.0;
        float z = (aSeed.z - 0.5) * 30.0;
        y -= aEnd * 0.55;
        x -= aEnd * 0.55 * slant;
        vec3 p = vec3(x, y, z);
        vA = step(aSeed.w, uRain) * (0.45 + 0.4 * aSeed.w) * smoothstep(-4.5, -3.5, y) * (1.0 - smoothstep(18.0, 22.0, y));
        // 阳光中闪亮的雨丝：每根雨丝各自在某个时刻短暂发亮
        vS = pow(max(0.0, sin(uTime * 7.0 + aSeed.x * 90.0 + aSeed.z * 40.0)), 10.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vS;
      void main() {
        if (vA < 0.01) discard;
        vec3 warm = mix(vec3(1.0, 0.93, 0.72), vec3(1.0, 0.99, 0.9), vS);
        gl_FragColor = vec4(warm, clamp(vA * (0.7 + 0.9 * vS), 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  scene.add(lines);
  return { mat, lines };
}

// ---------- 光柱（阳光穿过高窗、玻璃射入室内）----------
function shaftMesh(origin, len, width) {
  const D = new THREE.Vector3().copy(SUN_DIR).negate().normalize();
  const group = new THREE.Group();
  group.position.copy(origin);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), D);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPh: { value: origin.x * 1.7 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPh; uniform float uDim;
      varying vec2 vUv;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float edge = smoothstep(1.0, 0.15, x);
        float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float st = 0.7 + 0.3 * sin(vUv.x * 26.0 + uTime * 0.8 + uPh);
        float a = edge * fade * st * 0.2 * uDim;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.62), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(width, len, 1, 1);
  geo.translate(0, -len / 2, 0);
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.rotation.y = Math.PI / 2;
  group.add(a, b);
  group.renderOrder = 7;
  return { group, mat };
}

// ---------- 天花板的水面反光（粼光摇曳）----------
function causticPlane(x0, x1, z0, z1, y) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uDim; varying vec3 vP;
      void main() {
        vec2 p = vP.xz * 2.2;
        float t = uTime * 0.8;
        float a = sin(p.x * 1.7 + t) * sin(p.y * 1.9 - t * 1.3) + sin((p.x + p.y) * 1.1 + t * 0.6) * 0.8;
        float band = smoothstep(0.85, 1.05, a) * 0.9 + smoothstep(0.4, 0.5, a) * 0.2;
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.95), band * 0.34 * uDim);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.renderOrder = 8;
  return { mesh: m, mat };
}

// ---------- 彩虹（雨势转弱时浮现在海面上空，远端的弧）----------
function buildRainbow(scene) {
  const cols = ['#ff9fa0', '#ffd39a', '#fff3a6', '#b9f0c2', '#a9e4f5', '#c6b8f5'];
  const mats = cols.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const g = new THREE.Group();
  // 底座远端的海面上空：紧贴远端边缘之外，站在水天之间的弧
  g.position.set(1.0, -3.0, -12.5);
  scene.add(g);
  mats.forEach((m, i) => {
    const r = 8.4 + i * 0.34;
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.2, 6, 64, Math.PI), m);
    g.add(mesh);
  });
  return { g, mats };
}

// ---------- 水滴：屋檐、灯罩、伞沿不时滴落 ----------
function buildDrips(scene, sources) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffe6a6', toneMapped: false });
  const geo = new THREE.SphereGeometry(0.022, 6, 4);
  const list = sources.map((s, i) => {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    return { ...s, m, ph: hash1(i * 5.7) * 9 };
  });
  return list;
}

function updateDrips(list, t) {
  for (const d of list) {
    const T = d.period;
    const age = ((t + d.ph) % T + T) % T;
    const fall = 0.9;
    if (age > fall) {
      d.m.visible = false;
      continue;
    }
    d.m.visible = true;
    const k = age / fall;
    const origin = d.origin ? d.origin() : d.p;
    d.m.position.set(origin.x, origin.y - k * k * (origin.y - (WATER_Y + 0.02)), origin.z);
    d.m.scale.setScalar(1 - k * 0.3);
  }
}

// 灯罩、屋檐与伞沿的滴水位置（伞沿为局部坐标，随伞一起运动）
function dripSources(umb, anchors = []) {
  const src = [];
  const lamps = [[-5.4, 7.2], [-1.6, 4.2], [1.4, 6.6], [9.2, 4.4]];
  lamps.forEach(([x, z], i) => {
    src.push({ p: new THREE.Vector3(x + 0.26, 2.62, z), period: 2.6 + i * 0.4 });
    src.push({ p: new THREE.Vector3(x - 0.18, 2.62, z + 0.18), period: 3.1 + i * 0.3 });
  });
  const w = WAITING;
  src.push({ p: new THREE.Vector3(w.x1 - 0.05, 2.55, w.z1 + 0.02), period: 2.9 });
  src.push({ p: new THREE.Vector3(w.x0 + 0.05, 2.55, w.z1 + 0.02), period: 3.4 });
  const wh = WAREHOUSE;
  src.push({ p: new THREE.Vector3(wh.x1 + 0.15, 2.3, -1.7), period: 3.7 });
  src.push({ p: new THREE.Vector3(wh.x1 + 0.15, 2.3, -0.5), period: 2.4 });
  // 船上的滴水点（舷墙、驾驶舱顶的边角）：用船的局部坐标换算到世界坐标，随船起伏
  const bp = new THREE.Vector3();
  for (const { obj, pts } of anchors) {
    for (const [px, py, pz, period] of pts) {
      src.push({
        origin: () => {
          obj.updateWorldMatrix(true, false);
          bp.set(px, py, pz);
          obj.localToWorld(bp);
          return bp;
        },
        period,
      });
    }
  }
  const lp = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    src.push({
      origin: () => {
        lp.set(Math.cos(a) * 0.5, 1.28, Math.sin(a) * 0.5);
        umb.localToWorld(lp);
        return lp;
      },
      period: 2.2 + i * 0.5,
    });
  }
  return src;
}

// ---------- 外部入口 ----------
export function buildLife(scene, umbrella, boats = []) {
  const anchors = boats;
  const perchPool = [...PERCHES, ...boats.flatMap((b) => (b.perches || []).map((p) => ({ obj: b.obj, p })))];
  const gulls = makeGulls(scene, perchPool);
  const cat = catModel();
  cat.g.scale.setScalar(1.3);
  scene.add(cat.g);
  const rain = buildRain(scene);
  const shafts = [];
  const shaftSpecs = [
    [new THREE.Vector3(-9.25, 2.0, -2.45), 3.2, 0.7],
    [new THREE.Vector3(-9.25, 2.0, -1.45), 3.2, 0.6],
    [new THREE.Vector3(-9.25, 2.0, -0.45), 3.2, 0.6],
    [new THREE.Vector3(5.6, 2.3, 9.3), 3.4, 0.9],
    [new THREE.Vector3(7.4, 2.3, 9.3), 3.2, 0.7],
    // 白色小渔船的驾驶舱顶：阳光穿过舱顶的玻璃与遮阳棚漏进舱内
    [new THREE.Vector3(-2.35, 1.45, -1.85), 1.9, 0.42],
  ];
  for (const [o, len, w] of shaftSpecs) {
    const s = shaftMesh(o, len, w);
    scene.add(s.group);
    shafts.push(s);
  }
  const caust = [
    causticPlane(WAREHOUSE.x0 + 0.3, WAREHOUSE.x1 - 0.3, WAREHOUSE.z0 + 0.3, WAREHOUSE.z1 - 0.3, 2.35),
    causticPlane(WAITING.x0 + 0.3, WAITING.x1 - 0.3, WAITING.z0 + 0.3, WAITING.z1 - 0.3, 2.42),
    // 小渔船驾驶舱的顶棚：水面的粼光投在舱顶
    causticPlane(-2.9, -2.2, -2.55, -1.75, 0.12),
  ];
  for (const c of caust) scene.add(c.mesh);
  const rainbow = buildRainbow(scene);
  const drips = buildDrips(scene, dripSources(umbrella, anchors));

  return {
    update(t, cam, rainValue, dim = 0, gust = 0) {
      updateGulls(gulls, t, cam);
      catUpdate(cat, t, cam);
      rain.mat.uniforms.uTime.value = t;
      // 阵风来时雨势更密、雨丝更斜
      rain.mat.uniforms.uRain.value = Math.min(1, rainValue + 0.25 * gust);
      rain.mat.uniforms.uGust.value = gust;
      for (const s of shafts) {
        s.mat.uniforms.uTime.value = t;
        s.mat.uniforms.uDim.value = 1 - 0.75 * dim;
      }
      for (const c of caust) {
        c.mat.uniforms.uTime.value = t;
        c.mat.uniforms.uDim.value = 1 - 0.75 * dim;
      }
      const rb = rainbowAt(t) * 0.6;
      rainbow.mats.forEach((m, i) => (m.opacity = rb * (0.7 + 0.3 * wob(t * 0.5, i))));
      updateDrips(drips, t);
    },
  };
}
