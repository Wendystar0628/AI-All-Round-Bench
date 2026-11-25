// Back: back panels, two cooling grilles (rounded-end slots, upper ends flaring outward, dark brass louvres) each
// wrapped on its outer side by a heavy C-shaped shoulder-blade plate; a column of compact, stacked dark-gunmetal
// vertebrae down the middle (clamped at the top by the wing-root straps), narrowing toward the waist and ending in
// the notch of the buttock plate; lower back panels and a hose bundle.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

const BRASS_DK = 0x4a3a1c;
// grille slot: bottom-end centre, top-end centre (the top flares outward), half width
export const BACK = { grille: { b: [3.45, 54.4], t: [4.25, 60.6], hw: 1.15 } };

// back surface depth (negative z) of the upper torso
export function backZ(x, y) {
  const ax = Math.abs(x);
  const base = -5.45 + Math.max(0, 54 - y) * 0.12 + ax * ax * 0.028;
  return Math.min(base, -3.8);
}

// closed outline of a slot (stadium) between two end centres
function slot(b, t, r, n = 12) {
  const dx = t[0] - b[0], dy = t[1] - b[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const a0 = Math.atan2(uy, ux);
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 - PI / 2 + PI * i / n; out.push([t[0] + Math.cos(a) * r, t[1] + Math.sin(a) * r]); }
  for (let i = 0; i <= n; i++) { const a = a0 + PI / 2 + PI * i / n; out.push([b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r]); }
  return out;
}

export function buildBack(B) {
  const { b: gb, t: gt, hw } = BACK.grille;
  const w = G.surf((x, y, out) => out.set(x, y, backZ(x, y)));
  // ---------------------------------------------------------------- back panels (left + mirrored), with the grille opening
  {
    const o = G.fillet([[1.85, 52.4], [7.5, 52.9], [9.1, 55.2], [9.05, 61.6], [7.8, 63.0], [2.4, 63.6], [1.85, 62.8]], [0.2, 0.9, 1.0, 1.0, 0.9, 0.5, 0.2], 3);
    const hole = slot(gb, gt, hw + 0.12);
    let g = G.plate(o, { t: 0.85, bevel: 0.24, bseg: 3, holes: [hole], tess: 0.55 });
    G.warp(g, w);
    g = G.finish(g, 38);
    B.named.backPanelL = B.add('chest', g, 'paint', PAL.navy);
    B.named.backPanelR = B.add('chest', G.mirrorX(g), 'paint', PAL.navy);
    const bo = G.plateBolts(o, { inset: 0.45, step: 1.3, z: -0.45, r: 0.12, warpFn: w, filter: (x, y) => x < 2.6 || y > 62.0 || y < 53.4 });
    if (bo) { B.add('chest', bo, 'metal', PAL.gun); B.add('chest', G.mirrorX(bo), 'metal', PAL.gun); }
    // raised slot frame
    let fg = G.plate(slot(gb, gt, hw + 0.3), { t: 0.5, bevel: 0.14, bseg: 2, holes: [slot(gb, gt, hw - 0.08)], tess: 0.4 });
    G.warp(fg, G.surf((x, y, out) => out.set(x, y, backZ(x, y) - 0.45)));
    fg = G.finish(fg, 38);
    B.add('chest', fg, 'paint', PAL.steel); B.add('chest', G.mirrorX(fg), 'paint', PAL.steel);
    // dark backing
    let bk = G.plate(slot(gb, gt, hw - 0.05), { t: 0.1, bevel: 0.02, bseg: 1, tess: 0.5 });
    G.warp(bk, G.surf((x, y, out) => out.set(x, y, backZ(x, y) + 0.4)));
    bk = G.finish(bk, 38);
    B.add('chest', bk, 'dark', PAL.black); B.add('chest', G.mirrorX(bk), 'dark', PAL.black);
    // dark brass horizontal louvres inside the slot
    const sl = [];
    const n = 13;
    for (let i = 0; i < n; i++) {
      const y = gb[1] - hw + 0.4 + (gt[1] - gb[1] + 2 * hw - 0.8) * (i + 0.5) / n;
      // horizontal chord of the slot at height y
      const xs = [];
      const P = slot(gb, gt, hw - 0.12, 16);
      for (let k = 0; k < P.length; k++) {
        const a = P[k], c = P[(k + 1) % P.length];
        if ((a[1] - y) * (c[1] - y) <= 0 && a[1] !== c[1]) xs.push(a[0] + (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]));
      }
      if (xs.length < 2) continue;
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      if (x1 - x0 < 0.4) continue;
      const s = G.rbox(x1 - x0, 0.42, 0.12, 0.04, 1);
      G.xf(s, { r: [-50 * DEG, 0, 0], p: [(x0 + x1) / 2, y, backZ((x0 + x1) / 2, y) + 0.05] });
      sl.push(s);
    }
    const sg = G.merge(sl);
    B.add('chest', sg, 'metal', BRASS_DK); B.add('chest', G.mirrorX(sg), 'metal', BRASS_DK);
    const gc = [(gb[0] + gt[0]) / 2, (gb[1] + gt[1]) / 2];
    B.marker('chest', 'grille', V3(gc[0], gc[1], backZ(gc[0], gc[1]) - 0.6));
    B.marker('chest', 'grille', V3(-gc[0], gc[1], backZ(gc[0], gc[1]) - 0.6));
  }
  // ---------------------------------------------------------------- heavy C-shaped shoulder-blade plates round the outer side of each grille
  {
    const c = [(gb[0] + gt[0]) / 2 - 0.35, (gb[1] + gt[1]) / 2];
    const R0 = 4.9, R1 = 6.3;                       // inner / outer radius of the C (front view)
    const a0 = -62 * DEG, a1 = 70 * DEG;            // opening toward the spine
    const outer = [], inner = [];
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (a1 - a0) * i / 24;
      const rx = (r) => [c[0] + Math.cos(a) * r * 0.62, c[1] + Math.sin(a) * r];
      outer.push(rx(R1 - 0.45 * Math.abs(Math.sin(a)))); inner.push(rx(R0));
    }
    const o = G.fillet([...outer, ...inner.reverse()], 0.25, 2);
    const ws = G.surf((x, y, out) => out.set(x, y, backZ(x, y) - 0.85 - Math.max(0, x - 6.5) * 0.15));
    const g = G.plate(o, { t: 1.2, bevel: 0.3, bseg: 3, tess: 0.45, warp: ws });
    B.named.scapulaL = B.add('chest', g, 'paint', PAL.navy2);
    B.named.scapulaR = B.add('chest', G.mirrorX(g), 'paint', PAL.navy2);
    const bl = G.plateBolts(o, { inset: 0.38, step: 1.05, z: -0.62, r: 0.11, warpFn: ws });
    if (bl) { B.add('chest', bl, 'metal', PAL.gun); B.add('chest', G.mirrorX(bl), 'metal', PAL.gun); }
  }
  // ---------------------------------------------------------------- spine: compact stack of dark-gunmetal vertebrae
  {
    const N = 13, yTop = 63.0, yBot = 47.0;
    for (let i = 0; i < N; i++) {
      const y1 = yTop - (yTop - yBot) * i / N, y0 = yTop - (yTop - yBot) * (i + 1) / N + 0.08, yc = (y0 + y1) / 2;
      const jn = yc > 52.6 ? 'chest' : 'waist';
      const k = i / (N - 1), wB = THREE.MathUtils.lerp(1.25, 0.72, k), wP = THREE.MathUtils.lerp(2.3, 1.25, k);
      const zb = backZ(0, yc);
      const parts = [];
      // centrum (body)
      parts.push(G.xf(G.rbox(wB * 2, y1 - y0, 1.5, 0.22, 2), { p: [0, yc, zb - 0.35] }));
      // transverse processes (side wings), angled down-out
      for (const s of [1, -1]) parts.push(G.xf(G.rbox(wP - wB + 0.3, 0.42, 0.9, 0.12, 2), { r: [0, 0, -s * 0.22], p: [s * (wB + (wP - wB) / 2 - 0.1), yc + 0.1, zb - 0.2] }));
      // dorsal spinous block, overlapping the next one down
      parts.push(G.xf(G.rbox(wB * 0.9, (y1 - y0) * 0.95, 0.75, 0.16, 2), { r: [0.32, 0, 0], p: [0, yc - 0.12, zb - 1.15] }));
      B.add(jn, G.merge(parts), 'metal', PAL.gunDark);
      // disc between vertebrae
      B.add(jn, G.xf(G.cyl(wB * 0.8, 0.14, { seg: 16, ch: 0.03 }), { s: [1, 1, 0.65], p: [0, y0 - 0.02, zb - 0.35] }), 'rubber', PAL.rubber);
      if (i % 2 === 0) B.add(jn, G.merge([-1, 1].map(s => G.bolt(V3(s * wB * 0.6, yc, zb - 1.1), V3(0, 0, -1), 0.1))), 'metal', PAL.gunLight);
    }
    // dark filler behind the column
    B.add('chest', G.xf(G.rbox(2.8, 10.6, 1.0, 0.3, 2), { p: [0, 57.6, backZ(0, 57.6) + 0.2] }), 'metal', PAL.black);
    B.add('waist', G.xf(G.rbox(2.0, 5.6, 1.0, 0.3, 2), { p: [0, 49.8, backZ(0, 49.8) + 0.2] }), 'metal', PAL.black);
    B.marker('waist', 'spineBottom', V3(0, 47.4, backZ(0, 47.4) - 1.0));
  }
  // ---------------------------------------------------------------- lower back panels (waist joint), hose bundle into the buttock notch
  {
    const o = G.fillet([[1.75, 47.8], [4.8, 48.1], [5.1, 50.3], [6.3, 52.8], [1.75, 52.6]], [0.2, 0.5, 0.6, 0.5, 0.2], 3);
    const ww = G.surf((x, y, out) => out.set(x, y, backZ(x, y) + 0.25 + Math.max(0, 50 - y) * 0.15));
    let g = G.plate(o, { t: 0.7, bevel: 0.2, bseg: 3, tess: 0.5 }); G.warp(g, ww); g = G.finish(g, 38);
    B.add('waist', g, 'paint', PAL.navy2); B.add('waist', G.mirrorX(g), 'paint', PAL.navy2);
    B.later.push(() => {
      const pipes = [], clamps = [];
      const xs = [-1.25, -0.95, 0.95, 1.25];
      xs.forEach((dx, i) => {
        const r = i % 2 ? 0.2 : 0.24;
        const pts = [
          B.pw('waist', V3(dx, 51.6, backZ(0, 51.6) + 0.1)),
          B.pw('waist', V3(dx * 1.05, 49.6, backZ(0, 49.6) - 0.5)),
          B.pw('pelvis', V3(dx * 1.0, 48.0, -5.0)),
          B.pw('pelvis', V3(dx * 0.95, 46.6, -4.2)),
        ];
        pipes.push(G.cable(pts, r, { seg: 30, radial: 10 }));
        clamps.push(G.clampsAlong(pts, r, 2, { width: 0.22, thick: 0.07 }));
      });
      B.addW(G.merge(pipes), 'hose', PAL.gun);
      B.addW(G.merge(clamps), 'metal', PAL.gunLight);
    });
  }
}
