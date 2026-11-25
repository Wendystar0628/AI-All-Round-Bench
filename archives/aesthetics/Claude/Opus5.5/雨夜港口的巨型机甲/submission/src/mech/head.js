// Head v4: a small helmet sitting low in the collar. From the front it is wide at the top and narrows downward:
// a rounded crown of segmented low shells, near-vertical temples, then the cheeks close into a blunt, rounded V jaw.
// The forehead armour juts forward and the visor sits one layer back: one horizontal warm-gold window whose upper
// edge (the brow) presses in from both sides to a blunt point at the centre, and whose lower frame climbs from two
// side valleys into an obtuse inverted-V arch. The middle of the window stays open; both ends fold back into short
// temple windows behind oblique frames. Raised short vertical plate on the jaw with groups of short slanted slots on
// either side; red crest on top with a round lamp at its front that throws a beam obliquely upward.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

// head frame (rest coordinates): crown (shell top), crest top, chin bottom, half width at the brow ends
export const HEAD = { top: 69.72, crest: 70.0, chin: 64.6, hw: 2.62 };

// ------------------------------------------------------------------ front silhouette (half, chin -> crown)
const OUT = (() => {
  const pts = [];
  const cy = 65.55, rc = 0.95;                 // blunt round tip of the V
  const P = [2.46, 66.95];                      // cheek corner where the V meets the near-vertical sides
  const dx = P[0], dy = P[1] - cy, d = Math.hypot(dx, dy);
  const tA = Math.atan2(dy, dx) - Math.acos(rc / d);
  for (let i = 0; i <= 10; i++) { const a = -PI / 2 + (tA + PI / 2) * i / 10; pts.push([Math.abs(Math.cos(a)) < 1e-9 ? 0 : Math.cos(a) * rc, cy + Math.sin(a) * rc]); }
  const T = pts[pts.length - 1];
  for (let i = 1; i < 4; i++) { const t = i / 4; pts.push([T[0] + (P[0] - T[0]) * t, T[1] + (P[1] - T[1]) * t]); }
  pts.push(P, [2.515, 67.13], [2.555, 67.38], [2.59, 67.8], [2.615, 68.3], [2.62, 68.7], [2.6, 69.0], [2.5, 69.22], [2.3, 69.42], [1.95, 69.57], [1.45, 69.67], [0.8, 69.71], [0, 69.72]);
  return pts;
})();
const silW = (y) => {
  if (y <= OUT[0][1] || y >= OUT[OUT.length - 1][1]) return 0;
  for (let i = 0; i < OUT.length - 1; i++) { const [x0, y0] = OUT[i], [x1, y1] = OUT[i + 1]; if (y <= y1) return x0 + (x1 - x0) * (y - y0) / Math.max(1e-6, y1 - y0); }
  return 0;
};

// face surface: wraps horizontally - flat front, then a quarter arc to the side, then straight back
const KU = 0.42;
function UW(u, y, off, zf, out) {
  const a = Math.max(0.05, silW(y)), x0 = KU * a, R = a - x0, us = x0 + R * PI / 2;
  const sg = u < 0 ? -1 : 1, au = Math.abs(u);
  let x, z, nx, nz;
  if (au <= x0) { x = au; z = 0; nx = 0; nz = 1; }
  else if (au <= us) { const p = (au - x0) / R; x = x0 + R * Math.sin(p); z = -R * (1 - Math.cos(p)); nx = Math.sin(p); nz = Math.cos(p); }
  else { x = a; z = -R - (au - us); nx = 1; nz = 0; }
  return out.set(sg * (x + nx * off), y, zf + z + nz * off);
}
const uAtX = (x, y) => { const a = Math.max(0.05, silW(y)), x0 = KU * a, R = a - x0, ax = Math.abs(x); return Math.sign(x) * (ax <= x0 ? ax : x0 + R * Math.asin(Math.min(1, (ax - x0) / R))); };
const uSide = (y) => { const a = Math.max(0.05, silW(y)); return KU * a + (1 - KU) * a * PI / 2; };

function uplate(outline, { t = 0.4, bevel = 0.1, bseg = 2, off = 0, zf, tess = 0.2 }) {
  let g = G.extrude(outline, { t, bevel, bseg });
  g = G.tess(g, tess);
  G.warp(g, (v) => { UW(v.x, v.y, off + v.z - t / 2, zf(v.y), v); });
  return G.fixWinding(G.finish(g, 36));
}
const mirrorOutline = (half) => half.concat(half.slice(1, -1).reverse().map(([u, y]) => [-u, y]));

// ------------------------------------------------------------------ facial lines (front view, x >= 0)
const TIP_Y = 67.62, TIP_HALF = 0.14;          // the brow's blunt point (short flat end)
const KNEE = [0.5, 67.98];                      // where the steep sides of the point meet the brow slope
const VIS_X = 1.95, VIS_TOPY = 68.42;           // front window edge (oblique frame) and the brow height there
const VIS_END = 2.42;                           // end of the short temple windows (front-view x)
const browLow = (x) => {
  const ax = Math.abs(x);
  if (ax <= TIP_HALF) return TIP_Y;
  if (ax <= KNEE[0]) return TIP_Y + (ax - TIP_HALF) / (KNEE[0] - TIP_HALF) * (KNEE[1] - TIP_Y);
  if (ax <= VIS_X) return KNEE[1] + (ax - KNEE[0]) * (VIS_TOPY - KNEE[1]) / (VIS_X - KNEE[0]);
  return VIS_TOPY + (Math.min(ax, VIS_END) - VIS_X) * 0.1;
};
// lower frame top edge = visor lower edge: valleys at both sides, obtuse inverted-V arch rising to the centre
const ARCH_Y = 67.18, ARCH_FLAT = 0.06, VALLEY = [1.3, 66.72], END_LOW = 66.86;
const frameTop = (x) => {
  const ax = Math.abs(x);
  if (ax <= ARCH_FLAT) return ARCH_Y;
  if (ax <= VALLEY[0]) return ARCH_Y - (ax - ARCH_FLAT) / (VALLEY[0] - ARCH_FLAT) * (ARCH_Y - VALLEY[1]);
  return VALLEY[1] + (Math.min(ax, VIS_END) - VALLEY[0]) / (VIS_END - VALLEY[0]) * (END_LOW - VALLEY[1]);
};
const xsamples = (x0, x1, extra = []) => { const s = new Set([x0, x1, ...extra.filter(v => v > x0 && v < x1)]); const n = Math.ceil((x1 - x0) / 0.1); for (let i = 1; i < n; i++) s.add(x0 + (x1 - x0) * i / n); return [...s].sort((a, b) => a - b); };
const KINKS = [ARCH_FLAT, TIP_HALF, KNEE[0], VALLEY[0], VIS_X];

// front planes (outer face z at height y) of the facial layers
const zBrow = (y) => 3.72 - (y - TIP_Y) * 0.28;      // forehead armour juts forward
const zVis = (y) => 3.16 - (y - TIP_Y) * 0.1;         // visor one layer back
const zFrame = (y) => 3.34 - (y - 66.9) * 0.08;
const zCheek = (y) => 3.22 + (66.6 - y) * 0.14;       // cheeks / jaw lean forward toward the chin

export function buildHead(B) {
  const J = 'neck';
  // ---------------------------------------------------------------- skull core (dark filler)
  {
    const full = [...OUT, ...OUT.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    const C = 67.1;
    const shield = (s, z) => ({ c: z, pts: G.resample(full.map(([x, y]) => [x * s, C + (y - C) * s]), 64) });
    const g = G.loft([shield(0.8, -2.15), shield(0.95, -1.5), shield(0.995, 1.4), shield(0.9, 2.75)], { axis: 'z' });
    B.add(J, g, 'metal', PAL.gunDark, { vary: 0.2 });
  }
  // ---------------------------------------------------------------- forehead armour: widest at its ends, blunt point at the centre
  {
    const half = [];
    for (const x of xsamples(0, VIS_END, KINKS)) half.push([uAtX(x, browLow(x)), browLow(x)]);
    const uE = uSide(68.75) + 0.3;
    half.push([uAtX(VIS_END, browLow(VIS_END)) + 0.25, browLow(VIS_END) - 0.02], [uE - 0.15, 68.5], [uE, 68.66], [uE - 0.02, 68.98], [uE - 0.4, 69.1]);
    half.push([uAtX(2.3, 69.3), 69.3], [uAtX(1.3, 69.43), 69.43], [0, 69.47]);
    const ol = G.fillet(mirrorOutline(half), 0.05, 2);
    B.add(J, uplate(ol, { t: 0.55, bevel: 0.15, bseg: 3, off: 0.06, zf: zBrow }), 'paint', PAL.steel);
    // layered inlay along the upper brow, following its slopes
    const inl = [];
    for (const x of xsamples(0, 2.25, [KNEE[0]])) { const y = Math.min(browLow(x) + 0.5, 69.0); inl.push([uAtX(x, y), y]); }
    inl.push([uAtX(2.4, 69.05), 69.07], [uAtX(2.0, 69.26), 69.26], [0, 69.34]);
    B.add(J, uplate(G.fillet(mirrorOutline(inl), 0.04, 1), { t: 0.16, bevel: 0.05, bseg: 1, off: 0.06 + 0.1, zf: zBrow }), 'paint', PAL.steel2);
  }
  // ---------------------------------------------------------------- visor: one horizontal hex window folding round to the temples
  const uVisEnd = uAtX(VIS_END, 67.6);
  {
    const lo = [], hi = [];
    for (const x of xsamples(0, VIS_END, KINKS)) { lo.push([uAtX(x, frameTop(x)), frameTop(x) - 0.14]); hi.push([uAtX(x, browLow(x)), browLow(x) + 0.25]); }
    const uS = uVisEnd + 0.12, yHi = hi[hi.length - 1][1];
    const loop = [...lo.slice().reverse().map(([u, y]) => [-u, y]), ...lo.slice(1), [uS, END_LOW - 0.14], [uS, yHi],
      ...hi.slice().reverse(), ...hi.slice(1).map(([u, y]) => [-u, y]), [-uS, yHi], [-uS, END_LOW - 0.14]];
    B.add(J, uplate(loop, { t: 0.1, bevel: 0.03, bseg: 1, off: 0, zf: zVis, tess: 0.12 }), 'visor', 0xffffff, { vary: 0 });
    B.add(J, uplate(loop, { t: 0.2, bevel: 0.02, bseg: 1, off: -0.3, zf: zVis, tess: 0.3 }), 'dark', PAL.black);
    B.marker(J, 'visor', V3(0, 67.4, zVis(67.4) + 0.6));
  }
  // ---------------------------------------------------------------- lower frame: valleys at the sides, obtuse arch at the centre
  {
    const top = [], bot = [];
    for (const x of xsamples(0, VIS_END, KINKS)) { top.push([uAtX(x, frameTop(x)), frameTop(x)]); bot.push([uAtX(x, frameTop(x) - 0.38), frameTop(x) - 0.38]); }
    const uE = uVisEnd + 0.05;
    const full = [...top.slice().reverse().map(([u, y]) => [-u, y]), ...top.slice(1), [uE, END_LOW], [uE, END_LOW - 0.38],
      ...bot.slice().reverse(), ...bot.slice(1).map(([u, y]) => [-u, y]), [-uE, END_LOW - 0.38], [-uE, END_LOW]];
    B.add(J, uplate(G.fillet(full, 0.04, 1), { t: 0.32, bevel: 0.08, bseg: 2, off: 0, zf: zFrame, tess: 0.15 }), 'paint', PAL.navy2);
  }
  // ---------------------------------------------------------------- oblique frames at the temples: front window | side window
  for (const s of [1, -1]) {
    const xb = 1.82, xt = 2.06;
    const q = [[uAtX(xb - 0.09, frameTop(xb)), frameTop(xb) - 0.05], [uAtX(xb + 0.09, frameTop(xb)), frameTop(xb) - 0.05], [uAtX(xt + 0.09, browLow(xt)), browLow(xt) + 0.12], [uAtX(xt - 0.09, browLow(xt)), browLow(xt) + 0.12]];
    const o = s > 0 ? q : q.map(([u, y]) => [-u, y]).reverse();
    B.add(J, uplate(o, { t: 0.24, bevel: 0.06, bseg: 1, off: 0.09, zf: zVis, tess: 0.14 }), 'metal', PAL.gunDark);
  }
  // ---------------------------------------------------------------- temple plates (near-vertical sides behind the short windows)
  {
    const uF = uVisEnd - 0.06, uB = uSide(67.5) + 1.9;
    const ol = [[uF, END_LOW - 0.4], [uF + 0.5, 66.42], [uB - 0.4, 66.55], [uB, 66.9], [uB, 68.05], [uB - 0.4, 68.38], [uF + 0.4, 68.42], [uF, 68.2]];
    const g = uplate(G.fillet(ol, [0.08, 0.2, 0.3, 0.3, 0.3, 0.3, 0.2, 0.08], 2), { t: 0.38, bevel: 0.11, bseg: 2, off: -0.02, zf: (y) => zVis(y) + 0.12, tess: 0.22 });
    B.add(J, g, 'paint', PAL.navy);
    B.add(J, G.mirrorX(g), 'paint', PAL.navy);
    // small green signal lamp on the right temple (mech's right = -x)
    const p = UW(-(uSide(67.9) + 0.55), 67.9, 0.12, zVis(67.9) + 0.12, V3(0, 0, 0));
    B.add(J, G.xf(G.cyl(0.15, 0.16, { seg: 16, ch: 0.04 }), { r: [0, 0, PI / 2], p: [p.x + 0.02, p.y, p.z] }), 'metal', PAL.gunDark);
    B.add(J, G.xf(G.cyl(0.1, 0.08, { seg: 14, ch: 0.03 }), { r: [0, 0, PI / 2], p: [p.x - 0.07, p.y, p.z] }), 'lampGreen', 0xffffff, { vary: 0 });
    B.marker(J, 'signalGreen', V3(p.x - 0.18, p.y, p.z));
  }
  // ---------------------------------------------------------------- cheeks: close down into the blunt V of the jaw
  const cheekTop = (x) => frameTop(x) - 0.42;           // just under the frame's lower edge (hairline seam)
  const SX = 1.25, SEAM_TOP = cheekTop(SX);
  const seam = (y) => SX - (SEAM_TOP - y) * 0.35;       // jaw / cheek seam (front view x at height y)
  let yMeet; { let a = HEAD.chin + 0.02, b = SEAM_TOP; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (seam(m) > silW(m) - 0.02) a = m; else b = m; } yMeet = (a + b) / 2; }
  const yBot = HEAD.chin + 0.08;
  {
    const ol = [];
    for (let i = 0; i <= 8; i++) { const y = SEAM_TOP - (SEAM_TOP - yMeet) * i / 8; ol.push([uAtX(seam(y), y), y]); }
    // back edge: from the meeting point back round the side and up toward the temple
    for (let i = 1; i <= 7; i++) { const t = i / 7, y = yMeet + (66.36 - yMeet) * t; ol.push([uSide(y) + 0.22 + 1.15 * Math.pow(t, 1.3), y]); }
    const uF = uVisEnd - 0.06;
    ol.push([uF + 0.5, 66.38]);
    for (const x of xsamples(SX, VIS_END, KINKS).reverse()) ol.push([uAtX(x, cheekTop(x)), cheekTop(x)]);
    ol.pop();
    const g = uplate(G.fillet(ol, 0.05, 2), { t: 0.42, bevel: 0.12, bseg: 2, off: 0, zf: zCheek, tess: 0.18 });
    B.named.cheekL = B.add(J, g, 'paint', PAL.navy2);
    B.named.cheekR = B.add(J, G.mirrorX(g), 'paint', PAL.navy2);
  }
  // ---------------------------------------------------------------- jaw: centre plate wrapping the round tip of the V
  {
    const half = xsamples(0, SX, KINKS).map(x => [uAtX(x, cheekTop(x)), cheekTop(x)]);
    for (let i = 1; i <= 8; i++) { const y = SEAM_TOP - (SEAM_TOP - yMeet) * i / 8; half.push([uAtX(seam(y), y), y]); }
    for (let i = 1; i <= 5; i++) { const y = yMeet - (yMeet - yBot) * i / 5; half.push([uSide(y) + 0.22, y]); }
    half.push([0, yBot]);
    B.add(J, uplate(G.fillet(mirrorOutline(half), 0.05, 2), { t: 0.5, bevel: 0.14, bseg: 3, off: 0.06, zf: zCheek, tess: 0.16 }), 'paint', PAL.navy);
    // raised short vertical plate at the centre of the jaw
    const ridge = [[-0.12, 65.02], [0.12, 65.02], [0.16, 66.42], [-0.16, 66.42]].map(([x, y]) => [uAtX(x, y), y]);
    B.add(J, uplate(G.fillet(ridge, 0.05, 1), { t: 0.3, bevel: 0.08, bseg: 1, off: 0.06 + 0.24, zf: zCheek, tess: 0.15 }), 'paint', PAL.steel);
    // groups of short slanted slots either side
    const slots = [];
    for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
      const y = 65.22 + i * 0.36, x0 = 0.32, x1 = 0.78 - i * 0.04, rise = 0.14;
      const q = [[x0, y - 0.055], [x1, y - 0.055 + rise], [x1, y + 0.055 + rise], [x0, y + 0.055]].map(([x, yy]) => [uAtX(s * x, yy), yy]);
      slots.push(uplate(s > 0 ? q : q.reverse(), { t: 0.2, bevel: 0.03, bseg: 1, off: 0.06 + 0.07, zf: zCheek, tess: 0.12 }));
    }
    B.add(J, G.merge(slots), 'dark', PAL.black);
  }
  // ---------------------------------------------------------------- crown: segmented low shells (left / right, front / rear blocks)
  {
    const sec = (sc, dy) => {
      const outer = [[0.36, 69.72], [1.15, 69.66], [1.95, 69.47], [2.42, 69.1], [2.6, 68.45]].map(([x, y]) => [x * sc, 67.1 + (y - 67.1) * sc + dy]);
      const inner = [[2.22, 68.45], [2.12, 68.98], [1.75, 69.22], [1.05, 69.36], [0.36, 69.38]].map(([x, y]) => [x * sc, 67.1 + (y - 67.1) * sc + dy]);
      return G.resample(G.fillet(outer.concat(inner), [0.08, 0.4, 0.5, 0.35, 0.12, 0.1, 0.25, 0.35, 0.25, 0.08], 3), 44);
    };
    const rear = G.loft([
      { c: -2.4, pts: G.offsetPoly(sec(0.62, -0.85), -0.1) }, { c: -2.2, pts: sec(0.7, -0.62) }, { c: -1.6, pts: sec(0.88, -0.25) },
      { c: -0.7, pts: sec(0.98, -0.04) }, { c: 0.22, pts: sec(1.0, 0) }, { c: 0.36, pts: G.offsetPoly(sec(1.0, 0), -0.08) },
    ], { axis: 'z' });
    const front = G.loft([
      { c: 0.5, pts: G.offsetPoly(sec(1.0, 0), -0.08) }, { c: 0.64, pts: sec(1.0, 0) }, { c: 2.75, pts: sec(0.99, -0.04) },
      { c: 3.05, pts: G.offsetPoly(sec(0.97, -0.07), -0.12) },
    ], { axis: 'z' });
    B.named.headShellL = B.add(J, front, 'paint', PAL.navy);
    B.named.headShellR = B.add(J, G.mirrorX(front), 'paint', PAL.navy);
    B.add(J, rear, 'paint', PAL.navy2);
    B.add(J, G.mirrorX(rear), 'paint', PAL.navy2);
    // red crest along the top centre
    const prof = (z) => 70.0 - Math.pow(Math.max(0, -1.2 - z), 2) * 0.12 - Math.max(0, z - 2.2) * 0.35;
    const secs = [];
    for (const z of [-2.45, -2.1, -1.4, -0.4, 0.6, 1.6, 2.4, 2.9, 3.15]) {
      const top = prof(z), w = z > 2.7 ? 0.25 : 0.3;
      secs.push({ c: z, pts: G.resample(G.fillet([[-w, top - 0.62], [w, top - 0.62], [w * 0.9, top], [-w * 0.9, top]], [0, 0, 0.1, 0.1], 2), 20) });
    }
    secs[0].pts = G.offsetPoly(secs[0].pts, -0.08);
    secs[secs.length - 1].pts = G.offsetPoly(secs[secs.length - 1].pts, -0.06);
    B.add(J, G.loft(secs, { axis: 'z' }), 'paint', PAL.red);
    // round lamp at the crest's front end, tilted to throw its beam obliquely upward
    const tilt = 34 * DEG, ax = V3(0, Math.sin(tilt), Math.cos(tilt));
    const c = V3(0, 69.58, 3.22);
    const at = (d) => c.clone().addScaledVector(ax, d);
    const R = [PI / 2 - tilt, 0, 0];
    B.add(J, G.xf(G.cyl(0.3, 0.38, { seg: 22, ch: 0.06 }), { r: R, p: c.toArray() }), 'metal', PAL.gunDark);
    B.add(J, G.xf(G.cyl(0.23, 0.08, { seg: 22, ch: 0.02 }), { r: R, p: at(0.2).toArray() }), 'lamp', 0xffffff, { vary: 0 });
    B.add(J, G.xf(G.lathe([[0.23, 0.0], [0.31, 0.0], [0.31, 0.05], [0.25, 0.14], [0.23, 0.14]], { seg: 22 }), { r: R, p: at(0.12).toArray() }), 'chrome', 0xd8dade, { vary: 0 });
    B.marker(J, 'crestLamp', at(0.34));
    B.marker(J, 'crestBeam', at(10.34));
    B.marker(J, 'crestFront', V3(0, 69.3, 3.3));
    // rain drips off the brow's lower edge (its point and along the sloping edges)
    for (const x of [-1.6, -0.8, 0.0, 0.8, 1.6]) { const y = browLow(x); B.marker(J, 'browDrip', V3(x, y - 0.05, zBrow(y) + 0.02 - (Math.abs(x) > 1.2 ? 0.2 : 0))); }
  }
  // ---------------------------------------------------------------- rear plate
  {
    const o = G.fillet([[-1.9, 65.5], [1.9, 65.5], [2.25, 66.8], [1.9, 68.5], [-1.9, 68.5], [-2.25, 66.8]], [0.35, 0.35, 0.35, 0.5, 0.5, 0.35], 3);
    const w = G.surf((x, y, out) => out.set(x, y, -2.32 + x * x * 0.08 + (y - 66) * 0.12));
    B.add(J, G.plate(o, { t: 0.5, bevel: 0.15, bseg: 2, tess: 0.3, warp: w }), 'paint', PAL.navy2);
    const vents = [];
    for (let i = 0; i < 4; i++) { const y = 65.95 + i * 0.45; vents.push(G.xf(G.rbox(2.3 - i * 0.1, 0.11, 0.28, 0.04, 1), { p: [0, y, -2.6 + (y - 66) * 0.12] })); }
    B.add(J, G.merge(vents), 'dark', PAL.black);
  }
}
