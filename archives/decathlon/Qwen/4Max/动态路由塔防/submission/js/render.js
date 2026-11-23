/* 渲染器：Three.js 场景、镜头（Blender 式）、路线带、实体同步、粒子特效、拾取、预览。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const T = root.THREE;
  if (!T) return;
  const CELL = ND.CELL_SIZE;
  const M = ND.Models, THEMES = ND.THEMES;

  function makeChevronTex() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 2; i++) {
      const x = i * 32 + 8;
      ctx.beginPath();
      ctx.moveTo(x, 4); ctx.lineTo(x + 12, 16); ctx.lineTo(x, 28);
      ctx.lineTo(x + 6, 16); ctx.closePath(); ctx.fill();
    }
    const tx = new T.CanvasTexture(c);
    tx.wrapS = T.RepeatWrapping; tx.wrapT = T.ClampToEdgeWrapping;
    return tx;
  }

  function ribbonGeometry(points, width) {
    // points: [{x,z}]，沿路径构建扁平条带，UV.x 随长度累计
    const pos = [], uv = [], idx = [];
    let len = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x, dz = next.z - prev.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const px = -dz, pz = dx; // 垂直
      if (i > 0) len += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const u = len / 3;
      pos.push(p.x + px * width / 2, 0, p.z + pz * width / 2);
      pos.push(p.x - px * width / 2, 0, p.z - pz * width / 2);
      uv.push(u, 0, u, 1);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  class Renderer {
    constructor(container) {
      this.container = container;
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      container.appendChild(this.renderer.domElement);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(45, 1, 0.1, 400);
      this.raycaster = new T.Raycaster();
      this.groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
      this.chevron = makeChevronTex();
      this.boardGroup = new T.Group(); this.scene.add(this.boardGroup);
      this.fxGroup = new T.Group(); this.scene.add(this.fxGroup);
      this.routeGroup = new T.Group(); this.scene.add(this.routeGroup);
      this.overlayGroup = new T.Group(); this.scene.add(this.overlayGroup);
      this.entityGroup = new T.Group(); this.scene.add(this.entityGroup);
      this.towerMeshes = new Map(); this.enemyMeshes = new Map();
      this.cellMeshes = []; this.nodeMarkers = new Map(); this.entryMeshes = {}; this.exitMeshes = {};
      this.routeRibbons = {}; this.previewRibbons = {};
      this.particles = []; this.rings = []; this.beams = [];
      this.cam = { target: new T.Vector3(), radius: 30, theta: Math.PI / 4, phi: Math.PI / 3.2 };
      this.camGoal = { target: new T.Vector3(), radius: 30, theta: Math.PI / 4, phi: Math.PI / 3.2 };
      this.game = null; this.theme = THEMES.corporate;
      this.selected = null; this.hoverCell = -1;
      this.deploy = null; this.itemTarget = null; this.routePreview = null;
      this.shakeT = 0; this.time = 0;
      this._setupLights();
      this.resize();
      root.addEventListener('resize', () => this.resize());
    }
    _setupLights() {
      this.ambient = new T.AmbientLight(0x223a55, 0.7); this.scene.add(this.ambient);
      this.hemi = new T.HemisphereLight(0xbfe3ff, 0x0a1428, 0.5); this.scene.add(this.hemi);
      this.key = new T.DirectionalLight(0xbfe3ff, 1.4);
      this.key.position.set(18, 30, 12); this.key.castShadow = true;
      this.key.shadow.mapSize.set(2048, 2048);
      const s = 30; this.key.shadow.camera.left = -s; this.key.shadow.camera.right = s; this.key.shadow.camera.top = s; this.key.shadow.camera.bottom = -s;
      this.key.shadow.camera.near = 1; this.key.shadow.camera.far = 90;
      this.key.shadow.bias = -0.0005;
      this.scene.add(this.key);
      this.rim = new T.DirectionalLight(0x3a7bd5, 0.6); this.rim.position.set(-20, 12, -18); this.scene.add(this.rim);
      this.fill = new T.PointLight(0x35d6ff, 0.5, 80); this.fill.position.set(0, 10, 0); this.scene.add(this.fill);
    }
    resize() {
      const w = this.container.clientWidth || root.innerWidth, h = this.container.clientHeight || root.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.width = w; this.height = h;
    }
    setTheme(theme) {
      this.theme = THEMES[theme] || THEMES.corporate;
      const th = this.theme;
      this.scene.background = new T.Color(th.bg);
      this.scene.fog = new T.Fog(th.fog, 45, 170);
      this.ambient.color.setHex(th.ambient);
      this.key.color.setHex(th.key); this.rim.color.setHex(th.rim); this.fill.color.setHex(th.accent);
      this._makeSky(th);
    }
    _makeSky(th) {
      if (this.sky) { this.scene.remove(this.sky); this.sky.geometry.dispose(); this.sky.material.dispose(); }
      const c = (hex) => new T.Color(hex);
      const mat = new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { cTop: { value: c(th.fog).multiplyScalar(1.5) }, cMid: { value: c(th.bg) }, cBot: { value: c(th.bg).multiplyScalar(0.4) }, cGlow: { value: c(th.accent) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; uniform vec3 cTop,cMid,cBot,cGlow; void main(){ float h = normalize(vP).y; vec3 col = h>0.0 ? mix(cMid,cTop,pow(h,0.7)) : mix(cMid,cBot,pow(-h,0.6)); float band = exp(-abs(h-0.02)*7.0); col += cGlow*band*0.10; gl_FragColor = vec4(col,1.0); }'
      });
      this.sky = new T.Mesh(new T.SphereGeometry(180, 32, 24), mat);
      this.scene.add(this.sky);
    }
    loadGame(game) {
      this.game = game;
      this.setTheme(game.mapDef.theme);
      // 清理
      this.boardGroup.clear(); this.routeGroup.clear(); this.overlayGroup.clear(); this.entityGroup.clear(); this.fxGroup.clear();
      this.towerMeshes.clear(); this.enemyMeshes.clear(); this.nodeMarkers.clear();
      this.cellMeshes = []; this.entryMeshes = {}; this.exitMeshes = {}; this.routeRibbons = {}; this.previewRibbons = {};
      this.particles = []; this.rings = []; this.beams = []; this.trafficPackets = []; this._pvKey = null;
      const grid = game.grid, th = this.theme;
      // 环境
      this.env = M.makeEnvironment(game.mapDef.theme, grid.w * CELL, grid.h * CELL);
      this.boardGroup.add(this.env);
      // 底板
      const bw = grid.w * CELL + 4, bh = grid.h * CELL + 4;
      const slab = new T.Mesh(new T.BoxGeometry(bw, 0.6, bh), new T.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.7, metalness: 0.3, transparent: true, opacity: 0.85 }));
      slab.position.y = -0.6; slab.receiveShadow = true; this.boardGroup.add(slab);
      const slabEdge = new T.Mesh(new T.BoxGeometry(bw + 0.3, 0.1, bh + 0.3), M.std(th.accent, { emissive: th.accent, ei: 0.6 }));
      slabEdge.position.y = -0.3; this.boardGroup.add(slabEdge);
      // 格子
      for (const cell of grid.cells) {
        if (cell.type === ND.CELL.VOID) continue;
        const mesh = M.makeCell(cell, game.mapDef.theme, grid);
        const p = game.cellCenter(cell.i);
        mesh.position.set(p.x, 0, p.z);
        mesh.userData.cell = cell.i;
        this.boardGroup.add(mesh);
        this.cellMeshes[cell.i] = mesh;
        if (cell.type === ND.CELL.NODE) {
          const marker = M.makeNodeMarker(); marker.position.set(p.x, 0.02, p.z);
          this.boardGroup.add(marker); this.nodeMarkers.set(cell.i, marker);
        }
        if (cell.type === ND.CELL.ENTRY) {
          const col = ND.ENTRY_COLORS[cell.entry];
          const em = M.makeEntry(col); em.position.set(p.x, 0, p.z); this.boardGroup.add(em); this.entryMeshes[cell.entry] = em;
        }
        if (cell.type === ND.CELL.EXIT) {
          const col = ND.EXIT_COLORS[cell.exit];
          const ex = M.makeExit(col); ex.position.set(p.x, 0, p.z); this.boardGroup.add(ex); this.exitMeshes[cell.exit] = ex;
        }
      }
      this.buildRoutes(game, false);
      this.defaultView(true);
    }
    cellWorld(i) { return this.game.cellCenter(i); }
    buildRoutes(game, preview, blockedSet, legacySet) {
      const R = ND.Routing;
      const field = R.field(game.grid, blockedSet || game.blocked, legacySet || game.legacySet);
      const routes = R.entryRoutes(game.grid, field);
      const target = preview ? this.previewRibbons : this.routeRibbons;
      // 清理旧的
      for (const k of Object.keys(target)) { this.routeGroup.remove(target[k]); target[k].geometry.dispose(); }
      if (preview) this.previewRibbons = {}; else this.routeRibbons = {};
      const tt = preview ? this.previewRibbons : this.routeRibbons;
      for (const k of Object.keys(routes)) {
        const path = routes[k]; if (!path) continue;
        const pts = path.map(i => this.cellWorld(i));
        const geo = ribbonGeometry(pts, preview ? 0.34 : 0.5);
        const col = ND.ENTRY_COLORS[k];
        const mat = new T.MeshBasicMaterial({ map: this.chevron, color: col, transparent: true, opacity: preview ? 0.5 : 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
        const mesh = new T.Mesh(geo, mat); mesh.position.y = preview ? 0.1 : 0.07;
        mesh.userData.entry = k; mesh.userData.preview = preview;
        const cum = [0]; for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j].x - pts[j - 1].x, pts[j].z - pts[j - 1].z));
        mesh.userData.pts = pts; mesh.userData.cum = cum; mesh.userData.total = cum[cum.length - 1];
        this.routeGroup.add(mesh); tt[k] = mesh;
      }
      return routes;
    }
    clearPreview() {
      for (const k of Object.keys(this.previewRibbons)) { this.routeGroup.remove(this.previewRibbons[k]); this.previewRibbons[k].geometry.dispose(); }
      this.previewRibbons = {}; this._pvKey = null;
    }
    // 隔离预览：显示各入口新路线，高亮发生改道的入口
    _isolationPreview(game, i, key) {
      if (this._pvKey === key) return;
      this._pvKey = key;
      const blocked = new Set(game.blocked); blocked.add(i);
      const routes = this.buildRoutes(game, true, blocked, game.legacySet);
      const changed = ND.Routing.changedEntries(game.routes, routes);
      for (const k of Object.keys(this.previewRibbons)) {
        const m = this.previewRibbons[k];
        if (changed.includes(k)) { m.material.color.setHex(0xffffff); m.material.opacity = 0.9; }
        else { m.material.opacity = 0.3; }
      }
    }
    defaultView(instant) {
      const g = this.game; if (!g) return;
      const span = Math.max(g.w, g.h) * CELL;
      this.camGoal.radius = span * 0.95;
      this.camGoal.theta = Math.PI / 4; this.camGoal.phi = Math.PI / 3.1;
      this.camGoal.target.set(0, 0, 0);
      if (instant) { this.cam.radius = this.camGoal.radius; this.cam.theta = this.camGoal.theta; this.cam.phi = this.camGoal.phi; this.cam.target.copy(this.camGoal.target); }
    }
    focusOn(x, z, radius) {
      this.camGoal.target.set(x, 0, z);
      if (radius) this.camGoal.radius = radius;
    }
    orbit(dx, dy) { this.camGoal.theta -= dx * 0.005; this.camGoal.phi = ND.clamp(this.camGoal.phi - dy * 0.005, 0.15, Math.PI / 2.05); }
    pan(dx, dy) {
      const forward = new T.Vector3(Math.sin(this.cam.theta), 0, Math.cos(this.cam.theta));
      const right = new T.Vector3(forward.z, 0, -forward.x);
      const k = this.cam.radius * 0.0016;
      this.camGoal.target.add(right.multiplyScalar(-dx * k)).add(forward.multiplyScalar(dy * k));
    }
    zoom(delta) { this.camGoal.radius = ND.clamp(this.camGoal.radius * (1 + delta * 0.001), 8, 120); }
    updateCamera(dt) {
      const c = this.cam, goal = this.camGoal, k = 1 - Math.pow(0.001, dt);
      c.theta += (goal.theta - c.theta) * k; c.phi += (goal.phi - c.phi) * k; c.radius += (goal.radius - c.radius) * k;
      c.target.lerp(goal.target, k);
      const sp = Math.sin(c.phi), cp = Math.cos(c.phi);
      this.camera.position.set(c.target.x + c.radius * sp * Math.sin(c.theta), c.target.y + c.radius * cp, c.target.z + c.radius * sp * Math.cos(c.theta));
      if (this.shakeT > 0) { this.shakeT -= dt; const s = this.shakeT * 0.3; this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.z += (Math.random() - 0.5) * s; }
      this.camera.lookAt(c.target);
    }
    screenToCell(px, py) {
      const ndc = new T.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = new T.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return -1;
      const g = this.game; if (!g) return -1;
      const cx = Math.round(hit.x / CELL + (g.w - 1) / 2), cy = Math.round(hit.z / CELL + (g.h - 1) / 2);
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return -1;
      return cy * g.w + cx;
    }
    pickEntity(px, py) {
      const ndc = new T.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const meshes = [];
      this.towerMeshes.forEach(m => meshes.push(m));
      this.enemyMeshes.forEach(m => meshes.push(m));
      const hits = this.raycaster.intersectObjects(meshes, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o && !o.userData.entityId) o = o.parent;
        if (o) return o.userData.entityId;
      }
      return null;
    }

    // ---- 同步 ----
    sync(game, dt) {
      this.time += dt;
      this.updateCamera(dt);
      this._syncNodes(game);
      this._syncTowers(game, dt);
      this._syncEnemies(game, dt);
      this._syncProjectiles(game);
      this._syncRoutesFlow(game, dt);
      this._syncOverlay(game, dt);
      this._syncEnv(game, dt);
      this._updateFx(dt);
      this.renderer.render(this.scene, this.camera);
    }
    _syncNodes(game) {
      for (const [i, marker] of this.nodeMarkers) {
        const ns = game.nodeState[i];
        if (!ns) continue;
        const a = marker.userData.anim;
        let col = 0x35d6ff, op = 0.2;
        if (ns.isolated) { col = 0xff5d3d; op = 0.4; }
        else if (game.time < ns.cooldownUntil) { col = 0xffd23d; op = 0.3; }
        a.ring.material.color.setHex(col); a.ring.material.emissive.setHex(col);
        a.hex.material.color.setHex(col); a.hex.material.opacity = op + Math.sin(this.time * 3) * 0.05;
        a.glow.material.color.setHex(col);
        a.ring.rotation.z += 0.01;
        const blockedExtra = game.blackholes.some(b => b.cell === i) || game.locks.some(l => l.cells.includes(i));
        if (blockedExtra) { a.ring.material.color.setHex(0xc07dff); a.ring.material.emissive.setHex(0xc07dff); }
      }
    }
    _syncTowers(game, dt) {
      const seen = new Set();
      for (const t of game.towers) {
        seen.add(t.id);
        let m = this.towerMeshes.get(t.id);
        if (!m || m.userData.level !== t.level || m.userData.branch !== t.branch) {
          if (m) { this.entityGroup.remove(m); }
          m = M.makeTower(t.type, t.level, t.branch);
          m.userData.entityId = t.id; m.userData.kind = 'tower'; m.userData.level = t.level; m.userData.branch = t.branch;
          m.position.set(t.x, t.y, t.z);
          this.entityGroup.add(m); this.towerMeshes.set(t.id, m);
          this._addHpBar(m, 1.9);
        }
        const a = m.userData.anim;
        // 朝向 / 动画
        if (t.type === 'interceptor') {
          const targetAim = t.aim != null ? t.aim : t.facing;
          a.head.rotation.y += (targetAim - a.head.rotation.y) * Math.min(1, dt * 8);
          a.barrel.position.z = 0.3 - t.anim.recoil * 0.2;
        } else if (t.type === 'firewall') {
          a.shield.material.opacity = 0.22 + Math.sin(this.time * 4) * 0.06 + t.anim.recoil * 0.2;
          a.body.rotation.y = t.facing;
        } else if (t.type === 'honeypot') {
          a.core.rotation.y += dt * 2; a.core.rotation.x += dt;
          a.rings.forEach((r, i) => { r.rotation.z += dt * (1 + i * 0.5); });
        } else if (t.type === 'sandbox') {
          a.frame.rotation.y += dt * 0.8; a.core.rotation.y -= dt * 1.5;
          a.scan.position.y = 0.75 + Math.sin(this.time * 2) * 0.4;
          const s = 1 + t.anim.pulse * 0.3; a.frame.scale.set(s, s, s);
        } else if (t.type === 'repair') {
          a.body.position.y = 1.0 + Math.sin(this.time * 2) * 0.1;
          a.rings.forEach((r, i) => { r.rotation.z += dt * (1.5 + i); });
        } else if (t.type === 'airgap') {
          const closed = game.nodeState[t.cell] && game.nodeState[t.cell].isolated;
          const gx = closed ? 0.36 : 0.6;
          a.gateL.position.x += (-gx - a.gateL.position.x) * Math.min(1, dt * 5);
          a.gateR.position.x += (gx - a.gateR.position.x) * Math.min(1, dt * 5);
        }
        // 加密 / 护盾 视觉
        this._statusVisual(m, t, game);
        this._updateHpBar(m, t.hp / t.maxHp, t.shield > 0);
        // 治疗光束
        if (t.type === 'repair' && t.anim.healBeam) this._beam(t.x, t.y + 1.2, t.z, t.anim.healBeam.x, t.anim.healBeam.y + 1, t.anim.healBeam.z, 0x5dff9d, 0.06);
      }
      for (const [id, m] of this.towerMeshes) if (!seen.has(id)) { this.entityGroup.remove(m); this.towerMeshes.delete(id); }
    }
    _syncEnemies(game, dt) {
      const seen = new Set();
      for (const e of game.enemies) {
        seen.add(e.id);
        let m = this.enemyMeshes.get(e.id);
        if (!m) {
          m = M.makeEnemy(e.type);
          m.userData.entityId = e.id; m.userData.kind = 'enemy';
          this.entityGroup.add(m); this.enemyMeshes.set(e.id, m);
          this._addHpBar(m, e.boss ? 3.4 : 1.1);
        }
        const a = m.userData.anim;
        m.position.set(e.x, e.y, e.z);
        if (!e.flying) m.rotation.y = e.facing;
        const t = e.animT;
        if (e.dead) {
          const k = Math.max(0, 1 - (game.time - (e.deathT || game.time)) * 2);
          m.scale.setScalar(k); m.position.y += (1 - k) * 0.5;
          continue;
        }
        if (a.wiggle) { a.segs.forEach((s, i) => { s.position.x = Math.sin(t * 6 + i * 0.8) * 0.12; s.position.y = Math.abs(Math.sin(t * 6 + i * 0.8)) * 0.08; }); }
        if (a.swarm) { a.cubes.forEach((c, i) => { const ang = t * 2 + i / 7 * Math.PI * 2; c.position.x = Math.cos(ang) * 0.35; c.position.z = Math.sin(ang) * 0.35; c.rotation.x += dt * 2; c.rotation.y += dt; }); a.core.rotation.y += dt * 2; }
        if (a.trojan) {
          a.packet.visible = !e.revealed; a.revealed.visible = e.revealed;
          if (e.revealed) { a.core.rotation.y += dt * 3; a.revealed.rotation.z += dt; }
          else { a.packet.rotation.y += dt * 1.5; }
        }
        if (a.rotors) { a.rotors.forEach(r => r.rotation.y += dt * 30); m.position.y = e.y + Math.sin(t * 3) * 0.15; }
        if (a.orbit) { a.plates.forEach((p, i) => { const ang = t * 1.5 + i / 6 * Math.PI * 2; p.position.x = Math.cos(ang) * 0.6; p.position.z = Math.sin(ang) * 0.6; p.rotation.y = -ang; }); }
        if (a.boss) {
          if (a.orbs) a.orbs.forEach((o, i) => { const ang = t * 0.8 + i / 8 * Math.PI * 2; o.position.x = Math.cos(ang) * 1.7; o.position.z = Math.sin(ang) * 1.7; o.position.y = 1.4 + Math.sin(t * 2 + i) * 0.3; });
          if (a.rings) a.rings.forEach((r, i) => { r.rotation.z += dt * (0.5 + i * 0.3); });
          if (a.spikes) a.spikes.forEach((s, i) => { s.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.15); });
          if (a.body) { a.body.rotation.y += dt * 0.5; }
          // Boss 阶段视觉
          if (e.type === 'boss3') {
            const col = e.phase === 0 ? 0xff3d6a : e.phase === 1 ? 0xffa63d : 0xff2020;
            a.body.material.emissive.setHex(col); a.glow.material.color.setHex(col);
            a.body.material.opacity = e.phase === 0 ? 0.55 : 0.95;
            a.body.material.transparent = true;
          }
        }
        // 受击闪烁
        if (e.hitFlash > 0) { m.scale.setScalar(1 + e.hitFlash * 0.5); }
        // 护盾
        this._enemyShield(m, e);
        this._statusVisualEnemy(m, e, game);
        this._updateHpBar(m, e.hp / e.maxHp, e.shield > 0, e.boss);
      }
      for (const [id, m] of this.enemyMeshes) if (!seen.has(id)) { this.entityGroup.remove(m); this.enemyMeshes.delete(id); }
    }
    _addHpBar(m, height) {
      const grp = new T.Group(); grp.position.y = height;
      const bg = new T.Sprite(new T.SpriteMaterial({ color: 0x0a1420, transparent: true, opacity: 0.8, depthWrite: false }));
      bg.scale.set(1.2, 0.14, 1); grp.add(bg);
      const fill = new T.Sprite(new T.SpriteMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.95, depthWrite: false }));
      fill.scale.set(1.16, 0.1, 1); fill.position.z = 0.01; grp.add(fill);
      m.add(grp); m.userData.hpBar = { grp, bg, fill };
    }
    _updateHpBar(m, ratio, shielded, boss) {
      const hb = m.userData.hpBar; if (!hb) return;
      ratio = ND.clamp(ratio, 0, 1);
      hb.fill.scale.x = 1.16 * ratio;
      hb.fill.position.x = -(1.16 * (1 - ratio)) / 2;
      const col = ratio > 0.5 ? 0x7dff6a : ratio > 0.25 ? 0xffd23d : 0xff5d3d;
      hb.fill.material.color.setHex(shielded ? 0x6fe3ff : col);
      hb.grp.visible = ratio < 0.999 || boss;
    }
    _statusVisual(m, t, game) {
      // 加密锁 + 护盾
      let icons = m.userData.statusIcons;
      if (!icons) { icons = new T.Group(); icons.position.y = 2.3; m.add(icons); m.userData.statusIcons = icons; }
      icons.clear();
      if (t.encryptedUntil > game.time) {
        const lock = new T.Sprite(new T.SpriteMaterial({ map: ND.glowTex, color: 0xff5d3d, transparent: true, opacity: 0.9, depthWrite: false }));
        lock.scale.set(0.6, 0.6, 1); icons.add(lock);
      }
      if (t.shield > 0) {
        const sh = new T.Mesh(new T.SphereGeometry(1.3, 12, 10), new T.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        sh.position.y = 1; m.add(sh); m.userData.shieldMesh = sh;
      } else if (m.userData.shieldMesh) { m.remove(m.userData.shieldMesh); m.userData.shieldMesh = null; }
    }
    _statusVisualEnemy(m, e, game) {
      if (e.rootedUntil > game.time) {
        if (!m.userData.rootRing) {
          const r = new T.Mesh(new T.TorusGeometry(0.6, 0.05, 6, 16), M.std(0xffd23d, { emissive: 0xffd23d, ei: 1.2 }));
          r.rotation.x = Math.PI / 2; r.position.y = -0.2; m.add(r); m.userData.rootRing = r;
        }
      } else if (m.userData.rootRing) { m.remove(m.userData.rootRing); m.userData.rootRing = null; }
    }
    _enemyShield(m, e) {
      if (e.shield > 0) {
        if (!m.userData.shieldMesh) {
          const sh = new T.Mesh(new T.SphereGeometry(e.boss ? 2.2 : 0.7, 12, 10), new T.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
          m.add(sh); m.userData.shieldMesh = sh;
        }
        m.userData.shieldMesh.material.opacity = 0.15 + Math.sin(this.time * 5) * 0.05;
      } else if (m.userData.shieldMesh) { m.remove(m.userData.shieldMesh); m.userData.shieldMesh = null; }
    }
    _syncProjectiles(game) {
      // 用简单发光sprite表示弹道
      if (!this.projMeshes) this.projMeshes = new Map();
      const seen = new Set();
      game.projectiles.forEach((p, i) => {
        const key = p; seen.add(key);
        let m = this.projMeshes.get(key);
        if (!m) { m = ND.glowSprite(p.color || 0x6fe3ff, 0.6, 0.9); this.fxGroup.add(m); this.projMeshes.set(key, m); }
        m.position.set(p.x, p.y, p.z);
      });
      for (const [k, m] of this.projMeshes) if (!seen.has(k)) { this.fxGroup.remove(m); this.projMeshes.delete(k); }
    }
    _syncRoutesFlow(game, dt) {
      for (const k of Object.keys(this.routeRibbons)) {
        const m = this.routeRibbons[k];
        m.material.map.offset.x -= dt * 0.6;
        const changed = game.changedEntries.includes(k);
        m.material.opacity = changed ? 0.95 : 0.75;
      }
      for (const k of Object.keys(this.previewRibbons)) this.previewRibbons[k].material.map.offset.x -= dt * 0.6;
      // 正常业务流量（装饰性数据包沿当前路线流动）
      if (!this.trafficPackets) { this.trafficPackets = []; this._trafficTimer = 0; }
      this._trafficTimer -= dt;
      if (this._trafficTimer <= 0) {
        this._trafficTimer = 0.45;
        const keys = Object.keys(this.routeRibbons);
        if (keys.length) {
          const m = this.routeRibbons[keys[Math.floor(Math.random() * keys.length)]];
          if (m.userData.pts) { const s = ND.glowSprite(0xbfefff, 0.4, 0.6); this.fxGroup.add(s); this.trafficPackets.push({ s, ribbon: m, d: 0, speed: 3 + Math.random() * 2 }); }
        }
      }
      for (let i = this.trafficPackets.length - 1; i >= 0; i--) {
        const p = this.trafficPackets[i]; p.d += p.speed * dt;
        const ud = p.ribbon.userData;
        if (!ud.pts || p.d >= ud.total || this.routeRibbons[ud.entry] !== p.ribbon) { this.fxGroup.remove(p.s); this.trafficPackets.splice(i, 1); continue; }
        const cum = ud.cum, pts = ud.pts; let j = 1; while (j < cum.length && cum[j] < p.d) j++;
        const segLen = cum[j] - cum[j - 1] || 1; const t = (p.d - cum[j - 1]) / segLen;
        p.s.position.set(pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t, 0.25, pts[j - 1].z + (pts[j].z - pts[j - 1].z) * t);
      }
      // 入口/出口动画
      for (const k of Object.keys(this.entryMeshes)) { const a = this.entryMeshes[k].userData.anim; a.glow.material.opacity = 0.5 + Math.sin(this.time * 3) * 0.15; }
      for (const k of Object.keys(this.exitMeshes)) { const a = this.exitMeshes[k].userData.anim; a.core.rotation.y += dt; a.ring.rotation.z += dt * 0.5; }
    }
    _syncOverlay(game, dt) {
      this.overlayGroup.clear();
      // 选中环
      if (this.selected) {
        const ent = this._findEntity(game, this.selected);
        if (ent) {
          const ring = new T.Mesh(new T.TorusGeometry(ent.boss ? 2.4 : 1.0, 0.06, 8, 24), M.std(0xffffff, { emissive: 0xffffff, ei: 1 }));
          ring.rotation.x = Math.PI / 2; ring.position.set(ent.x, 0.08, ent.z); this.overlayGroup.add(ring);
          if (ent.range || ent.def && ent.def.range) this._rangeCircle(ent.x, ent.z, (ent.range || ent.def.range) * CELL, 0x6fe3ff, 0.15);
          if (ent.type === 'interceptor') this._sector(ent.x, ent.z, ent.range * CELL, ent.facing, ent.def.sector, 0x6fe3ff);
        }
      }
      // 部署预览
      if (this.deploy && this.hoverCell >= 0) this._deployPreview(game);
      // 道具预览
      if (this.itemTarget && this.hoverCell >= 0) this._itemPreview(game);
      // Boss 预警
      for (const w of game.warnings) {
        const p = this.cellWorld(w.cell);
        const pulse = 0.5 + Math.sin(this.time * 8) * 0.3;
        const ring = new T.Mesh(new T.TorusGeometry(1.0, 0.1, 8, 24), M.std(0xff2020, { emissive: 0xff2020, ei: 2 }));
        ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.15, p.z); ring.scale.setScalar(pulse + 0.5); this.overlayGroup.add(ring);
        const gl = ND.glowSprite(0xff2020, 3, 0.5); gl.position.set(p.x, 0.5, p.z); this.overlayGroup.add(gl);
      }
      // 黑洞 / 锁死
      for (const b of game.blackholes) this._blockedCell(b.cell, 0xc07dff);
      for (const l of game.locks) for (const c of l.cells) this._blockedCell(c, 0xff3d6a);
    }
    _blockedCell(i, col) {
      const p = this.cellWorld(i);
      const disc = new T.Mesh(new T.CircleGeometry(0.9, 6), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.12, p.z); this.overlayGroup.add(disc);
      const gl = ND.glowSprite(col, 2.4, 0.5); gl.position.set(p.x, 0.4, p.z); this.overlayGroup.add(gl);
    }
    _findEntity(game, id) { return game.towers.find(t => t.id === id) || game.enemies.find(e => e.id === id); }
    _rangeCircle(x, z, r, col, op) {
      const ring = new T.Mesh(new T.RingGeometry(r - 0.08, r, 40), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op + 0.2, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.09, z); this.overlayGroup.add(ring);
      const disc = new T.Mesh(new T.CircleGeometry(r, 40), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: T.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.08, z); this.overlayGroup.add(disc);
    }
    _sector(x, z, r, facing, deg, col) {
      const half = deg * Math.PI / 180 / 2;
      const shape = new T.Shape();
      shape.moveTo(0, 0);
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const a = facing - half + (i / steps) * half * 2;
        shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
      }
      shape.closePath();
      const geo = new T.ShapeGeometry(shape);
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.09, z);
      // ShapeGeometry 在 XY 平面，旋转到 XZ；注意 y→z 映射
      this.overlayGroup.add(mesh);
    }
    _deployPreview(game) {
      const i = this.hoverCell, cell = game.grid.cells[i];
      const chk = game.canPlace(this.deploy.type, i);
      const p = this.cellWorld(i);
      const col = chk.ok ? 0x7dff6a : 0xff5d3d;
      this._rangeCircle(p.x, p.z, (ND.TOWERS[this.deploy.type].range || ND.TOWERS[this.deploy.type].taunt || 1.5) * CELL, col, 0.12);
      const ghost = M.makeTower(this.deploy.type, 1, null);
      ghost.position.set(p.x, cell.type === ND.CELL.PLATFORM ? 0.7 : 0, p.z);
      ghost.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; } });
      this.overlayGroup.add(ghost);
      if (this.deploy.type === 'interceptor') this._sector(p.x, p.z, ND.TOWERS.interceptor.range * CELL, this.deploy.facing || 0, ND.TOWERS.interceptor.sector, col);
      const isolates = this.deploy.type === 'airgap' || (this.deploy.type === 'firewall' && cell.type === ND.CELL.NODE);
      if (isolates && cell.type === ND.CELL.NODE && chk.ok) this._isolationPreview(game, i, 'dep' + i);
      else if (this._pvKey && this._pvKey.indexOf('dep') === 0) this.clearPreview();
      this.deploy.valid = chk.ok; this.deploy.cell = i;
    }
    _itemPreview(game) {
      const id = this.itemTarget, def = ND.ITEMS[id], i = this.hoverCell;
      const p = this.cellWorld(i);
      if (id === 'downgrade') this._rangeCircle(p.x, p.z, def.radius * CELL, 0xffb13d, 0.15);
      else if (id === 'isolator') {
        this._rangeCircle(p.x, p.z, 1.2 * CELL, 0xff5d3d, 0.15);
        const cell = game.grid.cells[i];
        if (cell.type === ND.CELL.NODE && game.canIsolate(i).ok) this._isolationPreview(game, i, 'item' + i);
        else if (this._pvKey && this._pvKey.indexOf('item') === 0) this.clearPreview();
      }
      else this._rangeCircle(p.x, p.z, 1.2 * CELL, 0x5dff9d, 0.15);
    }
    _syncEnv(game, dt) {
      if (!this.env) return;
      const a = this.env.userData.anim;
      a.stars.rotation.y += dt * 0.005;
      for (const s of a.streams) { s.t += s.speed * dt; if (s.t > 1) s.t = 0; const p = s.curve.getPoint(s.t); s.packet.position.copy(p); }
    }

    // ---- 特效 ----
    burst(x, y, z, color, n, speed, life) {
      for (let i = 0; i < (n || 10); i++) {
        const s = ND.glowSprite(color, 0.4 + Math.random() * 0.4, 0.9);
        s.position.set(x, y, z);
        const a = Math.random() * Math.PI * 2, el = Math.random() * Math.PI;
        const v = (speed || 4) * (0.5 + Math.random() * 0.5);
        this.fxGroup.add(s);
        this.particles.push({ s, vx: Math.sin(el) * Math.cos(a) * v, vy: Math.cos(el) * v, vz: Math.sin(el) * Math.sin(a) * v, life: life || 0.6, t: 0 });
      }
    }
    ring(x, y, z, color, maxR) {
      const r = new T.Mesh(new T.RingGeometry(0.1, 0.3, 32), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(x, y, z); this.fxGroup.add(r);
      this.rings.push({ m: r, t: 0, life: 0.5, maxR: maxR || 3 });
    }
    _beam(x1, y1, z1, x2, y2, z2, color, radius) {
      const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      const m = new T.Mesh(new T.CylinderGeometry(radius || 0.05, radius || 0.05, len, 6), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      m.lookAt(x2, y2, z2); m.rotateX(Math.PI / 2);
      this.fxGroup.add(m); this.beams.push({ m, t: 0, life: 0.12 });
    }
    beam(x1, y1, z1, x2, y2, z2, color, radius) { this._beam(x1, y1, z1, x2, y2, z2, color, radius); }
    shake(amount) { this.shakeT = Math.max(this.shakeT, amount); }
    _updateFx(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.t += dt;
        if (p.t >= p.life) { this.fxGroup.remove(p.s); this.particles.splice(i, 1); continue; }
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        p.vy -= 6 * dt;
        p.s.material.opacity = 0.9 * (1 - p.t / p.life);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.t += dt;
        if (r.t >= r.life) { this.fxGroup.remove(r.m); this.rings.splice(i, 1); continue; }
        const k = r.t / r.life; r.m.scale.setScalar(1 + k * r.maxR * 3); r.m.material.opacity = 0.8 * (1 - k);
      }
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i]; b.t += dt;
        if (b.t >= b.life) { this.fxGroup.remove(b.m); this.beams.splice(i, 1); continue; }
        b.m.material.opacity = 0.7 * (1 - b.t / b.life);
      }
    }

    // ---- 事件 → 特效/音频 ----
    consumeEvents(game) {
      const A = ND.Audio;
      for (const ev of game.events) {
        const d = ev.data;
        switch (ev.type) {
          case 'enemyKilled': this.burst(d.enemy.x, d.enemy.y, d.enemy.z, d.enemy.def.color, 12, 5, 0.5); if (A) A.play('kill'); break;
          case 'bossKilled': this.burst(d.enemy.x, d.enemy.y + 1, d.enemy.z, d.enemy.def.color, 40, 9, 1); this.ring(d.enemy.x, 0.2, d.enemy.z, d.enemy.def.color, 6); this.shake(0.6); if (A) A.play('bossDie'); break;
          case 'towerDestroyed': this.burst(d.tower.x, d.tower.y + 1, d.tower.z, 0xff5d3d, 24, 6, 0.7); this.shake(0.4); if (A) A.play('towerDie'); break;
          case 'towerPlaced': this.ring(d.tower.x, 0.1, d.tower.z, 0x7dff6a, 1.5); if (A) A.play('place'); break;
          case 'towerUpgraded': this.ring(d.tower.x, 0.1, d.tower.z, 0xffd23d, 2); this.burst(d.tower.x, d.tower.y + 1, d.tower.z, 0xffd23d, 16, 4, 0.6); if (A) A.play('upgrade'); break;
          case 'interceptorFire': if (A) A.play('shot'); break;
          case 'tracerHit': this.burst(d.enemy.x, d.enemy.y, d.enemy.z, 0x6fe3ff, 5, 3, 0.3); break;
          case 'pierceShot': this.beam(d.x, 1.2, d.z, d.x + d.nx * d.range * CELL, 1.2, d.z + d.nz * d.range * CELL, 0x6fe3ff, 0.1); if (A) A.play('pierce'); break;
          case 'sandboxPulse': this.ring(d.tower.x, 0.15, d.tower.z, 0x9d5dff, d.radius); if (A) A.play('pulse'); break;
          case 'firewallHit': this.burst(d.enemy.x, d.enemy.y, d.enemy.z, 0x35a6ff, 4, 3, 0.3); break;
          case 'enemyMelee': this.burst(d.tower.x, d.tower.y + 0.8, d.tower.z, 0xff8a3d, 4, 3, 0.3); if (A) A.play('melee'); break;
          case 'ransomFire': if (A) A.play('ransom'); break;
          case 'ransomHit': this.burst(d.tower.x, d.tower.y + 1, d.tower.z, 0xff5d3d, 8, 4, 0.4); if (A) A.play('encrypt'); break;
          case 'nodeIsolated': { const p = this.cellWorld(d.cell); this.ring(p.x, 0.15, p.z, 0xff5d3d, 2); this.burst(p.x, 0.5, p.z, 0xff5d3d, 14, 4, 0.5); if (A) A.play('isolate'); break; }
          case 'nodeOpened': { const p = this.cellWorld(d.cell); this.ring(p.x, 0.15, p.z, 0x7dff6a, 2); if (A) A.play('open'); break; }
          case 'nodeBroken': { const p = this.cellWorld(d.cell); this.burst(p.x, 0.5, p.z, 0xff2020, 24, 7, 0.8); this.shake(0.5); if (A) A.play('break'); break; }
          case 'routesChanged': if (A) A.play('reroute'); break;
          case 'leak': this.shake(0.5); if (A) A.play('leak'); break;
          case 'revealed': this.burst(d.enemy.x, d.enemy.y, d.enemy.z, 0xff4dd8, 8, 3, 0.4); if (A) A.play('reveal'); break;
          case 'payload': this.burst(d.x, 0.5, d.z, 0xff4dd8, 20, 6, 0.7); this.ring(d.x, 0.2, d.z, 0xff4dd8, d.radius); if (A) A.play('payload'); break;
          case 'skillTrap': this.ring(d.tower.x, 0.15, d.tower.z, 0xffd23d, 2.5); if (A) A.play('trap'); break;
          case 'skillFailover': this.ring(d.tower.x, 0.15, d.tower.z, 0x5dff9d, d.tower.range); if (A) A.play('failover'); break;
          case 'repairHeal': this.burst(d.target.x, d.target.y + 1, d.target.z, 0x5dff9d, 2, 1.5, 0.4); break;
          case 'bossSpawn': this.shake(0.8); if (A) A.play('bossRoar'); break;
          case 'bossWarning': if (A) A.play('warning'); break;
          case 'bossPhase': this.shake(0.5); this.burst(d.boss.x, d.boss.y + 1.5, d.boss.z, 0xff3d6a, 30, 7, 0.8); if (A) A.play('phase'); break;
          case 'blackholeStart': { const p = this.cellWorld(d.cell); this.ring(p.x, 0.2, p.z, 0xc07dff, 3); this.burst(p.x, 0.5, p.z, 0xc07dff, 20, 5, 0.7); if (A) A.play('blackhole'); break; }
          case 'lockStart': for (const c of d.cells) { const p = this.cellWorld(c); this.ring(p.x, 0.2, p.z, 0xff3d6a, 2); } this.shake(0.5); if (A) A.play('lock'); break;
          case 'bossFlood': { const p = this.cellWorld(d.cell); this.burst(p.x, 0.5, p.z, 0xb0ff4d, 30, 8, 0.8); this.shake(0.7); if (A) A.play('bossFlood'); break; }
          case 'routeStorm': this.ring(d.boss.x, 0.3, d.boss.z, 0x7de3ff, 5); if (A) A.play('storm'); break;
          case 'itemUsed': if (A) A.play('item'); break;
          case 'waveStart': if (A) A.play(d.isBoss ? 'bossRoar' : 'wave'); break;
          case 'wormSplit': this.burst(d.enemy.x, d.enemy.y, d.enemy.z, 0x8aff4d, 6, 3, 0.4); break;
          case 'packerShield': break;
          case 'gameEnd': if (A) A.play(d.result === 'victory' ? 'win' : 'lose'); break;
        }
      }
      game.events.length = 0;
    }
  }
  ND.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);