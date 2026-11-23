/* 程序化三维建模：塔 / 敌人 / Boss / 地形 / 环境。所有几何与材质运行时生成，兼容 file://。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const T = root.THREE;
  if (!T) return;

  const THEMES = {
    corporate: { bg: 0x060b18, fog: 0x0a1428, link: 0x1b6fa8, linkGlow: 0x35d6ff, legacy: 0xc98a2e, node: 0x2a86c8, platform: 0x173a5e, obstacle: 0x22405e, accent: 0x35d6ff, key: 0xbfe3ff, rim: 0x3a7bd5, ambient: 0x223a55 },
    backbone: { bg: 0x0a0716, fog: 0x140b2e, link: 0x5a3fa8, linkGlow: 0x9d7dff, legacy: 0xc98a2e, node: 0x7a5ad5, platform: 0x2c1f5e, obstacle: 0x3a2a6e, accent: 0xb07dff, key: 0xd6c6ff, rim: 0x7a4fd5, ambient: 0x2e2255 },
    industrial: { bg: 0x07120c, fog: 0x0b2016, link: 0x2f8a5a, linkGlow: 0x5dff9d, legacy: 0xc98a2e, node: 0x3faf7a, platform: 0x1c4a33, obstacle: 0x2a5e40, accent: 0x7dff9d, key: 0xc6ffd9, rim: 0x3fd58a, ambient: 0x1e4a33 }
  };
  ND.THEMES = THEMES;

  // ---- 纹理 ----
  function radialTex(inner, outer, size) {
    size = size || 64;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const tx = new T.CanvasTexture(c); return tx;
  }
  const glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const softTex = radialTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  ND.glowTex = glowTex; ND.softTex = softTex;

  function std(color, opts) {
    opts = opts || {};
    return new T.MeshStandardMaterial({
      color, roughness: opts.rough != null ? opts.rough : 0.55, metalness: opts.metal != null ? opts.metal : 0.35,
      emissive: opts.emissive != null ? opts.emissive : 0x000000, emissiveIntensity: opts.ei != null ? opts.ei : 1,
      flatShading: opts.flat !== false, transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || T.FrontSide
    });
  }
  function glowSprite(color, scale, opacity) {
    const m = new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: opacity != null ? opacity : 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const s = new T.Sprite(m); s.scale.set(scale, scale, 1); return s;
  }
  ND.glowSprite = glowSprite;

  const M = ND.Models = {};
  M.std = std;

  // ============ 塔 ============
  M.makeTower = function (type, level, branch) {
    const g = new T.Group();
    const builders = { firewall: bFirewall, honeypot: bHoneypot, airgap: bAirgap, interceptor: bInterceptor, sandbox: bSandbox, repair: bRepair };
    builders[type](g, level || 1, branch);
    return g;
  };
  function pedestal(g, color, r) {
    const base = new T.Mesh(new T.CylinderGeometry(r || 0.7, (r || 0.7) + 0.15, 0.25, 6), std(0x1a2733, { metal: 0.6, rough: 0.4 }));
    base.position.y = 0.12; base.castShadow = true; base.receiveShadow = true; g.add(base);
    const ring = new T.Mesh(new T.TorusGeometry(r || 0.7, 0.04, 8, 24), std(color, { emissive: color, ei: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.26; g.add(ring);
    return base;
  }
  function bFirewall(g, level) {
    const col = level >= 2 ? 0x6fe3ff : 0x35a6ff;
    pedestal(g, col, 0.75);
    const body = new T.Group(); body.position.y = 0.3; g.add(body);
    const plates = level >= 2 ? 2 : 1;
    for (let i = 0; i < plates; i++) {
      const plate = new T.Mesh(new T.BoxGeometry(1.4, 1.3, 0.16), std(0x123a5e, { metal: 0.5, rough: 0.35, emissive: col, ei: 0.25 }));
      plate.position.set(0, 0.75 + i * 0.28, -i * 0.22); plate.castShadow = true; body.add(plate);
      const edge = new T.Mesh(new T.BoxGeometry(1.44, 1.34, 0.05), std(col, { emissive: col, ei: 1.6 }));
      edge.position.copy(plate.position); edge.position.z += 0.09; body.add(edge);
    }
    // 六边形能量盾面
    const shield = new T.Mesh(new T.CircleGeometry(0.75, 6), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    shield.position.set(0, 1.0, 0.12); body.add(shield);
    const glow = glowSprite(col, 2.2, 0.5); glow.position.set(0, 1.0, 0.2); body.add(glow);
    if (level >= 2) {
      for (const s of [-1, 1]) { const fin = new T.Mesh(new T.BoxGeometry(0.14, 1.6, 0.5), std(col, { emissive: col, ei: 0.9 })); fin.position.set(s * 0.8, 0.9, 0); fin.castShadow = true; body.add(fin); }
    }
    g.userData.anim = { body, shield, glow };
  }
  function bHoneypot(g, level, branch) {
    const col = branch === 'sticky' ? 0xffb13d : 0xffd23d;
    pedestal(g, col, 0.65);
    const body = new T.Group(); body.position.y = 0.3; g.add(body);
    const pot = new T.Mesh(new T.CylinderGeometry(0.42, 0.55, 0.8, 6), std(0x6e5210, { metal: 0.4, rough: 0.4, emissive: col, ei: 0.35 }));
    pot.position.y = 0.5; pot.castShadow = true; body.add(pot);
    const core = new T.Mesh(new T.IcosahedronGeometry(0.3, 0), std(col, { emissive: col, ei: 2 }));
    core.position.y = 1.05; body.add(core);
    const rings = [];
    for (let i = 0; i < (level >= 2 ? 3 : 2); i++) {
      const ring = new T.Mesh(new T.TorusGeometry(0.55 + i * 0.12, 0.03, 6, 20), std(col, { emissive: col, ei: 1.5 }));
      ring.position.y = 0.9 + i * 0.15; ring.rotation.x = Math.PI / 2 + i * 0.3; body.add(ring); rings.push(ring);
    }
    const glow = glowSprite(col, 2.0, 0.55); glow.position.y = 1.05; body.add(glow);
    g.userData.anim = { body, core, rings, glow };
  }
  function bAirgap(g, level) {
    const col = level >= 2 ? 0xff8a3d : 0xff5d3d;
    const frame = new T.Group(); g.add(frame);
    for (const s of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(0.2, 1.5, 0.4), std(0x33221a, { metal: 0.5, rough: 0.4 })); post.position.set(s * 0.75, 0.75, 0); post.castShadow = true; frame.add(post); }
    const top = new T.Mesh(new T.BoxGeometry(1.7, 0.2, 0.4), std(0x33221a, { metal: 0.5 })); top.position.y = 1.55; frame.add(top);
    const gateL = new T.Mesh(new T.BoxGeometry(0.7, 1.2, 0.18), std(col, { emissive: col, ei: 0.7, metal: 0.3 }));
    const gateR = gateL.clone();
    gateL.position.set(-0.36, 0.75, 0); gateR.position.set(0.36, 0.75, 0);
    gateL.castShadow = gateR.castShadow = true; frame.add(gateL); frame.add(gateR);
    const glow = glowSprite(col, 1.8, 0.4); glow.position.y = 0.8; frame.add(glow);
    if (level >= 2) { const armor = new T.Mesh(new T.BoxGeometry(1.7, 0.12, 0.44), std(0xffb13d, { emissive: 0xffb13d, ei: 0.8 })); armor.position.y = 0.2; frame.add(armor); }
    g.userData.anim = { gateL, gateR, glow, frame };
  }
  function bInterceptor(g, level, branch) {
    const col = branch === 'suppress' ? 0x7dff6a : 0x6fe3ff;
    pedestal(g, col, 0.7);
    const base = new T.Mesh(new T.CylinderGeometry(0.4, 0.55, 0.5, 8), std(0x1a2733, { metal: 0.6, rough: 0.35 }));
    base.position.y = 0.5; base.castShadow = true; g.add(base);
    const head = new T.Group(); head.position.y = 0.95; g.add(head);
    const housing = new T.Mesh(new T.BoxGeometry(0.7, 0.5, 0.8), std(0x22405e, { metal: 0.5, rough: 0.4, emissive: col, ei: 0.2 }));
    housing.castShadow = true; head.add(housing);
    const barrel = new T.Group(); barrel.position.set(0, 0.05, 0.3); head.add(barrel);
    if (branch === 'pierce') {
      const rail = new T.Mesh(new T.BoxGeometry(0.16, 0.16, 1.6), std(col, { emissive: col, ei: 1.2, metal: 0.6 }));
      rail.position.z = 0.8; barrel.add(rail);
      for (const s of [-1, 1]) { const prong = new T.Mesh(new T.BoxGeometry(0.06, 0.3, 0.5), std(col, { emissive: col, ei: 1 })); prong.position.set(s * 0.16, 0, 1.4); barrel.add(prong); }
    } else if (branch === 'suppress') {
      for (const s of [-1, 1]) { const b = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.0, 8), std(col, { emissive: col, ei: 1.1 })); b.rotation.x = Math.PI / 2; b.position.set(s * 0.18, 0, 0.6); barrel.add(b); }
    } else {
      const b = new T.Mesh(new T.CylinderGeometry(0.11, 0.14, 1.2, 8), std(col, { emissive: col, ei: 1.1, metal: 0.5 }));
      b.rotation.x = Math.PI / 2; b.position.z = 0.7; barrel.add(b);
      const tip = new T.Mesh(new T.CylinderGeometry(0.16, 0.11, 0.2, 8), std(col, { emissive: col, ei: 1.6 }));
      tip.rotation.x = Math.PI / 2; tip.position.z = 1.3; barrel.add(tip);
    }
    const glow = glowSprite(col, 1.4, 0.5); glow.position.set(0, 0.05, 1.2); barrel.add(glow);
    g.userData.anim = { head, barrel, glow };
  }
  function bSandbox(g, level) {
    const col = level >= 2 ? 0xc07dff : 0x9d5dff;
    pedestal(g, col, 0.75);
    const body = new T.Group(); body.position.y = 0.35; g.add(body);
    const frame = new T.Mesh(new T.BoxGeometry(1.1, 1.1, 1.1), new T.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.6 }));
    frame.position.y = 0.75; body.add(frame);
    const core = new T.Mesh(new T.OctahedronGeometry(0.4, 0), std(col, { emissive: col, ei: 1.8 }));
    core.position.y = 0.75; body.add(core);
    const scan = new T.Mesh(new T.PlaneGeometry(1.0, 1.0), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    scan.position.y = 0.75; body.add(scan);
    const glow = glowSprite(col, 2.0, 0.5); glow.position.y = 0.75; body.add(glow);
    g.userData.anim = { body, frame, core, scan, glow };
  }
  function bRepair(g, level) {
    const col = level >= 2 ? 0x7dffc6 : 0x5dff9d;
    pedestal(g, col, 0.65);
    const body = new T.Group(); body.position.y = 1.0; g.add(body);
    const crossV = new T.Mesh(new T.BoxGeometry(0.24, 0.9, 0.24), std(col, { emissive: col, ei: 1.4 }));
    const crossH = new T.Mesh(new T.BoxGeometry(0.9, 0.24, 0.24), std(col, { emissive: col, ei: 1.4 }));
    body.add(crossV); body.add(crossH);
    const rings = [];
    for (let i = 0; i < (level >= 2 ? 2 : 1); i++) {
      const ring = new T.Mesh(new T.TorusGeometry(0.7 + i * 0.15, 0.03, 6, 24), std(col, { emissive: col, ei: 1.2 }));
      ring.rotation.x = Math.PI / 2; body.add(ring); rings.push(ring);
    }
    const glow = glowSprite(col, 1.8, 0.5); body.add(glow);
    g.userData.anim = { body, rings, glow, float: true };
  }

  // ============ 敌人 ============
  M.makeEnemy = function (type) {
    const g = new T.Group();
    const b = { worm: eWorm, flood: eFlood, trojan: eTrojan, ransom: eRansom, ap: eAP, packer: ePacker, boss1: eBoss1, boss2: eBoss2, boss3: eBoss3 }[type];
    if (b) b(g); else eWorm(g);
    return g;
  };
  function eWorm(g) {
    const col = 0x8aff4d;
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const s = new T.Mesh(new T.SphereGeometry(0.28 - i * 0.03, 10, 8), std(col, { emissive: col, ei: 0.5, rough: 0.5 }));
      s.position.z = -i * 0.38; s.castShadow = true; g.add(s); segs.push(s);
    }
    const eye = new T.Mesh(new T.SphereGeometry(0.08, 6, 6), std(0x0a1408, { emissive: 0xff3d3d, ei: 1 }));
    eye.position.set(0, 0.1, 0.25); g.add(eye);
    const glow = glowSprite(col, 1.0, 0.4); g.add(glow);
    g.userData.anim = { segs, glow, wiggle: true };
  }
  function eFlood(g) {
    const col = 0x6a7dff;
    const cubes = [];
    for (let i = 0; i < 7; i++) {
      const c = new T.Mesh(new T.BoxGeometry(0.26, 0.26, 0.26), std(col, { emissive: col, ei: 0.6, metal: 0.4 }));
      const a = i / 7 * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.35, (i % 2) * 0.25, Math.sin(a) * 0.35);
      c.castShadow = true; g.add(c); cubes.push(c);
    }
    const core = new T.Mesh(new T.IcosahedronGeometry(0.3, 0), std(0x9db4ff, { emissive: col, ei: 1.2 }));
    g.add(core);
    const glow = glowSprite(col, 1.4, 0.45); g.add(glow);
    g.userData.anim = { cubes, core, glow, swarm: true };
  }
  function eTrojan(g) {
    // 伪装 = 数据包；显形 = 尖刺
    const packet = new T.Group();
    const box = new T.Mesh(new T.BoxGeometry(0.45, 0.45, 0.45), std(0xdfefff, { emissive: 0x9fd6ff, ei: 0.4, rough: 0.3, metal: 0.2 }));
    packet.add(box);
    const stripe = new T.Mesh(new T.BoxGeometry(0.47, 0.1, 0.47), std(0x35d6ff, { emissive: 0x35d6ff, ei: 1 }));
    packet.add(stripe);
    g.add(packet);
    const revealed = new T.Group(); revealed.visible = false;
    const col = 0xff4dd8;
    const core = new T.Mesh(new T.IcosahedronGeometry(0.32, 0), std(col, { emissive: col, ei: 1.2 }));
    revealed.add(core);
    for (let i = 0; i < 6; i++) {
      const spike = new T.Mesh(new T.ConeGeometry(0.08, 0.4, 5), std(col, { emissive: col, ei: 0.9 }));
      const a = i / 6 * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0);
      spike.rotation.z = a - Math.PI / 2; revealed.add(spike);
    }
    const glow = glowSprite(col, 1.3, 0.5); revealed.add(glow);
    g.add(revealed);
    g.userData.anim = { packet, revealed, core, trojan: true };
  }
  function eRansom(g) {
    const col = 0xff5d3d;
    const body = new T.Mesh(new T.BoxGeometry(0.55, 0.65, 0.4), std(0x5e1a10, { emissive: col, ei: 0.4, metal: 0.4 }));
    body.position.y = 0.3; body.castShadow = true; g.add(body);
    const shackle = new T.Mesh(new T.TorusGeometry(0.22, 0.06, 8, 16, Math.PI), std(col, { emissive: col, ei: 0.9 }));
    shackle.position.y = 0.72; g.add(shackle);
    const keyhole = new T.Mesh(new T.CircleGeometry(0.09, 8), std(0x0a0503, { emissive: 0xffd23d, ei: 1 }));
    keyhole.position.set(0, 0.32, 0.21); g.add(keyhole);
    const cannon = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 0.5, 6), std(col, { emissive: col, ei: 1 }));
    cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 0.3, 0.4); g.add(cannon);
    const glow = glowSprite(col, 1.2, 0.45); glow.position.y = 0.3; g.add(glow);
    g.userData.anim = { body, cannon, glow };
  }
  function eAP(g) {
    const col = 0xffd23d;
    const body = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), std(0x5e4a10, { emissive: col, ei: 0.5, metal: 0.5 }));
    body.castShadow = true; g.add(body);
    const rotors = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const arm = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.08), std(0x333, { metal: 0.5 }));
      arm.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3); arm.rotation.y = -a; g.add(arm);
      const rotor = new T.Mesh(new T.BoxGeometry(0.4, 0.02, 0.06), std(col, { emissive: col, ei: 1 }));
      rotor.position.set(Math.cos(a) * 0.5, 0.15, Math.sin(a) * 0.5); g.add(rotor); rotors.push(rotor);
    }
    const glow = glowSprite(col, 1.3, 0.5); g.add(glow);
    g.userData.anim = { rotors, glow, fly: true };
  }
  function ePacker(g) {
    const col = 0xffa63d;
    const body = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.6, 6), std(0x5e3a10, { emissive: col, ei: 0.5, metal: 0.4 }));
    body.position.y = 0.3; body.castShadow = true; g.add(body);
    const plates = [];
    for (let i = 0; i < 6; i++) {
      const p = new T.Mesh(new T.BoxGeometry(0.22, 0.4, 0.05), std(col, { emissive: col, ei: 1, transparent: true, opacity: 0.85 }));
      const a = i / 6 * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6); p.rotation.y = -a; g.add(p); plates.push(p);
    }
    const glow = glowSprite(col, 1.5, 0.5); glow.position.y = 0.3; g.add(glow);
    g.userData.anim = { plates, glow, orbit: true };
  }
  function eBoss1(g) {
    const col = 0xb0ff4d;
    const body = new T.Mesh(new T.IcosahedronGeometry(1.2, 1), std(0x2a4a10, { emissive: col, ei: 0.5, metal: 0.4, rough: 0.5 }));
    body.position.y = 1.4; body.castShadow = true; g.add(body);
    const orbs = [];
    for (let i = 0; i < 8; i++) {
      const o = new T.Mesh(new T.SphereGeometry(0.25, 8, 8), std(col, { emissive: col, ei: 1.2 }));
      const a = i / 8 * Math.PI * 2;
      o.position.set(Math.cos(a) * 1.7, 1.4 + Math.sin(a * 2) * 0.4, Math.sin(a) * 1.7); g.add(o); orbs.push(o);
    }
    const eye = new T.Mesh(new T.SphereGeometry(0.4, 12, 12), std(0x0a1408, { emissive: 0xff3d3d, ei: 1.5 }));
    eye.position.set(0, 1.6, 1.0); g.add(eye);
    const glow = glowSprite(col, 5, 0.5); glow.position.y = 1.4; g.add(glow);
    g.userData.anim = { body, orbs, eye, glow, boss: 1 };
  }
  function eBoss2(g) {
    const col = 0x7de3ff;
    const body = new T.Mesh(new T.OctahedronGeometry(1.3, 0), std(0x103a4a, { emissive: col, ei: 0.6, metal: 0.6, rough: 0.3, transparent: true, opacity: 0.9 }));
    body.position.y = 1.5; body.castShadow = true; g.add(body);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new T.Mesh(new T.TorusGeometry(1.8 + i * 0.3, 0.05, 8, 32), std(col, { emissive: col, ei: 1.2 }));
      r.position.y = 1.5; r.rotation.x = Math.PI / 2 + i * 0.4; g.add(r); rings.push(r);
    }
    const glow = glowSprite(col, 5.5, 0.5); glow.position.y = 1.5; g.add(glow);
    g.userData.anim = { body, rings, glow, boss: 2 };
  }
  function eBoss3(g) {
    const col = 0xff3d6a;
    const body = new T.Mesh(new T.DodecahedronGeometry(1.2, 0), std(0x3a0a16, { emissive: col, ei: 0.6, metal: 0.5, rough: 0.4 }));
    body.position.y = 1.4; body.castShadow = true; g.add(body);
    const spikes = [];
    for (let i = 0; i < 10; i++) {
      const s = new T.Mesh(new T.ConeGeometry(0.18, 0.9, 5), std(col, { emissive: col, ei: 1 }));
      const a = i / 10 * Math.PI * 2, el = (i % 3 - 1) * 0.5;
      s.position.set(Math.cos(a) * 1.3, 1.4 + el, Math.sin(a) * 1.3);
      s.lookAt(new T.Vector3(Math.cos(a) * 3, 1.4 + el * 2, Math.sin(a) * 3)); s.rotateX(Math.PI / 2);
      g.add(s); spikes.push(s);
    }
    const eye = new T.Mesh(new T.SphereGeometry(0.35, 12, 12), std(0x0a0305, { emissive: 0xffd23d, ei: 1.6 }));
    eye.position.set(0, 1.6, 1.05); g.add(eye);
    const glow = glowSprite(col, 5.5, 0.55); glow.position.y = 1.4; g.add(glow);
    g.userData.anim = { body, spikes, eye, glow, boss: 3 };
  }

  // ============ 地形 ============
  M.makeCell = function (cell, theme, grid) {
    const th = THEMES[theme] || THEMES.corporate;
    const g = new T.Group();
    const t = cell.type;
    if (t === ND.CELL.LINK || t === ND.CELL.LEGACY || t === ND.CELL.NODE || t === ND.CELL.ENTRY || t === ND.CELL.EXIT) {
      const isLegacy = t === ND.CELL.LEGACY;
      const col = isLegacy ? th.legacy : th.link;
      const glow = isLegacy ? 0xffb13d : th.linkGlow;
      const baseCol = new T.Color(col).multiplyScalar(0.4).getHex();
      const pad = new T.Mesh(new T.BoxGeometry(1.96, 0.05, 1.96), std(glow, { emissive: glow, ei: 0.85, metal: 0.2, rough: 0.5 }));
      pad.position.y = 0.0; pad.receiveShadow = true; g.add(pad);
      const tile = new T.Mesh(new T.BoxGeometry(1.84, 0.16, 1.84), std(baseCol, { metal: 0.45, rough: 0.5, emissive: glow, ei: 0.05 }));
      tile.position.y = 0.07; tile.receiveShadow = true; g.add(tile);
      const core = new T.Mesh(new T.BoxGeometry(0.4, 0.03, 0.4), std(glow, { emissive: glow, ei: 0.5 }));
      core.position.y = 0.16; g.add(core);
      if (isLegacy) {
        for (let i = -1; i <= 1; i++) { const dash = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.12), std(0xffb13d, { emissive: 0xffb13d, ei: 1 })); dash.position.set(0, 0.17, i * 0.6); g.add(dash); }
      }
      g.userData.tile = tile; g.userData.edge = pad;
    } else if (t === ND.CELL.PLATFORM) {
      const base = new T.Mesh(new T.CylinderGeometry(0.95, 1.1, 0.7, 6), std(th.platform, { metal: 0.5, rough: 0.4 }));
      base.position.y = 0.35; base.castShadow = true; base.receiveShadow = true; g.add(base);
      const top = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 0.08, 6), std(th.accent, { emissive: th.accent, ei: 0.5 }));
      top.position.y = 0.72; g.add(top);
      const glow = glowSprite(th.accent, 2.2, 0.25); glow.position.y = 0.8; g.add(glow);
    } else if (t === ND.CELL.OBSTACLE) {
      const h = 0.8 + ((cell.x * 7 + cell.y * 13) % 3) * 0.5;
      const box = new T.Mesh(new T.BoxGeometry(1.6, h, 1.6), std(th.obstacle, { metal: 0.4, rough: 0.6 }));
      box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true; g.add(box);
      const light = new T.Mesh(new T.BoxGeometry(1.62, 0.08, 1.62), std(th.accent, { emissive: th.accent, ei: 0.8 }));
      light.position.y = h * 0.6; g.add(light);
      const glow = glowSprite(th.accent, 1.6, 0.2); glow.position.y = h; g.add(glow);
    }
    return g;
  };

  // 节点标记（通行状态）
  M.makeNodeMarker = function () {
    const g = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(0.85, 0.06, 8, 24), std(0x35d6ff, { emissive: 0x35d6ff, ei: 1.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const hex = new T.Mesh(new T.CircleGeometry(0.6, 6), new T.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.2, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    hex.rotation.x = -Math.PI / 2; hex.position.y = 0.05; g.add(hex);
    const glow = glowSprite(0x35d6ff, 2.0, 0.4); glow.position.y = 0.1; g.add(glow);
    g.userData.anim = { ring, hex, glow };
    return g;
  };

  // 入口 / 出口
  M.makeEntry = function (color) {
    const g = new T.Group();
    const arch = new T.Mesh(new T.TorusGeometry(0.9, 0.1, 8, 20, Math.PI), std(color, { emissive: color, ei: 1.2 }));
    arch.position.y = 0.9; g.add(arch);
    for (const s of [-1, 1]) { const post = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 0.9, 8), std(color, { emissive: color, ei: 0.8 })); post.position.set(s * 0.9, 0.45, 0); g.add(post); }
    const glow = glowSprite(color, 2.6, 0.6); glow.position.y = 0.9; g.add(glow);
    g.userData.anim = { glow, arch };
    return g;
  };
  M.makeExit = function (color) {
    const g = new T.Group();
    const core = new T.Mesh(new T.IcosahedronGeometry(0.8, 1), std(color, { emissive: color, ei: 1.4, metal: 0.5, rough: 0.3 }));
    core.position.y = 1.0; core.castShadow = true; g.add(core);
    const ring = new T.Mesh(new T.TorusGeometry(1.1, 0.06, 8, 24), std(color, { emissive: color, ei: 1 }));
    ring.position.y = 1.0; ring.rotation.x = Math.PI / 2; g.add(ring);
    const base = new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 0.3, 8), std(0x1a2733, { metal: 0.6 }));
    base.position.y = 0.15; base.receiveShadow = true; g.add(base);
    const glow = glowSprite(color, 3.2, 0.6); glow.position.y = 1.0; g.add(glow);
    g.userData.anim = { core, ring, glow };
    return g;
  };

  // ============ 环境 ============
  M.makeEnvironment = function (theme, w, h) {
    const th = THEMES[theme] || THEMES.corporate;
    const g = new T.Group();
    // 星空
    const starGeo = new T.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 600; i++) {
      const r = 60 + Math.random() * 80, a = Math.random() * Math.PI * 2, y = (Math.random() - 0.3) * 60;
      starPos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
    const stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0x8fb6ff, size: 0.5, transparent: true, opacity: 0.6, sizeAttenuation: true }));
    g.add(stars);
    // 协议层（下方纵深网格）
    for (let layer = 0; layer < 3; layer++) {
      const y = -6 - layer * 5, size = w * 2 + layer * 14;
      const gridH = new T.GridHelper(size, Math.floor(size / 3), th.accent, th.link);
      gridH.position.y = y; gridH.material.transparent = true; gridH.material.opacity = 0.18 - layer * 0.04;
      g.add(gridH);
    }
    // 远景网络集群
    for (let c = 0; c < 6; c++) {
      const a = c / 6 * Math.PI * 2 + 0.3, r = 45 + (c % 3) * 12;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = -2 + (c % 4) * 3;
      const cluster = new T.Group(); cluster.position.set(cx, cy, cz);
      const n = 4 + (c % 3);
      for (let i = 0; i < n; i++) {
        const node = new T.Mesh(new T.IcosahedronGeometry(0.8 + Math.random(), 0), std(th.accent, { emissive: th.accent, ei: 0.8 }));
        node.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
        cluster.add(node);
        const gl = glowSprite(th.accent, 3, 0.3); gl.position.copy(node.position); cluster.add(gl);
      }
      g.add(cluster);
    }
    // 数据流（往来粒子线）
    const streams = [];
    for (let s = 0; s < 8; s++) {
      const a = Math.random() * Math.PI * 2, r = 40;
      const from = new T.Vector3(Math.cos(a) * r, -4 + Math.random() * 8, Math.sin(a) * r);
      const to = new T.Vector3((Math.random() - 0.5) * w, 0, (Math.random() - 0.5) * h);
      const mid = from.clone().lerp(to, 0.5).add(new T.Vector3(0, 6 + Math.random() * 6, 0));
      const curve = new T.QuadraticBezierCurve3(from, mid, to);
      const pts = curve.getPoints(30);
      const geo = new T.BufferGeometry().setFromPoints(pts);
      const line = new T.Line(geo, new T.LineBasicMaterial({ color: th.linkGlow, transparent: true, opacity: 0.25 }));
      g.add(line);
      const packet = glowSprite(th.linkGlow, 1.2, 0.7); g.add(packet);
      streams.push({ curve, packet, t: Math.random(), speed: 0.05 + Math.random() * 0.08 });
    }
    g.userData.anim = { stars, streams };
    return g;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ND;
})(typeof window !== 'undefined' ? window : globalThis);