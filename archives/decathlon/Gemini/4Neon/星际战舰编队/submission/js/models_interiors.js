// js/models_interiors.js - Four True 1-Unit Voxel Monumental Interior Concept Spaces:
// 1) Command Bridge (136 x 136 x 64) + Animated Holographic Fleet Display
// 2) Power Core Atrium (256 x 256 x 260) + 5 Counter-Rotating Segmented Gimbal Rings
// 3) Through-Going Shuttle Hangar (384 x 124 x 70) + Abstract Overhead Maintenance Rigs
// 4) Energy Loading & Conduit Corridor (360 x 108 x 76) + Advancing Energy Blocks & Abstract Clamps
window.App = window.App || {};

(function (App) {
  const VoxelGrid = App.VoxelGrid;
  const M = App.MAT;

  // =========================================================================
  // 1. WIDE COMMAND BRIDGE (136 wide x 136 deep x 64 high)
  //    x: [-68, +68], y: [0, 64], z: [-68, +68] (+Z = Panoramic Forward Viewport!)
  // =========================================================================
  function buildBridge() {
    const g = new VoxelGrid(true);

    // Main reflective obsidian-slate command floor (y = 0..2)
    g.fillBox(0, 0, -68, 68, 2, 68, M.BRIDGE_DECK);
    // Subtle glowing recessed radial floor guide lines converging on Central Nexus
    for (let z = -60; z <= 58; z += 18) {
      g.fillBox(22, 2, z, 64, 2, z + 1, M.FRAME_DARK);
    }
    g.fillBox(0, 2, -64, 2, 2, 60, M.EMIT_CYAN);
    g.fillBox(18, 2, -64, 19, 2, 54, M.METAL_GOLD);

    // --- CENTRAL COMMAND NEXUS (x = 0, z = +6, y = 2..14) ---
    g.fillCylinderY(0, 6, 3, 5, 24, 0, M.ARMOR_DARK_SLATE, 0.85);
    g.fillCylinderY(0, 6, 5, 6, 25, 23, M.METAL_GOLD, 0.85);
    g.fillCylinderY(0, 6, 6, 8, 18, 0, M.ARMOR_SLATE, 0.85);
    g.fillCylinderY(0, 6, 8, 9, 19, 17, M.EMIT_CYAN, 0.85);
    g.fillCylinderY(0, 6, 9, 12, 11, 0, M.FRAME_DARK, 0.85);
    // Crisp dark projector lens with subtle glowing inner ring (doesn't blow out hologram above!)
    g.fillCylinderY(0, 6, 12, 13, 9, 7, M.METAL_GOLD, 0.85);
    g.fillCylinderY(0, 6, 12, 13, 7, 5, M.EMIT_CYAN, 0.85);
    g.fillCylinderY(0, 6, 12, 13, 5, 0, M.FRAME_DEEP, 0.85);

    // Suspended Overhead Holographic Projector Halo (y = 46..50, r = 22 — crisp architectural rim!)
    g.fillCylinderY(0, 6, 46, 50, 23, 19, M.ARMOR_DARK_SLATE, 0.85);
    g.fillCylinderY(0, 6, 46, 47, 24, 21, M.METAL_GOLD, 0.85);
    g.fillCylinderY(0, 6, 45, 45, 20, 19, M.EMIT_BLUE_SOFT, 0.85);
    // 4 Sweeping Ceiling Support Arches suspending the Nexus Halo
    g.fillStrut([18, 48, -10], [42, 60, -28], 2, M.FRAME_DARK);
    g.fillStrut([18, 48, 22], [42, 60, 42], 2, M.FRAME_DARK);

    // --- THREE TERRACED SIDE CONTROL PLATFORMS (Port & Starboard) ---
    // Tier 1 (inner-low, x = 28..42, y = 3..6), Tier 2 (mid, x = 42..56, y = 3..14), Tier 3 (upper gallery, x = 54..66, y = 24..28)
    g.fillBox(28, 3, -58, 42, 5, 48, M.ARMOR_DARK_SLATE);
    g.fillBox(28, 5, -58, 29, 6, 48, M.METAL_GOLD);
    g.fillBox(42, 3, -62, 58, 13, 52, M.FRAME_DARK);
    g.fillBox(42, 13, -62, 43, 14, 52, M.EMIT_CYAN);
    g.fillBox(44, 13, -60, 58, 14, 50, M.BRIDGE_DECK);
    // Upper cantilevered observation balcony (y = 26..29, x = 52..66)
    g.fillBox(52, 26, -62, 66, 29, 44, M.ARMOR_SLATE);
    g.fillBox(51, 29, -62, 52, 32, 44, M.GLASS_CYAN); // Voxel glass balustrade!
    g.fillBox(51, 28, -62, 52, 29, 44, M.METAL_GOLD);

    // Rows of Voxel Control Consoles + Floating Translucent Display Panels along Tiers 1, 2 & 3!
    const addConsoleBank = (cx, cy, cz, faceInward = true) => {
      // Console base & slanted desk
      g.fillBox(cx, cy, cz - 7, cx + 6, cy + 4, cz + 7, M.FRAME_DARK);
      g.fillBox(cx + 1, cy + 4, cz - 6, cx + 5, cy + 6, cz + 6, M.HULL_MID);
      // Glowing cyan & amber voxel console interface strip
      const gx = faceInward ? cx : cx + 5;
      g.fillBox(gx, cy + 5, cz - 5, gx + 1, cy + 6, cz + 5, M.EMIT_CYAN);
      g.fillBox(gx, cy + 6, cz - 2, gx + 1, cy + 6, cz + 2, M.EMIT_AMBER);
      // Floating translucent holographic display panels suspended above console!
      const hx = faceInward ? cx - 2 : cx + 7;
      g.fillBox(hx, cy + 9, cz - 6, hx, cy + 15, cz + 6, M.HOLO_CYAN);
      g.fillBox(hx, cy + 11, cz - 4, hx, cy + 13, cz + 1, M.GLASS_AMBER);
    };

    for (const cz of [-46, -24, -2, 20, 40]) {
      addConsoleBank(31, 6, cz, true);
      addConsoleBank(45, 14, cz, true);
    }
    for (const cz of [-42, -16, 10, 32]) {
      addConsoleBank(56, 30, cz, true);
    }

    // --- OUTER SIDE BULKHEAD WALLS, VERTICAL RIBS & VAULTED CEILING ---
    g.fillBox(65, 0, -68, 68, 64, 64, M.FRAME_DARK);
    g.fillBox(0, 0, -68, 68, 64, -64, M.FRAME_DARK); // Aft bulkhead behind camera
    // Aft grand structural archway & amber tactical status display wall
    g.fillBox(0, 8, -63, 38, 42, -62, M.ARMOR_DARK_SLATE);
    g.fillBox(4, 14, -62, 34, 34, -61, M.FRAME_DEEP);
    g.fillBox(8, 20, -61, 30, 28, -60, M.EMIT_BLUE_SOFT);
    g.fillBox(6, 18, -61, 32, 19, -60, M.METAL_GOLD);

    // 6 Monumental Stepped Cross-Arches spanning ceiling & side walls (z = -56..+56)
    for (let az = -56; az <= 56; az += 22) {
      // Heavy stepped side wall buttress
      g.fillBox(60, 0, az - 3, 66, 56, az + 3, M.HULL_MID);
      g.fillBox(58, 14, az - 2, 60, 52, az + 2, M.ARMOR_SLATE);
      // Diagonal haunch up to vaulted roof
      g.fillStrut([60, 46, az], [40, 60, az], 3, M.HULL_MID);
      // Overhead spanning bridge truss across full 136-voxel width!
      g.fillBox(0, 58, az - 3, 46, 63, az + 3, M.ARMOR_DARK_SLATE);
      g.fillBox(0, 56, az - 1, 44, 57, az + 1, M.METAL_GOLD);
      // Recessed soft ceiling cove lighting between arches
      if (az < 45) {
        g.fillBox(14, 62, az + 5, 42, 64, az + 17, M.FRAME_DEEP);
        g.fillBox(20, 61, az + 8, 36, 62, az + 14, M.EMIT_BLUE_SOFT);
      }
    }
    // Ceiling outer deck cap
    g.fillBox(0, 62, -68, 68, 64, 62, M.FRAME_DARK);

    // --- MASSIVE PANORAMIC FORWARD VIEWPORT (z = +62 .. +68) ---
    // Sweeping low armored sill (y = 0..10) + cantilevered brow hood (y = 52..64)
    g.fillBox(0, 0, 62, 66, 10, 68, M.ARMOR_SLATE);
    g.fillBox(0, 10, 61, 64, 12, 67, M.METAL_GOLD);
    g.fillBox(0, 52, 60, 66, 64, 68, M.HULL_MID);
    g.fillBox(0, 50, 62, 64, 52, 67, M.METAL_GOLD);
    // Crisp dark architectural window mullions dividing panoramic view (leaving wide open view!)
    for (const mx of [24, 48, 64]) {
      g.fillBox(mx - 2, 10, 62, mx + 2, 52, 68, M.FRAME_DARK);
      g.fillBox(mx - 1, 12, 61, mx + 1, 50, 62, M.METAL_GOLD);
    }
    // Translucent 1-voxel glass panes across the viewport!
    g.fillBox(0, 12, 65, 62, 50, 65, M.GLASS_CYAN);
    // Re-stamp mullions cleanly through glass
    for (const mx of [24, 48]) {
      g.fillBox(mx - 2, 10, 62, mx + 2, 52, 68, M.FRAME_DARK);
    }
    // Leave forward outer edge clear so live space fleet shines right through!

    return g.buildMesh();
  }

  // Animated 3D Holographic Fleet Tactical Display hovering over Bridge Nexus
  function buildBridgeHologram() {
    const g = new VoxelGrid(false);
    // Miniature glowing voxel flagship silhouette at center (z = -6..+10)
    g.fillBox(-2, 0, -6, 2, 1, 4, M.HOLO_CYAN);
    g.fillBox(-3, 0, 2, -2, 1, 10, M.HOLO_CYAN); // Split prow!
    g.fillBox(2, 0, 2, 3, 1, 10, M.HOLO_CYAN);
    g.fillBox(-5, 0, -4, 5, 0, 2, M.HOLO_CYAN); // Outrigger wings
    g.fillBox(-1, 2, -2, 1, 2, 2, M.GLASS_AMBER); // Crisp amber citadel beacon on holo flagship (no whiteout!)

    // Surrounding hologram escort formation blips (strict 1-voxel holo markers!)
    const escorts = [
      [-9, 2, 8], [9, 2, 8], [-12, -2, 2], [12, -2, 2],
      [-7, 3, -6], [7, 3, -6], [-14, 1, -8], [14, 1, -8],
      [-5, -3, 12], [5, -3, 12], [0, 4, 14], [-10, -1, 14], [10, -1, 14],
      [-15, 0, -1], [15, 0, -1], [-8, -2, -11], [8, -2, -11],
    ];
    for (const [ex, ey, ez] of escorts) {
      g.fillBox(ex, ey, ez - 1, ex, ey, ez + 1, M.HOLO_CYAN);
    }
    // Approaching Asteroid Cluster holographic amber warning targets ahead!
    const targets = [
      [2, 2, 18], [-4, -1, 20], [6, 0, 21], [-2, 3, 22], [4, -2, 19],
    ];
    for (const [tx, ty, tz] of targets) {
      g.fillBox(tx, ty, tz, tx + 1, ty + 1, tz + 1, M.GLASS_AMBER);
    }
    // Thin circular tactical horizon ring around holo table
    g.fillCylinderY(0, 4, -3, -3, 17, 16, M.HOLO_CYAN, 0.0);
    return g.buildMesh({ skipAO: true });
  }

  // =========================================================================
  // 2. MULTI-TIER POWER CORE ATRIUM (256 wide x 256 deep x 260 high)
  //    x: [-128, +128], y: [-130, +130], z: [-128, +128]
  // =========================================================================
  function buildPowerCoreAtrium() {
    const g = new VoxelGrid(true);

    // --- OUTER CAVERNOUS OCTAGONAL CHAMBER WALLS (r = 116..126, y = -130..+130) ---
    // Build outer shell in vertical bands with recessed structural ribs & deep shadow pockets
    g.fillCylinderY(0, 0, -130, 130, 126, 118, M.FRAME_DARK, 0.85);
    // Floor & ceiling caps far below/above
    g.fillCylinderY(0, 0, -130, -124, 126, 0, M.FRAME_DEEP, 0.85);
    g.fillCylinderY(0, 0, 124, 130, 126, 0, M.FRAME_DEEP, 0.85);

    // 8 Colossal Vertical Wall Buttress Columns rising all 260 voxels!
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + Math.PI / 8;
      const px = Math.round(Math.cos(ang) * 110);
      const pz = Math.round(Math.sin(ang) * 110);
      if (px < -4) continue;
      g.fillBox(px - 8, -126, pz - 8, px + 8, 126, pz + 8, M.ARMOR_DARK_SLATE);
      // Vertical glowing cyan power vein running up inner edge of each buttress!
      const ix = Math.round(Math.cos(ang) * 101);
      const iz = Math.round(Math.sin(ang) * 101);
      g.fillBox(ix - 1, -120, iz - 1, ix + 1, 120, iz + 1, M.EMIT_CYAN);
    }

    // --- 6 STACKED CIRCULAR/OCTAGONAL GALLERY PLATFORMS (y = -100, -60, -20, +20, +60, +100) ---
    // Monumental 180-voxel open cathedral void around central core (r < 90 completely open!)
    const tierYs = [-100, -60, -20, 20, 60, 100];
    for (let ti = 0; ti < tierYs.length; ti++) {
      const ty = tierYs[ti];
      const rIn = ti % 2 === 0 ? 90 : 97; // Wide airy staggered gallery rings reveal full 6-story cathedral height!
      // Stepped main gallery deck & armored underside flange
      g.fillCylinderY(0, 0, ty, ty + 3, 118, rIn, M.HULL_MID, 0.85);
      g.fillCylinderY(0, 0, ty - 3, ty - 1, 118, rIn + 5, M.ARMOR_DARK_SLATE, 0.85);
      // Golden safety trim & crisp recessed under-deck accent ring
      g.fillCylinderY(0, 0, ty + 3, ty + 4, rIn + 2, rIn, M.METAL_GOLD, 0.85);
      g.fillCylinderY(0, 0, ty - 2, ty - 1, rIn + 6, rIn + 4, M.EMIT_CYAN, 0.85);
      // Translucent voxel safety railings on inner edge
      g.fillCylinderY(0, 0, ty + 4, ty + 7, rIn + 1, rIn, M.GLASS_CYAN, 0.85);

      // Cantilevered inward observation balconies jutting toward core every 90 deg (clear of r <= 80 camera lane!)
      for (let b = 0; b < 4; b++) {
        const ang = (b * Math.PI) / 2 + (ti % 2) * (Math.PI / 4);
        const bx = Math.round(Math.cos(ang) * (rIn - 3));
        const bz = Math.round(Math.sin(ang) * (rIn - 3));
        if (bx < -10) continue;
        g.fillBox(bx - 9, ty - 2, bz - 9, bx + 9, ty + 3, bz + 9, M.ARMOR_SLATE);
        g.fillBox(bx - 8, ty + 3, bz - 8, bx + 8, ty + 4, bz + 8, M.METAL_GOLD);
      }
    }

    // --- MASSIVE RADIAL/DIAGONAL STRUCTURAL PYLONS SPANNING THE VOID ---
    // Connects outer walls (r = 114) diagonally to upper/lower core collars (r = 28)!
    const pylonConfigs = [
      { yOut: -96, yIn: -54, ang: 0.35 },
      { yOut: -96, yIn: -54, ang: -0.35 },
      { yOut: -20, yIn: -42, ang: 1.15 },
      { yOut: -20, yIn: -42, ang: -1.15 },
      { yOut: 20,  yIn: 42,  ang: 0.55 },
      { yOut: 20,  yIn: 42,  ang: -0.55 },
      { yOut: 96,  yIn: 54,  ang: 1.25 },
      { yOut: 96,  yIn: 54,  ang: -1.25 },
    ];
    for (const p of pylonConfigs) {
      const x0 = Math.round(Math.cos(p.ang) * 112);
      const z0 = Math.round(Math.sin(p.ang) * 112);
      const x1 = Math.round(Math.cos(p.ang) * 26);
      const z1 = Math.round(Math.sin(p.ang) * 26);
      g.fillStrut([x0, p.yOut, z0], [x1, p.yIn, z1], 4, M.HULL_MID);
      g.fillStrut([x0, p.yOut + 5, z0], [x1, p.yIn + 5, z1], 1, M.METAL_GOLD);
      g.fillStrut([x0, p.yOut - 5, z0], [x1, p.yIn - 5, z1], 1, M.EMIT_CYAN);
    }

    // --- TOWERING CENTRAL POWER CORE (y = -126 .. +126) ---
    // Upper & lower monumental armored containment collars
    g.fillCylinderY(0, 0, -126, -86, 36, 18, M.ARMOR_DARK_SLATE, 0.8);
    g.fillCylinderY(0, 0, -90, -82, 38, 30, M.HULL_MAIN, 0.8);
    g.fillCylinderY(0, 0, -83, -80, 39, 34, M.METAL_GOLD, 0.8);

    g.fillCylinderY(0, 0, 86, 126, 36, 18, M.ARMOR_DARK_SLATE, 0.8);
    g.fillCylinderY(0, 0, 82, 90, 38, 30, M.HULL_MAIN, 0.8);
    g.fillCylinderY(0, 0, 80, 83, 39, 34, M.METAL_GOLD, 0.8);

    // Blazing breathing plasma inner core column (y = -95 .. +95, r = 13)
    g.fillCylinderY(0, 0, -95, 95, 13, 0, M.EMIT_CYAN_HOT, 0.6);
    // Pulsing glowing horizontal energy rings stacked along the core
    for (let cy = -72; cy <= 72; cy += 18) {
      g.fillCylinderY(0, 0, cy - 2, cy + 2, 19, 13, M.EMIT_CYAN, 0.6);
      g.fillCylinderY(0, 0, cy - 1, cy + 1, 21, 19, M.METAL_GOLD, 0.8);
    }
    // Translucent 1-voxel containment glass sheath around the plasma core (r = 20..22)
    g.fillCylinderY(0, 0, -84, 84, 22, 20, M.GLASS_CORE, 0.8);

    // 6 Fluted External Armored Core Exoskeleton Cage Ribs (open gaps let core blaze out!)
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + Math.PI / 6;
      const rx = Math.round(Math.cos(ang) * 25);
      const rz = Math.round(Math.sin(ang) * 25);
      if (rx < -3) continue;
      g.fillBox(rx - 3, -92, rz - 3, rx + 3, 92, rz + 3, M.FRAME_DARK);
      g.fillBox(rx - 1, -86, rz - 1, rx + 1, 86, rz + 1, M.METAL_GOLD);
    }

    return g.buildMesh();
  }

  // Animated Segmented Voxel Gimbal Ring rotating around the Power Core (sleek airy segments!)
  function buildCoreRing(radius = 44, thick = 5, height = 7) {
    const g = new VoxelGrid(false);
    // 4 sleek segmented armored arc blocks with generous open luminous windows between them!
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const a0 = -Math.PI + (s * 2 * Math.PI) / segs + 0.24;
      const a1 = -Math.PI + ((s + 1) * 2 * Math.PI) / segs - 0.24;
      const h2 = Math.floor(height / 2);
      g.fillCylinderY(0, 0, -h2, h2, radius + thick, radius, M.HULL_MAIN, 0.0, a0, a1);
      g.fillCylinderY(0, 0, -h2 - 1, -h2 - 1, radius + thick - 1, radius + 1, M.ARMOR_SLATE, 0.0, a0, a1);
      g.fillCylinderY(0, 0, h2 + 1, h2 + 1, radius + thick - 1, radius + 1, M.ARMOR_SLATE, 0.0, a0, a1);
      // Golden outer lip & inner glowing conduit rim
      g.fillCylinderY(0, 0, -1, 1, radius + thick + 1, radius + thick, M.METAL_GOLD, 0.0, a0, a1);
      g.fillCylinderY(0, 0, -1, 1, radius, radius - 1, M.EMIT_CYAN, 0.0, a0, a1);
      // Crisp dark armored coupling node with amber focal core at segment ends
      for (const ae of [a0, a1]) {
        const nx = Math.round(Math.cos(ae) * (radius + thick * 0.5));
        const nz = Math.round(Math.sin(ae) * (radius + thick * 0.5));
        g.fillBox(nx - 2, -h2 - 1, nz - 2, nx + 2, h2 + 1, nz + 2, M.FRAME_DARK);
        g.fillBox(nx - 1, -1, nz - 1, nx + 1, 1, nz + 1, M.EMIT_AMBER_HOT);
      }
    }
    // Slender connecting dark structural ring rail tying the 4 segments together
    g.fillCylinderY(0, 0, -1, 1, radius + 3, radius + 1, M.FRAME_DARK, 0.0);
    return g.buildMesh();
  }

  // =========================================================================
  // 3. THROUGH-GOING SHUTTLE HANGAR (384 long x 124 wide x 70 high)
  //    x: [-62, +62], y: [-35, +35], z: [-192, +192] (+Z = Open Space Launch Mouth!)
  // =========================================================================
  function buildHangar() {
    const g = new VoxelGrid(true);

    // --- LONGITUDINAL DECK FLOOR (y = -35 .. -31, z = -192 .. +192) ---
    g.fillBox(0, -35, -192, 62, -31, 192, M.BRIDGE_DECK);
    // Recessed central glowing launch runway strips converging all 384 voxels!
    g.fillBox(0, -31, -188, 2, -31, 188, M.EMIT_CYAN);
    g.fillBox(18, -31, -188, 20, -31, 188, M.METAL_GOLD);
    for (let z = -180; z <= 180; z += 24) {
      // Rhythmic glowing amber runway chevron bars
      g.fillBox(5, -31, z, 15, -31, z + 3, M.EMIT_AMBER);
      g.fillBox(22, -31, z + 10, 34, -31, z + 12, M.FRAME_DARK);
    }

    // --- 6 PAIRS OF DEEPLY RECESSED STEPPED DOCKING ALCOVES (x = 34..62) ---
    // Heavy outer hangar side wall backing
    g.fillBox(58, -35, -192, 62, 35, 192, M.FRAME_DARK);
    // 7 Thick dividing armored piers forming 6 deep side docking bays (spacing = 60 voxels!)
    for (let p = 0; p <= 6; p++) {
      const pz = -186 + p * 60;
      g.fillBox(34, -31, pz - 6, 60, 32, pz + 6, M.ARMOR_DARK_SLATE);
      g.fillBox(31, -31, pz - 4, 34, 24, pz + 4, M.ARMOR_SLATE);
      g.fillBox(31, -24, pz - 2, 33, 18, pz + 2, M.HULL_MAIN); // Ceramic face accent panel
      g.fillBox(30, -28, pz - 1, 31, 20, pz + 1, M.METAL_GOLD);
      // Crisp thin glowing amber bay marker bar on each pier
      g.fillBox(32, -22, pz - 5, 33, -6, pz - 4, M.EMIT_AMBER);
      g.fillBox(32, -22, pz + 4, 33, -6, pz + 5, M.EMIT_AMBER);

      // Inside each docking alcove (between piers): deck pads, amber dock outline & recessed back-wall lighting
      if (p < 6) {
        const az = pz + 30;
        g.fillBox(36, -31, az - 20, 56, -29, az + 20, M.FRAME_DARK);
        g.fillBox(36, -29, az - 18, 37, -29, az + 18, M.EMIT_AMBER);
        g.fillBox(38, -29, az - 18, 54, -29, az - 17, M.EMIT_CYAN);
        g.fillBox(38, -29, az + 17, 54, -29, az + 18, M.EMIT_CYAN);
        // Illuminated upper alcove observation bay (recessed with dark frame!)
        g.fillBox(56, 8, az - 14, 58, 16, az + 14, M.EMIT_BLUE_SOFT);
        g.fillBox(54, 8, az - 14, 55, 16, az + 14, M.GLASS_CYAN);
        g.fillBox(36, 18, az - 22, 58, 22, az + 22, M.FRAME_DARK);
        g.fillBox(44, 17, az - 10, 50, 18, az + 10, M.EMIT_BLUE_SOFT);
      }

      // --- MASSIVE OVERHEAD SPANNING BRIDGE GANTRIES (y = +18 .. +34) ---
      g.fillBox(0, 20, pz - 5, 60, 28, pz + 5, M.FRAME_DARK);
      g.fillBox(0, 28, pz - 3, 56, 33, pz + 3, M.ARMOR_SLATE);
      g.fillBox(0, 19, pz - 2, 34, 20, pz + 2, M.METAL_GOLD);
      g.fillBox(14, 18, pz - 1, 22, 19, pz + 1, M.EMIT_AMBER);
      g.fillBox(0, 22, pz + 5, 28, 26, pz + 5, M.GLASS_CYAN);
    }

    // Dark vaulted hangar ceiling roof trusses & longitudinal spine rail (y = +32..+35)
    g.fillBox(0, 32, -192, 62, 35, 192, M.FRAME_DEEP);
    g.fillBox(0, 29, -192, 8, 32, 192, M.FRAME_DARK);
    g.fillBox(16, 30, -192, 20, 32, 192, M.ARMOR_DARK_SLATE);
    g.fillBox(3, 28, -184, 5, 29, 184, M.EMIT_CYAN);

    // --- SECOND INTERIOR BULKHEAD PORTAL GATE (z = -66) ---
    g.fillBox(26, -31, -72, 62, 32, -60, M.ARMOR_SLATE);
    g.fillBox(0, 14, -72, 62, 32, -60, M.ARMOR_SLATE);
    g.fillBox(28, -26, -73, 52, 14, -59, M.HULL_MID);
    g.fillBox(24, -31, -71, 27, 16, -61, M.METAL_GOLD);
    g.fillBox(0, 13, -71, 27, 15, -61, M.METAL_GOLD);
    g.fillBox(25, -24, -66, 26, 12, -65, M.EMIT_CYAN);

    // --- FAR DEEP END ILLUMINATED SECONDARY BAY CHAMBER (z = -192 .. -176) ---
    g.fillBox(0, -35, -192, 62, 35, -186, M.FRAME_DARK);
    g.fillBox(0, -24, -186, 38, 18, -182, M.EMIT_BLUE_SOFT); // Luminous distant end bay light!
    g.fillBox(12, -24, -182, 16, 18, -178, M.FRAME_DARK);   // Silhouetted vertical framing columns
    g.fillBox(28, -24, -182, 32, 18, -178, M.FRAME_DARK);

    // --- FORWARD GRAND LAUNCH MOUTH FRAME (z = +184 .. +194, wide open to live space!) ---
    g.fillBox(44, -35, 182, 62, 35, 194, M.HULL_MAIN);
    g.fillBox(0, 24, 182, 62, 35, 194, M.HULL_MAIN);
    g.fillBox(42, -31, 188, 45, 25, 195, M.METAL_GOLD);
    g.fillBox(0, 22, 188, 44, 25, 195, M.METAL_GOLD);
    g.fillBox(43, -28, 192, 44, 20, 194, M.EMIT_AMBER_HOT);

    return g.buildMesh();
  }

  // Animated Abstract Mechanical Maintenance Rig (strictly non-humanoid geometric voxel gantry arm!)
  function buildHangarRig() {
    const g = new VoxelGrid(false);
    // Overhead rail carriage
    g.fillBox(-5, 0, -6, 5, 4, 6, M.ARMOR_DARK_SLATE);
    g.fillBox(-4, -1, -4, 4, 0, 4, M.METAL_GOLD);
    // Twin vertical telescoping structural struts
    g.fillBox(-3, -14, -2, -1, 0, 2, M.FRAME_DARK);
    g.fillBox(1, -14, -2, 3, 0, 2, M.FRAME_DARK);
    // Lower horizontal cantilevered scanner & clamp bar
    g.fillBox(-9, -18, -3, 9, -13, 3, M.HULL_MID);
    g.fillBox(-8, -19, -1, 8, -18, 1, M.EMIT_AMBER_HOT);
    g.fillBox(-11, -17, -2, -9, -14, 2, M.METAL_STEEL);
    g.fillBox(9, -17, -2, 11, -14, 2, M.METAL_STEEL);
    return g.buildMesh();
  }

  // =========================================================================
  // 4. ENERGY LOADING & CONDUIT CORRIDOR (360 long x 108 wide x 76 high)
  //    x: [-54, +54], y: [-38, +38], z: [-180, +180] (+Z = Far Luminous Discharge Cavity!)
  // =========================================================================
  function buildConduitCorridor() {
    const g = new VoxelGrid(true);

    // Outer deep shadowed structural hull envelope (z = -180 .. +154)
    g.fillBox(50, -38, -180, 54, 38, 156, M.FRAME_DEEP);
    g.fillBox(0, -38, -180, 54, -34, 160, M.FRAME_DARK);
    g.fillBox(0, 34, -180, 54, 38, 160, M.FRAME_DARK);
    // Rear entry bulkhead
    g.fillBox(0, -38, -180, 54, 38, -176, M.FRAME_DEEP);

    // --- CENTRAL LOWER & UPPER CONDUIT SPINE CHANNELS (z = -176 .. +158) ---
    g.fillBox(0, -34, -176, 14, -28, 158, M.ARMOR_DARK_SLATE);
    g.fillBox(0, -28, -176, 4, -27, 158, M.EMIT_CYAN);
    g.fillBox(12, -28, -176, 14, -26, 158, M.METAL_GOLD);
    // Overhead suspended energy rail spine
    g.fillBox(0, 26, -176, 12, 34, 158, M.ARMOR_DARK_SLATE);
    g.fillBox(0, 25, -176, 4, 26, 158, M.EMIT_CYAN);

    // --- 7 MONUMENTAL REPEATING ARCHITECTURAL FRAME SPANS & FLANKING LOADING TOWERS ---
    for (let i = 0; i < 7; i++) {
      const fz = -152 + i * 50;
      // Colossal dark-sculpted stepped outer structural frame arch (contrasts dramatically against cyan energy!)
      g.fillBox(34, -34, fz - 6, 52, 34, fz + 6, M.ARMOR_DARK_SLATE);
      g.fillBox(30, -34, fz - 4, 35, 34, fz + 4, M.ARMOR_SLATE);
      g.fillBox(36, -26, fz - 2, 46, 26, fz + 2, M.HULL_MID);
      // Diagonal upper & lower frame haunches giving unmistakable octagonal vault profile!
      g.fillStrut([34, 20, fz], [14, 34, fz], 4, M.ARMOR_SLATE);
      g.fillStrut([34, -20, fz], [14, -34, fz], 4, M.ARMOR_SLATE);
      // Crisp gold inner flange trim & recessed cyan vertical flow strip
      g.fillBox(29, -24, fz - 1, 30, 24, fz + 1, M.METAL_GOLD);
      g.fillBox(32, -22, fz - 5, 33, 22, fz - 5, M.EMIT_CYAN);
      g.fillBox(32, -22, fz + 5, 33, 22, fz + 5, M.EMIT_CYAN);

      // Suspended central overhead hexagonal/octagonal conduit focusing ring!
      g.fillCylinderZ(0, 0, fz - 2, fz + 2, 26, 22, M.ARMOR_DARK_SLATE, 0.85);
      g.fillCylinderZ(0, 0, fz - 1, fz + 1, 22, 21, M.EMIT_CYAN, 0.85);
      // Carve central corridor passage cleanly so camera flies straight through center!
      g.carveBox(0, -18, fz - 3, 18, 18, fz + 3);

      // Between frames: Tall Flanking Capacitor Loading Monoliths & Slotted Conveyor Rails!
      if (i < 6) {
        const mz = fz + 25;
        // Tall recessed loading capacitor tower with glowing core slits
        g.fillBox(38, -32, mz - 14, 51, 32, mz + 14, M.ARMOR_DARK_SLATE);
        g.fillBox(36, -24, mz - 10, 39, 24, mz + 10, M.FRAME_DEEP);
        g.fillBox(37, -20, mz - 6, 38, 20, mz + 6, M.EMIT_CYAN);
        g.fillBox(35, -20, mz - 7, 36, 20, mz + 7, M.GLASS_CYAN); // Voxel glass casing over glowing core!
        // Slotted upper & lower longitudinal conveyor guide rails (x = 24..34, y = ±14)
        for (const ry of [-16, 14]) {
          g.fillBox(24, ry - 2, mz - 22, 34, ry + 2, mz + 22, M.FRAME_DARK);
          g.fillBox(23, ry, mz - 22, 25, ry + 1, mz + 22, M.METAL_STEEL);
          g.fillBox(26, ry + 2, mz - 20, 31, ry + 3, mz + 20, M.EMIT_AMBER);
        }
      }
    }

    // --- FAR-END WIDER SCULPTED LUMINOUS DISCHARGE CAVITY (z = +154 .. +204) ---
    // Widens into a deep stepped octagonal accelerator aperture (rich dark-vs-glow contrast, zero flat whiteout!)
    g.fillCylinderZ(0, 0, 154, 202, 56, 44, M.ARMOR_DARK_SLATE, 0.85);
    g.fillCylinderZ(0, 0, 158, 166, 44, 34, M.HULL_MAIN, 0.85);
    g.fillCylinderZ(0, 0, 166, 170, 40, 34, M.METAL_GOLD, 0.85);
    g.fillCylinderZ(0, 0, 174, 180, 42, 30, M.FRAME_DARK, 0.85);
    g.fillCylinderZ(0, 0, 175, 178, 34, 30, M.EMIT_CYAN, 0.85);
    g.fillCylinderZ(0, 0, 182, 188, 36, 24, M.ARMOR_DARK_SLATE, 0.85);
    g.fillCylinderZ(0, 0, 183, 186, 26, 23, M.METAL_GOLD, 0.85);
    // Deep recessed obsidian chamber backing + concentric iris emitter ring + glowing focal pupil!
    g.fillCylinderZ(0, 0, 196, 204, 48, 0, M.FRAME_DEEP, 0.85);
    g.fillCylinderZ(0, 0, 188, 194, 24, 16, M.GLASS_CORE, 0.85);
    g.fillCylinderZ(0, 0, 192, 196, 17, 13, M.EMIT_AMBER, 0.85);
    g.fillCylinderZ(0, 0, 193, 197, 11, 0, M.EMIT_CYAN_HOT, 0.85);
    // 4 Radial dark magnetic stator vanes framing the discharge aperture
    g.fillBox(11, -3, 186, 36, 3, 195, M.FRAME_DARK);
    g.fillBox(0, 11, 186, 3, 36, 195, M.FRAME_DARK);
    g.fillBox(0, -36, 186, 3, -11, 195, M.FRAME_DARK);

    return g.buildMesh();
  }

  // Animated Advancing Voxel Energy Block (glides in batches down Corridor slotted rails!)
  function buildEnergyBlock() {
    const g = new VoxelGrid(false);
    // Heavy dark armored end-caps + translucent cyan crystal casing + blazing core!
    g.fillBox(-4, -4, -9, 4, 4, -6, M.FRAME_DARK);
    g.fillBox(-4, -4, 6, 4, 4, 9, M.FRAME_DARK);
    g.fillBox(-5, -2, -8, 5, 2, -7, M.METAL_GOLD);
    g.fillBox(-5, -2, 7, 5, 2, 8, M.METAL_GOLD);
    g.fillBox(-3, -3, -6, 3, 3, 6, M.EMIT_CYAN_HOT);
    g.fillBox(-4, -4, -5, 4, 4, 5, M.GLASS_CORE);
    // Re-stamp inner core cleanly inside translucent glass casing
    g.fillBox(-2, -2, -5, 2, 2, 5, M.EMIT_CYAN_HOT);
    return g.buildMesh({ skipAO: true });
  }

  // Animated Abstract Focusing Clamp Jaw (slides inward & outward in harmonic waves in Corridor!)
  function buildConduitClamp() {
    const g = new VoxelGrid(false);
    // Chunky non-humanoid stepped mechanical loading jaw
    g.fillBox(-6, -12, -6, 6, 12, 6, M.ARMOR_SLATE);
    g.fillBox(-8, -9, -4, -5, 9, 4, M.HULL_MAIN);
    g.fillBox(-10, -7, -3, -8, 7, 3, M.METAL_GOLD);
    g.fillBox(-11, -3, -2, -9, 3, 2, M.EMIT_AMBER_HOT);
    // Piston guide bars extending into wall
    g.fillBox(6, -8, -2, 18, -4, 2, M.METAL_STEEL);
    g.fillBox(6, 4, -2, 18, 8, 2, M.METAL_STEEL);
    return g.buildMesh();
  }

  App.InteriorModels = {
    buildAll() {
      const t0 = performance.now();
      const bridge = buildBridge();
      const bridgeHologram = buildBridgeHologram();
      const coreAtrium = buildPowerCoreAtrium();
      const coreRingA = buildCoreRing(39, 5, 7);
      const coreRingB = buildCoreRing(46, 5, 8);
      const coreRingC = buildCoreRing(32, 4, 6);
      const hangar = buildHangar();
      const hangarRig = buildHangarRig();
      const corridor = buildConduitCorridor();
      const energyBlock = buildEnergyBlock();
      const conduitClamp = buildConduitClamp();
      const dt = (performance.now() - t0).toFixed(1);
      console.log(`[InteriorModels] Built in ${dt}ms`, {
        bridge: bridge.stats,
        coreAtrium: coreAtrium.stats,
        hangar: hangar.stats,
        corridor: corridor.stats,
      });
      return {
        bridge,
        bridgeHologram,
        coreAtrium,
        coreRingA,
        coreRingB,
        coreRingC,
        hangar,
        hangarRig,
        corridor,
        energyBlock,
        conduitClamp,
      };
    },
  };
})(window.App);
