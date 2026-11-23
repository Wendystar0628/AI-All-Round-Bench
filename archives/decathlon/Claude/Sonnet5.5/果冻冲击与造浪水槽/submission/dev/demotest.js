const load = require('./load.js');
const code = load(['core.js', 'jelly_sim.js', 'jelly_scene.js']) + `;return ({JellyWorld, JELLY_DEMOS, V3})`;
const lib = new Function('GPUBufferUsage','GPUTextureUsage','GPUShaderStage','window','navigator', code)({}, {}, {}, {devicePixelRatio:1}, {});
const { JellyWorld, JELLY_DEMOS } = lib;
const id = process.argv[2] || 'jelly-center';
const T = +(process.argv[3] || 4);
const every = +(process.argv[4] || 0.1);
const D = JELLY_DEMOS[id];
const w = new JellyWorld();
for (const k in D.jelly) w.jellyParams[k] = Object.assign({}, D.jelly[k]);
const t0 = Date.now();
w.splitK = D.K; w.reset(D.layout);
console.log('reset ms', Date.now() - t0, 'tets', w.sim.m);
const evs = D.events.slice();
let next = 0;
const dt = w.dtPhys;
let lastPrint = -1;
while (w.simTime < T) {
  while (evs.length && w.simTime + dt * 0.5 >= evs[0].at) evs.shift().fn(w);
  w.stepFixed();
  if (w.simTime - lastPrint >= every - 1e-9) {
    lastPrint = w.simTime;
    const s = w.sim;
    const bs = s.balls.filter(b => b.active).map(b => `(${b.pos[0].toFixed(2)},${b.pos[1].toFixed(2)},${b.pos[2].toFixed(2)} v${Math.hypot(...b.vel).toFixed(1)})`).join(' ');
    let topv = [];
    for (let bi = 0; bi < s.bodies.length; bi++) { let ymax = -9; for (let v = 0; v < s.n; v++) if (s.Vbody[v] === bi) ymax = Math.max(ymax, s.X[v*3+1]); topv.push(ymax.toFixed(3)); }
    console.log('t', w.simTime.toFixed(2), 'maxS', s.stats.maxStretch.toFixed(2), 'cuts', s.stats.cuts, 'pcs', s.compCount, 'tops', topv.join('/'), bs);
  }
}
{ const s = w.sim; for (let bi = 0; bi < s.bodies.length; bi++) { let cx=0,cz=0,n=0; for (let v=0; v<s.n; v++) if (s.Vbody[v]===bi) { cx+=s.X[v*3]; cz+=s.X[v*3+2]; n++; } console.log('body', bi, 'com', (cx/n).toFixed(3), (cz/n).toFixed(3), 'start', s.bodies[bi].pos0); } }
console.log('total ms', Date.now() - t0);
