// Harbor Street Corner Props, Lamp Posts + Power Lines, Bollards + Wet Ropes,
// Drying Fishing Net & Float Strings, Winch & Jib Crane, Numbered Buoys, Dip Nets & Buckets,
// Harbor Signboard, Windsock & Flags, Overturned Wooden Skiff, Instrument Hard Cases & Clear Dripping Umbrella
(function () {
  const {
    DECK_Y, WATER_Y, PALETTE, createRNG, lerp, clamp, getSeabedY, getLocalGust
  } = window.HARBOR;
  const TEX = window.HARBOR_TEXTURES;
  const { createCelMaterial, createAnimeGlassMaterial } = window.HARBOR_MATERIALS;

  // Build catenary curve tube between two 3D points with given sag
  function createCatenaryTube(p1, p2, sag, radius, mat, segs) {
    const pts = [];
    const n = segs || 16;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = new THREE.Vector3().lerpVectors(p1, p2, u);
      p.y -= Math.sin(u * Math.PI) * sag;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, n, radius, 5, false);
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function buildProps(scene) {
    const group = new THREE.Group();
    group.name = 'HarborProps';
    scene.add(group);

    const rng = createRNG(4040);

    // Textures
    const signTex = TEX.createHarborSignTexture();
    const netTex = TEX.createFishingNetTexture();
    const skiffWoodTex = TEX.createWoodTexture('#a27b56');
    const buoyTex02 = TEX.createBuoyTexture('02', '#e87846');
    const buoyTex03 = TEX.createBuoyTexture('03', '#5293b5');
    const buoyTex07 = TEX.createBuoyTexture('07', '#e06c3e');
    const ropeTex = TEX.createRopeTexture();

    const mats = {
      lampPole: createCelMaterial({ color: 0x798f96, wetness: 0.35, rim: 0.24 }),
      lampHood: createCelMaterial({ color: 0x5c757e, wetness: 0.55, rim: 0.30, side: THREE.DoubleSide }),
      lampInner: createCelMaterial({ color: 0xf4f7f2, emissive: 0xfff0c2, emissiveIntensity: 0.22, wetness: 0.2 }),
      lampBulb: new THREE.MeshBasicMaterial({ color: 0xfff5d4 }),
      wireDark: createCelMaterial({ color: 0x26353d, wetness: 0.15, rim: 0.10 }),
      // Matte black cast-iron bollard (explicitly low wetness for matte contrast!)
      bollardMatte: createCelMaterial({ color: PALETTE.bollardBlack, wetness: 0.05, rim: 0.18, shadowStrength: 0.50 }),
      ropeDry: createCelMaterial({ color: 0xffffff, map: ropeTex, wetness: 0.18, rim: 0.16 }),
      ropeWet: createCelMaterial({ color: 0x8a4832, map: ropeTex, wetness: 0.58, rim: 0.16 }),
      ropeGrad: createCelMaterial({ color: 0xffffff, map: ropeTex, vertexColors: true, wetness: 0.36, rim: 0.16 }),
      rainBeadGold: new THREE.MeshBasicMaterial({ color: 0xfff4c4 }),
      // Foreground still-life
      caseSilver: createCelMaterial({ color: 0xcbd5da, wetness: 0.52, rim: 0.34 }),
      caseTrim: createCelMaterial({ color: 0x45555e, wetness: 0.38, rim: 0.24 }),
      chrome: createCelMaterial({ color: 0xe6eff2, wetness: 0.72, rim: 0.38 }),
      umbrellaCanopy: createAnimeGlassMaterial({ color: 0xebfbfd, opacity: 0.26, rainDrops: true }),
      umbrellaHandle: createCelMaterial({ color: 0xf0f4f5, wetness: 0.45, rim: 0.24 }),
      // Slipway skiff
      skiffWood: createCelMaterial({ color: 0xffffff, map: skiffWoodTex, wetness: 0.45, rim: 0.20 }),
      skiffBottom: createCelMaterial({ color: 0x9c5544, wetness: 0.50, rim: 0.22 }),
      skiffTrim: createCelMaterial({ color: 0x4a828c, wetness: 0.45, rim: 0.22 }),
      // Hardware & crates
      rustyIron: createCelMaterial({ color: 0x86503b, wetness: 0.30, rim: 0.24 }),
      steelGrey: createCelMaterial({ color: 0x6f848c, wetness: 0.35, rim: 0.22 }),
      crateWhite: createCelMaterial({ color: PALETTE.crateWhite, wetness: 0.62, rim: 0.26 }),
      crateBlue: createCelMaterial({ color: PALETTE.crateBlue, wetness: 0.64, rim: 0.28 }),
      bucketRed: createCelMaterial({ color: 0xd95f4a, wetness: 0.60, rim: 0.26 }),
      bucketYellow: createCelMaterial({ color: 0xeec242, wetness: 0.60, rim: 0.26 }),
      bamboo: createCelMaterial({ color: 0xc2ab76, wetness: 0.30, rim: 0.20 }),
      netMesh: createCelMaterial({
        color: 0xffffff,
        map: netTex,
        alphaTest: 0.28,
        transparent: true,
        side: THREE.DoubleSide,
        wetness: 0.25,
        rim: 0.20
      }),
      floatOrange: createCelMaterial({ color: 0xf0713d, wetness: 0.65, rim: 0.32 }),
      floatYellow: createCelMaterial({ color: 0xf2cb46, wetness: 0.65, rim: 0.30 }),
      floatWhite: createCelMaterial({ color: 0xf2f7f8, wetness: 0.62, rim: 0.30 }),
      floatGlass: createCelMaterial({ color: 0x76cfc4, wetness: 0.72, rim: 0.35 }),
      signFace: createCelMaterial({ color: 0xffffff, map: signTex, wetness: 0.35, rim: 0.20 }),
      flagRed: createCelMaterial({ color: 0xe05243, wetness: 0.35, rim: 0.24, side: THREE.DoubleSide }),
      flagWhite: createCelMaterial({ color: 0xf5f9fa, wetness: 0.35, rim: 0.24, side: THREE.DoubleSide }),
      flagYellow: createCelMaterial({ color: 0xf2c944, wetness: 0.35, rim: 0.24, side: THREE.DoubleSide }),
      flagBlue: createCelMaterial({ color: 0x458cb8, wetness: 0.35, rim: 0.24, side: THREE.DoubleSide }),
      buoy02: createCelMaterial({ color: 0xffffff, map: buoyTex02, wetness: 0.55, rim: 0.28 }),
      buoy03: createCelMaterial({ color: 0xffffff, map: buoyTex03, wetness: 0.55, rim: 0.28 }),
      buoy07: createCelMaterial({ color: 0xffffff, map: buoyTex07, wetness: 0.55, rim: 0.28 })
    };

    // Exported hooks for other systems (water drips, bollard mooring/perches, buoy wake rocking)
    const dripPoints = [];
    const bollards = {};
    const buoys = [];

    // =========================================================================
    // 1. QUAY LAMP POSTS WITH CIRCULAR RING SHADES + OVERHEAD POWER LINES
    // =========================================================================
    const lampSpecs = [
      { id: 'L1', x: -6.25, z: 8.15, rotY: 0.75, h: 4.45 },
      { id: 'L2', x: 1.35, z: 8.15, rotY: 2.35, h: 4.35 },
      { id: 'L3', x: -6.30, z: 2.55, rotY: 0.0, h: 4.45 }, // cleanly beside alley, never blocks warehouse shutter!
      { id: 'L4', x: -6.25, z: -6.35, rotY: 0.45, h: 4.55 },
      { id: 'L5', x: -9.85, z: 13.85, rotY: -0.55, h: 4.35 }
    ];
    const lampWireAnchors = {};

    lampSpecs.forEach((sp) => {
      const lg = new THREE.Group();
      lg.position.set(sp.x, DECK_Y, sp.z);
      lg.rotation.y = sp.rotY;

      // Bolted base plinth
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.38, 10), mats.lampPole);
      base.position.y = 0.19;
      base.castShadow = true;
      lg.add(base);

      // Tapered steel mast
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.092, sp.h, 10), mats.lampPole);
      pole.position.y = sp.h * 0.5;
      pole.castShadow = true;
      lg.add(pole);

      // Small cross-arm insulator bar near top for overhead power lines
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), mats.steelGrey);
      crossArm.position.set(0, sp.h - 0.32, 0);
      lg.add(crossArm);
      [-0.25, 0.25].forEach((iz) => {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 6), mats.crateWhite);
        ins.position.set(0, sp.h - 0.26, iz);
        lg.add(ins);
      });

      // Curved horizontal lamp arm extending toward harbor (+X local)
      const armCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, sp.h - 0.08, 0),
        new THREE.Vector3(0.35, sp.h + 0.24, 0),
        new THREE.Vector3(0.88, sp.h + 0.18, 0),
        new THREE.Vector3(1.02, sp.h + 0.02, 0)
      ]);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.032, 6, false), mats.lampPole);
      arm.castShadow = true;
      lg.add(arm);

      // Distinctive Circular Ring Shade (圆环形灯罩) — outer ring brim + stepped dome cap + inner reflector!
      const shadeG = new THREE.Group();
      shadeG.position.set(1.02, sp.h - 0.04, 0);
      const hoodCap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.16, 16, 1, true), mats.lampHood);
      hoodCap.position.y = 0.08;
      // Distinct circular outer ring flange around lamp hood!
      const ringFlange = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.034, 8, 22), mats.lampHood);
      ringFlange.rotation.x = Math.PI / 2;
      ringFlange.position.y = 0.01;
      const innerDisk = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), mats.lampInner);
      innerDisk.rotation.x = Math.PI / 2;
      innerDisk.position.y = 0.015;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mats.lampBulb);
      bulb.position.y = -0.04;
      shadeG.add(hoodCap, ringFlange, innerDisk, bulb);
      // Sparkling warm-gold sunlit raindrop beads clinging along circular lamp hood rim!
      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * Math.PI * 2 + 0.3;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), mats.rainBeadGold);
        bead.position.set(Math.cos(ba) * 0.34, -0.012, Math.sin(ba) * 0.34);
        shadeG.add(bead);
      }
      lg.add(shadeG);

      group.add(lg);

      // Compute world positions for overhead wires and lamp-hood rain drips
      lg.updateMatrixWorld(true);
      const wirePt = new THREE.Vector3(0, sp.h - 0.24, 0).applyMatrix4(lg.matrixWorld);
      lampWireAnchors[sp.id] = wirePt;
      const dripPt = new THREE.Vector3(1.30, sp.h - 0.05, 0).applyMatrix4(lg.matrixWorld);
      dripPoints.push({ pos: dripPt, floorY: DECK_Y + 0.02, phase: rng() * 10 });
    });

    // Hillside wooden utility pole anchor for diagonal sky wires
    const hillPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 8), mats.wireDark);
    hillPole.position.set(-10.2, 6.2, -9.8);
    hillPole.castShadow = true;
    group.add(hillPole);
    const hillAnchor = new THREE.Vector3(-10.2, 8.3, -9.8);

    // Slender Overhead Power Lines crossing diagonally across the bright sky!
    const wirePairs = [
      [lampWireAnchors.L5, lampWireAnchors.L2, 0.62],
      [lampWireAnchors.L5, lampWireAnchors.L1, 0.38],
      [lampWireAnchors.L2, lampWireAnchors.L1, 0.45],
      [lampWireAnchors.L1, lampWireAnchors.L3, 0.52],
      [lampWireAnchors.L3, lampWireAnchors.L4, 0.40],
      [lampWireAnchors.L4, hillAnchor, 0.58],
      [lampWireAnchors.L3, new THREE.Vector3(-8.8, DECK_Y + 3.55, -1.7), 0.25],
      [lampWireAnchors.L1, new THREE.Vector3(-9.0, DECK_Y + 2.85, 6.2), 0.22]
    ];
    wirePairs.forEach(([a, b, sag]) => {
      // Twin parallel slender cables
      group.add(createCatenaryTube(a, b, sag, 0.013, mats.wireDark, 16));
      const a2 = a.clone().add(new THREE.Vector3(0, -0.14, 0.12));
      const b2 = b.clone().add(new THREE.Vector3(0, -0.14, 0.12));
      group.add(createCatenaryTube(a2, b2, sag + 0.06, 0.011, mats.wireDark, 16));
    });

    // =========================================================================
    // 2. MATTE BLACK CAST-IRON BOLLARDS & COARSE WET MOORING ROPES
    // =========================================================================
    const bollardSpecs = [
      { id: 'B_W1', x: -5.92, z: 3.85, y: DECK_Y, hangWater: true, waterDir: [1, 0] },
      { id: 'B_W2', x: -5.92, z: 0.15, y: DECK_Y, hangWater: false },
      { id: 'B_W3', x: -5.92, z: -0.58, y: DECK_Y, hangWater: false },
      { id: 'B_W4', x: -5.92, z: -4.95, y: DECK_Y, hangWater: false },
      { id: 'B_F1', x: -1.15, z: 7.98, y: DECK_Y, hangWater: false },
      { id: 'B_F2', x: 1.35, z: 7.98, y: DECK_Y, hangWater: false },
      { id: 'B_FE1', x: 1.52, z: 12.65, y: DECK_Y, hangWater: false }, // sits above boarding platform (no concrete clip!)
      { id: 'B_FE2', x: 1.52, z: 15.65, y: DECK_Y, hangWater: true, waterDir: [1, 0] },
      { id: 'B_BW1', x: -1.45, z: -6.02, y: 1.55, hangWater: false },
      { id: 'B_BW2', x: 2.55, z: -6.02, y: 1.55, hangWater: false }
    ];

    bollardSpecs.forEach((bs) => {
      const bg = new THREE.Group();
      bg.position.set(bs.x, bs.y, bs.z);

      // Base bolted plate
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.06, 12), mats.bollardMatte);
      plate.position.y = 0.03;
      plate.castShadow = true;
      plate.receiveShadow = true;
      bg.add(plate);

      // Cast-iron vertical barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.42, 12), mats.bollardMatte);
      barrel.position.y = 0.25;
      barrel.castShadow = true;
      bg.add(barrel);

      // Flared mushroom cap with side lip
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.11, 12), mats.bollardMatte);
      cap.position.y = 0.49;
      cap.castShadow = true;
      bg.add(cap);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
        mats.bollardMatte
      );
      dome.position.y = 0.53;
      bg.add(dome);

      // 3 coiled turns of thick coarse orange-red mooring rope around bollard waist!
      for (let c = 0; c < 3; c++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.026, 7, 16), mats.ropeDry);
        coil.rotation.x = Math.PI / 2 + (c - 1) * 0.06;
        coil.position.y = 0.18 + c * 0.052;
        coil.castShadow = true;
        bg.add(coil);
      }

      // Seamless single continuous rope trailing cleanly OVER the yellow-black wheel curb & dipping into water!
      if (bs.hangWater) {
        const dx = bs.waterDir[0], dz = bs.waterDir[1];
        const edgeDist = 0.52;
        const fullCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dx * 0.16, 0.28, dz * 0.16),
          new THREE.Vector3(dx * (edgeDist * 0.55), 0.24, dz * (edgeDist * 0.55)),
          new THREE.Vector3(dx * edgeDist, 0.185, dz * edgeDist), // clears the 0.15m hazard curb cleanly!
          new THREE.Vector3(dx * (edgeDist + 0.11), -(bs.y - 0.36), dz * (edgeDist + 0.11)),
          new THREE.Vector3(dx * (edgeDist + 0.16), -bs.y, dz * (edgeDist + 0.16)),
          new THREE.Vector3(dx * (edgeDist + 0.24), -bs.y - 0.78, dz * (edgeDist + 0.24))
        ]);
        const rGeo = new THREE.TubeGeometry(fullCurve, 26, 0.026, 7, false);
        const rPos = rGeo.attributes.position;
        const rColors = new Float32Array(rPos.count * 3);
        const colDry = new THREE.Color(0xffffff);
        const colSoaked = new THREE.Color(0x5a2c1c);
        const cTmp = new THREE.Color();
        for (let vi = 0; vi < rPos.count; vi++) {
          const wy = bs.y + rPos.getY(vi);
          // Smoothly darken soaked rope below y = +0.32m above waterline!
          const wetFrac = 1.0 - clamp((wy - 0.02) / 0.38, 0, 1);
          cTmp.copy(colDry).lerp(colSoaked, wetFrac);
          rColors[vi * 3 + 0] = cTmp.r;
          rColors[vi * 3 + 1] = cTmp.g;
          rColors[vi * 3 + 2] = cTmp.b;
        }
        rGeo.setAttribute('color', new THREE.BufferAttribute(rColors, 3));
        const hangRope = new THREE.Mesh(rGeo, mats.ropeGrad);
        hangRope.castShadow = true;
        bg.add(hangRope);
      }

      group.add(bg);
      bollards[bs.id] = {
        pos: new THREE.Vector3(bs.x, bs.y + 0.26, bs.z),
        topPos: new THREE.Vector3(bs.x, bs.y + 0.61, bs.z)
      };
    });

    // =========================================================================
    // 3. HUMAN-JUST-LEFT FOREGROUND STILL LIFE (Section 4.3)
    //    - Two Silver-Gray Instrument Hard Cases side by side
    //    - Transparent Umbrella leaning against concrete steps (with rain beads + rim drips!)
    // =========================================================================

    // 3A. Two Silver-Gray Instrument Hard Cases at foreground quay (x = -0.45..+0.45, z = +10.2..+10.7)
    const casesGroup = new THREE.Group();
    casesGroup.position.set(-0.35, DECK_Y, 10.25);
    group.add(casesGroup);

    function createInstrumentCase(len, height, depth, upright) {
      const cg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, height, depth), mats.caseSilver);
      body.castShadow = true;
      body.receiveShadow = true;
      cg.add(body);

      // Aluminum perimeter trim seam band
      const seam = new THREE.Mesh(new THREE.BoxGeometry(len + 0.012, height + 0.012, 0.032), mats.caseTrim);
      cg.add(seam);

      // Reinforced corner bumpers (8 corners)
      const cGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
      [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
        const corner = new THREE.Mesh(cGeo, mats.caseTrim);
        corner.position.set(sx * (len * 0.5 - 0.01), sy * (height * 0.5 - 0.01), sz * (depth * 0.5 - 0.01));
        cg.add(corner);
      })));

      // Molded horizontal ribs on outer silver shell
      for (let r = -1; r <= 1; r++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(len * 0.82, 0.018, depth + 0.012), mats.chrome);
        rib.position.y = r * (height * 0.24);
        cg.add(rib);
      }

      // Chrome butterfly latches & black molded carrying handle on top
      [-len * 0.28, len * 0.28].forEach((lx) => {
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), mats.chrome);
        latch.position.set(lx, height * 0.5 + 0.01, 0);
        cg.add(latch);
      });
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 10, Math.PI), mats.caseTrim);
      handle.position.set(0, height * 0.5 + 0.005, 0);
      cg.add(handle);

      if (upright) {
        cg.position.y = height * 0.5 + 0.015;
      } else {
        cg.rotation.x = Math.PI / 2;
        cg.position.y = depth * 0.5 + 0.015;
      }
      return cg;
    }

    // Larger guitar/euphonium/wind-band silver hard case standing cleanly upright
    const case1 = createInstrumentCase(1.04, 0.40, 0.17, true);
    case1.position.set(-0.22, 0.215, 0.0);
    case1.rotation.y = 0.22;
    // Tiny subtle music-club & coastal wave stickers on front shell (after-school charm!)
    const stickerBlue = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.065),
      createCelMaterial({ color: 0x4ca2c4, wetness: 0.4, rim: 0.1 })
    );
    stickerBlue.position.set(-0.26, 0.07, 0.088);
    stickerBlue.rotation.z = 0.12;
    const stickerYellow = new THREE.Mesh(
      new THREE.CircleGeometry(0.036, 12),
      createCelMaterial({ color: 0xf4c842, wetness: 0.4, rim: 0.1 })
    );
    stickerYellow.position.set(-0.14, 0.03, 0.088);
    case1.add(stickerBlue, stickerYellow);
    casesGroup.add(case1);

    // Second matching silver-gray hard case placed right beside it (slightly angled naturally!)
    const case2 = createInstrumentCase(0.76, 0.34, 0.16, true);
    case2.position.set(0.32, 0.185, 0.34);
    case2.rotation.y = 0.36;
    const stickerRed = new THREE.Mesh(
      new THREE.PlaneGeometry(0.085, 0.052),
      createCelMaterial({ color: 0xe66a4c, wetness: 0.4, rim: 0.1 })
    );
    stickerRed.position.set(0.16, 0.05, 0.083);
    stickerRed.rotation.z = -0.14;
    case2.add(stickerRed);
    casesGroup.add(case2);

    // 3B. Transparent Vinyl Umbrella leaning firmly against concrete steps (handle & canopy rim flush on concrete!)
    const umbPivot = new THREE.Group();
    umbPivot.position.set(0.64, DECK_Y + 0.355, 8.80);
    umbPivot.rotation.set(0.34, -0.45, -0.60); // curved white J-handle touches concrete deck solidly!
    group.add(umbPivot);

    // Clear curved vinyl canopy dome (classic Japanese vinyl umbrella with crisp white vinyl piping rim!)
    const canopyGeo = new THREE.SphereGeometry(0.56, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.44);
    canopyGeo.scale(1.0, 0.74, 1.0);
    const canopy = new THREE.Mesh(canopyGeo, mats.umbrellaCanopy);
    canopy.position.y = 0.06;
    umbPivot.add(canopy);
    // Crisp white vinyl rim piping around canopy scallop edge so umbrella silhouette pops clearly!
    const rimPts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const dip = (i % 2 === 1) ? 0.025 : 0.0;
      rimPts.push(new THREE.Vector3(Math.cos(a) * 0.548, 0.138 + dip, Math.sin(a) * 0.548));
    }
    const umbPiping = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 32, 0.011, 5, true),
      mats.umbrellaHandle
    );
    umbPivot.add(umbPiping);

    // 8 slender visible steel umbrella ribs along canopy seams + central shaft + tip + white J-handle!
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.46, 0),
        new THREE.Vector3(Math.cos(a) * 0.30, 0.38, Math.sin(a) * 0.30),
        new THREE.Vector3(Math.cos(a) * 0.55, 0.14, Math.sin(a) * 0.55)
      ]);
      const rib = new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 8, 0.006, 4, false), mats.chrome);
      umbPivot.add(rib);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.94, 6), mats.chrome);
    shaft.position.y = 0.04;
    umbPivot.add(shaft);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.011, 0.08, 6), mats.umbrellaHandle);
    ferrule.position.y = 0.52;
    umbPivot.add(ferrule);
    // Classic curved white J-handle at bottom of shaft
    const jHook = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 6, 10, Math.PI), mats.umbrellaHandle);
    jHook.position.set(0.065, -0.43, 0);
    jHook.rotation.z = Math.PI;
    umbPivot.add(jHook);

    // Glistening 3D warm-gold sunlit rain beads clinging to the clear umbrella canopy & rim!
    const beadGeo = new THREE.SphereGeometry(0.011, 6, 5);
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rng() * 0.4;
      const phi = 0.28 + rng() * 1.05; // angle down from umbrella apex
      const r = 0.562;
      const bx = Math.sin(phi) * Math.cos(a) * r;
      const by = Math.cos(phi) * r * 0.74 + 0.06;
      const bz = Math.sin(phi) * Math.sin(a) * r;
      const bead = new THREE.Mesh(beadGeo, mats.rainBeadGold);
      bead.position.set(bx, by, bz);
      bead.scale.setScalar(0.65 + rng() * 0.75);
      umbPivot.add(bead);
    }

    // Export lowest rim points of the leaning umbrella for periodic glistening rain drips!
    umbPivot.updateMatrixWorld(true);
    const umbDrip1 = new THREE.Vector3(0.54, 0.14, 0.0).applyMatrix4(umbPivot.matrixWorld);
    const umbDrip2 = new THREE.Vector3(0.38, 0.14, 0.38).applyMatrix4(umbPivot.matrixWorld);
    dripPoints.push({ pos: umbDrip1, floorY: DECK_Y + 0.01, phase: 0.7 });
    dripPoints.push({ pos: umbDrip2, floorY: DECK_Y + 0.01, phase: 2.3 });

    // =========================================================================
    // 4. OVERTURNED HALF-HAULED WOODEN SKIFF ON THE SLIPWAY (倒扣的小木舢板)
    //    Propped tilted slightly on wooden chocks at (-4.10, z=+5.78), opening a clear
    //    cozy shelter nook facing +Z/+X right where the Harbor Cat sits out of the rain!
    // =========================================================================
    const slipAng = Math.atan2(DECK_Y + 0.35, 3.8); // ~0.42 rad
    const skiffU = 0.35; // x ≈ -4.17
    const skiffX = lerp(-5.5, -1.7, skiffU);
    const skiffY = lerp(DECK_Y, -0.35, skiffU);

    const skiffGroup = new THREE.Group();
    skiffGroup.position.set(skiffX, skiffY + 0.42, 5.75);
    skiffGroup.rotation.order = 'YXZ';
    skiffGroup.rotation.z = -slipAng; // pitched parallel to slipway!
    skiffGroup.rotation.x = -0.36;    // tilted gently open toward +Z (foreground walkway & camera!)
    group.add(skiffGroup);

    // Two weathered wooden trestle/chock blocks propping the overturned skiff cleanly for hull drying!
    [-0.78, 0.72].forEach((cx) => {
      const chock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.24), mats.skiffWood);
      chock.position.set(cx, -0.22, -0.38);
      chock.castShadow = true;
      chock.receiveShadow = true;
      skiffGroup.add(chock);
    });

    // Hollowed Overturned Wooden Skiff Hull (built from curved tapered wooden shell panels so underside is genuinely hollow!)
    // Length 2.7m along X, beam 1.18m along Z, resting inverted (keel up at y = +0.56, gunwales down at y = -0.02!)
    const hullLen = 2.65;
    const hullSegsX = 12;
    const hullSegsU = 10;
    const skPositions = [];
    const skUvs = [];
    const skIndices = [];
    for (let ix = 0; ix <= hullSegsX; ix++) {
      const tx = ix / hullSegsX; // 0 = stern (-X, landward), 1 = bow (+X, seaward)
      const x = (tx - 0.5) * hullLen;
      // Traditional Japanese wasen skiff planform: tapered pointed bow (+X), narrow flat stern (-X)
      const halfBeam = 0.58 * Math.sin(Math.pow(tx, 0.72) * Math.PI * 0.92 + 0.14);
      const archH = 0.54 * (0.78 + 0.22 * Math.sin(tx * Math.PI));
      for (let iu = 0; iu <= hullSegsU; iu++) {
        const u = iu / hullSegsU; // 0..1 across cross-section from -Z gunwale over keel to +Z gunwale
        const ang = (u - 0.5) * Math.PI; // -pi/2 to +pi/2
        const z = Math.sin(ang) * halfBeam;
        // Flat-ish inverted wooden chine hull bottom
        const y = Math.pow(Math.cos(ang), 0.75) * archH;
        skPositions.push(x, y, z);
        skUvs.push(tx * 2.0, u);
      }
    }
    const stride = hullSegsU + 1;
    for (let ix = 0; ix < hullSegsX; ix++) {
      for (let iu = 0; iu < hullSegsU; iu++) {
        const a = ix * stride + iu;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        skIndices.push(a, b, c, b, d, c);
      }
    }
    const skGeo = new THREE.BufferGeometry();
    skGeo.setAttribute('position', new THREE.Float32BufferAttribute(skPositions, 3));
    skGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skUvs, 2));
    skGeo.setIndex(skIndices);
    skGeo.computeVertexNormals();

    const skHullMat = mats.skiffWood.clone();
    skHullMat.side = THREE.DoubleSide;
    const skHull = new THREE.Mesh(skGeo, skHullMat);
    skHull.castShadow = true;
    skHull.receiveShadow = true;
    skiffGroup.add(skHull);

    // Raised exterior wooden keel spine along top of inverted hull
    const keel = new THREE.Mesh(new THREE.BoxGeometry(hullLen * 0.86, 0.065, 0.07), mats.skiffBottom);
    keel.position.set(-0.04, 0.55, 0);
    keel.castShadow = true;
    skiffGroup.add(keel);
    // Painted sea-teal gunwale rails along inverted bottom edges
    [-1, 1].forEach((side) => {
      const gunCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-hullLen * 0.48, 0.01, side * 0.30),
        new THREE.Vector3(-0.2, 0.01, side * 0.58),
        new THREE.Vector3(0.65, 0.01, side * 0.46),
        new THREE.Vector3(hullLen * 0.48, 0.02, side * 0.08)
      ]);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(gunCurve, 12, 0.032, 6, false), mats.skiffTrim);
      skiffGroup.add(rail);
    });

    // Cozy dry sheltered world position right under the lifted south-east rim of the overturned skiff!
    skiffGroup.updateMatrixWorld(true);
    const catX = -3.96;
    const catZ = 6.08;
    const catY = lerp(DECK_Y, -0.35, clamp((catX + 5.5) / 3.8, 0, 1)) + 0.02;
    const catShelterPos = new THREE.Vector3(catX, catY, catZ);

    // =========================================================================
    // 5. RUSTY HAND-CRANK WINCH & SMALL HARBOR JIB CRANE
    // =========================================================================
    // 5A. Hand-Crank Winch at top of slipway (-6.05, DECK_Y, +5.95)
    const winch = new THREE.Group();
    winch.position.set(-6.05, DECK_Y, 5.95);
    group.add(winch);
    const wPad = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.72), mats.steelGrey);
    wPad.position.y = 0.07;
    winch.add(wPad);
    [-0.24, 0.24].forEach((wz) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.06), mats.rustyIron);
      frame.position.set(0, 0.42, wz);
      frame.castShadow = true;
      winch.add(frame);
    });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12), mats.ropeWet);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0.52, 0);
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14), mats.rustyIron);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(0, 0.52, 0.29);
    // Hand crank arm & wooden grip
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.04), mats.rustyIron);
    crankArm.position.set(0.12, 0.65, 0.34);
    crankArm.rotation.z = -0.65;
    const crankGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.15, 7), mats.skiffWood);
    crankGrip.rotation.x = Math.PI / 2;
    crankGrip.position.set(0.23, 0.76, 0.42);
    winch.add(drum, gear, crankArm, crankGrip);

    // Cable connecting winch drum to overturned skiff stern!
    const skiffSternW = new THREE.Vector3(-hullLen * 0.48, 0.12, 0).applyMatrix4(skiffGroup.matrixWorld);
    group.add(createCatenaryTube(
      new THREE.Vector3(-5.90, DECK_Y + 0.52, 5.95),
      skiffSternW,
      0.06,
      0.014,
      mats.rustyIron,
      10
    ));

    // 5B. Small Harbor Jib Crane / Davit outside Fish Co-op Warehouse (-6.15, DECK_Y, -2.55)
    const crane = new THREE.Group();
    crane.position.set(-6.15, DECK_Y, -2.55);
    crane.rotation.y = 0.58; // angles gracefully over water beside Boat 2, separating hook from radar dome!
    group.add(crane);
    const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.22, 10), mats.rustyIron);
    cBase.position.y = 0.11;
    const cPost = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 2.35, 10), mats.rustyIron);
    cPost.position.y = 1.28;
    cPost.castShadow = true;
    const cBoom = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.11, 0.11), mats.rustyIron);
    cBoom.position.set(0.75, 2.55, 0);
    cBoom.rotation.z = 0.26;
    cBoom.castShadow = true;
    // Exact mortise diagonal knee brace: connects mast (0.04, 1.66) solidly to boom centerline (0.78, 2.54) with zero gap & zero top poke-through!
    const cStrut = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.075, 0.075), mats.rustyIron);
    cStrut.position.set(0.41, 2.10, 0);
    cStrut.rotation.z = 0.872;
    // Small rusted side hand-reel drum & pulley sheave on jib crane post
    const cReel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), mats.steelGrey);
    cReel.rotation.x = Math.PI / 2;
    cReel.position.set(0.12, 1.15, 0.10);
    const cSheave = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), mats.steelGrey);
    cSheave.rotation.x = Math.PI / 2;
    cSheave.position.set(1.52, 2.75, 0);
    // Hanging hoist cable & iron hook (gently sways in breeze!)
    const hookPivot = new THREE.Group();
    hookPivot.position.set(1.52, 2.74, 0);
    const hoistWire = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 1.05, 5), mats.wireDark);
    hoistWire.position.y = -0.525;
    const pulleyBlock = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.08), mats.rustyIron);
    pulleyBlock.position.y = -1.06;
    const hookCurve = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 6, 10, Math.PI * 1.45), mats.rustyIron);
    hookCurve.position.y = -1.20;
    hookCurve.rotation.z = Math.PI * 0.75;
    hookPivot.add(hoistWire, pulleyBlock, hookCurve);
    crane.add(cBase, cPost, cBoom, cStrut, cReel, cSheave, hookPivot);

    // =========================================================================
    // 6. DRYING FISHING NET ON IRON RACK & FLOAT-STRUNG ROPES (Animated by Gusts!)
    //    Positioned prominently on the wide foreground quay at (-4.35, DECK_Y, +10.2)
    // =========================================================================
    const netRack = new THREE.Group();
    netRack.position.set(-4.35, DECK_Y, 10.2);
    netRack.rotation.y = 0.28;
    group.add(netRack);

    const rackW = 3.15, rackH = 1.92;
    // Weathered steel pipe A-frame legs & top bar
    [-rackW * 0.5, rackW * 0.5].forEach((rx) => {
      [-0.36, 0.36].forEach((rz) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, rackH + 0.08, 7), mats.rustyIron);
        leg.position.set(rx, rackH * 0.5, rz * 0.5);
        leg.rotation.x = rz > 0 ? 0.19 : -0.19;
        leg.castShadow = true;
        netRack.add(leg);
      });
      const footBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.76, 6), mats.rustyIron);
      footBar.rotation.x = Math.PI / 2;
      footBar.position.set(rx, 0.16, 0);
      netRack.add(footBar);
    });
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, rackW + 0.32, 8), mats.rustyIron);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.y = rackH;
    topBar.castShadow = true;
    netRack.add(topBar);

    // High-subdivision draped Fishing Net geometry with organic scalloped hem & gathered folds!
    const netGeo = new THREE.PlaneGeometry(rackW - 0.16, rackH - 0.24, 18, 12);
    netGeo.translate(0, -(rackH - 0.24) * 0.5, 0);
    const np = netGeo.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const nx = np.getX(i);
      const ny = np.getY(i);
      const drop = clamp(-ny / (rackH - 0.24), 0, 1);
      const u = (nx / (rackW - 0.16)) + 0.5; // 0..1
      // Organic scalloped lower hem (draped in two gentle swags!)
      const swag = 0.78 + 0.24 * Math.abs(Math.sin(u * Math.PI * 2.0));
      const foldZ = Math.sin(u * Math.PI * 5.0) * 0.055 * drop;
      np.setY(i, ny * swag);
      np.setZ(i, foldZ);
    }
    netGeo.computeVertexNormals();
    const netBasePos = Float32Array.from(netGeo.attributes.position.array);
    const netMeshFront = new THREE.Mesh(netGeo, mats.netMesh);
    netMeshFront.position.set(0, rackH, 0.04);
    netMeshFront.castShadow = true;
    netRack.add(netMeshFront);

    const netGeoBack = netGeo.clone();
    const netMeshBack = new THREE.Mesh(netGeoBack, mats.netMesh);
    netMeshBack.position.set(0, rackH, -0.04);
    netRack.add(netMeshBack);

    // Two Hanging Rope Garlands Strung with Glossy Coastal Fishing Floats (缀满浮球的绳串)
    const floatGarlands = [];
    const floatPalette = [mats.floatOrange, mats.floatYellow, mats.floatWhite, mats.floatOrange, mats.floatGlass];
    function addFloatGarland(parent, x, y, z, length, count) {
      const fg = new THREE.Group();
      fg.position.set(x, y, z);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, length, 5), mats.ropeDry);
      rope.position.y = -length * 0.5;
      fg.add(rope);
      for (let i = 0; i < count; i++) {
        const fy = -0.18 - (i / Math.max(1, count - 1)) * (length - 0.34);
        const fMat = floatPalette[(i + Math.floor(rng() * 5)) % floatPalette.length];
        const fMesh = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), fMat);
        fMesh.scale.set(1.0, 1.22, 1.0);
        fMesh.position.y = fy;
        fMesh.castShadow = true;
        fg.add(fMesh);
      }
      parent.add(fg);
      fg.updateMatrixWorld(true);
      const wp = new THREE.Vector3().setFromMatrixPosition(fg.matrixWorld);
      floatGarlands.push({ group: fg, worldX: wp.x, worldZ: wp.z, phase: rng() * Math.PI * 2 });
    }
    netRack.updateMatrixWorld(true);
    addFloatGarland(netRack, rackW * 0.5 + 0.10, rackH - 0.02, 0.04, 1.48, 6);
    addFloatGarland(netRack, -rackW * 0.5 - 0.10, rackH - 0.02, 0.04, 1.35, 5);
    addFloatGarland(netRack, 0.72, rackH - 0.02, 0.12, 1.18, 5);
    // Horizontal draped float-rope across front of rack
    const horizFloats = new THREE.Group();
    horizFloats.position.set(0, rackH - 0.02, 0.10);
    for (let i = 0; i < 9; i++) {
      const u = (i + 0.5) / 9;
      const fx = lerp(-rackW * 0.44, rackW * 0.44, u);
      const fy = -0.14 - Math.sin(u * Math.PI) * 0.24;
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 7), floatPalette[i % floatPalette.length]);
      fl.position.set(fx, fy, 0.04);
      horizFloats.add(fl);
    }
    netRack.add(horizFloats);

    // =========================================================================
    // 7. WET STACKED PLASTIC FISH BOXES & BLUE CRATES + DIP NETS & BUCKETS
    // =========================================================================
    function addExteriorCrateStack(x, z, count, isBlue, rotY) {
      const w = 0.62, h = 0.28, d = 0.42;
      const m = isBlue ? mats.crateBlue : mats.crateWhite;
      for (let i = 0; i < count; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        box.position.set(x + (rng() - 0.5) * 0.03, DECK_Y + h * 0.5 + i * (h + 0.005), z + (rng() - 0.5) * 0.03);
        box.rotation.y = rotY + (rng() - 0.5) * 0.08;
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
        // Molded white/blue rim accent
        const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.035, d + 0.03), m);
        rim.position.set(box.position.x, box.position.y + h * 0.45, box.position.z);
        rim.rotation.y = box.rotation.y;
        group.add(rim);
      }
    }
    // Outside Fish Co-op Warehouse apron
    addExteriorCrateStack(-7.65, -3.55, 4, false, 0.10);
    addExteriorCrateStack(-7.55, -2.95, 3, true, -0.08);
    addExteriorCrateStack(-7.85, 0.95, 3, false, 0.14);
    addExteriorCrateStack(-7.15, 1.25, 2, true, 0.04);
    // In cozy alleyway between Warehouse & Waiting Room
    addExteriorCrateStack(-8.55, 2.55, 3, true, 0.05);
    addExteriorCrateStack(-8.45, 3.10, 2, false, -0.12);
    // Near foreground quay & drying net
    addExteriorCrateStack(-6.15, 9.65, 3, false, 0.22);
    addExteriorCrateStack(-6.05, 10.22, 2, true, -0.10);

    // Long-Handled Dip Nets & Plastic Buckets leaning against walls (靠在墙边的长柄网兜和水桶)
    function addDipNet(x, z, rotY) {
      const ng = new THREE.Group();
      ng.position.set(x, DECK_Y, z);
      ng.rotation.y = rotY;
      ng.rotation.z = -0.16; // leaning softly against wall!
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.95, 6), mats.bamboo);
      handle.position.y = 0.98;
      handle.castShadow = true;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.014, 6, 14), mats.chrome);
      hoop.position.set(0, 2.16, 0);
      hoop.rotation.y = Math.PI / 2;
      const scoop = new THREE.Mesh(
        new THREE.ConeGeometry(0.23, 0.34, 10, 1, true),
        mats.netMesh
      );
      scoop.rotation.z = Math.PI / 2;
      scoop.position.set(-0.16, 2.16, 0);
      ng.add(handle, hoop, scoop);
      group.add(ng);
    }
    addDipNet(-8.58, 1.45, 0.15);
    addDipNet(-8.58, 1.18, -0.10);
    addDipNet(-8.78, 4.18, 0.08);

    // Plastic harbor buckets near walls & warehouse door
    function addBucket(x, y, z, mat) {
      const bg = new THREE.Group();
      bg.position.set(x, y, z);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.135, 0.32, 12), mat);
      b.position.y = 0.16;
      b.castShadow = true;
      b.receiveShadow = true;
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.008, 5, 12, Math.PI), mats.chrome);
      wire.position.y = 0.30;
      wire.rotation.x = 0.55;
      bg.add(b, wire);
      group.add(bg);
    }
    addBucket(-8.35, DECK_Y, 1.62, mats.crateBlue);
    addBucket(-8.35, DECK_Y + 0.14, 1.62, mats.bucketRed);
    addBucket(-8.42, DECK_Y, 4.35, mats.bucketYellow);
    addBucket(-6.85, DECK_Y, 8.85, mats.crateBlue);

    // =========================================================================
    // 8. NUMBERED MOORING BUOYS IN HARBOR BAY (涂有褪色编号的系船浮标)
    // =========================================================================
    const buoyConfigs = [
      { id: '02', x: 3.6, z: 3.2, mat: mats.buoy02, r: 0.44, h: 0.68, phase: 0.4 },
      { id: '03', x: 5.1, z: -1.6, mat: mats.buoy03, r: 0.46, h: 0.72, phase: 2.1 },
      { id: '07', x: 7.6, z: 8.4, mat: mats.buoy07, r: 0.48, h: 0.75, phase: 4.3 }
    ];
    const buoyFoamMat = new THREE.MeshBasicMaterial({
      color: 0xf4fbfc,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    buoyFoamMat.userData.isFX = true;

    buoyConfigs.forEach((bc) => {
      const bg = new THREE.Group();
      bg.position.set(bc.x, WATER_Y, bc.z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(bc.r, bc.r * 0.94, bc.h, 16), bc.mat);
      body.position.y = -0.02;
      body.castShadow = true;
      body.receiveShadow = true;
      const topCap = new THREE.Mesh(new THREE.CylinderGeometry(bc.r * 0.72, bc.r, 0.14, 16), mats.steelGrey);
      topCap.position.y = bc.h * 0.5 + 0.04;
      const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.026, 6, 12), mats.rustyIron);
      topRing.position.y = bc.h * 0.5 + 0.20;
      const botCone = new THREE.Mesh(new THREE.ConeGeometry(bc.r * 0.88, 0.36, 14), mats.rustyIron);
      botCone.rotation.x = Math.PI;
      botCone.position.y = -bc.h * 0.5 - 0.16;
      // Crisp cel-shaded circular foam collar right at waterline so buoy visibly floats in water!
      const foamCollar = new THREE.Mesh(new THREE.RingGeometry(bc.r * 0.96, bc.r * 1.48, 18), buoyFoamMat);
      foamCollar.rotation.x = -Math.PI / 2;
      foamCollar.position.y = 0.025;
      bg.add(body, topCap, topRing, botCone, foamCollar);

      // Gentle slack curved anchor chain descending organically all the way into a grounded seabed sinker block!
      const bedY = getSeabedY(bc.x, bc.z);
      const chainCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -bc.h * 0.5 - 0.28, 0),
        new THREE.Vector3(0.26, bedY * 0.42, 0.14),
        new THREE.Vector3(0.16, bedY * 0.78, -0.18),
        new THREE.Vector3(-0.10, bedY - 0.14, -0.14)
      ]);
      const chainLine = new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 14, 0.024, 5, false), mats.rustyIron);
      bg.add(chainLine);

      // Grounded mossy concrete seabed mooring sinker block directly beneath buoy anchor chain (world-fixed!)
      const sinker = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.46), mats.steelGrey);
      sinker.position.set(bc.x - 0.10, bedY + 0.02, bc.z - 0.14);
      sinker.rotation.y = bc.phase * 0.7;
      sinker.receiveShadow = true;
      group.add(sinker);

      group.add(bg);
      buoys.push({
        group: bg,
        baseX: bc.x,
        baseZ: bc.z,
        phase: bc.phase,
        wakeEnergy: 0
      });
    });

    // =========================================================================
    // 9. FADED HARBOR WARNING SIGNBOARD (港名 + "注意落水")
    // =========================================================================
    const signG = new THREE.Group();
    signG.position.set(0.95, DECK_Y, 13.75);
    signG.rotation.y = 0.42; // faces slightly toward foreground corner & camera!
    group.add(signG);

    [-0.52, 0.52].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.035, 1.80, 8), mats.steelGrey);
      post.position.set(px, 0.90, 0);
      post.castShadow = true;
      signG.add(post);
    });
    // Twin horizontal galvanized mounting channels behind signboard clamping cleanly onto the twin posts!
    [1.12, 1.64].forEach((cy) => {
      const channel = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.045, 0.035), mats.steelGrey);
      channel.position.set(0, cy, 0.022);
      signG.add(channel);
    });
    const signPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.88, 0.050),
      [mats.steelGrey, mats.steelGrey, mats.steelGrey, mats.steelGrey, mats.signFace, mats.steelGrey]
    );
    signPanel.position.set(0, 1.38, 0.058); // mounted cleanly IN FRONT of twin steel posts (zero pole bleed-through on lettering!)
    signPanel.castShadow = true;
    signPanel.receiveShadow = true;
    signG.add(signPanel);

    // =========================================================================
    // 10. WIND-TILTED WINDSOCK & HARBOR PENNANT FLAGS (被海风吹得歪斜的风向袋与小旗)
    //     Positioned clearly at breakwater root corner (-4.75, 1.55, -6.25) AND a second flag pole near drying net (-2.25, DECK_Y, 8.85)!
    // =========================================================================
    const sockMast = new THREE.Group();
    sockMast.position.set(-4.65, 1.55, -6.25);
    group.add(sockMast);

    const mastH = 3.85;
    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.052, mastH, 8), mats.steelGrey);
    mastPole.position.y = mastH * 0.5;
    mastPole.castShadow = true;
    sockMast.add(mastPole);
    const mastFinial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.crateWhite);
    mastFinial.position.y = mastH + 0.03;
    sockMast.add(mastFinial);

    // Articulated 5-segment Red-and-White Windsock pivoting from top swivel ring!
    const sockPivot = new THREE.Group();
    sockPivot.position.set(0, mastH - 0.14, 0);
    sockMast.add(sockPivot);
    const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5), mats.chrome);
    swivel.rotation.z = Math.PI / 2;
    swivel.position.x = -0.12;
    sockPivot.add(swivel);

    const sockSegments = [];
    let parentSeg = sockPivot;
    for (let i = 0; i < 5; i++) {
      const segPivot = new THREE.Group();
      segPivot.position.x = i === 0 ? -0.22 : -0.26;
      const r0 = lerp(0.18, 0.075, i / 5);
      const r1 = lerp(0.18, 0.075, (i + 1) / 5);
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, 0.27, 10, 1, true),
        i % 2 === 0 ? mats.flagRed : mats.flagWhite
      );
      cone.rotation.z = Math.PI / 2;
      cone.position.x = -0.135;
      cone.castShadow = true;
      segPivot.add(cone);
      parentSeg.add(segPivot);
      sockSegments.push(segPivot);
      parentSeg = segPivot;
    }

    // Second closer flagpole right by the drying net rack (-2.35, DECK_Y, +9.15) with windsock + harbor pennants
    // so Tour Shot 6 captures net + float ropes + windsock + small flags ALL in one dramatic wind-gust frame!
    const fgFlagPole = new THREE.Group();
    fgFlagPole.position.set(-2.35, DECK_Y, 9.15);
    group.add(fgFlagPole);
    const fgMast = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.042, 3.15, 8), mats.steelGrey);
    fgMast.position.y = 1.575;
    fgMast.castShadow = true;
    fgFlagPole.add(fgMast);

    // Compact red-white windsock on foreground quay mast too
    const fgSockPivot = new THREE.Group();
    fgSockPivot.position.set(0, 3.04, 0);
    fgFlagPole.add(fgSockPivot);
    const fgSockSegs = [];
    let fgPrev = fgSockPivot;
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Group();
      sp.position.x = i === 0 ? -0.15 : -0.21;
      const r0 = lerp(0.13, 0.06, i / 4);
      const r1 = lerp(0.13, 0.06, (i + 1) / 4);
      const c = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, 0.22, 10, 1, true),
        i % 2 === 0 ? mats.flagRed : mats.flagWhite
      );
      c.rotation.z = Math.PI / 2;
      c.position.x = -0.11;
      sp.add(c);
      fgPrev.add(sp);
      fgSockSegs.push(sp);
      fgPrev = sp;
    }

    // Small triangular harbor pennants strung from fgFlagPole (-2.35, 9.15) to netRack (-4.35, 10.2) AND breakwater mast!
    const pennants = [];
    const flagMats = [mats.flagRed, mats.flagYellow, mats.flagBlue, mats.flagWhite];
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0);
    triShape.lineTo(0.28, 0);
    triShape.lineTo(0.14, -0.34);
    triShape.closePath();
    const triGeo = new THREE.ShapeGeometry(triShape);

    function addPennantString(pA, pB, count, sag) {
      group.add(createCatenaryTube(pA, pB, sag, 0.008, mats.wireDark, 12));
      const dir = new THREE.Vector3().subVectors(pB, pA);
      const yaw = Math.atan2(dir.x, dir.z);
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count;
        const pos = new THREE.Vector3().lerpVectors(pA, pB, u);
        pos.y -= Math.sin(u * Math.PI) * sag;
        const fPivot = new THREE.Group();
        fPivot.position.copy(pos);
        fPivot.rotation.y = yaw + Math.PI / 2;
        const fMesh = new THREE.Mesh(triGeo, flagMats[i % flagMats.length]);
        fMesh.position.x = -0.14;
        fPivot.add(fMesh);
        group.add(fPivot);
        pennants.push({
          pivot: fPivot,
          worldX: pos.x,
          worldZ: pos.z,
          phase: i * 0.75 + rng() * 1.2
        });
      }
    }
    addPennantString(
      new THREE.Vector3(-2.35, DECK_Y + 2.82, 9.15),
      new THREE.Vector3(-4.35, DECK_Y + 2.10, 10.2),
      6, 0.24
    );
    addPennantString(
      new THREE.Vector3(-4.65, 1.55 + 3.45, -6.25),
      new THREE.Vector3(-6.25, DECK_Y + 3.55, -6.35),
      5, 0.22
    );

    // =========================================================================
    // 11. FAR-LEFT FOREGROUND QUAY QUIET COASTAL TOWN TRACES (Balances 360° Diorama!)
    //     Two parked retro Japanese mamachari bicycles (after-school charm, zero humans!),
    //     coiled rope pallet, weathered coastal utility cabinet & storm drain grate!
    // =========================================================================
    function createRetroBicycle(frameMat) {
      const bg = new THREE.Group();
      const wheelGeo = new THREE.TorusGeometry(0.28, 0.026, 7, 18);
      const rimGeo = new THREE.TorusGeometry(0.25, 0.010, 5, 16);
      // Front (+X) and Rear (-X) wheels
      [-0.50, 0.50].forEach((wx) => {
        const tire = new THREE.Mesh(wheelGeo, mats.bollardMatte);
        tire.position.set(wx, 0.30, 0);
        tire.castShadow = true;
        const rim = new THREE.Mesh(rimGeo, mats.chrome);
        rim.position.set(wx, 0.30, 0);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6), mats.chrome);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(wx, 0.30, 0);
        bg.add(tire, rim, hub);
      });
      // Step-through mamachari frame tubes
      const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 6), frameMat);
      seatTube.position.set(-0.14, 0.52, 0);
      seatTube.rotation.z = 0.24;
      const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.68, 6), frameMat);
      downTube.position.set(0.14, 0.45, 0);
      downTube.rotation.z = -0.92;
      const headTube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.62, 6), frameMat);
      headTube.position.set(0.42, 0.60, 0);
      headTube.rotation.z = 0.24;
      const rearStay = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.50, 5), frameMat);
      rearStay.position.set(-0.34, 0.46, 0);
      rearStay.rotation.z = -0.68;
      // Curved handlebars & wire front basket + saddle
      const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 6), mats.chrome);
      handleBar.rotation.x = Math.PI / 2;
      handleBar.position.set(0.36, 0.89, 0);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.13), mats.bollardMatte);
      saddle.position.set(-0.22, 0.82, 0);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.30), mats.steelGrey);
      basket.position.set(0.54, 0.72, 0);
      basket.castShadow = true;
      bg.add(seatTube, downTube, headTube, rearStay, handleBar, saddle, basket);
      return bg;
    }

    const bikeTealMat = createCelMaterial({ color: 0x5aa4a8, wetness: 0.48, rim: 0.28 });
    const bikeCreamMat = createCelMaterial({ color: 0xeee8d6, wetness: 0.48, rim: 0.28 });
    const bike1 = createRetroBicycle(bikeTealMat);
    bike1.position.set(-12.6, DECK_Y, 9.55);
    bike1.rotation.set(0.12, 0.38, 0); // leaning casually on kickstand!
    group.add(bike1);

    const bike2 = createRetroBicycle(bikeCreamMat);
    bike2.position.set(-11.4, DECK_Y, 9.75);
    bike2.rotation.set(-0.10, 0.18, 0);
    group.add(bike2);

    // Wooden pallet stacked with coiled orange mooring rope & extra blue crates at far-left quay (-13.2, +13.6)
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 1.15), mats.skiffWood);
    pallet.position.set(-13.1, DECK_Y + 0.06, 13.5);
    pallet.rotation.y = 0.14;
    pallet.castShadow = true;
    pallet.receiveShadow = true;
    group.add(pallet);
    for (let r = 0; r < 3; r++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32 - r * 0.04, 0.055, 7, 16), mats.ropeDry);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(-13.4, DECK_Y + 0.17 + r * 0.095, 13.45);
      coil.castShadow = true;
      group.add(coil);
    }
    addExteriorCrateStack(-12.65, 13.55, 2, true, 0.18);

    // Coastal galvanized harbor electrical/utility box beside waiting room west wall (-14.7, +6.6)
    const utilBox = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.35, 0.85), mats.lampPole);
    utilBox.position.set(-14.7, DECK_Y + 0.675, 6.6);
    utilBox.castShadow = true;
    utilBox.receiveShadow = true;
    const utilRoof = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.07, 0.95), mats.rustyIron);
    utilRoof.position.set(-14.7, DECK_Y + 1.37, 6.6);
    utilRoof.rotation.z = 0.08;
    group.add(utilBox, utilRoof);

    // Slotted Japanese roadside harbor storm drain grates (側溝グレーチング — concrete frame + steel bars!)
    [11.8, 7.2, 2.6, -2.0].forEach((gz) => {
      const gg = new THREE.Group();
      gg.position.set(-7.15, DECK_Y + 0.006, gz);
      const pit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.66), mats.bollardMatte);
      gg.add(pit);
      // Pale concrete edge rim + 7 parallel steel grate bars
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.010, 0.72), mats.steelGrey);
      frame.position.y = -0.002;
      gg.add(frame);
      for (let b = -3; b <= 3; b++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.016, 0.032), mats.lampPole);
        bar.position.set(0, 0.003, b * 0.09);
        gg.add(bar);
      }
      group.add(gg);
    });

    // =========================================================================
    // Animation Update (Causal Wind Gusts on Net, Floats, Windsocks, Pennants + Buoy Wake Rocking)
    // =========================================================================
    function update(t, wakeSources) {
      // 1. Drying Fishing Net wave billow (propagates smoothly from seaward side!)
      const netGust = getLocalGust(-4.35, 10.2, t);
      const netWind = 0.24 + netGust * 1.15;
      const posF = netGeo.attributes.position;
      const posB = netGeoBack.attributes.position;
      for (let i = 0; i < posF.count; i++) {
        const bx = netBasePos[i * 3];
        const by = netBasePos[i * 3 + 1];
        const drop = clamp(-by / (rackH - 0.22), 0, 1); // 0 at top bar, 1 at free bottom hem
        const flutter =
          Math.sin(t * (3.2 + netWind * 3.8) + bx * 2.4 + by * 2.0) * 0.065 * netWind +
          Math.cos(t * 2.1 + bx * 1.5) * 0.035;
        const billow = -drop * drop * (0.09 + netWind * 0.38) + flutter * drop;
        posF.setZ(i, billow);
        posB.setZ(i, billow * 0.85 - 0.02);
      }
      posF.needsUpdate = true;
      posB.needsUpdate = true;

      // 2. Float-strung ropes swaying in wind
      for (let i = 0; i < floatGarlands.length; i++) {
        const fg = floatGarlands[i];
        const g = getLocalGust(fg.worldX, fg.worldZ, t);
        const amp = 0.06 + g * 0.34;
        fg.group.rotation.z = Math.sin(t * (2.3 + g * 2.5) + fg.phase) * amp + g * 0.22;
        fg.group.rotation.x = Math.cos(t * 1.9 + fg.phase) * amp * 0.7 - g * 0.16;
      }

      // 3. Windsocks (breakwater & foreground mast) — gentle droop in light breeze, lifting & whipping in gusts!
      function animateWindsock(pivot, segs, wx, wz, phaseOff) {
        const g = getLocalGust(wx, wz, t);
        // Aim downwind toward (-X, -Z), with subtle wind shift
        pivot.rotation.y = 0.65 + Math.sin(t * 0.9 + phaseOff) * 0.16 + g * 0.18;
        // Droop lifts up toward horizontal as gust hits!
        const lift = lerp(-0.58, -0.06, clamp(g * 1.15 + 0.18, 0, 1));
        pivot.rotation.z = lift + Math.sin(t * (4.2 + g * 5.0) + phaseOff) * (0.05 + g * 0.08);
        for (let s = 0; s < segs.length; s++) {
          segs[s].rotation.z = Math.sin(t * (5.2 + g * 6.5) - s * 0.95 + phaseOff) * (0.04 + g * 0.10) - (1 - g) * 0.06;
          segs[s].rotation.y = Math.cos(t * (4.8 + g * 5.5) - s * 0.85 + phaseOff) * (0.05 + g * 0.12);
        }
      }
      animateWindsock(sockPivot, sockSegments, -4.65, -6.25, 0.0);
      animateWindsock(fgSockPivot, fgSockSegs, -2.35, 9.15, 1.4);

      // 4. Small triangular pennants fluttering sequentially along gust path!
      for (let i = 0; i < pennants.length; i++) {
        const p = pennants[i];
        const g = getLocalGust(p.worldX, p.worldZ, t);
        const speed = 3.6 + g * 8.5;
        p.pivot.rotation.x = 0.24 + g * 0.72 + Math.sin(t * speed + p.phase) * (0.14 + g * 0.34);
      }

      // 5. Crane hook slight pendulum sway
      const craneG = getLocalGust(-6.15, -2.55, t);
      hookPivot.rotation.z = Math.sin(t * 1.45) * (0.03 + craneG * 0.12);
      hookPivot.rotation.x = Math.cos(t * 1.2) * (0.02 + craneG * 0.08);

      // 6. Mooring Buoys bobbing + causal wake rocking when Boat 4 passes!
      for (let i = 0; i < buoys.length; i++) {
        const b = buoys[i];
        let wakeAmp = 0;
        if (wakeSources && wakeSources.length > 0) {
          for (let w = 0; w < wakeSources.length; w++) {
            const ws = wakeSources[w];
            const dist = Math.hypot(b.baseX - ws.x, b.baseZ - ws.z);
            const ringDist = Math.abs(dist - ws.radius);
            if (ringDist < 2.2) {
              wakeAmp += Math.exp(-(ringDist * ringDist) / 1.2) * ws.strength;
            }
          }
        }
        const bob = Math.sin(t * 1.85 + b.phase) * 0.055 + Math.sin(t * 5.2 + b.phase) * wakeAmp * 0.14;
        b.group.position.y = WATER_Y + bob;
        b.group.rotation.z = Math.sin(t * 1.45 + b.phase) * 0.075 + Math.sin(t * 4.6 + b.phase) * wakeAmp * 0.28;
        b.group.rotation.x = Math.cos(t * 1.28 + b.phase) * 0.065 + Math.cos(t * 4.1 + b.phase) * wakeAmp * 0.22;
      }
    }

    return {
      group,
      bollards,
      buoys,
      dripPoints,
      catShelterPos,
      update
    };
  }

  window.HARBOR_PROPS = { buildProps };
})();
