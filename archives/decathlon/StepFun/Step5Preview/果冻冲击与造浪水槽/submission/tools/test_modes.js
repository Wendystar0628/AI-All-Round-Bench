global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');
for (const mode of [1, 2, 3]) {
  globalThis.__mode = mode;
  const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [-0.62, 0.15, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
  let bad = false;
  for (let i = 0; i < 60; i++) { j.step(1 / 120, { groundY: 0, friction: 0.9 }); for (let q = 0; q < j.pos.length; q++) if (!isFinite(j.pos[q])) { bad = true; break; } if (bad) break; }
  console.log('mode', mode, 'bad', bad, 'vol', j.volume().toFixed(6), 'frac', j.fractureEvents);
}
