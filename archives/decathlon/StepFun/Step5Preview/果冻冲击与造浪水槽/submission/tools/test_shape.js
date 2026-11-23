global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [0, 0.5, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
const pos = j.pos;
// check tet 0 shape matching at rest
const t = 0, ti = 0;
let cx = 0, cy = 0, cz = 0;
for (let m = 0; m < 4; m++) { cx += pos[j.tets[ti + m] * 3]; cy += pos[j.tets[ti + m] * 3 + 1]; cz += pos[j.tets[ti + m] * 3 + 2]; }
cx /= 4; cy /= 4; cz /= 4;
let rcx = 0, rcy = 0, rcz = 0;
for (let m = 0; m < 4; m++) { rcx += j.tetRest[m * 3]; rcy += j.tetRest[m * 3 + 1]; rcz += j.tetRest[m * 3 + 2]; }
rcx /= 4; rcy /= 4; rcz /= 4;
console.log('centroid', cx.toFixed(4), cy.toFixed(4), cz.toFixed(4), 'restCentroid', rcx.toFixed(4), rcy.toFixed(4), rcz.toFixed(4));
const A = new Float32Array(9);
for (let m = 0; m < 4; m++) {
  const pi = j.tets[ti + m] * 3;
  const qx = pos[pi] - cx, qy = pos[pi + 1] - cy, qz = pos[pi + 2] - cz;
  const px = j.tetRest[m * 3] - rcx, py = j.tetRest[m * 3 + 1] - rcy, pz = j.tetRest[m * 3 + 2] - rcz;
  A[0] += qx * px; A[1] += qy * px; A[2] += qz * px;
  A[3] += qx * py; A[4] += qy * py; A[5] += qz * py;
  A[6] += qx * pz; A[7] += qy * pz; A[8] += qz * pz;
}
console.log('A', Array.from(A).map(v => v.toExponential(3)).join(' '));
console.log('Cinv', Array.from(j.tetCinv).map(v => v.toExponential(3)).join(' '));
const B = new Float32Array(9);
for (let cc = 0; cc < 3; cc++) for (let rr = 0; rr < 3; rr++) {
  let s = 0;
  for (let k = 0; k < 3; k++) s += A[k * 3 + rr] * j.tetCinv[cc * 3 + k];
  B[cc * 3 + rr] = s;
}
console.log('B', Array.from(B).map(v => v.toFixed(4)).join(' '));
for (let m = 0; m < 4; m++) {
  const pi = j.tets[ti + m] * 3;
  const px = j.tetRest[m * 3] - rcx, py = j.tetRest[m * 3 + 1] - rcy, pz = j.tetRest[m * 3 + 2] - rcz;
  const gx = cx + B[0] * px + B[3] * py + B[6] * pz;
  const gy = cy + B[1] * px + B[4] * py + B[7] * pz;
  const gz = cz + B[2] * px + B[5] * py + B[8] * pz;
  console.log('p', m, 'cur', pos[pi].toFixed(5), pos[pi+1].toFixed(5), pos[pi+2].toFixed(5), 'goal', gx.toFixed(5), gy.toFixed(5), gz.toFixed(5), 'delta', (gx-pos[pi]).toExponential(2), (gy-pos[pi+1]).toExponential(2), (gz-pos[pi+2]).toExponential(2));
}
console.log('tetVol0', j.tetVol0[0], 'V now', (() => {
  const p0 = j.tets[0]*3, p1 = j.tets[1]*3, p2 = j.tets[2]*3, p3 = j.tets[3]*3;
  const b=[pos[p1]-pos[p0],pos[p1+1]-pos[p0+1],pos[p1+2]-pos[p0+2]];
  const c=[pos[p2]-pos[p0],pos[p2+1]-pos[p0+1],pos[p2+2]-pos[p0+2]];
  const d=[pos[p3]-pos[p0],pos[p3+1]-pos[p0+1],pos[p3+2]-pos[p0+2]];
  const nx=c[1]*d[2]-c[2]*d[1], ny=c[2]*d[0]-c[0]*d[2], nz=c[0]*d[1]-c[1]*d[0];
  return (b[0]*nx+b[1]*ny+b[2]*nz)/6;
})());

