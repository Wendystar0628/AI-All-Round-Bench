// Arms and hands. Authored for the LEFT arm (x>0) in rest-world coords; mirrored for the right.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

export const ARM = {
  sx: 12.5, sy: 60.2, sz: -0.2, ey: 47.6, wy: 35.7, palmTop: 35.0, palmBot: 32.3,
  fingerZ: [1.42, 0.47, -0.47, -1.42], seg: [1.35, 1.05, 0.9], gap: 0.1,
};

// helpers to place left-arm geometry and mirror it
function addArm(B, side, jn, geo, mat, color, opts) {
  // side: 'L' or 'R'; geometry authored for L
  if (side === 'L') return B.add(jn + 'L', geo, mat, color, opts);
  return B.add(jn + 'R', G.mirrorX(geo), mat, color, opts);
}

export function armJoints(B) {
  const A = ARM;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    // fingers
    A.fingerZ.forEach((fz, k) => {
      let y = A.palmBot;
      const z = A.sz + fz;
      B.joint(`f${side}${k}a`, `wrist${side}`, V3(s * A.sx, y, z));
      y -= A.seg[0] + A.gap;
      B.joint(`f${side}${k}b`, `f${side}${k}a`, V3(s * A.sx, y, z));
      y -= A.seg[1] + A.gap;
      B.joint(`f${side}${k}c`, `f${side}${k}b`, V3(s * A.sx, y, z));
    });
    // thumb: base at front side of palm
    B.joint(`t${side}a`, `wrist${side}`, V3(s * (A.sx - 0.15), 33.9, A.sz + 2.05));
    B.joint(`t${side}b`, `t${side}a`, V3(s * (A.sx - 0.15), 32.45, A.sz + 2.55));
  }
}

export function buildArms(B) {
  for (const side of ['L', 'R']) buildArm(B, side);
}

function buildArm(B, side) {
  const A = ARM;
  const x0 = A.sx, z0 = A.sz;
  const add = (jn, g, mat = 'paint', col = PAL.navy, o) => addArm(B, side, jn, g, mat, col, o);

  // ---------------------------------------------------------------- shoulder drum (static on chest) + yoke
  {
    const drum = G.merge([
      G.xf(G.cyl(2.15, 4.2, { seg: 36, ch: 0.2 }), { r: [0, 0, PI / 2], p: [x0 - 0.9, A.sy, z0] }),
      // concentric stepped end cap on the chest side
      G.xf(G.cyl(2.3, 0.35, { seg: 40, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0 - 3.05, A.sy, z0] }),
      G.xf(G.cyl(1.75, 0.35, { seg: 36, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0 - 3.35, A.sy, z0] }),
      G.xf(G.cyl(1.2, 0.35, { seg: 32, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0 - 3.62, A.sy, z0] }),
      G.xf(G.cyl(0.6, 0.35, { seg: 24, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0 - 3.88, A.sy, z0] }),
    ]);
    B.add('chest', side === 'L' ? drum : G.mirrorX(drum), 'metal', PAL.gun);
    const ringsY = G.merge([
      G.xf(G.ring(2.05, 2.36, 0.25, { seg: 40 }), { r: [0, 0, PI / 2], p: [x0 - 2.75, A.sy, z0] }),
    ]);
    B.add('chest', side === 'L' ? ringsY : G.mirrorX(ringsY), 'metal', PAL.gunDark);
    // yoke: upper arm top block wrapping the drum (rotates with shoulder)
    const yoke = G.merge([
      G.xf(G.rbox(4.6, 4.2, 4.6, 0.5, 3), { p: [x0 + 0.2, A.sy - 1.6, z0] }),
      G.xf(G.cyl(2.45, 1.1, { seg: 36, ch: 0.15 }), { r: [0, 0, PI / 2], p: [x0 + 2.1, A.sy, z0] }),
    ]);
    add('shoulder', yoke, 'metal', PAL.gun);
  }

  // ---------------------------------------------------------------- upper arm
  {
    const cy0 = 58.6, cy1 = 48.6;
    // core
    const core = G.taper([
      [cy1, G.resample(G.rrect(3.4, 3.4, 0.9, 3, x0, z0), 40)],
      [cy0, G.resample(G.rrect(3.9, 3.9, 1.0, 3, x0, z0), 40)],
    ], { ch: 0.2 });
    add('shoulder', core, 'metal', PAL.gunDark, { vary: 0.2 });
    // outer short arc shells with flat faces (C-shaped octagonal bands, open toward body)
    const band = (hw, hd, th, cx) => {
      // octagon-ish arc from -150deg to 150deg (open at inner side)
      const outer = [];
      const n = 11;
      for (let i = 0; i <= n; i++) {
        const a = -145 * DEG + i / n * 290 * DEG;
        // flattened faces: use superellipse exponent 6
        const c = Math.cos(a), s = Math.sin(a);
        outer.push([cx + hw * Math.sign(c) * Math.abs(c) ** (2 / 5), z0 + hd * Math.sign(s) * Math.abs(s) ** (2 / 5)]);
      }
      const inner = outer.map(([x, z]) => [cx + (x - cx) * (1 - th / hw), z0 + (z - z0) * (1 - th / hd)]).reverse();
      return G.resample(outer.concat(inner), 64);
    };
    const shells = [
      { y0: 55.2, y1: 58.7, hw: 2.45, hd: 2.42, slant: 0 },
      { y0: 51.85, y1: 55.0, hw: 2.36, hd: 2.33, slant: 0 },
      { y0: 49.2, y1: 51.65, hw: 2.28, hd: 2.25, slant: 0.32 },
    ];
    shells.forEach((s, i) => {
      const sec = band(s.hw, s.hd, 0.5, x0 + 0.08);
      let g = G.loft([
        { c: s.y0, pts: G.offsetPoly(sec, -0.12) }, { c: s.y0 + 0.14, pts: sec }, { c: s.y1 - 0.14, pts: sec }, { c: s.y1, pts: G.offsetPoly(sec, -0.12) },
      ], { axis: 'y' });
      if (s.slant) {
        // oblique cut near the elbow: bottom edge lower at back, higher at front
        G.warp(g, (v) => { if (v.y < s.y0 + 0.5) v.y += (v.z - z0) * s.slant * ((s.y0 + 0.5 - v.y) / 0.5 + 0.3) * 0.5; });
        g = G.finish(g, 38);
      }
      add('shoulder', g, 'paint', i === 1 ? PAL.navy2 : PAL.navy, { seed: 0.13 + i * 0.29 + (side === 'L' ? 0 : 0.5) });
    });
    // flat face inlay plates on the outer side
    for (let i = 0; i < 2; i++) {
      const y0 = i === 0 ? 55.6 : 52.25, y1 = i === 0 ? 58.2 : 54.55;
      const o = G.fillet([[-1.3, y0], [1.3, y0], [1.3, y1], [-1.3, y1]], 0.25, 2);
      let g = G.plate(o, { t: 0.25, bevel: 0.07, bseg: 1 });
      G.warp(g, (v) => { const u = v.x, y = v.y, w = v.z; v.set(x0 + 2.55 + w, y, z0 + u); });
      g = G.fixWinding(G.finish(g, 38));
      add('shoulder', g, 'paint', PAL.steel);
      const bl = [];
      for (const u of [-1.0, 1.0]) for (const yy of [y0 + 0.35, y1 - 0.35]) bl.push(G.bolt(V3(x0 + 2.7, yy, z0 + u), V3(1, 0, 0), 0.1));
      add('shoulder', G.merge(bl), 'metal', PAL.gun);
    }
    // proximity lamp set into the front of the upper arm
    {
      const p = [x0 + 0.1, 56.95, z0 + 2.5];
      add('shoulder', G.xf(G.rbox(1.25, 0.6, 0.45, 0.12, 2), { p }), 'metal', PAL.gunDark);
      add('shoulder', G.xf(G.rbox(0.95, 0.32, 0.12, 0.05, 1), { p: [p[0], p[1], p[2] + 0.25] }), 'lamp', 0xffffff, { vary: 0 });
      B.marker('shoulder' + side, 'armLamp', V3((side === 'L' ? 1 : -1) * p[0], p[1], p[2] + 0.6));
    }
    // rear short sleeve (ends above elbow)
    const sleeve = G.merge([
      G.xf(G.cyl(0.95, 4.6, { seg: 24, ch: 0.12 }), { p: [x0, 54.3, z0 - 2.55] }),
      G.xf(G.ring(0.9, 1.08, 0.3, { seg: 24 }), { p: [x0, 52.2, z0 - 2.55] }),
    ]);
    add('shoulder', sleeve, 'metal', PAL.gun);
    // inner face plate (toward torso) with bolts
    {
      const o = G.fillet([[-1.5, 49.6], [1.5, 49.6], [1.6, 57.8], [-1.6, 57.8]], 0.3, 2);
      let g = G.plate(o, { t: 0.4, bevel: 0.1, bseg: 2 });
      G.warp(g, (v) => { const u = v.x, y = v.y, w = v.z; v.set(x0 - 1.85 - w, y, z0 + u); });
      g = G.fixWinding(G.finish(g, 38));
      add('shoulder', g, 'metal', PAL.gun);
      const bl = [];
      for (let k = 0; k < 6; k++) for (const u of [-1.1, 1.1]) bl.push(G.bolt(V3(x0 - 2.05, 50.3 + k * 1.4, z0 + u), V3(-1, 0, 0), 0.1));
      add('shoulder', G.merge(bl), 'metal', PAL.gunLight);
    }
  }

  // ---------------------------------------------------------------- elbow: axle, covers
  {
    const axle = G.xf(G.cyl(1.05, 6.6, { seg: 28, ch: 0.1 }), { r: [0, 0, PI / 2], p: [x0, A.ey, z0] });
    add('shoulder', axle, 'metal', PAL.gunDark);
    // lower end lug of upper arm (between forearm yoke plates)
    const lug = G.merge([
      G.xf(G.cyl(1.75, 3.6, { seg: 32, ch: 0.15 }), { r: [0, 0, PI / 2], p: [x0, A.ey, z0] }),
      G.xf(G.rbox(3.5, 1.8, 3.4, 0.3, 2), { p: [x0, A.ey + 0.9, z0] }),
    ]);
    add('shoulder', lug, 'metal', PAL.gun);
  }

  // ---------------------------------------------------------------- forearm (elbow joint)
  {
    const fy0 = A.wy + 0.1, fy1 = A.ey - 0.5;
    // trapezoid-ish section: wide front face + two slanted sides
    const sec = (hw, hd, frontW) => G.resample(G.fillet([
      [x0 - frontW, z0 + hd], [x0 + frontW, z0 + hd], [x0 + hw, z0 + hd * 0.1], [x0 + hw * 0.82, z0 - hd], [x0 - hw * 0.82, z0 - hd], [x0 - hw, z0 + hd * 0.1],
    ], [0.45, 0.45, 0.5, 0.6, 0.6, 0.5], 4), 72);
    const core = G.loft([
      { c: fy0, pts: G.offsetPoly(sec(1.78, 1.72, 1.26), -0.2) }, { c: fy0 + 0.25, pts: sec(1.78, 1.72, 1.26) },
      { c: 41.5, pts: sec(2.55, 2.5, 1.8) }, { c: 44.2, pts: sec(2.78, 2.65, 1.95) }, { c: fy1 - 0.3, pts: sec(2.66, 2.55, 1.88) },
      { c: fy1, pts: G.offsetPoly(sec(2.66, 2.55, 1.88), -0.3) },
    ], { axis: 'y' });
    B.named['forearm' + side] = add('elbow', core, 'paint', PAL.navy);
    // front face plate (steel) layered
    {
      const o = G.fillet([[-1.05, 37.3], [1.05, 37.3], [1.85, 44.8], [-1.85, 44.8]], [0.25, 0.25, 0.4, 0.4], 3);
      const w = G.surf((u, y, out) => {
        const hd = THREE.MathUtils.lerp(1.7, 2.57, THREE.MathUtils.clamp((y - 35.8) / (44.2 - 35.8), 0, 1));
        out.set(x0 + u, y, z0 + hd + 0.22 - u * u * 0.02);
      });
      add('elbow', G.plate(o, { t: 0.4, bevel: 0.12, bseg: 2, tess: 0.45, warp: w }), 'paint', PAL.steel);
      add('elbow', G.plateBolts(o, { inset: 0.3, step: 1.0, z: 0.2, r: 0.1, warpFn: w, filter: (u, y) => y > 44.0 || y < 38.0 }), 'metal', PAL.gun);
    }
    // outer side: two long plates forming a deep groove (roots pass elbow sides)
    for (const k of [0, 1]) {
      const zc = k === 0 ? z0 + 1.35 : z0 - 1.45;
      const half = 0.85;
      const o = G.fillet([[-half, 37.55], [half, 37.55], [half + 0.1, 49.9], [0, 50.6], [-half - 0.1, 49.9]], [0.2, 0.2, 0.4, 0.5, 0.4], 3);
      const w = (v) => {
        const u = v.x, y = v.y, wv = v.z;
        const t = THREE.MathUtils.clamp((y - 36) / (44 - 36), 0, 1);
        const hw = THREE.MathUtils.lerp(1.72, 2.82, t) + (y > 46 ? -(y - 46) * 0.12 : 0);
        v.set(x0 + hw + 0.16 + wv, y, zc + u * (k === 0 ? 1 : 1));
      };
      let g = G.extrude(o, { t: 0.62, bevel: 0.18, bseg: 3 }); g = G.tess(g, 0.5); G.warp(g, w); g = G.fixWinding(G.finish(g, 38));
      add('elbow', g, 'paint', k ? PAL.navy2 : PAL.navy);
    }
    // groove bottom (dark) between the two long plates
    {
      const g = G.taper([
        [37.6, G.resample(G.rrect(0.5, 0.95, 0.15, 2, x0 + 1.86, z0 - 0.05), 20)],
        [46.5, G.resample(G.rrect(0.5, 0.95, 0.15, 2, x0 + 2.86, z0 - 0.05), 20)],
      ], { ch: 0.05 });
      add('elbow', g, 'dark', PAL.black);
    }
    // inner side plate (toward body)
    {
      const o = G.fillet([[-1.5, 37.6], [1.3, 37.6], [2.0, 46.6], [-2.1, 46.6]], 0.35, 3);
      const w = (v) => {
        const u = v.x, y = v.y, wv = v.z;
        const t = THREE.MathUtils.clamp((y - 36) / (44 - 36), 0, 1);
        const hw = THREE.MathUtils.lerp(1.66, 2.72, t);
        v.set(x0 - hw - 0.12 - wv, y, z0 + u);
      };
      let g = G.extrude(o, { t: 0.5, bevel: 0.15, bseg: 2 }); g = G.tess(g, 0.5); G.warp(g, w); g = G.fixWinding(G.finish(g, 38));
      add('elbow', g, 'paint', PAL.navy2);
    }
    // forearm root yoke side plates straddling the elbow axle + round covers (dia ~2.8)
    for (const s of [1, -1]) {
      const xc = x0 + s * 2.55;
      const o = G.fillet([[-1.9, 44.6], [1.9, 44.6], [1.9, 47.6], [0, 49.4], [-1.9, 47.6]], [0.3, 0.3, 0.9, 1.2, 0.9], 4);
      let g = G.extrude(o, { t: 0.7, bevel: 0.2, bseg: 2 });
      G.warp(g, (v) => { const u = v.x, y = v.y, w = v.z; v.set(xc + s * w, y, z0 + u); });
      g = G.fixWinding(G.finish(g, 38));
      add('elbow', g, 'paint', PAL.steel);
      const cover = G.merge([
        G.xf(G.cyl(1.62, 0.5, { seg: 40, ch: 0.12 }), { r: [0, 0, PI / 2], p: [xc + s * 0.45, A.ey, z0] }),
        G.xf(G.cyl(1.3, 0.42, { seg: 36, ch: 0.1 }), { r: [0, 0, PI / 2], p: [xc + s * 0.78, A.ey, z0] }),
        G.xf(G.cyl(0.95, 0.38, { seg: 32, ch: 0.08 }), { r: [0, 0, PI / 2], p: [xc + s * 1.05, A.ey, z0] }),
        G.xf(G.cyl(0.5, 0.34, { seg: 24, ch: 0.06 }), { r: [0, 0, PI / 2], p: [xc + s * 1.3, A.ey, z0] }),
      ]);
      add('elbow', cover, 'metal', PAL.gun);
      const bl = [];
      for (let i = 0; i < 8; i++) { const a = i / 8 * G.TAU; bl.push(G.bolt(V3(xc + s * 1.0, A.ey + Math.sin(a) * 1.12, z0 + Math.cos(a) * 1.12), V3(s, 0, 0), 0.09, a)); }
      add('elbow', G.merge(bl), 'metal', PAL.gunLight);
    }
    // front-inner guard on the bevel between the front face and the inner side, its arc edge painted wide red + white
    {
      const lerp = THREE.MathUtils.lerp, cl = THREE.MathUtils.clamp;
      const dims = (y) => {
        const k = [[35.85, 1.78, 1.72, 1.26], [41.5, 2.55, 2.5, 1.8], [44.2, 2.78, 2.65, 1.95], [46.8, 2.66, 2.55, 1.88]];
        for (let i = 0; i < k.length - 1; i++) if (y <= k[i + 1][0] || i === k.length - 2) { const t = cl((y - k[i][0]) / (k[i + 1][0] - k[i][0]), 0, 1); return [lerp(k[i][1], k[i + 1][1], t), lerp(k[i][2], k[i + 1][2], t), lerp(k[i][3], k[i + 1][3], t)]; }
      };
      const bev = (sv, y, off) => {
        const [hw, hd, fw] = dims(y);
        const A0 = [x0 - fw, z0 + hd], A1 = [x0 - hw, z0 + 0.1 * hd];
        const dx = A1[0] - A0[0], dz = A1[1] - A0[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;   // outward normal (front-inner)
        return V3(A0[0] + dx * sv + nx * off * -1, y, A0[1] + dz * sv + nz * off * -1);
      };
      const edge = (y) => 0.1 + 0.3 * ((y - 42.2) / 4.4) ** 2;          // arc-shaped edge on the bevel
      const strip = (s0, s1, y0, y1, off, n = 30) => {
        const rings = [];
        for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * i / n, e = edge(y); rings.push([bev(e + s0, y, off), bev(e + s1, y, off), bev(e + s1, y, off + 0.08), bev(e + s0, y, off + 0.08)]); }
        return G.loftRings(rings);
      };
      add('elbow', strip(-0.04, 0.62, 37.9, 46.4, 0.06), 'paint', PAL.steel);
      add('elbow', strip(0.0, 0.2, 38.1, 46.2, 0.15), 'paint', PAL.red);
      add('elbow', strip(0.24, 0.34, 38.2, 46.1, 0.15), 'paint', PAL.white);
    }
    if (side === 'R') {
      const p = V3(x0 + 2.92, 42.6, z0 + 1.62);
      add('elbow', G.xf(G.cyl(0.24, 0.24, { seg: 16, ch: 0.05 }), { r: [0, 0, PI / 2], p: p.toArray() }), 'metal', PAL.gunDark);
      add('elbow', G.xf(G.cyl(0.15, 0.16, { seg: 14, ch: 0.04 }), { r: [0, 0, PI / 2], p: [p.x + 0.12, p.y, p.z] }), 'lampGreen', 0xffffff, { vary: 0 });
      B.marker('elbowR', 'signalGreen', V3(-(p.x + 0.35), p.y, p.z));
    }
    // wrist armour band
    {
      const s0 = sec(1.95, 1.9, 1.36);
      const g = G.loft([
        { c: 35.75, pts: G.offsetPoly(s0, -0.15) }, { c: 35.95, pts: s0 }, { c: 37.25, pts: s0 }, { c: 37.45, pts: G.offsetPoly(s0, -0.15) },
      ], { axis: 'y' });
      add('elbow', g, 'paint', PAL.steel);
    }
    // right elbow thrusters
    if (side === 'R') {
      const nz = [];
      const glow = [];
      const centers = [[x0 - 0.9, 46.6], [x0 + 0.9, 46.6], [x0, 45.1]];
      for (const [cx, cy] of centers) {
        const nozzle = G.lathe([[0.62, 0.0], [0.72, 0.15], [0.78, 1.3], [0.7, 1.45], [0.55, 1.4], [0.5, 0.2], [0.3, 0.1]], { seg: 24 });
        G.xf(nozzle, { r: [-PI / 2 - 0.35, 0, 0], p: [cx, cy, z0 - 2.55] });
        nz.push(nozzle);
        const g = G.xf(G.cyl(0.5, 0.06, { seg: 20 }), { r: [-PI / 2 - 0.35, 0, 0], p: [cx, cy - 0.12, z0 - 2.85] });
        glow.push(g);
      }
      const housing = G.xf(G.rbox(3.4, 3.4, 1.1, 0.35, 2), { p: [x0, 45.9, z0 - 2.35] });
      add('elbow', G.merge([housing]), 'metal', PAL.gunDark);
      add('elbow', G.merge(nz), 'metal', PAL.gun);
      add('elbow', G.merge(glow), 'dark', PAL.black);
      // longitudinal ribs round each nozzle barrel
      const ribs = [];
      for (const [cx, cy] of centers) for (let k = 0; k < 8; k++) {
        const a = k / 8 * G.TAU;
        const r = G.xf(G.rbox(0.12, 1.05, 0.14, 0.03, 1), { p: [Math.cos(a) * 0.82, 0.72, Math.sin(a) * 0.82], r: [0, -a, 0] });
        G.xf(r, { r: [-PI / 2 - 0.35, 0, 0], p: [cx, cy, z0 - 2.55] });
        ribs.push(r);
      }
      add('elbow', G.merge(ribs), 'metal', PAL.gunLight);
      // deflector guard under the nozzles
      const defl = G.plate(G.fillet([[-1.9, 0], [1.9, 0], [1.6, 1.7], [-1.6, 1.7]], [0.2, 0.2, 0.4, 0.4], 2), { t: 0.28, bevel: 0.08, bseg: 1, tess: 0.4 });
      G.warp(defl, (v) => { const u = v.x, t = v.y, w = v.z; v.set(x0 + u, 44.15 - t * 0.35 + w - u * u * 0.04, z0 - 2.25 - t); });
      add('elbow', G.fixWinding(G.finish(defl, 38)), 'paint', PAL.navy2);
      // round joint exposed near the elbow axle
      add('elbow', G.merge([
        G.xf(G.cyl(0.78, 0.7, { seg: 28, ch: 0.08 }), { r: [0, 0, PI / 2], p: [x0, 47.35, z0 - 1.75] }),
        G.xf(G.cyl(0.42, 0.9, { seg: 20, ch: 0.06 }), { r: [0, 0, PI / 2], p: [x0, 47.35, z0 - 1.75] }),
      ]), 'metal', PAL.gunLight);
      B.marker('elbowR', 'elbowThruster', V3(-x0, 45.8, z0 - 3.3));
    }
    // drip marker at elbow bottom-back
    B.marker('elbow' + side, 'drip', V3((side === 'L' ? 1 : -1) * x0, 45.2, z0 - 2.4));
  }

  // ---------------------------------------------------------------- hand
  buildHand(B, side);
}

function buildHand(B, side) {
  const A = ARM;
  const s = side === 'L' ? 1 : -1;
  const x0 = A.sx, z0 = A.sz;
  const add = (jn, g, mat = 'paint', col = PAL.navy, o) => {
    if (side === 'L') return B.add(jn, g, mat, col, o);
    return B.add(jn, G.mirrorX(g), mat, col, o);
  };
  const wj = 'wrist' + side;
  // wrist axle (narrow) exposed
  add(wj, G.xf(G.cyl(0.85, 3.6, { seg: 24, ch: 0.08 }), { r: [PI / 2, 0, 0], p: [x0, A.wy - 0.15, z0] }), 'metal', PAL.gunDark);
  add(wj, G.xf(G.cyl(1.15, 1.6, { seg: 24, ch: 0.12 }), { p: [x0, A.wy - 0.1, z0] }), 'metal', PAL.gun);
  // palm block
  {
    const sec = G.resample(G.rrect(1.55, 4.15, 0.35, 3, x0 - 0.05, z0), 40);
    const g = G.loft([
      { c: A.palmBot, pts: G.offsetPoly(sec, -0.15) }, { c: A.palmBot + 0.2, pts: sec }, { c: A.palmTop - 0.2, pts: G.resample(G.rrect(1.5, 3.7, 0.35, 3, x0 - 0.05, z0), 40) },
      { c: A.palmTop, pts: G.offsetPoly(G.resample(G.rrect(1.5, 3.7, 0.35, 3, x0 - 0.05, z0), 40), -0.15) },
    ], { axis: 'y' });
    add(wj, g, 'metal', PAL.gun);
    // back-of-hand guard plate (wide)
    const o = G.fillet([[-2.25, A.palmBot + 0.15], [2.25, A.palmBot + 0.15], [2.0, A.palmTop - 0.05], [-2.0, A.palmTop - 0.05]], [0.3, 0.3, 0.4, 0.4], 3);
    let pg = G.extrude(o, { t: 0.5, bevel: 0.15, bseg: 2 }); pg = G.tess(pg, 0.4);
    G.warp(pg, (v) => { const u = v.x, y = v.y, w = v.z; v.set(x0 + 0.95 + w - u * u * 0.03, y, z0 + u); });
    pg = G.fixWinding(G.finish(pg, 38));
    add(wj, pg, 'paint', PAL.navy);
    // second, shorter layer over the back-of-hand guard
    {
      const o2 = G.fillet([[-1.7, A.palmBot + 0.9], [1.7, A.palmBot + 0.9], [1.55, A.palmTop - 0.25], [-1.55, A.palmTop - 0.25]], [0.25, 0.25, 0.3, 0.3], 3);
      let g2 = G.extrude(o2, { t: 0.32, bevel: 0.1, bseg: 2 }); g2 = G.tess(g2, 0.4);
      G.warp(g2, (v) => { const u = v.x, y = v.y, w = v.z; v.set(x0 + 1.32 + w - u * u * 0.03, y, z0 + u); });
      add(wj, G.fixWinding(G.finish(g2, 38)), 'paint', PAL.navy2);
    }
    // knuckle ridge on guard
    const kr = G.xf(G.rbox(0.35, 0.55, 4.2, 0.12, 2), { p: [x0 + 1.25, A.palmBot + 0.55, z0] });
    add(wj, kr, 'paint', PAL.steel);
    // palm pad (inner)
    const pad = G.xf(G.rbox(0.4, 2.2, 3.4, 0.15, 2), { p: [x0 - 0.88, A.palmBot + 1.35, z0] });
    add(wj, pad, 'metal', PAL.gunDark);
  }
  // fingers
  A.fingerZ.forEach((fz, k) => {
    const z = z0 + fz;
    let y = A.palmBot;
    const widths = [0.86, 0.84, 0.82];
    ['a', 'b', 'c'].forEach((seg, i) => {
      const jn = `f${side}${k}${seg}`;
      const L = A.seg[i] * (k === 3 ? 0.9 : 1);
      const yTop = y, yBot = y - L;
      // knuckle axle (dark)
      add(jn, G.xf(G.cyl(0.36, widths[i] + 0.02, { seg: 16, ch: 0.04 }), { r: [PI / 2, 0, 0], p: [x0, yTop, z] }), 'metal', PAL.gunDark);
      // core
      const core = G.xf(G.rbox(0.95, L - 0.05, widths[i] - 0.06, 0.18, 2), { p: [x0 - 0.05, (yTop + yBot) / 2 - 0.05, z] });
      add(jn, core, 'metal', PAL.gun);
      // dorsal plate (independent short plate on back of each segment)
      const o = G.fillet([[-widths[i] / 2, yBot + 0.02], [widths[i] / 2, yBot + 0.02], [widths[i] / 2 + 0.02, yTop - 0.25], [-widths[i] / 2 - 0.02, yTop - 0.25]], [0.15, 0.15, 0.08, 0.08], 2);
      let pg = G.extrude(o, { t: 0.32, bevel: 0.1, bseg: 2 });
      G.warp(pg, (v) => { const u = v.x, yy = v.y, w = v.z; v.set(x0 + 0.52 + w + (yy - yBot) * 0.05, yy, z + u); });
      pg = G.fixWinding(G.finish(pg, 38));
      add(jn, pg, 'paint', i === 0 ? PAL.navy2 : PAL.navy);
      if (i === 2) {
        // fingertip cap + drip marker
        const tip = G.xf(G.rbox(0.9, 0.35, widths[i] - 0.1, 0.15, 2), { p: [x0 - 0.05, yBot + 0.1, z] });
        add(jn, tip, 'metal', PAL.gunDark);
        B.marker(jn, 'fingertip', V3(s * (x0 - 0.05), yBot - 0.05, z));
      }
      y = yBot - A.gap;
    });
  });
  // thumb
  {
    const ja = `t${side}a`, jb = `t${side}b`;
    const base = V3(x0 - 0.15, 33.9, z0 + 2.05);
    const g1 = G.xf(G.rbox(1.0, 1.55, 0.95, 0.2, 2), { p: [base.x, base.y - 0.75, base.z + 0.25], r: [0.32, 0, 0] });
    add(ja, g1, 'metal', PAL.gun);
    const p1 = G.xf(G.rbox(0.32, 1.3, 0.85, 0.1, 2), { p: [base.x + 0.55, base.y - 0.75, base.z + 0.25], r: [0.32, 0, 0] });
    add(ja, p1, 'paint', PAL.navy2);
    add(ja, G.xf(G.cyl(0.4, 1.0, { seg: 16 }), { r: [PI / 2, 0, 0], p: [base.x, base.y, base.z] }), 'metal', PAL.gunDark);
    const b2 = V3(x0 - 0.15, 32.45, z0 + 2.55);
    const g2 = G.xf(G.rbox(0.92, 1.25, 0.88, 0.2, 2), { p: [b2.x, b2.y - 0.62, b2.z + 0.1], r: [0.15, 0, 0] });
    add(jb, g2, 'metal', PAL.gun);
    const p2 = G.xf(G.rbox(0.3, 1.1, 0.8, 0.1, 2), { p: [b2.x + 0.52, b2.y - 0.62, b2.z + 0.1], r: [0.15, 0, 0] });
    add(jb, p2, 'paint', PAL.navy);
    B.marker(jb, 'fingertip', V3(s * b2.x, b2.y - 1.3, b2.z + 0.25));
  }
}
