// Procedural textures generated at startup (no image files -> works from file://)
import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// tileable value noise with period P (in lattice cells)
function vnoise(x, y, z, P, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const m = (a) => ((a % P) + P) % P;
  const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1), z0 = m(zi), z1 = m(zi + 1);
  const c000 = hash3(x0, y0, z0, seed), c100 = hash3(x1, y0, z0, seed), c010 = hash3(x0, y1, z0, seed), c110 = hash3(x1, y1, z0, seed);
  const c001 = hash3(x0, y0, z1, seed), c101 = hash3(x1, y0, z1, seed), c011 = hash3(x0, y1, z1, seed), c111 = hash3(x1, y1, z1, seed);
  const a = c000 + (c100 - c000) * u, b = c010 + (c110 - c010) * u, c = c001 + (c101 - c001) * u, d = c011 + (c111 - c011) * u;
  const e = a + (b - a) * v, f = c + (d - c) * v;
  return e + (f - e) * w;
}

function fbm(x, y, z, P, seed, oct) {
  let s = 0, a = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, z * f, P * f, seed + i * 17) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}

export function makeNoise3D(N = 64) {
  const data = new Uint8Array(N * N * N * 4);
  // worley feature points: cells of size N/8
  const C = 8, cs = N / C;
  const pts = [];
  const rnd = mulberry32(1337);
  for (let i = 0; i < C * C * C; i++) pts.push([rnd(), rnd(), rnd()]);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (x + y * N + z * N * N) * 4;
    const P1 = 4; // base lattice period for low fbm (cells across tile)
    const fx = x / N, fy = y / N, fz = z / N;
    const r = fbm(fx * P1, fy * P1, fz * P1, P1, 11, 4);
    const g = fbm(fx * 8, fy * 8, fz * 8, 8, 53, 3);
    // worley
    const cx = Math.floor(x / cs), cy = Math.floor(y / cs), cz = Math.floor(z / cs);
    let d1 = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const qx = cx + dx, qy = cy + dy, qz = cz + dz;
      const wx = ((qx % C) + C) % C, wy = ((qy % C) + C) % C, wz = ((qz % C) + C) % C;
      const p = pts[wx + wy * C + wz * C * C];
      const px = (qx + p[0]) * cs, py = (qy + p[1]) * cs, pz = (qz + p[2]) * cs;
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < d1) d1 = d;
    }
    const b = Math.min(1, Math.sqrt(d1) / cs);
    const a = fbm(fx * 16, fy * 16, fz * 16, 16, 97, 2);
    data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255; data[i + 3] = a * 255;
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Droplet tile: RG = normal xy (0.5 neutral), B = coverage, A = random phase
export function makeDropTile(S = 512, count = 520, seed = 7) {
  const rnd = mulberry32(seed);
  const h = new Float32Array(S * S), ph = new Float32Array(S * S);
  for (let k = 0; k < count; k++) {
    const cx = rnd() * S, cy = rnd() * S;
    const big = rnd() < 0.12;
    const r = big ? 9 + rnd() * 10 : 3 + rnd() * 6;
    const stretch = 1 + rnd() * 0.35;
    const p = rnd();
    const R = Math.ceil(r * stretch) + 1;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const ex = dx / r, ey = dy / (r * stretch);
      const d2 = ex * ex + ey * ey;
      if (d2 >= 1) continue;
      const x = ((Math.floor(cx + dx) % S) + S) % S, y = ((Math.floor(cy + dy) % S) + S) % S;
      const hh = Math.sqrt(1 - d2);
      if (hh > h[x + y * S]) { h[x + y * S] = hh; ph[x + y * S] = p; }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = x + y * S;
    const hx = h[((x + 1) % S) + y * S] - h[((x - 1 + S) % S) + y * S];
    const hy = h[x + ((y + 1) % S) * S] - h[x + ((y - 1 + S) % S) * S];
    data[i * 4] = Math.max(0, Math.min(255, 128 - hx * 140));
    data[i * 4 + 1] = Math.max(0, Math.min(255, 128 - hy * 140));
    data[i * 4 + 2] = Math.min(255, h[i] * 255);
    data[i * 4 + 3] = ph[i] * 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Scratch tile via canvas: R = scratch intensity, G = fine grain, B = dents (soft blobs)
export function makeScratchTile(S = 1024, seed = 3) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  // scratches in R channel
  g.globalCompositeOperation = 'lighter';
  const drawWrapped = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  for (let k = 0; k < 900; k++) {
    const x = rnd() * S, y = rnd() * S;
    const dom = rnd() < 0.6 ? 0.35 + (rnd() - 0.5) * 0.4 : rnd() * Math.PI;
    const len = 10 + Math.pow(rnd(), 2.2) * 220;
    const a = dom;
    const w = 0.5 + rnd() * 1.3;
    const v = Math.floor(30 + rnd() * 140);
    drawWrapped(() => {
      g.strokeStyle = `rgba(${v},0,0,1)`; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y);
      const bend = (rnd() - 0.5) * 0.3;
      g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    });
  }
  // dents in B
  for (let k = 0; k < 60; k++) {
    const x = rnd() * S, y = rnd() * S, r = 12 + rnd() * 50;
    drawWrapped(() => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,120,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    });
  }
  // fine grain in G
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 1] = Math.floor(rnd() * 255);
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}
