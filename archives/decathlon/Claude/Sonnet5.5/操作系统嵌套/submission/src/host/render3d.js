// 三维显示设备：按程序提交的场景资源（数据）与每一时刻的场景状态绘制画面，不推进任何状态。
// 相同的提交得到相同的画面；烟、火、尘等细节只是提交时刻与发射参数的纯函数。
// 全部三维视图共用一个 WebGL 上下文（逐个视图绘制后复制到各自的二维画布），所以同时打开多少个视图都不会触发上下文上限。
import * as THREE from '../vendor/three.module.min.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function hash(n, seed) { const s = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- 贴图：按描述生成（贴图是数据，不含代码）
function makeTexture(d) {
  const size = d.size || 256; const c = document.createElement('canvas'); c.width = d.w || size; c.height = d.h || size; const g = c.getContext('2d');
  const W = c.width, H = c.height; let rnd = (d.seed || 1) * 9301 + 49297; const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  if (d.type === 'noise') {
    g.fillStyle = d.base || '#4a8a3a'; g.fillRect(0, 0, W, H);
    const n = d.dots || 5000;
    for (let i = 0; i < n; i++) { const a = (rand() - 0.5) * (d.variation || 0.3); g.fillStyle = a > 0 ? `rgba(255,255,255,${a * 0.5})` : `rgba(0,0,0,${-a * 0.7})`; const s = 1 + rand() * (d.grain || 3); g.fillRect(rand() * W, rand() * H, s, s); }
  } else if (d.type === 'text') {
    g.clearRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.rotate((d.rot || 0) * Math.PI / 180); g.scale(d.flipX ? -1 : 1, d.flipY ? -1 : 1);
    g.font = d.font || '900 180px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (d.stroke) { g.lineWidth = d.strokeW || 10; g.strokeStyle = d.stroke; g.lineJoin = 'round'; g.strokeText(d.text, 0, 0); }
    g.fillStyle = d.fill || '#ffd21f'; g.fillText(d.text, 0, 0); g.restore();
  } else if (d.type === 'windows') {
    g.fillStyle = d.base || '#3b3350'; g.fillRect(0, 0, W, H);
    const cols = d.cols || 6, rows = d.rows || 8, mx = 10, my = 10, cw = (W - mx * 2) / cols, ch = (H - my * 2) / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const lit = rand() < (d.lit || 0.35); g.fillStyle = lit ? '#ffd978' : '#1e1a30'; g.fillRect(mx + q * cw + 4, my + r * ch + 4, cw - 8, ch - 8); }
  } else if (d.type === 'pad') {
    g.fillStyle = d.base || '#4a4660'; g.fillRect(0, 0, W, H);
    g.strokeStyle = d.ring || '#ffc83d'; g.lineWidth = W * 0.035; g.beginPath(); g.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2); g.stroke();
    g.fillStyle = d.ring || '#ffc83d'; g.font = `900 ${W * 0.46}px "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.letter || 'H', W / 2, H / 2 + W * 0.02);
  } else if (d.type === 'checker') {
    const n = d.n || 8; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? (d.a || '#888') : (d.b || '#444'); g.fillRect(x * W / n, y * H / n, W / n + 1, H / n + 1); }
  } else { g.fillStyle = d.base || '#888'; g.fillRect(0, 0, W, H); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (d.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(d.repeat[0], d.repeat[1]); }
  return t;
}

// ---------------------------------------------------------------- 几何：只有通用图元
function makeGeometry(d) {
  switch (d.type) {
    case 'box': return new THREE.BoxGeometry(d.size[0], d.size[1], d.size[2]);
    case 'sphere': return new THREE.SphereGeometry(d.r, d.seg || 20, d.seg2 || 14);
    case 'cylinder': return new THREE.CylinderGeometry(d.rt === undefined ? d.r : d.rt, d.rb === undefined ? d.r : d.rb, d.h, d.seg || 16);
    case 'cone': return new THREE.ConeGeometry(d.r, d.h, d.seg || 12);
    case 'capsule': return new THREE.CapsuleGeometry(d.r, d.h, 6, d.seg || 12);
    case 'plane': return new THREE.PlaneGeometry(d.size[0], d.size[1]);
    case 'circle': return new THREE.CircleGeometry(d.r, d.seg || 40);
    case 'lathe': return new THREE.LatheGeometry(d.profile.map((p) => new THREE.Vector2(p[0], p[1])), d.seg || 32, d.phiStart || 0, d.phiLength || Math.PI * 2);
    case 'mesh': { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3)); if (d.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2)); if (d.indices) g.setIndex(d.indices); g.computeVertexNormals(); return g; }
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function terrainHeight(t, x, z) {
  const [sx, sz] = t.size, [nx, nz] = t.res;
  const u = (x / sx + 0.5) * (nx - 1), v = (z / sz + 0.5) * (nz - 1);
  if (u < 0 || v < 0 || u > nx - 1 || v > nz - 1) return t.edge === undefined ? 0 : t.edge;
  const i = Math.min(nx - 2, Math.floor(u)), j = Math.min(nz - 2, Math.floor(v)), fu = u - i, fv = v - j;
  const h = t.heights; const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i], d = h[(j + 1) * nx + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

const PARTICLE_VS = `attribute vec4 pcolor; attribute float psize; varying vec4 vcol; uniform float scale;
void main(){ vcol = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `varying vec4 vcol; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.05, d) * vcol.a; gl_FragColor = vec4(vcol.rgb, a); }`;

class SceneInst {
  constructor(r3d, cid, id, data) {
    this.r3d = r3d; this.cid = cid; this.id = id; this.data = data; this.state = null; this.version = 0; this.stateVersion = 0;
    this.parts = new Map(); this.partDefs = new Map(); this.picks = []; this.build();
  }
  build() {
    const d = this.data; const env = d.environment || {};
    const scene = this.scene = new THREE.Scene();
    // ---- 天空 ----
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(env.skyTop || '#1b1450') }, hor: { value: new THREE.Color(env.skyHorizon || '#ff9a6b') }, gnd: { value: new THREE.Color(env.skyGround || '#3a2a55') }, sun: { value: V(env.sunDir || [-0.5, 0.35, -0.8]).normalize() }, sunCol: { value: new THREE.Color(env.sunColor || '#ffcf8a') } },
      vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vd; uniform vec3 top; uniform vec3 hor; uniform vec3 gnd; uniform vec3 sun; uniform vec3 sunCol; void main(){ float h = vd.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(hor, gnd, clamp(-h * 3.0, 0.0, 1.0)); float s = max(dot(normalize(vd), sun), 0.0); c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.45); gl_FragColor = vec4(c, 1.0); }',
    }));
    sky.renderOrder = -10; this.sky = sky; scene.add(sky);
    if (env.fog) scene.fog = new THREE.FogExp2(env.fog.color || '#c98a8a', env.fog.density || 0.004);
    // ---- 灯光 ----
    scene.add(new THREE.HemisphereLight(env.skyTop ? new THREE.Color(env.skyHorizon || '#ff9a6b').lerp(new THREE.Color(env.skyTop), 0.5) : '#aaaaff', env.skyGround || '#3a2a55', env.ambientIntensity === undefined ? 0.9 : env.ambientIntensity));
    const sun = this.sun = new THREE.DirectionalLight(env.sunColor || '#ffcf8a', env.sunIntensity === undefined ? 2.6 : env.sunIntensity);
    this.sunDir = V(env.sunDir || [-0.5, 0.35, -0.8]).normalize();
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.near = 1; sc.far = 260; sc.left = sc.bottom = -48; sc.right = sc.top = 48; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    // 补光：从太阳对侧柔和地照亮背光面，保证机体与碎片始终清楚可辨
    const fill = new THREE.DirectionalLight(env.fillColor || '#a99cff', env.fillIntensity === undefined ? 1.15 : env.fillIntensity); fill.position.set(-this.sunDir.x * 60, 40, -this.sunDir.z * 60); fill.castShadow = false; scene.add(fill);
    // 环境反射：用天空生成环境贴图，使不同材质的反光与粗糙度有区别
    try {
      const envScene = new THREE.Scene(); envScene.add(sky.clone());
      const pm = new THREE.PMREMGenerator(this.r3d.renderer); scene.environment = pm.fromScene(envScene, 0.04).texture; scene.environmentIntensity = env.envIntensity === undefined ? 0.9 : env.envIntensity; pm.dispose();
    } catch (e) { console.warn('环境贴图失败', e); }
    // ---- 贴图 / 材质 / 几何 ----
    const tex = {}; for (const k in (d.textures || {})) tex[k] = makeTexture(d.textures[k]);
    const mats = this.mats = {};
    for (const k in (d.materials || {})) {
      const m = d.materials[k];
      const p = { color: m.color || '#ffffff', metalness: m.metalness === undefined ? 0 : m.metalness, roughness: m.roughness === undefined ? 0.6 : m.roughness };
      if (m.map) p.map = tex[m.map]; if (m.emissive) { p.emissive = new THREE.Color(m.emissive); p.emissiveIntensity = m.emissiveIntensity || 1; }
      if (m.opacity !== undefined && m.opacity < 1) { p.transparent = true; p.opacity = m.opacity; }
      if (m.alphaTest) p.alphaTest = m.alphaTest; if (m.side === 'double') p.side = THREE.DoubleSide;
      if (m.vertexColors) p.vertexColors = true;
      const mm = new THREE.MeshStandardMaterial(p); if (m.polygonOffset) { mm.polygonOffset = true; mm.polygonOffsetFactor = -2; mm.polygonOffsetUnits = -2; }
      if (m.flat) mm.flatShading = true; mats[k] = mm;
    }
    const geoms = this.geoms = {}; for (const k in (d.geoms || {})) geoms[k] = makeGeometry(d.geoms[k]);
    // ---- 地形 ----
    if (d.terrain) this.buildTerrain(d.terrain, mats);
    // ---- 停机坪 ----
    for (const p of (d.pads || [])) {
      const th = this.terrainH(p.pos[0], p.pos[1]);
      const g = new THREE.Group(); g.position.set(p.pos[0], th, p.pos[1]);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.4, p.h || 0.3, 48), mats[p.mat || 'pad'] || new THREE.MeshStandardMaterial({ color: '#555' })); base.position.y = (p.h || 0.3) / 2 - 0.05; base.castShadow = true; base.receiveShadow = true; g.add(base);
      const mark = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.96, 48), new THREE.MeshStandardMaterial({ map: makeTexture({ type: 'pad', letter: p.name, size: 512, ring: p.ring || '#ffc83d', base: p.color || '#4a4660' }), roughness: 0.85 }));
      mark.rotation.x = -Math.PI / 2; mark.position.y = (p.h || 0.3) - 0.02; mark.receiveShadow = true; g.add(mark);
      scene.add(g);
    }
    // ---- 障碍：建筑与树木（飞行物理使用同一份数据）----
    this.buildObstacles(d.obstacles || [], mats);
    // ---- 散布（草等）----
    this.grass = []; for (const s of (d.terrain && d.terrain.scatter) || []) this.buildScatter(s, geoms, mats);
    // ---- 部件 ----
    for (const p of (d.parts || [])) {
      const geo = p.geom ? geoms[p.geom] : null; const mat = p.mat ? mats[p.mat] : null;
      const o = geo ? new THREE.Mesh(geo, mat || new THREE.MeshStandardMaterial({ color: '#999' })) : new THREE.Group();
      o.name = p.name; if (geo) { o.castShadow = p.shadow !== false; o.receiveShadow = p.receive !== false; }
      if (p.pos) o.position.set(p.pos[0], p.pos[1], p.pos[2]);
      if (p.rot) o.rotation.set(p.rot[0] * Math.PI / 180, p.rot[1] * Math.PI / 180, p.rot[2] * Math.PI / 180);
      if (p.scale) o.scale.set(p.scale[0], p.scale[1], p.scale[2]);
      if (p.vis === false) o.visible = false;
      o.userData.base = { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone(), vis: o.visible };
      o.userData.mat0 = mat; this.parts.set(p.name, o); this.partDefs.set(p.name, p);
    }
    for (const p of (d.parts || [])) { const o = this.parts.get(p.name); const par = p.parent ? this.parts.get(p.parent) : scene; (par || scene).add(o); }
    // ---- 粒子 ----
    this.pn = this.makePoints(false); this.pa = this.makePoints(true); scene.add(this.pn.obj, this.pa.obj);
    this.picks = []; for (const o of this.parts.values()) if (o.isMesh) this.picks.push(o);
  }
  buildTerrain(t, mats) {
    const [sx, sz] = t.size, [nx, nz] = t.res;
    const geo = new THREE.PlaneGeometry(sx, sz, nx - 1, nz - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
    const gc = new THREE.Color(t.colors && t.colors.low || '#4f8f3d'), hc = new THREE.Color(t.colors && t.colors.high || '#9a8a55'), dc = new THREE.Color(t.colors && t.colors.dirt || '#6b5a45');
    let hmin = 1e9, hmax = -1e9; for (const h of t.heights) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; pos.setY(k, t.heights[k]);
      const c = gc.clone().lerp(hc, Math.max(0, Math.min(1, (t.heights[k] - hmin) / Math.max(1, hmax - hmin) * 1.3 - 0.15)));
      const n = (hash(i, j) - 0.5) * 0.08; c.offsetHSL(0, 0, n); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = mats[t.material] ? mats[t.material].clone() : new THREE.MeshStandardMaterial({ roughness: 0.95 }); m.vertexColors = true;
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.name = 'terrain'; this.terrain = mesh; this.scene.add(mesh); this.tdata = t;
  }
  terrainH(x, z) { return this.tdata ? terrainHeight(this.tdata, x, z) : 0; }
  buildObstacles(list, mats) {
    const trees = list.filter((o) => o.type === 'tree');
    if (trees.length) {
      const trunkG = new THREE.CylinderGeometry(0.28, 0.4, 1, 7), crownG = new THREE.ConeGeometry(1, 1, 8);
      const trunk = new THREE.InstancedMesh(trunkG, mats.bark || new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.9 }), trees.length);
      const crown1 = new THREE.InstancedMesh(crownG, mats.leaf || new THREE.MeshStandardMaterial({ color: '#2d6a3f', roughness: 0.85 }), trees.length);
      const crown2 = new THREE.InstancedMesh(crownG, mats.leaf2 || new THREE.MeshStandardMaterial({ color: '#3c7f46', roughness: 0.85 }), trees.length);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
      trees.forEach((t, i) => {
        const gy = this.terrainH(t.pos[0], t.pos[1]); const h = t.h || 8; const cr = t.crown || 2.6;
        P.set(t.pos[0], gy + h * 0.2, t.pos[1]); S.set(1, h * 0.4, 1); M.compose(P, Q, S); trunk.setMatrixAt(i, M);
        P.set(t.pos[0], gy + h * 0.45, t.pos[1]); S.set(cr, h * 0.55, cr); M.compose(P, Q, S); crown1.setMatrixAt(i, M);
        P.set(t.pos[0], gy + h * 0.72, t.pos[1]); S.set(cr * 0.72, h * 0.45, cr * 0.72); M.compose(P, Q, S); crown2.setMatrixAt(i, M);
      });
      for (const im of [trunk, crown1, crown2]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
    }
    for (const o of list.filter((x) => x.type === 'box')) {
      const gy = this.terrainH(o.pos[0], o.pos[1]); const [w, h, dd] = o.size;
      const m = mats[o.mat || 'building'] || new THREE.MeshStandardMaterial({ color: '#777' });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); mesh.position.set(o.pos[0], gy + h / 2 - 0.1, o.pos[1]); mesh.rotation.y = (o.rotY || 0) * Math.PI / 180; mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
      if (o.roof) { const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, dd + 0.4), mats[o.roof] || new THREE.MeshStandardMaterial({ color: '#443' })); r.position.set(o.pos[0], gy + h + 0.1, o.pos[1]); r.rotation.y = mesh.rotation.y; r.castShadow = true; this.scene.add(r); }
    }
  }
  buildScatter(s, geoms, mats) {
    const g = geoms[s.geom] || new THREE.ConeGeometry(0.06, 0.7, 4); const m = mats[s.mat] || new THREE.MeshStandardMaterial({ color: '#5fae52', roughness: 0.9 });
    const im = new THREE.InstancedMesh(g, m, s.count); const [x0, z0, x1, z1] = s.region; const items = [];
    const pads = this.data.pads || []; const obs = this.data.obstacles || [];
    for (let i = 0; i < s.count; i++) {
      const x = x0 + hash(i, (s.seed || 1)) * (x1 - x0), z = z0 + hash(i, (s.seed || 1) + 17) * (z1 - z0);
      if (pads.some((p) => Math.hypot(x - p.pos[0], z - p.pos[1]) < p.r + 0.3)) { items.push(null); continue; }
      if (obs.some((o) => o.type === 'box' ? Math.abs(x - o.pos[0]) < o.size[0] / 2 + 0.3 && Math.abs(z - o.pos[1]) < o.size[2] / 2 + 0.3 : Math.hypot(x - o.pos[0], z - o.pos[1]) < (o.r || 0.5) + 0.2)) { items.push(null); continue; }
      const y = this.terrainH(x, z); const sc = (s.minS || 0.6) + hash(i, 5) * ((s.maxS || 1.5) - (s.minS || 0.6));
      items.push({ x, y, z, sc, rot: hash(i, 9) * 6.28 });
      const c = new THREE.Color(s.color || '#5fae52').offsetHSL((hash(i, 3) - 0.5) * 0.06, 0, (hash(i, 4) - 0.5) * 0.14); im.setColorAt(i, c);
    }
    im.userData.items = items; im.castShadow = false; im.receiveShadow = true; this.scene.add(im); this.grass.push({ im, items, h: s.h || 0.7 });
    this.updateGrass(null);
  }
  updateGrass(wash) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
    for (const gr of this.grass) {
      gr.items.forEach((it, i) => {
        if (!it) { M.makeScale(0, 0, 0); gr.im.setMatrixAt(i, M); return; }
        let bx = 0, bz = 0;
        if (wash && wash.s > 0) {
          const dx = it.x - wash.p[0], dz = it.z - wash.p[1]; const dist = Math.hypot(dx, dz); const k = Math.max(0, 1 - dist / wash.r) * wash.s;
          if (k > 0) { const a = Math.min(1.3, k * 1.4); bx = (dz / (dist + 0.01)) * a; bz = -(dx / (dist + 0.01)) * a; }
        }
        E.set(bx, it.rot, bz, 'YXZ'); Q.setFromEuler(E);
        P.set(it.x, it.y + gr.h * it.sc * 0.5 * (1 - Math.abs(bx) * 0.3), it.z); S.set(it.sc, it.sc, it.sc); M.compose(P, Q, S); gr.im.setMatrixAt(i, M);
      });
      gr.im.instanceMatrix.needsUpdate = true;
    }
  }
  makePoints(additive) {
    const MAX = 6000; const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4)); geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: { value: 600 } } });
    const obj = new THREE.Points(geo, mat); obj.frustumCulled = false; return { obj, geo, pos, col, size, n: 0, MAX };
  }
  // 粒子：发射参数与提交时刻的纯函数
  fillParticles(emit, time, wind) {
    const sets = [this.pn, this.pa]; sets.forEach((s) => { s.n = 0; });
    const tmp = new THREE.Color();
    for (const e of emit || []) {
      const set = (e.k === 'fire' || e.k === 'spark') ? this.pa : this.pn;
      const t1 = e.t1 === undefined ? 1e9 : e.t1; const end = Math.min(time, t1);
      if (end < e.t0) continue;
      const rate = e.rate || 30; const life = e.life || 3;
      const nEnd = Math.floor((end - e.t0) * rate), nStart = Math.max(0, Math.ceil((time - life - e.t0) * rate));
      tmp.set(e.color || '#444444');
      for (let n = nStart; n <= nEnd && set.n < set.MAX; n++) {
        const birth = e.t0 + n / rate; const age = time - birth; if (age < 0 || age > life) continue;
        const f = age / life; const sd = e.seed || 1;
        const a1 = hash(n, sd) * 6.2832, a2 = hash(n, sd + 3), a3 = hash(n, sd + 7) - 0.5;
        const sp = (e.spread || 1) * (0.3 + a2);
        let x = e.p[0], y = e.p[1], z = e.p[2];
        if (e.k === 'dust') { const r = (e.r || 2) * (0.3 + a2) * (0.4 + f * 1.4); x += Math.cos(a1) * r; z += Math.sin(a1) * r; y += 0.1 + f * (e.up || 1.4) * (0.4 + a2); }
        else if (e.k === 'fire') { x += Math.cos(a1) * sp * 0.4 * (1 - f); z += Math.sin(a1) * sp * 0.4 * (1 - f); y += (e.up || 2.4) * f * (0.6 + a2 * 0.8); }
        else if (e.k === 'spark') { x += Math.cos(a1) * sp * age * 2.4; z += Math.sin(a1) * sp * age * 2.4; y += (e.up || 3) * age * (0.5 + a2) - 4.9 * age * age * 0.5; }
        else { x += Math.cos(a1) * sp * f * 1.6 + (wind ? wind[0] : 0) * age * 0.35; z += Math.sin(a1) * sp * f * 1.6 + (wind ? wind[1] : 0) * age * 0.35; y += (e.up || 2.2) * age * (0.55 + a2 * 0.7) + a3; }
        const i = set.n++;
        set.pos[i * 3] = x; set.pos[i * 3 + 1] = y; set.pos[i * 3 + 2] = z;
        const alpha = (e.alpha === undefined ? 0.6 : e.alpha) * (f < 0.12 ? f / 0.12 : 1 - (f - 0.12) / 0.88);
        if (e.k === 'fire') { set.col[i * 4] = 1; set.col[i * 4 + 1] = 0.35 + 0.5 * (1 - f); set.col[i * 4 + 2] = 0.05 + 0.2 * (1 - f); }
        else { const sh = e.k === 'smoke' ? 0.55 + 0.45 * hash(n, sd + 11) : 1; set.col[i * 4] = tmp.r * sh; set.col[i * 4 + 1] = tmp.g * sh; set.col[i * 4 + 2] = tmp.b * sh; }
        set.col[i * 4 + 3] = alpha;
        set.size[i] = (e.size || 1) * (1 + f * (e.grow || 2));
      }
    }
    for (const s of sets) { s.geo.setDrawRange(0, s.n); s.geo.attributes.position.needsUpdate = true; s.geo.attributes.pcolor.needsUpdate = true; s.geo.attributes.psize.needsUpdate = true; }
  }
  applyState(st) {
    this.state = st; this.stateVersion++;
    if (!st) return;
    const E = new THREE.Euler();
    for (const [name, o] of this.parts) {
      const s = st.parts && st.parts[name]; const b = o.userData.base;
      if (!s) { o.position.copy(b.pos); o.rotation.copy(b.rot); o.scale.copy(b.scale); o.visible = b.vis; if (o.material && o.userData.mat0 && o.material !== o.userData.mat0) o.material = o.userData.mat0; continue; }
      if (s.p) o.position.set(s.p[0], s.p[1], s.p[2]); else o.position.copy(b.pos);
      if (s.q) o.quaternion.set(s.q[0], s.q[1], s.q[2], s.q[3]);
      else if (s.r) { E.set(s.r[0], s.r[1], s.r[2], 'XYZ'); o.quaternion.setFromEuler(E); } else o.rotation.copy(b.rot);
      if (s.s) o.scale.set(s.s[0], s.s[1], s.s[2]); else o.scale.copy(b.scale);
      o.visible = s.vis === undefined ? b.vis : !!s.vis;
      if (o.isMesh && o.userData.mat0) {
        const dm = s.dmg || 0, op = s.op;
        if (dm > 0 || op !== undefined) {
          if (!o.userData.matDmg) { o.userData.matDmg = o.userData.mat0.clone(); }
          const m = o.userData.matDmg; m.copy(o.userData.mat0);
          if (dm > 0) { m.color.multiplyScalar(1 - 0.65 * Math.min(1, dm)); m.roughness = Math.min(1, m.roughness + 0.4 * dm); m.emissive = new THREE.Color('#ff5a1a'); m.emissiveIntensity = Math.max(0, (s.heat || 0)); }
          if (op !== undefined) { m.transparent = true; m.opacity = op; m.depthWrite = false; }
          o.material = m;
        } else if (o.material !== o.userData.mat0) o.material = o.userData.mat0;
      }
    }
    this.fillParticles(st.emit, st.time || 0, st.wind);
    this.updateGrass(st.wash || null);
    // 阴影相机跟随主体
    const f = this.parts.get(st.focus || 'fuselage'); const tp = f ? f.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    this.sun.target.position.set(tp.x, 0, tp.z); this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 120); this.sun.target.updateMatrixWorld();
  }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}

export class Render3D {
  constructor(machine, display) {
    this.machine = machine; this.display = display; this.scenes = new Map(); this.views = new Map(); this.lastRender = 0; this.cap = { w: 0, h: 0 };
    this.initRenderer();
  }
  initRenderer() {
    if (this.renderer) { try { this.renderer.dispose(); } catch (e) { } }
    const canvas = document.createElement('canvas');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3; r.setClearColor('#000000', 1);
    this.cap = { w: 0, h: 0 };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => this.recover());
  }
  // 图形上下文丢失后：从系统状态（场景资源与最近一次提交的状态）重建画面，程序与播放位置不受影响
  recover() {
    this.lost = false; this.initRenderer();
    for (const [k, s] of this.scenes) { const st = s.state; s.dispose(); const n = new SceneInst(this, s.cid, s.id, s.data); n.applyState(st); this.scenes.set(k, n); }
    for (const v of this.views.values()) v.dirty = true;
  }
  loseContextForTest() { const ext = this.renderer.getContext().getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); setTimeout(() => ext.restoreContext(), 400); return true; } return false; }
  key(cid, sc) { return cid + ':' + sc; }
  reset() { for (const s of this.scenes.values()) s.dispose(); this.scenes.clear(); this.views.clear(); }
  load(cid, sc, data) { const k = this.key(cid, sc); const old = this.scenes.get(k); if (old) old.dispose(); this.scenes.set(k, new SceneInst(this, cid, sc, data)); }
  state(cid, sc, st) { const s = this.scenes.get(this.key(cid, sc)); if (s) s.applyState(st); }
  free(cid, sc) { const k = this.key(cid, sc); const s = this.scenes.get(k); if (s) { s.dispose(); this.scenes.delete(k); } }
  dropCtx(cid) { for (const [k, s] of [...this.scenes]) if (s.cid === cid) { s.dispose(); this.scenes.delete(k); } for (const [k, v] of [...this.views]) if (v.cid === cid) this.views.delete(k); }
  setView(ent, el, cid, sc, cam, w, h) {
    let v = this.views.get(ent);
    if (!v) { v = { ent, el, cid, sc, cam, w, h, dirty: true, ctx: el.getContext('2d'), lastSV: -1 }; this.views.set(ent, v); }
    const camS = JSON.stringify(cam);
    if (v.camS !== camS || v.w !== w || v.h !== h || v.sc !== sc || v.cid !== cid) v.dirty = true;
    v.el = el; v.cid = cid; v.sc = sc; v.cam = cam; v.camS = camS; v.w = w; v.h = h;
  }
  frame() {
    if (this.lost) return;
    const now = performance.now(); if (now - this.lastRender < 12) return; this.lastRender = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const [ent, v] of [...this.views]) {
      if (!v.el.isConnected) { this.views.delete(ent); continue; }
      const s = this.scenes.get(this.key(v.cid, v.sc)); if (!s) continue;
      if (v.lastSV !== s.stateVersion) v.dirty = true;
      if (!v.dirty) continue;
      const rect = v.el.getBoundingClientRect(); if (rect.width < 2 || v.el.offsetParent === null) continue;
      this.renderView(v, s, dpr); v.dirty = false; v.lastSV = s.stateVersion;
    }
  }
  renderView(v, s, dpr) {
    const wpx = Math.max(2, Math.round(v.w * dpr)), hpx = Math.max(2, Math.round(v.h * dpr));
    const r = this.renderer;
    if (wpx > this.cap.w || hpx > this.cap.h) { this.cap = { w: Math.max(this.cap.w, wpx), h: Math.max(this.cap.h, hpx) }; r.setSize(this.cap.w, this.cap.h, false); }
    if (v.el.width !== wpx || v.el.height !== hpx) { v.el.width = wpx; v.el.height = hpx; v.el.style.width = v.w + 'px'; v.el.style.height = v.h + 'px'; }
    const c = v.cam || {}; if (!v.camera) v.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1200);
    const cam = v.camera; cam.fov = c.fov || 50; cam.near = c.near || 0.3; cam.far = c.far || 1200; cam.aspect = wpx / hpx;
    if (c.pos) cam.position.set(c.pos[0], c.pos[1], c.pos[2]); if (c.target) cam.lookAt(c.target[0], c.target[1], c.target[2]);
    if (c.roll) cam.rotateZ(c.roll); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    s.sky.position.copy(cam.position);
    for (const pts of [s.pn, s.pa]) pts.obj.material.uniforms.scale.value = hpx / (2 * Math.tan(cam.fov * Math.PI / 360)) * 0.5;
    r.setViewport(0, this.cap.h - hpx, wpx, hpx); r.setScissor(0, this.cap.h - hpx, wpx, hpx); r.setScissorTest(true);
    r.render(s.scene, cam);
    v.ctx.drawImage(r.domElement, 0, this.cap.h - hpx, wpx, hpx, 0, 0, wpx, hpx);
  }
  // 点选：返回部件名与射线击中点、地面点
  pick(cid, sc, cam, x, y, w, h) {
    const s = this.scenes.get(this.key(cid, sc)); if (!s) return null;
    const camera = new THREE.PerspectiveCamera(cam.fov || 50, w / h, cam.near || 0.3, cam.far || 1200);
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]); camera.lookAt(cam.target[0], cam.target[1], cam.target[2]); if (cam.roll) camera.rotateZ(cam.roll);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const out = { part: null, point: null, ground: null };
    const hits = ray.intersectObjects(s.picks.filter((o) => o.visible), false);
    if (hits.length) { out.part = hits[0].object.name; out.point = hits[0].point.toArray(); }
    if (s.terrain) { const g = ray.intersectObject(s.terrain, false); if (g.length) out.ground = g[0].point.toArray(); }
    return out;
  }
  snapshot(cidSet) { const out = []; for (const s of this.scenes.values()) if (cidSet.has(s.cid)) out.push([s.cid, s.id, { data: s.data, state: s.state }]); return out; }
  restore(list, mapCid) {
    for (const [cid, id, d] of list || []) { const c2 = mapCid(cid); if (c2 === undefined) continue; this.load(c2, id, JSON.parse(JSON.stringify(d.data))); if (d.state) this.state(c2, id, JSON.parse(JSON.stringify(d.state))); }
  }
}
