global.window = global;
global.APP = {};
require('../js/core.js');
const R = {
  createDynMesh: (a, b) => ({ vb: 1, nb: 1, ib: 1, nIdx: 0, maxIdx: b }),
  updateDynMesh: (m, p, n, i) => { m.nIdx = i.length; },
  makeMesh: () => ({}),
};
global.APP.R = R;
require('../js/jelly.js');

const t0 = Date.now();
const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [-0.62, 0.15, 0], color: [1, 0.3, 0.4, 1], softness: 0.6, sturdiness: 0.75, density: 1050 });
console.log('build ms', Date.now() - t0, 'nP', j.nP, 'nT', j.nT, 'nE', j.nE, 'tris', j.nTris, 'vol0', j.vol0.toFixed(5), 'vol', j.volume().toFixed(5));
const world = { groundY: 0, friction: 0.9 };
for (let i = 0; i < 120; i++) j.step(1 / 120, world);
console.log('after 1s: vol', j.volume().toFixed(5), 'minY', Math.min(...Array.from(j.pos).filter((_, k) => k % 3 === 1)).toFixed(4), 'maxY', Math.max(...Array.from(j.pos).filter((_, k) => k % 3 === 1)).toFixed(4), 'fractures', j.fractureEvents);
// drop a ball
const balls = [{ x: -0.62, y: 0.6, z: 0, vx: 0, vy: -3, vz: 0, r: 0.1, mass: 33 }];
let hits = 0;
const t1 = Date.now();
for (let i = 0; i < 240; i++) {
  const h = 1 / 480;
  for (const b of balls) { b.vy -= 9.81 * h; b.y += b.vy * h; }
  j.step(1 / 120, {
    groundY: 0, friction: 0.9,
    collideJelly: (jl, hh) => {
      for (const b of balls) {
        const pos = jl.pos, Rb = b.r + jl.pr;
        let ax = 0, ay = 0, az = 0, cnt = 0, penSum = 0;
        for (let q = 0; q < jl.nP; q++) {
          if (!jl.pAlive[q]) continue;
          const dx = pos[q * 3] - b.x, dy = pos[q * 3 + 1] - b.y, dz = pos[q * 3 + 2] - b.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > Rb * Rb || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), pen = Rb - d;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          pos[q * 3] += nx * pen; pos[q * 3 + 1] += ny * pen; pos[q * 3 + 2] += nz * pen;
          ax += nx; ay += ny; az += nz; cnt++; penSum += pen;
        }
        if (!cnt) continue;
        hits++;
        const nl = Math.hypot(ax, ay, az) || 1;
        const nx = ax / nl, ny = ay / nl, nz = az / nl;
        const mp = cnt * jl.pMass, w = mp / (mp + b.mass);
        b.x -= nx * penSum * w * 0.8; b.y -= ny * penSum * w * 0.8; b.z -= nz * penSum * w * 0.8;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) { const jimp = -(1.12) * vn / (1 / b.mass + 1 / mp); b.vx += nx * jimp / b.mass; b.vy += ny * jimp / b.mass; b.vz += nz * jimp / b.mass; }
      }
    },
  });
}
console.log('ball drop 2s: hits', hits, 'ballY', balls[0].y.toFixed(3), 'ballVy', balls[0].vy.toFixed(2), 'fractures', j.fractureEvents, 'vol', j.volume().toFixed(5), 'ms', Date.now() - t1);
