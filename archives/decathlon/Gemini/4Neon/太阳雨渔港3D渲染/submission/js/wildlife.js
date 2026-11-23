// Articulated Wildlife with Camera-Proximity Reactions:
// 1. Seagulls (circling, gliding, skimming water, perching with folded wings, flushing on camera push-in)
// 2. Harbor Cat (sheltering under overturned skiff, rain-lull varied quay walks, looking up at camera)
// 3. Underwater Schooling Fish (tail-wiggle swimming, scattering on close camera then regrouping)
(function () {
  const {
    DECK_Y, WATER_Y, createRNG, lerp, clamp, smoothstep, getSeabedY, evaluateRain
  } = window.HARBOR;
  const { createCelMaterial } = window.HARBOR_MATERIALS;

  // Build articulated anime Seagull (folded wings when perched, full flapping wings in flight!)
  function createSeagullMesh(mats) {
    const root = new THREE.Group();

    // Sleek snow-white teardrop body (smooth high-seg silhouette!)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), mats.gullWhite);
    body.scale.set(0.78, 0.74, 1.58);
    body.castShadow = true;
    root.add(body);

    // Slate-grey upper back mantle
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.134, 12, 8), mats.gullGrey);
    mantle.scale.set(0.76, 0.46, 1.24);
    mantle.position.set(0, 0.04, -0.02);
    root.add(mantle);

    // Head & Neck pivot (turns curiously when perched!)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.09, 0.16);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.082, 9, 7), mats.gullWhite);
    head.castShadow = true;
    // Orange-yellow pointed beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.11, 6), mats.gullBeak);
    beak.rotation.x = Math.PI / 2 + 0.08;
    beak.position.set(0, -0.01, 0.11);
    // Crisp dark eyes
    [-0.062, 0.062].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), mats.eyeDark);
      eye.position.set(ex, 0.02, 0.042);
      headPivot.add(eye);
    });
    headPivot.add(head, beak);
    root.add(headPivot);

    // Gracefully flared fan-shaped anime gull tail
    const tailShape = new THREE.Shape();
    tailShape.moveTo(-0.042, 0);
    tailShape.lineTo(0.042, 0);
    tailShape.lineTo(0.095, -0.175);
    tailShape.quadraticCurveTo(0, -0.20, -0.095, -0.175);
    tailShape.closePath();
    const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
    tailGeo.rotateX(Math.PI / 2);
    tailGeo.translate(0, 0.009, 0);
    const tail = new THREE.Mesh(tailGeo, mats.gullWhite);
    tail.position.set(0, 0.015, -0.16);
    tail.rotation.x = 0.08;
    root.add(tail);

    // Articulated Left & Right Graceful Swept Anime Seagull Wings (tapered organic airfoil + swept black primaries!)
    function makeWing(side) {
      const wPivot = new THREE.Group();
      wPivot.position.set(side * 0.08, 0.04, 0.04);

      // Swept tapered inner wing shape
      const inShape = new THREE.Shape();
      inShape.moveTo(0, 0.08);
      inShape.quadraticCurveTo(side * 0.14, 0.09, side * 0.28, 0.04);
      inShape.lineTo(side * 0.27, -0.07);
      inShape.quadraticCurveTo(side * 0.12, -0.10, 0, -0.07);
      inShape.closePath();
      const inGeo = new THREE.ExtrudeGeometry(inShape, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
      inGeo.rotateX(-Math.PI / 2);
      inGeo.translate(0, -0.014, 0);
      const inner = new THREE.Mesh(inGeo, mats.gullGrey);
      inner.castShadow = true;

      const outerPivot = new THREE.Group();
      outerPivot.position.set(side * 0.27, 0.01, 0.0);

      // Graceful tapered white mid-outer wing
      const outShape = new THREE.Shape();
      outShape.moveTo(0, 0.048);
      outShape.quadraticCurveTo(side * 0.11, 0.022, side * 0.20, -0.028);
      outShape.lineTo(side * 0.17, -0.082);
      outShape.quadraticCurveTo(side * 0.08, -0.082, 0, -0.068);
      outShape.closePath();
      const outGeo = new THREE.ExtrudeGeometry(outShape, { depth: 0.020, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
      outGeo.rotateX(-Math.PI / 2);
      outGeo.translate(0, -0.010, 0);
      const outer = new THREE.Mesh(outGeo, mats.gullWhite);

      // Pointed black primary wingtip feathers
      const tipShape = new THREE.Shape();
      tipShape.moveTo(side * 0.18, -0.024);
      tipShape.lineTo(side * 0.31, -0.085);
      tipShape.lineTo(side * 0.15, -0.084);
      tipShape.closePath();
      const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: 0.016, bevelEnabled: false });
      tipGeo.rotateX(-Math.PI / 2);
      tipGeo.translate(0, -0.008, 0);
      const tip = new THREE.Mesh(tipGeo, mats.gullTip);

      outerPivot.add(outer, tip);
      wPivot.add(inner, outerPivot);
      return { pivot: wPivot, outer: outerPivot };
    }
    const wingL = makeWing(-1);
    const wingR = makeWing(1);
    root.add(wingL.pivot, wingR.pivot);

    // Folded wing shells (shown cleanly when perched so folded silhouette is sleek & authentic!)
    const foldedGroup = new THREE.Group();
    [-1, 1].forEach((side) => {
      const fw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), mats.gullGrey);
      fw.scale.set(0.32, 0.60, 1.85);
      fw.position.set(side * 0.085, 0.02, -0.06);
      const ft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), mats.gullTip);
      ft.position.set(side * 0.06, 0.01, -0.25);
      foldedGroup.add(fw, ft);
    });
    root.add(foldedGroup);

    // Legs (visible when standing on bollard/railing, tucked in flight!)
    const legs = new THREE.Group();
    [-0.038, 0.038].forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 5), mats.gullBeak);
      leg.position.set(lx, -0.11, 0.0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.012, 0.055), mats.gullBeak);
      foot.position.set(lx, -0.175, 0.018);
      legs.add(leg, foot);
    });
    root.add(legs);

    root.userData = {
      headPivot,
      wingL,
      wingR,
      foldedGroup,
      legs,
      setPose(flying, flapAngle, headYaw) {
        wingL.pivot.visible = flying;
        wingR.pivot.visible = flying;
        foldedGroup.visible = !flying;
        legs.visible = !flying;
        if (flying) {
          wingL.pivot.rotation.z = flapAngle;
          wingR.pivot.rotation.z = -flapAngle;
          wingL.outer.rotation.z = flapAngle * 0.45 - 0.12;
          wingR.outer.rotation.z = -flapAngle * 0.45 + 0.12;
        }
        headPivot.rotation.y = headYaw || 0;
      }
    };
    return root;
  }

  // Build articulated Anime Calico Harbor Cat (港猫)
  function createHarborCatMesh(mats) {
    const root = new THREE.Group();

    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    // Plump smooth calico cat torso (seamless CanvasTexture fur — zero faceted shell seams!)
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.162, 24, 18), mats.catBody);
    torso.scale.set(0.88, 0.84, 1.48);
    torso.position.y = 0.21;
    torso.castShadow = true;
    torso.receiveShadow = true;
    bodyPivot.add(torso);

    // Soft rounded chest fluff connecting torso cleanly to shoulders & neck
    const chestFluff = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), mats.catWhite);
    chestFluff.scale.set(0.95, 0.92, 0.90);
    chestFluff.position.set(0, 0.19, 0.145);
    bodyPivot.add(chestFluff);

    // Articulated Head Pivot (lifts & turns smoothly to look up at camera!)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.295, 0.205);
    bodyPivot.add(headPivot);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 18), mats.catHead);
    head.scale.set(1.06, 0.96, 0.98);
    head.castShadow = true;
    headPivot.add(head);

    // Delicate anime cat whiskers!
    [-1, 1].forEach((side) => {
      [-0.014, 0.008].forEach((wy, wi) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0016, 0.092, 4), mats.catBrown);
        w.rotation.z = Math.PI / 2 + side * (wi === 0 ? 0.14 : -0.06);
        w.position.set(side * 0.112, -0.020 + wy, 0.096);
        headPivot.add(w);
      });
    });

    // Pointed triangular ears with soft pink inner triangles
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.095, 6), side > 0 ? mats.catGinger : mats.catBrown);
      ear.position.set(side * 0.068, 0.112, 0.0);
      ear.rotation.z = -side * 0.24;
      ear.rotation.y = side * 0.22;
      headPivot.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.058, 5), mats.catPink);
      inner.position.set(side * 0.068, 0.109, 0.022);
      inner.rotation.z = -side * 0.24;
      headPivot.add(inner);
    });

    // Expressive amber-dark anime eyes + tiny pink nose + cute curved ':3' cat smile!
    [-0.048, 0.048].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mats.catEye);
      eye.position.set(ex, 0.015, 0.102);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 7, 6), mats.gullWhite);
      glint.position.set(ex + 0.006, 0.022, 0.120);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 6, 5), mats.gullWhite);
      glint2.position.set(ex - 0.007, 0.009, 0.120);
      headPivot.add(eye, glint, glint2);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 7), mats.catPink);
    nose.scale.set(1.15, 0.85, 0.9);
    nose.position.set(0, -0.015, 0.116);
    headPivot.add(nose);
    // Sweet tiny dark curved ':3' mouth arcs right beneath pink nose
    [-0.011, 0.011].forEach((mx) => {
      const smileArc = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 5, 10, Math.PI), mats.catBrown);
      smileArc.position.set(mx, -0.026, 0.114);
      smileArc.rotation.z = Math.PI;
      headPivot.add(smileArc);
    });

    // 4 Articulated Legs (smooth rounded shoulder joints & plump paws!)
    const legs = [];
    const legOffsets = [
      [-0.064, 0.14, 0.13],
      [0.064, 0.14, 0.13],
      [-0.072, 0.14, -0.14],
      [0.072, 0.14, -0.14]
    ];
    legOffsets.forEach(([lx, ly, lz]) => {
      const lp = new THREE.Group();
      lp.position.set(lx, ly, lz);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mats.catWhite);
      shoulder.position.y = 0.005;
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.025, 0.155, 10), mats.catWhite);
      limb.position.y = -0.06;
      limb.castShadow = true;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), mats.catWhite);
      paw.scale.set(1.05, 0.66, 1.28);
      paw.position.set(0, -0.132, 0.016);
      lp.add(shoulder, limb, paw);
      bodyPivot.add(lp);
      legs.push(lp);
    });

    // Smooth Curved Organic Cat Tail (tapered graceful S-curve!)
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 0.21, -0.21);
    bodyPivot.add(tailBase);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.05, -0.10),
      new THREE.Vector3(0, 0.16, -0.17),
      new THREE.Vector3(0, 0.26, -0.14)
    ]);
    const tailGeo = new THREE.TubeGeometry(tailCurve, 12, 0.022, 7, false);
    const tailMesh = new THREE.Mesh(tailGeo, mats.catGinger);
    tailMesh.castShadow = true;
    const tailTipPivot = new THREE.Group();
    tailTipPivot.position.set(0, 0.26, -0.14);
    const tailTipCap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 6), mats.catBrown);
    tailTipPivot.add(tailTipCap);
    tailBase.add(tailMesh, tailTipPivot);

    root.userData = { bodyPivot, headPivot, legs, tailBase, tailTipPivot };
    return root;
  }

  // Build charming cel-shaded coastal harbor Fish
  function createFishMesh(mats, variant) {
    const g = new THREE.Group();
    const bodyMat = variant === 0 ? mats.fishSilver : (variant === 1 ? mats.fishAqua : mats.fishCoral);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), bodyMat);
    body.scale.set(0.45, 0.72, 1.85);
    g.add(body);
    // Tiny crisp dark eyes on both sides of fish head
    [-0.032, 0.032].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), mats.eyeDark);
      eye.position.set(ex, 0.015, 0.095);
      g.add(eye);
    });
    // Dorsal fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.10), bodyMat);
    fin.position.set(0, 0.06, -0.02);
    fin.rotation.x = -0.25;
    g.add(fin);
    // Articulated forked tail pivot!
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, -0.14);
    const tailUpper = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.055, 0.085), bodyMat);
    tailUpper.position.set(0, 0.025, -0.04);
    tailUpper.rotation.x = 0.42;
    const tailLower = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.055, 0.085), bodyMat);
    tailLower.position.set(0, -0.025, -0.04);
    tailLower.rotation.x = -0.42;
    tailPivot.add(tailUpper, tailLower);
    g.add(tailPivot);

    g.userData = { tailPivot };
    return g;
  }

  function buildWildlife(scene, propsRef, boatsRef) {
    const group = new THREE.Group();
    group.name = 'HarborWildlife';
    scene.add(group);

    const rng = createRNG(5050);

    const TEX = window.HARBOR_TEXTURES;
    const catHeadTex = TEX.createCatHeadTexture();
    const catBodyTex = TEX.createCatBodyTexture();

    const mats = {
      gullWhite: createCelMaterial({ color: 0xf8fbfc, wetness: 0.25, rim: 0.36 }),
      gullGrey: createCelMaterial({ color: 0x8ea9b5, wetness: 0.25, rim: 0.26 }),
      gullTip: createCelMaterial({ color: 0x26353d, wetness: 0.20, rim: 0.15 }),
      gullBeak: createCelMaterial({ color: 0xf2a538, wetness: 0.35, rim: 0.24 }),
      eyeDark: createCelMaterial({ color: 0x1b262c, wetness: 0.80, rim: 0.10 }),
      catHead: createCelMaterial({ color: 0xffffff, map: catHeadTex, wetness: 0.12, rim: 0.26 }),
      catBody: createCelMaterial({ color: 0xffffff, map: catBodyTex, wetness: 0.12, rim: 0.26 }),
      catWhite: createCelMaterial({ color: 0xf8f4ec, wetness: 0.12, rim: 0.26 }),
      catGinger: createCelMaterial({ color: 0xe08e44, wetness: 0.12, rim: 0.26 }),
      catBrown: createCelMaterial({ color: 0x5a4134, wetness: 0.12, rim: 0.22 }),
      catPink: createCelMaterial({ color: 0xf2a8a4, wetness: 0.20, rim: 0.15 }),
      catEye: createCelMaterial({ color: 0x2a4d3c, wetness: 0.90, rim: 0.20 }),
      fishSilver: createCelMaterial({ color: 0xc2e8ee, wetness: 0.3, rim: 0.3, caustics: 0.6, causticsMode: 1.0 }),
      fishAqua: createCelMaterial({ color: 0x76ced4, wetness: 0.3, rim: 0.3, caustics: 0.6, causticsMode: 1.0 }),
      fishCoral: createCelMaterial({ color: 0xf0a67a, wetness: 0.3, rim: 0.3, caustics: 0.6, causticsMode: 1.0 })
    };

    // =========================================================================
    // 1. SEAGULLS (3 Circling/Gliding/Skimming + 4 Perching with Camera-Flush!)
    // =========================================================================
    const circlingGulls = [];
    const circleSpecs = [
      // Soars over harbor & timed to glide right across foreground puddle mirror at t=17.5..19.5s (Shot 4)!
      { cx: 1.5, cz: 6.8, rx: 8.6, rz: 6.2, baseY: 5.4, yAmp: 1.3, speed: 0.34, phase: -1.15, skim: true },
      // Wide graceful glide around breakwater & lighthouse
      { cx: 4.5, cz: -3.5, rx: 10.5, rz: 8.2, baseY: 7.8, yAmp: 1.2, speed: -0.28, phase: 2.3, skim: false },
      // Lower playful water-skimming gull swooping across inner harbor basin
      { cx: 5.2, cz: 2.2, rx: 6.8, rz: 5.8, baseY: 3.1, yAmp: 1.4, speed: 0.42, phase: 4.1, skim: true }
    ];
    circleSpecs.forEach((sp) => {
      const mesh = createSeagullMesh(mats);
      mesh.scale.setScalar(1.08);
      group.add(mesh);
      circlingGulls.push({ mesh, ...sp });
    });

    // 4 Perching Seagulls (Bollard B_FE1 hero gull, Boat 2 roof railing gull, Water-floating gull, Breakwater parapet gull)
    const perchedGulls = [
      {
        id: 'bollard_hero',
        mesh: createSeagullMesh(mats),
        getAnchor: () => propsRef.bollards.B_FE1.topPos.clone().add(new THREE.Vector3(0, 0.16, 0)),
        baseYaw: 1.15,
        onWater: false,
        flushDir: new THREE.Vector3(0.42, 0.72, -0.55).normalize(),
        tourFlushStart: 13.45, // Sits perched 11.5..13.45s, then spreads wings & lifts cleanly across center of frame!
        tourFlushDur: 6.2,
        interactiveFlush: 0
      },
      {
        id: 'boat2_rail',
        mesh: createSeagullMesh(mats),
        getAnchor: () => {
          boatsRef.boat2.updateMatrixWorld(true);
          return boatsRef.boat2.userData.roofPerchLocal.clone().applyMatrix4(boatsRef.boat2.matrixWorld).add(new THREE.Vector3(0, 0.15, 0));
        },
        baseYaw: 0.9,
        onWater: false,
        flushDir: new THREE.Vector3(0.65, 0.65, 0.35).normalize(),
        tourFlushStart: -1,
        tourFlushDur: 5.0,
        interactiveFlush: 0
      },
      {
        id: 'water_float',
        mesh: createSeagullMesh(mats),
        getAnchor: (t) => new THREE.Vector3(5.6 + Math.sin(t * 0.4) * 0.25, WATER_Y + 0.06 + Math.sin(t * 2.1) * 0.04, 8.6 + Math.cos(t * 0.35) * 0.22),
        baseYaw: -0.65,
        onWater: true,
        flushDir: new THREE.Vector3(0.55, 0.60, 0.55).normalize(),
        tourFlushStart: -1,
        tourFlushDur: 5.0,
        interactiveFlush: 0
      },
      {
        id: 'breakwater_wall',
        mesh: createSeagullMesh(mats),
        getAnchor: () => new THREE.Vector3(1.5, 2.54, -7.92),
        baseYaw: 0.4,
        onWater: false,
        flushDir: new THREE.Vector3(0.4, 0.65, -0.65).normalize(),
        tourFlushStart: -1,
        tourFlushDur: 6.5,
        periodicPatrolCycle: 26.0, // Naturally takes off to skim water & returns to fold wings on parapet!
        interactiveFlush: 0
      }
    ];
    perchedGulls.forEach((pg) => {
      pg.mesh.scale.setScalar(1.06);
      group.add(pg.mesh);
    });

    // =========================================================================
    // 2. HARBOR CAT (Sheltering under Overturned Skiff + Rain-Lull Quay Strolls + Camera Gaze)
    // =========================================================================
    const catMesh = createHarborCatMesh(mats);
    catMesh.scale.setScalar(1.15);
    group.add(catMesh);

    const shelterHome = propsRef.catShelterPos.clone();
    // 3 Varied prop-clear scenic quay stroll routes when rain eases (every excursion picks a different path, zero prop/puddle clip!)
    const catRoutes = [
      // Route 0: Slipway -> Foreground Instrument Cases -> Dry Puddle Rim & Signboard -> Around Drying Net -> back to Skiff
      new THREE.CatmullRomCurve3([
        shelterHome.clone(),
        new THREE.Vector3(-4.8, DECK_Y, 7.5),
        new THREE.Vector3(-2.6, DECK_Y, 8.3),
        new THREE.Vector3(-1.8, DECK_Y, 9.6),
        new THREE.Vector3(-0.3, DECK_Y, 11.4),
        new THREE.Vector3(-2.2, DECK_Y, 13.5),
        new THREE.Vector3(-5.0, DECK_Y, 12.6),
        new THREE.Vector3(-6.8, DECK_Y, 10.6),
        new THREE.Vector3(-5.4, DECK_Y, 7.6),
        shelterHome.clone()
      ]),
      // Route 1: Slipway -> Waiting Room Glass Walkway -> Vending Machine Front -> Alleyway -> back to Skiff
      new THREE.CatmullRomCurve3([
        shelterHome.clone(),
        new THREE.Vector3(-5.2, DECK_Y, 7.2),
        new THREE.Vector3(-6.8, DECK_Y, 7.5),
        new THREE.Vector3(-7.0, DECK_Y, 9.9),
        new THREE.Vector3(-7.2, DECK_Y, 6.2),
        new THREE.Vector3(-7.5, DECK_Y, 3.0),
        new THREE.Vector3(-6.9, DECK_Y, 5.2),
        new THREE.Vector3(-5.2, DECK_Y, 6.5),
        shelterHome.clone()
      ]),
      // Route 2: Slipway -> Wide West Quay Walkway -> Fish Co-op Warehouse Open Shutter -> Jib Crane -> back to Skiff
      new THREE.CatmullRomCurve3([
        shelterHome.clone(),
        new THREE.Vector3(-5.3, DECK_Y, 5.2),
        new THREE.Vector3(-6.5, DECK_Y, 4.3),
        new THREE.Vector3(-6.5, DECK_Y, 1.8),
        new THREE.Vector3(-6.7, DECK_Y, -1.6),
        new THREE.Vector3(-7.2, DECK_Y, -3.5),
        new THREE.Vector3(-6.6, DECK_Y, 0.2),
        new THREE.Vector3(-6.5, DECK_Y, 4.1),
        new THREE.Vector3(-5.3, DECK_Y, 5.4),
        shelterHome.clone()
      ])
    ];

    // =========================================================================
    // 3. UNDERWATER FISH SCHOOL (28 Fish swimming in clear harbor water, scatter on close camera!)
    // =========================================================================
    const schoolCenter = new THREE.Vector3(9.4, -1.55, 11.8);
    const fishList = [];
    for (let i = 0; i < 28; i++) {
      const fMesh = createFishMesh(mats, i % 3);
      const sc = 0.85 + rng() * 0.65;
      fMesh.scale.setScalar(sc);
      group.add(fMesh);
      // Two lively sub-schools: main cluster near front-right cutaway (very visible!) + secondary cluster mid-harbor
      const inMain = i < 20;
      const cx = inMain ? 9.6 : 5.4;
      const cz = inMain ? 12.2 : 3.2;
      const rOrbit = (inMain ? 1.6 : 1.8) + rng() * 2.8;
      fishList.push({
        mesh: fMesh,
        cx,
        cz,
        rx: rOrbit * (0.85 + rng() * 0.35),
        rz: rOrbit * (0.75 + rng() * 0.45),
        baseY: -1.85 + rng() * 1.05,
        speed: (0.45 + rng() * 0.35) * (i % 2 === 0 ? 1 : -1),
        phase: rng() * Math.PI * 2,
        scatterDir: new THREE.Vector3(Math.cos(i * 2.4), (rng() - 0.45) * 0.35, Math.sin(i * 2.4)).normalize(),
        scatterDist: 2.2 + rng() * 1.8
      });
    }

    // Smooth interactive states (used ONLY in interactive mode; export mode is 100% pure function of t!)
    const interactiveState = {
      fishScatter: 0.0,
      fishPhase: 0.0, // 0=calm, >0=scatter-then-regroup timer even while camera stays viewing!
      fishWasClose: false,
      catLook: 0.0
    };

    const tmpVec = new THREE.Vector3();
    const tmpPos = new THREE.Vector3();

    function update(t, camera, isExportMode, dt) {
      const stepDt = dt || 0.016;

      // -----------------------------------------------------------------------
      // 1. Update Circling / Skimming Seagulls
      // -----------------------------------------------------------------------
      for (let i = 0; i < circlingGulls.length; i++) {
        const g = circlingGulls[i];
        const a = t * g.speed + g.phase;
        const x = g.cx + Math.cos(a) * g.rx;
        const z = g.cz + Math.sin(a) * g.rz;
        // Occasional gentle swoop near water for skim gulls
        const swoop = g.skim ? Math.sin(a * 0.5) * g.yAmp : Math.sin(a * 1.5) * g.yAmp;
        const y = Math.max(0.85, g.baseY + swoop);
        const dx = -Math.sin(a) * g.rx * g.speed;
        const dz = Math.cos(a) * g.rz * g.speed;
        g.mesh.position.set(x, y, z);
        g.mesh.rotation.y = Math.atan2(dx, dz);
        // Bank gracefully into turn!
        g.mesh.rotation.z = g.speed > 0 ? -0.26 : 0.26;
        g.mesh.rotation.x = -Math.cos(a * 0.5) * 0.12;
        // Alternate 3 wingbeats then peaceful long glide!
        const glideCycle = (t * 0.65 + g.phase) % 3.2;
        const flap = glideCycle < 1.3 ? Math.sin(glideCycle * 11.5) * 0.62 : 0.12 + Math.sin(t * 2.0) * 0.05;
        g.mesh.userData.setPose(true, flap, 0);
      }

      // -----------------------------------------------------------------------
      // 2. Update Perching Seagulls (Folded Wings + Camera Proximity Flush!)
      // -----------------------------------------------------------------------
      for (let i = 0; i < perchedGulls.length; i++) {
        const pg = perchedGulls[i];
        const anchor = pg.getAnchor(t);
        let flushProgress = 0.0; // 0 = perched, >0 = flying away!

        if (isExportMode) {
          // Pure deterministic choreography for video export (Hero Bollard Gull flushes on cue at t=13.45s!)
          if (pg.tourFlushStart > 0 && t >= pg.tourFlushStart && t <= pg.tourFlushStart + pg.tourFlushDur) {
            flushProgress = (t - pg.tourFlushStart) / pg.tourFlushDur;
          } else if (pg.periodicPatrolCycle) {
            const pPhase = (t + 5.0) % pg.periodicPatrolCycle;
            if (pPhase < pg.tourFlushDur) flushProgress = pPhase / pg.tourFlushDur;
          }
        } else if (camera) {
          const camDist = camera.position.distanceTo(anchor);
          if (camDist < 7.5 && pg.interactiveFlush <= 0.001) {
            pg.interactiveFlush = 0.01;
          }
          if (pg.interactiveFlush > 0) {
            // While camera stays close, soar & circle smoothly aloft (hold near 0.48..0.52); once camera pulls back, glide smoothly down to perch!
            if (camDist < 7.2 && pg.interactiveFlush >= 0.45 && pg.interactiveFlush <= 0.58) {
              pg.interactiveFlush = 0.50 + Math.sin(t * 0.9) * 0.04;
            } else {
              pg.interactiveFlush += stepDt / pg.tourFlushDur;
              if (pg.interactiveFlush >= 1.0) pg.interactiveFlush = 0.0;
            }
            flushProgress = pg.interactiveFlush;
          } else if (pg.periodicPatrolCycle) {
            const pPhase = (t + 5.0) % pg.periodicPatrolCycle;
            if (pPhase < pg.tourFlushDur) flushProgress = pPhase / pg.tourFlushDur;
          }
        }

        if (flushProgress > 0.001) {
          // Graceful smooth ease-out takeoff arc -> ascending flight -> gentle return to perch!
          const easeP = flushProgress * flushProgress * (3 - 2 * flushProgress);
          const arc = Math.sin(easeP * Math.PI);
          const climb = Math.pow(Math.sin(Math.min(1, easeP * 1.1) * Math.PI), 0.85);
          const spiralAng = easeP * Math.PI * 1.5;
          const fx = anchor.x + pg.flushDir.x * arc * 5.8 + Math.sin(spiralAng) * arc * 1.8;
          const fy = anchor.y + climb * 3.8 + Math.sin(flushProgress * 14) * 0.10;
          const fz = anchor.z + pg.flushDir.z * arc * 5.8 + (1 - Math.cos(spiralAng)) * arc * 1.4;

          const fp2 = Math.min(1, flushProgress + 0.02);
          const e2 = fp2 * fp2 * (3 - 2 * fp2);
          const arc2 = Math.sin(e2 * Math.PI);
          const sp2 = e2 * Math.PI * 1.5;
          const fx2 = anchor.x + pg.flushDir.x * arc2 * 5.8 + Math.sin(sp2) * arc2 * 1.8;
          const fz2 = anchor.z + pg.flushDir.z * arc2 * 5.8 + (1 - Math.cos(sp2)) * arc2 * 1.4;

          pg.mesh.position.set(fx, fy, fz);
          pg.mesh.rotation.y = Math.atan2(fx2 - fx, fz2 - fz);
          pg.mesh.rotation.x = -0.18 * (1 - easeP * 1.4);
          pg.mesh.rotation.z = -0.22 * arc;
          const flap = Math.sin(flushProgress * 44.0) * 0.70;
          pg.mesh.userData.setPose(true, flap, 0);
        } else {
          // Perched calmly with folded wings!
          pg.mesh.position.copy(anchor);
          pg.mesh.rotation.set(0, pg.baseYaw, 0);
          if (pg.onWater) {
            pg.mesh.rotation.z = Math.sin(t * 1.8) * 0.08;
            pg.mesh.userData.legs.visible = false;
          }
          const headLook = Math.sin(t * 0.9 + i * 2.1) * 0.42;
          pg.mesh.userData.setPose(false, 0, headLook);
          if (pg.onWater) pg.mesh.userData.legs.visible = false;
        }
      }

      // -----------------------------------------------------------------------
      // 3. Update Harbor Cat (Sheltering under Skiff / Rain-Lull Quay Strolls / Camera Gaze!)
      // -----------------------------------------------------------------------
      const rain = evaluateRain(t);
      // Cat walks out during rain lulls after t=65s in interactive play (or t in [3.5, 11.0] ONLY if not tour?
      // Better: in tour 0..60s, cat shelters cozily under skiff for Tour Shot 5 at 21..25.5s, AND walks during t in [34..42s] lull or interactive lulls!)
      // Let's schedule deterministic rain-lull strolls cleanly on a 44s cycle starting at t = 34.0s (so at 21..25.5s it is cozily under the skiff, AND at 36..44s during rain ease it explores the quay, picking a different route every excursion!)
      const catCycle = 44.0;
      const catOffset = t - 34.0;
      let isWalking = false;
      let walkU = 0;
      let routeIdx = 0;
      if (catOffset >= 0) {
        const tripIdx = Math.floor(catOffset / catCycle);
        const tripLocal = catOffset % catCycle;
        const walkDur = 15.0; // 15s leisurely walk out & trot back before rain thickens!
        if (tripLocal < walkDur && (isExportMode ? t > 35.0 : rain.intensity < 0.78)) {
          isWalking = true;
          walkU = tripLocal / walkDur;
          routeIdx = tripIdx % catRoutes.length;
        }
      }

      const cu = catMesh.userData;
      if (isWalking) {
        const route = catRoutes[routeIdx];
        const pos = route.getPointAt(clamp(walkU, 0, 0.999));
        const ahead = route.getPointAt(clamp(walkU + 0.015, 0, 0.999));
        // Keep vertical footing flush with slipway ramp vs concrete deck!
        const footY = pos.x > -5.5 && pos.z < 7.5
          ? lerp(DECK_Y, -0.35, clamp((pos.x + 5.5) / 3.8, 0, 1))
          : DECK_Y;
        catMesh.position.set(pos.x, footY, pos.z);
        catMesh.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
        // Trot faster on the final 22% rushing back to shelter before rain thickens!
        const pace = walkU > 0.78 ? 14.0 : 8.5;
        cu.bodyPivot.position.y = Math.abs(Math.sin(t * pace)) * 0.022;
        cu.legs[0].rotation.x = Math.sin(t * pace) * 0.52;
        cu.legs[1].rotation.x = -Math.sin(t * pace) * 0.52;
        cu.legs[2].rotation.x = -Math.sin(t * pace) * 0.52;
        cu.legs[3].rotation.x = Math.sin(t * pace) * 0.52;
        cu.tailBase.rotation.y = Math.sin(t * 3.8) * 0.28;
        cu.tailBase.rotation.x = 0.25;
      } else {
        // Curled / loaf-resting cozily underneath the propped overturned skiff looking out toward harbor & walkway (+Z/+X)!
        catMesh.position.copy(shelterHome);
        catMesh.rotation.set(0, 0.42, 0); // faces directly out from under the lifted south-east skiff lip!
        cu.bodyPivot.position.y = -0.065; // cozy alert loaf-sitting pose (head & ears cleanly visible!)
        cu.legs[0].rotation.x = -1.05;
        cu.legs[1].rotation.x = -1.05;
        cu.legs[2].rotation.x = 0.95;
        cu.legs[3].rotation.x = 0.95;
        cu.tailBase.rotation.x = -0.35;
        cu.tailBase.rotation.y = Math.sin(t * 1.8) * 0.42;
        cu.tailTipPivot.rotation.y = Math.sin(t * 2.4 - 0.6) * 0.35;
      }

      // Camera Gaze Reaction: When viewer zooms near the cat, it smoothly lifts its head to look into the camera!
      let gazeWeight = 0.0;
      if (isExportMode) {
        // Right on cue during Tour Shot 5 (t = 21.8..25.5s)!
        gazeWeight = smoothstep(21.8, 22.8, t) * (1.0 - smoothstep(25.3, 25.8, t));
      } else if (camera) {
        const dCat = camera.position.distanceTo(catMesh.position);
        const targetGaze = dCat < 8.5 ? 1.0 : 0.0;
        interactiveState.catLook = lerp(interactiveState.catLook, targetGaze, clamp(stepDt * 4.0, 0, 1));
        gazeWeight = interactiveState.catLook;
      }

      if (camera && gazeWeight > 0.01) {
        catMesh.updateMatrixWorld(true);
        tmpPos.setFromMatrixPosition(cu.headPivot.matrixWorld);
        tmpVec.subVectors(camera.position, tmpPos);
        // Convert world direction to cat-local yaw & pitch
        const catYaw = catMesh.rotation.y;
        const targetWorldYaw = Math.atan2(tmpVec.x, tmpVec.z);
        let relYaw = targetWorldYaw - catYaw;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        const horiz = Math.max(0.1, Math.hypot(tmpVec.x, tmpVec.z));
        const relPitch = -Math.atan2(tmpVec.y, horiz);
        cu.headPivot.rotation.y = clamp(relYaw, -0.85, 0.85) * gazeWeight;
        cu.headPivot.rotation.x = clamp(relPitch, -0.68, 0.35) * gazeWeight;
      } else {
        cu.headPivot.rotation.y = Math.sin(t * 0.85) * 0.25;
        cu.headPivot.rotation.x = 0.05 + Math.sin(t * 0.55) * 0.08;
      }

      // -----------------------------------------------------------------------
      // 4. Update Underwater Schooling Fish (Tail Wiggle + Camera-Close Scatter & Regroup!)
      // -----------------------------------------------------------------------
      let scatter = 0.0;
      if (isExportMode) {
        // Gently scatter & swirl as Tour Shot 9 drops right beside the underwater cutaway (t = 44.2..47.8s)!
        scatter = smoothstep(44.0, 45.2, t) * (1.0 - smoothstep(46.8, 48.5, t));
      } else if (camera) {
        // Trigger fish scatter cleanly whenever camera pushes near EITHER underwater fish sub-school!
        const dMain = camera.position.distanceTo(schoolCenter);
        const dSub = Math.hypot(camera.position.x - 5.4, camera.position.y + 1.55, camera.position.z - 3.2);
        const isClose = Math.min(dMain, dSub) < 12.5;
        if (isClose && !interactiveState.fishWasClose && interactiveState.fishPhase <= 0) {
          interactiveState.fishPhase = 0.001; // Start crisp scatter -> hold -> calm regroup cycle!
        }
        interactiveState.fishWasClose = isClose;
        if (interactiveState.fishPhase > 0) {
          interactiveState.fishPhase += stepDt;
          // 0..1.0s: brisk radial scatter; 1.0..2.6s: dispersed swirl; 2.6..6.8s: calm regroup back into school!
          const p = interactiveState.fishPhase;
          if (p < 1.0) {
            interactiveState.fishScatter = smoothstep(0.0, 1.0, p);
          } else if (p < 2.6) {
            interactiveState.fishScatter = 1.0;
          } else if (p < 6.8) {
            interactiveState.fishScatter = 1.0 - smoothstep(2.6, 6.8, p);
          } else {
            interactiveState.fishScatter = 0.0;
            interactiveState.fishPhase = 0.0;
          }
        }
        scatter = interactiveState.fishScatter;
      }

      for (let i = 0; i < fishList.length; i++) {
        const f = fishList[i];
        const ang = t * f.speed + f.phase;
        const bx = f.cx + Math.cos(ang) * f.rx;
        const bz = f.cz + Math.sin(ang) * f.rz;
        const by = f.baseY + Math.sin(t * 1.2 + f.phase) * 0.16;

        // Apply radial scatter offset safely clamped inside diorama water volume!
        const fx = clamp(bx + f.scatterDir.x * scatter * f.scatterDist, 2.8, 16.0);
        const fz = clamp(bz + f.scatterDir.z * scatter * f.scatterDist, -4.5, 16.0);
        const bed = getSeabedY(fx, fz);
        const fy = clamp(by + f.scatterDir.y * scatter * 0.5, bed + 0.32, -0.45);

        const vx = -Math.sin(ang) * f.rx * f.speed + f.scatterDir.x * scatter * 1.4;
        const vz = Math.cos(ang) * f.rz * f.speed + f.scatterDir.z * scatter * 1.4;
        f.mesh.position.set(fx, fy, fz);
        f.mesh.rotation.y = Math.atan2(vx, vz);
        f.mesh.rotation.x = -Math.cos(t * 1.2 + f.phase) * 0.08;
        // Rapid agile tail-wiggle (even faster when darting!)
        const tailFreq = 9.5 + scatter * 10.0;
        f.mesh.userData.tailPivot.rotation.y = Math.sin(t * tailFreq + f.phase * 3.0) * (0.36 + scatter * 0.22);
      }
    }

    return {
      group,
      catMesh,
      perchedGulls,
      fishList,
      update
    };
  }

  window.HARBOR_WILDLIFE = { buildWildlife };
})();
