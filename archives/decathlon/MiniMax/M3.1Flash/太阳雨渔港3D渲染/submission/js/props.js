/* =====================================================================
   props.js — 码头街角道具（灯柱 / 鱼箱 / 渔网 / 绞盘 / 贩卖机 / 告示牌 …）
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;
  const L = TY.LAYOUT;
  const M = TY.M;

  const props = {
    group: null,
    puddles: [],
    flags: [],
    windsock: null,
    netCloth: [],
    umbrella: null,
    lampPosts: [],
  };

  props.build = function (scene) {
    const grp = new THREE.Group();
    grp.name = 'props';
    scene.add(grp);
    props.group = grp;

    props.buildLampPosts(grp);
    props.buildBollards(grp);
    props.buildCrates(grp);
    props.buildNetRack(grp);
    props.buildWinch(grp);
    props.buildDavit(grp);
    props.buildBuoys(grp);
    props.buildTools(grp);
    props.buildVending(grp);
    props.buildSlipway(grp);
    props.buildNotices(grp);
    props.buildWindSock(grp);
    props.buildInstrumentCases(grp);
    props.buildUmbrella(grp);
    props.buildSteps(grp);
    props.buildPuddleMarks(grp);
    props.buildMisc(grp);
    props.buildCornerProps(grp);
    props.buildDebris(grp);

    TY.registerReflect(grp);
    return grp;
  };

  /* ---------------- 灯柱 ---------------- */
  props.buildLampPosts = function (grp) {
    const spots = [
      [-2.35, 5.15, 0.35], [5.35, 4.95, 0.1], [8.85, 7.55, 1.4],
      [-4.55, -0.6, -Math.PI / 2], [-4.55, -5.9, -Math.PI / 2], [-4.55, 2.4, -Math.PI / 2],
    ];
    const bld = new U.Builder();
    spots.forEach((s) => {
      const x = s[0], z = s[1], ry = s[2];
      const bx = x + Math.sin(ry) * 0.0, bz = z;
      bld.put(G.cyl(0.16, 0.21, 0.3, 10), M.concreteSide, bx, L.top + 0.15, bz);
      bld.put(G.cyl(0.075, 0.095, 3.35, 10), M.teal, bx, L.top + 1.78, bz);
      // 顶部悬臂
      bld.add(G.cyl(0.05, 0.05, 0.62, 8), M.teal, T.m(bx, L.top + 3.45, bz, 0, ry, Math.PI / 2), 1.5);
      // 圆环形灯罩
      bld.add(G.tor(0.26, 0.055, 6, 18), M.teal, T.m(bx + Math.cos(ry) * 0.3, L.top + 3.28, bz - Math.sin(ry) * 0.3, Math.PI / 2, 0, 0), 1.5);
    });
    bld.build(grp, { outline: true, outlineWidth: 1.0 });

    // 灯罩内的发光体
    const glowTex = TY.tex.tex(TY.tex.glowCanvas(), 1, 1);
    spots.forEach((s) => {
      const ry = s[2];
      const lx = s[0] + Math.cos(ry) * 0.3, lz = s[1] - Math.sin(ry) * 0.3;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), TY.toon({
        color: 0xfff6dc, steps: 2, emissive: 0xffdc9a, emissiveIntensity: 0.85,
      }));
      bulb.position.set(lx, L.top + 3.22, lz);
      grp.add(bulb);
      props.lampPosts.push({ x: lx, y: L.top + 3.22, z: lz, bulb: bulb });
      // 柔和光晕
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.42,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.scale.set(1.5, 1.5, 1);
      halo.position.set(lx, L.top + 3.22, lz);
      grp.add(halo);
    });
  };

  /* ---------------- 系船柱 ---------------- */
  props.buildBollards = function (grp) {
    const bld = new U.Builder();
    const spots = [];
    for (let z = -9.4; z <= 3.6; z += 2.35) spots.push([L.west.x1 - 0.62, z, 0]);
    for (let x = -2.2; x <= 9.2; x += 2.6) {
      if (x > L.steps.x0 - 0.6 && x < L.slip.x1 + 0.4) continue;
      spots.push([x, L.south.z0 + 0.62, 0]);
    }
    spots.forEach((s) => {
      bld.put(G.cyl(0.2, 0.24, 0.1, 12), M.ironMatte, s[0], L.top + 0.05, s[1]);
      bld.put(G.cyl(0.115, 0.16, 0.42, 12), M.iron, s[0], L.top + 0.31, s[1]);
      bld.put(G.cyl(0.185, 0.15, 0.08, 12), M.iron, s[0], L.top + 0.55, s[1]);
      bld.put(G.tor(0.14, 0.028, 5, 12), M.iron, s[0], L.top + 0.44, s[1], 0, 1.0);
    });
    bld.build(grp, { outline: true, outlineWidth: 1.0 });
  };

  /* ---------------- 鱼箱 / 周转筐 ---------------- */
  props.buildCrates = function (grp) {
    const rnd = U.mulberry32(7);
    const mkCrate = (bld, mat, x, y, z, ry, w, h, d) => {
      bld.put(G.box(w, h * 0.86, d), mat, x, y + h * 0.43, z, ry, 1.0);
      bld.put(G.box(w * 1.05, h * 0.16, d * 1.06), mat, x, y + h * 0.93, z, ry, 1.0);
      bld.put(G.box(w * 0.9, h * 0.1, d * 0.9), mat, x, y + h * 0.02, z, ry, 1.0);
    };
    const bld = new U.Builder();
    // 白色鱼箱堆（街角）
    const piles = [
      [-2.55, 7.95, 0.2, 4], [-1.9, 8.2, -0.1, 3], [-2.3, 8.65, 0.5, 2],
      [8.35, 8.35, 0.35, 3], [8.9, 8.2, 0.9, 2], [7.85, 8.55, 0.1, 2],
    ];
    piles.forEach((p) => {
      for (let i = 0; i < p[3]; i++) {
        const yy = L.top + i * 0.31;
        mkCrate(bld, M.crateWhite, p[0] + (rnd() - 0.5) * 0.09, yy, p[1] + (rnd() - 0.5) * 0.09,
          p[2] + (rnd() - 0.5) * 0.2, 0.62, 0.3, 0.44);
      }
    });
    // 蓝色周转筐
    const bpiles = [[-1.35, 7.75, 0.5, 3], [8.9, 6.35, 1.2, 2], [7.35, 7.3, 0.1, 4]];
    bpiles.forEach((p) => {
      for (let i = 0; i < p[3]; i++) {
        const yy = L.top + i * 0.29;
        mkCrate(bld, M.crateBlue, p[0] + (rnd() - 0.5) * 0.07, yy, p[1] + (rnd() - 0.5) * 0.07,
          p[2] + (rnd() - 0.5) * 0.25, 0.58, 0.28, 0.4);
      }
    });
    bld.build(grp, { outline: true, outlineWidth: 0.95 });

    // 筐上的提手
    const bld2 = new U.Builder();
    bpiles.forEach((p) => {
      for (let i = 0; i < p[3]; i++) {
        const yy = L.top + i * 0.29 + 0.19;
        bld2.put(G.tor(0.11, 0.022, 5, 10, Math.PI), M.crateBlue, p[0], yy, p[1] + 0.2, p[2], 1.2);
      }
    });
    bld2.build(grp, { outline: true, outlineWidth: 0.8 });
  };

  /* ---------------- 晒网铁架 ---------------- */
  props.buildNetRack = function (grp) {
    const bld = new U.Builder();
    const rx = 8.35, rz = 9.3, ry = -0.35;
    // 架体
    for (let i = 0; i < 4; i++) {
      const u = -1.55 + i * 1.03;
      const px = rx + Math.cos(ry) * u, pz = rz + Math.sin(ry) * u;
      bld.put(G.cyl(0.035, 0.035, 2.15, 6), M.rustSolid, px, L.top + 1.07, pz);
    }
    for (let i = 0; i < 4; i++) {
      const u = -1.55 + i * 1.03;
      const px = rx + Math.cos(ry) * u, pz = rz + Math.sin(ry) * u;
      bld.put(G.cyl(0.03, 0.03, 0.85, 6), M.rustSolid, px + 0.0, L.top + 2.05, pz, 0, 1.0);
    }
    bld.build(grp, { outline: true, outlineWidth: 0.85 });

    // 网上面：两块交错的网
    const netMat = M.net;
    for (let k = 0; k < 2; k++) {
      const geo = new THREE.PlaneGeometry(3.1, 1.35, 12, 6);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const sag = Math.cos((x / 3.1) * Math.PI) * 0.16;
        pos.setZ(i, -Math.abs(y) * 0.08 + sag);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, netMat);
      mesh.position.set(rx, L.top + 1.62, rz);
      mesh.rotation.set(-Math.PI / 2 + 0.16, 0, ry + k * Math.PI / 2);
      mesh.castShadow = false;
      grp.add(mesh);
      props.netCloth.push({ m: mesh, phase: k * 1.4, base: mesh.rotation.z });
    }

    // 浮球绳串
    const ropePts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const px = rx - 1.9 + t * 3.8;
      const pz = rz + 0.35;
      const py = L.top + 0.45 + Math.sin(t * Math.PI) * 0.42 - t * 0.35;
      ropePts.push(new THREE.Vector3(px, py, pz));
    }
    const curve = new THREE.CatmullRomCurve3(ropePts);
    const ropeGeo = new THREE.TubeGeometry(curve, 40, 0.022, 5, false);
    const rope = new THREE.Mesh(ropeGeo, M.rope);
    grp.add(rope);
    props.ropeCurve = curve;
    // 浮球
    const bld3 = new U.Builder();
    for (let i = 1; i < 18; i++) {
      const t = i / 19;
      const p = curve.getPoint(t);
      const c = i % 3 === 0 ? M.orange : (i % 3 === 1 ? M.whitePlastic : M.yellow);
      bld3.put(G.sph(0.075, 8, 6), c, p.x, p.y - 0.055, p.z);
    }
    bld3.build(grp, { outline: true, outlineWidth: 0.75 });
  };

  /* ---------------- 手摇绞盘 ---------------- */
  props.buildWinch = function (grp) {
    const grp2 = new THREE.Group();
    const x = 5.05, z = 8.85, ry = 0.4;
    const bld = new U.Builder();
    bld.put(G.box(0.72, 0.16, 0.52), M.rustSolid, x, L.top + 0.08, z, ry, 1.2);
    bld.put(G.box(0.1, 0.52, 0.1), M.rustSolid, x - 0.28, L.top + 0.4, z - 0.2, ry, 1.2);
    bld.put(G.box(0.1, 0.52, 0.1), M.rustSolid, x + 0.28, L.top + 0.4, z + 0.2, ry, 1.2);
    bld.build(grp2, { outline: true, outlineWidth: 0.85 });

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 12), M.rustSolid);
    drum.position.set(x, L.top + 0.5, z);
    drum.rotation.set(0, ry, Math.PI / 2);
    grp2.add(drum); TY.outline.attach(drum, 0.9);
    // 棘轮
    const ratchet = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 10), M.rustSolid);
    ratchet.position.set(x + Math.cos(ry) * 0.28, L.top + 0.5, z - Math.sin(ry) * 0.28);
    ratchet.rotation.set(0, ry, Math.PI / 2);
    grp2.add(ratchet); TY.outline.attach(ratchet, 0.9);
    // 摇柄
    const crank = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), M.steel);
    arm.position.y = 0.15;
    crank.add(arm);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), M.woodDark);
    grip.position.set(0, 0.3, 0.09);
    grip.rotation.x = Math.PI / 2;
    crank.add(grip);
    crank.position.set(x + Math.cos(ry) * 0.32, L.top + 0.5, z - Math.sin(ry) * 0.32);
    crank.rotation.z = Math.PI / 2;
    grp2.add(crank);
    TY.outline.attach(arm, 0.8);
    // 缆绳
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.9, 6), M.rope);
    rope.position.set(x - 0.1, L.top + 0.28, z + 0.15);
    rope.rotation.set(0.5, ry, 0.2);
    grp2.add(rope);
    props.winchCrank = crank;
    grp.add(grp2);
  };

  /* ---------------- 小型吊杆 ---------------- */
  props.buildDavit = function (grp) {
    const bld = new U.Builder();
    const x = 4.45, z = 9.15;
    bld.put(G.cyl(0.2, 0.26, 0.22, 10), M.rustSolid, x, L.top + 0.11, z);
    bld.put(G.cyl(0.075, 0.09, 2.5, 10), M.rustSolid, x, L.top + 1.45, z);
    bld.add(G.cyl(0.06, 0.06, 1.45, 8), M.rustSolid, T.m(x + 0.62, L.top + 2.6, z, 0, 0, Math.PI / 2 - 0.22), 1.2);
    bld.add(G.cyl(0.05, 0.05, 0.8, 8), M.rustSolid, T.m(x + 0.18, L.top + 1.85, z, 0, 0, 0.9), 1.2);
    bld.build(grp, { outline: true, outlineWidth: 0.95 });
    // 吊索与钩
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 5), M.ironMatte);
    rope.position.set(x + 1.28, L.top + 2.28, z);
    grp.add(rope);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 5, 12, Math.PI * 1.4), M.steel);
    hook.position.set(x + 1.28, L.top + 1.5, z);
    hook.rotation.y = Math.PI / 2;
    grp.add(hook); TY.outline.attach(hook, 0.8);
  };

  /* ---------------- 系船浮标 ---------------- */
  props.buildBuoys = function (grp) {
    const spots = [[0.9, 1.4, 0.6], [2.6, -0.8, 1.2], [-1.1, -2.2, 0.2], [4.2, 2.2, 0.9], [-0.4, 3.0, 1.7]];
    spots.forEach((s, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), i % 2 ? M.orange : M.whitePlastic);
      body.scale.set(1, 1.22, 1);
      g.add(body); TY.outline.attach(body, 1.0);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.09, 14), M.teal);
      g.add(collar); TY.outline.attach(collar, 0.9);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), M.ironMatte);
      top.position.y = 0.36;
      g.add(top);
      // 褪色编号
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), props.numberMat(String(i + 1)));
      label.position.set(0, 0.02, 0.265);
      g.add(label);
      g.position.set(s[0], 0.06, s[1]);
      grp.add(g);
      TY.registerReflect(g);
      props.buoyGroup = props.buoyGroup || [];
      props.buoyGroup.push({ g: g, phase: i * 1.7, x: s[0], z: s[1] });
    });
  };

  /* 生成编号贴图 */
  props.numberMat = function (txt) {
    const c = TY.tex.cv(64, 42);
    const g = TY.tex.ctx2d(c);
    g.fillStyle = '#e8e4d6'; g.fillRect(0, 0, 64, 42);
    g.strokeStyle = '#9a9276'; g.lineWidth = 2; g.strokeRect(2, 2, 60, 38);
    g.fillStyle = '#4a4a42';
    g.font = 'bold 28px ' + TY.tex.FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, 32, 22);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) {
      g.globalAlpha = Math.random() * 0.4;
      g.beginPath(); g.arc(Math.random() * 64, Math.random() * 42, Math.random() * 5, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return TY.toon({ color: 0xffffff, map: t, steps: 2 });
  };

  /* ---------------- 网兜 / 水桶 ---------------- */
  props.buildTools = function (grp) {
    const bld = new U.Builder();
    // 长柄网兜（斜靠）
    const px = 5.55, pz = 9.35, ang = 0.42;
    bld.add(G.cyl(0.028, 0.032, 2.5, 6), M.woodDark,
      T.m(px + Math.cos(ang) * 0.55, L.top + 0.95, pz, 0.28, ang, 0.28), 1.2);
    bld.build(grp, { outline: true, outlineWidth: 0.8 });
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 5, 16), M.steel);
    hoop.position.set(px + Math.cos(ang) * 0.85, L.top + 0.3, pz + 0.42);
    hoop.rotation.set(Math.PI / 2 - 0.5, ang, 0.3);
    grp.add(hoop); TY.outline.attach(hoop, 0.85);
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.62, 12, 1, true), M.net);
    bag.position.set(px + Math.cos(ang) * 0.85, L.top + 0.02, pz + 0.42);
    bag.rotation.set(Math.PI + 0.45, ang, 0.3);
    grp.add(bag);
    // 水桶
    const bk = [[9.25, 5.6, 0.2], [9.45, 5.95, 1.1], [4.75, 8.0, 0.7]];
    const bld2 = new U.Builder();
    bk.forEach((b, i) => {
      const col = i === 1 ? M.bluePlastic : M.teal;
      bld2.put(G.cyl(0.19, 0.155, 0.34, 14, 1, true), col, b[0], L.top + 0.17, b[1], b[2], 1.2);
      bld2.put(G.tor(0.185, 0.014, 5, 14, Math.PI), M.ironMatte, b[0], L.top + 0.3, b[1], b[2], 1.2);
    });
    bld2.build(grp, { outline: true, outlineWidth: 0.85 });
  };

  /* ---------------- 自动贩卖机 ---------------- */
  props.buildVending = function (grp) {
    const x = 9.1, z = 6.6, ry = -Math.PI / 2 + 0.18;
    const bld = new U.Builder();
    bld.put(G.box(1.05, 1.9, 0.72), M.ironMatte, x, L.top + 0.95, z, ry, 1.0);
    bld.build(grp, { outline: true, outlineWidth: 1.0 });
    // 发光正面
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.66), TY.toon({
      color: 0xffffff, map: TY.tex.tex(TY.tex.vendingCanvas(), 1, 1), steps: 2,
      emissive: 0xffd8a0, emissiveIntensity: 0.55,
    }));
    face.position.set(x + Math.cos(ry) * 0.37, L.top + 1.02, z - Math.sin(ry) * 0.37);
    face.rotation.y = ry + Math.PI / 2;
    grp.add(face);
    // 灯箱辉光
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({
      color: 0xffe0a8, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide,
    }));
    glow.position.set(x + Math.cos(ry) * 0.45, L.top + 1.1, z - Math.sin(ry) * 0.45);
    glow.rotation.y = ry + Math.PI / 2;
    glow.renderOrder = 3;
    grp.add(glow);
    // 锈蚀遮雨檐
    const awn = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.05, 0.86), M.rustSolid);
    awn.position.set(x + Math.cos(ry) * 0.26, L.top + 2.02, z - Math.sin(ry) * 0.26);
    awn.rotation.set(0.14, ry, 0);
    grp.add(awn); TY.outline.attach(awn, 0.9);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.16, 0.05), M.rustSolid);
    lip.position.set(x + Math.cos(ry) * 0.66, L.top + 1.9, z - Math.sin(ry) * 0.66);
    lip.rotation.y = ry;
    grp.add(lip); TY.outline.attach(lip, 0.9);
    props.vendingGlow = glow;
  };

  /* ---------------- 斜坡滑道 + 倒扣舢板 ---------------- */
  props.buildSlipway = function (grp) {
    const sx = L.slip.x0, ex = L.slip.x1;
    const cz = L.south.z0;
    // 斜坡
    const rampLen = 4.6;
    const ang = Math.atan2(L.top - 0.15, rampLen);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(ex - sx, 0.18, rampLen), M.concreteSide);
    ramp.position.set((sx + ex) / 2, (L.top + 0.15) / 2, cz - rampLen / 2 + 0.05);
    ramp.rotation.x = -ang;
    ramp.castShadow = true; ramp.receiveShadow = true;
    grp.add(ramp);
    U.triplanarUV(ramp.geometry, 0.3);
    TY.outline.attach(ramp, 1.0);
    // 侧墙
    const bld = new U.Builder();
    bld.put(G.box(0.16, 0.55, rampLen), M.concreteSide, sx + 0.05, L.top - 0.1, cz - rampLen / 2, 0, 0.4);
    bld.put(G.box(0.16, 0.55, rampLen), M.concreteSide, ex - 0.05, L.top - 0.1, cz - rampLen / 2, 0, 0.4);
    bld.build(grp, { outline: true, outlineWidth: 0.95 });
    // 滑道上的木轨
    const bld2 = new U.Builder();
    bld2.add(G.box(0.1, 0.08, rampLen * 0.98), M.woodDark,
      T.m(sx + 0.35, L.top - 0.02, cz - rampLen / 2 + 0.05, -ang, 0, 0), 1.0);
    bld2.add(G.box(0.1, 0.08, rampLen * 0.98), M.woodDark,
      T.m(ex - 0.35, L.top - 0.02, cz - rampLen / 2 + 0.05, -ang, 0, 0), 1.0);
    bld2.build(grp, { outline: true, outlineWidth: 0.8 });

    // 滑道顶端的缆绳盘与木滚杠
    const bld0 = new U.Builder();
    bld0.put(G.cyl(0.30, 0.34, 0.10, 16), M.rope, 4.95, L.top + 0.05, 4.70);
    bld0.put(G.cyl(0.30, 0.34, 0.10, 16), M.rope, 4.95, L.top + 0.15, 4.70);
    bld0.put(G.cyl(0.085, 0.085, 1.10, 10), M.woodDark, 4.40, L.top + 0.09, 4.95, Math.PI / 2, 0, 0);
    bld0.build(grp, { outline: true, outlineWidth: 0.8 });

    /* ---- 倒扣的小木舢板：半拖上岸，搁在木枕上（港猫的避雨处） ---- */
    const bx = 6.62, bz = 5.98, bry = 0.19;
    const hull = TY.makeHull(2.55, 0.95, 0.44, { transom: 0.55, sheer: 0.1 });
    const pivot = new THREE.Group();
    pivot.position.set(bx, 0, bz);
    pivot.rotation.y = bry;
    grp.add(pivot);
    const skiff = new THREE.Mesh(hull, M.wood);
    skiff.position.set(0, 2.19, 0);
    skiff.rotation.set(Math.PI - 0.14, 0, 0);   // 倒扣 + 向北侧翘起，露出船腹下的空隙
    skiff.castShadow = true; skiff.receiveShadow = true;
    pivot.add(skiff);
    TY.outline.attach(skiff, 1.0);

    // 局部（绕 Y 偏转 bry）→ 世界
    const l2w = (lx, lz) => [
      bx + lx * Math.cos(bry) + lz * Math.sin(bry),
      bz - lx * Math.sin(bry) + lz * Math.cos(bry),
    ];

    const bld3 = new U.Builder();
    // 倒扣后露出的龙骨脊
    bld3.add(G.box(2.16, 0.08, 0.12), M.woodDark, T.m(bx, 2.17, bz, 0, bry, 0), 1.0);
    // 两组木枕：把船身垫高，留出猫能钻进去的洞
    [-0.74, 0.74].forEach((lx) => {
      const p = l2w(lx, 0);
      bld3.add(G.box(0.26, 0.87, 0.46), M.woodDark, T.m(p[0], L.top + 0.435, p[1], 0, bry, 0), 1.0);
      const q = l2w(lx, 0);
      bld3.add(G.box(0.36, 0.09, 0.66), M.wood, T.m(q[0], L.top + 0.045, q[1], 0, bry, 0), 1.0);
    });
    // 支在船边的一支木桨
    const oar = l2w(-1.05, -0.30);
    bld3.add(G.cyl(0.032, 0.038, 1.55, 7), M.wood,
      T.m(oar[0], L.top + 0.72, oar[1], 0.30, bry + 0.22, 0.16), 1.0);
    bld3.add(G.box(0.13, 0.02, 0.34), M.woodDark,
      T.m(oar[0] - 0.30, L.top + 0.12, oar[1] - 0.16, 0.30, bry + 0.22, 0.16), 1.0);
    bld3.build(grp, { outline: true, outlineWidth: 0.85 });

    // 系在船头的旧缆绳
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 14), M.rope);
    const rp = l2w(1.15, -0.18);
    rope.position.set(rp[0], L.top + 0.05, rp[1]);
    rope.rotation.set(Math.PI / 2, 0, 0.4);
    grp.add(rope); TY.outline.attach(rope, 0.85);

    props.skiff = skiff;
    props.skiffPos = new THREE.Vector3(bx, 2.19, bz);
    props.skiffShelter = new THREE.Vector3(6.56, L.top + 0.12, 5.66);
  };

  /* ---------------- 告示牌 ---------------- */
  props.buildNotices = function (grp) {
    const x = -2.15, z = 6.45, ry = 0.28;
    const bld = new U.Builder();
    bld.put(G.cyl(0.055, 0.065, 2.0, 8), M.woodDark, x - 0.5, L.top + 1.0, z, 0, 1.2);
    bld.put(G.cyl(0.055, 0.065, 2.0, 8), M.woodDark, x + 0.5, L.top + 1.0, z, 0, 1.2);
    bld.build(grp, { outline: true, outlineWidth: 0.9 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.86, 0.06), M.woodDark);
    board.position.set(x, L.top + 1.5, z);
    board.rotation.y = ry;
    grp.add(board); TY.outline.attach(board, 1.0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.76), M.sign);
    face.position.set(x + Math.sin(ry) * 0.035, L.top + 1.5, z + Math.cos(ry) * 0.035);
    face.rotation.y = ry;
    grp.add(face);
    // 小告示牌
    const bld2 = new U.Builder();
    bld2.put(G.cyl(0.04, 0.05, 1.5, 6), M.ironMatte, x + 0.95, L.top + 0.75, z - 0.35, 0, 1.2);
    bld2.build(grp, { outline: true, outlineWidth: 0.8 });
    const wboard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.05), M.ironMatte);
    wboard.position.set(x + 0.95, L.top + 1.42, z - 0.35);
    wboard.rotation.y = ry + 0.2;
    grp.add(wboard); TY.outline.attach(wboard, 0.9);
    const wface = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.42), M.warnSign);
    wface.position.set(x + 0.95 + Math.sin(ry + 0.2) * 0.03, L.top + 1.42, z - 0.35 + Math.cos(ry + 0.2) * 0.03);
    wface.rotation.y = ry + 0.2;
    grp.add(wface);
  };

  /* ---------------- 风向袋 + 小旗 ---------------- */
  props.buildWindSock = function (grp) {
    const x = 9.4, z = 8.05;
    const bld = new U.Builder();
    bld.put(G.cyl(0.11, 0.16, 0.3, 8), M.concreteSide, x, L.top + 0.15, z);
    bld.put(G.cyl(0.045, 0.055, 3.4, 8), M.steel, x, L.top + 1.9, z);
    bld.build(grp, { outline: true, outlineWidth: 0.9 });

    // 风向袋
    const sock = new THREE.Group();
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const r0 = 0.16 - i * 0.028, r1 = 0.16 - (i + 1) * 0.028;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.22, 12, 1, true),
        i % 2 ? M.whitePlastic : M.orange);
      seg.rotation.z = Math.PI / 2;
      seg.position.x = -0.12 - i * 0.22;
      seg.material.side = THREE.DoubleSide;
      sock.add(seg);
      TY.outline.attach(seg, 0.8);
    }
    sock.position.set(x, L.top + 3.42, z);
    sock.rotation.y = -0.4;
    grp.add(sock);
    props.windsock = sock;

    // 小旗串（斜拉，两端立杆）
    const flagPts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      flagPts.push(new THREE.Vector3(4.9 + t * 4.3, L.top + 2.85 - Math.sin(t * Math.PI) * 0.42, 8.95 - t * 0.35));
    }
    const fc = new THREE.CatmullRomCurve3(flagPts);
    const line = new THREE.Mesh(new THREE.TubeGeometry(fc, 30, 0.012, 4, false), M.ironMatte);
    grp.add(line);
    const bld2 = new U.Builder();
    bld2.put(G.cyl(0.045, 0.055, 3.0, 8), M.steel, 4.85, L.top + 1.5, 8.95);
    bld2.put(G.cyl(0.045, 0.055, 3.0, 8), M.steel, 9.25, L.top + 1.5, 8.58);
    bld2.build(grp, { outline: true, outlineWidth: 0.85 });
    const colors = [M.whitePlastic, M.orange, M.teal, M.yellow];
    for (let i = 1; i < 11; i++) {
      const t = i / 12;
      const p = fc.getPoint(t);
      const g = new THREE.PlaneGeometry(0.22, 0.3);
      const m = new THREE.Mesh(g, colors[i % 4]);
      m.position.set(p.x, p.y - 0.16, p.z);
      m.rotation.y = 0.3;
      m.material.side = THREE.DoubleSide;
      m.castShadow = false;
      grp.add(m);
      props.flags.push({ m: m, phase: i * 0.8, base: m.rotation.z, baseY: m.rotation.y });
      TY.outline.attach(m, 0.7);
    }
    bld2.build(grp, { outline: true, outlineWidth: 0.7 });
    props.flagLine = fc;
  };

  /* ---------------- 乐器硬箱 ---------------- */
  props.buildInstrumentCases = function (grp) {
    const spots = [[0.35, 5.15, 0.4, 0.82], [1.12, 5.32, -0.18, 0.68]];
    const bld = new U.Builder();
    spots.forEach((s) => {
      const w = s[3], h = 0.34, d = 0.42;
      bld.add(G.roundBox(w, h, d, 0.055, 2), M.steel, T.m(s[0], L.top + h / 2, s[1], 0, s[2], 0), 1.2);
      // 铝合金包角
      const cs = 0.1;
      for (let i = 0; i < 4; i++) {
        const sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
        bld.add(G.box(cs, h * 0.34, cs), M.steel,
          T.m(s[0] + Math.cos(s[2]) * (w / 2 - cs / 2) * sx - Math.sin(s[2]) * (d / 2 - cs / 2) * sz,
            L.top + h / 2 + (h * 0.33) * (i < 2 ? 1 : -1) * 0.0,
            s[1] + Math.sin(s[2]) * (w / 2 - cs / 2) * sx + Math.cos(s[2]) * (d / 2 - cs / 2) * sz, 0, s[2], 0), 1.6);
      }
      // 搭扣
      bld.add(G.box(0.07, 0.05, 0.05), M.ironMatte,
        T.m(s[0] + Math.cos(s[2]) * w * 0.3, L.top + h * 0.5, s[1] + Math.sin(s[2]) * w * 0.3, 0, s[2], 0), 1.6);
    });
    bld.build(grp, { outline: true, outlineWidth: 1.0 });
  };

  /* ---------------- 透明雨伞 ---------------- */
  props.buildUmbrella = function (grp) {
    const x = 2.35, z = 4.95;
    const um = new THREE.Group();
    // 伞面（半透明）
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshPhysicalMaterial({
        color: 0xd8f0f4, transparent: true, opacity: 0.30, roughness: 0.08, metalness: 0,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    canopy.renderOrder = 6;
    um.add(canopy);
    // 伞骨
    const bld = new U.Builder();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bld.add(G.cyl(0.007, 0.007, 0.47, 4), M.steel,
        T.m(Math.cos(a) * 0.23, 0.14, Math.sin(a) * 0.23, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5), 2);
    }
    // 伞轴
    bld.add(G.cyl(0.012, 0.012, 0.72, 6), M.steel, T.m(0, 0.02, 0, 0, 0, 0), 2);
    // 伞尖
    bld.add(G.cyl(0.004, 0.022, 0.16, 6), M.steel, T.m(0, 0.56, 0, 0, 0, 0), 2);
    // 手柄
    bld.add(G.tor(0.06, 0.017, 5, 10, Math.PI * 1.25), M.woodDark, T.m(0, -0.4, 0.05, Math.PI / 2, 0, 0), 2);
    bld.build(um, { outline: false });
    // 伞沿的雨珠
    const dropMat = TY.toon({
      color: 0xe8fbff, steps: 2, transparent: true, opacity: 0.85,
      spec: { color: 0xffffff, strength: 0.9, power: 90, thresh: 0.3 },
      rim: { color: 0xffffff, strength: 0.5, power: 2 },
    });
    const drops = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), dropMat);
      d.position.set(Math.cos(a) * 0.43, 0.075, Math.sin(a) * 0.43);
      drops.add(d);
    }
    um.add(drops);
    um.position.set(x, L.top + 0.52, z);
    um.rotation.set(0.42, 0.7, 0.30);
    grp.add(um);
    props.umbrella = um;
    props.umbrellaDrops = drops;
  };

  /* ---------------- 台阶 + 上下船平台 ---------------- */
  props.buildSteps = function (grp) {
    const x0 = L.steps.x0, x1 = L.steps.x1, cz = L.south.z0;
    const bld = new U.Builder();
    const n = 4;
    for (let i = 0; i < n; i++) {
      const w = x1 - x0 + 0.25;
      const y = L.top - (i + 0.5) * (L.top / n);
      const z = cz - (i + 0.5) * 0.34;
      bld.put(G.box(w, L.top / n + 0.02, 0.36), M.concreteSide, (x0 + x1) / 2, y, z, 0, 0.5);
    }
    bld.build(grp, { outline: true, outlineWidth: 1.0 });
    // 上下船平台
    const plat = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.55, 0.16, 1.5), M.concreteSide);
    plat.position.set((x0 + x1) / 2, 0.08, cz - n * 0.34 - 0.75);
    plat.castShadow = true; plat.receiveShadow = true;
    U.triplanarUV(plat.geometry, 0.35);
    grp.add(plat); TY.outline.attach(plat, 1.0);
    // 平台上的系缆桩
    const bld2 = new U.Builder();
    bld2.put(G.cyl(0.12, 0.15, 0.42, 10), M.iron, x0 + 0.05, 0.36, cz - n * 0.34 - 1.3);
    bld2.put(G.cyl(0.12, 0.15, 0.42, 10), M.iron, x1 - 0.05, 0.36, cz - n * 0.34 - 1.3);
    bld2.build(grp, { outline: true, outlineWidth: 0.9 });
  };

  /* ---------------- 水洼位置标记 ---------------- */
  props.buildPuddleMarks = function (grp) {
    const marks = [
      [0.95, 5.55, 1.25, 1.15], [1.85, 5.15, 1.25, 0.78], [-1.6, 6.2, 1.25, 0.95],
      [4.2, 7.2, 1.25, 1.0], [6.9, 6.6, 1.25, 0.85], [-4.9, -2.3, 1.25, 1.2],
      [-4.6, 1.1, 1.25, 0.9], [-4.8, -7.2, 1.25, 1.05], [2.2, 8.6, 1.25, 0.8],
      [-7.2, 5.4, 1.25, 0.9],
    ];
    marks.forEach((m, i) => {
      props.puddles.push({ x: m[0], y: m[2], z: m[1], r: m[3], seed: i * 1.37 });
    });
  };

  /* ---------------- 其他小物件 ---------------- */
  props.buildMisc = function (grp) {
    const bld = new U.Builder();
    // 地面上的缆绳盘
    bld.add(G.tor(0.26, 0.035, 6, 18), M.rope, T.m(5.55, L.top + 0.04, 7.25, Math.PI / 2, 0.3, 0), 1.2);
    bld.add(G.tor(0.2, 0.035, 6, 16), M.rope, T.m(5.60, L.top + 0.07, 7.25, Math.PI / 2, 0.3, 0), 1.2);
    // 扫帚
    bld.add(G.cyl(0.016, 0.016, 1.35, 5), M.woodDark, T.m(8.4, L.top + 0.68, 6.0, 0.2, 0, 0.22), 1.2);
    bld.add(G.box(0.26, 0.09, 0.08), M.woodDark, T.m(8.53, L.top + 0.06, 6.13, 0, 0, 0.22), 1.4);
    bld.build(grp, { outline: true, outlineWidth: 0.85 });

    // 系在码头上的捕鱼桶
    const bld2 = new U.Builder();
    bld2.put(G.cyl(0.3, 0.26, 0.55, 14), M.teal, 8.75, L.top + 0.28, 5.45, 0, 1.2);
    bld2.put(G.cyl(0.31, 0.31, 0.05, 14), M.ironMatte, 8.75, L.top + 0.56, 5.45, 0, 1.2);
    bld2.build(grp, { outline: true, outlineWidth: 0.9 });
  };

  /* ---------------- 码头街角（西臂南端） ---------------- */
  props.buildCornerProps = function (grp) {
    const rnd = U.mulberry32(414);
    const bld = new U.Builder();

    // 木托盘堆
    for (let i = 0; i < 4; i++) {
      bld.put(G.box(1.1, 0.055, 0.8), M.woodDark, -6.5 + (rnd() - 0.5) * 0.08,
        L.top + 0.05 + i * 0.09, 8.55 + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.12, 0.9);
    }
    // 白色鱼箱堆
    const crates = [[-8.75, 7.95, 0.25, 4], [-8.1, 7.8, -0.15, 3], [-9.35, 7.05, 0.4, 2]];
    crates.forEach((c) => {
      for (let i = 0; i < c[3]; i++) {
        bld.put(G.box(0.62, 0.28, 0.44), M.crateWhite, c[0] + (rnd() - 0.5) * 0.08,
          L.top + 0.15 + i * 0.29, c[1] + (rnd() - 0.5) * 0.08, c[2] + (rnd() - 0.5) * 0.18, 1.0);
      }
    });
    // 蓝色周转筐
    for (let i = 0; i < 3; i++) {
      bld.put(G.box(0.58, 0.28, 0.4), M.crateBlue, -7.55 + i * 0.04,
        L.top + 0.15 + i * 0.29, 8.95 - i * 0.05, 0.3 + i * 0.1, 1.0);
    }
    // 长凳
    bld.put(G.box(0.42, 0.07, 1.5), M.wood, -9.55, L.top + 0.46, 5.95, 0.06, 1.1);
    bld.put(G.box(0.08, 0.44, 0.08), M.ironMatte, -9.35, L.top + 0.24, 5.35, 0, 1.3);
    bld.put(G.box(0.08, 0.44, 0.08), M.ironMatte, -9.35, L.top + 0.24, 6.55, 0, 1.3);
    bld.put(G.box(0.06, 0.4, 1.5), M.wood, -9.78, L.top + 0.72, 5.95, 0.06, 1.1);
    // 渔具笼（蟹笼）
    for (let i = 0; i < 3; i++) {
      const px = -5.35 + i * 0.36, pz = 6.35 + (i % 2) * 0.28;
      bld.put(G.box(0.42, 0.3, 0.36), M.woodDark, px, L.top + 0.16, pz, i * 0.5, 1.2);
      bld.put(G.box(0.46, 0.04, 0.4), M.woodDark, px, L.top + 0.32, pz, i * 0.5, 1.2);
    }
    bld.build(grp, { outline: true, outlineWidth: 0.92 });

    // 街角小灯柱
    const lp = new U.Builder();
    lp.put(G.cyl(0.15, 0.2, 0.28, 10), M.concreteSide, -7.45, L.top + 0.14, 9.35);
    lp.put(G.cyl(0.07, 0.09, 3.1, 10), M.teal, -7.45, L.top + 1.68, 9.35);
    lp.add(G.tor(0.24, 0.05, 6, 18), M.teal, T.m(-7.45, L.top + 3.08, 9.35, Math.PI / 2, 0, 0), 1.5);
    lp.build(grp, { outline: true, outlineWidth: 1.0 });
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), TY.toon({
      color: 0xfff6dc, steps: 2, emissive: 0xffdc9a, emissiveIntensity: 0.85,
    }));
    lb.position.set(-7.45, L.top + 3.02, 9.35);
    grp.add(lb);
    props.lampPosts.push({ x: -7.45, y: L.top + 3.02, z: 9.35, bulb: lb });

    // 水洼
    props.puddles.push({ x: -7.6, y: L.top, z: 6.9, r: 1.05, seed: Math.random() * 10 });
    props.puddles.push({ x: -5.6, y: L.top, z: 8.1, r: 0.78, seed: Math.random() * 10 });
    props.puddles.push({ x: -9.0, y: L.top, z: 4.2, r: 0.9, seed: Math.random() * 10 });
  };

  /* ---------------- 散落细节 ---------------- */
  props.buildDebris = function (grp) {
    const rnd = U.mulberry32(909);
    const bld = new U.Builder();
    const onQuay = (x, z) => {
      const w = (x > L.west.x0 && x < L.west.x1 && z > L.west.z0 && z < L.west.z1) ||
        (x > L.south.x0 && x < L.south.x1 && z > L.south.z0 && z < L.south.z1);
      if (!w) return false;
      // 避开建筑与滑道
      if (x > L.warehouse.x0 - 0.4 && x < L.warehouse.x1 + 0.4 && z > L.warehouse.z0 - 0.4 && z < L.warehouse.z1 + 0.4) return false;
      if (x > L.waiting.x0 - 0.4 && x < L.waiting.x1 + 0.4 && z > L.waiting.z0 - 0.4 && z < L.waiting.z1 + 0.4) return false;
      if (x > L.slip.x0 - 0.4 && x < L.slip.x1 + 0.4 && z < L.south.z0) return false;
      if (x > L.steps.x0 - 0.4 && x < L.steps.x1 + 0.4 && z < L.south.z0 + 0.3) return false;
      return true;
    };
    let placed = 0, guard = 0;
    while (placed < 34 && guard < 600) {
      guard++;
      const x = -9.5 + rnd() * 19;
      const z = -9.5 + rnd() * 19;
      if (!onQuay(x, z)) continue;
      const kind = Math.floor(rnd() * 5);
      const ry = rnd() * 3.14;
      if (kind === 0) {
        bld.add(G.tor(0.2, 0.032, 6, 14), M.rope, T.m(x, L.top + 0.035, z, Math.PI / 2, ry, 0), 1.2);
      } else if (kind === 1) {
        bld.put(G.cyl(0.17, 0.145, 0.3, 12, 1, true), rnd() < 0.5 ? M.teal : M.bluePlastic, x, L.top + 0.15, z, ry, 1.2);
      } else if (kind === 2) {
        bld.put(G.box(0.36, 0.12, 0.26), M.woodDark, x, L.top + 0.06, z, ry, 1.2);
      } else if (kind === 3) {
        bld.put(G.tor(0.15, 0.06, 7, 14), M.ironMatte, x, L.top + 0.06, z, ry, 1.2);
      } else {
        bld.add(G.cyl(0.022, 0.026, 1.25, 5), M.woodDark, T.m(x, L.top + 0.3, z, Math.PI / 2, ry, 0.3), 1.2);
      }
      placed++;
    }
    bld.build(grp, { outline: true, outlineWidth: 0.85 });
  };

  /* ---------------- 更新 ---------------- */
  const gustAt = (x) => (TY.life ? TY.life.gustAt(x) : 0);

  props.update = function (t, dt, gust) {
    /* 风向袋 */
    if (props.windsock) {
      const g = gustAt(props.windsock.position.x);
      const target = -0.4 + Math.sin(t * 0.8) * 0.28 + g * 0.9;
      props.windsock.rotation.y += (target - props.windsock.rotation.y) * Math.min(1, dt * 2.2);
      props.windsock.rotation.z = -0.12 + Math.sin(t * 1.3) * 0.1 - g * 0.35;
    }
    /* 小旗 */
    for (const f of props.flags) {
      const g = gustAt(f.m.position.x);
      const w = Math.sin(t * 3.1 + f.phase) * 0.22 + Math.sin(t * 5.7 + f.phase * 1.3) * 0.09 + g * 0.55;
      f.m.rotation.z = f.base + w;
      f.m.rotation.y = f.baseY + Math.sin(t * 2.1 + f.phase) * 0.15;
    }
    /* 渔网 */
    for (const n of props.netCloth) {
      const g = gustAt(n.m.position.x);
      const w = Math.sin(t * 1.4 + n.phase) * 0.05 + g * 0.14;
      n.m.rotation.z = n.base + w;
      n.m.position.y = L.top + 1.62 - Math.abs(w) * 0.2;
    }
    /* 绞盘摇柄 */
    if (props.winchCrank) props.winchCrank.rotation.y += dt * 0.25;
    /* 浮标随浪 */
    if (props.buoyGroup) {
      for (const b of props.buoyGroup) {
        const h = TY.water.waveH(b.x, b.z, t);
        const wb = TY.life ? TY.life.wakeBob(b.x, b.z, t) : 0;
        b.g.position.y = 0.06 + h + wb;
        b.g.rotation.z = Math.sin(t * 1.6 + b.phase) * 0.12;
        b.g.rotation.x = Math.cos(t * 1.4 + b.phase) * 0.12;
      }
    }
    /* 雨伞微颤 */
    if (props.umbrella) {
      props.umbrella.rotation.z = 0.30 + Math.sin(t * 0.9) * 0.015;
    }
  };

  TY.props = props;
})();
