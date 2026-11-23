import * as THREE from 'three';
import { P } from '../core/palette.js';
import { Builder } from '../core/builder.js';
import { hash1, windAt } from '../core/wave.js';
import { HILL } from './layout.js';
import { toonGradient, addOutline } from '../core/materials.js';

// 山坡高度场：中心隆起，四周在底座上平滑落到 0（与堤面齐平）
const CX = (HILL.x0 + HILL.x1) / 2;
const CZ = (HILL.z0 + HILL.z1) / 2;
const HW = (HILL.x1 - HILL.x0) / 2;
const HD = (HILL.z1 - HILL.z0) / 2;
function hillH(x, z) {
  const nx = (x - CX) / HW;
  const nz = (z - CZ) / HD;
  const r2 = nx * nx + nz * nz;
  const bump = Math.max(0, 1 - r2);
  return 2.5 * Math.pow(bump, 0.75) + 0.25 * Math.sin(x * 2.1) * Math.cos(z * 1.7) * bump;
}

// 山坡的起伏地面（顶点色：草地的亮绿与阴影处的深绿）
function hillMesh(scene) {
  const seg = 28;
  const g = new THREE.PlaneGeometry(HILL.x1 - HILL.x0, HILL.z1 - HILL.z0, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(CX, 0, CZ);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color('#9ad98a'), c2 = new THREE.Color('#5fae6a'), c3 = new THREE.Color('#c8b98a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = hillH(x, z);
    pos.setY(i, h);
    const k = Math.min(1, h / 2.4);
    const c = c1.clone().lerp(c2, k * 0.8 + 0.2 * hash1(i * 0.9));
    if (h < 0.35) c.lerp(c3, 0.35);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  const mesh = new THREE.Mesh(ng, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addOutline(mesh);
  return mesh;
}

// 小石阶：从坡脚通向山顶的路
function steps(b) {
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = -7.3 + t * 0.4 + 0.12 * Math.sin(i);
    const z = -7.9 + t * 1.1;
    // 石阶一直砌到地面，不会悬空
    const top = hillH(x, z) + 0.05;
    b.box(0.5, top, 0.25, '#e8dfc9', { x, y: top / 2, z, ry: 0.1, k: 'solid' });
  }
}

function houseGroup(parent, x, z, s, color, roofColor) {
  const g = new THREE.Group();
  g.position.set(x, hillH(x, z) - 0.02, z);
  g.rotation.y = s.ry || 0;
  parent.add(g);
  const b = new Builder();
  const w = s.w, d = s.d, h = s.h;
  b.box(w, h, d, color, { y: h / 2, k: 'solid' });
  // 两坡瓦顶（屋脊沿 X 轴）
  // 每一坡从屋脊（高）到檐口（低）；板的长边沿坡面，中心位于坡的中点
  const rh = 0.7, half = d / 2 + 0.1;
  const ang = Math.atan2(rh, half);
  const slope = Math.hypot(rh, half);
  b.box(w + 0.2, 0.08, slope, roofColor, { x: 0, y: h + rh / 2, z: half / 2, rx: ang, k: 'solid' });
  b.box(w + 0.2, 0.08, slope, roofColor, { x: 0, y: h + rh / 2, z: -half / 2, rx: -ang, k: 'solid' });
  // 窗：暖色的小窗
  for (const zz of [-d / 2 - 0.01, d / 2 + 0.01]) {
    b.box(0.16, 0.2, 0.04, '#fff3cc', { x: w * 0.2, y: h * 0.55, z: zz, k: 'emit' });
    b.box(0.16, 0.2, 0.04, '#5b6e73', { x: -w * 0.25, y: h * 0.55, z: zz, k: 'solid' });
  }
  // 门与小门廊
  b.box(0.2, 0.36, 0.04, '#8f5c3f', { x: 0, y: 0.18, z: d / 2 + 0.01, k: 'solid' });
  b.finish(g);
  return g;
}

// 山坡：起伏的地面、绿树（会随阵风摇动的树冠）、几户瓦顶民家与石阶
export function buildHill(scene, dyn) {
  hillMesh(scene);
  const b = new Builder();
  steps(b);
  // 山坡边缘的矮挡土墙（与堤面相接处的石块）
  b.finish(scene);

  const houses = [
    { x: -8.2, z: -7.2, s: { w: 0.9, d: 0.8, h: 0.75, ry: 0.2 }, c: '#f3eadb', r: P.roofTile },
    { x: -6.4, z: -8.2, s: { w: 0.8, d: 0.9, h: 0.7, ry: -0.3 }, c: '#e7f1f0', r: '#b65c48' },
    { x: -9.0, z: -8.8, s: { w: 0.7, d: 0.75, h: 0.6, ry: 0.5 }, c: '#f0e3cf', r: P.roofTile },
  ];
  for (const h of houses) houseGroup(scene, h.x, h.z, h.s, h.c, h.r);

  // 树：每棵树的树冠单独成组，随风摇摆
  const trees = [
    [-9.6, -6.9, 1.0], [-8.4, -6.5, 0.85], [-7.0, -6.9, 1.1], [-5.6, -7.6, 0.9], [-9.2, -9.5, 1.15],
    [-7.1, -9.6, 0.95], [-5.2, -9.2, 1.05], [-6.1, -6.9, 0.8], [-9.9, -8.3, 0.9], [-4.9, -8.4, 0.75],
  ];
  const sway = [];
  trees.forEach(([x, z, s], i) => {
    const g = new THREE.Group();
    g.position.set(x, hillH(x, z) - 0.02, z);
    scene.add(g);
    const trunk = new Builder();
    trunk.cyl(0.07 * s, 0.09 * s, 0.7 * s, P.treeTrunk, { y: 0.35 * s, k: 'solid' }, 6);
    trunk.finish(g);
    const canopy = new THREE.Group();
    canopy.position.set(0, 0.7 * s, 0);
    g.add(canopy);
    const cb = new Builder();
    const cols = ['#5fae74', '#4f9e6a', '#6dbb7a', '#3f8a5e'];
    const blobs = [[0, 0.45, 0, 0.5], [0.22, 0.25, 0.1, 0.36], [-0.2, 0.3, -0.12, 0.38], [0.02, 0.7, 0.04, 0.34]];
    blobs.forEach(([bx, by, bz, r], j) => {
      cb.sph(r * s, cols[(i + j) % cols.length], { x: bx * s, y: by * s, z: bz * s, k: 'solid' }, 9, 6);
    });
    cb.finish(canopy);
    sway.push({ g: canopy, ph: i * 0.9, amp: 0.05 + 0.02 * s });
  });
  dyn.push({
    update(t) {
      for (const s of sway) {
        const w = windAt(s.g.parent.position.x, s.g.parent.position.z, t);
        s.g.rotation.z = Math.sin(t * 1.4 + s.ph) * s.amp * (0.6 + w) + 0.04 * w;
        s.g.rotation.x = Math.sin(t * 1.1 + s.ph * 1.7) * s.amp * 0.6 * (0.5 + w);
      }
    },
  });
  return { hillH };
}

export { hillH };
