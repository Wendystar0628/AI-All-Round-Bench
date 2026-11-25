// Collar ring, upper-chest slope plates, pauldrons, wing plates, rear neck guard.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

// remap z of a z-lofted solid so that its front plane becomes zf(x,y)
function slantFront(g, zBack, zFrontNominal, zf) {
  return G.warp(g, (v) => {
    const f = zf(v.x, v.y);
    v.z = zBack + (v.z - zBack) * (f - zBack) / (zFrontNominal - zBack);
  });
}

export function buildShoulders(B) {
  buildCollar(B);
  buildSlopePlates(B);
  buildPauldron(B);
  buildWings(B);
  buildNeckGuard(B);
}

// ------------------------------------------------------------------ collar ring
// A heavy ring-shaped slope round the neck: narrow at the top, wide at the bottom (outer width ~10.2 m). Low at the
// front under the chin, rising along the sides to wrap the lower half of the helmet. A dark neck ring fills the gap
// between the jaw and the collar. The front is covered by a pentagonal plate with a central ridge, flanked by fine
// vertical grilles; slanted double-row dot-matrix lamps sit in the front slope on both sides.
export const COLLAR = { zc: 0.45 };
const ell = (ax, azf, azb) => (phi) => { const s = Math.sin(phi), c = Math.cos(phi), az = c >= 0 ? azf : azb; return 1 / Math.sqrt((s * s) / (ax * ax) + (c * c) / (az * az)); };
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const cRhoI = ell(2.78, 2.95, 2.9), cRhoO = ell(5.1, 4.0, 3.9);
const cTop = (phi) => { const a = Math.abs(phi); return a <= PI / 2 ? 64.15 + 2.0 * sm(a / (PI / 2)) : 66.15 - 0.5 * sm((a - PI / 2) / (PI / 2)); };
const cBot = (phi) => { const a = Math.abs(phi); return 63.05 + 0.32 * sm(a / (PI / 2)) + 0.05 * sm((a - PI / 2) / (PI / 2)); };
// point on the collar's outer slope: f = 0 at the top rim, 1 at the bottom edge; off = along the surface normal
function collarPt(phi, f, off = 0) {
  const ri = cRhoI(phi), ro = cRhoO(phi), t = cTop(phi), b = cBot(phi);
  const r0 = ri + 0.4, y0 = t - 0.02, r1 = ro - 0.12, y1 = b + 0.34;
  const r = r0 + (r1 - r0) * f, y = y0 + (y1 - y0) * f;
  const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy);
  const nr = -dy / l, ny = dr / l;                    // outward/up normal of the slope in the (r, y) plane
  const s = Math.sin(phi), c = Math.cos(phi);
  const R = r + nr * off;
  return { p: V3(s * R, y + ny * off, COLLAR.zc + c * R), n: V3(s * nr, ny, c * nr).normalize(), down: V3(s * dr / l, dy / l, c * dr / l) };
}

function buildCollar(B) {
  const J = 'chest', ZC = COLLAR.zc, N = 120;
  const ring = (prof) => {
    const rings = [];
    for (let i = 0; i < N; i++) {
      const phi = -PI + 2 * PI * i / N, s = Math.sin(phi), c = Math.cos(phi);
      rings.push(prof(phi).map(([r, y]) => V3(s * r, y, ZC + c * r)));
    }
    return G.loftRings(rings, { closedPath: true });
  };
  // main sloped ring: inner wall, rounded top rim, the long outer slope, rounded bottom edge
  B.add(J, ring((phi) => {
    const ri = cRhoI(phi), ro = cRhoO(phi), t = cTop(phi), b = cBot(phi);
    return [[ri - 0.04, b + 0.25], [ri, t - 0.16], [ri + 0.1, t], [ri + 0.4, t - 0.02], [ro - 0.12, b + 0.34], [ro, b + 0.16], [ro - 0.14, b], [ri + 0.35, b]];
  }), 'paint', PAL.navy);
  // dark lining of the opening
  B.add(J, ring((phi) => { const ri = cRhoI(phi), t = cTop(phi), b = cBot(phi); return [[ri - 0.07, b + 0.3], [ri - 0.03, b + 0.3], [ri - 0.03, t - 0.2], [ri - 0.07, t - 0.2]]; }), 'dark', PAL.black);
  // raised band along the bottom edge (layered look) - stops short of the front cover
  {
    const rings = [], M = 90;
    for (let i = 0; i <= M; i++) {
      const phi = (24 + 312 * i / M) * DEG, s = Math.sin(phi), c = Math.cos(phi);
      const a = collarPt(phi, 0.78, 0.0), b2 = collarPt(phi, 0.97, 0.0);
      const pr = [[0, 0], [0.12, 0.02], [0.12, 1], [0, 1]];
      rings.push(pr.map(([o, t]) => a.p.clone().lerp(b2.p, t).addScaledVector(a.n, o)));
    }
    B.add(J, G.loftRings(rings), 'paint', PAL.navy2);
  }
  // pentagonal cover plate with a central ridge, laid on the front slope under the chin
  {
    const top = collarPt(0, -0.02, 0.0);
    const dn = top.down.clone();                       // down the slope
    const S = (u, v, o) => o.set(u, top.p.y + dn.y * v, top.p.z + dn.z * v - 0.11 * u * u);
    const pent = G.fillet([[-1.28, 0.0], [1.28, 0.0], [1.28, -0.5], [0, -1.3], [-1.28, -0.5]], [0.12, 0.12, 0.15, 0.2, 0.15], 2);
    const w = G.surf((x, y, o) => S(x, -y, o));
    B.add(J, G.plate(pent, { t: 0.36, bevel: 0.1, bseg: 2, tess: 0.3, warp: (v) => { w(v); v.addScaledVector(top.n, 0.12); } }), 'paint', PAL.steel);
    const ridge = G.fillet([[-0.11, -0.1], [0.11, -0.1], [0.11, -1.1], [0, -1.2], [-0.11, -1.1]], 0.04, 1);
    B.add(J, G.plate(ridge, { t: 0.32, bevel: 0.08, bseg: 2, tess: 0.3, warp: (v) => { w(v); v.addScaledVector(top.n, 0.38); } }), 'paint', PAL.steel2);
    const bl = [];
    for (const [u, v] of [[-1.0, 0.18], [1.0, 0.18], [-0.75, 0.62], [0.75, 0.62]]) { const p = V3(); S(u, v, p); p.addScaledVector(top.n, 0.3); bl.push(G.bolt(p, top.n, 0.09)); }
    B.add(J, G.merge(bl), 'metal', PAL.gun);
    B.marker(J, 'collarFront', V3(0, top.p.y - 0.5, top.p.z + 0.8));
  }
  // fine vertical grilles beside the cover plate, and slanted double-row dot-matrix lamps further out
  {
    const recess = [], bars = [], lamps = [], hous = [];
    for (const sd of [1, -1]) {
      // grille: dark recessed panel + thin vertical bars, following the slope
      const phiG = sd * 27 * DEG;
      for (let k = 0; k < 9; k++) {
        const ph = phiG + sd * (k - 4) * 1.55 * DEG;
        const a = collarPt(ph, 0.12, 0.06), b2 = collarPt(ph, 0.62, 0.06);
        bars.push(G.between(G.rbox(0.07, a.p.distanceTo(b2.p), 0.1, 0.02, 1), a.p, b2.p));
      }
      {
        const rings = [];
        for (let i = 0; i <= 12; i++) {
          const ph = phiG + sd * (-6.7 + 13.4 * i / 12) * DEG;
          const a = collarPt(ph, 0.09, 0.0), b2 = collarPt(ph, 0.65, 0.0);
          rings.push([a.p.clone().addScaledVector(a.n, -0.02), b2.p.clone().addScaledVector(b2.n, -0.02), b2.p.clone().addScaledVector(b2.n, 0.03), a.p.clone().addScaledVector(a.n, 0.03)]);
        }
        recess.push(G.loftRings(rings));
      }
      // dot-matrix lamp: 2 rows x 6, the block slanted across the slope
      const phiL = sd * 47 * DEG;
      const c = collarPt(phiL, 0.42, 0.0);
      const tan = V3(Math.cos(phiL), 0, -Math.sin(phiL)).normalize();        // horizontal, round the ring
      const dwn = c.down.clone().addScaledVector(c.n, -c.down.dot(c.n)).normalize();
      const ang = -sd * 28 * DEG;                                           // slant of the block in the slope plane
      const ex = tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(dwn, Math.sin(ang));
      const ey = dwn.clone().multiplyScalar(Math.cos(ang)).addScaledVector(tan, -Math.sin(ang));
      const basis = new THREE.Matrix4().makeBasis(ex, ey.clone().negate(), c.n);
      const put = (g, x, y, z) => { g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z)); g.applyMatrix4(basis); g.translate(c.p.x, c.p.y, c.p.z); return g; };
      hous.push(put(G.rbox(1.55, 0.62, 0.22, 0.08, 2), 0, 0, 0.06));
      for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) lamps.push(put(G.rbox(0.17, 0.15, 0.08, 0.03, 1), -0.6 + k * 0.24, -0.13 + r * 0.26, 0.17));
      B.marker(J, 'collarLamp', c.p.clone().addScaledVector(c.n, 0.45));
    }
    B.add(J, G.merge(recess), 'dark', PAL.black);
    B.add(J, G.merge(bars), 'metal', PAL.gunDark);
    B.add(J, G.merge(hous), 'metal', PAL.gunDark);
    B.add(J, G.merge(lamps), 'lamp', 0xffffff, { vary: 0 });
  }
  // bolts round the lower slope
  {
    const bl = [];
    for (let k = 0; k < 26; k++) {
      const phi = (-180 + (k + 0.5) * 360 / 26) * DEG;
      if (Math.abs(phi) < 58 * DEG) continue;
      const a = collarPt(phi, 0.7, 0.04);
      bl.push(G.bolt(a.p, a.n, 0.1, phi));
    }
    B.add(J, G.merge(bl), 'metal', PAL.gun);
  }
  // dark neck ring between the jaw and the collar (rides on the neck joint, follows the head)
  {
    const rn = (phi) => cRhoI(phi) - 0.32;
    const yn = (phi) => Math.min(cTop(phi) + 0.3, 66.05);
    const nr = [];
    for (let i = 0; i < N; i++) {
      const phi = -PI + 2 * PI * i / N, s = Math.sin(phi), c = Math.cos(phi), r = rn(phi), t = yn(phi);
      nr.push([[r - 0.3, 63.2], [r, 63.2], [r, t - 0.1], [r - 0.08, t], [r - 0.3, t]].map(([rr, y]) => V3(s * rr, y, ZC + c * rr)));
    }
    B.add('neck', G.loftRings(nr, { closedPath: true }), 'rubber', PAL.rubber);
    // ribs on the ring
    const ribs = [];
    for (const dy of [0.28, 0.62]) {
      const rr = [];
      for (let i = 0; i < N; i++) {
        const phi = -PI + 2 * PI * i / N, s = Math.sin(phi), c = Math.cos(phi), r = rn(phi) + 0.02, t = yn(phi) - dy;
        rr.push([[r - 0.05, t - 0.07], [r + 0.04, t - 0.06], [r + 0.04, t + 0.06], [r - 0.05, t + 0.07]].map(([q, y]) => V3(s * q, y, ZC + c * q)));
      }
      ribs.push(G.loftRings(rr, { closedPath: true }));
    }
    B.add('neck', G.merge(ribs), 'metal', PAL.gunDark);
  }
}

// ------------------------------------------------------------------ upper-chest slope plates
// From the collar out to both shoulders: a thick top slab with an inset stadium-shaped recess holding two round holes,
// and a front slope carrying three protruding silver-grey streamlined covers side by side.
function buildSlopePlates(B) {
  const hTop = (x, z) => 64.45 - (x - 4.6) * 0.15 - Math.max(0, z - 0.4) * 0.05;
  // top slab (authored in top view x-z)
  {
    const o = G.fillet([[4.75, -3.6], [8.25, -3.4], [8.35, 1.7], [7.75, 2.4], [4.85, 2.55]], [0.4, 0.5, 0.6, 0.6, 0.4], 3);
    let g = G.plate(o, { t: 0.85, bevel: 0.24, bseg: 3, tess: 0.5 });
    G.warp(g, (v) => { const x = v.x, z = v.y; v.set(x, hTop(x, z) - 0.42 + v.z, z); });
    g = G.fixWinding(G.finish(g, 38));
    B.addSym('chest', g, 'paint', PAL.steel);
    // stadium recess with two round holes
    const st = [];
    for (let i = 0; i <= 12; i++) { const a = -PI / 2 + PI * i / 12; st.push([6.45 + Math.cos(a) * 0.48, -0.5 + 1.0 + Math.sin(a) * 0.48]); }
    for (let i = 0; i <= 12; i++) { const a = PI / 2 + PI * i / 12; st.push([6.45 + Math.cos(a) * 0.48, -0.5 - 1.0 + Math.sin(a) * 0.48]); }
    const rim = G.plate(G.offsetPoly(st, 0.16), { t: 0.14, bevel: 0.05, bseg: 1, holes: [st.slice().reverse()] });
    G.warp(rim, (v) => { const x = v.x, z = v.y; v.set(x, hTop(x, z) + 0.06 + v.z, z); });
    B.addSym('chest', G.fixWinding(G.finish(rim, 38)), 'paint', PAL.steel2);
    const floor = G.plate(st, { t: 0.1, bevel: 0.02, bseg: 1 });
    G.warp(floor, (v) => { const x = v.x, z = v.y; v.set(x, hTop(x, z) - 0.02 + v.z, z); });
    B.addSym('chest', G.fixWinding(G.finish(floor, 38)), 'metal', PAL.gunDark);
    const holes = [];
    for (const dz of [-0.6, 0.6]) holes.push(G.xf(G.cyl(0.34, 0.12, { seg: 24, ch: 0.02 }), { p: [6.45, hTop(6.45, -0.5 + dz) + 0.03, -0.5 + dz] }));
    B.addSym('chest', G.merge(holes), 'dark', PAL.black);
  }
  // front slope with three streamlined covers
  {
    const z0 = 2.25, dirY = -0.6, dirZ = 0.8;
    const S = (x, v, o) => o.set(x, hTop(x, z0) - 0.15 + dirY * v, z0 + dirZ * v - (x - 6.4) * (x - 6.4) * 0.025);
    const o = G.fillet([[4.95, 0.0], [8.15, 0.0], [8.0, -1.55], [5.1, -1.55]], [0.15, 0.2, 0.3, 0.3], 3);
    const w = G.surf((x, y, out) => S(x, -y, out));
    B.addSym('chest', G.plate(o, { t: 0.55, bevel: 0.15, bseg: 2, tess: 0.4, warp: w }), 'paint', PAL.navy);
    const pods = [];
    for (const xc of [5.42, 6.45, 7.48]) {
      // teardrop: blunt rounded nose at the top of the slope, tapering down the slope
      const secs = [];
      const L = 1.18;
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, v = 0.16 + t * L;
        const wv = 0.38 * Math.pow(Math.sin(Math.min(1, t * 2.2) * PI / 2), 0.7) * (1 - 0.8 * t);
        const hv = 0.36 * Math.pow(Math.sin(Math.min(1, t * 2.6) * PI / 2), 0.6) * (1 - 0.5 * t);
        const pts = [];
        for (let k = 0; k < 16; k++) { const a = PI * k / 15; pts.push([Math.cos(a) * Math.max(0.02, wv), Math.sin(a) * Math.max(0.015, hv)]); }
        const base = V3(); S(xc, v, base);
        const nrm = V3(0, dirZ, -dirY).normalize();      // slope normal (up-forward)
        secs.push(pts.map(([a, b]) => base.clone().add(V3(a, 0, 0)).addScaledVector(nrm, 0.2 + b)));
      }
      pods.push(G.loftRings(secs));
    }
    B.addSym('chest', G.merge(pods), 'metal', 0x8c939c);
  }
}

function buildPauldron(B) {
  const jn = 'pauldronL';
  const parts = [];
  // ---- upper shell: thick arched band lofted along z
  const sec = G.fillet([
    [7.55, 64.35], [8.9, 65.3], [10.7, 65.74], [12.4, 65.8], [14.0, 65.58], [15.5, 65.0], [16.38, 63.85], [16.66, 62.4],
    [16.62, 60.45], [16.3, 60.15], [15.45, 60.2], [15.05, 61.3], [14.15, 62.55], [12.5, 63.0], [10.85, 62.55], [10.05, 61.4],
    [9.55, 60.75], [8.9, 61.05], [8.3, 62.0], [7.7, 62.75],
  ], [0.35, 0.6, 1.2, 1.4, 1.4, 1.2, 1.0, 0.5, 0.25, 0.2, 0.2, 0.6, 0.9, 1.2, 0.9, 0.6, 0.3, 0.5, 0.5, 0.3], 3);
  const S = G.resample(sec, 120);
  const zB = -4.55, zF = 4.45;
  let up = G.loft([
    { c: zB, pts: G.offsetPoly(S, -0.22) }, { c: zB + 0.22, pts: S }, { c: zF - 0.26, pts: S }, { c: zF, pts: G.offsetPoly(S, -0.26) },
  ], { axis: 'z' });
  const zfront = (x, y) => 4.45 - (65.8 - y) * 0.36 - (16.8 - x) * 0.06;
  slantFront(up, zB, zF, zfront);
  // gentle bulge of the top surface toward the front/back middle
  G.warp(up, (v) => { const t = (v.z + 0.1) / 4.6; v.y += 0.18 * (1 - t * t) * Math.max(0, (v.y - 63.5) / 2.3); });
  up = G.finish(up, 36);
  B.named.pauldronShellL = B.add(jn, up, 'paint', PAL.navy);
  // front-face and back-face inlay plates (layered) with vent slots
  {
    const inner = G.offsetPoly(S, -0.62);
    const ins = G.resample(G.fillet(inner, 0.25, 2), 90);
    for (const [face, col] of [['front', PAL.steel], ['back', PAL.navy2]]) {
      let g = G.extrude(ins, { t: 0.32, bevel: 0.09, bseg: 2 });
      g = G.tess(g, 0.6);
      if (face === 'front') G.warp(g, (v) => { v.z = zfront(v.x, v.y) + 0.08 + v.z; });
      else G.warp(g, (v) => { v.z = zB - 0.08 - v.z; });
      g = G.fixWinding(G.finish(g, 36));
      const m = B.add(jn, g, 'paint', col);
      if (face === 'front') B.named.pauldronFrontL = m;
    }
    // vent slots on the front inlay (upper band)
    const vs = [];
    for (let i = 0; i < 4; i++) {
      const y = 64.0 + i * 0.36, x0 = 10.4, x1 = 14.8 - i * 0.25;
      const o = [[x0, y - 0.09], [x1, y - 0.09], [x1, y + 0.09], [x0, y + 0.09]];
      let g = G.extrude(o, { t: 0.2, bevel: 0.03, bseg: 1 });
      G.warp(g, (v) => { v.z = zfront(v.x, v.y) + 0.28 + v.z; });
      vs.push(G.finish(g, 30));
    }
    B.add(jn, G.merge(vs), 'dark', PAL.black);
    const bl = [];
    for (const [x, y] of [[8.6, 64.3], [15.6, 63.6], [15.75, 61.0], [9.6, 62.3], [12.5, 64.9]]) bl.push(G.bolt(V3(x, y, zfront(x, y) + 0.27), V3(0, 0.35, 1).normalize(), 0.12));
    B.add(jn, G.merge(bl), 'metal', PAL.gun);
  }
  // top inlay plate (steel) on the top surface
  {
    const o = G.fillet([[8.8, -3.4], [14.6, -3.4], [14.6, 2.6], [8.8, 3.1]], [0.5, 0.9, 0.9, 0.5], 3);
    let g = G.plate(o, { t: 0.3, bevel: 0.09, bseg: 2, tess: 0.45 });
    G.warp(g, (v) => {
      const x = v.x, z = v.y;
      // follow the top arch
      const yTop = topArch(x) + 0.2 + 0.18 * (1 - ((z + 0.1) / 4.6) ** 2);
      v.set(x, yTop + v.z, z);
    });
    g = G.finish(g, 38);
    B.add(jn, g, 'paint', PAL.steel);
  }
  // ---- middle layer: wide side plate flaring outward-down
  {
    const s2 = G.resample(G.fillet([[15.45, 62.25], [16.45, 62.35], [16.05, 57.55], [15.85, 57.3], [15.25, 57.5], [15.0, 61.6]], [0.15, 0.2, 0.3, 0.2, 0.15, 0.2], 3), 48);
    const zb2 = -4.15, zf2 = 3.3;
    let mid = G.loft([
      { c: zb2, pts: G.offsetPoly(s2, -0.16) }, { c: zb2 + 0.16, pts: s2 }, { c: zf2 - 0.18, pts: s2 }, { c: zf2, pts: G.offsetPoly(s2, -0.18) },
    ], { axis: 'z' });
    slantFront(mid, zb2, zf2, (x, y) => 3.3 - (62.2 - y) * 0.42);
    // slight curvature around y axis (wraps toward body front/back)
    G.warp(mid, (v) => { v.x -= (v.z * v.z) * 0.022; });
    mid = G.finish(mid, 38);
    B.named.pauldronSideL = B.add(jn, mid, 'paint', PAL.navy2);
    // horizontal ribs on side plate lower area
    const ribs = [];
    for (let i = 0; i < 3; i++) {
      const y = 58.35 + i * 0.6;
      const r = G.rbox(0.18, 0.22, 5.2, 0.06, 1);
      G.xf(r, { p: [16.1 + (y - 57.55) * 0.083, y, -0.75] });
      ribs.push(r);
    }
    B.add(jn, G.merge(ribs), 'paint', PAL.steel);
  }
  // ---- inner-lower guard (front inner flap): an arched opening on the chest side shows the concentric shoulder axle
  {
    const arc = [];
    for (let i = 0; i <= 16; i++) { const a = 96 * DEG - 192 * DEG * i / 16; arc.push([8.7 + Math.cos(a) * 1.3, 60.85 + Math.sin(a) * 1.3]); }
    const o = G.fillet([[8.95, 59.3], [12.1, 59.0], [12.6, 61.4], [11.9, 62.9], [8.7, 62.5], ...arc], [0.3, 0.4, 0.5, 0.4, 0.2, ...arc.map(() => 0)], 3);
    const w = G.surf((x, y, out) => out.set(x, y, 3.25 - (x - 8.7) * 0.22 + (y - 59) * 0.08));
    B.add(jn, G.plate(o, { t: 0.55, bevel: 0.16, bseg: 2, tess: 0.5, warp: w }), 'paint', PAL.steel);
    B.add(jn, G.plateBolts(o, { inset: 0.32, step: 0.85, z: 0.28, r: 0.1, warpFn: w, filter: (x, y) => Math.hypot(x - 8.7, y - 60.85) > 1.75 }), 'metal', PAL.gun);
    // concentric stepped axle end seen through the arch (axis turned toward the chest and the front)
    const ax = V3(-Math.sin(35 * DEG), 0, Math.cos(35 * DEG)), c = V3(8.95, 60.85, 2.35);
    const steps = [[1.15, 0.0, PAL.gunDark], [0.88, 0.17, PAL.gun], [0.62, 0.34, PAL.gunLight], [0.34, 0.5, PAL.gun], [0.14, 0.62, PAL.gunLight]];
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), ax);
    for (const [r, d, col] of steps) {
      const g = G.cyl(r, 0.2, { seg: 36, ch: 0.04 });
      g.applyQuaternion(q); const p = c.clone().addScaledVector(ax, d); g.translate(p.x, p.y, p.z);
      B.add(jn, g, 'metal', col);
    }
    const back = G.cyl(1.32, 0.3, { seg: 36, ch: 0.04 }); back.applyQuaternion(q); const pb = c.clone().addScaledVector(ax, -0.22); back.translate(pb.x, pb.y, pb.z);
    B.add(jn, back, 'dark', PAL.black);
  }
  // ---- underside cavity (dark) so inside of the shell never shows emptiness
  {
    const s = G.resample(G.fillet([[8.0, 63.6], [15.4, 63.6], [15.4, 60.6], [8.0, 60.6]], 0.6, 3), 40);
    const g = G.loft([{ c: -4.0, pts: s }, { c: 3.0, pts: s }], { axis: 'z' });
    B.add(jn, g, 'metal', PAL.gunDark);
  }
  // ---- searchlight on the top front edge, throwing a cool-white beam obliquely upward
  {
    const tilt = 0.61, ax = V3(0, Math.sin(tilt), Math.cos(tilt)), c = V3(13.2, 66.0, 3.3), R = [PI / 2 - tilt, 0, 0];
    const at = (d) => c.clone().addScaledVector(ax, d);
    const hous = G.merge([
      G.xf(G.cyl(0.55, 0.9, { seg: 20, ch: 0.08 }), { r: R, p: c.toArray() }),
      G.xf(G.rbox(0.9, 0.4, 1.0, 0.1, 2), { p: [c.x, c.y - 0.45, c.z - 0.25] }),
    ]);
    B.add(jn, hous, 'metal', PAL.gunDark);
    B.add(jn, G.xf(G.cyl(0.42, 0.1, { seg: 20, ch: 0.02 }), { r: R, p: at(0.42).toArray() }), 'lamp', 0xffffff, { vary: 0 });
    const bowl = G.lathe([[0.36, -0.2], [0.44, -0.2], [0.5, 0.03], [0.47, 0.06], [0.41, -0.15]], { seg: 24 });
    G.xf(bowl, { r: R, p: at(0.42).toArray() });
    B.add(jn, bowl, 'chrome', 0xe2e4e8, { vary: 0 });
    B.marker(jn, 'pauldronLamp', at(0.6));
    B.marker(jn, 'pauldronBeam', at(10.6));
    const m = (p) => V3(-p.x, p.y, p.z);
    B.marker('pauldronR', 'pauldronLamp', m(at(0.6)));
    B.marker('pauldronR', 'pauldronBeam', m(at(10.6)));
  }
  // ---- horizontal cylindrical bump at the outer top corner (its end defines the shoulder width, 35 m)
  {
    const yc = 64.25, zc = 0.25;
    B.add(jn, G.xf(G.cyl(1.12, 1.6, { seg: 40, ch: 0.16 }), { r: [0, 0, PI / 2], p: [16.62, yc, zc] }), 'paint', PAL.steel);
    B.add(jn, G.xf(G.ring(1.1, 1.19, 0.12, { seg: 40 }), { r: [0, 0, PI / 2], p: [16.22, yc, zc] }), 'metal', PAL.gunDark);
    B.add(jn, G.merge([
      G.xf(G.ring(0.52, 0.84, 0.14, { seg: 36 }), { r: [0, 0, PI / 2], p: [17.44, yc, zc] }),
      G.xf(G.cyl(0.36, 0.16, { seg: 28, ch: 0.04 }), { r: [0, 0, PI / 2], p: [17.42, yc, zc] }),
    ]), 'metal', PAL.gunLight);
  }
  // bolts along the top front & back edges of the upper shell
  {
    const bl = [];
    for (let i = 0; i < 9; i++) {
      const x = 8.4 + i * 0.95;
      const y = topArch(x);
      const zf = zfront(x, y) - 0.55;
      bl.push(G.bolt(V3(x, y + 0.05, zf), V3(0, 1, 0.25).normalize(), 0.12));
      bl.push(G.bolt(V3(x, y + 0.0, -4.0), V3(0, 1, -0.2).normalize(), 0.12));
    }
    B.add(jn, G.merge(bl), 'metal', PAL.gun);
  }
  // mirror everything we added to pauldronL into pauldronR
  for (const m of B.parts.filter(p => p.parent === B.J[jn])) {
    const g = G.mirrorX(m.geometry);
    const r = B.add('pauldronR', g, m.userData.mat, m.userData.color.getHex(), { seed: m.userData.seed + 0.5 });
    if (m === B.named.pauldronShellL) B.named.pauldronShellR = r;
    if (m === B.named.pauldronSideL) B.named.pauldronSideR = r;
    if (m === B.named.pauldronFrontL) B.named.pauldronFrontR = r;
  }
}

// top arch height of the pauldron upper shell at x (approx, for placing details)
export function topArch(x) {
  const pts = [[7.0, 64.4], [8.6, 65.25], [10.6, 65.72], [12.4, 65.8], [14.0, 65.55], [15.6, 64.85], [16.4, 63.7]];
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (x <= pts[i + 1][0]) { const u = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u; }
  }
  return pts[pts.length - 1][1];
}

// ------------------------------------------------------------------ wing plates
// From both sides of the upper-back centre the wings rise up and out: a thick flange arches along the inner part of
// the upper edge, then the wing sinks gently toward its tip (tip above the pauldron top, below the helmet top; tip
// span ~28.5 m, narrower than the shoulders). Small lamps on the outer edge. The roots run in and down to the spine,
// held by horizontal straps.
export const WING = {
  U: [[2.75, 61.9], [3.5, 63.9], [4.5, 65.85], [5.7, 67.5], [7.0, 68.6], [8.6, 69.1], [10.4, 69.0], [12.2, 68.5], [13.7, 67.95], [14.25, 67.75]],
  L: [[1.55, 59.9], [2.6, 60.75], [4.0, 62.6], [5.6, 64.45], [7.4, 65.75], [9.4, 66.35], [11.4, 66.2], [13.3, 65.8], [14.25, 65.55]],
  z: (x, y) => -6.3 - (x - 2) * 0.07 - (y - 62) * 0.05,
};
function polyAt(P, s) {
  // point at fraction s of the polyline length
  const L = []; let tot = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); L.push(l); tot += l; }
  let d = s * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const u = Math.min(1, d / L[i]); return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u]; } d -= L[i]; }
  return P[P.length - 1];
}
function buildWings(B) {
  const { U, L, z: zw } = WING;
  const nW = V3(0.07, 0.05, 1).normalize();          // wing plane normal (toward the body)
  const on = (x, y, o = 0) => V3(x, y, zw(x, y)).addScaledVector(nW, o);
  const w = G.surf((x, y, out) => out.set(x, y, zw(x, y)));
  const outline = G.fillet([...L, ...U.slice().reverse()], [0.3, ...Array(7).fill(1.2), 0.18, 0.18, ...Array(8).fill(1.2), 0.3], 3);
  const parts = { paint: [], steel: [], metal: [], dark: [], gunDark: [], lamp: [] };
  parts.paint.push(G.plate(outline, { t: 0.5, bevel: 0.14, bseg: 2, tess: 0.45, warp: w }));
  // thick rolled flange along the upper edge: full thickness over the arching inner part, thinner toward the tip
  {
    const curve = new THREE.CatmullRomCurve3(U.map(([x, y]) => V3(x, y, 0)), false, 'catmullrom', 0.5);
    const M = 64, rings = [];
    const sec = [];
    for (let k = 0; k < 20; k++) { const a = k / 20 * G.TAU; const c = Math.cos(a), s = Math.sin(a); sec.push([Math.sign(c) * Math.pow(Math.abs(c), 0.45), Math.sign(s) * Math.pow(Math.abs(s), 0.45)]); }
    for (let i = 0; i <= M; i++) {
      const t = i / M, p = curve.getPoint(t), tg = curve.getTangent(t);
      const q = V3(-tg.y, tg.x, 0).normalize();     // in-plane, pointing up/out of the wing
      const thick = 0.95 * (t < 0.55 ? 1 : 1 - 0.35 * (t - 0.55) / 0.45);
      const hw = 0.3, c = on(p.x, p.y).addScaledVector(q, -0.18);
      rings.push(sec.map(([a, b]) => c.clone().addScaledVector(q, a * hw).addScaledVector(nW, b * thick / 2)));
    }
    parts.steel.push(G.loftRings(rings));
  }
  // inlay band along the middle of the wing (both faces) and two transverse seams
  {
    const ui = [], li = [];
    for (let i = 0; i <= 24; i++) { const s = 0.2 + 0.75 * i / 24; const a = polyAt(U, s), b = polyAt(L, s); ui.push([a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3]); li.push([a[0] + (b[0] - a[0]) * 0.78, a[1] + (b[1] - a[1]) * 0.78]); }
    const band = G.fillet([...li, ...ui.slice().reverse()], 0.15, 2);
    for (const sd of [1, -1]) parts.steel.push(G.plate(band, { t: 0.14, bevel: 0.04, bseg: 1, tess: 0.5, warp: (v) => { w(v); v.addScaledVector(nW, sd * 0.3); } }));
    for (const s of [0.46, 0.72]) {
      const a = polyAt(U, s), b = polyAt(L, s);
      for (const sd of [1, -1]) {
        const pa = on(a[0], a[1], sd * 0.27), pb = on(b[0], b[1], sd * 0.27);
        parts.dark.push(G.between(G.rbox(0.09, pa.distanceTo(pb) * 0.86, 0.08, 0.02, 1), pa, pb));
      }
    }
    // bolts along the lower edge, both faces
    for (let i = 0; i < 12; i++) { const s = 0.12 + 0.84 * i / 11; const b = polyAt(L, s), a = polyAt(U, s); const x = b[0] + (a[0] - b[0]) * 0.13, y = b[1] + (a[1] - b[1]) * 0.13; for (const sd of [1, -1]) parts.metal.push(G.bolt(on(x, y, sd * 0.26), nW.clone().multiplyScalar(sd), 0.1)); }
  }
  // small lamps on the outer (tip) edge
  for (const y of [67.2, 66.1]) {
    const p = on(14.25, y);
    parts.gunDark.push(G.xf(G.rbox(0.36, 0.5, 0.62, 0.08, 2), { p: [p.x + 0.12, p.y, p.z] }));
    parts.lamp.push(G.xf(G.rbox(0.1, 0.32, 0.4, 0.04, 1), { p: [p.x + 0.32, p.y, p.z] }));
    B.marker('chest', 'wingLamp', V3(p.x + 0.55, p.y, p.z));
    B.marker('chest', 'wingLamp', V3(-(p.x + 0.55), p.y, p.z));
  }
  // horizontal straps from the root to the spine
  for (let i = 0; i < 3; i++) {
    const y = 60.0 + i * 0.7;
    parts.metal.push(G.xf(G.rbox(2.3, 0.34, 0.5, 0.08, 1), { p: [1.4, y, zw(1.4, y) - 0.05] }));
    parts.metal.push(G.bolt(V3(0.65, y, zw(0.65, y) - 0.33), V3(0, 0, -1), 0.1));
    parts.metal.push(G.bolt(V3(2.15, y, zw(2.15, y) - 0.33), V3(0, 0, -1), 0.1));
  }
  const put = (list, mat, col, opts) => { if (!list.length) return; const g = G.merge(list); B.add('chest', g, mat, col, opts); B.add('chest', G.mirrorX(g), mat, col, opts); };
  put(parts.paint, 'paint', PAL.navy); put(parts.steel, 'paint', PAL.steel); put(parts.metal, 'metal', PAL.gun);
  put(parts.dark, 'dark', PAL.black); put(parts.gunDark, 'metal', PAL.gunDark); put(parts.lamp, 'lamp', 0xffffff, { vary: 0 });
}

// ------------------------------------------------------------------ rear neck guard
// Between the wings: wide at the top, narrow at the bottom, its top edge a shallow arc ~1 m above the helmet - the
// highest armour outline when standing. The face toward the head is concave and divided into blocks; the back carries
// red and white stripes along its central ridge. A round navigation lamp in each top corner: right green, left red
// (from the mech's own point of view).
function buildNeckGuard(B) {
  const J = 'chest';
  const topY = (x) => 71.0 - 0.022 * x * x;
  const xEdge = (y) => 2.5 + (3.78 - 2.5) * (y - 63.4) / (70.42 - 63.4);
  const top = []; for (let i = 0; i <= 12; i++) { const x = 3.45 - 6.9 * i / 12; top.push([x, topY(x)]); }
  const o = G.fillet([[-2.5, 63.4], [2.5, 63.4], [3.78, 70.42], ...top, [-3.78, 70.42]], [0.25, 0.25, 0.42, ...Array(13).fill(0), 0.42], 3);
  const zg = (x, y) => -3.32 + 0.055 * x * x - (y - 64) * 0.045;
  const sw = G.surf((x, y, out) => out.set(x, y, zg(x, y)));
  const T = 0.7;
  B.add(J, G.plate(o, { t: T, bevel: 0.2, bseg: 3, tess: 0.45, warp: sw }), 'paint', PAL.navy);
  // blocks on the concave face toward the head
  {
    const rows = [[63.95, 66.15], [66.35, 68.45], [68.65, 70.25]];
    const cells = { a: [], b: [] };
    rows.forEach(([y0, y1], r) => {
      for (const sd of [1, -1]) {
        const x0 = 0.16, xo0 = xEdge(y0) - 0.32, xo1 = Math.min(xEdge(y1) - 0.32, r === 2 ? 3.2 : 9);
        const y1c = r === 2 ? Math.min(y1, topY(3.0) - 0.3) : y1;
        let q = [[x0, y0], [xo0, y0], [xo1, y1c], [x0, y1c]];
        if (sd < 0) q = q.map(([x, y]) => [-x, y]).reverse();
        const g = G.plate(G.fillet(q, 0.12, 2), { t: 0.16, bevel: 0.05, bseg: 1, tess: 0.5, warp: (v) => { sw(v); v.z += T / 2 + 0.05; } });
        ((r + (sd > 0 ? 0 : 1)) % 2 ? cells.a : cells.b).push(g);
      }
    });
    B.add(J, G.merge(cells.a), 'paint', PAL.steel);
    B.add(J, G.merge(cells.b), 'paint', PAL.navy2);
    B.add(J, G.plateBolts(o, { inset: 0.3, step: 1.1, z: T / 2 + 0.02, r: 0.1, warpFn: sw, filter: (x, y) => y < 69.9 || Math.abs(x) < 2.6 }), 'metal', PAL.gun);
  }
  // back: raised central ridge with red and white stripes
  {
    const back = (dz) => (v) => { sw(v); v.z -= T / 2 + dz; };
    B.add(J, G.plate(G.fillet([[-0.26, 63.7], [0.26, 63.7], [0.26, 70.8], [-0.26, 70.8]], 0.08, 2), { t: 0.3, bevel: 0.08, bseg: 2, tess: 0.5, warp: back(0.12) }), 'paint', PAL.steel);
    B.add(J, G.plate([[-0.1, 63.9], [0.1, 63.9], [0.1, 70.7], [-0.1, 70.7]], { t: 0.08, bevel: 0.02, bseg: 1, tess: 0.5, warp: back(0.29) }), 'paint', PAL.red);
    const wh = [];
    for (const sd of [1, -1]) wh.push(G.plate(sd > 0 ? [[0.36, 64.0], [0.5, 64.0], [0.5, 70.6], [0.36, 70.6]] : [[-0.5, 64.0], [-0.36, 64.0], [-0.36, 70.6], [-0.5, 70.6]], { t: 0.06, bevel: 0.02, bseg: 1, tess: 0.5, warp: back(0.0) }));
    B.add(J, G.merge(wh), 'paint', PAL.white);
  }
  // round navigation lamps in the top corners: mech's right (-x) green, left (+x) red
  for (const sd of [1, -1]) {
    const x = sd * 3.25, y = 70.45, z = zg(x, y);
    B.add(J, G.xf(G.ring(0.2, 0.34, T + 0.24, { seg: 24 }), { r: [PI / 2, 0, 0], p: [x, y, z] }), 'metal', PAL.gunDark);
    B.add(J, G.xf(G.cyl(0.2, T + 0.3, { seg: 20, ch: 0.05 }), { r: [PI / 2, 0, 0], p: [x, y, z] }), sd > 0 ? 'lampRed' : 'lampGreen', 0xffffff, { vary: 0 });
    for (const f of [1, -1]) B.marker(J, sd > 0 ? 'signalRed' : 'signalGreen', V3(x, y, z + f * (T / 2 + 0.35)));
  }
}
