// Single Shared WebGL2 Three.js Display Renderer
// - Uses ONE WebGL2 context total across the entire application -> unlimited simultaneous 3D views (20+)
// - Automatically recovers from WebGL context loss from stored pure-JSON scene resources
// - 100% resource-driven: zero hardcoded helicopter; builds any nos-scene-v1 JSON cleanly
// - Pure stateless frame render: same scene3dPacket -> exact same image (never advances state internally)

import * as THREE from 'three';

function evalTerrainY(terrain, x, z) {
  if (!terrain) return 0;
  let h = 0;
  if (terrain.waves) {
    for (const w of terrain.waves) {
      h += Number(w.amp || 0) * Math.sin(x * Number(w.fx || 0) + Number(w.phase || 0)) * Math.cos(z * Number(w.fz || 0) - Number(w.phase || 0) * 0.5);
    }
  }
  if (terrain.flatPads) {
    for (const pad of terrain.flatPads) {
      const dx = x - Number(pad.x || 0);
      const dz = z - Number(pad.z || 0);
      const d = Math.hypot(dx, dz);
      const r = Number(pad.radius || 0);
      const b = Math.max(0.5, Number(pad.blend || 1));
      if (d <= r) h = Number(pad.y || 0);
      else if (d < r + b) {
        const u = (d - r) / b;
        const sm = u * u * (3 - 2 * u);
        h = Number(pad.y || 0) * (1 - sm) + h * sm;
      }
    }
  }
  return h;
}

function makeSeededRand(seed) {
  let s = (seed >>> 0) || 12345;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createDecalTexture(desc) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Rich metallic-base background with subtle panel seams
  ctx.fillStyle = desc.bg || '#552583';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle horizontal metallic sheen gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Championship gold stripes top & bottom
  ctx.fillStyle = desc.stripe || '#FDB927';
  ctx.fillRect(0, 44, 512, 24);
  ctx.fillRect(0, 424, 512, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(0, 424, 512, 5);

  // Bold number text ("24" or whatever resource specifies)
  const text = String(desc.text || '');
  ctx.save();
  ctx.translate(256, 255);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 250px "Arial Black", "Segoe UI", Impact, sans-serif';
  ctx.lineWidth = 22;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = desc.outline || '#1b0b2e';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = desc.textColor || '#FDB927';
  ctx.fillText(text, 0, 0);
  // Specular highlight stroke inside characters
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,250,210,0.55)';
  ctx.strokeText(text, -2, -3);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createHelipadTexture(pad) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Weathered concrete pad surface
  ctx.fillStyle = pad.padColor || '#3f454f';
  ctx.fillRect(0, 0, 512, 512);

  const rnd = makeSeededRand(9924);
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const g = 55 + Math.floor(rnd() * 35);
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},0.16)`;
    ctx.fillRect(x, y, 3, 3);
  }

  // Outer safety ring
  ctx.strokeStyle = pad.ringColor || '#FDB927';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(256, 256, 212, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dashed alignment ring
  ctx.setLineDash([24, 16]);
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,255,255,0.68)';
  ctx.beginPath();
  ctx.arc(256, 256, 174, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center "H" or "H2"
  ctx.fillStyle = pad.ringColor || '#FDB927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lbl = String(pad.label || 'H');
  ctx.font = lbl.length > 1 ? '900 170px "Segoe UI", Arial, sans-serif' : '900 220px "Segoe UI", Arial, sans-serif';
  ctx.fillText(lbl, 256, 266);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSkyTexture(env) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, env.skyTop || '#162447');
  g.addColorStop(0.42, env.skyMid || '#3a506b');
  g.addColorStop(0.56, env.skyHorizon || '#e89d65');
  g.addColorStop(0.68, env.fogColor || '#cfa17c');
  g.addColorStop(1.0, '#4a3d33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createParticleTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  if (kind === 'spark') {
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.35, 'rgba(255,190,60,0.9)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
  } else if (kind === 'fire') {
    g.addColorStop(0, 'rgba(255,252,215,1)');
    g.addColorStop(0.32, 'rgba(255,155,40,0.92)');
    g.addColorStop(0.7, 'rgba(220,55,15,0.45)');
    g.addColorStop(1, 'rgba(120,15,0,0)');
  } else {
    // Soft puffy cloud for smoke & dust
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.48, 'rgba(255,255,255,0.52)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRotorBlurTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 18, 128, 128, 126);
  g.addColorStop(0.0, 'rgba(40,36,54,0.0)');
  g.addColorStop(0.25, 'rgba(40,36,54,0.22)');
  g.addColorStop(0.82, 'rgba(40,36,54,0.28)');
  g.addColorStop(0.92, 'rgba(253,185,39,0.58)');
  g.addColorStop(0.98, 'rgba(253,185,39,0.22)');
  g.addColorStop(1.0, 'rgba(253,185,39,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGrassTuftGeometry() {
  // Multi-blade natural grass clump (5 slender crossed tapering blades instead of a single cone)
  const positions = [];
  const normals = [];
  const indices = [];
  const blades = [
    { ang: 0.0, lean: 0.22, h: 0.72, w: 0.075, ox: 0.0, oz: 0.0 },
    { ang: 1.25, lean: 0.28, h: 0.62, w: 0.068, ox: 0.06, oz: -0.04 },
    { ang: 2.51, lean: 0.25, h: 0.68, w: 0.07, ox: -0.05, oz: 0.05 },
    { ang: 3.77, lean: 0.30, h: 0.56, w: 0.065, ox: -0.04, oz: -0.06 },
    { ang: 5.02, lean: 0.20, h: 0.65, w: 0.07, ox: 0.05, oz: 0.06 },
  ];
  let baseIdx = 0;
  for (const b of blades) {
    const ca = Math.cos(b.ang);
    const sa = Math.sin(b.ang);
    const px = -sa * b.w;
    const pz = ca * b.w;
    const tipX = b.ox + ca * b.lean;
    const tipZ = b.oz + sa * b.lean;
    positions.push(
      b.ox - px, 0, b.oz - pz,
      b.ox + px, 0, b.oz + pz,
      tipX, b.h, tipZ
    );
    normals.push(ca, 0.6, sa, ca, 0.6, sa, ca, 0.8, sa);
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx + 2, baseIdx + 1, baseIdx);
    baseIdx += 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createTerrainDetailTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  const rnd = makeSeededRand(8824);
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const v = 215 + Math.floor(rnd() * 40);
    ctx.fillStyle = `rgb(${v},${v},${v - 4})`;
    ctx.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  return tex;
}

function buildGeometryFromDesc(g, side) {
  if (!g) return new THREE.BoxGeometry(1, 1, 1);
  switch (g.type) {
    case 'box':
      return new THREE.BoxGeometry(g.size[0], g.size[1], g.size[2]);
    case 'sphere':
      return new THREE.SphereGeometry(g.radius || 1, 24, 18);
    case 'cylinder':
      return new THREE.CylinderGeometry(g.radiusTop ?? 0.5, g.radiusBottom ?? 0.5, g.height || 1, 20);
    case 'cone':
      return new THREE.ConeGeometry(g.radius || 0.5, g.height || 1, 16);
    case 'torus':
      return new THREE.TorusGeometry(g.radius || 0.6, g.tube || 0.08, 12, 28);
    case 'capsule':
      return new THREE.CapsuleGeometry(g.radius || 1, g.length || 2, 12, 24);
    case 'curved_panel': {
      // Cylindrical side hull panel wrapping along Z axis (fuselage length), cleanly UV-mapped so "24" reads left-to-right on BOTH sides!
      const rad = g.radius || 1.04;
      const arc = g.arc || 0.72;
      const lenZ = g.height || 1.48;
      const segU = 16;
      const segV = 8;
      const geo = new THREE.BufferGeometry();
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      const isRight = side === 'right';
      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV; // 0 (bottom) .. 1 (top)
        const phi = (v - 0.5) * arc; // elevation angle around side
        const nx = (isRight ? 1 : -1) * Math.cos(phi);
        const ny = Math.sin(phi);
        const px = nx * rad * 0.96;
        const py = ny * rad * 0.92;
        for (let iu = 0; iu <= segU; iu++) {
          const u = iu / segU; // 0..1 along fuselage Z
          // On right side (+X), viewing from +X: left is +Z, right is -Z -> map u=0 -> +lenZ/2, u=1 -> -lenZ/2
          // On left side (-X), viewing from -X: left is -Z, right is +Z -> map u=0 -> -lenZ/2, u=1 -> +lenZ/2
          const pz = isRight ? (0.5 - u) * lenZ : (u - 0.5) * lenZ;
          positions.push(px, py, pz);
          normals.push(nx, ny, 0);
          uvs.push(u, v);
        }
      }
      for (let iv = 0; iv < segV; iv++) {
        for (let iu = 0; iu < segU; iu++) {
          const a = iv * (segU + 1) + iu;
          const b = a + 1;
          const c = a + (segU + 1);
          const d = c + 1;
          // Outward-facing winding
          indices.push(a, b, d, a, d, c);
        }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      return geo;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildMaterialFromDesc(m, texCache) {
  const opts = {
    color: new THREE.Color(m?.color || '#cccccc'),
    roughness: m?.roughness ?? 0.45,
    metalness: m?.metalness ?? 0.2,
  };
  if (m?.emissive) {
    opts.emissive = new THREE.Color(m.emissive);
    opts.emissiveIntensity = m.emissiveIntensity ?? 1.0;
  }
  if (m?.transparent || (m?.opacity !== undefined && m.opacity < 1)) {
    opts.transparent = true;
    opts.opacity = m.opacity ?? 0.85;
  }
  if (m?.texture) {
    const key = JSON.stringify(m.texture);
    let tex = texCache.get(key);
    if (!tex) {
      if (m.texture.type === 'decal_number') tex = createDecalTexture(m.texture);
      if (tex) texCache.set(key, tex);
    }
    if (tex) opts.map = tex;
  }
  return new THREE.MeshStandardMaterial(opts);
}

export class SharedRenderer3D {
  constructor() {
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = 640;
    this.glCanvas.height = 400;
    this.contextLost = false;
    this.renderer = null;
    this.sceneCache = new Map(); // resourceId -> built GPU scene bundle
    this.resourceStore = new Map(); // resourceId -> pure JSON resource (survives GPU context loss!)
    this.particleTextures = {};
    this.rotorBlurTex = null;
    this._dummy = new THREE.Object3D();
    this._initRenderer();
  }

  _initRenderer() {
    if (this.renderer) {
      try { this.renderer.dispose(); } catch {}
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.glCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.contextLost = false;

    this.glCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.clearAllScenes();
    }, false);

    this.glCanvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.clearAllScenes();
      this._initSharedTextures();
    }, false);

    this._initSharedTextures();
  }

  _initSharedTextures() {
    this.particleTextures = {
      dust: createParticleTexture('dust'),
      smoke: createParticleTexture('smoke'),
      fire: createParticleTexture('fire'),
      spark: createParticleTexture('spark'),
    };
    this.rotorBlurTex = createRotorBlurTexture();
  }

  clearAllScenes() {
    for (const bundle of this.sceneCache.values()) {
      this._disposeBundle(bundle);
    }
    this.sceneCache.clear();
  }

  _disposeBundle(bundle) {
    if (!bundle) return;
    try {
      bundle.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      if (bundle.texCache) {
        for (const t of bundle.texCache.values()) t.dispose();
      }
    } catch {}
  }

  simulateContextLoss() {
    const gl = this.renderer?.getContext();
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
      setTimeout(() => {
        try { ext.restoreContext(); } catch {}
      }, 220);
      return true;
    }
    return false;
  }

  _buildSceneBundle(resource) {
    const scene = new THREE.Scene();
    const texCache = new Map();
    const env = resource.environment || {};

    if (env.fogColor) {
      scene.fog = new THREE.Fog(env.fogColor, env.fogNear ?? 48, env.fogFar ?? 210);
    }

    // Sky Dome
    const skyTex = createSkyTexture(env);
    texCache.set('__sky', skyTex);
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    // Ambient & Hemisphere Lighting
    scene.add(new THREE.AmbientLight(env.ambientColor || '#7b8db5', env.ambientIntensity ?? 0.65));
    scene.add(new THREE.HemisphereLight(env.hemiSky || '#9bc4e8', env.hemiGround || '#594835', env.hemiIntensity ?? 0.6));

    // Scene Lights from resource
    let sunLight = null;
    if (Array.isArray(resource.lights)) {
      for (const l of resource.lights) {
        if (l.type === 'directional') {
          const dl = new THREE.DirectionalLight(l.color || '#ffffff', l.intensity ?? 2.0);
          dl.position.set(l.pos?.[0] ?? 30, l.pos?.[1] ?? 40, l.pos?.[2] ?? 20);
          if (l.castShadow) {
            dl.castShadow = true;
            dl.shadow.mapSize.width = 2048;
            dl.shadow.mapSize.height = 2048;
            const ext = l.shadowExtent ?? 65;
            dl.shadow.camera.left = -ext;
            dl.shadow.camera.right = ext;
            dl.shadow.camera.top = ext;
            dl.shadow.camera.bottom = -ext;
            dl.shadow.camera.near = 2;
            dl.shadow.camera.far = 200;
            dl.shadow.bias = -0.0005;
            sunLight = dl;
          }
          scene.add(dl);
        } else if (l.type === 'point') {
          const pl = new THREE.PointLight(l.color || '#ffffff', l.intensity ?? 2.0, l.distance ?? 40);
          pl.position.set(l.pos?.[0] ?? 0, l.pos?.[1] ?? 5, l.pos?.[2] ?? 0);
          scene.add(pl);
        }
      }
    }

    // Dynamic impact/fire point light (controlled purely by submitted frameState.flash)
    const flashLight = new THREE.PointLight('#ff8b2b', 0, 36, 1.4);
    scene.add(flashLight);

    // Terrain Heightfield (when defined in resource)
    if (resource.terrain) {
      const tr = resource.terrain;
      const size = tr.size || 240;
      const seg = tr.segments || 80;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const posAttr = geo.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);
      const cLow = new THREE.Color(tr.lowColor || '#4a6139');
      const cMid = new THREE.Color(tr.midColor || '#667547');
      const cHigh = new THREE.Color(tr.highColor || '#7d7262');
      const cTmp = new THREE.Color();

      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const vy = evalTerrainY(tr, vx, vz);
        posAttr.setY(i, vy);
        const hNorm = THREE.MathUtils.clamp((vy + 2.5) / 8.0, 0, 1);
        if (hNorm < 0.5) cTmp.lerpColors(cLow, cMid, hNorm * 2);
        else cTmp.lerpColors(cMid, cHigh, (hNorm - 0.5) * 2);
        colors[i * 3] = cTmp.r;
        colors[i * 3 + 1] = cTmp.g;
        colors[i * 3 + 2] = cTmp.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const tDetail = createTerrainDetailTexture();
      texCache.set('__terrainDetail', tDetail);
      const terrainMesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, map: tDetail, roughness: 0.92, metalness: 0.04 })
      );
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);
    }

    // Helipads
    if (Array.isArray(resource.helipads)) {
      for (const pad of resource.helipads) {
        const grp = new THREE.Group();
        const py = resource.terrain ? evalTerrainY(resource.terrain, pad.pos[0], pad.pos[2]) : (pad.pos[1] || 0);
        grp.position.set(pad.pos[0], py + 0.08, pad.pos[2]);

        const padTex = createHelipadTexture(pad);
        texCache.set('pad:' + pad.id, padTex);
        const slab = new THREE.Mesh(
          new THREE.CylinderGeometry(pad.radius || 6, (pad.radius || 6) + 0.5, 0.24, 16),
          [
            new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.85, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.78, metalness: 0.08 }),
            new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.9 }),
          ]
        );
        slab.receiveShadow = true;
        slab.castShadow = true;
        grp.add(slab);

        // 8 Perimeter beacon lights
        const beaconMat = new THREE.MeshStandardMaterial({
          color: pad.ringColor || '#FDB927',
          emissive: pad.ringColor || '#FDB927',
          emissiveIntensity: 1.5,
          roughness: 0.2,
        });
        for (let b = 0; b < 8; b++) {
          const ang = (b / 8) * Math.PI * 2;
          const rr = (pad.radius || 6) - 0.25;
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), beaconMat);
          lamp.position.set(Math.cos(ang) * rr, 0.18, Math.sin(ang) * rr);
          grp.add(lamp);
        }
        scene.add(grp);
      }
    }

    // Buildings & Obstacles
    if (Array.isArray(resource.obstacles)) {
      for (const ob of resource.obstacles) {
        const grp = new THREE.Group();
        const oy = resource.terrain ? evalTerrainY(resource.terrain, ob.pos[0], ob.pos[2]) : (ob.pos[1] || 0);
        grp.position.set(ob.pos[0], oy, ob.pos[2]);
        grp.rotation.y = ob.rotY || 0;
        const [sx, sy, sz] = ob.size || [6, 5, 6];

        if (ob.kind === 'hangar') {
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(sx, sy * 0.72, sz),
            new THREE.MeshStandardMaterial({ color: ob.wallColor || '#4c5564', roughness: 0.68, metalness: 0.32 })
          );
          body.position.y = sy * 0.36;
          body.castShadow = true;
          body.receiveShadow = true;
          grp.add(body);
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(sx + 0.6, 0.55, sz + 0.6),
            new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.45, metalness: 0.58 })
          );
          roof.position.y = sy * 0.75;
          roof.castShadow = true;
          grp.add(roof);
          const ridge = new THREE.Mesh(
            new THREE.BoxGeometry(sx * 0.74, 0.72, sz + 0.2),
            new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.48, metalness: 0.52 })
          );
          ridge.position.y = sy * 0.85;
          ridge.castShadow = true;
          grp.add(ridge);
          const bay = new THREE.Mesh(
            new THREE.BoxGeometry(sx * 0.68, sy * 0.54, 0.25),
            new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 })
          );
          bay.position.set(0, sy * 0.27, sz * 0.5 + 0.02);
          grp.add(bay);
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(sx + 0.14, 0.34, sz + 0.14),
            new THREE.MeshStandardMaterial({ color: ob.accentColor || '#FDB927', roughness: 0.36 })
          );
          stripe.position.y = sy * 0.64;
          grp.add(stripe);
        } else if (ob.kind === 'tower') {
          const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(sx * 0.62, sy * 0.72, sz * 0.62),
            new THREE.MeshStandardMaterial({ color: ob.wallColor || '#cfd6e0', roughness: 0.78, metalness: 0.1 })
          );
          shaft.position.y = sy * 0.36;
          shaft.castShadow = true;
          shaft.receiveShadow = true;
          grp.add(shaft);
          const cab = new THREE.Mesh(
            new THREE.CylinderGeometry(sx * 0.62, sx * 0.48, sy * 0.22, 8),
            new THREE.MeshStandardMaterial({ color: ob.glassColor || '#1f4b6e', roughness: 0.12, metalness: 0.75 })
          );
          cab.position.y = sy * 0.80;
          cab.castShadow = true;
          grp.add(cab);
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(sx * 0.68, sx * 0.66, 0.45, 8),
            new THREE.MeshStandardMaterial({ color: ob.accentColor || '#552583', roughness: 0.45, metalness: 0.35 })
          );
          cap.position.y = sy * 0.92;
          cap.castShadow = true;
          grp.add(cap);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.26, 10, 8),
            new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff2d20', emissiveIntensity: 2.0 })
          );
          beacon.position.y = sy * 0.99;
          grp.add(beacon);
        } else if (ob.kind === 'mast') {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.95, sy, 6),
            new THREE.MeshStandardMaterial({ color: ob.wallColor || '#b93829', roughness: 0.55, metalness: 0.45 })
          );
          pole.position.y = sy * 0.5;
          pole.castShadow = true;
          grp.add(pole);
          const topLight = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 10, 8),
            new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 2.2 })
          );
          topLight.position.y = sy + 0.25;
          grp.add(topLight);
        } else {
          // Fuel depot / generic box
          const tankMat = new THREE.MeshStandardMaterial({ color: ob.wallColor || '#d4dce6', roughness: 0.38, metalness: 0.55 });
          for (const ox of [-sx * 0.24, sx * 0.24]) {
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(sz * 0.36, sz * 0.36, sy * 0.85, 16), tankMat);
            tank.position.set(ox, sy * 0.45, 0);
            tank.castShadow = true;
            tank.receiveShadow = true;
            grp.add(tank);
          }
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(sx, 0.3, sz * 0.9),
            new THREE.MeshStandardMaterial({ color: ob.accentColor || '#FDB927', roughness: 0.45 })
          );
          band.position.y = 0.2;
          grp.add(band);
        }
        scene.add(grp);
      }
    }

    // Vegetation: Pine Trees, Dynamic Downwash Grass, & Distant Mountain Ring
    let grassInst = null;
    let grassBase = [];
    if (resource.vegetation && resource.terrain) {
      const veg = resource.vegetation;
      const tr = resource.terrain;
      const rndT = makeSeededRand(veg.treeSeed || 2401);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3525', roughness: 0.92 });
      const foliageMat1 = new THREE.MeshStandardMaterial({ color: '#274229', roughness: 0.88 });
      const foliageMat2 = new THREE.MeshStandardMaterial({ color: '#1f3623', roughness: 0.88 });
      const treeCount = veg.treeCount || 60;
      const minR = veg.treeMinRadius || 24;
      const maxR = veg.treeMaxRadius || 86;

      for (let i = 0; i < treeCount; i++) {
        const ang = rndT() * Math.PI * 2;
        const r = minR + rndT() * (maxR - minR);
        const tx = Math.cos(ang) * r;
        const tz = Math.sin(ang) * r;
        // Skip helipads, crash meadow & obstacles clearance so sightlines stay wide open!
        if (Math.hypot(tx - 38, tz + 26) < 12.5) continue;
        if (Math.hypot(tx - 18, tz + 4) < 16.5) continue;
        if (Math.hypot(tx + 20, tz + 14) < 12.5) continue;
        if (Math.hypot(tx - 10, tz + 26) < 9.5) continue;
        const ty = evalTerrainY(tr, tx, tz);
        const sc = 0.78 + rndT() * 0.72;
        const tree = new THREE.Group();
        tree.position.set(tx, ty, tz);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * sc, 0.3 * sc, 1.8 * sc, 7), trunkMat);
        trunk.position.y = 0.9 * sc;
        trunk.castShadow = true;
        tree.add(trunk);
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7 * sc, 3.6 * sc, 7), i % 2 === 0 ? foliageMat1 : foliageMat2);
        c1.position.y = 2.9 * sc;
        c1.castShadow = true;
        tree.add(c1);
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.25 * sc, 3.0 * sc, 7), foliageMat1);
        c2.position.y = 4.6 * sc;
        c2.castShadow = true;
        tree.add(c2);
        scene.add(tree);
      }

      // Dynamic multi-blade grass clumps around helipads & valley (bend organically under rotor downwash!)
      const rndG = makeSeededRand(veg.grassSeed || 2402);
      const gCount = veg.grassCount || 280;
      const grassGeo = createGrassTuftGeometry();
      const grassMat = new THREE.MeshStandardMaterial({ color: '#587c3a', roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide });
      grassInst = new THREE.InstancedMesh(grassGeo, grassMat, gCount);
      grassInst.receiveShadow = true;

      for (let i = 0; i < gCount; i++) {
        let gx, gz;
        if (i < gCount * 0.45) {
          // Ring around Helipad 1
          const ang = rndG() * Math.PI * 2;
          const r = 6.6 + rndG() * 14.0;
          gx = Math.cos(ang) * r;
          gz = Math.sin(ang) * r;
        } else if (i < gCount * 0.75) {
          // Ring around Helipad 2
          const ang = rndG() * Math.PI * 2;
          const r = 6.4 + rndG() * 11.0;
          gx = 38 + Math.cos(ang) * r;
          gz = -26 + Math.sin(ang) * r;
        } else {
          // Valley floor
          gx = (rndG() - 0.5) * 68;
          gz = (rndG() - 0.5) * 58;
        }
        const gy = evalTerrainY(tr, gx, gz);
        const sc = 0.75 + rndG() * 0.75;
        const rotY = rndG() * Math.PI * 2;
        grassBase.push({ x: gx, y: gy, z: gz, sc, rotY });
        this._dummy.position.set(gx, gy, gz);
        this._dummy.rotation.set(0, rotY, 0);
        this._dummy.scale.set(sc, sc, sc);
        this._dummy.updateMatrix();
        grassInst.setMatrixAt(i, this._dummy.matrix);
      }
      grassInst.instanceMatrix.needsUpdate = true;
      scene.add(grassInst);

      // Distant Alpine Mountain Ring
      const mCount = veg.mountainsCount || 24;
      const mRad = veg.mountainsRadius || 110;
      const mMat = new THREE.MeshStandardMaterial({ color: '#475068', roughness: 0.94, metalness: 0.05 });
      const snowMat = new THREE.MeshStandardMaterial({ color: '#dce4ef', roughness: 0.8 });
      const rndM = makeSeededRand(7777);
      for (let i = 0; i < mCount; i++) {
        const ang = (i / mCount) * Math.PI * 2 + (rndM() - 0.5) * 0.15;
        const r = mRad + rndM() * 24;
        const h = 24 + rndM() * 34;
        const w = 18 + rndM() * 20;
        const peak = new THREE.Group();
        peak.position.set(Math.cos(ang) * r, -2, Math.sin(ang) * r);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), mMat);
        cone.position.y = h * 0.5;
        peak.add(cone);
        if (h > 36) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.34, h * 0.34, 6), snowMat);
          cap.position.y = h * 0.84;
          peak.add(cap);
        }
        scene.add(peak);
      }
    }

    // Build Resource Parts Group (Helicopter or ANY arbitrary nos-scene-v1 objects!)
    const rootActor = new THREE.Group();
    const partNodes = new Map();
    const rotorNodes = [];
    const tailRotorNodes = [];
    let rotorBlurMesh = null;

    if (Array.isArray(resource.parts)) {
      for (const p of resource.parts) {
        const pg = new THREE.Group();
        pg.name = p.id;
        pg.position.set(p.pos?.[0] ?? 0, p.pos?.[1] ?? 0, p.pos?.[2] ?? 0);
        if (p.rot) pg.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0);

        const shapes = Array.isArray(p.subShapes) && p.subShapes.length > 0
          ? p.subShapes
          : (p.geom ? [{ geom: p.geom, material: p.material }] : []);

        for (const sh of shapes) {
          const geo = buildGeometryFromDesc(sh.geom, sh.side);
          const mat = buildMaterialFromDesc(sh.material, texCache);
          const mesh = new THREE.Mesh(geo, mat);
          if (sh.pos) mesh.position.set(sh.pos[0] || 0, sh.pos[1] || 0, sh.pos[2] || 0);
          if (sh.rot && sh.geom?.type !== 'curved_panel') {
            mesh.rotation.set(sh.rot[0] || 0, sh.rot[1] || 0, sh.rot[2] || 0);
          }
          if (sh.scale) mesh.scale.set(sh.scale[0] || 1, sh.scale[1] || 1, sh.scale[2] || 1);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          pg.add(mesh);
        }

        if (p.rotorBlurRadius && this.rotorBlurTex) {
          const disc = new THREE.Mesh(
            new THREE.CircleGeometry(p.rotorBlurRadius, 36),
            new THREE.MeshBasicMaterial({
              map: this.rotorBlurTex,
              transparent: true,
              opacity: 0,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          disc.rotation.x = -Math.PI / 2;
          disc.position.y = 0.04;
          pg.add(disc);
          rotorBlurMesh = disc;
        }

        rootActor.add(pg);
        partNodes.set(p.id, pg);
        if (p.role === 'main_rotor') rotorNodes.push(pg);
        if (p.role === 'tail_rotor') tailRotorNodes.push(pg);
      }
    }
    scene.add(rootActor);

    // Debris Pool (up to 16 thick 3D rigid debris bodies with real shadows)
    const debrisGroup = new THREE.Group();
    const debrisMeshes = [];
    scene.add(debrisGroup);

    // Volumetric 3D Particle Sprite Pool (up to 140 sprites)
    const particleGroup = new THREE.Group();
    const particlePool = [];
    for (let i = 0; i < 140; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.particleTextures.smoke,
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      particleGroup.add(sp);
      particlePool.push(sp);
    }
    scene.add(particleGroup);

    // Rehearsal Target Waypoint Beacon (visible only in rehearsal mode)
    const markerGroup = new THREE.Group();
    const mRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 24),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    mRing.rotation.x = -Math.PI / 2;
    mRing.position.y = 0.2;
    const mPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7 })
    );
    mPole.position.y = 2.4;
    markerGroup.add(mRing, mPole);
    markerGroup.visible = false;
    scene.add(markerGroup);

    const camera = new THREE.PerspectiveCamera(45, 1.6, 0.25, 420);

    return {
      scene,
      camera,
      texCache,
      sunLight,
      flashLight,
      rootActor,
      partNodes,
      rotorNodes,
      tailRotorNodes,
      rotorBlurMesh,
      grassInst,
      grassBase,
      debrisGroup,
      debrisMeshes,
      particlePool,
      markerGroup,
      resource,
    };
  }

  renderToCanvas(targetCanvas, packet) {
    if (!targetCanvas || !packet) return;
    if (this.contextLost || (this.renderer && this.renderer.getContext().isContextLost())) {
      // Context lost: display subtle recovery notice without touching OS state
      const ctx = targetCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px "Microsoft YaHei UI", sans-serif';
        ctx.fillText('图形上下文恢复中...', 18, 30);
      }
      return;
    }

    const resId = packet.resourceId || 'default';
    if (packet.resource) {
      this.resourceStore.set(resId, packet.resource);
    }
    let bundle = this.sceneCache.get(resId);
    const resObj = packet.resource || this.resourceStore.get(resId);
    if (!bundle && resObj) {
      // Keep scene cache bounded cleanly
      if (this.sceneCache.size > 16) {
        const oldestKey = this.sceneCache.keys().next().value;
        this._disposeBundle(this.sceneCache.get(oldestKey));
        this.sceneCache.delete(oldestKey);
      }
      bundle = this._buildSceneBundle(resObj);
      this.sceneCache.set(resId, bundle);
    }
    if (!bundle) return;

    const w = Math.max(64, Math.floor(targetCanvas.width));
    const h = Math.max(64, Math.floor(targetCanvas.height));
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.renderer.setSize(w, h, false);
    }

    // Apply submitted camera pose (respecting THIS viewport's own aspect ratio — never stretched!)
    const camData = packet.camera || { pos: [10, 5, 10], target: [0, 1.5, 0], fov: 45 };
    bundle.camera.fov = camData.fov || 45;
    bundle.camera.aspect = w / h;
    bundle.camera.position.set(camData.pos[0], camData.pos[1], camData.pos[2]);
    bundle.camera.lookAt(camData.target[0], camData.target[1], camData.target[2]);
    bundle.camera.updateProjectionMatrix();

    // Apply submitted aircraft / scene actor pose & damage
    const ac = packet.aircraft;
    if (packet.isFlightScene && ac) {
      bundle.rootActor.position.set(ac.pos[0], ac.pos[1], ac.pos[2]);
      bundle.rootActor.rotation.order = 'YXZ';
      bundle.rootActor.rotation.set(ac.rot[0], ac.rot[1], ac.rot[2]);

      // Keep shadow frustum centered near aircraft for razor-sharp shadows anywhere in valley
      if (bundle.sunLight) {
        bundle.sunLight.target.position.set(ac.pos[0], ac.pos[1], ac.pos[2]);
        bundle.sunLight.position.set(ac.pos[0] + 44, ac.pos[1] + 38, ac.pos[2] + 30);
        bundle.sunLight.target.updateMatrixWorld();
      }

      for (const rn of bundle.rotorNodes) rn.rotation.y = ac.rotorAngle || 0;
      for (const tn of bundle.tailRotorNodes) tn.rotation.x = ac.tailAngle || 0;
      if (bundle.rotorBlurMesh) {
        const rpm = ac.rotorRpm || 0;
        bundle.rotorBlurMesh.material.opacity = ac.crashed ? 0 : THREE.MathUtils.clamp((rpm - 0.35) * 0.95, 0, 0.72);
      }

      // Apply part detachment visibility from submitted damage table
      if (ac.damage) {
        for (const [pid, node] of bundle.partNodes.entries()) {
          const d = ac.damage[pid];
          node.visible = !(d && d.detached);
        }
      }
    } else {
      bundle.rootActor.position.set(0, 0, 0);
      bundle.rootActor.rotation.set(0, 0, 0);
      for (const node of bundle.partNodes.values()) node.visible = true;
    }

    // Apply dynamic grass downwash bend (frozen in place if player_fx.nos is suspended)
    if (!packet.fxFrozen && bundle.grassInst && bundle.grassBase.length > 0) {
      const dw = packet.downwash;
      for (let i = 0; i < bundle.grassBase.length; i++) {
        const gb = bundle.grassBase[i];
        let tiltX = 0;
        let tiltZ = 0;
        if (dw && dw.strength > 0.01) {
          const dx = gb.x - dw.x;
          const dz = gb.z - dw.z;
          const dist = Math.hypot(dx, dz);
          if (dist < dw.radius && dist > 0.05) {
            const f = (1 - dist / dw.radius) * dw.strength;
            const bend = f * 1.15;
            tiltZ = -(dx / dist) * bend;
            tiltX = (dz / dist) * bend;
          }
        }
        this._dummy.position.set(gb.x, gb.y, gb.z);
        this._dummy.rotation.set(tiltX, gb.rotY, tiltZ);
        this._dummy.scale.set(gb.sc, gb.sc, gb.sc);
        this._dummy.updateMatrix();
        bundle.grassInst.setMatrixAt(i, this._dummy.matrix);
      }
      bundle.grassInst.instanceMatrix.needsUpdate = true;
    }

    // Apply thick 3D rigid debris bodies
    const debrisList = Array.isArray(packet.debris) ? packet.debris : [];
    while (bundle.debrisMeshes.length < debrisList.length) {
      const idx = bundle.debrisMeshes.length;
      const d = debrisList[idx];
      const sz = d.size || [1, 0.2, 0.4];
      const grp = new THREE.Group();
      const mainMesh = new THREE.Mesh(
        new THREE.BoxGeometry(sz[0], sz[1], sz[2]),
        new THREE.MeshStandardMaterial({ color: d.color || '#552583', roughness: 0.42, metalness: 0.4 })
      );
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      grp.add(mainMesh);
      if (d.accent) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(sz[0] * 0.28, sz[1] * 1.08, sz[2] * 1.05),
          new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.35, metalness: 0.45 })
        );
        stripe.position.x = sz[0] * 0.3;
        grp.add(stripe);
      }
      bundle.debrisGroup.add(grp);
      bundle.debrisMeshes.push(grp);
    }
    for (let i = 0; i < bundle.debrisMeshes.length; i++) {
      const m = bundle.debrisMeshes[i];
      if (i < debrisList.length) {
        const d = debrisList[i];
        m.visible = true;
        m.position.set(d.pos[0], d.pos[1], d.pos[2]);
        m.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
      } else {
        m.visible = false;
      }
    }

    // Apply 3D depth-tested volumetric particles (frozen in place if player_fx.nos is suspended)
    if (!packet.fxFrozen) {
      const parts = Array.isArray(packet.particles) ? packet.particles : [];
      for (let i = 0; i < bundle.particlePool.length; i++) {
        const sp = bundle.particlePool[i];
        if (i < parts.length) {
          const p = parts[i];
          sp.visible = true;
          sp.position.set(p.pos[0], p.pos[1], p.pos[2]);
          const s = p.size || 1.0;
          sp.scale.set(s, s, 1);
          const tex = this.particleTextures[p.kind] || this.particleTextures.smoke;
          if (sp.material.map !== tex) sp.material.map = tex;
          sp.material.color.set(p.color || '#ffffff');
          sp.material.opacity = THREE.MathUtils.clamp(p.opacity ?? 0.6, 0, 1);
          sp.material.blending = (p.kind === 'fire' || p.kind === 'spark') ? THREE.AdditiveBlending : THREE.NormalBlending;
        } else {
          sp.visible = false;
        }
      }
    }

    // Apply impact flash light
    if (packet.flash && packet.flash.intensity > 0.01) {
      bundle.flashLight.intensity = packet.flash.intensity;
      bundle.flashLight.position.set(packet.flash.pos[0], packet.flash.pos[1], packet.flash.pos[2]);
    } else {
      bundle.flashLight.intensity = 0;
    }

    // Rehearsal waypoint marker
    if (packet.targetMarker) {
      bundle.markerGroup.visible = true;
      bundle.markerGroup.position.set(packet.targetMarker[0], packet.targetMarker[1], packet.targetMarker[2]);
    } else {
      bundle.markerGroup.visible = false;
    }

    // Render using single shared WebGL2 context and blit onto target 2D canvas
    this.renderer.render(bundle.scene, bundle.camera);
    const ctx2d = targetCanvas.getContext('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.drawImage(this.glCanvas, 0, 0, w, h, 0, 0, w, h);
    }
  }
}
