// 4 Detailed Japanese Harbor Boats (1 Open Fishing Boat + 3 Full-Interior Cabin Boats),
// Dynamic Catenary Mooring Ropes, Departing Boat 4 Excursion + Crisp Cel Wake Trail & Wake Waves,
// and Distant Passing Fishing Boat beyond Far Breakwater
(function () {
  const { DECK_Y, WATER_Y, PALETTE, SUN_DIR, createRNG, lerp, clamp, smoothstep, evaluateBoat4Trip } = window.HARBOR;
  const TEX = window.HARBOR_TEXTURES;
  const { createCelMaterial, createAnimeGlassMaterial, createGodRayMaterial } = window.HARBOR_MATERIALS;

  // Build sculpted curved Japanese FRP fishing boat hull (flared pointed bow at +Z local, flat transom stern at -Z local)
  function createBoatHullGeometry(len, beam, depth) {
    const segZ = 18;
    const segU = 12;
    const positions = [];
    const uvs = [];
    const indices = [];

    // Split at keel (u=0.5) cleanly so port (-X) and starboard (+X) hull sides both read Japanese boat lettering forward!
    const sideCount = segU / 2;
    for (let side = 0; side < 2; side++) {
      const baseVertex = positions.length / 3;
      for (let iz = 0; iz <= segZ; iz++) {
        const tz = iz / segZ; // 0 = stern (-len/2), 1 = bow (+len/2)
        const z = (tz - 0.5) * len;
        const beamProfile = tz < 0.52
          ? 0.90 + 0.10 * Math.sin((tz / 0.52) * Math.PI * 0.5)
          : Math.pow(Math.cos(((tz - 0.52) / 0.48) * Math.PI * 0.5), 0.72);
        const halfB = Math.max(0.02, beam * 0.5 * beamProfile);
        const sheerRise = Math.pow(Math.max(0, tz - 0.35) / 0.65, 1.8) * (depth * 0.42);
        const keelRise = Math.pow(Math.max(0, tz - 0.65) / 0.35, 1.8) * (depth * 0.34);

        for (let iu = 0; iu <= sideCount; iu++) {
          const frac = iu / sideCount; // 0 = keel, 1 = gunwale
          const s = side === 0 ? -frac : frac;
          const absS = frac;
          const flare = 1.0 + 0.08 * Math.pow(absS, 2) * (0.4 + 0.6 * tz);
          const x = s * halfB * flare;
          const yNorm = Math.pow(absS, 1.65);
          const y = lerp(-depth * 0.42 + keelRise, depth * 0.58 + sheerRise, yNorm);
          positions.push(x, y, z);
          // Split U across halves: Port [0..0.5] stern->bow, Starboard [0.5..1.0] bow->stern -> single right-reading bow name & stern registry on each side!
          uvs.push(side === 0 ? tz * 0.5 : 0.5 + (1.0 - tz) * 0.5, absS);
        }
      }
      const stride = sideCount + 1;
      for (let iz = 0; iz < segZ; iz++) {
        for (let iu = 0; iu < sideCount; iu++) {
          const a = baseVertex + iz * stride + iu;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          // Outward-facing counter-clockwise triangle winding so FrontSide is hull exterior & BackSide is clean interior liner!
          if (side === 0) indices.push(a, c, b, b, c, d);
          else indices.push(a, b, c, b, d, c);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Flat recessed deck surface shaped to boat planform
  function createDeckGeometry(len, beam, yLevel) {
    const shape = new THREE.Shape();
    const n = 16;
    // Starboard edge stern->bow
    for (let i = 0; i <= n; i++) {
      const tz = i / n;
      const z = (tz - 0.5) * len * 0.96;
      const bp = tz < 0.52
        ? 0.90 + 0.10 * Math.sin((tz / 0.52) * Math.PI * 0.5)
        : Math.pow(Math.cos(((tz - 0.52) / 0.48) * Math.PI * 0.5), 0.72);
      const x = Math.max(0.02, beam * 0.46 * bp);
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    // Port edge bow->stern
    for (let i = n; i >= 0; i--) {
      const tz = i / n;
      const z = (tz - 0.5) * len * 0.96;
      const bp = tz < 0.52
        ? 0.90 + 0.10 * Math.sin((tz / 0.52) * Math.PI * 0.5)
        : Math.pow(Math.cos(((tz - 0.52) / 0.48) * Math.PI * 0.5), 0.72);
      const x = -Math.max(0.02, beam * 0.46 * bp);
      shape.lineTo(x, z);
    }
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    // ShapeGeometry maps shape.y -> -z when rotated -PI/2; flip Z back cleanly!
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, -pos.getZ(i));
      pos.setY(i, yLevel);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Orange-and-white maritime life ring (橙白色救生圈)
  function createLifeRing(mats) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.055, 8, 18), mats.lifeOrange);
    ring.castShadow = true;
    g.add(ring);
    // 4 crisp white reflective bands around ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.059, 6, 6, 0.42), mats.boatWhite);
      band.rotation.z = a;
      g.add(band);
    }
    return g;
  }

  // Complete detailed Cabin Interior (EVERY SINGLE ITEM from Section 5.2!)
  function buildCabinInterior(cabW, cabL, cabH, deckY, mats, sharedTex) {
    const g = new THREE.Group();
    g.position.y = deckY + 0.04;

    // 1. Helm Console / Dashboard at front of cabin (+Z inside cabin)
    const consoleZ = cabL * 0.30;
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.14, 0.58, 0.42), mats.cabinTrim);
    consoleBox.position.set(0, 0.29, consoleZ);
    consoleBox.castShadow = true;
    consoleBox.receiveShadow = true;
    g.add(consoleBox);

    // Slanted wooden instrument desk ledge
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.12, 0.05, 0.48), mats.woodConsole);
    deskTop.position.set(0, 0.60, consoleZ - 0.02);
    deskTop.rotation.x = 0.14;
    g.add(deskTop);

    // 2. Ship's Helm Wheel (船舵) + stainless spokes + brass hub + throttle lever!
    const wheelG = new THREE.Group();
    wheelG.position.set(0.18, 0.68, consoleZ - 0.24);
    wheelG.rotation.x = -0.35;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8), mats.chrome);
    hub.rotation.x = Math.PI / 2;
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 7, 16), mats.woodConsole);
    wheelG.add(hub, wheelRim);
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.33, 5), mats.chrome);
      spoke.rotation.z = a;
      wheelG.add(spoke);
    }
    g.add(wheelG);

    // Red-knobbed engine throttle lever beside wheel
    const throttleBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), mats.chrome);
    throttleBase.position.set(0.40, 0.64, consoleZ - 0.08);
    const throttleRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 5), mats.chrome);
    throttleRod.position.set(0.40, 0.72, consoleZ - 0.04);
    throttleRod.rotation.x = 0.35;
    const throttleKnob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 6), mats.lifeOrange);
    throttleKnob.position.set(0.40, 0.80, consoleZ - 0.01);
    g.add(throttleBase, throttleRod, throttleKnob);

    // 3. Live Sweeping Glowing Radar Screen & Glowing Fishfinder (发着微光的雷达屏和鱼探仪)
    const radarHousing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.23, 0.12), mats.instrumentDark);
    radarHousing.position.set(-0.28, 0.74, consoleZ + 0.02);
    radarHousing.rotation.y = -0.58; // local -Z screen aims cleanly toward starboard (+X) window & open door!
    const radarScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.18), mats.radarScreen);
    radarScreen.position.set(0, 0, -0.064);
    radarScreen.rotation.y = Math.PI;
    radarHousing.add(radarScreen);
    g.add(radarHousing);

    // Fishfinder Sonar unit right next to radar!
    const ffHousing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.19, 0.10), mats.instrumentDark);
    ffHousing.position.set(0.03, 0.72, consoleZ + 0.08);
    ffHousing.rotation.y = -0.22;
    const ffScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.15), mats.fishfinderScreen);
    ffScreen.position.set(0, 0, -0.054);
    ffScreen.rotation.y = Math.PI;
    ffHousing.add(ffScreen);
    g.add(ffHousing);

    // 4. Clipped Nautical Chart & Tide Table (夹在板上的海图与潮汐表 — angled toward starboard window so chart & tide curve read crisply!)
    const clipBoard = new THREE.Group();
    clipBoard.position.set(-0.22, 0.69, consoleZ - 0.16);
    clipBoard.rotation.set(-0.56, 1.02, 0.24);
    const cbBacking = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.015), mats.woodConsole);
    const cbPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.21), mats.chartPaper);
    cbPaper.position.z = 0.009;
    const cbClip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.022), mats.chrome);
    cbClip.position.set(0, 0.105, 0.008);
    clipBoard.add(cbBacking, cbPaper, cbClip);
    g.add(clipBoard);

    // 5. Thermos Flask & Enamel Mug (保温壶与搪瓷杯) on helm shelf!
    const thermos = new THREE.Group();
    thermos.position.set(0.42, 0.63, consoleZ + 0.08);
    const thBody = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.22, 10), mats.thermosRed);
    thBody.position.y = 0.11;
    const thCup = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.043, 0.06, 10), mats.chrome);
    thCup.position.y = 0.24;
    thermos.add(thBody, thCup);
    g.add(thermos);

    const mug = new THREE.Group();
    mug.position.set(0.31, 0.63, consoleZ + 0.06);
    const mCup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.075, 10), mats.enamelWhite);
    mCup.position.y = 0.038;
    const mRim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 10), mats.trimBlue);
    mRim.rotation.x = Math.PI / 2;
    mRim.position.y = 0.074;
    const mHandle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 8, Math.PI), mats.enamelWhite);
    mHandle.rotation.z = -Math.PI / 2;
    mHandle.position.set(0.036, 0.038, 0);
    mug.add(mCup, mRim, mHandle);
    g.add(mug);

    // 6. Hanging Yellow Oilskin Rain Parka on Bulkhead Hook (挂在钩上的黄色雨衣 — authentic draped shoulders, hood, sleeves & snap placket!)
    const coatG = new THREE.Group();
    coatG.position.set(-cabW * 0.44, 0.90, -cabL * 0.24);
    coatG.rotation.y = Math.PI / 2;
    // Wall wooden peg plaque & brass coat hook
    const hookPlate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.02), mats.woodConsole);
    hookPlate.position.set(0, 0.27, -0.03);
    const hookPin = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.06, 6), mats.chrome);
    hookPin.rotation.x = Math.PI / 2 - 0.35;
    hookPin.position.set(0, 0.26, 0.0);
    // Draped hooded oilskin jacket body with clearly pinched neck-loop & sloped shoulders
    const coatShape = new THREE.Shape();
    coatShape.moveTo(-0.028, 0.24);
    coatShape.lineTo(0.028, 0.24);
    coatShape.quadraticCurveTo(0.065, 0.19, 0.13, 0.15);
    coatShape.quadraticCurveTo(0.15, 0.04, 0.155, -0.14);
    coatShape.lineTo(0.175, -0.34);
    coatShape.quadraticCurveTo(0.08, -0.37, 0.0, -0.35);
    coatShape.quadraticCurveTo(-0.09, -0.37, -0.17, -0.33);
    coatShape.lineTo(-0.15, -0.13);
    coatShape.quadraticCurveTo(-0.145, 0.04, -0.125, 0.15);
    coatShape.quadraticCurveTo(-0.065, 0.19, -0.028, 0.24);
    coatShape.closePath();
    const coatGeo = new THREE.ExtrudeGeometry(coatShape, { depth: 0.038, bevelEnabled: true, bevelSize: 0.010, bevelThickness: 0.010, bevelSegments: 2 });
    coatGeo.translate(0, 0, -0.01);
    const coatBody = new THREE.Mesh(coatGeo, mats.raincoatYellow);
    // Flat folded rain hood draped naturally behind the collar + subtle shaded open collar lining + twin hanging sleeves!
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), mats.raincoatYellow);
    hood.scale.set(1.18, 0.85, 0.24);
    hood.position.set(0, 0.195, -0.012);
    const collarLining = new THREE.Mesh(
      new THREE.CircleGeometry(0.046, 10, Math.PI, Math.PI),
      createCelMaterial({ color: 0xc99c28, wetness: 0.25, rim: 0.05 })
    );
    collarLining.position.set(0, 0.205, 0.041);
    const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 6, 12, Math.PI), mats.raincoatYellow);
    collarRim.position.set(0, 0.205, 0.042);
    collarRim.rotation.z = Math.PI;
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.45, 0.012), mats.instrumentDark);
    placket.position.set(0, -0.10, 0.042);
    for (let sb = 0; sb < 5; sb++) {
      const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6), mats.chrome);
      snap.rotation.x = Math.PI / 2;
      snap.position.set(0, 0.07 - sb * 0.090, 0.050);
      coatG.add(snap);
    }
    const pocketL = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.072, 0.014), mats.raincoatYellow);
    pocketL.position.set(-0.085, -0.17, 0.042);
    const pocketFlapL = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.018, 0.018), mats.instrumentDark);
    pocketFlapL.position.set(-0.085, -0.132, 0.045);
    const pocketR = pocketL.clone();
    pocketR.position.x = 0.085;
    const pocketFlapR = pocketFlapL.clone();
    pocketFlapR.position.x = 0.085;
    // Twin limp hanging sleeves draping naturally along both jacket sides
    [-1, 1].forEach((ss) => {
      const slv = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.34, 7), mats.raincoatYellow);
      slv.position.set(ss * 0.155, -0.03, 0.018);
      slv.rotation.z = ss * 0.11;
      coatG.add(slv);
    });
    coatG.add(hookPlate, hookPin, coatBody, hood, collarLining, collarRim, placket, pocketL, pocketFlapL, pocketR, pocketFlapR);
    g.add(coatG);

    // 7. Window-Side Safety Talisman (护身符) & Fish Catch Photo (渔获照片 — right-reading facing camera!)
    const talisman = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.125, 0.014), mats.talisman);
    talisman.position.set(cabW * 0.42, 0.98, consoleZ + 0.06);
    talisman.rotation.y = -0.45;
    talisman.rotation.z = 0.08;
    const taliString = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), mats.lifeOrange);
    taliString.position.set(0, 0.09, 0);
    talisman.add(taliString);
    g.add(talisman);

    // Right-reading fish catch photo taped cleanly beside the port window facing inward/starboard (+X)!
    const catchPhoto = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.145), mats.catchPhoto);
    catchPhoto.position.set(-cabW * 0.44, 0.90, consoleZ - 0.04);
    catchPhoto.rotation.y = Math.PI / 2;
    catchPhoto.rotation.z = 0.06;
    g.add(catchPhoto);

    // Captain's swivel helm chair
    const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8), mats.chrome);
    seatPost.position.set(0.18, 0.21, -0.22);
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), mats.trimBlue);
    seatBase.position.set(0.18, 0.44, -0.22);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.07), mats.trimBlue);
    seatBack.position.set(0.18, 0.62, -0.37);
    g.add(seatPost, seatBase, seatBack);

    return g;
  }

  // Full Cabin Sport-Fishing Boat Builder
  function createCabinBoat(spec, mats, sharedTex) {
    const boat = new THREE.Group();
    const len = spec.len || 4.65;
    const beam = spec.beam || 1.68;
    const depth = spec.depth || 0.92;
    const deckY = 0.24;

    // 1. Sculpted White FRP Hull with Trim & Localized Rust (FrontSide exterior + clean BackSide inner liner!)
    const hullTex = TEX.createBoatHullTexture(spec.trimHex, spec.name, spec.seed);
    const hullMat = createCelMaterial({
      color: 0xffffff,
      map: hullTex,
      wetness: 0.52,
      rim: 0.30,
      shadowStrength: 0.44,
      side: THREE.FrontSide
    });
    const hullGeo = createBoatHullGeometry(len, beam, depth);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    boat.add(hull);
    const innerHullMat = mats.deckGrey.clone();
    innerHullMat.side = THREE.BackSide;
    const innerHull = new THREE.Mesh(hullGeo, innerHullMat);
    boat.add(innerHull);

    // Transom stern panel closing back of hull cleanly
    const transom = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.86, depth * 0.96, 0.08), mats.boatWhite);
    transom.position.set(0, 0.08, -len * 0.495);
    transom.castShadow = true;
    boat.add(transom);

    // Interior recessed wet fiberglass deck
    const deck = new THREE.Mesh(createDeckGeometry(len, beam, deckY), mats.deckGrey);
    deck.receiveShadow = true;
    boat.add(deck);

    // Gunwale dark rubber rub rail wrapping top edge
    [-1, 1].forEach((side) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const tz = i / 10;
        const z = (tz - 0.5) * len;
        const bp = tz < 0.52
          ? 0.90 + 0.10 * Math.sin((tz / 0.52) * Math.PI * 0.5)
          : Math.pow(Math.cos(((tz - 0.52) / 0.48) * Math.PI * 0.5), 0.72);
        const x = side * Math.max(0.02, beam * 0.5 * bp * 1.07);
        const y = depth * 0.58 + Math.pow(Math.max(0, tz - 0.35) / 0.65, 1.8) * (depth * 0.42);
        pts.push(new THREE.Vector3(x, y, z));
      }
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.032, 6, false),
        mats.rubberDark
      );
      boat.add(rail);
    });

    // Foredeck fish-hold hatch & bow mooring cleat
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.62), mats.boatWhite);
    hatch.position.set(0, deckY + 0.04, len * 0.28);
    hatch.receiveShadow = true;
    boat.add(hatch);
    const bowCleat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), mats.chrome);
    bowCleat.position.set(0, depth * 0.85, len * 0.40);
    boat.add(bowCleat);

    // Outboard motor / stern drive on transom
    const motor = new THREE.Group();
    motor.position.set(0, 0.35, -len * 0.52);
    const cowling = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.42), mats.instrumentDark);
    cowling.position.y = 0.22;
    cowling.castShadow = true;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.68, 0.16), mats.chrome);
    shaft.position.y = -0.25;
    motor.add(cowling, shaft);
    boat.add(motor);

    // 2. Wheelhouse Cabin Structure (LARGE clear wraparound windows + OPEN rear sliding door!)
    const cabW = beam * 0.76;
    const cabL = len * 0.38;
    const cabH = 1.38;
    const cabZ = 0.12;
    const cabGroup = new THREE.Group();
    cabGroup.position.set(0, 0, cabZ);
    boat.add(cabGroup);

    // Lower solid cabin walls (y = deckY .. deckY + 0.58)
    const lowerH = 0.58;
    const lowerY = deckY + lowerH * 0.5;
    // Left & right lower cabin sides
    [-cabW * 0.5, cabW * 0.5].forEach((sx) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.07, lowerH, cabL), mats.boatWhite);
      wall.position.set(sx, lowerY, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      cabGroup.add(wall);
    });
    // Front lower cabin bulkhead
    const frontLow = new THREE.Mesh(new THREE.BoxGeometry(cabW, lowerH, 0.08), mats.boatWhite);
    frontLow.position.set(0, lowerY, cabL * 0.5);
    frontLow.castShadow = true;
    cabGroup.add(frontLow);
    // Rear partial bulkhead (LEFT side solid, RIGHT 65% WIDE OPEN DOORWAY so you see straight inside!)
    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.34, cabH, 0.07), mats.boatWhite);
    rearPanel.position.set(-cabW * 0.33, deckY + cabH * 0.5, -cabL * 0.5);
    rearPanel.castShadow = true;
    cabGroup.add(rearPanel);
    // Half-slid open rear cabin door panel with glass window
    const openDoor = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.42, cabH - 0.08, 0.045), mats.cabinTrim);
    openDoor.position.set(-cabW * 0.24, deckY + cabH * 0.5, -cabL * 0.5 - 0.05);
    cabGroup.add(openDoor);

    // Slender Corner Window Pillars (unobstructed panoramic side windows so helm, radar & cabin details are 100% clear!)
    const winH = cabH - lowerH - 0.08;
    const winMidY = deckY + lowerH + winH * 0.5;
    [
      [-cabW * 0.5, cabL * 0.5],
      [cabW * 0.5, cabL * 0.5],
      [-cabW * 0.5, -cabL * 0.5],
      [cabW * 0.5, -cabL * 0.5]
    ].forEach(([px, pz]) => {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.065, winH + 0.08, 0.065), mats.boatWhite);
      pil.position.set(px, winMidY, pz);
      pil.castShadow = true;
      cabGroup.add(pil);
    });

    // Clear Wraparound Cabin Windows (front + port + starboard — high clarity!)
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(cabW - 0.12, winH), mats.cabinGlass);
    frontGlass.position.set(0, winMidY, cabL * 0.5 - 0.02);
    cabGroup.add(frontGlass);
    [-cabW * 0.5 + 0.02, cabW * 0.5 - 0.02].forEach((gx) => {
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(cabL - 0.12, winH), mats.cabinGlass);
      sideGlass.rotation.y = Math.PI / 2;
      sideGlass.position.set(gx, winMidY, 0);
      cabGroup.add(sideGlass);
    });

    // Cabin Roof Slab (exterior white + INTERIOR CEILING WITH SWAYING WATER CAUSTICS!)
    const roofY = deckY + cabH;
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.16, 0.08, cabL + 0.24), mats.boatWhite);
    cabRoof.position.set(0, roofY + 0.04, 0.04);
    cabRoof.castShadow = true;
    cabRoof.receiveShadow = true;
    cabGroup.add(cabRoof);

    // Glistening warm-gold rain beads clinging along boat cabin roof rim & gunwales!
    const gunBeadMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc });
    const gunBeadGeo = new THREE.SphereGeometry(0.014, 5, 4);
    for (let bi = 0; bi < 10; bi++) {
      const side = bi < 5 ? 1 : -1;
      const bz = -cabL * 0.45 + (bi % 5) * (cabL * 0.22);
      const b = new THREE.Mesh(gunBeadGeo, gunBeadMat);
      b.position.set(side * (cabW * 0.5 + 0.07), roofY + 0.01, bz);
      cabGroup.add(b);
    }

    // Interior ceiling underside plane with live animated shimmering water caustics!
    const cabCeiling = new THREE.Mesh(new THREE.PlaneGeometry(cabW - 0.08, cabL - 0.08), mats.cabinCeilingCaustic);
    cabCeiling.rotation.x = Math.PI / 2;
    cabCeiling.position.set(0, roofY - 0.005, 0);
    cabGroup.add(cabCeiling);

    // 3. BUILD COMPLETE VISIBLE CABIN INTERIOR!
    const interior = buildCabinInterior(cabW, cabL, cabH, deckY, mats, sharedTex);
    cabGroup.add(interior);

    // 4. Pale-Golden Sunlight Shaft passing diagonally through cabin glass!
    const cabRayMat = createGodRayMaterial(0.20);
    const cabRay = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.35), cabRayMat);
    cabRay.position.set(0.06, deckY + 0.72, 0.08);
    cabRay.rotation.set(0.32, 0.45, 0.48);
    cabGroup.add(cabRay);

    // 5. Roof Rigging: Mast, VHF Antennas, White Radome, Nav Lights & Aft Metal Sunshade Frame (遮阳铁架)
    const roofTop = roofY + 0.08;
    // Steel mast arch
    const mastL = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.88, 6), mats.chrome);
    mastL.position.set(-0.24, roofTop + 0.42, 0.12);
    mastL.rotation.z = -0.18;
    const mastR = mastL.clone();
    mastR.position.x = 0.24;
    mastR.rotation.z = 0.18;
    const mastTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.045, 0.22), mats.boatWhite);
    mastTop.position.set(0, roofTop + 0.84, 0.12);
    // White Radar Dome (雷达罩)
    const radome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 14), mats.boatWhite);
    radome.position.set(0, roofTop + 0.94, 0.12);
    radome.castShadow = true;
    const radomeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.4),
      mats.boatWhite
    );
    radomeCap.position.set(0, roofTop + 1.01, 0.12);
    // Twin slender VHF whip antennas
    const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 1.35, 5), mats.chrome);
    ant1.position.set(-0.38, roofTop + 0.92, 0.10);
    ant1.rotation.x = -0.16;
    const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 1.05, 5), mats.chrome);
    ant2.position.set(0.36, roofTop + 0.78, 0.05);
    ant2.rotation.x = -0.12;
    // Port (red) & Starboard (green) navigation lights on cabin roof edges
    const portLight = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), mats.navRed);
    portLight.position.set(-cabW * 0.52, roofTop + 0.05, cabL * 0.35);
    const stbdLight = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), mats.navGreen);
    stbdLight.position.set(cabW * 0.52, roofTop + 0.05, cabL * 0.35);
    // Roof grab railing (perchable by seagulls!)
    [-cabW * 0.44, cabW * 0.44].forEach((rx) => {
      const rBar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, cabL * 0.78, 6), mats.chrome);
      rBar.rotation.x = Math.PI / 2;
      rBar.position.set(rx, roofTop + 0.16, -0.04);
      cabGroup.add(rBar);
      [-cabL * 0.34, cabL * 0.34].forEach((rz) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 5), mats.chrome);
        post.position.set(rx, roofTop + 0.08, rz);
        cabGroup.add(post);
      });
    });
    cabGroup.add(mastL, mastR, mastTop, radome, radomeCap, ant1, ant2, portLight, stbdLight);

    // Aft Tubular Metal Sunshade Awning Frame (遮阳铁架) extending behind cabin over aft deck!
    const shadeLen = len * 0.30;
    const shadeY = roofTop - 0.04;
    const shadeZ0 = -cabL * 0.5;
    const shadeZ1 = shadeZ0 - shadeLen;
    // Side horizontal rails & aft support uprights
    [-cabW * 0.46, cabW * 0.46].forEach((sx) => {
      const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, shadeLen, 6), mats.chrome);
      topRail.rotation.x = Math.PI / 2;
      topRail.position.set(sx, shadeY, (shadeZ0 + shadeZ1) * 0.5);
      const aftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, shadeY - deckY, 6), mats.chrome);
      aftPost.position.set(sx, (shadeY + deckY) * 0.5, shadeZ1);
      cabGroup.add(topRail, aftPost);
    });
    const aftCross = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, cabW * 0.94, 6), mats.chrome);
    aftCross.rotation.z = Math.PI / 2;
    aftCross.position.set(0, shadeY, shadeZ1);
    const midCross = aftCross.clone();
    midCross.position.z = (shadeZ0 + shadeZ1) * 0.5;
    // Taut pale-blue canvas sunshade tarp stretched over the aft iron frame (with caustic bounce underneath!)
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.90, 0.025, shadeLen - 0.06), mats.sunshadeTarp);
    tarp.position.set(0, shadeY + 0.018, (shadeZ0 + shadeZ1) * 0.5);
    tarp.castShadow = true;
    cabGroup.add(aftCross, midCross, tarp);

    // 6. Side Orange-White Life Ring + Old Rubber Tire Fenders (橙白色救生圈与旧轮胎护舷)
    const lifeRing = createLifeRing(mats);
    lifeRing.rotation.y = Math.PI / 2;
    lifeRing.position.set(cabW * 0.5 + 0.06, deckY + 0.46, -0.10);
    cabGroup.add(lifeRing);

    const tireGeo = new THREE.TorusGeometry(0.18, 0.065, 8, 14);
    const fenderSide = spec.fenderSide || -1; // quay-facing side (gently kisses seawall!)
    [-len * 0.26, 0.04, len * 0.26].forEach((fz) => {
      const tire = new THREE.Mesh(tireGeo, mats.rubberDark);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(fenderSide * (beam * 0.50 + 0.06), 0.22, fz);
      tire.castShadow = true;
      boat.add(tire);
      const fRope = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.30, 5), mats.ropeDry);
      fRope.position.set(fenderSide * (beam * 0.48), 0.42, fz);
      boat.add(fRope);
    });
    // Also hang 2 protective tires on the outer gunwale (authentic Japanese boat-to-boat fenders visible from harbor!)
    [-len * 0.18, len * 0.18].forEach((fz) => {
      const tire = new THREE.Mesh(tireGeo, mats.rubberDark);
      tire.scale.setScalar(0.88);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(-fenderSide * (beam * 0.50 + 0.05), 0.22, fz);
      tire.castShadow = true;
      boat.add(tire);
      const fRope = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.28, 5), mats.ropeDry);
      fRope.position.set(-fenderSide * (beam * 0.48), 0.41, fz);
      boat.add(fRope);
    });

    // Small blue fish crate + white fishing cooler box with blue lid beside stern rod holders!
    const aftCrate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.36), mats.crateBlue);
    aftCrate.position.set(-0.28, deckY + 0.13, -len * 0.33);
    aftCrate.rotation.y = 0.22;
    aftCrate.castShadow = true;
    boat.add(aftCrate);

    const cooler = new THREE.Group();
    cooler.position.set(0.32, deckY + 0.14, -len * 0.35);
    cooler.rotation.y = -0.18;
    const clBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.26), mats.crateWhite);
    clBody.castShadow = true;
    const clLid = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.28), mats.trimBlue);
    clLid.position.y = 0.145;
    cooler.add(clBody, clLid);
    boat.add(cooler);

    // Pair of slender fiberglass fishing rods angled gracefully from aft gunwale rod holders
    [-1, 1].forEach((side, ri) => {
      const rodG = new THREE.Group();
      rodG.position.set(side * (beam * 0.42), deckY + 0.36, -len * 0.42);
      rodG.rotation.set(-0.42 - ri * 0.08, side * 0.22, -side * 0.18);
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6), mats.chrome);
      const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.013, 1.55, 5), mats.instrumentDark);
      blank.position.y = 0.78;
      const tipAccent = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.28, 5), mats.lifeOrange);
      tipAccent.position.y = 1.62;
      rodG.add(holder, blank, tipAccent);
      boat.add(rodG);
    });

    // Local tie cleats perched cleanly on gunwale top (zero hull/deck rope clipping!) & gunwale drip points
    boat.userData.bowCleatLocal = new THREE.Vector3(fenderSide * (beam * 0.36), depth * 0.90, len * 0.36);
    boat.userData.sternCleatLocal = new THREE.Vector3(fenderSide * (beam * 0.46), depth * 0.66, -len * 0.44);
    boat.userData.roofPerchLocal = new THREE.Vector3(cabW * 0.44, roofTop + 0.18, cabZ - 0.28);
    boat.userData.dripLocal = new THREE.Vector3(-fenderSide * (beam * 0.50), 0.52, 0.35);

    return boat;
  }

  // Open Small Japanese White Fishing Boat (Boat 1: 白波丸)
  function createOpenFishingBoat(spec, mats) {
    const boat = new THREE.Group();
    const len = spec.len || 3.85;
    const beam = spec.beam || 1.44;
    const depth = 0.78;
    const deckY = 0.20;

    const hullTex = TEX.createBoatHullTexture(spec.trimHex, spec.name, spec.seed);
    const hullMat = createCelMaterial({
      color: 0xffffff,
      map: hullTex,
      wetness: 0.52,
      rim: 0.28,
      shadowStrength: 0.44,
      side: THREE.FrontSide
    });
    const hullGeo = createBoatHullGeometry(len, beam, depth);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    boat.add(hull);
    // Clean pale fiberglass inner hull lining (BackSide) so exterior boat lettering never bleeds backwards inside open boat!
    const innerHullMat = mats.deckGrey.clone();
    innerHullMat.side = THREE.BackSide;
    const innerHull = new THREE.Mesh(hullGeo, innerHullMat);
    boat.add(innerHull);

    const transom = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.84, depth * 0.92, 0.08), mats.boatWhite);
    transom.position.set(0, 0.07, -len * 0.495);
    boat.add(transom);

    const deck = new THREE.Mesh(createDeckGeometry(len, beam, deckY), mats.deckGrey);
    deck.receiveShadow = true;
    boat.add(deck);

    // Wooden thwart benches tapered cleanly inside hull sheer width (zero bow poke-through!)
    [[-0.75, 0.80], [0.15, 0.82], [0.95, 0.54]].forEach(([tz, wFrac]) => {
      const thwart = new THREE.Mesh(new THREE.BoxGeometry(beam * wFrac, 0.055, 0.28), mats.woodConsole);
      thwart.position.set(0, deckY + 0.24, tz);
      thwart.castShadow = true;
      boat.add(thwart);
    });

    // Compact open helm console with mini windshield, gauge cluster, throttle lever, steering wheel & canopy!
    const cons = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.44), mats.boatWhite);
    cons.position.set(0, deckY + 0.31, -0.25);
    cons.castShadow = true;
    const consTop = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.42), mats.cabinTrim);
    consTop.position.set(0, deckY + 0.63, -0.25);
    const compass = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.instrumentDark);
    compass.position.set(0, deckY + 0.68, -0.18);
    const b1Throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), mats.chrome);
    b1Throttle.position.set(0.22, deckY + 0.70, -0.26);
    b1Throttle.rotation.x = 0.3;
    const b1Knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), mats.lifeOrange);
    b1Knob.position.set(0.22, deckY + 0.78, -0.23);
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.36), mats.cabinGlass);
    shield.position.set(0, deckY + 0.76, -0.05);
    shield.rotation.x = -0.30;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 6, 14), mats.woodConsole);
    wheel.position.set(0, deckY + 0.64, -0.46);
    wheel.rotation.x = -0.38;
    // Coiled orange bow rope tucked cleanly inside Boat 1 foredeck centerline
    const bowCoil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 6, 14), mats.ropeDry);
    bowCoil.rotation.x = Math.PI / 2;
    bowCoil.position.set(0.0, deckY + 0.04, len * 0.28);
    // Small sunshade pipe canopy frame
    [-0.56, 0.56].forEach((sx) => [-0.88, 0.18].forEach((sz) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.32, 6), mats.chrome);
      p.position.set(sx, deckY + 0.66, sz);
      boat.add(p);
    }));
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.03, 1.12), mats.sunshadeTarp);
    canopy.position.set(0, deckY + 1.33, -0.35);
    canopy.castShadow = true;
    boat.add(cons, consTop, compass, b1Throttle, b1Knob, shield, wheel, bowCoil, canopy);

    // Outboard motor
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.36), mats.instrumentDark);
    motor.position.set(0, 0.48, -len * 0.52);
    motor.castShadow = true;
    boat.add(motor);

    // Orange-white life ring & hanging black rubber tire fenders
    const ring = createLifeRing(mats);
    ring.scale.setScalar(0.88);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0.58, deckY + 0.46, -0.35);
    boat.add(ring);

    const tireGeo = new THREE.TorusGeometry(0.16, 0.058, 7, 12);
    const fenderSide = spec.fenderSide || 1;
    [-0.95, 0.05, 0.95].forEach((fz) => {
      const t = new THREE.Mesh(tireGeo, mats.rubberDark);
      t.rotation.y = Math.PI / 2;
      t.position.set(fenderSide * (beam * 0.50 + 0.04), 0.20, fz);
      boat.add(t);
    });

    // Deck crates & folded orange rope
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.38), mats.crateWhite);
    crate.position.set(0.12, deckY + 0.14, 0.62);
    crate.rotation.y = 0.18;
    crate.castShadow = true;
    boat.add(crate);

    // Visible chrome bow gunwale cleat + clean gunwale-top rope attachment (zero hull clip!)
    const b1BowCleat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), mats.chrome);
    b1BowCleat.position.set(fenderSide * 0.30, depth * 0.85, len * 0.34);
    boat.add(b1BowCleat);

    boat.userData.bowCleatLocal = new THREE.Vector3(fenderSide * 0.30, depth * 0.86, len * 0.34);
    boat.userData.sternCleatLocal = new THREE.Vector3(fenderSide * (beam * 0.42), depth * 0.56, -len * 0.44);
    boat.userData.dripLocal = new THREE.Vector3(-fenderSide * (beam * 0.48), 0.44, 0.25);
    return boat;
  }

  // Dynamic Catenary Mooring Rope Mesh (drapes cleanly OVER quay wheel-curb & sags over water every frame!)
  function createDynamicRope(mat) {
    const segs = 16;
    const curbIdx = 11; // 0..11 = open-water catenary (boat cleat -> curb crest), 11..16 = curb crest -> bollard coil
    const geo = new THREE.BufferGeometry();
    const vertsPerRing = 5;
    const pos = new Float32Array((segs + 1) * vertsPerRing * 3);
    const uvs = new Float32Array((segs + 1) * vertsPerRing * 2);
    const indices = [];
    for (let i = 0; i <= segs; i++) {
      for (let k = 0; k < vertsPerRing; k++) {
        const uvIdx = (i * vertsPerRing + k) * 2;
        uvs[uvIdx] = (i / segs) * 4.0;
        uvs[uvIdx + 1] = k / vertsPerRing;
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < vertsPerRing; k++) {
        const kn = (k + 1) % vertsPerRing;
        const a = i * vertsPerRing + k;
        const b = i * vertsPerRing + kn;
        const c = (i + 1) * vertsPerRing + k;
        const d = (i + 1) * vertsPerRing + kn;
        indices.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;

    const pts = [];
    for (let i = 0; i <= segs; i++) pts.push(new THREE.Vector3());
    const crest = new THREE.Vector3();
    const bEdge = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();

    mesh.userData.updateEndpoints = function (a, b, sag, curb) {
      // Exit from water-facing perimeter of the bollard rope coil (r ≈ 0.16m)
      dir.subVectors(a, b);
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) dir.normalize();
      bEdge.copy(b).addScaledVector(dir, 0.15);

      if (curb) {
        let uc = 0.65;
        if (curb.axis === 'x' && Math.abs(bEdge.x - a.x) > 0.05) {
          uc = clamp((curb.edge - a.x) / (bEdge.x - a.x), 0.22, 0.88);
        } else if (curb.axis === 'z' && Math.abs(bEdge.z - a.z) > 0.05) {
          uc = clamp((curb.edge - a.z) / (bEdge.z - a.z), 0.22, 0.88);
        }
        crest.set(
          lerp(a.x, bEdge.x, uc),
          curb.topY,
          lerp(a.z, bEdge.z, uc)
        );
      } else {
        crest.lerpVectors(a, bEdge, 0.72);
      }

      // Segment 1: Boat cleat -> curb outer crest (graceful catenary over open water!)
      for (let i = 0; i <= curbIdx; i++) {
        const s = i / curbIdx;
        pts[i].lerpVectors(a, crest, s);
        pts[i].y -= Math.sin(s * Math.PI) * sag;
      }
      // Segment 2: Curb outer crest -> bollard coil (rides cleanly over top of 0.15m yellow-black wheel curb!)
      const landSegs = segs - curbIdx;
      for (let i = 1; i <= landSegs; i++) {
        const s = i / landSegs;
        const p = pts[curbIdx + i];
        p.lerpVectors(crest, bEdge, s);
        p.y += Math.sin(s * Math.PI) * 0.018;
      }
      // Smooth the bend right across the curb corner while strictly preserving height above curb top!
      if (curb) {
        const prev = pts[curbIdx - 1];
        const cur = pts[curbIdx];
        const next = pts[curbIdx + 1];
        cur.x = (prev.x + cur.x * 2.0 + next.x) * 0.25;
        cur.z = (prev.z + cur.z * 2.0 + next.z) * 0.25;
        cur.y = Math.max(curb.topY, (prev.y + cur.y * 2.5 + next.y) / 4.5);
      }

      const rad = 0.023;
      const arr = geo.attributes.position.array;
      for (let i = 0; i <= segs; i++) {
        const pPrev = pts[Math.max(0, i - 1)];
        const pNext = pts[Math.min(segs, i + 1)];
        dir.subVectors(pNext, pPrev);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        else dir.normalize();
        side.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 0.001) side.set(1, 0, 0);
        side.normalize();
        up.crossVectors(side, dir).normalize();
        const p = pts[i];
        for (let k = 0; k < vertsPerRing; k++) {
          const ang = (k / vertsPerRing) * Math.PI * 2;
          const ca = Math.cos(ang) * rad;
          const sa = Math.sin(ang) * rad;
          const idx = (i * vertsPerRing + k) * 3;
          arr[idx] = p.x + side.x * ca + up.x * sa;
          arr[idx + 1] = p.y + side.y * ca + up.y * sa;
          arr[idx + 2] = p.z + side.z * ca + up.z * sa;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    };
    return mesh;
  }

  function buildBoats(scene, propsRef) {
    const group = new THREE.Group();
    group.name = 'HarborBoats';
    scene.add(group);

    // Shared cabin interior & boat textures
    const sharedTex = {
      radar: TEX.createRadarTexture(),
      fishfinder: TEX.createFishfinderTexture(),
      chart: TEX.createNauticalChartTexture(),
      talisman: TEX.createTalismanTexture(),
      catchPhoto: TEX.createCatchPhotoTexture(),
      rope: TEX.createRopeTexture()
    };

    // Live animated sweeping green marine radar display shader!
    const liveRadarMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: window.HARBOR_MATERIALS.GLOBAL_UNIFORMS.uTime,
        uTex: { value: sharedTex.radar }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uTex;
        varying vec2 vUv;
        void main() {
          vec3 base = texture2D(uTex, vUv).rgb;
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float sweep = mod(ang + uTime * 1.85, 6.28318);
          float beam = smoothstep(1.25, 0.0, sweep) * step(r, 0.88);
          float line = smoothstep(0.07, 0.0, sweep) * step(r, 0.88);
          vec3 col = base * 0.85 + vec3(0.22, 0.95, 0.68) * beam * 0.45 + vec3(0.75, 1.0, 0.90) * line * 0.95;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const mats = {
      boatWhite: createCelMaterial({ color: PALETTE.boatWhite, wetness: 0.52, rim: 0.30, shadowStrength: 0.42 }),
      deckGrey: createCelMaterial({ color: 0xcbd9dd, wetness: 0.62, rim: 0.16 }),
      cabinTrim: createCelMaterial({ color: 0x5d7a88, wetness: 0.30, rim: 0.18 }),
      cabinCeilingCaustic: createCelMaterial({
        color: 0x7699a6, // shaded interior ceiling tone so turquoise-gold swaying water caustics shine clearly overhead!
        wetness: 0.12,
        rim: 0.0,
        caustics: 1.35,
        causticsMode: 0.0,
        side: THREE.DoubleSide
      }),
      cabinGlass: createAnimeGlassMaterial({ color: 0xdff8fb, opacity: 0.18 }),
      woodConsole: createCelMaterial({ color: 0xa67c54, wetness: 0.20, rim: 0.16 }),
      chrome: createCelMaterial({ color: 0xe3eef2, wetness: 0.72, rim: 0.38 }),
      rubberDark: createCelMaterial({ color: 0x262e34, wetness: 0.35, rim: 0.18 }),
      lifeOrange: createCelMaterial({ color: PALETTE.lifeRingOrange, wetness: 0.50, rim: 0.28 }),
      trimBlue: createCelMaterial({ color: PALETTE.boatTrimBlue, wetness: 0.40, rim: 0.22 }),
      sunshadeTarp: createCelMaterial({ color: 0x6ba7bd, wetness: 0.48, rim: 0.24, caustics: 0.45, causticsMode: 0.0 }),
      crateWhite: createCelMaterial({ color: PALETTE.crateWhite, wetness: 0.58, rim: 0.24 }),
      crateBlue: createCelMaterial({ color: PALETTE.crateBlue, wetness: 0.58, rim: 0.24 }),
      ropeDry: createCelMaterial({ color: 0xffffff, map: sharedTex.rope, wetness: 0.28, rim: 0.16 }),
      instrumentDark: createCelMaterial({ color: 0x2c3b44, wetness: 0.25, rim: 0.18 }),
      radarScreen: liveRadarMat,
      fishfinderScreen: new THREE.MeshBasicMaterial({ map: sharedTex.fishfinder }),
      chartPaper: createCelMaterial({ color: 0xffffff, map: sharedTex.chart, wetness: 0.08, rim: 0.05 }),
      thermosRed: createCelMaterial({ color: 0xd95645, wetness: 0.45, rim: 0.26 }),
      enamelWhite: createCelMaterial({ color: 0xf7fafb, wetness: 0.55, rim: 0.26 }),
      raincoatYellow: createCelMaterial({ color: 0xf5cc3e, wetness: 0.60, rim: 0.30 }),
      talisman: createCelMaterial({ color: 0xffffff, map: sharedTex.talisman, wetness: 0.12, rim: 0.10 }),
      catchPhoto: createCelMaterial({ color: 0xffffff, map: sharedTex.catchPhoto, wetness: 0.15, rim: 0.10, side: THREE.DoubleSide }),
      navRed: new THREE.MeshBasicMaterial({ color: 0xf05848 }),
      navGreen: new THREE.MeshBasicMaterial({ color: 0x4ae08c }),
      distantHull: new THREE.MeshBasicMaterial({ color: 0xeaf4f6, transparent: true, opacity: 0.72 }),
      distantTrim: new THREE.MeshBasicMaterial({ color: 0x7da9ba, transparent: true, opacity: 0.68 })
    };

    // =========================================================================
    // 1. Create the 4 Harbor Boats Snugly Berthed Along the L-Quay Seawalls
    //    (Rubber tire fenders sit ~0.10m from seawall and gently kiss the concrete on harbor swells!)
    // =========================================================================
    // Boat 1: Small open fishing boat at inner West quay (-4.42, +1.95), heading -Z
    const boat1Mesh = createOpenFishingBoat({
      name: '白波丸', trimHex: '#3f8fa6', len: 3.85, beam: 1.44, fenderSide: 1, seed: 511
    }, mats);
    boat1Mesh.position.set(-4.42, WATER_Y, 1.95);
    boat1Mesh.rotation.y = Math.PI;
    group.add(boat1Mesh);

    // Boat 2: HERO Cabin Sport-Fishing Boat at West quay (-4.32, -2.75), heading +Z
    const boat2Mesh = createCabinBoat({
      name: '第二青汐丸', trimHex: '#337ca3', len: 4.65, beam: 1.68, fenderSide: -1, seed: 522
    }, mats, sharedTex);
    boat2Mesh.position.set(-4.32, WATER_Y, -2.75);
    boat2Mesh.rotation.y = 0.0;
    group.add(boat2Mesh);

    // Boat 3: Second Cabin Fishing Boat along Inner Breakwater (+0.55, -4.44), heading +X
    const boat3Mesh = createCabinBoat({
      name: '潮騒丸', trimHex: '#2f8280', len: 4.55, beam: 1.64, fenderSide: 1, seed: 533
    }, mats, sharedTex);
    boat3Mesh.position.set(0.55, WATER_Y, -4.44);
    boat3Mesh.rotation.y = Math.PI / 2;
    group.add(boat3Mesh);

    // Boat 4: Outermost Berth Departing White Cabin Boat (+1.05, +6.36), heading +X
    const boat4Mesh = createCabinBoat({
      name: '海風丸', trimHex: '#3b84b0', len: 4.45, beam: 1.62, fenderSide: -1, seed: 544
    }, mats, sharedTex);
    boat4Mesh.position.set(1.05, WATER_Y, 6.36);
    boat4Mesh.rotation.y = Math.PI / 2;
    group.add(boat4Mesh);

    const mooredBoats = [
      {
        id: 'boat1', mesh: boat1Mesh, baseX: -4.42, baseZ: 1.95, baseYaw: Math.PI,
        period: 2.9, phase: 0.3, rollAmp: 0.036, pitchAmp: 0.018, bobAmp: 0.045,
        bowBollard: 'B_W2', sternBollard: 'B_W1',
        curb: { axis: 'x', edge: -5.49, topY: DECK_Y + 0.185 }
      },
      {
        id: 'boat2', mesh: boat2Mesh, baseX: -4.32, baseZ: -2.75, baseYaw: 0.0,
        period: 3.45, phase: 1.85, rollAmp: 0.030, pitchAmp: 0.015, bobAmp: 0.042,
        bowBollard: 'B_W3', sternBollard: 'B_W4',
        curb: { axis: 'x', edge: -5.49, topY: DECK_Y + 0.185 }
      },
      {
        id: 'boat3', mesh: boat3Mesh, baseX: 0.55, baseZ: -4.44, baseYaw: Math.PI / 2,
        period: 3.15, phase: 3.65, rollAmp: 0.032, pitchAmp: 0.016, bobAmp: 0.044,
        bowBollard: 'B_BW2', sternBollard: 'B_BW1',
        curb: { axis: 'z', edge: -5.58, topY: 1.55 + 0.185 }
      }
    ];

    // Dynamic Catenary Mooring Ropes for all 4 boats!
    const ropes = [];
    function attachBoatRopes(boatObj, bowId, sternId) {
      const bowRope = createDynamicRope(mats.ropeDry);
      const sternRope = createDynamicRope(mats.ropeDry);
      group.add(bowRope, sternRope);
      ropes.push({
        boatObj,
        bowRope,
        sternRope,
        bowBollard: propsRef.bollards[bowId].pos,
        sternBollard: propsRef.bollards[sternId].pos
      });
      return { bowRope, sternRope };
    }
    mooredBoats.forEach((b) => attachBoatRopes(b, b.bowBollard, b.sternBollard));
    const boat4State = {
      id: 'boat4', mesh: boat4Mesh, baseX: 1.05, baseZ: 6.36, baseYaw: Math.PI / 2,
      period: 3.25, phase: 5.1, rollAmp: 0.034, pitchAmp: 0.016, bobAmp: 0.046,
      curb: { axis: 'z', edge: 7.48, topY: DECK_Y + 0.185 }
    };
    const boat4Ropes = attachBoatRopes(boat4State, 'B_F2', 'B_F1');

    // Export boat gunwale drip origins (updated dynamically or sampled near berthed boats)
    if (propsRef && propsRef.dripPoints) {
      [boat1Mesh, boat2Mesh, boat3Mesh].forEach((bm, idx) => {
        bm.updateMatrixWorld(true);
        const wp = bm.userData.dripLocal.clone().applyMatrix4(bm.matrixWorld);
        propsRef.dripPoints.push({ pos: wp, floorY: WATER_Y + 0.01, phase: 1.5 + idx * 1.9 });
      });
    }

    // =========================================================================
    // 2. Boat 4 Smooth Closed Departure Loop Around Breakwater (100% Inside Diorama Water!)
    // =========================================================================
    const boat4Waypoints = [
      new THREE.Vector3(1.05, 0, 6.36),   // 0: Home berth (+X, snugly against foreground quay!)
      new THREE.Vector3(5.80, 0, 5.80),   // 1: Gliding East past foreground quay & buoy 07
      new THREE.Vector3(10.20, 0, 2.20),  // 2: Sweeping North-East through harbor mouth
      new THREE.Vector3(10.80, 0, -5.20), // 3: Passing cleanly outside lighthouse & tetrapods!
      new THREE.Vector3(9.60, 0, -11.40), // 4: Generous clearance rounding north side of breakwater!
      new THREE.Vector3(3.40, 0, -12.60), // 5: West leg outside breakwater
      new THREE.Vector3(1.80, 0, -14.60), // 6: Smooth broad U-turn in outer north bay
      new THREE.Vector3(7.80, 0, -15.10), // 7: Heading East behind breakwater
      new THREE.Vector3(13.40, 0, -12.00),// 8: Outer East sea
      new THREE.Vector3(14.10, 0, -4.00), // 9: Returning South outside mouth
      new THREE.Vector3(11.80, 0, 1.80),  // 10: Entering harbor mouth smoothly
      new THREE.Vector3(6.80, 0, 1.20),   // 11: Passing buoy 03 & buoy 02
      new THREE.Vector3(1.80, 0, 0.80),   // 12: Mid harbor approach
      new THREE.Vector3(-0.35, 0, 3.40),  // 13: Gentle curve into berth alignment
      new THREE.Vector3(-0.35, 0, 5.80)   // 14: Aligning East (+X) right back into berth (1.05, 6.36)!
    ];
    const boat4Curve = new THREE.CatmullRomCurve3(boat4Waypoints, true, 'centripetal', 0.5);

    // =========================================================================
    // 3. Crisp Cel-Shaded White V-Wake Ribbon Trail behind Boat 4!
    // =========================================================================
    const wakeSegs = 36;
    const wakeGeo = new THREE.BufferGeometry();
    const wakePositions = new Float32Array((wakeSegs + 1) * 2 * 3);
    const wakeUvs = new Float32Array((wakeSegs + 1) * 2 * 2);
    const wakeIndices = [];
    for (let i = 0; i <= wakeSegs; i++) {
      const u = i / wakeSegs;
      wakeUvs[i * 4 + 0] = 0; wakeUvs[i * 4 + 1] = u;
      wakeUvs[i * 4 + 2] = 1; wakeUvs[i * 4 + 3] = u;
      if (i < wakeSegs) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        wakeIndices.push(a, c, b, b, c, d);
      }
    }
    wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3));
    wakeGeo.setAttribute('uv', new THREE.BufferAttribute(wakeUvs, 2));
    wakeGeo.setIndex(wakeIndices);

    const wakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: window.HARBOR_MATERIALS.GLOBAL_UNIFORMS.uTime,
        uAlpha: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          // Crisp anime V-shaped double foam edges + frothy center churn!
          float edgeX = abs(vUv.x - 0.5) * 2.0; // 0 center, 1 outer edge
          float age = vUv.y; // 0 right at stern, 1 tail end
          float waveEdge = 0.72 + 0.12 * sin(age * 24.0 - uTime * 7.0);
          float vArm = smoothstep(waveEdge - 0.22, waveEdge, edgeX) * (1.0 - smoothstep(0.92, 1.0, edgeX));
          float centerFoam = smoothstep(0.45, 0.05, edgeX) * (1.0 - smoothstep(0.0, 0.55, age));
          float rippleBreaks = smoothstep(0.32, 0.58, sin(age * 36.0 - uTime * 9.0 + edgeX * 6.0) * 0.5 + 0.5);
          float raw = max(vArm * (0.65 + 0.35 * rippleBreaks), centerFoam * 0.85);
          // Posterized cel step edge!
          float celFoam = smoothstep(0.36, 0.44, raw) * (1.0 - smoothstep(0.65, 1.0, age)) * smoothstep(0.0, 0.05, age);
          vec3 col = mix(vec3(0.84, 0.96, 0.97), vec3(0.98, 1.0, 1.0), celFoam);
          float a = celFoam * uAlpha * 0.88;
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    wakeMat.userData.isFX = true;
    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
    wakeMesh.frustumCulled = false;
    group.add(wakeMesh);

    // =========================================================================
    // 4. Distant Passing Fishing Boat beyond the Far Misty Breakwater (远处防波堤外驶过的渔船)
    // =========================================================================
    const distBoat = new THREE.Group();
    const dHull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 3.6), mats.distantHull);
    dHull.position.y = 0.22;
    const dCab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 1.35), mats.distantHull);
    dCab.position.set(0, 0.82, 0.25);
    const dStripe = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.14, 3.62), mats.distantTrim);
    dStripe.position.y = 0.38;
    const dMast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5), mats.distantTrim);
    dMast.position.set(0, 1.65, 0.3);
    const dWake = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 8.5),
      new THREE.MeshBasicMaterial({ color: 0xf4fafb, transparent: true, opacity: 0.32, depthWrite: false })
    );
    dWake.rotation.x = -Math.PI / 2;
    dWake.position.set(0, 0.05, -5.6);
    distBoat.add(dHull, dCab, dStripe, dMast, dWake);
    distBoat.rotation.y = -Math.PI / 2; // glides smoothly East->West along z = -64!
    distBoat.position.set(38, -0.45, -64);
    scene.add(distBoat);

    // =========================================================================
    // Deterministic Update (Boats Bobbing, Rope Tension, Boat 4 Trip & Wake Propagation, Distant Boat)
    // =========================================================================
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const wakeSources = [];

    function update(t) {
      wakeSources.length = 0;

      // 1. Update Boat 4 departure excursion & deterministic wake ribbon + wake propagation sources!
      const trip = evaluateBoat4Trip(t);
      if (trip.active) {
        const u = clamp(trip.progress, 0, 0.9999);
        const pt = boat4Curve.getPointAt(u);
        const tan = boat4Curve.getTangentAt(u);
        const yaw = Math.atan2(tan.x, tan.z);

        // Gentle hull planing pitch & turn banking!
        const ptAhead = boat4Curve.getPointAt((u + 0.025) % 1);
        const tanAhead = boat4Curve.getTangentAt((u + 0.025) % 1);
        const turnRate = Math.atan2(tan.x * tanAhead.z - tan.z * tanAhead.x, tan.x * tanAhead.x + tan.z * tanAhead.z);

        boat4Mesh.position.set(pt.x, WATER_Y + Math.sin(t * 3.8) * 0.035 + trip.speed * 0.04, pt.z);
        boat4Mesh.rotation.y = yaw;
        boat4Mesh.rotation.x = -trip.speed * 0.035 + Math.sin(t * 3.2) * 0.015;
        boat4Mesh.rotation.z = clamp(turnRate * 0.45, -0.14, 0.14) + Math.cos(t * 2.5) * 0.02;

        // Build deterministic cel V-wake ribbon behind stern from past timestamps!
        wakeMesh.visible = true;
        wakeMat.uniforms.uAlpha.value = clamp(trip.speed * 1.15, 0, 1);
        const wArr = wakeGeo.attributes.position.array;
        const trailDur = 5.4; // 5.4 seconds of crisp cel white wake trail!
        for (let i = 0; i <= wakeSegs; i++) {
          const frac = i / wakeSegs;
          const tPast = t - frac * trailDur;
          const pastTrip = evaluateBoat4Trip(tPast);
          const pu = pastTrip.active ? clamp(pastTrip.progress, 0, 0.9999) : u;
          const pp = boat4Curve.getPointAt(pu);
          const ptan = boat4Curve.getTangentAt(pu);
          // Start crisp churning propeller-wash right flush with Boat 4 transom (-1.82m along tangent)!
          const sx = pp.x - ptan.x * 1.82;
          const sz = pp.z - ptan.z * 1.82;
          const nx = -ptan.z;
          const nz = ptan.x;
          const halfW = 0.54 + frac * 1.68;
          const idxL = (i * 2) * 3;
          const idxR = (i * 2 + 1) * 3;
          wArr[idxL] = sx - nx * halfW;
          wArr[idxL + 1] = WATER_Y + 0.028;
          wArr[idxL + 2] = sz - nz * halfW;
          wArr[idxR] = sx + nx * halfW;
          wArr[idxR + 1] = WATER_Y + 0.028;
          wArr[idxR + 2] = sz + nz * halfW;

          // Emit expanding causal wake-wave rings at 5 trail samples so buoys, berthed boats & seawalls rock in sequence!
          if (i % 7 === 3 && pastTrip.active && pastTrip.speed > 0.1) {
            const ageSec = frac * trailDur;
            wakeSources.push({
              x: sx,
              z: sz,
              radius: 0.8 + ageSec * 2.15, // wave expands outward at 2.15 m/s!
              strength: (1.0 - frac * 0.75) * pastTrip.speed
            });
          }
        }
        wakeGeo.attributes.position.needsUpdate = true;
      } else {
        // Boat 4 resting calmly in its home berth!
        wakeMesh.visible = false;
        const bob = Math.sin((t / boat4State.period) * Math.PI * 2 + boat4State.phase);
        const roll = Math.cos((t / (boat4State.period * 1.15)) * Math.PI * 2 + boat4State.phase);
        boat4Mesh.position.set(
          boat4State.baseX + Math.sin(t * 0.9 + 1.2) * 0.04,
          WATER_Y + bob * boat4State.bobAmp,
          boat4State.baseZ + Math.cos(t * 0.75 + 0.6) * 0.04
        );
        boat4Mesh.rotation.set(
          Math.sin(t * 1.3 + boat4State.phase) * boat4State.pitchAmp,
          boat4State.baseYaw + Math.sin(t * 0.55) * 0.015,
          roll * boat4State.rollAmp
        );
      }

      // Boat 4 mooring ropes tighten/cast off cleanly!
      boat4Ropes.bowRope.visible = trip.ropeTight > 0.05;
      boat4Ropes.sternRope.visible = trip.ropeTight > 0.05;

      // 2. Update Boats 1, 2, 3 with staggered individual rhythms + causal wake rocking from Boat 4!
      for (let i = 0; i < mooredBoats.length; i++) {
        const b = mooredBoats[i];
        let wakeHit = 0;
        for (let w = 0; w < wakeSources.length; w++) {
          const ws = wakeSources[w];
          const d = Math.hypot(b.baseX - ws.x, b.baseZ - ws.z);
          const rd = Math.abs(d - ws.radius);
          if (rd < 2.6) {
            wakeHit += Math.exp(-(rd * rd) / 1.6) * ws.strength;
          }
        }
        const omega = (Math.PI * 2) / b.period;
        const heave = Math.sin(t * omega + b.phase) * b.bobAmp + Math.sin(t * 4.5 + b.phase) * wakeHit * 0.095;
        // Gentle lateral sway toward seawall so rubber tire fenders softly touch & rebound off concrete wall!
        const sway = Math.sin(t * omega * 0.68 + b.phase * 1.3) * 0.068;
        const roll = Math.cos(t * omega * 0.92 + b.phase) * b.rollAmp + Math.sin(t * 4.0 + b.phase) * wakeHit * 0.11;
        const pitch = Math.sin(t * omega * 1.15 + b.phase * 0.7) * b.pitchAmp + Math.cos(t * 3.8 + b.phase) * wakeHit * 0.05;

        b.mesh.position.set(
          b.baseX + (Math.abs(Math.sin(b.baseYaw)) < 0.5 ? sway : 0),
          WATER_Y + heave,
          b.baseZ + (Math.abs(Math.sin(b.baseYaw)) > 0.5 ? sway : 0)
        );
        b.mesh.rotation.set(pitch, b.baseYaw + Math.sin(t * omega * 0.5 + b.phase) * 0.016, roll);
      }

      // 3. Update Dynamic Catenary Mooring Ropes (riding cleanly over yellow wheel-curb & tightening/slackening on heave!)
      for (let i = 0; i < ropes.length; i++) {
        const r = ropes[i];
        if (!r.bowRope.visible) continue;
        const bm = r.boatObj.mesh;
        bm.updateMatrixWorld(true);
        // Bow rope
        tmpA.copy(bm.userData.bowCleatLocal).applyMatrix4(bm.matrixWorld);
        tmpB.copy(r.bowBollard);
        const distBow = tmpA.distanceTo(tmpB);
        const sagBow = clamp(0.18 - (distBow - 1.8) * 0.08, 0.04, 0.22);
        r.bowRope.userData.updateEndpoints(tmpA, tmpB, sagBow, r.boatObj.curb);
        // Stern rope
        tmpA.copy(bm.userData.sternCleatLocal).applyMatrix4(bm.matrixWorld);
        tmpB.copy(r.sternBollard);
        const distStern = tmpA.distanceTo(tmpB);
        const sagStern = clamp(0.18 - (distStern - 1.8) * 0.08, 0.04, 0.22);
        r.sternRope.userData.updateEndpoints(tmpA, tmpB, sagStern, r.boatObj.curb);
      }

      // 4. Distant Fishing Boat cruising serenely on the misty horizon sea beyond the far breakwater!
      const distPeriod = 54.0;
      const du = ((t * 1.0 + 18.0) % distPeriod) / distPeriod;
      distBoat.position.x = lerp(68.0, -34.0, du);
      distBoat.position.y = -1.62 + Math.sin(t * 1.4) * 0.05;
      distBoat.rotation.z = Math.sin(t * 1.1) * 0.03;
      const distVis = smoothstep(0.0, 0.12, du) * (1.0 - smoothstep(0.86, 1.0, du));
      mats.distantHull.opacity = 0.78 * distVis;
      mats.distantTrim.opacity = 0.74 * distVis;
      dWake.material.opacity = 0.36 * distVis;

      return wakeSources;
    }

    return {
      group,
      boat1: boat1Mesh,
      boat2: boat2Mesh,
      boat3: boat3Mesh,
      boat4: boat4Mesh,
      mooredBoats,
      wakeSources,
      update
    };
  }

  window.HARBOR_BOATS = { buildBoats };
})();
