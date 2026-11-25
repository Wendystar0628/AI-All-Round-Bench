import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG, smoothstep } from '../core/noise.js';
import { SATS, dirOf } from './layout.js';
import { lampPost } from './buildings.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const RING_ORDER = ['harbor', 'monastery', 'wheel', 'clock', 'ruins', 'lighthouse'];
const STONE = 0xdcd1bb, TRIM = 0xe8dfcc;

let _ring = null;
// ring road geometry description (horizontal curve + height profile)
export function getRing() {
  if (_ring) return _ring;
  const pts = RING_ORDER.map((k) => { const s = SATS[k]; return s.pos.clone().addScaledVector(dirOf(s.th), s.R * 0.36).setY(0); });
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const L = curve.getLength();
  const N = 6000;
  const samples = [];
  for (let i = 0; i <= N; i++) samples.push(curve.getPointAt(i / N));
  // island crossings in arc length
  const isl = {};
  for (const k of RING_ORDER) {
    const s = SATS[k]; const c = new THREE.Vector2(s.pos.x, s.pos.z);
    // find closest sample index then walk out both ways until outside rim
    let best = 0, bd = 1e9;
    for (let i = 0; i <= N; i++) { const d = Math.hypot(samples[i].x - c.x, samples[i].z - c.y); if (d < bd) { bd = d; best = i; } }
    const rim = s.R - 3;
    let a = best, b = best;
    const dist = (i) => { const j = ((i % N) + N) % N; return Math.hypot(samples[j].x - c.x, samples[j].z - c.y); };
    while (dist(a - 1) < rim) a--;
    while (dist(b + 1) < rim) b++;
    isl[k] = { sIn: a / N * L, sOut: b / N * L, y: s.y + 0.3, sMid: best / N * L };
  }
  // segments between consecutive islands
  const segs = [];
  for (let i = 0; i < RING_ORDER.length; i++) {
    const A = isl[RING_ORDER[i]], B = isl[RING_ORDER[(i + 1) % RING_ORDER.length]];
    let s0 = A.sOut, s1 = B.sIn; if (s1 < s0) s1 += L;
    segs.push({ a: RING_ORDER[i], b: RING_ORDER[(i + 1) % RING_ORDER.length], s0, s1, y0: A.y, y1: B.y });
  }
  const wrap = (s) => ((s % L) + L) % L;
  function heightAt(s) {
    s = wrap(s);
    for (const k of RING_ORDER) { const I = isl[k]; if (s >= I.sIn && s <= I.sOut) return I.y; }
    for (const g of segs) {
      let ss = s; if (ss < g.s0) ss += L;
      if (ss >= g.s0 && ss <= g.s1) {
        const u = (ss - g.s0) / (g.s1 - g.s0);
        const f = 0.7 * u + 0.3 * smoothstep(0, 1, u);
        return g.y0 + (g.y1 - g.y0) * f;
      }
    }
    return 0;
  }
  const pointAt = (s) => { const p = curve.getPointAt(wrap(s) / L); p.y = heightAt(s); return p; };
  const tangentAt = (s) => curve.getTangentAt(wrap(s) / L).setY(0).normalize();
  _ring = { curve, L, isl, segs, heightAt, pointAt, tangentAt, wrap };
  return _ring;
}

export function buildRingRoad(ctx) {
  const { scene, M, collider } = ctx;
  const R = getRing();
  const b = new Batch('ring');
  const rng = new RNG(606);
  const W = 3.3; // half width
  const ruinsNear = (s) => {
    const I = R.isl.ruins; const d = Math.min(Math.abs(R.wrap(s - I.sIn + 30) - 30), Math.abs(R.wrap(s - I.sOut + 30) - 30));
    let dd = 1e9; for (const ss of [I.sIn, I.sOut]) { const x = Math.abs(R.wrap(s - ss + R.L / 2) - R.L / 2); dd = Math.min(dd, x); }
    return dd < 110;
  };
  const views = [];
  for (const g of R.segs) {
    const len = g.s1 - g.s0;
    // ---- deck ribbon & stairs ----
    const step = 2.0;
    const n = Math.ceil(len / step);
    const posL = [], posR = [];
    for (let i = 0; i <= n; i++) {
      const s = g.s0 + len * i / n;
      const p = R.pointAt(s); const t = R.tangentAt(s); const nn = V3(t.z, 0, -t.x);
      posL.push(p.clone().addScaledVector(nn, W)); posR.push(p.clone().addScaledVector(nn, -W));
    }
    for (let i = 0; i < n; i++) {
      const sA = g.s0 + len * i / n, sB = g.s0 + len * (i + 1) / n;
      const yA = R.heightAt(sA), yB = R.heightAt(sB);
      const slope = Math.abs(yB - yA) / (sB - sA);
      const pA = R.pointAt(sA), pB = R.pointAt(sB);
      if (slope > 0.11) {
        // steps
        const nr = Math.max(1, Math.round(Math.abs(yB - yA) / 0.17));
        for (let k = 0; k < nr; k++) {
          const u0 = k / nr, u1 = (k + 1) / nr;
          const a = pA.clone().lerp(pB, u0), c = pA.clone().lerp(pB, u1);
          const yTop = Math.max(yA + (yB - yA) * u0, yA + (yB - yA) * u1);
          const yy = yA + (yB - yA) * (yB > yA ? u1 : u0);
          a.y = c.y = 0;
          const m = matSeg(a, c);
          b.add('stone', G.box(1, 0.6, 2 * W).translate(0.5, -0.3, 0), mul(new THREE.Matrix4().makeTranslation(0, yy, 0), m), k % 2 ? 0xd9cfba : 0xd2c7b1);
        }
      } else {
        const q = [posL[i], posR[i], posR[i + 1], posL[i + 1]];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[3].toArray()], 3));
        geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
        if (geo.attributes.normal.getY(0) < 0) geo.setIndex([0, 2, 1, 0, 3, 2]);
        geo.computeVertexNormals();
        b.add('paving', geo, null, 0xc4b89f);
      }
      // fascia under the deck edges
      for (const side of [posL, posR]) {
        const a = side[i].clone(), c = side[i + 1].clone();
        b.add('stone', G.box(1, 1.3, 0.5).translate(0.5, -0.9, 0), matSeg(a, c), TRIM);
      }
      // balustrades (alpha-cut strip) + rail; damaged near the ruins
      const damaged = ruinsNear((sA + sB) / 2);
      for (const side of [posL, posR]) {
        if (damaged && rng.chance(0.28)) continue;
        const a = side[i], c = side[i + 1];
        const L0 = sA / 0.44, L1 = sB / 0.44;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y + 0.1, a.z, c.x, c.y + 0.1, c.z, c.x, c.y + 1.05, c.z, a.x, a.y + 1.05, a.z], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([L0, 0, L1, 0, L1, 1, L0, 1], 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
        b.add('balustrade', geo, null, 0xebe2cf);
        if (!(damaged && rng.chance(0.3))) b.add('stone', G.box(1, 0.2, 0.36).translate(0.5, 0, 0), matSeg(a.clone().add(V3(0, 1.1, 0)), c.clone().add(V3(0, 1.1, 0))), TRIM);
      }
      if (damaged && rng.chance(0.25)) {
        // loose / tilted paving stones
        const p = pA.clone().lerp(pB, rng.next()); const t = R.tangentAt(sA);
        b.add('stone', G.box(0.9, 0.25, 0.7), mul(mat(p.x + t.z * rng.range(-2, 2), p.y - 0.05, p.z - t.x * rng.range(-2, 2), rng.next() * 3), new THREE.Matrix4().makeRotationX(rng.range(-0.2, 0.2))), 0xcfc4ad);
      }
    }
    // ---- arcade spans, piers and pendants ----
    const nSp = Math.max(2, Math.round((len - 8) / 23));
    const spanS = (len - 8) / nSp;
    for (let k = 0; k <= nSp; k++) {
      const s = g.s0 + 4 + k * spanS;
      const p = R.pointAt(s); const t = R.tangentAt(s);
      const ry = Math.atan2(t.x, t.z);
      // pier
      const yTop = p.y - 0.4;
      b.add('stone', G.box(3.2, 14.5, 2 * W + 0.4), mat(p.x, yTop - 14.5, p.z, ry + Math.PI / 2), STONE);
      b.add('stone', G.box(3.8, 0.6, 2 * W + 1.0), mat(p.x, yTop - 14.6, p.z, ry + Math.PI / 2), TRIM);
      // hanging pendant (tapering to a point)
      const pend = G.rotY45(new THREE.ConeGeometry(2.7, 15 + (k % 3) * 3, 4, 1));
      pend.rotateX(Math.PI); pend.translate(0, -(15 + (k % 3) * 3) / 2, 0);
      b.add('stone', pend, mat(p.x, yTop - 15.2, p.z, ry), STONE);
      // posts and lamps on the deck
      for (const sd of [-1, 1]) {
        const pp = p.clone().add(V3(t.z * W * sd, 0, -t.x * W * sd));
        b.add('stone', G.box(0.62, 1.35, 0.62), mat(pp.x, p.y, pp.z, ry), TRIM);
        if ((k + (sd > 0 ? 0 : 1)) % 2 === 0) lampPost(b, mat(pp.x, p.y + 1.35, pp.z), 3.4);
      }
      collider.addBox(p.x, p.y - 8, p.z, 2, 8, W + 1, -ry);
    }
    for (let k = 0; k < nSp; k++) {
      const sA = g.s0 + 4 + k * spanS, sB = sA + spanS;
      const pA = R.pointAt(sA), pB = R.pointAt(sB);
      const yTop = Math.min(pA.y, pB.y) - 0.5;
      const a = pA.clone().setY(0), c = pB.clone().setY(0);
      const chord = a.distanceTo(c);
      const w = chord - 3.2;
      const H = w / 2 + 2.6;
      const blk = G.wallWithOpenings(chord + 0.2, H, 2 * W - 0.2, [{ x: 0, w, sh: 0.6, y0: -0.01, type: 'round' }], 14);
      const m = matSeg(a, c); // x along chord
      // wallWithOpenings is centered on x; shift by half
      b.add('stone', blk, mul(new THREE.Matrix4().makeTranslation(0, yTop - H, 0), m, new THREE.Matrix4().makeTranslation(0.5, 0, 0), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), STONE);
      // archivolt band on both faces
      const ring = G.archRing(w, 0.7, 0.4, 'round', 16, 0);
      for (const sd of [-1, 1]) b.add('stone', ring, mul(new THREE.Matrix4().makeTranslation(0, yTop - H + 0.6, 0), m, new THREE.Matrix4().makeTranslation(0.5, 0, sd * (W - 0.05)), new THREE.Matrix4().makeScale(1 / chord, 1, 1)), TRIM);
      // cornice under the deck
      b.add('stone', G.box(1, 0.45, 2 * W + 0.9).translate(0.5, 0, 0), mul(new THREE.Matrix4().makeTranslation(0, yTop - 0.95, 0), m), TRIM);
      // occasional viewing balcony
      if (k === Math.floor(nSp / 2) && len > 300) {
        const s = (sA + sB) / 2; const p = R.pointAt(s); const t = R.tangentAt(s);
        // outward side = away from main island center
        let sd = 1; const o = V3(t.z, 0, -t.x); if (o.dot(V3(p.x, 0, p.z)) < 0) sd = -1;
        const cpos = p.clone().addScaledVector(o, sd * (W + 3.0));
        b.add('paving', G.cylC(3.6, 3.6, 0.5, 20), mat(cpos.x, p.y - 0.25, cpos.z), 0xd6cbb4);
        b.add('stone', G.cyl(0.6, 3.4, 4.5, 12), mul(mat(cpos.x, p.y - 0.5, cpos.z), new THREE.Matrix4().makeRotationX(Math.PI)), STONE);
        for (let j = 0; j <= 14; j++) { const a2 = Math.atan2(o.x * sd, o.z * sd) - Math.PI / 2 + j / 14 * Math.PI; b.add('stone', G.baluster(0.95, 0.11, 5), mat(cpos.x + Math.sin(a2) * 3.3, p.y, cpos.z + Math.cos(a2) * 3.3), TRIM); }
        views.push(cpos.clone());
      }
    }
  }
  // ---- island crossings: paved road + gate pavilions ----
  for (const k of Object.keys(R.isl)) {
    const I = R.isl[k];
    const n = Math.ceil((I.sOut - I.sIn) / 2);
    for (let i = 0; i < n; i++) {
      const sA = I.sIn + (I.sOut - I.sIn) * i / n, sB = I.sIn + (I.sOut - I.sIn) * (i + 1) / n;
      const a = R.pointAt(sA), c = R.pointAt(sB);
      b.add('paving', G.box(1, 0.3, 2 * W - 0.6).translate(0.5, -0.2, 0), matSeg(a, c), 0xd3c8b0);
    }
    for (const [s, dir] of [[I.sIn + 2.5, 1], [I.sOut - 2.5, -1]]) gatePavilion(b, R, s, ctx);
  }
  ctx.ring = R;
  ctx.ringViews = views;
  b.build(scene, M, { balustrade: { cast: true } });
}

// small gate pavilion (arch + small dome) straddling the road
function gatePavilion(b, R, s, ctx) {
  const p = R.pointAt(s); const t = R.tangentAt(s);
  const ry = Math.atan2(t.x, t.z);
  const M4 = mat(p.x, p.y - 0.3, p.z, ry);
  const w = 9.4, d = 7, h = 7.6;
  // four piers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wp = V3(sx * (w / 2 - 0.9), 0, sz * (d / 2 - 0.9)).applyMatrix4(M4);
    ctx.collider.addBox(wp.x, p.y + 4, wp.z, 1.0, 4.5, 1.0, -ry);
  }
  const front = G.wallWithOpenings(w, h, 1.4, [{ x: 0, w: 4.6, sh: 3.6, y0: 0, type: 'round' }], 12);
  b.add('stone', front, mul(M4, mat(0, 0, d / 2 - 0.7)), STONE);
  b.add('stone', front, mul(M4, mat(0, 0, -d / 2 + 0.7)), STONE);
  const side = G.wallWithOpenings(d - 2.8, h, 1.4, [{ x: 0, w: 2.2, sh: 2.4, y0: 0, type: 'round' }], 10);
  b.add('stone', side, mul(M4, mat(w / 2 - 0.7, 0, 0, Math.PI / 2)), STONE);
  b.add('stone', side, mul(M4, mat(-w / 2 + 0.7, 0, 0, Math.PI / 2)), STONE);
  b.add('stone', G.archRing(4.6, 0.45, 1.6, 'round', 12, 0), mul(M4, mat(0, 3.6, d / 2 - 0.6)), TRIM);
  b.add('stone', G.archRing(4.6, 0.45, 1.6, 'round', 12, 0), mul(M4, mat(0, 3.6, -d / 2 + 0.6)), TRIM);
  b.add('stone', G.box(w + 0.8, 0.7, d + 0.8), mul(M4, mat(0, h, 0)), TRIM);
  b.add('stone', G.cyl(3.0, 3.2, 1.6, 20), mul(M4, mat(0, h + 0.7, 0)), STONE);
  b.add('copper', G.lathe(G.domeProfile(3.3, 3.4, 10, 'round'), 24), mul(M4, mat(0, h + 2.3, 0)), 0x5f9f8d);
  b.add('gold', G.cyl(0.12, 0.2, 1.4, 6), mul(M4, mat(0, h + 5.6, 0)), 0xe8bd62);
  b.add('gold', new THREE.SphereGeometry(0.35, 8, 6), mul(M4, mat(0, h + 7.2, 0)), 0xe8bd62);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('gold', new THREE.SphereGeometry(0.3, 8, 6), mul(M4, mat(sx * (w / 2), h + 1.0, sz * (d / 2))), 0xe8bd62);
}
