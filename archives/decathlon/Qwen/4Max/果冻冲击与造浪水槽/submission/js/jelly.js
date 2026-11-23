/* 体积软体果冻：四面体 XPBD（距离 + 体积约束），应变断裂判据，动态碎片分裂 */
'use strict';
class Jelly {
  constructor(opts) {
    this.shape = opts.shape || 'box';
    this.color = opts.color || [1, 0.3, 0.4];
    this.softness = opts.softness == null ? 0.5 : opts.softness;
    this.toughness = opts.toughness == null ? 0.5 : opts.toughness;
    this.density = opts.density || 150;
    this.damping = opts.damping == null ? 1.1 : opts.damping;
    this.center = opts.center || [0, 0, 0];
    this.size = opts.size || [0.5, 0.44, 0.5];
    this.gridN = opts.gridN || [8, 7, 8];
    this.broken = false;
    this.breakCount = 0;
    this.lastImpact = 0;
    this.buildMesh();
    this.gpu = null;
  }
  buildMesh() {
    const [sx, sy, sz] = this.size;
    const [nx, ny, nz] = this.gridN;
    const [cx, cy, cz] = this.center;
    const gw = nx + 1, gh = ny + 1, gd = nz + 1;
    const lattice = new Float32Array(gw * gh * gd * 3);
    const idx = (i, j, k) => i + gw * (j + gh * k);
    for (let k = 0; k < gd; k++) for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const u = i / nx, v = j / ny, w = k / nz;
      let x = (u - 0.5) * sx, y = v * sy, z = (w - 0.5) * sz;
      if (this.shape === 'pudding') {
        const taper = lerp(1.0, 0.62, v);
        x *= taper; z *= taper;
        const dome = 1 + 0.10 * Math.sin(v * Math.PI);
        x *= dome; z *= dome;
      }
      const id = idx(i, j, k) * 3;
      lattice[id] = x + cx; lattice[id + 1] = y + cy; lattice[id + 2] = z + cz;
    }
    const keepCell = (i, j, k) => {
      const x = ((i + 0.5) / nx - 0.5) * sx, y = (j + 0.5) / ny * sy, z = ((k + 0.5) / nz - 0.5) * sz;
      if (this.shape === 'cyl') {
        const r = sx * 0.5;
        return x * x + z * z < r * r * 0.94;
      }
      if (this.shape === 'pudding') {
        const v = (j + 0.5) / ny;
        const hw = sx * 0.5 * lerp(1.0, 0.62, v) * (1 + 0.10 * Math.sin(v * Math.PI));
        const hd = sz * 0.5 * lerp(1.0, 0.62, v) * (1 + 0.10 * Math.sin(v * Math.PI));
        return Math.abs(x) < hw * 0.96 && Math.abs(z) < hd * 0.96;
      }
      return true;
    };
    const tets = [];
    const used = new Set();
    const addTet = (a, b, c, d) => {
      const p = (q) => [lattice[q * 3], lattice[q * 3 + 1], lattice[q * 3 + 2]];
      const A = p(a), B = p(b), C = p(c), D = p(d);
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const ad = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      const cr = [ac[1] * ad[2] - ac[2] * ad[1], ac[2] * ad[0] - ac[0] * ad[2], ac[0] * ad[1] - ac[1] * ad[0]];
      const vol = (ab[0] * cr[0] + ab[1] * cr[1] + ab[2] * cr[2]) / 6;
      if (Math.abs(vol) < 1e-10) return;
      if (vol < 0) { tets.push(a, b, d, c); } else { tets.push(a, b, c, d); }
      used.add(a); used.add(b); used.add(c); used.add(d);
    };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!keepCell(i, j, k)) continue;
      const a = idx(i, j, k), b = idx(i + 1, j, k), c = idx(i + 1, j + 1, k), d = idx(i, j + 1, k);
      const e = idx(i, j, k + 1), f = idx(i + 1, j, k + 1), g = idx(i + 1, j + 1, k + 1), h = idx(i, j + 1, k + 1);
      addTet(a, b, c, g); addTet(a, c, d, g); addTet(a, d, h, g);
      addTet(a, h, e, g); addTet(a, e, f, g); addTet(a, f, b, g);
    }
    // 压缩顶点
    const remap = new Int32Array(gw * gh * gd).fill(-1);
    const pos = [];
    for (const v of used) { remap[v] = pos.length / 3; pos.push(lattice[v * 3], lattice[v * 3 + 1], lattice[v * 3 + 2]); }
    this.n = pos.length / 3;
    this.pos = new Float32Array(pos);
    this.prev = new Float32Array(pos);
    this.vel = new Float32Array(this.n * 3);
    this.restPos = new Float32Array(pos);
    this.m = tets.length / 4;
    this.tets = new Int32Array(tets.length);
    for (let t = 0; t < tets.length; t++) this.tets[t] = remap[tets[t]];
    this.active = new Uint8Array(this.m).fill(1);
    this.restVol = new Float32Array(this.m);
    this.restEdges = new Float32Array(this.m * 6);
    this.invMass = new Float32Array(this.n);
    this.fragOf = new Int32Array(this.n);
    const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    this.edgePairs = EDGE_PAIRS;
    let totalVol = 0;
    for (let t = 0; t < this.m; t++) {
      const v = this.tetVol(t);
      this.restVol[t] = v; totalVol += v;
      for (let e = 0; e < 6; e++) {
        const a = this.tets[t * 4 + EDGE_PAIRS[e][0]], b = this.tets[t * 4 + EDGE_PAIRS[e][1]];
        this.restEdges[t * 6 + e] = this.dist(a, b);
      }
    }
    const mass = Math.max(0.5, totalVol * this.density);
    this.mass = mass;
    this.invMass.fill(this.n / mass);
    this.rebuildEdges();
    this.rebuildSurface();
    this.frags = [{ center: [cx, cy + sy * 0.5, cz], radius: Math.hypot(sx, sy, sz) * 0.5, verts: null }];
    this.computeFrags();
  }
  dist(a, b) {
    const p = this.pos;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }
  tetVol(t) {
    const p = this.pos, T = this.tets;
    const a = T[t * 4] * 3, b = T[t * 4 + 1] * 3, c = T[t * 4 + 2] * 3, d = T[t * 4 + 3] * 3;
    const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
    const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
    const adx = p[d] - p[a], ady = p[d + 1] - p[a + 1], adz = p[d + 2] - p[a + 2];
    const cx = acy * adz - acz * ady, cy = acz * adx - acx * adz, cz = acx * ady - acy * adx;
    return (abx * cx + aby * cy + abz * cz) / 6;
  }
  rebuildEdges() {
    const set = new Set();
    const edges = [];
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      for (let e = 0; e < 6; e++) {
        const a = this.tets[t * 4 + this.edgePairs[e][0]], b = this.tets[t * 4 + this.edgePairs[e][1]];
        const key = Math.min(a, b) * 1000000 + Math.max(a, b);
        if (!set.has(key)) { set.add(key); edges.push(a, b); }
      }
    }
    this.edges = new Int32Array(edges);
    this.edgeRest = new Float32Array(edges.length / 2);
    for (let e = 0; e < edges.length / 2; e++) this.edgeRest[e] = this.dist(edges[e * 2], edges[e * 2 + 1]);
  }
  rebuildSurface() {
    const faceMap = new Map();
    const FACES = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
    const p = this.pos;
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      const v = [this.tets[t * 4], this.tets[t * 4 + 1], this.tets[t * 4 + 2], this.tets[t * 4 + 3]];
      const cen = [0, 0, 0];
      for (let q = 0; q < 4; q++) { cen[0] += p[v[q] * 3] / 4; cen[1] += p[v[q] * 3 + 1] / 4; cen[2] += p[v[q] * 3 + 2] / 4; }
      for (const f of FACES) {
        const a = v[f[0]], b = v[f[1]], c = v[f[2]];
        const key = [a, b, c].sort((x, y) => x - y).join(',');
        const e = faceMap.get(key);
        if (e) { e.count++; continue; }
        const abx = p[b * 3] - p[a * 3], aby = p[b * 3 + 1] - p[a * 3 + 1], abz = p[b * 3 + 2] - p[a * 3 + 2];
        const acx = p[c * 3] - p[a * 3], acy = p[c * 3 + 1] - p[a * 3 + 1], acz = p[c * 3 + 2] - p[a * 3 + 2];
        let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
        const fx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3, fy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3, fz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
        if (nx * (fx - cen[0]) + ny * (fy - cen[1]) + nz * (fz - cen[2]) < 0) { faceMap.set(key, { count: 1, a, b: c, c: b }); }
        else { faceMap.set(key, { count: 1, a, b, c }); }
      }
    }
    const idx = [];
    for (const e of faceMap.values()) if (e.count === 1) idx.push(e.a, e.b, e.c);
    this.surfIdx = new Uint32Array(idx);
    this.normals = new Float32Array(this.n * 3);
    this.gpuDirty = true;
    this.gpuIndexDirty = true;
  }
  computeNormals() {
    const nrm = this.normals, p = this.pos, idx = this.surfIdx;
    nrm.fill(0);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
      const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
      nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
      nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    for (let i = 0; i < this.n; i++) {
      const x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    }
  }
  computeFrags() {
    // 连通分量（并查集）
    const parent = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    let anyActive = false;
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      anyActive = true;
      const a = this.tets[t * 4];
      union(a, this.tets[t * 4 + 1]); union(a, this.tets[t * 4 + 2]); union(a, this.tets[t * 4 + 3]);
    }
    const groups = new Map();
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      const r = find(this.tets[t * 4]);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(t);
    }
    this.fragOf.fill(-1);
    this.frags = [];
    let fi = 0;
    for (const [, list] of groups) {
      const verts = new Set();
      for (const t of list) for (let q = 0; q < 4; q++) verts.add(this.tets[t * 4 + q]);
      let cx = 0, cy = 0, cz = 0;
      for (const v of verts) { cx += this.pos[v * 3]; cy += this.pos[v * 3 + 1]; cz += this.pos[v * 3 + 2]; this.fragOf[v] = fi; }
      cx /= verts.size; cy /= verts.size; cz /= verts.size;
      let rad = 0;
      for (const v of verts) rad = Math.max(rad, Math.hypot(this.pos[v * 3] - cx, this.pos[v * 3 + 1] - cy, this.pos[v * 3 + 2] - cz));
      this.frags.push({ center: [cx, cy, cz], radius: rad, verts, tets: list });
      fi++;
    }
    if (!anyActive) this.frags = [];
  }
  /* 断裂：应变超阈值 → 移除四面体 → 分裂连通分量 */
  fracture(stretchLimit, volLimit, maxBreaks) {
    const broken = [];
    const p = this.pos;
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      let maxDev = 0;
      for (let e = 0; e < 6; e++) {
        const a = this.tets[t * 4 + this.edgePairs[e][0]], b = this.tets[t * 4 + this.edgePairs[e][1]];
        const l = this.dist(a, b);
        const dev = Math.abs(l / this.restEdges[t * 6 + e] - 1);
        if (dev > maxDev) maxDev = dev;
      }
      const v = this.tetVol(t);
      const vdev = Math.abs(v / this.restVol[t] - 1);
      if (maxDev > stretchLimit || vdev > volLimit) broken.push(t);
      if (broken.length >= maxBreaks) break;
    }
    if (broken.length === 0) return 0;
    for (const t of broken) this.active[t] = 0;
    this.breakCount += broken.length;
    // 分裂共享顶点
    this.computeFrags();
    if (this.frags.length > 1) {
      const vertFrags = new Map();
      for (let fi = 0; fi < this.frags.length; fi++) {
        for (const v of this.frags[fi].verts) {
          if (!vertFrags.has(v)) vertFrags.set(v, []);
          vertFrags.get(v).push(fi);
        }
      }
      const newPos = Array.from(this.pos), newVel = Array.from(this.vel), newInv = Array.from(this.invMass);
      const remapByFrag = new Map();
      for (const [v, fis] of vertFrags) {
        if (fis.length < 2) continue;
        for (let q = 1; q < fis.length; q++) {
          const fi = fis[q];
          if (!remapByFrag.has(fi)) remapByFrag.set(fi, new Map());
          const ni = newInv.length;
          newInv.push(this.invMass[v]);
          newPos.push(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
          newVel.push(this.vel[v * 3], this.vel[v * 3 + 1], this.vel[v * 3 + 2]);
          remapByFrag.get(fi).set(v, ni);
        }
      }
      if (remapByFrag.size > 0) {
        this.pos = new Float32Array(newPos);
        this.prev = new Float32Array(newPos);
        this.vel = new Float32Array(newVel);
        this.invMass = new Float32Array(newInv);
        this.restPos = new Float32Array(newPos.length);
        this.restPos.set(this.pos);
        this.n = newInv.length;
        this.fragOf = new Int32Array(this.n);
        for (const [fi, map] of remapByFrag) {
          for (const t of this.frags[fi].tets) {
            for (let q = 0; q < 4; q++) {
              const v = this.tets[t * 4 + q];
              if (map.has(v)) this.tets[t * 4 + q] = map.get(v);
            }
          }
        }
        this.computeFrags();
      }
    }
    this.rebuildEdges();
    this.rebuildSurface();
    this.broken = true;
    return broken.length;
  }
  /* XPBD 子步 */
  substep(h, balls, floorY, world) {
    const p = this.pos, prev = this.prev, vel = this.vel, w = this.invMass;
    const n = this.n;
    const dampF = Math.exp(-this.damping * h);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      prev[i3] = p[i3]; prev[i3 + 1] = p[i3 + 1]; prev[i3 + 2] = p[i3 + 2];
      vel[i3 + 1] -= 9.8 * h;
      vel[i3] *= dampF; vel[i3 + 1] *= dampF; vel[i3 + 2] *= dampF;
      p[i3] += vel[i3] * h; p[i3 + 1] += vel[i3 + 1] * h; p[i3 + 2] += vel[i3 + 2] * h;
    }
    const alphaD = lerp(1.2e-6, 4.5e-4, this.softness) / (h * h);
    const alphaV = 2.0e-8 / (h * h);
    // 距离约束
    const E = this.edges, ER = this.edgeRest;
    for (let e = 0; e < E.length / 2; e++) {
      const a = E[e * 2], b = E[e * 2 + 1];
      const a3 = a * 3, b3 = b * 3;
      let dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-8;
      const C = d - ER[e];
      const lam = -C / (w[a] + w[b] + alphaD);
      dx /= d; dy /= d; dz /= d;
      const sa = -w[a] * lam, sb = w[b] * lam;
      p[a3] += dx * sa; p[a3 + 1] += dy * sa; p[a3 + 2] += dz * sa;
      p[b3] += dx * sb; p[b3 + 1] += dy * sb; p[b3 + 2] += dz * sb;
    }
    // 体积约束
    const T = this.tets;
    for (let t = 0; t < this.m; t++) {
      if (!this.active[t]) continue;
      const a = T[t * 4] * 3, b = T[t * 4 + 1] * 3, c = T[t * 4 + 2] * 3, d = T[t * 4 + 3] * 3;
      const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
      const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
      const adx = p[d] - p[a], ady = p[d + 1] - p[a + 1], adz = p[d + 2] - p[a + 2];
      const V = (abx * (acy * adz - acz * ady) + aby * (acz * adx - acx * adz) + abz * (acx * ady - acy * adx)) / 6;
      const C = V - this.restVol[t];
      if (Math.abs(C) < 1e-12) continue;
      // 梯度
      const gax = (p[b + 1] - p[d + 1]) * (p[c + 2] - p[d + 2]) - (p[b + 2] - p[d + 2]) * (p[c + 1] - p[d + 1]);
      const gay = (p[b + 2] - p[d + 2]) * (p[c] - p[d]) - (p[b] - p[d]) * (p[c + 2] - p[d + 2]);
      const gaz = (p[b] - p[d]) * (p[c + 1] - p[d + 1]) - (p[b + 1] - p[d + 1]) * (p[c] - p[d]);
      const gbx = (p[c + 1] - p[d + 1]) * (p[a + 2] - p[d + 2]) - (p[c + 2] - p[d + 2]) * (p[a + 1] - p[d + 1]);
      const gby = (p[c + 2] - p[d + 2]) * (p[a] - p[d]) - (p[c] - p[d]) * (p[a + 2] - p[d + 2]);
      const gbz = (p[c] - p[d]) * (p[a + 1] - p[d + 1]) - (p[c + 1] - p[d + 1]) * (p[a] - p[d]);
      const gcx = (p[a + 1] - p[d + 1]) * (p[b + 2] - p[d + 2]) - (p[a + 2] - p[d + 2]) * (p[b + 1] - p[d + 1]);
      const gcy = (p[a + 2] - p[d + 2]) * (p[b] - p[d]) - (p[a] - p[d]) * (p[b + 2] - p[d + 2]);
      const gcz = (p[a] - p[d]) * (p[b + 1] - p[d + 1]) - (p[a + 1] - p[d + 1]) * (p[b] - p[d]);
      const s = 1 / 6;
      const ga = [gax * s, gay * s, gaz * s], gb = [gbx * s, gby * s, gbz * s], gc = [gcx * s, gcy * s, gcz * s];
      const gd = [-(ga[0] + gb[0] + gc[0]), -(ga[1] + gb[1] + gc[1]), -(ga[2] + gb[2] + gc[2])];
      const wa = w[T[t * 4]], wb = w[T[t * 4 + 1]], wc = w[T[t * 4 + 2]], wd = w[T[t * 4 + 3]];
      const wsum = wa * (ga[0] ** 2 + ga[1] ** 2 + ga[2] ** 2) + wb * (gb[0] ** 2 + gb[1] ** 2 + gb[2] ** 2)
        + wc * (gc[0] ** 2 + gc[1] ** 2 + gc[2] ** 2) + wd * (gd[0] ** 2 + gd[1] ** 2 + gd[2] ** 2);
      const lam = -C / (wsum + alphaV);
      p[a] += wa * lam * ga[0]; p[a + 1] += wa * lam * ga[1]; p[a + 2] += wa * lam * ga[2];
      p[b] += wb * lam * gb[0]; p[b + 1] += wb * lam * gb[1]; p[b + 2] += wb * lam * gb[2];
      p[c] += wc * lam * gc[0]; p[c + 1] += wc * lam * gc[1]; p[c + 2] += wc * lam * gc[2];
      p[d] += wd * lam * gd[0]; p[d + 1] += wd * lam * gd[1]; p[d + 2] += wd * lam * gd[2];
    }
    // 台面碰撞 + 摩擦
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      if (p[i3 + 1] < floorY) {
        p[i3 + 1] = floorY;
        const mu = 0.42;
        p[i3] = lerp(p[i3], prev[i3], mu);
        p[i3 + 2] = lerp(p[i3 + 2], prev[i3 + 2], mu);
      }
    }
    // 球-果冻 双向碰撞
    for (const ball of balls) {
      if (ball.sleep) continue;
      const r = ball.r + 0.010;
      const wb = ball.invM;
      const bx = ball.x, by = ball.y, bz = ball.z;
      const bd = this.bounds;
      if (bd && (bx - r > bd[3] + 0.05 || bx + r < bd[0] - 0.05 || by - r > bd[4] + 0.05 || by + r < bd[1] - 0.05 || bz - r > bd[5] + 0.05 || bz + r < bd[2] - 0.05)) continue;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const dx = p[i3] - bx, dy = p[i3 + 1] - by, dz = p[i3 + 2] - bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = r - d;
          const wv = w[i];
          const tot = wv + wb;
          const sv = wv / tot, sb = wb / tot;
          p[i3] += nx * pen * sv; p[i3 + 1] += ny * pen * sv; p[i3 + 2] += nz * pen * sv;
          ball.x -= nx * pen * sb; ball.y -= ny * pen * sb; ball.z -= nz * pen * sb;
          // 摩擦：切向位置向上一帧靠拢
          const tx = p[i3] - prev[i3], ty = p[i3 + 1] - prev[i3 + 1], tz = p[i3 + 2] - prev[i3 + 2];
          const tn = tx * nx + ty * ny + tz * nz;
          const ttx = tx - tn * nx, tty = ty - tn * ny, ttz = tz - tn * nz;
          const mu = 0.16;
          p[i3] -= ttx * mu; p[i3 + 1] -= tty * mu; p[i3 + 2] -= ttz * mu;
          ball.contact = true;
          ball.contactNX = nx; ball.contactNY = ny; ball.contactNZ = nz;
          ball.jellyHit = Math.max(ball.jellyHit || 0, pen);
        }
      }
    }
    // 速度回写
    const invH = 1 / h;
    for (let i = 0; i < n * 3; i++) vel[i] = (p[i] - prev[i]) * invH;
  }
  updateBounds() {
    let mx = -1e9, my = -1e9, mz = -1e9, lx = 1e9, ly = 1e9, lz = 1e9;
    for (let i = 0; i < this.n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      if (x > mx) mx = x; if (x < lx) lx = x;
      if (y > my) my = y; if (y < ly) ly = y;
      if (z > mz) mz = z; if (z < lz) lz = z;
    }
    this.maxY = my; this.minY = ly;
    this.bounds = [lx, ly, lz, mx, my, mz];
  }
  /* 碎片间粗碰撞 */
  static fragmentCollide(jellies) {
    const all = [];
    for (const j of jellies) for (let fi = 0; fi < j.frags.length; fi++) all.push({ j, fi, f: j.frags[fi] });
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      const A = all[a], B = all[b];
      if (A.j === B.j) continue;
      const dx = B.f.center[0] - A.f.center[0], dy = B.f.center[1] - A.f.center[1], dz = B.f.center[2] - A.f.center[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const rr = (A.f.radius + B.f.radius) * 0.82;
      if (d < rr) {
        const pen = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const ma = A.f.verts.size, mb = B.f.verts.size;
        const sa = mb / (ma + mb), sb = ma / (ma + mb);
        for (const v of A.f.verts) { const p = A.j.pos; p[v * 3] -= nx * pen * sa; p[v * 3 + 1] -= ny * pen * sa; p[v * 3 + 2] -= nz * pen * sa; }
        for (const v of B.f.verts) { const p = B.j.pos; p[v * 3] += nx * pen * sb; p[v * 3 + 1] += ny * pen * sb; p[v * 3 + 2] += nz * pen * sb; }
      }
    }
  }
}
window.Jelly = Jelly;
