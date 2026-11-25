/* terrain: heightfield, base sections, stone walls, stairs, stream, paths */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3;
  const C = W.C;

  // ---------- JS value noise ----------
  function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  W.noise2 = function (x, y) {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  W.fbm2 = (x, y) => W.noise2(x, y) * 0.5 + W.noise2(x * 2.1 + 5.3, y * 2.1 + 1.7) * 0.3 + W.noise2(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.2;

  // ---------- layout constants (nine-grid: columns/rows split at ±5.33) ----------
  const L = (W.L = {
    HALF: 16,
    BOTTOM: -4.0,
    CELL: 32 / 3,
    TERR_Y: 3.2,
    TERR_X: -3.0, TERR_Z: -5.3,
    STAIR_X0: 9.45, STAIR_X1: 11.9, STAIR_Z0: 4.6,
    POND: { x: 0.0, z: 11.6, r: 5.3 },
    STUDIO: { x0: -16, x1: -6, z0: -11, z1: -3, floor: 1.4, wallTop: 4.2 },
    STUDIO_SHIFT: 2.0,
    STEPS_X: -10.0,
    GATE_X: -10.0,
    GINKGO: { x: -1.6, z: -6.7 },
    TORII: { x: 10.675, z: 14.5 },
    SHRINE: { x: 10.675, z: -11.4 },
    SAND: { x0: -9.3, x1: -5.85, z0: 5.6, z1: 11.4 },
  });
  L.SANDO_X = (L.STAIR_X0 + L.STAIR_X1) / 2;
  W.WATER_Y = -0.12;

  // stream polyline: waterfall at the terrace edge → forward through the centre column → pond back bank
  L.stream = [[5.0, -4.95], [4.75, -3.6], [4.1, -2.2], [3.3, -0.8], [2.75, 0.8], [2.55, 2.6], [2.8, 4.0], [3.35, 5.2], [3.75, 6.3], [3.75, 7.7]];
  L.streamCurve = new THREE.CatmullRomCurve3(L.stream.map((p) => new V3(p[0], 0, p[1])), false, 'centripetal');
  L.streamPts = L.streamCurve.getSpacedPoints(160);
  L.streamWidth = (t) => 0.3 + 0.1 * Math.sin(t * 9) + (t > 0.62 && t < 0.86 ? 0.45 * Math.sin((t - 0.62) / 0.24 * Math.PI) : 0) + (t > 0.92 ? (t - 0.92) * 3 : 0);

  function distToStream(x, z) {
    let best = 1e9, bt = 0;
    const P = L.streamPts;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i].x, az = P[i].z, bx = P[i + 1].x, bz = P[i + 1].z;
      const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x, pz = az + dz * t - z; const d = px * px + pz * pz;
      if (d < best) { best = d; bt = (i + t) / (P.length - 1); }
    }
    return [Math.sqrt(best), bt];
  }
  W.distToStream = distToStream;

  // moss mounds — only in the open moss between the three subjects
  const MOUNDS = [
    [-14.3, 4.6, 0.3, 2.0], [-13.4, 9.4, 0.2, 1.7], [6.9, -1.9, 0.42, 2.3], [7.3, 2.0, 0.24, 1.6], [14.3, 0.8, 0.38, 2.1],
    [14.6, -3.2, 0.28, 1.6], [6.9, 13.6, 0.22, 1.6], [-4.3, -2.3, 0.16, 1.3], [0.6, 0.4, 0.14, 1.5], [-12.8, 13.6, 0.14, 1.5],
    [-2.2, 1.6, 0.12, 1.4],
  ];

  L.paths = [];

  W.inTerrace = (x, z) => x >= L.TERR_X + 0.35 && z <= L.TERR_Z - 0.35;
  W.inStairBlock = (x, z) => x > L.STAIR_X0 - 0.45 && x < L.STAIR_X1 + 0.45 && z > L.TERR_Z - 0.45 && z < L.STAIR_Z0 + 0.25;
  W.H = function (x, z) {
    if (W.inTerrace(x, z)) return L.TERR_Y + (W.noise2(x * 0.4, z * 0.4) - 0.5) * 0.05;
    let y = 0;
    for (let i = 0; i < MOUNDS.length; i++) {
      const m = MOUNDS[i]; const dx = x - m[0], dz = z - m[1];
      const d2 = (dx * dx + dz * dz) / (m[3] * m[3]);
      if (d2 < 4) y += m[2] * Math.exp(-d2 * 1.6);
    }
    y += (W.fbm2(x * 0.35, z * 0.35) - 0.5) * 0.1;
    // studio gravel pad
    const sp = Math.min(-4.0 - x, -0.3 - z);
    if (sp > -1.2) y = W.lerp(y, 0.1, W.smooth(-1.2, 0.2, sp));
    // pond surroundings flatten
    const pd = Math.hypot(x - L.POND.x, z - L.POND.z);
    if (pd < L.POND.r + 1.5) y = W.lerp(0.0, y, W.smooth(L.POND.r + 0.1, L.POND.r + 1.5, pd));
    // flat sando
    if (x > L.STAIR_X0 - 1.4 && x < L.STAIR_X1 + 1.4 && z > L.STAIR_Z0 - 1.0) { const k = W.smooth(L.STAIR_X0 - 1.4, L.STAIR_X0 - 0.5, x) * (1 - W.smooth(L.STAIR_X1 + 0.5, L.STAIR_X1 + 1.4, x)); y = W.lerp(y, 0.03, k); }
    // karesansui: flat
    const S = L.SAND;
    if (x > S.x0 - 0.3 && x < S.x1 + 0.3 && z > S.z0 - 0.3 && z < S.z1 + 0.3) y = 0.02;
    // stream bed
    const ds = distToStream(x, z);
    const wdt = L.streamWidth(ds[1]);
    if (ds[0] < wdt + 0.5) {
      const k = 1 - W.smooth(wdt * 0.55, wdt + 0.5, ds[0]);
      y = W.lerp(y, -0.2 - 0.06 * (1 - ds[1]), k);
    }
    const wf = Math.hypot(x - L.stream[0][0], z - L.stream[0][1]);
    if (wf < 1.1) y = W.lerp(-0.28, y, W.smooth(0.45, 1.1, wf));
    return y;
  };

  // ---------- region classification (ground materials per zone) ----------
  function region(x, z) {
    if (W.inTerrace(x, z)) {
      const gd = Math.hypot(x - L.GINKGO.x, z - L.GINKGO.z);
      if (gd < 3.4) return 'ginkgo';
      if (x > L.STAIR_X0 - 2.3 && x < L.STAIR_X1 + 2.0 && z > -14.6) return 'slabs';
      if (x > 4.3 && x < 7.6 && z > -9.2) return 'slabs';
      if (x > 12.9 && z < -9.0) return 'slabs';
      return 'tmoss';
    }
    if (x > L.STAIR_X0 - 0.55 && x < L.STAIR_X1 + 0.55 && z > L.STAIR_Z0 - 0.4) return 'sando';
    const ds = distToStream(x, z);
    if (ds[0] < L.streamWidth(ds[1]) * 0.9) return 'bed';
    const S = L.SAND;
    if (x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1) return 'sand';
    if (x < -4.0 && z < -0.3) return 'gravel';
    const gd = Math.hypot(x - (L.GINKGO.x + 0.6), z - (L.GINKGO.z + 3.2));
    if (gd < 3.6 && z > L.TERR_Z - 0.4) return 'ginkgoMoss';
    return 'moss';
  }
  W.region = region;

  const MOSS = [C(0x5a7628), C(0x6e8c32), C(0x4a6626), C(0x7e9638)];
  function groundColor(reg, x, y, z) {
    const n = W.fbm2(x * 0.5, z * 0.5), n2 = W.noise2(x * 2.3, z * 2.3);
    let c;
    switch (reg) {
      case 'gravel': c = W.mixC(0xcac1ad, 0xb4aa96, n); break;
      case 'sando': c = W.mixC(0xc2baa8, 0xaaa290, n); break;
      case 'slabs': c = W.mixC(0xb0a898, 0x9c9484, n); break;
      case 'sand': c = W.mixC(0xf1ece0, 0xe6e0d2, n2 * 0.5); break;
      case 'bed': c = W.mixC(0x8d8574, 0x6f6a60, n2); break;
      case 'ginkgo': c = W.mixC(0xe9b52c, 0xf2c94a, n2); break;
      case 'ginkgoMoss': {
        const gd = Math.hypot(x - (L.GINKGO.x + 0.6), z - (L.GINKGO.z + 3.2));
        c = W.mixC(0x6e8f34, 0xe3ad2e, W.smooth(3.6, 0.8, gd + (n - 0.5) * 2.0) * 0.9);
        break;
      }
      case 'tmoss': c = W.mixC(0x587428, 0x6a8630, n); break;
      default: {
        c = MOSS[0].clone().lerp(MOSS[1], n).lerp(MOSS[2], W.smooth(0.55, 0.8, n2) * 0.6);
        const lt = W.noise2(x * 1.7 + 30, z * 1.7);
        if (lt > 0.8) c.lerp(C(0xc4552a), (lt - 0.8) * 1.6);
      }
    }
    return c;
  }
  const REG_FX = { gravel: [0, 0, 0, 3.0], sando: [0, 0, 0, 3.0], slabs: [0, 0, 0, 18.0], sand: [0, 0, 0, 14.0], bed: [0, 0, 0, 3.0], ginkgo: [0, 0, 0, 4.0], ginkgoMoss: [0, 0, 0, 4.0], tmoss: [0, 0, 0, 4.0], moss: [0, 0, 0, 4.0] };

  // ---------- ground mesh ----------
  function buildGround(B) {
    const step = 0.2, N = Math.round(32 / step);
    const regs = {};
    const Hc = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) Hc[j * (N + 1) + i] = W.H(-16 + i * step, -16 + j * step);
    const hAt = (i, j) => Hc[W.clamp(j, 0, N) * (N + 1) + W.clamp(i, 0, N)];
    const normalAt = (i, j) => { const dx = hAt(i + 1, j) - hAt(i - 1, j), dz = hAt(i, j + 1) - hAt(i, j - 1); return new V3(-dx / (2 * step), 1, -dz / (2 * step)).normalize(); };
    const P = L.POND;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x0 = -16 + i * step, z0 = -16 + j * step;
      const cx = x0 + step / 2, cz = z0 + step / 2;
      if (Math.hypot(cx - P.x, cz - P.z) < P.r - 0.05) continue;
      if (W.inNotch && W.inNotch(cx, cz)) continue;
      if (W.inStairBlock(cx, cz)) continue;
      const hs = [hAt(i, j), hAt(i + 1, j), hAt(i, j + 1), hAt(i + 1, j + 1)];
      const mx = Math.max(...hs), mn = Math.min(...hs);
      if (mx - mn > 0.8) continue;
      const rg = region(cx, cz);
      let arr = regs[rg]; if (!arr) arr = regs[rg] = [];
      arr.push([i, j]);
    }
    for (const rg in regs) {
      const cells = regs[rg];
      const pos = new Float32Array(cells.length * 12), nor = new Float32Array(cells.length * 12), col = [], idx = new Uint32Array(cells.length * 6);
      const g = new THREE.BufferGeometry();
      const colA = new Float32Array(cells.length * 12);
      cells.forEach((c, k) => {
        const [i, j] = c; const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
        corners.forEach((q, m) => {
          const x = -16 + q[0] * step, z = -16 + q[1] * step, y = hAt(q[0], q[1]);
          const o = (k * 4 + m) * 3;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          const nn = normalAt(q[0], q[1]); nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
          const cc = groundColor(rg, x, y, z); colA[o] = cc.r; colA[o + 1] = cc.g; colA[o + 2] = cc.b;
        });
        const b = k * 4; const o6 = k * 6;
        idx[o6] = b; idx[o6 + 1] = b + 2; idx[o6 + 2] = b + 1; idx[o6 + 3] = b + 1; idx[o6 + 4] = b + 2; idx[o6 + 5] = b + 3;
      });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const fx = REG_FX[rg] || [0, 0, 0, 4];
      const caustic = rg === 'bed' ? 1.0 : 0;
      B.add(g, new THREE.Matrix4(), 0xffffff, [fx[0], fx[1], caustic, fx[3]], null, (lx, ly, lz) => {
        const ii = Math.round((lx + 16) / step), jj = Math.round((lz + 16) / step);
        return groundColor(rg, lx, ly, lz);
      });
    }
  }

  // ---------- base side sections ----------
  const STRATA = [
    { d: 0.12, c: 0x6b4426, c2: 0xa0522d, fx: 13 },  // leaf litter
    { d: 0.45, c: 0x3f2c1f, c2: 0x4d3626, fx: 13 },  // humus
    { a: -1.25, c: 0x7b5533, c2: 0x8a6240, fx: 13 }, // brown soil
    { a: -1.95, c: 0x9b7148, c2: 0xa77c52, fx: 13 }, // clay
    { a: -2.75, c: 0x86786a, c2: 0x958676, fx: 13 }, // gravel
    { a: -4.0, c: 0x5f5b60, c2: 0x6c676b, fx: 3 },   // rock
  ];
  function edgeTop(s, side) {
    // returns top height along edge param s (x or z)
    if (side === 'front') { return W.H(s, 15.999); }
    if (side === 'back') { return W.H(s, -15.999); }
    if (side === 'left') { return W.H(-15.999, s); }
    return W.H(15.999, s);
  }
  function buildSections(B) {
    const sides = [
      { name: 'front', fixed: 16, axis: 'x', dir: 1 },
      { name: 'back', fixed: -16, axis: 'x', dir: -1 },
      { name: 'left', fixed: -16, axis: 'z', dir: 1 },
      { name: 'right', fixed: 16, axis: 'z', dir: -1 },
    ];
    const P = L.POND;
    const chordHalf = Math.sqrt(Math.max(0, P.r * P.r - (16 - P.z) * (16 - P.z)));
    const step = 0.2;
    sides.forEach((sd) => {
      const n = Math.round(32 / step);
      // boundaries per column
      for (let li = 0; li < STRATA.length; li++) {
        const pos = [], nor = [], colr = [], idx = [];
        let vc = 0;
        for (let i = 0; i <= n; i++) {
          const s = -16 + i * step;
          let top = edgeTop(s, sd.name);
          let cut = false;
          if (sd.name === 'front' && Math.abs(s - P.x) < chordHalf + 0.02) { cut = true; }
          const wav = (k) => (W.noise2(s * 0.45 + k * 7.1, k * 3.3) - 0.5) * 0.35 + Math.sin(s * 0.3 + k) * 0.08;
          const bnd = (k) => {
            if (k < 0) return top;
            const st = STRATA[k];
            if (st.d !== undefined) { let acc = 0; for (let q = 0; q <= k; q++) acc += STRATA[q].d || 0; return top - acc - wav(k) * 0.25; }
            return Math.min(top - 0.6, st.a + wav(k));
          };
          let yTop = bnd(li - 1), yBot = li === STRATA.length - 1 ? L.BOTTOM : bnd(li);
          if (cut) {
            const crustBottom = -1.12;
            yTop = Math.min(yTop, crustBottom); yBot = Math.min(yBot, crustBottom);
          }
          if (yBot > yTop) yBot = yTop;
          const st = STRATA[li];
          const c1 = C(st.c), c2 = C(st.c2);
          [yTop, yBot].forEach((y) => {
            let x, z;
            if (sd.axis === 'x') { x = s; z = sd.fixed; } else { x = sd.fixed; z = s; }
            pos.push(x, y, z);
            if (sd.axis === 'x') nor.push(0, 0, sd.dir); else nor.push(sd.dir * -1 * (sd.name === 'left' ? 1 : -1) * 0 + (sd.name === 'left' ? -1 : 1), 0, 0);
            const cc = c1.clone().lerp(c2, W.noise2(s * 1.3, y * 2.1));
            colr.push(cc.r, cc.g, cc.b);
          });
          if (i > 0) {
            const a = vc - 2, b = vc - 1, c = vc, d = vc + 1;
            // orientation: outward facing
            if (sd.name === 'front' || sd.name === 'left') { idx.push(a, b, c, b, d, c); } else { idx.push(a, c, b, b, c, d); }
          }
          vc += 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setIndex(idx);
        const colArr = colr;
        B.add(g, new THREE.Matrix4(), 0xffffff, [0, 0, 0, STRATA[li].fx], null, (lx, ly, lz) => {
          // recompute color per vertex
          const s = sd.axis === 'x' ? lx : lz;
          return C(STRATA[li].c).clone().lerp(C(STRATA[li].c2), W.noise2(s * 1.3, ly * 2.1));
        });
      }
    });
    // embedded stones, shards, coins along sections
    const R = W.rng(77);
    const sideP = (name, s, y, out) => {
      if (name === 'front') return [s, y, 16 + out];
      if (name === 'back') return [s, y, -16 - out];
      if (name === 'left') return [-16 - out, y, s];
      return [16 + out, y, s];
    };
    const ctx = new W.Ctx(B);
    ['front', 'back', 'left', 'right'].forEach((name) => {
      for (let k = 0; k < 70; k++) {
        const s = R.range(-15.6, 15.6);
        if (name === 'front' && Math.abs(s - P.x) < chordHalf + 0.3) continue;
        const top = edgeTop(s, name);
        let y = R.range(L.BOTTOM + 0.2, top - 0.5);
        const deep = y < -2.6;
        const r = deep ? R.range(0.18, 0.45) : R.range(0.06, 0.2);
        const p = sideP(name, s, y, -r * 0.35);
        const col = deep ? W.jit(0x7a767c, 0.5, R) : W.jit(0x8c8478, 0.5, R);
        ctx.add(W.g.blob(1, 1, 0.25, k + name.length * 100), col, p, [R() * 3, R() * 3, R() * 3], [r * 1.3, r * 0.8, r], [0, 0, 0, 3.0]);
      }
      // a few pebbles in gravel band
      for (let k = 0; k < 120; k++) {
        const s = R.range(-15.8, 15.8);
        if (name === 'front' && Math.abs(s - P.x) < chordHalf + 0.2) continue;
        const y = R.range(-2.7, -1.95);
        const r = R.range(0.03, 0.08);
        ctx.add(W.g.ico(1, 0), W.jit(0xa89c8c, 0.6, R), sideP(name, s, y, -r * 0.3), [R() * 3, R() * 3, 0], [r * 1.4, r, r], [0, 0, 0, 3.0]);
      }
    });
    // pottery shards and coins near front & left
    const shard = (name, s, y, col, ry) => {
      const p = sideP(name, s, y, 0.0);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.22, 0.03); sh.lineTo(0.17, 0.14); sh.lineTo(0.03, 0.12); sh.closePath();
      ctx.add(W.g.extrude(sh, 0.03, 0, 'shard'), col, p, ry, 1, [0, 0, 0, 0]);
    };
    shard('front', -9.5, -1.0, 0x9a5b3a, [0, 0, 0.3]);
    shard('front', 7.2, -1.6, 0x4e6d7d, [0, 0, -0.5]);
    shard('left', 2.5, -0.9, 0xb37a52, [0, Math.PI / 2, 0.2]);
    shard('right', 9.5, -1.4, 0x7c5a44, [0, Math.PI / 2, -0.4]);
    shard('back', -3.0, -1.2, 0xa66a44, [0, Math.PI, 0.1]);
    const coin = (name, s, y) => {
      const p = sideP(name, s, y, 0.0);
      const rot = name === 'front' || name === 'back' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
      ctx.add(W.g.cyl(0.07, 0.07, 0.018, 18), 0xb08d3c, p, rot, 1, [0, 0, 0, 9.0]);
      const hp = sideP(name, s, y, 0.012);
      ctx.add(W.g.box(0.035, 0.035, 0.035), 0x3a2a1a, hp, null, 1);
    };
    coin('front', -12.4, -0.75); coin('front', 4.6, -1.15); coin('front', 4.75, -1.25); coin('left', 9.8, -0.85); coin('right', 2.0, -0.9); coin('back', -9.0, -0.7);
    // plinth
    ctx.add(W.g.box(32.5, 0.42, 32.5), 0x3a2620, [0, L.BOTTOM - 0.21, 0], null, 1, [0, 0, 0, 1.0]);
    ctx.add(W.g.box(32.9, 0.08, 32.9), 0x2a1a16, [0, L.BOTTOM - 0.46, 0], null, 1, [0, 0, 0, 1.0]);
    // brass plate on plinth front
    ctx.add(W.g.box(2.6, 0.22, 0.03), 0xc39a4a, [0, L.BOTTOM - 0.2, 16.26], null, 1, [0, 0, 0, 9.0], W.atlas.get('plate'));
  }

  // ---------- stone walls (ishigaki) ----------
  function ishigakiFace(B, opts) {
    // face along a line from a->b, height function hFn(s) giving top; base at y0
    const R = W.rng(opts.seed || 5);
    const ctx = new W.Ctx(B);
    const ax = opts.a[0], az = opts.a[1], bx = opts.b[0], bz = opts.b[1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = opts.out[0], nz = opts.out[1]; // outward normal
    const ry = Math.atan2(ux, uz) - Math.PI / 2;
    const y0 = opts.y0 === undefined ? -0.25 : opts.y0;
    let y = y0;
    const rows = [];
    while (true) {
      const rh = R.range(0.36, 0.52);
      rows.push([y, rh]);
      y += rh;
      if (y > opts.maxTop + 0.1) break;
    }
    const batter = opts.batter || 0.16;
    const stones = [];
    rows.forEach((row, ri) => {
      let s = -R.range(0, 0.5);
      while (s < len) {
        const w = R.range(0.5, 1.05);
        const sm = Math.min(len, s + w);
        const mid = (Math.max(0, s) + sm) / 2;
        const top = opts.hFn(mid);
        const ry0 = row[0], rh = row[1];
        if (ry0 < top - 0.08 && sm - Math.max(0, s) > 0.18) {
          const h = Math.min(rh, top - ry0 + 0.02);
          const ww = sm - Math.max(0, s) - 0.04;
          const yc = ry0 + h / 2;
          const inset = (yc - y0) * batter;
          const px = ax + ux * mid - nx * inset, pz = az + uz * mid - nz * inset;
          const d = R.range(0.5, 0.7);
          const col = W.jit(R() < 0.25 ? 0x9a9284 : R() < 0.5 ? 0x8a8478 : 0xa59d8c, 0.6, R);
          const prot = R.range(-0.04, 0.06);
          ctx.add(W.g.soft(1, 1, 1, 0.14, 2), col, [px + nx * (prot - d / 2 + 0.02), yc, pz + nz * (prot - d / 2 + 0.02)], [R.range(-0.04, 0.04) - batter * 0.9 * (nx !== 0 ? 0 : 1) * 0, ry, R.range(-0.04, 0.04)], [ww, h - 0.035, d], [0, 0, 0, 3.0]);
          stones.push([px + nx * 0.03, ry0, pz + nz * 0.03, ww, h, top]);
        }
        s += w;
      }
    });
    // mortar / dark backing to hide gaps
    const back = new W.Ctx(B);
    // backing stops short of the end when another face meets this one there (keeps it behind that face)
    const bs0 = opts.backStart || 0, lenB = len - (opts.backEnd || 0) - bs0;
    for (let k = 0; k < Math.ceil(lenB / 0.5); k++) {
      const s = bs0 + (k + 0.5) * (lenB / Math.ceil(lenB / 0.5));
      const top = opts.hFn(s);
      if (top - y0 < 0.1) continue;
      const hh = top - y0;
      const px = ax + ux * s - nx * (0.45 + hh * batter * 0.5), pz = az + uz * s - nz * (0.45 + hh * batter * 0.5);
      back.add(W.g.box(lenB / Math.ceil(lenB / 0.5) + 0.02, hh, 0.5), 0x3a3830, [px, y0 + hh / 2, pz], [0, ry, 0], 1, [0, 0, 0, 3.0]);
    }
    // moss & ferns in joints
    stones.forEach((st, i) => {
      if (R() < 0.35) {
        const [px, py, pz, ww] = st;
        const off = R.range(-ww * 0.4, ww * 0.4);
        ctx.add(W.g.blob(1, 1, 0.3, i), W.jit(0x5d7d2a, 0.5, R), [px + ux * off + nx * 0.04, py + 0.01, pz + uz * off + nz * 0.04], [0, R() * 6, 0], [R.range(0.08, 0.2), 0.05, 0.07], [0, 0, 0, 4.0]);
      }
      if (R() < 0.09) W.fern(B, px_(st, ux, nx, R), st[1] + 0.02, pz_(st, uz, nz, R), R.range(0.25, 0.42), Math.atan2(nx, nz), R);
    });
    return stones;
  }
  const px_ = (st, ux, nx, R) => st[0] + ux * R.range(-0.3, 0.3) + nx * 0.06;
  const pz_ = (st, uz, nz, R) => st[2] + uz * R.range(-0.3, 0.3) + nz * 0.06;

  // fern: fan of fronds
  W.fern = function (B, x, y, z, s, facing, R) {
    R = R || W.R;
    const ctx = new W.Ctx(B).at([x, y, z], [0, facing || 0, 0], s);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2.2;
      const len = R.range(0.7, 1.0);
      // frond: chain of tiny leaflets along an arc
      for (let k = 0; k < 7; k++) {
        const t = k / 7;
        const px = Math.sin(a) * t * len, pz = Math.cos(a) * t * len * 0.9 + 0.05, py = t * 0.55 - t * t * 0.5;
        const sz = (1 - t) * 0.22 + 0.06;
        ctx.add(W.g.leaf('narrow'), W.jit(0x5f8a2e, 0.3, R), [px, py, pz], [0.4 - t, a + Math.PI / 2, 0], [sz, 1, sz * 0.5], [0, 0.6, 0, 8.0]);
        ctx.add(W.g.leaf('narrow'), W.jit(0x5f8a2e, 0.3, R), [px, py, pz], [0.4 - t, a - Math.PI / 2, 0], [sz, 1, sz * 0.5], [0, 0.6, 0, 8.0]);
      }
    }
  };

  // stair profile (top height of the stone stair block at z)
  const FLIGHTS = [[4.6, 1.9, 0.0, 1.2, 6], [0.9, -1.5, 1.2, 2.2, 5], [-2.5, -5.3, 2.2, 3.2, 5]];
  const LANDINGS = [[1.9, 0.9, 1.2], [-1.5, -2.5, 2.2]];
  W.stairY = function (z) {
    if (z >= FLIGHTS[0][0]) return 0;
    for (const f of FLIGHTS) { if (z <= f[0] && z >= f[1]) { const k = (f[0] - z) / (f[0] - f[1]); return W.lerp(f[2], f[3], k); } }
    for (const l of LANDINGS) { if (z <= l[0] && z >= l[1]) return l[2]; }
    return L.TERR_Y;
  };

  function buildStoneWalls(B) {
    const T = L.TERR_Y;
    const front1 = ishigakiFace(B, { a: [L.TERR_X, L.TERR_Z], b: [L.STAIR_X0 - 0.35, L.TERR_Z], backStart: 0.62, out: [0, 1], hFn: () => T + 0.05, maxTop: T + 0.1, seed: 11 });
    const front2 = ishigakiFace(B, { a: [L.STAIR_X1 + 0.35, L.TERR_Z], b: [16, L.TERR_Z], out: [0, 1], hFn: () => T + 0.05, maxTop: T + 0.1, seed: 14 });
    const left = ishigakiFace(B, { a: [L.TERR_X, -16], b: [L.TERR_X, L.TERR_Z], backEnd: 0.62, out: [-1, 0], hFn: () => T + 0.05, maxTop: T + 0.1, seed: 12 });
    // stone side walls of the stair block
    ishigakiFace(B, { a: [L.STAIR_X0 - 0.35, L.STAIR_Z0 + 0.15], b: [L.STAIR_X0 - 0.35, L.TERR_Z], out: [-1, 0], hFn: (sv) => W.stairY(L.STAIR_Z0 + 0.15 - sv) + 0.16, maxTop: T + 0.2, seed: 13, batter: 0.06 });
    ishigakiFace(B, { a: [L.STAIR_X1 + 0.35, L.TERR_Z], b: [L.STAIR_X1 + 0.35, L.STAIR_Z0 + 0.15], out: [1, 0], hFn: (sv) => W.stairY(L.TERR_Z + sv) + 0.16, maxTop: T + 0.2, seed: 15, batter: 0.06 });
    W.ishigaki = { front: front1.concat(front2), left };
    const ctx = new W.Ctx(B);
    const R = W.rng(19);
    for (let x = L.TERR_X; x < 16; x += 0.62) { if (x + 0.62 > L.STAIR_X0 - 0.35 && x < L.STAIR_X1 + 0.35) continue; ctx.add(W.g.soft(0.6, 0.18, 0.82, 0.06, 2), W.jit(0x9c9586, 0.4, R), [x + 0.31, T + 0.03, L.TERR_Z - 0.38], [0, R.range(-0.04, 0.04), 0], 1, [0, 0, 0, 3.0]); }
    for (let z = -15.95; z < L.TERR_Z - 0.3; z += 0.62) ctx.add(W.g.soft(0.82, 0.18, 0.6, 0.06, 2), W.jit(0x9c9586, 0.4, R), [L.TERR_X + 0.38, T + 0.03, z + 0.31], [0, R.range(-0.04, 0.04), 0], 1, [0, 0, 0, 3.0]);
  }

  // ---------- stone stair block (sando) ----------
  function buildStairs(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(31);
    const x0 = L.STAIR_X0, x1 = L.STAIR_X1, cx = (x0 + x1) / 2, w = x1 - x0;
    W.stairSteps = [];
    FLIGHTS.forEach((f) => {
      const [za, zb, ya, yb, n] = f;
      const run = (za - zb) / n, rise = (yb - ya) / n;
      for (let i = 0; i < n; i++) {
        const zc = za - run * (i + 0.5), ytop = ya + rise * (i + 1);
        const hgt = ytop + 0.3;
        const pieces = R() < 0.5 ? 2 : 3;
        let xs = x0;
        for (let p = 0; p < pieces; p++) {
          const pw = w / pieces;
          ctx.add(W.g.soft(pw - 0.03, hgt, run + 0.04, 0.05, 2), W.jit(0xa49c8c, 0.45, R), [xs + pw / 2, ytop - hgt / 2 - (p === 1 && pieces === 3 ? 0.025 : 0.0), zc], [0, R.range(-0.01, 0.01), 0], 1, [0, 0, 0, 3.0]);
          xs += pw;
        }
        ctx.add(W.g.box(w * 0.36, 0.01, run * 0.7), 0x8d8576, [cx, ytop + 0.003, zc], null, 1, [0, 0, 0, 3.0]);
        W.stairSteps.push([cx, ytop, zc, run]);
        if (R() < 0.7) ctx.add(W.g.blob(1, 1, 0.3, i * 7), W.jit(0x5d7d2a, 0.4, R), [x0 + 0.08, ytop + 0.01, zc], [0, R() * 3, 0], [0.12, 0.04, run * 0.45], [0, 0, 0, 4.0]);
        if (R() < 0.7) ctx.add(W.g.blob(1, 1, 0.3, i * 7 + 3), W.jit(0x5d7d2a, 0.4, R), [x1 - 0.08, ytop + 0.01, zc], [0, R() * 3, 0], [0.12, 0.04, run * 0.45], [0, 0, 0, 4.0]);
      }
    });
    LANDINGS.forEach((l) => {
      const [za, zb, y] = l; const d = za - zb;
      ctx.add(W.g.soft(w, y + 0.3, d, 0.05, 2), W.jit(0xa8a090, 0.3, R), [cx, y - (y + 0.3) / 2, (za + zb) / 2], null, 1, [0, 0, 0, 3.0]);
      for (let k = 1; k < 3; k++) ctx.add(W.g.box(w, 0.012, 0.025), 0x7f786c, [cx, y + 0.002, za - d * k / 3], null, 1, [0, 0, 0, 3.0]);
    });
    // coping stones along the stair walls (follow the slope)
    for (let z = L.TERR_Z; z < L.STAIR_Z0 + 0.1; z += 0.5) {
      const y = W.stairY(z + 0.25) + 0.16;
      [x0 - 0.2, x1 + 0.2].forEach((xx) => ctx.add(W.g.soft(0.5, 0.18, 0.52, 0.05, 2), W.jit(0x938c7e, 0.4, R), [xx, y, z + 0.25], null, 1, [0, 0, 0, 3.0]));
    }
    // terrace sando paving up to the sanctuary
    for (let z = L.TERR_Z - 0.1; z > -8.6; z -= 0.55) {
      for (let p = 0; p < 3; p++) ctx.add(W.g.soft(0.78, 0.12, 0.52, 0.03, 1), W.jit(0xb0a796, 0.35, R), [x0 + 0.42 + p * 0.83, L.TERR_Y + 0.02, z - 0.27], [0, R.range(-0.02, 0.02), 0], 1, [0, 0, 0, 3.0]);
    }
    // flat sando from the torii to the stair foot: slab spine, gravel shoulders, stone curbs
    for (let z = L.STAIR_Z0 + 0.1; z < 15.85; z += 0.62) {
      for (let p = 0; p < 3; p++) ctx.add(W.g.soft(0.8, 0.12, 0.58, 0.03, 1), W.jit(0xb3aa98, 0.35, R), [x0 + 0.42 + p * 0.83, 0.03, z + 0.3], [0, R.range(-0.02, 0.02), 0], 1, [0, 0, 0, 3.0]);
      [x0 - 0.95, x1 + 0.95].forEach((xx) => { if (xx < 10 && z > 5.9 && z < 7.6) return; ctx.add(W.g.soft(0.14, 0.12, 0.6, 0.03, 1), W.jit(0x8e877a, 0.3, R), [xx, 0.05, z + 0.3], null, 1, [0, 0, 0, 3.0]); });
    }
  }

  // ---------- stream bed details & water ribbon ----------
  function buildStream(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(41);
    const P = L.streamPts;
    for (let i = 0; i < P.length; i += 1) {
      const t = i / (P.length - 1);
      const p = P[i]; const nxt = P[Math.min(P.length - 1, i + 1)];
      const dx = nxt.x - p.x, dz = nxt.z - p.z; const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const wd = L.streamWidth(t);
      for (let k = 0; k < 3; k++) {
        const o = R.range(-wd * 0.9, wd * 0.9);
        const x = p.x + nx * o, z = p.z + nz * o;
        const r = R.range(0.04, 0.11);
        ctx.add(W.g.ico(1, 1), W.jit(R() < 0.5 ? 0xa59d90 : 0x8a8f8e, 0.5, R), [x, W.H(x, z) + r * 0.3, z], [R() * 3, R() * 3, 0], [r * 1.3, r * 0.6, r], [0, 0, 0.6, 3.0]);
      }
      if (R() < 0.35 && t < 0.95) {
        const side = R() < 0.5 ? -1 : 1;
        const o = side * (wd + R.range(0.05, 0.3));
        const x = p.x + nx * o, z = p.z + nz * o;
        const r = R.range(0.12, 0.3);
        ctx.add(W.g.blob(1, 1, 0.2, i), W.jit(0x928b7e, 0.5, R), [x, W.H(x, z) + r * 0.15, z], [0, R() * 6, 0], [r * 1.3, r * 0.6, r], [0, 0, 0, 3.0]);
      }
    }
    const pos = [], uvs = [], idx = [], nor = [];
    let acc = 0;
    for (let i = 0; i < P.length; i++) {
      const t = i / (P.length - 1);
      const p = P[i]; const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const wd = L.streamWidth(t) * 0.82;
      if (i > 0) acc += P[i].distanceTo(P[i - 1]);
      pos.push(p.x + nx * wd, -0.12, p.z + nz * wd, p.x - nx * wd, -0.12, p.z - nz * wd);
      nor.push(0, 1, 0, 0, 1, 0);
      uvs.push(acc / 6, 0, acc / 6, 1);
      if (i > 0) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, W.makeFlowMat({ speed: 0.55 }));
    m.layers.set(W.LAYER.FX); m.renderOrder = 2;
    W.scene.add(m);
    W.streamMesh = m;
    // thin waterfall over the ishigaki front face
    const wx = L.stream[0][0];
    const cg = new THREE.PlaneGeometry(0.55, L.TERR_Y + 0.3, 1, 12);
    const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i) + (L.TERR_Y + 0.3) / 2;
      cp.setZ(i, 0.12 + (L.TERR_Y - y) * 0.16 * 0.55 + Math.sin(y * 3) * 0.03);
      cp.setX(i, cp.getX(i) * (0.65 + 0.35 * (1 - y / L.TERR_Y)));
    }
    cg.computeVertexNormals();
    const cm = new THREE.Mesh(cg, W.makeFlowMat({ speed: 1.6, scale: 0.6, tint: 0x8fd3e0 }));
    cm.position.set(wx, (L.TERR_Y + 0.3) / 2 - 0.25, L.TERR_Z);
    const cu = cg.attributes.uv; for (let i = 0; i < cu.count; i++) { const u = cu.getX(i), v = cu.getY(i); cu.setXY(i, (1 - v) * 1.6, u); }
    cm.layers.set(W.LAYER.FX); cm.renderOrder = 2;
    W.scene.add(cm);
    // overflow channel on the terrace from the temizuya to the edge
    const ch = new W.Ctx(B);
    const cz0 = -7.35, cz1 = L.TERR_Z - 0.05;
    for (let k = 0; k < 7; k++) {
      const z = cz0 + (k + 0.5) * (cz1 - cz0) / 7;
      ch.add(W.g.box(0.12, 0.14, 0.31), 0x8c8577, [wx - 0.3, L.TERR_Y + 0.05, z], null, 1, [0, 0, 0, 3.0]);
      ch.add(W.g.box(0.12, 0.14, 0.31), 0x8c8577, [wx + 0.3, L.TERR_Y + 0.05, z], null, 1, [0, 0, 0, 3.0]);
    }
    const chm = new THREE.Mesh(new THREE.PlaneGeometry(0.48, cz1 - cz0), W.makeFlowMat({ speed: 0.8, tint: 0x7fc8d8 }));
    chm.rotation.x = -Math.PI / 2; chm.position.set(wx, L.TERR_Y + 0.07, (cz0 + cz1) / 2);
    const chu = chm.geometry.attributes.uv; for (let i = 0; i < chu.count; i++) { const u = chu.getX(i), v = chu.getY(i); chu.setXY(i, (1 - v) * 0.6, u); }
    chm.layers.set(W.LAYER.FX); chm.renderOrder = 2;
    W.scene.add(chm);
    const pc = new V3(wx, -0.13, L.TERR_Z + 0.55);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.8, 28), W.makeFlowMat({ still: true, tint: 0x6dbfd2 }));
    pool.rotation.x = -Math.PI / 2; pool.position.copy(pc);
    pool.layers.set(W.LAYER.FX); pool.renderOrder = 2;
    W.scene.add(pool);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2; const r = R.range(0.75, 1.0);
      ctx.add(W.g.blob(1, 1, 0.2, 300 + k), W.jit(0x8c877c, 0.5, R), [pc.x + Math.cos(a) * r, -0.05, pc.z + Math.sin(a) * r * 0.8], [0, R() * 6, 0], [R.range(0.18, 0.3), R.range(0.14, 0.26), R.range(0.18, 0.28)], [0, 0, 0.5, 3.0]);
    }
    W.waterfallFoot = pc.clone();
  }

  // ---------- stepping stones & paths ----------
  // garden path: gate → slab path → stepping stones → engawa steps; branch along the pond's back bank → arched bridge → sando
  W.paths = {
    toEngawa: [[-10.0, 6.3], [-9.85, 5.1], [-10.1, 3.9], [-9.9, 2.7], [-10.05, 1.5], [-10.0, 0.45]],
    branch: [[-8.65, 1.15], [-7.35, 1.85], [-6.0, 2.6], [-4.7, 3.3], [-3.35, 3.8], [-2.0, 4.1], [-0.65, 4.05], [0.55, 3.5]],
    toSando: [[4.55, 3.2], [5.6, 3.95], [6.6, 4.8], [7.55, 5.7], [8.45, 6.55]],
    toBench: [[-1.15, 2.85], [-0.95, 1.65], [-0.75, 0.45], [-0.55, -0.75], [-0.4, -1.95], [-0.3, -2.95]],
    limeLeft: [[-4.0, 5.3], [-4.55, 6.45], [-5.05, 7.6], [-5.4, 8.75]],
    limeRight: [[5.55, 9.25], [6.55, 8.65], [7.5, 8.05], [8.4, 7.45]],
    yatsu: [[1.45, 5.75], [5.05, 5.55]],
  };
  function buildPaths(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(51);
    const gx = L.GATE_X;
    for (let z = 15.7; z > 7.0; z -= 0.92) {
      ctx.add(W.g.soft(1.15, 0.16, 0.82, 0.04, 2), W.jit(0xa9a191, 0.3, R), [gx + R.range(-0.04, 0.04), W.H(gx, z - 0.45) + 0.04, z - 0.45], [0, R.range(-0.03, 0.03), 0], 1, [0, 0, 0, 3.0]);
      for (let k = 0; k < 6; k++) {
        const side = k % 2 ? 1 : -1;
        ctx.add(W.g.ico(1, 0), W.jit(0x9d978b, 0.5, R), [gx + side * R.range(0.65, 0.8), W.H(gx, z) + 0.02, z - R.range(0, 0.9)], [R() * 3, R() * 3, 0], [0.06, 0.035, 0.05], [0, 0, 0, 3.0]);
      }
    }
    const stones = (pts, sz) => {
      pts.forEach((p, i) => {
        const r = (sz || 0.34) * R.range(0.85, 1.15);
        ctx.add(W.g.blob(1, 1, 0.12, 500 + i), W.jit(R() < 0.5 ? 0xa39b8b : 0x958e82, 0.4, R), [p[0], W.H(p[0], p[1]) + 0.03, p[1]], [0, R() * 6, 0], [r * 1.15, 0.09, r], [0, 0, 0, 3.0]);
      });
    };
    stones(W.paths.toEngawa, 0.37);
    stones(W.paths.branch, 0.33);
    stones(W.paths.toSando, 0.33);
    stones(W.paths.toBench, 0.3);
    stones(W.paths.limeLeft, 0.3);
    stones(W.paths.limeRight, 0.3);
    stones(W.paths.yatsu, 0.3);
    // step stones under the engawa stairs
    ctx.add(W.g.soft(1.1, 0.32, 0.62, 0.08, 2), 0x8f897c, [L.STEPS_X, 0.28, -0.3], null, 1, [0, 0, 0, 3.0]);
    ctx.add(W.g.soft(0.9, 0.3, 0.55, 0.08, 2), 0x8f897c, [-3.95, 0.28, -6.1], null, 1, [0, 0, 0, 3.0]);
    // stone edging between the studio gravel and the moss
    for (let x = -15.8; x < -4.2; x += 0.34) { if (Math.abs(x - L.STEPS_X) < 0.7) continue; ctx.add(W.g.blob(1, 1, 0.15, Math.round(x * 30)), W.jit(0x8a857a, 0.4, R), [x, W.H(x, -0.25) + 0.03, -0.25], null, [0.15, 0.08, 0.12], [0, 0, 0, 3.0]); }
    for (let z = -11.8; z < -0.3; z += 0.34) ctx.add(W.g.blob(1, 1, 0.15, Math.round(z * 30) + 7), W.jit(0x8a857a, 0.4, R), [-4.05, W.H(-4.05, z) + 0.03, z], null, [0.12, 0.08, 0.15], [0, 0, 0, 3.0]);
  }

  // ---------- moss tufts ----------
  function buildMossTufts(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(61);
    for (let k = 0; k < 560; k++) {
      const x = R.range(-15.8, 15.8), z = R.range(-15.8, 15.8);
      const rg = region(x, z);
      if (rg !== 'moss' && rg !== 'tmoss' && rg !== 'ginkgoMoss') continue;
      if (Math.hypot(x - L.POND.x, z - L.POND.z) < L.POND.r + 0.3) continue;
      if (W.inStairBlock(x, z)) continue;
      const r = R.range(0.15, 0.45);
      ctx.add(W.g.blob(1, 1, 0.25, k), W.jit(R() < 0.5 ? 0x56782a : 0x5f8230, 0.18, R), [x, W.H(x, z) - r * 0.16, z], [0, R() * 6, 0], [r, r * 0.26, r * R.range(0.7, 1.1)], [0, 0, 0, 4.0]);
    }
    const mush = [[-14.0, 5.0], [-14.3, 4.8], [-13.6, 9.8], [6.6, -1.6], [6.9, -1.2], [14.0, 1.4], [-3.7, -2.0], [13.8, 0.6]];
    mush.forEach((m, i) => {
      const y = W.H(m[0], m[1]);
      const s = R.range(0.7, 1.2);
      ctx.add(W.g.cyl(0.015, 0.02, 0.08, 6), 0xf0e6d2, [m[0], y + 0.04 * s, m[1]], null, 1);
      ctx.add(W.g.sph(1, 10), i % 3 ? 0xc0532e : 0xb88a56, [m[0], y + 0.08 * s, m[1]], null, [0.05 * s, 0.03 * s, 0.05 * s]);
    });
  }

  W.terrain = {
    build: function () {
      const B = W.bucket('terrain');
      buildGround(B);
      buildSections(B);
      buildStoneWalls(B);
      buildStairs(B);
      const B2 = W.bucket('garden');
      buildStream(B2);
      buildPaths(B2);
      buildMossTufts(B2);
    },
  };
})();
