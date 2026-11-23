import * as THREE from 'three';
import {
  PAL, WATER_Y, QUAY_Y, toon, flat, addOutline, canvasTex, box, cyl, sph,
  mulberry32, hash1, clamp, lerp, shadowify,
} from './common.js';

function panelTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cfcfc6'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(90,92,86,0.25)';
      g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.fillRect(x + 2, 0, 2, h);
    }
    const rng = mulberry32(12);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(80,82,76,${0.04 + rng() * 0.07})`;
      g.fillRect(rng() * w, rng() * h, 3 + rng() * 8, 2 + rng() * 5);
    }
  }, { repeat: [4, 2] });
}

function slatTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = '#b9bcbe'; g.fillRect(0, y, w, 7);
      g.fillStyle = 'rgba(60,64,68,0.6)'; g.fillRect(0, y + 7, w, 3);
    }
    const rng = mulberry32(34);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(110,80,50,${0.08 + rng() * 0.12})`;
      g.fillRect(rng() * w, rng() * h, 4 + rng() * 10, 2 + rng() * 4);
    }
  }, { repeat: [6, 3] });
}

function blackboardTexture() {
  return canvasTex(320, 200, (g, w, h) => {
    g.fillStyle = '#2e4a3a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6f4e'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
    g.fillStyle = '#f0ead8';
    g.font = 'bold 26px sans-serif'; g.textAlign = 'left';
    g.fillText('本日の競り', 18, 40);
    g.font = '22px sans-serif';
    g.fillText('マグロ   1,200円', 24, 80);
    g.fillText('サバ       480円', 24, 112);
    g.fillText('アジ       360円', 24, 144);
    g.fillText('イカ       800円', 24, 176);
    const rng = mulberry32(56);
    g.fillStyle = 'rgba(240,234,216,0.15)';
    for (let i = 0; i < 8; i++) g.fillRect(rng() * w, rng() * h, 20 + rng() * 40, 3);
  });
}

function timetableTexture() {
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a5a7a'; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#f0ead8';
    g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
    g.fillText('商船 時刻表', w / 2, 38);
    g.fillStyle = '#2e2e2c';
    g.font = '18px sans-serif';
    const rows = [
      ['のりまき', '06:20'], ['いそべ', '07:45'], ['かみさま', '09:10'],
      ['おおずみ', '11:30'], ['ひのかみ', '13:15'], ['なりさと', '15:40'],
      ['もりやま', '17:20'],
    ];
    rows.forEach((r, i) => {
      const y = 84 + i * 32;
      g.textAlign = 'left'; g.fillText(r[0], 22, y);
      g.textAlign = 'right'; g.fillText(r[1], w - 22, y);
      g.strokeStyle = 'rgba(60,60,56,0.35)';
      g.beginPath(); g.moveTo(18, y + 8); g.lineTo(w - 18, y + 8); g.stroke();
    });
    g.fillStyle = 'rgba(90,80,60,0.25)';
    for (let i = 0; i < 12; i++) {
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, 7); g.fill();
    }
  });
}

function dialTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.strokeStyle = '#3a3a36'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
    g.font = 'bold 16px sans-serif'; g.textAlign = 'center';
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + i * Math.PI * 1.5 / 8;
      const x1 = 64 + Math.cos(a) * 44, y1 = 64 - Math.sin(a) * 44;
      const x2 = 64 + Math.cos(a) * 52, y2 = 64 - Math.sin(a) * 52;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.fillText(String(i * 2), 64 + Math.cos(a) * 34, 68 - Math.sin(a) * 34);
    }
    g.strokeStyle = '#c4483a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(2.4) * 46, 64 - Math.sin(2.4) * 46); g.stroke();
  });
}

function radioTexture() {
  return canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#6b4f37'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a2e22'; g.fillRect(10, 12, 58, 72);
    g.strokeStyle = '#8f7a5a'; g.lineWidth = 2;
    for (let y = 16; y < 84; y += 6) { g.beginPath(); g.moveTo(14, y); g.lineTo(64, y); g.stroke(); }
    g.fillStyle = '#e8dfc8'; g.fillRect(76, 14, 42, 26);
    g.fillStyle = '#3a3a36'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    g.fillText('AM 1440', 97, 32);
    g.fillStyle = '#2e2e2c';
    g.beginPath(); g.arc(88, 62, 8, 0, 7); g.fill();
    g.beginPath(); g.arc(110, 62, 8, 0, 7); g.fill();
    g.fillStyle = '#c9c2b0';
    g.beginPath(); g.arc(88, 62, 3, 0, 7); g.fill();
    g.beginPath(); g.arc(110, 62, 3, 0, 7); g.fill();
  });
}

function clockTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f0ece0'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.strokeStyle = '#4a463c'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
    g.fillStyle = '#3a3a36'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = i * Math.PI / 6 - Math.PI / 2;
      g.fillText(String(i), 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    }
  });
}

function plankTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a8896a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(${120 + Math.random() * 40},${90 + Math.random() * 30},${60 + Math.random() * 20},0.35)`;
      g.fillRect(0, y, w, 30);
      g.fillStyle = 'rgba(50,36,24,0.6)'; g.fillRect(0, y + 30, w, 2);
      g.fillRect(((y / 32) % 2) * 128, y, 2, 30);
    }
  }, { repeat: [3, 3] });
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildBuildings(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const panelTex = panelTexture();
  const wallMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: panelTex });
  const trimMat = toon(0x6b6f72);
  const roofMat = new THREE.MeshToonMaterial({ color: PAL.roofTile, side: THREE.DoubleSide });

  const wh = new THREE.Group();
  const WH = { x0: -30, x1: -19, z0: -17, z1: -4, h: 5.2 };
  const wallT = 0.3;

  function wallSeg(w, h, d, x, y, z) {
    const m = box(w, h, d, wallMat, x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    addOutline(m, 0.02, 0x3a3e40);
    wh.add(m);
    return m;
  }

  wallSeg(wallT, WH.h, 13, WH.x0 + wallT / 2, WH.h / 2, -10.5);
  wallSeg(11, WH.h, wallT, -24.5, WH.h / 2, WH.z0 + wallT / 2);
  wallSeg(11, WH.h, wallT, -24.5, WH.h / 2, WH.z1 - wallT / 2);

  const openW = 2.0, openH = 3.6;
  const openZ = 2.2;
  const segL = (13 - openW) / 2;
  wallSeg(0.5, openH, segL, WH.x1 - 0.25, openH / 2, WH.z0 + segL / 2);
  wallSeg(0.5, openH, segL, WH.x1 - 0.25, openH / 2, WH.z1 - segL / 2);
  wallSeg(0.5, WH.h - openH, openW + 0.4, WH.x1 - 0.25, openH + (WH.h - openH) / 2, -10.5);

  const roofGeo = new THREE.BufferGeometry();
  const rw = 5.9, rd = 7.0, rh = 2.0;
  const rv = [
    -rw, 0, -rd, rw, 0, -rd, 0, rh, -rd,
    -rw, 0, rd, rw, 0, rd, 0, rh, rd,
    -rw, 0, -rd, 0, rh, -rd, 0, rh, rd, -rw, 0, -rd, 0, rh, rd, -rw, 0, rd,
    rw, 0, -rd, rw, 0, rd, 0, rh, rd, rw, 0, -rd, 0, rh, rd, 0, rh, -rd,
  ];
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(-24.5, WH.h, -10.5);
  addOutline(roof, 0.03, 0x242e36);
  wh.add(roof);
  wh.add(box(12.4, 0.18, 0.3, trimMat, -24.5, WH.h + rh, -10.5));

  const slatTex = slatTexture();
  const shutterMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: slatTex });
  const shutter = box(0.08, 1.5, openW, shutterMat, WH.x1 - 0.12, 3.25, -10.5);
  wh.add(shutter);
  const roll = cyl(0.2, 0.2, openW + 0.2, trimMat, WH.x1 - 0.12, 4.1, -10.5, 12);
  roll.rotation.x = Math.PI / 2;
  wh.add(roll);
  for (const dz of [-openW / 2 - 0.05, openW / 2 + 0.05]) {
    wh.add(box(0.16, 4.1, 0.12, trimMat, WH.x1 - 0.12, 2.05, -10.5 + dz));
  }
  wh.add(box(0.9, 0.14, 4.4, toon(PAL.concreteDark), WH.x1 + 0.45, 0.07, -10.5));

  const floorMat = new THREE.MeshPhongMaterial({ color: 0x9a9c94, shininess: 70, specular: 0x9aa4a8 });
  const floor = box(10.6, 0.12, 12.6, floorMat, -24.5, 0.06, -10.5);
  floor.receiveShadow = true;
  wh.add(floor);
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 12.4),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xbfd8dc, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(-24.5, 0.14, -10.5);
  sheen.renderOrder = 2;
  wh.add(sheen);

  const crateTexW = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f0efe8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,118,110,0.55)'; g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 2.5;
    for (let i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo(0, i * h / 3); g.lineTo(w, i * h / 3); g.stroke();
    }
  });
  const crateMatW = new THREE.MeshToonMaterial({ color: 0xffffff, map: crateTexW });
  const crateGeoW = new THREE.BoxGeometry(0.95, 0.52, 0.62);
  const rngW = mulberry32(616);
  function cratePile(x, z, n) {
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(crateGeoW, crateMatW);
      c.position.set(x + (rngW() - 0.5) * 0.3, 0.38 + i * 0.53, z + (rngW() - 0.5) * 0.3);
      c.rotation.y = (rngW() - 0.5) * 0.4;
      c.castShadow = true;
      wh.add(c);
    }
  }
  cratePile(-27.5, -14.5, 4);
  cratePile(-26.4, -14.8, 3);
  cratePile(-27.8, -13.4, 3);
  cratePile(-22.0, -6.5, 3);
  wh.add(box(1.4, 0.12, 1.1, toon(0x8f6f4e), -27.4, 0.18, -14.6));

  const freezer = box(1.6, 1.15, 0.95, toon(0xd8dade), -28.6, 0.7, -6.2);
  addOutline(freezer, 0.02, 0x3a4044);
  wh.add(freezer);
  wh.add(box(1.62, 0.06, 0.97, trimMat, -28.6, 1.28, -6.2));
  wh.add(box(0.4, 0.08, 0.06, toon(0x9a9da0), -28.0, 1.05, -5.72));

  const scaleG = new THREE.Group();
  scaleG.add(box(0.7, 0.06, 0.7, toon(0x8a8d90), 0, 0.05, 0));
  scaleG.add(cyl(0.05, 0.06, 0.95, trimMat, 0, 0.55, 0, 8));
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.19, 16),
    new THREE.MeshBasicMaterial({ map: dialTexture() }));
  dial.position.set(0, 1.05, 0.1);
  dial.rotation.x = -0.25;
  scaleG.add(dial);
  scaleG.position.set(-20.4, 0, -14.8);
  wh.add(scaleG);

  const bootMat = toon(0x3f5a48);
  for (const [bx, bz] of [[-29.6, -12.2], [-29.6, -11.4], [-29.6, -8.8], [-29.6, -8.0]]) {
    const boot = new THREE.Group();
    boot.add(box(0.13, 0.3, 0.22, bootMat, 0, 0.15, 0));
    boot.add(box(0.13, 0.1, 0.3, bootMat, 0, 0.05, 0.03));
    boot.position.set(bx, 2.4 + (hash1(bx * bz) - 0.5) * 0.1, bz);
    boot.rotation.z = 0.06;
    wh.add(boot);
  }

  const bbTex = blackboardTexture();
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2),
    new THREE.MeshToonMaterial({ map: bbTex }));
  bb.position.set(-29.8, 1.7, -10.5);
  bb.rotation.y = Math.PI / 2;
  wh.add(bb);
  wh.add(box(0.08, 1.3, 0.6, trimMat, -29.75, 0.65, -10.5));

  const iceMat = new THREE.MeshPhongMaterial({
    color: 0xd8ecec, transparent: true, opacity: 0.75, shininess: 120, specular: 0xffffff,
  });
  const iceRng = mulberry32(727);
  for (let i = 0; i < 14; i++) {
    const ice = box(0.1 + iceRng() * 0.08, 0.08 + iceRng() * 0.05, 0.1 + iceRng() * 0.08, iceMat,
      WH.x1 - 1 - iceRng() * 6, 0.16, -13.5 + iceRng() * 6);
    ice.rotation.y = iceRng() * 3;
    wh.add(ice);
  }

  const ceilMat = toon(0x6b5a44);
  const ceil = box(10.6, 0.1, 12.6, ceilMat, -24.5, WH.h - 0.08, -10.5);
  wh.add(ceil);
  for (let i = 0; i < 5; i++) {
    wh.add(box(0.18, 0.22, 12.4, toon(0x5a4632), -28.6 + i * 2.1, WH.h - 0.25, -10.5));
  }
  const causticC = ctx.effects.makeCaustic(9.5, 11, 0.55);
  causticC.position.set(-24.5, WH.h - 0.35, -10.5);
  wh.add(causticC);

  const whLight = new THREE.PointLight(0xffe2b0, 110, 22, 1.7);
  whLight.position.set(-24.5, 3.4, -10.5);
  wh.add(whLight);
  const whLight2 = new THREE.PointLight(0xfff0d0, 38, 16, 1.7);
  whLight2.position.set(-24.5, 1.2, -10.5);
  wh.add(whLight2);
  const whFill = new THREE.PointLight(0xffe8c0, 50, 14, 1.7);
  whFill.position.set(-20.8, 2.3, -10.5);
  wh.add(whFill);

  const winFrame = new THREE.MeshToonMaterial({ color: 0x4a463c });
  wh.add(box(0.34, 1.4, 3.2, winFrame, WH.x0 + 0.17, 4.0, -10.5));
  const shaft = ctx.effects.makeShaft(1.5, 2.4, 6.0, 0xffe9bf);
  shaft.position.set(-28.9, 3.2, -10.5);
  shaft.rotation.z = 0.62;
  wh.add(shaft);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffedc4, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(-26.6, 0.16, -10.5);
  patch.renderOrder = 2;
  wh.add(patch);

  const gutter = cyl(0.06, 0.06, WH.h, trimMat, WH.x1 + 0.1, WH.h / 2, WH.z0 + 0.3, 8);
  wh.add(gutter);

  root.add(wh);

  const wr = new THREE.Group();
  const WRX = -25, WRZ = 5, WRW = 8, WRD = 6, WRH = 3.1;
  const woodFloorMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: plankTexture() });
  const wrFloor = box(WRW, 0.14, WRD, woodFloorMat, WRX, 0.07, WRZ);
  wrFloor.receiveShadow = true;
  wr.add(wrFloor);
  const postMat = toon(0x4a463c);
  for (const [px, pz] of [
    [WRX - WRW / 2, WRZ - WRD / 2], [WRX + WRW / 2, WRZ - WRD / 2],
    [WRX - WRW / 2, WRZ + WRD / 2], [WRX + WRW / 2, WRZ + WRD / 2],
    [WRX, WRZ + WRD / 2], [WRX - WRW / 2, WRZ],
  ]) {
    wr.add(box(0.14, WRH, 0.14, postMat, px, WRH / 2, pz));
  }
  const wrGlassMat = new THREE.MeshPhongMaterial({
    color: 0xd8ecec, transparent: true, opacity: 0.16, shininess: 180,
    specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false,
  });
  const glassE = new THREE.Mesh(new THREE.PlaneGeometry(WRD - 0.4, WRH - 0.3), wrGlassMat);
  glassE.rotation.y = Math.PI / 2;
  glassE.position.set(WRX + WRW / 2, WRH / 2, WRZ);
  wr.add(glassE);
  const glassS = new THREE.Mesh(new THREE.PlaneGeometry(WRW - 0.4, WRH - 0.3), wrGlassMat);
  glassS.position.set(WRX, WRH / 2, WRZ + WRD / 2);
  wr.add(glassS);
  const wrBack = box(0.16, WRH, WRD, wallMat, WRX - WRW / 2, WRH / 2, WRZ);
  wr.add(wrBack);
  const wrRoofSlab = box(WRW + 0.5, 0.16, WRD + 0.5, roofMat, WRX, WRH + 0.08, WRZ);
  addOutline(wrRoofSlab, 0.02, 0x242e36);
  wr.add(wrRoofSlab);
  const wrSignTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6b5a44'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#3a4a5a'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center';
    g.fillText('待 合 所', w / 2, 46);
  });
  const wrSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshToonMaterial({ map: wrSignTex }));
  wrSign.position.set(WRX + WRW / 2 + 0.02, WRH - 0.4, WRZ + 1.2);
  wrSign.rotation.y = Math.PI / 2;
  wr.add(wrSign);

  const benchMat = toon(0x8f6f4e);
  const bench = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    bench.add(box(2.6, 0.05, 0.12, benchMat, 0, 0.45, -0.18 + i * 0.16));
  }
  for (let i = 0; i < 2; i++) {
    bench.add(box(0.08, 0.45, 0.4, benchMat, -1.2 + i * 2.4, 0.22, 0));
  }
  bench.add(box(2.6, 0.4, 0.06, benchMat, 0, 0.72, -0.24));
  bench.position.set(WRX, 0, WRZ - WRD / 2 + 0.75);
  shadowify(bench);
  wr.add(bench);

  const ttTex = timetableTexture();
  const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.2),
    new THREE.MeshToonMaterial({ map: ttTex }));
  tt.position.set(WRX - 1.6, 1.7, WRZ + WRD / 2 - 0.1);
  tt.rotation.y = Math.PI;
  wr.add(tt);

  const radioTex = radioTexture();
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.22),
    new THREE.MeshToonMaterial({ map: radioTex }));
  radio.position.set(WRX - 1.6, 0.72, WRZ - 2.2);
  wr.add(radio);
  wr.add(box(0.9, 0.45, 0.5, toon(0x7a6248), WRX - 1.6, 0.22, WRZ - 2.2));

  const kettleG = new THREE.Group();
  const kettleBody = sph(0.16, toon(0xb9bcbe), 0, 0.16, 0, 12, 10);
  kettleBody.scale.y = 0.9;
  kettleG.add(kettleBody);
  const spout = cyl(0.03, 0.045, 0.2, toon(0x9a9da0), 0.16, 0.2, 0, 6);
  spout.rotation.z = -0.7;
  kettleG.add(spout);
  const kHandle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 5, 10, Math.PI), toon(0x4a463c));
  kHandle.position.y = 0.3;
  kettleG.add(kHandle);
  kettleG.position.set(WRX + 2.6, 0.5, WRZ + 1.6);
  wr.add(kettleG);
  wr.add(box(1.0, 0.5, 0.6, toon(0x8f6f4e), WRX + 2.6, 0.25, WRZ + 1.6));
  const cupA = cyl(0.05, 0.04, 0.08, toon(0xf0ead8), WRX + 2.2, 0.54, WRZ + 1.3, 8);
  wr.add(cupA);

  const pot = cyl(0.18, 0.14, 0.24, toon(0xa85f3f), WRX + 3.0, 0.62, WRZ - 2.2, 10);
  wr.add(pot);
  const leafMat = new THREE.MeshToonMaterial({ color: 0x4f8f5b, side: THREE.DoubleSide });
  const leafRng = mulberry32(818);
  for (let i = 0; i < 10; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.07 + leafRng() * 0.05, 6), leafMat);
    const a = leafRng() * Math.PI * 2;
    const r = 0.12 + leafRng() * 0.28;
    leaf.position.set(WRX + 3.0 + Math.cos(a) * r, 0.62 + leafRng() * 0.35 - r * 0.4, WRZ - 2.2 + Math.sin(a) * r);
    leaf.rotation.set(leafRng() * 1.2 - 0.6, leafRng() * 3, leafRng() * 1.2 - 0.6);
    wr.add(leaf);
  }

  const clockTex = clockTexture();
  const clockG = new THREE.Group();
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20),
    new THREE.MeshToonMaterial({ map: clockTex }));
  clockG.add(clockFace);
  const hourHand = box(0.03, 0.16, 0.01, toon(0x2e2e2c), 0, 0.06, 0.01);
  const minHand = box(0.02, 0.24, 0.01, toon(0x2e2e2c), 0, 0.1, 0.012);
  const secHand = box(0.008, 0.26, 0.008, toon(0xc4483a), 0, 0.11, 0.014);
  const hourPivot = new THREE.Group();
  hourPivot.add(hourHand);
  const minPivot = new THREE.Group();
  minPivot.add(minHand);
  const secPivot = new THREE.Group();
  secPivot.add(secHand);
  clockG.add(hourPivot, minPivot, secPivot);
  clockG.position.set(WRX + 1.2, 2.2, WRZ - WRD / 2 + 0.12);
  clockG.rotation.x = -0.06;
  clockG.rotation.z = 0.14;
  wr.add(clockG);

  const wrLight = new THREE.PointLight(0xffe8c4, 60, 14, 1.7);
  wrLight.position.set(WRX, 2.4, WRZ);
  wr.add(wrLight);

  root.add(wr);

  ctx.updaters.push((t) => {
    causticC.userData.tex.offset.set(t * 0.008 % 1, t * 0.011 % 1);
    causticC.material.opacity = causticC.userData.strength * (0.75 + 0.25 * Math.sin(t * 0.5));
    hourPivot.rotation.z = -((t / 3600) % 12) * (Math.PI * 2 / 12) - 1.1;
    minPivot.rotation.z = -((t / 60) % 60) * (Math.PI * 2 / 60) - 2.4;
    secPivot.rotation.z = -(Math.floor(t % 60)) * (Math.PI * 2 / 60);
    whLight.intensity = 100 + Math.sin(t * 2.3) * 6;
    whLight2.intensity = 34 + Math.sin(t * 1.9 + 1) * 2;
    whFill.intensity = 45 + Math.sin(t * 1.3 + 0.5) * 3;
    wrLight.intensity = 55 + Math.sin(t * 1.7 + 2) * 3;
  });
}
