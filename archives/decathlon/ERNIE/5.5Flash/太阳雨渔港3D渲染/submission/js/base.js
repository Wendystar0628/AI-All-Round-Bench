// ---------- base, quay, walls, breakwater, lighthouse, hill ----------
const BASE = {};
const WATERLINE = WATER_Y;

function cloneRepeat(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function initBase(scene) {
  const root = new THREE.Group();
  scene.add(root);
  BASE.root = root;

  // ---- plinth ----
  const plinth = box(48.6, 0.55, 48.6, toon(0x6d7f7e, { spec: 0.10, rim: 0.10 }), 0, -6.45, 0);
  plinth.receiveShadow = true;
  root.add(plinth);
  const plinth2 = box(48.2, 0.18, 48.2, toon(0x8fa3a0, { spec: 0.12, rim: 0.12 }), 0, -6.12, 0);
  root.add(plinth2);

  // ---- quay blocks (L) ----
  const quayMat = toon(0xc7c8bf, { map: TEX.concrete, spec: 0.04, rim: 0.08 });
  const south = box(32, 6.2, 16, quayMat, -8, -3.1, 16);
  const west = box(12, 6.2, 32, quayMat, -18, -3.1, -8);
  south.receiveShadow = true; south.castShadow = true;
  west.receiveShadow = true; west.castShadow = true;
  root.add(south); root.add(west);

  // wet concrete top
  const gS = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), toon(0xcdd5d3, {
    map: cloneRepeat(TEX.wetGround, 5.5, 3.0), spec: 0.32, shine: 44, rim: 0.10
  }));
  gS.rotation.x = -Math.PI / 2; gS.position.set(-8, 0.008, 16); gS.receiveShadow = true;
  root.add(gS);
  const gW = new THREE.Mesh(new THREE.PlaneGeometry(12, 32), toon(0xcdd5d3, {
    map: cloneRepeat(TEX.wetGround, 2.2, 5.5), spec: 0.32, shine: 44, rim: 0.10
  }));
  gW.rotation.x = -Math.PI / 2; gW.position.set(-18, 0.008, -8); gW.receiveShadow = true;
  root.add(gW);
  BASE.groundS = gS; BASE.groundW = gW;

  // ---- walls ----
  function wall(w, h, x, y, z, ry, repX, repY, tide) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0xcfd0c6, {
      map: cloneRepeat(TEX.wall, repX || 3, repY || 1.2), spec: 0.05, rim: 0.08
    }));
    m.position.set(x, y, z); m.rotation.y = ry;
    m.receiveShadow = true;
    root.add(m);
    if (tide) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.3), MAT.tide);
      t.position.set(x + Math.sin(ry) * 0.012, -0.72, z + Math.cos(ry) * 0.012);
      t.rotation.y = ry;
      t.renderOrder = 3;
      root.add(t);
    }
    return m;
  }
  // basin-facing quay walls
  wall(20, 6.2, -2, -3.1, 7.985, Math.PI, 4.2, 1.3, true);
  wall(32, 6.2, -11.985, -3.1, -8, Math.PI / 2, 6.4, 1.3, true);
  wall(16, 6.2, 7.985, -3.1, 16, -Math.PI / 2, 3.4, 1.3, true);
  // outer base walls
  wall(32, 6.2, -8, -3.1, 24.015, 0, 6.4, 1.3, false);
  wall(48, 6.2, -24.015, -3.1, 0, -Math.PI / 2, 9.6, 1.3, false);
  // breakwater faces
  wall(20, 2.9, 7.99, -0.35, -2, Math.PI / 2, 4.0, 0.8, true);
  wall(20, 2.9, 12.01, -0.35, -2, -Math.PI / 2, 4.0, 0.8, true);
  wall(4, 2.9, 10, -0.35, -12.01, Math.PI, 1.0, 0.8, true);

  // extra north water section beside breakwater
  const n2 = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.65), WATER.wallMat);
  n2.position.set(12.8, WATER_Y - 2.8, -24.015); n2.renderOrder = 30;
  root.add(n2);

  // ---- curbs and hazard stripes ----
  const curbMat = toon(0xd5dbd8, { map: TEX.concrete, spec: 0.16, shine: 36, rim: 0.10 });
  function curb(w, d, x, z) {
    const m = box(w, 0.16, d, curbMat, x, 0.08, z);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
  curb(7.0, 0.55, -8.7, 8.22);     // south quay, west of steps
  curb(3.6, 0.55, 0.0, 8.22);      // south quay, between steps and ramp
  curb(0.55, 32, -11.72, -8);      // west quay edge
  curb(0.55, 16, 7.72, 16);        // south quay east edge

  const hazMat = toon(0xffffff, { map: TEX.hazard, spec: 0.18, shine: 40, rim: 0.08 });
  function hazardTop(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), hazMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.017, z);
    m.receiveShadow = true;
    root.add(m);
  }
  hazardTop(7.0, 0.52, -8.7, 8.22);
  hazardTop(3.6, 0.52, 0.0, 8.22);
  hazardTop(0.52, 32, -11.72, -8);
  hazardTop(0.52, 16, 7.72, 16);
  // vertical hazard band on edge faces
  function hazardSide(w, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.34), hazMat);
    m.position.set(x, y, z); m.rotation.y = ry;
    root.add(m);
  }
  hazardSide(20, -2, 0.19, 7.975, Math.PI);
  hazardSide(32, -11.975, 0.19, -8, Math.PI / 2);
  hazardSide(16, 7.975, 0.19, 16, -Math.PI / 2);

  // ---- steps and lower platform ----
  const stepMat = toon(0xc6cecc, { map: TEX.concrete, spec: 0.22, shine: 40, rim: 0.10 });
  const steps = new THREE.Group();
  const stepData = [
    [3.2, 0.22, 0.62, -3.5, -0.11, 7.72],
    [3.2, 0.22, 0.62, -3.5, -0.33, 7.10],
    [3.2, 0.22, 0.62, -3.5, -0.55, 6.48]
  ];
  stepData.forEach(s => {
    const m = box(s[0], s[1], s[2], stepMat, s[3], s[4], s[5]);
    m.castShadow = true; m.receiveShadow = true;
    steps.add(m);
  });
  const plat = box(4.0, 0.26, 1.7, stepMat, -3.5, -0.62, 5.35);
  plat.castShadow = true; plat.receiveShadow = true;
  steps.add(plat);
  // side cheeks
  [-5.25, -1.75].forEach(x => {
    const m = box(0.35, 1.0, 3.1, stepMat, x, -0.55, 6.6);
    m.castShadow = true; m.receiveShadow = true;
    steps.add(m);
  });
  root.add(steps);
  BASE.steps = steps;

  // ---- boat ramp ----
  const ramp = new THREE.Group();
  const rampMat = toon(0xbcc6c4, { map: cloneRepeat(TEX.concrete, 2.4, 2.8), spec: 0.28, shine: 40, rim: 0.10 });
  const rampBody = box(5.2, 0.4, 6.6, rampMat, 4.6, -0.52, 10.6);
  rampBody.rotation.x = -0.145;
  rampBody.castShadow = true; rampBody.receiveShadow = true;
  ramp.add(rampBody);
  // ramp side walls
  [[2.05, 0], [7.15, 0]].forEach(p => {
    const m = box(0.32, 0.9, 6.4, stepMat, p[0], -0.72, 10.5);
    m.rotation.x = -0.145;
    m.castShadow = true; m.receiveShadow = true;
    ramp.add(m);
  });
  root.add(ramp);
  BASE.ramp = ramp;

  // ---- breakwater ----
  const bw = new THREE.Group();
  const bwMat = toon(0xc0c8c6, { map: cloneRepeat(TEX.concrete, 3.2, 1.4), spec: 0.06, rim: 0.08 });
  const bwBody = box(4, 7.4, 20, bwMat, 10, -2.6, -2);
  bwBody.castShadow = true; bwBody.receiveShadow = true;
  addOutline(bwBody, 0.035);
  bw.add(bwBody);
  const bwTop = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 20), toon(0xd0d6d2, {
    map: cloneRepeat(TEX.wetGround, 1.2, 6), spec: 0.30, shine: 42, rim: 0.10
  }));
  bwTop.rotation.x = -Math.PI / 2; bwTop.position.set(10, 1.105, -2);
  bwTop.receiveShadow = true;
  bw.add(bwTop);
  // small parapet blocks along edges
  for (let i = 0; i < 9; i++) {
    const z = 6.6 - i * 2.2;
    const b1 = box(0.42, 0.30, 1.5, bwMat, 8.25, 1.26, z);
    const b2 = box(0.42, 0.30, 1.5, bwMat, 11.75, 1.26, z);
    b1.castShadow = b2.castShadow = true; b1.receiveShadow = b2.receiveShadow = true;
    bw.add(b1); bw.add(b2);
  }
  // ladder on inner face
  root.add(bw);
  BASE.breakwater = bw;

  buildLighthouse(root);
  buildDistantBreakwater(root);
  buildHill(root);
  buildTetrapods(root);
  addBarnacles(root);
  return BASE;
}

function buildLighthouse(root) {
  const g = new THREE.Group();
  const white = toon(0xf4f3ea, { spec: 0.20, shine: 36, rim: 0.16 });
  const red = toon(0xc4574a, { spec: 0.18, shine: 34, rim: 0.12 });
  const dark = toon(0x39464b, { spec: 0.2, shine: 30, rim: 0.08 });
  const bx = 10, bz = -10.3, by = 1.1;

  const plinth = cyl(2.5, 2.7, 0.55, 20, toon(0xbfc0b6, { map: TEX.concrete }), bx, by + 0.27, bz);
  plinth.castShadow = true; plinth.receiveShadow = true; g.add(plinth);

  const tower = cyl(1.02, 1.42, 8.4, 24, white, bx, by + 0.55 + 4.2, bz);
  tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
  addOutline(tower, 0.03);

  const bands = [[3.1, 1.28], [5.25, 1.20], [7.35, 1.12]];
  bands.forEach(b => {
    const m = cyl(b[1], b[1], 1.0, 24, red, bx, by + 0.55 + b[0], bz);
    m.castShadow = true; g.add(m);
  });

  // gallery
  const gal = cyl(1.75, 1.55, 0.24, 20, dark, bx, by + 9.2, bz);
  gal.castShadow = true; g.add(gal);
  addOutline(gal, 0.02);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.035, 5, 24), dark);
  rail.rotation.x = Math.PI / 2; rail.position.set(bx, by + 10.05, bz); g.add(rail);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    const p = cyl(0.025, 0.025, 0.85, 5, dark, bx + Math.cos(a) * 1.62, by + 9.62, bz + Math.sin(a) * 1.62);
    g.add(p);
  }

  // lantern room
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 1.35, 16, 1, true), MAT.glass);
  glass.position.set(bx, by + 10.05, bz);
  g.add(glass);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.95 });
  const lamp = sph(0.42, lampMat, bx, by + 10.0, bz, 12, 8);
  g.add(lamp);
  BASE.lamp = lamp;
  const lampGlow = makeGlow(0xffe2a0, 7, 0.0);
  lampGlow.position.set(bx, by + 10.0, bz);
  g.add(lampGlow);
  BASE.lampGlow = lampGlow;
  const lampLight = new THREE.PointLight(0xffd98a, 0, 16, 2);
  lampLight.position.set(bx, by + 10.0, bz);
  g.add(lampLight);
  BASE.lampLight = lampLight;

  // mullions
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    const m = box(0.05, 1.4, 0.05, dark, bx + Math.cos(a) * 0.93, by + 10.05, bz + Math.sin(a) * 0.93);
    g.add(m);
  }
  const roof = cyl(0.05, 1.32, 0.85, 18, red, bx, by + 11.15, bz);
  roof.castShadow = true; g.add(roof);
  addOutline(roof, 0.02);
  const ball = sph(0.16, dark, bx, by + 11.65, bz, 8, 6); g.add(ball);

  // door + windows
  const door = box(0.62, 1.25, 0.10, toon(0x6b7f7c, { spec: 0.15 }), bx, by + 1.15, bz + 1.44);
  g.add(door);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x5a7f86 });
  [[0, 4.2], [0, 6.4]].forEach(w => {
    const m = box(0.34, 0.5, 0.08, winMat, bx, by + 0.55 + w[1], bz + 1.18);
    g.add(m);
  });

  g.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow || false; o.receiveShadow = true; } });
  g.userData.tag = 'lighthouse';
  root.add(g);
  BASE.lighthouse = g;
}

function buildDistantBreakwater(root) {
  const g = new THREE.Group();
  const m = toon(0xbfc7c3, { map: cloneRepeat(TEX.concrete, 5, 0.6), spec: 0.05, rim: 0.08 });
  const body = box(22, 1.7, 1.7, m, 1.6, 0.15, -22.85);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const cap = box(22.2, 0.16, 1.9, toon(0xd8dcd2, { map: TEX.concrete }), 1.6, 1.06, -22.85);
  g.add(cap);
  // tiny beacon
  const bc = cyl(0.16, 0.22, 1.5, 8, toon(0xd8ded8, { spec: 0.15 }), 12.2, 1.85, -22.85);
  g.add(bc);
  const top = cyl(0.13, 0.13, 0.28, 8, new THREE.MeshBasicMaterial({ color: 0xd06a55 }), 12.2, 2.72, -22.85);
  g.add(top);
  const gl = makeGlow(0xff9a70, 1.6, 0.35);
  gl.position.set(12.2, 2.72, -22.85);
  g.add(gl);
  // a couple of blocks
  for (let i = 0; i < 7; i++) {
    const b = box(1.4, 0.9, 1.2, m, -8 + i * 3.4, 1.5, -22.2);
    b.rotation.y = i * 0.6;
    b.castShadow = true;
    g.add(b);
  }
  root.add(g);
  BASE.distantBW = g;
}

function hillHeight(x, z) {
  const cx = 20.8, cz = -20.2, rx = 3.2, rz = 3.8, ry = 4.8;
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  const d = dx * dx + dz * dz;
  if (d >= 1) return 0.02;
  return ry * Math.sqrt(1 - d) + 0.0;
}

function buildHill(root) {
  const g = new THREE.Group();
  // earth plinth closing the corner
  const rockMat = toon(0x9a9788, { map: cloneRepeat(TEX.rock, 3, 1.6), spec: 0.03, rim: 0.06 });
  const plinth = box(6.4, 6.2, 7.6, rockMat, 20.8, -3.1, -20.2);
  plinth.castShadow = true; plinth.receiveShadow = true;
  g.add(plinth);

  const hillMat = toon(0x7fae80, { spec: 0.05, rim: 0.13 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 20, 0, TAU, 0, Math.PI / 2), hillMat);
  dome.scale.set(3.2, 4.8, 3.8);
  dome.position.set(20.8, 0.0, -20.2);
  dome.castShadow = true; dome.receiveShadow = true;
  g.add(dome);
  addOutline(dome, 0.02);

  // darker grass patches
  const r = mulberry32(501);
  for (let i = 0; i < 10; i++) {
    const a = r() * TAU, rad = 0.8 + r() * 2.3;
    const x = 20.8 + Math.cos(a) * rad, z = -20.2 + Math.sin(a) * rad * 0.95;
    const y = hillHeight(x, z);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + r() * 1.3, 10), toon(0x6d9f76, { spec: 0.03, rim: 0.08 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y + 0.02, z);
    g.add(p);
  }

  // trees
  const trunkMat = MAT.trunk;
  const leafMats = [MAT.leaf, MAT.leafDark, toon(0x86b78a, { spec: 0.04, rim: 0.12, flat: true })];
  const treePos = [];
  for (let i = 0; i < 20; i++) {
    const a = r() * TAU, rad = 0.9 + r() * 2.2;
    const x = 20.8 + Math.cos(a) * rad, z = -20.2 + Math.sin(a) * rad * 0.95;
    if (x > 23.6 || z < -23.6) continue;
    treePos.push([x, z, 0.55 + r() * 0.5]);
  }
  // a few trees near the shore
  treePos.push([18.4, -17.4, 0.8], [19.2, -22.8, 0.7], [23.0, -17.9, 0.75]);
  treePos.forEach((tp, i) => {
    const [x, z, s] = tp;
    const y = Math.max(hillHeight(x, z), 0.0);
    const t = new THREE.Group();
    const trunk = cyl(0.09 * s, 0.14 * s, 1.5 * s, 6, trunkMat, 0, 0.75 * s, 0);
    trunk.castShadow = true;
    t.add(trunk);
    const lm = leafMats[i % leafMats.length];
    const blobs = 2 + (i % 2);
    for (let b = 0; b < blobs; b++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry((0.62 + r() * 0.28) * s, 0), lm);
      f.position.set((r() - 0.5) * 0.6 * s, (1.5 + b * 0.42) * s, (r() - 0.5) * 0.6 * s);
      f.rotation.set(r() * TAU, r() * TAU, r() * TAU);
      f.castShadow = true;
      t.add(f);
    }
    t.position.set(x, y - 0.1, z);
    t.rotation.y = r() * TAU;
    g.add(t);
    if (!BASE.trees) BASE.trees = [];
    BASE.trees.push({ g: t, phase: r() * TAU });
  });

  // houses
  function house(x, z, ry, s) {
    const y = Math.max(hillHeight(x, z), 0.0);
    const hg = new THREE.Group();
    const wallM = toon(0xe6e2d2, { spec: 0.10, rim: 0.10 });
    const body = box(2.7 * s, 1.9 * s, 2.3 * s, wallM, 0, 0.95 * s, 0);
    body.castShadow = true; body.receiveShadow = true;
    hg.add(body);
    // gabled roof (two slabs)
    const roofM = toon(0x7d8fa0, { map: cloneRepeat(TEX.roof, 2, 1), spec: 0.14, rim: 0.10 });
    const rl = box(1.75 * s, 0.12 * s, 2.7 * s, roofM, -0.72 * s, 2.16 * s, 0);
    rl.rotation.z = 0.52;
    const rr2 = box(1.75 * s, 0.12 * s, 2.7 * s, roofM, 0.72 * s, 2.16 * s, 0);
    rr2.rotation.z = -0.52;
    rl.castShadow = rr2.castShadow = true;
    hg.add(rl); hg.add(rr2);
    // gable ends
    const tri = new THREE.Shape();
    tri.moveTo(-1.35 * s, 0); tri.lineTo(1.35 * s, 0); tri.lineTo(0, 0.95 * s); tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri);
    const gableF = new THREE.Mesh(triGeo, wallM);
    gableF.position.set(0, 1.9 * s, 1.16 * s);
    hg.add(gableF);
    const gableB = new THREE.Mesh(triGeo, wallM);
    gableB.position.set(0, 1.9 * s, -1.16 * s); gableB.rotation.y = Math.PI;
    hg.add(gableB);
    // windows
    const winM = new THREE.MeshBasicMaterial({ color: 0xffcc7a });
    [[-0.65, 1.05, 1.17], [0.65, 1.05, 1.17]].forEach(w => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.52 * s, 0.58 * s), winM);
      m.position.set(w[0] * s, w[1] * s, w[2] * s);
      hg.add(m);
    });
    const doorM = toon(0x7b6a55, { spec: 0.05 });
    const d = box(0.6 * s, 1.15 * s, 0.08, doorM, 0, 0.58 * s, 1.17 * s);
    hg.add(d);
    hg.position.set(x, y - 0.15, z);
    hg.rotation.y = ry;
    g.add(hg);
    return hg;
  }
  house(19.3, -18.1, -2.5, 0.8);
  house(22.0, -20.7, -0.6, 0.7);
  house(22.5, -17.9, -2.9, 0.65);

  // shoreline rocks
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU;
    const x = 20.8 + Math.cos(a) * (3.1 + r() * 0.5);
    const z = -20.2 + Math.sin(a) * (3.7 + r() * 0.5);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + r() * 0.45, 0), rockMat);
    m.position.set(x, -0.35 + r() * 0.3, z);
    m.rotation.set(r() * TAU, r() * TAU, r() * TAU);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }

  // small stone stair up the hill
  for (let i = 0; i < 7; i++) {
    const x = 18.0 + i * 0.36, z = -16.9 - i * 0.40;
    const y = hillHeight(x, z);
    const st = box(1.5, 0.18, 0.55, toon(0xc9c6b8, { map: TEX.concrete, spec: 0.10 }), x, y + 0.02, z);
    st.rotation.y = -0.35;
    st.receiveShadow = true; st.castShadow = true;
    g.add(st);
  }

  root.add(g);
  BASE.hill = g;
}

function tetrapodGeometry() {
  const parts = [];
  const dirs = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1)
  ].map(v => v.normalize());
  const up = new THREE.Vector3(0, 1, 0);
  dirs.forEach(d => {
    const len = 1.25;
    const cylGeo = new THREE.CylinderGeometry(0.13, 0.30, len, 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    const m = new THREE.Matrix4().compose(
      d.clone().multiplyScalar(len * 0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    );
    cylGeo.applyMatrix4(m);
    parts.push(cylGeo);
  });
  const core = new THREE.SphereGeometry(0.34, 8, 6);
  parts.push(core);
  return mergeGeos(parts);
}

function buildTetrapods(root) {
  const geo = tetrapodGeometry();
  const mat = toon(0xd5d5cb, { map: cloneRepeat(TEX.concrete, 1, 1), spec: 0.06, rim: 0.10, flat: false });
  const spots = [
    [13.2, -0.35, -9.6, 0.9], [13.0, -0.45, -10.6, 1.1], [14.4, -0.40, -11.0, 0.8],
    [7.2, -0.42, 7.0, 1.0], [12.9, -0.45, 6.6, 0.9],
    [15.6, -0.42, 17.4, 1.0], [18.2, -0.48, 20.2, 1.1], [21.2, -0.40, 17.6, 0.9],
    [20.6, -0.50, 22.0, 1.0], [14.4, -0.46, 21.2, 0.85]
  ];
  const r = mulberry32(509);
  spots.forEach(s => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(s[0], s[1] + 0.55, s[2]);
    m.rotation.set(r() * TAU, r() * TAU, r() * TAU);
    m.scale.setScalar(s[3]);
    m.castShadow = true; m.receiveShadow = true;
    addOutline(m, 0.018);
    root.add(m);
    // foam
    const fm = MAT.foam.clone();
    fm.opacity = 0.45;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), fm);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s[0], WATER_Y + 0.03, s[2]);
    f.renderOrder = 6;
    f.userData.foam = true;
    f.userData.phase = r() * TAU;
    root.add(f);
    if (!BASE.foams) BASE.foams = [];
    BASE.foams.push(f);
  });
}

function addBarnacles(root) {
  const geo = new THREE.ConeGeometry(0.055, 0.09, 5);
  const mat = toon(0xe9e8da, { spec: 0.10, rim: 0.08 });
  const faces = [
    { x: -2, z: 7.96, ry: Math.PI, w: 19.6, n: 60 },
    { x: -11.96, z: -8, ry: Math.PI / 2, w: 31.6, n: 80 },
    { x: 7.96, z: 16, ry: -Math.PI / 2, w: 15.6, n: 45 },
    { x: 7.96, z: -5, ry: Math.PI / 2, w: 25.6, n: 45 },
    { x: 12.04, z: -5, ry: -Math.PI / 2, w: 25.6, n: 40 }
  ];
  const r = mulberry32(521);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  let total = 0;
  faces.forEach(f => total += f.n);
  const inst = new THREE.InstancedMesh(geo, mat, total);
  inst.frustumCulled = false;
  let idx = 0;
  faces.forEach(f => {
    const nx = Math.sin(f.ry), nz = Math.cos(f.ry);
    for (let i = 0; i < f.n; i++) {
      const u = (r() - 0.5) * f.w;
      const y = -1.45 + r() * 1.55;
      const tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
      dummy.position.set(f.x + tx * u + nx * 0.035, y, f.z + tz * u + nz * 0.035);
      dummy.quaternion.setFromUnitVectors(up, new THREE.Vector3(nx, 0.15, nz).normalize());
      dummy.rotateY(r() * TAU);
      const s = 0.6 + r() * 1.1;
      dummy.scale.set(s, s * (0.7 + r() * 0.8), s);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }
  });
  inst.instanceMatrix.needsUpdate = true;
  root.add(inst);
  BASE.barnacles = inst;
}