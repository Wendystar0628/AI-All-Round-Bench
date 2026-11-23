const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js']) + `;return ({JellySim, RigidBall, V3, clamp, lerp, TFACE})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellySim, RigidBall } = lib;
const args = process.argv.slice(2).map(Number);
const [mu = 10000, tough = 2.9, mass = 8, H = 0.8, iters = 2, sub = 480] = args;
const sim = new JellySim(16000, 100000);
const id = sim.addBody({ kind: 'pudding', size: [0.235, 0.175, 0.15, 0.035], h: 0.046, offset: [0, 0, 0], mu, tough, bulk: 30 });
sim.bodies[id].kd = 0.015;
sim.rebuildTopology(); sim.refreshCompliance(); sim.iters = iters;
const dt = 1 / sub;
// 预沉降
for (let i = 0; i < sub * 0.8; i++) { sim.substep(dt); for (let k = 0; k < sim.n * 3; k++) sim.Vl[k] *= 0.9; }
sim.Vl.fill(0); sim.time = 0;
let top = -9; for (let v = 0; v < sim.n; v++) top = Math.max(top, sim.X[v*3+1]);
const r = Math.cbrt(3 * mass / (4 * Math.PI * 7800)), rr = Math.max(r, 0.056);
const ball = new RigidBall({ pos: [0, top + rr + H, 0], mass, r: rr, kind: 0, e: 0.38 });
sim.balls.push(ball);
console.log('top', top.toFixed(3), 'r', rr.toFixed(3));
let V0 = 0; for (let t = 0; t < sim.m; t++) V0 += sim.Vol0[t];
const t0 = Date.now(); let minBy = 9, maxS = 0, maxCuts = 0;
for (let i = 0; i < sub * 2.4; i++) {
  sim.substep(dt);
  if (i % 4 === 0) { sim.checkFracture(); }
  minBy = Math.min(minBy, ball.pos[1]); maxS = Math.max(maxS, sim.stats.maxStretch);
  if (i % Math.round(sub / 10) === 0) {
    let ymax = -9, xmax = -9; for (let v = 0; v < sim.n; v++) { ymax = Math.max(ymax, sim.X[v*3+1]); xmax = Math.max(xmax, Math.abs(sim.X[v*3])); }
    console.log('t', (i * dt).toFixed(2), 'ball y', ball.pos[1].toFixed(3), 'vy', ball.vel[1].toFixed(2), 'jelly top', ymax.toFixed(3), 'xmax', xmax.toFixed(3), 'vol', (sim.volumes()[0] / V0).toFixed(3), 'S', sim.stats.maxStretch.toFixed(2), 'cuts', sim.stats.cuts, 'comps', sim.compCount);
  }
}
console.log('min ball y', minBy.toFixed(3), 'maxS', maxS.toFixed(2), 'ms/step', ((Date.now() - t0) / (sub * 2.4)).toFixed(2));
