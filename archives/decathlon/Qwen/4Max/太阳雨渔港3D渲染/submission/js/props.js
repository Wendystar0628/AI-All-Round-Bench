/* 码头道具：系船柱、灯柱、鱼箱、晒网、绞盘、浮标、贩卖机、告示牌、风向袋、乐器箱、雨伞 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp, outline = H.outline;

  function netTexture() {
    return H.canvasTex(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(159,184,168,0.95)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(w, i * 16); ctx.stroke();
      }
    }, [3, 2]);
  }

  function buildProps(scene) {
    const g = grp(0, 0, 0, scene);
    H.refs.props = g;
    H.anim.buoys = [];
    H.anim.dripPoints = [];
    H.anim.gullPerches = [];

    // ---------- 系船柱（黑色铸铁，哑光） ----------
    const bollardM = toon(0x3a4245);
    function bollard(x, z) {
      const b = grp(x, L.quayY, z, g);
      cyl(0.1, 0.12, 0.06, 10, bollardM, 0, 0.03, 0, b);
      const shaft = cyl(0.062, 0.075, 0.3, 10, bollardM, 0, 0.2, 0, b);
      const cap = sph(0.085, bollardM, 0, 0.37, 0, b, 10, 8);
      cap.scale.y = 0.75;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 6, 12), bollardM);
      collar.position.y = 0.3; collar.rotation.x = Math.PI / 2; b.add(collar);
      outline(shaft, 0.012); outline(cap, 0.012);
      H.anim.gullPerches.push(new THREE.Vector3(x, L.quayY + 0.44, z));
      return b;
    }
    const frontBollards = [-3.6, -1.8, 3.4, 5.2, 7.0, 8.8];
    frontBollards.forEach(function (x) { bollard(x, 4.88); });
    [2.6, 0.6, -1.5, -3.6].forEach(function (z) { bollard(-4.88, z); });
    H.refs.bollardGullPos = new THREE.Vector3(-1.8, L.quayY + 0.44, 4.88);

    // 缆绳绕桩数圈 + 垂入水中（浸水段深色）
    const usedBollards = [[-1.8, 4.88], [3.4, 4.88], [5.2, 4.88], [-4.88, 2.6], [-4.88, 0.6], [-4.88, -1.5], [-4.88, -3.6]];
    usedBollards.forEach(function (bp, i) {
      const x = bp[0], z = bp[1];
      for (let k = 0; k < 3; k++) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 6, 14), toon(P.rope));
        wrap.position.set(x, L.quayY + 0.16 + k * 0.055, z);
        wrap.rotation.x = Math.PI / 2 + (k - 1) * 0.08;
        wrap.castShadow = true;
        g.add(wrap);
      }
      // 垂下段：沿岸壁入水
      const onFront = Math.abs(z - 4.88) < 0.1;
      const dirX = onFront ? 0 : 1, dirZ = onFront ? -1 : 0;
      const tailPts = [
        new THREE.Vector3(x + dirX * 0.09, L.quayY + 0.14, z + dirZ * 0.09),
        new THREE.Vector3(x + dirX * 0.14, L.quayY - 0.3, z + dirZ * 0.14),
        new THREE.Vector3(x + dirX * 0.15, L.waterY + 0.1, z + dirZ * 0.15),
        new THREE.Vector3(x + dirX * 0.16, L.waterY - 0.35, z + dirZ * 0.16)
      ];
      const tailDry = H.tubeAlong(tailPts.slice(0, 3), 0.024, toon(P.rope), 12);
      g.add(tailDry);
      const tailWet = H.tubeAlong(tailPts.slice(2), 0.024, toon(P.ropeWet), 8);
      g.add(tailWet);
    });

    // ---------- 灯柱（圆环灯罩）与电线 ----------
    const lampM = toon(0x5d7078);
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff6dd) });
    function lampPost(x, z) {
      const lp = grp(x, L.quayY, z, g);
      cyl(0.14, 0.17, 0.1, 10, lampM, 0, 0.05, 0, lp);
      const pole = cyl(0.045, 0.065, 2.5, 8, lampM, 0, 1.3, 0, lp);
      outline(pole, 0.01);
      // 圆环灯罩
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), lampM);
      ring.position.y = 2.62; ring.rotation.x = Math.PI / 2;
      ring.castShadow = true;
      lp.add(ring);
      const bulb = sph(0.09, lampGlowMat, 0, 2.6, 0, lp, 10, 8);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.1, 12), lampM);
      cap.position.y = 2.74; lp.add(cap);
      // 灯罩边缘积聚的雨珠
      const beadM = new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff6dd) });
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + x;
        const bead = sph(0.009 + (i % 3) * 0.003, beadM, Math.cos(a) * 0.17, 2.585, Math.sin(a) * 0.17, lp, 5, 4);
        bead.castShadow = false;
      }
      H.anim.dripPoints.push({ pos: new THREE.Vector3(x + 0.15, L.quayY + 2.58, z), rate: 0.35, groundY: L.quayY });
      H.anim.dripPoints.push({ pos: new THREE.Vector3(x - 0.13, L.quayY + 2.58, z + 0.1), rate: 0.3, groundY: L.quayY });
      return { group: lp, top: new THREE.Vector3(x, L.quayY + 2.72, z) };
    }
    const lamps = [
      lampPost(-4.0, 6.7),
      lampPost(3.9, 8.9),
      lampPost(7.7, 6.7),
      lampPost(-6.3, -4.7)
    ];
    H.refs.lamps = lamps;
    // 纤细电线
    const wireM = toon(0x46565c);
    function wire(p0, p1, sag) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector3(
          H.lerp(p0.x, p1.x, t),
          H.lerp(p0.y, p1.y, t) - Math.sin(t * Math.PI) * sag,
          H.lerp(p0.z, p1.z, t)
        ));
      }
      const w = H.tubeAlong(pts, 0.008, wireM, 20);
      w.castShadow = false;
      g.add(w);
    }
    wire(lamps[0].top, lamps[1].top, 0.35);
    wire(lamps[1].top, lamps[2].top, 0.35);
    wire(lamps[0].top, lamps[3].top, 0.5);
    wire(lamps[3].top, new THREE.Vector3(-9.2, 3.6, -8.0), 0.6);
    wire(lamps[2].top, new THREE.Vector3(11.5, 3.2, 9.5), 0.4);

    // ---------- 鱼箱与周转筐 ----------
    H.crateStack(g, -6.3, L.quayY, -3.9, 2, 2, 2, false);
    H.crateStack(g, -5.45, L.quayY, -4.1, 1, 2, 2, true);
    H.crateStack(g, -2.7, L.quayY, 5.9, 2, 1, 2, false);
    H.crateStack(g, -1.7, L.quayY, 5.95, 1, 2, 1, true);
    // 木托盘
    box(1.1, 0.07, 0.8, toon(0xb98d5e), -5.9, L.quayY + 0.035, -4.0, g);
    // 散落小箱
    const loose = box(0.42, 0.24, 0.3, toon(P.crateWhite), -5.0, L.quayY + 0.12, -3.2, g);
    loose.rotation.y = 0.5;

    // ---------- 晒网铁架 + 浮球绳串 ----------
    const rackG = grp(-7.4, L.quayY, 2.9, g);
    const rackM = toon(0x7a8a88);
    cyl(0.03, 0.03, 1.5, 6, rackM, -0.9, 0.75, 0, rackG);
    cyl(0.03, 0.03, 1.5, 6, rackM, 0.9, 0.75, 0, rackG);
    cyl(0.025, 0.025, 1.9, 6, rackM, 0, 1.48, 0, rackG).rotation.z = Math.PI / 2;
    cyl(0.025, 0.025, 1.9, 6, rackM, 0, 0.35, 0, rackG).rotation.z = Math.PI / 2;
    const netGeo = new THREE.PlaneGeometry(1.75, 1.1, 12, 8);
    const netMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: netTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 0.92, 0.02);
    net.castShadow = true;
    rackG.add(net);
    H.anim.nets = [{ mesh: net, base: netGeo.attributes.position.array.slice(), phase: 0.7 }];
    // 浮球绳串：架柱 → 小杆
    const floatPole = cyl(0.03, 0.04, 1.3, 6, rackM, -5.3, L.quayY + 0.65, 3.9, g);
    const ropePts = [];
    const fp0 = new THREE.Vector3(-6.5, L.quayY + 1.45, 2.9);
    const fp1 = new THREE.Vector3(-5.3, L.quayY + 1.28, 3.9);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ropePts.push(new THREE.Vector3(H.lerp(fp0.x, fp1.x, t), H.lerp(fp0.y, fp1.y, t) - Math.sin(t * Math.PI) * 0.28, H.lerp(fp0.z, fp1.z, t)));
    }
    const floatRope = H.tubeAlong(ropePts, 0.014, toon(P.rope), 24);
    g.add(floatRope);
    const floatBalls = [];
    for (let i = 1; i < 10; i++) {
      const fb = sph(0.055, toon(i % 3 === 0 ? 0xf08a3c : P.floatBall), ropePts[i].x, ropePts[i].y - 0.06, ropePts[i].z, g, 8, 6);
      floatBalls.push({ mesh: fb, base: ropePts[i].clone(), phase: i * 0.6 });
    }
    H.anim.floatBalls = floatBalls;
    H.anim.floatRopeLine = { p0: fp0, p1: fp1 };

    // ---------- 手摇绞盘 + 小吊杆 ----------
    const winchG = grp(-5.7, L.quayY, 5.7, g, 0.6);
    const rustM = toon(P.ironRust);
    box(0.5, 0.08, 0.4, toon(0x8a9a94), 0, 0.04, 0, winchG);
    box(0.06, 0.34, 0.34, rustM, -0.2, 0.24, 0, winchG);
    box(0.06, 0.34, 0.34, rustM, 0.2, 0.24, 0, winchG);
    const drum = cyl(0.11, 0.11, 0.34, 10, rustM, 0, 0.3, 0, winchG);
    drum.rotation.z = Math.PI / 2;
    // 缠绳
    for (let i = 0; i < 5; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 5, 14), toon(P.ropeWet));
      wrap.position.set(-0.12 + i * 0.06, 0.3, 0);
      wrap.rotation.y = Math.PI / 2;
      winchG.add(wrap);
    }
    // 摇柄
    const crank = grp(0.26, 0.3, 0, winchG);
    box(0.03, 0.2, 0.03, rustM, 0, 0.1, 0, crank);
    cyl(0.02, 0.02, 0.1, 6, toon(0x8a6242), 0, 0.2, 0.05, crank).rotation.x = Math.PI / 2;
    H.anim.winchCrank = crank;
    // 吊杆
    const derrick = grp(-5.15, L.quayY, 5.1, g, -0.4);
    cyl(0.05, 0.07, 0.5, 8, rustM, 0, 0.25, 0, derrick);
    const boom = cyl(0.035, 0.05, 1.5, 8, rustM, 0, 0.95, 0.35, derrick);
    boom.rotation.x = 0.75;
    const pulley = sph(0.05, toon(P.iron), 0, 1.42, 0.88, derrick, 8, 6);
    const cable = H.tubeAlong([new THREE.Vector3(0, 1.42, 0.88), new THREE.Vector3(0, 0.9, 0.9), new THREE.Vector3(0, 0.55, 0.88)], 0.008, toon(P.iron), 8);
    derrick.add(cable);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 5, 10, Math.PI * 1.4), toon(P.iron));
    hook.position.set(0, 0.52, 0.88); hook.rotation.z = 0.5; derrick.add(hook);

    // ---------- 系船浮标（褪色编号） ----------
    function buoy(x, z, num, col) {
      const b = grp(x, L.waterY, z, scene);
      const tex = H.canvasTex(128, 64, (ctx, w, h) => {
        ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#eef1ec'; ctx.fillRect(0, h * 0.55, w, h * 0.2);
        const rnd = H.mulberry32(num * 3);
        H.speckle(ctx, w, h, 70, ['#c4cdc9', '#b9c4c0'], 1, 4, 0.35, rnd);
        ctx.fillStyle = 'rgba(42,77,84,0.75)';
        ctx.font = 'bold 30px "Yu Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(num, 64, 40);
      });
      const body = sph(0.22, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: tex }), 0, 0.02, 0, b, 12, 10);
      body.scale.y = 0.8;
      outline(body, 0.015);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 5, 10), toon(P.ironRust));
      ring.position.y = 0.2; b.add(ring);
      // 锚链入水
      const ch = cyl(0.012, 0.012, 1.6, 5, toon(0x5d7a76), 0, -0.8, 0, b);
      ch.castShadow = false;
      H.anim.buoys.push({ group: b, x: x, z: z, phase: x * 1.3 + z * 0.7 });
      return b;
    }
    buoy(0.8, 1.5, '07', '#d9764f');
    buoy(3.7, 0.3, '12', '#d9764f');
    buoy(-1.9, -0.9, '03', '#4d8fb8');

    // ---------- 长柄网兜与水桶（仓库墙边） ----------
    const netPole = grp(-6.82, L.quayY, -2.75, g);
    const handle = cyl(0.018, 0.022, 1.5, 6, toon(0x8a6242), 0, 0.72, 0, netPole);
    handle.rotation.z = 0.22;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 6, 16), toon(P.iron));
    hoop.position.set(-0.32, 1.42, 0); hoop.rotation.y = 0.4; netPole.add(hoop);
    const dipNet = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10, 1, true), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: netTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }));
    dipNet.position.set(-0.32, 1.32, 0); dipNet.rotation.x = Math.PI; netPole.add(dipNet);
    const bucket = cyl(0.12, 0.1, 0.19, 12, toon(P.crateBlue), -6.6, L.quayY + 0.095, -2.35, g);
    const bHandle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 5, 12, Math.PI), toon(P.iron));
    bHandle.position.set(-6.6, L.quayY + 0.19, -2.35); g.add(bHandle);
    const bucket2 = cyl(0.1, 0.085, 0.16, 12, toon(0xd9764f), 3.05, 0.71, 4.15, g);

    // ---------- 自动贩卖机 ----------
    const vm = grp(-5.72, L.quayY, 8.5, g, Math.PI / 2);
    const vmBody = box(0.85, 1.85, 0.68, toon(0xc9584a), 0, 0.925, 0, vm);
    outline(vmBody, 0.018);
    // 灯箱
    const lightbox = box(0.8, 0.24, 0.05, new THREE.MeshBasicMaterial({ color: 0xfff6dd }), 0, 1.7, 0.35, vm);
    const vmSignTex = H.canvasTex(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#fff6dd'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9584a'; ctx.font = 'bold 30px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('のみもの', 128, 42);
    });
    H.plane(0.76, 0.2, new THREE.MeshBasicMaterial({ map: vmSignTex }), 0, 1.7, 0.378, vm);
    // 展示窗（饮料）
    const drinksTex = H.canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2a3a40'; ctx.fillRect(0, 0, w, h);
      const cols = ['#d95f4c', '#f0a04c', '#4d8fb8', '#6fae7c', '#f2c230', '#eef1ec'];
      const rnd = H.mulberry32(44);
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = 'rgba(255,246,221,0.16)';
        ctx.fillRect(8, 12 + row * 60, w - 16, 48);
        for (let c = 0; c < 6; c++) {
          ctx.fillStyle = cols[(rnd() * cols.length) | 0];
          const x = 18 + c * 38, y = 18 + row * 60;
          ctx.fillRect(x, y, 24, 38);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(x + 3, y + 4, 5, 30);
          ctx.fillStyle = 'rgba(40,60,60,0.4)';
          ctx.fillRect(x, y + 34, 24, 4);
        }
      }
    });
    const display = H.plane(0.68, 0.85, new THREE.MeshBasicMaterial({ map: drinksTex }), 0, 1.12, 0.345, vm);
    box(0.72, 0.89, 0.02, toon(0x46565c), 0, 1.12, 0.34, vm);
    // 取货口 / 投币口
    box(0.4, 0.22, 0.04, toon(0x33383a), 0, 0.32, 0.35, vm);
    box(0.1, 0.16, 0.03, toon(0x8a9a94), 0.28, 0.62, 0.35, vm);
    box(0.06, 0.03, 0.03, toon(0x33383a), 0.28, 0.52, 0.36, vm);
    // 锈蚀遮雨檐
    const awning = box(1.0, 0.05, 0.5, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: H.concreteTexture(55, false) }), 0, 1.98, 0.2, vm);
    awning.rotation.x = 0.18;
    awning.material.color.copy(H.srgbColor(0xb9a99a));
    cyl(0.015, 0.015, 0.3, 5, toon(P.ironRust), -0.42, 1.9, 0.4, vm).rotation.x = 0.5;
    cyl(0.015, 0.015, 0.3, 5, toon(P.ironRust), 0.42, 1.9, 0.4, vm).rotation.x = 0.5;
    // 微光
    const vmGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: H.canvasTex(64, 64, (ctx) => {
        const gg = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        gg.addColorStop(0, 'rgba(255,240,200,0.5)');
        gg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, 64, 64);
      }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    vmGlow.scale.set(1.6, 1.8, 1);
    vmGlow.position.set(0, 1.2, 0.6);
    vm.add(vmGlow);
    H.refs.vmGlow = vmGlow;

    // ---------- 告示牌 ----------
    const signG = grp(3.95, L.quayY, 5.75, g, -0.12);
    signG.rotation.z = 0.03;
    cyl(0.03, 0.035, 0.9, 6, toon(0x8a9a94), -0.38, 0.45, 0, signG);
    cyl(0.03, 0.035, 0.9, 6, toon(0x8a9a94), 0.38, 0.45, 0, signG);
    const signTex = H.canvasTex(256, 160, (ctx, w, h) => {
      ctx.fillStyle = '#eef0e8'; ctx.fillRect(0, 0, w, h);
      const rnd = H.mulberry32(66);
      H.speckle(ctx, w, h, 130, ['#d8ddd6', '#c4cdc9', '#b9c4c0'], 1, 6, 0.4, rnd);
      ctx.strokeStyle = '#2e7f8f'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#2a4d54'; ctx.font = 'bold 40px "Yu Mincho", "SimSun", serif';
      ctx.textAlign = 'center'; ctx.fillText('汐見港', 128, 62);
      ctx.fillStyle = '#c9584a'; ctx.font = 'bold 30px "Yu Gothic", "Microsoft YaHei", sans-serif';
      ctx.fillText('注意落水', 128, 112);
      ctx.strokeStyle = 'rgba(46,127,143,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 30; x < 226; x += 4) ctx.lineTo(x, 134 + Math.sin(x * 0.12) * 4);
      ctx.stroke();
    });
    const signBoard = box(0.92, 0.58, 0.04, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: signTex }), 0, 0.95, 0, signG);
    outline(signBoard, 0.012);

    // ---------- 风向袋与小旗 ----------
    const wsG = grp(-5.95, L.quayY, -5.35, g);
    cyl(0.035, 0.05, 2.3, 8, toon(0x8a9a94), 0, 1.15, 0, wsG);
    const sockPivot = grp(0, 2.28, 0, wsG);
    const sockTex = H.canvasTex(128, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f08a3c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f8f5';
      ctx.fillRect(w * 0.2, 0, w * 0.18, h);
      ctx.fillRect(w * 0.58, 0, w * 0.18, h);
    });
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 10, 1, true), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: sockTex, side: THREE.DoubleSide }));
    sock.rotation.z = -Math.PI / 2;
    sock.position.x = 0.31;
    sockPivot.add(sock);
    const sockRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 12), toon(P.iron));
    sockRing.rotation.y = Math.PI / 2;
    sockPivot.add(sockRing);
    H.anim.windsock = { pivot: sockPivot, sock: sock };
    // 候船室屋顶小旗
    const flagPole = cyl(0.015, 0.02, 0.7, 6, toon(0x8a9a94), -8.9, L.quayY + 2.5, 9.0, g);
    const flagGeo = new THREE.PlaneGeometry(0.44, 0.28, 10, 5);
    flagGeo.translate(0.22, 0, 0);
    const flagTex = H.canvasTex(96, 64, (ctx, w, h) => {
      ctx.fillStyle = '#2e7f8f'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f6f8f5'; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = 8; x < 88; x += 4) ctx.lineTo(x, 32 + Math.sin(x * 0.18) * 7);
      ctx.stroke();
      ctx.fillStyle = '#f6f8f5'; ctx.beginPath(); ctx.arc(70, 18, 7, 0, 6.283); ctx.fill();
    });
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: flagTex, side: THREE.DoubleSide }));
    flag.position.set(-8.9, L.quayY + 2.72, 9.0);
    flag.castShadow = true;
    g.add(flag);
    H.anim.flags = [{ mesh: flag, base: flagGeo.attributes.position.array.slice(), phase: 1.9, pole: new THREE.Vector3(-8.9, L.quayY + 2.72, 9.0) }];

    // ---------- 乐器硬箱 ×2 ----------
    function instrumentCase(x, z, ry, tilt) {
      const c = grp(x, L.quayY + 0.1, z, g, ry);
      c.rotation.z = tilt || 0;
      const body = box(0.88, 0.17, 0.34, toon(P.caseSilver), 0, 0, 0, c);
      outline(body, 0.012);
      box(0.9, 0.03, 0.36, toon(P.caseDark), 0, 0.085, 0, c);
      box(0.9, 0.03, 0.36, toon(P.caseDark), 0, -0.085, 0, c);
      // 锁扣
      [-0.25, 0.25].forEach(function (lx) {
        box(0.06, 0.05, 0.02, toon(0x8a9a94), lx, 0.02, 0.18, c);
      });
      // 提手
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 5, 10, Math.PI), toon(P.caseDark));
      handle.position.set(0, 0.02, 0.19); handle.rotation.x = Math.PI; c.add(handle);
      // 护角
      [[-0.44, -0.17], [0.44, -0.17], [-0.44, 0.17], [0.44, 0.17]].forEach(function (p) {
        box(0.05, 0.18, 0.05, toon(P.caseDark), p[0], 0, p[1], c);
      });
      // 小贴纸
      const sticker = H.plane(0.12, 0.08, new THREE.MeshBasicMaterial({ color: H.srgbColor(0x4d8fb8) }), 0.15, 0.091, 0.05, c);
      sticker.rotation.x = -Math.PI / 2;
      return c;
    }
    instrumentCase(0.85, 6.75, 0.12, 0);
    instrumentCase(1.72, 6.9, -0.08, 0);
    H.refs.casesPos = new THREE.Vector3(1.3, L.quayY + 0.1, 6.8);

    // ---------- 透明雨伞（斜靠台阶边） ----------
    const umb = grp(2.82, L.quayY, 5.15, g);
    umb.rotation.z = -0.32;
    umb.rotation.x = 0.1;
    const shaft = cyl(0.012, 0.012, 0.88, 6, toon(0x8a9a94), 0, 0.44, 0, umb);
    const canopyMat = new THREE.MeshPhongMaterial({
      color: H.srgbColor(0xe8f6f6), transparent: true, opacity: 0.3, shininess: 120,
      specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false
    });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), canopyMat);
    canopy.position.y = 0.86;
    canopy.scale.y = 0.72;
    canopy.renderOrder = 11;
    umb.add(canopy);
    // 伞骨
    const ribM = toon(0xb9c6c9);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const rib = H.tubeAlong([
        new THREE.Vector3(0, 0.88, 0),
        new THREE.Vector3(Math.cos(a) * 0.24, 0.8, Math.sin(a) * 0.24),
        new THREE.Vector3(Math.cos(a) * 0.42, 0.68, Math.sin(a) * 0.42)
      ], 0.006, ribM, 8);
      umb.add(rib);
    }
    // 伞柄
    const uHandle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI), toon(0x8a6242));
    uHandle.position.set(0.05, 0.02, 0); uHandle.rotation.z = Math.PI; umb.add(uHandle);
    // 伞面雨珠
    const dropM = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
    const rnd = H.mulberry32(88);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 0.1 + rnd() * 0.3;
      const dy = 0.86 + Math.sqrt(Math.max(0, 0.44 * 0.44 - r * r)) * 0.72 - 0.02;
      const dr = sph(0.008 + rnd() * 0.007, dropM, Math.cos(a) * r, dy, Math.sin(a) * r, umb, 5, 4);
      dr.castShadow = false;
    }
    H.refs.umbrella = umb;
    // 伞沿滴水点（世界坐标近似）
    umb.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      const wp = new THREE.Vector3(Math.cos(a) * 0.42, 0.68, Math.sin(a) * 0.42);
      umb.localToWorld(wp);
      H.anim.dripPoints.push({ pos: wp, rate: 0.5, groundY: L.quayY });
    }

    // ---------- 缆绳圈 ----------
    [[-3.2, 5.6], [6.4, 5.4]].forEach(function (p) {
      for (let i = 0; i < 3; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.02, 0.03, 6, 16), toon(i === 0 ? P.ropeWet : P.rope));
        coil.position.set(p[0], L.quayY + 0.035 + i * 0.05, p[1]);
        coil.rotation.x = Math.PI / 2;
        coil.castShadow = true;
        g.add(coil);
      }
    });

    // 船舷滴水点
    H.anim.dripPoints.push({ pos: new THREE.Vector3(-3.28, L.waterY + 0.45, -1.2), rate: 0.3, groundY: L.waterY, water: true });
    H.anim.dripPoints.push({ pos: new THREE.Vector3(0.6, L.waterY + 0.4, 3.28), rate: 0.3, groundY: L.waterY, water: true });
    H.anim.dripPoints.push({ pos: new THREE.Vector3(4.2, L.waterY + 0.44, 3.12), rate: 0.3, groundY: L.waterY, water: true });

    return g;
  }

  H.buildProps = buildProps;
})(window.HARBOR);