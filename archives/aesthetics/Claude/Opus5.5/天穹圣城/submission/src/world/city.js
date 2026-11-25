import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { MAIN, CLK, P, angDist, outRot, dirOf } from './layout.js';
import { house, windowOn, doorOn, signOn, stall, lampPost, fountain, arcade, PLASTERS, ROOF_RED, ROOF_GREEN, TRIM, BASE } from './buildings.js';
import { cypress, oliveTree, bigTree, shrub, flowerBush, vineStrip } from './vegetation.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const RW = 0xd9cdb3, RW2 = 0xcabda3; // retaining wall colours

export const CANAL = {
  // canal route polyline: [r, theta, y]
  t3: [[86, CLK(1.25)], [86, CLK(1.7)], [88, CLK(2.3)], [90, CLK(2.95)]],
  t2: [[107.5, CLK(3.05)], [107.5, CLK(3.5)], [107.5, CLK(3.95)]],
  t2Drop: CLK(3.98),
  t1: [[140.5, CLK(4.02)], [140.5, CLK(4.42)]],
  t1Out: CLK(4.45),
};
export const CASCADE_TH = CLK(9.15);
export const MARKET = { th0: CLK(4.62), th1: CLK(5.38), r0: 140, r1: 169 };
export const ACADEMY = { th0: CLK(7.05), th1: CLK(8.45) };
export const BELLTOWER_TH = CLK(8.78);

export function buildCity(ctx) {
  const { scene, M, collider } = ctx;
  const b = new Batch('city');
  const veg = new Batch('cityVeg');
  const rng = new RNG(303);
  const T1 = MAIN.T1, T2 = MAIN.T2, T3 = MAIN.T3, PL = MAIN.plat;
  ctx.smoke = ctx.smoke || [];

  // ------------------------------------------------ terraces ------------------------------------------------
  const ring = (r0, r1, y, col, key = 'paving') => { const g = new THREE.RingGeometry(r0, r1, 180, 2); g.rotateX(-Math.PI / 2); b.add(key, g, mat(0, y, 0), col); };
  ring(T1.r0 - 0.5, MAIN.wallR - MAIN.wallT / 2 + 0.3, T1.y, 0xd2c6ae);
  ring(T2.r0 - 0.5, T2.r1, T2.y, 0xd6cab3);
  ring(T3.r0 - 0.5, T3.r1, T3.y, 0xd9ceb8);
  // retaining walls (open cylinders) with coping, plinth and buttresses
  const retWall = (r, y0, y1, buttressEvery = 0) => {
    const h = y1 - y0;
    b.add('stone', G.cyl(r, r, h, 200, true, 2), mat(0, y0, 0), RW);
    b.add('stone', G.cyl(r + 0.6, r + 0.6, 0.6, 200, true), mat(0, y1 - 0.6, 0), TRIM);
    b.add('stone', G.cyl(r + 0.5, r + 0.5, 0.9, 200, true), mat(0, y0, 0), RW2);
    // string course halfway
    if (h > 12) b.add('stone', G.cyl(r + 0.3, r + 0.3, 0.45, 200, true), mat(0, y0 + h * 0.55, 0), TRIM);
    if (buttressEvery) {
      const n = Math.round(2 * Math.PI * r / buttressEvery);
      for (let i = 0; i < n; i++) {
        const th = (i + 0.5) / n * Math.PI * 2;
        if (angDist(th, Math.PI) < 0.2) continue;
        const p = P(r + 0.9, th, 0);
        b.add('stone', G.box(2.2, h - 2.5, 1.8), mat(p.x, y0, p.z, outRot(th)), RW2);
        b.add('stone', G.box(2.2, 1.0, 1.0).translate(0, 0, -0.4), mat(p.x, y1 - 2.6, p.z, outRot(th)), TRIM);
      }
    }
    // parapet on top
    b.add('stone', G.cyl(r - 0.3, r - 0.3, 1.05, 200, true), mat(0, y1, 0), TRIM);
    b.add('stone', G.cyl(r - 0.7, r - 0.7, 1.05, 200, true), mat(0, y1, 0), TRIM);
    { const cap = new THREE.RingGeometry(r - 0.8, r - 0.2, 200, 1); cap.rotateX(-Math.PI / 2); b.add('stone', cap, mat(0, y1 + 1.05, 0), TRIM); }
    collider.addGround(() => y1, 0, 0, r + 0.5);
  };
  retWall(T1.r0, T1.y, T2.y, 0);
  retWall(T2.r0, T2.y, T3.y, 0);
  retWall(PL.r, T3.y, PL.y, 11);

  // ------------------------------------------------ reserved zones ------------------------------------------------
  const frontBand = (th, r) => angDist(th, Math.PI) < Math.PI / 2 && r * Math.sin(angDist(th, Math.PI)) < 15.5;
  const reserved = (th, r, terr) => {
    if (frontBand(th, r)) return true;
    if (angDist(th, 0) < 0.06) return true;                      // aqueduct
    if (angDist(th, CASCADE_TH) < 0.075) return true;            // terrace cascades
    if (terr === 'T1') {
      if (angDist(th, Math.PI) < 0.17) return true;              // gate plaza
      if (th > MARKET.th0 - 0.01 && th < MARKET.th1 + 0.01) return true;
      if (angDist(th, CANAL.t1Out) < 0.045 && r > 146) return true;
      if (angDist(th, CLK(10)) < 0.035) return true;             // monastery postern street
      if (angDist(th, CLK(8)) < 0.04 || angDist(th, CLK(2)) < 0.04) return true;
      if (angDist(th, CLK(4)) < 0.035) return true;              // old stair down to the ruins bridge
    }
    if (terr === 'T2') {
      if (angDist(th, CANAL.t2Drop) < 0.04) return true;
    }
    if (terr === 'T3') {
      if (th > ACADEMY.th0 - 0.02 && th < ACADEMY.th1 + 0.02) return true;
      if (angDist(th, BELLTOWER_TH) < 0.1) return true;
      if (th > CLK(1.15) && th < CLK(3.0)) return true;          // canal garden
    }
    return false;
  };

  // ------------------------------------------------ houses ------------------------------------------------
  const special = [
    { th: CLK(3.45), row: 'A', kind: 'smith' },
    { th: CLK(6.62), row: 'B', kind: 'bakery' },
    { th: CLK(5.62), row: 'B', kind: 'workshop' },
    { th: CLK(2.65), row: 'B', kind: 'workshop' },
  ];
  const placed = [];
  const placeRow = (rowName, rFront, facing, y, terr, dMin, dMax, floorsW, streetEvery) => {
    let th = rng.next() * 0.02; let count = 0;
    while (th < Math.PI * 2 - 0.01) {
      const w = rng.range(7.2, 12.5);
      const dth = w / rFront;
      const mid = th + dth / 2;
      const d = rng.range(dMin, dMax);
      const rMid = facing === 'out' ? rFront - d / 2 : rFront + d / 2;
      if (reserved(th, rMid, terr) || reserved(th + dth, rMid, terr) || reserved(mid, rMid, terr)) { th += 0.6 / rFront; continue; }
      const sp = special.find((s) => s.row === rowName && angDist(s.th, mid) < dth * 0.6 && !s.done);
      const floors = sp ? 2 : (rng.next() < floorsW ? 3 : 2);
      const ry = facing === 'out' ? outRot(mid) : outRot(mid) + Math.PI;
      const o = P(rFront, mid, y);
      const M4 = mat(o.x, y, o.z, ry);
      const opts = {};
      if (sp) { sp.done = true; opts.bigDoor = true; if (sp.kind === 'smith') opts.smoke = ctx.smoke; opts.roofRed = true; }
      const info = house(b, M4, w, d, floors, rng, opts);
      if (sp) {
        if (sp.kind === 'smith') {
          signOn(b, M4, w / 2 - 0.8, 3.6, 0x5a3e2a, 0x9a9a9a);
          b.add('iron', G.box(0.9, 0.5, 0.45), mul(M4, mat(-1.8, 0.75, 1.6)), 0x3a3836); // anvil
          b.add('stone', G.box(0.7, 0.75, 0.5), mul(M4, mat(-1.8, 0, 1.6)), 0x8a8070);
          b.add('wood', G.cyl(0.45, 0.45, 0.9, 10), mul(M4, mat(1.9, 0, 1.5)), 0x6e5440); // quench barrel
          b.add('glow', G.box(1.6, 1.0, 0.12), mul(M4, mat(-2.6, 0.8, 0.02))); // forge glow through the door
          for (let k = 0; k < 4; k++) b.add('wood', G.box(0.12, 1.6, 0.12), mul(M4, mat(2.6 + k * 0.25, 0, 1.0, 0, 1, 1, 1, 0.15)), 0x7a5c40);
        } else if (sp.kind === 'bakery') {
          signOn(b, M4, w / 2 - 0.8, 3.6, 0x8a5a2c, 0xe8bd62);
          for (let k = 0; k < 4; k++) {
            b.add('wood', G.cyl(0.42, 0.32, 0.36, 12), mul(M4, mat(-2.2 + k * 1.1, 0, 1.4)), 0xa98a5a);
            for (let j = 0; j < 4; j++) b.add('plain', new THREE.SphereGeometry(0.2, 8, 6).scale(1.4, 0.7, 0.9), mul(M4, mat(-2.2 + k * 1.1 + (j - 1.5) * 0.15, 0.4, 1.4 + (j % 2) * 0.12)), 0xc98d48);
          }
          b.add('wood', G.box(2.4, 0.9, 0.8), mul(M4, mat(2.0, 0, 1.2)), 0x8a6a4c);
          b.add('glowSoft', G.box(1.2, 1.4, 0.1), mul(M4, mat(-0.9, 0.2, 0.01)));
        } else {
          signOn(b, M4, -w / 2 + 0.8, 3.6, rng.pick([0x3f5f7f, 0x6e3f3f, 0x4f6f3f]), 0xe8bd62);
          for (let k = 0; k < 3; k++) b.add('wood', G.box(0.8, 0.8, 0.8), mul(M4, mat(-2.5 + k * 0.4, k === 2 ? 0.8 : 0, 1.6, k * 0.3)), 0x9a7a54);
        }
      }
      // collision box (approx)
      const c = P(facing === 'out' ? rFront - d / 2 : rFront + d / 2, mid, 0);
      collider.addBox(c.x, y + (info.H + info.rh) / 2, c.z, w / 2, (info.H + info.rh) / 2 + 0.5, d / 2, -ry);
      placed.push({ th: mid, r: rMid, terr });
      count++;
      th += dth + rng.range(0.15, 0.6) / rFront;
      if (count % streetEvery === 0) th += rng.range(5.0, 7.0) / rFront;
    }
  };
  placeRow('A', 168.0, 'out', T1.y, 'T1', 9, 11, 0.45, 5);
  placeRow('B', 146.0, 'in', T1.y, 'T1', 8.5, 10.5, 0.4, 5);
  placeRow('C', 110.5, 'in', T2.y, 'T2', 8.0, 10.0, 0.5, 4);
  placeRow('D', 131.0, 'out', T2.y, 'T2', 8.0, 9.5, 0.45, 4);

  // T3 civic halls (larger, 3 floors, hipped roofs, arched windows)
  {
    let th = 0.05;
    while (th < Math.PI * 2) {
      const w = rng.range(13, 18), d = rng.range(12, 15);
      const rf = 100.0, dth = w / rf, mid = th + dth / 2;
      if (reserved(th, rf - d / 2, 'T3') || reserved(th + dth, rf - d / 2, 'T3')) { th += 0.02; continue; }
      const o = P(rf, mid, T3.y); const ry = outRot(mid);
      const M4 = mat(o.x, T3.y, o.z, ry);
      const info = house(b, M4, w, d, 3, rng, { hip: true, roofRed: rng.chance(0.4), balcony: true });
      // pilasters on civic facades
      for (let k = 0; k <= 4; k++) b.add('stone', G.box(0.5, info.H - 1, 0.3), mul(M4, mat(-w / 2 + k * w / 4, 0.6, 0.1)), TRIM);
      const c = P(rf - d / 2, mid, 0); collider.addBox(c.x, T3.y + (info.H + info.rh) / 2, c.z, w / 2, (info.H + info.rh) / 2, d / 2, -ry);
      th += dth + rng.range(6, 10) / rf;
    }
  }

  // ------------------------------------------------ inter-terrace stairs (tangential along retaining walls) ------------------------------------------------
  const tStairs = [
    [T1.r0 + 2.2, T1.y, T2.y, [CLK(0.55), CLK(2.2), CLK(3.2), CLK(5.75), CLK(7.55), CLK(9.9), CLK(11.2)]],
    [T2.r0 + 2.2, T2.y, T3.y, [CLK(0.7), CLK(3.3), CLK(5.6), CLK(6.6), CLK(9.8), CLK(11.0)]],
  ];
  for (const [rr, y0, y1, list] of tStairs) {
    list.forEach((th0, idx) => {
      const dir = idx % 2 ? 1 : -1; const n = 30; const run = 15;
      for (let k = 0; k < n; k++) {
        const a = th0 + dir * (run / rr) * (k + 0.5) / n;
        const y = y0 + (y1 - y0) * (k + 1) / n;
        const p = P(rr, a, 0);
        b.add('stone', G.box(run / n + 0.06, y - y0, 3.0), mat(p.x, y0, p.z, outRot(a)), 0xd0c4ab);
        if (k % 3 === 0) { const pp = P(rr + 1.6, a, 0); b.add('stone', G.box(run / n * 3.1, 0.9, 0.35), mat(pp.x, y, pp.z, outRot(a)), TRIM); }
      }
    });
  }
  // stair down through T1 to the old rock gate (ruins bridge)
  {
    const th = CLK(4);
    for (let k = 0; k < 18; k++) { const p = P(176 - k * 0.0, th - 0.012 + k * 0.0014, 0); }
  }

  // ------------------------------------------------ market square ------------------------------------------------
  {
    const thm = (MARKET.th0 + MARKET.th1) / 2, rm = 155;
    const c = P(rm, thm, T1.y);
    const ry = outRot(thm);
    const Mc = mat(c.x, T1.y, c.z, ry);
    // decorative paving disk + fountain
    b.add('paving', G.cylC(13, 13, 0.12, 48), mul(Mc, mat(0, 0.06, 0)), 0xcbb894);
    b.add('stone', G.torus(13, 0.25, 4, 48).rotateX(Math.PI / 2), mul(Mc, mat(0, 0.12, 0)), TRIM);
    fountain(b, Mc, 4.2);
    ctx.landmarks.fountain = c.clone().add(V3(0, 2, 0));
    ctx.fountainPos = c.clone();
    collider.addCyl(c.x, c.z, 5, T1.y, T1.y + 5);
    const cols = [0xc0392b, 0x2e6da4, 0xd4a020, 0x27855a, 0x8e44ad, 0xd35400, 0x1f7a8c, 0xb03a5b];
    let k = 0;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.sin(a)) > 0.95) continue;
      const sx = Math.cos(a) * 17.5, sz = Math.sin(a) * 10.5;
      const Ms = mul(Mc, mat(sx, 0, sz, Math.atan2(-sx, -sz)));
      stall(b, Ms, rng, cols[k++ % cols.length]);
      const wp = new THREE.Vector3(sx, 0, sz).applyMatrix4(Mc); collider.addBox(wp.x, T1.y + 1.5, wp.z, 2.2, 1.6, 2.2, 0);
    }
    // olive trees and benches around the square
    for (const [sx, sz] of [[-22, -7], [22, 7], [-21, 9], [23, -9]]) {
      const wp = new THREE.Vector3(sx, 0, sz).applyMatrix4(Mc);
      oliveTree(veg, wp.x, T1.y, wp.z, 0.9 + rng.next() * 0.3, rng);
      b.add('stone', G.cyl(1.6, 1.7, 0.6, 16), mat(wp.x, T1.y, wp.z), BASE);
    }
    for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; b.add('stone', G.box(2.4, 0.45, 0.62), mul(Mc, mat(Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6, Math.atan2(-Math.cos(a), -Math.sin(a)))), TRIM); }
    // crates & barrels
    for (let i = 0; i < 8; i++) { const bp = new THREE.Vector3(rng.range(-24, 24), 0, rng.range(-12, 12)).applyMatrix4(Mc); if (bp.distanceTo(c) < 9) continue; b.add('wood', rng.chance(0.5) ? G.box(0.9, 0.9, 0.9) : G.cyl(0.45, 0.45, 1.0, 10), mat(bp.x, T1.y, bp.z, rng.next() * 3), 0x8a6a4c); }
    ctx.landmarks.market = c.clone();
    ctx.landmarks.marketFrame = Mc;
  }

  // ------------------------------------------------ academy (cloister) ------------------------------------------------
  {
    const thc = (ACADEMY.th0 + ACADEMY.th1) / 2, rc = 88;
    const c = P(rc, thc, T3.y); const ry = outRot(thc);
    const Mc = mat(c.x, T3.y, c.z, ry);
    const W = 50, D = 28; // tangential (x), radial (z)
    const cw = 30, cd = 13; // courtyard
    // outer ranges (2 floors) around the courtyard
    const ranges = [
      [0, D / 2 - 3.5, W, 7, 0], [0, -D / 2 + 3.5, W, 7, Math.PI],
      [W / 2 - 4.5, 0, D - 14, 9, Math.PI / 2], [-W / 2 + 4.5, 0, D - 14, 9, -Math.PI / 2],
    ];
    for (const [x, z, L, dd, r] of ranges) {
      const Mr = mul(Mc, mat(x, 0, z, r));
      b.add('plaster', G.box(L, 8.6, dd), Mr, 0xf0e6d2);
      b.add('stone', G.box(L + 0.2, 0.9, dd + 0.2), mul(Mr, mat(0, -0.3, 0)), BASE);
      b.add('stone', G.box(L + 0.4, 0.35, dd + 0.4), mul(Mr, mat(0, 8.3, 0)), TRIM);
      b.add('roof', G.hipRoof(L, dd, 3.4, 0.5), mul(Mr, mat(0, 8.6, 0)), 0xb5603b);
      const Mf = mul(Mr, mat(0, 0, dd / 2));
      const n = Math.floor(L / 3.4);
      for (let i = 0; i < n; i++) { const xx = -L / 2 + (i + 0.5) * L / n; windowOn(b, Mf, xx, 1.3, 1.1, 1.9, rng, { arched: true }); windowOn(b, Mf, xx, 5.2, 1.0, 1.8, rng, { arched: true }); }
    }
    // cloister arcades facing the courtyard
    arcade(b, mul(Mc, mat(0, 0, cd / 2 - 0.2, Math.PI)), cw, 4.6, 3.4, 3.0);
    arcade(b, mul(Mc, mat(0, 0, -cd / 2 + 0.2, 0)), cw, 4.6, 3.4, 3.0);
    arcade(b, mul(Mc, mat(cw / 2 - 0.2, 0, 0, -Math.PI / 2)), cd - 1, 4.6, 3.4, 3.0);
    arcade(b, mul(Mc, mat(-cw / 2 + 0.2, 0, 0, Math.PI / 2)), cd - 1, 4.6, 3.4, 3.0);
    // courtyard lawn, paths, sundial, big tree
    b.add('grass', G.box(cw - 7.2, 0.2, cd - 7.0), mul(Mc, mat(0, 0, 0)), 0x6f9440);
    b.add('paving', G.box(cw - 7.2, 0.24, 1.4), mul(Mc, mat(0, 0, 0)), 0xd9cfbc);
    b.add('paving', G.box(1.4, 0.24, cd - 7.0), mul(Mc, mat(0, 0, 0)), 0xd9cfbc);
    b.add('stone', G.cyl(0.9, 1.1, 0.5, 16), mul(Mc, mat(-6, 0.2, 0)), BASE);
    b.add('stone', G.cyl(0.35, 0.45, 1.0, 12), mul(Mc, mat(-6, 0.7, 0)), TRIM);
    b.add('bronze', G.cylC(0.75, 0.75, 0.06, 24), mul(Mc, mat(-6, 1.75, 0)), 0xb27a3c);
    b.add('bronze', G.box(0.05, 0.6, 0.55).translate(0, 0.3, 0), mul(Mc, mat(-6, 1.78, 0, 0.5)), 0xb27a3c);
    bigTree(veg, new THREE.Vector3(6, 0, 0).applyMatrix4(Mc).x, T3.y + 0.1, new THREE.Vector3(6, 0, 0).applyMatrix4(Mc).z, 0.85, rng);
    for (const [sx, sz] of [[-11, 3], [-11, -3], [11, 3], [11, -3]]) { const p = new THREE.Vector3(sx, 0, sz).applyMatrix4(Mc); shrub(veg, p.x, T3.y + 0.2, p.z, 0.9, rng); }
    // entrance portal with a small cupola on the outer range
    const Mp = mul(Mc, mat(0, 0, D / 2));
    b.add('stone', G.box(7, 11, 1.4), Mp, TRIM);
    b.add('dark', G.box(3, 5, 0.3), mul(Mp, mat(0, 0, 0.6)));
    b.add('stone', G.archRing(3, 0.6, 1.5, 'round', 12, 0), mul(Mp, mat(0, 5, 0.1)), TRIM);
    b.add('stone', G.cyl(3.2, 3.2, 3.5, 20), mul(Mc, mat(0, 11.8, D / 2 - 3.5)), 0xf0e6d2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; windowOn(b, mul(Mc, mat(Math.sin(a) * 3.2, 11.8, D / 2 - 3.5 + Math.cos(a) * 3.2, a)), 0, 0.8, 0.7, 1.6, rng, { arched: true, frame: false }); }
    b.add('copper', G.lathe(G.domeProfile(3.6, 3.6, 10, 'round'), 24), mul(Mc, mat(0, 15.3, D / 2 - 3.5)), 0x5f9f8d);
    b.add('gold', new THREE.SphereGeometry(0.4, 10, 8), mul(Mc, mat(0, 19.1, D / 2 - 3.5)), 0xe8bd62);
    const cpos = P(rc, thc, 0); collider.addBox(cpos.x, T3.y + 7, cpos.z, W / 2, 7, D / 2, -ry);
    ctx.landmarks.academy = c.clone().add(V3(0, 3, 0));
    ctx.landmarks.academyFrame = Mc;
  }

  // ------------------------------------------------ bell tower (highest point of the lower city) ------------------------------------------------
  {
    const c = P(90, BELLTOWER_TH, T3.y); const ry = outRot(BELLTOWER_TH);
    const Mt = mat(c.x, T3.y, c.z, ry);
    const s = 9;
    b.add('stone', G.box(s + 1.2, 2, s + 1.2), Mt, BASE);
    b.add('stone', G.box(s, 38, s), Mt, 0xe8dfcb);
    for (const yy of [12, 24, 37]) b.add('stone', G.box(s + 0.8, 0.6, s + 0.8), mul(Mt, mat(0, yy, 0)), TRIM);
    // corner pilasters
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('stone', G.box(1.0, 37, 1.0), mul(Mt, mat(sx * (s / 2 - 0.2), 0, sz * (s / 2 - 0.2))), TRIM);
    for (let f = 0; f < 4; f++) {
      const Mf = mul(Mt, mat(0, 0, 0, f * Math.PI / 2), mat(0, 0, s / 2));
      windowOn(b, Mf, 0, 14, 1.1, 2.6, rng, { arched: true });
      windowOn(b, Mf, 0, 26, 1.1, 2.6, rng, { arched: true });
      // clock face
      const face = new THREE.CylinderGeometry(2.6, 2.6, 0.3, 32); face.rotateX(Math.PI / 2);
      b.add('stone', face, mul(Mf, mat(0, 33.2, 0.15)), 0xf6f0e2);
      b.add('gold', G.torus(2.6, 0.18, 6, 32), mul(Mf, mat(0, 33.2, 0.32)), 0xe8bd62);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.add('iron', G.box(0.14, 0.5, 0.06), mul(Mf, mat(Math.sin(a) * 2.15, 33.2 - 0.25 + Math.cos(a) * 2.15, 0.33), new THREE.Matrix4().makeRotationZ(-a)), 0x2a2622); }
      ctx.clockHands = ctx.clockHands || [];
      ctx.clockHands.push({ frame: mul(Mf, mat(0, 33.2, 0.42)), r: 2.6 });
    }
    // belfry: open arches with bell inside
    const by = 38;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('stone', G.box(1.6, 9, 1.6), mul(Mt, mat(sx * (s / 2 - 0.8), by, sz * (s / 2 - 0.8))), 0xe8dfcb);
    for (let f = 0; f < 4; f++) {
      const Mf = mul(Mt, mat(0, 0, 0, f * Math.PI / 2), mat(0, 0, s / 2 - 0.4));
      b.add('stone', G.archSpan(s - 3.2, 9, 0.8, s - 4.6, 5.4, 'round', 14), mul(Mf, mat(0, by, 0)), TRIM);
      for (let k = 0; k < 7; k++) b.add('stone', G.baluster(1.0, 0.11, 6), mul(Mf, mat(-2.2 + k * 0.73, by, 0.2)), TRIM);
    }
    b.add('stone', G.box(s + 1.0, 0.8, s + 1.0), mul(Mt, mat(0, by + 9, 0)), TRIM);
    b.add('wood', G.box(s - 2, 0.5, 0.6), mul(Mt, mat(0, by + 7.0, 0)), 0x6e5440);
    const bell = G.lathe([[0.001, 0], [1.7, 0.02], [1.65, 0.3], [1.2, 1.0], [1.05, 2.0], [0.9, 2.5], [0.4, 2.75], [0.001, 2.8]], 20, false);
    b.add('bronze', bell, mul(Mt, mat(0, by + 4.1, 0)), 0xb8823e);
    // octagonal lantern + spire
    b.add('stone', G.cyl(3.4, 3.8, 5, 8), mul(Mt, mat(0, by + 9.8, 0)), 0xe8dfcb);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; b.add('dark', G.box(1.0, 2.6, 0.2), mul(Mt, mat(Math.sin(a) * 3.45, by + 11, Math.cos(a) * 3.45, a))); }
    b.add('copper', G.cone(4.0, 14, 8), mul(Mt, mat(0, by + 14.8, 0, Math.PI / 8)), 0x5f9f8d);
    b.add('gold', new THREE.SphereGeometry(0.55, 10, 8), mul(Mt, mat(0, by + 29.2, 0)), 0xe8bd62);
    b.add('gold', G.cyl(0.08, 0.08, 3, 5), mul(Mt, mat(0, by + 29.4, 0)), 0xe8bd62);
    b.add('gold', G.box(1.6, 0.08, 0.08), mul(Mt, mat(0, by + 31.4, 0)), 0xe8bd62);
    const tp = P(90, BELLTOWER_TH, 0); collider.addBox(tp.x, T3.y + 32, tp.z, s / 2 + 1, 33, s / 2 + 1, -ry);
    ctx.landmarks.bellTower = c.clone().add(V3(0, 40, 0));
    ctx.landmarks.bellTowerTop = c.clone().add(V3(0, 48, 0));
  }

  // ------------------------------------------------ gardens: cypress rows, olive trees, hanging gardens ------------------------------------------------
  const edgeRows = [[T2.r1 - 2.5, T2.y, 'T2'], [T3.r1 - 2.5, T3.y, 'T3'], [PL.r - 2.2, PL.y, 'PL']];
  for (const [r, y, terr] of edgeRows) {
    const n = Math.round(2 * Math.PI * r / (terr === 'PL' ? 7.5 : 9));
    for (let i = 0; i < n; i++) {
      const th = (i + 0.5) / n * Math.PI * 2;
      if (frontBand(th, r) || angDist(th, 0) < 0.08 || angDist(th, CASCADE_TH) < 0.08) continue;
      if (terr === 'T3' && (th > ACADEMY.th0 && th < ACADEMY.th1)) continue;
      if (terr === 'PL' && angDist(th, Math.PI) < 0.5) continue;
      const p = P(r, th, y);
      cypress(veg, p.x, y, p.z, rng.range(9, 14), rng);
    }
  }
  // hanging gardens: vines and flowers over retaining wall tops
  for (const [r, yTop, len] of [[T1.r0, T2.y, 7], [T2.r0, T3.y, 7], [PL.r, PL.y, 18]]) {
    const n = Math.round(2 * Math.PI * r / 2.6);
    for (let i = 0; i < n; i++) {
      const th = (i + rng.next() * 0.6) / n * Math.PI * 2;
      if (frontBand(th, r) || angDist(th, 0) < 0.05 || angDist(th, CASCADE_TH) < 0.08) continue;
      if (rng.chance(0.25)) continue;
      const top = P(r + 0.6, th, yTop + 0.3);
      vineStrip(veg, top, dirOf(th), len * (0.4 + rng.next() * 0.65), 1.3 + rng.next() * 1.2, rng);
      if (i % 2 === 0) flowerBush(veg, P(r - 1.4, th, 0).x, yTop + 1.0, P(r - 1.4, th, 0).z, 0.8 + rng.next() * 0.5, rng);
    }
  }
  // olive trees in gaps on terraces
  for (let i = 0; i < 60; i++) {
    const terr = rng.pick(['T1', 'T2', 'T3']);
    const r = terr === 'T1' ? rng.pick([141, 173]) : terr === 'T2' ? 107.5 : 76;
    const y = terr === 'T1' ? T1.y : terr === 'T2' ? T2.y : T3.y;
    const th = rng.next() * Math.PI * 2;
    if (reserved(th, r, terr) && terr !== 'T3') continue;
    if (placed.some((p) => p.terr === terr && Math.abs(p.r - r) < 7 && angDist(p.th, th) * r < 8)) continue;
    const p = P(r, th, y);
    if (rng.chance(0.6)) oliveTree(veg, p.x, y, p.z, 0.75 + rng.next() * 0.35, rng); else flowerBush(veg, p.x, y, p.z, 1.0, rng);
  }

  // ------------------------------------------------ street arches and overpass houses (过街楼) ------------------------------------------------
  {
    const archAt = (th, r0, r1, y, h) => {
      const rm = (r0 + r1) / 2, len = r1 - r0;
      const p = P(rm, th, y);
      const M4 = mat(p.x, y, p.z, outRot(th) + Math.PI / 2);
      b.add('stone', G.wallWithOpenings(len, h, 1.4, [{ x: 0, w: len - 2.4, sh: h - 1.6 - (len - 2.4) / 2, y0: -0.01, type: 'round' }], 12), M4, 0xe2d6bf);
      b.add('stone', G.box(len + 0.4, 0.4, 1.8), mul(M4, mat(0, h, 0)), TRIM);
      b.add('stone', G.archRing(len - 2.4, 0.35, 1.5, 'round', 12, h - 1.6 - (len - 2.4) / 2), M4, TRIM);
    };
    for (const h of [0.9, 2.05, 6.3, 7.85, 10.55]) { const th = CLK(h); if (!reserved(th, 141, 'T1')) archAt(th, T1.r0 + 0.3, 146.2, T1.y, 6.2); }
    for (const h of [1.6, 5.2, 10.2]) { const th = CLK(h); if (!reserved(th, 107, 'T2')) archAt(th, T2.r0 + 0.3, 110.7, T2.y, 5.6); }
    // overpass houses bridging the inner T1 street from the upper terrace edge to the row of houses
    for (const h of [1.42, 7.12, 11.0]) {
      const th = CLK(h); if (reserved(th, 141, 'T1')) continue;
      const rm = (T1.r0 + 146.4) / 2, len = 146.4 - T1.r0;
      const p = P(rm, th, 0);
      const M4 = mat(p.x, T1.y, p.z, outRot(th) + Math.PI / 2);
      b.add('stone', G.wallWithOpenings(len, 7.2, 6.0, [{ x: 0, w: len - 3.0, sh: 7.2 - 1.4 - (len - 3) / 2, y0: -0.01, type: 'round' }], 12), M4, 0xe2d6bf);
      const Mh = mul(M4, mat(0, 7.2, 3.0, 0));
      b.add('plaster', G.box(len + 0.6, 4.4, 6.0), mul(Mh, mat(0, 0, -3.0)), rng.pick(PLASTERS));
      b.add('stone', G.box(len + 0.9, 0.3, 6.3), mul(Mh, mat(0, 4.4, -3.0)), TRIM);
      b.add('roof', G.gableRoof(len + 0.8, 6.0, 2.4, 0.4, 0.15), mul(Mh, mat(0, 4.4, -3.0)), rng.pick(ROOF_RED));
      for (const sz of [0, -6.0]) for (let k = 0; k < 3; k++) windowOn(b, mul(Mh, mat(-len / 3 + k * len / 3, 0, sz, sz < 0 ? Math.PI : 0)), 0, 1.3, 0.9, 1.4, rng, { shutter: 0x4d7a5e });
    }
  }

  // ------------------------------------------------ lamp posts ------------------------------------------------
  for (const [r, y, step] of [[173.5, T1.y, 24], [133.5, T2.y, 22], [101.5, T3.y, 20]]) {
    const n = Math.round(2 * Math.PI * r / step);
    for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI * 2; if (frontBand(th, r)) continue; const p = P(r, th, y); lampPost(b, mat(p.x, y, p.z)); }
  }

  b.build(scene, M, { dark: { cast: false }, glow: { cast: false }, glowSoft: { cast: false } });
  veg.build(scene, M, {});
  return b;
}
