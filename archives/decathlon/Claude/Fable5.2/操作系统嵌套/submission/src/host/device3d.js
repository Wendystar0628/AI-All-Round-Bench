/*
 * 显示设备（三维部分）。程序经系统接口提交两类可复制的数据：
 *   场景资源（几何、材质、贴图、灯光，JSON 文本）与每一时刻的场景状态（部件位姿、损坏、相机、粒子发射）。
 * 设备只按提交的内容和时刻绘制：相同的提交得到相同的画面，两次提交之间画面不变；设备不推进任何状态。
 * 这里没有任何具体模型的代码——画什么完全由资源文件决定。
 * 全部三维视图共用一个 WebGL 上下文（逐个视图绘制后拷到各自的画布），视图再多也不会被浏览器丢弃。
 */
import * as THREE from '../vendor/three.module.js';

const DEG = Math.PI / 180;
function hash01(a, b) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function col(c, def) { return new THREE.Color(c || def || '#888888'); }

// ---------- 贴图：由资源里的二维绘制指令生成 ----------
function makeTexture(def) {
  const w = def.w || 256, h = def.h || 256;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  for (const op of def.ops || []) {
    switch (op[0]) {
      case 'fill': g.fillStyle = op[1]; g.fillRect(0, 0, w, h); break;
      case 'rect': g.fillStyle = op[5]; g.fillRect(op[1], op[2], op[3], op[4]); break;
      case 'grad': { const gr = g.createLinearGradient(op[1], op[2], op[3], op[4]); for (const s of op[5]) gr.addColorStop(s[0], s[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); break; }
      case 'line': g.strokeStyle = op[5]; g.lineWidth = op[6] || 1; g.beginPath(); g.moveTo(op[1], op[2]); g.lineTo(op[3], op[4]); g.stroke(); break;
      case 'circle': g.beginPath(); g.arc(op[1], op[2], op[3], 0, Math.PI * 2); if (op[5]) { g.strokeStyle = op[4]; g.lineWidth = op[5]; g.stroke(); } else { g.fillStyle = op[4]; g.fill(); } break;
      case 'poly': g.beginPath(); for (let i = 0; i < op[1].length; i += 2) { if (i) g.lineTo(op[1][i], op[1][i + 1]); else g.moveTo(op[1][i], op[1][i + 1]); } g.closePath(); g.fillStyle = op[2]; g.fill(); break;
      case 'text': {
        g.save(); g.translate(op[2], op[3]); if (op[6]) g.rotate(op[6] * DEG);
        g.font = (op[7] || 800) + ' ' + op[4] + 'px "Arial Black","Segoe UI","Microsoft YaHei",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (op[8]) { g.strokeStyle = op[8]; g.lineWidth = op[9] || 4; g.lineJoin = 'round'; g.strokeText(op[1], 0, 0); }
        g.fillStyle = op[5]; g.fillText(op[1], 0, 0); g.restore(); break;
      }
      case 'noise': {
        const seed = op[1] | 0, amt = op[2], cell = Math.max(1, op[3] | 0);
        for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
          const r = hash01(seed + x / cell, y / cell * 7 + 3);
          g.fillStyle = r > 0.5 ? 'rgba(255,255,255,' + ((r - 0.5) * 2 * amt).toFixed(3) + ')' : 'rgba(0,0,0,' + ((0.5 - r) * 2 * amt).toFixed(3) + ')';
          g.fillRect(x, y, cell, cell);
        }
        break;
      }
      case 'speckle': {
        const seed = op[1] | 0, n = op[2] | 0;
        for (let i = 0; i < n; i++) { g.fillStyle = op[4]; g.globalAlpha = 0.2 + 0.6 * hash01(seed, i * 3 + 2); g.beginPath(); g.arc(hash01(seed, i * 3) * w, hash01(seed, i * 3 + 1) * h, op[3] * (0.4 + hash01(seed + 5, i)), 0, 6.283); g.fill(); }
        g.globalAlpha = 1; break;
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (def.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(def.repeat[0], def.repeat[1]); }
  return t;
}

// ---------- 几何 ----------
function loftGeometry(s) {
  const secs = s.sections, N = s.seg || 28, v0 = s.arc ? s.arc[0] : 0, v1 = s.arc ? s.arc[1] : 1;
  const pos = [], uv = [], idx = [];
  const x0 = secs[0].x, x1 = secs[secs.length - 1].x;
  for (let i = 0; i < secs.length; i++) {
    const c = secs[i], e = 2 / (c.e || 2);
    for (let j = 0; j <= N; j++) {
      const v = v0 + (v1 - v0) * j / N, a = v * Math.PI * 2;
      const cs = -Math.cos(a), sn = Math.sin(a);
      const hy = cs >= 0 ? (c.hu != null ? c.hu : c.h) : (c.hd != null ? c.hd : c.h);
      const y = (c.cy || 0) + Math.sign(cs) * Math.pow(Math.abs(cs), e) * hy;
      const z = (c.cz || 0) + Math.sign(sn) * Math.pow(Math.abs(sn), e) * c.w;
      pos.push(c.x, y, z); uv.push((c.x - x0) / ((x1 - x0) || 1), v);
    }
  }
  const row = N + 1;
  for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * row + j, b = a + 1, c2 = a + row, d = c2 + 1;
    if (x1 > x0) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
  }
  // 端面
  const cap = (si, flip) => {
    const c = secs[si], base = pos.length / 3;
    pos.push(c.x, c.cy || 0, c.cz || 0); uv.push(si ? 1 : 0, 0.5);
    for (let j = 0; j < N; j++) { const a = si * row + j, b = a + 1; if (flip) idx.push(base, b, a); else idx.push(base, a, b); }
  };
  if (s.cap !== false) { cap(0, !(x1 > x0)); cap(secs.length - 1, x1 > x0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function shapeGeometry(s) {
  let g;
  switch (s.type) {
    case 'box': g = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]); break;
    case 'cyl': g = new THREE.CylinderGeometry(s.r2 != null ? s.r2 : s.r, s.r, s.h, s.seg || 20, 1, !!s.open); if (s.axis === 'x') g.rotateZ(-Math.PI / 2); else if (s.axis === 'z') g.rotateX(Math.PI / 2); break;
    case 'cone': g = new THREE.ConeGeometry(s.r, s.h, s.seg || 12); if (s.axis === 'x') g.rotateZ(-Math.PI / 2); else if (s.axis === 'z') g.rotateX(Math.PI / 2); break;
    case 'sphere': g = new THREE.SphereGeometry(s.r, s.seg || 20, Math.max(8, (s.seg || 20) >> 1)); break;
    case 'loft': g = loftGeometry(s); break;
    case 'plate': {
      const sh = new THREE.Shape(); const p = s.poly;
      sh.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) sh.lineTo(p[i][0], p[i][1]); sh.closePath();
      g = new THREE.ExtrudeGeometry(sh, { depth: s.t || 0.05, bevelEnabled: false }); g.translate(0, 0, -(s.t || 0.05) / 2); break;
    }
    case 'tube': { const c = new THREE.CatmullRomCurve3(s.path.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.2); g = new THREE.TubeGeometry(c, s.steps || 24, s.r, 8, false); break; }
    case 'torus': g = new THREE.TorusGeometry(s.r, s.tube, 8, s.seg || 32); g.rotateX(Math.PI / 2); break;
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  if (s.scale) g.scale(s.scale[0], s.scale[1], s.scale[2]);
  if (s.rot) { const e = new THREE.Euler(s.rot[0] * DEG, s.rot[1] * DEG, s.rot[2] * DEG, 'YXZ'); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); }
  if (s.pos) g.translate(s.pos[0], s.pos[1], s.pos[2]);
  return g;
}

class SceneRec {
  constructor(dev, origin, handle, res) {
    this.dev = dev; this.origin = origin; this.handle = handle; this.res = res;
    this.staged = {}; this.layers = {}; this.t = 0; this.presented = 0; this.version = 0; this.applied = -1;
    this.build();
  }
  mat(name) {
    if (this.mats[name]) return this.mats[name];
    const d = (this.res.materials && this.res.materials[name]) || { color: name && name[0] === '#' ? name : '#999999' };
    const m = new THREE.MeshStandardMaterial({ color: col(d.color, '#ffffff'), roughness: d.rough != null ? d.rough : 0.7, metalness: d.metal != null ? d.metal : 0.0 });
    if (d.map && this.tex[d.map]) m.map = this.tex[d.map];
    if (d.opacity != null && d.opacity < 1) { m.transparent = true; m.opacity = d.opacity; m.depthWrite = d.opacity > 0.6; }
    if (d.emissive) { m.emissive = col(d.emissive); m.emissiveIntensity = d.glow != null ? d.glow : 1; }
    if (d.double) m.side = THREE.DoubleSide;
    if (d.flat) m.flatShading = true;
    m.userData.base = m.color.clone();
    this.mats[name] = m;
    return m;
  }
  heightAt(x, z) {
    const T = this.res.terrain; if (!T) return 0;
    const n = T.n, half = T.size / 2;
    let fx = (x + half) / T.size * n, fz = (z + half) / T.size * n;
    fx = Math.max(0, Math.min(n - 0.0001, fx)); fz = Math.max(0, Math.min(n - 0.0001, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, H = T.heights, row = n + 1;
    const a = H[iz * row + ix], b = H[iz * row + ix + 1], c = H[(iz + 1) * row + ix], d = H[(iz + 1) * row + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  build() {
    const R = this.res, S = this.scene = new THREE.Scene();
    this.mats = {}; this.tex = {}; this.parts = {}; this.partList = [];
    for (const k in R.textures || {}) this.tex[k] = makeTexture(R.textures[k]);
    const env = R.env || {};
    // 天空
    const sky = env.sky || {};
    const sunDir = new THREE.Vector3(...(sky.sun || [0.4, 0.5, 0.3])).normalize();
    this.sunDir = sunDir;
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: col(sky.top, '#27407a') }, hor: { value: col(sky.horizon, '#f2b27a') }, bot: { value: col(sky.bottom, '#8a7a6a') }, sun: { value: sunDir }, sunCol: { value: col(sky.sunColor, '#fff1c8') } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vD; uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sun; uniform vec3 sunCol; void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, bot, pow(-h, 0.4)); float s = max(dot(d, sun), 0.0); c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.18); gl_FragColor = vec4(c, 1.0); }'
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), skyMat); dome.frustumCulled = false; S.add(dome);
    if (env.fog) S.fog = new THREE.FogExp2(col(env.fog.color, '#d8b89a'), env.fog.density || 0.002);
    // 灯光
    this.sun = null;
    for (const L of R.lights || []) {
      if (L.type === 'sun') {
        const d = new THREE.DirectionalLight(col(L.color, '#fff'), L.intensity != null ? L.intensity : 2);
        this.sunVec = new THREE.Vector3(...L.dir).normalize();
        d.castShadow = L.shadow !== false; d.shadow.mapSize.set(2048, 2048);
        const r = L.range || 46; Object.assign(d.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 });
        d.shadow.bias = -0.0004; d.shadow.normalBias = 0.04;
        S.add(d); S.add(d.target); this.sun = d;
      } else if (L.type === 'hemi') S.add(new THREE.HemisphereLight(col(L.sky, '#bcd'), col(L.ground, '#654'), L.intensity != null ? L.intensity : 0.6));
      else if (L.type === 'point') { const p = new THREE.PointLight(col(L.color), L.intensity || 1, L.range || 30, 2); p.position.set(...L.pos); S.add(p); }
      else if (L.type === 'ambient') S.add(new THREE.AmbientLight(col(L.color, '#fff'), L.intensity || 0.3));
    }
    // 地形
    if (R.terrain) {
      const T = R.terrain, n = T.n;
      const g = new THREE.PlaneGeometry(T.size, T.size, n, n); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color();
      const bands = (T.colors || [[-100, '#6b7a45'], [100, '#8a8a70']]).map(b => [b[0], col(b[1])]);
      for (let i = 0; i < p.count; i++) {
        const hgt = T.heights[i] || 0; p.setY(i, hgt);
        let k = 0; while (k < bands.length - 2 && hgt > bands[k + 1][0]) k++;
        const a = bands[k], b = bands[Math.min(bands.length - 1, k + 1)], t = Math.max(0, Math.min(1, (hgt - a[0]) / ((b[0] - a[0]) || 1)));
        c.copy(a[1]).lerp(b[1], t);
        const nz = 0.92 + 0.16 * hash01(i, 77); colors[i * 3] = c.r * nz; colors[i * 3 + 1] = c.g * nz; colors[i * 3 + 2] = c.b * nz;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
      const m = this.mat(T.material || '#777777').clone(); m.vertexColors = true; m.color.set('#ffffff');
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; S.add(mesh); this.terrain = mesh;
    }
    // 静态物体
    const addShapes = (grp, shapes, cast) => {
      for (const s of shapes) { const mesh = new THREE.Mesh(shapeGeometry(s), this.mat(s.material)); mesh.castShadow = cast !== false && !s.noShadow; mesh.receiveShadow = true; grp.add(mesh); }
    };
    for (const o of R.objects || []) {
      if (o.instances) {
        for (const s of o.shapes) {
          const geo = shapeGeometry(s), im = new THREE.InstancedMesh(geo, this.mat(s.material), o.instances.length);
          const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
          o.instances.forEach((it, i) => { const y = it[4] != null ? it[4] : this.heightAt(it[0], it[1]); e.set(0, (it[3] || 0) * DEG, 0); q.setFromEuler(e); v.set(it[0], y, it[1]); sc.setScalar(it[2] || 1); M.compose(v, q, sc); im.setMatrixAt(i, M); });
          im.castShadow = true; im.receiveShadow = true; S.add(im);
        }
        continue;
      }
      const grp = new THREE.Group(); grp.name = o.name || '';
      addShapes(grp, o.shapes || [], o.shadow);
      const y = o.pos && o.pos[1] != null ? o.pos[1] : 0;
      grp.position.set(o.pos ? o.pos[0] : 0, (o.ground ? this.heightAt(o.pos[0], o.pos[2]) : 0) + y, o.pos ? o.pos[2] : 0);
      if (o.rot) grp.rotation.set(o.rot[0] * DEG, o.rot[1] * DEG, o.rot[2] * DEG, 'YXZ');
      S.add(grp);
    }
    // 草：实例化叶片，受下洗气流与风影响（由提交的状态驱动）
    this.grassU = { uWash: { value: new THREE.Vector4(0, -999, 0, 0) }, uWashR: { value: 10 }, uWind: { value: new THREE.Vector3(0, 0, 0) }, uTime: { value: 0 } };
    if (R.grass) {
      const G = R.grass, count = G.count || 8000;
      const blade = new THREE.BufferGeometry();
      const bw = G.width || 0.09, bh = G.height || 0.55;
      blade.setAttribute('position', new THREE.Float32BufferAttribute([-bw, 0, 0, bw, 0, 0, -bw * 0.6, bh * 0.5, 0, bw * 0.6, bh * 0.5, 0, 0, bh, 0], 3));
      blade.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1], 2));
      blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); blade.computeVertexNormals();
      const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
      const U = this.grassU;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'uniform vec4 uWash; uniform float uWashR; uniform vec3 uWind; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n vec4 wp0 = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0); float k = uv.y; \n' +
          ' vec2 away = wp0.xz - uWash.xz; float dist = length(away); float f = uWash.w * smoothstep(uWashR, uWashR * 0.25, dist) * (0.55 + 0.45 * sin(uTime * 23.0 + wp0.x * 1.7 + wp0.z * 1.3));\n' +
          ' vec2 dirw = dist > 0.01 ? away / dist : vec2(1.0, 0.0);\n' +
          ' float sway = sin(uTime * 1.9 + wp0.x * 0.35 + wp0.z * 0.27) * 0.12 + 0.1;\n' +
          ' vec3 bendW = vec3(dirw.x * f + uWind.x * sway, 0.0, dirw.y * f + uWind.z * sway);\n' +
          ' vec3 bendL = (inverse(mat3(modelMatrix * instanceMatrix)) * bendW);\n' +
          ' float amt = clamp(length(bendW), 0.0, 1.3);\n' +
          ' transformed += bendL * k * k * 0.75; transformed.y -= amt * k * k * position.y * 0.5;');
      };
      const im = new THREE.InstancedMesh(blade, m, count);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
      const c1 = col(G.color, '#7e9a45'), c2 = col(G.color2, '#b8a85a');
      const excl = G.exclude || [];
      let placed = 0;
      for (let i = 0; i < count * 3 && placed < count; i++) {
        const a = hash01(G.seed || 1, i * 2) * 6.283, rr = Math.sqrt(hash01(G.seed || 1, i * 2 + 1)) * G.radius;
        const x = G.center[0] + Math.cos(a) * rr, z = G.center[1] + Math.sin(a) * rr;
        let skip = false;
        for (const ex of excl) { const dx = x - ex[0], dz = z - ex[1]; if (dx * dx + dz * dz < ex[2] * ex[2]) { skip = true; break; } }
        if (skip) continue;
        e.set(0, hash01(i, 5) * 6.283, (hash01(i, 6) - 0.5) * 0.5); q.setFromEuler(e);
        v.set(x, this.heightAt(x, z) - 0.02, z); const s = 0.6 + hash01(i, 7) * 0.9; sc.set(s, s * (0.7 + hash01(i, 8) * 0.7), s);
        M.compose(v, q, sc); im.setMatrixAt(placed, M);
        c.copy(c1).lerp(c2, hash01(i, 9)); im.setColorAt(placed, c);
        placed++;
      }
      im.count = placed; im.receiveShadow = true; im.frustumCulled = false; S.add(im); this.grass = im;
    }
    // 载具：按部件层级建立，可分别运动与损坏
    this.vehicle = null;
    if (R.vehicle) {
      const V = R.vehicle, root = new THREE.Group(); root.name = 'vehicle'; S.add(root); this.vehicle = root;
      for (const pd of V.parts) {
        const g = new THREE.Group(); g.name = pd.name;
        const rec = { def: pd, node: g, meshes: [], blur: null, mats: null };
        for (const s of pd.shapes || []) {
          let m = this.mat(s.material);
          if (pd.blur) { m = m.clone(); m.transparent = true; }
          const mesh = new THREE.Mesh(shapeGeometry(s), m); mesh.castShadow = !s.noShadow; mesh.receiveShadow = true; g.add(mesh); rec.meshes.push(mesh);
        }
        if (pd.blur) {
          const bm = new THREE.MeshBasicMaterial({ color: col(pd.blur.color, '#20222a'), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, map: this.dev.blurTex });
          const disc = new THREE.Mesh(new THREE.CircleGeometry(pd.blur.r, 48), bm);
          if (pd.blur.axis === 'z') { /* 圆盘法线沿 z */ } else if (pd.blur.axis === 'x') disc.rotateY(Math.PI / 2); else disc.rotateX(-Math.PI / 2);
          if (pd.blur.pos) disc.position.set(...pd.blur.pos);
          disc.renderOrder = 3; g.add(disc); rec.blur = disc;
        }
        this.parts[pd.name] = rec; this.partList.push(rec);
      }
      this.restPose();
    }
    // 粒子（烟、尘、火、火花）
    const pm = (blend) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: blend, vertexColors: true,
      uniforms: { uScale: { value: 600 }, uMap: { value: this.dev.puffTex } },
      vertexShader: 'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float uScale; void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; uniform sampler2D uMap; void main(){ float a = texture2D(uMap, gl_PointCoord).a; if (a * vC.a < 0.004) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }'
    });
    this.pNorm = new THREE.Points(new THREE.BufferGeometry(), pm(THREE.NormalBlending)); this.pNorm.frustumCulled = false; this.pNorm.renderOrder = 5; S.add(this.pNorm);
    this.pAdd = new THREE.Points(new THREE.BufferGeometry(), pm(THREE.AdditiveBlending)); this.pAdd.frustumCulled = false; this.pAdd.renderOrder = 6; S.add(this.pAdd);
    this.glows = [];
    for (let i = 0; i < 3; i++) { const p = new THREE.PointLight('#ff8a3c', 0, 60, 1.6); S.add(p); this.glows.push(p); }
    this.marks = new THREE.Group(); S.add(this.marks);
    this.camera = new THREE.PerspectiveCamera(42, 1.6, 0.3, 5000);
    const c0 = (R.cameras && R.cameras.default) || { p: [20, 8, 20], look: [0, 2, 0], fov: 42 };
    this.cam = { p: c0.p, look: c0.look, fov: c0.fov || 42 };
  }
  restPose() {
    for (const r of this.partList) {
      const d = r.def, parent = d.parent ? this.parts[d.parent].node : this.vehicle;
      if (r.node.parent !== parent) parent.add(r.node);
      r.node.position.set(d.pos ? d.pos[0] : 0, d.pos ? d.pos[1] : 0, d.pos ? d.pos[2] : 0);
      r.node.rotation.set((d.rot ? d.rot[0] : 0) * DEG, (d.rot ? d.rot[1] : 0) * DEG, (d.rot ? d.rot[2] : 0) * DEG, 'YXZ');
      r.node.scale.set(1, 1, 1); r.node.visible = true;
      if (r.dmg) { r.dmg = 0; for (let i = 0; i < r.meshes.length; i++) if (r.meshes[i].userData.orig) r.meshes[i].material = r.meshes[i].userData.orig; }
      if (r.blur) { r.blur.material.opacity = 0; for (const m of r.meshes) m.material.opacity = 1; }
    }
  }
  // 把已提交的状态套到场景对象上（纯函数：只取决于当前各层内容）
  applyLayers() {
    const L = this.layers;
    if (this.vehicle) {
      this.restPose();
      const P = L.parts && L.parts.d;
      if (P) {
        if (P.root) { this.vehicle.position.set(P.root[0], P.root[1], P.root[2]); this.vehicle.quaternion.set(P.root[3], P.root[4], P.root[5], P.root[6]); }
        for (const it of P.list || []) {
          const r = this.parts[it[0]]; if (!r) continue;
          if (it[8]) { if (r.node.parent !== this.scene) this.scene.add(r.node); }
          r.node.position.set(it[1], it[2], it[3]); r.node.quaternion.set(it[4], it[5], it[6], it[7]);
          const dmg = it[9] || 0, spin = Math.abs(it[10] || 0), squash = it[11] || 0;
          if (squash > 0) r.node.scale.set(1 + squash * 0.12, 1 - squash * 0.42, 1 + squash * 0.1);
          if (it[12]) r.node.visible = false;
          if (dmg > 0) {
            r.dmg = dmg;
            for (const mesh of r.meshes) {
              if (!mesh.userData.orig) { mesh.userData.orig = mesh.material; mesh.userData.burn = mesh.material.clone(); }
              const b = mesh.userData.burn; b.color.copy(mesh.userData.orig.color).multiplyScalar(1 - 0.72 * dmg); b.roughness = Math.min(1, mesh.userData.orig.roughness + 0.5 * dmg); b.opacity = mesh.userData.orig.opacity;
              mesh.material = b;
            }
          }
          if (r.blur) { const k = Math.max(0, Math.min(1, (spin - 8) / 22)); r.blur.material.opacity = 0.34 * k; for (const m of r.meshes) m.material.opacity = 1 - 0.8 * k; }
        }
      }
    }
    const C = L.camera && L.camera.d;
    if (C) this.cam = { p: C.p, look: C.look, fov: C.fov || 42 };
    const F = L.fx && L.fx.d;
    const ft = F ? (F.t != null ? F.t : L.fx.t) : 0;
    this.grassU.uTime.value = ft;
    if (F && F.wash) { this.grassU.uWash.value.set(F.wash[0], F.wash[1], F.wash[2], F.wash[4]); this.grassU.uWashR.value = F.wash[3]; } else this.grassU.uWash.value.set(0, -999, 0, 0);
    if (F && F.wind) this.grassU.uWind.value.set(F.wind[0] * 0.06, 0, F.wind[1] * 0.06); else this.grassU.uWind.value.set(0, 0, 0);
    this.buildParticles(F ? F.em || [] : [], ft, F && F.wind ? F.wind : [0, 0]);
    for (let i = 0; i < this.glows.length; i++) { const g = F && F.glow && F.glow[i]; if (g) { this.glows[i].position.set(g[0], g[1], g[2]); this.glows[i].intensity = g[3]; this.glows[i].distance = g[4] || 50; } else this.glows[i].intensity = 0; }
    // 地面标记：焦痕、目标点
    const want = F && F.marks ? F.marks : [];
    const msig = JSON.stringify(want);
    if (this.marksSig !== msig) {
      this.marksSig = msig;
      for (const c of this.marks.children.slice()) { this.marks.remove(c); c.geometry.dispose(); }
      for (let i = 0; i < want.length; i++) {
        const m = want[i]; let mesh;
        const kind = m[3] || 0;
        const geo = kind === 1 ? new THREE.RingGeometry(m[2] * 0.82, m[2], 40) : new THREE.CircleGeometry(m[2], 28);
        geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) p.setY(k, this.heightAt(m[0] + p.getX(k), m[1] + p.getZ(k)) + (kind === 1 ? 0.12 : 0.05));
        const mat = kind === 1 ? this.dev.targetMat : this.dev.scorchMat;
        mesh = new THREE.Mesh(geo, mat); mesh.position.set(m[0], 0, m[1]); mesh.renderOrder = 2;
        this.marks.add(mesh);
      }
    }
    this.applied = this.version;
  }
  buildParticles(em, t, wind) {
    const nPos = [], nCol = [], nSize = [], aPos = [], aCol = [], aSize = [];
    for (const e of em) {
      const kind = e[0], n = e[10], life = e[9], dur = e[8], seed = e[12] | 0, size0 = e[11];
      for (let i = 0; i < n; i++) {
        const birth = e[7] + dur * (i / n), age = t - birth;
        if (age < 0 || age > life) continue;
        const u = age / life;
        const r1 = hash01(seed, i * 5), r2 = hash01(seed, i * 5 + 1), r3 = hash01(seed, i * 5 + 2), r4 = hash01(seed, i * 5 + 3), r5 = hash01(seed, i * 5 + 4);
        const spread = e[13] != null ? e[13] : 1;
        let vx = e[4] + (r1 - 0.5) * 2 * spread, vy = e[5] + (r2 - 0.5) * spread, vz = e[6] + (r3 - 0.5) * 2 * spread;
        let x, y, z, sz, a, cr, cg, cb, add = false;
        if (kind === 0 || kind === 4) {            // 尘土：阻力大，随风飘散
          const kd = kind === 4 ? 2.2 : 1.4, f = (1 - Math.exp(-kd * age)) / kd;
          x = e[1] + vx * f + wind[0] * 0.25 * age; y = e[2] + vy * f + 0.5 * age * (0.4 + r4); z = e[3] + vz * f + wind[1] * 0.25 * age;
          sz = size0 * (0.7 + 2.3 * u) * (0.7 + 0.6 * r5); a = 0.42 * Math.min(1, age * 5) * Math.pow(1 - u, 1.3);
          cr = 0.74; cg = 0.63; cb = 0.47;
        } else if (kind === 1) {                   // 烟：上升并被风带走
          const f = (1 - Math.exp(-1.2 * age)) / 1.2;
          x = e[1] + vx * f + wind[0] * 0.5 * age + Math.sin(age * 1.7 + r4 * 6.3) * 0.5; y = e[2] + vy * f + (1.6 + r4) * age; z = e[3] + vz * f + wind[1] * 0.5 * age + Math.cos(age * 1.3 + r5 * 6.3) * 0.5;
          sz = size0 * (0.8 + 3.2 * u); a = 0.5 * Math.min(1, age * 3) * Math.pow(1 - u, 1.1);
          const g0 = 0.08 + 0.2 * u + 0.08 * r5; cr = g0; cg = g0; cb = g0 * 1.05;
        } else if (kind === 2) {                   // 火
          x = e[1] + vx * age * 0.6; y = e[2] + vy * age + (2.2 + r4 * 1.5) * age; z = e[3] + vz * age * 0.6;
          sz = size0 * (1.15 - 0.75 * u) * (0.7 + 0.6 * r5); a = 0.75 * Math.min(1, age * 10) * (1 - u);
          cr = 1.0; cg = 0.55 - 0.35 * u + 0.25 * r4; cb = 0.12; add = true;
        } else {                                   // 火花与碎屑：抛物线
          x = e[1] + vx * age; y = e[2] + vy * age - 4.9 * age * age; z = e[3] + vz * age;
          const gy = this.heightAt(x, z); if (y < gy + 0.03) y = gy + 0.03;
          sz = size0 * (1 - 0.6 * u); a = 1 - u * u; cr = 1.0; cg = 0.8; cb = 0.4; add = true;
        }
        if (a <= 0.003) continue;
        if (add) { aPos.push(x, y, z); aCol.push(cr, cg, cb, a); aSize.push(sz); } else { nPos.push(x, y, z); nCol.push(cr, cg, cb, a); nSize.push(sz); }
      }
    }
    this.pData = { nPos, nCol, nSize };
    const set = (pts, pos, c, s) => { const g = pts.geometry; g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('rgba', new THREE.Float32BufferAttribute(c, 4)); g.setAttribute('size', new THREE.Float32BufferAttribute(s, 1)); pts.visible = s.length > 0; };
    set(this.pAdd, aPos, aCol, aSize);
    this.sortedFor = null;
    set(this.pNorm, nPos, nCol, nSize);
  }
  sortParticles(cam) {
    const d = this.pData; if (!d || d.nSize.length < 2) return;
    const key = cam.position.x.toFixed(1) + ',' + cam.position.y.toFixed(1) + ',' + cam.position.z.toFixed(1);
    if (this.sortedFor === key) return; this.sortedFor = key;
    const n = d.nSize.length, order = new Array(n), dist = new Float32Array(n), cp = cam.position;
    for (let i = 0; i < n; i++) { const dx = d.nPos[i * 3] - cp.x, dy = d.nPos[i * 3 + 1] - cp.y, dz = d.nPos[i * 3 + 2] - cp.z; dist[i] = dx * dx + dy * dy + dz * dz; order[i] = i; }
    order.sort((a, b) => dist[b] - dist[a]);
    const pos = new Float32Array(n * 3), c = new Float32Array(n * 4), s = new Float32Array(n);
    for (let k = 0; k < n; k++) { const i = order[k]; pos[k * 3] = d.nPos[i * 3]; pos[k * 3 + 1] = d.nPos[i * 3 + 1]; pos[k * 3 + 2] = d.nPos[i * 3 + 2]; c[k * 4] = d.nCol[i * 4]; c[k * 4 + 1] = d.nCol[i * 4 + 1]; c[k * 4 + 2] = d.nCol[i * 4 + 2]; c[k * 4 + 3] = d.nCol[i * 4 + 3]; s[k] = d.nSize[i]; }
    const g = this.pNorm.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('rgba', new THREE.BufferAttribute(c, 4)); g.setAttribute('size', new THREE.BufferAttribute(s, 1));
  }
  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const k in this.mats) this.mats[k].dispose();
    for (const k in this.tex) this.tex[k].dispose();
  }
}

class Device3D {
  constructor() {
    this.scenes = new Map();      // origin → Map<handle, SceneRec>
    this.views = new Set();
    this.lost = false; this.frames = 0; this.restores = 0;
    this.initGL();
  }
  initGL() {
    const cv = this.canvas = document.createElement('canvas');
    cv.width = 1280; cv.height = 720;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; console.warn('[显示设备] 图形上下文丢失'); });
    cv.addEventListener('webglcontextrestored', () => {
      // 画面从系统已提交的状态恢复：程序与播放位置不受影响
      this.lost = false; this.restores++;
      for (const m of this.scenes.values()) for (const s of m.values()) { s.applied = -1; }
      for (const v of this.views) v.dirty = true;
      console.warn('[显示设备] 图形上下文已恢复，按已提交的状态重画');
    });
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = true;
    // 设备自带的小贴图：柔边粒子、旋翼模糊条纹
    const pc = document.createElement('canvas'); pc.width = pc.height = 64; const pg = pc.getContext('2d');
    const gr = pg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = gr; pg.fillRect(0, 0, 64, 64);
    this.puffTex = new THREE.CanvasTexture(pc);
    const bc = document.createElement('canvas'); bc.width = bc.height = 256; const bg = bc.getContext('2d');
    bg.translate(128, 128);
    for (let i = 0; i < 90; i++) { bg.rotate(Math.PI * 2 / 90); const a = 0.25 + 0.75 * hash01(9, i); bg.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; bg.beginPath(); bg.moveTo(0, 0); bg.arc(0, 0, 127, 0, Math.PI * 2 / 90 + 0.01); bg.closePath(); bg.fill(); }
    const rg = bg.createRadialGradient(0, 0, 0, 0, 0, 127); rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.12, 'rgba(0,0,0,0.6)'); rg.addColorStop(0.9, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    bg.globalCompositeOperation = 'destination-out'; bg.fillStyle = rg; bg.beginPath(); bg.arc(0, 0, 128, 0, 6.3); bg.fill();
    this.blurTex = new THREE.CanvasTexture(bc);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: '#0c0a08', transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.targetMat = new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  }
  sceneOf(origin, h) { const m = this.scenes.get(origin); return m ? m.get(h) : null; }
  apply(origin, op, a, b, c) {
    if (op === 'scene_open') {
      let res;
      try { res = JSON.parse(b); } catch (e) { return { error: '场景资源不是有效的 JSON' }; }
      if (!res || typeof res !== 'object') return { error: '场景资源格式不符' };
      let rec;
      try { rec = new SceneRec(this, origin, a, res); } catch (e) { console.error(e); return { error: '场景资源无法载入：' + e.message }; }
      let m = this.scenes.get(origin); if (!m) { m = new Map(); this.scenes.set(origin, m); }
      const old = m.get(a); if (old) old.dispose();
      m.set(a, rec);
      for (const v of this.views) if (v.sys === origin && v.scene === a) v.dirty = true;
      return true;
    }
    const rec = this.sceneOf(origin, a);
    if (!rec) return op === 'scene_close' ? true : { error: '无效的场景' };
    if (op === 'scene_layer') { rec.staged[b] = { t: c[0], d: NVM.fromGuest(c[1]) }; return true; }
    if (op === 'scene_present') {
      for (const k in rec.staged) rec.layers[k] = rec.staged[k];
      rec.staged = {}; rec.t = b; rec.presented++; rec.version++;
      for (const v of this.views) if (v.sys === origin && v.scene === a) v.dirty = true;
      return true;
    }
    if (op === 'scene_close') { rec.dispose(); this.scenes.get(origin).delete(a); for (const v of this.views) if (v.sys === origin && v.scene === a) v.dirty = true; return true; }
    return true;
  }
  reset(origin) {
    const m = this.scenes.get(origin); if (!m) return;
    for (const s of m.values()) s.dispose();
    this.scenes.delete(origin);
    for (const v of this.views) if (v.sys === origin) v.dirty = true;
  }
  attachView(v) { v.dirty = true; v.ctx = v.canvas.getContext('2d'); v.drawn = 0; v.shownT = null; this.views.add(v); return v; }
  detachView(v) { this.views.delete(v); }
  viewChanged(v) { v.dirty = true; }
  frameTime(origin, h) { const r = this.sceneOf(origin, h); return r && r.presented ? r.t : null; }
  render() {
    if (this.lost) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const v of this.views) {
      if (!v.dirty) continue;
      const cv = v.canvas;
      if (!cv.isConnected || cv.offsetParent === null) continue;      // 不可见的视图等露出后再画，画的仍是当前已提交的状态
      const w = Math.max(2, Math.round(v.w * dpr)), h = Math.max(2, Math.round(v.h * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const rec = this.sceneOf(v.sys, v.scene);
      if (!rec) { v.ctx.fillStyle = '#0a0d14'; v.ctx.fillRect(0, 0, w, h); v.dirty = false; continue; }
      const R = this.renderer;
      if (this.canvas.width < w || this.canvas.height < h) R.setSize(Math.max(this.canvas.width, w), Math.max(this.canvas.height, h), false);
      if (rec.applied !== rec.version) rec.applyLayers();
      const cam = rec.camera, c = rec.cam;
      cam.fov = c.fov; cam.aspect = w / h; cam.position.set(c.p[0], c.p[1], c.p[2]); cam.up.set(0, 1, 0); cam.lookAt(c.look[0], c.look[1], c.look[2]); cam.updateProjectionMatrix();
      if (rec.sun) { const f = c.look; rec.sun.target.position.set(f[0], f[1], f[2]); rec.sun.position.set(f[0] + rec.sunVec.x * 160, f[1] + rec.sunVec.y * 160, f[2] + rec.sunVec.z * 160); }
      rec.pNorm.material.uniforms.uScale.value = h / (2 * Math.tan(c.fov * DEG / 2));
      rec.pAdd.material.uniforms.uScale.value = rec.pNorm.material.uniforms.uScale.value;
      rec.sortParticles(cam);
      const ch = this.canvas.height;
      R.setViewport(0, ch - h, w, h); R.setScissor(0, ch - h, w, h); R.setScissorTest(true);
      R.render(rec.scene, cam);
      v.ctx.drawImage(this.canvas, 0, 0, w, h, 0, 0, w, h);
      v.dirty = false; v.drawn++; v.shownT = rec.t; this.frames++;
    }
  }
  // 检查用：主动丢失并恢复上下文
  testContextLoss() { const ext = this.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return false; ext.loseContext(); setTimeout(() => ext.restoreContext(), 300); return true; }
}
window.Device3D = Device3D;
