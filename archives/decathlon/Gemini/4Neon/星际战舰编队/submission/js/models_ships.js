// js/models_ships.js - True 1-Unit Voxel Fleet Models:
// Flagship (1120x376x216), Close-Escort (184x108x64), Vanguard Escort (216x136x46),
// Carrier Shuttle (28x18x9), Pulse Turrets, Hover Pylons, CIWS Turrets, Voxel Missiles.
window.App = window.App || {};

(function (App) {
  const VoxelGrid = App.VoxelGrid;
  const M = App.MAT;

  // Helper: stepped sloped hull profile along Z using integer voxel slabs (hollowed internally!)
  function addSteppedHullSlices(g, zStart, zEnd, stepZ, profileFn) {
    for (let z = zStart; z <= zEnd; z += stepZ) {
      const z1 = Math.min(zEnd, z + stepZ - 1);
      const t = (z - zStart) / Math.max(1, zEnd - zStart);
      profileFn(g, z, z1, t);
    }
  }

  // Helper: recessed octagonal-stepped engine bell with deep dark inner cavity & glowing core
  function addEngineBell(g, cx, cy, zBack, depth, rOuter, rInner, hasGoldRing = true) {
    const zFront = zBack + depth;
    // Outer stepped tapered cowling
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const frac0 = s / steps;
      const frac1 = (s + 1) / steps;
      const zb = Math.round(zBack + frac0 * depth);
      const zf = Math.round(zBack + frac1 * depth);
      const rO = rOuter - (steps - 1 - s) * Math.max(1, Math.round(rOuter * 0.08));
      const rI = Math.max(2, rInner - s * 0.6);
      const mat = s === 0 ? M.ARMOR_DARK_SLATE : (s === 1 ? M.ARMOR_SLATE : M.HULL_MID);
      g.fillCylinderZ(cx, cy, zb, zf, rO, rI, mat, 0.75);
    }
    // Crisp metallic nozzle lip at rear rim
    g.fillCylinderZ(cx, cy, zBack - 2, zBack + 1, rOuter * 0.94, rInner + 1, M.METAL_STEEL, 0.75);
    if (hasGoldRing) {
      g.fillCylinderZ(cx, cy, zBack + Math.round(depth * 0.25), zBack + Math.round(depth * 0.35), rOuter + 1, rOuter - 1, M.METAL_GOLD, 0.75);
    }
    // Deep dark cavity wall lining
    g.fillCylinderZ(cx, cy, zBack + 2, zFront - 3, rInner + 1.5, rInner - 1.5, M.FRAME_DEEP, 0.75);
    // Radial interior baffle vanes
    const vaneLen = Math.max(2, Math.round(rInner * 0.45));
    const vz0 = zBack + 4, vz1 = zFront - 6;
    g.fillBox(cx - 1, cy + rInner - vaneLen, vz0, cx + 1, cy + rInner, vz1, M.FRAME_DARK);
    g.fillBox(cx - 1, cy - rInner, vz0, cx + 1, cy - rInner + vaneLen, vz1, M.FRAME_DARK);
    g.fillBox(cx + rInner - vaneLen, cy - 1, vz0, cx + rInner, cy + 1, vz1, M.FRAME_DARK);
    if (cx > rInner + 2) {
      g.fillBox(cx - rInner, cy - 1, vz0, cx - rInner + vaneLen, cy + 1, vz1, M.FRAME_DARK);
    }
    // Blazing deep thruster core plate + inner glowing ring
    g.fillCylinderZ(cx, cy, zFront - 5, zFront, rInner - 0.5, 0, M.EMIT_CYAN_HOT, 0.7);
    g.fillCylinderZ(cx, cy, zBack + Math.round(depth * 0.45), zBack + Math.round(depth * 0.52), rInner, rInner - 2, M.EMIT_CYAN, 0.75);
    // Dark reactor center pin inside huge engines
    if (rInner >= 10) {
      g.fillCylinderZ(cx, cy, zFront - 14, zFront - 2, rInner * 0.28, 0, M.FRAME_DARK, 0.6);
      g.fillCylinderZ(cx, cy, zFront - 16, zFront - 14, rInner * 0.16, 0, M.EMIT_CYAN_HOT, 0.6);
    }
  }

  // =========================================================================
  // 1. FLAGSHIP ("Aurelia-Class Dreadnought") — 1120 x 376 x 216 voxels
  //    z: [-560, +560] (+Z = Bow), x: [-188, +188] (built mirrorX), y: [-84, +132]
  // =========================================================================
  function buildFlagship() {
    const g = new VoxelGrid(true);

    // --- A. SPLIT-LANCE BIFURCATED PROW (z = +170 .. +566) ---
    // Sculpted as 6 bold, serene architectural stepped armor terraces (ZERO high-frequency zebra-stripe aliasing!)
    const prowTiers = [
      { z0: 170, z1: 244, xIn: 25, xOut: 102, yTop: 46, yBot: -36 },
      { z0: 248, z1: 326, xIn: 27, xOut:  92, yTop: 40, yBot: -31 },
      { z0: 330, z1: 404, xIn: 29, xOut:  80, yTop: 33, yBot: -25 },
      { z0: 408, z1: 472, xIn: 31, xOut:  66, yTop: 26, yBot: -19 },
      { z0: 476, z1: 534, xIn: 32, xOut:  52, yTop: 18, yBot: -13 },
      { z0: 536, z1: 562, xIn: 32, xOut:  42, yTop: 12, yBot:  -8 },
    ];
    for (let ti = 0; ti < prowTiers.length; ti++) {
      const p = prowTiers[ti];
      // Clean quiet primary ceramic-titanium armored block
      g.fillHollowBox(p.xIn, p.yBot, p.z0, p.xOut, p.yTop, p.z1, 3, M.HULL_MAIN);
      // Stepped lamellar upper ceramic terrace plate
      if (p.xOut - p.xIn > 14) {
        g.fillBox(p.xIn + 5, p.yTop + 1, p.z0 + 2, p.xOut - 7, p.yTop + 4, p.z1 - 2, M.HULL_LIGHT);
        g.fillBox(p.xIn, p.yTop - 1, p.z0, p.xIn + 3, p.yTop + 2, p.z1, M.METAL_GOLD);
      }
      // Clean horizontal slate shoulder & lower armor belts + recessed cyan side trench
      g.fillBox(p.xOut - 2, p.yBot, p.z0, p.xOut, p.yBot + 7, p.z1, M.ARMOR_SLATE);
      g.fillBox(p.xOut - 2, p.yTop - 5, p.z0, p.xOut, p.yTop - 1, p.z1, M.ARMOR_SLATE);
      const midY = Math.round((p.yTop + p.yBot) * 0.5);
      g.carveBox(p.xOut - 2, midY - 3, p.z0 + 2, p.xOut + 1, midY + 3, p.z1 - 2);
      g.fillBox(p.xOut - 4, midY - 2, p.z0 + 2, p.xOut - 2, midY + 2, p.z1 - 2, M.FRAME_DEEP);
      g.fillBox(p.xOut - 3, midY, p.z0 + 4, p.xOut - 2, midY + 1, p.z1 - 4, M.EMIT_CYAN);
      g.fillBox(p.xIn + 4, p.yBot - 3, p.z0 + 2, p.xOut - 8, p.yBot, p.z1 - 2, M.ARMOR_DARK_SLATE);

      // Deliberate dark recessed expansion channel + glowing cyan power bar between terrace sections!
      if (ti < prowTiers.length - 1) {
        const nz = prowTiers[ti + 1];
        g.fillHollowBox(p.xIn + 2, nz.yBot + 3, p.z1 + 1, nz.xOut - 3, nz.yTop - 3, nz.z0 - 1, 3, M.FRAME_DARK);
        g.fillBox(p.xIn + 5, nz.yTop - 3, p.z1 + 1, nz.xOut - 5, nz.yTop - 2, nz.z0 - 1, M.EMIT_CYAN);
      }
    }

    // Crisp forward lance-tip spear prongs (z = +540 .. +566)
    g.fillBox(32, -3, 554, 40, 8, 566, M.METAL_GOLD);
    g.fillBox(34, 1, 548, 38, 4, 562, M.EMIT_CYAN);

    // Carve TWO huge see-through vertical apertures (贯通空隙) through each prow mandible!
    const prowHoles = [
      { z0: 252, z1: 318, x0: 44, x1: 78 },
      { z0: 364, z1: 422, x0: 42, x1: 68 },
    ];
    for (const h of prowHoles) {
      g.carveBox(h.x0, -45, h.z0, h.x1, 55, h.z1);
      // Frame the open aperture with dark structural lip & gold corner collars
      g.fillHollowBox(h.x0 - 3, -24, h.z0 - 3, h.x1 + 3, 28, h.z1 + 3, 3, M.FRAME_DARK);
      g.carveBox(h.x0, -45, h.z0, h.x1, 55, h.z1);
      // Transverse structural cross-girders spanning across the open sky-well
      for (let gz = h.z0 + 14; gz < h.z1 - 8; gz += 18) {
        g.fillBox(h.x0 - 2, -6, gz, h.x1 + 2, 6, gz + 4, M.FRAME_DARK);
        g.fillBox(h.x0 - 1, 0, gz + 1, h.x1 + 1, 2, gz + 3, M.EMIT_CYAN);
      }
      // Gold lip accent on fore/aft aperture rim
      g.fillBox(h.x0 - 3, 18, h.z0 - 3, h.x1 + 3, 24, h.z0 - 1, M.METAL_GOLD);
      g.fillBox(h.x0 - 3, 18, h.z1 + 1, h.x1 + 3, 24, h.z1 + 3, M.METAL_GOLD);
    }

    // Transverse heavy bridge arches spanning across the central prow canyon OVER the weapon deck (z = +265, +350)
    g.fillBox(0, 34, 256, 36, 44, 274, M.ARMOR_SLATE);
    g.fillBox(0, 44, 260, 32, 48, 270, M.METAL_GOLD);
    g.fillBox(0, -34, 256, 36, -24, 274, M.FRAME_DARK);
    g.fillBox(0, -30, 345, 34, -22, 362, M.FRAME_DARK);

    // --- B. SPINAL BEAM MAIN CANNON (z = +110 .. +490, central spine x = 0..24) ---
    // Undisputed largest weapon mass on the Flagship! Elevated accelerator spine clearly visible above prow canyon!
    g.fillBevelBoxZ(0, -28, 110, 26, 44, 232, 6, M.WEAPON_DARK, 4);
    g.fillBox(0, 44, 128, 20, 56, 224, M.ARMOR_SLATE); // Towering dorsal capacitor breech housing
    g.fillBox(0, 56, 140, 12, 60, 218, M.METAL_GOLD);
    g.fillBox(0, 48, 224, 14, 54, 236, M.EMIT_CHARGE);
    // Lateral accelerator side-buttresses connecting breech into prow mandibles
    for (let bz = 132; bz <= 216; bz += 24) {
      g.fillBox(16, -16, bz, 32, 26, bz + 10, M.FRAME_DARK);
      g.fillBox(18, 26, bz + 2, 28, 30, bz + 8, M.METAL_GOLD);
    }
    // Four massive armored accelerator rail barrels extending all the way to z = +488
    // Elevated dorsal pair reaches y = +36 so barrel + sequential glowing slots stand out boldly!
    g.fillBox(8, 14, 232, 21, 34, 484, M.WEAPON_DARK);
    g.fillBox(8, -18, 232, 21, -2, 484, M.WEAPON_DARK);
    g.fillBox(6, 14, 236, 9, 30, 488, M.METAL_STEEL);
    g.fillBox(6, -14, 236, 9, -2, 488, M.METAL_STEEL);
    // Sculpted gold top & bottom accelerator ridge rails
    g.fillBox(11, 34, 238, 18, 37, 478, M.METAL_GOLD);
    g.fillBox(11, -21, 238, 18, -18, 478, M.METAL_GOLD);
    // Recessed dark energy channel floor & upper guide spine
    g.fillBox(0, 28, 232, 10, 33, 452, M.FRAME_DEEP);
    g.fillBox(0, -20, 232, 10, -14, 452, M.FRAME_DEEP);
    // 10 Sequential Glowing Charge Coils (MAT.EMIT_CHARGE -> visible from BOTH dorsal & flank angles!)
    for (let sz = 240; sz <= 465; sz += 24) {
      g.fillBox(6, -1, sz, 19, 13, sz + 11, M.FRAME_DARK);
      g.fillBox(8, 2, sz + 2, 20, 10, sz + 9, M.EMIT_CHARGE);     // Flank capacitor glow coils
      g.fillBox(0, 24, sz + 2, 12, 34, sz + 10, M.EMIT_CHARGE);  // Prominent dorsal sequential charge vents!
      g.fillBox(0, -14, sz + 2, 8, -10, sz + 9, M.EMIT_CHARGE);
    }
    // 3 Monumental Open Focusing Rings encircling the forward barrel (z = +320, +390, +455)
    for (const rz of [320, 390, 455]) {
      g.fillCylinderZ(0, 8, rz, rz + 8, 28, 20, M.ARMOR_DARK_SLATE, 0.75);
      g.fillCylinderZ(0, 8, rz + 2, rz + 6, 29, 25, M.METAL_GOLD, 0.75);
    }
    // Deep Recessed Glowing Emitter Maw (z = +466 .. +494)
    g.fillCylinderZ(0, 6, 466, 494, 23, 14, M.WEAPON_DARK, 0.75);
    g.fillCylinderZ(0, 6, 470, 476, 14, 0, M.EMIT_CHARGE, 0.7); // Blazes during charge & fire!
    g.fillCylinderZ(0, 6, 488, 495, 19, 15, M.METAL_GOLD, 0.75);

    // --- C. MID-HULL MAIN BODY, ARMOR SECTIONS & DEEP TRENCHES (z = -280 .. +185) ---
    // 4 Monumental quiet stepped armor sections separated by deep structural expansion channels!
    const midSections = [
      { z0:  118, z1:  185, xOut: 104, yTop: 56, yBot: -46 },
      { z0:    6, z1:  106, xOut: 110, yTop: 62, yBot: -52 },
      { z0: -112, z1:   -8, xOut: 110, yTop: 62, yBot: -52 },
      { z0: -222, z1: -124, xOut: 106, yTop: 58, yBot: -48 },
      { z0: -280, z1: -234, xOut: 100, yTop: 54, yBot: -45 },
    ];
    for (let si = 0; si < midSections.length; si++) {
      const s = midSections[si];
      g.fillHollowBox(0, s.yBot, s.z0, s.xOut, s.yTop, s.z1, 3, M.HULL_MAIN);
      g.fillBox(18, s.yTop + 1, s.z0 + 3, s.xOut - 14, s.yTop + 5, s.z1 - 3, M.HULL_LIGHT);
      g.fillBox(s.xOut - 3, s.yBot + 10, s.z0, s.xOut, s.yTop - 10, s.z1, M.ARMOR_SLATE);
      g.fillBox(s.xOut - 14, s.yTop + 2, s.z0 + 2, s.xOut - 11, s.yTop + 6, s.z1 - 2, M.METAL_GOLD);
      // Recessed dark sensor/radiator louver bay centered on flank of quiet section
      const midZ = Math.round((s.z0 + s.z1) * 0.5);
      if (s.z1 - s.z0 > 50) {
        g.fillBox(s.xOut - 4, s.yTop - 18, midZ - 14, s.xOut, s.yTop - 11, midZ + 14, M.FRAME_DARK);
        g.fillBox(s.xOut - 2, s.yTop - 15, midZ - 10, s.xOut, s.yTop - 14, midZ + 10, M.EMIT_CYAN);
      }
      // Deep transverse structural expansion channel with exposed ribs & glowing busbars!
      if (si < midSections.length - 1) {
        const ns = midSections[si + 1];
        const gz0 = ns.z1 + 1, gz1 = s.z0 - 1;
        g.fillHollowBox(0, s.yBot + 6, gz0, s.xOut - 10, s.yTop - 6, gz1, 3, M.FRAME_DARK);
        for (let rx = 18; rx < s.xOut - 10; rx += 22) {
          g.fillBox(rx, s.yBot + 4, gz0 + 2, rx + 5, s.yTop - 4, gz1 - 2, M.ARMOR_DARK_SLATE);
        }
        g.fillBox(10, s.yTop - 7, gz0 + 2, s.xOut - 12, s.yTop - 5, gz1 - 2, M.EMIT_CYAN);
        g.fillBox(10, s.yBot + 5, gz0 + 2, s.xOut - 12, s.yBot + 7, gz1 - 2, M.EMIT_CYAN);
      }
    }

    // --- D. VENTRAL KEEL & BELLY ARCHITECTURE (y = -84 .. -38, z = -340 .. +300) ---
    // Dedicated belly spine, exposed structural ribs & ventral radiator bays for low-angle shots!
    addSteppedHullSlices(g, -340, 290, 12, (gr, z0, z1, t) => {
      const arch = Math.sin(t * Math.PI);
      const keelDepth = Math.round(-44 - arch * 40); // Reaches y = -84 at midship!
      const keelWidth = Math.round(14 + arch * 26);
      gr.fillHollowBox(0, keelDepth, z0, keelWidth, -38, z1, 3, M.ARMOR_DARK_SLATE);
      // Ventral split keel central trench
      gr.carveBox(0, keelDepth - 2, z0, 5, keelDepth + 12, z1);
      gr.fillBox(0, keelDepth + 10, z0, 6, keelDepth + 14, z1, M.FRAME_DEEP);
      gr.fillBox(4, keelDepth + 2, z0, 6, keelDepth + 8, z1, M.METAL_GOLD);
      // Exposed periodic ventral cross-ribs every 24 voxels with metallic gold underside lip & cyan radiator slots
      if ((Math.abs(z0) % 24) < 12) {
        gr.fillBox(keelWidth - 2, keelDepth + 6, z0 + 2, keelWidth + 24, -36, z0 + 7, M.FRAME_DARK);
        gr.fillBox(keelWidth + 1, keelDepth + 5, z0 + 3, keelWidth + 21, keelDepth + 7, z0 + 6, M.METAL_GOLD);
        gr.fillBox(keelWidth + 4, keelDepth + 10, z0 + 3, keelWidth + 18, keelDepth + 13, z0 + 6, M.EMIT_CYAN);
      }
    });

    // --- E. DORSAL COMMAND CITADEL & PANORAMIC BRIDGE SUPERSTRUCTURE (z = -210 .. +115, y = +52 .. +132) ---
    g.fillBevelBoxZ(0, 52, -205, 68, 86, 108, 8, M.HULL_MID, 4);
    g.fillBox(16, 86, -185, 58, 92, 92, M.ARMOR_SLATE);
    // Rich aft & flank citadel armor ribs, dark sensor louvers & glowing cyan command strips!
    for (let cz = -188; cz <= 48; cz += 28) {
      g.fillBox(54, 56, cz, 70, 82, cz + 6, M.ARMOR_DARK_SLATE);
      g.fillBox(66, 62, cz + 2, 71, 76, cz + 4, M.METAL_GOLD);
    }
    g.fillBox(12, 62, -208, 52, 74, -203, M.FRAME_DARK);
    g.fillBox(16, 66, -209, 48, 70, -207, M.EMIT_CYAN);
    // Upper Bridge Citadel Tower (houses our 136x136x64 Command Bridge!)
    g.fillBevelBoxZ(0, 74, -145, 52, 114, 96, 6, M.HULL_MAIN, 4);
    g.fillBox(10, 86, -148, 40, 100, -143, M.FRAME_DARK); // Aft citadel observation/radiator bay
    g.fillBox(14, 90, -149, 36, 95, -147, M.EMIT_BLUE_SOFT);
    // Terraced dorsal crown & communication fin masts rising to y = +132
    g.fillBox(0, 114, -135, 36, 124, 72, M.HULL_LIGHT);
    g.fillBox(0, 124, -110, 16, 130, 32, M.ARMOR_SLATE);
    g.fillBox(0, 128, -95, 5, 134, 15, M.METAL_GOLD);
    // Twin vertical dorsal sensor blades
    g.fillBox(22, 114, -120, 26, 138, -76, M.ARMOR_SLATE);
    g.fillBox(23, 136, -114, 25, 140, -82, M.EMIT_CYAN);
    // Sweeping Panoramic Forward Bridge Window Ribbon (z = +88 .. +98, y = +84 .. +104)
    g.carveBox(0, 84, 86, 46, 104, 102);
    g.fillBox(0, 85, 92, 44, 103, 94, M.GLASS_CYAN);
    for (let mx = 8; mx <= 44; mx += 12) {
      g.fillBox(mx, 83, 90, mx + 2, 105, 96, M.FRAME_DARK);
    }
    g.fillBox(0, 104, 86, 48, 110, 104, M.HULL_LIGHT);
    g.fillBox(0, 105, 103, 46, 108, 105, M.METAL_GOLD);
    g.fillBox(0, 86, 82, 36, 98, 86, M.EMIT_BLUE_SOFT);

    // --- F. CANTILEVERED OUTRIGGER WING-SPONSONS & MONUMENTAL HANGAR APPROACH ARCH ---
    // Cross-pylons placed cleanly fore & aft of the wide open Hangar Approach Lane (z = -62 .. +76)!
    for (const pz of [108, -92, -196]) {
      g.fillBox(82, -16, pz - 16, 134, 22, pz + 16, M.FRAME_DARK);
      g.fillBox(86, 18, pz - 12, 130, 25, pz + 12, M.ARMOR_SLATE);
      g.fillBox(88, 25, pz - 4, 128, 28, pz + 4, M.METAL_GOLD);
      g.fillBox(88, -2, pz - 17, 126, 4, pz - 15, M.EMIT_CYAN);
      g.fillBox(88, -2, pz + 15, 126, 4, pz + 17, M.EMIT_CYAN);
    }
    // Sweeping outer detached wing-blades sculpted as 5 crisp stepped architectural armor slabs (ZERO zebra striping!)
    const wingTiers = [
      { z0: -255, z1: -185, xIn: 134, xOut: 168, yTop: 22, yBot: -18 },
      { z0: -184, z1:  -62, xIn: 126, xOut: 184, yTop: 34, yBot: -26 },
      { z0:  -61, z1:   72, xIn: 124, xOut: 188, yTop: 38, yBot: -28 }, // Hosts our open Wing Approach Arch!
      { z0:   73, z1:  124, xIn: 128, xOut: 178, yTop: 30, yBot: -22 },
      { z0:  125, z1:  162, xIn: 134, xOut: 162, yTop: 20, yBot: -14 },
    ];
    for (const wt of wingTiers) {
      g.fillHollowBox(wt.xIn, wt.yBot, wt.z0, wt.xOut, wt.yTop, wt.z1, 3, M.HULL_MAIN);
      g.fillBox(wt.xOut - 3, wt.yBot + 4, wt.z0, wt.xOut, wt.yTop - 4, wt.z1, M.ARMOR_SLATE);
      g.fillBox(wt.xOut - 1, wt.yTop - 5, wt.z0, wt.xOut + 1, wt.yTop - 3, wt.z1, M.METAL_GOLD);
      g.fillBox(wt.xIn - 2, -2, wt.z0, wt.xIn + 1, 2, wt.z1, M.EMIT_CYAN);
      if (wt.xOut - wt.xIn > 22) {
        g.fillBox(wt.xIn + 8, wt.yTop + 1, wt.z0 + 2, wt.xOut - 10, wt.yTop + 4, wt.z1 - 2, M.HULL_LIGHT);
      }
    }
    // Carve GRAND UNOBSTRUCTED HANGAR APPROACH PORTAL ARCH right through the outer wing (z = -56 .. +68)!
    // Leaves sleek cantilevered upper & lower bridge beams with gold arch trim so shuttles & camera fly 100% through open air!
    g.carveBox(114, -22, -56, 200, 26, 68);
    // Crisp dark & gold architectural portal framing around the open Wing Approach Arch!
    g.fillBox(126, 26, -60, 186, 36, 72, M.ARMOR_SLATE);
    g.fillBox(128, 24, -56, 184, 26, 68, M.METAL_GOLD);
    g.fillBox(128, -29, -60, 186, -21, 72, M.ARMOR_DARK_SLATE);
    // Crisp narrow amber approach guide rails along outer & inner arch sill edges (not solid glowing floor!)
    g.fillBox(182, -21, -54, 185, -20, 66, M.EMIT_AMBER);
    g.fillBox(129, -21, -54, 132, -20, 66, M.EMIT_CYAN);
    g.fillBox(124, -24, -62, 186, 32, -56, M.FRAME_DARK);
    g.fillBox(124, -24, 68, 186, 32, 74, M.FRAME_DARK);
    g.fillBox(183, -18, -57, 185, 22, -56, M.EMIT_AMBER);
    g.fillBox(183, -18, 68, 185, 22, 69, M.EMIT_AMBER);
    // Recessed exterior wing-flank architectural louver bays & ribs flanking the portal!
    for (const wz of [-148, -104, 88]) {
      g.fillBox(176, -12, wz, 186, 16, wz + 26, M.FRAME_DARK);
      g.fillBox(178, -8, wz + 4, 184, 12, wz + 22, M.ARMOR_DARK_SLATE);
      g.fillBox(181, -1, wz + 6, 185, 2, wz + 20, M.EMIT_CYAN);
      g.fillBox(178, 16, wz + 2, 185, 19, wz + 24, M.METAL_GOLD);
    }

    // Forward wing-tip spear extensions (echoing the split-prow motif!)
    g.fillBox(136, -6, 155, 154, 12, 215, M.HULL_LIGHT);
    g.fillBox(140, 0, 205, 150, 7, 232, M.METAL_GOLD);
    g.fillBox(142, 2, 170, 148, 5, 224, M.EMIT_AMBER);

    // --- G. RECESSED FLANK HANGAR BAY MOUTH (x = 74..116, z = -150..+120, y = -28..+28) ---
    // Carve huge deep rectangular-chamfered hangar bay opening in the flagship side hull!
    g.carveBox(66, -24, -135, 118, 24, 115);
    // Heavy stepped armored hangar brow & deck lip
    g.fillBox(72, 24, -142, 114, 34, 122, M.ARMOR_SLATE);
    g.fillBox(108, 25, -140, 115, 29, 120, M.METAL_GOLD);
    g.fillBox(72, -32, -142, 114, -24, 122, M.ARMOR_DARK_SLATE);
    // Vertical armored hangar frame columns dividing mouth into grand illuminated entry bays
    for (const hz of [-135, -75, -15, 45, 115]) {
      g.fillBox(96, -26, hz - 4, 112, 26, hz + 4, M.FRAME_DARK);
      g.fillBox(110, -22, hz - 1, 113, 22, hz + 1, M.EMIT_AMBER);
    }
    // Glowing amber & cyan landing runway guide strips on hangar apron lip
    g.fillBox(82, -24, -132, 112, -23, -126, M.EMIT_AMBER);
    g.fillBox(82, -24, 108, 112, -23, 114, M.EMIT_AMBER);
    for (let rz = -110; rz <= 90; rz += 24) {
      g.fillBox(92, -24, rz, 108, -23, rz + 6, M.EMIT_CYAN);
    }
    // Visible recessed interior back-wall bays & interior illumination from exterior
    g.fillBox(62, -24, -136, 67, 24, 116, M.FRAME_DEEP);
    for (let bz = -110; bz <= 90; bz += 40) {
      g.fillBox(66, -18, bz, 70, 16, bz + 20, M.EMIT_BLUE_SOFT);
      // Overhead cross-gantry visible right inside the hangar mouth!
      g.fillBox(66, 16, bz + 8, 108, 22, bz + 14, M.FRAME_DARK);
      g.fillBox(68, 15, bz + 10, 106, 16, bz + 12, M.EMIT_AMBER);
    }

    // --- H. RECESSED AFT PROPULSION COMPLEX (z = -560 .. -260) ---
    // 4 Monumental stepped octagonal-chamfered stern shrouds (clean serene armor slabs, ZERO vertical striping!)
    const aftTiers = [
      { z0: -335, z1: -265, xOut: 98, yTop: 54, yBot: -44 },
      { z0: -405, z1: -338, xOut: 90, yTop: 48, yBot: -39 },
      { z0: -465, z1: -408, xOut: 82, yTop: 42, yBot: -34 },
      { z0: -515, z1: -468, xOut: 74, yTop: 36, yBot: -30 },
    ];
    for (let ai = 0; ai < aftTiers.length; ai++) {
      const a = aftTiers[ai];
      g.fillBevelBoxZ(0, a.yBot, a.z0, a.xOut, a.yTop, a.z1, 10, M.HULL_MID, 3);
      g.fillBox(0, a.yTop + 1, a.z0 + 2, a.xOut - 20, a.yTop + 4, a.z1 - 2, M.HULL_MAIN);
      g.fillBox(a.xOut - 2, a.yBot + 12, a.z0 + 6, a.xOut + 1, a.yTop - 12, a.z1 - 6, M.ARMOR_SLATE);
      if (ai < aftTiers.length - 1) {
        const na = aftTiers[ai + 1];
        g.fillBevelBoxZ(0, na.yBot + 3, na.z1 + 1, na.xOut - 3, na.yTop - 3, a.z0 - 1, 8, M.FRAME_DARK, 3);
      }
    }
    // Sculpted dark aft exhaust shroud backing plate (no flat pale rear wall!)
    g.fillBevelBoxZ(0, -48, -518, 92, 54, -496, 14, M.FRAME_DARK, 0);
    // 3-tier swept, ribbed dorsal stabilizer keel (sculpted aerospace silhouette, no plain box wall!)
    const dorsalFinTiers = [
      { z0: -335, z1: -268, yTop: 84, xW: 11 },
      { z0: -408, z1: -336, yTop: 74, xW: 9  },
      { z0: -482, z1: -409, yTop: 64, xW: 7  },
    ];
    for (const ft of dorsalFinTiers) {
      g.fillBox(0, 44, ft.z0, ft.xW, ft.yTop, ft.z1, M.ARMOR_SLATE);
      g.fillBox(0, ft.yTop, ft.z0 + 4, Math.max(3, ft.xW - 4), ft.yTop + 4, ft.z1 - 4, M.HULL_MAIN);
      g.fillBox(0, ft.yTop + 4, ft.z0 + 8, 3, ft.yTop + 6, ft.z1 - 6, M.METAL_GOLD);
      // Recessed dark cooling slot + cyan conduit stripe along fin flank
      g.fillBox(ft.xW - 2, 52, ft.z0 + 8, ft.xW + 1, ft.yTop - 8, ft.z1 - 8, M.FRAME_DARK);
      g.fillBox(ft.xW - 1, 56, ft.z0 + 12, ft.xW + 1, 58, ft.z1 - 12, M.EMIT_CYAN);
    }
    // 2-tier swept armored aft flank stabilizer wings with dark vents & gold leading trim
    g.fillBox(82, -13, -385, 114, 14, -278, M.ARMOR_SLATE);
    g.fillBox(80, -10, -468, 102, 11, -386, M.ARMOR_SLATE);
    g.fillBox(108, -6, -378, 117, 6, -290, M.METAL_GOLD);
    g.fillBox(97, -5, -458, 105, 5, -392, M.METAL_GOLD);
    g.fillBox(92, -6, -365, 110, 6, -305, M.FRAME_DARK);
    g.fillBox(96, -2, -358, 106, 2, -312, M.EMIT_CYAN);

    // Carve clean aft engine bay recess, then place deep obsidian armored stern bulkhead behind the 9 bells!
    g.carveBox(0, -56, -565, 92, 62, -440);
    g.fillBevelBoxZ(0, -44, -456, 86, 48, -438, 12, M.FRAME_DARK, 0);
    g.fillBox(18, -32, -458, 72, 34, -454, M.FRAME_DEEP);
    // 1) Colossal Central Primary Engine Bell (0, +4, z = -560 .. -506, rOut=35)
    addEngineBell(g, 0, 4, -560, 54, 35, 24, true);
    // 2) Twin Massive Flank Primary Bells (±66, -2, z = -528 .. -482, rOut=26)
    addEngineBell(g, 66, -2, -528, 46, 26, 18, true);
    // 3) Twin Upper Dorsal Trim Bells (±46, +46, z = -478 .. -442, rOut=15)
    addEngineBell(g, 46, 46, -478, 36, 15, 10, false);
    // 4) Twin Lower Ventral Trim Bells (±38, -42, z = -492 .. -456, rOut=14)
    addEngineBell(g, 38, -42, -492, 36, 14, 9, false);
    // 5) Twin Outrigger Wing Vernier Bells (±148, +4, z = -290 .. -252, rOut=16)
    addEngineBell(g, 148, 4, -290, 38, 16, 11, true);

    // --- I. PULSE TURRET PEDESTALS ON FLAGSHIP DECK & WINGS ---
    // Leave generous quiet deck space between turrets so hull plating & muzzles read clearly!
    const turretPedestals = [
      [56, 54, 165],
      [62, 58, 45],
      [66, 58, -75],
      [154, 36, 25],
      [156, 30, -115],
    ];
    for (const [px, py, pz] of turretPedestals) {
      g.fillCylinderY(px, pz, py - 4, py + 4, 14, 0, M.ARMOR_DARK_SLATE, 0.8);
      g.fillCylinderY(px, pz, py + 4, py + 7, 11, 0, M.FRAME_DARK, 0.8);
      g.fillCylinderY(px, pz, py + 2, py + 4, 15, 13, M.METAL_GOLD, 0.8);
    }

    return g.buildMesh();
  }

  // =========================================================================
  // 2. FLAGSHIP PULSE TURRET HEAD (Articulated rotating twin-barrel voxel turret)
  //    26 x 16 x 34 voxels, pivot at (0, 0, 0)
  // =========================================================================
  function buildPulseTurret() {
    const g = new VoxelGrid(true);
    // Stepped chamfered turret housing
    g.fillBevelBoxZ(0, 0, -14, 13, 14, 12, 3, M.HULL_MAIN, 0);
    g.fillBox(0, 12, -10, 10, 16, 8, M.ARMOR_SLATE);
    g.fillBox(8, 2, -12, 14, 10, 8, M.ARMOR_DARK_SLATE);
    g.fillBox(11, 5, -10, 15, 7, 6, M.METAL_GOLD);
    // Glowing capacitor spine on rear housing
    g.fillBox(0, 8, -15, 6, 12, -11, M.EMIT_AMBER);
    // Twin heavy armored pulse barrels extending forward (+Z)
    g.fillBox(4, 4, 10, 10, 10, 32, M.WEAPON_DARK);
    g.fillBox(5, 5, 12, 9, 9, 36, M.METAL_STEEL);
    // Stepped barrel cooling ribs & glowing accelerator coils
    for (let bz = 14; bz <= 30; bz += 6) {
      g.fillBox(3, 3, bz, 11, 11, bz + 2, M.FRAME_DARK);
      g.fillBox(6, 6, bz + 2, 8, 8, bz + 4, M.EMIT_AMBER_HOT);
    }
    // Glowing muzzle mouth
    g.fillBox(6, 6, 35, 8, 8, 37, M.EMIT_CYAN_HOT);
    return g.buildMesh();
  }

  // =========================================================================
  // 3. FLAGSHIP HOVERING PULSE PYLON (Suspended flank tactical turret pod)
  //    22 x 32 x 42 voxels — floating beside flagship hull for layered silhouette!
  // =========================================================================
  function buildHoverPylon() {
    const g = new VoxelGrid(true);
    // Vertical split-wing blade echoing fleet motif
    g.fillBox(0, -14, -18, 8, 14, 16, M.HULL_MAIN);
    g.fillBox(5, -18, -10, 11, 18, 10, M.ARMOR_SLATE);
    g.fillBox(8, -12, -6, 12, 12, 6, M.METAL_GOLD);
    // Hollow vertical core with glowing cyan grav-stabilizer orb
    g.carveBox(0, -6, -6, 6, 6, 6);
    g.fillBox(0, -4, -4, 4, 4, 4, M.EMIT_CYAN_HOT);
    // Upper & lower forward twin pulse barrels
    for (const by of [-10, 8]) {
      g.fillBox(2, by - 2, 12, 7, by + 3, 34, M.WEAPON_DARK);
      g.fillBox(3, by - 1, 20, 6, by + 2, 38, M.METAL_STEEL);
      g.fillBox(4, by, 36, 5, by + 1, 39, M.EMIT_AMBER_HOT);
    }
    return g.buildMesh();
  }

  // =========================================================================
  // 4. CLOSE-ESCORT FRIGATE ("Bastion-Class" 近卫舰) — 184 x 106 x 64 voxels
  //    Length = 184 (1/6.09 of flagship!), muscular chamfered bastion armor, 4 CIWS mounts
  // =========================================================================
  function buildCloseEscort() {
    const g = new VoxelGrid(true);

    // Bold 2-tier chamfered split fortress prow (monumental quiet armor slabs, ZERO vertical striping!)
    const ceProwTiers = [
      { z0: 24, z1: 64, xIn: 7, xOut: 38, yTop: 19, yBot: -17, bev: 5 },
      { z0: 65, z1: 93, xIn: 9, xOut: 26, yTop: 13, yBot: -12, bev: 4 },
    ];
    for (const p of ceProwTiers) {
      g.fillBevelBoxZ(p.xIn, p.yBot, p.z0, p.xOut, p.yTop, p.z1, p.bev, M.HULL_MAIN, 3);
      g.fillBox(p.xIn + 3, p.yTop + 1, p.z0 + 2, p.xOut - p.bev - 1, p.yTop + 3, p.z1 - 2, M.HULL_LIGHT);
      g.fillBox(p.xIn, p.yTop - 1, p.z0 + 1, p.xIn + 2, p.yTop + 2, p.z1 - 1, M.METAL_GOLD);
      // Recessed dark lower chine + crisp flank radiator louver
      g.fillBox(p.xOut - 3, p.yBot + p.bev, p.z0 + 4, p.xOut, p.yBot + p.bev + 6, p.z1 - 4, M.ARMOR_SLATE);
      g.fillBox(p.xOut - 2, -2, p.z0 + 6, p.xOut + 1, 3, p.z1 - 6, M.FRAME_DARK);
      g.fillBox(p.xIn - 2, -2, p.z0, p.xIn, 2, p.z1, M.EMIT_CYAN);
    }
    // Central recessed armored prow ram-block & forward tactical sensor bar
    g.fillBox(0, -10, 20, 8, 10, 74, M.FRAME_DARK);
    g.fillBox(0, -2, 66, 6, 3, 76, M.EMIT_CYAN);

    // Monumental chamfered octagonal main armored hull (quiet cohesive armor volume, NO chopped brick tiers!)
    g.fillBevelBoxZ(0, -21, -56, 44, 23, 32, 7, M.HULL_MAIN, 3);
    // Raised quiet dorsal carapace & twin refined gold deck spine rails
    g.fillBox(10, 23, -48, 35, 26, 26, M.HULL_LIGHT);
    g.fillBox(35, 22, -46, 37, 25, 24, M.METAL_GOLD);
    // Clean recessed transverse armor expansion channel strictly inside main body (z = -17..-11)
    g.fillBevelBoxZ(0, -19, -17, 42, 21, -11, 6, M.FRAME_DARK, 3);
    g.fillBox(8, 20, -16, 36, 22, -12, M.EMIT_CYAN);
    // Recessed dark flank sensor/cooling trench along the lower hull shoulder
    g.fillBox(41, -12, -48, 45, -6, 24, M.ARMOR_SLATE);
    g.fillBox(42, -9, -40, 45, -7, 16, M.FRAME_DARK);

    // Sculpted Cantilevered Side Armor Cheek Shields (x = 46..53) mounted on twin dark pylons!
    // Creates genuine layered negative-space slot without floating over a body crack!
    for (const pz of [-28, 10]) {
      g.fillBox(38, -6, pz, 48, 7, pz + 10, M.FRAME_DARK);
      g.fillBox(40, 7, pz + 2, 47, 9, pz + 8, M.ARMOR_SLATE);
    }
    // Chamfered outboard armor shield pod + stepped forward cap + inset dark cooling slot + refined gold edge!
    g.fillBevelBoxZ(46, -12, -36, 53, 14, 24, 3, M.ARMOR_SLATE, 0);
    g.fillBevelBoxZ(47, -8, 25, 52, 10, 38, 2, M.HULL_MAIN, 0);
    g.fillBox(51, -4, -28, 54, 4, 16, M.FRAME_DARK);       // Recessed horizontal engineering intake slot
    g.fillBox(52, -1, -22, 54, 1, 10, M.EMIT_CYAN);        // Subtle glowing conduit core inside slot
    g.fillBox(50, 10, -32, 54, 12, 20, M.METAL_GOLD);      // Refined 2-voxel upper champagne-gold trim bar
    g.fillBox(50, -10, -32, 54, -8, 20, M.METAL_GOLD);     // Refined lower edge accent

    // Compact raised dorsal citadel & panoramic armored bridge slit (y = +22 .. +38)
    g.fillBevelBoxZ(0, 22, -42, 22, 36, 16, 4, M.HULL_MID, 0);
    g.fillBox(0, 30, 14, 16, 33, 18, M.EMIT_CYAN);
    g.fillBox(0, 36, -34, 8, 40, 6, M.METAL_GOLD);
    // Ventral armored keel spine
    g.fillBevelBoxZ(0, -29, -50, 14, -19, 22, 3, M.ARMOR_DARK_SLATE, 0);
    g.fillBox(0, -31, -34, 3, -28, 10, M.METAL_GOLD);

    // 4 Raised CIWS Sponson Pedestals resting 100% flush on the flat armored dorsal deck (x <= 37)!
    for (const [cx, cy, cz] of [[24, 23, 28], [30, 23, -34]]) {
      g.fillBox(cx - 6, cy - 2, cz - 6, cx + 6, cy + 2, cz + 6, M.ARMOR_DARK_SLATE);
      g.fillBox(cx - 5, cy + 2, cz - 5, cx + 5, cy + 3, cz + 5, M.METAL_GOLD);
    }

    // Tapered 2-Step Chamfered Octagonal Aft Hull + Sculpted Flank Exhaust Cowlings (ZERO flat square back!)
    g.fillBevelBoxZ(0, -18, -70, 37, 19, -54, 7, M.HULL_MID, 3);
    g.fillBevelBoxZ(0, -15, -84, 31, 16, -70, 6, M.ARMOR_SLATE, 3);
    // Sculpted outboard aft heat-sink cowlings smoothly stepping mid-hull down to stern
    g.fillBevelBoxZ(31, -10, -68, 42, 10, -46, 3, M.ARMOR_DARK_SLATE, 0);
    g.fillBox(35, -3, -64, 43, 3, -52, M.FRAME_DEEP);
    g.fillBox(39, -1, -62, 43, 1, -54, M.EMIT_CYAN);
    g.fillBox(33, 9, -66, 40, 11, -48, M.METAL_GOLD);
    // Dark recessed stern exhaust shroud + stepped swept dorsal/ventral stabilizer fins!
    g.fillBevelBoxZ(0, -15, -86, 30, 15, -76, 6, M.FRAME_DARK, 0);
    g.fillBox(0, 14, -74, 5, 29, -54, M.ARMOR_SLATE);
    g.fillBox(0, 14, -84, 4, 23, -74, M.ARMOR_SLATE);
    g.fillBox(0, 28, -72, 2, 31, -56, M.METAL_GOLD);
    g.fillBox(0, -25, -80, 4, -14, -56, M.ARMOR_DARK_SLATE);
    g.carveBox(0, -14, -94, 34, 14, -76);
    addEngineBell(g, 0, 0, -92, 22, 13, 9, true);
    addEngineBell(g, 24, 0, -88, 20, 9, 6, false);

    return g.buildMesh();
  }

  // =========================================================================
  // 5. CLOSE-ESCORT CIWS RAPID-FIRE TURRET (Articulated point-defense cluster)
  //    14 x 11 x 22 voxels — compact shield dome + twin-pair steel barrels!
  // =========================================================================
  function buildCIWSTurret() {
    const g = new VoxelGrid(true);
    g.fillBox(0, 0, -6, 6, 8, 6, M.ARMOR_DARK_SLATE);
    g.fillBox(4, 1, -5, 7, 7, 5, M.HULL_LIGHT);
    g.fillBox(0, 8, -4, 4, 10, 3, M.METAL_GOLD);
    g.fillBox(0, 4, -7, 3, 6, -5, M.EMIT_AMBER);
    // Quad rapid-fire steel gun barrels (2 per side, staggered)
    g.fillBox(2, 5, 5, 3, 6, 18, M.METAL_STEEL);
    g.fillBox(4, 3, 5, 5, 4, 16, M.METAL_STEEL);
    g.fillBox(2, 5, 18, 3, 6, 19, M.EMIT_AMBER_HOT);
    return g.buildMesh();
  }

  // =========================================================================
  // 6. VANGUARD MISSILE DESTROYER ("Lance-Class" 前卫舰) — 216 x 136 x 46 voxels
  //    Length = 216 (1/5.18 of flagship!), long, sleek, wide cantilevered missile pods!
  // =========================================================================
  function buildVanguardEscort() {
    const g = new VoxelGrid(true);

    // Long, razor-sleek bifurcated twin needle-prow sculpted as 4 clean stepped lance segments (ZERO zebra striping!)
    const vgProwTiers = [
      { z0: 16, z1: 42, xIn:  7, xOut: 28, yTop: 14, yBot: -12 },
      { z0: 43, z1: 68, xIn:  9, xOut: 24, yTop: 11, yBot: -10 },
      { z0: 69, z1: 92, xIn: 10, xOut: 20, yTop:  8, yBot:  -7 },
      { z0: 93, z1:109, xIn: 11, xOut: 17, yTop:  5, yBot:  -4 },
    ];
    for (const p of vgProwTiers) {
      g.fillBox(p.xIn, p.yBot, p.z0, p.xOut, p.yTop, p.z1, M.HULL_MAIN);
      g.fillBox(p.xIn + 2, p.yTop + 1, p.z0, p.xOut - 2, p.yTop + 2, p.z1, M.HULL_LIGHT);
      g.fillBox(p.xIn, p.yTop, p.z0, p.xIn + 1, p.yTop + 2, p.z1, M.METAL_GOLD);
      g.fillBox(p.xIn - 1, -1, p.z0, p.xIn, 1, p.z1, M.EMIT_CYAN);
    }
    // Cross-struts bridging the slender twin prow prongs
    for (const cz of [44, 74]) {
      g.fillBox(0, -3, cz, 12, 3, cz + 4, M.FRAME_DARK);
      g.fillBox(0, 1, cz + 1, 10, 2, cz + 3, M.METAL_GOLD);
    }

    // Sleek Low-Profile Central Fuselage in 3 crisp stepped armor sections!
    const vgMidTiers = [
      { z0: -12, z1:  24, xOut: 30, yTop: 19, yBot: -16 },
      { z0: -56, z1: -13, xOut: 32, yTop: 21, yBot: -17 },
      { z0: -92, z1: -57, xOut: 26, yTop: 16, yBot: -14 },
    ];
    for (const m of vgMidTiers) {
      g.fillHollowBox(0, m.yBot, m.z0, m.xOut, m.yTop, m.z1, 3, M.HULL_MAIN);
      g.fillBox(4, m.yTop + 1, m.z0, m.xOut - 4, m.yTop + 3, m.z1, M.HULL_LIGHT);
      g.fillBox(0, m.yTop + 2, m.z0, 3, m.yTop + 4, m.z1, M.ARMOR_SLATE);
      g.fillBox(0, m.yTop + 4, m.z0, 1, m.yTop + 5, m.z1, M.EMIT_CYAN);
    }
    // Low streamlined command deck
    g.fillBox(0, 18, -36, 14, 24, 6, M.ARMOR_SLATE);
    g.fillBox(0, 20, 6, 12, 22, 8, M.EMIT_CYAN);
    g.fillBox(0, 24, -28, 6, 26, -4, M.METAL_GOLD);

    // Swept Cantilevered Wing Struts connecting central body to wide Outboard Missile Pods (x = 24..46)
    // Leaves huge open see-through negative space between fuselage and missile racks!
    g.fillBox(22, -4, -26, 48, 5, -10, M.FRAME_DARK);
    g.fillBox(24, 5, -24, 46, 7, -12, M.ARMOR_SLATE);
    g.fillBox(22, -4, 18, 48, 5, 32, M.FRAME_DARK);
    g.fillBox(24, 5, 20, 46, 7, 30, M.ARMOR_SLATE);
    g.fillBox(26, 0, -28, 46, 2, -26, M.EMIT_CYAN);

    // WIDE OUTBOARD MISSILE LAUNCH PODS (x = 44..68 -> 136 wide!, z = -44..+62)
    // Repeating directional array of 6 recessed missile cells per pod!
    g.fillHollowBox(44, -12, -44, 66, 12, 58, 3, M.ARMOR_SLATE);
    g.fillBox(46, 12, -40, 64, 15, 54, M.HULL_MAIN);
    g.fillBox(63, -8, -38, 68, 8, 56, M.HULL_LIGHT);
    g.fillBox(65, 6, -34, 68, 9, 58, M.METAL_GOLD);
    // Forward sleek stabilizer spike on outer pod edge
    g.fillBox(58, -3, 58, 66, 4, 82, M.HULL_LIGHT);
    g.fillBox(60, 0, 74, 64, 3, 90, M.METAL_GOLD);

    // Carve 6 repeating missile launch slots along each pod (visible from top, side & front!)
    for (let i = 0; i < 6; i++) {
      const sz = -34 + i * 15;
      // Recessed dark launch cell opening upward & outward
      g.carveBox(48, 2, sz, 60, 17, sz + 9);
      g.fillBox(47, 1, sz - 1, 61, 14, sz, M.FRAME_DARK); // Divider rib
      g.fillBox(47, 1, sz + 10, 61, 14, sz + 11, M.FRAME_DARK);
      g.fillBox(48, 1, sz, 60, 3, sz + 9, M.FRAME_DEEP);
      // Visible tucked voxel missile tip peeking inside each bay!
      g.fillBox(52, 4, sz + 2, 56, 11, sz + 7, M.MISSILE_BODY);
      g.fillBox(53, 11, sz + 3, 55, 13, sz + 6, M.MISSILE_WARHEAD);
      // Amber armed-bay indicator bar
      g.fillBox(61, 11, sz + 2, 62, 13, sz + 7, M.EMIT_AMBER);
    }

    // Swept aft tail fins & 3 recessed engine bells (z = -108 .. -82)
    g.fillBox(14, -4, -104, 34, 4, -74, M.ARMOR_SLATE);
    g.fillBox(32, -8, -106, 36, 10, -76, M.METAL_GOLD);
    g.carveBox(0, -14, -110, 30, 14, -88);
    addEngineBell(g, 0, 0, -108, 20, 10, 7, true);
    addEngineBell(g, 21, 0, -102, 18, 8, 5, false);

    return g.buildMesh();
  }

  // =========================================================================
  // 7. CARRIER SHUTTLE ("Dart-Class" 小艇) — 28 x 18 x 9 voxels
  //    Length = 28 (1/40 of flagship!) — concise distillation of fleet motif!
  // =========================================================================
  function buildShuttle() {
    const g = new VoxelGrid(true);
    // Split twin nose prongs (z = +5 .. +14)
    g.fillBox(2, -2, 5, 4, 2, 14, M.HULL_LIGHT);
    g.fillBox(2, 1, 8, 3, 2, 14, M.SHUTTLE_ACCENT);
    // Central sleek fuselage (z = -12 .. +9)
    g.fillBox(0, -3, -12, 5, 3, 8, M.HULL_MAIN);
    g.fillBox(0, 3, -6, 3, 4, 4, M.ARMOR_SLATE);
    // Recessed glowing cockpit canopy
    g.fillBox(0, 2, 4, 2, 4, 8, M.EMIT_CYAN);
    // Stubby stepped swept wings (x = 5..9) with dark slot
    g.fillBox(5, -2, -9, 9, 1, 2, M.ARMOR_SLATE);
    g.fillBox(8, -1, -7, 9, 1, 3, M.METAL_GOLD);
    g.fillBox(5, 0, -5, 6, 1, 1, M.FRAME_DARK);
    // Twin aft recessed micro-thrusters
    g.fillBox(1, -2, -14, 4, 1, -12, M.FRAME_DARK);
    g.fillBox(2, -1, -14, 3, 0, -13, M.EMIT_CYAN_HOT);
    return g.buildMesh();
  }

  // =========================================================================
  // 8. VOXEL MISSILE ENTITY — 18 x 5 x 5 voxels (exact 1-unit voxel grid!)
  // =========================================================================
  function buildMissile() {
    const g = new VoxelGrid(false);
    // Fuselage (3x3x13)
    g.fillBox(-1, -1, -8, 1, 1, 5, M.MISSILE_BODY);
    g.fillBox(-1, -1, -3, 1, 1, -1, M.ARMOR_DARK_SLATE);
    // Seeker warhead tip (+Z)
    g.fillBox(-1, -1, 6, 1, 1, 7, M.MISSILE_WARHEAD);
    g.set(0, 0, 8, M.MISSILE_WARHEAD);
    g.set(0, 0, 9, M.EMIT_AMBER_HOT);
    // Cruciform stabilizer fins at rear (-Z)
    g.fillBox(-2, 0, -8, 2, 0, -5, M.METAL_STEEL);
    g.fillBox(0, -2, -8, 0, 2, -5, M.METAL_STEEL);
    // Glowing exhaust booster throat
    g.fillBox(-1, -1, -9, 1, 1, -9, M.FRAME_DARK);
    g.set(0, 0, -9, M.EMIT_AMBER_HOT);
    return g.buildMesh({ skipAO: true });
  }

  App.ShipModels = {
    buildAll() {
      const t0 = performance.now();
      const flagship = buildFlagship();
      const pulseTurret = buildPulseTurret();
      const hoverPylon = buildHoverPylon();
      const closeEscort = buildCloseEscort();
      const ciwsTurret = buildCIWSTurret();
      const vanguardEscort = buildVanguardEscort();
      const shuttle = buildShuttle();
      const missile = buildMissile();
      const dt = (performance.now() - t0).toFixed(1);
      console.log(`[ShipModels] Built in ${dt}ms`, {
        flagship: flagship.stats,
        closeEscort: closeEscort.stats,
        vanguardEscort: vanguardEscort.stats,
      });
      return {
        flagship,
        pulseTurret,
        hoverPylon,
        closeEscort,
        ciwsTurret,
        vanguardEscort,
        shuttle,
        missile,
      };
    },
  };
})(window.App);
