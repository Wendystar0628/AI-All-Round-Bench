// asteroids.js — voxel asteroid field with fragmenting
(function () {
  'use strict';
  const C = window.C, VB = window.VB;
  const P = C.PAL;

  function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi), c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1), c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  const ROCKC = [P.rock, P.rock2, [104, 95, 86], P.rockLit, P.rockDark, [88, 80, 74]];

  class Asteroid {
    constructor(rng, R, pos, drift) {
      this.R = R; this.pos = pos.slice(); this.home = pos.slice(); this.drift = drift;
      const sx = 0.78 + rng() * 0.45, sy = 0.7 + rng() * 0.5, sz = 0.78 + rng() * 0.45;
      const seed = rng() * 900;
      const map = new Map();
      const Ri = Math.ceil(R);
      for (let x = -Ri; x <= Ri; x++) for (let y = -Ri; y <= Ri; y++) for (let z = -Ri; z <= Ri; z++) {
        const nx = x / sx, ny = y / sy, nz = z / sz;
        const d = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (d > R) continue;
        const n1 = vnoise(nx * 0.13 + seed, ny * 0.13 + seed, nz * 0.13 + seed);
        const n2 = vnoise(nx * 0.42 + seed * 1.7, ny * 0.42 + seed * 1.7, nz * 0.42 + seed * 1.7);
        const surf = R * (0.68 + 0.34 * n1 + 0.12 * n2);
        if (d < surf) {
          let c;
          const band = Math.floor((y + n2 * 8) / 6);
          if (n2 > 0.66) c = P.rockDark;
          else c = ROCKC[((band % 6) + 6) % 6];
          const j = 0.9 + hash3(x * 7, y * 13, z * 3) * 0.2;
          map.set(VB.key(x, y, z), VB.packColor([c[0] * j | 0, c[1] * j | 0, c[2] * j | 0], false, 0, null, false));
        }
      }
      // carve fissures / holes
      const holes = 1 + Math.floor(rng() * 3);
      for (let h = 0; h < holes; h++) {
        let px = (rng() - 0.5) * R, py = (rng() - 0.5) * R, pz = (rng() - 0.5) * R;
        let dx = rng() - 0.5, dy = rng() - 0.5, dz = rng() - 0.5;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        const len = R * (0.5 + rng() * 0.7), rr = 1.5 + rng() * 3.5;
        const steps = Math.floor(len);
        for (let s = 0; s < steps; s++) {
          for (let a = -rr; a <= rr; a++) for (let b2 = -rr; b2 <= rr; b2++) for (let c2 = -rr; c2 <= rr; c2++) {
            if (a * a + b2 * b2 + c2 * c2 > rr * rr) continue;
            map.delete(VB.key(Math.round(px + a), Math.round(py + b2), Math.round(pz + c2)));
          }
          px += dx; py += dy; pz += dz;
        }
      }
      // voxel list + fragments
      const n = map.size;
      const vx = new Int16Array(n), vy = new Int16Array(n), vz = new Int16Array(n), vc = new Uint8Array(n * 3);
      let i = 0, cx = 0, cy = 0, cz = 0;
      for (const [k, c] of map) {
        const p = VB.decodeKey(k);
        const x = p[0], y = p[1], z = p[2];
        vx[i] = x; vy[i] = y; vz[i] = z;
        vc[i * 3] = c & 255; vc[i * 3 + 1] = (c >> 8) & 255; vc[i * 3 + 2] = (c >> 16) & 255;
        cx += x; cy += y; cz += z; i++;
      }
      cx /= n; cy /= n; cz /= n;
      this.count = n; this.vx = vx; this.vy = vy; this.vz = vz; this.vc = vc; this.center = [cx, cy, cz];
      // fracture planes
      const planes = [];
      const npl = 2 + Math.floor(rng() * 2);
      for (let p = 0; p < npl; p++) {
        let a = rng() - 0.5, b2 = rng() - 0.5, c2 = rng() - 0.5;
        const l2 = Math.hypot(a, b2, c2) || 1;
        planes.push({ n: [a / l2, b2 / l2, c2 / l2], d: (rng() - 0.5) * R * 0.35 });
      }
      this.planes = planes;
      // build fragments
      const groups = new Map();
      const heat = new Float32Array(n);
      for (i = 0; i < n; i++) {
        let id = 0, hmin = 1e9;
        for (let p = 0; p < planes.length; p++) {
          const pl = planes[p];
          const dot = (vx[i] - cx) * pl.n[0] + (vy[i] - cy) * pl.n[1] + (vz[i] - cz) * pl.n[2] - pl.d;
          if (dot > 0) id |= (1 << p);
          hmin = Math.min(hmin, Math.abs(dot));
        }
        heat[i] = C.clamp(1 - hmin / 5, 0, 1);
        let g = groups.get(id);
        if (!g) { g = { idx: [], id }; groups.set(id, g); }
        g.idx.push(i);
      }
      // split oversized groups by spatial hash
      const frags = [];
      for (const g of groups.values()) {
        if (g.idx.length > n * 0.42 && g.idx.length > 200) {
          const sub = new Map();
          for (const ii of g.idx) {
            const k2 = (Math.floor(vx[ii] / (R * 0.4)) * 73856093) ^ (Math.floor(vy[ii] / (R * 0.4)) * 19349663) ^ (Math.floor(vz[ii] / (R * 0.4)) * 83492791);
            const key2 = (k2 & 7);
            let s = sub.get(key2);
            if (!s) { s = []; sub.set(key2, s); }
            s.push(ii);
          }
          for (const s of sub.values()) if (s.length > 12) frags.push(this.makeFrag(s, heat, rng));
        } else if (g.idx.length > 0) frags.push(this.makeFrag(g.idx, heat, rng));
      }
      this.frags = frags;
      this.state = 0; this.hitTime = -1; this.impact = [0, 0, 0]; this.age0 = 0;
      this.spin = [rng() * 0.06 - 0.03, rng() * 0.05 - 0.025, rng() * 0.06 - 0.03];
      // static mesh
      const data = this.extractFaces(map);
      this.mesh = VB.buildMesh(window.__gl, data);
      this.rot = [0, 0, 0];
    }
    makeFrag(idx, heat, rng) {
      let cx = 0, cy = 0, cz = 0;
      for (const i of idx) { cx += this.vx[i]; cy += this.vy[i]; cz += this.vz[i]; }
      cx /= idx.length; cy /= idx.length; cz /= idx.length;
      const lp = new Float32Array(idx.length * 3);
      const cl = new Uint8Array(idx.length * 4);
      const ht = new Float32Array(idx.length);
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        lp[k * 3] = this.vx[i] - cx; lp[k * 3 + 1] = this.vy[i] - cy; lp[k * 3 + 2] = this.vz[i] - cz;
        cl[k * 4] = this.vc[i * 3]; cl[k * 4 + 1] = this.vc[i * 3 + 1]; cl[k * 4 + 2] = this.vc[i * 3 + 2]; cl[k * 4 + 3] = 0;
        ht[k] = heat[i];
      }
      let dx = cx - this.center[0], dy = cy - this.center[1], dz = cz - this.center[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = 0.5 + rng() * 1.2;
      return {
        c: [cx, cy, cz], lp, cl, ht, n: idx.length,
        vel: [dx / l * sp + (rng() - 0.5) * 0.5, dy / l * sp + (rng() - 0.5) * 0.5 - 0.1, dz / l * sp + (rng() - 0.5) * 0.5],
        axis: C.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]),
        w: (rng() - 0.5) * 0.7, woff: rng() * 6.28
      };
    }
    extractFaces(map) {
      const data = { pos: [], face: [], col: [] };
      const F = VB.FACES;
      const pos = [], face = [], col = [];
      for (const [k, c] of map) {
        const p = VB.decodeKey(k);
        const x = p[0], y = p[1], z = p[2];
        for (let f = 0; f < 6; f++) {
          const n = F[f].n;
          if (map.has(VB.key(x + n[0], y + n[1], z + n[2]))) continue;
          pos.push(x, y, z); face.push(f);
          const h = hash3(x * 3 + 1, y * 5 + 2, z * 7 + f);
          const j = 0.9 + h * 0.2;
          col.push(C.clamp((c & 255) * j, 0, 255), C.clamp(((c >> 8) & 255) * j, 0, 255), C.clamp(((c >> 16) & 255) * j, 0, 255), 0);
        }
      }
      return { pos: new Float32Array(pos), face: new Uint8Array(face), col: new Uint8Array(col), count: face.length };
    }
    hit(t) {
      if (this.hitTime >= 0) return;
      this.hitTime = t;
    }
    update(travel) {
      const sp = this.spin;
      this.rot = [sp[0] * this.age0, sp[1] * this.age0, sp[2] * this.age0];
      this.pos = [this.home[0] - travel, this.home[1], this.home[2]];
    }
    worldCenter() { return [this.pos[0] + this.center[0], this.pos[1] + this.center[1], this.pos[2] + this.center[2]]; }
    model(t) {
      return C.m4.compose(this.pos, this.rot, [1, 1, 1]);
    }
    draw(renderer, t) {
      this.age0 = t;
      if (this.hitTime < 0 || t < this.hitTime) {
        renderer.drawMesh(this.mesh, this.model(t));
        return;
      }
      const age = t - this.hitTime;
      const grow = C.smoother(C.clamp(age / 1.6, 0, 1));
      const heatFade = C.clamp(1 - age / 2.2, 0, 1);
      const hot = [255, 190, 110];
      for (const f of this.frags) {
        const d = grow * 26;
        const px = f.c[0] + f.vel[0] * d, py = f.c[1] + f.vel[1] * d - age * age * 0.35, pz = f.c[2] + f.vel[2] * d;
        const ang = f.woff + f.w * age * 0.8;
        const ax = f.axis, c = Math.cos(ang), s = Math.sin(ang), t2 = 1 - c;
        const r00 = t2 * ax[0] * ax[0] + c, r01 = t2 * ax[0] * ax[1] - s * ax[2], r02 = t2 * ax[0] * ax[2] + s * ax[1];
        const r10 = t2 * ax[0] * ax[1] + s * ax[2], r11 = t2 * ax[1] * ax[1] + c, r12 = t2 * ax[1] * ax[2] - s * ax[0];
        const r20 = t2 * ax[0] * ax[2] - s * ax[1], r21 = t2 * ax[1] * ax[2] + s * ax[0], r22 = t2 * ax[2] * ax[2] + c;
        const wx = this.pos[0] + px, wy = this.pos[1] + py, wz = this.pos[2] + pz;
        for (let i = 0; i < f.n; i++) {
          const lx = f.lp[i * 3], ly = f.lp[i * 3 + 1], lz = f.lp[i * 3 + 2];
          const X = wx + r00 * lx + r01 * ly + r02 * lz;
          const Y = wy + r10 * lx + r11 * ly + r12 * lz;
          const Z = wz + r20 * lx + r21 * ly + r22 * lz;
          const h = f.ht[i] * heatFade;
          const r = C.lerp(f.cl[i * 4], hot[0], h), g = C.lerp(f.cl[i * 4 + 1], hot[1], h), b2 = C.lerp(f.cl[i * 4 + 2], hot[2], h);
          renderer.pushCube(X, Y, Z, 1, 0, 0, 0, 1, 0, 0, 0, 1, r, g, b2, h * 0.9);
        }
      }
    }
  }

  function buildAsteroids(seed) {
    const rng = C.rng(seed || 7);
    const list = [];
    const big = [
      [1180, -60, 190, 42], [1520, 90, -260, 36], [940, 40, -420, 30],
      [1780, -30, 120, 33], [1320, 150, 480, 27]
    ];
    const mid = [
      [760, -110, 60, 22], [860, 60, -180, 19], [1060, 120, 300, 24], [1420, -90, -80, 20],
      [1620, 40, 380, 17], [660, 20, 240, 16], [1180, 180, -40, 18], [980, -160, -300, 21]
    ];
    const small = [];
    for (let i = 0; i < 16; i++) {
      small.push([500 + rng() * 1700, -260 + rng() * 520, -700 + rng() * 1400, 7 + rng() * 9]);
    }
    for (const a of big) list.push(new Asteroid(rng, a[3], [a[0], a[1], a[2]], 0.55));
    for (const a of mid) list.push(new Asteroid(rng, a[3], [a[0], a[1], a[2]], 0.75));
    for (const a of small) list.push(new Asteroid(rng, a[3], [a[0], a[1], a[2]], 1.1));
    // near-field debris (tiny, fast) for parallax
    const dust = [];
    for (let i = 0; i < 90; i++) {
      dust.push({
        pos: [200 + rng() * 2400, -420 + rng() * 840, -900 + rng() * 1800],
        s: 0.8 + rng() * 2.6, v: 6 + rng() * 14, ph: rng() * 6.28
      });
    }
    return { list, dust };
  }

  window.Asteroids = { buildAsteroids, Asteroid };
})();
