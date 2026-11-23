// js/voxel.js - Unified 1-Unit Sparse Chunked Voxel Grid + Greedy Mesher with Baked Per-Vertex Voxel AO
window.App = window.App || {};

(function (App) {
  const CHUNK_SHIFT = 4;
  const CHUNK_SIZE = 16;
  const CHUNK_MASK = 15;
  const CHUNK_VOL = 4096;

  // Dynamic Float32 growable buffer for fast mesh emission
  class FloatBuilder {
    constructor(initialCap = 16384) {
      this.data = new Float32Array(initialCap);
      this.len = 0;
    }
    ensure(extra) {
      if (this.len + extra <= this.data.length) return;
      let cap = this.data.length;
      while (cap < this.len + extra) cap *= 2;
      const next = new Float32Array(cap);
      next.set(this.data.subarray(0, this.len));
      this.data = next;
    }
    push6(a, b, c, d, e, f) {
      this.ensure(6);
      const arr = this.data;
      let i = this.len;
      arr[i] = a; arr[i + 1] = b; arr[i + 2] = c;
      arr[i + 3] = d; arr[i + 4] = e; arr[i + 5] = f;
      this.len = i + 6;
    }
    finish() {
      return this.data.slice(0, this.len);
    }
  }

  class Uint32Builder {
    constructor(initialCap = 16384) {
      this.data = new Uint32Array(initialCap);
      this.len = 0;
    }
    ensure(extra) {
      if (this.len + extra <= this.data.length) return;
      let cap = this.data.length;
      while (cap < this.len + extra) cap *= 2;
      const next = new Uint32Array(cap);
      next.set(this.data.subarray(0, this.len));
      this.data = next;
    }
    push6(a, b, c, d, e, f) {
      this.ensure(6);
      const arr = this.data;
      let i = this.len;
      arr[i] = a; arr[i + 1] = b; arr[i + 2] = c;
      arr[i + 3] = d; arr[i + 4] = e; arr[i + 5] = f;
      this.len = i + 6;
    }
    finish() {
      return this.data.slice(0, this.len);
    }
  }

  // Sparse 16x16x16 chunked voxel volume.
  // Coordinates are integers in [-1024, 1023].
  // If mirrorX = true, build only x >= 0; meshing automatically mirrors across X = 0 seamlessly!
  class VoxelGrid {
    constructor(mirrorX = false) {
      this.mirrorX = mirrorX;
      this.chunks = new Map();
      this._lastKey = -1;
      this._lastChunk = null;
    }

    _chunkKey(cx, cy, cz) {
      return ((cx + 128) << 16) | ((cy + 128) << 8) | (cz + 128);
    }

    _getChunk(cx, cy, cz, create) {
      const key = ((cx + 128) << 16) | ((cy + 128) << 8) | (cz + 128);
      if (key === this._lastKey && this._lastChunk) return this._lastChunk;
      let ch = this.chunks.get(key);
      if (!ch && create) {
        ch = { cx, cy, cz, data: new Uint8Array(CHUNK_VOL), count: 0 };
        this.chunks.set(key, ch);
      }
      if (ch) {
        this._lastKey = key;
        this._lastChunk = ch;
      }
      return ch;
    }

    set(x, y, z, mat) {
      x |= 0; y |= 0; z |= 0;
      if (this.mirrorX && x < 0) return;
      const cx = x >> CHUNK_SHIFT;
      const cy = y >> CHUNK_SHIFT;
      const cz = z >> CHUNK_SHIFT;
      const ch = this._getChunk(cx, cy, cz, mat !== 0);
      if (!ch) return;
      const idx = (x & CHUNK_MASK) | ((y & CHUNK_MASK) << 4) | ((z & CHUNK_MASK) << 8);
      const prev = ch.data[idx];
      if (prev === mat) return;
      ch.data[idx] = mat;
      if (prev === 0 && mat !== 0) ch.count++;
      else if (prev !== 0 && mat === 0) ch.count--;
    }

    getRaw(x, y, z) {
      const cx = x >> CHUNK_SHIFT;
      const cy = y >> CHUNK_SHIFT;
      const cz = z >> CHUNK_SHIFT;
      const key = ((cx + 128) << 16) | ((cy + 128) << 8) | (cz + 128);
      let ch;
      if (key === this._lastKey) ch = this._lastChunk;
      else {
        ch = this.chunks.get(key);
        if (ch) {
          this._lastKey = key;
          this._lastChunk = ch;
        }
      }
      if (!ch || ch.count === 0) return 0;
      return ch.data[(x & CHUNK_MASK) | ((y & CHUNK_MASK) << 4) | ((z & CHUNK_MASK) << 8)];
    }

    get(x, y, z) {
      x |= 0; y |= 0; z |= 0;
      if (this.mirrorX && x < 0) x = -1 - x;
      return this.getRaw(x, y, z);
    }

    // Fast chunk-batched box fill (inclusive integer bounds [x0..x1, y0..y1, z0..z1])
    fillBox(x0, y0, z0, x1, y1, z1, mat) {
      let ax = Math.floor(Math.min(x0, x1));
      let bx = Math.floor(Math.max(x0, x1));
      let ay = Math.floor(Math.min(y0, y1));
      let by = Math.floor(Math.max(y0, y1));
      let az = Math.floor(Math.min(z0, z1));
      let bz = Math.floor(Math.max(z0, z1));
      if (this.mirrorX) {
        if (bx < 0) return;
        if (ax < 0) ax = 0;
      }
      const cx0 = ax >> 4, cx1 = bx >> 4;
      const cy0 = ay >> 4, cy1 = by >> 4;
      const cz0 = az >> 4, cz1 = bz >> 4;
      const create = mat !== 0;

      for (let cz = cz0; cz <= cz1; cz++) {
        const zStart = Math.max(az, cz << 4) & 15;
        const zEnd = Math.min(bz, (cz << 4) + 15) & 15;
        for (let cy = cy0; cy <= cy1; cy++) {
          const yStart = Math.max(ay, cy << 4) & 15;
          const yEnd = Math.min(by, (cy << 4) + 15) & 15;
          for (let cx = cx0; cx <= cx1; cx++) {
            const ch = this._getChunk(cx, cy, cz, create);
            if (!ch) continue;
            const xStart = Math.max(ax, cx << 4) & 15;
            const xEnd = Math.min(bx, (cx << 4) + 15) & 15;
            const d = ch.data;
            let cnt = ch.count;
            for (let lz = zStart; lz <= zEnd; lz++) {
              const zOff = lz << 8;
              for (let ly = yStart; ly <= yEnd; ly++) {
                const yzOff = zOff | (ly << 4);
                for (let lx = xStart; lx <= xEnd; lx++) {
                  const idx = yzOff | lx;
                  const prev = d[idx];
                  if (prev !== mat) {
                    d[idx] = mat;
                    if (prev === 0) cnt++;
                    else if (mat === 0) cnt--;
                  }
                }
              }
            }
            ch.count = cnt;
          }
        }
      }
    }

    // Hollow box shell of thickness t (saves massive memory & build time on big hull sections!)
    fillHollowBox(x0, y0, z0, x1, y1, z1, thick, mat) {
      const ax = Math.floor(Math.min(x0, x1)), bx = Math.floor(Math.max(x0, x1));
      const ay = Math.floor(Math.min(y0, y1)), by = Math.floor(Math.max(y0, y1));
      const az = Math.floor(Math.min(z0, z1)), bz = Math.floor(Math.max(z0, z1));
      const t = Math.max(1, thick | 0);
      if (bx - ax < t * 2 || by - ay < t * 2 || bz - az < t * 2) {
        this.fillBox(ax, ay, az, bx, by, bz, mat);
        return;
      }
      this.fillBox(ax, ay, az, bx, by, az + t - 1, mat);
      this.fillBox(ax, ay, bz - t + 1, bx, by, bz, mat);
      this.fillBox(ax, ay, az, bx, ay + t - 1, bz, mat);
      this.fillBox(ax, by - t + 1, az, bx, by, bz, mat);
      this.fillBox(ax, ay, az, ax + t - 1, by, bz, mat);
      this.fillBox(bx - t + 1, ay, az, bx, by, bz, mat);
    }

    carveBox(x0, y0, z0, x1, y1, z1) {
      this.fillBox(x0, y0, z0, x1, y1, z1, 0);
    }

    // Paint over existing non-empty voxels (optional filter by oldMat)
    paintBox(x0, y0, z0, x1, y1, z1, mat, onlyOverMat = -1) {
      let ax = Math.floor(Math.min(x0, x1));
      let bx = Math.floor(Math.max(x0, x1));
      let ay = Math.floor(Math.min(y0, y1));
      let by = Math.floor(Math.max(y0, y1));
      let az = Math.floor(Math.min(z0, z1));
      let bz = Math.floor(Math.max(z0, z1));
      if (this.mirrorX) {
        if (bx < 0) return;
        if (ax < 0) ax = 0;
      }
      const cx0 = ax >> 4, cx1 = bx >> 4;
      const cy0 = ay >> 4, cy1 = by >> 4;
      const cz0 = az >> 4, cz1 = bz >> 4;
      for (let cz = cz0; cz <= cz1; cz++) {
        const zStart = Math.max(az, cz << 4) & 15;
        const zEnd = Math.min(bz, (cz << 4) + 15) & 15;
        for (let cy = cy0; cy <= cy1; cy++) {
          const yStart = Math.max(ay, cy << 4) & 15;
          const yEnd = Math.min(by, (cy << 4) + 15) & 15;
          for (let cx = cx0; cx <= cx1; cx++) {
            const ch = this._getChunk(cx, cy, cz, false);
            if (!ch || ch.count === 0) continue;
            const xStart = Math.max(ax, cx << 4) & 15;
            const xEnd = Math.min(bx, (cx << 4) + 15) & 15;
            const d = ch.data;
            for (let lz = zStart; lz <= zEnd; lz++) {
              const zOff = lz << 8;
              for (let ly = yStart; ly <= yEnd; ly++) {
                const yzOff = zOff | (ly << 4);
                for (let lx = xStart; lx <= xEnd; lx++) {
                  const idx = yzOff | lx;
                  const prev = d[idx];
                  if (prev !== 0 && (onlyOverMat < 0 || prev === onlyOverMat)) {
                    d[idx] = mat;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Stepped chamfered slab in XY cross-section extruded along Z
    fillBevelBoxZ(x0, y0, z0, x1, y1, z1, bevelXY, mat, hollow = 0) {
      const ax = Math.floor(Math.min(x0, x1)), bx = Math.floor(Math.max(x0, x1));
      const ay = Math.floor(Math.min(y0, y1)), by = Math.floor(Math.max(y0, y1));
      const az = Math.floor(Math.min(z0, z1)), bz = Math.floor(Math.max(z0, z1));
      const b = Math.max(0, bevelXY | 0);
      for (let step = 0; step <= b; step++) {
        const inset = b - step;
        const ix0 = ax + inset, ix1 = bx - inset;
        const iy0 = ay + step, iy1 = by - step;
        if (ix0 > ix1 || iy0 > iy1) continue;
        if (hollow > 0 && step > 0 && step < b) {
          this.fillBox(ix0, iy0, az, ix0 + hollow - 1, iy1, bz, mat);
          this.fillBox(ix1 - hollow + 1, iy0, az, ix1, iy1, bz, mat);
          this.fillBox(ix0, iy0, az, ix1, iy0 + hollow - 1, bz, mat);
          this.fillBox(ix0, iy1 - hollow + 1, az, ix1, iy1, bz, mat);
        } else {
          this.fillBox(ix0, iy0, az, ix1, iy1, bz, mat);
        }
      }
    }

    // Octagonal/cylindrical voxel ring or solid tube along Z (for engine bells, gun barrels, portals)
    fillCylinderZ(cx, cy, z0, z1, rOut, rIn, mat, octFactor = 0.0) {
      const az = Math.floor(Math.min(z0, z1)), bz = Math.floor(Math.max(z0, z1));
      const rO = Math.ceil(rOut);
      const rOut2 = rOut * rOut;
      const rIn2 = rIn > 0 ? rIn * rIn : -1;
      for (let dy = -rO; dy <= rO; dy++) {
        const y = Math.round(cy + dy);
        for (let dx = -rO; dx <= rO; dx++) {
          const x = Math.round(cx + dx);
          if (this.mirrorX && x < 0) continue;
          let dist2;
          if (octFactor > 0) {
            const adx = Math.abs(dx), ady = Math.abs(dy);
            const oct = Math.max(adx, ady, (adx + ady) * 0.7071);
            const eucl = Math.hypot(dx, dy);
            const d = eucl * (1 - octFactor) + oct * octFactor;
            dist2 = d * d;
          } else {
            dist2 = dx * dx + dy * dy;
          }
          if (dist2 <= rOut2 && dist2 >= rIn2) {
            this.fillBox(x, y, az, x, y, bz, mat);
          }
        }
      }
    }

    // Cylindrical/octagonal voxel ring along Y (for Power Core Atrium tiers, rings, bridge dais)
    fillCylinderY(cx, cz, y0, y1, rOut, rIn, mat, octFactor = 0.0, arcMin = -4, arcMax = 4) {
      const ay = Math.floor(Math.min(y0, y1)), by = Math.floor(Math.max(y0, y1));
      const rO = Math.ceil(rOut);
      const rOut2 = rOut * rOut;
      const rIn2 = rIn > 0 ? rIn * rIn : -1;
      for (let dz = -rO; dz <= rO; dz++) {
        const z = Math.round(cz + dz);
        for (let dx = -rO; dx <= rO; dx++) {
          const x = Math.round(cx + dx);
          if (this.mirrorX && x < 0) continue;
          if (arcMin > -3.5) {
            const ang = Math.atan2(dz, dx);
            if (ang < arcMin || ang > arcMax) continue;
          }
          let d;
          if (octFactor > 0) {
            const adx = Math.abs(dx), adz = Math.abs(dz);
            const oct = Math.max(adx, adz, (adx + adz) * 0.7071);
            const eucl = Math.hypot(dx, dz);
            d = eucl * (1 - octFactor) + oct * octFactor;
          } else {
            d = Math.hypot(dx, dz);
          }
          const d2 = d * d;
          if (d2 <= rOut2 && d2 >= rIn2) {
            this.fillBox(x, ay, z, x, by, z, mat);
          }
        }
      }
    }

    // 3D Voxel Strut / Beam from p0 to p1 with square cross-section half-size rad
    fillStrut(p0, p1, rad, mat) {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))));
      const r = Math.floor(rad);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(p0[0] + dx * t);
        const y = Math.round(p0[1] + dy * t);
        const z = Math.round(p0[2] + dz * t);
        if (r <= 0) this.set(x, y, z, mat);
        else this.fillBox(x - r, y - r, z - r, x + r, y + r, z + r, mat);
      }
    }

    // Greedy Mesher with Baked Per-Vertex 4-Corner Voxel Ambient Occlusion
    // Returns { opaque: { vertices, indices }, transparent: { vertices, indices }, stats }
    buildMesh(options = {}) {
      const skipAO = !!options.skipAO;
      const isTransp = App.Materials.isTransparent;
      const opaqueV = new FloatBuilder(32768);
      const opaqueI = new Uint32Builder(32768);
      const transpV = new FloatBuilder(4096);
      const transpI = new Uint32Builder(4096);

      // 6 face definitions:
      // axis: 0=X, 1=Y, 2=Z; dir: +1 or -1; uAxis, vAxis; normalIdx (0..5)
      // normalIdx: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
      const FACES = [
        { nIdx: 0, axis: 0, dir:  1, uAxis: 2, vAxis: 1 }, // +X
        { nIdx: 1, axis: 0, dir: -1, uAxis: 2, vAxis: 1 }, // -X
        { nIdx: 2, axis: 1, dir:  1, uAxis: 0, vAxis: 2 }, // +Y
        { nIdx: 3, axis: 1, dir: -1, uAxis: 0, vAxis: 2 }, // -Y
        { nIdx: 4, axis: 2, dir:  1, uAxis: 0, vAxis: 1 }, // +Z
        { nIdx: 5, axis: 2, dir: -1, uAxis: 0, vAxis: 1 }, // -Z
      ];

      // Pre-allocate slice mask (16x16 = 256 ints)
      const mask = new Int32Array(256);
      const isOpaqueAt = (x, y, z) => {
        const m = this.get(x, y, z);
        return m !== 0 && !isTransp(m) ? 1 : 0;
      };

      const computeAO = (s1, s2, c) => (s1 && s2 ? 0 : 3 - (s1 + s2 + c));

      let opVertCount = 0;
      let trVertCount = 0;

      const emitQuad = (isT, p0, p1, p2, p3, nIdx, mat, a0, a1, a2, a3, flipWinding) => {
        const vb = isT ? transpV : opaqueV;
        const ib = isT ? transpI : opaqueI;
        const base = isT ? trVertCount : opVertCount;
        if (isT) trVertCount += 4;
        else opVertCount += 4;

        vb.push6(p0[0], p0[1], p0[2], nIdx, mat, a0 / 3.0);
        vb.push6(p1[0], p1[1], p1[2], nIdx, mat, a1 / 3.0);
        vb.push6(p2[0], p2[1], p2[2], nIdx, mat, a2 / 3.0);
        vb.push6(p3[0], p3[1], p3[2], nIdx, mat, a3 / 3.0);

        const flipDiag = (a0 + a2) < (a1 + a3);
        if (!flipWinding) {
          if (!flipDiag) ib.push6(base, base + 1, base + 2, base, base + 2, base + 3);
          else ib.push6(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        } else {
          if (!flipDiag) ib.push6(base, base + 2, base + 1, base, base + 3, base + 2);
          else ib.push6(base + 1, base + 3, base + 2, base + 1, base, base + 3);
        }
      };

      const mirrorX = this.mirrorX;
      const mirrorNormal = [1, 0, 2, 3, 4, 5];

      const coord = [0, 0, 0];
      const nCoord = [0, 0, 0];

      for (const ch of this.chunks.values()) {
        if (ch.count === 0) continue;
        const ox = ch.cx << 4;
        const oy = ch.cy << 4;
        const oz = ch.cz << 4;
        const baseOrig = [ox, oy, oz];
        const chData = ch.data;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const { nIdx, axis, dir, uAxis, vAxis } = face;

          // Correct CCW winding check:
          // p0=(u0,v0), p1=(u1,v0), p2=(u1,v1), p3=(u0,v1)
          // (p1-p0) x (p2-p0) = +uAxis x +vAxis
          // +X (u=Z,v=Y): Z x Y = -X -> need flip!
          // -X (u=Z,v=Y): Z x Y = -X -> matches -X!
          // +Y (u=X,v=Z): X x Z = -Y -> need flip!
          // -Y (u=X,v=Z): X x Z = -Y -> matches -Y!
          // +Z (u=X,v=Y): X x Y = +Z -> matches +Z!
          // -Z (u=X,v=Y): X x Y = +Z -> need flip!
          const flipW = (nIdx === 0 || nIdx === 2 || nIdx === 5);

          for (let slice = 0; slice < 16; slice++) {
            let any = false;
            mask.fill(0);

            for (let v = 0; v < 16; v++) {
              for (let u = 0; u < 16; u++) {
                coord[axis] = slice;
                coord[uAxis] = u;
                coord[vAxis] = v;
                const mat = chData[coord[0] | (coord[1] << 4) | (coord[2] << 8)];
                if (mat === 0) continue;

                const wx = ox + coord[0];
                const wy = oy + coord[1];
                const wz = oz + coord[2];
                nCoord[0] = wx; nCoord[1] = wy; nCoord[2] = wz;
                nCoord[axis] += dir;

                // Neighbor lookup (fast path inside chunk!)
                let nMat;
                const nl = slice + dir;
                if (nl >= 0 && nl < 16) {
                  const nx = axis === 0 ? nl : coord[0];
                  const ny = axis === 1 ? nl : coord[1];
                  const nz = axis === 2 ? nl : coord[2];
                  nMat = chData[nx | (ny << 4) | (nz << 8)];
                } else {
                  nMat = this.get(nCoord[0], nCoord[1], nCoord[2]);
                }

                const matT = isTransp(mat);
                if (!matT) {
                  // Opaque face hidden only by opaque neighbor
                  if (nMat !== 0 && !isTransp(nMat)) continue;
                } else {
                  // Transparent face hidden by identical transparent neighbor
                  if (nMat === mat) continue;
                }

                let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
                if (!skipAO && !matT) {
                  // Sample 8 neighbors in the tangent plane at nCoord
                  const du = [0, 0, 0]; du[uAxis] = 1;
                  const dv = [0, 0, 0]; dv[vAxis] = 1;
                  const bx = nCoord[0], by = nCoord[1], bz = nCoord[2];
                  const sUm = isOpaqueAt(bx - du[0], by - du[1], bz - du[2]);
                  const sUp = isOpaqueAt(bx + du[0], by + du[1], bz + du[2]);
                  const sVm = isOpaqueAt(bx - dv[0], by - dv[1], bz - dv[2]);
                  const sVp = isOpaqueAt(bx + dv[0], by + dv[1], bz + dv[2]);
                  const c00 = isOpaqueAt(bx - du[0] - dv[0], by - du[1] - dv[1], bz - du[2] - dv[2]);
                  const c10 = isOpaqueAt(bx + du[0] - dv[0], by + du[1] - dv[1], bz + du[2] - dv[2]);
                  const c11 = isOpaqueAt(bx + du[0] + dv[0], by + du[1] + dv[1], bz + du[2] + dv[2]);
                  const c01 = isOpaqueAt(bx - du[0] + dv[0], by - du[1] + dv[1], bz - du[2] + dv[2]);
                  a0 = computeAO(sUm, sVm, c00);
                  a1 = computeAO(sUp, sVm, c10);
                  a2 = computeAO(sUp, sVp, c11);
                  a3 = computeAO(sUm, sVp, c01);
                }

                mask[u + (v << 4)] = mat | (a0 << 6) | (a1 << 8) | (a2 << 10) | (a3 << 12);
                any = true;
              }
            }

            if (!any) continue;

            // 2D Greedy merge across mask
            for (let v = 0; v < 16; v++) {
              for (let u = 0; u < 16; ) {
                const key = mask[u + (v << 4)];
                if (key === 0) {
                  u++;
                  continue;
                }
                let w = 1;
                while (u + w < 16 && mask[u + w + (v << 4)] === key) w++;
                let h = 1;
                outer: while (v + h < 16) {
                  for (let k = 0; k < w; k++) {
                    if (mask[u + k + ((v + h) << 4)] !== key) break outer;
                  }
                  h++;
                }
                // Clear merged region
                for (let dv = 0; dv < h; dv++) {
                  const row = (v + dv) << 4;
                  for (let du = 0; du < w; du++) mask[u + du + row] = 0;
                }

                const mat = key & 63;
                const a0 = (key >> 6) & 3;
                const a1 = (key >> 8) & 3;
                const a2 = (key >> 10) & 3;
                const a3 = (key >> 12) & 3;
                const matT = isTransp(mat);

                const planePos = baseOrig[axis] + slice + (dir > 0 ? 1 : 0);
                const u0 = baseOrig[uAxis] + u;
                const u1 = u0 + w;
                const v0 = baseOrig[vAxis] + v;
                const v1 = v0 + h;

                const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0], p3 = [0, 0, 0];
                p0[axis] = p1[axis] = p2[axis] = p3[axis] = planePos;
                p0[uAxis] = u0; p0[vAxis] = v0;
                p1[uAxis] = u1; p1[vAxis] = v0;
                p2[uAxis] = u1; p2[vAxis] = v1;
                p3[uAxis] = u0; p3[vAxis] = v1;

                emitQuad(matT, p0, p1, p2, p3, nIdx, mat, a0, a1, a2, a3, flipW);

                if (mirrorX) {
                  const mp0 = [-p0[0], p0[1], p0[2]];
                  const mp1 = [-p1[0], p1[1], p1[2]];
                  const mp2 = [-p2[0], p2[1], p2[2]];
                  const mp3 = [-p3[0], p3[1], p3[2]];
                  emitQuad(matT, mp0, mp1, mp2, mp3, mirrorNormal[nIdx], mat, a0, a1, a2, a3, !flipW);
                }

                u += w;
              }
            }
          }
        }
      }

      return {
        opaque: {
          vertices: opaqueV.finish(),
          indices: opaqueI.finish(),
        },
        transparent: {
          vertices: transpV.finish(),
          indices: transpI.finish(),
        },
        stats: {
          chunks: this.chunks.size,
          opaqueTris: opaqueI.len / 3,
          transparentTris: transpI.len / 3,
        },
      };
    }
  }

  App.VoxelGrid = VoxelGrid;
})(window.App);
