// ===========================================================================
//  scene3d.js —— 显示设备的三维部分
//  按场景资源（几何、材质、贴图、灯光、镜头、部件层级）构建画面；
//  逐次提交的场景状态（部件位姿、损坏、相机、粒子发射）决定这一帧的画面。
//  设备不推进场景状态：相同的提交得到相同的画面。
// ===========================================================================
(function () {
  const THREE = window.require('three');

  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi + yi * 57), b = hash(xi + 1 + yi * 57), c = hash(xi + (yi + 1) * 57), d = hash(xi + 1 + (yi + 1) * 57);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y, oct) {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { s += noise2(x * f, y * f) * amp; f *= 2; amp *= 0.5; }
    return s;
  }

  function makeDecalTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 160);
    g.font = '900 128px "MiSans", "HarmonyOS Sans SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(30,16,4,0.55)';
    g.strokeText(text, 128, 84);
    g.fillStyle = color;
    g.fillText(text, 128, 84);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function softTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  class Scene3D {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 900);
      this.scene = new THREE.Scene();
      this.built = new Map();
      this.soft = softTexture();
      this.debrisPool = [];
      this.particleSystems = {};
      this._tmp = new THREE.Vector3();
    }
    resize(w, h) {
      const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.renderer.setSize(W, H, false);
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
      }
    }
    // ---- 由资源构建场景（按资源内容缓存） ----
    build(key, res, fsRead) {
      if (this.built.has(key)) return this.built.get(key);
      const scene = new THREE.Scene();
      const env = res.env || {};
      const sky = env.sky || { top: '#141b3d', bottom: '#e79a5c', sun: [70, 46, -90], sunColor: '#ffd9a8', fog: '#3a4066', fogNear: 90, fogFar: 300, ambient: 0.42, sunI: 2.4 };
      scene.fog = new THREE.Fog(new THREE.Color(sky.fog || '#3a4066'), sky.fogNear || 90, sky.fogFar || 300);
      // 天空
      const skyGeo = new THREE.SphereGeometry(700, 32, 20);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: new THREE.Color(sky.top || '#141b3d') }, bottom: { value: new THREE.Color(sky.bottom || '#e79a5c') }, off: { value: 0.18 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float off; varying vec3 vP; void main(){ float h = normalize(vP).y; float k = smoothstep(-0.05, 0.55, h); vec3 c = mix(bottom, top, k); gl_FragColor = vec4(c, 1.0); }'
      });
      scene.add(new THREE.Mesh(skyGeo, skyMat));
      // 光
      const sunPos = new THREE.Vector3(...(sky.sun || [70, 46, -90]));
      const sun = new THREE.DirectionalLight(new THREE.Color(sky.sunColor || '#ffd9a8'), sky.sunI || 2.4);
      sun.position.copy(sunPos);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
      sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
      sun.shadow.bias = -0.0009;
      scene.add(sun);
      scene.add(sun.target);
      scene.add(new THREE.AmbientLight(new THREE.Color('#9fb4ff'), sky.ambient == null ? 0.42 : sky.ambient));
      const hemi = new THREE.HemisphereLight(new THREE.Color('#8fa6ff'), new THREE.Color('#3a2f28'), 0.55);
      scene.add(hemi);
      // 地形
      const ter = res.terrain || { size: 340, segments: 110, height: 3.2, seed: 11, color: '#3d5a3c', color2: '#5b7a4e' };
      const tg = new THREE.PlaneGeometry(ter.size || 340, ter.size || 340, ter.segments || 110, ter.segments || 110);
      tg.rotateX(-Math.PI / 2);
      const pos = tg.attributes.position;
      const cols = [];
      const c1 = new THREE.Color(ter.color || '#3d5a3c'), c2 = new THREE.Color(ter.color2 || '#5b7a4e');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const d = Math.sqrt(x * x + z * z);
        let h = (fbm(x * 0.02 + (ter.seed || 0), z * 0.02, 4) - 0.5) * (ter.height || 3.2) * 2;
        if (d > 60) h += (d - 60) * 0.02;
        if (d < 14) h *= 0.15;
        pos.setY(i, h);
        const k = fbm(x * 0.08, z * 0.08, 3);
        const col = c1.clone().lerp(c2, k);
        cols.push(col.r, col.g, col.b);
      }
      tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      tg.computeVertexNormals();
      const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 }));
      terrain.receiveShadow = true;
      scene.add(terrain);
      // 停机坪
      for (const p of (res.pads || [])) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.15, 0.22, 40), new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.85, metalness: 0.1 }));
        pad.position.set(p.pos[0], (p.pos[1] || 0) + 0.1, p.pos[2]);
        pad.receiveShadow = true; pad.castShadow = true;
        scene.add(pad);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r * 0.82, 0.13, 6, 48), new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.6, emissive: '#3a2c00', emissiveIntensity: 0.4 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.pos[0], (p.pos[1] || 0) + 0.23, p.pos[2]);
        scene.add(ring);
        const inner = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.16, p.r * 0.24, 32), new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.7, side: THREE.DoubleSide }));
        inner.rotation.x = -Math.PI / 2;
        inner.position.set(p.pos[0], (p.pos[1] || 0) + 0.225, p.pos[2]);
        scene.add(inner);
      }
      // 树木（实例化）
      const props = res.props || [];
      if (props.length) {
        const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5);
        const leafG = new THREE.ConeGeometry(1.1, 2.6, 7);
        const trunkM = new THREE.MeshStandardMaterial({ color: '#4a3423', roughness: 0.9 });
        const leafM = new THREE.MeshStandardMaterial({ color: '#2f5a35', roughness: 0.9 });
        const trunks = new THREE.InstancedMesh(trunkG, trunkM, props.length);
        const leaves = new THREE.InstancedMesh(leafG, leafM, props.length);
        trunks.castShadow = true; leaves.castShadow = true;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
        props.forEach((p, i) => {
          const sc = p.s || 1;
          s.set(sc, sc, sc); q.identity();
          v.set(p.pos[0], 0.6 * sc, p.pos[2]); m.compose(v, q, s); trunks.setMatrixAt(i, m);
          v.set(p.pos[0], 2.3 * sc, p.pos[2]); m.compose(v, q, s); leaves.setMatrixAt(i, m);
        });
        scene.add(trunks); scene.add(leaves);
      }
      // 模型部件
      const parts = {};
      const heli = res.heli || { root: null, parts: [] };
      const mkMat = (mm) => {
        const m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(mm.color || '#888888'), roughness: mm.rough == null ? 0.6 : mm.rough,
          metalness: mm.metal == null ? 0.2 : mm.metal
        });
        if (mm.emissive) { m.emissive = new THREE.Color(mm.emissive); m.emissiveIntensity = mm.emissiveI || 1; }
        return m;
      };
      for (const pd of (heli.parts || [])) {
        const g = pd.geo || {};
        let geo;
        if (g.type === 'box') geo = new THREE.BoxGeometry(g.size[0], g.size[1], g.size[2]);
        else if (g.type === 'sphere') geo = new THREE.SphereGeometry(g.r || 0.5, 20, 14);
        else if (g.type === 'cylinder') {
          geo = new THREE.CylinderGeometry(g.r || 0.3, g.r2 == null ? (g.r || 0.3) : g.r2, g.h || 1, 18);
          if (g.axis === 'z') geo.rotateX(Math.PI / 2);
          else if (g.axis === 'x') geo.rotateZ(Math.PI / 2);
        } else if (g.type === 'cone') geo = new THREE.ConeGeometry(g.r || 0.5, g.h || 1, 16);
        else if (g.type === 'decal') {
          geo = new THREE.CylinderGeometry(g.rad || 0.97, g.rad || 0.97, g.h || 0.72, 18, 1, true, -(g.arc || 1.1) / 2, g.arc || 1.1);
          geo.rotateX(Math.PI / 2);
          geo.rotateY(Math.PI / 2);
        } else geo = new THREE.BoxGeometry(1, 1, 1);
        let mat;
        if (g.type === 'decal') {
          mat = new THREE.MeshStandardMaterial({ map: makeDecalTexture(g.text || '24', (pd.mat && pd.mat.color) || '#f5c542'), transparent: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        } else mat = mkMat(pd.mat || {});
        const mesh = new THREE.Mesh(geo, mat);
        if (pd.pos) mesh.position.set(pd.pos[0], pd.pos[1], pd.pos[2]);
        if (pd.rot) mesh.rotation.set(pd.rot[0], pd.rot[1], pd.rot[2]);
        if (pd.scale) mesh.scale.set(pd.scale[0], pd.scale[1], pd.scale[2]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        if (pd.tip) {
          const tipG = new THREE.BoxGeometry(0.5, 0.055, 0.31);
          const tip = new THREE.Mesh(tipG, mkMat({ color: pd.tip, rough: 0.5 }));
          tip.position.set(pd.pos[0] > 0 ? 2.05 : -2.05, 0, 0);
          if (pd.pos[2]) { tip.position.set(0, 0, pd.pos[2] > 0 ? 2.05 : -2.05); tip.scale.set(0.62, 1, 1); }
          mesh.add(tip);
        }
        parts[pd.name] = { mesh: mesh, def: pd };
      }
      // 层级
      const roots = [];
      for (const name in parts) {
        const p = parts[name];
        if (p.def.parent && parts[p.def.parent]) parts[p.def.parent].mesh.add(p.mesh);
        else { scene.add(p.mesh); roots.push(p.mesh); }
      }
      const built = { scene, sun, parts, roots, res };
      this.built.set(key, built);
      return built;
    }
    // ---- 粒子 ----
    particles(kind, n, color, size, opacity, additive) {
      if (this.particleSystems[kind]) return this.particleSystems[kind];
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: new THREE.Color(color), size, map: this.soft, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      this.particleSystems[kind] = { pts, pos, n, geo: g };
      return this.particleSystems[kind];
    }
    updateParticles(kind, emit, t, color) {
      const sys = this.particles[kind] || this.particles(kind, 220, color || '#c9b48a', kind === 'fire' ? 1.4 : 2.2, kind === 'fire' ? 0.9 : 0.5, kind === 'fire');
      const arr = sys.pos;
      const n = sys.n;
      const on = emit && emit.on;
      const rate = on ? (emit.rate || 0) : 0;
      for (let i = 0; i < n; i++) {
        const h1 = hash(i * 3.1 + 0.7), h2 = hash(i * 7.7 + 1.3), h3 = hash(i * 11.3 + 2.9);
        const life = kind === 'dust' ? 2.4 : (kind === 'smoke' ? 3.6 : 0.9);
        const seed = h1;
        const age = ((t * (0.55 + h2 * 0.6) + seed * life) % life);
        const k = age / life;
        const active = rate > 0 && (h3 < rate);
        let x = 0, y = -999, z = 0;
        if (active && emit.pos) {
          const ang = h1 * Math.PI * 2;
          const spd = kind === 'dust' ? (2.5 + h2 * 4) : (kind === 'smoke' ? (0.5 + h2 * 1.2) : (0.3 + h2 * 0.9));
          const r = age * spd;
          x = emit.pos[0] + Math.cos(ang) * r * (kind === 'dust' ? 1 : 0.45);
          z = emit.pos[2] + Math.sin(ang) * r * (kind === 'dust' ? 1 : 0.45);
          y = emit.pos[1] + age * (kind === 'dust' ? 0.55 : (kind === 'smoke' ? 1.5 : 1.1)) * (0.6 + h3);
          if (emit.wind) { x += emit.wind[0] * age * 0.8; z += emit.wind[1] * age * 0.8; }
        }
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      sys.geo.attributes.position.needsUpdate = true;
      return sys.pts;
    }
    // ---- 渲染一帧 ----
    render(key, res, state, fx, w, h) {
      const B = this.build(key, res);
      this.resize(w, h);
      const scene = B.scene;
      // 相机
      const cam = state.cam || { pos: [26, 14, 26], target: [0, 2, 0], fov: 46 };
      this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      this.camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
      if (cam.fov && this.camera.fov !== cam.fov) { this.camera.fov = cam.fov; this.camera.updateProjectionMatrix(); }
      // 机体
      const air = state.aircraft || { pos: [0, 0.55, 0], yaw: 0, pitch: 0, roll: 0 };
      const root = B.parts[B.res.heli && B.res.heli.root] || B.parts[Object.keys(B.parts)[0]];
      const anim = state.anim || {};
      for (const name in B.parts) {
        const p = B.parts[name];
        if (p.def.parent) continue;
        p.mesh.position.set((p.def.pos ? p.def.pos[0] : 0) + air.pos[0], (p.def.pos ? p.def.pos[1] : 0) + air.pos[1], (p.def.pos ? p.def.pos[2] : 0) + air.pos[2]);
        p.mesh.rotation.set((p.def.rot ? p.def.rot[0] : 0) + (air.roll || 0), (p.def.rot ? p.def.rot[1] : 0) + (air.yaw || 0), (p.def.rot ? p.def.rot[2] : 0) + (air.pitch || 0), 'YXZ');
      }
      // 旋转部件
      for (const name in B.parts) {
        const p = B.parts[name];
        if (p.def.spin && anim.rotor != null) {
          if (p.def.spin === 'y') p.mesh.rotation.y = anim.rotor;
          else if (p.def.spin === 'x') p.mesh.rotation.x = anim.tail != null ? anim.tail : anim.rotor * 4;
          else p.mesh.rotation.z = anim.rotor;
        }
      }
      // 损坏：抖动 + 变形
      if (anim.crashed) {
        for (const name in B.parts) {
          if (name === 'body') continue;
          const p = B.parts[name];
          p.mesh.rotation.z += Math.sin(name.length * 3.1) * 0.25;
          p.mesh.position.y -= 0.15;
        }
      }
      // 碎片
      const debris = state.debris || [];
      while (this.debrisPool.length < debris.length) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: ['#6d3fb0', '#f5c542', '#2b2e37'][this.debrisPool.length % 3], roughness: 0.6, metalness: 0.4 }));
        m.castShadow = true;
        scene.add(m);
        this.debrisPool.push(m);
      }
      for (let i = 0; i < this.debrisPool.length; i++) {
        const m = this.debrisPool[i];
        if (i < debris.length) {
          const d = debris[i];
          m.visible = true;
          m.position.set(d.p[0], d.p[1], d.p[2]);
          m.rotation.set(d.r[0], d.r[1], d.r[2]);
          m.scale.set(d.s[0], d.s[1], d.s[2]);
        } else m.visible = false;
      }
      // 粒子
      const t = state.t || 0;
      const fxState = fx || { dust: { on: false }, smoke: { on: false }, fire: { on: false } };
      const dust = this.updateParticles('dust', fxState.dust, t, '#b9a887');
      const smoke = this.updateParticles('smoke', fxState.smoke, t, '#5a5f6b');
      const fire = this.updateParticles('fire', fxState.fire, t, '#ff8a3a');
      if (!dust.parent) { scene.add(dust); scene.add(smoke); scene.add(fire); }
      // 太阳阴影跟随
      B.sun.position.set(air.pos[0] + 70, 46, air.pos[2] - 90);
      B.sun.target.position.set(air.pos[0], 0, air.pos[2]);
      B.sun.target.updateMatrixWorld();
      this.renderer.render(scene, this.camera);
      return this.canvas;
    }
  }

  window.Scene3D = Scene3D;
})();
