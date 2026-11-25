import * as THREE from 'three';
import { mat, mul } from '../core/batch.js';
import * as G from '../core/geo.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const PLASTERS = [0xeee4d2, 0xe8dac0, 0xe4cfaa, 0xf0e8dc, 0xdfc6a0, 0xe9d4bf, 0xe2d8c3, 0xd9c9a8];
export const ROOF_GREEN = [0x5d9483, 0x6b9f8d, 0x557f72, 0x6a8f7c];
export const ROOF_RED = [0xa8603f, 0x9c5a3e, 0xb3714f, 0x94553a, 0xa86a4a];
export const SHUTTERS = [0x4d7a5e, 0x4b6c8c, 0x7a5a3c, 0x6d8a9a, 0x8a4a3a];
export const TRIM = 0xefe6d2, BASE = 0xcfc3aa;

// window with frame, sill, lintel and optional shutters. Local frame: wall plane z=0 facing +z.
export function windowOn(b, M4, x, y, w = 1.1, h = 1.6, rng = null, opts = {}) {
  b.add('glass', G.box(w, h, 0.12), mul(M4, mat(x, y, 0.0)), 0x2c3440);
  b.add('stone', G.box(w + 0.3, 0.16, 0.3), mul(M4, mat(x, y - 0.14, 0.05)), TRIM);       // sill
  if (opts.arched) b.add('stone', G.archRing(w, 0.18, 0.2, 'round', 8, 0), mul(M4, mat(x, y + h, 0.05)), TRIM);
  else b.add('stone', G.box(w + 0.36, 0.22, 0.22), mul(M4, mat(x, y + h, 0.04)), TRIM); // lintel
  if (opts.frame !== false) {
    b.add('stone', G.box(0.12, h, 0.16), mul(M4, mat(x - w / 2 - 0.06, y, 0.04)), TRIM);
    b.add('stone', G.box(0.12, h, 0.16), mul(M4, mat(x + w / 2 + 0.06, y, 0.04)), TRIM);
  }
  if (opts.shutter) {
    const c = opts.shutter;
    const open = rng ? rng.next() : 0.5;
    if (open > 0.35) {
      b.add('wood', G.box(w * 0.5, h, 0.06), mul(M4, mat(x - w * 0.75 - 0.12, y, 0.08)), c);
      b.add('wood', G.box(w * 0.5, h, 0.06), mul(M4, mat(x + w * 0.75 + 0.12, y, 0.08)), c);
    } else {
      b.add('wood', G.box(w, h, 0.06), mul(M4, mat(x, y, 0.1)), c);
    }
  }
  if (opts.box) { // flower box
    b.add('wood', G.box(w + 0.2, 0.3, 0.35), mul(M4, mat(x, y - 0.4, 0.22)), 0x7a5a3c);
    b.add('foliage', new THREE.IcosahedronGeometry(0.32, 0).scale(w * 1.3, 0.8, 0.8), mul(M4, mat(x, y - 0.02, 0.24)), opts.boxCol || 0xe0566e, { aux: () => [0.3, 0.37] });
  }
}

export function doorOn(b, M4, x, w = 1.5, h = 2.6, arched = false, col = 0x6e4f34) {
  b.add('wood', G.box(w, h, 0.14), mul(M4, mat(x, 0, 0.0)), col);
  b.add('stone', G.box(0.22, h + 0.1, 0.26), mul(M4, mat(x - w / 2 - 0.11, 0, 0.04)), TRIM);
  b.add('stone', G.box(0.22, h + 0.1, 0.26), mul(M4, mat(x + w / 2 + 0.11, 0, 0.04)), TRIM);
  if (arched) b.add('stone', G.archRing(w, 0.25, 0.26, 'round', 8, 0), mul(M4, mat(x, h, 0.04)), TRIM);
  else b.add('stone', G.box(w + 0.6, 0.3, 0.3), mul(M4, mat(x, h, 0.04)), TRIM);
  b.add('stone', G.box(w + 0.8, 0.18, 0.7), mul(M4, mat(x, 0, 0.3)), BASE); // step
}

// Generic town house. Local frame: front facade at z=0 facing +z, footprint x in [-w/2,w/2], z in [-d,0], ground y=0.
export function house(b, M4, w, d, floors, rng, opts = {}) {
  const fh = 3.25, H = floors * fh + 0.7;
  const wallCol = opts.wallCol ?? rng.pick(PLASTERS);
  const red = opts.roofRed ?? rng.chance(0.55);
  const roofCol = red ? rng.pick(ROOF_RED) : rng.pick(ROOF_GREEN);
  const shut = rng.chance(0.65) ? rng.pick(SHUTTERS) : null;
  // body
  b.add('plaster', G.box(w, H, d), mul(M4, mat(0, 0, -d / 2)), wallCol);
  b.add('stone', G.box(w + 0.16, 0.9, d + 0.16), mul(M4, mat(0, -0.3, -d / 2)), BASE);
  b.add('stone', G.box(w + 0.3, 0.32, d + 0.3), mul(M4, mat(0, H - 0.32, -d / 2)), TRIM);
  if (floors >= 2 && rng.chance(0.6)) b.add('stone', G.box(w + 0.12, 0.2, d + 0.12), mul(M4, mat(0, fh + 0.5, -d / 2)), TRIM);
  // corner quoins on nicer houses
  if (rng.chance(0.35)) for (const sx of [-1, 1]) for (let k = 0; k < floors * 3; k++) b.add('stone', G.box(0.5 + (k % 2) * 0.3, 0.5, 0.5 + ((k + 1) % 2) * 0.3), mul(M4, mat(sx * (w / 2 - 0.15), 0.9 + k * 1.05, -0.15)), TRIM);
  // roof
  const hip = opts.hip ?? rng.chance(0.35);
  const rh = Math.min(w, d) * (0.34 + rng.next() * 0.1);
  const rm = mul(M4, mat(0, H, -d / 2));
  if (hip) b.add('roof', G.hipRoof(w, d, rh, 0.45), rm, roofCol);
  else {
    b.add('roof', G.gableRoof(w, d, rh, 0.45, 0.18), rm, roofCol);
    for (const sx of [-1, 1]) b.add('plaster', G.gableWall(d, rh, 0.3), mul(rm, mat(sx * (w / 2 - 0.15), 0, 0)), wallCol);
    // ridge cap
    b.add('roof', G.box(w + 0.9, 0.22, 0.34), mul(rm, mat(0, rh - 0.05, 0)), roofCol);
  }
  // dormers
  if (!hip && w > 8 && rng.chance(0.6)) {
    const nd = w > 11 ? 2 : 1;
    for (let k = 0; k < nd; k++) {
      const x = nd === 1 ? 0 : (k - 0.5) * w * 0.45;
      const dm = mul(rm, mat(x, 0.35 * rh - 0.45, 0.65 * d / 2));
      b.add('plaster', G.box(1.7, 1.7, 1.9), mul(dm, mat(0, 0, -0.95)), wallCol);
      b.add('roof', G.gableRoof(1.9, 2.2, 0.8, 0.15, 0.1), mul(dm, mat(0, 1.7, -0.95), new THREE.Matrix4().makeRotationY(Math.PI / 2)), roofCol);
      b.add('glass', G.box(0.8, 1.0, 0.1), mul(dm, mat(0, 0.35, 0.0)), 0x2c3440);
      b.add('stone', G.box(1.0, 0.12, 0.14), mul(dm, mat(0, 1.35, 0.02)), TRIM);
    }
  }
  // chimneys
  const nc = rng.chance(0.75) ? (rng.chance(0.3) ? 2 : 1) : 0;
  for (let k = 0; k < nc; k++) {
    const cx = (k === 0 ? -1 : 1) * w * (0.2 + rng.next() * 0.15), cz = -d / 2 + (rng.next() - 0.5) * d * 0.3;
    b.add('stone', G.box(0.9, rh + 1.6, 0.9), mul(M4, mat(cx, H, cz)), 0xd9cbb0);
    b.add('stone', G.box(1.15, 0.22, 1.15), mul(M4, mat(cx, H + rh + 1.6, cz)), TRIM);
    b.add('roof', G.box(0.5, 0.35, 0.5), mul(M4, mat(cx, H + rh + 1.82, cz)), 0x8a4a33);
    if (opts.smoke) opts.smoke.push(new THREE.Vector3(cx, H + rh + 2.2, cz).applyMatrix4(M4));
  }
  // facade: windows & door
  const nw = Math.max(1, Math.floor((w - 1.0) / 2.5));
  const sp = w / nw;
  const doorIdx = Math.floor(nw / 2);
  const arched = rng.chance(0.3);
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < nw; i++) {
      const x = -w / 2 + sp * (i + 0.5);
      if (f === 0 && i === doorIdx) { doorOn(b, M4, x, opts.bigDoor ? 2.6 : 1.4, opts.bigDoor ? 3.0 : 2.5, arched || opts.bigDoor, opts.doorCol || 0x6e4f34); continue; }
      const y = f * fh + (f === 0 ? 1.0 : 1.2);
      windowOn(b, M4, x, y, f === 0 ? 1.2 : 1.0, f === 0 ? 1.7 : 1.55, rng, { shutter: shut, arched: arched && f === floors - 1, box: f > 0 && rng.chance(0.25), boxCol: rng.pick([0xe0566e, 0xf0a3c0, 0xf3c85a, 0xb48fe0]) });
    }
  }
  // back facade windows (simpler)
  const Mb = mul(M4, mat(0, 0, -d, Math.PI));
  for (let f = 1; f < floors; f++) for (let i = 0; i < nw; i++) windowOn(b, Mb, -w / 2 + sp * (i + 0.5), f * fh + 1.2, 1.0, 1.5, rng, { shutter: shut, frame: false });
  // side windows
  for (const sx of [-1, 1]) {
    const Ms = mul(M4, mat(sx * w / 2, 0, -d / 2, sx * Math.PI / 2));
    if (rng.chance(0.6)) for (let f = 1; f < floors; f++) windowOn(b, Ms, 0, f * fh + 1.2, 0.9, 1.4, rng, { frame: false, shutter: shut });
  }
  // balcony
  if (floors >= 2 && (opts.balcony ?? rng.chance(0.35))) {
    const bw = Math.min(w * 0.6, 4.5), y = fh + 0.6;
    b.add('stone', G.box(bw, 0.22, 1.2), mul(M4, mat(0, y, 0.6)), TRIM);
    for (let k = 0; k < 3; k++) b.add('stone', G.box(0.25, 0.5, 0.9), mul(M4, mat((k - 1) * bw * 0.4, y - 0.5, 0.45)), BASE);
    b.add('iron', G.box(bw, 0.06, 0.06), mul(M4, mat(0, y + 1.05, 1.17)), 0x2f2c2a);
    for (let k = 0; k <= Math.round(bw / 0.35); k++) b.add('iron', G.box(0.04, 1.0, 0.04), mul(M4, mat(-bw / 2 + k * 0.35, y + 0.1, 1.17)), 0x2f2c2a);
    b.add('foliage', new THREE.IcosahedronGeometry(0.35, 0).scale(1.4, 0.9, 0.9), mul(M4, mat(-bw / 2 + 0.5, y + 0.45, 0.9)), 0xe0566e, { aux: () => [0.3, 0.5] });
  }
  return { H, rh };
}

// hanging sign on an iron bracket (workshops)
export function signOn(b, M4, x, y, col = 0x7a5a3c, emblem = 0xe8bd62) {
  b.add('iron', G.box(1.6, 0.08, 0.08).translate(0.8, 0, 0), mul(M4, mat(x, y, 0.1), new THREE.Matrix4().makeRotationY(-Math.PI / 2)), 0x2f2c2a);
  b.add('wood', G.box(1.1, 0.8, 0.08), mul(M4, mat(x, y - 0.95, 1.2)), col);
  b.add('gold', G.box(0.5, 0.4, 0.1), mul(M4, mat(x, y - 0.75, 1.2)), emblem);
}

// market stall with striped awning (fabric), table and goods
export function stall(b, M4, rng, col) {
  const w = 3.6, d = 2.4;
  for (const sx of [-1, 1]) for (const sz of [0, -1]) b.add('wood', G.box(0.14, sz === 0 ? 2.5 : 2.9, 0.14), mul(M4, mat(sx * w / 2, 0, sz * d)), 0x7a5c40);
  b.add('wood', G.box(w, 0.12, d * 0.7), mul(M4, mat(0, 0.9, -d * 0.35)), 0x8a6a4c);
  b.add('wood', G.box(w - 0.2, 0.8, 0.1), mul(M4, mat(0, 0.1, -0.05)), 0x7a5c40);
  // awning: sloped fabric with stripes (alternating colors)
  const n = 6;
  for (let i = 0; i < n; i++) {
    const g = G.box(w / n + 0.01, 0.05, d + 0.6);
    const c = i % 2 === 0 ? col : 0xf3ece0;
    b.add('fabricSway', g, mul(M4, mat(-w / 2 + w / n * (i + 0.5), 2.7, -d / 2 + 0.3), new THREE.Matrix4().makeRotationX(0.28)), c, { aux: () => [0.15, rng.next()] });
  }
  // valance
  for (let i = 0; i < 9; i++) b.add('fabric', G.box(w / 9 - 0.04, 0.35, 0.03), mul(M4, mat(-w / 2 + w / 9 * (i + 0.5), 2.15, 0.62)), i % 2 ? col : 0xf3ece0);
  // goods on the table
  const kind = rng.int(0, 3);
  const top = 1.02;
  if (kind === 0) { // fruit piles
    const fc = [0xd9452b, 0xf09a2a, 0xe8c840, 0x7fae3a, 0x9c2a3a];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 7; k++) {
      const c = fc[(i + k) % fc.length];
      b.add('plain', new THREE.IcosahedronGeometry(0.13, 1), mul(M4, mat(-1.2 + i * 0.8 + (k % 3) * 0.15, top + 0.1 + Math.floor(k / 3) * 0.15, -0.5 - (k % 2) * 0.3)), c);
    }
    for (let i = 0; i < 3; i++) b.add('wood', G.cyl(0.3, 0.25, 0.25, 10), mul(M4, mat(-1.1 + i * 1.1, top, -1.2)), 0xa08050);
  } else if (kind === 1) { // cloth bolts
    const cc = [0x9c2f3a, 0x2f5b8c, 0xd9b44a, 0x5a8a4a, 0x8a4a8a, 0xe8e0d0];
    for (let i = 0; i < 7; i++) { const g = G.cylC(0.17, 0.17, 1.1, 10); g.rotateX(Math.PI / 2); b.add('fabric', g, mul(M4, mat(-1.4 + i * 0.46, top + 0.17, -0.8)), cc[i % cc.length]); }
    for (let i = 0; i < 4; i++) { const g = G.cylC(0.17, 0.17, 1.1, 10); g.rotateX(Math.PI / 2); b.add('fabric', g, mul(M4, mat(-1.2 + i * 0.6, top + 0.48, -0.8)), cc[(i + 3) % cc.length]); }
  } else if (kind === 2) { // pottery
    for (let i = 0; i < 6; i++) {
      const s = 0.6 + rng.next() * 0.6;
      b.add('plain', G.lathe([[0.001, 0], [0.18 * s, 0.02], [0.26 * s, 0.25 * s], [0.2 * s, 0.5 * s], [0.1 * s, 0.62 * s], [0.13 * s, 0.7 * s]], 10, false), mul(M4, mat(-1.3 + i * 0.52, top, -0.7 - (i % 2) * 0.4)), rng.pick([0xb4643c, 0xc98a5a, 0x8a5a3c, 0xd8c8a8]));
    }
    for (let i = 0; i < 3; i++) b.add('plain', G.lathe([[0.001, 0], [0.3, 0.02], [0.42, 0.4], [0.3, 0.85], [0.2, 0.95]], 10, false), mul(M4, mat(-1.4 + i * 1.4, 0, 0.5)), 0xb4643c);
  } else { // bread / baskets
    for (let i = 0; i < 5; i++) {
      b.add('wood', G.cyl(0.32, 0.26, 0.22, 10), mul(M4, mat(-1.4 + i * 0.7, top, -0.7)), 0xa98a5a);
      for (let k = 0; k < 3; k++) b.add('plain', new THREE.SphereGeometry(0.16, 8, 6).scale(1.3, 0.7, 1), mul(M4, mat(-1.4 + i * 0.7 + (k - 1) * 0.14, top + 0.25, -0.7 + (k % 2) * 0.1)), 0xc9904a);
    }
  }
}

export function lampPost(b, M4, h = 4.2) {
  b.add('iron', G.cyl(0.09, 0.13, h, 8), M4, 0x2f2c2a);
  b.add('iron', G.cyl(0.2, 0.25, 0.35, 8), M4, 0x2f2c2a);
  b.add('iron', G.box(0.42, 0.06, 0.42), mul(M4, mat(0, h, 0)), 0x2f2c2a);
  b.add('glowSoft', G.box(0.32, 0.5, 0.32), mul(M4, mat(0, h + 0.06, 0)));
  b.add('iron', G.cone(0.34, 0.4, 4), mul(M4, mat(0, h + 0.56, 0, Math.PI / 4)), 0x2f2c2a);
}

// tiered fountain with basin (water surfaces added separately)
export function fountain(b, M4, r = 4.2) {
  b.add('stone', G.cyl(r + 0.4, r + 0.5, 0.9, 32), M4, BASE);
  b.add('stone', invertCyl(r, 0.9), M4, BASE);
  b.add('stone', G.cyl(r + 0.55, r + 0.55, 0.18, 32), mul(M4, mat(0, 0.9, 0)), TRIM);
  b.add('stone', G.cyl(0.55, 0.75, 2.4, 16), M4, TRIM);
  b.add('stone', G.lathe([[0.4, 0], [1.6, 0.2], [1.75, 0.45], [1.5, 0.5], [0.5, 0.35]], 24, false), mul(M4, mat(0, 2.3, 0)), TRIM);
  b.add('stone', G.cyl(0.25, 0.35, 1.3, 12), mul(M4, mat(0, 2.6, 0)), TRIM);
  b.add('stone', G.lathe([[0.25, 0], [0.8, 0.15], [0.85, 0.3], [0.3, 0.25]], 18, false), mul(M4, mat(0, 3.8, 0)), TRIM);
  b.add('gold', new THREE.SphereGeometry(0.28, 10, 8), mul(M4, mat(0, 4.4, 0)), 0xe8bd62);
}
function invertCyl(r, h) { const g = new THREE.CylinderGeometry(r, r, h, 32, 1, true); g.translate(0, h / 2, 0); const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i]; return g; }

// round-arched arcade (cloister walk) along local x, length L, height h, depth dd. Lean-to roof.
export function arcade(b, M4, L, h = 4.6, dd = 3.6, bay = 3.2, roofCol = 0xb5603b) {
  const n = Math.max(2, Math.round(L / bay)); const bw = L / n;
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + i * bw;
    b.add('marble', G.column(h - bw / 2 - 0.3, 0.26, 10, 'corinth'), mul(M4, mat(x, 0, 0)), 0xeee6d6);
  }
  // arches & spandrel wall above
  b.add('stone', G.wallWithOpenings(L + 0.6, 1.2 + bw / 2, 0.5, Array.from({ length: n }, (_, i) => ({ x: -L / 2 + bw * (i + 0.5), w: bw - 0.5, sh: 0.01, y0: -0.01, type: 'round' })), 10), mul(M4, mat(0, h - bw / 2 - 0.32, 0)), TRIM);
  b.add('stone', G.box(L + 0.8, 0.3, 0.8), mul(M4, mat(0, h + 0.9, 0)), TRIM);
  // back wall
  b.add('plaster', G.box(L, h + 1.2, 0.5), mul(M4, mat(0, 0, -dd)), 0xeee4d2);
  // lean-to roof
  const g = G.box(L + 0.8, 0.2, dd + 1.0);
  b.add('roof', g, mul(M4, mat(0, h + 1.35, -dd / 2), new THREE.Matrix4().makeRotationX(-0.32)), roofCol);
  b.add('paving', G.box(L, 0.2, dd), mul(M4, mat(0, -0.1, -dd / 2)), 0xd9cfbc);
}
