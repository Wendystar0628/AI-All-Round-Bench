import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PAL, WATER_Y, QUAY_Y, toon, flat, addOutline, canvasTex, box, cyl, sph,
  mulberry32, hash1, hash2, clamp, lerp, shadowify, group,
} from './common.js';

function crateTexture(color = '#f0efe8', line = 'rgba(120,118,110,0.55)') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 2.5;
    for (let i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo(0, i * h / 3); g.lineTo(w, i * h / 3); g.stroke();
      g.beginPath(); g.moveTo(i * w / 3, 0); g.lineTo(i * w / 3, h); g.stroke();
    }
    const rng = mulberry32(64);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(90,88,80,${0.05 + rng() * 0.08})`;
      g.fillRect(rng() * w, rng() * h, 3 + rng() * 6, 2 + rng() * 4);
    }
  });
}

function textPanelTexture(w, h, draw) {
  return canvasTex(w, h, draw);
}

function buoyNumberTexture(num, bg = '#c4483a', fg = '#f2ead8') {
  return canvasTex(128, 80, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 12; i++) { g.fillRect(Math.random() * w, Math.random() * h, 8, 3); }
    g.fillStyle = fg;
    g.font = 'bold 46px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), w / 2, h / 2 + 2);
    g.fillStyle = 'rgba(60,40,30,0.35)';
    for (let i = 0; i < 8; i++) { g.fillRect(Math.random() * w, Math.random() * h, 10, 2); }
  });
}

function makeBollard(mat) {
  const pts = [
    new THREE.Vector2(0.30, 0.0), new THREE.Vector2(0.30, 0.08),
    new THREE.Vector2(0.14, 0.14), new THREE.Vector2(0.11, 0.42),
    new THREE.Vector2(0.15, 0.52), new THREE.Vector2(0.21, 0.58),
    new THREE.Vector2(0.20, 0.63), new THREE.Vector2(0.0, 0.65),
  ];
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mat);
  addOutline(m, 0.02, 0x1d2427);
  return m;
}

function makeLamp(ctx, x, z) {
  const g = new THREE.Group();
  const ironMat = toon(PAL.ironBlack);
  const base = cyl(0.22, 0.28, 0.25, ironMat, 0, 0.12, 0, 10);
  const pole = cyl(0.055, 0.075, 4.4, ironMat, 0, 2.3, 0, 8);
  const arm = cyl(0.04, 0.04, 0.8, ironMat, 0.0, 4.55, 0, 6);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.36, 4.55, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 18), ironMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.72, 4.42, 0);
  const shade = cyl(0.30, 0.36, 0.10, ironMat, 0.72, 4.36, 0, 12);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffedb8 });
  const bulb = sph(0.13, bulbMat, 0.72, 4.28, 0, 8, 6);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.glowTex, color: 0xffe9b0, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1.6, 1.6, 1);
  glow.position.set(0.72, 4.30, 0);
  g.add(base, pole, arm, ring, shade, bulb, glow);
  g.position.set(x, 0, z);
  g.userData.glow = glow;
  g.userData.bulb = bulbMat;
  shadowify(g);
  return g;
}

export function buildQuay(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const rng = mulberry32(2024);

  if (!ctx.glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const gg = c.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    ctx.glowTex = new THREE.CanvasTexture(c);
  }

  const ironMat = toon(PAL.ironBlack);
  const bollards = [];
  const bollardZs = [-26.5, -21.3, -16.1, -10.9, -5.7, -0.5, 4.7, 9.9];
  for (const z of bollardZs) {
    const b = makeBollard(ironMat);
    b.position.set(-0.85, 0, z);
    root.add(b);
    bollards.push(b);
  }
  for (const bx of [4.2, 12.2]) {
    const b = makeBollard(ironMat);
    b.position.set(bx, 0, -18.75);
    root.add(b);
  }

  for (const [bi, bz] of [[0, -26.5], [2, -16.1], [4, -5.7], [6, 4.7]]) {
    const pts = [];
    const cx = -0.85, cz = bz;
    for (let i = 0; i <= 8; i++) {
      const a = i * Math.PI * 0.75;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * 0.24, 0.52 - i * 0.04, cz + Math.sin(a) * 0.24));
    }
    const ex = 0.9 + hash1(bi) * 0.5, ez = bz + (hash1(bi * 3) - 0.5) * 0.6;
    for (let i = 1; i <= 8; i++) {
      const k = i / 8;
      const x = lerp(cx, ex, k);
      const z = lerp(cz, ez, k);
      const y = lerp(0.36, WATER_Y + 0.1, k) - Math.sin(k * Math.PI) * 0.35;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const rope = ctx.effects.makeRope(pts, 0.065, PAL.rope, PAL.ropeWet);
    root.add(rope);
  }

  ctx.mooringLines = [];
  for (let ai = 0; ai < (ctx.boatAnchors || []).length; ai++) {
    const boatAnchor = ctx.boatAnchors[ai];
    const nearest = bollards.reduce((best, b) => {
      const d = Math.abs(b.position.z - boatAnchor.z);
      return d < best.d ? { d, b } : best;
    }, { d: 1e9, b: bollards[0] }).b;
    const from = new THREE.Vector3(nearest.position.x, 0.45, nearest.position.z);
    const to = boatAnchor.clone();
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= 0.5;
    const rope = ctx.effects.makeRope([from, mid, to], 0.05, PAL.rope, PAL.ropeWet, 24);
    root.add(rope);
    ctx.mooringLines.push({ mesh: rope, anchorIndex: ai });
  }
  ctx.updaters.push(() => {
    const dp = ctx.dyn.departPhase;
    const hide = dp > 0.005 && dp < 0.995;
    for (const l of ctx.mooringLines) {
      l.mesh.visible = !(hide && l.anchorIndex === 2);
    }
  });

  const lamps = [];
  for (const [lx, lz] of [[-2.2, -24], [-2.2, -8], [-2.2, 8], [8.2, -19.1]]) {
    const lamp = makeLamp(ctx, lx, lz);
    root.add(lamp);
    lamps.push(lamp);
  }
  const wirePairs = [[0, 1], [1, 2], [2, 3]];
  for (const [ia, ib] of wirePairs) {
    const a = lamps[ia].position.clone().add(new THREE.Vector3(0.72, 4.42, 0));
    const b = lamps[ib].position.clone().add(new THREE.Vector3(0.72, 4.42, 0));
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const p = a.clone().lerp(b, k);
      p.y -= Math.sin(k * Math.PI) * 0.7;
      pts.push(p);
    }
    const wire = ctx.effects.makeRope(pts, 0.022, 0x1c2224, 0x1c2224, 24);
    root.add(wire);
  }
  {
    const a = lamps[2].position.clone().add(new THREE.Vector3(0.72, 4.42, 0));
    const b = new THREE.Vector3(-19, 5.6, -8);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const p = a.clone().lerp(b, k);
      p.y -= Math.sin(k * Math.PI) * 1.1;
      pts.push(p);
    }
    root.add(ctx.effects.makeRope(pts, 0.022, 0x1c2224, 0x1c2224, 24));
  }

  const crateTex = crateTexture('#f0efe8');
  const crateMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: crateTex });
  const crateBlueMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: crateTexture('#3f6d9e', 'rgba(20,40,60,0.6)') });
  const crateGeo = new THREE.BoxGeometry(0.95, 0.52, 0.62);
  function crateStack(x, z, n, mat, ry = 0) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(crateGeo, mat);
      c.position.set((rng() - 0.5) * 0.08, 0.26 + i * 0.53, (rng() - 0.5) * 0.08);
      c.rotation.y = (rng() - 0.5) * 0.14 + ry;
      addOutline(c, 0.015, 0x2a3236);
      g.add(c);
    }
    g.position.set(x, 0, z);
    return g;
  }
  root.add(crateStack(-17.6, -6.4, 4, crateMat, 0.2));
  root.add(crateStack(-17.6, -5.2, 3, crateMat, -0.15));
  root.add(crateStack(-16.4, -6.8, 3, crateMat, 0.1));
  root.add(crateStack(-13.8, -2.6, 4, crateBlueMat, 0.1));
  root.add(crateStack(-13.0, -2.2, 3, crateBlueMat, -0.2));
  root.add(crateStack(-18.6, 4.8, 3, crateMat, 0.3));

  const netTex = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(122,110,88,0.95)'; g.lineWidth = 1.6;
    const s = 16;
    for (let y = -s; y < h + s; y += s) {
      for (let x = -s; x < w + s; x += s) {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + s, y + s);
        g.moveTo(x + s, y); g.lineTo(x, y + s);
        g.stroke();
      }
    }
  }, { repeat: [3, 2] });
  const netGroup = new THREE.Group();
  const pipeMat = toon(0x4a5052);
  for (const dz of [-1.1, 1.1]) {
    const post = cyl(0.05, 0.06, 2.2, pipeMat, -2.6, 1.1, -4.4 + dz, 8);
    netGroup.add(post);
  }
  const bar = cyl(0.035, 0.035, 2.4, pipeMat, -2.6, 2.1, -4.4, 8);
  bar.rotation.x = Math.PI / 2;
  netGroup.add(bar);
  const netGeo = new THREE.PlaneGeometry(2.0, 1.5, 10, 8);
  {
    const p = netGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, -Math.cos(x * 2.4) * 0.06 - Math.cos(y * 3.0) * 0.05);
      if (y < -0.6) p.setX(i, x * (1 + (-y - 0.6) * 0.1));
    }
    netGeo.computeVertexNormals();
  }
  const netMesh = new THREE.Mesh(netGeo, new THREE.MeshToonMaterial({
    map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
  }));
  netMesh.rotation.y = Math.PI / 2;
  netMesh.position.set(-2.6, 1.35, -4.4);
  netGroup.add(netMesh);
  const floatPts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    floatPts.push(new THREE.Vector3(-2.6 + Math.cos(k * 3.1) * 0.0, 0, 0));
  }
  const floatLinePts = [];
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    floatLinePts.push(new THREE.Vector3(-2.6, 2.05 - Math.sin(k * Math.PI) * 0.35, -5.3 + k * 1.8));
  }
  netGroup.add(ctx.effects.makeRope(floatLinePts, 0.025, 0xd8cfb8, 0xd8cfb8, 16));
  const floatCols = [0xe8702c, 0xf0ead8, 0xd84f3a, 0xf0ead8];
  for (let i = 0; i < 9; i++) {
    const k = (i + 0.5) / 9;
    const p = floatLinePts[Math.round(k * 14)];
    const f = sph(0.075, toon(floatCols[i % 4]), p.x, p.y - 0.09, p.z, 8, 6);
    netGroup.add(f);
  }
  shadowify(netGroup);
  root.add(netGroup);

  const winch = new THREE.Group();
  const rustMat = toon(0x7a4f33);
  const drum = cyl(0.22, 0.22, 0.6, rustMat, 0, 0.45, 0, 12);
  drum.rotation.x = Math.PI / 2;
  winch.add(drum);
  for (const dx of [-0.36, 0.36]) {
    const plate = box(0.08, 0.6, 0.5, rustMat, dx, 0.4, 0);
    winch.add(plate);
  }
  const crank = cyl(0.035, 0.035, 0.5, ironMat, 0.42, 0.45, 0, 6);
  crank.rotation.z = Math.PI / 2;
  winch.add(crank);
  const handle = box(0.1, 0.05, 0.05, ironMat, 0.62, 0.62, 0);
  winch.add(handle);
  winch.add(box(0.9, 0.1, 0.7, toon(0x5a5e60), 0, 0.05, 0));
  winch.position.set(-2.8, 0, -13.2);
  winch.rotation.y = 0.5;
  shadowify(winch);
  root.add(winch);

  const crane = new THREE.Group();
  const post = cyl(0.09, 0.12, 3.4, ironMat, 0, 1.7, 0, 8);
  crane.add(post);
  const boom = cyl(0.06, 0.08, 2.6, rustMat, 0, 0, 0, 8);
  boom.rotation.z = Math.PI / 2 - 0.5;
  boom.position.set(1.05, 3.25, 0);
  crane.add(boom);
  const cablePts = [new THREE.Vector3(2.1, 2.85, 0), new THREE.Vector3(2.15, 1.2, 0)];
  crane.add(ctx.effects.makeRope(cablePts, 0.018, 0x2a2e30, 0x2a2e30, 6));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 10, Math.PI * 1.4), rustMat);
  hook.position.set(2.15, 1.1, 0);
  crane.add(hook);
  crane.position.set(-1.5, 0, 3.2);
  crane.rotation.y = -0.6;
  shadowify(crane);
  root.add(crane);

  const buoyProfile = [
    new THREE.Vector2(0.02, -0.55), new THREE.Vector2(0.22, -0.42),
    new THREE.Vector2(0.42, -0.1), new THREE.Vector2(0.44, 0.15),
    new THREE.Vector2(0.30, 0.42), new THREE.Vector2(0.12, 0.55),
    new THREE.Vector2(0.05, 0.68), new THREE.Vector2(0.0, 0.7),
  ];
  const buoyGeo = new THREE.LatheGeometry(buoyProfile, 14);
  const buoys = [];
  const buoyDefs = [
    [6, -14.6, 12], [11, -14.2, 7], [16, -14.7, 3], [2.6, -9.5, 15],
  ];
  for (const [bx, bz, num] of buoyDefs) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(buoyGeo, toon(0xc4483a));
    addOutline(body, 0.02, 0x30251f);
    g.add(body);
    const bandMat = new THREE.MeshBasicMaterial({ map: buoyNumberTexture(num) });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.445, 0.45, 0.34, 14, 1, true), bandMat);
    band.position.y = 0.02;
    g.add(band);
    const top = cyl(0.04, 0.05, 0.3, ironMat, 0, 0.78, 0, 6);
    g.add(top);
    const tetherPts = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.3, WATER_Y - 0.4, 0.2)];
    g.userData.phase = hash1(bx * 7) * 6.28;
    g.userData.baseY = WATER_Y + 0.18;
    g.position.set(bx, g.userData.baseY, bz);
    root.add(g);
    buoys.push(g);
    const tether = ctx.effects.makeRope([
      new THREE.Vector3(bx, g.userData.baseY - 0.4, bz),
      new THREE.Vector3(bx + 0.4, -7.4, bz + 0.3),
    ], 0.02, 0x3a3e40, 0x2a2e30, 6);
    root.add(tether);
  }

  const vendBody = box(1.15, 1.9, 0.85, toon(0xb8493a), -20.6, 0.95, 6.2);
  addOutline(vendBody, 0.03, 0x30251f);
  root.add(vendBody);
  const vendTop = box(1.2, 0.18, 0.9, toon(0x8f8f88), -20.6, 1.98, 6.2);
  root.add(vendTop);
  const vendAwning = box(1.3, 0.06, 0.7, toon(0x9a4f3a), -20.6, 2.14, 6.3);
  vendAwning.rotation.x = 0.25;
  root.add(vendAwning);
  const vendFrontTex = textPanelTexture(256, 384, (g, w, h) => {
    g.fillStyle = '#f6f2e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8493a'; g.fillRect(0, 0, w, 60);
    g.fillStyle = '#fff2cf';
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    g.fillText('ドリンク', w / 2, 42);
    const cols = ['#e8702c', '#3f8f5b', '#3a6ea5', '#e8b923', '#c4483a', '#7a5a9e'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const x = 22 + c * 72, y = 80 + r * 62;
        g.fillStyle = cols[(r * 3 + c) % cols.length];
        g.fillRect(x, y, 40, 44);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(x + 4, y + 8, 32, 10);
        g.fillStyle = '#2e2e2c';
        g.fillRect(x, y + 48, 44, 12);
        g.fillStyle = '#f0ead8';
        g.font = 'bold 10px sans-serif';
        g.fillText('¥140', x + 22, y + 58);
      }
    }
    g.fillStyle = '#2e2e2c'; g.fillRect(0, h - 60, w, 60);
    g.fillStyle = '#f0ead8';
    g.font = 'bold 20px sans-serif';
    g.fillText('販売中', w / 2, h - 22);
  });
  const vendFront = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.55),
    new THREE.MeshBasicMaterial({ map: vendFrontTex }));
  vendFront.position.set(-20.02, 1.05, 6.2);
  vendFront.rotation.y = Math.PI / 2;
  root.add(vendFront);
  const vendGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.glowTex, color: 0xffe9c0, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  vendGlow.scale.set(3.2, 2.6, 1);
  vendGlow.position.set(-19.9, 1.4, 6.2);
  root.add(vendGlow);
  const vendPool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8),
    new THREE.MeshBasicMaterial({
      map: ctx.glowTex, color: 0xffe0b0, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  vendPool.rotation.x = -Math.PI / 2;
  vendPool.position.set(-19.5, 0.04, 6.2);
  vendPool.renderOrder = 3;
  root.add(vendPool);

  const signTex = textPanelTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#7a6248'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a4632'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#f0ead8';
    g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
    g.fillText('太陽雨漁港', w / 2, 96);
    g.fillStyle = '#e8b923';
    g.font = 'bold 34px sans-serif';
    g.fillText('注意落水', w / 2, 168);
    g.strokeStyle = '#c4483a'; g.lineWidth = 10;
    g.beginPath(); g.arc(w / 2, 216, 22, 0, 7); g.stroke();
    g.strokeStyle = '#f0ead8'; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, 216, 22, 0, 7); g.stroke();
    const rng2 = mulberry32(9);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(60,48,36,${0.10 + rng2() * 0.2})`;
      g.fillRect(rng2() * w, rng2() * h, 6 + rng2() * 14, 3 + rng2() * 5);
    }
  });
  const sign = new THREE.Group();
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.08),
    new THREE.MeshToonMaterial({ map: signTex }));
  addOutline(signBoard, 0.02, 0x2e2419);
  signBoard.position.y = 1.6;
  sign.add(signBoard);
  for (const dx of [-0.9, 0.9]) {
    const post = cyl(0.05, 0.06, 1.6, toon(0x64482f), dx, 0.8, -0.06, 8);
    sign.add(post);
  }
  sign.position.set(-1.7, 0, -29.5);
  sign.rotation.y = 0.5;
  sign.rotation.z = 0.04;
  shadowify(sign);
  root.add(sign);

  const sockPole = cyl(0.05, 0.07, 3.6, ironMat, -2.0, 1.8, 13.5, 8);
  root.add(sockPole);
  const sockArm = cyl(0.03, 0.03, 0.7, ironMat, 0, 0, 0, 6);
  sockArm.rotation.z = Math.PI / 2;
  sockArm.position.set(-1.75, 3.5, 13.5);
  root.add(sockArm);
  const sockTex = canvasTex(64, 64, (g, w, h) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#f0ead8' : '#e8702c';
      g.fillRect(0, i * h / 6, w, h / 6);
    }
  }, { repeat: [2, 1] });
  const sockGeo = new THREE.CylinderGeometry(0.26, 0.08, 1.15, 10, 3, true);
  sockGeo.rotateZ(Math.PI / 2);
  const sock = new THREE.Mesh(sockGeo, new THREE.MeshToonMaterial({
    map: sockTex, side: THREE.DoubleSide,
  }));
  sock.position.set(-1.05, 3.5, 13.5);
  root.add(sock);

  const caseMat = toon(0xc9ccce);
  const trimMat = toon(0x8f9296);
  function instrumentCase(w, h, d, x, z, ry) {
    const g = new THREE.Group();
    const body = box(w, h, d, caseMat, 0, h / 2, 0);
    addOutline(body, 0.02, 0x3a4044);
    g.add(body);
    g.add(box(w * 0.98, 0.05, d * 0.98, trimMat, 0, h * 0.62, 0));
    for (const dx of [-w * 0.3, w * 0.3]) {
      g.add(box(0.08, 0.06, 0.1, trimMat, dx, h * 0.62, d / 2 + 0.02));
      g.add(box(0.08, 0.06, 0.1, trimMat, dx, h * 0.62, -d / 2 - 0.02));
    }
    g.add(box(0.3, 0.06, 0.08, trimMat, 0, h * 0.62, d / 2 + 0.04));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(0.06, h, 0.06, trimMat, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)));
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    shadowify(g);
    return g;
  }
  root.add(instrumentCase(1.9, 0.42, 0.62, -2.4, -27.2, 0.06));
  root.add(instrumentCase(1.15, 0.38, 0.5, -2.3, -26.4, -0.08));

  const umbGroup = new THREE.Group();
  const umbMat = new THREE.MeshPhongMaterial({
    color: 0xe8f4f4, transparent: true, opacity: 0.32,
    shininess: 140, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false,
  });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.42, 12, 1, true), umbMat);
  canopy.position.y = 1.05;
  umbGroup.add(canopy);
  const ribMat = toon(0x3a4044);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const rib = cyl(0.012, 0.012, 0.78, ribMat, Math.cos(a) * 0.36, 0.88, Math.sin(a) * 0.36, 4);
    rib.rotation.z = Math.cos(a) * 0.5;
    rib.rotation.x = -Math.sin(a) * 0.5;
    umbGroup.add(rib);
  }
  const shaft = cyl(0.02, 0.02, 1.35, ribMat, 0, 0.68, 0, 6);
  umbGroup.add(shaft);
  const tip = cyl(0.015, 0.015, 0.18, ribMat, 0, 1.32, 0, 5);
  umbGroup.add(tip);
  const beadMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const beadRng = mulberry32(313);
  for (let i = 0; i < 22; i++) {
    const a = beadRng() * Math.PI * 2, r = 0.15 + beadRng() * 0.5;
    const bead = sph(0.018 + beadRng() * 0.014, beadMat, Math.cos(a) * r, 1.05 + Math.sqrt(Math.max(0, 0.72 * 0.72 - r * r)) * 0.55, Math.sin(a) * r, 5, 4);
    umbGroup.add(bead);
  }
  umbGroup.position.set(1.05, 0.02, -10.15);
  umbGroup.rotation.z = 0.42;
  umbGroup.rotation.x = -0.12;
  root.add(umbGroup);
  ctx.effects.addDrip(() => new THREE.Vector3(1.05 + 0.68, 0.62, -10.15 - 0.05), 3.2, 0.12, 0.02);
  ctx.effects.addDrip(() => new THREE.Vector3(1.05 - 0.6, 0.62, -10.15 + 0.2), 4.4, 0.12, 0.02);

  const longNet = new THREE.Group();
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 16), toon(0x8f6f4e));
  longNet.add(hoop);
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 10, 3, true),
    new THREE.MeshToonMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  bag.position.y = -0.3;
  bag.rotation.x = Math.PI;
  longNet.add(bag);
  const netHandle = cyl(0.025, 0.025, 1.7, toon(0x8f6f4e), 0, 0.85, 0, 6);
  longNet.add(netHandle);
  longNet.position.set(-18.4, 0.35, -5.6);
  longNet.rotation.z = 0.5;
  longNet.rotation.y = 0.4;
  root.add(longNet);
  for (const [bx, bz, ry] of [[-18.5, -4.6, 0.4], [-18.2, -4.2, 2.2], [-17.9, -4.9, 1.1]]) {
    const bucket = cyl(0.22, 0.17, 0.3, toon(0x4f7a8a), bx, 0.16, bz, 10);
    bucket.rotation.z = ry * 0.4;
    root.add(bucket);
  }

  const coil = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 - i * 0.02, 0.05, 6, 16), toon(PAL.rope));
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.05 + i * 0.09;
    coil.add(t);
  }
  coil.position.set(-1.7, 0, -16.1);
  root.add(coil);

  for (const [rx, rz] of [[-28, 0], [-18, 0], [0, 0], [12, 0]]) {
    const plate = box(0.1, 0.34, 0.34, toon(0x6a6e70), 0.06, -0.65, rx + rz, 0);
    plate.rotation.y = Math.PI / 2;
    root.add(plate);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14), toon(0x5a5e60));
    ringM.position.set(0.12, -0.75, rx + rz);
    ringM.rotation.y = Math.PI / 2;
    root.add(ringM);
  }
  for (const lz of [-22.5, 6]) {
    const ladder = new THREE.Group();
    const railMat = toon(0x7a4f33);
    for (const dx of [-0.22, 0.22]) {
      ladder.add(cyl(0.03, 0.03, 4.6, railMat, dx, -2.1, 0, 6));
    }
    for (let i = 0; i < 10; i++) {
      ladder.add(cyl(0.02, 0.02, 0.46, railMat, 0, -0.3 - i * 0.42, 0, 5).rotateZ(Math.PI / 2));
    }
    ladder.position.set(0.14, 0.2, lz);
    root.add(ladder);
  }

  const hill = new THREE.Group();
  const moundGeo = new THREE.SphereGeometry(9.5, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const mound = new THREE.Mesh(moundGeo, toon(0x5f9a5f));
  mound.scale.set(1.1, 0.42, 0.95);
  mound.position.set(-24, 0.02, 24);
  mound.receiveShadow = true;
  hill.add(mound);
  const moundTop = sph(9.2, toon(0x6aa868), -24, 0.4, 24, 24, 12);
  moundTop.scale.set(1.1, 0.40, 0.95);
  hill.add(moundTop);

  const treeFoliageMats = [toon(PAL.foliage1), toon(PAL.foliage2), toon(PAL.foliage3)];
  const treeTrunkMat = toon(0x6b4f37);
  const trees = [];
  function tree(x, z, s, yBase) {
    const g = new THREE.Group();
    const trunk = cyl(0.12 * s, 0.2 * s, 1.6 * s, treeTrunkMat, 0, 0.8 * s, 0, 7);
    g.add(trunk);
    const fol = new THREE.Group();
    const fr = 0.9 * s;
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(fr * (1 - i * 0.2), 1), treeFoliageMats[i % 3]);
      f.position.set((hash1(x + i) - 0.5) * 0.5 * s, (1.6 + i * 0.55) * s, (hash1(z + i) - 0.5) * 0.5 * s);
      f.scale.y = 0.85;
      addOutline(f, 0.05, 0x27402e);
      fol.add(f);
    }
    g.add(fol);
    g.position.set(x, yBase, z);
    g.userData.fol = fol;
    hill.add(g);
    trees.push(g);
    return g;
  }
  const hillH = (x, z) => {
    const dx = (x + 24) / 1.1, dz = (z - 24) / 0.95;
    const d = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, Math.sqrt(Math.max(0, 1 - d * d / (9.5 * 9.5))) * 9.5 * 0.42 + 0.02);
  };
  tree(-28.5, 19.5, 1.15, hillH(-28.5, 19.5));
  tree(-20.5, 20.5, 0.95, hillH(-20.5, 20.5));
  tree(-26.5, 28.5, 1.25, hillH(-26.5, 28.5));
  tree(-17.5, 26.5, 0.85, hillH(-17.5, 26.5));
  tree(-30, 26, 0.9, hillH(-30, 26));
  tree(-14.5, 19.5, 0.7, hillH(-14.5, 19.5));
  tree(-8, 20, 0.8, 0.05);
  tree(-6.5, 27, 0.75, 0.05);

  const roofMat = toon(PAL.roofTile);
  const wallMat = toon(PAL.wallPlaster);
  function house(x, z, s, ry) {
    const g = new THREE.Group();
    const y = hillH(x, z);
    const walls = box(2.2 * s, 1.7 * s, 1.8 * s, wallMat, 0, 0.85 * s, 0);
    addOutline(walls, 0.02, 0x3a3a34);
    g.add(walls);
    const roofGeo = new THREE.BufferGeometry();
    const hw = 1.35 * s, hd = 1.15 * s, rh = 0.75 * s;
    const v = [
      -hw, 0, -hd, hw, 0, -hd, 0, rh, -hd,
      -hw, 0, hd, hw, 0, hd, 0, rh, hd,
      -hw, 0, -hd, 0, rh, -hd, 0, rh, hd, -hw, 0, -hd, 0, rh, hd, -hw, 0, hd,
      hw, 0, -hd, hw, 0, hd, 0, rh, hd, hw, 0, -hd, 0, rh, hd, 0, rh, -hd,
    ];
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshToonMaterial({ color: PAL.roofTile, side: THREE.DoubleSide }));
    roof.position.y = 1.7 * s;
    addOutline(roof, 0.02, 0x242e36);
    g.add(roof);
    const winMat = toon(0x2e3a42);
    for (const wx of [-0.55, 0.55]) {
      g.add(box(0.4 * s, 0.45 * s, 0.04, winMat, wx * s, 0.95 * s, 0.92 * s));
    }
    g.add(box(0.35 * s, 0.7 * s, 0.05, toon(0x64482f), 0, 0.35 * s, 0.92 * s));
    g.add(box(0.25 * s, 0.5 * s, 0.25 * s, wallMat, 0.7 * s, 2.0 * s, -0.3 * s));
    g.position.set(x, y, z);
    g.rotation.y = ry;
    shadowify(g);
    hill.add(g);
    return g;
  }
  house(-27.5, 21.5, 0.85, 0.3);
  house(-21.5, 24.5, 0.95, -0.2);
  house(-25.5, 29.0, 0.8, 0.1);
  house(-18.0, 29.5, 0.9, 0.5);
  shadowify(hill);
  root.add(hill);

  const flagTex = canvasTex(96, 64, (g, w, h) => {
    g.fillStyle = '#eef0ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a6ea5';
    g.beginPath(); g.arc(w / 2, h / 2, 20, 0, 7); g.fill();
    g.fillStyle = '#eef0ea';
    g.beginPath(); g.arc(w / 2, h / 2, 12, 0, 7); g.fill();
    g.strokeStyle = '#3a6ea5'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h / 2 - 16); g.lineTo(w / 2, h / 2 + 16); g.stroke();
  });
  const flagGeo = new THREE.PlaneGeometry(0.85, 0.55, 8, 4);
  const flagMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: flagTex }, uTime: { value: 0 }, uGust: { value: 0 } },
    vertexShader: `
      uniform float uTime; uniform float uGust;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x*6.0 + uTime*3.0) * (0.03 + uGust*0.12) * (p.x+0.45);
        p.z += w; p.y += w*0.4;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main(){ gl_FragColor = texture2D(uMap, vUv); }`,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(-19.2, 6.2, -10.2);
  root.add(flag);

  ctx.updaters.push((t, dyn) => {
    for (const b of buoys) {
      const ph = b.userData.phase;
      const wk = ctx.dyn.wake || { px: 0, pz: -60, str: 0 };
      const dw = Math.hypot(b.position.x - wk.px, b.position.z - wk.pz);
      const wakeK = wk.str * Math.exp(-dw * dw / 9);
      b.position.y = b.userData.baseY + dyn.swell * 0.09 + wakeK * 0.25 * Math.sin(t * 4 + ph);
      b.rotation.x = Math.sin(t * 0.9 + ph) * 0.08 + wakeK * 0.3;
      b.rotation.z = Math.cos(t * 0.7 + ph) * 0.08 + wakeK * 0.35;
    }
    const gustHere = dyn.gustAt(-2);
    sock.rotation.y = Math.sin(t * 0.8) * 0.15;
    sock.rotation.z = -0.08 - gustHere * 0.55;
    sock.scale.set(1, 1, 0.8 + gustHere * 0.35);
    flagMat.uniforms.uTime.value = t;
    flagMat.uniforms.uGust.value = gustHere;
    netGroup.rotation.z = Math.sin(t * 0.9) * 0.008 * (1 + gustHere * 3);
    for (const tr of trees) {
      const gx = tr.position.x;
      tr.userData.fol.rotation.z = Math.sin(t * 1.1 + gx) * 0.012 * (1 + dyn.gustAt(gx) * 4);
      tr.userData.fol.rotation.x = Math.cos(t * 0.9 + gx) * 0.010 * (1 + dyn.gustAt(gx) * 4);
    }
    for (const l of lamps) {
      l.userData.glow.material.opacity = 0.22 + dyn.dark * 0.6;
      l.userData.bulb.color.setHex(dyn.dark > 0.4 ? 0xffdf90 : 0xffedb8);
    }
  });
}
