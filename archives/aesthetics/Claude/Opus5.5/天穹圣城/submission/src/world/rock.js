import * as THREE from 'three';
import { perlin3, fbm3, ridged3, smoothstep, clamp } from '../core/noise.js';

/**
 * Inverted-cone floating rock. Local frame: top rim at y=0, tip at y=-depth, center on the y axis.
 * Angle convention: theta measured like the clock (0 = -z/back, PI/2 = +x/right, PI = +z/front).
 * opts: { R0, depth, seg, rings, seed, p (taper exponent), lobes, strata, layerH, cracks, lip,
 *         cut(theta, y) -> bool, wet(theta, y) -> 0..1, mossDepth }
 * Returns { geo (indexed, with color + aux attributes), radiusAt(theta, y) }
 */
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
// nearest-cell random value (blocky facets)
function cellRand(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let md = 9, val = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const fx = cx + hash3(cx, cy, cz) - x, fy = cy + hash3(cx + 7, cy, cz) - y, fz = cz + hash3(cx, cy + 3, cz) - z;
    const d = fx * fx + fy * fy * 1.0 + fz * fz;
    if (d < md) { md = d; val = hash3(cx + 11, cy + 5, cz + 1); }
  }
  return val;
}

export function makeRock(o) {
  const R0 = o.R0, depth = o.depth, seg = o.seg || 128, rings = o.rings || 80, seed = (o.seed || 1) * 13.17;
  const p = o.p || 1.35, q = o.q || 0.85, lobes = o.lobes ?? 0.1, strata = o.strata ?? 0.035, layerH = o.layerH || 11, cracks = o.cracks ?? 0.05;
  // (facetScale: cells per radius, vertically elongated for cliff-like blocks)
  const lip = o.lip ?? 0.03, mossDepth = o.mossDepth || 0.3, facets = o.facets ?? 0.05;
  const colA = new THREE.Color(o.colA || 0x857867), colB = new THREE.Color(o.colB || 0x9a8770), colC = new THREE.Color(o.colC || 0x625951);
  const colD = new THREE.Color(o.colD || 0xa69a86);

  function profile(s) {
    // s: 0 top .. 1 tip ; slightly concave toward the spike
    let r = Math.pow(Math.max(0, 1 - Math.pow(s, p)), q);
    r *= 1 - 0.12 * smoothstep(0.55, 0.95, s) * Math.sin(Math.min(1, s) * Math.PI);
    r *= 1 + lip * Math.exp(-Math.pow((s - 0.035) / 0.03, 2));
    return r;
  }
  function radius(theta, s) {
    const y = -s * depth;
    const cx = Math.sin(theta), cz = -Math.cos(theta);
    const k = R0 / 60;
    const nLow = fbm3(cx * 1.3 + seed, cz * 1.3, y / (depth * 0.6), 3);
    const nMid = fbm3(cx * k * 0.7 + seed * 2, cz * k * 0.7, y / 40, 3);
    // strata: irregular sawtooth ledges with per-layer strength
    const wob = perlin3(cx * 2.2 + seed, cz * 2.2, y / 55) * 0.8 + perlin3(cx * 6 + seed, cz * 6, y / 30) * 0.25;
    const lay = y / layerH + wob;
    const li = Math.floor(lay); const saw = lay - li;
    const amp = 0.45 + hash3(li, 3, Math.floor(seed)) * 1.1;
    const ledge = (Math.pow(saw, 2.4) - 0.3) * strata * amp;
    // vertical fissures
    const cr = ridged3(cx * k * 1.7 + seed * 3, cz * k * 1.7, y / 90, 3);
    const crack = -Math.pow(Math.max(0, cr - 0.52) * 2.3, 2.0) * cracks;
    // blocky facets
    const fs = R0 / (o.facetScale || 16);
    const cell = (cellRand(cx * R0 / fs + seed, y / (fs * 1.9), cz * R0 / fs) - 0.5) * facets;
    let f = 1 + nLow * lobes + nMid * lobes * 0.5 + ledge * (0.5 + 0.5 * s) + crack + cell;
    const base = profile(s);
    f += perlin3(cx * 4 + seed, cz * 4, y / 12) * 0.14 * smoothstep(0.55, 1.0, s);
    let r = R0 * base * f;
    if (o.shape) r = o.shape(theta, y, r, f);
    return r;
  }

  const nv = seg * rings + 1;
  const pos = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const aux = new Float32Array(nv * 2);
  const rad = new Float32Array(nv);
  const tmp = new THREE.Color();
  for (let j = 0; j < rings; j++) {
    const u = j / rings;
    const s = Math.pow(u, 1.12);
    const y = -s * depth;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const r = radius(th, s);
      const k = j * seg + i;
      rad[k] = r;
      pos[k * 3] = Math.sin(th) * r; pos[k * 3 + 1] = y + perlin3(Math.sin(th) * 3 + seed, Math.cos(th) * 3, s * 6) * 1.2 * s; pos[k * 3 + 2] = -Math.cos(th) * r;
      // layered colour
      const wob = perlin3(Math.sin(th) * 2.2 + seed, -Math.cos(th) * 2.2, y / 55) * 0.8;
      const li = Math.floor(y / (layerH * 1.7) + wob);
      const lh = hash3(li, 9, Math.floor(seed));
      const n = fbm3(Math.sin(th) * 4 + seed, Math.cos(th) * 4, y / 40, 2) * 0.5 + 0.5;
      tmp.copy(colA).lerp(colB, smoothstep(0.3, 0.8, n));
      if (lh > 0.7) tmp.lerp(colD, 0.55); else if (lh < 0.25) tmp.lerp(colC, 0.45);
      tmp.lerp(colC, smoothstep(0.55, 1.0, s) * 0.5);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      const mn = perlin3(Math.sin(th) * 5 + seed, Math.cos(th) * 5, y / 25) * 0.5 + 0.5;
      aux[k * 2] = clamp((1 - smoothstep(mossDepth * 0.3, mossDepth, s + (mn - 0.5) * 0.25)) * 1.0, 0, 1);
      aux[k * 2 + 1] = o.wet ? o.wet(th, y) : 0;
    }
  }
  // cavity darkening (concave = darker)
  for (let j = 1; j < rings - 1; j++) for (let i = 0; i < seg; i++) {
    const k = j * seg + i;
    const avg = (rad[(j - 1) * seg + i] + rad[(j + 1) * seg + i] + rad[j * seg + (i + 1) % seg] + rad[j * seg + (i + seg - 1) % seg]) * 0.25;
    const cav = clamp((avg - rad[k]) / (R0 * 0.012), -1, 1);
    const m = cav > 0 ? 1 - cav * 0.45 : 1 - cav * 0.12;
    col[k * 3] *= m; col[k * 3 + 1] *= m; col[k * 3 + 2] *= m;
  }
  // tip vertex
  const tip = seg * rings;
  pos[tip * 3] = 0; pos[tip * 3 + 1] = -depth * 1.02; pos[tip * 3 + 2] = 0;
  col[tip * 3] = colC.r; col[tip * 3 + 1] = colC.g; col[tip * 3 + 2] = colC.b;
  aux[tip * 2] = 0; aux[tip * 2 + 1] = 0;

  const idx = [];
  const cut = o.cut;
  const keep = (a, b, c) => {
    if (!cut) return true;
    const cxm = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, czm = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    const ym = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
    const th = Math.atan2(cxm, -czm);
    return !cut(th < 0 ? th + Math.PI * 2 : th, ym);
  };
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = (j + 1) * seg + i, d = (j + 1) * seg + ((i + 1) % seg);
      // outward-facing winding (viewed from outside)
      if (keep(a, b, c)) idx.push(a, b, c);
      if (keep(b, d, c)) idx.push(b, d, c);
    }
  }
  const lj = (rings - 1) * seg;
  for (let i = 0; i < seg; i++) { const a = lj + i, b = lj + ((i + 1) % seg); idx.push(a, b, tip); }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aux', new THREE.BufferAttribute(aux, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  function radiusAt(theta, y) { const s = clamp(-y / depth, 0, 1); return radius(theta, s); }
  // rim radius at angle (y=0)
  function rimAt(theta) { return radius(theta, 0); }
  return { geo, radiusAt, rimAt, depth, R0 };
}

// Top cap disc matching a rock rim. Returns geometry (y=0 plane with slight noise) with radial UVs.
export function makeCap(rock, seg = 128, rings = 12, yNoise = 0.0, inset = 0) {
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let j = 1; j <= rings; j++) {
    const f = j / rings;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const r = (rock.rimAt(th) - inset) * f;
      const y = yNoise ? perlin3(Math.sin(th) * r * 0.05, Math.cos(th) * r * 0.05, 0.5) * yNoise * f * (1 - f) * 4 : 0;
      pos.push(Math.sin(th) * r, y, -Math.cos(th) * r);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let j = 1; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = 1 + (j - 1) * seg + i, b = 1 + (j - 1) * seg + ((i + 1) % seg);
      const c = 1 + j * seg + i, d = 1 + j * seg + ((i + 1) % seg);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
