import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { canvasTex, texMat, flatMat, addOutline } from '../core/materials.js';
import { hash1, windAt, WIND_DIR } from '../core/wave.js';
import { WATER_Y } from './layout.js';
import { wakeHeight } from './route.js';
import { staticRope } from './ropes.js';

const FONT = "'Microsoft YaHei', 'SimHei', 'PingFang SC', sans-serif";

// 把一批静态小件挂到新建的 Group 上（多材质，一次合并）
function staticGroup(parent, fn, name) {
  const g = new THREE.Group();
  g.name = name || 'prop';
  const b = new Builder();
  fn(b, g);
  b.finish(g);
  parent.add(g);
  return g;
}

// 黑色铸铁系船柱
function bollard(b, x, z) {
  b.cyl(0.15, 0.17, 0.12, P.iron, { x, y: 0.06, z, k: 'solid' }, 12);
  b.lathe([[0.1, 0], [0.085, 0.1], [0.11, 0.2], [0.095, 0.27], [0.1, 0.32], [0.0, 0.34]], P.iron, { x, y: 0.1, z, k: 'solid' }, 12);
  b.cyl(0.05, 0.05, 0.05, P.ironLight, { x, y: 0.31, z, k: 'solid' }, 10);
}

// 码头灯柱：细杆 + 圆环形灯罩 + 暖色灯泡（灯泡为自发光）
function lampPost(b, x, z) {
  b.cyl(0.07, 0.09, 0.14, P.iron, { x, y: 0.07, z, k: 'solid' }, 10);
  b.cyl(0.03, 0.035, 2.5, P.iron, { x, y: 1.32, z, k: 'solid' }, 8);
  b.box(0.42, 0.04, 0.05, P.iron, { x, y: 2.52, z, k: 'solid' });
  b.tor(0.2, 0.045, P.ironSilver, { x, y: 2.72, z, rx: Math.PI / 2, k: 'solid' }, 8, 24);
  b.cone(0.26, 0.2, P.white, { x, y: 2.9, z, k: 'solid' }, 20);
  b.cyl(0.035, 0.035, 0.12, P.iron, { x, y: 3.06, z, k: 'solid' }, 6);
  b.sph(0.1, '#ffe7a6', { x, y: 2.62, z, k: 'emit' }, 10, 6);
  // 灯罩边缘挂着的雨珠
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + hash1(i * 2.1 + x) * 0.2;
    b.sph(0.017, '#ffe9b0', { x: x + Math.cos(a) * 0.22, y: 2.7, z: z + Math.sin(a) * 0.22, k: 'emit' }, 6, 4);
  }
}

// 鱼箱：白色塑料箱带纵向肋条，周转筐为蓝色
function fishBox(b, x, y, z, ry = 0, blue = false) {
  const c = blue ? P.crateBlue : P.boxWhite;
  const o = { x, y: y + 0.14, z, ry, k: 'solid' };
  b.box(0.62, 0.28, 0.42, c, o);
  b.box(0.52, 0.04, 0.32, blue ? '#2c5f9c' : '#c7d3d3', { x, y: y + 0.27, z, ry, k: 'solid' });
  for (let i = -1; i <= 1; i++) {
    const dx = i * 0.2;
    const ox = Math.cos(ry) * dx, oz = -Math.sin(ry) * dx;
    b.box(0.03, 0.22, 0.44, '#c6d0cf', { x: x + ox, y: y + 0.13, z: z + oz, ry, k: 'solid' });
  }
}

// 晒网架 + 渔网（网面为画布贴图，带透明通道）
function netCanvas() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,78,88,0.85)';
    g.lineWidth = 3;
    for (let i = 0; i <= w; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
    g.fillStyle = 'rgba(40,78,88,0.85)';
    for (let x = 0; x <= w; x += 32) for (let y = 0; y <= h; y += 32) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  });
}

function signCanvas() {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#f6f2e6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f6f80';
    g.lineWidth = 14;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#24566a';
    g.font = `bold 112px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('晴波港', w / 2, h * 0.4);
    g.fillStyle = '#c8452f';
    g.fillRect(70, h * 0.7, w - 140, 62);
    g.fillStyle = '#fff7ea';
    g.font = `bold 50px ${FONT}`;
    g.fillText('注意落水', w / 2, h * 0.7 + 32);
    // 日晒褪色：薄薄的纸色罩层
    g.globalAlpha = 0.2;
    g.fillStyle = '#e8dcc0';
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  });
}

function buoyCanvas(num) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#f5f7f6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e4593d';
    g.fillRect(0, 0, w, h * 0.42);
    g.fillStyle = '#e8ecea';
    g.font = `bold 70px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#5f6f70';
    g.globalAlpha = 0.75;
    g.fillText(String(num), w / 2, h * 0.7);
    g.globalAlpha = 1;
  });
}

// 构建码头上的静态道具与需要动起来的部件；返回动态对象列表
export function buildQuay(scene, dyn) {
  // ---- 系船柱（前臂与纵臂的内沿）----
  staticGroup(scene, (b) => {
    for (const x of [-1.2, 4.2, 9.1]) bollard(b, x, 3.45);
    for (const z of [-3.6, -1.1, 1.4]) bollard(b, -4.45, z);
    // 系着缆绳的柱子：缆绳在柱身上绕了数圈
    for (const [x, z] of [[-1.2, 3.45], [4.2, 3.45], [-4.45, -1.1], [-4.45, -3.6]]) {
      for (let i = 0; i < 3; i++) b.tor(0.165, 0.022, P.rope, { x, y: 0.1 + i * 0.045, z, rx: Math.PI / 2, k: 'thin' }, 5, 14);
    }
    // 缆绳在柱子上绕了几圈后垂入水中（浸水部分颜色加深）
    const rope = (pts) => staticRope(scene, pts);
    rope([[-1.2, 0.3, 3.45], [-1.2, 0.22, 3.6], [-0.9, 0.05, 3.55], [-0.6, -0.4, 3.3], [-0.5, -0.9, 2.9], [-0.5, -1.05, 2.6]]);
    rope([[4.2, 0.3, 3.45], [4.25, 0.1, 3.3], [4.0, -0.3, 3.0], [3.9, -0.95, 2.7], [3.9, -1.0, 2.5]]);
    rope([[-4.45, 0.3, -1.1], [-4.1, 0.1, -1.0], [-3.7, -0.4, -1.0], [-3.6, -0.9, -1.05], [-3.5, -1.02, -1.1]]);
  }, 'bollards');

  // ---- 灯柱与电线 ----
  const lamps = [
    [-5.4, 7.2],
    [-1.6, 4.2],
    [1.4, 6.6],
    [9.2, 4.4],
  ];
  staticGroup(scene, (b) => {
    for (const [x, z] of lamps) lampPost(b, x, z);
    // 电线：在灯柱顶端之间斜斜垂下
    const wires = [
      [[-5.4, 2.6, 7.2], [-3.2, 2.2, 5.8], [-1.6, 2.6, 4.2]],
      [[-1.6, 2.6, 4.2], [0.0, 2.2, 5.5], [1.4, 2.6, 6.6]],
      [[1.4, 2.6, 6.6], [5.2, 2.0, 5.6], [9.2, 2.6, 4.4]],
    ];
    for (const w of wires) b.tube(w, 0.012, '#2e3b40', { k: 'thin' }, 16, 4);
  }, 'lamps');
  // 灯泡的暖光晕（发光的小圆盘，贴在灯罩下方）
  for (const [x, z] of lamps) {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    glow.position.set(x, 2.6, z);
    glow.rotation.x = -Math.PI / 2;
    scene.add(glow);
  }

  // ---- 鱼箱、周转筐与堆放的货物 ----
  staticGroup(scene, (b) => {
    fishBox(b, -8.6, 0, 4.2, 0);
    fishBox(b, -8.6, 0.28, 4.2, 0);
    fishBox(b, -8.6, 0.56, 4.2, 0.05);
    fishBox(b, -7.4, 0, 3.3, 0.3, true);
    fishBox(b, -7.4, 0.28, 3.3, 0.3, true);
    fishBox(b, -6.6, 0, 2.0, 1.2);
    fishBox(b, -6.6, 0.28, 2.0, 1.25);
    fishBox(b, -6.6, 0, 1.2, -0.2, true);
    // 托盘上堆着的鱼箱：木托盘（三块板 + 三根垫条）加两层鱼箱
    const px = 0.4, pz = 5.2;
    for (const dz of [-0.36, 0, 0.36]) b.box(1.1, 0.03, 0.14, "#c49a62", { x: px, y: 0.015, z: pz + dz, k: "solid" });
    for (const dx of [-0.45, 0, 0.45]) b.box(0.12, 0.1, 0.8, "#a0763f", { x: px + dx, y: 0.06, z: pz, k: "solid" });
    fishBox(b, px - 0.2, 0.12, pz);
    fishBox(b, px - 0.2, 0.4, pz);
    fishBox(b, px + 0.3, 0.12, pz, 0, true);
    // 蟹笼（绿色网格的方箱，顶部有开口的圈）与地上盘好的缆绳
    // 蟹笼：底框 + 四面的竖条与横条 + 顶部的漏斗口
    const pw = 0.5, pd = 0.4, ph = 0.28;
    b.box(pw, 0.03, pd, '#3e4a2e', { x: -7.6, y: 0.015, z: -5.6, ry: 0.3, k: 'solid' });
    for (let i = 0; i <= 4; i++) {
      const u = -pw / 2 + (i * pw) / 4;
      b.box(0.012, ph, 0.012, '#6b7b52', { x: -7.6, y: ph / 2, z: -5.6, ry: 0.3, k: 'solid' });
      b.box(0.012, ph, 0.012, '#6b7b52', { x: -7.6 + Math.cos(0.3) * u, y: ph / 2, z: -5.6 - Math.sin(0.3) * u + pd / 2, ry: 0.3, k: 'solid' });
    }
    for (const yy of [0.09, 0.18]) {
      b.box(pw, 0.012, 0.012, '#6b7b52', { x: -7.6, y: yy, z: -5.6 + pd / 2, ry: 0.3, k: 'solid' });
      b.box(pw, 0.012, 0.012, '#6b7b52', { x: -7.6, y: yy, z: -5.6 - pd / 2, ry: 0.3, k: 'solid' });
    }
    b.cone(0.1, 0.12, '#6b7b52', { x: -7.6, y: ph + 0.05, z: -5.6, ry: 0.3, k: 'thin' }, 8);
    b.tor(0.19, 0.022, P.rope, { x: -6.3, y: 0.04, z: 6.1, rx: Math.PI / 2, k: 'thin' }, 5, 16);
    b.tor(0.14, 0.022, P.rope, { x: -6.3, y: 0.06, z: 6.1, rx: Math.PI / 2, k: 'thin' }, 5, 16);
    // 散落在地上的水桶与塑料瓶
    b.cyl(0.19, 0.15, 0.36, '#4a9bd6', { x: -4.9, y: 0.18, z: -0.9, k: 'solid' }, 14);
    b.tor(0.18, 0.015, '#2f6fa8', { x: -4.9, y: 0.36, z: -0.9, rx: Math.PI / 2, k: 'solid' }, 6, 14);
    b.cyl(0.02, 0.02, 0.3, P.iron, { x: -4.6, y: 0.15, z: -1.7, k: 'solid' }, 6);
    b.cyl(0.09, 0.1, 0.22, '#e8f0f0', { x: 8.6, y: 0.11, z: 9.6, rz: 1.45, k: 'solid' }, 10);
  }, 'crates');

  // ---- 银灰色乐器硬箱（堤岸上并排放置）----
  staticGroup(scene, (b) => {
    const cases = [[6.8, 3.8, 0.0], [7.85, 3.9, 0.12]];
    for (const [x, z, r] of cases) {
      b.box(0.92, 0.36, 0.5, '#aebcc2', { x, y: 0.18, z, ry: r, k: 'solid' });
      b.box(0.96, 0.05, 0.54, '#7c8a90', { x, y: 0.02, z, ry: r, k: 'solid' });
      b.box(0.94, 0.04, 0.52, '#d3dde0', { x, y: 0.37, z, ry: r, k: 'solid' });
      b.box(0.12, 0.04, 0.06, '#5f6b70', { x: x - 0.1, y: 0.4, z: z + 0.27, ry: r, k: 'solid' });
      b.box(0.12, 0.04, 0.06, '#5f6b70', { x: x + 0.1, y: 0.4, z: z + 0.27, ry: r, k: 'solid' });
      b.tor(0.1, 0.012, '#5f6b70', { x, y: 0.42, z, rx: 0, ry: r, k: 'thin' }, 4, 10, Math.PI);
    }
  }, 'cases');

  // ---- 手摇绞盘与小型吊杆 ----
  staticGroup(scene, (b) => {
    // 绞盘
    b.cyl(0.16, 0.16, 0.34, P.rust, { x: -6.0, y: 0.2, z: 9.4, rz: Math.PI / 2, k: 'solid' }, 12);
    b.box(0.03, 0.24, 0.03, P.iron, { x: -6.0, y: 0.32, z: 9.6, k: 'solid' });
    b.box(0.03, 0.03, 0.22, P.iron, { x: -6.0, y: 0.44, z: 9.5, k: 'solid' });
    b.box(0.5, 0.06, 0.42, P.rustLight, { x: -6.0, y: 0.04, z: 9.4, k: 'solid' });
    // 小吊杆
    b.cyl(0.05, 0.06, 2.7, P.rust, { x: 9.2, y: 1.35, z: 9.1, k: 'solid' }, 8);
    b.cyl(0.03, 0.03, 1.8, P.rust, { x: 8.3, y: 2.1, z: 9.1, rz: 0.9, k: 'solid' }, 6);
    b.tube([[8.25, 2.7, 9.1], [8.0, 2.4, 9.1]], 0.012, P.iron, { k: 'thin' }, 4, 4);
    b.box(0.5, 0.1, 0.5, P.rustLight, { x: 9.2, y: 0.05, z: 9.1, k: 'solid' });
  }, 'winch');

  // ---- 售货机（带锈蚀雨檐，灯箱微微发亮）----
  staticGroup(scene, (b) => {
    b.box(0.86, 1.8, 0.76, '#e9f2f4', { x: 2.55, y: 0.9, z: 9.0, k: 'solid' });
    b.box(0.9, 0.1, 0.8, P.rust, { x: 2.55, y: 1.85, z: 9.0, k: 'solid' });
    b.box(0.5, 0.04, 0.5, P.rustLight, { x: 2.55, y: 1.8, z: 9.0, k: 'solid' });
    b.box(0.6, 0.6, 0.02, '#4c6c74', { x: 2.55, y: 1.15, z: 8.61, k: 'solid' });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      b.box(0.11, 0.14, 0.03, ['#e75d4b', '#f5c33b', '#6cc6a6'][(i + j) % 3], { x: 2.42 + i * 0.13, y: 1.03 + j * 0.16, z: 8.6, k: 'solid' });
    }
    b.box(0.14, 0.04, 0.02, P.white, { x: 2.55, y: 0.6, z: 8.6, k: 'solid' });
    b.box(0.5, 0.06, 0.02, P.hazardK, { x: 2.55, y: 0.36, z: 8.6, k: 'solid' });
  }, 'vending');
  const vendLight = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.01), new THREE.MeshBasicMaterial({ color: '#fff4cf', toneMapped: false }));
  vendLight.position.set(2.55, 1.15, 8.575);
  scene.add(vendLight);
  const vendGlow = new THREE.PointLight('#ffe9b0', 0.5, 2.2, 1.6);
  vendGlow.position.set(2.55, 1.15, 8.2);
  scene.add(vendGlow);

  // ---- 斜坡滑道与倒扣的小木舢板 ----
  staticGroup(scene, (b) => {
    // 斜坡：截面为 (z,y) 折线，沿 x 挤出
    const shape = new THREE.Shape();
    shape.moveTo(-3.0, 0.0);
    shape.lineTo(-2.0, -0.9);
    shape.lineTo(-2.0, -4.0);
    shape.lineTo(-3.0, -4.0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-3.6, 0, 0);
    b.add(geo, P.concrete, { k: 'concrete' });
    // 倒扣的小木舢板（半埋在堤面上，船底朝天）
    // 船身的俯视轮廓：尖首、平底朝天，四周微微倒角
    const dl = 1.15, db = 0.4;
    const outline = [[-db, -dl], [db, -dl], [db, dl * 0.3], [db * 0.35, dl], [-db * 0.35, dl], [-db, dl * 0.3]];
    const sh = new THREE.Shape();
    sh.moveTo(outline[0][0], -outline[0][1]);
    for (const [px, pz] of outline.slice(1)) sh.lineTo(px, -pz);
    sh.closePath();
    // 船身用逐层收窄的轮廓叠出弧形的船底（倒扣的船，龙骨朝上）
    const layers = [1, 0.98, 0.92, 0.8, 0.62];
    for (let li = 0; li < layers.length; li++) {
      const f = layers[li];
      const lg = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 4 });
      lg.scale(f, f, 1);
      lg.rotateX(-Math.PI / 2);
      lg.translate(0, 0.02 + li * 0.065, 3.5);
      lg.translate(-3.0, 0, 0);
      b.add(lg, '#f4efe2', { k: 'solid' });
    }
    // 船舷的蓝色条纹与船底的木纹压条
    b.box(0.3, 0.02, 1.5, P.boatStripe, { x: -3.0, y: 0.35, z: 3.5, k: 'solid' });

  }, 'slope');

  // ---- 港名与“注意落水”告示牌（朝向前方）----
  staticGroup(scene, (b) => {
    b.cyl(0.035, 0.035, 1.2, P.iron, { x: -0.9, y: 0.6, z: 9.7, k: 'solid' }, 6);
    b.box(0.08, 0.6, 0.06, P.iron, { x: -0.9, y: 0.3, z: 9.7, k: 'solid' });
  }, 'signpost');
  const signMat = texMat(signCanvas());
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), signMat);
  sign.position.set(-0.9, 1.05, 9.67);
  scene.add(sign);
  addOutline(sign);

  // ---- 风向袋（分段配色的锥形布袋）+ 旗子 ----
  const wind = new THREE.Group();
  wind.position.set(-9.0, 0, 3.0);
  scene.add(wind);
  {
    const b = new Builder();
    b.cyl(0.04, 0.045, 3.4, P.iron, { y: 1.7, k: 'solid' }, 6);
    b.sph(0.06, P.iron, { y: 3.4, k: 'solid' }, 6, 4);
    b.finish(wind);
  }
  const sock = new THREE.Group();
  sock.position.set(0, 3.2, 0);
  wind.add(sock);
  {
    const b = new Builder();
    const seg = 5;
    for (let i = 0; i < seg; i++) {
      const r0 = 0.09 + (0.3 - 0.09) * (i / seg);
      const r1 = 0.09 + (0.3 - 0.09) * ((i + 1) / seg);
      const c = i % 2 === 0 ? '#f36b2a' : '#f7f2ea';
      const g = new THREE.CylinderGeometry(r1, r0, 0.5 / seg * 1.1, 10, 1, true);
      g.rotateZ(Math.PI / 2);
      g.translate(0.5 / seg * (i + 0.5) + 0.0, 0, 0);
      b.add(g, c, { k: 'thin' });
    }
    b.cyl(0.1, 0.1, 0.02, P.iron, { x: 0.0, y: 0, z: 0, rz: Math.PI / 2, k: 'thin' }, 10);
    b.finish(sock);
  }
  dyn.push({
    update(t) {
      const w = windAt(-9, 3, t);
      // 布袋顺风指向（局部 +X 对准风向），风越大越趋于水平
      const flutter = Math.sin(t * 2.1) * 0.06 * w;
      sock.rotation.set(0, Math.atan2(-WIND_DIR.z, WIND_DIR.x), 0.5 - 0.35 * w + flutter);
    },
  });

  // ---- 吊杆顶上的小旗（被风吹得歪斜，轻轻抖动）----
  const flagG = new THREE.Group();
  flagG.position.set(9.2, 2.72, 9.1);
  scene.add(flagG);
  {
    const b = new Builder();
    b.cyl(0.012, 0.012, 0.55, P.iron, { y: 0.28, k: 'solid' }, 4);
    b.finish(flagG);
    const fshape = new THREE.Shape();
    fshape.moveTo(0, 0);
    fshape.lineTo(0.34, -0.09);
    fshape.lineTo(0, -0.18);
    fshape.closePath();
    const fm = new THREE.Mesh(new THREE.ShapeGeometry(fshape), flatMat('#f0643a', { side: THREE.DoubleSide }));
    fm.position.set(0.0, 0.5, 0.02);
    flagG.add(fm);
    addOutline(fm);
    dyn.push({ update(t) { const w = windAt(9.2, 9.1, t); fm.rotation.y = -0.3 * w + Math.sin(t * 6.1) * 0.12 * (0.4 + w); fm.rotation.z = Math.sin(t * 4.3) * 0.08 * w; } });
  }

  // ---- 晒网架与浮球串 ----
  const rack = new THREE.Group();
  rack.position.set(-8.0, 0, 8.6);
  scene.add(rack);
  {
    const b = new Builder();
    b.cyl(0.035, 0.035, 2.0, P.iron, { x: -0.85, y: 1.0, z: 0, k: 'solid' }, 6);
    b.cyl(0.035, 0.035, 2.0, P.iron, { x: 0.85, y: 1.0, z: 0, k: 'solid' }, 6);
    b.cyl(0.03, 0.03, 1.9, P.iron, { x: 0, y: 2.0, z: 0, rz: Math.PI / 2, k: 'solid' }, 6);
    b.cyl(0.03, 0.03, 1.9, P.rust, { x: 0, y: 0.25, z: 0, rz: Math.PI / 2, k: 'solid' }, 6);
    b.finish(rack);
  }
  const netMat = texMat(netCanvas(), { transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
  const netG = new THREE.Group();
  netG.position.set(0, 2.0, 0);
  rack.add(netG);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.6, 1, 1), netMat);
  net.position.set(0, -0.8, 0);
  netG.add(net);
  // 浮球串：挂在网下缘的橙白浮球
  {
    const b = new Builder();
    for (let i = 0; i < 9; i++) {
      const x = -0.75 + i * 0.19;
      b.sph(0.05, i % 2 ? P.lifeOrange : P.white, { x, y: -1.62, z: 0.0, k: 'solid' }, 8, 6);
    }
    b.finish(netG);
  }
  dyn.push({
    update(t) {
      const w = windAt(-8, 8.6, t);
      netG.rotation.x = 0.04 * Math.sin(t * 1.7) * (0.6 + w);
      netG.rotation.z = 0.05 * Math.sin(t * 1.3 + 1) * (0.6 + w);
      netG.position.y = 2.0 + 0.02 * Math.sin(t * 2.3) * w;
    },
  });

  // ---- 三只系船浮标（随水起伏，编号可见）----
  const buoys = [];
  const buoySpots = [[-0.6, -0.4, 17], [4.6, -0.2, 23], [-3.6, -6.55, 31]];
  for (const [x, z, num] of buoySpots) {
    const g = new THREE.Group();
    g.position.set(x, WATER_Y, z);
    scene.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.46, 14), texMat(buoyCanvas(num)));
    body.position.y = 0.0;
    g.add(body);
    addOutline(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 10), flatMat(P.white));
    cap.position.y = 0.34;
    g.add(cap);
    addOutline(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16), flatMat(P.iron));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.22;
    g.add(ring);
    buoys.push({ g, x, z, ph: num * 0.37 });
  }
  dyn.push({
    update(t) {
      for (const b of buoys) {
        const h = wakeHeight(b.x, b.z, t);
        const bob = 0.05 * Math.sin(t * 1.1 + b.ph) + 0.03 * Math.sin(t * 2.3 + b.ph * 2.0);
        b.g.position.y = WATER_Y + bob + h * 0.7;
        b.g.rotation.z = 0.08 * Math.sin(t * 0.9 + b.ph) + h * 0.5;
        b.g.rotation.x = 0.06 * Math.cos(t * 1.3 + b.ph) + h * 0.3;
      }
    },
  });

  // ---- 斜靠在台阶边的透明雨伞（伞面挂着雨珠）----
  const umb = new THREE.Group();
  umb.position.set(4.7, 0.0, 3.5);
  umb.rotation.z = -0.5;
  umb.rotation.y = 0.3;
  scene.add(umb);
  {
    const b = new Builder();
    b.cyl(0.02, 0.02, 1.25, P.iron, { y: 0.62, k: 'solid' }, 6);
    b.cyl(0.035, 0.035, 0.22, '#3e7c70', { y: 0.12, k: 'solid' }, 8);
    b.lathe([[0.001, 0], [0.5, 0.08], [0.46, 0.17], [0.22, 0.27], [0.001, 0.31]], '#bfeee8', { y: 1.2, k: 'glass' }, 18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(0.012, 0.012, 0.5, '#7fb9b1', { x: Math.cos(a) * 0.25, y: 1.3, z: Math.sin(a) * 0.25, ry: -a + Math.PI / 2, rz: 0.5, k: 'solid' });
    }
    // 伞面上挂着的雨珠（阳光下细小、温暖地闪光）
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash1(i * 3.3) * 0.3;
      const r = 0.22 + hash1(i * 5.1) * 0.22;
      b.sph(0.018 + hash1(i * 7.7) * 0.012, '#ffe9b0', { x: Math.cos(a) * r, y: 1.2 + 0.2 - r * 0.6, z: Math.sin(a) * r, k: 'emit' }, 6, 4);
    }
    b.finish(umb);
  }
  dyn.umbrella = umb;

  // ---- 灯柱上的小铁桶、长柄网兜斜靠墙边 ----
  staticGroup(scene, (b) => {
    b.cyl(0.02, 0.02, 1.9, '#8c6a46', { x: -4.9, y: 0.9, z: -2.6, rz: -0.32, k: 'solid' }, 6);
    b.cone(0.22, 0.42, '#eef4f5', { x: -5.0, y: 1.9, z: -2.7, rz: -0.32, rx: 0.0, k: 'thin' }, 10);
  }, 'netbag');

  // ---- 水洼（放在最后，留给 water.js 的倒影）----
  return dyn;
}

