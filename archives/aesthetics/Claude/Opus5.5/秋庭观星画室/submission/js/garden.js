/* garden vignettes */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C, L = W.L;
  const ST = [0, 0, 0, 3.0], FW = [0, 0, 0, 1.0], FWY = [0, 0, 0, 1.25], FWZ = [0, 0, 0, 1.5], LAQ = [0, 0, 0, 10.0];
  const BAMBOO = 0xb8a868, BAMBOO2 = 0x9a8a50;

  // ---------- gate & fences ----------
  function fenceRun(ctx, a, b, h, R) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const c = ctx.at([a[0], 0, a[1]], [0, ry, 0]);
    // kenninji-gaki: tight split-bamboo slats with binding rails
    const n = Math.floor(len / 0.075);
    for (let i = 0; i < n; i++) {
      const z = (i + 0.5) * len / n;
      const p = new V3(a[0], 0, a[1]).lerp(new V3(b[0], 0, b[1]), (i + 0.5) / n);
      const y0 = W.H(p.x, p.z) - 0.05;
      c.box(0.035, h + 0.05, 0.07, W.jit(BAMBOO, 0.18, R), [0, y0 + (h + 0.05) / 2, z], null, FWY);
    }
    [0.25, 0.65, 1.05].forEach((y) => {
      if (y > h) return;
      const g = W.g.cyl(0.03, 0.03, len, 8);
      c.add(g, BAMBOO2, [0.05, y, len / 2], [Math.PI / 2, 0, 0], 1);
      c.add(g, BAMBOO2, [-0.05, y, len / 2], [Math.PI / 2, 0, 0], 1);
    });
    c.box(0.14, 0.05, len, 0x7a6a3a, [0, h + 0.02, len / 2], null, FWZ);
    for (let z = 0; z <= len; z += 1.8) c.add(W.g.cyl(0.05, 0.05, h + 0.2, 8), 0x6a5a3a, [0, (h + 0.2) / 2, z], null, 1, FWY);
  }
  // low yotsume-gaki: posts, two rails, sparse uprights
  function lowFence(ctx, a, b) {
    const R = W.rng(Math.round(a[0] * 31 + a[1] * 17));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const c = ctx.at([a[0], 0, a[1]], [0, ry, 0]);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i <= n; i++) {
      const z = i * len / n;
      c.add(W.g.cyl(0.04, 0.045, 0.7, 7), W.jit(0x8a6a44, 0.2, R), [0, 0.35, z], null, 1, FWY);
      if (i < n) for (let k = 1; k < 3; k++) c.add(W.g.cyl(0.018, 0.018, 0.62, 5), W.jit(BAMBOO, 0.2, R), [0, 0.32, z + k * len / n / 3], null, 1, FWY);
    }
    [0.28, 0.55].forEach((y) => c.add(W.g.cyl(0.022, 0.022, len, 6), BAMBOO2, [0.04, y, len / 2], [Math.PI / 2, 0, 0], 1));
  }

  function gate(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(501);
    const GX = L.GATE_X;
    fenceRun(ctx, [-15.85, 15.75], [GX - 1.05, 15.75], 1.25, R);
    fenceRun(ctx, [GX + 1.05, 15.75], [-3.7, 15.75], 1.25, R);
    fenceRun(ctx, [-15.82, -0.35], [-15.82, 15.7], 1.25, R);
    // gate: two posts, small roof, open doors
    const g = ctx.at([GX, 0, 15.72]);
    [-1, 1].forEach((s) => {
      g.add(W.g.box(0.16, 2.35, 0.16), 0x5a4030, [s * 0.95, 1.17, 0], null, 1, FWY);
      g.add(W.g.box(0.12, 2.0, 0.12), 0x5a4030, [s * 0.95, 1.0, -0.6], null, 1, FWY);
      g.add(W.g.box(0.1, 0.1, 0.7), 0x5a4030, [s * 0.95, 1.95, -0.3], null, 1, FWZ);
    });
    g.box(2.3, 0.14, 0.16, 0x5a4030, [0, 2.3, 0], null, FW);
    g.box(2.1, 0.1, 0.12, 0x5a4030, [0, 1.95, 0], null, FW);
    // roof (cedar bark, brown) gable
    [-1, 1].forEach((s) => g.add(W.g.box(2.9, 0.08, 0.75), 0x6a4a36, [0, 2.62, s * 0.3 - 0.0], [s * 0.55, 0, 0], 1, [0, 0, 0, 6.0]));
    g.add(W.g.cyl(0.07, 0.07, 2.95, 8), 0x3a2a20, [0, 2.84, 0], [0, 0, Math.PI / 2], 1);
    // door leaves swung open inward
    [-1, 1].forEach((s) => {
      const d = g.at([s * 0.88, 0.15, -0.02], [0, s * (Math.PI / 2 - 0.25), 0]);
      d.box(0.06, 1.7, 0.04, 0x7a5a3a, [-s * 0.02, 0.85, 0], null, FWY);
      d.box(0.06, 1.7, 0.04, 0x7a5a3a, [-s * 0.82, 0.85, 0], null, FWY);
      for (let k = 0; k < 9; k++) d.box(0.08, 1.6, 0.025, W.jit(BAMBOO, 0.15, R), [-s * (0.08 + k * 0.085), 0.85, 0], null, FWY);
      d.box(0.82, 0.05, 0.05, 0x7a5a3a, [-s * 0.42, 0.3, 0.02], null, FW);
      d.box(0.82, 0.05, 0.05, 0x7a5a3a, [-s * 0.42, 1.4, 0.02], null, FW);
    });
    // mailbox (round post)
    const m = ctx.at([GX - 1.5, 0, 15.12], [0, -0.15, 0]);
    m.add(W.g.cyl(0.24, 0.25, 0.25, 20), 0x2a2a2a, [0, 0.12, 0], null, 1);
    m.add(W.g.cyl(0.22, 0.22, 1.0, 22), 0xc8281e, [0, 0.75, 0], null, 1, [0, 0, 0, 12.0]);
    m.add(W.g.sph(1, 22), 0xc8281e, [0, 1.25, 0], null, [0.23, 0.16, 0.23], [0, 0, 0, 12.0]);
    m.add(W.g.cyl(0.24, 0.24, 0.05, 22), 0xa81e18, [0, 1.25, 0], null, 1, [0, 0, 0, 12.0]);
    m.box(0.22, 0.03, 0.06, 0x1a1a1a, [0, 1.12, 0.21], null);
    m.box(0.26, 0.26, 0.01, 0xffffff, [0, 0.72, 0.222], null, [0, 0, 0, 0], W.atlas.get('mail'));
    W.mailbox = new V3(GX - 1.5, 1.0, 15.12);
    // bicycle leaning on fence, basket with bouquet
    const bk = ctx.at([GX + 2.4, 0, 15.38], [0, Math.PI / 2, 0.12]);
    const wheel = (z) => { bk.add(W.g.torus(0.33, 0.025, 6, 30), 0x2a2a2a, [0, 0.35, z], [0, Math.PI / 2, 0], 1); bk.add(W.g.torus(0.3, 0.008, 4, 24), 0xb8b8b0, [0, 0.35, z], [0, Math.PI / 2, 0], 1, [0, 0, 0, 12.0]); for (let k = 0; k < 8; k++) bk.box(0.004, 0.6, 0.004, 0xb8b8b0, [0, 0.35, z], [k / 8 * Math.PI, 0, 0], [0, 0, 0, 12.0]); bk.add(W.g.cyl(0.03, 0.03, 0.08, 8), 0x8a8a8a, [0, 0.35, z], [0, 0, Math.PI / 2], 1); };
    wheel(-0.52); wheel(0.52);
    const tube = (a, b2, r, col) => bk.add(W.g.tube([new V3(...a), new V3(...b2)], r || 0.022, r || 0.022, 6, 2), col || 0x2f6a5a, null, null, undefined, [0, 0, 0, 12.0]);
    tube([0, 0.35, -0.52], [0, 0.42, -0.05]); tube([0, 0.42, -0.05], [0, 0.85, -0.12]); tube([0, 0.85, -0.12], [0, 0.85, 0.38]); tube([0, 0.42, -0.05], [0, 0.82, 0.4]); tube([0, 0.35, -0.52], [0, 0.85, -0.12]);
    tube([0, 0.35, 0.52], [0, 0.95, 0.4]); tube([0, 0.95, 0.4], [0, 1.0, 0.38]);
    tube([-0.25, 1.02, 0.36], [0.25, 1.02, 0.36], 0.014, 0x9a9a9a);
    bk.add(W.g.soft(0.12, 0.05, 0.24, 0.02, 2), 0x3a2a22, [0, 0.9, -0.14], null, 1);
    bk.add(W.g.soft(0.08, 0.08, 0.06, 0.02, 2), 0xc8c8c0, [0, 0.42, -0.05], null, 1, [0, 0, 0, 12.0]);
    const bs = bk.at([0, 0.98, 0.58]);
    bs.box(0.34, 0.22, 0.26, 0xb08a52, [0, 0.0, 0], null, FWY);
    bs.box(0.3, 0.02, 0.22, 0x8a6a3a, [0, 0.11, 0], null, FW);
    const bq = bs.at([0, 0.18, 0], [0.3, 0, 0.6]);
    bq.add(W.g.cone(0.08, 0.36, 10, true), 0xd8b080, [0, -0.05, 0], [Math.PI, 0, 0], 1, [0, 0, 0, 7.0]);
    for (let i = 0; i < 6; i++) W.flowerHead(new W.Ctx(B), bq.worldPos([R.range(-0.05, 0.05), 0.15, R.range(-0.05, 0.05)]), ['rose', 'cosmos', 'ranunculus'][i % 3], [0xe83a3a, 0xf28aa8, 0xf2a03a][i % 3], 0.045, R);
    // well with windlass
    const w = ctx.at([-13.8, 0, 12.3]);
    w.add(W.g.cyl(0.6, 0.62, 0.75, 20, false), 0x8a857a, [0, 0.37, 0], null, 1, ST, null, (lx, ly, lz) => C(0x8a857a).clone().multiplyScalar(0.85 + 0.25 * ((Math.floor(ly * 6) + Math.floor(Math.atan2(lz, lx) * 3)) % 2)));
    w.add(W.g.cyl(0.5, 0.5, 0.74, 20, true), 0x4a4640, [0, 0.38, 0], null, 1, ST);
    for (let k = 0; k < 6; k++) w.box(1.3, 0.05, 0.2, 0x8a6a46, [0, 0.77, -0.5 + k * 0.2], [0, 0, 0], FW);
    w.box(0.08, 0.05, 1.25, 0x6a4a30, [-0.35, 0.82, 0], null, FWZ); w.box(0.08, 0.05, 1.25, 0x6a4a30, [0.35, 0.82, 0], null, FWZ);
    [-1, 1].forEach((s) => w.box(0.1, 1.6, 0.1, 0x5a4030, [s * 0.66, 0.8 + 0.4, 0], null, FWY));
    w.box(1.55, 0.1, 0.12, 0x5a4030, [0, 2.05, 0], null, FW);
    w.add(W.g.cyl(0.07, 0.07, 1.25, 10), 0x7a5a3a, [0, 1.8, 0], [0, 0, Math.PI / 2], 1, FW);
    w.add(W.g.torus(0.16, 0.03, 6, 16), 0x6a4a30, [0.4, 1.8, 0], [0, Math.PI / 2, 0], 1);
    for (let k = 0; k < 6; k++) w.box(0.02, 0.3, 0.02, 0x6a4a30, [0.4, 1.8, 0], [k / 6 * Math.PI, 0, 0]);
    w.add(W.g.cyl(0.075, 0.075, 0.3, 10), 0xc8b088, [0, 1.8, 0], [0, 0, Math.PI / 2], 1);
    w.add(W.g.cyl(0.006, 0.006, 0.9, 4), 0xc8b088, [0.0, 1.35, 0.07], null, 1);
    const wb = w.at([0.45, 0, 0.85]);
    wb.add(W.g.cyl(0.16, 0.14, 0.28, 14), 0xa8804e, [0, 0.14, 0], null, 1, FWY);
    wb.add(W.g.torus(0.16, 0.012, 4, 16), 0x3a3030, [0, 0.22, 0], [Math.PI / 2, 0, 0], 1);
    wb.add(W.g.torus(0.15, 0.012, 4, 16), 0x3a3030, [0, 0.06, 0], [Math.PI / 2, 0, 0], 1);
    wb.box(0.03, 0.2, 0.04, 0xa8804e, [0, 0.38, 0], null, FWY);
    W.wellPos = new V3(-13.8, 0.8, 12.3);
  }

  // ---------- bonsai shelf, chrysanthemums, goldfish jar ----------
  function bonsaiArea(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(511);
    const s = ctx.at([-7.7, 0.1, 0.35], [0, 0.0, 0]);
    const w = 2.3;
    [[0, 0.35, 0.36], [1, 0.75, 0.0], [2, 1.15, -0.36]].forEach(([i, y, z]) => {
      s.box(w, 0.05, 0.34, 0x8a6440, [0, y, z], null, FW);
      [-1, 1].forEach((sx) => s.box(0.06, y, 0.06, 0x6a4a30, [sx * (w / 2 - 0.05), y / 2, z + 0.14], null, FWY));
      [-1, 1].forEach((sx) => s.box(0.06, y, 0.06, 0x6a4a30, [sx * (w / 2 - 0.05), y / 2, z - 0.14], null, FWY));
    });
    const pot = (c, x, y, z, wv, col) => { c.add(W.g.soft(wv, 0.09, wv * 0.65, 0.015, 2), col, [x, y + 0.07, z], null, 1, [0, 0, 0, 6.0]); c.add(W.g.box(wv - 0.03, 0.01, wv * 0.6), 0x4a3a2a, [x, y + 0.115, z]); };
    const miniTree = (c, x, y, z, col, kind, sc) => {
      const t = c.at([x, y + 0.12, z], null, sc || 1);
      const pts = [new V3(0, 0, 0), new V3(0.05, 0.1, 0.0), new V3(-0.04, 0.2, 0.02), new V3(0.08, 0.28, 0)];
      t.add(W.g.tube(pts, 0.03, 0.012, 5, 6), 0x5a4030, null, null, undefined, [0, 0, 0, 17.0]);
      [[0.1, 0.3, 0], [-0.08, 0.24, 0.02], [0.02, 0.36, 0.0]].forEach((p, k) => {
        const cc = W.jit(col, 0.2, R);
        t.add(W.g.blob(1, 1, 0.2, 520 + k), cc, p, null, [0.1, kind === 'pine' ? 0.04 : 0.07, 0.08], [0, 0.03, 0, 8.0]);
        if (kind !== 'pine') for (let q = 0; q < 6; q++) t.add(W.g.leaf('maple'), W.jit(col, 0.3, R), [p[0] + R.range(-0.09, 0.09), p[1] + R.range(-0.02, 0.06), p[2] + R.range(-0.07, 0.07)], [R() - 0.5, R() * 6, 0], 0.04, [0, 0.03, 0, 8.0]);
      });
    };
    [[-0.8, 0.35, 0.36, 'pine'], [-0.05, 0.35, 0.36, 'maple'], [0.75, 0.35, 0.36, 'moss'], [-0.6, 0.75, 0, 'maple'], [0.25, 0.75, 0, 'pine'], [0.85, 0.75, 0, 'moss'], [-0.2, 1.15, -0.36, 'maple'], [0.55, 1.15, -0.36, 'pine']].forEach((p, i) => {
      if (p[3] === 'moss') {
        s.add(W.g.cyl(0.08, 0.06, 0.03, 10), 0x8a8a8a, [p[0], p[1] + 0.04, p[2]], null, 1);
        s.add(W.g.blob(1, 2, 0.12, 540 + i), 0x4f7a2a, [p[0], p[1] + 0.15, p[2]], null, 0.09, [0, 0, 0, 4.0]);
        s.add(W.g.leaf('narrow'), 0x5f8a3a, [p[0], p[1] + 0.27, p[2]], [0.3, 0, 0], [0.05, 1, 0.14], [0, 0.04, 0, 8.0]);
        return;
      }
      pot(s, p[0], p[1], p[2], 0.34, [0x3a4a5a, 0x7a4a2e, 0x5a6a4a][i % 3]);
      miniTree(s, p[0], p[1], p[2], p[3] === 'pine' ? 0x2f5a2c : [0xd8301c, 0xe8601c][i % 2], p[3], 1.4);
    });
    // chrysanthemum rows (yellow, white, purple)
    const cols = [0xf2c23a, 0xf6f0e0, 0x9a5ac8];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 6; i++) {
        const x = -13.75 + i * 0.5, z = 0.0 + r * 0.5;
        const y = W.H(x, z);
        const c = ctx.at([x, y, z]);
        c.add(W.g.lathe([[0, 0], [0.12, 0], [0.15, 0.2], [0, 0.2]], 12, 'mumpot'), 0x9a6a4a, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
        c.add(W.g.cyl(0.006, 0.006, 0.7, 4), 0x9a8a5a, [0.05, 0.5, 0], null, 1);
        c.add(W.g.tube([new V3(0, 0.18, 0), new V3(0.02, 0.45, 0), new V3(0.0, 0.62, 0)], 0.008, 0.006, 4, 4), 0x4a6a2a, null, null, undefined, [0, 0.12, 0, 0]);
        for (let k = 0; k < 8; k++) c.add(W.g.leaf('maple'), W.jit(0x3f6a2a, 0.2, R), [R.range(-0.1, 0.1), 0.25 + k * 0.045, R.range(-0.1, 0.1)], [R.range(-0.5, 0.5), R() * 6, 0], 0.07, [0, 0.1, 0, 8.0]);
        W.flowerHead(new W.Ctx(B), c.worldPos([0, 0.64, 0]), 'mum', cols[r], 0.17, R, [0.35, R() * 6, 0]);
      }
    }
    // big ceramic jar with goldfish
    const jx = -5.65, jz = 0.55;
    ctx.add(W.g.lathe([[0, 0], [0.3, 0], [0.48, 0.2], [0.52, 0.45], [0.46, 0.62], [0.44, 0.66], [0.47, 0.68], [0.43, 0.7], [0, 0.7]], 28, 'kame'), 0x3a5a6a, [jx, 0.05, jz], null, 1, [0, 0, 0, 6.0], null, (lx, ly) => C(ly > 0.5 ? 0x4a7a8a : 0x3a5a6a));
    const wm = new THREE.Mesh(new THREE.CircleGeometry(0.43, 26), W.makeFlowMat({ still: true, tint: 0x5cae9a }));
    wm.rotation.x = -Math.PI / 2; wm.position.set(jx, 0.73, jz); wm.layers.set(W.LAYER.FX); wm.renderOrder = 2; W.scene.add(wm);
    for (let i = 0; i < 3; i++) ctx.add(W.g.leaf(i ? 'maple' : 'ginkgo'), [0xd8301c, 0xf0b820, 0xe8601c][i], [jx + R.range(-0.25, 0.25), 0.735, jz + R.range(-0.25, 0.25)], [0, R() * 6, 0], 0.11, [0, 0, 0, 8.0]);
    W.goldfishJar = new V3(jx, 0.62, jz);
    // small tools: trowel, stacked pots
    ctx.add(W.g.box(0.06, 0.01, 0.14), 0x9aa0a8, [-6.3, 0.12, 1.2], [0, 0.6, 0], 1, [0, 0, 0, 12.0]);
    ctx.add(W.g.cyl(0.015, 0.015, 0.12, 6), 0x7a4a2a, [-6.22, 0.12, 1.09], [Math.PI / 2, 0.6, 0], 1);
    for (let i = 0; i < 3; i++) ctx.add(W.g.cyl(0.15, 0.11, 0.18, 12, true), 0xb5643a, [-8.95, 0.2 + i * 0.06, 1.15], null, 1);
  }

  // ---------- stream features: shishi-odoshi, tsukubai, bridges ----------
  function streamFeatures(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(521);
    // shishi-odoshi
    const so = new V3(5.55, W.H(5.55, -2.35), -2.35);
    const base = ctx.at([so.x, so.y, so.z], [0, -0.55, 0]);
    [-1, 1].forEach((s) => base.add(W.g.cyl(0.04, 0.045, 0.6, 8), BAMBOO, [s * 0.12, 0.3, 0], null, 1, FWY));
    base.add(W.g.cyl(0.015, 0.015, 0.3, 6), 0x6a5a3a, [0, 0.42, 0], [0, 0, Math.PI / 2], 1);
    base.add(W.g.blob(1, 1, 0.15, 61), 0x7a756a, [0, 0.08, 0.62], null, [0.2, 0.14, 0.18], ST);
    // feeding pipe (kakehi)
    base.add(W.g.cyl(0.035, 0.035, 0.9, 8), BAMBOO, [0, 0.95, -0.75], [1.2, 0, 0], 1);
    base.add(W.g.cyl(0.035, 0.035, 0.8, 8), BAMBOO, [0, 0.55, -1.15], null, 1, FWY);
    W.kakehiEnd = base.worldPos([0, 0.78, -0.35]);
    const tube = W.part('shishi', base.worldPos([0, 0.42, 0]));
    const tr = -0.55;
    const tc = tube.ctx.at([0, 0, 0], [0, tr, 0]);
    tc.add(W.g.cyl(0.05, 0.05, 1.0, 10), C(0x9ab050), [0, 0, 0.05], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 1.5]);
    tc.add(W.g.cyl(0.054, 0.054, 0.03, 10), 0x7a8a40, [0, 0, -0.15], [Math.PI / 2, 0, 0], 1);
    tc.add(W.g.cyl(0.054, 0.054, 0.03, 10), 0x7a8a40, [0, 0, 0.25], [Math.PI / 2, 0, 0], 1);
    tc.add(W.g.cyl(0.045, 0.045, 0.02, 10), 0x5a7a7a, [0, 0, -0.45], [Math.PI / 2, 0, 0], 1);
    W.shishi = tube;
    // tsukubai with ladle
    const tk = ctx.at([6.15, W.H(6.15, -1.0), -1.0]);
    tk.add(W.g.cyl(0.38, 0.42, 0.42, 16), 0x8e887c, [0, 0.21, 0], null, 1, ST);
    tk.add(W.g.cyl(0.22, 0.2, 0.06, 16), 0x3a5a6a, [0, 0.41, 0], null, 1, ST);
    const tw = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), W.makeFlowMat({ still: true, tint: 0x7cc4d4 }));
    tw.rotation.x = -Math.PI / 2; tw.position.copy(tk.worldPos([0, 0.425, 0])); tw.layers.set(W.LAYER.FX); W.scene.add(tw);
    tk.add(W.g.cyl(0.006, 0.006, 0.55, 4), 0xc8b080, [0.0, 0.47, 0.0], [0, 0, Math.PI / 2 - 0.08], 1);
    tk.add(W.g.cyl(0.045, 0.045, 0.06, 10, false), 0xc8b080, [0.25, 0.5, 0.0], null, 1);
    for (let k = 0; k < 4; k++) tk.add(W.g.blob(1, 1, 0.2, 70 + k), W.jit(0x8a857a, 0.4, R), [Math.cos(k * 1.7) * 0.55, 0.06, Math.sin(k * 1.7) * 0.55], null, [0.18, 0.12, 0.16], ST);
    W.tsukubai = tk.worldPos([0, 0.45, 0]);
    // arched vermilion bridge
    const bc = new V3(2.55, 0, 2.6), dir = new V3(1.0, 0, 0.02).normalize();
    const bry = Math.atan2(dir.x, dir.z);
    const br = ctx.at([bc.x, 0, bc.z], [0, bry, 0]);
    const span = 2.8, rise = 0.55, bw = 0.9;
    const arcY = (t) => Math.sin(t * Math.PI) * rise + 0.1;
    const nseg = 14;
    for (let i = 0; i < nseg; i++) {
      const t0 = i / nseg, t1 = (i + 1) / nseg, tm = (t0 + t1) / 2;
      const z0 = (t0 - 0.5) * span, z1 = (t1 - 0.5) * span;
      const y0 = arcY(t0), y1 = arcY(t1);
      const ang = Math.atan2(y1 - y0, z1 - z0);
      br.box(bw, 0.06, Math.hypot(z1 - z0, y1 - y0) + 0.01, 0x8a6040, [0, (y0 + y1) / 2, (z0 + z1) / 2], [-ang, 0, 0], [0, 0, 0, 16.5]);
      [-1, 1].forEach((s) => {
        br.box(0.08, 0.14, Math.hypot(z1 - z0, y1 - y0) + 0.02, 0xd8401e, [s * bw / 2, (y0 + y1) / 2 - 0.05, (z0 + z1) / 2], [-ang, 0, 0], LAQ);
        br.box(0.06, 0.06, Math.hypot(z1 - z0, y1 - y0) + 0.02, 0xd8401e, [s * bw / 2, (y0 + y1) / 2 + 0.58, (z0 + z1) / 2], [-ang, 0, 0], LAQ);
        if (i % 3 === 0) br.box(0.07, 0.6, 0.07, 0xd8401e, [s * bw / 2, y0 + 0.29, z0], null, LAQ);
      });
    }
    [-1, 1].forEach((s) => [0, 1].forEach((e) => {
      const z = (e - 0.5) * span;
      br.add(W.g.cyl(0.055, 0.055, 0.78, 10), 0xd8401e, [s * bw / 2, 0.4, z], null, 1, LAQ);
      br.add(W.g.sph(1, 10), 0xc9a24a, [s * bw / 2, 0.84, z], null, [0.07, 0.1, 0.07], [0, 0, 0, 9.0]);
    }));
    // bridge piers
    [-0.32, 0.32].forEach((zf) => [-1, 1].forEach((s) => br.add(W.g.cyl(0.05, 0.05, 0.6, 8), 0x3a2a20, [s * bw * 0.4, 0.0, zf * span], null, 1)));
    W.bridge = { c: bc, dir, span, rise };
    // yatsuhashi: zigzag planks over the widened stream
    const yz = [[1.8, 5.75], [2.55, 5.35], [3.2, 5.85], [3.9, 5.45], [4.6, 5.7]];
    for (let i = 0; i < yz.length - 1; i++) {
      const a = yz[i], b = yz[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const c = ctx.at([(a[0] + b[0]) / 2, -0.02, (a[1] + b[1]) / 2], [0, ry, 0]);
      c.box(0.36, 0.06, len + 0.15, 0x8a7050, [0.09, 0.06, 0], null, [0, 0, 0, 1.5]);
      c.box(0.36, 0.06, len + 0.15, 0x7a6044, [-0.28, 0.06, 0], null, [0, 0, 0, 1.5]);
      [-0.45, 0.45].forEach((f) => { c.add(W.g.cyl(0.05, 0.05, 0.4, 8), 0x5a4a3a, [-0.1, -0.1, f * len], null, 1); c.box(0.8, 0.06, 0.08, 0x5a4a3a, [-0.1, 0.0, f * len], null, FW); });
    }
    W.yatsuhashi = yz;
    // ferns and moss along the stream banks
    const SP = L.streamPts;
    for (let i = 6; i < SP.length - 6; i += 13) {
      const p = SP[i], q = SP[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      const side = (i / 13) % 2 ? 1 : -1;
      const w = L.streamWidth(i / (SP.length - 1)) + 0.45;
      const x = p.x - dz / l * w * side, z = p.z + dx / l * w * side;
      if (W.inNotch(x, z)) continue;
      W.fern(B, x, W.H(x, z), z, R.range(0.35, 0.5), Math.atan2(-dz * side, dx * side), R);
      ctx.add(W.g.blob(1, 1, 0.3, 980 + i), W.jit(0x4f7a2a, 0.3, R), [x + 0.2, W.H(x, z) + 0.02, z - 0.1], null, [0.3, 0.08, 0.24], [0, 0, 0, 4.0]);
    }
    // iris/reeds in the marshy part
    for (let i = 0; i < 6; i++) {
      const x = R.range(1.6, 4.2), z = R.range(5.0, 7.0);
      const d = W.distToStream(x, z);
      if (d[0] < 0.3) continue;
      for (let k = 0; k < 6; k++) ctx.add(W.g.leaf('narrow'), W.jit(0x5a7a3a, 0.2, R), [x + R.range(-0.08, 0.08), W.H(x, z) + 0.25, z + R.range(-0.08, 0.08)], [R.range(-0.2, 0.2), R() * 6, Math.PI / 2], [0.07, 1, 0.55], [0, 0.25, 0, 8.0]);
    }
  }

  // ---------- karesansui ----------
  function karesansui(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(531);
    const x0 = L.SAND.x0, x1 = L.SAND.x1, z0 = L.SAND.z0, z1 = L.SAND.z1;
    // curb of small stones
    for (let x = x0; x <= x1; x += 0.22) { ctx.add(W.g.blob(1, 1, 0.15, Math.round(x * 10)), W.jit(0x8a857a, 0.4, R), [x, W.H(x, z0) + 0.04, z0], null, [0.12, 0.08, 0.1], ST); ctx.add(W.g.blob(1, 1, 0.15, Math.round(x * 10) + 3), W.jit(0x8a857a, 0.4, R), [x, W.H(x, z1) + 0.04, z1], null, [0.12, 0.08, 0.1], ST); }
    for (let z = z0; z <= z1; z += 0.22) { ctx.add(W.g.blob(1, 1, 0.15, Math.round(z * 10) + 7), W.jit(0x8a857a, 0.4, R), [x0, W.H(x0, z) + 0.04, z], null, [0.1, 0.08, 0.12], ST); ctx.add(W.g.blob(1, 1, 0.15, Math.round(z * 10) + 9), W.jit(0x8a857a, 0.4, R), [x1, W.H(x1, z) + 0.04, z], null, [0.1, 0.08, 0.12], ST); }
    // stone groups
    const groups = [
      [[-7.55, 7.3, 0.5, 1.15, 0.42], [-7.15, 7.6, 0.33, 0.6, 0.28], [-7.9, 7.0, 0.26, 0.35, 0.24]],
      [[-6.9, 9.9, 0.38, 0.7, 0.3], [-6.6, 9.62, 0.21, 0.32, 0.19]],
      [[-8.4, 10.3, 0.3, 0.45, 0.28]],
    ];
    groups.forEach((g, gi) => g.forEach((s, i) => {
      const y = W.H(s[0], s[1]);
      ctx.add(W.g.blob(1, 2, 0.22, 560 + gi * 10 + i), W.jit(0x7d7a72, 0.4, R), [s[0], y + s[3] * 0.42, s[1]], [R.range(-0.1, 0.1), R() * 6, R.range(-0.1, 0.1)], [s[2], s[3] * 0.55, s[4]], ST);
      for (let k = 0; k < 5; k++) { const a = R() * 6.28; ctx.add(W.g.blob(1, 1, 0.3, 600 + gi * 20 + i * 5 + k), W.jit(0x4f7a2a, 0.4, R), [s[0] + Math.cos(a) * s[2] * 0.9, y + 0.02, s[1] + Math.sin(a) * s[4] * 0.9], null, [0.18, 0.06, 0.15], [0, 0, 0, 4.0]); }
    }));
    // fallen red leaves on sand
    for (let i = 0; i < 9; i++) { const x = R.range(x0 + 0.4, x1 - 0.4), z = R.range(z0 + 0.4, z1 - 0.4); ctx.add(W.g.leaf('maple'), W.jit(0xd02c1c, 0.3, R), [x, W.H(x, z) + 0.012, z], [0, R() * 6, 0], R.range(0.11, 0.15), [0, 0, 0, 8.0]); }
    W.sandLeafSpot = new V3(-6.95, W.H(-6.95, 8.4) + 0.01, 8.4);
    // bamboo rake leaning on curb
    const rk = ctx.at([L.SAND.x1 + 0.12, 0.05, 6.6], [0, 0.3, -0.5]);
    rk.add(W.g.cyl(0.02, 0.02, 1.7, 6), BAMBOO, [0, 0.85, 0], null, 1);
    rk.box(0.5, 0.05, 0.05, 0x8a7a4a, [0, 0.02, 0], null, FW);
    for (let k = 0; k < 9; k++) rk.box(0.015, 0.12, 0.015, 0x8a7a4a, [-0.22 + k * 0.055, -0.05, 0.02], null, FWY);
    W.karesansuiC = new V3(-7.55, 0.3, 8.5);
  }

  // ---------- bench, umbrella, leaf pile, broom ----------
  function benchArea(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(541);
    const b = ctx.at([-0.3, W.H(-0.3, -3.95), -3.95], [0, 0.0, 0]);
    [-0.8, 0.8].forEach((x) => [-0.22, 0.22].forEach((z) => b.box(0.07, 0.42, 0.07, 0x5a4030, [x, 0.21, z], null, FWY)));
    b.box(1.95, 0.06, 0.6, 0x6a4a30, [0, 0.44, 0], null, FW);
    b.add(W.g.soft(1.9, 0.04, 0.68, 0.015, 3), 0xd81e1e, [0, 0.48, 0.02], null, 1, [0, 0, 0, 0]);
    b.box(1.9, 0.3, 0.012, 0xd81e1e, [0, 0.33, 0.36], null, [0, 0.03, 0, 0]);
    // dango & cups
    const pl = b.at([-0.4, 0.5, 0.0]);
    pl.add(W.g.cyl(0.14, 0.1, 0.02, 18), 0xe8e4d8, [0, 0.01, 0], [0, 0, 0], [1.3, 1, 1], [0, 0, 0, 6.0]);
    [-0.05, 0.05].forEach((z, i) => {
      const sk = pl.at([0, 0.05, z], [0, 0, Math.PI / 2]);
      sk.add(W.g.cyl(0.005, 0.005, 0.3, 4), 0xd8c08a, [0, 0, 0], null, 1);
      [0xf2b8c8, 0xf6f0e8, 0x9ac85a].forEach((c, k) => sk.add(W.g.sph(1, 10), c, [0, -0.08 + k * 0.065, 0], null, 0.032));
    });
    [0.25, 0.42].forEach((x, i) => {
      b.add(W.g.lathe([[0, 0], [0.035, 0], [0.04, 0.01], [0.042, 0.07], [0.038, 0.07], [0.036, 0.012], [0, 0.012]], 16, 'cup'), i ? 0x6a8a7a : 0xd8cfc0, [x, 0.5, 0.05 * i], null, 1, [0, 0, 0, 6.0]);
      b.add(W.g.cyl(0.037, 0.037, 0.004, 14), 0x9aa840, [x, 0.555, 0.05 * i], null, 1);
    });
    W.benchCups = [b.worldPos([0.25, 0.57, 0]), b.worldPos([0.42, 0.57, 0.05])];
    W.bench = b.worldPos([0, 0.5, 0]);
    // big umbrella
    const u = ctx.at([1.3, W.H(1.3, -4.35), -4.35], [0.06, 0, -0.08]);
    u.add(W.g.cyl(0.03, 0.03, 2.6, 8), 0x8a6a40, [0, 1.3, 0], null, 1);
    const ug = new THREE.ConeGeometry(1.45, 0.55, 24, 1, true);
    u.add(ug, 0xd8201c, [0, 2.45, 0], null, 1, [0, 0, 0, 7.0], null, (lx, ly, lz) => { const a = Math.atan2(lz, lx); return C(Math.abs(Math.sin(a * 12)) < 0.05 ? 0xb01818 : 0xd8201c); });
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; u.add(W.g.cyl(0.006, 0.006, 1.4, 4), 0x6a4a30, [Math.cos(a) * 0.65, 2.32, Math.sin(a) * 0.65], [0, -a, Math.PI / 2 - 0.37], 1); }
    u.add(W.g.torus(0.3, 0.02, 5, 24), 0xf0e6c8, [0, 2.55, 0], [Math.PI / 2, 0, 0], 1);
    u.add(W.g.cyl(0.05, 0.05, 0.1, 8), 0x3a2a20, [0, 2.75, 0], null, 1);
    W.umbrella = u.worldPos([0, 2.45, 0]);
    // leaf pile with sweet potato, broom leaning on persimmon
    const lp = new V3(-2.2, W.H(-2.2, -3.6), -3.6);
    for (let i = 0; i < 160; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 0.65;
      const h = (1 - r / 0.65) * 0.38;
      const gink = R() < 0.45;
      ctx.add(W.g.leaf(gink ? 'ginkgo' : 'maple'), W.jit(gink ? 0xe8b020 : [0xc8301c, 0xd8601c, 0x9a4a22][i % 3], 0.35, R), [lp.x + Math.cos(a) * r, lp.y + h * R.range(0.6, 1.0) + 0.02, lp.z + Math.sin(a) * r * 0.8], [R.range(-0.8, 0.8), R() * 6, R.range(-0.8, 0.8)], R.range(0.12, 0.17), [0, 0, 0, 8.0]);
    }
    ctx.add(W.g.blob(1, 2, 0.2, 77), 0x8a5a2a, [lp.x, lp.y + 0.12, lp.z], null, [0.55, 0.2, 0.45], [0, 0, 0, 0]);
    ctx.add(W.g.sph(1, 10), 0x8a2a4a, [lp.x + 0.25, lp.y + 0.12, lp.z + 0.2], [0, 0.6, 0.3], [0.14, 0.06, 0.06]);
    ctx.add(W.g.sph(1, 8), 0xf0c050, [lp.x + 0.33, lp.y + 0.13, lp.z + 0.24], null, [0.03, 0.04, 0.05], [0.3, 0, 0, 0]);
    W.leafPile = new V3(lp.x, lp.y + 0.3, lp.z);
    const bm = ctx.at([-1.25, W.H(-1.25, -4.95) + 0.02, -4.95], [-0.3, 0.2, 0.0]);
    bm.add(W.g.cyl(0.02, 0.02, 1.4, 6), BAMBOO, [0, 0.95, 0], null, 1);
    for (let k = 0; k < 18; k++) bm.add(W.g.cyl(0.006, 0.002, 0.5, 3), 0x8a7a4a, [Math.cos(k) * 0.04, 0.22, Math.sin(k) * 0.04], [Math.sin(k) * 0.15, 0, Math.cos(k) * 0.15], 1);
    bm.add(W.g.torus(0.06, 0.012, 4, 12), 0x5a4a2a, [0, 0.42, 0], [Math.PI / 2, 0, 0], 1);
  }

  // ---------- pinwheel rack & jizo ----------
  function pinwheels(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(551);
    const rx = 7.4, rz = 9.6, rry = -0.5;
    const r = ctx.at([rx, W.H(rx, rz), rz], [0, rry, 0]);
    const w = 2.2, h = 1.6;
    [-1, 1].forEach((s) => r.box(0.08, h + 0.2, 0.08, 0x6a4a30, [s * w / 2, (h + 0.2) / 2, 0], null, FWY));
    const rows = [0.55, 0.85, 1.15, 1.45];
    rows.forEach((y) => r.box(w, 0.05, 0.06, 0x7a5a3a, [0, y, 0], null, FW));
    r.box(w + 0.3, 0.06, 0.3, 0x5a4030, [0, h + 0.22, 0], null, FW);
    const cols = [0xd8281e, 0xf08a1e, 0xf2c83a, 0xf6f2ea];
    W.pinwheels = [];
    rows.forEach((y, ri) => {
      for (let i = 0; i < 7; i++) {
        const x = -w / 2 + 0.2 + i * (w - 0.4) / 6;
        r.add(W.g.cyl(0.006, 0.006, 0.3, 4), 0x8a7a5a, [x, y + 0.15, 0.02], null, 1);
        const p = W.part('pw' + ri + '_' + i, r.worldPos([x, y + 0.3, 0.05]));
        const rot = new THREE.Euler(0, rry, 0);
        p.baseQ = new THREE.Quaternion().setFromEuler(rot);
        const c1 = cols[(i + ri) % 4], c2 = cols[(i + ri + 1) % 4];
        for (let k = 0; k < 4; k++) {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.13, 0.0); sh.quadraticCurveTo(0.12, 0.1, 0.02, 0.13); sh.closePath();
          const geo = W.g.shape(sh, 'pwblade');
          p.ctx.add(geo, k % 2 ? c1 : c2, [0, 0, 0], [0, 0, k * Math.PI / 2], 1, [0, 0, 0, 7.0]);
        }
        p.ctx.add(W.g.sph(1, 6), 0xf2c83a, [0, 0, 0.01], null, 0.015);
        p.order = i / 6;
        p.phase = R() * 6;
        W.pinwheels.push(p);
      }
    });
    W.pinwheelRack = r.worldPos([0, 1.0, 0]);
    // jizo row
    W.jizos = [];
    [-0.95, -0.48, 0, 0.48, 0.95].map((f) => [rx + Math.cos(rry) * f + Math.sin(rry) * 0.95, rz - Math.sin(rry) * f + Math.cos(rry) * 0.95]).forEach((p, i) => {
      const y = W.H(p[0], p[1]);
      const j = ctx.at([p[0], y, p[1]], [0, rry, 0], 0.9 + (i % 2) * 0.1);
      j.add(W.g.soft(0.36, 0.14, 0.32, 0.03, 2), 0x8e887c, [0, 0.07, 0], null, 1, ST);
      j.add(W.g.blob(1, 2, 0.06, 700 + i), 0xa09a8c, [0, 0.38, 0], null, [0.15, 0.25, 0.13], ST);
      j.add(W.g.sph(1, 12), 0xa8a294, [0, 0.7, 0.0], null, [0.11, 0.12, 0.11], ST);
      j.add(W.g.cone(0.17, 0.16, 12, true), 0xd8281e, [0, 0.52, 0.03], [Math.PI, 0, 0], [1, 1, 0.8], [0, 0.04, 0, 0]);
      const hc = [0xd8281e, 0xf2c83a, 0x3a6ac8, 0xf6f2ea, 0x6aa84a][i];
      j.add(W.g.sph(1, 12), hc, [0, 0.77, 0], null, [0.12, 0.08, 0.12]);
      j.add(W.g.sph(1, 6), 0xf6f2ea, [0, 0.86, 0], null, 0.035);
      j.add(W.g.torus(0.11, 0.02, 5, 14), hc, [0, 0.72, 0], [Math.PI / 2, 0, 0], 1);
      // offerings
      j.add(W.g.cyl(0.03, 0.03, 0.005, 10), 0xc8a050, [0.1, 0.145, 0.14], null, 1, [0, 0, 0, 9.0]);
      j.add(W.g.cyl(0.03, 0.03, 0.005, 10), 0xb88a40, [-0.06, 0.145, 0.15], null, 1, [0, 0, 0, 9.0]);
      if (i % 2 === 0) j.add(W.g.sph(1, 8), 0xf08a1a, [-0.12, 0.18, 0.12], null, 0.045);
      j.add(W.g.cyl(0.004, 0.004, 0.25, 4), 0x8a7a5a, [0.14, 0.2, 0.05], null, 1);
      const pwp = W.part('jpw' + i, j.worldPos([0.14, 0.33, 0.06]));
      pwp.baseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rry, 0));
      for (let k = 0; k < 4; k++) {
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.08, 0.0); sh.quadraticCurveTo(0.075, 0.06, 0.012, 0.08); sh.closePath();
        pwp.ctx.add(W.g.shape(sh, 'pwblade2'), k % 2 ? cols[i % 4] : cols[(i + 2) % 4], [0, 0, 0], [0, 0, k * Math.PI / 2], 1, [0, 0, 0, 7.0]);
      }
      pwp.order = 0.5 + i * 0.1; pwp.phase = i;
      W.pinwheels.push(pwp);
      W.jizos.push(j.worldPos([0, 0.8, 0]));
    });
  }

  // ---------- garden lanterns ----------
  function lanterns(B) {
    const ctx = new W.Ctx(B);
    [[-11.45, 1.7, 'kasuga', 0.4, 0.85], [-5.75, 13.9, 'yukimi', 0.6, 1.0], [-2.75, -2.5, 'oribe', 0.3, 1.0], [0.85, 1.55, 'yukimi', -0.4, 0.8], [-12.5, 13.8, 'oribe', 0.2, 0.9], [5.75, 6.5, 'kasuga', 0.0, 0.8]].forEach((l, i) => {
      const y = W.H(l[0], l[1]);
      W.lanternGlows.push(W.stoneLantern(ctx, l[0], y, l[1], l[4], l[2], l[3], 480 + i));
    });
  }

  // ---------- plants ----------
  function plants() {
    // maples ~ eave height, at the base corners and the corners of vignettes
    W.maple(-15.0, 14.95, { seed: 5, palette: 'orange', scale: 0.82 });
    W.maple(15.0, 15.0, { seed: 7, palette: 'deep', scale: 0.82 });
    W.maple(-15.1, 2.7, { seed: 3, palette: 'mixed', scale: 0.78 });
    W.maple(14.75, 0.6, { seed: 9, palette: 'deep', scale: 0.8 });
    W.maple(15.0, -6.4, { seed: 13, palette: 'orange', scale: 0.78, y: L.TERR_Y });
    W.maple(3.0, -12.9, { seed: 17, palette: 'deep', scale: 0.78, y: L.TERR_Y });
    W.pineTree(-4.7, 6.0, new V3(0.7, 0, 0.75));
    W.persimmon(-4.85, -12.55);
    W.shrub(-15.0, 9.4, { r: 0.7, seed: 31, color: 0x2a5a2a, leafColor: 0x2a5226, flowers: 14, flowerKind: 'camellia', flowerColor: 0xf28aa8 });
    W.shrub(-4.4, 15.05, { r: 0.6, seed: 32, color: 0x2a5a2a, leafColor: 0x2a5226, flowers: 10, flowerKind: 'camellia', flowerColor: 0xe86a8a });
    W.nandina(-12.6, 15.2, 41); W.nandina(-15.2, 6.6, 42); W.nandina(-3.9, 14.4, 43);
    W.susuki(4.95, 7.3, 1.0, 801); W.susuki(-5.25, 15.1, 0.9, 802); W.susuki(14.3, 9.6, 1.0, 803); W.susuki(-2.85, 6.55, 0.8, 804);
    [[4.6, -3.4], [2.6, -0.4], [4.25, 0.6], [1.6, 3.95], [4.15, 4.3], [2.4, 6.4], [-1.2, 5.05], [5.45, 2.4]].forEach((p, i) => W.higanbana(p[0], p[1], 6, 820 + i));
    // low bamboo fences marking the flat sando from the garden (gap where the garden path joins)
    lowFence(new W.Ctx(W.bucket('garden')), [L.STAIR_X0 - 1.25, 8.2], [L.STAIR_X0 - 1.25, 15.55]);
    lowFence(new W.Ctx(W.bucket('garden')), [L.STAIR_X1 + 1.25, 5.0], [L.STAIR_X1 + 1.25, 15.55]);
    // ferns in shady spots
    [[-15.3, 8.6], [-3.6, -4.5], [6.0, -4.75], [13.4, -4.6], [-15.3, 0.3]].forEach((p, i) => W.fern(W.bucket('plants'), p[0], W.H(p[0], p[1]), p[1], 0.5, i * 1.3, W.rng(840 + i)));
    // back forest: sugi & bamboo
    [[0.8, -15.45, 6.8], [3.1, -15.55, 7.3], [5.4, -15.6, 6.7], [7.8, -15.5, 7.4], [10.2, -15.6, 7.0], [12.5, -15.5, 6.8]].forEach((s, i) => W.sugi(s[0], s[1], s[2], 50 + i));
    const R = W.rng(861);
    for (let i = 0; i < 46; i++) {
      const x = R.range(-15.7, -3.5), z = R.range(-15.85, -14.7);
      W.bamboo(x, z, R.range(6.6, 8.6), 900 + i);
    }
    // undergrowth at back
    for (let i = 0; i < 16; i++) { const x = R.range(-15.5, 15.5), z = R.range(-15.8, -14.2); W.fern(W.bucket('plants'), x, W.H(x, z), z, R.range(0.4, 0.7), R() * 6, R); }
  }

  // ---------- light shafts & mist ----------
  function atmosphere() {
    const sd = W.U.uSunDir.value;
    const shaft = (top, len, w0, w1, seed) => W.makeShaft(top, top.clone().addScaledVector(sd, -len), w0, w1, seed);
    // shafts: sun from the right-back, slanting toward the front-left
    // two or three shafts from behind, through the ginkgo crown, landing on the garden and the pond
    const G = L.GINKGO;
    shaft(new V3(G.x - 0.6, 11.4, G.z - 0.9), 19.5, 0.5, 1.05, 1);
    shaft(new V3(G.x + 1.4, 10.8, G.z - 0.4), 18.5, 0.42, 0.9, 2);
    shaft(new V3(G.x - 1.6, 10.2, G.z + 0.6), 16.5, 0.35, 0.75, 3);
    // mist bands at the back
    W.mists = [];
    [[-9.5, 2.4, -15.0, 12, 3], [6.5, 5.8, -15.0, 12, 3], [-0.6, 4.6, -15.3, 6, 2.4]].forEach((m) => {
      const mm = new THREE.Mesh(new THREE.PlaneGeometry(m[3], m[4]), W.makeMistMat());
      mm.position.set(m[0], m[1], m[2]); mm.layers.set(W.LAYER.FX); mm.renderOrder = 4;
      W.scene.add(mm); W.mists.push(mm);
    });
    // dust motes inside shafts
    const g = new THREE.BufferGeometry(); const p = [], d = [];
    const R = W.rng(871);
    (W.shafts || []).forEach((s, si) => {
      const len = s.geometry.parameters.height;
      for (let i = 0; i < 40; i++) {
        const t = R.range(-0.45, 0.45) * len;
        const v = new V3(R.range(-0.3, 0.3), t, R.range(-0.3, 0.3)).applyQuaternion(s.quaternion).add(s.position);
        p.push(v.x, v.y, v.z); d.push(R(), R.range(0.6, 1.3), 0, R.range(0.4, 1));
      }
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(d, 4));
    const mat = W.makeMoteMat({ color: 0xffe8b0, size: 0.035, drift: 0.2 });
    const pts = new THREE.Points(g, mat);
    pts.layers.set(W.LAYER.FX); pts.frustumCulled = false; pts.renderOrder = 9;
    W.scene.add(pts);
    W.dustMotes = pts;
    // soft contact shadow on an implied tabletop below the base
    const fm = new THREE.ShaderMaterial({
      uniforms: { uSunDir: W.U.uSunDir },
      vertexShader: 'varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: `uniform vec3 uSunDir; varying vec2 vXZ;
        float boxd(vec2 p, float h){ vec2 d = abs(p) - vec2(h); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
        void main(){
          float d0 = boxd(vXZ, 16.4);
          vec2 off = -normalize(uSunDir.xz) * 3.2;
          float d1 = boxd(vXZ - off, 16.0);
          float a = (1.0 - smoothstep(-2.0, 9.0, d0)) * 0.28 + (1.0 - smoothstep(-1.0, 4.5, d1)) * 0.16;
          a *= 1.0 - smoothstep(30.0, 70.0, length(vXZ));
          gl_FragColor = vec4(vec3(0.36, 0.3, 0.36), a);
        }`,
      transparent: true, depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), fm);
    floor.rotation.x = -Math.PI / 2; floor.position.y = W.L.BOTTOM - 0.52;
    floor.layers.set(W.LAYER.FX); floor.renderOrder = -5;
    W.scene.add(floor);
  }

  // ---------- fallen leaves carpet ----------
  function groundLeaves() {
    const ctx = new W.Ctx(W.bucket('leaves'));
    const R = W.rng(901);
    const put = (x, z, kind, col, s) => {
      if (Math.abs(x) > 15.9 || Math.abs(z) > 15.9) return;
      if (W.inNotch && W.inNotch(x, z)) return;
      const pr = Math.hypot(x - L.POND.x, z - L.POND.z); if (pr < L.POND.r + 0.05) return;
      const rg = W.region(x, z); if (rg === 'bed') return;
      if (x < -4.5 && z < -0.9) return; // studio footprint
      const y = W.H(x, z) + 0.012 + R() * 0.01;
      ctx.add(W.g.leaf(kind), W.jit(col, 0.32, R), [x, y, z], [R.range(-0.15, 0.15), R() * 6.28, R.range(-0.15, 0.15)], s * R.range(0.8, 1.2), [0, 0, 0, 8.0]);
    };
    const mapleCols = [0xc8281a, 0xdc401c, 0xe8641e, 0xb01e18, 0x9a3a22];
    (W.treeList || []).filter((t) => t.kind === 'maple').forEach((t) => {
      for (let i = 0; i < 170 * t.s; i++) { const a = R() * 6.28, r = Math.pow(R(), 0.7) * 3.4 * t.s; put(t.x + Math.cos(a) * r + 0.6, t.z + Math.sin(a) * r, 'maple', mapleCols[i % 5], 0.17); }
    });
    // ginkgo carpet (terrace & garden in front)
    for (let i = 0; i < 900; i++) {
      const a = R() * 6.28, r = Math.pow(R(), 0.6) * 7.0;
      const x = L.GINKGO.x + 0.4 + Math.cos(a) * r * 1.0, z = L.GINKGO.z + 2.0 + Math.sin(a) * r * 0.85;
      put(x, z, 'ginkgo', [0xeaa818, 0xf2bc2a, 0xdc9812, 0xb8901e][i % 4], 0.16);
    }
    // general sprinkle
    for (let i = 0; i < 520; i++) {
      const x = R.range(-15.8, 15.8), z = R.range(-15.8, 15.8);
      const g = R() < 0.5;
      put(x, z, g ? 'ginkgo' : 'maple', g ? 0xe0a820 : mapleCols[i % 5], 0.15);
    }
    // on the stairs
    (W.stairSteps || []).forEach((s, i) => {
      for (let k = 0; k < 5; k++) {
        const g = R() < 0.5;
        ctx.add(W.g.leaf(g ? 'ginkgo' : 'maple'), W.jit(g ? 0xeaa818 : mapleCols[k % 5], 0.3, R), [s[0] + R.range(-1.1, 1.1), s[1] + 0.012, s[2] + R.range(-s[3] * 0.4, s[3] * 0.4)], [0, R() * 6.28, 0], 0.15, [0, 0, 0, 8.0]);
      }
    });
  }

  W.garden = {
    build: function () {
      const B = W.bucket('garden');
      gate(B);
      bonsaiArea(B);
      streamFeatures(B);
      karesansui(B);
      benchArea(B);
      pinwheels(B);
      lanterns(B);
      plants();
      groundLeaves();
      atmosphere();
    },
  };
})();
