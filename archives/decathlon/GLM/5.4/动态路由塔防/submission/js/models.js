/* 动态路由塔防 —— 程序化模型：塔、敌人、Boss、隔离器（three.js） */
window.G = window.G || {};
(function () {
  'use strict';
  const T = window.THREE;

  // ---------- 材质与几何工具 ----------
  function std(color, o) {
    o = o || {};
    const m = new T.MeshStandardMaterial({ color: color, roughness: o.rough != null ? o.rough : 0.55, metalness: o.metal != null ? o.metal * 0.35 : 0.12, emissive: o.emissive != null ? o.emissive : 0x000000, emissiveIntensity: o.ei != null ? o.ei : 1, transparent: !!o.transparent, opacity: o.opacity != null ? o.opacity : 1, flatShading: !!o.flat, side: o.side || T.FrontSide, depthWrite: o.depthWrite != null ? o.depthWrite : true });
    return m;
  }
  function glow(color, ei) { return new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }); }
  const geoCache = new Map();
  function G_(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
  const box = (w, h, d) => G_('b' + w + ',' + h + ',' + d, () => new T.BoxGeometry(w, h, d));
  const cyl = (rt, rb, h, s) => G_('c' + rt + ',' + rb + ',' + h + ',' + s, () => new T.CylinderGeometry(rt, rb, h, s));
  const sph = (r, s) => G_('s' + r + ',' + s, () => new T.SphereGeometry(r, s || 14, Math.max(6, (s || 14) - 4)));
  const tor = (r, t, s) => G_('t' + r + ',' + t + ',' + s, () => new T.TorusGeometry(r, t, 8, s || 24));
  const cone = (r, h, s) => G_('k' + r + ',' + h + ',' + s, () => new T.ConeGeometry(r, h, s || 8));
  const oct = (r) => G_('o' + r, () => new T.OctahedronGeometry(r, 0));
  const ico = (r, d) => G_('i' + r + ',' + d, () => new T.IcosahedronGeometry(r, d || 0));
  const ring = (r, t) => G_('r' + r + ',' + t, () => new T.RingGeometry(r - t, r, 40));
  function mesh(g, m, x, y, z) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = false; return o; }
  function grp(x, y, z) { const o = new T.Group(); o.position.set(x || 0, y || 0, z || 0); return o; }
  function lathe(pts, seg, m) { const g = new T.LatheGeometry(pts.map(p => new T.Vector2(p[0], p[1])), seg || 18); const o = new T.Mesh(g, m); o.castShadow = true; return o; }
  // 发光装饰件不投影
  function glowMesh(g, color, x, y, z) { const o = new T.Mesh(g, glow(color)); o.position.set(x || 0, y || 0, z || 0); return o; }

  const COL = {
    steel: 0x3a4a63, dark: 0x1a2233, panel: 0x566b8a, white: 0xdfe9f5,
    fw: 0xff8a3d, fw2: 0xffc26b, honey: 0xff5fa8, honey2: 0xffb3d9, gate: 0x7fd8ff, gate2: 0xbfefff,
    intc: 0x59c8ff, intc2: 0x9fe3ff, sand: 0x7dffb2, sand2: 0xc8ffe0, rep: 0x9dff6a, rep2: 0xdcffc4,
    worm: 0x7cff5e, trojan: 0x4ad2ff, trojanR: 0xff4a4a, flood: 0x4f8cff, ransom: 0xb96bff, hotspot: 0xffd84a, packer: 0x8ad0ff,
    boss1: 0xff3b3b, boss2: 0xb48cff, boss3: 0x1b1b2a
  };

  // ---------- 通用底座 ----------
  function pedestal(color) {
    const g = grp();
    const base = mesh(cyl(1.55, 1.7, 0.28, 6), std(0x5a6f8e, { metal: 0.6, rough: 0.4 }), 0, 0.14, 0); g.add(base);
    const rim = new T.Mesh(tor(1.45, 0.05, 6), glow(color)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.3; g.add(rim);
    const top = mesh(cyl(1.3, 1.45, 0.14, 6), std(0x7a90b0, { metal: 0.5, rough: 0.45 }), 0, 0.35, 0); g.add(top);
    return g;
  }

  // ---------- 塔 ----------
  const Models = {};
  Models.tower = function (type, level, branch) {
    const g = grp(); const L = level || 1;
    if (type === 'firewall') {
      g.add(pedestal(COL.fw));
      const plateM = std(0xb0702a, { metal: 0.55, rough: 0.4, emissive: COL.fw, ei: 0.55 });
      const edgeM = glow(COL.fw2);
      for (const sgn of [-1, 1]) {
        const p = grp(sgn * 0.55, 1.0, 0.15); p.rotation.y = sgn * -0.45;
        const pl = mesh(box(0.28, 1.9, 1.5), plateM, 0, 0.55, 0); p.add(pl);
        const e1 = new T.Mesh(box(0.06, 1.9, 0.06), edgeM); e1.position.set(sgn * -0.17, 0.55, 0.75); p.add(e1);
        const e2 = e1.clone(); e2.position.z = -0.75; p.add(e2);
        g.add(p);
      }
      const core = mesh(cyl(0.3, 0.38, 1.4, 8), std(0x6a3a14, { emissive: COL.fw, ei: 1.1 }), 0, 1.1, -0.25); g.add(core);
      const beacon = glowMesh(sph(0.26), COL.fw2, 0, 1.95, -0.25); g.add(beacon); g.userData.beacon = beacon;
      if (L >= 2) {
        const ringMesh = new T.Mesh(tor(1.05, 0.06, 32), glow(COL.fw2)); ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 1.9; g.add(ringMesh); g.userData.ring = ringMesh;
        for (const sgn of [-1, 1]) { const p = grp(sgn * 0.95, 1.0, -0.55); p.rotation.y = sgn * -0.9; p.add(mesh(box(0.24, 1.5, 1.2), plateM, 0, 0.45, 0)); g.add(p); }
        const crown = mesh(cyl(0.42, 0.3, 0.4, 8), std(0xffb060, { emissive: COL.fw, ei: 1.2 }), 0, 2.05, -0.25); g.add(crown);
      }
    } else if (type === 'honeypot') {
      const potM = std(0xa02468, { metal: 0.3, rough: 0.35, emissive: COL.honey, ei: 0.6 });
      const liqM = glow(COL.honey2);
      function pot(scale, x, z) {
        const p = grp(x, 0.3, z); p.scale.setScalar(scale);
        const body = lathe([[0, 0], [0.65, 0.05], [0.95, 0.5], [0.85, 1.0], [0.55, 1.3], [0.62, 1.45]], 18, potM); p.add(body);
        const liquid = new T.Mesh(cyl(0.58, 0.58, 0.08, 18), liqM); liquid.position.y = 1.42; p.add(liquid);
        const rim = new T.Mesh(tor(0.62, 0.05, 24), glow(COL.honey)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.45; p.add(rim);
        return p;
      }
      if (L >= 2 && branch === 'cluster') { g.add(pot(0.78, -0.75, 0.4)); g.add(pot(0.78, 0.75, 0.4)); g.add(pot(0.9, 0, -0.6)); }
      else g.add(pedestal(COL.honey)), g.add(pot(1.0, 0, 0));
      if (L >= 2 && branch === 'counter') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = mesh(cone(0.12, 0.7, 5), std(0x2b2b2b, { emissive: COL.honey, ei: 0.8 }), Math.cos(a) * 1.05, 1.55, Math.sin(a) * 1.05); sp.rotation.z = -Math.cos(a) * 0.6; sp.rotation.x = Math.sin(a) * 0.6; g.add(sp); } }
      const decoys = grp(); for (let i = 0; i < 3; i++) { const d = glowMesh(box(0.28, 0.28, 0.28), COL.honey2); d.position.set(Math.cos(i * 2.1) * 1.1, 2.0 + (i % 2) * 0.3, Math.sin(i * 2.1) * 1.1); decoys.add(d); } g.add(decoys); g.userData.orbit = decoys;
    } else if (type === 'gate') {
      g.add(pedestal(COL.gate));
      const frameM = std(0x6a8aa8, { metal: 0.7, rough: 0.35 });
      for (const sgn of [-1, 1]) g.add(mesh(box(0.5, 2.3, 0.9), frameM, sgn * 1.15, 1.45, 0));
      g.add(mesh(box(2.8, 0.4, 0.9), frameM, 0, 2.7, 0));
      const shutter = grp(0, 1.0, 0); const shM = std(0x2a90b8, { metal: 0.6, rough: 0.3, emissive: COL.gate, ei: 0.6 });
      for (let i = 0; i < 4; i++) shutter.add(mesh(box(1.75, 0.34, 0.5), shM, 0, i * 0.42, 0));
      const shGlow = new T.Mesh(box(1.8, 0.04, 0.52), glow(COL.gate2)); shGlow.position.y = 1.6; shutter.add(shGlow);
      g.add(shutter); g.userData.shutter = shutter;
      const topLight = glowMesh(box(2.6, 0.08, 0.3), COL.gate2, 0, 2.5, 0.3); g.add(topLight);
      if (L >= 2) { for (const sgn of [-1, 1]) g.add(mesh(box(0.3, 2.6, 1.1), std(0x8aaac8, { metal: 0.75, rough: 0.3 }), sgn * 1.45, 1.5, 0)); g.add(mesh(box(3.4, 0.3, 1.1), frameM, 0, 2.95, 0)); }
    } else if (type === 'interceptor') {
      g.add(pedestal(COL.intc));
      const body = mesh(cyl(0.75, 0.9, 0.55, 8), std(0x5a7aa0, { metal: 0.6, rough: 0.4 }), 0, 0.65, 0); g.add(body);
      const head = grp(0, 1.0, 0);
      const hm = std(0x7a95b8, { metal: 0.65, rough: 0.35, emissive: COL.intc, ei: 0.35 });
      head.add(mesh(box(1.2, 0.6, 1.0), hm, 0, 0.3, 0));
      const eye = glowMesh(box(0.5, 0.16, 0.1), COL.intc2, 0, 0.32, 0.52); head.add(eye);
      if (L >= 2 && branch === 'pierce') {
        for (const sgn of [-1, 1]) { const rail = mesh(box(0.12, 0.12, 3.0), std(0x8aa6c4, { metal: 0.8, rough: 0.25 }), sgn * 0.16, 0.3, 1.7); head.add(rail); }
        const core = glowMesh(box(0.08, 0.08, 3.0), COL.intc2, 0, 0.3, 1.7); head.add(core);
        const cap = mesh(box(0.6, 0.5, 0.4), hm, 0, 0.3, 3.2); head.add(cap);
        const fin = mesh(box(0.08, 0.7, 0.9), hm, 0, 0.8, -0.2); head.add(fin);
      } else if (L >= 2 && branch === 'suppress') {
        for (const sgn of [-1, 1]) head.add(mesh(cyl(0.11, 0.11, 1.7, 8), std(0x8aa6c4, { metal: 0.8, rough: 0.25 }), sgn * 0.25, 0.3, 1.1).rotateX(Math.PI / 2));
        const em = new T.Mesh(tor(0.5, 0.06, 24), glow(COL.intc2)); em.position.set(0, 0.3, 1.6); head.add(em); g.userData.emitter = em;
        head.add(mesh(box(0.5, 0.3, 0.6), hm, 0, 0.7, -0.1));
      } else {
        const barrel = mesh(cyl(0.12, 0.14, 2.1, 8), std(0x8aa6c4, { metal: 0.8, rough: 0.25 }), 0, 0.3, 1.05); barrel.rotation.x = Math.PI / 2; head.add(barrel);
        const tip = glowMesh(cyl(0.14, 0.14, 0.25, 8), COL.intc2, 0, 0.3, 2.1); tip.rotation.x = Math.PI / 2; head.add(tip);
        const fin = mesh(box(0.08, 0.55, 0.8), hm, 0, 0.75, -0.2); head.add(fin);
      }
      g.add(head); g.userData.head = head;
    } else if (type === 'sandbox') {
      g.add(pedestal(COL.sand));
      const frameM = std(0x5a8a70, { metal: 0.5, rough: 0.4 });
      for (const sgn of [-1, 1]) for (const s2 of [-1, 1]) g.add(mesh(box(0.16, 1.7, 0.16), frameM, sgn * 0.95, 1.25, s2 * 0.95));
      g.add(mesh(box(2.06, 0.12, 2.06), frameM, 0, 2.1, 0)); g.add(mesh(box(2.06, 0.12, 2.06), frameM, 0, 0.42, 0));
      const glass = new T.Mesh(box(1.75, 1.6, 1.75), new T.MeshPhysicalMaterial({ color: 0x7dffb2, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0, transmission: 0.0, side: T.DoubleSide, depthWrite: false })); glass.position.y = 1.25; g.add(glass);
      const inner = grp(0, 1.25, 0); const wire = new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.9), new T.MeshBasicMaterial({ color: COL.sand2, wireframe: true, transparent: true, opacity: 0.8 })); inner.add(wire);
      const core = glowMesh(oct(0.22), COL.sand2); inner.add(core); g.add(inner); g.userData.inner = inner;
      const scan = new T.Mesh(tor(1.1, 0.04, 32), glow(COL.sand)); scan.rotation.x = Math.PI / 2; scan.position.y = 0.6; g.add(scan); g.userData.scan = scan;
      if (L >= 2) { const top = mesh(cyl(0.35, 0.45, 0.3, 6), std(0x3f7a5f, { emissive: COL.sand, ei: 0.8 }), 0, 2.3, 0); g.add(top); }
    } else if (type === 'repair') {
      g.add(pedestal(COL.rep));
      const pillar = mesh(cyl(0.4, 0.5, 1.5, 8), std(0x5a8a4a, { metal: 0.5, rough: 0.4, emissive: COL.rep, ei: 0.6 }), 0, 1.1, 0); g.add(pillar);
      const cross = grp(0, 2.0, 0); const cm = std(0xd8ffd0, { emissive: COL.rep, ei: 1.3 });
      cross.add(mesh(box(0.9, 0.28, 0.28), cm)); cross.add(mesh(box(0.28, 0.9, 0.28), cm)); g.add(cross); g.userData.cross = cross;
      const drones = grp(); for (let i = 0; i < 3; i++) { const d = grp(Math.cos(i * 2.09) * 1.25, 1.4, Math.sin(i * 2.09) * 1.25); d.add(mesh(oct(0.2), std(0xcfe8c0, { emissive: COL.rep, ei: 1.0 }))); const beam = glowMesh(cyl(0.03, 0.03, 0.3, 6), COL.rep2, 0, -0.25, 0); d.add(beam); drones.add(d); } g.add(drones); g.userData.drones = drones;
      if (L >= 2) { const ringMesh = new T.Mesh(tor(1.1, 0.05, 32), glow(COL.rep)); ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 2.6; g.add(ringMesh); g.userData.ring = ringMesh; }
    } else if (type === 'isolator') {
      g.add(pedestal(0xff5a3a));
      const clampM = std(0xa0402a, { metal: 0.6, rough: 0.35, emissive: 0xff5a3a, ei: 0.7 });
      for (const sgn of [-1, 1]) g.add(mesh(box(0.45, 1.3, 1.6), clampM, sgn * 1.0, 1.0, 0));
      const lamp = glowMesh(sph(0.28), 0xff7a3a, 0, 1.8, 0); g.add(lamp); g.userData.beacon = lamp;
      g.add(mesh(cyl(0.12, 0.12, 0.7, 6), clampM, 0, 1.4, 0));
    }
    g.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { o.castShadow = true; } });
    return g;
  };

  // ---------- 敌人 ----------
  Models.enemy = function (type) {
    const g = grp(); const u = g.userData;
    if (type === 'worm') {
      const m = std(0x2f8f2a, { emissive: COL.worm, ei: 0.3, rough: 0.4 });
      const segs = []; const n = 5;
      for (let i = 0; i < n; i++) { const r = 0.42 - i * 0.06; const s = mesh(sph(r, 10), m, 0, 0.45, i * 0.5); s.castShadow = true; g.add(s); segs.push(s); }
      const head = segs[0]; const eyeL = glowMesh(sph(0.08, 6), 0xffffff, -0.16, 0.55, -0.3); head.add(eyeL); const eyeR = eyeL.clone(); eyeR.position.x = 0.16; head.add(eyeR);
      const sp = mesh(cone(0.06, 0.3, 5), std(0xffe066, { emissive: 0xffe066, ei: 1 }), 0, 0.1, -0.45); sp.rotation.x = -Math.PI / 2; head.add(sp);
      u.segs = segs;
    } else if (type === 'trojan') {
      const shellM = std(0x2c6f8f, { metal: 0.4, rough: 0.5, emissive: COL.trojan, ei: 0.2 });
      const body = grp(); const halfL = grp(-0.45, 0.6, 0), halfR = grp(0.45, 0.6, 0);
      halfL.add(mesh(box(0.88, 0.9, 0.9), shellM, 0, 0, 0)); halfR.add(mesh(box(0.88, 0.9, 0.9), shellM, 0, 0, 0));
      const label = glowMesh(box(0.5, 0.18, 0.05), 0xbfefff, 0, 0.1, 0.46); halfR.add(label);
      const ribbon = mesh(box(0.92, 0.92, 0.14), std(0xffd84a, { emissive: 0xffd84a, ei: 0.4 }), 0, 0, 0); halfL.add(ribbon.clone()); ribbon.position.set(0, 0, 0); halfR.add(ribbon);
      body.add(halfL); body.add(halfR); g.add(body); u.halfL = halfL; u.halfR = halfR; u.body = body;
      const core = glowMesh(oct(0.3), COL.trojanR); core.position.set(0, 0.6, 0); core.visible = false; g.add(core); u.core = core;
      const legs = grp(); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const l = grp(Math.cos(a) * 0.55, 0.55, Math.sin(a) * 0.55); const seg = mesh(cyl(0.05, 0.05, 0.75, 6), std(0x1a1a1a), 0, 0, 0); seg.rotation.z = Math.cos(a) * 1.1; seg.rotation.x = -Math.sin(a) * 1.1; seg.position.set(Math.cos(a) * 0.25, -0.3, Math.sin(a) * 0.25); l.add(seg); legs.add(l); } legs.visible = false; g.add(legs); u.legs = legs;
    } else if (type === 'flood') {
      const blob = new T.Mesh(sph(0.75, 12), new T.MeshPhysicalMaterial({ color: 0x2a5cff, transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.1, emissive: COL.flood, emissiveIntensity: 0.5 })); blob.position.y = 0.6; blob.scale.y = 0.8; g.add(blob); u.blob = blob;
      const bits = grp(); const bm = std(0x6fa0ff, { emissive: COL.flood, ei: 0.9, rough: 0.3 });
      for (let i = 0; i < 8; i++) { const b = mesh(sph(0.16 + (i % 3) * 0.05, 8), bm, 0, 0, 0); bits.add(b); } g.add(bits); u.bits = bits;
    } else if (type === 'ransom') {
      const bodyM = std(0x2d1b44, { metal: 0.3, rough: 0.5, emissive: COL.ransom, ei: 0.3 });
      const robe = lathe([[0, 0], [0.5, 0.05], [0.35, 1.0], [0.3, 1.3]], 10, bodyM); g.add(robe);
      const lockBody = mesh(box(0.55, 0.5, 0.4), std(0x3b2359, { metal: 0.5, emissive: COL.ransom, ei: 0.6 }), 0, 1.55, 0); g.add(lockBody);
      const shackle = new T.Mesh(tor(0.22, 0.06, 16, Math.PI), std(0xb28cff, { emissive: COL.ransom, ei: 1 })); shackle.position.set(0, 1.8, 0); g.add(shackle);
      const keyhole = glowMesh(box(0.1, 0.18, 0.05), 0xffffff, 0, 1.55, 0.21); g.add(keyhole);
      const staff = grp(0.55, 0.9, 0.1); const rod = mesh(cyl(0.04, 0.04, 1.5, 6), std(0x8a6fbf, { metal: 0.6 }), 0, 0.3, 0); staff.add(rod); const orb = glowMesh(sph(0.17), COL.ransom, 0, 1.1, 0); staff.add(orb); g.add(staff); u.orb = orb; u.staff = staff;
    } else if (type === 'hotspot') {
      const core = glowMesh(sph(0.35, 12), COL.hotspot); g.add(core); u.core = core;
      const r1 = new T.Mesh(tor(0.55, 0.05, 24), glow(0xffe9a0)); r1.rotation.x = Math.PI / 2.4; g.add(r1); u.r1 = r1;
      const r2 = new T.Mesh(tor(0.8, 0.05, 24), glow(0xffc83a)); r2.rotation.x = Math.PI / 2.4; g.add(r2); u.r2 = r2;
      const beam = new T.Mesh(cone(0.5, 1.8, 12, 1, true), new T.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false })); beam.position.y = -1.1; g.add(beam); u.beam = beam;
    } else if (type === 'packer') {
      const shell = (size, color, ei) => { const m = new T.Mesh(new T.BoxGeometry(size, size, size), new T.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.85 })); m.position.y = 0.85; g.add(m); return m; };
      u.s1 = shell(0.9, 0xbfe9ff); u.s2 = shell(1.3, COL.packer); u.s3 = shell(1.7, 0x3a7fbf);
      const core = glowMesh(oct(0.32), 0xffffff); core.position.y = 0.85; g.add(core); u.core = core;
      const aura = new T.Mesh(sph(1.4, 16), new T.MeshBasicMaterial({ color: 0x8ad0ff, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide })); aura.position.y = 0.85; g.add(aura); u.aura = aura;
    } else if (type === 'boss_wan') {
      const darkM = std(0x3a2a3a, { metal: 0.4, rough: 0.6, emissive: 0xff2030, ei: 0.6 });
      const robe = lathe([[0, 0], [1.6, 0.1], [1.0, 2.2], [0.6, 3.4], [0.5, 3.8]], 12, darkM); g.add(robe);
      const mask = mesh(box(1.1, 1.3, 0.25), std(0xe8e2d0, { rough: 0.6, emissive: 0x331111, ei: 0.4 }), 0, 4.2, 0.45); g.add(mask);
      const eyeL = glowMesh(box(0.2, 0.1, 0.05), 0xff3030, -0.28, 4.3, 0.6); g.add(eyeL); const eyeR = eyeL.clone(); eyeR.position.x = 0.28; g.add(eyeR);
      const crown = mesh(cyl(0.2, 0.6, 0.6, 6), std(0x5a1a1a, { emissive: 0xff3030, ei: 0.7 }), 0, 5.0, 0); g.add(crown);
      const arms = grp(); const armM = std(0x5a2a3a, { metal: 0.5, emissive: 0xff3030, ei: 0.6 });
      const aL = grp(-1.1, 3.0, 0), aR = grp(1.1, 3.0, 0);
      for (const [a, sgn] of [[aL, -1], [aR, 1]]) { const seg = mesh(cyl(0.16, 0.22, 1.8, 8), armM, sgn * 0.4, -0.3, 0); seg.rotation.z = sgn * 0.5; a.add(seg); const hand = mesh(sph(0.26, 10), armM, sgn * 0.85, -1.2, 0); a.add(hand); a.userData.hand = hand; arms.add(a); }
      g.add(arms); u.arms = arms; u.aL = aL; u.aR = aR;
      const puppets = grp(); const pm = std(0xd8cfc0, { emissive: 0xff3030, ei: 0.2 });
      for (let i = 0; i < 4; i++) { const p = grp(Math.cos(i * 1.57) * 2.2, 2.6 + (i % 2) * 0.8, Math.sin(i * 1.57) * 2.2); p.add(mesh(box(0.5, 0.6, 0.12), pm)); const line = new T.Mesh(cyl(0.02, 0.02, 2.2, 4), glow(0xff6060)); line.position.y = 1.2; p.add(line); puppets.add(p); }
      g.add(puppets); u.puppets = puppets;
    } else if (type === 'boss_shen') {
      const layers = []; const lm = (c, o) => new T.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.25, emissive: COL.boss2, emissiveIntensity: 0.8, transparent: true, opacity: o });
      for (let i = 0; i < 3; i++) { const L = mesh(oct(1.6 - i * 0.4), lm(0x4a3a7a, 0.85 - i * 0.2), 0, 1.8 + i * 1.2, 0); g.add(L); layers.push(L); }
      u.layers = layers;
      const core = glowMesh(sph(0.4), 0xd9c6ff, 0, 2.6, 0); g.add(core); u.core = core;
      const halo = new T.Mesh(tor(2.4, 0.08, 48), glow(COL.boss2)); halo.rotation.x = Math.PI / 2; halo.position.y = 2.2; g.add(halo); u.halo = halo;
      const orbs = grp(); for (let i = 0; i < 3; i++) { const o = new T.Mesh(sph(0.35, 10), new T.MeshBasicMaterial({ color: 0x12081f })); o.add(new T.Mesh(tor(0.45, 0.05, 20), glow(0xb48cff))); orbs.add(o); } g.add(orbs); u.orbs = orbs;
    } else if (type === 'boss_zhe') {
      const bodyM = std(0x6a3a7a, { metal: 0.4, rough: 0.5, emissive: 0xff3060, ei: 0.55 });
      const abd = mesh(sph(0.9, 12), bodyM, 0, 0.9, 0.9); abd.scale.set(1, 0.8, 1.3); g.add(abd);
      const head = mesh(sph(0.6, 12), bodyM, 0, 0.85, -0.5); g.add(head);
      const eyeL = glowMesh(sph(0.1, 6), 0xff3030, -0.22, 0.95, -1.0); g.add(eyeL); const eyeR = eyeL.clone(); eyeR.position.x = 0.22; g.add(eyeR);
      const claws = grp(); for (const sgn of [-1, 1]) { const c = grp(sgn * 0.9, 0.7, -1.1); c.add(mesh(cyl(0.12, 0.18, 1.0, 6), bodyM, sgn * 0.2, -0.1, -0.3).rotateX(1.0)); c.add(mesh(cone(0.2, 0.5, 6), std(0x3a1a3a, { emissive: 0xff3030, ei: 0.6 }), sgn * 0.45, 0.1, -0.85).rotateX(-1.4)); claws.add(c); } g.add(claws); u.claws = claws;
      const legs = grp(); for (let i = 0; i < 6; i++) { const sgn = i < 3 ? -1 : 1; const k = i % 3; const l = grp(sgn * 0.7, 0.8, -0.5 + k * 0.7); const seg = mesh(cyl(0.07, 0.09, 1.1, 6), bodyM, sgn * 0.45, -0.2, 0); seg.rotation.z = sgn * 1.0; l.add(seg); legs.add(l); } g.add(legs); u.legs = legs;
      const tail = grp(0, 1.1, 1.4); const segs = []; for (let i = 0; i < 4; i++) { const s = mesh(sph(0.3 - i * 0.04, 8), bodyM, 0, i * 0.45, i * 0.35); tail.add(s); segs.push(s); } const sting = mesh(cone(0.16, 0.6, 6), std(0x3a1a3a, { emissive: 0xff3030, ei: 1 }), 0, 2.0, 1.6); sting.rotation.x = 0.6; tail.add(sting); g.add(tail); u.tail = tail; u.segs = segs;
      const plates = grp(); for (let i = 0; i < 3; i++) plates.add(mesh(box(0.9 - i * 0.15, 0.1, 0.5), std(0x4a1a4a, { emissive: 0xff3030, ei: 1.0 }), 0, 1.55 - i * 0.1, 0.3 + i * 0.5)); plates.visible = false; g.add(plates); u.plates = plates;
    }
    g.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.castShadow = true; });
    return g;
  };

  // ---------- 动画 ----------
  const tmpV = new T.Vector3();
  Models.animateTower = function (g, t, tower, time) {
    const u = g.userData; const def = towerDef(tower);
    const lunge = Math.max(0, 1 - (time - (tower.lungeAt || -9)) * 6);
    const hit = Math.max(0, 1 - (time - (tower.hitAt || -9)) * 5);
    if (u.head) { // 拦截器：朝向 + 后坐
      u.head.rotation.y = -tower.facing + (tower.aim != null ? 0 : 0);
      if (tower.aim != null) { let d = -tower.aim - u.head.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; u.head.rotation.y += d * 0.2; }
      u.head.position.z = -lunge * 0.25; u.head.position.y = 1.0 + Math.sin(time * 2 + tower.id) * 0.03;
    }
    if (u.shutter) { const open = t.type === 'gate' && tower.onNode ? 0 : 0; u.shutter.position.y = 1.0 - Math.sin(time * 1.5) * 0.03; }
    if (u.beacon) { u.beacon.material.opacity = 0.6 + Math.sin(time * 5 + tower.id) * 0.35; const s = 1 + Math.sin(time * 5 + tower.id) * 0.12; u.beacon.scale.setScalar(s); }
    if (u.ring) u.ring.rotation.z = time * (tower.type === 'firewall' ? 0.8 : 1.4) + tower.id;
    if (u.orbit) { u.orbit.rotation.y = time * 1.2; u.orbit.position.y = Math.sin(time * 2) * 0.1; }
    if (u.inner) { u.inner.rotation.y = time * 0.9; u.inner.rotation.x = time * 0.5; }
    if (u.scan) { const p = (time * 0.6 + tower.id * 0.3) % 1; u.scan.position.y = 0.5 + p * 1.7; u.scan.material.opacity = (1 - p) * 0.9; }
    if (u.cross) { u.cross.rotation.y = time * 1.5; u.cross.position.y = 2.0 + Math.sin(time * 3) * 0.08; }
    if (u.drones) { u.drones.rotation.y = -time * 1.6; u.drones.position.y = Math.sin(time * 2.2) * 0.15; }
    if (u.emitter) { u.emitter.rotation.z = time * 3; const s = 1 + Math.sin(time * 8) * 0.1; u.emitter.scale.setScalar(s); }
    if (tower.encUntil > time) { const s = 0.9 + Math.sin(time * 10) * 0.05; g.scale.set(1, s, 1); } else g.scale.set(1, 1, 1);
    g.rotation.y = 0;
    flash(g, hit, t.type === 'firewall' ? 0xff6a3a : 0xffffff);
    void def; void tmpV;
  };
  Models.animateEnemy = function (g, e, time, dt) {
    const u = g.userData; const t = e.anim; const mv = e.moving !== false;
    const lunge = Math.max(0, 1 - (time - (e.lungeAt || -9)) * 7);
    const hit = Math.max(0, 1 - (time - (e.hitAt || -9)) * 6);
    const yaw = Math.atan2(e.dirx, e.dirz) || 0;
    g.rotation.y = yaw;
    if (e.type === 'worm') {
      const segs = u.segs; for (let i = 0; i < segs.length; i++) { const s = segs[i]; const ph = t * 6 - i * 0.9; s.position.x = Math.sin(ph) * 0.12 * i; s.position.y = 0.45 + Math.abs(Math.sin(ph)) * 0.1 * (mv ? 1 : 0.2); s.position.z = i * 0.5 - (mv ? 0 : 0) + lunge * (i === 0 ? -0.5 : 0); }
    } else if (e.type === 'trojan') {
      const revealed = e.revealed; u.legs.visible = revealed; u.core.visible = revealed;
      const open = revealed ? 1 : 0; u.halfL.position.x = -0.45 - open * 0.25; u.halfR.position.x = 0.45 + open * 0.25; u.halfL.rotation.z = open * 0.5; u.halfR.rotation.z = -open * 0.5;
      u.halfL.rotation.y = -open * 0.6; u.halfR.rotation.y = open * 0.6;
      u.core.rotation.y = t * 3; u.core.position.y = 0.6 + Math.sin(t * 5) * 0.1;
      u.legs.children.forEach((l, i) => { l.position.y = 0.55 + Math.sin(t * 10 + i * 1.5) * 0.08 * (mv ? 1 : 0); l.rotation.y = Math.sin(t * 10 + i) * 0.25 * (mv ? 1 : 0); });
      u.body.position.y = 0.6 + Math.sin(t * 3) * 0.04 + lunge * 0.2; u.body.position.z = lunge * 0.35;
      u.body.rotation.x = revealed ? Math.sin(t * 4) * 0.04 : 0;
    } else if (e.type === 'flood') {
      u.blob.scale.set(1 + Math.sin(t * 5) * 0.08, 0.8 + Math.sin(t * 5 + 1) * 0.08, 1 + Math.cos(t * 5) * 0.08); u.blob.position.y = 0.6 + Math.sin(t * 4) * 0.05 + lunge * 0.3;
      u.bits.children.forEach((b, i) => { const a = t * 2 + i * 0.785; const r = 0.55 + (i % 2) * 0.2; b.position.set(Math.cos(a) * r, 0.6 + Math.sin(a * 1.3) * 0.35, Math.sin(a) * r); b.scale.setScalar(1 + Math.sin(t * 8 + i) * 0.15); });
    } else if (e.type === 'ransom') {
      g.children.forEach(() => { }); g.position.y += 0; u.staff.rotation.x = -lunge * 0.6; u.orb.scale.setScalar(1 + Math.sin(t * 6) * 0.15 + lunge * 0.6);
      g.position.y += Math.sin(t * 2.5) * 0.04;
    } else if (e.type === 'hotspot') {
      u.r1.rotation.z = t * 2.5; u.r2.rotation.z = -t * 2; u.core.scale.setScalar(1 + Math.sin(t * 9) * 0.2); u.beam.rotation.y = t;
      g.rotation.y = 0;
    } else if (e.type === 'packer') {
      u.s1.rotation.y = t * 1.6; u.s1.rotation.x = t * 0.9; u.s2.rotation.y = -t * 1.1; u.s2.rotation.z = t * 0.7; u.s3.rotation.y = t * 0.6; u.s3.rotation.x = -t * 0.4; u.core.rotation.y = t * 3;
      u.aura.material.opacity = 0.08 + Math.sin(t * 3) * 0.04;
    } else if (e.type === 'boss_wan') {
      u.puppets.rotation.y = t * 0.8; u.puppets.children.forEach((p, i) => { p.position.y = 2.6 + (i % 2) * 0.8 + Math.sin(t * 2 + i) * 0.25; p.rotation.y = Math.sin(t * 1.5 + i) * 0.4; });
      const slam = Math.max(0, 1 - (time - (e.slamAt || -9)) * 1.4); const raise = slam > 0 ? Math.sin(Math.min(1, (1 - slam)) * Math.PI) : 0;
      u.aL.rotation.z = 0.25 + raise * 1.8; u.aR.rotation.z = -0.25 - raise * 1.8; u.aL.position.y = 3.0 + Math.sin(t * 1.5) * 0.1; u.aR.position.y = 3.0 + Math.cos(t * 1.5) * 0.1;
      g.children[0].rotation.y = 0; g.position.y += Math.sin(t * 1.2) * 0.08;
    } else if (e.type === 'boss_shen') {
      u.layers.forEach((L, i) => { L.rotation.y = t * (0.6 + i * 0.5) * (i % 2 ? -1 : 1); L.position.y = 1.8 + i * 1.2 + Math.sin(t * 1.5 + i) * 0.15; });
      u.halo.rotation.z = t * 0.5; u.core.scale.setScalar(1 + Math.sin(t * 4) * 0.2);
      u.orbs.children.forEach((o, i) => { const a = t * 1.3 + i * 2.09; o.position.set(Math.cos(a) * 2.6, 2.4 + Math.sin(t * 2 + i) * 0.6, Math.sin(a) * 2.6); o.children[0].rotation.x = t * 2; });
      g.rotation.y = 0;
    } else if (e.type === 'boss_zhe') {
      const ph = e.bossPhase; const anger = ph === 'destroy' ? 1 : ph === 'escalate' ? 0.6 : 0;
      u.plates.visible = ph !== 'lurk'; u.plates.children.forEach((p, i) => { p.material.emissiveIntensity = 0.6 + Math.sin(t * 6 + i) * 0.4 + anger; });
      u.legs.children.forEach((l, i) => { l.rotation.x = Math.sin(t * (6 + anger * 4) + i * 1.1) * 0.35 * (mv ? 1 : 0.2); });
      u.claws.rotation.x = -lunge * 0.5; u.claws.position.z = -lunge * 0.3;
      u.segs.forEach((s, i) => { s.position.y = i * 0.45 * (0.6 + anger * 0.6); s.position.z = i * 0.35 - anger * 0.1 * i; });
      u.tail.rotation.x = -anger * 0.9 + Math.sin(t * 2) * 0.1; u.tail.position.y = 1.1 + anger * 0.3;
      g.position.y += Math.sin(t * 1.7) * 0.05;
      g.traverse(o => { if (o.material && o.material.transparent) o.material.opacity = ph === 'lurk' ? 0.55 : 1; });
    }
    if (e.slowUntil > time) g.position.y -= 0.0;
    flash(g, hit, 0xffffff);
  };
  function flash(g, amt, color) {
    if (amt <= 0.01) return;
    g.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { if (o.userData.baseEI == null) o.userData.baseEI = o.material.emissiveIntensity; o.material.emissiveIntensity = o.userData.baseEI + amt * 1.5; if (o.material.emissive.getHex() === 0) o.material.emissive.setHex(color); } });
  }
  function towerDef(t) { return G.Sim.towerDef(t); }

  // ---------- 血条 ----------
  Models.healthBar = function (w, color) {
    const g = new T.Group();
    const bg = new T.Mesh(new T.PlaneGeometry(w, 0.14), new T.MeshBasicMaterial({ color: 0x101620, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })); bg.renderOrder = 20; g.add(bg);
    const fg = new T.Mesh(new T.PlaneGeometry(w, 0.14), new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })); fg.renderOrder = 21; fg.position.z = 0.001; g.add(fg);
    const sh = new T.Mesh(new T.PlaneGeometry(w, 0.06), new T.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })); sh.renderOrder = 22; sh.position.set(0, 0.12, 0.002); sh.visible = false; g.add(sh);
    g.userData.fg = fg; g.userData.sh = sh; g.userData.w = w; g.visible = false;
    return g;
  };
  Models.setBar = function (bar, ratio, shieldRatio) {
    if (!bar) return; const fg = bar.userData.fg; fg.scale.x = Math.max(0.0001, Math.min(1, ratio)); fg.position.x = -(1 - Math.min(1, ratio)) * bar.userData.w / 2;
    const sh = bar.userData.sh; if (shieldRatio > 0) { sh.visible = true; sh.scale.x = Math.max(0.0001, Math.min(1, shieldRatio)); sh.position.x = -(1 - Math.min(1, shieldRatio)) * bar.userData.w / 2; } else sh.visible = false;
  };

  Models.std = std; Models.glow = glow; Models.mesh = mesh; Models.grp = grp; Models.box = box; Models.cyl = cyl; Models.sph = sph; Models.tor = tor; Models.cone = cone; Models.oct = oct; Models.ico = ico; Models.ring = ring; Models.glowMesh = glowMesh; Models.COL = COL; Models.lathe = lathe;
  G.Models = Models;
})();
