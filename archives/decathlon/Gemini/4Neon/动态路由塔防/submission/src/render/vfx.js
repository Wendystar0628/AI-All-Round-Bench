import * as THREE from 'three';
import { DIRECTION_VECTORS, ENTRY_COLORS } from '../data/specs.js';
import { gridToWorld, TILE_SIZE } from './environment.js';

export class VFXManager {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;

    this.routeGroup = new THREE.Group();
    this.previewRouteGroup = new THREE.Group();
    this.validTilesGroup = new THREE.Group();
    this.placementGroup = new THREE.Group();
    this.zoneGroup = new THREE.Group();
    this.blockLinesGroup = new THREE.Group();
    this.effectsGroup = new THREE.Group();

    scene.add(
      this.routeGroup,
      this.previewRouteGroup,
      this.validTilesGroup,
      this.placementGroup,
      this.zoneGroup,
      this.blockLinesGroup,
      this.effectsGroup
    );

    this.routeFlowBeads = [];
    this.businessPackets = [];
    this.routeHighlightTimers = {}; // entryId -> remaining flash seconds
    this.transientEffects = []; // { mesh, age, duration, update(t, dt) }
    this.projectileMeshes = new Map();
    this.sealedMarkers = [];
  }

  clearAll() {
    this.clearGroup(this.routeGroup);
    this.clearGroup(this.previewRouteGroup);
    this.clearGroup(this.validTilesGroup);
    this.clearGroup(this.placementGroup);
    this.clearGroup(this.zoneGroup);
    this.clearGroup(this.blockLinesGroup);
    this.clearGroup(this.effectsGroup);
    this.routeFlowBeads = [];
    this.businessPackets = [];
    this.routeHighlightTimers = {};
    this.transientEffects = [];
    this.projectileMeshes.clear();
    this.sealedMarkers = [];
  }

  clearGroup(grp) {
    while (grp.children.length > 0) {
      const child = grp.children[0];
      grp.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
  }

  // ==================== CURRENT ROUTE RIBBONS ====================

  rebuildEntryRoutes(map, entryRoutes, changedEntries = []) {
    this.clearGroup(this.routeGroup);
    this.routeFlowBeads = [];
    this.businessPackets = [];

    for (const eid of changedEntries) {
      this.routeHighlightTimers[eid] = 2.8;
    }

    const entryIds = Object.keys(entryRoutes).sort();
    const lateralOffsets = { A: -0.26, B: 0.26, C: 0.0 };
    if (entryIds.length === 2) {
      lateralOffsets.A = -0.22;
      lateralOffsets.B = 0.22;
    }

    for (const eid of entryIds) {
      const route = entryRoutes[eid];
      if (!route || !route.path || route.path.length < 2) continue;
      const cHex = (ENTRY_COLORS[eid] || ENTRY_COLORS.A).int;
      const lat = lateralOffsets[eid] || 0;

      const points = route.path.map((p) => {
        const w = gridToWorld(map, p.x, p.y, 0.11);
        w.x += lat;
        w.z += lat * 0.65;
        return w;
      });

      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.14);
      const isFlashing = (this.routeHighlightTimers[eid] || 0) > 0;

      // Crisp translucent glowing energy ribbon tube
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(16, points.length * 4), isFlashing ? 0.085 : 0.055, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: cHex,
        transparent: true,
        opacity: isFlashing ? 0.88 : 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.userData = { entryId: eid, baseOpacity: 0.56 };
      this.routeGroup.add(tube);

      // Animated directional flow chevrons gliding along the route toward the Exit!
      const beadCount = Math.max(5, Math.floor(points.length * 0.65));
      const chevGeo = new THREE.ConeGeometry(0.14, 0.34, 3);
      chevGeo.rotateX(Math.PI / 2);
      const chevMat = new THREE.MeshBasicMaterial({
        color: cHex,
        transparent: true,
        opacity: 0.95,
      });
      for (let i = 0; i < beadCount; i++) {
        const bead = new THREE.Mesh(chevGeo, chevMat);
        this.routeGroup.add(bead);
        this.routeFlowBeads.push({
          mesh: bead,
          curve,
          entryId: eid,
          t: i / beadCount,
          speed: 0.14 + (1.4 / Math.max(8, points.length)),
        });
      }

      // Subtle translucent Normal Business Traffic capsules gliding along live routes (2.1.1: 链路同时承载正常业务!)
      const bizGeo = new THREE.BoxGeometry(0.14, 0.1, 0.28);
      const bizMat = new THREE.MeshBasicMaterial({
        color: 0xdff8ff,
        transparent: true,
        opacity: 0.58,
      });
      const bizCount = Math.max(3, Math.floor(points.length * 0.28));
      for (let i = 0; i < bizCount; i++) {
        const cap = new THREE.Mesh(bizGeo, bizMat);
        this.routeGroup.add(cap);
        this.businessPackets.push({
          mesh: cap,
          curve,
          t: (i / bizCount + 0.13) % 1,
          speed: 0.21 + (1.2 / Math.max(10, points.length)),
        });
      }
    }
  }

  // ==================== PREVIEW ROUTE OVERLAY (Distinct Dashed Holographic Ribbons) ====================

  showRoutePreview(map, previewRoutes, changedEntries = [], sealedInfo = null) {
    this.clearGroup(this.previewRouteGroup);

    if (previewRoutes && changedEntries.length > 0) {
      const lateralOffsets = { A: -0.22, B: 0.22, C: 0.0 };
      for (const eid of changedEntries) {
        const route = previewRoutes[eid];
        if (!route || !route.path || route.path.length < 2) continue;
        const lat = lateralOffsets[eid] || 0;
        const cHex = (ENTRY_COLORS[eid] || ENTRY_COLORS.A).int;

        const pts = route.path.map((p) => {
          const w = gridToWorld(map, p.x, p.y, 0.28);
          w.x += lat;
          w.z += lat * 0.5;
          return w;
        });

        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.14);
        // Bright white-tinted pulsing preview dashed beacons so it's unmistakable from current routes!
        const sampleCount = Math.max(12, route.path.length * 2);
        const segGeo = new THREE.ConeGeometry(0.18, 0.44, 4);
        segGeo.rotateX(Math.PI / 2);
        const segMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.92,
        });
        const haloMat = new THREE.MeshBasicMaterial({
          color: cHex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const ribbonGeo = new THREE.TubeGeometry(curve, Math.max(20, pts.length * 4), 0.11, 6, false);
        this.previewRouteGroup.add(new THREE.Mesh(ribbonGeo, haloMat));

        for (let i = 0; i < sampleCount; i++) {
          const t = i / sampleCount;
          const p0 = curve.getPointAt(t);
          const p1 = curve.getPointAt(Math.min(0.999, t + 0.015));
          const m = new THREE.Mesh(segGeo, segMat);
          m.position.copy(p0);
          m.lookAt(p1);
          this.previewRouteGroup.add(m);
        }
      }
    }

    // Sealed-route red X markers on exact blocked entries / enemies!
    if (sealedInfo) {
      const targets = [];
      if (sealedInfo.sealedEntries) {
        for (const e of sealedInfo.sealedEntries) targets.push({ x: e.x, y: e.y });
      }
      if (sealedInfo.sealedEnemies) {
        for (const se of sealedInfo.sealedEnemies) targets.push({ x: se.x, y: se.y });
      }
      if (sealedInfo.nodePos) targets.push(sealedInfo.nodePos);

      for (const t of targets) {
        const w = gridToWorld(map, t.x, t.y, 0.3);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.65, 0.92, 24),
          new THREE.MeshBasicMaterial({ color: 0xff2b4a, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(w);
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.55, 2.2, 6, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xff2b4a,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        pillar.position.set(w.x, 1.15, w.z);
        this.previewRouteGroup.add(ring, pillar);
      }
    }
  }

  clearRoutePreview() {
    this.clearGroup(this.previewRouteGroup);
  }

  // ==================== PLACEMENT & RANGE PREVIEW ====================

  showPlacementPreview(map, opts) {
    this.clearGroup(this.placementGroup);
    if (!opts) return;

    const { x, y, valid, range, secondaryRange, secondaryColor, directional, dir, rangeForward, rangeSide, affectedTiles } = opts;
    const baseY = map.grid[y]?.[x]?.type === 'platform' ? 0.52 : 0.08;
    const pos = gridToWorld(map, x, y, baseY);
    const col = valid ? 0x2ef5b8 : 0xff3552;

    // Tile highlight square
    const sq = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_SIZE - 0.14, TILE_SIZE - 0.14),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    sq.rotation.x = -Math.PI / 2;
    sq.position.copy(pos);
    this.placementGroup.add(sq);

    // Affected tiles (e.g., Protocol Downgrade AoE footprint)
    if (affectedTiles && affectedTiles.length > 0) {
      const tileMat = new THREE.MeshBasicMaterial({
        color: valid ? 0xffb830 : 0xff3552,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      for (const t of affectedTiles) {
        const tp = gridToWorld(map, t.x, t.y, 0.12);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE_SIZE - 0.16, TILE_SIZE - 0.16), tileMat);
        m.rotation.x = -Math.PI / 2;
        m.position.copy(tp);
        this.placementGroup.add(m);
      }
    }

    // Directional rectangular firing corridor preview (Interceptor!)
    if (directional && rangeForward > 0) {
      const dv = DIRECTION_VECTORS[dir] || DIRECTION_VECTORS.S;
      const w = (rangeSide * 2 + 0.5) * TILE_SIZE;
      const len = (rangeForward + 0.5) * TILE_SIZE;

      const rect = new THREE.Mesh(
        new THREE.PlaneGeometry(w, len),
        new THREE.MeshBasicMaterial({
          color: valid ? 0x26e6ff : 0xff3552,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      rect.rotation.x = -Math.PI / 2;
      rect.rotation.z = -dv.angle;
      rect.position.set(
        pos.x + dv.dx * (len * 0.5 - TILE_SIZE * 0.25),
        baseY + 0.06,
        pos.z + dv.dz * (len * 0.5 - TILE_SIZE * 0.25)
      );
      this.placementGroup.add(rect);

      // Crisp directional arrow cone showing facing unmistakably
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.95, 3),
        new THREE.MeshBasicMaterial({ color: 0x3ef5ff, transparent: true, opacity: 0.92 })
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = -dv.angle;
      arrow.position.set(pos.x + dv.dx * 1.4, baseY + 0.35, pos.z + dv.dz * 1.4);
      this.placementGroup.add(arrow);
    } else if (range > 0) {
      // Circular range indicator
      const worldR = range * TILE_SIZE;
      const disk = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.1, worldR - 0.12), worldR, 48),
        new THREE.MeshBasicMaterial({
          color: valid ? 0x35e8ff : 0xff3552,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(pos.x, baseY + 0.05, pos.z);
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(worldR, 48),
        new THREE.MeshBasicMaterial({
          color: valid ? 0x26d4ff : 0xff3552,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(pos.x, baseY + 0.04, pos.z);
      this.placementGroup.add(disk, fill);

      // Optional secondary range ring (e.g. Sandbox stealth-detect ring or Honeypot taunt-aggro ring!)
      if (secondaryRange && secondaryRange > 0 && Math.abs(secondaryRange - range) > 0.15) {
        const secR = secondaryRange * TILE_SIZE;
        const secCol = valid ? secondaryColor || 0xffc83b : 0xff3552;
        const secRing = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.1, secR - 0.1), secR, 48),
          new THREE.MeshBasicMaterial({
            color: secCol,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        secRing.rotation.x = -Math.PI / 2;
        secRing.position.set(pos.x, baseY + 0.06, pos.z);
        this.placementGroup.add(secRing);
      }
    }
  }

  clearPlacementPreview() {
    this.clearGroup(this.placementGroup);
  }

  /**
   * Softly illuminates all valid buildable / targetable tiles while dragging a Tower or Item card!
   */
  showValidTiles(map, tiles, colorHex = 0x2ef5c8) {
    this.clearGroup(this.validTilesGroup);
    if (!map || !tiles || tiles.length === 0) return;

    const ringGeo = new THREE.RingGeometry(0.68, 0.82, 4);
    ringGeo.rotateZ(Math.PI / 4);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillGeo = new THREE.PlaneGeometry(TILE_SIZE - 0.26, TILE_SIZE - 0.26);
    const fillMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const t of tiles) {
      const baseY = map.grid[t.y]?.[t.x]?.type === 'platform' ? 0.51 : 0.06;
      const w = gridToWorld(map, t.x, t.y, baseY);
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.rotation.x = -Math.PI / 2;
      r.position.copy(w);
      const f = new THREE.Mesh(fillGeo, fillMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(w.x, baseY - 0.01, w.z);
      this.validTilesGroup.add(r, f);
    }
  }

  clearValidTiles() {
    this.clearGroup(this.validTilesGroup);
  }

  // ==================== EVENT-DRIVEN TRANSIENT COMBAT VFX ====================

  handleEngineEvent(map, ev) {
    if (ev.type === 'rail_beam') {
      const p0 = gridToWorld(map, ev.fromX, ev.fromY, ev.fromAlt);
      const p1 = gridToWorld(map, ev.toX, ev.toY, ev.toAlt);
      this.spawnBeam(p0, p1, 0x4df5ff, 0.14, 0.24);
      this.spawnRingBurst(p1, 0x4df5ff, 1.1, 0.25);
    } else if (ev.type === 'heal_beam') {
      const p0 = gridToWorld(map, ev.fromX, ev.fromY, 1.65);
      const p1 = gridToWorld(map, ev.toX, ev.toY, 0.95);
      this.spawnBeam(p0, p1, 0x36ffaa, 0.1, 0.42);
      this.spawnRingBurst(p1, 0x36ffaa, 1.0, 0.4);
    } else if (ev.type === 'sandbox_pulse') {
      const p = gridToWorld(map, ev.x, ev.y, 0.35);
      this.spawnRingBurst(p, 0x2ae8ff, ev.radius * TILE_SIZE, 0.45);
    } else if (ev.type === 'skill_sandbox_scan') {
      const p = gridToWorld(map, ev.x, ev.y, 0.45);
      this.spawnRingBurst(p, 0x3effd0, ev.radius * TILE_SIZE, 0.72);
      this.spawnDomePulse(p, 0x29e6ff, ev.radius * TILE_SIZE, 0.65);
    } else if (ev.type === 'skill_repair_failover') {
      const p = gridToWorld(map, ev.x, ev.y, 0.45);
      this.spawnDomePulse(p, 0x34ffaa, ev.radius * TILE_SIZE, 0.85);
      this.spawnRingBurst(p, 0x6bffce, ev.radius * TILE_SIZE, 0.75);
      for (const a of ev.affected || []) {
        const ap = gridToWorld(map, a.x, a.y, 0.85);
        this.spawnPillarFlash(ap, 0x36ffaa, 0.75);
      }
    } else if (ev.type === 'skill_honeypot_entrap') {
      const p = gridToWorld(map, ev.x, ev.y, 0.25);
      this.spawnRingBurst(p, 0xffc83b, ev.radius * TILE_SIZE, 0.8);
      this.spawnDomePulse(p, 0xffaa22, ev.radius * TILE_SIZE, 0.7);
    } else if (ev.type === 'melee_strike') {
      const p0 = gridToWorld(map, ev.fromX, ev.fromY, 0.65);
      const p1 = gridToWorld(map, ev.toX, ev.toY, 0.55);
      this.spawnBeam(p0, p1, 0x52f2ff, 0.08, 0.16);
      this.spawnSparkBurst(p1, 0x52f2ff, 6, 0.25);
    } else if (ev.type === 'firewall_shockwave') {
      const p = gridToWorld(map, ev.x, ev.y, 0.3);
      this.spawnRingBurst(p, 0x38eeff, 3.2, 0.4);
    } else if (ev.type === 'tower_damaged' || ev.type === 'isolator_damaged') {
      const p0 = gridToWorld(map, ev.fromX, ev.fromY, 0.65);
      const p1 = gridToWorld(map, ev.x, ev.y, 0.72);
      const fxCol = ev.isSurge ? 0xff2942 : ev.ranged ? 0xd24dff : ev.isPayload ? 0xff2b55 : 0xff7b29;
      if (!ev.ranged && p0.distanceTo(p1) > 0.2) {
        this.spawnBeam(p0, p1, fxCol, ev.isSurge ? 0.2 : 0.08, 0.24);
      }
      this.spawnSparkBurst(p1, fxCol, ev.isSurge ? 16 : 8, 0.35);
      if (ev.amount >= 20) {
        this.spawnRingBurst(p1, fxCol, ev.isSurge ? 2.6 : 1.35, 0.28);
      }
    } else if (ev.type === 'node_bashed') {
      const p = gridToWorld(map, ev.nodeX, ev.nodeY, 0.55);
      this.spawnRingBurst(p, 0xff7b24, 2.4, 0.35);
    } else if (ev.type === 'tower_destroyed') {
      const p = gridToWorld(map, ev.x, ev.y, 0.6);
      this.spawnSparkBurst(p, 0xff4632, 22, 0.75);
      this.spawnRingBurst(p, 0xff5a26, 3.4, 0.6);
    } else if (ev.type === 'enemy_killed') {
      const p = gridToWorld(map, ev.x, ev.y, ev.alt + 0.5);
      this.spawnSparkBurst(p, ev.isBoss ? 0xff3055 : 0xff6b38, ev.isBoss ? 34 : 10, ev.isBoss ? 1.1 : 0.42);
      if (ev.isBoss) {
        this.spawnRingBurst(p, 0xff3660, 7.5, 0.95);
        this.spawnDomePulse(p, 0xd44dff, 6.0, 0.9);
      }
    } else if (ev.type === 'enemy_revealed') {
      const p = gridToWorld(map, ev.x, ev.y, 0.65);
      this.spawnRingBurst(p, 0x3ef2ff, 1.8, 0.4);
      this.spawnPillarFlash(p, 0x3ef2ff, 0.4);
    } else if (ev.type === 'trojan_payload_blast') {
      const p = gridToWorld(map, ev.x, ev.y, 0.55);
      this.spawnDomePulse(p, 0xff2b55, ev.radius * TILE_SIZE, 0.65);
      this.spawnSparkBurst(p, 0xff2b55, 22, 0.65);
    } else if (ev.type === 'packager_shield') {
      const p0 = gridToWorld(map, ev.fromX, ev.fromY, 0.75);
      for (const t of ev.targets || []) {
        const p1 = gridToWorld(map, t.x, t.y, 0.65);
        this.spawnBeam(p0, p1, 0xffc845, 0.08, 0.38);
      }
    } else if (ev.type === 'tower_encrypted') {
      const p = gridToWorld(map, ev.x, ev.y, 0.85);
      this.spawnRingBurst(p, 0xc84dff, 2.0, 0.45);
    } else if (ev.type === 'boss_routing_storm') {
      const p = gridToWorld(map, ev.x, ev.y, 0.7);
      this.spawnRingBurst(p, 0xc94dff, ev.radius * TILE_SIZE, 0.85);
      this.spawnDomePulse(p, 0xa836ff, ev.radius * TILE_SIZE, 0.8);
    } else if (ev.type === 'boss_impact' || ev.type === 'boss_terrain_changed') {
      const tiles = ev.tiles || (ev.x !== undefined ? [{ x: ev.x, y: ev.y }] : []);
      for (const t of tiles) {
        const p = gridToWorld(map, t.x, t.y, 0.45);
        this.spawnRingBurst(p, 0xff2650, 3.6, 0.65);
        this.spawnSparkBurst(p, 0xff3660, 18, 0.7);
      }
    } else if (ev.type === 'node_isolated') {
      const p = gridToWorld(map, ev.x, ev.y, 0.35);
      this.spawnRingBurst(p, 0xffb830, 2.8, 0.55);
      this.spawnPillarFlash(p, 0xffb830, 0.55);
    } else if (ev.type === 'node_bypass_open') {
      const p = gridToWorld(map, ev.x, ev.y, 0.35);
      this.spawnRingBurst(p, 0x35f5be, 3.2, 0.65);
      this.spawnSparkBurst(p, 0xff8830, 16, 0.55);
    } else if (ev.type === 'item_used') {
      const p = gridToWorld(map, ev.x, ev.y, 0.45);
      if (ev.itemId === 'downgrade') {
        this.spawnRingBurst(p, 0xffae26, 4.2, 0.7);
      } else if (ev.itemId === 'restore') {
        this.spawnPillarFlash(p, 0x38ffaa, 0.75);
        this.spawnRingBurst(p, 0x38ffaa, 2.4, 0.55);
      }
    } else if (ev.type === 'projectile_hit') {
      const p = gridToWorld(map, ev.x, ev.y, ev.alt);
      const col = ev.kind === 'suppress' ? 0xffc638 : 0x45f2ff;
      this.spawnSparkBurst(p, col, 5, 0.22);
    } else if (ev.type === 'worm_split') {
      const p = gridToWorld(map, ev.x, ev.y, 0.4);
      this.spawnRingBurst(p, 0xff6230, 1.5, 0.32);
    } else if (ev.type === 'core_breached') {
      const p = gridToWorld(map, ev.x, ev.y, 0.8);
      this.spawnRingBurst(p, 0xff2244, 4.2, 0.75);
      this.spawnPillarFlash(p, 0xff2244, 0.75);
    } else if (ev.type === 'tower_upgraded' && ev.tower) {
      const baseY = map.grid[ev.tower.y]?.[ev.tower.x]?.type === 'platform' ? 0.55 : 0.15;
      const p = gridToWorld(map, ev.tower.x, ev.tower.y, baseY);
      this.spawnPillarFlash(p, 0x3ef5ff, 0.72);
      this.spawnRingBurst(p, 0xffd04a, 2.8, 0.65);
    } else if (ev.type === 'action_rejected' && ev.sealed) {
      if (ev.x !== undefined && ev.y !== undefined) {
        const p = gridToWorld(map, ev.x, ev.y, 0.35);
        this.spawnRingBurst(p, 0xff264a, 3.0, 1.2);
        this.spawnPillarFlash(p, 0xff264a, 1.2);
      }
      for (const se of ev.sealedEntries || []) {
        const p = gridToWorld(map, se.x, se.y, 0.4);
        this.spawnRingBurst(p, 0xff264a, 3.2, 1.3);
        this.spawnPillarFlash(p, 0xff264a, 1.3);
      }
      for (const sen of ev.sealedEnemies || []) {
        const p = gridToWorld(map, sen.x, sen.y, 0.4);
        this.spawnRingBurst(p, 0xff264a, 2.6, 1.3);
        this.spawnPillarFlash(p, 0xff264a, 1.3);
      }
    }
  }

  spawnBeam(p0, p1, colorHex, radius, duration) {
    const dist = Math.max(0.05, p0.distanceTo(p1));
    const geo = new THREE.CylinderGeometry(radius, radius, dist, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(p0).add(p1).multiplyScalar(0.5);
    mesh.lookAt(p1);
    this.effectsGroup.add(mesh);

    this.transientEffects.push({
      mesh,
      age: 0,
      duration,
      update: (u) => {
        mat.opacity = 1 - u;
        mesh.scale.set(1 - u * 0.6, 1 - u * 0.6, 1);
      },
    });
  }

  spawnRingBurst(pos, colorHex, maxRadius, duration) {
    const geo = new THREE.RingGeometry(0.75, 1.0, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.15);
    this.effectsGroup.add(mesh);

    this.transientEffects.push({
      mesh,
      age: 0,
      duration,
      update: (u) => {
        const s = 0.2 + maxRadius * (1 - Math.pow(1 - u, 2));
        mesh.scale.setScalar(s);
        mat.opacity = (1 - u) * 0.9;
      },
    });
  }

  spawnDomePulse(pos, colorHex, maxRadius, duration) {
    const geo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.1, pos.z);
    this.effectsGroup.add(mesh);

    this.transientEffects.push({
      mesh,
      age: 0,
      duration,
      update: (u) => {
        const s = 0.2 + maxRadius * Math.sin(u * Math.PI * 0.5);
        mesh.scale.set(s, s * 0.55, s);
        mat.opacity = (1 - u) * 0.42;
      },
    });
  }

  spawnPillarFlash(pos, colorHex, duration) {
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 1.6, pos.z);
    this.effectsGroup.add(mesh);

    this.transientEffects.push({
      mesh,
      age: 0,
      duration,
      update: (u) => {
        mesh.scale.set(1 + u * 0.5, 1 + u * 0.3, 1 + u * 0.5);
        mat.opacity = (1 - u) * 0.65;
      },
    });
  }

  spawnSparkBurst(pos, colorHex, count, duration) {
    const grp = new THREE.Group();
    grp.position.copy(pos);
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / count) * Math.PI * 2 + (i * 0.7);
      const spd = 2.0 + (i % 4) * 1.1;
      const vy = 1.6 + (i % 3) * 1.2;
      grp.add(m);
      parts.push({ m, vx: Math.cos(a) * spd, vy, vz: Math.sin(a) * spd });
    }
    this.effectsGroup.add(grp);

    this.transientEffects.push({
      mesh: grp,
      age: 0,
      duration,
      update: (u, dt) => {
        for (const pt of parts) {
          pt.m.position.x += pt.vx * dt;
          pt.m.position.y += pt.vy * dt;
          pt.m.position.z += pt.vz * dt;
          pt.vy -= 7.5 * dt;
          pt.m.rotation.x += 8 * dt;
          pt.m.scale.setScalar(Math.max(0.01, 1 - u));
        }
        mat.opacity = 1 - u;
      },
    });
  }

  // ==================== PER-FRAME SYNC ====================

  update(engine, simTime, dt) {
    // 1. Animate route beads & changed-route pulse timers
    for (const eid of Object.keys(this.routeHighlightTimers)) {
      if (this.routeHighlightTimers[eid] > 0) {
        this.routeHighlightTimers[eid] = Math.max(0, this.routeHighlightTimers[eid] - dt);
      }
    }
    for (const child of this.routeGroup.children) {
      if (child.userData && child.userData.entryId && child.material) {
        const flash = this.routeHighlightTimers[child.userData.entryId] || 0;
        if (flash > 0) {
          child.material.opacity = 0.62 + 0.32 * (0.5 + 0.5 * Math.sin(simTime * 11));
        } else {
          child.material.opacity = child.userData.baseOpacity || 0.56;
        }
      }
    }
    for (const b of this.routeFlowBeads) {
      b.t = (b.t + b.speed * dt) % 1;
      const p0 = b.curve.getPointAt(b.t);
      const p1 = b.curve.getPointAt(Math.min(0.999, b.t + 0.012));
      b.mesh.position.copy(p0);
      b.mesh.lookAt(p1);
    }
    for (const bp of this.businessPackets) {
      bp.t = (bp.t + bp.speed * dt) % 1;
      const p0 = bp.curve.getPointAt(bp.t);
      const p1 = bp.curve.getPointAt(Math.min(0.999, bp.t + 0.012));
      bp.mesh.position.set(p0.x, p0.y + 0.08, p0.z);
      bp.mesh.lookAt(p1.x, p1.y + 0.08, p1.z);
    }

    // 2. Sync live projectiles (distinct sculpted 3D energy darts, frequency rings & violet ransom shards!)
    const activeProjIds = new Set();
    for (const p of engine.projectiles) {
      activeProjIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Group();
        if (p.kind === 'ransom_bolt') {
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.24, 0),
            new THREE.MeshBasicMaterial({ color: 0xd85cff })
          );
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.045, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff4df2, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
          );
          mesh.add(core, halo);
        } else if (p.kind === 'suppress') {
          const core = new THREE.Mesh(
            new THREE.ConeGeometry(0.14, 0.56, 6),
            new THREE.MeshBasicMaterial({ color: 0xffd04a })
          );
          core.rotation.x = Math.PI / 2;
          const wave = new THREE.Mesh(
            new THREE.TorusGeometry(0.24, 0.04, 6, 14),
            new THREE.MeshBasicMaterial({ color: 0xffa822, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
          );
          mesh.add(core, wave);
        } else {
          // Crisp cyan hyper-velocity dart with luminous tail
          const dart = new THREE.Mesh(
            new THREE.ConeGeometry(0.11, 0.62, 6),
            new THREE.MeshBasicMaterial({ color: 0x70f8ff })
          );
          dart.rotation.x = Math.PI / 2;
          const tail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.01, 0.55, 6),
            new THREE.MeshBasicMaterial({ color: 0x22d8ff, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending })
          );
          tail.rotation.x = Math.PI / 2;
          tail.position.z = -0.42;
          mesh.add(dart, tail);
        }
        this.effectsGroup.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      const prevPos = mesh.userData.prevPos;
      const w = gridToWorld(engine.map, p.x, p.y, p.alt);
      mesh.position.copy(w);
      if (p.kind === 'ransom_bolt') {
        mesh.rotation.y += dt * 11;
        mesh.rotation.x += dt * 7;
      } else if (prevPos && prevPos.distanceToSquared(w) > 0.0001) {
        const ahead = w.clone().add(w.clone().sub(prevPos));
        mesh.lookAt(ahead);
      }
      mesh.userData.prevPos = w.clone();
    }
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeProjIds.has(id)) {
        this.effectsGroup.remove(mesh);
        mesh.traverse?.((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        this.projectileMeshes.delete(id);
      }
    }

    // 3. Rebuild lightweight dynamic zones (Protocol Downgrade, Boss Warnings, Boss Blackholes/Lockdowns)
    this.syncDynamicZones(engine, simTime);

    // 4. Rebuild crisp block-relationship lines (Rule 2.12.2)
    this.syncBlockLines(engine);

    // 5. Update transient effects
    for (let i = this.transientEffects.length - 1; i >= 0; i--) {
      const fx = this.transientEffects[i];
      fx.age += dt;
      const u = Math.min(1, fx.age / fx.duration);
      fx.update(u, dt);
      if (fx.age >= fx.duration) {
        this.effectsGroup.remove(fx.mesh);
        fx.mesh.traverse?.((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        this.transientEffects.splice(i, 1);
      }
    }
  }

  syncDynamicZones(engine, simTime) {
    this.clearGroup(this.zoneGroup);

    // Protocol Downgrade glowing amber architectural containment borders (zero diagonal wireframe clutter!)
    if (engine.downgradedTiles.size > 0) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb024,
        transparent: true,
        opacity: 0.34 + 0.14 * Math.sin(simTime * 6),
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const borderMat = new THREE.LineBasicMaterial({ color: 0xffd052, transparent: true, opacity: 0.92 });
      const borderBox = new THREE.BoxGeometry(TILE_SIZE - 0.18, 0.2, TILE_SIZE - 0.18);
      for (const k of engine.downgradedTiles) {
        const [x, y] = k.split(',').map(Number);
        const w = gridToWorld(engine.map, x, y, 0.14);
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(TILE_SIZE - 0.14, TILE_SIZE - 0.14), mat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.copy(w);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(borderBox), borderMat);
        edges.position.set(w.x, 0.18, w.z);
        this.zoneGroup.add(pad, edges);
      }
      borderBox.dispose();
    }

    // Boss Telegraph Warnings (HIGH VISIBILITY BEFORE TERRAIN CHANGE + Targeting Laser from Boss!)
    for (const warn of engine.bossWarnings) {
      const pulse = 0.5 + 0.5 * Math.sin(simTime * 16);
      const frac = 1 - warn.remaining / warn.duration;
      const col = warn.kind === 'blackhole' ? 0xd94dff : 0xff2b48;
      const boss = engine.enemies.find((e) => e.id === warn.bossId && !e.dead);
      const bossPos = boss ? gridToWorld(engine.map, boss.gx, boss.gy, 1.5) : null;

      for (const t of warn.tiles) {
        const w = gridToWorld(engine.map, t.x, t.y, 0.2);
        const outer = new THREE.Mesh(
          new THREE.RingGeometry(0.65, 0.95, 24),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.5 + pulse * 0.45 })
        );
        outer.rotation.x = -Math.PI / 2;
        outer.position.copy(w);

        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(Math.max(0.1, frac * 0.9), 24),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(w.x, 0.22, w.z);

        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.72, 3.0, 8, 1, true),
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.22 + pulse * 0.25,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        beam.position.set(w.x, 1.5, w.z);
        this.zoneGroup.add(outer, fill, beam);

        // Telegraph laser line straight from Boss to warning tile!
        if (bossPos) {
          const lGeo = new THREE.BufferGeometry().setFromPoints([bossPos, new THREE.Vector3(w.x, 0.65, w.z)]);
          const lMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 + pulse * 0.45 });
          this.zoneGroup.add(new THREE.Line(lGeo, lMat));
        }
      }
    }

    // Active Boss Terrain Blocks (Route Blackhole / Ops Ring Lockdown)
    for (const [key, info] of engine.blockedTiles.entries()) {
      const [x, y] = key.split(',').map(Number);
      const w = gridToWorld(engine.map, x, y, 0.15);
      if (info.kind === 'blackhole') {
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.58, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x090212 })
        );
        core.position.set(w.x, 0.75, w.z);
        const swirl = new THREE.Mesh(
          new THREE.TorusGeometry(0.84, 0.12, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xc942ff, transparent: true, opacity: 0.9 })
        );
        swirl.rotation.x = Math.PI / 2;
        swirl.rotation.z = simTime * 4;
        swirl.position.set(w.x, 0.45, w.z);
        this.zoneGroup.add(core, swirl);
      } else {
        // Ops Ring Crimson Lockdown Cage — razor-sharp laser edges + horizontal containment rails!
        const cageBox = new THREE.BoxGeometry(TILE_SIZE - 0.16, 1.38, TILE_SIZE - 0.16);
        const cage = new THREE.LineSegments(
          new THREE.EdgesGeometry(cageBox),
          new THREE.LineBasicMaterial({ color: 0xff3058 })
        );
        cageBox.dispose();
        cage.position.set(w.x, 0.72, w.z);
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE - 0.22, 1.28, TILE_SIZE - 0.22),
          new THREE.MeshBasicMaterial({
            color: 0xff1a40,
            transparent: true,
            opacity: 0.24 + 0.1 * Math.sin(simTime * 10),
            depthWrite: false,
          })
        );
        glow.position.set(w.x, 0.68, w.z);
        const midBarBox = new THREE.BoxGeometry(TILE_SIZE - 0.14, 0.04, TILE_SIZE - 0.14);
        const midBar = new THREE.LineSegments(
          new THREE.EdgesGeometry(midBarBox),
          new THREE.LineBasicMaterial({ color: 0xff6280 })
        );
        midBarBox.dispose();
        midBar.position.set(w.x, 0.72 + 0.18 * Math.sin(simTime * 7), w.z);
        this.zoneGroup.add(cage, glow, midBar);
      }
    }
  }

  syncBlockLines(engine) {
    this.clearGroup(this.blockLinesGroup);
    const blockPts = [];
    for (const en of engine.enemies) {
      if (en.dead || en.blockedByTowerId == null) continue;
      const t = engine.towers.find((tw) => tw.id === en.blockedByTowerId && tw.hp > 0);
      if (!t) continue;
      blockPts.push(gridToWorld(engine.map, t.x, t.y, 0.55));
      blockPts.push(gridToWorld(engine.map, en.gx, en.gy, 0.45));
    }
    if (blockPts.length > 0) {
      const geo = new THREE.BufferGeometry().setFromPoints(blockPts);
      const mat = new THREE.LineBasicMaterial({ color: 0x4df5ff, transparent: true, opacity: 0.85 });
      this.blockLinesGroup.add(new THREE.LineSegments(geo, mat));
    }

    // Persistent shimmering emerald Repair Daemon healing tether beams!
    const healPts = [];
    for (const t of engine.towers) {
      if (t.hp <= 0 || t.type !== 'repair' || t.encryptedTimer > 0 || !t.healTargetIds?.length) continue;
      const src = gridToWorld(engine.map, t.x, t.y, 1.65);
      for (const allyId of t.healTargetIds) {
        const ally = engine.towers.find((a) => a.id === allyId && a.hp > 0);
        if (!ally) continue;
        const dstY = engine.map.grid[ally.y]?.[ally.x]?.type === 'platform' ? 1.15 : 0.78;
        healPts.push(src);
        healPts.push(gridToWorld(engine.map, ally.x, ally.y, dstY));
      }
    }
    if (healPts.length > 0) {
      const geo = new THREE.BufferGeometry().setFromPoints(healPts);
      const mat = new THREE.LineBasicMaterial({ color: 0x36ffaa, transparent: true, opacity: 0.78 });
      this.blockLinesGroup.add(new THREE.LineSegments(geo, mat));
    }
  }
}
