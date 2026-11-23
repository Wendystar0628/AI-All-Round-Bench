/* 星际战舰编队 — space environment
 * A cluster of voxel asteroids with layered fracture planes, pre-split into
 * pieces so a hit can separate them along real cracks.  Plus a field of small
 * drifting fragments that scroll past the camera for parallax.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, V = F.Vox, P = F.Palette;
  const VM = V.VoxMesh, VG = V.VoxGrid;

  /* smooth low frequency noise field, evaluated on a coarse lattice */
  function NoiseField(rng, size, scale) {
    const n = size * size * size;
    this.size = size; this.scale = scale;
    this.g = new Float32Array(n);
    for (let i = 0; i < n; i++) this.g[i] = rng() * 2 - 1;
  }
  NoiseField.prototype.sample = function (x, y, z) {
    const s = this.size, sc = this.scale;
    let fx = (x + sc) / (s * 2 * sc) * (s - 1);
    let fy = (y + sc) / (s * 2 * sc) * (s - 1);
    let fz = (z + sc) / (s * 2 * sc) * (s - 1);
    fx = Core.clamp(fx, 0, s - 1.001); fy = Core.clamp(fy, 0, s - 1.001); fz = Core.clamp(fz, 0, s - 1.001);
    const i0 = fx | 0, j0 = fy | 0, k0 = fz | 0;
    const tx = fx - i0, ty = fy - j0, tz = fz - k0;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
    const g = this.g, s1 = this.size, s2 = s1 * s1;
    const idx = (i, j, k) => g[i + j * s1 + k * s2];
    const c00 = idx(i0, j0, k0) + (idx(i0 + 1, j0, k0) - idx(i0, j0, k0)) * ux;
    const c10 = idx(i0, j0 + 1, k0) + (idx(i0 + 1, j0 + 1, k0) - idx(i0, j0 + 1, k0)) * ux;
    const c01 = idx(i0, j0, k0 + 1) + (idx(i0 + 1, j0, k0 + 1) - idx(i0, j0, k0 + 1)) * ux;
    const c11 = idx(i0, j0 + 1, k0 + 1) + (idx(i0 + 1, j0 + 1, k0 + 1) - idx(i0, j0 + 1, k0 + 1)) * ux;
    const c0 = c00 + (c10 - c00) * uy;
    const c1 = c01 + (c11 - c01) * uy;
    return c0 + (c1 - c0) * uz;
  };

  /* carve a voxel rock: noisy sphere, layered material bands, drilled holes.
   * Only the crust is kept, the interior is hollow like a real asteroid.  */
  function rockVoxels(rng, r, opts) {
    const o = opts || {};
    const g = new VG();
    const R = Math.ceil(r) + 2;
    const nf = new NoiseField(rng, 12, R);
    const nf2 = new NoiseField(rng, 10, R * 0.42);
    const seedX = rng() * 400, seedY = rng() * 400, seedZ = rng() * 400;
    for (let x = -R; x <= R; x++) {
      for (let y = -R; y <= R; y++) {
        const rr = r * r - x * x - y * y;
        if (rr <= 4) continue;
        const zmax = Math.floor(Math.sqrt(rr));
        for (let z = -zmax; z <= zmax; z++) {
          const d2 = x * x + y * y + z * z;
          const n = nf.sample(x + seedX, y + seedY, z + seedZ);
          const lim = r * (0.82 + n * 0.34);
          const lim2 = lim * lim;
          if (d2 > lim2) continue;
          const band = lim2 - d2;
          if (band > 5.2) continue;                    // keep only the crust
          // bore through pockets and cracks
          const hole = nf2.sample(x - seedZ, y + seedX, z + seedY);
          if (hole > 0.40 && d2 > r * r * 0.30) continue;
          // layered strata
          const strata = Math.sin(x * 0.17 + y * 0.11 + z * 0.19 + n * 3.2);
          let m = P.rockA;
          if (strata > 0.40) m = P.rockB;
          else if (strata < -0.44) m = P.rockC;
          else if (Core.hash3(x + seedX, y + seedY, z + seedZ) > 0.86) m = P.rockAlt;
          else if (Core.hash3(x + seedZ, y - seedX, z + seedY) > 0.90) m = P.rockAlt2;
          g.set(x, y, z, m);
        }
      }
    }
    return g;
  }

  /* split a grid into two pieces along a plane with normal n */
  function splitGrid(g, nx, ny, nz, bias) {
    const a = new VG(), b = new VG();
    g.map.forEach((m, key) => {
      const z = (key % 4096) - 1024;
      const rest = (key - (z + 1024)) / 4096;
      const y = (rest % 4096) - 1024;
      const x = (rest - (y + 1024)) / 4096 - 1024;
      const jitter = (Core.hash3(x, y, z) - 0.5) * 14 + Math.sin(x * 0.21 + z * 0.17) * 3.5;
      const d = x * nx + y * ny + z * nz + jitter;
      if (d < bias) a.set(x, y, z, m); else b.set(x, y, z, m);
    });
    return [a, b];
  }

  /* -------------------------------------------------------------- */
  function buildCluster(seed) {
    const rng = Core.makeRNG(seed);
    const rocks = [];

    /* the anchor rock: big, pre-split in two along a fracture */
    {
      const g = rockVoxels(rng, 96, {});
      const [a, b] = splitGrid(g, 0.74, 0.28, 0.61, 6);
      const ma = new VM('rockA'), mb = new VM('rockB');
      V.emitGrid(ma, a, { jitter: 0.10 });
      V.emitGrid(mb, b, { jitter: 0.10 });
      rocks.push({
        pieces: [
          { mesh: ma, dir: [0.74, 0.28, 0.61] },
          { mesh: mb, dir: [-0.74, -0.28, -0.61] },
        ],
        pos: [0, 0, 120], radius: 100, big: true, spin: 0.03,
      });
    }
    /* a second large companion */
    {
      const g = rockVoxels(rng, 70, {});
      const m = new VM('rockC');
      V.emitGrid(m, g, { jitter: 0.10 });
      rocks.push({ pieces: [{ mesh: m, dir: [1, 0, 0] }], pos: [-420, 90, -60], radius: 72, spin: -0.04 });
    }
    /* mid rocks */
    const mid = [
      [380, -60, 40, 54], [-250, -140, 220, 48], [180, 170, -180, 44],
      [-560, -30, -220, 38], [540, 140, -300, 42], [-120, -230, -320, 34],
      [330, 250, 180, 30], [-380, 220, 320, 26],
    ];
    for (const m of mid) {
      const g = rockVoxels(rng, m[3], {});
      const mm = new VM('rockM');
      V.emitGrid(mm, g, { jitter: 0.10 });
      rocks.push({ pieces: [{ mesh: mm, dir: [1, 0, 0] }], pos: [m[0], m[1], m[2]], radius: m[3] * 1.2, spin: (rng() - 0.5) * 0.05 });
    }
    /* small rubble */
    const small = [
      [620, -180, 260, 18], [-700, 120, 120, 15], [80, 330, -120, 17],
      [-90, -350, 260, 14], [460, -280, -420, 16], [-480, -260, 420, 13],
      [250, 320, 380, 12], [-620, 320, -140, 11],
    ];
    for (const m of small) {
      const g = rockVoxels(rng, m[3], {});
      const mm = new VM('rockS');
      V.emitGrid(mm, g, { jitter: 0.10 });
      rocks.push({ pieces: [{ mesh: mm, dir: [1, 0, 0] }], pos: [m[0], m[1], m[2]], radius: m[3] * 1.3, spin: (rng() - 0.5) * 0.08 });
    }
    return rocks;
  }

  /* small debris chunk pool (for fracture showers) */
  function buildDebrisPool(seed, count) {
    const rng = Core.makeRNG(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      const r = 4 + rng() * 12;
      const g = rockVoxels(rng, r, {});
      const m = new VM('debris');
      V.emitGrid(m, g, { jitter: 0.12 });
      out.push(m);
    }
    return out;
  }

  /* near-field floating rubble that streaks past the camera */
  function buildDrift(seed, count) {
    const rng = Core.makeRNG(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      const r = 2 + rng() * 7;
      const g = rockVoxels(rng, r, {});
      const m = new VM('drift');
      V.emitGrid(m, g, { jitter: 0.14 });
      const ang = rng() * Math.PI * 2;
      const rad = 120 + rng() * 900;
      out.push({
        mesh: m,
        x: Math.cos(ang) * rad,
        y: (rng() - 0.5) * 520,
        z: rng() * 5200 - 400,
        spin: (rng() - 0.5) * 0.6,
        rot: rng() * 6.28,
      });
    }
    return out;
  }

  F.Space = {
    buildCluster: buildCluster,
    buildDebrisPool: buildDebrisPool,
    buildDrift: buildDrift,
    rockVoxels: rockVoxels,
    splitGrid: splitGrid,
  };
})(window);
