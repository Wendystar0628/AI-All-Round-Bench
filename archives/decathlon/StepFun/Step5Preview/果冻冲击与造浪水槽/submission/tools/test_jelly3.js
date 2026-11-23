global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [0, 0.5, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
const pos = j.pos;
const check = (tag) => {
  for (let k = 0; k < pos.length; k++) if (!isFinite(pos[k])) { console.log(tag, 'NaN at', Math.floor(k / 3), k % 3); return true; }
  return false;
};
const h = 1 / 480;
j.prev = new Float32Array(pos);
j.integrate(h, 9.81);
check('integrate');
const pr = j.params();
console.log('params', pr);
// distance phase only
const alpha = pr.distC / (h * h);
for (let e = 0; e < j.nE; e++) {
  const i = j.edges[e * 2], jj = j.edges[e * 2 + 1];
  let dx = pos[jj * 3] - pos[i * 3], dy = pos[jj * 3 + 1] - pos[i * 3 + 1], dz = pos[jj * 3 + 2] - pos[i * 3 + 2];
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-9) continue;
  const L = j.edgeLen[e];
  const C = d - L;
  const w = 2 * j.invPMass + alpha;
  const lam = -C / w;
  dx /= d; dy /= d; dz /= d;
  const c = lam * j.invPMass;
  pos[i * 3] -= dx * c; pos[i * 3 + 1] -= dy * c; pos[i * 3 + 2] -= dz * c;
  pos[jj * 3] += dx * c; pos[jj * 3 + 1] += dy * c; pos[jj * 3 + 2] += dz * c;
}
check('distance');
// shape phase only
const A = new Float32Array(9), Rr = new Float32Array(9);
for (let t = 0; t < j.nT; t++) {
  const ti = t * 4;
  let cx = 0, cy = 0, cz = 0;
  for (let m = 0; m < 4; m++) { cx += pos[j.tets[ti + m] * 3]; cy += pos[j.tets[ti + m] * 3 + 1]; cz += pos[j.tets[ti + m] * 3 + 2]; }
  cx /= 4; cy /= 4; cz /= 4;
  let rcx = 0, rcy = 0, rcz = 0;
  for (let m = 0; m < 4; m++) { rcx += j.tetRest[t * 12 + m * 3]; rcy += j.tetRest[t * 12 + m * 3 + 1]; rcz += j.tetRest[t * 12 + m * 3 + 2]; }
  rcx /= 4; rcy /= 4; rcz /= 4;
  for (let k = 0; k < 9; k++) A[k] = 0;
  for (let m = 0; m < 4; m++) {
    const pi = j.tets[ti + m] * 3;
    const qx = pos[pi] - cx, qy = pos[pi + 1] - cy, qz = pos[pi + 2] - cz;
    const px = j.tetRest[t * 12 + m * 3] - rcx, py = j.tetRest[t * 12 + m * 3 + 1] - rcy, pz = j.tetRest[t * 12 + m * 3 + 2] - rcz;
    A[0] += qx * px; A[1] += qy * px; A[2] += qz * px;
    A[3] += qx * py; A[4] += qy * py; A[5] += qz * py;
    A[6] += qx * pz; A[7] += qy * pz; A[8] += qz * pz;
  }
  // polar via exported? not exported; replicate
  const det = A[0] * (A[4] * A[8] - A[5] * A[7]) - A[3] * (A[1] * A[8] - A[2] * A[7]) + A[6] * (A[1] * A[5] - A[2] * A[4]);
  if (Math.abs(det) < 1e-9) console.log('tet', t, 'near-singular A det', det);
  const k2 = pr.shapeK / 4;
  for (let m = 0; m < 4; m++) {
    const pi = j.tets[ti + m] * 3;
    pos[pi] += 0; // skip
  }
  void k2; void Rr;
}
check('shape-skip');
// volume phase only (as in solve)
for (let t = 0; t < j.nT; t++) {
  const ti = t * 4;
  const p0 = j.tets[ti] * 3, p1 = j.tets[ti + 1] * 3, p2 = j.tets[ti + 2] * 3, p3 = j.tets[ti + 3] * 3;
  const ax = pos[p0], ay = pos[p0 + 1], az = pos[p0 + 2];
  const b = [pos[p1] - ax, pos[p1 + 1] - ay, pos[p1 + 2] - az];
  const c = [pos[p2] - ax, pos[p2 + 1] - ay, pos[p2 + 2] - az];
  const d = [pos[p3] - ax, pos[p3 + 1] - ay, pos[p3 + 2] - az];
  const nx = c[1] * d[2] - c[2] * d[1], ny = c[2] * d[0] - c[0] * d[2], nz = c[0] * d[1] - c[1] * d[0];
  const det = b[0] * nx + b[1] * ny + b[2] * nz;
  const V = det / 6;
  const V0 = j.tetVol0[t];
  if (V0 <= 0) { console.log('tet', t, 'V0', V0); continue; }
  const C = (V - V0) / V0;
  const gs = [-nx / 6, nx / 6, (d[1] * b[2] - d[2] * b[1]) / 6, -(c[1] * b[2] - c[2] * b[1]) / 6];
  const gs2 = [-ny / 6, ny / 6, (d[2] * b[0] - d[0] * b[2]) / 6, -(c[2] * b[0] - c[0] * b[1]) / 6];
  const gs3 = [-nz / 6, nz / 6, (d[0] * b[1] - d[1] * b[0]) / 6, -(c[0] * b[1] - c[1] * b[0]) / 6];
  let denom = 0;
  for (let m = 0; m < 4; m++) denom += (gs[m] * gs[m] + gs2[m] * gs2[m] + gs3[m] * gs3[m]) * j.invPMass;
  if (denom < 1e-12) { console.log('tet', t, 'denom', denom); continue; }
  const lam = (-C / denom) * pr.volK;
  for (let m = 0; m < 4; m++) {
    const pi = j.tets[ti + m] * 3;
    pos[pi] += lam * gs[m] * j.invPMass;
    pos[pi + 1] += lam * gs2[m] * j.invPMass;
    pos[pi + 2] += lam * gs3[m] * j.invPMass;
  }
  if (t === 329) { console.log('T329 V', V, 'V0', V0, 'C', C, 'denom', denom, 'lam', lam, 'det', det); }
  if (check('volume t=' + t)) break;
}

