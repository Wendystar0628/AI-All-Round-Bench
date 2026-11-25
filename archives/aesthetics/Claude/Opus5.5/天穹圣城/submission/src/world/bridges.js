import * as THREE from 'three';
import { Batch, mat, mul, matSeg, matFrame } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { MAIN, SATS, CLK, P, angDist, outRot, dirOf, mainGround } from './layout.js';
import { lampPost } from './buildings.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = 0xe9e0cc, WHITE2 = 0xdcd0b8, TRIM = 0xf1e9d8, OLD = 0xc5b9a1, OLD2 = 0xb2a68e;

// frame for a straight bridge from A to B (horizontal x along A->B, y up)
function lineFrame(A, B) {
  const X = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
  const Y = V3(0, 1, 0); const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return { X, Y, Z, at: (t, y, z = 0) => new THREE.Vector3().copy(A).lerp(B, t).setY(y).addScaledVector(Z, z) };
}

// row of arch blocks between consecutive pier stations along A->B. topY(t): top height at fraction t
function arcadeRow(b, A, B, n, H, depth, topY, col, opts = {}) {
  const F = lineFrame(A, B);
  const pierW = opts.pierW || 2.6;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const pa = F.at(t0, 0), pb = F.at(t1, 0);
    const chord = pa.distanceTo(pb);
    const w = chord - pierW;
    const HH = Math.max(H, w / 2 + 2.2);
    const yTop = Math.min(topY(t0), topY(t1));
    const blk = G.wallWithOpenings(chord + 0.15, HH, depth, [{ x: 0, w, sh: Math.max(0.01, HH - 1.4 - w / 2), y0: -0.01, type: opts.type || 'round' }], 14);
    const m = mul(new THREE.Matrix4().makeTranslation(0, yTop - HH, 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1));
    b.add('stone', blk, m, col);
    if (opts.ring !== false) {
      const ring = G.archRing(w, 0.55, 0.35, opts.type || 'round', 14, 0);
      for (const sd of [-1, 1]) b.add('stone', ring, mul(new THREE.Matrix4().makeTranslation(0, yTop - HH + Math.max(0.01, HH - 1.4 - w / 2), 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, sd * (depth / 2 + 0.02)), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), opts.ringCol || TRIM);
    }
    // cornice line on top
    if (opts.cornice) b.add('stone', G.box(1, 0.5, depth + 0.8).translate(0.5, -0.5, 0), mul(new THREE.Matrix4().makeTranslation(0, yTop, 0), matSeg(pa, pb)), TRIM);
    out.push({ pa, pb, yTop, HH });
  }
  return out;
}

function pendant(b, x, y, z, w, len, ry, col) {
  const g = G.rotY45(new THREE.ConeGeometry(w * 0.72, len, 4, 1)); g.rotateX(Math.PI); g.translate(0, -len / 2, 0);
  b.add('stone', g, mat(x, y, z, ry), col);
}

function deckBalustrade(b, A, B, halfW, y, opts = {}) {
  const F = lineFrame(A, B);
  const len = A.clone().setY(0).distanceTo(B.clone().setY(0));
  for (const sd of [-1, 1]) {
    const a = F.at(0, A.y + (opts.yOff || 0), sd * halfW), c = F.at(1, B.y + (opts.yOff || 0), sd * halfW);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y + 0.1, a.z, c.x, c.y + 0.1, c.z, c.x, c.y + 1.05, c.z, a.x, a.y + 1.05, a.z], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, len / 0.44, 0, len / 0.44, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    b.add('balustrade', geo, null, 0xebe2cf);
    b.add('stone', G.box(1, 0.22, 0.38).translate(0.5, 0, 0), matSeg(a.clone().add(V3(0, 1.12, 0)), c.clone().add(V3(0, 1.12, 0))), TRIM);
    b.add('stone', G.box(1, 0.35, 0.5).translate(0.5, 0, 0), matSeg(a.clone().add(V3(0, -0.05, 0)), c.clone().add(V3(0, -0.05, 0))), TRIM);
  }
}

// ------------------------------------------------------------------ harbor viaduct (multi-tier white arcade)
function harborViaduct(ctx, b) {
  const th = CLK(8), s = SATS.harbor;
  const A = P(188.5, th, 16), Bp = P(s.d - s.R + 5, th, 16);
  const F = lineFrame(A, Bp); const L = A.distanceTo(Bp);
  const hw = 4.2;
  // deck
  b.add('paving', G.box(1, 0.8, 2 * hw).translate(0.5, -0.8, 0), matSeg(A.clone().setY(16), Bp.clone().setY(16)), 0xbfb39b);
  b.add('stone', G.box(1, 0.9, 2 * hw + 0.6).translate(0.5, -1.5, 0), matSeg(A.clone().setY(16), Bp.clone().setY(16)), TRIM);
  deckBalustrade(b, A, Bp, hw - 0.25);
  // tiers
  const t1 = arcadeRow(b, A, Bp, 30, 7, 7.6, () => 15.0, WHITE, { pierW: 1.6, cornice: true });
  const t2 = arcadeRow(b, A, Bp, 15, 13, 8.6, () => 15.0 - 7.0, WHITE, { pierW: 2.6, cornice: true });
  const t3 = arcadeRow(b, A, Bp, 7, 22, 9.6, () => 15.0 - 7.0 - 13.0, WHITE2, { pierW: 4.0, cornice: true });
  const ry = Math.atan2(F.X.x, F.X.z);
  for (let k = 1; k < 7; k++) {
    const p = F.at(k / 7, 0);
    pendant(b, p.x, 15 - 20 - 22, p.z, 6.0, 28 + (k % 2) * 8, ry, WHITE2);
  }
  // lamp posts + viewing balconies
  for (let k = 1; k < 15; k++) {
    const sd = k % 2 ? 1 : -1;
    const p = F.at(k / 15, 16, sd * (hw - 0.25));
    b.add('stone', G.box(0.7, 1.3, 0.7), mat(p.x, 16, p.z, ry), TRIM);
    lampPost(b, mat(p.x, 17.3, p.z), 3.6);
    if (k === 4 || k === 8 || k === 11) {
      const c = F.at(k / 15 + 0.033, 16, sd * (hw + 3.0));
      b.add('paving', G.cylC(3.4, 3.4, 0.6, 20), mat(c.x, 15.7, c.z), 0xddd2bc);
      b.add('stone', G.cyl(0.5, 3.3, 5, 12), mul(mat(c.x, 15.4, c.z), new THREE.Matrix4().makeRotationX(Math.PI)), WHITE2);
      for (let j = 0; j <= 12; j++) { const a = ry + (sd > 0 ? 0 : Math.PI) + Math.PI / 2 - j / 12 * Math.PI; b.add('stone', G.baluster(0.95, 0.11, 5), mat(c.x + Math.sin(a) * 3.15, 16, c.z + Math.cos(a) * 3.15), TRIM); }
      ctx.landmarks['viaductBalcony' + k] = c.clone().setY(17.5);
    }
  }
  ctx.collider.addBox((A.x + Bp.x) / 2, 0, (A.z + Bp.z) / 2, 5, 17, L / 2, -ry);
  ctx.landmarks.viaduct = F.at(0.5, 18, 0);
  ctx.viaduct = { A, B: Bp };
}

// ------------------------------------------------------------------ monastery single-span stone arch
function monasteryArch(ctx, b) {
  const th = CLK(10), s = SATS.monastery;
  const rock = ctx.mainRock;
  const ySpring = -50;
  const rMain = rock.radiusAt(th, ySpring) - 4;
  // monastery rock radius toward main island: approximate with its profile
  const rMon = s.d - s.R * 0.62 + 4;
  const deckA = P(184.6, th, 1.2), deckB = P(s.d - s.R + 4, th, s.y + 0.3);
  const F = lineFrame(deckA, deckB);
  const x0 = rMain - 184.6, x1 = rMon - 184.6; // along-line coordinates of springs (relative to deckA)
  const totalLen = deckA.clone().setY(0).distanceTo(deckB.clone().setY(0));
  const S = x1 - x0, xm = (x0 + x1) / 2;
  const deckY = (x) => deckA.y + (deckB.y - deckA.y) * (x / totalLen);
  const yCrown = deckY(xm) - 3.6;
  const f = yCrown - ySpring;
  const Ra = (S * S / 4 + f * f) / (2 * f);
  const cy = yCrown - Ra;
  const a0 = Math.asin(Math.min(1, (S / 2) / Ra));
  const N = 64, thick = 3.4, width = 5.2;
  const ptAt = (ang, rr) => { const x = xm + Math.sin(ang) * rr; const y = cy + Math.cos(ang) * rr; return F.at(x / totalLen, y, 0); };
  const rng = new RNG(51);
  for (let i = 0; i < N; i++) {
    const g0 = -a0 + (2 * a0) * i / N, g1 = -a0 + (2 * a0) * (i + 1) / N, gm = (g0 + g1) / 2;
    const p = ptAt(gm, Ra + thick / 2);
    const arcLen = (g1 - g0) * (Ra + thick / 2) - 0.08;
    // block oriented: local x along tangent, y radial
    const tangent = F.X.clone().multiplyScalar(Math.cos(gm)).add(V3(0, -Math.sin(gm), 0)).normalize();
    const radial = F.X.clone().multiplyScalar(Math.sin(gm)).add(V3(0, Math.cos(gm), 0)).normalize();
    const Z = new THREE.Vector3().crossVectors(tangent, radial).normalize();
    const m = matFrame(p, tangent, radial, Z);
    const tone = rng.pick([0xe6dcc6, 0xddd2bb, 0xe9e1cf, 0xd6cab2]);
    b.add('stone', G.boxC(arcLen, thick, width), m, tone);
    if (i % 2 === 0) b.add('stone', G.boxC(arcLen * 0.96, 0.6, width + 0.4), mul(m, mat(0, thick / 2 + 0.2, 0)), TRIM);
  }
  // open spandrel: columns from the extrados up to the deck, with small arches
  const nCol = 12;
  const colX = [];
  for (let k = 0; k <= nCol; k++) {
    const x = x0 + 6 + (S - 12) * k / nCol;
    const dx = x - xm; if (Math.abs(dx) > Ra) continue;
    const yExt = cy + Math.sqrt(Ra * Ra - dx * dx) + thick;
    const yd = deckY(x) - 1.2;
    if (yd - yExt < 1.0) continue;
    const p = F.at(x / totalLen, yExt - 0.5, 0);
    b.add('stone', G.box(1.6, yd - yExt + 0.5, width - 0.6), mat(p.x, yExt - 0.5, p.z, Math.atan2(F.X.x, F.X.z) + Math.PI / 2), 0xe3d9c3);
    colX.push(x);
  }
  for (let k = 0; k < colX.length - 1; k++) {
    const xa = colX[k], xb = colX[k + 1];
    const pa = F.at(xa / totalLen, 0, 0), pb = F.at(xb / totalLen, 0, 0);
    const chord = pa.distanceTo(pb); const w = chord - 1.6; const H = w / 2 + 1.3;
    const yTop = Math.min(deckY(xa), deckY(xb)) - 1.1;
    const blk = G.wallWithOpenings(chord + 0.1, H, width - 0.6, [{ x: 0, w, sh: 0.01, y0: -0.01, type: 'round' }], 10);
    b.add('stone', blk, mul(new THREE.Matrix4().makeTranslation(0, yTop - H, 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), 0xe6dcc6);
  }
  // deck with low parapets
  const da = deckA.clone(), db = deckB.clone();
  b.add('paving', G.box(1, 0.9, width).translate(0.5, -0.9, 0), matSeg(da, db), 0xd9ceb8);
  for (const sd of [-1, 1]) {
    const a = F.at(0, da.y, sd * (width / 2 - 0.25)), c = F.at(1, db.y, sd * (width / 2 - 0.25));
    b.add('stone', G.box(1, 0.85, 0.5).translate(0.5, 0, 0), matSeg(a, c), TRIM);
    b.add('stone', G.box(1, 0.16, 0.62).translate(0.5, 0.85, 0), matSeg(a, c), TRIM);
  }
  // postern gate in the city wall at the bridge end
  const pg = P(MAIN.wallR + MAIN.wallT / 2 + 0.05, th, 0);
  b.add('dark', G.box(3.6, 4.4, 0.3), mat(pg.x, 1.2, pg.z, outRot(th)));
  b.add('stone', G.archRing(3.6, 0.6, 0.8, 'round', 10, 0), mat(pg.x, 5.6, pg.z, outRot(th)), TRIM);
  ctx.collider.addBox((da.x + db.x) / 2, (da.y + db.y) / 2 - 2, (da.z + db.z) / 2, 3, 3, totalLen / 2, -Math.atan2(F.X.x, F.X.z));
  ctx.landmarks.monasteryArch = F.at(0.5, yCrown - 6, 0);
  ctx.landmarks.monasteryArchDeck = F.at(0.5, deckY(xm) + 1.5, 0);
}

// ------------------------------------------------------------------ aqueduct from the waterwheel tank to the cistern
function aqueduct(ctx, b) {
  const tank = ctx.wheelTank; const cis = ctx.cistern;
  const A = tank.c.clone(); const dirIn = V3(-A.x, 0, -A.z).normalize();
  A.addScaledVector(dirIn, tank.r + 1.5); A.y = tank.y - 0.4;
  const B = P(cis.r1 + 1.0, 0, cis.y + 4.2);
  const F = lineFrame(A, B); const L = A.clone().setY(0).distanceTo(B.clone().setY(0));
  const chY = (t) => A.y + (B.y - A.y) * t; // channel bottom height
  const nSp = Math.round(L / 12);
  const ry = Math.atan2(F.X.x, F.X.z);
  // channel trough
  const ca = A.clone(), cb = B.clone();
  b.add('stone', G.box(1, 0.7, 4.0).translate(0.5, -0.7, 0), matSeg(ca, cb), 0xe2d7c1);
  for (const sd of [-1, 1]) {
    b.add('stone', G.box(1, 1.7, 0.55).translate(0.5, -0.7, sd * 1.75), matSeg(ca, cb), 0xe6dcc6);
    b.add('stone', G.box(1, 0.18, 0.75).translate(0.5, 1.0, sd * 1.75), matSeg(ca, cb), TRIM);
  }
  ctx.aqueduct = { A: ca.clone(), B: cb.clone(), w: 2.9 };
  // arches and piers
  for (let k = 0; k < nSp; k++) {
    const t0 = k / nSp, t1 = (k + 1) / nSp;
    const pa = F.at(t0, 0), pb = F.at(t1, 0);
    const chord = pa.distanceTo(pb); const w = chord - 2.4; const H = w / 2 + 2.0;
    const yTop = Math.min(chY(t0), chY(t1)) - 0.7;
    const blk = G.wallWithOpenings(chord + 0.12, H, 3.6, [{ x: 0, w, sh: 0.6, y0: -0.01, type: 'round' }], 12);
    b.add('stone', blk, mul(new THREE.Matrix4().makeTranslation(0, yTop - H, 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), 0xe2d7c1);
  }
  for (let k = 0; k <= nSp; k++) {
    const t = k / nSp; const p = F.at(t, 0);
    const top = chY(t) - 0.7 - 7.5;
    const r = Math.hypot(p.x, p.z);
    let g = -1e4;
    if (r < MAIN.rimR - 2) g = mainGround(p.x, p.z);
    if (r < MAIN.wallR + MAIN.wallT / 2 + 1 && r > MAIN.wallR - MAIN.wallT / 2 - 1) g = MAIN.wallTop;
    const ws = SATS.wheel; if (Math.hypot(p.x - ws.pos.x, p.z - ws.pos.z) < ws.R - 3) g = ws.y;
    if (g > -1e3) {
      const h = top - g;
      if (h > 0.5) {
        b.add('stone', G.box(2.6, h, 3.6), mat(p.x, g, p.z, ry + Math.PI / 2), 0xe2d7c1);
        b.add('stone', G.box(3.4, 1.2, 4.4), mat(p.x, g, p.z, ry + Math.PI / 2), TRIM);
        // tie arches for tall piers (two-tier look)
        if (h > 26 && k < nSp) {
          const pb = F.at((k + 1) / nSp, 0);
          const mid = g + h * 0.45;
          const chord = p.distanceTo(pb); const w = chord - 2.6;
          const blk = G.wallWithOpenings(chord + 0.1, w / 2 + 2.0, 3.2, [{ x: 0, w, sh: 0.4, y0: -0.01, type: 'round' }], 12);
          b.add('stone', blk, mul(new THREE.Matrix4().makeTranslation(0, mid, 0), matSeg(p.clone().setY(0), pb.clone().setY(0)), new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), 0xe2d7c1);
        }
        ctx.collider.addBox(p.x, g + h / 2, p.z, 1.6, h / 2 + 8, 2.0, -ry);
      }
    } else {
      b.add('stone', G.box(2.6, 4, 3.6), mat(p.x, top - 4, p.z, ry + Math.PI / 2), 0xe2d7c1);
      pendant(b, p.x, top - 4, p.z, 3.4, 14 + (k % 3) * 5, ry, 0xd9cdb5);
    }
  }
  // inspection platforms
  for (const t of [0.22, 0.47, 0.71]) {
    const p = F.at(t, chY(t) - 0.6, 3.3);
    b.add('wood', G.box(2.6, 0.2, 2.6), mat(p.x, p.y, p.z, ry), 0x8a7058);
    for (let k = 0; k < 3; k++) b.add('wood', G.box(1, 0.16, 0.16).translate(0.5, 0, 0), matSeg(F.at(t + (k - 1) * 0.003, chY(t) - 0.6, 2.0), F.at(t + (k - 1) * 0.003, chY(t) - 3.4, 1.9)), 0x6e5844);
    for (const [dx, dz] of [[-1.2, 1.2], [1.2, 1.2], [-1.2, -0.0], [1.2, 0.0]]) { const q = F.at(t + dx / L, chY(t) - 0.6, 3.3 + dz); b.add('iron', G.box(0.07, 1.1, 0.07), mat(q.x, q.y, q.z), 0x2f2c2a); }
    const r0 = F.at(t - 1.2 / L, chY(t) + 0.45, 4.5), r1 = F.at(t + 1.2 / L, chY(t) + 0.45, 4.5);
    b.add('iron', G.box(1, 0.06, 0.06).translate(0.5, 0, 0), matSeg(r0, r1), 0x2f2c2a);
    ctx.landmarks['aqueductPlatform' + Math.round(t * 100)] = p.clone().add(V3(0, 1.5, 0));
  }
  ctx.landmarks.aqueduct = F.at(0.5, chY(0.5) + 2, 0);
}

// ------------------------------------------------------------------ suspension bridge to the clock tower
function suspension(ctx, b) {
  const th = CLK(2);
  const gm = mat(P(MAIN.wallR + 1, th, 0).x, 0, P(MAIN.wallR + 1, th, 0).z, outRot(th));
  const A = V3(0, 16, 7.6).applyMatrix4(gm); // deck start at the outer face of the main tower
  const Atop = V3(0, 41.5, 6.0).applyMatrix4(gm);
  const cg = ctx.clockGate;
  const B = cg.deck.clone().addScaledVector(V3(A.x - cg.deck.x, 0, A.z - cg.deck.z).normalize(), 5.2); B.y = 16.2;
  const Btop = cg.top.clone();
  const F = lineFrame(A, B); const L = A.clone().setY(0).distanceTo(B.clone().setY(0));
  const hw = 3.2, cableOff = 4.4;
  const deckY = (t) => A.y + (B.y - A.y) * t - Math.sin(Math.PI * t) * 1.6;
  const cableY = (t) => Atop.y + (Btop.y - Atop.y) * t - 4 * 21 * t * (1 - t) * 1.0;
  // cables
  for (const sd of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 40; k++) { const t = k / 40; pts.push(F.at(t, cableY(t), sd * cableOff)); }
    b.add('iron', G.tube(pts, 0.38, 6, 80), null, 0x3a3634);
    // backstay to the tower top saddles
    b.add('iron', G.box(1.6, 1.0, 1.6), mat(pts[0].x, pts[0].y - 0.5, pts[0].z), 0x3a3634);
    b.add('iron', G.box(1.6, 1.0, 1.6), mat(pts[40].x, pts[40].y - 0.5, pts[40].z), 0x3a3634);
  }
  // hangers + deck planks + beams
  const nH = Math.round(L / 4);
  for (let k = 1; k < nH; k++) {
    const t = k / nH;
    for (const sd of [-1, 1]) {
      const top = F.at(t, cableY(t), sd * cableOff), bot = F.at(t, deckY(t) + 0.1, sd * cableOff);
      b.add('iron', G.box(1, 0.09, 0.09).translate(0.5, 0, 0), matSeg(bot, top), 0x2f2c2a);
    }
    b.add('wood', G.box(0.3, 0.3, 2 * cableOff + 0.6), mat(F.at(t, 0).x, deckY(t) - 0.45, F.at(t, 0).z, Math.atan2(F.X.x, F.X.z) + Math.PI / 2), 0x5e4a38);
  }
  const nP = Math.round(L / 0.55);
  const ry = Math.atan2(F.X.x, F.X.z);
  for (let k = 0; k < nP; k++) {
    const t = (k + 0.5) / nP; const p = F.at(t, deckY(t));
    b.add('wood', G.box(2 * hw, 0.14, 0.5), mat(p.x, p.y - 0.14, p.z, ry), k % 4 === 0 ? 0x7a6450 : 0x8c7458);
  }
  for (const sd of [-1, 0, 1]) {
    const pts = []; for (let k = 0; k <= 30; k++) { const t = k / 30; pts.push(F.at(t, deckY(t) - 0.42, sd * (hw - 0.3))); }
    b.add('wood', G.tube(pts, 0.18, 4, 60), null, 0x5e4a38);
  }
  // side nets + hand ropes
  for (const sd of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    const n = 40;
    for (let k = 0; k <= n; k++) {
      const t = k / n; const p = F.at(t, deckY(t), sd * hw);
      pos.push(p.x, p.y, p.z, p.x, p.y + 1.35, p.z);
      uv.push(t * L / 0.7, 0, t * L / 0.7, 1.35 / 0.7);
      if (k < n) { const i = k * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    b.add('net', geo, null, 0xcdb894);
    const pts = []; for (let k = 0; k <= 30; k++) { const t = k / 30; pts.push(F.at(t, deckY(t) + 1.38, sd * hw)); }
    b.add('rope', G.tube(pts, 0.07, 4, 60), null, 0xb9a27c);
  }
  ctx.collider.addBox((A.x + B.x) / 2, 15, (A.z + B.z) / 2, 4, 2, L / 2, -ry);
  ctx.suspension = { A, B, F, deckY, L };
  ctx.landmarks.suspension = F.at(0.5, deckY(0.5) + 2, 0);
  ctx.landmarks.suspensionStart = F.at(0.04, deckY(0.04) + 2, 0);
}

// ------------------------------------------------------------------ old broken stone bridge to the ruins
function brokenBridge(ctx, b) {
  const th = CLK(4), s = SATS.ruins;
  const rock = ctx.mainRock;
  const y0 = -20;
  const A = P(rock.radiusAt(th, y0) + 1.0, th, y0), Bp = P(s.d - s.R + 4, th, s.y + 0.3);
  const F = lineFrame(A, Bp); const L = A.clone().setY(0).distanceTo(Bp.clone().setY(0));
  const ry = Math.atan2(F.X.x, F.X.z);
  const n = 6, gapK = 3; // collapsed span index
  const deckY = (t) => A.y + (Bp.y - A.y) * t;
  const rng = new RNG(808);
  const hw = 2.7;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    if (k === gapK) continue;
    const pa = F.at(t0, 0), pb = F.at(t1, 0);
    const chord = pa.distanceTo(pb); const w = chord - 3.6; const H = w / 2 + 3.0;
    const yTop = Math.min(deckY(t0), deckY(t1)) - 0.8;
    const blk = G.wallWithOpenings(chord + 0.1, H, 2 * hw, [{ x: 0, w, sh: 1.6, y0: -0.01, type: 'round' }], 12);
    b.add('stone', blk, mul(new THREE.Matrix4().makeTranslation(0, yTop - H, 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), OLD);
    const ring = G.archRing(w, 0.7, 0.35, 'round', 14, 0);
    for (const sd of [-1, 1]) b.add('stone', ring, mul(new THREE.Matrix4().makeTranslation(0, yTop - H + 1.6, 0), matSeg(pa, pb), new THREE.Matrix4().makeTranslation(0.5, 0, sd * (hw + 0.02)), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), OLD2);
    // deck + worn parapets with missing blocks
    b.add('paving', G.box(1, 0.8, 2 * hw).translate(0.5, -0.8, 0), matSeg(F.at(t0, deckY(t0)), F.at(t1, deckY(t1))), 0xc8bda5);
    for (const sd of [-1, 1]) {
      const nb = Math.round(chord / 1.2);
      for (let j = 0; j < nb; j++) {
        if (rng.chance(0.22)) continue;
        const t = t0 + (t1 - t0) * (j + 0.5) / nb; const p = F.at(t, deckY(t), sd * (hw - 0.25));
        const h = rng.chance(0.2) ? 0.4 + rng.next() * 0.4 : 0.9;
        b.add('stone', G.box(1.1, h, 0.45), mat(p.x, p.y, p.z, ry + Math.PI / 2 + rng.range(-0.06, 0.06)), rng.pick([OLD, OLD2, 0xbdb196]));
      }
    }
  }
  // piers with pendants
  for (let k = 0; k <= n; k++) {
    const p = F.at(k / n, 0); const top = deckY(k / n) - 0.8;
    const ht = (k === gapK || k === gapK + 1) ? 22 : 24;
    b.add('stone', G.box(3.6, ht, 2 * hw + 0.6), mat(p.x, top - ht, p.z, ry + Math.PI / 2), OLD2);
    pendant(b, p.x, top - ht, p.z, 4.4, 12 + (k % 2) * 6, ry, OLD2);
  }
  // jagged broken ends at the gap
  const tg0 = gapK / n, tg1 = (gapK + 1) / n;
  for (const [t, dir] of [[tg0, 1], [tg1, -1]]) {
    for (let j = 0; j < 7; j++) {
      const tt = t + dir * (0.002 + rng.next() * 0.012);
      const p = F.at(tt, deckY(tt) - 1.2 - rng.next() * 3, rng.range(-hw, hw));
      b.add('stone', G.box(1.0 + rng.next(), 0.8 + rng.next() * 1.2, 1.0 + rng.next()), mat(p.x, p.y, p.z, rng.next() * 3, 1, 1, 1, rng.range(-0.4, 0.4), rng.range(-0.4, 0.4)), OLD);
    }
  }
  // temporary plank walkway over the gap (sagging) with rope handrails
  const ga = F.at(tg0 - 0.004, deckY(tg0)), gb = F.at(tg1 + 0.004, deckY(tg1));
  const gl = ga.distanceTo(gb); const np = Math.round(gl / 0.5);
  const sagY = (u) => -Math.sin(Math.PI * u) * 2.2;
  for (let k = 0; k < np; k++) {
    const u = (k + 0.5) / np; const p = ga.clone().lerp(gb, u); p.y += sagY(u);
    b.add('wood', G.box(2.6, 0.12, 0.42), mat(p.x, p.y - 0.06, p.z, ry + rng.range(-0.04, 0.04)), rng.pick([0x8c7458, 0x7a6450, 0x9a8060]));
  }
  for (const sd of [-1, 1]) {
    for (const hy of [-0.1, 1.05]) {
      const pts = []; for (let k = 0; k <= 16; k++) { const u = k / 16; const p = ga.clone().lerp(gb, u).addScaledVector(F.Z, sd * 1.4); p.y += sagY(u) * (hy < 0 ? 1 : 0.7) + hy; pts.push(p); }
      b.add('rope', G.tube(pts, hy < 0 ? 0.08 : 0.06, 4, 32), null, 0xb9a27c);
    }
    for (const p of [ga, gb]) { const q = p.clone().addScaledVector(F.Z, sd * 1.6); b.add('wood', G.box(0.25, 1.5, 0.25), mat(q.x, q.y - 0.1, q.z), 0x6e5844); }
  }
  // broken stones hanging below the gap on chains / ropes
  for (let j = 0; j < 4; j++) {
    const t = j < 2 ? tg0 + 0.004 : tg1 - 0.004; const side = j % 2 ? 1.2 : -1.0;
    const top = F.at(t, deckY(t) - 1.6, side);
    const len = 6 + j * 2.5;
    const bot = top.clone().add(V3(0, -len, 0));
    b.add(j % 2 ? 'iron' : 'rope', G.cyl(0.07, 0.07, len, 4), mat(top.x, bot.y, top.z), j % 2 ? 0x3a3634 : 0xa8926c);
    b.add('stone', G.box(1.8 + rng.next(), 1.4 + rng.next(), 1.6), mat(bot.x, bot.y - 1.2, bot.z, rng.next() * 2, 1, 1, 1, 0.2, -0.15), OLD);
  }
  ctx.hangingStones = true;
  // rock-cut portal on the main island end
  const pm = mat(A.x, y0 - 0.8, A.z, outRot(th));
  b.add('dark', G.box(4.6, 6.0, 0.4), mul(pm, mat(0, 0, -1.2)));
  b.add('stone', G.archRing(4.6, 1.0, 1.4, 'round', 12, 0), mul(pm, mat(0, 6.0, -0.6)), OLD);
  for (const sd of [-1, 1]) b.add('stone', G.box(1.4, 6.0, 1.6), mul(pm, mat(sd * 3.0, 0, -0.6)), OLD);
  b.add('stone', G.box(8, 1.2, 2), mul(pm, mat(0, 8.8, -0.8)), OLD2);
  ctx.collider.addBox((A.x + Bp.x) / 2, (A.y + Bp.y) / 2 - 2, (A.z + Bp.z) / 2, 3, 3.5, L / 2, -ry);
  ctx.landmarks.brokenBridge = F.at((tg0 + tg1) / 2, deckY(0.5) + 1, 0);
  ctx.landmarks.brokenBridgeFrame = { F, A, B: Bp, tg0, tg1, deckY };
}

export function buildBridges(ctx) {
  const b = new Batch('bridges');
  harborViaduct(ctx, b);
  monasteryArch(ctx, b);
  aqueduct(ctx, b);
  suspension(ctx, b);
  brokenBridge(ctx, b);
  b.build(ctx.scene, ctx.M, { dark: { cast: false } });
}
