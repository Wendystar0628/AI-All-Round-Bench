// Assemble the Breaker Delta: skeleton, parts, pose, bake.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { buildTorso } from './torso.js';
import { buildShoulders } from './shoulders.js';
import { buildHead } from './head.js';
import { buildArms, armJoints } from './arms.js';
import { buildLegs } from './legs.js';
import { buildBack } from './back.js';
import { buildSword } from './sword.js';
import { DEG, V3 } from './geo.js';

export const JOINTS = {
  pelvis: ['root', V3(0, 44.1, 0)],
  hipArmorL: ['pelvis', V3(6.4, 46.8, 0)],
  hipArmorR: ['pelvis', V3(-6.4, 46.8, 0)],
  waist: ['pelvis', V3(0, 48.6, -0.3)],
  chest: ['waist', V3(0, 52.6, -0.3)],
  neck: ['chest', V3(0, 63.7, 0.5)],
  pauldronL: ['chest', V3(12.5, 60.2, -0.2)],
  pauldronR: ['chest', V3(-12.5, 60.2, -0.2)],
  shoulderL: ['chest', V3(12.5, 60.2, -0.2)],
  elbowL: ['shoulderL', V3(12.5, 47.6, -0.2)],
  wristL: ['elbowL', V3(12.5, 35.7, -0.2)],
  shoulderR: ['chest', V3(-12.5, 60.2, -0.2)],
  elbowR: ['shoulderR', V3(-12.5, 47.6, -0.2)],
  wristR: ['elbowR', V3(-12.5, 35.7, -0.2)],
  hipL: ['pelvis', V3(4.7, 44.1, 0)],
  kneeL: ['hipL', V3(4.7, 25.2, 0.2)],
  ankleL: ['kneeL', V3(4.7, 5.6, 0)],
  hipR: ['pelvis', V3(-4.7, 44.1, 0)],
  kneeR: ['hipR', V3(-4.7, 25.2, 0.2)],
  ankleR: ['kneeR', V3(-4.7, 5.6, 0)],
};

const ALL = ['torso', 'shoulders', 'head', 'arms', 'legs', 'back', 'sword'];

export function buildMech(opts = {}) {
  const B = new Builder();
  for (const [name, [parent, rest]] of Object.entries(JOINTS)) B.joint(name, parent, rest);
  armJoints(B);
  const parts = opts.parts || ALL;
  if (parts.includes('torso')) buildTorso(B);
  if (parts.includes('shoulders')) buildShoulders(B);
  if (parts.includes('head')) buildHead(B);
  if (parts.includes('arms')) buildArms(B);
  if (parts.includes('legs')) buildLegs(B);
  if (parts.includes('back')) buildBack(B);
  if (parts.includes('sword')) buildSword(B);
  if (opts.pose !== false) applyPose(B);
  B.root.updateMatrixWorld(true);
  for (const f of B.later) f();
  if (opts.pose !== false) buildHydraulics(B);
  return B;
}

const q = (x, y, z, order = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, order));

export function applyPose(B) {
  const J = B.J;
  const e = (j, x, y, z, order = 'XYZ') => J[j].rotation.set(x * DEG, y * DEG, z * DEG, order);
  // torso: turned toward the sword side, chest out
  e('waist', -1.5, 10, 0, 'YXZ');
  e('chest', -2.5, 0, 0);
  e('neck', 3.5, -4, 0, 'YXZ');
  // legs: wide stance, knees slightly bent, left foot a little forward
  e('hipL', -7, 0, 12, 'ZXY');
  e('kneeL', 11, 0, 0);
  e('hipR', 1, 0, -12, 'ZXY');
  e('kneeR', 9, 0, 0);
  e('hipArmorL', 0, 0, 5);
  e('hipArmorR', 0, 0, -5);
  B.root.updateMatrixWorld(true);
  B.setWorldQuat('ankleL', q(0, 9, 0));
  B.setWorldQuat('ankleR', q(0, -9, 0));
  // right arm: hanging, slightly out, hand open
  e('shoulderR', -5, 0, -12, 'ZXY');
  e('elbowR', -14, 0, 0);
  e('wristR', -6, 0, -4);
  e('pauldronR', 0, 0, -2.5);
  for (let k = 0; k < 4; k++) {
    const spread = (k - 1.5) * -3.5;
    e(`fR${k}a`, spread, 0, 9 + k * 2);
    e(`fR${k}b`, 0, 0, 11 + k * 2);
    e(`fR${k}c`, 0, 0, 8);
  }
  e('tRa', 22, 0, 12); e('tRb', 10, 0, 10);
  // left arm: extended outward-down, fist, dorsal facing forward-up (sword face toward the sea)
  B.root.updateMatrixWorld(true);
  {
    const d1 = new THREE.Vector3(0.56, -0.79, 0.25).normalize();
    let n = new THREE.Vector3(0.22, 0.34, 0.92);
    n.addScaledVector(d1, -n.dot(d1)).normalize();
    const f3 = new THREE.Vector3().crossVectors(d1, n);
    const F = new THREE.Matrix4().makeBasis(d1, n, f3);
    // rest basis: arm (0,-1,0), dorsal (1,0,0), e3 = arm x dorsal = (0,0,1)
    const E = new THREE.Matrix4().makeBasis(V3(0, -1, 0), V3(1, 0, 0), V3(0, 0, 1));
    const M = F.multiply(E.clone().transpose());
    B.setWorldQuat('shoulderL', new THREE.Quaternion().setFromRotationMatrix(M));
  }
  e('pauldronL', 0, 0, 7);
  e('elbowL', -7, 0, 0);
  e('wristL', 0, 0, 5);
  for (let k = 0; k < 4; k++) {
    e(`fL${k}a`, 0, 0, -84);
    e(`fL${k}b`, 0, 0, -98);
    e(`fL${k}c`, 0, 0, -72);
  }
  e('tLa', 30, 0, -40); e('tLb', 0, 0, -45);
  B.root.updateMatrixWorld(true);
  // settle so the lowest ankle sits at rest height (feet on the sea bed)
  const aL = new THREE.Vector3(), aR = new THREE.Vector3();
  J.ankleL.getWorldPosition(aL); J.ankleR.getWorldPosition(aR);
  const dy = 5.6 - Math.min(aL.y, aR.y);
  J.pelvis.position.y += dy;
  B.root.updateMatrixWorld(true);
  B.settle = dy;
}

// Hydraulics / cables spanning joints, built in posed world space after the pose is applied.
import * as G from './geo.js';
import { PAL } from './builder.js';
export function buildHydraulics(B) {
  const P = (j, x, y, z) => B.pw(j, V3(x, y, z));
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const x0 = s * 12.5, z0 = -0.2;
    // elbow: 3 parallel rods from below the rear sleeve down to the forearm root
    const sleeves = [], rods = [], ends = [];
    for (const dx of [-0.75, 0, 0.75]) {
      const a = P('shoulder' + side, x0 + dx, 51.9, z0 - 2.55);
      const b = P('elbow' + side, x0 + dx * 1.1, 45.6, z0 - 2.25);
      const pk = G.piston(a, b, { r: 0.33, rodR: 0.17, sleeveFrac: 0.42 });
      sleeves.push(pk.sleeve); rods.push(pk.rod); if (pk.ends) ends.push(pk.ends);
    }
    B.addW(G.merge(sleeves), 'metal', PAL.gunDark);
    B.addW(G.merge(rods), 'chrome', 0xd2d5da);
    B.addW(G.merge(ends), 'metal', PAL.gun);
    // knee: two pistons behind the knee (thigh back -> shin back)
    const kx = s * 4.7;
    const ks = [], kr = [], ke = [];
    for (const dx of [-1.1, 1.1]) {
      const a = P('hip' + side, kx + dx, 30.5, -2.4);
      const b = P('knee' + side, kx + dx, 21.5, -2.0);
      const pk = G.piston(a, b, { r: 0.5, rodR: 0.26, sleeveFrac: 0.5 });
      ks.push(pk.sleeve); kr.push(pk.rod); if (pk.ends) ke.push(pk.ends);
    }
    B.addW(G.merge(ks), 'metal', PAL.gunDark);
    B.addW(G.merge(kr), 'chrome', 0xd2d5da);
    B.addW(G.merge(ke), 'metal', PAL.gun);
    // knee cable with clamps (outer back)
    const cpts = [P('hip' + side, kx + s * 2.2, 29.5, -2.9), P('hip' + side, kx + s * 2.8, 26.4, -3.2), P('knee' + side, kx + s * 2.7, 23.2, -2.9), P('knee' + side, kx + s * 2.2, 20.0, -2.6)];
    B.addW(G.cable(cpts, 0.28, { seg: 30, radial: 10 }), 'rubber', PAL.rubber);
    B.addW(G.clampsAlong(cpts, 0.28, 3, { width: 0.25, thick: 0.08 }), 'metal', PAL.gunLight);
    // waist side cables (torso -> pelvis), sagging between joints
    const wpts = [P('chest', s * 6.6, 52.8, -2.6), P('waist', s * 6.4, 50.4, -3.3), P('pelvis', s * 6.2, 48.0, -3.2), P('pelvis', s * 6.5, 46.6, -2.4)];
    B.addW(G.cable(wpts, 0.32, { seg: 30, radial: 10 }), 'rubber', PAL.rubber);
    B.addW(G.clampsAlong(wpts, 0.32, 2, { width: 0.28, thick: 0.08 }), 'metal', PAL.gunLight);
    const w2 = [P('chest', s * 5.8, 52.6, -3.4), P('waist', s * 5.6, 50.2, -4.0), P('pelvis', s * 5.4, 47.8, -3.9), P('pelvis', s * 5.7, 46.4, -3.1)];
    B.addW(G.cable(w2, 0.22, { seg: 30, radial: 8 }), 'hose', PAL.gun);
    // waist hydraulics with yellow rings at the sides
    const a = P('chest', s * 5.0, 52.2, 1.6), b = P('pelvis', s * 4.6, 46.2, 2.2);
    const pk = G.piston(a, b, { r: 0.34, rodR: 0.18, sleeveFrac: 0.45 });
    B.addW(pk.sleeve, 'metal', PAL.gunDark); B.addW(pk.rod, 'chrome', 0xd2d5da); if (pk.ends) B.addW(pk.ends, 'metal', PAL.gun);
    const ringP = a.clone().lerp(b, 0.72), dir = b.clone().sub(a).normalize();
    B.addW(G.placeOn(G.ring(0.2, 0.34, 0.32, { seg: 16 }), ringP, dir), 'metal', PAL.gunLight);
    // hip gaps: short vertical hydraulics from the pelvis down to the top of the thigh, in front of the axle drum
    {
      const hs = [], hr = [], he = [];
      for (const dx of [3.05, 6.15]) {
        const pa = P('pelvis', s * dx, 47.0, 2.85), pb = P('hip' + side, s * dx, 43.0, 3.45);
        const pk = G.piston(pa, pb, { r: 0.32, rodR: 0.16, sleeveFrac: 0.48 });
        hs.push(pk.sleeve); hr.push(pk.rod); if (pk.ends) he.push(pk.ends);
      }
      B.addW(G.merge(hs), 'metal', PAL.gunDark); B.addW(G.merge(hr), 'chrome', 0xd2d5da); B.addW(G.merge(he), 'metal', PAL.gun);
    }
  }
}
