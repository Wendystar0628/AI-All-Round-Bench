import * as THREE from 'three';
import { mat } from '../core/batch.js';
import { perlin3 } from '../core/noise.js';
import * as G from '../core/geo.js';

const _c = new THREE.Color();
const leafCols = {
  cypress: [0x2c4a2a, 0x355631, 0x29432a],
  olive: [0x7c8c58, 0x8a9862, 0x6f8150],
  tree: [0x557a36, 0x4d7032, 0x638a3e, 0x47682e],
  shrub: [0x4f7236, 0x5d8040, 0x466a30],
};

// lumpy blob geometry (icosahedron with noise)
function blob(r, detail = 1, seed = 0, squash = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = perlin3(x / r * 1.7 + seed, y / r * 1.7, z / r * 1.7) * 0.28 + perlin3(x / r * 4 + seed, y / r * 4, z / r * 4) * 0.1;
    const k = 1 + n;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function swayAux(baseY, h, phase) { return (x, y, z) => [Math.max(0, Math.min(1, (y - baseY) / h)) * Math.min(1, h / 10), phase]; }

export function cypress(b, x, y, z, h, rng, key = 'foliage') {
  const r = h * (0.11 + rng.next() * 0.03);
  // trunk (mostly hidden)
  b.add('wood', G.cyl(r * 0.18, r * 0.25, h * 0.2, 5), mat(x, y, z), 0x4a3a2a);
  // spindle foliage
  const prof = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92 + 0.12), 0.9) * (1 - t * 0.35);
    prof.push([Math.max(rr, 0.02), h * 0.08 + t * h * 0.92]);
  }
  const g = G.lathe(prof, 8, false);
  const p = g.attributes.position; const seed = rng.next() * 50;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const k = 1 + perlin3(px * 0.8 + seed, py * 0.6, pz * 0.8) * 0.22;
    p.setXYZ(i, px * k, py, pz * k);
  }
  g.computeVertexNormals();
  _c.setHex(rng.pick(leafCols.cypress));
  b.add(key, g, mat(x, y, z, rng.next() * 6), _c.clone(), { aux: swayAux(y, h, rng.next()) });
}

export function oliveTree(b, x, y, z, s, rng, key = 'foliage') {
  const h = 5.5 * s;
  const lean = (rng.next() - 0.5) * 0.5, ry = rng.next() * 6.28;
  const top = new THREE.Vector3(x + Math.sin(ry) * lean * h * 0.3, y + h * 0.55, z + Math.cos(ry) * lean * h * 0.3);
  const trunk = G.taperTube([new THREE.Vector3(x, y, z), new THREE.Vector3(x + (rng.next() - 0.5) * 0.6 * s, y + h * 0.25, z + (rng.next() - 0.5) * 0.6 * s), top], 0.38 * s, 0.2 * s, 6, 8);
  b.add('wood', trunk, null, 0x5b4a3a);
  const phase = rng.next();
  const nb = 4 + Math.floor(rng.next() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rng.next();
    const rr = (1.2 + rng.next() * 1.4) * s;
    const cx = top.x + Math.cos(a) * rr * 0.9, cz = top.z + Math.sin(a) * rr * 0.9, cy = top.y + (0.6 + rng.next() * 1.6) * s;
    // branch
    b.add('wood', G.taperTube([top.clone(), new THREE.Vector3(cx, cy - 0.4 * s, cz)], 0.14 * s, 0.07 * s, 5, 4), null, 0x5b4a3a);
    _c.setHex(rng.pick(leafCols.olive));
    b.add(key, blob((1.5 + rng.next() * 0.8) * s, 1, rng.next() * 40, 0.7), mat(cx, cy, cz), _c.clone(), { aux: swayAux(y, h * 1.2, phase) });
  }
  _c.setHex(rng.pick(leafCols.olive));
  b.add(key, blob(2.0 * s, 1, rng.next() * 40, 0.65), mat(top.x, top.y + 2.1 * s, top.z), _c.clone(), { aux: swayAux(y, h * 1.2, phase) });
}

export function bigTree(b, x, y, z, s, rng, key = 'foliage') {
  const h = 9 * s;
  const base = new THREE.Vector3(x, y, z);
  const top = new THREE.Vector3(x + 0.6 * s, y + h * 0.6, z - 0.3 * s);
  b.add('wood', G.taperTube([base, new THREE.Vector3(x - 0.3 * s, y + h * 0.3, z + 0.2 * s), top], 0.9 * s, 0.45 * s, 8, 10), null, 0x5a4634);
  // roots flare
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3;
    b.add('wood', G.taperTube([new THREE.Vector3(x, y + 1.2 * s, z), new THREE.Vector3(x + Math.cos(a) * 1.6 * s, y + 0.2, z + Math.sin(a) * 1.6 * s), new THREE.Vector3(x + Math.cos(a) * 2.4 * s, y - 0.2, z + Math.sin(a) * 2.4 * s)], 0.35 * s, 0.08 * s, 5, 6), null, 0x5a4634);
  }
  const phase = rng.next();
  const nb = 6;
  const ends = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rng.next() * 0.5;
    const e = new THREE.Vector3(top.x + Math.cos(a) * 4.2 * s, top.y + (1.5 + rng.next() * 2.5) * s, top.z + Math.sin(a) * 4.2 * s);
    b.add('wood', G.taperTube([top.clone(), new THREE.Vector3((top.x + e.x) / 2, (top.y + e.y) / 2 + 0.8 * s, (top.z + e.z) / 2), e], 0.35 * s, 0.12 * s, 6, 6), null, 0x5a4634);
    ends.push(e);
  }
  for (const e of ends) {
    for (let k = 0; k < 2; k++) {
      _c.setHex(rng.pick(leafCols.tree));
      b.add(key, blob((2.4 + rng.next() * 1.2) * s, 1, rng.next() * 40, 0.8), mat(e.x + (rng.next() - 0.5) * 2 * s, e.y + (rng.next() - 0.2) * 1.5 * s, e.z + (rng.next() - 0.5) * 2 * s), _c.clone(), { aux: swayAux(y, h * 1.3, phase) });
    }
  }
  _c.setHex(rng.pick(leafCols.tree));
  b.add(key, blob(3.6 * s, 1, rng.next() * 40, 0.8), mat(top.x, top.y + 4.5 * s, top.z), _c.clone(), { aux: swayAux(y, h * 1.3, phase) });
}

export function shrub(b, x, y, z, s, rng, col = null, key = 'foliage') {
  _c.setHex(col || rng.pick(leafCols.shrub));
  b.add(key, blob(s, 1, rng.next() * 40, 0.7), mat(x, y + s * 0.45, z), _c.clone(), { aux: swayAux(y, s * 4, rng.next()) });
}

// flowering bush: green blob with colored flower blobs
export function flowerBush(b, x, y, z, s, rng) {
  shrub(b, x, y, z, s, rng);
  const cols = [0xf0a3c0, 0xe0566e, 0xf5efe6, 0xb48fe0, 0xf3c85a];
  const c = rng.pick(cols);
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * 6.28;
    b.add('foliage', blob(s * 0.32, 0, rng.next() * 9, 0.8), mat(x + Math.cos(a) * s * 0.6, y + s * (0.6 + rng.next() * 0.5), z + Math.sin(a) * s * 0.6), c, { aux: swayAux(y, s * 4, rng.next()) });
  }
}

// Hanging vine ribbon from 'top' going down, slightly away from wall along 'out'. Material key 'vine'.
export function vineStrip(b, top, out, length, width, rng, wallTilt = 0) {
  const n = Math.max(3, Math.round(length / 2));
  const side = new THREE.Vector3(out.z, 0, -out.x).normalize();
  const pos = [], uv = [], idx = [];
  const seed = rng.next() * 100;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const yy = -t * length;
    const off = 0.25 + t * 0.6 + wallTilt * t * length + perlin3(seed, t * 3, 0.5) * 0.4;
    const sx = perlin3(seed + 3, t * 2.5, 0.2) * 0.8;
    const w = width * (1 - t * 0.45);
    const c = new THREE.Vector3().copy(top).addScaledVector(out, off).addScaledVector(side, sx);
    c.y += yy;
    const a = c.clone().addScaledVector(side, -w / 2), bb = c.clone().addScaledVector(side, w / 2);
    pos.push(a.x, a.y, a.z, bb.x, bb.y, bb.z);
    uv.push(0, -t * length / 4, 1, -t * length / 4);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // normals face outward
  const nrm = []; for (let i = 0; i <= n; i++) nrm.push(out.x, 0.2, out.z, out.x, 0.2, out.z);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const phase = rng.next();
  _c.setRGB(0.9 + rng.next() * 0.2, 0.9 + rng.next() * 0.2, 0.85);
  b.add('vine', g, null, _c.clone(), { aux: (x, y2, z) => [Math.min(1, (top.y - y2) / Math.max(length, 1)) * 0.8, phase] });
}
