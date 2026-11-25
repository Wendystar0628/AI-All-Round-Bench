// Chainsword on the left forearm, fully extended: blue-painted case at the end of the wrist armour, ~28 m blade along
// the back of the fist, slightly curved. Main section: ~20 links, a central column of raised U-shaped steel rings
// hooked into each other head to tail, each holding a dark-brass round core; every link carries a flat rectangular
// tooth on each side with a clear rectangular gap to the next. A solid one-piece tip several links long closes the
// blade with two convex arc edges. Dark grey steel, polished tooth and tip edges.
import * as THREE from 'three';
import * as G from './geo.js';
import { PAL } from './builder.js';
const { DEG, PI, V3 } = G;

export const SWORD = { x: 15.15, z: -0.2, exitY: 35.55, len: 28.0, links: 20, pitch: 1.08, d0: 0.35, halfW: 1.68, body: 0.5 };

export function buildSword(B) {
  const S = SWORD;
  const jn = 'elbowL';
  // ---------------------------------------------------------------- case (painted like the forearm armour)
  {
    const sec = G.resample(G.fillet([[S.x - 0.62, S.z - 2.35], [S.x + 1.0, S.z - 2.2], [S.x + 1.15, S.z + 2.1], [S.x - 0.62, S.z + 2.3]], [0.3, 0.45, 0.45, 0.3], 3), 40);
    const g = G.loft([
      { c: 35.7, pts: G.offsetPoly(sec, -0.18) }, { c: 35.95, pts: sec }, { c: 41.4, pts: sec },
      { c: 42.6, pts: G.offsetPoly(G.resample(G.fillet([[S.x - 0.4, S.z - 1.9], [S.x + 0.6, S.z - 1.8], [S.x + 0.7, S.z + 1.7], [S.x - 0.4, S.z + 1.85]], [0.3, 0.4, 0.4, 0.3], 3), 40), -0.1) },
    ], { axis: 'y' });
    B.add(jn, g, 'paint', PAL.navy);
    const rails = [];
    for (const dz of [-2.25, 2.2]) rails.push(G.xf(G.rbox(0.5, 5.2, 0.35, 0.1, 2), { p: [S.x + 0.95, 38.7, S.z + dz * 0.98] }));
    B.add(jn, G.merge(rails), 'paint', PAL.steel);
    const bl = [];
    for (let k = 0; k < 4; k++) for (const dz of [-1.6, 1.55]) bl.push(G.bolt(V3(S.x + 1.18, 36.6 + k * 1.45, S.z + dz), V3(1, 0, 0), 0.11));
    B.add(jn, G.merge(bl), 'metal', PAL.gun);
    B.add(jn, G.xf(G.rbox(1.1, 0.35, 4.3, 0.1, 2), { p: [S.x + 0.1, 35.85, S.z] }), 'metal', PAL.gunDark);
    B.add(jn, G.xf(G.rbox(1.3, 4.0, 2.2, 0.25, 2), { p: [S.x - 0.9, 39.6, S.z] }), 'metal', PAL.gun);
  }
  // ---------------------------------------------------------------- blade (local: u across = world z, d along = world -y, w thickness = world x)
  const yRoot = S.exitY;
  const bend = (d) => 1.2 * (d / S.len) ** 2;                 // slight overall curve
  const toWorld = (g) => G.warp(g, (v) => { const u = v.x, d = v.y, w = v.z; v.set(S.x + w, yRoot - d, S.z + u + bend(d)); });
  const plate2 = (outline, t, bevel, bseg = 2, tess = 0) => { let g = G.extrude(outline, { t, bevel, bseg }); if (tess) g = G.tess(g, tess); toWorld(g); return G.fixWinding(G.finish(g, 38)); };
  const body = [], rings = [], cores = [], teeth = [], edges = [];
  const dTip0 = S.d0 + S.links * S.pitch;
  // root block (inside / just out of the case)
  body.push(plate2(G.fillet([[-1.05, -0.4], [1.05, -0.4], [1.05, S.d0 + 0.05], [-1.05, S.d0 + 0.05]], 0.1, 1), S.body + 0.1, 0.08));
  for (let i = 0; i < S.links; i++) {
    const a = S.d0 + i * S.pitch, b = a + S.pitch - 0.06;
    // link body: two flat side plates either side of the ring column
    for (const s of [1, -1]) {
      const o = [[s * 0.52, a], [s * 1.06, a], [s * 1.06, b], [s * 0.52, b]];
      body.push(plate2(s > 0 ? o : o.slice().reverse(), S.body, 0.06, 1));
      // flat rectangular tooth sticking straight out sideways, clear gap to the next one
      const t0 = a + 0.2, t1 = t0 + 0.62;
      const q = [[s * 1.0, t0], [s * S.halfW, t0], [s * S.halfW, t1], [s * 1.0, t1]];
      teeth.push(plate2(s > 0 ? q : q.slice().reverse(), 0.36, 0.05, 1));
      const e = [[s * (S.halfW - 0.1), t0 + 0.04], [s * (S.halfW + 0.02), t0 + 0.04], [s * (S.halfW + 0.02), t1 - 0.04], [s * (S.halfW - 0.1), t1 - 0.04]];
      edges.push(plate2(s > 0 ? e : e.slice().reverse(), 0.2, 0.03, 1));
    }
    // raised U-shaped ring: closed end toward the root, arms reaching forward over the next link's closed end
    {
      const U = [];
      const ro = 0.56, ri = 0.3, c = a + 0.5, arm = c + 0.6;
      for (let k = 0; k <= 10; k++) { const t = PI + PI * k / 10; U.push([Math.cos(t) * ro, c + Math.sin(t) * ro * 0.9]); }
      U.push([ro, arm], [ri, arm]);
      for (let k = 10; k >= 0; k--) { const t = PI + PI * k / 10; U.push([Math.cos(t) * ri, c + Math.sin(t) * ri * 0.9]); }
      U.push([-ri, arm], [-ro, arm]);
      rings.push(plate2(G.ccw(U), S.body + 0.62, 0.1, 2));
      // dark-brass round core seated in the ring's closed end
      const core = G.cyl(0.25, S.body + 0.5, { seg: 20, ch: 0.06 });
      G.xf(core, { r: [PI / 2, 0, 0], p: [0, c + 0.02, 0] });
      toWorld(core); cores.push(G.finish(core, 38));
    }
  }
  // solid one-piece tip: two convex arc edges closing to the point, thinning toward it
  {
    const L = S.len - dTip0, W = 1.62, n = 18;
    const half = (k) => { const t = k / n; return [W * Math.pow(Math.cos(t * PI / 2), 0.72), dTip0 + t * L]; };
    const o = [];
    for (let k = 0; k <= n; k++) { const [u, d] = half(k); o.push([u, d]); }
    for (let k = n - 1; k >= 0; k--) { const [u, d] = half(k); o.push([-u, d]); }
    let g = G.extrude(G.ccw(o), { t: S.body + 0.1, bevel: 0.1, bseg: 2 }); g = G.tess(g, 0.45);
    G.warp(g, (v) => { const k = Math.max(0, (v.y - dTip0) / L); v.z *= 1 - 0.65 * k; });
    toWorld(g); body.push(G.fixWinding(G.finish(g, 38)));
    // polished edge strips along both arcs + a low central ridge
    for (const s of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= n; k++) { const [u, d] = half(k); pts.push([s * u, d]); }
      const inner = pts.map(([u, d], k) => [u - s * 0.16 * (1 - k / n * 0.7), d - (k === n ? 0.25 : 0)]);
      const strip = [...pts, ...inner.reverse()];
      let eg = G.extrude(G.ccw(strip), { t: 0.18, bevel: 0.03, bseg: 1 });
      toWorld(eg); edges.push(G.fixWinding(G.finish(eg, 38)));
    }
    rings.push(plate2([[-0.2, dTip0 - 0.1], [0.2, dTip0 - 0.1], [0.05, S.len - 1.2], [-0.05, S.len - 1.2]], S.body + 0.3, 0.06, 1, 0.5));
  }
  B.add(jn, G.merge(body), 'blade', 0x2e3237, { vary: 0.2 });
  B.add(jn, G.merge(rings), 'blade', 0x4a5058, { vary: 0.1 });
  B.add(jn, G.merge(teeth), 'blade', 0x464c54, { vary: 0.1 });
  B.add(jn, G.merge(edges), 'blade', 0x8a9098, { vary: 0 });
  B.add(jn, G.merge(cores), 'metal', 0x5a4420);
  B.swordSegments = S.links;
  B.marker(jn, 'swordTip', V3(S.x, yRoot - S.len - 0.05, S.z + bend(S.len)));
  B.marker(jn, 'swordRoot', V3(S.x, yRoot, S.z));
  B.marker(jn, 'swordAxisB', V3(S.x + 1, yRoot, S.z));
}
