// 程序化建模：设备、敌人、Boss 与地块装饰。所有材质与几何体都会缓存复用。
(function () {
  const T = window.THREE;
  const cache = new Map();
  let trojLabel = null;

  function mat(key, p) {
    let m = cache.get(key);
    if (!m) {
      const o = Object.assign({ color: 0x888888, roughness: 0.6, metalness: 0.2 }, p || {});
      if (o.emissive == null) o.emissive = 0x000000;
      m = o.physical ? new T.MeshPhysicalMaterial(o) : new T.MeshStandardMaterial(o);
      m.__shared = true;
      if (o.transparent) m.depthWrite = false;
      cache.set(key, m);
    }
    return m;
  }
  function geo(key, make) {
    let g = cache.get('g:' + key);
    if (!g) { g = make(); g.__shared = true; cache.set('g:' + key, g); }
    return g;
  }
  const box = (w, h, d) => geo(`box:${w}:${h}:${d}`, () => new T.BoxGeometry(w, h, d));
  const cyl = (rt, rb, h, s) => geo(`cyl:${rt}:${rb}:${h}:${s}`, () => new T.CylinderGeometry(rt, rb, h, s || 24));
  const sph = (r, s) => geo(`sph:${r}:${s}`, () => new T.SphereGeometry(r, s || 20, Math.max(10, (s || 20) * 0.7)));
  const tor = (r, t, a, b) => geo(`tor:${r}:${t}:${a}:${b}`, () => new T.TorusGeometry(r, t, 10, 36, a || Math.PI * 2));
  const cone = (r, h, s) => geo(`cone:${r}:${h}:${s}`, () => new T.ConeGeometry(r, h, s || 8));
  const ico = (r, d) => geo(`ico:${r}:${d}`, () => new T.IcosahedronGeometry(r, d || 0));
  const oct = (r) => geo(`oct:${r}`, () => new T.OctahedronGeometry(r, 0));
  const dodec = (r) => geo(`dod:${r}`, () => new T.DodecahedronGeometry(r, 0));

  function mesh(g, m, parent, x, y, z) {
    const o = new T.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    if (x != null) o.position.set(x, y || 0, z || 0);
    if (parent) parent.add(o);
    return o;
  }
  function grp(parent, x, y, z) {
    const g = new T.Group();
    if (x != null) g.position.set(x, y || 0, z || 0);
    if (parent) parent.add(g);
    return g;
  }

  // 一些常用材质
  const STEEL = (c) => mat('steel' + c, { color: c || 0x3a4458, metalness: 0.7, roughness: 0.35 });
  const DARK = mat('dark', { color: 0x12182a, metalness: 0.5, roughness: 0.6 });
  const glowM = (c, e) => mat('glow' + c + '_' + (e || 1), { color: c, emissive: c, emissiveIntensity: e || 1.2, roughness: 0.3, metalness: 0.1 });
  const glassM = (c, op) => mat('glass' + c + op, { color: c, transparent: true, opacity: op || 0.35, roughness: 0.1, metalness: 0.0, emissive: c, emissiveIntensity: 0.25 });

  // ---------- 设备 ----------
  const TOWER_COLOR = {
    firewall: 0xff8c42, honeypot: 0xffc857, gateway: 0x4dabf7, interceptor: 0x3de0ff,
    sandbox: 0xb388ff, repair: 0x6ef3a5,
  };

  function buildTower(kind, level, branch) {
    const root = new T.Group();
    const parts = {};
    const plinth = mesh(cyl(0.42, 0.46, 0.14, 28), STEEL(0x242c40), root, 0, 0.07, 0);
    parts.plinth = plinth;
    const ring = mesh(tor(0.42, 0.018, null, null), glowM(TOWER_COLOR[kind] || 0xffffff, 1.4), root, 0, 0.16, 0);
    ring.rotation.x = Math.PI / 2;
    parts.ring = ring;
    const body = grp(root, 0, 0.14, 0);
    parts.body = body;
    const C = TOWER_COLOR[kind] || 0xffffff;
    const up = level >= 2;
    switch (kind) {
      case 'firewall': {
        // 砖墙式防火墙：堆叠的装甲块 + 顶部能量护罩
        mesh(box(0.66, 0.44, 0.66), mat('fw_steel', { color: 0x4a2f2a, metalness: 0.6, roughness: 0.45 }), body, 0, 0.22, 0);
        for (let i = 0; i < 4; i++) {
          mesh(box(0.1, 0.07, 0.68), glowM(C, 0.8), body, -0.27 + i * 0.18, 0.02 + (i % 2) * 0.0, 0).visible = i % 2 === 0;
        }
        const shield = mesh(tor(0.46, 0.035, Math.PI, null), glassM(C, 0.7), body, 0, 0.5, 0);
        shield.rotation.z = Math.PI / 2;
        shield.rotation.y = Math.PI / 2;
        shield.material = glowM(C, 1.1);
        parts.shield = shield;
        for (let i = 0; i < 3; i++) {
          const sp = mesh(cone(0.06, 0.22, 6), mat('fw_spike', { color: 0xffb08a, emissive: 0xff7a3a, emissiveIntensity: 0.6 }), body, -0.18 + i * 0.18, 0.56, 0);
          parts.spikes = (parts.spikes || []).concat([sp]);
        }
        if (up) {
          mesh(box(0.5, 0.2, 0.5), mat('fw_steel2', { color: 0x5b3a31, metalness: 0.6, roughness: 0.4 }), body, 0, 0.56, 0);
          const sh2 = mesh(tor(0.6, 0.03, Math.PI * 1.2, null), glowM(C, 1.2), body, 0, 0.62, 0);
          sh2.rotation.x = Math.PI / 2;
          parts.shield2 = sh2;
        }
        break;
      }
      case 'honeypot': {
        // 蜜罐：发光的陶罐 + 漂浮的诱饵
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const k = i / 12;
          const r = 0.18 + 0.2 * Math.sin(Math.PI * Math.min(1, k * 1.05)) * (1 - k * 0.3);
          pts.push(new T.Vector2(Math.max(0.05, r), 0.02 + k * 0.5));
        }
        const jar = mesh(geo('jar', () => new T.LatheGeometry(pts, 24)), mat('hp_jar', { color: 0xffb547, emissive: 0xff9a1a, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 }), body, 0, 0, 0);
        parts.jar = jar;
        const core = mesh(sph(0.12, 16), glowM(0xffe08a, 2.2), body, 0, 0.3, 0);
        parts.core = core;
        const coins = [];
        for (let i = 0; i < 3; i++) {
          const c = mesh(cyl(0.05, 0.05, 0.02, 14), glowM(0xffd166, 1.6), body, 0, 0.5, 0);
          coins.push(c);
        }
        parts.coins = coins;
        const halo = mesh(tor(0.34, 0.012, null, null), glassM(0xffd166, 0.6), body, 0, 0.12, 0);
        halo.rotation.x = Math.PI / 2;
        parts.halo = halo;
        if (up) {
          const r2 = mesh(tor(0.28, 0.02, null, null), glowM(0xffb547, 1.4), body, 0, 0.62, 0);
          r2.rotation.x = Math.PI / 2;
          parts.r2 = r2;
        }
        if (branch === 'mesh') {
          parts.decoys = [0, 1].map((i) => {
            const d = mesh(sph(0.16, 14), glassM(0xffd166, 0.25), body, Math.cos(i * 3.2) * 0.5, 0.42, Math.sin(i * 3.2) * 0.5);
            return d;
          });
        }
        if (branch === 'trap') {
          const spikes = [];
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const s = mesh(cone(0.05, 0.22, 5), mat('hp_spike', { color: 0x9a6a2a, metalness: 0.5, roughness: 0.4 }), root, Math.cos(a) * 0.46, 0.12, Math.sin(a) * 0.46);
            s.rotation.z = Math.cos(a) * 0.5; s.rotation.x = Math.sin(a) * 0.5;
            spikes.push(s);
          }
          parts.spikes = spikes;
        }
        break;
      }
      case 'gateway': {
        // 网闸：门框式结构 + 旋转的隔离环 + 蓝色屏障
        const pillarM = mat('gw_steel', { color: 0x2b3f5c, metalness: 0.75, roughness: 0.3 });
        mesh(box(0.12, 0.64, 0.12), pillarM, body, -0.26, 0.32, 0);
        mesh(box(0.12, 0.64, 0.12), pillarM, body, 0.26, 0.32, 0);
        mesh(box(0.66, 0.12, 0.14), pillarM, body, 0, 0.66, 0);
        const barrier = mesh(box(0.42, 0.5, 0.02), glassM(0x4dabf7, 0.28), body, 0, 0.35, 0);
        parts.barrier = barrier;
        const ring = mesh(tor(0.3, 0.025, null, null), glowM(0x4dabf7, 1.5), body, 0, 0.66, 0);
        ring.rotation.x = Math.PI / 2;
        parts.ring2 = ring;
        if (up) {
          mesh(cyl(0.035, 0.035, 0.55, 8), STEEL(0x8fb3ff), body, -0.2, 0.3, 0.18).rotation.z = 0.12;
          mesh(cyl(0.035, 0.035, 0.55, 8), STEEL(0x8fb3ff), body, 0.2, 0.3, 0.18).rotation.z = -0.12;
          mesh(box(0.66, 0.05, 0.3), pillarM, body, 0, 0.1, 0);
        }
        break;
      }
      case 'interceptor': {
        // 拦截器：旋转炮塔 + 炮管，升级分支改变炮管
        const base = mesh(cyl(0.2, 0.24, 0.22, 20), STEEL(0x2c3a52), body, 0, 0.12, 0);
        const turret = grp(body, 0, 0.22, 0);
        parts.turret = turret;
        mesh(box(0.42, 0.22, 0.34), mat('ri_body', { color: 0x2c3e5c, metalness: 0.6, roughness: 0.35 }), turret, 0, 0.1, 0);
        const barrelLen = branch === 'pierce' ? 0.95 : 0.66;
        const barrel = mesh(cyl(0.05, 0.065, barrelLen, 12), STEEL(0x9fb0c8), turret, 0.25 + barrelLen / 2 - 0.1, 0.12, 0);
        barrel.rotation.z = Math.PI / 2;
        parts.barrel = barrel;
        parts.barrelLen = barrelLen;
        const eye = mesh(sph(0.07, 12), glowM(C, 2), turret, 0.14, 0.2, 0);
        parts.eye = eye;
        if (branch === 'pierce') {
          for (let i = 0; i < 3; i++) {
            const coil = mesh(tor(0.085, 0.012, null, null), glowM(0x9ff7ff, 1.6), turret, 0.42 + i * 0.22, 0.12, 0);
            coil.rotation.y = Math.PI / 2;
            parts.coils = (parts.coils || []).concat([coil]);
          }
        }
        if (branch === 'suppress') {
          const dish = mesh(cone(0.22, 0.14, 16), mat('ri_dish', { color: 0xbfeaff, metalness: 0.3, roughness: 0.25, emissive: 0x2a88ff, emissiveIntensity: 0.25 }), turret, -0.08, 0.36, 0);
          dish.rotation.z = Math.PI / 2;
          dish.rotation.y = 0;
          parts.dish = dish;
          const fins = [];
          for (let i = 0; i < 4; i++) {
            const f = mesh(box(0.14, 0.02, 0.05), STEEL(0x9fdfff), turret, -0.25, 0.14, 0);
            f.rotation.y = (i * Math.PI) / 2;
            fins.push(f);
          }
          parts.fins = fins;
        }
        if (up) {
          mesh(box(0.22, 0.08, 0.2), mat('ri_up', { color: 0x203046, metalness: 0.7, roughness: 0.3 }), turret, -0.12, 0.28, 0);
        }
        break;
      }
      case 'sandbox': {
        // 沙箱：透明隔离箱，内部旋转的检测核心与扫描环
        const box1 = mesh(box(0.56, 0.56, 0.56), glassM(0xb388ff, 0.2), body, 0, 0.3, 0);
        parts.glass = box1;
        const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.56, 0.56, 0.56)), new T.LineBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.85 }));
        edge.position.y = 0.3;
        body.add(edge);
        parts.edge = edge;
        const core = mesh(oct(0.17), glowM(0xb388ff, 1.6), body, 0, 0.3, 0);
        parts.core = core;
        const scan = mesh(tor(0.34, 0.012, null, null), glowM(0xd8c2ff, 2), body, 0, 0.3, 0);
        scan.rotation.x = Math.PI / 2;
        parts.scan = scan;
        if (up) {
          const outer = mesh(box(0.7, 0.7, 0.7), glassM(0xb388ff, 0.07), body, 0, 0.36, 0);
          parts.outer = outer;
          const edge2 = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.7, 0.7, 0.7)), new T.LineBasicMaterial({ color: 0x9d7bff, transparent: true, opacity: 0.5 }));
          edge2.position.y = 0.36;
          body.add(edge2);
        }
        break;
      }
      case 'repair': {
        // 修复进程：白色支柱 + 绿色十字 + 环绕的修复无人机
        mesh(cyl(0.12, 0.16, 0.7, 14), mat('rp_white', { color: 0xe7f3ee, metalness: 0.2, roughness: 0.35 }), body, 0, 0.36, 0);
        mesh(box(0.34, 0.1, 0.1), glowM(0x6ef3a5, 1.6), body, 0, 0.62, 0);
        mesh(box(0.1, 0.34, 0.1), glowM(0x6ef3a5, 1.6), body, 0, 0.62, 0);
        const halo = mesh(tor(0.34, 0.02, null, null), glowM(0x6ef3a5, 1.2), body, 0, 0.25, 0);
        halo.rotation.x = Math.PI / 2;
        parts.halo = halo;
        const drones = [];
        const n = up ? 4 : 3;
        for (let i = 0; i < n; i++) drones.push(mesh(sph(0.055, 10), glowM(0x9affc6, 1.8), body, 0, 0.6, 0));
        parts.drones = drones;
        if (up) mesh(cyl(0.18, 0.2, 0.12, 14), mat('rp_base2', { color: 0x2c4a3e, metalness: 0.5, roughness: 0.4 }), body, 0, 0.9, 0);
        break;
      }
    }
    parts.level = level;
    parts.kind = kind;
    parts.angle = 0;
    parts.recoil = 0;
    return {
      group: root, parts, kind,
      update(t, st) { updateTower(parts, kind, t, st); },
    };
  }

  function updateTower(p, kind, t, st) {
    const s = st || {};
    switch (kind) {
      case 'firewall':
        if (p.shield) p.shield.rotation.z = Math.PI / 2 + Math.sin(t * 1.5) * 0.05;
        if (p.ring) p.ring.rotation.z = t * 0.6;
        break;
      case 'honeypot':
        if (p.jar) p.jar.rotation.y = Math.sin(t * 0.5) * 0.1;
        if (p.coins) p.coins.forEach((c, i) => { const a = t * 1.3 + (i * Math.PI * 2) / 3; c.position.set(Math.cos(a) * 0.36, 0.45 + Math.sin(t * 2 + i) * 0.04, Math.sin(a) * 0.36); c.rotation.x = Math.PI / 2 + Math.sin(t * 3 + i) * 0.4; });
        if (p.halo) p.halo.rotation.z = t * 0.8;
        if (p.core) p.core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
        if (p.decoys) p.decoys.forEach((d, i) => { const a = t * 0.8 + i * 3.2; d.position.set(Math.cos(a) * 0.5, 0.42 + Math.sin(t * 1.5 + i) * 0.05, Math.sin(a) * 0.5); });
        break;
      case 'gateway':
        if (p.ring2) p.ring2.rotation.z = t * 1.4;
        if (p.barrier) p.barrier.material.opacity = 0.22 + 0.08 * Math.sin(t * 2.2);
        break;
      case 'interceptor':
        if (p.turret) p.turret.rotation.y = -(st && st.angle != null ? st.angle : 0) + Math.PI / 2 + (st && st.aimAngle != null ? 0 : 0);
        if (p.barrel) { p.recoil = Math.max(0, (p.recoil || 0) - 0.05); p.barrel.position.x = 0.25 + (p.barrelLen / 2 - 0.1) - p.recoil; }
        if (p.coils) p.coils.forEach((c, i) => { c.material.opacity = 1; c.scale.setScalar(1 + Math.sin(t * 6 - i) * 0.05); });
        if (p.dish) p.dish.rotation.y = t * 0.8;
        break;
      case 'sandbox':
        if (p.core) { p.core.rotation.y = t * 1.5; p.core.rotation.x = t * 0.7; }
        if (p.scan) { const y = 0.3 + 0.22 * Math.sin(t * 1.4); p.scan.position.y = y; }
        if (p.edge) p.edge.rotation.y = t * 0.1;
        break;
      case 'repair':
        if (p.drones) p.drones.forEach((d, i) => { const a = t * 1.8 + (i * Math.PI * 2) / p.drones.length; d.position.set(Math.cos(a) * 0.42, 0.66 + Math.sin(t * 3 + i) * 0.05, Math.sin(a) * 0.42); });
        if (p.halo) { p.halo.rotation.z = t; p.halo.scale.setScalar(1 + Math.sin(t * 2) * 0.06); }
        break;
    }
    if (p.shield2) p.shield2.rotation.z = t * 0.9;
  }

  // ---------- 敌人 ----------
  const ENEMY_COLOR = { worm: 0xff5f6d, flood: 0xff8fa3, trojan: 0xc5c9d6, ransom: 0xb07cff, hotspot: 0x7cf9ff, packer: 0xffc857 };

  function buildEnemy(type, clone) {
    const root = new T.Group();
    const parts = { type };
    const C = ENEMY_COLOR[type] || 0xffffff;
    const body = grp(root, 0, 0, 0);
    parts.body = body;
    switch (type) {
      case 'worm': {
        const segs = [];
        for (let i = 0; i < 5; i++) {
          const r = 0.2 - i * 0.022;
          const s = mesh(sph(r, 14), mat('worm_body' + (clone ? 'c' : ''), { color: clone ? 0xff8a5c : 0xc0304a, emissive: 0x3a0010, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.1 }), body, -i * 0.2, r + 0.02, 0);
          segs.push(s);
        }
        const head = mesh(sph(0.22, 16), mat('worm_head', { color: 0xff3d5a, emissive: 0x7a0016, emissiveIntensity: 0.6, roughness: 0.35 }), body, 0.2, 0.25, 0);
        mesh(sph(0.045, 8), glowM(0xffffff, 3), head, 0.16, 0.07, 0.1);
        mesh(sph(0.045, 8), glowM(0xffffff, 3), head, 0.16, 0.07, -0.1);
        parts.segs = segs; parts.head = head;
        break;
      }
      case 'flood': {
        parts.core = mesh(sph(0.2, 16), mat('flood_core', { color: 0xff8fa3, emissive: 0x7a1030, emissiveIntensity: 0.7, roughness: 0.3 }), body, 0, 0.32, 0);
        parts.blobs = [];
        for (let i = 0; i < 6; i++) parts.blobs.push(mesh(ico(0.1, 0), glowM(C, 0.9), body, 0, 0.32, 0));
        break;
      }
      case 'trojan': {
        const disguise = grp(body, 0, 0, 0);
        if (!trojLabel) trojLabel = canvasTex(64, 64, (c) => { c.fillStyle = '#e8f6ff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#2a6fb0'; c.fillRect(0, 22, 64, 20); c.fillStyle = '#103050'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText('PKT', 32, 38); });
        mesh(box(0.36, 0.3, 0.34), mat('troj_box', { color: 0xd4dbe8, roughness: 0.6, metalness: 0.1 }), disguise, 0, 0.17, 0);
        mesh(box(0.37, 0.05, 0.35), mat('troj_tape', { map: trojLabel, color: 0xffffff, roughness: 0.5 }), disguise, 0, 0.33, 0);
        parts.disguise = disguise;
        const real = grp(body, 0, 0, 0);
        real.visible = false;
        mesh(sph(0.2, 16), mat('troj_real', { color: 0x2a2f3c, roughness: 0.5, metalness: 0.4 }), real, 0, 0.22, 0);
        mesh(box(0.22, 0.14, 0.2), mat('troj_real2', { color: 0x2a2f3c, roughness: 0.5 }), real, 0.15, 0.22, 0);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          mesh(cone(0.04, 0.22, 5), glowM(0xff3d5a, 1.6), real, Math.cos(a) * 0.18, 0.4, Math.sin(a) * 0.18);
        }
        mesh(sph(0.04, 8), glowM(0xff2a4a, 3), real, 0.22, 0.25, 0.08);
        mesh(sph(0.04, 8), glowM(0xff2a4a, 3), real, 0.22, 0.25, -0.08);
        parts.real = real;
        break;
      }
      case 'ransom': {
        // 勒索者：深紫色的壳体、发光的锁形核心、下垂的触须与前端的加密炮口
        mesh(box(0.42, 0.34, 0.38), mat('ran_body', { color: 0x3a2b5e, roughness: 0.45, metalness: 0.3 }), body, 0, 0.22, 0);
        mesh(box(0.44, 0.06, 0.4), mat('ran_rim', { color: 0x1e1433, roughness: 0.5, metalness: 0.5 }), body, 0, 0.4, 0);
        mesh(box(0.02, 0.05, 0.36), glowM(0xc49bff, 2.4), body, 0.215, 0.26, 0);
        const lock = grp(body, 0, 0.5, 0);
        mesh(box(0.2, 0.16, 0.16), glowM(0xb07cff, 1.6), lock, 0, 0, 0);
        mesh(tor(0.08, 0.02, Math.PI, null), mat('ran_shackle', { color: 0xd9c8ff, metalness: 0.8, roughness: 0.2 }), lock, 0, 0.12, 0).rotation.z = 0;
        parts.lock = lock;
        parts.tentacles = [];
        for (let i = 0; i < 4; i++) {
          const tent = grp(body, 0, 0.1, 0);
          tent.position.set(-0.12, 0.1, -0.18 + i * 0.12);
          const seg = mesh(cyl(0.025, 0.012, 0.42, 6), mat('ran_tent', { color: 0x6d4ac0, roughness: 0.5 }), tent, -0.16, -0.14, 0);
          seg.rotation.z = 0.7;
          mesh(sph(0.03, 8), glowM(0xe2d0ff, 2.6), tent, -0.3, -0.28, 0);
          parts.tentacles.push(tent);
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          mesh(cone(0.05, 0.14, 5), mat('ran_spike', { color: 0x1a1230, metalness: 0.5, roughness: 0.4 }), body, Math.cos(a) * 0.24, 0.02, Math.sin(a) * 0.22).rotation.z = Math.cos(a) * 0.9;
        }
        mesh(cyl(0.05, 0.06, 0.3, 10), STEEL(0x6b5aa0), body, 0.3, 0.22, 0).rotation.z = Math.PI / 2 - 0.2;
        mesh(sph(0.07, 10), glowM(0xb07cff, 2.8), body, 0.46, 0.27, 0);
        break;
      }
      case 'hotspot': {
        parts.flyer = grp(body, 0, 2.05, 0);
        const f = parts.flyer;
        mesh(sph(0.1, 12), glowM(0x7cf9ff, 2.2), f, 0, 0, 0);
        parts.arcs = [0.16, 0.26, 0.36].map((r, i) => {
          const a = mesh(tor(r, 0.018, Math.PI * 1.1, null), glowM(0x7cf9ff, 1.5), f, 0, 0, 0);
          a.rotation.x = -Math.PI / 2 + 0.2;
          a.rotation.z = -Math.PI * 0.55;
          a.material.opacity = 0.9;
          return a;
        });
        parts.shadow = mesh(new T.CircleGeometry(0.22, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), root, 0, 0.02, 0);
        parts.shadow.rotation.x = -Math.PI / 2;
        parts.shadow.castShadow = false;
        break;
      }
      case 'packer': {
        parts.shell = mesh(dodec(0.24), mat('pack_shell', { color: 0xc89a2c, metalness: 0.5, roughness: 0.35, emissive: 0x3a2400, emissiveIntensity: 0.4 }), body, 0, 0.3, 0);
        parts.plates = [];
        for (let i = 0; i < 4; i++) {
          const pl = mesh(box(0.16, 0.03, 0.1), mat('pack_plate', { color: 0xffd98a, metalness: 0.7, roughness: 0.2 }), body, 0, 0.3, 0);
          parts.plates.push(pl);
        }
        parts.bubble = mesh(sph(0.36, 18), glassM(0xffc857, 0.18), body, 0, 0.3, 0);
        parts.bubble.visible = false;
        break;
      }
    }
    if (clone) {
      root.traverse((o) => { if (o.material && o.material.color && !o.material.__clone) { o.material = o.material.clone(); o.material.__clone = true; o.material.emissiveIntensity = (o.material.emissiveIntensity || 0.4) * 0.8; } });
    }
    return { group: root, parts, type, update(t, st) { updateEnemy(parts, type, t, st); } };
  }

  function updateEnemy(p, type, t, st) {
    const s = st || {};
    const moving = s.moving !== false;
    const ph = t * 9 + (s.seed || 0);
    switch (type) {
      case 'worm':
        p.segs.forEach((seg, i) => { seg.position.y = seg.geometry.parameters.radius + 0.02 + Math.sin(ph - i * 0.9) * (moving ? 0.035 : 0.01); seg.position.z = Math.sin(ph * 0.5 - i) * 0.04; });
        p.head.position.y = 0.25 + Math.sin(ph) * 0.03;
        break;
      case 'flood':
        p.blobs.forEach((b, i) => { const a = t * 3 + i * ((Math.PI * 2) / 6); b.position.set(Math.cos(a) * 0.24, 0.32 + Math.sin(t * 6 + i) * 0.06, Math.sin(a) * 0.24); });
        p.core.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
        break;
      case 'trojan': {
        const hidden = !s.revealed;
        p.disguise.visible = hidden;
        p.real.visible = !hidden;
        if (hidden) p.disguise.position.y = Math.sin(t * 4 + (s.seed || 0)) * 0.012;
        else p.real.rotation.y = t * 2;
        break;
      }
      case 'ransom':
        p.tentacles.forEach((tn, i) => { tn.rotation.z = Math.sin(ph + i) * 0.2; });
        p.lock.position.y = 0.48 + Math.sin(t * 3) * 0.02;
        break;
      case 'hotspot':
        p.arcs.forEach((a, i) => { a.material.opacity = 0.5 + 0.5 * Math.sin(t * 6 - i * 1.3); });
        break;
      case 'packer':
        p.shell.rotation.y = t * 0.8; p.shell.rotation.x = Math.sin(t) * 0.2;
        p.plates.forEach((pl, i) => { const a = t * 1.2 + i * 1.57; pl.position.set(Math.cos(a) * 0.3, 0.3 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.3); pl.rotation.y = -a; });
        p.bubble.visible = !!s.shielded;
        if (p.bubble.visible) p.bubble.material.opacity = 0.18 + 0.05 * Math.sin(t * 5);
        break;
    }
  }

  // ---------- Boss ----------
  function buildBoss(key) {
    const root = new T.Group();
    const parts = { key };
    const body = grp(root, 0, 0, 0);
    parts.body = body;
    if (key === 'wanku') {
      parts.core = mesh(sph(0.78, 28), mat('wk_core', { color: 0x1b1a24, roughness: 0.5, metalness: 0.4, emissive: 0x320000, emissiveIntensity: 0.6 }), body, 0, 0.9, 0);
      parts.heads = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const arm = grp(body, Math.cos(a) * 0.6, 0.85, Math.sin(a) * 0.6);
        mesh(cyl(0.05, 0.07, 0.5, 8), mat('wk_arm', { color: 0x2c2430, metalness: 0.4, roughness: 0.5 }), arm, Math.cos(a) * 0.25, 0.06, Math.sin(a) * 0.25).rotation.z = Math.PI / 2;
        const head = mesh(sph(0.18, 16), mat('wk_head', { color: 0x5a6b48, roughness: 0.7 }), arm, Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5);
        mesh(sph(0.055, 10), glowM(0xff3333, 4.5), head, 0.13, 0.05, 0.075);
        mesh(sph(0.055, 10), glowM(0xff3333, 4.5), head, 0.13, 0.05, -0.075);
        mesh(cone(0.07, 0.16, 6), mat('wk_jaw', { color: 0x1a1418, roughness: 0.6 }), head, 0.1, -0.1, 0).rotation.z = -1.2;
        parts.heads.push(arm);
      }
      // 从主体垂下的感染线缆，落到地面
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const leg = mesh(cone(0.09, 0.62, 6), mat('wk_leg', { color: 0x221a26, metalness: 0.4, roughness: 0.5, emissive: 0x2a0008, emissiveIntensity: 0.5 }), body, Math.cos(a) * 0.62, 0.3, Math.sin(a) * 0.62);
        leg.rotation.z = Math.cos(a) * 0.45; leg.rotation.x = -Math.sin(a) * 0.45;
      }
      parts.crown = mesh(tor(0.95, 0.03, null, null), glowM(0xff3d5a, 1.6), body, 0, 0.9, 0);
      parts.crown.rotation.x = Math.PI / 2;
      parts.spikes = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.spikes.push(mesh(cone(0.09, 0.42, 6), mat('wk_spike', { color: 0x221b28, metalness: 0.5, roughness: 0.4 }), body, Math.cos(a) * 0.82, 0.9 + Math.sin(a) * 0.0, Math.sin(a) * 0.82));
      }
    } else if (key === 'shenlou') {
      parts.crystal = mesh(oct(0.82), new T.MeshPhysicalMaterial({ color: 0x9fffff, transmission: 0.5, opacity: 0.85, transparent: true, roughness: 0.05, metalness: 0.1, emissive: 0x2a8fbf, emissiveIntensity: 0.4, thickness: 0.6, ior: 1.4 }), body, 0, 1.0, 0);
      parts.inner = mesh(oct(0.36), glowM(0x7cf9ff, 2.4), body, 0, 1.0, 0);
      parts.rings = [0.95, 1.15].map((r, i) => { const rg = mesh(tor(r, 0.02, null, null), glowM(0x7cf9ff, 1.2), body, 0, 1.0, 0); rg.rotation.x = Math.PI / 2 + i * 0.4; return rg; });
      parts.shards = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.shards.push(mesh(cone(0.09, 0.5, 4), mat('sl_shard', { color: 0xbff8ff, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.8, emissive: 0x1a6a8a, emissiveIntensity: 0.4 }), body, Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9));
      }
    } else {
      parts.body2 = mesh(sph(0.66, 26), mat('zy_body', { color: 0x1a1430, roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.95 }), body, 0, 0.9, 0);
      parts.plates = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const pl = mesh(box(0.34, 0.06, 0.52), mat('zy_plate', { color: 0x3b2a6e, metalness: 0.8, roughness: 0.25, emissive: 0x4a1aa0, emissiveIntensity: 0.3 }), body, Math.cos(a) * 0.62, 0.9, Math.sin(a) * 0.62);
        pl.rotation.y = -a;
        parts.plates.push(pl);
      }
      parts.eye = mesh(sph(0.16, 16), glowM(0xc49bff, 2.4), body, 0, 1.4, 0.3);
      parts.tendrils = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tn = grp(body, Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5);
        mesh(cyl(0.035, 0.02, 0.6, 6), mat('zy_tend', { color: 0x2a1f4a, roughness: 0.5 }), tn, 0, -0.2, 0);
        parts.tendrils.push(tn);
      }
    }
    return { group: root, parts, key, update(t, st) { updateBoss(parts, key, t, st); } };
  }

  function updateBoss(p, key, t, st) {
    const s = st || {};
    const ph = s.phase || 0;
    if (key === 'wanku') {
      p.heads.forEach((arm, i) => { arm.rotation.y = Math.sin(t * 1.2 + i) * 0.25; arm.position.y = 0.85 + Math.sin(t * 2 + i) * 0.04; });
      p.crown.rotation.z = t * 0.5;
      p.spikes.forEach((sp, i) => { sp.rotation.z = Math.sin(t * 2 + i) * 0.1 + (ph >= 1 ? 0.15 : 0); });
    } else if (key === 'shenlou') {
      p.crystal.rotation.y = t * 0.4;
      p.crystal.rotation.x = Math.sin(t * 0.6) * 0.15;
      p.inner.rotation.y = -t * 1.3;
      p.rings.forEach((r, i) => { r.rotation.z = t * (0.8 + i * 0.4); });
      p.shards.forEach((sh, i) => { const a = t * 0.5 + (i / 6) * Math.PI * 2; sh.position.set(Math.cos(a) * (0.9 + Math.sin(t * 2 + i) * 0.1), 1.0 + Math.sin(t + i) * 0.1, Math.sin(a) * (0.9 + Math.sin(t * 2 + i) * 0.1)); sh.rotation.y = a; });
    } else {
      p.plates.forEach((pl, i) => { const a = (i / 5) * Math.PI * 2 + t * (0.4 + ph * 0.2); pl.position.set(Math.cos(a) * 0.62, 0.9 + Math.sin(t * 2 + i) * 0.03, Math.sin(a) * 0.62); pl.rotation.y = -a; });
      p.tendrils.forEach((tn, i) => { tn.rotation.x = Math.sin(t * 2 + i) * 0.4; tn.rotation.z = Math.cos(t * 1.7 + i) * 0.4; });
      p.eye.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
    }
  }

  // ---------- 辅助 ----------
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  window.MODELS = { mat, geo, box, cyl, sph, tor, cone, ico, oct, dodec, mesh, grp, glowM, glassM, STEEL, DARK, buildTower, buildEnemy, buildBoss, canvasTex, TOWER_COLOR, ENEMY_COLOR };
})();
