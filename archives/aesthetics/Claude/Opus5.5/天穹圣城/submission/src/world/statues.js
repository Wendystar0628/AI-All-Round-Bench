import * as THREE from 'three';
import { mat, mul } from '../core/batch.js';
import { perlin3 } from '../core/noise.js';
import * as G from '../core/geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Robed figure statue. Feet at origin, facing +z, height H. Adds parts to batch b under material key.
// pose: 'staff' | 'guardian' | 'sword' | 'book' | 'raise' | 'wings' | 'spear' | 'orb' | 'pray'
export function addStatue(b, M4, H, pose = 'staff', key = 'marble', seed = 1, color = 0xebe3d3) {
  const parts = [];
  const sd = seed * 7.13;
  // robe (lathe with folds)
  const prof = [
    [0.165, 0], [0.17, 0.02], [0.158, 0.12], [0.14, 0.28], [0.118, 0.45], [0.104, 0.55], [0.112, 0.62], [0.122, 0.7], [0.126, 0.76], [0.112, 0.8], [0.075, 0.83], [0.045, 0.845], [0.042, 0.86],
  ].map(([r, y]) => [r * H, y * H]);
  const robe = G.lathe(prof, 18, false);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x); const t = y / H;
    const fold = Math.sin(a * 9 + perlin3(sd, t * 3, 0.3) * 3) * 0.012 * H * Math.max(0, 1 - t * 1.25) + perlin3(x / H * 6 + sd, y / H * 4, z / H * 6) * 0.01 * H;
    const rr = Math.hypot(x, z); const k = (rr + fold) / Math.max(rr, 1e-4);
    // slight forward stance: flatten the back
    p.setXYZ(i, x * k, y, z * k * (z < 0 ? 0.86 : 1.0));
  }
  robe.computeVertexNormals();
  parts.push([robe, null]);
  // head + hood
  const hy = 0.915 * H;
  parts.push([new THREE.SphereGeometry(0.062 * H, 12, 9), mat(0, hy, 0.006 * H)]);
  if (pose === 'guardian' || pose === 'pray' || pose === 'book') {
    const hood = new THREE.SphereGeometry(0.083 * H, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    parts.push([hood, mul(mat(0, hy - 0.005 * H, -0.008 * H), new THREE.Matrix4().makeRotationX(-0.25))]);
    parts.push([G.cyl(0.07 * H, 0.105 * H, 0.08 * H, 14, true), mat(0, 0.8 * H, -0.006 * H)]);
  } else {
    // hair / laurel
    parts.push([new THREE.SphereGeometry(0.064 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0, hy + 0.004 * H, -0.004 * H)]);
  }
  // mantle over shoulders
  parts.push([new THREE.SphereGeometry(0.13 * H, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(0, 0.735 * H, 0, 0, 1, 0.75, 0.9)]);
  const sh = 0.115 * H, shY = 0.775 * H;
  const arm = (pts, r = 0.03 * H) => parts.push([G.taperTube(pts, r * 1.0, r * 1.25, 7, 10), null]);
  const hand = (v) => parts.push([new THREE.SphereGeometry(0.026 * H, 8, 6), mat(v.x, v.y, v.z)]);
  const cylBetween = (a, bb, r, seg = 8) => {
    const d = new THREE.Vector3().subVectors(bb, a); const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    parts.push([g, new THREE.Matrix4().compose(a, q, V(1, 1, 1))]);
  };
  const Ls = V(-sh, shY, 0), Rs = V(sh, shY, 0);
  if (pose === 'guardian') {
    const sz = 0.2 * H;
    const hL = V(-0.03 * H, 0.64 * H, sz - 0.02 * H), hR = V(0.03 * H, 0.7 * H, sz - 0.02 * H);
    arm([Ls, V(-0.15 * H, 0.62 * H, 0.06 * H), hL]); arm([Rs, V(0.15 * H, 0.66 * H, 0.07 * H), hR]);
    hand(hL); hand(hR);
    cylBetween(V(0, 0, sz), V(0, 1.12 * H, sz), 0.018 * H, 10);
    // staff head: ring + orb
    parts.push([new THREE.TorusGeometry(0.05 * H, 0.008 * H, 6, 18), mat(0, 1.16 * H, sz)]);
    parts.push([new THREE.SphereGeometry(0.028 * H, 10, 8), mat(0, 1.16 * H, sz)]);
  } else if (pose === 'sword') {
    const hp = V(0, 0.56 * H, 0.15 * H);
    arm([Ls, V(-0.12 * H, 0.62 * H, 0.08 * H), V(-0.02 * H, 0.57 * H, 0.15 * H)]); arm([Rs, V(0.12 * H, 0.62 * H, 0.08 * H), V(0.02 * H, 0.58 * H, 0.15 * H)]);
    hand(hp);
    parts.push([G.box(0.05 * H, 0.46 * H, 0.012 * H), mat(0, 0.06 * H, 0.155 * H)]);
    parts.push([G.box(0.17 * H, 0.02 * H, 0.025 * H), mat(0, 0.52 * H, 0.155 * H)]);
    cylBetween(V(0, 0.53 * H, 0.155 * H), V(0, 0.62 * H, 0.155 * H), 0.012 * H);
  } else if (pose === 'book' || pose === 'pray') {
    const hp = V(0, 0.63 * H, 0.12 * H);
    arm([Ls, V(-0.13 * H, 0.64 * H, 0.05 * H), V(-0.04 * H, 0.63 * H, 0.12 * H)]); arm([Rs, V(0.13 * H, 0.64 * H, 0.05 * H), V(0.04 * H, 0.63 * H, 0.12 * H)]);
    if (pose === 'book') parts.push([G.box(0.13 * H, 0.15 * H, 0.035 * H), mul(mat(0, 0.6 * H, 0.14 * H), new THREE.Matrix4().makeRotationX(-0.5))]);
    else hand(hp);
  } else if (pose === 'raise' || pose === 'orb') {
    const up = pose === 'raise' ? V(0.09 * H, 1.06 * H, 0.04 * H) : V(0.16 * H, 0.66 * H, 0.16 * H);
    arm([Rs, pose === 'raise' ? V(0.15 * H, 0.92 * H, 0.03 * H) : V(0.17 * H, 0.66 * H, 0.06 * H), up]);
    arm([Ls, V(-0.16 * H, 0.6 * H, 0.0), V(-0.15 * H, 0.47 * H, 0.04 * H)]);
    hand(up); hand(V(-0.15 * H, 0.47 * H, 0.04 * H));
    if (pose === 'raise') { cylBetween(V(0.09 * H, 1.02 * H, 0.04 * H), V(0.09 * H, 1.16 * H, 0.04 * H), 0.012 * H); parts.push([new THREE.ConeGeometry(0.035 * H, 0.08 * H, 8), mat(0.09 * H, 1.2 * H, 0.04 * H)]); }
    else parts.push([new THREE.SphereGeometry(0.045 * H, 12, 9), mat(up.x, up.y + 0.05 * H, up.z)]);
  } else if (pose === 'spear') {
    const hR = V(0.17 * H, 0.66 * H, 0.06 * H);
    arm([Rs, V(0.18 * H, 0.7 * H, 0.02 * H), hR]); hand(hR);
    cylBetween(V(0.17 * H, 0.0, 0.06 * H), V(0.17 * H, 1.3 * H, 0.06 * H), 0.012 * H);
    parts.push([new THREE.ConeGeometry(0.025 * H, 0.1 * H, 6), mat(0.17 * H, 1.35 * H, 0.06 * H)]);
    arm([Ls, V(-0.16 * H, 0.62 * H, 0.06 * H), V(-0.1 * H, 0.55 * H, 0.14 * H)]);
    const shield = new THREE.CylinderGeometry(0.13 * H, 0.13 * H, 0.02 * H, 20); shield.rotateX(Math.PI / 2);
    parts.push([shield, mat(-0.13 * H, 0.55 * H, 0.17 * H, 0.35)]);
  } else { // staff / wings
    const hR = V(0.14 * H, 0.6 * H, 0.1 * H);
    arm([Rs, V(0.17 * H, 0.64 * H, 0.04 * H), hR]); hand(hR);
    cylBetween(V(0.14 * H, 0.0, 0.1 * H), V(0.14 * H, 1.1 * H, 0.1 * H), 0.012 * H);
    parts.push([new THREE.SphereGeometry(0.03 * H, 10, 8), mat(0.14 * H, 1.12 * H, 0.1 * H)]);
    arm([Ls, V(-0.15 * H, 0.6 * H, 0.03 * H), V(-0.12 * H, 0.5 * H, 0.09 * H)]); hand(V(-0.12 * H, 0.5 * H, 0.09 * H));
  }
  if (pose === 'wings') {
    for (const sgn of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.quadraticCurveTo(0.2 * H, 0.35 * H, 0.08 * H, 0.62 * H);
      for (let i = 0; i < 5; i++) { const t = i / 5; s.lineTo(0.06 * H - t * 0.05 * H, 0.6 * H - t * 0.55 * H); s.lineTo(0.0 - t * 0.03 * H, 0.52 * H - t * 0.5 * H); }
      s.lineTo(0, 0);
      const g = G.extrude(s, 0.02 * H, 0, 6);
      parts.push([g, mul(mat(sgn * 0.05 * H, 0.42 * H, -0.08 * H, sgn * 0.5 + Math.PI / 2 * (sgn > 0 ? 0 : 0)), new THREE.Matrix4().makeScale(sgn, 1, 1), new THREE.Matrix4().makeRotationY(-0.6))]);
    }
  }
  for (const [g, m] of parts) {
    const mm = m ? mul(M4, m) : M4;
    b.add(key, g, mm, color);
  }
}

// pedestal with mouldings, width w, height h. Top at y=h
export function addPedestal(b, M4, w, h, key = 'stone', color = 0xe4dac6) {
  b.add(key, G.box(w * 1.15, h * 0.12, w * 1.15), M4, color);
  b.add(key, G.box(w * 1.05, h * 0.06, w * 1.05), mul(M4, mat(0, h * 0.12, 0)), color);
  b.add(key, G.box(w * 0.92, h * 0.64, w * 0.92), mul(M4, mat(0, h * 0.18, 0)), color);
  b.add(key, G.box(w * 1.04, h * 0.07, w * 1.04), mul(M4, mat(0, h * 0.82, 0)), color);
  b.add(key, G.box(w * 1.12, h * 0.11, w * 1.12), mul(M4, mat(0, h * 0.89, 0)), color);
}
