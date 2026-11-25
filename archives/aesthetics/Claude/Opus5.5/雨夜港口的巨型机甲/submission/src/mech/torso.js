// Chest, reactor housing, abdomen, waist ring, pelvis.
// Chest ~20 m wide; from under the collar to the bottom of the reactor ring ~8.4 m. Two chest shells bulge forward and
// down from the neckline and clamp the protruding round reactor (centre ~58.8 m above the soles, outer ring ~7.7 m,
// opening ~5.6 m); the shells get shorter toward the armpits and the ring's lower edge hangs below them; under the
// reactor the chest pulls back toward the abdomen. Segmented abdomen (~7.7 m) narrowing to a ~10.5 m waist, Y-shaped
// pelvis front whose central plate ends ~40 m above the soles, hip armour with upturned points, red/white arc edges
// and dark-brass discs, open hip gaps showing ring-grooved axle drums and vertical hydraulics.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

export const RC = 58.8;                           // reactor centre height
// chest front surface (rest-world): bulges forward and down from the neckline, recedes again under the reactor
export function chestZ(x, y) {
  const t = Math.min(1, Math.max(0, (63.4 - y) / 6.6));
  const zc = y >= 56.8 ? 2.45 + 3.25 * Math.pow(Math.sin(t * PI / 2), 0.9) : 5.7 - (56.8 - y) ** 2 * 0.12;
  const ax = Math.abs(x);
  const o = Math.max(0, ax - 5.6);
  return zc - ax * ax * 0.012 - 0.045 * o * o * o + 0.38 * Math.exp(-(((ax - 4.6) / 2.6) ** 2));
}
export const REACTOR = { c: V3(0, RC, 0), tilt: 10 * DEG, rOut: 3.86, rIn: 2.8 };
REACTOR.c.z = chestZ(0, RC) - 0.15;
const BRASS = 0x4f3d1e, DKGOLD = 0x6a5228;

function hfWarp(f, dz = 0) { return G.surf((x, y, o) => o.set(x, y, f(x, y) + dz)); }

export function buildTorso(B) {
  const chestW = hfWarp(chestZ);

  // ---------------------------------------------------------------- chest core volume (hidden filler)
  {
    const secs = [];
    const lv = [
      [49.6, 3.6, 5.4, 1.8, -4.2], [52.0, 4.2, 6.8, 2.6, -4.6], [55.0, 4.8, 8.3, 3.4, -5.0], [58.5, 5.0, 9.0, 2.8, -5.3],
      [61.5, 4.8, 8.9, 1.8, -5.3], [63.6, 4.4, 7.6, 0.9, -5.0],
    ];
    for (const [y, wf, wb, zf, zb] of lv) {
      const poly = [[-wb, zb], [wb, zb], [wb, zf - 2.6], [wf, zf], [-wf, zf], [-wb, zf - 2.6]];
      secs.push([y, G.resample(G.fillet(poly, 0.8, 3), 64)]);
    }
    B.add('chest', G.taper(secs, { ch: 0.3 }), 'metal', PAL.gunDark, { vary: 0.3 });
  }

  // ---------------------------------------------------------------- chest shells (left half, mirrored) clamping the reactor
  const ringR = 4.15;
  const lowerEdge = [[9.4, 57.9], [7.7, 56.75], [5.4, 55.95], [2.95, 55.62]];
  const outline = [
    ...G.fillet([[0.86, 63.25], [5.4, 63.45], [8.7, 62.7], [10.0, 60.4], [9.95, 59.3], ...lowerEdge], [0, 0.6, 1.4, 0.9, 0.8, 0.9, 1.4, 1.2, 0], 4),
    ...G.arc(0, RC, ringR, -48 * DEG, 78.2 * DEG, 22),
  ];
  const shell = G.plate(outline, { t: 0.95, bevel: 0.26, bseg: 3, tess: 0.36, warp: chestW });
  [B.named.chestShellL, B.named.chestShellR] = B.addSym('chest', shell, 'paint', PAL.navy);
  B.addSym('chest', G.plateBolts(outline, { inset: 0.55, step: 1.25, z: 0.5, r: 0.13, warpFn: chestW, filter: (x, y) => y > 62.3 || x > 9.0 }), 'metal', PAL.gun);

  // thin slanted plate on the upper outer shell + shadow gap; three small lamps in a row at the upper outer corner
  {
    const o = G.fillet([[4.75, 60.55], [6.3, 60.75], [6.45, 62.55], [4.6, 62.72]], [0.25, 0.4, 0.3, 0.2], 3);
    const w = hfWarp(chestZ, 0.78);
    B.addSym('chest', G.plate(o, { t: 0.32, bevel: 0.1, bseg: 2, tess: 0.5, warp: w }), 'paint', PAL.steel);
    const sp = G.fillet([[5.0, 60.9], [6.1, 61.05], [6.2, 62.2], [4.95, 62.38]], 0.2, 2);
    B.addSym('chest', G.plate(sp, { t: 0.5, bevel: 0.05, bseg: 1, tess: 0.6, warp: hfWarp(chestZ, 0.45) }), 'metal', PAL.gunDark);
    const hous = [], lens = [];
    for (let i = 0; i < 3; i++) {
      const x = 6.95 + i * 0.6, y = 61.4 - i * 0.36, p = V3(x, y, 0); chestW(p); p.z += 0.5;
      hous.push(G.xf(G.cyl(0.22, 0.3, { seg: 16, ch: 0.05 }), { r: [PI / 2, 0, 0], p: [p.x, p.y, p.z] }));
      lens.push(G.xf(G.cyl(0.14, 0.12, { seg: 14, ch: 0.03 }), { r: [PI / 2, 0, 0], p: [p.x, p.y, p.z + 0.12] }));
      for (const s of [1, -1]) B.marker('chest', 'chestLamp', V3(s * p.x, p.y, p.z + 0.3));
    }
    B.addSym('chest', G.merge(hous), 'metal', PAL.gunDark);
    B.addSym('chest', G.merge(lens), 'lamp', 0xffffff, { vary: 0 });
  }

  // layered narrow edges along the shell's lower edge
  {
    const band = (dy, dz, wB, col, holes) => {
      const top = lowerEdge.map(([x, y]) => [x + 0.1, y - dy]);
      const bot = lowerEdge.map(([x, y]) => [x + 0.1, y - dy - wB]);
      const o = G.fillet([...top, ...bot.slice().reverse()], 0.12, 2);
      const hl = [];
      if (holes) {
        for (let i = 0; i < 9; i++) {
          const s0 = 0.06 + i * 0.1, s1 = s0 + 0.055;
          const a = polyAt(lowerEdge, s0), b = polyAt(lowerEdge, s1);
          hl.push([[a[0], a[1] - dy - 0.14], [a[0], a[1] - dy - wB + 0.14], [b[0], b[1] - dy - wB + 0.14], [b[0], b[1] - dy - 0.14]]);
        }
      }
      B.addSym('chest', G.plate(o, { t: 0.36, bevel: 0.1, bseg: 2, holes: hl, tess: 0.4, warp: hfWarp(chestZ, dz) }), 'paint', col);
    };
    band(0.12, 0.42, 0.55, PAL.steel, true);
    band(0.58, 0.18, 0.42, PAL.navy2, false);
  }

  // white radial scale ticks on the blue shell surfaces either side of the reactor ring
  {
    const ticks = [];
    for (let k = -6; k <= 6; k++) {
      const a = k * 5 * DEG, long = k % 3 === 0;
      const r0 = 4.38, r1 = long ? 5.15 : 4.85;
      const pts = [[r0, -0.045], [r1, -0.045], [r1, 0.045], [r0, 0.045]].map(([r, t]) => [Math.cos(a) * r - Math.sin(a) * t, RC + Math.sin(a) * r + Math.cos(a) * t]);
      ticks.push(G.plate(pts, { t: 0.08, bevel: 0.02, bseg: 1, tess: 0.3, warp: hfWarp(chestZ, 0.5) }));
    }
    B.addSym('chest', G.merge(ticks), 'paint', PAL.white);
  }

  // flank panels under the arms (wrap from front to back)
  {
    const sec = (y, zf, zb, x0) => [y, G.resample(G.fillet([[x0, zb], [x0 + 0.9, zb + 0.5], [x0 + 0.9, zf - 0.6], [x0, zf]], 0.3, 3), 24)];
    const g = G.taper([sec(54.4, 0.9, -4.4, 8.0), sec(57.4, 0.7, -4.9, 9.0), sec(62.4, -0.2, -5.1, 8.8)], { ch: 0.25 });
    [B.named.flankL, B.named.flankR] = B.addSym('chest', g, 'paint', PAL.navy2);
    const parts = [], caps = [];
    const pts = [[8.55, 56.6, -1.2], [7.6, 54.2, -0.9], [6.45, 51.9, -0.6]];
    for (const [x, y, z] of pts) {
      const s = G.rbox(0.7, 2.6, 1.0, 0.15, 2);
      G.xf(s, { r: [0, 0, 28 * DEG], p: [x - 0.25, y - 0.4, z] });
      parts.push(s);
      caps.push(G.xf(G.cyl(0.55, 0.45, { seg: 20, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x + 0.38, y + 0.25, z] }));
      caps.push(G.xf(G.cyl(0.28, 0.6, { seg: 14, ch: 0.05 }), { r: [0, 0, PI / 2], p: [x + 0.55, y + 0.25, z] }));
    }
    B.addSym('chest', G.merge(parts), 'metal', PAL.gun);
    B.addSym('chest', G.merge(caps), 'metal', PAL.gunLight);
  }

  // ---------------------------------------------------------------- reactor housing (static parts)
  buildReactorStatic(B);

  // ---------------------------------------------------------------- abdomen (waist joint): narrow centre plate + layered folded plates
  {
    const zAbs = (x, y) => 4.55 - (54.8 - y) * 0.12 - x * x * 0.06;
    const o = G.fillet([[-0.9, 47.7], [0.9, 47.7], [1.05, 54.9], [-1.05, 54.9]], [0.2, 0.2, 0.1, 0.1], 3);
    B.add('waist', G.plate(o, { t: 0.9, bevel: 0.22, bseg: 3, tess: 0.5, warp: hfWarp(zAbs) }), 'paint', PAL.steel);
    const o2 = G.fillet([[-0.35, 48.4], [0.35, 48.4], [0.4, 54.2], [-0.4, 54.2]], 0.12, 2);
    B.add('waist', G.plate(o2, { t: 0.3, bevel: 0.08, bseg: 2, tess: 0.5, warp: hfWarp(zAbs, 0.55) }), 'paint', PAL.navy2);
    const plates = [
      { top: [[1.2, 55.0], [7.1, 56.45]], bot: [[1.2, 52.6], [6.4, 53.9]], z: 4.35 },
      { top: [[1.2, 52.95], [6.0, 54.3]], bot: [[1.2, 50.45], [5.35, 51.6]], z: 3.95 },
      { top: [[1.2, 50.8], [5.35, 52.0]], bot: [[1.2, 47.9], [5.15, 49.0]], z: 3.6 },
    ];
    const foldX = 3.9, ang = 38 * DEG, rr = 0.8;
    plates.forEach((pl, i) => {
      const o = G.fillet([pl.bot[0], pl.bot[1], pl.top[1], pl.top[0]], [0.1, 0.45, 0.45, 0.1], 3);
      const z0 = pl.z;
      const fold = (x, y, out) => {
        const d = x - foldX;
        let px, pz;
        if (d < -rr) { px = x; pz = 0; }
        else {
          const steps = 24; px = foldX - rr; pz = 0; const xx = Math.min(d, rr);
          const L = xx + rr;
          for (let k = 0; k < steps; k++) {
            const u = (k + 0.5) / steps * L - rr;
            const a = ang * Math.min(1, Math.max(0, (u + rr) / (2 * rr)));
            px += Math.cos(a) * L / steps; pz -= Math.sin(a) * L / steps;
          }
          if (d > rr) { px += Math.cos(ang) * (d - rr); pz -= Math.sin(ang) * (d - rr); }
        }
        out.set(px, y, z0 + pz - (55 - y) * 0.04);
      };
      const w = G.surf(fold);
      B.addSym('waist', G.plate(o, { t: 0.62, bevel: 0.18, bseg: 3, tess: 0.45, warp: w }), 'paint', i === 1 ? PAL.navy2 : PAL.navy);
      B.addSym('waist', G.plateBolts(o, { inset: 0.42, step: 1.1, z: 0.33, r: 0.11, warpFn: w, filter: (x) => x < 2.2 }), 'metal', PAL.gun);
    });
    // abdomen inner core (dark, visible through gaps)
    const secs = [
      [46.8, G.resample(G.rrect(10.0, 6.4, 1.8, 4, 0, 0.2), 48)],
      [50.4, G.resample(G.rrect(9.4, 6.6, 1.8, 4, 0, 0.1), 48)],
      [55.2, G.resample(G.rrect(12.6, 8.6, 2.0, 4, 0, 0.0), 48)],
    ];
    B.add('waist', G.taper(secs, { ch: 0.2 }), 'metal', PAL.gunDark, { vary: 0.2 });
    // horizontal ribs + struts on the core sides (the supports seen at the rear sides of the waist)
    const ribs = [];
    for (let i = 0; i < 6; i++) {
      const y = 48.4 + i * 1.12;
      ribs.push(G.xf(G.rbox(1.3, 0.38, 5.2, 0.1, 1), { p: [4.55 + (y > 51 ? (y - 51) * 0.3 : (51 - y) * 0.1), y, -0.7] }));
    }
    for (const z of [-2.6, -0.4]) ribs.push(G.between(G.cyl(0.32, 6.4, { seg: 12, ch: 0.05 }), V3(5.3, 48.2, z), V3(6.2, 54.4, z - 0.3)));
    B.addSym('waist', G.merge(ribs), 'metal', PAL.gun);
  }

  // ---------------------------------------------------------------- dark waist ring (pelvis joint)
  {
    const prof = [[4.1, 47.15], [5.0, 47.15], [5.22, 47.4], [5.22, 48.85], [5.0, 49.1], [4.1, 49.1]];
    const ring = G.lathe(prof, { seg: 64 });
    G.xf(ring, { s: [1.0, 1.0, 0.72], p: [0, 0, -1.05] });
    B.add('pelvis', G.finish(ring, 38), 'metal', PAL.gunDark);
    const studs = [];
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * G.TAU;
      studs.push(G.xf(G.rbox(0.5, 1.5, 0.35, 0.08, 1), { r: [0, a, 0], p: [Math.sin(a) * 5.3, 48.12, Math.cos(a) * 5.3 * 0.72 - 1.05] }));
    }
    B.add('pelvis', G.merge(studs), 'metal', PAL.gun);
  }

  // ---------------------------------------------------------------- pelvis
  buildPelvis(B, hfWarp);
}

function polyAt(P, s) {
  const L = []; let tot = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); L.push(l); tot += l; }
  let d = s * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const u = Math.min(1, d / L[i]); return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u]; } d -= L[i]; }
  return P[P.length - 1];
}

function buildReactorStatic(B) {
  const R = REACTOR;
  // local frame: reactor axis +Z, tilted up by tilt
  const M = new THREE.Matrix4().compose(R.c, new THREE.Quaternion().setFromEuler(new THREE.Euler(-R.tilt, 0, 0)), V3(1, 1, 1));
  const put = (g) => g.applyMatrix4(M);
  // socket (dark cylinder sinking into the chest)
  const sock = G.cyl(4.0, 2.6, { seg: 64, ch: 0.1 }); G.xf(sock, { r: [PI / 2, 0, 0], p: [0, 0, -2.15] });
  B.add('chest', put(sock), 'metal', PAL.gunDark);
  // segmented dark-steel outer ring
  const segs = [];
  const nSeg = 10;
  for (let i = 0; i < nSeg; i++) {
    const a0 = i / nSeg * G.TAU + 0.022, a1 = (i + 1) / nSeg * G.TAU - 0.022;
    const prof = [[3.05, -0.2], [3.05, 0.62], [3.2, 0.86], [3.55, 0.97], [3.8, 0.84], [3.86, 0.55], [3.86, -0.3], [3.05, -0.3]];
    const g = G.lathe(prof, { seg: 10, phi0: a0, phiLen: a1 - a0 });
    G.xf(g, { r: [PI / 2, 0, 0] });
    segs.push(g);
  }
  B.add('chest', put(G.merge(segs)), 'metal', PAL.gunDark);
  // bolts (polished heads) on the ring
  const bl = [];
  for (let i = 0; i < nSeg * 2; i++) {
    const a = (i + 0.5) / (nSeg * 2) * G.TAU;
    bl.push(G.bolt(V3(Math.cos(a) * 3.45, Math.sin(a) * 3.45, 0.97), V3(0, 0, 1), 0.13, a));
  }
  B.add('chest', put(G.merge(bl)), 'chrome', 0x9a9ca0);
  // dark-gold inner lip
  const lip = G.lathe([[2.78, -0.1], [3.08, -0.1], [3.08, 0.5], [2.93, 0.52], [2.8, 0.42]], { seg: 72 });
  G.xf(lip, { r: [PI / 2, 0, 0] });
  B.add('chest', put(lip), 'metal', DKGOLD);
  // recessed annular dish (emissive gradient handled by material "reactorDisc")
  const disc = G.lathe([[0.86, -0.95], [2.8, -0.95], [2.8, 0.12], [2.78, -0.62], [2.45, -0.78], [1.1, -0.72], [0.86, -0.62]], { seg: 72 });
  G.xf(disc, { r: [PI / 2, 0, 0] });
  B.add('chest', put(disc), 'reactorDisc', 0xffffff, { vary: 0 });
  // collar where the ring meets the shells
  const col = G.lathe([[3.85, -0.5], [4.15, -0.5], [4.15, -0.05], [3.86, 0.1]], { seg: 72 });
  G.xf(col, { r: [PI / 2, 0, 0] });
  B.add('chest', put(col), 'metal', PAL.gunDark);
}

export function reactorFrame() {
  const R = REACTOR;
  return new THREE.Matrix4().compose(R.c, new THREE.Quaternion().setFromEuler(new THREE.Euler(-R.tilt, 0, 0)), V3(1, 1, 1));
}

// Rotor (blades + hub) geometry in reactor-local frame (axis +Z)
export function reactorRotorGeos() {
  const blades = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * G.TAU;
    const pts = [];
    const steps = 14;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const r = 0.95 + u * 1.77;
      const a = a0 + Math.pow(u, 0.8) * 0.95; // same-direction curvature
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const L = [], Rr = [];
    for (let k = 0; k <= steps; k++) {
      const p = pts[k], q = pts[Math.min(steps, k + 1)], pp = pts[Math.max(0, k - 1)];
      let tx = q[0] - pp[0], ty = q[1] - pp[1]; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      const w = 0.07 + 0.09 * (k / steps);
      L.push([p[0] - ty * w, p[1] + tx * w]); Rr.push([p[0] + ty * w, p[1] - tx * w]);
    }
    const g = G.plate(L.concat(Rr.reverse()), { t: 0.5, bevel: 0.05, bseg: 1, curveSeg: 1 });
    G.xf(g, { p: [0, 0, -0.42] });
    blades.push(g);
  }
  const hub = G.lathe([[0.0, 0.05], [0.42, 0.02], [0.62, -0.1], [0.74, -0.32], [0.76, -0.7], [0.0, -0.7]], { seg: 48 });
  G.xf(hub, { r: [PI / 2, 0, 0] });
  const rings = G.merge([
    G.xf(G.ring(0.8, 0.88, 0.22, { seg: 48 }), { r: [PI / 2, 0, 0], p: [0, 0, -0.5] }),
    G.xf(G.ring(0.97, 1.05, 0.16, { seg: 48 }), { r: [PI / 2, 0, 0], p: [0, 0, -0.56] }),
  ]);
  return { blades: G.merge(blades), hub, rings };
}

function buildPelvis(B, hfWarp) {
  // core block
  {
    const secs = [
      [40.6, G.resample(G.rrect(7.0, 5.0, 1.4, 4, 0, -0.2), 48)],
      [43.4, G.resample(G.rrect(10.6, 6.6, 1.8, 4, 0, -0.2), 48)],
      [47.4, G.resample(G.rrect(10.4, 7.0, 1.8, 4, 0, -0.3), 48)],
    ];
    B.add('pelvis', G.taper(secs, { ch: 0.3 }), 'metal', PAL.gunDark, { vary: 0.2 });
  }
  // central armour reaching down (the stem of the Y), lower edge ~40 m above the soles
  const zG = (x, y) => 3.75 + (47.2 - y) * 0.05 - x * x * 0.07;
  {
    const o = G.fillet([[-1.15, 40.0], [1.15, 40.0], [2.35, 47.35], [-2.35, 47.35]], [0.35, 0.35, 0.3, 0.3], 3);
    const w = hfWarp(zG);
    B.add('pelvis', G.plate(o, { t: 1.1, bevel: 0.28, bseg: 3, tess: 0.5, warp: w }), 'paint', PAL.navy);
    const o2 = G.fillet([[-0.62, 40.8], [0.62, 40.8], [1.5, 46.4], [-1.5, 46.4]], [0.2, 0.2, 0.25, 0.25], 3);
    B.add('pelvis', G.plate(o2, { t: 0.36, bevel: 0.1, bseg: 2, tess: 0.45, warp: hfWarp(zG, 0.62) }), 'paint', PAL.steel);
    B.add('pelvis', G.plateBolts(o, { inset: 0.4, step: 0.95, z: 0.55, r: 0.11, warpFn: w, filter: (x, y) => y > 46.5 || y < 40.8 }), 'metal', PAL.gun);
    const v = [];
    for (let i = 0; i < 3; i++) {
      const y = 42.4 + i * 0.5;
      v.push(G.xf(G.rbox(1.3 - i * 0.25, 0.16, 0.2, 0.05, 1), { p: [0, y, zG(0, y) + 0.8] }));
    }
    B.add('pelvis', G.merge(v), 'dark', PAL.black);
  }
  // the two thick slanted edges of the Y, rising from the centre to the hips
  {
    const a = V3(1.95, 47.15, 3.6), b = V3(8.2, 50.05, 1.55);
    const bar = G.cyl(0.62, a.distanceTo(b) + 0.5, { seg: 6, ch: 0.12 });
    G.between(bar, a, b, { roll: 0.2 });
    B.addSym('pelvis', bar, 'paint', PAL.steel);
    // narrow web under each edge (the hip gap below it stays open front to back)
    const zP = (x, y) => 3.2 - (x - 2) * 0.3 - (47 - y) * 0.02;
    const o = G.fillet([[2.3, 46.75], [7.6, 49.3], [7.35, 48.0], [2.5, 45.7]], [0.1, 0.3, 0.3, 0.1], 2);
    B.addSym('pelvis', G.plate(o, { t: 0.6, bevel: 0.18, bseg: 2, tess: 0.5, warp: hfWarp(zP) }), 'paint', PAL.navy2);
  }
  // buttock plate (spans both hips) with notch at top centre for the spine
  {
    const o = G.fillet([
      [-6.6, 47.4], [-1.4, 47.4], [-0.85, 46.3], [0.85, 46.3], [1.4, 47.4], [6.6, 47.4], [6.9, 43.8], [5.8, 40.8], [-5.8, 40.8], [-6.9, 43.8],
    ], [0.6, 0.25, 0.25, 0.25, 0.25, 0.6, 1.2, 1.4, 1.4, 1.2], 3);
    const w = G.surf((x, y, out) => out.set(x, y, -(4.35 - x * x * 0.03 + (47.2 - y) * 0.06)));
    const g = G.plate(o, { t: 1.0, bevel: 0.25, bseg: 3, tess: 0.55, warp: w });
    G.flipWinding(g);
    B.add('pelvis', g, 'paint', PAL.navy);
    const bo = G.plateBolts(o, { inset: 0.45, step: 1.2, z: -0.52, r: 0.12, warpFn: w });
    if (bo) { G.flipWinding(bo); B.add('pelvis', bo, 'metal', PAL.gun); }
    const strip = G.fillet([[-5.2, 43.5], [5.2, 43.5], [5.0, 44.3], [-5.0, 44.3]], 0.2, 2);
    const sg = G.plate(strip, { t: 0.32, bevel: 0.09, bseg: 2, tess: 0.5, warp: G.surf((x, y, out) => out.set(x, y, -(4.95 - x * x * 0.03 + (47.2 - y) * 0.06))) });
    G.flipWinding(sg);
    B.add('pelvis', sg, 'paint', PAL.steel);
  }
  // hip armour (own joint, partly follows the thigh) - left, mirrored
  {
    const jn = 'hipArmorL';
    const both = (g, mat, col, opts) => { B.add(jn, g, mat, col, opts); B.add('hipArmorR', G.mirrorX(g), mat, col, opts); };
    // C-shaped shell wrapping the hip from front to back
    const sec = (y, ox, zf, zb, th) => {
      const outer = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = -PI / 2 + i / n * PI;
        const cz = (zf + zb) / 2, rz = (zf - zb) / 2;
        outer.push([ox - 1.5 + Math.cos(a) * 1.5, cz + Math.sin(a) * rz]);
      }
      const inner = outer.map(([x, z]) => [x - th, z * 0.92]).reverse();
      return [y, G.resample(outer.concat(inner), 40)];
    };
    both(G.taper([sec(48.9, 8.75, 3.0, -3.4, 0.75), sec(46.5, 9.4, 3.7, -3.7, 0.8), sec(42.6, 9.35, 3.5, -3.5, 0.8), sec(39.6, 8.8, 2.8, -3.0, 0.75)], { ch: 0.22 }), 'paint', PAL.navy);
    // outer shield plate: its upper edge picks up into a point at the front; red/white stripes along the front-lower arc
    const P = [[-3.35, 48.55], [-1.0, 49.05], [1.1, 49.55], [2.0, 51.05], [2.55, 49.2], [3.45, 46.9], [3.5, 44.0], [2.9, 41.2], [1.6, 39.75], [-0.6, 39.45], [-2.7, 40.2], [-3.4, 42.0]];
    const shieldO = G.fillet(P, [0.35, 0.5, 0.4, 0.12, 0.6, 1.0, 1.2, 1.2, 1.0, 0.8, 0.6, 0.35], 3);
    const xo = (y, z) => 9.6 - z * z * 0.035 - Math.max(0, 45 - y) * 0.06;
    const sh = G.plate(shieldO, { t: 0.62, bevel: 0.18, bseg: 3, tess: 0.45 });
    G.warp(sh, (v) => { const z = v.x, y = v.y, w = v.z; v.set(xo(y, z) + w, y, z); });
    both(G.fixWinding(G.finish(sh, 38)), 'paint', PAL.navy2);
    // red + white stripes following the front-lower arc edge
    {
      const arcPts = P.slice(4, 10);    // from just below the point, round the front and along the bottom
      const curve = new THREE.CatmullRomCurve3(arcPts.map(([z, y]) => V3(0, y, z)), false, 'catmullrom', 0.5);
      const strip = (inset, wid) => {
        const rings = [];
        for (let i = 0; i <= 40; i++) {
          const t = i / 40, p = curve.getPoint(t), tg = curve.getTangent(t);
          const nIn = V3(0, -tg.z, tg.y).normalize();     // in the (z, y) plane, toward the shield's inside
          const a = p.clone().addScaledVector(nIn, inset), b = p.clone().addScaledVector(nIn, inset + wid);
          const X = (q, d) => V3(xo(q.y, q.z) + 0.31 + d, q.y, q.z);
          rings.push([X(a, 0), X(b, 0), X(b, 0.05), X(a, 0.05)]);
        }
        return G.loftRings(rings);
      };
      both(strip(0.18, 0.34), 'paint', PAL.red);
      both(strip(0.56, 0.2), 'paint', PAL.white);
    }
    // dark-brass round discs on the outside (hip axle cover)
    const cx = xo(44.1, 0.1) + 0.05;
    both(G.merge([
      G.xf(G.cyl(1.75, 0.42, { seg: 44, ch: 0.12 }), { r: [0, 0, PI / 2], p: [cx + 0.1, 44.1, 0.1] }),
      G.xf(G.cyl(0.55, 0.3, { seg: 28, ch: 0.08 }), { r: [0, 0, PI / 2], p: [cx + 0.48, 44.1, 0.1] }),
    ]), 'metal', BRASS);
    both(G.xf(G.cyl(1.22, 0.3, { seg: 40, ch: 0.1 }), { r: [0, 0, PI / 2], p: [cx + 0.3, 44.1, 0.1] }), 'metal', PAL.gun);
    const bl = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * G.TAU; bl.push(G.bolt(V3(cx + 0.33, 44.1 + Math.sin(a) * 1.5, 0.1 + Math.cos(a) * 1.5), V3(1, 0, 0), 0.12, a)); }
    both(G.merge(bl), 'metal', PAL.gunLight);
    // layered top plate on the hip armour
    const sec2 = (y, ox, zf, zb) => {
      const pts = [];
      const n = 12;
      for (let i = 0; i <= n; i++) { const a = -PI / 2 + i / n * PI; pts.push([ox - 1.0 + Math.cos(a) * 1.05, (zf + zb) / 2 + Math.sin(a) * (zf - zb) / 2]); }
      const inner = pts.map(([x, z]) => [x - 0.45, z * 0.94]).reverse();
      return [y, G.resample(pts.concat(inner), 36)];
    };
    both(G.taper([sec2(49.3, 8.65, 3.1, -3.5), sec2(47.6, 9.25, 3.8, -3.9)], { ch: 0.15 }), 'paint', PAL.steel);
    // front-inner vertical slot with rods + clamps
    const rods = [], rings = [];
    for (let i = 0; i < 3; i++) {
      const x = 6.6 + i * 0.48, z = 2.6 - i * 0.25;
      rods.push(G.xf(G.cyl(0.17, 6.4, { seg: 12, ch: 0.03 }), { p: [x, 43.4, z] }));
      for (const y of [41.4, 45.3]) rings.push(G.xf(G.ring(0.16, 0.3, 0.42, { seg: 16 }), { p: [x, y + i * 0.2, z] }));
    }
    both(G.merge(rods), 'chrome', 0xcfd2d6);
    both(G.merge(rings), 'metal', PAL.gunLight);
  }
}
