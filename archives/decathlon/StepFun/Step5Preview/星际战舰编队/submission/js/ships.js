// ships.js — flagship, guardian, vanguard, boat voxel models + fleet
(function () {
  'use strict';
  const C = window.C, VB = window.VB;
  const P = C.PAL;

  function pwl(pts) {
    return function (x) {
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
          const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
          return C.lerp(pts[i - 1][1], pts[i][1], t);
        }
      }
      return pts[pts.length - 1][1];
    };
  }

  // ============================== FLAGSHIP ==============================
  const FH = {
    hw: pwl([[-520, 30], [-470, 44], [-400, 60], [-300, 66], [-200, 68], [-160, 64], [-120, 58],
    [-40, 56], [60, 55], [160, 52], [260, 46], [340, 36], [420, 22], [480, 10], [508, 5]]),
    yt: pwl([[-520, 2], [-470, 6], [-400, 16], [-320, 26], [-240, 30], [-180, 29], [-140, 22],
    [-60, 21], [60, 22], [160, 22], [260, 20], [340, 15], [420, 10], [480, 5], [510, 3]]),
    yb: pwl([[-520, -8], [-470, -16], [-400, -24], [-320, -28], [-240, -29], [-180, -27], [-140, -21],
    [-60, -20], [60, -20], [160, -20], [260, -19], [340, -17], [420, -13], [480, -8], [510, -5]])
  };
  function insideHull(x, y, z) {
    return Math.abs(z) < FH.hw(x) - 2.5 && y > FH.yb(x) + 2.5 && y < FH.yt(x) - 2.5;
  }
  window.FH = FH;
  window.insideHull = insideHull;

  function buildFlagship() {
    const b = new VB.VoxelBuilder();
    const HALF = 520, THK = 2;
    const tone = (x) => {
      const band = Math.floor((x + 520) / 62) % 3;
      if (band === 0) return P.hullA;
      if (band === 1) return P.hullA2;
      return [C.lerp(P.hullA[0], P.hullB[0], 0.45), C.lerp(P.hullA[1], P.hullB[1], 0.45), C.lerp(P.hullA[2], P.hullB[2], 0.45)];
    };

    // ---- main hull skin
    for (let x = -HALF; x <= HALF; x++) {
      const W = FH.hw(x), T = FH.yt(x), B = FH.yb(x);
      const wi = Math.floor(W), ti = Math.ceil(T), bi = Math.floor(B);
      for (let z = -wi - 1; z <= wi + 1; z++) {
        const az = Math.abs(z);
        if (az > wi + 1) continue;
        for (let y = bi; y <= ti; y++) {
          const side = az >= wi - THK, bot = y <= B + THK, top = y >= T - THK;
          if (side || bot || top) b.set(x, y, z, tone(x), false, 0.07, true);
        }
      }
    }

    // ---- bow fork: central slot -> two prongs
    b.carve(388, -10, -7, 516, 11, 7);
    for (let x = 462; x <= 516; x++) {
      const t = (x - 462) / 54;
      const w = Math.max(1, Math.round(C.lerp(10, 3, t)));
      for (const s of [-1, 1]) {
        for (let z = s * (w + 1); s > 0 ? z >= w : z <= -w; z += s > 0 ? -1 : 1) {
          b.set(x, -3, z, P.hullA, false, 0.07);
          b.set(x, 1, z, P.hullA2, false, 0.07);
        }
      }
    }

    // ---- dorsal spine: stepped layered blocks
    const spine = pwl([[-430, 3], [-300, 7], [-120, 13], [80, 18], [260, 16], [380, 9], [440, 4]]);
    for (let x = -430; x <= 440; x++) {
      const h = spine(x);
      const w = Math.round(C.lerp(26, 15, C.clamp((x + 430) / 870, 0, 1)));
      const seg = Math.floor((x + 430) / 46) % 2;
      const c = seg ? P.hullA : P.hullA2;
      for (let z = -w; z <= w; z++) for (let y = 0; y <= Math.ceil(h); y++) {
        const edge = Math.abs(z) > w - 2, top = y >= h - 1;
        if (edge || top) b.set(x, y, z, top ? (Math.abs(z) < 3 ? P.hullD : c) : P.hullB, false, 0.06);
      }
    }
    for (let x = -420; x <= 430; x += 2) b.set(x, Math.ceil(spine(x)) + 1, 0, P.glow, true);

    // ---- side sponsons: layered plates (motif)
    for (const s of [-1, 1]) {
      const defs = [
        { x0: -380, x1: -80, w: 18, y: -10, h: 14 },
        { x0: -160, x1: 220, w: 26, y: 0, h: 18 },
        { x0: 80, x1: 320, w: 16, y: 6, h: 12 }
      ];
      for (const d of defs) {
        for (let x = d.x0; x <= d.x1; x++) {
          const taper = Math.min(1, Math.min(x - d.x0, d.x1 - x) / 40);
          const w = Math.round(d.w * C.smooth(taper));
          if (w <= 1) continue;
          const baseZ = Math.round(FH.hw(x));
          for (let i = 0; i < w; i++) {
            const z = s * (baseZ + 2 + i);
            const shellEdge = (i === 0 || i === w - 1);
            for (let y = d.y; y <= d.y + d.h; y++) {
              const topB = y >= d.y + d.h - 1, botB = y <= d.y;
              if (shellEdge || topB || botB) b.set(x, y, z, shellEdge ? P.hullD : (topB ? P.hullA : P.hullB), false, 0.06);
            }
          }
          if ((x - d.x0) % 26 === 0) for (let y = d.y + 1; y < d.y + d.h; y++) b.set(x, y, s * (baseZ + 1), P.glow, true);
        }
      }
    }

    // ---- ventral keel
    for (let x = -420; x <= 340; x++) {
      const w = Math.round(C.lerp(18, 6, C.clamp((x + 420) / 760, 0, 1)));
      const y0 = Math.floor(FH.yb(x)) - 5;
      for (let z = -w; z <= w; z++) {
        const edge = Math.abs(z) >= w - 1;
        b.set(x, y0, z, edge ? P.hullB : P.hullB, false, 0.06);
        b.set(x, y0 - 1, z, edge ? P.hullC : P.hullB, false, 0.05);
      }
    }

    // ---- hull panel grooves
    for (let x = -HALF; x <= HALF; x++) {
      if (((x + 520) % 62) < 3) {
        const W = Math.floor(FH.hw(x));
        for (const s of [-1, 1]) {
          for (let d = 0; d < 2; d++) {
            const z = s * (W - 1 - d);
            for (let y = Math.floor(FH.yb(x)) + 2; y <= Math.ceil(FH.yt(x)) - 2; y++)
              b.set(x, y, z, d === 1 ? P.hullC : P.hullB, false, 0.04);
          }
          if (((x + 520) % 62) === 1) b.set(x, Math.floor((FH.yb(x) + FH.yt(x)) / 2), s * (W - 1), P.glow, true);
        }
      }
    }
    for (let x = -HALF; x <= HALF; x++) {
      if (((x + 520) % 78) < 2) {
        for (let z = -Math.floor(FH.hw(x)) + 4; z <= Math.floor(FH.hw(x)) - 4; z += 3)
          b.set(x, Math.floor(FH.yb(x)) + 1, z, P.hullC, false, 0.04);
      }
    }

    // ---- hangar mouth (starboard aft) + rim
    b.carve(-440, -18, 44, -180, 20, 74);
    for (let x = -452; x <= -168; x++) {
      for (let y = -22; y <= 24; y++) {
        const edge = (y === -22 || y === 24 || x === -452 || x === -168);
        if (edge) { b.set(x, y, 46, P.hullD, false, 0.05); b.set(x, y, 72, P.hullD, false, 0.05); }
      }
    }
    for (let x = -446; x <= -174; x += 14) for (let y = -18; y <= 20; y += 5) b.set(x, y, 47, P.glow, true);
    for (let x = -460; x <= -160; x += 4) b.set(x, -26, 59, P.hullD, false, 0.05);

    // ---- bridge view band (front of bridge block)
    b.carve(300, 2, -46, 316, 44, 46);
    for (let x = 298; x <= 318; x++) {
      for (let z = -50; z <= 50; z++) {
        const edge = (Math.abs(z) >= 48 || x === 298 || x === 318);
        if (edge) { b.set(x, 0, z, P.hullD, false, 0.05); b.set(x, 46, z, P.hullD, false, 0.05); }
      }
    }
    for (let z = -46; z <= 46; z += 6) for (let y = 4; y <= 42; y += 3) b.set(300, y, z, P.glowDim, true);

    // ---- stern engine bay + nozzles
    const noz = [];
    const bayZ = [-42, -14, 14, 42], bayY = [-8, 8];
    for (const z of bayZ) for (const y of bayY) noz.push([z, y]);
    for (let x = -534; x <= -470; x++) {
      const t = (x + 534) / 64;
      const W = Math.round(C.lerp(66, 54, t));
      for (let z = -W; z <= W; z++) for (let y = -22; y <= 22; y++) {
        const az = Math.abs(z), ay = Math.abs(y);
        if (az > W || ay > 22) continue;
        if (az >= W - 3 || ay >= 19) b.set(x, y, z, P.hullB, false, 0.05);
      }
    }
    for (const n of noz) {
      const [z, y] = n, R = 13;
      for (let d = 0; d < 4; d++) {
        const x = -532 + d * 9, r = R - d * 3;
        for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dz), Math.abs(dy)) === r) b.set(x, y + dy, z + dz, d === 3 ? P.hullC : P.hullD, false, 0.05);
        }
      }
      for (let dz = -4; dz <= 4; dz++) for (let dy = -4; dy <= 4; dy++)
        if (Math.abs(dz) + Math.abs(dy) < 7) b.set(-502, y + dy, z + dz, P.engine, true);
      for (let i = 0; i < 3; i++) b.set(-504 - i * 2, y, z, i === 0 ? P.engineHot : P.engine, true);
    }

    // ---- beam cannon (largest weapon)
    const bc = new VB.VoxelBuilder();
    bc.box(320, -26, -28, 430, 26, 28, P.hullB, false, 0.05);
    bc.shell(320, -24, -26, 430, 24, 26, 2, P.hullD, false, 0.05, true);
    bc.carve(344, -14, -16, 420, 14, 16);
    for (let x = 330; x <= 424; x += 10) for (const s of [-1, 1]) bc.set(x, s * 18, 0, P.glow, true);
    b.merge(bc, 0, 0, 0);
    for (let x = 430; x <= 700; x++) {
      const t = (x - 430) / 270;
      const w = Math.round(C.lerp(25, 13, t)), h = Math.round(C.lerp(18, 9, t));
      for (let z = -w; z <= w; z++) for (let y = -h; y <= h; y++) {
        const edge = Math.abs(z) >= w - 2 || Math.abs(y) >= h - 2;
        if (edge) {
          const band = Math.floor((x - 430) / 34) % 2;
          b.set(x, y, z, band ? P.hullA : P.hullB, false, 0.05);
        }
      }
      if (x % 34 === 0) for (let i = -1; i <= 1; i++) b.set(x, i * 6, 0, P.glow, true);
    }
    for (let x = 700; x <= 730; x++) {
      const t = (x - 700) / 30;
      const w = Math.round(C.lerp(21, 16, t));
      for (let z = -w; z <= w; z++) for (let y = -15; y <= 15; y++) {
        const ring = Math.max(Math.abs(z), Math.abs(y));
        if (ring >= w - 3 || ring >= 11) b.set(x, y, z, P.hullD, false, 0.05);
      }
    }
    for (let x = 726; x <= 730; x++) for (let z = -10; z <= 10; z++) for (let y = -8; y <= 8; y++)
      if (Math.max(Math.abs(z), Math.abs(y)) >= 7) b.set(x, y, z, P.glow, true);
    b.set(733, 0, 0, P.glow, true);

    // ---- pulse turrets (local-space meshes, aimable)
    const turrets = [];
    const tdefs = [[-300, 32, 34], [-140, 33, -34], [40, 32, 36], [220, 24, -30], [-220, 56, 0], [160, 54, 0]];
    for (const t of tdefs) {
      const tb = new VB.VoxelBuilder();
      tb.box(-10, -6, -10, 10, 2, 10, P.hullB, false, 0.05);
      tb.shell(-8, -4, -8, 8, 2, 8, 2, P.hullD, false, 0.05, true);
      tb.box(-12, 2, -8, 12, 10, 8, P.hullA, false, 0.05);
      for (let x = -12; x <= 12; x += 4) tb.set(x, 9, 0, P.glow, true);
      for (const s of [-1, 1]) {
        tb.box(12, 4 + s * 2, -2, 46, 6 + s * 2, 2, P.hullD, false, 0.04);
        tb.box(46, 5 + s * 2, -3, 50, 7 + s * 2, 3, P.glow, true);
      }
      if (t[1] > 40) for (let y = -14; y < -6; y++) for (let z = -3; z <= 3; z += 2) tb.set(0, y, z, P.hullB, false, 0.05);
      const mesh = VB.buildMesh(window.__gl, tb.extract());
      turrets.push({ mesh, pos: [t[0], t[1], t[2]], muzzle: [52, 6, 0] });
    }

    const d = b.extract(insideHull);
    return {
      mesh: VB.buildMesh(window.__gl, d), voxels: d.count,
      turrets, muzzle: [736, 0, 0],
      nozzles: noz.map(n => [-536, n[1], n[0]]),
      bbox: { min: [-540, -36, -70], max: [740, 60, 70] }
    };
  }

  // ============================== GUARDIAN ==============================
  function buildGuardian() {
    const b = new VB.VoxelBuilder();
    const hw = pwl([[-88, 8], [-70, 12], [-30, 16], [20, 17], [60, 13], [84, 6]]);
    const yt = pwl([[-88, 2], [-60, 5], [0, 8], [60, 7], [88, 3]]);
    const yb = pwl([[-88, -5], [-60, -7], [0, -8], [60, -7], [88, -4]]);
    for (let x = -88; x <= 88; x++) {
      const W = Math.floor(hw(x)), T = Math.ceil(yt(x)), B = Math.floor(yb(x));
      for (let z = -W - 1; z <= W + 1; z++) {
        const az = Math.abs(z);
        if (az > W + 1) continue;
        for (let y = B; y <= T; y++) {
          const side = az >= W - 1, bot = y <= B + 1, top = y >= T - 1;
          if (side || bot || top) {
            const band = Math.floor((x + 88) / 22) % 2;
            b.set(x, y, z, band ? P.hullA : P.hullA2, false, 0.07);
          }
        }
      }
    }
    for (const s of [-1, 1]) {
      for (let x = -70; x <= 60; x++) {
        const t = Math.min(1, Math.min(x + 70, 60 - x) / 24);
        const w = Math.round(7 * C.smooth(t));
        const baseZ = Math.floor(hw(x));
        for (let i = 0; i < w; i++) {
          const z = s * (baseZ + 1 + i);
          const edge = (i === 0 || i === w - 1);
          for (let y = -4; y <= 5; y++)
            if (edge || y === 5 || y === -4) b.set(x, y, z, edge ? P.hullD : P.hullB, false, 0.06);
        }
        if ((x + 70) % 14 === 0) b.set(x, 4, s * baseZ, P.glow, true);
      }
    }
    for (let x = -40; x <= 50; x++) {
      const w = Math.round(C.lerp(8, 5, (x + 40) / 90));
      for (let z = -w; z <= w; z++) for (let y = 6; y <= 11; y++) {
        const edge = Math.abs(z) >= w - 1 || y === 11;
        if (edge) b.set(x, y, z, y === 11 ? P.hullD : P.hullB, false, 0.05);
      }
    }
    for (let x = 60; x <= 88; x++) {
      const t = (x - 60) / 28;
      const w = Math.max(1, Math.round(C.lerp(8, 2, t)));
      for (let z = -w; z <= w; z++) for (let y = -3; y <= 5; y++) {
        const top = y >= 4 - t * 2;
        if (top || Math.abs(z) >= w - 1) b.set(x, y, z, top ? P.hullA2 : P.hullB, false, 0.05);
      }
    }
    const ciws = [];
    const cdefs = [[-52, 6, 14], [30, 5, -14], [-20, 8, 0], [62, 3, 8]];
    for (const c of cdefs) {
      const [cx, cy, cz] = c;
      b.box(cx - 4, cy, cz - 4, cx + 4, cy + 3, cz + 4, P.hullB, false, 0.05);
      b.box(cx - 3, cy + 3, cz - 3, cx + 3, cy + 5, cz + 3, P.hullD, false, 0.05);
      for (const s of [-1, 1]) b.box(cx + 3, cy + 3 + s, cz - 1, cx + 13, cy + 5 + s, cz + 1, P.hullD, false, 0.04);
      b.set(cx + 14, cy + 4, cz, P.glow, true);
      ciws.push({ pos: [cx + 14, cy + 4, cz] });
    }
    const noz = [];
    for (const z of [-6, 6]) {
      for (let d = 0; d < 3; d++) {
        const x = -86 + d * 5, r = 6 - d;
        for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++)
          if (Math.max(Math.abs(dz), Math.abs(dy)) === r) b.set(x, dy - 1, z + dz, d === 2 ? P.hullC : P.hullD, false, 0.05);
      }
      b.set(-76, -1, z, P.engineHot, true);
      b.set(-78, -1, z, P.engine, true);
      noz.push([-88, -1, z]);
    }
    const d = b.extract();
    return { mesh: VB.buildMesh(window.__gl, d), voxels: d.count, ciws, nozzles: noz, bbox: { min: [-90, -12, -26], max: [90, 16, 26] } };
  }

  // ============================== VANGUARD ==============================
  function buildVanguard() {
    const b = new VB.VoxelBuilder();
    const hw = pwl([[-100, 7], [-80, 10], [-20, 13], [40, 12], [80, 8], [100, 4]]);
    const yt = pwl([[-100, 1], [-70, 3], [0, 5], [70, 5], [100, 2]]);
    const yb = pwl([[-100, -3], [-70, -4], [0, -5], [70, -4], [100, -2]]);
    for (let x = -100; x <= 100; x++) {
      const W = Math.floor(hw(x)), T = Math.ceil(yt(x)), B = Math.floor(yb(x));
      for (let z = -W - 1; z <= W + 1; z++) {
        const az = Math.abs(z);
        if (az > W + 1) continue;
        for (let y = B; y <= T; y++) {
          const side = az >= W - 1, bot = y <= B + 1, top = y >= T - 1;
          if (side || bot || top) {
            const band = Math.floor((x + 100) / 25) % 2;
            b.set(x, y, z, band ? P.hullA2 : P.hullA, false, 0.07);
          }
        }
      }
    }
    const slots = [];
    for (const s of [-1, 1]) {
      for (let x = -80; x <= 70; x++) {
        const t = Math.min(1, Math.min(x + 80, 70 - x) / 30);
        const w = Math.round(9 * C.smooth(t));
        const baseZ = Math.floor(hw(x));
        for (let i = 0; i < w; i++) {
          const z = s * (baseZ + 1 + i);
          const edge = (i === 0 || i === w - 1);
          for (let y = 1; y <= 4; y++) if (edge || y === 4) b.set(x, y, z, edge ? P.hullD : P.hullB, false, 0.05);
        }
        if ((x + 80) % 12 < 7 && w > 4) {
          for (const yy of [2, 3]) {
            b.set(x, yy, s * (baseZ + 3), P.hullC, false, 0.03);
            b.set(x, yy, s * (baseZ + 4), P.glowDim, true);
          }
          if ((x + 80) % 12 === 0) slots.push([x, 3, s * (baseZ + 5)]);
        }
      }
    }
    for (let x = -60; x <= 60; x++) {
      const w = 4;
      for (let z = -w; z <= w; z++) for (let y = 4; y <= 7; y++) {
        const edge = Math.abs(z) >= w - 1 || y === 7;
        if (edge) b.set(x, y, z, y === 7 ? P.hullD : P.hullB, false, 0.05);
      }
    }
    for (let x = 80; x <= 100; x++) {
      const t = (x - 80) / 20;
      for (const s of [-1, 1]) {
        const z = s * Math.round(C.lerp(4, 1, t));
        for (let y = 1; y <= 3; y++) b.set(x, y, z, P.hullA2, false, 0.05);
      }
      if (x % 5 === 0) b.set(x, 4, 0, P.glow, true);
    }
    const noz = [];
    for (const z of [-4, 4]) {
      for (let d = 0; d < 3; d++) {
        const x = -98 + d * 5, r = 5 - d;
        for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++)
          if (Math.max(Math.abs(dz), Math.abs(dy)) === r) b.set(x, dy, z + dz, d === 2 ? P.hullC : P.hullD, false, 0.05);
      }
      b.set(-88, 0, z, P.engineHot, true);
      b.set(-90, 0, z, P.engine, true);
      noz.push([-100, 0, z]);
    }
    const d = b.extract();
    return { mesh: VB.buildMesh(window.__gl, d), voxels: d.count, ciws: [], nozzles: noz, slots, bbox: { min: [-102, -8, -24], max: [102, 10, 24] } };
  }

  // ============================== BOAT ==============================
  function buildBoat() {
    const b = new VB.VoxelBuilder();
    for (let x = -13; x <= 13; x++) {
      const t = (x + 13) / 26;
      const w = Math.max(1, Math.round(C.lerp(2, 4, Math.sin(t * Math.PI))));
      const h = Math.max(1, Math.round(C.lerp(1, 3, Math.sin(t * Math.PI))));
      for (let z = -w; z <= w; z++) for (let y = -h; y <= h; y++) {
        const edge = Math.abs(z) >= w - 1 || y === h || y === -h;
        if (edge) b.set(x, y, z, Math.abs(z) >= w - 1 ? P.hullD : P.hullA, false, 0.06);
      }
      if (x % 4 === 0 && Math.abs(x) < 9) b.set(x, h, 0, P.glow, true);
    }
    for (let d = 0; d < 2; d++) {
      const x = -12 + d * 3, r = 3 - d;
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++)
        if (Math.max(Math.abs(dz), Math.abs(dy)) === r) b.set(x, dy, dz, P.hullD, false, 0.05);
    }
    b.set(-6, 0, 0, P.engineHot, true);
    const d = b.extract();
    return { mesh: VB.buildMesh(window.__gl, d), voxels: d.count, nozzles: [[-14, 0, 0]] };
  }

  // ============================== FLEET ==============================
  function buildFleet() {
    const flag = buildFlagship();
    const fleet = { flagship: flag, escorts: [], boats: [], turrets: flag.turrets };
    const gpos = [
      [-400, -24, 150], [-300, 34, 210], [-190, -44, 250], [-110, 12, 300],
      [-400, 44, -150], [-300, -34, -210], [-190, 54, -250], [-110, -12, -300],
      [-500, 4, 60], [-500, 26, -60]
    ];
    const vpos = [
      [520, -30, 130], [700, 20, -150], [620, 64, 270], [830, -50, -310], [760, 44, 390],
      [980, -20, -190], [900, 74, 130], [1100, 30, -430], [1050, -64, 310], [1240, 10, 70],
      [1180, 84, -270], [1350, -44, 190], [1300, 54, 470], [1500, -10, -130], [1450, 34, 310],
      [1620, 4, -390], [420, -24, 520], [320, 66, -540]
    ];
    for (const p of gpos) {
      const s = buildGuardian();
      fleet.escorts.push({ type: 'guardian', mesh: s.mesh, ciws: s.ciws, nozzles: s.nozzles, home: p, pos: [p[0], p[1], p[2]], rot: [0, 0, 0], scale: 1, bbox: s.bbox });
    }
    for (const p of vpos) {
      const s = buildVanguard();
      fleet.escorts.push({ type: 'vanguard', mesh: s.mesh, ciws: s.ciws, nozzles: s.nozzles, slots: s.slots, home: p, pos: [p[0], p[1], p[2]], rot: [0, 0, 0], scale: 1, bbox: s.bbox });
    }
    for (let i = 0; i < 6; i++) {
      const s = buildBoat();
      fleet.boats.push({ idx: i, mesh: s.mesh, nozzles: s.nozzles, home: [0, 0, 0], pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, bbox: { min: [-16, -6, -6], max: [16, 6, 6] } });
    }
    return fleet;
  }

  window.Ships = { buildFlagship, buildGuardian, buildVanguard, buildBoat, buildFleet };
})();
