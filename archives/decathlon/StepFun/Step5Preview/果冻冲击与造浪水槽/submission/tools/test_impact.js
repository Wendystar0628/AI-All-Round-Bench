global.window = global;
global.APP = {};
require('../js/core.js');
global.APP.R = { createDynMesh: () => ({ nIdx: 0 }), updateDynMesh: () => { }, makeMesh: () => ({}) };
require('../js/jelly.js');

function run(soft, stur, dens, r, h0, label) {
  const j = new APP.Jelly({ id: 0, size: [0.36, 0.3, 0.26], segs: [8, 7, 6], center: [-0.62, 0.15, 0], color: [1, 0.3, 0.4, 1], softness: soft, sturdiness: stur, density: 1050 });
  const V = 4 / 3 * Math.PI * r * r * r;
  const ball = { x: -0.62, y: 0.15 + 0.13 + h0, z: 0, vx: 0, vy: 0, vz: 0, r, mass: dens * V };
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
  let maxDepth = 0;
  for (let i = 0; i < 300; i++) {
    const h = 1 / 480;
    ball.vy -= 9.81 * h;
    ball.y += ball.vy * h;
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * 0.3; }
    j.step(1 / 120, world);
    maxDepth = Math.max(maxDepth, 0.28 - ball.y);
  }
  let bad = false;
  for (let q = 0; q < j.pos.length; q++) if (!isFinite(j.pos[q])) { bad = true; break; }
  console.log(label, 'soft', soft, 'stur', stur, 'ballY', ball.y.toFixed(3), 'maxDepth', maxDepth.toFixed(3), 'frac', j.fractureEvents, 'vol%', (j.volume() / j.vol0 * 100).toFixed(1), 'bad', bad);
}
run(0.6, 0.75, 7800, 0.1, 1.05, 'A');
run(0.6, 0.9, 7800, 0.1, 1.05, 'B');
run(0.6, 1.0, 7800, 0.1, 1.05, 'C');
run(0.35, 0.75, 7800, 0.1, 1.05, 'D');
run(0.6, 0.75, 3000, 0.09, 0.85, 'E');
run(0.8, 0.75, 7800, 0.1, 1.05, 'F');
run(0.8, 0.3, 7800, 0.1, 1.05, 'G');
