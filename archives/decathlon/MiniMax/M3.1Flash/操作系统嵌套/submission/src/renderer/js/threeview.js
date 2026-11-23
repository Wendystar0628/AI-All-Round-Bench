/*
 * 三维显示设备：接收程序提交的场景资源与逐次场景状态，绘制画面。
 * 设备本身不推进场景状态——相同提交得到相同画面。
 */
import * as THREE from '../vendor/three.module.js';

const NOS = (globalThis.NOS = globalThis.NOS || {});

/* ---------- 可重复的伪随机 ---------- */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 贴图生成 ---------- */
function liveryTexture(spec) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const base = spec.base || '#6b2fb5';
  const accent = spec.accent || '#f5c518';
  const num = spec.number || '24';
  g.fillStyle = base; g.fillRect(0, 0, 1024, 256);
  // 顶部与底部黄色识别带
  g.fillStyle = accent;
  g.fillRect(0, 18, 1024, 26);
  g.fillRect(0, 212, 1024, 20);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 120, 1024, 16);
  // 机身两侧的数字 24（左右各一处，随表面受光）
  g.font = 'bold 150px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [256, 768]) {
    g.save();
    g.translate(x, 132);
    g.fillStyle = accent;
    g.fillText(num, 0, 0);
    g.lineWidth = 6; g.strokeStyle = 'rgba(20,10,40,0.85)';
    g.strokeText(num, 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function helipadTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#3c4356'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#e8eef8'; g.lineWidth = 16;
  g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 34;
  g.beginPath();
  g.moveTo(180, 150); g.lineTo(180, 362);
  g.moveTo(332, 150); g.lineTo(332, 362);
  g.moveTo(180, 256); g.lineTo(332, 256);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function skyTexture(sky) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, sky.top || '#16204a');
  grd.addColorStop(0.55, sky.mid || '#4a5a94');
  grd.addColorStop(1, sky.bottom || '#f0a35e');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function buildingTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color || '#5c6178'; g.fillRect(0, 0, 128, 256);
  for (let y = 18; y < 240; y += 34) {
    for (let x = 14; x < 116; x += 30) {
      g.fillStyle = (Math.random() > 0.55) ? '#ffd98a' : '#20243a';
      g.fillRect(x, y, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 几何构建 ---------- */
function buildShape(shape) {
  const t = shape.type;
  if (t === 'box') return new THREE.BoxGeometry(shape.w || 1, shape.h || 1, shape.d || 1);
  if (t === 'sphere') return new THREE.SphereGeometry(shape.r || 1, shape.seg || 20, shape.seg2 || 14);
  if (t === 'cylinder') return new THREE.CylinderGeometry(shape.rt || shape.r || 1, shape.rb || shape.r || 1, shape.h || 1, shape.seg || 18);
  if (t === 'cone') return new THREE.ConeGeometry(shape.r || 1, shape.h || 1, shape.seg || 16);
  if (t === 'capsule') return new THREE.CapsuleGeometry(shape.r || 1, shape.len || 1, 8, 20);
  if (t === 'plane') return new THREE.PlaneGeometry(shape.w || 1, shape.h || 1);
  if (t === 'torus') return new THREE.TorusGeometry(shape.r || 1, shape.tube || 0.2, 10, 26);
  return new THREE.BoxGeometry(1, 1, 1);
}

export class ThreeView {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.parts = new Map();
    this.resource = null;
    this.state = null;
    this.particles = null;
    this.debris = [];
    this.dust = null;
    this.clock = new THREE.Clock();
    this.anim = 0;
    this.pickables = [];
    this.onPick = null;
    this._init();
  }
  _init() {
    const w = Math.max(64, this.container.clientWidth || 480);
    const h = Math.max(64, this.container.clientHeight || 320);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'three-canvas';
    this.renderer.domElement.setAttribute('data-testid', 'player-view');
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.handlePick(e));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 900);
    this.camera.position.set(26, 14, 34);
    this.camera.lookAt(0, 3, 0);
    this._smokeTex = smokeTexture();
    this.resize();
  }
  resize() {
    if (!this.renderer) return;
    const w = Math.max(64, this.container.clientWidth || 480);
    const h = Math.max(64, this.container.clientHeight || 320);
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.parts.clear();
    this.pickables = [];
  }
  /* ---------- 资源装载 ---------- */
  setResource(res) {
    this.resource = res;
    this.clearScene();
    const scene = this.scene;
    const sky = res.sky || {};
    scene.background = skyTexture(sky);
    if (sky.fog) scene.fog = new THREE.Fog(new THREE.Color(sky.fog), sky.fogNear || 70, sky.fogFar || 300);

    // 地形
    const terr = res.terrain || {};
    const size = terr.size || 420, seg = terr.segments || 110;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const rnd = mulberry(terr.seed || 11);
    const hills = [];
    for (let i = 0; i < 7; i++) hills.push({ x: (rnd() - 0.5) * size * 0.75, z: (rnd() - 0.5) * size * 0.75, r: 40 + rnd() * 90, h: 6 + rnd() * 26 });
    const flats = (terr.flatten || []).concat(res.helipads || []);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = 0;
      for (const hill of hills) {
        const d = Math.hypot(x - hill.x, z - hill.z) / hill.r;
        if (d < 1) y += hill.h * (1 - d * d) * (1 - d * d);
      }
      y += Math.sin(x * 0.07) * 0.7 + Math.cos(z * 0.05) * 0.6;
      for (const f of flats) {
        const d = Math.hypot(x - f.x, z - f.z) / (f.r || 12);
        if (d < 1) y *= (1 - d) * (1 - d);
      }
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: (res.ground && res.ground.color) || '#4e6b39', roughness: 0.95, metalness: 0,
    }));
    ground.receiveShadow = true;
    ground.name = 'terrain';
    scene.add(ground);
    this.terrain = ground;

    // 停机坪
    for (const pad of (res.helipads || [])) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(pad.r || 9, pad.r || 9, 0.22, 40), new THREE.MeshStandardMaterial({
        map: helipadTexture(), roughness: 0.85,
      }));
      m.position.set(pad.x || 0, 0.12, pad.z || 0);
      m.receiveShadow = true;
      scene.add(m);
    }

    // 建筑与树木
    const props = res.props || [];
    const treeGeo = new THREE.ConeGeometry(1.6, 6.4, 7);
    const treeMat = new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.42, 2.4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4028', roughness: 1 });
    for (const p of props) {
      if (p.type === 'building') {
        const geo2 = new THREE.BoxGeometry(p.w || 8, p.h || 14, p.d || 8);
        const mat = new THREE.MeshStandardMaterial({ map: buildingTexture(p.color), roughness: 0.8 });
        const m = new THREE.Mesh(geo2, mat);
        m.position.set(p.x || 0, (p.h || 14) / 2, p.z || 0);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      } else if (p.type === 'tree') {
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(p.x || 0, 1.2, p.z || 0);
        trunk.castShadow = true;
        scene.add(trunk);
        const top = new THREE.Mesh(treeGeo, treeMat);
        top.position.set(p.x || 0, 4.6, p.z || 0);
        top.scale.setScalar(p.s || 1);
        top.castShadow = true;
        scene.add(top);
      } else if (p.type === 'rock') {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r || 1.4, 0), new THREE.MeshStandardMaterial({ color: '#7b7d86', roughness: 1 }));
        m.position.set(p.x || 0, (p.r || 1.4) * 0.6, p.z || 0);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      }
    }

    // 灯光
    for (const l of (res.lights || [])) {
      if (l.type === 'directional') {
        const sun = new THREE.DirectionalLight(new THREE.Color(l.color || '#ffd9a0'), l.intensity || 2.0);
        sun.position.set(l.pos ? l.pos[0] : 120, l.pos ? l.pos[1] : 180, l.pos ? l.pos[2] : 80);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const d = 90;
        sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
        sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
        sun.shadow.bias = -0.0008;
        scene.add(sun);
        scene.add(sun.target);
        this.sun = sun;
      } else if (l.type === 'hemisphere') {
        scene.add(new THREE.HemisphereLight(new THREE.Color(l.sky || '#9fb6ff'), new THREE.Color(l.ground || '#3b4a2a'), l.intensity || 0.7));
      }
    }

    // 直升机部件
    for (const part of (res.parts || [])) {
      if (part.shape && part.shape.type === 'disc') continue;   // 旋翼盘单独绘制
      const mesh = new THREE.Mesh(buildShape(part.shape || {}), this.materialFor(part.material || {}, res));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = part.id;
      const t = part.transform || {};
      const holder = new THREE.Group();
      holder.name = part.id + ':holder';
      holder.add(mesh);
      if (t.pos) holder.position.set(t.pos[0], t.pos[1], t.pos[2]);
      if (t.rot) holder.rotation.set(t.rot[0], t.rot[1], t.rot[2]);
      if (t.scale) holder.scale.set(t.scale[0], t.scale[1], t.scale[2]);
      const parent = part.parent && this.parts.has(part.parent) ? this.parts.get(part.parent).holder : scene;
      parent.add(holder);
      this.parts.set(part.id, { holder, mesh, spec: part });
      this.pickables.push(mesh);
      mesh.userData.partId = part.id;
    }
    // 旋翼盘（半透明圆盘，随转速出现）
    const rotorDiscSpec = (res.parts || []).find((p) => p.shape && p.shape.type === 'disc');
    if (rotorDiscSpec) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(rotorDiscSpec.shape.r || 6.4, 40),
        new THREE.MeshBasicMaterial({ color: 0xcfd6e6, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(disc);
      const parent = rotorDiscSpec.parent && this.parts.has(rotorDiscSpec.parent) ? this.parts.get(rotorDiscSpec.parent).holder : scene;
      holder.position.set(0, 0, 0);
      parent.add(holder);
      this.rotorDisc = holder;
    }
    return this;
  }
  materialFor(mat, res) {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(mat.color || '#8a8f9c'),
      roughness: mat.roughness === undefined ? 0.6 : mat.roughness,
      metalness: mat.metalness === undefined ? 0.05 : mat.metalness,
    });
    if (mat.emissive) { m.emissive = new THREE.Color(mat.emissive); m.emissiveIntensity = mat.emissiveIntensity || 1; }
    if (mat.texture === 'livery') {
      m.map = liveryTexture({ base: mat.base, accent: mat.accent, number: mat.number });
      m.roughness = 0.42; m.metalness = 0.12;
    } else if (mat.texture === 'glass') {
      m.color = new THREE.Color(mat.color || '#1b2440');
      m.roughness = 0.08; m.metalness = 0.7; m.transparent = true; m.opacity = 0.72;
    }
    return m;
  }
  clearScene() {
    const scene = this.scene;
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const c = scene.children[i];
      scene.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }
    this.parts.clear();
    this.pickables = [];
    this.rotorDisc = null;
  }
  /* ---------- 状态提交 ---------- */
  setState(state) {
    this.state = state;
    if (!state) return;
    const parts = state.parts || {};
    for (const id of Object.keys(parts)) {
      const rec = this.parts.get(id);
      if (!rec) continue;
      const p = parts[id];
      if (p.pos) rec.holder.position.set(p.pos[0], p.pos[1], p.pos[2]);
      if (p.rot) rec.holder.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      if (p.scale) rec.holder.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      if (p.spin !== undefined) {
        if (p.axis === 'x') rec.holder.rotation.x += p.spin;
        else if (p.axis === 'z') rec.holder.rotation.z += p.spin;
        else rec.holder.rotation.y += p.spin;
      }
      if (p.visible === false) rec.holder.visible = false;
      if (p.visible === true) rec.holder.visible = true;
    }
    // 损坏表现
    const dmg = state.damage || {};
    for (const id of Object.keys(dmg)) {
      const rec = this.parts.get(id);
      if (!rec) continue;
      const d = Math.max(0, Math.min(1, dmg[id]));
      rec.mesh.material.color = rec.mesh.material.color.clone().lerp(new THREE.Color('#2b2b30'), d * 0.8);
      if (d >= 1) rec.holder.visible = false;
    }
    // 相机
    const cam = state.camera;
    if (cam) {
      if (cam.pos) this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
      if (cam.target) this.camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
      if (cam.fov) { this.camera.fov = cam.fov; this.camera.updateProjectionMatrix(); }
    }
    this.updateParticles(state);
    this.updateDebris(state);
  }
  updateParticles(state) {
    const list = state.particles || [];
    if (!this.particles) {
      const MAX = 900;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      const mat = new THREE.PointsMaterial({
        map: this._smokeTex, transparent: true, depthWrite: false, size: 2, sizeAttenuation: true,
        vertexColors: true, opacity: 0.85,
      });
      this.particles = new THREE.Points(geo, mat);
      this.particles.frustumCulled = false;
      this.scene.add(this.particles);
      this.pmax = MAX;
    }
    const geo = this.particles.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const sizes = geo.attributes.size.array;
    const n = Math.min(list.length, this.pmax);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      pos[i * 3] = p.pos[0]; pos[i * 3 + 1] = p.pos[1]; pos[i * 3 + 2] = p.pos[2];
      const c = new THREE.Color(p.color || '#8b8b95');
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      sizes[i] = p.size || 2;
    }
    for (let i = n; i < this.pmax; i++) { pos[i * 3 + 1] = -9999; sizes[i] = 0; }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    this.particles.material.size = 2;
  }
  updateDebris(state) {
    const list = state.debris || [];
    while (this.debris.length < list.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: '#5d3f96', roughness: 0.7 }));
      m.castShadow = true;
      this.scene.add(m);
      this.debris.push(m);
    }
    for (let i = 0; i < this.debris.length; i++) {
      const m = this.debris[i];
      const d = list[i];
      if (!d) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(d.pos[0], d.pos[1], d.pos[2]);
      m.rotation.set(d.rot ? d.rot[0] : 0, d.rot ? d.rot[1] : 0, d.rot ? d.rot[2] : 0);
      m.scale.setScalar(d.size || 1);
    }
  }
  /* ---------- 拾取 ---------- */
  handlePick(e) {
    if (!this.onPick) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    if (hits.length) {
      const id = hits[0].object.userData.partId;
      this.onPick({ part: id, point: [hits[0].point.x, hits[0].point.y, hits[0].point.z], kind: 'part' });
    } else {
      // 地面点选
      const groundHits = ray.intersectObject(this.terrain, false);
      if (groundHits.length) {
        this.onPick({ part: '', point: [groundHits[0].point.x, groundHits[0].point.y, groundHits[0].point.z], kind: 'ground' });
      }
    }
  }
  render(dt) {
    if (!this.renderer) return;
    this.anim += dt;
    if (this.rotorDisc) {
      const sp = this.state && this.state.rotorSpeed ? this.state.rotorSpeed : 0;
      this.rotorDisc.material.opacity = Math.min(0.34, 0.06 + sp * 0.00012);
      this.rotorDisc.rotation.z += dt * 2.2;
    }
    if (this.sun && this.state && this.state.sunTarget) {
      this.sun.target.position.set(this.state.sunTarget[0], this.state.sunTarget[1], this.state.sunTarget[2]);
      this.sun.position.set(this.state.sunTarget[0] + 90, this.state.sunTarget[1] + 120, this.state.sunTarget[2] + 60);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

NOS.ThreeView = ThreeView;
NOS.sceneTools = { liveryTexture, helipadTexture, smokeTexture, mulberry };
