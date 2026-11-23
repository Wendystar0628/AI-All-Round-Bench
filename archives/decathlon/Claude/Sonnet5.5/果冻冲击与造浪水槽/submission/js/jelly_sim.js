/* ===== jelly_sim.js : 果冻体积软体（四面体 + XPBD 有限元）与断裂、刚性重球 ===== */
'use strict';

/* ---------- 形状的有向距离函数（底面在 y=0） ---------- */
const JSHAPES = {
  box(p, s) { // s: [hx, hy, hz, r]
    const x = Math.abs(p[0]) - (s[0] - s[3]), y = Math.abs(p[1] - s[1]) - (s[1] - s[3]), z = Math.abs(p[2]) - (s[2] - s[3]);
    const ox = Math.max(x, 0), oy = Math.max(y, 0), oz = Math.max(z, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(x, y, z), 0) - s[3];
  },
  cyl(p, s) { // s: [R, hy, r]
    const dx = Math.hypot(p[0], p[2]) - (s[0] - s[2]), dy = Math.abs(p[1] - s[1]) - (s[1] - s[2]);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - s[2];
  },
  pudding(p, s) { // s: [Rb, Rt, hy, r] 圆台布丁
    const Rb = s[0], Rt = s[1], hy = s[2], r = s[3];
    const t = clamp(p[1] / (2 * hy), 0, 1), R = Rb + (Rt - Rb) * t;
    const slope = (Rt - Rb) / (2 * hy), c = 1 / Math.sqrt(1 + slope * slope);
    const dx = (Math.hypot(p[0], p[2]) - (R - r)) * c, dy = Math.abs(p[1] - hy) - (hy - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  },
  bean(p, s) { // 两个相接的圆柱（花生/哑铃形），s: [R, hy, sep, r]
    const a = JSHAPES.cyl([p[0] - s[2], p[1], p[2]], [s[0], s[1], s[3]]);
    const b = JSHAPES.cyl([p[0] + s[2], p[1], p[2]], [s[0], s[1], s[3]]);
    const k = 0.04, h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
    return lerp(b, a, h) - k * h * (1 - h);
  },
};
function shapeBounds(kind, s) {
  if (kind === 'box') return [[-s[0], 0, -s[2]], [s[0], 2 * s[1], s[2]]];
  if (kind === 'cyl') return [[-s[0], 0, -s[0]], [s[0], 2 * s[1], s[0]]];
  if (kind === 'pudding') { const R = Math.max(s[0], s[1]); return [[-R, 0, -R], [R, 2 * s[2], R]]; }
  if (kind === 'bean') return [[-s[2] - s[0], 0, -s[0]], [s[2] + s[0], 2 * s[1], s[0]]];
}

const KUHN = (() => { // 6 个 Kuhn 四面体（沿主对角线 0→7）
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], out = [];
  for (const [a, b, c] of perms) out.push([0, 1 << a, (1 << a) | (1 << b), 7]);
  return out;
})();
const TFACE = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]; // 面 f 对着顶点 f，法向朝外

/* ---------- 刚性重球（场景一，CPU） ---------- */
class RigidBall {
  constructor(o) {
    this.pos = o.pos.slice(); this.vel = (o.vel || [0, 0, 0]).slice(); this.w = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.mass = o.mass; this.r = o.r; this.invM = 1 / o.mass;
    this.kind = o.kind || 0; this.col = o.col || [0.8, 0.8, 0.8];
    this.e = o.e !== undefined ? o.e : 0.35;
    this.hold = !!o.hold; this.releaseAt = o.releaseAt || 0; this.active = true;
    this.cp = this.pos.slice(); this.vyPred = 0; this.jellyContact = 0; this.id = o.id || 0;
    this.inertia = 0.4 * o.mass * o.r * o.r;
    this.lastImpact = 0;
  }
}

class JellySim {
  constructor(cap = 14000, capT = 90000) {
    this.cap = cap; this.capT = capT;
    this.n = 0; this.m = 0;
    this.X = new Float64Array(3 * cap); this.Xp = new Float64Array(3 * cap); this.Vl = new Float64Array(3 * cap);
    this.W = new Float64Array(cap); this.Vbody = new Int32Array(cap); this.Vcomp = new Int32Array(cap);
    this.Vmass = new Float64Array(cap);
    this.Tv = new Int32Array(4 * capT); this.Hm = new Float64Array(9 * capT); this.Vol0 = new Float64Array(capT);
    this.Tbody = new Int32Array(capT); this.Nb = new Int32Array(4 * capT).fill(-1); this.Crk = new Uint8Array(4 * capT);
    this.aD = new Float64Array(capT); this.aH = new Float64Array(capT); // 1/(μV0), 1/(λV0)
    this.Rq = new Float64Array(4 * capT); for (let i = 0; i < capT; i++) this.Rq[i * 4 + 3] = 1;
    this.Vinc = [];            // 顶点 -> 四面体
    this.bodies = [];
    this.balls = [];
    this.bfaces = [];          // 边界面 [t, f]
    this.isBnd = new Uint8Array(cap);
    this.time = 0;
    this.gravity = 9.81;
    this.table = { y: 0, mu: 0.3, x0: -1.1, x1: 1.1, z0: -0.65, z1: 0.65 };
    this.events = [];          // 声音/特效事件
    this.stats = { cuts: 0, maxStretch: 0 };
    this.scratchG = new Float64Array(3 * cap);
    this.splitCnt = new Uint8Array(cap);
    this.compVol0 = []; this.compCount = 0;
    this.checkCounter = 0;
    this.lastCrackTime = -10;
    this.fracOn = true;
    this.pieceCount = 0;
  }

  /* 用 SDF 生成四面体网格并加入系统 */
  addBody(spec) {
    const h = spec.h, off = spec.offset || [0, 0, 0];
    const sdf = JSHAPES[spec.kind], s = spec.size;
    const [bmin, bmax] = shapeBounds(spec.kind, s);
    const nx = Math.ceil((bmax[0] - bmin[0]) / h), ny = Math.ceil((bmax[1] - bmin[1]) / h), nz = Math.ceil((bmax[2] - bmin[2]) / h);
    const ox = (bmin[0] + bmax[0]) / 2 - nx * h / 2, oz = (bmin[2] + bmax[2]) / 2 - nz * h / 2, oy = 0;
    const vid = new Int32Array((nx + 1) * (ny + 1) * (nz + 1)).fill(-1);
    const gi = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
    const base = this.n, tbase = this.m;
    const bi = this.bodies.length;
    const tets = [];
    const incl = spec.cellThresh !== undefined ? spec.cellThresh : -0.1 * h;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [ox + (i + 0.5) * h, oy + (j + 0.5) * h, oz + (k + 0.5) * h];
      if (sdf(c, s) > incl) continue;
      for (const kt of KUHN) {
        const t = [];
        for (const cc of kt) {
          const ii = i + (cc & 1), jj = j + ((cc >> 1) & 1), kk = k + ((cc >> 2) & 1);
          const g = gi(ii, jj, kk);
          if (vid[g] < 0) { vid[g] = this.n++; const o = vid[g] * 3; this.X[o] = ox + ii * h; this.X[o + 1] = oy + jj * h; this.X[o + 2] = oz + kk * h; this.Vbody[vid[g]] = bi; }
          t.push(vid[g]);
        }
        tets.push(t);
      }
    }
    // 边界顶点吸附到形状表面（让圆形、圆角更光滑）
    const nface = new Map();
    const fkey = (a, b, c) => { let t; if (a > b) { t = a; a = b; b = t; } if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } return (a * 131072 + b) * 131072 + c; };
    for (const t of tets) for (let f = 0; f < 4; f++) {
      const k = fkey(t[TFACE[f][0]], t[TFACE[f][1]], t[TFACE[f][2]]);
      nface.set(k, (nface.get(k) || 0) + 1);
    }
    const bnd = new Set();
    for (const t of tets) for (let f = 0; f < 4; f++) {
      const k = fkey(t[TFACE[f][0]], t[TFACE[f][1]], t[TFACE[f][2]]);
      if (nface.get(k) === 1) for (const q of TFACE[f]) bnd.add(t[q]);
    }
    const e = 1e-3;
    const inc = new Map();
    tets.forEach((t, ti) => { for (const v of t) { let a = inc.get(v); if (!a) inc.set(v, a = []); a.push(ti); } });
    const tetVol = t => {
      const X = this.X, [a, b, c, d] = t;
      const e1x = X[b * 3] - X[a * 3], e1y = X[b * 3 + 1] - X[a * 3 + 1], e1z = X[b * 3 + 2] - X[a * 3 + 2];
      const e2x = X[c * 3] - X[a * 3], e2y = X[c * 3 + 1] - X[a * 3 + 1], e2z = X[c * 3 + 2] - X[a * 3 + 2];
      const e3x = X[d * 3] - X[a * 3], e3y = X[d * 3 + 1] - X[a * 3 + 1], e3z = X[d * 3 + 2] - X[a * 3 + 2];
      return (e1x * (e2y * e3z - e2z * e3y) - e1y * (e2x * e3z - e2z * e3x) + e1z * (e2x * e3y - e2y * e3x)) / 6;
    };
    // 先记下每个四面体的符号，吸附后保持质量（体积不低于 minQ·h³/6）
    const sign = tets.map(t => Math.sign(tetVol(t)) || 1);
    const minQ = 0.28 * h * h * h / 6;
    const okAround = v => { for (const ti of inc.get(v)) if (tetVol(tets[ti]) * sign[ti] < minQ) return false; return true; };
    for (let it = 0; it < 2; it++) for (const v of bnd) {
      const o = v * 3, p = [this.X[o], this.X[o + 1], this.X[o + 2]];
      const d = sdf(p, s);
      const gx = sdf([p[0] + e, p[1], p[2]], s) - sdf([p[0] - e, p[1], p[2]], s);
      const gy = sdf([p[0], p[1] + e, p[2]], s) - sdf([p[0], p[1] - e, p[2]], s);
      const gz = sdf([p[0], p[1], p[2] + e], s) - sdf([p[0], p[1], p[2] - e], s);
      const gl = Math.hypot(gx, gy, gz) || 1;
      let mv = clamp(-d, -0.5 * h, 0.5 * h);
      for (let tr = 0; tr < 4; tr++) {
        this.X[o] = p[0] + gx / gl * mv; this.X[o + 1] = p[1] + gy / gl * mv; this.X[o + 2] = p[2] + gz / gl * mv;
        if (okAround(v)) break;
        mv *= 0.5;
        if (tr === 3) { this.X[o] = p[0]; this.X[o + 1] = p[1]; this.X[o + 2] = p[2]; }
      }
    }
    // 平移到位并让底面恰好落在台面
    let ymin = 1e9;
    for (let v = base; v < this.n; v++) ymin = Math.min(ymin, this.X[v * 3 + 1]);
    for (let v = base; v < this.n; v++) {
      this.X[v * 3] += off[0]; this.X[v * 3 + 1] += off[1] - ymin + (this.table.y); this.X[v * 3 + 2] += off[2];
    }
    // 旋转（绕 y）
    if (spec.yaw) {
      const c = Math.cos(spec.yaw), sn = Math.sin(spec.yaw);
      for (let v = base; v < this.n; v++) {
        const dx = this.X[v * 3] - off[0], dz = this.X[v * 3 + 2] - off[2];
        this.X[v * 3] = off[0] + c * dx + sn * dz; this.X[v * 3 + 2] = off[2] - sn * dx + c * dz;
      }
    }
    // 四面体：Dm⁻¹、体积
    let degenerate = 0, minVol = 1e9;
    for (const t of tets) {
      let [a, b, c, d] = t;
      const X = this.X;
      const e1 = [X[b * 3] - X[a * 3], X[b * 3 + 1] - X[a * 3 + 1], X[b * 3 + 2] - X[a * 3 + 2]];
      const e2 = [X[c * 3] - X[a * 3], X[c * 3 + 1] - X[a * 3 + 1], X[c * 3 + 2] - X[a * 3 + 2]];
      const e3 = [X[d * 3] - X[a * 3], X[d * 3 + 1] - X[a * 3 + 1], X[d * 3 + 2] - X[a * 3 + 2]];
      let vol = V3.dot(e1, V3.cross(e2, e3)) / 6;
      if (vol < 0) { const tt = c; c = d; d = tt; vol = -vol; t[2] = c; t[3] = d; }
      if (vol < 1e-3 * h * h * h / 6) { degenerate++; continue; }
      minVol = Math.min(minVol, vol / (h * h * h / 6));
      this.pushTet(a, b, c, d, bi);
    }
    const body = {
      id: bi, v0: base, kind: spec.kind, color: spec.color, name: spec.name || '果冻', h,
      mu: 6000, lam: 120000, kd: 0.015, tough: 2.0, fric: 0.4,
      t0: tbase, t1: this.m, pos0: off.slice(), size: s, shape: spec.kind,
    };
    this.bodies.push(body);
    this.setBodyMaterial(bi, spec.mu || 6000, spec.bulk || 25, spec.tough || 2.0);
    body.minVolRatio = minVol; body.degenerate = degenerate;
    return bi;
  }
  pushTet(a, b, c, d, bi) {
    const t = this.m++, X = this.X, Tv = this.Tv;
    Tv[t * 4] = a; Tv[t * 4 + 1] = b; Tv[t * 4 + 2] = c; Tv[t * 4 + 3] = d; this.Tbody[t] = bi;
    const e1x = X[b * 3] - X[a * 3], e1y = X[b * 3 + 1] - X[a * 3 + 1], e1z = X[b * 3 + 2] - X[a * 3 + 2];
    const e2x = X[c * 3] - X[a * 3], e2y = X[c * 3 + 1] - X[a * 3 + 1], e2z = X[c * 3 + 2] - X[a * 3 + 2];
    const e3x = X[d * 3] - X[a * 3], e3y = X[d * 3 + 1] - X[a * 3 + 1], e3z = X[d * 3 + 2] - X[a * 3 + 2];
    // M = [e1 e2 e3] (列)
    const m00 = e1x, m01 = e2x, m02 = e3x, m10 = e1y, m11 = e2y, m12 = e3y, m20 = e1z, m21 = e2z, m22 = e3z;
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    const id = 1 / det, H = this.Hm, o = t * 9;
    H[o] = (m11 * m22 - m12 * m21) * id; H[o + 1] = (m02 * m21 - m01 * m22) * id; H[o + 2] = (m01 * m12 - m02 * m11) * id;
    H[o + 3] = (m12 * m20 - m10 * m22) * id; H[o + 4] = (m00 * m22 - m02 * m20) * id; H[o + 5] = (m02 * m10 - m00 * m12) * id;
    H[o + 6] = (m10 * m21 - m11 * m20) * id; H[o + 7] = (m01 * m20 - m00 * m21) * id; H[o + 8] = (m00 * m11 - m01 * m10) * id;
    this.Vol0[t] = det / 6;
  }
  setBodyMaterial(bi, mu, bulkRatio, tough) {
    const b = this.bodies[bi];
    b.mu = mu; b.lam = mu * bulkRatio; b.tough = tough;
    for (let t = b.t0; t < b.t1; t++) { /* 分裂后新增的 tet 也在 [t0,t1) 内（同一 body 只增不减） */ }
    this.refreshCompliance();
  }
  refreshCompliance() {
    for (let t = 0; t < this.m; t++) {
      const b = this.bodies[this.Tbody[t]], V = this.Vol0[t];
      this.aD[t] = 1 / (2 * b.mu * V); this.aH[t] = 1 / (b.lam * V);
    }
  }

  /* 邻接、边界面、质量 */
  rebuildTopology() {
    const m = this.m, Tv = this.Tv, Nb = this.Nb, n = this.n;
    Nb.fill(-1, 0, 4 * m);
    const map = new Map();
    const fkey = (a, b, c) => { let t; if (a > b) { t = a; a = b; b = t; } if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } return (a * 131072 + b) * 131072 + c; };
    this.Vinc = new Array(n); for (let i = 0; i < n; i++) this.Vinc[i] = [];
    for (let t = 0; t < m; t++) {
      for (let q = 0; q < 4; q++) this.Vinc[Tv[t * 4 + q]].push(t);
      for (let f = 0; f < 4; f++) {
        const F = TFACE[f], k = fkey(Tv[t * 4 + F[0]], Tv[t * 4 + F[1]], Tv[t * 4 + F[2]]);
        const o = map.get(k);
        if (o === undefined) map.set(k, t * 4 + f);
        else { Nb[t * 4 + f] = o >> 2; Nb[o] = t; map.delete(k); }
      }
    }
    this.updateMass(); this.updateBoundary(); this.updateComponents();
  }
  updateMass() {
    const n = this.n, m = this.m, Vm = this.Vmass, Tv = this.Tv;
    Vm.fill(0, 0, n);
    for (let t = 0; t < m; t++) {
      const mm = 1000 * this.Vol0[t] * 0.25;
      for (let q = 0; q < 4; q++) Vm[Tv[t * 4 + q]] += mm;
    }
    for (let v = 0; v < n; v++) this.W[v] = Vm[v] > 0 ? 1 / Vm[v] : 0;
  }
  updateBoundary() {
    this.bfaces.length = 0; this.isBnd.fill(0, 0, this.n);
    for (let t = 0; t < this.m; t++) for (let f = 0; f < 4; f++) if (this.Nb[t * 4 + f] < 0) {
      this.bfaces.push(t * 4 + f);
      for (const q of TFACE[f]) this.isBnd[this.Tv[t * 4 + q]] = 1;
    }
  }
  updateComponents() {
    const n = this.n, par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < this.m; t++) {
      const a = find(this.Tv[t * 4]);
      for (let q = 1; q < 4; q++) { const b = find(this.Tv[t * 4 + q]); if (a !== b) par[b] = a; }
    }
    const ids = new Map(); let c = 0;
    for (let v = 0; v < n; v++) {
      if (this.Vinc[v].length === 0) { this.Vcomp[v] = -1; continue; }
      const r = find(v); let id = ids.get(r); if (id === undefined) { id = c++; ids.set(r, id); }
      this.Vcomp[v] = id;
    }
    this.compCount = c;
    this.compVol0 = new Float64Array(c);
    for (let t = 0; t < this.m; t++) this.compVol0[this.Vcomp[this.Tv[t * 4]]] += this.Vol0[t];
    this.pieceCount = c;
  }

  /* ---------- 主时间步（XPBD 子步） ---------- */
  substep(dt) {
    const n = this.n, m = this.m, X = this.X, Xp = this.Xp, V = this.Vl, W = this.W;
    const g = this.gravity, ng = -g * dt;
    const damp = Math.exp(-0.25 * dt);
    for (let v = 0; v < n; v++) {
      const o = v * 3;
      Xp[o] = X[o]; Xp[o + 1] = X[o + 1]; Xp[o + 2] = X[o + 2];
      if (W[v] > 0) {
        V[o] *= damp; V[o + 1] = V[o + 1] * damp + ng; V[o + 2] *= damp;
        X[o] += V[o] * dt; X[o + 1] += V[o + 1] * dt; X[o + 2] += V[o + 2] * dt;
      }
    }
    // 重球预测
    for (const b of this.balls) {
      if (!b.active) continue;
      b.cp[0] = b.pos[0]; b.cp[1] = b.pos[1]; b.cp[2] = b.pos[2];
      if (b.hold) { if (this.time >= b.releaseAt) b.hold = false; else continue; }
      b.vel[1] -= g * dt;
      b.vyPred = b.vel[1]; b.vpre = Math.hypot(b.vel[0], b.vel[1], b.vel[2]);
      b.pos[0] += b.vel[0] * dt; b.pos[1] += b.vel[1] * dt; b.pos[2] += b.vel[2] * dt;
      b.jellyContact = 0;
    }
    // 弹性约束
    const iters = this.iters || 2;
    const idt2 = 1 / (dt * dt), gam = 1 / dt;
    for (let it = 0; it < iters; it++) {
      this.solveTets(dt, idt2, gam, (this.iter = (this.iter | 0) + 1) & 1);
      this.solveVolume(dt);
      this.solveContacts(dt, it === iters - 1);
    }
    // 速度
    const idt = 1 / dt;
    for (let v = 0; v < n; v++) {
      if (W[v] === 0) continue;
      const o = v * 3;
      let vx = (X[o] - Xp[o]) * idt, vy = (X[o + 1] - Xp[o + 1]) * idt, vz = (X[o + 2] - Xp[o + 2]) * idt;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 25) { const k = 25 / sp; vx *= k; vy *= k; vz *= k; }
      V[o] = vx; V[o + 1] = vy; V[o + 2] = vz;
    }
    this.finishBalls(dt);
    this.time += dt;
  }

  solveTets(dt, idt2, gam, rev) {
    const m = this.m, X = this.X, Xp = this.Xp, Tv = this.Tv, H = this.Hm, W = this.W;
    const aDt = this.aD, aHt = this.aH, bodies = this.bodies, Tb = this.Tbody, Rq = this.Rq;
    for (let ti = 0; ti < m; ti++) {
      const t = rev ? m - 1 - ti : ti;
      const i0 = Tv[t * 4] * 3, i1 = Tv[t * 4 + 1] * 3, i2 = Tv[t * 4 + 2] * 3, i3 = Tv[t * 4 + 3] * 3;
      const w0 = W[i0 / 3], w1 = W[i1 / 3], w2 = W[i2 / 3], w3 = W[i3 / 3];
      const ho = t * 9;
      const h00 = H[ho], h01 = H[ho + 1], h02 = H[ho + 2], h10 = H[ho + 3], h11 = H[ho + 4], h12 = H[ho + 5], h20 = H[ho + 6], h21 = H[ho + 7], h22 = H[ho + 8];
      let e1x = X[i1] - X[i0], e1y = X[i1 + 1] - X[i0 + 1], e1z = X[i1 + 2] - X[i0 + 2];
      let e2x = X[i2] - X[i0], e2y = X[i2 + 1] - X[i0 + 1], e2z = X[i2 + 2] - X[i0 + 2];
      let e3x = X[i3] - X[i0], e3y = X[i3 + 1] - X[i0 + 1], e3z = X[i3 + 2] - X[i0 + 2];
      // F = Ds * H
      let F00 = e1x * h00 + e2x * h10 + e3x * h20, F01 = e1x * h01 + e2x * h11 + e3x * h21, F02 = e1x * h02 + e2x * h12 + e3x * h22;
      let F10 = e1y * h00 + e2y * h10 + e3y * h20, F11 = e1y * h01 + e2y * h11 + e3y * h21, F12 = e1y * h02 + e2y * h12 + e3y * h22;
      let F20 = e1z * h00 + e2z * h10 + e3z * h20, F21 = e1z * h01 + e2z * h11 + e3z * h21, F22 = e1z * h02 + e2z * h12 + e3z * h22;
      // 旋转部分（缓存四元数，迭代提取）
      const qo = t * 4; let qx = Rq[qo], qy = Rq[qo + 1], qz = Rq[qo + 2], qw = Rq[qo + 3];
      let r00, r01, r02, r10, r11, r12, r20, r21, r22;
      for (let it = 0; ; it++) {
        const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
        r00 = 1 - 2 * (yy + zz); r01 = 2 * (xy - wz); r02 = 2 * (xz + wy);
        r10 = 2 * (xy + wz); r11 = 1 - 2 * (xx + zz); r12 = 2 * (yz - wx);
        r20 = 2 * (xz - wy); r21 = 2 * (yz + wx); r22 = 1 - 2 * (xx + yy);
        if (it === 2) break;
        const ox = (r10 * F20 - r20 * F10) + (r11 * F21 - r21 * F11) + (r12 * F22 - r22 * F12);
        const oy = (r20 * F00 - r00 * F20) + (r21 * F01 - r01 * F21) + (r22 * F02 - r02 * F22);
        const oz = (r00 * F10 - r10 * F00) + (r01 * F11 - r11 * F01) + (r02 * F12 - r12 * F02);
        const den = Math.abs(r00 * F00 + r10 * F10 + r20 * F20 + r01 * F01 + r11 * F11 + r21 * F21 + r02 * F02 + r12 * F12 + r22 * F22) + 1e-9;
        const ax = ox / den, ay = oy / den, az = oz / den, wl = Math.sqrt(ax * ax + ay * ay + az * az);
        if (wl < 1e-9) break;
        const sh = Math.sin(wl * 0.5) / wl, dw = Math.cos(wl * 0.5), dx = ax * sh, dy = ay * sh, dz = az * sh;
        const nx = dw * qx + dx * qw + dy * qz - dz * qy, ny = dw * qy - dx * qz + dy * qw + dz * qx, nz = dw * qz + dx * qy - dy * qx + dz * qw, nw = dw * qw - dx * qx - dy * qy - dz * qz;
        const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
        qx = nx * nl; qy = ny * nl; qz = nz * nl; qw = nw * nl;
      }
      Rq[qo] = qx; Rq[qo + 1] = qy; Rq[qo + 2] = qz; Rq[qo + 3] = qw;
      const E00 = F00 - r00, E01 = F01 - r01, E02 = F02 - r02, E10 = F10 - r10, E11 = F11 - r11, E12 = F12 - r12, E20 = F20 - r20, E21 = F21 - r21, E22 = F22 - r22;
      const rs = Math.sqrt(E00 * E00 + E01 * E01 + E02 * E02 + E10 * E10 + E11 * E11 + E12 * E12 + E20 * E20 + E21 * E21 + E22 * E22);
      const kd = bodies[Tb[t]].kd;
      // ---- 偏量（形状）约束：|F - R| = 0 ----
      if (rs > 1e-9) {
        const C = rs, ir = 1 / rs;
        const g1ax = (E00 * h00 + E01 * h01 + E02 * h02) * ir, g1ay = (E10 * h00 + E11 * h01 + E12 * h02) * ir, g1az = (E20 * h00 + E21 * h01 + E22 * h02) * ir;
        const g2ax = (E00 * h10 + E01 * h11 + E02 * h12) * ir, g2ay = (E10 * h10 + E11 * h11 + E12 * h12) * ir, g2az = (E20 * h10 + E21 * h11 + E22 * h12) * ir;
        const g3x = (E00 * h20 + E01 * h21 + E02 * h22) * ir, g3y = (E10 * h20 + E11 * h21 + E12 * h22) * ir, g3z = (E20 * h20 + E21 * h21 + E22 * h22) * ir;
        const g0x = -(g1ax + g2ax + g3x), g0y = -(g1ay + g2ay + g3y), g0z = -(g1az + g2az + g3z);
        const sumW = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1ax * g1ax + g1ay * g1ay + g1az * g1az) + w2 * (g2ax * g2ax + g2ay * g2ay + g2az * g2az) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
        if (sumW > 1e-12) {
          const at = aDt[t] * idt2;
          const gm = kd * gam;
          const rel = g0x * (X[i0] - Xp[i0]) + g0y * (X[i0 + 1] - Xp[i0 + 1]) + g0z * (X[i0 + 2] - Xp[i0 + 2])
            + g1ax * (X[i1] - Xp[i1]) + g1ay * (X[i1 + 1] - Xp[i1 + 1]) + g1az * (X[i1 + 2] - Xp[i1 + 2])
            + g2ax * (X[i2] - Xp[i2]) + g2ay * (X[i2 + 1] - Xp[i2 + 1]) + g2az * (X[i2 + 2] - Xp[i2 + 2])
            + g3x * (X[i3] - Xp[i3]) + g3y * (X[i3 + 1] - Xp[i3 + 1]) + g3z * (X[i3 + 2] - Xp[i3 + 2]);
          const dl = (-C - gm * rel) / ((1 + gm) * sumW + at);
          X[i0] += w0 * dl * g0x; X[i0 + 1] += w0 * dl * g0y; X[i0 + 2] += w0 * dl * g0z;
          X[i1] += w1 * dl * g1ax; X[i1 + 1] += w1 * dl * g1ay; X[i1 + 2] += w1 * dl * g1az;
          X[i2] += w2 * dl * g2ax; X[i2 + 1] += w2 * dl * g2ay; X[i2 + 2] += w2 * dl * g2az;
          X[i3] += w3 * dl * g3x; X[i3 + 1] += w3 * dl * g3y; X[i3 + 2] += w3 * dl * g3z;
        }
        // 重新计算 F（位置已更新）
        e1x = X[i1] - X[i0]; e1y = X[i1 + 1] - X[i0 + 1]; e1z = X[i1 + 2] - X[i0 + 2];
        e2x = X[i2] - X[i0]; e2y = X[i2 + 1] - X[i0 + 1]; e2z = X[i2 + 2] - X[i0 + 2];
        e3x = X[i3] - X[i0]; e3y = X[i3 + 1] - X[i0 + 1]; e3z = X[i3 + 2] - X[i0 + 2];
        F00 = e1x * h00 + e2x * h10 + e3x * h20; F01 = e1x * h01 + e2x * h11 + e3x * h21; F02 = e1x * h02 + e2x * h12 + e3x * h22;
        F10 = e1y * h00 + e2y * h10 + e3y * h20; F11 = e1y * h01 + e2y * h11 + e3y * h21; F12 = e1y * h02 + e2y * h12 + e3y * h22;
        F20 = e1z * h00 + e2z * h10 + e3z * h20; F21 = e1z * h01 + e2z * h11 + e3z * h21; F22 = e1z * h02 + e2z * h12 + e3z * h22;
      }
      // ---- 体积（静水）约束：det F = 1 ----
      const c0x = F11 * F22 - F12 * F21, c0y = F12 * F20 - F10 * F22, c0z = F10 * F21 - F11 * F20; // cof 第一行
      const detF = F00 * c0x + F01 * c0y + F02 * c0z;
      const C2 = detF - 1.0;
      // cof_ab：cof00=c0x cof01=c0y cof02=c0z；cof1b、cof2b
      const cf00 = F11 * F22 - F12 * F21, cf01 = F12 * F20 - F10 * F22, cf02 = F10 * F21 - F11 * F20;
      const cf10 = F02 * F21 - F01 * F22, cf11 = F00 * F22 - F02 * F20, cf12 = F01 * F20 - F00 * F21;
      const cf20 = F01 * F12 - F02 * F11, cf21 = F02 * F10 - F00 * F12, cf22 = F00 * F11 - F01 * F10;
      // g_k[a] = Σ_b cof_ab * H[k][b]
      const q1x = cf00 * h00 + cf01 * h01 + cf02 * h02, q1y = cf10 * h00 + cf11 * h01 + cf12 * h02, q1z = cf20 * h00 + cf21 * h01 + cf22 * h02;
      const q2x = cf00 * h10 + cf01 * h11 + cf02 * h12, q2y = cf10 * h10 + cf11 * h11 + cf12 * h12, q2z = cf20 * h10 + cf21 * h11 + cf22 * h12;
      const q3x = cf00 * h20 + cf01 * h21 + cf02 * h22, q3y = cf10 * h20 + cf11 * h21 + cf12 * h22, q3z = cf20 * h20 + cf21 * h21 + cf22 * h22;
      const q0x = -(q1x + q2x + q3x), q0y = -(q1y + q2y + q3y), q0z = -(q1z + q2z + q3z);
      const sW = w0 * (q0x * q0x + q0y * q0y + q0z * q0z) + w1 * (q1x * q1x + q1y * q1y + q1z * q1z) + w2 * (q2x * q2x + q2y * q2y + q2z * q2z) + w3 * (q3x * q3x + q3y * q3y + q3z * q3z);
      if (sW > 1e-14) {
        const at = aHt[t] * idt2;
        const dl = -C2 / (sW + at);
        X[i0] += w0 * dl * q0x; X[i0 + 1] += w0 * dl * q0y; X[i0 + 2] += w0 * dl * q0z;
        X[i1] += w1 * dl * q1x; X[i1 + 1] += w1 * dl * q1y; X[i1 + 2] += w1 * dl * q1z;
        X[i2] += w2 * dl * q2x; X[i2 + 1] += w2 * dl * q2y; X[i2 + 2] += w2 * dl * q2z;
        X[i3] += w3 * dl * q3x; X[i3 + 1] += w3 * dl * q3y; X[i3 + 2] += w3 * dl * q3z;
      }
    }
  }

  /* 每块（连通分量）整体体积守恒：边界面围出的体积 = 静止体积 */
  solveVolume(dt) {
    const bf = this.bfaces, X = this.X, Tv = this.Tv, W = this.W, nc = this.compCount, G = this.scratchG;
    if (nc === 0) return;
    const vol = new Float64Array(nc), sw = new Float64Array(nc);
    const n = this.n;
    G.fill(0, 0, 3 * n);
    for (let k = 0; k < bf.length; k++) {
      const t = bf[k] >> 2, f = bf[k] & 3, F = TFACE[f];
      const a = Tv[t * 4 + F[0]], b = Tv[t * 4 + F[1]], c = Tv[t * 4 + F[2]];
      const ax = X[a * 3], ay = X[a * 3 + 1], az = X[a * 3 + 2], bx = X[b * 3], by = X[b * 3 + 1], bz = X[b * 3 + 2], cx = X[c * 3], cy = X[c * 3 + 1], cz = X[c * 3 + 2];
      const bcx = by * cz - bz * cy, bcy = bz * cx - bx * cz, bcz = bx * cy - by * cx;
      vol[this.Vcomp[a]] += (ax * bcx + ay * bcy + az * bcz) / 6;
      G[a * 3] += bcx / 6; G[a * 3 + 1] += bcy / 6; G[a * 3 + 2] += bcz / 6;
      G[b * 3] += (cy * az - cz * ay) / 6; G[b * 3 + 1] += (cz * ax - cx * az) / 6; G[b * 3 + 2] += (cx * ay - cy * ax) / 6;
      G[c * 3] += (ay * bz - az * by) / 6; G[c * 3 + 1] += (az * bx - ax * bz) / 6; G[c * 3 + 2] += (ax * by - ay * bx) / 6;
    }
    for (let v = 0; v < n; v++) {
      if (!this.isBnd[v]) continue; const c = this.Vcomp[v]; if (c < 0) continue;
      sw[c] += W[v] * (G[v * 3] * G[v * 3] + G[v * 3 + 1] * G[v * 3 + 1] + G[v * 3 + 2] * G[v * 3 + 2]);
    }
    const ks = this.volStiff !== undefined ? this.volStiff : 0.35;
    const lamc = new Float64Array(nc);
    for (let c = 0; c < nc; c++) {
      const C = vol[c] - this.compVol0[c];
      lamc[c] = sw[c] > 1e-14 ? -C / sw[c] * ks : 0;
    }
    for (let v = 0; v < n; v++) {
      if (!this.isBnd[v]) continue; const c = this.Vcomp[v]; if (c < 0) continue;
      const l = lamc[c] * W[v];
      X[v * 3] += l * G[v * 3]; X[v * 3 + 1] += l * G[v * 3 + 1]; X[v * 3 + 2] += l * G[v * 3 + 2];
    }
    this.compVolNow = vol;
  }

  /* 碰撞：台面/围栏、重球与果冻、碎块间 */
  solveContacts(dt, last) {
    const n = this.n, X = this.X, Xp = this.Xp, W = this.W, T = this.table;
    const mu = T.mu;
    for (let v = 0; v < n; v++) {
      if (W[v] === 0) continue;
      const o = v * 3;
      if (X[o + 1] < T.y) {
        const pen = T.y - X[o + 1];
        X[o + 1] = T.y;
        // 位置式库仑摩擦
        let dx = X[o] - Xp[o], dz = X[o + 2] - Xp[o + 2];
        const l = Math.hypot(dx, dz);
        if (l > 1e-12) {
          const f = Math.min(l, mu * pen + (l < 1.5e-4 ? l : 0));
          X[o] -= dx / l * f; X[o + 2] -= dz / l * f;
        }
      }
      if (X[o] < T.x0) X[o] = T.x0; else if (X[o] > T.x1) X[o] = T.x1;
      if (X[o + 2] < T.z0) X[o + 2] = T.z0; else if (X[o + 2] > T.z1) X[o + 2] = T.z1;
    }
    // 重球 ↔ 果冻
    const rv = 0.006;
    for (const b of this.balls) {
      if (!b.active || b.hold) continue;
      const R = b.r + rv, R2 = R * R;
      let cx = b.pos[0], cy = b.pos[1], cz = b.pos[2];
      const wb = b.invM;
      for (let v = 0; v < n; v++) {
        const o = v * 3;
        const dx = X[o] - cx, dy = X[o + 1] - cy, dz = X[o + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R2) continue;
        const wv = W[v]; if (wv === 0) continue;
        const d = Math.sqrt(d2) || 1e-9;
        const pen = R - d, nx = dx / d, ny = dy / d, nz = dz / d;
        const ws = wv + wb, sv = wv / ws, sb = wb / ws;
        X[o] += nx * pen * sv; X[o + 1] += ny * pen * sv; X[o + 2] += nz * pen * sv;
        cx -= nx * pen * sb; cy -= ny * pen * sb; cz -= nz * pen * sb;
        b.jellyContact += 1;
        // 切向摩擦（果冻带动小球滚动）：对相对滑动做衰减
        b.jcN = (b.jcN || 0) + pen;
      }
      b.pos[0] = cx; b.pos[1] = cy; b.pos[2] = cz;
    }
    // 重球 ↔ 重球、台面、围栏（位置）
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]; if (!a.active || a.hold) continue;
      if (a.pos[1] < T.y + a.r) a.pos[1] = T.y + a.r;
      if (a.pos[0] < T.x0 + a.r) a.pos[0] = T.x0 + a.r; else if (a.pos[0] > T.x1 - a.r) a.pos[0] = T.x1 - a.r;
      if (a.pos[2] < T.z0 + a.r) a.pos[2] = T.z0 + a.r; else if (a.pos[2] > T.z1 - a.r) a.pos[2] = T.z1 - a.r;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j]; if (!b.active || b.hold) continue;
        const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
        const rr = a.r + b.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-9, pen = rr - d, nx = dx / d, ny = dy / d, nz = dz / d;
        const ws = a.invM + b.invM;
        a.pos[0] -= nx * pen * a.invM / ws; a.pos[1] -= ny * pen * a.invM / ws; a.pos[2] -= nz * pen * a.invM / ws;
        b.pos[0] += nx * pen * b.invM / ws; b.pos[1] += ny * pen * b.invM / ws; b.pos[2] += nz * pen * b.invM / ws;
      }
    }
    // 碎块之间（不同连通分量的边界顶点）
    if (last && this.compCount > 1) this.solvePieces();
  }

  solvePieces() {
    const n = this.n, X = this.X, W = this.W, rc = this.pieceRadius || 0.012;
    const cell = 0.05, inv = 1 / cell, grid = new Map();
    const bi = [];
    for (let v = 0; v < n; v++) if (this.isBnd[v] && W[v] > 0) {
      const o = v * 3, k = (Math.floor(X[o] * inv) * 73856093) ^ (Math.floor(X[o + 1] * inv) * 19349663) ^ (Math.floor(X[o + 2] * inv) * 83492791);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(v); bi.push(v);
    }
    const d0 = 2 * rc;
    for (const v of bi) {
      const o = v * 3, cx = Math.floor(X[o] * inv), cy = Math.floor(X[o + 1] * inv), cz = Math.floor(X[o + 2] * inv);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
        const a = grid.get(((cx + ix) * 73856093) ^ ((cy + iy) * 19349663) ^ ((cz + iz) * 83492791));
        if (!a) continue;
        for (const u of a) {
          if (u <= v || this.Vcomp[u] === this.Vcomp[v]) continue;
          const p = u * 3;
          const dx = X[p] - X[o], dy = X[p + 1] - X[o + 1], dz = X[p + 2] - X[o + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= d0 * d0) continue;
          const d = Math.sqrt(d2) || 1e-9, pen = d0 - d, ws = W[u] + W[v];
          const nx = dx / d, ny = dy / d, nz = dz / d;
          X[o] -= nx * pen * W[v] / ws; X[o + 1] -= ny * pen * W[v] / ws; X[o + 2] -= nz * pen * W[v] / ws;
          X[p] += nx * pen * W[u] / ws; X[p + 1] += ny * pen * W[u] / ws; X[p + 2] += nz * pen * W[u] / ws;
        }
      }
    }
  }

  /* 小球速度更新、碰撞冲量、滚动 */
  finishBalls(dt) {
    const T = this.table, bs = this.balls, g = this.gravity;
    for (const b of bs) {
      if (!b.active) continue;
      if (b.hold) { b.vel[0] = b.vel[1] = b.vel[2] = 0; continue; }
      const idt = 1 / dt;
      let vx = (b.pos[0] - b.cp[0]) * idt, vy = (b.pos[1] - b.cp[1]) * idt, vz = (b.pos[2] - b.cp[2]) * idt;
      // 台面
      if (b.pos[1] <= T.y + b.r + 1e-5) {
        const vin = b.vyPred;
        if (vin < -0.6) vy = -b.e * vin; else vy = Math.max(vy, 0) * 0 + Math.max(0, vy);
        if (vin < -1.5) this.events.push({ type: 'hit', kind: b.kind, speed: -vin, mass: b.mass, what: 'table', t: this.time });
        const N = b.mass * (Math.max(0, -vin) * (1 + b.e) + g * dt);
        // 滚动接触：消除接触点滑移
        const ux = vx + b.r * b.w[2], uz = vz - b.r * b.w[0];
        const ul = Math.hypot(ux, uz);
        if (ul > 1e-9) {
          const k = 3.5 / b.mass;
          let Jm = ul / k; const Jmax = this.table.mu * 0.6 * N;
          const J = Math.min(Jm, Jmax);
          const jx = -ux / ul * J, jz = -uz / ul * J;
          vx += jx / b.mass; vz += jz / b.mass;
          b.w[2] += b.r * jx / b.inertia; b.w[0] += -b.r * jz / b.inertia;
        }
        // 滚动阻力
        const rr = 1 - Math.min(0.9, 0.35 * dt);
        b.w[0] *= rr; b.w[1] *= rr; b.w[2] *= rr;
        vx *= 1 - 0.02 * dt; vz *= 1 - 0.02 * dt;
      }
      // 围栏
      const lim = (axis, lo, hi) => {
        const p = b.pos[axis];
        const vv = axis === 0 ? vx : vz;
        if (p <= lo + b.r + 1e-5 && vv < 0) { const sp = -vv; if (sp > 1) this.events.push({ type: 'hit', kind: b.kind, speed: sp, mass: b.mass, what: 'wall', t: this.time }); return -vv * 0.5; }
        if (p >= hi - b.r - 1e-5 && vv > 0) { const sp = vv; if (sp > 1) this.events.push({ type: 'hit', kind: b.kind, speed: sp, mass: b.mass, what: 'wall', t: this.time }); return -vv * 0.5; }
        return vv;
      };
      vx = lim(0, T.x0, T.x1); vz = lim(2, T.z0, T.z1);
      // 果冻接触：对相对滚动稍作粘滞
      if (b.jellyContact > 0) {
        if (!b.inJelly) { b.inJelly = true; if (b.vpre > 0.6) this.events.push({ type: 'jhit', speed: b.vpre, mass: b.mass, kind: b.kind, t: this.time }); }
        const damp = 1 - Math.min(0.5, 3.0 * dt);
        b.w[0] *= damp; b.w[1] *= damp; b.w[2] *= damp;
        b.lastJelly = this.time;
      } else b.inJelly = false;
      b.vel[0] = vx; b.vel[1] = vy; b.vel[2] = vz;
      b.jcN = 0;
    }
    // 球-球冲量
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j]; if (!a.active || !b.active || a.hold || b.hold) continue;
      const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
      const rr = a.r + b.r + 2e-4, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-9, nx = dx / d, ny = dy / d, nz = dz / d;
      const vn = (b.vel[0] - a.vel[0]) * nx + (b.vel[1] - a.vel[1]) * ny + (b.vel[2] - a.vel[2]) * nz;
      if (vn >= 0) continue;
      const e = 0.55, j2 = -(1 + e) * vn / (a.invM + b.invM);
      a.vel[0] -= j2 * a.invM * nx; a.vel[1] -= j2 * a.invM * ny; a.vel[2] -= j2 * a.invM * nz;
      b.vel[0] += j2 * b.invM * nx; b.vel[1] += j2 * b.invM * ny; b.vel[2] += j2 * b.invM * nz;
      if (-vn > 0.4) this.events.push({ type: 'hit', kind: a.kind, speed: -vn, mass: Math.min(a.mass, b.mass), what: 'ball', t: this.time });
    }
    // 姿态积分
    for (const b of bs) {
      if (!b.active || b.hold) continue;
      const wl = Math.hypot(b.w[0], b.w[1], b.w[2]);
      if (wl > 1e-6) {
        const ang = wl * dt * 0.5, s = Math.sin(ang) / wl;
        const dq = [b.w[0] * s, b.w[1] * s, b.w[2] * s, Math.cos(ang)];
        const q = b.q;
        const nq = [
          dq[3] * q[0] + dq[0] * q[3] + dq[1] * q[2] - dq[2] * q[1],
          dq[3] * q[1] - dq[0] * q[2] + dq[1] * q[3] + dq[2] * q[0],
          dq[3] * q[2] + dq[0] * q[1] - dq[1] * q[0] + dq[2] * q[3],
          dq[3] * q[3] - dq[0] * q[0] - dq[1] * q[1] - dq[2] * q[2]];
        const l = Math.hypot(nq[0], nq[1], nq[2], nq[3]) || 1;
        b.q = [nq[0] / l, nq[1] / l, nq[2] / l, nq[3] / l];
      }
    }
  }

  /* ---------- 断裂：按顶点沿主拉伸面劈开 ---------- */
  checkFracture() {
    if (!this.fracOn) return 0;
    const m = this.m, n = this.n, X = this.X, Tv = this.Tv, H = this.Hm;
    if (!this.score || this.score.length < n + 64) { this.score = new Float64Array(this.cap); this.dirs = new Float64Array(3 * this.cap); }
    const score = this.score, dirs = this.dirs;
    score.fill(0, 0, n);
    let maxS = 0;
    for (let t = 0; t < m; t++) {
      const b = this.bodies[this.Tbody[t]];
      const i0 = Tv[t * 4] * 3, i1 = Tv[t * 4 + 1] * 3, i2 = Tv[t * 4 + 2] * 3, i3 = Tv[t * 4 + 3] * 3;
      const ho = t * 9;
      const h00 = H[ho], h01 = H[ho + 1], h02 = H[ho + 2], h10 = H[ho + 3], h11 = H[ho + 4], h12 = H[ho + 5], h20 = H[ho + 6], h21 = H[ho + 7], h22 = H[ho + 8];
      const e1x = X[i1] - X[i0], e1y = X[i1 + 1] - X[i0 + 1], e1z = X[i1 + 2] - X[i0 + 2];
      const e2x = X[i2] - X[i0], e2y = X[i2 + 1] - X[i0 + 1], e2z = X[i2 + 2] - X[i0 + 2];
      const e3x = X[i3] - X[i0], e3y = X[i3 + 1] - X[i0 + 1], e3z = X[i3 + 2] - X[i0 + 2];
      const F00 = e1x * h00 + e2x * h10 + e3x * h20, F01 = e1x * h01 + e2x * h11 + e3x * h21, F02 = e1x * h02 + e2x * h12 + e3x * h22;
      const F10 = e1y * h00 + e2y * h10 + e3y * h20, F11 = e1y * h01 + e2y * h11 + e3y * h21, F12 = e1y * h02 + e2y * h12 + e3y * h22;
      const F20 = e1z * h00 + e2z * h10 + e3z * h20, F21 = e1z * h01 + e2z * h11 + e3z * h21, F22 = e1z * h02 + e2z * h12 + e3z * h22;
      // C = FᵀF
      const c00 = F00 * F00 + F10 * F10 + F20 * F20, c01 = F00 * F01 + F10 * F11 + F20 * F21, c02 = F00 * F02 + F10 * F12 + F20 * F22;
      const c11 = F01 * F01 + F11 * F11 + F21 * F21, c12 = F01 * F02 + F11 * F12 + F21 * F22, c22 = F02 * F02 + F12 * F12 + F22 * F22;
      // 幂迭代求最大特征值
      let vx = c00 + c01 + c02, vy = c01 + c11 + c12, vz = c02 + c12 + c22;
      let l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      let lam = 0;
      for (let k = 0; k < 6; k++) {
        const wx = c00 * vx + c01 * vy + c02 * vz, wy = c01 * vx + c11 * vy + c12 * vz, wz = c02 * vx + c12 * vy + c22 * vz;
        lam = wx * vx + wy * vy + wz * vz;
        l = Math.hypot(wx, wy, wz) || 1; vx = wx / l; vy = wy / l; vz = wz / l;
      }
      const stretch = Math.sqrt(Math.max(lam, 0));
      if (stretch > maxS) maxS = stretch;
      const sc = Math.max(this.splitCnt[Tv[t * 4]], this.splitCnt[Tv[t * 4 + 1]], this.splitCnt[Tv[t * 4 + 2]], this.splitCnt[Tv[t * 4 + 3]]);
      const over = stretch - b.tough * (1 - 0.035 * Math.min(sc, 4));
      if (over > 0) {
        // 变形后的拉伸方向 = F·e
        const sx = F00 * vx + F01 * vy + F02 * vz, sy = F10 * vx + F11 * vy + F12 * vz, sz = F20 * vx + F21 * vy + F22 * vz;
        const sl = Math.hypot(sx, sy, sz) || 1;
        for (let q = 0; q < 4; q++) {
          const v = Tv[t * 4 + q];
          if (over > score[v]) { score[v] = over; dirs[v * 3] = sx / sl; dirs[v * 3 + 1] = sy / sl; dirs[v * 3 + 2] = sz / sl; }
        }
      }
    }
    this.stats.maxStretch = maxS;
    // 选取超限最多的若干顶点劈开
    const cand = [];
    for (let v = 0; v < n; v++) if (score[v] > 0) cand.push(v);
    if (!cand.length) return 0;
    cand.sort((a, b) => score[b] - score[a]);
    const K = this.maxSplitsPerCheck || 5;
    let cuts = 0;
    const used = new Set();
    for (const v of cand) {
      if (cuts >= K) break;
      if (this.n >= this.cap - 8 || this.m >= this.capT - 8) break;
      // 避免同一批里相邻顶点同时劈开
      let skip = false;
      for (const t of this.Vinc[v]) { if (used.has(t)) { skip = true; break; } }
      if (skip) continue;
      if (this.splitVertex(v, [dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2]], used)) cuts++;
    }
    if (cuts > 0) {
      this.updateMass(); this.updateBoundary();
      const before = this.compCount;
      this.updateComponents();
      this.stats.cuts += cuts;
      this.events.push({ type: 'crack', n: cuts, t: this.time, pieces: this.compCount });
      if (this.compCount > before) this.events.push({ type: 'split', pieces: this.compCount, t: this.time });
      this.lastCrackTime = this.time;
    }
    return cuts;
  }

  splitVertex(v, nrm, used) {
    const inc = this.Vinc[v], X = this.X, Tv = this.Tv;
    if (inc.length < 2) return false;
    const px = X[v * 3], py = X[v * 3 + 1], pz = X[v * 3 + 2];
    const sideB = new Set();
    let nA = 0, nB = 0;
    // 靠近顶点的一侧划分；用四面体质心相对平面的位置
    for (const t of inc) {
      let cx = 0, cy = 0, cz = 0;
      for (let q = 0; q < 4; q++) { const u = Tv[t * 4 + q] * 3; cx += X[u]; cy += X[u + 1]; cz += X[u + 2]; }
      const d = ((cx / 4 - px) * nrm[0] + (cy / 4 - py) * nrm[1] + (cz / 4 - pz) * nrm[2]);
      if (d >= 0) { sideB.add(t); nB++; } else nA++;
    }
    if (nA === 0 || nB === 0) return false;
    const nv = this.n++;
    const o = v * 3, p = nv * 3;
    this.X[p] = X[o]; this.X[p + 1] = X[o + 1]; this.X[p + 2] = X[o + 2];
    this.Xp[p] = this.Xp[o]; this.Xp[p + 1] = this.Xp[o + 1]; this.Xp[p + 2] = this.Xp[o + 2];
    this.Vl[p] = this.Vl[o]; this.Vl[p + 1] = this.Vl[o + 1]; this.Vl[p + 2] = this.Vl[o + 2];
    this.Vbody[nv] = this.Vbody[v]; this.Vcomp[nv] = this.Vcomp[v];
    this.splitCnt[v] = Math.min(255, this.splitCnt[v] + 1); this.splitCnt[nv] = this.splitCnt[v];
    const newInc = [], keepInc = [];
    for (const t of inc) {
      if (sideB.has(t)) {
        for (let q = 0; q < 4; q++) if (Tv[t * 4 + q] === v) Tv[t * 4 + q] = nv;
        newInc.push(t);
      } else keepInc.push(t);
    }
    this.Vinc[v] = keepInc; this.Vinc[nv] = newInc;
    // 切开跨越两侧的面
    for (const t of newInc) {
      for (let f = 0; f < 4; f++) {
        if (Tv[t * 4 + f] === nv) continue;   // 对着 nv 的面不含 nv
        const u = this.Nb[t * 4 + f];
        if (u < 0 || sideB.has(u)) continue;
        // u 在 A 侧：切开
        this.Nb[t * 4 + f] = -1; this.Crk[t * 4 + f] = 1;
        for (let g2 = 0; g2 < 4; g2++) if (this.Nb[u * 4 + g2] === t) { this.Nb[u * 4 + g2] = -1; this.Crk[u * 4 + g2] = 1; }
      }
    }
    for (const t of inc) used.add(t);
    this.W[nv] = 0; // 由 updateMass 重新计算
    return true;
  }

  /* 体积、统计 */
  volumes() {
    const out = new Float64Array(this.bodies.length);
    const X = this.X, Tv = this.Tv;
    for (let t = 0; t < this.m; t++) {
      const a = Tv[t * 4] * 3, b = Tv[t * 4 + 1] * 3, c = Tv[t * 4 + 2] * 3, d = Tv[t * 4 + 3] * 3;
      const e1 = [X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]], e2 = [X[c] - X[a], X[c + 1] - X[a + 1], X[c + 2] - X[a + 2]], e3 = [X[d] - X[a], X[d + 1] - X[a + 1], X[d + 2] - X[a + 2]];
      out[this.Tbody[t]] += V3.dot(e1, V3.cross(e2, e3)) / 6;
    }
    return out;
  }
}
