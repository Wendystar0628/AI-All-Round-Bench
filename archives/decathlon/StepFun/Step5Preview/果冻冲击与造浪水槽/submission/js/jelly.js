window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  const U = APP.util;

  function inv3(m, o) {
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    let det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) det = 1e-12;
    det = 1 / det;
    o = o || new Float32Array(9);
    o[0] = A * det; o[1] = B * det; o[2] = C * det;
    o[3] = -(b * i - c * h) * det; o[4] = (a * i - c * g) * det; o[5] = -(a * h - b * g) * det;
    o[6] = (b * f - c * e) * det; o[7] = -(a * f - c * d) * det; o[8] = (a * e - b * d) * det;
    return o;
  }
  function polarRot(A, o) {
    const R = new Float32Array(A);
    const T = new Float32Array(9), I = new Float32Array(9);
    for (let it = 0; it < 4; it++) {
      T[0] = R[0]; T[1] = R[3]; T[2] = R[6];
      T[3] = R[1]; T[4] = R[4]; T[5] = R[7];
      T[6] = R[2]; T[7] = R[5]; T[8] = R[8];
      inv3(T, I);
      for (let k = 0; k < 9; k++) R[k] = 0.5 * (R[k] + I[k]);
    }
    for (let k = 0; k < 9; k++) o[k] = R[k];
    return o;
  }

  class Jelly {
    constructor(o) {
      this.id = o.id || 0;
      this.sx = o.size[0]; this.sy = o.size[1]; this.sz = o.size[2];
      this.nx = o.segs[0]; this.ny = o.segs[1]; this.nz = o.segs[2];
      this.cx = o.center[0]; this.cy = o.center[1]; this.cz = o.center[2];
      this.color = o.color || [0.9, 0.3, 0.4, 1];
      this.softness = o.softness === undefined ? 0.5 : o.softness;
      this.sturdiness = o.sturdiness === undefined ? 0.6 : o.sturdiness;
      this.density = o.density || 1100;
      this.roundTop = o.roundTop || false;
      this.pr = 0.013;
      this.build();
      this.dmesh = APP.R.createDynMesh(this.nP + 64, this.maxTris * 3);
      this.rebuildMesh();
    }

    build() {
      const nx = this.nx, ny = this.ny, nz = this.nz;
      const nP = (nx + 1) * (ny + 1) * (nz + 1);
      this.nP = nP;
      const pos = new Float32Array(nP * 3);
      const rest = new Float32Array(nP * 3);
      const pid = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
      for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const id = pid(i, j, k);
        let fx = i / nx - 0.5, fy = j / ny - 0.5, fz = k / nz - 0.5;
        if (this.roundTop) {
          const r = Math.hypot(fx, fz) * 2;
          if (r > 1) { fx /= r; fz /= r; }
        }
        const x = this.cx + fx * this.sx, y = this.cy + fy * this.sy, z = this.cz + fz * this.sz;
        pos[id * 3] = x; pos[id * 3 + 1] = y; pos[id * 3 + 2] = z;
        rest[id * 3] = x - this.cx; rest[id * 3 + 1] = y - this.cy; rest[id * 3 + 2] = z - this.cz;
      }
      this.pos = pos; this.rest = rest;
      this.vel = new Float32Array(nP * 3);
      const vol = this.sx * this.sy * this.sz;
      this.pMass = (this.density * vol) / nP;
      this.invPMass = 1 / this.pMass;
      const c000 = 0, c100 = 1, c010 = 2, c001 = 3, c110 = 4, c101 = 5, c011 = 6, c111 = 7;
      const tetPat = [
        [c000, c111, c100, c110], [c000, c111, c100, c101], [c000, c111, c010, c110],
        [c000, c111, c010, c011], [c000, c111, c001, c101], [c000, c111, c001, c011],
      ];
      const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const tets = [];
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        for (const pat of tetPat) {
          const t = [];
          for (const c of pat) t.push(pid(i + corner[c][0], j + corner[c][1], k + corner[c][2]));
          tets.push(t);
        }
      }
      const nT = tets.length;
      this.nT = nT;
      this.tets = new Int32Array(tets.flat());
      this.tetAlive = new Uint8Array(nT).fill(1);
      this.tetVol0 = new Float32Array(nT);
      this.tetRest = new Float32Array(nT * 12);
      this.tetCinv = new Float32Array(nT * 9);
      for (let t = 0; t < nT; t++) {
        const a = tets[t];
        let v0 = 0;
        for (let m = 0; m < 4; m++) {
          const p = a[m];
          this.tetRest[t * 12 + m * 3] = rest[p * 3];
          this.tetRest[t * 12 + m * 3 + 1] = rest[p * 3 + 1];
          this.tetRest[t * 12 + m * 3 + 2] = rest[p * 3 + 2];
        }
        const p0 = a[0] * 3, p1 = a[1] * 3, p2 = a[2] * 3, p3 = a[3] * 3;
        const e1 = [rest[p1] - rest[p0], rest[p1 + 1] - rest[p0 + 1], rest[p1 + 2] - rest[p0 + 2]];
        const e2 = [rest[p2] - rest[p0], rest[p2 + 1] - rest[p0 + 1], rest[p2 + 2] - rest[p0 + 2]];
        const e3 = [rest[p3] - rest[p0], rest[p3 + 1] - rest[p0 + 1], rest[p3 + 2] - rest[p0 + 2]];
        const cx = e2[1] * e3[2] - e2[2] * e3[1], cy = e2[2] * e3[0] - e2[0] * e3[2], cz = e2[0] * e3[1] - e2[1] * e3[0];
        v0 = Math.abs(e1[0] * cx + e1[1] * cy + e1[2] * cz) / 6;
        this.tetVol0[t] = v0;
        let rcx2 = 0, rcy2 = 0, rcz2 = 0;
        for (let m = 0; m < 4; m++) { rcx2 += rest[a[m] * 3]; rcy2 += rest[a[m] * 3 + 1]; rcz2 += rest[a[m] * 3 + 2]; }
        rcx2 /= 4; rcy2 /= 4; rcz2 /= 4;
        const Cm = new Float32Array(9);
        for (let m = 0; m < 4; m++) {
          const px = rest[a[m] * 3] - rcx2, py = rest[a[m] * 3 + 1] - rcy2, pz = rest[a[m] * 3 + 2] - rcz2;
          Cm[0] += px * px; Cm[1] += py * px; Cm[2] += pz * px;
          Cm[3] += px * py; Cm[4] += py * py; Cm[5] += pz * py;
          Cm[6] += px * pz; Cm[7] += py * pz; Cm[8] += pz * pz;
        }
        const Ci = inv3(Cm, new Float32Array(9));
        let tr = 0;
        for (let m = 0; m < 4; m++) { const px = rest[a[m] * 3] - rcx2, py = rest[a[m] * 3 + 1] - rcy2, pz = rest[a[m] * 3 + 2] - rcz2; tr += px * px + py * py + pz * pz; }
        for (let q = 0; q < 9; q++) this.tetCinv[t * 9 + q] = Ci[q];
      }
      const edges = new Map();
      for (let t = 0; t < nT; t++) {
        const a = tets[t];
        for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
          const i0 = Math.min(a[x], a[y]), i1 = Math.max(a[x], a[y]);
          const key = i0 * 100000 + i1;
          if (!edges.has(key)) {
            const d = Math.hypot(rest[i0 * 3] - rest[i1 * 3], rest[i0 * 3 + 1] - rest[i1 * 3 + 1], rest[i0 * 3 + 2] - rest[i1 * 3 + 2]);
            edges.set(key, [i0, i1, d]);
          }
        }
      }
      const el = [...edges.values()];
      this.edges = new Int32Array(el.length * 2);
      this.edgeLen = new Float32Array(el.length);
      for (let i = 0; i < el.length; i++) { this.edges[i * 2] = el[i][0]; this.edges[i * 2 + 1] = el[i][1]; this.edgeLen[i] = el[i][2]; }
      this.nE = el.length;
      this.faces = [];
      const fmap = new Map();
      const fkey = (a, b, c) => {
        const arr = [a, b, c].sort((p, q) => p - q);
        return arr[0] * 100000000 + arr[1] * 10000 + arr[2];
      };
      for (let t = 0; t < nT; t++) {
        const a = tets[t];
        const fs = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
        for (const f of fs) {
          const key = fkey(a[f[0]], a[f[1]], a[f[2]]);
          if (fmap.has(key)) fmap.get(key).push(t);
          else fmap.set(key, [t]);
        }
      }
      this.faceMap = fmap;
      this.faceOwner = [];
      for (const [key, ts] of fmap) this.faceOwner.push({ key, ts });
      this.pAlive = new Uint8Array(nP);
      this.pAlive.fill(1);
      this.tetCount = new Uint8Array(nP);
      for (let t = 0; t < nT; t++) for (let m = 0; m < 4; m++) this.tetCount[this.tets[t * 4 + m]]++;
      this.maxTris = 2400 + this.nT * 2;
      this.positions = new Float32Array((nP + 64) * 3);
      this.normals = new Float32Array((nP + 64) * 3);
      this.indices = new Uint32Array(this.maxTris * 3);
      this.meshDirty = true;
      this.fractureEvents = 0;
      this.vol0 = this.volume();
    }

    volume() {
      let v = 0;
      for (let t = 0; t < this.nT; t++) {
        if (!this.tetAlive[t]) continue;
        const a = this.tets[t * 4] * 3, b = this.tets[t * 4 + 1] * 3, c = this.tets[t * 4 + 2] * 3, d = this.tets[t * 4 + 3] * 3;
        const e1 = [this.pos[b] - this.pos[a], this.pos[b + 1] - this.pos[a + 1], this.pos[b + 2] - this.pos[a + 2]];
        const e2 = [this.pos[c] - this.pos[a], this.pos[c + 1] - this.pos[a + 1], this.pos[c + 2] - this.pos[a + 2]];
        const e3 = [this.pos[d] - this.pos[a], this.pos[d + 1] - this.pos[a + 1], this.pos[d + 2] - this.pos[a + 2]];
        const cx = e2[1] * e3[2] - e2[2] * e3[1], cy = e2[2] * e3[0] - e2[0] * e3[2], cz = e2[0] * e3[1] - e2[1] * e3[0];
        v += Math.abs(e1[0] * cx + e1[1] * cy + e1[2] * cz) / 6;
      }
      return v;
    }

    params() {
      const soft = this.softness;
      const distC = 0.00002 + soft * 0.00035;
      const shapeK = 1 - soft * 0.985;
      const volK = 0.30 + soft * 0.34;
      const stretchLim = 1.78 - this.sturdiness * 0.5;
      const volLim = 0.46 - this.sturdiness * 0.24;
      const damp = 0.996 - soft * 0.004;
      return { distC, shapeK, volK, stretchLim, volLim, damp };
    }

    integrate(dt, g) {
      const p = this.params();
      const pos = this.pos, vel = this.vel;
      for (let i = 0; i < this.nP; i++) {
        vel[i * 3 + 1] -= g * dt;
        vel[i * 3] *= p.damp; vel[i * 3 + 1] *= p.damp; vel[i * 3 + 2] *= p.damp;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
    }

    solve(dt, iters) {
      const pr = this.params();
      const pos = this.pos, vel = this.vel;
      const alpha = pr.distC / (dt * dt);
      for (let it = 0; it < iters; it++) {
        for (let e = 0; e < this.nE; e++) {
          const i = this.edges[e * 2], j = this.edges[e * 2 + 1];
          if (this.pAlive[i] === 0 && this.pAlive[j] === 0) continue;
          let dx = pos[j * 3] - pos[i * 3], dy = pos[j * 3 + 1] - pos[i * 3 + 1], dz = pos[j * 3 + 2] - pos[i * 3 + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d < 1e-9) continue;
          const L = this.edgeLen[e];
          const C = d - L;
          const w = 2 * this.invPMass + alpha;
          const lam = -C / w;
          dx /= d; dy /= d; dz /= d;
          const c = lam * this.invPMass;
          pos[i * 3] -= dx * c; pos[i * 3 + 1] -= dy * c; pos[i * 3 + 2] -= dz * c;
          pos[j * 3] += dx * c; pos[j * 3 + 1] += dy * c; pos[j * 3 + 2] += dz * c;
        }

        const A = new Float32Array(9), B = new Float32Array(9);
        for (let t = 0; t < this.nT; t++) {
          if (!this.tetAlive[t]) continue;
          const ti = t * 4;
          let cx = 0, cy = 0, cz = 0;
          for (let m = 0; m < 4; m++) { cx += pos[this.tets[ti + m] * 3]; cy += pos[this.tets[ti + m] * 3 + 1]; cz += pos[this.tets[ti + m] * 3 + 2]; }
          cx /= 4; cy /= 4; cz /= 4;
          let rcx = 0, rcy = 0, rcz = 0;
          for (let m = 0; m < 4; m++) { rcx += this.tetRest[t * 12 + m * 3]; rcy += this.tetRest[t * 12 + m * 3 + 1]; rcz += this.tetRest[t * 12 + m * 3 + 2]; }
          rcx /= 4; rcy /= 4; rcz /= 4;
          for (let k = 0; k < 9; k++) A[k] = 0;
          for (let m = 0; m < 4; m++) {
            const pi = this.tets[ti + m] * 3;
            const qx = pos[pi] - cx, qy = pos[pi + 1] - cy, qz = pos[pi + 2] - cz;
            const px = this.tetRest[t * 12 + m * 3] - rcx, py = this.tetRest[t * 12 + m * 3 + 1] - rcy, pz = this.tetRest[t * 12 + m * 3 + 2] - rcz;
            A[0] += qx * px; A[1] += qy * px; A[2] += qz * px;
            A[3] += qx * py; A[4] += qy * py; A[5] += qz * py;
            A[6] += qx * pz; A[7] += qy * pz; A[8] += qz * pz;
          }
          const Ci = this.tetCinv;
          for (let cc = 0; cc < 3; cc++) for (let rr = 0; rr < 3; rr++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += A[k * 3 + rr] * Ci[t * 9 + cc * 3 + k];
            B[cc * 3 + rr] = s;
          }
          if (!isFinite(B[0])) continue;
          const k2 = pr.shapeK / 4;
          for (let m = 0; m < 4; m++) {
            const pi = this.tets[ti + m] * 3;
            const px = this.tetRest[t * 12 + m * 3] - rcx, py = this.tetRest[t * 12 + m * 3 + 1] - rcy, pz = this.tetRest[t * 12 + m * 3 + 2] - rcz;
            const gx = cx + B[0] * px + B[3] * py + B[6] * pz;
            const gy = cy + B[1] * px + B[4] * py + B[7] * pz;
            const gz = cz + B[2] * px + B[5] * py + B[8] * pz;
            pos[pi] += (gx - pos[pi]) * k2;
            pos[pi + 1] += (gy - pos[pi + 1]) * k2;
            pos[pi + 2] += (gz - pos[pi + 2]) * k2;
          }
        }
        const av = pr.volK;
        const ipm = this.invPMass;
        for (let t = 0; t < this.nT; t++) {
          if (!this.tetAlive[t]) continue;
          const ti = t * 4;
          const p0 = this.tets[ti] * 3, p1 = this.tets[ti + 1] * 3, p2 = this.tets[ti + 2] * 3, p3 = this.tets[ti + 3] * 3;
          const ax = pos[p0], ay = pos[p0 + 1], az = pos[p0 + 2];
          const bx = pos[p1] - ax, by = pos[p1 + 1] - ay, bz = pos[p1 + 2] - az;
          const cx = pos[p2] - ax, cy = pos[p2 + 1] - ay, cz = pos[p2 + 2] - az;
          const dx = pos[p3] - ax, dy = pos[p3 + 1] - ay, dz = pos[p3 + 2] - az;
          const nx = cy * dz - cz * dy, ny = cz * dx - cx * dz, nz = cx * dy - cy * dx;
          const det = bx * nx + by * ny + bz * nz;
          if (det > -1e-13 && det < 1e-13) continue;
          const sg = det >= 0 ? 1 : -1;
          const V0 = this.tetVol0[t];
          const C = sg * det / 6 - V0;
          if (C > -1e-12 && C < 1e-12) continue;
          const dbx = dy * bz - dz * by, dby = dz * bx - dx * bz, dbz = dx * by - dy * bx;
          const bcx = by * cz - bz * cy, bcy = bz * cx - bx * cz, bcz = bx * cy - by * cx;
          const g0x = sg * -(nx + dbx + bcx), g0y = sg * -(ny + dby + bcy), g0z = sg * -(nz + dbz + bcz);
          const g1x = sg * nx, g1y = sg * ny, g1z = sg * nz;
          const g2x = sg * dbx, g2y = sg * dby, g2z = sg * dbz;
          const g3x = sg * bcx, g3y = sg * bcy, g3z = sg * bcz;
          let denom = (g0x * g0x + g0y * g0y + g0z * g0z + g1x * g1x + g1y * g1y + g1z * g1z + g2x * g2x + g2y * g2y + g2z * g2z + g3x * g3x + g3y * g3y + g3z * g3z) * ipm;
          if (denom < 1e-9) continue;
          const lam = (-C / denom) * av * ipm;
          pos[p0] += lam * g0x; pos[p0 + 1] += lam * g0y; pos[p0 + 2] += lam * g0z;
          pos[p1] += lam * g1x; pos[p1 + 1] += lam * g1y; pos[p1 + 2] += lam * g1z;
          pos[p2] += lam * g2x; pos[p2 + 1] += lam * g2y; pos[p2 + 2] += lam * g2z;
          pos[p3] += lam * g3x; pos[p3 + 1] += lam * g3y; pos[p3 + 2] += lam * g3z;
        }
      }
    }    updateVel(dt) {
      const pos = this.pos, vel = this.vel;
      const inv = 1 / dt;

      for (let i = 0; i < this.nP; i++) {
        vel[i * 3] = (pos[i * 3] - this.prev[i * 3]) * inv;
        vel[i * 3 + 1] = (pos[i * 3 + 1] - this.prev[i * 3 + 1]) * inv;
        vel[i * 3 + 2] = (pos[i * 3 + 2] - this.prev[i * 3 + 2]) * inv;
        const sp = Math.hypot(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
        if (sp > 18) { const s = 18 / sp; vel[i * 3] *= s; vel[i * 3 + 1] *= s; vel[i * 3 + 2] *= s; }
      }
    }

    ground(y0, fric) {
      const pos = this.pos, vel = this.vel;
      for (let i = 0; i < this.nP; i++) {
        if (pos[i * 3 + 1] < y0) {
          pos[i * 3 + 1] = y0;
          if (vel[i * 3 + 1] < 0) vel[i * 3 + 1] *= -0.25;
          vel[i * 3] *= fric; vel[i * 3 + 2] *= fric;
        }
      }
    }

    checkFracture() {
      const pr = this.params();
      const pos = this.pos;
      const tets = this.tets, rest = this.tetRest;
      let broke = 0;
      for (let t = 0; t < this.nT; t++) {
        if (!this.tetAlive[t]) continue;
        const ti = t * 4;
        const a = tets[ti] * 3, b = tets[ti + 1] * 3, cc = tets[ti + 2] * 3, d = tets[ti + 3] * 3;
        const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
        const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
        const cx = pos[cc], cy = pos[cc + 1], cz = pos[cc + 2];
        const dx = pos[d], dy = pos[d + 1], dz = pos[d + 2];
        const rt = t * 12;
        const rax = rest[rt], ray = rest[rt + 1], raz = rest[rt + 2];
        const rbx = rest[rt + 3], rby = rest[rt + 4], rbz = rest[rt + 5];
        const rcx = rest[rt + 6], rcy = rest[rt + 7], rcz = rest[rt + 8];
        const rdx = rest[rt + 9], rdy = rest[rt + 10], rdz = rest[rt + 11];
        const d1 = Math.hypot(bx - ax, by - ay, bz - az);
        const r1 = Math.hypot(rbx - rax, rby - ray, rbz - raz);
        let ms = r1 > 1e-9 ? d1 / r1 : 1;
        const d2 = Math.hypot(cx - ax, cy - ay, cz - az);
        const r2 = Math.hypot(rcx - rax, rcy - ray, rcz - raz);
        if (r2 > 1e-9) ms = Math.max(ms, d2 / r2);
        const d3 = Math.hypot(dx - ax, dy - ay, dz - az);
        const r3 = Math.hypot(rdx - rax, rdy - ray, rdz - raz);
        if (r3 > 1e-9) ms = Math.max(ms, d3 / r3);
        const d4 = Math.hypot(cx - bx, cy - by, cz - bz);
        const r4 = Math.hypot(rcx - rbx, rcy - rby, rcz - rbz);
        if (r4 > 1e-9) ms = Math.max(ms, d4 / r4);
        const d5 = Math.hypot(dx - bx, dy - by, dz - bz);
        const r5 = Math.hypot(rdx - rbx, rdy - rby, rdz - rbz);
        if (r5 > 1e-9) ms = Math.max(ms, d5 / r5);
        const d6 = Math.hypot(dx - cx, dy - cy, dz - cz);
        const r6 = Math.hypot(rdx - rcx, rdy - rcy, rdz - rcz);
        if (r6 > 1e-9) ms = Math.max(ms, d6 / r6);
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const e3x = dx - ax, e3y = dy - ay, e3z = dz - az;
        const vx = e2y * e3z - e2z * e3y, vy = e2z * e3x - e2x * e3z, vz = e2x * e3y - e2y * e3x;
        const det = e1x * vx + e1y * vy + e1z * vz;
        const volRatio = Math.abs(det) / (6 * this.tetVol0[t]);
        if (ms > pr.stretchLim || volRatio < pr.volLim) {
          this.tetAlive[t] = 0;
          broke++;
        }
      }
      if (broke > 0) {
        this.pAlive.fill(0);
        for (let t = 0; t < this.nT; t++) if (this.tetAlive[t]) for (let m = 0; m < 4; m++) this.pAlive[this.tets[t * 4 + m]] = 1;
        this.meshDirty = true;
        this.fractureEvents += broke;
      }
      return broke;
    }
    rebuildMesh() {
      const pos = this.pos;
      const indices = this.indices;
      let nt = 0;
      for (const f of this.faceOwner) {
        const ts = f.ts;
        let alive = 0, owner = -1;
        for (const t of ts) if (this.tetAlive[t]) { alive++; owner = t; }
        if (alive !== 1) continue;
        const t = owner;
        const a = this.tets[t * 4], b = this.tets[t * 4 + 1], c = this.tets[t * 4 + 2], d = this.tets[t * 4 + 3];
        const arr = [a, b, c, d];
        const fs = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
        for (const fc of fs) {
          const key = [arr[fc[0]], arr[fc[1]], arr[fc[2]]].sort((p, q) => p - q);
          if (key[0] * 100000000 + key[1] * 10000 + key[2] === f.key) {
            let i0 = arr[fc[0]], i1 = arr[fc[1]], i2 = arr[fc[2]];
            const miss = [0, 1, 2, 3].filter(m => !fc.includes(m))[0];
            const pm = arr[miss] * 3;
            const p0 = [pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]];
            const p1 = [pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]];
            const p2 = [pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]];
            const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
            const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
            const nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
            const dx = pos[pm] - p0[0], dy = pos[pm + 1] - p0[1], dz = pos[pm + 2] - p0[2];
            if (nx * dx + ny2 * dy + nz2 * dz > 0) { const tmp = i1; i1 = i2; i2 = tmp; }
            if (nt * 3 + 2 < this.indices.length) {
              indices[nt * 3] = i0; indices[nt * 3 + 1] = i1; indices[nt * 3 + 2] = i2;
              nt++;
            }
            break;
          }
        }
      }
      this.nTris = nt;
      this.positions.set(this.pos.subarray(0, this.nP * 3));
      const nrm = this.normals;
      nrm.fill(0, 0, this.nP * 3);
      for (let i = 0; i < nt; i++) {
        const i0 = indices[i * 3], i1 = indices[i * 3 + 1], i2 = indices[i * 3 + 2];
        const p0 = [this.positions[i0 * 3], this.positions[i0 * 3 + 1], this.positions[i0 * 3 + 2]];
        const p1 = [this.positions[i1 * 3], this.positions[i1 * 3 + 1], this.positions[i1 * 3 + 2]];
        const p2 = [this.positions[i2 * 3], this.positions[i2 * 3 + 1], this.positions[i2 * 3 + 2]];
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        const nx = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
        for (const id of [i0, i1, i2]) { nrm[id * 3] += nx; nrm[id * 3 + 1] += ny2; nrm[id * 3 + 2] += nz2; }
      }
      for (let i = 0; i < this.nP; i++) {
        const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
        if (l > 1e-9) { nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l; }
        else { nrm[i * 3] = 0; nrm[i * 3 + 1] = 1; nrm[i * 3 + 2] = 0; }
      }
      APP.R.updateDynMesh(this.dmesh, this.positions.subarray(0, this.nP * 3), this.normals.subarray(0, this.nP * 3), this.indices.subarray(0, nt * 3));
      this.meshDirty = false;
    }

    step(dt, world, sub) {
      if (!this.prev) this.prev = new Float32Array(this.pos);
      const g = 9.81;
      const nsub = sub || 6;
      const h = dt / nsub;
      for (let s = 0; s < nsub; s++) {
        this.prev.set(this.pos);
        this.integrate(h, g);
        if (world.collideJelly) world.collideJelly(this, h);
        this.ground(world.groundY, world.friction);
        this.solve(h, 1);
        if (world.postSolve) world.postSolve(this, h);
        this.updateVel(h);
        if (s % 2 === 0) this.checkFracture();
      }
      if (this.meshDirty || this.nTris === 0) this.rebuildMesh();
      else {
        this.positions.set(this.pos.subarray(0, this.nP * 3));
        APP.R.updateDynMesh(this.dmesh, this.positions.subarray(0, this.nP * 3), this.normals.subarray(0, this.nP * 3), this.indices.subarray(0, this.nTris * 3));
      }
      return this;
    }
  }

  APP.Jelly = Jelly;
})();























