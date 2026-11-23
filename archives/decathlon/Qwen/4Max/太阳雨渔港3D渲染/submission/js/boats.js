/* 船只：放样船体、驾驶舱 interior、舢板 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp, outline = H.outline;

  const glassMat = new THREE.MeshPhongMaterial({
    color: H.srgbColor(P.glass), transparent: true, opacity: 0.18, shininess: 100,
    specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false
  });

  // ---------- 船体放样 ----------
  function makeHull(opt) {
    const Ln = opt.len, beam = opt.beam, fb = opt.freeboard, draft = opt.draft;
    const stations = [
      { t: 0.00, hw: beam * 0.46, top: fb, bot: -draft * 0.85 },
      { t: 0.14, hw: beam * 0.50, top: fb, bot: -draft },
      { t: 0.40, hw: beam * 0.50, top: fb + 0.01, bot: -draft },
      { t: 0.64, hw: beam * 0.46, top: fb + 0.05, bot: -draft * 0.85 },
      { t: 0.84, hw: beam * 0.31, top: fb + 0.12, bot: -draft * 0.45 },
      { t: 1.00, hw: 0.025, top: fb + 0.2, bot: fb * 0.25 }
    ];
    const profN = 7;
    const verts = [], uvs = [], idx = [];
    stations.forEach(function (s, i) {
      const z = (s.t - 0.5) * Ln;
      const chine = H.lerp(s.bot, s.top, 0.45);
      const prof = [
        [-s.hw, s.top], [-s.hw, chine], [-s.hw * 0.55, s.bot], [0, s.bot],
        [s.hw * 0.55, s.bot], [s.hw, chine], [s.hw, s.top]
      ];
      prof.forEach(function (p, j) {
        verts.push(p[0], p[1], z);
        uvs.push(j / (profN - 1), s.t);
      });
    });
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < profN - 1; j++) {
        const a = i * profN + j, b = (i + 1) * profN + j, c = (i + 1) * profN + j + 1, d = i * profN + j + 1;
        idx.push(a, b, c, a, c, d);
      }
    }
    // 艉板
    const base = verts.length / 3;
    const s0 = stations[0];
    const z0 = -Ln / 2;
    const chine0 = H.lerp(s0.bot, s0.top, 0.45);
    const prof0 = [[-s0.hw, s0.top], [-s0.hw, chine0], [-s0.hw * 0.55, s0.bot], [0, s0.bot], [s0.hw * 0.55, s0.bot], [s0.hw, chine0], [s0.hw, s0.top]];
    prof0.forEach(function (p, j) { verts.push(p[0], p[1], z0); uvs.push(j / 6, 0); });
    verts.push(0, (s0.top + s0.bot) / 2, z0); uvs.push(0.5, 0.5);
    const center = base + profN;
    for (let j = 0; j < profN - 1; j++) idx.push(center, base + j + 1, base + j);
    idx.push(center, base, base + profN - 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // 甲板与内底
    const dv = [], duv = [], di = [];
    stations.forEach(function (s, i) {
      const z = (s.t - 0.5) * Ln;
      dv.push(-s.hw * 0.94, s.top - 0.03, z, s.hw * 0.94, s.top - 0.03, z);
      duv.push(0, s.t, 1, s.t);
    });
    for (let i = 0; i < stations.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      di.push(a, c, b, b, c, d);
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3));
    dgeo.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
    dgeo.setIndex(di);
    dgeo.computeVertexNormals();
    return { hull: geo, deck: dgeo, stations: stations };
  }

  function boatTexture(seed, stripe) {
    return H.canvasTex(256, 256, (ctx, w, h) => {
      const rnd = H.mulberry32(seed);
      ctx.fillStyle = '#f6f8f5'; ctx.fillRect(0, 0, w, h);
      H.speckle(ctx, w, h, 120, ['#e4e9e4', '#d3dbd7', '#ffffff'], 1, 4, 0.3, rnd);
      // 水线漆带
      ctx.fillStyle = stripe;
      ctx.fillRect(0, h * 0.62, w, h * 0.07);
      // 锈迹流痕
      for (let i = 0; i < 14; i++) {
        const x = rnd() * w, y = h * (0.3 + rnd() * 0.3);
        ctx.fillStyle = 'rgba(178,106,68,' + (0.15 + rnd() * 0.3) + ')';
        ctx.fillRect(x, y, 1.5 + rnd() * 3, 8 + rnd() * 30);
      }
      H.speckle(ctx, w, h * 0.4, 40, ['#b26a44', '#8a4f33'], 1, 3, 0.25, rnd);
      // 磨损
      H.speckle(ctx, w, h, 50, ['#c4cdc9'], 1, 3, 0.3, rnd);
    });
  }

  function woodTexture() {
    return H.canvasTex(256, 256, (ctx, w, h) => {
      const rnd = H.mulberry32(12);
      ctx.fillStyle = '#b98d5e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(110,78,50,0.5)'; ctx.lineWidth = 2;
      for (let y = 0; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = 'rgba(138,98,66,' + (0.1 + rnd() * 0.2) + ')';
        ctx.beginPath();
        const y = rnd() * h;
        ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 8, w * 0.6, y + (rnd() - 0.5) * 8, w, y);
        ctx.stroke();
      }
    }, [2, 1]);
  }

  // ---------- 小物件 ----------
  function lifeRing(parent, x, y, z, ry) {
    const tex = H.canvasTex(128, 32, (ctx, w, h) => {
      ctx.fillStyle = '#f08a3c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f6f8f5';
      for (let i = 0; i < 4; i++) ctx.fillRect(i * 32 + 8, 0, 16, h);
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 18), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: tex }));
    ring.position.set(x, y, z);
    ring.rotation.y = ry || 0;
    ring.castShadow = true;
    parent.add(ring);
    return ring;
  }
  function tireFender(parent, x, y, z, ry) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 8, 14), toon(0x3d4a48));
    t.position.set(x, y, z);
    t.rotation.y = ry || 0;
    t.castShadow = true;
    parent.add(t);
    return t;
  }
  function cleat(parent, x, y, z) {
    const c = grp(x, y, z, parent);
    box(0.1, 0.03, 0.04, toon(P.iron), 0, 0, 0, c);
    box(0.03, 0.05, 0.03, toon(P.iron), -0.035, 0.02, 0, c);
    box(0.03, 0.05, 0.03, toon(P.iron), 0.035, 0.02, 0, c);
    return c;
  }

  // ---------- 驾驶舱内饰 ----------
  function radarTexture() {
    return H.canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0d2a1e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2f7a52'; ctx.lineWidth = 1.5;
      for (let r = 14; r < 60; r += 14) { ctx.beginPath(); ctx.arc(64, 64, r, 0, 6.283); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(64, 4); ctx.lineTo(64, 124); ctx.moveTo(4, 64); ctx.lineTo(124, 64); ctx.stroke();
      ctx.strokeStyle = '#64e8a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + 52 * Math.cos(-0.7), 64 + 52 * Math.sin(-0.7)); ctx.stroke();
      ctx.fillStyle = '#a8ffce';
      [[86, 44], [44, 82], [78, 90], [52, 38]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 6.283); ctx.fill(); });
    });
  }
  function fishfinderTexture() {
    return H.canvasTex(128, 96, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#123a52'); g.addColorStop(1, '#0a2233');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7fc8f0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 70);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, 70 + Math.sin(x * 0.15) * 6);
      ctx.stroke();
      ctx.fillStyle = '#f0a04c';
      [[30, 40], [58, 52], [86, 34], [104, 48]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 4, Math.PI, 0); ctx.fill();
      });
      ctx.fillStyle = '#bfe6f5'; ctx.font = '10px monospace';
      ctx.fillText('12.4m', 6, 14);
    });
  }
  function chartTexture() {
    return H.canvasTex(128, 160, (ctx, w, h) => {
      ctx.fillStyle = '#e8e2c8'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#8a9ab0'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * w / 6, 0); ctx.lineTo(i * w / 6, h); ctx.stroke(); }
      ctx.strokeStyle = '#5d7a8a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, 20);
      ctx.bezierCurveTo(50, 30, 40, 80, 90, 100);
      ctx.bezierCurveTo(110, 110, 100, 140, 70, 150);
      ctx.stroke();
      ctx.fillStyle = '#c9d8c0';
      ctx.beginPath(); ctx.moveTo(10, 20); ctx.bezierCurveTo(50, 30, 40, 80, 90, 100); ctx.lineTo(120, 60); ctx.lineTo(120, 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#46565c'; ctx.font = '9px serif';
      ctx.fillText('12', 30, 60); ctx.fillText('8', 60, 120); ctx.fillText('5', 95, 75);
      ctx.strokeStyle = '#d95f4c'; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(20, 140); ctx.lineTo(100, 30); ctx.stroke();
    });
  }
  function tideTexture() {
    return H.canvasTex(96, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f4f1e4'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#46565c'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText('潮汐表', 22, 16);
      ctx.strokeStyle = '#9fb0aa'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = 30 + i * 16;
        ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(88, y); ctx.stroke();
        ctx.fillStyle = '#5d7078'; ctx.font = '8px monospace';
        ctx.fillText(['04:12', '08:36', '12:58', '17:24', '21:40', '23:55'][i], 12, y + 11);
        ctx.fillText(['1.8m', '0.6m', '1.9m', '0.4m', '1.7m', '0.7m'][i], 56, y + 11);
      }
    });
  }
  function photoTexture() {
    return H.canvasTex(96, 72, (ctx, w, h) => {
      ctx.fillStyle = '#f6f8f5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4d8fb8'; ctx.fillRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#2e6a8f'; ctx.fillRect(5, h * 0.6, w - 10, h * 0.4 - 5);
      ctx.fillStyle = '#e8f2ee';
      ctx.beginPath(); ctx.ellipse(48, 36, 24, 11, -0.15, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.moveTo(70, 34); ctx.lineTo(84, 24); ctx.lineTo(84, 44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#33383a'; ctx.beginPath(); ctx.arc(32, 33, 2.4, 0, 6.283); ctx.fill();
    });
  }

  function cabinInterior(cab, w, l, h, seed) {
    const rnd = H.mulberry32(seed);
    const floorY = 0.02;
    // 地板
    box(w - 0.06, 0.03, l - 0.06, toon(0xc9b99a), 0, floorY, 0, cab);
    // 控制台（朝船头 +z）
    const consZ = l / 2 - 0.16;
    const cons = box(w * 0.72, 0.4, 0.2, toon(0xe8ebe6), 0, floorY + 0.2, consZ, cab);
    box(w * 0.72, 0.03, 0.24, toon(0x8a9a94), 0, floorY + 0.415, consZ, cab);
    // 船舵
    const wheelG = grp(-w * 0.14, floorY + 0.52, consZ - 0.13, cab);
    wheelG.rotation.x = -0.35;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 18), toon(0x8a6242));
    wheelG.add(wheel);
    for (let i = 0; i < 3; i++) {
      const sp = box(0.018, 0.21, 0.018, toon(0x8a6242), 0, 0, 0, wheelG);
      sp.rotation.z = i * Math.PI / 3;
    }
    cyl(0.025, 0.025, 0.05, 8, toon(P.goldDeep), 0, 0, 0.02, wheelG).rotation.x = Math.PI / 2;
    // 雷达屏（朝向舵位/舱尾，微微上仰）
    const radar = H.plane(0.17, 0.14, new THREE.MeshBasicMaterial({ map: radarTexture() }), w * 0.16, floorY + 0.5, consZ - 0.15, cab);
    radar.rotation.set(0.25, Math.PI, 0);
    box(0.19, 0.16, 0.03, toon(0x46565c), w * 0.16, floorY + 0.5, consZ - 0.115, cab).rotation.x = -0.25;
    // 鱼探仪
    const ff = H.plane(0.13, 0.1, new THREE.MeshBasicMaterial({ map: fishfinderTexture() }), -w * 0.3, floorY + 0.47, consZ - 0.15, cab);
    ff.rotation.set(0.2, Math.PI, 0);
    box(0.15, 0.12, 0.03, toon(0x3a4245), -w * 0.3, floorY + 0.47, consZ - 0.115, cab).rotation.x = -0.2;
    // 屏幕微光
    const screenGlowTex = H.canvasTex(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(140,255,190,0.55)');
      g.addColorStop(1, 'rgba(140,255,190,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const rg = new THREE.Sprite(new THREE.SpriteMaterial({ map: screenGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    rg.scale.set(0.3, 0.26, 1);
    rg.position.set(w * 0.16, floorY + 0.5, consZ - 0.18);
    cab.add(rg);
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ map: screenGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x9fd8ff }));
    fg.scale.set(0.24, 0.2, 1);
    fg.position.set(-w * 0.3, floorY + 0.47, consZ - 0.18);
    cab.add(fg);
    // 海图夹板（挂在侧壁）
    const chart = H.plane(0.17, 0.22, new THREE.MeshBasicMaterial({ map: chartTexture() }), -w / 2 + 0.02, floorY + 0.42, -l * 0.1, cab);
    chart.rotation.y = Math.PI / 2;
    box(0.02, 0.03, 0.1, toon(0x8a6242), -w / 2 + 0.015, floorY + 0.54, -l * 0.1, cab);
    // 潮汐表
    const tide = H.plane(0.1, 0.14, new THREE.MeshBasicMaterial({ map: tideTexture() }), -w / 2 + 0.02, floorY + 0.4, -l * 0.1 + 0.24, cab);
    tide.rotation.y = Math.PI / 2;
    // 保温壶 + 搪瓷杯（后部小架）
    const shelfZ = -l / 2 + 0.14;
    box(w * 0.5, 0.03, 0.18, toon(0xb9c2ba), w * 0.18, floorY + 0.24, shelfZ, cab);
    const thermos = cyl(0.035, 0.038, 0.17, 10, toon(P.thermos), w * 0.1, floorY + 0.34, shelfZ, cab);
    cyl(0.03, 0.035, 0.03, 10, toon(0x6e7a7e), w * 0.1, floorY + 0.44, shelfZ, cab);
    const mug = cyl(0.028, 0.026, 0.06, 10, toon(P.enamel), w * 0.26, floorY + 0.29, shelfZ + 0.02, cab);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 5, 12), toon(P.enamelRim));
    rim.position.set(w * 0.26, floorY + 0.32, shelfZ + 0.02); rim.rotation.x = Math.PI / 2; cab.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 5, 10, Math.PI), toon(P.enamelRim));
    handle.position.set(w * 0.29, floorY + 0.29, shelfZ + 0.02); handle.rotation.y = Math.PI / 2; cab.add(handle);
    // 黄雨衣（钩上）
    const hookX = w / 2 - 0.03, hookZ = l * 0.05;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 5, 8, Math.PI), toon(P.iron));
    hook.position.set(hookX, floorY + 0.6, hookZ); hook.rotation.y = Math.PI / 2; cab.add(hook);
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 8), toon(P.raincoat));
    coat.position.set(hookX - 0.03, floorY + 0.44, hookZ);
    coat.scale.set(0.75, 1, 0.6);
    coat.castShadow = true;
    cab.add(coat);
    sph(0.045, toon(P.raincoat), hookX - 0.03, floorY + 0.6, hookZ, cab, 8, 6);
    // 护身符（窗边）
    const om = box(0.035, 0.05, 0.012, toon(P.omamori), w * 0.28, floorY + 0.55, consZ - 0.02, cab);
    box(0.035, 0.012, 0.014, toon(P.goldDeep), w * 0.28, floorY + 0.565, consZ - 0.02, cab);
    cyl(0.003, 0.003, 0.06, 4, toon(P.goldDeep), w * 0.28, floorY + 0.61, consZ - 0.02, cab);
    // 渔获照片
    const photo = H.plane(0.1, 0.075, new THREE.MeshBasicMaterial({ map: photoTexture() }), w / 2 - 0.02, floorY + 0.5, -l * 0.22, cab);
    photo.rotation.y = -Math.PI / 2;
    // 座椅
    box(w * 0.4, 0.06, 0.22, toon(0xd9ddd6), -w * 0.15, floorY + 0.22, -l * 0.28, cab);
    box(w * 0.4, 0.2, 0.05, toon(0xd9ddd6), -w * 0.15, floorY + 0.32, -l * 0.28 - 0.1, cab);
    // 舱内暖光
    const pl = new THREE.PointLight(0xffe6b0, 0.4, 1.8, 2);
    pl.position.set(0, floorY + h - 0.1, 0);
    cab.add(pl);
    return { wheel: wheelG, radar: radar };
  }

  // ---------- 驾驶舱外壳 ----------
  function buildCabin(parent, w, l, h, y, doorSide, seed) {
    const cab = grp(0, y, 0, parent);
    const wallM = toon(0xf2f5f0);
    const frameM = toon(0x9fb0aa);
    const sillH = 0.24, lintelH = 0.14;
    // 前后墙（带窗洞）
    [-1, 1].forEach(function (sz) {
      const z = sz * l / 2;
      box(w, sillH, 0.04, wallM, 0, sillH / 2, z, cab);
      box(w, lintelH, 0.04, wallM, 0, h - lintelH / 2, z, cab);
      box(0.06, h - sillH - lintelH, 0.04, wallM, -w / 2 + 0.03, sillH + (h - sillH - lintelH) / 2, z, cab);
      box(0.06, h - sillH - lintelH, 0.04, wallM, w / 2 - 0.03, sillH + (h - sillH - lintelH) / 2, z, cab);
      const gl = H.plane(w - 0.12, h - sillH - lintelH, glassMat, 0, sillH + (h - sillH - lintelH) / 2, z, cab);
      gl.renderOrder = 12;
      box(w - 0.1, 0.025, 0.05, frameM, 0, sillH, z, cab);
    });
    // 侧墙：一侧开门
    [-1, 1].forEach(function (sx) {
      const x = sx * w / 2;
      if (sx === doorSide) {
        // 门洞（宽 0.34，靠后）
        const doorZ = -l * 0.18, doorW = 0.36;
        box(0.04, h, l / 2 - doorW / 2 + doorZ, wallM, x, h / 2, (-l / 2 + (doorZ - doorW / 2)) / 2, cab);
        box(0.04, h, l / 2 - doorW / 2 - doorZ, wallM, x, h / 2, (l / 2 + (doorZ + doorW / 2)) / 2, cab);
        box(0.04, lintelH, doorW, wallM, x, h - lintelH / 2, doorZ, cab);
        // 敞开的门
        const door = grp(x, 0, doorZ - doorW / 2, cab);
        door.rotation.y = sx * 1.15;
        const dp = box(0.035, h - 0.06, doorW, toon(0xe8ebe6), sx * 0.02, (h - 0.06) / 2, doorW / 2, door);
        const dw = H.plane(doorW - 0.1, h * 0.4, glassMat, sx * 0.045, h * 0.58, doorW / 2, door);
        dw.rotation.y = Math.PI / 2; dw.renderOrder = 12;
        box(0.02, 0.05, 0.02, toon(P.iron), sx * 0.05, h * 0.42, doorW - 0.06, door);
      } else {
        box(0.04, sillH, l, wallM, x, sillH / 2, 0, cab);
        box(0.04, lintelH, l, wallM, x, h - lintelH / 2, 0, cab);
        box(0.04, h - sillH - lintelH, 0.06, wallM, x, sillH + (h - sillH - lintelH) / 2, -l / 2 + 0.03, cab);
        box(0.04, h - sillH - lintelH, 0.06, wallM, x, sillH + (h - sillH - lintelH) / 2, l / 2 - 0.03, cab);
        box(0.04, h - sillH - lintelH, 0.05, wallM, x, sillH + (h - sillH - lintelH) / 2, 0, cab);
        const gl = H.plane(l - 0.12, h - sillH - lintelH, glassMat, x, sillH + (h - sillH - lintelH) / 2, 0, cab);
        gl.rotation.y = Math.PI / 2; gl.renderOrder = 12;
      }
    });
    // 顶棚
    const roof = box(w + 0.1, 0.06, l + 0.12, toon(0xeef1ec), 0, h + 0.03, 0, cab);
    roof.castShadow = true; roof.receiveShadow = true;
    outline(roof, 0.015);
    box(w + 0.1, 0.025, l + 0.12, toon(0xc9d4ce), 0, h + 0.065, 0, cab);
    cabinInterior(cab, w, l, h, seed);
    return cab;
  }

  // ---------- 整船 ----------
  function makeBoat(cfg) {
    const root = grp(cfg.x, L.waterY, cfg.z, null, cfg.ry);
    const bob = grp(0, 0, 0, root);
    const hullData = makeHull({ len: cfg.len, beam: cfg.beam, freeboard: cfg.fb, draft: cfg.draft });
    const hullMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: boatTexture(cfg.seed, cfg.stripe), side: THREE.DoubleSide });
    const hull = new THREE.Mesh(hullData.hull, hullMat);
    hull.castShadow = true; hull.receiveShadow = true;
    bob.add(hull);
    outline(hull, 0.02);
    const deck = new THREE.Mesh(hullData.deck, toon(cfg.deckColor || 0xdfe5de, { side: THREE.DoubleSide }));
    deck.receiveShadow = true;
    bob.add(deck);
    // 舷缘护条
    const gunPts = [];
    hullData.stations.forEach(function (s) { gunPts.push(new THREE.Vector3(-s.hw, s.top + 0.01, (s.t - 0.5) * cfg.len)); });
    hullData.stations.slice().reverse().forEach(function (s) { gunPts.push(new THREE.Vector3(s.hw, s.top + 0.01, (s.t - 0.5) * cfg.len)); });
    const gun = H.tubeAlong(gunPts, 0.028, toon(cfg.gunColor || 0xc9d4ce), 40);
    bob.add(gun);
    // 船舷积聚的雨珠
    const beadM = new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff6dd) });
    for (let i = 0; i < 7; i++) {
      const s = hullData.stations[1 + (i % 4)];
      const side = i % 2 ? 1 : -1;
      const bead = sph(0.008 + (i % 3) * 0.003, beadM, side * s.hw, s.top + 0.03, (s.t - 0.5) * cfg.len + 0.05, bob, 5, 4);
      bead.castShadow = false;
    }

    const fb = cfg.fb;
    if (cfg.cabin) {
      const cw = cfg.beam * 0.78, cl = cfg.len * (cfg.cabinLen || 0.42), ch = cfg.cabinH || 0.72;
      const cab = buildCabin(bob, cw, cl, ch, fb - 0.02, cfg.doorSide || 1, cfg.seed + 5);
      cab.position.z = cfg.cabinZ || 0;
      H.refs['cabin_' + cfg.id] = cab;
      // 桅杆 + 雷达罩 + 天线
      const mastZ = (cfg.cabinZ || 0) + cl * 0.2;
      const mast = cyl(0.025, 0.035, 0.85, 8, toon(0xe8ebe6), 0, fb + ch + 0.45, mastZ, bob);
      const radarDome = sph(0.09, toon(0xf6f8f5), 0, fb + ch + 0.72, mastZ, bob, 10, 8);
      radarDome.scale.y = 0.7;
      cyl(0.008, 0.008, 0.5, 5, toon(P.iron), 0.12, fb + ch + 0.6, mastZ - 0.1, bob);
      cyl(0.008, 0.008, 0.36, 5, toon(P.iron), -0.1, fb + ch + 0.55, mastZ - 0.15, bob).rotation.z = 0.15;
      // 遮阳铁架
      const frameM = toon(0x8a9a94);
      const fz = (cfg.cabinZ || 0) - cl / 2 - 0.35;
      [[-cfg.beam * 0.36, fz], [cfg.beam * 0.36, fz], [-cfg.beam * 0.36, fz - 0.55], [cfg.beam * 0.36, fz - 0.55]].forEach(function (p) {
        cyl(0.018, 0.018, 0.62, 6, frameM, p[0], fb + 0.31, p[1], bob);
      });
      box(cfg.beam * 0.76, 0.02, 0.6, frameM, 0, fb + 0.62, fz - 0.27, bob);
      // 顶棚粼光面（fx 注册）
      H.anim.causticTargets = H.anim.causticTargets || [];
      H.anim.causticTargets.push({ parent: bob, x: 0, y: fb + ch + 0.075, z: cfg.cabinZ || 0, w: cw + 0.06, h: cl + 0.08, rotX: -Math.PI / 2 });
      lifeRing(bob, cfg.beam * 0.42, fb + 0.3, (cfg.cabinZ || 0) + 0.1, Math.PI / 2);
    } else {
      // 开放式小渔船：座板、机器、桅杆
      box(cfg.beam * 0.8, 0.05, 0.2, toon(0xc9b99a), 0, fb - 0.08, cfg.len * 0.1, bob);
      box(cfg.beam * 0.8, 0.05, 0.2, toon(0xc9b99a), 0, fb - 0.08, -cfg.len * 0.18, bob);
      const motor = grp(0, fb + 0.05, -cfg.len / 2 - 0.06, bob);
      box(0.16, 0.2, 0.22, toon(0x46565c), 0, 0.1, 0, motor);
      cyl(0.03, 0.03, 0.4, 6, toon(P.iron), 0, -0.15, 0.05, motor);
      box(0.05, 0.04, 0.16, toon(P.iron), 0, -0.34, 0.1, motor);
      cyl(0.02, 0.03, 0.6, 6, toon(0xe8ebe6), 0, fb + 0.3, cfg.len * 0.22, bob);
      cyl(0.006, 0.006, 0.34, 4, toon(P.iron), 0.08, fb + 0.42, cfg.len * 0.22, bob).rotation.z = 0.2;
      const bucket = cyl(0.08, 0.065, 0.12, 10, toon(0x4d8fb8), cfg.beam * 0.22, fb - 0.04, -cfg.len * 0.05, bob);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 14), toon(P.rope));
      coil.position.set(-cfg.beam * 0.24, fb - 0.06, cfg.len * 0.05);
      coil.rotation.x = Math.PI / 2; coil.scale.y = 0.6;
      bob.add(coil);
      lifeRing(bob, cfg.beam * 0.44, fb + 0.16, -cfg.len * 0.05, Math.PI / 2);
    }
    // 护舷轮胎与系缆桩
    const fenderSide = cfg.fenderSide || 1;
    tireFender(bob, fenderSide * cfg.beam * 0.52, 0.08, cfg.len * 0.16, Math.PI / 2);
    tireFender(bob, fenderSide * cfg.beam * 0.52, 0.08, -cfg.len * 0.2, Math.PI / 2);
    cleat(bob, 0, fb + 0.05, cfg.len * 0.42);
    cleat(bob, 0, fb + 0.05, -cfg.len * 0.42);
    // 船名小牌
    const nameTex = H.canvasTex(128, 32, (ctx, w, h) => {
      ctx.fillStyle = '#f6f8f5'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a4d54'; ctx.font = 'bold 18px "Yu Mincho", "SimSun", serif';
      ctx.textAlign = 'center'; ctx.fillText(cfg.name, 64, 23);
    });
    const nameP = H.plane(0.4, 0.1, new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }), 0, fb * 0.4, -cfg.len / 2 - 0.012, bob);
    nameP.rotation.y = Math.PI;

    root.userData = { bob: bob, cfg: cfg, hullTop: fb };
    return root;
  }

  function buildBoats(scene) {
    const boatsG = grp(0, 0, 0, scene);
    H.refs.boatsGroup = boatsG;
    H.refs.boats = {};

    // D：左臂小驾驶舱船
    const D = makeBoat({ id: 'D', x: -3.32, z: 1.7, ry: 0, len: 2.9, beam: 1.0, fb: 0.36, draft: 0.26, seed: 41, stripe: '#2e7f8f', cabin: true, cabinLen: 0.46, cabinH: 0.66, cabinZ: -0.1, doorSide: -1, fenderSide: -1, name: '第三丸' });
    boatsG.add(D); H.refs.boats.D = D;
    // B：左臂游钓船
    const B = makeBoat({ id: 'B', x: -3.28, z: -2.5, ry: 0, len: 3.6, beam: 1.24, fb: 0.42, draft: 0.3, seed: 52, stripe: '#4d8fb8', cabin: true, cabinLen: 0.44, cabinH: 0.76, cabinZ: 0.15, doorSide: -1, fenderSide: -1, name: '海風' });
    boatsG.add(B); H.refs.boats.B = B;
    // A：前景开放小渔船
    const A = makeBoat({ id: 'A', x: 0.6, z: 3.28, ry: -Math.PI / 2, len: 2.6, beam: 0.94, fb: 0.34, draft: 0.24, seed: 63, stripe: '#d95f4c', cabin: false, fenderSide: -1, name: '小汐' });
    boatsG.add(A); H.refs.boats.A = A;
    // C：最外侧泊位，带驾驶舱白色渔船（会出港）
    const C = makeBoat({ id: 'C', x: 4.2, z: 3.12, ry: Math.PI / 2, len: 3.4, beam: 1.14, fb: 0.4, draft: 0.28, seed: 74, stripe: '#2e7f8f', cabin: true, cabinLen: 0.4, cabinH: 0.72, cabinZ: 0.35, doorSide: 1, fenderSide: -1, name: '汐風丸' });
    boatsG.add(C); H.refs.boats.C = C;

    // ---------- 倒扣木舢板（半拖上岸，斜支在滑道上，船尾搁在堤岸边缘） ----------
    const sampanOuter = grp(8.85, 1.12, 3.6, scene, 0.15);
    sampanOuter.rotation.x = -0.18;
    const sampanG = grp(0, 0, 0, sampanOuter);
    sampanG.rotation.z = Math.PI;      // 倒扣
    const sd = makeHull({ len: 2.1, beam: 0.78, freeboard: 0.26, draft: 0.2 });
    const sampan = new THREE.Mesh(sd.hull, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: H.gradientMap, map: woodTexture(), side: THREE.DoubleSide }));
    sampan.castShadow = true; sampan.receiveShadow = true;
    sampanG.add(sampan);
    outline(sampan, 0.02);
    // 龙骨与肋材（朝上）
    box(0.06, 0.05, 1.9, toon(P.woodDark), 0, -0.21, 0, sampanG);
    for (let i = -2; i <= 2; i++) box(0.62, 0.04, 0.05, toon(P.woodDark), 0, -0.16, i * 0.36, sampanG);
    H.refs.sampan = sampanOuter;
    // 舢板缆绳到岸边系环
    const spRope = H.tubeAlong([
      new THREE.Vector3(8.7, 0.72, 2.65), new THREE.Vector3(8.9, 0.85, 3.5), new THREE.Vector3(9.35, 1.04, 4.35)
    ], 0.022, toon(P.ropeWet), 16);
    scene.add(spRope);

    // 缆绳（分段，可动态）
    H.anim.ropes = [];
    function makeRope(p0, p1, sag, boatRef) {
      const n = 10;
      const links = [];
      const gR = grp(0, 0, 0, scene);
      const dryM = toon(P.rope), wetM = toon(P.ropeWet);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1, 5), dryM);
        m.castShadow = true;
        gR.add(m);
        links.push(m);
      }
      const rope = { group: gR, links: links, p0: p0.clone(), p1: p1.clone(), sag: sag, boat: boatRef, dryM: dryM, wetM: wetM };
      H.anim.ropes.push(rope);
      return rope;
    }
    H.makeRope = makeRope;
    // 各船缆绳：船端随船摇晃，岸端固定于系船柱（props 中设置 p1）
    H.refs.ropeAnchors = {
      D: [new THREE.Vector3(-4.88, 1.32, 2.6), new THREE.Vector3(-4.88, 1.32, 0.6)],
      B: [new THREE.Vector3(-4.88, 1.32, -1.5), new THREE.Vector3(-4.88, 1.32, -3.6)],
      A: [new THREE.Vector3(-1.8, 1.32, 4.88), new THREE.Vector3(3.4, 1.32, 4.88)],
      C: [new THREE.Vector3(5.2, 1.32, 4.88), new THREE.Vector3(3.4, 1.32, 4.88)]
    };
    ['D', 'B', 'A', 'C'].forEach(function (id) {
      const bt = H.refs.boats[id];
      const cfg = bt.userData.cfg;
      const anchors = H.refs.ropeAnchors[id];
      makeRope(new THREE.Vector3(), anchors[0], 0.32, { boat: bt, local: new THREE.Vector3(0, cfg.fb + 0.05, cfg.len * 0.42) });
      makeRope(new THREE.Vector3(), anchors[1], 0.32, { boat: bt, local: new THREE.Vector3(0, cfg.fb + 0.05, -cfg.len * 0.42) });
    });

    return boatsG;
  }

  H.buildBoats = buildBoats;
  H.glassMat = glassMat;
})(window.HARBOR);