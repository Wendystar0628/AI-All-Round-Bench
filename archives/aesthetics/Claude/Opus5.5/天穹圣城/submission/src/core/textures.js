import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// ---- fast periodic noise generators (precomputed lattices) ----
class PGrad3 {
  constructor(p, seed) {
    this.p = p; const n = p * p * p; const r = mulberry32(seed);
    this.g = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, z = r() * 2 - 1, s = Math.sqrt(1 - z * z);
      this.g[i * 3] = Math.cos(a) * s; this.g[i * 3 + 1] = Math.sin(a) * s; this.g[i * 3 + 2] = z;
    }
  }
  dot(ix, iy, iz, dx, dy, dz) {
    const p = this.p; const X = ((ix % p) + p) % p, Y = ((iy % p) + p) % p, Z = ((iz % p) + p) % p;
    const k = ((Z * p + Y) * p + X) * 3; const g = this.g;
    return g[k] * dx + g[k + 1] * dy + g[k + 2] * dz;
  }
  noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = f(xf), v = f(yf), w = f(zf);
    const L = (a, b, t) => a + (b - a) * t;
    const n000 = this.dot(xi, yi, zi, xf, yf, zf), n100 = this.dot(xi + 1, yi, zi, xf - 1, yf, zf);
    const n010 = this.dot(xi, yi + 1, zi, xf, yf - 1, zf), n110 = this.dot(xi + 1, yi + 1, zi, xf - 1, yf - 1, zf);
    const n001 = this.dot(xi, yi, zi + 1, xf, yf, zf - 1), n101 = this.dot(xi + 1, yi, zi + 1, xf - 1, yf, zf - 1);
    const n011 = this.dot(xi, yi + 1, zi + 1, xf, yf - 1, zf - 1), n111 = this.dot(xi + 1, yi + 1, zi + 1, xf - 1, yf - 1, zf - 1);
    return L(L(L(n000, n100, u), L(n010, n110, u), v), L(L(n001, n101, u), L(n011, n111, u), v), w);
  }
}

class PWorley3 {
  constructor(p, seed, dim3 = true) {
    this.p = p; this.d3 = dim3; const n = dim3 ? p * p * p : p * p; const r = mulberry32(seed);
    this.f = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.f[i] = r();
  }
  f1(x, y, z) {
    const p = this.p, F = this.f;
    const xi = Math.floor(x), yi = Math.floor(y), zi = this.d3 ? Math.floor(z) : 0;
    let md = 9;
    const zr = this.d3 ? 1 : 0;
    for (let dz = -zr; dz <= zr; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const X = ((cx % p) + p) % p, Y = ((cy % p) + p) % p, Z = this.d3 ? ((cz % p) + p) % p : 0;
      const k = (this.d3 ? ((Z * p + Y) * p + X) : (Y * p + X)) * 3;
      const fx = cx + F[k] - x, fy = cy + F[k + 1] - y;
      const fz = this.d3 ? cz + F[k + 2] - z : 0;
      const d = fx * fx + fy * fy + fz * fz;
      if (d < md) md = d;
    }
    return Math.sqrt(md);
  }
}

function fbmP(gens, x, y, z, baseP) {
  // gens: array of PGrad3 with periods baseP, 2baseP, ...
  let a = 1, s = 0, n = 0, f = 1;
  for (let i = 0; i < gens.length; i++) { s += a * gens[i].noise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function makeNoise2D(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const g8 = [8, 16, 32, 64, 128].map((p, i) => new PGrad3(p, 11 + i));
  const g16 = [16, 32, 64, 128].map((p, i) => new PGrad3(p, 41 + i));
  const w10 = new PWorley3(10, 7, false), w20 = new PWorley3(20, 8, false), w5 = new PWorley3(5, 9, false);
  const w24 = new PWorley3(24, 10, false), w48 = new PWorley3(48, 12, false);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size;
    const r = fbmP(g8, u * 8, v * 8, 0.5, 8) * 0.5 + 0.5;
    // cumulus heaps: inverted worley, layered
    const c1 = 1 - w10.f1(u * 10, v * 10, 0), c2 = 1 - w20.f1(u * 20, v * 20, 0), c0 = 1 - w5.f1(u * 5, v * 5, 0);
    const g = clamp01((c1 * 0.55 + c2 * 0.25 + c0 * 0.35) * 1.25 - 0.45);
    const b = fbmP(g16, u * 16, v * 16, 0.5, 16) * 0.5 + 0.5;
    const a = clamp01(((1 - w24.f1(u * 24, v * 24, 0)) * 0.7 + (1 - w48.f1(u * 48, v * 48, 0)) * 0.3) * 1.3 - 0.35);
    const k = (j * size + i) * 4;
    data[k] = clamp01((r - 0.5) * 1.6 + 0.5) * 255;
    data[k + 1] = g * 255;
    data[k + 2] = clamp01((b - 0.5) * 1.6 + 0.5) * 255;
    data[k + 3] = a * 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function makeNoise3D(size = 64) {
  const data = new Uint8Array(size * size * size * 4);
  const gA = [4, 8, 16].map((p, i) => new PGrad3(p, 101 + i));
  const gB = [8, 16, 32].map((p, i) => new PGrad3(p, 131 + i));
  const w4 = new PWorley3(4, 201), w8 = new PWorley3(8, 202), w16 = new PWorley3(16, 203), w6 = new PWorley3(6, 204);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, w = z / size;
    const pf = fbmP(gA, u * 4, v * 4, w * 4, 4) * 0.5 + 0.5;
    const wf = (1 - w4.f1(u * 4, v * 4, w * 4)) * 0.625 + (1 - w8.f1(u * 8, v * 8, w * 8)) * 0.25 + (1 - w16.f1(u * 16, v * 16, w * 16)) * 0.125;
    // perlin-worley remap
    const pw = clamp01((pf - (1 - wf)) / (1 - (1 - wf) + 1e-4) * 0.5 + pf * 0.5);
    const b = fbmP(gB, u * 8, v * 8, w * 8, 8) * 0.5 + 0.5;
    const a = 1 - w6.f1(u * 6, v * 6, w * 6);
    const k = ((z * size + y) * size + x) * 4;
    data[k] = clamp01((pw - 0.5) * 1.5 + 0.5) * 255;
    data[k + 1] = clamp01((wf - 0.25) * 1.6) * 255;
    data[k + 2] = clamp01((b - 0.5) * 1.6 + 0.5) * 255;
    data[k + 3] = clamp01(a) * 255;
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false; tex.unpackAlignment = 1;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---- canvas textures ----
export function canvasTex(w, h, draw, { srgb = true, repeat = true, mips = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

// Leafy strip texture for hanging vines (alpha). Vertical strip: u across, v along length.
export function makeVineTexture() {
  const r = mulberry32(77);
  return canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // stems
    for (let s = 0; s < 3; s++) {
      g.strokeStyle = `rgba(${70 + s * 8},${84 + s * 6},${40},1)`; g.lineWidth = 2.2;
      g.beginPath();
      let x = w * (0.3 + 0.2 * s);
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) { x += (r() - 0.5) * 7; x = Math.max(12, Math.min(w - 12, x)); g.lineTo(x, y); }
      g.stroke();
    }
    // leaves
    for (let i = 0; i < 520; i++) {
      const y = r() * h; const taper = 1 - Math.pow(y / h, 3) * 0.55;
      const x = w * 0.5 + (r() - 0.5) * w * 0.85 * taper;
      const s = (5 + r() * 8) * (0.7 + 0.3 * taper);
      const a = r() * Math.PI * 2;
      const gcol = 70 + r() * 70, rcol = 40 + r() * 40, bcol = 22 + r() * 28;
      g.fillStyle = `rgb(${rcol | 0},${gcol | 0},${bcol | 0})`;
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      if (r() < 0.06) { // flowers
        g.fillStyle = r() < 0.5 ? 'rgb(236,180,205)' : (r() < 0.5 ? 'rgb(250,240,235)' : 'rgb(190,150,230)');
        g.beginPath(); g.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 2.5 + r() * 2.5, 0, Math.PI * 2); g.fill();
      }
    }
  }, { repeat: true });
}

// leaf cluster texture for flower boxes / hedges (alpha)
export function makeFlowerTexture() {
  const r = mulberry32(91);
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = r() * w, y = r() * h;
      const s = 3 + r() * 6;
      g.fillStyle = `rgb(${(40 + r() * 40) | 0},${(80 + r() * 70) | 0},${(28 + r() * 30) | 0})`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, Math.PI * 2); g.fill();
    }
    const cols = ['#f2a7c3', '#e8566e', '#f7f1e8', '#b993e6', '#f6c85f', '#ff9e6b'];
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.beginPath(); g.arc(x, y, 2 + r() * 3.2, 0, Math.PI * 2); g.fill();
    }
  });
}

// Baluster row pattern (alpha): one baluster per tile in u, v = 0 (bottom) .. 1 (top)
export function makeBalusterTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    // vase profile (width as function of height from bottom)
    const prof = [[0, 0.30], [0.08, 0.30], [0.12, 0.18], [0.3, 0.34], [0.45, 0.3], [0.62, 0.14], [0.74, 0.13], [0.82, 0.22], [0.9, 0.3], [1.0, 0.3]];
    g.beginPath();
    for (let i = 0; i < prof.length; i++) { const [t, r] = prof[i]; const y = h * (1 - t); const x = w / 2 - r * w * 0.9; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    for (let i = prof.length - 1; i >= 0; i--) { const [t, r] = prof[i]; const y = h * (1 - t); g.lineTo(w / 2 + r * w * 0.9, y); }
    g.closePath(); g.fill();
    // plinth and rail bands
    g.fillRect(0, h - 6, w, 6); g.fillRect(0, 0, w, 7);
  }, { srgb: true, repeat: true });
}

// rope net (diamond mesh) for bridge side nets (alpha)
export function makeNetTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 5;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2 + w, h); g.stroke();
      g.beginPath(); g.moveTo(k * w / 2 + w, 0); g.lineTo(k * w / 2, h); g.stroke();
    }
    g.lineWidth = 8; g.beginPath(); g.moveTo(0, 4); g.lineTo(w, 4); g.stroke();
  }, { srgb: true, repeat: true });
}
