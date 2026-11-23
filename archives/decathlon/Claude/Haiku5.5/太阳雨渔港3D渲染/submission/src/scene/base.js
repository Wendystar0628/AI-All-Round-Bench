import * as THREE from 'three';
import { P } from '../core/palette.js';
import { hash1 } from '../core/wave.js';
import { Builder } from '../core/builder.js';
import { canvasTex, toonGradient } from '../core/materials.js';
import { LEFT_ARM, FRONT_ARM, BAY, BOTTOM, WATER_Y, STAIRS, PAD, HALF } from './layout.js';

// 高度为 top 的实心块（从底面到 top）
function block(b, x0, x1, z0, z1, top, color = P.concrete, k = 'concrete') {
  const h = top - BOTTOM;
  b.box(x1 - x0, h, z1 - z0, color, { x: (x0 + x1) / 2, y: (top + BOTTOM) / 2, z: (z0 + z1) / 2, k });
}

// 底座主体：两条码头臂、底座底座、水域剖面
export function buildBase(b) {
  // 纵臂与横臂（实心混凝土）
  block(b, LEFT_ARM.x0, LEFT_ARM.x1, LEFT_ARM.z0, LEFT_ARM.z1, 0);
  block(b, FRONT_ARM.x0, FRONT_ARM.x1, FRONT_ARM.z0, FRONT_ARM.z1, 0);

  // 底座下方的深色木质基座（收藏模型的底托）
  b.box(20.6, 0.5, 20.6, P.plinth, { x: 0, y: -4.25, z: 0, k: 'solid' });
  // 水底的岩床
  b.box(BAY.x1 - BAY.x0, 0.3, BAY.z1 - BAY.z0, P.seabed, { x: (BAY.x0 + BAY.x1) / 2, y: -3.85, z: (BAY.z0 + BAY.z1) / 2, k: 'solid' });

  // 水域外侧的剖面（半透明青绿水体）：东侧与北侧
  const depth = WATER_Y - BOTTOM;
  b.plane(BAY.z1 - BAY.z0, depth, P.shallow, { x: HALF, y: (WATER_Y + BOTTOM) / 2, z: (BAY.z0 + BAY.z1) / 2, ry: Math.PI / 2, k: 'water' });
  b.plane(BAY.x1 - BAY.x0, depth, P.shallow, { x: (BAY.x0 + BAY.x1) / 2, y: (WATER_Y + BOTTOM) / 2, z: -HALF, k: 'water' });

  // 台阶：从前臂后缘向水里逐级下降，最低一级与水面齐平
  const sx0 = STAIRS.x0, sx1 = STAIRS.x1;
  block(b, sx0, sx1, 2.5, 3.0, -0.3);
  block(b, sx0, sx1, 2.0, 2.5, -0.6);
  block(b, sx0, sx1, 1.5, 2.0, -0.9);
  // 上下船平台（略低于堤面，浮在水中）
  block(b, PAD.x0, PAD.x1, PAD.z0, PAD.z1, PAD.top);
  // 平台边缘的防滑条
  b.box(PAD.x1 - PAD.x0 - 0.2, 0.02, 0.12, P.hazardY, { x: (PAD.x0 + PAD.x1) / 2, y: PAD.top + 0.012, z: PAD.z1 - 0.2, k: 'solid' });

  // 水边的锈蚀铁梯（沿纵臂内侧，下到水里）
  const lz = -0.6;
  for (const dz of [-0.16, 0.16]) {
    b.cyl(0.035, 0.035, 2.4, P.rust, { x: -3.92, y: -1.0, z: lz + dz, k: 'thin' }, 6);
  }
  for (let y = -0.25; y > -2.3; y -= 0.32) {
    b.cyl(0.024, 0.024, 0.36, P.rustLight, { x: -3.92, y, z: lz, rx: Math.PI / 2, k: 'thin' }, 6);
  }

  // 系船环（嵌在前臂后墙上）
  for (const x of [-2.2, 0.8, 3.7, 9.0]) {
    b.tor(0.13, 0.025, P.ironLight, { x, y: -0.42, z: 2.98, k: 'thin' }, 6, 14);
    b.box(0.07, 0.1, 0.05, P.iron, { x, y: -0.28, z: 2.97, k: 'thin' });
  }
  // 纵臂一侧的系船环
  for (const z of [-3.6, 0.9]) {
    b.tor(0.13, 0.025, P.ironLight, { x: -3.97, y: -0.42, z, ry: Math.PI / 2, k: 'thin' }, 6, 14);
  }

  // 岸壁下部附着的藤壶与牡蛎壳（沿水下的墙面分布）
  const addBarn = (x, y, z, rx, ry, rz, s) => {
    b.cone(0.035 * s, 0.07 * s, P.barnacle, { x, y, z, rx, ry, rz, k: 'solid' }, 5);
  };
  for (let i = 0; i < 260; i++) {
    const r1 = hash1(i * 1.7 + 0.3), r2 = hash1(i * 3.1 + 1.1), r3 = hash1(i * 5.3 + 2.2);
    const band = r3 < 0.6 ? -1.0 - r2 * 0.25 : -2.2 - r2 * 1.5; // 潮位带密集、深处稀疏
    const s = 0.7 + r1 * 0.6;
    const side = r1 < 0.5 ? 0 : 1;
    if (side === 0) {
      // 前臂后墙 z=3（朝向水面的法线为 -z）
      const x = -3.8 + r2 * 13.4;
      if (x > 4.6 && x < 7.6 && band > -1.4) continue;
      addBarn(x, band, 2.99, -Math.PI / 2, 0, 0, s);
    } else {
      // 纵臂内墙 x=-4（法线 +x），避开转角处的防波堤
      const z = -6.0 + r2 * 9.0;
      if (z < -4.6 && z > -6.5) continue;
      addBarn(-3.99, band, z, 0, 0, -Math.PI / 2, s);
    }
  }
  // 大块牡蛎壳，扁平椭球
  for (let i = 0; i < 40; i++) {
    const r1 = hash1(i * 9.7 + 4.0), r2 = hash1(i * 2.9 + 7.0);
    const y = -1.8 - r2 * 1.9;
    if (r1 < 0.5) {
      const x = -3.8 + r2 * 13.0;
      b.ell(0.09, 0.05, 0.08, P.oyster, { x, y, z: 2.97, k: 'solid' });
    } else {
      b.ell(0.08, 0.05, 0.09, P.oyster, { x: -3.97, y, z: -5.9 + r2 * 8.5, k: 'solid' });
    }
  }

  // 底座侧面的灰白色混凝土剖面线（水下的剖面由 water 部分的透明面呈现）
  return b;
}

// 底座边角的消波块（テトラポッド）：四只脚组成的消波块
export function tetrapod(b, x, y, z, s = 1, ry = 0, rx = 0, rz = 0) {
  const legs = [
    [0, 1, 0],
    [0.94, -0.33, 0],
    [-0.47, -0.33, 0.82],
    [-0.47, -0.33, -0.82],
  ];
  const k = 'concrete';
  for (let i = 0; i < legs.length; i++) {
    const [lx, ly, lz] = legs[i];
    const len = 0.5 * s;
    const dir = new THREE.Vector3(lx, ly, lz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    // 消波块的脚：根部粗、末端细，比例更接近实物
    b.cyl(0.09 * s, 0.17 * s, len * 2.6, P.concrete, { x: x + dir.x * len * 1.3, y: y + dir.y * len * 1.3, z: z + dir.z * len * 1.3, rx: e.x, ry: e.y, rz: e.z, k });
  }
  b.sph(0.24 * s, P.concrete, { x, y: y + 0.05, z, k });
  return b;
}


// 堤沿的黄黑斜纹警示条（贴图为 45° 斜纹，沿堤边连续铺设；避开台阶的位置）
export function buildHazardStrips(scene) {
  const CURB_H = 0.1;
  const CURB_W = 0.14;
  const tex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = "#f4c23a";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#2b3134";
    for (let i = -1; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64 + 32, 0);
      g.lineTo(i * 64 + 32 + 64, h);
      g.lineTo(i * 64 + 64, h);
      g.closePath();
      g.fill();
    }
  });
  // 护轮坎：沿堤边的矮混凝土台，顶面贴黄黑斜纹
  const add = (len, x, z, ry) => {
    const cb = new Builder();
    cb.box(ry ? CURB_W : len, CURB_H, ry ? len : CURB_W, P.concrete, { x, y: CURB_H / 2, z, k: "concrete" });
    cb.finish(scene);
    const geo = new THREE.PlaneGeometry(len, CURB_W * 0.96);
    geo.rotateX(-Math.PI / 2);
    if (ry) geo.rotateY(ry);
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(len / 0.5, 1);
    const m = new THREE.MeshToonMaterial({ map: t, gradientMap: toonGradient });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, CURB_H + 0.003, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // 前臂后缘（台阶处留空）
  add(STAIRS.x0 - FRONT_ARM.x0 - 0.3, (FRONT_ARM.x0 + STAIRS.x0 - 0.3) / 2, 3.07, 0);
  add(FRONT_ARM.x1 - STAIRS.x1 - 0.3, (STAIRS.x1 + 0.3 + FRONT_ARM.x1) / 2, 3.07, 0);
  // 纵臂内沿（避开转角处的防波堤）
  add(9.0, -4.09, -6.0 + 4.5, Math.PI / 2);
}
