global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

const soft = 0.6, stur = 0.75, dens = 7800, r = 0.1, h0 = 1.05;
const j = new APP.Jelly({ id: 0, size: [0.42, 0.34, 0.3], segs: [8, 7, 6], center: [-0.62, 0.17, 0], color: [1, 0.3, 0.4, 1], softness: soft, sturdiness: stur, density: 1400 });
const V = 4 / 3 * Math.PI * r * r * r;
const ball = { x: -0.62, y: 0.17 + 0.17 + h0, z: 0, vx: 0, vy: 0, vz: 0, r, mass: dens * V };
const world = {
  groundY: 0, friction: 0.9,
  collideJelly: (jl, hh) => {
    const pos = jl.pos, Rb = ball.r + jl.pr;
    let ax = 0, ay = 0, az = 0, cnt = 0, penSum = 0;
    for (let q = 0; q < jl.nP; q++) {
      if (!jl.pAlive[q]) continue;
      const dx = pos[q * 3] - ball.x, dy = pos[q * 3 + 1] - ball.y, dz = pos[q * 3 + 2] - ball.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > Rb * Rb || d2 < 1e-10) continue;
      const d = Math.sqrt(d2), pen = Rb - d;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      pos[q * 3] += nx * pen; pos[q * 3 + 1] += ny * pen; pos[q * 3 + 2] += nz * pen;
      ax += nx; ay += ny; az += nz; cnt++; penSum += pen;
    }
    if (!cnt) return;
    const nl = Math.hypot(ax, ay, az) || 1;
    const nx = ax / nl, ny = ay / nl, nz = az / nl;
    const mp = cnt * jl.pMass, w = mp / (mp + ball.mass);
    ball.x -= nx * penSum * w * 0.8; ball.y -= ny * penSum * w * 0.8; ball.z -= nz * penSum * w * 0.8;
    const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
    if (vn < 0) { const jimp = -(1.12) * vn / (1 / ball.mass + 1 / mp); ball.vx += nx * jimp / ball.mass; ball.vy += ny * jimp / ball.mass; ball.vz += nz * jimp / ball.mass; }
  },
};
let maxStretch = 1, minVol = 1, stretchKills = 0, volKills = 0;
const origCheck = j.checkFracture.bind(j);
j.checkFracture = function () {
  const pr = this.params();
  const pos = this.pos;
  for (let t = 0; t < this.nT; t++) {
    if (!this.tetAlive[t]) continue;
    const ti = t * 4;
    const a = this.tets[ti] * 3, b = this.tets[ti + 1] * 3, c = this.tets[ti + 2] * 3, d = this.tets[ti + 3] * 3;
    const p0 = [pos[a], pos[a + 1], pos[a + 2]];
    const ps = [p0, [pos[b], pos[b + 1], pos[b + 2]], [pos[c], pos[c + 1], pos[c + 2]], [pos[d], pos[d + 1], pos[d + 2]]];
    const rs = [];
    for (let m = 0; m < 4; m++) rs.push([this.tetRest[t * 12 + m * 3], this.tetRest[t * 12 + m * 3 + 1], this.tetRest[t * 12 + m * 3 + 2]]);
    let ms = 0;
    for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
      const dl = Math.hypot(ps[x][0] - ps[y][0], ps[x][1] - ps[y][1], ps[x][2] - ps[y][2]);
      const rl = Math.hypot(rs[x][0] - rs[y][0], rs[x][1] - rs[y][1], rs[x][2] - rs[y][2]);
      if (rl > 1e-9) ms = Math.max(ms, dl / rl);
    }
    const e1 = [ps[1][0] - p0[0], ps[1][1] - p0[1], ps[1][2] - p0[2]];
    const e2 = [ps[2][0] - p0[0], ps[2][1] - p0[1], ps[2][2] - p0[2]];
    const e3 = [ps[3][0] - p0[0], ps[3][1] - p0[1], ps[3][2] - p0[2]];
    const nx = e2[1] * e3[2] - e2[2] * e3[1], ny = e2[2] * e3[0] - e2[0] * e3[2], nz = e2[0] * e3[1] - e2[1] * e3[0];
    const det = e1[0] * nx + e1[1] * ny + e1[2] * nz;
    const vr = Math.abs(det) / (6 * this.tetVol0[t]);
    maxStretch = Math.max(maxStretch, ms);
    minVol = Math.min(minVol, vr);
    if (ms > pr.stretchLim) stretchKills++;
    if (vr < pr.volLim) volKills++;
  }
  return origCheck();
};
for (let i = 0; i < 300; i++) {
  const h = 1 / 480;
  ball.vy -= 9.81 * h;
  ball.y += ball.vy * h;
  if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * 0.3; }
  j.step(1 / 120, world);
}
console.log('ballY', ball.y.toFixed(3), 'top', (0.17 + 0.17).toFixed(2), 'frac', j.fractureEvents, 'stretchKills', stretchKills, 'volKills', volKills, 'maxStretch', maxStretch.toFixed(3), 'minVol', minVol.toFixed(3), 'vol%', (j.volume() / j.vol0 * 100).toFixed(1));
