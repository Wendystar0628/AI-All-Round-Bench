// flagship.js — the 1120-voxel flagship: twin-fork bow around a spinal beam cannon, forked hangar sponsons,
// stepped shells over a dark chassis, tiered stern with nozzle wells
(function () {
  'use strict';
  const SF = window.SF, M = SF.M, Grid = SF.Grid, sat = SF.sat, mix = SF.mix;
  const { nozzle, mirrorMeta, q } = SF.shipUtil;

  SF.buildFlagship = function () {
    const g = new Grid(-216, -92, -562, 216, 150, 562); g.xmin = 0;
    const TB = M.T_BIG, TM = M.T_MED, TS = M.T_SMALL, TF = M.T_FINE;
    const meta = { nozzles: [], turrets: [], bays: [], muzzle: [0, 0, 528] };
    const rnd = SF.rng(4401);
    const bare = (x0, y0, z0, x1, y1, z1, m) => g.paint(x0, y0, z0, x1, y1, z1, m || M.DARK_A, -1);

    // ---------- A. main hull
    const hull = z => {
      const zq = Math.floor(z / 26) * 26; let hw, yt, yb;
      if (zq < -330) { const s = sat((zq + 450) / 120); hw = mix(100, 88, s); yt = mix(50, 44, s); yb = mix(-58, -52, s); }
      else if (zq <= 60) { hw = 88; yt = 44; yb = -52; }
      else { const s = sat((zq - 60) / 130); hw = mix(88, 62, s); yt = mix(44, 36, s); yb = mix(-52, -38, s); }
      return { hw: q(hw, 4), yt: q(yt, 2), yb: q(yb, 2), ct: 12, cb: 24, q: 4 };
    };
    g.loft(-450, 190, hull, TB);
    const SEG = [[-322, -202], [-188, -62], [-48, 58]];
    for (const [z0, z1] of SEG) {
      g.box(88, 12, z0, 94, 32, z1, TB); g.box(88, -34, z0 + 6, 94, -12, z1 - 6, TB);   // armour belts
      g.box(46, 44, z0 + 4, 76, 47, z1 - 4, TM);                                       // deck slabs
    }
    g.trench(81, -11, -330, 89, 11, 66, M.DARK_B);                                     // flank service trench
    for (const z of [-334, -196, -56, 62, 126]) { g.trench(34, 40, z, 80, 45, z + 5, M.DARK_B); g.trench(84, -44, z, 95, 40, z + 4, M.DARK_B); }
    // standoff armour panels beside the aft hull (see-through gap behind)
    g.box(106, -30, -438, 111, 36, -352, TB); g.box(98, -6, -430, 106, 6, -422, M.METAL); g.box(98, -6, -372, 106, 6, -364, M.METAL); g.box(98, 20, -402, 106, 26, -396, M.METAL);

    // ---------- B. stern: receding tiers + nozzle wells
    g.loft(-482, -450, () => ({ hw: 104, yt: 52, yb: -60, ct: 12, cb: 20, q: 4 }), TM);
    g.loft(-514, -482, () => ({ hw: 94, yt: 46, yb: -54, ct: 12, cb: 16, q: 4 }), TM);
    bare(0, -60, -514, 104, 52, -482);
    g.box(13, -47, -560, 81, 39, -482, TM);
    g.box(11, -49, -552, 83, 41, -544, TS); g.box(11, -49, -526, 83, 41, -520, TS); g.box(11, -49, -500, 83, 41, -494, TS);
    nozzle(g, 47, -4, 28, 37, -560, 52, meta, 2);
    g.box(0, -42, -548, 9, 34, -482, TM); nozzle(g, 0, -4, 4, 32, -548, 30, meta, 1.2);
    g.box(0, 44, -472, 60, 78, -330, TM); g.box(0, 78, -462, 44, 86, -360, TM);
    g.box(0, 44, -330, 50, 68, -308, TM); g.box(0, 44, -308, 40, 58, -290, TM);
    g.box(9, 50, -540, 55, 84, -472, TM); g.box(7, 48, -532, 57, 86, -526, TS); g.box(7, 48, -508, 57, 86, -502, TS);
    nozzle(g, 32, 67, 17, 12, -540, 36, meta, 1.3);
    g.box(40, 86, -456, 46, 104, -372, TM); g.box(40, 104, -452, 45, 118, -400, TS); g.box(40, 118, -448, 44, 128, -424, TS);   // tail fins
    g.box(40, 128, -446, 44, 140, -434, TS); g.box(40, 112, -400, 44, 118, -374, TS); g.box(40, -104, -470, 45, -88, -424, TS); g.box(40, -114, -462, 44, -104, -440, TS);
    g.box(18, -88, -548, 66, -56, -420, TM); g.box(22, -80, -420, 62, -56, -396, TM); g.box(16, -90, -538, 68, -54, -532, TS); g.box(16, -90, -512, 68, -54, -506, TS);
    nozzle(g, 42, -72, 19, 10, -548, 38, meta, 1.3);
    g.box(84, -18, -544, 108, 16, -456, TS); nozzle(g, 96, -1, 8, 12, -544, 24, meta, 0.8);

    // ---------- C. neck (waist) + twin fork prongs
    g.loft(190, 232, () => ({ hw: 62, yt: 36, yb: -38, ct: 10, cb: 14, q: 2 }), TM);
    bare(48, -30, 194, 64, 28, 230);
    const PR = [[232, 286, 104, -40, 38], [286, 334, 96, -34, 32], [334, 380, 88, -28, 27], [380, 424, 78, -23, 22], [424, 466, 68, -18, 17], [466, 504, 59, -14, 13], [504, 536, 51, -10, 9], [536, 560, 44, -6, 6]];
    g.loft(232, 264, () => ({ hw: 104, yt: 38, yb: -40, ct: 10, cb: 12, q: 2 }), TM);        // shoulder yoke across the centre
    for (let k = 0; k < PR.length; k++) {
      const [z0, z1, xo, yb, yt] = PR[k], cx = (26 + xo) / 2, hw = (xo - 26) / 2, c = Math.max(2, Math.min(8, hw - 5));
      g.loft(Math.max(z0, 262), z1, () => ({ cx, hw, yt, yb, ct: c, cb: c, q: 2 }), TM);
      if (k < 7) {
        g.box(34, yt, z0 + 5, xo - 8, yt + 3, z1 - 9, TM);
        g.box(36, yb - 3, z0 + 9, xo - 10, yb, z1 - 12, TM);
        g.box(xo, yb + 8, z0 + 7, xo + 3, yt - 8, z1 - 9, TM);
      }
    }
    g.box(0, 36, 184, 40, 44, 262, TM); g.box(0, 44, 198, 26, 50, 252, TM);                 // cannon root hump / brow
    g.box(0, -46, 196, 30, -38, 258, TM);
    for (const [z0, z1, xo, yb, yt] of PR.slice(0, 6)) { const cx = Math.round((34 + xo - 8) / 2); g.trench(cx - 3, yt, z0 + 9, cx + 3, yt + 4, z1 - 13, M.DARK_B); }
    g.trench(26, -3, 268, 29, 3, 552, M.DARK_B);                                              // inner energy groove
    g.trench(64, -5, 240, 108, 5, 460, M.DARK_B);                                             // outer trench

    // ---------- D. spinal beam cannon: breech
    g.box(0, -26, 262, 24, 26, 286, TM); g.box(0, -22, 286, 21, 22, 304, TM); g.box(0, -18, 304, 18, 18, 318, TS);

    // ---------- E. dorsal: foredeck spine, citadel, after spine
    g.box(0, 44, 96, 26, 50, 190, TM);
    g.box(0, 44, -300, 34, 56, 100, TM); g.box(0, 56, -284, 22, 62, -84, TM);
    g.trench(36, 40, -296, 45, 45, -92, M.DARK_B);
    for (let z = -276; z < -100; z += 44) g.trench(0, 58, z, 23, 63, z + 6, M.DARK_B);
    g.loft(-88, 126, () => ({ hw: 84, yt: 62, yb: 44, ct: 6, cb: 0, q: 2 }), TM);
    g.loft(-66, 100, () => ({ hw: 74, yt: 108, yb: 62, ct: 4, cb: 0, q: 2 }), TB);
    g.loft(-58, 90, () => ({ hw: 62, yt: 126, yb: 108, ct: 4, cb: 0, q: 2 }), TM);
    g.box(0, 126, -44, 44, 134, 70, TM); g.box(0, 134, -30, 20, 140, 40, TS);
    g.box(22, 134, -42, 28, 147, 26, TS); g.box(22, 134, 26, 26, 141, 60, TS);              // twin dorsal fins (forked forward)
    g.box(74, 88, -44, 92, 94, 66, TM); g.box(92, 90, -14, 102, 93, 82, TS);                 // swept sensor blades
    g.box(0, 62, 100, 58, 72, 116, TM); g.box(0, 62, 116, 36, 68, 126, TS);                  // brow steps under the window
    g.box(0, 62, -84, 60, 94, -66, TM); g.box(0, 62, -100, 44, 78, -84, TM);
    g.box(74, 66, -52, 78, 84, 88, TM);
    g.trench(60, 113, -56, 63, 118, 88, M.DARK_B); g.trench(76, 70, -50, 79, 76, 86, M.DARK_B);

    // ---------- F. forked hangar sponsons + pylons
    g.loft(-340, 70, () => ({ cx: 160, hw: 48, yt: 32, yb: -32, ct: 8, cb: 8, q: 2 }), TB);
    g.loft(70, 110, () => ({ cx: 160, hw: 44, yt: 26, yb: -26, ct: 6, cb: 6, q: 2 }), TM);
    for (const cx of [134, 184]) {
      g.loft(110, 150, () => ({ cx, hw: 12, yt: 18, yb: -18, ct: 4, cb: 4, q: 2 }), TM);
      g.loft(150, 190, () => ({ cx, hw: 9, yt: 12, yb: -12, ct: 3, cb: 3, q: 1 }), TS);
      g.loft(190, 216, () => ({ cx, hw: 6, yt: 7, yb: -7, ct: 2, cb: 2, q: 1 }), TS);
    }
    g.box(132, 32, -312, 188, 40, 42, TM); g.box(140, 40, -290, 180, 44, -160, TS); g.box(140, 40, -120, 180, 44, 14, TS);
    g.box(132, -40, -312, 188, -32, 42, TM); g.box(144, -46, -280, 176, -40, -40, TS);
    g.box(188, 32, -326, 206, 42, -62, TM); g.box(192, 42, -312, 204, 48, -130, TS); g.box(190, 32, -62, 204, 38, -24, TS); g.box(188, -42, -326, 206, -32, -84, TM);
    for (const z of [-300, -212, -124, -36, 44]) { g.box(86, -10, z, 114, 12, z + 18, TS); g.box(90, -15, z + 4, 112, -10, z + 14, M.METAL); }
    g.box(208, -22, -306, 213, 24, -212, TB); g.box(208, -26, -196, 214, 28, -92, TB); g.box(118, -30, -350, 202, 30, -340, TM);
    g.trench(206, -6, -310, 209, 6, -96, M.DARK_B);

    // ---------- G. ventral: keel blade, chin prong, side keels, ribbed belly
    g.box(0, -70, -300, 9, -50, 150, TM); g.box(0, -88, -262, 7, -70, 112, TM);
    g.box(0, -78, 150, 8, -56, 204, TM); g.box(0, -74, 204, 7, -58, 240, TM); g.box(0, -68, 240, 5, -60, 268, TS);
    g.box(34, -68, -366, 46, -50, 124, TM); g.box(35, -62, 124, 44, -50, 160, TS);
    bare(0, -56, -440, 66, -51, 186, M.DARK_A);
    g.trench(9, -52, -356, 34, -45, 116, M.DARK_B);
    for (let z = -346; z < 110; z += 30) { g.box(9, -62, z, 34, -48, z + 5, M.METAL); g.box(46, -60, z + 8, 70, -54, z + 12, TS); }

    // ---------- H. pulse turret pedestals
    const ped = (x, y, z, up) => {
      if (up > 0) { g.box(x - 9, y, z - 9, x + 9, y + 3, z + 9, TF); g.box(x - 7, y + 3, z - 7, x + 7, y + 5, z + 7, M.METAL); g.box(x - 5, y + 5, z - 5, x + 5, y + 6, z + 5, M.DARK_B); meta.turrets.push({ p: [x, y + 6, z], up: 1 }); }
      else { g.box(x - 9, y - 3, z - 9, x + 9, y, z + 9, TF); g.box(x - 7, y - 5, z - 7, x + 7, y - 3, z + 7, M.METAL); g.box(x - 5, y - 6, z - 5, x + 5, y - 5, z + 5, M.DARK_B); meta.turrets.push({ p: [x, y - 6, z], up: -1 }); }
    };
    for (const z of [-262, -125, 12]) ped(61, 47, z, 1);
    ped(60, 44, -390, 1); ped(40, 36, 160, 1);
    ped(64, 41, 258, 1); ped(60, 30, 356, 1); ped(52, 20, 444, 1);
    for (const z of [-250, -100, 30]) ped(160, 44, z, 1);
    for (const z of [-170, -30]) ped(160, -46, z, -1);
    ped(60, -62, 60, -1); ped(60, -62, -300, -1); ped(62, -43, 310, -1);

    // ---------- plating
    g.plate(0, -92, -562, 216, 150, 562, { seed: 1 });
    g.untag(M.DARK_A);
    // two-tone hull: ivory topsides, slate-blue undersides
    const two = (x0, y0, z0, x1, y1, z1) => { g.paint(x0, y0, z0, x1, y1, z1, M.HULL_D, M.HULL_B); g.paint(x0, y0, z0, x1, y1, z1, M.HULL_C, M.HULL_A); };
    two(0, -92, -450, 104, -34, 190); two(108, -50, -352, 216, -22, 218); two(0, -92, -562, 112, -44, -450); two(0, -50, 190, 112, -14, 562);

    // ---------- details (final materials)
    const oct = (x, y, r, c) => Math.abs(x) < r && Math.abs(y) < r && Math.abs(x) + Math.abs(y) < 2 * r - c;
    // barrel
    g.fn(0, -16, 318, 16, 16, 500, (x, y) => oct(x + 0.5, y + 0.5, 14, 6) ? M.METAL : -1);
    for (let z = 330; z < 492; z += 34) {
      g.fn(0, -20, z, 20, 20, z + 9, (x, y) => oct(x + 0.5, y + 0.5, 19, 7) ? ((Math.abs(y + 0.5) < 3 || x < 3) ? M.DARK_A : M.HULL_A) : -1);
      g.box(14, -5, z + 10, 27, 5, z + 16, M.DARK_A); g.box(18, -7, z + 11, 23, 7, z + 15, M.METAL);
      g.box(18, -2, z + 1, 19, 2, z + 8, M.CANNON); g.box(0, 18, z + 1, 2, 19, z + 8, M.CANNON); g.box(0, -19, z + 1, 2, -18, z + 8, M.CANNON);
    }
    g.box(13, -3, 320, 14, 3, 498, M.CANNON); g.box(0, 13, 320, 3, 14, 498, M.CANNON); g.box(0, -14, 320, 3, -13, 498, M.CANNON);
    g.box(0, 16, 320, 2, 18, 494, M.TRIM); g.box(0, -18, 320, 2, -16, 494, M.TRIM);
    // muzzle
    g.fn(0, -24, 494, 24, 24, 528, (x, y, z) => oct(x + 0.5, y + 0.5, z < 504 ? 19 : 23, 8) ? ((z % 6 === 3) ? M.DARK_A : M.HULL_A) : -1);
    g.fn(0, -15, 492, 15, 15, 528, (x, y) => oct(x + 0.5, y + 0.5, 14, 5) ? 0 : -1);
    g.fn(0, -16, 486, 16, 16, 493, (x, y) => oct(x + 0.5, y + 0.5, 15, 5) ? M.DARK_B : -1);
    g.fn(0, -11, 491, 11, 11, 493, (x, y) => oct(x + 0.5, y + 0.5, 10, 4) ? M.CANNON : -1);
    for (let k = 0; k < 5; k++) g.fn(0, -15, 498 + k * 6, 15, 15, 499 + k * 6, (x, y) => (oct(x + 0.5, y + 0.5, 14, 5) && !oct(x + 0.5, y + 0.5, 12, 4)) ? M.CANNON : -1);
    g.box(23, -2, 506, 24, 2, 526, M.CANNON); g.box(0, 23, 506, 2, 24, 526, M.CANNON); g.box(0, -24, 506, 2, -23, 526, M.CANNON);
    // breech glow, prong groove lights
    g.box(21, -2, 288, 22, 2, 302, M.CANNON); g.box(24, -3, 264, 25, 3, 284, M.CANNON); g.box(18, -2, 306, 19, 2, 316, M.CANNON);
    for (let z = 270; z < 550; z += 12) g.box(28, -1, z, 29, 1, z + 8, M.CANNON);
    for (const [z0, z1, xo, yb, yt] of PR.slice(0, 6)) { const cx = Math.round((34 + xo - 8) / 2); for (let z = z0 + 12; z < z1 - 18; z += 10) g.paint(cx - 1, yt - 1, z, cx + 1, yt, z + 6, M.GLOW); }
    g.box(38, 40, -294, 40, 42, -94, M.METAL); for (let z = -290; z < -96; z += 14) g.box(42, 40, z, 44, 41, z + 8, M.GLOW);
    g.greeble(36, 40, -296, 45, 44, -92, rnd, 60, [M.METAL, M.DARK_A], 2, [3, 2, 6]);
    // neck: exposed ribs
    for (let z = 196; z < 230; z += 6) g.box(56, -28, z, 63, 26, z + 2, M.METAL);
    g.box(60, -2, 194, 62, 2, 230, M.GLOW);
    // flank trench contents
    g.box(82, -9, -328, 84, -7, 64, M.METAL); g.box(82, 7, -328, 83, 9, 64, M.METAL); g.box(84, -4, -328, 85, -3, 64, M.DARK_A);
    for (let z = -326; z < 62; z += 10) g.box(81, 0, z, 82, 2, z + 6, M.GLOW);
    g.greeble(81, -10, -328, 86, 10, 64, rnd, 260, [M.METAL, M.DARK_A, M.DARK_A], 0, [3, 2, 7]);
    for (let z = -320; z < 60; z += 44) g.box(81, -11, z, 88, 11, z + 3, M.DARK_A);
    // prong outer trench contents
    g.greeble(64, -5, 240, 108, 5, 460, rnd, 220, [M.METAL, M.DARK_A], 2, [4, 2, 8]);
    for (const [z0, z1, xo] of PR.slice(0, 5)) for (let z = z0 + 8; z < z1 - 8; z += 12) g.paint(xo - 5, -1, z, xo - 2, 1, z + 7, M.GLOW);
    // belly trench: pipes + lights
    g.box(14, -49, -352, 16, -47, 112, M.METAL); g.box(24, -48, -352, 27, -46, 112, M.METAL);
    for (let z = -340; z < 110; z += 30) g.box(18, -46, z + 10, 22, -45, z + 22, M.GLOW);
    g.greeble(9, -52, -352, 34, -45, 112, rnd, 200, [M.METAL, M.DARK_A], 3, [4, 2, 6]);
    // keel lights
    for (let z = -250; z < 100; z += 24) g.paint(6, -80, z, 8, -78, z + 12, M.GLOW);
    g.paint(7, -68, 150, 9, -66, 236, M.GLOW);
    // deck / spine lights and greebles
    for (let z = -276; z < -100; z += 44) g.box(0, 57, z + 2, 21, 58, z + 4, M.GLOW);
    for (const z of [-334, -196, -56, 62, 126]) g.box(40, 40, z + 2, 78, 41, z + 3, M.GLOW_P);
    g.greeble(0, 62, -280, 22, 66, -86, rnd, 90, [M.METAL, M.DARK_A, M.HULL_B], 2, [3, 3, 7]);
    g.greeble(36, 47, -318, 78, 50, 54, rnd, 170, [M.METAL, M.DARK_A, M.HULL_B], 2, [3, 2, 6]);
    g.greeble(132, 44, -310, 188, 47, 40, rnd, 90, [M.METAL, M.DARK_A, M.HULL_B], 2, [3, 2, 6]);
    g.greeble(0, 86, -460, 44, 89, -362, rnd, 50, [M.METAL, M.DARK_A], 2, [3, 2, 6]);
    g.greeble(0, 50, 98, 26, 53, 188, rnd, 30, [M.METAL, M.DARK_A], 2, [3, 2, 6]);
    // stern machinery tier: ribs + lights
    for (let x = 14; x < 100; x += 12) g.box(x, -50, -514, x + 3, 44, -482, M.METAL);
    g.box(84, -44, -500, 96, 40, -496, M.GLOW);
    // lit ports
    const ports = (x0, y0, z0, x1, y1, z1, sy, sz) => g.fn(x0, y0, z0, x1, y1, z1, (x, y, z, c) => (c === M.HULL_A || c === M.HULL_B || c === M.HULL_C) && (((y % sy) + sy) % sy === 0) && (((z % sz) + sz) % sz < sz - 2) && SF.hash3(x0, y, Math.floor(z / sz), 5) > 0.5 ? M.WINDOW : -1);
    ports(74, 66, -60, 76, 106, 96, 6, 5); ports(62, 110, -54, 64, 124, 86, 5, 5);
    ports(92, 14, -318, 96, 30, 54, 7, 6); ports(207, 12, -330, 209, 26, 60, 7, 6); ports(59, 50, -466, 61, 76, -336, 6, 5);
    ports(102, -20, 236, 107, 20, 330, 7, 6);
    for (const z of [-300, -212, -124, -36, 44]) g.box(98, 12, z + 8, 100, 13, z + 10, M.AMBER);
    for (let z = -300; z < 40; z += 50) g.box(159, 44, z, 161, 45, z + 2, M.AMBER);
    for (const [z0, z1, xo, yb, yt] of PR) g.box(xo - 4, yt + 3, z1 - 12, xo - 2, yt + 4, z1 - 10, M.AMBER);
    g.box(24, 147, -10, 26, 148, -8, M.AMBER); g.box(43, 128, -446, 44, 129, -444, M.AMBER); g.box(0, 140, 36, 2, 141, 38, M.GLOW);
    for (const cx of [134, 184]) g.box(cx - 1, -1, 150, cx + 1, 1, 214, M.GLOW);
    g.box(12, 40, -548, 82, 41, -546, M.GLOW); g.box(82, -40, -548, 83, 34, -546, M.GLOW);
    // painted fleet markings (rust-red blocks) on prong shoulders and sponson flanks
    g.paint(100, 22, 240, 108, 30, 252, M.MARK); g.paint(204, 18, -30, 210, 26, -18, M.MARK); g.paint(204, 18, -12, 210, 26, -6, M.MARK);

    // ---------- interiors carved into the hull
    if (SF.buildBridge) SF.buildBridge(g, meta);
    if (SF.buildHangar) SF.buildHangar(g, meta);

    g.mirrorX(); g.xmin = g.x0;
    meta.nozzles = mirrorMeta(meta.nozzles, 'p');
    meta.turrets = mirrorMeta(meta.turrets, 'p');
    meta.bays = mirrorMeta(meta.bays, 'p');
    return { g, meta };
  };
})();
