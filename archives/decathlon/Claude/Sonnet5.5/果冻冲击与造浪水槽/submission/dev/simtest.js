const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js']) + `
;return ({JellySim, RigidBall, V3, clamp, lerp, TFACE})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellySim, RigidBall } = lib;
const sim = new JellySim(16000, 100000);
const h = 0.046;
const id = sim.addBody({ kind: 'pudding', size: [0.235, 0.175, 0.15, 0.035], h, offset: [0, 0, 0], mu: 9500, tough: 2.9, bulk: 30 });
sim.rebuildTopology(); sim.refreshCompliance();
const b = sim.bodies[id];
console.log('verts', sim.n, 'tets', sim.m, 'minVolRatio', b.minVolRatio, 'degenerate', b.degenerate, 'bnd faces', sim.bfaces.length);
let V0 = 0; for (let t = 0; t < sim.m; t++) V0 += sim.Vol0[t];
const dt = 1 / 480;
const t0 = Date.now();
for (let i = 0; i < 480; i++) {
  sim.substep(dt);
  if (i % 4 === 0) sim.checkFracture();
  if (i % 60 === 0) {
    let cy = 0, ymax = -9, ymin = 9, ke = 0;
    for (let v = 0; v < sim.n; v++) { cy += sim.X[v*3+1]; ymax = Math.max(ymax, sim.X[v*3+1]); ymin = Math.min(ymin, sim.X[v*3+1]); }
    const vol = sim.volumes()[0];
    console.log('step', i, 'ymax', ymax.toFixed(4), 'ymin', ymin.toFixed(4), 'vol', (vol / V0).toFixed(4), 'maxS', sim.stats.maxStretch.toFixed(3), 'comps', sim.compCount, 'cuts', sim.stats.cuts);
  }
}
console.log('ms/step', (Date.now() - t0) / 480);
