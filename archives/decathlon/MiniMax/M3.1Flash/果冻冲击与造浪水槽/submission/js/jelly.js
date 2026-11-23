/* jelly.js — XPBD tetrahedral soft body with strain-driven fracture,
   plus rigid-body balls with two-way coupling to the gel. */
(function (global) {
  'use strict';
  const U = global.U, Geo = global.Geo;

  const SUBSTEPS = 8;
  const GRAVITY = -9.81;

  class Body {
    constructor(spec) {
      this.mesh = Geo.buildTetJelly(spec);
      const nv = this.mesh.nv;
      this.pos = new Float32Array(this.mesh.pos);
      this.prev = new Float32Array(nv * 3);
      this.vel = new Float32Array(nv * 3);
      this.invMass = new Float32Array(nv);
      this.normals = new Float32Array(nv * 3);
      this.damage = new Float32Array(nv);

      this.alphaEdge = 3e-8;
      this.alphaVol = 2e-9;
      this.breakStrain = 0.35;
      this.density = 620;
      this.damping = 0.02;
      this.color = spec.color || [0.85, 0.42, 0.62];
      this.translucency = spec.translucency === undefined ? 0.55 : spec.translucency;
      this.shape = spec.shape;
      this.posOffset = spec.pos || [0, 0, 0];

      // rest positions with the world offset applied
      for (let i = 0; i < nv; i++) {
        this.pos[i * 3] = this.mesh.pos[i * 3] + this.posOffset[0];
        this.pos[i * 3 + 1] = this.mesh.pos[i * 3 + 1] + this.posOffset[1];
        this.pos[i * 3 + 2] = this.mesh.pos[i * 3 + 2] + this.posOffset[2];
      }
      this.restPos = new Float32Array(this.pos);

      // vertex masses from the rest volumes
      const tets = this.mesh.tets, rv = this.mesh.restVol;
      const mass = new Float32Array(nv);
      for (let t = 0; t < this.mesh.ntet; t++) {
        const m = rv[t] * this.density * 0.25;
        for (let k = 0; k < 4; k++) mass[tets[t * 4 + k]] += m;
      }
      for (let i = 0; i < nv; i++) this.invMass[i] = mass[i] > 1e-9 ? 1 / mass[i] : 0;

      // per-constraint state
      this.edgeAlive = new Uint8Array(this.mesh.nedge).fill(1);
      this.edgeLambda = new Float32Array(this.mesh.nedge);
      this.edgeDamage = new Float32Array(this.mesh.nedge);
      this.tetAlive = new Uint8Array(this.mesh.ntet).fill(1);
      this.tetLambda = new Float32Array(this.mesh.ntet);

      // edge -> incident tets (for fracture component rebuild)
      this.edgeTets = new Array(this.mesh.nedge);
      for (let e = 0; e < this.mesh.nedge; e++) this.edgeTets[e] = [];
      const ekey = (a, b) => (a < b ? a * 1000003 + b : b * 1000003 + a);
      this.edgeIndex = new Map();
      for (let e = 0; e < this.mesh.nedge; e++) {
        this.edgeIndex.set(ekey(this.mesh.edges[e * 2], this.mesh.edges[e * 2 + 1]), e);
      }
      for (let t = 0; t < this.mesh.ntet; t++) {
        const v = [tets[t * 4], tets[t * 4 + 1], tets[t * 4 + 2], tets[t * 4 + 3]];
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
          const e = this.edgeIndex.get(ekey(v[a], v[b]));
          if (e !== undefined) this.edgeTets[e].push(t);
        }
      }

      // surface quads (rebuilt when the mesh fractures)
      this.faces = new Int32Array(0);
      this.faceDirty = true;
      this.rebuildSurface();

      this.restEdges = this.mesh.restLen;
      this.onBreak = null;
    }

    reset() {
      this.pos.set(this.restPos);
      this.vel.fill(0);
      this.edgeAlive.fill(1);
      this.edgeLambda.fill(0);
      this.edgeDamage.fill(0);
      this.tetAlive.fill(1);
      this.tetLambda.fill(0);
      this.damage.fill(0);
      this.prev.set(this.pos);
      this.faceDirty = true;
      this.rebuildSurface();
    }

    /* Recompute the exposed surface: a quad is exposed when the tet on the other
       side of it is missing or belongs to a different fractured component. */
    rebuildSurface() {
      const m = this.mesh;
      const nt = m.ntet;
      const parent = new Int32Array(nt);
      for (let i = 0; i < nt; i++) parent[i] = i;
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
      for (let e = 0; e < m.nedge; e++) {
        if (!this.edgeAlive[e]) continue;
        const ts = this.edgeTets[e];
        for (let i = 1; i < ts.length; i++) uni(ts[0], ts[i]);
      }
      const faces = [];
      const fk = m.fkey;
      for (let t = 0; t < nt; t++) {
        const ft = m.faceTable[t];
        for (let fi = 0; fi < 4; fi++) {
          const f = ft[fi];
          const nb = m.faceMap.get(fk(f));
          const neigh = nb && nb.neigh ? nb.neigh.tet : -1;
          if (neigh >= 0 && find(neigh) === find(t)) continue;
          faces.push(f[0], f[1], f[2], f[3]);
        }
      }
      this.faces = new Int32Array(faces);
      this.faceDirty = false;
    }

    /* ---------- constraints ---------- */
    solveEdges(h) {
      const m = this.mesh, pos = this.pos, im = this.invMass;
      const alphaT = this.alphaEdge / (h * h);
      const edges = m.edges, rl = m.restLen;
      const lambda = this.edgeLambda, alive = this.edgeAlive, dmg = this.edgeDamage;
      const bs = this.breakStrain, kDmg = 1 / Math.max(1e-4, bs * 0.55);
      for (let e = 0; e < m.nedge; e++) {
        if (!alive[e]) continue;
        const a = edges[e * 2], b = edges[e * 2 + 1];
        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
        const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
        let dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-9) continue;
        const C = len - rl[e];
        const strain = C / rl[e];
        const s = Math.abs(strain);
        if (s > bs) {
          // fracture: damage accumulates, then the bond snaps
          dmg[e] += (s - bs) * 6 * kDmg;
          if (dmg[e] >= 1) {
            alive[e] = 0;
            this.damage[a] = Math.min(1, this.damage[a] + 0.7);
            this.damage[b] = Math.min(1, this.damage[b] + 0.7);
            if (this.onBreak) this.onBreak(this, e);
            continue;
          }
        } else {
          dmg[e] *= 0.92;
        }
        const inv = 1 / len;
        dx *= inv; dy *= inv; dz *= inv;
        const w = im[a] + im[b];
        if (w < 1e-12) continue;
        const dl = (-C - alphaT * lambda[e]) / (w + alphaT);
        lambda[e] += dl;
        const s0 = dl * im[a], s1 = dl * im[b];
        pos[a * 3] -= dx * s0; pos[a * 3 + 1] -= dy * s0; pos[a * 3 + 2] -= dz * s0;
        pos[b * 3] += dx * s1; pos[b * 3 + 1] += dy * s1; pos[b * 3 + 2] += dz * s1;
      }
    }

    solveTets(h) {
      const m = this.mesh, pos = this.pos, im = this.invMass;
      const alphaT = this.alphaVol / (h * h);
      const tets = m.tets, rv = m.restVol, lambda = this.tetLambda, alive = this.tetAlive;
      for (let t = 0; t < m.ntet; t++) {
        if (!alive[t]) continue;
        const i0 = tets[t * 4], i1 = tets[t * 4 + 1], i2 = tets[t * 4 + 2], i3 = tets[t * 4 + 3];
        const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
        const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
        const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];
        const dx = pos[i3 * 3], dy = pos[i3 * 3 + 1], dz = pos[i3 * 3 + 2];
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const wx = dx - ax, wy = dy - ay, wz = dz - az;
        const g1x = (vy * wz - vz * wy) / 6, g1y = (vz * wx - vx * wz) / 6, g1z = (vx * wy - vy * wx) / 6;
        const g2x = (wz * uy - wy * uz) / 6, g2y = (wx * uz - wz * ux) / 6, g2z = (wy * ux - wx * uy) / 6;
        const g3x = (uy * vz - uz * vy) / 6, g3y = (uz * vx - ux * vz) / 6, g3z = (ux * vy - uy * vx) / 6;
        const g0x = -(g1x + g2x + g3x), g0y = -(g1y + g2y + g3y), g0z = -(g1z + g2z + g3z);
        const V = (ux * g1x + uy * g1y + uz * g1z);
        const C = V - rv[t];
        const w = im[i0] * (g0x * g0x + g0y * g0y + g0z * g0z)
          + im[i1] * (g1x * g1x + g1y * g1y + g1z * g1z)
          + im[i2] * (g2x * g2x + g2y * g2y + g2z * g2z)
          + im[i3] * (g3x * g3x + g3y * g3y + g3z * g3z);
        if (w < 1e-14) continue;
        const dl = (-C - alphaT * lambda[t]) / (w + alphaT);
        lambda[t] += dl;
        let s = dl * im[i0]; pos[i0 * 3] += g0x * s; pos[i0 * 3 + 1] += g0y * s; pos[i0 * 3 + 2] += g0z * s;
        s = dl * im[i1]; pos[i1 * 3] += g1x * s; pos[i1 * 3 + 1] += g1y * s; pos[i1 * 3 + 2] += g1z * s;
        s = dl * im[i2]; pos[i2 * 3] += g2x * s; pos[i2 * 3 + 1] += g2y * s; pos[i2 * 3 + 2] += g2z * s;
        s = dl * im[i3]; pos[i3 * 3] += g3x * s; pos[i3 * 3 + 1] += g3y * s; pos[i3 * 3 + 2] += g3z * s;
      }
    }

    /* ---------- rendering data ---------- */
    buildRenderMesh(outVerts, outIdx) {
      const pos = this.pos, nrm = this.normals, dmg = this.damage;
      const nv = this.mesh.nv;
      nrm.fill(0);
      const faces = this.faces;
      const nf = faces.length / 4;
      let idx = 0;
      for (let f = 0; f < nf; f++) {
        const i0 = faces[f * 4], i1 = faces[f * 4 + 1], i2 = faces[f * 4 + 2], i3 = faces[f * 4 + 3];
        const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
        const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
        const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];
        const dx = pos[i3 * 3], dy = pos[i3 * 3 + 1], dz = pos[i3 * 3 + 2];
        // normal of triangle (0,1,2)
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        nrm[i0 * 3] += nx; nrm[i0 * 3 + 1] += ny; nrm[i0 * 3 + 2] += nz;
        nrm[i1 * 3] += nx; nrm[i1 * 3 + 1] += ny; nrm[i1 * 3 + 2] += nz;
        nrm[i2 * 3] += nx; nrm[i2 * 3 + 1] += ny; nrm[i2 * 3 + 2] += nz;
        // orient outward relative to the tet centroid handled at build time;
        // emit two triangles
        outIdx[idx++] = i0; outIdx[idx++] = i1; outIdx[idx++] = i2;
        outIdx[idx++] = i0; outIdx[idx++] = i2; outIdx[idx++] = i3;
      }
      // normalise normals and fill vertex buffer
      for (let i = 0; i < nv; i++) {
        const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
        outVerts[i * 7 + 0] = pos[i * 3];
        outVerts[i * 7 + 1] = pos[i * 3 + 1];
        outVerts[i * 7 + 2] = pos[i * 3 + 2];
        outVerts[i * 7 + 3] = nrm[i * 3] / l;
        outVerts[i * 7 + 4] = nrm[i * 3 + 1] / l;
        outVerts[i * 7 + 5] = nrm[i * 3 + 2] / l;
        outVerts[i * 7 + 6] = dmg[i];
      }
      return idx;
    }
  }

  /* ---------------- rigid ball ---------------- */
  class Ball {
    constructor(spec) {
      this.r = spec.r;
      this.m = spec.m;
      this.material = spec.material || 'steel';
      this.color = spec.color || [0.72, 0.74, 0.78];
      this.rough = spec.rough === undefined ? 0.28 : spec.rough;
      this.metal = spec.metal === undefined ? 1.0 : spec.metal;
      this.restitution = spec.restitution === undefined ? 0.22 : spec.restitution;
      this.friction = spec.friction === undefined ? 0.55 : spec.friction;
      this.pos = new Float32Array(spec.pos ? spec.pos.slice() : [0, 1, 0]);
      this.vel = new Float32Array(3);
      this.vpre = new Float32Array(3);
      this.prev = new Float32Array(3);
      this.quat = new Float32Array([0, 0, 0, 1]);
      this.omega = new Float32Array(3);
      this.invI = 1 / (0.4 * this.m * this.r * this.r);
      this.restPos = new Float32Array(this.pos);
      this.restVel = new Float32Array(3);
      this.active = spec.active === undefined ? true : spec.active;
      this.home = new Float32Array(spec.pos ? spec.pos.slice() : [0, 1, 0]);
    }
    reset() {
      this.pos.set(this.restPos);
      this.vel.set(this.restVel);
      this.prev.set(this.pos);
      this.quat.set([0, 0, 0, 1]);
      this.omega.set([0, 0, 0]);
      this.active = true;
    }
    launch(vx, vy, vz) {
      this.vel[0] = vx; this.vel[1] = vy; this.vel[2] = vz;
      this.active = true;
    }
  }

  class JellyWorld {
    constructor() {
      this.bodies = [];
      this.balls = [];
      this.gravity = GRAVITY;
      this.onEvent = null;
      this.tableY = 0;
      this.frictionTable = 0.42;
      this.restitution = 0.18;
    }

    addBody(spec) { const b = new Body(spec); this.bodies.push(b); return b; }
    addBall(spec) { const b = new Ball(spec); this.balls.push(b); return b; }

    reset() {
      for (const b of this.bodies) b.reset();
      for (const b of this.balls) b.reset();
    }

    step(dt) {
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) {
        this._predict(h);
        this._solve(h);
        this._finalize(h);
      }
      // fracture-triggered surface rebuild
      for (const b of this.bodies) {
        if (b.faceDirty) b.rebuildSurface();
      }
    }

    _predict(h) {
      const g = this.gravity;
      for (const b of this.bodies) {
        const pos = b.pos, prev = b.prev, vel = b.vel;
        for (let i = 0; i < b.mesh.nv; i++) {
          vel[i * 3 + 1] += g * h;
          prev[i * 3] = pos[i * 3]; prev[i * 3 + 1] = pos[i * 3 + 1]; prev[i * 3 + 2] = pos[i * 3 + 2];
          pos[i * 3] += vel[i * 3] * h;
          pos[i * 3 + 1] += vel[i * 3 + 1] * h;
          pos[i * 3 + 2] += vel[i * 3 + 2] * h;
        }
        b.edgeLambda.fill(0);
        b.tetLambda.fill(0);
      }
      for (const b of this.balls) {
        b.vel[1] += g * h;
        b.vpre[0] = b.vel[0]; b.vpre[1] = b.vel[1]; b.vpre[2] = b.vel[2];
        b.prev.set(b.pos);
        b.pos[0] += b.vel[0] * h; b.pos[1] += b.vel[1] * h; b.pos[2] += b.vel[2] * h;
        // integrate orientation
        const q = b.quat, w = b.omega;
        const wx = w[0] * h * 0.5, wy = w[1] * h * 0.5, wz = w[2] * h * 0.5;
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        let nx = qx + (wx * qw + wy * qz - wz * qy);
        let ny = qy + (wy * qw + wz * qx - wx * qz);
        let nz = qz + (wz * qw + wx * qy - wy * qx);
        let nw = qw - (wx * qx + wy * qy + wz * qz);
        const l = Math.hypot(nx, ny, nz, nw) || 1;
        q[0] = nx / l; q[1] = ny / l; q[2] = nz / l; q[3] = nw / l;
      }
    }

    _solve(h) {
      for (const b of this.bodies) { b.solveEdges(h); b.solveTets(h); }
      this._solveBallGel();
      this._solveBallTable();
      this._solveBallBall();
    }

    _solveBallGel() {
      for (const ball of this.balls) {
        if (!ball.active) continue;
        for (const body of this.bodies) {
          const pos = body.pos, im = body.invMass;
          const r = ball.r;
          const bx = ball.pos[0], by = ball.pos[1], bz = ball.pos[2];
          const r2 = r * r;
          const wb = 1 / ball.m;
          for (let i = 0; i < body.mesh.nv; i++) {
            const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
            let dx = px - bx, dy = py - by, dz = pz - bz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d, nz = dz / d;
            const depth = r - d;
            const wv = im[i];
            const wt = wv + wb;
            const kv = depth * wv / wt;   // gel vertex correction
            const kb = depth * wb / wt;   // ball reaction
            pos[i * 3] += nx * kv; pos[i * 3 + 1] += ny * kv; pos[i * 3 + 2] += nz * kv;
            ball.pos[0] -= nx * kb; ball.pos[1] -= ny * kb; ball.pos[2] -= nz * kb;
            // angular reaction on the ball
            const rx = px - bx, ry = py - by, rz = pz - bz;
            const tx = ry * (nz * kb) - rz * (ny * kb);
            const ty = rz * (nx * kb) - rx * (nz * kb);
            const tz = rx * (ny * kb) - ry * (nx * kb);
            ball.omega[0] -= tx * ball.invI;
            ball.omega[1] -= ty * ball.invI;
            ball.omega[2] -= tz * ball.invI;
          }
        }
      }
    }

    _solveBallTable() {
      const y0 = this.tableY;
      for (const ball of this.balls) {
        if (!ball.active) continue;
        if (ball.pos[1] < y0 + ball.r) {
          const pen = y0 + ball.r - ball.pos[1];
          ball.pos[1] = y0 + ball.r;
          // normal impulse handled in _finalize via velocity pass
          ball.contact = true;
          ball.pen = pen;
        } else { ball.contact = false; }
      }
    }

    _solveBallBall() {
      const balls = this.balls;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i]; if (!a.active) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j]; if (!b.active) continue;
          let dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-12) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = rr - d;
          const ima = 1 / a.m, imb = 1 / b.m;
          const total = ima + imb;
          a.pos[0] -= nx * pen * (ima / total); a.pos[1] -= ny * pen * (ima / total); a.pos[2] -= nz * pen * (ima / total);
          b.pos[0] += nx * pen * (imb / total); b.pos[1] += ny * pen * (imb / total); b.pos[2] += nz * pen * (imb / total);
          const rvx = b.vel[0] - a.vel[0], rvy = b.vel[1] - a.vel[1], rvz = b.vel[2] - a.vel[2];
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            const e = Math.min(a.restitution, b.restitution);
            const j = -(1 + e) * vn / total;
            a.vel[0] -= nx * j * ima; a.vel[1] -= ny * j * ima; a.vel[2] -= nz * j * ima;
            b.vel[0] += nx * j * imb; b.vel[1] += ny * j * imb; b.vel[2] += nz * j * imb;
            // tangential friction between the two balls
            const rvx = b.vel[0] - a.vel[0], rvy = b.vel[1] - a.vel[1], rvz = b.vel[2] - a.vel[2];
            let tx = rvx - nx * (rvx * nx + rvy * ny + rvz * nz);
            let ty = rvy - ny * (rvx * nx + rvy * ny + rvz * nz);
            let tz = rvz - nz * (rvx * nx + rvy * ny + rvz * nz);
            const tl = Math.hypot(tx, ty, tz);
            if (tl > 1e-6) {
              const jt = Math.min(0.5 * Math.abs(j), tl / total);
              tx /= tl; ty /= tl; tz /= tl;
              a.vel[0] += tx * jt * ima; a.vel[1] += ty * jt * ima; a.vel[2] += tz * jt * ima;
              b.vel[0] -= tx * jt * imb; b.vel[1] -= ty * jt * imb; b.vel[2] -= tz * jt * imb;
            }
          }
        }
      }
    }

    _finalize(h) {
      for (const b of this.bodies) {
        const pos = b.pos, prev = b.prev, vel = b.vel, im = b.invMass;
        const damp = 1 - b.damping;
        for (let i = 0; i < b.mesh.nv; i++) {
          if (im[i] === 0) { vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0; continue; }
          let vx = (pos[i * 3] - prev[i * 3]) / h;
          let vy = (pos[i * 3 + 1] - prev[i * 3 + 1]) / h;
          let vz = (pos[i * 3 + 2] - prev[i * 3 + 2]) / h;
          vel[i * 3] = vx * damp; vel[i * 3 + 1] = vy * damp; vel[i * 3 + 2] = vz * damp;
        }
      }
      // gel vs table: contact + Coulomb friction at the velocity level
      const mu = this.frictionTable;
      for (const b of this.bodies) {
        const pos = b.pos, vel = b.vel;
        for (let i = 0; i < b.mesh.nv; i++) {
          if (pos[i * 3 + 1] < this.tableY) {
            const pen = this.tableY - pos[i * 3 + 1];
            pos[i * 3 + 1] = this.tableY;
            const vx = vel[i * 3], vz = vel[i * 3 + 2];
            const l = Math.hypot(vx, vz);
            if (l > 1e-9) {
              const maxDv = (mu * pen) / h;
              const s = Math.min(1, maxDv / l);
              vel[i * 3] -= vx * s; vel[i * 3 + 2] -= vz * s;
            }
            if (vel[i * 3 + 1] < 0) vel[i * 3 + 1] = 0;
          }
        }
      }
      // balls
      for (const ball of this.balls) {
        if (!ball.active) continue;
        const vx = (ball.pos[0] - ball.prev[0]) / h;
        const vy = (ball.pos[1] - ball.prev[1]) / h;
        const vz = (ball.pos[2] - ball.prev[2]) / h;
        ball.vel[0] = vx; ball.vel[1] = vy; ball.vel[2] = vz;
        if (ball.contact) {
          const vnPre = ball.vpre[1];
          if (vnPre < 0) ball.vel[1] = -ball.restitution * vnPre;
          // friction / rolling at the contact point
          const rc = [0, -ball.r, 0];
          const cx = ball.vel[0] + (ball.omega[1] * rc[2] - ball.omega[2] * rc[1]);
          const cz = ball.vel[2] + (ball.omega[0] * rc[1] - ball.omega[1] * rc[0]);
          const l = Math.hypot(cx, cz);
          if (l > 1e-6) {
            const jn = Math.abs(vnPre) * ball.m;
            const jt = Math.min(ball.friction * jn, l * ball.m);
            const tx = -cx / l * jt, tz = -cz / l * jt;
            ball.vel[0] += tx / ball.m; ball.vel[2] += tz / ball.m;
            ball.omega[0] += (rc[1] * tz - rc[2] * 0) * ball.invI;
            ball.omega[2] += (rc[0] * 0 - rc[1] * tx) * ball.invI;
          }
        }
        const wd = 1 - 0.006;
        ball.omega[0] *= wd; ball.omega[1] *= wd; ball.omega[2] *= wd;
      }
    }
  }

  global.JellyWorld = JellyWorld;
  global.JellyBody = Body;
})(window);
