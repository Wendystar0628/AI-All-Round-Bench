import * as THREE from 'three';

// ---- global layout of the holy city (meters, y up, front = +z, clock angles) ----
export const CLK = (h) => h * Math.PI / 6; // clock hour -> theta (0 = back/-z, PI/2 = right/+x, PI = front/+z)
export const dirOf = (th) => new THREE.Vector3(Math.sin(th), 0, -Math.cos(th));
export const P = (r, th, y = 0) => new THREE.Vector3(Math.sin(th) * r, y, -Math.cos(th) * r);
export const outRot = (th) => Math.PI - th; // rotation.y that turns local +z outward at theta

export const MAIN = {
  rimR: 192, depth: 170,
  wallR: 181, wallT: 7, wallTop: 16, parapet: 18,
  T1: { r0: 136, r1: 177, y: 3 },
  T2: { r0: 104, r1: 136, y: 11 },
  T3: { r0: 72, r1: 104, y: 19 },
  plat: { r: 72, y: 40 },
  // grand stair on the front axis: flights / landings (radius along +z, y)
  stair: { w: 22, segs: [[160, 3], [136.7, 15.3], [127.7, 15.3], [104.3, 27.7], [95.3, 27.7], [72, 40]] },
  templeZ: 0,
};

// satellite islands
export const SATS = {
  harbor: { hour: 8, d: 470, y: 16, R: 64, depth: 92, seed: 21 },
  monastery: { hour: 10, d: 415, y: -6, R: 60, depth: 88, seed: 22 },
  wheel: { hour: 12, d: 440, y: 60, R: 52, depth: 80, seed: 23 },
  clock: { hour: 2, d: 430, y: 14, R: 46, depth: 78, seed: 24 },
  ruins: { hour: 4, d: 418, y: -22, R: 54, depth: 84, seed: 25 },
  lighthouse: { hour: 5, d: 720, y: -55, R: 44, depth: 74, seed: 26 },
};
for (const k in SATS) {
  const s = SATS[k];
  s.th = CLK(s.hour);
  s.pos = P(s.d, s.th, s.y);
}

// ground height of the main island city at (x,z) (top surfaces of terraces / platform)
export function mainGround(x, z) {
  const r = Math.hypot(x, z);
  const M = MAIN;
  if (r <= M.plat.r) return M.plat.y;
  // grand stair (front axis band)
  if (Math.abs(x) < M.stair.w / 2 && z > 0 && r <= 160) {
    const s = M.stair.segs;
    for (let i = 0; i < s.length - 1; i++) {
      const [ra, ya] = s[i], [rb, yb] = s[i + 1];
      if (z <= ra && z >= rb) return ya + (yb - ya) * (ra - z) / (ra - rb);
    }
  }
  if (r <= M.T3.r1) return M.T3.y;
  if (r <= M.T2.r1) return M.T2.y;
  if (r <= M.rimR + 2) return M.T1.y;
  return -1e4;
}

export function terraceAt(r) {
  const M = MAIN;
  if (r <= M.plat.r) return 'plat';
  if (r <= M.T3.r1) return 'T3';
  if (r <= M.T2.r1) return 'T2';
  return 'T1';
}

// angular distance helper
export function angDist(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); }
