// fx.js —— 特效：弹道、命中、冲击、光束、护盾、隔离、预警、路线脉冲
(function () {
  const FX = {};
  G.fx = FX;
  let scene = null;

  FX.init = function (sc) {
    scene = sc;
    FX.projectiles = [];
    FX.beams = [];
    FX.rings = [];
    FX.bursts = [];
    FX.decals = [];
    FX.bubbles = [];
    FX.pulses = [];
    FX.flashes = [];
    FX.texts = [];
    FX.projGeo = new THREE.SphereGeometry(0.16, 8, 6);
    FX.streakGeo = new THREE.BoxGeometry(0.1, 0.1, 1.4);
  };

  // ---------- 粒子爆发 ----------
  const MAXB = 96;
  function makeBurst() {
    const n = 26;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    scene.add(pts);
    return { pts, vel: new Float32Array(n * 3), life: 0, maxLife: 1, n, active: false, grav: 0 };
  }
  FX.burst = function (pos, color, opt) {
    opt = opt || {};
    let b = FX.bursts.find(x => !x.active);
    if (!b) {
      if (FX.bursts.length >= MAXB) { b = FX.bursts[0]; }
      else { b = makeBurst(); FX.bursts.push(b); }
    }
    const n = b.n;
    const arr = b.pts.geometry.attributes.position.array;
    const spd = opt.speed || 6;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const v = spd * (0.3 + Math.random() * 0.7);
      b.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
      b.vel[i * 3 + 1] = Math.cos(ph) * v * (opt.up || 1);
      b.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.color.setHex(color);
    b.pts.material.size = opt.size || 0.3;
    b.pts.material.opacity = 1;
    b.life = 0;
    b.maxLife = opt.life || 0.7;
    b.grav = opt.grav != null ? opt.grav : 9;
    b.active = true;
    b.pts.visible = true;
  };

  // ---------- 弹道 ----------
  // type: 'bullet'(青色弹), 'pierce'(贯穿双联机), 'shell'(洪泛重锤), 'encrypt'(加密弹), 'lure'?
  FX.projectile = function (from, target, opt) {
    opt = opt || {};
    const color = opt.color || 0x3ee6ff;
    const m = new THREE.Mesh(FX.projGeo, G.models.basic(color, { dw: false }));
    m.position.copy(from);
    const glow = new THREE.Sprite(G.U.glowSprite('#' + color.toString(16).padStart(6, '0'), 48));
    glow.scale.setScalar(opt.glowSize || 1.2);
    m.add(glow);
    if (opt.streak) {
      const st = new THREE.Mesh(FX.streakGeo, G.models.basic(color, { opacity: 0.6, dw: false }));
      st.position.z = -0.8;
      m.add(st);
    }
    scene.add(m);
    FX.projectiles.push({
      mesh: m, from: from.clone(), target, speed: opt.speed || 26,
      type: opt.type || 'bullet', dmg: opt.dmg || 0, onHit: opt.onHit, dead: false,
      pierce: opt.pierce || 0, hitSet: null, slow: opt.slow || 0, arc: opt.arc || 0, t: 0
    });
  };

  // ---------- 光束（瞬时或持续） ----------
  FX.beam = function (a, b, color, opt) {
    opt = opt || {};
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(opt.r || 0.08, opt.r || 0.08, 1, 6, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2);
    const mat = G.models.basic(color, { opacity: opt.opacity || 0.8, dw: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a);
    m.scale.set(1, 1, len);
    m.lookAt(b);
    scene.add(m);
    const beam = { mesh: m, life: 0, maxLife: opt.life || 0.25, fade: true };
    FX.beams.push(beam);
    return beam;
  };

  // ---------- 扩散环 ----------
  FX.ring = function (pos, color, opt) {
    opt = opt || {};
    const geo = new THREE.TorusGeometry(1, opt.thick || 0.08, 8, 40);
    const mat = G.models.basic(color, { opacity: 0.9, dw: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = Math.PI / 2;
    m.position.copy(pos);
    m.position.y += opt.y || 0.2;
    scene.add(m);
    FX.rings.push({ mesh: m, life: 0, maxLife: opt.life || 0.6, maxR: opt.radius || 5, active: true });
  };

  // ---------- 闪光 ----------
  FX.flash = function (pos, color, size, life) {
    const s = new THREE.Sprite(G.U.glowSprite('#' + color.toString(16).padStart(6, '0'), 64));
    s.position.copy(pos);
    s.scale.setScalar(size || 3);
    scene.add(s);
    FX.flashes.push({ sp: s, life: 0, maxLife: life || 0.2, size: size || 3 });
  };

  // ---------- 预警标记 ----------
  FX.warnDecal = function (pos, radius, duration, color) {
    const g = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(radius, 0.12, 8, 40);
    const rm = new THREE.Mesh(ringGeo, G.models.basic(color || 0xff4d5e, { opacity: 0.85, dw: false }));
    rm.rotation.x = Math.PI / 2;
    rm.position.y = 0.25;
    g.add(rm);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 24),
      G.models.basic(color || 0xff4d5e, { opacity: 0.12, dw: false }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.22;
    g.add(inner);
    const beamM = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.5, 8, 12, 1, true),
      G.models.basic(color || 0xff4d5e, { opacity: 0.25, dw: false }));
    beamM.position.y = 4;
    g.add(beamM);
    const sp = new THREE.Sprite(G.U.glowSprite('#ff4d5e', 64));
    sp.scale.setScalar(radius * 1.4);
    sp.position.y = 2.2;
    g.add(sp);
    g.position.copy(pos);
    scene.add(g);
    FX.decals.push({ group: g, life: 0, duration: duration || 2.5 });
    return g;
  };

  // ---------- 节点隔离屏障 ----------
  FX.isolationBarrier = function (pos, radius, color) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 3.2, 6, 1, true),
      G.models.basic(color || 0xffb020, { opacity: 0.22, dw: false, side: THREE.DoubleSide }));
    wall.position.y = 1.6;
    g.add(wall);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 3.2, 6, 3, true),
      new THREE.MeshBasicMaterial({ color: color || 0xffb020, wireframe: true, transparent: true, opacity: 0.5 }));
    wire.position.y = 1.6;
    g.add(wire);
    const top = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 6, 6),
      G.models.basic(color || 0xffb020, { opacity: 0.9, dw: false }));
    top.rotation.x = Math.PI / 2;
    top.position.y = 3.2;
    g.add(top);
    const lockSp = new THREE.Sprite(G.models.textSprite('隔', '#ffb020', 1.6));
    lockSp.position.y = 4.4;
    g.add(lockSp);
    g.position.copy(pos);
    scene.add(g);
    return g;
  };

  // ---------- 路线变化脉冲 ----------
  FX.routePulse = function (points, color) {
    if (points.length < 2) return;
    const pts = points.map(p => new THREE.Vector3(p[0], 0.4, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, Math.max(10, pts.length * 4), 0.3, 6, false);
    const mat = G.models.basic(color, { opacity: 0.9, dw: false });
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    FX.pulses.push({ mesh: m, life: 0, maxLife: 1.2 });
  };

  // ---------- 飘字 ----------
  FX.popText = function (pos, text, color, size) {
    const sp = G.models.textSprite(text, color || '#ffffff', size || 1.6);
    sp.position.copy(pos);
    sp.position.y += 2;
    scene.add(sp);
    FX.texts.push({ sp, life: 0, maxLife: 1.1 });
  };

  // ---------- 持续型光束（治疗等，由游戏逻辑调用） ----------
  FX.maintainBeam = function (a, b, color, r) {
    FX.beam(a, b, color, { life: 0.12, r: r || 0.07, opacity: 0.85 });
  };

  // ---------- 更新 ----------
  FX.update = function (dt) {
    // 弹道
    for (let i = FX.projectiles.length - 1; i >= 0; i--) {
      const p = FX.projectiles[i];
      if (p.dead) continue;
      const tp = p.target && p.target.pos ? p.target.pos.clone() : (p.targetPos || p.from);
      if (p.target && p.target.pos) tp.y += p.target.hitY || 1;
      const dir = new THREE.Vector3().subVectors(tp, p.mesh.position);
      const d = dir.length();
      const step = p.speed * dt;
      if (d <= step + 0.15) {
        // 命中
        scene.remove(p.mesh);
        FX.projectiles.splice(i, 1);
        if (p.onHit) p.onHit(p);
        continue;
      }
      dir.normalize();
      p.mesh.position.addScaledVector(dir, step);
      p.mesh.lookAt(tp);
    }
    // 粒子
    FX.bursts.forEach(b => {
      if (!b.active) return;
      b.life += dt;
      const arr = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        arr[i * 3] += b.vel[i * 3] * dt;
        arr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        b.vel[i * 3 + 1] -= b.grav * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.life / b.maxLife);
      if (b.life >= b.maxLife) { b.active = false; b.pts.visible = false; }
    });
    // 光束
    for (let i = FX.beams.length - 1; i >= 0; i--) {
      const bm = FX.beams[i];
      bm.life += dt;
      bm.mesh.material.opacity = Math.max(0, 0.85 * (1 - bm.life / bm.maxLife));
      if (bm.life >= bm.maxLife) { scene.remove(bm.mesh); FX.beams.splice(i, 1); }
    }
    // 环
    for (let i = FX.rings.length - 1; i >= 0; i--) {
      const r = FX.rings[i];
      r.life += dt;
      const t = r.life / r.maxLife;
      const s = 0.2 + t * r.maxR;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (r.life >= r.maxLife) { scene.remove(r.mesh); FX.rings.splice(i, 1); }
    }
    // 闪光
    for (let i = FX.flashes.length - 1; i >= 0; i--) {
      const f = FX.flashes[i];
      f.life += dt;
      const t = f.life / f.maxLife;
      f.sp.material.opacity = 1 - t;
      f.sp.scale.setScalar(f.size * (1 + t * 1.5));
      if (f.life >= f.maxLife) { scene.remove(f.sp); FX.flashes.splice(i, 1); }
    }
    // 预警
    for (let i = FX.decals.length - 1; i >= 0; i--) {
      const d = FX.decals[i];
      d.life += dt;
      const pulse = 1 + Math.sin(d.life * 8) * 0.12;
      d.group.children[0].scale.set(pulse, pulse, 1);
      d.group.children[3].material.opacity = 0.4 + Math.sin(d.life * 8) * 0.3;
      if (d.life >= d.duration) {
        scene.remove(d.group);
        FX.decals.splice(i, 1);
      }
    }
    // 路线脉冲
    for (let i = FX.pulses.length - 1; i >= 0; i--) {
      const p = FX.pulses[i];
      p.life += dt;
      p.mesh.material.opacity = Math.max(0, 0.9 * (1 - p.life / p.maxLife));
      if (p.life >= p.maxLife) { scene.remove(p.mesh); FX.pulses.splice(i, 1); }
    }
    // 飘字
    for (let i = FX.texts.length - 1; i >= 0; i--) {
      const t = FX.texts[i];
      t.life += dt;
      t.sp.position.y += dt * 1.6;
      t.sp.material.opacity = Math.max(0, 1 - t.life / t.maxLife);
      if (t.life >= t.maxLife) { scene.remove(t.sp); FX.texts.splice(i, 1); }
    }
  };

  FX.clearAll = function () {
    [FX.projectiles, FX.beams, FX.rings, FX.flashes, FX.decals, FX.pulses, FX.texts].forEach(arr => {
      arr.forEach(o => {
        const obj = o.mesh || o.sp || o.group;
        if (obj) scene.remove(obj);
      });
      arr.length = 0;
    });
    FX.bursts.forEach(b => { b.active = false; b.pts.visible = false; });
  };
})();
