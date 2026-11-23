/* ============================================================
   buildings.js — 渔协仓库 / 候船室 / 山坡民家 / 树木
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const MAT = {};
  S.initBuildingMats = function () {
    if (MAT.ready) return;
    MAT.ready = true;

    // 波纹铁板
    MAT.metalWall = S.toon(0xffffff, {
      map: S.tex(S.texCorrugated(256, 256, [198, 208, 206]), { repeat: [3, 2] }),
      spec: 0.22, shin: 40, rim: 0.08
    });
    MAT.metalWall2 = S.toon(0xffffff, {
      map: S.tex(S.texCorrugated(256, 256, [176, 194, 200]), { repeat: [3, 2] }),
      spec: 0.22, shin: 40, rim: 0.08
    });
    MAT.concrete = S.toon(0xffffff, {
      map: S.tex(S.texConcrete(512, 512, { base: [206, 210, 204], seed: 91, stains: 30 }), { repeat: [2, 2] }),
      spec: 0.18, shin: 30
    });
    MAT.plaster = S.toon(0xe9e7de, { spec: 0.16, shin: 30, rim: 0.08 });
    MAT.plaster2 = S.toon(0xdfddd0, { spec: 0.16, shin: 30 });
    MAT.roofTile = S.toon(0xffffff, {
      map: S.tex(S.texTile(256, 256, [74, 96, 116]), { repeat: [4, 3] }), spec: 0.3, shin: 45
    });
    MAT.roofTile2 = S.toon(0xffffff, {
      map: S.tex(S.texTile(256, 256, [86, 104, 116]), { repeat: [3, 2] }), spec: 0.3, shin: 45
    });
    MAT.wood = S.toon(0xffffff, {
      map: S.tex(S.texWood(256, 256, { base: [172, 128, 88] }), { repeat: [1, 1] }), spec: 0.12
    });
    MAT.woodDark = S.toon(0x7a5638, { spec: 0.1 });
    MAT.metal = S.toon(0xa8b2b4, { spec: 0.55, shin: 55, rim: 0.1 });
    MAT.darkMetal = S.toon(0x46525a, { spec: 0.45, shin: 40 });
    MAT.rust = S.toon(0xffffff, {
      map: S.tex(S.texRust(256, 256, { base: [150, 156, 158], rust: [158, 92, 52], lo: 0.44, hi: 0.66 })),
      spec: 0.3, shin: 30
    });
    MAT.glass = new THREE.MeshPhysicalMaterial({
      color: 0xdcefF2, transparent: true, opacity: 0.14, roughness: 0.04,
      metalness: 0, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.04
    });
    MAT.white = S.toon(0xe8ebe6, { spec: 0.35, shin: 45 });
    MAT.cream = S.toon(0xe3decf, { spec: 0.25, shin: 35 });
    MAT.blue = S.toon(0x3d7f9e, { spec: 0.3, shin: 40 });
    MAT.dark = S.toon(0x2f3a40, { spec: 0.3, shin: 30 });
    MAT.green = S.toon(0x4f8a5e, { spec: 0.2 });
    MAT.fridge = S.toon(0xe2e8e4, { spec: 0.45, shin: 60, rim: 0.12 });
    MAT.ice = S.toon(0xd8f0f4, { spec: 0.6, shin: 80, rim: 0.2 });
    MAT.cardboard = S.toon(0xc9a878, { spec: 0.08 });
    MAT.black = S.toon(0x2a3238, { spec: 0.2 });
  };

  S.texCorrugated = function (w, h, base) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const s = Math.sin(x / w * Math.PI * 16);
      let v = 1 + s * 0.075;
      v *= 0.97 + S.fbm(x / w * 8, y / h * 8, 3) * 0.06;
      o[0] = base[0] * v; o[1] = base[1] * v; o[2] = base[2] * v;
    });
    // 锈迹
    const rnd = S.mulberry32(5);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * w, y = rnd() * h;
      const g = ctx.createLinearGradient(0, y, 0, y + h * 0.2);
      g.addColorStop(0, `rgba(150,88,50,${0.12 + rnd() * 0.16})`);
      g.addColorStop(1, 'rgba(150,88,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 2 + rnd() * 6, h * 0.2);
    }
    return c;
  };

  S.texTile = function (w, h, base) {
    base = base || [92, 108, 122];
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, 0, w, h);
    const rows = 8, cols = 8;
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = k * cw + (r % 2) * cw * 0.5, y = r * rh;
        const g = ctx.createLinearGradient(x, y, x, y + rh);
        const v = 0.85 + ((k * 7 + r * 3) % 5) * 0.05;
        g.addColorStop(0, `rgba(${base[0] * v * 1.25 | 0},${base[1] * v * 1.25 | 0},${base[2] * v * 1.25 | 0},1)`);
        g.addColorStop(1, `rgba(${base[0] * v * 0.7 | 0},${base[1] * v * 0.7 | 0},${base[2] * v * 0.7 | 0},1)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + cw * 0.5, y + rh * 0.15, cw * 0.48, Math.PI, 0);
        ctx.fill();
      }
    }
    return c;
  };

  /* ---------------- 渔协仓库 ---------------- */
  S.buildWarehouse = function (scene) {
    const g = new THREE.Group(); g.name = 'warehouse';
    const X0 = -13, X1 = -8.2, Z0 = 0.2, Z1 = 5.4, H = 4.3;
    const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;

    // 地板
    const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.12, Z1 - Z0), MAT.concrete);
    floor.position.set(cx, 0.06, cz);
    floor.receiveShadow = true;
    g.add(floor);

    // 西墙 / 北墙 / 南墙
    const wallW = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, Z1 - Z0), MAT.metalWall);
    wallW.position.set(X0 + 0.09, H / 2, cz);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.18), MAT.metalWall);
    wallN.position.set(cx, H / 2, Z0 + 0.09);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    const wallS = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.18), MAT.metalWall);
    wallS.position.set(cx, H / 2, Z1 - 0.09);
    wallS.castShadow = true; wallS.receiveShadow = true;
    g.add(wallS);

    // 东墙：开口 z 1.2..4.4，y 0..3.0；上方高窗 y 3.3..3.95
    const openZ0 = 1.2, openZ1 = 4.4;
    const sideA = openZ0 - Z0, sideB = Z1 - openZ1;
    const eA = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, sideA), MAT.metalWall);
    eA.position.set(X1 - 0.09, H / 2, Z0 + sideA / 2);
    eA.castShadow = true; eA.receiveShadow = true;
    g.add(eA);
    const eB = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, sideB), MAT.metalWall);
    eB.position.set(X1 - 0.09, H / 2, openZ1 + sideB / 2);
    eB.castShadow = true; eB.receiveShadow = true;
    g.add(eB);
    // 开口上方
    const eTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, H - 3.0, openZ1 - openZ0), MAT.metalWall);
    eTop.position.set(X1 - 0.09, 3.0 + (H - 3.0) / 2, (openZ0 + openZ1) / 2);
    eTop.castShadow = true; eTop.receiveShadow = true;
    g.add(eTop);
    // 高窗（玻璃）
    const clerest = new THREE.Mesh(new THREE.PlaneGeometry(openZ1 - openZ0, 0.62), MAT.glass);
    clerest.rotation.y = -Math.PI / 2;
    clerest.position.set(X1 - 0.02, 3.62, (openZ0 + openZ1) / 2);
    g.add(clerest);
    // 高窗框
    for (let i = 0; i <= 4; i++) {
      const z = openZ0 + (openZ1 - openZ0) * i / 4;
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.70, 0.05), MAT.darkMetal);
      mull.position.set(X1 - 0.01, 3.62, z);
      g.add(mull);
    }

    // 卷帘门（半拉起）
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, openZ1 - openZ0), MAT.metalWall2);
    shutter.position.set(X1 - 0.06, 3.0 - 1.45 / 2, (openZ0 + openZ1) / 2);
    shutter.castShadow = true;
    g.add(shutter);
    // 卷帘门下沿
    const shutterBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, openZ1 - openZ0 + 0.08), MAT.darkMetal);
    shutterBar.position.set(X1 - 0.06, 1.50, (openZ0 + openZ1) / 2);
    g.add(shutterBar);
    // 卷帘盒
    const drum = new THREE.Mesh(S.cyl(0.20, 0.20, openZ1 - openZ0 + 0.1, 10), MAT.metal);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(X1 - 0.12, 3.15, (openZ0 + openZ1) / 2);
    g.add(drum);

    // 屋顶（单坡）
    const roof = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 0.5, 0.16, Z1 - Z0 + 0.5), MAT.metalWall2);
    roof.position.set(cx, H + 0.08, cz);
    roof.rotation.z = -0.035;
    roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    // 屋顶边梁
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, Z1 - Z0 + 0.6), MAT.darkMetal);
    beam.position.set(X1 + 0.16, H - 0.02, cz);
    g.add(beam);

    // ---- 室内 ----
    const IN = new THREE.Group(); g.add(IN);
    const innerX0 = X0 + 0.18, innerX1 = X1 - 0.18, innerZ0 = Z0 + 0.18, innerZ1 = Z1 - 0.18;

    // 天花板
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(innerX1 - innerX0, innerZ1 - innerZ0),
      S.makeCausticMat(0xdfeeea, 0.55));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((innerX0 + innerX1) / 2, H - 0.12, (innerZ0 + innerZ1) / 2);
    IN.add(ceil);

    // 成垛鱼箱
    const boxGeo = S.rbox(0.62, 0.26, 0.42, 0.03);
    const rnd = S.mulberry32(77);
    for (let s = 0; s < 4; s++) {
      const bx = innerX0 + 0.45 + s * 0.72;
      const n = 3 + (rnd() * 4 | 0);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(boxGeo, i % 3 === 0 ? MAT.blue : MAT.white);
        m.position.set(bx, 0.26 + i * 0.27, innerZ1 - 0.7 - rnd() * 0.5);
        m.rotation.y = (rnd() - 0.5) * 0.12;
        m.castShadow = true; m.receiveShadow = true;
        IN.add(m);
      }
    }
    // 散落鱼箱
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(boxGeo, i % 2 ? MAT.white : MAT.blue);
      m.position.set(innerX0 + 0.6 + rnd() * 2.0, 0.14 + (i % 2) * 0.27, innerZ0 + 1.0 + rnd() * 1.6);
      m.rotation.y = rnd() * 1.2;
      m.castShadow = true; m.receiveShadow = true;
      IN.add(m);
    }

    // 冰柜
    const fridge = new THREE.Group();
    const fb = new THREE.Mesh(S.rbox(1.15, 0.72, 0.62, 0.05), MAT.fridge);
    fb.position.y = 0.38; fridge.add(fb);
    const lid = new THREE.Mesh(S.rbox(1.19, 0.10, 0.66, 0.03), MAT.white);
    lid.position.set(0, 0.78, -0.02); fridge.add(lid);
    const handle = new THREE.Mesh(S.cyl(0.02, 0.02, 0.4, 6), MAT.metal);
    handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.72, 0.33); fridge.add(handle);
    fridge.position.set(innerX0 + 1.4, 0.12, innerZ0 + 2.2);
    S.addOutlines(fridge, 0.8);
    fridge.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    IN.add(fridge);

    // 磅秤
    const scale = new THREE.Group();
    const base = new THREE.Mesh(S.rbox(0.55, 0.16, 0.45, 0.03), MAT.darkMetal);
    base.position.y = 0.10; scale.add(base);
    const plate = new THREE.Mesh(S.rbox(0.60, 0.05, 0.50, 0.02), MAT.metal);
    plate.position.y = 0.20; scale.add(plate);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), MAT.white);
    dial.rotation.z = Math.PI / 2; dial.position.set(0.28, 0.48, 0); scale.add(dial);
    const dialFace = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), MAT.cream);
    dialFace.rotation.y = Math.PI / 2; dialFace.position.set(0.307, 0.48, 0); scale.add(dialFace);
    S.addOutlines(scale, 0.7);
    scale.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scale.position.set(innerX0 + 2.5, 0.12, innerZ1 - 1.1);
    IN.add(scale);

    // 黑板（拍卖价格）
    const board = new THREE.Group();
    const frame = new THREE.Mesh(S.rbox(1.5, 1.0, 0.06, 0.02), MAT.woodDark);
    board.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.86),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texBlackboard(512, 320)) }));
    face.position.z = 0.035;
    board.add(face);
    board.position.set(innerX0 + 2.6, 1.75, innerZ0 + 0.02);
    IN.add(board);

    // 挂在墙上的雨靴
    for (let i = 0; i < 3; i++) {
      const boot = new THREE.Group();
      const shaft = new THREE.Mesh(S.cyl(0.075, 0.085, 0.34, 8), MAT.dark);
      boot.add(shaft);
      const foot = new THREE.Mesh(S.rbox(0.16, 0.10, 0.26, 0.04), MAT.dark);
      foot.position.set(0, -0.17, 0.06); boot.add(foot);
      boot.position.set(innerX0 + 0.7 + i * 0.32, 1.35, innerZ0 + 0.10);
      boot.rotation.z = 0.06 * (i - 1);
      S.addOutlines(boot, 0.6);
      IN.add(boot);
    }

    // 地面冰块
    const iceGeo = S.rbox(0.10, 0.07, 0.09, 0.02);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(iceGeo, MAT.ice);
      m.position.set(innerX0 + 0.4 + rnd() * 3.6, 0.16, innerZ0 + 0.5 + rnd() * 4.2);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.scale.setScalar(0.6 + rnd() * 0.8);
      m.castShadow = true;
      IN.add(m);
    }

    // 水渍
    const pudMat = S.M.puddle;
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.55 + rnd() * 0.5, 24), pudMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(innerX0 + 0.8 + rnd() * 3.0, 0.125, innerZ0 + 0.9 + rnd() * 3.4);
      m.scale.set(1, 0.6 + rnd() * 0.5, 1);
      m.renderOrder = 3;
      m.layers.set(1);
      IN.add(m);
    }

    // 吊灯
    for (let i = 0; i < 2; i++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.10, 0.16, 12), MAT.metal);
      lamp.position.set(cx - 0.6, H - 0.42, Z0 + 1.6 + i * 2.2);
      IN.add(lamp);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff6dd }));
      bulb.position.set(cx - 0.6, H - 0.51, Z0 + 1.6 + i * 2.2);
      IN.add(bulb);
    }

    // 室内补光
    const pl = new THREE.PointLight(0xfff0d0, 0.75, 9, 1.5);
    pl.position.set(cx + 0.6, 3.2, cz);
    IN.add(pl);

    // 门外招牌
    const signTex = S.tex(S.texLabel(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f4f1e4'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#3d6b7a'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#2f5a68';
      ctx.font = 'bold 54px "Source Han Sans JP","Yu Gothic",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('太陽雨漁業協同組合', w / 2, h / 2 + 2);
    }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshBasicMaterial({ map: signTex }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(X1 + 0.02, 3.75, (openZ0 + openZ1) / 2 - 0.1);
    g.add(sign);

    scene.add(g);
    return g;
  };

  S.texBlackboard = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#2f4038'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 2);
    }
    ctx.strokeStyle = 'rgba(230,240,225,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(240,245,235,0.9)';
    ctx.font = 'bold 26px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillText('本日 競り値', 20, 44);
    ctx.font = '22px "Source Han Sans JP","Yu Gothic",sans-serif';
    const rows = [['マグロ', '1,240'], ['ブリ', '860'], ['アジ', '420'], ['イカ', '980'], ['カレイ', '510']];
    rows.forEach((r, i) => {
      ctx.fillText(r[0], 26, 84 + i * 44);
      ctx.fillText(r[1] + ' 円', 190, 84 + i * 44);
    });
    ctx.strokeStyle = 'rgba(240,245,235,0.5)';
    ctx.beginPath(); ctx.moveTo(18, 60); ctx.lineTo(w - 20, 60); ctx.stroke();
    return c;
  };

  /* ---------------- 候船室 ---------------- */
  S.buildWaitingRoom = function (scene) {
    const g = new THREE.Group(); g.name = 'waiting';
    const X0 = -13, X1 = -8.6, Z0 = -5.2, Z1 = -0.6, H = 3.15;
    const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;

    // 地板
    const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.14, Z1 - Z0), MAT.wood);
    floor.position.set(cx, 0.07, cz);
    floor.receiveShadow = true;
    g.add(floor);

    // 墙
    const wallW = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, Z1 - Z0), MAT.plaster);
    wallW.position.set(X0 + 0.09, H / 2, cz);
    wallW.castShadow = true; wallW.receiveShadow = true; g.add(wallW);
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.18), MAT.plaster);
    wallN.position.set(cx, H / 2, Z0 + 0.09);
    wallN.castShadow = true; wallN.receiveShadow = true; g.add(wallN);
    const wallS = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.18), MAT.plaster);
    wallS.position.set(cx, H / 2, Z1 - 0.09);
    wallS.castShadow = true; wallS.receiveShadow = true; g.add(wallS);

    // 东面落地玻璃
    const gz0 = Z0 + 0.35, gz1 = Z1 - 0.35;
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, H - 2.85, gz1 - gz0), MAT.plaster);
    topBeam.position.set(X1 - 0.09, 2.85 + (H - 2.85) / 2, (gz0 + gz1) / 2);
    topBeam.castShadow = true; g.add(topBeam);
    const botBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, gz1 - gz0), MAT.plaster);
    botBeam.position.set(X1 - 0.09, 0.15, (gz0 + gz1) / 2);
    g.add(botBeam);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(gz1 - gz0, 2.55), MAT.glass);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(X1 - 0.02, 0.30 + 2.55 / 2, (gz0 + gz1) / 2);
    g.add(glass);
    // 竖框
    for (let i = 0; i <= 3; i++) {
      const z = gz0 + (gz1 - gz0) * i / 3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.07), MAT.darkMetal);
      m.position.set(X1 - 0.01, 0.30 + 1.275, z);
      g.add(m);
    }
    // 横框
    const hz = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, gz1 - gz0), MAT.darkMetal);
    hz.position.set(X1 - 0.01, 1.55, (gz0 + gz1) / 2);
    g.add(hz);

    // 屋顶（瓦）
    const roof = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 0.7, 0.18, Z1 - Z0 + 0.7), MAT.roofTile);
    roof.position.set(cx + 0.15, H + 0.09, cz);
    roof.rotation.z = 0.10;
    roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    // 檐下
    const eave = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, Z1 - Z0 + 0.8), MAT.woodDark);
    eave.position.set(X1 + 0.42, H + 0.02, cz);
    g.add(eave);

    // ---- 室内 ----
    const IN = new THREE.Group(); g.add(IN);
    const ix0 = X0 + 0.2, ix1 = X1 - 0.2, iz0 = Z0 + 0.2, iz1 = Z1 - 0.2;

    // 木长椅
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(S.rbox(0.52, 0.08, 2.1, 0.02), MAT.wood);
    seat.position.y = 0.44; bench.add(seat);
    const back = new THREE.Mesh(S.rbox(0.08, 0.46, 2.1, 0.02), MAT.wood);
    back.position.set(-0.24, 0.70, 0); back.rotation.z = 0.08; bench.add(back);
    for (const sz of [-0.85, 0.85]) {
      for (const sx of [-0.18, 0.18]) {
        const leg = new THREE.Mesh(S.box(0.07, 0.44, 0.07), MAT.woodDark);
        leg.position.set(sx, 0.22, sz);
        bench.add(leg);
      }
    }
    bench.position.set(ix0 + 0.75, 0, cz - 0.2);
    S.addOutlines(bench, 0.7);
    bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    IN.add(bench);

    // 时刻表
    const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texTimetable(256, 320)) }));
    tt.position.set(ix0 + 0.03, 1.75, iz0 + 1.5);
    tt.rotation.y = Math.PI / 2;
    IN.add(tt);
    const ttFrame = new THREE.Mesh(S.rbox(0.04, 1.22, 0.98), MAT.woodDark);
    ttFrame.position.set(ix0 + 0.015, 1.75, iz0 + 1.5);
    IN.add(ttFrame);

    // 老式收音机
    const radio = new THREE.Group();
    const body = new THREE.Mesh(S.rbox(0.42, 0.26, 0.20, 0.03), MAT.wood);
    radio.add(body);
    const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texRadioGrill(64, 64)) }));
    grill.position.set(-0.08, 0, 0.101); radio.add(grill);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), MAT.cream);
    dial.position.set(0.14, 0, 0.101); radio.add(dial);
    const knob = new THREE.Mesh(S.cyl(0.022, 0.022, 0.03, 8), MAT.dark);
    knob.rotation.x = Math.PI / 2; knob.position.set(0.14, -0.07, 0.11); radio.add(knob);
    radio.position.set(ix0 + 0.5, 0.95, iz1 - 0.55);
    radio.rotation.y = 0.3;
    S.addOutlines(radio, 0.6);
    radio.traverse(o => { if (o.isMesh) o.castShadow = true; });
    IN.add(radio);

    // 热水壶（保温桶）
    const kettle = new THREE.Group();
    const kb = new THREE.Mesh(S.cyl(0.16, 0.18, 0.36, 12), MAT.metal);
    kettle.add(kb);
    const klid = new THREE.Mesh(S.cyl(0.17, 0.17, 0.05, 12), MAT.dark);
    klid.position.y = 0.20; kettle.add(klid);
    const ktap = new THREE.Mesh(S.cyl(0.02, 0.02, 0.10, 6), MAT.metal);
    ktap.rotation.z = Math.PI / 2; ktap.position.set(0.18, -0.05, 0); kettle.add(ktap);
    kettle.position.set(ix1 - 0.45, 0.30, iz1 - 0.45);
    S.addOutlines(kettle, 0.6);
    IN.add(kettle);

    // 绿萝
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(S.cyl(0.14, 0.11, 0.20, 10), MAT.cream);
    pot.position.y = 0.10; plant.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), MAT.woodDark);
    soil.rotation.x = -Math.PI / 2; soil.position.y = 0.20; plant.add(soil);
    const leafMat = S.toon(0x5c9a52, { spec: 0.2, side: THREE.DoubleSide });
    const rnd = S.mulberry32(303);
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6), leafMat);
      const a = rnd() * 6.28, r = 0.10 + rnd() * 0.16;
      leaf.position.set(Math.cos(a) * r, 0.26 + rnd() * 0.22, Math.sin(a) * r);
      leaf.rotation.set(rnd() * 1.4 - 0.7, rnd() * 6.28, rnd() * 1.4 - 0.7);
      plant.add(leaf);
    }
    plant.position.set(ix0 + 0.35, 0.14, iz1 - 0.5);
    IN.add(plant);

    // 挂钟（略微歪斜）
    const clock = new THREE.Group();
    const cring = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.05, 20), MAT.woodDark);
    cring.rotation.x = Math.PI / 2; clock.add(cring);
    const cface = new THREE.Mesh(new THREE.CircleGeometry(0.175, 20),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texClock(128, 128)) }));
    cface.position.z = 0.028; clock.add(cface);
    clock.position.set(ix0 + 0.06, 2.15, iz0 + 0.7);
    clock.rotation.set(0, Math.PI / 2, 0.12);
    IN.add(clock);

    // 室内灯
    const pl = new THREE.PointLight(0xfff2da, 0.55, 6, 1.6);
    pl.position.set(cx, 2.7, cz);
    IN.add(pl);
    const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff8e2 }));
    lampMesh.position.set(cx, 2.95, cz);
    IN.add(lampMesh);

    scene.add(g);
    return g;
  };

  S.texTimetable = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f6f2e2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a9aa0'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#3c5a66';
    ctx.font = 'bold 17px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillText('定期船 時刻表', 12, 26);
    ctx.font = '11px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillStyle = '#5a7078';
    const rows = [['6:40', '9:15', '13:30', '17:05'], ['7:25', '10:40', '15:10', '18:20']];
    ctx.fillText('上り', 12, 52);
    rows[0].forEach((t, i) => ctx.fillText(t, 52, 52 + i * 0));
    let y = 52;
    for (const r of rows) {
      ctx.fillText(r[0], 60, y);
      ctx.fillText(r[1], 100, y);
      ctx.fillText(r[2], 140, y);
      ctx.fillText(r[3], 180, y);
      y += 24;
    }
    ctx.strokeStyle = 'rgba(120,140,145,0.6)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(10, 60 + i * 22); ctx.lineTo(w - 10, 60 + i * 22); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(180,60,50,0.85)';
    ctx.font = 'bold 11px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillText('※ 欠航の場合あり', 12, h - 14);
    return c;
  };

  S.texClock = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#fbf8ee'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4a5a60'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.44, 0, 6.28); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 6.28;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * w * 0.34, h / 2 + Math.sin(a) * w * 0.34);
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * w * 0.42);
      ctx.stroke();
    }
    // 指针 10:10
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(-1.05) * w * 0.22, h / 2 + Math.sin(-1.05) * w * 0.22); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(0.52) * w * 0.34, h / 2 + Math.sin(0.52) * w * 0.34); ctx.stroke();
    return c;
  };

  S.texRadioGrill = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#c9a878'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(90,70,50,0.6)';
    for (let y = 4; y < h; y += 6) ctx.fillRect(4, y, w - 8, 2);
    return c;
  };

  /* ---------------- 山坡民家与树木 ---------------- */
  S.buildHillHouses = function (scene) {
    const g = new THREE.Group(); g.name = 'hillHouses';
    const rnd = S.mulberry32(202);
    const H = S.hillHeight;

    function house(x, z, s, rot, roofMat) {
      const h = new THREE.Group();
      const w = 1.45 * s, d = 1.15 * s, hh = 0.95 * s;
      const body = new THREE.Mesh(S.rbox(w, hh, d, 0.03), MAT.plaster);
      body.position.y = hh / 2;
      body.castShadow = true; body.receiveShadow = true;
      h.add(body);
      // 屋顶（双坡）
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, d + 0.34), roofMat);
      roof.position.set(-w * 0.24, hh + 0.24, 0);
      roof.rotation.z = 0.52;
      roof.castShadow = true;
      h.add(roof);
      const roof2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, d + 0.34), roofMat);
      roof2.position.set(w * 0.24, hh + 0.24, 0);
      roof2.rotation.z = -0.52;
      roof2.castShadow = true;
      h.add(roof2);
      const ridge = new THREE.Mesh(S.cyl(0.05, 0.05, d + 0.36, 6), MAT.roofTile2);
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = hh + 0.42;
      h.add(ridge);
      // 窗
      for (let i = 0; i < 2; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.30 * s, 0.30 * s), MAT.dark);
        win.position.set(-w * 0.24 + i * 0.52 * s, hh * 0.58, d / 2 + 0.012);
        h.add(win);
      }
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.32 * s, 0.62 * s), MAT.woodDark);
      door.position.set(w * 0.30, hh * 0.33, d / 2 + 0.012);
      h.add(door);
      h.position.set(x, H(x, z) + 0.02, z);
      h.rotation.y = rot;
      S.addOutlines(h, 0.7);
      return h;
    }

    g.add(house(9.35, -8.35, 1.15, 0.25, MAT.roofTile));
    g.add(house(11.55, -9.15, 1.0, -0.15, MAT.roofTile2));
    g.add(house(9.55, -10.5, 0.95, 0.55, MAT.roofTile));
    g.add(house(11.85, -11.55, 0.85, 0.1, MAT.roofTile2));

    // 树
    const trunkMat = S.toon(0x7a5f45, { spec: 0.1 });
    const leafMats = [
      S.toon(0x6fa85e, { spec: 0.08 }),
      S.toon(0x87bb6a, { spec: 0.08 }),
      S.toon(0x4f8a52, { spec: 0.08 }),
      S.toon(0x9cc47a, { spec: 0.08 })
    ];
    const spots = [
      [8.55, -8.0, 1.35], [12.5, -8.0, 1.5], [10.4, -8.0, 1.0], [12.6, -9.9, 1.15],
      [8.5, -9.6, 1.0], [10.6, -12.7, 1.3], [12.6, -12.5, 1.45], [8.7, -12.1, 0.95],
      [11.1, -8.9, 0.85], [12.2, -11.0, 0.95], [8.8, -10.9, 0.8]
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, s] = spots[i];
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(S.cyl(0.07 * s, 0.10 * s, 0.9 * s, 6), trunkMat);
      trunk.position.y = 0.45 * s;
      trunk.castShadow = true;
      t.add(trunk);
      for (let k = 0; k < 3; k++) {
        const r = (0.52 - k * 0.10) * s;
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[(i + k) % 4]);
        leaf.position.set((rnd() - 0.5) * 0.22 * s, (0.95 + k * 0.30) * s, (rnd() - 0.5) * 0.22 * s);
        leaf.castShadow = true;
        t.add(leaf);
      }
      t.position.set(x, H(x, z) + 0.02, z);
      t.userData.sway = 0.018 + rnd() * 0.018;
      t.userData.phase = rnd() * 6.28;
      g.add(t);
      if (!S.trees) S.trees = [];
      S.trees.push(t);
    }

    scene.add(g);
    return g;
  };

  S.buildBuildings = function (scene) {
    S.initBuildingMats();
    const g = new THREE.Group(); g.name = 'buildings';
    S.buildWarehouse(g);
    S.buildWaitingRoom(g);
    S.buildHillHouses(g);
    scene.add(g);
    return g;
  };

  S.updateBuildings = function (t) {
    if (S.trees) {
      const w = S.wind;
      for (const tr of S.trees) {
        const s = tr.userData.sway * (0.25 + w);
        tr.rotation.z = Math.sin(t * 1.6 + tr.userData.phase) * s;
        tr.rotation.x = Math.cos(t * 1.3 + tr.userData.phase) * s * 0.6;
      }
    }
    if (S.causticMats) {
      for (const m of S.causticMats) m.uniforms.uTime.value = t;
    }
  };

})(window);
