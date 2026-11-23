const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js', 'jelly_scene.js']) + `;return ({JellySim, JSHAPES, JELLY_PRESETS})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellySim, JSHAPES, JELLY_PRESETS } = lib;
for (const key of ['berry','lime','amber']) {
  const P = JELLY_PRESETS[key];
  const sim = new JellySim(16000, 100000);
  sim.addBody({ kind: P.kind, size: P.size, h: 0.046, offset: [0,0,0], mu: 5000, tough: 3, bulk: 30 });
  sim.rebuildTopology();
  // 边界顶点相对 SDF 的距离（平移后需减去偏移）
  let ymin = 1e9; for (let v = 0; v < sim.n; v++) ymin = Math.min(ymin, sim.X[v*3+1]);
  const sdf = JSHAPES[P.kind];
  let mx = 0, sum = 0, cnt = 0, bad = 0;
  for (let v = 0; v < sim.n; v++) if (sim.isBnd[v]) {
    const p = [sim.X[v*3], sim.X[v*3+1], sim.X[v*3+2]];
    const d = Math.abs(sdf(p, P.size));
    mx = Math.max(mx, d); sum += d; cnt++; if (d > 0.015) bad++;
  }
  console.log(key, 'bnd', cnt, 'max|sdf|', mx.toFixed(4), 'mean', (sum/cnt).toFixed(4), 'bad>1.5cm', bad, 'minVol', sim.bodies[0].minVolRatio.toFixed(2));
}
