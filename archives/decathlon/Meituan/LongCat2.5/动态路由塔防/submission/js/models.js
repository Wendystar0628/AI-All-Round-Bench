// models.js —— 全程序化建模：场景设施、塔、敌人、Boss、图标
(function () {
  const M = {};
  G.models = M;

  const matCache = {};
  M.mat = function (color, o) {
    o = o || {};
    const key = color + '|' + (o.emissive || 0) + '|' + (o.ei || 0) + '|' + (o.metal ?? 0.6) + '|' + (o.rough ?? 0.5) + '|' + (o.opacity ?? 1) + '|' + (o.flat ? 1 : 0);
    if (o.noCache) return new THREE.MeshStandardMaterial({
      color, emissive: o.emissive || 0x000000, emissiveIntensity: o.ei == null ? 1 : o.ei,
      metalness: o.metal ?? 0.6, roughness: o.rough ?? 0.5,
      transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity ?? 1,
      flatShading: !!o.flat, side: o.side || THREE.FrontSide
    });
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial({
        color, emissive: o.emissive || 0x000000, emissiveIntensity: o.ei == null ? 1 : o.ei,
        metalness: o.metal ?? 0.6, roughness: o.rough ?? 0.5,
        transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity ?? 1,
        flatShading: !!o.flat, side: o.side || THREE.FrontSide
      });
    }
    return matCache[key];
  };
  M.basic = function (color, o) {
    o = o || {};
    return new THREE.MeshBasicMaterial({
      color, transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity ?? 1,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: o.dw === true, side: o.side || THREE.FrontSide
    });
  };

  function mesh(geo, material, x, y, z, parent, shadow) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    if (parent) parent.add(m);
    return m;
  }
  M.mesh = mesh;
  M.box = (w, h, d, mt, x, y, z, p, sh) => mesh(new THREE.BoxGeometry(w, h, d), mt, x, y, z, p, sh);
  M.cyl = (rt, rb, h, seg, mt, x, y, z, p, sh) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mt, x, y, z, p, sh);
  M.sph = (r, mt, x, y, z, p, ws, hs) => mesh(new THREE.SphereGeometry(r, ws || 16, hs || 12), mt, x, y, z, p);
  M.cone = (r, h, seg, mt, x, y, z, p) => mesh(new THREE.ConeGeometry(r, h, seg), mt, x, y, z, p);
  M.torus = (r, t, mt, x, y, z, p, rs, ts) => mesh(new THREE.TorusGeometry(r, t, rs || 8, ts || 24), mt, x, y, z, p);

  const METAL = 0x2a3442, METAL_D = 0x161d28, ACCENT = 0x3ee6ff, ACCENT2 = 0x2dd4bf;

  // ============ 塔 ============
  // 防火墙：链路上的壁垒，双塔柱 + 能量盾墙
  M.firewall = function (level) {
    const g = new THREE.Group(); const parts = {};
    const body = M.mat(METAL, { metal: 0.75, rough: 0.35 });
    const dark = M.mat(METAL_D, { metal: 0.7, rough: 0.4 });
    const glow = M.mat(ACCENT, { emissive: ACCENT, ei: 1.6, metal: 0.2, rough: 0.3 });
    const s = level >= 2 ? 1.25 : 1;
    parts.base = M.box(2.4 * s, 0.24, 2.4 * s, dark, 0, 0.12, 0, g);
    parts.pylons = [];
    [-1.05 * s, 1.05 * s].forEach(x => {
      const p = new THREE.Group(); p.position.set(x, 0, 0); g.add(p);
      M.box(0.42, 2.2 * s, 0.6, body, 0, 1.2 * s, 0, p);
      M.box(0.5, 0.16, 0.7, glow, 0, 2.45 * s, 0, p);
      M.box(0.5, 0.12, 0.7, glow, 0, 0.35, 0, p);
      parts.pylons.push(p);
    });
    parts.wall = M.box(1.9 * s, 1.7 * s, 0.1, M.basic(ACCENT, { opacity: 0.33, dw: false }), 0, 1.15 * s, 0, g, false);
    parts.wall2 = M.box(1.9 * s, 1.7 * s, 0.1, M.basic(ACCENT, { opacity: 0.33, dw: false }), 0, 1.15 * s, 0, g, false);
    parts.wall2.rotation.y = Math.PI / 2;
    parts.core = M.sph(0.28, glow, 0, 2.7 * s, 0, g);
    parts.antenna = M.cyl(0.03, 0.03, 0.9, 6, glow, 0, 3.2 * s, 0, g);
    if (level >= 2) {
      parts.plateL = M.box(0.9, 1.4, 0.08, body, -1.05 * s, 1.1, 0.85, g);
      parts.plateR = M.box(0.9, 1.4, 0.08, body, 1.05 * s, 1.1, 0.85, g);
      parts.ring = M.torus(1.5, 0.04, glow, 0, 2.9, 0, g);
      parts.ring.rotation.x = Math.PI / 2;
    }
    g.userData.parts = parts;
    return g;
  };

  // 蜜罐：诱饵终端 + 脉冲光环；分支：A 深诱（更多环与链） / B 硬化（装甲壳）
  M.honeypot = function (level, branch) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(METAL_D, { metal: 0.7, rough: 0.4 });
    const body = M.mat(0x3a2f4a, { metal: 0.6, rough: 0.4 });
    const lure = M.mat(0xff9de2, { emissive: 0xff5bc0, ei: 2.2, metal: 0.1, rough: 0.3 });
    const cy = M.mat(ACCENT, { emissive: ACCENT, ei: 1.5 });
    parts.base = M.cyl(1.0, 1.2, 0.3, 8, dark, 0, 0.15, 0, g);
    parts.ped = M.cyl(0.22, 0.34, 1.1, 8, body, 0, 0.85, 0, g);
    parts.orb = M.sph(0.5, lure, 0, 1.8, 0, g, 20, 14);
    parts.cap = M.cyl(0.62, 0.62, 0.1, 16, cy, 0, 1.28, 0, g);
    parts.rings = [];
    const rn = branch === 'A' ? 3 : 2;
    for (let i = 0; i < rn; i++) {
      const r = M.torus(0.75 + i * 0.28, 0.035, lure, 0, 1.8, 0, g);
      r.rotation.x = Math.PI / 2 + i * 0.35;
      parts.rings.push(r);
    }
    if (level >= 2) {
      const r2 = M.torus(1.65, 0.05, cy, 0, 1.1, 0, g); r2.rotation.x = Math.PI / 2; parts.rings.push(r2);
      parts.orb.scale.setScalar(1.15);
    }
    if (branch === 'B') {
      parts.shell = mesh(new THREE.IcosahedronGeometry(0.72, 0), M.mat(0x5a6a80, { metal: 0.8, rough: 0.3, flat: true }), 0, 1.8, 0, g);
      parts.shell.material.wireframe = true;
      parts.chains = [];
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const c = M.box(0.06, 0.9, 0.06, cy, Math.cos(a) * 0.85, 0.9, Math.sin(a) * 0.85, g);
        parts.chains.push(c);
      }
    } else if (branch === 'A') {
      parts.clawL = M.cone(0.1, 0.5, 6, cy, -0.5, 2.3, 0, g);
      parts.clawR = M.cone(0.1, 0.5, 6, cy, 0.5, 2.3, 0, g);
      parts.clawL.rotation.z = 0.5; parts.clawR.rotation.z = -0.5;
    }
    g.userData.parts = parts;
    return g;
  };

  // 网闸：节点隔离门架
  M.gateway = function (level) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(METAL_D, { metal: 0.75, rough: 0.35 });
    const body = M.mat(0x24405c, { metal: 0.7, rough: 0.35 });
    const glow = M.mat(ACCENT2, { emissive: ACCENT2, ei: 1.7 });
    const s = level >= 2 ? 1.2 : 1;
    parts.frameL = M.box(0.35, 2.4 * s, 0.35, body, -1.5 * s, 1.2 * s, 0, g);
    parts.frameR = M.box(0.35, 2.4 * s, 0.35, body, 1.5 * s, 1.2 * s, 0, g);
    parts.beam = M.box(3.4 * s, 0.3, 0.4, body, 0, 2.5 * s, 0, g);
    parts.beamGlow = M.box(3.0 * s, 0.1, 0.44, glow, 0, 2.32 * s, 0, g, false);
    parts.bars = [];
    const bn = level >= 2 ? 6 : 4;
    for (let i = 0; i < bn; i++) {
      const x = -1.2 * s + (2.4 * s) * (i / (bn - 1));
      const b = M.box(0.07, 2.0 * s, 0.07, glow, x, 1.25 * s, 0, g, false);
      parts.bars.push(b);
    }
    parts.core = M.sph(0.24, glow, 0, 2.9 * s, 0, g);
    if (level >= 2) {
      parts.spikeL = M.cone(0.16, 0.6, 4, body, -1.5 * s, 2.9 * s, 0, g);
      parts.spikeR = M.cone(0.16, 0.6, 4, body, 1.5 * s, 2.9 * s, 0, g);
      parts.skirt = M.cyl(1.9, 2.1, 0.2, 8, dark, 0, 0.1, 0, g);
    }
    g.userData.parts = parts;
    return g;
  };

  // 拦截器：平台炮塔，朝向由炮管指向；分支：贯穿（双管）/ 压制（宽口）
  M.interceptor = function (level, branch) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(METAL_D, { metal: 0.8, rough: 0.3 });
    const body = M.mat(0x2c4a66, { metal: 0.75, rough: 0.3 });
    const glow = M.mat(ACCENT, { emissive: ACCENT, ei: 1.8 });
    parts.base = M.cyl(0.95, 1.15, 0.35, 8, dark, 0, 0.18, 0, g);
    parts.column = M.cyl(0.3, 0.45, 0.7, 8, body, 0, 0.7, 0, g);
    parts.head = new THREE.Group(); parts.head.position.y = 1.35; g.add(parts.head);
    M.sph(0.5, body, 0, 0, 0, parts.head);
    M.sph(0.2, glow, 0, 0.25, 0.3, parts.head);
    parts.barrels = [];
    const mkBarrel = (x, r, len, mt) => {
      const b = M.cyl(r, r * 1.1, len, 8, mt, x, 0, len / 2 + 0.3, parts.head);
      b.rotation.x = Math.PI / 2;
      return b;
    };
    if (branch === 'suppress') {
      parts.barrels.push(mkBarrel(0, 0.22, 1.1, glow));
      parts.muzzleRing = M.torus(0.3, 0.05, glow, 0, 0, 1.35, parts.head);
      parts.dish = mesh(new THREE.ConeGeometry(0.55, 0.5, 12, 1, true), body, 0, 0, 1.05, parts.head);
      parts.dish.rotation.x = -Math.PI / 2;
    } else {
      parts.barrels.push(mkBarrel(-0.2, 0.09, 1.2, glow));
      parts.barrels.push(mkBarrel(0.2, 0.09, 1.2, glow));
      if (branch === 'pierce') {
        parts.rail = M.box(0.7, 0.08, 1.4, body, 0, 0.3, 0.7, parts.head);
        parts.tipL = M.cone(0.07, 0.25, 6, glow, -0.2, 0, 1.55, parts.head);
        parts.tipL.rotation.x = Math.PI / 2;
        parts.tipR = M.cone(0.07, 0.25, 6, glow, 0.2, 0, 1.55, parts.head);
        parts.tipR.rotation.x = Math.PI / 2;
      }
    }
    if (level >= 2) {
      parts.ring = M.torus(0.75, 0.04, glow, 0, 0, 0, parts.head);
      parts.ring.rotation.x = Math.PI / 2;
      parts.antenna = M.cyl(0.025, 0.025, 0.8, 5, glow, 0.35, 0.7, -0.2, parts.head);
    }
    g.userData.parts = parts;
    return g;
  };

  // 沙箱：检测穹顶 + 扫描环
  M.sandbox = function (level) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(METAL_D, { metal: 0.75, rough: 0.35 });
    const body = M.mat(0x3a5a4a, { metal: 0.6, rough: 0.4 });
    const glow = M.mat(0x59f29b, { emissive: 0x59f29b, ei: 1.8 });
    const s = level >= 2 ? 1.2 : 1;
    parts.base = M.cyl(1.0 * s, 1.2 * s, 0.3, 8, dark, 0, 0.15, 0, g);
    parts.mast = M.cyl(0.14, 0.2, 1.5 * s, 8, body, 0, 1.0 * s, 0, g);
    parts.eye = M.sph(0.34, glow, 0, 1.95 * s, 0, g);
    parts.dome = mesh(new THREE.SphereGeometry(1.15 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      M.basic(0x59f29b, { opacity: 0.14, dw: false }), 0, 0.32, 0, g, false);
    parts.rings = [];
    for (let i = 0; i < 2; i++) {
      const r = M.torus((0.7 + i * 0.35) * s, 0.03, glow, 0, 0.75 + i * 0.5, 0, g);
      r.rotation.x = Math.PI / 2;
      parts.rings.push(r);
    }
    if (level >= 2) {
      parts.ring2 = M.torus(1.5 * s, 0.045, glow, 0, 0.4, 0, g);
      parts.ring2.rotation.x = Math.PI / 2;
      parts.orbit = M.sph(0.16, glow, 1.3 * s, 1.9 * s, 0, g);
    }
    g.userData.parts = parts;
    return g;
  };

  // 修复进程：悬浮医疗无人机
  M.repair = function (level) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(METAL_D, { metal: 0.7, rough: 0.35 });
    const body = M.mat(0x2f5a52, { metal: 0.65, rough: 0.35 });
    const glow = M.mat(0x59f29b, { emissive: 0x59f29b, ei: 1.8 });
    const cross = M.mat(0xffffff, { emissive: 0xbfffe0, ei: 0.9 });
    parts.base = M.cyl(0.85, 1.05, 0.3, 8, dark, 0, 0.15, 0, g);
    parts.drone = new THREE.Group(); parts.drone.position.y = 1.5; g.add(parts.drone);
    M.sph(0.5, body, 0, 0, 0, parts.drone);
    M.sph(0.2, glow, 0, 0.3, 0, parts.drone);
    parts.crossV = M.box(0.34, 0.1, 0.06, cross, 0, 0, 0.48, parts.drone, false);
    parts.crossH = M.box(0.1, 0.34, 0.06, cross, 0, 0, 0.48, parts.drone, false);
    parts.rotors = [];
    [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]].forEach(p => {
      const r = M.box(0.5, 0.03, 0.08, dark, p[0], 0.25, p[1], parts.drone);
      parts.rotors.push(r);
    });
    parts.satellites = [];
    if (level >= 2) {
      for (let i = 0; i < 3; i++) {
        const s = M.sph(0.14, glow, 0, 0, 0, g);
        parts.satellites.push(s);
      }
    }
    g.userData.parts = parts;
    return g;
  };

  // ============ 敌人 ============
  // 蠕虫：分节身体
  M.worm = function (isCopy) {
    const g = new THREE.Group(); const parts = { segs: [] };
    const bodyMt = isCopy ? M.mat(0x9a5f2e, { metal: 0.3, rough: 0.6 }) : M.mat(0x7a4a22, { metal: 0.3, rough: 0.6 });
    const glow = M.mat(0xffb020, { emissive: 0xff8c1a, ei: 1.5 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = 0.34 * (1 - t * 0.55);
      const s = M.sph(r, i === 0 ? glow : bodyMt, 0, 0.36, -i * 0.42, g, 10, 8);
      parts.segs.push(s);
    }
    parts.head = parts.segs[0];
    parts.jawL = M.cone(0.08, 0.24, 5, glow, -0.14, 0.36, 0.3, g);
    parts.jawL.rotation.x = Math.PI / 2;
    parts.jawR = M.cone(0.08, 0.24, 5, glow, 0.14, 0.36, 0.3, g);
    parts.jawR.rotation.x = Math.PI / 2;
    parts.sting = M.cone(0.07, 0.3, 5, glow, 0, 0.36, -2.0, g);
    parts.sting.rotation.x = -Math.PI / 2;
    if (isCopy) g.scale.setScalar(0.72);
    g.userData.parts = parts;
    return g;
  };

  // 洪泛团：重型四足冲击单位
  M.flood = function () {
    const g = new THREE.Group(); const parts = { legs: [] };
    const armor = M.mat(0x8a4a1e, { metal: 0.55, rough: 0.5, flat: true });
    const dark = M.mat(0x3a2410, { metal: 0.6, rough: 0.5 });
    const glow = M.mat(0xff6a2e, { emissive: 0xff5a1a, ei: 1.8 });
    parts.body = M.box(1.3, 1.0, 1.7, armor, 0, 1.15, 0, g);
    parts.top = M.box(0.9, 0.4, 1.1, dark, 0, 1.8, -0.1, g);
    parts.eye = M.box(0.6, 0.14, 0.06, glow, 0, 1.35, 0.86, g, false);
    parts.ramL = M.box(0.24, 0.8, 0.5, dark, -0.8, 1.1, 0.6, g);
    parts.ramR = M.box(0.24, 0.8, 0.5, dark, 0.8, 1.1, 0.6, g);
    [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]].forEach((p, i) => {
      const leg = M.box(0.28, 0.9, 0.28, dark, p[0], 0.45, p[1], g);
      parts.legs.push(leg);
    });
    parts.spike = M.cone(0.16, 0.5, 5, glow, 0, 2.2, -0.2, g);
    g.userData.parts = parts;
    g.scale.setScalar(1.35);
    return g;
  };

  // 木马：伪装包裹；reveal 后露出尖刺与红光
  M.trojan = function () {
    const g = new THREE.Group(); const parts = {};
    const pkgMt = M.mat(0xdfe8f2, { metal: 0.15, rough: 0.7 });
    const strap = M.mat(0x3a6a9a, { metal: 0.4, rough: 0.5 });
    const evil = M.mat(0x5a1020, { metal: 0.4, rough: 0.5 });
    const glow = M.mat(0xff2e4e, { emissive: 0xff2e4e, ei: 2.0 });
    parts.pkg = M.box(0.95, 0.75, 1.15, pkgMt, 0, 0.62, 0, g);
    parts.strapV = M.box(0.14, 0.78, 1.18, strap, 0, 0.62, 0, g);
    parts.strapH = M.box(0.98, 0.78, 0.14, strap, 0, 0.62, 0, g);
    parts.tag = M.box(0.3, 0.2, 0.04, M.basic(ACCENT, { dw: false }), 0.3, 0.9, 0.6, g, false);
    parts.evil = new THREE.Group(); parts.evil.position.y = 0.62; g.add(parts.evil);
    parts.core = M.sph(0.3, glow, 0, 0, 0, parts.evil);
    parts.spikes = [];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const sp = M.cone(0.08, 0.5, 5, evil, Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5, parts.evil);
      sp.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      parts.spikes.push(sp);
    }
    parts.eyes = M.box(0.5, 0.1, 0.05, glow, 0, 0.1, 0.55, parts.evil, false);
    parts.evil.visible = false;
    parts.legs = [];
    [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.4], [0.3, -0.4]].forEach(p => {
      parts.legs.push(M.box(0.14, 0.35, 0.14, strap, p[0], 0.18, p[1], g));
    });
    g.userData.parts = parts;
    return g;
  };

  // 勒索者：悬浮刺球 + 触须
  M.ransom = function () {
    const g = new THREE.Group(); const parts = { tendrils: [] };
    const body = M.mat(0x4a2060, { metal: 0.5, rough: 0.4, flat: true });
    const glow = M.mat(0xd05bff, { emissive: 0xb96bff, ei: 2.0 });
    parts.orb = mesh(new THREE.IcosahedronGeometry(0.62, 0), body, 0, 1.25, 0, g);
    parts.core = M.sph(0.26, glow, 0, 1.25, 0, g);
    parts.spikes = [];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const sp = M.cone(0.09, 0.42, 5, glow, Math.cos(a) * 0.62, 1.25, Math.sin(a) * 0.62, g);
      sp.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      parts.spikes.push(sp);
    }
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const t = M.cyl(0.03, 0.015, 0.8, 5, body, Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3, g);
      parts.tendrils.push(t);
    }
    g.userData.parts = parts;
    return g;
  };

  // 伪热点：飞行无人机
  M.hotspot = function () {
    const g = new THREE.Group(); const parts = { blades: [] };
    const body = M.mat(0x5a2a52, { metal: 0.6, rough: 0.4 });
    const glow = M.mat(0xff5bd0, { emissive: 0xff5bd0, ei: 2.0 });
    parts.core = M.sph(0.34, body, 0, 0, 0, g, 12, 10);
    parts.eye = M.sph(0.14, glow, 0, 0, 0.28, g);
    parts.blades = [
      M.box(1.7, 0.04, 0.22, glow, 0, 0.3, 0, g, false),
      M.box(0.22, 0.04, 1.7, glow, 0, 0.3, 0, g, false)
    ];
    parts.tail = M.cone(0.08, 0.5, 5, body, 0, 0, -0.5, g);
    parts.tail.rotation.x = -Math.PI / 2;
    parts.glowRing = M.torus(0.55, 0.04, glow, 0, -0.2, 0, g);
    parts.glowRing.rotation.x = Math.PI / 2;
    g.userData.parts = parts;
    return g;
  };

  // 加壳器：护盾载具 + 轨道投射器
  M.sheller = function () {
    const g = new THREE.Group(); const parts = { sats: [] };
    const body = M.mat(0x6a5220, { metal: 0.7, rough: 0.35 });
    const glow = M.mat(0xffc23e, { emissive: 0xffb020, ei: 2.0 });
    parts.body = mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.7, 6), body, 0, 0.85, 0, g);
    parts.top = M.cone(0.45, 0.5, 6, glow, 0, 1.45, 0, g);
    for (let i = 0; i < 3; i++) {
      const s = M.sph(0.12, glow, 0, 1.0, 0, g);
      parts.sats.push(s);
    }
    parts.ring = M.torus(0.8, 0.03, glow, 0, 1.0, 0, g);
    parts.ring.rotation.x = Math.PI / 2;
    g.userData.parts = parts;
    return g;
  };

  // ============ Boss ============
  // 万傀：傀儡主脑 + 环绕子机群
  M.bossWankui = function () {
    const g = new THREE.Group(); const parts = { minions: [] };
    const armor = M.mat(0x3a1a2a, { metal: 0.7, rough: 0.35, flat: true });
    const glow = M.mat(0xff3e5e, { emissive: 0xff2e4e, ei: 2.2 });
    parts.body = mesh(new THREE.IcosahedronGeometry(1.5, 0), armor, 0, 2.4, 0, g);
    parts.core = M.sph(0.7, glow, 0, 2.4, 0, g);
    parts.crown = new THREE.Group(); parts.crown.position.y = 4.0; g.add(parts.crown);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const pod = M.sph(0.22, glow, Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0, parts.crown);
      parts.minions.push(pod);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8;
      const dr = new THREE.Group(); dr.position.y = 2.4; g.add(dr);
      const m = M.sph(0.24, armor, Math.cos(a) * 2.6, Math.sin(i * 2.1) * 0.4, Math.sin(a) * 2.6, dr);
      const e = M.sph(0.09, glow, Math.cos(a) * 2.6, Math.sin(i * 2.1) * 0.4, Math.sin(a) * 2.6 + 0.2, dr, false);
      dr.userData.phase = i;
      parts.minions.push(dr);
    }
    parts.ring1 = M.torus(2.2, 0.08, glow, 0, 2.4, 0, g);
    parts.ring1.rotation.x = Math.PI / 2;
    parts.legs = [];
    [[-1, 0.6], [1, 0.6], [-1, -0.6], [1, -0.6]].forEach(p => {
      parts.legs.push(M.box(0.4, 1.6, 0.4, armor, p[0] * 1.6, 0.8, p[1], g));
    });
    g.userData.parts = parts;
    g.scale.setScalar(1.5);
    return g;
  };

  // 蜃楼：路由幻蛇
  M.bossMirage = function () {
    const g = new THREE.Group(); const parts = { segs: [] };
    const ghost = M.mat(0x3a6a8a, { metal: 0.2, rough: 0.2, opacity: 0.55, noCache: true });
    ghost.side = THREE.DoubleSide;
    const glow = M.mat(0x6ad4ff, { emissive: 0x3ecfff, ei: 2.0 });
    let parent = g;
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Group();
      seg.position.z = -i * 0.85;
      parent.add(seg);
      const r = 0.75 * (1 - i / 10) + (i === 0 ? 0.25 : 0);
      M.sph(r, ghost, 0, 0, 0, seg, 12, 10);
      M.sph(r * 0.35, glow, 0, 0, 0, seg, 8, 6);
      parts.segs.push(seg);
      parent = seg;
    }
    parts.head = parts.segs[0];
    parts.halo = M.torus(1.0, 0.05, glow, 0, 0, 0.6, parts.head);
    parts.halo2 = M.torus(0.8, 0.04, glow, 0, 0, -0.6, parts.head);
    parts.halo2.rotation.x = 0.5;
    g.userData.parts = parts;
    g.scale.setScalar(1.6);
    return g;
  };

  // 蛰影：潜伏—提权—破坏 三阶段化身
  M.bossZheying = function () {
    const g = new THREE.Group(); const parts = {};
    const cloak = M.mat(0x1a2a3a, { metal: 0.4, rough: 0.5, flat: true });
    parts.cloak = mesh(new THREE.ConeGeometry(1.1, 3.0, 8), cloak, 0, 1.5, 0, g);
    parts.hood = M.sph(0.62, cloak, 0, 3.0, 0, g);
    parts.face = M.sph(0.3, M.mat(0x0a0a12, { metal: 0.1, rough: 0.9 }), 0, 2.95, 0.42, g);
    parts.eyeL = M.sph(0.08, M.mat(0x59f29b, { emissive: 0x59f29b, ei: 2.5 }), -0.14, 3.0, 0.6, g);
    parts.eyeR = M.sph(0.08, M.mat(0x59f29b, { emissive: 0x59f29b, ei: 2.5 }), 0.14, 3.0, 0.6, g);
    parts.clawL = new THREE.Group(); parts.clawL.position.set(-1.0, 2.0, 0.3); g.add(parts.clawL);
    parts.clawR = new THREE.Group(); parts.clawR.position.set(1.0, 2.0, 0.3); g.add(parts.clawR);
    [parts.clawL, parts.clawR].forEach(c => {
      M.box(0.16, 1.0, 0.16, cloak, 0, -0.4, 0, c);
      for (let i = 0; i < 3; i++) {
        const f = M.cone(0.04, 0.4, 4, M.mat(0x3ee6ff, { emissive: 0x3ee6ff, ei: 1.5 }), (i - 1) * 0.1, -1.0, 0, c);
        f.rotation.x = Math.PI;
      }
    });
    parts.aura = M.torus(1.3, 0.06, M.mat(0x59f29b, { emissive: 0x59f29b, ei: 2.0 }), 0, 0.25, 0, g);
    parts.aura.rotation.x = Math.PI / 2;
    parts.shoulders = M.box(2.2, 0.3, 0.5, cloak, 0, 2.6, 0, g);
    g.userData.parts = parts;
    g.scale.setScalar(1.7);
    return g;
  };

  // ============ 节点设施 ============
  M.junction = function () {
    const g = new THREE.Group(); const parts = {};
    const base = M.cyl(1.5, 1.7, 0.3, 8, M.mat(0x22303f, { metal: 0.8, rough: 0.3 }), 0, 0.15, 0, g);
    parts.base = base;
    parts.deck = M.cyl(1.25, 1.4, 0.22, 8, M.mat(0x2e4258, { metal: 0.75, rough: 0.3 }), 0, 0.4, 0, g);
    parts.ring = M.torus(1.05, 0.05, M.mat(ACCENT, { emissive: ACCENT, ei: 1.6 }), 0, 0.85, 0, g);
    parts.ring.rotation.x = Math.PI / 2;
    parts.core = M.sph(0.34, M.mat(ACCENT, { emissive: ACCENT, ei: 2.0 }), 0, 1.1, 0, g);
    parts.pylon = M.box(0.16, 1.1, 0.16, M.mat(0x3a4a5e, { metal: 0.8, rough: 0.3 }), 0.5, 0.95, 0.5, g);
    parts.pylon2 = M.box(0.16, 0.8, 0.16, M.mat(0x3a4a5e, { metal: 0.8, rough: 0.3 }), -0.5, 0.8, -0.5, g);
    parts.lights = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      parts.lights.push(M.box(0.12, 0.12, 0.12, M.mat(0x59f29b, { emissive: 0x59f29b, ei: 1.6 }), Math.cos(a) * 1.45, 0.34, Math.sin(a) * 1.45, g, false));
    }
    g.userData.parts = parts;
    return g;
  };

  M.entryPortal = function (color) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(0x1c2836, { metal: 0.8, rough: 0.3 });
    const glow = M.mat(color, { emissive: color, ei: 1.8 });
    parts.pylL = M.box(0.5, 3.2, 0.5, dark, -1.3, 1.6, 0, g);
    parts.pylR = M.box(0.5, 3.2, 0.5, dark, 1.3, 1.6, 0, g);
    parts.beam = M.box(3.2, 0.5, 0.6, dark, 0, 3.35, 0, g);
    parts.beamGlow = M.box(2.8, 0.12, 0.2, glow, 0, 3.12, 0, g, false);
    parts.disc = mesh(new THREE.CircleGeometry(1.15, 24), M.basic(color, { opacity: 0.4, dw: false, side: THREE.DoubleSide }), 0, 1.7, 0, g, false);
    parts.ring = M.torus(1.25, 0.06, glow, 0, 1.7, 0, g);
    parts.base = M.cyl(1.9, 2.1, 0.25, 8, dark, 0, 0.12, 0, g);
    g.userData.parts = parts;
    return g;
  };

  M.exitSpire = function (color) {
    const g = new THREE.Group(); const parts = {};
    const dark = M.mat(0x1c2836, { metal: 0.8, rough: 0.3 });
    const glow = M.mat(color, { emissive: color, ei: 2.0 });
    parts.base = M.cyl(1.8, 2.0, 0.3, 8, dark, 0, 0.15, 0, g);
    parts.c1 = mesh(new THREE.ConeGeometry(0.5, 2.6, 4), M.mat(0x2e4258, { metal: 0.8, rough: 0.25 }), 0, 1.6, 0, g);
    parts.c2 = mesh(new THREE.ConeGeometry(0.34, 1.8, 4), M.mat(0x2e4258, { metal: 0.8, rough: 0.25 }), 0.7, 1.1, 0.3, g);
    parts.c3 = mesh(new THREE.ConeGeometry(0.34, 1.8, 4), M.mat(0x2e4258, { metal: 0.8, rough: 0.25 }), -0.6, 1.1, -0.4, g);
    parts.tip = M.sph(0.22, glow, 0, 3.0, 0, g);
    parts.ring = M.torus(1.4, 0.045, glow, 0, 0.5, 0, g);
    parts.ring.rotation.x = Math.PI / 2;
    parts.beam = M.cyl(0.06, 0.14, 6, 8, M.basic(color, { opacity: 0.25, dw: false }), 0, 3.2, 0, g, false);
    g.userData.parts = parts;
    return g;
  };

  let rackTex = null;
  M.obstacleRack = function (seed) {
    const g = new THREE.Group();
    if (!rackTex) {
      rackTex = G.U.canvasTex(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#0c141e'; ctx.fillRect(0, 0, w, h);
        for (let y = 8; y < h - 8; y += 18) {
          ctx.fillStyle = '#16222f'; ctx.fillRect(8, y, w - 16, 12);
          for (let x = 12; x < w - 12; x += 10) {
            ctx.fillStyle = Math.random() < 0.5 ? '#2affa0' : (Math.random() < 0.5 ? '#1a5a70' : '#ffb020');
            ctx.globalAlpha = 0.5 + Math.random() * 0.5;
            ctx.fillRect(x, y + 3, 4, 3);
          }
          ctx.globalAlpha = 1;
        }
      });
    }
    const faceMat = new THREE.MeshStandardMaterial({ map: rackTex, metalness: 0.4, roughness: 0.7, emissive: 0x224455, emissiveMap: rackTex, emissiveIntensity: 0.6 });
    const sideMat = M.mat(0x141e2a, { metal: 0.6, rough: 0.5 });
    const mats = [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat];
    const n = 1 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const w = 2.2 + ((seed + i) % 3) * 0.5;
      const hgt = 2.0 + ((seed * 7 + i * 3) % 4) * 0.9;
      const m = mesh(new THREE.BoxGeometry(w, hgt, 1.6), mats, (i - (n - 1) / 2) * 2.6, hgt / 2, ((i * 13 + seed) % 5) * 0.2 - 0.4, g);
      m.rotation.y = (((seed * 3 + i) % 7) - 3) * 0.1;
    }
    return g;
  };

  M.platformPad = function (color) {
    const g = new THREE.Group(); const parts = {};
    parts.pad = M.cyl(1.55, 1.7, 0.22, 6, M.mat(0x243448, { metal: 0.8, rough: 0.3 }), 0, 0.11, 0, g);
    parts.rim = M.torus(1.5, 0.05, M.mat(color || ACCENT2, { emissive: color || ACCENT2, ei: 1.6 }), 0, 0.24, 0, g);
    parts.rim.rotation.x = Math.PI / 2;
    parts.inner = mesh(new THREE.CircleGeometry(1.25, 6), M.basic(color || ACCENT2, { opacity: 0.12, dw: false }), 0, 0.23, 0, g, false);
    parts.inner.rotation.x = -Math.PI / 2;
    g.userData.parts = parts;
    return g;
  };

  // 文字标签精灵
  M.textSprite = function (text, color, size, sub) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = sub ? 160 : 128;
    const ctx = cv.getContext('2d');
    ctx.font = 'bold 64px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, sub ? 56 : 64);
    if (sub) {
      ctx.font = 'bold 26px "Microsoft YaHei",sans-serif';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#cfe8ff';
      ctx.fillText(sub, 128, 118);
    }
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(size || 3, (size || 3) * (sub ? 0.625 : 0.5), 1);
    return sp;
  };

  // 血条（双精灵）
  M.hpBar = function (width) {
    const g = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0a1420, depthWrite: false, transparent: true, opacity: 0.85 }));
    bg.scale.set(width, width * 0.12, 1);
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x59f29b, depthWrite: false, transparent: true }));
    fg.scale.set(width * 0.96, width * 0.08, 1);
    fg.position.z = 0.001;
    g.add(bg); g.add(fg);
    g.userData = { fg, w: width * 0.96 };
    return g;
  };
  M.setHp = function (bar, frac, friendly) {
    frac = G.U.clamp(frac, 0, 1);
    const fg = bar.userData.fg;
    fg.scale.x = bar.userData.w * Math.max(frac, 0.001);
    fg.position.x = -bar.userData.w * (1 - frac) / 2;
    const c = friendly ? (frac > 0.5 ? 0x59f29b : frac > 0.25 ? 0xffb020 : 0xff4d5e)
                       : (frac > 0.5 ? 0xffb020 : 0xff4d5e);
    fg.material.color.setHex(c);
  };

  // ============ 图标绘制 ============
  const iconDrawers = {
    compute(ctx, s) { // 芯片
      ctx.strokeStyle = '#ffb020'; ctx.fillStyle = '#2a2010'; ctx.lineWidth = 3;
      ctx.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
      ctx.strokeRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
      ctx.fillStyle = '#ffb020';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(s * (0.12 + i * 0.08), s * 0.32, s * 0.04, s * 0.36);
        ctx.fillRect(s * (0.76 - i * 0.08) - s * 0.04, s * 0.32, s * 0.04, s * 0.36);
      }
      ctx.fillRect(s * 0.42, s * 0.42, s * 0.16, s * 0.16);
    },
    intel(ctx, s) { // 眼睛扫描
      ctx.strokeStyle = '#b96bff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(185,107,255,.15)';
      ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.38, s * 0.24, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b96bff';
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e3c9ff';
      ctx.beginPath(); ctx.moveTo(s * 0.1, s / 2); ctx.lineTo(s * 0.32, s / 2); ctx.moveTo(s * 0.68, s / 2); ctx.lineTo(s * 0.9, s / 2); ctx.stroke();
    },
    firewall(ctx, s) {
      ctx.fillStyle = '#233448'; ctx.strokeStyle = '#3ee6ff'; ctx.lineWidth = 2.5;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const off = (r % 2) * s * 0.16;
        ctx.fillRect(s * (0.14 + c * 0.28) + off - s * 0.16, s * (0.2 + r * 0.18), s * 0.24, s * 0.13);
        ctx.strokeRect(s * (0.14 + c * 0.28) + off - s * 0.16, s * (0.2 + r * 0.18), s * 0.24, s * 0.13);
      }
      ctx.fillStyle = 'rgba(62,230,255,.35)'; ctx.fillRect(s * 0.1, s * 0.12, s * 0.8, s * 0.76);
    },
    honeypot(ctx, s) {
      ctx.strokeStyle = '#ff5bc0'; ctx.fillStyle = 'rgba(255,91,192,.15)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.25); ctx.lineTo(s * 0.7, s * 0.25); ctx.lineTo(s * 0.82, s * 0.75); ctx.lineTo(s * 0.18, s * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9de2';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.48, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd0ec';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.48, s * 0.22, 0, Math.PI * 2); ctx.stroke();
    },
    gateway(ctx, s) {
      ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s * 0.22, s * 0.85); ctx.lineTo(s * 0.22, s * 0.15); ctx.lineTo(s * 0.78, s * 0.15); ctx.lineTo(s * 0.78, s * 0.85); ctx.stroke();
      ctx.lineWidth = 2.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(s * (0.22 + i * 0.14), s * 0.2); ctx.lineTo(s * (0.22 + i * 0.14), s * 0.8); ctx.stroke();
      }
      ctx.strokeStyle = '#8ff5e8';
      ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.45); ctx.lineTo(s * 0.7, s * 0.45); ctx.stroke();
    },
    interceptor(ctx, s) {
      ctx.strokeStyle = '#3ee6ff'; ctx.lineWidth = 3; ctx.fillStyle = '#12303f';
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#3ee6ff'; ctx.fillRect(-s * 0.05, -s * 0.42, s * 0.1, s * 0.5);
      ctx.restore();
      ctx.strokeStyle = '#bdf3ff';
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.06); ctx.lineTo(s / 2, s * 0.2); ctx.moveTo(s / 2, s * 0.8); ctx.lineTo(s / 2, s * 0.94);
      ctx.moveTo(s * 0.06, s / 2); ctx.lineTo(s * 0.2, s / 2); ctx.moveTo(s * 0.8, s / 2); ctx.lineTo(s * 0.94, s / 2); ctx.stroke();
    },
    sandbox(ctx, s) {
      ctx.strokeStyle = '#59f29b'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(89,242,155,.12)';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.58, s * 0.34, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#59f29b'; ctx.fillRect(s * 0.47, s * 0.4, s * 0.06, s * 0.3);
      ctx.beginPath(); ctx.arc(s * 0.5, s * 0.32, s * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9ffe2';
      ctx.beginPath(); ctx.ellipse(s / 2, s * 0.58, s * 0.44, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
    },
    repair(ctx, s) {
      ctx.strokeStyle = '#59f29b'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(89,242,155,.12)';
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d7ffe9';
      ctx.fillRect(s * 0.44, s * 0.3, s * 0.12, s * 0.4);
      ctx.fillRect(s * 0.3, s * 0.44, s * 0.4, s * 0.12);
    },
    isolator(ctx, s) {
      ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 3.5; ctx.fillStyle = '#123a35';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.55, s * 0.24, Math.PI, 0); ctx.stroke();
      ctx.fillRect(s * 0.28, s * 0.55, s * 0.44, s * 0.32); ctx.strokeRect(s * 0.28, s * 0.55, s * 0.44, s * 0.32);
      ctx.fillStyle = '#2dd4ff'; ctx.fillRect(s * 0.455, s * 0.64, s * 0.09, s * 0.14);
    },
    downgrade(ctx, s) {
      ctx.strokeStyle = '#b96bff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.3); ctx.lineTo(s * 0.8, s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.7); ctx.lineTo(s * 0.8, s * 0.7); ctx.stroke();
      ctx.strokeStyle = '#e3c9ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.2); ctx.lineTo(s / 2, s * 0.6); ctx.stroke();
      ctx.fillStyle = '#e3c9ff';
      ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.52); ctx.lineTo(s * 0.6, s * 0.52); ctx.lineTo(s / 2, s * 0.72); ctx.closePath(); ctx.fill();
    },
    restore(ctx, s) {
      ctx.strokeStyle = '#59f29b'; ctx.lineWidth = 3.5; ctx.fillStyle = 'rgba(89,242,155,.12)';
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#59f29b';
      ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.3); ctx.lineTo(s * 0.72, s * 0.62); ctx.lineTo(s * 0.28, s * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a1420'; ctx.fillRect(s * 0.47, s * 0.46, s * 0.06, s * 0.12);
    },
    worm(ctx, s) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.7); ctx.quadraticCurveTo(s * 0.35, s * 0.3, s * 0.55, s * 0.55); ctx.quadraticCurveTo(s * 0.7, s * 0.75, s * 0.8, s * 0.35); ctx.stroke();
      ctx.fillStyle = '#ffe1a1'; ctx.beginPath(); ctx.arc(s * 0.2, s * 0.7, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1420'; ctx.beginPath(); ctx.arc(s * 0.17, s * 0.68, s * 0.025, 0, Math.PI * 2); ctx.fill();
    },
    flood(ctx, s) {
      ctx.fillStyle = '#c96a2e'; ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      const pts = [[0.25, 0.8], [0.15, 0.4], [0.35, 0.2], [0.65, 0.2], [0.85, 0.4], [0.75, 0.8]];
      ctx.moveTo(s * pts[0][0], s * pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(s * p[0], s * p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8c4a'; ctx.fillRect(s * 0.4, s * 0.35, s * 0.2, s * 0.08);
    },
    trojan(ctx, s) {
      ctx.fillStyle = '#dfe8f2'; ctx.strokeStyle = '#3a6a9a'; ctx.lineWidth = 2.5;
      ctx.fillRect(s * 0.2, s * 0.32, s * 0.6, s * 0.45); ctx.strokeRect(s * 0.2, s * 0.32, s * 0.6, s * 0.45);
      ctx.strokeStyle = '#ff2e4e';
      ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.32); ctx.lineTo(s * 0.5, s * 0.77); ctx.stroke();
      ctx.fillStyle = '#ff2e4e'; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.55, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },
    ransom(ctx, s) {
      ctx.fillStyle = '#4a2060'; ctx.strokeStyle = '#b96bff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e3c9ff'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(s / 2 + Math.cos(a) * s * 0.3, s / 2 + Math.sin(a) * s * 0.3);
        ctx.lineTo(s / 2 + Math.cos(a) * s * 0.44, s / 2 + Math.sin(a) * s * 0.44); ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },
    hotspot(ctx, s) {
      ctx.strokeStyle = '#ff5bd0'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(255,91,208,.2)';
      ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.42, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.25); ctx.lineTo(s / 2, s * 0.75); ctx.moveTo(s * 0.28, s / 2); ctx.lineTo(s * 0.72, s / 2); ctx.stroke();
      ctx.fillStyle = '#ffd0ec'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },
    sheller(ctx, s) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(255,176,32,.15)';
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.2); ctx.lineTo(s * 0.8, s * 0.45); ctx.lineTo(s * 0.68, s * 0.8); ctx.lineTo(s * 0.32, s * 0.8); ctx.lineTo(s * 0.2, s * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffe1a1';
      ctx.beginPath(); ctx.ellipse(s / 2, s * 0.45, s * 0.36, s * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s / 2, s * 0.45, s * 0.2, s * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
    },
    boss(ctx, s) {
      ctx.fillStyle = '#5a1020'; ctx.strokeStyle = '#ff2e4e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.15); ctx.lineTo(s * 0.85, s * 0.4); ctx.lineTo(s * 0.75, s * 0.85); ctx.lineTo(s * 0.25, s * 0.85); ctx.lineTo(s * 0.15, s * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8ca0';
      ctx.beginPath(); ctx.arc(s * 0.38, s * 0.48, s * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.62, s * 0.48, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },
    core(ctx, s) {
      ctx.strokeStyle = '#3ee6ff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(62,230,255,.15)';
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.12); ctx.lineTo(s * 0.85, s * 0.5); ctx.lineTo(s / 2, s * 0.88); ctx.lineTo(s * 0.15, s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#bdf3ff'; ctx.beginPath(); ctx.arc(s / 2, s * 0.5, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },
    shield(ctx, s) {
      ctx.strokeStyle = '#6ad4ff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(106,212,255,.15)';
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.12); ctx.lineTo(s * 0.82, s * 0.28); ctx.lineTo(s * 0.82, s * 0.6); ctx.quadraticCurveTo(s * 0.82, s * 0.85, s / 2, s * 0.9); ctx.quadraticCurveTo(s * 0.18, s * 0.85, s * 0.18, s * 0.6); ctx.lineTo(s * 0.18, s * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    lock(ctx, s) {
      ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 3.5; ctx.fillStyle = '#2a0e14';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.52, s * 0.22, Math.PI, 0); ctx.stroke();
      ctx.fillRect(s * 0.3, s * 0.52, s * 0.4, s * 0.34); ctx.strokeRect(s * 0.3, s * 0.52, s * 0.4, s * 0.34);
      ctx.strokeStyle = '#ffc9ce'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.6); ctx.lineTo(s / 2, s * 0.72); ctx.stroke();
    }
  };
  M.drawIcon = function (canvas, name) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    const fn = iconDrawers[name];
    if (fn) fn(ctx, s);
    return canvas;
  };
  M.iconCanvas = function (name, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size || 52;
    M.drawIcon(c, name);
    return c;
  };
})();
