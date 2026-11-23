import * as THREE from 'three';
import { P } from '../core/palette.js';
import { toonGradient, canvasTex } from '../core/materials.js';
import { wob } from '../core/wave.js';

// 动态缆绳：一端绑在系船柱（固定），另一端绑在船的缆桩（随船起伏、摇摆）。
// 中间分三段，垂度随拉力起伏：船被波浪推远时缆绳绷紧（垂度变小），船回来时松下来。
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();

const ropeGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6);
// 缆绳的纤维纹理：螺旋状的斜纹，干燥段为橙红，浸水段为深褐（颜色更深）
function fiberTexture(a, b) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = b;
    g.lineWidth = 9;
    for (let i = -h; i <= w + h; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
    }
  }, { repeat: [1, 6] });
}
export const ropeMat = new THREE.MeshToonMaterial({ map: fiberTexture(P.rope, "#c4502a"), gradientMap: toonGradient });
export const wetMat = new THREE.MeshToonMaterial({ map: fiberTexture(P.ropeWet, "#4f2414"), gradientMap: toonGradient });

// 码头上固定的缆绳（一段干燥、末端浸水）
export function staticRope(scene, pts, r = 0.045) {
  const make = (part, mat) => {
    const curve = new THREE.CatmullRomCurve3(part.map((p) => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 6, false), mat);
    mesh.castShadow = true;
    scene.add(mesh);
  };
  make(pts.slice(0, -2), ropeMat);
  make(pts.slice(-3), wetMat);
}

function placeSeg(m, a, b) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  _mid.addVectors(a, b).multiplyScalar(0.5);
  m.position.copy(_mid);
  _q.setFromUnitVectors(UP, _dir.normalize());
  m.quaternion.copy(_q);
  m.scale.set(1, Math.max(len, 1e-4), 1);
}

export class DynRope {
  constructor(scene, seed = 0, wet = false) {
    this.seed = seed;
    this.segs = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(ropeGeo, wet ? wetMat : ropeMat);
      m.castShadow = true;
      scene.add(m);
      return m;
    });
    this.pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.visible = true;
  }

  // a、b 为世界坐标；base 为静止时的垂度（米）
  update(t, a, b, base = 0.26) {
    const tension = 0.5 + 0.5 * wob(t * 0.55, this.seed);
    const sag = base * (1.25 - 0.55 * tension);
    const p = this.pts;
    p[0].copy(a);
    p[3].copy(b);
    p[1].lerpVectors(a, b, 1 / 3);
    p[2].lerpVectors(a, b, 2 / 3);
    p[1].y -= sag;
    p[2].y -= sag * 0.92;
    for (let i = 0; i < 3; i++) {
      this.segs[i].visible = this.visible;
      placeSeg(this.segs[i], p[i], p[i + 1]);
    }
  }

  setVisible(v) {
    this.visible = v;
    for (const s of this.segs) s.visible = v;
  }
}

// 把船上的缆桩（船本地坐标）换算为世界坐标；需要先更新船的矩阵
const _w = new THREE.Vector3();
export function cleatWorld(group, local, out = _w) {
  group.updateMatrixWorld(true);
  out.set(local[0], local[1], local[2]).applyMatrix4(group.matrixWorld);
  return out;
}
