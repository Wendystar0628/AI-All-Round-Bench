// Legs: thigh, knee, shin, ankle, foot. Authored for LEFT leg (x>0), mirrored for right.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

export const LEG = { hx: 4.7, hy: 44.1, ky: 25.2, kz: 0.2, ay: 5.6 };

// thigh outer profile parameters along y
function thighAB(y) {
  // half width (x), half depth (z), centre z offset
  const t = (y - 26) / (44 - 26); // 0 at knee top, 1 at hip
  const a = t > 0.45 ? 3.65 + (t - 0.45) * 0.4 : 2.45 + (t / 0.45) * 1.2;
  const b = t > 0.4 ? 3.35 + (t - 0.4) * 0.5 : 2.45 + (t / 0.4) * 0.9;
  const cz = 0.2 + (t > 0.55 ? (t - 0.55) * 0.9 : 0) - (t < 0.2 ? (0.2 - t) * 1.2 : 0);
  return { a, b, cz };
}

function arcSection(cx, cz, a, b, th0, th1, thick, e = 3.2, n = 20) {
  const outer = [];
  for (let i = 0; i <= n; i++) {
    const t = th0 + (th1 - th0) * i / n, c = Math.cos(t), s = Math.sin(t);
    outer.push([cx + a * Math.sign(c) * Math.abs(c) ** (2 / e), cz + b * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  const inner = outer.map(([x, z]) => [cx + (x - cx) * (1 - thick / a), cz + (z - cz) * (1 - thick / b)]).reverse();
  return G.resample(G.fillet(outer.concat(inner), 0.12, 1), 2 * n + 8);
}

export function buildLegs(B) {
  for (const side of ['L', 'R']) buildLeg(B, side);
}

function buildLeg(B, side) {
  const L = LEG;
  const x0 = L.hx;
  const add = (jn, g, mat = 'paint', col = PAL.navy, o) => {
    if (side === 'L') return B.add(jn + 'L', g, mat, col, o);
    return B.add(jn + 'R', G.mirrorX(g), mat, col, o);
  };
  // ---------------------------------------------------------------- hip ball + thigh core
  add('hip', G.xf(G.cyl(2.6, 4.6, { seg: 32, ch: 0.3 }), { r: [0, 0, PI / 2], p: [x0, L.hy, 0] }), 'metal', PAL.gun);
  add('hip', G.merge([-1.7, -0.6, 0.5, 1.6].map(dx => G.xf(G.ring(2.55, 2.8, 0.34, { seg: 40, ch: 0.06 }), { r: [0, 0, PI / 2], p: [x0 + dx, L.hy, 0] }))), 'metal', PAL.gunLight);
  {
    const secs = [];
    for (const y of [26.4, 30, 36, 41, 44.6]) {
      const { a, b, cz } = thighAB(y);
      secs.push([y, G.resample(G.rrect(a * 1.5, b * 1.55, 0.9, 3, x0, cz), 40)]);
    }
    add('hip', G.taper(secs, { ch: 0.2 }), 'metal', PAL.gunDark, { vary: 0.2 });
  }
  // ---------------------------------------------------------------- outer long shell
  {
    const ys = [27.6, 28.4, 30.5, 33, 36, 39, 41.5, 43.6, 44.6];
    const secs = ys.map((y, i) => {
      const { a, b, cz } = thighAB(y);
      const sec = arcSection(x0, cz, a, b, -128 * DEG, 60 * DEG, 0.72);
      return { c: y, pts: (i === 0 || i === ys.length - 1) ? G.offsetPoly(sec, -0.14) : sec };
    });
    B.named['thigh' + side] = add('hip', G.loft(secs, { axis: 'y' }), 'paint', PAL.navy);
    // inlay on outer face (steel) - long panel
    const o = G.fillet([[-1.3, 30.2], [1.3, 30.2], [1.55, 42.2], [-1.55, 42.2]], [0.4, 0.4, 0.5, 0.5], 3);
    let g = G.extrude(o, { t: 0.32, bevel: 0.1, bseg: 2 }); g = G.tess(g, 0.5);
    G.warp(g, (v) => {
      const u = v.x, y = v.y, w = v.z; const { a, cz } = thighAB(y);
      v.set(x0 + a + 0.12 + w - u * u * 0.05, y, cz - 0.6 + u);
    });
    add('hip', G.fixWinding(G.finish(g, 38)), 'paint', PAL.steel);
    const bl = [];
    for (let k = 0; k < 7; k++) {
      const y = 31 + k * 1.75; const { a, cz } = thighAB(y);
      for (const u of [-1.05, 1.05]) bl.push(G.bolt(V3(x0 + a + 0.3 - u * u * 0.05, y, cz - 0.6 + u), V3(1, 0, 0), 0.11));
    }
    add('hip', G.merge(bl), 'metal', PAL.gun);
  }
  // ---------------------------------------------------------------- thigh details: vents on outer upper shell, hatch at back, bolt rows
  {
    const vents = [];
    for (let i = 0; i < 4; i++) {
      const y = 41.2 - i * 0.55;
      const { a, cz } = thighAB(y);
      vents.push(G.xf(G.rbox(0.35, 0.22, 2.0, 0.06, 1), { p: [x0 + a + 0.12, y, cz + 1.5] }));
    }
    add('hip', G.merge(vents), 'dark', PAL.black);
    const frame = [];
    { const y = 40.4; const { a, cz } = thighAB(y); frame.push(G.xf(G.rbox(0.3, 2.7, 2.6, 0.1, 2), { p: [x0 + a + 0.02, y, cz + 1.5] })); }
    add('hip', G.merge(frame), 'paint', PAL.navy2);
    // back hatch
    const hy = 34.5; const hb = thighAB(hy);
    const hatch = G.xf(G.rbox(2.6, 3.2, 0.36, 0.2, 2), { p: [x0 + 0.2, hy, hb.cz - hb.b - 0.05] });
    add('hip', hatch, 'paint', PAL.steel);
    const hbl = [];
    for (const dx of [-1.0, 1.0]) for (const dy of [-1.3, 1.3]) hbl.push(G.bolt(V3(x0 + 0.2 + dx, hy + dy, hb.cz - hb.b - 0.25), V3(0, 0, -1), 0.1));
    add('hip', G.merge(hbl), 'metal', PAL.gun);
    // bolt row along the outer shell's front edge
    const bl = [];
    for (let k = 0; k < 9; k++) {
      const y = 29.5 + k * 1.6; const { a, b, cz } = thighAB(y);
      const ang = 52 * DEG;
      bl.push(G.bolt(V3(x0 + Math.cos(ang) * a * 1.0 + 0.05, y, cz + Math.sin(ang) * b * 1.0 + 0.05), V3(Math.cos(ang), 0, Math.sin(ang)), 0.1));
    }
    add('hip', G.merge(bl), 'metal', PAL.gun);
  }
  // ---------------------------------------------------------------- inner-back wrap plate
  {
    const ys = [27.0, 27.8, 30, 34, 38, 41.5, 43.8, 44.6];
    const secs = ys.map((y, i) => {
      const { a, b, cz } = thighAB(y);
      const sec = arcSection(x0, cz, a * 0.97, b * 0.98, 118 * DEG, 236 * DEG, 0.7);
      return { c: y, pts: (i === 0 || i === ys.length - 1) ? G.offsetPoly(sec, -0.13) : sec };
    });
    add('hip', G.loft(secs, { axis: 'y' }), 'paint', PAL.navy2);
  }
  // ---------------------------------------------------------------- front narrow plate in longitudinal groove
  {
    // groove bottom (dark)
    const gs = [28.2, 43.5].map(y => {
      const { b, cz } = thighAB(y);
      return [y, G.resample(G.rrect(2.2, 0.6, 0.15, 2, x0, cz + b - 0.55), 24)];
    });
    add('hip', G.taper(gs, { ch: 0.1 }), 'dark', PAL.black);
    const ys = [28.9, 29.5, 33, 37, 40.5, 41.8];
    const secs = ys.map((y, i) => {
      const { a, b, cz } = thighAB(y);
      const sec = arcSection(x0, cz, a * 0.98, b + 0.1, 66 * DEG, 114 * DEG, 0.62, 3.2, 10);
      return { c: y, pts: (i === 0 || i === ys.length - 1) ? G.offsetPoly(sec, -0.12) : sec };
    });
    B.named['thighFront' + side] = add('hip', G.loft(secs, { axis: 'y' }), 'paint', PAL.steel);
    // short parallel rods exposed at top of front plate
    const rods = [];
    for (let i = 0; i < 4; i++) {
      const xx = x0 - 0.75 + i * 0.5; const { b, cz } = thighAB(42.6);
      rods.push(G.xf(G.cyl(0.15, 2.0, { seg: 10, ch: 0.03 }), { p: [xx, 42.75, cz + b - 0.15] }));
    }
    add('hip', G.merge(rods), 'chrome', 0xd0d3d8);
    const rr = [];
    for (let i = 0; i < 4; i++) { const xx = x0 - 0.75 + i * 0.5; const { b, cz } = thighAB(41.9); rr.push(G.xf(G.ring(0.14, 0.26, 0.3, { seg: 12 }), { p: [xx, 41.95, cz + b - 0.15] })); }
    add('hip', G.merge(rr), 'metal', PAL.gunLight);
    { const { b, cz } = thighAB(43.9); const p = [x0, 43.95, cz + b + 0.1];
      add('hip', G.xf(G.rbox(1.5, 0.55, 0.5, 0.12, 2), { p }), 'metal', PAL.gunDark);
      add('hip', G.xf(G.rbox(1.15, 0.3, 0.12, 0.05, 1), { p: [p[0], p[1], p[2] + 0.27] }), 'lamp', 0xffffff, { vary: 0 });
      B.marker('hip' + side, 'thighLamp', V3((side === 'L' ? 1 : -1) * p[0], p[1], p[2] + 0.55)); }
  }
  // ---------------------------------------------------------------- knee: wide deep joint cavity, axle, side discs (outer one with a green ring-light segment)
  {
    const ky = L.ky, kz = L.kz;
    add('knee', G.xf(G.cyl(1.25, 5.4, { seg: 28, ch: 0.1 }), { r: [0, 0, PI / 2], p: [x0, ky, kz] }), 'metal', PAL.gunDark);
    // dark cavity block behind the axle (reads as the deep joint opening)
    add('knee', G.xf(G.rbox(4.4, 2.6, 3.6, 0.3, 2), { p: [x0, ky + 0.2, kz - 0.4] }), 'metal', PAL.black);
    for (const s of [1, -1]) {
      const xc = x0 + s * 2.55;
      const disc = G.lathe([[0.01, 0.62], [0.55, 0.6], [0.7, 0.48], [0.78, 0.3], [0.95, 0.28], [1.02, 0.36], [1.2, 0.38], [1.25, 0.32], [1.25, -0.3], [0.01, -0.3]], { seg: 40 });
      G.xf(disc, { r: [0, 0, -s * PI / 2], p: [xc, ky, kz] });
      add('knee', disc, 'metal', PAL.gun);
      add('knee', G.xf(G.ring(1.28, 1.6, 0.55, { seg: 44, ch: 0.08 }), { r: [0, 0, PI / 2], p: [xc + s * 0.05, ky, kz] }), 'metal', PAL.gunDark);
      if (s > 0) {
        // short arc of green ring light on the outer disc (upper front)
        const arcL = G.lathe([[1.33, -0.05], [1.55, -0.05], [1.55, 0.06], [1.33, 0.06]], { seg: 14, phi0: -82 * DEG, phiLen: 62 * DEG });
        G.xf(arcL, { r: [0, 0, -PI / 2], p: [xc + 0.31, ky, kz] });
        add('knee', arcL, 'lampGreen', 0xffffff, { vary: 0 });
        const am = -51 * DEG, rr = 1.44;
        B.marker('knee' + side, 'kneeGreen', V3((side === 'L' ? 1 : -1) * (xc + 0.5), ky - Math.sin(am) * rr, kz + Math.cos(am) * rr));
      }
      // small round axle end below-behind
      add('knee', G.merge([
        G.xf(G.cyl(0.62, 0.5, { seg: 24, ch: 0.08 }), { r: [0, 0, PI / 2], p: [xc - s * 0.1, ky - 1.85, kz - 1.75] }),
        G.xf(G.cyl(0.3, 0.6, { seg: 16, ch: 0.05 }), { r: [0, 0, PI / 2], p: [xc + s * 0.05, ky - 1.85, kz - 1.75] }),
      ]), 'metal', PAL.gunLight);
    }
    // knee front guard (on shin upper end): wide top opening, bevelled lower edge
    const o = G.fillet([[-2.2, -1.3], [2.2, -1.3], [2.75, 1.6], [2.4, 2.15], [-2.4, 2.15], [-2.75, 1.6]], [0.5, 0.5, 0.35, 0.3, 0.3, 0.35], 3);
    let g = G.extrude(o, { t: 0.75, bevel: 0.22, bseg: 3 }); g = G.tess(g, 0.45);
    G.warp(g, (v) => {
      const u = v.x, yy = v.y, w = v.z;
      const R = 3.6, a = u / R;
      const fold = yy < 0 ? yy * 0.55 : 0;
      v.set(x0 + R * Math.sin(a), ky + yy * 0.95 - 0.1, kz + 2.65 + (R * Math.cos(a) - R) + w + fold + (yy > 0 ? yy * 0.15 : 0));
    });
    add('knee', G.fixWinding(G.finish(g, 38)), 'paint', PAL.steel);
  }
  // ---------------------------------------------------------------- shin
  {
    const shinAB = (y) => {
      const t = (y - 6) / (24.5 - 6);
      const a = t > 0.66 ? 3.62 - (t - 0.66) * 2.2 : 2.1 + Math.pow(t / 0.66, 1.25) * 1.52;
      const b = t > 0.66 ? 3.3 - (t - 0.66) * 1.6 : 2.1 + Math.pow(t / 0.66, 1.8) * 1.2;
      return { a, b, cz: 0.15 + t * 0.2 };
    };
    // core
    const cs = [6.4, 12, 18.5, 23.2, 24.6].map(y => { const { a, b, cz } = shinAB(y); return [y, G.resample(G.rrect(a * 1.6, b * 1.6, 0.8, 3, x0, cz), 40)]; });
    add('knee', G.taper(cs, { ch: 0.2 }), 'metal', PAL.gunDark, { vary: 0.2 });
    // outer & inner side folded plates wrapping to back (leave groove at back)
    for (const s of [1, -1]) {
      const ys = [6.6, 7.2, 10, 14, 18.5, 21.5, 23.4, 24.1];
      const th0 = s > 0 ? -70 * DEG : 110 * DEG, th1 = s > 0 ? 62 * DEG : 250 * DEG;
      const secs = ys.map((y, i) => {
        const { a, b, cz } = shinAB(y);
        const sec = arcSection(x0, cz, a, b, th0, th1, 0.7, 2.6, 16);
        return { c: y, pts: (i === 0 || i === ys.length - 1) ? G.offsetPoly(sec, -0.13) : sec };
      });
      const sm = add('knee', G.loft(secs, { axis: 'y' }), 'paint', s > 0 ? PAL.navy : PAL.navy2);
      if (s > 0) B.named['shinOuter' + side] = sm;
    }
    // outer side rib + access panel
    {
      const { a, cz } = { a: 3.2, cz: 0.3 };
      const rib = G.taper([
        [9.0, G.resample(G.rrect(0.42, 0.9, 0.15, 2, x0 + 2.55, 0.35), 16)],
        [21.5, G.resample(G.rrect(0.42, 0.9, 0.15, 2, x0 + 3.55, 0.45), 16)],
      ], { ch: 0.12 });
      add('knee', rib, 'paint', PAL.steel);
      const pnl = G.xf(G.rbox(0.3, 2.4, 1.8, 0.12, 2), { p: [x0 + 3.45, 18.6, -1.25], r: [0, 0, -0.07] });
      add('knee', pnl, 'paint', PAL.navy2);
      const pb = [];
      for (const dz of [-0.6, 0.6]) for (const dy of [-0.9, 0.9]) pb.push(G.bolt(V3(x0 + 3.62, 18.6 + dy, -1.25 + dz), V3(1, 0, 0), 0.09));
      add('knee', G.merge(pb), 'metal', PAL.gun);
      void a; void cz;
    }
    // front upper short folded armour (protrudes forward)
    {
      const o = G.fillet([[-2.1, 17.6], [2.1, 17.6], [2.6, 22.4], [2.0, 23.5], [-2.0, 23.5], [-2.6, 22.4]], [0.4, 0.4, 0.4, 0.4, 0.4, 0.4], 3);
      let g = G.extrude(o, { t: 0.85, bevel: 0.24, bseg: 3 }); g = G.tess(g, 0.45);
      G.warp(g, (v) => {
        const u = v.x, y = v.y, w = v.z;
        const { b, cz } = shinAB(y);
        // folded: centre ridge (V) + forward protrusion peaking at y~20
        const ridge = -G.sabs(u, 0.5) * 0.42;
        const bump = 0.65 * Math.exp(-(((y - 20.5) / 2.6) ** 2));
        v.set(x0 + u, y, cz + b + 0.35 + ridge + bump + w);
      });
      add('knee', G.fixWinding(G.finish(g, 38)), 'paint', PAL.navy);
    }
    // long shin plate narrowing to ankle
    {
      const o = G.fillet([[-1.35, 6.7], [1.35, 6.7], [2.05, 17.1], [-2.05, 17.1]], [0.3, 0.3, 0.3, 0.3], 3);
      let g = G.extrude(o, { t: 0.7, bevel: 0.2, bseg: 3 }); g = G.tess(g, 0.45);
      G.warp(g, (v) => {
        const u = v.x, y = v.y, w = v.z; const { b, cz } = shinAB(y);
        v.set(x0 + u, y, cz + b + 0.22 - G.sabs(u, 0.45) * 0.3 + w);
      });
      add('knee', G.fixWinding(G.finish(g, 38)), 'paint', PAL.navy2);
      const bl = [];
      for (let k = 0; k < 5; k++) { const y = 8 + k * 2.1; const { b, cz } = shinAB(y); for (const u of [-0.9, 0.9]) bl.push(G.bolt(V3(x0 + u, y, cz + b + 0.5 - Math.abs(u) * 0.3), V3(u * 0.3, 0, 1).normalize(), 0.1)); }
      add('knee', G.merge(bl), 'metal', PAL.gun);
    }
    // back: paired vertical hydraulic columns flanking a double vertical grille; rear drum with a dark-gold inner
    // ring at the top of the calf; a slanted wedge armour pushes out the lower rear outline
    {
      const zBack = (y) => { const { b, cz } = shinAB(y); return cz - b; };
      const parts = [], chrome = [], dark = [], louv = [];
      for (const dx of [-1.15, 1.15]) {
        const z = zBack(17) - 0.12;
        parts.push(G.xf(G.cyl(0.46, 4.0, { seg: 18, ch: 0.06 }), { p: [x0 + dx, 19.6, z] }));
        chrome.push(G.xf(G.cyl(0.22, 2.6, { seg: 12, ch: 0.03 }), { p: [x0 + dx, 16.9, z] }));
        parts.push(G.xf(G.cyl(0.36, 0.8, { seg: 14, ch: 0.05 }), { r: [0, 0, PI / 2], p: [x0 + dx, 15.7, z] }));
        for (let k = 0; k < 3; k++) parts.push(G.xf(G.ring(0.44, 0.57, 0.22, { seg: 18 }), { p: [x0 + dx, 18.1 + k * 1.2, z] }));
      }
      for (const dx of [-0.36, 0.36]) {
        dark.push(G.xf(G.rbox(0.52, 5.3, 0.3, 0.14, 2), { p: [x0 + dx, 18.85, zBack(17) + 0.1] }));
        for (let k = 0; k < 9; k++) { const y = 16.55 + k * 0.56; louv.push(G.xf(G.rbox(0.44, 0.09, 0.22, 0.03, 1), { r: [-0.6, 0, 0], p: [x0 + dx, y, zBack(17) - 0.06] })); }
      }
      dark.push(G.xf(G.rbox(1.9, 5.9, 0.25, 0.1, 1), { p: [x0, 18.85, zBack(17) + 0.25] }));
      add('knee', G.merge(parts), 'metal', PAL.gun);
      add('knee', G.merge(chrome), 'chrome', 0xd0d3d8);
      add('knee', G.merge(dark), 'dark', PAL.black);
      add('knee', G.merge(louv), 'metal', PAL.gunLight);
      // rear-facing drum at the top of the calf
      const zt = zBack(22.2);
      add('knee', G.xf(G.cyl(1.3, 0.85, { seg: 40, ch: 0.12 }), { r: [PI / 2, 0, 0], p: [x0, 22.2, zt - 0.2] }), 'metal', PAL.gun);
      add('knee', G.xf(G.ring(0.55, 0.98, 0.2, { seg: 36 }), { r: [PI / 2, 0, 0], p: [x0, 22.2, zt - 0.64] }), 'metal', 0x5a4420);
      add('knee', G.xf(G.cyl(0.42, 0.34, { seg: 24, ch: 0.05 }), { r: [PI / 2, 0, 0], p: [x0, 22.2, zt - 0.7] }), 'metal', PAL.gunDark);
      // lower axle end
      add('knee', G.xf(G.cyl(0.5, 2.6, { seg: 20, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0, 7.4, zBack(7.4) + 0.4] }), 'metal', PAL.gunLight);
      // slanted wedge armour at the lower rear
      const o = G.fillet([[zBack(15.9) + 0.35, 15.9], [zBack(12.3) - 1.55, 12.3], [zBack(11.0) - 1.3, 11.05], [zBack(11.0) + 0.35, 11.05]], [0.3, 0.4, 0.3, 0.2], 2);
      let g = G.extrude(o, { t: 2.7, bevel: 0.22, bseg: 2 }); g = G.tess(g, 0.5);
      G.warp(g, (v) => { const z = v.x, y = v.y, w = v.z; v.set(x0 + w, y, z); });
      add('knee', G.fixWinding(G.finish(g, 38)), 'paint', PAL.navy);
    }
    // clear horizontal seam between the upper folded armour and the long shin plate
    { const { b, cz } = shinAB(17.35); add('knee', G.xf(G.rbox(4.3, 0.24, 0.6, 0.06, 1), { p: [x0, 17.35, cz + b + 0.2] }), 'dark', PAL.black); }
  }
  // ---------------------------------------------------------------- ankle + foot
  {
    const ay = L.ay;
    add('ankle', G.xf(G.cyl(1.25, 5.2, { seg: 24, ch: 0.1 }), { r: [0, 0, PI / 2], p: [x0, ay, 0] }), 'metal', PAL.gunDark);
    for (const s of [1, -1]) {
      const xc = x0 + s * 2.4;
      // main axle disc; dark-gold radial ribs in its inner ring
      const disc = G.lathe([[0.01, 0.4], [0.35, 0.4], [0.45, 0.28], [0.9, 0.25], [1.05, 0.36], [1.35, 0.36], [1.42, 0.25], [1.42, -0.2], [0.01, -0.2]], { seg: 36 });
      G.xf(disc, { r: [0, 0, -s * PI / 2], p: [xc, ay, 0] });
      add('ankle', disc, 'metal', PAL.gun);
      const ribs = [];
      for (let k = 0; k < 10; k++) { const a = k / 10 * G.TAU; ribs.push(G.xf(G.rbox(0.12, 0.42, 0.1, 0.03, 1), { r: [a, 0, 0], p: [xc + s * 0.3, ay + Math.cos(a) * 0.68, Math.sin(a) * 0.68] })); }
      add('ankle', G.merge(ribs), 'metal', 0x5a4420);
      // smaller secondary disc below
      const d2 = G.lathe([[0.01, 0.3], [0.3, 0.3], [0.38, 0.2], [0.75, 0.18], [0.8, 0.1], [0.8, -0.18], [0.01, -0.18]], { seg: 28 });
      G.xf(d2, { r: [0, 0, -s * PI / 2], p: [xc - s * 0.05, ay - 1.85, 0.55] });
      add('ankle', d2, 'metal', PAL.gunLight);
      // upper guard piece around the main disc
      add('ankle', G.xf(G.rbox(0.6, 1.1, 3.4, 0.2, 2), { p: [xc + s * 0.05, ay + 1.9, -0.1] }), 'paint', PAL.navy2);
    }
    // rear grooved roller (transverse) at the back of the ankle
    add('ankle', G.xf(G.cyl(0.78, 4.0, { seg: 28, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0, ay - 1.3, -2.25] }), 'metal', PAL.gun);
    add('ankle', G.merge([-1.45, -0.72, 0, 0.72, 1.45].map(dx => G.xf(G.ring(0.7, 0.86, 0.22, { seg: 28 }), { r: [0, 0, PI / 2], p: [x0 + dx, ay - 1.3, -2.25] }))), 'metal', PAL.gunDark);
    // front guard: slopes from front of ankle down to instep
    {
      const o = G.fillet([[-2.0, 0], [2.0, 0], [1.6, 3.6], [-1.6, 3.6]], [0.3, 0.3, 0.3, 0.3], 3);
      let g = G.extrude(o, { t: 0.6, bevel: 0.18, bseg: 2 }); g = G.tess(g, 0.5);
      G.warp(g, (v) => { const u = v.x, t = v.y, w = v.z; v.set(x0 + u, ay + 0.6 - t * 0.55 + w * 0.55, 1.6 + t * 0.85 + w * 0.6 - u * u * 0.05); });
      add('ankle', G.fixWinding(G.finish(g, 38)), 'paint', PAL.steel);
    }
    // rear guard above the roller + heel block
    add('ankle', G.xf(G.rbox(4.3, 1.6, 0.8, 0.3, 2), { p: [x0, ay + 0.6, -2.35], r: [0.3, 0, 0] }), 'paint', PAL.navy);
    add('ankle', G.xf(G.rbox(4.0, 2.0, 2.6, 0.4, 3), { p: [x0, 1.05, -2.95] }), 'paint', PAL.navy2);
    // forefoot: wide front, narrower heel; low stabiliser pads along both lower edges
    {
      const plan = G.fillet([[-2.3, -1.2], [2.3, -1.2], [3.5, 6.0], [3.0, 10.0], [-3.0, 10.0], [-3.5, 6.0]], [0.4, 0.4, 0.8, 0.6, 0.6, 0.8], 3);
      add('ankle', G.prism(plan.map(([x, z]) => [x + x0, z]), 0, 1.5, { axis: 'y', ch: 0.15 }), 'metal', PAL.gunDark);
      const o = G.fillet([[-2.6, 0], [2.6, 0], [3.3, 6.2], [-3.3, 6.2]], [0.3, 0.3, 0.5, 0.5], 3);
      let g = G.extrude(o, { t: 0.9, bevel: 0.25, bseg: 3 }); g = G.tess(g, 0.5);
      G.warp(g, (v) => { const u = v.x, t = v.y, w = v.z; v.set(x0 + u, 4.2 - t * 0.42 + w - u * u * 0.03, 0.9 + t); });
      add('ankle', G.fixWinding(G.finish(g, 38)), 'paint', PAL.navy);
      const toe = G.fillet([[-3.35, 0], [3.35, 0], [2.95, 2.6], [-2.95, 2.6]], [0.3, 0.3, 0.5, 0.5], 3);
      let tg = G.extrude(toe, { t: 0.8, bevel: 0.24, bseg: 3 }); tg = G.tess(tg, 0.5);
      G.warp(tg, (v) => { const u = v.x, t = v.y, w = v.z; v.set(x0 + u, 1.75 - t * 0.12 + w, 7.3 + t); });
      add('ankle', G.fixWinding(G.finish(tg, 38)), 'paint', PAL.steel);
      add('ankle', G.xf(G.rbox(4.2, 0.6, 2.8, 0.2, 2), { p: [x0, 2.3, -2.95] }), 'paint', PAL.steel);
      for (const s of [1, -1]) {
        const pad = G.fillet([[s * 3.0, -0.6], [s * 4.2, 0.2], [s * 4.2, 7.4], [s * 3.4, 8.6]], [0.2, 0.5, 0.5, 0.2], 2);
        add('ankle', G.prism(pad.map(([x, z]) => [x + x0, z]), 0, 0.85, { axis: 'y', ch: 0.18 }), 'paint', PAL.navy2);
        add('ankle', G.merge([1.2, 3.4, 5.6].map(z => G.bolt(V3(x0 + s * 3.95, 0.86, z), V3(0, 1, 0), 0.12))), 'metal', PAL.gun);
      }
    }
  }
}
