const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js']) + `;return ({JellySim, RigidBall, V3, clamp, lerp, TFACE})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellySim } = lib;
for (const kd of [0.004, 0.015, 0.04]) {
  const sim = new JellySim(16000, 100000);
  const id = sim.addBody({ kind: 'pudding', size: [0.235, 0.175, 0.15, 0.035], h: 0.046, offset: [0, 0, 0], mu: 9500, tough: 9, bulk: 30 });
  sim.bodies[id].kd = kd;
  sim.rebuildTopology(); sim.refreshCompliance();
  const dt = 1 / 480; const out = [];
  for (let i = 0; i < 960; i++) {
    sim.substep(dt);
    if (i % 40 === 0) { let ymax = -9; for (let v = 0; v < sim.n; v++) ymax = Math.max(ymax, sim.X[v*3+1]); out.push(ymax.toFixed(3)); }
  }
  console.log('kd', kd, out.join(' '));
}
