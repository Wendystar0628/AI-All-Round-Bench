import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { canvasTex, texMat, flatMat, addOutline } from '../core/materials.js';
import { hash1, wob } from '../core/wave.js';
import { WAREHOUSE, WAITING, BREAK, LIGHTHOUSE, FAR_BREAK, WATER_Y } from './layout.js';
import { tetrapod } from './base.js';

const FONT = "'Microsoft YaHei', 'SimHei', 'PingFang SC', sans-serif";

// 墙体：沿 x 或 z 方向的一面墙（厚 0.18），可按 y 高度分段（用于开洞）
function wallX(b, x, z0, z1, y0, y1, color, k = 'solid') {
  b.box(0.18, y1 - y0, z1 - z0, color, { x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, k });
}
function wallZ(b, z, x0, x1, y0, y1, color, k = 'solid') {
  b.box(x1 - x0, y1 - y0, 0.18, color, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, k });
}

// 三角形山墙（沿 x 方向的截面为三角形，挤出到 z 方向）
function gableEnd(b, zc, x0, x1, yEave, yRidge, color) {
  const cx = (x0 + x1) / 2, w = (x1 - x0) / 2;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(0, yRidge - yEave);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false });
  g.translate(cx, yEave, zc - 0.09);
  b.add(g, color, { k: 'solid' });
}

// 渔协仓库：卷帘门半拉起，露出内部的鱼箱、冰柜、磅秤、黑板与光柱
export function buildWarehouse(scene, dyn) {
  const { x0, x1, z0, z1 } = WAREHOUSE;
  const H = 2.4;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;

  const b = new Builder();
  // 地坪（略深的水泥地）与墙裙蓝带
  b.box(w - 0.2, 0.04, d - 0.2, '#c8d2d0', { x: cx, y: 0.02, z: cz, k: 'solid' });
  // 西墙、北墙、南墙（实墙），外墙下部刷蓝色
  wallX(b, x0 + 0.09, z0, z1, 0, H, P.wall);
  wallX(b, x0 + 0.1, z0, z1, 0, 0.6, P.wallBlue);
  wallZ(b, z0 + 0.09, x0, x1, 0, H, P.wall);
  wallZ(b, z1 - 0.09, x0, x1, 0, H, P.wall);
  wallZ(b, z1 - 0.09, x0, x1, 0, 0.6, P.wallBlue);
  // 东墙：中段留出卷帘门洞（门洞 z∈[-3.5,-0.7]）
  const dz0 = -3.5, dz1 = -0.7;
  wallX(b, x1 - 0.09, z0, dz0, 0, H, P.wall);
  wallX(b, x1 - 0.09, dz1, z1, 0, H, P.wall);
  wallX(b, x1 - 0.09, dz0, dz1, 1.7, H, P.wall); // 门楣
  wallX(b, x1 - 0.09, z0, z1, 0, 0.6, P.wallBlue);
  // 卷帘门半拉起：门帘卷在上方（一排横向的铝制帘片），门洞下方仍是敞开的
  b.cyl(0.07, 0.07, dz1 - dz0 + 0.12, P.ironSilver, { x: x1 - 0.12, y: 1.72, z: (dz0 + dz1) / 2, rx: Math.PI / 2, k: 'solid' }, 8);
  for (let i = 0; i < 9; i++) {
    b.box(0.03, 0.045, dz1 - dz0 + 0.02, '#d6dfe1', { x: x1 - 0.1, y: 1.28 + i * 0.05, z: (dz0 + dz1) / 2, k: 'solid' });
  }
  // 门框
  b.box(0.1, 1.7, 0.08, P.rust, { x: x1 - 0.02, y: 0.85, z: dz0 - 0.04, k: 'solid' });
  b.box(0.1, 1.7, 0.08, P.rust, { x: x1 - 0.02, y: 0.85, z: dz1 + 0.04, k: 'solid' });

  // 山墙与屋顶：屋顶为半透明的波纹板，让观看者能俯视内部
  gableEnd(b, z0 + 0.09, x0, x1, H, H + 0.9, P.wall);
  gableEnd(b, z1 - 0.09, x0, x1, H, H + 0.9, P.wall);
  const roofHalf = Math.hypot(w / 2, 0.9);
  const ang = Math.atan2(0.9, w / 2);
  for (const s of [-1, 1]) {
    b.box(roofHalf + 0.1, 0.05, d + 0.1, P.white, { x: cx + s * (w / 4), y: H + 0.45 + 0.0, z: cz, rz: -s * ang, k: 'glass' });
  }
  // 屋脊与波纹线
  b.box(0.12, 0.08, d + 0.1, P.rust, { x: cx, y: H + 0.92, z: cz, k: 'solid' });
  for (let i = 0; i < 9; i++) {
    const z = z0 + 0.3 + i * (d - 0.6) / 8;
    b.box(w - 0.4, 0.03, 0.04, '#dfe9ea', { x: cx, y: H + 0.46 + 0.0, z, rz: 0, k: 'thin' });
  }

  // 高窗：西墙与北墙上部的玻璃条，阳光由此射入室内
  for (let i = 0; i < 3; i++) {
    b.box(0.04, 0.4, 0.55, P.glassTint, { x: x0 + 0.02, y: 1.85, z: -2.2 + i * 0.8, k: 'glass' });
  }
  b.box(0.5, 0.4, 0.04, P.glassTint, { x: cx + 0.2, y: 1.9, z: z1 - 0.02, k: 'glass' });

  // 室内陈设
  // 成垛的鱼箱（白色）与周转筐（蓝色）
  const crate = (x, y, z, ry, blue) => {
    const c = blue ? P.crateBlue : P.boxWhite;
    b.box(0.62, 0.28, 0.42, c, { x, y: y + 0.14, z, ry, k: 'solid' });
    b.box(0.52, 0.04, 0.32, blue ? '#2c5f9c' : '#c7d3d3', { x, y: y + 0.27, z, ry, k: 'solid' });
  };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) crate(-8.9 + j * 0.66, i * 0.28, -3.1, 0, j === 1);
  for (let i = 0; i < 2; i++) crate(-7.1, i * 0.28, -3.2, 0.1, false);
  crate(-8.6, 0, -1.2, 0.0, true);
  crate(-8.6, 0.28, -1.2, 0.0, true);
  // 冰柜：白色箱体 + 深色盖边 + 把手
  const freezer = (x, z, ry) => {
    b.box(1.1, 0.7, 0.62, '#eef5f6', { x, y: 0.35, z, ry, k: 'solid' });
    b.box(1.12, 0.06, 0.64, '#9ab1b6', { x, y: 0.73, z, ry, k: 'solid' });
    b.box(0.5, 0.05, 0.05, P.iron, { x: x + Math.cos(ry) * 0.0, y: 0.56, z: z + 0.33, ry, k: 'solid' });
  };
  freezer(-7.4, -0.9, 0);
  freezer(-6.4, -2.4, 0.0);
  // 散落的冰块（半透明）
  for (let i = 0; i < 7; i++) {
    const x = -8.6 + hash1(i * 3.3) * 2.6, z = -2.0 + hash1(i * 5.1) * 1.3;
    b.box(0.2, 0.14, 0.2, '#d8f2f6', { x, y: 0.07, z, ry: hash1(i) * 3, k: 'glass' });
  }
  // 磅秤（台面 + 立柱 + 表盘）
  b.box(0.8, 0.06, 0.6, P.iron, { x: -5.9, y: 0.4, z: -2.0, k: 'solid' });
  b.box(0.7, 0.44, 0.5, P.ironSilver, { x: -5.9, y: 0.2, z: -2.0, k: 'solid' });
  b.box(0.04, 0.6, 0.04, P.iron, { x: -6.25, y: 0.75, z: -2.3, k: 'solid' });
  b.box(0.2, 0.14, 0.04, P.white, { x: -6.25, y: 1.05, z: -2.28, k: 'solid' });
  // 墙上挂着的雨靴（两只一对）
  for (const [x, z] of [[-8.8, -3.8], [-8.4, -3.8]]) {
    b.box(0.14, 0.42, 0.1, '#f2c642', { x, y: 1.7, z, k: 'solid' });
    b.box(0.22, 0.08, 0.16, '#f2c642', { x: x + 0.04, y: 1.46, z: z + 0.04, k: 'solid' });
  }
  // 木箱与鱼网挂钩
  b.cyl(0.02, 0.02, 0.5, P.iron, { x: -9.0, y: 1.9, z: -0.4, rz: 0.4, k: 'solid' }, 6);
  // 室内吊灯
  b.cyl(0.01, 0.01, 0.9, P.iron, { x: -7.4, y: 1.95, z: -1.6, k: 'thin' }, 4);
  b.sph(0.09, P.white, { x: -7.4, y: 1.4, z: -1.6, k: 'emit' }, 8, 6);
  // 地面的水渍与反光（半透明，带点蓝）
  b.box(2.6, 0.01, 1.4, '#9fe6e0', { x: -7.6, y: 0.045, z: -1.9, k: 'glass' });
  b.box(1.4, 0.01, 0.9, '#9fe6e0', { x: -6.2, y: 0.045, z: 0.1, k: 'glass' });
  b.finish(scene);

  // 黑板：拍卖价格（墙上的文字是场景物体本身）
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), texMat(auctionCanvas()));
  board.position.set(-7.2, 1.45, z0 + 0.19);
  scene.add(board);
  addOutline(board);

  // 室内光：玻璃窗射入的光柱之外，室内补一盏暖光（只照亮室内，强度小）
  const inner = new THREE.PointLight('#ffe7b8', 0.7, 4.0, 1.6);
  inner.position.set(-7.4, 1.8, -1.6);
  scene.add(inner);
  return { inner };
}

function auctionCanvas() {
  return canvasTex(512, 280, (g, w, h) => {
    g.fillStyle = '#2f3d3d';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a48a62';
    g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#f2f1e6';
    g.font = `bold 50px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('拍卖价格', w / 2, 52);
    g.font = `bold 40px ${FONT}`;
    g.textAlign = 'left';
    const rows = [['鲷鱼', '¥ 28'], ['竹荚', '¥ 9'], ['鱿鱼', '¥ 16'], ['白虾', '¥ 35']];
    rows.forEach(([n, p], i) => {
      g.fillStyle = '#f2f1e6';
      g.fillText(n, 60, 120 + i * 45);
      g.textAlign = 'right';
      g.fillStyle = '#ffd27a';
      g.fillText(p, w - 60, 120 + i * 45);
      g.textAlign = 'left';
    });
  });
}

// 候船室：前墙为落地玻璃窗，室内有木长椅、时刻表、老式收音机、热水壶、绿萝与歪斜的挂钟
export function buildWaitingRoom(scene, dyn) {
  const { x0, x1, z0, z1 } = WAITING;
  const H = 2.5;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  const b = new Builder();
  // 地面（木地板）
  b.box(w - 0.2, 0.05, d - 0.2, '#d9b98c', { x: cx, y: 0.025, z: cz, k: 'solid' });
  // 后墙、左右墙（实墙，带蓝色墙裙）
  wallZ(b, z0 + 0.09, x0, x1, 0, H, P.wall);
  wallX(b, x0 + 0.09, z0, z1, 0, H, P.wall);
  wallX(b, x1 - 0.09, z0, z1, 0, H, P.wall);
  wallZ(b, z0 + 0.1, x0, x1, 0, 0.7, P.wallBlue);
  wallX(b, x0 + 0.1, z0, z1, 0, 0.7, P.wallBlue);
  wallX(b, x1 - 0.1, z0, z1, 0, 0.7, P.wallBlue);
  // 前墙：落地玻璃（玻璃本体 + 竖向的铝框）
  b.box(w - 0.1, H, 0.04, P.glassTint, { x: cx, y: H / 2, z: z1 - 0.06, k: 'glass' });
  for (let i = 0; i <= 4; i++) {
    b.box(0.06, H, 0.08, '#86a4aa', { x: x0 + 0.05 + i * (w - 0.1) / 4, y: H / 2, z: z1 - 0.05, k: 'solid' });
  }
  b.box(w + 0.1, 0.1, 0.14, '#86a4aa', { x: cx, y: H + 0.02, z: z1 - 0.04, k: 'solid' });
  // 屋顶：半透明的平顶（室内可见）+ 外檐
  b.box(w + 0.2, 0.05, d + 0.2, P.white, { x: cx, y: H + 0.12, z: cz, k: 'glassRoof' });
  b.box(w + 0.3, 0.1, d + 0.3, P.wallBlue, { x: cx, y: H + 0.05, z: cz, k: 'solid' });

  // 木长椅两只（靠后墙与面向玻璃的一只）
  const bench = (x, z, len, ry) => {
    b.box(len, 0.08, 0.5, P.wood, { x, y: 0.46, z, ry, k: 'solid' });
    b.box(len, 0.36, 0.06, P.woodDark, { x, y: 0.7, z: z - 0.25 * Math.cos(ry), ry, k: 'solid' });
    for (const s of [-1, 1]) {
      b.box(0.08, 0.46, 0.46, P.woodDark, { x: x + s * (len / 2 - 0.1) * Math.cos(ry), y: 0.23, z: z + s * (len / 2 - 0.1) * -Math.sin(ry), ry, k: 'solid' });
    }
  };
  bench(cx - 0.3, z0 + 0.6, 2.8, 0);
  bench(x0 + 1.2, cz + 0.6, 1.6, Math.PI / 2);
  // 收音机（放在长椅一端）
  b.box(0.42, 0.26, 0.2, '#8b5b3a', { x: cx + 1.25, y: 0.67, z: z0 + 0.6, k: 'solid' });
  b.box(0.3, 0.14, 0.02, '#e9d9b0', { x: cx + 1.25, y: 0.67, z: z0 + 0.7, k: 'solid' });
  b.cyl(0.14, 0.14, 0.02, P.iron, { x: cx + 1.25, y: 0.67, z: z0 + 0.71, rx: Math.PI / 2, k: 'solid' }, 10);
  b.cyl(0.01, 0.01, 0.6, P.iron, { x: cx + 1.5, y: 1.0, z: z0 + 0.55, rz: -0.5, k: 'thin' }, 4);
  // 小茶几 + 热水壶 + 杯子
  b.box(0.7, 0.04, 0.5, P.woodDark, { x: x1 - 1.2, y: 0.7, z: z1 - 1.2, k: 'solid' });
  b.box(0.04, 0.7, 0.04, P.woodDark, { x: x1 - 1.5, y: 0.35, z: z1 - 1.0, k: 'solid' });
  b.box(0.04, 0.7, 0.04, P.woodDark, { x: x1 - 0.9, y: 0.35, z: z1 - 1.4, k: 'solid' });
  b.lathe([[0.001, 0], [0.11, 0.02], [0.13, 0.2], [0.1, 0.27], [0.001, 0.29]], '#dfe8ea', { x: x1 - 1.2, y: 0.72, z: z1 - 1.2, k: 'solid' }, 14);
  b.tor(0.09, 0.012, P.iron, { x: x1 - 1.08, y: 0.98, z: z1 - 1.2, ry: 0, rz: 0, k: 'solid' }, 6, 12, Math.PI);
  b.cyl(0.03, 0.02, 0.1, '#c0ccd0', { x: x1 - 1.28, y: 0.84, z: z1 - 1.12, rz: 0.6, k: 'solid' }, 6);
  b.cyl(0.04, 0.035, 0.08, P.white, { x: x1 - 1.05, y: 0.76, z: z1 - 1.05, k: 'solid' }, 10);
  // 绿萝（陶盆 + 垂落的叶子）
  const px = x0 + 0.7, pz = z1 - 0.7;
  b.lathe([[0.001, 0], [0.2, 0.02], [0.22, 0.28], [0.18, 0.34], [0.2, 0.4], [0.001, 0.4]], '#c77b52', { x: px, y: 0, z: pz, k: 'solid' }, 14);
  for (let i = 0; i < 14; i++) {
    const a = hash1(i * 2.7) * Math.PI * 2;
    const r = 0.1 + hash1(i * 4.1) * 0.12;
    b.ell(0.1, 0.03, 0.06, i % 2 ? '#6fbf6a' : '#4f9e5a', { x: px + Math.cos(a) * r, y: 0.7 + hash1(i) * 0.45 - (r * 0.8), z: pz + Math.sin(a) * r, rz: Math.cos(a) * 0.9, ry: a, k: 'solid' }, 8, 5);
  }
  // 墙上的航班时刻表（褪色纸）
  // 挂钟（略微歪斜）
  // 挂钟贴在左墙（表面朝向室内 +X），略微歪斜
  const clk = { x: x0 + 0.22, y: 2.0, z: cz + 0.6, rz: Math.PI / 2, rx: 0.12 };
  b.cyl(0.2, 0.2, 0.04, '#f7f5ec', clk, 20);
  b.tor(0.2, 0.02, P.wood, { ...clk, x: x0 + 0.245 }, 6, 20);
  b.box(0.012, 0.14, 0.01, '#3c4448', { x: x0 + 0.245, y: 2.07, z: cz + 0.6, k: 'solid' });
  b.box(0.012, 0.1, 0.01, '#3c4448', { x: x0 + 0.245, y: 2.0, z: cz + 0.62, rx: -1.2, k: 'solid' });
  // 天花板吊灯（自发光）
  b.cyl(0.01, 0.01, 0.35, P.iron, { x: cx, y: H - 0.2, z: cz, k: 'thin' }, 4);
  b.cyl(0.18, 0.18, 0.06, P.white, { x: cx, y: H - 0.42, z: cz, k: 'emit' }, 16);
  b.finish(scene);

  const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), texMat(timetableCanvas()));
  tt.position.set(x0 + 0.19, 1.35, cz - 0.6);
  tt.rotation.y = Math.PI / 2;
  scene.add(tt);
  addOutline(tt);

  const inner = new THREE.PointLight('#ffeec8', 0.5, 3.6, 1.6);
  inner.position.set(cx, 2.1, cz);
  scene.add(inner);
  return { inner };
}

function timetableCanvas() {
  return canvasTex(256, 330, (g, w, h) => {
    g.fillStyle = '#eee7d0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8c7b5e';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#5b5443';
    g.font = `bold 26px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('航班时刻表', w / 2, 34);
    g.font = `20px ${FONT}`;
    g.textAlign = 'left';
    for (let i = 0; i < 8; i++) {
      g.fillText(`${6 + i}:${i % 2 ? '30' : '00'}`, 22, 80 + i * 32);
      g.fillText(i % 3 === 0 ? '→ 外岛' : '→ 本港', 120, 80 + i * 32);
    }
    g.globalAlpha = 0.14;
    g.fillStyle = '#b08b5e';
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  });
}

// 短防波堤与堤端灯塔（红白相间的塔身、玻璃灯室）
export function buildBreakwater(scene, dyn) {
  const b = new Builder();
  const x0 = BREAK.x0, x1 = BREAK.x1, z0 = BREAK.z0, z1 = BREAK.z1;
  b.box(x1 - x0, BREAK.top - (-4), z1 - z0, P.concrete, { x: (x0 + x1) / 2, y: (BREAK.top - 4) / 2, z: (z0 + z1) / 2, k: 'concrete' });
  // 堤顶的护栏柱
  for (let x = x0 + 0.5; x < x1 - 0.8; x += 1.2) {
    b.cyl(0.03, 0.03, 0.5, P.iron, { x, y: BREAK.top + 0.25, z: z0 + 0.12, k: 'solid' }, 6);
  }
  // 连续的扶手横杆
  b.cyl(0.02, 0.02, x1 - x0 - 1.0, P.iron, { x: (x0 + x1) / 2 - 0.2, y: BREAK.top + 0.52, z: z0 + 0.12, rz: Math.PI / 2, k: 'solid' }, 6);
  b.finish(scene);
  // 消波块：堆在堤的外侧（南侧），与航线错开；底座远端两只角各一组
  const tb = new Builder();
  tetrapod(tb, 5.0, 0.2, -6.8, 0.8, 1.2);
  tetrapod(tb, 9.1, 0.0, -9.0, 1.0, 0.3);
  tb.finish(scene);

  // 远处的防波堤（与底座远端平行，淡雾遮蔽）
  const fb = new Builder();
  const fx0 = FAR_BREAK.x0, fx1 = FAR_BREAK.x1;
  fb.box(fx1 - fx0, 3.9, 0.8, '#d2dddc', { x: (fx0 + fx1) / 2, y: -0.05 - 1.95, z: FAR_BREAK.z, k: 'solid' });
  fb.box(fx1 - fx0, 0.1, 0.9, '#e6eeed', { x: (fx0 + fx1) / 2, y: 0.02, z: FAR_BREAK.z, k: 'solid' });
  fb.finish(scene);

  // 消波块之间的浪花：细小、克制的白色泡沫，轻轻起伏翻涌
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f5fcfb', toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false });
  const foamSpots = [[5.0, -6.8], [9.1, -9.0]];
  foamSpots.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, WATER_Y, z);
    scene.add(g);
    const blobs = [];
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + i;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 5), foamMat);
      m.scale.set(1.1, 0.22, 0.8);
      m.position.set(Math.cos(a) * 0.4, 0.02, Math.sin(a) * 0.4);
      g.add(m);
      blobs.push({ m, j });
    }
    dyn.push({
      update(t) {
        for (const { m, j } of blobs) {
          const ph = t * 1.6 + j * 1.3 + i * 0.7;
          m.position.y = 0.02 + 0.035 * Math.sin(ph);
          m.scale.setScalar(0.85 + 0.25 * Math.sin(ph * 0.7));
        }
      },
    });
  });

  // 灯塔
  const { x, z } = LIGHTHOUSE;
  const lh = new THREE.Group();
  lh.position.set(x, BREAK.top, z);
  scene.add(lh);
  const lb = new Builder();
  lb.cyl(0.62, 0.66, 0.3, P.concrete, { y: 0.15, k: 'concrete' }, 16);
  // 红白相间的塔身（逐段）
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const y0 = 0.3 + i * (2.9 / segs), y1 = y0 + 2.9 / segs;
    const r0 = 0.5 - (0.5 - 0.34) * (i / segs), r1 = 0.5 - (0.5 - 0.34) * ((i + 1) / segs);
    lb.cyl(r1, r0, y1 - y0, i % 2 ? '#f5f7f6' : '#dd4a36', { y: (y0 + y1) / 2, k: 'solid' }, 18);
  }
  // 灯室（玻璃，发光）与红色顶帽、栏杆、门
  lb.cyl(0.36, 0.36, 0.5, P.glassTint, { y: 3.45, k: 'emitGlass' }, 16);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    lb.cyl(0.02, 0.02, 0.5, P.iron, { x: Math.cos(a) * 0.36, y: 3.45, z: Math.sin(a) * 0.36, k: 'solid' }, 5);
  }
  lb.cone(0.42, 0.42, '#d4432f', { y: 3.9, k: 'solid' }, 16);
  lb.cyl(0.04, 0.04, 0.3, P.iron, { y: 4.2, k: 'solid' }, 6);
  lb.tor(0.42, 0.025, P.iron, { y: 3.2, rx: Math.PI / 2, k: 'solid' }, 6, 22);
  lb.box(0.2, 0.44, 0.06, '#8c3b2b', { x: -0.0, y: 0.52, z: 0.5, k: 'solid' });
  lb.finish(lh);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3c9', toneMapped: false, transparent: true, opacity: 0.0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), lampMat);
  lamp.position.set(0, 3.45, 0);
  lh.add(lamp);
  const light = new THREE.PointLight('#fff1c4', 0, 6, 1.4);
  light.position.set(0, 3.45, 0);
  lh.add(light);
  // 极偶尔天色暗下来，塔顶的灯会在白天亮起一次
  dyn.push({
    update(t) {
      const k = lampOn(t);
      lampMat.opacity = 0.9 * k;
      light.intensity = 1.6 * k;
    },
  });
  return { lighthouse: lh };
}

// 灯塔亮灯的时刻（t 为秒）：白天里偶尔的一次
export function lampOn(t) {
  const a = 62, b = 74;
  if (t < a || t > b) return 0;
  const u = (t - a) / (b - a);
  return Math.max(0, Math.sin(Math.PI * u) * (0.75 + 0.25 * wob(t * 2, 9)));
}
