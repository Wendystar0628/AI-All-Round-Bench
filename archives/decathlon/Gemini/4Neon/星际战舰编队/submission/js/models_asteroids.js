// js/models_asteroids.js - True 1-Unit Voxel Craggy Asteroids with Arches, Stratified Crags & Pre-Fractured Interlocking Chunks
window.App = window.App || {};

(function (App) {
  const VoxelGrid = App.VoxelGrid;
  const M = App.MAT;
  const MathU = App.Math;

  // Build an irregular multi-strata voxel asteroid pre-fractured into `numChunks` interlocking pieces.
  // Returns { chunks: [{ mesh, centroid:[x,y,z], dir:[x,y,z] }], radius }
  function buildFracturedAsteroid(cfg) {
    const {
      rx, ry, rz,        // Half-extents in voxels
      numChunks = 6,
      seed = 101,
      hasArch = false,   // Carve a dramatic see-through tunnel / arch!
    } = cfg;

    const rng = MathU.mulberry32(seed);
    const pad = 4;
    const minX = -rx - pad, maxX = rx + pad;
    const minY = -ry - pad, maxY = ry + pad;
    const minZ = -rz - pad, maxZ = rz + pad;
    const sx = maxX - minX + 1;
    const sy = maxY - minY + 1;
    const sz = maxZ - minZ + 1;

    // Sample smooth 3D FBM noise on a coarse stride-4 lattice for blazing speed
    const S = 4;
    const gx = Math.ceil(sx / S) + 2;
    const gy = Math.ceil(sy / S) + 2;
    const gz = Math.ceil(sz / S) + 2;
    const coarse = new Float32Array(gx * gy * gz);
    const warp = new Float32Array(gx * gy * gz);
    const offX = rng() * 100, offY = rng() * 100, offZ = rng() * 100;
    const freq = 2.1 / Math.max(rx, ry, rz);

    for (let kz = 0; kz < gz; kz++) {
      const wz = (minZ + kz * S) * freq + offZ;
      for (let ky = 0; ky < gy; ky++) {
        const wy = (minY + ky * S) * freq + offY;
        const row = (kz * gy + ky) * gx;
        for (let kx = 0; kx < gx; kx++) {
          const wx = (minX + kx * S) * freq + offX;
          coarse[row + kx] = MathU.fbm3(wx, wy, wz, 3);
          warp[row + kx] = MathU.noise3(wx * 2.1 + 17.3, wy * 2.1 + 5.7, wz * 2.1 + 31.1);
        }
      }
    }

    // Generate Voronoi fracture chunk seeds distributed organically inside the rock
    const seeds = [];
    for (let i = 0; i < numChunks; i++) {
      const a = (i / numChunks) * Math.PI * 2 + (rng() - 0.5) * 0.6;
      const elev = (rng() - 0.5) * 1.1;
      const dist = 0.34 + rng() * 0.28;
      seeds.push([
        Math.cos(a) * Math.cos(elev) * rx * dist,
        Math.sin(elev) * ry * dist,
        Math.sin(a) * Math.cos(elev) * rz * dist,
      ]);
    }

    // Generate 3-5 recessed crater pockets on the surface
    const craters = [];
    const numCraters = rx > 40 ? 6 : 3;
    for (let i = 0; i < numCraters; i++) {
      const u = rng() * Math.PI * 2;
      const v = (rng() - 0.5) * 1.4;
      craters.push({
        x: Math.cos(u) * Math.cos(v) * rx * 0.82,
        y: Math.sin(v) * ry * 0.82,
        z: Math.sin(u) * Math.cos(v) * rz * 0.82,
        r2: Math.pow((0.20 + rng() * 0.16) * Math.min(rx, ry, rz), 2),
      });
    }

    // Genuine see-through hollow arch / tunnel in hero asteroids (keeps surrounding Voronoi chunks thick & solid!)
    const archX = (rng() - 0.5) * rx * 0.14;
    const archY = (rng() - 0.5) * ry * 0.14;
    const archR2 = Math.pow(Math.min(rx, ry) * 0.33, 2);

    // Populate flat cell buffer (-1 = empty, 0..numChunks-1 = chunk ID)
    const cells = new Int8Array(sx * sy * sz);
    cells.fill(-1);

    const invRx2 = 1 / (rx * rx);
    const invRy2 = 1 / (ry * ry);
    const invRz2 = 1 / (rz * rz);

    const sampleLattice = (arr, lx, ly, lz) => {
      const fx = lx / S, fy = ly / S, fz = lz / S;
      const ix = fx | 0, iy = fy | 0, iz = fz | 0;
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const c000 = arr[(iz * gy + iy) * gx + ix];
      const c100 = arr[(iz * gy + iy) * gx + ix + 1];
      const c010 = arr[(iz * gy + iy + 1) * gx + ix];
      const c110 = arr[(iz * gy + iy + 1) * gx + ix + 1];
      const c001 = arr[((iz + 1) * gy + iy) * gx + ix];
      const c101 = arr[((iz + 1) * gy + iy) * gx + ix + 1];
      const c011 = arr[((iz + 1) * gy + iy + 1) * gx + ix];
      const c111 = arr[((iz + 1) * gy + iy + 1) * gx + ix + 1];
      const x00 = c000 + (c100 - c000) * tx;
      const x10 = c010 + (c110 - c010) * tx;
      const x01 = c001 + (c101 - c001) * tx;
      const x11 = c011 + (c111 - c011) * tx;
      const y0 = x00 + (x10 - x00) * ty;
      const y1 = x01 + (x11 - x01) * ty;
      return y0 + (y1 - y0) * tz;
    };

    const chunkSum = Array.from({ length: numChunks }, () => [0, 0, 0, 0]);

    for (let lz = 0; lz < sz; lz++) {
      const z = minZ + lz;
      const zn2 = z * z * invRz2;
      for (let ly = 0; ly < sy; ly++) {
        const y = minY + ly;
        const yn2 = y * y * invRy2;
        const baseIdx = (lz * sy + ly) * sx;
        for (let lx = 0; lx < sx; lx++) {
          const x = minX + lx;
          const xn2 = x * x * invRx2;
          const r2 = xn2 + yn2 + zn2;
          if (r2 > 1.45) continue;

          // Dramatic stepped geological cliff terraces + angular crag ridges + fault-line clefts
          const n = sampleLattice(coarse, lx, ly, lz);
          const terraceY = Math.floor(y / 5.0) * 0.65;
          const strata = Math.sin(terraceY + x * 0.045 + n * 3.2) * 0.13;
          // Crisp directional ridge/overhang shear breaks oval potato symmetry
          const ridge = Math.abs(Math.sin((x * 0.032 - z * 0.028) + n * 2.4)) * 0.16;
          // Deep recessed angular fault fissure gouging outer surface
          const cleftDist = Math.abs(x * 0.42 + y * 0.85 - z * 0.31 + (n - 0.5) * 18.0);
          const cleftCarve = (r2 > 0.36 && cleftDist < 3.6) ? 0.24 : 0.0;
          const thresh = 0.57 + (n - 0.44) * 1.02 + strata + ridge - cleftCarve;
          if (r2 > thresh) continue;

          // Carve genuine through-tunnel / hollow arch on hero asteroids!
          if (hasArch) {
            const adx = x - archX + (n - 0.5) * 14;
            const ady = y - archY + (n - 0.5) * 10;
            if (adx * adx + ady * ady < archR2) continue;
          }

          // Carve crisp surface craters / recessed clefts
          let inCrater = false;
          for (let ci = 0; ci < craters.length; ci++) {
            const cr = craters[ci];
            const dx = x - cr.x, dy = y - cr.y, dz = z - cr.z;
            if (dx * dx + dy * dy + dz * dz < cr.r2) {
              inCrater = true;
              break;
            }
          }
          if (inCrater) continue;

          // Assign to nearest warped Voronoi fracture chunk
          const wVal = (sampleLattice(warp, lx, ly, lz) - 0.5) * (Math.min(rx, ry, rz) * 0.48);
          let bestC = 0, bestD = 1e18;
          for (let ci = 0; ci < numChunks; ci++) {
            const sp = seeds[ci];
            const dx = x - sp[0] + wVal;
            const dy = y - sp[1] - wVal * 0.7;
            const dz = z - sp[2] + wVal * 0.5;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD) {
              bestD = d2;
              bestC = ci;
            }
          }
          cells[baseIdx + lx] = bestC;
          const cs = chunkSum[bestC];
          cs[0] += x; cs[1] += y; cs[2] += z; cs[3] += 1;
        }
      }
    }

    // Compute exact integer centroids for each chunk so chunk meshes pivot cleanly around their centers of mass!
    const centroids = chunkSum.map((cs, i) => {
      if (cs[3] === 0) return [Math.round(seeds[i][0]), Math.round(seeds[i][1]), Math.round(seeds[i][2])];
      return [Math.round(cs[0] / cs[3]), Math.round(cs[1] / cs[3]), Math.round(cs[2] / cs[3])];
    });

    // Populate sparse VoxelGrids ONLY for boundary / fracture-plane shell voxels (thickness 2 so AO is 100% exact!)
    const grids = Array.from({ length: numChunks }, () => new VoxelGrid(false));
    const strideY = sx;
    const strideZ = sx * sy;

    for (let lz = 1; lz < sz - 1; lz++) {
      const z = minZ + lz;
      for (let ly = 1; ly < sy - 1; ly++) {
        const y = minY + ly;
        const row = lz * strideZ + ly * strideY;
        for (let lx = 1; lx < sx - 1; lx++) {
          const idx = row + lx;
          const c = cells[idx];
          if (c < 0) continue;

          // Check 6 immediate face neighbors
          const n0 = cells[idx + 1], n1 = cells[idx - 1];
          const n2 = cells[idx + strideY], n3 = cells[idx - strideY];
          const n4 = cells[idx + strideZ], n5 = cells[idx - strideZ];

          const isOuterSurface = (n0 < 0 || n1 < 0 || n2 < 0 || n3 < 0 || n4 < 0 || n5 < 0);
          const isFractureFace =
            (n0 >= 0 && n0 !== c) || (n1 >= 0 && n1 !== c) ||
            (n2 >= 0 && n2 !== c) || (n3 >= 0 && n3 !== c) ||
            (n4 >= 0 && n4 !== c) || (n5 >= 0 && n5 !== c);

          // Skip deeply buried interior voxels (also keep 1-voxel backing layer for exact AO!)
          if (!isOuterSurface && !isFractureFace) {
            const d0 = cells[idx + 2], d1 = cells[idx - 2];
            const d2 = cells[idx + 2 * strideY], d3 = cells[idx - 2 * strideY];
            const d4 = cells[idx + 2 * strideZ], d5 = cells[idx - 2 * strideZ];
            if (d0 === c && d1 === c && d2 === c && d3 === c && d4 === c && d5 === c) continue;
          }

          const x = minX + lx;
          const ctr = centroids[c];
          let mat;
          if (isFractureFace && !isOuterSurface) {
            mat = M.ROCK_FRACTURE; // Glows blazing molten orange when split!
          } else {
            // Stratified layered rock coloring (horizontal/tilted strata + micro crags)
            const band = Math.floor((y * 0.22 + x * 0.08 + z * 0.06) + MathU.hash3(x >> 2, y >> 2, z >> 2) * 1.4);
            const mMod = ((band % 5) + 5) % 5;
            if (mMod === 0) mat = M.ROCK_DARK;
            else if (mMod === 1 || mMod === 2) mat = M.ROCK_MID;
            else if (mMod === 3) mat = M.ROCK_LIGHT;
            else mat = M.ROCK_RUST;
          }
          grids[c].set(x - ctr[0], y - ctr[1], z - ctr[2], mat);
        }
      }
    }

    const chunks = [];
    for (let ci = 0; ci < numChunks; ci++) {
      if (grids[ci].chunks.size === 0) continue;
      const ctr = centroids[ci];
      const len = Math.hypot(ctr[0], ctr[1], ctr[2]) || 1;
      chunks.push({
        mesh: grids[ci].buildMesh(),
        centroid: ctr,
        // Outward separation vector away from rock center
        dir: [ctr[0] / len, ctr[1] / len, ctr[2] / len],
      });
    }

    return {
      chunks,
      radius: Math.max(rx, ry, rz),
    };
  }

  // Build compact irregular true-voxel debris chunks (3..9 voxels across) for flying shrapnel clouds!
  function buildDebrisVariant(size, seed) {
    const g = new VoxelGrid(false);
    const rng = MathU.mulberry32(seed);
    const r = Math.max(1, Math.floor(size * 0.5));
    for (let z = -r; z <= r; z++) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y * 1.15, z * 0.9) / (r + 0.5);
          if (d < 0.72 + rng() * 0.35) {
            const rv = rng();
            const mat = rv < 0.25 ? M.ROCK_FRACTURE : (rv < 0.55 ? M.ROCK_DARK : (rv < 0.85 ? M.ROCK_MID : M.ROCK_RUST));
            g.set(x, y, z, mat);
          }
        }
      }
    }
    return g.buildMesh({ skipAO: true });
  }

  App.AsteroidModels = {
    buildAll() {
      const t0 = performance.now();
      // Hero Asteroid A1 (Main Beam Target! Dramatic asymmetric craggy ridge + see-through arch + 6 interlocking chunks!)
      const heroBeam = buildFracturedAsteroid({
        rx: 92, ry: 56, rz: 60,
        numChunks: 6,
        seed: 401,
        hasArch: true,
      });
      // Hero Asteroid A2 (Vanguard Missile Salvo Target! Tall jagged stepped cliff + arch + 6 interlocking chunks!)
      const heroMissile = buildFracturedAsteroid({
        rx: 86, ry: 66, rz: 54,
        numChunks: 6,
        seed: 709,
        hasArch: true,
      });
      // Medium Asteroids B1 & B2 (Pulse Turret Targets! ~96 voxels across, 4 interlocking chunks!)
      const medA = buildFracturedAsteroid({
        rx: 46, ry: 36, rz: 42,
        numChunks: 4,
        seed: 913,
        hasArch: false,
      });
      const medB = buildFracturedAsteroid({
        rx: 42, ry: 38, rz: 36,
        numChunks: 4,
        seed: 1237,
        hasArch: false,
      });
      // Small CIWS Target Rocks (~42 voxels across, 3 chunks!)
      const smallA = buildFracturedAsteroid({
        rx: 22, ry: 18, rz: 20,
        numChunks: 3,
        seed: 2021,
        hasArch: false,
      });
      const smallB = buildFracturedAsteroid({
        rx: 19, ry: 17, rz: 22,
        numChunks: 3,
        seed: 2459,
        hasArch: false,
      });

      // 6 Varied Voxel Debris Shards (exact 1-unit voxel grid!)
      const debrisMeshes = [
        buildDebrisVariant(3, 3001),
        buildDebrisVariant(5, 3002),
        buildDebrisVariant(6, 3003),
        buildDebrisVariant(8, 3004),
        buildDebrisVariant(4, 3005),
        buildDebrisVariant(7, 3006),
      ];

      const dt = (performance.now() - t0).toFixed(1);
      console.log(`[AsteroidModels] Built in ${dt}ms`, {
        heroBeamChunks: heroBeam.chunks.length,
        heroMissileChunks: heroMissile.chunks.length,
        medAChunks: medA.chunks.length,
      });

      return {
        heroBeam,
        heroMissile,
        medA,
        medB,
        smallA,
        smallB,
        debrisMeshes,
      };
    },
  };
})(window.App);
