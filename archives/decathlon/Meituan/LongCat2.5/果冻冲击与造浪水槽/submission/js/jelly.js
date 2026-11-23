/* jelly.js — 体积软体果冻：点阵 XPBD（结构/剪切/弯曲约束）+ 断裂判据 + Surface Nets 表面重建 */
(function () {
  const App = (window.App = window.App || {});
  const { clamp } = App.util;

  const STRUCT = 0, SHEAR = 1, BEND = 2;

  class Jelly {
    /**
     * opts: { n, size, center, shape:'cube'|'round'|'dome', softness, strength, color, density, friction }
     */
    constructor(opts) {
      this.n = opts.n || 9;
      this.size = opts.size || 0.16;
      this.center = opts.center ? new Float32Array(opts.center) : new Float32Array([0, 0.08, 0]);
      this.shape = opts.shape || 'cube';
      this.softness = opts.softness === undefined ? 0.5 : opts.softness;
      this.strength = opts.strength === undefined ? 0.5 : opts.strength;
      this.color = opts.color || [1, 0.55, 0.25, 1];
      this.density = opts.density || 1050;
      this.friction = opts.friction === undefined ? 0.55 : opts.friction;
      this.nodeR = 0;
      this.h = 0;
      this.broken = false;
      this.chunkCount = 1;
      this.build();
    }

    build() {
      const n = this.n, S = this.size;
      const h = S / (n - 1);
      this.h = h;
      this.nodeR = h * 0.55;
      const c = this.center;
      const half = S / 2;
      const rest = [];
      const idxMap = new Int32Array(n * n * n).fill(-1);
      const a = half * 0.92;
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = -half + i * h, y = -half + j * h, z = -half + k * h;
        let keep = true;
        if (this.shape === 'round') {
          const u = x / a, v = y / a, w = z / a;
          keep = (u * u + v * v + w * w) <= 1.0;
        } else if (this.shape === 'dome') {
          const u = x / a, v = (y + half) / a, w = z / a;
          keep = (u * u + v * v + w * w) <= 1.0 && y <= 0.001;
        }
        if (!keep) continue;
        idxMap[i + j * n + k * n * n] = rest.length / 3;
        rest.push(c[0] + x, c[1] + y, c[2] + z);
      }
      const N = rest.length / 3;
      this.N = N;
      this.rest = new Float32Array(rest);
      this.pos = new Float32Array(rest);
      this.prev = new Float32Array(rest);
      this.vel = new Float32Array(N * 3);
      this.nodeMass = (this.density * Math.pow(S, 3) * 0.6) / Math.max(1, N);
      this.nodeInvM = 1 / this.nodeMass;

      // 生成约束
      const cA = [], cB = [], cRest = [], cK = [], cType = [];
      const offsets = [];
      for (const o of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) offsets.push({ o, t: STRUCT });
      for (const o of [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]]) offsets.push({ o, t: SHEAR });
      for (const o of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]]) offsets.push({ o, t: BEND });
      const nIdx = (i, j, k) => idxMap[i + j * n + k * n * n];
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const ia = nIdx(i, j, k);
        if (ia < 0) continue;
        for (const { o, t } of offsets) {
          const ii = i + o[0], jj = j + o[1], kk = k + o[2];
          if (ii < 0 || jj < 0 || kk < 0 || ii >= n || jj >= n || kk >= n) continue;
          const ib = nIdx(ii, jj, kk);
          if (ib < 0) continue;
          const dx = this.rest[ib * 3] - this.rest[ia * 3];
          const dy = this.rest[ib * 3 + 1] - this.rest[ia * 3 + 1];
          const dz = this.rest[ib * 3 + 2] - this.rest[ia * 3 + 2];
          cA.push(ia); cB.push(ib);
          cRest.push(Math.hypot(dx, dy, dz));
          cK.push(t);
          cType.push(t);
        }
      }
      this.cA = new Int32Array(cA);
      this.cB = new Int32Array(cB);
      this.cRest = new Float32Array(cRest);
      this.cType = new Uint8Array(cType);
      this.cBroken = new Uint8Array(cA.length);
      this.C = cA.length;
      this.comp = new Int32Array(N);
      this.recomputeComponents();

      // 表面重建网格
      const cell = Math.max(0.006, h * 0.42);
      this.cell = cell;
      const pad = h * 1.6;
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (let i = 0; i < N; i++) {
        const x = this.rest[i * 3], y = this.rest[i * 3 + 1], z = this.rest[i * 3 + 2];
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
        if (z < mnz) mnz = z; if (z > mxz) mxz = z;
      }
      this.gmin = [mnx - pad, mny - pad, mnz - pad];
      this.gmax = [mxx + pad, mxy + pad, mxz + pad];
      this.GX = Math.max(4, Math.ceil((this.gmax[0] - this.gmin[0]) / cell) + 1);
      this.GY = Math.max(4, Math.ceil((this.gmax[1] - this.gmin[1]) / cell) + 1);
      this.GZ = Math.max(4, Math.ceil((this.gmax[2] - this.gmin[2]) / cell) + 1);
      this.field = new Float32Array(this.GX * this.GY * this.GZ);
      this.vIdx = new Int32Array((this.GX - 1) * (this.GY - 1) * (this.GZ - 1));
      this.meshMaxVerts = this.vIdx.length;
      this.meshMaxIndices = this.vIdx.length * 12;
    }

    recomputeComponents() {
      const N = this.N, comp = this.comp;
      for (let i = 0; i < N; i++) comp[i] = i;
      const find = (x) => { while (comp[x] !== x) { comp[x] = comp[comp[x]]; x = comp[x]; } return x; };
      for (let c = 0; c < this.C; c++) {
        if (this.cBroken[c] || this.cType[c] !== STRUCT) continue;
        const a = find(this.cA[c]), b = find(this.cB[c]);
        if (a !== b) comp[a] = b;
      }
      // 路径压缩
      for (let i = 0; i < N; i++) find(i);
      // 移除跨组件约束
      let removed = 0;
      for (let c = 0; c < this.C; c++) {
        if (this.cBroken[c]) continue;
        if (find(this.cA[c]) !== find(this.cB[c])) { this.cBroken[c] = 1; removed++; }
      }
      // 统计组件数
      const roots = new Set();
      for (let i = 0; i < N; i++) roots.add(find(i));
      this.chunkCount = roots.size;
      return removed;
    }

    setSoftness(v) {
      this.softness = v;
      // 软：刚度低；硬：刚度高
      const base = 0.10 + 0.55 * v;
      this._ks = base;
      this._ksh = base * 0.85;
      this._kb = base * 0.55;
    }
    setStrength(v) { this.strength = v; }

    step(dt, ctx) {
      const N = this.N, pos = this.pos, prev = this.prev, vel = this.vel, rest = this.rest;
      const g = -9.8;
      const damp = Math.max(0, 1 - 0.55 * dt);
      const dt2 = dt * dt;
      // 积分
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        vel[i3 + 1] += g * dt;
        vel[i3] *= damp; vel[i3 + 1] *= damp; vel[i3 + 2] *= damp;
        prev[i3] = pos[i3]; prev[i3 + 1] = pos[i3 + 1]; prev[i3 + 2] = pos[i3 + 2];
        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;
      }

      // 断裂判定（基于预测位置的拉伸）
      const breakStrain = 0.30 + (1.0 - this.strength) * 0.85;
      let broke = 0;
      for (let c = 0; c < this.C; c++) {
        if (this.cBroken[c] || this.cType[c] !== STRUCT) continue;
        const a = this.cA[c] * 3, b = this.cB[c] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.hypot(dx, dy, dz);
        const r = this.cRest[c];
        if (d > r * (1 + breakStrain)) { this.cBroken[c] = 1; broke++; }
      }
      if (broke > 0) {
        this.broken = true;
        this.recomputeComponents();
        if (ctx && ctx.onEvent) ctx.onEvent('crack', this, broke);
      }

      const tableY = ctx && ctx.tableY !== undefined ? ctx.tableY : 0;
      const nr = this.nodeR;
      const fric = this.friction;
      const bnd = ctx && ctx.bounds ? ctx.bounds : null;
      const balls = ctx && ctx.balls ? ctx.balls.list : null;
      const K = 260, Kd = 26;
      const contact = this._contact || (this._contact = new Float32Array(N));
      contact.fill(0);

      // 约束求解（含碰撞位置投影）
      const ks = this._ks || 0.3, ksh = this._ksh || 0.25, kb = this._kb || 0.15;
      const iters = 14;
      const cA = this.cA, cB = this.cB, cRest = this.cRest, cType = this.cType, cBroken = this.cBroken;
      for (let it = 0; it < iters; it++) {
        for (let c = 0; c < this.C; c++) {
          if (cBroken[c]) continue;
          const ia = cA[c] * 3, ib = cB[c] * 3;
          const dx = pos[ib] - pos[ia], dy = pos[ib + 1] - pos[ia + 1], dz = pos[ib + 2] - pos[ia + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d < 1e-9) continue;
          const t = cType[c];
          const k = t === STRUCT ? ks : (t === SHEAR ? ksh : kb);
          const diff = (d - cRest[c]) / d * k * 0.5;
          const ox = dx * diff, oy = dy * diff, oz = dz * diff;
          pos[ia] += ox; pos[ia + 1] += oy; pos[ia + 2] += oz;
          pos[ib] -= ox; pos[ib + 1] -= oy; pos[ib + 2] -= oz;
        }
        // 台面 / 边界
        const floor = tableY + nr;
        for (let i = 0; i < N; i++) {
          const i3 = i * 3;
          if (pos[i3 + 1] < floor) { pos[i3 + 1] = floor; if (prev[i3 + 1] < floor) prev[i3 + 1] = floor; }
          if (bnd) {
            const m = nr;
            if (pos[i3] < bnd.minx + m) { pos[i3] = bnd.minx + m; }
            if (pos[i3] > bnd.maxx - m) { pos[i3] = bnd.maxx - m; }
            if (pos[i3 + 2] < bnd.minz + m) { pos[i3 + 2] = bnd.minz + m; }
            if (pos[i3 + 2] > bnd.maxz - m) { pos[i3 + 2] = bnd.maxz - m; }
            if (pos[i3 + 1] > bnd.maxy - m) { pos[i3 + 1] = bnd.maxy - m; }
          }
        }
        // 球（仅位置投影，不注入速度；速度传递由冲量部分完成）
        if (balls) {
          for (const b of balls) {
            const rr = b.r + nr;
            const r2 = rr * rr;
            for (let i = 0; i < N; i++) {
              const i3 = i * 3;
              const dx = pos[i3] - b.p[0], dy = pos[i3 + 1] - b.p[1], dz = pos[i3 + 2] - b.p[2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= r2 || d2 < 1e-12) continue;
              const d = Math.sqrt(d2);
              const pen = rr - d;
              const s = pen * 0.45 / d;
              const px = dx * s, py = dy * s, pz = dz * s;
              pos[i3] += px; pos[i3 + 1] += py; pos[i3 + 2] += pz;
              prev[i3] += px; prev[i3 + 1] += py; prev[i3 + 2] += pz;
              contact[i] = 1;
            }
          }
        }
      }

      // 果冻间碰撞
      if (ctx && ctx.others) {
        for (const o of ctx.others) {
          if (o === this) continue;
          this.collideWithJelly(o, nr);
        }
      }

      // 速度更新
      const invDt = 1 / dt;
      const fricK = Math.max(0, 1 - fric * 0.35);
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        let vx = (pos[i3] - prev[i3]) * invDt;
        let vy = (pos[i3 + 1] - prev[i3 + 1]) * invDt;
        let vz = (pos[i3 + 2] - prev[i3 + 2]) * invDt;
        if (pos[i3 + 1] <= tableY + nr + 1e-6) {
          vy = Math.max(vy, 0) * 0.25;
          vx *= fricK; vz *= fricK;
        }
        // 限速
        const sp = Math.hypot(vx, vy, vz);
        if (sp > 25) { const kk = 25 / sp; vx *= kk; vy *= kk; vz *= kk; }
        vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      }

      // 球受到的反作用
      if (balls) {
        for (const b of balls) {
          const rr = b.r + nr;
          const r2 = rr * rr;
          let px = 0, py = 0, pz = 0, cnt = 0;
          for (let i = 0; i < N; i++) {
            if (!contact[i]) continue;
            const i3 = i * 3;
            const dx = pos[i3] - b.p[0], dy = pos[i3 + 1] - b.p[1], dz = pos[i3 + 2] - b.p[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const pen = rr - d;
            px += dx / d * pen; py += dy / d * pen; pz += dz / d * pen;
            cnt++;
            if (ctx.onEvent && pen > 0.003 && Math.abs(b.v[1]) > 1.0) ctx.onEvent('thud', this, b, pen);
          }
          if (cnt > 0) {
            const inv = 1 / cnt;
            const e = 0.30;
            let jx = 0, jy = 0, jz = 0;
            for (let i = 0; i < N; i++) {
              if (!contact[i]) continue;
              const i3 = i * 3;
              const dx = pos[i3] - b.p[0], dy = pos[i3 + 1] - b.p[1], dz = pos[i3 + 2] - b.p[2];
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= r2 || d2 < 1e-12) continue;
              const d = Math.sqrt(d2);
              const nx = dx / d, ny = dy / d, nz = dz / d;
              const vn = b.v[0] * nx + b.v[1] * ny + b.v[2] * nz;
              if (vn > 0) {
                const j = vn * (1 + e) * inv;
                jx -= nx * j; jy -= ny * j; jz -= nz * j;
              }
            }
            b.v[0] += jx; b.v[1] += jy; b.v[2] += jz;
            const drag = Math.min(0.5, cnt * 0.010);
            b.v[0] *= (1 - drag); b.v[1] *= (1 - drag); b.v[2] *= (1 - drag);
          }
        }
      }
    }

    collideWithJelly(o, nr) {
      const A = this.pos, B = o.pos;
      const minD = nr + o.nodeR;
      const minD2 = minD * minD;
      // 简单网格哈希
      const cell = minD;
      const hash = new Map();
      for (let i = 0; i < o.N; i++) {
        const x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2];
        const key = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
        let arr = hash.get(key);
        if (!arr) { arr = []; hash.set(key, arr); }
        arr.push(i);
      }
      for (let i = 0; i < this.N; i++) {
        const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2];
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const arr = hash.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
          if (!arr) continue;
          for (const j of arr) {
            const ddx = B[j * 3] - x, ddy = B[j * 3 + 1] - y, ddz = B[j * 3 + 2] - z;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 >= minD2 || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
            const pen = (minD - d) * 0.5;
            const nx = ddx / d, ny = ddy / d, nz = ddz / d;
            A[i * 3] -= nx * pen; A[i * 3 + 1] -= ny * pen; A[i * 3 + 2] -= nz * pen;
            B[j * 3] += nx * pen; B[j * 3 + 1] += ny * pen; B[j * 3 + 2] += nz * pen;
          }
        }
      }
    }

    // ---------------- 表面重建 ----------------
    buildSurface() {
      const N = this.N, pos = this.pos, rest = this.rest;
      const h = this.h;
      const r = h * 1.55;
      const r2 = r * r;
      // 动态包围盒（吸附到网格）
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (let i = 0; i < N; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
        if (z < mnz) mnz = z; if (z > mxz) mxz = z;
      }
      const margin = h * 1.9;
      const cell = this.cell;
      mnx -= margin; mny -= margin; mnz -= margin; mxx += margin; mxy += margin; mxz += margin;
      // 对齐到网格
      const gx0 = Math.floor(mnx / cell) * cell;
      const gy0 = Math.floor(mny / cell) * cell;
      const gz0 = Math.floor(mnz / cell) * cell;
      const GX = Math.max(4, Math.ceil((mxx - gx0) / cell) + 1);
      const GY = Math.max(4, Math.ceil((mxy - gy0) / cell) + 1);
      const GZ = Math.max(4, Math.ceil((mxz - gz0) / cell) + 1);
      const field = this.fieldTmp || (this.fieldTmp = new Float32Array(Math.max(1, GX * GY * GZ)));
      const need = GX * GY * GZ;
      if (field.length < need) { this.fieldTmp = new Float32Array(need); }
      const F = this.fieldTmp;
      F.fill(0, 0, need);

      // 样条核
      for (let i = 0; i < N; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const x0 = Math.max(0, Math.floor((x - r - gx0) / cell));
        const x1 = Math.min(GX - 1, Math.floor((x + r - gx0) / cell));
        const y0 = Math.max(0, Math.floor((y - r - gy0) / cell));
        const y1 = Math.min(GY - 1, Math.floor((y + r - gy0) / cell));
        const z0 = Math.max(0, Math.floor((z - r - gz0) / cell));
        const z1 = Math.min(GZ - 1, Math.floor((z + r - gz0) / cell));
        for (let k = z0; k <= z1; k++) {
          const pz = gz0 + k * cell;
          for (let j = y0; j <= y1; j++) {
            const py = gy0 + j * cell;
            const rowBase = j * GX + k * GX * GY;
            for (let ii = x0; ii <= x1; ii++) {
              const px = gx0 + ii * cell;
              const ddx = px - x, ddy = py - y, ddz = pz - z;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 >= r2) continue;
              const t = 1 - d2 / r2;
              F[ii + rowBase] += t * t * t;
            }
          }
        }
      }

      const T = 1.15;
      this._gx0 = gx0; this._gy0 = gy0; this._gz0 = gz0;
      const CX = GX - 1, CY = GY - 1, CZ = GZ - 1;
      const vIdx = this.vIdxTmp || (this.vIdxTmp = new Int32Array(Math.max(1, CX * CY * CZ)));
      if (vIdx.length < CX * CY * CZ) this.vIdxTmp = new Int32Array(CX * CY * CZ);
      const VI = this.vIdxTmp;
      VI.fill(-1, 0, CX * CY * CZ);
      const vpos = this.vposTmp || (this.vposTmp = new Float32Array(CX * CY * CZ * 3));
      if (vpos.length < CX * CY * CZ * 3) this.vposTmp = new Float32Array(CX * CY * CZ * 3);
      const VP = this.vposTmp;

      const corner = (x, y, z) => F[x + y * GX + z * GX * GY] > T;
      const cornerVal = (x, y, z) => F[x + y * GX + z * GX * GY];

      let nv = 0;
      for (let k = 0; k < CZ; k++) for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++) {
        const c000 = corner(i, j, k), c100 = corner(i + 1, j, k), c010 = corner(i, j + 1, k), c110 = corner(i + 1, j + 1, k);
        const c001 = corner(i, j, k + 1), c101 = corner(i + 1, j, k + 1), c011 = corner(i, j + 1, k + 1), c111 = corner(i + 1, j + 1, k + 1);
        const mask = (c000 ? 1 : 0) | (c100 ? 2 : 0) | (c010 ? 4 : 0) | (c110 ? 8 : 0) | (c001 ? 16 : 0) | (c101 ? 32 : 0) | (c011 ? 64 : 0) | (c111 ? 128 : 0);
        if (mask === 0 || mask === 255) continue;
        // 平均边交叉点
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        const edges = [
          [0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1],
          [1, 0, 0, 1, 1, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1],
          [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1],
          [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1],
        ];
        for (const e of edges) {
          const ax = i + e[0], ay = j + e[1], az = k + e[2];
          const bx = i + e[3], by = j + e[4], bz = k + e[5];
          const va = cornerVal(ax, ay, az), vb = cornerVal(bx, by, bz);
          const ca = va > T, cb = vb > T;
          if (ca === cb) continue;
          const t = (T - va) / (vb - va);
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          cnt++;
        }
        if (cnt === 0) continue;
        const inv = 1 / cnt;
        const vi = i + j * CX + k * CX * CY;
        VI[vi] = nv;
        VP[nv * 3] = gx0 + sx * inv * cell;
        VP[nv * 3 + 1] = gy0 + sy * inv * cell;
        VP[nv * 3 + 2] = gz0 + sz * inv * cell;
        nv++;
      }
      if (nv === 0) { this.surfVerts = null; return; }

      // 索引
      const idxArr = this.idxTmp || (this.idxTmp = new Uint32Array(CX * CY * CZ * 12));
      if (idxArr.length < CX * CY * CZ * 12) this.idxTmp = new Uint32Array(CX * CY * CZ * 12);
      const IA = this.idxTmp;
      let ni = 0;
      const cellId = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x >= CX || y >= CY || z >= CZ) return -1;
        return VI[x + y * CX + z * CX * CY];
      };
      const quad = (a, b, c, d) => {
        if (a < 0 || b < 0 || c < 0 || d < 0) return;
        IA[ni++] = a; IA[ni++] = b; IA[ni++] = c;
        IA[ni++] = a; IA[ni++] = c; IA[ni++] = d;
      };
      for (let k = 0; k < GZ; k++) for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
        const inside = corner(i, j, k);
        if (i < GX - 1 && corner(i + 1, j, k) !== inside) {
          quad(cellId(i, j - 1, k - 1), cellId(i, j, k - 1), cellId(i, j, k), cellId(i, j - 1, k));
        }
        if (j < GY - 1 && corner(i, j + 1, k) !== inside) {
          quad(cellId(i - 1, j, k - 1), cellId(i - 1, j, k), cellId(i, j, k), cellId(i, j, k - 1));
        }
        if (k < GZ - 1 && corner(i, j, k + 1) !== inside) {
          quad(cellId(i - 1, j - 1, k), cellId(i, j - 1, k), cellId(i, j, k), cellId(i - 1, j, k));
        }
      }
      // 统一朝向：几何法线应与外法线（-场梯度）一致
      for (let t = 0; t < ni; t += 3) {
        const a = IA[t] * 3, b = IA[t + 1] * 3, c = IA[t + 2] * 3;
        const ax = VP[a], ay = VP[a + 1], az = VP[a + 2];
        const e1x = VP[b] - ax, e1y = VP[b + 1] - ay, e1z = VP[b + 2] - az;
        const e2x = VP[c] - ax, e2y = VP[c + 1] - ay, e2z = VP[c + 2] - az;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const cx = (ax + VP[b] + VP[c]) / 3, cy = (ay + VP[b + 1] + VP[c + 1]) / 3, cz = (az + VP[b + 2] + VP[c + 2]) / 3;
        const gx = this.sampleField(cx + cell, cy, cz) - this.sampleField(cx - cell, cy, cz);
        const gy = this.sampleField(cx, cy + cell, cz) - this.sampleField(cx, cy - cell, cz);
        const gz = this.sampleField(cx, cy, cz + cell) - this.sampleField(cx, cy, cz - cell);
        if (nx * -gx + ny * -gy + nz * -gz < 0) {
          const tmp = IA[t + 1]; IA[t + 1] = IA[t + 2]; IA[t + 2] = tmp;
        }
      }
      this.surfVerts = nv;
      this.surfIndices = ni;
      this.surfVP = VP;
      this.surfIA = IA;
      this.GX = GX; this.GY = GY; this.GZ = GZ;
    }

    // 生成渲染用的交错顶点缓冲（含法线）
    packSurface() {
      const nv = this.surfVerts;
      if (!nv) return null;
      const VP = this.surfVP, F = this.fieldTmp;
      const GX = this.GX, GY = this.GY, GZ = this.GZ;
      const cell = this.cell;
      const out = this.packTmp || (this.packTmp = new Float32Array(this.meshMaxVerts * 12));
      if (out.length < nv * 12) this.packTmp = new Float32Array(nv * 12);
      const O = this.packTmp;
      const T = 1.15;
      for (let v = 0; v < nv; v++) {
        const x = VP[v * 3], y = VP[v * 3 + 1], z = VP[v * 3 + 2];
        // 由场梯度求法线（场向内增大，外法线 = -grad）
        const gx = this.sampleField(x + cell, y, z) - this.sampleField(x - cell, y, z);
        const gy = this.sampleField(x, y + cell, z) - this.sampleField(x, y - cell, z);
        const gz = this.sampleField(x, y, z + cell) - this.sampleField(x, y, z - cell);
        let nx = -gx, ny = -gy, nz = -gz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        const o = v * 12;
        O[o] = x; O[o + 1] = y; O[o + 2] = z;
        O[o + 3] = nx; O[o + 4] = ny; O[o + 5] = nz;
        O[o + 6] = 0; O[o + 7] = 0;
        O[o + 8] = 1; O[o + 9] = 1; O[o + 10] = 1; O[o + 11] = 1;
      }
      return { verts: O, indices: this.surfIA, nVerts: nv, nIdx: this.surfIndices };
    }

    sampleField(x, y, z) {
      const F = this.fieldTmp, GX = this.GX, GY = this.GY, GZ = this.GZ;
      const cell = this.cell;
      // 需要网格原点：用最近一次 buildSurface 的 gx0 等
      const gx0 = this._gx0, gy0 = this._gy0, gz0 = this._gz0;
      const fx = (x - gx0) / cell, fy = (y - gy0) / cell, fz = (z - gz0) / cell;
      let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
      if (i < 0) i = 0; if (j < 0) j = 0; if (k < 0) k = 0;
      if (i >= GX - 1) i = GX - 2; if (j >= GY - 1) j = GY - 2; if (k >= GZ - 1) k = GZ - 2;
      const tx = fx - i, ty = fy - j, tz = fz - k;
      const at = (a, b, c) => F[a + b * GX + c * GX * GY];
      const c00 = at(i, j, k) + (at(i + 1, j, k) - at(i, j, k)) * tx;
      const c10 = at(i, j + 1, k) + (at(i + 1, j + 1, k) - at(i, j + 1, k)) * tx;
      const c01 = at(i, j, k + 1) + (at(i + 1, j, k + 1) - at(i, j, k + 1)) * tx;
      const c11 = at(i, j + 1, k + 1) + (at(i + 1, j + 1, k + 1) - at(i, j + 1, k + 1)) * tx;
      return (c00 + (c10 - c00) * ty) + ((c01 + (c11 - c01) * ty) - (c00 + (c10 - c00) * ty)) * tz;
    }
  }

  App.Jelly = Jelly;
})();
