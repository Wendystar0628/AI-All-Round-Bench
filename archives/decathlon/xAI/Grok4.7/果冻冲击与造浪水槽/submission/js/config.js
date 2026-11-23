/* global JW */
var JW = JW || {};

JW.CFG = {
  nx: 56,
  ny: 36,
  nz: 24,
  dx: 0.048,
  origin: [0, 0, 0],
  innerMin: [0.14, 0.07, 0.16],
  innerMax: [2.50, 1.18, 1.00],
  waterY: 0.46,
  rho: 1000,
  gravity: 9.81,
  flip: 0.88,
  jacobi: 56,
  maxParticles: 72000,
  maxFoam: 7000,
  maxBalls: 40,
  paddle: { z0: 0.20, z1: 0.96, y0: 0.07, y1: 0.78, thick: 0.06, base: 0.24 }
};

JW.TUNE = {
  jellyIters: 7,
  jellyDt: 1 / 140,
  fluidDt: 1 / 240,
  volComp: 4e-11,
  compFirm: 2.2e-4,
  compSoft: 9e-3,
  dampFirm: 2.4,
  dampSoft: 0.85,
  groundMu: 0.22,
  ballFloorE: 0.42,
  ballJellyFric: 0.55
};

// Must match the WGSL copy in fluid.js exactly.
JW.terrainHeight = function (x, z) {
  var floor = 0.07;
  var dx = x - 1.78;
  var dz = z - 0.58;
  var reef = Math.exp(-(dx * dx) / (2 * 0.15 * 0.15) - (dz * dz) / (2 * 0.20 * 0.20)) * 0.18;
  var t = (x - 2.05) / (2.46 - 2.05);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  t = t * t * (3 - 2 * t);
  var beach = t * 0.40;
  return floor + reef + beach;
};

JW.paddleMotion = function (time, amp, freq) {
  var w = Math.PI * 2 * Math.max(0.05, freq);
  var s = Math.sin(w * time);
  var c = Math.cos(w * time);
  return {
    x: JW.CFG.paddle.base + amp * s,
    vx: amp * w * c
  };
};
