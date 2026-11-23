/* ============================================================
   boats.js — 渔船、驾驶舱内部、倒影、系泊摇晃、出港航迹
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, pick, MAT, toon, box, cyl, sph, toonMesh, outline,
  clamp, lerp, smoothstep, LAYOUT, mulberry32, makeCanvas, texFromCanvas } = H;

const boats = H.boats = [];
const cabinRefs = new Map();

/* ---------- 小贴图 ---------- */
function radarScreenCanvas() {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#0b2b27'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#39c79a'; g.lineWidth = 2;
  for (const r of [18, 36, 54]) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(64, 8); g.lineTo(64, 120); g.moveTo(8, 64); g.lineTo(120, 64); g.stroke();
  g.fillStyle = '#7dffcf';
  for (const p of [[78, 50, 3], [48, 72, 2.4], [90, 80, 2]]) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); }
  return c;
}
function fishScreenCanvas() {
  const [c, g] = makeCanvas(128, 96);
  g.fillStyle = '#0a2235'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = 'rgba(120,200,255,0.6)';
  for (let y = 20; y < 96; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  g.fillStyle = '#ffd24a';
  g.beginPath(); g.moveTo(30, 50); g.quadraticCurveTo(42, 38, 56, 50); g.quadraticCurveTo(42, 62, 30, 50); g.fill();
  g.beginPath(); g.moveTo(74, 64); g.quadraticCurveTo(84, 55, 96, 64); g.quadraticCurveTo(84, 73, 74, 64); g.fill();
  return c;
}
function chartCanvas() {
  const [c, g] = makeCanvas(128, 96);
  g.fillStyle = '#efe7cf'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#6d8a90'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(0, 20 + i * 16);
    for (let x = 0; x <= 128; x += 16) g.lineTo(x, 20 + i * 16 + Math.sin(x * 0.2 + i) * 6);
    g.stroke();
  }
  g.fillStyle = '#c8473b'; g.beginPath(); g.arc(90, 30, 4, 0, 7); g.fill();
  g.fillStyle = '#333'; g.font = 'bold 12px serif'; g.fillText('潮汐 14:30', 10, 14);
  return c;
}
function photoCanvas() {
  const [c, g] = makeCanvas(96, 72);
  g.fillStyle = '#f4ead8'; g.fillRect(0, 0, 96, 72);
  const sky = g.createLinearGradient(0, 0, 0, 40);
  sky.addColorStop(0, '#a9d4e2'); sky.addColorStop(1, '#dceef0');
  g.fillStyle = sky; g.fillRect(6, 6, 84, 36);
  g.fillStyle = '#3d7a80'; g.fillRect(6, 36, 84, 20);
  g.fillStyle = '#f2f0ea';
  g.beginPath(); g.moveTo(30, 38); g.lineTo(50, 20); g.lineTo(70, 38); g.fill();
  g.fillStyle = '#333'; g.fillRect(44, 28, 12, 10);
  return c;
}
function labelCanvas(text) {
  const [c, g] = makeCanvas(128, 48);
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#2c5b63'; g.font = 'bold 30px "Yu Gothic","Meiryo",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 24);
  return c;
}
function lifeRingCanvas() {
  const [c, g] = makeCanvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.lineWidth = 12;
  g.strokeStyle = '#e8782e';
  g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke();
  g.strokeStyle = '#f4f2ec';
  for (const a of [0.5, 2.1, 3.6, 5.3]) {
    g.beginPath(); g.arc(32, 32, 22, a - 0.32, a + 0.32); g.stroke();
  }
  return c;
}

/* ---------- 船体几何（程序化） ---------- */
function hullGeometry(L, W, D) {
  const sec = [
    { x: -L / 2, w: W * 0.46, top: 0, bot: -D * 0.78 },
    { x: -L * 0.28, w: W * 0.5, top: 0.02, bot: -D },
    { x: L * 0.08, w: W * 0.5, top: 0.02, bot: -D },
    { x: L * 0.36, w: W * 0.38, top: -0.02, bot: -D * 0.8 },
    { x: L / 2 - 0.05, w: 0.05, top: -0.12, bot: -D * 0.3 },
  ];
  const verts = [], idx = [];
  // 每站 6 点：左右上、左右中(chine)、左右底
  for (const s of sec) {
    verts.push(
      s.x, s.top, -s.w,
      s.x, s.top, s.w,
      s.x, s.bot * 0.55, -s.w * 0.72,
      s.x, s.bot * 0.55, s.w * 0.72,
      s.x, s.bot, -s.w * 0.12,
      s.x, s.bot, s.w * 0.12,
    );
  }
  function quad(a, b, c, d) { idx.push(a, b, d, b, c, d); }
  for (let i = 0; i < sec.length - 1; i++) {
    const a = i * 6, b = (i + 1) * 6;
    quad(a, b, b + 2, a + 2);         // 左舷
    quad(b + 1, a + 1, a + 3, b + 3); // 右舷
    quad(a + 2, b + 2, b + 4, a + 4); // 左底
    quad(b + 3, a + 3, a + 5, b + 5); // 右底
    quad(a + 4, b + 4, b + 5, a + 5); // 船底中
  }
  // 艉封板
  idx.push(0, 2, 4, 1, 5, 3, 0, 4, 5, 0, 5, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- 舱内物品 ---------- */
function buildCabinInterior(parent, cabL, cabW, cabH) {
  const inG = new THREE.Group();
  inG.position.y = 0;
  parent.add(inG);

  // 仪表盘台
  const dash = box(cabL * 0.7, 0.5, cabW * 0.28, MAT.dark, 0x101417, true);
  dash.position.set(cabL / 2 - 0.35, 0.72, 0);
  inG.add(dash);

  // 船舵
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20), MAT.rust);
  wheel.add(ring);
  for (let i = 0; i < 3; i++) {
    const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), MAT.rust);
    spk.position.set(Math.cos(i * 2.094) * 0.09, Math.sin(i * 2.094) * 0.09, 0);
    spk.rotation.z = i * 2.094;
    wheel.add(spk);
  }
  wheel.position.set(cabL / 2 - 0.18, 0.95, -cabW * 0.18);
  wheel.rotation.y = Math.PI / 2;
  wheel.userData.isWheel = true;
  inG.add(wheel);
  inG.userData.wheel = wheel;
  parent.userData.wheelGroup = wheel;

  // 发光雷达屏 + 鱼探仪
  const scrMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(radarScreenCanvas(), 1, 1, true), side: THREE.DoubleSide });
  const scr1 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), scrMat);
  scr1.position.set(cabL / 2 - 0.55, 1.06, -cabW * 0.12);
  scr1.rotation.y = Math.PI / 2;
  inG.add(scr1);
  const scrMat2 = new THREE.MeshBasicMaterial({ map: texFromCanvas(fishScreenCanvas(), 1, 1, true), side: THREE.DoubleSide });
  const scr2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), scrMat2);
  scr2.position.set(cabL / 2 - 0.56, 1.0, cabW * 0.2);
  scr2.rotation.y = Math.PI / 2;
  inG.add(scr2);
  const scrLight = new THREE.PointLight(0x39ffb0, 0.5, 3);
  scrLight.position.set(cabL / 2 - 0.7, 1.1, 0);
  inG.add(scrLight);
  inG.userData.scrLight = scrLight;

  // 夹在板上的海图与潮汐表
  const chartMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(chartCanvas(), 1, 1, true), side: THREE.DoubleSide });
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), chartMat);
  chart.position.set(-cabL * 0.05, 1.15, -cabW / 2 + 0.03);
  inG.add(chart);
  const clip = box(0.12, 0.05, 0.04, MAT.iron, 0, true);
  clip.position.set(-cabL * 0.05, 1.4, -cabW / 2 + 0.03);
  inG.add(clip);

  // 保温壶 + 搪瓷杯
  const thermos = cyl(0.09, 0.1, 0.4, 12, toon(0xc8473b), 0, true);
  thermos.position.set(-cabL * 0.28, 0.55, cabW * 0.2);
  inG.add(thermos);
  const cup = cyl(0.07, 0.06, 0.12, 12, toon(0xe9f0ec), 0, true);
  cup.position.set(-cabL * 0.12, 0.42, cabW * 0.24);
  inG.add(cup);

  // 挂在钩上的黄色雨衣
  const coat = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.85),
    new THREE.MeshToonMaterial({ color: 0xe8c12e, side: THREE.DoubleSide, gradientMap: H.toonGrad }));
  coat.position.set(-cabL / 2 + 0.06, 0.9, -cabW * 0.1);
  coat.rotation.y = -Math.PI / 2;
  inG.add(coat);
  const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2),
    new THREE.MeshToonMaterial({ color: 0xdcb425, side: THREE.DoubleSide, gradientMap: H.toonGrad }));
  sleeve.position.set(-cabL / 2 + 0.07, 1.15, -cabW * 0.1);
  sleeve.rotation.y = -Math.PI / 2;
  inG.add(sleeve);

  // 护身符（窗边红白小袋）
  const omamori = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xe8544a, side: THREE.DoubleSide }));
  omamori.position.set(cabL / 2 - 0.3, 1.28, cabW / 2 - 0.04);
  omamori.rotation.y = 0;
  inG.add(omamori);
  const stringM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), MAT.iron);
  stringM.position.set(cabL / 2 - 0.3, 1.38, cabW / 2 - 0.04);
  inG.add(stringM);

  // 渔获照片
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(photoCanvas(), 1, 1, true), side: THREE.DoubleSide }));
  photo.position.set(cabL / 2 - 0.08, 1.3, cabW / 2 - 0.035);
  inG.add(photo);

  // 座位
  const seat = box(0.7, 0.4, cabW * 0.5, MAT.woodDark, 0, true);
  seat.position.set(-cabL * 0.1, 0.45, 0);
  inG.add(seat);
}

/* ---------- 一艘船 ---------- */
function buildBoat(opts) {
  const { len, wid, dep, hullColor, cabin: hasCabin, name, awning } = opts;
  const grp = new THREE.Group();
  const hullMat = toon(hullColor);
  const hullMesh = new THREE.Mesh(hullGeometry(len, wid, dep), hullMat);
  hullMesh.castShadow = true; hullMesh.receiveShadow = true;
  grp.add(hullMesh);
  const hullOL = new THREE.Mesh(hullGeometry(len, wid, dep),
    new THREE.MeshBasicMaterial({ color: 0x35505c, side: THREE.BackSide }));
  hullOL.scale.setScalar(1.02);
  grp.add(hullOL);

  // 甲板
  const deck = box(len * 0.82, 0.08, wid * 0.8, MAT.wood, 0x4a3826);
  deck.position.set(-len * 0.04, 0.02, 0);
  grp.add(deck);
  // 船底深青色吃水带
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x2b4a52 });
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.12, 0.04), stripeMat);
  stripeL.position.set(-len * 0.03, -dep * 0.72, wid * 0.42);
  grp.add(stripeL);
  const stripeR = stripeL.clone(); stripeR.position.z = -wid * 0.42; grp.add(stripeR);

  // 斑驳锈迹（小贴片）
  const r = mulberry32(opts.seed || 1);
  const rustMat = new THREE.MeshBasicMaterial({ color: 0x9a5a30, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.08 + r() * 0.1, 7), rustMat);
    p.position.set(-len * 0.3 + r() * len * 0.5, -0.1 - r() * dep * 0.5, wid * 0.44 + 0.01);
    p.rotation.y = Math.PI;
    p.scale.set(1, 0.7, 1);
    grp.add(p);
  }

  // 船舷栏杆
  const railMat = MAT.iron;
  for (const side of [-1, 1]) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len * 0.7, 6), railMat);
    top.rotation.z = Math.PI / 2;
    top.position.set(-len * 0.05, 0.55, side * wid * 0.42);
    grp.add(top);
    for (let k = -2; k <= 2; k++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), railMat);
      post.position.set(k * len * 0.14, 0.3, side * wid * 0.42);
      grp.add(post);
    }
  }

  // 救生圈
  const lrMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(lifeRingCanvas(), 1, 1, true), transparent: true, side: THREE.DoubleSide });
  const lr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), lrMat);
  lr.position.set(-len * 0.1, 0.42, wid * 0.46);
  grp.add(lr);

  // 轮胎护舷
  const fenderMat = toon(0x22282b);
  for (const fx of [-len * 0.22, len * 0.12]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 14), fenderMat);
    f.position.set(fx, -dep * 0.35, wid * 0.42);
    f.rotation.y = Math.PI / 2;
    f.castShadow = true;
    grp.add(f);
  }

  // 船名号
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(labelCanvas(name), 1, 1, true), side: THREE.DoubleSide }));
  nm.position.set(-len * 0.32, 0.02, wid * 0.46);
  grp.add(nm);

  let cabin = null;
  if (hasCabin) {
    cabin = new THREE.Group();
    const cabL = len * 0.32, cabW = wid * 0.74, cabH = 1.15;
    cabin.position.set(len * 0.06, 0.05, 0);
    // 舱壁（三块，前面留敞开的舱门在船尾侧）
    const wallMat = hullMat;
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.08, cabH, cabW), wallMat);
    front.position.set(cabL / 2, cabH / 2, 0); front.castShadow = true;
    cabin.add(front);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(cabL, cabH, 0.07), wallMat);
    sideL.position.set(0, cabH / 2, -cabW / 2); sideL.castShadow = true;
    cabin.add(sideL);
    const sideR = sideL.clone(); sideR.position.z = cabW / 2; cabin.add(sideR);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, cabH * 0.5, cabW), wallMat);
    back.position.set(-cabL / 2, cabH * 0.75, 0);
    cabin.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cabL + 0.2, 0.1, cabW + 0.2), hullMat);
    roof.position.set(0, cabH + 0.05, 0); roof.castShadow = true;
    cabin.add(roof);
    // 舱顶内侧水面粼粼反光
    const causC = document.createElement('canvas'); causC.width = 128; causC.height = 64;
    const cgx = causC.getContext('2d');
    const causTex = new THREE.CanvasTexture(causC);
    const causPatch = new THREE.Mesh(new THREE.PlaneGeometry(cabL * 0.85, cabW * 0.8),
      new THREE.MeshBasicMaterial({ map: causTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    causPatch.rotation.x = Math.PI / 2;
    causPatch.position.set(0, cabH - 0.02, 0);
    cabin.add(causPatch);
    const causPhase = r() * 7;
    cabin.userData.caus = { c: causC, g: cgx, tex: causTex, phase: causPhase };
    // 玻璃窗
    const winMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe4ea, roughness: 0.1, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const winF = new THREE.Mesh(new THREE.PlaneGeometry(cabW * 0.8, cabH * 0.4), winMat);
    winF.position.set(cabL / 2 + 0.045, cabH * 0.62, 0);
    winF.rotation.y = Math.PI / 2;
    cabin.add(winF);
    for (const side of [-1, 1]) {
      const wn = new THREE.Mesh(new THREE.PlaneGeometry(cabL * 0.6, cabH * 0.4), winMat);
      wn.position.set(0.05, cabH * 0.62, side * (cabW / 2 + 0.04));
      cabin.add(wn);
    }
    // 敞开的舱门（后端开口，挂半截门帘感的雨门框）
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, cabH * 0.55, 0.06), wallMat);
    doorFrame.position.set(-cabL / 2 - 0.02, cabH * 0.28, 0);
    cabin.add(doorFrame);
    // 舱顶设备：桅杆、天线、雷达罩、遮阳铁架
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 8), MAT.iron);
    mast.position.set(-cabL * 0.2, cabH + 0.85, 0);
    cabin.add(mast);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5), MAT.iron);
    antenna.position.set(cabL * 0.2, cabH + 0.65, -cabW * 0.2);
    antenna.rotation.z = 0.12;
    cabin.add(antenna);
    const radome = sph(0.22, toon(0xe8e6e0), 0x777, 16, 10, true);
    radome.position.set(cabL * 0.15, cabH + 0.22, cabW * 0.18);
    radome.scale.y = 0.7;
    cabin.add(radome);
    if (awning) {
      // 遮阳铁架 + 布篷（后半甲板）
      const frame = new THREE.Group();
      for (const sx of [-0.1, 0.5]) for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), MAT.iron);
        p.position.set(-len * 0.34 + sx * 0.6, 0.6, sz * wid * 0.3);
        frame.add(p);
      }
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, wid * 0.7),
        new THREE.MeshToonMaterial({ color: 0xd9b84c, gradientMap: H.toonGrad }));
      cloth.position.set(-len * 0.12, 1.15, 0);
      frame.add(cloth);
      grp.add(frame);
    }
    buildCabinInterior(cabin, cabL, cabW, cabH);
    // 穿过前窗的淡金光柱（随船移动）
    if (H.addGodRay) {
      const gr = H.addGodRay(new THREE.Vector3(), null, 1.3, 2.2, 0.3);
      scene.remove(gr);
      cabin.add(gr);
      gr.position.set(cabL * 0.1, 0.85, 0);
      cabin.userData.godRay = gr;
    }
    grp.add(cabin);
    cabinRefs.set(grp, cabin);
  }

  // 顶桅航行灯（红点）
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff5544 }));
  navL.position.set(len * 0.06 - (hasCabin ? len * 0.32 * 0.2 : 0), hasCabin ? 2.5 : 0.8, 0);
  grp.add(navL);

  grp.userData = {
    len, wid, dep, hasCabin, r,
    bobPhase: r() * 7, bobSpeed: 0.7 + r() * 0.3,
    home: new THREE.Vector3(),
    moored: true,
  };
  return grp;
}
H.buildBoat = buildBoat;

/* ---------- 摆放泊位 ---------- */
function placeBoats() {
  // 南泊位：船靠南墙、船头朝东
  const defs = [
    { pos: [6.5, 0, 1.55], rot: 0, len: 5.4, wid: 1.9, dep: 0.85, color: 0xf4f2ec, cabin: true, name: 'ひだまり', awning: true, seed: 101, outermost: true },
    { pos: [14.5, 0, 1.5], rot: 0, len: 4.4, wid: 1.6, dep: 0.7, color: 0xe2ecee, cabin: true, name: 'しおさい', seed: 102 },
    { pos: [21.5, 0, 1.45], rot: 0, len: 3.8, wid: 1.4, dep: 0.6, color: 0xf4f2ec, cabin: false, name: 'はな', seed: 103 },
    // 西泊位：靠西墙，船头朝北
    { pos: [-9.7, 0, -4], rot: Math.PI / 2, len: 4.8, wid: 1.7, dep: 0.78, color: 0xeaf1f2, cabin: true, name: 'なみま', seed: 104 },
    { pos: [-9.6, 0, -12.5], rot: Math.PI / 2, len: 4.0, wid: 1.5, dep: 0.65, color: 0xf4f2ec, cabin: false, name: 'ゆう', seed: 105 },
  ];
  for (const d of defs) {
    const b = buildBoat({
      len: d.len, wid: d.wid, dep: d.dep, hullColor: d.color,
      cabin: d.cabin, name: d.name, awning: d.awning, seed: d.seed,
    });
    b.position.set(d.pos[0], LAYOUT.waterY + d.dep * 0.18, d.pos[2]);
    b.rotation.y = d.rot;
    b.userData.home.copy(b.position);
    b.userData.homeRot = d.rot;
    b.userData.outermost = !!d.outermost;
    scene.add(b);
    boats.push(b);
    // 色块化倒影
    H.addReflector(
      () => new THREE.Vector3(b.position.x, 0, b.position.z),
      d.len * 0.5, d.wid * 0.9,
      d.color === 0xe2ecee ? 0x9fc2cc : 0x8fbcc4, 0.9);
  }
  H.movingBoat = boats[0];
}
placeBoats();

/* ---------- 出港路径 ---------- */
// 路径关键点（世界坐标，y 由波浪决定）
const cruisePath = [
  new THREE.Vector3(6.5, 0, 1.55),
  new THREE.Vector3(16, 0, 0),
  new THREE.Vector3(26, 0, -6),
  new THREE.Vector3(27, 0, -22),
  new THREE.Vector3(14, 0, -27.4),
  new THREE.Vector3(-2, 0, -27.2),
  new THREE.Vector3(6, 0, -20),
  new THREE.Vector3(14, 0, -10),
  new THREE.Vector3(16, 0, 0),
  new THREE.Vector3(6.5, 0, 1.55),
];
H.cruisePath = cruisePath;
let cruise = null;
H.startCruise = function (t0) {
  const b = H.movingBoat;
  if (cruise) return;
  cruise = { t0, dur: 46, boat: b };
  b.userData.moored = false;
};
H.isCruising = () => !!cruise;

function samplePath(u) {
  // 沿折线按弧长
  const P = cruisePath;
  const segL = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const l = P[i].distanceTo(P[i + 1]);
    segL.push(l); total += l;
  }
  let d = clamp(u, 0, 1) * total;
  for (let i = 0; i < segL.length; i++) {
    if (d <= segL[i]) {
      const f = d / segL[i];
      const pos = P[i].clone().lerp(P[i + 1], f);
      const dir = P[i + 1].clone().sub(P[i]).normalize();
      return { pos, dir };
    }
    d -= segL[i];
  }
  return { pos: P[P.length - 1].clone(), dir: new THREE.Vector3(0, 0, 1) };
}
H.samplePath = samplePath;

/* ---------- 白色航迹（泡沫带） ---------- */
const wakeCanvas = document.createElement('canvas');
wakeCanvas.width = 8; wakeCanvas.height = 64;
{
  const wg = wakeCanvas.getContext('2d');
  const grd = wg.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  wg.fillStyle = grd; wg.fillRect(0, 0, 8, 64);
}
const wakeTex = new THREE.CanvasTexture(wakeCanvas);
const wakes = []; // {mesh,life,max}
H.spawnWake = function (pos, dir) {
  if (wakes.length > 60) { const old = wakes.shift(); scene.remove(old.mesh); }
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5),
      new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, color: 0xffffff }));
    const sidev = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side * 0.5);
    m.position.copy(pos).add(sidev);
    m.position.y = LAYOUT.waterY + 0.08;
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(dir.x, dir.z);
    m.renderOrder = 5;
    scene.add(m);
    wakes.push({ m, life: 0, max: 7 });
  }
};
/* 航迹浪经过浮标/泊位船时的轻晃：记录扰动传播 */
H.wakeWaves = []; // {t0, path samples}
function nearSegment(p, t0) {
  // 简化：浮标船按距离航迹折线远近 + 时间衰减
  return null;
}

/* ---------- 缆绳（绕系船柱数圈、垂入水中、浸水段变深、时紧时松） ---------- */
const ropes = [];
function ropeMesh(mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1, 7), mat);
}
function makeRope(postPos, toBoat, wet) {
  const dry = ropeMesh(MAT.rope);
  const wetM = ropeMesh(MAT.ropeWet);
  scene.add(dry, wetM);
  // 绕柱两圈的环
  const coils = [];
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 16), MAT.rope);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(postPos.x, postPos.y - 0.08 - i * 0.12, postPos.z);
    scene.add(ring);
    coils.push(ring);
  }
  // 从柱身到船的连接点（环底）
  const from = new THREE.Vector3(postPos.x, postPos.y - 0.2, postPos.z);
  const rec = { dry, wetM, coils, from, toBoat, phase: H.R() * 7, post: postPos.clone() };
  ropes.push(rec);
  return rec;
}
H.makeRope = makeRope;
H.ropes = ropes;
function setCylinderBetween(m, a, b) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-4) { m.visible = false; return; }
  m.visible = true;
  m.position.copy(a).lerp(b, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

/* ---------- 更新 ---------- */
let wakeTick = 0;
onUpdate((t, dt) => {
  const b0 = H.movingBoat;
  // 巡航推进
  if (cruise) {
    const u = (t - cruise.t0) / cruise.dur;
    if (u >= 1) {
      b0.position.copy(b0.userData.home);
      b0.rotation.y = b0.userData.homeRot;
      b0.userData.moored = true;
      cruise = null;
    } else {
      const ease = u < 0.08 ? smoothstep(0, 0.08, u) : (u > 0.92 ? 1 - smoothstep(0.92, 1, u) : 1);
      const uu = ease * 0.98 + 0.01 * smoothstep(0, 1, u);
      const s = samplePath(u);
      const wh = H.waveHeight(s.pos.x, s.pos.z, t);
      b0.position.set(s.pos.x, LAYOUT.waterY + 0.16 + wh * 0.4, s.pos.z);
      b0.rotation.y = Math.atan2(s.dir.x, s.dir.z);
      b0.position.y += Math.sin(t * 3) * 0.05;
      // 船尾航迹
      if ((wakeTick++ % 4) === 0) {
        const stern = s.pos.clone().add(s.dir.clone().multiplyScalar(-2.4));
        H.spawnWake(stern, s.dir);
        H.wakeWaves.push({ x: stern.x, z: stern.z, t0: t });
      }
    }
  }
  // 所有船轻晃
  for (const b of boats) {
    const u = b.userData;
    const ph = u.bobPhase, sp = u.bobSpeed;
    const wh = H.waveHeight(b.position.x, b.position.z, t);
    const targetY = (u === b0.userData && cruise) ? b.position.y
      : u.home.y + wh * 0.35;
    if (!(u === b0.userData && cruise)) {
      b.position.y = targetY;
      // 航迹浪影响
      let push = 0;
      for (const ww of H.wakeWaves) {
        const age = t - ww.t0;
        if (age < 0 || age > 6) continue;
        const d = Math.hypot(b.position.x - ww.x, b.position.z - ww.z);
        const ring = age * 4.2;
        push += Math.exp(-((d - ring) ** 2) / 3) * Math.exp(-age * 0.4) * 0.06;
      }
      // 护舷偶尔轻碰岸壁（沿船身法向的小幅平移）
      const bump = Math.max(0, Math.sin(t * 0.5 + ph * 2.3) - 0.93) * 0.5;
      const nx = Math.sin(u.homeRot), nz = Math.cos(u.homeRot);
      b.position.x = u.home.x - nx * bump + nx * push;
      b.position.z = u.home.z - nz * bump + nz * push;
      b.rotation.y = u.homeRot;
      b.rotation.x = Math.sin(t * sp + ph) * 0.03 + push;
      b.rotation.z = Math.cos(t * sp * 0.8 + ph) * 0.025;
      b.position.y += push * 0.2;
    } else {
      b.rotation.z = Math.sin(t * 1.4) * 0.04;
      b.rotation.x = 0.02;
    }
    // 舵轮随波轻转
    if (u.hasCabin && b.userData.wheelGroup) {
      b.userData.wheelGroup.rotation.x = Math.sin(t * 0.8 + ph) * 0.12;
    }
    // 舱顶粼光摇曳
    if (u.hasCabin && cabinRefs.has(b) && cabinRefs.get(b).userData.caus) {
      const cr = cabinRefs.get(b).userData.caus;
      const c = cr.c, gx = cr.g, tex = cr.tex;
      gx.clearRect(0, 0, c.width, c.height);
      gx.fillStyle = 'rgba(190,235,235,0.5)';
      for (let i = 0; i < 16; i++) {
        const x = (i * 31 + t * 16 + cr.phase * 20) % 150 - 11;
        const y = 16 + Math.sin(i * 2.1 + t * 1.5) * 14;
        gx.beginPath(); gx.ellipse(x, y, 8 + Math.sin(t + i) * 4, 2.2, 0, 0, 7); gx.fill();
      }
      tex.needsUpdate = true;
    }
  }
  // 航迹淡出
  for (let i = wakes.length - 1; i >= 0; i--) {
    const w = wakes[i];
    w.life += dt;
    const k = w.life / w.max;
    w.m.material.opacity = 1 - k;
    w.m.scale.set(1 + k * 1.6, 1 + k * 0.4, 1);
    if (k >= 1) { scene.remove(w.m); wakes.splice(i, 1); }
  }
  if (H.wakeWaves.length) {
    H.wakeWaves = H.wakeWaves.filter(w => t - w.t0 < 7);
  }
  // 缆绳更新：柱上环 → 干段 → 水面 → 水中湿段（船随波起伏时绳时紧时松）
  const waterY = LAYOUT.waterY;
  for (const rp of ropes) {
    const b = rp.toBoat;
    const vis = b.userData.moored;
    rp.dry.visible = rp.wetM.visible = vis;
    rp.coils.forEach(c => c.visible = vis);
    if (!vis) continue;
    const side = rp.post.x < b.position.x ? -1 : 1;
    let lx = 0, lz = 0;
    if (Math.abs(Math.sin(b.rotation.y)) > 0.5) lx = b.userData.wid * 0.5 * side;
    else lz = b.userData.wid * 0.5 * side;
    const to = new THREE.Vector3(lx, 0, lz);
    b.localToWorld(to);
    to.y = 0.12;
    const from = rp.from;
    const slack = 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.7 + rp.phase));
    // 缆绳在柱与船之间经过水面：按 y 插值找与 waterY 的交点
    const f = (waterY + 0.05 - from.y) / (to.y - from.y);
    const fClamped = THREE.MathUtils.clamp(f, 0.15, 0.95);
    const wetPt = from.clone().lerp(to, fClamped);
    const mid = from.clone().lerp(wetPt, 0.5); mid.y -= slack;
    // 干段（柱→水面），湿段（水面→船舷，颜色变深并略带垂度入水）
    setCylinderBetween(rp.dry, from, mid);
    setCylinderBetween(rp.wetM, wetPt, to);
  }
});

})();
