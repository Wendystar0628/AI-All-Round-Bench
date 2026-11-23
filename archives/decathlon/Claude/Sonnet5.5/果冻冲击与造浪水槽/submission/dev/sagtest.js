const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js']) + `;return ({JellySim, RigidBall, V3, clamp, lerp, TFACE})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellySim } = lib;
for (const [iters, sub] of [[2, 480], [4, 480], [2, 960], [1, 960]]) for (const mu of [1500, 4000, 9500, 30000]) {
  const sim = new JellySim(16000, 100000);
  const id = sim.addBody({ kind: 'pudding', size: [0.235, 0.175, 0.15, 0.035], h: 0.046, offset: [0, 0, 0], mu, tough: 9, bulk: 30 });
  sim.bodies[id].kd = 0.04;
  sim.rebuildTopology(); sim.refreshCompliance(); sim.iters = iters;
  const dt = 1 / sub; const t0 = Date.now();
  for (let i = 0; i < sub * 1.5; i++) sim.substep(dt);
  let ymax = -9; for (let v = 0; v < sim.n; v++) ymax = Math.max(ymax, sim.X[v*3+1]);
  console.log('iters', iters, 'sub', sub, 'mu', mu, 'h=', ymax.toFixed(3), 'vol', (sim.volumes()[0] / 0.0222).toFixed(3), 'ms/step', ((Date.now()-t0)/(sub*1.5)).toFixed(2));
}
