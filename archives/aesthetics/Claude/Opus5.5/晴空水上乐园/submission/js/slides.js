'use strict';
/* ==========================================================================
   Slides: path → voxel shell (tube / trough), water layer with flow timing,
   supports, rider physics tables
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  P.slides = [];

  /* ------------------------------------------------------------ 3D spline */
  function catmull(ctrl, step) {
    const out = [];
    const n = ctrl.length;
    const get = (i) => ctrl[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const k = Math.max(2, Math.ceil(L / step));
      // centripetal-ish tension via uniform CR (fine for dense control points)
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push(vec(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])));
      }
    }
    const l = ctrl[n - 1];
    out.push(vec(l[0], l[1], l[2]));
    return out;
  }
  // resample a polyline to uniform spacing ds; compute frames
  function buildTrack(pts, ds) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(L / ds) + 1);
    const P0 = [], T = [], U = [], R = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(L, i * ds);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      P0.push(pts[j].clone().lerp(pts[j + 1], t));
    }
    for (let i = 0; i < n; i++) {
      const a = P0[Math.max(0, i - 1)], b = P0[Math.min(n - 1, i + 1)];
      T.push(b.clone().sub(a).normalize());
    }
    // up frames: world-up projected; fall back to previous for near-vertical tangents
    let prevU = vec(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const t = T[i];
      let u = vec(0, 1, 0).addScaledVector(t, -t.y);
      if (u.lengthSq() < 0.02) {
        u = prevU.clone().addScaledVector(t, -prevU.dot(t));
        if (u.lengthSq() < 1e-4) {
          const ref = Math.abs(t.z) < 0.9 ? vec(0, 0, 1) : vec(1, 0, 0);
          u = ref.addScaledVector(t, -ref.dot(t));
        }
      }
      u.normalize();
      // keep continuity (no flips)
      if (i > 0 && u.dot(prevU) < 0) u.negate();
      prevU = u;
      U.push(u);
      R.push(vec().crossVectors(t, u).normalize());
    }
    return { p: P0, T, U, R, L, n, ds };
  }
  P.catmull3 = catmull;
  P.buildTrack = buildTrack;

  /* ------------------------------------------------------------ physics: speed profile & timing */
  function physics(tr, o) {
    const g = 9.81, n = tr.n, ds = tr.ds;
    const v = new Float32Array(n), tau = new Float32Array(n);
    let vel = o.v0 != null ? o.v0 : 1.6;
    const mu = o.mu != null ? o.mu : 0.05, drag = o.drag != null ? o.drag : 0.006, vmin = o.vmin || 1.6;
    for (let i = 0; i < n; i++) {
      v[i] = vel;
      if (i === n - 1) break;
      const dy = tr.p[i + 1].y - tr.p[i].y;
      // energy step
      let e = vel * vel - 2 * g * dy - 2 * (mu * g * Math.sqrt(Math.max(0, 1 - tr.T[i].y * tr.T[i].y)) + drag * vel * vel) * ds;
      if (o.boost) for (const b of o.boost) if (i * ds >= b[0] && i * ds <= b[1]) e += 2 * b[2] * ds;
      vel = Math.sqrt(Math.max(vmin * vmin, e));
      if (o.vmax) vel = Math.min(vel, o.vmax);
    }
    tau[0] = 0;
    for (let i = 1; i < n; i++) tau[i] = tau[i - 1] + ds / Math.max(0.3, 0.5 * (v[i] + v[i - 1]));
    tr.v = v; tr.tau = tau; tr.T_total = tau[n - 1];
    // curvature (signed lateral)
    const kl = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) {
      const dT = tr.T[i + 1].clone().sub(tr.T[i - 1]).multiplyScalar(1 / (2 * ds));
      kl[i] = dT.dot(tr.R[i]);
    }
    tr.kl = kl;
  }
  // arc length index at travel time t
  P.trackIndexAt = function (tr, t) {
    const tau = tr.tau;
    if (t <= 0) return 0;
    if (t >= tr.T_total) return tr.n - 1;
    let lo = 0, hi = tr.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tau[m] <= t) lo = m; else hi = m; }
    return lo + (t - tau[lo]) / Math.max(1e-6, tau[hi] - tau[lo]);
  };
  // sample frame at fractional index
  P.trackSample = function (tr, fi, out) {
    const i = Math.max(0, Math.min(tr.n - 2, Math.floor(fi))), f = Math.min(1, Math.max(0, fi - i));
    out.p.copy(tr.p[i]).lerp(tr.p[i + 1], f);
    out.T.copy(tr.T[i]).lerp(tr.T[i + 1], f).normalize();
    out.U.copy(tr.U[i]).lerp(tr.U[i + 1], f).normalize();
    out.R.crossVectors(out.T, out.U).normalize();
    out.v = tr.v[i] + (tr.v[i + 1] - tr.v[i]) * f;
    out.k = tr.kl[i] + (tr.kl[i + 1] - tr.kl[i]) * f;
    return out;
  };

  /* ------------------------------------------------------------ voxelize */
  // o: {r (inner radius), th (wall), open (half-angle of trough from bottom, deg; 180 = closed),
  //     mat, glass:[[s0,s1,mat]], rings:{every, width, mat}, water:true, rim: mat, carve:true, stars}
  P.voxelizeSlide = function (tr, o) {
    const w = P.world;
    const r0 = o.r, r1 = o.r + (o.th || 0.3);
    const open = (o.open != null ? o.open : 180) * P.deg;
    const R = Math.ceil(r1 / V) + 1;
    const ds = tr.ds;
    const half = ds * 0.5 + 0.02;
    const tmp = vec();
    const nStep = Math.max(1, Math.round(0.125 / ds));
    for (let i = 0; i < tr.n; i += nStep) {
      const p = tr.p[i], T = tr.T[i], U = tr.U[i], Rr = tr.R[i];
      const s = i * ds;
      if (o.skip && o.skip(s)) continue;
      // trim where the track runs into a pool (slide ends at the water)
      {
        const k = P.colIndex(p.x, p.z);
        if (k >= 0 && P.waterLevel[k] > -50 && p.y < P.waterLevel[k] + r0 + 0.3) continue;
      }
      const cx = Math.floor(p.x / V), cy = Math.floor(p.y / V), cz = Math.floor(p.z / V);
      let segMat = o.mat;
      let glassHere = false;
      if (o.glass) for (const g of o.glass) if (s >= g[0] && s <= g[1]) { glassHere = true; segMat = g[2] || M.glClear; }
      if (o.rings && !glassHere) {
        const ph = (s % o.rings.every);
        if (ph < o.rings.width) { glassHere = true; segMat = o.rings.mat; }
      }
      const halfHere = half * nStep;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
        const X = cx + a, Y = cy + b, Z = cz + c;
        tmp.set((X + 0.5) * V - p.x, (Y + 0.5) * V - p.y, (Z + 0.5) * V - p.z);
        const al = tmp.dot(T);
        if (al > halfHere || al < -halfHere) continue;
        const lx = tmp.dot(Rr), ly = tmp.dot(U);
        const d = Math.hypot(lx, ly);
        if (d > r1) continue;
        const ang = Math.atan2(lx, -ly); // 0 = bottom
        const aa = Math.abs(ang);
        if (d >= r0) {
          if (aa > open) continue;
          let m = segMat;
          if (o.rim && aa > open - 0.22) m = o.rim;
          if (o.stripe && !glassHere) { const k = Math.floor(s / o.stripe.every) & 1; if (k && aa > o.stripe.from) m = o.stripe.mat; }
          if (o.stars && !glassHere) {
            const hsh = P.hash3i(X, Y, Z);
            if (d > r0 + 0.12) {
              if (hsh < 0.035) m = M.slStar;
              const ringPh = s % 9.0;
              if (ringPh < 0.35) m = M.slRing; else if (ringPh > 4.5 && ringPh < 4.85) m = M.slRing2;
            }
          }
          w.set(X, Y, Z, m);
          // smooth radial normal
          const nx = (Rr.x * lx + U.x * ly) / (d || 1), ny = (Rr.y * lx + U.y * ly) / (d || 1), nz = (Rr.z * lx + U.z * ly) / (d || 1);
          w.setN(X, Y, Z, nx, ny, nz);
        } else {
          // interior
          const cur = w.get(X, Y, Z);
          if (o.water && U.y > 0.45 && d >= r0 - 0.3 && aa < (o.waterAng || 0.75) && (cur === 0 || cur === 255)) {
            w.set(X, Y, Z, M.waterV);
            const fi = i;
            w.setFlow(X, Y, Z, tr.tau ? tr.tau[fi] : s / 3, tr.v ? Math.max(0.5, tr.v[fi]) : 3, T.x, T.y, T.z);
          } else if (o.carve !== false && cur !== M.waterV) {
            if (cur && P.pal.cls[cur] === 1 && !o.keepInside) w.set(X, Y, Z, 255);
            else if (!cur && Y < P.terrain.h(X, Z)) w.set(X, Y, Z, 255);
          }
        }
      }
    }
  };

  /* ------------------------------------------------------------ supports */
  P.supports = function (tr, o) {
    const B = P.B;
    const every = o.every || 6;
    const r1 = o.r + (o.th || 0.3);
    let last = -1e9;
    for (let i = 0; i < tr.n; i++) {
      const s = i * tr.ds;
      if (s - last < every) continue;
      if (o.from && s < o.from) continue;
      if (o.to && s > o.to) continue;
      const p = tr.p[i], U = tr.U[i];
      const bx = p.x - U.x * (r1 + 0.1), by = p.y - U.y * (r1 + 0.1), bz = p.z - U.z * (r1 + 0.1);
      const k = P.colIndex(bx, bz);
      if (k < 0) continue;
      if (P.waterLevel[k] > -50) continue;
      const g = P.terrain.H[k] * V;
      if (by - g < 1.2) continue;
      last = s;
      const t = by - g > 14 ? 0.75 : 0.5;
      const m = o.mat || M.white2;
      B.box(bx - t / 2, g, bz - t / 2, bx + t / 2, by, bz + t / 2, m);
      // collar & foot
      B.box(bx - t / 2 - 0.25, g, bz - t / 2 - 0.25, bx + t / 2 + 0.25, g + 0.25, bz + t / 2 + 0.25, M.concrete);
      B.box(bx - t / 2 - 0.125, by - 0.25, bz - t / 2 - 0.125, bx + t / 2 + 0.125, by, bz + t / 2 + 0.125, o.collar || M.sky);
      // cross-arm to the slide belly
      const L = Math.max(0.5, r1 * 0.9);
      B.box(bx - L, by - 0.25, bz - 0.125, bx + L, by, bz + 0.125, m);
    }
  };

  /* ------------------------------------------------------------ slide registry */
  // def: {name, ctrl (3D control points) or pts (Vector3 array), r, th, open, mat, ... rider, period, offset, phys}
  P.addSlide = function (def) {
    const pts = def.pts || catmull(def.ctrl, 0.25);
    const tr = buildTrack(pts, def.ds || 0.125);
    physics(tr, def.phys || {});
    def.track = tr;
    if (!def.noVoxel) P.voxelizeSlide(tr, Object.assign({ water: def.water !== false }, def));
    if (def.supports !== false) P.supports(tr, Object.assign({ every: 6 }, def, def.sup || {}));
    P.slides.push(def);
    return def;
  };
})();
