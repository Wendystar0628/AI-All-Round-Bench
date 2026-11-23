/* 底座、L 形码头、岸壁剖面、水下环境、山坡、防波堤与灯塔 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp, outline = H.outline;

  function buildTerrain(scene) {
    const g = grp(0, 0, 0, scene);
    H.refs.terrain = g;

    // ---------- 展示底座 ----------
    const plinth = box(22.7, 0.34, 22.7, toon(0xe6e2d6), 0, -2.58, 0, g);
    plinth.receiveShadow = true;
    box(23.2, 0.14, 23.2, toon(0xcfc9ba), 0, -2.82, 0, g);

    // ---------- 陆域混凝土 ----------
    const concMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.concreteTexture(3, false) });
    const concWetMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.concreteTexture(9, true) });
    // 前景堤岸
    const frontQuay = box(22, 3.4, 6.5, concMat, 0, -0.7, 7.75, g);
    frontQuay.receiveShadow = true;
    // 左臂码头
    box(6.5, 3.4, 10.5, concMat, -7.75, -0.7, -0.75, g);
    // 山坡陆域基础
    box(6, 3.4, 5, concMat, -8, -0.7, -8.5, g);
    // 堤岸顶面（湿润水泥：柔和天光高光，独立平面便于接收阴影与水洼）
    const concWetSheen = new THREE.MeshPhongMaterial({ color: 0xffffff, map: H.concreteTexture(9, true), specular: H.srgbColor(0x2c3838), shininess: 90 });
    const topFront = H.plane(22, 6.5, concWetSheen, 0, L.quayY + 0.005, 7.75, g);
    topFront.rotation.x = -Math.PI / 2; topFront.receiveShadow = true;
    const topLeft = H.plane(6.5, 10.5, concWetSheen, -7.75, L.quayY + 0.005, -0.75, g);
    topLeft.rotation.x = -Math.PI / 2; topLeft.receiveShadow = true;

    // 伸缩缝
    const jointMat = toon(0x9fb0aa);
    for (let x = -8; x <= 8; x += 4) box(0.05, 0.012, 6.5, jointMat, x, L.quayY + 0.012, 7.75, g);
    for (let z = 6; z <= 10; z += 2.2) box(22, 0.012, 0.05, jointMat, 0, L.quayY + 0.012, z, g);
    for (let z = -4; z <= 3; z += 3.5) box(6.5, 0.012, 0.05, jointMat, -7.75, L.quayY + 0.012, z, g);
    // 井盖
    const manhole = cyl(0.28, 0.28, 0.025, 20, toon(0x9aa8a4), -2.6, L.quayY + 0.018, 8.6, g);
    manhole.material = new THREE.MeshToonMaterial({
      color: 0xaab8b4, gradientMap: H.gradientMap,
      map: H.canvasTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#a5b3af'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#7c8c88'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(64, 64, 52, 0, 6.283); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          ctx.beginPath(); ctx.moveTo(64, 64);
          ctx.lineTo(64 + 50 * Math.cos(i * 0.785), 64 + 50 * Math.sin(i * 0.785)); ctx.stroke();
        }
      })
    });

    // ---------- 护轮坎（黄黑警示） ----------
    const hazMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.hazardTexture() });
    const curbF = box(15.5, 0.17, 0.32, hazMat, 3.25, L.quayY + 0.085, 4.34, g);
    curbF.castShadow = true;
    const curbL = box(0.32, 0.17, 10.5, hazMat, -4.34, L.quayY + 0.085, -0.75, g);
    curbL.material = hazMat.clone(); curbL.material.map = H.hazardTexture(); curbL.material.map.repeat.set(6, 1);
    curbL.castShadow = true;

    // ---------- 岸壁（潮位剖面） ----------
    const wallMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.seawallTexture() });
    const wallA = box(0.26, 3.4, 10.5, wallMat, -4.63, -0.7, -0.75, g);   // 左臂内缘，面向 +x
    wallA.receiveShadow = true;
    const wallB = box(15.5, 3.4, 0.26, wallMat.clone(), 3.25, -0.7, 4.63, g); // 前景内缘，面向 -z
    wallB.material.map = H.seawallTexture();
    wallB.receiveShadow = true;
    // 山坡临水矮壁
    box(6, 3.4, 0.26, wallMat.clone(), -8, -0.7, -6.13, g);

    // 藤壶与牡蛎壳（ instanced ）
    const barnGeo = new THREE.ConeGeometry(0.045, 0.07, 6);
    const barnMat = toon(0xd8ddd4);
    const barn = new THREE.InstancedMesh(barnGeo, barnMat, 170);
    const oysGeo = new THREE.SphereGeometry(0.06, 7, 5);
    const oysMat = toon(0xb9c2b4);
    const oys = new THREE.InstancedMesh(oysGeo, oysMat, 70);
    const rnd = H.mulberry32(33);
    const dummy = new THREE.Object3D();
    let bi = 0, oi = 0;
    for (let i = 0; i < 170; i++) {
      const onA = rnd() < 0.45;
      const y = 0.02 + rnd() * 0.5;
      if (onA) {
        dummy.position.set(-4.49, y, -5.8 + rnd() * 10.1);
        dummy.rotation.set(0, 0, -Math.PI / 2 + (rnd() - 0.5) * 0.5);
      } else {
        dummy.position.set(-4.2 + rnd() * 15.1, y, 4.49);
        dummy.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, 0);
      }
      const s = 0.6 + rnd() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      barn.setMatrixAt(bi++, dummy.matrix);
      if (i < 70) {
        dummy.scale.set(s * 1.3, s * 0.5, s * 1.1);
        dummy.updateMatrix();
        oys.setMatrixAt(oi++, dummy.matrix);
      }
    }
    barn.instanceMatrix.needsUpdate = true;
    oys.instanceMatrix.needsUpdate = true;
    g.add(barn); g.add(oys);

    // 海藻（随水摆动）
    H.anim.seaweed = [];
    const weedMat = toon(0x5d8a6a, { side: THREE.DoubleSide });
    const weedMat2 = toon(0x74a07a, { side: THREE.DoubleSide });
    function seaweedCluster(x, y, z, n, hgt) {
      const c = grp(x, y, z, g);
      for (let i = 0; i < n; i++) {
        const geo = new THREE.PlaneGeometry(0.09, hgt * (0.7 + rnd() * 0.6), 1, 5);
        geo.translate(0, hgt * 0.4, 0);
        const m = new THREE.Mesh(geo, rnd() < 0.5 ? weedMat : weedMat2);
        m.position.set((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
        m.rotation.y = rnd() * Math.PI;
        c.add(m);
        H.anim.seaweed.push({ mesh: m, phase: rnd() * 6.28, amp: 0.12 + rnd() * 0.12 });
      }
      return c;
    }
    for (let i = 0; i < 9; i++) seaweedCluster(-4.42, -1.55 + rnd() * 1.3, -5.5 + rnd() * 9.6, 3, 0.5);
    for (let i = 0; i < 9; i++) seaweedCluster(-3.8 + rnd() * 14.4, -1.55 + rnd() * 1.3, 4.42, 3, 0.5);

    // 系船环
    const ringMat = toon(P.iron);
    [[-4.48, 0.82, 1.8, Math.PI / 2], [-4.48, 0.82, -3.4, Math.PI / 2], [0.2, 0.82, 4.48, 0], [5.6, 0.82, 4.48, 0], [8.9, 0.82, 4.48, 0]].forEach(function (r) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 14), ringMat);
      ring.position.set(r[0], r[1], r[2]);
      ring.rotation.y = r[3];
      ring.castShadow = true;
      g.add(ring);
      box(0.1, 0.1, 0.05, ringMat, r[0], r[1] + 0.08, r[2], g);
    });

    // 锈蚀铁梯
    function ladder(x, z, ry) {
      const ld = grp(x, 0, z, g, ry);
      const lm = toon(P.ironRust);
      box(0.05, 2.7, 0.05, lm, -0.22, -0.35, 0, ld);
      box(0.05, 2.7, 0.05, lm, 0.22, -0.35, 0, ld);
      for (let i = 0; i < 8; i++) box(0.44, 0.04, 0.04, lm, 0, 0.85 - i * 0.34, 0, ld);
      return ld;
    }
    ladder(2.9, 4.44, 0);
    ladder(-4.44, -1.2, Math.PI / 2);

    // ---------- 台阶与上下船平台 ----------
    const stepMat = concWetMat;
    for (let i = 0; i < 5; i++) {
      const st = box(2.2, 0.24, 0.42, stepMat, 1.5, L.quayY - 0.12 - i * 0.235, 4.42 - i * 0.38, g);
      st.receiveShadow = true; st.castShadow = true;
    }
    // 平台（略低）
    const plat = box(1.7, 0.62, 1.15, concMat, 3.35, 0.31 + 0.0, 3.98, g);
    plat.receiveShadow = true;
    const platTop = H.plane(1.7, 1.15, concWetMat, 3.35, 0.625, 3.98, g);
    platTop.rotation.x = -Math.PI / 2; platTop.receiveShadow = true;
    cyl(0.09, 0.11, 1.9, 8, toon(P.concreteDark), 2.7, -0.6, 3.6, g);
    cyl(0.09, 0.11, 1.9, 8, toon(P.concreteDark), 4.0, -0.6, 3.6, g);
    // 平台小系缆桩
    cyl(0.06, 0.08, 0.22, 8, toon(P.iron), 3.9, 0.73, 4.3, g);

    // ---------- 滑道（岸侧高、入水低） ----------
    const slopeG = grp(8.6, 0, 0, g);
    const ramp = box(2.3, 0.16, 3.6, concMat, 0, 0.52, 3.0, slopeG);
    ramp.rotation.x = -0.42;
    ramp.receiveShadow = true; ramp.castShadow = true;
    const rail1 = box(0.14, 0.3, 3.6, concMat, -1.18, 0.62, 3.0, slopeG); rail1.rotation.x = -0.42;
    const rail2 = box(0.14, 0.3, 3.6, concMat, 1.18, 0.62, 3.0, slopeG); rail2.rotation.x = -0.42;
    // 滑道铁轨
    const railMat = toon(P.ironRust);
    const r1 = box(0.07, 0.05, 3.6, railMat, -0.55, 0.63, 3.0, slopeG); r1.rotation.x = -0.42;
    const r2 = box(0.07, 0.05, 3.6, railMat, 0.55, 0.63, 3.0, slopeG); r2.rotation.x = -0.42;

    // ---------- 水域海床与剖面 ----------
    const underG = grp(0, 0, 0, scene);
    H.refs.underwater = underG;
    const seabedTex = H.canvasTex(512, 512, (ctx, w, h) => {
      const r2 = H.mulberry32(17);
      ctx.fillStyle = '#8a9a90'; ctx.fillRect(0, 0, w, h);
      H.speckle(ctx, w, h, 500, ['#7a8c82', '#9caa9e', '#66786e', '#a8b4a6'], 2, 10, 0.4, r2);
      H.speckle(ctx, w, h, 220, ['#5f7a74', '#6e887e'], 6, 22, 0.25, r2);
    }, [3, 3]);
    const seabed = H.plane(15.5, 15.5, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: seabedTex }), 3.25, L.seabedY + 0.01, -3.25, underG);
    seabed.rotation.x = -Math.PI / 2; seabed.receiveShadow = true;
    // 海床基座
    box(15.5, 0.7, 15.5, toon(P.seabedDark), 3.25, -2.05, -3.25, underG);

    // 碎石
    const pebGeo = new THREE.DodecahedronGeometry(0.14, 0);
    const pebMats = [toon(0x9aa89c), toon(0x7c8e84), toon(0xb0bab0)];
    pebMats.forEach(function (pm, k) {
      const inst = new THREE.InstancedMesh(pebGeo, pm, 34);
      const rr = H.mulberry32(50 + k);
      for (let i = 0; i < 34; i++) {
        dummy.position.set(-4.1 + rr() * 14.8, L.seabedY + 0.05, -10.6 + rr() * 14.8);
        dummy.rotation.set(rr() * 3, rr() * 3, rr() * 3);
        const s = 0.5 + rr() * 1.4;
        dummy.scale.set(s, s * 0.55, s * (0.7 + rr() * 0.5));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.receiveShadow = true;
      underG.add(inst);
    });

    // 沉底旧轮胎
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 10, 20), toon(0x3d4a48));
    tire.position.set(2.3, L.seabedY + 0.14, -3.6);
    tire.rotation.x = -1.25; tire.rotation.z = 0.3;
    tire.castShadow = true;
    underG.add(tire);
    H.outline(tire, 0.02);

    // 锚链与小锚
    const chainPts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      chainPts.push(new THREE.Vector3(5.4 + t * 2.4, L.seabedY + 0.08 + Math.sin(t * Math.PI) * 0.12, -6.2 + t * 1.9 + Math.sin(t * 5) * 0.15));
    }
    const chain = H.tubeAlong(chainPts, 0.045, toon(P.ironRust), 32);
    underG.add(chain);
    for (let i = 0; i < 9; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 5, 8), toon(0x6e5a48));
      link.position.copy(chainPts[i + 1]);
      link.rotation.set(Math.PI / 2, 0, i * 0.7);
      underG.add(link);
    }
    const anchorG = grp(5.35, L.seabedY + 0.1, -6.3, underG, 0.6);
    box(0.07, 0.55, 0.07, toon(P.iron), 0, 0.25, 0, anchorG);
    const fluke1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), toon(P.iron));
    fluke1.position.set(0.16, 0.05, 0); fluke1.rotation.z = -1.1; anchorG.add(fluke1);
    const fluke2 = fluke1.clone(); fluke2.position.x = -0.16; fluke2.rotation.z = 1.1; anchorG.add(fluke2);
    box(0.34, 0.05, 0.05, toon(P.iron), 0, 0.5, 0, anchorG);

    // 沉底破鱼箱与玻璃瓶
    const sunkCrate = box(0.5, 0.3, 0.35, toon(0xb9c4bd), 7.8, L.seabedY + 0.14, -1.8, underG);
    sunkCrate.rotation.y = 0.7; sunkCrate.rotation.z = 0.15;
    const bottle = cyl(0.05, 0.06, 0.28, 8, toon(0x6fae8a, { transparent: true, opacity: 0.8 }), 6.9, L.seabedY + 0.08, -4.6, underG);
    bottle.rotation.z = Math.PI / 2 - 0.2;

    // 海草丛
    for (let i = 0; i < 6; i++) {
      seaweedCluster(-3.5 + rnd() * 13.5, L.seabedY + 0.02, -10 + rnd() * 13.5, 4, 0.75);
    }

    // ---------- 半透明水体剖面 ----------
    const waterVolG = grp(0, 0, 0, scene);
    H.refs.waterVolume = waterVolG;
    const sideTex = H.canvasTex(64, 256, (ctx, w, h) => {
      const gg = ctx.createLinearGradient(0, 0, 0, h);
      gg.addColorStop(0, 'rgba(159,224,210,0.50)');
      gg.addColorStop(0.35, 'rgba(116,201,189,0.42)');
      gg.addColorStop(1, 'rgba(46,110,120,0.55)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(240,252,248,0.5)';
      ctx.fillRect(0, 0, w, 5);
    });
    const sideMat = new THREE.MeshBasicMaterial({ map: sideTex, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
    const sideR = H.plane(15.5, 2.85, sideMat, 11.005, -0.975, -3.25, waterVolG);
    sideR.rotation.y = Math.PI / 2; sideR.renderOrder = 8;
    const sideB = H.plane(15.5, 2.85, sideMat.clone(), 3.25, -0.975, -11.005, waterVolG);
    sideB.rotation.y = Math.PI; sideB.renderOrder = 8;
    // 水体整体淡青 tint
    const volTint = box(15.48, 2.14, 15.48, new THREE.MeshBasicMaterial({ color: H.srgbColor(P.waterSide), transparent: true, opacity: 0.08, depthWrite: false }), 3.25, -0.62, -3.25, waterVolG);
    volTint.renderOrder = 7;
    volTint.castShadow = false; volTint.receiveShadow = false;

    // ---------- 消波块 ----------
    function tetrapod(scale) {
      const t = grp(0, 0, 0, null);
      const tm = toon(0xd8ddd6);
      const legGeo = new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, 0.72 * scale, 8);
      const dirs = [
        [0, 1, 0, 0, 0],
        [0.94, -0.33, 0, 0, 1.91],
        [-0.47, -0.33, 0.81, 1.05, -1.91],
        [-0.47, -0.33, -0.81, -1.05, -1.91]
      ];
      // 四腿朝四面体方向
      const quat = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const legs = [
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0.943, -0.333, 0),
        new THREE.Vector3(-0.471, -0.333, 0.816),
        new THREE.Vector3(-0.471, -0.333, -0.816)
      ];
      legs.forEach(function (d) {
        const leg = new THREE.Mesh(legGeo, tm);
        quat.setFromUnitVectors(up, d.clone().normalize());
        leg.quaternion.copy(quat);
        leg.position.copy(d.clone().normalize().multiplyScalar(0.3 * scale));
        leg.castShadow = true; leg.receiveShadow = true;
        t.add(leg);
      });
      const core = sph(0.2 * scale, tm, 0, 0, 0, t, 8, 6);
      core.castShadow = true;
      return t;
    }
    const tetraPositions = [
      [10.1, -1.05, -10.0, 1.25, 0.4], [9.2, -1.15, -10.3, 1.05, 1.2], [10.3, -1.2, -9.0, 0.95, 2.1],
      [10.2, -0.95, 3.4, 1.15, 0.8], [9.4, -1.15, 3.9, 0.95, 1.9],
      [-2.2, -0.9, -9.4, 1.1, 0.3], [-3.4, -1.05, -9.0, 1.0, 1.4], [-4.6, -1.1, -8.6, 0.95, 2.4],
      [1.2, -1.0, -9.6, 1.0, 0.9], [0.2, -1.15, -9.9, 0.9, 2.0],
      [7.2, -1.25, 1.7, 0.85, 0.5]
    ];
    H.anim.tetrapods = [];
    tetraPositions.forEach(function (tp) {
      const t = tetrapod(tp[3]);
      t.position.set(tp[0], tp[1], tp[2]);
      t.rotation.y = tp[4];
      g.add(t);
    });

    // ---------- 短防波堤 + 灯塔 ----------
    const bwG = grp(0, 0, 0, g);
    const bwDir = new THREE.Vector2(-0.6 - -6.8, -8.6 - -7.0);
    const bwLen = bwDir.length() + 1.2;
    const bwAng = Math.atan2(bwDir.x, bwDir.y);
    const bwMid = new THREE.Vector2((-6.8 + -0.6) / 2, (-7.0 + -8.6) / 2);
    const bwBody = box(1.15, 2.6, bwLen, wallMat.clone(), bwMid.x, -0.55, bwMid.y, bwG);
    bwBody.rotation.y = bwAng;
    bwBody.material.map = H.seawallTexture();
    bwBody.castShadow = true; bwBody.receiveShadow = true;
    const bwDeck = box(1.3, 0.18, bwLen + 0.2, concWetMat, bwMid.x, 0.78, bwMid.y, bwG);
    bwDeck.rotation.y = bwAng; bwDeck.receiveShadow = true;
    // 堤端灯塔
    const lh = grp(L.lighthouse.x, 0.86, L.lighthouse.z, g);
    H.refs.lighthouse = lh;
    const lhBase = cyl(0.42, 0.48, 0.26, 14, toon(0xcfd6d2), 0, 0.13, 0, lh);
    outline(lhBase, 0.02);
    const towerTex = H.canvasTex(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#f6f8f5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e0574a';
      ctx.fillRect(0, h * 0.28, w, h * 0.2);
      ctx.fillRect(0, h * 0.66, w, h * 0.2);
      const r3 = H.mulberry32(4);
      H.speckle(ctx, w, h, 60, ['#d8ddd6', '#c4cdc9'], 1, 4, 0.3, r3);
    });
    const tower = cyl(0.24, 0.32, 1.75, 14, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: towerTex }), 0, 1.13, 0, lh);
    outline(tower, 0.022);
    const gallery = cyl(0.36, 0.36, 0.07, 14, toon(0x5d7078), 0, 2.04, 0, lh);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      cyl(0.015, 0.015, 0.2, 5, toon(0x5d7078), Math.cos(a) * 0.33, 2.17, Math.sin(a) * 0.33, lh);
    }
    const railRing = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.014, 5, 18), toon(0x5d7078));
    railRing.position.y = 2.27; railRing.rotation.x = Math.PI / 2; lh.add(railRing);
    const lampRoom = cyl(0.2, 0.2, 0.3, 10, toon(P.glass, { transparent: true, opacity: 0.4 }), 0, 2.24, 0, lh);
    const lampCore = sph(0.11, new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff2cc) }), 0, 2.24, 0, lh);
    H.refs.lighthouseLamp = lampCore;
    const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: H.canvasTex(64, 64, (ctx) => {
        const gg = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        gg.addColorStop(0, 'rgba(255,236,170,0.95)');
        gg.addColorStop(0.5, 'rgba(255,220,140,0.35)');
        gg.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, 64, 64);
      }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    lampGlow.scale.set(1.4, 1.4, 1);
    lampGlow.position.y = 2.24;
    lampGlow.visible = false;
    lh.add(lampGlow);
    H.refs.lighthouseGlow = lampGlow;
    const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 12), toon(P.lighthouseRed));
    lhRoof.position.y = 2.5; lhRoof.castShadow = true; lh.add(lhRoof);
    outline(lhRoof, 0.018);
    cyl(0.02, 0.02, 0.18, 5, toon(0x5d7078), 0, 2.68, 0, lh);

    // ---------- 远处长防波堤（淡雾） ----------
    const farBW = box(8.6, 1.9, 0.75, toon(0xa9c4c2), 6.6, -0.35, -10.35, g);
    farBW.rotation.y = -0.05;
    const farDeck = box(8.8, 0.14, 0.9, toon(0xc2d4d2), 6.6, 0.62, -10.35, g);
    farDeck.rotation.y = -0.05;
    for (let i = 0; i < 5; i++) {
      const ft = tetrapod(0.55);
      ft.position.set(3.2 + i * 1.7, -0.55, -9.85);
      ft.rotation.y = i * 1.3;
      g.add(ft);
    }
    // 远处堤上小灯塔剪影
    cyl(0.09, 0.12, 0.6, 8, toon(0xb9cfcd), 10.6, 0.95, -10.3, g);

    // ---------- 山坡 ----------
    const hillG = grp(0, 0, 0, g);
    const hillW = 6, hillD = 5, segW = 16, segD = 14;
    const hillGeo = new THREE.PlaneGeometry(hillW, hillD, segW, segD);
    hillGeo.rotateX(-Math.PI / 2);
    function hillHeight(x, z) {
      const u = (x + 11) / hillW, v = (z + 11) / hillD;
      const d = Math.sqrt(Math.pow(u * 1.08, 2) + Math.pow(v * 1.12, 2));
      let h = 2.7 * (1 - H.smoothstep(0.12, 1.02, d));
      h += 0.14 * Math.sin(x * 1.7) * Math.cos(z * 1.9) * (1 - d * 0.6);
      return Math.max(0, h);
    }
    H.refs.hillHeight = hillHeight;
    const pos = hillGeo.attributes.position;
    const colors = [];
    const cA = H.srgbColor(P.leaf), cB = H.srgbColor(P.leafDark), cC = H.srgbColor(P.leafLight);
    const rr = H.mulberry32(77);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - 8, z = pos.getZ(i) - 8.5;
      const h = hillHeight(x, z);
      pos.setY(i, h + L.quayY - 0.02);
      const n = rr();
      const c = n < 0.33 ? cA : (n < 0.66 ? cB : cC);
      colors.push(c.r, c.g, c.b);
    }
    hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    hillGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hillGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, vertexColors: true }));
    hill.position.set(-8, 0, -8.5);
    hill.receiveShadow = true; hill.castShadow = true;
    hillG.add(hill);
    // 坡脚岩缘
    for (let i = 0; i < 7; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + rr() * 0.2, 0), toon(0xa8b4ac));
      rock.position.set(-10.7 + i * 0.9, L.quayY + 0.05, -6.2 + (rr() - 0.5) * 0.3);
      rock.scale.y = 0.6;
      rock.rotation.y = rr() * 3;
      rock.castShadow = true;
      hillG.add(rock);
    }

    // 树
    H.anim.trees = [];
    function tree(x, z, s) {
      const y = hillHeight(x, z) + L.quayY - 0.05;
      const t = grp(x, y, z, hillG);
      cyl(0.06 * s, 0.09 * s, 0.5 * s, 7, toon(P.woodDark), 0, 0.25 * s, 0, t);
      const canopy = grp(0, 0.55 * s, 0, t);
      const lm = [toon(P.leaf), toon(P.leafDark), toon(P.leafLight)];
      const b1 = sph(0.34 * s, lm[0], 0, 0.18 * s, 0, canopy, 10, 8);
      const b2 = sph(0.26 * s, lm[1], 0.22 * s, 0.05 * s, 0.1 * s, canopy, 9, 7);
      const b3 = sph(0.24 * s, lm[2], -0.2 * s, 0.1 * s, -0.12 * s, canopy, 9, 7);
      outline(b1, 0.02 * s);
      H.anim.trees.push({ node: canopy, phase: rr() * 6.28, x: x, z: z });
      return t;
    }
    tree(-10.2, -10.1, 1.3); tree(-9.0, -10.4, 1.0); tree(-10.5, -8.9, 1.1);
    tree(-7.6, -10.2, 0.95); tree(-6.4, -9.6, 0.85); tree(-9.9, -7.4, 0.9);
    tree(-6.0, -8.3, 0.8); tree(-8.6, -6.9, 0.75); tree(-10.6, -6.8, 0.7);

    // 瓦顶民家
    function house(x, z, s, ry, roofCol) {
      const y = hillHeight(x, z) + L.quayY - 0.06;
      const h = grp(x, y, z, hillG, ry);
      const wallM = toon(0xf0ece0);
      const body = box(0.9 * s, 0.62 * s, 0.72 * s, wallM, 0, 0.31 * s, 0, h);
      outline(body, 0.018 * s);
      // 屋顶（双坡）
      const roofM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.roofTexture(roofCol) });
      const r1 = box(1.06 * s, 0.07 * s, 0.52 * s, roofM, 0, 0.72 * s, -0.21 * s, h);
      r1.rotation.x = 0.55;
      const r2 = box(1.06 * s, 0.07 * s, 0.52 * s, roofM, 0, 0.72 * s, 0.21 * s, h);
      r2.rotation.x = -0.55;
      box(1.08 * s, 0.06 * s, 0.08 * s, toon(0x46565c), 0, 0.84 * s, 0, h);
      // 门窗
      box(0.16 * s, 0.3 * s, 0.02, toon(0x6e5a48), -0.22 * s, 0.17 * s, 0.37 * s, h);
      const win = box(0.24 * s, 0.18 * s, 0.02, toon(0x9fc4c4), 0.2 * s, 0.4 * s, 0.37 * s, h);
      box(0.26 * s, 0.02, 0.03, toon(0x8a6242), 0.2 * s, 0.5 * s, 0.375 * s, h);
      return h;
    }
    house(-8.3, -8.1, 1.0, 0.35, '#5d7078');
    house(-9.9, -9.3, 0.85, -0.25, '#77675e');
    house(-6.7, -9.9, 0.8, 0.7, '#5d7078');
    // 石板小径
    for (let i = 0; i < 6; i++) {
      const st = cyl(0.14, 0.16, 0.04, 7, toon(0xb9c2ba), -7.4 - i * 0.35, hillHeight(-7.4 - i * 0.35, -7.2 - i * 0.28) + L.quayY - 0.02, -7.2 - i * 0.28, hillG);
      st.rotation.y = i;
    }

    return g;
  }

  H.buildTerrain = buildTerrain;
})(window.HARBOR);