import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const TARGET = new THREE.Vector3(0.6, -1.0, 0.4);
// 默认观看方向：右前上方，俯角约 36°
export const VIEW_DIR = new THREE.Vector3(0.58, 0.6, 0.66).normalize();
export const FOV = 30;

const BOX_CORNERS = [];
for (const x of [-10.3, 10.3]) for (const y of [-4.6, 2.2]) for (const z of [-10.3, 10.3]) BOX_CORNERS.push(new THREE.Vector3(x, y, z));

// 找到刚好让底座占满画面（留少量边距）的距离，保证任何宽高比下底座都完整可见
export function fitDistance(aspect, dir = VIEW_DIR, target = TARGET, margin = 0.97) {
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 1000);
  const v = new THREE.Vector3();
  let lo = 4, hi = 200;
  for (let it = 0; it < 48; it++) {
    const mid = (lo + hi) / 2;
    cam.position.copy(target).addScaledVector(dir, mid);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let ok = true;
    for (const c of BOX_CORNERS) {
      v.copy(c).project(cam);
      if (Math.abs(v.x) > margin || Math.abs(v.y) > margin) {
        ok = false;
        break;
      }
    }
    if (ok) hi = mid;
    else lo = mid;
  }
  return hi;
}

// 全貌构图（按画幅比缓存距离，导出时每帧调用也很轻）
const poseCache = new Map();
export function overviewPose(aspect) {
  const key = Math.round(aspect * 1000);
  let d = poseCache.get(key);
  if (d === undefined) {
    d = fitDistance(aspect);
    poseCache.set(key, d);
  }
  return {
    pos: TARGET.clone().addScaledVector(VIEW_DIR, d),
    target: TARGET.clone(),
  };
}

export function makeControls(camera, dom) {
  const c = new OrbitControls(camera, dom);
  c.target.copy(TARGET);
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.minDistance = 2.5;
  c.maxDistance = 70;
  c.maxPolarAngle = Math.PI * 0.495;
  c.screenSpacePanning = true;
  c.zoomSpeed = 0.9;
  c.rotateSpeed = 0.7;
  return c;
}
