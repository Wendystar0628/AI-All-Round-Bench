// asteroids.js — voxel rocks with strata, crevices, through-holes and pre-computed fracture pieces
(function () {
  'use strict';
  const SF = window.SF, M = SF.M, Grid = SF.Grid, hash3 = SF.hash3, v3 = SF.v3;

  // coarse lattice noise field sampled by trilinear interpolation (fast per-voxel evaluation)
  function coarseField(nx, ny, nz, step, seed, freq, oct) {
    const cx = Math.ceil(nx / step) + 2, cy = Math.ceil(ny / step) + 2, cz = Math.ceil(nz / step) + 2;
    const f = new Float32Array(cx * cy * cz);
    for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) f[x + cx * (y + cy * z)] = SF.fbm(x * step * freq, y * step * freq, z * step * freq, seed, oct);
    return (x, y, z) => {
      const fx = x / step, fy = y / step, fz = z / step, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz, i = ix + cx * (iy + cy * iz), sy = cx, sz = cx * cy;
      const a = f[i] + (f[i + 1] - f[i]) * tx, b = f[i + sy] + (f[i + sy + 1] - f[i + sy]) * tx, c = f[i + sz] + (f[i + sz + 1] - f[i + sz]) * tx, d = f[i + sz + sy] + (f[i + sz + sy + 1] - f[i + sz + sy]) * tx;
      const e = a + (b - a) * ty, g = c + (d - c) * ty;
      return e + (g - e) * tz;
    };
  }

  // opts: { lobes, craters, cracks, tunnels, strata, pieces:{ k, plane:{n,off}, focus:[x,y,z], focusN } }
  SF.buildRock = function (seed, R, opts) {
    opts = opts || {};
    const rnd = SF.rng(seed * 7919 + 13);
    const pad = 6, hx = Math.ceil(R[0] * 1.22) + pad, hy = Math.ceil(R[1] * 1.22) + pad, hz = Math.ceil(R[2] * 1.22) + pad;
    const g = new Grid(-hx, -hy, -hz, hx, hy, hz);
    const nx = 2 * hx, ny = 2 * hy, nz = 2 * hz, Rm = (R[0] + R[1] + R[2]) / 3;
    const low = coarseField(nx, ny, nz, 4, seed, 2.2 / Rm, 4), mid = coarseField(nx, ny, nz, 2, seed + 31, 7.5 / Rm, 3);
    // secondary lobes, craters, crevices, tunnels
    const lobes = [], craters = [], cracks = [], tunnels = [];
    const rdir = () => { const z = rnd.s(), a = rnd() * 6.2832, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; };
    for (let i = 0; i < (opts.lobes === undefined ? 3 : opts.lobes); i++) { const d = rdir(); lobes.push({ c: [d[0] * R[0] * 0.55, d[1] * R[1] * 0.55, d[2] * R[2] * 0.55], r: Rm * rnd.r(0.42, 0.62) }); }
    for (let i = 0; i < (opts.craters === undefined ? 5 : opts.craters); i++) { const d = rdir(); craters.push({ c: [d[0] * R[0] * 1.02, d[1] * R[1] * 1.02, d[2] * R[2] * 1.02], r: Rm * rnd.r(0.20, 0.42) }); }
    for (let i = 0; i < (opts.cracks === undefined ? 3 : opts.cracks); i++) { const n = rdir(), d = rdir(); cracks.push({ n, o: rnd.s() * Rm * 0.35, side: d, w: rnd.r(1.3, 2.6) + Rm * 0.012, depth: rnd.r(0.25, 0.5) }); }
    for (let i = 0; i < (opts.tunnels === undefined ? 1 : opts.tunnels); i++) { const d = rdir(), o = rdir(); const off = v3.mul(v3.norm(v3.cross(d, o)), Rm * rnd.r(0.25, 0.5)); tunnels.push({ a: v3.addm(off, d, -Rm * 1.4), b: v3.addm(off, d, Rm * 1.4), r: Rm * rnd.r(0.11, 0.17) }); }
    const sd = v3.norm([rnd.s() * 0.4, 1, rnd.s() * 0.4]), sh = Math.max(4, Math.round(Rm * 0.075));
    const D = g.d;
    for (let z = -hz; z < hz; z++) for (let y = -hy; y < hy; y++) {
      let i = g.idx(-hx, y, z);
      for (let x = -hx; x < hx; x++, i++) {
        const px = x + 0.5, py = y + 0.5, pz = z + 0.5;
        const ex = px / R[0], ey = py / R[1], ez = pz / R[2], d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > 2.2) continue;
        const gx = x + hx, gy = y + hy, gz = z + hz;
        const nl = low(gx, gy, gz) - 0.5, nm = mid(gx, gy, gz) - 0.5;
        let f = 1 - Math.sqrt(d2) + nl * 0.75 + nm * 0.16;
        for (let k = 0; k < lobes.length; k++) { const L = lobes[k], dx = px - L.c[0], dy = py - L.c[1], dz = pz - L.c[2]; const fl = 1 - Math.sqrt(dx * dx + dy * dy + dz * dz) / L.r + nl * 0.6 + nm * 0.14; if (fl > f) f = fl; }
        // strata terraces
        const lay = Math.floor((px * sd[0] + py * sd[1] + pz * sd[2] + nl * 14) / sh);
        const hl = hash3(lay, seed, 3, 7);
        f += (hl - 0.5) * 0.13;
        if (f <= 0) continue;
        let cut = false;
        for (let k = 0; k < craters.length && !cut; k++) { const C = craters[k], dx = px - C.c[0], dy = py - C.c[1], dz = pz - C.c[2]; if (dx * dx + dy * dy + dz * dz < C.r * C.r * (0.8 + nm * 0.9)) cut = true; }
        for (let k = 0; k < cracks.length && !cut; k++) {
          const C = cracks[k], dp = px * C.n[0] + py * C.n[1] + pz * C.n[2] - C.o + nl * 16;
          if (f < C.depth && Math.abs(dp) < C.w * (1 - 0.6 * f / C.depth) && (px * C.side[0] + py * C.side[1] + pz * C.side[2]) > -Rm * 0.2) cut = true;
        }
        for (let k = 0; k < tunnels.length && !cut; k++) {
          const Tn = tunnels[k], ab = v3.sub(Tn.b, Tn.a), ap = [px - Tn.a[0], py - Tn.a[1], pz - Tn.a[2]];
          const tt = SF.sat(v3.dot(ap, ab) / v3.dot(ab, ab)), dx = ap[0] - ab[0] * tt, dy = ap[1] - ab[1] * tt, dz = ap[2] - ab[2] * tt;
          const rr = Tn.r * (0.75 + nm * 1.6 + 0.35 * Math.abs(tt - 0.5));
          if (dx * dx + dy * dy + dz * dz < rr * rr) cut = true;
        }
        if (cut) continue;
        let m = hl < 0.36 ? M.ROCK_C : (hl < 0.74 ? M.ROCK_A : M.ROCK_B);
        if (nm > 0.17 && hl > 0.5) m = M.ROCK_B;
        if (hash3(x >> 1, y >> 1, z >> 1, seed) > 0.985 && f < 0.08) m = M.ROCK_ORE;
        D[i] = m;
      }
    }
    const out = { g, meta: { R, Rm } };
    // ---------- fracture pieces
    const P = opts.pieces;
    if (P) {
      const seeds = [];
      const inside = () => { for (let t = 0; t < 60; t++) { const d = rdir(), s = Math.cbrt(rnd()) * 0.8; const p = [d[0] * R[0] * s, d[1] * R[1] * s, d[2] * R[2] * s]; if (g.get(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]))) return p; } return [0, 0, 0]; };
      for (let i = 0; i < P.k; i++) seeds.push({ p: inside(), w: 1 });
      if (P.focus) for (let i = 0; i < (P.focusN || 0); i++) {
        const d = rdir(), rr = Rm * (P.focusR || 0.3) * (0.3 + 0.7 * rnd());
        seeds.push({ p: [P.focus[0] + d[0] * rr, P.focus[1] + d[1] * rr, P.focus[2] + d[2] * rr], w: 1.5, chip: true });
      }
      const pl = P.plane;
      if (pl) for (const s of seeds) s.side = (v3.dot(s.p, pl.n) - (pl.off || 0)) > 0 ? 1 : 0;
      const K = seeds.length, piece = new Uint8Array(D.length);
      const acc = seeds.map(() => [0, 0, 0, 0]);
      const sw = seeds.map((s, k) => s.w * (1 + (hash3(k, 1, 2, seed) - 0.5) * 0.3)), sgn = seeds.map((s, k) => (k % 2 ? 1 : -1) * Rm * Rm * 0.25), nmK = Rm * Rm * 0.06;
      const bbx = seeds.map(() => [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
      for (let z = -hz; z < hz; z++) for (let y = -hy; y < hy; y++) {
        let i = g.idx(-hx, y, z);
        for (let x = -hx; x < hx; x++, i++) {
          if (!D[i]) continue;
          const px = x + 0.5, py = y + 0.5, pz = z + 0.5, gx = x + hx, gy = y + hy, gz = z + hz;
          const nl = low(gx, gy, gz) - 0.5, nm = mid(gx, gy, gz) - 0.5;
          let side = -1;
          if (pl) side = (px * pl.n[0] + py * pl.n[1] + pz * pl.n[2] - (pl.off || 0) + nl * 26 + nm * 8) > 0 ? 1 : 0;
          let best = -1, bd = 1e18;
          for (let k = 0; k < K; k++) {
            const s = seeds[k]; if (side >= 0 && s.side !== side) continue;
            const dx = px - s.p[0], dy = py - s.p[1], dz = pz - s.p[2];
            const dd = (dx * dx + dy * dy + dz * dz) * sw[k] + nl * sgn[k] + nm * nmK;
            if (dd < bd) { bd = dd; best = k; }
          }
          if (best < 0) best = 0;
          piece[i] = best + 1; const a = acc[best]; a[0] += px; a[1] += py; a[2] += pz; a[3]++;
          const bq = bbx[best]; if (gx < bq[0]) bq[0] = gx; if (gy < bq[1]) bq[1] = gy; if (gz < bq[2]) bq[2] = gz; if (gx > bq[3]) bq[3] = gx; if (gy > bq[4]) bq[4] = gy; if (gz > bq[5]) bq[5] = gz;
        }
      }
      out.piece = piece;
      out.pieces = seeds.map((s, k) => ({ bbox: [bbx[k][0] + 1, bbx[k][1] + 1, bbx[k][2] + 1, bbx[k][3] + 2, bbx[k][4] + 2, bbx[k][5] + 2], id: k + 1, com: acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : s.p.slice(), n: acc[k][3], side: s.side === undefined ? -1 : s.side, chip: !!s.chip }));
    }
    return out;
  };

  // first solid voxel along a ray (model space); returns point or null
  SF.rayRock = function (g, o, d, maxT) {
    d = v3.norm(d); maxT = maxT || 2000;
    for (let t = 0; t < maxT; t += 0.5) {
      const x = Math.floor(o[0] + d[0] * t), y = Math.floor(o[1] + d[1] * t), z = Math.floor(o[2] + d[2] * t);
      if (g.get(x, y, z)) return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    }
    return null;
  };

  // tiny loose chunk shapes (1-7 voxels) for debris: arrays of [x,y,z] offsets
  SF.debrisShapes = [
    [[0, 0, 0]], [[0, 0, 0]], [[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0]], [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0], [1, 0, 1], [1, -1, 0], [0, 0, 1]],
  ];
})();
