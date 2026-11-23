// ships.js — flagship, guard escort, vanguard escort, shuttle, turret heads, missile (all on one voxel pitch)
(function () {
  'use strict';
  const SF = window.SF, M = SF.M, Grid = SF.Grid, sat = SF.sat, mix = SF.mix;
  const q = (v, s) => Math.round(v / s) * s;

  // stepped rectangular nozzle opening toward -z, carved into an existing housing
  function nozzle(g, cx, cy, hw, hh, zExit, depth, meta, big) {
    const st = Math.max(1, Math.round(Math.min(hw, hh) * 0.15));
    const zs = [zExit];
    for (let s = 0; s < 3; s++) {
      const i = s * st, z1 = zExit + Math.round(depth * (s + 1) / 3); zs.push(z1);
      g.carve(cx - hw + i, cy - hh + i, zExit, cx + hw - i, cy + hh - i, z1);
    }
    g.paint(cx - hw - 1, cy - hh - 1, zExit, cx + hw + 1, cy + hh + 1, zExit + depth + 1, M.DARK_B, -1);
    // glowing lips on every step shoulder (layered rims), bright inner wall
    for (let s = 0; s < 2; s++) {
      const i = s * st, j = (s + 1) * st, z1 = zs[s + 1];
      g.fn(cx - hw + i, cy - hh + i, z1, cx + hw - i, cy + hh - i, z1 + 1, (x, y, z, c) => (c && (x < cx - hw + j || x >= cx + hw - j || y < cy - hh + j || y >= cy + hh - j)) ? M.ENGINE : -1);
    }
    const i2 = 2 * st;
    g.box(cx - hw + i2, cy - hh + i2, zExit + depth, cx + hw - i2, cy + hh - i2, zExit + depth + 2, M.ENGINE);
    const span = hw - i2;
    if (span > 8) {
      g.box(cx - 1, cy - hh + i2, zExit + Math.round(depth * 0.72), cx + 1, cy + hh - i2, zExit + depth, M.METAL);
      g.box(cx - span, cy - 1, zExit + Math.round(depth * 0.72), cx + span, cy + 1, zExit + depth, M.METAL);
    }
    meta.nozzles.push({ p: [cx, cy, zExit + depth * 0.45], hx: hw - st, hy: hh - st, big: big || 1 });
  }
  function mirrorMeta(list, key) {
    const out = [];
    for (const o of list) { out.push(o); if (o[key][0] > 0.01) { const c = Object.assign({}, o); c[key] = [-o[key][0], o[key][1], o[key][2]]; c.mir = true; out.push(c); } }
    return out;
  }

  SF.shipUtil = { nozzle, mirrorMeta, q };

  // =====================================================================================  GUARD (compact, thick)
  SF.buildGuard = function () {
    const g = new Grid(-48, -34, -92, 48, 40, 92); g.xmin = 0;
    const TM = M.T_SMALL, TF = M.T_FINE, meta = { nozzles: [], guns: [] };
    const rnd = SF.rng(771);
    g.loft(-72, 54, z => { const s = sat((z - 10) / 44); return { hw: q(mix(22, 15, s), 1), yt: q(mix(20, 14, s), 1), yb: q(mix(-18, -13, s), 1), ct: 6, cb: 8, q: 2 }; }, TM, { zs: 11 });
    // blunt twin prongs + slot
    g.loft(54, 74, () => ({ cx: 12.5, hw: 7.5, yt: 13, yb: -11, ct: 3, cb: 3, q: 1 }), TM);
    g.loft(74, 90, () => ({ cx: 11.5, hw: 5.5, yt: 9, yb: -7, ct: 2, cb: 2, q: 1 }), TM);
    g.carve(0, -12, 46, 5, 14, 92);
    g.paint(0, -13, 44, 6, 15, 92, M.DARK_B, -1);
    // shoulder armour, stub wings, chin armour
    g.box(14, 12, -50, 34, 24, 24, TM); g.box(18, 24, -42, 30, 28, 12, TM);
    g.box(22, -8, -60, 38, 8, 30, TM); g.box(38, -5, -48, 44, 5, 10, TM);
    g.box(12, -27, -52, 30, -16, 16, TM); g.box(16, -30, -40, 26, -27, 4, TF);
    g.box(0, 20, -38, 10, 30, 10, TM); g.box(0, 30, -22, 5, 35, -4, TF);
    g.box(0, -30, -58, 6, -18, 26, TM);
    // stern
    g.loft(-86, -72, () => ({ hw: 26, yt: 22, yb: -20, ct: 6, cb: 6, q: 2 }), TM);
    g.box(5, -17, -92, 25, 17, -72, TM); nozzle(g, 15, 0, 7, 14, -92, 16, meta, 1);
    g.box(0, -14, -88, 3, 14, -72, TM); nozzle(g, 0, 0, 1, 11, -88, 10, meta, 0.6);
    g.box(26, -6, -72, 37, 6, -58, TF); nozzle(g, 31.5, 0, 3.5, 4, -72, 8, meta, 0.6);
    // trenches
    g.trench(20, -2, -56, 23, 2, 40, M.DARK_B);
    g.trench(36, -1, -46, 39, 1, 8, M.DARK_B);
    // CIWS pedestals
    const ped = (x, y, z, up) => { if (up > 0) { g.box(x - 4, y, z - 4, x + 4, y + 2, z + 4, TF); g.box(x - 3, y + 2, z - 3, x + 3, y + 3, z + 3, M.METAL); meta.guns.push({ p: [x, y + 3, z], up: 1 }); } else { g.box(x - 4, y - 2, z - 4, x + 4, y, z + 4, TF); g.box(x - 3, y - 3, z - 3, x + 3, y - 2, z + 3, M.METAL); meta.guns.push({ p: [x, y - 3, z], up: -1 }); } };
    ped(24, 28, 2, 1); ped(24, 28, -30, 1); ped(41, 5, -20, 1); ped(21, -30, -18, -1);
    g.plate(0, -34, -92, 48, 40, 92, { seed: 3 });
    g.untag(M.DARK_A);
    // details
    g.box(0, -6, 44, 4, 8, 46, M.GLOW); for (let z = 50; z < 88; z += 6) g.box(4, 0, z, 5, 2, z + 4, M.GLOW);
    for (let z = -54; z < 38; z += 8) g.box(20, -1, z, 21, 1, z + 5, M.GLOW);
    g.box(21, -2, -56, 23, -1, 40, M.METAL);
    g.fn(9, 21, -36, 11, 29, 8, (x, y, z, c) => c && y % 3 === 0 && z % 3 !== 0 ? M.WINDOW : -1);
    g.box(4, 34, -14, 5, 36, -12, M.AMBER); g.box(43, 5, -30, 44, 6, -28, M.AMBER);
    g.greeble(0, 30, -36, 10, 33, 8, rnd, 24, [M.METAL, M.DARK_A], 2, [2, 2, 4]);
    g.greeble(14, 24, -48, 34, 27, 22, rnd, 30, [M.METAL, M.DARK_A, M.HULL_B], 2, [2, 1, 4]);
    g.box(26, -1, -86, 27, 1, -74, M.GLOW);
    g.mirrorX(); g.xmin = g.x0;
    meta.nozzles = mirrorMeta(meta.nozzles, 'p'); meta.guns = mirrorMeta(meta.guns, 'p');
    return { g, meta };
  };

  // =====================================================================================  VANGUARD (long, outstretched)
  SF.buildVanguard = function () {
    const g = new Grid(-70, -20, -112, 70, 28, 112); g.xmin = 0;
    const TM = M.T_SMALL, TF = M.T_FINE, meta = { nozzles: [], cells: [] };
    const rnd = SF.rng(1291);
    g.loft(-100, 46, z => { const s = sat((z + 20) / 66); return { hw: q(mix(10, 8, s), 1), yt: q(mix(10, 8, s), 1), yb: -8, ct: 3, cb: 3, q: 1 }; }, TM, { zs: 12 });
    // long slender fork
    g.loft(46, 80, () => ({ cx: 7, hw: 4, yt: 7, yb: -6, ct: 2, cb: 2, q: 1 }), TM);
    g.loft(80, 100, () => ({ cx: 6.5, hw: 3.5, yt: 5, yb: -4, ct: 1, cb: 1, q: 1 }), TM);
    g.loft(100, 110, () => ({ cx: 5, hw: 2, yt: 3, yb: -2, ct: 1, cb: 1, q: 1 }), TF);
    g.carve(0, -8, 38, 3, 9, 112); g.paint(0, -9, 36, 4, 10, 112, M.DARK_B, -1);
    // dorsal fin stack + ventral fin
    g.box(0, 10, -84, 4, 16, -8, TM); g.box(0, 16, -88, 3, 24, -50, TF); g.box(0, 24, -86, 2, 27, -66, TF);
    g.box(0, -16, -72, 3, -8, -18, TF);
    // swept pylons (stepped) to the missile pods
    for (let k = 0; k < 8; k++) { const x = 9 + k * 4; g.box(x, -3, 2 - k * 5 - 13, x + 5, 3, 2 - k * 5 + 13, TF); }
    for (let k = 0; k < 7; k++) { const x = 9 + k * 4; g.box(x, -2, -60 + k * 3 - 6, x + 5, 2, -60 + k * 3 + 6, TF); }
    // missile pods
    g.loft(-76, 22, () => ({ cx: 51, hw: 11, yt: 8, yb: -8, ct: 2, cb: 2, q: 1 }), TM);
    g.box(40, -8, 22, 44, 8, 42, TF); g.box(58, -8, 22, 62, 8, 42, TF); g.box(40, -5, 42, 43, 5, 52, TF); g.box(59, -5, 42, 62, 5, 52, TF);
    g.box(62, -2, -62, 66, 2, 38, TF); g.box(62, -1, 38, 64, 1, 60, TF); g.box(66, -1, -50, 68, 1, 10, TF);
    // engines
    g.box(2, -7, -110, 12, 8, -96, TM); nozzle(g, 7, 0.5, 3, 5.5, -110, 10, meta, 1);
    g.box(45, -6, -86, 57, 6, -74, TF); nozzle(g, 51, 0, 4, 4, -86, 8, meta, 0.8);
    g.trench(9, -1, -90, 11, 1, 30, M.DARK_B);
    g.plate(0, -20, -112, 70, 28, 112, { seed: 5 });
    g.untag(M.DARK_A);
    // launch cells: top + bottom rows, front tubes
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) {
      const x = 45 + r * 7, z = -66 + c * 9;
      g.box(x - 1, 6, z - 1, x + 4, 10, z + 4, M.DARK_A); g.carve(x, 6, z, x + 3, 10, z + 3); g.box(x, 5, z, x + 3, 6, z + 3, M.DARK_B); g.box(x + 1, 6, z + 1, x + 2, 8, z + 2, M.MISSILE);
      g.box(x - 1, -10, z - 1, x + 4, -6, z + 4, M.DARK_A); g.carve(x, -10, z, x + 3, -6, z + 3); g.box(x, -6, z, x + 3, -5, z + 3, M.DARK_B); g.box(x + 1, -8, z + 1, x + 2, -6, z + 2, M.MISSILE);
      meta.cells.push({ p: [x + 1.5, 9, z + 1.5], d: [0.25, 1, 0.2] }); meta.cells.push({ p: [x + 1.5, -9, z + 1.5], d: [0.25, -1, 0.2] });
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = 44 + c * 5, y = -6 + r * 4; g.carve(x, y, 18, x + 3, y + 3, 24); g.box(x, y, 16, x + 3, y + 3, 18, M.DARK_B); g.box(x + 1, y + 1, 17, x + 2, y + 2, 21, M.MISSILE); }
    g.box(0, -3, 36, 2, 4, 38, M.GLOW); for (let z = 42; z < 106; z += 6) g.box(2, 0, z, 3, 1, z + 4, M.GLOW);
    for (let z = -88; z < 28; z += 7) g.box(9, 0, z, 10, 1, z + 4, M.GLOW);
    g.box(1, 26, -70, 2, 28, -68, M.AMBER); g.box(67, 0, -20, 68, 1, -18, M.AMBER); g.box(63, 0, 56, 64, 1, 58, M.GLOW);
    g.fn(3, 11, -80, 5, 15, -12, (x, y, z, c) => c && y % 2 === 1 && z % 4 !== 0 ? M.WINDOW : -1);
    g.greeble(40, 8, -74, 62, 10, 20, rnd, 14, [M.METAL, M.DARK_A], 2, [2, 1, 3]);
    g.box(40, -1, -76, 41, 1, 20, M.GLOW);
    g.mirrorX(); g.xmin = g.x0;
    meta.nozzles = mirrorMeta(meta.nozzles, 'p');
    const cells = []; for (const c of meta.cells) { cells.push(c); cells.push({ p: [-c.p[0], c.p[1], c.p[2]], d: [-c.d[0], c.d[1], c.d[2]] }); } meta.cells = cells;
    return { g, meta };
  };

  // =====================================================================================  SHUTTLE (1/40 of the flagship)
  SF.buildShuttle = function () {
    const g = new Grid(-8, -4, -15, 8, 6, 15); g.xmin = 0;
    g.box(0, -2, -10, 3, 3, 6, M.HULL_A); g.box(0, -1, -12, 2, 2, -10, M.DARK_A);
    g.box(2, -1, 6, 5, 1, 14, M.HULL_A); g.box(2, 0, 4, 4, 2, 9, M.HULL_B);        // prong
    g.box(3, -2, -10, 7, 0, 1, M.HULL_B); g.box(5, -1, -8, 8, 0, -2, M.HULL_C);    // stub wing
    g.box(0, 3, -6, 2, 4, 3, M.HULL_B); g.box(0, 3, 0, 2, 4, 5, M.DARK_B);         // canopy
    g.box(3, 0, -12, 6, 2, -6, M.DARK_A); g.box(3, 0, -13, 6, 2, -12, M.ENGINE);   // side engine
    g.box(0, -1, -13, 2, 2, -12, M.ENGINE);
    g.box(1, 0, 6, 2, 1, 12, M.GLOW);
    g.box(7, -1, -5, 8, 0, -4, M.AMBER);
    g.box(0, -3, -6, 2, -2, 2, M.DARK_A);
    g.mirrorX(); g.xmin = g.x0;
    return { g, meta: { nozzles: [{ p: [0, 0.5, -12], hx: 5, hy: 1.6 }] } };
  };

  // pulse turret head (pivot at origin, barrels toward +z)
  SF.buildTurret = function () {
    const g = new Grid(-9, -1, -10, 9, 12, 26); g.xmin = 0;
    g.box(0, 0, -8, 7, 4, 8, M.T_FINE); g.box(0, 4, -6, 5, 8, 6, M.T_FINE); g.box(0, 8, -4, 3, 9, 2, M.METAL);
    g.plate(0, -1, -10, 9, 12, 26, { seed: 9 }); g.untag(M.DARK_A);
    g.box(3, 2, 8, 7, 7, 24, M.METAL); g.box(3, 3, 12, 8, 6, 16, M.HULL_A); g.box(3, 3, 19, 8, 6, 21, M.HULL_B);
    g.carve(4, 3, 22, 6, 6, 25); g.box(4, 3, 21, 6, 6, 22, M.TGLOW);
    g.box(2, 4, 8, 3, 5, 22, M.TGLOW);
    g.box(0, 2, 8, 2, 6, 11, M.DARK_A);
    g.mirrorX(); g.xmin = g.x0;
    return { g, meta: { muzzles: [[5, 4.5, 25], [-5, 4.5, 25]] } };
  };

  // guard close-in gun head
  SF.buildCIWS = function () {
    const g = new Grid(-4, -1, -4, 4, 7, 13); g.xmin = 0;
    g.box(0, 0, -3, 3, 4, 3, M.HULL_B); g.box(0, 4, -2, 2, 5, 2, M.METAL); g.box(0, 1, 3, 3, 4, 5, M.DARK_A);
    g.box(1, 1, 5, 2, 2, 12, M.METAL); g.box(1, 3, 5, 2, 4, 12, M.METAL);
    g.box(1, 1, 12, 2, 2, 13, M.TGLOW); g.box(1, 3, 12, 2, 4, 13, M.TGLOW);
    g.box(2, 2, -3, 3, 3, 3, M.AMBER);
    g.mirrorX(); g.xmin = g.x0;
    return { g, meta: { muzzles: [[1.5, 1.5, 13], [-1.5, 3.5, 13], [-1.5, 1.5, 13], [1.5, 3.5, 13]] } };
  };

  SF.buildMissile = function () {
    const g = new Grid(-3, -3, -7, 3, 3, 7);
    g.box(-1, -1, -5, 2, 2, 4, M.MISSILE); g.box(0, 0, 4, 1, 1, 6, M.HULL_C); g.box(-1, -1, 2, 2, 2, 3, M.MARK);
    g.box(-2, 0, -5, 3, 1, -2, M.HULL_B); g.box(0, -2, -5, 1, 3, -2, M.HULL_B);
    g.box(-1, -1, -6, 2, 2, -5, M.DARK_A); g.box(0, 0, -7, 1, 1, -5, M.MOTOR);
    return { g, meta: {} };
  };

  // corridor energy block
  SF.buildEBlock = function () {
    const g = new Grid(-3, -2, -4, 3, 3, 4);
    g.box(-2, -1, -3, 2, 2, 3, M.EBLOCK); g.box(-3, -2, -4, 3, -1, 4, M.INT_M); g.box(-3, -2, -4, -2, 3, -3, M.INT_M); g.box(2, -2, 3, 3, 3, 4, M.INT_M); g.box(-3, -2, 3, -2, 3, 4, M.INT_M); g.box(2, -2, -4, 3, 3, -3, M.INT_M);
    return { g, meta: {} };
  };
})();
