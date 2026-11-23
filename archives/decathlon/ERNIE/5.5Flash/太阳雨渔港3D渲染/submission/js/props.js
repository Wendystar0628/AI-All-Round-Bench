// ---------- quay props, street corner, still-life traces ----------
const PROP = { bollards: [], perches: [], flags: [], windsock: null, drips: [] };

function texNet() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(226,228,208,0.55)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 16; i++) {
      const p = i * 16;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 16) {
        const x = p + Math.sin(y * 0.05 + i) * 2.2;
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = p + Math.cos(x * 0.05 + i) * 2.2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // knots
    ctx.fillStyle = 'rgba(240,238,214,0.65)';
    for (let i = 0; i <= 16; i++) {
      for (let j = 0; j <= 16; j++) {
        ctx.beginPath(); ctx.arc(i * 16, j * 16, 1.4, 0, TAU); ctx.fill();
      }
    }
    // a few holes / repairs
    ctx.globalCompositeOperation = 'destination-out';
    const r = mulberry32(901);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 3 + r() * 7, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, { clamp: true });
}

function texFlag() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e9e4d4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c86a55';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,100,96,0.35)';
    ctx.fillRect(0, h - 18, w, 18);
    const r = mulberry32(903);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(90,90,80,${r() * 0.08})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  }, { clamp: true });
}

function initProps(scene) {
  buildBollards(scene);
  buildLampsAndWires(scene);
  buildFishBoxes(scene);
  buildNetRack(scene);
  buildWinchAndCrane(scene);
  buildVending(scene);
  buildSignpost(scene);
  buildWindsockAndFlags(scene);
  buildStillLife(scene);
  buildWallDetails(scene);
  buildLooseProps(scene);
}

function buildBollards(scene) {
  const mat = toon(0x2f3a3e, { spec: 0.22, shine: 26, rim: 0.08 });
  const profile = [
    [0.001, 0], [0.20, 0], [0.21, 0.06], [0.17, 0.10], [0.13, 0.26],
    [0.115, 0.46], [0.13, 0.58], [0.15, 0.63], [0.14, 0.69], [0.09, 0.73], [0.02, 0.75]
  ].map(p => new THREE.Vector2(p[0], p[1]));
  const geo = new THREE.LatheGeometry(profile, 14);
  const spots = [
    [-11.0, 8.75], [-8.6, 8.75], [-6.2, 8.75], [-1.0, 8.75], [1.0, 8.75], [7.35, 8.75],
    [-11.35, 5.6], [-11.35, 1.0], [-11.35, -4.4], [-11.35, -9.6], [-11.35, -14.6], [-11.35, -19.4]
  ];
  const r = mulberry32(905);
  spots.forEach((s, i) => {
    const b = new THREE.Mesh(geo, mat);
    b.position.set(s[0], 0.02, s[1]);
    b.rotation.y = r() * TAU;
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    // base plate
    const bp = cyl(0.24, 0.26, 0.05, 12, mat, s[0], 0.03, s[1]);
    scene.add(bp);
    PROP.bollards.push(new THREE.Vector3(s[0], 0.78, s[1]));
    if (i < 10) PROP.perches.push(new THREE.Vector3(s[0], 0.8, s[1]));
    // rope coil on some
    if (i % 3 === 0 || i === 4) {
      for (let k = 0; k < 3; k++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.19 - k * 0.012, 0.028, 5, 12), MAT.rope);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(s[0], 0.30 + k * 0.055, s[1]);
        scene.add(coil);
      }
      // rope hanging into water
      const top = new THREE.Vector3(s[0] + 0.16, 0.72, s[1]);
      const mid = new THREE.Vector3(s[0] + 0.34, -0.1, s[1] + 0.1);
      const end = new THREE.Vector3(s[0] + 0.42, WATER_Y - 0.75, s[1] + 0.18);
      const curve = new THREE.CatmullRomCurve3([top, mid, end]);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.028, 5, false), MAT.ropeDark);
      rope.castShadow = true;
      scene.add(rope);
    }
  });

  // bollard rope coils on quay (loose)
  const coilMat = MAT.rope;
  [[-7.8, 9.4, 1.5], [3.2, 9.6, 1.2], [-1.8, 7.4, 0.9]].forEach(c => {
    const g2 = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 - k * 0.03, 0.03, 5, 14), coilMat);
      t.rotation.x = Math.PI / 2;
      t.position.y = 0.03 + k * 0.045;
      g2.add(t);
    }
    g2.position.set(c[0], 0.02, c[1]);
    g2.scale.setScalar(c[2]);
    scene.add(g2);
  });
}

function buildLampsAndWires(scene) {
  const poleMat = toon(0x4d5f60, { spec: 0.3, shine: 40, rim: 0.12 });
  const shadeMat = toon(0x3f5152, { spec: 0.35, shine: 50, rim: 0.14, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffeec4 });
  const lampSpots = [
    [-13.6, 10.8, 0.0], [5.9, 10.4, 0.0], [-13.4, 19.6, 0.0]
  ];
  const tops = [];
  lampSpots.forEach((p, i) => {
    const g = new THREE.Group();
    const pole = cyl(0.055, 0.085, 4.1, 8, poleMat, 0, 2.05, 0);
    pole.castShadow = true;
    g.add(pole);
    g.add(cyl(0.16, 0.20, 0.22, 8, poleMat, 0, 0.11, 0));
    // ring shade
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 18), shadeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.06;
    g.add(ring);
    const cap = cyl(0.10, 0.16, 0.10, 10, shadeMat, 0, 4.14, 0);
    g.add(cap);
    const bulb = sph(0.11, bulbMat, 0, 3.98, 0, 8, 6);
    g.add(bulb);
    const glow = makeGlow(0xffe6b0, 2.6, 0.35);
    glow.position.y = 3.98;
    g.add(glow);
    g.position.set(p[0], 0.0, p[1]);
    scene.add(g);
    tops.push(new THREE.Vector3(p[0], 4.1, p[1]));
    PROP.perches.push(new THREE.Vector3(p[0], 4.2, p[1]));
  });

  // wires between lamp tops and buildings
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x3a4244 });
  function wire(a, b, sag) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.012, 4, false), wireMat);
    scene.add(m);
    return m;
  }
  wire(tops[0], tops[1], 1.1);
  wire(tops[0], tops[2], 0.9);
  wire(tops[1], new THREE.Vector3(6.9, 3.6, 22.0), 0.8);
  wire(tops[0], new THREE.Vector3(-21.5, 4.4, 14.0), 1.2);
  wire(new THREE.Vector3(-21.5, 4.4, 14.0), new THREE.Vector3(-21.5, 4.4, 22.0), 0.5);
  // a couple of thin sagging wires across the sky
  wire(new THREE.Vector3(-24, 7.5, -20), new THREE.Vector3(24, 6.8, -21), 2.2);
  wire(new THREE.Vector3(-24, 7.0, -18), new THREE.Vector3(24, 6.4, -19), 1.9);
}

function buildFishBoxes(scene) {
  const r = mulberry32(911);
  const boxGeo = new THREE.BoxGeometry(0.78, 0.34, 0.56);
  const lidGeo = new THREE.BoxGeometry(0.80, 0.035, 0.58);
  const white = MAT.fishBox, blue = MAT.fishBoxBlue;
  const lidM = toon(0xd9dfd7, { spec: 0.25, shine: 50, rim: 0.12 });
  const spots = [
    [-11.6, 12.0, 4], [-10.7, 12.6, 3], [-12.2, 13.4, 2],
    [-7.9, 15.9, 3], [-7.1, 16.6, 2], [6.2, 12.2, 3], [5.5, 13.0, 2]
  ];
  spots.forEach(s => {
    for (let i = 0; i < s[2]; i++) {
      const x = s[0] + (r() - 0.5) * 0.12, z = s[1] + (r() - 0.5) * 0.12;
      const y = 0.17 + i * 0.35;
      const m = new THREE.Mesh(boxGeo, r() < 0.55 ? blue : white);
      m.position.set(x, y, z);
      m.rotation.y = (r() - 0.5) * 0.3;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      const l = new THREE.Mesh(lidGeo, lidM);
      l.position.set(x, y + 0.185, z);
      l.rotation.y = m.rotation.y;
      scene.add(l);
    }
  });
  // a couple tipped over
  const tipped = new THREE.Mesh(boxGeo, white);
  tipped.position.set(-6.6, 0.22, 14.4);
  tipped.rotation.set(0.2, 0.7, 1.35);
  tipped.castShadow = true;
  scene.add(tipped);
}

function buildNetRack(scene) {
  const g = new THREE.Group();
  const metal = toon(0x6a7a78, { spec: 0.3, shine: 40, rim: 0.1 });
  const x0 = -9.8, x1 = -6.2, z0 = 12.2, z1 = 14.4, H = 2.3;
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(p => {
    const post = cyl(0.05, 0.06, H, 6, metal, p[0], H / 2, p[1]);
    post.castShadow = true;
    g.add(post);
  });
  g.add(box(x1 - x0 + 0.2, 0.06, 0.06, metal, (x0 + x1) / 2, H, z0));
  g.add(box(x1 - x0 + 0.2, 0.06, 0.06, metal, (x0 + x1) / 2, H, z1));
  g.add(box(0.06, 0.06, z1 - z0, metal, x0, H, (z0 + z1) / 2));
  g.add(box(0.06, 0.06, z1 - z0, metal, x1, H, (z0 + z1) / 2));

  const netTex = TEX.net || (TEX.net = texNet());
  const netMat = new THREE.MeshBasicMaterial({
    map: netTex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide,
    color: 0xdfe2d2, opacity: 0.9, depthWrite: false
  });
  // draped net over the top
  const ng = new THREE.PlaneGeometry(3.6, 2.2, 10, 8);
  const pos = ng.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 1.4) * 0.12 + Math.cos(y * 1.7) * 0.06);
  }
  ng.computeVertexNormals();
  const net = new THREE.Mesh(ng, netMat);
  net.rotation.x = -0.12;
  net.position.set((x0 + x1) / 2, 1.35, (z0 + z1) / 2);
  g.add(net);
  // hanging net panel on the side
  const net2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9, 8, 6), netMat);
  net2.position.set(x1 + 0.03, 1.25, (z0 + z1) / 2);
  net2.rotation.y = Math.PI / 2;
  g.add(net2);
  PROP.netMeshes = [net, net2];

  // floats along bottom edge
  const floatGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const fmats = [MAT.orange, toon(0xf0ecdc, { spec: 0.2 })];
  const fr = mulberry32(913);
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Mesh(floatGeo, fmats[i % 2]);
    f.position.set(x0 + 0.2 + i * 0.3, 0.25 + fr() * 0.05, z1 - 0.05 + (fr() - 0.5) * 0.1);
    g.add(f);
  }
  // float string hanging
  const stringPts = [];
  for (let i = 0; i <= 10; i++) stringPts.push(new THREE.Vector3(x0 + 0.4 + i * 0.26, 1.2 - i * 0.085 + Math.sin(i * 0.8) * 0.06, z1 + 0.04));
  const sc = new THREE.CatmullRomCurve3(stringPts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(sc, 20, 0.012, 4, false), MAT.rope));
  stringPts.forEach((p, i) => {
    if (i % 2 === 0) {
      const f = new THREE.Mesh(floatGeo, i % 4 === 0 ? MAT.orange : MAT.white);
      f.position.copy(p);
      g.add(f);
    }
  });

  scene.add(g);
  g.userData.tag = 'netrack';
  PROP.netRack = g;
  // seagull perch on the rack
  PROP.perches.push(new THREE.Vector3(x1, 2.35, z1));
}

function buildWinchAndCrane(scene) {
  const g = new THREE.Group();
  const rust = toon(0x9a6547, { spec: 0.12, shine: 24, rim: 0.08, map: cloneRepeat(TEX.rock, 1, 1) });
  const dark = toon(0x5a5148, { spec: 0.2, shine: 30, rim: 0.08 });

  // hand winch
  const wg = new THREE.Group();
  wg.add(box(0.9, 0.12, 0.7, rust, 0, 0.06, 0));
  wg.add(box(0.12, 0.75, 0.12, rust, -0.35, 0.45, 0));
  wg.add(box(0.12, 0.75, 0.12, rust, 0.35, 0.45, 0));
  const drum = cyl(0.20, 0.20, 0.62, 12, dark, 0, 0.72, 0);
  drum.rotation.z = Math.PI / 2;
  drum.castShadow = true;
  wg.add(drum);
  for (let i = 0; i < 5; i++) {
    const rr = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.02, 4, 12), MAT.ropeDark);
    rr.rotation.y = Math.PI / 2;
    rr.position.set(-0.24 + i * 0.12, 0.72, 0);
    wg.add(rr);
  }
  const crank = cyl(0.03, 0.03, 0.36, 5, rust, 0.5, 0.72, 0.18);
  crank.rotation.z = 0.9;
  wg.add(crank);
  wg.add(sph(0.05, dark, 0.65, 0.62, 0.18, 6, 5));
  wg.position.set(6.3, 0.02, 15.0);
  wg.rotation.y = -0.4;
  wg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(wg);

  // small derrick crane
  const cg = new THREE.Group();
  cg.add(cyl(0.09, 0.13, 2.5, 8, rust, 0, 1.25, 0));
  const boom = cyl(0.06, 0.09, 2.8, 7, rust, 0, 2.3, 0.9);
  boom.rotation.x = 0.85;
  boom.castShadow = true;
  cg.add(boom);
  cg.add(box(0.5, 0.08, 0.5, dark, 0, 0.04, 0));
  // cable + hook
  const cableTop = new THREE.Vector3(0, 3.35, 2.0);
  const cableEnd = new THREE.Vector3(0, 1.15, 2.55);
  const cab = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([cableTop, cableEnd]), 8, 0.012, 4, false), MAT.darkMetal);
  cg.add(cab);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 4, 8, Math.PI * 1.3), MAT.darkMetal);
  hook.position.copy(cableEnd);
  hook.rotation.z = 0.6;
  cg.add(hook);
  // pulley
  const pul = cyl(0.09, 0.09, 0.05, 10, dark, 0, 3.33, 2.0);
  pul.rotation.z = Math.PI / 2;
  cg.add(pul);
  cg.position.set(7.0, 0.0, 12.4);
  cg.rotation.y = 0.5;
  cg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(cg);

  scene.add(g);
  PROP.winch = wg;
  PROP.crane = cg;
}

function buildVending(scene) {
  const g = new THREE.Group();
  const body = box(1.02, 2.0, 0.72, toon(0xe7eae6, { spec: 0.25, shine: 45, rim: 0.12 }), 0, 1.0, 0);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.92), new THREE.MeshBasicMaterial({ map: TEX.vending }));
  front.position.set(0, 1.0, 0.365);
  g.add(front);
  // rusty awning
  const aw = box(1.3, 0.06, 0.7, toon(0x9a7a58, { map: TEX.rock, spec: 0.1 }), 0, 2.18, 0.22);
  aw.rotation.x = -0.18;
  aw.castShadow = true;
  g.add(aw);
  g.add(box(1.3, 0.12, 0.05, toon(0x7d6248, { spec: 0.1 }), 0, 2.08, 0.55));
  // lightbox glow
  const gl = makeGlow(0xbfe8ff, 2.2, 0.28);
  gl.position.set(0, 1.2, 0.5);
  g.add(gl);
  const pl = new THREE.PointLight(0xcfeaff, 0.35, 4.5, 2);
  pl.position.set(0, 1.3, 0.8);
  g.add(pl);
  // bottles on top? no
  g.position.set(1.55, 0.02, 15.2);
  g.rotation.y = 0.18;
  scene.add(g);
  PROP.vending = g;
}

function buildSignpost(scene) {
  const g = new THREE.Group();
  const wood = toon(0x8a6f52, { map: TEX.wood, spec: 0.08 });
  const p1 = cyl(0.055, 0.07, 2.3, 6, wood, -0.62, 1.15, 0);
  const p2 = cyl(0.055, 0.07, 2.3, 6, wood, 0.62, 1.15, 0);
  p1.castShadow = p2.castShadow = true;
  g.add(p1); g.add(p2);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({
    map: TEX.signpost, transparent: false, side: THREE.DoubleSide
  }));
  board.position.set(0, 1.95, 0.02);
  board.rotation.y = 0.06;
  g.add(board);
  g.add(box(1.98, 1.98, 0.06, toon(0x6f7d7c, { spec: 0.1 }), 0, 1.95, -0.03));
  g.position.set(-1.0, 0.0, 10.9);
  g.rotation.y = 0.10;
  scene.add(g);
  PROP.signpost = g;
}

function buildWindsockAndFlags(scene) {
  const g = new THREE.Group();
  const poleMat = toon(0x8d9a98, { spec: 0.35, shine: 50, rim: 0.14 });
  const pole = cyl(0.05, 0.07, 4.4, 8, poleMat, 0, 2.2, 0);
  pole.castShadow = true;
  g.add(pole);
  const arm = cyl(0.035, 0.035, 1.0, 5, poleMat, 0.5, 4.3, 0);
  arm.rotation.z = Math.PI / 2;
  g.add(arm);

  // striped windsock texture
  const sockTex = canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8e2d2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d2694f';
    for (let i = 0; i < 4; i++) ctx.fillRect(i * 32, 0, 16, h);
    const r = mulberry32(921);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(90,85,70,${r() * 0.10})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  }, { repeat: [1, 1] });
  const sockGeo = new THREE.CylinderGeometry(0.20, 0.09, 1.5, 10, 1, true);
  sockGeo.translate(0, -0.75, 0);
  sockGeo.rotateZ(Math.PI / 2);
  const sockMat = toon(0xffffff, { map: sockTex, side: THREE.DoubleSide, spec: 0.1 });
  const sock = new THREE.Mesh(sockGeo, sockMat);
  sock.position.set(1.0, 4.3, 0);
  sock.castShadow = true;
  g.add(sock);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.018, 4, 14), poleMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(1.0, 4.3, 0);
  g.add(ring);

  g.position.set(7.0, 0.0, 11.2);
  g.rotation.y = -0.5;
  sock.userData.tag = 'windsock';
  scene.add(g);
  PROP.windsock = sock;
  PROP.windsockBase = g;
  PROP.perches.push(new THREE.Vector3(7.0, 4.45, 11.2));

  // small flag line near the waiting room
  const flagTex = TEX.flag || (TEX.flag = texFlag());
  const colors = [0xd86f58, 0xe8c05a, 0x6f9fb5, 0xe8e2d2, 0x7fae8a];
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x4a5254 });
  const a = new THREE.Vector3(-6.2, 3.5, 14.6);
  const b = new THREE.Vector3(0.2, 3.35, 14.2);
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= 0.35;
  const curve = new THREE.CatmullRomCurve3([a, mid, b]);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 3, false), lineMat);
  scene.add(line);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.42, -0.06, 0, 0, -0.30, 0
  ], 3));
  flagGeo.computeVertexNormals();
  for (let i = 0; i < 7; i++) {
    const u = 0.08 + i * 0.13;
    const p = curve.getPointAt(u);
    const fm = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, map: flagTex, transparent: false });
    const f = new THREE.Mesh(flagGeo, fm);
    f.position.copy(p);
    f.rotation.y = 0.2;
    scene.add(f);
    PROP.flags.push({ mesh: f, phase: i * 0.9, baseRot: 0.2 });
  }
}

function buildStillLife(scene) {
  // two silver instrument cases
  const silver = toon(0xb9c0c0, { spec: 0.65, shine: 90, rim: 0.3 });
  const darkTrim = toon(0x4b5558, { spec: 0.4, shine: 60, rim: 0.15 });
  function instrumentCase(x, z, ry, s) {
    const g = new THREE.Group();
    const body = box(1.15 * s, 0.20 * s, 0.42 * s, silver, 0, 0.10 * s, 0);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const lid = box(1.16 * s, 0.055 * s, 0.43 * s, silver, 0, 0.215 * s, 0);
    lid.castShadow = true;
    g.add(lid);
    // trim
    g.add(box(1.18 * s, 0.02 * s, 0.44 * s, darkTrim, 0, 0.19 * s, 0));
    // latches
    [-0.32, 0.32].forEach(p => {
      g.add(box(0.08 * s, 0.06 * s, 0.03 * s, darkTrim, p * s, 0.18 * s, 0.22 * s));
    });
    // handle
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.10 * s, 0.018 * s, 4, 10, Math.PI), darkTrim);
    h.position.set(0, 0.24 * s, 0);
    h.rotation.x = Math.PI / 2;
    g.add(h);
    // sticker
    g.add(box(0.16 * s, 0.001, 0.10 * s, toon(0xe8e2cc), 0.3 * s, 0.245 * s, 0.05 * s));
    g.position.set(x, 0.01, z);
    g.rotation.y = ry;
    g.userData.tag = 'case';
    scene.add(g);
    return g;
  }
  instrumentCase(-8.3, 10.5, 0.18, 1.0);
  instrumentCase(-7.05, 10.45, 0.05, 0.95);
  PROP.cases = true;

  // transparent umbrella leaning by the steps
  const ug = new THREE.Group();
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2f4, transparent: true, opacity: 0.26, roughness: 0.08,
    metalness: 0.0, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1.0
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 10, 0, TAU, 0, Math.PI / 2), canopyMat);
  canopy.scale.y = 0.34;
  canopy.position.y = 1.62;
  canopy.castShadow = false;
  ug.add(canopy);
  // ribs
  const ribMat = toon(0x9aa6a4, { spec: 0.5, shine: 70, rim: 0.2 });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    const rib = cyl(0.008, 0.008, 0.66, 4, ribMat, Math.cos(a) * 0.30, 1.44, Math.sin(a) * 0.30);
    rib.rotation.z = Math.cos(a) * 0.9;
    rib.rotation.x = -Math.sin(a) * 0.9;
    ug.add(rib);
  }
  const shaft = cyl(0.014, 0.014, 1.62, 6, ribMat, 0, 0.81, 0);
  ug.add(shaft);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.018, 5, 12, Math.PI * 1.1), toon(0x6a7a78, { spec: 0.3 }));
  handle.position.set(0.06, 0.04, 0);
  handle.rotation.z = -0.4;
  ug.add(handle);
  // droplets
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xeafcff, transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0, clearcoat: 1 });
  const dr = mulberry32(931);
  for (let i = 0; i < 16; i++) {
    const a = dr() * TAU, rad = dr() * 0.52;
    const d = sph(0.012 + dr() * 0.012, dropMat, Math.cos(a) * rad, 1.62 + 0.20 * (1 - rad / 0.62) * 0.34 - 0.02, Math.sin(a) * rad, 5, 4);
    ug.add(d);
  }
  ug.position.set(-4.55, 0.0, 9.35);
  ug.rotation.z = 0.30;
  ug.rotation.x = -0.10;
  ug.userData.tag = 'umbrella';
  scene.add(ug);
  PROP.umbrella = ug;

  // occasional drip from umbrella rim
  const drip = sph(0.018, new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.85 }), 0, 0, 0, 5, 4);
  scene.add(drip);
  PROP.drips.push({ mesh: drip, period: 3.2, phase: 0.4, x: -4.0, z: 9.55, y0: 1.0 });

  // a small puddle under the umbrella handled by water.js; add wet sheen
  const sheen = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18), new THREE.MeshBasicMaterial({
    color: 0x8fb8b8, transparent: true, opacity: 0.16, depthWrite: false
  }));
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(-4.3, 0.022, 9.5);
  scene.add(sheen);
}

function buildWallDetails(scene) {
  const rust = toon(0x9a6547, { spec: 0.1, shine: 20, rim: 0.06 });
  // ladders
  function ladder(x, z, ry, top, bottom) {
    const g = new THREE.Group();
    const h = top - bottom;
    [-0.24, 0.24].forEach(dx => {
      g.add(cyl(0.025, 0.025, h, 5, rust, dx, bottom + h / 2, 0));
    });
    for (let i = 0; i < Math.floor(h / 0.30); i++) {
      const y = bottom + 0.18 + i * 0.30;
      const rung = cyl(0.018, 0.018, 0.5, 4, rust, 0, y, 0);
      rung.rotation.z = Math.PI / 2;
      g.add(rung);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
    return g;
  }
  ladder(-11.93, 1.6, Math.PI / 2, 0.9, -2.2);
  ladder(7.93, 6.0, -Math.PI / 2, 0.7, -1.9);

  // mooring rings along the walls
  const ringGeo = new THREE.TorusGeometry(0.13, 0.025, 5, 12);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, rust);
    m.position.set(-11.94, -0.25, 5.0 - i * 4.6);
    m.rotation.y = Math.PI / 2;
    scene.add(m);
  }
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ringGeo, rust);
    m.position.set(-9.0 + i * 4.6, -0.25, 7.94);
    scene.add(m);
  }

  // tyres hanging on the quay wall
  const tyreGeo = new THREE.TorusGeometry(0.34, 0.12, 7, 14);
  [[-7.2, 7.93], [-6.3, 7.93], [5.2, 7.93], [-11.93, -2.0]].forEach((p, i) => {
    const m = new THREE.Mesh(tyreGeo, MAT.black);
    if (i < 3) { m.position.set(p[0], -0.25, p[1]); }
    else { m.position.set(p[0], -0.25, p[1]); m.rotation.y = Math.PI / 2; }
    m.castShadow = true;
    scene.add(m);
    const rope = cyl(0.012, 0.012, 0.5, 4, MAT.rope, m.position.x, 0.22, m.position.z + (i < 3 ? -0.02 : 0));
    scene.add(rope);
  });

  // rusty ladder rungs detail / wall stains already in texture
}

function buildLooseProps(scene) {
  const r = mulberry32(941);
  // bucket
  const bucket = new THREE.Group();
  const b = cyl(0.20, 0.15, 0.32, 12, toon(0x9aa8a4, { spec: 0.45, shine: 70, rim: 0.2 }), 0, 0.16, 0);
  bucket.add(b);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.012, 4, 12, Math.PI), MAT.metal);
  handle.position.y = 0.33;
  bucket.add(handle);
  bucket.position.set(-12.0, 0.02, 14.9);
  scene.add(bucket);

  // long-handled net leaning on the warehouse wall
  const net = new THREE.Group();
  const pole = cyl(0.018, 0.022, 2.2, 5, MAT.woodDark, 0, 1.1, 0);
  net.add(pole);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 4, 14), MAT.metal);
  hoop.position.y = 2.15;
  hoop.rotation.x = 0.3;
  net.add(hoop);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({
    map: TEX.net || (TEX.net = texNet()), transparent: true, opacity: 0.55, side: THREE.DoubleSide, alphaTest: 0.05, color: 0xcfd4c2
  }));
  bag.scale.set(1, 1.5, 1);
  bag.rotation.x = Math.PI;
  bag.position.y = 1.95;
  net.add(bag);
  net.position.set(-12.05, 0.02, 16.2);
  net.rotation.z = 0.20;
  net.rotation.x = -0.1;
  scene.add(net);

  // fish baskets / small blue crates near the ramp
  const crateGeo = new THREE.BoxGeometry(0.62, 0.3, 0.44);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(crateGeo, i % 2 ? MAT.fishBoxBlue : MAT.fishBox);
    m.position.set(5.0 + (r() - 0.5) * 1.2, 0.17 + (i > 2 ? 0.31 : 0), 9.2 + (r() - 0.5) * 0.9);
    m.rotation.y = r() * 0.6;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  // coiled hose / rope on the quay
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.28 - i * 0.03, 0.022, 4, 14), MAT.rope);
    t.rotation.x = Math.PI / 2;
    t.position.set(2.6, 0.04 + i * 0.03, 10.6);
    scene.add(t);
  }

  // small wooden pallet
  const pal = new THREE.Group();
  for (let i = 0; i < 4; i++) pal.add(box(1.1, 0.04, 0.16, MAT.woodDark, 0, 0.12, -0.3 + i * 0.2));
  pal.add(box(1.1, 0.06, 0.08, MAT.woodDark, 0, 0.06, -0.3));
  pal.add(box(1.1, 0.06, 0.08, MAT.woodDark, 0, 0.06, 0.3));
  pal.position.set(-8.6, 0.0, 17.6);
  pal.rotation.y = 0.4;
  scene.add(pal);

  // buoys hanging on the net rack handled above
  // faded paint marks on the quay
  const markMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d0, transparent: true, opacity: 0.20, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.10), markMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = 0.1;
    m.position.set(-2.4 + i * 0.1, 0.024, 12.0 + i * 0.5);
    scene.add(m);
  }
}

function updateProps(t, wind) {
  // windsock
  if (PROP.windsock) {
    const w = 0.25 + windAt(t - 0.4) * 0.9;
    PROP.windsock.rotation.z = -0.15 - w * 0.35 + Math.sin(t * 2.2) * 0.05 * w;
    PROP.windsock.rotation.y = Math.sin(t * 1.4) * 0.12 * w;
    PROP.windsock.scale.set(1, 1, 1);
  }
  // flags
  PROP.flags.forEach(f => {
    const w = 0.3 + windAt(t - 0.25 - f.phase * 0.05) * 1.0;
    f.mesh.rotation.y = f.baseRot + Math.sin(t * 3.0 + f.phase) * 0.35 * w;
    f.mesh.rotation.z = Math.sin(t * 4.2 + f.phase) * 0.12 * w;
  });
  // umbrella drips
  PROP.drips.forEach(d => {
    const p = ((t + d.phase) % d.period) / d.period;
    if (p < 0.22) {
      d.mesh.visible = true;
      const k = p / 0.22;
      d.mesh.position.set(d.x, d.y0 - k * k * 1.1, d.z);
      d.mesh.scale.setScalar(1 - k * 0.4);
    } else {
      d.mesh.visible = false;
    }
  });
  // net sway
  if (PROP.netRack) {
    PROP.netRack.rotation.z = Math.sin(t * 0.8) * 0.0015 * (0.4 + windAt(t - 0.8));
  }
  if (PROP.netMeshes) {
    const w = 0.3 + windAt(t - 0.7) * 0.9;
    PROP.netMeshes.forEach((m, i) => {
      m.rotation.z = Math.sin(t * 1.05 + i * 1.3) * 0.035 * w;
      m.rotation.x = (i === 0 ? -0.12 : 0) + Math.sin(t * 0.8 + i) * 0.02 * w;
    });
  }
}