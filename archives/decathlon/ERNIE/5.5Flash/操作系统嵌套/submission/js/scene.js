// 三维场景渲染：地形、停机坪、建筑、树木、直升机、烟尘与碎片
import * as THREE from '../vendor/three.module.min.js';
import { buildTerrainGeometry, terrainHeight, groundInfo } from './terrain.js';
import { clamp, lerp, hash1, mulberry32, TAU } from './util.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function skyTexture(env) {
  return canvasTexture(16, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, env.skyTop || '#0d1730');
    g.addColorStop(0.48, env.skyMid || '#5c5d94');
    g.addColorStop(0.78, env.skyBottom || '#f0a76e');
    g.addColorStop(1, env.skyBottom || '#f0a76e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,190,110,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(0.35, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

function smokeTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(120,116,118,0.85)');
    g.addColorStop(0.5, 'rgba(90,88,92,0.5)');
    g.addColorStop(1, 'rgba(70,70,74,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

function numberTexture(text, color = '#ffd23f') {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = '900 104px "Arial Black", "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(30,12,60,.85)';
    ctx.strokeText(text, w / 2, h / 2 + 4);
    ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

function padTexture(label = 'H') {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2a2e37'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2;
    for (let i = 0; i < 512; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 196, 0, TAU); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,210,63,.6)';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 160, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.font = '900 210px "Arial Black", "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label || 'H', w / 2, h / 2 + 12);
    ctx.font = '600 34px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,210,63,.8)';
    ctx.fillText('NESTED AIRFIELD', w / 2, 440);
  });
}

export class SceneView {
  constructor(canvas, def, opts = {}) {
    this.canvas = canvas;
    this.def = def;
    this.terrainDef = { ...(def.terrain || {}), pads: def.pads || [] };
    this.opts = opts;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.raycaster = new THREE.Raycaster();
    this.heli = null;
    this.parts = [];
    this.mainRotor = null;
    this.tailRotor = null;
    this.blur = null;
    this.terrainMesh = null;
    this.dust = null;
    this.smoke = [];
    this.fire = [];
    this.debris = [];
    this.crashPoint = null;
    this.contextLost = false;
    this.disposed = false;
    this.lastW = 0; this.lastH = 0;
    this._init();
  }

  _init() {
    const canvas = this.canvas;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) {
      this.failed = true;
      this.error = '无法创建 WebGL 上下文';
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.def.environment?.exposure ?? 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; });

    const scene = new THREE.Scene();
    this.scene = scene;
    const env = this.def.environment || {};
    scene.background = skyTexture(env);
    scene.fog = new THREE.Fog(env.fogColor || '#7a7290', env.fogNear ?? 130, env.fogFar ?? 620);

    const hemi = new THREE.HemisphereLight(env.hemiSky || '#b6c8ff', env.hemiGround || '#3a2d2a', 0.85);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, env.ambient ?? 0.5);
    scene.add(amb);
    const sunDir = new THREE.Vector3(...(env.sun || [0.55, 0.42, -0.35])).normalize();
    const sun = new THREE.DirectionalLight(env.sunColor || '#ffd7a0', env.intensity ?? 1.55);
    sun.position.copy(sunDir.clone().multiplyScalar(160));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.sunDir = sunDir;

    // 太阳光晕
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,246,220,1)', 'rgba(255,190,110,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9
    }));
    sunSprite.position.copy(sunDir.clone().multiplyScalar(520));
    sunSprite.scale.set(130, 130, 1);
    scene.add(sunSprite);

    // 地形
    const geo = buildTerrainGeometry(THREE, this.terrainDef);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);
    this.terrainMesh = terrain;

    // 停机坪
    this.padMeshes = [];
    for (const p of this.def.pads || []) {
      const y = terrainHeight(p.x, p.z, this.terrainDef);
      const tex = padTexture(p.label || 'H');
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(p.r || 10, 56),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.08 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, y + 0.07, p.z);
      m.receiveShadow = true;
      scene.add(m);
      this.padMeshes.push(m);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry((p.r || 10) + 0.5, (p.r || 10) + 1.4, 56),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y + 0.06, p.z);
      scene.add(ring);
    }

    this._buildBuildings();
    this._buildNature();
    this._buildHelicopter();
    this._buildEffects();

    const cam = this.def.camera || {};
    this.camera = new THREE.PerspectiveCamera(cam.fov || 46, 1, cam.near || 0.5, cam.far || 1400);
    this.camera.position.set(16, 8, 20);
    this.camera.lookAt(0, 2, 0);
    this.resize();
  }

  _buildBuildings() {
    const list = this.def.buildings || [];
    for (const b of list) {
      const g = new THREE.Group();
      const color = new THREE.Color(b.color || '#6b6f78');
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.15 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9 });
      if (b.type === 'hangar') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h * 0.62, b.d), mat);
        body.position.y = b.h * 0.31; body.castShadow = true; body.receiveShadow = true; g.add(body);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(b.w / 2, b.w / 2, b.d, 24, 1, false, 0, Math.PI), mat);
        roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
        roof.position.y = b.h * 0.62; roof.castShadow = true; g.add(roof);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.55, b.h * 0.5), dark);
        door.position.set(0, b.h * 0.26, b.d / 2 + 0.02); g.add(door);
      } else if (b.type === 'tower') {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.55, b.h * 0.72, b.d * 0.55), mat);
        shaft.position.y = b.h * 0.36; shaft.castShadow = true; shaft.receiveShadow = true; g.add(shaft);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h * 0.18, b.d), new THREE.MeshStandardMaterial({ color: 0x2f3b52, roughness: 0.35, metalness: 0.5, emissive: 0x1b2a45, emissiveIntensity: 0.4 }));
        cabin.position.y = b.h * 0.8; cabin.castShadow = true; g.add(cabin);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.08, 0.3, b.d * 1.08), dark);
        roof.position.y = b.h * 0.9; g.add(roof);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), dark);
        ant.position.y = b.h + 1.9; g.add(ant);
      } else if (b.type === 'silo') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(b.w / 2, b.w / 2, b.h, 20), mat);
        body.position.y = b.h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
        const top = new THREE.Mesh(new THREE.ConeGeometry(b.w / 2, b.w * 0.4, 20), mat);
        top.position.y = b.h + b.w * 0.2; top.castShadow = true; g.add(top);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
        body.position.y = b.h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
        if (b.type === 'container') {
          for (let i = 0; i < 6; i++) {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, b.h * 0.9, 0.08), dark);
            rib.position.set(-b.w / 2 + 0.4 + i * (b.w - 0.8) / 5, b.h / 2, b.d / 2 + 0.02);
            g.add(rib);
          }
        }
      }
      g.position.set(b.x, terrainHeight(b.x, b.z, this.terrainDef), b.z);
      g.rotation.y = b.rot || 0;
      this.scene.add(g);
    }
  }

  _buildNature() {
    const rnd = mulberry32((this.def.terrain?.seed || 24) * 7919 + 13);
    const pads = this.def.pads || [];
    const avoid = (x, z) => {
      for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < (p.r || 10) + 7) return true;
      for (const b of this.def.buildings || []) if (Math.abs(x - b.x) < b.w * 0.8 + 4 && Math.abs(z - b.z) < b.d * 0.8 + 4) return true;
      return false;
    };
    const treeCount = this.def.trees ?? 40;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x3d6b42, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x274b33, roughness: 0.95 })
    ];
    let placed = 0, guard = 0;
    while (placed < treeCount && guard < treeCount * 40) {
      guard++;
      const x = (rnd() - 0.5) * 440;
      const z = (rnd() - 0.5) * 440;
      if (avoid(x, z)) continue;
      const y = terrainHeight(x, z, this.terrainDef);
      const s = 0.7 + rnd() * 0.9;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2.2 * s, 6), trunkMat);
      trunk.position.y = 1.1 * s; trunk.castShadow = true; g.add(trunk);
      const leafMat = leafMats[Math.floor(rnd() * leafMats.length)];
      if (rnd() > 0.45) {
        for (let k = 0; k < 3; k++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry((1.5 - k * 0.3) * s, 2.3 * s, 7), leafMat);
          cone.position.y = (2.4 + k * 1.1) * s; cone.castShadow = true; cone.receiveShadow = true; g.add(cone);
        }
      } else {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 * s, 0), leafMat);
        crown.position.y = 3.1 * s; crown.scale.y = 1.2; crown.castShadow = true; g.add(crown);
        const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 * s, 0), leafMat);
        crown2.position.set(1.1 * s, 2.6 * s, 0.4 * s); crown2.castShadow = true; g.add(crown2);
      }
      g.position.set(x, y, z);
      g.rotation.y = rnd() * TAU;
      this.scene.add(g);
      placed++;
    }

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a544e, roughness: 1 });
    for (let i = 0; i < (this.def.rocks ?? 12); i++) {
      const x = (rnd() - 0.5) * 420, z = (rnd() - 0.5) * 420;
      if (avoid(x, z)) continue;
      const r = 0.6 + rnd() * 2.2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      rock.position.set(x, terrainHeight(x, z, this.terrainDef) + r * 0.35, z);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      this.scene.add(rock);
    }

    // 草丛（实例化，增强地面细节）
    const grassGeo = new THREE.ConeGeometry(0.16, 0.7, 3);
    grassGeo.translate(0, 0.35, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 1, side: THREE.DoubleSide });
    const count = 900;
    const inst = new THREE.InstancedMesh(grassGeo, grassMat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let gi = 0, g2 = 0;
    while (gi < count && g2 < count * 8) {
      g2++;
      const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 300;
      if (avoid(x, z)) continue;
      const y = terrainHeight(x, z, this.terrainDef);
      pos.set(x, y, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU);
      const s = 0.7 + rnd() * 1.2;
      sc.set(s, s * (0.7 + rnd() * 0.8), s);
      m4.compose(pos, q, sc);
      inst.setMatrixAt(gi++, m4);
    }
    inst.count = gi;
    inst.receiveShadow = true;
    this.scene.add(inst);
  }

  _buildHelicopter() {
    const cfg = this.def.helicopter || {};
    const bodyColor = new THREE.Color(cfg.body || '#7b3fe4');
    const darkColor = new THREE.Color(cfg.bodyDark || '#4e2596');
    const accent = new THREE.Color(cfg.accent || '#ffd23f');
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.32, metalness: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.42, metalness: 0.5 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.38, metalness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x101b2e, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.92 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.3, metalness: 0.9 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7, metalness: 0.3 });

    const heli = new THREE.Group();
    heli.name = 'helicopter';
    const add = (mesh, part, key, name) => {
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.part = part; mesh.userData.partKey = key; mesh.userData.partName = name || part;
      heli.add(mesh); this.parts.push(mesh);
      return mesh;
    };

    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), bodyMat);
    body.scale.set(1.06, 0.95, 2.05); body.position.y = 0.25;
    add(body, '机身', 'body', '主机身');

    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), darkMat);
    belly.scale.set(0.92, 0.62, 1.75); belly.position.y = -0.2;
    add(belly, '机身', 'belly', '机腹');

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), glassMat);
    cockpit.scale.set(0.92, 0.72, 0.95); cockpit.position.set(0, 0.55, 1.35);
    add(cockpit, '座舱', 'cockpit', '驾驶舱玻璃');

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), bodyMat);
    nose.scale.set(0.9, 0.7, 1.2); nose.position.set(0, 0.05, 1.95);
    add(nose, '机头', 'nose', '机头');

    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.42), glassMat);
      win.position.set(side * 0.93, 0.42, 0.75);
      win.rotation.y = side * Math.PI / 2;
      add(win, '座舱', 'window', '侧窗');
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 2.9), accentMat);
      stripe.position.set(side * 1.02, 0.18, 0.2);
      add(stripe, '涂装', 'stripe', '黄色识别条');
    }

    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 1.5), darkMat);
    engine.position.set(0, 1.02, -0.55);
    add(engine, '发动机', 'engine', '发动机舱');
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.9, 14), blackMat);
    intake.rotation.z = Math.PI / 2; intake.position.set(0, 1.05, 0.55);
    add(intake, '发动机', 'intake', '进气口');

    const tail = new THREE.Group();
    const tl = cfg.tailScale ?? 1;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.4, 4.5 * tl, 14), bodyMat);
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.35, -3.35 * tl);
    add(boom, '尾梁', 'tailboom', '尾梁');
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.45, 0.95), bodyMat);
    fin.position.set(0, 1.05, -5.35 * tl); fin.rotation.x = -0.18;
    add(fin, '尾翼', 'tailfin', '垂直尾翼');
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.8), accentMat);
    finTip.position.set(0, 1.62, -5.45 * tl); finTip.rotation.x = -0.18;
    add(finTip, '尾翼', 'fintip', '尾翼涂装');
    const stab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.55), accentMat);
    stab.position.set(0, 0.62, -4.65 * tl);
    add(stab, '尾翼', 'stab', '水平安定面');
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.18, 1.05, -5.5 * tl);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.13), blackMat);
      blade.rotation.x = i * Math.PI / 2;
      tailRotor.add(blade);
    }
    const trHub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), metalMat);
    tailRotor.add(trHub);
    tailRotor.children.forEach(c => { c.castShadow = true; c.userData.part = '尾桨'; c.userData.partKey = 'tailrotor'; c.userData.partName = '尾桨'; this.parts.push(c); });
    tail.add(tailRotor);
    heli.add(tail);
    this.tailRotor = tailRotor;

    const skidMat = metalMat;
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 8), skidMat);
      skid.rotation.x = Math.PI / 2; skid.position.set(side * 0.95, -1.02, 0.1);
      add(skid, '起落架', 'skid', '滑橇');
      for (const z of [-0.9, 0.9]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 6), skidMat);
        strut.position.set(side * 0.72, -0.6, z); strut.rotation.z = side * 0.35;
        add(strut, '起落架', 'strut', '起落架支柱');
      }
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.55, 10), metalMat);
    mast.position.set(0, 1.5, 0.1);
    add(mast, '主旋翼', 'mast', '旋翼轴');

    const rotor = new THREE.Group();
    const rs = cfg.rotorScale ?? 1;
    rotor.position.set(0, 1.78, 0.1);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), metalMat);
    hub.scale.y = 0.6; rotor.add(hub);
    for (let i = 0; i < 4; i++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = i * Math.PI / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 5.3 * rs), blackMat);
      blade.position.set(0, 0, 2.75 * rs);
      blade.rotation.x = 0.02;
      blade.castShadow = true;
      blade.userData.part = '主旋翼'; blade.userData.partKey = 'mainrotor'; blade.userData.partName = '主旋翼';
      bladePivot.add(blade); this.parts.push(blade);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.35), accentMat);
      tip.position.set(0, 0, 5.15 * rs); tip.castShadow = true;
      tip.userData.part = '主旋翼'; tip.userData.partKey = 'mainrotor'; tip.userData.partName = '主旋翼';
      bladePivot.add(tip); this.parts.push(tip);
      rotor.add(bladePivot);
    }
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(5.45 * rs, 48),
      new THREE.MeshBasicMaterial({ color: 0x1a1424, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
    );
    blur.rotation.x = -Math.PI / 2; blur.position.y = 0.01;
    rotor.add(blur);
    heli.add(rotor);
    this.mainRotor = rotor;
    this.blur = blur;

    // 数字 24（贴合机身两侧）
    const numTex = numberTexture(cfg.number || '24', '#' + accent.getHexString());
    const numMat = new THREE.MeshStandardMaterial({ map: numTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.38, metalness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const side of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.62), numMat);
      plane.position.set(side * 1.045, 0.38, 0.15);
      plane.rotation.y = side * Math.PI / 2;
      plane.userData.part = '涂装'; plane.userData.partKey = 'number'; plane.userData.partName = '机身编号 24';
      heli.add(plane);
    }

    // 航行灯
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    red.position.set(-1.08, 0.3, -0.5);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x33ff88 }));
    green.position.set(1.08, 0.3, -0.5);
    heli.add(red); heli.add(green);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), blackMat);
    antenna.position.set(0, -0.55, -1.3); antenna.rotation.x = 0.3;
    heli.add(antenna);

    heli.scale.setScalar(cfg.scale || 1);
    this.heli = heli;
    this.scene.add(heli);
    this.heliBaseY = 0;
  }

  _buildEffects() {
    // 尘土
    const N = 180;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc9b18a, size: 0.5, transparent: true, opacity: 0.0,
      depthWrite: false, sizeAttenuation: true
    });
    const dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    this.scene.add(dust);
    this.dust = dust;
    this.dustCount = N;

    const smokeTex = smokeTexture();
    for (let i = 0; i < 30; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      this.scene.add(sp);
      this.smoke.push(sp);
    }
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,220,120,1)', 'rgba(255,80,20,0)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
      }));
      sp.visible = false;
      this.scene.add(sp);
      this.fire.push(sp);
    }
    const debrisMats = [
      new THREE.MeshStandardMaterial({ color: 0x3a2a5e, roughness: 0.6, metalness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x2b2e38, roughness: 0.7, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.8, metalness: 0.3 })
    ];
    for (let i = 0; i < 16; i++) {
      const s = 0.25 + hash1(i + 3) * 0.85;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s * 0.5, s), debrisMats[i % debrisMats.length]);
      m.castShadow = true; m.receiveShadow = true; m.visible = false;
      this.scene.add(m);
      this.debris.push(m);
    }
  }

  resize() {
    if (!this.renderer) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w; this.lastH = h;
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  pick(clientX, clientY) {
    if (!this.renderer || !this.camera || !this.heli) return null;
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.heli.children, true);
    for (const hit of hits) {
      let o = hit.object;
      if (!o.visible) continue;
      if (o.userData && o.userData.part) {
        return { part: o.userData.part, key: o.userData.partKey, name: o.userData.partName || o.userData.part };
      }
      o = o.parent;
    }
    return null;
  }

  groundHit(clientX, clientY) {
    if (!this.renderer || !this.camera || !this.terrainMesh) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    if (hits.length) return { x: hits[0].point.x, z: hits[0].point.z, y: hits[0].point.y };
    return null;
  }

  update(state) {
    if (!this.renderer || !this.heli) return;
    const t = state.time || 0;
    const h = state.heli || {};
    const heli = this.heli;
    heli.position.set(h.x || 0, h.y || 0, h.z || 0);
    const order = 'YXZ';
    heli.rotation.order = order;
    heli.rotation.y = h.yaw || 0;
    heli.rotation.x = h.pitch || 0;
    heli.rotation.z = -(h.roll || 0);
    heli.visible = h.visible !== false;
    const rotor = clamp(h.rotor ?? 0.5, 0, 1);
    const angle = h.rotorAngle ?? t * 38;
    if (this.mainRotor) this.mainRotor.rotation.y = angle;
    if (this.tailRotor) this.tailRotor.rotation.x = -angle * 3.2;
    if (this.blur) this.blur.material.opacity = rotor * 0.16;
    const dmg = clamp(h.damage || 0, 0, 1);
    if (this.mainRotor) {
      this.mainRotor.rotation.z = dmg > 0.7 ? (dmg - 0.7) * 0.55 : 0;
      this.mainRotor.position.y = 1.78 - dmg * 0.12;
    }
    if (this.tailRotor) this.tailRotor.visible = dmg < 0.96;

    this._updateEffects(state, rotor, dmg);
    this._updateCamera(state);
    this.renderer.render(this.scene, this.camera);
  }

  _updateEffects(state, rotor, dmg) {
    const t = state.time || 0;
    const h = state.heli || {};
    const hx = h.x || 0, hy = h.y || 0, hz = h.z || 0;
    const groundY = terrainHeight(hx, hz, this.terrainDef);
    const agl = Math.max(0, hy - groundY - 1.15);

    if (this.dust) {
      const intensity = clamp(rotor, 0, 1) * clamp(1 - agl / 9, 0, 1);
      const pos = this.dust.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < this.dustCount; i++) {
        const a = hash1(i * 1.7 + 2) * TAU + t * (0.5 + hash1(i) * 0.4);
        const rr = 1.2 + ((hash1(i * 3.1) + t * 0.22) % 1) * 6;
        const px = hx + Math.cos(a) * rr;
        const pz = hz + Math.sin(a) * rr;
        const py = terrainHeight(px, pz, this.terrainDef) + 0.12 + hash1(i * 5.3 + t * 0.3) * 0.8 * intensity;
        arr[i * 3] = px; arr[i * 3 + 1] = py; arr[i * 3 + 2] = pz;
      }
      pos.needsUpdate = true;
      this.dust.material.opacity = 0.24 * intensity;
      this.dust.visible = intensity > 0.01;
    }

    const crashT = state.crashT ?? -1;
    const crash = state.crashPos || null;
    const active = crashT >= 0 && crash && t >= crashT;

    for (let i = 0; i < this.smoke.length; i++) {
      const sp = this.smoke[i];
      if (!active) { sp.visible = false; continue; }
      const birth = crashT + i * 0.16;
      const age = t - birth;
      if (age < 0 || age > 7.5) { sp.visible = false; continue; }
      const a = hash1(i * 2.3) * TAU;
      const drift = 0.4 + hash1(i * 4.1) * 0.8;
      sp.visible = true;
      sp.position.set(
        crash.x + Math.cos(a) * (1 + age * drift) + age * 0.5,
        crash.y + 0.8 + age * (1.0 + hash1(i) * 0.5),
        crash.z + Math.sin(a) * (1 + age * drift)
      );
      const s = 2.2 + age * 1.25;
      sp.scale.set(s, s, 1);
      sp.material.opacity = 0.5 * clamp(1 - age / 7.5, 0, 1);
      sp.material.rotation = hash1(i) * TAU + age * 0.1;
    }

    for (let i = 0; i < this.fire.length; i++) {
      const sp = this.fire[i];
      if (!active) { sp.visible = false; continue; }
      const age = t - crashT - i * 0.05;
      if (age < 0 || age > 2.6) { sp.visible = false; continue; }
      sp.visible = true;
      const a = hash1(i * 5.1) * TAU;
      sp.position.set(
        crash.x + Math.cos(a) * (0.5 + hash1(i) * 1.6),
        crash.y + 0.5 + hash1(i * 2.7) * 1.1 + age * 0.9,
        crash.z + Math.sin(a) * (0.5 + hash1(i) * 1.6)
      );
      const s = 1.4 + Math.sin(age * 18 + i) * 0.35 + age * 0.8;
      sp.scale.set(s, s, 1);
      sp.material.opacity = 0.85 * clamp(1 - age / 2.6, 0, 1);
    }

    for (let i = 0; i < this.debris.length; i++) {
      const m = this.debris[i];
      if (!active) { m.visible = false; continue; }
      const dt = t - crashT - i * 0.012;
      if (dt < 0) { m.visible = false; continue; }
      m.visible = true;
      const a = hash1(i * 7.3) * TAU;
      const sp = 3 + hash1(i * 2.1) * 11;
      let px = crash.x + Math.cos(a) * sp * dt;
      let pz = crash.z + Math.sin(a) * sp * dt;
      let py = crash.y + 2.0 + (2 + hash1(i) * 6) * dt - 4.9 * dt * dt;
      const gy = terrainHeight(px, pz, this.terrainDef) + 0.2;
      let rest = false;
      if (py < gy) { py = gy; rest = true; }
      m.position.set(px, py, pz);
      m.rotation.set(dt * (2 + hash1(i) * 7) + i, dt * (3 + hash1(i * 3) * 6), dt * (1 + hash1(i * 5) * 5));
      if (rest) {
        const gy2 = terrainHeight(px, pz, this.terrainDef) + 0.16;
        m.position.y = gy2;
      }
    }
  }

  _updateCamera(state) {
    if (!this.camera) return;
    const camState = state.camera || {};
    const h = state.heli || {};
    const heliPos = new THREE.Vector3(h.x || 0, h.y || 0, h.z || 0);
    const mode = camState.mode || 'cinematic';
    if (mode === 'cinematic' && state.camPos) {
      this.camera.position.fromArray(state.camPos);
      this.camera.lookAt(new THREE.Vector3().fromArray(state.camTarget || [0, 2, 0]));
    } else if (mode === 'follow') {
      const yaw = h.yaw || 0;
      const off = new THREE.Vector3(0, 4.2, -11.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.camera.position.copy(heliPos).add(off);
      this.camera.lookAt(heliPos.clone().add(new THREE.Vector3(0, 1.2, 0)));
    } else {
      const target = camState.target ? new THREE.Vector3().fromArray(camState.target) : heliPos.clone().add(new THREE.Vector3(0, 1.2, 0));
      const yaw = camState.yaw ?? 0.6, pitch = camState.pitch ?? 0.35, dist = camState.dist ?? 16;
      const cp = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch) * dist,
        Math.sin(pitch) * dist,
        Math.cos(yaw) * Math.cos(pitch) * dist
      );
      this.camera.position.copy(target).add(cp);
      this.camera.lookAt(target);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.scene?.traverse(o => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
        }
      });
      this.renderer?.dispose();
    } catch (e) {}
  }
}