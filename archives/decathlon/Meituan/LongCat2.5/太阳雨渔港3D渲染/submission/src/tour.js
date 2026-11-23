import * as THREE from 'three';
import { clamp, lerp, easeInOut } from './common.js';

export const TOUR_DURATION = 64;

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const SHOTS = [
  {
    t0: 0, t1: 7,
    camFrom: V(40, 25, -44), camTo: V(31, 19, -33),
    lookFrom: V(-8, -1, -5), lookTo: V(-4, -1, -3),
  },
  {
    t0: 7, t1: 13,
    camFrom: V(-28, 7.5, -30), camTo: V(-8, 6.0, -25.5),
    lookFrom: V(-10, 0.5, -18), lookTo: V(10, 0.2, -15),
  },
  {
    t0: 13, t1: 19,
    camFrom: V(-4.5, 2.6, -20.5), camTo: V(-0.6, 1.3, -23.8),
    lookFrom: V(-0.85, 0.7, -26.3), lookTo: V(-0.85, 0.72, -26.5),
  },
  {
    t0: 19, t1: 25,
    camFrom: V(-3.4, 1.9, -14.4), camTo: V(-1.6, 1.3, -12.2),
    lookFrom: V(0.4, 0.5, -10.6), lookTo: V(0.8, 0.45, -10.3),
  },
  {
    t0: 25, t1: 31,
    camFrom: V(12.9, 1.9, -14.6), camTo: V(12.0, 1.3, -15.4),
    lookFrom: V(10.9, 0.6, -16.2), lookTo: V(10.8, 0.65, -16.1),
  },
  {
    t0: 31, t1: 37,
    camFrom: V(-15.7, 2.3, -8.0), camTo: V(-16.7, 2.0, -9.2),
    lookFrom: V(-22, 1.0, -12.5), lookTo: V(-23, 1.1, -13.2),
  },
  {
    t0: 37, t1: 43,
    camFrom: V(-21.8, 2.0, 10.8), camTo: V(-21.8, 2.0, 8.0),
    lookFrom: V(-25.5, 1.2, 4.8), lookTo: V(-25.5, 1.2, 4.6),
  },
  {
    t0: 43, t1: 49,
    camFrom: V(-3.2, 2.6, 9.2), camTo: V(-2.4, 2.8, 10.8),
    lookFrom: V(-1.5, 3.2, 13.3), lookTo: V(-1.5, 3.3, 13.4),
  },
  {
    t0: 49, t1: 55,
    camFrom: V(4.2, 1.2, 11.0), camTo: V(3.0, 0.7, 9.6),
    lookFrom: V(1.4, -0.2, 7.9), lookTo: V(1.4, -0.25, 7.9),
  },
  {
    t0: 55, t1: 60,
    camFrom: V(32.5, -2.2, -7.5), camTo: V(30.0, -3.4, -2.0),
    lookFrom: V(18, -4.5, 2.5), lookTo: V(19, -5.0, 1.5),
  },
  {
    t0: 60, t1: 64,
    camFrom: V(30.5, 2.4, -27.8), camTo: V(28.8, 1.7, -25.0),
    lookFrom: V(24.5, 1.4, -21.0), lookTo: V(24.6, 1.6, -21.0),
  },
];

const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();

export function applyTourCamera(t, camera) {
  let shot = SHOTS[SHOTS.length - 1];
  for (const s of SHOTS) {
    if (t >= s.t0 && t <= s.t1) { shot = s; break; }
  }
  if (t < SHOTS[0].t0) shot = SHOTS[0];
  const dur = shot.t1 - shot.t0;
  const u = clamp((t - shot.t0) / dur, 0, 1);
  const e = easeInOut(u);
  _camPos.lerpVectors(shot.camFrom, shot.camTo, e);
  _look.lerpVectors(shot.lookFrom, shot.lookTo, e);
  const sway = Math.sin(t * 0.9) * 0.035 + Math.sin(t * 0.53 + 1.2) * 0.02;
  const sway2 = Math.cos(t * 0.7) * 0.03;
  camera.position.set(_camPos.x + sway, _camPos.y + sway2 * 0.6, _camPos.z + sway2);
  camera.lookAt(_look);
}
