import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ENTRY_COLORS } from '../data/specs.js';
import { tileKey } from '../core/pathfinding.js';

export const TILE_SIZE = 2.0;

export function gridToWorld(map, gx, gy, y = 0) {
  const ox = (map.width - 1) * 0.5;
  const oz = (map.height - 1) * 0.5;
  return new THREE.Vector3((gx - ox) * TILE_SIZE, y, (gy - oz) * TILE_SIZE);
}

export function buildMapEnvironment(map, textures, pal) {
  const group = new THREE.Group();
  const pickables = []; // clickable tile meshes with userData = { gx, gy, tile }
  const nodeVisuals = new Map(); // "x,y" -> { ring, bars, coolRing, statusMat }
  const animated = {
    spinners: [],
    torrentPlanes: [],
    streamPackets: [],
    protocolPlanes: [],
    coreRings: [],
    coreMats: [],
    laserDiodes: [],
  };

  const boardW = map.width * TILE_SIZE;
  const boardD = map.height * TILE_SIZE;

  // ==================== 1. UNDER-DECK STRUCTURAL TRUSS ====================
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x0b1522,
    roughness: 0.65,
    metalness: 0.78,
  });
  const trimColor = new THREE.Color(map.theme.accentHex);
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    emissive: trimColor,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });

  // Outer perimeter bevel hull frame (leaves center open for Map 2 torrent & Map 3 air-gap!)
  const borderThickness = 0.65;
  const hullY = -0.45;
  const northBar = new THREE.Mesh(new THREE.BoxGeometry(boardW + 1.4, 0.55, borderThickness), chassisMat);
  northBar.position.set(0, hullY, -boardD / 2 - borderThickness / 2);
  const southBar = northBar.clone();
  southBar.position.z = boardD / 2 + borderThickness / 2;
  const westBar = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, 0.55, boardD + 1.4), chassisMat);
  westBar.position.set(-boardW / 2 - borderThickness / 2, hullY, 0);
  const eastBar = westBar.clone();
  eastBar.position.x = boardW / 2 + borderThickness / 2;
  group.add(northBar, southBar, westBar, eastBar);

  // Glowing perimeter fiber-trim rails (4 clean outer edge bars — never cuts across open chasms!)
  const trimBarMat = new THREE.MeshBasicMaterial({ color: trimColor, transparent: true, opacity: 0.55 });
  const tN = new THREE.Mesh(new THREE.BoxGeometry(boardW + 1.5, 0.08, 0.08), trimBarMat);
  tN.position.set(0, -0.18, -boardD / 2 - borderThickness);
  const tS = tN.clone();
  tS.position.z = boardD / 2 + borderThickness;
  const tW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, boardD + 1.5), trimBarMat);
  tW.position.set(-boardW / 2 - borderThickness, -0.18, 0);
  const tE = tW.clone();
  tE.position.x = boardW / 2 + borderThickness;
  group.add(tN, tS, tW, tE);

  // Vertical fiber riser conduits dropping down into Protocol Layers
  const riserGeo = new THREE.CylinderGeometry(0.14, 0.14, 14, 6);
  const riserMat = new THREE.MeshStandardMaterial({ color: 0x162b42, metalness: 0.8, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const riser = new THREE.Mesh(riserGeo, riserMat);
      riser.position.set(sx * (boardW * 0.48), -7.4, sz * (boardD * 0.48));
      group.add(riser);
    }
  }

  // ==================== 2. SHARED TILE MATERIALS & GEOMETRIES ====================
  const linkMat = new THREE.MeshStandardMaterial({
    map: textures.linkMap,
    bumpMap: textures.linkBump,
    bumpScale: 0.045,
    roughness: 0.4,
    metalness: 0.58,
  });
  const legacyMat = new THREE.MeshStandardMaterial({
    map: textures.legacyMap,
    bumpMap: textures.legacyBump,
    bumpScale: 0.065,
    emissive: 0x5c3008,
    emissiveIntensity: 0.42,
    roughness: 0.46,
    metalness: 0.6,
  });
  const platTopMat = new THREE.MeshStandardMaterial({
    map: textures.platformMap,
    bumpMap: textures.platformBump,
    bumpScale: 0.05,
    roughness: 0.28,
    metalness: 0.65,
  });
  const platSideMat = new THREE.MeshStandardMaterial({
    color: 0x183047,
    emissive: 0x0b2a42,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.72,
  });
  const rackMat = new THREE.MeshStandardMaterial({
    map: textures.rackMap,
    bumpMap: textures.rackBump,
    bumpScale: 0.06,
    roughness: 0.35,
    metalness: 0.72,
  });
  const rackTopMat = new THREE.MeshStandardMaterial({
    color: 0x122234,
    roughness: 0.45,
    metalness: 0.75,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: textures.hazardMap,
    bumpMap: textures.hazardBump,
    bumpScale: 0.055,
    roughness: 0.44,
    metalness: 0.68,
  });

  const linkGeo = new RoundedBoxGeometry(TILE_SIZE - 0.06, 0.28, TILE_SIZE - 0.06, 2, 0.04);
  const platGeo = new RoundedBoxGeometry(TILE_SIZE - 0.1, 0.76, TILE_SIZE - 0.1, 2, 0.06);
  const legacyRailGeo = new THREE.BoxGeometry(TILE_SIZE - 0.24, 0.06, 0.08);
  const legacyRailMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.9,
  });
  const platCollarGeo = new THREE.BoxGeometry(TILE_SIZE - 0.04, 0.06, TILE_SIZE - 0.04);
  const platCollarMat = new THREE.MeshBasicMaterial({ color: 0x45d8ff, transparent: true, opacity: 0.45 });

  // ==================== 3. POPULATE GRID TILES ====================
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x];
      const pos = gridToWorld(map, x, y, 0);

      // --- LINK / LEGACY / ENTRY / EXIT / NODE BASE SLAB ---
      if (tile.type === 'link' || tile.type === 'entry' || tile.type === 'exit' || tile.type === 'node') {
        const mesh = new THREE.Mesh(linkGeo, linkMat);
        mesh.position.set(pos.x, -0.14, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { gx: x, gy: y, tile };
        group.add(mesh);
        pickables.push(mesh);

        // Map 2 bridge viaduct underside piers for crossing links over the torrent!
        if (map.id === 'backbone' && (y === 5 || y === 6)) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.6, 0.45), chassisMat);
          pier.position.set(pos.x, -2.0, pos.z);
          group.add(pier);
          for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, TILE_SIZE - 0.08), trimMat);
            rail.position.set(pos.x + side * (TILE_SIZE * 0.46), 0.12, pos.z);
            group.add(rail);
          }
        }
      } else if (tile.type === 'legacy') {
        const mesh = new THREE.Mesh(linkGeo, legacyMat);
        mesh.position.set(pos.x, -0.14, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { gx: x, gy: y, tile };
        group.add(mesh);
        pickables.push(mesh);

        // Raised amber legacy conduit rails along borders
        const r1 = new THREE.Mesh(legacyRailGeo, legacyRailMat);
        r1.position.set(pos.x, 0.03, pos.z - TILE_SIZE * 0.42);
        const r2 = new THREE.Mesh(legacyRailGeo, legacyRailMat);
        r2.position.set(pos.x, 0.03, pos.z + TILE_SIZE * 0.42);
        group.add(r1, r2);

        if (map.id === 'backbone' && (y === 5 || y === 6)) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.5), chassisMat);
          pier.position.set(pos.x, -2.0, pos.z);
          group.add(pier);
        }
      } else if (tile.type === 'platform') {
        const mesh = new THREE.Mesh(platGeo, [
          platSideMat,
          platSideMat,
          platTopMat,
          platSideMat,
          platSideMat,
          platSideMat,
        ]);
        mesh.position.set(pos.x, 0.1, pos.z); // top surface sits cleanly at y = +0.48!
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { gx: x, gy: y, tile };
        group.add(mesh);
        pickables.push(mesh);

        // Illuminated cyan under-rim collar separating platform height unmistakably from road!
        const collar = new THREE.Mesh(platCollarGeo, platCollarMat);
        collar.position.set(pos.x, 0.45, pos.z);
        group.add(collar);
      } else if (tile.type === 'obstacle') {
        // Invisible low-profile click target so clicking an obstacle still shows Terrain Inspector info!
        const pickPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        pickPlane.rotation.x = -Math.PI / 2;
        pickPlane.position.set(pos.x, 0.05, pos.z);
        pickPlane.userData = { gx: x, gy: y, tile };
        group.add(pickPlane);
        pickables.push(pickPlane);

        buildObstacleProp(group, map, x, y, tile.subtype, pos, rackMat, rackTopMat, hazardMat, trimMat, chassisMat, animated);
      }

      // --- SWITCH NODE HARDWARE ---
      if (tile.type === 'node') {
        const nVis = buildSwitchNodeHardware(group, pos, pal);
        nodeVisuals.set(tileKey(x, y), nVis);
      }

      // --- ENTRY PORTALS ---
      if (tile.type === 'entry') {
        buildEntryPortal(group, pos, tile.entryId, animated);
      }

      // --- CORE EXITS ---
      if (tile.type === 'exit') {
        buildExitCoreVault(group, pos, tile.exitId, animated);
      }
    }
  }

  // ==================== 4. MAP-SPECIFIC SIGNATURE LANDMARKS ====================
  if (map.id === 'intranet') {
    // Corporate DMZ Security Archways spanning DMZ Interconnect (y=2) & illuminated Fiber Spine Bus over Central Aisle (x=7)
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1c344d, metalness: 0.8, roughness: 0.3 });
    const ledStripMat = new THREE.MeshBasicMaterial({ color: 0x2ce8ff, transparent: true, opacity: 0.82 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x24d8ff,
      emissive: 0x0e6b94,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.34,
      roughness: 0.1,
    });
    for (const ax of [5, 7, 9]) {
      const p = gridToWorld(map, ax, 2, 0);
      const colL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.55, 0.18), archMat);
      colL.position.set(p.x, 0.78, p.z - 0.88);
      const colR = colL.clone();
      colR.position.z = p.z + 0.88;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 1.92), archMat);
      beam.position.set(p.x, 1.56, p.z);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.76), ledStripMat);
      led.position.set(p.x, 1.46, p.z);
      const glassPane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.66), glassMat);
      glassPane.position.set(p.x, 1.28, p.z);
      group.add(colL, colR, beam, led, glassPane);
    }
    // Overhead DMZ Fiber Conduit tying the 3 security gates together cleanly
    const dmzStart = gridToWorld(map, 5, 2, 1.68);
    const dmzEnd = gridToWorld(map, 9, 2, 1.68);
    const dmzLen = dmzEnd.x - dmzStart.x;
    const spineRail = new THREE.Mesh(new THREE.BoxGeometry(dmzLen, 0.08, 0.12), archMat);
    spineRail.position.set((dmzStart.x + dmzEnd.x) * 0.5, 1.68, dmzStart.z);
    const spineGlow = new THREE.Mesh(new THREE.BoxGeometry(dmzLen, 0.04, 0.04), ledStripMat);
    spineGlow.position.set((dmzStart.x + dmzEnd.x) * 0.5, 1.73, dmzStart.z);
    group.add(spineRail, spineGlow);

    // Core Vault Security Archway framing Core Approach (x=7, y=9)
    const coreGatePos = gridToWorld(map, 7, 9, 0);
    const cColL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.72, 0.18), archMat);
    cColL.position.set(coreGatePos.x - 0.92, 0.86, coreGatePos.z);
    const cColR = cColL.clone();
    cColR.position.x = coreGatePos.x + 0.92;
    const cBeam = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.2, 0.2), archMat);
    cBeam.position.set(coreGatePos.x, 1.74, coreGatePos.z);
    const cLed = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0x38f5a8 }));
    cLed.position.set(coreGatePos.x, 1.62, coreGatePos.z);
    group.add(cColL, cColR, cBeam, cLed);
  } else if (map.id === 'backbone') {
    // Continuous glowing Public Internet Torrent (公网洪流) rushing across rows 4..6!
    const torrentGeo = new THREE.PlaneGeometry(boardW + 22, TILE_SIZE * 2.5);
    const torrentMat = new THREE.MeshBasicMaterial({
      map: textures.torrentMap,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const tPlane1 = new THREE.Mesh(torrentGeo, torrentMat);
    tPlane1.rotation.x = -Math.PI / 2;
    const midZ = gridToWorld(map, 0, 5.5, 0).z;
    tPlane1.position.set(0, -0.75, midZ);
    group.add(tPlane1);
    animated.torrentPlanes.push({ mesh: tPlane1, tex: textures.torrentMap, speed: 0.42 });

    // Deeper dark chasm trough floor beneath the torrent
    const chasmFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(boardW + 20, TILE_SIZE * 2.9),
      new THREE.MeshBasicMaterial({ color: 0x020914 })
    );
    chasmFloor.rotation.x = -Math.PI / 2;
    chasmFloor.position.set(0, -1.6, midZ);
    group.add(chasmFloor);

    // 3D Cable-Stayed Fiber Tunnel Arches over West (x=2) & Central (x=6) crossings + Amber Truss Arch over Legacy (x=11)!
    const tunnelSpecs = [
      { gx: 2, color: 0x2ce8ff, mat: chassisMat },
      { gx: 6, color: 0x2ce8ff, mat: chassisMat },
      { gx: 11, color: 0xf59e0b, mat: new THREE.MeshStandardMaterial({ color: 0x3b2a18, metalness: 0.78, roughness: 0.38 }) },
    ];
    for (const ts of tunnelSpecs) {
      const ribGlow = new THREE.MeshBasicMaterial({ color: ts.color, transparent: true, opacity: 0.72 });
      for (const gy of [4.85, 5.5, 6.15]) {
        const bp = gridToWorld(map, ts.gx, gy, 0);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 16, Math.PI), ts.mat);
        arch.position.set(bp.x, 0.08, bp.z);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.025, 6, 16, Math.PI), ribGlow);
        inner.position.set(bp.x, 0.08, bp.z);
        group.add(arch, inner);
      }
    }

    // High-speed rushing data packet cubes shooting along the public torrent
    const pktGeo = new THREE.BoxGeometry(0.9, 0.14, 0.22);
    for (let i = 0; i < 28; i++) {
      const col = i % 3 === 0 ? 0x3ef5ff : i % 3 === 1 ? 0xd466ff : 0x5ca6ff;
      const pkt = new THREE.Mesh(pktGeo, new THREE.MeshBasicMaterial({ color: col }));
      const laneZ = midZ + ((i % 5) - 2) * 0.82;
      const startX = -boardW / 2 - 10 + (i * 2.3) % (boardW + 20);
      pkt.position.set(startX, -0.58 + (i % 3) * 0.08, laneZ);
      group.add(pkt);
      animated.streamPackets.push({
        mesh: pkt,
        kind: 'torrent',
        minX: -boardW / 2 - 10,
        maxX: boardW / 2 + 10,
        speed: 7.5 + (i % 4) * 2.4,
      });
    }
  } else if (map.id === 'airgap') {
    // Central Air-Gap Chasm (x=5..9, y=3..7) — dramatic Faraday Abyss + Cross-Braced Lattice Towers + Optical Diode Pulses!
    const center = gridToWorld(map, 7, 5, 0);
    const gapW = 5 * TILE_SIZE;
    const gapD = 5 * TILE_SIZE;

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.72,
      roughness: 0.4,
    });
    const rimN = new THREE.Mesh(new THREE.BoxGeometry(gapW + 0.1, 0.18, 0.14), rimMat);
    rimN.position.set(center.x, 0.09, center.z - gapD / 2);
    const rimS = rimN.clone();
    rimS.position.z = center.z + gapD / 2;
    const rimW = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, gapD + 0.1), rimMat);
    rimW.position.set(center.x - gapW / 2, 0.09, center.z);
    const rimE = rimW.clone();
    rimE.position.x = center.x + gapW / 2;
    group.add(rimN, rimS, rimW, rimE);

    // 4 Corner Cross-Braced Faraday Cage Lattice Towers framing the Air-Gap
    const latticeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.42 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = center.x + sx * (gapW / 2 - 0.35);
        const pz = center.z + sz * (gapD / 2 - 0.35);
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.35, 6), chassisMat);
        pylon.position.set(px, 0.98, pz);
        pylon.castShadow = true;
        const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.1, 4, 3, true), latticeMat);
        cage.position.set(px, 0.95, pz);
        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          new THREE.MeshBasicMaterial({ color: 0xf5a623 })
        );
        beacon.position.set(px, 2.32, pz);
        group.add(pylon, cage, beacon);
        animated.spinners.push({ mesh: beacon, axis: 'y', speed: 2.2 });
      }
    }

    // Optical-Diode Emitter Housings & Pulsing Laser Beams + Synchronized Data Pulses spanning across the Air-Gap abyss!
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x26f5a4,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
    });
    const pulseGeo = new THREE.BoxGeometry(0.45, 0.1, 0.1);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x6bffd2 });
    for (let i = -2; i <= 2; i++) {
      const zLine = center.z + i * 1.65;
      const yLine = -0.55 - Math.abs(i) * 0.2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, gapW - 0.4, 6), beamMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(center.x, yLine, zLine);
      // Wall emitter lenses
      for (const s of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 8), chassisMat);
        lens.rotation.z = Math.PI / 2;
        lens.position.set(center.x + s * (gapW / 2 - 0.14), yLine, zLine);
        group.add(lens);
      }
      // Animated optical pulse travelling across diode
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.set(center.x, yLine, zLine);
      group.add(b, pulse);
      animated.laserDiodes.push({ mesh: b, phase: i * 0.9 });
      animated.streamPackets.push({
        mesh: pulse,
        kind: 'torrent',
        minX: center.x - gapW / 2 + 0.3,
        maxX: center.x + gapW / 2 - 0.3,
        speed: 4.5 + (Math.abs(i) % 3) * 1.2,
      });
    }
  }

  // ==================== 5. DEEP PROTOCOL LAYERS BELOW ====================
  const protoColor = new THREE.Color(map.theme.protocolHex);
  const layers = [
    { y: -4.2, size: 120, opacity: 0.42, speed: 0.015 },
    { y: -9.8, size: 160, opacity: 0.28, speed: -0.01 },
    { y: -16.5, size: 220, opacity: 0.18, speed: 0.008 },
  ];
  for (const l of layers) {
    const texClone = textures.protocolMap.clone();
    texClone.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map: texClone,
      color: protoColor,
      transparent: true,
      opacity: l.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(l.size, l.size), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = l.y;
    group.add(plane);
    animated.protocolPlanes.push({ tex: texClone, speed: l.speed });
  }

  // ==================== 6. DISTANT AUTONOMOUS SYSTEM CLUSTERS & LIVE DATA ARCS ====================
  buildDistantCyberspace(group, map, textures, animated);

  return { group, pickables, nodeVisuals, animated };
}

function buildObstacleProp(group, map, x, y, subtype, pos, rackMat, rackTopMat, hazardMat, trimMat, chassisMat, animated) {
  // Hash for varied architectural heights without external randomness
  const hHash = ((x * 73 + y * 137 + 19) % 100) / 100;

  if (subtype === 'torrent' || subtype === 'airgap') {
    // Open chasm — no solid block!
    return;
  }

  if (map.id === 'intranet') {
    // Corporate Enterprise Server Rack Monoliths
    const isOuter = x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
    const height = isOuter ? 1.2 + hHash * 1.4 : 0.95 + hHash * 0.9;
    const w = TILE_SIZE - 0.32;
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, w),
      [rackMat, rackMat, rackTopMat, rackTopMat, rackMat, rackMat]
    );
    rack.position.set(pos.x, height / 2 - 0.25, pos.z);
    rack.castShadow = true;
    rack.receiveShadow = true;
    group.add(rack);

    if (hHash > 0.55) {
      const capStrip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.06, 0.14), trimMat);
      capStrip.position.set(pos.x, height - 0.22, pos.z);
      group.add(capStrip);
    }
  } else if (map.id === 'backbone') {
    // Backbone Fiber Relay Pylons & Substation Blocks (clean angular industrial towers, no competing node rings!)
    const h = 0.8 + hHash * 1.15;
    const base = new THREE.Mesh(new RoundedBoxGeometry(TILE_SIZE - 0.26, h, TILE_SIZE - 0.26, 2, 0.05), chassisMat);
    base.position.set(pos.x, h / 2 - 0.25, pos.z);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    if (hHash > 0.48) {
      const relay = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.52, 0.68, 2, 0.04), rackTopMat);
      relay.position.set(pos.x, h + 0.0, pos.z);
      relay.castShadow = true;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.56), rackMat);
      fin.position.set(pos.x, h + 0.32, pos.z);
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.06, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x22b8c9 })
      );
      led.position.set(pos.x, h + 0.22, pos.z + 0.32);
      group.add(relay, fin, led);
    }
  } else {
    // Industrial Control Switchgear Cabinets (Map 3)
    const h = 0.95 + hHash * 1.05;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE - 0.28, h, TILE_SIZE - 0.28),
      [hazardMat, hazardMat, rackTopMat, rackTopMat, hazardMat, hazardMat]
    );
    cab.position.set(pos.x, h / 2 - 0.25, pos.z);
    cab.castShadow = true;
    cab.receiveShadow = true;
    group.add(cab);

    if (hHash > 0.62) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8), chassisMat);
      vent.position.set(pos.x, h - 0.02, pos.z);
      group.add(vent);
    }
  }
}

function buildSwitchNodeHardware(group, pos, pal) {
  const container = new THREE.Group();
  container.position.set(pos.x, 0.04, pos.z);
  group.add(container);

  // Octagonal raised switch collar
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.92, 0.12, 8), pal.friendlyDark);
  housing.position.y = 0.06;
  housing.receiveShadow = true;
  container.add(housing);

  // Dynamic Status Ring (changes color: emerald pass-through / amber isolated / steel-blue cooldown)
  const statusMat = new THREE.MeshStandardMaterial({
    color: 0x26f5b0,
    emissive: 0x16d992,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.055, 8, 8), statusMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  container.add(ring);

  // Rotating inner data core ring (spins when pass-through, stops when isolated)
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 16), statusMat);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.15;
  container.add(innerRing);

  // 4 Retractable holographic isolation barrier blades (raise up when isolated!)
  const bars = new THREE.Group();
  const barMat = new THREE.MeshBasicMaterial({
    color: 0xffa826,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.06), barMat);
    bar.position.set(Math.sin(a) * 0.86, 0.28, Math.cos(a) * 0.86);
    bar.rotation.y = a;
    bars.add(bar);
  }
  bars.visible = false;
  container.add(bars);

  // Cooldown radial arc indicator (shown during 6s bypass cooldown)
  const coolMat = new THREE.MeshBasicMaterial({
    color: 0x5ca8ff,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const coolRing = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.72, 24), coolMat);
  coolRing.rotation.x = -Math.PI / 2;
  coolRing.position.y = 0.18;
  coolRing.visible = false;
  container.add(coolRing);

  return { container, ring, innerRing, bars, coolRing, statusMat };
}

function buildEntryPortal(group, pos, entryId, animated) {
  const cInfo = ENTRY_COLORS[entryId] || ENTRY_COLORS.A;
  const col = new THREE.Color(cInfo.hex);
  const glowMat = new THREE.MeshStandardMaterial({
    color: col,
    emissive: col,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x162738, metalness: 0.8, roughness: 0.3 });

  const portal = new THREE.Group();
  portal.position.set(pos.x, 0, pos.z);
  group.add(portal);

  // Twin gateway pillars + overhead crossbar
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new RoundedBoxGeometry(0.24, 1.85, 0.34, 2, 0.04), frameMat);
    pil.position.set(s * 0.78, 0.92, 0);
    pil.castShadow = true;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 0.38), glowMat);
    strip.position.set(s * 0.78, 0.92, 0);
    portal.add(pil, strip);
  }
  const arch = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.24, 0.38, 2, 0.04), frameMat);
  arch.position.set(0, 1.82, 0);
  portal.add(arch);

  // Spinning holographic entry ring
  const vortex = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 20), glowMat);
  vortex.position.set(0, 0.95, 0);
  portal.add(vortex);
  animated.spinners.push({ mesh: vortex, axis: 'z', speed: 2.0 });

  // Ground entry pad glow ring
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.78, 20),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.04;
  portal.add(pad);
}

function buildExitCoreVault(group, pos, exitId, animated) {
  const vault = new THREE.Group();
  vault.position.set(pos.x, 0, pos.z);
  group.add(vault);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a3044, metalness: 0.8, roughness: 0.28 });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x3effb4,
    emissive: 0x1be692,
    emissiveIntensity: 1.75,
    roughness: 0.15,
  });
  animated.coreMats.push(coreMat);

  // Grand tiered octagonal plinth
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.05, 0.35, 8), frameMat);
  base.position.y = 0.18;
  base.castShadow = true;
  vault.add(base);

  // 4 Outer Containment Fins
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const fin = new THREE.Mesh(new RoundedBoxGeometry(0.22, 1.7, 0.36, 2, 0.03), frameMat);
    fin.position.set(Math.cos(a) * 0.82, 0.95, Math.sin(a) * 0.82);
    fin.rotation.y = -a;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.12), coreMat);
    led.position.x = -0.1;
    fin.add(led);
    vault.add(fin);
  }

  // Levitating Crystalline Core Heart
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), coreMat);
  crystal.position.y = 1.48;
  vault.add(crystal);
  animated.spinners.push({ mesh: crystal, axis: 'y', speed: 1.8 });

  // Dual Counter-Rotating Gyroscopic Core Rings
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 8, 28), coreMat);
  ring1.position.y = 1.48;
  ring1.rotation.x = Math.PI / 3;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.04, 8, 28), new THREE.MeshBasicMaterial({ color: 0x35e8ff }));
  ring2.position.y = 1.48;
  ring2.rotation.x = -Math.PI / 3;
  vault.add(ring1, ring2);
  animated.coreRings.push(ring1, ring2);
}

function buildDistantCyberspace(group, map, textures, animated) {
  const clusterMat = new THREE.MeshStandardMaterial({
    map: textures.rackMap,
    color: 0x5c8ab5,
    roughness: 0.6,
    metalness: 0.65,
  });
  const islandBaseMat = new THREE.MeshStandardMaterial({
    color: 0x091320,
    roughness: 0.7,
    metalness: 0.6,
  });
  const accent = new THREE.Color(map.theme.accentHex);

  // 12 Distant Autonomous System Network Clusters framing the horizon (clearly visible around the floating arena!)
  const clusterPositions = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + 0.22;
    const radiusX = 24.5 + (i % 3) * 6.5;
    const radiusZ = 18.5 + (i % 3) * 5.2;
    const cx = Math.cos(angle) * radiusX;
    const cz = Math.sin(angle) * radiusZ;
    // Keep front-center clear so camera never gets obstructed
    if (cz > 14 && Math.abs(cx) < 16) continue;
    const cy = -3.6 + ((i * 7) % 5) * 0.9;
    clusterPositions.push(new THREE.Vector3(cx, cy + 2.2, cz));

    const island = new THREE.Group();
    island.position.set(cx, cy, cz);

    // Floating hexagonal server island disk
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 2.7, 0.7, 6), islandBaseMat);
    island.add(slab);

    // Ring halo around distant cluster
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(4.05, 0.07, 6, 6),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.42 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.2;
    island.add(halo);

    // 5 Server Monolith Towers on each distant cluster
    for (let t = 0; t < 5; t++) {
      const ta = (t / 5) * Math.PI * 2 + i;
      const tr = t === 0 ? 0 : 1.75;
      const th = 2.6 + ((i * 13 + t * 17) % 6);
      const tw = t === 0 ? 1.5 : 0.95;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, tw), clusterMat);
      tower.position.set(Math.cos(ta) * tr, th / 2 + 0.3, Math.sin(ta) * tr);
      island.add(tower);
    }

    group.add(island);
  }

  // Sweeping Inter-AS Fiber Data Streams connecting distant clusters & linking into the arena!
  const pktGeo = new THREE.BoxGeometry(0.75, 0.16, 0.16);
  for (let i = 0; i < clusterPositions.length; i++) {
    const p0 = clusterPositions[i];
    const p2 = clusterPositions[(i + 2) % clusterPositions.length];
    const mid = p0.clone().add(p2).multiplyScalar(0.5);
    mid.y += 3.8 + (i % 3) * 2.0;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const pts = curve.getPoints(28);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({
      color: i % 2 === 0 ? accent : 0x3b8dff,
      transparent: true,
      opacity: 0.34,
    });
    group.add(new THREE.Line(lineGeo, lineMat));

    // Animated glowing light packets streaking along each inter-AS fiber arc
    for (let k = 0; k < 2; k++) {
      const pMesh = new THREE.Mesh(
        pktGeo,
        new THREE.MeshBasicMaterial({ color: k === 0 ? 0x52f2ff : 0xffc652 })
      );
      group.add(pMesh);
      animated.streamPackets.push({
        mesh: pMesh,
        kind: 'arc',
        curve,
        t: (i * 0.17 + k * 0.5) % 1,
        speed: 0.1 + (i % 3) * 0.03,
      });
    }
  }

  // Direct Ingress Fiber Trunk Conduits connecting distant AS clusters INTO our Entry Portals (A, B, C)!
  for (let eIdx = 0; eIdx < map.entries.length; eIdx++) {
    const entry = map.entries[eIdx];
    const targetPos = gridToWorld(map, entry.x, entry.y, 1.0);
    // Pick nearest northern distant cluster
    let bestCluster = clusterPositions[0];
    let bestD = Infinity;
    for (const cp of clusterPositions) {
      if (cp.z > -4) continue;
      const d = cp.distanceTo(targetPos);
      if (d < bestD) {
        bestD = d;
        bestCluster = cp;
      }
    }
    if (!bestCluster) continue;
    const mid = bestCluster.clone().add(targetPos).multiplyScalar(0.5);
    mid.y += 4.2;
    const curve = new THREE.QuadraticBezierCurve3(bestCluster, mid, targetPos);
    const eCol = new THREE.Color((ENTRY_COLORS[entry.id] || ENTRY_COLORS.A).hex);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(26)),
      new THREE.LineBasicMaterial({ color: eCol, transparent: true, opacity: 0.46 })
    );
    group.add(line);
    for (let k = 0; k < 2; k++) {
      const pm = new THREE.Mesh(pktGeo, new THREE.MeshBasicMaterial({ color: eCol }));
      group.add(pm);
      animated.streamPackets.push({
        mesh: pm,
        kind: 'arc',
        curve,
        t: (eIdx * 0.31 + k * 0.5) % 1,
        speed: 0.16,
      });
    }
  }
}

export function updateEnvironmentAnimation(env, engine, simTime, dt) {
  if (!env) return;

  for (const s of env.animated.spinners) {
    s.mesh.rotation[s.axis] += s.speed * dt;
  }
  for (let i = 0; i < env.animated.coreRings.length; i++) {
    const r = env.animated.coreRings[i];
    r.rotation.z += (i % 2 === 0 ? 1.5 : -1.9) * dt;
    r.rotation.y += (i % 2 === 0 ? 0.8 : -0.6) * dt;
  }

  // Reactive Exit Core Vault Integrity Glow (Emerald -> Warning Amber -> Critical Pulsing Crimson!)
  if (engine && env.animated.coreMats?.length > 0) {
    const ratio = engine.integrity / Math.max(1, engine.maxIntegrity);
    const pulse = 0.5 + 0.5 * Math.sin(simTime * 7.5);
    for (const cm of env.animated.coreMats) {
      if (ratio <= 0.3) {
        cm.color.setHex(0xff3858);
        cm.emissive.setHex(0xff1838);
        cm.emissiveIntensity = 1.4 + pulse * 0.9;
      } else if (ratio <= 0.55) {
        cm.color.setHex(0xffc038);
        cm.emissive.setHex(0xe68800);
        cm.emissiveIntensity = 1.4 + pulse * 0.45;
      } else {
        cm.color.setHex(0x3effb4);
        cm.emissive.setHex(0x1be692);
        cm.emissiveIntensity = 1.65;
      }
    }
  }
  for (const tp of env.animated.torrentPlanes) {
    tp.tex.offset.x = (tp.tex.offset.x - tp.speed * dt) % 1;
  }
  for (const pp of env.animated.protocolPlanes) {
    pp.tex.offset.y = (pp.tex.offset.y + pp.speed * dt) % 1;
  }
  for (const ld of env.animated.laserDiodes) {
    ld.mesh.material.opacity = 0.22 + 0.26 * (0.5 + 0.5 * Math.sin(simTime * 3.5 + ld.phase));
  }
  for (const pkt of env.animated.streamPackets) {
    if (pkt.kind === 'torrent') {
      pkt.mesh.position.x += pkt.speed * dt;
      if (pkt.mesh.position.x > pkt.maxX) pkt.mesh.position.x = pkt.minX;
    } else if (pkt.kind === 'arc') {
      pkt.t = (pkt.t + pkt.speed * dt) % 1;
      const pos = pkt.curve.getPointAt(pkt.t);
      const nextPos = pkt.curve.getPointAt(Math.min(0.999, pkt.t + 0.01));
      pkt.mesh.position.copy(pos);
      pkt.mesh.lookAt(nextPos);
    }
  }

  // Update Switch Node visual states (Pass-through vs Isolated vs Re-isolation Cooldown)
  if (engine && env.nodeVisuals) {
    for (const [key, vis] of env.nodeVisuals.entries()) {
      const isolated = engine.isolatedNodes.has(key);
      const cd = engine.nodeCooldowns.get(key) || 0;

      if (isolated) {
        vis.statusMat.color.setHex(0xffaa2b);
        vis.statusMat.emissive.setHex(0xff7700);
        vis.bars.visible = true;
        vis.bars.position.y = Math.sin(simTime * 4) * 0.03;
        vis.coolRing.visible = false;
      } else if (cd > 0.05) {
        vis.statusMat.color.setHex(0x63a6ff);
        vis.statusMat.emissive.setHex(0x2864c7);
        vis.bars.visible = false;
        vis.coolRing.visible = true;
        const frac = Math.max(0.04, Math.min(1, cd / 6.0));
        const bucket = Math.round(frac * 24);
        if (vis.lastCoolBucket !== bucket) {
          vis.lastCoolBucket = bucket;
          vis.coolRing.geometry.dispose();
          vis.coolRing.geometry = new THREE.RingGeometry(0.56, 0.75, 24, 1, 0, Math.PI * 2 * (bucket / 24));
        }
        vis.innerRing.rotation.z += dt * 1.2;
      } else {
        vis.statusMat.color.setHex(0x28f2b2);
        vis.statusMat.emissive.setHex(0x14d492);
        vis.bars.visible = false;
        vis.coolRing.visible = false;
        vis.innerRing.rotation.z += dt * 2.4;
      }
    }
  }
}
