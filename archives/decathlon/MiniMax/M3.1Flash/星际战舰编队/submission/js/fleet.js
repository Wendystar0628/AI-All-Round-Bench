/* 星际战舰编队 — ship construction
 *
 * Design language (母题): "split stepped wedge" — every vessel is a keel that
 * widens into stepped armour belts and splits into a forked prow.  Large quiet
 * panels carry the main colour, recessed belts and inner structure carry the
 * dark second colour, thin trim edges and every muzzle carry the bright accents.
 *
 * Local space: +Z = forward (bow), +Y = up, +X = starboard.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, V = F.Vox, P = F.Palette;
  const VM = V.VoxMesh, VG = V.VoxGrid;

  /* ==================================================================
   * shared hull machinery
   * ================================================================== */

  // stepped cross-section for a hull band
  function levelsFor(hw, yTop, yBot) {
    const span = yTop - yBot;
    return [
      { w: Math.round(hw * 0.70), y: Math.round(yTop) },
      { w: Math.round(hw * 0.85), y: Math.round(yTop - span * 0.10) },
      { w: Math.round(hw * 0.94), y: Math.round(yTop - span * 0.24) },
      { w: Math.round(hw * 1.00), y: Math.round(yTop - span * 0.40) },
      { w: Math.round(hw * 0.96), y: Math.round(yBot + span * 0.28) },
      { w: Math.round(hw * 0.80), y: Math.round(yBot + span * 0.12) },
      { w: Math.round(hw * 0.56), y: Math.round(yBot) },
    ];
  }

  /* loft a list of hull bands into a stepped shell.
   * bands: [{z0,z1,hw,yTop,yBot}]   opts:{levels,mat,skip,capTop,capBot}
   */
  function loftBands(mesh, bands, opts) {
    const o = opts || {};
    const lv = o.levels || ((b) => levelsFor(b.hw, b.yTop, b.yBot));
    const stations = [];
    bands.forEach((b, i) => { stations.push({ z: b.z0, bi: i }); stations.push({ z: b.z1, bi: i }); });
    for (let s = 0; s < stations.length - 1; s++) {
      const A = stations[s], B = stations[s + 1];
      const LA = lv(bands[A.bi]), LB = lv(bands[B.bi]);
      const zA = A.z, zB = B.z;
      for (let i = 0; i < 6; i++) {
        for (let side = -1; side <= 1; side += 2) {
          if (o.skip && o.skip(A.bi, i, side, zA, zB)) continue;
          const m = o.mat ? o.mat(A.bi, i, side, zA) : P.hullMain;
          if (!m) continue;
          let p0, p1, p2, p3;
          if (side < 0) {
            p0 = [-LA[i].w, LA[i].y, zA]; p1 = [-LA[i + 1].w, LA[i + 1].y, zA];
            p2 = [-LB[i + 1].w, LB[i + 1].y, zB]; p3 = [-LB[i].w, LB[i].y, zB];
          } else {
            p0 = [LA[i + 1].w, LA[i + 1].y, zA]; p1 = [LA[i].w, LA[i].y, zA];
            p2 = [LB[i].w, LB[i].y, zB]; p3 = [LB[i + 1].w, LB[i + 1].y, zB];
          }
          mesh.quad(p0, p1, p2, p3, m, {});
        }
      }
      // top deck (wind so the normal points up)
      {
        const m = o.mat ? o.mat(A.bi, -1, 0, zA) : P.hullMain;
        if (m) {
          mesh.quad([-LA[0].w, LA[0].y, zA], [-LA[0].w, LA[0].y, zB],
            [LA[0].w, LA[0].y, zB], [LA[0].w, LA[0].y, zA], m, {});
        }
      }
      // bottom
      {
        const m = o.mat ? o.mat(A.bi, -2, 0, zA) : P.hullDark;
        if (m) {
          mesh.quad([-LA[6].w, LA[6].y, zA], [LA[6].w, LA[6].y, zA],
            [LA[6].w, LA[6].y, zB], [-LB[6].w, LA[6].y, zB], m, {});
        }
      }
    }
    return mesh;
  }

  // stepped prow: a run of shrinking boxes (chunky voxel fork prongs)
  function steppedProng(mesh, z0, z1, x0, x1, y0, y1, mat, steps, drift) {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
      const k = 1 - t0 * 0.82;
      const cx = x0 + (x1 - x0) * t0 + (drift ? drift * t0 : 0);
      const cx1 = x0 + (x1 - x0) * t1 + (drift ? drift * t1 : 0);
      const w = Math.max(3, (x1 - x0) * k);
      const cy = y0 + (y1 - y0) * t0, cy1 = y0 + (y1 - y0) * t1;
      const yTop = Math.max(cy, cy1) + Math.max(3, (y1 - y0) * 0.5 * k);
      mesh.box(cx, Math.min(cy, cy1), za, cx + w, yTop, zb + 0.5, mat);
    }
    return mesh;
  }

  /* scattered plate detail so big panels are never dead flat */
  function greebleHull(mesh, bands, seed) {
    for (let z = -570; z < 520; z += 7) {
      const b = bandAt(bands, z);
      if (b.z1 - b.z0 < 20) continue;
      const lv = levelsFor(b.hw, b.yTop, b.yBot);
      const topW = lv[0].w;
      // deck furniture
      for (let x = -topW + 3; x < topW - 4; x += 8) {
        const h = Core.hash2(x * 3 + z, z * 7);
        if (h < 0.70) continue;
        const w = 3 + Math.floor(Core.hash2(x * 5, z) * 4);
        const d = 3 + Math.floor(Core.hash2(z * 3, x) * 6);
        const hh = 1 + Math.floor(Core.hash2(x * 11, z * 5) * 3);
        const mat = h > 0.955 ? P.trim : (h > 0.88 ? P.hullMidHi : P.hullMid);
        mesh.box(x, b.yTop, z, x + w, b.yTop + hh, z + d, mat);
        if (h > 0.93) mesh.box(x + 1, b.yTop + hh, z + 1, x + w - 1, b.yTop + hh + 1, z + d - 1, P.deep);
      }
      // flank blisters
      for (let side = -1; side <= 1; side += 2) {
        const hh2 = Core.hash2(z * 13 + side, z);
        if (hh2 < 0.62) continue;
        const y = lv[2].y - 6 - Math.floor(Core.hash2(side, z * 3) * 18);
        const hgt = 4 + Math.floor(Core.hash2(z * 5, side) * 10);
        const wdt = 4 + Math.floor(Core.hash2(side * 7, z) * 9);
        const x0 = side < 0 ? -lv[3].w - 3 : lv[3].w - 1;
        mesh.box(x0, y, z, x0 + side * 4, y + hgt, z + wdt, hh2 > 0.9 ? P.hullMidHi : P.hullMid);
        if (hh2 > 0.84) {
          const xs = side < 0 ? -lv[3].w - 4 : lv[3].w;
          mesh.box(xs, y + 1, z + 1, xs + side * 2, y + hgt - 1, z + wdt - 1, P.deep);
        }
      }
    }
    return mesh;
  }

  /* ==================================================================
   * FLAGSHIP  "长弓级"  ~1165 units long, 268 wide, 250+ tall
   * ================================================================== */
  function buildFlagship() {
    const mesh = new VM('flagship');
    const meta = { turrets: [], ciws: [], engines: [], hangar: {}, bridge: {}, muzzle: [], launcher: [] };

    const BANDS = [
      { z0: -590, z1: -520, hw: 82, yTop: 56, yBot: -72 },
      { z0: -520, z1: -455, hw: 96, yTop: 70, yBot: -82 },
      { z0: -455, z1: -390, hw: 112, yTop: 88, yBot: -98 },
      { z0: -390, z1: -300, hw: 126, yTop: 108, yBot: -122 },
      { z0: -300, z1: -210, hw: 134, yTop: 122, yBot: -130 },
      { z0: -210, z1: 170, hw: 132, yTop: 122, yBot: -128 },
      { z0: 170, z1: 250, hw: 118, yTop: 106, yBot: -114 },
      { z0: 250, z1: 320, hw: 105, yTop: 94, yBot: -98 },
      { z0: 320, z1: 385, hw: 90, yTop: 80, yBot: -80 },
      { z0: 385, z1: 440, hw: 72, yTop: 64, yBot: -62 },
      { z0: 440, z1: 490, hw: 50, yTop: 48, yBot: -48 },
      { z0: 490, z1: 535, hw: 28, yTop: 28, yBot: -28 },
    ];
    const HANGAR_BAND = 5;              // band index of the long side tube
    const HANGAR_LVL = 3;               // level transition that gets carved out

    loftBands(mesh, BANDS, {
      mat: (bi, li, side) => {
        if (li === -1) return (bi % 2 === 0) ? P.hullMain : P.hullMid;
        if (li === -2) return P.hullDark;
        if (li === 1 || li === 4) return P.trim;                    // bright step edge
        if (li === 5) return P.hullDark;
        const even = bi % 2 === 0;
        if (li === 0) return even ? P.hullMain : P.hullMid;
        if (li === 2) return even ? P.hullMid : P.hullMain;
        return even ? P.hullMain : P.hullMid;
      },
      skip: (bi, li, side) => {
        // carve the port side hangar mouth
        if (bi === HANGAR_BAND && li === HANGAR_LVL && side < 0) return true;
        return false;
      },
    });

    /* --- recessed belt slots on the flanks (dark structure between plates) --- */
    for (let bi = 0; bi < BANDS.length; bi++) {
      const b = BANDS[bi];
      const lv = levelsFor(b.hw, b.yTop, b.yBot);
      const zc = (b.z0 + b.z1) * 0.5, zl = b.z1 - b.z0;
      if (zl < 26) continue;
      for (let side = -1; side <= 1; side += 2) {
        // dark recess band just under the belt line
        const w = lv[3].w, y = lv[3].y;
        mesh.box(side < 0 ? -w + 3 : w - 9, y - 14, b.z0 + 6, side < 0 ? -w + 9 : w - 3, y - 2, b.z1 - 6, P.deep);
        // raised armour rib across the plate
        const rz = zc - 5;
        mesh.box(side < 0 ? -w - 5 : w, lv[2].y - 12, rz, side < 0 ? -w : w + 5, lv[2].y + 4, rz + 10, P.hullMidHi);
        // trim line
        mesh.box(side < 0 ? -w - 1 : w - 3, lv[1].y - 4, b.z0 + 10, side < 0 ? -w + 3 : w - 1, lv[1].y - 1, b.z1 - 10, P.trim);
      }
    }

    /* --- dorsal spine: stacked terraces over the atrium --- */
    const spine = [
      { z0: 180, z1: 360, w: 66, y0: 96, y1: 168 },   // bridge tower base
      { z0: -60, z1: 170, w: 44, y0: 104, y1: 138 },
      { z0: -200, z1: -70, w: 52, y0: 106, y1: 146 },
      { z0: -330, z1: -210, w: 58, y0: 108, y1: 150 },
    ];
    for (const s of spine) {
      mesh.box(-s.w, s.y0, s.z0, s.w, s.y1, s.z1, P.hullMid);
      // stepped terraces
      mesh.box(-s.w + 10, s.y1, s.z0 + 12, s.w - 10, s.y1 + 12, s.z1 - 12, P.hullMain);
      mesh.box(-s.w + 22, s.y1 + 12, s.z0 + 26, s.w - 22, s.y1 + 22, s.z1 - 26, P.hullMidHi);
      // dark inlay slot
      mesh.box(-s.w + 30, s.y1 + 22, s.z0 + 40, s.w - 30, s.y1 + 26, s.z1 - 40, P.deep);
      mesh.box(-s.w + 36, s.y1 + 26, s.z0 + 56, s.w - 36, s.y1 + 29, s.z1 - 56, P.glowDeep);
    }
    // masts
    for (const m of [[-40, 140, -150], [34, 148, -260], [-30, 134, 60]]) {
      mesh.box(m[0] - 5, m[1], m[2] - 5, m[0] + 5, m[1] + 54, m[2] + 5, P.trim);
      mesh.box(m[0] - 9, m[1] + 18, m[2] - 9, m[0] + 9, m[1] + 22, m[2] + 9, P.deep);
      mesh.box(m[0] - 3, m[1] + 54, m[2] - 3, m[0] + 3, m[1] + 62, m[2] + 3, P.glowSoft);
    }

    /* --- ventral keel fin (adds silhouette from below) --- */
    for (let i = 0; i < 9; i++) {
      const z = -300 + i * 52;
      const w = 26 - Math.abs(i - 4) * 3;
      mesh.box(-w, -128 - (i % 2 ? 10 : 22), z, w, -112, z + 40, i % 2 ? P.hullDark : P.hullMid);
    }

    /* --- bow: a low splayed prow that cradles the main cannon --- */
    // low, wide prow shoulders
    mesh.box(-46, -50, 452, 46, 18, 542, P.hullMain);
    mesh.box(-38, -44, 500, 38, 12, 558, P.hullMidHi);
    // two prongs splitting the bow, framing the barrel
    steppedProng(mesh, 452, 578, 40, 58, -38, 30, P.hullMain, 5, 12);
    steppedProng(mesh, 452, 578, -58, -40, -38, 30, P.hullMain, 5, -12);
    // prong tips
    mesh.box(54, -16, 568, 72, 12, 580, P.trim);
    mesh.box(-72, -16, 568, -54, 12, 580, P.trim);
    // fork inner walls (dark)
    mesh.box(32, -34, 468, 38, 26, 556, P.deep);
    mesh.box(-38, -34, 468, -32, 26, 556, P.deep);

    /* --- beam main cannon: the largest weapon mass on the whole hull --- */
    const cbase = new VG();
    // armoured pedestal growing out of the forward deck
    cbase.fill(-50, 52, 284, 50, 96, 330, P.hullDark);
    cbase.fill(-44, 54, 330, 44, 98, 368, P.hullMid);
    // shoulder block
    cbase.fill(-38, 50, 368, 38, 94, 398, P.hullMain);
    // the barrel: three stepped stages shrinking toward the muzzle
    cbase.fill(-32, 44, 398, 32, 82, 452, P.hullMain);
    cbase.fill(-28, 43, 452, 28, 80, 504, P.hullMidHi);
    cbase.fill(-25, 42, 504, 25, 78, 544, P.hullMain);
    // flared muzzle collar and dark throat
    cbase.fill(-31, 38, 544, 31, 82, 560, P.hullMidHi);
    cbase.fill(-27, 40, 560, 27, 80, 574, P.hullDark);
    // bore ring: bright metal blocks around the recessed throat
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * 22), y = Math.round(Math.sin(a) * 18);
      cbase.set(x, y + 60, 568, P.trim);
    }
    // cooling vanes on the flanks of the barrel
    for (let i = 0; i < 6; i++) {
      const z = 406 + i * 22;
      cbase.set(-35, 50, z, P.deep); cbase.set(33, 50, z, P.deep);
      cbase.set(-36, 52, z, P.hullMidHi); cbase.set(32, 52, z, P.hullMidHi);
    }
    V.emitGrid(mesh, cbase, { jitter: 0.05 });
    // glowing channel running the length of the barrel
    mesh.box(-8, 56, 372, 8, 64, 452, P.glowDeep);
    mesh.box(-7, 55, 452, 7, 63, 540, P.glowSoft);
    mesh.box(-13, 50, 556, 13, 70, 566, P.glow);
    meta.muzzle = [0, 60, 574];
    meta.cannonBase = [0, 60, 372];

    /* --- stern: engine bays --- */
    const eng = new VG();
    const enginePos = [];
    for (let i = 0; i < 8; i++) {
      const row = i < 4 ? 0 : 1;
      const col = i % 4;
      const ex = -54 + col * 36;
      const ey = row === 0 ? 6 : -46;
      const ez = -560;
      // recessed bay
      mesh.box(ex - 16, ey - 16, ez - 6, ex + 16, ey + 16, ez + 26, P.deep);
      // nozzle throat: octagonal ring of blocks
      const R = 13;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        eng.set(Math.round(ex + Math.cos(a) * R), Math.round(ey + Math.sin(a) * R), ez - 4, P.trim);
      }
      eng.fill(ex - 6, ey - 6, ez - 2, ex + 6, ey + 6, ez + 2, P.glow);
      eng.fill(ex - 8, ey - 8, ez + 2, ex + 8, ey + 8, ez + 4, P.glowDeep);
      enginePos.push([ex, ey, ez - 6]);
    }
    V.emitGrid(mesh, eng, { jitter: 0.06 });
    meta.engines = enginePos;

    /* --- hangar mouth frame (port side, forward half) --- */
    {
      const z0 = -206, z1 = 166, y0 = -58, y1 = 24;
      const x = -132;
      // frame: sill, lintel and two end posts.  The bay stays open between them,
      // so the lit interior is visible from space and the camera can fly in.
      mesh.box(x - 6, y0 - 9, z0 - 6, x + 4, y0 + 1, z1 + 6, P.hullMidHi);
      mesh.box(x - 6, y1 - 1, z0 - 6, x + 4, y1 + 9, z1 + 6, P.hullMidHi);
      mesh.box(x - 6, y0 - 9, z0 - 6, x + 4, y1 + 9, z0 + 2, P.hullMidHi);
      mesh.box(x - 6, y0 - 9, z1 - 2, x + 4, y1 + 9, z1 + 6, P.hullMidHi);
      mesh.box(x - 8, y1 + 4, z0 - 6, x + 2, y1 + 9, z1 + 6, P.trim);
      mesh.box(x - 8, y0 - 9, z0 - 6, x + 2, y0 - 4, z1 + 6, P.trim);
      // lit sill and lintel rails: from outside the open bay reads as a gate
      mesh.box(x - 12, y1 + 4, z0 - 4, x - 8, y1 + 8, z1 + 4, P.glow);
      mesh.box(x - 12, y0 - 8, z0 - 4, x - 8, y0 - 4, z1 + 4, P.glow);
      // hazard beacons at the two ends of the mouth
      mesh.box(x - 13, y0 - 4, z0 - 9, x - 7, y1 + 4, z0 - 3, P.warmSoft);
      mesh.box(x - 13, y0 - 4, z1 + 3, x - 7, y1 + 4, z1 + 9, P.warmSoft);
      // bay dividers inside the mouth
      for (let i = 1; i < 4; i++) {
        const zz = z0 + (z1 - z0) * i / 4;
        mesh.box(x - 3, y0, zz - 5, x + 16, y1, zz + 5, P.deep);
        mesh.box(x - 5, y0, zz - 7, x + 2, y1, zz + 7, P.hullDark);
      }
      meta.hangar = { mouth: [x - 4, -18, 120], z0: z0, z1: z1, y0: y0, y1: y1, x: x };
    }

    /* --- starboard sponson + docking rail --- */
    {
      const b = BANDS[6];
      mesh.box(96, -70, 60, 150, -22, 250, P.hullMid);
      mesh.box(104, -66, 70, 142, -34, 240, P.deep);
      mesh.box(150, -66, 76, 160, -30, 120, P.trim);
      mesh.box(150, -62, 140, 160, -34, 234, P.trim);
      for (let i = 0; i < 6; i++) mesh.box(148, -46, 84 + i * 26, 156, -40, 94 + i * 26, P.glowDeep);
    }

    /* --- pulse turrets (separate meshes so they can track) --- */
    const turretProto = buildPulseTurret();
    const dorsalZ = [140, 60, -30, -120, -220, -300];
    dorsalZ.forEach((z, i) => {
      const s = i % 2 === 0 ? -1 : 1;
      const x = s * 46, y = 128;
      mesh.box(x - 13, y - 14, z - 13, x + 13, y + 4, z + 13, P.hullDark);
      mesh.box(x - 10, y + 4, z - 10, x + 10, y + 10, z + 10, P.hullMid);
      meta.turrets.push({ pivot: [x, y + 10, z], mesh: turretProto, kind: 'pulse', scale: 1 });
    });
    const flankZ = [200, 110, 10, -90, -170];
    flankZ.forEach((z, i) => {
      const s = i % 2 === 0 ? 1 : -1;
      const b = bandAt(BANDS, z);
      const x = s * (b.hw + 2), y = b.yTop - (b.yTop - b.yBot) * 0.38;
      mesh.box(x - s * 12, y - 12, z - 12, x + s * 2, y + 3, z + 12, P.hullDark);
      meta.turrets.push({ pivot: [x + s * 2, y + 3, z], mesh: turretProto, kind: 'pulse', scale: 1 });
    });

    /* --- forward hull detail: hangar gantry rails, deck hatches --- */
    for (let i = 0; i < 5; i++) {
      const z = 300 + i * 34;
      mesh.box(-70, 96, z, 70, 101, z + 16, P.deep);
      mesh.box(-60, 101, z + 4, 60, 104, z + 12, P.glowDeep);
    }
    for (let i = 0; i < 3; i++) {
      mesh.box(-96, 92, 210 + i * 120, -60, 98, 260 + i * 120, P.hullMidHi);
      mesh.box(60, 92, 210 + i * 120, 96, 98, 260 + i * 120, P.hullMidHi);
    }

    meta.length = 1165;
    meta.halfWidth = 134;
    meta.bands = BANDS;
    greebleHull(mesh, BANDS, 7);
    return { mesh: mesh, meta: meta, turretProto: turretProto };
  }

  function bandAt(BANDS, z) {
    for (const b of BANDS) if (z >= b.z0 && z < b.z1) return b;
    return BANDS[0];
  }

  /* pulse turret: base ring, housing, barrel, glowing muzzle */
  function buildPulseTurret() {
    const g = new VG();
    g.fill(-9, -6, -9, 9, 0, 9, P.hullDark);
    g.fill(-7, 0, -7, 7, 5, 7, P.hullMid);
    g.fill(-5, 5, -6, 5, 9, 4, P.hullMidHi);
    g.fill(-3, 6, 5, 3, 8, 22, P.trim);      // barrel
    g.fill(-2, 7, 22, 2, 8, 24, P.warm);     // muzzle
    g.set(-4, 3, -8, P.glowDeep);
    g.set(4, 3, -8, P.glowDeep);
    const m = new VM('turret');
    V.emitGrid(m, g, { jitter: 0.05 });
    return m;
  }

  /* ==================================================================
   * CLOSE ESCORT  "楔卫级"  ~205 long, 74 wide, 58 tall
   * compact, thick, blunt — a dense wedge with clustered CIWS
   * ================================================================== */
  function buildEscortClose(variant) {
    const mesh = new VM('escortClose');
    const meta = { ciws: [], engines: [] };
    const BANDS = [
      { z0: -100, z1: -78, hw: 20, yTop: 16, yBot: -16 },
      { z0: -78, z1: -44, hw: 28, yTop: 22, yBot: -22 },
      { z0: -44, z1: 6, hw: 36, yTop: 28, yBot: -28 },
      { z0: 6, z1: 48, hw: 33, yTop: 26, yBot: -26 },
      { z0: 48, z1: 78, hw: 24, yTop: 20, yBot: -20 },
      { z0: 78, z1: 96, hw: 13, yTop: 13, yBot: -13 },
      { z0: 96, z1: 104, hw: 6, yTop: 7, yBot: -7 },
    ];
    loftBands(mesh, BANDS, {
      mat: (bi, li) => {
        if (li === -1) return bi % 2 ? P.hullMid : P.hullMain;
        if (li === -2) return P.hullDark;
        if (li === 1 || li === 4) return P.trim;
        if (li === 5) return P.hullDark;
        return bi % 2 ? P.hullMain : P.hullMid;
      },
    });
    // side armour plates + dark belt
    for (let bi = 0; bi < BANDS.length; bi++) {
      const b = BANDS[bi];
      if (b.z1 - b.z0 < 18) continue;
      const lv = levelsFor(b.hw, b.yTop, b.yBot);
      for (let side = -1; side <= 1; side += 2) {
        const w = lv[3].w;
        mesh.box(side < 0 ? -w : w - 6, lv[3].y - 9, b.z0 + 4, side < 0 ? -w + 6 : w, lv[3].y - 1, b.z1 - 4, P.deep);
        mesh.box(side < 0 ? -w - 4 : w, lv[2].y - 8, b.z0 + 8, side < 0 ? -w : w + 4, lv[2].y + 2, b.z1 - 8, P.hullMidHi);
      }
    }
    // dorsal block + short split nose
    mesh.box(-13, 26, -30, 13, 34, 20, P.hullMid);
    mesh.box(-8, 34, -22, 8, 39, 8, P.hullMain);
    mesh.box(-5, 39, -14, 5, 42, 0, P.deep);
    steppedProng(mesh, 88, 104, 6, 14, -10, 10, P.hullMain, 3, 4);
    steppedProng(mesh, 88, 104, -14, -6, -10, 10, P.hullMain, 3, -4);
    // engines
    const eg = new VG();
    for (let i = 0; i < 4; i++) {
      const ex = -18 + (i % 2) * 24, ey = i < 2 ? 9 : -13;
      mesh.box(ex - 9, ey - 9, -104, ex + 9, ey + 9, -88, P.deep);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        eg.set(Math.round(ex + Math.cos(a) * 7), Math.round(ey + Math.sin(a) * 7), -103, P.trim);
      }
      eg.fill(ex - 3, ey - 3, -102, ex + 3, ey + 3, -99, P.glow);
      meta.engines.push([ex, ey, -103]);
    }
    V.emitGrid(mesh, eg, { jitter: 0.06 });

    // CIWS mount points (barrel meshes are separate so they can swing)
    const ciwsProto = buildCIWS();
    const mounts = [
      [-26, 22, -34], [26, 22, -34], [-32, -8, -8], [32, -8, -8],
      [-24, 26, 18], [24, 26, 18],
    ];
    for (const m of mounts) {
      mesh.box(m[0] - 6, m[1] - 5, m[2] - 6, m[0] + 6, m[1] + 2, m[2] + 6, P.hullDark);
      mesh.box(m[0] - 4, m[1] + 2, m[2] - 4, m[0] + 4, m[1] + 5, m[2] + 4, P.hullMid);
      meta.ciws.push({ pivot: [m[0], m[1] + 5, m[2]], mesh: ciwsProto });
    }
    return { mesh: mesh, meta: meta };
  }

  /* CIWS: squat turret with twin short barrels */
  function buildCIWS() {
    const g = new VG();
    g.fill(-5, -4, -5, 5, 0, 5, P.hullDark);
    g.fill(-4, 0, -4, 4, 4, 3, P.hullMid);
    g.fill(-3, 3, 1, -1, 5, 12, P.trim);
    g.fill(1, 3, 1, 3, 5, 12, P.trim);
    g.fill(-3, 4, 12, -1, 5, 13, P.warm);
    g.fill(1, 4, 12, 3, 5, 13, P.warm);
    const m = new VM('ciws');
    V.emitGrid(m, g, { jitter: 0.05 });
    return m;
  }

  /* ==================================================================
   * VANGUARD  "长矛级"  ~215 long, 82 wide, 34 tall
   * long, low and stretched — missile racks along the flanks
   * ================================================================== */
  function buildEscortVanguard(variant) {
    const mesh = new VM('escortVanguard');
    const meta = { launchers: [], engines: [] };
    const BANDS = [
      { z0: -104, z1: -80, hw: 16, yTop: 9, yBot: -9 },
      { z0: -80, z1: -40, hw: 26, yTop: 14, yBot: -14 },
      { z0: -40, z1: 24, hw: 38, yTop: 17, yBot: -17 },
      { z0: 24, z1: 70, hw: 34, yTop: 15, yBot: -15 },
      { z0: 70, z1: 100, hw: 22, yTop: 12, yBot: -12 },
      { z0: 100, z1: 110, hw: 9, yTop: 8, yBot: -8 },
    ];
    loftBands(mesh, BANDS, {
      mat: (bi, li) => {
        if (li === -1) return P.hullMain;
        if (li === -2) return P.hullDark;
        if (li === 1) return P.trim;
        if (li === 4 || li === 5) return P.hullDark;
        return bi % 2 ? P.hullMid : P.hullMain;
      },
    });
    // long dorsal spine
    mesh.box(-8, 16, -70, 8, 24, 60, P.hullMid);
    mesh.box(-5, 24, -50, 5, 28, 40, P.hullMidHi);
    mesh.box(-2, 28, -40, 2, 30, 30, P.glowDeep);
    // swept side pods with missile slot rows
    for (let side = -1; side <= 1; side += 2) {
      mesh.box(side < 0 ? -44 : 30, -6, -34, side < 0 ? -30 : 44, 10, 66, P.hullMid);
      mesh.box(side < 0 ? -46 : 32, -2, -26, side < 0 ? -32 : 46, 3, 58, P.deep);
      // slot rails
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          const zz = -28 + c * 13 + r * 3;
          const xx = side < 0 ? -44 : 38;
          mesh.box(xx, 0 + r * 2, zz, xx + (side < 0 ? 8 : 8), 5 + r * 2, zz + 6, P.deep);
          mesh.box(xx + 1, 1 + r * 2, zz + 1, xx + (side < 0 ? 7 : 7), 3 + r * 2, zz + 5, r === 3 ? P.warmSoft : P.glowDeep);
        }
      }
      meta.launchers.push({ side: side, z: -26, y: 2 });
    }
    // nose prongs
    steppedProng(mesh, 92, 112, 8, 16, -8, 8, P.hullMain, 3, 5);
    steppedProng(mesh, 92, 112, -16, -8, -8, 8, P.hullMain, 3, -5);
    // engines
    const eg = new VG();
    for (let i = 0; i < 2; i++) {
      const ex = i === 0 ? -14 : 14;
      mesh.box(ex - 10, -10, -108, ex + 10, 10, -92, P.deep);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        eg.set(Math.round(ex + Math.cos(a) * 8), Math.round(Math.sin(a) * 8), -107, P.trim);
      }
      eg.fill(ex - 4, -4, -106, ex + 4, 4, -103, P.glow);
      meta.engines.push([ex, 0, -107]);
    }
    V.emitGrid(mesh, eg, { jitter: 0.06 });
    return { mesh: mesh, meta: meta };
  }

  /* ==================================================================
   * SMALL CRAFT  ~30 long — flies out of the hangar, escorts, returns
   * ================================================================== */
  function buildSmallCraft() {
    const g = new VG();
    // nose
    for (let i = 0; i < 12; i++) {
      const z = 15 - i, w = 1 + Math.floor(i * 0.45);
      g.fill(-w, -1, z - 1, w, 1, z, P.hullMain);
    }
    // body
    g.fill(-4, -3, -8, 4, 3, 8, P.hullMain);
    g.fill(-3, -2, -8, 3, 2, 8, P.hullMid);
    g.fill(-2, -1, -8, 2, 1, 6, P.deep);
    // canopy ridge
    g.fill(-2, 3, -2, 2, 5, 6, P.hullMidHi);
    g.fill(-1, 5, -1, 1, 6, 4, P.glowSoft);
    // wings
    g.fill(-9, 0, -4, -4, 2, 4, P.hullMid);
    g.fill(4, 0, -4, 9, 2, 4, P.hullMid);
    g.fill(-9, 1, -2, -5, 3, 1, P.trim);
    g.fill(5, 1, -2, 9, 3, 1, P.trim);
    // tail
    g.fill(-3, 0, -11, 3, 5, -8, P.hullMid);
    g.fill(-4, 4, -11, -2, 8, -8, P.trim);
    g.fill(2, 4, -11, 4, 8, -8, P.trim);
    // engine
    g.fill(-3, -2, -13, 3, 2, -11, P.hullDark);
    g.fill(-2, -1, -14, 2, 1, -12, P.glow);
    const m = new VM('craft');
    V.emitGrid(m, g, { jitter: 0.06 });
    return m;
  }

  F.Fleet = {
    buildFlagship: buildFlagship,
    buildEscortClose: buildEscortClose,
    buildEscortVanguard: buildEscortVanguard,
    buildSmallCraft: buildSmallCraft,
    buildPulseTurret: buildPulseTurret,
    buildCIWS: buildCIWS,
    levelsFor: levelsFor,
  };
})(window);
