// Port Buildings with Complete Open Interiors:
// 1. Fishing Co-op Warehouse (half-raised roller shutter, crates, freezer, scale, hanging boots, auction chalkboard, wet icy floor, clerestory god rays, swaying ceiling caustics)
// 2. Ferry Waiting Room (floor-to-ceiling glass, wooden benches, faded ferry timetable, retro radio, kettle, potted pothos, slightly tilted wall clock)
// 3. Glowing Coastal Vending Machine with Rusty Rain Awning
(function () {
  const { DECK_Y, PALETTE, SUN_DIR, createRNG } = window.HARBOR;
  const TEX = window.HARBOR_TEXTURES;
  const { createCelMaterial, createAnimeGlassMaterial, createGodRayMaterial } = window.HARBOR_MATERIALS;

  function createCoopSignTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 112;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e7eeef';
    ctx.fillRect(0, 0, 512, 112);
    ctx.strokeStyle = '#3c6e85';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 100);
    ctx.fillStyle = '#254c61';
    ctx.font = 'bold 42px "Shippori Mincho B1 Medium", "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('青汐漁協 荷捌倉庫', 256, 72);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  function createWaitingSignTexture() {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#477f99';
    ctx.fillRect(0, 0, 384, 96);
    ctx.strokeStyle = '#e8f3f5';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 372, 84);
    ctx.fillStyle = '#f6fbfc';
    ctx.font = 'bold 36px "Zen Kaku Gothic New Medium", "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('青汐港 待合室', 192, 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // Helper: detailed plastic fish crate (white foam fish box or slotted blue turnover crate)
  function createFishCrateMesh(isBlue, hasIce, mats) {
    const g = new THREE.Group();
    const w = 0.62, h = 0.28, d = 0.42;
    const mat = isBlue ? mats.crateBlue : mats.crateWhite;
    const wallT = 0.035;

    // Bottom + 4 walls (open top so crushed ice is visible!)
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w, wallT, d), mat);
    bot.position.y = wallT * 0.5;
    g.add(bot);
    const front = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), mat);
    front.position.set(0, h * 0.5, d * 0.5 - wallT * 0.5);
    const back = front.clone();
    back.position.z = -d * 0.5 + wallT * 0.5;
    const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d - wallT * 2), mat);
    left.position.set(-w * 0.5 + wallT * 0.5, h * 0.5, 0);
    const right = left.clone();
    right.position.x = w * 0.5 - wallT * 0.5;
    // Top rim flange
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.03, d + 0.04), mat);
    rim.position.y = h - 0.015;
    // Cut inner look by adding lid or ice mound
    [bot, front, back, left, right].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    g.add(front, back, left, right);
    if (hasIce) {
      const iceMound = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.14, d - 0.08), mats.ice);
      iceMound.position.y = h * 0.68;
      g.add(iceMound);
    } else if (!isBlue) {
      // Closed styrofoam lid
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.045, d + 0.03), mat);
      lid.position.y = h + 0.01;
      lid.castShadow = true;
      lid.receiveShadow = true;
      g.add(lid);
    }
    return g;
  }

  function buildBuildings(scene) {
    const group = new THREE.Group();
    group.name = 'PortBuildings';
    scene.add(group);

    const rng = createRNG(3030);

    // Textures
    const roofMetalTex = TEX.createCorrugatedTexture('#7b99a8', 0.25, false);
    const shutterTex = TEX.createCorrugatedTexture('#b4c6cc', 0.18, true);
    const rustyAwningTex = TEX.createCorrugatedTexture('#8d7263', 0.85, false);
    const woodBenchTex = TEX.createWoodTexture('#b68b60');
    const waitSidingTex = TEX.createWoodTexture('#96bcc4');
    const chalkTex = TEX.createAuctionChalkboardTexture();
    const timetableTex = TEX.createFerryTimetableTexture();
    const clockTex = TEX.createClockFaceTexture();
    const scaleDialTex = TEX.createScaleDialTexture();
    const vendingTex = TEX.createVendingMachineTexture();
    const coopSignTex = createCoopSignTexture();
    const waitSignTex = createWaitingSignTexture();

    const mats = {
      whWall: createCelMaterial({ color: 0xdce4e6, wetness: 0.24, rim: 0.16 }),
      whInteriorWall: createCelMaterial({
        color: 0xc2d0d4,
        wetness: 0.12,
        rim: 0.05,
        caustics: 0.72, // catches clear swaying water bounce across upper interior warehouse wall!
        causticsMode: 0.0,
        shadowStrength: 0.48
      }),
      whCeiling: createCelMaterial({
        color: 0x6f8e9a, // authentic shaded roof underside so shimmering water caustics dance vividly across ceiling!
        wetness: 0.10,
        rim: 0.0,
        caustics: 1.68,
        causticsMode: 0.0,
        side: THREE.DoubleSide
      }),
      whRoof: createCelMaterial({ color: 0xffffff, map: roofMetalTex, wetness: 0.52, rim: 0.28 }),
      shutter: createCelMaterial({ color: 0xffffff, map: shutterTex, wetness: 0.35, rim: 0.22 }),
      steelBeam: createCelMaterial({ color: 0x5c7380, wetness: 0.22, rim: 0.14, caustics: 0.55, causticsMode: 0.0 }),
      crateWhite: createCelMaterial({ color: PALETTE.crateWhite, wetness: 0.55, rim: 0.24 }),
      crateBlue: createCelMaterial({ color: PALETTE.crateBlue, wetness: 0.58, rim: 0.26 }),
      freezerWhite: createCelMaterial({ color: 0xf2f7f8, wetness: 0.35, rim: 0.22 }),
      chrome: createCelMaterial({ color: 0xd4e2e6, wetness: 0.65, rim: 0.35 }),
      scaleGreen: createCelMaterial({ color: 0x4f8c7b, wetness: 0.30, rim: 0.20 }),
      bootYellow: createCelMaterial({ color: 0xeec142, wetness: 0.62, rim: 0.28 }),
      bootNavy: createCelMaterial({ color: 0x2d4d66, wetness: 0.58, rim: 0.22 }),
      bootOlive: createCelMaterial({ color: 0x557552, wetness: 0.55, rim: 0.22 }),
      chalkboard: createCelMaterial({ color: 0xffffff, map: chalkTex, wetness: 0.08, rim: 0.05 }),
      ice: createCelMaterial({ color: 0xdff8fc, wetness: 0.85, rim: 0.45, transparent: true, opacity: 0.82 }),
      floorPuddle: createCelMaterial({
        color: 0x99cfd8,
        wetness: 0.95,
        rim: 0.25,
        transparent: true,
        opacity: 0.58,
        caustics: 0.45,
        causticsMode: 0.0
      }),
      coopSign: createCelMaterial({ color: 0xffffff, map: coopSignTex, wetness: 0.25, rim: 0.15 }),
      waitSign: createCelMaterial({ color: 0xffffff, map: waitSignTex, wetness: 0.30, rim: 0.18 }),
      // Waiting room
      waitWall: createCelMaterial({ color: 0xffffff, map: waitSidingTex, wetness: 0.30, rim: 0.18 }),
      waitInterior: createCelMaterial({ color: 0xebf0ec, wetness: 0.08, rim: 0.05 }),
      waitFloor: createCelMaterial({ color: 0xc8d2d0, wetness: 0.24, rim: 0.05 }),
      waitRoof: createCelMaterial({ color: 0x5d8294, wetness: 0.54, rim: 0.28 }),
      waitFrame: createCelMaterial({ color: 0x425b69, wetness: 0.32, rim: 0.18 }),
      woodBench: createCelMaterial({ color: 0xffffff, map: woodBenchTex, wetness: 0.18, rim: 0.16 }),
      timetable: createCelMaterial({ color: 0xffffff, map: timetableTex, wetness: 0.05, rim: 0.05 }),
      clockFace: createCelMaterial({ color: 0xffffff, map: clockTex, wetness: 0.12, rim: 0.08 }),
      radioWood: createCelMaterial({ color: 0x7c5439, wetness: 0.18, rim: 0.18 }),
      radioFront: createCelMaterial({ color: 0xd9cdb6, wetness: 0.12, rim: 0.12 }),
      kettleCream: createCelMaterial({ color: 0xf4eee0, wetness: 0.38, rim: 0.24 }),
      terracotta: createCelMaterial({ color: 0xc26e4b, wetness: 0.22, rim: 0.18 }),
      pothosLeaf: createCelMaterial({ color: 0x52a85f, wetness: 0.35, rim: 0.28, side: THREE.DoubleSide }),
      // Vending machine
      vendingFront: new THREE.MeshBasicMaterial({ map: vendingTex }), // glowing lightbox!
      vendingBody: createCelMaterial({ color: 0x5696b3, wetness: 0.45, rim: 0.26 }),
      rustyAwning: createCelMaterial({ color: 0xffffff, map: rustyAwningTex, wetness: 0.42, rim: 0.22 }),
      rustyIron: createCelMaterial({ color: 0x7d4c39, wetness: 0.26, rim: 0.20 }),
      glass: createAnimeGlassMaterial({ color: 0xdcf7fa, opacity: 0.15 }),
      clerestoryGlass: createAnimeGlassMaterial({ color: 0xfff8df, opacity: 0.22 })
    };

    // =========================================================================
    // 1. FISHING CO-OP WAREHOUSE (渔协仓库)
    //    Footprint: x in [-14.8, -8.8] (depth 6.0), z in [-5.2, +1.8] (width 7.0)
    //    Center: (-11.8, DECK_Y, -1.7), Front opening faces +X!
    // =========================================================================
    const wh = new THREE.Group();
    wh.position.set(-11.8, DECK_Y, -1.7);
    group.add(wh);

    const whD = 6.0; // X extent [-3.0, +3.0]
    const whW = 7.0; // Z extent [-3.5, +3.5]
    const whH = 3.45; // eaves height
    const whT = 0.18; // wall thickness

    // Interior damp concrete floor pad (slightly raised 0.03 above quay)
    const whFloor = new THREE.Mesh(new THREE.BoxGeometry(whD, 0.05, whW), mats.whInteriorWall);
    whFloor.position.y = 0.025;
    whFloor.receiveShadow = true;
    wh.add(whFloor);

    // Back wall (-X = -3.0)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(whT, whH, whW), mats.whInteriorWall);
    backWall.position.set(-whD * 0.5 + whT * 0.5, whH * 0.5, 0);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    wh.add(backWall);
    // Exterior cladding on back West wall (-X) + authentic rear Japanese harbor warehouse service details (360° diorama polish!)
    const backExt = new THREE.Mesh(new THREE.BoxGeometry(0.06, whH, whW), mats.whWall);
    backExt.position.set(-whD * 0.5 - 0.02, whH * 0.5, 0);
    wh.add(backExt);
    // Rear galvanized steel service door (勝手口) + small rain hood on West wall
    const rearDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.02, 0.96), mats.steelBeam);
    rearDoorFrame.position.set(-whD * 0.5 - 0.04, 1.01, 1.45);
    const rearDoor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.92, 0.84), mats.shutter);
    rearDoor.position.set(-whD * 0.5 - 0.055, 1.00, 1.45);
    const rearDoorWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.48, 0.52), mats.clerestoryGlass);
    rearDoorWin.position.set(-whD * 0.5 - 0.07, 1.42, 1.45);
    const rearHood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 1.18), mats.steelBeam);
    rearHood.position.set(-whD * 0.5 - 0.20, 2.12, 1.45);
    rearHood.rotation.z = 0.18;
    wh.add(rearDoorFrame, rearDoor, rearDoorWin, rearHood);
    // Twin high rear louvered ventilation windows on West wall
    [-1.45, -0.05].forEach((vz) => {
      const vf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 1.08), mats.steelBeam);
      vf.position.set(-whD * 0.5 - 0.04, 2.75, vz);
      const vp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.50, 0.96), mats.clerestoryGlass);
      vp.position.set(-whD * 0.5 - 0.06, 2.75, vz);
      wh.add(vf, vp);
    });
    // Compact Japanese outdoor AC condenser unit (室外機) & copper pipe beside rear door
    const acBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.78), mats.freezerWhite);
    acBox.position.set(-whD * 0.5 - 0.22, 0.34, -0.85);
    acBox.castShadow = true;
    const acFan = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.03, 12), mats.steelBeam);
    acFan.rotation.z = Math.PI / 2;
    acFan.position.set(-whD * 0.5 - 0.38, 0.34, -0.96);
    const acPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 6), mats.steelBeam);
    acPipe.position.set(-whD * 0.5 - 0.08, 1.15, -0.45);
    wh.add(acBox, acFan, acPipe);

    // North wall (-Z = -3.5)
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(whD, whH, whT), mats.whWall);
    northWall.position.set(0, whH * 0.5, -whW * 0.5 + whT * 0.5);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    wh.add(northWall);

    // South wall (+Z = +3.5) WITH HIGH CLERESTORY WINDOWS (y = 2.55..3.25) letting sunlight pour inside!
    const southLower = new THREE.Mesh(new THREE.BoxGeometry(whD, 2.52, whT), mats.whWall);
    southLower.position.set(0, 1.26, whW * 0.5 - whT * 0.5);
    southLower.castShadow = true;
    southLower.receiveShadow = true;
    wh.add(southLower);
    const southHeader = new THREE.Mesh(new THREE.BoxGeometry(whD, 0.22, whT), mats.whWall);
    southHeader.position.set(0, whH - 0.11, whW * 0.5 - whT * 0.5);
    wh.add(southHeader);
    // South clerestory mullions & panes
    for (let i = 0; i <= 4; i++) {
      const mx = -2.6 + i * 1.3;
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, whT + 0.02), mats.steelBeam);
      mull.position.set(mx, 2.88, whW * 0.5 - whT * 0.5);
      wh.add(mull);
    }
    const southClereGlass = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.70), mats.clerestoryGlass);
    southClereGlass.position.set(0, 2.88, whW * 0.5 - whT * 0.5);
    wh.add(southClereGlass);

    // Front East wall (+X = +3.0) with WIDE ROLLER SHUTTER OPENING (z in [-2.35, +2.35], opening width = 4.7m!)
    const frontNorthPier = new THREE.Mesh(new THREE.BoxGeometry(whT, whH, 1.15), mats.whWall);
    frontNorthPier.position.set(whD * 0.5 - whT * 0.5, whH * 0.5, -whW * 0.5 + 0.575);
    frontNorthPier.castShadow = true;
    frontNorthPier.receiveShadow = true;
    wh.add(frontNorthPier);

    const frontSouthPier = new THREE.Mesh(new THREE.BoxGeometry(whT, whH, 1.15), mats.whWall);
    frontSouthPier.position.set(whD * 0.5 - whT * 0.5, whH * 0.5, whW * 0.5 - 0.575);
    frontSouthPier.castShadow = true;
    frontSouthPier.receiveShadow = true;
    wh.add(frontSouthPier);

    // Front upper transom clerestory window above shutter housing!
    const shutterTopY = 2.85;
    const frontTransomGlass = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 0.52), mats.clerestoryGlass);
    frontTransomGlass.rotation.y = Math.PI / 2;
    frontTransomGlass.position.set(whD * 0.5 - whT * 0.5, 3.16, 0);
    wh.add(frontTransomGlass);
    for (let i = -2; i <= 2; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 0.06), mats.steelBeam);
      m.position.set(whD * 0.5 - whT * 0.5, 3.16, i * 1.15);
      wh.add(m);
    }

    // Half-Raised Corrugated Roller Shutter (shutter box at y=2.78, bottom edge raised to y=2.28 -> HUGE clear view!)
    const shutterBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.30, 4.82), mats.steelBeam);
    shutterBox.position.set(whD * 0.5 - 0.04, shutterTopY, 0);
    shutterBox.castShadow = true;
    wh.add(shutterBox);

    const shutterCurtainH = 0.68; // visibly half-pulled up, exposing bottom 2.15m cleanly!
    const shutterCurtain = new THREE.Mesh(new THREE.BoxGeometry(0.06, shutterCurtainH, 4.68), mats.shutter);
    shutterCurtain.position.set(whD * 0.5 - 0.09, shutterTopY - 0.12 - shutterCurtainH * 0.5, 0);
    shutterCurtain.castShadow = true;
    wh.add(shutterCurtain);
    // Bottom steel bar + pull handles on roller shutter
    const shutterBar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 4.70), mats.steelBeam);
    shutterBar.position.set(whD * 0.5 - 0.09, shutterTopY - 0.12 - shutterCurtainH, 0);
    wh.add(shutterBar);
    // Vertical side guide tracks for roller shutter
    [-2.35, 2.35].forEach((sz) => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 0.08), mats.steelBeam);
      track.position.set(whD * 0.5 - 0.09, 1.4, sz);
      wh.add(track);
    });

    // Warehouse Signage mounted above the front eaves
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 3.1), mats.coopSign);
    signBoard.position.set(whD * 0.5 + 0.06, whH + 0.34, 0);
    signBoard.castShadow = true;
    wh.add(signBoard);

    // Pitched Roof (exterior corrugated roof + interior caustic-lit ceiling & steel roof trusses!)
    const roofPeakH = 1.25;
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-whD * 0.5, 0);
    gableShape.lineTo(whD * 0.5, 0);
    gableShape.lineTo(0, roofPeakH);
    gableShape.closePath();
    // North & South gable end triangles
    [-whW * 0.5 + 0.09, whW * 0.5 - 0.09].forEach((gz) => {
      const gGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.14, bevelEnabled: false });
      gGeo.translate(0, whH, gz - 0.07);
      const gm = new THREE.Mesh(gGeo, mats.whWall);
      gm.castShadow = true;
      wh.add(gm);
    });

    const slopeLen = Math.hypot(whD * 0.5 + 0.45, roofPeakH + 0.18);
    const slopeAng = Math.atan2(roofPeakH, whD * 0.5);
    const roofSpanZ = whW + 0.72;
    // West slope & East slope (exterior)
    const roofW = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.08, roofSpanZ), mats.whRoof);
    roofW.position.set(-(whD * 0.25 + 0.14), whH + roofPeakH * 0.5 - 0.02, 0);
    roofW.rotation.z = slopeAng;
    roofW.castShadow = true;
    roofW.receiveShadow = true;
    wh.add(roofW);

    const roofE = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.08, roofSpanZ), mats.whRoof);
    roofE.position.set(whD * 0.25 + 0.14, whH + roofPeakH * 0.5 - 0.02, 0);
    roofE.rotation.z = -slopeAng;
    roofE.castShadow = true;
    roofE.receiveShadow = true;
    wh.add(roofE);

    // Galvanized warehouse rain gutter along East eaves & downspout pipe at South-East corner!
    const whGutter = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, roofSpanZ), mats.steelBeam);
    whGutter.position.set(whD * 0.5 + 0.36, whH - 0.14, 0);
    wh.add(whGutter);
    const whPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, whH - 0.2, 8), mats.steelBeam);
    whPipe.position.set(whD * 0.5 + 0.05, (whH - 0.2) * 0.5, whW * 0.5 - 0.12);
    wh.add(whPipe);

    // Interior Ceiling Lining with SWAYING WATER-SURFACE CAUSTIC REFLECTIONS!
    const ceilLen = Math.hypot(whD * 0.5 - 0.1, roofPeakH - 0.06);
    const ceilW = new THREE.Mesh(new THREE.PlaneGeometry(ceilLen, whW - 0.32), mats.whCeiling);
    ceilW.position.set(-whD * 0.24, whH + roofPeakH * 0.48 - 0.06, 0);
    ceilW.rotation.x = Math.PI / 2;
    ceilW.rotation.y = slopeAng;
    wh.add(ceilW);

    const ceilE = new THREE.Mesh(new THREE.PlaneGeometry(ceilLen, whW - 0.32), mats.whCeiling);
    ceilE.position.set(whD * 0.24, whH + roofPeakH * 0.48 - 0.06, 0);
    ceilE.rotation.x = Math.PI / 2;
    ceilE.rotation.y = -slopeAng;
    wh.add(ceilE);

    // Exposed steel ceiling cross-trusses (also catch swaying water caustics!)
    [-1.8, 0.0, 1.8].forEach((tz) => {
      const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(whD - 0.36, 0.10, 0.09), mats.steelBeam);
      tieBeam.position.set(0, whH - 0.06, tz);
      wh.add(tieBeam);
      const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, roofPeakH - 0.15, 0.08), mats.steelBeam);
      kingPost.position.set(0, whH + (roofPeakH - 0.15) * 0.5, tz);
      wh.add(kingPost);
    });

    // ----- WAREHOUSE INTERIOR FURNISHINGS -----

    // A. Stacked towers of white plastic fish boxes & blue crates (成垛鱼箱)
    const crateStacks = [
      // [x, z, count, isBlue, rotY, topIce]
      [-1.75, 1.85, 4, false, 0.08, true],
      [-1.05, 2.05, 3, true, -0.05, true],
      [-1.80, 0.95, 3, false, 0.12, false],
      [0.45, -2.35, 3, false, 0.04, true],
      [1.22, -2.42, 2, true, -0.10, true],
      [0.85, 2.10, 2, false, 0.15, true],
      [1.65, 1.85, 2, true, -0.06, false]
    ];
    crateStacks.forEach(([cx, cz, cnt, isBlue, ry, topIce]) => {
      for (let s = 0; s < cnt; s++) {
        const box = createFishCrateMesh(isBlue, topIce && s === cnt - 1, mats);
        box.position.set(cx + (rng() - 0.5) * 0.04, 0.05 + s * 0.285, cz + (rng() - 0.5) * 0.04);
        box.rotation.y = ry + (rng() - 0.5) * 0.07;
        wh.add(box);
      }
    });

    // B. Commercial Chest Freezer (冰柜) along North interior wall
    const freezer = new THREE.Group();
    freezer.position.set(-1.35, 0.05, -2.65);
    const fBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.86, 0.88), mats.freezerWhite);
    fBody.position.y = 0.43;
    fBody.castShadow = true;
    fBody.receiveShadow = true;
    const fLid = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.08, 0.92), mats.chrome);
    fLid.position.y = 0.89;
    fLid.castShadow = true;
    const fHandle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.06), mats.steelBeam);
    fHandle.position.set(0, 0.91, 0.48);
    // Tiny glowing green power LED & temp badge
    const fLed = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x64f0b4 }));
    fLed.position.set(0.68, 0.72, 0.45);
    freezer.add(fBody, fLid, fHandle, fLed);
    wh.add(freezer);

    // C. Mechanical Harbor Platform Scale (磅秤) clearly visible near the opening!
    const scaleG = new THREE.Group();
    scaleG.position.set(1.15, 0.05, -0.55);
    scaleG.rotation.y = -0.35;
    const scBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.72), mats.scaleGreen);
    scBase.position.y = 0.07;
    scBase.castShadow = true;
    const scPan = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), mats.chrome);
    scPan.position.y = 0.16;
    const scPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 8), mats.scaleGreen);
    scPost.position.set(-0.28, 0.72, 0);
    scPost.castShadow = true;
    const scDialHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.10, 14), mats.scaleGreen);
    scDialHousing.rotation.z = Math.PI / 2;
    scDialHousing.position.set(-0.28, 1.38, 0);
    const scDialFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.20, 20),
      new THREE.MeshBasicMaterial({ map: scaleDialTex })
    );
    scDialFace.rotation.y = Math.PI / 2;
    scDialFace.position.set(-0.225, 1.38, 0);
    const scNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.145, 0.018), new THREE.MeshBasicMaterial({ color: 0xd94436 }));
    scNeedle.position.set(-0.22, 1.42, 0.036);
    scNeedle.rotation.x = 0.45;
    // Blue crate resting on the scale!
    const scCrate = createFishCrateMesh(true, true, mats);
    scCrate.position.set(0.05, 0.18, 0);
    scaleG.add(scBase, scPan, scPost, scDialHousing, scDialFace, scNeedle, scCrate);
    wh.add(scaleG);

    // D. Auction Price Chalkboard (黑板上的拍卖价格) mounted prominently on back wall facing opening (+X)
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.25, 1.92), mats.chalkboard);
    board.position.set(-whD * 0.5 + whT + 0.04, 1.72, -0.55);
    board.castShadow = true;
    wh.add(board);
    // Chalk tray below board
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 1.85), mats.woodBench);
    tray.position.set(-whD * 0.5 + whT + 0.08, 1.09, -0.55);
    wh.add(tray);

    // E. Rain Boots Hanging on Wall Pegs (墙上挂着雨靴)
    const pegRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 1.55), mats.woodBench);
    pegRail.position.set(-whD * 0.5 + whT + 0.04, 1.62, 1.38);
    wh.add(pegRail);

    const bootColors = [mats.bootYellow, mats.bootYellow, mats.bootNavy, mats.bootNavy, mats.bootOlive, mats.bootOlive];
    bootColors.forEach((bMat, idx) => {
      const bx = -whD * 0.5 + whT + 0.16;
      const bz = 0.78 + idx * 0.24;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), mats.woodBench);
      peg.rotation.z = Math.PI / 2 - 0.35;
      peg.position.set(bx - 0.04, 1.66, bz);
      wh.add(peg);
      // Inverted rubber boot hanging sideways on peg so iconic L-shaped boot toe/heel silhouette is crystal clear!
      const bootG = new THREE.Group();
      bootG.position.set(bx + 0.05, 1.68, bz);
      bootG.rotation.y = 0.88;
      bootG.rotation.z = -0.18;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.38, 8), bMat);
      shaft.position.y = -0.15;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.095, 0.115), bMat);
      foot.position.set(0.075, 0.04, 0);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.028, 0.12), mats.steelBeam);
      sole.position.set(0.075, 0.095, 0);
      bootG.add(shaft, foot, sole);
      wh.add(bootG);
    });

    // F. Organic Soft-Feathered Reflective Wet Floor Puddle & Scattered Ice Cubes (地面反光水渍与散落冰块)
    const whPuddleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: window.HARBOR_MATERIALS.GLOBAL_UNIFORMS.uTime
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWp;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWp = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWp;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          float ang = atan(q.y, q.x);
          float rim = 0.78 + 0.14 * sin(ang * 3.0 + 0.8) + 0.08 * cos(ang * 5.0 - 0.6);
          float r = length(q);
          if (r > rim) discard;
          float m = smoothstep(rim, rim - 0.24, r);
          float shimmer = sin(vWp.x * 4.2 + uTime * 1.6) * cos(vWp.z * 3.8 - uTime * 1.2) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.42, 0.65, 0.72), vec3(0.86, 0.96, 0.96), 0.35 + 0.45 * smoothstep(0.4, 0.85, shimmer));
          gl_FragColor = vec4(col, m * 0.52);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    whPuddleMat.userData.isFX = true;
    const whPuddle1 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.5), whPuddleMat);
    whPuddle1.rotation.x = -Math.PI / 2;
    whPuddle1.position.set(0.65, 0.056, -0.05);
    wh.add(whPuddle1);
    const whPuddle2 = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.8), whPuddleMat);
    whPuddle2.rotation.x = -Math.PI / 2;
    whPuddle2.rotation.z = 0.7;
    whPuddle2.position.set(-0.85, 0.056, -0.95);
    wh.add(whPuddle2);

    // Scattered glistening ice cubes on wet warehouse floor
    const iceGeo = new THREE.BoxGeometry(0.065, 0.045, 0.065);
    for (let i = 0; i < 42; i++) {
      const cube = new THREE.Mesh(iceGeo, mats.ice);
      cube.position.set(
        -1.2 + rng() * 3.5,
        0.072,
        -2.2 + rng() * 4.4
      );
      cube.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
      cube.scale.set(0.7 + rng() * 0.9, 0.6 + rng() * 0.8, 0.7 + rng() * 0.9);
      wh.add(cube);
    }

    // G. Pale-Golden Volumetric Sunlight Shafts streaming through Clerestory Windows!
    const godRayMat = createGodRayMaterial(0.24);
    const rayDir = SUN_DIR.clone().negate().normalize(); // direction light travels into warehouse (-0.42, -0.78, -0.46)
    const rayQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), rayDir);

    // 3 shafts from South clerestory windows + 2 shafts from East transom windows
    const rayOrigins = [
      [-1.3, 2.90, whW * 0.5 - 0.15, 0.95, 3.8],
      [0.0, 2.90, whW * 0.5 - 0.15, 1.05, 3.8],
      [1.3, 2.90, whW * 0.5 - 0.15, 0.95, 3.8],
      [whD * 0.5 - 0.12, 3.12, -1.1, 1.15, 4.1],
      [whD * 0.5 - 0.12, 3.12, 1.0, 1.15, 4.1]
    ];
    rayOrigins.forEach(([ox, oy, oz, width, len]) => {
      const beamG = new THREE.Group();
      beamG.position.set(ox, oy, oz);
      beamG.quaternion.copy(rayQuat);
      // Crossed soft translucent planes so beam reads volumetrically from ANY camera angle!
      const pGeo = new THREE.PlaneGeometry(width, len);
      pGeo.translate(0, -len * 0.5, 0);
      const p1 = new THREE.Mesh(pGeo, godRayMat);
      const p2 = new THREE.Mesh(pGeo, godRayMat);
      p2.rotation.y = Math.PI / 2;
      beamG.add(p1, p2);
      wh.add(beamG);
    });

    // =========================================================================
    // 2. FERRY WAITING ROOM (候船室)
    //    Footprint: x in [-14.2, -9.0] (5.2m), z in [+3.8, +8.6] (4.8m)
    //    Center: (-11.6, DECK_Y, +6.2)
    //    HUGE Floor-to-Ceiling Clear Glass on BOTH East (+X) and South (+Z) sides!
    // =========================================================================
    const wr = new THREE.Group();
    wr.position.set(-11.6, DECK_Y, 6.2);
    group.add(wr);

    const wrW = 5.2; // X [-2.6, +2.6]
    const wrD = 4.8; // Z [-2.4, +2.4]
    const wrH = 2.75;
    const wrT = 0.14;

    // Raised interior vintage terrazzo-tiled floor + damp entry doormat!
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = 256; tileCanvas.height = 256;
    const tctx = tileCanvas.getContext('2d');
    tctx.fillStyle = '#cfd9d7';
    tctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        tctx.fillStyle = (r + c) % 2 === 0 ? '#d8e2e0' : '#c6d3d1';
        tctx.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
      }
    }
    const wrTileTex = new THREE.CanvasTexture(tileCanvas);
    wrTileTex.colorSpace = THREE.SRGBColorSpace;
    wrTileTex.wrapS = wrTileTex.wrapT = THREE.RepeatWrapping;
    wrTileTex.repeat.set(3.5, 3.5);
    const wrFloorMat = createCelMaterial({ color: 0xffffff, map: wrTileTex, wetness: 0.28, rim: 0.05 });
    const wrFloor = new THREE.Mesh(new THREE.BoxGeometry(wrW, 0.08, wrD), wrFloorMat);
    wrFloor.position.y = 0.04;
    wrFloor.receiveShadow = true;
    wr.add(wrFloor);
    // Subtle dark-teal rubber entryway mat inside East glass wall
    const doormat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.02, 1.15), mats.waitFrame);
    doormat.position.set(wrW * 0.5 - 0.55, 0.085, 0.95);
    wr.add(doormat);

    // West solid wall (-X = -2.6) & North solid wall (-Z = -2.4)
    const wrWest = new THREE.Mesh(new THREE.BoxGeometry(wrT, wrH, wrD), mats.waitWall);
    wrWest.position.set(-wrW * 0.5 + wrT * 0.5, wrH * 0.5, 0);
    wrWest.castShadow = true;
    wrWest.receiveShadow = true;
    wr.add(wrWest);
    const wrWestIn = new THREE.Mesh(new THREE.BoxGeometry(0.03, wrH - 0.1, wrD - 0.2), mats.waitInterior);
    wrWestIn.position.set(-wrW * 0.5 + wrT + 0.02, wrH * 0.5, 0);
    wr.add(wrWestIn);

    const wrNorth = new THREE.Mesh(new THREE.BoxGeometry(wrW, wrH, wrT), mats.waitWall);
    wrNorth.position.set(0, wrH * 0.5, -wrD * 0.5 + wrT * 0.5);
    wrNorth.castShadow = true;
    wrNorth.receiveShadow = true;
    wr.add(wrNorth);
    const wrNorthIn = new THREE.Mesh(new THREE.BoxGeometry(wrW - 0.2, wrH - 0.1, 0.03), mats.waitInterior);
    wrNorthIn.position.set(0, wrH * 0.5, -wrD * 0.5 + wrT + 0.02);
    wr.add(wrNorthIn);

    // East (+X) & South (+Z) FLOOR-TO-CEILING GLASS CURTAIN WALLS!
    // Corner & structural posts
    [
      [wrW * 0.5 - 0.06, -wrD * 0.5 + 0.06],
      [wrW * 0.5 - 0.06, wrD * 0.5 - 0.06],
      [-wrW * 0.5 + 0.06, wrD * 0.5 - 0.06]
    ].forEach(([px, pz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, wrH, 0.12), mats.waitFrame);
      col.position.set(px, wrH * 0.5, pz);
      col.castShadow = true;
      wr.add(col);
    });
    // Low base sill & top transom beam on East & South glass walls
    const eastSill = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, wrD), mats.waitFrame);
    eastSill.position.set(wrW * 0.5 - 0.06, 0.08, 0);
    const eastTop = eastSill.clone();
    eastTop.position.y = wrH - 0.08;
    wr.add(eastSill, eastTop);

    const southSill = new THREE.Mesh(new THREE.BoxGeometry(wrW, 0.16, 0.10), mats.waitFrame);
    southSill.position.set(0, 0.08, wrD * 0.5 - 0.06);
    const southTop = southSill.clone();
    southTop.position.y = wrH - 0.08;
    wr.add(southSill, southTop);

    // Slender window mullions (East & South)
    [-0.8, 0.8].forEach((mz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, wrH - 0.16, 0.05), mats.waitFrame);
      m.position.set(wrW * 0.5 - 0.06, wrH * 0.5, mz);
      wr.add(m);
    });
    [-0.85, 0.85].forEach((mx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, wrH - 0.16, 0.06), mats.waitFrame);
      m.position.set(mx, wrH * 0.5, wrD * 0.5 - 0.06);
      wr.add(m);
    });
    // Crisp clear glass panes
    const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(wrD - 0.2, wrH - 0.28), mats.glass);
    eastGlass.rotation.y = Math.PI / 2;
    eastGlass.position.set(wrW * 0.5 - 0.06, wrH * 0.5, 0);
    wr.add(eastGlass);

    const southGlass = new THREE.Mesh(new THREE.PlaneGeometry(wrW - 0.2, wrH - 0.28), mats.glass);
    southGlass.position.set(0, wrH * 0.5, wrD * 0.5 - 0.06);
    wr.add(southGlass);

    // Pitched Roof with deep seaside rain overhang + closed gable triangles!
    const wrRoofH = 1.05;
    const wrGableShape = new THREE.Shape();
    wrGableShape.moveTo(-wrW * 0.5, 0);
    wrGableShape.lineTo(wrW * 0.5, 0);
    wrGableShape.lineTo(0, wrRoofH);
    wrGableShape.closePath();
    [-wrD * 0.5 + 0.07, wrD * 0.5 - 0.07].forEach((gz) => {
      const gGeo = new THREE.ExtrudeGeometry(wrGableShape, { depth: 0.12, bevelEnabled: false });
      gGeo.translate(0, wrH, gz - 0.06);
      const gm = new THREE.Mesh(gGeo, mats.waitWall);
      gm.castShadow = true;
      wr.add(gm);
    });
    const wrSlopeLen = Math.hypot(wrW * 0.5 + 0.55, wrRoofH + 0.22);
    const wrSlopeAng = Math.atan2(wrRoofH, wrW * 0.5);
    const wrRoofSpan = wrD + 0.92;
    const wrRoofL = new THREE.Mesh(new THREE.BoxGeometry(wrSlopeLen, 0.09, wrRoofSpan), mats.waitRoof);
    wrRoofL.position.set(-(wrW * 0.25 + 0.14), wrH + wrRoofH * 0.5 - 0.04, 0);
    wrRoofL.rotation.z = wrSlopeAng;
    wrRoofL.castShadow = true;
    wrRoofL.receiveShadow = true;
    wr.add(wrRoofL);

    const wrRoofR = new THREE.Mesh(new THREE.BoxGeometry(wrSlopeLen, 0.09, wrRoofSpan), mats.waitRoof);
    wrRoofR.position.set(wrW * 0.25 + 0.14, wrH + wrRoofH * 0.5 - 0.04, 0);
    wrRoofR.rotation.z = -wrSlopeAng;
    wrRoofR.castShadow = true;
    wrRoofR.receiveShadow = true;
    wr.add(wrRoofR);

    // Galvanized waiting room eaves gutter & corner rainwater downspout!
    const wrGutter = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, wrRoofSpan), mats.waitFrame);
    wrGutter.position.set(wrW * 0.5 + 0.40, wrH - 0.16, 0);
    wr.add(wrGutter);
    const wrPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, wrH - 0.2, 8), mats.waitFrame);
    wrPipe.position.set(wrW * 0.5 + 0.04, (wrH - 0.2) * 0.5, -wrD * 0.5 + 0.12);
    wr.add(wrPipe);

    // Flat interior wood-trim ceiling
    const wrCeil = new THREE.Mesh(new THREE.BoxGeometry(wrW - 0.12, 0.08, wrD - 0.12), mats.waitInterior);
    wrCeil.position.y = wrH - 0.04;
    wr.add(wrCeil);

    // Waiting Room Signboard over East porch eaves
    const wrSign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 1.85), mats.waitSign);
    wrSign.position.set(wrW * 0.5 + 0.18, wrH + 0.10, 0);
    wr.add(wrSign);

    // ----- WAITING ROOM INTERIOR FURNISHINGS (EVERY required detail!) -----

    // A. Two Classic Wooden Benches (木长椅)
    function makeWoodenBench(len) {
      const bg = new THREE.Group();
      // Seat slats
      for (let i = 0; i < 3; i++) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.14), mats.woodBench);
        sl.position.set(0, 0.46, -0.16 + i * 0.16);
        sl.castShadow = true;
        sl.receiveShadow = true;
        bg.add(sl);
      }
      // Backrest slats
      for (let i = 0; i < 2; i++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.13, 0.045), mats.woodBench);
        bl.position.set(0, 0.70 + i * 0.17, -0.22);
        bl.rotation.x = -0.12;
        bl.castShadow = true;
        bg.add(bl);
      }
      // Legs & uprights
      [-len * 0.40, len * 0.40].forEach((lx) => {
        const legF = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.46, 0.07), mats.waitFrame);
        legF.position.set(lx, 0.23, 0.17);
        const legB = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.94, 0.07), mats.waitFrame);
        legB.position.set(lx, 0.47, -0.22);
        bg.add(legF, legB);
      });
      return bg;
    }
    // Bench 1 facing harbor (+X), positioned clearly visible behind both glass walls
    const bench1 = makeWoodenBench(2.1);
    bench1.rotation.y = Math.PI / 2;
    bench1.position.set(-1.35, 0.08, 0.55);
    wr.add(bench1);

    // Bench 2 along inner middle facing south (+Z)
    const bench2 = makeWoodenBench(1.85);
    bench2.position.set(0.55, 0.08, -1.25);
    wr.add(bench2);

    // B. Faded Ferry Timetable (褪色的航班时刻表) posted clearly on North interior wall (z = -2.23)
    const ttMesh = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.08, 0.04), mats.timetable);
    ttMesh.position.set(0.55, 1.48, -wrD * 0.5 + wrT + 0.05);
    wr.add(ttMesh);

    // C. Slightly Tilted Wall Clock (墙上的挂钟略微歪斜) mounted facing East (+X) on West back wall right above wooden bench!
    const clockMount = new THREE.Group();
    clockMount.position.set(-wrW * 0.5 + wrT + 0.07, 1.96, 0.55);
    clockMount.rotation.y = Math.PI / 2; // faces straight out through floor-to-ceiling East glass!
    // Tiny visible brass wall nail above rim so the ~11.5 deg crooked tilt feels charming & intentional
    const clockNail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6), mats.chrome);
    clockNail.rotation.x = Math.PI / 2;
    clockNail.position.set(0, 0.30, 0.015);
    clockMount.add(clockNail);
    const clockG = new THREE.Group();
    clockG.rotation.z = -0.20; // ~11.5 degrees unmistakably tilted!
    const clockRim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 20), mats.waitFrame);
    clockRim.rotation.x = Math.PI / 2;
    const clockFaceMesh = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), mats.clockFace);
    clockFaceMesh.position.z = 0.038;
    clockG.add(clockRim, clockFaceMesh);
    clockMount.add(clockG);
    wr.add(clockMount);

    // D. Vintage Radio (老式收音机) sitting on wooden side table near the East glass window
    const radioTable = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.62, 0.52), mats.woodBench);
    radioTable.position.set(1.65, 0.39, -1.55);
    radioTable.castShadow = true;
    wr.add(radioTable);

    const radioG = new THREE.Group();
    radioG.position.set(1.65, 0.70, -1.55);
    radioG.rotation.y = 1.15; // front speaker grille & warm glowing tuning dial face directly out toward the East/South glass!
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.18), mats.radioWood);
    rBody.position.y = 0.13;
    const rFront = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.20, 0.02), mats.radioFront);
    rFront.position.set(0, 0.13, 0.092);
    // Warm amber glowing tuning dial strip
    const rDial = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.025), new THREE.MeshBasicMaterial({ color: 0xffd680 }));
    rDial.position.set(0.08, 0.18, 0.095);
    // Speaker grille bars
    for (let s = 0; s < 4; s++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.025), mats.radioWood);
      bar.position.set(-0.09, 0.08 + s * 0.032, 0.095);
      radioG.add(bar);
    }
    // Telescopic chrome antenna leaning upward
    const rAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.48, 5), mats.chrome);
    rAnt.position.set(-0.14, 0.44, -0.04);
    rAnt.rotation.z = 0.24;
    radioG.add(rBody, rFront, rDial, rAnt);
    wr.add(radioG);

    // E. Corner Hot Water Kettle / Airpot (热水壶) & Potted Pothos Plant (一盆绿萝)
    const cornerTable = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.66, 0.75), mats.woodBench);
    cornerTable.position.set(-1.95, 0.41, -1.65);
    cornerTable.castShadow = true;
    wr.add(cornerTable);

    // Electric Hot Water Kettle / Airpot
    const kettleG = new THREE.Group();
    kettleG.position.set(-1.82, 0.74, -1.55);
    const kBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.34, 12), mats.kettleCream);
    kBody.position.y = 0.17;
    const kLid = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 12), mats.waitFrame);
    kLid.position.y = 0.35;
    const kSpout = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), mats.waitFrame);
    kSpout.position.set(0, 0.30, 0.13);
    const kStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.128, 0.05, 12), mats.crateBlue);
    kStripe.position.y = 0.24;
    kettleG.add(kBody, kLid, kSpout, kStripe);
    wr.add(kettleG);
    // Two tiny ceramic teacups beside kettle
    [-2.14, -2.06].forEach((cx, i) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 8), mats.freezerWhite);
      cup.position.set(cx, 0.775, -1.42 - i * 0.16);
      wr.add(cup);
    });

    // Potted Pothos Plant (一盆绿萝) with trailing heart-shaped green vines in corner!
    const potG = new THREE.Group();
    potG.position.set(-2.05, 0.08, -0.78);
    // Small wooden plant stool
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.38, 10), mats.woodBench);
    stool.position.y = 0.19;
    potG.add(stool);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.14, 0.28, 10), mats.terracotta);
    pot.position.y = 0.52;
    pot.castShadow = true;
    potG.add(pot);
    // Lush heart-shaped pothos foliage mound + cascading hanging vines draping gracefully down pot & stool!
    const leafGeo = new THREE.SphereGeometry(0.095, 7, 5);
    leafGeo.scale(1.18, 0.22, 1.38);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + rng() * 0.25;
      const isVine = i < 16;
      const vineStep = isVine ? (i % 4) : 0;
      const trail = isVine ? vineStep * 0.115 : 0;
      const rad = isVine ? 0.19 + vineStep * 0.045 : 0.04 + rng() * 0.18;
      const ly = isVine ? 0.68 - trail : 0.68 + rng() * 0.26;
      const leaf = new THREE.Mesh(leafGeo, mats.pothosLeaf);
      leaf.position.set(Math.cos(a) * rad, ly, Math.sin(a) * rad);
      leaf.rotation.set(0.45 + rng() * 0.45, -a, (rng() - 0.5) * 0.35);
      potG.add(leaf);
    }
    wr.add(potG);

    // Soft pale-gold sunlit window glow patch slanting through the waiting room floor-to-ceiling glass!
    const wrRayMat = createGodRayMaterial(0.14);
    const wrRay = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), wrRayMat);
    wrRay.position.set(1.1, 1.35, 0.3);
    wrRay.rotation.set(0.25, 0.42, 0.52);
    wr.add(wrRay);

    // =========================================================================
    // 3. GLOWING VENDING MACHINE WITH RUSTY RAIN AWNING (带锈蚀遮雨檐的自动贩卖机)
    //    Positioned cleanly beside Waiting Room South-East wall at (-8.35, DECK_Y, +8.45)
    // =========================================================================
    const vm = new THREE.Group();
    vm.position.set(-8.35, DECK_Y, 8.35);
    vm.rotation.y = 0.62; // angled toward East-South-East walkway so glowing drink showcase faces both harbor & dolly!
    group.add(vm);

    const vmW = 1.08, vmH = 1.92, vmD = 0.72;
    const vmMats = [
      mats.vendingBody,
      mats.vendingBody,
      mats.vendingBody,
      mats.vendingBody,
      mats.vendingFront, // +Z glowing showcase face!
      mats.vendingBody
    ];
    const vmBox = new THREE.Mesh(new THREE.BoxGeometry(vmW, vmH, vmD), vmMats);
    vmBox.position.y = vmH * 0.5;
    vmBox.castShadow = true;
    vmBox.receiveShadow = true;
    vm.add(vmBox);

    // Subtle soft warm glow halo over the vending machine wet ground & lightbox
    const vmGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfff6d4,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    vmGlowMat.userData.isFX = true;
    const vmHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.15), vmGlowMat);
    vmHalo.position.set(0, 1.25, vmD * 0.5 + 0.03);
    vm.add(vmHalo);

    const vmGroundSpill = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), vmGlowMat);
    vmGroundSpill.rotation.x = -Math.PI / 2;
    vmGroundSpill.position.set(0, 0.025, 0.78);
    vm.add(vmGroundSpill);

    // Rusty corrugated steel rain canopy / awning overhead!
    const awning = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 1.08), mats.rustyAwning);
    awning.position.set(0.15, vmH + 0.30, 0.16);
    awning.rotation.x = 0.22;
    awning.castShadow = true;
    vm.add(awning);
    // Flush rusty iron awning rafters tucked cleanly UNDER roof slope + twin vertical rear posts (zero roof poke-through!)
    [-0.46, 0.46].forEach((bx) => {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.92), mats.rustyIron);
      rafter.position.set(bx + 0.12, vmH + 0.24, 0.14);
      rafter.rotation.x = 0.22; // matches awning slope cleanly underneath!
      const vPost = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.045), mats.rustyIron);
      vPost.position.set(bx + 0.08, vmH + 0.16, -0.26);
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.42), mats.rustyIron);
      knee.position.set(bx + 0.08, vmH + 0.12, -0.08);
      knee.rotation.x = -0.52;
      vm.add(rafter, vPost, knee);
    });

    // Matching coastal can recycling bin beside vending machine (with recessed round can-drop slot!)
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.72, 0.42), mats.crateWhite);
    bin.position.set(0.78, 0.36, 0.05);
    bin.castShadow = true;
    const binTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.44), mats.crateBlue);
    binTop.position.set(0.78, 0.76, 0.05);
    const binHoleRim = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.012, 6, 16), mats.chrome);
    binHoleRim.rotation.x = Math.PI / 2;
    binHoleRim.position.set(0.78, 0.824, 0.05);
    const binHole = new THREE.Mesh(new THREE.CircleGeometry(0.082, 16), new THREE.MeshBasicMaterial({ color: 0x1c2b33 }));
    binHole.rotation.x = -Math.PI / 2;
    binHole.position.set(0.78, 0.825, 0.05);
    vm.add(bin, binTop, binHoleRim, binHole);

    return {
      group,
      warehouse: wh,
      waitingRoom: wr,
      vendingMachine: vm
    };
  }

  window.HARBOR_BUILDINGS = { buildBuildings };
})();
