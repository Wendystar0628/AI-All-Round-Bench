/* 动态路由塔防 —— 三维场景：环境、地图瓦片、设施、路线、状态表现 */
window.G = window.G || {};
(function () {
  'use strict';
  const T = window.THREE, M = G.Models, S = G.Sim, CELL = S.CELL, LAYER_H = S.LAYER_H;

  const THEMES = {
    corp: { bg: 0x060a14, fog: 0x0a1224, horizon: 0x1d4a7a, accent: 0x38c8ff, accent2: 0x8fe8ff, tile: 0x24395e, tileEdge: 0x3fc4ff, old: 0x5a4426, oldEdge: 0xd8a848, plat: 0x2c4a70, node: 0x36598a, key: 0xfff2dc, hemiSky: 0x5aa8ff, hemiGround: 0x0a1020, building: [0x223248, 0x2c3f5a, 0x1a2838], window: 0x9fe0ff, river: 0x3ad0ff, label: '#bfe9ff' },
    backbone: { bg: 0x05050d, fog: 0x0a0a1c, horizon: 0x3a2a8a, accent: 0xb48cff, accent2: 0xe4d6ff, tile: 0x2a2648, tileEdge: 0xa884ff, old: 0x4e3626, oldEdge: 0xe09a4a, plat: 0x3a3262, node: 0x4a3e80, key: 0xe8e0ff, hemiSky: 0x8a7cff, hemiGround: 0x0a0a18, building: [0x231f3d, 0x2f2852, 0x181430], window: 0xc8b0ff, river: 0x4ff0ff, label: '#d8ccff' },
    ics: { bg: 0x0a0806, fog: 0x1a120a, horizon: 0x7a4a1a, accent: 0xffb040, accent2: 0xffe0a0, tile: 0x3a342e, tileEdge: 0xffb040, old: 0x4e3a24, oldEdge: 0xd8903a, plat: 0x4e4034, node: 0x604c38, key: 0xffe8c8, hemiSky: 0xffa860, hemiGround: 0x120c06, building: [0x3a3028, 0x4a3c2e, 0x2a221a], window: 0xffc070, river: 0xffb040, label: '#ffe4bf' }
  };

  // ---------- 程序化贴图 ----------
  function tex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t;
  }
  function noise(x, w, h, alpha, n) { for (let i = 0; i < n; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (Math.random() * alpha).toFixed(3) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
  function panelTex(th, kind) {
    return tex(256, 256, (x, w, h) => {
      const base = kind === 'old' ? th.old : kind === 'plat' ? th.plat : th.tile;
      x.fillStyle = '#' + base.toString(16).padStart(6, '0'); x.fillRect(0, 0, w, h);
      noise(x, w, h, 0.08, 900);
      if (kind === 'old') {
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(Math.random() * w, 0); x.lineTo(Math.random() * w, h); x.stroke(); }
        x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 14; i++) x.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 3 + Math.random() * 8);
        x.strokeStyle = '#' + th.oldEdge.toString(16).padStart(6, '0'); x.lineWidth = 2; x.setLineDash([10, 8]); x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); x.setLineDash([]);
        x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2; x.strokeRect(3, 3, w - 6, h - 6);
      } else {
        x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
        x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4);
        x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1; x.strokeRect(9, 9, w - 18, h - 18);
        if (kind === 'plat') {
          x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(w / 2, h / 2, 30 + i * 34, 0, Math.PI * 2); x.stroke(); }
          x.fillStyle = 'rgba(255,255,255,0.25)'; x.font = 'bold 18px monospace'; x.textAlign = 'center'; x.fillText('DEPLOY', w / 2, h / 2 + 6);
        } else {
          x.fillStyle = 'rgba(255,255,255,0.10)'; x.font = '12px monospace'; x.fillText('0x' + Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0'), 16, 28);
          x.fillStyle = '#' + th.tileEdge.toString(16).padStart(6, '0') + ''; x.globalAlpha = 0.5; x.fillRect(0, 0, w, 2); x.globalAlpha = 1;
        }
      }
    });
  }
  function buildingTex(th) {
    return tex(128, 256, (x, w, h) => {
      x.fillStyle = '#0d131e'; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 6; i++) { const on = Math.random() < 0.55; x.fillStyle = on ? '#' + th.window.toString(16).padStart(6, '0') : 'rgba(0,0,0,0.6)'; x.globalAlpha = on ? 0.35 + Math.random() * 0.65 : 1; x.fillRect(6 + i * 20, 8 + j * 15, 12, 8); }
      x.globalAlpha = 1;
    });
  }

  // ---------- 场景管理 ----------
  const View = {
    init(container) {
      const th = THEMES.corp;
      this.th = th;
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.92;
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      container.appendChild(this.renderer.domElement);
      this.container = container;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.5, 600);
      this.cam = { target: new T.Vector3(0, 0, 0), yaw: 0, pitch: 0.95, dist: 60, tYaw: 0, tPitch: 0.95, tDist: 60, tTarget: new T.Vector3(0, 0, 0), anim: null };
      this.clock = 0;
      this.root = new T.Group(); this.scene.add(this.root); // 当前地图
      this.fx = new T.Group(); this.scene.add(this.fx);
      this.units = new T.Group(); this.scene.add(this.units);
      this.highlights = new T.Group(); this.scene.add(this.highlights);
      this.env = null; this.mapGroup = null; this.routes = null;
      try {
        // 使用无符号字节 + MSAA 的基础目标：兼容性最好，泛光在该环境下能正常输出
        const rt = new T.WebGLRenderTarget(Math.max(2, container.clientWidth), Math.max(2, container.clientHeight), { type: T.UnsignedByteType, samples: 4 });
        const composer = new T.EffectComposer(this.renderer, rt);
        composer.addPass(new T.RenderPass(this.scene, this.camera));
        this.bloomPass = new T.UnrealBloomPass(new T.Vector2(container.clientWidth, container.clientHeight), 0.45, 0.4, 0.86);
        composer.addPass(this.bloomPass); composer.addPass(new T.OutputPass());
        this.composer = composer;
      } catch (e) { console.warn('bloom unavailable', e); this.composer = null; }
      this.bloomOn = true;
      this.unitMap = new Map(); this.projMap = new Map();
      window.addEventListener('resize', () => this.resize());
      this.resize();
    },
    resize() {
      const c = this.container; if (!c) return; const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (this.composer) this.composer.setSize(w, h);
    },
    setTheme(theme) {
      this.th = THEMES[theme] || THEMES.corp;
      const th = this.th;
      this.scene.background = new T.Color(th.bg);
      this.scene.fog = new T.FogExp2(th.fog, 0.0030);
      if (this.env) { this.scene.remove(this.env); disposeGroup(this.env); }
      this.env = buildEnvironment(th);
      this.scene.add(this.env);
    },
    clearMap() {
      if (this.mapGroup) { this.root.remove(this.mapGroup); disposeGroup(this.mapGroup); }
      if (this.routes) { this.root.remove(this.routes.group); disposeGroup(this.routes.group); this.routes = null; }
      for (const [, u] of this.unitMap) { this.units.remove(u.group); disposeGroup(u.group); } this.unitMap.clear();
      for (const [, p] of this.projMap) { this.units.remove(p); disposeGroup(p); } this.projMap.clear();
      this.highlights.clear();
    },
    // 构建地图
    buildMap(game) {
      this.clearMap(); this.game = game;
      const M_ = game.M, th = this.th;
      this.setTheme(game.def.theme);
      const g = new T.Group(); this.mapGroup = g; this.root.add(g);
      const texPath = panelTex(th, 'path'), texOld = panelTex(th, 'old'), texPlat = panelTex(th, 'plat'), texB = buildingTex(th);
      this.textures = { path: texPath, old: texOld, plat: texPlat, b: texB };
      const edgeMat = new T.LineBasicMaterial({ color: th.tileEdge, transparent: true, opacity: 0.9 });
      const oldEdgeMat = new T.LineBasicMaterial({ color: th.oldEdge, transparent: true, opacity: 0.9 });
      const sideMat = new T.MeshStandardMaterial({ color: 0x0d1420, roughness: 0.8, metalness: 0.3 });
      const sideMatOld = new T.MeshStandardMaterial({ color: 0x1a120a, roughness: 0.9, metalness: 0.2 });
      const sideMatPlat = new T.MeshStandardMaterial({ color: 0x131a28, roughness: 0.7, metalness: 0.4 });
      const topPath = new T.MeshStandardMaterial({ map: texPath, roughness: 0.6, metalness: 0.35, emissive: th.tileEdge, emissiveIntensity: 0.16, emissiveMap: texPath });
      const topOld = new T.MeshStandardMaterial({ map: texOld, roughness: 0.85, metalness: 0.2, emissive: th.oldEdge, emissiveIntensity: 0.2, emissiveMap: texOld });
      const topPlat = new T.MeshStandardMaterial({ map: texPlat, roughness: 0.55, metalness: 0.45, emissive: th.accent, emissiveIntensity: 0.25, emissiveMap: texPlat });
      this.mats = { sideMat, sideMatOld, sideMatPlat, topPath, topOld, topPlat, edgeMat, oldEdgeMat, sideMatPlat };
      const tileGeo = new T.BoxGeometry(3.86, 0.5, 3.86);
      const edges = [], oldEdges = [];
      const walkTypes = { path: 1, old: 1, node: 1, entry: 1, exit: 1 };
      for (const c of M_.cells) {
        if (c.type === 'path' || c.type === 'old') {
          const m = new T.Mesh(tileGeo, [c.type === 'old' ? sideMatOld : sideMat, c.type === 'old' ? sideMatOld : sideMat, c.type === 'old' ? topOld : topPath, sideMat, c.type === 'old' ? sideMatOld : sideMat, c.type === 'old' ? sideMatOld : sideMat]);
          m.position.set(c.wx, c.wy - 0.25, c.wz); m.receiveShadow = true; g.add(m);
          // 边界发光线
          const dx = [[0, -1], [1, 0], [0, 1], [-1, 0]]; const dirs = [[[ -1.9, -1.9], [1.9, -1.9]], [[1.9, -1.9], [1.9, 1.9]], [[1.9, 1.9], [-1.9, 1.9]], [[-1.9, 1.9], [-1.9, -1.9]]];
          for (let k = 0; k < 4; k++) { const nb = M_.byKey.get(c.L + ':' + (c.x + dx[k][0]) + ':' + (c.z + dx[k][1])); if (nb && walkTypes[nb.type] && nb.type !== 'node') continue; const s = dirs[k]; (c.type === 'old' ? oldEdges : edges).push(c.wx + s[0][0], c.wy + 0.02, c.wz + s[0][1], c.wx + s[1][0], c.wy + 0.02, c.wz + s[1][1]); }
        } else if (c.type === 'plat') {
          const pad = new T.Mesh(new T.CylinderGeometry(1.85, 1.6, 0.32, 6), [sideMatPlat, topPlat, sideMatPlat]); pad.position.set(c.wx, c.wy - 0.16, c.wz); pad.receiveShadow = true; pad.castShadow = true; g.add(pad);
          const rim = new T.Mesh(new T.TorusGeometry(1.75, 0.045, 6, 6), M.glow(th.accent)); rim.rotation.x = Math.PI / 2; rim.position.set(c.wx, c.wy - 0.02, c.wz); g.add(rim);
          const strut = new T.Mesh(new T.CylinderGeometry(0.18, 0.3, 2.4, 6), sideMatPlat); strut.position.set(c.wx, c.wy - 1.5, c.wz); g.add(strut);
          const light = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.06, 12), M.glow(th.accent2)); light.position.set(c.wx, c.wy - 1.4, c.wz); g.add(light);
        } else if (c.type === 'node') {
          g.add(buildNode(c, th));
        } else if (c.type === 'obst') {
          g.add(buildBuilding(c, th, texB));
        } else if (c.type === 'entry') {
          g.add(buildGate(c, th, true));
        } else if (c.type === 'exit') {
          g.add(buildCore(c, th));
        }
      }
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.Float32BufferAttribute(edges, 3)); const el = new T.LineSegments(eg, edgeMat); el.renderOrder = 2; g.add(el);
      const og = new T.BufferGeometry(); og.setAttribute('position', new T.Float32BufferAttribute(oldEdges, 3)); g.add(new T.LineSegments(og, oldEdgeMat));
      if (M_.rivers.length) g.add(buildRiver(M_, th));
      if (M_.gaps.length) g.add(buildGap(M_, th));
      // 桥面与坡道
      for (const c of M_.cells) if (c.L === 1) g.add(buildBridge(c, th));
      for (const r of (game.def.ramps || [])) g.add(buildRamp(r, M_, th));
      // 底层网格延伸（地图外圈淡淡的网格）
      g.add(buildUnderGrid(M_, th));
      // 路线条带
      this.routes = new Routes(this, game);
      // 节点状态组
      this.nodeFx = new Map();
      for (const n of M_.nodes) { const fx = buildNodeFx(n, th); g.add(fx.group); this.nodeFx.set(n.id, fx); }
      this.cellHover = new T.Mesh(new T.PlaneGeometry(3.9, 3.9), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); this.cellHover.rotation.x = -Math.PI / 2; this.cellHover.visible = false; this.highlights.add(this.cellHover);
      this.rangeRing = makeRing(1, 0xff8a3d, 0.55); this.highlights.add(this.rangeRing);
      this.rangeDisc = makeDisc(1, 0xff8a3d, 0.08); this.highlights.add(this.rangeDisc);
      this.arc = makeArc(1, Math.PI / 2, 0x59c8ff); this.highlights.add(this.arc);
      this.aoeCells = new T.InstancedMesh(new T.PlaneGeometry(3.9, 3.9), new T.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.35, depthWrite: false }), 64); this.aoeCells.count = 0; this.highlights.add(this.aoeCells);
      this.selRing = makeRing(2.1, 0xffffff, 0.9); this.highlights.add(this.selRing);
      this.cellBad = new T.Mesh(new T.PlaneGeometry(3.9, 3.9), new T.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.5, depthWrite: false })); this.cellBad.rotation.x = -Math.PI / 2; this.cellBad.visible = false; this.highlights.add(this.cellBad);
      this.defaultCam();
    },
    defaultCam() {
      const M_ = this.game.M; const th = this.th;
      const w = M_.w * CELL, d = M_.d * CELL; const dist = Math.max(w, d * 1.25) * 1.25;
      this.cam.tTarget.set(0, 0, 0); this.cam.tYaw = 0; this.cam.tPitch = 0.88; this.cam.tDist = dist;
      if (!this.cam.userMoved) { this.cam.target.copy(this.cam.tTarget); this.cam.yaw = 0; this.cam.pitch = 0.88; this.cam.dist = dist; }
    },
    focus(point, dist, yaw, pitch, instant) {
      const c = this.cam; c.tTarget.set(point.x, point.y || 0, point.z); c.tDist = dist; if (yaw != null) c.tYaw = yaw; if (pitch != null) c.tPitch = pitch; if (instant) { c.target.copy(c.tTarget); c.dist = dist; c.yaw = c.tYaw; c.pitch = c.tPitch; }
    },
    updateCamera(dt) {
      const c = this.cam; const k = 1 - Math.pow(0.001, dt);
      c.target.lerp(c.tTarget, k); c.yaw += (c.tYaw - c.yaw) * k; c.pitch += (c.tPitch - c.pitch) * k; c.dist += (c.tDist - c.dist) * k;
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      this.camera.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist, c.target.y + sp * c.dist, c.target.z + Math.cos(c.yaw) * cp * c.dist);
      this.camera.lookAt(c.target.x, c.target.y, c.target.z);
    },
    screenRay(x, y) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const nx = ((x - r.left) / r.width) * 2 - 1, ny = -((y - r.top) / r.height) * 2 + 1;
      const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(nx, ny), this.camera); return rc;
    },
    groundPoint(x, y) {
      const rc = this.screenRay(x, y); const pl = new T.Plane(new T.Vector3(0, 1, 0), 0); const p = new T.Vector3(); if (rc.ray.intersectPlane(pl, p)) return p; return null;
    },
    cellAtScreen(x, y) {
      const p = this.groundPoint(x, y); if (!p || !this.game) return null; const M_ = this.game.M;
      const cx = Math.round(p.x / CELL + (M_.w - 1) / 2), cz = Math.round(p.z / CELL + (M_.d - 1) / 2);
      return M_.byKey.get('0:' + cx + ':' + cz) || null;
    },
    pick(x, y) {
      const rc = this.screenRay(x, y); const objs = []; for (const [, u] of this.unitMap) objs.push(u.group); const hits = rc.intersectObjects(objs, true);
      if (hits.length) { let o = hits[0].object; while (o && !o.userData.unit) o = o.parent; if (o) return o.userData.unit; }
      return null;
    },
    worldToScreen(p) { const v = new T.Vector3(p.x, p.y, p.z).project(this.camera); const r = this.renderer.domElement.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top, visible: v.z < 1 }; }
  };

  function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const arr = Array.isArray(o.material) ? o.material : [o.material]; for (const m of arr) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); } } }); }

  // ---------- 环境 ----------
  function buildEnvironment(th) {
    const g = new T.Group();
    // 天空
    const sky = new T.Mesh(new T.SphereGeometry(420, 32, 16), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, uniforms: { top: { value: new T.Color(th.bg) }, hor: { value: new T.Color(th.horizon) }, accent: { value: new T.Color(th.accent) } }, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 accent; varying vec3 vP; float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); } void main(){ float h = normalize(vP).y; vec3 c = mix(hor, top, smoothstep(-0.1, 0.6, h)); float glow = exp(-abs(h)*6.0)*0.5; c += accent*glow*0.18; vec2 sp = vP.xz*0.08; float s = step(0.985, hash(floor(sp)))*smoothstep(0.0,0.3,h)*0.8; c += vec3(s); gl_FragColor = vec4(c,1.0); }' })); g.add(sky);
    // 灯光
    const hemi = new T.HemisphereLight(th.hemiSky, th.hemiGround, 1.15); g.add(hemi);
    const key = new T.DirectionalLight(th.key, 3.2); key.position.set(-30, 55, 35); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 5; key.shadow.camera.far = 200; key.shadow.camera.left = -48; key.shadow.camera.right = 48; key.shadow.camera.top = 48; key.shadow.camera.bottom = -48; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; g.add(key);
    const rim = new T.DirectionalLight(th.accent, 1.3); rim.position.set(40, 25, -45); g.add(rim);
    const fill = new T.PointLight(th.accent2, 120, 110, 1.5); fill.position.set(0, 12, 0); g.add(fill);
    // 协议层
    const layers = new T.Group();
    for (let i = 0; i < 4; i++) {
      const y = -7 - i * 7; const size = 160 + i * 60;
      const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { color: { value: new T.Color(th.accent) }, time: { value: 0 }, opacity: { value: 0.22 - i * 0.04 }, scale: { value: 1 / (8 + i * 3) }, speed: { value: 0.03 + i * 0.02 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 color; uniform float time; uniform float opacity; uniform float scale; uniform float speed; varying vec2 vUv; void main(){ vec2 p = vUv*scale + vec2(time*speed, time*speed*0.3); vec2 f = abs(fract(p)-0.5); float line = smoothstep(0.48,0.5,max(f.x,f.y)); float cell = step(0.96, fract(p.x*7.0+p.y*3.0+time*0.1)); float a = (line*0.8 + cell*0.5)*opacity; gl_FragColor = vec4(color, a*(1.0-smoothstep(0.3,0.5,distance(vUv,vec2(0.5))))); }' });
      const plane = new T.Mesh(new T.PlaneGeometry(size, size), m); plane.rotation.x = -Math.PI / 2; plane.position.y = y; plane.userData.layerMat = m; layers.add(plane);
    }
    g.add(layers); g.userData.layers = layers;
    // 远景网络：成群的塔楼与连线
    const far = new T.Group();
    const bmat = new T.MeshStandardMaterial({ color: th.building[0], roughness: 0.7, metalness: 0.4, emissive: th.window, emissiveIntensity: 0.12 });
    const wmat = new T.MeshBasicMaterial({ color: th.window });
    const rng = mulberry(7);
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2, r = 75 + rng() * 110; const x = Math.cos(a) * r, z = Math.sin(a) * r; const h = 4 + rng() * 26;
      const b = new T.Mesh(new T.BoxGeometry(3 + rng() * 6, h, 3 + rng() * 6), bmat); b.position.set(x, h / 2 - 12 - rng() * 10, z); far.add(b);
      const w = new T.Mesh(new T.BoxGeometry(3.2 + rng() * 6, 0.3, 3.2 + rng() * 6), wmat); w.position.set(x, h - 12 - rng() * 10, z); far.add(w);
    }
    // 远景连线
    const pts = []; for (let i = 0; i < 90; i++) { const a = rng() * Math.PI * 2, b = rng() * Math.PI * 2; const r1 = 80 + rng() * 100, r2 = 80 + rng() * 100; pts.push(Math.cos(a) * r1, -6 - rng() * 30, Math.sin(a) * r1, Math.cos(b) * r2, -6 - rng() * 30, Math.sin(b) * r2); }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); far.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: th.accent, transparent: true, opacity: 0.18 })));
    g.add(far); g.userData.far = far;
    // 漂浮粒子
    const n = 600; const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (rng() - 0.5) * 160; pos[i * 3 + 1] = -20 + rng() * 40; pos[i * 3 + 2] = (rng() - 0.5) * 160; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pm = new T.PointsMaterial({ color: th.accent2, size: 0.35, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }); const pts3 = new T.Points(pg, pm); g.add(pts3); g.userData.dust = pts3;
    return g;
  }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- 地图元素 ----------
  function buildNode(c, th) {
    const g = M.grp(c.wx, c.wy, c.wz);
    const pad = new T.Mesh(new T.CylinderGeometry(1.95, 2.1, 0.42, 8), [M.std(0x101828, { metal: 0.6, rough: 0.4 }), M.std(th.node, { metal: 0.5, rough: 0.4, emissive: th.accent, ei: 0.15 }), M.std(0x101828)]); pad.position.y = 0.21; pad.receiveShadow = true; pad.castShadow = true; g.add(pad);
    const ring = new T.Mesh(new T.TorusGeometry(1.75, 0.07, 8, 8), M.glow(th.accent)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; g.add(ring);
    const dev = M.grp(0, 0.45, 0);
    dev.add(M.mesh(M.box(1.3, 0.6, 1.3), M.std(0x2a3a52, { metal: 0.7, rough: 0.3, emissive: th.accent, ei: 0.2 }), 0, 0.3, 0));
    dev.add(M.mesh(M.box(0.9, 0.35, 0.9), M.std(0x1a2434, { metal: 0.8, rough: 0.25 }), 0, 0.75, 0));
    const ant = M.mesh(M.cyl(0.04, 0.04, 0.9, 5), M.std(0x8aa6c4, { metal: 0.8 }), 0, 1.3, 0); dev.add(ant);
    const lamp = M.glowMesh(M.sph(0.1, 8), th.accent2, 0, 1.75, 0); dev.add(lamp); dev.userData.lamp = lamp;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; dev.add(M.glowMesh(M.box(0.12, 0.05, 0.12), th.accent, Math.cos(a) * 0.5, 0.62, Math.sin(a) * 0.5)); }
    g.add(dev); g.userData.dev = dev;
    return g;
  }
  function buildNodeFx(n, th) {
    const g = M.grp(n.wx, n.wy, n.wz);
    const barrier = new T.Group();
    const wallMat = new T.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false });
    for (let i = 0; i < 4; i++) { const w = new T.Mesh(new T.PlaneGeometry(3.4, 2.6), wallMat.clone()); const a = i * Math.PI / 2; w.position.set(Math.sin(a) * 1.75, 1.5, Math.cos(a) * 1.75); w.rotation.y = a; barrier.add(w); }
    const top = new T.Mesh(new T.PlaneGeometry(3.5, 3.5), new T.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false })); top.rotation.x = -Math.PI / 2; top.position.y = 2.8; barrier.add(top);
    const isoRing = makeRing(2.3, 0xff4a3a, 0.9); isoRing.position.y = 0.5; barrier.add(isoRing);
    const edges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(3.5, 2.6, 3.5)), new T.LineBasicMaterial({ color: 0xff7a5a })); edges.position.y = 1.5; barrier.add(edges);
    barrier.visible = false; g.add(barrier);
    const cd = makeRing(2.2, 0xffc040, 0.9); cd.position.y = 0.5; cd.visible = false; g.add(cd);
    const open = makeRing(2.0, th.accent, 0.35); open.position.y = 0.5; g.add(open);
    const label = makeLabel(n.name, th, 1.6, 'bold'); label.position.set(0, 3.6, 0); g.add(label);
    return { group: g, barrier, cd, open, label };
  }
  function buildBuilding(c, th, texB) {
    const g = M.grp(c.wx, c.wy, c.wz); const rng = mulberry(c.x * 131 + c.z * 7 + 3);
    const h = 2.5 + rng() * 4.5; const w = 2.6 + rng() * 1.2;
    const mat = new T.MeshStandardMaterial({ map: texB, color: th.building[Math.floor(rng() * th.building.length)], roughness: 0.65, metalness: 0.35, emissive: th.window, emissiveIntensity: 0.9, emissiveMap: texB });
    const sideDark = M.std(0x0d1420, { metal: 0.6, rough: 0.4 });
    const topMat = M.std(0x2a3a52, { metal: 0.7, rough: 0.35, emissive: th.accent, ei: 0.15 });
    const b = new T.Mesh(new T.BoxGeometry(w, h, w), [mat, mat, topMat, sideDark, mat, mat]); b.position.y = h / 2 - 0.1; b.castShadow = true; b.receiveShadow = true; g.add(b);
    const base = new T.Mesh(new T.BoxGeometry(w + 0.5, 0.4, w + 0.5), M.std(0x1a2434, { metal: 0.6, rough: 0.4 })); base.position.y = 0.1; g.add(base);
    const top = new T.Mesh(new T.BoxGeometry(w * 0.6, 0.5, w * 0.6), M.std(0x3a4e6a, { metal: 0.7, rough: 0.3 })); top.position.y = h + 0.2; g.add(top);
    const vent = new T.Mesh(new T.BoxGeometry(w * 0.3, 0.3, w * 0.3), M.std(0x1a2434, { metal: 0.6, rough: 0.5 })); vent.position.set(w * 0.25, h + 0.15, -w * 0.25); g.add(vent);
    const ant = new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 1.6, 5), M.std(0x8aa6c4, { metal: 0.8 })); ant.position.y = h + 1.1; g.add(ant);
    const lamp = M.glowMesh(M.sph(0.14, 8), 0xff5050, 0, h + 1.9, 0); g.add(lamp); g.userData.lamp = lamp;
    const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, w)), new T.LineBasicMaterial({ color: th.accent, transparent: true, opacity: 0.55 })); edge.position.y = h / 2 - 0.1; g.add(edge);
    return g;
  }
  function buildGate(c, th, isEntry) {
    const g = M.grp(c.wx, c.wy, c.wz);
    const col = isEntry ? 0xff6a8a : th.accent2;
    const pad = new T.Mesh(new T.CylinderGeometry(2.1, 2.2, 0.3, 8), M.std(0x101828, { metal: 0.6, rough: 0.4 })); pad.position.y = 0.15; pad.receiveShadow = true; g.add(pad);
    for (const sgn of [-1, 1]) { const p = M.mesh(M.box(0.5, 3.2, 0.5), M.std(0x3a4a63, { metal: 0.7, rough: 0.3, emissive: col, ei: 0.3 }), sgn * 1.6, 1.75, -1.6); g.add(p); const l = M.glowMesh(M.box(0.1, 2.6, 0.1), col, sgn * 1.6, 1.8, -1.32); g.add(l); }
    const arch = new T.Mesh(new T.TorusGeometry(1.6, 0.12, 8, 24, Math.PI), M.glow(col)); arch.position.set(0, 3.3, -1.6); g.add(arch);
    const ring = makeRing(1.8, col, 0.6); ring.position.y = 0.32; g.add(ring); g.userData.ring = ring;
    const label = makeLabel((isEntry ? '入口 ' : '出口 ') + c.name, th, 2.0, 'bold', isEntry ? '#ffd0dc' : '#d0fff0'); label.position.set(0, 4.6, -1.6); g.add(label);
    return g;
  }
  function buildCore(c, th) {
    const g = M.grp(c.wx, c.wy, c.wz);
    const base = new T.Mesh(new T.CylinderGeometry(2.2, 2.4, 0.4, 8), M.std(0x0f1826, { metal: 0.7, rough: 0.35 })); base.position.y = 0.2; base.receiveShadow = true; g.add(base);
    const coreMat = new T.MeshStandardMaterial({ color: 0x1a3a4a, metalness: 0.6, roughness: 0.25, emissive: th.accent2, emissiveIntensity: 1.2 });
    const core = new T.Mesh(new T.OctahedronGeometry(1.3, 0), coreMat); core.position.y = 2.2; core.castShadow = true; g.add(core); g.userData.core = core;
    for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(1.7 + i * 0.25, 0.06, 8, 40), M.glow(th.accent)); r.position.y = 2.2; r.rotation.x = Math.PI / 2 + i * 0.4; g.add(r); g.userData['r' + i] = r; }
    const light = new T.PointLight(th.accent2, 40, 24, 1.8); light.position.set(0, 3, 0); g.add(light);
    const label = makeLabel('出口 ' + c.name, th, 2.0, 'bold', '#d0fff0'); label.position.set(0, 5.2, 0); g.add(label);
    return g;
  }
  function buildRiver(M_, th) {
    const g = new T.Group();
    const xs = M_.rivers.map(c => c.x); const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 2; const z = M_.rivers[0].z;
    const w = (maxX - minX) * CELL; const cx = ((minX + maxX) / 2 - 0.5 - (M_.w - 1) / 2) * CELL; const cz = (z - (M_.d - 1) / 2) * CELL;
    const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, color: { value: new T.Color(th.river) }, color2: { value: new T.Color(0xffffff) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform float time; uniform vec3 color; uniform vec3 color2; varying vec2 vUv; float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); } void main(){ float x = vUv.x*40.0; float wave = sin(x*1.5 + time*2.0 + sin(vUv.y*20.0+time)*2.0)*0.5+0.5; float streak = smoothstep(0.75,1.0, sin(x*0.7 - time*3.0 + vUv.y*30.0)*0.5+0.5); float edge = smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.85,vUv.y); float a = (0.35 + wave*0.3 + streak*0.5)*edge; vec3 c = mix(color, color2, streak*0.5); gl_FragColor = vec4(c, a*0.85); }' });
    const plane = new T.Mesh(new T.PlaneGeometry(w, CELL * 1.6), mat); plane.rotation.x = -Math.PI / 2; plane.position.set(cx, -0.55, cz); g.add(plane); g.userData.river = plane;
    // 两岸护栏
    for (const sgn of [-1, 1]) { const rail = new T.Mesh(new T.BoxGeometry(w, 0.3, 0.25), M.std(0x2a3a52, { metal: 0.6, rough: 0.4, emissive: th.river, ei: 0.3 })); rail.position.set(cx, 0.05, cz + sgn * CELL * 0.78); g.add(rail); }
    return g;
  }
  function buildGap(M_, th) {
    const g = new T.Group(); const gap = M_.gaps[0]; const xs = M_.gaps.map(c => c.x), zs = M_.gaps.map(c => c.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const w = (maxX - minX + 1) * CELL, d = (maxZ - minZ + 1) * CELL; const cx = ((minX + maxX) / 2 - (M_.w - 1) / 2) * CELL, cz = ((minZ + maxZ) / 2 - (M_.d - 1) / 2) * CELL;
    const block = new T.Mesh(new T.BoxGeometry(w, 1.2, d), M.std(0x120e0a, { metal: 0.5, rough: 0.7, emissive: 0xff3010, ei: 0.25 })); block.position.set(cx, -0.5, cz); block.receiveShadow = true; g.add(block);
    // 警示条
    const stripeTex = tex(128, 16, (x) => { x.fillStyle = '#1a1208'; x.fillRect(0, 0, 128, 16); x.fillStyle = '#ffb020'; for (let i = -1; i < 9; i++) { x.beginPath(); x.moveTo(i * 16, 16); x.lineTo(i * 16 + 8, 0); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, 16); x.fill(); } }, true); stripeTex.repeat.set(6, 1);
    const stripe = new T.Mesh(new T.BoxGeometry(w + 0.1, 0.3, d + 0.1), new T.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.3, emissive: 0xffb020, emissiveIntensity: 0.4 })); stripe.position.set(cx, 0.1, cz); g.add(stripe);
    const inner = new T.Mesh(new T.BoxGeometry(w * 0.8, 0.4, d * 0.8), new T.MeshStandardMaterial({ color: 0x000000, metalness: 0.9, roughness: 0.1 })); inner.position.set(cx, 0.35, cz); g.add(inner);
    const shimmer = new T.Mesh(new T.PlaneGeometry(w, d), new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform float time; varying vec2 vUv; void main(){ float a = (sin(vUv.x*30.0+time*2.0)*0.5+0.5)*(sin(vUv.y*24.0-time*1.5)*0.5+0.5)*0.25; gl_FragColor=vec4(0.2,0.05,0.0,a);}' })); shimmer.rotation.x = -Math.PI / 2; shimmer.position.set(cx, 0.6, cz); g.add(shimmer); g.userData.shimmer = shimmer;
    // 四角警示灯
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = M.glowMesh(M.sph(0.14, 8), 0xff4020, cx + sx * (w / 2 - 0.3), 0.5, cz + sz * (d / 2 - 0.3)); g.add(l); g.userData['lamp' + sx + '' + sz] = l; }
    return g;
  }
  function buildBridge(c, th) {
    const g = M.grp(c.wx, c.wy, c.wz);
    const deck = new T.Mesh(new T.BoxGeometry(3.86, 0.4, 3.86), [M.std(0x131a28, { metal: 0.5 }), M.std(0x131a28, { metal: 0.5 }), new T.MeshStandardMaterial({ map: View.textures.path, roughness: 0.6, metalness: 0.35, emissive: th.tileEdge, emissiveIntensity: 0.08 }), M.std(0x131a28, { metal: 0.5 }), M.std(0x131a28, { metal: 0.5 })]); deck.position.y = -0.2; deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
    for (const sgn of [-1, 1]) { const rail = new T.Mesh(new T.BoxGeometry(0.12, 0.8, 3.9), M.std(0x3a4a63, { metal: 0.7, rough: 0.3, emissive: th.accent, ei: 0.4 })); rail.position.set(sgn * 1.9, 0.4, 0); g.add(rail); const glowL = M.glowMesh(M.box(0.06, 0.06, 3.9), th.accent, sgn * 1.9, 0.82, 0); g.add(glowL); }
    // 支撑柱
    const pillar = new T.Mesh(new T.CylinderGeometry(0.25, 0.4, LAYER_H + 1, 6), M.std(0x0d1420, { metal: 0.6, rough: 0.4 })); pillar.position.set(0, -LAYER_H / 2 - 0.3, 0); g.add(pillar);
    return g;
  }
  function buildRamp(r, M_, th) {
    const c = M_.byKey.get(r[2] + ':' + r[0] + ':' + r[1]); const d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[r[3]]; const low = M_.byKey.get((r[2] - 1) + ':' + (r[0] + d[0]) + ':' + (r[1] + d[1]));
    if (!c || !low) return new T.Group();
    const g = new T.Group(); const len = Math.hypot(CELL, LAYER_H); const ang = Math.atan2(LAYER_H, CELL);
    const slope = new T.Mesh(new T.BoxGeometry(3.86, 0.3, len), [M.std(0x131a28, { metal: 0.5 }), M.std(0x131a28, { metal: 0.5 }), new T.MeshStandardMaterial({ map: View.textures.path, roughness: 0.6, metalness: 0.35, emissive: th.tileEdge, emissiveIntensity: 0.08 }), M.std(0x131a28, { metal: 0.5 }), M.std(0x131a28, { metal: 0.5 })]);
    const mx = (c.wx + low.wx) / 2, mz = (c.wz + low.wz) / 2, my = (c.wy + low.wy) / 2;
    slope.position.set(mx, my - 0.15, mz); slope.rotation.x = d[1] !== 0 ? (d[1] > 0 ? ang : -ang) : 0; slope.rotation.z = d[0] !== 0 ? (d[0] > 0 ? ang : -ang) : 0; if (d[0] !== 0) slope.rotation.y = Math.PI / 2;
    slope.castShadow = true; slope.receiveShadow = true; g.add(slope);
    for (const sgn of [-1, 1]) { const rail = new T.Mesh(new T.BoxGeometry(0.1, 0.6, len), M.std(0x3a4a63, { metal: 0.7, emissive: th.accent, ei: 0.3 })); rail.position.set(mx + (d[0] !== 0 ? 0 : sgn * 1.9), my + 0.3, mz + (d[0] !== 0 ? sgn * 1.9 : 0)); rail.rotation.copy(slope.rotation); g.add(rail); }
    return g;
  }
  function buildUnderGrid(M_, th) {
    const g = new T.Group(); const w = (M_.w + 14) * CELL, d = (M_.d + 14) * CELL;
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { color: { value: new T.Color(th.accent) }, time: { value: 0 }, opacity: { value: 0.12 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 color; uniform float time; uniform float opacity; varying vec2 vUv; void main(){ vec2 p = vUv*' + ((M_.w + 14) * 0.5).toFixed(1) + '; vec2 f = abs(fract(p)-0.5); float line = smoothstep(0.47,0.5,max(f.x,f.y)); float a = line*opacity*(1.0-smoothstep(0.2,0.5,distance(vUv,vec2(0.5)))); gl_FragColor=vec4(color,a);}' });
    const plane = new T.Mesh(new T.PlaneGeometry(w, d), m); plane.rotation.x = -Math.PI / 2; plane.position.y = -3.2; g.add(plane); g.userData.mat = m; return g;
  }

  // ---------- 标签 ----------
  const labelCache = new Map();
  function makeLabel(text, th, size, weight, color) {
    const key = text + '|' + color; let t = labelCache.get(key);
    if (!t) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.font = (weight === 'bold' ? 'bold ' : '') + '44px "Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 10; x.fillStyle = color || th.label; x.fillText(text, 256, 48); t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; labelCache.set(key, t); }
    const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set((size || 1.6) * 512 / 96, size || 1.6, 1); sp.renderOrder = 30; return sp;
  }
  function makeRing(r, color, opacity) { const m = new T.Mesh(new T.RingGeometry(r - 0.08, r, 56), new T.MeshBasicMaterial({ color, transparent: true, opacity: opacity != null ? opacity : 0.8, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; return m; }
  function makeDisc(r, color, opacity) { const m = new T.Mesh(new T.CircleGeometry(r, 56), new T.MeshBasicMaterial({ color, transparent: true, opacity: opacity != null ? opacity : 0.1, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; return m; }
  function makeArc(r, arc, color) {
    const g = new T.RingGeometry(0.5, r, 32, 1, -arc / 2, arc); const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: T.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.07; m.renderOrder = 5; return m;
  }

  // ---------- 路线条带 ----------
  const routeVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const routeFrag = 'uniform vec3 color; uniform float time; uniform float opacity; uniform float dash; uniform float flow; uniform float pulse; varying vec2 vUv; void main(){ float d = smoothstep(0.42,0.5,abs(fract(vUv.x*0.35 - time*flow)-0.5)); float a = mix(1.0, 0.25 + d*0.75, dash); float edge = smoothstep(0.0,0.2,vUv.y)*smoothstep(1.0,0.8,vUv.y); vec3 c = color*(1.0 + pulse*1.2); gl_FragColor = vec4(c, a*edge*opacity*(0.75+pulse*0.5)); }';
  function Routes(view, game) {
    this.view = view; this.game = game; this.group = new T.Group(); this.lanes = []; this.preview = []; this.M_ = game.M;
    this.colors = { A: new T.Color(0x3ad0ff), B: new T.Color(0xffb03a), C: new T.Color(0xff5fd0) };
    const entries = game.M.entryIds;
    entries.forEach((id, i) => {
      const off = (i - (entries.length - 1) / 2) * 0.75;
      const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { color: { value: this.colors[id].clone() }, time: { value: 0 }, opacity: { value: 0.8 }, dash: { value: 1 }, flow: { value: 0.35 }, pulse: { value: 0 } }, vertexShader: routeVert, fragmentShader: routeFrag });
      const mesh = new T.Mesh(new T.BufferGeometry(), mat); mesh.renderOrder = 6; mesh.frustumCulled = false; this.group.add(mesh);
      const pm = mat.clone(); pm.uniforms.color.value = new T.Color(0xffffff); pm.uniforms.opacity.value = 0.0; pm.uniforms.flow.value = 1.2;
      const pmesh = new T.Mesh(new T.BufferGeometry(), pm); pmesh.renderOrder = 7; pmesh.frustumCulled = false; this.group.add(pmesh);
      this.lanes.push({ id, off, mesh, mat, pmesh, pm, pulse: 0, last: null });
    });
    view.root.add(this.group);
    this.rebuildAll();
  }
  Routes.prototype.geometry = function (cells, off, y) {
    const M_ = this.M_; if (!cells || cells.length < 1) return null;
    const pts = cells.map(id => { const c = M_.byId.get(id); return new T.Vector3(c.wx, c.wy + (y || 0.34), c.wz); });
    // 平滑 + 横向偏移
    const P = []; for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (i > 0 && i < pts.length - 1) { const a = pts[i - 1], b = pts[i + 1]; const d = new T.Vector3().subVectors(b, a); d.y = 0; if (d.lengthSq() > 1e-6) { d.normalize(); p.x += -d.z * off; p.z += d.x * off; } } else if (i === 0 || i === pts.length - 1) { const o = i === 0 ? pts[1] : pts[i - 1]; const d = new T.Vector3().subVectors(p, o); d.y = 0; if (d.lengthSq() > 1e-6) { d.normalize(); p.x += -d.z * off; p.z += d.x * off; } } P.push(p); }
    // 细分，让折线处圆滑
    const S = []; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; const n = 3; for (let k = 0; k < n; k++) S.push(new T.Vector3().lerpVectors(a, b, k / n)); } S.push(P[P.length - 1]);
    const w = 0.42; const pos = [], uv = []; let u = 0;
    for (let i = 0; i < S.length; i++) {
      const p = S[i]; const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)]; const d = new T.Vector3().subVectors(b, a); d.y = 0; if (d.lengthSq() < 1e-8) d.set(0, 0, 1); d.normalize();
      if (i > 0) u += p.distanceTo(S[i - 1]) / 2.2;
      const nx = -d.z, nz = d.x;
      pos.push(p.x + nx * w, p.y, p.z + nz * w, p.x - nx * w, p.y, p.z - nz * w); uv.push(u, 0, u, 1);
    }
    const idx = []; for (let i = 0; i < S.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  };
  Routes.prototype.rebuildAll = function () {
    const g = this.game; for (const L of this.lanes) { const cells = g.routes.byEntry[L.id]; const geo = this.geometry(cells, L.off); L.mesh.geometry.dispose(); L.mesh.geometry = geo || new T.BufferGeometry(); L.last = cells ? cells.join(',') : ''; }
  };
  Routes.prototype.setPreview = function (routes) {
    for (const L of this.lanes) { if (routes && routes[L.id]) { const geo = this.geometry(routes[L.id], L.off); L.pmesh.geometry.dispose(); L.pmesh.geometry = geo || new T.BufferGeometry(); L.pm.uniforms.opacity.value = 0.75; } else L.pm.uniforms.opacity.value = 0; }
  };
  Routes.prototype.flash = function (entries) { for (const L of this.lanes) if (!entries || entries.has(L.id)) L.pulse = 1; };
  Routes.prototype.update = function (dt, time) {
    const g = this.game;
    for (const L of this.lanes) {
      const cells = g.routes.byEntry[L.id]; const key = cells ? cells.join(',') : '';
      if (key !== L.last) { const geo = this.geometry(cells, L.off); L.mesh.geometry.dispose(); L.mesh.geometry = geo || new T.BufferGeometry(); L.last = key; }
      L.mat.uniforms.time.value = time; L.pm.uniforms.time.value = time; L.pulse = Math.max(0, L.pulse - dt * 0.7); L.mat.uniforms.pulse.value = L.pulse;
    }
  };

  // ---------- 单位同步 ----------
  View.syncUnits = function (game, dt, time) {
    const seen = new Set();
    for (const e of game.enemies) {
      if (e.dead) continue; seen.add('e' + e.id); let u = this.unitMap.get('e' + e.id);
      if (!u) { const g = M.enemy(e.type); g.userData.unit = { kind: 'enemy', ref: e }; this.units.add(g); const bar = M.healthBar(e.def.boss ? 3.2 : 1.4, e.def.boss ? 0xff5050 : e.fly ? 0xffd84a : 0x7cff5e); g.add(bar); u = { group: g, bar, kind: 'enemy', ref: e }; this.unitMap.set('e' + e.id, u);
        if (e.def.boss) { const lb = makeLabel(e.def.name + ' · ' + (e.def.title || ''), this.th, 1.4, 'bold', '#ffb0b0'); lb.position.y = 6.5; g.add(lb); u.bossLabel = lb; } }
      e.moving = !(e.mode === 'blocked' || e.mode === 'siegeAttack' || e.trapUntil > time);
      u.group.position.set(e.x, e.y, e.z); M.animateEnemy(u.group, e, time, dt);
      const ratio = e.hp / e.maxHp; const sr = e.maxShield > 0 ? e.shield / e.maxShield : 0; M.setBar(u.bar, ratio, sr); u.bar.visible = ratio < 0.999 || sr > 0;
      u.bar.quaternion.copy(this.camera.quaternion); u.bar.position.set(0, (e.def.boss ? 5.6 : e.fly ? 1.4 : 1.5) + 0.0, 0); u.bar.scale.setScalar(e.def.boss ? 1 : 0.9);
      if (u.bossLabel) { u.bossLabel.material.opacity = 0.9; const ph = e.bossPhase; if (e.type === 'boss_zhe') u.bossLabel.material.color.setHex(ph === 'destroy' ? 0xff6060 : ph === 'escalate' ? 0xffc060 : 0xc0c0ff); }
      // 伪装木马的外壳颜色
      if (e.type === 'trojan') { u.group.traverse(o => { if (o.material && o.material.emissive && o.material.isMeshStandardMaterial) { const t = e.revealed ? 0xff4a4a : 0x4ad2ff; if (o.userData.disguiseTint !== t) { o.userData.disguiseTint = t; o.material.emissive.setHex(t); o.material.emissiveIntensity = 0.35; } } }); }
      // 减速提示
      u.group.position.y += e.slowUntil > time ? Math.sin(time * 12) * 0.02 : 0;
    }
    for (const t of game.towers) {
      if (t.dead) continue; seen.add('t' + t.id); let u = this.unitMap.get('t' + t.id);
      if (!u) { const g = M.tower(t.type === 'isolator' ? 'isolator' : t.type, t.level, t.branch); g.userData.unit = { kind: 'tower', ref: t }; g.rotation.y = -t.facing; this.units.add(g); const bar = M.healthBar(1.8, 0x7cff5e); g.add(bar); u = { group: g, bar, kind: 'tower', ref: t }; this.unitMap.set('t' + t.id, u);
        if (t.type === 'honeypot' || t.type === 'sandbox' || t.type === 'repair') { const ring = makeRing(towerRange(t), 0xffffff, 0.0); ring.position.y = 0.05; g.add(ring); u.rangeRing = ring; }
        if (t.onNode) { const gate = new T.Mesh(new T.TorusGeometry(2.0, 0.08, 8, 8), M.glow(t.type === 'gate' ? 0xff4a3a : 0xff8a3d)); gate.rotation.x = Math.PI / 2; gate.position.y = 0.55; g.add(gate); }
        const lock = new T.Group(); const lm = M.std(0x2a1a3a, { emissive: 0xb96bff, ei: 1.2 }); lock.add(M.mesh(M.box(0.5, 0.45, 0.3), lm, 0, 0, 0)); const sh = new T.Mesh(new T.TorusGeometry(0.18, 0.05, 8, 16, Math.PI), lm); sh.position.y = 0.25; lock.add(sh); lock.position.y = 3.0; lock.visible = false; g.add(lock); u.lock = lock;
        const bubble = new T.Mesh(new T.SphereGeometry(1.7, 16, 12), new T.MeshBasicMaterial({ color: 0x8ad0ff, transparent: true, opacity: 0.12, depthWrite: false })); bubble.position.y = 1.2; bubble.visible = false; g.add(bubble); u.bubble = bubble;
        const storm = new T.Mesh(new T.SphereGeometry(1.9, 16, 12), new T.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.1, depthWrite: false, wireframe: true })); storm.position.y = 1.2; storm.visible = false; g.add(storm); u.storm = storm;
      }
      const g = u.group; g.position.set(t.x, t.y, t.z); g.rotation.y = -t.facing; M.animateTower(g, t, t, time);
      const ratio = t.hp / t.maxHp; const sr = t.maxShield > 0 && t.shield > 0 ? t.shield / t.maxShield : (t.shield > 0 ? 1 : 0); M.setBar(u.bar, ratio, sr); u.bar.visible = ratio < 0.999 || t.shield > 0; u.bar.quaternion.copy(this.camera.quaternion); u.bar.position.set(0, 3.2, 0);
      if (u.rangeRing) { const r = towerRange(t); u.rangeRing.scale.setScalar(r); u.rangeRing.material.opacity = (this.selected === t || this.hoverTower === t) ? 0.5 : 0.0; }
      if (u.lock) { u.lock.visible = t.encUntil > time; if (u.lock.visible) u.lock.rotation.y = time * 2; }
      if (u.bubble) { u.bubble.visible = t.shield > 0; if (u.bubble.visible) u.bubble.material.opacity = 0.08 + Math.sin(time * 4) * 0.04; }
      if (u.storm) { u.storm.visible = t.stormUntil > time; if (u.storm.visible) u.storm.rotation.y = time * 0.8; }
      if (t.isItem) { const left = t.expireAt - time; g.children.forEach(() => { }); if (u.blink == null) u.blink = 0; }
      seen.add('t' + t.id);
    }
    for (const [k, u] of this.unitMap) { if (!seen.has(k)) { this.units.remove(u.group); disposeGroup(u.group); this.unitMap.delete(k); } }
    // 投射物
    const pseen = new Set();
    for (const p of game.projectiles) { pseen.add(p.id); let m = this.projMap.get(p.id); if (!m) { m = new T.Mesh(new T.SphereGeometry(p.kind === 'pulse' ? 0.16 : 0.2, 8, 6), M.glow(p.kind === 'pulse' ? 0x9fe3ff : 0x59c8ff)); this.units.add(m); const trail = new T.Mesh(new T.ConeGeometry(0.14, 0.9, 6), new T.MeshBasicMaterial({ color: 0x59c8ff, transparent: true, opacity: 0.5, depthWrite: false })); m.add(trail); trail.rotation.x = -Math.PI / 2; trail.position.z = -0.5; this.projMap.set(p.id, m); } m.position.set(p.x, p.y, p.z); m.lookAt(p.target.x, p.target.y + 0.6, p.target.z); }
    for (const [k, m] of this.projMap) if (!pseen.has(k)) { this.units.remove(m); disposeGroup(m); this.projMap.delete(k); }
  };
  function towerRange(t) { const d = S.towerDef(t); return (d.lure || d.range || 1) * CELL; }

  // ---------- 场地状态表现 ----------
  View.syncField = function (game, dt, time) {
    const th = this.th;
    // 节点
    if (this.nodeFx) for (const [id, fx] of this.nodeFx) {
      const n = game.M.byId.get(id); const iso = !!n.iso; const cd = game.t < n.reopenAt;
      fx.barrier.visible = iso; if (iso) { fx.barrier.children.forEach((c, i) => { if (c.material && c.material.opacity != null && i < 4) c.material.opacity = 0.16 + Math.sin(time * 4 + i) * 0.06; }); fx.barrier.rotation.y = time * 0.15; }
      fx.cd.visible = cd && !iso; if (fx.cd.visible) fx.cd.material.opacity = 0.5 + Math.sin(time * 6) * 0.3;
      fx.open.visible = !iso && !cd; fx.open.material.opacity = 0.25 + Math.sin(time * 2 + n.x) * 0.1;
      const lamp = fx.group.children[0].userData.dev; if (lamp && lamp.userData.lamp) lamp.userData.lamp.material.color.setHex(iso ? 0xff4a3a : cd ? 0xffc040 : th.accent2);
    }
    // 警告与封锁
    if (!this.terrainFx) this.terrainFx = new Map();
    const wanted = new Set();
    for (const w of game.terrain.warnings) for (const cid of w.cells) wanted.add('w' + cid);
    for (const [cid] of game.terrain.blockedUntil) wanted.add('b' + cid);
    for (const [cid] of game.terrain.oldUntil) wanted.add('o' + cid);
    for (const [k, obj] of this.terrainFx) if (!wanted.has(k)) { this.highlights.remove(obj); disposeGroup(obj); this.terrainFx.delete(k); }
    for (const w of game.terrain.warnings) for (const cid of w.cells) { const k = 'w' + cid; if (this.terrainFx.has(k)) continue; const c = game.M.byId.get(cid); const g = new T.Group(); const ring = makeRing(2.0, 0xff3030, 0.9); g.add(ring); const disc = makeDisc(1.95, 0xff3030, 0.3); g.add(disc); const bx = new T.Mesh(new T.BoxGeometry(3.8, 0.15, 3.8), new T.MeshBasicMaterial({ color: 0xff2020, wireframe: true, transparent: true, opacity: 0.9 })); bx.position.y = 0.4; g.add(bx); g.position.set(c.wx, c.wy + 0.05, c.wz); g.userData.warn = w; this.highlights.add(g); this.terrainFx.set(k, g); }
    for (const [cid, until] of game.terrain.blockedUntil) { const k = 'b' + cid; if (this.terrainFx.has(k)) continue; const c = game.M.byId.get(cid); const g = new T.Group(); const kind = game.terrain.blockedKind.get(cid) || 'blackhole';
      if (kind === 'blackhole') { const sph = new T.Mesh(new T.SphereGeometry(1.5, 20, 14), new T.MeshBasicMaterial({ color: 0x05010c })); sph.position.y = 1.3; g.add(sph); const halo = new T.Mesh(new T.TorusGeometry(1.7, 0.1, 8, 40), M.glow(0xb48cff)); halo.position.y = 1.3; g.add(halo); g.userData.halo = halo; const base = makeRing(1.9, 0xb48cff, 0.8); g.add(base); }
      else { // 锁死：红色封闭墙 + 警示框
        const wallMat = new T.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false });
        for (let i = 0; i < 4; i++) { const w = new T.Mesh(new T.PlaneGeometry(3.8, 2.4), wallMat.clone()); const a = i * Math.PI / 2; w.position.set(Math.sin(a) * 1.9, 1.2, Math.cos(a) * 1.9); w.rotation.y = a; g.add(w); }
        const box = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(3.8, 2.4, 3.8)), new T.LineBasicMaterial({ color: 0xff6060 })); box.position.y = 1.2; g.add(box);
        const base = makeRing(2.0, 0xff3030, 0.85); g.add(base); g.userData.lockWalls = g.children.slice(0, 4);
      }
      g.position.set(c.wx, c.wy, c.wz); this.highlights.add(g); this.terrainFx.set(k, g); }
    for (const [cid, until] of game.terrain.oldUntil) { const k = 'o' + cid; if (this.terrainFx.has(k)) continue; const c = game.M.byId.get(cid); const g = new T.Group(); const plane = new T.Mesh(new T.PlaneGeometry(3.9, 3.9), new T.MeshBasicMaterial({ color: 0xc89a3a, transparent: true, opacity: 0.28, depthWrite: false })); plane.rotation.x = -Math.PI / 2; g.add(plane); const ring = makeRing(2.0, 0xffc040, 0.7); g.add(ring); g.position.set(c.wx, c.wy + 0.03, c.wz); this.highlights.add(g); this.terrainFx.set(k, g); }
    for (const [k, g] of this.terrainFx) { if (k[0] === 'w') { const s = 1 + Math.sin(time * 10) * 0.08; g.scale.set(s, 1, s); g.children[0].material.opacity = 0.5 + Math.sin(time * 10) * 0.4; g.children[1].material.opacity = 0.18 + Math.sin(time * 10) * 0.12; } if (k[0] === 'b' && g.userData.halo) { g.userData.halo.rotation.y = time * 2; g.userData.halo.rotation.x = Math.sin(time) * 0.6; } if (k[0] === 'b' && g.userData.lockWalls) g.userData.lockWalls.forEach((w, i) => { w.material.opacity = 0.2 + Math.sin(time * 5 + i) * 0.08; }); if (k[0] === 'o') g.children[1].material.opacity = 0.4 + Math.sin(time * 3) * 0.25; }
    // 环境动画
    if (this.env) { const L = this.env.userData.layers; L.children.forEach(p => { p.userData.layerMat.uniforms.time.value = time; }); this.env.userData.far.rotation.y = time * 0.004; this.env.userData.dust.rotation.y = time * 0.01; }
    if (this.mapGroup) { this.mapGroup.traverse(o => { if (o.userData && o.userData.ring) o.userData.ring.rotation.z = time; if (o.userData && o.userData.core) { o.userData.core.rotation.y = time * 0.8; o.userData.core.position.y = 2.2 + Math.sin(time * 1.5) * 0.15; } if (o.userData && o.userData.lamp && o.material && o.material.isMeshBasicMaterial) o.material.opacity = 0.6 + Math.sin(time * 4 + o.id) * 0.3; if (o.userData && o.userData.river) o.userData.river.material.uniforms.time.value = time; if (o.userData && o.userData.shimmer) o.userData.shimmer.material.uniforms.time.value = time; if (o.material && o.material.uniforms && o.material.uniforms.time && o.userData && o.userData.mat) o.material.uniforms.time.value = time; }); const ug = this.mapGroup.children.find(c => c.userData && c.userData.mat); if (ug) ug.userData.mat.uniforms.time.value = time; }
    // 高亮
    if (this.routes) this.routes.update(dt, time);
  };

  View.render = function (dt, time) {
    this.updateCamera(dt);
    if (this.composer && this.bloomOn) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  };

  View.THEMES = THEMES; View.makeLabel = makeLabel; View.makeRing = makeRing; View.makeDisc = makeDisc; View.makeArc = makeArc;
  G.View = View;
})();
