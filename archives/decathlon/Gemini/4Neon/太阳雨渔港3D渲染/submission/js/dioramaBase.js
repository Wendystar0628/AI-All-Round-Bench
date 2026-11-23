// Square 34x34 Diorama Base, Concrete Cutaway Walls, Seawalls, Tidal Life, Slipway, Steps,
// Breakwater & Lighthouse, Tetrapods, Underwater Seabed/Tires/Anchor Chain/Seagrass, Hillside & Village
(function () {
  const {
    BASE_SIZE, HALF, DECK_Y, WATER_Y, PLINTH_BOTTOM_Y, PLINTH_TOP_Y,
    PALETTE, createRNG, clamp, lerp, getSeabedY, isLandPoint, getHillsideY, getLocalGust
  } = window.HARBOR;
  const TEX = window.HARBOR_TEXTURES;
  const { createCelMaterial, createAnimeGlassMaterial } = window.HARBOR_MATERIALS;

  // Helper: create box with custom per-face materials [ +X, -X, +Y, -Y, +Z, -Z ]
  function makeMultiBox(w, h, d, mats, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Helper: true 4-legged symmetric concrete Tetrapod geometry
  function createTetrapodGeometry(scale) {
    const s = scale || 1.0;
    const geos = [];
    // Central rounded hub
    const hub = new THREE.SphereGeometry(0.36 * s, 10, 8);
    geos.push(hub);
    // 4 tetrahedral unit directions
    const dirs = [
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(Math.sqrt(8 / 9), -1 / 3, 0),
      new THREE.Vector3(-Math.sqrt(2 / 9), -1 / 3, Math.sqrt(2 / 3)),
      new THREE.Vector3(-Math.sqrt(2 / 9), -1 / 3, -Math.sqrt(2 / 3))
    ];
    const up = new THREE.Vector3(0, 1, 0);
    dirs.forEach((dir) => {
      const legLen = 0.88 * s;
      const leg = new THREE.CylinderGeometry(0.20 * s, 0.33 * s, legLen, 9);
      const cap = new THREE.SphereGeometry(0.20 * s, 8, 6);
      cap.translate(0, legLen * 0.5, 0);
      const mergedLeg = THREE.BufferGeometryUtils.mergeGeometries([leg, cap], false);
      mergedLeg.translate(0, legLen * 0.42, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      mergedLeg.applyQuaternion(q);
      geos.push(mergedLeg);
    });
    const combined = THREE.BufferGeometryUtils.mergeGeometries(geos, false);
    combined.computeVertexNormals();
    return combined;
  }

  // Helper: Japanese Tiled-Roof House (瓦顶民家)
  function createHillsideHouse(opts, mats) {
    const g = new THREE.Group();
    const w = opts.w || 2.5;
    const d = opts.d || 2.1;
    const h = opts.h || 1.75;
    const roofH = opts.roofH || 0.95;

    // Stone foundation plinth (extends deep down into hill slope so zero floating!)
    const found = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.8, d + 0.3), mats.stoneWall);
    found.position.y = -0.88;
    found.castShadow = true;
    found.receiveShadow = true;
    g.add(found);

    // Lower timber clapboard wall
    const lowerH = h * 0.48;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, lowerH, d), mats.houseWood);
    lower.position.y = lowerH * 0.5;
    lower.castShadow = true;
    lower.receiveShadow = true;
    g.add(lower);

    // Upper white plaster wall
    const upperH = h * 0.52;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, upperH, d - 0.04), mats.housePlaster);
    upper.position.y = lowerH + upperH * 0.5;
    upper.castShadow = true;
    upper.receiveShadow = true;
    g.add(upper);

    // Gable triangular walls (front +Z and back -Z)
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-w * 0.48, 0);
    gableShape.lineTo(w * 0.48, 0);
    gableShape.lineTo(0, roofH);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: d - 0.06, bevelEnabled: false });
    gableGeo.translate(0, h, -(d - 0.06) * 0.5);
    const gable = new THREE.Mesh(gableGeo, mats.housePlaster);
    gable.castShadow = true;
    gable.receiveShadow = true;
    g.add(gable);

    // Pitched Japanese Kawara tile roof slopes (two crisp overhanging eaves panels)
    const slopeLen = Math.hypot(w * 0.5 + 0.32, roofH + 0.14);
    const slopeAng = Math.atan2(roofH, w * 0.5);
    const roofD = d + 0.46;
    const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.10, roofD), mats.roofTile);
    leftSlope.position.set(-(w * 0.25 + 0.12), h + roofH * 0.5 - 0.02, 0);
    leftSlope.rotation.z = slopeAng;
    leftSlope.castShadow = true;
    leftSlope.receiveShadow = true;
    g.add(leftSlope);

    const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.10, roofD), mats.roofTile);
    rightSlope.position.set(w * 0.25 + 0.12, h + roofH * 0.5 - 0.02, 0);
    rightSlope.rotation.z = -slopeAng;
    rightSlope.castShadow = true;
    rightSlope.receiveShadow = true;
    g.add(rightSlope);

    // Traditional white plaster ridge cap (棟瓦) + end ridge ornaments (鬼瓦) + tiny rooftop TV aerial!
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, roofD + 0.06), mats.housePlaster);
    ridge.position.set(0, h + roofH + 0.06, 0);
    g.add(ridge);
    [-roofD * 0.5, roofD * 0.5].forEach((oz) => {
      const oni = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.10), mats.roofTile);
      oni.position.set(0, h + roofH + 0.12, oz);
      g.add(oni);
    });
    // Tiny Japanese rooftop VHF Yagi antenna (delicate anime coastal-town silhouette!)
    const antPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.55, 5), mats.houseTrim);
    antPost.position.set(w * 0.18, h + roofH + 0.25, -d * 0.15);
    const antBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.015), mats.houseTrim);
    antBar.position.set(w * 0.18, h + roofH + 0.48, -d * 0.15);
    const antCross1 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.26), mats.houseTrim);
    antCross1.position.set(w * 0.04, h + roofH + 0.48, -d * 0.15);
    const antCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.20), mats.houseTrim);
    antCross2.position.set(w * 0.28, h + roofH + 0.48, -d * 0.15);
    g.add(antPost, antBar, antCross1, antCross2);

    // Recessed cozy windows with wooden mullions & warm dim interior backing
    const winPositions = [
      [0, h * 0.68, d * 0.5 + 0.01, 0],
      [-w * 0.26, h * 0.30, d * 0.5 + 0.01, 0],
      [w * 0.5 + 0.01, h * 0.66, 0, Math.PI / 2],
      [w * 0.5 + 0.01, h * 0.28, d * 0.22, Math.PI / 2]
    ];
    winPositions.forEach(([wx, wy, wz, ry], idx) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      wg.rotation.y = ry;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.05), mats.houseTrim);
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.36),
        idx === 0 ? mats.houseWindowWarm : mats.houseWindowCool
      );
      pane.position.z = 0.03;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.40, 0.04), mats.houseTrim);
      bar.position.z = 0.035;
      wg.add(frame, pane, bar);
      g.add(wg);
    });

    // Small entryway awning
    const awning = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.38), mats.roofTile);
    awning.position.set(w * 0.24, h * 0.48, d * 0.5 + 0.16);
    awning.rotation.x = 0.22;
    g.add(awning);

    return g;
  }

  // Helper: Sculpted anime cel-shaded coastal tree (layered foliage puffs + gnarled trunk)
  function createCoastalTree(rng, mats, scale) {
    const root = new THREE.Group();
    const s = scale || 1.0;

    // Slightly curved wooden trunk
    const trunkH = (1.1 + rng() * 0.65) * s;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * s, 0.15 * s, trunkH, 7),
      mats.treeBark
    );
    trunk.position.y = trunkH * 0.5;
    trunk.rotation.z = (rng() - 0.5) * 0.18;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    root.add(trunk);

    // Crown pivot (sways gently during wind gusts!)
    const crown = new THREE.Group();
    crown.position.y = trunkH * 0.85;
    root.add(crown);

    const puffMats = [mats.foliageDark, mats.foliageMid, mats.foliageLight];
    const puffCount = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < puffCount; i++) {
      const layer = i / (puffCount - 1);
      const r = (0.58 - layer * 0.18 + rng() * 0.22) * s;
      let geo = new THREE.IcosahedronGeometry(r, 2);
      // Weld vertices BEFORE computeVertexNormals -> silky smooth Studio-Ghibli cel-shaded foliage clouds!
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      geo = THREE.BufferGeometryUtils.mergeVertices(geo, 1e-3);
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
        const n = 1.0 + 0.10 * Math.sin(vx * 4.5 + i) * Math.cos(vz * 4.2 - i);
        pos.setXYZ(v, vx * n * 1.15, vy * n * 0.84, vz * n * 1.15);
      }
      geo.computeVertexNormals();
      const mat = puffMats[Math.min(2, Math.floor(layer * 2.6 + (rng() > 0.6 ? 1 : 0)))];
      const puff = new THREE.Mesh(geo, mat);
      const ang = i * 2.39996 + rng() * 0.4;
      const rad = i === puffCount - 1 ? 0.05 * s : (0.30 + rng() * 0.34) * s;
      puff.position.set(
        Math.cos(ang) * rad,
        layer * 0.68 * s + (rng() - 0.3) * 0.16 * s,
        Math.sin(ang) * rad
      );
      puff.castShadow = true;
      puff.receiveShadow = true;
      crown.add(puff);
    }

    return { root, crown, phase: rng() * Math.PI * 2, swayAmp: (0.045 + rng() * 0.03) };
  }

  function buildDioramaBase(scene) {
    const group = new THREE.Group();
    group.name = 'DioramaBase';
    scene.add(group);

    const rng = createRNG(2026);

    // Create textures
    const concreteTex = TEX.createWetConcreteTextures();
    const seawallTex = TEX.createSeawallTexture();
    const cutawayTex = TEX.createCutawaySideTexture();
    const hazardTex = TEX.createHazardStripeTexture();
    const stoneWallTex = TEX.createStoneWallTexture();
    const roofTileTex = TEX.createRoofTileTexture();
    const woodTex = TEX.createWoodTexture('#7c6049');
    const seabedTex = TEX.createSeabedTexture();
    const hillCutTex = TEX.createHillCutawayTexture();

    // Shared cel materials
    const mats = {
      plinth: createCelMaterial({ color: PALETTE.plinthDark, wetness: 0.12, rim: 0.15 }),
      concreteDeck: createCelMaterial({
        color: 0xffffff,
        map: concreteTex.map,
        wetnessMap: concreteTex.wetnessMap,
        wetness: 0.62,
        rim: 0.14,
        shadowStrength: 0.36
      }),
      seawall: createCelMaterial({
        color: 0xffffff,
        map: seawallTex,
        wetness: 0.36,
        rim: 0.14,
        shadowStrength: 0.46
      }),
      cutaway: createCelMaterial({
        color: 0xffffff,
        map: cutawayTex,
        wetness: 0.10,
        rim: 0.12,
        shadowStrength: 0.38
      }),
      hazardCurb: createCelMaterial({
        color: 0xffffff,
        map: hazardTex,
        wetness: 0.44,
        rim: 0.22
      }),
      concretePlain: createCelMaterial({
        color: PALETTE.concreteTop,
        wetness: 0.45,
        rim: 0.18
      }),
      concreteWetDark: createCelMaterial({
        color: 0x8ea3a8,
        wetness: 0.65,
        rim: 0.18
      }),
      tetrapod: createCelMaterial({
        color: 0xd6dfe0,
        wetness: 0.42,
        rim: 0.26,
        shadowStrength: 0.45
      }),
      barnacle: createCelMaterial({ color: 0xe2e6dc, wetness: 0.25, rim: 0.12 }),
      oyster: createCelMaterial({ color: 0x7b8982, wetness: 0.35, rim: 0.14 }),
      algae: createCelMaterial({ color: 0x3b8f6b, wetness: 0.55, rim: 0.18, side: THREE.DoubleSide }),
      rustyIron: createCelMaterial({ color: 0x7c4a38, wetness: 0.28, rim: 0.22 }),
      rubberDark: createCelMaterial({ color: 0x262e34, wetness: 0.32, rim: 0.18 }),
      seabed: createCelMaterial({
        color: 0xffffff,
        map: seabedTex,
        wetness: 0.0,
        rim: 0.0,
        caustics: 0.85,
        causticsMode: 1.0,
        shadowStrength: 0.32
      }),
      cobbleLight: createCelMaterial({ color: 0x9ab5b3, wetness: 0.0, rim: 0.05, caustics: 0.55, causticsMode: 1.0 }),
      cobbleDark: createCelMaterial({ color: 0x5c7d82, wetness: 0.0, rim: 0.05, caustics: 0.45, causticsMode: 1.0 }),
      seagrass: createCelMaterial({ color: 0x3f8f72, wetness: 0.0, rim: 0.1, side: THREE.DoubleSide, caustics: 0.5, causticsMode: 1.0 }),
      lighthouseWhite: createCelMaterial({ color: PALETTE.lighthouseWhite, wetness: 0.42, rim: 0.34 }),
      lighthouseRed: createCelMaterial({ color: PALETTE.lighthouseRed, wetness: 0.42, rim: 0.30 }),
      lighthouseRail: createCelMaterial({ color: 0xe6eff0, wetness: 0.30, rim: 0.25 }),
      stoneWall: createCelMaterial({ color: 0xffffff, map: stoneWallTex, wetness: 0.38, rim: 0.14 }),
      hillGrass: createCelMaterial({ color: 0x72b372, wetness: 0.28, rim: 0.22, shadowStrength: 0.42 }),
      hillCutaway: createCelMaterial({ color: 0xffffff, map: hillCutTex, wetness: 0.08, rim: 0.10 }),
      roofTile: createCelMaterial({ color: 0xffffff, map: roofTileTex, wetness: 0.55, rim: 0.28 }),
      housePlaster: createCelMaterial({ color: 0xf0f2ec, wetness: 0.22, rim: 0.22 }),
      houseWood: createCelMaterial({ color: 0xffffff, map: woodTex, wetness: 0.28, rim: 0.16 }),
      houseTrim: createCelMaterial({ color: 0x4d3c30, wetness: 0.20, rim: 0.15 }),
      houseWindowWarm: createCelMaterial({ color: 0xffe8b2, emissive: 0xffd584, emissiveIntensity: 0.45, wetness: 0.4, rim: 0.1 }),
      houseWindowCool: createCelMaterial({ color: 0x89b8c8, wetness: 0.55, rim: 0.25 }),
      treeBark: createCelMaterial({ color: 0x6b5342, wetness: 0.24, rim: 0.15 }),
      foliageLight: createCelMaterial({ color: 0x86c87a, wetness: 0.32, rim: 0.34, shadowStrength: 0.36 }),
      foliageMid: createCelMaterial({ color: 0x55a168, wetness: 0.28, rim: 0.28, shadowStrength: 0.40 }),
      foliageDark: createCelMaterial({ color: 0x33775c, wetness: 0.24, rim: 0.22, shadowStrength: 0.44 }),
      distantBreakwater: createCelMaterial({ color: 0xc2dbe2, wetness: 0.15, rim: 0.20, noCloudShadow: true })
    };

    // -------------------------------------------------------------------------
    // 1. Collectible Square Base Plinth (34.08 x 34.08, y = -4.20 to -3.92)
    // -------------------------------------------------------------------------
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_SIZE + 0.08, PLINTH_TOP_Y - PLINTH_BOTTOM_Y, BASE_SIZE + 0.08),
      mats.plinth
    );
    plinth.position.set(0, (PLINTH_BOTTOM_Y + PLINTH_TOP_Y) * 0.5, 0);
    plinth.receiveShadow = true;
    group.add(plinth);

    // -------------------------------------------------------------------------
    // 2. Concrete L-Quay Structural Blocks (zero overlapping, crisp cutaway edges)
    //    y spans from PLINTH_TOP_Y (-3.92) to DECK_Y (+1.35) => height = 5.27
    // -------------------------------------------------------------------------
    const wallH = DECK_Y - PLINTH_TOP_Y;
    const wallMidY = (DECK_Y + PLINTH_TOP_Y) * 0.5;

    // 2A. West Main Wharf: x in [-17, -5.5] (w=11.5), z in [-17, +17] (d=34)
    const westSeawallMat = mats.seawall.clone();
    westSeawallMat.map = seawallTex.clone();
    westSeawallMat.map.repeat.set(4.0, 1.0);
    westSeawallMat.map.needsUpdate = true;

    const westCutMat = mats.cutaway.clone();
    westCutMat.map = cutawayTex.clone();
    westCutMat.map.repeat.set(4.0, 1.0);
    westCutMat.map.needsUpdate = true;

    const westDeckMat = mats.concreteDeck.clone();
    westDeckMat.map = concreteTex.map.clone();
    westDeckMat.map.repeat.set(1.8, 5.2);
    westDeckMat.map.needsUpdate = true;

    const westWharf = makeMultiBox(
      11.5, wallH, 34.0,
      [westSeawallMat, westCutMat, westDeckMat, mats.plinth, mats.cutaway, mats.cutaway],
      -11.25, wallMidY, 0
    );
    group.add(westWharf);

    // 2B. Foreground Broad Quay Arm (split cleanly around recessed concrete steps x=[0.6,2.0], z=[8.5,11.2])
    // Back half of fore arm: x in [-5.5, +0.6] (w=6.1), z in [+7.5, +17.0] (d=9.5)
    const foreDeckMat = mats.concreteDeck.clone();
    foreDeckMat.map = concreteTex.map.clone();
    foreDeckMat.map.repeat.set(1.2, 1.8);
    foreDeckMat.map.needsUpdate = true;

    group.add(makeMultiBox(
      6.1, wallH, 9.5,
      [mats.seawall, mats.cutaway, foreDeckMat, mats.plinth, mats.cutaway, mats.seawall],
      -2.45, wallMidY, 12.25
    ));

    // North step shoulder: x in [+0.6, +2.0] (w=1.4), z in [+7.5, +8.5] (d=1.0)
    group.add(makeMultiBox(
      1.4, wallH, 1.0,
      [mats.seawall, mats.concretePlain, mats.concreteDeck, mats.plinth, mats.seawall, mats.seawall],
      1.3, wallMidY, 8.0
    ));

    // South step shoulder: x in [+0.6, +2.0] (w=1.4), z in [+11.2, +17.0] (d=5.8)
    group.add(makeMultiBox(
      1.4, wallH, 5.8,
      [mats.seawall, mats.concretePlain, mats.concreteDeck, mats.plinth, mats.cutaway, mats.seawall],
      1.3, wallMidY, 14.1
    ));

    // Recessed Concrete Steps base & 5 treads (x in [+0.6, +2.0], z in [+8.5, +11.2])
    const platformY = 0.42;
    const stepBaseH = platformY - PLINTH_TOP_Y;
    group.add(makeMultiBox(
      1.4, stepBaseH, 2.7,
      [mats.seawall, mats.concretePlain, mats.concretePlain, mats.plinth, mats.seawall, mats.seawall],
      1.3, (platformY + PLINTH_TOP_Y) * 0.5, 9.85
    ));
    const numSteps = 5;
    const stepDepth = 1.4 / numSteps;
    const stepRise = (DECK_Y - platformY) / numSteps;
    for (let i = 0; i < numSteps; i++) {
      const topY = DECK_Y - i * stepRise;
      const h = topY - platformY;
      if (h <= 0.02) continue;
      const tread = new THREE.Mesh(
        new THREE.BoxGeometry(stepDepth + 0.01, h, 2.70),
        mats.concretePlain
      );
      tread.position.set(0.6 + (i + 0.5) * stepDepth, platformY + h * 0.5, 9.85);
      tread.castShadow = true;
      tread.receiveShadow = true;
      group.add(tread);
    }

    // Slightly Lower Boarding Platform (上下船平台): x in [+2.0, +3.45], z in [+9.2, +13.2], y = +0.42
    const boardH = platformY - PLINTH_TOP_Y;
    const boardPlat = makeMultiBox(
      1.45, boardH, 4.0,
      [mats.seawall, mats.seawall, mats.concreteWetDark, mats.plinth, mats.seawall, mats.seawall],
      2.725, (platformY + PLINTH_TOP_Y) * 0.5, 11.2
    );
    group.add(boardPlat);
    // Rubber bumper rail, corner wooden fender posts with iron caps, sculpted cast-iron T-horn cleats & multi-turn coiled tie line!
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 3.8), mats.rubberDark);
    bumper.position.set(3.48, platformY - 0.09, 11.2);
    group.add(bumper);
    const platIronMat = createCelMaterial({ color: 0x353d44, wetness: 0.42, rim: 0.24 });
    [9.45, 12.95].forEach((cz) => {
      // Proper cast-iron Japanese T-horn harbor cleat (bolted base + twin posts + twin tapered horns!)
      const cleatG = new THREE.Group();
      cleatG.position.set(3.15, platformY, cz);
      const cBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 0.24), platIronMat);
      cBase.position.y = 0.014;
      const cPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.075, 7), platIronMat);
      cPost1.position.set(0, 0.055, -0.055);
      const cPost2 = cPost1.clone();
      cPost2.position.z = 0.055;
      const cHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.34, 8), platIronMat);
      cHorn.rotation.x = Math.PI / 2;
      cHorn.position.y = 0.095;
      cHorn.castShadow = true;
      cleatG.add(cBase, cPost1, cPost2, cHorn);
      group.add(cleatG);

      // Short weathered timber corner mooring pile with dark iron protective collar band
      const pileZ = cz + (cz > 11 ? 0.15 : -0.15);
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 1.85, 8), mats.houseWood);
      pile.position.set(3.52, platformY - 0.52, pileZ);
      pile.castShadow = true;
      const pileBand = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.096, 0.075, 8), platIronMat);
      pileBand.position.set(3.52, platformY + 0.30, pileZ);
      group.add(pile, pileBand);
    });
    // Realistic 3-turn flat spiral coiled braided tie rope resting on the damp boarding platform!
    const platRopeTex = TEX.createRopeTexture();
    const platCoilMat = createCelMaterial({ color: 0xffffff, map: platRopeTex, wetness: 0.45, rim: 0.22 });
    const coilPts = [];
    for (let ci = 0; ci <= 36; ci++) {
      const f = ci / 36;
      const ang = f * Math.PI * 2 * 2.85;
      const rad = 0.075 + f * 0.175;
      coilPts.push(new THREE.Vector3(
        2.58 + Math.cos(ang) * rad,
        platformY + 0.024 + Math.sin(f * Math.PI * 5.0) * 0.005,
        12.25 + Math.sin(ang) * rad
      ));
    }
    const platCoil = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 42, 0.024, 6, false),
      platCoilMat
    );
    platCoil.castShadow = true;
    group.add(platCoil);

    // -------------------------------------------------------------------------
    // 3. Concrete Boat Slipway (斜坡式滑道 スロープ)
    //    x in [-5.5, -1.7], z in [+4.4, +7.5], slopes y=+1.35 -> y=-0.35
    // -------------------------------------------------------------------------
    const slipShape = new THREE.Shape();
    slipShape.moveTo(0, DECK_Y);
    slipShape.lineTo(3.8, -0.35);
    slipShape.lineTo(3.8, PLINTH_TOP_Y);
    slipShape.lineTo(0, PLINTH_TOP_Y);
    slipShape.closePath();
    const slipGeo = new THREE.ExtrudeGeometry(slipShape, { depth: 3.1, bevelEnabled: false });
    slipGeo.translate(-5.5, 0, 4.4);
    const slipMesh = new THREE.Mesh(slipGeo, mats.concreteWetDark);
    slipMesh.castShadow = true;
    slipMesh.receiveShadow = true;
    group.add(slipMesh);

    // Low raised side guide curbs along slipway edges
    const slipLen = Math.hypot(3.8, DECK_Y + 0.35);
    const slipAng = Math.atan2(DECK_Y + 0.35, 3.8);
    [4.48, 7.42].forEach((sz) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(slipLen, 0.18, 0.16), mats.concretePlain);
      curb.position.set(-3.6, (DECK_Y - 0.35) * 0.5 + 0.06, sz);
      curb.rotation.z = -slipAng;
      curb.castShadow = true;
      curb.receiveShadow = true;
      group.add(curb);
    });
    // Subtle dark algae-stained wet grip grooves near lower slipway
    for (let gIdx = 0; gIdx < 9; gIdx++) {
      const u = 0.12 + gIdx * 0.095;
      const gx = lerp(-5.5, -1.7, u);
      const gy = lerp(DECK_Y, -0.35, u) + 0.015;
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 2.75), mats.seawall);
      groove.position.set(gx, gy, 5.95);
      groove.rotation.z = -slipAng;
      group.add(groove);
    }

    // -------------------------------------------------------------------------
    // 4. Short Breakwater (x in [-5.5, +5.4], z in [-8.2, -5.6], deck y=+1.55)
    // -------------------------------------------------------------------------
    const bwDeckY = 1.55;
    const bwH = bwDeckY - PLINTH_TOP_Y;
    const bwSeawallMat = mats.seawall.clone();
    bwSeawallMat.map = seawallTex.clone();
    bwSeawallMat.map.repeat.set(2.2, 1.0);
    bwSeawallMat.map.needsUpdate = true;

    const breakwater = makeMultiBox(
      10.9, bwH, 2.6,
      [mats.seawall, mats.seawall, mats.concreteDeck, mats.plinth, bwSeawallMat, bwSeawallMat],
      -0.05, (bwDeckY + PLINTH_TOP_Y) * 0.5, -6.9
    );
    group.add(breakwater);

    // Outer wave parapet wall along North edge of breakwater
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(10.85, 0.82, 0.56), mats.concretePlain);
    parapet.position.set(-0.05, bwDeckY + 0.41, -7.92);
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    group.add(parapet);
    // Small transition concrete ramp/step from West Wharf (y=1.35) onto Breakwater (y=1.55)
    const bwStep = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 2.0), mats.concretePlain);
    bwStep.position.set(-5.75, DECK_Y + 0.09, -6.6);
    bwStep.receiveShadow = true;
    group.add(bwStep);

    // -------------------------------------------------------------------------
    // 5. Worn Yellow-and-Black Hazard Wheel Curbs (护轮坎)
    // -------------------------------------------------------------------------
    function addHazardCurb(x, z, lenX, lenZ, yBase) {
      const alongZ = lenZ > lenX;
      const longLen = Math.max(lenX, lenZ);
      const rep = Math.max(1, longLen * 0.92);
      const sideMat = mats.hazardCurb.clone();
      sideMat.map = hazardTex.clone();
      sideMat.map.repeat.set(rep, 1);
      sideMat.map.needsUpdate = true;

      const topMat = mats.hazardCurb.clone();
      topMat.map = hazardTex.clone();
      topMat.map.center.set(0.5, 0.5);
      topMat.map.rotation = alongZ ? Math.PI / 2 : 0;
      topMat.map.repeat.set(rep, 1);
      topMat.map.needsUpdate = true;

      const endMat = mats.concretePlain;
      const faceMats = alongZ
        ? [sideMat, sideMat, topMat, endMat, endMat, endMat]
        : [endMat, endMat, topMat, endMat, sideMat, sideMat];
      const curb = new THREE.Mesh(new THREE.BoxGeometry(lenX, 0.15, lenZ), faceMats);
      curb.position.set(x, (yBase || DECK_Y) + 0.075, z);
      curb.castShadow = true;
      curb.receiveShadow = true;
      group.add(curb);
    }
    // West quay berth edge (between breakwater and slipway)
    addHazardCurb(-5.63, -0.6, 0.24, 9.8, DECK_Y);
    // Foreground quay north edge (Boat 4 berth)
    addHazardCurb(0.1, 7.62, 3.6, 0.24, DECK_Y);
    // Foreground quay east edge (south of boarding steps)
    addHazardCurb(1.88, 13.8, 0.24, 5.0, DECK_Y);
    // Inner breakwater edge (Boat 3 berth)
    addHazardCurb(-0.6, -5.72, 8.6, 0.24, bwDeckY);

    // -------------------------------------------------------------------------
    // 6. Red-and-White Striped Lighthouse at Breakwater Tip (x = +4.3, z = -6.9)
    // -------------------------------------------------------------------------
    const lighthouse = new THREE.Group();
    lighthouse.position.set(4.3, bwDeckY, -6.9);
    group.add(lighthouse);

    // Octagonal base pedestal
    const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.55, 8), mats.concretePlain);
    lhBase.position.y = 0.275;
    lhBase.castShadow = true;
    lhBase.receiveShadow = true;
    lighthouse.add(lhBase);

    // 5 Alternating Red & White Tapered Bands
    const bandHeights = [0.76, 0.72, 0.70, 0.68, 0.66];
    let curY = 0.55;
    let curR = 0.78;
    bandHeights.forEach((bh, idx) => {
      const nextR = curR - 0.055;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(nextR, curR, bh + 0.01, 14),
        idx % 2 === 0 ? mats.lighthouseWhite : mats.lighthouseRed
      );
      band.position.y = curY + bh * 0.5;
      band.castShadow = true;
      band.receiveShadow = true;
      lighthouse.add(band);
      curY += bh;
      curR = nextR;
    });

    // Recessed Steel Door + Porthole + Vertical Ladder on Lighthouse
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.86, 0.14), mats.concretePlain);
    doorFrame.position.set(-0.74, 0.98, 0);
    doorFrame.rotation.y = Math.PI / 2;
    lighthouse.add(doorFrame);
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.76, 0.16), mats.lighthouseRed);
    doorPanel.position.set(-0.75, 0.98, 0);
    doorPanel.rotation.y = Math.PI / 2;
    lighthouse.add(doorPanel);

    // Gallery Deck + Safety Railing
    const galleryY = curY;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.64, 0.18, 16), mats.lighthouseWhite);
    gallery.position.y = galleryY + 0.09;
    gallery.castShadow = true;
    lighthouse.add(gallery);

    const railRing = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.024, 6, 20), mats.lighthouseRail);
    railRing.rotation.x = Math.PI / 2;
    railRing.position.y = galleryY + 0.52;
    lighthouse.add(railRing);
    const railRingMid = railRing.clone();
    railRingMid.position.y = galleryY + 0.34;
    lighthouse.add(railRingMid);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), mats.lighthouseRail);
      post.position.set(Math.cos(a) * 0.79, galleryY + 0.33, Math.sin(a) * 0.79);
      lighthouse.add(post);
    }

    // Glazed Lantern Room
    const lanternY = galleryY + 0.18;
    const lanternWall = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.50, 0.24, 12), mats.lighthouseWhite);
    lanternWall.position.y = lanternY + 0.12;
    lighthouse.add(lanternWall);

    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.62, 12, 1, true),
      createAnimeGlassMaterial({ color: 0xe6f9fc, opacity: 0.26 })
    );
    lanternGlass.position.y = lanternY + 0.55;
    lighthouse.add(lanternGlass);

    // Lantern mullions
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.64, 5), mats.lighthouseRed);
      m.position.set(Math.cos(a) * 0.46, lanternY + 0.55, Math.sin(a) * 0.46);
      lighthouse.add(m);
    }

    // Fresnel Lens Core (glows warmly when daytime cloud triggers rare blink!)
    const beaconCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffe498
    });
    const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.36, 10), beaconCoreMat);
    beaconCore.position.y = lanternY + 0.55;
    lighthouse.add(beaconCore);

    // Volumetric Rotating Lighthouse Daytime Beacon Cones (hidden normally, illuminates on dark cloud!)
    const beaconPivot = new THREE.Group();
    beaconPivot.position.y = lanternY + 0.55;
    lighthouse.add(beaconPivot);

    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0.0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          vNormalV = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          float edgeSoft = pow(abs(dot(normalize(vNormalV), normalize(vViewPos))), 1.65);
          // ConeGeometry uv.y runs 0 at wide open end -> 1 at tip apex!
          float lenFade = smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          vec3 col = vec3(1.0, 0.93, 0.64);
          gl_FragColor = vec4(col, edgeSoft * lenFade * uIntensity * 0.44);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    beamMat.userData.isFX = true;

    const beamGeo = new THREE.ConeGeometry(1.45, 7.2, 16, 1, true);
    beamGeo.translate(0, -3.6, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beam1 = new THREE.Mesh(beamGeo, beamMat);
    const beam2 = new THREE.Mesh(beamGeo, beamMat);
    beam2.rotation.y = Math.PI;
    beaconPivot.add(beam1, beam2);

    // Glow halo sprite around lantern
    const beaconHaloMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0.0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float g = pow(max(0.0, 1.0 - d), 2.2);
          gl_FragColor = vec4(1.0, 0.93, 0.65, g * uIntensity * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    beaconHaloMat.userData.isFX = true;
    const beaconHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.65), beaconHaloMat);
    beaconHalo.position.y = lanternY + 0.55;
    lighthouse.add(beaconHalo);

    // Red Lantern Dome & Finial
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.49, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mats.lighthouseRed
    );
    dome.position.y = lanternY + 0.86;
    dome.castShadow = true;
    lighthouse.add(dome);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.45, 6), mats.lighthouseRed);
    finial.position.y = lanternY + 1.48;
    lighthouse.add(finial);

    // -------------------------------------------------------------------------
    // 7. Seawall Barnacles, Oyster Shells, Swaying Algae, Mooring Rings & Iron Ladders
    // -------------------------------------------------------------------------
    // Barnacles & Oyster shells along harbor seawalls (richer readable density & scale!)
    const barnacleGeo = new THREE.ConeGeometry(0.062, 0.055, 5);
    barnacleGeo.rotateX(Math.PI / 2);
    const oysterGeo = new THREE.DodecahedronGeometry(0.105, 0);
    oysterGeo.scale(1.20, 0.65, 0.48);

    const wallStrips = [
      // { axis, fixed, min, max, normalSign }
      { axis: 'z', fixed: -5.49, min: -5.5, max: 4.3, nx: 1, nz: 0 },
      { axis: 'x', fixed: 7.49, min: -1.7, max: 2.0, nx: 0, nz: -1 },
      { axis: 'z', fixed: 2.01, min: 7.6, max: 16.8, nx: 1, nz: 0 },
      { axis: 'x', fixed: -5.59, min: -5.4, max: 5.3, nx: 0, nz: 1 },
      { axis: 'x', fixed: -8.21, min: -5.4, max: 5.3, nx: 0, nz: -1 },
      { axis: 'z', fixed: 5.41, min: -8.1, max: -5.7, nx: 1, nz: 0 }
    ];

    const barnMatrices = [];
    const oysterMatrices = [];
    const dummy = new THREE.Object3D();

    wallStrips.forEach((st) => {
      const len = st.max - st.min;
      const count = Math.floor(len * 20);
      for (let i = 0; i < count; i++) {
        const p = st.min + rng() * len;
        const y = -0.82 + rng() * 1.24;
        const x = st.axis === 'z' ? st.fixed : p;
        const z = st.axis === 'z' ? p : st.fixed;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.atan2(st.nx, st.nz), rng() * Math.PI * 2);
        const sc = 0.72 + rng() * 1.05;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        if (rng() > 0.38) barnMatrices.push(dummy.matrix.clone());
        else oysterMatrices.push(dummy.matrix.clone());
      }
    });

    const barnMesh = new THREE.InstancedMesh(barnacleGeo, mats.barnacle, barnMatrices.length);
    barnMatrices.forEach((m, i) => barnMesh.setMatrixAt(i, m));
    barnMesh.instanceMatrix.needsUpdate = true;
    group.add(barnMesh);

    const oysterMesh = new THREE.InstancedMesh(oysterGeo, mats.oyster, oysterMatrices.length);
    oysterMatrices.forEach((m, i) => oysterMesh.setMatrixAt(i, m));
    oysterMesh.instanceMatrix.needsUpdate = true;
    group.add(oysterMesh);

    // Swaying Seawall Algae Ribbons (animated smoothly in update!)
    const algaeRibbons = [];
    const algaeGeo = new THREE.PlaneGeometry(0.14, 0.82, 1, 5);
    algaeGeo.translate(0, -0.41, 0);
    wallStrips.forEach((st) => {
      const len = st.max - st.min;
      const clusters = Math.max(2, Math.floor(len * 1.3));
      for (let i = 0; i < clusters; i++) {
        const p = st.min + 0.3 + rng() * (len - 0.6);
        const x = st.axis === 'z' ? st.fixed + st.nx * 0.06 : p;
        const z = st.axis === 'z' ? p : st.fixed + st.nz * 0.06;
        for (let b = 0; b < 3; b++) {
          const ribbon = new THREE.Mesh(algaeGeo, mats.algae);
          ribbon.position.set(
            x + (st.axis === 'x' ? (b - 1) * 0.11 : 0),
            0.08 - rng() * 0.18,
            z + (st.axis === 'z' ? (b - 1) * 0.11 : 0)
          );
          ribbon.rotation.y = Math.atan2(st.nx, st.nz) + (rng() - 0.5) * 0.6;
          ribbon.scale.set(0.8 + rng() * 0.5, 0.7 + rng() * 0.6, 1);
          group.add(ribbon);
          algaeRibbons.push({
            mesh: ribbon,
            baseRotX: 0.22 + rng() * 0.2,
            baseRotZ: (rng() - 0.5) * 0.3,
            phase: rng() * Math.PI * 2,
            speed: 1.4 + rng() * 0.8
          });
        }
      }
    });

    // Rusty Seawall Iron Ladders & Mooring Rings
    function addSeawallLadder(x, z, rotY) {
      const lg = new THREE.Group();
      lg.position.set(x, 0, z);
      lg.rotation.y = rotY;
      const h = 2.65; // y = -1.32 to +1.33
      [-0.22, 0.22].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, h, 6), mats.rustyIron);
        rail.position.set(rx, 0.0, 0.08);
        rail.castShadow = true;
        lg.add(rail);
        // Top curved grab handles
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 5, 8, Math.PI), mats.rustyIron);
        hook.position.set(rx, 1.33, 0.0);
        hook.rotation.y = Math.PI / 2;
        lg.add(hook);
      });
      for (let r = 0; r < 9; r++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 6), mats.rustyIron);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, -1.15 + r * 0.29, 0.08);
        lg.add(rung);
      }
      // Standoff brackets into wall
      [-0.85, 0.15, 1.05].forEach((by) => {
        [-0.22, 0.22].forEach((rx) => {
          const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), mats.rustyIron);
          br.position.set(rx, by, 0.03);
          lg.add(br);
        });
      });
      group.add(lg);
    }
    addSeawallLadder(-5.48, -0.3, Math.PI / 2);
    addSeawallLadder(2.02, 14.3, Math.PI / 2);
    addSeawallLadder(0.4, -5.58, 0);

    // Mooring Rings bolted along seawall
    const ringSpots = [
      [-5.48, 0.65, -4.5, Math.PI / 2],
      [-5.48, 0.65, 2.2, Math.PI / 2],
      [0.6, 0.65, 7.48, Math.PI],
      [2.02, 0.65, 15.6, Math.PI / 2],
      [2.6, 0.72, -5.58, 0]
    ];
    ringSpots.forEach(([rx, ry, rz, rotY]) => {
      const rg = new THREE.Group();
      rg.position.set(rx, ry, rz);
      rg.rotation.y = rotY;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.04, 8), mats.rustyIron);
      plate.rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.022, 6, 12), mats.rustyIron);
      ring.position.set(0, -0.07, 0.05);
      ring.rotation.x = 0.25;
      rg.add(plate, ring);
      group.add(rg);
    });

    // -------------------------------------------------------------------------
    // 8. Concrete Tetrapod Armor Clusters (消波块 テトラポッド)
    // -------------------------------------------------------------------------
    const tetraGeo = createTetrapodGeometry(1.0);
    const tetrapodSpecs = [
      // Breakwater tip & outer north face
      [5.75, 0.15, -6.2, 0.92, 0.3, 0.5, 0.2],
      [6.10, -0.05, -7.4, 0.98, 1.1, 1.4, -0.4],
      [5.55, 0.35, -8.45, 0.90, -0.5, 2.2, 0.3],
      [4.55, 0.10, -8.85, 0.95, 0.4, 0.8, 0.6],
      [3.35, 0.20, -8.90, 0.88, -0.3, 1.9, -0.2],
      [2.15, -0.05, -8.85, 0.92, 0.8, 2.6, 0.1],
      [6.35, -0.35, -6.75, 0.85, 0.6, 3.1, -0.5],
      [4.95, 0.75, -8.35, 0.80, -0.2, 1.2, 0.4],
      // Foreground outer quay corner (very visible near diorama corner!)
      [2.65, 0.15, 14.35, 0.92, 0.2, 0.7, 0.3],
      [3.25, -0.10, 15.25, 0.96, 1.0, 2.1, -0.3],
      [2.45, 0.28, 15.85, 0.88, -0.4, 1.3, 0.5],
      [3.70, -0.25, 14.40, 0.86, 0.7, 2.9, -0.2],
      [3.15, 0.52, 14.95, 0.78, -0.5, 0.4, 0.6]
    ];
    const tetrapodCenters = [];
    tetrapodSpecs.forEach(([x, y, z, s, rx, ry, rz]) => {
      const m = new THREE.Mesh(tetraGeo, mats.tetrapod);
      m.position.set(x, y, z);
      m.scale.setScalar(s);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      tetrapodCenters.push(new THREE.Vector3(x, 0, z));
    });

    // -------------------------------------------------------------------------
    // 9. Underwater Seabed, Gravel Cobbles, Sunken Tires, Anchor Chain & Seagrass
    // -------------------------------------------------------------------------
    const seabedGeo = new THREE.PlaneGeometry(BASE_SIZE - 0.04, BASE_SIZE - 0.04, 48, 48);
    seabedGeo.rotateX(-Math.PI / 2);
    const sbPos = seabedGeo.attributes.position;
    for (let i = 0; i < sbPos.count; i++) {
      const sx = sbPos.getX(i);
      const sz = sbPos.getZ(i);
      sbPos.setY(i, getSeabedY(sx, sz));
    }
    seabedGeo.computeVertexNormals();
    const seabedMesh = new THREE.Mesh(seabedGeo, mats.seabed);
    seabedMesh.receiveShadow = true;
    group.add(seabedMesh);

    // Side skirts closing seabed down to PLINTH_TOP_Y on the water-facing cutaway edges (+X, +Z, -Z)
    function addSeabedEdgeSkirt(isX, fixedCoord, minC, maxC, invert) {
      const segs = 32;
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const c = lerp(minC, maxC, u);
        const x = isX ? fixedCoord : c;
        const z = isX ? c : fixedCoord;
        const topY = getSeabedY(x, z);
        positions.push(x, topY, z);
        uvs.push(u * 3, 1);
        positions.push(x, PLINTH_TOP_Y, z);
        uvs.push(u * 3, 0);
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (invert) {
          indices.push(a, c, b, b, c, d);
        } else {
          indices.push(a, b, c, b, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mats.cutaway);
      group.add(mesh);
    }
    // +X water cutaway seabed rock base
    addSeabedEdgeSkirt(true, HALF - 0.01, -HALF, HALF, true);
    // +Z water cutaway seabed rock base (x from +2.0 to +17.0)
    addSeabedEdgeSkirt(false, HALF - 0.01, 2.0, HALF, false);
    // -Z water cutaway seabed rock base (x from -5.5 to +17.0)
    addSeabedEdgeSkirt(false, -HALF + 0.01, -5.5, HALF, true);

    // Gravel cobbles scattered on seabed (visible through clear water cutaway!)
    const cobbleGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const cobLightMats = [];
    const cobDarkMats = [];
    for (let i = 0; i < 160; i++) {
      const cx = -4.5 + rng() * 20.8;
      const cz = -16.0 + rng() * 32.0;
      if (isLandPoint(cx, cz, 0.5)) continue;
      const cy = getSeabedY(cx, cz) + 0.04;
      dummy.position.set(cx, cy, cz);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.set(0.5 + rng() * 1.4, 0.35 + rng() * 0.65, 0.5 + rng() * 1.3);
      dummy.updateMatrix();
      if (rng() > 0.45) cobLightMats.push(dummy.matrix.clone());
      else cobDarkMats.push(dummy.matrix.clone());
    }
    const cobLightInst = new THREE.InstancedMesh(cobbleGeo, mats.cobbleLight, cobLightMats.length);
    cobLightMats.forEach((m, i) => cobLightInst.setMatrixAt(i, m));
    cobLightInst.instanceMatrix.needsUpdate = true;
    group.add(cobLightInst);

    const cobDarkInst = new THREE.InstancedMesh(cobbleGeo, mats.cobbleDark, cobDarkMats.length);
    cobDarkMats.forEach((m, i) => cobDarkInst.setMatrixAt(i, m));
    cobDarkInst.instanceMatrix.needsUpdate = true;
    group.add(cobDarkInst);

    // Sunken Old Tires on Seabed (沉底的旧轮胎 — positioned where clearly visible from cutaway!)
    const tireGeo = new THREE.TorusGeometry(0.46, 0.17, 10, 18);
    const sunkenTires = [
      [8.2, 13.8, 1.32, 0.25, 0.4],
      [12.4, 11.2, 1.48, -0.18, 0.9],
      [5.4, 8.6, 1.15, 0.42, -0.3],
      [11.8, -1.8, 1.40, 0.15, 1.2],
      [3.2, -1.2, 1.28, -0.22, 0.5]
    ];
    sunkenTires.forEach(([tx, tz, rx, ry, rz]) => {
      const tire = new THREE.Mesh(tireGeo, mats.rubberDark);
      tire.position.set(tx, getSeabedY(tx, tz) + 0.14, tz);
      tire.rotation.set(rx, ry, rz);
      tire.receiveShadow = true;
      group.add(tire);
    });

    // Sunken Rusty Anchor & Linked Anchor Chain snaking across the Seabed!
    const anchorGroup = new THREE.Group();
    const ax = 9.8, az = 14.3;
    anchorGroup.position.set(ax, getSeabedY(ax, az) + 0.14, az);
    anchorGroup.rotation.set(1.38, 0.4, -0.3);
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 8), mats.rustyIron);
    const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 8), mats.rustyIron);
    stock.rotation.z = Math.PI / 2;
    stock.position.y = 0.45;
    const crownArc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 7, 14, Math.PI), mats.rustyIron);
    crownArc.position.y = -0.22;
    crownArc.rotation.z = Math.PI;
    const anchorRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 6, 10), mats.rustyIron);
    anchorRing.position.y = 0.68;
    anchorGroup.add(shank, stock, crownArc, anchorRing);
    group.add(anchorGroup);

    // Linked Anchor Chain (28 links snaking from anchor toward foreground quay footing)
    const chainPts = [
      new THREE.Vector3(ax - 0.35, getSeabedY(ax - 0.35, az - 0.1) + 0.08, az - 0.1),
      new THREE.Vector3(7.6, getSeabedY(7.6, 12.8) + 0.08, 12.8),
      new THREE.Vector3(5.6, getSeabedY(5.6, 13.6) + 0.08, 13.6),
      new THREE.Vector3(3.9, getSeabedY(3.9, 12.4) + 0.08, 12.4)
    ];
    const chainCurve = new THREE.CatmullRomCurve3(chainPts);
    const linkGeo = new THREE.TorusGeometry(0.085, 0.028, 6, 10);
    linkGeo.scale(1.45, 0.85, 1.0);
    for (let i = 0; i < 30; i++) {
      const u = i / 29;
      const pt = chainCurve.getPoint(u);
      const tan = chainCurve.getTangent(u);
      const link = new THREE.Mesh(linkGeo, mats.rustyIron);
      link.position.copy(pt);
      link.lookAt(pt.clone().add(tan));
      link.rotateY(Math.PI / 2);
      if (i % 2 === 1) link.rotateX(Math.PI / 2);
      group.add(link);
    }

    // Swaying Underwater Seagrass Beds (海草)
    const seagrassBlades = [];
    const bladeGeo = new THREE.PlaneGeometry(0.16, 1.15, 1, 5);
    bladeGeo.translate(0, 0.575, 0);
    // Taper blade tip
    const bPos = bladeGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const yNorm = clamp(bPos.getY(i) / 1.15, 0, 1);
      bPos.setX(i, bPos.getX(i) * (1.0 - yNorm * 0.78));
      bPos.setZ(i, Math.sin(yNorm * Math.PI) * 0.10);
    }
    bladeGeo.computeVertexNormals();

    const grassClumps = [
      [6.4, 15.2], [11.2, 14.6], [14.5, 12.0], [14.8, 6.2], [9.2, 9.8],
      [4.8, 4.8], [8.5, 2.5], [13.5, -1.5], [11.8, -9.8], [7.2, -13.2],
      [1.2, -11.5], [14.8, -12.6], [5.8, 11.4]
    ];
    grassClumps.forEach(([gx, gz]) => {
      const baseY = getSeabedY(gx, gz) - 0.05;
      const count = 8 + Math.floor(rng() * 5);
      for (let i = 0; i < count; i++) {
        const blade = new THREE.Mesh(bladeGeo, mats.seagrass);
        const a = rng() * Math.PI * 2;
        const r = rng() * 0.65;
        blade.position.set(gx + Math.cos(a) * r, baseY, gz + Math.sin(a) * r);
        blade.rotation.y = rng() * Math.PI * 2;
        const hScale = 0.72 + rng() * 0.85;
        blade.scale.set(0.8 + rng() * 0.5, hScale, 1);
        group.add(blade);
        seagrassBlades.push({
          mesh: blade,
          phase: rng() * Math.PI * 2,
          speed: 1.1 + rng() * 0.6,
          baseRotY: blade.rotation.y
        });
      }
    });

    // -------------------------------------------------------------------------
    // 10. Far-Corner Green Wooded Hillside, Retaining Walls, 4 Tiled Houses & Trees
    //     Occupies x in [-17.0, -5.8], z in [-17.0, -6.4]
    // -------------------------------------------------------------------------
    const hillW = 11.2, hillD = 10.6;
    const hillGeo = new THREE.PlaneGeometry(hillW, hillD, 24, 24);
    hillGeo.rotateX(-Math.PI / 2);
    const hPos = hillGeo.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      const wx = -11.4 + hPos.getX(i);
      const wz = -11.7 + hPos.getZ(i);
      hPos.setY(i, getHillsideY(wx, wz));
    }
    hillGeo.computeVertexNormals();
    const hillMesh = new THREE.Mesh(hillGeo, mats.hillGrass);
    hillMesh.position.set(-11.4, 0, -11.7);
    hillMesh.castShadow = true;
    hillMesh.receiveShadow = true;
    group.add(hillMesh);

    // Close all 4 vertical skirts of the hillside cleanly down to DECK_Y (stone walls on harbor sides, cutaway earth on diorama outer edges!)
    function addHillSkirt(isX, fixedVal, minC, maxC, invert, mat, normalizedV) {
      const segs = 20;
      const positions = [], uvs = [], indices = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const c = lerp(minC, maxC, u);
        const wx = isX ? fixedVal : c;
        const wz = isX ? c : fixedVal;
        const topY = getHillsideY(wx, wz) + 0.04;
        positions.push(wx, topY, wz);
        // Normalized 0..1 V for clamped stratified earth cutaway (shows crisp turf -> topsoil -> rock strata!), tiled V for stone retaining walls
        uvs.push(u * 2.5, normalizedV ? 1.0 : (topY - DECK_Y) * 0.35);
        positions.push(wx, DECK_Y - 0.05, wz);
        uvs.push(u * 2.5, 0);
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (invert) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Harbor-facing Stone Retaining Walls (石垣)
    addHillSkirt(true, -5.8, -17.0, -6.4, true, mats.stoneWall, false);
    addHillSkirt(false, -6.4, -17.0, -5.8, false, mats.stoneWall, false);
    // Diorama Outer Edge Earth Cutaway Skirts (-X = -17, -Z = -17)
    addHillSkirt(true, -17.0, -17.0, -6.4, false, mats.hillCutaway, true);
    addHillSkirt(false, -17.0, -17.0, -5.8, true, mats.hillCutaway, true);

    // 4 Charming Japanese Tiled-Roof Houses (瓦顶民家) staggered on the hillside
    const houseConfigs = [
      { x: -10.8, z: -8.6, rotY: 0.25, w: 2.6, d: 2.0, h: 1.7, roofH: 0.92 },
      { x: -14.5, z: -9.8, rotY: 0.45, w: 2.8, d: 2.2, h: 1.9, roofH: 1.02 },
      { x: -8.6, z: -13.2, rotY: 0.12, w: 2.5, d: 2.0, h: 1.65, roofH: 0.88 },
      { x: -13.4, z: -14.0, rotY: 0.35, w: 2.7, d: 2.1, h: 1.85, roofH: 0.98 }
    ];
    houseConfigs.forEach((hc) => {
      const house = createHillsideHouse(hc, mats);
      const hy = getHillsideY(hc.x, hc.z) + 0.12;
      house.position.set(hc.x, hy, hc.z);
      house.rotation.y = hc.rotY;
      group.add(house);
    });

    // Narrow stone steps ascending the hill retaining wall edge near warehouse
    for (let s = 0; s < 10; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.38), mats.stoneWall);
      step.position.set(-7.6, DECK_Y + 0.11 + s * 0.21, -5.95 - s * 0.28);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }

    // Lush Grove of 28 Wind-Swaying Anime Coastal Trees on the Hillside
    const trees = [];
    const treePlacements = [
      [-6.8, -7.4, 0.92], [-7.8, -8.2, 1.05], [-9.1, -7.2, 0.85], [-12.5, -7.4, 1.0],
      [-15.6, -7.4, 1.10], [-16.0, -8.8, 0.95], [-12.7, -10.4, 1.15], [-9.2, -10.5, 0.95],
      [-7.0, -10.2, 1.02], [-6.8, -12.6, 0.88], [-6.9, -15.4, 1.05], [-8.8, -15.6, 1.15],
      [-10.8, -15.5, 1.22], [-11.4, -12.4, 1.18], [-15.8, -12.2, 1.12], [-15.6, -15.4, 1.28],
      [-13.8, -16.0, 1.08], [-11.8, -16.1, 0.96], [-16.1, -13.8, 1.02], [-14.2, -7.8, 0.84],
      [-7.6, -14.4, 0.82], [-10.4, -11.2, 0.86], [-15.4, -10.9, 0.90], [-12.8, -11.9, 0.95],
      [-8.3, -7.0, 0.74], [-10.2, -7.1, 0.78], [-16.0, -16.0, 1.05], [-6.6, -8.8, 0.80]
    ];
    treePlacements.forEach(([tx, tz, sc]) => {
      const tree = createCoastalTree(rng, mats, sc);
      tree.root.position.set(tx, getHillsideY(tx, tz) - 0.18, tz);
      tree.worldX = tx;
      tree.worldZ = tz;
      group.add(tree.root);
      trees.push(tree);
    });

    // Lush velvety smooth overhanging shrubs softening the top crest of the hillside stone retaining wall!
    const shrubMats = [mats.foliageDark, mats.foliageMid, mats.foliageLight];
    let smoothBushGeo = new THREE.IcosahedronGeometry(1.0, 2);
    smoothBushGeo.deleteAttribute('normal');
    smoothBushGeo.deleteAttribute('uv');
    smoothBushGeo = THREE.BufferGeometryUtils.mergeVertices(smoothBushGeo, 1e-3);
    smoothBushGeo.computeVertexNormals();

    for (let i = 0; i < 18; i++) {
      const isEastEdge = i < 11;
      const sx = isEastEdge ? -5.92 + (rng() - 0.5) * 0.35 : lerp(-16.2, -6.2, (i - 11) / 6.5);
      const sz = isEastEdge ? lerp(-16.2, -6.8, i / 10.5) : -6.48 + (rng() - 0.5) * 0.30;
      const sy = getHillsideY(sx, sz) + 0.08;
      const bushR = 0.42 + rng() * 0.38;
      const bush = new THREE.Mesh(smoothBushGeo, shrubMats[i % 3]);
      bush.scale.set(bushR * 1.15, bushR * 0.72, bushR * 1.15);
      bush.position.set(sx, sy, sz);
      bush.castShadow = true;
      bush.receiveShadow = true;
      group.add(bush);
    }

    // Delicate coastal hydrangea (紫阳花) rain-season blossoms tucked along the hillside stone steps & retaining wall!
    const hydBlue = createCelMaterial({ color: 0x8cbce6, wetness: 0.35, rim: 0.28 });
    const hydLav = createCelMaterial({ color: 0xb7a6e8, wetness: 0.35, rim: 0.28 });
    const hydWhite = createCelMaterial({ color: 0xedf6f7, wetness: 0.35, rim: 0.28 });
    const hydMats = [hydBlue, hydLav, hydWhite];
    const hydSpots = [
      [-6.85, -6.55], [-8.35, -6.55], [-6.15, -7.85], [-6.20, -9.60],
      [-7.05, -7.25], [-8.45, -7.85], [-6.18, -11.40], [-6.22, -13.10]
    ];
    hydSpots.forEach(([hx, hz], idx) => {
      const hy = getHillsideY(hx, hz) + 0.18;
      for (let b = 0; b < 3; b++) {
        const fl = new THREE.Mesh(smoothBushGeo, hydMats[(idx + b) % 3]);
        fl.scale.setScalar(0.17 + rng() * 0.07);
        fl.position.set(hx + (b - 1) * 0.22, hy + (b === 1 ? 0.08 : -0.02), hz + (rng() - 0.5) * 0.22);
        group.add(fl);
      }
    });

    // -------------------------------------------------------------------------
    // 11. Distant Longer Breakwater Seated Naturally in Misty Horizon Sea!
    // -------------------------------------------------------------------------
    const distantGroup = new THREE.Group();
    distantGroup.name = 'DistantBreakwater';
    scene.add(distantGroup);

    const distWallMat = new THREE.ShaderMaterial({
      uniforms: {},
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
        varying vec2 vUv;
        varying vec3 vWp;
        void main() {
          // Subtle caisson concrete joint bands + soft misty base fade into distant sea!
          float joint = smoothstep(0.06, 0.0, abs(fract(vWp.x * 0.18) - 0.5));
          vec3 col = mix(vec3(0.38, 0.58, 0.68), vec3(0.62, 0.79, 0.85), vUv.y);
          col -= vec3(0.04) * joint;
          float baseFade = smoothstep(-2.4, -0.4, vWp.y);
          float sideFade = smoothstep(-26.0, -16.0, vWp.x) * (1.0 - smoothstep(46.0, 56.0, vWp.x));
          gl_FragColor = vec4(col, 0.68 * baseFade * sideFade);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    distWallMat.userData.isFX = true;

    const distCapMat = new THREE.MeshBasicMaterial({
      color: 0xc2dde4,
      transparent: true,
      opacity: 0.56,
      depthWrite: false
    });
    distCapMat.userData.isFX = true;
    const distRedMat = new THREE.MeshBasicMaterial({
      color: 0xd98a82,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });
    distRedMat.userData.isFX = true;

    // Long misty breakwater anchored along horizon sea (z = -62, y = -1.25)
    const distWall = new THREE.Mesh(new THREE.BoxGeometry(82, 2.2, 3.0), distWallMat);
    distWall.position.set(16, -1.25, -62);
    distWall.rotation.y = 0.07;
    distantGroup.add(distWall);

    const distParapet = new THREE.Mesh(new THREE.BoxGeometry(80, 0.68, 0.85), distCapMat);
    distParapet.position.set(16, 0.18, -63.1);
    distParapet.rotation.y = 0.07;
    distantGroup.add(distParapet);

    // Subtle misty distant horizon sea strip anchoring the far breakwater so it NEVER floats in mid-air!
    const farHorizonSeaMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float fadeX = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          float fadeY = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.40, vUv.y);
          vec3 col = mix(vec3(0.45, 0.73, 0.80), vec3(0.76, 0.90, 0.92), vUv.y);
          gl_FragColor = vec4(col, fadeX * fadeY * 0.36);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    farHorizonSeaMat.userData.isFX = true;
    const farHorizonSea = new THREE.Mesh(new THREE.PlaneGeometry(180, 38), farHorizonSeaMat);
    farHorizonSea.rotation.x = -Math.PI / 2;
    farHorizonSea.position.set(18, -1.75, -66);
    distantGroup.add(farHorizonSea);

    // Tiny pale distant striped navigation beacon on far breakwater tip
    const distBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 2.6, 8), distCapMat);
    distBeacon.position.set(53.0, 1.05, -64.8);
    const distBeaconBand = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.65, 8), distRedMat);
    distBeaconBand.position.set(53.0, 1.35, -64.8);
    distantGroup.add(distBeacon, distBeaconBand);

    // Subtle distant sea-horizon plane (fades softly into pale cyan mist far away so background reads as open sea!)
    const distantSeaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: window.HARBOR_MATERIALS.GLOBAL_UNIFORMS.uTime
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          // Cut out the square diorama footprint cleanly (never interfere with diorama cutaway!)
          vec2 d = abs(vWorldPos.xz) - vec2(17.15);
          if (d.x < 0.0 && d.y < 0.0) discard;
          float dist = length(vWorldPos.xz);
          float nearFade = smoothstep(22.0, 44.0, dist);
          float farFade = 1.0 - smoothstep(75.0, 145.0, dist);
          // Subtle misty distant horizon shimmer
          float shimmer = sin(vWorldPos.x * 0.25 + uTime * 0.5) * cos(vWorldPos.z * 0.2 - uTime * 0.35) * 0.5 + 0.5;
          vec3 seaCol = mix(vec3(0.76, 0.91, 0.94), vec3(0.92, 0.98, 0.98), smoothstep(42.0, 110.0, dist));
          seaCol += vec3(0.05, 0.06, 0.04) * smoothstep(0.7, 0.95, shimmer) * nearFade;
          float alpha = nearFade * farFade * 0.42;
          gl_FragColor = vec4(seaCol, alpha);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    distantSeaMat.userData.isFX = true;
    const distantSea = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), distantSeaMat);
    distantSea.rotation.x = -Math.PI / 2;
    distantSea.position.y = -0.6;
    distantGroup.add(distantSea);

    // -------------------------------------------------------------------------
    // Update hook for animated base elements (algae, seagrass, hillside trees, lighthouse daytime blink)
    // -------------------------------------------------------------------------
    function update(t, camera) {
      // 1. Swaying seawall algae
      for (let i = 0; i < algaeRibbons.length; i++) {
        const a = algaeRibbons[i];
        a.mesh.rotation.x = a.baseRotX + Math.sin(t * a.speed + a.phase) * 0.22;
        a.mesh.rotation.z = a.baseRotZ + Math.cos(t * a.speed * 0.8 + a.phase) * 0.16;
      }
      // 2. Swaying underwater seagrass
      for (let i = 0; i < seagrassBlades.length; i++) {
        const b = seagrassBlades[i];
        b.mesh.rotation.z = Math.sin(t * b.speed + b.phase) * 0.22;
        b.mesh.rotation.x = Math.cos(t * b.speed * 0.75 + b.phase) * 0.14;
      }
      // 3. Hillside tree crowns swaying sequentially when a sea gust sweeps across!
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i];
        const gust = getLocalGust(tr.worldX, tr.worldZ, t);
        const breeze = Math.sin(t * 1.4 + tr.phase) * tr.swayAmp;
        const gustPush = gust * (0.24 + 0.08 * Math.sin(t * 6.5 + tr.phase));
        // Gust pushes toward (-X, -Z) -> tilt Z positive, X negative
        tr.crown.rotation.z = breeze + gustPush * 0.85;
        tr.crown.rotation.x = Math.cos(t * 1.15 + tr.phase) * tr.swayAmp * 0.7 - gustPush * 0.68;
      }
      // 4. Lighthouse rare daytime beacon blink on dark cloud passage
      const cloud = window.HARBOR.evaluateCloud(t);
      const blink = cloud.lighthouseBlink;
      beamMat.uniforms.uIntensity.value = blink;
      beaconHaloMat.uniforms.uIntensity.value = blink;
      beaconCoreMat.color.setHex(blink > 0.05 ? 0xfff5c0 : 0xc4b078);
      beaconPivot.rotation.y = t * 1.65;
      beaconPivot.visible = blink > 0.005;
      beaconHalo.visible = blink > 0.005;
      if (camera && beaconHalo.visible) {
        beaconHalo.quaternion.copy(camera.quaternion);
      }
    }

    return {
      group,
      lighthouse,
      tetrapodCenters,
      update
    };
  }

  window.HARBOR_BASE = { buildDioramaBase };
})();
