/* ============================================================
   props.js — 码头街角道具、系泊设施、人刚离开的痕迹
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, pick, MAT, toon, box, cyl, sph, toonMesh, outline,
  clamp, lerp, smoothstep, LAYOUT, mulberry32, makeCanvas, texFromCanvas } = H;

const wetMat = toon(0x2c3336, { roughness: 0.35 });

/* ================= 系船柱列（另一侧沿岸） ================= */
const bollards = [];
function bollard(x, z) {
  const g = new THREE.Group();
  const base = cyl(0.22, 0.26, 0.16, 12, MAT.iron);
  base.position.y = 0.08; g.add(base);
  const post = cyl(0.11, 0.14, 0.72, 12, MAT.iron);
  post.position.y = 0.5; g.add(post);
  const cap = cyl(0.17, 0.17, 0.12, 12, MAT.iron);
  cap.position.y = 0.9; g.add(cap);
  const knob = sph(0.1, MAT.iron, 0x111, 10, 8);
  knob.position.y = 1.0; g.add(knob);
  g.position.set(x, 0, z);
  scene.add(g);
  bollards.push({ g, x, z, phase: R() * 7 });
}
// 沿南墙（北侧排）系船柱列在堤岸"另一侧"——这里沿码头内侧靠泊位排开
[0, 8, 16, 24].forEach(x => bollard(x, 5.6));
// 西壁
[-22, -14, -6, 1].forEach(z => bollard(-13.6, z));
H.bollards = bollards;

/* 最外侧船（b0）缆绳绕柱入水 */
(function ropes0() {
  H._moorRopeFrom = new THREE.Vector3(6.5, 0.55, 5.6);
})();

/* ================= 灯柱（圆环灯罩） ================= */
const lamps = [];
function lampPost(x, z) {
  const g = new THREE.Group();
  const pole = cyl(0.08, 0.11, 5.2, 10, MAT.iron);
  pole.position.y = 2.6; g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), MAT.iron);
  arm.rotation.z = Math.PI / 2; arm.position.set(0.4, 5.1, 0);
  g.add(arm);
  // 圆环形灯罩
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 10, 24), MAT.iron);
  ring.position.set(0.85, 4.95, 0);
  g.add(ring);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0.95 }));
  globe.position.set(0.85, 4.95, 0);
  g.add(globe);
  const lite = new THREE.PointLight(0xffe9b0, 0.55, 9, 2);
  lite.position.set(0.85, 4.95, 0);
  g.add(lite);
  g.position.set(x, 0, z);
  scene.add(g);
  lamps.push({ g, globe, lite, x, z, top: new THREE.Vector3(x + 0.85, 4.95, z) });
  return { g, top: new THREE.Vector3(x + 0.85, 4.95, z) };
}
const l1 = lampPost(-4, 10.5);
const l2 = lampPost(22, 9);
const l3 = lampPost(-16.5, -2);
H.lamps = lamps;

/* 纤细电线斜穿天空（灯柱之间） */
function wire(a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    pts.push(new THREE.Vector3(
      lerp(a.x, b.x, f),
      lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * sag,
      lerp(a.z, b.z, f)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2c3134 }));
  scene.add(ln);
}
wire(l1.top.clone().add(new THREE.Vector3(-0.85, 0.3, 0)), l2.top.clone().add(new THREE.Vector3(-0.85, 0.3, 0)), 0.5);
wire(l1.top.clone().add(new THREE.Vector3(-0.85, 0.3, 0)), l3.top.clone().add(new THREE.Vector3(-0.85, 0.3, 0)), 0.7);
wire(l2.top.clone().add(new THREE.Vector3(-0.85, 0.3, 0)), new THREE.Vector3(27, 5.5, 16), 0.4);

/* ================= 乐器硬箱（银灰，两只） ================= */
function instCase(x, z, rotY, sx) {
  const g = new THREE.Group();
  const body = box(2.3 * sx, 0.55, 0.85, toon(0x9aa4ab), 0x3a454c);
  body.position.y = 0.28; g.add(body);
  // 加固棱
  for (const dx of [-0.9, 0, 0.9]) {
    const strap = box(0.08, 0.6, 0.9, MAT.iron, 0, true);
    strap.position.set(dx * sx, 0.28, 0); g.add(strap);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), MAT.iron);
  handle.position.set(0, 0.62, 0); handle.rotation.x = 0;
  g.add(handle);
  const latches = box(0.5, 0.08, 0.05, MAT.rust, 0, true);
  latches.position.set(0.5 * sx, 0.42, 0.44); g.add(latches);
  g.position.set(x, 0, z); g.rotation.y = rotY;
  scene.add(g);
}
instCase(-1.5, 9.2, 0.12, 1);
instCase(1.3, 9.6, -0.06, 0.92);

/* ================= 透明雨伞 ================= */
const umbrella = (function () {
  const g = new THREE.Group();
  const umMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff3f6, roughness: 0.08, transparent: true, opacity: 0.38,
    side: THREE.DoubleSide, depthWrite: false, transmission: 0.4, thickness: 0.1,
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), umMat);
  canopy.position.y = 1.05;
  canopy.scale.y = 0.45;
  g.add(canopy);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.018, 6, 32),
    new THREE.MeshBasicMaterial({ color: 0x8fb8c0, transparent: true, opacity: 0.7 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.05;
  g.add(rim);
  // 伞骨
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5), MAT.iron);
    rib.position.set(Math.cos(a) * 0.55, 1.32, Math.sin(a) * 0.55);
    rib.rotation.z = Math.cos(a) * 0.75;
    rib.rotation.x = Math.sin(a) * -0.75;
    g.add(rib);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 8), MAT.iron);
  shaft.position.y = 0.6; g.add(shaft);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 12, Math.PI), MAT.iron);
  handle.position.y = 0.05; g.add(handle);
  // 雨珠（小亮点）
  const drops = [];
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = 0.2 + R() * 0.85;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.02 + R() * 0.015, 6, 5), dropMat);
    d.position.set(Math.cos(a) * r, 1.05 + (1 - r / 1.1) * 0.42 + R() * 0.04, Math.sin(a) * r);
    d.userData = { a, r, fall: R() * 1.2 };
    g.add(d); drops.push(d);
  }
  // 斜靠在台阶边（台阶在 x=-2 附近，地面 z≈5）
  g.position.set(-4.4, 0.02, 6.4);
  g.rotation.z = -0.28; g.rotation.x = 0.08;
  scene.add(g);
  return { g, drops };
})();
H.umbrella = umbrella;

/* ================= 鱼箱 / 蓝色周转筐（层叠） ================= */
function fishBox(col) {
  const g = new THREE.Group();
  const b = box(0.95, 0.45, 0.65, toon(col), 0x4d5a5e);
  b.position.y = 0.23; g.add(b);
  // 镂空感：深色横条
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x3a4a50 });
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.02), slotMat);
    s.position.set(i * 0.26, 0.26, 0.335); g.add(s);
  }
  // 箱口冰
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xeaf4f6, transparent: true, opacity: 0.85 }));
  ice.position.y = 0.47; g.add(ice);
  return g;
}
(function crateStack() {
  const stack = new THREE.Group();
  const r = mulberry32(55);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 3 - (layer === 2 ? 1 : 0); i++) {
      const col = layer === 1 ? 0x3f7fa8 : 0xeceff0;
      const b = fishBox(i % 2 && layer ? 0x3f7fa8 : col);
      b.position.set((i - 1) * 1.0 + (layer - 1) * 0.15, 0.23 + layer * 0.5, (r() - 0.5) * 0.12);
      b.rotation.y = (r() - 0.5) * 0.08;
      stack.add(b);
    }
  }
  stack.position.set(26, 0.02, 9.5);
  stack.rotation.y = 0.2;
  scene.add(stack);
})();

/* ================= 晒渔网的铁架 + 浮球绳串 ================= */
const netRig = (function () {
  const g = new THREE.Group();
  for (const dx of [-1.8, 1.8]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 8), MAT.iron);
    p.position.set(dx, 1.3, 0); g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.8, 8), MAT.iron);
  bar.rotation.z = Math.PI / 2; bar.position.y = 2.5; g.add(bar);
  // 网（半透明网格 plane）
  const [c, cx] = makeCanvas(128, 96);
  cx.fillStyle = 'rgba(60,72,78,0.0)'; cx.fillRect(0, 0, 128, 96);
  cx.strokeStyle = 'rgba(70,90,96,0.85)'; cx.lineWidth = 1.5;
  for (let x = 0; x <= 128; x += 10) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, 96); cx.stroke(); }
  for (let y = 0; y <= 96; y += 10) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(128, y); cx.stroke(); }
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.1),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(c, 1, 1, true), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  netMesh.position.set(0, 1.4, 0.02);
  g.add(netMesh);
  // 浮球绳串
  const ropeLine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 5), MAT.rope);
  ropeLine.rotation.z = Math.PI / 2; ropeLine.position.set(0, 0.35, 0.15);
  g.add(ropeLine);
  const floats = [];
  for (let i = 0; i < 7; i++) {
    const f = sph(0.13, i % 2 ? toon(0xe8782e) : toon(0xeceff0), 0x554, 10, 8);
    f.position.set(-1.4 + i * 0.47, 0.35 + Math.sin(i * 0.8) * 0.05, 0.15);
    g.add(f); floats.push(f);
  }
  g.position.set(-25, 0, 12);
  g.rotation.y = 0.25;
  scene.add(g);
  return { g, netMesh, floats };
})();
H.netRig = netRig;

/* ================= 手摇绞盘 + 小吊杆 ================= */
(function winch() {
  const g = new THREE.Group();
  const base = box(0.9, 0.35, 0.7, MAT.rust, 0x4a2e18);
  base.position.y = 0.18; g.add(base);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.7, 14), MAT.iron);
  drum.rotation.x = Math.PI / 2; drum.position.y = 0.62;
  drum.castShadow = true; g.add(drum);
  for (const dz of [-0.3, 0.3]) {
    const disc = cyl(0.3, 0.3, 0.05, 14, MAT.rust);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 0.62, dz); g.add(disc);
  }
  const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), MAT.iron);
  crank.position.set(0.35, 0.62, 0.42); crank.rotation.z = 0.8;
  g.add(crank);
  // 小吊杆
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8), MAT.rust);
  boom.position.set(0.9, 2.1, 0);
  boom.rotation.z = -0.7;
  g.add(boom);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 10), MAT.iron);
  hook.position.set(1.9, 1.0, 0); g.add(hook);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4), MAT.iron);
  chain.position.set(1.75, 1.5, 0); g.add(chain);
  g.position.set(27.4, 0, 6.2);
  scene.add(g);
})();

/* ================= 系船浮标（水面，褪色编号） ================= */
const buoys = [];
function buoy(x, z, num) {
  const g = new THREE.Group();
  const body = cyl(0.3, 0.34, 0.5, 14, toon(0xd4522e), 0x5c2a16);
  body.position.y = 0.15; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 14), toon(0xeceff0));
  band.position.y = 0.28; g.add(band);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), toon(0xeceff0));
  top.position.y = 0.55; g.add(top);
  const [c, cx] = makeCanvas(64, 32);
  cx.fillStyle = '#eceff0'; cx.fillRect(0, 0, 64, 32);
  cx.fillStyle = '#5c2a16'; cx.font = 'bold 22px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(num, 32, 16);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(c, 1, 1, true), side: THREE.DoubleSide }));
  lab.position.set(0, 0.18, 0.32); g.add(lab);
  g.position.set(x, LAYOUT.waterY, z);
  scene.add(g);
  buoys.push({ g, x, z, phase: R() * 7 });
  H.addReflector(() => new THREE.Vector3(g.position.x, 0, g.position.z), 0.35, 0.35, 0xc96a4a, 0.7);
}
buoy(3, -2.5, '1');
buoy(13, -6, '2');
buoy(-8, -18, '3');
H.buoys = buoys;

/* ================= 长柄网兜 + 水桶（靠墙） ================= */
(function tools() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), MAT.wood);
  pole.position.y = 1.2; pole.rotation.z = 0.18; g.add(pole);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16), MAT.iron);
  hoop.position.set(-0.22, 0.15, 0); hoop.rotation.y = 0.3;
  g.add(hoop);
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4a6068, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  bag.position.set(-0.22, -0.05, 0); bag.rotation.x = Math.PI; g.add(bag);
  g.position.set(-13.2, 0.05, 2.6);
  g.rotation.y = Math.PI / 2;
  scene.add(g);
  const bucket = cyl(0.26, 0.2, 0.5, 12, toon(0x3f7fa8), 0x1e3c4e);
  bucket.position.set(-13.2, 0.25, 1.6); scene.add(bucket);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.015, 5, 16, Math.PI), MAT.iron);
  handle.position.set(-13.2, 0.55, 1.6); handle.rotation.x = 0; scene.add(handle);
})();

/* ================= 自动贩卖机 ================= */
const vending = (function () {
  const g = new THREE.Group();
  const body = box(1.5, 2.6, 0.9, toon(0xe8e6e0), 0x6d777b);
  body.position.y = 1.3; g.add(body);
  const [c, cx] = makeCanvas(256, 384);
  cx.fillStyle = '#dceff2'; cx.fillRect(0, 0, 256, 384);
  // 灯箱样品
  const cols = ['#e8782e', '#3f7fa8', '#e8c12e', '#c8473b'];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    cx.fillStyle = '#f4f2ec';
    cx.fillRect(24 + x * 54, 30 + y * 70, 40, 54);
    cx.fillStyle = cols[(x + y) % 4];
    cx.fillRect(30 + x * 54, 38 + y * 70, 28, 38);
    cx.fillStyle = '#c8473b'; cx.font = 'bold 13px sans-serif'; cx.textAlign = 'center';
    cx.fillText('120', 44 + x * 54, 90 + y * 70);
  }
  cx.fillStyle = '#2b6068'; cx.fillRect(0, 300, 256, 84);
  cx.fillStyle = '#dff3f6'; cx.font = 'bold 34px "Yu Gothic",sans-serif'; cx.textAlign = 'center';
  cx.fillText('じはんき', 128, 348);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(c, 1, 1, true) }));
  panel.position.set(0, 1.35, 0.46); g.add(panel);
  const glow = new THREE.PointLight(0xbfe8ff, 0.5, 5);
  glow.position.set(0, 1.6, 0.8); g.add(glow);
  // 锈蚀遮雨檐
  const eave = box(1.8, 0.08, 1.1, MAT.rust, 0x4a2e18);
  eave.position.set(0, 2.72, 0.08); eave.rotation.x = -0.08; g.add(eave);
  g.position.set(-27, 0, 6.5);
  g.rotation.y = 0.15;
  scene.add(g);
  return { g, glow, panel };
})();
H.vending = vending;

/* ================= 斜坡滑道 + 倒扣小木舢板 ================= */
(function slopeDinghy() {
  // 滑道（从堤岸斜伸入水，东南角）
  const ramp = new THREE.Group();
  const slab = box(4.2, 0.3, 9, MAT.concreteDark, 0x566066);
  slab.position.set(0, 0, 0);
  ramp.add(slab);
  // 滑道凹槽条
  for (const dx of [-1.3, 1.3]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 9.1), toon(0x6e787c));
    tr.position.set(dx, 0.18, 0); ramp.add(tr);
  }
  ramp.position.set(24.5, -1.5, 7.2);
  ramp.rotation.x = 0.34;
  scene.add(ramp);
  // 倒扣小木舢板（半拖上岸，放在堤岸平处）
  const d = new THREE.Group();
  function dinghyHull() {
    const grp = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.5, 0.32, 4.2, 12, 1, false, 0, Math.PI);
    geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, toon(0x9c7146));
    m.castShadow = true;
    grp.add(m);
    const olm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4a3320, side: THREE.BackSide }));
    olm.scale.setScalar(1.03); grp.add(olm);
    // 横坐板
    for (const dx of [-1.2, 0, 1.2]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), MAT.woodDark);
      seat.position.set(dx, 0.28, 0); grp.add(seat);
    }
    return grp;
  }
  const hull = dinghyHull();
  hull.rotation.x = 0; // 倒扣（圆柱半圆向下）——圆柱几何开口朝下
  d.add(hull);
  d.position.set(22.2, 0.62, 12.4);
  d.rotation.y = 0.15;
  scene.add(d);
  H.dinghy = d;
})();

/* ================= 告示牌（港名 + 注意落水） ================= */
(function signboard() {
  const g = new THREE.Group();
  for (const dx of [-0.9, 0.9]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8), MAT.iron);
    p.position.set(dx, 1.1, 0); g.add(p);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(H.signCanvas(), 1, 1, true), side: THREE.DoubleSide }));
  board.position.y = 2.1; g.add(board);
  g.position.set(11, 0, 7.4);
  g.rotation.y = 0.1;
  scene.add(g);
})();

/* ================= 风向袋 + 小旗 ================= */
const windsock = (function () {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 8), MAT.iron);
  pole.position.y = 2.3; g.add(pole);
  const sockGeo = new THREE.CylinderGeometry(0.28, 0.1, 1.8, 12, 1, true);
  sockGeo.translate(0.9, 0, 0);
  sockGeo.rotateZ(-Math.PI / 2);
  const sock = new THREE.Mesh(sockGeo, new THREE.MeshToonMaterial({
    color: 0xe8782e, side: THREE.DoubleSide, gradientMap: H.toonGrad,
  }));
  sock.position.set(0, 4.5, 0);
  g.add(sock);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 16), MAT.iron);
  hoop.position.set(0, 4.5, 0); hoop.rotation.y = Math.PI / 2;
  g.add(hoop);
  g.position.set(-14.6, 0, -2.4);
  scene.add(g);
  return { g, sock };
})();
H.windsock = windsock;

const flags = [];
function flag(x, y, z, col, h) {
  const geo = new THREE.PlaneGeometry(0.7, 0.42, 8, 1);
  const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: col, side: THREE.DoubleSide, gradientMap: H.toonGrad }));
  m.position.set(0.36, 0, 0);
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h || 1.4, 6), MAT.iron);
  pole.position.y = (h || 1.4) / 2;
  grp.add(pole); grp.add(m);
  grp.position.set(x, y, z);
  scene.add(grp);
  flags.push({ m, grp, base: m.geometry.attributes.position.array.slice() });
}
flag(-6, 0.9, 5.4, 0xe8c12e);
flag(27.4, 0.7, 8.4, 0xc8473b);
flag(-12.6, 0.9, -18, 0x3f7fa8);
H.flags = flags;

/* ================= 水洼同心涟漪 / 滴水 ================= */
const rippleMgr = (function () {
  const ripples = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1, 24);
  function spawn(x, z, r0, onWater) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: onWater ? 0xffffff : 0xcfe8ec, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, onWater ? LAYOUT.waterY + 0.07 : 0.05, z);
    m.renderOrder = 6;
    scene.add(m);
    ripples.push({ m, t: 0, max: 1.6, r0 });
  }
  onUpdate((t, dt) => {
    // 自动在水洼与水面生涟漪
    if (R() < dt * 1.2 && H.puddles.length) {
      const p = pick(H.puddles);
      spawn(p.x + RR(-p.rx * 0.5, p.rx * 0.5), p.z + RR(-p.rz * 0.5, p.rz * 0.5), 0.06, false);
    }
    if (R() < dt * 2.5) {
      spawn(RR(-10, 28), RR(-28, 2), 0.05, true);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.t += dt;
      const k = rp.t / rp.max;
      const s = rp.r0 + k * 0.7;
      rp.m.scale.set(s, s, s);
      rp.m.material.opacity = 0.6 * (1 - k);
      if (k >= 1) { scene.remove(rp.m); ripples.splice(i, 1); }
    }
  });
  return { spawn };
})();
H.spawnRipple = rippleMgr.spawn;

/* ================= 更新：雨珠滴水、风向袋、旗、渔网、浮标 ================= */
onUpdate((t, dt) => {
  const gust = H.gust || 0;
  // 雨伞雨珠滑落
  for (const d of umbrella.drops) {
    const u = d.userData;
    u.fall += dt * (0.5 + gust);
    if (u.fall > 1.2) {
      u.fall = 0;
      u.a = R() * Math.PI * 2; u.r = 0.2 + R() * 0.85;
      // 沿伞沿滴水
      H.spawnRipple(umbrella.g.position.x + Math.cos(u.a) * 1.0 * Math.cos(umbrella.g.rotation.z),
        umbrella.g.position.z + Math.sin(u.a) * 1.0, 0.04, false);
    }
    const dd = u.fall / 1.2;
    d.position.x = Math.cos(u.a) * u.r;
    d.position.z = Math.sin(u.a) * u.r;
    d.position.y = 1.05 + (1 - u.r / 1.1) * 0.42 - dd * 0.9;
  }
  // 风向袋朝向 + 鼓起
  const ang = -0.2 - gust * 0.5 + Math.sin(t * 0.4) * 0.08;
  windsock.sock.rotation.z = ang;
  windsock.sock.scale.x = 1 + gust * 0.5 + Math.sin(t * 2.2) * 0.03;
  // 小旗波浪
  for (const f of flags) {
    const pos = f.m.geometry.attributes.position;
    const base = f.base;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 9 - t * (5 + gust * 7)) * 0.05 * (x + 0.35));
    }
    pos.needsUpdate = true;
    f.m.rotation.y = gust * 0.3;
  }
  // 渔网轻摆
  netRig.netMesh.rotation.y = Math.sin(t * 1.1) * 0.03 + gust * 0.12;
  netRig.netMesh.rotation.z = Math.sin(t * 1.6) * 0.02;
  // 浮标起伏（航迹浪）
  for (const b of buoys) {
    let push = 0;
    for (const ww of H.wakeWaves) {
      const age = t - ww.t0;
      if (age < 0 || age > 6) continue;
      const d = Math.hypot(b.x - ww.x, b.z - ww.z);
      const ring = age * 4.2;
      push += Math.exp(-((d - ring) ** 2) / 2) * Math.exp(-age * 0.4) * 0.25;
    }
    const wh = H.waveHeight(b.x, b.z, t);
    b.g.position.y = LAYOUT.waterY + wh * 0.5 + push * 0.3;
    b.g.rotation.x = Math.sin(t * 1.3 + b.phase) * 0.12 + push * 0.3;
    b.g.rotation.z = Math.cos(t * 1.1 + b.phase) * 0.1 + push * 0.2;
  }
  // 贩卖机灯箱微闪（云）
  const dim = 0.6 + (H.sunCover ? H.sunCover() : 0) * 0.6;
  vending.glow.intensity = dim;
});

/* 缆绳：各泊位船 ↔ 最近系船柱（在 boats 模块就绪后建立） */
H._afterBoats = function () {
  const b = H.movingBoat;
  H.makeRope(new THREE.Vector3(0, 0.92, 5.6), b);
  H.makeRope(new THREE.Vector3(8, 0.92, 5.6), b);
  H.makeRope(new THREE.Vector3(16, 0.92, 5.6), H.boats[1]);
  H.makeRope(new THREE.Vector3(24, 0.92, 5.6), H.boats[2]);
  // 西泊位（船在 x≈-9.7，柱在 x=-13.6）
  H.makeRope(new THREE.Vector3(-13.6, 0.9, -6), H.boats[3]);
  H.makeRope(new THREE.Vector3(-13.6, 0.9, -14), H.boats[4]);
};

})();
