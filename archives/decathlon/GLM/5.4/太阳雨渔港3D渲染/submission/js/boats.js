/* ============================================================
   boats.js — 渔船 / 驾驶舱内部 / 泊位
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  /* ---------------- 船体贴图 ---------------- */
  S.texHull = function (w, h, opt) {
    opt = opt || {};
    const base = opt.base || [232, 236, 232];
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const rnd = S.mulberry32(opt.seed || 3);
    S._pixelFill(ctx, w, h, (x, y, o) => {
      const nx = x / w, ny = y / h;
      let v = 1 + (S.fbm(nx * 14, ny * 5, 4) - 0.5) * 0.05;
      const keel = Math.pow(Math.abs(nx - 0.5) * 2, 3);
      v *= 1 - keel * 0.10;
      o[0] = base[0] * v; o[1] = base[1] * v; o[2] = base[2] * v;
    });
    const rustCols = [0.30, 0.36, 0.62, 0.68];
    for (const rc of rustCols) {
      const n = 3 + (rnd() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const x = (rc + (rnd() - 0.5) * 0.06) * w;
        const y = rnd() * h * 0.7;
        const len = h * (0.08 + rnd() * 0.22);
        const wd = w * (0.004 + rnd() * 0.012);
        const g = ctx.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, `rgba(150,84,46,${0.30 + rnd() * 0.25})`);
        g.addColorStop(1, 'rgba(150,84,46,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, wd, len);
      }
    }
    for (let i = 0; i < 12; i++) {
      const x = rnd() * w, y = rnd() * h;
      const r = (0.02 + rnd() * 0.05) * w;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(120,130,128,${0.05 + rnd() * 0.07})`);
      g.addColorStop(1, 'rgba(120,130,128,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    }
    return c;
  };

  S.texDeck = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#e6e8e2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150,158,152,0.30)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 7) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
    const rnd = S.mulberry32(11);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${100 + rnd() * 60},${110 + rnd() * 60},${105 + rnd() * 60},${rnd() * 0.12})`;
      ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 8, 1 + rnd() * 4);
    }
    return c;
  };

  /* ---------------- 船体几何 ---------------- */
  function hbAt(t, B) {
    if (t < 0.34) return B * 0.5 * (0.84 + 0.16 * Math.sin(t / 0.34 * Math.PI / 2));
    const u = (t - 0.34) / 0.66;
    return B * 0.5 * Math.sqrt(Math.max(0, 1 - u * u));
  }
  function shAt(t) { return 0.55 + 0.26 * Math.pow(t, 1.8); }
  function dpAt(t, D) { return D * (0.95 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.08))); }

  S.hullGeo = function (L, B, D, opt) {
    opt = opt || {};
    const stations = opt.stations || 18, m = opt.m || 18;
    const rings = [];
    for (let i = 0; i <= stations; i++) {
      const t = i / stations;
      const z = -L / 2 + t * L;
      const hb = hbAt(t, B), sh = shAt(t), dp = dpAt(t, D);
      const ring = [];
      for (let k = 0; k <= m; k++) {
        const a = k / m * Math.PI;
        ring.push([hb * Math.cos(a), sh - dp * Math.pow(Math.sin(a), 0.72), z]);
      }
      rings.push(ring);
    }
    const g = S.loft(rings, false);
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const vi = Math.floor(i / (m + 1));
      const vj = i % (m + 1);
      uv[i * 2] = vj / m;
      uv[i * 2 + 1] = vi / stations;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };

  S.hullStripe = function (L, B, D, yLevel, height, out) {
    const stations = 22, m = 10;
    const pos = [], idx = [];
    for (let i = 0; i <= stations; i++) {
      const t = i / stations;
      const z = -L / 2 + t * L;
      const hb = hbAt(t, B), sh = shAt(t), dp = dpAt(t, D);
      for (let k = 0; k <= m; k++) {
        const a0 = Math.PI * (0.05 + 0.90 * (k / m));
        const ring = [];
        for (const dy of [0, height]) {
          const yy = yLevel + dy;
          const s = S.clamp((sh - yy) / dp, 0, 1);
          const aa = Math.asin(Math.pow(s, 1 / 0.72));
          ring.push([Math.cos(aa) * hb * (1 + out), yy, z]);
        }
        // 只取一侧到另一侧，按 a0 展开
        const hb2 = hb * (1 + out);
        const s = S.clamp((sh - yLevel) / dp, 0, 1);
        const aa = Math.asin(Math.pow(s, 1 / 0.72));
        pos.push(Math.cos(a0) * hb2 * 1.0, yLevel, z);
        pos.push(Math.cos(a0) * hb2 * 1.0, yLevel + height, z);
      }
    }
    const stride = (m + 1) * 2;
    for (let i = 0; i < stations; i++) {
      for (let k = 0; k < m; k++) {
        const a = i * stride + k * 2, b = a + 1, c = a + stride, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  /* ---------------- 小零件材质 ---------------- */
  const MB = {};
  S.initBoatMats = function () {
    if (MB.ready) return;
    MB.ready = true;
    MB.hull = S.toon(0xffffff, {
      map: S.tex(S.texHull(512, 256, { seed: 21 })),
      spec: 0.45, shin: 55, rim: 0.16, rimPow: 3.0
    });
    MB.hull2 = S.toon(0xffffff, {
      map: S.tex(S.texHull(512, 256, { seed: 47, base: [226, 231, 229] })),
      spec: 0.45, shin: 55, rim: 0.16, rimPow: 3.0
    });
    MB.deck = S.toon(0xffffff, { map: S.tex(S.texDeck(256, 256), { repeat: [2, 3] }), spec: 0.22, shin: 30 });
    MB.white = S.toon(0xe6ecea, { spec: 0.42, shin: 55, rim: 0.14 });
    MB.cabin = S.toon(0xd3dfe2, { spec: 0.40, shin: 55, rim: 0.14 });
    MB.cream = S.toon(0xdcd6c4, { spec: 0.3, shin: 40 });
    MB.navy = S.toon(0x2c4a5e, { spec: 0.35, shin: 45 });
    MB.teal = S.toon(0x3f8f9c, { spec: 0.35, shin: 45 });
    MB.red = S.toon(0xc9553f, { spec: 0.35, shin: 45 });
    MB.metal = S.toon(0x8d999e, { spec: 0.6, shin: 60, rim: 0.12 });
    MB.darkMetal = S.toon(0x4c565a, { spec: 0.5, shin: 40 });
    MB.rust = S.toon(0xffffff, {
      map: S.tex(S.texRust(256, 256, { base: [140, 146, 148], rust: [152, 86, 48], lo: 0.45, hi: 0.68 })),
      spec: 0.35, shin: 30
    });
    MB.glass = new THREE.MeshPhysicalMaterial({
      color: 0xd8f0f2, transparent: true, opacity: 0.16, roughness: 0.05,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 1.0, clearcoatRoughness: 0.05
    });
    MB.tire = S.toon(0x2c3234, { spec: 0.25, shin: 16 });
    MB.orange = S.toon(0xf07a3c, { spec: 0.3, shin: 30 });
    MB.wood = S.toon(0xffffff, { map: S.tex(S.texWood(256, 256, { base: [176, 132, 92] }), { repeat: [2, 2] }), spec: 0.15 });
    MB.woodDark = S.toon(0x8a623d, { spec: 0.12 });
    MB.rope = S.toon(0xd4713f, { spec: 0.1 });
    MB.yellow = S.toon(0xe8c24a, { spec: 0.25, shin: 30 });
    MB.screenRadar = new THREE.MeshBasicMaterial({ map: S.tex(S.texRadar(256, 256)) });
    MB.screenFish = new THREE.MeshBasicMaterial({ map: S.tex(S.texFishFinder(256, 256)) });
    MB.chart = new THREE.MeshBasicMaterial({ map: S.tex(S.texChart(256, 256)) });
    MB.cushion = S.toon(0x4a7d8c, { spec: 0.15 });
  };

  /* ---------------- 仪表贴图 ---------------- */
  S.texRadar = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#0c2a26'; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = w * 0.46;
    ctx.strokeStyle = 'rgba(90,220,170,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, 6.28); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(-0.6, cx, cy);
      g.addColorStop(0, 'rgba(120,255,200,0.55)');
      g.addColorStop(0.20, 'rgba(120,255,200,0.0)');
      g.addColorStop(1, 'rgba(120,255,200,0.0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fill();
    }
    const rnd = S.mulberry32(9);
    for (let i = 0; i < 22; i++) {
      const a = rnd() * 6.28, r = Math.pow(rnd(), 0.6) * R * 0.9;
      ctx.fillStyle = `rgba(160,255,210,${0.25 + rnd() * 0.6})`;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    ctx.fillStyle = 'rgba(150,255,205,0.85)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('RADAR  12nm', 8, 16);
    ctx.fillText('HDG 042', 8, h - 10);
    return c;
  };

  S.texFishFinder = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#123a4a'); g.addColorStop(0.55, '#1d5d6d'); g.addColorStop(1, '#0a2028');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = S.mulberry32(31);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(255,190,90,${0.35 + rnd() * 0.5})`;
      const x = rnd() * w, y = h * 0.3 + rnd() * h * 0.45;
      ctx.beginPath(); ctx.arc(x, y, 1.2 + rnd() * 2.2, 0, 6.28); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.78 + Math.sin(x * 0.06) * 10 + Math.sin(x * 0.19) * 5);
    ctx.strokeStyle = 'rgba(180,240,220,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(180,255,220,0.9)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('FISH  38.5m', 8, 16);
    ctx.fillText('TMP 17.2', 8, h - 10);
    return c;
  };

  S.texChart = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f3f0e4'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,120,140,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * h / 8); ctx.lineTo(w, i * h / 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * w / 8, 0); ctx.lineTo(i * w / 8, h); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h * 0.25);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * 0.25 + Math.sin(x * 0.045) * 22 + Math.sin(x * 0.11) * 8);
    ctx.strokeStyle = 'rgba(60,90,110,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(120,170,190,0.30)';
    ctx.fillRect(0, h * 0.25, w, h);
    ctx.fillStyle = 'rgba(60,80,90,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('潮汐表  TIDE TABLE', 6, 14);
    ctx.fillText('大潮  08:42  18:07', 6, 30);
    ctx.fillText('小潮  02:15  14:33', 6, 44);
    return c;
  };

  S.texCharm = function (w, h) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f0e6d0'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(4, 4, w - 8, h * 0.34);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px serif'; ctx.textAlign = 'center';
    ctx.fillText('大漁', w / 2, h * 0.26);
    ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 11px serif';
    ctx.fillText('安全', w / 2, h * 0.56);
    ctx.fillText('祈念', w / 2, h * 0.74);
    return c;
  };

  S.texPhoto = function (w, h, seed) {
    const c = S.makeCanvas(w, h), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#bfe0ea'); g.addColorStop(0.6, '#8fc4cf'); g.addColorStop(1, '#5a8f9c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(w * 0.4, h * 0.55, w * 0.28, h * 0.2, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#3b6b7a';
    ctx.fillRect(w * 0.2, h * 0.7, w * 0.5, h * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('平成' + (10 + seed * 3) + '年 ' + (3 + seed * 4) + '月', w / 2, h - 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
    return c;
  };

  /* ---------------- 驾驶舱内部 ---------------- */
  S.makeCabinInterior = function (opt) {
    const g = new THREE.Group();
    const w = opt.w, d = opt.d, h = opt.h;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.03, d - 0.06), MB.wood);
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    g.add(floor);

    const dashY = 0.62;
    const dash = new THREE.Mesh(S.rbox(w - 0.12, 0.30, 0.30, 0.04), MB.cream);
    dash.position.set(0, dashY, -d / 2 + 0.22);
    dash.castShadow = true; dash.receiveShadow = true;
    g.add(dash);
    const dashTop = new THREE.Mesh(S.rbox(w - 0.10, 0.05, 0.40, 0.02), MB.woodDark);
    dashTop.position.set(0, dashY + 0.17, -d / 2 + 0.24);
    g.add(dashTop);

    const scr1 = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.20), MB.screenRadar);
    scr1.position.set(-0.28, dashY + 0.10, -d / 2 + 0.38);
    scr1.rotation.x = -0.25;
    g.add(scr1);
    const scr2 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), MB.screenFish);
    scr2.position.set(0.02, dashY + 0.10, -d / 2 + 0.38);
    scr2.rotation.x = -0.25;
    g.add(scr2);
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffcf6a : 0x8ef0c0 }));
      lamp.position.set(-0.55 + i * 0.09, dashY + 0.26, -d / 2 + 0.40);
      lamp.rotation.x = -0.25;
      g.add(lamp);
    }

    // 舵轮
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 6, 20), MB.darkMetal);
    wheel.add(rim);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(S.cyl(0.010, 0.010, 0.28, 5), MB.darkMetal);
      sp.rotation.z = i * Math.PI / 3;
      wheel.add(sp);
    }
    const hub = new THREE.Mesh(S.cyl(0.03, 0.03, 0.05, 8), MB.metal);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheel.position.set(-0.22, dashY - 0.02, -d / 2 + 0.52);
    wheel.rotation.x = -0.35;
    g.add(wheel);

    // 座椅
    const seat = new THREE.Group();
    const cushion = new THREE.Mesh(S.rbox(0.36, 0.08, 0.36, 0.03), MB.cushion);
    cushion.position.y = 0.42; seat.add(cushion);
    const back = new THREE.Mesh(S.rbox(0.36, 0.42, 0.08, 0.03), MB.cushion);
    back.position.set(0, 0.63, 0.16); back.rotation.x = 0.12; seat.add(back);
    const post = new THREE.Mesh(S.cyl(0.035, 0.035, 0.42, 6), MB.darkMetal);
    post.position.y = 0.21; seat.add(post);
    seat.position.set(-0.22, 0, -d / 2 + 0.95);
    seat.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(seat);

    // 海图板
    const chartFrame = new THREE.Mesh(S.rbox(0.58, 0.46, 0.02, 0.01), MB.woodDark);
    chartFrame.position.set(0.34, 0.95, -d / 2 + 0.02);
    g.add(chartFrame);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.40), MB.chart);
    chart.position.set(0.34, 0.95, -d / 2 + 0.035);
    g.add(chart);
    for (const cx of [0.18, 0.50]) {
      const clip = new THREE.Mesh(S.rbox(0.05, 0.03, 0.03, 0.008), MB.metal);
      clip.position.set(cx, 1.17, -d / 2 + 0.035);
      g.add(clip);
    }

    // 保温壶 + 搪瓷杯
    const thermos = new THREE.Group();
    const body = new THREE.Mesh(S.cyl(0.055, 0.058, 0.26, 10), MB.red);
    thermos.add(body);
    const cap = new THREE.Mesh(S.cyl(0.05, 0.055, 0.05, 10), MB.metal);
    cap.position.y = 0.155; thermos.add(cap);
    thermos.position.set(-0.52, dashY + 0.20, -d / 2 + 0.20);
    S.addOutlines(thermos, 0.6);
    thermos.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(thermos);
    const mug = new THREE.Mesh(S.cyl(0.042, 0.038, 0.075, 10), MB.white);
    mug.position.set(-0.40, dashY + 0.21, -d / 2 + 0.16);
    g.add(mug);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 4, 10, Math.PI), MB.white);
    handle.position.set(-0.358, dashY + 0.21, -d / 2 + 0.16);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);

    // 黄色雨衣
    const coat = new THREE.Group();
    const coatBody = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.52, 8, 1, true), MB.yellow);
    coatBody.position.y = -0.26;
    coat.add(coatBody);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6, 0, 6.28, 0, 1.6), MB.yellow);
    hood.position.y = 0.02; hood.scale.set(1, 0.8, 1.1);
    coat.add(hood);
    const hook = new THREE.Mesh(S.cyl(0.008, 0.008, 0.08, 4), MB.metal);
    hook.rotation.z = Math.PI / 2; hook.position.set(0, 0.10, -0.02);
    coat.add(hook);
    coat.position.set(-w / 2 + 0.10, h - 0.28, d * 0.18);
    S.addOutlines(coat, 0.7);
    coat.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(coat);

    // 护身符与照片
    const charm = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.12),
      new THREE.MeshBasicMaterial({ map: S.tex(S.texCharm(64, 128)) }));
    charm.position.set(w / 2 - 0.04, h - 0.42, -d / 2 + 0.45);
    charm.rotation.y = -Math.PI / 2;
    g.add(charm);
    for (let i = 0; i < 3; i++) {
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.10),
        new THREE.MeshBasicMaterial({ map: S.tex(S.texPhoto(128, 96, i)) }));
      ph.position.set(w / 2 - 0.045, h - 0.55, -d / 2 + 0.72 + i * 0.16);
      ph.rotation.y = -Math.PI / 2;
      ph.rotation.z = (i - 1) * 0.06;
      g.add(ph);
    }

    const ceilLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff4d8 }));
    ceilLamp.position.set(0, h - 0.03, 0.1);
    g.add(ceilLamp);

    return g;
  };

  /* ---------------- 船 ---------------- */
  S.makeBoat = function (opt) {
    S.initBoatMats();
    const L = opt.L || 5.2, B = opt.B || 1.9, D = opt.D || 1.15;
    const g = new THREE.Group();
    g.name = 'boat';

    const hullMat = opt.hullMat || MB.hull;
    const hull = new THREE.Mesh(S.hullGeo(L, B, D), hullMat);
    hull.castShadow = true; hull.receiveShadow = true;
    S.addOutline(hull, opt.outline || 1.1);
    g.add(hull);

    // 舷边
    {
      const pts = [];
      const stations = 26;
      for (let i = 0; i <= stations; i++) {
        const t = i / stations;
        pts.push(new THREE.Vector3(hbAt(t, B), shAt(t), -L / 2 + t * L));
      }
      for (let i = stations; i >= 0; i--) {
        const t = i / stations;
        pts.push(new THREE.Vector3(-hbAt(t, B), shAt(t), -L / 2 + t * L));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true);
      const rim = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.045, 6, true), MB.white);
      rim.castShadow = true;
      g.add(rim);
    }

    // 吃水线色带
    {
      const stripe = new THREE.Mesh(S.hullStripe(L, B, D, 0.10, 0.10, 0.006), opt.stripeMat || MB.navy);
      g.add(stripe);
    }

    // 甲板
    {
      const shape = new THREE.Shape();
      const stations = 24;
      const half = [];
      for (let i = 0; i <= stations; i++) {
        const t = i / stations;
        half.push([hbAt(t, B) * 0.97, -L / 2 + t * L]);
      }
      shape.moveTo(half[0][0], half[0][1]);
      for (let i = 1; i < half.length; i++) shape.lineTo(half[i][0], half[i][1]);
      for (let i = half.length - 1; i >= 0; i--) shape.lineTo(-half[i][0], half[i][1]);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(Math.PI / 2);
      const deck = new THREE.Mesh(geo, MB.deck);
      deck.position.y = 0.46;
      deck.receiveShadow = true; deck.castShadow = true;
      g.add(deck);
    }

    // 船尾
    {
      const transom = new THREE.Mesh(new THREE.BoxGeometry(B * 0.86, 0.7, 0.06), MB.white);
      transom.position.set(0, 0.30, L / 2 - 0.02);
      transom.castShadow = true;
      g.add(transom);
    }

    // ---- 驾驶舱 ----
    if (opt.cabin !== false) {
      const cw = opt.cabinW || 1.55, ch = opt.cabinH || 1.15, cd = opt.cabinD || 1.95;
      const cz = opt.cabinZ || -0.35;
      const deckY = 0.46;
      const cabin = new THREE.Group();
      cabin.position.set(0, deckY, cz);

      const wallMat = opt.cabinMat || MB.cabin;
      const t = 0.06;
      const backWall = new THREE.Mesh(S.rbox(cw, ch, t, 0.02), wallMat);
      backWall.position.set(0, ch / 2, cd / 2 - t / 2);
      backWall.castShadow = true; backWall.receiveShadow = true;
      cabin.add(backWall);
      const backFrame = new THREE.Mesh(S.rbox(cw * 0.68, ch * 0.36, 0.03, 0.01), MB.cream);
      backFrame.position.set(0, ch * 0.66, cd / 2 - 0.02);
      cabin.add(backFrame);
      const backWin = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.60, ch * 0.30), MB.glass);
      backWin.position.set(0, ch * 0.66, cd / 2 + 0.012);
      cabin.add(backWin);

      const sideL = new THREE.Mesh(S.rbox(t, ch, cd, 0.02), wallMat);
      sideL.position.set(-cw / 2 + t / 2, ch / 2, 0);
      sideL.castShadow = true; sideL.receiveShadow = true;
      cabin.add(sideL);
      const winL = new THREE.Mesh(new THREE.PlaneGeometry(cd * 0.6, ch * 0.34), MB.glass);
      winL.position.set(-cw / 2 - 0.006, ch * 0.66, -0.05);
      winL.rotation.y = -Math.PI / 2;
      cabin.add(winL);

      const doorW = cd * 0.34;
      const segW = (cd - doorW) / 2;
      const sideR1 = new THREE.Mesh(S.rbox(t, ch, segW, 0.02), wallMat);
      sideR1.position.set(cw / 2 - t / 2, ch / 2, -cd / 2 + segW / 2);
      sideR1.castShadow = true; sideR1.receiveShadow = true;
      cabin.add(sideR1);
      const sideR2 = new THREE.Mesh(S.rbox(t, ch, segW, 0.02), wallMat);
      sideR2.position.set(cw / 2 - t / 2, ch / 2, cd / 2 - segW / 2);
      sideR2.castShadow = true; sideR2.receiveShadow = true;
      cabin.add(sideR2);
      const door = new THREE.Mesh(S.rbox(t * 0.7, ch * 0.94, doorW * 0.96, 0.02), MB.cream);
      door.position.set(cw / 2 + 0.05, ch * 0.47, -cd / 2 + segW * 0.55);
      door.castShadow = true;
      cabin.add(door);
      const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 0.7, ch * 0.5), MB.glass);
      doorWin.position.set(cw / 2 + 0.09, ch * 0.58, -cd / 2 + segW * 0.55);
      doorWin.rotation.y = Math.PI / 2;
      cabin.add(doorWin);

      const front = new THREE.Mesh(S.rbox(cw, ch * 0.98, t, 0.02), wallMat);
      front.position.set(0, ch * 0.49, -cd / 2 + t / 2);
      front.rotation.x = 0.14;
      front.castShadow = true;
      cabin.add(front);
      for (let i = -1; i <= 1; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.29, ch * 0.36), MB.glass);
        win.position.set(i * cw * 0.31, ch * 0.62, -cd / 2 - 0.02);
        win.rotation.x = 0.14;
        cabin.add(win);
      }
      const wf = new THREE.Mesh(S.rbox(cw * 0.99, ch * 0.42, 0.03, 0.01), MB.cream);
      wf.position.set(0, ch * 0.62, -cd / 2 + 0.02);
      wf.rotation.x = 0.14;
      cabin.add(wf);

      const roof = new THREE.Mesh(S.rbox(cw + 0.26, 0.09, cd + 0.30, 0.04), opt.roofMat || MB.cream);
      roof.position.set(0, ch + 0.045, 0.04);
      roof.castShadow = true; roof.receiveShadow = true;
      cabin.add(roof);
      const roofRim = new THREE.Mesh(S.rbox(cw + 0.30, 0.03, cd + 0.34, 0.02), MB.white);
      roofRim.position.set(0, ch + 0.005, 0.04);
      cabin.add(roofRim);

      const interior = S.makeCabinInterior({ w: cw, d: cd, h: ch });
      cabin.add(interior);
      // 舱内照明
      const lamp = new THREE.PointLight(0xffe9c8, 0.45, 2.6, 2.0);
      lamp.position.set(0, ch - 0.16, 0.05);
      cabin.add(lamp);
      S.__cabinLights = S.__cabinLights || [];
      S.__cabinLights.push(lamp);

      // 桅杆
      const mast = new THREE.Group();
      mast.position.set(0, ch + 0.09, -cd / 2 + 0.35);
      const pole = new THREE.Mesh(S.cyl(0.035, 0.045, 1.25, 8), MB.white);
      pole.position.y = 0.62; pole.castShadow = true;
      mast.add(pole);
      const cross = new THREE.Mesh(S.cyl(0.022, 0.022, 0.72, 6), MB.white);
      cross.rotation.z = Math.PI / 2; cross.position.y = 1.10;
      mast.add(cross);
      const radarDome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, 6.28, 0, 1.5), MB.white);
      radarDome.position.y = 1.02; radarDome.scale.set(1, 0.75, 1);
      radarDome.castShadow = true;
      S.addOutline(radarDome, 0.8);
      mast.add(radarDome);
      const ant1 = new THREE.Mesh(S.cyl(0.008, 0.012, 0.85, 4), MB.darkMetal);
      ant1.position.set(0.30, 1.35, 0); mast.add(ant1);
      const ant2 = new THREE.Mesh(S.cyl(0.006, 0.010, 0.62, 4), MB.darkMetal);
      ant2.position.set(-0.28, 1.22, 0); mast.add(ant2);
      const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff2b8 }));
      navLight.position.set(0, 1.30, 0); mast.add(navLight);
      mast.traverse(o => { if (o.isMesh && o !== radarDome) { o.castShadow = true; } });
      const mastMeshes = [];
      mast.traverse(o => { if (o.isMesh && o !== radarDome) mastMeshes.push(o); });
      mastMeshes.forEach(o => S.addOutline(o, 0.7));
      cabin.add(mast);

      // 后甲板遮阳铁架
      const frame = new THREE.Group();
      const fy = 1.62;
      for (const sx of [-cw / 2 - 0.1, cw / 2 + 0.1]) {
        for (const sz of [cd / 2 + 0.35, cd / 2 + 1.15]) {
          const p = new THREE.Mesh(S.cyl(0.022, 0.022, fy, 5), MB.metal);
          p.position.set(sx, fy / 2, sz - cz);
          frame.add(p);
        }
      }
      for (const sz of [cd / 2 + 0.35, cd / 2 + 1.15]) {
        const bar = new THREE.Mesh(S.cyl(0.018, 0.018, cw + 0.24, 5), MB.metal);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, fy, sz - cz);
        frame.add(bar);
      }
      S.addOutlines(frame, 0.6);
      cabin.add(frame);

      g.add(cabin);
    }

    // ---- 船头 ----
    {
      const hatch = new THREE.Mesh(S.rbox(B * 0.32, 0.10, 0.5, 0.02), MB.cream);
      hatch.position.set(0, 0.51, -L / 2 + 0.75);
      hatch.castShadow = true;
      g.add(hatch);
      const anchor = new THREE.Group();
      const shank = new THREE.Mesh(S.cyl(0.018, 0.018, 0.42, 5), MB.rust);
      anchor.add(shank);
      const stock = new THREE.Mesh(S.cyl(0.014, 0.014, 0.26, 5), MB.rust);
      stock.rotation.z = Math.PI / 2; stock.position.y = 0.18; anchor.add(stock);
      const fluke = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.016, 4, 10, Math.PI), MB.rust);
      fluke.position.y = -0.20; fluke.rotation.z = Math.PI; anchor.add(fluke);
      anchor.position.set(0, 0.30, -L / 2 + 0.12);
      anchor.rotation.x = 0.5;
      S.addOutlines(anchor, 0.6);
      g.add(anchor);
      for (const sz of [-L / 2 + 0.55, L / 2 - 0.55]) {
        const bit = new THREE.Mesh(S.cyl(0.045, 0.05, 0.22, 6), MB.metal);
        bit.position.set(0, 0.57, sz); bit.castShadow = true;
        g.add(bit);
      }
    }

    // ---- 救生圈 ----
    {
      const ring = new THREE.Group();
      const torus = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.065, 8, 18), MB.white);
      ring.add(torus);
      for (let i = 0; i < 4; i++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.068, 6, 6, 0.42), MB.orange);
        band.rotation.z = i * Math.PI / 2 + 0.4;
        ring.add(band);
      }
      ring.position.set(-B / 2 - 0.02, 0.72, -0.55);
      ring.rotation.y = Math.PI / 2;
      ring.traverse(o => { if (o.isMesh) o.castShadow = true; });
      S.addOutlines(ring, 0.6);
      g.add(ring);
    }

    // ---- 轮胎护舷 ----
    {
      const n = opt.fenders === undefined ? 3 : opt.fenders;
      for (let i = 0; i < n; i++) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.065, 6, 14), MB.tire);
        tire.position.set(B * 0.45, 0.42, -L * 0.2 + i * 0.85);
        tire.rotation.y = Math.PI / 2;
        tire.castShadow = true;
        g.add(tire);
        const rope = new THREE.Mesh(S.cyl(0.012, 0.012, 0.42, 4), MB.rope);
        rope.position.set(B * 0.45, 0.70, -L * 0.2 + i * 0.85);
        g.add(rope);
      }
    }

    // ---- 尾部甲板杂物 ----
    if (opt.deckProps !== false) {
      const box = new THREE.Mesh(S.rbox(0.52, 0.28, 0.36, 0.03), MB.cream);
      box.position.set(-0.3, 0.60, L / 2 - 1.0);
      box.rotation.y = 0.2;
      box.castShadow = true; box.receiveShadow = true;
      g.add(box);
      const crate = new THREE.Mesh(S.rbox(0.34, 0.22, 0.30, 0.02), MB.teal);
      crate.position.set(0.36, 0.57, L / 2 - 1.1);
      crate.rotation.y = -0.3;
      crate.castShadow = true;
      g.add(crate);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.05, 6, 16), MB.rope);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0.1, 0.50, L / 2 - 1.7);
      g.add(coil);
      const coil2 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 6, 16), MB.rope);
      coil2.rotation.x = Math.PI / 2;
      coil2.position.set(0.1, 0.53, L / 2 - 1.7);
      g.add(coil2);
    }

    // 船名
    if (opt.name) {
      const tex = S.tex(S.texLabel(256, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = opt.nameColor || '#2c4a5e';
        ctx.font = 'bold 34px "Source Han Sans JP", "Yu Gothic", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(opt.name, w / 2, h / 2);
      }));
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      for (const side of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), mat);
        plate.position.set(side * (B * 0.5 * 0.86 + 0.01), 0.40, L / 2 - 1.35);
        plate.rotation.y = side * Math.PI / 2;
        g.add(plate);
      }
    }

    g.userData.baseY = 0;
    g.userData.phase = opt.phase || 0;
    g.userData.rockAmp = opt.rockAmp === undefined ? 1 : opt.rockAmp;
    g.userData.homePos = new THREE.Vector3();
    g.userData.homeRot = 0;
    return g;
  };

  /* ---------------- 泊位布局 ---------------- */
  S.buildBoats = function (scene) {
    const g = new THREE.Group(); g.name = 'boats';
    const boats = [];
    S.boats = boats;

    const b1 = S.makeBoat({
      L: 5.6, B: 2.0, D: 1.2, cabin: true, cabinW: 1.6, cabinH: 1.15, cabinD: 2.0,
      name: '第八 宝丸', phase: 0.0, stripeMat: MB.navy
    });
    b1.position.set(-3.15, S.W.waterY, 1.9);
    b1.rotation.y = 0.02;
    g.add(b1); boats.push(b1);

    const b2 = S.makeBoat({
      L: 4.7, B: 1.75, D: 1.05, cabin: true, cabinW: 1.45, cabinH: 1.05, cabinD: 1.8,
      name: '海風丸', phase: 1.7, stripeMat: MB.teal, fenders: 2
    });
    b2.position.set(-3.1, S.W.waterY, -3.6);
    b2.rotation.y = 0.03;
    g.add(b2); boats.push(b2);

    const b3 = S.makeBoat({
      L: 5.4, B: 1.95, D: 1.15, cabin: true, cabinW: 1.55, cabinH: 1.12, cabinD: 1.9,
      name: '太陽丸', phase: 3.1, stripeMat: MB.navy
    });
    b3.position.set(1.3, S.W.waterY, 4.62);
    b3.rotation.y = -Math.PI / 2;
    g.add(b3); boats.push(b3);
    S.heroBoat = b3;
    b3.userData.homePos.copy(b3.position);
    b3.userData.homeRot = b3.rotation.y;

    const b4 = S.makeBoat({
      L: 4.3, B: 1.6, D: 1.0, cabin: false, phase: 4.4, fenders: 2, deckProps: true
    });
    b4.position.set(6.3, S.W.waterY, 4.66);
    b4.rotation.y = -Math.PI / 2 + 0.05;
    g.add(b4); boats.push(b4);

    // 系泊缆绳
    const ropeMat = S.toon(0xd4713f, { spec: 0.12 });
    const ropePts = [
      [[-3.15, 0.72, 4.3], [-3.6, 0.45, 5.0], [-4.0, 0.12, 5.45]],
      [[-3.1, 0.70, -1.2], [-3.6, 0.42, -1.6], [-4.0, 0.12, -1.9]],
      [[-1.4, 0.70, 4.62], [-2.6, 0.40, 5.1], [-3.4, 0.12, 5.5]],
      [[3.9, 0.68, 4.62], [5.0, 0.38, 5.1], [5.9, 0.12, 5.5]],
      [[8.4, 0.66, 4.66], [9.6, 0.36, 5.1], [10.4, 0.12, 5.5]]
    ];
    for (const pts of ropePts) {
      const geo = S.tube(pts, 0.028, 24);
      const m = new THREE.Mesh(geo, ropeMat);
      m.castShadow = true;
      g.add(m);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 更新 ---------------- */
  S.updateBoats = function (t) {
    if (!S.boats) return;
    for (let i = 0; i < S.boats.length; i++) {
      const b = S.boats[i];
      if (b === S.heroBoat && S.heroSailing) continue;
      const ph = b.userData.phase;
      const amp = b.userData.rockAmp;
      b.position.y = S.W.waterY + Math.sin(t * 0.62 + ph) * 0.022 * amp + Math.sin(t * 1.31 + ph * 2) * 0.008 * amp;
      b.rotation.z = Math.sin(t * 0.55 + ph) * 0.014 * amp;
      b.rotation.x = Math.sin(t * 0.44 + ph * 1.3) * 0.010 * amp;
    }
  };

})(window);
