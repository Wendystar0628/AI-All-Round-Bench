// Deterministic random + noise utilities used by procedural geometry and texture generation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.r()); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length) % arr.length]; }
  chance(p) { return this.r() < p; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.r(); v = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
}

// ---------- Perlin (improved) noise, seeded ----------
const _perm = new Uint8Array(512);
(function initPerm(seed) {
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})(1337);

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }
function grad3(h, x, y, z) {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : (hh === 12 || hh === 14 ? x : z);
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}

export function perlin3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const P = _perm;
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
  const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad3(P[AA], x, y, z), grad3(P[BA], x - 1, y, z), u),
      lerp(grad3(P[AB], x, y - 1, z), grad3(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad3(P[AA + 1], x, y, z - 1), grad3(P[BA + 1], x - 1, y, z - 1), u),
      lerp(grad3(P[AB + 1], x, y - 1, z - 1), grad3(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

export function perlin2(x, y) { return perlin3(x, y, 0.5); }

export function fbm3(x, y, z, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * perlin3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function fbm2(x, y, oct = 4) { return fbm3(x, y, 0.37, oct); }
export function ridged3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(perlin3(x * f, y * f, z * f)); s += a * n * n; a *= 0.5; f *= 2.1; }
  return s;
}

// ---------- Periodic (tileable) noises for texture generation ----------
function hash3i(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// periodic gradient noise in 2D/3D with integer period p (lattice coords wrap)
export function pnoise3(x, y, z, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  let res = 0;
  const g = (ix, iy, iz, dx, dy, dz) => {
    const X = ((ix % p) + p) % p, Y = ((iy % p) + p) % p, Z = ((iz % p) + p) % p;
    const h1 = hash3i(X, Y, Z, seed) * Math.PI * 2;
    const h2 = hash3i(X, Y, Z, seed + 17) * 2 - 1;
    const s = Math.sqrt(1 - h2 * h2);
    return Math.cos(h1) * s * dx + Math.sin(h1) * s * dy + h2 * dz;
  };
  const n000 = g(xi, yi, zi, xf, yf, zf);
  const n100 = g(xi + 1, yi, zi, xf - 1, yf, zf);
  const n010 = g(xi, yi + 1, zi, xf, yf - 1, zf);
  const n110 = g(xi + 1, yi + 1, zi, xf - 1, yf - 1, zf);
  const n001 = g(xi, yi, zi + 1, xf, yf, zf - 1);
  const n101 = g(xi + 1, yi, zi + 1, xf - 1, yf, zf - 1);
  const n011 = g(xi, yi + 1, zi + 1, xf, yf - 1, zf - 1);
  const n111 = g(xi + 1, yi + 1, zi + 1, xf - 1, yf - 1, zf - 1);
  res = lerp(lerp(lerp(n000, n100, u), lerp(n010, n110, u), v), lerp(lerp(n001, n101, u), lerp(n011, n111, u), v), w);
  return res; // ~[-0.9,0.9]
}

export function pfbm3(x, y, z, p, oct, seed = 0) {
  let a = 1, s = 0, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * pnoise3(x * f, y * f, z * f, p * f, seed + i * 31); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// periodic worley F1 distance (normalized cell units), 3D. p = cells per period
export function pworley3(x, y, z, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let md = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const X = ((cx % p) + p) % p, Y = ((cy % p) + p) % p, Z = ((cz % p) + p) % p;
    const fx = cx + hash3i(X, Y, Z, seed) - x;
    const fy = cy + hash3i(X, Y, Z, seed + 5) - y;
    const fz = cz + hash3i(X, Y, Z, seed + 9) - z;
    const d = fx * fx + fy * fy + fz * fz;
    if (d < md) md = d;
  }
  return Math.sqrt(md);
}

export function pworley2(x, y, p, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let md = 9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy;
    const X = ((cx % p) + p) % p, Y = ((cy % p) + p) % p;
    const fx = cx + hash3i(X, Y, 0, seed) - x;
    const fy = cy + hash3i(X, Y, 0, seed + 5) - y;
    const d = fx * fx + fy * fy;
    if (d < md) md = d;
  }
  return Math.sqrt(md);
}

export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export { lerp };
