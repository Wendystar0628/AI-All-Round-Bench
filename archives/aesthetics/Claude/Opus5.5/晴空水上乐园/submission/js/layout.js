'use strict';
/* ==========================================================================
   Layout + terrain heightfield (ground, mountain, pools, river, coast)
   Coordinates: metres. x = east(+) / west(-), z = south(+, front) / north(-, back)
   ========================================================================== */
(function () {
  const P = window.P, V = P.V, M = P.M;
  const sm = P.smooth, clamp = P.clamp;

  /* ---------------------------------------------------------------- SDF helpers */
  const sdBox = (P.sdBox = (x, z, cx, cz, hx, hz) => {
    const dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz;
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  });
  const sdRBox = (P.sdRBox = (x, z, cx, cz, hx, hz, r) => sdBox(x, z, cx, cz, hx - r, hz - r) - r);
  const sdCircle = (P.sdCircle = (x, z, cx, cz, r) => Math.hypot(x - cx, z - cz) - r);
  P.sdEllipse = (x, z, cx, cz, rx, rz) => (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);

  /* ---------------------------------------------------------------- 2D polyline with nearest queries */
  class Path2 {
    constructor(pts, closed) {
      // pts: [[x,z],...] densely sampled
      this.closed = !!closed;
      const n = pts.length;
      this.x = new Float32Array(n); this.z = new Float32Array(n); this.s = new Float32Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) {
        this.x[i] = pts[i][0]; this.z[i] = pts[i][1];
        if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        this.s[i] = s;
      }
      this.len = s + (closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0);
      this.n = n;
      // grid
      this.cell = 4;
      this.grid = new Map();
      for (let i = 0; i < n; i++) {
        const k = Math.floor(this.x[i] / this.cell) + ',' + Math.floor(this.z[i] / this.cell);
        let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(i);
      }
    }
    // nearest: returns {d, s, i, side} (side: +1 = left of travel direction)
    nearest(x, z, maxR) {
      const c = this.cell, R = Math.ceil((maxR || 8) / c);
      const gx = Math.floor(x / c), gz = Math.floor(z / c);
      let best = 1e9, bi = -1;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        const arr = this.grid.get((gx + a) + ',' + (gz + b));
        if (!arr) continue;
        for (const i of arr) {
          const d = (this.x[i] - x) * (this.x[i] - x) + (this.z[i] - z) * (this.z[i] - z);
          if (d < best) { best = d; bi = i; }
        }
      }
      if (bi < 0) return null;
      // refine on adjacent segments
      let bd = Math.sqrt(best), bs = this.s[bi], side = 0;
      const tryseg = (i0, i1, sOff) => {
        const ax = this.x[i0], az = this.z[i0], bx = this.x[i1], bz = this.z[i1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
        let t = ((x - ax) * dx + (z - az) * dz) / L2; t = clamp(t, 0, 1);
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d <= bd + 1e-6) {
          bd = d; bs = this.s[i0] + Math.sqrt(L2) * t + sOff;
          side = (dx * (z - az) - dz * (x - ax)) > 0 ? -1 : 1;
        }
      };
      const n = this.n;
      if (bi > 0) tryseg(bi - 1, bi, 0); else if (this.closed) tryseg(n - 1, 0, 0);
      if (bi < n - 1) tryseg(bi, bi + 1, 0); else if (this.closed) tryseg(n - 1, 0, 0);
      return { d: bd, s: bs, i: bi, side };
    }
    at(s) { // point & tangent at arc length s
      const L = this.len;
      if (this.closed) { s = ((s % L) + L) % L; } else s = clamp(s, 0, this.s[this.n - 1]);
      // binary search
      let lo = 0, hi = this.n - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.s[mid] <= s) lo = mid; else hi = mid - 1; }
      const i0 = lo, i1 = lo + 1 < this.n ? lo + 1 : (this.closed ? 0 : lo);
      const s0 = this.s[i0], s1 = i1 === 0 ? L : this.s[i1];
      const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      const x = this.x[i0] + (this.x[i1] - this.x[i0]) * t, z = this.z[i0] + (this.z[i1] - this.z[i0]) * t;
      let tx = this.x[i1] - this.x[i0], tz = this.z[i1] - this.z[i0];
      const l = Math.hypot(tx, tz) || 1;
      return { x, z, tx: tx / l, tz: tz / l };
    }
  }
  P.Path2 = Path2;
  // build a dense polyline from control points (Catmull-Rom), step in metres
  P.spline2 = function (ctrl, step, closed) {
    const out = [];
    const n = ctrl.length;
    const get = (i) => closed ? ctrl[(i + n) % n] : ctrl[clamp(i, 0, n - 1)];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(2, Math.ceil(L / step));
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    if (!closed) out.push([ctrl[n - 1][0], ctrl[n - 1][1]]);
    return out;
  };

  /* ---------------------------------------------------------------- layout constants */
  const L = (P.L = {
    frontY: 1.0,
    seaY: -1.5,
    wave: { ax: 0, az: -64, half: 30 * P.deg, backZ: -31, level: -0.1 },
    river: { level: -0.5, bed: -1.5, half: 3.5, x0: -150, x1: 150, z0: -54, z1: 58, R: 22 },
    tunnel: { x0: -97, x1: -71, ceil: 3.2 },
    act: { cx: -112, cz: 24, hx: 22, hz: 13, level: -0.1 },
    spa: { cx: -114, cz: -18 },
    surf: { cx: 112, cz: 20 },
    coast: { z: -128, x: 178 },
    tower: { x: 0, z: -97, base: 14, top: 38, mid: 30, low: 22 },
    xtower: { x: -122, z: -94, base: 10, top: 28, mid: 20 },
    ftower: { x: 116, z: -93, base: 7, top: 19, mid: 13 },
  });

  /* ---------------------------------------------------------------- terrain grid */
  const T = (P.terrain = new P.Terrain(-784, -600, 1568, 1600));
  const W = T.W, Dd = T.D;
  const hm = (P.hm = new Float32Array(W * Dd));
  const WL = (P.waterLevel = new Float32Array(W * Dd).fill(-100));
  const WID = (P.waterId = new Uint8Array(W * Dd)); // water body id
  const ZONE = (P.zone = new Uint8Array(W * Dd));
  T.defaultH = 0; T.defaultTop = M.grass;
  const ST = (P.ST = {});
  ST.grass = T.addStyle([M.dirt]);
  ST.rock = T.addStyle([M.rock, M.rock2, M.rock, M.rock3, M.rock, M.rock2, M.rockDk, M.rock, M.rock3, M.rock2]);
  ST.cave = T.addStyle([M.caveRock, M.caveRock2, M.caveRock]);
  ST.pool = T.addStyle([M.mosaic, M.mosaic2, M.tile, M.tile2]);
  ST.poolDeep = T.addStyle([M.mosaic, M.mosaic2, M.tile]);
  ST.river = T.addStyle([M.tileBlue, M.tileBlue, M.riverBed]);
  ST.riverRock = T.addStyle([M.rock3, M.rock, M.rock2, M.riverBed]);
  ST.sand = T.addStyle([M.sand2]);
  ST.white = T.addStyle([M.white2, M.white]);
  ST.pave = T.addStyle([M.paveEdge, M.concrete]);
  ST.wood = T.addStyle([M.woodDk, M.concrete]);
  ST.coast = T.addStyle([M.sand2, M.sand2, M.rock2]);
  T.defaultSide = ST.grass;

  const ix0 = T.x0, iz0 = T.z0;
  const colX = (i) => (i + ix0 + 0.5) * V;
  const colZ = (j) => (j + iz0 + 0.5) * V;
  P.colIndex = (x, z) => {
    const i = Math.floor(x / V) - ix0, j = Math.floor(z / V) - iz0;
    return i < 0 || j < 0 || i >= W || j >= Dd ? -1 : i + j * W;
  };
  // iterate columns in a metre bbox
  const each = (P.eachCol = function (x0, z0, x1, z1, fn) {
    const a = Math.max(0, Math.floor(x0 / V) - ix0), b = Math.min(W, Math.ceil(x1 / V) - ix0);
    const c = Math.max(0, Math.floor(z0 / V) - iz0), d = Math.min(Dd, Math.ceil(z1 / V) - iz0);
    for (let j = c; j < d; j++) {
      const z = colZ(j);
      for (let i = a; i < b; i++) fn(i + j * W, colX(i), z);
    }
  });
  P.groundY = function (x, z) { const k = P.colIndex(x, z); return k < 0 ? 0 : T.H[k] * V; };

  /* ---------------------------------------------------------------- river centerline */
  function buildRiver() {
    const R = L.river;
    const pts = [];
    const step = 0.25;
    const segLine = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / step);
      for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
    };
    const arc = (cx, cz, a0, a1) => {
      const len = Math.abs(a1 - a0) * R.R, n = Math.round(len / step);
      for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * R.R, cz + Math.sin(a) * R.R]); }
    };
    const xr = R.x1 - R.R, xl = R.x0 + R.R, zf = R.z1 - R.R, zb = R.z0 + R.R;
    segLine(0, R.z1, xr, R.z1);
    arc(xr, zf, Math.PI / 2, 0);
    segLine(R.x1, zf, R.x1, zb);
    arc(xr, zb, 0, -Math.PI / 2);
    segLine(xr, R.z0, xl, R.z0);
    arc(xl, zb, -Math.PI / 2, -Math.PI);
    segLine(R.x0, zb, R.x0, zf);
    arc(xl, zf, Math.PI, Math.PI / 2);
    segLine(xl, R.z1, 0, R.z1);
    // gentle meander away from bridges / tunnel / docks
    const out = [];
    const n = pts.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const tx = q[0] - p[0], tz = q[1] - p[1], l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      let amp = 1.3;
      const x = p[0], z = p[1];
      // calm zones
      const calm = [
        [0, 58, 18], [100, 58, 12], [-100, 58, 12], [-84, -54, 22], [150, 4, 10], [-150, 4, 10], [0, -54, 18],
        [-45, -54, 10], [70, -54, 10], [28, 58, 14], [110, -54, 12],
      ];
      for (const c of calm) { const d = Math.hypot(x - c[0], z - c[1]); amp *= sm(c[2] * 0.6, c[2] + 8, d); }
      // corners: no meander
      if (Math.abs(x) > 126 && Math.abs(z - 2) > 30) amp *= 0.0;
      const off = amp * Math.sin(s / 11.5) * Math.sin(s / 31 + 1.3);
      out.push([x + nx * off, z + nz * off]);
      s += step;
    }
    P.river = new Path2(out, true);
  }
  buildRiver();

  /* ---------------------------------------------------------------- wave pool helpers */
  P.fan = function (x, z) {
    const w = L.wave;
    const dx = x - w.ax, dz = z - w.az;
    return { r: Math.hypot(dx, dz), th: Math.atan2(dx, dz) };
  };
  // floor profile of the wave pool / beach as a function of radius
  P.waveFloor = function (r) {
    if (r < 50) return -2.4;
    if (r < 90) return -2.4 + (r - 50) * 0.06;
    if (r < 100) return (r - 90) * 0.025;
    return 0.25;
  };

  /* ---------------------------------------------------------------- mountain */
  function footLine(x) {
    // z of mountain foot (front edge)
    const a = sm(-110, -96, x); // 0 west of -110 -> 1
    const b = sm(60, 76, x);
    let z = -72 + (-63 + 72) * a; // -72 west, -63 centre
    z = z + (-67 + 63) * b; // -67 east
    z += (P.fbm2(x * 0.06, 3.3, 3) - 0.5) * 3.0;
    return z;
  }
  P.footLine = footLine;
  function mountainH(x, z) {
    if (z > -40 || Math.abs(x) > 175) return 0;
    const n1 = (P.fbm2(x * 0.05 + 11, z * 0.05 - 7, 3) - 0.5);
    const n2 = (P.fbm2(x * 0.11 - 3, z * 0.11 + 5, 2) - 0.5);
    let h = 0;
    const side = 168 - Math.abs(x);
    // T1 body
    const foot = footLine(x);
    let d1 = Math.min(foot - z + n1 * 3, side + n2 * 4);
    const soft1 = x > 70 ? 7 : 1.1;
    h = Math.max(h, 4.5 * sm(0, soft1, d1));
    // spur over tunnel
    const ds = -sdRBox(x, z, -84, -55, 13.5, 10, 3) + n2 * 1.5;
    h = Math.max(h, 7.0 * sm(0, 1.0, ds));
    // T2
    const d2 = Math.min(-71.5 - z + n1 * 3.5, x + 74 + n2 * 4, 58 - x + n2 * 4);
    h = Math.max(h, 9.0 * sm(0, 1.2, d2) * sm(-2, 4, d1));
    // T3 summit
    const d3 = -P.sdEllipse(x, z, 0, -98, 25, 16) + n1 * 3;
    h = Math.max(h, 14 * sm(0, 1.3, d3));
    // left wing: mid terrace + plateau
    const dl1 = -P.sdEllipse(x, z, -120, -88, 44, 21) + n1 * 3;
    h = Math.max(h, 7.0 * sm(0, 1.2, dl1));
    const dl2 = -P.sdEllipse(x, z, -121, -96, 30, 16) + n2 * 3;
    h = Math.max(h, 10.0 * sm(0, 1.2, dl2));
    // right wing gentle hill
    const dr = -P.sdEllipse(x, z, 114, -95, 44, 25) + n1 * 4;
    h = Math.max(h, 7.0 * sm(0, 13, dr));
    // back falloff toward the coast
    h *= sm(-124.5, -114, z);
    return h;
  }
  P.mountainH = mountainH;

  /* ---------------------------------------------------------------- base heights */
  function baseHeights() {
    const R = L.river;
    for (let j = 0; j < Dd; j++) {
      const z = colZ(j);
      for (let i = 0; i < W; i++) {
        const x = colX(i);
        const k = i + j * W;
        let h = 0;
        // front row
        if (z > 61.5) h = L.frontY;
        if (Math.abs(x) > 128 && z > 30 && z <= 66) h = L.frontY * clamp((z - 30) / 34, 0, 1);
        if (Math.abs(x) > 128 && z > 66) h = L.frontY;
        // avenue slopes down south of the park
        if (z > 150) h = L.frontY * (1 - sm(150, 240, z));
        // outside west: level 0 with gentle undulation
        if (x < -172) { const t = sm(-180, -172, x); h = h * t + (1 - t) * (0.0 + (P.fbm2(x * 0.02, z * 0.02, 2) - 0.5) * 1.2 * sm(-178, -196, x)); }
        // mountain
        const mh = mountainH(x, z);
        if (mh > h) h = mh;
        // coast (north & east): signed distance to land
        let dl = Math.min(z - L.coast.z, L.coast.x - x);
        // rounded NE corner
        if (z < L.coast.z + 20 && x > L.coast.x - 20) dl = 20 - Math.hypot(x - (L.coast.x - 20), z - (L.coast.z + 20));
        if (x < -172) dl = Math.max(dl, z - (L.coast.z - 40) + (x + 172) * 0.6);
        if (dl < 0) {
          const d = -dl;
          const beach = d < 7 ? -1.75 * d / 7 : -1.75 - Math.min(2.6, (d - 7) * 0.32);
          h = Math.min(h, beach);
        }
        hm[k] = h;
        ZONE[k] = 0;
      }
    }
  }

  /* ---------------------------------------------------------------- materials pass for natural ground */
  function naturalMaterials() {
    const H = T.H;
    for (let j = 0; j < Dd; j++) {
      const z = colZ(j);
      for (let i = 0; i < W; i++) {
        const k = i + j * W;
        H[k] = Math.round(hm[k] / V);
      }
    }
    for (let j = 0; j < Dd; j++) {
      const z = colZ(j);
      for (let i = 0; i < W; i++) {
        const x = colX(i);
        const k = i + j * W;
        const h = H[k];
        const kl = i > 0 ? k - 1 : k, kr = i < W - 1 ? k + 1 : k, ku = j > 0 ? k - W : k, kd = j < Dd - 1 ? k + W : k;
        const sl = Math.max(Math.abs(h - H[kl]), Math.abs(h - H[kr]), Math.abs(h - H[ku]), Math.abs(h - H[kd]));
        const n = P.fbm2(x * 0.15, z * 0.15, 2);
        const nb = P.noise2(x * 0.5, z * 0.5);
        let top = n < 0.4 ? M.grass2 : n > 0.62 ? M.grass3 : M.grass;
        let side = ST.grass;
        const mtn = z < -40 && h > 0;
        if (mtn) {
          side = ST.rock;
          // count drop below this column (cliff edge) -> rock
          if (sl >= 3) top = nb < 0.33 ? M.rock2 : nb > 0.7 ? M.rock3 : M.rock;
          else if (sl >= 1 && nb > 0.72) top = M.rock3;
          else top = n < 0.45 ? M.grassDk : n > 0.62 ? M.grass3 : M.grass2;
          if (P.noise2(x * 0.09 + 40, z * 0.09) > 0.78 && sl < 3) top = M.rock3;
        }
        if (h < 0 || (hm[k] <= 0.01 && (z < L.coast.z + 4 || x > L.coast.x - 6))) {
          top = h < -2 ? M.sand2 : M.sand; side = ST.coast;
        }
        // coastal strip outside the fence: sand
        if ((z < -123.5 || x > 172) && h >= 0 && !mtn) { top = nb > 0.6 ? M.sand2 : M.sand; side = ST.sand; }
        T.top[k] = top; T.side[k] = side;
      }
    }
  }

  /* ---------------------------------------------------------------- painters */
  const setTop = (k, m, st) => { T.top[k] = m; if (st != null) T.side[k] = st; };
  P.paintPoly = function (path, half, fn) { // fn(k,x,z,d,s)
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < path.n; i++) { x0 = Math.min(x0, path.x[i]); x1 = Math.max(x1, path.x[i]); z0 = Math.min(z0, path.z[i]); z1 = Math.max(z1, path.z[i]); }
    each(x0 - half - 1, z0 - half - 1, x1 + half + 1, z1 + half + 1, (k, x, z) => {
      const q = path.nearest(x, z, half + 4);
      if (q && q.d <= half) fn(k, x, z, q.d, q.s, q.side);
    });
  };
  P.pathPaint = function (ctrl, width, mat, opts) {
    opts = opts || {};
    const path = new Path2(P.spline2(ctrl, 0.5, false), false);
    P.paintPoly(path, width / 2 + (opts.edge ? 0.25 : 0), (k, x, z, d) => {
      if (opts.keep && opts.keep(k)) return;
      const edge = opts.edge && d > width / 2 - 0.25;
      T.top[k] = edge ? opts.edge : (typeof mat === 'function' ? mat(x, z, d) : mat);
      T.side[k] = ST.pave;
      if (opts.y != null) T.H[k] = Math.round(opts.y / V);
    });
    return path;
  };

  // generic pool carving. sd(x,z): <0 inside. floor(x,z): metres. opts: level, rim, deck, deckMat, floorMat, wall
  const pools = (P.pools = []);
  P.carvePool = function (name, bbox, sd, floor, opts) {
    const id = pools.length + 1;
    const pool = { id, name, level: opts.level, bbox, sd, kind: opts.kind || 'flat', cells: 0 };
    pools.push(pool);
    const rim = opts.rim != null ? opts.rim : 0.5;
    const deck = opts.deck || 0;
    const deckY = opts.deckY;
    each(bbox[0] - rim - deck - 1, bbox[1] - rim - deck - 1, bbox[2] + rim + deck + 1, bbox[3] + rim + deck + 1, (k, x, z) => {
      const d = sd(x, z);
      if (d < 0) {
        const f = floor(x, z, d);
        T.H[k] = Math.round(f / V);
        T.top[k] = typeof opts.floorMat === 'function' ? opts.floorMat(x, z, d, f) : opts.floorMat || M.poolFloor;
        T.side[k] = opts.wall || ST.pool;
        if (T.H[k] * V < opts.level) { WL[k] = opts.level; WID[k] = id; pool.cells++; }
        else if (opts.wetDry) T.top[k] = opts.wetDry;
      } else if (d < rim) {
        if (deckY != null) T.H[k] = Math.round(deckY / V);
        if (!opts.noRim) { T.top[k] = opts.rimMat || M.coping; T.side[k] = opts.wall || ST.pool; }
      } else if (d < rim + deck) {
        if (deckY != null) T.H[k] = Math.round(deckY / V);
        T.top[k] = typeof opts.deckMat === 'function' ? opts.deckMat(x, z, d) : opts.deckMat || M.tile;
        T.side[k] = ST.white;
      }
    });
    return pool;
  };

  /* ---------------------------------------------------------------- the big build */
  P.buildTerrain = function () {
    baseHeights();
    naturalMaterials();
    const H = T.H;

    /* ---- front row: plaza, kids, food zones get surface materials (heights at frontY) */
    const fy = Math.round(L.frontY / V);
    // promenade along the outer side of the south river segment
    each(-160, 61, 160, 67, (k, x, z) => {
      if (z > 61.5 && z < 66.5 && Math.abs(x) < 130) { H[k] = fy; T.top[k] = (Math.floor(x / 2) & 1) ? M.pave : M.pave2; T.side[k] = ST.white; }
    });
    // plaza
    each(-46, 66, 46, 121, (k, x, z) => {
      H[k] = fy;
      const dx = x, dz = z - 88;
      const r = Math.hypot(dx, dz);
      let m = M.plaza;
      // big ring pattern
      if (r > 15 && r < 16.5) m = M.plazaSky;
      else if (r > 17.5 && r < 18.25) m = M.plazaBlue;
      else if (r > 25 && r < 26) m = M.plazaLemon;
      else if (r < 13) m = (Math.floor(r / 1.5) & 1) ? M.plazaBlue : M.plaza;
      // waves bands toward the gate
      const wv = Math.sin(x * 0.28) * 1.6;
      if (z > 100 && z < 112) {
        const b = (z + wv - 100) / 3;
        const f = b - Math.floor(b);
        if (f < 0.18) m = M.plazaSky; else if (f > 0.5 && f < 0.6) m = M.plazaBlue;
      }
      if (z > 66 && z < 74) {
        const b = (z - wv - 66) / 2.6, f = b - Math.floor(b);
        if (f < 0.16) m = M.plazaBlue;
      }
      // checker border
      if (Math.abs(x) > 43.5) m = ((Math.floor(z / 1) + Math.floor(x / 1)) & 1) ? M.plazaLemon : M.plaza;
      T.top[k] = m; T.side[k] = ST.white;
    });
    // forecourt outside gate & avenue
    each(-60, 118, 60, 250, (k, x, z) => {
      const ax = Math.abs(x);
      if (z < 142 && ax < 44) {
        const r = Math.hypot(x, z - 132);
        T.top[k] = r < 7 ? M.grass3 : (r < 7.5 ? M.coping : ((Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1 ? M.pave : M.pave2));
        T.side[k] = ST.pave;
      } else if (ax < 7) { T.top[k] = (ax < 0.15 && (Math.floor(z / 3) & 1)) ? M.roadLine : M.road; T.side[k] = ST.pave; }
      else if (ax < 7.5) { T.top[k] = M.coping; T.side[k] = ST.pave; }
      else if (ax < 12) { T.top[k] = ((Math.floor(z / 1)) & 1) ? M.pave : M.pave2; T.side[k] = ST.pave; }
    });
    // kids area soft floor
    each(-166, 67, -50, 121, (k, x, z) => {
      if (z < 66.5) return;
      const n = P.noise2(x * 0.08, z * 0.08);
      const d = Math.hypot(x + 108, z - 92);
      let m = null;
      if (d < 34) {
        const band = Math.floor((d + Math.sin(Math.atan2(z - 92, x + 108) * 6) * 1.2) / 3.2) % 4;
        m = [M.soft1, M.soft4, M.soft2, M.soft3][(band + 4) % 4];
      } else if (x > -58 || z > 112 || x < -160) m = (Math.floor(x / 2) + Math.floor(z / 2)) & 1 ? M.pave : M.pave2;
      if (m) { H[k] = fy; T.top[k] = m; T.side[k] = ST.white; }
      else { H[k] = fy; T.top[k] = n > 0.55 ? M.grass3 : M.grass; }
    });
    // food street paving
    each(50, 67, 166, 121, (k, x, z) => {
      H[k] = fy;
      if (x > 92 && x < 120 && z > 70) T.top[k] = (Math.floor(x / 1.5) + Math.floor(z / 1.5)) & 1 ? M.plazaLemon : M.plaza;
      else if (z < 82 && x > 74 && x < 140) T.top[k] = M.wood;
      else if (x < 60 || z > 114) T.top[k] = (Math.floor(x / 2) + Math.floor(z / 2)) & 1 ? M.pave : M.pave2;
      T.side[k] = ST.white;
    });

    /* ---- middle row paths */
    const keepWater = (k) => WL[k] > -50;
    P.pathPaint([[0, 53], [0, 46]], 10, M.pave, { edge: M.paveEdge });
    // inner promenade along the beach front
    P.pathPaint([[-128, 52.2], [-60, 51], [0, 50], [60, 51], [128, 52.2]], 4, (x, z) => ((Math.floor(x / 2)) & 1 ? M.pave : M.pave2), { edge: M.paveEdge });
    // to activity / spa zone
    P.pathPaint([[-70, 50], [-80, 44], [-86, 20], [-88, -2], [-92, -30], [-100, -44]], 3.5, M.pave2, { edge: M.paveEdge });
    // to surf / coaster zone
    P.pathPaint([[70, 50], [82, 44], [88, 20], [92, -2], [96, -30], [100, -44]], 3.5, M.pave2, { edge: M.paveEdge });
    // behind wave house (between splash pools)
    P.pathPaint([[-100, -46], [-60, -49], [0, -47], [60, -49], [100, -46]], 3, M.pave, { edge: M.paveEdge });
    // loop path outside river (east, west, north/back path)
    {
      const R = L.river;
      P.paintPoly(P.river, 8.2, (k, x, z, d, s, side) => {
        if (d > 3.5 && d <= 8.0 && side < 0) { // outside of loop: side=-1 means right of travel (outer for ccw?)
          if (z > 61.5 && Math.abs(x) < 130) return; // already promenade
          T.top[k] = ((Math.floor(s / 2)) & 1) ? M.pave : M.pave2; T.side[k] = ST.pave;
          if (d > 7.7) T.top[k] = M.paveEdge;
          if (z < -40 && H[k] > 0 && Math.abs(x + 84) > 16) H[k] = 0;
        }
      });
    }

    /* ---- river channel */
    {
      const R = L.river, lv = R.level;
      const id = pools.length + 1;
      const pool = { id, name: 'river', level: lv, kind: 'river', cells: 0 };
      pools.push(pool);
      P.paintPoly(P.river, 5.2, (k, x, z, d, s, side) => {
        const inTunnel = z < -45 && x > L.tunnel.x0 - 1 && x < L.tunnel.x1 + 1;
        if (d < R.half) {
          let bed = R.bed;
          if (d > R.half - 0.6) bed += 0.25;
          if (inTunnel) {
            // do not lower terrain column (keep the spur), carve explicitly later
            WL[k] = lv; WID[k] = id; pool.cells++;
            return;
          }
          H[k] = Math.round(bed / V);
          T.top[k] = M.riverBed; T.side[k] = ST.river;
          WL[k] = lv; WID[k] = id; pool.cells++;
        } else if (d < R.half + 0.75) {
          if (inTunnel) return;
          // coping edge
          T.top[k] = M.coping; T.side[k] = ST.river;
        }
      });
    }

    /* ---- wave pool + beach */
    {
      const w = L.wave;
      const id = pools.length + 1;
      const pool = { id, name: 'wave', level: w.level, kind: 'wave', cells: 0 };
      pools.push(pool);
      each(-75, -42, 75, 50, (k, x, z) => {
        const f = P.fan(x, z);
        const ath = Math.abs(f.th);
        const inFan = ath <= w.half && z >= w.backZ;
        if (inFan && f.r < 112) {
          const fl = P.waveFloor(f.r);
          H[k] = Math.round(fl / V);
          const deep = fl < -0.7;
          if (fl < -1.0) T.top[k] = (Math.floor(f.r / 6) & 1) ? M.poolFloor : M.poolFloor2;
          else if (fl < -0.4) T.top[k] = M.sandWet;
          else T.top[k] = fl < 0.05 ? M.sandWet : (P.noise2(x * 0.7, z * 0.7) > 0.55 ? M.sand2 : M.sand);
          T.side[k] = deep ? ST.pool : ST.sand;
          if (H[k] * V < w.level) { WL[k] = w.level; WID[k] = id; pool.cells++; }
          // lane lines on floor (buoy anchors) – decorative stripes in deep area
          if (fl < -1.2 && Math.abs(((f.th / w.half) * 3 + 3) % 2 - 1) < 0.02) T.top[k] = M.poolLine;
        } else if (f.r < 116 && z > -44 && ath < w.half + 6.5 * P.deg && f.r > 76) {
          // beach wraps around front corners
          const fl = Math.max(0, P.waveFloor(Math.max(f.r, 92)));
          H[k] = Math.round(fl / V);
          T.top[k] = P.noise2(x * 0.7, z * 0.7) > 0.55 ? M.sand2 : M.sand; T.side[k] = ST.sand;
        } else if (f.r < 116 && z > -44 && ath < w.half + 9 * P.deg) {
          // side wooden decks along pool edges
          const dEdge = (ath - w.half) * f.r;
          H[k] = 0;
          if (dEdge < 0.6) { T.top[k] = M.coping; T.side[k] = ST.pool; }
          else { T.top[k] = (Math.floor(f.r / 0.5) & 1) ? M.wood : M.wood2; T.side[k] = ST.wood; }
        }
      });
      // back wall coping
      each(-30, -33, 30, -30.5, (k, x, z) => {
        const f = P.fan(x, z);
        if (Math.abs(f.th) <= w.half + 0.02 && z < w.backZ) { H[k] = 0; T.top[k] = M.coping; T.side[k] = ST.pool; }
      });
      // promenade behind beach (sand path border)
      each(-75, 30, 75, 52, (k, x, z) => {
        const f = P.fan(x, z);
        if (f.r >= 112 && f.r < 116 && Math.abs(f.th) < w.half + 6.5 * P.deg) { T.top[k] = M.paveEdge; H[k] = 0; T.side[k] = ST.pave; }
      });
    }

    /* ---- activity pool */
    {
      const a = L.act;
      P.carvePool('activity', [a.cx - a.hx, a.cz - a.hz, a.cx + a.hx, a.cz + a.hz],
        (x, z) => sdRBox(x, z, a.cx, a.cz, a.hx, a.hz, 5),
        (x, z) => (x < a.cx - 12 ? -3.0 : -1.4),
        { level: a.level, rim: 0.75, deck: 5, deckY: 0, deckMat: (x, z) => ((Math.floor(x / 1) + Math.floor(z / 1)) & 1 ? M.tile : M.tile2),
          floorMat: (x, z) => (x < a.cx - 12 ? M.poolFloor2 : M.poolFloor) });
    }
    /* ---- splash pools & run-outs */
    P.splash = {};
    const splash = (name, cx, cz, hx, hz, depth, extra) => {
      P.splash[name] = { cx, cz, hx, hz, level: -0.1 };
      return P.carvePool(name, [cx - hx, cz - hz, cx + hx, cz + hz], (x, z) => sdRBox(x, z, cx, cz, hx, hz, 2.5),
        () => -depth, Object.assign({ level: -0.1, rim: 0.75, deck: 2.5, deckY: 0, deckMat: M.tile }, extra || {}));
    };
    splash('helix', -51, -40, 8.5, 6, 1.2);
    splash('rainbow', 31, -40, 7.5, 6.5, 1.1);
    splash('loop', 51, -39.5, 6.5, 6, 1.2);
    splash('blackhole', -118, -41.5, 7, 5.5, 1.2);
    splash('funnel', -100, -64.5, 6, 4.5, 1.2, { deck: 1.25 });
    splash('bowl', -128, -66, 7.5, 5.5, 1.6, { deck: 1.25 });
    splash('halfpipe', -150, -63.5, 6, 4.5, 1.1, { deck: 1.25 });
    splash('family', 106, -42, 10, 6.5, 0.9);
    splash('kidtube', 78, -43, 5, 5, 1.0);
    splash('waveslide', 140, -64, 6, 3.5, 0.6, { deck: 1.5 });
    splash('coaster', 128, -29, 12, 8.5, 1.1);

    /* ---- central waterfall plunge pool (in front of mountain) + T2 basin */
    P.carvePool('plunge', [-12, -71, 12, -62], (x, z) => P.sdEllipse(x, z, 0, -66.5, 11, 4.8) + (P.fbm2(x * 0.3, z * 0.3, 2) - 0.5) * 1.5,
      () => -1.0, { level: -0.3, rim: 0.6, rimMat: M.rock3, wall: ST.riverRock, floorMat: M.riverBed, noRim: false });
    P.carvePool('t2basin', [-7, -82.5, 7, -71.5], (x, z) => Math.max(P.sdEllipse(x, z, 0, -77, 5.2, 5.2) + (P.fbm2(x * 0.4, z * 0.4, 2) - 0.5), -0.1 - (z + 81.6)),
      () => 8.2, { level: 8.8, rim: 0.5, rimMat: M.rock3, wall: ST.riverRock, floorMat: M.riverBed });
    // outflow channel from plunge pool to the river (under the back-path footbridge)
    P.carvePool('outflow', [-2.6, -62.5, 2.6, -57.6], (x, z) => sdBox(x, z, 0, -60.05, 2.0, 2.45),
      () => -1.0, { level: -0.47, rim: 0.5, rimMat: M.rock3, wall: ST.riverRock, floorMat: M.riverBed, noRim: true });
    P.carvePool('t3basin', [-4, -86, 4, -82], (x, z) => P.sdEllipse(x, z, 0, -84, 3.5, 1.8),
      () => 13.5, { level: 13.85, rim: 0.4, rimMat: M.rock3, wall: ST.riverRock, floorMat: M.riverBed });
    // left wing waterfall basin and its foot pool
    P.carvePool('lwbasin', [-90, -84, -80, -78], (x, z) => P.sdEllipse(x, z, -85, -81, 4.5, 2.6),
      () => 6.4, { level: 6.8, rim: 0.4, rimMat: M.rock3, wall: ST.riverRock, floorMat: M.riverBed });

    /* ---- spa: terraced round pools on a raised wooden mound */
    {
      const s = L.spa;
      // raised mound
      each(s.cx - 30, s.cz - 22, s.cx + 30, s.cz + 22, (k, x, z) => {
        const d = P.sdEllipse(x, z, s.cx, s.cz, 26, 17);
        if (d < 0) {
          const t = -d;
          const y = Math.min(2.6, t * 0.3);
          H[k] = Math.max(H[k], Math.round(y / V));
          T.top[k] = (Math.floor(x / 0.5) & 1) ? M.wood : M.wood2; T.side[k] = ST.wood;
        }
      });
      const tiers = [
        { x: s.cx - 9, z: s.cz - 6, r: 5.2, lv: 3.45, rim: 3.75 },
        { x: s.cx + 1, z: s.cz - 1, r: 5.8, lv: 2.45, rim: 2.75 },
        { x: s.cx + 11, z: s.cz + 5, r: 6.2, lv: 1.45, rim: 1.75 },
        { x: s.cx - 3, z: s.cz + 9, r: 4.6, lv: 1.45, rim: 1.75 },
        { x: s.cx + 19, z: s.cz + 11, r: 4.0, lv: 0.25, rim: 0.5 },
      ];
      P.spaTiers = tiers;
      tiers.forEach((t, i) => {
        each(t.x - t.r - 1.2, t.z - t.r - 1.2, t.x + t.r + 1.2, t.z + t.r + 1.2, (k, x, z) => {
          const d = Math.hypot(x - t.x, z - t.z) - t.r;
          if (d < 0) {
            H[k] = Math.round((t.lv - 0.75) / V);
            T.top[k] = d > -1.0 ? M.tile2 : M.mosaic;
            T.side[k] = ST.pool;
          } else if (d < 0.75) {
            H[k] = Math.max(H[k], Math.round(t.rim / V));
            T.top[k] = M.coping; T.side[k] = ST.white;
          }
        });
        const id = pools.length + 1;
        const pool = { id, name: 'spa' + i, level: t.lv, kind: 'spa', cells: 0, cx: t.x, cz: t.z, r: t.r };
        pools.push(pool);
        each(t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r, (k, x, z) => {
          if (Math.hypot(x - t.x, z - t.z) < t.r) { WL[k] = t.lv; WID[k] = id; pool.cells++; }
        });
      });
    }

    /* ---- surf simulator: sloped riding surface in a tiled enclosure */
    {
      const s = L.surf;
      // enclosure deck
      each(s.cx - 16, s.cz - 14, s.cx + 16, s.cz + 14, (k, x, z) => {
        const dx = x - s.cx, dz = z - s.cz;
        if (Math.abs(dx) < 8.5 && dz > -11 && dz < 11) {
          // riding surface: from front (dz=+11, low) up to back lip (dz=-11)
          const u = (11 - dz) / 22; // 0 front -> 1 back
          let y = -0.5 + 2.9 * Math.pow(u, 1.8);
          if (u > 0.93) y = 2.4;
          H[k] = Math.round(y / V);
          T.top[k] = Math.abs(dx) > 7.5 ? M.tile2 : ((Math.floor(dz / 0.75)) & 1 ? M.sky : M.sky2);
          T.side[k] = ST.pool;
          if (u < 0.93) { WL[k] = y + 0.12; }
        } else if (Math.abs(dx) < 10 && dz > -12.5 && dz < 12.5) {
          H[k] = Math.round((dz < -6 ? 2.75 : dz < 6 ? 1.5 : 0.75) / V);
          T.top[k] = M.coping; T.side[k] = ST.white;
        } else {
          T.top[k] = (Math.floor(x / 1) + Math.floor(z / 1)) & 1 ? M.tile : M.tile2; T.side[k] = ST.white; H[k] = 0;
        }
      });
      // drain basin at the front
      P.carvePool('surfdrain', [s.cx - 8.5, s.cz + 11, s.cx + 8.5, s.cz + 13.5], (x, z) => sdBox(x, z, s.cx, s.cz + 12.25, 8.5, 1.25),
        () => -0.75, { level: -0.35, rim: 0.5, deck: 0 });
    }

    /* ---- kids shallow pool (front row) */
    {
      const cx = -108, cz = 92;
      const id = pools.length + 1;
      const pool = { id, name: 'kids', level: L.frontY - 0.12, kind: 'kids', cells: 0 };
      pools.push(pool);
      each(cx - 26, cz - 22, cx + 26, cz + 22, (k, x, z) => {
        const a = Math.atan2(z - cz, x - cx);
        const rr = 17 + Math.sin(a * 3 + 0.5) * 2.5 + Math.sin(a * 5) * 1.2;
        const d = Math.hypot(x - cx, z - cz) - rr;
        if (d < 0) {
          H[k] = Math.round((L.frontY - 0.5) / V);
          T.top[k] = ((Math.floor(x / 1) + Math.floor(z / 1)) & 1) ? M.poolFloor : M.tileBlue;
          T.side[k] = ST.pool;
          WL[k] = pool.level; WID[k] = id; pool.cells++;
        } else if (d < 0.75) {
          T.top[k] = M.coping; T.side[k] = ST.pool;
        }
      });
      P.kidsPool = { cx, cz };
    }

    /* ---- back path detail: over spur (mountain path above tunnel) */
    {
      const t = L.tunnel;
      // path climbing over the spur: ramps/stairs on both sides
      each(t.x0 - 10, -62, t.x1 + 10, -57, (k, x, z) => {
        let y;
        if (x < t.x0 + 3) y = 7.0 * sm(t.x0 - 9, t.x0 + 3, x);
        else if (x > t.x1 - 3) y = 7.0 * (1 - sm(t.x1 - 3, t.x1 + 9, x));
        else y = 7.0;
        const hh = Math.round(y / V);
        if (z > -61.7 && z < -57.6) {
          H[k] = hh;
          T.top[k] = (Math.floor(x / 0.5) & 1) ? M.pave : M.pave2; T.side[k] = ST.rock;
        }
      });
    }

    /* ---- mountain paths (stairs) to towers */
    const stairPath = (ctrl, width) => {
      const path = new Path2(P.spline2(ctrl, 0.5, false), false);
      P.paintPoly(path, width / 2, (k, x, z, d) => {
        if (WL[k] > -50) return;
        T.top[k] = d > width / 2 - 0.3 ? M.paveEdge : M.pave;
        T.side[k] = ST.pave;
      });
      return path;
    };
    P.mtnPaths = [
      stairPath([[12, -60], [13, -66], [12, -72], [10, -80], [7, -84]], 2.5),
      stairPath([[-108, -60], [-109, -70], [-112, -80], [-117, -86]], 2.5),
      stairPath([[100, -62], [103, -72], [108, -82], [112, -88]], 3),
    ];
    // smooth stairs: make the height along these paths monotonic-ish (ramps)
    for (const p of P.mtnPaths) {
      P.paintPoly(p, 1.6, (k, x, z, d, s) => {
        const a = p.at(0), b = p.at(p.len);
        const ha = P.groundY(a.x, a.z), hb = mountainH(b.x, b.z);
        const t = s / p.s[p.n - 1];
        const y = ha + (Math.max(hb, ha) - ha) * t;
        const hh = Math.round(y / V);
        if (H[k] > hh + 1 || H[k] < hh - 1) H[k] = hh;
      });
    }

    /* ---- tower pads (flatten) */
    const pad = (cx, cz, r, y, m) => each(cx - r, cz - r, cx + r, cz + r, (k, x, z) => {
      if (Math.hypot(x - cx, z - cz) < r) { H[k] = Math.round(y / V); T.top[k] = m || ((Math.floor(x) + Math.floor(z)) & 1 ? M.pave : M.pave2); T.side[k] = ST.rock; }
    });
    pad(L.tower.x, L.tower.z, 9, L.tower.base);
    pad(L.xtower.x, L.xtower.z, 7, L.xtower.base);
    pad(L.ftower.x, L.ftower.z, 7.5, L.ftower.base);

    /* ---- outer boundary: fence line strip (pave) */
    each(-196, -150, 196, 250, (k, x, z) => {
      const onW = Math.abs(x + 171) < 1.2 && z > -124 && z < 121.5;
      const onE = Math.abs(x - 171) < 1.2 && z > -124 && z < 121.5;
      const onN = Math.abs(z + 124) < 1.2 && x > -171 && x < 171;
      const onS = Math.abs(z - 121) < 1.0 && Math.abs(x) < 171 && Math.abs(x) > 24;
      if ((onW || onE || onN || onS) && WL[k] < -50 && T.H[k] >= 0) {
        if (T.top[k] !== M.road) { T.top[k] = M.grass2; }
      }
    });

    // terrain column heights for mountain wings around towers: smooth ramps at the family hill
    P.terrainReady = true;
  };
})();
