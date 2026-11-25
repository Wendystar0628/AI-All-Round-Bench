'use strict';
/* ==========================================================================
   晴空水上乐园 — core: math, palette, sparse voxel world, greedy mesher
   ========================================================================== */
(function () {
  const P = (window.P = window.P || {});
  const V = (P.V = 0.25); // base voxel (m)
  P.FV = 0.125; // fine voxel (m)

  /* ------------------------------ math ------------------------------ */
  const clamp = (P.clamp = (x, a, b) => (x < a ? a : x > b ? b : x));
  P.lerp = (a, b, t) => a + (b - a) * t;
  P.smooth = (e0, e1, x) => {
    let t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  P.fract = (x) => x - Math.floor(x);
  P.TAU = Math.PI * 2;
  P.deg = Math.PI / 180;

  function imul32(a, b) { return Math.imul(a, b); }
  P.hash2i = function (x, y) {
    let h = (imul32(x | 0, 374761393) + imul32(y | 0, 668265263)) | 0;
    h = imul32(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  P.hash3i = function (x, y, z) {
    let h = (imul32(x | 0, 374761393) + imul32(y | 0, 668265263) + imul32(z | 0, 1440662683)) | 0;
    h = imul32(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  P.hash1 = function (n) {
    let h = imul32((n | 0) ^ 0x27d4eb2d, 0x165667b1);
    h = imul32(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  P.hashf = function (x) { // float -> [0,1)
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  P.noise2 = function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = P.hash2i(xi, yi), b = P.hash2i(xi + 1, yi), c = P.hash2i(xi, yi + 1), d = P.hash2i(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  P.fbm2 = function (x, y, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) {
      s += a * P.noise2(x * f + i * 17.3, y * f - i * 9.1);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  };
  P.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  P.easeInOut = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  P.easeInOutQ = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ------------------------------ palette ------------------------------
     rows: 0: rgb(linear) + emissive
           1: grout(grid) , spec, shininess(0..1), sway(0..1)
           2: variation, class(0 op,1 glass,2 water), alpha, wetGloss
           3: rimBoost, caustic-receive(1/0), sss(leaf translucency), metal */
  const PAL_W = 256, PAL_H = 4;
  const pal = (P.pal = {
    n: 1,
    data: new Float32Array(PAL_W * PAL_H * 4),
    cls: new Uint8Array(256), // 0 air, 1 opaque, 2 glass, 3 water
    noMerge: new Uint8Array(256),
    names: [],
    hex: [],
  });
  const M = (P.M = {});
  P.mat = function (name, hex, o) {
    o = o || {};
    if (M[name]) return M[name];
    const id = pal.n++;
    const c = new THREE.Color(hex); // -> linear working space
    const d = pal.data;
    const r0 = (0 * PAL_W + id) * 4, r1 = (1 * PAL_W + id) * 4, r2 = (2 * PAL_W + id) * 4, r3 = (3 * PAL_W + id) * 4;
    d[r0] = c.r; d[r0 + 1] = c.g; d[r0 + 2] = c.b; d[r0 + 3] = o.emis || 0;
    d[r1] = o.grid != null ? o.grid : 0.05; d[r1 + 1] = o.spec || 0; d[r1 + 2] = o.shin != null ? o.shin : 0.5; d[r1 + 3] = o.sway || 0;
    const cls = o.cls === 'glass' ? 1 : o.cls === 'water' ? 2 : 0;
    d[r2] = o.vary != null ? o.vary : 0.045; d[r2 + 1] = cls; d[r2 + 2] = o.alpha != null ? o.alpha : 1; d[r2 + 3] = o.wet || 0;
    d[r3] = o.rim != null ? o.rim : 1; d[r3 + 1] = o.caustic ? 1 : 0; d[r3 + 2] = o.sss || 0; d[r3 + 3] = o.grain || 0;
    pal.cls[id] = cls === 1 ? 2 : cls === 2 ? 3 : 1;
    pal.noMerge[id] = o.noMerge ? 1 : 0;
    pal.names[id] = name; pal.hex[id] = hex;
    M[name] = id;
    return id;
  };
  P.CARVE = 255; // explicit air (carves terrain)
  P.makePaletteTexture = function () {
    const t = new THREE.DataTexture(pal.data, PAL_W, PAL_H, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    P.palTex = t;
    return t;
  };

  /* ------------------------------ voxel world ------------------------------ */
  // chunk = 16^3, index = x | z<<4 | y<<8
  function ckey(cx, cy, cz) { return ((cx + 2048) * 4096 + (cy + 2048)) * 4096 + (cz + 2048); }
  P.ckey = ckey;
  class VoxelWorld {
    constructor(size) {
      this.size = size;
      this.chunks = new Map();
      this.snrm = new Map(); // chunk key -> Int8Array(4096*3) smooth normals
      this.flow = new Map(); // chunk key -> Float32Array(4096*5) tau, v, tx, ty, tz
      this.cols = new Map(); // (cx,cz) -> [minCy,maxCy]
      this.count = 0;
    }
    _chunk(x, y, z, create) {
      const k = ckey(x >> 4, y >> 4, z >> 4);
      let c = this.chunks.get(k);
      if (!c && create) {
        c = new Uint8Array(4096);
        this.chunks.set(k, c);
        const ck = (x >> 4) * 8192 + (z >> 4);
        const r = this.cols.get(ck);
        const cy = y >> 4;
        if (!r) this.cols.set(ck, [cy, cy]);
        else { if (cy < r[0]) r[0] = cy; if (cy > r[1]) r[1] = cy; }
      }
      return c;
    }
    set(x, y, z, m) {
      const c = this._chunk(x, y, z, true);
      c[(x & 15) | ((z & 15) << 4) | ((y & 15) << 8)] = m;
    }
    setIfEmpty(x, y, z, m) {
      const c = this._chunk(x, y, z, true);
      const i = (x & 15) | ((z & 15) << 4) | ((y & 15) << 8);
      if (!c[i]) c[i] = m;
    }
    get(x, y, z) {
      const c = this.chunks.get(ckey(x >> 4, y >> 4, z >> 4));
      return c ? c[(x & 15) | ((z & 15) << 4) | ((y & 15) << 8)] : 0;
    }
    setN(x, y, z, nx, ny, nz) {
      const k = ckey(x >> 4, y >> 4, z >> 4);
      let a = this.snrm.get(k);
      if (!a) { a = new Int8Array(4096 * 3); this.snrm.set(k, a); }
      const i = ((x & 15) | ((z & 15) << 4) | ((y & 15) << 8)) * 3;
      a[i] = Math.round(nx * 127); a[i + 1] = Math.round(ny * 127); a[i + 2] = Math.round(nz * 127);
    }
    getN(x, y, z, out) {
      const a = this.snrm.get(ckey(x >> 4, y >> 4, z >> 4));
      if (!a) return false;
      const i = ((x & 15) | ((z & 15) << 4) | ((y & 15) << 8)) * 3;
      if (a[i] === 0 && a[i + 1] === 0 && a[i + 2] === 0) return false;
      out[0] = a[i] / 127; out[1] = a[i + 1] / 127; out[2] = a[i + 2] / 127;
      return true;
    }
    setFlow(x, y, z, tau, v, tx, ty, tz) {
      const k = ckey(x >> 4, y >> 4, z >> 4);
      let a = this.flow.get(k);
      if (!a) { a = new Float32Array(4096 * 5); this.flow.set(k, a); }
      const i = ((x & 15) | ((z & 15) << 4) | ((y & 15) << 8)) * 5;
      a[i] = tau; a[i + 1] = v; a[i + 2] = tx; a[i + 3] = ty; a[i + 4] = tz;
    }
    getFlow(x, y, z) {
      const a = this.flow.get(ckey(x >> 4, y >> 4, z >> 4));
      if (!a) return null;
      const i = ((x & 15) | ((z & 15) << 4) | ((y & 15) << 8)) * 5;
      return a[i + 1] > 0 ? [a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4]] : null;
    }
    // bounds in voxel units of all chunks
    bounds() {
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (const k of this.chunks.keys()) {
        const cz = (k % 4096) - 2048, t = Math.floor(k / 4096), cy = (t % 4096) - 2048, cx = Math.floor(t / 4096) - 2048;
        mnx = Math.min(mnx, cx); mny = Math.min(mny, cy); mnz = Math.min(mnz, cz);
        mxx = Math.max(mxx, cx); mxy = Math.max(mxy, cy); mxz = Math.max(mxz, cz);
      }
      return [mnx * 16, mny * 16, mnz * 16, mxx * 16 + 16, mxy * 16 + 16, mxz * 16 + 16];
    }
  }
  P.VoxelWorld = VoxelWorld;

  /* --------------------------- brushes (meters) --------------------------- */
  const vi = (m) => Math.round(m / V);
  P.vi = vi;
  P.Brush = class Brush {
    constructor(world) { this.w = world; this.s = world.size; this.mode = 0; }
    q(m) { return Math.round(m / this.s); }
    // fill voxels whose centres lie inside [x0,x1)x[y0,y1)x[z0,z1) (meters)
    box(x0, y0, z0, x1, y1, z1, m) {
      const s = this.s, w = this.w;
      const ax = Math.round(Math.min(x0, x1) / s), bx = Math.round(Math.max(x0, x1) / s);
      const ay = Math.round(Math.min(y0, y1) / s), by = Math.round(Math.max(y0, y1) / s);
      const az = Math.round(Math.min(z0, z1) / s), bz = Math.round(Math.max(z0, z1) / s);
      for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
        if (this.mode === 1) w.setIfEmpty(x, y, z, m); else w.set(x, y, z, m);
      }
    }
    // box given by centre/size
    boxC(cx, y0, cz, sx, sy, sz, m) { this.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, m); }
    // general fill: fn(xm,ym,zm, ix,iy,iz) -> material id or 0 (skip) ; bounds in meters
    fill(x0, y0, z0, x1, y1, z1, fn) {
      const s = this.s, w = this.w;
      const ax = Math.floor(x0 / s), bx = Math.ceil(x1 / s);
      const ay = Math.floor(y0 / s), by = Math.ceil(y1 / s);
      const az = Math.floor(z0 / s), bz = Math.ceil(z1 / s);
      for (let y = ay; y < by; y++) {
        const ym = (y + 0.5) * s;
        for (let z = az; z < bz; z++) {
          const zm = (z + 0.5) * s;
          for (let x = ax; x < bx; x++) {
            const m = fn((x + 0.5) * s, ym, zm, x, y, z);
            if (m) { if (this.mode === 1) w.setIfEmpty(x, y, z, m); else w.set(x, y, z, m); }
          }
        }
      }
    }
    // vertical cylinder (centre cx,cz ; radius r ; optional inner radius ri)
    cyl(cx, cz, r, y0, y1, m, ri) {
      const r2 = r * r, ri2 = ri ? ri * ri : -1;
      this.fill(cx - r, y0, cz - r, cx + r, y1, cz + r, (x, y, z) => {
        const d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        return d <= r2 && d >= ri2 ? (typeof m === 'function' ? m(x, y, z) : m) : 0;
      });
    }
    ellipsoid(cx, cy, cz, rx, ry, rz, m) {
      this.fill(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, (x, y, z) => {
        const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz;
        return a * a + b * b + c * c <= 1 ? (typeof m === 'function' ? m(x, y, z) : m) : 0;
      });
    }
    // thick segment (capsule) between points
    seg(ax, ay, az, bx, by, bz, r, m) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1e-9;
      const r2 = r * r;
      this.fill(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.min(az, bz) - r,
        Math.max(ax, bx) + r, Math.max(ay, by) + r, Math.max(az, bz) + r, (x, y, z) => {
          let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + dx * t - x, py = ay + dy * t - y, pz = az + dz * t - z;
          return px * px + py * py + pz * pz <= r2 ? m : 0;
        });
    }
    // square-section beam (axis aligned voxels) along a segment, thickness t (m)
    beam(ax, ay, az, bx, by, bz, t, m) {
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      const n = Math.max(1, Math.ceil(L / (this.s * 0.5)));
      const h = t / 2;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f;
        this.box(x - h, y - h, z - h, x + h, y + h, z + h, m);
      }
    }
  };

  /* ------------------------------ terrain ------------------------------ */
  // heightmap of voxel columns: solid for y < H ; top voxel = top mat ; below = side style
  P.Terrain = class Terrain {
    constructor(x0, z0, W, D) {
      this.x0 = x0; this.z0 = z0; this.W = W; this.D = D; // voxel index offsets/sizes
      this.H = new Int16Array(W * D);
      this.top = new Uint8Array(W * D);
      this.side = new Uint8Array(W * D);
      this.styles = [[1]];
      this.defaultH = 0; this.defaultTop = 1; this.defaultSide = 0;
    }
    idx(x, z) { const a = x - this.x0, b = z - this.z0; return a < 0 || b < 0 || a >= this.W || b >= this.D ? -1 : a + b * this.W; }
    h(x, z) { const i = this.idx(x, z); return i < 0 ? this.defaultH : this.H[i]; }
    // height in meters at world (xm,zm)
    hm(xm, zm) { return this.h(Math.floor(xm / V), Math.floor(zm / V)) * V; }
    addStyle(arr) { this.styles.push(arr); return this.styles.length - 1; }
    matAt(i, d) { // d = depth below top (0 = top voxel)
      if (d === 0) return this.top[i];
      const st = this.styles[this.side[i]];
      return st[Math.min(d - 1, st.length - 1)];
    }
  };

  /* ------------------------------ mesher ------------------------------ */
  const NRM = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  P.NRM = NRM;
  class QuadBuf {
    constructor(withFlow) {
      this.n = 0; this.cap = 1024;
      this.pos = new Int16Array(this.cap * 12);
      this.dat = new Uint8Array(this.cap * 16);
      this.sn = new Int8Array(this.cap * 16);
      this.flip = new Uint8Array(this.cap);
      this.flow = withFlow ? new Float32Array(this.cap * 4) : null;
    }
    grow() {
      const c = this.cap * 2;
      const g = (A, k) => { const b = new A.constructor(c * k); b.set(A); return b; };
      this.pos = g(this.pos, 12); this.dat = g(this.dat, 16); this.sn = g(this.sn, 16); this.flip = g(this.flip, 1);
      if (this.flow) this.flow = g(this.flow, 4);
      this.cap = c;
    }
    toGeometry() {
      const n = this.n;
      if (!n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 12), 3));
      g.setAttribute('data', new THREE.BufferAttribute(this.dat.slice(0, n * 16), 4));
      g.setAttribute('snrm', new THREE.BufferAttribute(this.sn.slice(0, n * 16), 4, true));
      if (this.flow) g.setAttribute('flow', new THREE.BufferAttribute(this.flow.slice(0, n * 4), 1));
      const big = n * 4 > 65535;
      const idx = big ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
      for (let q = 0; q < n; q++) {
        const b = q * 4, o = q * 6;
        if (this.flip[q]) { idx[o] = b + 1; idx[o + 1] = b + 2; idx[o + 2] = b + 3; idx[o + 3] = b + 1; idx[o + 4] = b + 3; idx[o + 5] = b; }
        else { idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
      }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }
  P.QuadBuf = QuadBuf;

  // scratch
  let VOX = new Uint8Array(1), SN = null;
  const tmpN = [0, 0, 0];

  /*
   meshBox: mesh a box of voxels [bx,bx+sx) x [by,by+sy) x [bz,bz+sz) (voxel units)
   world: VoxelWorld (explicit), terrain: Terrain or null, occ: optional coarse occluder fn for fine worlds
   outs: {op: QuadBuf, gl: QuadBuf, wa: QuadBuf}
  */
  P.meshBox = function (world, terrain, bx, by, bz, sx, sy, sz, outs, coarseOcc) {
    const PX = sx + 2, PZ = sz + 2, PY = sy + 2;
    const total = PX * PY * PZ;
    if (VOX.length < total) VOX = new Uint8Array(total);
    const vox = VOX;
    vox.fill(0, 0, total);
    const sY = PX * PZ, sZ = PX;
    // terrain fill
    if (terrain) {
      for (let pz = 0; pz < PZ; pz++) {
        const wz = bz - 1 + pz;
        for (let px = 0; px < PX; px++) {
          const wx = bx - 1 + px;
          const ti = terrain.idx(wx, wz);
          let h, top, st;
          if (ti < 0) { h = terrain.defaultH; top = terrain.defaultTop; st = terrain.styles[terrain.defaultSide]; }
          else { h = terrain.H[ti]; top = terrain.top[ti]; st = terrain.styles[terrain.side[ti]]; }
          const yEnd = Math.min(h, by - 1 + PY);
          for (let wy = by - 1; wy < yEnd; wy++) {
            const d = h - 1 - wy;
            vox[px + pz * sZ + (wy - by + 1) * sY] = d === 0 ? top : st[Math.min(d - 1, st.length - 1)];
          }
        }
      }
    }
    // coarse occluders (for fine meshing): mark solid with special id 254 (no faces emitted)
    if (coarseOcc) {
      for (let py = 0; py < PY; py++) for (let pz = 0; pz < PZ; pz++) for (let px = 0; px < PX; px++) {
        if (coarseOcc(bx - 1 + px, by - 1 + py, bz - 1 + pz)) vox[px + pz * sZ + py * sY] = 254;
      }
    }
    // explicit overlay
    const cx0 = (bx - 1) >> 4, cx1 = (bx + sx) >> 4;
    const cy0 = (by - 1) >> 4, cy1 = (by + sy) >> 4;
    const cz0 = (bz - 1) >> 4, cz1 = (bz + sz) >> 4;
    let anyExplicit = false;
    const snChunks = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = world.chunks.get(ckey(cx, cy, cz));
      if (!c) continue;
      anyExplicit = true;
      const ox = cx * 16, oy = cy * 16, oz = cz * 16;
      const xa = Math.max(ox, bx - 1), xb = Math.min(ox + 16, bx + sx + 1);
      const ya = Math.max(oy, by - 1), yb = Math.min(oy + 16, by + sy + 1);
      const za = Math.max(oz, bz - 1), zb = Math.min(oz + 16, bz + sz + 1);
      for (let y = ya; y < yb; y++) for (let z = za; z < zb; z++) {
        const ci = ((z - oz) << 4) | ((y - oy) << 8);
        const pi = (z - bz + 1) * sZ + (y - by + 1) * sY + 1 - bx;
        for (let x = xa; x < xb; x++) {
          const m = c[ci | (x - ox)];
          if (m) vox[pi + x] = m === 255 ? 0 : m;
        }
      }
    }
    const cls = pal.cls;
    const clsOf = (m) => (m === 254 ? 1 : cls[m]);
    const noMerge = pal.noMerge;
    const size = [sx, sy, sz];
    const base = [bx, by, bz];
    const str = [1, sY, sZ];
    const maskLen = Math.max(sx * sy, sy * sz, sx * sz);
    const mask = new Int32Array(maskLen);
    const maskAO = new Uint8Array(maskLen);
    const vtx = [0, 0, 0];
    let faces = 0;
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      const su = size[u], sv = size[v], sd = size[d];
      const stD = str[d], stU = str[u], stV = str[v];
      for (let sgn = 1; sgn >= -1; sgn -= 2) {
        const nIdx = d * 2 + (sgn > 0 ? 0 : 1);
        const off = sgn * stD;
        for (let c = 0; c < sd; c++) {
          // build mask
          let any = false;
          for (let iv = 0; iv < sv; iv++) {
            for (let iu = 0; iu < su; iu++) {
              const a = (c + 1) * stD + (iu + 1) * stU + (iv + 1) * stV;
              const ma = vox[a];
              const mi = iu + iv * su;
              mask[mi] = 0;
              if (!ma || ma === 254) continue;
              const ca = cls[ma];
              const b = a + off;
              const mb = vox[b];
              const cb = mb === 254 ? 1 : cls[mb];
              let emit;
              if (ca === 1) emit = cb !== 1;
              else if (ca === 2) emit = cb === 0;
              else emit = cb === 0 || cb === 2;
              if (!emit) continue;
              // AO (only opaque occluders)
              let ao = 0;
              if (ca === 1) {
                const s1 = clsOf(vox[b - stU]) === 1 ? 1 : 0, s2 = clsOf(vox[b + stU]) === 1 ? 1 : 0;
                const t1 = clsOf(vox[b - stV]) === 1 ? 1 : 0, t2 = clsOf(vox[b + stV]) === 1 ? 1 : 0;
                const c00 = clsOf(vox[b - stU - stV]) === 1 ? 1 : 0, c10 = clsOf(vox[b + stU - stV]) === 1 ? 1 : 0;
                const c11 = clsOf(vox[b + stU + stV]) === 1 ? 1 : 0, c01 = clsOf(vox[b - stU + stV]) === 1 ? 1 : 0;
                const a0 = s1 && t1 ? 3 : s1 + t1 + c00;
                const a1 = s2 && t1 ? 3 : s2 + t1 + c10;
                const a2 = s2 && t2 ? 3 : s2 + t2 + c11;
                const a3 = s1 && t2 ? 3 : s1 + t2 + c01;
                ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
              }
              mask[mi] = ma | (ao << 8) | (noMerge[ma] ? (1 << 20) : 0);
              any = true;
            }
          }
          if (!any) continue;
          // greedy
          for (let iv = 0; iv < sv; iv++) {
            for (let iu = 0; iu < su;) {
              const k = mask[iu + iv * su];
              if (!k) { iu++; continue; }
              let w = 1, h = 1;
              if (!(k & (1 << 20))) {
                while (iu + w < su && mask[iu + w + iv * su] === k) w++;
                outer: while (iv + h < sv) {
                  for (let q = 0; q < w; q++) if (mask[iu + q + (iv + h) * su] !== k) break outer;
                  h++;
                }
              }
              for (let hv = 0; hv < h; hv++) for (let q = 0; q < w; q++) mask[iu + q + (iv + hv) * su] = 0;
              // emit quad
              const m = k & 255, ao = (k >> 8) & 255;
              const ca = cls[m];
              const out = ca === 1 ? outs.op : ca === 2 ? outs.gl : outs.wa;
              if (out) {
                if (out.n >= out.cap) out.grow();
                const q = out.n++;
                const plane = base[d] + c + (sgn > 0 ? 1 : 0);
                const u0 = base[u] + iu, v0 = base[v] + iv;
                const P0 = q * 12, D0 = q * 16;
                const cu = [u0, u0 + w, u0 + w, u0], cv = [v0, v0, v0 + h, v0 + h];
                // smooth normal from source voxel (only for noMerge single voxels)
                let snx = NRM[nIdx][0], sny = NRM[nIdx][1], snz = NRM[nIdx][2];
                const vxw = [0, 0, 0];
                vxw[d] = base[d] + c; vxw[u] = u0; vxw[v] = v0;
                if (k & (1 << 20)) {
                  if (world.getN(vxw[0], vxw[1], vxw[2], tmpN)) {
                    let dd = tmpN[0] * snx + tmpN[1] * sny + tmpN[2] * snz;
                    const sg = dd >= 0 ? 1 : -1;
                    let ax = tmpN[0] * sg + snx * 0.35, ay = tmpN[1] * sg + sny * 0.35, az = tmpN[2] * sg + snz * 0.35;
                    const l = Math.hypot(ax, ay, az) || 1;
                    snx = ax / l; sny = ay / l; snz = az / l;
                  }
                }
                let fl = null;
                if (out.flow) fl = world.getFlow(vxw[0], vxw[1], vxw[2]);
                const sc = world.size;
                for (let j = 0; j < 4; j++) {
                  vtx[d] = plane; vtx[u] = cu[j]; vtx[v] = cv[j];
                  out.pos[P0 + j * 3] = vtx[0]; out.pos[P0 + j * 3 + 1] = vtx[1]; out.pos[P0 + j * 3 + 2] = vtx[2];
                  out.dat[D0 + j * 4] = m;
                  out.dat[D0 + j * 4 + 1] = (ao >> (j * 2)) & 3;
                  out.dat[D0 + j * 4 + 2] = nIdx;
                  out.dat[D0 + j * 4 + 3] = 0;
                  out.sn[D0 + j * 4] = Math.round(snx * 127); out.sn[D0 + j * 4 + 1] = Math.round(sny * 127); out.sn[D0 + j * 4 + 2] = Math.round(snz * 127);
                  if (out.flow) {
                    if (fl) {
                      const ex = (vtx[0] - vxw[0] - 0.5) * sc, ey = (vtx[1] - vxw[1] - 0.5) * sc, ez = (vtx[2] - vxw[2] - 0.5) * sc;
                      out.flow[q * 4 + j] = fl[0] + (ex * fl[2] + ey * fl[3] + ez * fl[4]) / fl[1];
                    } else out.flow[q * 4 + j] = -1;
                  }
                }
                // winding & AO-diagonal flip
                const a0 = ao & 3, a1 = (ao >> 2) & 3, a2 = (ao >> 4) & 3, a3 = (ao >> 6) & 3;
                const flipAO = a0 + a2 > a1 + a3;
                if (sgn > 0) out.flip[q] = flipAO ? 1 : 0;
                else {
                  // reverse winding: swap vertex 1 and 3
                  for (let e = 0; e < 3; e++) { const t = out.pos[P0 + 3 + e]; out.pos[P0 + 3 + e] = out.pos[P0 + 9 + e]; out.pos[P0 + 9 + e] = t; }
                  for (let e = 0; e < 4; e++) {
                    let t = out.dat[D0 + 4 + e]; out.dat[D0 + 4 + e] = out.dat[D0 + 12 + e]; out.dat[D0 + 12 + e] = t;
                    t = out.sn[D0 + 4 + e]; out.sn[D0 + 4 + e] = out.sn[D0 + 12 + e]; out.sn[D0 + 12 + e] = t;
                  }
                  if (out.flow) { const t = out.flow[q * 4 + 1]; out.flow[q * 4 + 1] = out.flow[q * 4 + 3]; out.flow[q * 4 + 3] = t; }
                  out.flip[q] = flipAO ? 1 : 0;
                }
                faces++;
              }
              iu += w;
            }
          }
        }
      }
    }
    return faces;
  };

  /* -------- mesh a whole world (+terrain) into tiles of tileVox columns -------- */
  P.meshWorld = function (world, terrain, opts) {
    const tileVox = opts.tile || 128; // tile footprint in voxels
    const reg = opts.region || 32;
    // collect candidate regions
    const tiles = new Map(); // tile key -> {op,gl,wa}
    let xMin, xMax, zMin, zMax;
    const b = world.chunks.size ? world.bounds() : [0, 0, 0, 0, 0, 0];
    if (terrain) {
      xMin = Math.min(terrain.x0, b[0]); zMin = Math.min(terrain.z0, b[2]);
      xMax = Math.max(terrain.x0 + terrain.W, b[3]); zMax = Math.max(terrain.z0 + terrain.D, b[5]);
    } else { xMin = b[0]; zMin = b[2]; xMax = b[3]; zMax = b[5]; }
    const xLo = xMin, xHi = xMax, zLo = zMin, zHi = zMax;
    xMin = Math.floor(xMin / reg) * reg; zMin = Math.floor(zMin / reg) * reg;
    let faces = 0;
    for (let rz0 = zMin; rz0 < zMax; rz0 += reg) {
      for (let rx0 = xMin; rx0 < xMax; rx0 += reg) {
        const rx = Math.max(rx0, xLo), rz = Math.max(rz0, zLo);
        const regX = Math.min(rx0 + reg, xHi) - rx, regZ = Math.min(rz0 + reg, zHi) - rz;
        if (regX <= 0 || regZ <= 0) continue;
        // vertical range
        let yLo = 1e9, yHi = -1e9;
        if (terrain) {
          let hmin = 1e9, hmax = -1e9;
          for (let z = rz - 1; z <= rz + regZ; z++) for (let x = rx - 1; x <= rx + regX; x++) {
            const h = terrain.h(x, z);
            if (h < hmin) hmin = h; if (h > hmax) hmax = h;
          }
          yLo = hmin - 1; yHi = hmax + 1;
        }
        // explicit chunk ranges
        for (let cz = rz >> 4; cz <= (rz + regZ - 1) >> 4; cz++) for (let cx = rx >> 4; cx <= (rx + regX - 1) >> 4; cx++) {
          const r = world.cols.get(cx * 8192 + cz);
          if (r) { yLo = Math.min(yLo, r[0] * 16 - 1); yHi = Math.max(yHi, r[1] * 16 + 17); }
        }
        if (yLo > yHi) continue;
        const tk = opts.single ? 'all' : Math.floor(rx / tileVox) + ',' + Math.floor(rz / tileVox);
        let t = tiles.get(tk);
        if (!t) {
          t = { op: new QuadBuf(false), gl: new QuadBuf(false), wa: new QuadBuf(true), tx: Math.floor(rx / tileVox), tz: Math.floor(rz / tileVox) };
          tiles.set(tk, t);
        }
        // split vertically into 32-high boxes, skipping empty ones
        const tH = terrain ? (() => { let lo = 1e9, hi = -1e9; for (let z = rz - 1; z <= rz + regZ; z++) for (let x = rx - 1; x <= rx + regX; x++) { const h = terrain.h(x, z); if (h < lo) lo = h; if (h > hi) hi = h; } return [lo, hi]; })() : null;
        for (let y0 = yLo; y0 < yHi; y0 += 32) {
          const sy = Math.min(32, yHi - y0);
          let need = false;
          if (tH && y0 <= tH[1] && y0 + sy >= tH[0] - 1) need = true;
          if (!need) {
            for (let cy = (y0 - 1) >> 4; cy <= (y0 + sy) >> 4 && !need; cy++)
              for (let cz = (rz - 1) >> 4; cz <= (rz + regZ) >> 4 && !need; cz++)
                for (let cx = (rx - 1) >> 4; cx <= (rx + regX) >> 4; cx++)
                  if (world.chunks.has(ckey(cx, cy, cz))) { need = true; break; }
          }
          if (!need) continue;
          faces += P.meshBox(world, terrain, rx, y0, rz, regX, sy, regZ, t, opts.coarseOcc);
        }
      }
    }
    return { tiles, faces };
  };
})();
