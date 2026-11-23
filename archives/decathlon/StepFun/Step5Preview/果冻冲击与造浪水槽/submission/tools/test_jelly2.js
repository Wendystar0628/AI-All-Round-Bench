global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: (a, b) => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [0, 0.5, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
const world = { groundY: -100, friction: 0.9 };
let nanAt = -1;
for (let i = 0; i < 200; i++) {
  j.step(1 / 120, world);
  let bad = false;
  for (let k = 0; k < j.pos.length; k++) if (!isFinite(j.pos[k])) { bad = true; break; }
  if (bad) { nanAt = i; break; }
}
console.log('nanAt', nanAt, 'vol', j.volume());
if (nanAt >= 0) {
  // single substep trace
  const j2 = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [0, 0.5, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
  const h = 1 / 480;
  j2.prev = new Float32Array(j2.pos);
  for (let s = 0; s < 4; s++) {
    j2.prev.set(j2.pos);
    j2.integrate(h, 9.81);
    j2.ground(-100, 0.9);
    j2.solve(h, 1);
    let bad = false;
    for (let k = 0; k < j2.pos.length; k++) if (!isFinite(j2.pos[k])) { bad = true; break; }
    console.log('substep', s, 'finite', bad ? 'NO' : 'yes', 'vol', j2.volume());
    if (bad) {
      // find which particle
      for (let k = 0; k < j2.pos.length; k++) if (!isFinite(j2.pos[k])) { console.log('bad particle', Math.floor(k / 3), 'comp', k % 3, j2.pos[k]); break; }
      break;
    }
    j2.updateVel(h);
    j2.checkFracture();
  }
}

