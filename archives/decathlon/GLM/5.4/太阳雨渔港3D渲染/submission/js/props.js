/* ============================================================
   props.js — 码头道具
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const PM = {};
  S.initPropMats = function () {
    if (PM.ready) return;
    PM.ready = true;
    PM.iron = S.toon(0x2f3a3e, { spec: 0.45, shin: 35, rim: 0.12 });
    PM.ironLight = S.toon(0x4a565c, { spec: 0.45, shin: 35 });
    PM.rust = S.toon(0xffffff, {
      map: S.tex(S.texRust(256, 256, { base: [146, 150, 148], rust: [160, 92, 52], lo: 0.42, hi: 0.64 })),
      spec: 0.35, shin: 30
    });
    PM.rustHeavy = S.toon(0xffffff, {
      map: S.tex(S.texRust(256, 256, { base: [120, 118, 112], rust: [146, 78, 44], lo: 0.36, hi: 0.56 })),
      spec: 0.3, shin: 26
    });
    PM.white = S.toon(0xe6eae4, { spec: 0.35, shin: 45, rim: 0.12 });
    PM.cream = S.toon(0xe2ddcc, { spec: 0.25, shin: 35 });
    PM.blue = S.toon(0x3f7f9e, { spec: 0.3, shin: 40 });
    PM.blueLight = S.toon(0x6fb2c8, { spec: 0.3, shin: 40 });
    PM.orange = S.toon(0xe8734a, { spec: 0.3, shin: 30 });
    PM.yellow = S.toon(0xe9c24a, { spec: 0.3, shin: 35 });
    PM.red = S.toon(0xc9553f, { spec: 0.3, shin: 35 });
    PM.green = S.toon(0x3f6f52, { spec: 0.25, shin: 30 });
    PM.rope = S.toon(0xd4713f, { spec: 0.12 });
    PM.ropeDark = S.toon(0x9c5a34, { spec: 0.16 });
    PM.wood = S.toon(0xffffff, { map: S.tex(S.texWood(256, 256, { base: [170, 126, 88] })), spec: 0.12 });
    PM.woodDark = S.toon(0x7a5638, { spec: 0.1 });
    PM.woodPale = S.toon(0xd8c39c, { spec: 0.12 });
    PM.metal = S.toon(0xa9b3b5, { spec: 0.55, shin: 55 });
    PM.dark = S.toon(0x2a3238, { spec: 0.25, shin: 25 });
    PM.tire = S.toon(0x2b3134, { spec: 0.2, shin: 14 });
    PM.concrete = S.toon(0xffffff, { map: S.tex(S.texConcrete(256, 256, { base: [198, 203, 197], seed: 55 }), { repeat: [1, 1] }), spec: 0.15 });
    PM.glassClear = new THREE.MeshPhysicalMaterial({
      color: 0xeaf8fa, transparent: true, opacity: 0.22, roughness: 0.03,
      metalness: 0, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.02
    });
    PM.silver = S.toon(0xc4ccce, { spec: 0.7, shin: 70, rim: 0.18 });
    PM.silverDark = S.toon(0x9aa4a8, { spec: 0.6, shin: 60 });
    PM.net = new THREE.MeshBasicMaterial({
      map: S.tex(S.texNet(128, 128), { repeat: [6, 4] }),
      transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
    });
    PM.floatOrange = S.toon(0xe8622c, { spec: 0.35, shin: 40 });
    PM.floatWhite = S.toon(0xe4e7e0, { spec: 0.35, shin: 40 });
    PM.floatYellow = S.toon(0xe8c24a, { spec: 0.35, shin: 40 });
  };

  S.texNet = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70,88,92,0.85)';
    ctx.lineWidth = 1.4;
    const n = 8;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * w / n, 0); ctx.lineTo(i * w / n, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * h / n); ctx.lineTo(w, i * h / n); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,76,80,0.35)';
    ctx.lineWidth = 0.8;
    for (let i = -n; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * w / n, 0); ctx.lineTo(i * w / n + h, h); ctx.stroke();
    }
    return c;
  };

  S.texVending = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e4d8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9553f'; ctx.fillRect(0, 0, w, h * 0.12);
    ctx.fillStyle = '#f4f1e6';
    ctx.font = 'bold 18px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillText('つめた〜い', 10, 30);
    // 商品陈列
    const rnd = S.mulberry32(4);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 5; i++) {
        const x = 12 + i * 26, y = 48 + r * 46;
        ctx.fillStyle = `hsl(${rnd() * 360 | 0},70%,62%)`;
        ctx.fillRect(x, y, 18, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x + 4, y + 4, 10, 8);
      }
    }
    ctx.fillStyle = '#3d5a66';
    ctx.fillRect(10, h - 40, w - 20, 26);
    ctx.fillStyle = '#8ef0c0';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('¥120', 16, h - 22);
    return c;
  };

  S.texSignBoard = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f2efe2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3f6b78'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#2f5a68';
    ctx.font = 'bold 46px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('太陽雨 港', w / 2, 58);
    ctx.font = 'bold 30px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillStyle = '#b03a2e';
    ctx.fillText('注意　落水', w / 2, 116);
    ctx.font = '20px "Source Han Sans JP","Yu Gothic",sans-serif';
    ctx.fillStyle = '#5a7078';
    ctx.fillText('日の出から日没まで', w / 2, 152);
    // 褪色
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 4 + Math.random() * 12);
    return c;
  };

  /* ---------------- 系船柱 ---------------- */
  S.makeBollard = function (s) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(S.cyl(0.30 * s, 0.36 * s, 0.10 * s, 14), PM.iron);
    base.position.y = 0.05 * s;
    g.add(base);
    const body = new THREE.Mesh(S.cyl(0.19 * s, 0.24 * s, 0.46 * s, 14), PM.iron);
    body.position.y = 0.30 * s;
    g.add(body);
    const lip = new THREE.Mesh(S.cyl(0.26 * s, 0.22 * s, 0.09 * s, 14), PM.iron);
    lip.position.y = 0.57 * s;
    g.add(lip);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.20 * s, 12, 6, 0, 6.28, 0, 1.57), PM.iron);
    top.position.y = 0.60 * s; top.scale.y = 0.55;
    g.add(top);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    S.addOutlines(g, 0.8);
    return g;
  };

  /* ---------------- 灯柱（圆环灯罩） ---------------- */
  S.makeLampPost = function (h) {
    const g = new THREE.Group();
    h = h || 3.5;
    const base = new THREE.Mesh(S.cyl(0.22, 0.28, 0.22, 10), PM.iron);
    base.position.y = 0.11;
    g.add(base);
    const pole = new THREE.Mesh(S.cyl(0.070, 0.095, h, 10), PM.iron);
    pole.position.y = h / 2 + 0.2;
    pole.castShadow = true;
    g.add(pole);
    // 横臂
    const arm = new THREE.Mesh(S.cyl(0.045, 0.05, 0.86, 6), PM.iron);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.43, h + 0.2, 0);
    g.add(arm);
    // 环形灯罩（水平圆环）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.048, 8, 22), PM.iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.86, h - 0.02, 0);
    g.add(ring);
    // 灯罩锥面
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.35, 0.18, 18, 1, true), PM.iron);
    shade.position.set(0.86, h + 0.12, 0);
    shade.castShadow = true;
    g.add(shade);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.19, 18), PM.iron);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(0.86, h + 0.21, 0);
    g.add(cap);
    // 灯泡
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff4cc }));
    bulb.position.set(0.86, h - 0.10, 0);
    g.add(bulb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(1.1, 1.1, 1);
    glow.position.set(0.86, h - 0.10, 0);
    glow.layers.set(1);
    g.add(glow);
    g.userData.bulb = bulb;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    S.addOutlines(g, 0.8);
    return g;
  };

  /* ---------------- 鱼箱 ---------------- */
  S.makeFishBox = function (w, h, d, mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(S.rbox(w, h * 0.86, d, 0.035), mat);
    body.position.y = h * 0.43;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const rim = new THREE.Mesh(S.rbox(w * 1.03, h * 0.14, d * 1.03, 0.02), mat);
    rim.position.y = h * 0.93;
    rim.castShadow = true;
    g.add(rim);
    // 侧面凹槽
    const slotMat = new THREE.MeshToonMaterial({ color: 0x000000, transparent: true, opacity: 0.10 });
    for (const sx of [-1, 1]) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.5, h * 0.34), slotMat);
      slot.position.set(sx * (w / 2 + 0.004), h * 0.5, 0);
      slot.rotation.y = sx * Math.PI / 2;
      g.add(slot);
    }
    return g;
  };

  /* ---------------- 渔网架 ---------------- */
  S.makeNetRack = function (w, h) {
    const g = new THREE.Group();
    const mat = PM.metal;
    for (const sx of [-w / 2, w / 2]) {
      const post = new THREE.Mesh(S.cyl(0.035, 0.04, h, 6), mat);
      post.position.set(sx, h / 2, 0);
      post.castShadow = true;
      g.add(post);
    }
    const bar = new THREE.Mesh(S.cyl(0.03, 0.03, w, 6), mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, h, 0);
    g.add(bar);
    // 网
    const netGeo = new THREE.PlaneGeometry(w * 0.96, h * 0.86, 8, 6);
    const pos = netGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const sag = Math.cos(x / (w * 0.5) * 1.2) * 0.10;
      pos.setZ(i, -sag * (0.3 + (h - y) / h));
      pos.setY(i, y - Math.abs(x) * 0.03);
    }
    netGeo.computeVertexNormals();
    const net = new THREE.Mesh(netGeo, PM.net);
    net.position.set(0, h * 0.48, 0.02);
    net.castShadow = true;
    g.add(net);
    S.addOutlines(g, 0.6);
    return g;
  };

  /* ---------------- 浮球绳串 ---------------- */
  S.makeFloatLine = function (n, spacing, radius) {
    const g = new THREE.Group();
    const ropeMat = PM.ropeDark;
    const rope = new THREE.Mesh(S.cyl(0.012, 0.012, n * spacing, 4), ropeMat);
    rope.rotation.z = Math.PI / 2;
    g.add(rope);
    const mats = [PM.floatOrange, PM.floatWhite, PM.floatYellow];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mats[i % 3]);
      b.position.x = -n * spacing / 2 + spacing * (i + 0.5);
      b.scale.y = 1.25;
      b.castShadow = true;
      g.add(b);
    }
    S.addOutlines(g, 0.5);
    return g;
  };

  /* ---------------- 手摇绞盘 + 吊杆 ---------------- */
  S.makeWinch = function () {
    const g = new THREE.Group();
    const base = new THREE.Mesh(S.rbox(0.9, 0.16, 0.7, 0.03), PM.rustHeavy);
    base.position.y = 0.08; g.add(base);
    for (const sx of [-0.34, 0.34]) {
      const plate = new THREE.Mesh(S.rbox(0.08, 0.52, 0.5, 0.02), PM.rust);
      plate.position.set(sx, 0.38, 0); g.add(plate);
    }
    const drum = new THREE.Mesh(S.cyl(0.20, 0.20, 0.6, 12), PM.rust);
    drum.rotation.z = Math.PI / 2;
    drum.position.y = 0.46;
    g.add(drum);
    // 缠绕的钢缆
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.012, 4, 12), PM.dark);
      r.rotation.y = Math.PI / 2;
      r.position.set(-0.25 + i * 0.1, 0.46, 0);
      g.add(r);
    }
    // 摇柄
    const crank = new THREE.Group();
    const shaft = new THREE.Mesh(S.cyl(0.025, 0.025, 0.28, 6), PM.metal);
    shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.14; crank.add(shaft);
    const arm = new THREE.Mesh(S.cyl(0.022, 0.022, 0.30, 6), PM.metal);
    arm.position.set(0.28, 0.15, 0); crank.add(arm);
    const grip = new THREE.Mesh(S.cyl(0.03, 0.03, 0.14, 6), PM.woodDark);
    grip.rotation.x = Math.PI / 2; grip.position.set(0.28, 0.30, 0.06); crank.add(grip);
    crank.position.set(0.34, 0.46, 0);
    g.add(crank);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    S.addOutlines(g, 0.7);
    return g;
  };

  S.makeCrane = function () {
    const g = new THREE.Group();
    const base = new THREE.Mesh(S.cyl(0.34, 0.42, 0.18, 10), PM.rustHeavy);
    base.position.y = 0.09; g.add(base);
    const post = new THREE.Mesh(S.cyl(0.11, 0.14, 2.6, 10), PM.rust);
    post.position.y = 1.4; post.castShadow = true; g.add(post);
    const boom = new THREE.Mesh(S.cyl(0.075, 0.09, 2.4, 8), PM.rust);
    boom.position.set(0.85, 2.55, 0);
    boom.rotation.z = -1.05;
    boom.castShadow = true;
    g.add(boom);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), PM.rust);
    tip.position.set(1.85, 3.12, 0);
    g.add(tip);
    // 吊钩钢缆
    const cable = new THREE.Mesh(S.cyl(0.012, 0.012, 1.1, 4), PM.dark);
    cable.position.set(1.85, 2.57, 0);
    g.add(cable);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.028, 5, 10, Math.PI * 1.4), PM.metal);
    hook.position.set(1.85, 1.98, 0);
    hook.rotation.z = 0.6;
    g.add(hook);
    // 斜撑
    const brace = new THREE.Mesh(S.cyl(0.04, 0.04, 1.5, 6), PM.rust);
    brace.position.set(0.55, 2.15, 0);
    brace.rotation.z = -2.2;
    g.add(brace);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    S.addOutlines(g, 0.7);
    return g;
  };

  /* ---------------- 自动贩卖机 ---------------- */
  S.makeVending = function () {
    const g = new THREE.Group();
    const body = new THREE.Mesh(S.rbox(0.95, 1.82, 0.72, 0.05), PM.red);
    body.position.y = 0.91;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 1.20),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texVending(256, 320)) }));
    panel.position.set(0, 1.12, 0.365);
    g.add(panel);
    const glowPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.24),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.16 }));
    glowPanel.position.set(0, 1.12, 0.368);
    g.add(glowPanel);
    // 取物口
    const slot = new THREE.Mesh(S.rbox(0.62, 0.22, 0.06, 0.02), PM.dark);
    slot.position.set(0, 0.42, 0.36);
    g.add(slot);
    // 遮雨檐（锈蚀）
    const awning = new THREE.Mesh(S.rbox(1.12, 0.06, 0.42, 0.02), PM.rust);
    awning.position.set(0, 1.95, 0.24);
    awning.rotation.x = 0.18;
    awning.castShadow = true;
    g.add(awning);
    for (const sx of [-0.48, 0.48]) {
      const bar = new THREE.Mesh(S.cyl(0.02, 0.02, 0.36, 5), PM.rust);
      bar.position.set(sx, 1.78, 0.30);
      bar.rotation.x = 0.18;
      g.add(bar);
    }
    S.addOutlines(g, 0.8);
    return g;
  };

  /* ---------------- 告示牌 ---------------- */
  S.makeSignBoard = function () {
    const g = new THREE.Group();
    for (const sx of [-0.62, 0.62]) {
      const post = new THREE.Mesh(S.cyl(0.055, 0.06, 1.75, 6), PM.woodDark);
      post.position.set(sx, 0.87, 0);
      post.castShadow = true;
      g.add(post);
    }
    const board = new THREE.Mesh(S.rbox(1.42, 0.78, 0.06, 0.02), PM.cream);
    board.position.y = 1.38;
    board.castShadow = true;
    g.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.70),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texSignBoard(512, 256)) }));
    face.position.set(0, 1.38, 0.033);
    g.add(face);
    S.addOutlines(g, 0.7);
    return g;
  };

  /* ---------------- 风向袋 ---------------- */
  S.makeWindsock = function () {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(S.cyl(0.05, 0.06, 2.6, 8), PM.metal);
    pole.position.y = 1.3; pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(S.cyl(0.028, 0.028, 0.5, 6), PM.metal);
    arm.rotation.z = Math.PI / 2; arm.position.set(0.25, 2.55, 0);
    g.add(arm);
    const swivel = new THREE.Group();
    swivel.position.set(0.5, 2.55, 0);
    const sockGeo = new THREE.CylinderGeometry(0.055, 0.16, 0.85, 10, 5, true);
    sockGeo.rotateZ(-Math.PI / 2);
    sockGeo.translate(0.42, 0, 0);
    const sock = new THREE.Mesh(sockGeo, PM.orange);
    sock.castShadow = true;
    swivel.add(sock);
    const sock2 = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.16, 0.18, 10, 1, true), PM.white);
    sock2.rotation.z = -Math.PI / 2;
    sock2.position.x = 0.72;
    swivel.add(sock2);
    g.add(swivel);
    g.userData.swivel = swivel;
    S.addOutlines(g, 0.6);
    return g;
  };

  S.makeFlag = function (color, s) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(S.cyl(0.018, 0.022, 1.5 * s, 5), PM.metal);
    pole.position.y = 0.75 * s;
    g.add(pole);
    const geo = new THREE.PlaneGeometry(0.62 * s, 0.40 * s, 6, 3);
    geo.translate(0.31 * s, 0, 0);
    const flag = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide }));
    flag.position.y = 1.28 * s;
    flag.castShadow = true;
    g.add(flag);
    g.userData.flag = flag;
    g.userData.base = geo.attributes.position.array.slice();
    return g;
  };

  /* ---------------- 长柄网兜 + 水桶 ---------------- */
  S.makeLandingNet = function () {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(S.cyl(0.022, 0.026, 2.1, 6), PM.woodPale);
    handle.position.y = 1.05;
    g.add(handle);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 5, 16), PM.metal);
    hoop.position.y = 2.10;
    g.add(hoop);
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.10, 0.42, 12, 1, true), PM.net);
    bag.position.y = 1.89;
    g.add(bag);
    g.rotation.z = 0.12;
    S.addOutlines(g, 0.5);
    return g;
  };

  S.makeBucket = function (color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.16, 0.30, 12, 1, true),
      S.toon(color === undefined ? 0x3f7f9e : color, { spec: 0.35, shin: 45, side: THREE.DoubleSide }));
    body.position.y = 0.15;
    g.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12),
      S.toon(color === undefined ? 0x3f7f9e : color, { spec: 0.35, shin: 45 }));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;
    g.add(bottom);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 12, Math.PI), PM.metal);
    handle.position.y = 0.30;
    g.add(handle);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    S.addOutlines(g, 0.5);
    return g;
  };

  /* ---------------- 乐器硬箱 ---------------- */
  S.makeInstrumentCase = function (w, h, d, color) {
    const g = new THREE.Group();
    const mat = S.toon(color === undefined ? 0xa8b2b6 : color, { spec: 0.55, shin: 60, rim: 0.18 });
    const body = new THREE.Mesh(S.rbox(w, h, d, 0.07), mat);
    body.position.y = h / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // 棱线
    const edgeMat = S.toon(0x8a9498, { spec: 0.5, shin: 50 });
    for (const sy of [h * 0.30, h * 0.72]) {
      const line = new THREE.Mesh(S.rbox(w * 1.005, 0.012, d * 1.005, 0.005), edgeMat);
      line.position.y = sy;
      g.add(line);
    }
    // 提手
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 5, 10, Math.PI), PM.dark);
    handle.position.set(0, h, 0);
    g.add(handle);
    // 锁扣
    for (const sx of [-w * 0.3, w * 0.3]) {
      const latch = new THREE.Mesh(S.rbox(0.06, 0.035, 0.02, 0.008), PM.metal);
      latch.position.set(sx, h * 0.32, d / 2);
      g.add(latch);
    }
    S.addOutlines(g, 0.8);
    return g;
  };

  /* ---------------- 透明雨伞 ---------------- */
  S.makeUmbrella = function () {
    const g = new THREE.Group();
    // 伞面（分段圆锥）
    const pts = [];
    const N = 12;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const r = Math.sin(t * Math.PI / 2) * 0.62;
      const y = Math.cos(t * Math.PI / 2) * 0.30;
      pts.push(new THREE.Vector2(r, y));
    }
    const canopy = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), PM.glassClear);
    canopy.position.y = 1.02;
    g.add(canopy);
    // 伞骨
    const ribMat = S.toon(0xd8e2e4, { spec: 0.4 });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const rib = new THREE.Mesh(S.cyl(0.006, 0.006, 0.63, 3), ribMat);
      rib.position.set(Math.cos(a) * 0.31, 1.17, Math.sin(a) * 0.31);
      rib.rotation.z = Math.cos(a) * 1.05;
      rib.rotation.x = -Math.sin(a) * 1.05;
      g.add(rib);
    }
    // 伞柄
    const shaft = new THREE.Mesh(S.cyl(0.014, 0.014, 0.95, 6), ribMat);
    shaft.position.y = 0.72;
    g.add(shaft);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 5, 12, Math.PI * 1.3),
      S.toon(0x8a623d, { spec: 0.2 }));
    handle.position.set(0, 0.26, 0.0);
    handle.rotation.z = 0.4;
    g.add(handle);
    g.rotation.z = 0.16;
    g.rotation.x = -0.08;
    return g;
  };

  /* ---------------- 倒扣的小木舢板 ---------------- */
  S.makeOverturnedBoat = function (L, B) {
    const g = new THREE.Group();
    const woodMat = S.toon(0xffffff, {
      map: S.tex(S.texWood(256, 256, { base: [178, 134, 94] }), { repeat: [2, 2] }),
      spec: 0.12, side: THREE.DoubleSide
    });
    const hull = new THREE.Mesh(S.hullGeo(L, B, 0.62, { stations: 14, m: 14 }), woodMat);
    hull.rotation.x = Math.PI;
    hull.position.y = 1.26;
    hull.castShadow = true; hull.receiveShadow = true;
    S.addOutline(hull, 0.9);
    g.add(hull);
    // 船底板条
    for (let i = -2; i <= 2; i++) {
      const plank = new THREE.Mesh(S.rbox(0.10, 0.03, L * 0.86, 0.01), PM.woodDark);
      plank.position.set(i * 0.20, 1.62 - Math.abs(i) * 0.09, 0);
      plank.rotation.z = i * 0.22;
      g.add(plank);
    }
    // 龙骨
    const keel = new THREE.Mesh(S.rbox(0.07, 0.06, L * 0.95, 0.02), PM.woodDark);
    keel.position.set(0, 1.72, 0);
    g.add(keel);
    // 垫木
    for (const sz of [-1.02, 1.02]) {
      const blk = new THREE.Mesh(S.rbox(0.95, 0.42, 0.26, 0.02), PM.woodDark);
      blk.position.set(0, 0.21, sz);
      blk.castShadow = true; blk.receiveShadow = true;
      g.add(blk);
    }
    return g;
  };

  /* ---------------- 旧轮胎堆 / 油桶 ---------------- */
  S.makeTireStack = function (n) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 7, 16), PM.tire);
      t.rotation.x = Math.PI / 2;
      t.position.set((i % 2) * 0.05, 0.13 + i * 0.24, (i % 3 === 1) ? 0.04 : 0);
      t.castShadow = true;
      g.add(t);
    }
    return g;
  };

  S.makeDrum = function (color) {
    const g = new THREE.Group();
    const mat = S.toon(color === undefined ? 0x3f6f8a : color, { spec: 0.4, shin: 45 });
    const body = new THREE.Mesh(S.cyl(0.29, 0.29, 0.86, 14), mat);
    body.position.y = 0.43;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    for (const y of [0.16, 0.70]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 5, 16), PM.rust);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.29, 14), PM.rust);
    lid.rotation.x = -Math.PI / 2; lid.position.y = 0.861;
    g.add(lid);
    S.addOutlines(g, 0.6);
    return g;
  };

  /* ---------------- 电线 ---------------- */
  S.makeWire = function (a, b, sag, r) {
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a[0], a[1], a[2]),
      mid,
      new THREE.Vector3(b[0], b[1], b[2])
    );
    const geo = new THREE.TubeGeometry(curve, 16, r || 0.012, 4, false);
    const m = new THREE.Mesh(geo, PM.dark);
    m.castShadow = false;
    return m;
  };


  /* ---------------- 追加道具 ---------------- */
  S.buildExtraProps = function (scene) {
    S.initPropMats();
    const g = new THREE.Group(); g.name = 'propsExtra';
    const T = S.W.dockY;
    const rnd = S.mulberry32(777);

    // 防护栏杆（前沿）
    {
      const postMat = PM.rust;
      for (let i = 0; i < 9; i++) {
        const x = -11.5 + i * 2.9;
        const post = new THREE.Mesh(S.cyl(0.045, 0.05, 0.95, 6), postMat);
        post.position.set(x, T + 0.48, 12.55);
        post.castShadow = true;
        g.add(post);
      }
      for (const y of [0.55, 0.92]) {
        const bar = new THREE.Mesh(S.cyl(0.028, 0.028, 23.2, 5), postMat);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0.1, T + y, 12.55);
        g.add(bar);
      }
    }

    // 蟹笼堆
    {
      const trapMat = new THREE.MeshToonMaterial({ color: 0x8a9a92, wireframe: true, transparent: true, opacity: 0.75 });
      for (let s = 0; s < 3; s++) {
        const trap = new THREE.Mesh(S.rbox(0.85, 0.42, 0.62, 0.03), trapMat);
        trap.position.set(-11.6, T + 0.21 + s * 0.43, 10.9);
        trap.rotation.y = 0.12 * s;
        trap.castShadow = true;
        g.add(trap);
      }
      // 顶上盖块防水布
      const tarp = new THREE.Mesh(S.rbox(0.95, 0.05, 0.72, 0.02), S.toon(0x4f7f8a, { spec: 0.2 }));
      tarp.position.set(-11.6, T + 1.32, 10.9);
      tarp.rotation.y = 0.12;
      g.add(tarp);
    }

    // 手推车
    {
      const cart = new THREE.Group();
      const bed = new THREE.Mesh(S.rbox(1.05, 0.08, 0.62, 0.02), PM.wood);
      bed.position.y = 0.52; cart.add(bed);
      for (const sx of [-0.42, 0.42]) {
        const handle = new THREE.Mesh(S.cyl(0.025, 0.025, 0.95, 5), PM.metal);
        handle.position.set(sx, 0.95, 0.36);
        handle.rotation.x = -0.35;
        cart.add(handle);
      }
      for (const sx of [-0.44, 0.44]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), PM.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.19, -0.14);
        cart.add(wheel);
      }
      for (const sx of [-0.44, 0.44]) {
        const leg = new THREE.Mesh(S.cyl(0.022, 0.022, 0.46, 5), PM.metal);
        leg.position.set(sx, 0.25, 0.30);
        cart.add(leg);
      }
      const box = S.makeFishBox(0.66, 0.26, 0.44, PM.blue);
      box.position.set(0, 0.56, 0);
      cart.add(box);
      cart.position.set(-9.4, T, 11.2);
      cart.rotation.y = 0.55;
      S.addOutlines(cart, 0.7);
      cart.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(cart);
    }

    // 长椅
    {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(S.rbox(1.25, 0.07, 0.38, 0.02), PM.woodPale);
      seat.position.y = 0.44; bench.add(seat);
      const back = new THREE.Mesh(S.rbox(1.25, 0.34, 0.06, 0.02), PM.woodPale);
      back.position.set(0, 0.66, -0.16); back.rotation.x = -0.12; bench.add(back);
      for (const sx of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(S.cyl(0.03, 0.035, 0.44, 5), PM.rust);
        leg.position.set(sx, 0.22, 0); bench.add(leg);
      }
      bench.position.set(-1.9, T, 11.6);
      bench.rotation.y = -0.12;
      S.addOutlines(bench, 0.6);
      bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(bench);
    }

    // 消火栓箱 / 软管卷
    {
      const box = new THREE.Mesh(S.rbox(0.42, 0.55, 0.26, 0.03), S.toon(0xc0392b, { spec: 0.35, shin: 40 }));
      box.position.set(-5.4, T + 0.28, 12.0);
      box.castShadow = true;
      g.add(box);
      const reel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 14), S.toon(0xd8d2c4, { spec: 0.2 }));
      reel.position.set(-5.4, T + 0.42, 12.16);
      g.add(reel);
    }

    // 交通锥
    for (const [x, z] of [[-3.2, 12.1], [2.4, 11.9], [7.6, 12.2]]) {
      const cone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), S.toon(0xe8734a, { spec: 0.25 }));
      body.position.y = 0.25; cone.add(body);
      const base = new THREE.Mesh(S.rbox(0.34, 0.04, 0.34, 0.01), S.toon(0x2c3236, { spec: 0.2 }));
      base.position.y = 0.02; cone.add(base);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.09, 10), S.toon(0xf4f6f1, { spec: 0.2 }));
      stripe.position.y = 0.27; cone.add(stripe);
      cone.position.set(x, T, z);
      cone.traverse(o => { if (o.isMesh) o.castShadow = true; });
      S.addOutlines(cone, 0.5);
      g.add(cone);
    }

    // 小木棚（左侧堤岸）
    {
      const shed = new THREE.Group();
      const w = 2.0, d = 1.5, h = 1.5;
      const body = new THREE.Mesh(S.rbox(w, h, d, 0.04), S.toon(0xc8b48c, { spec: 0.12, map: S.tex(S.texWood(256, 256, { base: [186, 158, 118] }), { repeat: [2, 1] }) }));
      body.position.y = h / 2;
      body.castShadow = true; body.receiveShadow = true;
      shed.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.10, d + 0.35), S.toon(0x5c6f78, { spec: 0.25, shin: 40 }));
      roof.position.y = h + 0.10;
      roof.rotation.z = 0.12;
      roof.castShadow = true;
      shed.add(roof);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.15), S.toon(0x7a6242, { spec: 0.1 }));
      door.position.set(0, 0.58, d / 2 + 0.012);
      shed.add(door);
      shed.position.set(-6.1, T, -4.2);
      shed.rotation.y = 0.35;
      S.addOutlines(shed, 0.8);
      g.add(shed);
    }

    // 墙上的浮球
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), i % 2 ? PM.floatOrange : PM.floatWhite);
      b.position.set(-8.05, T + 1.5 + (i % 2) * 0.42, 3.2 + Math.floor(i / 2) * 0.5);
      b.castShadow = true;
      g.add(b);
    }

    // 地上的缆绳盘
    for (const [x, z, r] of [[-2.6, 10.6, 0.34], [4.2, 11.4, 0.28]]) {
      const coil = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(r - i * 0.07, 0.035, 5, 16), PM.rope);
        t.rotation.x = Math.PI / 2;
        t.position.y = 0.03 + i * 0.055;
        t.castShadow = true;
        coil.add(t);
      }
      coil.position.set(x, T, z);
      g.add(coil);
    }

    // 自行车
    {
      const bike = new THREE.Group();
      const frameMat = S.toon(0x3f6f8a, { spec: 0.4, shin: 50 });
      for (const sz of [-0.42, 0.42]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 5, 18), PM.dark);
        wheel.position.set(0, 0.28, sz);
        bike.add(wheel);
      }
      const bar1 = new THREE.Mesh(S.cyl(0.018, 0.018, 0.62, 5), frameMat);
      bar1.rotation.x = 0.9; bar1.position.set(0, 0.46, -0.1); bike.add(bar1);
      const bar2 = new THREE.Mesh(S.cyl(0.018, 0.018, 0.55, 5), frameMat);
      bar2.rotation.x = -0.8; bar2.position.set(0, 0.44, 0.18); bike.add(bar2);
      const seat = new THREE.Mesh(S.rbox(0.18, 0.05, 0.10, 0.02), PM.dark);
      seat.position.set(0, 0.72, -0.32); bike.add(seat);
      const handle = new THREE.Mesh(S.cyl(0.015, 0.015, 0.42, 5), frameMat);
      handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.78, 0.36); bike.add(handle);
      bike.position.set(-11.0, T, 12.1);
      bike.rotation.y = 0.9;
      bike.traverse(o => { if (o.isMesh) o.castShadow = true; });
      S.addOutlines(bike, 0.5);
      g.add(bike);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 组装 ---------------- */
  S.buildProps = function (scene) {
    S.initPropMats();
    const g = new THREE.Group(); g.name = 'props';
    const rnd = S.mulberry32(911);
    const T = S.W.dockY;

    /* --- 系船柱 --- */
    const bollards = [
      [-2.4, 6.15], [0.9, 6.15], [4.2, 6.15], [10.6, 6.15],
      [-4.05, 3.0], [-4.05, -0.6], [-4.05, -5.2]
    ];
    for (const [x, z] of bollards) {
      const b = S.makeBollard(1.0);
      b.position.set(x, T, z);
      g.add(b);
    }

    /* --- 灯柱 --- */
    const lampPos = [[-4.9, 6.35], [5.3, 6.4], [11.2, 6.4]];
    const lampTops = [];
    for (const [x, z] of lampPos) {
      const lp = S.makeLampPost(3.5);
      lp.position.set(x, T, z);
      lp.rotation.y = -Math.PI / 2;
      g.add(lp);
      lampTops.push([x, T + 4.2, z]);
      if (!S.lamps) S.lamps = [];
      S.lamps.push(lp);
    }
    // 电线
    for (let i = 0; i < lampTops.length - 1; i++) {
      const a = lampTops[i], b = lampTops[i + 1];
      g.add(S.makeWire([a[0], a[1] + 0.25, a[2]], [b[0], b[1] + 0.25, b[2]], 0.55, 0.010));
      g.add(S.makeWire([a[0], a[1] + 0.10, a[2]], [b[0], b[1] + 0.10, b[2]], 0.70, 0.008));
    }
    // 斜穿过天空的电线
    g.add(S.makeWire([-4.9, 4.6, 6.35], [-13, 6.2, 12.9], 1.1, 0.009));
    g.add(S.makeWire([11.2, 4.6, 6.4], [12.9, 5.8, 12.9], 0.9, 0.009));

    /* --- 台阶边：乐器硬箱 + 透明雨伞 --- */
    {
      const c1 = S.makeInstrumentCase(1.05, 0.34, 0.42, 0xa9b3b7);
      c1.position.set(8.35, T + 0.02, 6.55);
      c1.rotation.y = 0.22;
      g.add(c1);
      const c2 = S.makeInstrumentCase(0.92, 0.30, 0.38, 0x8f9a9e);
      c2.position.set(8.38, T + 0.36, 6.60);
      c2.rotation.y = 0.10;
      g.add(c2);
      // 硬箱上的雨滴反光
      const um = S.makeUmbrella();
      um.position.set(9.62, T, 6.30);
      um.rotation.y = 0.4;
      g.add(um);
      S.umbrella = um;
    }

    /* --- 鱼箱与周转筐 --- */
    {
      const stack = [
        [-9.7, 6.9, 5], [-9.0, 7.4, 3], [-10.3, 7.9, 4]
      ];
      for (const [x, z, n] of stack) {
        for (let i = 0; i < n; i++) {
          const isBlue = i === n - 1;
          const box = S.makeFishBox(0.66, 0.26, 0.44, isBlue ? PM.blue : PM.white);
          box.position.set(x + (rnd() - 0.5) * 0.05, T + 0.02 + i * 0.27, z + (rnd() - 0.5) * 0.05);
          box.rotation.y = (rnd() - 0.5) * 0.18;
          g.add(box);
        }
      }
      // 散落
      for (let i = 0; i < 6; i++) {
        const box = S.makeFishBox(0.66, 0.26, 0.44, i % 2 ? PM.blue : PM.white);
        box.position.set(-12.0 + rnd() * 3.0, T + 0.02, 6.2 + rnd() * 2.4);
        box.rotation.y = rnd() * 3;
        g.add(box);
      }
    }

    /* --- 渔网架 + 浮球绳串 --- */
    {
      const rack = S.makeNetRack(2.4, 1.9);
      rack.position.set(-3.3, T, 7.2);
      rack.rotation.y = 0.12;
      g.add(rack);
      S.netRack = rack;
      const rack2 = S.makeNetRack(1.8, 1.6);
      rack2.position.set(4.6, T, 8.3);
      rack2.rotation.y = -0.3;
      g.add(rack2);
      // 浮球串
      const fl = S.makeFloatLine(7, 0.26, 0.10);
      fl.position.set(-1.0, T + 1.55, 7.6);
      fl.rotation.y = 0.15;
      g.add(fl);
      S.floatLine = fl;
      const fl2 = S.makeFloatLine(5, 0.24, 0.09);
      fl2.position.set(6.4, T + 1.45, 8.4);
      fl2.rotation.y = -0.25;
      g.add(fl2);
      S.floatLine2 = fl2;
    }

    /* --- 绞盘 + 吊杆 --- */
    {
      const w = S.makeWinch();
      w.position.set(2.9, T, 8.6);
      w.rotation.y = -0.35;
      g.add(w);
      const cr = S.makeCrane();
      cr.position.set(6.6, T, 9.6);
      cr.rotation.y = -0.6;
      g.add(cr);
    }

    /* --- 自动贩卖机 --- */
    {
      const v = S.makeVending();
      v.position.set(-8.7, T, 6.05);
      v.rotation.y = 0;
      g.add(v);
      S.vending = v;
    }

    /* --- 倒扣的小木舢板 + 滑道 --- */
    {
      const ob = S.makeOverturnedBoat(3.15, 1.15);
      ob.position.set(-6.3, T + 0.10, 7.0);
      ob.rotation.y = 0.30;
      g.add(ob);

      S.overturnedBoat = ob;
    }

    /* --- 告示牌 --- */
    {
      const sb = S.makeSignBoard();
      sb.position.set(-4.9, T, 6.6);
      sb.rotation.y = 0.55;
      g.add(sb);
    }

    /* --- 风向袋 + 小旗 --- */
    {
      const ws = S.makeWindsock();
      ws.position.set(11.6, T, 8.2);
      g.add(ws);
      S.windsock = ws;
      const f1 = S.makeFlag(0xe8734a, 1.0);
      f1.position.set(11.0, T, 7.4);
      g.add(f1);
      const f2 = S.makeFlag(0x4a90b8, 0.85);
      f2.position.set(-11.9, T, 8.6);
      g.add(f2);
      const f3 = S.makeFlag(0xe9c24a, 0.8);
      f3.position.set(3.6, T, 10.2);
      g.add(f3);
      if (!S.flags) S.flags = [];
      S.flags.push(f1, f2, f3);
    }

    /* --- 长柄网兜 + 水桶（靠墙） --- */
    {
      const ln = S.makeLandingNet();
      ln.position.set(-8.05, T, 7.4);
      ln.rotation.z = -0.22;
      ln.rotation.y = 0.2;
      g.add(ln);
      const bk = S.makeBucket(0x3f7f9e);
      bk.position.set(-8.35, T, 8.3);
      g.add(bk);
      const bk2 = S.makeBucket(0xd8543f);
      bk2.position.set(-8.0, T, 8.85);
      g.add(bk2);
    }

    /* --- 轮胎 / 油桶 --- */
    {
      const ts = S.makeTireStack(3);
      ts.position.set(12.1, T, 10.4);
      g.add(ts);
      const d1 = S.makeDrum(0x3f6f8a);
      d1.position.set(-11.4, T, 10.6);
      g.add(d1);
      const d2 = S.makeDrum(0x8a5a3a);
      d2.position.set(-10.9, T, 11.3);
      d2.rotation.y = 0.4;
      g.add(d2);
    }

    /* --- 系船浮标（水面 + 岸上） --- */
    {
      const buoy = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), PM.white);
      body.scale.y = 0.9;
      body.castShadow = true;
      buoy.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.18, 14), PM.orange);
      band.position.y = 0.06;
      buoy.add(band);
      const top = new THREE.Mesh(S.cyl(0.05, 0.07, 0.36, 6), PM.iron);
      top.position.y = 0.42;
      buoy.add(top);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.20),
        new THREE.MeshBasicMaterial({ map: S.tex(S.texLabel(128, 96, (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#2f5a68';
          ctx.font = 'bold 54px "Source Han Sans JP",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('12', w / 2, h / 2);
        })), transparent: true }));
      num.position.set(0, 0.02, 0.335);
      buoy.add(num);
      S.addOutlines(buoy, 0.7);
      buoy.position.set(-1.6, S.W.waterY - 0.05, 2.9);
      buoy.userData.phase = 1.2;
      g.add(buoy);
      S.buoys = [buoy];

      const buoy2 = buoy.clone();
      buoy2.position.set(9.6, S.W.waterY - 0.05, 1.2);
      buoy2.userData.phase = 3.4;
      g.add(buoy2);
      S.buoys.push(buoy2);

      // 岸上的浮标
      const b3 = buoy.clone();
      b3.position.set(5.6, T + 0.30, 9.9);
      b3.rotation.z = 0.35;
      g.add(b3);
    }

    /* --- 电缆盘 / 木托盘 --- */
    {
      const pallet = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(S.rbox(1.1, 0.05, 0.16, 0.01), PM.wood);
        p.position.set(0, 0.03, -0.4 + i * 0.2);
        p.castShadow = true;
        pallet.add(p);
      }
      pallet.position.set(-1.6, T, 10.4);
      pallet.rotation.y = 0.3;
      g.add(pallet);
      const box = S.makeFishBox(0.7, 0.3, 0.5, PM.blue);
      box.position.set(-1.6, T + 0.06, 10.4);
      box.rotation.y = 0.3;
      g.add(box);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 更新 ---------------- */
  S.updateProps = function (t) {
    const w = S.wind;
    if (S.windsock) {
      S.windsock.userData.swivel.rotation.y = Math.sin(t * 0.55) * 0.35 + Math.sin(t * 1.7) * 0.06;
      S.windsock.userData.swivel.rotation.z = -0.10 - w * 0.16;
    }
    if (S.flags) {
      for (let i = 0; i < S.flags.length; i++) {
        const f = S.flags[i].userData.flag;
        if (!f) continue;
        const base = S.flags[i].userData.base;
        const pos = f.geometry.attributes.position;
        const amp = 0.05 + w * 0.13;
        for (let k = 0; k < pos.count; k++) {
          const x = base[k * 3], y = base[k * 3 + 1];
          const u = x / 0.62;
          pos.setZ(k, Math.sin(t * 5.0 + u * 5.0 + i * 2) * amp * u + Math.sin(t * 2.3 + u * 2) * amp * 0.4 * u);
          pos.setY(k, y + Math.sin(t * 4.0 + u * 4) * amp * 0.25 * u);
        }
        pos.needsUpdate = true;
      }
    }
    if (S.netRack) {
      S.netRack.rotation.z = Math.sin(t * 1.1) * 0.008 * (0.3 + w);
    }
    if (S.buoys) {
      for (const b of S.buoys) {
        b.position.y = S.W.waterY - 0.05 + Math.sin(t * 0.9 + b.userData.phase) * 0.03;
        b.rotation.z = Math.sin(t * 0.8 + b.userData.phase) * 0.05;
        b.rotation.x = Math.cos(t * 0.7 + b.userData.phase) * 0.05;
      }
    }
  };

})(window);
