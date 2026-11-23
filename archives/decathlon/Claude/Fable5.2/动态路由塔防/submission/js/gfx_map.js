/* 网络安全攻防战 — 地图场景：地块、设施、协议层、远景集群与数据流 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE, GX = TD.GX, G = GX.G, mk = GX.mk;
  const V3 = THREE.Vector3, PI = Math.PI;

  const NOISE = `
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s; }`;
  const VS_W = `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

  function shaderMat(fs, uniforms, o) {
    return new THREE.ShaderMaterial(Object.assign({ vertexShader: VS_W, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }, o || {}));
  }

  class MapScene {
    constructor(stage, sim) {
      this.stage = stage; this.sim = sim; this.grid = sim.grid; this.W = sim.W; this.H = sim.H;
      this.theme = GX.THEMES[sim.def.theme]; this.themeKey = sim.def.theme;
      this.T = GX.themeMaterials(this.theme);
      this.root = new THREE.Group(); stage.scene.add(this.root);
      this.anim = []; this.uT = { value: 0 };
      this.ox = (this.W - 1) / 2; this.oz = (this.H - 1) / 2;
      this.rng = TD.makeRng(1000 + sim.def.index * 31);
      this.nodeViews = {}; this.portals = {};
      this.build();
    }
    wx(x) { return x - this.ox; }
    wz(y) { return y - this.oz; }
    top(c) { return c.type === 'platform' ? 0.42 : c.type === 'node' ? 0.08 : 0; }
    dispose() {
      this.stage.scene.remove(this.root);
      this.root.traverse(o => { if (o.geometry && !o.geometry.userData.shared) { /* 缓存几何不释放 */ } if (o.material && o.material.map && o.material.userData.own) o.material.map.dispose(); });
    }

    build() {
      const th = this.theme, st = this.stage, sc = st.scene;
      sc.fog = new THREE.FogExp2(th.fog, 0.0105);
      sc.background = new THREE.Color(th.sky[0]);
      // 灯光
      const L = this.lights = new THREE.Group(); this.root.add(L);
      const hemi = new THREE.HemisphereLight(th.fill, 0x050608, 0.85); L.add(hemi);
      const key = new THREE.DirectionalLight(th.key, 2.0); key.position.set(-9, 20, 8); key.castShadow = true;
      const s = Math.max(this.W, this.H) * 0.62; key.shadow.camera.left = -s; key.shadow.camera.right = s; key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
      key.shadow.camera.near = 2; key.shadow.camera.far = 60; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 2.5;
      L.add(key); L.add(key.target);
      const rim = new THREE.DirectionalLight(th.rim, 0.9); rim.position.set(10, 8, -14); L.add(rim);
      this.buildSky(); this.buildLayers(); this.buildTiles(); this.buildBackdrop(); this.buildLabels();
    }

    // ---------- 天穹 ----------
    buildSky() {
      const th = this.theme, c = th.sky.map(h => new THREE.Color(h));
      const m = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
        uniforms: { uT: this.uT, c0: { value: c[0] }, c1: { value: c[1] }, c2: { value: c[2] }, cA: { value: new THREE.Color(th.rim) } },
        vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: NOISE + `varying vec3 vD; uniform float uT; uniform vec3 c0,c1,c2,cA;
          void main(){ float h = vD.y; vec3 col = mix(c1, c0, smoothstep(-0.1, 0.9, h)); col = mix(col, c2, smoothstep(0.25, -0.5, h) * 0.8);
            float a = atan(vD.z, vD.x); float n = fbm(vec2(a * 2.0 + uT * 0.01, h * 3.0 - uT * 0.006));
            col += c2 * pow(n, 2.2) * 0.9 * smoothstep(0.7, -0.3, h);
            float band = smoothstep(0.035, 0.0, abs(h + 0.06 + 0.03 * sin(a * 3.0))) ; col += cA * band * 0.10;
            vec2 sp = vec2(a * 60.0, h * 90.0); float st = step(0.9965, hash2(floor(sp))) * (0.5 + 0.5 * sin(uT * 2.0 + hash2(floor(sp)) * 60.0));
            col += vec3(st) * 0.7 * smoothstep(-0.2, 0.3, h);
            gl_FragColor = vec4(col, 1.0); }`
      });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 20), m); sky.renderOrder = -10; this.root.add(sky);
    }

    // ---------- 纵深中的协议层 ----------
    buildLayers() {
      const th = this.theme, names = ['L7 · 应用层', 'L4 · 传输层', 'L3 · 网络层', 'L2/L1 · 链路与物理层'];
      const fs = `varying vec3 vW; uniform float uT; uniform vec3 uCol; uniform float uCell; uniform float uFade; uniform float uK; uniform float uA;
        float gl2(vec2 p, float w){ vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
        float hs(float n){ return fract(sin(n * 91.7) * 43758.5453); }
        void main(){ vec2 p = vW.xz / uCell; float g1 = gl2(p, 1.3), g2 = gl2(p / 4.0, 1.8);
          float ry = floor(p.y + 0.5), rx = floor(p.x + 0.5);
          float onY = step(abs(p.y - ry), 0.035), onX = step(abs(p.x - rx), 0.035);
          float h1 = hs(ry + uK), h2 = hs(rx + uK * 3.0);
          float s1 = fract(p.x * 0.045 * (0.6 + h1) - uT * (0.10 + 0.25 * h1) * (h1 > 0.5 ? 1.0 : -1.0) + h1 * 9.0);
          float s2 = fract(p.y * 0.045 * (0.6 + h2) + uT * (0.10 + 0.25 * h2) * (h2 > 0.5 ? 1.0 : -1.0) + h2 * 9.0);
          float pulse = onY * smoothstep(0.965, 1.0, s1) * step(0.7, h1) + onX * smoothstep(0.965, 1.0, s2) * step(0.7, h2);
          float d = length(vW.xz); float fade = smoothstep(uFade, uFade * 0.2, d);
          pulse *= step(abs(fract(p.x * 0.5) - 0.5) + abs(fract(p.y * 0.5) - 0.5), 2.0);
          float a = (g1 * 0.07 + g2 * 0.20 + pulse * 0.28) * fade * uA;
          gl_FragColor = vec4(uCol * (0.5 + pulse * 0.9), a); }`;
      this.layers = [];
      for (let i = 0; i < 4; i++) {
        const y = -3.2 - i * 3.4, size = 90 + i * 50;
        const m = shaderMat(fs, { uT: this.uT, uCol: { value: new THREE.Color(th.layer[i]) }, uCell: { value: 2.0 + i * 1.0 }, uFade: { value: size * 0.5 }, uK: { value: i * 17.3 }, uA: { value: [0.55, 0.45, 0.36, 0.3][i] } });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m); p.rotation.x = -PI / 2; p.position.y = y; p.renderOrder = -5 + i * -1; this.root.add(p);
        const lab = GX.textSprite(names[i], { size: 40, color: '#' + new THREE.Color(th.layer[i]).lerp(new THREE.Color(0xffffff), 0.55).getHexString(), opacity: 0.6, mono: true, scale: 0.016 });
        lab.position.set(-this.ox - 7 - i * 4.5, y + 0.5, this.oz + 5 + i * 3.2); this.root.add(lab);
        const lab2 = lab.clone(); lab2.position.set(this.ox + 8 + i * 4.5, y + 0.5, -this.oz - 3 - i * 3.4); this.root.add(lab2);
        this.layers.push(p);
      }
    }

    // ---------- 地块 ----------
    buildTiles() {
      const g = this.grid, T = this.T, th = this.theme, B = new GX.Batch(), rng = this.rng;
      const walk = i => i >= 0 && g.cells[i].walk;
      const dyn = this.dyn = new THREE.Group(); this.root.add(dyn);
      const inRiver = c => c.walk && [0, 2].every(d => { const v = c.nb[d]; return v >= 0 && g.cells[v].kind === 'flow'; });
      for (const c of g.cells) {
        const x = this.wx(c.x), z = this.wz(c.y), h2 = TD.hash2(c.x, c.y, 7);
        if (c.type === 'void') continue;
        if (c.walk) {
          const leg = c.legacy, node = c.type === 'node', river = inRiver(c);
          B.add(G.rbox(0.98, 0.18, 0.98, 0.035), leg ? T.legacy : T.slab, [x, -0.09, z]);
          B.add(G.box(0.62, 0.22, 0.62), T.dark, [x, -0.29, z]);
          if (h2 < 0.3 && !river) { B.add(G.cyl(0.025, 0.025, 2.6, 6), T.metal, [x, -1.7, z]); B.add(G.sph(0.05, 8, 6), T.accentDim, [x, -3.0, z]); }
          // 路缘：没有可通行邻格的一侧
          for (let d = 0; d < 4; d++) {
            if (walk(c.nb[d])) continue;
            const dx = TD.DIRS[d][0], dz = TD.DIRS[d][1], rot = [0, dx ? PI / 2 : 0, 0];
            B.add(G.box(0.98, 0.07, 0.05), leg ? T.rust : T.slabSide, [x + dx * 0.465, 0.035, z + dz * 0.465], rot);
            if (leg) { for (const o of [-0.3, 0, 0.3]) B.add(G.box(0.16, 0.015, 0.03), T.legGlow, [x + dx * 0.465 + (dx ? 0 : o), 0.075, z + dz * 0.465 + (dz ? 0 : o)], rot); }
            else B.add(G.box(0.9, 0.012, 0.022), T.accentDim, [x + dx * 0.465, 0.074, z + dz * 0.465], rot);
          }
          if (leg) { // 旧链路：裸露的线缆槽
            const horiz = walk(c.nb[0]) || walk(c.nb[2]);
            for (const o of [-0.3, 0, 0.3]) B.add(G.cyl(0.022, 0.022, 0.78, 6), T.rust, horiz ? [x + o, 0.012, z] : [x, 0.012, z + o], horiz ? [PI / 2, 0, 0] : [0, 0, PI / 2]);
          }
          if (river) this.buildCrossing(B, c, x, z, leg);
          if (node) this.buildNode(B, c, x, z);
          if (c.type === 'entry') this.buildEntry(B, c, x, z);
          if (c.type === 'exit') this.buildExit(B, c, x, z);
        } else if (c.type === 'platform') {
          B.add(G.rbox(0.94, 0.5, 0.94, 0.05), T.plat, [x, 0.17, z]);
          B.add(G.cyl(0.5, 0.28, 0.42, 4), T.dark, [x, -0.29, z], [0, PI / 4, 0]);
          for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(G.box(0.07, 0.03, 0.07), T.accentDim, [x + a * 0.4, 0.425, z + b * 0.4]);
          if (h2 < 0.2) B.add(G.cyl(0.03, 0.03, 2.2, 6), T.metal, [x, -1.6, z]);
        } else if (c.type === 'obstacle') {
          if (c.kind === 'facility') this.buildFacility(B, c, x, z, h2);
        }
      }
      this.buildFlow(B); this.buildGap(B);
      // 悬浮栅格
      const pts = []; const mx = this.ox + 2.5, mz = this.oz + 2.5;
      for (let i = -Math.ceil(mx); i <= Math.ceil(mx); i++) { pts.push(i + 0.5 - (this.W % 2 ? 0 : 0.5) * 0, -0.55, -mz, i + 0.5, -0.55, mz); }
      for (let j = -Math.ceil(mz); j <= Math.ceil(mz); j++) { pts.push(-mx, -0.55, j + 0.5, mx, -0.55, j + 0.5); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lat = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: th.grid, transparent: true, opacity: 0.13, depthWrite: false })); this.root.add(lat);
      B.build(this.root);
    }

    buildNode(B, c, x, z) {
      const T = this.T, g = this.grid;
      B.add(G.cyl(0.47, 0.5, 0.17, 8), T.node, [x, 0.0, z], [0, PI / 8, 0]);
      B.add(G.cyl(0.36, 0.36, 0.02, 24), T.dark, [x, 0.092, z]);
      for (let d = 0; d < 4; d++) { const v = c.nb[d]; if (v < 0 || !g.cells[v].walk) continue; const dx = TD.DIRS[d][0], dz = TD.DIRS[d][1]; B.add(G.box(0.18, 0.05, 0.16), T.metal, [x + dx * 0.42, 0.06, z + dz * 0.42], [0, dx ? 0 : PI / 2, 0]); }
      // 动态部分：状态环
      const v = { ci: c.i, group: new THREE.Group() };
      v.group.position.set(x, 0, z);
      v.matRing = GX.glow(0x45f0c0, 2.2);
      v.ring = mk(G.tor(0.3, 0.028, 8, 32), v.matRing, [0, 0.13, 0], [PI / 2, 0, 0]); v.ring.castShadow = false;
      v.core = mk(G.cyl(0.12, 0.14, 0.07, 12), v.matRing, [0, 0.12, 0]); v.core.castShadow = false;
      v.arrows = new THREE.Group();
      for (let d = 0; d < 4; d++) { const nb = c.nb[d]; if (nb < 0 || !g.cells[nb].walk) continue; const a = mk(G.cone(0.05, 0.12, 3), v.matRing, [TD.DIRS[d][0] * 0.22, 0.115, TD.DIRS[d][1] * 0.22], [PI / 2, 0, 0]); a.rotation.set(PI / 2, 0, -Math.atan2(TD.DIRS[d][1], TD.DIRS[d][0]) - PI / 2); a.rotation.order = 'YXZ'; a.rotation.set(PI / 2, Math.atan2(TD.DIRS[d][0], TD.DIRS[d][1]), 0); a.castShadow = false; v.arrows.add(a); }
      v.group.add(v.ring, v.core, v.arrows);
      // 隔离穹顶
      v.domeMat = new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, wireframe: false });
      v.dome = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.9, 8, 3, true), v.domeMat); v.dome.position.y = 0.5; v.dome.rotation.y = PI / 8; v.dome.visible = false;
      v.wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.565, 0.565, 0.9, 8, 3, true)), new THREE.LineBasicMaterial({ color: 0xff8a4a, transparent: true, opacity: 0, toneMapped: false })); v.wire.position.y = 0.5; v.wire.rotation.y = PI / 8; v.wire.visible = false;
      v.group.add(v.dome, v.wire);
      // 再次隔离间隔指示
      v.cdMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
      v.cd = new THREE.Mesh(new THREE.RingGeometry(0.40, 0.46, 40, 1, 0, PI * 2), v.cdMat); v.cd.rotation.x = -PI / 2; v.cd.position.y = 0.105; v.cd.visible = false; v.group.add(v.cd);
      v.label = GX.textSprite(c.name, { size: 34, color: '#d7f6ff', bg: 'rgba(6,18,30,0.72)', border: 'rgba(90,200,255,0.55)', scale: 0.0088 });
      v.label.position.set(0, 0.95, 0); v.group.add(v.label);
      v.state = ''; v.k = 0;
      this.dyn.add(v.group); this.nodeViews[c.i] = v;
    }

    buildEntry(B, c, x, z) {
      const T = this.T, col = new THREE.Color(TD.ENTRY_COLORS[c.id]);
      const nx = this.sim.field.next[c.i], nc = this.grid.cells[nx], dx = nc.x - c.x, dz = nc.y - c.y;
      const yaw = Math.atan2(dx, dz);
      const gp = new THREE.Group(); gp.position.set(x, 0, z); gp.rotation.y = yaw; this.dyn.add(gp);
      const gm = GX.glow(col.getHex(), 2.6);
      for (const s of [-1, 1]) { gp.add(mk(G.box(0.14, 1.25, 0.2), T.metal, [s * 0.46, 0.62, -0.3])); gp.add(mk(G.box(0.04, 1.1, 0.06), gm, [s * 0.4, 0.62, -0.2])); gp.add(mk(G.box(0.2, 0.12, 0.5), T.dark, [s * 0.46, 0.06, -0.2])); }
      gp.add(mk(G.box(1.06, 0.16, 0.24), T.metal, [0, 1.3, -0.3])); gp.add(mk(G.box(0.7, 0.05, 0.06), gm, [0, 1.2, -0.19]));
      gp.add(mk(G.cone(0.1, 0.22, 4), gm, [0, 1.52, -0.3]));
      const pm = shaderMat(`varying vec2 vUv; uniform float uT; uniform vec3 uCol;
        void main(){ vec2 p = vUv - 0.5; float r = length(p * vec2(1.0, 1.25)); float a = atan(p.y, p.x);
          float sw = 0.5 + 0.5 * sin(a * 3.0 + r * 22.0 - uT * 4.0); float ring = smoothstep(0.5, 0.2, r) * (0.35 + 0.65 * sw);
          float scan = smoothstep(0.03, 0.0, abs(fract(vUv.y * 3.0 - uT * 0.8) - 0.5) - 0.44);
          gl_FragColor = vec4(uCol * (ring * 1.4 + scan * 0.6), (ring + scan * 0.3) * smoothstep(0.5, 0.42, max(abs(p.x), abs(p.y)))); }`, { uT: this.uT, uCol: { value: col } });
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.15), pm); portal.position.set(0, 0.62, -0.3); gp.add(portal);
      const pl = new THREE.PointLight(col.getHex(), 3.5, 5, 1.6); pl.position.set(0, 0.9, 0.2); gp.add(pl);
      this.portals[c.id] = { group: gp, x, z, yaw, dx, dz };
      // 入口接入的远端数据流
      this.inflow(x - dx * 0.5, 0.6, z - dz * 0.5, -dx, -dz, col);
    }
    inflow(x, y, z, dx, dz, col) {
      const p0 = new V3(x, y, z), p1 = new V3(x + dx * 14, y + 1.5, z + dz * 14), p2 = new V3(x + dx * 40 + dz * 12, y - 6, z + dz * 40 - dx * 12), p3 = new V3(x + dx * 90 + dz * 30, y - 14, z + dz * 90 - dx * 30);
      this.flowTube(new THREE.CatmullRomCurve3([p3, p2, p1, p0]), col, 0.09, 26, 1.2);
    }
    flowTube(curve, col, rad, dashes, speed) {
      const m = shaderMat(`varying vec2 vUv; uniform float uT; uniform vec3 uCol; uniform float uN; uniform float uS;
        void main(){ float s = fract(vUv.x * uN - uT * uS); float d = smoothstep(0.0, 0.08, s) * smoothstep(0.55, 0.12, s);
          float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.985, vUv.x);
          gl_FragColor = vec4(uCol * (0.25 + d * 2.2), (0.12 + d * 0.9) * ends); }`, { uT: this.uT, uCol: { value: col }, uN: { value: dashes }, uS: { value: speed } });
      const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, rad, 6, false), m); t.frustumCulled = false; this.root.add(t); return t;
    }

    buildExit(B, c, x, z) {
      const T = this.T, th = this.theme, key = this.themeKey;
      const col = new THREE.Color(TD.EXIT_COLORS[c.id]);
      const gp = new THREE.Group(); gp.position.set(x, 0, z); this.dyn.add(gp);
      const gm = GX.glow(col.getHex(), 1.5), am = this.T.facGlow;
      // 接入环与光柱
      gp.add(mk(G.tor(0.46, 0.035, 8, 32), gm, [0, 0.05, 0], [PI / 2, 0, 0]));
      const beamM = GX.basicAdd(col.getHex(), 0.16);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.42, 1.8, 20, 1, true), beamM); beam.position.y = 0.95; gp.add(beam);
      const spin = new THREE.Group(); spin.position.y = 2.0; spin.scale.setScalar(0.6); gp.add(spin);
      if (key === 'corp') { // 数据库：三层盘片
        for (let i = 0; i < 3; i++) { spin.add(mk(G.cyl(0.52, 0.52, 0.26, 28), T.node, [0, i * 0.36, 0])); spin.add(mk(G.cyl(0.535, 0.535, 0.045, 28), i === 1 ? gm : am, [0, i * 0.36 + 0.02, 0])); }
        spin.add(mk(G.sph(0.16, 16, 12), gm, [0, 1.12, 0]));
      } else if (key === 'wan') { // 数据中心：机柜阵列塔
        spin.add(mk(G.box(0.9, 1.1, 0.9), T.rack, [0, 0.45, 0])); spin.add(mk(G.box(1.02, 0.08, 1.02), T.metal, [0, 1.04, 0])); spin.add(mk(G.box(1.02, 0.08, 1.02), T.metal, [0, -0.12, 0]));
        for (const s of [-1, 1]) spin.add(mk(G.box(0.06, 1.0, 0.7), gm, [s * 0.5, 0.45, 0]));
        spin.add(mk(G.oct(0.2), gm, [0, 1.4, 0]));
      } else if (c.id === 'X') { // 过程控制核心：反应釜
        spin.add(mk(G.lathe('vessel', [[0, 0], [0.42, 0.05], [0.55, 0.4], [0.55, 0.9], [0.4, 1.25], [0.12, 1.35], [0, 1.36]], 24), T.node, [0, -0.2, 0]));
        spin.add(mk(G.tor(0.56, 0.04, 8, 28), gm, [0, 0.25, 0], [PI / 2, 0, 0])); spin.add(mk(G.tor(0.56, 0.04, 8, 28), am, [0, 0.65, 0], [PI / 2, 0, 0]));
        spin.add(mk(G.cyl(0.07, 0.07, 0.5, 8), T.metal, [0, 1.3, 0]));
      } else { // 安全联锁核心：联锁塔
        spin.add(mk(G.prism(0.5, 0.9, 6), T.dark, [0, 0.3, 0])); spin.add(mk(G.prism(0.36, 0.5, 6), T.node, [0, 1.0, 0]));
        for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; spin.add(mk(G.box(0.1, 0.5, 0.03), i % 2 ? gm : am, [Math.cos(a) * 0.46, 0.3, Math.sin(a) * 0.46], [0, -a + PI / 2, 0])); }
        spin.add(mk(G.sph(0.14, 12, 10), GX.M.tWarn, [0, 1.42, 0]));
      }
      const halo = mk(G.tor(0.56, 0.016, 6, 48), gm, [0, 2.3, 0], [PI / 2, 0, 0]); halo.castShadow = false; gp.add(halo);
      const halo2 = mk(G.tor(0.66, 0.01, 6, 48), am, [0, 2.3, 0], [PI / 2.4, 0, 0]); halo2.castShadow = false; gp.add(halo2);
      // 四根支撑臂，把核心接到周围设施上
      for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; const arm = mk(G.box(0.05, 0.05, 1.1), T.metal, [Math.cos(a) * 0.86, 1.72, Math.sin(a) * 0.86], null); arm.rotation.order = 'YXZ'; arm.rotation.set(-0.5, -a - PI / 2, 0); gp.add(arm); }
      const pl = new THREE.PointLight(col.getHex(), 1.4, 5, 1.6); pl.position.set(0, 1.2, 0); gp.add(pl);
      const st = { spin, halo, halo2, beamM, gm, hurt: 0 };
      this.exits = this.exits || {}; this.exits[c.id] = st;
      this.anim.push((t, dt) => { spin.rotation.y = t * 0.25; spin.position.y = 2.0 + Math.sin(t * 0.9 + x) * 0.05; halo.rotation.z = t * 0.6; halo2.rotation.z = -t * 0.4; beamM.opacity = 0.08 + 0.03 * Math.sin(t * 2.2); if (st.hurt > 0) { st.hurt -= dt; gm.emissive.setRGB(1, 0.15, 0.1); gm.emissiveIntensity = 1.5 + st.hurt * 6; } else { gm.emissive.copy(col); gm.emissiveIntensity = 1.5; } });
    }

    // 公网流上的跨越点：专线隧道（玻璃管）与旧专线（桁架桥）
    buildCrossing(B, c, x, z, leg) {
      const T = this.T;
      if (!leg) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.0, 20, 1, true, 0, PI), GX.M.tGlass); tube.rotation.set(PI / 2, 0, PI / 2); tube.rotation.order = 'YXZ'; tube.rotation.set(PI / 2, 0, 0); tube.rotation.z = PI / 2; tube.position.set(x, 0.02, z); tube.renderOrder = 8;
        const tg = new THREE.Group(); tg.position.set(x, 0.02, z); const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.0, 20, 1, true, -PI / 2, PI), GX.M.tGlass); tm.rotation.x = PI / 2; tm.renderOrder = 8; tg.add(tm); this.dyn.add(tg);
        B.add(G.tor(0.62, 0.03, 6, 20, PI), T.metal, [x, 0.02, z - 0.48]); B.add(G.tor(0.62, 0.03, 6, 20, PI), T.metal, [x, 0.02, z + 0.48]);
        B.add(G.tor(0.62, 0.014, 6, 20, PI), T.accent, [x, 0.02, z]);
      } else {
        for (const s of [-1, 1]) {
          B.add(G.box(0.05, 0.05, 1.0), T.rust, [x + s * 0.5, 0.55, z]);
          B.add(G.box(0.05, 0.6, 0.05), T.rust, [x + s * 0.5, 0.28, z - 0.48]);
          B.add(G.box(0.04, 0.78, 0.04), T.rust, [x + s * 0.5, 0.28, z], [0.95, 0, 0]);
          B.add(G.box(0.04, 0.78, 0.04), T.rust, [x + s * 0.5, 0.28, z], [-0.95, 0, 0]);
          B.add(G.box(0.03, 0.02, 0.2), T.legGlow, [x + s * 0.5, 0.59, z]);
        }
        B.add(G.cyl(0.07, 0.1, 1.6, 8), T.rust, [x, -0.95, z]);
      }
    }

    // 数据设施（按主题）
    buildFacility(B, c, x, z, h) {
      const T = this.T, key = this.themeKey, g = this.grid;
      let nearExit = false; for (const e of g.exits) if (Math.abs(e.x - c.x) + Math.abs(e.y - c.y) <= 2) nearExit = true;
      let nearEntry = false; for (const e of g.entries) if (Math.abs(e.x - c.x) + Math.abs(e.y - c.y) <= 1) nearEntry = true;
      B.add(G.rbox(0.96, 0.4, 0.96, 0.04), T.hull, [x, 0.08, z]);
      B.add(G.cyl(0.5, 0.26, 0.5, 4), T.dark, [x, -0.37, z], [0, PI / 4, 0]);
      const y0 = 0.28, v = Math.floor(h * 3);
      if (nearExit) { // 核心周边：高大的机柜墙 / 储罐
        const hh = 0.55 + h * 0.5;
        if (key === 'ics') { B.add(G.cyl(0.36, 0.4, hh, 16), T.metal, [x, y0 + hh / 2, z]); B.add(G.hemi(0.36, 16), T.metal, [x, y0 + hh, z]); B.add(G.tor(0.4, 0.03, 6, 20), T.hazard, [x, y0 + hh * 0.5, z], [PI / 2, 0, 0]); B.add(G.cyl(0.05, 0.05, 0.9, 8), T.rust, [x + 0.3, y0 + hh + 0.1, z], [0, 0, 0.6]); }
        else { B.add(G.box(0.8, hh, 0.8), T.rack, [x, y0 + hh / 2, z]); B.add(G.box(0.86, 0.06, 0.86), T.metal, [x, y0 + hh + 0.03, z]); B.add(G.box(0.3, 0.14, 0.3), T.dark, [x, y0 + hh + 0.12, z]); B.add(G.box(0.82, 0.03, 0.82), T.facGlow, [x, y0 + 0.02, z]); }
        return;
      }
      if (nearEntry) { // 入口旁：信标塔
        B.add(G.cyl(0.08, 0.14, 1.5, 8), T.metal, [x, y0 + 0.75, z]); B.add(G.box(0.5, 0.05, 0.05), T.metal, [x, y0 + 1.2, z]); B.add(G.box(0.05, 0.05, 0.5), T.metal, [x, y0 + 1.0, z]); B.add(G.sph(0.08, 10, 8), T.facGlow, [x, y0 + 1.56, z]);
        B.add(G.box(0.5, 0.3, 0.5), T.rack, [x, y0 + 0.15, z]);
        return;
      }
      if (key === 'corp') {
        if (v === 0) { for (const s of [-0.22, 0.22]) { B.add(G.box(0.34, 1.05, 0.74), T.rack, [x + s, y0 + 0.52, z]); B.add(G.box(0.36, 0.04, 0.76), T.metal, [x + s, y0 + 1.06, z]); } B.add(G.box(0.08, 0.02, 0.7), T.facGlow, [x, y0 + 0.01, z]); }
        else if (v === 1) { B.add(G.cyl(0.36, 0.36, 0.9, 20), T.metal, [x, y0 + 0.45, z]); for (const yy of [0.2, 0.45, 0.7]) B.add(G.cyl(0.37, 0.37, 0.04, 20), T.facGlow, [x, y0 + yy, z]); B.add(G.cone(0.3, 0.2, 20), T.dark, [x, y0 + 1.0, z]); }
        else { B.add(G.box(0.8, 0.55, 0.8), T.win, [x, y0 + 0.27, z]); B.add(G.box(0.5, 0.4, 0.5), T.win, [x - 0.1, y0 + 0.75, z + 0.1]); B.add(G.cyl(0.015, 0.015, 0.6, 5), T.metal, [x + 0.2, y0 + 0.85, z - 0.2]); B.add(G.sph(0.035, 8, 6), GX.M.tWarn, [x + 0.2, y0 + 1.16, z - 0.2]); }
      } else if (key === 'wan') {
        if (v === 0) { B.add(G.cyl(0.05, 0.1, 1.5, 6), T.metal, [x, y0 + 0.75, z]); for (const yy of [0.5, 0.9, 1.3]) B.add(G.box(0.36, 0.03, 0.03), T.metal, [x, y0 + yy, z], [0, yy * 2, 0]); B.add(G.hemi(0.3, 16), T.node, [x + 0.1, y0 + 1.2, z + 0.1], [2.2, 0.6, 0]); B.add(G.sph(0.05, 8, 6), T.facGlow, [x, y0 + 1.54, z]); }
        else if (v === 1) { B.add(G.tor(0.3, 0.13, 10, 24), T.metal, [x, y0 + 0.42, z], [0, h * 6, 0]); B.add(G.tor(0.3, 0.135, 6, 24), T.facGlow, [x, y0 + 0.42, z], [0, h * 6, 0], [1, 1, 0.3]); B.add(G.box(0.12, 0.42, 0.5), T.dark, [x, y0 + 0.21, z], [0, h * 6, 0]); }
        else { B.add(G.box(0.78, 0.6, 0.6), T.rack, [x, y0 + 0.3, z]); for (let i = -3; i <= 3; i++) B.add(G.box(0.02, 0.5, 0.74), T.metal, [x + i * 0.11, y0 + 0.36, z]); B.add(G.box(0.8, 0.03, 0.03), T.facGlow, [x, y0 + 0.62, z + 0.3]); }
      } else {
        if (v === 0) { B.add(G.cyl(0.34, 0.34, 0.85, 16), T.metal, [x, y0 + 0.42, z]); B.add(G.hemi(0.34, 16), T.metal, [x, y0 + 0.85, z]); B.add(G.tor(0.345, 0.025, 6, 20), T.hazard, [x, y0 + 0.3, z], [PI / 2, 0, 0]); B.add(G.cyl(0.04, 0.04, 0.8, 8), T.rust, [x + 0.38, y0 + 0.4, z]); B.add(G.tor(0.09, 0.02, 6, 12), GX.M.tWarn, [x + 0.38, y0 + 0.82, z], [PI / 2, 0, 0]); }
        else if (v === 1) { B.add(G.lathe('cool', [[0.36, 0], [0.24, 0.5], [0.22, 0.75], [0.3, 1.1], [0.27, 1.1], [0.2, 0.75], [0.33, 0]], 18), T.node, [x, y0, z]); this.steam = this.steam || []; this.steam.push([x, y0 + 1.15, z]); }
        else { for (const s of [-0.24, 0.02, 0.28]) { B.add(G.box(0.22, 0.8, 0.6), T.rack, [x + s, y0 + 0.4, z]); } B.add(G.cyl(0.035, 0.035, 0.9, 6), T.rust, [x, y0 + 0.86, z - 0.2], [0, 0, PI / 2]); B.add(G.box(0.74, 0.03, 0.03), T.facGlow, [x + 0.02, y0 + 0.02, z + 0.31]); }
      }
    }

    // 公网流：横贯战场并延伸到远方的光河
    buildFlow(B) {
      const g = this.grid, rows = [];
      for (let y = 0; y < this.H; y++) if (g.cells[y * this.W].kind === 'flow') rows.push(y);
      if (!rows.length) return;
      const z0 = this.wz(rows[0]) - 0.5, z1 = this.wz(rows[rows.length - 1]) + 0.5, zc = (z0 + z1) / 2, wd = z1 - z0;
      const th = this.theme;
      const m = shaderMat(NOISE + `varying vec2 vUv; varying vec3 vW; uniform float uT; uniform vec3 cA, cB;
        void main(){ float ln = floor(vUv.y * 30.0); float h = hash(ln * 1.7 + 3.0);
          float s = fract(vW.x * 0.07 * (0.5 + h) - uT * (0.25 + h * 0.9) + h * 13.0);
          float st = smoothstep(0.0, 0.04, s) * smoothstep(0.12 + 0.3 * h, 0.0, s);
          float n = fbm(vec2(vW.x * 0.15 - uT * 0.6, vUv.y * 6.0));
          vec3 col = mix(cA, cB, h) * (0.22 + n * 0.35 + st * 2.6);
          float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float far = smoothstep(150.0, 40.0, abs(vW.x));
          gl_FragColor = vec4(col, (0.5 + st * 0.5) * edge * far); }`, { uT: this.uT, cA: { value: new THREE.Color(0x8a4dff) }, cB: { value: new THREE.Color(0xff5fc0) } }, { blending: THREE.NormalBlending });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(320, wd), m); p.rotation.x = -PI / 2; p.position.set(0, -0.42, zc); p.renderOrder = 1; this.root.add(p);
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(320, wd), new THREE.MeshBasicMaterial({ color: 0x08041a })); dk.rotation.x = -PI / 2; dk.position.set(0, -0.5, zc); this.root.add(dk);
      for (const zz of [z0, z1]) { B.add(G.box(this.W + 1, 0.12, 0.08), this.T.metal, [0, -0.06, zz]); B.add(G.box(this.W + 1, 0.02, 0.03), GX.M.eGlow2, [0, 0.01, zz]); }
      // 河面上疾驰的公网数据包
      const N = 260, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), spd = new Float32Array(N), rg = TD.makeRng(5);
      for (let i = 0; i < N; i++) { pos[i * 3] = rg.range(-70, 70); pos[i * 3 + 1] = -0.3 + rg() * 0.25; pos[i * 3 + 2] = rg.range(z0 + 0.15, z1 - 0.15); spd[i] = rg.range(5, 16); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: 0xffc8ff, size: 0.16, map: GX.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; this.root.add(pts);
      let last = 0;
      this.anim.push((t) => { const dt = Math.min(0.1, Math.max(0, t - last)); last = t; for (let i = 0; i < N; i++) { pos[i * 3] += spd[i] * dt; if (pos[i * 3] > 70) pos[i * 3] -= 140; } geo.attributes.position.needsUpdate = true; });
    }

    // 气隙：物理断开的深坑
    buildGap(B) {
      const g = this.grid, T = this.T; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, any = false;
      for (const c of g.cells) if (c.kind === 'gap') { any = true; x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
      if (!any) return;
      const ax = this.wx(x0) - 0.5, bx = this.wx(x1) + 0.5, az = this.wz(y0) - 0.5, bz = this.wz(y1) + 0.5, cx = (ax + bx) / 2, cz = (az + bz) / 2, w = bx - ax, d = bz - az;
      // 警示边框
      for (const [px, pz, len, rot] of [[cx, az + 0.06, w, 0], [cx, bz - 0.06, w, 0], [ax + 0.06, cz, d, PI / 2], [bx - 0.06, cz, d, PI / 2]]) { B.add(G.box(len, 0.16, 0.12), T.hazard, [px, -0.04, pz], [0, rot, 0]); B.add(G.box(len, 0.02, 0.03), GX.M.tWarn, [px, 0.05, pz], [0, rot, 0]); }
      // 坑壁与坑底
      const wallM = new THREE.MeshStandardMaterial({ color: 0x0c1110, metalness: 0.7, roughness: 0.6, side: THREE.BackSide });
      const pit = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 6, d - 0.1), wallM); pit.position.set(cx, -3.1, cz); pit.receiveShadow = true; this.root.add(pit);
      const m = shaderMat(NOISE + `varying vec2 vUv; varying vec3 vW; uniform float uT;
        void main(){ vec2 p = vUv - 0.5; float r = length(p); float sw = fbm(vec2(atan(p.y, p.x) * 2.0 + uT * 0.15, r * 9.0 - uT * 0.4));
          vec2 gq = abs(fract(vW.xz * 1.0) - 0.5); float gr = smoothstep(0.47, 0.5, max(gq.x, gq.y));
          vec3 col = vec3(1.0, 0.45, 0.1) * (pow(sw, 3.0) * 1.3 + gr * 0.25) ;
          gl_FragColor = vec4(col, (pow(sw, 3.0) * 0.7 + gr * 0.2) * smoothstep(0.52, 0.3, max(abs(p.x), abs(p.y)))); }`, { uT: this.uT });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); fl.rotation.x = -PI / 2; fl.position.set(cx, -2.6, cz); this.root.add(fl);
      // 断开的线缆头：两岸伸出却不相接
      for (let i = 0; i < 6; i++) {
        const zz = az + (i + 0.5) * d / 6;
        for (const s of [-1, 1]) { const px = s < 0 ? ax : bx; B.add(G.cyl(0.05, 0.05, 1.3, 8), T.metal, [px - s * 0.65, -0.35, zz], [0, 0, PI / 2]); B.add(G.cyl(0.075, 0.075, 0.14, 8), T.hazard, [px - s * 1.3, -0.35, zz], [0, 0, PI / 2]); B.add(G.sph(0.05, 8, 6), GX.M.tWarn, [px - s * 1.4, -0.35, zz]); }
      }
      // 警示桩
      for (const [px, pz] of [[ax, az], [bx, az], [ax, bz], [bx, bz], [cx, az], [cx, bz]]) { B.add(G.cyl(0.05, 0.07, 0.9, 8), T.hazard, [px, 0.45, pz]); B.add(G.sph(0.07, 10, 8), GX.M.tWarn, [px, 0.95, pz]); }
      const tx = GX.flatText('AIR GAP · 气隙 · 物理断开', { color: '#ffb060', opacity: 0.55, h: 0.9 }); tx.position.set(cx, -0.45, cz); this.root.add(tx);
      // 坑内悬浮的尘埃
      const N = 160, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), rg = TD.makeRng(9), base = [];
      for (let i = 0; i < N; i++) { base.push([rg.range(ax + 0.3, bx - 0.3), rg.range(-2.5, -0.2), rg.range(az + 0.3, bz - 0.3), rg() * 6.28, 0.2 + rg() * 0.5]); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffa050, size: 0.07, map: GX.glowTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); this.root.add(pts);
      this.anim.push((t) => { for (let i = 0; i < N; i++) { const b = base[i]; pos[i * 3] = b[0] + Math.sin(t * b[4] + b[3]) * 0.3; pos[i * 3 + 1] = b[1] + ((t * b[4] * 0.3 + b[3]) % 1) * 0.6; pos[i * 3 + 2] = b[2] + Math.cos(t * b[4] * 0.8 + b[3]) * 0.3; } geo.attributes.position.needsUpdate = true; });
    }

    // ---------- 远景 ----------
    buildBackdrop() {
      const th = this.theme, rng = this.rng, key = this.themeKey;
      const colA = new THREE.Color(th.accent), colB = new THREE.Color(th.rim);
      // 远处的网络集群
      this.clusters = [];
      const nC = 11;
      for (let k = 0; k < nC; k++) {
        const ang = k / nC * PI * 2 + rng() * 0.4, rad = 48 + rng() * 55, cy = -10 + rng() * 22;
        const grp = new THREE.Group(); grp.position.set(Math.cos(ang) * rad, cy, Math.sin(ang) * rad);
        const n = 26 + Math.floor(rng() * 30), pts = [], P = [];
        for (let i = 0; i < n; i++) { const a = rng() * PI * 2, r = Math.pow(rng(), 0.6) * (6 + rng() * 6), y = (Math.floor(rng() * 4) - 1.5) * 2.2 + rng() * 0.4; P.push(new V3(Math.cos(a) * r, y, Math.sin(a) * r)); pts.push(P[i].x, P[i].y, P[i].z); }
        const lines = [];
        for (let i = 0; i < n; i++) { let bj = -1, bd = 1e9, bj2 = -1, bd2 = 1e9; for (let j = 0; j < n; j++) { if (i === j) continue; const d = P[i].distanceToSquared(P[j]); if (d < bd) { bd2 = bd; bj2 = bj; bd = d; bj = j; } else if (d < bd2) { bd2 = d; bj2 = j; } } for (const j of [bj, bj2]) if (j >= 0) lines.push(P[i].x, P[i].y, P[i].z, P[j].x, P[j].y, P[j].z); }
        const col = colA.clone().lerp(colB, rng());
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        grp.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: col, size: 1.5, map: GX.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })));
        const lgm = new THREE.BufferGeometry(); lgm.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        grp.add(new THREE.LineSegments(lgm, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35, fog: false, depthWrite: false })));
        // 集群里的实体：远处的机房块
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.22), fog: false }), n);
        const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3();
        for (let i = 0; i < n; i++) { sv.set(0.5 + rng() * 1.4, 0.4 + rng() * 2.2, 0.5 + rng() * 1.4); mx.compose(P[i].clone().setY(P[i].y - sv.y / 2), q, sv); im.setMatrixAt(i, mx); }
        grp.add(im);
        this.root.add(grp); this.clusters.push({ grp, sp: (rng() - 0.5) * 0.05, y: cy, ph: rng() * 6 });
      }
      // 集群之间与通往战场的数据流
      const C = this.clusters;
      for (let k = 0; k < C.length; k++) {
        const a = C[k].grp.position, b = C[(k + 1 + Math.floor(rng() * 3)) % C.length].grp.position;
        const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 8 + rng() * 10; mid.multiplyScalar(0.8);
        this.flowTube(new THREE.QuadraticBezierCurve3(a, mid, b), colA.clone().lerp(colB, rng()), 0.12, 30, 0.5 + rng() * 0.6);
      }
      // 出口向下贯穿协议层的主干
      for (const ex of this.grid.exits) {
        const x = this.wx(ex.x), z = this.wz(ex.y);
        const tr = this.flowTube(new THREE.LineCurve3(new V3(x, -0.4, z), new V3(x, -13.5, z)), new THREE.Color(TD.EXIT_COLORS[ex.id]).multiplyScalar(0.45), 0.06, 12, 0.9);
        const b = C[Math.floor(rng() * C.length)].grp.position;
        this.flowTube(new THREE.QuadraticBezierCurve3(new V3(x, -13.4, z), new V3(x * 2, -18, z * 2 + 10), b), colA, 0.12, 40, 0.7);
      }
      for (const k in this.nodeViews) { const v = this.nodeViews[k]; this.flowTube(new THREE.LineCurve3(new V3(v.group.position.x, -0.4, v.group.position.z), new V3(v.group.position.x, -6.6, v.group.position.z)), colA, 0.05, 8, 0.7); }
      // 主题远景
      const B = new GX.Batch(), T = this.T, R = (a, b) => a + rng() * (b - a);
      if (key === 'corp') { // 远处成片的办公/机房楼宇
        for (let i = 0; i < 46; i++) { const a = rng() * PI * 2, r = R(24, 60); const hh = R(3, 14), ww = R(1.6, 3.4); const px = Math.cos(a) * r * 1.25, pz = Math.sin(a) * r; if (Math.abs(px) < this.ox + 4 && Math.abs(pz) < this.oz + 4) continue; B.add(G.box(1, 1, 1), T.win, [px, -8 - R(0, 6) + hh / 2, pz], [0, R(0, 0.4), 0], [ww, hh, ww]); B.add(G.box(1, 1, 1), T.dark, [px, -8.2 - R(0, 6), pz], null, [ww * 1.3, 0.3, ww * 1.3]); }
      } else if (key === 'wan') { // 横跨天际的骨干干线与中继环
        for (let i = 0; i < 5; i++) { const zz = -34 + i * 17 + R(-3, 3), yy = R(-14, -5); this.flowTube(new THREE.CatmullRomCurve3([new V3(-150, yy + 14, zz - 20), new V3(-50, yy, zz), new V3(0, yy - 3, zz + R(-4, 4)), new V3(50, yy, zz), new V3(150, yy + 14, zz + 20)]), colA.clone().lerp(colB, i / 4), 0.28, 60, 0.9 + i * 0.15); }
        for (let i = 0; i < 9; i++) { const a = rng() * PI * 2, r = R(26, 52), px = Math.cos(a) * r * 1.3, pz = Math.sin(a) * r, yy = R(-9, 3); const ringG = new THREE.Group(); ringG.position.set(px, yy, pz); ringG.rotation.set(R(0, PI), R(0, PI), 0); ringG.add(mk(G.tor(2.4, 0.12, 8, 40), T.metal)); ringG.add(mk(G.tor(2.1, 0.03, 6, 40), T.facGlow)); this.root.add(ringG); const sp = R(0.1, 0.3) * (rng() < 0.5 ? -1 : 1); this.anim.push((t) => { ringG.rotation.z = t * sp; }); }
      } else { // 工业远景：缓慢转动的巨型齿环、管廊与储罐
        for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.5, r = R(30, 50), px = Math.cos(a) * r * 1.3, pz = Math.sin(a) * r, yy = R(-10, 0), rad = R(3, 6); const gg = new THREE.Group(); gg.position.set(px, yy, pz); gg.rotation.set(PI / 2 + R(-0.3, 0.3), 0, R(0, 1)); gg.add(mk(G.tor(rad, 0.4, 8, 36), T.metal, null, null, 1)); const nt = Math.floor(rad * 5); for (let k = 0; k < nt; k++) { const q = k / nt * PI * 2; gg.add(mk(G.box(0.5, 0.9, 0.5), T.rust, [Math.cos(q) * (rad + 0.5), Math.sin(q) * (rad + 0.5), 0], [0, 0, q])); } gg.add(mk(G.tor(rad * 0.6, 0.06, 6, 30), T.facGlow)); this.root.add(gg); const sp = R(0.06, 0.16) * (i % 2 ? -1 : 1); this.anim.push((t) => { gg.children.forEach(c2 => { }); gg.rotation.z = t * sp; }); }
        for (let i = 0; i < 18; i++) { const a = rng() * PI * 2, r = R(22, 55), px = Math.cos(a) * r * 1.3, pz = Math.sin(a) * r; if (Math.abs(px) < this.ox + 4 && Math.abs(pz) < this.oz + 4) continue; const hh = R(3, 9); B.add(G.cyl(1, 1, 1, 14), T.metal, [px, -9 + hh / 2, pz], null, [R(0.8, 1.8), hh, R(0.8, 1.8)]); B.add(G.cyl(1, 1, 1, 8), T.rust, [px, -8, pz], [0, 0, PI / 2], [0.25, R(8, 20), 0.25]); }
      }
      B.build(this.root, { cast: false, receive: false });
      // 冷却塔蒸汽
      if (this.steam && this.steam.length) {
        const S = this.steam, per = 14, N = S.length * per, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), rg = TD.makeRng(3), ph = []; for (let i = 0; i < N; i++) ph.push([rg(), rg.range(-1, 1), rg.range(-1, 1)]);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd8d0, size: 0.5, map: GX.glowTex, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false })); this.root.add(pts);
        this.anim.push((t) => { for (let i = 0; i < N; i++) { const s = S[Math.floor(i / per)], p = ph[i], u = (t * 0.22 + p[0]) % 1; pos[i * 3] = s[0] + p[1] * 0.25 * u * 2.2 + u * 0.4; pos[i * 3 + 1] = s[1] + u * 1.9; pos[i * 3 + 2] = s[2] + p[2] * 0.25 * u * 2.2; } geo.attributes.position.needsUpdate = true; });
      }
      // 漂浮的数据尘
      const N = 500, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), rg = TD.makeRng(12);
      for (let i = 0; i < N; i++) { pos[i * 3] = rg.range(-45, 45); pos[i * 3 + 1] = rg.range(-12, 9); pos[i * 3 + 2] = rg.range(-35, 35); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: colA, size: 0.11, map: GX.glowTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); this.root.add(dust);
      this.anim.push((t) => { dust.rotation.y = t * 0.006; dust.position.y = Math.sin(t * 0.1) * 0.6; for (const c of this.clusters) { c.grp.rotation.y = t * c.sp; c.grp.position.y = c.y + Math.sin(t * 0.15 + c.ph) * 0.8; } });
    }

    buildLabels() {
      const sim = this.sim, g = this.grid;
      this.entryLabels = {};
      for (const e of g.entries) this.setEntryLabel(e.id, sim.routes[e.id] ? sim.routes[e.id].exit : null);
      for (const e of g.exits) {
        const col = TD.EXIT_COLORS[e.id];
        const s = GX.textSprite(e.name, { size: 40, color: '#fff', tag: e.id, tagBg: col, tagFg: '#06101c', bg: 'rgba(6,14,26,0.82)', border: col, scale: 0.0105 });
        s.position.set(this.wx(e.x), 3.15, this.wz(e.y)); this.root.add(s);
      }
      for (const z of sim.def.zones) { const t = GX.flatText(z.t, { color: this.theme.accent, opacity: 0.42, h: 0.5 }); t.position.set(this.wx(z.x), 0.012 + (g.cells[Math.round(z.y) * this.W + Math.round(z.x)] && g.cells[Math.round(z.y) * this.W + Math.round(z.x)].type === 'platform' ? 0.43 : -0.5), this.wz(z.y)); if (t.position.y < 0) t.position.y = -0.5; this.root.add(t); }
    }

    // 入口标签：名称 + 当前通往的出口
    setEntryLabel(id, exit) {
      const old = this.entryLabels[id]; if (old && old.userData.exit === exit) return null;
      const e = this.grid.entries.find(q => q.id === id), col = TD.ENTRY_COLORS[id], p = this.portals[id];
      const s = GX.textSprite(e.name + (exit ? '  → ' + exit : ''), { size: 40, color: '#fff', tag: id, tagBg: col, tagFg: '#06101c', bg: 'rgba(6,14,26,0.82)', border: col, scale: 0.0105 });
      s.position.set(p.x - p.dx * 0.25, 2.05, p.z - p.dz * 0.25); s.userData.exit = exit; this.root.add(s); this.entryLabels[id] = s;
      if (old) { this.root.remove(old); old.material.map.dispose(); old.material.dispose(); }
      return { old, neu: s };
    }

    // ---------- 每帧 ----------
    update(envT, dt, sim) {
      this.uT.value = envT;
      for (const f of this.anim) f(envT, dt);
      // 节点状态
      for (const k in this.nodeViews) {
        const v = this.nodeViews[k], ns = sim.nodes[k], blocked = sim.blockCnt[k] > 0, iso = !!(ns.tower || ns.iso);
        const target = iso ? 1 : 0; v.k += (target - v.k) * Math.min(1, dt * 7);
        v.ring.rotation.z += dt * (iso ? 0.2 : 1.6);
        if (iso) { v.matRing.emissive.setRGB(1, 0.32, 0.12); } else if (ns.reT > 0) { v.matRing.emissive.setRGB(1, 0.78, 0.25); } else if (blocked) { v.matRing.emissive.setRGB(0.8, 0.2, 1); } else { v.matRing.emissive.setRGB(0.25, 0.95, 0.75); }
        v.matRing.emissiveIntensity = 2.0 + 0.6 * Math.sin(envT * 3 + v.ci);
        v.arrows.visible = !iso && !blocked; v.arrows.rotation.y = 0; v.arrows.children.forEach((a, i) => { a.position.y = 0.115 + 0.012 * Math.sin(envT * 5 + i); });
        const show = v.k > 0.02; v.dome.visible = v.wire.visible = show;
        if (show) { const hit = ns.engT > 3.6 ? 1 : 0; v.dome.scale.set(1, v.k, 1); v.wire.scale.set(1, v.k, 1); v.dome.position.y = v.wire.position.y = 0.08 + 0.45 * v.k; v.domeMat.opacity = (ns.iso ? 0.2 : 0.11) * v.k + 0.05 * Math.sin(envT * 4) * v.k + hit * 0.15; v.wire.material.opacity = 0.75 * v.k; v.wire.material.color.setHex(ns.iso ? 0xffd24a : 0xff8a4a); v.domeMat.color.setHex(ns.iso ? 0xffc23a : 0xff6a3a); }
        if (ns.reT > 0 && !iso) { v.cd.visible = true; const f = ns.reT / TD.RULES.reisolate; v.cd.geometry.dispose(); v.cd.geometry = new THREE.RingGeometry(0.40, 0.47, 40, 1, PI / 2, PI * 2 * f); } else v.cd.visible = false;
      }
    }
  }
  GX.MapScene = MapScene;
})(window);
