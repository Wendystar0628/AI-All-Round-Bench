/* ============================================================
   buildings.js — 渔协仓库（半拉卷帘门+室内+光柱）、候船室（落地玻璃+室内）
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, pick, MAT, toon, box, cyl, sph, toonMesh, outline,
  clamp, lerp, smoothstep, LAYOUT, mulberry32, makeCanvas, texFromCanvas, addGodRay } = H;

/* 招牌画布 */
function textBoard(text, sub, bg, fg, w, h) {
  const [c, g] = makeCanvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${h * 0.5}px "Yu Gothic","Meiryo",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, sub ? h * 0.36 : h / 2);
  if (sub) {
    g.font = `bold ${h * 0.22}px "Yu Gothic","Meiryo",sans-serif`;
    g.fillText(sub, w / 2, h * 0.74);
  }
  // 褪色
  g.globalAlpha = 0.14; g.fillStyle = '#fff';
  for (let i = 0; i < 120; i++) g.fillRect(R() * w, R() * h, RR(2, 10), RR(1, 4));
  g.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

/* 地板反光水渍（室内） */
function wetPatchCanvas() {
  const [c, g] = makeCanvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  const grd = g.createRadialGradient(64, 32, 4, 64, 32, 50);
  grd.addColorStop(0, 'rgba(200,230,238,0.5)');
  grd.addColorStop(1, 'rgba(200,230,238,0)');
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(64, 32, 54, 22, 0, 0, 7); g.fill();
  return c;
}

/* ============================================================
   渔协仓库
   ============================================================ */
function buildWarehouse() {
  const g = new THREE.Group();
  const W = 10, D = 8, Hh = 5.2, t = 0.25;
  const wallMat = toon(0xd8d2c4);
  const floorMat = toon(0x9aa3a2, { roughness: 0.4 });

  // 地板
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), floorMat);
  floor.position.y = 0.1; floor.receiveShadow = true;
  g.add(floor);
  // 后墙、侧墙、顶板（前脸朝港池 +x）
  const back = box(W, Hh, t, wallMat, 0x8a8478); back.position.set(0, Hh / 2, -D / 2 + t / 2); g.add(back);
  const sideA = box(t, Hh, D, wallMat, 0x8a8478); sideA.position.set(-W / 2 + t / 2, Hh / 2, 0); g.add(sideA);
  const sideB = sideA.clone(); sideB.position.x = W / 2 - t / 2; g.add(sideB);
  const ceil = box(W, t, D, toon(0xc8c2b4), 0x8a8478); ceil.position.set(0, Hh, 0); g.add(ceil);
  // 前脸两侧立柱 + 门楣
  const colMat = toon(0xb9b2a2);
  for (const dz of [-D / 2 + 0.4, D / 2 - 0.4]) {
    const p = box(0.5, Hh, 0.5, colMat, 0x7a7468); p.position.set(W / 2 - 0.25, Hh / 2, dz); g.add(p);
  }
  const lintel = box(0.4, 1.2, D - 0.8, colMat, 0x7a7468);
  lintel.position.set(W / 2 - 0.2, Hh - 0.6, 0); g.add(lintel);

  /* 半拉起卷帘门（波纹金属片，悬在门楣下方） */
  const doorMat = toon(0x8c9699);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, D - 1.2), doorMat);
  door.position.set(W / 2 + 0.02, Hh - 1.45, 0);
  door.castShadow = true;
  g.add(door);
  // 门片横向波纹
  for (let i = 0; i < 9; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, D - 1.2), MAT.iron);
    rib.position.set(W / 2 + 0.06, Hh - 0.75 - i * 0.18, 0);
    g.add(rib);
  }
  // 卷帘盒
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, D - 1.1, 12), doorMat);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(W / 2 + 0.05, Hh - 0.55, 0);
  g.add(drum);

  /* 高窗（后墙上部，阳光穿入） */
  const winMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff2cc, transparent: true, opacity: 0.5, emissive: 0xffe6a8,
    emissiveIntensity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), winMat);
  win.position.set(0.5, Hh - 1.1, -D / 2 + t + 0.02);
  win.rotation.y = Math.PI;
  g.add(win);
  for (const dx of [-0.85, 0, 0.85]) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.04), MAT.iron);
    fr.position.set(0.5 + dx, Hh - 1.1, -D / 2 + t + 0.04); g.add(fr);
  }

  /* 室内：成垛鱼箱 */
  const r = mulberry32(701);
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 2; k++) {
        if (layer === 3 && (i + k) % 2) continue;
        const b = box(1.1, 0.5, 0.8, i % 2 ? toon(0x3f7fa8) : toon(0xeceff0), 0x4d5a5e);
        b.position.set(-3.2 + i * 1.2 + (r() - 0.5) * 0.1,
          0.35 + layer * 0.52,
          -2.4 + k * 0.9 + (r() - 0.5) * 0.08);
        g.add(b);
      }
    }
  }
  /* 冰柜 */
  const freezer = box(2.2, 0.9, 1.1, toon(0xe6e8e6), 0x8a9296);
  freezer.position.set(-2.6, 0.55, 1.6); g.add(freezer);
  const fzLid = box(2.3, 0.08, 1.2, toon(0xc8cece), 0x8a9296);
  fzLid.position.set(-2.6, 1.03, 1.6); fzLid.rotation.z = 0.06; g.add(fzLid);
  /* 磅秤 */
  const scaleBase = cyl(0.22, 0.28, 0.5, 12, toon(0x4e8a52), 0x2c4a30);
  scaleBase.position.set(1.2, 0.35, 1.2); g.add(scaleBase);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16),
    new THREE.MeshBasicMaterial({ color: 0xf4f0e0, side: THREE.DoubleSide }));
  dial.position.set(1.2, 0.72, 1.42); g.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.01), new THREE.MeshBasicMaterial({ color: 0xc8473b }));
  needle.position.set(1.2, 0.72, 1.43); needle.rotation.z = -0.5; g.add(needle);

  /* 墙上雨靴 */
  for (let i = 0; i < 3; i++) {
    const boot = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 8), toon(i === 1 ? 0xe8c12e : 0x2c3134));
    leg.position.y = 0.2; boot.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.3), toon(i === 1 ? 0xe8c12e : 0x2c3134));
    foot.position.set(0, 0.04, 0.1); boot.add(foot);
    boot.position.set(-1.6 + i * 0.45, 1.2, -D / 2 + t + 0.08);
    boot.rotation.x = -0.1;
    g.add(boot);
  }

  /* 黑板：拍卖价格 */
  const [bc, bg] = makeCanvas(256, 160);
  bg.fillStyle = '#2e4a3c'; bg.fillRect(0, 0, 256, 160);
  bg.strokeStyle = '#7a5a38'; bg.lineWidth = 8; bg.strokeRect(4, 4, 248, 152);
  bg.fillStyle = '#f0ecd8'; bg.font = 'bold 22px "Yu Gothic",serif';
  bg.fillText('せり値段', 16, 30);
  bg.font = '17px "Yu Gothic",serif';
  const fish = [['あじ', '120'], ['さば', '180'], ['たい', '650'], ['いか', '300'], ['ぶり', '980']];
  fish.forEach((f, i) => {
    bg.fillText(f[0], 24, 62 + i * 20);
    bg.fillText('¥' + f[1], 150, 62 + i * 20);
  });
  const blackboard = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(bc, 1, 1, true), side: THREE.DoubleSide }));
  blackboard.position.set(2.2, 2.6, -D / 2 + t + 0.02);
  blackboard.rotation.y = Math.PI;
  g.add(blackboard);

  /* 地面反光水渍 + 散落冰块 */
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wetPatchCanvas()), transparent: true, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(1.4, 0.215, 0.2);
  g.add(wet);
  for (let i = 0; i < 10; i++) {
    const ice = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + r() * 0.06, 0),
      new THREE.MeshBasicMaterial({ color: 0xdff0f4, transparent: true, opacity: 0.85 }));
    ice.position.set(-0.4 + r() * 4, 0.25, -1 + r() * 3);
    g.add(ice);
  }
  // 吊灯
  const lamp0 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  lamp0.position.set(0, Hh - 0.6, 1); g.add(lamp0);
  const lampL = new THREE.PointLight(0xffe6b0, 0.7, 10);
  lampL.position.copy(lamp0.position); g.add(lampL);

  /* 淡金色光柱（从高窗斜下） */
  const ray = addGodRay(new THREE.Vector3(), null, 5, 9, 0.42);
  ray.position.set(0.4, 2.6, -1.6);
  ray.scale.set(5.5, 9.5, 1);
  scene.remove(ray);
  g.add(ray);

  /* 天花板粼粼反光（水面反光投射） */
  const causCanvas = document.createElement('canvas');
  causCanvas.width = 256; causCanvas.height = 64;
  const cg = causCanvas.getContext('2d');
  function drawCaus(t) {
    cg.clearRect(0, 0, 256, 64);
    cg.fillStyle = 'rgba(190,235,235,0.55)';
    for (let i = 0; i < 26; i++) {
      const x = (i * 37 + t * 22) % 280 - 12;
      const y = 20 + Math.sin(i * 2.3 + t * 1.7) * 14;
      cg.beginPath();
      cg.ellipse(x, y, 10 + Math.sin(t + i) * 5, 2.6, 0, 0, 7);
      cg.fill();
    }
  }
  drawCaus(0);
  const causTex = new THREE.CanvasTexture(causCanvas);
  const caus = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 2.6),
    new THREE.MeshBasicMaterial({ map: causTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  caus.rotation.x = Math.PI / 2;
  caus.position.set(0, Hh - 0.12, 0.5);
  g.add(caus);

  /* 招牌 */
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8),
    new THREE.MeshBasicMaterial({
      map: textBoard('ひだまり漁協', 'FISHERIES COOP', '#3f6d76', '#eef4ec', 256, 64),
      side: THREE.DoubleSide,
    }));
  sign.position.set(-0.6, Hh + 0.35, D / 2 - 0.5);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);

  // 放在西堤岸内侧、面朝港池（+x 朝向水面）
  g.position.set(-11.4, 0, -22);
  scene.add(g);

  onUpdate((t) => {
    drawCaus(t);
    causTex.needsUpdate = true;
    lampL.intensity = 0.6 + (1 - H.sunCover()) * 0.25;
  });
}
function godRayReparent(ray, g) { /* ray 已 add 到 g，见下 */ }

/* ============================================================
   候船室
   ============================================================ */
function buildWaiting() {
  const g = new THREE.Group();
  const W = 7, D = 5, Hh = 3.4, t = 0.22;
  const wallMat = toon(0xe3ddd0);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), toon(0xb9aea0));
  floor.position.y = 0.1; floor.receiveShadow = true; g.add(floor);
  const back = box(W, Hh, t, wallMat, 0x8a8478); back.position.set(0, Hh / 2, -D / 2 + t / 2); g.add(back);
  const sideA = box(t, Hh, D, wallMat, 0x8a8478); sideA.position.set(-W / 2 + t / 2, Hh / 2, 0); g.add(sideA);
  const sideB = sideA.clone(); sideB.position.x = W / 2 - t / 2; g.add(sideB);
  // 顶板 + 挑檐
  const ceil = box(W + 0.6, 0.22, D + 0.8, toon(0x9a7458), 0x6e5038);
  ceil.position.set(0, Hh, 0.2); g.add(ceil);
  // 前脸落地玻璃窗：细框 + 玻璃
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe4ea, roughness: 0.1, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false, transmission: 0.4,
  });
  for (let i = 0; i < 3; i++) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(W / 3 - 0.14, Hh - 0.5), glassMat);
    gp.position.set(-W / 3 + i * W / 3, Hh / 2 - 0.1, D / 2 + 0.02);
    g.add(gp);
  }
  for (let i = 0; i <= 3; i++) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.08, Hh - 0.4, 0.08), MAT.iron);
    fr.position.set(-W / 2 + i * W / 3, Hh / 2 - 0.1, D / 2 + 0.03); g.add(fr);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.12), MAT.iron);
  sill.position.set(0, 0.35, D / 2 + 0.03); g.add(sill);

  /* 木长椅 */
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.6), MAT.wood);
  seat.position.y = 0.55; bench.add(seat);
  const backR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.1), MAT.wood);
  backR.position.set(0, 0.95, -0.28); bench.add(backR);
  for (const dx of [-1.4, 1.4]) for (const dz of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), MAT.iron);
    leg.position.set(dx, 0.27, dz); bench.add(leg);
  }
  bench.position.set(0, 0, -1.4);
  g.add(bench);

  /* 褪色航班时刻表（贴墙） */
  const [tc, tg] = makeCanvas(200, 240);
  tg.fillStyle = '#ece6d2'; tg.fillRect(0, 0, 200, 240);
  tg.fillStyle = '#3f6d76'; tg.font = 'bold 24px "Yu Gothic",sans-serif';
  tg.textAlign = 'center'; tg.fillText('時刻表', 100, 34);
  tg.strokeStyle = '#9a9078'; tg.lineWidth = 1;
  tg.font = '15px monospace'; tg.fillStyle = '#55503f';
  const times = ['6:24', '7:50', '9:15', '10:40', '12:05', '13:40', '15:10', '16:45', '18:05'];
  times.forEach((tt, i) => {
    tg.fillText(tt, 60, 66 + i * 19);
    tg.fillText('→ おきじま', 130, 66 + i * 19);
    tg.beginPath(); tg.moveTo(24, 74 + i * 19); tg.lineTo(176, 74 + i * 19); tg.stroke();
  });
  tg.globalAlpha = 0.18; tg.fillStyle = '#aaa';
  for (let i = 0; i < 80; i++) tg.fillRect(R() * 200, R() * 240, RR(2, 8), 2);
  const timetable = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(tc, 1, 1, true), side: THREE.DoubleSide }));
  timetable.position.set(-2.6, 2.0, -D / 2 + t + 0.03);
  timetable.rotation.y = Math.PI;
  g.add(timetable);

  /* 老式收音机 */
  const radio = new THREE.Group();
  const rb = box(0.8, 0.5, 0.35, toon(0x8a5a38), 0x4a2e1c);
  rb.position.y = 0.28; radio.add(rb);
  const spk = new THREE.Mesh(new THREE.CircleGeometry(0.13, 14),
    new THREE.MeshBasicMaterial({ color: 0x2c2420, side: THREE.DoubleSide }));
  spk.position.set(-0.18, 0.3, 0.19); radio.add(spk);
  const knob = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10),
    new THREE.MeshBasicMaterial({ color: 0xe8c12e }));
  knob.position.set(0.22, 0.32, 0.19); radio.add(knob);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 4), MAT.iron);
  ant.position.set(0.3, 0.95, 0); ant.rotation.z = -0.3; radio.add(ant);
  radio.position.set(1.6, 0.8, -1.0);
  g.add(radio);

  /* 热水壶 */
  const kettle = new THREE.Group();
  const kb = cyl(0.16, 0.14, 0.3, 12, toon(0xe8e4d8), 0x9a928a);
  kb.position.y = 0.15; kettle.add(kb);
  const lid = cyl(0.1, 0.12, 0.05, 12, MAT.iron); lid.position.y = 0.32; kettle.add(lid);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.18, 6), MAT.iron);
  spout.rotation.z = Math.PI / 2.4; spout.position.set(0.16, 0.24, 0); kettle.add(spout);
  const kh = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 12, Math.PI), MAT.iron);
  kh.position.y = 0.4; kettle.add(kh);
  kettle.position.set(2.6, 0.72, -0.9);
  g.add(kettle);

  /* 绿萝盆栽 */
  const pot = cyl(0.2, 0.15, 0.3, 12, toon(0xc8764a), 0x7a4426);
  pot.position.set(2.7, 0.88, -1.9); g.add(pot);
  const plant = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshToonMaterial({ color: pick([0x4e8a52, 0x5fa05a, 0x3c6e42]), gradientMap: H.toonGrad }));
    const a = (i / 9) * Math.PI * 2;
    leaf.scale.set(1, 0.5, 1.4);
    leaf.position.set(Math.cos(a) * 0.14, 0.2 + R() * 0.12, Math.sin(a) * 0.14);
    leaf.rotation.set(R(), a, R());
    plant.add(leaf);
  }
  plant.position.set(2.7, 0.95, -1.9);
  g.add(plant);

  /* 略歪斜的挂钟 */
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24),
    new THREE.MeshBasicMaterial({ color: 0xf4f0e0, side: THREE.DoubleSide }));
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 24), MAT.woodDark);
  clock.add(rim);
  const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.01), new THREE.MeshBasicMaterial({ color: 0x2c2420 }));
  hand1.position.y = 0.08; hand1.rotation.z = -0.6; clock.add(hand1);
  const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.01), new THREE.MeshBasicMaterial({ color: 0xc8473b }));
  hand2.position.y = 0.05; hand2.rotation.z = 1.1; clock.add(hand2);
  clock.position.set(0, 2.7, -D / 2 + t + 0.05);
  clock.rotation.y = Math.PI; clock.rotation.z = 0.06;
  g.add(clock);

  /* 室内灯 */
  const il = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  il.position.set(0, Hh - 0.5, 0); g.add(il);
  const pl = new THREE.PointLight(0xffe6b0, 0.5, 8);
  pl.position.copy(il.position); g.add(pl);

  /* 招牌 */
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7),
    new THREE.MeshBasicMaterial({
      map: textBoard('待合所', 'WAITING ROOM', '#e8e4d8', '#3f6d76', 256, 64),
      side: THREE.DoubleSide,
    }));
  sign.position.set(0, Hh + 0.18, D / 2 - 0.2);
  sign.rotation.x = -0.1;
  g.add(sign);

  // 放在南堤岸、玻璃面朝港池(-z)
  g.position.set(25.5, 0, 10.2);
  scene.add(g);
}

buildWarehouse();
buildWaiting();

})();
