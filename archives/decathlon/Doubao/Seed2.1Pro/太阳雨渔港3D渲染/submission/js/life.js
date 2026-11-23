/* ============================================================
   life.js — 海鸥群、港猫、鱼群、绿树山坡民家、红白灯塔、远处渔船
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, pick, MAT, toon, box, cyl, sph, toonMesh, outline,
  clamp, lerp, smoothstep, LAYOUT, mulberry32, makeCanvas, texFromCanvas } = H;

/* ============================================================
   绿树山坡 + 瓦顶民家（底座远端西北角）
   ============================================================ */
(function hill() {
  const r = mulberry32(808);
  // 岩石山体（半球变形）
  const hillGeo = new THREE.SphereGeometry(1, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = hillGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = H.fbm(x * 3 + 5, z * 3 + 2, H.noiseB, 3);
    pos.setX(i, x * (10 + n * 1.2));
    pos.setZ(i, z * (9 + n * 1.0));
    pos.setY(i, y * (7.5 + n * 1.0));
  }
  hillGeo.computeVertexNormals();
  const hill = new THREE.Mesh(hillGeo, MAT.grass);
  hill.position.set(-23, 0, -24);
  hill.castShadow = true; hill.receiveShadow = true;
  scene.add(hill);
  // 山脚岩石
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + r() * 1.2, 0), toon(0x8b918f));
    const a = r() * Math.PI * 2;
    rock.position.set(-23 + Math.cos(a) * 9.5 * (0.9 + r() * 0.2), 0.3, -24 + Math.sin(a) * 8.5);
    rock.rotation.set(r() * 3, r() * 3, r() * 3);
    scene.add(rock);
  }
  // 树
  function tree(s) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.4 * s, 7), MAT.woodDark);
    trunk.position.y = 0.7 * s; trunk.castShadow = true; t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const fol = new THREE.Mesh(new THREE.SphereGeometry((0.9 - k * 0.15) * s, 12, 10),
        k % 2 ? MAT.leaf : MAT.leafDark);
      fol.position.set((r() - 0.5) * 0.4 * s, (1.5 + k * 0.55) * s, (r() - 0.5) * 0.4 * s);
      fol.scale.y = 0.85;
      fol.castShadow = true;
      t.add(fol);
    }
    return t;
  }
  H.hillTrees = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rr2 = Math.sqrt(r());
    const hx = -23 + Math.cos(a) * rr2 * 7.5;
    const hz = -24 + Math.sin(a) * rr2 * 6.5;
    const nx = (hx + 23) / 10, nz = (hz + 24) / 9;
    const hy = 7.5 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const t = tree(0.7 + r() * 0.6);
    t.position.set(hx, hy - 0.1, hz);
    t.rotation.y = r() * 3;
    t.userData.phase = r() * 7;
    scene.add(t);
    H.hillTrees.push(t);
  }
  // 瓦顶民家（两三户）
  function house(s) {
    const h = new THREE.Group();
    const body = box(2.2 * s, 1.5 * s, 1.8 * s, toon(0xe6e0d0), 0x8a8478);
    body.position.y = 0.75 * s; h.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7 * s, 0.9 * s, 4), MAT.roof);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 1.95 * s; roof.scale.z = 0.85;
    roof.castShadow = true;
    h.add(roof);
    const winM = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * s, 0.5 * s),
      new THREE.MeshBasicMaterial({ color: 0x9fc6cf, side: THREE.DoubleSide }));
    winM.position.set(0.4 * s, 0.9 * s, 0.91 * s);
    h.add(winM);
    return h;
  }
  const hs = [[-25.5, -22.5], [-20.5, -25.5], [-26.5, -27]];
  for (const p of hs) {
    const nx = (p[0] + 23) / 10, nz = (p[1] + 24) / 9;
    const hy = 7.5 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const hh = house(0.85);
    hh.position.set(p[0], hy, p[1]);
    hh.rotation.y = r() * 3;
    scene.add(hh);
  }
})();

/* ============================================================
   红白灯塔
   ============================================================ */
const lighthouse = (function () {
  const g = new THREE.Group();
  const red = toon(0xd44a3e), white = toon(0xf2f0ea);
  const Hh = 5.2;
  let y = 0;
  const bands = [
    [0.5, 0.75, red], [0.9, 0.62, white], [0.9, 0.52, red], [0.9, 0.44, white],
    [0.7, 0.38, red], [0.6, 0.34, white],
  ];
  for (const b of bands) {
    const mat = b[2];
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(b[1] * 0.86, b[1], b[0], 14), mat);
    seg.position.y = y + b[0] / 2;
    seg.castShadow = true;
    g.add(seg);
    y += b[0];
  }
  // 灯室
  const deck = cyl(0.5, 0.44, 0.2, 14, MAT.iron); deck.position.y = y + 0.1; g.add(deck);
  const glassRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 10, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.55, emissive: 0xffd870, emissiveIntensity: 0.4 }));
  glassRoom.position.y = y + 0.5; g.add(glassRoom);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4cc }));
  bulb.position.y = y + 0.5; g.add(bulb);
  const roofC = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.5, 12), red);
  roofC.position.y = y + 1.05; roofC.castShadow = true; g.add(roofC);
  const point = new THREE.PointLight(0xffe0a0, 0, 16, 2);
  point.position.y = y + 0.5;
  g.add(point);
  // 旋转光束
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b8, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 12, 18, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(6, y + 0.5, 0);
  beam.visible = false;
  g.add(beam);
  g.position.set(4.5, 0.3, -30);
  scene.add(g);
  return { g, point, beam, bulb, topY: y + 0.5 };
})();
H.lighthouse = lighthouse;

/* ============================================================
   海鸥
   ============================================================ */
function gull() {
  const b = new THREE.Group();
  const matW = toon(0xf4f2ec);
  const body = sph(0.16, matW, 0x99a2a6, 8, 6, true);
  body.scale.set(1.5, 0.8, 0.8);
  b.add(body);
  function wing(side) {
    const wg = new THREE.Group();
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.16), matW);
    w.position.x = side * 0.35;
    w.castShadow = true;
    wg.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), toon(0xd8dcdc));
    tip.position.x = side * 0.72;
    wg.add(tip);
    wg.position.set(0, 0, 0);
    return wg;
  }
  const wL = wing(-1), wR = wing(1);
  b.add(wL, wR);
  const head = sph(0.09, matW, 0, 8, 6, true);
  head.position.set(0.22, 0.08, 0); b.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), toon(0xe8a13a));
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.32, 0.08, 0); b.add(beak);
  b.userData = { wL, wR };
  return b;
}
const gulls = [];
const perchSpots = [
  () => new THREE.Vector3(0, 1.1, 5.6), () => new THREE.Vector3(8, 1.1, 5.6),
  () => new THREE.Vector3(24, 1.1, 5.6), () => new THREE.Vector3(-13.6, 1.1, -6),
];
{
  const r = mulberry32(990);
  for (let i = 0; i < 7; i++) {
    const b = gull();
    b.scale.setScalar(1.1 + r() * 0.5);
    scene.add(b);
    const state = {
      mode: i < 3 ? 'perch' : 'fly',
      t: r() * 60,
      cx: -10 + r() * 40, cz: -18 + r() * 30, rad: 8 + r() * 14,
      h: 14 + r() * 10, spd: 0.18 + r() * 0.14, ph: r() * 7,
      perch: perchSpots[i % perchSpots.length](),
      from: null, to: null, moveT: 0,
      flock: i,
    };
    if (state.mode === 'perch') b.position.copy(state.perch);
    gulls.push({ b, s: state, spooked: 0 });
  }
}
H.gulls = gulls;

/* ============================================================
   港猫（舢板下避雨）
   ============================================================ */
const cat = (function () {
  const g = new THREE.Group();
  const fur = toon(0x4a4642), furDark = toon(0x35322f);
  const body = sph(0.32, fur, 0x26221f, 10, 8);
  body.scale.set(1.4, 0.85, 0.8);
  body.position.y = 0.32;
  g.add(body);
  const head = sph(0.2, fur, 0x26221f, 10, 8);
  head.position.set(0.4, 0.5, 0); g.add(head);
  for (const dz of [-0.1, 0.1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), fur);
    ear.position.set(0.4, 0.68, dz); g.add(ear);
  }
  for (const dx of [-0.18, 0.18]) for (const dz of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 6), furDark);
    leg.position.set(dx, 0.12, dz); g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), fur);
  tail.position.set(-0.5, 0.4, 0); tail.rotation.z = 0.7; g.add(tail);
  // 虎斑
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.5), furDark);
    stripe.position.set(-0.1 + i * 0.12, 0.5, 0); g.add(stripe);
  }
  // 眼睛
  for (const dz of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8b24a }));
    eye.position.set(0.56, 0.52, dz); g.add(eye);
  }
  g.position.set(22.2, 0.05, 12.4);
  g.rotation.y = 0.15;
  scene.add(g);
  return g;
})();
H.cat = cat;
const catState = {
  mode: 'shelter', // shelter | walk
  path: [], pi: 0, moveT: 0, lookT: 0, alerted: false,
};
H.catState = catState;

/* 猫步道：沿堤岸的一组点 */
const catPaths = [
  [new THREE.Vector3(22.2, 0.05, 12.4), new THREE.Vector3(12, 0.05, 8.5), new THREE.Vector3(4, 0.05, 9), new THREE.Vector3(-5, 0.05, 7.6)],
  [new THREE.Vector3(22.2, 0.05, 12.4), new THREE.Vector3(26, 0.05, 8), new THREE.Vector3(27, 0.05, 5.8)],
  [new THREE.Vector3(22.2, 0.05, 12.4), new THREE.Vector3(15, 0.05, 13), new THREE.Vector3(6, 0.05, 15)],
];

/* ============================================================
   水下鱼群
   ============================================================ */
function fish(mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), mat);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), mat);
  tail.rotation.z = -Math.PI / 2; tail.position.x = -0.22; g.add(tail);
  return g;
}
const fishSchool = new THREE.Group();
const fishes = [];
{
  const r = mulberry32(1212);
  for (let i = 0; i < 22; i++) {
    const f = fish(toon(pick([0xc9d3b0, 0xa8c4c8, 0xd8c98a])));
    f.position.set(-6 + r() * 26, -2.5 - r() * 3.0, -22 + r() * 20);
    f.userData = { ph: r() * 7, spd: 0.6 + r() * 0.5, rv: r() };
    fishSchool.add(f); fishes.push(f);
  }
}
scene.add(fishSchool);
H.fishes = fishes;
const fishState = { center: new THREE.Vector3(7, -4, -12), scatter: 0, target: new THREE.Vector3(7, -4, -12), inited: false };
H.fishState = fishState;

/* ============================================================
   远处渔船（防波堤外驶过）
   ============================================================ */
const farBoats = [];
(function farBoat() {
  const g = new THREE.Group();
  const hull = box(2.2, 0.5, 0.7, toon(0xe6ecec), 0x6a8288);
  hull.position.y = 0.25; g.add(hull);
  const cab = box(0.7, 0.6, 0.55, toon(0xf2f0ea), 0x6a8288);
  cab.position.set(0.3, 0.75, 0); g.add(cab);
  g.scale.setScalar(0.7);
  g.position.set(40, 0.5, -40);
  scene.add(g);
  farBoats.push({ g, t0: 30, spd: 2.2 });
})();

/* ============================================================
   更新
   ============================================================ */
function catShelterPos() { return new THREE.Vector3(22.2, 0.05, 12.4); }
let rainCache = 0.6;
onUpdate((t, dt) => {
  rainCache = H.curRain || 0.6;
  /* 灯塔：极偶发白天亮灯 */
  const flashCycle = t % 210;
  const flashOn = flashCycle > 196 && flashCycle < 206;
  lighthouse.point.intensity = flashOn ? 2.4 : 0;
  lighthouse.beam.visible = flashOn;
  if (flashOn) {
    lighthouse.beam.rotation.y = (t * 2.2) % (Math.PI * 2);
    lighthouse.bulb.material.color.setHex(0xfff4cc);
  }

  /* 山坡树冠迎风 */
  const gust = H.gust || 0;
  for (const tr of H.hillTrees) {
    tr.rotation.z = Math.sin(t * 1.3 + tr.userData.phase) * 0.012 + gust * 0.05 * Math.sin(t * 4 + tr.userData.phase);
    tr.rotation.x = gust * 0.03 * Math.cos(t * 3.5 + tr.userData.phase);
  }

  /* 海鸥 */
  const camP = H.camera.position;
  for (const gu of gulls) {
    const { b, s } = gu;
    const flap = Math.sin(t * 9 + s.ph);
    if (s.mode === 'fly') {
      const a = t * s.spd + s.ph;
      const x = s.cx + Math.cos(a) * s.rad;
      const z = s.cz + Math.sin(a * 0.9) * s.rad * 0.7;
      const y = s.h + Math.sin(t * 0.6 + s.ph) * 1.5 + gust * 0.6;
      b.position.lerp(new THREE.Vector3(x, y, z), Math.min(1, dt * 3));
      const da = a + 0.05;
      const nx = s.cx + Math.cos(da) * s.rad, nz = s.cz + Math.sin(da * 0.9) * s.rad * 0.7;
      b.rotation.y = Math.atan2(nx - x, nz - z);
      b.userData.wL.rotation.z = flap * 0.5 - 0.1;
      b.userData.wR.rotation.z = -flap * 0.5 + 0.1;
      // 偶尔掠过水面
      if (Math.sin(t * 0.21 + s.ph) > 0.93) b.position.y = LAYOUT.waterY + 1.0 + Math.abs(Math.sin(t * 2)) * 0.5;
      // 偶落
      if (Math.sin(t * 0.07 + s.ph * 3) > 0.985) {
        s.mode = 'perch'; s.perch = perchSpots[Math.floor(Math.abs(Math.sin(s.ph)) * 4) % 4]();
        s.perchT = t;
      }
    } else {
      b.position.copy(s.perch);
      b.userData.wL.rotation.z = 0.1;
      b.userData.wR.rotation.z = -0.1;
      // 镜头推近 -> 飞走
      const d = camP.distanceTo(b.position);
      if (d < 9 || (t - (s.perchT || 0) > 12 && Math.sin(t * 0.3 + s.ph) > 0.96)) {
        s.mode = 'fly';
        s.cx = b.position.x + 4; s.cz = b.position.z - 6; s.rad = 8 + H.R() * 10;
        s.ph = t * s.spd;
      }
    }
  }

  /* 港猫状态机 */
  // 雨疏 -> 出来走动
  if (catState.mode === 'shelter') {
    cat.position.copy(catShelterPos());
    if (rainCache < 0.5 && Math.sin(t * 0.05) > 0.6) {
      catState.path = pick(catPaths).map(p => p.clone());
      catState.pi = 0; catState.moveT = 0; catState.mode = 'walk';
    }
  } else {
    // 雨变密 -> 跑回
    if (rainCache > 0.78) catState.pi = 99;
    const path = catState.path;
    let target;
    if (catState.pi >= path.length) target = catShelterPos();
    else target = path[catState.pi];
    catState.moveT += dt * 0.55;
    cat.position.lerp(target, Math.min(1, dt * 1.4));
    const dir = target.clone().sub(cat.position);
    if (dir.lengthSq() > 0.01) cat.rotation.y = Math.atan2(dir.x, dir.z);
    if (cat.position.distanceTo(target) < 0.3) {
      catState.pi++;
      if (catState.pi > path.length && cat.position.distanceTo(catShelterPos()) < 0.4) {
        catState.mode = 'shelter';
      }
    }
  }
  // 镜头推近 -> 抬头看镜头
  const dCat = Math.hypot(camP.x - cat.position.x, camP.z - cat.position.z);
  const wantLook = dCat < 7;
  if (wantLook && !catState.lookT) catState.lookT = t;
  if (!wantLook) catState.lookT = 0;
  cat.rotation.x = catState.lookT ? lerp(cat.rotation.x, 0.35, dt * 4) : lerp(cat.rotation.x, 0, dt * 2);

  /* 鱼群游动 */
  fishState.scatter += ((camP.y < 4 && Math.hypot(camP.x - fishState.center.x, camP.z - fishState.center.z) < 12 ? 1 : 0)
    - fishState.scatter) * Math.min(1, dt * 1.5);
  if (!fishState.inited) {
    fishes.forEach(f => f.position.set(
      fishState.center.x + (f.userData.rv - 0.5) * 4,
      fishState.center.y + (f.userData.rv - 0.5) * 2,
      fishState.center.z + (f.userData.rv - 0.5) * 4));
    fishState.inited = true;
  }
  fishState.center.x = 7 + Math.sin(t * 0.12) * 10 - fishState.scatter * 6;
  fishState.center.z = -12 + Math.cos(t * 0.1) * 6 - fishState.scatter * 3;
  for (const f of fishes) {
    const u = f.userData;
    const a = t * u.spd + u.ph;
    const sc = 1 - fishState.scatter * 0.8;
    const rr = u.rv;
    const tx = fishState.center.x + Math.cos(a) * 2.2 * sc * rr;
    const ty = fishState.center.y + Math.sin(t * 0.8 + u.ph) * 0.8;
    const tz = fishState.center.z + Math.sin(a * 1.3) * 1.8 * sc * rr;
    const old = f.position.clone();
    f.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 2));
    const dd = f.position.clone().sub(old);
    if (dd.lengthSq() > 0.0001) f.rotation.y = Math.atan2(dd.x, dd.z);
  }

  /* 远船驶过 */
  for (const fb of farBoats) {
    const cyc = (t - fb.t0) % 130;
    if (cyc < 0 || cyc > 50) { fb.g.visible = false; continue; }
    fb.g.visible = true;
    const u = cyc / 50;
    fb.g.position.set(40 - u * 80, LAYOUT.waterY + 1.2 + Math.sin(t * 1.5) * 0.1, -39 + Math.sin(u * 3) * 2);
    fb.g.rotation.y = -Math.PI / 2 + Math.sin(u * 3) * 0.05;
  }
});

})();
