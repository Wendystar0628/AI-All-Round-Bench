import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { MAIN, CLK, P, angDist, outRot } from './layout.js';
import { addStatue, addPedestal } from './statues.js';
import { lampPost } from './buildings.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const WH = 0xece3cf, WH2 = 0xe2d6bd, TR = 0xf3ebda, GOLD = 0xe8bd62, COP = 0x5d9e8b;
const Y0 = MAIN.plat.y;

function pointedShape(w, sh, k = 1.0) { const s = new THREE.Shape(); G.pointedArchPath(s, w, sh, 0, 8, k); return s; }

// gothic window: dark glass panel with pointed top + mullion + frame. Local: wall plane z=0 facing +z, bottom center at origin.
function gothicWindow(b, M4, w, h, opts = {}) {
  const sh = h - w * 0.87;
  b.add('glass', G.extrude(pointedShape(w, sh), 0.3, 0, 8), mul(M4, mat(0, 0, -0.05)), opts.glassCol || 0x2a3242);
  const ring = G.archRing(w, 0.3, 0.5, 'pointed', 12, sh);
  b.add('stone', ring, mul(M4, mat(0, 0, 0.12)), TR);
  b.add('stone', G.box(0.3, sh, 0.5), mul(M4, mat(-w / 2 - 0.15, 0, 0.12)), TR);
  b.add('stone', G.box(0.3, sh, 0.5), mul(M4, mat(w / 2 + 0.15, 0, 0.12)), TR);
  if (w > 1.6) {
    b.add('stone', G.box(0.18, sh + w * 0.3, 0.3), mul(M4, mat(0, 0, 0.15)), TR);
    const c = new THREE.TorusGeometry(w * 0.2, 0.08, 4, 14); b.add('stone', c, mul(M4, mat(0, sh + w * 0.42, 0.2)), TR);
  }
  b.add('stone', G.box(w + 0.6, 0.25, 0.7), mul(M4, mat(0, -0.25, 0.15)), TR);
}

export function pinnacle(b, M4, w, h, col = TR) {
  b.add('stone', G.box(w, h * 0.42, w), M4, col);
  b.add('stone', G.box(w * 1.2, h * 0.05, w * 1.2), mul(M4, mat(0, h * 0.42, 0)), col);
  b.add('stone', G.rotY45(new THREE.ConeGeometry(w * 0.68, h * 0.5, 4, 1)).translate(0, h * 0.25, 0), mul(M4, mat(0, h * 0.47, 0)), col);
  // crockets
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; b.add('stone', new THREE.SphereGeometry(w * 0.13, 5, 4), mul(M4, mat(Math.sin(a) * w * 0.32, h * 0.66, Math.cos(a) * w * 0.32)), col); }
  b.add('gold', new THREE.SphereGeometry(w * 0.16, 8, 6), mul(M4, mat(0, h * 0.98, 0)), GOLD);
}

function roseWindow(b, M4, r) {
  // outer frame rings
  b.add('stone', new THREE.TorusGeometry(r + 0.35, 0.55, 8, 48), mul(M4, mat(0, 0, 0.3)), TR);
  b.add('stone', new THREE.TorusGeometry(r * 0.32, 0.3, 6, 28), mul(M4, mat(0, 0, 0.3)), TR);
  const disk = new THREE.CylinderGeometry(r, r, 0.3, 48); disk.rotateX(Math.PI / 2);
  b.add('glass', disk, mul(M4, mat(0, 0, -0.1)), 0x283048);
  // stained glass glints (subtle emissive colored petals)
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    b.add('stone', G.box(0.22, r * 0.68, 0.36).translate(0, r * 0.32 + r * 0.34, 0), mul(M4, mat(0, 0, 0.25), new THREE.Matrix4().makeRotationZ(a)), TR);
    const petal = new THREE.CircleGeometry(r * 0.13, 10);
    b.add('stone', new THREE.TorusGeometry(r * 0.13, 0.09, 4, 12), mul(M4, mat(Math.sin(a + Math.PI / n) * r * 0.78, Math.cos(a + Math.PI / n) * r * 0.78, 0.28)), TR);
    b.add('stainedA', petal, mul(M4, mat(Math.sin(a + Math.PI / n) * r * 0.78, Math.cos(a + Math.PI / n) * r * 0.78, 0.06)), [0xc23a4a, 0x2c55a8, 0xd4a83a, 0x3a8a5a][i % 4]);
  }
  const center = new THREE.CircleGeometry(r * 0.3, 20);
  b.add('stainedA', center, mul(M4, mat(0, 0, 0.06)), 0xd4a83a);
}

// spire loggia tier: octagonal open arcade
function loggia(b, M4, r, h, n = 8) {
  b.add('stone', G.cyl(r + 0.25, r + 0.35, 0.6, n * 2), M4, TR);
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    b.add('marble', G.column(h - 1.4, r * 0.1, 8, 'corinth'), mul(M4, mat(Math.sin(a) * r, 0.6, Math.cos(a) * r)), TR);
  }
  // arches between columns (as ring of small arch rings)
  for (let i = 0; i < n; i++) {
    const a0 = (i + 0.5) / n * Math.PI * 2, a1 = (i + 1.5) / n * Math.PI * 2, am = (a0 + a1) / 2;
    const chord = 2 * r * Math.sin(Math.PI / n);
    b.add('stone', G.archRing(chord - r * 0.2, r * 0.09, r * 0.18, 'pointed', 8, 0), mul(M4, mat(Math.sin(am) * r * Math.cos(Math.PI / n), h - 0.8 - chord * 0.5, Math.cos(am) * r * Math.cos(Math.PI / n), am)), TR);
  }
  b.add('stone', G.cyl(r + 0.4, r + 0.4, 0.9, n * 2), mul(M4, mat(0, h - 0.6, 0)), TR);
  b.add('gold', G.cyl(r + 0.45, r + 0.45, 0.18, n * 2), mul(M4, mat(0, h + 0.2, 0)), GOLD);
  b.add('glowSoft', G.cyl(r * 0.55, r * 0.55, h - 2.2, 12), mul(M4, mat(0, 0.8, 0)));
}

export function buildTemple(ctx) {
  const { scene, M, collider } = ctx;
  const b = new Batch('temple');
  const rng = new RNG(404);
  const L = ctx.landmarks;

  // ------------------------------------------------ platform top ------------------------------------------------
  { const g = new THREE.CircleGeometry(MAIN.plat.r + 0.2, 160); g.rotateX(-Math.PI / 2); b.add('paving', g, mat(0, Y0, 0), 0xddd2bd); }
  collider.addGround(() => Y0, 0, 0, MAIN.plat.r + 0.5);

  // ------------------------------------------------ grand stair ------------------------------------------------
  const S = MAIN.stair; const hw = S.w / 2;
  const segs = S.segs;
  const groundAt = (z) => (z > MAIN.T1.r0 ? MAIN.T1.y : z > MAIN.T2.r0 ? MAIN.T2.y : MAIN.T3.y);
  for (let i = 0; i < segs.length - 1; i++) {
    const [za, ya] = segs[i], [zb, yb] = segs[i + 1];
    if (ya === yb) {
      // landing: paving + massive base with tunnel arches
      b.add('paving', G.box(S.w, 0.4, za - zb), mat(0, ya - 0.4, (za + zb) / 2), 0xdcd1bb);
      const gy = groundAt((za + zb) / 2);
      const sh = new THREE.Shape(); sh.moveTo(-(za - zb) / 2, 0); sh.lineTo((za - zb) / 2, 0); sh.lineTo((za - zb) / 2, ya - 0.4 - gy); sh.lineTo(-(za - zb) / 2, ya - 0.4 - gy); sh.lineTo(-(za - zb) / 2, 0);
      const hole = new THREE.Path(); const tmp = new THREE.Path(); G.roundArchPath(tmp, 5, 2.4, 0, 10); const pts = tmp.getPoints(); hole.moveTo(pts[0].x, pts[0].y); for (let k = 1; k < pts.length; k++) hole.lineTo(pts[k].x, pts[k].y);
      sh.holes.push(hole);
      const mass = G.extrude(sh, S.w + 3, 0, 10); mass.rotateY(Math.PI / 2);
      b.add('stone', mass, mat(0, gy, (za + zb) / 2), WH2);
      // lamp posts at landing corners
      for (const sx of [-1, 1]) for (const zz of [za - 0.8, zb + 0.8]) { b.add('stone', G.box(1.4, 1.3, 1.4), mat(sx * (hw + 0.8), ya, zz), TR); lampPost(b, mat(sx * (hw + 0.8), ya + 1.3, zz), 4.6); }
      collider.addBox(0, (gy + ya) / 2, (za + zb) / 2, hw + 1.5, (ya - gy) / 2 + 1, (za - zb) / 2, 0);
      continue;
    }
    const n = Math.round((yb - ya) / 0.17); const tread = (za - zb) / n; const rise = (yb - ya) / n;
    for (let k = 0; k < n; k++) {
      const z = za - (k + 0.5) * tread, y = ya + (k + 1) * rise;
      b.add('stone', G.box(S.w, rise + 0.02, tread + 0.02), mat(0, y - rise, z), k % 2 ? 0xe3d9c5 : 0xdcd1bb);
    }
    // solid sloped mass under the flight
    const gy = Math.min(groundAt(za - 0.1), groundAt(zb + 0.1));
    const sh = new THREE.Shape(); sh.moveTo(za, gy); sh.lineTo(zb, gy); sh.lineTo(zb, yb - rise); sh.lineTo(za, ya - 0.01); sh.lineTo(za, gy);
    const mass = G.extrude(sh, S.w + 3, 0, 4); // shape in (z as x, y) -> rotate so x->z
    mass.rotateY(-Math.PI / 2);
    b.add('stone', mass, mat(0, 0, 0), WH2);
    // side stringer walls + balustrade following slope
    for (const sx of [-1, 1]) {
      const a = V3(sx * (hw + 0.8), ya + 0.1, za), c = V3(sx * (hw + 0.8), yb + 0.1, zb);
      b.add('stone', G.box(1, 0.35, 1.6).translate(0.5, 0, 0), matSeg(a, c), TR);
      const nb = Math.round(a.distanceTo(c) / 0.42);
      for (let k = 1; k < nb; k++) { const p = a.clone().lerp(c, k / nb); b.add('stone', G.baluster(0.95, 0.12, 5), mat(p.x, p.y + 0.15, p.z), TR); }
      b.add('stone', G.box(1, 0.22, 0.55).translate(0.5, 0, 0), matSeg(a.clone().add(V3(0, 1.15, 0)), c.clone().add(V3(0, 1.15, 0))), TR);
      for (let k = 0; k <= 3; k++) { const p = a.clone().lerp(c, k / 3); b.add('stone', G.box(0.8, 1.5, 0.8), mat(p.x, p.y - 0.1, p.z), TR); if (k === 1 || k === 2) lampPost(b, mat(p.x, p.y + 1.4, p.z), 3.4); }
    }
    collider.addBox(0, (gy + yb) / 2, (za + zb) / 2, hw + 1.5, (yb - gy) / 2 + 1.5, (za - zb) / 2, 0);
  }
  L.stairBottom = V3(0, MAIN.T1.y + 2, 160);
  L.stairTop = V3(0, Y0 + 2, 72);

  // ------------------------------------------------ ceremonial plaza ------------------------------------------------
  const PZ = 51, PR = 19.5;
  {
    // radial paving: sectors with alternating tones and concentric bands
    const pos = [], col = [], idx = [];
    const nS = 48, nR = 7; const cA = new THREE.Color(0xe9dfca), cB = new THREE.Color(0xcdbf9f), cC = new THREE.Color(0xb7a585);
    for (let j = 0; j < nR; j++) {
      const r0 = PR * (j / nR), r1 = PR * ((j + 1) / nR);
      for (let i = 0; i < nS; i++) {
        const a0 = i / nS * Math.PI * 2, a1 = (i + 1) / nS * Math.PI * 2;
        const c = (j === 3 || j === 6) ? cC : ((i + j) % 2 ? cA : cB);
        const base = pos.length / 3;
        for (const [r, a] of [[r0, a0], [r1, a0], [r1, a1], [r0, a1]]) { pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); col.push(c.r, c.g, c.b); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    b.add('marble', g, mat(0, Y0 + 0.06, PZ), null);
    // star inlay (8 points)
    const st = new THREE.Shape(); const nP = 8;
    for (let i = 0; i <= nP * 2; i++) { const a = i / (nP * 2) * Math.PI * 2; const r = i % 2 === 0 ? 6.2 : 2.3; const x = Math.sin(a) * r, y = Math.cos(a) * r; if (i === 0) st.moveTo(x, y); else st.lineTo(x, y); }
    const sg = new THREE.ExtrudeGeometry(st, { depth: 0.12, bevelEnabled: false }); sg.rotateX(-Math.PI / 2);
    b.add('gold', sg, mat(0, Y0 + 0.07, PZ), GOLD);
    const st2 = new THREE.Shape(); for (let i = 0; i <= nP * 2; i++) { const a = (i + 0.5) / (nP * 2) * Math.PI * 2; const r = i % 2 === 0 ? 4.0 : 1.6; const x = Math.sin(a) * r, y = Math.cos(a) * r; if (i === 0) st2.moveTo(x, y); else st2.lineTo(x, y); }
    const sg2 = new THREE.ExtrudeGeometry(st2, { depth: 0.14, bevelEnabled: false }); sg2.rotateX(-Math.PI / 2);
    b.add('stone', sg2, mat(0, Y0 + 0.08, PZ), 0x6a5e78);
    b.add('stone', G.torus(PR, 0.35, 4, 64).rotateX(Math.PI / 2), mat(0, Y0 + 0.1, PZ), 0xb7a585);
    // statues on tall pedestals, two rows
    const poses = ['staff', 'sword', 'book', 'wings', 'raise', 'spear', 'orb', 'pray', 'wings', 'sword'];
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const z = 66 - i * 7.6, x = sx * 22.5;
      const Mp = mat(x, Y0, z, -sx * Math.PI / 2);
      addPedestal(b, Mp, 2.2, 4.4, 'stone', TR);
      addStatue(b, mul(Mp, mat(0, 4.4, 0)), 5.6, poses[(i * 2 + (sx > 0 ? 1 : 0)) % poses.length], 'marble', 50 + i * 2 + sx, 0xf0e9dc);
      collider.addBox(x, Y0 + 5, z, 1.6, 5, 1.6, 0);
    }
    L.plaza = V3(0, Y0 + 2, PZ);
  }

  // ------------------------------------------------ temple body ------------------------------------------------
  const ZF = 32;                // facade
  const NH = 31, AH = 19;       // nave / aisle heights
  const nave = { x: 12, z0: -2, z1: ZF };
  const cross = { z0: -26, z1: -2 };
  const tran = { x: 34, z0: -24, z1: -4 };
  const choir = { z0: -44, z1: -26 };
  const domeZ = -14;
  // plinth for whole temple
  b.add('stone', G.box(46, 1.4, ZF + 60), mat(0, Y0, (ZF - 60) / 2 + 2), WH2);
  b.add('stone', G.box(74, 1.4, 24), mat(0, Y0, -14), WH2);
  // nave walls (clerestory)
  b.add('stone', G.box(24, NH, nave.z1 - 1 - choir.z0), mat(0, Y0, (nave.z1 - 1 + choir.z0) / 2), WH);
  // aisles
  for (const sx of [-1, 1]) {
    b.add('stone', G.box(8, AH, nave.z1 - 2 - nave.z0), mat(sx * 16, Y0, (nave.z1 - 2 + nave.z0) / 2), WH);
    b.add('stone', G.box(8, AH, choir.z1 - choir.z0), mat(sx * 16, Y0, (choir.z1 + choir.z0) / 2), WH);
  }
  // transepts
  b.add('stone', G.box(tran.x * 2, NH, tran.z1 - tran.z0), mat(0, Y0, (tran.z0 + tran.z1) / 2), WH);
  // apse
  b.add('stone', G.cyl(12, 12, NH, 24, false, 1), mat(0, Y0, choir.z0), WH);
  // cornices / string courses
  for (const [w, d, z] of [[24.8, nave.z1 - choir.z0 + 0.8, (nave.z1 + choir.z0) / 2], [tran.x * 2 + 0.8, tran.z1 - tran.z0 + 0.8, (tran.z0 + tran.z1) / 2]]) {
    b.add('stone', G.box(w, 0.8, d), mat(0, Y0 + NH - 0.8, z), TR);
    b.add('stone', G.box(w - 0.4, 0.4, d - 0.4), mat(0, Y0 + 12, z), TR);
  }
  b.add('stone', G.box(40.8, 0.7, nave.z1 - choir.z0 - 1), mat(0, Y0 + AH - 0.7, (nave.z1 + choir.z0) / 2), TR);
  // roofs (copper)
  {
    const nr = G.gableRoof(nave.z1 - choir.z0 + 1, 24, 11, 0.6, 0.3); nr.rotateY(Math.PI / 2);
    b.add('copper', nr, mat(0, Y0 + NH, (nave.z1 + choir.z0) / 2 + 0.5), COP);
    b.add('copper', G.gableRoof(tran.x * 2 + 1, tran.z1 - tran.z0, 10, 0.6, 0.3), mat(0, Y0 + NH, (tran.z0 + tran.z1) / 2), COP);
    b.add('copper', G.lathe([[12.6, 0], [0.01, 11]], 24, true, Math.PI / 2, Math.PI), mat(0, Y0 + NH - 0.3, choir.z0), COP);
    for (const sx of [-1, 1]) {
      const ar = G.box(9.4, 0.5, nave.z1 - nave.z0); b.add('copper', ar, mul(mat(sx * 16.4, Y0 + AH + 1.6, (nave.z1 + nave.z0) / 2 - 1), new THREE.Matrix4().makeRotationZ(-sx * 0.32)), COP);
      const ar2 = G.box(9.4, 0.5, choir.z1 - choir.z0); b.add('copper', ar2, mul(mat(sx * 16.4, Y0 + AH + 1.6, (choir.z1 + choir.z0) / 2), new THREE.Matrix4().makeRotationZ(-sx * 0.32)), COP);
    }
    // ridge gold cresting
    b.add('gold', G.box(0.35, 0.6, nave.z1 - choir.z0), mat(0, Y0 + NH + 11, (nave.z1 + choir.z0) / 2 + 0.5), GOLD);
    b.add('gold', G.box(tran.x * 2, 0.6, 0.35), mat(0, Y0 + NH + 10, (tran.z0 + tran.z1) / 2), GOLD);
    for (let k = 0; k < 18; k++) b.add('gold', G.cyl(0.08, 0.15, 1.3, 5), mat(0, Y0 + NH + 11.5, choir.z0 + 2 + k * 4.2), GOLD);
  }
  // windows: clerestory, aisle, transept fronts
  for (const sx of [-1, 1]) {
    for (let z = nave.z1 - 5; z > choir.z0; z -= 6.5) {
      if (z < cross.z1 + 1 && z > cross.z0 - 1) continue;
      const Mw = mat(sx * 12.05, Y0 + AH + 1.5, z, sx * Math.PI / 2);
      gothicWindow(b, Mw, 2.6, 8.6);
      const Ma = mat(sx * 20.05, Y0 + 3.5, z, sx * Math.PI / 2);
      gothicWindow(b, Ma, 2.4, 9.5);
    }
    // transept facade: tall window + small rose
    const Mt = mat(sx * (tran.x + 0.05), Y0, (tran.z0 + tran.z1) / 2, sx * Math.PI / 2);
    gothicWindow(b, mul(Mt, mat(0, 4, 0)), 5.5, 14);
    roseWindow(b, mul(Mt, mat(0, 23.5, 0.1)), 3.4);
    b.add('stone', G.gableWall(tran.z1 - tran.z0, 10, 0.6), mat(sx * (tran.x - 0.2), Y0 + NH, (tran.z0 + tran.z1) / 2), WH);
    for (const zz of [tran.z0, tran.z1]) pinnacle(b, mat(sx * tran.x, Y0 + NH, zz), 1.6, 10);
  }
  // apse windows
  for (let k = 0; k < 5; k++) { const a = Math.PI + (k - 2) * 0.5; gothicWindow(b, mat(Math.sin(a) * 12.05, Y0 + 7, choir.z0 - Math.cos(a) * 12.05 * -1, a + 0), 2.2, 13); }

  // ------------------------------------------------ flying buttresses ------------------------------------------------
  const flyer = (sx, z) => {
    const px = sx * 27.5;
    b.add('stone', G.box(2.6, AH + 10, 3.2), mat(px, Y0, z), WH2);
    b.add('stone', G.box(3.2, 1.2, 3.8), mat(px, Y0, z), WH2);
    pinnacle(b, mat(px, Y0 + AH + 10, z), 2.2, 12);
    // flying arch: curved band from pier top to clerestory
    const sh = new THREE.Shape();
    const x0 = 0, x1 = 14.2, yA = 0, yB = 7.5;
    sh.moveTo(x0, yA - 1.2); sh.quadraticCurveTo(x1 * 0.45, yA + 0.5, x1, yB - 1.8); sh.lineTo(x1, yB); sh.quadraticCurveTo(x1 * 0.45, yA + 3.6, x0, yA + 1.4); sh.lineTo(x0, yA - 1.2);
    const g = G.extrude(sh, 1.2, 0, 10);
    const m = mat(px - sx * 1.2, Y0 + AH + 5.5, z, sx > 0 ? Math.PI : 0);
    b.add('stone', g, m, TR);
    // second lower flyer
    const m2 = mat(px - sx * 1.2, Y0 + AH - 2.5, z, sx > 0 ? Math.PI : 0);
    b.add('stone', g, mul(m2, new THREE.Matrix4().makeScale(0.55, 0.7, 1)), TR);
  };
  for (const sx of [-1, 1]) { for (const z of [27, 20.5, 14, 7.5]) flyer(sx, z); for (const z of [-31, -38]) flyer(sx, z); }
  // pinnacles along clerestory parapet
  for (const sx of [-1, 1]) for (let z = nave.z1 - 2; z > choir.z0; z -= 6.5) { if (z < cross.z1 + 1 && z > cross.z0 - 1) continue; pinnacle(b, mat(sx * 12, Y0 + NH, z), 1.0, 5); }

  // ------------------------------------------------ facade, portal, rose window, bell towers ------------------------------------------------
  {
    const fz = ZF;
    // facade wall between towers with gable
    const pOuter = 8 + 5 * 1.7;
    b.add('stone', G.wallWithOpenings(26, 37, 3, [{ x: 0, w: pOuter, sh: 9, y0: 0, type: 'pointed' }], 12), mat(0, Y0, fz + 1), WH);
    for (const sx of [-1, 1]) { b.add('stone', G.box(2.2, 37, 2.2), mat(sx * 12.4, Y0, fz + 2.6), TR); pinnacle(b, mat(sx * 12.4, Y0 + 37, fz + 2.6), 1.8, 9); for (const yy of [16, 26]) { b.add('stone', G.box(2.8, 0.6, 2.8), mat(sx * 12.4, Y0 + yy, fz + 2.6), TR); } }
    // tympanum wall at the back of the portal recess with the door opening
    b.add('stone', G.wallWithOpenings(pOuter + 1, 22, 0.8, [{ x: 0, w: 8, sh: 9, y0: 0, type: 'pointed' }], 10), mat(0, Y0, fz - 0.9), 0xe4d9c2);
    b.add('stone', G.gableWall(26, 9.5, 3).rotateY(Math.PI / 2), mat(0, Y0 + 37, fz + 1), WH);
    b.add('stone', G.box(27, 0.9, 3.8), mat(0, Y0 + 37, fz + 1), TR);
    for (let k = 0; k < 9; k++) { const t = k / 8; b.add('stone', G.box(0.9, 0.9, 1.2), mat(-12.6 + t * 12.6, Y0 + 37.9 + t * 9.0, fz + 2.4), TR); b.add('stone', G.box(0.9, 0.9, 1.2), mat(12.6 - t * 12.6, Y0 + 37.9 + t * 9.0, fz + 2.4), TR); }
    addStatue(b, mat(0, Y0 + 46.8, fz + 1.5), 4.2, 'raise', 'marble', 61, 0xf0e9dc);
    // portal: receding pointed archivolts
    const pw = 8, psh = 9;
    const Mp = mat(0, Y0, fz + 2.5);
    const ord = 6;
    for (let k = 0; k < ord; k++) {
      const w = pw + k * 1.7, dz = -k * 0.75 + 2.5;
      b.add('stone', G.archRing(w, 0.85, 0.9, 'pointed', 16, psh), mul(Mp, mat(0, 0, dz - 1.6)), k % 2 ? TR : 0xe9dfc8);
      for (const sx of [-1, 1]) b.add('marble', G.column(psh, 0.38, 10, 'corinth'), mul(Mp, mat(sx * (w / 2 + 0.43), 0, dz - 1.6)), TR);
    }
    const outerW = pw + (ord - 1) * 1.7 + 1.8;
    b.add('stone', G.box(outerW + 3, 1.2, 6), mul(Mp, mat(0, -1.0, 0)), TR);
    // tympanum relief (gold sun) inside the arch
    const tym = new THREE.CircleGeometry(2.2, 24); b.add('gold', tym, mul(Mp, mat(0, psh + 3.2, -4.6)), GOLD);
    // doors half open with interior light
    b.add('glow', G.box(pw, psh + 4.5, 0.2), mul(Mp, mat(0, 0, -6.5)));
    for (const sx of [-1, 1]) {
      b.add('wood', G.box(pw / 2, psh + 1, 0.35), mul(Mp, mat(sx * pw / 2, 0, -5.2, sx * 0.75), mat(-sx * pw / 4, 0, 0)), 0x6b4a2e);
      for (let k = 0; k < 5; k++) b.add('gold', G.box(pw / 2, 0.15, 0.4), mul(Mp, mat(sx * pw / 2, 0, -5.2, sx * 0.75), mat(-sx * pw / 4, 1.5 + k * 2, 0)), GOLD);
    }
    // statues flanking the portal on jamb pedestals
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const x = sx * (outerW / 2 + 1.6 + k * 3.2);
      addPedestal(b, mat(x, Y0, fz + 3.2), 1.6, 3.2, 'stone', TR);
      addStatue(b, mat(x, Y0 + 3.2, fz + 3.2), 4.6, k ? 'book' : 'staff', 'marble', 70 + k + sx, 0xf0e9dc);
      b.add('stone', G.archRing(2.4, 0.3, 0.6, 'pointed', 8, 0), mat(x, Y0 + 8.4, fz + 2.8), TR);
    }
    // gallery of arches above portal
    for (let k = -5; k <= 5; k++) {
      if (Math.abs(k) > 1) b.add('marble', G.column(3.0, 0.2, 8, 'corinth'), mat(k * 2.1, Y0 + 16.0, fz + 2.7), TR);
    }
    b.add('stone', G.box(24, 0.6, 1.6), mat(0, Y0 + 15.4, fz + 2.6), TR);
    // rose window
    roseWindow(b, mat(0, Y0 + 32.0, fz + 2.5), 5.2);
    b.add('stone', G.box(13.5, 13.5, 0.6), mat(0, Y0 + 25.3, fz + 2.3), 0xe4d9c2);
    for (const sx of [-1, 1]) { b.add('dark', G.box(2.6, 5.2, 0.2), mat(sx * 9.2, Y0 + 19.5, fz + 2.55)); b.add('stone', G.archRing(2.6, 0.35, 0.6, 'pointed', 8, 0), mat(sx * 9.2, Y0 + 24.7, fz + 2.6), TR); addStatue(b, mat(sx * 9.2, Y0 + 19.6, fz + 2.9), 4.4, sx > 0 ? 'orb' : 'sword', 'marble', 80 + sx, 0xf0e9dc); b.add('stone', G.box(3.0, 0.5, 1.2), mat(sx * 9.2, Y0 + 19.1, fz + 3.0), TR); }
    // bell towers
    for (const sx of [-1, 1]) {
      const tx = sx * 19, tz = fz - 2;
      const sz = 11;
      b.add('stone', G.box(sz, 44, sz), mat(tx, Y0, tz), WH);
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) b.add('stone', G.box(1.6, 44, 1.6), mat(tx + cx * sz / 2, Y0, tz + cz * sz / 2), TR);
      for (const yy of [14, 28, 43.2]) b.add('stone', G.box(sz + 1.6, 0.8, sz + 1.6), mat(tx, Y0 + yy, tz), TR);
      for (let f = 0; f < 4; f++) {
        const Mf = mul(mat(tx, Y0, tz, f * Math.PI / 2), mat(0, 0, sz / 2 + 0.02));
        gothicWindow(b, mul(Mf, mat(0, 17, 0)), 2.0, 8);
        gothicWindow(b, mul(Mf, mat(0, 31, 0)), 2.0, 8.5);
      }
      // belfry stage (open arches, bell visible)
      const by = Y0 + 44, bs = 9.4, bh = 14;
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) b.add('stone', G.box(2.0, bh, 2.0), mat(tx + cx * (bs / 2 - 1), by, tz + cz * (bs / 2 - 1)), WH);
      for (let f = 0; f < 4; f++) {
        const Mf = mul(mat(tx, by, tz, f * Math.PI / 2), mat(0, 0, bs / 2 - 0.6));
        b.add('stone', G.wallWithOpenings(bs - 3.8, bh, 0.9, [{ x: 0, w: bs - 5.4, sh: bh - 5.5, y0: 0, type: 'pointed' }], 10), Mf, TR);
        pinnacle(b, mul(mat(tx, by + bh, tz, f * Math.PI / 2), mat(bs / 2 - 1, 0, bs / 2 - 1)), 1.1, 7);
      }
      b.add('wood', G.box(bs - 2.5, 0.6, 0.8), mat(tx, by + bh - 3.2, tz), 0x6e5440);
      const bell = G.lathe([[0.001, 0], [2.3, 0.03], [2.2, 0.4], [1.6, 1.4], [1.4, 2.8], [1.2, 3.4], [0.5, 3.7], [0.001, 3.75]], 22, false);
      b.add('bronze', bell, mat(tx, by + bh - 7.0, tz), 0xb8823e);
      b.add('stone', G.box(bs + 1, 1.0, bs + 1), mat(tx, by + bh, tz), TR);
      // octagonal stage + spire
      b.add('stone', G.cyl(3.8, 4.2, 8, 8), mat(tx, by + bh + 1, tz, Math.PI / 8), WH);
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.add('dark', G.box(1.0, 4.0, 0.2), mat(tx + Math.sin(a) * 3.95, by + bh + 3, tz + Math.cos(a) * 3.95, a)); }
      b.add('copper', G.cone(4.6, 24, 8), mat(tx, by + bh + 9, tz, Math.PI / 8), COP);
      for (let k = 0; k < 3; k++) b.add('gold', G.cyl(3.6 - k * 1.1, 3.6 - k * 1.1, 0.25, 8), mat(tx, by + bh + 13 + k * 5.5, tz, Math.PI / 8), GOLD);
      b.add('gold', new THREE.SphereGeometry(0.6, 10, 8), mat(tx, by + bh + 33.2, tz), GOLD);
      b.add('gold', G.cyl(0.1, 0.1, 3.5, 6), mat(tx, by + bh + 33.6, tz), GOLD);
      ctx.flags.push({ pos: V3(tx, by + bh + 37.0, tz), w: 5.5, h: 3.2, kind: 0 });
      collider.addBox(tx, Y0 + 40, tz, sz / 2 + 1, 41, sz / 2 + 1, 0);
      L['templeBell' + (sx > 0 ? 'R' : 'L')] = V3(tx, by + bh - 6, tz);
    }
    L.portal = V3(0, Y0 + 8, fz + 3);
    L.rose = V3(0, Y0 + 35.5, fz + 3);
  }

  // ------------------------------------------------ main dome, drum, small domes ------------------------------------------------
  const DY = Y0 + NH; // drum base
  {
    // square base over crossing
    b.add('stone', G.box(30, 8, 30), mat(0, DY, domeZ), WH);
    b.add('stone', G.box(31, 0.8, 31), mat(0, DY + 8, domeZ), TR);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pinnacle(b, mat(sx * 14.6, DY + 8.8, domeZ + sz * 14.6), 1.6, 8);
    // drum
    const dr = 14.5, dh = 14;
    b.add('stone', G.cyl(dr, dr, dh, 48), mat(0, DY + 8.8, domeZ), WH);
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * Math.PI * 2;
      const Mw = mat(Math.sin(a) * (dr + 0.02), DY + 11.5, domeZ + Math.cos(a) * (dr + 0.02), a);
      gothicWindow(b, Mw, 1.9, 7.6);
      const pa = k / 16 * Math.PI * 2;
      b.add('stone', G.box(1.1, dh, 1.1), mat(Math.sin(pa) * (dr + 0.3), DY + 8.8, domeZ + Math.cos(pa) * (dr + 0.3), pa), TR);
    }
    b.add('stone', G.cyl(dr + 0.9, dr + 0.9, 1.0, 48), mat(0, DY + 8.8 + dh, domeZ), TR);
    b.add('gold', G.cyl(dr + 0.95, dr + 0.95, 0.25, 48), mat(0, DY + 8.8 + dh + 1.0, domeZ), GOLD);
    // ribbed dome
    const dBase = DY + 8.8 + dh + 1.0;
    const prof = G.domeProfile(dr + 0.4, 19.5, 22, 'pointed');
    b.add('copper', G.lathe(prof, 64, true), mat(0, dBase, domeZ), COP);
    // gold ribs following profile
    const ribPts = prof.map(([r, y]) => [r + 0.32, y + 0.12]);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      const pts = ribPts.slice(0, -2).map(([r, y]) => V3(Math.sin(a) * r, dBase + y, domeZ + Math.cos(a) * r));
      b.add('gold', G.tube(pts, 0.32, 5, 28), null, GOLD);
    }
    // lantern
    const lY = dBase + 19.2;
    b.add('stone', G.cyl(3.6, 3.8, 1.0, 16), mat(0, lY, domeZ), TR);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.add('marble', G.column(5, 0.32, 8), mat(Math.sin(a) * 3.0, lY + 1, domeZ + Math.cos(a) * 3.0), TR); }
    b.add('glowSoft', G.cyl(2.0, 2.0, 4.6, 12), mat(0, lY + 1.1, domeZ));
    b.add('stone', G.cyl(3.8, 3.8, 1.1, 16), mat(0, lY + 6, domeZ), TR);
    b.add('copper', G.lathe(G.domeProfile(3.8, 3.4, 8, 'pointed'), 24), mat(0, lY + 7.1, domeZ), COP);
    L.dome = V3(0, dBase + 8, domeZ);
    L.domeTop = V3(0, lY + 10, domeZ);
    collider.addCyl(0, domeZ, dr + 2, DY - 30, lY + 10);
    L.domeRib = V3(Math.sin(0.2) * (dr + 0.5), dBase + 4, domeZ + Math.cos(0.2) * (dr + 0.5));

    // four small domes at the corners of the crossing
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 19.5, z = domeZ + sz * 15.5;
      b.add('stone', G.box(9, DY + 5 - (Y0 + AH), 9), mat(x, Y0 + AH, z), WH);
      b.add('stone', G.box(9.6, 0.6, 9.6), mat(x, DY + 5, z), TR);
      b.add('stone', G.cyl(3.9, 3.9, 4.6, 24), mat(x, DY + 5.6, z), WH);
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.add('dark', G.box(0.7, 2.6, 0.2), mat(x + Math.sin(a) * 3.92, DY + 6.5, z + Math.cos(a) * 3.92, a)); }
      b.add('stone', G.cyl(4.3, 4.3, 0.5, 24), mat(x, DY + 10.2, z), TR);
      const sp = G.domeProfile(4.2, 5.4, 12, 'pointed');
      b.add('copper', G.lathe(sp, 32, true), mat(x, DY + 10.7, z), COP);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.add('gold', G.tube(sp.slice(0, -1).map(([r, y]) => V3(x + Math.sin(a) * (r + 0.12), DY + 10.7 + y + 0.05, z + Math.cos(a) * (r + 0.12))), 0.14, 4, 12), null, GOLD); }
      b.add('stone', G.cyl(1.0, 1.1, 0.5, 10), mat(x, DY + 16.0, z), TR);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.add('stone', G.cyl(0.1, 0.1, 1.6, 4), mat(x + Math.sin(a) * 0.8, DY + 16.5, z + Math.cos(a) * 0.8), TR); }
      b.add('copper', G.cone(1.2, 2.2, 10), mat(x, DY + 18.1, z), COP);
      b.add('gold', new THREE.SphereGeometry(0.3, 8, 6), mat(x, DY + 20.5, z), GOLD);
    }
  }

  // ------------------------------------------------ spire with loggias, crystal cradle ------------------------------------------------
  const spBase = L.domeTop.y - 0.5;
  {
    let y = spBase;
    const tiers = [[3.0, 7.5], [2.4, 6.4], [1.8, 5.2]];
    tiers.forEach(([r, h], i) => {
      loggia(b, mat(0, y, domeZ), r, h, 8);
      y += h + 0.2;
      const sh = 5.5 - i;
      b.add('stone', G.cyl(r * 0.82, r * 0.9, sh, 8), mat(0, y, domeZ, Math.PI / 8), WH);
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.add('dark', G.box(0.32, sh * 0.55, 0.1), mat(Math.sin(a) * r * 0.86, y + sh * 0.2, domeZ + Math.cos(a) * r * 0.86, a)); }
      b.add('gold', G.cyl(r * 0.92, r * 0.92, 0.25, 8), mat(0, y + sh, domeZ, Math.PI / 8), GOLD);
      y += sh;
    });
    // needle
    b.add('copper', G.cone(1.6, 26, 8), mat(0, y, domeZ, Math.PI / 8), COP);
    for (let k = 0; k < 5; k++) b.add('gold', G.cyl(1.45 - k * 0.27, 1.45 - k * 0.27, 0.22, 8), mat(0, y + 2 + k * 4.6, domeZ, Math.PI / 8), GOLD);
    y += 25.6;
    // cradle: gold crown with petals pointing up
    b.add('gold', G.cyl(0.4, 0.25, 1.4, 8), mat(0, y, domeZ), GOLD);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const pts = [V3(0, y + 1.2, domeZ), V3(Math.sin(a) * 1.4, y + 2.0, domeZ + Math.cos(a) * 1.4), V3(Math.sin(a) * 2.2, y + 3.4, domeZ + Math.cos(a) * 2.2), V3(Math.sin(a) * 2.0, y + 4.4, domeZ + Math.cos(a) * 2.0)];
      b.add('gold', G.taperTube(pts, 0.22, 0.07, 5, 10), null, GOLD);
    }
    ctx.ballCenter = V3(0, y + 10.5, domeZ);
    L.spire = V3(0, spBase + 22, domeZ);
    L.ball = ctx.ballCenter.clone();
    collider.addCyl(0, domeZ, 4.5, spBase, y + 4);
  }

  // ------------------------------------------------ cistern behind the temple ------------------------------------------------
  {
    const r0 = 54, r1 = 69, a0 = -0.36, a1 = 0.36;
    // basin walls: inner and outer arcs + ends
    const rim = (r, h) => b.add('stone', G.cyl(r, r, h, 40, true, 1).rotateY(0), mat(0, Y0 - 2, 0), WH2);
    const arcWall = (r, thick, h, y, col) => {
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * (i + 0.5) / n; const len = (a1 - a0) / n * r + 0.1;
        const p = P(r, a, 0); b.add('stone', G.box(len, h, thick), mat(p.x, y, p.z, outRot(a)), col);
      }
    };
    arcWall(r0, 1.2, 2.4, Y0 - 1.2, TR);
    arcWall(r1, 1.2, 2.4, Y0 - 1.2, TR);
    for (const a of [a0, a1]) { const p = P((r0 + r1) / 2, a, 0); b.add('stone', G.box(1.2, 2.4, r1 - r0 + 1.2), mat(p.x, Y0 - 1.2, p.z, outRot(a)), TR); }
    // basin floor (below water)
    const fl = new THREE.RingGeometry(r0, r1, 40, 1, Math.PI / 2 + a0 + 0.0, a1 - a0); fl.rotateX(-Math.PI / 2);
    b.add('stone', fl, mat(0, Y0 - 1.6, 0, 0), 0x9a9080);
    ctx.cistern = { r0, r1, a0, a1, y: Y0 + 0.4 };
    L.cistern = P((r0 + r1) / 2, 0, Y0 + 2);
    // decorative urns on the cistern ends
    for (const a of [a0 - 0.02, a1 + 0.02]) for (const r of [r0, r1]) { const p = P(r, a, 0); b.add('stone', G.lathe([[0.001, 0], [0.7, 0.1], [0.9, 0.7], [0.5, 1.4], [0.7, 1.7], [0.6, 1.8]], 12, false), mat(p.x, Y0 + 1.2, p.z), TR); }
    // overflow channels along the platform edge toward the cascade (left) and the canal (right)
    const channel = (aStart, aEnd, r) => {
      const n = Math.max(4, Math.round(Math.abs(aEnd - aStart) * r / 3));
      for (let i = 0; i < n; i++) {
        const a = aStart + (aEnd - aStart) * (i + 0.5) / n; const len = Math.abs(aEnd - aStart) / n * r + 0.1;
        for (const off of [-1.3, 1.3]) { const p = P(r + off, a, 0); b.add('stone', G.box(len, 0.9, 0.5), mat(p.x, Y0, p.z, outRot(a)), TR); }
      }
    };
    channel(-0.38, CLK(9.15) - Math.PI * 2 + 0.03, 66.5);
    channel(0.38, CLK(1.25) - 0.03, 66.5);
    ctx.channels = [{ a0: -0.38, a1: CLK(9.15) - Math.PI * 2 + 0.03, r: 66.5 }, { a0: 0.38, a1: CLK(1.25) - 0.03, r: 66.5 }];
  }

  // garden parterres either side of the temple
  for (const sx of [-1, 1]) {
    for (const [cx, cz, w, d] of [[sx * 46, 8, 14, 26], [sx * 47, -18, 12, 20], [sx * 41, -42, 16, 18]]) {
      b.add('grass', G.box(w, 0.3, d), mat(cx, Y0, cz), 0x6a9040);
      b.add('stone', G.box(w + 0.8, 0.45, 0.5), mat(cx, Y0, cz + d / 2 + 0.25), TR); b.add('stone', G.box(w + 0.8, 0.45, 0.5), mat(cx, Y0, cz - d / 2 - 0.25), TR);
      b.add('stone', G.box(0.5, 0.45, d), mat(cx + w / 2 + 0.25, Y0, cz), TR); b.add('stone', G.box(0.5, 0.45, d), mat(cx - w / 2 - 0.25, Y0, cz), TR);
      b.add('paving', G.box(w, 0.34, 1.2), mat(cx, Y0, cz), 0xd8ccb4);
      ctx.platformGardens = ctx.platformGardens || []; ctx.platformGardens.push([cx, cz, w, d]);
    }
  }
  // collider for temple mass
  collider.addBox(0, Y0 + 20, -6, 25, 21, 40, 0);
  collider.addBox(0, Y0 + 20, -14, 35, 21, 11, 0);

  b.build(scene, M, { dark: { cast: false }, glow: { cast: false }, glowSoft: { cast: false }, stainedA: { cast: false } });
}
