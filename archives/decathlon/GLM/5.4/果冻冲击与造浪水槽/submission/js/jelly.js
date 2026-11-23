'use strict';
/* ---------------------------------------------------------------------------
   Jelly: volumetric soft body.
   - discretised into tetrahedra on a regular grid
   - solved with XPBD (distance + volume constraints, several substeps)
   - fracture: per-tet strain / volume criterion, cracks propagate because a
     broken tet no longer supports its neighbours (no pre-cut pieces)
--------------------------------------------------------------------------- */

const JELLY_GRAVITY = -9.8;

class Jelly {
  constructor(cfg) {
    this.cfg = cfg;
    this.nx = cfg.nx; this.ny = cfg.ny; this.nz = cfg.nz;
    this.size = cfg.size;         // [sx, sy, sz]
    this.pos0 = cfg.pos;          // world position of the base centre
    this.color = cfg.color;
    this.shape = cfg.shape || 'box';
    this.density = cfg.density || 260;
    this.softness = cfg.softness !== undefined ? cfg.softness : 0.5;
    this.toughness = cfg.toughness !== undefined ? cfg.toughness : 0.5;
    this.build();
    this.reset();
  }

  shapePoint(u, v, w) {
    // u,w in [-1,1], v in [-1,1] (v=-1 bottom)
    const sx = this.size[0], sy = this.size[1], sz = this.size[2];
    const t = (v + 1) * 0.5; // 0..1
    let s = 1;
    if (this.shape === 'dome') s = Math.sqrt(Math.max(0.06, 1 - t * t * 0.82));
    else if (this.shape === 'column') s = t > 0.72 ? Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.72) / 0.28, 2) * 0.9)) : 1;
    else if (this.shape === 'slab') s = 1 - 0.08 * Math.sin(t * Math.PI);
    else if (this.shape === 'pear') s = 0.55 + 0.6 * Math.sin(Math.min(1, t * 0.9 + 0.1) * Math.PI * 0.85);
    return [u * sx * 0.5 * s, t * sy, w * sz * 0.5 * s];
  }

  build() {
    const nx = this.nx, ny = this.ny, nz = this.nz;
    const nvx = nx + 1, nvy = ny + 1, nvz = nz + 1;
    const nv = nvx * nvy * nvz;
    this.nv = nv;
    this.p = new Float32Array(nv * 3);
    this.pPrev = new Float32Array(nv * 3);
    this.v = new Float32Array(nv * 3);
    this.rest = new Float32Array(nv * 3);
    this.invMass = new Float32Array(nv);
    this.mass = new Float32Array(nv);

    const vid = (i, j, k) => i + nvx * (j + nvy * k);
    let n = 0;
    for (let k = 0; k < nvz; k++) for (let j = 0; j < nvy; j++) for (let i = 0; i < nvx; i++) {
      const u = (i / nx) * 2 - 1, v = (j / ny) * 2 - 1, w = (k / nz) * 2 - 1;
      const p = this.shapePoint(u, v, w);
      this.rest[n * 3] = p[0]; this.rest[n * 3 + 1] = p[1]; this.rest[n * 3 + 2] = p[2];
      n++;
    }

    // tets: Kuhn 6-tet decomposition of each cube
    const tets = [];
    const ring = [1, 3, 2, 6, 4, 5];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [
        vid(i, j, k), vid(i + 1, j, k), vid(i, j + 1, k), vid(i + 1, j + 1, k),
        vid(i, j, k + 1), vid(i + 1, j, k + 1), vid(i, j + 1, k + 1), vid(i + 1, j + 1, k + 1),
      ];
      for (let e = 0; e < 6; e++) {
        const a = c[ring[e]], b = c[ring[(e + 1) % 6]];
        tets.push(c[0], a, b, c[7]);
      }
    }
    this.ntet = tets.length / 4;
    this.tet = new Int32Array(tets);
    this.tetVol0 = new Float32Array(this.ntet);
    this.tetAlive = new Uint8Array(this.ntet);
    this.tetStrain = new Float32Array(this.ntet);

    // make winding consistent & measure volumes
    for (let t = 0; t < this.ntet; t++) {
      const a = this.tet[t * 4], b = this.tet[t * 4 + 1], c = this.tet[t * 4 + 2], d = this.tet[t * 4 + 3];
      const vol = this.tetVolume(a, b, c, d);
      if (vol < 0) {
        // swap b and c
        this.tet[t * 4 + 1] = c; this.tet[t * 4 + 2] = b;
      }
      this.tetVol0[t] = Math.abs(this.tetVolume(this.tet[t * 4], this.tet[t * 4 + 1], this.tet[t * 4 + 2], this.tet[t * 4 + 3]));
    }

    // edges (unique)
    const edgeMap = new Map();
    const edges = [];
    for (let t = 0; t < this.ntet; t++) {
      const a = this.tet[t * 4], b = this.tet[t * 4 + 1], c = this.tet[t * 4 + 2], d = this.tet[t * 4 + 3];
      const pairs = [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]];
      for (const [i0, i1] of pairs) {
        const key = i0 < i1 ? i0 * 100000 + i1 : i1 * 100000 + i0;
        let e = edgeMap.get(key);
        if (e === undefined) { e = edges.length / 2; edgeMap.set(key, e); edges.push(i0, i1); }
      }
    }
    this.nedge = edges.length / 2;
    this.edge = new Int32Array(edges);
    this.edgeL0 = new Float32Array(this.nedge);
    this.edgeAlive = new Uint8Array(this.nedge).fill(1);
    for (let e = 0; e < this.nedge; e++) {
      const a = this.edge[e * 2], b = this.edge[e * 2 + 1];
      this.edgeL0[e] = this.dist3(this.rest, a, this.rest, b);
    }
    // per-tet edge indices (6 each)
    this.tetEdge = new Int32Array(this.ntet * 6);
    for (let t = 0; t < this.ntet; t++) {
      const vs = [this.tet[t * 4], this.tet[t * 4 + 1], this.tet[t * 4 + 2], this.tet[t * 4 + 3]];
      const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
      for (let q = 0; q < 6; q++) {
        const a = vs[pairs[q][0]], b = vs[pairs[q][1]];
        const key = a < b ? a * 100000 + b : b * 100000 + a;
        this.tetEdge[t * 6 + q] = edgeMap.get(key);
      }
    }

    // faces: each tet face -> adjacent tet(s)
    const faceMap = new Map();
    const faces = [];
    for (let t = 0; t < this.ntet; t++) {
      const a = this.tet[t * 4], b = this.tet[t * 4 + 1], c = this.tet[t * 4 + 2], d = this.tet[t * 4 + 3];
      const quads = [[a, b, c], [a, c, d], [a, d, b], [b, d, c]];
      for (const q of quads) {
        const sorted = [q[0], q[1], q[2]].sort((x, y) => x - y);
        const key = sorted[0] * 100000000 + sorted[1] * 100000 + sorted[2];
        let f = faceMap.get(key);
        if (f === undefined) {
          f = { v: q, tet: [t, -1] };
          faceMap.set(key, f); faces.push(f);
        } else {
          f.tet[1] = t;
        }
      }
    }
    this.nface = faces.length;
    this.face = new Int32Array(this.nface * 3);
    this.faceTet = new Int32Array(this.nface * 2);
    for (let i = 0; i < this.nface; i++) {
      const f = faces[i];
      this.face[i * 3] = f.v[0]; this.face[i * 3 + 1] = f.v[1]; this.face[i * 3 + 2] = f.v[2];
      this.faceTet[i * 2] = f.tet[0]; this.faceTet[i * 2 + 1] = f.tet[1];
    }
    // orient faces outward from their (first) tet
    for (let i = 0; i < this.nface; i++) {
      const t = this.faceTet[i * 2];
      const a = this.face[i * 3], b = this.face[i * 3 + 1], c = this.face[i * 3 + 2];
      const cen = this.tetCenter(t);
      // normal
      const ax = this.rest[a * 3], ay = this.rest[a * 3 + 1], az = this.rest[a * 3 + 2];
      const bx = this.rest[b * 3], by = this.rest[b * 3 + 1], bz = this.rest[b * 3 + 2];
      const cx = this.rest[c * 3], cy = this.rest[c * 3 + 1], cz = this.rest[c * 3 + 2];
      const e1 = [bx - ax, by - ay, bz - az], e2 = [cx - ax, cy - ay, cz - az];
      const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fc = [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3];
      const dot = nrm[0] * (fc[0] - cen[0]) + nrm[1] * (fc[1] - cen[1]) + nrm[2] * (fc[2] - cen[2]);
      if (dot < 0) {
        this.face[i * 3 + 1] = c; this.face[i * 3 + 2] = b;
      }
    }

    // per-vertex mass from tets
    let totalV = 0;
    for (let t = 0; t < this.ntet; t++) totalV += this.tetVol0[t];
    this.totalVolume = totalV;
    for (let t = 0; t < this.ntet; t++) {
      const m = (this.tetVol0[t] / totalV) * this.density * totalV / 4;
      for (let k = 0; k < 4; k++) this.mass[this.tet[t * 4 + k]] += m;
    }
    for (let i = 0; i < nv; i++) { this.invMass[i] = 1 / Math.max(this.mass[i], 1e-6); }
    this.totalMass = totalV * this.density;

    // render buffers
    this.meshVerts = new Float32Array(nv * 12);
    this.meshIndex = new Uint32Array(this.nface * 3);
    this.visibleFaces = 0;
    this.topologyDirty = true;
  }

  tetVolume(a, b, c, d) {
    const p = this.rest;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3] - ax, by = p[b * 3 + 1] - ay, bz = p[b * 3 + 2] - az;
    const cx = p[c * 3] - ax, cy = p[c * 3 + 1] - ay, cz = p[c * 3 + 2] - az;
    const dx = p[d * 3] - ax, dy = p[d * 3 + 1] - ay, dz = p[d * 3 + 2] - az;
    return (bx * (cy * dz - cz * dy) - by * (cx * dz - cz * dx) + bz * (cx * dy - cy * dx)) / 6;
  }
  tetCenter(t) {
    const p = this.rest; let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k++) { const i = this.tet[t * 4 + k]; x += p[i * 3]; y += p[i * 3 + 1]; z += p[i * 3 + 2]; }
    return [x / 4, y / 4, z / 4];
  }
  dist3(a, i, b, j) {
    const dx = a[i * 3] - b[j * 3], dy = a[i * 3 + 1] - b[j * 3 + 1], dz = a[i * 3 + 2] - b[j * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  reset() {
    const p = this.p, r = this.rest;
    for (let i = 0; i < this.nv; i++) {
      p[i * 3] = this.pos0[0] + r[i * 3];
      p[i * 3 + 1] = this.pos0[1] + r[i * 3 + 1];
      p[i * 3 + 2] = this.pos0[2] + r[i * 3 + 2];
    }
    this.pPrev.set(p);
    this.v.fill(0);
    this.tetAlive.fill(1);
    this.edgeAlive.fill(1);
    this.tetStrain.fill(0);
    this.topologyDirty = true;
    this.brokenCount = 0;
    this.crackEvents = 0;
    this.updateMesh(true);
  }

  /* ---------- simulation ---------- */
  step(dt, balls, world) {
    dt = Math.min(dt, 1 / 30);
    const substeps = 6;
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) this.substep(h, balls, world);
    this.checkFracture(world);
    this.updateMesh(false);
  }

  substep(h, balls, world) {
    const p = this.p, pp = this.pPrev, v = this.v;
    const n = this.nv;
    // integrate
    for (let i = 0; i < n; i++) {
      v[i * 3 + 1] += JELLY_GRAVITY * h;
      pp[i * 3] = p[i * 3]; pp[i * 3 + 1] = p[i * 3 + 1]; pp[i * 3 + 2] = p[i * 3 + 2];
      p[i * 3] += v[i * 3] * h;
      p[i * 3 + 1] += v[i * 3 + 1] * h;
      p[i * 3 + 2] += v[i * 3 + 2] * h;
    }
    const iters = 7;
    const soft = this.softness;
    const edgeAlpha = 2.5e-6 * Math.pow(1 + soft * 55, 1.55);
    const volAlpha = 1.2e-7 * Math.pow(1 + soft * 40, 1.35);
    for (let it = 0; it < iters; it++) {
      this.solveEdges(h, edgeAlpha);
      this.solveVolumes(h, volAlpha);
      this.collideFloor();
      if (balls && balls.length) this.pushBalls(balls);
    }
    // velocities from positions
    const inv = 1 / h;
    for (let i = 0; i < n; i++) {
      v[i * 3] = (p[i * 3] - pp[i * 3]) * inv;
      v[i * 3 + 1] = (p[i * 3 + 1] - pp[i * 3 + 1]) * inv;
      v[i * 3 + 2] = (p[i * 3 + 2] - pp[i * 3 + 2]) * inv;
      // floor friction
      if (p[i * 3 + 1] <= 0.0008) {
        v[i * 3] *= 0.90;
        v[i * 3 + 2] *= 0.90;
      }
      v[i * 3] *= 0.9995; v[i * 3 + 1] *= 0.9995; v[i * 3 + 2] *= 0.9995;
    }
    if (balls && balls.length) this.impulseBalls(balls, world);
  }

  // positional: keep jelly vertices out of the ball
  pushBalls(balls) {
    const p = this.p;
    for (const ball of balls) {
      if (ball.dead) continue;
      const cx = ball.p[0], cy = ball.p[1], cz = ball.p[2];
      const r = ball.r;
      const r2 = r * r;
      for (let i = 0; i < this.nv; i++) {
        const dx = p[i * 3] - cx, dy = p[i * 3 + 1] - cy, dz = p[i * 3 + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2 || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const pen = (r - d) / d;
        p[i * 3] += dx * pen;
        p[i * 3 + 1] += dy * pen;
        p[i * 3 + 2] += dz * pen;
      }
    }
  }

  // momentum exchange between jelly surface and ball (once per substep)
  impulseBalls(balls, world) {
    const p = this.p, im = this.invMass, v = this.v;
    for (const ball of balls) {
      if (ball.dead) continue;
      const cx = ball.p[0], cy = ball.p[1], cz = ball.p[2];
      const r = ball.r;
      const rr = r * 1.06;
      const r2 = rr * rr;
      let contacts = 0, jx = 0, jy = 0, jz = 0;
      for (let i = 0; i < this.nv; i++) {
        const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2];
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const bvx = ball.v[0] + (ball.w[1] * (pz - cz) - ball.w[2] * (py - cy));
        const bvy = ball.v[1] + (ball.w[2] * (px - cx) - ball.w[0] * (pz - cz));
        const bvz = ball.v[2] + (ball.w[0] * (py - cy) - ball.w[1] * (px - cx));
        const rvx = v[i * 3] - bvx, rvy = v[i * 3 + 1] - bvy, rvz = v[i * 3 + 2] - bvz;
        const vn = rvx * nx + rvy * ny + rvz * nz;
        if (vn >= 0) continue;
        const j = -vn * (1 / (im[i] + ball.invMass)) * 0.85;
        v[i * 3] += j * im[i] * nx; v[i * 3 + 1] += j * im[i] * ny; v[i * 3 + 2] += j * im[i] * nz;
        jx -= j * nx; jy -= j * ny; jz -= j * nz;
        contacts++;
      }
      if (contacts) {
        ball.applyImpulse(jx, jy, jz, cx, cy, cz);
        if (world) world.ballHitJelly(ball, Math.hypot(jx, jy, jz));
      }
    }
  }

  solveEdges(h, alpha) {
    const p = this.p, im = this.invMass, e = this.edge, l0 = this.edgeL0, alive = this.edgeAlive;
    const at = alpha / (h * h);
    for (let i = 0; i < this.nedge; i++) {
      if (!alive[i]) continue;
      const a = e[i * 2], b = e[i * 2 + 1];
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const dx = p[b * 3] - ax, dy = p[b * 3 + 1] - ay, dz = p[b * 3 + 2] - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const C = len - l0[i];
      const wa = im[a], wb = im[b];
      const wsum = wa + wb;
      if (wsum < 1e-12) continue;
      const dl = -C / (wsum + at);
      const s = dl / len;
      const nx = dx * s, ny = dy * s, nz = dz * s;
      p[a * 3] -= nx * wa; p[a * 3 + 1] -= ny * wa; p[a * 3 + 2] -= nz * wa;
      p[b * 3] += nx * wb; p[b * 3 + 1] += ny * wb; p[b * 3 + 2] += nz * wb;
    }
  }

  solveVolumes(h, alpha) {
    const p = this.p, im = this.invMass, tet = this.tet, v0 = this.tetVol0, alive = this.tetAlive;
    const at = alpha / (h * h);
    for (let t = 0; t < this.ntet; t++) {
      if (!alive[t]) continue;
      const ia = tet[t * 4], ib = tet[t * 4 + 1], ic = tet[t * 4 + 2], id = tet[t * 4 + 3];
      const ax = p[ia * 3], ay = p[ia * 3 + 1], az = p[ia * 3 + 2];
      const bx = p[ib * 3] - ax, by = p[ib * 3 + 1] - ay, bz = p[ib * 3 + 2] - az;
      const cx = p[ic * 3] - ax, cy = p[ic * 3 + 1] - ay, cz = p[ic * 3 + 2] - az;
      const dx = p[id * 3] - ax, dy = p[id * 3 + 1] - ay, dz = p[id * 3 + 2] - az;
      // grad w.r.t b,c,d
      const gbx = (cy * dz - cz * dy) / 6, gby = (cz * dx - cx * dz) / 6, gbz = (cx * dy - cy * dx) / 6;
      const gcx = (dy * bz - dz * by) / 6, gcy = (dz * bx - dx * bz) / 6, gcz = (dx * by - dy * bx) / 6;
      const gdx = (by * cz - bz * cy) / 6, gdy = (bz * cx - bx * cz) / 6, gdz = (bx * cy - by * cx) / 6;
      const gax = -(gbx + gcx + gdx), gay = -(gby + gcy + gdy), gaz = -(gbz + gcz + gdz);
      const vol = (bx * gbx + by * gby + bz * gbz);
      const C = vol - v0[t];
      const wa = im[ia], wb = im[ib], wc = im[ic], wd = im[id];
      const wsum = wa * (gax * gax + gay * gay + gaz * gaz) + wb * (gbx * gbx + gby * gby + gbz * gbz)
        + wc * (gcx * gcx + gcy * gcy + gcz * gcz) + wd * (gdx * gdx + gdy * gdy + gdz * gdz);
      if (wsum < 1e-12) continue;
      const dl = -C / (wsum + at);
      p[ia * 3] += wa * dl * gax; p[ia * 3 + 1] += wa * dl * gay; p[ia * 3 + 2] += wa * dl * gaz;
      p[ib * 3] += wb * dl * gbx; p[ib * 3 + 1] += wb * dl * gby; p[ib * 3 + 2] += wb * dl * gbz;
      p[ic * 3] += wc * dl * gcx; p[ic * 3 + 1] += wc * dl * gcy; p[ic * 3 + 2] += wc * dl * gcz;
      p[id * 3] += wd * dl * gdx; p[id * 3 + 1] += wd * dl * gdy; p[id * 3 + 2] += wd * dl * gdz;
    }
  }

  collideFloor() {
    const p = this.p;
    for (let i = 0; i < this.nv; i++) {
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 0;
    }
  }

  /* ---------- fracture ---------- */
  checkFracture(world) {
    const alive = this.tetAlive, tet = this.tet, l0 = this.edgeL0;
    const p = this.p;
    const tough = this.toughness;
    const breakStrain = 0.16 + tough * 0.85;
    let broken = 0;
    const maxBreak = Math.max(2, Math.floor(this.ntet * 0.06));
    for (let t = 0; t < this.ntet && broken < maxBreak; t++) {
      if (!alive[t]) continue;
      // strain: max edge stretch relative to rest
      let maxS = 0;
      for (let q = 0; q < 6; q++) {
        const e = this.tetEdge[t * 6 + q];
        const a = this.edge[e * 2], b = this.edge[e * 2 + 1];
        const d = this.dist3(p, a, p, b);
        const s = Math.abs(d - l0[e]) / l0[e];
        if (s > maxS) maxS = s;
      }
      this.tetStrain[t] = maxS;
      // volume check as well
      const vol = Math.abs(this.tetVolume(this.tet[t * 4], this.tet[t * 4 + 1], this.tet[t * 4 + 2], this.tet[t * 4 + 3]));
      const vr = vol / this.tetVol0[t];
      if (maxS > breakStrain || vr < 0.35 || vr > 2.6) {
        alive[t] = 0;
        broken++;
      }
    }
    if (broken > 0) {
      this.brokenCount += broken;
      this.crackEvents += broken;
      // an edge stays alive while any adjacent tet is alive
      const eAlive = this.edgeAlive;
      eAlive.fill(0);
      for (let t = 0; t < this.ntet; t++) {
        if (!alive[t]) continue;
        for (let q = 0; q < 6; q++) eAlive[this.tetEdge[t * 6 + q]] = 1;
      }
      this.topologyDirty = true;
      if (world) world.onJellyCrack(this, broken);
    }
  }

  /* ---------- render mesh ---------- */
  updateMesh(force) {
    const nv = this.nv, p = this.p;
    const out = this.meshVerts;
    if (!force && !this.topologyDirty) {
      // positions & normals only
      this.computeNormals();
      for (let i = 0; i < nv; i++) {
        const o = i * 12;
        out[o] = p[i * 3]; out[o + 1] = p[i * 3 + 1]; out[o + 2] = p[i * 3 + 2];
        out[o + 3] = this.nrm[i * 3]; out[o + 4] = this.nrm[i * 3 + 1]; out[o + 5] = this.nrm[i * 3 + 2];
      }
      return;
    }
    this.rebuildTopology();
    this.computeNormals();
    for (let i = 0; i < nv; i++) {
      const o = i * 12;
      out[o] = p[i * 3]; out[o + 1] = p[i * 3 + 1]; out[o + 2] = p[i * 3 + 2];
      out[o + 3] = this.nrm[i * 3]; out[o + 4] = this.nrm[i * 3 + 1]; out[o + 5] = this.nrm[i * 3 + 2];
      out[o + 6] = this.color[0]; out[o + 7] = this.color[1]; out[o + 8] = this.color[2];
      out[o + 9] = 0; out[o + 10] = 0; out[o + 11] = 0;
    }
    this.topologyDirty = false;
  }

  rebuildTopology() {
    const idx = this.meshIndex;
    let n = 0;
    for (let f = 0; f < this.nface; f++) {
      const ta = this.faceTet[f * 2], tb = this.faceTet[f * 2 + 1];
      const aa = this.tetAlive[ta] === 1;
      const ab = tb >= 0 ? this.tetAlive[tb] === 1 : false;
      if (aa === ab) continue;   // both alive (interior) or both dead
      idx[n++] = this.face[f * 3];
      idx[n++] = this.face[f * 3 + 1];
      idx[n++] = this.face[f * 3 + 2];
    }
    this.visibleFaces = n / 3;
    this.indexCount = n;
  }

  computeNormals() {
    if (!this.nrm) this.nrm = new Float32Array(this.nv * 3);
    const nrm = this.nrm;
    nrm.fill(0);
    const idx = this.meshIndex, n = this.indexCount || 0;
    const p = this.p;
    for (let i = 0; i < n; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
      const bx = p[b * 3] - ax, by = p[b * 3 + 1] - ay, bz = p[b * 3 + 2] - az;
      const cx = p[c * 3] - ax, cy = p[c * 3 + 1] - ay, cz = p[c * 3 + 2] - az;
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      nrm[a * 3] += nx; nrm[a * 3 + 1] += ny; nrm[a * 3 + 2] += nz;
      nrm[b * 3] += nx; nrm[b * 3 + 1] += ny; nrm[b * 3 + 2] += nz;
      nrm[c * 3] += nx; nrm[c * 3 + 1] += ny; nrm[c * 3 + 2] += nz;
    }
    for (let i = 0; i < this.nv; i++) {
      const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
      nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
    }
  }

  upload(gfx) {
    if (!this.vb) {
      this.vb = gfx.buffer(this.meshVerts.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, this.meshVerts);
      this.ib = gfx.buffer(this.meshIndex.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, this.meshIndex);
    } else {
      gfx.device.queue.writeBuffer(this.vb, 0, this.meshVerts);
      gfx.device.queue.writeBuffer(this.ib, 0, this.meshIndex);
    }
  }
}
