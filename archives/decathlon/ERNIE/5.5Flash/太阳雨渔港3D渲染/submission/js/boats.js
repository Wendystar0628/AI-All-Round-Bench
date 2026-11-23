// ---------- boats with detailed wheelhouses ----------
const BOATS = { list: [], hero: null, wake: null };

function texRadar() {
  return canvasTexture(192, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0b1d14'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,255,150,0.28)'; ctx.lineWidth = 1;
    for (let r = 14; r < 70; r += 14) {
      ctx.beginPath(); ctx.arc(w / 2, h * 0.55, r, 0, TAU); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(w / 2, 8); ctx.lineTo(w / 2, h - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, h * 0.55); ctx.lineTo(w - 8, h * 0.55); ctx.stroke();
    const r = mulberry32(701);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, rad = r() * 55;
      const x = w / 2 + Math.cos(a) * rad, y = h * 0.55 + Math.sin(a) * rad;
      ctx.fillStyle = 'rgba(140,255,170,0.85)';
      ctx.beginPath(); ctx.arc(x, y, 1.6 + r() * 1.6, 0, TAU); ctx.fill();
    }
    // sweep
    const g = ctx.createLinearGradient(w / 2, h * 0.55, w / 2 + 70, h * 0.55 - 40);
    g.addColorStop(0, 'rgba(120,255,160,0.30)');
    g.addColorStop(1, 'rgba(120,255,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(w / 2, h * 0.55); ctx.arc(w / 2, h * 0.55, 70, -0.6, 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,255,190,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }, { clamp: true });
}

function texFishFinder() {
  return canvasTexture(160, 112, (ctx, w, h) => {
    ctx.fillStyle = '#082430'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,220,255,0.25)';
    for (let y = 10; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const r = mulberry32(703);
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = h * 0.35 + r() * h * 0.55;
      ctx.fillStyle = `rgba(${90 + r() * 80 | 0},${200 + r() * 55 | 0},${220 + r() * 35 | 0},${0.35 + r() * 0.5})`;
      ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 5, 1 + r() * 2, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,240,255,0.8)';
    ctx.fillRect(w - 46, 8, 38, 14);
    ctx.fillStyle = '#082430'; ctx.font = 'bold 10px monospace';
    ctx.fillText('12.4m', w - 42, 19);
    ctx.strokeStyle = 'rgba(160,240,255,0.6)'; ctx.strokeRect(2, 2, w - 4, h - 4);
  }, { clamp: true });
}

function texChart() {
  return canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#e9e4cf'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,140,140,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = 30 + i * 22 + Math.sin(x * 0.05 + i) * 6 + Math.sin(x * 0.13 + i * 2) * 3;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(180,90,70,0.55)';
    ctx.beginPath(); ctx.moveTo(20, h - 20);
    ctx.bezierCurveTo(80, 80, 150, 150, 220, 40); ctx.stroke();
    ctx.fillStyle = 'rgba(60,80,84,0.75)'; ctx.font = '10px monospace';
    ctx.fillText('HINAGI', 12, 18);
    ctx.fillText('5', 40, 60); ctx.fillText('12', 120, 100); ctx.fillText('8', 190, 140);
    ctx.strokeStyle = 'rgba(80,100,100,0.5)'; ctx.strokeRect(4, 4, w - 8, h - 8);
  }, { clamp: true });
}

function hullGeometry(L, B, D) {
  const NS = 18, NC = 12;
  const halfBeam = t => Math.max(0.035, B / 2 * (0.70 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - 0.94 * Math.pow(t, 3.4)));
  const sheer = t => 0.52 + 0.20 * t * t;
  const keel = t => -D + 0.45 * t * t;
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, hb = halfBeam(t), sy = sheer(t), ky = keel(t);
    for (let j = 0; j <= NC; j++) {
      const s = j / NC;
      const x = -hb * Math.cos(Math.PI * s);
      const y = sy - (sy - ky) * Math.pow(Math.sin(Math.PI * s), 0.62);
      pos.push(x, y, -L / 2 + t * L);
    }
  }
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NC; j++) {
      const a = i * (NC + 1) + j, b = a + 1, c = a + NC + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, halfBeam, sheer, keel };
}

function deckGeometry(L, B, D) {
  const NS = 18;
  const hb = t => Math.max(0.035, B / 2 * (0.70 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - 0.94 * Math.pow(t, 3.4)));
  const sy = t => 0.52 + 0.20 * t * t;
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, w = hb(t), y = sy(t) + 0.015;
    pos.push(-w, y, -L / 2 + t * L, 0, y + 0.055, -L / 2 + t * L, w, y, -L / 2 + t * L);
  }
  for (let i = 0; i < NS; i++) {
    const a = i * 3, b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildWheelhouse(g, opts, deckY, cabinZ, BW, BD, CH) {
  const white = toon(0xf3f4ed, { spec: 0.26, shine: 52, rim: 0.18 });
  const whiteIn = toon(0xe7e9df, { spec: 0.08, rim: 0.08 });
  const frame = toon(0xdfe3da, { spec: 0.22, shine: 40, rim: 0.12 });
  const dark = toon(0x3c4a4e, { spec: 0.2, rim: 0.08 });
  const cx = 0, cz = cabinZ;
  const y0 = deckY;
  const baseH = CH * 0.58;
  const glassH = CH * 0.42;

  // hollow base with a full-height doorway on the starboard side
  const doorW = 0.76;
  const doorZ = cz - 0.06;
  const doorZ0 = doorZ - doorW / 2, doorZ1 = doorZ + doorW / 2;
  const wallT = 0.07;
  function baseWall(w, d, x, z) {
    const m = box(w, baseH, d, white, x, y0 + baseH / 2, z);
    m.castShadow = true; m.receiveShadow = true; g.add(m);
    addOutline(m, 0.018);
  }
  baseWall(BW, wallT, cx, cz + BD / 2 - wallT / 2);
  baseWall(BW, wallT, cx, cz - BD / 2 + wallT / 2);
  baseWall(wallT, BD - wallT * 2, cx - BW / 2 + wallT / 2, cz);
  const sA0 = cz - BD / 2 + wallT, sA1 = doorZ0;
  const sB0 = doorZ1, sB1 = cz + BD / 2 - wallT;
  if (sA1 - sA0 > 0.02) baseWall(wallT, sA1 - sA0, cx + BW / 2 - wallT / 2, (sA0 + sA1) / 2);
  if (sB1 - sB0 > 0.02) baseWall(wallT, sB1 - sB0, cx + BW / 2 - wallT / 2, (sB0 + sB1) / 2);
  // interior floor + back wall
  g.add(box(BW - 0.16, 0.04, BD - 0.16, toon(0xb9b09a, { map: TEX.wood, spec: 0.15 }), cx, y0 + 0.05, cz));
  g.add(box(BW - 0.14, CH - 0.10, 0.04, whiteIn, cx, y0 + CH / 2, cz - BD / 2 + 0.075));

  // window band: 4 sides with frames
  const y1 = y0 + baseH, y2 = y0 + CH;
  const glassY = (y1 + y2) / 2;
  const gh = glassH - 0.10;
  // front (+z)
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.16, gh), MAT.glass);
  gf.position.set(cx, glassY, cz + BD / 2 - 0.03);
  gf.renderOrder = 8; g.add(gf);
  // back (-z)
  const gb = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.16, gh), MAT.glass);
  gb.position.set(cx, glassY, cz - BD / 2 + 0.03); gb.rotation.y = Math.PI;
  gb.renderOrder = 8; g.add(gb);
  // port (-x)
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(BD - 0.14, gh), MAT.glass);
  gp.rotation.y = -Math.PI / 2; gp.position.set(cx - BW / 2 + 0.03, glassY, cz);
  gp.renderOrder = 8; g.add(gp);
  // starboard (+x) two panes flanking the full-height doorway
  const sideA = Math.max(0.12, doorZ0 - (cz - BD / 2 + 0.06));
  const sideB = Math.max(0.12, (cz + BD / 2 - 0.06) - doorZ1);
  const gs1 = new THREE.Mesh(new THREE.PlaneGeometry(sideA, gh), MAT.glass);
  gs1.rotation.y = Math.PI / 2; gs1.position.set(cx + BW / 2 - 0.03, glassY, (cz - BD / 2 + 0.06 + doorZ0) / 2);
  gs1.renderOrder = 8; g.add(gs1);
  const gs2 = new THREE.Mesh(new THREE.PlaneGeometry(sideB, gh), MAT.glass);
  gs2.rotation.y = Math.PI / 2; gs2.position.set(cx + BW / 2 - 0.03, glassY, (doorZ1 + cz + BD / 2 - 0.06) / 2);
  gs2.renderOrder = 8; g.add(gs2);

  // frame posts
  const post = 0.055;
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(p => {
    g.add(box(post, CH, post, frame, cx + p[0] * (BW / 2 - 0.02), y0 + CH / 2, cz + p[1] * (BD / 2 - 0.02)));
  });
  // doorway posts (full height) and top rail
  [doorZ0, doorZ1].forEach(z => {
    g.add(box(post, CH, post, frame, cx + BW / 2 - 0.02, y0 + CH / 2, z));
  });
  g.add(box(0.07, 0.07, doorW + 0.12, frame, cx + BW / 2 - 0.02, y2 - 0.03, doorZ));
  // rails
  g.add(box(BW + 0.04, 0.06, 0.07, frame, cx, y1, cz + BD / 2 - 0.02));
  g.add(box(BW + 0.04, 0.06, 0.07, frame, cx, y1, cz - BD / 2 + 0.02));
  g.add(box(0.07, 0.06, BD, frame, cx - BW / 2 + 0.02, y1, cz));
  g.add(box(0.07, 0.06, sideA, frame, cx + BW / 2 - 0.02, y1, (cz - BD / 2 + 0.06 + doorZ0) / 2));
  g.add(box(0.07, 0.06, sideB, frame, cx + BW / 2 - 0.02, y1, (doorZ1 + cz + BD / 2 - 0.06) / 2));

  // open door: frame + glass + kick panel, hinged at the forward edge
  const door = new THREE.Group();
  const dw = doorW - 0.05, dh = CH - 0.10, dcz = -dw / 2;
  door.add(box(dw, 0.06, 0.045, frame, 0, dh / 2, dcz));
  door.add(box(dw, 0.06, 0.045, frame, 0, -dh / 2, dcz));
  door.add(box(0.06, dh, 0.045, frame, -dw / 2, 0, dcz));
  door.add(box(0.06, dh, 0.045, frame, dw / 2, 0, dcz));
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.13, dh - 0.14), MAT.glass);
  dg.position.set(0, 0.02, dcz + 0.026);
  dg.renderOrder = 8;
  door.add(dg);
  door.add(box(dw - 0.09, 0.30, 0.04, white, 0, -dh / 2 + 0.19, dcz));
  door.position.set(cx + BW / 2 - 0.02, y0 + CH / 2, doorZ1);
  door.rotation.y = -2.05;
  g.add(door);

  // roof
  const roof = box(BW + 0.34, 0.13, BD + 0.34, white, cx, y2 + 0.06, cz);
  roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  addOutline(roof, 0.02);
  // water shimmer on the cabin ceiling
  const causMat = new THREE.MeshBasicMaterial({
    map: TEX.caustic, transparent: true, opacity: 0.20, color: 0xffefc4,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const caus = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.2, BD - 0.2), causMat);
  caus.rotation.x = Math.PI / 2;
  caus.position.set(cx, y2 - 0.028, cz);
  caus.renderOrder = 4;
  g.add(caus);
  g.add(box(BW + 0.36, 0.05, 0.08, frame, cx, y2 - 0.02, cz + BD / 2 + 0.15));

  // ---- interior ----
  const iy = y0 + 0.09;
  const frontZ = cz + BD / 2 - 0.30;
  // console
  const con = box(BW - 0.5, 0.52, 0.42, toon(0xb9c6c2, { spec: 0.18 }), cx, iy + 0.55, frontZ - 0.12);
  con.castShadow = true; g.add(con);
  const conTop = box(BW - 0.46, 0.05, 0.46, toon(0x8fa09c, { spec: 0.3, shine: 60 }), cx, iy + 0.83, frontZ - 0.10);
  conTop.rotation.x = -0.12;
  g.add(conTop);

  // steering wheel
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 6, 18), toon(0x5d4a38, { spec: 0.2, rim: 0.1 }));
  wheel.add(rim);
  for (let i = 0; i < 3; i++) {
    const sp = box(0.34, 0.022, 0.022, MAT.woodDark, 0, 0, 0);
    sp.rotation.z = i * Math.PI / 3;
    wheel.add(sp);
  }
  const hub = cyl(0.045, 0.045, 0.05, 8, MAT.metal, 0, 0, 0);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  wheel.position.set(cx + 0.40, iy + 1.04, 0.30);
  wheel.rotation.x = -0.22;
  wheel.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(wheel);
  // wheel column
  const col = cyl(0.035, 0.045, 0.55, 6, MAT.darkMetal, cx + 0.40, iy + 0.78, 0.24);
  col.rotation.x = 0.5;
  g.add(col);

  // screens
  const radarTex = TEX.radar || (TEX.radar = texRadar());
  const ffTex = TEX.ff || (TEX.ff = texFishFinder());
  const chartTex = TEX.chart || (TEX.chart = texChart());
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.25), new THREE.MeshBasicMaterial({ map: radarTex, side: THREE.DoubleSide }));
  scr.position.set(cx - 0.18, iy + 1.02, frontZ - 0.06);
  scr.rotation.x = -1.15;
  g.add(scr);
  const scrGlow = makeGlow(0x7dffb0, 0.9, 0.20);
  scrGlow.position.set(cx - 0.18, iy + 1.04, frontZ - 0.08);
  g.add(scrGlow);
  const ff = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.19), new THREE.MeshBasicMaterial({ map: ffTex, side: THREE.DoubleSide }));
  ff.position.set(cx - 0.66, iy + 1.02, frontZ - 0.08);
  ff.rotation.x = -1.15;
  g.add(ff);
  const ffGlow = makeGlow(0x8fdcff, 0.7, 0.16);
  ffGlow.position.set(cx - 0.66, iy + 1.04, frontZ - 0.10);
  g.add(ffGlow);

  // chart on a small board
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), new THREE.MeshBasicMaterial({ map: chartTex, side: THREE.DoubleSide }));
  chart.position.set(cx + 0.62, iy + 0.98, frontZ - 0.08);
  chart.rotation.x = -1.0;
  g.add(chart);
  g.add(box(0.66, 0.02, 0.48, MAT.woodDark, cx + 0.62, iy + 0.94, frontZ - 0.06));
  const tide = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.21), new THREE.MeshBasicMaterial({ map: TEX.tidetable, side: THREE.DoubleSide }));
  tide.position.set(cx + 0.30, iy + 0.96, frontZ + 0.02);
  tide.rotation.x = -1.05;
  g.add(tide);

  // thermos + cup on shelf
  const shelf = box(0.7, 0.04, 0.3, MAT.woodDark, cx + 0.95, iy + 0.72, cz - BD / 2 + 0.32);
  g.add(shelf);
  const therm = cyl(0.065, 0.07, 0.28, 10, toon(0xc9d2cf, { spec: 0.55, shine: 90, rim: 0.25 }), cx + 0.95, iy + 0.88, cz - BD / 2 + 0.32);
  g.add(therm);
  g.add(cyl(0.068, 0.068, 0.03, 10, MAT.red, cx + 0.95, iy + 1.03, cz - BD / 2 + 0.32));
  const cup = cyl(0.055, 0.048, 0.09, 10, toon(0xf1eee1, { spec: 0.35, shine: 60 }), cx + 0.70, iy + 0.80, cz - BD / 2 + 0.34);
  g.add(cup);

  // hanging yellow raincoat
  const coat = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.62, 8, 1, true), toon(0xe0b83f, { spec: 0.18, side: THREE.DoubleSide }));
  body.position.y = -0.22;
  coat.add(body);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toon(0xe0b83f, { spec: 0.18 }));
  hood.position.y = 0.12;
  coat.add(hood);
  coat.position.set(cx + 0.52, iy + 1.16, cz - BD / 2 + 0.16);
  g.add(coat);
  g.add(box(0.02, 0.12, 0.02, MAT.metal, cx + 0.52, iy + 1.42, cz - BD / 2 + 0.14));

  // amulet + photo on the starboard window frame
  const amulet = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13), new THREE.MeshBasicMaterial({ color: 0xd8d3bd, side: THREE.DoubleSide }));
  amulet.position.set(cx + BW / 2 - 0.055, glassY + 0.02, cz + 0.38);
  amulet.rotation.y = -Math.PI / 2;
  g.add(amulet);
  g.add(box(0.01, 0.05, 0.02, MAT.red, cx + BW / 2 - 0.06, glassY + 0.08, cz + 0.38));
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.10), new THREE.MeshBasicMaterial({ map: TEX.photo, side: THREE.DoubleSide }));
  photo.position.set(cx + BW / 2 - 0.055, glassY + 0.03, cz + 0.62);
  photo.rotation.y = -Math.PI / 2;
  g.add(photo);

  // warm sun patch on the cabin floor
  const sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.3, BD - 0.3), new THREE.MeshBasicMaterial({
    color: 0xffe8b8, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sunPatch.rotation.x = -Math.PI / 2;
  sunPatch.position.set(cx, iy + 0.07, cz);
  g.add(sunPatch);

  // small warm interior light
  const pl = new THREE.PointLight(0xffe4b8, 0.22, 4.5, 2);
  pl.position.set(cx, iy + 1.35, cz);
  g.add(pl);

  return { y0, CH, BW, BD, roofY: y2 };
}

function buildMast(g, y, z, scale) {
  const s = scale || 1;
  const metal = MAT.metal;
  const mast = cyl(0.035 * s, 0.045 * s, 1.7 * s, 6, metal, 0, y + 0.85 * s, z);
  mast.castShadow = true;
  g.add(mast);
  const cross = cyl(0.022 * s, 0.022 * s, 1.2 * s, 5, metal, 0, y + 1.35 * s, z);
  cross.rotation.z = Math.PI / 2;
  g.add(cross);
  const ant = cyl(0.008, 0.012, 1.1 * s, 4, MAT.darkMetal, 0.25 * s, y + 1.9 * s, z);
  g.add(ant);
  // radar dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.20 * s, 12, 8, 0, TAU, 0, Math.PI / 2), toon(0xeef0e8, { spec: 0.3, shine: 60, rim: 0.2 }));
  dome.position.set(-0.15 * s, y + 0.02, z + 0.35 * s);
  g.add(dome);
  g.add(cyl(0.20 * s, 0.20 * s, 0.08, 12, MAT.white, -0.15 * s, y - 0.02, z + 0.35 * s));
  // horn
  const horn = cyl(0.03, 0.06, 0.30, 8, MAT.metal, 0.30 * s, y + 0.28, z + 0.1);
  horn.rotation.z = Math.PI / 2;
  g.add(horn);
  // nav lights
  const redL = sph(0.035, new THREE.MeshBasicMaterial({ color: 0xff5a4a }), -0.55 * s, y + 0.55 * s, z + 0.1, 6, 5);
  const grnL = sph(0.035, new THREE.MeshBasicMaterial({ color: 0x6dffa0 }), 0.55 * s, y + 0.55 * s, z + 0.1, 6, 5);
  g.add(redL); g.add(grnL);
  g.add(box(1.1 * s, 0.02, 0.02, metal, 0, y + 0.55 * s, z + 0.1));
}

function addFenders(g, L, B, deckY) {
  const tyre = new THREE.TorusGeometry(0.30, 0.105, 7, 14);
  const zs = [-L * 0.28, 0, L * 0.28];
  [-1, 1].forEach(side => {
    zs.forEach((z, i) => {
      const m = new THREE.Mesh(tyre, MAT.black);
      m.position.set(side * (B / 2 + 0.06), 0.06 - (i === 1 ? 0.03 : 0), z);
      m.rotation.y = Math.PI / 2;
      m.rotation.z = 0.08 * side;
      m.castShadow = true;
      g.add(m);
      const rope = cyl(0.012, 0.012, 0.35, 4, MAT.rope, side * (B / 2 + 0.02), 0.33, z);
      rope.rotation.z = side * 0.12;
      g.add(rope);
    });
  });
}

function addLifeRing(g, x, y, z, ry) {
  const grp = new THREE.Group();
  const orange = toon(0xe8843f, { spec: 0.22, shine: 40, rim: 0.14 });
  const white = toon(0xf4f2e8, { spec: 0.2, rim: 0.14 });
  const base = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.075, 7, 18), orange);
  grp.add(base);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.078, 7, 6, Math.PI / 5), white);
    seg.rotation.z = i * Math.PI / 2 + 0.2;
    grp.add(seg);
  }
  grp.position.set(x, y, z);
  grp.rotation.y = ry || 0;
  g.add(grp);
}

function createBoat(opts) {
  const L = opts.L, B = opts.B, D = opts.D || 1.15;
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const { geo, halfBeam, sheer } = hullGeometry(L, B, D);
  const hullMat = toon(opts.color || 0xf2f3ec, { spec: 0.26, shine: 50, rim: 0.18 });
  const hull = new THREE.Mesh(geo, hullMat);
  hull.castShadow = true; hull.receiveShadow = true;
  g.add(hull);
  addOutline(hull, 0.022);

  // deck
  const deckMat = opts.deckWood ? toon(0xb9a179, { map: cloneRepeat(TEX.wood, 2, 3), spec: 0.18, rim: 0.10 }) : toon(0xe8e9e0, { spec: 0.24, shine: 46, rim: 0.14 });
  const deck = new THREE.Mesh(deckGeometry(L, B, D), deckMat);
  deck.receiveShadow = true;
  g.add(deck);

  // bulwark + cap rail
  const bulMat = toon(opts.color || 0xf2f3ec, { spec: 0.2, shine: 40, rim: 0.14 });
  const NS = 18;
  const bpos = [], bidx = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, hb = halfBeam(t) * 0.995, sy = sheer(t) + 0.02;
    bpos.push(-hb, sy, -L / 2 + t * L, -hb, sy + 0.26, -L / 2 + t * L);
    bpos.push(hb, sy, -L / 2 + t * L, hb, sy + 0.26, -L / 2 + t * L);
  }
  for (let i = 0; i < NS; i++) {
    const a = i * 4, b = a + 4;
    bidx.push(a, b, a + 1, a + 1, b, b + 1);
    bidx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bg.setIndex(bidx);
  bg.computeVertexNormals();
  const bul = new THREE.Mesh(bg, bulMat);
  bul.material.side = THREE.DoubleSide;
  bul.castShadow = true; bul.receiveShadow = true;
  g.add(bul);
  // cap rail tubes
  [-1, 1].forEach(side => {
    const pts = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      pts.push(new THREE.Vector3(side * halfBeam(t) * 0.995, sheer(t) + 0.285, -L / 2 + t * L));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.032, 5, false), toon(0xd9ded6, { spec: 0.3, shine: 60, rim: 0.16 }));
    tube.castShadow = true;
    g.add(tube);
  });

  // transom
  const transom = box(B * 0.70, D + 0.45, 0.10, hullMat, 0, -D / 2 + 0.35, -L / 2 + 0.02);
  transom.castShadow = true;
  g.add(transom);

  let deckY = 0.55;
  let cabinZ = L * 0.06;
  let cabinInfo = null;
  if (opts.cabin === 'full' || opts.cabin === 'small') {
    const BW = B * (opts.cabin === 'full' ? 0.74 : 0.68);
    const BD = L * (opts.cabin === 'full' ? 0.27 : 0.24);
    const CH = opts.cabin === 'full' ? 1.62 : 1.42;
    cabinZ = L * (opts.cabin === 'full' ? 0.05 : 0.03);
    deckY = sheer(cabinZ / L + 0.5) + 0.03;
    cabinInfo = buildWheelhouse(g, opts, deckY, cabinZ, BW, BD, CH);
    buildMast(g, cabinInfo.roofY + 0.06, cabinZ - BD * 0.2, opts.cabin === 'full' ? 1.0 : 0.82);
  } else if (opts.cabin === 'center') {
    const BW = B * 0.62, BD = L * 0.22, CH = 1.35;
    cabinZ = L * 0.02;
    deckY = sheer(0.52) + 0.03;
    cabinInfo = buildWheelhouse(g, opts, deckY, cabinZ, BW, BD, CH);
    buildMast(g, cabinInfo.roofY + 0.04, cabinZ - BD * 0.2, 0.8);
    // T-top
    const top = box(BW + 1.0, 0.08, BD + 1.0, toon(0xe9ece4, { spec: 0.2 }), 0, cabinInfo.roofY + 1.25, cabinZ + 0.2);
    g.add(top);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(p => {
      g.add(cyl(0.025, 0.025, 1.2, 5, MAT.metal, p[0] * (BW / 2 + 0.4), cabinInfo.roofY + 0.65, cabinZ + 0.2 + p[1] * (BD / 2 + 0.4)));
    });
    // fighting chair
    g.add(cyl(0.05, 0.07, 0.5, 6, MAT.metal, 0, 0.85, -L * 0.25));
    g.add(box(0.5, 0.12, 0.5, toon(0xd8d9cf, { spec: 0.2 }), 0, 1.12, -L * 0.25));
    g.add(box(0.5, 0.55, 0.12, toon(0xd8d9cf, { spec: 0.2 }), 0, 1.38, -L * 0.34));
  } else {
    // open boat
    for (let i = 0; i < 3; i++) {
      const z = -L * 0.22 + i * L * 0.22;
      const w = halfBeam(z / L + 0.5) * 1.7;
      g.add(box(Math.max(0.5, w), 0.07, 0.30, toon(0xb99a70, { map: TEX.wood }), 0, 0.48, z));
    }
    // outboard
    g.add(box(0.34, 0.5, 0.30, toon(0x3c4a4e, { spec: 0.3 }), 0, 0.25, -L / 2 - 0.12));
    g.add(cyl(0.05, 0.05, 0.7, 6, MAT.darkMetal, 0, -0.25, -L / 2 - 0.18));
  }

  addFenders(g, L, B, deckY);

  // bow rail for bigger boats
  if (L > 6) {
    const railMat = MAT.metal;
    const z0 = L * 0.28, z1 = L * 0.48;
    [-1, 1].forEach(side => {
      const x = side * B * 0.26;
      const p0 = new THREE.Vector3(x * 0.9, 0.95, z0);
      const p1 = new THREE.Vector3(x * 0.55, 1.02, z1);
      const curve = new THREE.CatmullRomCurve3([p0, p1]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.018, 4, false), railMat);
      g.add(tube);
      g.add(cyl(0.016, 0.016, 0.42, 4, railMat, p0.x, 0.76, p0.z));
      g.add(cyl(0.016, 0.016, 0.46, 4, railMat, p1.x, 0.79, p1.z));
    });
  }

  // cleats
  [[-1, L * 0.40], [1, L * 0.40], [-1, -L * 0.40], [1, -L * 0.40]].forEach(c => {
    g.add(box(0.20, 0.06, 0.07, MAT.metal, c[0] * B * 0.28, 0.66, c[1]));
  });

  // name board on the bow
  const hbAt = t => Math.max(0.03, B / 2 * (0.70 + 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - 0.94 * Math.pow(t, 3.4)));
  if (opts.name) {
    const tex = TEX['bn_' + opts.name] || (TEX['bn_' + opts.name] = texBoatName(opts.name));
    const nx = hbAt(0.70) * 0.97;
    [-1, 1].forEach(side => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.30), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      m.position.set(side * nx, 0.28, L * 0.20);
      m.rotation.y = side * Math.PI / 2;
      g.add(m);
    });
  }

  // life ring
  if (opts.lifeRing !== false) {
    const ringX = cabinInfo ? cabinInfo.BW / 2 + 0.10 : B * 0.45;
    addLifeRing(g, ringX, cabinInfo ? 1.05 : 0.85, -L * 0.03, Math.PI / 2);
  }

  // registration number on bow
  if (opts.number) {
    const tex = TEX['num_' + opts.number] || (TEX['num_' + opts.number] = (function (n) {
      return canvasTexture(128, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(70,86,90,0.9)';
        ctx.font = 'bold 40px "DejaVu Sans Mono",monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n, w / 2, h / 2);
      }, { clamp: true });
    })(opts.number));
    const nx2 = hbAt(0.90) * 0.92;
    [-1, 1].forEach(side => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      m.position.set(side * nx2, 0.40, L * 0.40);
      m.rotation.y = side * Math.PI / 2;
      m.rotation.x = -0.1;
      g.add(m);
    });
  }

  // rust streaks near the waterline
  [[0.34, 0.02], [0.55, -0.10], [0.78, 0.05]].forEach((rs, i) => {
    const hb = hbAt(rs[0]);
    [-1, 1].forEach(side => {
      const m = box(0.025, 0.30 + (i % 2) * 0.12, 0.11 + (i % 2) * 0.05, MAT.rust,
        side * (hb * 0.72), -0.28 + rs[1], -L / 2 + rs[0] * L);
      m.rotation.z = side * 0.04;
      g.add(m);
    });
  });

  // sunshade frame over the aft deck of the wheelhouse boat
  if (opts.cabin === 'full') {
    const postH = 1.85;
    const zA = -L * 0.30, zB = -L * 0.42;
    [[-1, zA], [1, zA], [-1, zB], [1, zB]].forEach(p => {
      const post = cyl(0.025, 0.025, postH, 5, MAT.metal, p[0] * B * 0.38, deckY + postH / 2, p[1]);
      post.castShadow = true;
      g.add(post);
    });
    g.add(box(B * 0.80, 0.035, 0.035, MAT.metal, 0, deckY + postH, zA));
    g.add(box(B * 0.80, 0.035, 0.035, MAT.metal, 0, deckY + postH, zB));
    g.add(box(0.035, 0.035, Math.abs(zB - zA), MAT.metal, -B * 0.38, deckY + postH, (zA + zB) / 2));
    g.add(box(0.035, 0.035, Math.abs(zB - zA), MAT.metal, B * 0.38, deckY + postH, (zA + zB) / 2));
  }

  g.userData.opts = opts;
  g.userData.tag = 'boat';
  g.userData.boatName = opts.name || '';
  g.userData.L = L; g.userData.B = B;
  return g;
}

function makeRope(p0, p1, sag, radius) {
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.CatmullRomCurve3([p0, mid, p1]);
  const geo = new THREE.TubeGeometry(curve, 16, radius || 0.035, 5, false);
  const m = new THREE.Mesh(geo, MAT.rope);
  m.castShadow = true;
  return m;
}

function initBoats(scene) {
  const defs = [
    {
      name: '日凪丸', number: '8', L: 8.6, B: 2.95, D: 1.25, cabin: 'full', color: 0xf4f5ee,
      pos: [-9.4, 3.05], heading: 0, hero: true, phase: 0.0, deckWood: false, lifeRing: true
    },
    {
      name: '第三丸', number: '3', L: 6.4, B: 2.25, D: 0.95, cabin: 'small', color: 0xf0f2ea,
      pos: [-3.9, 3.55], heading: 0.03, phase: 1.9, deckWood: true
    },
    {
      name: '青島', number: '12', L: 7.0, B: 2.5, D: 1.0, cabin: 'center', color: 0xf2f3ec,
      pos: [1.8, 3.75], heading: -0.02, phase: 3.4, deckWood: false
    },
    {
      name: '小鈴', number: '2', L: 4.9, B: 1.75, D: 0.7, cabin: 'none', color: 0xdfe8e2,
      pos: [-9.35, -7.2], heading: Math.PI, phase: 5.1, deckWood: true, lifeRing: false
    }
  ];

  defs.forEach(d => {
    const b = createBoat(d);
    b.position.set(d.pos[0], WATER_Y, d.pos[1]);
    b.rotation.y = d.heading;
    scene.add(b);
    const rec = {
      group: b, def: d, base: new THREE.Vector3(d.pos[0], WATER_Y, d.pos[1]),
      heading: d.heading, phase: d.phase, hero: !!d.hero, moving: false, u: 0
    };
    BOATS.list.push(rec);
    if (d.hero) BOATS.hero = rec;

    // shadow
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({
      color: 0x1e5b60, transparent: true, opacity: 0.17, depthWrite: false
    }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(d.B * 0.72, d.L * 0.46, 1);
    sh.position.set(d.pos[0], WATER_Y + 0.012, d.pos[1]);
    sh.renderOrder = 3;
    scene.add(sh);
    rec.shadow = sh;
  });

  // mooring ropes (static, world space)
  const ropes = new THREE.Group();
  const berthRopes = [
    [[-9.4, 0.75, 6.9], [-10.2, 0.55, 8.25]],
    [[-7.2, 0.72, 6.7], [-6.4, 0.5, 8.25]],
    [[-3.9, 0.75, 6.7], [-4.6, 0.5, 8.25]],
    [[-2.2, 0.72, 6.5], [-1.6, 0.5, 8.25]],
    [[1.8, 0.75, 6.9], [2.4, 0.5, 8.25]],
    [[3.6, 0.72, 6.6], [4.2, 0.5, 8.25]],
    [[-9.35, 0.72, -4.8], [-11.3, 0.5, -5.4]],
    [[-9.35, 0.72, -9.6], [-11.3, 0.5, -10.2]]
  ];
  const ropeGroup = new THREE.Group();
  berthRopes.forEach((r, i) => {
    const p0 = new THREE.Vector3(r[0][0], r[0][1], r[0][2]);
    const p1 = new THREE.Vector3(r[1][0], r[1][1], r[1][2]);
    const m = makeRope(p0, p1, 0.35 + (i % 2) * 0.1, 0.038);
    ropeGroup.add(m);
  });
  scene.add(ropeGroup);
  BOATS.ropes = ropeGroup;
  BOATS.berthRopes = berthRopes;

  // hero route
  const pts = [
    [-9.4, 3.0], [-9.0, -4.0], [-8.8, -12.0], [-8.2, -16.5], [-6.0, -18.5],
    [0.0, -19.0], [7.0, -18.5], [12.5, -17.5], [15.5, -14.0], [17.5, -9.0],
    [18.0, -2.0], [17.5, 4.0], [16.0, 8.5], [16.8, 11.5], [15.5, 6.0],
    [15.6, 0.0], [15.6, -7.0], [15.0, -14.0], [10.0, -17.0], [4.0, -18.0],
    [-2.0, -17.0], [-8.0, -13.5], [-8.8, -7.0]
  ].map(p => new THREE.Vector3(p[0], WATER_Y, p[1]));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.35);
  BOATS.curve = curve;
  BOATS.heroPause = 24;
  BOATS.heroTravel = 52;
  BOATS.cycle = 76;
  BOATS.curveLen = curve.getLength();

  // wake ribbon
  const segs = 46;
  const wpos = new Float32Array((segs + 1) * 2 * 3);
  const wuv = new Float32Array((segs + 1) * 2 * 2);
  const widx = [];
  for (let i = 0; i <= segs; i++) {
    wuv[i * 4] = 0; wuv[i * 4 + 1] = i / segs;
    wuv[i * 4 + 2] = 1; wuv[i * 4 + 3] = i / segs;
    if (i < segs) {
      const a = i * 2;
      widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wgeo.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
  wgeo.setIndex(widx);
  const wmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.55 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uOpacity;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        float edge = smoothstep(0.0,0.28,vUv.x) * smoothstep(1.0,0.72,vUv.x);
        float fade = pow(1.0-vUv.y, 1.5);
        float n = 0.65 + 0.35*hash(vec2(floor(vUv.y*40.0), floor(vUv.x*6.0)));
        float a = edge * fade * n * uOpacity;
        gl_FragColor = vec4(0.94,0.99,0.98, a);
      }`
  });
  const wake = new THREE.Mesh(wgeo, wmat);
  wake.frustumCulled = false;
  wake.renderOrder = 5;
  scene.add(wake);
  BOATS.wake = wake;
  BOATS.wakePos = wpos;
  BOATS.wakeSegs = segs;

  // a few mooring buoys
  const buoyMat = toon(0xe9e4d2, { spec: 0.2, shine: 40, rim: 0.12 });
  BOATS.buoys = [];
  [[-6.6, -0.35, -2.2], [5.4, -0.35, -6.4], [0.4, -0.35, -12.0], [-11.0, -0.35, -15.0]].forEach((b, i) => {
    const grp = new THREE.Group();
    const body = sph(0.32, buoyMat, 0, 0, 0, 10, 7);
    body.scale.y = 1.25;
    grp.add(body);
    grp.add(cyl(0.05, 0.05, 0.5, 5, MAT.rust, 0, 0.45, 0));
    const numTex = TEX['buoy' + i] || (TEX['buoy' + i] = texBuoyNumber(7 + i));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: numTex, transparent: true }));
    plate.position.set(0, 0.02, 0.31);
    grp.add(plate);
    grp.position.set(b[0], WATER_Y + 0.1, b[2]);
    scene.add(grp);
    BOATS.buoys.push({ group: grp, base: new THREE.Vector3(b[0], WATER_Y + 0.1, b[2]), phase: i * 1.7 });
  });

  // distant boats (silhouettes)
  const dr = mulberry32(801);
  for (let i = 0; i < 3; i++) {
    const b = createBoat({ L: 4.0 + dr() * 2, B: 1.5, D: 0.6, cabin: 'none', color: 0xe6ebe6, lifeRing: false });
    b.scale.setScalar(0.8);
    b.position.set(13.0 + dr() * 4.0, WATER_Y, -21.5 + dr() * 0.6);
    b.rotation.y = dr() * TAU;
    b.traverse(o => { if (o.isMesh) o.castShadow = false; });
    scene.add(b);
    b.userData.distantMove = (i === 0);
    BOATS.list.push({ group: b, def: {}, base: b.position.clone(), heading: b.rotation.y, phase: dr() * 6, hero: false, distant: true, moving: false });
  }
}

function updateBoats(t, wind) {
  const list = BOATS.list;
  let heroPos = null;

  // hero route
  const hero = BOATS.hero;
  if (hero) {
    const local = ((t % BOATS.cycle) + BOATS.cycle) % BOATS.cycle;
    let u = 0, moving = false;
    if (local > BOATS.heroPause) {
      u = clamp((local - BOATS.heroPause) / BOATS.heroTravel, 0, 1);
      moving = u < 0.999;
      if (u >= 1) u = 0;
    }
    hero.moving = moving;
    hero.u = u;
    if (u > 0.0005 || moving) {
      const p = BOATS.curve.getPointAt(u);
      const tan = BOATS.curve.getTangentAt(Math.min(0.9999, u));
      hero.group.position.set(p.x, WATER_Y + Math.sin(t * 0.9) * 0.03, p.z);
      const targetHeading = Math.atan2(tan.x, tan.z);
      hero.heading = targetHeading;
      hero.group.rotation.y = targetHeading;
      heroPos = p;
    } else {
      hero.group.position.set(hero.base.x, WATER_Y + Math.sin(t * 0.6 + hero.phase) * 0.03, hero.base.z);
      hero.group.rotation.y = hero.heading = 0;
      heroPos = hero.base;
    }
    // hide ropes while away
    if (BOATS.ropes) BOATS.ropes.visible = !moving || u < 0.02;
    // wake
    const wake = BOATS.wake;
    if (wake) {
      wake.visible = moving;
      if (moving) {
        const pos = BOATS.wakePos;
        const segs = BOATS.wakeSegs;
        const back = 0.012;
        for (let i = 0; i <= segs; i++) {
          const uu = u - i * back;
          let p, tan;
          if (uu >= 0) {
            p = BOATS.curve.getPointAt(uu);
            tan = BOATS.curve.getTangentAt(Math.min(0.9999, uu));
          } else {
            const uu2 = ((uu % 1) + 1) % 1;
            p = BOATS.curve.getPointAt(uu2);
            tan = BOATS.curve.getTangentAt(uu2);
          }
          const nx = tan.z, nz = -tan.x;
          const w = (0.9 + i * 0.055) * (0.7 + 0.3 * Math.sin(i * 0.7 + t));
          pos[i * 6] = p.x + nx * w;
          pos[i * 6 + 1] = WATER_Y + 0.025;
          pos[i * 6 + 2] = p.z + nz * w;
          pos[i * 6 + 3] = p.x - nx * w;
          pos[i * 6 + 4] = WATER_Y + 0.025;
          pos[i * 6 + 5] = p.z - nz * w;
        }
        wake.geometry.attributes.position.needsUpdate = true;
        wake.geometry.computeBoundingSphere();
      }
    }
  }

  list.forEach(b => {
    if (b.distant) {
      if (b.group.userData.distantMove) {
        const x = 4 + Math.sin(t * 0.055) * 12;
        const dir = Math.cos(t * 0.055) >= 0 ? 1 : -1;
        b.group.position.set(x, WATER_Y + Math.sin(t * 0.6 + b.phase) * 0.02, -21.4);
      } else {
        b.group.position.y = WATER_Y + Math.sin(t * 0.5 + b.phase) * 0.02;
      }
      b.group.rotation.y = (b.group.userData.distantMove ? (Math.cos(t * 0.055) >= 0 ? Math.PI / 2 : -Math.PI / 2) : b.heading);
      b.group.rotation.z = Math.sin(t * 0.45 + b.phase) * 0.008;
      return;
    }
    if (b.hero) {
      let wakeRoll = 0;
      if (heroPos && b.moving) {
        const d = Math.hypot(heroPos.x - b.group.position.x, heroPos.z - b.group.position.z);
        wakeRoll = Math.max(0, 1 - d / 14) * 0.02 * Math.sin(t * 2.2 + b.phase);
      }
      b.group.position.y = WATER_Y + Math.sin(t * 0.85 + b.phase) * 0.032 + Math.sin(t * 0.31) * 0.012;
      b.group.rotation.z = Math.sin(t * 0.62 + b.phase) * 0.010 + wakeRoll;
      b.group.rotation.x = Math.sin(t * 0.44 + b.phase * 1.3) * 0.007;
      if (b.shadow) {
        b.shadow.position.x = b.group.position.x;
        b.shadow.position.z = b.group.position.z;
        b.shadow.rotation.z = -b.group.rotation.y;
        b.shadow.material.opacity = 0.17;
      }
      return;
    }
    // moored boats
    let extra = 0;
    if (heroPos && BOATS.hero && BOATS.hero.moving) {
      const d = Math.hypot(heroPos.x - b.group.position.x, heroPos.z - b.group.position.z);
      extra = Math.max(0, 1 - d / 10) * 0.022 * Math.sin(t * 2.0 + b.phase * 2.0);
    }
    b.group.position.y = WATER_Y + Math.sin(t * 0.62 + b.phase) * 0.028 + Math.sin(t * 0.27 + b.phase) * 0.012;
    b.group.rotation.z = Math.sin(t * 0.55 + b.phase) * 0.009 + extra;
    b.group.rotation.x = Math.sin(t * 0.37 + b.phase * 1.4) * 0.006;
    if (b.shadow) {
      b.shadow.position.x = b.group.position.x;
      b.shadow.position.z = b.group.position.z;
      b.shadow.rotation.z = -b.group.rotation.y;
    }
  });

  // buoys
  (BOATS.buoys || []).forEach((bb, i) => {
    bb.group.position.y = bb.base.y + Math.sin(t * 0.9 + bb.phase) * 0.045;
    bb.group.rotation.z = Math.sin(t * 0.8 + bb.phase) * 0.06;
    bb.group.rotation.x = Math.cos(t * 0.7 + bb.phase) * 0.05;
    if (heroPos && BOATS.hero.moving) {
      const d = Math.hypot(heroPos.x - bb.base.x, heroPos.z - bb.base.z);
      const k = Math.max(0, 1 - d / 8);
      bb.group.position.y += Math.sin(t * 3.0 + bb.phase) * 0.05 * k;
      bb.group.rotation.z += Math.sin(t * 2.6 + bb.phase) * 0.10 * k;
    }
  });
}

