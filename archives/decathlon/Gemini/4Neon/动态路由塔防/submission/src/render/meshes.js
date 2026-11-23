import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared high-craft PBR material factory (porcelain-titanium friendlies vs obsidian-crimson enemies)
export function createMaterialPalette() {
  return {
    // Friendly hardware materials (satin porcelain-titanium so fine bevels stay razor-sharp under HDR bloom!)
    friendlyWhite: new THREE.MeshStandardMaterial({
      color: 0xb4cde2,
      roughness: 0.42,
      metalness: 0.32,
    }),
    friendlySteel: new THREE.MeshStandardMaterial({
      color: 0x45637d,
      roughness: 0.38,
      metalness: 0.72,
    }),
    friendlyDark: new THREE.MeshStandardMaterial({
      color: 0x1b2d40,
      roughness: 0.48,
      metalness: 0.65,
    }),
    cyanGlow: new THREE.MeshStandardMaterial({
      color: 0x35eeff,
      emissive: 0x16c8f5,
      emissiveIntensity: 1.45,
      roughness: 0.2,
      metalness: 0.1,
    }),
    cyanGlass: new THREE.MeshPhysicalMaterial({
      color: 0x26d8f5,
      emissive: 0x0c7ba8,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.56,
      roughness: 0.12,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    emeraldGlow: new THREE.MeshStandardMaterial({
      color: 0x36ffae,
      emissive: 0x12cf80,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
    goldGlow: new THREE.MeshStandardMaterial({
      color: 0xffc63d,
      emissive: 0xe68a00,
      emissiveIntensity: 1.35,
      roughness: 0.22,
    }),
    amberSteel: new THREE.MeshStandardMaterial({
      color: 0xb87a20,
      roughness: 0.36,
      metalness: 0.72,
    }),
    shieldBubble: new THREE.MeshBasicMaterial({
      color: 0x34f0b2,
      transparent: true,
      opacity: 0.18,
      wireframe: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    shieldWire: new THREE.MeshBasicMaterial({
      color: 0x52ffc4,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
    }),
    encryptChain: new THREE.MeshStandardMaterial({
      color: 0xc84dff,
      emissive: 0xa62eff,
      emissiveIntensity: 1.5,
      wireframe: true,
    }),

    // Enemy hostile materials
    enemyObsidian: new THREE.MeshStandardMaterial({
      color: 0x1a1522,
      roughness: 0.35,
      metalness: 0.78,
    }),
    enemyArmor: new THREE.MeshStandardMaterial({
      color: 0x38202f,
      roughness: 0.38,
      metalness: 0.68,
    }),
    crimsonGlow: new THREE.MeshStandardMaterial({
      color: 0xff3656,
      emissive: 0xeb1438,
      emissiveIntensity: 1.55,
      roughness: 0.2,
    }),
    orangeGlow: new THREE.MeshStandardMaterial({
      color: 0xff7c24,
      emissive: 0xe64d00,
      emissiveIntensity: 1.5,
      roughness: 0.22,
    }),
    violetGlow: new THREE.MeshStandardMaterial({
      color: 0xd04dff,
      emissive: 0xa81cf0,
      emissiveIntensity: 1.55,
      roughness: 0.2,
    }),
    benignPacket: new THREE.MeshStandardMaterial({
      color: 0x7cb8e8,
      emissive: 0x164d7d,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.25,
    }),
    benignStripe: new THREE.MeshStandardMaterial({
      color: 0x42e896,
      emissive: 0x16b064,
      emissiveIntensity: 0.85,
    }),
    enemyShield: new THREE.MeshBasicMaterial({
      color: 0xffc647,
      transparent: true,
      opacity: 0.34,
      wireframe: true,
    }),
  };
}

// Helper to enable shadows cleanly
function shadow(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ============================================================================
// TOWER MESH BUILDERS (Distinct Silhouettes + Lv2 & Branch Visual Evolution!)
// ============================================================================

export function buildTowerRig(tower, pal) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const rig = {
    root,
    body,
    type: tower.type,
    level: tower.level,
    branch: tower.branch,
    turret: null,
    recoilPart: null,
    wingParts: [],
    petals: [],
    healCross: null,
    spinParts: [],
    jaws: [],
    orbiters: [],
    shieldMesh: null,
    encryptMesh: null,
    skillAuraMesh: null,
    deployAge: 0,
  };

  if (tower.type === 'firewall') {
    buildFirewallParts(body, rig, tower.level, pal);
  } else if (tower.type === 'honeypot') {
    buildHoneypotParts(body, rig, tower.level, tower.branch, pal);
  } else if (tower.type === 'airgap') {
    buildAirgapParts(body, rig, tower.level, pal);
  } else if (tower.type === 'interceptor') {
    buildInterceptorParts(body, rig, tower.level, tower.branch, tower.dir, pal);
  } else if (tower.type === 'sandbox') {
    buildSandboxParts(body, rig, tower.level, pal);
  } else if (tower.type === 'repair') {
    buildRepairParts(body, rig, tower.level, pal);
  }

  // Common Shield Overlay Dome (toggled when tower.shield > 0)
  const shGroup = new THREE.Group();
  const shSphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 1), pal.shieldBubble);
  const shWire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.94, 1), pal.shieldWire);
  shSphere.position.y = 0.65;
  shWire.position.y = 0.65;
  shGroup.add(shSphere, shWire);
  shGroup.visible = false;
  root.add(shGroup);
  rig.shieldMesh = shGroup;

  // Common Encryption Lock Cage (toggled when tower.encryptedTimer > 0)
  const encGroup = new THREE.Group();
  const encBox = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), pal.encryptChain);
  encBox.position.y = 0.72;
  const encRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.045, 8, 24), pal.violetGlow);
  encRing1.position.y = 0.72;
  encRing1.rotation.x = Math.PI / 3;
  const encRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.045, 8, 24), pal.violetGlow);
  encRing2.position.y = 0.72;
  encRing2.rotation.y = Math.PI / 3;
  encRing2.rotation.x = -Math.PI / 3;
  encGroup.add(encBox, encRing1, encRing2);
  encGroup.visible = false;
  root.add(encGroup);
  rig.encryptMesh = encGroup;

  // Common Active Skill Aura Ring (pulses brightly while tower.skillActiveTimer > 0!)
  const auraColor = tower.type === 'honeypot' || tower.type === 'airgap' ? 0xffc63d : tower.type === 'repair' ? 0x36ffaa : 0x38f2ff;
  const auraRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.88, 0.055, 8, 28),
    new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  );
  auraRing.rotation.x = Math.PI / 2;
  auraRing.position.y = 0.25;
  auraRing.visible = false;
  root.add(auraRing);
  rig.skillAuraMesh = auraRing;

  return rig;
}

function buildFirewallParts(body, rig, level, pal) {
  // Heavy hexagonal armored bastion
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.86, 0.28, 6), pal.friendlyDark));
  base.position.y = 0.14;
  body.add(base);

  const core = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.72, 0.64, 3, 0.07), pal.friendlyWhite));
  core.position.y = 0.56;
  body.add(core);

  // Glowing front pulse grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.68), pal.cyanGlow);
  grille.position.y = 0.58;
  body.add(grille);

  // Articulated turret/shield assembly
  const turret = new THREE.Group();
  turret.position.y = 0.6;
  body.add(turret);
  rig.turret = turret;

  const shieldAnchor = new THREE.Group();
  turret.add(shieldAnchor);
  rig.recoilPart = shieldAnchor;

  // Dual angled holographic energy shield wings + porcelain frames
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.56, 0.08, 0.36);
    wing.rotation.y = -side * 0.38;

    const frame = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.88, 0.08, 2, 0.02), pal.friendlySteel));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.76, 0.11), pal.cyanGlass);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.84, 0.12), pal.cyanGlow);
    edge.position.x = side * 0.25;
    wing.add(frame, glass, edge);
    shieldAnchor.add(wing);
    rig.wingParts.push({ mesh: wing, side, baseRotY: -side * 0.38, baseX: side * 0.56 });
  }

  // Top pulse beacon
  const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.22, 6), pal.friendlySteel));
  cap.position.y = 0.48;
  turret.add(cap);

  if (level >= 2) {
    // Lv2: Heavy twin shoulder plasma pylons + elevated glowing shield halo!
    for (const side of [-1, 1]) {
      const pylon = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.96, 0.28, 2, 0.04), pal.friendlyWhite));
      pylon.position.set(side * 0.62, 0.32, -0.18);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), pal.cyanGlow);
      tip.position.y = 0.54;
      pylon.add(tip);
      turret.add(pylon);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 6), pal.cyanGlow);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.78;
    turret.add(halo);
    rig.spinParts.push({ mesh: halo, axis: 'z', speed: 1.8 });
  }
}

function buildHoneypotParts(body, rig, level, branch, pal) {
  // Sleek warm-gold ceramic decoy spire
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.24, 8), pal.friendlyDark));
  base.position.y = 0.12;
  body.add(base);

  const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 0.68, 8), pal.friendlyWhite));
  stem.position.y = 0.54;
  body.add(stem);

  // Floating rotating golden lure prism
  const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), pal.goldGlow);
  prism.position.y = 1.25;
  body.add(prism);
  rig.spinParts.push({ mesh: prism, axis: 'y', speed: 2.2, bobAmp: 0.08, baseY: 1.25 });

  // Outer lure beacon ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.045, 8, 24), pal.goldGlow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.95;
  body.add(ring);
  rig.spinParts.push({ mesh: ring, axis: 'z', speed: -1.6 });

  if (level >= 2 && branch === 'decoy') {
    // Branch A (镜像诱饵): Twin orbiting holographic mirror shields!
    const orbitGroup = new THREE.Group();
    orbitGroup.position.y = 0.92;
    body.add(orbitGroup);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.06), pal.cyanGlass);
      mirror.position.set(Math.cos(a) * 0.76, 0, Math.sin(a) * 0.76);
      mirror.rotation.y = -a + Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.08), pal.goldGlow);
      rim.position.y = 0.31;
      mirror.add(rim);
      orbitGroup.add(mirror);
    }
    rig.spinParts.push({ mesh: orbitGroup, axis: 'y', speed: 2.4 });
  } else if (level >= 2 && branch === 'trap') {
    // Branch B (反制陷阱): Four jagged amber high-voltage Tesla prongs!
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const prong = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 4), pal.amberSteel));
      prong.position.set(Math.cos(a) * 0.56, 0.72, Math.sin(a) * 0.56);
      prong.rotation.z = -Math.cos(a) * 0.45;
      prong.rotation.x = Math.sin(a) * 0.45;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pal.orangeGlow);
      tip.position.y = 0.42;
      prong.add(tip);
      body.add(prong);
    }
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 16), pal.orangeGlow);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = 0.65;
    body.add(coil);
    rig.spinParts.push({ mesh: coil, axis: 'z', speed: 3.5 });
  }
}

function buildAirgapParts(body, rig, level, pal) {
  // Heavy octagonal industrial isolation lock seated squarely on a Switch Node
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.92, 0.24, 8), pal.friendlyDark));
  base.position.y = 0.12;
  body.add(base);

  // Central glowing optical air-gap diode core
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.05, 12), pal.goldGlow);
  beam.position.y = 0.62;
  body.add(beam);

  // Twin heavy mechanical blast jaws that physically clamp shut
  for (const side of [-1, 1]) {
    const jaw = new THREE.Group();
    jaw.position.set(side * 0.46, 0.58, 0);

    const block = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.78, 0.86, 3, 0.06), pal.friendlyWhite));
    const bumper = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.64, 0.72, 2, 0.03), pal.amberSteel));
    bumper.position.x = -side * 0.22;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.88), pal.goldGlow);
    stripe.position.y = 0.26;
    jaw.add(block, bumper, stripe);

    body.add(jaw);
    rig.jaws.push({ mesh: jaw, side, baseX: side * 0.46 });
  }

  // Top status strobe
  const strobe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.14, 8), pal.goldGlow);
  strobe.position.y = 1.18;
  body.add(strobe);

  if (level >= 2) {
    // Lv2 (双物理隔断): Massive overhead armored bridge arch + corner buttress shields!
    const arch = shadow(new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.22, 0.56, 3, 0.05), pal.friendlySteel));
    arch.position.y = 1.16;
    body.add(arch);
    for (const side of [-1, 1]) {
      const guard = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.24, 1.02, 1.06, 2, 0.04), pal.friendlyDark));
      guard.position.set(side * 0.74, 0.62, 0);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.14), pal.cyanGlow);
      glow.position.x = side * 0.12;
      guard.add(glow);
      body.add(guard);
    }
  }
}

function buildInterceptorParts(body, rig, level, branch, dir, pal) {
  // Precision rotating rail turret with unmistakable directional pedestal indicator!
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.26, 12), pal.friendlyDark));
  base.position.y = 0.13;
  body.add(base);

  // Built-in directional chevron plate on base so facing direction is ALWAYS crystal clear!
  const dirAngles = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };
  const dirRing = new THREE.Group();
  dirRing.rotation.y = dirAngles[dir] || 0;
  const chev = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.46, 3), pal.cyanGlow);
  chev.rotation.x = Math.PI / 2;
  chev.position.set(0, 0.28, 0.68);
  dirRing.add(chev);
  body.add(dirRing);

  // Rotating turret assembly
  const turret = new THREE.Group();
  turret.position.y = 0.55;
  turret.rotation.y = dirAngles[dir] || 0;
  body.add(turret);
  rig.turret = turret;

  const hull = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.44, 0.76, 3, 0.06), pal.friendlyWhite));
  turret.add(hull);

  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.14), pal.cyanGlow);
  sensor.position.set(0, 0.14, 0.36);
  turret.add(sensor);

  // Recoil barrel assembly
  const barrels = new THREE.Group();
  turret.add(barrels);
  rig.recoilPart = barrels;

  if (level >= 2 && branch === 'pierce') {
    // Branch A (磁轨贯穿): Long twin electromagnetic railgun barrels + side cyan capacitor fins!
    for (const side of [-1, 1]) {
      const rail = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.18, 1.48, 2, 0.03), pal.friendlySteel));
      rail.position.set(side * 0.2, 0.02, 0.62);
      const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 1.25), pal.cyanGlow);
      glowStrip.position.set(side * 0.07, 0.02, 0.64);
      const fin = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.44), pal.friendlyWhite));
      fin.position.set(side * 0.42, 0.08, -0.05);
      barrels.add(rail, glowStrip);
      turret.add(fin);
    }
    const coreBeam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.2), pal.cyanGlow);
    coreBeam.position.set(0, 0.02, 0.56);
    barrels.add(coreBeam);
  } else if (level >= 2 && branch === 'suppress') {
    // Branch B (频率压制): Triple rotary pulse barrels + spinning radar dish halo!
    const cluster = new THREE.Group();
    cluster.position.set(0, 0.02, 0.55);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const b = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.92, 8), pal.friendlySteel));
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.1);
      cluster.add(b);
    }
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16), pal.goldGlow);
    muzzleRing.position.z = 0.48;
    cluster.add(muzzleRing);
    barrels.add(cluster);
    rig.spinParts.push({ mesh: cluster, axis: 'z', speed: 4.5 });

    const dish = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 18), pal.cyanGlow);
    dish.position.set(0, 0.42, -0.15);
    turret.add(dish);
    rig.spinParts.push({ mesh: dish, axis: 'y', speed: 3.2 });
  } else {
    // Lv1 Standard twin pulse barrel
    for (const side of [-1, 1]) {
      const b = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.96, 8), pal.friendlySteel));
      b.rotation.x = Math.PI / 2;
      b.position.set(side * 0.16, 0.02, 0.52);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 8), pal.cyanGlow);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(side * 0.16, 0.02, 0.98);
      barrels.add(b, tip);
    }
  }
}

function buildSandboxParts(body, rig, level, pal) {
  // High-tech scanner dish & hovering containment crystal
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.24, 8), pal.friendlyDark));
  base.position.y = 0.12;
  body.add(base);

  // 4 angled scanner emitter petals (flare open mechanically on AoE scan pulse!)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const petal = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.56, 0.34, 2, 0.03), pal.friendlyWhite));
    petal.position.set(Math.cos(a) * 0.48, 0.48, Math.sin(a) * 0.48);
    petal.rotation.y = -a;
    petal.rotation.z = -0.35;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.1), pal.cyanGlow);
    led.position.x = -0.1;
    petal.add(led);
    body.add(petal);
    rig.petals.push({ mesh: petal, angle: a, baseR: 0.48, baseRotZ: -0.35 });
  }

  // Hovering scanning crystal core
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), pal.cyanGlow);
  core.position.y = 1.12;
  body.add(core);
  rig.spinParts.push({ mesh: core, axis: 'y', speed: 2.0, bobAmp: 0.09, baseY: 1.12 });

  // Rotating horizontal radar ring
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.038, 8, 24), pal.cyanGlow);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 1.05;
  body.add(ring1);
  rig.spinParts.push({ mesh: ring1, axis: 'z', speed: 2.5 });

  if (level >= 2) {
    // Lv2 (深度行为分析阵列): Dual tilted gyroscope rings + top holo prism!
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.038, 8, 24), pal.emeraldGlow);
    ring2.position.y = 1.12;
    ring2.rotation.x = Math.PI / 3;
    body.add(ring2);
    rig.spinParts.push({ mesh: ring2, axis: 'y', speed: -2.8 });

    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.038, 8, 24), pal.cyanGlow);
    ring3.position.y = 1.12;
    ring3.rotation.x = -Math.PI / 3;
    body.add(ring3);
    rig.spinParts.push({ mesh: ring3, axis: 'x', speed: 2.4 });
  }
}

function buildRepairParts(body, rig, level, pal) {
  // Clean porcelain-white & emerald medical-cyber nanite tower
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.76, 0.24, 12), pal.friendlyWhite));
  base.position.y = 0.12;
  body.add(base);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 8, 20), pal.emeraldGlow);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.26;
  body.add(collar);

  const pillar = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.78, 8), pal.friendlySteel));
  pillar.position.y = 0.62;
  body.add(pillar);

  // Floating emerald cross / helix projector at top
  const emitter = new THREE.Group();
  emitter.position.y = 1.28;
  const bar1 = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.18, 0.18, 2, 0.03), pal.emeraldGlow);
  const bar2 = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.56, 0.18, 2, 0.03), pal.emeraldGlow);
  emitter.add(bar1, bar2);
  body.add(emitter);
  rig.healCross = emitter;
  rig.spinParts.push({ mesh: emitter, axis: 'y', speed: 2.2, bobAmp: 0.08, baseY: 1.28 });

  if (level >= 2) {
    // Lv2 (热备集群内核): Twin autonomous orbiting repair micro-drones!
    const orbit = new THREE.Group();
    orbit.position.y = 1.18;
    body.add(orbit);
    for (const side of [-1, 1]) {
      const drone = new THREE.Group();
      drone.position.set(side * 0.76, 0, 0);
      const dBody = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), pal.friendlyWhite));
      const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 14), pal.emeraldGlow);
      dRing.rotation.x = Math.PI / 2;
      drone.add(dBody, dRing);
      orbit.add(drone);
    }
    rig.spinParts.push({ mesh: orbit, axis: 'y', speed: 2.8 });
  }
}

// ============================================================================
// EMERGENCY ISOLATOR 3D MESH (Dropped Item on Switch Nodes)
// ============================================================================

export function buildIsolatorRig(pal) {
  const root = new THREE.Group();
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.22, 6), pal.friendlyDark));
  base.position.y = 0.11;
  root.add(base);

  const clampRing = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.07, 8, 6), pal.orangeGlow);
  clampRing.rotation.x = Math.PI / 2;
  clampRing.position.y = 0.34;
  root.add(clampRing);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.62, 6), pal.goldGlow);
  core.position.y = 0.44;
  root.add(core);

  const holoRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 20), pal.cyanGlow);
  holoRing.rotation.x = Math.PI / 2;
  holoRing.position.y = 0.85;
  root.add(holoRing);

  return { root, clampRing, holoRing, core };
}

// ============================================================================
// ENEMY & BOSS MESH BUILDERS (Articulated Multi-Part Silhouettes!)
// ============================================================================

export function buildEnemyRig(enemy, pal) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const rig = {
    root,
    body,
    type: enemy.type,
    segments: [],
    mandibles: [],
    spinParts: [],
    wings: [],
    disguisedGroup: null,
    revealedGroup: null,
    shellPlates: [],
    revealProgress: enemy.disguised ? 0 : 1,
    phase2Parts: null,
    phase3Parts: null,
    shieldMesh: null,
    entrapMesh: null,
    slowMesh: null,
    vulnMesh: null,
    wifiWaveMesh: null,
    stealthMats: [],
    ramPart: null,
    ramBaseZ: 0.56,
    shackle: null,
    spiderBlades: [],
    lastPhase: enemy.bossPhase || 1,
    phaseAnim: 0,
  };

  if (enemy.type === 'worm') {
    buildWormParts(body, rig, enemy.isClone, pal);
  } else if (enemy.type === 'flood') {
    buildFloodParts(body, rig, pal);
  } else if (enemy.type === 'trojan') {
    buildTrojanParts(body, rig, pal);
  } else if (enemy.type === 'ransom') {
    buildRansomParts(body, rig, pal);
  } else if (enemy.type === 'hotspot') {
    buildHotspotParts(body, rig, pal);
  } else if (enemy.type === 'packager') {
    buildPackagerParts(body, rig, pal);
  } else if (enemy.type === 'boss_wankui') {
    buildBossWankuiParts(body, rig, pal);
  } else if (enemy.type === 'boss_shenlou') {
    buildBossShenlouParts(body, rig, pal);
  } else if (enemy.type === 'boss_zheying') {
    buildBossZheyingParts(body, rig, pal);
  }

  // Enemy Shield Overlay (from Packager)
  const shRadius = enemy.isBoss ? 1.45 : 0.72;
  const shMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(shRadius, 1), pal.enemyShield);
  shMesh.position.y = enemy.isBoss ? 1.0 : 0.55;
  shMesh.visible = false;
  root.add(shMesh);
  rig.shieldMesh = shMesh;

  // Entrapped Golden Snare Cage (Honeypot skill)
  const entrapMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.68, 1.1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc83b, wireframe: true, transparent: true, opacity: 0.85 })
  );
  entrapMesh.position.y = 0.58;
  entrapMesh.visible = false;
  root.add(entrapMesh);
  rig.entrapMesh = entrapMesh;

  // Slowed Ground Ripple Ring
  const slowMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.58, 18),
    new THREE.MeshBasicMaterial({ color: 0xffb830, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  slowMesh.rotation.x = -Math.PI / 2;
  slowMesh.position.y = 0.08;
  slowMesh.visible = false;
  root.add(slowMesh);
  rig.slowMesh = slowMesh;

  // Vulnerability Analysis Mark Reticle (Sandbox Lv2 / Honeypot Trap / Firewall Lv2)
  const vulnMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.66, 4),
    new THREE.MeshBasicMaterial({ color: 0xff4569, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
  );
  vulnMesh.rotation.x = -Math.PI / 2;
  vulnMesh.position.y = 0.14;
  vulnMesh.visible = false;
  root.add(vulnMesh);
  rig.vulnMesh = vulnMesh;

  return rig;
}

function buildWormParts(body, rig, isClone, pal) {
  const scale = isClone ? 0.84 : 1.0;
  body.scale.setScalar(scale);

  // 4-segment articulated cyber-centipede
  const glowMat = isClone ? pal.orangeGlow : pal.crimsonGlow;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    const r = i === 0 ? 0.3 : 0.25 - i * 0.03;
    const shell = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(r, 1), pal.enemyObsidian));
    shell.scale.set(1.0, 0.85, 1.2);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(r * 0.65, r * 0.7, r * 1.1), glowMat);
    spine.position.y = r * 0.42;
    seg.add(shell, spine);

    // Head twin articulated snapping mandibles
    if (i === 0) {
      for (const s of [-1, 1]) {
        const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.36, 4), glowMat);
        jaw.rotation.x = Math.PI / 2;
        jaw.rotation.z = -s * 0.25;
        jaw.position.set(s * 0.16, 0, 0.34);
        seg.add(jaw);
        rig.mandibles.push({ mesh: jaw, side: s });
      }
    }
    seg.position.set(0, 0.32, -i * 0.34 + 0.32);
    body.add(seg);
    rig.segments.push({ mesh: seg, idx: i, baseZ: seg.position.z });
  }
}

function buildFloodParts(body, rig, pal) {
  // Heavy angular obsidian-and-molten-orange battering ram cluster!
  const chassis = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.68, 1.06, 2, 0.06), pal.enemyObsidian));
  chassis.position.y = 0.48;
  body.add(chassis);

  // Hydraulic battering ram prow (lunges forward on smash!)
  const ram = new THREE.Group();
  ram.position.set(0, 0.48, 0.56);
  const wedge = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.52, 4), pal.orangeGlow));
  wedge.rotation.x = Math.PI / 2;
  wedge.rotation.y = Math.PI / 4;
  ram.add(wedge);
  body.add(ram);
  rig.ramPart = ram;

  // Molten vent core
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.52), pal.orangeGlow);
  core.position.y = 0.56;
  body.add(core);

  // 3 aggressive orbiting data-ram shards
  const orbit = new THREE.Group();
  orbit.position.y = 0.62;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const shard = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), pal.crimsonGlow));
    shard.position.set(Math.cos(a) * 0.72, 0.15, Math.sin(a) * 0.72);
    orbit.add(shard);
  }
  body.add(orbit);
  rig.spinParts.push({ mesh: orbit, axis: 'y', speed: 3.4 });
}

function buildTrojanParts(body, rig, pal) {
  // State 1: Disguised benign encapsulated normal data packet with 4 hinged outer shell plates!
  const disguised = new THREE.Group();
  disguised.position.y = 0.48;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const plate = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.58, 0.12, 2, 0.03), pal.benignPacket));
    plate.position.set(Math.sin(a) * 0.28, 0, Math.cos(a) * 0.28);
    plate.rotation.y = a;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.14), pal.benignStripe);
    plate.add(stripe);
    disguised.add(plate);
    rig.shellPlates.push({ mesh: plate, angle: a });
  }
  const topCap = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.1, 0.54, 2, 0.02), pal.benignPacket));
  topCap.position.y = 0.28;
  disguised.add(topCap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 16), pal.benignStripe);
  ring.rotation.x = Math.PI / 2;
  disguised.add(ring);
  body.add(disguised);
  rig.disguisedGroup = disguised;
  rig.spinParts.push({ mesh: ring, axis: 'z', speed: 2.0 });

  // State 2: Cracked-open crimson-violet jagged Trojan spider-payload!
  const revealed = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), pal.crimsonGlow);
  core.position.y = 0.54;
  revealed.add(core);
  rig.spinParts.push({ mesh: core, axis: 'y', speed: 4.0 });

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const blade = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.78, 4), pal.enemyObsidian));
    blade.position.set(Math.cos(a) * 0.42, 0.56, Math.sin(a) * 0.42);
    blade.rotation.z = -Math.cos(a) * 0.75;
    blade.rotation.x = Math.sin(a) * 0.75;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), pal.violetGlow);
    blade.add(edge);
    revealed.add(blade);
    rig.spiderBlades.push({ mesh: blade, angle: a, idx: i });
  }
  revealed.visible = false;
  body.add(revealed);
  rig.revealedGroup = revealed;
}

function buildRansomParts(body, rig, pal) {
  // Tall hovering sinister padlock-obelisk with twin spinning purple cipher rings!
  const lockBody = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.76, 0.48, 3, 0.06), pal.enemyObsidian));
  lockBody.position.y = 0.68;
  body.add(lockBody);

  // Glowing padlock keyhole glyph
  const keyTop = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pal.violetGlow);
  keyTop.position.set(0, 0.76, 0.25);
  const keyBot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), pal.violetGlow);
  keyBot.position.set(0, 0.6, 0.25);
  body.add(keyTop, keyBot);

  // Padlock arch shackle on top (snaps shut on every encryption cast!)
  const shackle = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.065, 8, 16, Math.PI), pal.enemyArmor));
  shackle.position.y = 1.06;
  body.add(shackle);
  rig.shackle = shackle;

  // Twin counter-rotating cipher rings
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.038, 6, 20), pal.violetGlow);
  r1.position.y = 0.74;
  r1.rotation.x = Math.PI / 2.6;
  body.add(r1);
  rig.spinParts.push({ mesh: r1, axis: 'z', speed: 2.8 });

  const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.032, 6, 20), pal.crimsonGlow);
  r2.position.y = 0.74;
  r2.rotation.x = -Math.PI / 2.6;
  body.add(r2);
  rig.spinParts.push({ mesh: r2, axis: 'y', speed: -2.4 });
}

function buildHotspotParts(body, rig, pal) {
  // Sleek elevated wireless Rogue Hotspot drone!
  const hull = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), pal.enemyObsidian));
  hull.scale.set(1.15, 0.55, 1.5);
  body.add(hull);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), pal.violetGlow);
  eye.position.set(0, 0, 0.42);
  body.add(eye);

  // Swept articulated wings
  for (const side of [-1, 1]) {
    const wing = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.06, 0.34), pal.enemyArmor));
    wing.position.set(side * 0.58, 0.04, -0.06);
    wing.rotation.y = -side * 0.32;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.08), pal.violetGlow);
    strip.position.z = 0.14;
    wing.add(strip);
    body.add(wing);
    rig.wings.push({ mesh: wing, side });
  }

  // Twin spinning signal-wave halo rings
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.038, 8, 22), pal.violetGlow);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.24;
  body.add(halo);
  rig.spinParts.push({ mesh: halo, axis: 'z', speed: 4.2 });

  // Ground shadow / drop-beacon indicator + pulsing wireless Wi-Fi emission ring
  const dropRing = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.44, 18),
    new THREE.MeshBasicMaterial({ color: 0xd04dff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.y = -2.45;
  body.add(dropRing);

  const wifiWave = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.54, 24),
    new THREE.MeshBasicMaterial({ color: 0xd04dff, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
  );
  wifiWave.rotation.x = -Math.PI / 2;
  wifiWave.position.y = -0.35;
  body.add(wifiWave);
  rig.wifiWaveMesh = wifiWave;
}

function buildPackagerParts(body, rig, pal) {
  // Armored hexagonal shield-carrier with 4 articulated petal plates + golden core
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), pal.goldGlow);
  core.position.y = 0.62;
  body.add(core);
  rig.spinParts.push({ mesh: core, axis: 'y', speed: 2.5 });

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const petal = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.68, 0.14, 2, 0.03), pal.enemyObsidian));
    petal.position.set(Math.cos(a) * 0.48, 0.6, Math.sin(a) * 0.48);
    petal.rotation.y = -a + Math.PI / 2;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), pal.goldGlow);
    trim.position.y = 0.22;
    petal.add(trim);
    body.add(petal);
    rig.wings.push({ mesh: petal, angle: a, baseR: 0.48, isPetal: true });
  }
}

// ============================================================================
// THREE DISTINCT GRAND BOSS MODELS (With Phase Transformations!)
// ============================================================================

function buildBossWankuiParts(body, rig, pal) {
  // BOSS 1: 万傀 — Colossal Botnet Overlord Citadel with 5 orbiting enslaved drone skulls!
  const hull = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.95, 8), pal.enemyObsidian));
  hull.position.y = 0.72;
  body.add(hull);

  const upperCrown = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.98, 0.62, 6), pal.enemyArmor));
  upperCrown.position.y = 1.42;
  body.add(upperCrown);

  // Heavy forward Flood-Surge hydraulic ram prow
  const prow = new THREE.Group();
  prow.position.set(0, 0.68, 1.12);
  const ramCone = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.85, 4), pal.crimsonGlow));
  ramCone.rotation.x = Math.PI / 2;
  ramCone.rotation.y = Math.PI / 4;
  prow.add(ramCone);
  body.add(prow);
  rig.ramPart = prow;
  rig.ramBaseZ = 1.12;

  // Menacing faceted botnet command core enclosed in jagged dark armored cage & 4 antenna spires!
  const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), pal.crimsonGlow);
  eye.position.y = 1.9;
  const eyeCage = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.56, 0),
    new THREE.MeshBasicMaterial({ color: 0x261420, wireframe: true })
  );
  eyeCage.position.y = 1.9;
  body.add(eye, eyeCage);
  rig.spinParts.push({ mesh: eye, axis: 'y', speed: 2.6, bobAmp: 0.08, baseY: 1.9 });
  rig.spinParts.push({ mesh: eyeCage, axis: 'y', speed: -1.8, bobAmp: 0.08, baseY: 1.9 });

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const spire = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.92, 4), pal.enemyObsidian));
    spire.position.set(Math.cos(a) * 0.72, 1.85, Math.sin(a) * 0.72);
    spire.rotation.z = -Math.cos(a) * 0.25;
    spire.rotation.x = Math.sin(a) * 0.25;
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), pal.crimsonGlow);
    tip.position.y = 0.48;
    spire.add(tip);
    body.add(spire);
  }

  // 5 Orbiting enslaved bot-drones
  const droneOrbit = new THREE.Group();
  droneOrbit.position.y = 1.15;
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    const d = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), pal.orangeGlow));
    d.position.set(Math.cos(a) * 1.48, Math.sin(i * 1.3) * 0.25, Math.sin(a) * 1.48);
    droneOrbit.add(d);
  }
  body.add(droneOrbit);
  rig.spinParts.push({ mesh: droneOrbit, axis: 'y', speed: 2.6 });

  // Phase 2 Overload Rings (revealed when HP < 55%)
  const p2 = new THREE.Group();
  const rA = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.08, 8, 24), pal.crimsonGlow);
  rA.rotation.x = Math.PI / 2;
  rA.position.y = 0.88;
  const rB = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.06, 8, 24), pal.orangeGlow);
  rB.position.y = 1.55;
  rB.rotation.x = Math.PI / 3;
  p2.add(rA, rB);
  p2.visible = false;
  body.add(p2);
  rig.phase2Parts = p2;
  rig.spinParts.push({ mesh: rB, axis: 'y', speed: -3.5 });
}

function buildBossShenlouParts(body, rig, pal) {
  // BOSS 2: 蜃楼 — Ethereal Crystalline Route Mirage Prism-Leviathan!
  const mainPrism = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), pal.enemyObsidian));
  mainPrism.scale.set(0.9, 1.55, 1.1);
  mainPrism.position.y = 1.25;
  body.add(mainPrism);

  const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), pal.violetGlow);
  innerCore.position.y = 1.25;
  body.add(innerCore);
  rig.spinParts.push({ mesh: innerCore, axis: 'y', speed: 3.0 });

  // 4 Articulated sweeping holographic mirage chevron wings
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tier = i < 2 ? 0 : 1;
    const wing = new THREE.Group();
    wing.position.set(side * (0.95 + tier * 0.25), 1.35 - tier * 0.42, -tier * 0.25);
    const blade = shadow(new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.14, 0.42, 2, 0.03), pal.enemyArmor));
    blade.position.x = side * 0.45;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.12), tier === 0 ? pal.cyanGlow : pal.violetGlow);
    edge.position.set(side * 0.45, 0, 0.18);
    wing.add(blade, edge);
    body.add(wing);
    rig.wings.push({ mesh: wing, side, tier });
  }

  // Twin counter-rotating holographic routing-table halos
  const halo1 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.055, 6, 6), pal.cyanGlow);
  halo1.rotation.x = Math.PI / 2;
  halo1.position.y = 0.72;
  body.add(halo1);
  rig.spinParts.push({ mesh: halo1, axis: 'z', speed: 2.0 });

  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 8), pal.violetGlow);
  halo2.position.y = 1.68;
  halo2.rotation.x = Math.PI / 2.4;
  body.add(halo2);
  rig.spinParts.push({ mesh: halo2, axis: 'y', speed: -2.8 });

  // Phase 2 Routing Storm Halo
  const p2 = new THREE.Group();
  const stormRing = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.08, 8, 28), pal.violetGlow);
  stormRing.rotation.x = Math.PI / 2;
  stormRing.position.y = 1.15;
  p2.add(stormRing);
  p2.visible = false;
  body.add(p2);
  rig.phase2Parts = p2;
  rig.spinParts.push({ mesh: stormRing, axis: 'z', speed: -4.2 });
}

function buildBossZheyingParts(body, rig, pal) {
  // BOSS 3: 蛰影 — Sinister Mastermind Flagship with 3-Phase Visual Evolution (潜伏 -> 提权 -> 破坏)!
  const cloakMat = pal.enemyObsidian.clone();
  cloakMat.transparent = true;
  cloakMat.opacity = 1.0;
  const trimMat = pal.violetGlow.clone();
  trimMat.transparent = true;
  trimMat.opacity = 1.0;
  rig.stealthMats.push(cloakMat, trimMat);

  const fuselage = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.15, 6), cloakMat));
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 1.12, 0.1);
  body.add(fuselage);

  const optic = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), pal.crimsonGlow);
  optic.position.set(0, 1.25, 0.45);
  body.add(optic);
  rig.spinParts.push({ mesh: optic, axis: 'y', speed: 3.2 });

  // 6 Articulated sweeping stealth shadow-blades
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const blade = shadow(new THREE.Mesh(new RoundedBoxGeometry(1.25 - row * 0.18, 0.1, 0.34, 2, 0.02), cloakMat));
    blade.position.set(side * (0.88 - row * 0.1), 1.08 + row * 0.16, 0.25 - row * 0.45);
    blade.rotation.y = -side * (0.35 + row * 0.12);
    const vein = new THREE.Mesh(new THREE.BoxGeometry(1.15 - row * 0.18, 0.12, 0.07), trimMat);
    blade.add(vein);
    body.add(blade);
    rig.wings.push({ mesh: blade, side, tier: row });
  }

  // Phase 2 (提权): Unfolded Golden-Crimson Privilege Crown Halo!
  const p2 = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.07, 6, 8), pal.goldGlow);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.62;
  p2.add(crown);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const armorPlate = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.12), pal.goldGlow));
    armorPlate.position.set(Math.cos(a) * 1.18, 1.22, Math.sin(a) * 1.18);
    armorPlate.rotation.y = -a + Math.PI / 2;
    p2.add(armorPlate);
  }
  p2.visible = false;
  body.add(p2);
  rig.phase2Parts = p2;
  rig.spinParts.push({ mesh: p2, axis: 'y', speed: 2.2 });

  // Phase 3 (破坏): Blazing Crimson Sabotage Lockdown Vortex!
  const p3 = new THREE.Group();
  const v1 = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.09, 8, 24), pal.crimsonGlow);
  v1.rotation.x = Math.PI / 2;
  v1.position.y = 0.65;
  const v2 = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.07, 8, 24), pal.violetGlow);
  v2.position.y = 1.35;
  v2.rotation.x = Math.PI / 3;
  p3.add(v1, v2);
  p3.visible = false;
  body.add(p3);
  rig.phase3Parts = p3;
  rig.spinParts.push({ mesh: v1, axis: 'z', speed: -4.8 });
  rig.spinParts.push({ mesh: v2, axis: 'y', speed: 4.0 });
}

// ============================================================================
// CONTINUOUS RIG ANIMATION UPDATERS
// ============================================================================

export function updateTowerRigAnimation(rig, tower, simTime, dt) {
  // Smooth mechanical rise & lock-in deployment entry animation (0 -> 0.32s)
  if (rig.deployAge < 0.32) {
    rig.deployAge = Math.min(0.32, rig.deployAge + dt);
    const u = rig.deployAge / 0.32;
    const ease = 1 - Math.pow(1 - u, 3);
    rig.body.scale.set(0.85 + 0.15 * ease, 0.15 + 0.85 * ease, 0.85 + 0.15 * ease);
  } else {
    rig.body.scale.set(1, 1, 1);
  }

  // Smooth turret yaw tracking
  if (rig.turret) {
    let diff = tower.turretAngle - rig.turret.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    rig.turret.rotation.y += diff * Math.min(1, dt * 12);
  }

  // Recoil / lunge motion on attack
  if (rig.recoilPart) {
    const kick = tower.type === 'firewall' ? tower.animAttack * 0.24 : -tower.animAttack * 0.22;
    rig.recoilPart.position.z = kick;
  }

  // Firewall shield-wing flare on attack or Active Surge skill!
  if (rig.wingParts && rig.wingParts.length > 0) {
    const flare = tower.skillActiveTimer > 0 ? 0.24 : tower.animAttack * 0.2;
    for (const w of rig.wingParts) {
      w.mesh.rotation.y = w.baseRotY + w.side * flare;
      w.mesh.position.x = w.baseX + w.side * (flare * 0.35);
    }
  }

  // Air-Gapper clamping blast jaws (brace tightly when Hard-Lock skill is active!)
  if (rig.jaws.length > 0) {
    const clampIn = tower.skillActiveTimer > 0 ? 0.14 : Math.sin(simTime * 2.5) * 0.025;
    for (const j of rig.jaws) {
      j.mesh.position.x = j.baseX - j.side * clampIn;
    }
  }

  // Sandbox emitter petals mechanically flare open on every AoE scan pulse!
  if (rig.petals && rig.petals.length > 0) {
    const open = tower.animAttack * 0.24 + (tower.skillActiveTimer > 0 ? 0.16 : 0);
    for (const p of rig.petals) {
      const r = p.baseR + open * 0.45;
      p.mesh.position.x = Math.cos(p.angle) * r;
      p.mesh.position.z = Math.sin(p.angle) * r;
      p.mesh.rotation.z = p.baseRotZ - open * 1.1;
    }
  }

  // Repair Daemon cross emitter surges slightly on heal pulse / Failover skill!
  if (rig.healCross) {
    const pulse = 1 + tower.animAttack * 0.22 + (tower.skillActiveTimer > 0 ? 0.18 : 0);
    rig.healCross.scale.setScalar(pulse);
  }

  // Continuous spinning / levitating sub-assemblies (paused if encrypted!)
  const spinMult = tower.encryptedTimer > 0 ? 0.08 : tower.skillActiveTimer > 0 ? 2.1 : 1.0;
  for (const sp of rig.spinParts) {
    sp.mesh.rotation[sp.axis] += sp.speed * spinMult * dt;
    if (sp.bobAmp) {
      sp.mesh.position.y = sp.baseY + Math.sin(simTime * 3.2) * sp.bobAmp;
    }
  }

  // Hit recoil micro-jolt
  if (tower.animHit > 0.01) {
    const jolt = Math.sin(tower.animHit * Math.PI * 4) * 0.08 * tower.animHit;
    rig.body.position.set(jolt, 0, -jolt * 0.5);
  } else {
    rig.body.position.set(0, 0, 0);
  }

  // Shield dome, Encryption lock cage & Active Skill Aura
  if (rig.shieldMesh) {
    rig.shieldMesh.visible = tower.shield > 1;
    if (rig.shieldMesh.visible) {
      rig.shieldMesh.rotation.y += dt * 1.1;
    }
  }
  if (rig.encryptMesh) {
    rig.encryptMesh.visible = tower.encryptedTimer > 0;
    if (rig.encryptMesh.visible) {
      rig.encryptMesh.rotation.y -= dt * 2.2;
      const pulse = 1 + Math.sin(simTime * 8) * 0.05;
      rig.encryptMesh.scale.setScalar(pulse);
    }
  }
  if (rig.skillAuraMesh) {
    rig.skillAuraMesh.visible = tower.skillActiveTimer > 0;
    if (rig.skillAuraMesh.visible) {
      const p = 1 + Math.sin(simTime * 10) * 0.1;
      rig.skillAuraMesh.scale.setScalar(p);
      rig.skillAuraMesh.position.y = 0.25 + Math.sin(simTime * 6) * 0.12;
    }
  }
}

export function updateEnemyRigAnimation(rig, enemy, simTime, dt) {
  // Smooth yaw facing
  let diff = enemy.facingAngle - rig.body.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rig.body.rotation.y += diff * Math.min(1, dt * 10);

  // Worm undulating multi-segment slither + articulated snapping mandibles!
  if (rig.segments.length > 0) {
    for (const s of rig.segments) {
      const wave = Math.sin(enemy.walkPhase - s.idx * 0.95);
      s.mesh.position.x = wave * 0.14;
      s.mesh.position.y = 0.3 + Math.abs(Math.cos(enemy.walkPhase - s.idx * 0.95)) * 0.06;
      s.mesh.rotation.y = wave * 0.28;
    }
    for (const m of rig.mandibles) {
      const snap = Math.sin(simTime * 7) * 0.12 + enemy.animAttack * 0.55;
      m.mesh.rotation.z = -m.side * (0.2 + snap);
    }
  } else {
    // Non-worm hover/stride bobbing + slight flying banking roll
    const bob = enemy.flying ? Math.sin(simTime * 4.5 + enemy.id) * 0.14 : Math.abs(Math.sin(enemy.walkPhase)) * 0.09;
    rig.body.position.y = bob;
    if (enemy.flying) {
      rig.body.rotation.z = Math.sin(simTime * 3.0 + enemy.id) * 0.12;
    }
  }

  // Attack lunge along true facing vector + physical hit-flinch recoil stagger! (Rule 2.11)
  const fx = Math.sin(rig.body.rotation.y);
  const fz = Math.cos(rig.body.rotation.y);
  let offsetFwd = 0;
  if (rig.ramPart) {
    rig.ramPart.position.z = (rig.ramBaseZ || 0.56) + enemy.animAttack * 0.48;
  } else if (enemy.animAttack > 0.01) {
    offsetFwd += Math.sin(enemy.animAttack * Math.PI) * 0.26;
  }
  if (enemy.animHit > 0.01) {
    offsetFwd -= Math.sin(enemy.animHit * Math.PI) * 0.14;
    rig.body.rotation.x = -Math.sin(enemy.animHit * Math.PI) * 0.24;
  } else {
    rig.body.rotation.x = 0;
  }
  rig.body.position.x = fx * offsetFwd;
  rig.body.position.z = fz * offsetFwd;

  // Ransomware padlock shackle snaps down on ranged encryption shot!
  if (rig.shackle) {
    rig.shackle.position.y = 1.06 - enemy.animAttack * 0.14;
  }

  // Revealed Trojan spider-blades scissor rhythmically while advancing or lunging!
  if (rig.spiderBlades && rig.spiderBlades.length > 0 && !enemy.disguised) {
    for (const sb of rig.spiderBlades) {
      const scissor = Math.sin(enemy.walkPhase * 1.6 + sb.idx * 1.57) * 0.22 + enemy.animAttack * 0.25;
      sb.mesh.rotation.z = -Math.cos(sb.angle) * (0.75 + scissor);
      sb.mesh.rotation.x = Math.sin(sb.angle) * (0.75 + scissor);
    }
  }

  // Articulated wings / Packager shield petals / Boss Zheying 3-phase wing posture!
  for (const w of rig.wings) {
    if (w.isPetal) {
      const expand = w.baseR + enemy.animAttack * 0.24 + Math.sin(simTime * 3) * 0.03;
      w.mesh.position.x = Math.cos(w.angle) * expand;
      w.mesh.position.z = Math.sin(w.angle) * expand;
    } else if (enemy.type === 'boss_zheying') {
      const phaseSpread = enemy.bossPhase === 1 ? -0.15 : enemy.bossPhase === 2 ? 0.18 : 0.38;
      const flap = Math.sin(simTime * (4.5 + enemy.bossPhase) + (w.tier || 0) * 1.1) * 0.14;
      w.mesh.rotation.z = w.side * (phaseSpread + flap);
    } else {
      const flap = Math.sin(simTime * 5.2 + (w.tier || 0) * 1.1) * 0.18;
      w.mesh.rotation.z = w.side * flap;
    }
  }

  // Spin parts
  for (const sp of rig.spinParts) {
    sp.mesh.rotation[sp.axis] += sp.speed * dt;
    if (sp.bobAmp) {
      sp.mesh.position.y = sp.baseY + Math.sin(simTime * 3.0) * sp.bobAmp;
    }
  }

  // Trojan smooth crack-open shell animation (revealProgress 0 -> 1)!
  if (rig.disguisedGroup && rig.revealedGroup) {
    const targetRev = enemy.disguised ? 0 : 1;
    rig.revealProgress += (targetRev - rig.revealProgress) * Math.min(1, dt * 8.5);
    const p = rig.revealProgress;

    rig.disguisedGroup.visible = p < 0.96;
    rig.revealedGroup.visible = p > 0.05;
    if (rig.revealedGroup.visible) {
      rig.revealedGroup.scale.setScalar(0.3 + 0.7 * p);
    }
    for (const sp of rig.shellPlates) {
      const r = 0.28 + p * 0.65;
      sp.mesh.position.set(Math.sin(sp.angle) * r, -p * 0.2, Math.cos(sp.angle) * r);
      sp.mesh.rotation.x = p * 1.1;
      sp.mesh.scale.setScalar(Math.max(0.05, 1 - p * 0.85));
    }
    if (enemy.disguised) {
      const glitch = Math.sin(simTime * 19 + enemy.id) > 0.94 ? 0.06 : 0;
      rig.disguisedGroup.position.x = glitch;
    }
  }

  // Rogue Hotspot pulsing wireless wave ring
  if (rig.wifiWaveMesh) {
    const wPhase = (simTime * 1.6 + enemy.id * 0.3) % 1;
    rig.wifiWaveMesh.scale.setScalar(0.6 + wPhase * 1.6);
    rig.wifiWaveMesh.position.y = -0.25 - wPhase * 0.95;
    rig.wifiWaveMesh.material.opacity = (1 - wPhase) * 0.6;
  }

  // Boss Phase visual evolution with smooth mechanical unfold transformation!
  if (enemy.isBoss && enemy.bossPhase !== rig.lastPhase) {
    rig.lastPhase = enemy.bossPhase;
    rig.phaseAnim = 0.65;
  }
  if (rig.phaseAnim > 0) {
    rig.phaseAnim = Math.max(0, rig.phaseAnim - dt);
  }
  const phaseScale = rig.phaseAnim > 0 ? 1 + Math.sin((rig.phaseAnim / 0.65) * Math.PI) * 0.22 : 1.0;
  if (rig.phase2Parts) {
    rig.phase2Parts.visible = enemy.bossPhase >= 2;
    if (enemy.bossPhase === 2 && rig.phaseAnim > 0) {
      const u = 1 - rig.phaseAnim / 0.65;
      rig.phase2Parts.scale.setScalar(0.18 + 0.82 * Math.sin(u * Math.PI * 0.5) * phaseScale);
    } else {
      rig.phase2Parts.scale.setScalar(1);
    }
  }
  if (rig.phase3Parts) {
    rig.phase3Parts.visible = enemy.bossPhase >= 3;
    if (enemy.bossPhase === 3 && rig.phaseAnim > 0) {
      const u = 1 - rig.phaseAnim / 0.65;
      rig.phase3Parts.scale.setScalar(0.18 + 0.82 * Math.sin(u * Math.PI * 0.5) * phaseScale);
    } else {
      rig.phase3Parts.scale.setScalar(1);
    }
  }

  // Zheying Phase 1 optical stealth transparency
  if (rig.stealthMats.length > 0) {
    const targetOp = enemy.stealth ? 0.34 : 1.0;
    for (const m of rig.stealthMats) {
      m.opacity += (targetOp - m.opacity) * Math.min(1, dt * 8);
    }
  }

  // Status overlays: Shield, Entrapped Snare Cage, Slowed Ring, Vulnerability Reticle
  if (rig.shieldMesh) {
    rig.shieldMesh.visible = enemy.shield > 1;
    if (rig.shieldMesh.visible) {
      rig.shieldMesh.rotation.y += dt * 1.4;
      rig.shieldMesh.rotation.x += dt * 0.7;
    }
  }
  if (rig.entrapMesh) {
    rig.entrapMesh.visible = enemy.entrappedTimer > 0;
    if (rig.entrapMesh.visible) {
      rig.entrapMesh.rotation.y += dt * 3.5;
    }
  }
  if (rig.slowMesh) {
    rig.slowMesh.visible = enemy.slowTimer > 0;
    if (rig.slowMesh.visible) {
      rig.slowMesh.rotation.z -= dt * 2.5;
    }
  }
  if (rig.vulnMesh) {
    rig.vulnMesh.visible = enemy.vulnTimer > 0;
    if (rig.vulnMesh.visible) {
      rig.vulnMesh.rotation.z += dt * 3.8;
    }
  }
}
