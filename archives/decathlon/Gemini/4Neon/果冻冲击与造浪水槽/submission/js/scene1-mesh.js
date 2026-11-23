// js/scene1-mesh.js — Smooth Body-Fitted 3D Tetrahedral Jelly Meshes & Topological Fracture Engine
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  // Build 5-tet alternating Freudenthal cube mesh with smooth analytical shape warping
  function buildWarpedTetMesh(nx, ny, nz, mapPointFn) {
    const strideY = (nx + 1) * (nz + 1);
    const strideZ = nx + 1;
    const vCount = (nx + 1) * (ny + 1) * (nz + 1);
    const restPos = new Float32Array(vCount * 3);

    const vid = (ix, iy, iz) => iy * strideY + iz * strideZ + ix;

    for (let iy = 0; iy <= ny; iy++) {
      const v = iy / ny; // [0, 1]
      for (let iz = 0; iz <= nz; iz++) {
        const w = (iz / nz) * 2 - 1; // [-1, 1]
        for (let ix = 0; ix <= nx; ix++) {
          const u = (ix / nx) * 2 - 1; // [-1, 1]
          const p = mapPointFn(u, v, w);
          const idx = vid(ix, iy, iz) * 3;
          restPos[idx] = p[0];
          restPos[idx + 1] = p[1];
          restPos[idx + 2] = p[2];
        }
      }
    }

    const tets = [];
    const addTet = (a, b, c, d) => {
      const ax = restPos[a * 3], ay = restPos[a * 3 + 1], az = restPos[a * 3 + 2];
      const e1x = restPos[b * 3] - ax, e1y = restPos[b * 3 + 1] - ay, e1z = restPos[b * 3 + 2] - az;
      const e2x = restPos[c * 3] - ax, e2y = restPos[c * 3 + 1] - ay, e2z = restPos[c * 3 + 2] - az;
      const e3x = restPos[d * 3] - ax, e3y = restPos[d * 3 + 1] - ay, e3z = restPos[d * 3 + 2] - az;
      const det = e1x * (e2y * e3z - e2z * e3y) - e1y * (e2x * e3z - e2z * e3x) + e1z * (e2x * e3y - e2y * e3x);
      if (Math.abs(det) < 1e-8) return;
      if (det > 0) tets.push(a, b, c, d);
      else tets.push(a, b, d, c);
    };

    for (let iy = 0; iy < ny; iy++) {
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const c000 = vid(ix, iy, iz);
          const c100 = vid(ix + 1, iy, iz);
          const c010 = vid(ix, iy + 1, iz);
          const c110 = vid(ix + 1, iy + 1, iz);
          const c001 = vid(ix, iy, iz + 1);
          const c101 = vid(ix + 1, iy, iz + 1);
          const c011 = vid(ix, iy + 1, iz + 1);
          const c111 = vid(ix + 1, iy + 1, iz + 1);

          if (((ix + iy + iz) & 1) === 0) {
            addTet(c000, c100, c110, c101);
            addTet(c000, c110, c010, c011);
            addTet(c000, c101, c011, c001);
            addTet(c111, c110, c101, c011);
            addTet(c000, c110, c011, c101);
          } else {
            addTet(c100, c000, c001, c010);
            addTet(c100, c010, c111, c110);
            addTet(c100, c001, c101, c111);
            addTet(c011, c001, c010, c111);
            addTet(c100, c001, c010, c111);
          }
        }
      }
    }

    return { restPos, tets: new Int32Array(tets) };
  }

  // Elliptical disk mapping: [-1,1]^2 -> smooth pole-free unit disk
  function squareToDisk(u, w) {
    const x = u * Math.sqrt(Math.max(0, 1 - 0.5 * w * w));
    const z = w * Math.sqrt(Math.max(0, 1 - 0.5 * u * u));
    return [x, z];
  }

  // Shape 1: Center Hero Ruby Fluted Crown Pudding Dome
  function createFlutedDomeMesh(opts) {
    const rBase = opts.rBase || 0.86;
    const rTop = opts.rTop || 0.60;
    const height = opts.height || 0.90;
    const lobes = opts.lobes || 10;
    const fluteAmp = opts.fluteAmp !== undefined ? opts.fluteAmp : 0.042;
    const nx = opts.nx || 10, ny = opts.ny || 7, nz = opts.nz || 10;

    return buildWarpedTetMesh(nx, ny, nz, (u, v, w) => {
      const [dx, dz] = squareToDisk(u, w);
      const rDisk = Math.hypot(dx, dz);
      const theta = Math.atan2(dz, dx);

      // Gentle pudding taper + softly domed crown shoulder
      let rProfile = rBase + (rTop - rBase) * Math.pow(v, 0.85);
      // Slight elegant waist flare at bottom & soft shoulder rounding at top
      const baseFlare = 1.0 + 0.04 * Math.exp(-v * 6.0);
      const topRound = v > 0.78 ? Math.sqrt(Math.max(0.42, 1.0 - Math.pow((v - 0.78) / 0.28, 2) * 0.42)) : 1.0;
      const flute = 1.0 + fluteAmp * Math.cos(lobes * theta) * Math.sin(Math.PI * v) * Math.min(1, rDisk * 1.15);
      const rad = rProfile * baseFlare * topRound * flute;

      // Softly crown the very top center
      const crownLift = v > 0.70 ? (1.0 - rDisk * rDisk) * 0.075 * ((v - 0.70) / 0.30) : 0.0;
      // Keep base perfectly flat at y = 0
      const y = Math.max(0, v * height + crownLift);
      return [dx * rad, y, dz * rad];
    });
  }

  // Shape 2: Soft Rounded Cushion Block (Amber Citrus Jelly)
  function createCushionMesh(opts) {
    const sx = opts.sx || 1.12;
    const sy = opts.sy || 0.74;
    const sz = opts.sz || 1.02;
    const nx = opts.nx || 7, ny = opts.ny || 5, nz = opts.nz || 7;

    return buildWarpedTetMesh(nx, ny, nz, (u, v, w) => {
      // Soft pillow rounding (superellipsoid blend)
      const [dx, dz] = squareToDisk(u, w);
      const x = (u * 0.72 + dx * 0.28) * (sx * 0.5);
      const z = (w * 0.72 + dz * 0.28) * (sz * 0.5);
      const rNorm = Math.min(1, Math.hypot(u, w) * 0.72);
      // Slight taper & soft pillowed top
      const taper = 1.0 - 0.09 * v - (v > 0.75 ? 0.08 * ((v - 0.75) / 0.25) : 0);
      const topDome = v > 0.65 ? (1.0 - rNorm * rNorm) * 0.07 * ((v - 0.65) / 0.35) : 0;
      const y = Math.max(0, v * sy + topDome);
      return [x * taper, y, z * taper];
    });
  }

  // Shape 3: Sculpted Hexagonal/Ribbed Tall Jelly Tower (Emerald Lime Jelly)
  function createPrismTowerMesh(opts) {
    const rBase = opts.rBase || 0.65;
    const rTop = opts.rTop || 0.54;
    const height = opts.height || 1.04;
    const nx = opts.nx || 7, ny = opts.ny || 7, nz = opts.nz || 7;

    return buildWarpedTetMesh(nx, ny, nz, (u, v, w) => {
      const [dx, dz] = squareToDisk(u, w);
      const rDisk = Math.hypot(dx, dz);
      const theta = Math.atan2(dz, dx);
      // 6-sided soft sculpted faceted cylinder
      const hexMod = 1.0 + 0.055 * Math.cos(6 * theta) * Math.min(1, rDisk * 1.1);
      const topRound = v > 0.82 ? 1.0 - 0.12 * Math.pow((v - 0.82) / 0.18, 2) : 1.0;
      const rProfile = (rBase + (rTop - rBase) * v) * hexMod * topRound;
      const crown = v > 0.75 ? (1.0 - rDisk * rDisk) * 0.055 * ((v - 0.75) / 0.25) : 0;
      return [dx * rProfile, Math.max(0, v * height + crown), dz * rProfile];
    });
  }

  // Live Soft-Body Jelly Entity with Dynamic Topological Node-Splitting Fracture
  class JellyBody {
    constructor(config) {
      this.id = config.id;
      this.name = config.name;
      this.offset = config.offset ? config.offset.slice() : [0, 0, 0];
      // Visual optical properties (Beer-Lambert absorption + bright scatter tint)
      this.absorption = config.absorption || [0.45, 2.35, 2.15];
      this.scatterColor = config.scatterColor || [1.0, 0.22, 0.32];
      this.baseTint = config.baseTint || [0.95, 0.18, 0.28];
      // Material scales relative to global sliders
      this.stiffnessScale = config.stiffnessScale !== undefined ? config.stiffnessScale : 1.0;
      this.toughnessScale = config.toughnessScale !== undefined ? config.toughnessScale : 1.0;
      this.density = config.density || 1.12;
      this.dampingScale = config.dampingScale !== undefined ? config.dampingScale : 1.0;

      const mesh = config.mesh;
      this.initVertexCount = mesh.restPos.length / 3;
      this.tetCount = mesh.tets.length / 4;

      // Pre-allocate generous capacity for topological node splitting (up to +1400 split vertices!)
      this.maxVertices = this.initVertexCount + 1600;
      this.numVertices = this.initVertexCount;

      this.pos = new Float32Array(this.maxVertices * 3);
      this.prevPos = new Float32Array(this.maxVertices * 3);
      this.vel = new Float32Array(this.maxVertices * 3);
      this.restPos = new Float32Array(this.maxVertices * 3);
      this.invMass = new Float32Array(this.maxVertices);
      this.mass = new Float32Array(this.maxVertices);
      this.isSplitVert = new Uint8Array(this.maxVertices);
      this.splitDepth = new Uint8Array(this.maxVertices);
      this.splitOrigin = new Int32Array(this.maxVertices);
      this.damage = new Float32Array(this.maxVertices);
      this.crackNormal = new Float32Array(this.maxVertices * 3);
      this.isBoundary = new Uint8Array(this.maxVertices);

      // Copy initial rest positions shifted by world offset
      for (let i = 0; i < this.initVertexCount; i++) {
        const rx = mesh.restPos[i * 3];
        const ry = mesh.restPos[i * 3 + 1];
        const rz = mesh.restPos[i * 3 + 2];
        this.restPos[i * 3] = rx;
        this.restPos[i * 3 + 1] = ry;
        this.restPos[i * 3 + 2] = rz;
        this.pos[i * 3] = rx + this.offset[0];
        this.pos[i * 3 + 1] = ry + this.offset[1];
        this.pos[i * 3 + 2] = rz + this.offset[2];
        this.prevPos[i * 3] = this.pos[i * 3];
        this.prevPos[i * 3 + 1] = this.pos[i * 3 + 1];
        this.prevPos[i * 3 + 2] = this.pos[i * 3 + 2];
        this.splitOrigin[i] = i;
      }

      // Mutable tetrahedra indices (updated on topological split!)
      this.tets = new Int32Array(mesh.tets);
      // Precomputed Dm^-1 (9 floats per tet) and rest volume V0
      this.invDm = new Float32Array(this.tetCount * 9);
      this.restVol = new Float32Array(this.tetCount);

      // Build vertex->tet adjacency lists (maintained dynamically on split)
      this.vertTets = new Array(this.maxVertices);
      for (let i = 0; i < this.numVertices; i++) this.vertTets[i] = [];

      // Record initial exterior faces so any newly exposed face after split is flagged as fracture face!
      this.initialFaceSet = new Set();

      this._precomputeRestGeometry();
      this._recomputeMasses();
      this.boundaryTris = null; // Int32Array of 3*N
      this.boundaryIsFracture = null; // Uint8Array of N
      this.boundaryVertList = [];
      this.splitCount = 0;
      this.totalCracks = 0;
      this.activeCracks = []; // Dynamically nucleated stress-driven crack fronts
      this.rebuildBoundary(true);

      // Scratch buffers for stress evaluation
      this.vertStress = new Float32Array(this.maxVertices);
      this.vertStressDir = new Float32Array(this.maxVertices * 3);
      this.vertStressW = new Float32Array(this.maxVertices);
    }

    _precomputeRestGeometry() {
      const rp = this.restPos;
      const tets = this.tets;
      for (let t = 0; t < this.tetCount; t++) {
        const i0 = tets[t * 4], i1 = tets[t * 4 + 1], i2 = tets[t * 4 + 2], i3 = tets[t * 4 + 3];
        this.vertTets[i0].push(t);
        this.vertTets[i1].push(t);
        this.vertTets[i2].push(t);
        this.vertTets[i3].push(t);

        const x0 = rp[i0 * 3], y0 = rp[i0 * 3 + 1], z0 = rp[i0 * 3 + 2];
        const a00 = rp[i1 * 3] - x0, a10 = rp[i1 * 3 + 1] - y0, a20 = rp[i1 * 3 + 2] - z0;
        const a01 = rp[i2 * 3] - x0, a11 = rp[i2 * 3 + 1] - y0, a21 = rp[i2 * 3 + 2] - z0;
        const a02 = rp[i3 * 3] - x0, a12 = rp[i3 * 3 + 1] - y0, a22 = rp[i3 * 3 + 2] - z0;

        // Cofactors / det of Dm (column-major: col0=(a00,a10,a20), col1=(a01,a11,a21), col2=(a02,a12,a22))
        const c00 = a11 * a22 - a12 * a21;
        const c01 = a12 * a20 - a10 * a22;
        const c02 = a10 * a21 - a11 * a20;
        const det = a00 * c00 + a01 * c01 + a02 * c02;
        const vol = Math.abs(det) / 6.0;
        this.restVol[t] = Math.max(vol, 1e-6);

        const invDet = 1.0 / (det || 1e-8);
        const o = t * 9;
        // Row-major storage of Dm^-1: invDm[row*3 + col]
        // B = Dm^-1: row 0 = [c00, a02*a21 - a01*a22, a01*a12 - a02*a11] / det
        this.invDm[o + 0] = c00 * invDet;
        this.invDm[o + 1] = (a02 * a21 - a01 * a22) * invDet;
        this.invDm[o + 2] = (a01 * a12 - a02 * a11) * invDet;
        this.invDm[o + 3] = c01 * invDet;
        this.invDm[o + 4] = (a00 * a22 - a02 * a20) * invDet;
        this.invDm[o + 5] = (a02 * a10 - a00 * a12) * invDet;
        this.invDm[o + 6] = c02 * invDet;
        this.invDm[o + 7] = (a01 * a20 - a00 * a21) * invDet;
        this.invDm[o + 8] = (a00 * a11 - a01 * a10) * invDet;
      }
    }

    _recomputeMasses() {
      const n = this.numVertices;
      this.mass.fill(0, 0, n);
      const tets = this.tets;
      for (let t = 0; t < this.tetCount; t++) {
        const m4 = 0.25 * this.restVol[t] * this.density;
        this.mass[tets[t * 4]] += m4;
        this.mass[tets[t * 4 + 1]] += m4;
        this.mass[tets[t * 4 + 2]] += m4;
        this.mass[tets[t * 4 + 3]] += m4;
      }
      for (let i = 0; i < n; i++) {
        this.invMass[i] = this.mass[i] > 1e-7 ? 1.0 / this.mass[i] : 0.0;
      }
    }

    // Fast exact boundary face extraction (O(tetCount))
    rebuildBoundary(isInitial) {
      const faceMap = new Map();
      const tets = this.tets;
      const addFace = (a, b, c) => {
        // Canonical sorted key for 3 vertex indices (< 16384 -> fits cleanly in 42-bit JS Number)
        let s0 = a, s1 = b, s2 = c;
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        if (s1 > s2) { const tmp = s1; s1 = s2; s2 = tmp; }
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        const key = s0 + s1 * 16384 + s2 * 268435456;
        if (faceMap.has(key)) {
          faceMap.delete(key); // Shared interior face -> cancel out!
        } else {
          faceMap.set(key, [a, b, c]);
        }
      };

      for (let t = 0; t < this.tetCount; t++) {
        const a = tets[t * 4], b = tets[t * 4 + 1], c = tets[t * 4 + 2], d = tets[t * 4 + 3];
        addFace(a, c, b);
        addFace(a, b, d);
        addFace(b, c, d);
        addFace(a, d, c);
      }

      const triCount = faceMap.size;
      const tris = new Int32Array(triCount * 3);
      const isFrac = new Uint8Array(triCount);
      this.isBoundary.fill(0, 0, this.numVertices);
      const bVerts = [];
      let ptr = 0, fIdx = 0;

      for (const f of faceMap.values()) {
        const a = f[0], b = f[1], c = f[2];
        tris[ptr++] = a;
        tris[ptr++] = b;
        tris[ptr++] = c;

        // Check original topology face key to distinguish outer skin vs newly fractured interior face
        let o0 = this.splitOrigin[a], o1 = this.splitOrigin[b], o2 = this.splitOrigin[c];
        if (o0 > o1) { const tmp = o0; o0 = o1; o1 = tmp; }
        if (o1 > o2) { const tmp = o1; o1 = o2; o2 = tmp; }
        if (o0 > o1) { const tmp = o0; o0 = o1; o1 = tmp; }
        const origKey = o0 + o1 * 16384 + o2 * 268435456;
        if (isInitial) {
          this.initialFaceSet.add(origKey);
          isFrac[fIdx] = 0;
        } else {
          isFrac[fIdx] = this.initialFaceSet.has(origKey) ? 0 : 1;
        }
        fIdx++;

        if (!this.isBoundary[a]) { this.isBoundary[a] = 1; bVerts.push(a); }
        if (!this.isBoundary[b]) { this.isBoundary[b] = 1; bVerts.push(b); }
        if (!this.isBoundary[c]) { this.isBoundary[c] = 1; bVerts.push(c); }
      }

      this.boundaryTris = tris;
      this.boundaryIsFracture = isFrac;
      this.boundaryVertList = bVerts;
    }

    // Coherent Material-Space Topological Node Split along stress-nucleated crack plane (ox,oy,oz, nx,ny,nz)
    // Partitioning incident tetrahedra consistently by rest centroid against the stress-computed sheet
    // produces clean, watertight, conchoidal gelatin fracture walls with zero spiky single-tet confetti!
    splitVertexAlongSheet(vi, ox, oy, oz, nx, ny, nz, worldNx, worldNy, worldNz) {
      if (this.numVertices >= this.maxVertices - 2) return false;
      if (this.splitDepth[vi] >= 2) return false;
      const inc = this.vertTets[vi];
      if (!inc || inc.length < 2) return false;

      const sideA = [];
      const sideB = [];
      const tets = this.tets;
      const rp = this.restPos;

      for (let k = 0; k < inc.length; k++) {
        const t = inc[k];
        const i0 = tets[t * 4], i1 = tets[t * 4 + 1], i2 = tets[t * 4 + 2], i3 = tets[t * 4 + 3];
        const cx = 0.25 * (rp[i0 * 3] + rp[i1 * 3] + rp[i2 * 3] + rp[i3 * 3]);
        const cy = 0.25 * (rp[i0 * 3 + 1] + rp[i1 * 3 + 1] + rp[i2 * 3 + 1] + rp[i3 * 3 + 1]);
        const cz = 0.25 * (rp[i0 * 3 + 2] + rp[i1 * 3 + 2] + rp[i2 * 3 + 2] + rp[i3 * 3 + 2]);
        const d = (cx - ox) * nx + (cy - oy) * ny + (cz - oz) * nz;
        if (d >= 0) sideA.push(t);
        else sideB.push(t);
      }

      if (sideA.length === 0 || sideB.length === 0) return false;

      const vj = this.numVertices++;
      this.vertTets[vi] = sideA;
      this.vertTets[vj] = sideB;

      const px = this.pos[vi * 3], py = this.pos[vi * 3 + 1], pz = this.pos[vi * 3 + 2];
      const sep = 0.004;
      this.pos[vi * 3] = px + worldNx * sep;
      this.pos[vi * 3 + 1] = py + worldNy * sep;
      this.pos[vi * 3 + 2] = pz + worldNz * sep;
      this.pos[vj * 3] = px - worldNx * sep;
      this.pos[vj * 3 + 1] = py - worldNy * sep;
      this.pos[vj * 3 + 2] = pz - worldNz * sep;

      this.prevPos[vj * 3] = this.prevPos[vi * 3] - worldNx * sep;
      this.prevPos[vj * 3 + 1] = this.prevPos[vi * 3 + 1] - worldNy * sep;
      this.prevPos[vj * 3 + 2] = this.prevPos[vi * 3 + 2] - worldNz * sep;

      // Elastic energy release separation impulse along world crack normal
      const vRel = 0.28;
      this.vel[vj * 3] = this.vel[vi * 3] - worldNx * vRel;
      this.vel[vj * 3 + 1] = this.vel[vi * 3 + 1] - worldNy * vRel;
      this.vel[vj * 3 + 2] = this.vel[vi * 3 + 2] - worldNz * vRel;
      this.vel[vi * 3] += worldNx * vRel;
      this.vel[vi * 3 + 1] += worldNy * vRel;
      this.vel[vi * 3 + 2] += worldNz * vRel;

      this.restPos[vj * 3] = this.restPos[vi * 3];
      this.restPos[vj * 3 + 1] = this.restPos[vi * 3 + 1];
      this.restPos[vj * 3 + 2] = this.restPos[vi * 3 + 2];

      this.splitOrigin[vj] = this.splitOrigin[vi];
      this.isSplitVert[vi] = 1;
      this.isSplitVert[vj] = 1;
      const nd = this.splitDepth[vi] + 1;
      this.splitDepth[vi] = nd;
      this.splitDepth[vj] = nd;
      this.damage[vi] = 0.0;
      this.damage[vj] = 0.0;

      // Rewire sideB tetrahedra from vi -> vj
      for (let k = 0; k < sideB.length; k++) {
        const base = sideB[k] * 4;
        for (let c = 0; c < 4; c++) {
          if (tets[base + c] === vi) tets[base + c] = vj;
        }
      }

      // Exact mass conservation across vi and vj
      let mA = 0, mB = 0;
      for (let k = 0; k < sideA.length; k++) mA += 0.25 * this.restVol[sideA[k]] * this.density;
      for (let k = 0; k < sideB.length; k++) mB += 0.25 * this.restVol[sideB[k]] * this.density;
      this.mass[vi] = Math.max(mA, 1e-6);
      this.mass[vj] = Math.max(mB, 1e-6);
      this.invMass[vi] = 1.0 / this.mass[vi];
      this.invMass[vj] = 1.0 / this.mass[vj];

      this.splitCount++;
      return true;
    }

    // Compute current center of mass & approximate bounding radius (for camera & colored caustic shadows)
    computeBounds() {
      let cx = 0, cy = 0, cz = 0, mSum = 0;
      let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
      for (let i = 0; i < this.numVertices; i++) {
        const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
        const m = this.mass[i];
        cx += x * m; cy += y * m; cz += z * m; mSum += m;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const inv = 1 / (mSum || 1);
      return {
        cx: cx * inv, cy: cy * inv, cz: cz * inv,
        minX, minY, minZ, maxX, maxY, maxZ,
        rx: 0.5 * (maxX - minX), ry: 0.5 * (maxY - minY), rz: 0.5 * (maxZ - minZ)
      };
    }

    // Build GPU vertex buffer (unindexed triangle list with crease-aware normals + fracture flag)
    // Layout per vertex (8 floats): pos(3), normal(3), isFracture(1), jellyId(1)
    packRenderVertices(outBuffer, jellyIndex) {
      const tris = this.boundaryTris;
      const isFrac = this.boundaryIsFracture;
      const triCount = tris.length / 3;
      const pos = this.pos;

      // 1. Accumulate smooth normals for exterior skin vertices (excluding fracture faces so skin stays glassy smooth!)
      if (!this._skinNorm || this._skinNorm.length < this.maxVertices * 3) {
        this._skinNorm = new Float32Array(this.maxVertices * 3);
      }
      const sn = this._skinNorm;
      sn.fill(0, 0, this.numVertices * 3);

      for (let f = 0; f < triCount; f++) {
        if (isFrac[f]) continue;
        const a = tris[f * 3], b = tris[f * 3 + 1], c = tris[f * 3 + 2];
        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
        const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        sn[a * 3] += nx; sn[a * 3 + 1] += ny; sn[a * 3 + 2] += nz;
        sn[b * 3] += nx; sn[b * 3 + 1] += ny; sn[b * 3 + 2] += nz;
        sn[c * 3] += nx; sn[c * 3 + 1] += ny; sn[c * 3 + 2] += nz;
      }

      // 2. Pack triangles; exterior faces use smooth skin normals, fracture faces use crisp wet conchoidal facet normals
      let ptr = 0;
      for (let f = 0; f < triCount; f++) {
        const a = tris[f * 3], b = tris[f * 3 + 1], c = tris[f * 3 + 2];
        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
        const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        let fnx = e1y * e2z - e1z * e2y;
        let fny = e1z * e2x - e1x * e2z;
        let fnz = e1x * e2y - e1y * e2x;
        const flen = Math.hypot(fnx, fny, fnz) || 1;
        fnx /= flen; fny /= flen; fnz /= flen;

        const frac = isFrac[f] ? 1.0 : 0.0;
        const idx3 = [a, b, c];
        const pts = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
        for (let k = 0; k < 3; k++) {
          const vi = idx3[k];
          let nx = fnx, ny = fny, nz = fnz;
          if (!frac) {
            const sl = Math.hypot(sn[vi * 3], sn[vi * 3 + 1], sn[vi * 3 + 2]);
            if (sl > 1e-6) {
              nx = sn[vi * 3] / sl;
              ny = sn[vi * 3 + 1] / sl;
              nz = sn[vi * 3 + 2] / sl;
            }
          }
          outBuffer[ptr++] = pts[k][0];
          outBuffer[ptr++] = pts[k][1];
          outBuffer[ptr++] = pts[k][2];
          outBuffer[ptr++] = nx;
          outBuffer[ptr++] = ny;
          outBuffer[ptr++] = nz;
          outBuffer[ptr++] = frac;
          outBuffer[ptr++] = jellyIndex;
        }
      }
      return triCount * 3;
    }
  }

  App.Scene1Mesh = {
    createFlutedDomeMesh,
    createCushionMesh,
    createPrismTowerMesh,
    JellyBody
  };
})(window);
