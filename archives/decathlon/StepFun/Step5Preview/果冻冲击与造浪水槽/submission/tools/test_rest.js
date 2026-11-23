global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [-0.62, 0.15, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
for (let i = 0; i <= 120; i++) {
  if (i % 20 === 0) {
    let mn = 1e9, mx = -1e9, bad = false;
    for (let q = 0; q < j.pos.length; q++) { if (!isFinite(j.pos[q])) bad = true; }
    for (let q = 1; q < j.pos.length; q += 3) { mn = Math.min(mn, j.pos[q]); mx = Math.max(mx, j.pos[q]); }
    console.log('t', (i / 120).toFixed(2), 'vol', j.volume().toFixed(6), 'y', mn.toFixed(4), mx.toFixed(4), 'frac', j.fractureEvents, 'bad', bad);
  }
  j.step(1 / 120, { groundY: 0, friction: 0.9 });
}
