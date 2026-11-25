// Stencil decals projected onto posed armour parts (built before baking).
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { mulberry32 } from '../materials/noise.js';

const S = 2048;
const R = {
  n07: [0, 0, 640, 448], emblem: [640, 0, 448, 448], name: [0, 448, 1600, 224],
  hazard: [1088, 0, 960, 160], red: [1088, 160, 960, 64], orange: [1088, 224, 960, 96], caution: [1088, 320, 960, 128],
  nostep: [0, 672, 512, 160], danger: [512, 672, 768, 160], legL: [1280, 672, 384, 160], legR: [1664, 672, 384, 160],
  insp: [0, 832, 512, 128], lift: [512, 832, 320, 128], hydr: [832, 832, 640, 128], arrow: [1472, 832, 256, 128],
  rust: [0, 1100, 768, 384], grime: [768, 1100, 768, 384], rustSpot: [1536, 1100, 384, 384],
  whiteBar: [0, 1540, 512, 128], scaleV: [512, 1540, 1024, 128], tri: [1560, 1540, 128, 128],
};

function stencilText(g, text, x, y, size, opts = {}) {
  const font = opts.font || `700 ${size}px "Bahnschrift Condensed", "Bahnschrift", "Barlow Condensed", "Oswald", sans-serif`;
  g.font = font; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  let cx = x;
  const sp = opts.spacing ?? size * 0.06;
  for (const ch of text) {
    const w = g.measureText(ch).width;
    g.fillStyle = opts.color || '#e9e7df';
    g.fillText(ch, cx, y);
    if ('0OQDB8RPA69@'.includes(ch)) {
      // stencil bridges
      g.save(); g.globalCompositeOperation = 'destination-out';
      const bw = Math.max(2, w * 0.09);
      g.fillRect(cx + w / 2 - bw / 2, y - size * 0.78, bw, size * 0.16);
      g.fillRect(cx + w / 2 - bw / 2, y - size * 0.12, bw, size * 0.14);
      g.restore();
    }
    cx += w + sp;
  }
  return cx - x;
}

function fitText(g, text, region, sizeFrac = 0.72, opts = {}) {
  const [x, y, w, h] = region;
  let size = h * sizeFrac;
  g.font = `700 ${size}px "Bahnschrift Condensed", "Bahnschrift", sans-serif`;
  let tw = 0; for (const ch of text) tw += g.measureText(ch).width + size * 0.06;
  if (tw > w * 0.92) size *= (w * 0.92) / tw;
  g.font = `700 ${size}px "Bahnschrift Condensed", "Bahnschrift", sans-serif`;
  tw = 0; for (const ch of text) tw += g.measureText(ch).width + size * 0.06;
  stencilText(g, text, x + (w - tw) / 2, y + h / 2 + size * 0.36, size, opts);
}

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const rnd = mulberry32(5150);
  // 07
  fitText(g, '07', R.n07, 0.92);
  // emblem: wave + anchor
  {
    const [x, y, w, h] = R.emblem; const cx = x + w / 2, cy = y + h / 2;
    g.save(); g.translate(cx, cy); g.strokeStyle = '#e9e7df'; g.fillStyle = '#e9e7df'; g.lineCap = 'butt';
    g.lineWidth = 20;
    g.beginPath(); g.arc(0, 0, 196, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 172, 0, Math.PI * 2); g.stroke();
    // anchor
    g.lineWidth = 22;
    g.beginPath(); g.moveTo(0, -112); g.lineTo(0, 108); g.stroke();
    g.beginPath(); g.arc(0, -132, 22, 0, Math.PI * 2); g.lineWidth = 12; g.stroke();
    g.lineWidth = 18; g.beginPath(); g.moveTo(-62, -78); g.lineTo(62, -78); g.stroke();
    g.lineWidth = 20; g.beginPath(); g.arc(0, 30, 92, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 66, 92); g.lineTo(s * 98, 52); g.lineTo(s * 54, 72); g.closePath(); g.fill(); }
    // wave curling over the anchor
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(-150, 20);
    g.bezierCurveTo(-110, -40, -40, -40, -10, 10);
    g.bezierCurveTo(10, 40, 70, 40, 90, 0);
    g.bezierCurveTo(105, -30, 80, -60, 55, -40);
    g.stroke();
    g.beginPath(); g.moveTo(-160, 62); g.bezierCurveTo(-110, 30, -60, 70, -10, 60); g.bezierCurveTo(40, 50, 100, 80, 150, 50); g.stroke();
    // stencil cuts
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(-4, -200, 8, 30); g.fillRect(-4, 170, 8, 30); g.fillRect(-200, -4, 30, 8); g.fillRect(170, -4, 30, 8);
    g.fillRect(-6, -60, 12, 10); g.fillRect(-6, 40, 12, 10);
    g.restore();
  }
  // name
  fitText(g, 'BREAKER DELTA', R.name, 0.7, { spacing: 18 });
  // hazard stripes
  {
    const [x, y, w, h] = R.hazard;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = '#d6a116'; g.fillRect(x, y, w, h);
    g.fillStyle = '#121212';
    for (let k = -4; k < 16; k++) { const x0 = x + k * 90; g.beginPath(); g.moveTo(x0, y + h); g.lineTo(x0 + 45, y + h); g.lineTo(x0 + 45 + h, y); g.lineTo(x0 + h, y); g.closePath(); g.fill(); }
    g.restore();
  }
  const band = (r, col) => { const [x, y, w, h] = r; g.fillStyle = col; g.fillRect(x + 4, y + h * 0.2, w - 8, h * 0.6); };
  band(R.red, '#a3201b'); band(R.orange, '#c8451a');
  fitText(g, 'CAUTION  HYD PRESS 4', R.caution, 0.55);
  fitText(g, 'NO STEP', R.nostep, 0.6);
  { const [x, y, w, h] = R.nostep; g.fillStyle = '#e9e7df'; g.fillRect(x + 20, y + 12, w - 40, 8); g.fillRect(x + 20, y + h - 20, w - 40, 8); }
  fitText(g, 'DANGER  REACTOR CORE', R.danger, 0.55);
  fitText(g, '07-L', R.legL, 0.7); fitText(g, '07-R', R.legR, 0.7);
  fitText(g, 'INSP 11-26 OK', R.insp, 0.55);
  fitText(g, 'LIFT POINT', R.lift, 0.5);
  fitText(g, 'HYD-3  BLEED', R.hydr, 0.55);
  // wide white stripe with thin edge lines either side
  { const [x, y, w, h] = R.whiteBar; g.fillStyle = '#e9e7df'; g.fillRect(x + 6, y + h * 0.27, w - 12, h * 0.46); g.fillRect(x + 6, y + h * 0.06, w - 12, h * 0.07); g.fillRect(x + 6, y + h * 0.87, w - 12, h * 0.07); }
  // vertical scale: base line + long / short ticks (drawn along the region's length)
  { const [x, y, w, h] = R.scaleV; g.fillStyle = '#e9e7df'; g.fillRect(x + 8, y + h * 0.08, w - 16, h * 0.08);
    for (let k = 0; k <= 30; k++) { const tx = x + 12 + (w - 24) * k / 30, long = k % 5 === 0; g.fillRect(tx - 3, y + h * 0.16, 6, h * (long ? 0.62 : 0.32)); } }
  // inverted triangle mark
  { const [x, y, w, h] = R.tri; g.fillStyle = '#e9e7df'; g.beginPath(); g.moveTo(x + 10, y + 14); g.lineTo(x + w - 10, y + 14); g.lineTo(x + w / 2, y + h - 12); g.closePath(); g.fill(); }
  { const [x, y, w, h] = R.arrow; g.fillStyle = '#e9e7df'; g.beginPath(); g.moveTo(x + w / 2, y + 10); g.lineTo(x + w - 40, y + h - 20); g.lineTo(x + 40, y + h - 20); g.closePath(); g.fill(); }
  // rust-water / oil streaks hanging from a top edge (bolt rows, seams)
  const streaks = (r, c0, c1, n, maxA) => {
    const [x, y, w, h] = r;
    for (let i = 0; i < n; i++) {
      const sx = x + 6 + rnd() * (w - 12), len = h * (0.25 + Math.pow(rnd(), 0.7) * 0.75), sw = 2 + rnd() * 9;
      const a0 = (0.25 + rnd() * 0.75) * maxA;
      const gr = g.createLinearGradient(sx, y, sx, y + len);
      gr.addColorStop(0, `rgba(${c0},${a0})`); gr.addColorStop(0.55, `rgba(${c1},${a0 * 0.55})`); gr.addColorStop(1, `rgba(${c1},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(sx - sw * 0.5, y); g.lineTo(sx + sw * 0.5, y); g.lineTo(sx + sw * 0.25, y + len); g.lineTo(sx - sw * 0.25, y + len); g.closePath(); g.fill();
      if (rnd() < 0.35) { g.fillStyle = `rgba(${c1},${a0 * 0.7})`; g.beginPath(); g.arc(sx, y + len * 0.92, sw * 0.4, 0, Math.PI * 2); g.fill(); }
    }
    // source stain band along the top
    const gb = g.createLinearGradient(0, y, 0, y + h * 0.12);
    gb.addColorStop(0, `rgba(${c0},${maxA * 0.6})`); gb.addColorStop(1, `rgba(${c0},0)`);
    g.fillStyle = gb; g.fillRect(x, y, w, h * 0.12);
  };
  streaks(R.rust, '122,58,22', '96,52,26', 46, 0.85);
  streaks(R.grime, '22,18,14', '30,26,20', 36, 0.8);
  { // blotchy rust spot
    const [x, y, w, h] = R.rustSpot;
    for (let i = 0; i < 70; i++) {
      const cx = x + w / 2 + (rnd() - 0.5) * w * 0.6, cy = y + h / 2 + (rnd() - 0.5) * h * 0.6, rr = 6 + rnd() * 40;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      const c = rnd() < 0.5 ? '130,62,20' : '160,96,34';
      gr.addColorStop(0, `rgba(${c},${0.25 + rnd() * 0.4})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    }
    streaks([x, y + h * 0.55, w, h * 0.45], '120,60,22', '96,52,26', 14, 0.6);
  }
  // distress: speckle erosion + scrub streaks + overspray softness
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 30000; i++) {
    const x = rnd() * S, y = i < 26000 ? rnd() * 1000 : 1540 + rnd() * 128;
    const r = Math.pow(rnd(), 3) * 7 + 0.6;
    g.globalAlpha = 0.25 + rnd() * 0.75;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * 1000, l = 20 + rnd() * 160, a = (rnd() - 0.5) * 0.5;
    g.globalAlpha = 0.3 + rnd() * 0.5; g.lineWidth = 1 + rnd() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.restore();
  // rust-water stains (darken) on white parts: draw semi transparent brown vertical streaks via source-atop
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 200; i++) {
    const x = rnd() * S, y = rnd() * 1000, l = 30 + rnd() * 140;
    const gr = g.createLinearGradient(x, y, x, y + l);
    gr.addColorStop(0, 'rgba(90,50,20,0.55)'); gr.addColorStop(1, 'rgba(90,50,20,0)');
    g.fillStyle = gr; g.fillRect(x, y, 3 + rnd() * 8, l);
  }
  g.restore();
  // soften edges (overspray)
  const c2 = document.createElement('canvas'); c2.width = c2.height = S;
  const g2 = c2.getContext('2d');
  g2.filter = 'blur(1.6px)';
  g2.drawImage(c, 0, 0);
  g2.filter = 'none';
  g2.globalAlpha = 0.55; g2.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(c2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildDecals(B) {
  const group = new THREE.Group(); group.name = 'decals';
  const atlas = makeAtlas();
  const mat = new THREE.MeshPhysicalMaterial({
    map: atlas, transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.5, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.07, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  });
  B.root.updateMatrixWorld(true);
  const tmpMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  const dummy = new THREE.Object3D();
  const geos = [];
  const place = (meshName, joint, fromRest, toRest, size, region, roll = 0) => {
    const mesh = B.named[meshName];
    if (!mesh) return;
    const from = B.pw(joint, fromRest), to = B.pw(joint, toRest);
    const dir = to.clone().sub(from).normalize();
    const prevMat = mesh.material; mesh.material = tmpMat;
    ray.set(from, dir); ray.far = from.distanceTo(to) * 2;
    const hit = ray.intersectObject(mesh, false)[0];
    mesh.material = prevMat;
    if (!hit) { (group.userData.missed ||= []).push(meshName + ':' + region); return; }
    const n = dir.clone().negate();
    dummy.position.copy(hit.point);
    dummy.up.set(0, 1, 0);
    if (Math.abs(n.y) > 0.9) dummy.up.copy(B.pw(joint, fromRest.clone().add(new THREE.Vector3(0, 0, -1))).sub(from).normalize());
    dummy.lookAt(hit.point.clone().add(n));
    dummy.rotateZ(roll);
    const geo = new DecalGeometry(mesh, hit.point, dummy.rotation.clone(), new THREE.Vector3(size[0], size[1], size[2] ?? 2.0));
    // remap uv to atlas region
    const [x, y, w, h] = R[region];
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (x + u * w) / S, 1 - (y + (1 - v) * h) / S);
    }
    geo.userData.label = meshName + ':' + region + ':' + geo.attributes.position.count;
    geos.push(geo);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // left pauldron: 07 + emblem on the side plate, orange stripe on the upper shell side
  place('pauldronSideL', 'pauldronL', V(22, 59.5, -1.4), V(14, 59.5, -1.4), [3.3, 2.3], 'n07');
  place('pauldronSideL', 'pauldronL', V(22, 59.7, 1.55), V(14, 59.7, 1.55), [2.2, 2.2], 'emblem');
  // wide white vertical stripe with thin edge lines on the inner side of each pauldron (front face)
  for (const [nm, j, s] of [['pauldronFrontL', 'pauldronL', 1], ['pauldronFrontR', 'pauldronR', -1]]) {
    place(nm, j, V(s * 9.75, 63.65, 14), V(s * 9.75, 63.65, 0), [2.3, 0.8, 4], 'whiteBar', Math.PI / 2);
  }
  place('pauldronSideR', 'pauldronR', V(-22, 59.6, -1.0), V(-14, 59.6, -1.0), [2.6, 0.7], 'lift');
  // chest flank names
  place('flankL', 'chest', V(16, 57.6, -2.1), V(6, 57.6, -2.1), [5.4, 0.95, 3], 'name');
  place('flankR', 'chest', V(-16, 57.6, -2.1), V(-6, 57.6, -2.1), [5.4, 0.95, 3], 'name');
  place('chestShellL', 'chest', V(6.6, 57.35, 12), V(6.6, 57.35, 0), [2.6, 0.32, 4], 'danger', -0.36);
  place('chestShellL', 'chest', V(19, 58.4, 7.5), V(5, 58.4, -0.5), [4.4, 0.66, 5], 'name', -0.06);
  place('chestShellR', 'chest', V(-19, 58.4, 7.5), V(-5, 58.4, -0.5), [4.4, 0.66, 5], 'name', 0.06);
  // thin red lines on the cheeks, running down along the cheek line and folding back along the cheek's top
  place('cheekL', 'neck', V(6.29, 65.75, 6.22), V(1.25, 65.75, 2.98), [1.15, 0.1, 2], 'red', -1.15);
  place('cheekL', 'neck', V(8.0, 66.18, 1.95), V(0, 66.18, 1.95), [1.3, 0.1, 2], 'red', 0.0);
  place('cheekR', 'neck', V(-6.29, 65.75, 6.22), V(-1.25, 65.75, 2.98), [1.15, 0.1, 2], 'red', 1.15);
  place('cheekR', 'neck', V(-8.0, 66.18, 1.95), V(0, 66.18, 1.95), [1.3, 0.1, 2], 'red', 0.0);
  // forearms / thighs labels
  place('forearmL', 'elbowL', V(12.5, 41.5, 12), V(12.5, 41.5, 0), [3.2, 0.42, 4], 'caution');
  place('forearmR', 'elbowR', V(-12.5, 41.5, 12), V(-12.5, 41.5, 0), [3.2, 0.42, 4], 'hydr');
  place('thighL', 'hipL', V(16, 37.5, 0.6), V(4, 37.5, 0.6), [2.2, 0.9, 4], 'legL');
  place('thighR', 'hipR', V(-16, 37.5, 0.6), V(-4, 37.5, 0.6), [2.2, 0.9, 4], 'legR');
  place('thighL', 'hipL', V(16, 33.2, 0.6), V(4, 33.2, 0.6), [2.4, 0.5, 4], 'insp');
  place('thighR', 'hipR', V(-16, 34.0, -0.6), V(-4, 34.0, -0.6), [2.2, 0.68, 4], 'nostep');
  // white vertical scale and inverted-triangle mark on the narrow plate in the thigh's front groove
  for (const [nm, j, s] of [['thighFrontL', 'hipL', 1], ['thighFrontR', 'hipR', -1]]) {
    place(nm, j, V(s * 4.7, 34.6, 14), V(s * 4.7, 34.6, 0), [8.2, 0.48, 3], 'scaleV', Math.PI / 2);
    place(nm, j, V(s * 4.7, 39.9, 14), V(s * 4.7, 39.9, 0), [0.95, 0.95, 3], 'tri', 0);
  }
  // rust-water and oil streaks hanging below bolt rows / seams / joints
  const streakSpots = [
    ['chestShellL', 'chest', V(4.2, 61.2, 12), V(4.2, 61.2, 0), [3.4, 2.2, 5], 'rust'],
    ['chestShellR', 'chest', V(-5.0, 61.0, 12), V(-5.0, 61.0, 0), [3.0, 2.0, 5], 'grime'],
    ['chestShellL', 'chest', V(7.6, 57.2, 12), V(7.6, 57.2, 0), [1.6, 2.4, 5], 'rust'],
    ['chestShellR', 'chest', V(-7.4, 56.8, 12), V(-7.4, 56.8, 0), [1.6, 2.2, 5], 'rust'],
    ['pauldronShellL', 'pauldronL', V(13.4, 64.6, 14), V(13.4, 64.6, 0), [4.0, 2.2, 5], 'rust'],
    ['pauldronShellR', 'pauldronR', V(-11.6, 64.7, 14), V(-11.6, 64.7, 0), [3.6, 2.0, 5], 'grime'],
    ['pauldronSideL', 'pauldronL', V(22, 59.2, 0.2), V(14, 59.2, 0.2), [1.4, 1.8, 3], 'rust'],
    ['thighL', 'hipL', V(16, 39.0, -1.6), V(4, 39.0, -1.6), [1.8, 4.2, 4], 'rust'],
    ['thighR', 'hipR', V(-16, 38.0, -0.4), V(-4, 38.0, -0.4), [1.6, 3.6, 4], 'grime'],
    ['thighL', 'hipL', V(15, 40.2, 11), V(5, 40.2, 0.5), [2.2, 3.0, 5], 'grime'],
    ['forearmL', 'elbowL', V(12.5, 43.2, 12), V(12.5, 43.2, 0), [2.8, 2.6, 4], 'rust'],
    ['forearmR', 'elbowR', V(-12.5, 43.6, 12), V(-12.5, 43.6, 0), [2.8, 2.8, 4], 'rust'],
    ['shinOuterL', 'kneeL', V(16, 22.6, 0.4), V(4, 22.6, 0.4), [3.2, 3.2, 4], 'rustSpot'],
    ['shinOuterR', 'kneeR', V(-16, 22.6, 0.4), V(-4, 22.6, 0.4), [3.2, 3.2, 4], 'rustSpot'],
    ['backPanelL', 'chest', V(6.6, 61.2, -16), V(6.6, 61.2, 0), [2.6, 2.4, 5], 'rust'],
    ['backPanelR', 'chest', V(-6.8, 54.6, -16), V(-6.8, 54.6, 0), [2.2, 2.0, 5], 'grime'],
  ];
  for (const [m, j, f, t, sz, reg] of streakSpots) place(m, j, f, t, sz, reg, 0);
  if (geos.length) {
    for (const g of geos) {
      const m = new THREE.Mesh(g, mat);
      m.name = g.userData.label || '';
      m.renderOrder = 2;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  group.userData.material = mat;
  return group;
}
