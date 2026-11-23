global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');
const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [-0.62, 0.15, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
for (let i = 0; i < 24; i++) {
  j.step(1 / 120, { groundY: 0, friction: 0.9 });
  let bad = false, mx = 0;
  for (let q = 0; q < j.pos.length; q++) { if (!isFinite(j.pos[q])) bad = true; mx = Math.max(mx, Math.abs(j.pos[q])); }
  console.log('step', i, 'bad', bad, 'mx', mx.toFixed(3), 'vol', j.volume().toFixed(6), 'frac', j.fractureEvents);
  if (bad) break;
}
// per-tet check of V0 vs actual
for (let t = 0; t < 6; t++) {
  const ti = t * 4;
  const p0 = j.tets[ti] * 3, p1 = j.tets[ti + 1] * 3, p2 = j.tets[ti + 2] * 3, p3 = j.tets[ti + 3] * 3;
  const pos = j.pos;
  const b = [pos[p1] - pos[p0], pos[p1 + 1] - pos[p0 + 1], pos[p1 + 2] - pos[p0 + 2]];
  const c = [pos[p2] - pos[p0], pos[p2 + 1] - pos[p0 + 1], pos[p2 + 2] - pos[p0 + 2]];
  const d = [pos[p3] - pos[p0], pos[p3 + 1] - pos[p0 + 1], pos[p3 + 2] - pos[p0 + 2]];
  const nx = c[1] * d[2] - c[2] * d[1], ny = c[2] * d[0] - c[0] * d[2], nz = c[0] * d[1] - c[1] * d[0];
  const det = b[0] * nx + b[1] * ny + b[2] * nz;
  console.log('tet', t, 'verts', j.tets[ti], j.tets[ti + 1], j.tets[ti + 2], j.tets[ti + 3], 'V0', j.tetVol0[t].toExponential(4), 'V', (det / 6).toExponential(4));
}
