// Viewpoints, orbit controls, smooth transitions and collision constraints.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;
const sph = (target, az, el, dist) => V(
  target.x + dist * Math.cos(el * D) * Math.sin(az * D),
  target.y + dist * Math.sin(el * D),
  target.z + dist * Math.cos(el * D) * Math.cos(az * D));

export function makeViewpoints(M) {
  const swordMid = M.swordRoot.clone().lerp(M.swordTip, 0.3);
  const bladeN = M.swordAxisB.clone().sub(M.swordRoot).normalize();
  const swordCam = swordMid.clone().addScaledVector(bladeN, 56).add(V(-5, -10, 2));
  const tipsR = M.fingertipsR.length ? M.fingertipsR.reduce((a, b) => a.clone().add(b)).multiplyScalar(1 / M.fingertipsR.length) : M.wristR;
  const rArm = M.wristR.clone().lerp(tipsR, 0.25).lerp(M.elbowR, 0.18);
  const vp = [];
  const add = (key, name, short, target, pos, o = {}) => vp.push({ key, name, short, target: target.clone(), pos: pos.clone(), fov: o.fov ?? 38, minD: o.minD ?? 10, maxD: o.maxD ?? 150, minPolar: o.minPolar ?? 0.15, maxPolar: o.maxPolar ?? 1.72, pan: o.pan ?? 8 });
  add('overview', '全景', '全景', V(6, 38.5, 0), V(37, 19, 115), { fov: 42, minD: 60, maxD: 230, minPolar: 0.35, maxPolar: 1.78, pan: 14 });
  add('head', '头部与护领', '头部', M.head, sph(M.head, 24, 4, 23), { fov: 36, minD: 12, maxD: 60, maxPolar: 1.75, pan: 4 });
  add('reactor', '胸口的核动力炉', '核动力炉', M.reactor, sph(M.reactor, 12, -2, 19), { fov: 36, minD: 11, maxD: 55, pan: 4 });
  add('armR', '右臂与手', '右臂', rArm, sph(rArm, -46, 4, 33), { fov: 38, minD: 12, maxD: 70, pan: 7 });
  add('sword', '左臂与链锯剑', '链锯剑', swordMid, swordCam, { fov: 40, minD: 14, maxD: 95, pan: 10 });
  add('shoulders', '肩甲与弧形翼板', '肩甲翼板', V(0, 63.5, -1.5), sph(V(0, 63.5, -1.5), 34, 18, 40), { fov: 38, minD: 18, maxD: 85, pan: 6 });
  add('back', '背部', '背部', V(0, 54, -4), sph(V(0, 54, -4), 202, 10, 40), { fov: 40, minD: 18, maxD: 70, pan: 7 });
  add('waist', '腰腹与骨盆', '腰腹', V(0, 46, 1), sph(V(0, 46, 1), 22, 2, 29), { fov: 38, minD: 14, maxD: 70, pan: 5 });
  add('legs', '腿部与海浪', '腿与浪', V(4, 20, 1), sph(V(4, 20, 1), 36, -5, 40), { fov: 40, minD: 16, maxD: 90, maxPolar: 1.66, pan: 8 });
  add('port', '港口：岸桥、货轮与集装箱堆场', '港口', V(-110, 30, -105), V(115, 92, 150), { fov: 42, minD: 80, maxD: 420, maxPolar: 1.45, pan: 60 });
  add('heli', '直升机视角', '直升机', V(-15, 32, -30), V(-82, 158, 118), { fov: 44, minD: 90, maxD: 330, minPolar: 0.12, maxPolar: 1.2, pan: 40 });
  add('quay', '码头仰望', '码头仰望', V(0, 49, -2), V(-18.5, 18.6, -78), { fov: 54, minD: 40, maxD: 130, minPolar: 0.25, maxPolar: 1.62, pan: 8 });
  return vp;
}

export function createViews({ camera, dom, M, seaHeight }) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  const vps = makeViewpoints(M);
  let current = 0;
  let anim = null;
  let enabled = true;
  let simT = 0;
  const listeners = [];

  // ---------------- collision volumes (posed mech)
  const spheres = [
    [V(0, 57.5, 0.5), 9.6], [V(0, 66.8, 1.0), 4.4], [V(0, 48.5, -0.3), 6.6], [V(0, 42.8, 0), 8.0],
    [M.shoulderL.clone().add(V(0, 2.5, 0)), 6.8], [M.shoulderR.clone().add(V(0, 2.5, 0)), 6.8], [V(0, 61.5, -5.5), 5.5],
  ];
  const caps = [
    [M.shoulderL, M.elbowL, 3.5], [M.elbowL, M.wristL, 4.2], [M.wristL, M.wristL.clone().lerp(M.fingertipsL[0] || M.wristL, 0.8), 3.0],
    [M.shoulderR, M.elbowR, 3.5], [M.elbowR, M.wristR, 4.2], [M.wristR, M.fingertipsR[1] || M.wristR, 3.2],
    [M.hipL, M.kneeL, 4.8], [M.kneeL, M.ankleL, 4.4], [M.hipR, M.kneeR, 4.8], [M.kneeR, M.ankleR, 4.4],
    [M.swordRoot, M.swordTip, 2.7],
  ];
  const boxes = [
    // ship hull + deck stack
    [V(-374, -5, -59.5), V(-70, 46, -12.5)],
    // cranes (portal structure)
    ...[-128, -212, 82].map(x => [V(x - 12, 10, -97), V(x + 12, 66, -61)]),
    // foreground container stacks on the apron
    [V(-42.6, 10, -66.2), V(-29.4, 24.5, -63.0)], [V(-42.1, 10, -69.0), V(-28.9, 21.8, -65.8)],
    [V(-8.1, 10, -67.6), V(5.1, 21.8, -64.4)], [V(-8.6, 10, -70.4), V(4.6, 24.5, -67.2)], [V(-49.6, 10, -84.5), V(-46.4, 19.2, -71.5)],
  ];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function closestOnSeg(p, a, b, out) {
    const ab = tmp2.subVectors(b, a); const t = THREE.MathUtils.clamp(tmp.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
    return out.copy(a).addScaledVector(ab, t);
  }
  const cp = new THREE.Vector3();
  function resolve(p, margin = 1.6) {
    for (let it = 0; it < 3; it++) {
      for (const [c, r] of spheres) {
        const d = p.distanceTo(c);
        if (d < r + margin) { tmp.subVectors(p, c); if (tmp.lengthSq() < 1e-6) tmp.set(0.3, 0.2, 1); p.copy(c).addScaledVector(tmp.normalize(), r + margin); }
      }
      for (const [a, b, r] of caps) {
        closestOnSeg(p, a, b, cp);
        const d = p.distanceTo(cp);
        if (d < r + margin) { const n = tmp.subVectors(p, cp); if (n.lengthSq() < 1e-6) n.set(0, 0, 1); p.copy(cp).addScaledVector(n.normalize(), r + margin); }
      }
      for (const [lo, hi] of boxes) {
        if (p.x > lo.x && p.x < hi.x && p.y > lo.y && p.y < hi.y && p.z > lo.z && p.z < hi.z) {
          const dx0 = p.x - lo.x, dx1 = hi.x - p.x, dy1 = hi.y - p.y, dz0 = p.z - lo.z, dz1 = hi.z - p.z;
          const m = Math.min(dx0, dx1, dy1, dz0, dz1);
          if (m === dy1) p.y = hi.y + 0.5; else if (m === dx0) p.x = lo.x - 0.5; else if (m === dx1) p.x = hi.x + 0.5; else if (m === dz0) p.z = lo.z - 0.5; else p.z = hi.z + 0.5;
        }
      }
    }
    // ground: sea / quay / yard
    let minY;
    if (p.z > -60) minY = Math.max(15.9, seaHeight(p.x, p.z, simT) + 1.4);
    else if (p.z > -118 || p.x < -490 || p.x > 450 || p.z < -430) minY = 17.6;
    else minY = 32.5;
    if (p.z > -61.5 && p.z < -58.5) minY = Math.max(minY, 18.0);
    if (p.y < minY) p.y = minY;
    return p;
  }

  function applyLimits(v) {
    controls.minDistance = v.minD; controls.maxDistance = v.maxD;
    controls.minPolarAngle = v.minPolar; controls.maxPolarAngle = v.maxPolar;
  }
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function go(i, instant = false) {
    i = ((i % vps.length) + vps.length) % vps.length;
    current = i;
    const v = vps[i];
    listeners.forEach(f => f(i));
    if (instant) {
      anim = null;
      camera.position.copy(v.pos); controls.target.copy(v.target); camera.fov = v.fov; camera.updateProjectionMatrix();
      applyLimits(v); controls.update();
      return;
    }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), f0 = camera.fov;
    const o0 = p0.clone().sub(t0), o1 = v.pos.clone().sub(v.target);
    const s0 = new THREE.Spherical().setFromVector3(o0), s1 = new THREE.Spherical().setFromVector3(o1);
    let dTheta = s1.theta - s0.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2; while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const dist = p0.distanceTo(v.pos);
    const dur = THREE.MathUtils.clamp(1.6 + dist / 160, 1.8, 3.4);
    anim = { p0, t0, f0, s0, s1, dTheta, v, t: 0, dur, bulge: Math.abs(dTheta) / Math.PI * Math.max(s0.radius, s1.radius) * 0.28 + Math.min(dist * 0.05, 15) };
    controls.enabled = false;
    // relax limits during flight
    controls.minDistance = 0; controls.maxDistance = Infinity; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  }

  function update(dt, t) {
    simT = t;
    if (!enabled) return;
    if (anim) {
      anim.t += dt;
      const u = Math.min(1, anim.t / anim.dur), e = ease(u);
      const tgt = anim.t0.clone().lerp(anim.v.target, e);
      const r = THREE.MathUtils.lerp(anim.s0.radius, anim.s1.radius, e) + anim.bulge * Math.sin(Math.PI * e);
      const phi = THREE.MathUtils.lerp(anim.s0.phi, anim.s1.phi, e) - 0.18 * Math.sin(Math.PI * e) * Math.min(1, anim.bulge / 30);
      const th = anim.s0.theta + anim.dTheta * e;
      const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, THREE.MathUtils.clamp(phi, 0.05, Math.PI - 0.05), th));
      camera.position.copy(tgt).add(off);
      resolve(camera.position, 2.2);
      controls.target.copy(tgt);
      camera.fov = THREE.MathUtils.lerp(anim.f0, anim.v.fov, e);
      camera.updateProjectionMatrix();
      camera.lookAt(tgt);
      if (u >= 1) {
        anim = null;
        controls.enabled = true;
        applyLimits(vps[current]);
        controls.update();
      }
      return;
    }
    controls.update();
    // clamp target near viewpoint centre
    const v = vps[current];
    const off = controls.target.clone().sub(v.target);
    if (off.length() > v.pan) { controls.target.copy(v.target).addScaledVector(off.normalize(), v.pan); }
    resolve(camera.position);
    camera.lookAt(controls.target);
  }

  // keyboard
  addEventListener('keydown', (e) => {
    if (!enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (k >= '1' && k <= '9') go(parseInt(k, 10) - 1);
    else if (k === '0') go(9);
    else if (k === '-') go(10);
    else if (k === '=') go(11);
    else if (k === 'ArrowRight' || k === ']' || k === 'PageDown') go(current + 1);
    else if (k === 'ArrowLeft' || k === '[' || k === 'PageUp') go(current - 1);
  });

  let saved = null;
  return {
    vps, controls, go, update, resolve,
    get current() { return current; },
    onChange(f) { listeners.push(f); },
    setEnabled(v) {
      enabled = v; controls.enabled = v && !anim;
      if (!v) saved = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov };
    },
    restore() {
      if (saved) { camera.position.copy(saved.p); controls.target.copy(saved.t); camera.fov = saved.fov; camera.updateProjectionMatrix(); camera.lookAt(saved.t); }
      anim = null; controls.enabled = true; applyLimits(vps[current]); controls.update();
    },
  };
}
