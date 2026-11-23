// 三维场景：地图、路线、单位、特效、背景与镜头。只读取模拟状态，不改变战斗逻辑。
(function () {
  const T = window.THREE;
  const M = window.MODELS;
  const FONT = '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC", sans-serif';

  const THEMES = {
    intranet: { bg: 0x061024, fog: 0x0a1c36, accent: 0x3de0ff, base: 0x0d2038, deco: 0x1d4f7a, light: 0xbfe6ff, sky: 0x2a5a8a, pillar: 0x233a57 },
    backbone: { bg: 0x08081e, fog: 0x14122e, accent: 0x8f7bff, base: 0x151234, deco: 0x3a2c7a, light: 0xd7ccff, sky: 0x4a3c9a, pillar: 0x2a2450 },
    airgap: { bg: 0x140c06, fog: 0x21140a, accent: 0xffb547, base: 0x231a10, deco: 0x6a4420, light: 0xffe2b0, sky: 0x7a4c20, pillar: 0x3a2a1a },
  };
  const ENTRY_COLOR = { A: 0x3de0ff, B: 0xffb547, C: 0xff6fd8 };
  const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // 释放对象树中非共享的几何体、材质与贴图（缓存的共享资源保留）
  function disposeTree(root) {
    if (!root) return;
    root.traverse((o) => {
      if (o.geometry && !o.geometry.__shared) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (m.__shared) continue;
        if (m.map && !m.map.__shared) m.map.dispose();
        m.dispose();
      }
    });
  }
  const EXIT_COLOR = { X: 0x6ef3a5, Y: 0xff7f7f };

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    if (repeat) { tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
    return tex;
  }
  function labelSprite(text, color, scale) {
    const tex = canvasTex(512, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(6,14,28,0.78)';
      roundRect(c, 6, 18, w - 12, h - 36, 14);
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = 4;
      roundRect(c, 6, 18, w - 12, h - 36, 14);
      c.stroke();
      c.fillStyle = '#eaf6ff';
      c.font = `bold 52px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 2);
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(scale || 2.6, (scale || 2.6) / 4, 1);
    sp.renderOrder = 10;
    return sp;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function glowTex() {
    return canvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
  }

  // 路线：沿格子中心的带状网格，带流动箭头
  const ROUTE_VS = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const ROUTE_FS = `
    uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uFlash; uniform float uDash;
    varying vec2 vUv;
    void main() {
      float s = vUv.x * 14.0 - uTime * 2.4;
      float chev = abs(fract(s) - 0.5) * 2.0;
      float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
      float dash = uDash > 0.5 ? step(0.5, fract(vUv.x * 9.0 - uTime * 1.2)) : 1.0;
      float a = (0.35 + 0.65 * smoothstep(0.2, 0.9, chev)) * edge * dash;
      vec3 c = uColor * (0.9 + 0.8 * uFlash);
      gl_FragColor = vec4(c, clamp(a * uAlpha * (0.85 + 0.6 * uFlash), 0.0, 1.0));
    }`;

  class View {
    constructor(canvas, overlay) {
      this.canvas = canvas;
      this.overlay = overlay;
      this.octx = overlay.getContext('2d');
      const r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.toneMapping = T.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      r.outputColorSpace = T.SRGBColorSpace;
      this.r = r;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(38, 1, 0.1, 400);
      this.time = 0;
      this.cam = { tx: 0, tz: 0, yaw: 0.0, pitch: 0.95, dist: 22 };
      this.camGoal = null;
      this.glowTex = glowTex();
      this.particles = [];
      this.rings = [];
      this.beams = [];
      this.texts = [];
      this.projs = [];
      this.flashRoutes = {};
      this.towerObjs = new Map();
      this.enemyObjs = new Map();
      this.warnObjs = [];
      this.routeObjs = {};
      this.previewObjs = [];
      this.cellObjs = [];
      this.nodeLeds = new Map();
      this.bossObjs = new Map();
      this.isoWalls = new Map();
      this.lockObjs = new Map();
      this.holeObjs = new Map();
      this.selectedTower = null;
      this.showRanges = null;
      this.mapGroup = null;
      this.bgGroup = null;
      this.size = { w: 1, h: 1 };
      this.resize();
      this.setupPost();
      this.setupEnv();
      this.setupParticles();
    }

    // 泛光后处理：场景渲染到离屏目标，提取高亮、降采样模糊后叠加，再做色调映射与伽马编码
    setupPost() {
      const T2 = T;
      this.rtMain = new T2.WebGLRenderTarget(4, 4, { samples: 4, type: T2.HalfFloatType });
      this.rtA = new T2.WebGLRenderTarget(4, 4, { type: T2.HalfFloatType });
      this.rtB = new T2.WebGLRenderTarget(4, 4, { type: T2.HalfFloatType });
      this.quadCam = new T2.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quadScene = new T2.Scene();
      this.quad = new T2.Mesh(new T2.PlaneGeometry(2, 2));
      this.quadScene.add(this.quad);
      this.matBright = new T2.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, thr: { value: 1.05 } },
        vertexShader: QUAD_VS,
        fragmentShader: 'uniform sampler2D tDiffuse; uniform float thr; varying vec2 vUv; void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(max(c.r, c.g), c.b); float k = max(0.0, l - thr) / max(l, 0.0001); gl_FragColor = vec4(c * k, 1.0); }',
      });
      this.matBlur = new T2.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, dir: { value: new T2.Vector2(1, 0) }, res: { value: new T2.Vector2(1, 1) } },
        vertexShader: QUAD_VS,
        fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 res; varying vec2 vUv; void main() { vec2 o = dir / res; vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270; s += texture2D(tDiffuse, vUv + o * 1.3846154).rgb * 0.3162162; s += texture2D(tDiffuse, vUv - o * 1.3846154).rgb * 0.3162162; s += texture2D(tDiffuse, vUv + o * 3.2307692).rgb * 0.0702703; s += texture2D(tDiffuse, vUv - o * 3.2307692).rgb * 0.0702703; gl_FragColor = vec4(s, 1.0); }',
      });
      this.matComp = new T2.ShaderMaterial({
        uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.42 } },
        vertexShader: QUAD_VS,
        fragmentShader: 'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv; vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); } void main() { vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * strength; c = aces(c * 1.05); c = pow(c, vec3(1.0 / 2.2)); gl_FragColor = vec4(c, 1.0); }',
      });
      this.sizePost();
    }
    sizePost() {
      const pr = this.r.getPixelRatio();
      const W = Math.max(4, Math.floor(this.size.w * pr)), H = Math.max(4, Math.floor(this.size.h * pr));
      this.rtMain.setSize(W, H);
      const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2);
      this.rtA.setSize(bw, bh);
      this.rtB.setSize(bw, bh);
      this.matBlur.uniforms.res.value.set(bw, bh);
    }
    renderFX() {
      const r = this.r;
      r.setRenderTarget(this.rtMain);
      r.render(this.scene, this.camera);
      this.quad.material = this.matBright;
      this.matBright.uniforms.tDiffuse.value = this.rtMain.texture;
      r.setRenderTarget(this.rtA);
      r.render(this.quadScene, this.quadCam);
      this.quad.material = this.matBlur;
      this.matBlur.uniforms.tDiffuse.value = this.rtA.texture;
      this.matBlur.uniforms.dir.value.set(1, 0);
      r.setRenderTarget(this.rtB);
      r.render(this.quadScene, this.quadCam);
      this.matBlur.uniforms.tDiffuse.value = this.rtB.texture;
      this.matBlur.uniforms.dir.value.set(0, 1);
      r.setRenderTarget(this.rtA);
      r.render(this.quadScene, this.quadCam);
      this.quad.material = this.matComp;
      this.matComp.uniforms.tScene.value = this.rtMain.texture;
      this.matComp.uniforms.tBloom.value = this.rtA.texture;
      r.setRenderTarget(null);
      r.render(this.quadScene, this.quadCam);
    }
    setupEnv() {
      const r = this.r;
      const envScene = new T.Scene();
      const sky = new T.Mesh(new T.SphereGeometry(50, 24, 16), new T.MeshBasicMaterial({ color: 0x2a3a5a, side: T.BackSide }));
      envScene.add(sky);
      const light = new T.Mesh(new T.PlaneGeometry(30, 10), new T.MeshBasicMaterial({ color: 0xbfd8ff }));
      light.position.set(0, 25, 0); light.lookAt(0, 0, 0);
      envScene.add(light);
      const pm = new T.PMREMGenerator(r);
      this.envRT = pm.fromScene(envScene, 0.04);
      pm.dispose();
    }
    setupParticles() {
      const N = 2400;
      this.pN = N;
      this.pPos = new Float32Array(N * 3);
      this.pCol = new Float32Array(N * 3);
      this.pSize = new Float32Array(N);
      this.pData = Array.from({ length: N }, () => ({ v: new T.Vector3(), life: 0, max: 1, c: new T.Color(), s: 0.1, g: 0 }));
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(this.pPos, 3));
      geo.setAttribute('color', new T.BufferAttribute(this.pCol, 3));
      this.pGeo = geo;
      const mat = new T.PointsMaterial({ vertexColors: true, size: 0.13, sizeAttenuation: true, transparent: true, map: this.glowTex, blending: T.AdditiveBlending, depthWrite: false });
      this.pts = new T.Points(geo, mat);
      this.pts.frustumCulled = false;
      this.scene.add(this.pts);
      this.pFree = 0;
      for (let i = 0; i < N; i++) { this.pPos[i * 3 + 1] = -100; }
    }
    emitParticles(x, y, z, n, color, speed, life, size, grav) {
      const c = new T.Color(color);
      for (let k = 0; k < n; k++) {
        const i = this.pFree; this.pFree = (this.pFree + 1) % this.pN;
        const d = this.pData[i];
        const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * Math.PI;
        const sp = speed * (0.4 + Math.random() * 0.8);
        d.v.set(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp * 0.9 + speed * 0.4, Math.sin(a) * Math.cos(b) * sp);
        this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
        d.c.copy(c);
        d.life = life * (0.6 + Math.random() * 0.6); d.max = d.life; d.s = size * (0.7 + Math.random() * 0.6); d.g = grav || 0;
      }
    }
    updateParticles(dt) {
      for (let i = 0; i < this.pN; i++) {
        const d = this.pData[i];
        if (d.life <= 0) { this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0; this.pPos[i * 3 + 1] = -100; continue; }
        d.life -= dt;
        d.v.multiplyScalar(Math.pow(0.12, dt));
        d.v.y -= d.g * dt;
        this.pPos[i * 3] += d.v.x * dt;
        this.pPos[i * 3 + 1] += d.v.y * dt;
        this.pPos[i * 3 + 2] += d.v.z * dt;
        const k = Math.max(0, d.life / d.max);
        this.pCol[i * 3] = d.c.r * k; this.pCol[i * 3 + 1] = d.c.g * k; this.pCol[i * 3 + 2] = d.c.b * k;
      }
      this.pGeo.attributes.position.needsUpdate = true;
      this.pGeo.attributes.color.needsUpdate = true;
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.size = { w, h };
      this.r.setSize(w, h, false);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.overlay.width = Math.round(w * (window.devicePixelRatio || 1));
      this.overlay.height = Math.round(h * (window.devicePixelRatio || 1));
      this.overlay.style.width = w + 'px';
      this.overlay.style.height = h + 'px';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.rtMain) this.sizePost();
    }

    // ---------- 地图构建 ----------
    buildMap(sim) {
      this.sim = sim;
      const g = sim.g;
      const theme = THEMES[sim.def.theme] || THEMES.intranet;
      this.theme = theme;
      if (this.mapGroup) { this.scene.remove(this.mapGroup); this.disposeGroup(this.mapGroup); }
      if (this.bgGroup) { this.scene.remove(this.bgGroup); this.disposeGroup(this.bgGroup); }
      this.scene.background = new T.Color(theme.bg);
      this.scene.fog = new T.FogExp2(theme.fog, 0.022);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.55;
      this.lights && this.lights.forEach((l) => this.scene.remove(l));
      this.lights = [];
      const hemi = new T.HemisphereLight(theme.sky, 0x0a0d18, 0.9);
      const key = new T.DirectionalLight(theme.light, 2.1);
      key.position.set(-8, 18, 10);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const sc = g.w * 0.9;
      key.shadow.camera.left = -sc; key.shadow.camera.right = sc;
      key.shadow.camera.top = sc; key.shadow.camera.bottom = -sc;
      key.shadow.camera.near = 1; key.shadow.camera.far = 60;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.02;
      const rim = new T.DirectionalLight(theme.accent, 0.9);
      rim.position.set(10, 8, -12);
      this.scene.add(hemi, key, rim);
      this.lights = [hemi, key, rim];
      this.key = key;

      this.mapGroup = new T.Group();
      this.scene.add(this.mapGroup);
      const mg = this.mapGroup;
      this.bgGroup = new T.Group();
      this.scene.add(this.bgGroup);
      this.buildBackground(theme, g);

      // 悬浮基座
      const bw = g.w + 1.6, bh = g.h + 1.6;
      const baseM = M.mat('baseSlab' + sim.def.id, { color: theme.base, roughness: 0.7, metalness: 0.4 });
      const slab = new T.Mesh(new T.BoxGeometry(bw, 0.5, bh), baseM);
      slab.position.y = -0.5; slab.receiveShadow = true; slab.castShadow = true;
      mg.add(slab);
      const edgeM = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(bw, 0.5, bh)), new T.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.6 }));
      edgeM.position.y = -0.5; mg.add(edgeM);
      const gridTex = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#0c1a2c'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(120,210,255,0.35)'; c.lineWidth = 3;
        c.strokeRect(1.5, 1.5, w - 3, h - 3);
        c.strokeStyle = 'rgba(120,210,255,0.12)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      }, [1, 1]);
      this.gridTex = gridTex;
      const top = new T.Mesh(new T.PlaneGeometry(bw, bh), new T.MeshStandardMaterial({ map: canvasTex(512, 512, (c, w, h) => {
        c.fillStyle = '#0b1828'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(80,180,255,0.18)'; c.lineWidth = 2;
        for (let i = 0; i <= 32; i++) { c.beginPath(); c.moveTo(i * w / 32, 0); c.lineTo(i * w / 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 32); c.lineTo(w, i * h / 32); c.stroke(); }
      }, [bw / 2, bh / 2]), roughness: 0.8, metalness: 0.2 }));
      top.rotation.x = -Math.PI / 2; top.position.y = 0.001; top.receiveShadow = true;
      mg.add(top);

      const accent = new T.Color(theme.accent);
      const linkM = M.mat('link_' + sim.def.id, { color: 0x0f2a44, emissive: accent, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3 });
      const oldM = M.mat('old_' + sim.def.id, { color: 0x3a2412, emissive: 0xff8a2a, emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.2 });
      const plateM = M.mat('plate_' + sim.def.id, { color: 0x173455, roughness: 0.45, metalness: 0.5 });
      const nodeM = M.mat('node_' + sim.def.id, { color: 0x1d2b40, roughness: 0.4, metalness: 0.7 });
      const platM = M.mat('plat_' + sim.def.id, { color: 0x1f3550, roughness: 0.4, metalness: 0.6 });
      const pickMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      this.pickables = [];
      this.cellPick = new Array(g.n);
      for (let i = 0; i < g.n; i++) {
        const x = g.worldX(i), z = g.worldZ(i);
        const type = g.type[i];
        const pk = new T.Mesh(new T.PlaneGeometry(0.98, 0.98), pickMat);
        pk.rotation.x = -Math.PI / 2; pk.position.set(x, 0.14, z);
        pk.userData.cell = i;
        mg.add(pk);
        this.pickables.push(pk);
        this.cellPick[i] = pk;
        if (type === 'void') continue;
        const tile = new T.Mesh(new T.BoxGeometry(0.94, 0.08, 0.94), plateM);
        tile.position.set(x, 0.04, z); tile.receiveShadow = true;
        if (type === 'block' && sim.def.id === 'backbone' && g.y[i] === 6) {
          // 公网流：横贯战场的流动光纤带（与障碍不同，不能通行）
          if (!this.flowMat) {
            this.flowU = { value: 0 };
            this.flowMat = new T.ShaderMaterial({
              uniforms: { uTime: this.flowU, uA: { value: new T.Color(0xff5ca8) }, uB: { value: new T.Color(0x3de0ff) } },
              vertexShader: 'varying float vX; varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vX = w.x; gl_Position = projectionMatrix * viewMatrix * w; }',
              fragmentShader: 'uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying float vX; varying vec2 vUv; void main() { float s = fract(vX * 0.55 - uTime * 0.9); float band = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.45, 0.7, s)); vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(vX * 0.8 - uTime * 1.3)); float edge = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y); gl_FragColor = vec4(c * (0.35 + 1.4 * band), (0.35 + 0.6 * band) * edge); }',
              transparent: true, depthWrite: false, blending: T.AdditiveBlending,
            });
          }
          const flow = new T.Mesh(new T.BoxGeometry(0.9, 0.22, 0.9), this.flowMat);
          flow.position.set(x, 0.14, z);
          mg.add(flow);
          mg.add(tile);
          continue;
        }
        if (type === 'block') {
          // 障碍：数据设施或气隙
          const hgt = 0.9 + ((i * 37) % 7) * 0.09;
          const isGap = sim.def.id === 'airgap' && g.type[i] === 'block';
          if (isGap) {
            const gm = new T.Mesh(new T.BoxGeometry(0.92, hgt, 0.92), M.mat('gap', { color: 0x2a1c12, roughness: 0.5, metalness: 0.5 }));
            gm.position.set(x, hgt / 2, z); gm.castShadow = true; gm.receiveShadow = true; mg.add(gm);
          } else {
            const b = new T.Mesh(new T.BoxGeometry(0.84, hgt, 0.84), M.mat('blk_' + sim.def.id, { color: theme.pillar, roughness: 0.5, metalness: 0.5, emissive: accent, emissiveIntensity: 0.08, map: this.windowTex() }));
            b.position.set(x, hgt / 2, z); b.castShadow = true; b.receiveShadow = true; mg.add(b);
            const cap = new T.Mesh(new T.BoxGeometry(0.86, 0.05, 0.86), M.glowM(theme.accent, 0.9));
            cap.position.set(x, hgt + 0.02, z); mg.add(cap);
          }
          mg.add(tile);
          continue;
        }
        if (type === 'plat') {
          mg.add(tile);
          const pl = new T.Mesh(new T.CylinderGeometry(0.4, 0.44, 0.2, 28), platM);
          pl.position.set(x, 0.14, z); pl.castShadow = true; pl.receiveShadow = true; mg.add(pl);
          const ring = new T.Mesh(new T.TorusGeometry(0.36, 0.014, 8, 40), M.glowM(0x6ef3a5, 0.9));
          ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.26, z); mg.add(ring);
          this.cellObjs[i] = { plat: pl, ring };
          continue;
        }
        mg.add(tile);
        if (type === 'link' || type === 'old') {
          const strip = new T.Mesh(new T.BoxGeometry(0.42, 0.02, 0.42), type === 'old' ? oldM : linkM);
          strip.position.set(x, 0.09, z); mg.add(strip);
          this.cellObjs[i] = { strip };
        }
        if (type === 'node') {
          const dev = new T.Mesh(new T.BoxGeometry(0.44, 0.22, 0.44), nodeM);
          dev.position.set(x, 0.2, z); dev.castShadow = true; mg.add(dev);
          const leds = [];
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
            const led = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), M.glowM(0x5cff9d, 2.2));
            led.position.set(x + Math.cos(a) * 0.23, 0.33, z + Math.sin(a) * 0.23);
            mg.add(led); leds.push(led);
          }
          const halo = new T.Mesh(new T.TorusGeometry(0.4, 0.02, 8, 40), M.glowM(0x5cff9d, 0.9));
          halo.rotation.x = Math.PI / 2; halo.position.set(x, 0.1, z); mg.add(halo);
          this.nodeLeds.set(i, { leds, halo, dev });
          this.cellObjs[i] = { dev };
        }
      }
      // 链路连接的光带
      const beamM = M.mat('beam_' + sim.def.id, { color: 0x000000, emissive: accent, emissiveIntensity: 1.2 });
      const oldBeamM = M.mat('oldbeam_' + sim.def.id, { color: 0x000000, emissive: 0xff8a2a, emissiveIntensity: 1.0 });
      for (let i = 0; i < g.n; i++) {
        if (!g.passable[i]) continue;
        for (const j of [i + 1, i + g.w]) {
          if (j >= g.n) continue;
          if (j === i + 1 && (g.x[i] === g.w - 1)) continue;
          if (!g.passable[j]) continue;
          const oldPair = g.type[i] === 'old' && g.type[j] === 'old';
          const ax = g.worldX(i), az = g.worldZ(i), bx = g.worldX(j), bz = g.worldZ(j);
          const len = Math.hypot(bx - ax, bz - az);
          const beam = new T.Mesh(new T.BoxGeometry(len * 0.6, 0.03, 0.1), oldPair ? oldBeamM : beamM);
          beam.position.set((ax + bx) / 2, 0.1, (az + bz) / 2);
          beam.rotation.y = -Math.atan2(bz - az, bx - ax);
          mg.add(beam);
        }
      }
      // 入口 / 出口
      this.entryObjs = {};
      for (const e of g.entries) {
        const col = ENTRY_COLOR[e.id];
        const x = g.worldX(e.cell), z = g.worldZ(e.cell);
        const portal = new T.Group();
        portal.position.set(x, 0, z);
        const arch = new T.Mesh(new T.TorusGeometry(0.46, 0.05, 12, 40, Math.PI), M.glowM(col, 1.8));
        arch.position.y = 0.42; arch.rotation.z = 0; portal.add(arch);
        const pad = new T.Mesh(new T.CircleGeometry(0.42, 32), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
        pad.rotation.x = -Math.PI / 2; pad.position.y = 0.11; portal.add(pad);
        const lab = labelSprite(`${e.id} ${e.def.name}`, '#' + col.toString(16).padStart(6, '0'), 2.6);
        lab.position.set(0, 1.5, 0); portal.add(lab);
        mg.add(portal);
        this.entryObjs[e.id] = { portal, arch, pad, lab };
      }
      this.exitObjs = {};
      for (const x of g.exits) {
        const col = EXIT_COLOR[x.id];
        const px = g.worldX(x.cell), pz = g.worldZ(x.cell);
        const grp = new T.Group();
        grp.position.set(px, 0, pz);
        const core = new T.Mesh(new T.CylinderGeometry(0.34, 0.42, 0.9, 6), M.mat('core_' + x.id, { color: 0x14263c, metalness: 0.7, roughness: 0.3, emissive: col, emissiveIntensity: 0.25 }));
        core.position.y = 0.45; core.castShadow = true; grp.add(core);
        const cap = new T.Mesh(new T.SphereGeometry(0.28, 20, 14), M.glowM(col, 1.8));
        cap.position.y = 1.02; grp.add(cap);
        const ring = new T.Mesh(new T.TorusGeometry(0.6, 0.03, 8, 40), M.glowM(col, 1.2));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; grp.add(ring);
        const lab = labelSprite(`${x.id} ${x.def.name}`, '#' + col.toString(16).padStart(6, '0'), 2.8);
        lab.position.set(0, 2.1, 0); grp.add(lab);
        mg.add(grp);
        this.exitObjs[x.id] = { grp, core, cap, ring, lab };
      }
      // 路线
      this.routeGroup = new T.Group();
      mg.add(this.routeGroup);
      this.routeObjs = {};
      this.previewGroup = new T.Group();
      mg.add(this.previewGroup);
      this.rangeGroup = new T.Group();
      mg.add(this.rangeGroup);
      this.warnGroup = new T.Group();
      mg.add(this.warnGroup);
      this.dgGroup = new T.Group();
      mg.add(this.dgGroup);
      this.dying = [];
      this.dgKey = '';
      // 地域名称（网络构成标注）
      for (const z of sim.def.zones || []) {
        const lab = labelSprite(z.t, '#c4d8ea', 1.5);
        lab.material.opacity = 0.82;
        lab.position.set(g.worldX(g.idx(z.x, z.y)), 1.05, g.worldZ(g.idx(z.x, z.y)));
        mg.add(lab);
      }
      // 空中航道：伪热点从入口直飞最近的出口（白色虚线，高度与飞行单位一致，地面投影同时标出）
      for (const en of g.entries) {
        let best = null, bd = 1e9;
        for (const x of g.exits) {
          const d = Math.hypot(g.x[x.cell] - g.x[en.cell], g.y[x.cell] - g.y[en.cell]);
          if (d < bd) { bd = d; best = x; }
        }
        if (!best) continue;
        const ax = g.worldX(en.cell), az = g.worldZ(en.cell), bx = g.worldX(best.cell), bz = g.worldZ(best.cell);
        const air = new T.BufferGeometry().setFromPoints([new T.Vector3(ax, 2.1, az), new T.Vector3(bx, 2.1, bz)]);
        const airLine = new T.Line(air, new T.LineDashedMaterial({ color: 0xbfefff, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.6, depthWrite: false }));
        airLine.computeLineDistances();
        mg.add(airLine);
        const gnd = new T.BufferGeometry().setFromPoints([new T.Vector3(ax, 0.26, az), new T.Vector3(bx, 0.26, bz)]);
        const gndLine = new T.Line(gnd, new T.LineDashedMaterial({ color: 0xbfefff, dashSize: 0.1, gapSize: 0.22, transparent: true, opacity: 0.22, depthWrite: false }));
        gndLine.computeLineDistances();
        mg.add(gndLine);
      }
      this.refreshRoutes(sim.entryPaths(), null);
      this.syncNodes();
      this.setDefaultView(true);
      this.fitCamera();
    }
    // 背景：纵深中的协议层网格、远处的网络集群、往来的数据流与漂浮颗粒
    buildBackground(theme, g) {
      const bg = this.bgGroup;
      const deco = new T.Color(theme.deco);
      const acc = new T.Color(theme.accent);
      // 协议层：两层发光网格
      for (const [y, s, op] of [[-5.6, 90, 0.09], [-11, 150, 0.04]]) {
        const tex = canvasTex(512, 512, (c, w, h) => {
          c.clearRect(0, 0, w, h);
          c.strokeStyle = 'rgba(255,255,255,0.9)';
          c.lineWidth = 2;
          for (let i = 0; i <= 16; i++) {
            c.beginPath(); c.moveTo(i * w / 16, 0); c.lineTo(i * w / 16, h); c.stroke();
            c.beginPath(); c.moveTo(0, i * h / 16); c.lineTo(w, i * h / 16); c.stroke();
          }
        }, [s / 10, s / 10]);
        const m = new T.Mesh(new T.PlaneGeometry(s, s), new T.MeshBasicMaterial({ map: tex, color: acc, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.position.y = y;
        bg.add(m);
      }
      // 远处的网络集群（机架 / 数据塔 / 工控罐体）
      const winTex = this.windowTex();
      const clusterM = new T.MeshStandardMaterial({ color: theme.pillar, map: winTex, emissive: acc, emissiveMap: winTex, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.5 });
      const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + rnd() * 0.2;
        const r = 17 + rnd() * 14;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
        let geo;
        if (theme === THEMES.airgap) geo = new T.CylinderGeometry(0.8 + rnd(), 0.9 + rnd(), 2 + rnd() * 3, 14);
        else geo = new T.BoxGeometry(0.9 + rnd() * 1.4, 1.5 + rnd() * 4, 0.9 + rnd() * 1.4);
        const m = new T.Mesh(geo, clusterM);
        m.position.set(x, -5 - rnd() * 1.5 + (geo.parameters.height || 2) * 0.5 - 1, z);
        bg.add(m);
      }
      // 粗大的光纤 / 管道（远景）
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8;
          pts.push(new T.Vector3(Math.cos(a + u * 1.2) * (22 + rnd() * 6), -4 - Math.sin(u * Math.PI) * 4 - rnd(), Math.sin(a + u * 1.2) * (22 + rnd() * 6)));
        }
        const curve = new T.CatmullRomCurve3(pts);
        const tube = new T.Mesh(new T.TubeGeometry(curve, 40, 0.16, 8, false), M.glowM(i % 2 ? acc.getHex() : deco.getHex(), 0.9));
        bg.add(tube);
      }
      // 数据流：沿曲线运动的光点
      this.streams = [];
      const sprite = this.glowTex;
      for (let s = 0; s < 14; s++) {
        const pts = [];
        const a0 = rnd() * Math.PI * 2;
        const rad = 9 + rnd() * 16;
        for (let k = 0; k <= 6; k++) {
          const u = k / 6;
          pts.push(new T.Vector3(Math.cos(a0 + u * 2.4) * rad, -2.5 - Math.sin(u * Math.PI) * 3, Math.sin(a0 + u * 2.4) * rad));
        }
        const curve = new T.CatmullRomCurve3(pts);
        const n = 10;
        const pos = new Float32Array(n * 3);
        const pm = new T.PointsMaterial({ size: 0.5, map: sprite, color: s % 3 === 0 ? acc : new T.Color(0xffffff), transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        const pts3 = new T.Points(geo, pm);
        bg.add(pts3);
        this.streams.push({ curve, pts3, pos, n, phase: rnd() });
      }
      // 漂浮颗粒
      const N = 240;
      const sp = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, r = 6 + rnd() * 26; sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = -3 + rnd() * 8; sp[i * 3 + 2] = Math.sin(a) * r; }
      const dg = new T.BufferGeometry();
      dg.setAttribute('position', new T.BufferAttribute(sp, 3));
      this.dust = new T.Points(dg, new T.PointsMaterial({ size: 0.12, color: acc, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending, map: sprite }));
      bg.add(this.dust);
      // 悬浮基座下方的底座结构
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = new T.Mesh(new T.ConeGeometry(0.9 + rnd() * 0.9, 3 + rnd() * 3, 6), M.mat('underB' + (i % 3), { color: theme.base, roughness: 0.8, metalness: 0.3 }));
        s.rotation.x = Math.PI;
        s.position.set(Math.cos(a) * 9.5, -4.5 - rnd() * 2, Math.sin(a) * 7.5);
        bg.add(s);
      }
      this.bgAnim = (dt, t) => {
        for (const st of this.streams) {
          const pa = st.pos;
          for (let k = 0; k < st.n; k++) {
            const u = (st.phase + k / st.n + t * 0.06) % 1;
            const p = st.curve.getPoint(u);
            pa[k * 3] = p.x; pa[k * 3 + 1] = p.y; pa[k * 3 + 2] = p.z;
          }
          st.pts3.geometry.attributes.position.needsUpdate = true;
        }
        this.dust.rotation.y = t * 0.01;
        this.protoSpin = (this.protoSpin || 0) + dt * 0.02;
      };
    }
    windowTex() {
      if (this._winTex) return this._winTex;
      this._winTex = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#16233a'; c.fillRect(0, 0, w, h);
        for (let y = 8; y < h; y += 16) for (let x = 6; x < w; x += 14) {
          const on = Math.random() < 0.45;
          c.fillStyle = on ? (Math.random() < 0.5 ? '#7ad8ff' : '#7aff9d') : '#1d3152';
          c.fillRect(x, y, 6, 8);
        }
      });
      return this._winTex;
    }
    disposeGroup(grp) {
      disposeTree(grp);
    }
    // 击杀 / 离场 / 倒塌动画
    startDying(obj, mode) {
      this.dying.push({ obj, t: 0, mode });
    }
    updateDying(dt) {
      for (let i = this.dying.length - 1; i >= 0; i--) {
        const d = this.dying[i];
        d.t += dt;
        const k = Math.min(1, d.t / (d.mode === 'leak' ? 0.7 : 0.55));
        const g = d.obj.group;
        const base = d.obj.scale || 1;
        if (d.mode === 'tower') {
          g.scale.set(1 + k * 0.2, Math.max(0.05, 1 - k), 1 + k * 0.2);
          g.position.y -= dt * 0.6;
        } else if (d.mode === 'leak') {
          g.position.y -= dt * 1.5;
          g.scale.setScalar(Math.max(0.02, base * (1 - k)));
          g.rotation.y += dt * 4;
        } else {
          g.scale.setScalar(Math.max(0.02, base * (1 - k * k)));
          g.rotation.y += dt * 9;
          g.position.y += dt * 1.2;
        }
        if (k >= 1) { this.mapGroup.remove(g); disposeTree(g); this.dying.splice(i, 1); }
      }
    }
    // 降级链路：橙色脉动覆盖层
    updateDowngrade(sim) {
      const key = sim.downgrade.size ? [...sim.downgrade.keys()].sort((a, b) => a - b).join(',') : '';
      if (key !== this.dgKey) {
        this.dgKey = key;
        while (this.dgGroup.children.length) { const c = this.dgGroup.children[0]; this.dgGroup.remove(c); disposeTree(c); }
        const g = sim.g;
        for (const c of sim.downgrade.keys()) {
          const m = new T.Mesh(new T.BoxGeometry(0.92, 0.02, 0.92), new T.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.28, depthWrite: false, blending: T.AdditiveBlending }));
          m.position.set(g.worldX(c), 0.16, g.worldZ(c));
          this.dgGroup.add(m);
          const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.92, 0.02, 0.92)), new T.LineBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.8 }));
          e.position.copy(m.position);
          this.dgGroup.add(e);
        }
      }
      const pulse = 0.22 + 0.12 * Math.sin(this.time * 4);
      for (const m of this.dgGroup.children) if (m.material && m.material.opacity !== undefined && m.isMesh) m.material.opacity = pulse;
    }
    // 技能释放特效
    skillFx(ev) {
      const t = this.sim.towers.get(ev.tower);
      if (!t) return;
      const FX = { firewall: 0xff9b4a, honeypot: 0xffd166, interceptor: 0x3de0ff, sandbox: 0xb388ff, repair: 0x6ef3a5, gateway: 0x4dabf7 };
      const col = FX[t.kind] || 0xffffff;
      const r = t.kind === 'repair' ? t.healR : t.kind === 'sandbox' ? t.detectR : t.kind === 'honeypot' ? t.trapR : 2.3;
      this.emitRing(t.x, 0.3, t.z, col, r, 0.9);
      this.emitRing(t.x, 0.3, t.z, col, r * 0.55, 0.6);
      this.emitParticles(t.x, 1.0, t.z, 36, col, 2.6, 0.9, 0.12, 0);
      this.emitText(t.x, 2.1, t.z, t.def.skill.name, '#ffffff', true);
    }
    updateNodeEngage(sim) {
      for (const [i, obj] of this.nodeLeds) {
        const t = sim.isoDevice[i];
        const eng = !!(t && sim.t - t.lastHitT < 1.5);
        if (eng === obj.eng) continue;
        obj.eng = eng;
        const iso = sim.isIsolated(i);
        const col = eng ? 0xffb547 : iso ? 0xff4d6d : 0x5cff9d;
        for (const l of obj.leds) l.material = M.glowM(col, eng ? 2.6 : iso ? 2.6 : 2.0);
        obj.halo.material = M.glowM(col, eng ? 1.8 : iso ? 1.4 : 0.8);
      }
    }
    // 潜伏：整体淡出（每个材质按需克隆一次，不影响其他单位）
    setStealth(o, a) {
      if (o.stealthA === a) return;
      o.stealthA = a;
      o.group.traverse((m) => {
        if (!m.material || m.material.opacity === undefined) return;
        if (!m.material.__own) {
          m.material = m.material.clone();
          m.material.__own = true;
          m.material.__oo = m.material.opacity;
          m.material.__ot = m.material.transparent;
          m.material.__od = m.material.depthWrite;
        }
        const mt = m.material;
        mt.opacity = mt.__oo * a;
        mt.transparent = a < 1 || mt.__ot;
        mt.depthWrite = a >= 1 ? mt.__od : false;
      });
    }
    // 加密：紫色自发光着色
    setEncTint(o, on) {
      o.group.traverse((m) => {
        if (!m.material || !m.material.emissive) return;
        if (!m.material.__own) {
          m.material = m.material.clone();
          m.material.__own = true;
          m.material.__oe = m.material.emissive.getHex();
          m.material.__oi = m.material.emissiveIntensity;
        }
        const mt = m.material;
        if (on) { mt.emissive.setHex(0x6a2cc0); mt.emissiveIntensity = (mt.__oi || 0) + 0.7; }
        else { mt.emissive.setHex(mt.__oe); mt.emissiveIntensity = mt.__oi; }
      });
    }
    syncNodes() {
      const sim = this.sim;
      for (const [i, obj] of this.nodeLeds) {
        obj.eng = undefined;
        const iso = sim.isIsolated(i);
        const col = iso ? 0xff4d6d : 0x5cff9d;
        for (const l of obj.leds) { l.material = M.glowM(col, iso ? 2.6 : 2.0); }
        obj.halo.material = M.glowM(col, iso ? 1.4 : 0.8);
        if (iso && !this.isoWalls.has(i)) {
          const w = new T.Mesh(new T.BoxGeometry(0.9, 0.8, 0.9), new T.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.12, depthWrite: false }));
          w.position.set(this.sim.g.worldX(i), 0.4, this.sim.g.worldZ(i));
          const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.9, 0.8, 0.9)), new T.LineBasicMaterial({ color: 0xff7a8f, transparent: true, opacity: 0.7 }));
          edge.position.copy(w.position);
          this.mapGroup.add(w, edge);
          this.isoWalls.set(i, { w, edge });
        } else if (!iso && this.isoWalls.has(i)) {
          const o = this.isoWalls.get(i);
          this.mapGroup.remove(o.w, o.edge);
          disposeTree(o.w); disposeTree(o.edge);
          this.isoWalls.delete(i);
          this.emitRing(this.sim.g.worldX(i), 0.3, this.sim.g.worldZ(i), 0x5cff9d, 1.2, 0.7);
        }
      }
    }
    // 路线：paths 为 { A: [cellIdx...], ... }，preview 为预览路线（虚线）
    refreshRoutes(paths, preview) {
      const sim = this.sim;
      const g = sim.g;
      for (const r of this.routeRings || []) { this.routeGroup.remove(r); disposeTree(r); }
      this.routeRings = [];
      for (const id in this.routeObjs) { this.routeGroup.remove(this.routeObjs[id]); disposeTree(this.routeObjs[id]); }
      this.routeObjs = {};
      for (const id in paths) {
        const p = paths[id];
        if (p.length < 2) continue;
        const m = this.ribbon(p, ENTRY_COLOR[id] || 0xffffff, 0.16, 0.85, false);
        this.routeGroup.add(m);
        this.routeObjs[id] = m;
        const ex = p[p.length - 1];
        const ri = { A: 0.28, B: 0.42, C: 0.56 }[id] || 0.3;
        const rg = new T.Mesh(new T.RingGeometry(ri, ri + 0.07, 36), new T.MeshBasicMaterial({ color: ENTRY_COLOR[id] || 0xffffff, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        rg.rotation.x = -Math.PI / 2;
        rg.position.set(g.worldX(ex), 0.34, g.worldZ(ex));
        this.routeGroup.add(rg);
        this.routeRings.push(rg);
      }
      for (const o of this.previewObjs) { this.previewGroup.remove(o); disposeTree(o); }
      this.previewObjs = [];
      if (preview) {
        for (const id in preview) {
          const p = preview[id];
          if (!p || p.length < 2) continue;
          const m = this.ribbon(p, 0xffffff, 0.13, 0.95, true, 0.27);
          this.previewGroup.add(m);
          this.previewObjs.push(m);
        }
      }
    }
    ribbon(cells, color, halfW, alpha, dashed, yy) {
      const yv = yy != null ? yy : 0.2;
      const g = this.sim.g;
      const n = cells.length;
      const pos = new Float32Array(n * 2 * 3);
      const uv = new Float32Array(n * 2 * 2);
      const idx = [];
      let acc = 0;
      const pts = cells.map((c) => [g.worldX(c), yv, g.worldZ(c)]);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[2] - a[2];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const nx = -dz * halfW, nz = dx * halfW;
        if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]);
        pos.set([p[0] + nx, p[1], p[2] + nz], i * 6);
        pos.set([p[0] - nx, p[1], p[2] - nz], i * 6 + 3);
        uv.set([acc, 0, acc, 1], i * 4);
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mat = new T.ShaderMaterial({
        uniforms: { uColor: { value: new T.Color(color) }, uTime: { value: this.time }, uAlpha: { value: alpha }, uFlash: { value: 0 }, uDash: { value: dashed ? 1 : 0 } },
        vertexShader: ROUTE_VS, fragmentShader: ROUTE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      });
      const m = new T.Mesh(geo, mat);
      m.renderOrder = 4;
      return m;
    }

    // ---------- 镜头 ----------
    fitCamera() {
      const g = this.sim.g;
      const aspect = this.size.w / this.size.h;
      const vfov = (this.camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      const halfW = (g.w + 1.4) / 2, halfH = (g.h + 1.4) / 2;
      const dW = halfW / Math.tan(hfov / 2), dH = halfH / Math.tan(vfov / 2);
      this.defaultDist = Math.max(dW, dH) * 1.06 + 2;
    }
    setDefaultView(instant) {
      const gm = this.sim ? this.sim.g : null;
      this.cam.tx = 0; this.cam.tz = gm ? gm.h * 0.085 : 0; this.cam.yaw = 0; this.cam.pitch = 0.98;
      this.fitCamera();
      this.cam.dist = this.defaultDist;
      if (instant) this.camGoal = null;
    }
    updateCamera(dt) {
      if (this.camGoal) {
        const k = 1 - Math.exp(-dt * (this.camGoal.speed || 2.2));
        const c = this.cam, gl = this.camGoal;
        c.tx += (gl.tx - c.tx) * k;
        c.tz += (gl.tz - c.tz) * k;
        c.yaw += (gl.yaw - c.yaw) * k;
        c.pitch += (gl.pitch - c.pitch) * k;
        c.dist += (gl.dist - c.dist) * k;
      }
      const c = this.cam;
      const cp = Math.cos(c.pitch);
      const px = c.tx + c.dist * cp * Math.sin(c.yaw);
      const py = c.dist * Math.sin(c.pitch);
      const pz = c.tz + c.dist * cp * Math.cos(c.yaw);
      this.camera.position.set(px, py, pz);
      this.camera.lookAt(c.tx, 0.4, c.tz);
      // 镜头震动（按模拟时间，导出时可复现）
      if (this.shakeT > 0) {
        const k = (this.shakeT / 0.6) * this.shakeAmp;
        this.camera.position.x += Math.sin(this.time * 71) * k;
        this.camera.position.y += Math.cos(this.time * 83) * k * 0.5;
      }
    }
    addShake(amp, dur) { this.shakeAmp = Math.max(this.shakeAmp || 0, amp); this.shakeT = Math.max(this.shakeT || 0, dur); }
    // 用户操作：绕 Y 轴旋转（中键）、平移（Shift + 中键）、缩放（滚轮）
    orbit(dx, dy) {
      this.cam.yaw -= dx * 0.006;
      this.cam.pitch = Math.min(1.45, Math.max(0.28, this.cam.pitch + dy * 0.005));
      this.camGoal = null;
    }
    pan(dx, dy) {
      const c = this.cam;
      const s = c.dist * 0.0022;
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      c.tx += (-dx * rx + dy * fx) * s;
      c.tz += (-dx * rz + dy * fz) * s;
      c.tx = Math.max(-this.sim.g.w * 0.6, Math.min(this.sim.g.w * 0.6, c.tx));
      c.tz = Math.max(-this.sim.g.h * 0.6, Math.min(this.sim.g.h * 0.6, c.tz));
      this.camGoal = null;
    }
    zoom(delta) {
      const c = this.cam;
      c.dist = Math.max(4, Math.min(this.defaultDist * 1.4, c.dist * Math.exp(delta * 0.0012)));
      this.camGoal = null;
    }
    // 屏幕坐标 -> 拾取
    pick(cx, cy) {
      const ndc = new T.Vector2((cx / this.size.w) * 2 - 1, -(cy / this.size.h) * 2 + 1);
      const ray = new T.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const objs = [];
      for (const [id, o] of this.towerObjs) objs.push(o.group);
      for (const [id, o] of this.enemyObjs) objs.push(o.group);
      const hitsU = ray.intersectObjects(objs, true);
      for (const h of hitsU) {
        let o = h.object;
        while (o && !o.userData.enemy && !o.userData.tower) o = o.parent;
        if (o && o.userData.enemy) return { enemy: o.userData.enemy };
        if (o && o.userData.tower) return { tower: o.userData.tower };
      }
      const plane = new T.Plane(new T.Vector3(0, 1, 0), -0.12);
      const pt = new T.Vector3();
      if (ray.ray.intersectPlane(plane, pt)) {
        const g = this.sim.g;
        const x = Math.round(pt.x + (g.w - 1) / 2), y = Math.round(pt.z + (g.h - 1) / 2);
        if (x >= 0 && y >= 0 && x < g.w && y < g.h) return { cell: y * g.w + x, point: pt.clone() };
      }
      return {};
    }
    groundPoint(cx, cy) {
      const ndc = new T.Vector2((cx / this.size.w) * 2 - 1, -(cy / this.size.h) * 2 + 1);
      const ray = new T.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const plane = new T.Plane(new T.Vector3(0, 1, 0), -0.12);
      const pt = new T.Vector3();
      if (ray.ray.intersectPlane(plane, pt)) return pt;
      return null;
    }
    cellAt(cx, cy) {
      const p = this.groundPoint(cx, cy);
      if (!p) return -1;
      const g = this.sim.g;
      const x = Math.round(p.x + (g.w - 1) / 2), y = Math.round(p.z + (g.h - 1) / 2);
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) return -1;
      return y * g.w + x;
    }
    toScreen(x, y, z) {
      const v = new T.Vector3(x, y, z).project(this.camera);
      return [(v.x * 0.5 + 0.5) * this.size.w, (-v.y * 0.5 + 0.5) * this.size.h, v.z];
    }

    // ---------- 特效 ----------
    emitRing(x, y, z, color, r, life) {
      const m = new T.Mesh(new T.RingGeometry(0.85, 1, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      this.scene.add(m);
      this.rings.push({ m, t: 0, life: life || 0.6, r: r || 1.5, color });
    }
    emitBeam(x0, y0, z0, x1, y1, z1, color, life, width) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz) || 0.01;
      const m = new T.Mesh(new T.CylinderGeometry(width || 0.03, width || 0.03, len, 6), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / len, dy / len, dz / len));
      this.scene.add(m);
      this.beams.push({ m, t: 0, life: life || 0.25 });
    }
    emitText(x, y, z, text, color, big) {
      this.texts.push({ x, y, z, text, color, t: 0, life: big ? 1.3 : 0.9, big: !!big, dy: 0 });
    }
    emitProj(kind, from, toFn, dur, color, onDone, extra) {
      let obj;
      if (kind === 'orb') {
        obj = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), M.glowM(color, 2.4));
      } else {
        obj = new T.Mesh(new T.CapsuleGeometry ? new T.CapsuleGeometry(0.06, 0.2, 4, 8) : new T.SphereGeometry(0.08, 10, 8), M.glowM(color, 3));
      }
      const trail = new T.Mesh(new T.CylinderGeometry(0.02, 0.05, 1, 6, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
      this.scene.add(obj, trail);
      this.projs.push({ obj, trail, from, toFn, t: 0, dur, color, onDone, extra });
    }

    // 将模拟事件转换为表现
    handleEvents(events) {
      const sim = this.sim;
      for (const ev of events) {
        switch (ev.type) {
          case 'spawn': {
            if (ev.boss) { this.emitRing(ev.x, 0.2, ev.z, 0xff4d6d, 4, 1.2); this.addShake(0.5, 0.6); }
            else this.emitRing(ev.x, 0.12, ev.z, 0x9fe8ff, 0.7, 0.35);
            break;
          }
          case 'hit': {
            { const ho = this.enemyObjs.get(ev.enemy); if (ho) ho.hitT = 0.2; }
            this.emitParticles(ev.x, ev.y + 0.4, ev.z, 5, 0xffe08a, 2.2, 0.35, 0.07, 3);
            this.emitText(ev.x, ev.y + 1.3, ev.z, String(ev.dmg), ev.src === 'interceptor' ? '#bfeaff' : '#ffd0a0');
            break;
          }
          case 'kill': {
            { const ko = this.enemyObjs.get(ev.enemy); if (ko) { this.enemyObjs.delete(ev.enemy); this.startDying(ko, 'kill'); } }
            this.emitParticles(ev.x, (ev.y || 0) + 0.3, ev.z, ev.boss ? 60 : 16, 0x7ff3ff, 3.2, 0.7, 0.1, 4);
            this.emitRing(ev.x, 0.1, ev.z, 0x7ff3ff, 1.0, 0.5);
            break;
          }
          case 'towerHit': {
            this.emitParticles(ev.x, 0.9, ev.z, 6, 0xff7a5a, 2.5, 0.4, 0.08, 4);
            this.emitText(ev.x, 1.4, ev.z, '-' + ev.dmg, '#ff8a8a');
            break;
          }
          case 'towerDown': {
            { const tdo = this.towerObjs.get(ev.tower); if (tdo) { this.towerObjs.delete(ev.tower); this.startDying(tdo, 'tower'); } }
            this.emitParticles(ev.x, 0.6, ev.z, 60, 0xff8a3a, 4, 1.0, 0.14, 3);
            this.emitRing(ev.x, 0.2, ev.z, 0xff8a3a, 1.8, 0.8);
            break;
          }
          case 'sold': this.emitRing(ev.x || 0, 0.2, ev.z || 0, 0xffd166, 1.4, 0.6); break;
          case 'built': {
            const t = sim.towers.get(ev.tower);
            if (t) { this.emitRing(t.x, 0.2, t.z, 0x6ef3a5, 1.3, 0.7); this.emitParticles(t.x, 0.6, t.z, 26, 0x9affc6, 2.2, 0.6, 0.09, 1); }
            break;
          }
          case 'upgrade': {
            const t = sim.towers.get(ev.tower);
            if (t) { this.emitRing(t.x, 0.6, t.z, 0xffd166, 1.4, 0.7); this.emitParticles(t.x, 0.9, t.z, 24, 0xffe08a, 2.0, 0.7, 0.1, 0); this.rebuildTower(t); this.emitText(t.x, 1.8, t.z, '升级 Lv2', '#ffe08a', true); }
            break;
          }
          case 'branch': {
            const t = sim.towers.get(ev.tower);
            if (t) { this.rebuildTower(t); this.emitRing(t.x, 0.6, t.z, 0xffd166, 1.6, 0.8); this.emitText(t.x, 1.9, t.z, '分支：' + t.def.branches[ev.branch].name, '#ffe08a', true); }
            break;
          }
          case 'isolate': {
            this.emitRing(this.sim.g.worldX(ev.cell), 0.2, this.sim.g.worldZ(ev.cell), 0xff4d6d, 1.8, 0.8);
            this.emitParticles(this.sim.g.worldX(ev.cell), 0.5, this.sim.g.worldZ(ev.cell), 30, 0xff7a8f, 2.6, 0.7, 0.1, 0);
            this.syncNodes();
            break;
          }
          case 'restore': this.syncNodes(); this.emitRing(this.sim.g.worldX(ev.cell), 0.2, this.sim.g.worldZ(ev.cell), 0x5cff9d, 1.5, 0.8); break;
          case 'reroute': {
            for (const id of ev.entries) this.flashRoutes[id] = 1.6;
            this.refreshRoutes(ev.paths, this.previewPaths || null);
            break;
          }
          case 'block': {
            this.emitParticles(ev.x, 0.5, ev.z, 8, 0xffb36b, 2.5, 0.35, 0.08, 3);
            break;
          }
          case 'shot': {
            const col = ev.branch === 'suppress' ? 0x9fe8ff : ev.branch === 'pierce' ? 0xbff6ff : 0x3de0ff;
            const id = ev.to;
            this.emitProj('bolt', { x: ev.x, y: 1.1, z: ev.z }, () => {
              const e = sim.enemies.get(id);
              return e ? { x: e.x, y: e.flying ? 2.1 : 0.5, z: e.z } : null;
            }, ev.dur || 0.28, col);
            break;
          }
          case 'pierce': this.emitBeam(ev.x0, 1.1, ev.z0, ev.x1, 0.5, ev.z1, 0xbff6ff, 0.25, 0.04); break;
          case 'enemyShot': {
            const id = ev.to;
            this.emitProj('orb', { x: ev.x, y: 0.6, z: ev.z }, () => {
              const t = sim.towers.get(id);
              return t ? { x: t.x, y: 1.0, z: t.z } : null;
            }, 0.35, 0xb07cff);
            break;
          }
          case 'enemyBite': {
            { const bo = this.enemyObjs.get(ev.enemy); if (bo) bo.lunge = { t: 0, dx: ev.tx - ev.x, dz: ev.tz - ev.z }; }
            this.emitBeam(ev.x, 0.45, ev.z, ev.tx, 1.0, ev.tz, 0xff5f6d, 0.14, 0.03);
            this.emitParticles(ev.tx, 0.8, ev.tz, 6, 0xff5f6d, 2.0, 0.3, 0.08, 2);
            break;
          }
          case 'heal': {
            this.emitBeam(ev.fx, 1.0, ev.fz, ev.x, 0.9, ev.z, 0x6ef3a5, 0.3, 0.035);
            this.emitParticles(ev.x, 0.9, ev.z, 3, 0x9affc6, 1.0, 0.6, 0.07, -1.2);
            break;
          }
          case 'shield': this.emitRing(ev.x, 0.6, ev.z, 0x6ef3a5, 0.9, 0.5); break;
          case 'encrypt': {
            this.emitParticles(ev.x, 1.2, ev.z, 14, 0xb07cff, 1.6, 0.6, 0.1, -0.5);
            this.emitText(ev.x, 1.7, ev.z, '加密', '#d5b8ff');
            break;
          }
          case 'restoreTower': {
            this.emitParticles(ev.x, 0.8, ev.z, 24, 0x6ef3a5, 2.0, 0.7, 0.1, -0.6);
            this.emitRing(ev.x, 0.3, ev.z, 0x6ef3a5, 1.3, 0.6);
            break;
          }
          case 'reveal': {
            this.emitRing(ev.x, 0.2, ev.z, 0xffd166, 1.4, 0.7);
            this.emitParticles(ev.x, 0.5, ev.z, 14, 0xffd166, 2.0, 0.5, 0.08, 0);
            this.emitText(ev.x, 0.9, ev.z, '显形', '#ffd166');
            break;
          }
          case 'payload': {
            this.emitRing(ev.x, 0.2, ev.z, 0xff3d5a, ev.r * 1.4, 0.7);
            this.emitParticles(ev.x, 0.5, ev.z, 40, 0xff3d5a, 4, 0.8, 0.14, 2);
            this.emitText(ev.x, 1.2, ev.z, '载荷爆炸!', '#ff6b7a', true);
            break;
          }
          case 'aoe': this.emitRing(ev.x, 0.15, ev.z, 0xb388ff, ev.r * 1.1, 0.5); break;
          case 'clone': this.emitParticles(ev.x, 0.4, ev.z, 10, 0xff8a5c, 1.8, 0.5, 0.08, 0); break;
          case 'slam': {
            this.emitRing(ev.x, 0.2, ev.z, 0xff4d6d, 2.6, 0.7);
            this.emitParticles(ev.x, 0.5, ev.z, 50, 0xff6b7a, 4.2, 0.8, 0.14, 3);
            this.emitText(ev.x, 1.2, ev.z, ev.kind === 'boss' ? '洪峰冲击!' : '-' + ev.dmg, '#ff8a8a', true);
            break;
          }
          case 'leak': {
            const lo = this.enemyObjs.get(ev.enemy);
            if (lo) { this.enemyObjs.delete(ev.enemy); this.startDying(lo, 'leak'); }
            this.emitText(ev.x, 1.3, ev.z, '-' + ev.dmg + ' 中枢', '#ff8a8a', true);
            break;
          }
          case 'counter': this.emitBeam(ev.x, 0.8, ev.z, ev.tx, 0.5, ev.tz, 0xff9b4a, 0.12, 0.03); break;
          case 'skill': this.skillFx(ev); break;
          case 'trap': this.emitRing(ev.x, 0.3, ev.z, 0xffd166, 0.6, 0.6); break;
          case 'aura': this.emitRing(ev.x, 0.15, ev.z, 0xffc857, ev.r, 0.4); break;
          case 'phase': {
            this.addShake(0.45, 0.6);
            this.emitRing(ev.x, 0.2, ev.z, 0xffffff, 5, 1.0);
            this.emitParticles(ev.x, 1.0, ev.z, 60, 0xffffff, 3.5, 1.0, 0.15, 0);
            this.emitText(ev.x, 2.6, ev.z, '阶段转换：' + ev.name, '#ffffff', true);
            break;
          }
          case 'summon': this.emitRing(ev.x, 0.2, ev.z, 0xff4d6d, 2.2, 0.8); break;
          case 'storm': this.emitRing(ev.x, 0.2, ev.z, 0x7cf9ff, 3.6, 1.0); break;
          case 'downgrade': for (const c of ev.cells.slice(0, 40)) this.emitParticles(this.sim.g.worldX(c), 0.3, this.sim.g.worldZ(c), 2, 0xff9a3a, 1.2, 0.8, 0.08, 0); break;
          case 'lock':
          case 'blackhole': this.onBossTerrain(ev); break;
          case 'warn': break;
          case 'wave': break;
          case 'spawnBoss': break;
        }
      }
    }
    onBossTerrain(ev) {
      const g = this.sim.g;
      for (const c of ev.cells) {
        const x = g.worldX(c), z = g.worldZ(c);
        if (ev.type === 'lock') {
          const m = new T.Mesh(new T.BoxGeometry(0.9, 0.7, 0.9), new T.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, depthWrite: false }));
          m.position.set(x, 0.35, z);
          const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(0.9, 0.7, 0.9)), new T.LineBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.9 }));
          e.position.copy(m.position);
          this.mapGroup.add(m, e);
          this.lockObjs.set(c, { m, e, t: 0 });
        } else {
          const m = new T.Mesh(new T.CircleGeometry(0.6, 32), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.position.set(x, 0.16, z);
          this.mapGroup.add(m);
          this.holeObjs.set(c, { m, t: 0 });
        }
        this.emitRing(x, 0.2, z, ev.type === 'lock' ? 0x9fe8ff : 0x9b5cff, 1.4, 0.9);
      }
    }

    // 预警与预览
    updateWarnings(warnings, time) {
      const g = this.sim.g;
      while (this.warnGroup.children.length) { const c = this.warnGroup.children[0]; this.warnGroup.remove(c); disposeTree(c); }
      for (const w of warnings) {
        const col = w.kind === 'lock' ? 0x9fe8ff : w.kind === 'blackhole' ? 0xb07cff : 0xff4d6d;
        const pulse = 0.4 + 0.3 * Math.sin(time * 9);
        if (w.kind === 'slam') {
          const m = new T.Mesh(new T.RingGeometry(0.8, 1.0, 40), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: pulse, side: T.DoubleSide, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; m.position.set(g.worldX(w.cell), 0.22, g.worldZ(w.cell));
          this.warnGroup.add(m);
          continue;
        }
        for (const c of w.cells || []) {
          const m = new T.Mesh(new T.BoxGeometry(0.94, 0.03, 0.94), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: pulse * 0.7, depthWrite: false }));
          m.position.set(g.worldX(c), 0.22, g.worldZ(c));
          this.warnGroup.add(m);
        }
      }
    }
    // 悬停与部署预览：{ cells:[{c,ok}], rings:[{x,z,r,color}], cone:{x,z,ang,range,arc} }
    setPreview(p) {
      while (this.rangeGroup.children.length) { const c = this.rangeGroup.children[0]; this.rangeGroup.remove(c); disposeTree(c); }
      if (!p) return;
      const g = this.sim.g;
      for (const c of p.cells || []) {
        const m = new T.Mesh(new T.BoxGeometry(0.96, 0.03, 0.96), new T.MeshBasicMaterial({ color: c.ok ? 0x6ef3a5 : 0xff4d6d, transparent: true, opacity: 0.45, depthWrite: false }));
        m.position.set(g.worldX(c.c), 0.2, g.worldZ(c.c));
        this.rangeGroup.add(m);
      }
      for (const r of p.rings || []) {
        const m = new T.Mesh(new T.RingGeometry(r.r - 0.04, r.r, 64), new T.MeshBasicMaterial({ color: r.color || 0x3de0ff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(r.x, 0.24, r.z);
        this.rangeGroup.add(m);
        const f = new T.Mesh(new T.CircleGeometry(r.r, 48), new T.MeshBasicMaterial({ color: r.color || 0x3de0ff, transparent: true, opacity: 0.08, depthWrite: false }));
        f.rotation.x = -Math.PI / 2; f.position.set(r.x, 0.23, r.z);
        this.rangeGroup.add(f);
      }
      if (p.cone) {
        const cn = p.cone;
        const shape = new T.Shape();
        const steps = 28;
        shape.moveTo(0, 0);
        for (let i = 0; i <= steps; i++) {
          const a = cn.ang - cn.arc + (2 * cn.arc * i) / steps;
          shape.lineTo(Math.cos(a) * cn.range, Math.sin(a) * cn.range);
        }
        shape.lineTo(0, 0);
        const geo = new T.ShapeGeometry(shape);
        const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: cn.ok === false ? 0xff4d6d : 0x3de0ff, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = 0;
        m.position.set(cn.x, 0.26, cn.z);
        m.geometry.rotateX(0);
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.geometry.rotateZ(0);
        // ShapeGeometry 在 XY 平面，转到地面后需把 Y 映射到 Z
        m.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + cn.ang);
        this.rangeGroup.add(m);
        const edge = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: cn.ok === false ? 0xff7a8f : 0x7fe9ff, transparent: true, opacity: 0.9 }));
        edge.rotation.copy(m.rotation); edge.position.copy(m.position);
        this.rangeGroup.add(edge);
      }
    }

    // ---------- 同步单位 ----------
    rebuildTower(t) {
      const old = this.towerObjs.get(t.id);
      if (old) { this.mapGroup.remove(old.group); disposeTree(old.group); }
      this.createTowerObj(t);
    }
    createTowerObj(t) {
      const def = t.def;
      const built = M.buildTower(t.kind, t.level, t.branch);
      built.group.position.set(t.x, 0, t.z);
      built.group.userData.tower = t.id;
      built.group.traverse((o) => { o.userData.tower = t.id; });
      const bub = new T.Mesh(new T.SphereGeometry(0.6, 18, 12), new T.MeshBasicMaterial({ color: 0x7cf9ff, transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending }));
      bub.position.y = 0.5; bub.visible = false;
      built.group.add(bub);
      this.mapGroup.add(built.group);
      this.towerObjs.set(t.id, { group: built.group, model: built, id: t.id, kind: t.kind, level: t.level, branch: t.branch, enc: false, fire: 0, bubble: bub });
      return this.towerObjs.get(t.id);
    }
    syncTowers(time) {
      const sim = this.sim;
      for (const t of sim.towers.values()) {
        let o = this.towerObjs.get(t.id);
        if (!o) o = this.createTowerObj(t);
        if (o.level !== t.level || o.branch !== t.branch) { this.rebuildTower(t); o = this.towerObjs.get(t.id); }
        const enc = sim.isEnc(t);
        if (enc !== o.enc) {
          o.enc = enc;
          this.setEncTint(o, enc);
        }
        // 朝向：拦截器面向其扇区；其他塔沿用默认
        let aim = t.angle;
        if (t.kind === 'interceptor') {
          o.model.update(time, { angle: aim });
          const tp = o.model.parts;
          if (tp.turret) tp.turret.rotation.y = -aim + Math.PI / 2;
          o.group.position.set(t.x, 0, t.z);
          if (t.flash > 0) tp.recoil = 0.12;
        } else {
          o.model.update(time, {});
        }
        // 受损与加密
        const hpk = t.hp / t.maxHp;
        if (o.model.parts.body) o.model.parts.body.position.y = 0.14 + (hpk < 0.35 ? Math.sin(time * 20) * 0.01 : 0);
        if (t.flash > 0) o.model.parts.ring && (o.model.parts.ring.material.emissiveIntensity = 3);
        else if (o.model.parts.ring) o.model.parts.ring.material.emissiveIntensity = 1.4;
        o.group.visible = true;
        if (o.bubble) { o.bubble.visible = t.shield > 0; if (t.shield > 0) o.bubble.material.opacity = 0.16 + 0.06 * Math.sin(time * 6); }
      }
      for (const [id, o] of this.towerObjs) {
        if (!sim.towers.has(id)) { this.mapGroup.remove(o.group); disposeTree(o.group); this.towerObjs.delete(id); }
      }
    }
    createEnemyObj(e) {
      const built = e.isBoss ? M.buildBoss(e.type) : M.buildEnemy(e.type, e.cloned);
      const obj = { group: new T.Group(), model: built, id: e.id, boss: e.isBoss, scale: e.isBoss ? (window.GAME_DATA.BOSSES[e.type].scale || 1.6) : 1 };
      obj.group.add(built.group);
      obj.group.scale.setScalar(obj.scale);
      obj.group.userData.enemy = e.id;
      built.group.traverse((m) => { m.userData.enemy = e.id; });
      if (!e.isBoss) {
        obj.group.traverse((m) => { if (m.castShadow !== undefined) m.castShadow = true; });
      }
      if (!e.isBoss && e.type !== 'packer') {
        const bub = new T.Mesh(new T.SphereGeometry(0.34, 14, 10), new T.MeshBasicMaterial({ color: 0x7cf9ff, transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending }));
        bub.position.y = 0.28; bub.visible = false;
        obj.group.add(bub);
        obj.bubble = bub;
      }
      this.mapGroup.add(obj.group);
      this.enemyObjs.set(e.id, obj);
      obj.seed = Math.random() * 6.28;
      return obj;
    }
    syncEnemies(time, dt) {
      const sim = this.sim;
      for (const e of sim.enemies.values()) {
        let o = this.enemyObjs.get(e.id);
        if (!o) o = this.createEnemyObj(e);
        const y = e.flying ? 2.1 + 0.25 * Math.sin(time * 3 + e.id) : 0;
        o.group.position.set(e.x, y, e.z);
        o.group.rotation.y = -e.heading + Math.PI / 2 * 0;
        const moving = e.b >= 0 && !e.blocker;
        const bob = moving ? Math.abs(Math.sin(time * 9 + e.id)) * 0.03 : 0;
        o.group.position.y = y + bob;
        let sc = o.scale || 1, ox = 0, oz = 0;
        if (o.lunge) {
          o.lunge.t += dt;
          const k = Math.min(1, o.lunge.t / 0.32);
          const amp = Math.sin(k * Math.PI) * 0.2;
          const L = Math.hypot(o.lunge.dx, o.lunge.dz) || 1;
          ox = (o.lunge.dx / L) * amp; oz = (o.lunge.dz / L) * amp;
          if (k >= 1) o.lunge = null;
        }
        if (o.hitT > 0) { o.hitT -= dt; sc *= 1 + 0.2 * (o.hitT / 0.2); }
        o.group.position.x += ox; o.group.position.z += oz;
        o.group.scale.setScalar(sc);
        const shielded = e.shield > 0;
        if (e.type === 'trojan') o.model.update(time, { revealed: !e.hiddenNow, seed: e.id, moving });
        else if (e.isBoss) {
          o.model.update(time, { phase: e.bossPhase, seed: e.id, moving });
          if (e.bossKind === 'zhenying') this.setStealth(o, e.hiddenNow ? 0.22 : 1);
        } else o.model.update(time, { moving, shielded, seed: e.id });
        if (o.bubble) { o.bubble.visible = e.shield > 0; if (e.shield > 0) o.bubble.material.opacity = 0.16 + 0.06 * Math.sin(time * 6 + e.id); }
        // 朝向：沿前进方向
        o.group.rotation.y = -e.heading + Math.PI / 2;
      }
      for (const [id, o] of this.enemyObjs) {
        if (!sim.enemies.has(id)) { this.mapGroup.remove(o.group); disposeTree(o.group); this.enemyObjs.delete(id); }
      }
    }

    // ---------- 主帧 ----------
    frame(dt, sim) {
      if (!this.warnGroup || !this.bgGroup) return;
      this.time += dt;
      this.updateParticles(dt);
      // 环
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        const k = Math.min(1, r.t / r.life);
        r.m.scale.setScalar(0.2 + k * r.r);
        r.m.material.opacity = 0.9 * (1 - k);
        if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
      }
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t += dt;
        b.m.material.opacity = Math.max(0, 0.9 * (1 - b.t / b.life));
        if (b.t >= b.life) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.beams.splice(i, 1); }
      }
      for (let i = this.projs.length - 1; i >= 0; i--) {
        const p = this.projs[i];
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        const to = p.toFn() || { x: p.from.x, y: p.from.y, z: p.from.z };
        const x = p.from.x + (to.x - p.from.x) * k;
        const y = p.from.y + (to.y - p.from.y) * k + Math.sin(k * Math.PI) * 0.3;
        const z = p.from.z + (to.z - p.from.z) * k;
        p.obj.position.set(x, y, z);
        const dxp = to.x - p.from.x, dzp = to.z - p.from.z;
        p.obj.rotation.set(0, Math.atan2(dxp, dzp), 0);
        const len = Math.hypot(to.x - p.from.x, to.y - p.from.y, to.z - p.from.z) * k;
        p.trail.scale.set(1, Math.max(0.01, len), 1);
        p.trail.position.set((p.from.x + x) / 2, (p.from.y + y) / 2, (p.from.z + z) / 2);
        p.trail.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x - p.from.x, y - p.from.y, z - p.from.z).normalize());
        if (k >= 1) {
          this.scene.remove(p.obj, p.trail); p.obj.geometry.dispose(); p.trail.geometry.dispose();
          this.projs.splice(i, 1);
          if (p.onDone) p.onDone();
        }
      }
      // 文字
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const tx = this.texts[i];
        tx.t += dt;
        tx.dy += dt * (tx.big ? 0.8 : 1.1);
        if (tx.t >= tx.life) this.texts.splice(i, 1);
      }
      // 路线闪烁
      for (const id in this.flashRoutes) {
        const o = this.routeObjs[id];
        const f = this.flashRoutes[id];
        if (o) o.material.uniforms.uFlash.value = Math.max(0, f);
        this.flashRoutes[id] -= dt;
        if (this.flashRoutes[id] <= 0) { delete this.flashRoutes[id]; if (o) o.material.uniforms.uFlash.value = 0; }
      }
      for (const id in this.routeObjs) this.routeObjs[id].material.uniforms.uTime.value = this.time;
      for (const o of this.previewObjs) o.material.uniforms.uTime.value = this.time;
      // 地图装饰
      for (const [c, o] of [...this.lockObjs]) {
        // 锁死：到期后移除
        if (!sim.lock.has(c)) { this.mapGroup.remove(o.m, o.e); disposeTree(o.m); disposeTree(o.e); this.lockObjs.delete(c); }
      }
      for (const [c, o] of [...this.holeObjs]) {
        o.t += dt;
        o.m.rotation.z += dt * 1.6;
        if (!sim.blackhole.has(c)) { this.mapGroup.remove(o.m); disposeTree(o.m); this.holeObjs.delete(c); }
      }
      if (this.cellObjs) {
        for (const c of sim.g.plats) {
          const o = this.cellObjs[c];
          if (o && o.ring) o.ring.material.opacity = 0.7 + 0.3 * Math.sin(this.time * 2 + c);
        }
      }
      // 降级 / 协议降级的链路：颜色
      if (this.exitObjs) for (const id in this.exitObjs) { this.exitObjs[id].ring.rotation.z += dt * 0.5; this.exitObjs[id].cap.position.y = 1.02 + Math.sin(this.time * 2) * 0.03; }
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.flowU) this.flowU.value = this.time;
      this.updateNodeEngage(sim);
      this.updateDying(dt);
      if (sim) this.updateDowngrade(sim);
      // 背景动画
      if (this.bgAnim) this.bgAnim(dt, this.time);
      // 单位同步
      this.syncTowers(this.time);
      this.syncEnemies(this.time, dt);
      this.updateWarnings(sim.warnings, this.time);
      this.updateCamera(dt);
      this.renderFX();
      this.drawOverlay(sim);
    }

    drawOverlay(sim) {
      const c = this.octx;
      const dpr = window.devicePixelRatio || 1;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, this.size.w, this.size.h);
      c.font = `bold 13px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // 单位血条与状态
      for (const e of sim.enemies.values()) {
        if (e.isBoss) continue;
        const [sx, sy] = this.toScreen(e.x, (e.flying ? 2.1 : 0.5) + 0.7, e.z);
        if (sy < -20 || sy > this.size.h + 20) continue;
        const hp = Math.max(0, e.hp / e.maxHp);
        if (hp < 1 || e.shield > 0) {
          c.fillStyle = 'rgba(0,0,0,0.6)';
          c.fillRect(sx - 18, sy - 3, 36, 6);
          c.fillStyle = hp > 0.5 ? '#6ef3a5' : hp > 0.25 ? '#ffd166' : '#ff5d73';
          c.fillRect(sx - 18, sy - 3, 36 * hp, 6);
          if (e.shield > 0) { c.fillStyle = '#7cf9ff'; c.fillRect(sx - 18, sy - 7, Math.min(36, e.shield / 2), 3); }
        }
        this.drawStatus(c, sx, sy - 14, e);
      }
      for (const t of sim.towers.values()) {
        const [sx, sy] = this.toScreen(t.x, 1.5, t.z);
        if (sy < -20 || sy > this.size.h + 20) continue;
        const hp = t.hp / t.maxHp;
        if (hp < 1 || t.shield > 0) {
          c.fillStyle = 'rgba(0,0,0,0.6)';
          c.fillRect(sx - 22, sy + 8, 44, 6);
          c.fillStyle = hp > 0.5 ? '#6ef3a5' : hp > 0.25 ? '#ffd166' : '#ff5d73';
          c.fillRect(sx - 22, sy + 8, 44 * hp, 6);
          if (t.shield > 0) { c.fillStyle = '#7cf9ff'; c.fillRect(sx - 22, sy + 15, Math.min(44, t.shield / 2), 3); }
        }
        if (sim.isEnc(t)) this.drawBadge(c, sx + 26, sy - 6, '#b07cff', '锁');
        if (t.blockers.size) this.drawBadge(c, sx - 26, sy - 6, '#ff9b4a', String(t.blockers.size));
      }
      // 应急隔离器：耐久与剩余有效期
      for (const [cell, iso] of sim.isolators) {
        const [sx, sy] = this.toScreen(sim.g.worldX(cell), 0.9, sim.g.worldZ(cell));
        if (sy < -20 || sy > this.size.h + 20) continue;
        c.fillStyle = 'rgba(6,14,28,0.85)';
        c.fillRect(sx - 40, sy - 26, 80, 30);
        c.strokeStyle = '#b388ff';
        c.lineWidth = 1;
        c.strokeRect(sx - 40, sy - 26, 80, 30);
        c.fillStyle = '#e8f6ff';
        c.font = `bold 12px ${FONT}`;
        c.fillText('隔离器 ' + Math.max(0, Math.ceil(iso.hp)) + ' 耐久', sx, sy - 16);
        c.fillStyle = '#b388ff';
        c.fillText('有效 ' + Math.max(0, Math.ceil(iso.life)) + ' 秒', sx, sy - 4);
      }
      for (const tx of this.texts) {
        const p = 1 - tx.t / tx.life;
        const [sx, sy] = this.toScreen(tx.x, tx.y + tx.dy * 0.6, tx.z);
        c.globalAlpha = Math.min(1, p * 2.2);
        c.font = tx.big ? `bold 22px ${FONT}` : `bold 15px ${FONT}`;
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(4,10,20,0.9)';
        c.strokeText(tx.text, sx, sy - tx.dy * 20);
        c.fillStyle = tx.color;
        c.fillText(tx.text, sx, sy - tx.dy * 20);
        c.globalAlpha = 1;
      }
      // 实体标签（入口名称由三维标签完成）
      if (this.overlayExtra) this.overlayExtra(c, this);
    }
    drawBadge(c, x, y, color, text) {
      c.fillStyle = color;
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#081018';
      c.font = `bold 12px ${FONT}`;
      c.fillText(text, x, y + 0.5);
    }
    drawStatus(c, x, y, e) {
      const icons = [];
      if (e.hiddenNow && !e.isBoss) icons.push(['#ffd166', '?']);
      if (e.trapT > 0) icons.push(['#ffd166', '网']);
      if (e.slowT > 0) icons.push(['#9fe8ff', '缓']);
      if (e.suppressT > 0) icons.push(['#9fe8ff', '压']);
      if (e.blocker) icons.push(['#ff9b4a', '阻']);
      let ox = x - (icons.length - 1) * 8;
      for (const [col, txt] of icons) {
        c.fillStyle = 'rgba(6,14,28,0.85)';
        c.beginPath(); c.arc(ox, y, 7.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = col;
        c.font = `bold 11px ${FONT}`;
        c.fillText(txt, ox, y + 0.5);
        ox += 16;
      }
    }
  }

  window.View = View;
  window.VIEW_THEMES = THEMES;
  window.canvasTex = canvasTex;
  window.labelSprite = labelSprite;
  window.roundRect = roundRect;
  window.FONT_FAMILY = FONT;
})();
