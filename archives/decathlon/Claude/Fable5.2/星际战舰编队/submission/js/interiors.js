// interiors.js — bridge + hangar (carved into the flagship), power-core atrium, energy loading gallery
(function () {
  'use strict';
  const SF = window.SF, M = SF.M, Grid = SF.Grid, hash3 = SF.hash3;

  // =====================================================================================  BRIDGE  (130 x 130 x 60)
  SF.buildBridge = function (g, meta) {
    const A = M.INT_A, B = M.INT_B, D = M.INT_D, F = M.INT_F, MM = M.INT_M;
    const Z0 = -48, Z1 = 82, Y0 = 62, HZ = 10, PZ = 46;
    g.box(0, Y0 - 3, Z0 - 3, 68, 107, Z1 + 3, D); g.box(0, 104, Z0 - 3, 57, 125, Z1 + 3, D);
    g.carve(0, Y0, Z0, 65, 104, Z1); g.carve(0, 104, Z0, 54, 122, Z1);
    g.box(0, Y0 - 1, Z0, 65, Y0, Z1, F);
    // side tiers + rear gallery
    g.box(34, Y0, Z0 + 14, 50, Y0 + 8, Z1, D); g.box(34, Y0 + 7, Z0 + 14, 50, Y0 + 8, Z1, F); g.fn(34, Y0, Z0 + 14, 35, Y0 + 7, Z1, (x, y, z) => ((z + 400) % 13 === 0 || y === Y0 + 5) ? -1 : A);
    g.box(50, Y0, Z0 + 8, 65, Y0 + 18, Z1, D); g.box(50, Y0 + 17, Z0 + 8, 65, Y0 + 18, Z1, F); g.fn(50, Y0 + 8, Z0 + 8, 51, Y0 + 17, Z1, (x, y, z) => ((z + 400) % 13 === 6 || y === Y0 + 14) ? -1 : A);
    g.box(0, Y0, Z0, 65, Y0 + 22, Z0 + 14, D); g.box(0, Y0 + 21, Z0, 65, Y0 + 22, Z0 + 14, F);
    for (let k = 0; k < 10; k++) g.box(0, Y0, Z0 + 14 + k * 3, 10, Y0 + 20 - 2 * k, Z0 + 17 + k * 3, B);
    // tier risers: light bands + rails
    g.fn(34, Y0 + 5, Z0 + 16, 35, Y0 + 6, Z1 - 2, (x, y, z) => ((z + 400) % 10 < 7) ? M.GLOW_I : -1);
    g.fn(50, Y0 + 14, Z0 + 10, 51, Y0 + 15, Z1 - 2, (x, y, z) => ((z + 400) % 10 < 7) ? M.GLOW_I : -1);
    g.box(34, Y0 + 12, Z0 + 14, 35, Y0 + 13, Z1 - 12, MM); for (let z = Z0 + 14; z < Z1 - 12; z += 8) g.box(34, Y0 + 8, z, 35, Y0 + 12, z + 1, MM);
    g.box(50, Y0 + 22, Z0 + 14, 51, Y0 + 23, Z1 - 12, MM); for (let z = Z0 + 14; z < Z1 - 12; z += 8) g.box(50, Y0 + 18, z, 51, Y0 + 22, z + 1, MM);
    g.box(12, Y0 + 26, Z0 + 13, 50, Y0 + 27, Z0 + 14, MM); for (let x = 12; x < 50; x += 7) g.box(x, Y0 + 22, Z0 + 13, x + 1, Y0 + 26, Z0 + 14, MM);
    g.fn(10, Y0 + 18, Z0 + 14, 34, Y0 + 19, Z0 + 15, (x) => (x % 9 < 6) ? M.AMBER_I : -1);
    // floor inlays
    g.fn(0, Y0 - 1, Z0 + 46, 34, Y0, Z1 - 12, (x, y, z) => (x === 30 && (z + 400) % 6 < 4) ? M.GLOW_I : ((x === 14 && (z + 400) % 12 < 2) ? M.AMBER_I : -1));
    // ---- command hub: layered plinth + suspended display fork
    const octr = (x, z, cz, r) => { const dx = x + 0.5, dz = Math.abs(z + 0.5 - cz); return dx < r && dz < r && dx + dz < r * 1.45; };
    const hub = (r, y0, y1, m, cz) => g.fn(0, y0, cz - r - 1, r + 1, y1, cz + r + 1, (x, y, z) => octr(x, z, cz, r) ? m : -1);
    hub(17, Y0, Y0 + 2, B, HZ); hub(14, Y0 + 2, Y0 + 4, A, HZ); hub(11, Y0 + 4, Y0 + 7, B, HZ);
    g.fn(0, Y0 + 7, HZ - 12, 12, Y0 + 10, HZ + 12, (x, y, z) => (octr(x, z, HZ, 11) && !octr(x, z, HZ, 7.5)) ? (y === Y0 + 9 ? M.SCREEN : MM) : -1);
    g.carve(0, Y0 + 7, HZ + 6, 3, Y0 + 10, HZ + 13);
    hub(3, Y0 + 7, Y0 + 8, M.GLOW_P, HZ);
    g.fn(0, Y0 + 2, HZ - 15, 15, Y0 + 3, HZ + 15, (x, y, z) => (octr(x, z, HZ, 14) && !octr(x, z, HZ, 13)) ? M.GLOW_I : -1);
    g.box(0, 116, HZ - 7, 9, 122, HZ + 7, MM); g.box(5, 96, HZ - 6, 8, 116, HZ - 3, MM); g.box(5, 96, HZ + 3, 8, 116, HZ + 6, MM);
    g.fn(0, 96, HZ - 13, 13, 99, HZ + 13, (x, y, z) => (octr(x, z, HZ, 12) && !octr(x, z, HZ, 9.5)) ? A : -1);
    g.box(0, 83, HZ + 12, 8, 96, HZ + 13, M.HOLO); g.box(0, 83, HZ - 13, 8, 96, HZ - 12, M.HOLO); g.box(12, 83, HZ - 5, 13, 96, HZ + 5, M.HOLO);
    g.box(7, 99, HZ - 1, 8, 100, HZ + 1, M.GLOW_I);
    // ---- hologram projector well in front of the hub
    g.fn(0, Y0, PZ - 16, 16, Y0 + 1, PZ + 16, (x, y, z) => (octr(x, z, PZ, 15) && !octr(x, z, PZ, 13)) ? M.GLOW_P : -1);
    g.fn(0, Y0 - 1, PZ - 13, 13, Y0, PZ + 13, (x, y, z) => octr(x, z, PZ, 12.5) ? D : -1);
    for (const [x, z] of [[9, PZ - 9], [9, PZ + 9]]) { g.box(x, Y0, z, x + 2, Y0 + 3, z + 2, MM); g.box(x, Y0 + 3, z, x + 2, Y0 + 4, z + 2, M.GLOW_I); }
    g.box(0, 106, PZ - 10, 10, 107, PZ + 10, M.HOLO); g.box(0, 107, PZ - 1, 1, 122, PZ + 1, MM);
    // ---- consoles along both tiers and on the floor
    const desk = (x0, y, z, x1, hx) => {
      g.box(x0, y, z, x1, y + 3, z + 9, B); g.box(x0 + 1, y + 3, z + 1, x1 - 1, y + 4, z + 8, M.SCREEN);
      g.box(hx, y + 3, z + 4, hx + 1, y + 6, z + 5, MM); g.box(hx, y + 6, z + 1, hx + 1, y + 13, z + 8, M.HOLO);
    };
    for (let z = Z0 + 22; z < Z1 - 14; z += 16) { desk(37, Y0 + 8, z, 44, 45); desk(54, Y0 + 18, z + 6, 61, 62); }
    for (const z of [PZ - 18, PZ - 2, PZ + 14]) { g.box(19, Y0, z, 27, Y0 + 4, z + 8, B); g.box(20, Y0 + 4, z + 1, 26, Y0 + 5, z + 7, M.SCREEN); g.box(27, Y0 + 3, z + 1, 28, Y0 + 9, z + 7, M.HOLO); }
    for (const x of [18, 42]) { g.box(x, Y0 + 22, Z0 + 4, x + 9, Y0 + 26, Z0 + 10, B); g.box(x + 1, Y0 + 26, Z0 + 5, x + 8, Y0 + 27, Z0 + 9, M.SCREEN); g.box(x + 1, Y0 + 28, Z0 + 3, x + 8, Y0 + 35, Z0 + 4, M.HOLO); }
    // forward sill console under the window
    g.box(0, Y0, Z1 - 12, 48, Y0 + 6, Z1, B); g.box(0, Y0 + 6, Z1 - 6, 46, Y0 + 10, Z1, D);
    g.fn(2, Y0 + 6, Z1 - 11, 44, Y0 + 7, Z1 - 7, (x) => (x % 8 < 6) ? M.SCREEN : -1);
    for (const x of [8, 30]) g.box(x, Y0 + 10, Z1 - 3, x + 8, Y0 + 13, Z1 - 2, M.HOLO);
    // ---- overhead trusses, hanging displays
    for (const z of [-26, 16, 58]) {
      g.box(0, 112, z, 54, 118, z + 6, B); for (let x = 4; x < 50; x += 8) g.carve(x, 114, z, x + 4, 116, z + 6);
      g.box(46, 104, z, 54, 112, z + 6, B); g.box(54, 96, z, 65, 104, z + 6, B); g.box(60, 90, z + 1, 65, 96, z + 5, MM);
      g.box(10, 111, z + 2, 30, 112, z + 4, M.LAMP);
    }
    g.box(0, 118, Z0, 3, 122, Z1, MM);
    const hang = (x0, y0, x1, y1, z) => { g.box(x0, y0, z, x1, y1, z + 1, M.HOLO); g.box(x0, y1, z, x1, y1 + 1, z + 1, MM); g.box(x0 + 1, y1 + 1, z, x0 + 2, 112, z + 1, MM); g.box(x1 - 2, y1 + 1, z, x1 - 1, 112, z + 1, MM); };
    hang(14, 93, 36, 107, -14); hang(18, 97, 34, 108, 34); hang(40, 96, 52, 104, 62); hang(38, 98, 50, 106, -34);
    for (const z of [-22, 10, 42]) g.box(64, 86, z, 65, 96, z + 12, M.SCREEN);
    g.box(12, 90, Z0, 50, 100, Z0 + 1, M.SCREEN);
    // wall pilasters + cove light
    for (let z = Z0 + 6; z < Z1 - 4; z += 20) { g.box(63, 80, z, 65, 104, z + 4, A); g.box(62, 84, z + 1, 63, 100, z + 2, M.GLOW_I); }
    g.fn(56, 103, Z0 + 10, 57, 104, Z1 - 4, (x, y, z) => ((z + 400) % 12 < 8) ? M.GLOW_I : -1);
    for (let z = Z0 + 6; z < Z1 - 10; z += 28) for (let x = 6; x < 50; x += 22) { g.carve(x, 122, z, x + 12, 124, z + 14); if (hash3(x, z, 3, 9) > 0.55) g.box(x + 3, 123, z + 4, x + 9, 124, z + 10, M.LAMP); }
    // ---- wide viewing opening (through the citadel's forward wall)
    g.carve(0, 76, Z1, 52, 104, 102); g.carve(0, 74, 96, 56, 106, 102);
    g.box(52, 74, Z1, 55, 106, Z1 + 4, A); g.box(0, 104, Z1, 55, 107, Z1 + 4, A); g.box(0, 73, Z1, 55, 76, Z1 + 4, A);
    g.box(0, 76, Z1 + 5, 52, 104, Z1 + 6, M.GLASS);
    g.box(25, 76, Z1 + 3, 28, 104, Z1 + 8, MM); g.box(50, 76, Z1 + 3, 52, 104, Z1 + 8, MM);
    meta.bridge = { z0: Z0, z1: Z1, y0: Y0, hub: [0, Y0 + 9, HZ], holo: [0, Y0 + 22, PZ], win: [0, 90, Z1 + 6] };
  };

  // =====================================================================================  HANGAR  (380 long, inside each sponson)
  SF.buildHangar = function (g, meta) {
    const A = M.INT_A, B = M.INT_B, D = M.INT_D, F = M.INT_F, MM = M.INT_M;
    const AX0 = 140, AX1 = 180, Y0 = -24, Y1 = 24, Z0 = -332, Z1 = 62;
    g.box(117, -27, -336, 203, 27, 66, D);
    g.carve(AX0, Y0, Z0, AX1, Y1, Z1);
    g.box(AX0, Y0 - 1, Z0, AX1, Y0, Z1, F);
    const bays = [];
    for (let k = 0; k < 8; k++) {
      const z0 = -324 + k * 44;
      for (const side of [0, 1]) {
        if (side === 1 && k > 5) continue;
        const x0 = side ? 180 : 120, x1 = side ? 200 : 140, bx = side ? 199 : 120;
        for (const tier of [0, 1]) {
          const fy = tier ? -2 : Y0;
          g.carve(x0, fy, z0, x1, fy + 18, z0 + 34);
          g.box(x0, fy - 1, z0, x1, fy, z0 + 34, F);
          g.box(x0 + 2, fy - 1, z0 + 4, x1 - 2, fy, z0 + 30, B);
          for (const zz of [z0 + 4, z0 + 29]) { g.box(x0 + 2, fy - 1, zz, x0 + 5, fy, zz + 1, M.AMBER_I); g.box(x1 - 5, fy - 1, zz, x1 - 2, fy, zz + 1, M.AMBER_I); }
          const lit = hash3(k, side, tier, 77) > 0.25;
          if (lit) g.box(bx, fy + 14, z0 + 5, bx + 1, fy + 15, z0 + 29, M.LAMP); else g.box(bx, fy + 14, z0 + 14, bx + 1, fy + 15, z0 + 20, M.GLOW_I);
          g.box(bx, fy + 3, z0 + 8, bx + 1, fy + 9, z0 + 26, B); g.box(side ? bx - 2 : bx + 1, fy, z0 + 15, side ? bx : bx + 3, fy + 3, z0 + 19, MM);   // docking clamp block
          bays.push({ p: [(x0 + x1) / 2, fy + 3, z0 + 17], side, tier, k, occupied: hash3(k, side * 3 + tier, 5, 31) > 0.16 });
        }
        // walkway lip of the upper tier
        g.box(side ? 178 : 140, -5, z0 - 5, side ? 180 : 142, -2, z0 + 39, B);
        // pillar face: plate, light bar, marker
        const fx = side ? 180 : 139;
        g.box(fx, Y0, z0 + 35, fx + 1, Y1, z0 + 43, A); g.box(side ? 179 : 140, -10, z0 + 39, side ? 180 : 141, 2, z0 + 40, M.GLOW_I);
        g.box(fx, 18, z0 + 37, fx + 1, 20, z0 + 41, M.AMBER_I);
      }
    }
    // floor guide lights converging to the far end
    g.fn(AX0, Y0 - 1, Z0, AX1, Y0, Z1, (x, y, z) => ((x === 148 || x === 171) && (z + 800) % 8 < 5) ? M.GUIDE : ((x === 159 || x === 160) && (z + 800) % 16 < 5 ? M.AMBER_I : -1));
    // ceiling: girders, rails, lamp panels
    for (let z = Z0 + 10; z < Z1; z += 22) g.box(AX0, 20, z, AX1, 24, z + 3, MM);
    g.box(150, 21, Z0, 152, 24, Z1, MM); g.box(168, 21, Z0, 170, 24, Z1, MM);
    for (let z = Z0 + 30; z < Z1; z += 66) g.box(155, 23, z, 165, 24, z + 12, M.LAMP);
    g.fn(143, 23, Z0, 144, 24, Z1, (x, y, z) => ((z + 800) % 22 < 9) ? M.LAMP : -1); g.fn(176, 23, Z0, 177, 24, Z1, (x, y, z) => ((z + 800) % 22 < 9) ? M.LAMP : -1);
    for (let k = 0; k < 8; k++) { const z0 = -324 + k * 44, h = hash3(k, 4, 1, 21); if (h > 0.45) { g.box(141, Y0, z0 + 36, 145, Y0 + 4, z0 + 41, B); g.box(141, Y0 + 4, z0 + 37, 144, Y0 + 7, z0 + 40, A); g.box(144, Y0 + 2, z0 + 38, 145, Y0 + 3, z0 + 39, M.AMBER_I); } if (h < 0.6 && k < 6) { g.box(175, Y0, z0 + 36, 179, Y0 + 5, z0 + 42, A); g.box(176, Y0 + 5, z0 + 37, 179, Y0 + 8, z0 + 40, B); } }
    for (const z of [-204, -116]) for (let x = 148; x < 172; x += 4) g.box(x, Y0 - 1, z, x + 2, Y0, z + 1, M.MARK);
    // gantry bridges with hanging maintenance claws
    for (const z of [-246, -158, -70]) {
      g.box(AX0, 0, z, AX1, 3, z + 10, B); g.box(AX0, 6, z, AX1, 7, z + 1, MM); g.box(AX0, 6, z + 9, AX1, 7, z + 10, MM);
      for (let x = AX0; x < AX1; x += 6) { g.box(x, 3, z, x + 1, 6, z + 1, MM); g.box(x, 3, z + 9, x + 1, 6, z + 10, MM); }
      g.box(AX0 + 6, -1, z + 4, AX1 - 6, 0, z + 6, M.GLOW_I);
      for (const x of [143, 174]) { g.box(x, -12, z + 2, x + 3, 0, z + 4, MM); g.box(x, -12, z + 6, x + 3, 0, z + 8, MM); g.box(x, -7, z + 2, x + 3, -5, z + 8, B); g.box(x + 1, -13, z + 4, x + 2, -12, z + 6, M.AMBER_I); }
    }
    // side maintenance booms
    for (const [z, side] of [[-284, 0], [-196, 1], [-108, 0], [-240, 1], [-20, 0]]) {
      const x0 = side ? 168 : 140, x1 = side ? 180 : 152, hx = side ? 166 : 151;
      g.box(x0, 8, z, x1, 10, z + 2, MM); g.box(hx, 3, z - 1, hx + 3, 8, z + 3, B); g.box(hx + 1, 1, z, hx + 2, 3, z + 2, MM); g.box(hx + 1, 0, z, hx + 2, 1, z + 2, M.AMBER_I);
    }
    // inner gates (second hatches)
    for (const z of [-202, -114]) {
      g.box(AX0, Y0, z, 147, Y1, z + 10, A); g.box(173, Y0, z, AX1, Y1, z + 10, A); g.box(AX0, 12, z, AX1, Y1, z + 10, A);
      g.box(147, 8, z, 151, 12, z + 10, A); g.box(169, 8, z, 173, 12, z + 10, A);
      g.fn(151, 11, z + 5, 169, 12, z + 6, (x) => (x % 6 < 4) ? M.GLOW_I : -1);
      g.box(147, Y0, z + 2, 148, Y0 + 3, z + 8, M.AMBER_I); g.box(172, Y0, z + 2, 173, Y0 + 3, z + 8, M.AMBER_I);
      g.box(154, 15, z - 1, 166, 19, z, M.SCREEN); g.carve(141, -10, z + 3, 146, 4, z + 7); g.box(141, -10, z + 4, 142, 4, z + 6, M.AMBER_I);
    }
    // far end: slatted bright hatch
    g.carve(146, -22, Z1, 174, 16, Z1 + 3); g.box(146, -22, Z1 + 3, 174, 16, Z1 + 4, B);
    for (let y = -19; y < 14; y += 5) g.box(149, y, Z1 + 2, 171, y + 1, Z1 + 3, M.LAMP);
    g.box(150, 18, Z1 - 1, 170, 21, Z1, M.SCREEN);
    // side mouth (outer wall) — stepped frame
    g.carve(180, -20, -58, 212, 20, 44); g.carve(205, -24, -64, 216, 24, 50);
    g.box(180, -21, -58, 205, -20, 44, F); g.fn(203, -21, -58, 205, -20, 44, (x, y, z) => ((z + 800) % 6 < 3) ? M.AMBER_I : -1);
    g.box(204, -20, -59, 205, 20, -58, M.GUIDE); g.box(204, -20, 44, 205, 20, 45, M.GUIDE); g.box(204, 20, -58, 205, 21, 44, M.GUIDE);
    // aft mouth
    g.carve(144, -20, -352, 176, 16, -330); g.carve(138, -24, -352, 182, 20, -345);
    g.box(144, -21, -345, 176, -20, -332, F);
    g.box(143, -20, -345, 144, 16, -344, M.GUIDE); g.box(176, -20, -345, 177, 16, -344, M.GUIDE); g.box(144, 16, -345, 176, 17, -344, M.GUIDE);
    for (const b of bays) meta.bays.push(b);
    meta.hangar = { ax: 160, y0: Y0, y1: Y1, z0: Z0, z1: Z1, aft: [160, -3, -350], side: [212, 0, -7] };
  };

  // =====================================================================================  POWER-CORE ATRIUM  (250 wide, 250 tall)
  const octD = (x, z) => { const ax = Math.abs(x + 0.5), az = Math.abs(z + 0.5); return Math.max(ax, az, (ax + az) * 0.70711); };
  SF.buildAtrium = function () {
    const R = 125, g = new Grid(-134, -134, -134, 134, 134, 134);
    const A = M.INT_A, B = M.INT_B, D = M.INT_D, F = M.INT_F, MM = M.INT_M;
    const meta = { R, levels: [-92, -46, 0, 46, 92] };
    // shell
    for (let z = -131; z < 131; z++) for (let y = -131; y < 131; y++) {
      const az = Math.abs(z + 0.5), xo = Math.min(131, 185.26 - az); if (xo <= 0) continue;
      g.box(-Math.floor(xo), y, z, Math.floor(xo), y + 1, z + 1, D);
      if (Math.abs(y + 0.5) < R && az < R) { const xi = Math.min(R, 176.78 - az); if (xi > 0) g.carve(-Math.floor(xi), y, z, Math.floor(xi), y + 1, z + 1); }
    }
    const ring = (r0, r1, y0, y1, f) => { const rr = Math.ceil(r1) + 1; for (let z = -rr; z < rr; z++) for (let x = -rr; x < rr; x++) { const o = octD(x, z); if (o < r0 || o >= r1) continue; for (let y = y0; y < y1; y++) { const m = f(x, y, z, o); if (m >= 0) g.set(x, y, z, m); } } };
    const ang = (x, z) => Math.atan2(z + 0.5, x + 0.5);
    // wall ribs, bands, flow conduits at the eight corners
    ring(121, 125, -125, 125, (x, y, z) => { const a = ang(x, z) * 125; const m = ((a % 26) + 26) % 26; return m < 5 ? B : -1; });
    ring(123, 125, -125, 125, (x, y, z) => { const m = ((y + 400) % 46); return (m >= 40 && m < 44) ? A : -1; });
    ring(119, 121, -125, 125, (x, y, z) => { const a = (ang(x, z) + Math.PI) / (Math.PI / 4); const f = Math.abs(a - Math.round(a - 0.5) - 0.5); return f < 0.018 ? M.FLOW_Y : (f < 0.045 ? MM : -1); });
    ring(124, 125, -125, 125, (x, y, z) => (hash3(Math.floor(ang(x, z) * 19), Math.floor(y / 5), 0, 3) > 0.93 && ((y + 400) % 5 < 2)) ? M.SCREEN : -1);
    // floor & ceiling: tiered ziggurats converging on the core claws
    for (const s of [-1, 1]) {
      const yy = (a, b) => s > 0 ? [125 - b, 125 - a] : [-125 + a, -125 + b];
      let [y0, y1] = yy(0, 10); ring(0, 74, y0, y1, (x, y, z, o) => (o > 70 ? A : D));
      [y0, y1] = yy(10, 22); ring(0, 56, y0, y1, (x, y, z, o) => (o > 52 ? B : D));
      [y0, y1] = yy(22, 36); ring(0, 40, y0, y1, (x, y, z, o) => (o > 37 ? A : D));
      [y0, y1] = yy(9, 10); ring(70, 72, y0, y1, () => M.GLOW);
      [y0, y1] = yy(21, 22); ring(52, 54, y0, y1, () => M.GLOW_P);
      // four claw prongs on the diagonals gripping the core ends
      [y0, y1] = yy(36, 70);
      ring(20, 38, y0, y1, (x, y, z) => { const u = Math.abs(x + 0.5) - Math.abs(z + 0.5); const dy = s > 0 ? (125 - y) : (y + 125); const rr = octD(x, z); return (Math.abs(u) < 8 && rr < 38 - (dy - 36) * 0.26 && rr > 20) ? ((dy % 9 === 4) ? M.GLOW : (rr > 31 - (dy - 36) * 0.26 ? A : MM)) : -1; });
      ring(60, 125, s > 0 ? 122 : -125, s > 0 ? 125 : -122, (x, y, z, o) => (hash3(Math.floor(x / 14), Math.floor(z / 14), s, 5) > 0.72 && (x & 15) > 2 && (z & 15) > 2) ? (s > 0 ? M.LAMP : B) : -1);
    }
    // core: luminous stack, glass sleeve, exo-frame ribs and collars
    const cr = y => 11 + 9 * Math.pow(Math.cos(Math.PI * y / 60), 2) * (Math.abs(y) < 30 ? 1 : 0.35);
    ring(0, 24, -66, 66, (x, y, z, o) => o < cr(y) ? M.CORE_IN : (o < cr(y) + 2 && ((y + 200) % 15) > 2 ? M.CORE_SHELL : -1));
    ring(23, 29, -68, 68, (x, y, z) => { const a = (ang(x, z) + Math.PI) / (Math.PI / 4) + 0.5; const f = Math.abs(a - Math.round(a)); return f < 0.075 ? MM : -1; });
    for (const y of [-62, -32, 32, 62]) ring(15, 31, y - 3, y + 3, (x, yy, z, o) => { const a = Math.floor((ang(x, z) + Math.PI) / (Math.PI / 8)); return (o > 29 && yy === y) ? M.GLOW : (o < 21 ? (a % 2 ? -1 : MM) : (a % 2 ? A : B)); });
    // platforms: five ring levels, alternately broken on the axes / diagonals; fork balconies reaching inward
    meta.levels.forEach((py, li) => {
      const diag = li % 2 === 0;
      const gap = (x, z) => { let a = ang(x, z) / (Math.PI / 2); if (diag) a -= 0.5; const f = Math.abs(a - Math.round(a)); return f < 0.13; };
      ring(90, 125, py, py + 4, (x, y, z, o) => gap(x, z) ? -1 : (y === py + 3 ? F : (o < 92 ? B : D)));
      ring(90, 91, py + 1, py + 2, (x, y, z) => gap(x, z) ? -1 : M.GLOW);
      ring(90, 91, py + 4, py + 9, (x, y, z) => { if (gap(x, z)) return -1; const a = Math.floor(ang(x, z) * 90 / 7); return (y === py + 8 || (a % 2 === 0 && Math.abs(ang(x, z) * 90 / 7 - a - 0.5) < 0.12)) ? MM : -1; });
      ring(94, 125, py - 5, py, (x, y, z, o) => { if (gap(x, z)) return -1; const a = (ang(x, z) + Math.PI) / (Math.PI / 8) + 0.5; const f = Math.abs(a - Math.round(a)) * o * Math.PI / 8; return (f < 2.5 && y >= py - 5 + Math.floor((125 - o) / 8)) ? B : -1; });
      // fork balcony: two tines toward the core at the middle of every arc
      const rot = diag ? 0 : Math.PI / 4;
      for (let k = 0; k < 4; k++) {
        const a = rot + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        const bxs = [76 * ca - 13 * sa, 76 * ca + 13 * sa, 93 * ca - 13 * sa, 93 * ca + 13 * sa], bzs = [76 * sa + 13 * ca, 76 * sa - 13 * ca, 93 * sa + 13 * ca, 93 * sa - 13 * ca];
        g.fn(Math.floor(Math.min(...bxs)) - 1, py, Math.floor(Math.min(...bzs)) - 1, Math.ceil(Math.max(...bxs)) + 1, py + 9, Math.ceil(Math.max(...bzs)) + 1, (x, y, z) => {
          const u = (x + 0.5) * ca + (z + 0.5) * sa, v = Math.abs(-(x + 0.5) * sa + (z + 0.5) * ca);
          if (u < 76 || u >= 92) return -1;
          if (v >= 6 && v < 12) { if (y < py + 3) return B; if (y === py + 3) return F; if (u < 77.2 && y === py + 4 && v >= 8 && v < 10) return M.AMBER_I; return -1; }
          if (v < 6 && u >= 86 && y < py + 4) return y === py + 3 ? F : B;
          return -1;
        });
      }
      // equipment on the platforms
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) * Math.PI / 4 + (diag ? 0 : 0.2), rr = 112, x = Math.round(Math.cos(a) * rr), z = Math.round(Math.sin(a) * rr);
        if (gap(x, z)) continue;
        g.box(x - 3, py + 4, z - 3, x + 3, py + 8, z + 3, B); g.box(x - 2, py + 8, z - 2, x + 2, py + 9, z + 2, M.SCREEN);
        if (k % 2) g.box(x - 1, py + 9, z - 1, x + 1, py + 15, z + 1, MM);
      }
    });
    // giant supports from the wall to the core: upper set on the axes, lower set on the diagonals
    const arm = (a, yc, hh, hw) => {
      const ca = Math.cos(a), sa = Math.sin(a), W2 = hw + 4;
      const axs = [28 * ca - W2 * sa, 28 * ca + W2 * sa, 128 * ca - W2 * sa, 128 * ca + W2 * sa], azs = [28 * sa + W2 * ca, 28 * sa - W2 * ca, 128 * sa + W2 * ca, 128 * sa - W2 * ca];
      g.fn(Math.floor(Math.min(...axs)) - 1, yc - hh - 6, Math.floor(Math.min(...azs)) - 1, Math.ceil(Math.max(...axs)) + 1, yc + hh + 7, Math.ceil(Math.max(...azs)) + 1, (x, y, z, c) => {
        const u = (x + 0.5) * ca + (z + 0.5) * sa, v = Math.abs(-(x + 0.5) * sa + (z + 0.5) * ca), dy = y + 0.5 - yc;
        if (u < 29 || u > 127 || v >= hw + 3) return -1;
        const taper = u > 96 ? (u - 96) * 0.22 : 0;
        if (u < 42) { return (v < hw - 2 && Math.abs(dy) < hh + 5 && Math.abs(dy) > 4) ? MM : (v < hw - 2 && Math.abs(dy) <= 4 && u > 37 ? B : -1); }   // fork clamp at the core
        if (Math.abs(dy) >= hh + taper || v >= hw + taper * 0.5) return -1;
        if (c && c !== 0 && u > 122) return -1;
        const win = ((u - 42) % 18) > 5 && ((u - 42) % 18) < 14 && Math.abs(dy) < hh - 4 && u < 110;
        if (win && v < hw - 2) return 0;
        if (Math.abs(dy) >= hh + taper - 1 && v < 1.2) return M.FLOW_R;
        if (v >= hw + taper * 0.5 - 1) return A;
        return B;
      });
    };
    for (let k = 0; k < 4; k++) { arm(k * Math.PI / 2, 68, 9, 7); arm(k * Math.PI / 2 + Math.PI / 4, -68, 9, 7); }
    meta.arms = { upper: 68, lower: -68 };
    return { g, meta };
  };

  // rotating ring bands around the core (separate rigid voxel models)
  SF.buildRing = function (r0, r1, hh, segs, gapFrac, teeth) {
    const R = Math.ceil(r1) + 6, g = new Grid(-R, -hh - 2, -R, R, hh + 2, R);
    for (let z = -R; z < R; z++) for (let x = -R; x < R; x++) {
      const dx = x + 0.5, dz = z + 0.5, r = Math.hypot(dx, dz), a = (Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI) * segs, f = a - Math.floor(a);
      if (f < gapFrac) continue;
      const end = f < gapFrac + 0.07 || f > 0.93;
      if (r >= r0 && r < r1) for (let y = -hh; y < hh; y++) g.set(x, y, z, (y === -hh || y === hh - 1) ? M.INT_B : (r < r0 + 1 ? (Math.abs(y) < 1 ? M.GLOW_P : M.INT_M) : (end ? M.INT_M : M.INT_A)));
      if (teeth && end && r >= r0 - 4 && r < r0) for (let y = -1; y < 1; y++) g.set(x, y, z, M.INT_M);
      if (teeth && end && r >= r1 && r < r1 + 4) for (let y = -hh + 1; y < hh - 1; y++) g.set(x, y, z, M.INT_B);
    }
    return { g, meta: {} };
  };

  // =====================================================================================  ENERGY LOADING / CONDUIT GALLERY (400 x 120 x 80)
  SF.buildCorridor = function () {
    const g = new Grid(-64, -4, -4, 64, 84, 404); g.xmin = 0;
    const A = M.INT_A, B = M.INT_B, D = M.INT_D, F = M.INT_F, MM = M.INT_M, TI = M.T_INT;
    const meta = { frames: [], guides: [], clamps: [110, 220, 300], slotX: 15, len: 330 };
    g.box(0, -4, -4, 64, 84, 404, D);
    g.carve(0, 4, 2, 50, 74, 330); g.carve(0, 0, 330, 60, 80, 396);
    g.box(0, 3, 2, 50, 4, 330, F); g.box(0, -1, 330, 60, 0, 396, F);
    // floor slot tracks carrying the energy blocks
    g.carve(12, 0, 2, 19, 4, 336); g.box(12, 0, 2, 13, 1, 336, MM); g.box(18, 0, 2, 19, 1, 336, MM);
    g.fn(11, 3, 2, 12, 4, 330, (x, y, z) => (z % 10 < 6) ? M.FLOW_Z : -1); g.fn(19, 3, 2, 20, 4, 330, (x, y, z) => (z % 10 < 6) ? M.FLOW_Z : -1);
    g.fn(0, 3, 2, 2, 4, 330, (x, y, z) => (z % 20 < 3) ? M.AMBER_I : -1);
    // frames (portal bays)
    for (let z = 22; z < 320; z += 55) {
      meta.frames.push(z);
      g.box(42, 4, z, 50, 74, z + 10, TI); g.box(36, 58, z, 42, 74, z + 10, TI); g.box(30, 66, z, 36, 74, z + 10, TI); g.box(0, 69, z, 30, 74, z + 10, TI);
      g.box(24, 4, z + 1, 50, 6, z + 9, B);
      g.box(41, 10, z + 4, 42, 56, z + 6, M.GLOW); g.box(4, 68, z + 4, 28, 69, z + 6, M.GLOW_P);
      g.box(44, 4, z - 3, 50, 30, z, TI); g.box(44, 4, z + 10, 50, 30, z + 13, TI);
      // loading devices: two per bay per side
      for (const zd of [z + 17, z + 35]) {
        if (zd + 13 > 330) continue;
        g.box(26, 4, zd - 1, 44, 7, zd + 13, B);
        g.box(28, 7, zd, 44, 52, zd + 12, TI);
        for (let y = 14; y < 48; y += 8) g.trench(28, y, zd, 31, y + 2, zd + 12, D);
        g.trench(28, 10, zd + 4, 33, 48, zd + 8, D);
        g.box(33, 10, zd + 4, 34, 48, zd + 8, M.GLOW_P);
        g.box(34, 52, zd + 3, 40, 70, zd + 9, MM); g.box(33, 52, zd + 5, 34, 70, zd + 7, M.FLOW_Y); g.box(34, 70, zd + 3, 50, 74, zd + 9, MM);
        g.box(24, 4, zd + 4, 26, 6, zd + 8, MM); g.box(20, 3, zd + 5, 26, 4, zd + 7, M.FLOW_Z);
      }
      // suspended conduit guide (fork pair) at mid-bay
      const zg = z + 26;
      if (zg + 12 < 330) {
        meta.guides.push(zg + 5);
        g.box(0, 60, zg + 3, 3, 74, zg + 7, MM); g.box(0, 56, zg, 15, 60, zg + 10, B);
        g.box(9, 28, zg + 1, 14, 56, zg + 9, TI); g.box(8, 31, zg + 3, 9, 53, zg + 7, M.GLOW);
        g.box(11, 22, zg + 3, 14, 28, zg + 7, MM);
      }
    }
    // ceiling conduits + wall bands
    g.box(18, 71, 2, 23, 74, 330, MM); g.fn(19, 70, 2, 22, 71, 330, (x, y, z) => (x === 20) ? M.FLOW_Z : MM);
    g.box(49, 36, 2, 50, 38, 330, M.FLOW_Z);
    g.fn(49, 44, 2, 50, 52, 330, (x, y, z) => (hash3(0, Math.floor(y / 4), Math.floor(z / 9), 4) > 0.8 && z % 9 > 1) ? M.SCREEN : -1);
    // clamp rails on the ceiling
    for (const z of meta.clamps) g.box(0, 72, z - 2, 30, 74, z + 2, MM);
    // end chamber: fork-ring breech aperture with a bright core
    const oc = (x, y, r) => { const dx = x + 0.5, dy = Math.abs(y + 0.5 - 40); return Math.max(dx, dy, (dx + dy) * 0.7071) < r; };
    g.fn(0, 0, 384, 60, 80, 396, (x, y, z) => {
      if (oc(x, y, 26)) return z >= 392 ? M.CORE_IN : 0;
      if (oc(x, y, 37) && x >= 4) return z < 388 ? (oc(x, y, 30) ? MM : TI) : D;
      if (oc(x, y, 37)) return z < 388 ? 0 : D;
      return -1;
    });
    g.fn(0, 12, 376, 30, 68, 380, (x, y) => (oc(x, y, 20) && !oc(x, y, 17) && x >= 3) ? MM : -1);
    g.fn(0, 12, 379, 30, 68, 380, (x, y) => (oc(x, y, 17.9) && !oc(x, y, 17) && x >= 3) ? M.GLOW : -1);
    for (let k = 0; k < 3; k++) { g.box(44, 0, 340 + k * 16, 60, 4 + k * 3, 396, B); g.box(54, 0, 338 + k * 18, 60, 80, 342 + k * 18, TI); g.box(53, 8, 339 + k * 18, 54, 72, 341 + k * 18, M.FLOW_Y); }
    g.box(0, 0, 372, 44, 3, 396, B); g.box(0, 3, 380, 40, 6, 396, B);
    g.box(50, 4, 326, 60, 80, 332, TI); g.box(0, 74, 326, 60, 80, 332, TI);
    g.plate(0, -4, -4, 64, 84, 404, { seed: 7 });
    g.untag(B);
    g.mirrorX(); g.xmin = g.x0;
    return { g, meta };
  };

  // closing/opening jaw of the corridor's abstract machines (one half; drawn twice)
  SF.buildClamp = function () {
    const g = new Grid(-2, -20, -7, 16, 6, 7);
    g.box(0, -18, -5, 12, 0, 5, M.INT_B); g.carve(0, -13, -5, 7, -5, 5);
    g.box(7, -13, -3, 8, -5, 3, M.GLOW_P); g.box(0, -18, -5, 12, -17, 5, M.INT_A); g.box(0, -1, -5, 12, 0, 5, M.INT_A);
    g.box(11, -18, -6, 13, 0, 6, M.INT_M); g.box(4, 0, -2, 10, 5, 2, M.INT_M); g.box(0, -4, -1, 1, -3, 1, M.AMBER_I); g.box(0, -15, -1, 1, -14, 1, M.AMBER_I);
    return { g, meta: {} };
  };
})();
