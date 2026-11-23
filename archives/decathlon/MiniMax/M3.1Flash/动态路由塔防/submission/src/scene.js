/* =========================================================================
 *  动态路由塔防 · 场景
 *  scene.js — 环境 / 战场 / 链路 / 节点 / 平台 / 相机
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;
  const Art = RT.Art;

  /* ================= 相机控制 ================= */
  function CameraRig(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.target = new T.Vector3(0, 0, 0);
    this.goalTarget = this.target.clone();
    this.dist = 46; this.goalDist = 46;
    this.az = 0; this.goalAz = 0;
    this.pol = 0.92; this.goalPol = 0.92;  // 与天顶夹角
    this.minDist = 10; this.maxDist = 90;
    this.enabled = true;
    this.dragging = null;
    this._bind();
  }
  CameraRig.prototype._bind = function () {
    const self = this, dom = this.dom;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        self.dragging = e.shiftKey ? 'pan' : 'orbit';
        e.preventDefault();
      } else if (e.button === 2) {
        self.dragging = 'orbit';
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', () => { self.dragging = null; });
    window.addEventListener('mousemove', (e) => {
      if (!self.dragging || !self.enabled) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (self.dragging === 'orbit') {
        self.goalAz -= dx * 0.005;
        self.goalPol = Math.max(0.18, Math.min(1.45, self.goalPol - dy * 0.004));
      } else {
        const s = self.dist * 0.0016;
        const right = new T.Vector3(Math.cos(self.goalAz), 0, -Math.sin(self.goalAz));
        const fwd = new T.Vector3(Math.sin(self.goalAz), 0, Math.cos(self.goalAz));
        self.goalTarget.addScaledVector(right, -dx * s);
        self.goalTarget.addScaledVector(fwd, -dy * s);
      }
    });
    dom.addEventListener('wheel', (e) => {
      if (!self.enabled) return;
      e.preventDefault();
      self.goalDist = Math.max(self.minDist, Math.min(self.maxDist, self.goalDist * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
  };
  CameraRig.prototype.update = function (dt) {
    const k = Math.min(1, dt * 7);
    this.az += (this.goalAz - this.az) * k;
    this.pol += (this.goalPol - this.pol) * k;
    this.dist += (this.goalDist - this.dist) * k;
    this.target.lerp(this.goalTarget, k);
    const sp = Math.sin(this.pol), cp = Math.cos(this.pol);
    this.cam.position.set(
      this.target.x + Math.sin(this.az) * sp * this.dist,
      this.target.y + cp * this.dist,
      this.target.z + Math.cos(this.az) * sp * this.dist
    );
    this.cam.lookAt(this.target);
  };
  CameraRig.prototype.set = function (az, pol, dist, target) {
    if (az !== undefined) this.goalAz = az;
    if (pol !== undefined) this.goalPol = pol;
    if (dist !== undefined) this.goalDist = dist;
    if (target) this.goalTarget.copy(target);
  };
  CameraRig.prototype.snap = function () {
    this.az = this.goalAz; this.pol = this.goalPol; this.dist = this.goalDist;
    this.target.copy(this.goalTarget);
  };

  /* ================= 场景构建 ================= */
  function buildWorld(scene, mapDef, net) {
    const th = mapDef.theme;
    const tex = Art.getTextures(th);
    const root = new T.Group();
    scene.add(root);

    const world = {
      root: root, net: net, def: mapDef, theme: th,
      roads: [], nodeObjs: {}, entryObjs: {}, exitObjs: {}, platformObjs: [],
      routeObjs: {}, obstacles: [], pickables: [], pulses: [], time: 0
    };

    /* ---------- 天空 ---------- */
    const skyGeo = new T.SphereGeometry(300, 32, 16);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: {
        c0: { value: new T.Color(th.bg0) }, c1: { value: new T.Color(th.bg1) },
        c2: { value: new T.Color(th.horizon) }, time: { value: 0 }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform float time; varying vec3 vP;',
        'void main(){',
        ' vec3 n = normalize(vP);',
        ' float h = clamp(n.y*0.5+0.5, 0.0, 1.0);',
        ' vec3 col = mix(c1, c0, smoothstep(0.42, 0.95, h));',
        ' col = mix(col, c2, pow(max(0.0, 1.0-abs(n.y*1.9)), 3.0)*0.55);',
        ' float band = sin(n.y*46.0 + time*0.25)*0.5+0.5;',
        ' col += c2 * band * 0.022 * smoothstep(0.3,0.7,1.0-h);',
        ' gl_FragColor = vec4(col,1.0);',
        '}'
      ].join('\n')
    });
    const sky = new T.Mesh(skyGeo, skyMat);
    root.add(sky); world.sky = sky; world.skyMat = skyMat;

    /* ---------- 星尘 ---------- */
    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 90 + Math.random() * 170;
      const a = Math.random() * Math.PI * 2;
      const y = -40 + Math.random() * 170;
      sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = y; sp[i * 3 + 2] = Math.sin(a) * r;
    }
    const starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
    const stars = new T.Points(starGeo, new T.PointsMaterial({
      color: new T.Color(th.accent), size: 1.1, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending
    }));
    root.add(stars); world.stars = stars;

    /* ---------- 远景网络集群 ---------- */
    const cluster = new T.Group(); root.add(cluster);
    const clusterMat = Art.std('#0d1526', { roughness: 0.7, metalness: 0.5, emissive: new T.Color(th.accent), emissiveIntensity: 0.12 });
    const inst = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), clusterMat, 180);
    const dummy = new T.Object3D();
    const linePts = [];
    const clusters = [];
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 62 + Math.random() * 130;
      const y = -34 + Math.random() * 96;
      const h = 1.5 + Math.random() * 8;
      dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      dummy.scale.set(1.2 + Math.random() * 3.4, h, 1.2 + Math.random() * 3.4);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      clusters.push({ p: dummy.position.clone(), s: dummy.scale.clone() });
    }
    inst.instanceMatrix.needsUpdate = true;
    cluster.add(inst);
    for (let i = 0; i < 150; i++) {
      const c1 = clusters[Math.floor(Math.random() * clusters.length)];
      const c2 = clusters[Math.floor(Math.random() * clusters.length)];
      if (c1 === c2) continue;
      linePts.push(c1.p.x, c1.p.y, c1.p.z, c2.p.x, c2.p.y, c2.p.z);
    }
    const lgeo = new T.BufferGeometry();
    lgeo.setAttribute('position', new T.Float32BufferAttribute(linePts, 3));
    const lines = new T.LineSegments(lgeo, new T.LineBasicMaterial({
      color: new T.Color(th.accent), transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false
    }));
    cluster.add(lines); world.cluster = cluster;

    /* ---------- 协议层（战场下方） ---------- */
    const proto = new T.Group(); root.add(proto);
    const layers = [];
    for (let i = 0; i < 4; i++) {
      const size = 150 + i * 60;
      const t = tex.grid.clone();
      t.needsUpdate = true;
      t.repeat.set(size / 8, size / 8);
      const mat = new T.MeshBasicMaterial({
        map: t, color: new T.Color(th.accent), transparent: true,
        opacity: 0.13 - i * 0.022, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      });
      const pl = new T.Mesh(new T.PlaneGeometry(size, size), mat);
      pl.rotation.x = -Math.PI / 2;
      pl.position.y = -9 - i * 7;
      proto.add(pl);
      layers.push({ mesh: pl, tex: t, speed: 0.006 + i * 0.004 });
    }
    world.protoLayers = layers;

    /* ---------- 竖向数据流 ---------- */
    const streamGeo = new T.PlaneGeometry(1.4, 26);
    const streamMat = new T.MeshBasicMaterial({
      map: tex.stream, color: new T.Color(th.accent), transparent: true,
      opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    const streams = new T.InstancedMesh(streamGeo, streamMat, 44);
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, r = 78 + Math.random() * 120;
      dummy.position.set(Math.cos(a) * r, -44 + Math.random() * 52, Math.sin(a) * r);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(1.6 + Math.random() * 3.4, 0.8 + Math.random() * 2.2, 1);
      dummy.updateMatrix();
      streams.setMatrixAt(i, dummy.matrix);
    }
    streams.instanceMatrix.needsUpdate = true;
    root.add(streams); world.streams = streams;

    /* ---------- 战场底座 ---------- */
    const W = net.cols * RT.Net.CELL, H = net.rows * RT.Net.CELL;
    const slabTex = tex.grid.clone(); slabTex.needsUpdate = true;
    slabTex.repeat.set(W / 10, H / 10);
    const slab = new T.Mesh(new T.BoxGeometry(W + 3, 1.2, H + 3), Art.std(th.ground, {
      map: slabTex, roughness: 0.82, metalness: 0.35, emissive: new T.Color(th.groundEdge), emissiveIntensity: 0.18
    }));
    slab.position.y = -0.6;
    slab.receiveShadow = true;
    root.add(slab);
    world.slab = slab;

    // 底座边框
    const frameMat = Art.emis(th.accent, 1.1, { transparent: true, opacity: 0.85 });
    const fh = 0.16;
    [[0, -(H + 3) / 2, W + 3, fh], [0, (H + 3) / 2, W + 3, fh]].forEach((p) => {
      const b = new T.Mesh(new T.BoxGeometry(p[2], 0.1, p[3]), frameMat);
      b.position.set(0, 0.02, p[1]); root.add(b);
    });
    [[-(W + 3) / 2, 0, H + 3, fh], [(W + 3) / 2, 0, H + 3, fh]].forEach((p) => {
      const b = new T.Mesh(new T.BoxGeometry(p[3], 0.1, p[2]), frameMat);
      b.position.set(p[0], 0.02, 0); root.add(b);
    });

    /* ---------- 链路 ---------- */
    const roadMatNormal = new T.MeshStandardMaterial({
      map: tex.road, color: new T.Color('#ffffff'), emissive: new T.Color(th.roadGlow),
      emissiveMap: tex.road, emissiveIntensity: 0.85, roughness: 0.42, metalness: 0.4
    });
    const roadMatOld = new T.MeshStandardMaterial({
      map: tex.old, color: new T.Color('#ffffff'), emissive: new T.Color(th.old),
      emissiveMap: tex.old, emissiveIntensity: 0.75, roughness: 0.6, metalness: 0.35
    });
    net.edges.forEach((e) => {
      const geo = ribbon(e.pts, 1.35);
      const mesh = new T.Mesh(geo, e.kind === 'old' ? roadMatOld : roadMatNormal);
      mesh.receiveShadow = true;
      mesh.userData.pick = { kind: 'edge', edge: e };
      root.add(mesh);
      world.roads.push({ edge: e, mesh: mesh });
      world.pickables.push(mesh);
      // 侧轨
      const railGeo = ribbon(e.pts, 1.95);
      const rail = new T.Mesh(railGeo, new T.MeshBasicMaterial({
        color: new T.Color(e.kind === 'old' ? th.old : th.roadGlow), transparent: true,
        opacity: e.kind === 'old' ? 0.26 : 0.2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      }));
      rail.position.y = -0.02;
      root.add(rail);
    });

    /* ---------- 交换节点 / 汇聚器 ---------- */
    net.vlist.forEach((v) => {
      if (v.kind !== 'switch' && v.kind !== 'junction') return;
      const g = new T.Group();
      g.position.set(v.x, v.y, v.z);
      const isSwitch = v.kind === 'switch';
      const steel = Art.std(isSwitch ? '#1e2c42' : '#1a2430', { roughness: 0.55, metalness: 0.7 });
      const accent = Art.emis(isSwitch ? th.accent : '#7d8aa0', isSwitch ? 0.85 : 0.45);
      const base = new T.Mesh(new T.CylinderGeometry(0.95, 1.12, 0.34, 6), steel);
      base.position.y = -0.17; base.castShadow = true; base.receiveShadow = true;
      g.add(base);
      // 地面识别环
      const floorRing = new T.Mesh(new T.TorusGeometry(1.15, 0.055, 6, 6), accent);
      floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = 0.03;
      g.add(floorRing);
      const pillar = new T.Mesh(new T.CylinderGeometry(0.2, 0.32, 1.1, 6), steel);
      pillar.position.y = 0.55; pillar.castShadow = true; g.add(pillar);
      const ring = new T.Mesh(new T.TorusGeometry(0.78, 0.09, 8, 6), accent);
      ring.position.y = 1.05; ring.rotation.x = Math.PI / 2; g.add(ring);
      const core = new T.Mesh(new T.OctahedronGeometry(0.34, 0), accent);
      core.position.y = 1.12; g.add(core);
      const halo = new T.Sprite(new T.SpriteMaterial({
        map: tex.glowWhite, color: new T.Color(isSwitch ? th.accent : '#7d8aa0'),
        transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(2.6, 2.6, 1); halo.position.y = 1.1; g.add(halo);
      // 隔离屏障（默认隐藏）
      const barrier = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 1.9, 16, 1, true), new T.MeshBasicMaterial({
        color: new T.Color('#ff4d6d'), transparent: true, opacity: 0.3,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      }));
      barrier.position.y = 0.7; barrier.visible = false; g.add(barrier);
      const lock = new T.Mesh(new T.BoxGeometry(1.5, 0.1, 0.12), Art.emis('#ff4d6d', 2.2));
      lock.position.y = 1.7; lock.visible = false; g.add(lock);
      const lock2 = new T.Mesh(new T.BoxGeometry(0.12, 0.1, 1.5), Art.emis('#ff4d6d', 2.2));
      lock2.position.y = 1.7; lock2.visible = false; g.add(lock2);

      g.userData.pick = { kind: 'node', vertex: v };
      root.add(g);
      world.pickables.push(g);
      world.nodeObjs[v.id] = {
        group: g, vertex: v, ring: ring, core: core, halo: halo, floorRing: floorRing,
        barrier: barrier, lock: lock, lock2: lock2, isolated: false,
        accent: accent, steel: steel, spin: Math.random() * 6
      };
    });

    /* ---------- 入口 ---------- */
    net.entries.forEach((v) => {
      const g = new T.Group();
      g.position.set(v.x, v.y, v.z);
      const col = new T.Color(v.color || th.accent);
      const steel = Art.std('#16202e', { roughness: 0.6, metalness: 0.6 });
      const pad = new T.Mesh(new T.CylinderGeometry(1.35, 1.5, 0.2, 6), steel);
      pad.position.y = 0.1; pad.receiveShadow = true; g.add(pad);
      const padRing = new T.Mesh(new T.TorusGeometry(1.32, 0.06, 6, 6), Art.emis(v.color || th.accent, 1.0));
      padRing.rotation.x = -Math.PI / 2; padRing.position.y = 0.21; g.add(padRing);
      for (let i = 0; i < 2; i++) {
        const post = new T.Mesh(new T.BoxGeometry(0.34, 3.2, 0.34), steel);
        post.position.set(i ? 1.05 : -1.05, 1.6, 0); post.castShadow = true; g.add(post);
        const strip = new T.Mesh(new T.BoxGeometry(0.09, 2.6, 0.09), Art.emis(v.color || th.accent, 1.3));
        strip.position.set(i ? 1.05 : -1.05, 1.6, 0.19); g.add(strip);
      }
      const lintel = new T.Mesh(new T.BoxGeometry(2.7, 0.36, 0.48), steel);
      lintel.position.y = 3.25; lintel.castShadow = true; g.add(lintel);
      const lintelGlow = new T.Mesh(new T.BoxGeometry(2.5, 0.1, 0.52), Art.emis(v.color || th.accent, 1.6));
      lintelGlow.position.y = 3.05; g.add(lintelGlow);
      const beam = new T.Mesh(new T.PlaneGeometry(1.85, 2.9), new T.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.34, blending: T.AdditiveBlending,
        depthWrite: false, side: T.DoubleSide
      }));
      beam.position.y = 1.5; g.add(beam);
      const ring = new T.Mesh(new T.TorusGeometry(1.3, 0.09, 8, 26), Art.emis(v.color || th.accent, 1.1));
      ring.position.y = 3.45; ring.rotation.x = Math.PI / 2; g.add(ring);
      const halo = new T.Sprite(new T.SpriteMaterial({
        map: tex.glowWhite, color: col, transparent: true, opacity: 0.5,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(4.2, 4.2, 1); halo.position.y = 3.3; g.add(halo);
      g.userData.pick = { kind: 'entry', vertex: v };
      root.add(g); world.pickables.push(g);
      world.entryObjs[v.id] = { group: g, beam: beam, ring: ring, halo: halo, vertex: v };
    });

    /* ---------- 出口（中枢） ---------- */
    net.exits.forEach((v) => {
      const g = new T.Group();
      g.position.set(v.x, v.y, v.z);
      const steel = Art.std('#1b2534', { roughness: 0.5, metalness: 0.75 });
      const col = new T.Color(th.good);
      const base = new T.Mesh(new T.CylinderGeometry(1.5, 1.85, 0.55, 8), steel);
      base.position.y = 0.27; base.castShadow = true; base.receiveShadow = true; g.add(base);
      const pillar = new T.Mesh(new T.CylinderGeometry(0.42, 0.7, 2.2, 8), steel);
      pillar.position.y = 1.6; pillar.castShadow = true; g.add(pillar);
      const core = new T.Mesh(new T.IcosahedronGeometry(0.72, 1), Art.emis(th.good, 2.4));
      core.position.y = 2.7; g.add(core);
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const r = new T.Mesh(new T.TorusGeometry(1.25 + i * 0.36, 0.06, 8, 36), Art.emis(th.accent, 1.5));
        r.position.y = 2.7; r.rotation.x = Math.PI / 2 + i * 0.6; r.rotation.z = i * 0.8;
        g.add(r); rings.push(r);
      }
      const dome = new T.Mesh(new T.SphereGeometry(2.3, 24, 16), new T.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.09, blending: T.AdditiveBlending,
        depthWrite: false, side: T.DoubleSide
      }));
      dome.position.y = 2.2; g.add(dome);
      const halo = new T.Sprite(new T.SpriteMaterial({
        map: tex.glowWhite, color: col, transparent: true, opacity: 0.55,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      halo.scale.set(7, 7, 1); halo.position.y = 2.7; g.add(halo);
      g.userData.pick = { kind: 'exit', vertex: v };
      root.add(g); world.pickables.push(g);
      world.exitObjs[v.id] = { group: g, core: core, rings: rings, dome: dome, halo: halo, vertex: v, hurt: 0 };
    });

    /* ---------- 设备平台 ---------- */
    net.vlist.forEach(() => {});
    Object.keys(net.platforms).forEach((k) => {
      const p = net.platforms[k];
      const g = new T.Group();
      const halfW = (net.cols - 1) / 2, halfH = (net.rows - 1) / 2;
      g.position.set((p.x - halfW) * RT.Net.CELL, 0, (p.y - halfH) * RT.Net.CELL);
      const deck = new T.Mesh(new T.CylinderGeometry(1.05, 1.2, 0.22, 8), Art.std('#1a2432', { roughness: 0.5, metalness: 0.7 }));
      deck.position.y = 1.5; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
      const glowRing = new T.Mesh(new T.TorusGeometry(1.0, 0.05, 6, 24), Art.emis(th.accent, 1.2));
      glowRing.position.y = 1.63; glowRing.rotation.x = Math.PI / 2; g.add(glowRing);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new T.Mesh(new T.BoxGeometry(0.12, 1.5, 0.12), Art.std('#141c28', { roughness: 0.6, metalness: 0.6 }));
        leg.position.set(Math.cos(a) * 0.72, 0.75, Math.sin(a) * 0.72); leg.castShadow = true; g.add(leg);
      }
      g.userData.pick = { kind: 'platform', gx: p.x, gy: p.y, name: p.name };
      root.add(g); world.pickables.push(g);
      world.platformObjs.push({ group: g, gx: p.x, gy: p.y, name: p.name, ring: glowRing });
    });

    /* ---------- 障碍 ---------- */
    Object.keys(net.obstacles).forEach((k) => {
      const o = net.obstacles[k];
      const halfW = (net.cols - 1) / 2, halfH = (net.rows - 1) / 2;
      const x = (o.x - halfW) * RT.Net.CELL, z = (o.y - halfH) * RT.Net.CELL;
      const g = new T.Group();
      g.position.set(x, 0, z);
      if (o.kind === 'data') {
        const rack = new T.Mesh(new T.BoxGeometry(1.5, 2.3, 1.5), Art.std('#151d29', { roughness: 0.75, metalness: 0.45 }));
        rack.position.y = 1.15; rack.castShadow = true; rack.receiveShadow = true; g.add(rack);
        const face = new T.Mesh(new T.PlaneGeometry(1.2, 1.9), new T.MeshBasicMaterial({
          map: tex.panel, color: new T.Color(th.accent), transparent: true, opacity: 0.55
        }));
        face.position.set(0, 1.15, 0.77); g.add(face);
      } else if (o.kind === 'stream') {
        const flow = new T.Mesh(new T.PlaneGeometry(RT.Net.CELL * 1.02, RT.Net.CELL * 1.02), new T.MeshBasicMaterial({
          map: tex.stream, color: new T.Color(th.accent), transparent: true, opacity: 0.42,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
        }));
        flow.rotation.x = -Math.PI / 2; flow.position.y = 0.05; g.add(flow);
        g.userData.flow = flow;
      } else if (o.kind === 'airgap') {
        // 气隙：稀薄隔离场 + 顶部环形格栅，避免大片遮挡视线
        const wall = new T.Mesh(new T.BoxGeometry(RT.Net.CELL * 0.98, 2.4, RT.Net.CELL * 0.98), new T.MeshStandardMaterial({
          color: new T.Color(th.accent), transparent: true, opacity: 0.05, roughness: 0.1,
          metalness: 0.0, emissive: new T.Color(th.accent), emissiveIntensity: 0.18,
          side: T.DoubleSide, depthWrite: false
        }));
        wall.position.y = 1.2; g.add(wall);
        const ring = new T.Mesh(new T.TorusGeometry(RT.Net.CELL * 0.46, 0.035, 5, 18), Art.emis(th.accent, 0.55, { transparent: true, opacity: 0.5 }));
        ring.position.y = 2.45; ring.rotation.x = Math.PI / 2; g.add(ring);
        const post = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 2.45, 5), Art.emis(th.accent, 0.4, { transparent: true, opacity: 0.38 }));
        post.position.y = 1.22; g.add(post);
      }
      g.userData.pick = { kind: 'obstacle', gx: o.x, gy: o.y, obstacle: o };
      root.add(g); world.pickables.push(g);
      world.obstacles.push(g);
    });

    /* ---------- 灯光 ---------- */
    const hemi = new T.HemisphereLight(new T.Color(th.accent), new T.Color(th.bg0), 0.55);
    scene.add(hemi);
    const key = new T.DirectionalLight(new T.Color('#dceeff'), 1.15);
    key.position.set(26, 42, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const cam = key.shadow.camera;
    cam.left = -40; cam.right = 40; cam.top = 34; cam.bottom = -34; cam.near = 1; cam.far = 140;
    key.shadow.bias = -0.0012;
    scene.add(key);
    world.key = key;
    const rim = new T.DirectionalLight(new T.Color(th.accent), 0.42);
    rim.position.set(-30, 16, -26); scene.add(rim);
    const fill = new T.PointLight(new T.Color(th.good), 0.9, 60, 2);
    fill.position.set(0, 8, 0); scene.add(fill);
    world.fill = fill;

    scene.fog = new T.FogExp2(new T.Color(th.bg1), 0.0085);

    return world;
  }

  /* ---------------- 沿折线生成带状几何 ---------------- */
  function ribbon(pts, width) {
    const positions = [], uvs = [], indices = [];
    const half = width / 2;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x, dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const nx = -dz, nz = dx;
      positions.push(p.x + nx * half, p.y, p.z + nz * half);
      positions.push(p.x - nx * half, p.y, p.z - nz * half);
      if (i > 0) {
        const d = Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
        acc += d;
      }
      uvs.push(0, acc / 6, 1, acc / 6);
      if (i < pts.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  RT.Scene = { buildWorld, ribbon, CameraRig };
})(typeof window !== 'undefined' ? window : globalThis);
