import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { createProceduralTextures } from './textures.js';
import {
  buildEnemyRig,
  buildIsolatorRig,
  buildTowerRig,
  createMaterialPalette,
  updateEnemyRigAnimation,
  updateTowerRigAnimation,
} from './meshes.js';
import { buildMapEnvironment, gridToWorld, TILE_SIZE, updateEnvironmentAnimation } from './environment.js';
import { VFXManager } from './vfx.js';
import { DIRECTION_VECTORS } from '../data/specs.js';

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // ensures clean deterministic screenshots in videoExport!
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07111f);
    this.scene.fog = new THREE.FogExp2(0x07111f, 0.0072);

    // Subtle procedural PBR environment reflection map (100% offline/file:// safe!)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 260);

    // Post-processing with selective HDR-only bloom (keeps porcelain/metal geometry razor-sharp!)
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.28, 0.38, 1.06);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);

    // Lighting rig (updated per map theme)
    this.ambientLight = new THREE.HemisphereLight(0x7cc8ff, 0x0c1a2e, 0.78);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xd8efff, 1.38);
    this.keyLight.position.set(16, 28, 18);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 4;
    this.keyLight.shadow.camera.far = 75;
    const d = 22;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x22d8ff, 0.85);
    this.rimLight.position.set(-20, 14, -18);
    this.scene.add(this.rimLight);

    this.textures = createProceduralTextures();
    this.pal = createMaterialPalette();
    this.vfx = new VFXManager(this.scene, this.textures);

    this.env = null;
    this.currentMap = null;

    this.entitiesGroup = new THREE.Group();
    this.scene.add(this.entitiesGroup);

    this.towerRigs = new Map(); // id -> rig
    this.enemyRigs = new Map(); // id -> rig
    this.isolatorRigs = new Map(); // id -> rig
    this.dyingRigs = []; // { root, kind: 'enemy'|'boss'|'tower_destroy'|'tower_withdraw', age, duration, spinDir }

    // Selection, Hover & Ghost Placement indicators
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.02, 32),
      new THREE.MeshBasicMaterial({ color: 0x3ef5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 0.92, 24),
      new THREE.MeshBasicMaterial({ color: 0x7ae8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
    this.ghostTypeKey = '';

    // Blender Camera Orbital Rig (framed cleanly above bottom dock with surrounding cyberspace clusters visible!)
    this.camState = {
      target: new THREE.Vector3(0, 0, 1.85),
      yaw: 0.0, // facing North (-Z) from South (+Z)
      pitch: 0.86, // ~49 deg from horizontal
      distance: 36.8,
      defaultTarget: new THREE.Vector3(0, 0, 1.85),
      defaultYaw: 0.0,
      defaultPitch: 0.86,
      defaultDistance: 36.8,
    };
    this.camAnim = null; // optional smooth lerp target

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Setup Blender Middle-Mouse Orbit / Shift+MMB Pan / Wheel Zoom
    this.setupBlenderControls();
    this.resize(window.innerWidth, window.innerHeight);
    this.applyCameraTransform();
  }

  setupBlenderControls() {
    let mode = null; // 'orbit' | 'pan'
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      // Strictly Middle Mouse Button (button === 1) for Blender-style camera!
      if (e.button === 1) {
        e.preventDefault();
        mode = e.shiftKey ? 'pan' : 'orbit';
        lastX = e.clientX;
        lastY = e.clientY;
        this.camAnim = null;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (mode === 'orbit') {
        this.camState.yaw -= dx * 0.0065;
        this.camState.pitch = Math.max(0.32, Math.min(1.42, this.camState.pitch + dy * 0.0065));
      } else if (mode === 'pan') {
        const panScale = this.camState.distance * 0.00145;
        const forward = new THREE.Vector3(-Math.sin(this.camState.yaw), 0, -Math.cos(this.camState.yaw));
        const right = new THREE.Vector3(Math.cos(this.camState.yaw), 0, -Math.sin(this.camState.yaw));
        this.camState.target.addScaledVector(right, -dx * panScale);
        this.camState.target.addScaledVector(forward, dy * panScale);
        this.camState.target.x = Math.max(-18, Math.min(18, this.camState.target.x));
        this.camState.target.z = Math.max(-14, Math.min(14, this.camState.target.z));
      }
      this.applyCameraTransform();
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button === 1) mode = null;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camAnim = null;
        const factor = e.deltaY > 0 ? 1.09 : 0.915;
        this.camState.distance = Math.max(10.5, Math.min(54, this.camState.distance * factor));
        this.applyCameraTransform();
      },
      { passive: false }
    );

    // Prevent middle-click autoscroll icon on Windows Chrome
    this.canvas.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  resize(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.viewportW = w;
    this.viewportH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);

    // Compute default overview distance so entire 15x11 map fits cleanly above bottom dock regardless of aspect ratio
    const baseDist = this.camera.aspect < 1.5 ? 41.5 : 36.8;
    this.camState.defaultDistance = baseDist;
  }

  resetCamera(immediate = false) {
    const target = {
      tx: this.camState.defaultTarget.x,
      ty: this.camState.defaultTarget.y,
      tz: this.camState.defaultTarget.z,
      yaw: this.camState.defaultYaw,
      pitch: this.camState.defaultPitch,
      distance: this.camState.defaultDistance,
    };
    if (immediate) {
      this.camAnim = null;
      this.camState.target.set(target.tx, target.ty, target.tz);
      this.camState.yaw = target.yaw;
      this.camState.pitch = target.pitch;
      this.camState.distance = target.distance;
      this.applyCameraTransform();
    } else {
      this.camAnim = { ...target, speed: 6.5 };
    }
  }

  setCameraPose({ tx, ty = 0, tz, yaw, pitch, distance }, immediate = false) {
    if (immediate) {
      this.camAnim = null;
      this.camState.target.set(tx, ty, tz);
      this.camState.yaw = yaw;
      this.camState.pitch = pitch;
      this.camState.distance = distance;
      this.applyCameraTransform();
    } else {
      this.camAnim = { tx, ty, tz, yaw, pitch, distance, speed: 3.5 };
    }
  }

  applyCameraTransform() {
    const { target, yaw, pitch, distance } = this.camState;
    const horiz = Math.cos(pitch) * distance;
    const vert = Math.sin(pitch) * distance;
    this.camera.position.set(
      target.x + Math.sin(yaw) * horiz,
      target.y + vert,
      target.z + Math.cos(yaw) * horiz
    );
    this.camera.lookAt(target);
  }

  // ==================== MAP LOADING ====================

  loadMap(engine) {
    // Dispose old map environment & entity meshes
    if (this.env) {
      this.scene.remove(this.env.group);
      this.disposeGroup(this.env.group);
      this.env = null;
    }
    this.disposeGroup(this.entitiesGroup);
    this.towerRigs.clear();
    this.enemyRigs.clear();
    this.isolatorRigs.clear();
    this.dyingRigs = [];
    this.vfx.clearAll();
    this.hideGhost();
    this.selectRing.visible = false;
    this.hoverRing.visible = false;

    this.currentMap = engine.map;
    const theme = engine.map.theme;

    this.scene.background = new THREE.Color(theme.bgHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, 0.0082);
    this.ambientLight.color.set(theme.keyLightHex);
    this.keyLight.color.set(theme.keyLightHex);
    this.rimLight.color.set(theme.rimLightHex);

    this.env = buildMapEnvironment(engine.map, this.textures, this.pal);
    this.scene.add(this.env.group);

    this.vfx.rebuildEntryRoutes(engine.map, engine.entryRoutes, []);
    this.resetCamera(true);
  }

  disposeGroup(grp) {
    while (grp.children.length > 0) {
      const c = grp.children[0];
      grp.remove(c);
      c.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else if (
            !Object.values(this.pal).includes(o.material) &&
            o.material !== this.selectRing.material
          ) {
            o.material.dispose();
          }
        }
      });
    }
  }

  // ==================== RAYCASTING & PICKING ====================

  screenToNDC(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  pickTile(clientX, clientY) {
    if (!this.env || !this.currentMap) return null;
    const ndc = this.screenToNDC(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.env.pickables, false);
    if (hits.length > 0 && hits[0].object.userData) {
      return hits[0].object.userData;
    }
    // Fallback intersect ground plane
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, pt)) {
      const gx = Math.round(pt.x / TILE_SIZE + (this.currentMap.width - 1) * 0.5);
      const gy = Math.round(pt.z / TILE_SIZE + (this.currentMap.height - 1) * 0.5);
      if (gx >= 0 && gx < this.currentMap.width && gy >= 0 && gy < this.currentMap.height) {
        return { gx, gy, tile: this.currentMap.grid[gy][gx] };
      }
    }
    return null;
  }

  pickWorldOnGround(clientX, clientY) {
    const ndc = this.screenToNDC(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const pt = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, pt) ? pt : null;
  }

  pickEnemyNear(clientX, clientY, engine) {
    if (!this.currentMap) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = null;
    let bestD = 36;
    for (const en of engine.enemies) {
      if (en.dead) continue;
      const proj = this.projectGridToScreen(engine.map, en.gx, en.gy, en.altitude + 0.55);
      if (!proj.visible) continue;
      const d = Math.hypot(proj.x - px, proj.y - py);
      if (d < bestD) {
        bestD = d;
        best = en;
      }
    }
    return best;
  }

  // ==================== GHOST TOWER PREVIEW ====================

  showGhostTower(map, typeId, x, y, dir = 'S', valid = true) {
    const key = `${typeId}:${dir}:${valid ? 1 : 0}`;
    if (this.ghostTypeKey !== key) {
      this.disposeGroup(this.ghostGroup);
      const fakeTower = { type: typeId, level: 1, branch: null, dir };
      const rig = buildTowerRig(fakeTower, this.pal);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: valid ? 0x3bf5ff : 0xff3652,
        transparent: true,
        opacity: 0.48,
        wireframe: false,
      });
      rig.body.traverse((o) => {
        if (o.isMesh) {
          o.material = ghostMat;
          o.castShadow = false;
        }
      });
      this.ghostGroup.add(rig.root);
      this.ghostTypeKey = key;
    }
    const baseY = map.grid[y]?.[x]?.type === 'platform' ? 0.48 : 0.04;
    const w = gridToWorld(map, x, y, baseY);
    this.ghostGroup.position.copy(w);
    this.ghostGroup.visible = true;
  }

  hideGhost() {
    this.ghostGroup.visible = false;
  }

  setHoverTile(map, gx, gy) {
    if (!map || gx < 0 || gy < 0) {
      this.hoverRing.visible = false;
      return;
    }
    const y = map.grid[gy]?.[gx]?.type === 'platform' ? 0.51 : 0.06;
    this.hoverRing.position.copy(gridToWorld(map, gx, gy, y));
    this.hoverRing.visible = true;
  }

  setSelectedHighlight(map, selection) {
    if (!selection || !map) {
      this.selectRing.visible = false;
      return;
    }
    let gx = selection.x;
    let gy = selection.y;
    let y = 0.09;
    if (selection.kind === 'tower') {
      y = map.grid[gy]?.[gx]?.type === 'platform' ? 0.53 : 0.1;
    } else if (selection.kind === 'enemy') {
      gx = selection.enemy.gx;
      gy = selection.enemy.gy;
      y = selection.enemy.altitude + 0.12;
    } else if (selection.kind === 'tile') {
      y = map.grid[gy]?.[gx]?.type === 'platform' ? 0.53 : 0.09;
    }
    const w = gridToWorld(map, gx, gy, y);
    this.selectRing.position.copy(w);
    this.selectRing.visible = true;
  }

  // ==================== SCREEN PROJECTION FOR CRISP 2D OVERLAYS ====================

  projectGridToScreen(map, gx, gy, y = 0) {
    const v = gridToWorld(map, gx, gy, y);
    v.project(this.camera);
    const visible = v.z >= -1 && v.z <= 1;
    const x = (v.x * 0.5 + 0.5) * this.viewportW;
    const sy = (-v.y * 0.5 + 0.5) * this.viewportH;
    return { x, y: sy, visible, ndcZ: v.z };
  }

  // ==================== FRAME SYNC & RENDER ====================

  syncAndRender(engine, events, simTime, dt, camDt = dt) {
    // 0. Smooth camera lerp if active (always responsive even when battle is paused!)
    if (this.camAnim) {
      const k = Math.min(1, camDt * this.camAnim.speed);
      this.camState.target.x += (this.camAnim.tx - this.camState.target.x) * k;
      this.camState.target.y += (this.camAnim.ty - this.camState.target.y) * k;
      this.camState.target.z += (this.camAnim.tz - this.camState.target.z) * k;
      this.camState.yaw += (this.camAnim.yaw - this.camState.yaw) * k;
      this.camState.pitch += (this.camAnim.pitch - this.camState.pitch) * k;
      this.camState.distance += (this.camAnim.distance - this.camState.distance) * k;
      this.applyCameraTransform();
      const remain =
        Math.abs(this.camAnim.tx - this.camState.target.x) +
        Math.abs(this.camAnim.tz - this.camState.target.z) +
        Math.abs(this.camAnim.distance - this.camState.distance);
      if (remain < 0.03) this.camAnim = null;
    }

    if (!engine || !engine.map) {
      this.composer.render();
      return;
    }

    // 1. Handle engine events (route rebuilds + combat VFX)
    for (const ev of events) {
      if (ev.type === 'route_changed' || ev.type === 'routes_refreshed') {
        this.vfx.rebuildEntryRoutes(engine.map, engine.entryRoutes, ev.changedEntries || []);
      }
      this.vfx.handleEngineEvent(engine.map, ev);
    }

    // Collect withdrawn tower IDs from events so they animate a clean holographic retract vs violent collapse!
    const withdrawnIds = new Set();
    for (const ev of events) {
      if (ev.type === 'tower_withdrawn' && ev.tower) withdrawnIds.add(ev.tower.id);
    }

    // 2. Sync Tower Rigs (automatically rebuilds mesh when level or branch upgrades!)
    const aliveTowers = new Set();
    for (const t of engine.towers) {
      if (t.hp <= 0) continue;
      aliveTowers.add(t.id);
      let rig = this.towerRigs.get(t.id);
      if (!rig || rig.level !== t.level || rig.branch !== t.branch) {
        if (rig) {
          this.entitiesGroup.remove(rig.root);
          this.disposeGroup(rig.root);
        }
        rig = buildTowerRig(t, this.pal);
        const baseY = engine.map.grid[t.y][t.x].type === 'platform' ? 0.48 : 0.04;
        rig.root.position.copy(gridToWorld(engine.map, t.x, t.y, baseY));
        this.entitiesGroup.add(rig.root);
        this.towerRigs.set(t.id, rig);
      }
      updateTowerRigAnimation(rig, t, simTime, dt);
    }
    for (const [id, rig] of this.towerRigs.entries()) {
      if (!aliveTowers.has(id)) {
        this.towerRigs.delete(id);
        const isWithdraw = withdrawnIds.has(id);
        this.dyingRigs.push({
          root: rig.root,
          kind: isWithdraw ? 'tower_withdraw' : 'tower_destroy',
          age: 0,
          duration: isWithdraw ? 0.34 : 0.68,
          spinDir: (id % 2 === 0 ? 1 : -1),
          startY: rig.root.position.y,
        });
      }
    }

    // 3. Sync Emergency Isolator Rigs
    const aliveIso = new Set();
    for (const iso of engine.isolators) {
      if (iso.hp <= 0 || iso.remaining <= 0) continue;
      aliveIso.add(iso.id);
      let rig = this.isolatorRigs.get(iso.id);
      if (!rig) {
        rig = buildIsolatorRig(this.pal);
        rig.root.position.copy(gridToWorld(engine.map, iso.x, iso.y, 0.08));
        this.entitiesGroup.add(rig.root);
        this.isolatorRigs.set(iso.id, rig);
      }
      rig.holoRing.rotation.z += dt * 3.5;
      rig.clampRing.rotation.z -= dt * 1.4;
      const frac = Math.max(0.15, iso.remaining / iso.maxDuration);
      rig.holoRing.scale.setScalar(frac);
    }
    for (const [id, rig] of this.isolatorRigs.entries()) {
      if (!aliveIso.has(id)) {
        this.isolatorRigs.delete(id);
        this.dyingRigs.push({
          root: rig.root,
          kind: 'tower_destroy',
          age: 0,
          duration: 0.45,
          spinDir: 1,
          startY: rig.root.position.y,
        });
      }
    }

    // 4. Sync Enemy & Boss Rigs
    const aliveEnemies = new Set();
    for (const en of engine.enemies) {
      if (en.dead) continue;
      aliveEnemies.add(en.id);
      let rig = this.enemyRigs.get(en.id);
      if (!rig) {
        rig = buildEnemyRig(en, this.pal);
        this.entitiesGroup.add(rig.root);
        this.enemyRigs.set(en.id, rig);
      }
      rig.root.position.copy(gridToWorld(engine.map, en.gx, en.gy, en.altitude + 0.03));
      updateEnemyRigAnimation(rig, en, simTime, dt);
    }
    for (const [id, rig] of this.enemyRigs.entries()) {
      if (!aliveEnemies.has(id)) {
        this.enemyRigs.delete(id);
        const isBoss = rig.type && rig.type.startsWith('boss_');
        this.dyingRigs.push({
          root: rig.root,
          kind: isBoss ? 'boss' : 'enemy',
          age: 0,
          duration: isBoss ? 1.15 : 0.48,
          spinDir: (id % 2 === 0 ? 1 : -1),
          startY: rig.root.position.y,
        });
      }
    }

    // 4b. Animate Dying / Collapsing / Withdrawing 3D Rigs (Continuous Exit Motion!)
    for (let i = this.dyingRigs.length - 1; i >= 0; i--) {
      const dr = this.dyingRigs[i];
      dr.age += dt;
      const u = Math.min(1, dr.age / dr.duration);
      if (dr.kind === 'tower_withdraw') {
        dr.root.scale.set(1 - u * 0.4, Math.max(0.02, 1 - u), 1 - u * 0.4);
        dr.root.position.y = dr.startY + u * 0.35;
      } else if (dr.kind === 'tower_destroy') {
        dr.root.rotation.z = dr.spinDir * u * 0.72;
        dr.root.rotation.x = u * 0.45;
        dr.root.position.y = dr.startY - u * 0.55;
        dr.root.scale.setScalar(Math.max(0.04, 1 - u * 0.85));
      } else if (dr.kind === 'boss') {
        dr.root.rotation.y += dr.spinDir * dt * (4 + u * 8);
        dr.root.rotation.z = Math.sin(u * Math.PI * 3) * 0.45 * u;
        dr.root.position.y = dr.startY + Math.sin(u * Math.PI) * 0.65 - u * 1.1;
        dr.root.scale.setScalar(Math.max(0.04, 1 - u * u));
      } else {
        dr.root.rotation.y += dr.spinDir * dt * 9;
        dr.root.rotation.x = u * 1.15;
        dr.root.position.y = dr.startY - u * 0.42;
        dr.root.scale.setScalar(Math.max(0.04, 1 - u));
      }
      if (dr.age >= dr.duration) {
        this.entitiesGroup.remove(dr.root);
        this.disposeGroup(dr.root);
        this.dyingRigs.splice(i, 1);
      }
    }

    // 5. Update environment animations & VFX
    updateEnvironmentAnimation(this.env, engine, simTime, dt);
    this.vfx.update(engine, simTime, dt);

    if (this.selectRing.visible) {
      this.selectRing.rotation.z = simTime * 1.5;
    }

    this.composer.render();
  }
}
