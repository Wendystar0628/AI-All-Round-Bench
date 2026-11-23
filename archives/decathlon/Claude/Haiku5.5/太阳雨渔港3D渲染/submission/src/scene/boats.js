import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { canvasTex, texMat, addOutline } from '../core/materials.js';
import { hash1 } from '../core/wave.js';
import { WATER_Y } from './layout.js';
import { sportState, wakeHeight, tripProgress } from './route.js';
import { DynRope, cleatWorld } from './ropes.js';

// 系船柱与浮标的系缆点（与 quay.js 中的位置一致）
const BOLLARD_TOP = 0.34;
const BOLLARD_SMALL_BOW = new THREE.Vector3(-4.45, BOLLARD_TOP, -1.1);
const BOLLARD_SMALL_STERN = new THREE.Vector3(-4.45, BOLLARD_TOP, -3.6);
const BOLLARD_OPEN_BOW = new THREE.Vector3(4.2, BOLLARD_TOP, 3.45);
const BOLLARD_OPEN_STERN = new THREE.Vector3(-1.2, BOLLARD_TOP, 3.45);
const BUOY_TIE = new THREE.Vector3(-0.6, WATER_Y + 0.26, -0.4);

const DECK = 0.2;

// 船体：俯视为带尖首的多边形，沿 Z 轴（船首 +Z）挤出，船底在水下
function hullGeometry(L, B) {
  const pts = [
    [-B / 2, -L / 2],
    [B / 2, -L / 2],
    [B / 2, L * 0.22],
    [B * 0.32, L * 0.46],
    [0, L / 2],
    [-B * 0.32, L * 0.46],
    [-B / 2, L * 0.22],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.3, 0);
  return g;
}

// 驾驶舱：四角立柱、前风挡、侧窗（玻璃）、敞开的右舷舱门、舱内陈设
function cabin(b, cfg) {
  const { cx, cz, W, Ln, H, glassK = 'glass' } = cfg;
  const yf = DECK;
  const x0 = cx - W / 2, x1 = cx + W / 2;
  const z0 = cz - Ln / 2, z1 = cz + Ln / 2;
  const wall = P.boatWhite;

  // 舱底与地板（深色防滑板）
  b.box(W, 0.03, Ln, '#7d8c90', { x: cx, y: yf + 0.02, z: cz, k: 'solid' });
  // 左舷（-X）：下部实墙，上部为侧窗（玻璃）
  b.box(0.05, 0.36, Ln, wall, { x: x0, y: yf + 0.2, z: cz, k: 'solid' });
  b.box(0.02, 0.42, Ln * 0.84, P.glassTint, { x: x0 - 0.01, y: yf + 0.6, z: cz, k: glassK });
  b.box(0.05, H - 0.42, Ln, wall, { x: x0, y: yf + 0.82, z: cz, k: 'solid' });
  for (let i = 0; i <= 3; i++) b.box(0.06, 0.42, 0.04, '#e6eeee', { x: x0 - 0.01, y: yf + 0.6, z: z0 + Ln * 0.08 + i * (Ln * 0.84) / 3, k: 'solid' });
  // 右舷（+X）：后半段实墙，前半段为敞开的舱门
  b.box(0.05, H, Ln * 0.45, wall, { x: x1, y: yf + H / 2, z: z0 + Ln * 0.275, k: 'solid' });
  b.box(0.05, 0.36, Ln * 0.5, wall, { x: x1, y: yf + 0.2, z: cz + Ln * 0.25, k: 'solid' });
  b.box(0.05, 0.42, Ln * 0.5, P.glassTint, { x: x1 + 0.01, y: yf + 0.6, z: cz + Ln * 0.25, k: glassK });
  // 敞开的舱门（向外推开约 60°）
  b.box(0.03, H - 0.1, Ln * 0.42, '#eaf2f2', { x: x1 + 0.28, y: yf + H / 2 - 0.02, z: z0 + Ln * 0.1, ry: 0.0, k: 'solid' });
  b.box(0.03, 0.06, Ln * 0.42, P.boatStripe, { x: x1 + 0.28, y: yf + 0.1, z: z0 + Ln * 0.1, k: 'solid' });
  // 前风挡：略微后仰的玻璃
  b.box(W, 0.5, 0.02, P.glassTint, { x: cx, y: yf + 0.62, z: z1 + 0.01, rx: -0.4, k: glassK });
  for (const xx of [x0 + 0.02, cx, x1 - 0.02]) b.box(0.05, 0.56, 0.05, wall, { x: xx, y: yf + 0.62, z: z1 - 0.01, rx: -0.4, k: 'solid' });
  // 后墙（后面的实墙上有一扇小窗）
  b.box(W, H, 0.05, wall, { x: cx, y: yf + H / 2, z: z0, k: 'solid' });
  b.box(0.36, 0.3, 0.02, P.glassTint, { x: cx + W * 0.2, y: yf + 0.62, z: z0 - 0.01, k: glassK });

  // ---- 舱内陈设（均可从舷窗与敞开的舱门看到）----
  const zc = z1 - 0.2;
  // 操纵台
  b.box(W * 0.94, 0.24, 0.24, '#5f6e73', { x: cx, y: yf + 0.12, z: zc, k: 'solid' });
  b.box(W * 0.94, 0.03, 0.27, '#9aa9ad', { x: cx, y: yf + 0.255, z: zc, k: 'solid' });
  // 舵：转向轮（倾斜）与立柱
  b.cyl(0.018, 0.018, 0.34, P.iron, { x: cx - W * 0.1, y: yf + 0.3, z: zc - 0.02, rx: -0.5, k: 'solid' }, 6);
  b.tor(0.1, 0.014, '#2d3437', { x: cx - W * 0.1, y: yf + 0.5, z: zc + 0.05, rx: -0.7, k: 'solid' }, 6, 14);
  b.box(0.06, 0.05, 0.06, '#2d3437', { x: cx - W * 0.1, y: yf + 0.48, z: zc - 0.01, k: 'solid' });
  // 雷达屏与鱼探仪（微微发光）
  b.box(0.2, 0.14, 0.02, '#1f3a3b', { x: cx + W * 0.2, y: yf + 0.4, z: zc - 0.12, rx: -0.4, k: 'solid' });
  b.box(0.17, 0.11, 0.01, '#7ff0c8', { x: cx + W * 0.2, y: yf + 0.4, z: zc - 0.125, rx: -0.4, k: 'emit' });
  b.box(0.14, 0.1, 0.02, '#2a2f33', { x: cx + W * 0.36, y: yf + 0.38, z: zc - 0.12, rx: -0.4, k: 'solid' });
  b.box(0.12, 0.08, 0.01, '#ffb36b', { x: cx + W * 0.36, y: yf + 0.38, z: zc - 0.125, rx: -0.4, k: 'emit' });
  // 保温壶与搪瓷杯
  b.cyl(0.04, 0.042, 0.2, '#d8e2e6', { x: cx - W * 0.33, y: yf + 0.34, z: zc - 0.05, k: 'solid' }, 10);
  b.cyl(0.042, 0.042, 0.03, '#3d6e8c', { x: cx - W * 0.33, y: yf + 0.46, z: zc - 0.05, k: 'solid' }, 10);
  b.lathe([[0.001, 0], [0.05, 0.005], [0.05, 0.08], [0.001, 0.08]], P.white, { x: cx - W * 0.2, y: yf + 0.28, z: zc - 0.02, k: 'solid' }, 10);
  b.tor(0.05, 0.007, '#2f6fa8', { x: cx - W * 0.2, y: yf + 0.36, z: zc - 0.02, rx: Math.PI / 2, k: 'solid' }, 6, 12);
  // 后墙上的海图与潮汐表（夹在夹板上）
  const bz = z0 + 0.04;
  b.box(0.42, 0.34, 0.015, '#9c7a52', { x: cx - 0.05, y: yf + 0.55, z: bz + 0.02, k: 'solid' });
  b.box(0.38, 0.3, 0.01, '#f6fbfc', { x: cx - 0.05, y: yf + 0.55, z: bz + 0.03, k: 'solid' });
  for (let i = 0; i < 4; i++) b.box(0.3, 0.012, 0.005, '#3b7fb0', { x: cx - 0.05, y: yf + 0.42 + i * 0.07, z: bz + 0.04, k: 'solid' });
  b.box(0.1, 0.08, 0.01, '#f6fbfc', { x: cx + 0.2, y: yf + 0.5, z: bz + 0.03, k: 'solid' });
  // 挂在钩上的黄色雨衣（左舷内侧，朝向舱内可见）
  const rx0 = x0 + 0.05;
  b.cyl(0.008, 0.008, 0.08, P.iron, { x: rx0 + 0.02, y: yf + 0.8, z: cz - Ln * 0.25, rz: 0.0, k: 'solid' }, 4);
  b.ell(0.02, 0.2, 0.13, P.yellowRain, { x: rx0 + 0.04, y: yf + 0.55, z: cz - Ln * 0.25, k: 'solid' }, 10, 8);
  b.ell(0.02, 0.12, 0.04, '#f0b52a', { x: rx0 + 0.05, y: yf + 0.42, z: cz - Ln * 0.25 + 0.13, k: 'solid' }, 8, 6);
  b.box(0.02, 0.04, 0.2, '#f0b52a', { x: rx0 + 0.04, y: yf + 0.72, z: cz - Ln * 0.25, k: 'solid' });
  // 贴在窗边的护身符与渔获照片
  b.box(0.01, 0.05, 0.03, '#c83b33', { x: x0 + 0.04, y: yf + 0.7, z: cz + Ln * 0.2, k: 'solid' });
  b.box(0.01, 0.12, 0.16, '#f1f4f2', { x: x0 + 0.04, y: yf + 0.52, z: cz + Ln * 0.04, k: 'solid' });
  b.box(0.012, 0.08, 0.12, '#e1894f', { x: x0 + 0.045, y: yf + 0.52, z: cz + Ln * 0.04, k: 'solid' });
  // 座椅
  b.box(0.36, 0.1, 0.4, '#2e7c8a', { x: cx + W * 0.1, y: yf + 0.18, z: cz - 0.05, k: 'solid' });
  b.box(0.36, 0.3, 0.06, '#2e7c8a', { x: cx + W * 0.1, y: yf + 0.4, z: z0 + 0.1, k: 'solid' });
  // 天花顶灯（自发光）
  b.box(0.12, 0.02, 0.1, '#fff6d6', { x: cx, y: yf + H - 0.02, z: cz, k: 'emit' });
}

// 车顶：遮阳铁架（半透明帆布）、桅杆、天线、雷达罩（雷达臂另作旋转）
function roofGear(b, cfg, radarOut) {
  const { cx, cz, W, Ln, H } = cfg;
  const yt = DECK + H;
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - Ln / 2, z1 = cz + Ln / 2;
  // 四根立柱
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.cyl(0.02, 0.02, 0.5, P.iron, { x, y: yt + 0.25, z, k: 'solid' }, 6);
  // 上方的铁架（遮阳棚的骨架）
  for (const z of [z0, z1]) b.cyl(0.015, 0.015, W + 0.1, P.iron, { x: cx, y: yt + 0.5, z, rz: Math.PI / 2, k: 'solid' }, 5);
  for (const x of [x0, x1]) b.cyl(0.015, 0.015, Ln + 0.1, P.iron, { x, y: yt + 0.5, z: cz, rx: Math.PI / 2, k: 'solid' }, 5);
  // 桅杆与天线
  b.cyl(0.02, 0.02, 1.2, P.iron, { x: cx - W * 0.2, y: yt + 1.1, z: z0 + 0.12, k: 'solid' }, 5);
  b.cyl(0.006, 0.006, 0.8, '#252c30', { x: cx - W * 0.2 + 0.05, y: yt + 1.0, z: z0 + 0.12, k: 'solid' }, 4);
  // 雷达罩（半球）
  b.add(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), P.white, { x: cx - W * 0.2 + 0.0, y: yt + 1.25, z: z0 + 0.12, k: 'solid' });
  // 雷达臂（单独旋转）
  const arm = new THREE.Group();
  arm.position.set(cx - W * 0.2, yt + 1.22, z0 + 0.12);
  const ab = new Builder();
  ab.box(0.34, 0.03, 0.06, P.iron, { k: 'solid' });
  ab.finish(arm);
  radarOut.push(arm);
  b.radarArm = arm;
  // 顶灯
  b.sph(0.03, '#ffe9a0', { x: cx, y: yt + 0.02, z: cz, k: 'emit' }, 6, 4);
}

function lifeRing(b, x, y, z, ry) {
  // 橙白相间的救生圈：两段圆弧
  b.tor(0.12, 0.028, P.lifeOrange, { x, y, z, ry, k: 'solid' }, 6, 16, Math.PI);
  b.tor(0.12, 0.028, P.white, { x, y, z, ry: ry + Math.PI, k: 'solid' }, 6, 16, Math.PI);
}

// 通用的船体：船身、甲板、护舷、条纹与锈迹；可选驾驶舱
export function makeBoat(parent, cfg) {
  const { L, B, withCabin } = cfg;
  const b = new Builder();
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  parent.add(group);

  // 船体与甲板
  b.add(hullGeometry(L, B), P.boatWhite, { k: 'solid' });
  b.box(B - 0.12, 0.03, L - 0.3, '#dfe9ea', { x: 0, y: DECK + 0.005, z: 0, k: 'solid' });
  // 船身两侧的蓝色条纹与斑驳锈迹
  for (const s of [-1, 1]) {
    b.box(0.02, 0.07, L * 0.66, P.boatStripe, { x: s * (B / 2 + 0.005), y: 0.03, z: -L * 0.05, k: 'solid' });
    for (let i = 0; i < 5; i++) {
      const z = -L * 0.36 + hash1(i * 7.3 + L + s) * L * 0.7;
      b.box(0.022, 0.06 + hash1(i) * 0.08, 0.1 + hash1(i * 3.1) * 0.1, P.rust, { x: s * (B / 2 + 0.006), y: -0.1 + hash1(i * 5.3) * 0.15, z, k: 'solid' });
    }
    // 舷墙栏杆
    b.box(0.03, 0.04, L * 0.8, '#c9d4d6', { x: s * (B / 2 - 0.02), y: DECK + 0.1, z: 0, k: 'solid' });
    // 舷墙上挂着的雨珠（阳光下的细小暖光）
    for (let i = 0; i < 6; i++) {
      const z = -L * 0.36 + (i / 5) * L * 0.72;
      b.sph(0.016, '#ffe2a0', { x: s * (B / 2 - 0.02), y: DECK + 0.135, z, k: 'emit' }, 5, 4);
    }
    // 旧轮胎护舷
    for (const zz of [-L * 0.28, L * 0.2]) b.tor(0.12, 0.045, '#2a3133', { x: s * (B / 2 + 0.03), y: 0.0, z: zz, ry: Math.PI / 2, k: 'solid' }, 6, 14);
  }
  // 船首与船尾的缆桩（ropes 连接点）
  const cleats = { bow: [0, DECK + 0.1, L / 2 - 0.25], stern: [0, DECK + 0.1, -L / 2 + 0.15] };
  b.box(0.1, 0.06, 0.1, P.iron, { x: 0, y: DECK + 0.05, z: cleats.bow[2], k: 'solid' });
  b.box(0.1, 0.06, 0.1, P.iron, { x: 0, y: DECK + 0.05, z: cleats.stern[2], k: 'solid' });
  // 船名（船首侧的小字牌）
  // 船首与船尾的救生圈
  lifeRing(b, -B / 2 - 0.03, 0.25, -L * 0.15, Math.PI / 2);
  lifeRing(b, B / 2 + 0.03, 0.25, -L * 0.15, -Math.PI / 2);
  const radarArms = [];
  let cab = null;
  if (withCabin) {
    cab = { cx: cfg.cabinX || 0, cz: cfg.cabinZ || -L * 0.05, W: cfg.cabinW || B * 0.78, Ln: cfg.cabinL || L * 0.38, H: cfg.cabinH || 0.85 };
    cabin(b, cab);
    roofGear(b, cab, radarArms);
    // 桅杆上的顶灯与舷外机之外的小细节
    lifeRing(b, cab.cx + cab.W / 2 + 0.04, DECK + 0.45, cab.cz + cab.Ln * 0.2, Math.PI / 2);
  } else {
    // 敞篷船：T 形遮阳棚（半透明）+ 甲板上的鱼箱、冰箱与鱼竿
    for (const [x, z] of [[-B * 0.4, -L * 0.2], [B * 0.4, -L * 0.2], [-B * 0.4, L * 0.22], [B * 0.4, L * 0.22]]) {
      b.cyl(0.02, 0.02, 1.2, P.iron, { x, y: DECK + 0.6, z, k: 'solid' }, 6);
    }
    b.box(B * 0.95, 0.03, L * 0.5, '#ffffff', { x: 0, y: DECK + 1.2, z: -L * 0.05, k: 'glass' });
    b.box(B * 0.9, 0.05, L * 0.52, '#e9f1f1', { x: 0, y: DECK + 1.23, z: -L * 0.05, k: 'solid' });
    // 甲板物件：白色冰箱、两只鱼箱、鱼竿
    b.box(0.5, 0.36, 0.7, P.boxWhite, { x: -B * 0.12, y: DECK + 0.2, z: -L * 0.02, k: 'solid' });
    b.box(0.52, 0.04, 0.72, '#b7c6c8', { x: -B * 0.12, y: DECK + 0.4, z: -L * 0.02, k: 'solid' });
    b.box(0.38, 0.2, 0.3, P.crateBlue, { x: B * 0.22, y: DECK + 0.12, z: -L * 0.2, k: 'solid' });
    b.box(0.38, 0.2, 0.3, P.crateBlue, { x: B * 0.22, y: DECK + 0.12, z: -L * 0.2 + 0.32, k: 'solid' });
    b.cyl(0.03, 0.03, 1.3, '#4c5b61', { x: B * 0.36, y: DECK + 0.8, z: L * 0.1, rz: 0.25, k: 'solid' }, 5);
    b.cyl(0.03, 0.03, 1.2, '#4c5b61', { x: -B * 0.36, y: DECK + 0.75, z: L * 0.05, rz: -0.2, k: 'solid' }, 5);
    // 舷外挂机
    b.box(0.2, 0.42, 0.22, '#3a4d55', { x: 0, y: DECK + 0.1, z: -L / 2 - 0.12, k: 'solid' });
    b.cyl(0.02, 0.02, 0.4, '#2c3840', { x: 0, y: DECK - 0.05, z: -L / 2 - 0.12, k: 'solid' }, 5);
    // 小桶与网具
    b.cyl(0.14, 0.12, 0.28, '#4a9bd6', { x: B * 0.1, y: DECK + 0.14, z: L * 0.25, k: 'solid' }, 10);
    b.box(0.38, 0.02, 0.22, '#c9b26b', { x: -B * 0.3, y: DECK + 0.02, z: L * 0.22, k: 'solid' });
    b.ell(0.04, 0.12, 0.04, '#e9f7f3', { x: -B * 0.3, y: DECK + 0.14, z: L * 0.25, k: 'solid' }, 6, 4);
    lifeRing(b, 0, DECK + 1.25, -L * 0.42, 0);
  }
  b.finish(group);
  for (const arm of radarArms) group.add(arm);
  return { group, cleats, radarArms, cab };
}

// 游钓船（有驾驶舱，出港绕防波堤）：动态路线 + 波浪起伏
export function buildSportBoat(scene, dyn) {
  const boat = makeBoat(scene, { L: 3.1, B: 1.2, withCabin: true, cabinX: 0, cabinZ: -0.35, cabinW: 0.92, cabinL: 1.1, cabinH: 0.9 });
  const ph = 0.7;
  const g = boat.group;
  // 停泊时系在防波堤内侧的浮标上；出港时缆绳解开（隐藏）
  const rope = new DynRope(scene, 1.3);
  boat.update = (t) => {
    const s = sportState(t);
    const h = wakeHeight(s.x, s.z, t);
    g.position.set(s.x, WATER_Y + 0.02 + 0.035 * Math.sin(t * 1.4 + ph) + h * 0.9, s.z);
    g.rotation.set(0.018 * Math.sin(t * 1.1 + ph) + 0.25 * h, s.ry, 0.03 * Math.sin(t * 1.7 + ph) + 0.3 * h);
    boat.radarArms.forEach((a) => (a.rotation.y = t * 1.3));
    rope.setVisible(!tripProgress(t).moving);
    if (rope.visible) rope.update(t, BUOY_TIE, cleatWorld(g, boat.cleats.stern), 0.22);
  };
  dyn.push(boat);
  return boat;
}

// 远处的小渔船：在外侧水道（防波堤与航线之间）缓缓往返，尺寸缩小，只在远处可见
export function buildFarBoat(scene, dyn) {
  const boat = makeBoat(scene, { L: 2.6, B: 1.05, withCabin: false });
  const g = boat.group;
  g.scale.setScalar(0.42);
  boat.update = (t) => {
    const c = Math.cos(t * 0.12);
    const x = -2.4 + 0.8 * Math.sin(t * 0.12);
    g.position.set(x, WATER_Y + 0.02 + 0.03 * Math.sin(t * 1.3), -7.2);
    g.rotation.set(0.015 * Math.sin(t * 1.0), Math.sign(c || 1) * Math.PI / 2, 0.02 * Math.sin(t * 1.5));
  };
  dyn.push(boat);
  return boat;
}

// 白色小渔船（有驾驶舱，停泊在纵臂一侧）
export function buildSmallBoat(scene, dyn) {
  const at = BERTH_SMALL;
  const boat = makeBoat(scene, { L: 2.5, B: 1.1, withCabin: true, cabinX: 0, cabinZ: -0.15, cabinW: 0.8, cabinL: 0.9, cabinH: 0.82 });
  const g = boat.group;
  g.position.set(at.x, WATER_Y, at.z);
  g.rotation.y = at.ry;
  const ropeBow = new DynRope(scene, 2.1);
  const ropeStern = new DynRope(scene, 3.4);
  boat.update = (t) => {
    // 偶尔被涌浪推向岸壁：护舷轮胎轻碰石墙
    const bump = Math.pow(Math.max(0, Math.sin(t * 0.31 + 1.0)), 16);
    const x = at.x - 0.7 * bump;
    const h = wakeHeight(x, at.z, t);
    g.position.set(x, WATER_Y + 0.02 + 0.03 * Math.sin(t * 1.2 + 2.1) + h * 0.9, at.z);
    g.rotation.x = 0.016 * Math.sin(t * 0.9 + 2.1) + 0.2 * h;
    g.rotation.z = 0.025 * Math.sin(t * 1.5 + 0.4) + 0.3 * h;
    boat.radarArms.forEach((a) => (a.rotation.y = t * 1.3));
    ropeBow.update(t, BOLLARD_SMALL_BOW, cleatWorld(g, boat.cleats.bow), 0.2);
    ropeStern.update(t, BOLLARD_SMALL_STERN, cleatWorld(g, boat.cleats.stern), 0.2);
  };
  dyn.push(boat);
  return boat;
}

// 前臂一侧的白色小型渔船（敞篷，T 形遮阳棚）
export function buildOpenBoat(scene, dyn) {
  const at = BERTH_OPEN;
  const boat = makeBoat(scene, { L: 2.6, B: 1.05, withCabin: false });
  const g = boat.group;
  g.position.set(at.x, WATER_Y, at.z);
  g.rotation.y = at.ry;
  const ropeBow = new DynRope(scene, 4.6);
  const ropeStern = new DynRope(scene, 5.3);
  boat.update = (t) => {
    const h = wakeHeight(at.x, at.z, t);
    g.position.y = WATER_Y + 0.02 + 0.03 * Math.sin(t * 1.25 + 4.0) + h * 0.9;
    g.rotation.x = 0.014 * Math.sin(t * 1.0 + 4.0) + 0.2 * h;
    g.rotation.z = 0.02 * Math.sin(t * 1.6 + 1.2) + 0.3 * h;
    ropeBow.update(t, BOLLARD_OPEN_BOW, cleatWorld(g, boat.cleats.bow), 0.18);
    ropeStern.update(t, BOLLARD_OPEN_STERN, cleatWorld(g, boat.cleats.stern), 0.18);
  };
  dyn.push(boat);
  return boat;
}

// 泊位（船的中心与朝向）
const BERTH_SMALL = { x: -2.55, z: -2.0, ry: 0.0 };
const BERTH_OPEN = { x: 2.4, z: 2.08, ry: Math.PI / 2 };

// 游钓船尾拖出的白色航迹：沿航线过去几秒钟的船尾位置连成一条带子，越远越淡，融入水色
export function buildWakeTrail(scene, dyn) {
  const N = 26;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3);
  const col = new Float32Array(N * 2 * 3);
  const idx = [];
  for (let k = 0; k < N - 1; k++) {
    const a = 2 * k, b = 2 * k + 1, c = 2 * k + 2, d = 2 * k + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const white = new THREE.Color('#f7fdfc');
  const water = new THREE.Color('#9fe6dc');
  const c = new THREE.Color();
  dyn.push({
    update(t) {
      for (let k = 0; k < N; k++) {
        const s = sportState(t - k * 0.32);
        // 船尾位置（船首朝向 +Z 的局部坐标，船尾在朝向的反方向约 1.4 处）
        const fx = Math.sin(s.ry), fz = Math.cos(s.ry);
        const sx = s.x - fx * 1.4, sz = s.z - fz * 1.4;
        const w = 0.14 + 0.03 * k;
        const px = fz, pz = -fx;
        const h = WATER_Y + 0.04;
        const i = 2 * k * 3;
        pos[i] = sx + px * w; pos[i + 1] = h; pos[i + 2] = sz + pz * w;
        pos[i + 3] = sx - px * w; pos[i + 4] = h; pos[i + 5] = sz - pz * w;
        const f = k / (N - 1);
        c.copy(white).lerp(water, Math.pow(f, 0.8));
        // 没有航行时航迹收起（颜色与水面一致，看不出来）
        if (!s.moving) c.copy(water);
        col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
        col[i + 3] = c.r; col[i + 4] = c.g; col[i + 5] = c.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  });
}
