// voxel.js — dense voxel grid, construction helpers, armour plating pass, mesher, light baking
(function () {
  'use strict';
  const SF = window.SF, M = SF.M, hash3 = SF.hash3;

  const PLATE_STYLES = {};
  PLATE_STYLES[M.T_BIG] = { H: 24, L: 76, raise: 0.34, a: M.HULL_A, b: M.HULL_B, c: M.HULL_C, pB: 0.24, pC: 0.09 };
  PLATE_STYLES[M.T_MED] = { H: 13, L: 36, raise: 0.38, a: M.HULL_A, b: M.HULL_B, c: M.HULL_C, pB: 0.26, pC: 0.10 };
  PLATE_STYLES[M.T_SMALL] = { H: 7, L: 17, raise: 0.40, a: M.HULL_A, b: M.HULL_B, c: M.HULL_C, pB: 0.28, pC: 0.08 };
  PLATE_STYLES[M.T_FINE] = { H: 4, L: 9, raise: 0.30, a: M.HULL_A, b: M.HULL_B, c: M.HULL_C, pB: 0.3, pC: 0.06 };
  PLATE_STYLES[M.T_INT] = { H: 11, L: 26, raise: 0.30, a: M.INT_A, b: M.INT_B, c: M.INT_B, pB: 0.30, pC: 0.0 };

  class Grid {
    constructor(x0, y0, z0, x1, y1, z1) {
      this.x0 = x0; this.y0 = y0; this.z0 = z0; this.x1 = x1; this.y1 = y1; this.z1 = z1;
      this.nx = x1 - x0 + 2; this.ny = y1 - y0 + 2; this.nz = z1 - z0 + 2;
      this.sy = this.nx; this.sz = this.nx * this.ny;
      this.d = new Uint8Array(this.nx * this.ny * this.nz);
      this.xmin = x0; // construction clip (set to 0 while building a mirrored half)
    }
    idx(x, y, z) { return (x - this.x0 + 1) + this.nx * ((y - this.y0 + 1) + this.ny * (z - this.z0 + 1)); }
    inb(x, y, z) { return x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1 && z >= this.z0 && z < this.z1; }
    get(x, y, z) { return this.inb(x, y, z) ? this.d[this.idx(x, y, z)] : 0; }
    set(x, y, z, m) { if (x >= this.xmin && this.inb(x, y, z)) this.d[this.idx(x, y, z)] = m; }
    _clip(a) {
      let [x0, y0, z0, x1, y1, z1] = a;
      if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
      x0 = Math.max(Math.round(x0), this.xmin, this.x0); y0 = Math.max(Math.round(y0), this.y0); z0 = Math.max(Math.round(z0), this.z0);
      x1 = Math.min(Math.round(x1), this.x1); y1 = Math.min(Math.round(y1), this.y1); z1 = Math.min(Math.round(z1), this.z1);
      return [x0, y0, z0, x1, y1, z1];
    }
    box(x0, y0, z0, x1, y1, z1, m) {
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]);
      if (x1 <= x0 || y1 <= y0 || z1 <= z0) return this;
      const d = this.d;
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { const i = this.idx(x0, y, z); d.fill(m, i, i + (x1 - x0)); }
      return this;
    }
    carve(x0, y0, z0, x1, y1, z1) { return this.box(x0, y0, z0, x1, y1, z1, 0); }
    // fill only empty cells
    boxE(x0, y0, z0, x1, y1, z1, m) {
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]); const d = this.d;
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { let i = this.idx(x0, y, z); for (let x = x0; x < x1; x++, i++) if (!d[i]) d[i] = m; }
      return this;
    }
    // recolour solid cells (optionally only those == from)
    paint(x0, y0, z0, x1, y1, z1, m, from) {
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]); const d = this.d;
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { let i = this.idx(x0, y, z); for (let x = x0; x < x1; x++, i++) { const c = d[i]; if (c && (from === undefined || c === from || (from === -1 && c >= 240))) d[i] = m; } }
      return this;
    }
    fn(x0, y0, z0, x1, y1, z1, f) {
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]); const d = this.d;
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) { let i = this.idx(x0, y, z); for (let x = x0; x < x1; x++, i++) { const m = f(x, y, z, d[i]); if (m >= 0) d[i] = m; } }
      return this;
    }
    // hollow frame box (walls of thickness t)
    frame(x0, y0, z0, x1, y1, z1, t, m) {
      this.box(x0, y0, z0, x1, y1, z1, m); this.carve(x0 + t, y0 + t, z0 + t, x1 - t, y1 - t, z1 - t); return this;
    }
    // carve a recess and line its walls with wallMat (tags inside the 1-cell rim become wallMat so they are not plated)
    trench(x0, y0, z0, x1, y1, z1, wallMat) {
      this.carve(x0, y0, z0, x1, y1, z1);
      this.paint(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1, wallMat, -1);
      return this;
    }
    // stepped loft along z.  prof(z) -> {cx,hw,yb,yt,ct,cb,q}
    loft(z0, z1, prof, m, opts) {
      opts = opts || {}; const zs = opts.zs || 1;
      for (let z = Math.max(z0, this.z0); z < Math.min(z1, this.z1); z++) {
        const zq = z0 + Math.floor((z - z0) / zs) * zs;
        const p = prof(zq); if (!p) continue;
        const cx = p.cx || 0, q = p.q || 1, ct = p.ct || 0, cb = p.cb || 0, cs = p.cs || 1;
        const yb = Math.round(p.yb), yt = Math.round(p.yt);
        for (let y = yb; y < yt; y++) {
          let w = p.hw;
          const dt = y - (yt - ct) + 1; if (dt > 0) w -= Math.ceil(dt / q) * q * cs;
          const db = (yb + cb) - y; if (db > 0) w -= Math.ceil(db / q) * q * (p.cbs || cs);
          if (w <= 0) continue;
          this.box(Math.round(cx - w), y, z, Math.round(cx + w), y + 1, z + 1, m);
        }
      }
      return this;
    }
    // mirror the x>=0 half onto x<0
    mirrorX() {
      const d = this.d;
      for (let z = this.z0; z < this.z1; z++) for (let y = this.y0; y < this.y1; y++) {
        const base = this.idx(0, y, z), n = Math.min(this.x1, -this.x0);
        for (let k = 0; k < n; k++) d[base - 1 - k] = d[base + k];
      }
      return this;
    }
    untag(m, x0, y0, z0, x1, y1, z1) {
      const d = this.d;
      if (x0 === undefined) { for (let i = 0; i < d.length; i++) if (d[i] >= 240) d[i] = m; return this; }
      return this.paint(x0, y0, z0, x1, y1, z1, m, -1);
    }
    // attach armour plates to tagged substructure inside a region
    plate(x0, y0, z0, x1, y1, z1, opts) {
      opts = opts || {};
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]);
      const d = this.d, sy = this.sy, sz = this.sz, OFF = [1, -1, sy, -sy, sz, -sz];
      const order = [2, 3, 0, 1, 4, 5];
      const wi = [], wm = [];
      const seed = opts.seed || 0;
      const RY = y1 - y0, RZ = z1 - z0, rmin = new Int16Array(RY * RZ).fill(32767), rmax = new Int16Array(RY * RZ).fill(-32768);
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) {
        const b = this.idx(x0, y, z), n = x1 - x0; let a = 0; while (a < n && !d[b + a]) a++;
        if (a === n) continue; let e = n - 1; while (!d[b + e]) e--;
        const k = (y - y0) + RY * (z - z0); rmin[k] = x0 + a; rmax[k] = x0 + e;
      }
      const span = (y, z, rr) => { let lo = 32767, hi = -32768; for (let dz = -rr; dz <= rr; dz++) { const zz = z + dz - z0; if (zz < 0 || zz >= RZ) continue; for (let dy = -rr; dy <= rr; dy++) { const yy = y + dy - y0; if (yy < 0 || yy >= RY) continue; const k = yy + RY * zz; if (rmin[k] < lo) lo = rmin[k]; if (rmax[k] > hi) hi = rmax[k]; } } return [lo, hi]; };
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) {
        const [lo, hi] = span(y, z, 1); if (lo > hi) continue;
        const xa = Math.max(x0, lo - 1), xb = Math.min(x1, hi + 2);
        let i = this.idx(xa, y, z);
        for (let x = xa; x < xb; x++, i++) {
          if (d[i]) continue;
          let nd = -1, tag = 0;
          for (let k = 0; k < 6; k++) { const dd = order[k], t = d[i - OFF[dd]]; if (t >= 240) { nd = dd; tag = t; break; } }
          if (nd < 0) continue;
          const st = PLATE_STYLES[tag]; if (!st) continue;
          const ax = nd >> 1; let u, v;
          if (ax === 0) { u = z; v = y; } else if (ax === 1) { u = z; v = x; } else { u = x; v = y; }
          const H = st.H, r = Math.floor(v / H), vm = v - r * H;
          const Lr = Math.max(4, Math.round(st.L * (0.62 + 0.76 * hash3(r, ax * 7 + (nd & 1), seed, 11))));
          const uo = u + Math.floor(hash3(r, ax, seed, 23) * Lr) + 4096 * Lr;
          const s = Math.floor(uo / Lr), um = uo - s * Lr;
          if (um === 0 || vm === 0) continue; // seam: substructure shows through
          const ph = hash3(s, r, ax + nd * 3 + seed * 13, 31);
          const mat = ph < st.pC ? st.c : (ph < st.pC + st.pB ? st.b : st.a);
          wi.push(i); wm.push(mat);
          if (hash3(s, r, ax + nd * 3 + seed * 13, 47) < st.raise && um > 1 && um < Lr - 1 && vm > 1 && vm < H - 1) {
            const j = i + OFF[nd]; if (!d[j]) { wi.push(j); wm.push(mat); }
          }
        }
      }
      for (let k = 0; k < wi.length; k++) d[wi[k]] = wm[k];
      if (opts.edges !== false) {
        // close convex edges: empty cell touching two perpendicular fresh plates and no substructure
        const isP = c => c === M.HULL_A || c === M.HULL_B || c === M.HULL_C || c === M.INT_A || c === M.INT_B;
        const ei = [], em = [];
        for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) {
          const [lo, hi] = span(y, z, 2); if (lo > hi) continue;
          const xa = Math.max(x0, lo - 3), xb = Math.min(x1, hi + 4);
          let i = this.idx(xa, y, z);
          for (let x = xa; x < xb; x++, i++) {
            if (d[i]) continue;
            const ax_ = isP(d[i - 1]) || isP(d[i + 1]), ay_ = isP(d[i - sy]) || isP(d[i + sy]), az_ = isP(d[i - sz]) || isP(d[i + sz]);
            if ((ax_ ? 1 : 0) + (ay_ ? 1 : 0) + (az_ ? 1 : 0) < 2) continue;
            let tagged = false;
            for (let k = 0; k < 6; k++) if (d[i + OFF[k]] >= 240) { tagged = true; break; }
            if (tagged) continue;
            // only when a diagonal neighbour is substructure (true convex edge of the body)
            let diag = false;
            const A = [1, -1], B = [sy, -sy], C = [sz, -sz];
            for (let a = 0; a < 2 && !diag; a++) for (let b = 0; b < 2 && !diag; b++) {
              if (d[i + A[a] + B[b]] >= 240 || d[i + A[a] + C[b]] >= 240 || d[i + B[a] + C[b]] >= 240) diag = true;
            }
            if (!diag) continue;
            ei.push(i); em.push(opts.edgeMat || (isP(d[i - sy]) ? d[i - sy] : isP(d[i + sy]) ? d[i + sy] : isP(d[i - 1]) ? d[i - 1] : isP(d[i + 1]) ? d[i + 1] : isP(d[i - sz]) ? d[i - sz] : d[i + sz]));
          }
        }
        for (let k = 0; k < ei.length; k++) d[ei[k]] = em[k];
      }
      return this;
    }
    // scatter small boxes sitting on surfaces inside a region
    greeble(x0, y0, z0, x1, y1, z1, rnd, count, mats, dir, maxs) {
      [x0, y0, z0, x1, y1, z1] = this._clip([x0, y0, z0, x1, y1, z1]);
      if (x1 <= x0 || y1 <= y0 || z1 <= z0) return this;
      dir = dir || 2; maxs = maxs || [4, 3, 6];
      const OFF = [1, -1, this.sy, -this.sy, this.sz, -this.sz], d = this.d;
      for (let k = 0; k < count; k++) {
        const x = rnd.i(x0, x1 - 1), y = rnd.i(y0, y1 - 1), z = rnd.i(z0, z1 - 1);
        const i = this.idx(x, y, z);
        if (d[i] || !d[i - OFF[dir]]) continue;
        const w = rnd.i(1, maxs[0]), h = rnd.i(1, maxs[1]), l = rnd.i(1, maxs[2]), m = rnd.pick(mats);
        if (dir === 2) this.boxE(x, y, z, x + w, y + h, z + l, m);
        else if (dir === 3) this.boxE(x, y - h + 1, z, x + w, y + 1, z + l, m);
        else if (dir === 0) this.boxE(x, y, z, x + h, y + w, z + l, m);
        else if (dir === 1) this.boxE(x - h + 1, y, z, x + 1, y + w, z + l, m);
        else if (dir === 4) this.boxE(x, y, z, x + w, y + l, z + h, m);
        else this.boxE(x, y, z - h + 1, x + w, y + l, z + 1, m);
      }
      return this;
    }
    count() { let n = 0; const d = this.d; for (let i = 0; i < d.length; i++) if (d[i]) n++; return n; }
  }

  // ------------------------------------------------------------------ mesher
  // returns { buf(ArrayBuffer 16B/face), n, tbuf, tn, chunks, origin }
  function meshGrid(g, opts) {
    opts = opts || {};
    const D = g.d, nx = g.nx, ny = g.ny, nz = g.nz, sy = g.sy, sz = g.sz;
    const TR = SF.matTrans, OCC = new Uint8Array(256);
    for (let i = 1; i < 256; i++) OCC[i] = TR[i] ? 0 : 1;
    const piece = opts.piece || null, pid = opts.pid | 0;
    const OFF = [1, -1, sy, -sy, sz, -sz], AOF = [sy, sy, sz, sz, 1, 1], BOF = [sz, sz, 1, 1, sy, sy];
    let cap = 1 << 15, buf = new ArrayBuffer(cap * 16), u16 = new Uint16Array(buf), u8 = new Uint8Array(buf), n = 0;
    let tcap = 1 << 10, tbuf = new ArrayBuffer(tcap * 16), t16 = new Uint16Array(tbuf), t8 = new Uint8Array(tbuf), tn = 0;
    const chunks = [], CH = opts.chunk || 64;
    let chStart = 0, chZ = 1;
    const bb = opts.bbox, bx0 = bb ? Math.max(1, bb[0]) : 1, by0 = bb ? Math.max(1, bb[1]) : 1, bz0 = bb ? Math.max(1, bb[2]) : 1, bx1 = bb ? Math.min(nx - 1, bb[3]) : nx - 1, by1 = bb ? Math.min(ny - 1, bb[4]) : ny - 1, bz1 = bb ? Math.min(nz - 1, bb[5]) : nz - 1;
    for (let z = bz0; z < bz1; z++) {
      if (z > 1 && (z - 1) % CH === 0) { if (n > chStart) chunks.push({ start: chStart, count: n - chStart, z0: chZ - 1 + g.z0, z1: z - 1 + g.z0 }); chStart = n; chZ = z; }
      for (let y = by0; y < by1; y++) {
        let i = bx0 + nx * (y + ny * z);
        for (let x = bx0; x < bx1; x++, i++) {
          const m = D[i]; if (!m) continue;
          if (piece && piece[i] !== pid) continue;
          const tm = TR[m];
          for (let dd = 0; dd < 6; dd++) {
            const ni = i + OFF[dd], nm = D[ni]; let interior = 0;
            if (piece) { if (nm) { if (piece[ni] === pid) continue; interior = 1; } }
            else if (nm) { if (tm || !TR[nm]) continue; }
            if (tm) {
              if (tn === tcap) { tcap *= 2; const nb = new ArrayBuffer(tcap * 16); new Uint8Array(nb).set(t8); tbuf = nb; t16 = new Uint16Array(nb); t8 = new Uint8Array(nb); }
              const o = tn * 8; t16[o] = x - 1; t16[o + 1] = y - 1; t16[o + 2] = z - 1; t16[o + 3] = dd;
              t8[tn * 16 + 8] = 255; t8[tn * 16 + 9] = m; tn++; continue;
            }
            if (n === cap) { cap *= 2; const nb = new ArrayBuffer(cap * 16); new Uint8Array(nb).set(u8); buf = nb; u16 = new Uint16Array(nb); u8 = new Uint8Array(nb); }
            let ao = 255, edge = 0;
            if (!interior) {
              const a = AOF[dd], b = BOF[dd];
              const mm = OCC[D[ni - a - b]], m0 = OCC[D[ni - a]], mp = OCC[D[ni - a + b]], zm = OCC[D[ni - b]], zp = OCC[D[ni + b]], pm = OCC[D[ni + a - b]], p0 = OCC[D[ni + a]], pp = OCC[D[ni + a + b]];
              const a00 = (m0 && zm) ? 0 : 3 - (m0 + zm + mm), a10 = (p0 && zm) ? 0 : 3 - (p0 + zm + pm), a11 = (p0 && zp) ? 0 : 3 - (p0 + zp + pp), a01 = (m0 && zp) ? 0 : 3 - (m0 + zp + mp);
              ao = a00 | (a10 << 2) | (a11 << 4) | (a01 << 6);
              edge = (OCC[D[i - a]] ? 0 : 1) | (OCC[D[i + a]] ? 0 : 2) | (OCC[D[i - b]] ? 0 : 4) | (OCC[D[i + b]] ? 0 : 8);
            }
            const o = n * 8; u16[o] = x - 1; u16[o + 1] = y - 1; u16[o + 2] = z - 1; u16[o + 3] = dd | (edge << 3) | (interior << 7);
            const o8 = n * 16; u8[o8 + 8] = ao; u8[o8 + 9] = m; u8[o8 + 10] = 255; u8[o8 + 11] = 0; u8[o8 + 12] = 0; u8[o8 + 13] = 0; u8[o8 + 14] = 0; u8[o8 + 15] = 0;
            n++;
          }
        }
      }
    }
    if (n > chStart) chunks.push({ start: chStart, count: n - chStart, z0: chZ - 1 + g.z0, z1: g.z1 });
    return { buf: buf.slice(0, n * 16), n, tbuf: tbuf.slice(0, tn * 16), tn, chunks, origin: [g.x0, g.y0, g.z0], dims: [g.x1 - g.x0, g.y1 - g.y0, g.z1 - g.z0] };
  }

  const NRM = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  // software shadow-map bake of the sun term into byte 10
  function bakeSun(meshIn, L) {
    const meshes = (Array.isArray(meshIn) ? meshIn : [meshIn]).filter(m => m.n > 0);
    if (!meshes.length) return;
    const v3 = SF.v3; L = v3.norm(L);
    let U = v3.cross([0, 1, 0], L); if (v3.len(U) < 0.01) U = [1, 0, 0]; U = v3.norm(U); const V = v3.cross(L, U);
    const S = 2;
    const dm = meshes[0].dims; let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    for (let k = 0; k < 8; k++) {
      const p = [(k & 1) ? dm[0] : 0, (k & 2) ? dm[1] : 0, (k & 4) ? dm[2] : 0];
      const u = v3.dot(p, U), vv = v3.dot(p, V); umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, vv); vmax = Math.max(vmax, vv);
    }
    const W = Math.ceil((umax - umin) * S) + 8, Hh = Math.ceil((vmax - vmin) * S) + 8;
    const sb = new Float32Array(W * Hh).fill(-1e9);
    const Ux = U[0], Uy = U[1], Uz = U[2], Vx = V[0], Vy = V[1], Vz = V[2], Lx = L[0], Ly = L[1], Lz = L[2];
    for (const mesh of meshes) {
      const n = mesh.n, u16 = new Uint16Array(mesh.buf);
      for (let f = 0; f < n; f++) {
        const o = f * 8; if (u16[o + 3] & 128) continue;
        const cx = u16[o] + 0.5, cy = u16[o + 1] + 0.5, cz = u16[o + 2] + 0.5;
        const iu = Math.round((cx * Ux + cy * Uy + cz * Uz - umin) * S) + 3, iv = Math.round((cx * Vx + cy * Vy + cz * Vz - vmin) * S) + 3;
        const dz = cx * Lx + cy * Ly + cz * Lz + 0.3;
        for (let bb = -1; bb <= 1; bb++) { const row = (iv + bb) * W + iu; for (let aa = -1; aa <= 1; aa++) if (sb[row + aa] < dz) sb[row + aa] = dz; }
      }
    }
    for (const mesh of meshes) {
      const n = mesh.n, u16 = new Uint16Array(mesh.buf), u8 = new Uint8Array(mesh.buf);
      for (let f = 0; f < n; f++) {
        const o = f * 8, dd = u16[o + 3] & 7, N = NRM[dd];
        const ndl = N[0] * Lx + N[1] * Ly + N[2] * Lz;
        if (u16[o + 3] & 128) { u8[f * 16 + 10] = 255; continue; }
        if (ndl <= 0.02) { u8[f * 16 + 10] = 0; continue; }
        const px = u16[o] + 0.5 + N[0] * 1.05, py = u16[o + 1] + 0.5 + N[1] * 1.05, pz = u16[o + 2] + 0.5 + N[2] * 1.05;
        const fu = (px * Ux + py * Uy + pz * Uz - umin) * S + 3, fv = (px * Vx + py * Vy + pz * Vz - vmin) * S + 3;
        const iu = Math.round(fu), iv = Math.round(fv);
        const dq = px * Lx + py * Ly + pz * Lz + 0.55 + 0.75 * Math.sqrt(1 - ndl * ndl) / Math.max(ndl, 0.14);
        let lit = 0; const r0 = iv * W + iu;
        if (sb[r0] <= dq) lit += 2; if (sb[r0 - 2] <= dq) lit++; if (sb[r0 + 2] <= dq) lit++; if (sb[r0 - 2 * W] <= dq) lit++; if (sb[r0 + 2 * W] <= dq) lit++;
        u8[f * 16 + 10] = Math.round(lit * 42.5);
      }
    }
  }

  // gather local emissive light into bytes 11..13 (channels A,B,C)
  function bakeGlow(mesh, opts) {
    opts = opts || {};
    const n = mesh.n; if (!n) return;
    const CS = opts.cs || 6, RG = opts.range || 2, R = CS * RG, R2 = R * R, gain = opts.gain || 1;
    const u16 = new Uint16Array(mesh.buf), u8 = new Uint8Array(mesh.buf);
    const dm = mesh.dims, gx = Math.ceil(dm[0] / CS) + 2 * RG + 1, gy = Math.ceil(dm[1] / CS) + 2 * RG + 1, gz = Math.ceil(dm[2] / CS) + 2 * RG + 1;
    const NC = gx * gy * gz;
    const pw = new Float32Array(NC * 3), sx = new Float32Array(NC * 3), sy_ = new Float32Array(NC * 3), sz_ = new Float32Array(NC * 3);
    const any = new Uint8Array(NC);
    const bakeCh = SF.bakeCh, bakePw = SF.bakePw;
    let found = false;
    const acc = (b16, b8, cnt) => {
      for (let f = 0; f < cnt; f++) {
        const m = b8[f * 16 + 9], ch = bakeCh[m]; if (ch < 0) continue;
        const o = f * 8, N = NRM[b16[o + 3] & 7];
        const px = b16[o] + 0.5 + N[0] * 0.5, py = b16[o + 1] + 0.5 + N[1] * 0.5, pz = b16[o + 2] + 0.5 + N[2] * 0.5;
        const c = (Math.floor(px / CS) + RG) + gx * ((Math.floor(py / CS) + RG) + gy * (Math.floor(pz / CS) + RG));
        const k = c * 3 + ch, p = bakePw[m];
        pw[k] += p; sx[k] += px * p; sy_[k] += py * p; sz_[k] += pz * p; found = true;
      }
    };
    acc(u16, u8, n);
    if (mesh.tn) acc(new Uint16Array(mesh.tbuf), new Uint8Array(mesh.tbuf), mesh.tn);
    if (!found) return;
    for (let c = 0; c < NC; c++) {
      let a = false;
      for (let ch = 0; ch < 3; ch++) { const k = c * 3 + ch; if (pw[k] > 0) { sx[k] /= pw[k]; sy_[k] /= pw[k]; sz_[k] /= pw[k]; a = true; } }
      if (a) {
        const cz = Math.floor(c / (gx * gy)), cy = Math.floor((c - cz * gx * gy) / gx), cx = c - cz * gx * gy - cy * gx;
        for (let z = Math.max(0, cz - RG); z <= Math.min(gz - 1, cz + RG); z++) for (let y = Math.max(0, cy - RG); y <= Math.min(gy - 1, cy + RG); y++) for (let x = Math.max(0, cx - RG); x <= Math.min(gx - 1, cx + RG); x++) any[x + gx * (y + gy * z)] = 1;
      }
    }
    const acc3 = [0, 0, 0];
    for (let f = 0; f < n; f++) {
      const o = f * 8, N = NRM[u16[o + 3] & 7];
      const px = u16[o] + 0.5 + N[0] * 0.5, py = u16[o + 1] + 0.5 + N[1] * 0.5, pz = u16[o + 2] + 0.5 + N[2] * 0.5;
      const cx = Math.floor(px / CS) + RG, cy = Math.floor(py / CS) + RG, cz = Math.floor(pz / CS) + RG;
      if (!any[cx + gx * (cy + gy * cz)]) continue;
      acc3[0] = acc3[1] = acc3[2] = 0;
      for (let z = cz - RG; z <= cz + RG; z++) for (let y = cy - RG; y <= cy + RG; y++) {
        let c = (cx - RG) + gx * (y + gy * z);
        for (let x = 0; x <= 2 * RG; x++, c++) {
          for (let ch = 0; ch < 3; ch++) {
            const k = c * 3 + ch, p = pw[k]; if (p <= 0) continue;
            const dx = sx[k] - px, dy = sy_[k] - py, dz = sz_[k] - pz, d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= R2) continue;
            const dl = Math.sqrt(d2) + 1e-4, nd = (N[0] * dx + N[1] * dy + N[2] * dz) / dl;
            const wrap = nd * 0.7 + 0.3; if (wrap <= 0) continue;
            const w = 1 - d2 / R2;
            acc3[ch] += p * wrap * w * w / (d2 + 7);
          }
        }
      }
      const o8 = f * 16;
      u8[o8 + 11] = Math.min(255, Math.sqrt(acc3[0] * gain * 0.5) * 255);
      u8[o8 + 12] = Math.min(255, Math.sqrt(acc3[1] * gain * 0.5) * 255);
      u8[o8 + 13] = Math.min(255, Math.sqrt(acc3[2] * gain * 0.5) * 255);
    }
  }

  SF.Grid = Grid; SF.meshGrid = meshGrid; SF.bakeSun = bakeSun; SF.bakeGlow = bakeGlow; SF.PLATE_STYLES = PLATE_STYLES; SF.NRM = NRM;
})();
