'use strict';
// 显示设备（三维部分）：单个共享 WebGL2 渲染器绘制全部三维视图。
// 程序提交场景资源与逐时刻状态（可复制数据）；设备只按提交内容绘制，不推进场景状态。
// 相同的提交得到相同的画面；两次提交之间画面不变。
const THREE = require('three');
const d2 = require('./device2d.js');

let renderer = null;
let glCanvas = null;
let maxW = 64, maxH = 64;
const scenes = new Map(); // handle -> sceneRec
let handleCounter = 0;
let lost = false;

function ensureRenderer() {
  if (renderer) return renderer;
  glCanvas = document.createElement('canvas');
  glCanvas.width = maxW; glCanvas.height = maxH;
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  glCanvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  glCanvas.addEventListener('webglcontextrestored', () => { lost = false; });
  return renderer;
}

// ---------- 纹理生成（贴图由设备按资源描述绘制，可预先生成） ----------
const texCache = new Map();
function makeTexture(desc) {
  const key = JSON.stringify(desc);
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = desc.w || 256; cv.height = desc.h || 256;
  const ctx = cv.getContext('2d');
  for (const op of desc.ops || []) {
    switch (op.op) {
      case 'fill': ctx.fillStyle = op.color; ctx.fillRect(0, 0, cv.width, cv.height); break;
      case 'rect': ctx.fillStyle = op.color; ctx.fillRect(op.x, op.y, op.w, op.h); break;
      case 'gradient': {
        const g = op.dir === 'h' ? ctx.createLinearGradient(0, 0, cv.width, 0) : ctx.createLinearGradient(0, 0, 0, cv.height);
        g.addColorStop(0, op.from); g.addColorStop(1, op.to);
        ctx.fillStyle = g; ctx.fillRect(op.x || 0, op.y || 0, op.w || cv.width, op.h || cv.height);
        break;
      }
      case 'text':
        ctx.fillStyle = op.color;
        ctx.font = (op.weight || 'bold') + ' ' + op.size + 'px ' + (op.font === 'mono' ? 'Consolas, monospace' : '"Microsoft YaHei", sans-serif');
        ctx.textAlign = op.align || 'center';
        ctx.textBaseline = op.base || 'middle';
        ctx.fillText(op.text, op.x, op.y);
        break;
      case 'circle': ctx.fillStyle = op.color; ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, 7); ctx.fill(); break;
      case 'line': ctx.strokeStyle = op.color; ctx.lineWidth = op.lw || 2; ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke(); break;
      case 'noise': {
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        let s = op.seed || 7;
        for (let i = 0; i < img.data.length; i += 4) {
          s = (s * 1664525 + 1013904223) >>> 0;
          const n = ((s / 4294967296) - 0.5) * (op.amount || 18);
          img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
        break;
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}
let softTex = null;
function softParticleTexture() {
  if (softTex) return softTex;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(cv);
  return softTex;
}

// ---------- 地形 ----------
function terrainHeight(res, x, z) {
  const t = res.terrain;
  if (!t) return 0;
  let h = t.base || 0;
  for (const w of t.waves || []) {
    h += w.amp * Math.sin(w.freq * ((w.dx || 1) * x + (w.dz || 0) * z) + (w.phase || 0));
  }
  // 停机坪压平
  for (const pad of res.pads || []) {
    const px = pad.pos[0], pz = pad.pos[1];
    const d = Math.sqrt((x - px) * (x - px) + (z - pz) * (z - pz));
    const r = pad.r || 8;
    if (d < r * 1.6) {
      let ph = t.base || 0;
      for (const w of t.waves || []) ph += w.amp * Math.sin(w.freq * ((w.dx || 1) * px + (w.dz || 0) * pz) + (w.phase || 0));
      const k = Math.max(0, Math.min(1, (d - r) / (r * 0.6)));
      const s = k * k * (3 - 2 * k);
      h = ph * (1 - s) + h * s;
    }
  }
  return h;
}

function buildGeometry(g) {
  switch (g.type) {
    case 'box': return new THREE.BoxGeometry(g.w, g.h, g.d);
    case 'cylinder': return new THREE.CylinderGeometry(g.rt, g.rb, g.h, g.seg || 16);
    case 'sphere': return new THREE.SphereGeometry(g.r, g.ws || 18, g.hs || 14);
    case 'cone': return new THREE.ConeGeometry(g.r, g.h, g.seg || 14);
    case 'plane': return new THREE.PlaneGeometry(g.w, g.h);
    case 'capsule': return new THREE.CapsuleGeometry(g.r, g.len, 6, 14);
    case 'torus': return new THREE.TorusGeometry(g.r, g.tube, 10, 24);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}
function buildMaterial(m, res) {
  const opts = {
    color: new THREE.Color(m.color || '#888888'),
    roughness: m.roughness === undefined ? 0.7 : m.roughness,
    metalness: m.metalness === undefined ? 0.1 : m.metalness
  };
  if (m.map && res.textures && res.textures[m.map]) opts.map = makeTexture(res.textures[m.map]);
  if (m.emissive) { opts.emissive = new THREE.Color(m.emissive); opts.emissiveIntensity = m.emissiveIntensity || 1; }
  if (m.transparent) { opts.transparent = true; opts.opacity = m.opacity === undefined ? 0.5 : m.opacity; }
  if (m.side === 'double') opts.side = THREE.DoubleSide;
  return new THREE.MeshStandardMaterial(opts);
}

function buildScene(handle, res) {
  const scene = new THREE.Scene();
  const env = res.environment || {};
  // 天空渐变
  const skyCv = document.createElement('canvas');
  skyCv.width = 2; skyCv.height = 256;
  const sctx = skyCv.getContext('2d');
  const sg = sctx.createLinearGradient(0, 0, 0, 256);
  sg.addColorStop(0, env.skyTop || '#1b2340');
  sg.addColorStop(1, env.skyBottom || '#4a3b6b');
  sctx.fillStyle = sg; sctx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  if (env.fog) scene.fog = new THREE.Fog(new THREE.Color(env.fog.color || '#2a2f55'), env.fog.near || 80, env.fog.far || 380);

  // 灯光
  const amb = new THREE.AmbientLight(new THREE.Color(env.ambient && env.ambient.color || '#8890c0'), env.ambient ? env.ambient.intensity : 0.5);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(new THREE.Color(env.sun && env.sun.color || '#ffe8c0'), env.sun ? env.sun.intensity : 1.6);
  const sp = (env.sun && env.sun.pos) || [60, 80, 30];
  sun.position.set(sp[0], sp[1], sp[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color(env.skyBottom || '#4a3b6b'), new THREE.Color('#20242e'), 0.35);
  scene.add(hemi);

  const nodeMap = new Map();
  const geoCache = new Map();
  const matCache = new Map();
  const getGeo = name => {
    if (!geoCache.has(name)) geoCache.set(name, buildGeometry(res.geometries[name] || { type: 'box', w: 1, h: 1, d: 1 }));
    return geoCache.get(name);
  };
  const getMat = name => {
    if (!matCache.has(name)) matCache.set(name, buildMaterial(res.materials[name] || {}, res));
    return matCache.get(name);
  };

  // 地形
  let terrainMesh = null;
  if (res.terrain) {
    const t = res.terrain;
    const size = t.size || 400, seg = t.segments || 90;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c1 = new THREE.Color(t.color1 || '#3d5a3a');
    const c2 = new THREE.Color(t.color2 || '#6a7d4a');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(res, x, z);
      pos.setY(i, h);
      const k = Math.max(0, Math.min(1, (h + 2) / 8));
      const c = c1.clone().lerp(c2, k);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: t.roughness || 0.95, metalness: 0 });
    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = '__terrain';
    scene.add(terrainMesh);
  }
  // 停机坪
  for (const pad of res.pads || []) {
    const py = terrainHeight(res, pad.pos[0], pad.pos[1]);
    const g = new THREE.CylinderGeometry(pad.r, pad.r, 0.3, 40);
    const tex = makeTexture({
      w: 256, h: 256, ops: [
        { op: 'fill', color: pad.color || '#3a3f52' },
        { op: 'circle', x: 128, y: 128, r: 100, color: 'rgba(245,185,66,0.9)' },
        { op: 'circle', x: 128, y: 128, r: 86, color: pad.color || '#3a3f52' },
        { op: 'text', text: pad.label || 'H', x: 128, y: 132, size: 110, color: '#f5b942', weight: 'bold' }
      ]
    });
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    m.position.set(pad.pos[0], py + 0.12, pad.pos[1]);
    m.receiveShadow = true;
    m.name = '__pad_' + pad.name;
    scene.add(m);
  }
  // 节点树
  const nodes = res.nodes || [];
  for (const n of nodes) {
    const mesh = new THREE.Mesh(getGeo(n.geo), getMat(n.mat));
    mesh.name = n.name;
    if (n.pos) mesh.position.set(n.pos[0], n.pos[1], n.pos[2]);
    if (n.rot) mesh.rotation.set(n.rot[0], n.rot[1], n.rot[2]);
    if (n.scale) mesh.scale.set(n.scale[0], n.scale[1], n.scale[2]);
    const sh = n.shadow || 'both';
    mesh.castShadow = sh === 'cast' || sh === 'both';
    mesh.receiveShadow = sh === 'receive' || sh === 'both';
    mesh.userData.basePos = mesh.position.clone();
    mesh.userData.baseRot = mesh.rotation.clone();
    mesh.userData.baseMat = mesh.material;
    nodeMap.set(n.name, mesh);
  }
  for (const n of nodes) {
    const mesh = nodeMap.get(n.name);
    if (n.parent && nodeMap.has(n.parent)) nodeMap.get(n.parent).add(mesh);
    else scene.add(mesh);
  }
  // 树木草地（由场景描述布置，确定性随机）
  const scatter = res.scatter;
  const grassGroup = new THREE.Group();
  if (scatter && scatter.grass) {
    const g = scatter.grass;
    let s = g.seed || 11;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const bladeGeo = new THREE.ConeGeometry(0.16, 0.9, 4);
    bladeGeo.translate(0, 0.45, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(g.color || '#5d7a42'), roughness: 1 });
    const count = g.count || 500;
    const inst = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
    const dummy = new THREE.Object3D();
    const bases = [];
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * (g.range || 120);
      const z = (rnd() - 0.5) * (g.range || 120);
      const y = terrainHeight(res, x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rnd() * 6.28, 0);
      const sc = 0.7 + rnd() * 0.9;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      bases.push({ x, y, z, sc, rot: dummy.rotation.y });
    }
    inst.receiveShadow = true;
    grassGroup.add(inst);
    grassGroup.userData = { inst, bases, dummy };
  }
  scene.add(grassGroup);

  // 粒子池
  const particleGroup = new THREE.Group();
  scene.add(particleGroup);
  const debrisGroup = new THREE.Group();
  scene.add(debrisGroup);
  const scorchGroup = new THREE.Group();
  scene.add(scorchGroup);

  // 旋翼模糊盘
  let blurDisc = null;
  const rig = res.rig;
  if (rig && rig.rotor) {
    const rr = rig.rotorRadius || 5;
    const g = new THREE.CircleGeometry(rr, 40);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfd3e8'), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    blurDisc = new THREE.Mesh(g, m);
    blurDisc.name = '__blur';
    const rotorNode = nodeMap.get(rig.rotor);
    if (rotorNode) rotorNode.add(blurDisc);
  }

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 800);
  const rec = {
    handle, res, scene, nodeMap, camera, terrainMesh, grassGroup, particleGroup, debrisGroup, scorchGroup, blurDisc,
    parts: { heli: null, fx: null, cam: null },
    geoCache, matCache,
    dirty: true,
    version: 0
  };
  scenes.set(handle, rec);
  return rec;
}

const PARTICLE_COLORS = { dust: '#c9b078', smoke: '#5a5a64', fire: '#ff8838', spark: '#ffd068', steam: '#aab4c8' };

function applyState(rec) {
  const res = rec.res;
  const heli = rec.parts.heli;
  const fx = rec.parts.fx;
  const rig = res.rig || {};
  // 直升机位姿
  if (heli && rig.root) {
    const root = rec.nodeMap.get(rig.root);
    if (root) {
      const p = heli.pos || [0, 0, 0];
      root.position.set(p[0], p[1], p[2]);
      const att = heli.att || [0, 0, 0];
      root.rotation.order = 'YXZ';
      root.rotation.set(att[1], att[2], att[0]);
      if (heli.rootExtra) {
        root.rotation.x += heli.rootExtra[0] || 0;
        root.rotation.z += heli.rootExtra[1] || 0;
      }
    }
    if (rig.rotor) {
      const rotor = rec.nodeMap.get(rig.rotor);
      if (rotor) rotor.rotation.y = heli.rotorAngle || 0;
    }
    if (rig.tailRotor) {
      const tr = rec.nodeMap.get(rig.tailRotor);
      if (tr) tr.rotation.x = heli.tailAngle || 0;
    }
    // 部件损坏：确定性位姿偏移与焦黑材质
    const damage = heli.damage || {};
    for (const part of rig.damageable || []) {
      const node = rec.nodeMap.get(part);
      if (!node) continue;
      const d = damage[part] || 0;
      node.position.copy(node.userData.basePos);
      node.rotation.copy(node.userData.baseRot);
      if (d > 0) {
        node.rotation.z += d * (node.userData.dmgTilt || 0.5);
        node.position.y -= d * (node.userData.dmgDrop || 0.15);
        if (d > 0.55 && node.userData.baseMat) {
          if (!node.userData.charMat) {
            const cm = node.userData.baseMat.clone();
            cm.color = new THREE.Color('#2b2420');
            cm.roughness = 0.95;
            node.userData.charMat = cm;
          }
          node.material = node.userData.charMat;
        } else node.material = node.userData.baseMat;
      } else if (node.userData.baseMat) node.material = node.userData.baseMat;
      node.visible = !(heli.hidden && heli.hidden[part]);
    }
    // 旋翼模糊（由提交的转速展开的画面细节）
    if (rec.blurDisc) {
      const rpm = heli.rpm || 0;
      const k = Math.max(0, Math.min(1, (rpm - 120) / 300));
      rec.blurDisc.material.opacity = k * 0.28;
      rec.blurDisc.visible = k > 0.05;
      for (const b of rig.blades || []) {
        const bn = rec.nodeMap.get(b);
        if (bn) {
          if (!bn.userData.bladeMat && bn.userData.baseMat) {
            bn.userData.bladeMat = bn.userData.baseMat.clone();
            bn.userData.bladeMat.transparent = true;
          }
          if (bn.userData.bladeMat) {
            bn.userData.bladeMat.opacity = 1 - k * 0.75;
            bn.material = bn.userData.bladeMat;
          }
        }
      }
    }
  }
  // 粒子
  const pg = rec.particleGroup;
  const parts = (fx && fx.particles) || [];
  while (pg.children.length < parts.length) {
    const mat = new THREE.SpriteMaterial({ map: softParticleTexture(), transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    pg.add(sp);
  }
  while (pg.children.length > parts.length) pg.remove(pg.children[pg.children.length - 1]);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const sp = pg.children[i];
    sp.position.set(p.pos[0], p.pos[1], p.pos[2]);
    const s = p.size || 1;
    sp.scale.set(s, s, 1);
    const lifeK = p.maxLife ? Math.max(0, Math.min(1, p.life / p.maxLife)) : 0.5;
    sp.material.color.set(PARTICLE_COLORS[p.kind] || '#aaaaaa');
    sp.material.opacity = (p.opacity === undefined ? 0.5 : p.opacity) * (p.kind === 'fire' ? 0.5 + lifeK * 0.5 : lifeK);
    sp.material.rotation = (p.seed || 0) * 6.28;
  }
  // 碎片（有厚度的部件）
  const dg = rec.debrisGroup;
  const debris = (fx && fx.debris) || [];
  while (dg.children.length < debris.length) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#5e3a86', roughness: 0.8 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    dg.add(mesh);
  }
  while (dg.children.length > debris.length) dg.remove(dg.children[dg.children.length - 1]);
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i];
    const mesh = dg.children[i];
    if (d.geo && rec.geoCache.has(d.geo)) mesh.geometry = rec.geoCache.get(d.geo);
    if (d.mat && rec.matCache.has(d.mat)) mesh.material = rec.matCache.get(d.mat);
    mesh.position.set(d.pos[0], d.pos[1], d.pos[2]);
    mesh.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
    const s = d.scale || [1, 1, 1];
    mesh.scale.set(s[0], s[1], s[2]);
  }
  // 焦痕
  const sg = rec.scorchGroup;
  const scorch = (fx && fx.scorch) || [];
  while (sg.children.length < scorch.length) {
    const g = new THREE.CircleGeometry(1, 24);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.55, depthWrite: false }));
    sg.add(mesh);
  }
  while (sg.children.length > scorch.length) sg.remove(sg.children[sg.children.length - 1]);
  for (let i = 0; i < scorch.length; i++) {
    const s = scorch[i];
    const mesh = sg.children[i];
    mesh.position.set(s.pos[0], terrainHeight(res, s.pos[0], s.pos[2]) + 0.06, s.pos[2]);
    mesh.scale.set(s.r, 1, s.r);
  }
  // 下洗气流压倒草叶（由提交的直升机位置与转速展开）
  const gg = rec.grassGroup;
  if (gg.userData.inst && heli) {
    const { inst, bases, dummy } = gg.userData;
    const hp = heli.pos || [0, 0, 0];
    const rpm = heli.rpm || 0;
    const strength = Math.max(0, Math.min(1, (rpm - 80) / 350)) * Math.max(0, 1 - Math.max(0, hp[1] - terrainHeight(res, hp[0], hp[2])) / 14);
    for (let i = 0; i < bases.length; i++) {
      const b = bases[i];
      const dx = b.x - hp[0], dz = b.z - hp[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      const infl = strength * Math.max(0, 1 - dist / 12);
      dummy.position.set(b.x, b.y, b.z);
      const ang = Math.atan2(dz, dx);
      dummy.rotation.set(infl * 1.1 * Math.cos(ang), b.rot, infl * 1.1 * Math.sin(ang));
      dummy.scale.set(b.sc, b.sc * (1 - infl * 0.5), b.sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  }
  // 相机
  const cam = rec.parts.cam && rec.parts.cam.camera;
  if (cam) {
    rec.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    rec.camera.lookAt(new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2]));
    rec.camera.fov = cam.fov || 55;
    rec.camera.updateProjectionMatrix();
  }
  // 太阳跟随场景中心，保证投影覆盖
  const sun = rec.scene.children.find(c => c.isDirectionalLight);
  if (sun && heli && heli.pos) {
    const base = (res.environment && res.environment.sun && res.environment.sun.pos) || [60, 80, 30];
    sun.position.set(heli.pos[0] + base[0] * 0.6, base[1], heli.pos[2] + base[2] * 0.6);
    sun.target.position.set(heli.pos[0], 0, heli.pos[2]);
  }
  rec.dirty = false;
  rec.version++;
}

const device3d = {
  load(res) {
    ensureRenderer();
    const handle = 'sc-' + (++handleCounter);
    buildScene(handle, res);
    return handle;
  },
  setState(handle, state) {
    const rec = scenes.get(handle);
    if (!rec || !state) return;
    const part = state.part || 'heli';
    rec.parts[part] = state;
    rec.dirty = true;
  },
  getState(handle) {
    const rec = scenes.get(handle);
    return rec ? rec.parts : null;
  },
  frameTime(handle) {
    const rec = scenes.get(handle);
    if (!rec) return 0;
    return rec.parts.heli ? (rec.parts.heli.t || 0) : 0;
  },
  close(handle) {
    const rec = scenes.get(handle);
    if (!rec) return;
    rec.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    scenes.delete(handle);
  },
  has(handle) { return scenes.has(handle); },
  renderTo(handle, ctx, dx, dy, w, h) {
    const rec = scenes.get(handle);
    if (!rec || lost || w < 4 || h < 4) return false;
    ensureRenderer();
    if (rec.dirty) applyState(rec);
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rw = Math.max(8, Math.round(w * pr)), rh = Math.max(8, Math.round(h * pr));
    if (rw > maxW || rh > maxH) {
      maxW = Math.max(maxW, rw); maxH = Math.max(maxH, rh);
      renderer.setSize(maxW, maxH, false);
    }
    rec.camera.aspect = w / h;
    rec.camera.updateProjectionMatrix();
    renderer.setViewport(0, 0, rw, rh);
    renderer.setScissor(0, 0, rw, rh);
    renderer.setScissorTest(true);
    renderer.render(rec.scene, rec.camera);
    ctx.drawImage(glCanvas, 0, glCanvas.height - rh, rw, rh, dx, dy, w, h);
    return true;
  },
  pick(handle, nx, ny, w, h) {
    const rec = scenes.get(handle);
    if (!rec) return null;
    if (rec.dirty) applyState(rec);
    rec.camera.aspect = w / h;
    rec.camera.updateProjectionMatrix();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), rec.camera);
    const rig = rec.res.rig || {};
    const targets = [];
    for (const name of [rig.root, ...(rig.damageable || [])]) {
      const n = rec.nodeMap.get(name);
      if (n) targets.push(n);
    }
    const hits = ray.intersectObjects(targets, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.name) o = o.parent;
      return { part: o ? o.name : null, point: [hits[0].point.x, hits[0].point.y, hits[0].point.z] };
    }
    if (rec.terrainMesh) {
      const gh = ray.intersectObject(rec.terrainMesh, false);
      if (gh.length) return { ground: [gh[0].point.x, gh[0].point.y, gh[0].point.z] };
    }
    return null;
  },
  memSize() {
    let t = 0;
    for (const rec of scenes.values()) {
      t += JSON.stringify(rec.res).length;
      for (const k of Object.keys(rec.parts)) if (rec.parts[k]) t += JSON.stringify(rec.parts[k]).length;
    }
    return t;
  },
  snapshotHandles() {
    const out = [];
    for (const [handle, rec] of scenes.entries()) out.push({ handle, res: rec.res, parts: rec.parts });
    return out;
  },
  restoreHandle(handle, res, parts) {
    ensureRenderer();
    buildScene(handle, res);
    const rec = scenes.get(handle);
    rec.parts = parts || { heli: null, fx: null, cam: null };
    rec.dirty = true;
    return handle;
  },
  isLost() { return lost; }
};

module.exports = device3d;
