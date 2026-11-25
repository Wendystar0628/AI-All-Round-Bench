/* studio building: platform, frame, walls, glass doors, roof (cut), engawa, flower stall */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C;
  const S = W.L.STUDIO;
  const FL = S.floor, TOP = S.wallTop; // 1.4 / 4.2
  const EY = 1.35; // engawa floor
  const DARK = 0x3d2b20, WOOD = 0x6b4a34, WOODL = 0x8a6444, PLASTER = 0xefe6d2, TILE = 0x58606e;
  const WX = (a) => [0, 0, 0, 1.0], WY = [0, 0, 0, 1.25], WZ = [0, 0, 0, 1.5];
  const FXX = [0, 0, 0, 1.0];

  W.parts = [];
  W.part = function (name, pivot, opts) {
    const b = new W.Bucket(name);
    const o = { name, b, ctx: new W.Ctx(b), pivot: pivot ? pivot.clone() : new V3(), mesh: null, parent: opts && opts.parent, layer: opts && opts.layer };
    W.parts.push(o);
    return o;
  };

  function beam(ctx, x0, y0, z0, x1, y1, z1, t, col, fx) {
    // axis-aligned beam between two points with square section t
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), dz = Math.abs(z1 - z0);
    const w = Math.max(dx, t), h = Math.max(dy, t), d = Math.max(dz, t);
    const ax = dx >= dy && dx >= dz ? [0, 0, 0, 1.0] : dy >= dz ? [0, 0, 0, 1.25] : [0, 0, 0, 1.5];
    ctx.box(w, h, d, col || DARK, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], null, fx || ax);
  }
  W.beam = beam;

  // ---------- corrugated tile roof surface ----------
  // local frame: x across (width), z down-slope (length), y normal; hole: {x, z, r} in local coords
  function tileSurface(width, length, hole, seed) {
    const R = W.rng(seed || 3);
    const nx = Math.round(width / 0.075), nz = Math.round(length / 0.08);
    const pos = [], nor = [], idx = [], col = [];
    const per = 0.3; // tile pitch across
    const row = 0.32; // tile row down-slope
    const yAt = (x, z) => {
      const w = Math.sin((x / per) * Math.PI * 2) * 0.022;
      const rr = (z % row) / row; // stepped rows
      return w + rr * 0.03;
    };
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * width, z = (j / nz) * length;
      const y = yAt(x, z);
      pos.push(x, y, z);
      const ex = (yAt(x + 0.01, z) - yAt(x - 0.01, z)) / 0.02;
      const n = new V3(-ex * 0.55, 1, -0.06).normalize();
      nor.push(n.x, n.y, n.z);
      const c = W.C(TILE).clone().multiplyScalar(0.92 + 0.12 * W.noise2(Math.floor(x / per) * 3.1, Math.floor(z / row) * 1.7));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = ((i + 0.5) / nx - 0.5) * width, z = ((j + 0.5) / nz) * length;
      if (hole && Math.hypot(x - hole.x, z - hole.z) < hole.r) continue;
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.userData.colors = col;
    return g;
  }

  function slopeMatrix(origin, ry, pitch) {
    // local z points down-slope; origin at ridge line center
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, ry, 0, 'YXZ'));
    m.compose(origin, q, new V3(1, 1, 1));
    return m;
  }

  // ---------- platform & under-floor ----------
  function platform(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(101);
    const xs = [-15.9, -14, -12, -10, -8, -6, -4.75];
    const zs = [-13, -11, -9, -7, -5, -3.35];
    xs.forEach((x) => zs.forEach((z) => {
      const isEng = x > -6.1 || z > -5.1;
      if (x > -6.1 && z > -3.0) return;
      const gy = 0.12;
      ctx.add(W.g.soft(0.42, 0.3, 0.42, 0.06, 2), W.jit(0x9a9384, 0.4, R), [x, gy + 0.12, z], [0, R() * 0.5, 0], 1, [0, 0, 0, 3.0]);
      const top = (isEng ? EY : FL) - 0.2;
      beam(ctx, x, gy + 0.27, z, x, top, z, 0.13, DARK);
    }));
    // sleepers (大引) along x and floor joists
    zs.forEach((z) => beam(ctx, -16, FL - 0.28, z, z > -5.1 ? -4.75 : -6, FL - 0.15, z, 0.14, DARK));
    xs.forEach((x) => { if (x < -6.1) beam(ctx, x, FL - 0.3, -13, x, FL - 0.18, -5, 0.1, DARK); });
    beam(ctx, -4.75, EY - 0.28, -13, -4.75, EY - 0.15, -3.35, 0.14, DARK);
    // main floor slab (under tatami)
    ctx.box(10, 0.1, 8, 0x5a4232, [-11, FL - 0.1, -9], null, FXX);
    // floor edge boards (visible section on left cut)
    ctx.box(0.06, 0.18, 8.0, 0x4a3426, [-15.97, FL - 0.09, -9], null, WZ);
    // under-floor storage
    const jar = (x, z, s, c) => {
      const pts = [[0, 0], [0.16, 0.02], [0.22, 0.12], [0.24, 0.28], [0.18, 0.42], [0.12, 0.47], [0.13, 0.52], [0, 0.52]];
      ctx.add(W.g.lathe(pts, 16, 'jar'), c, [x, 0.12, z], [0, 0, 0], s, [0, 0, 0, 6.0]);
    };
    jar(-15.2, -5.8, 1.1, 0x7a4a2e); jar(-14.7, -6.3, 0.85, 0x4b3a33); jar(-11.4, -5.6, 1.0, 0x8a6a4a); jar(-7.2, -5.9, 0.9, 0x6a5040);
    jar(-15.3, -9.6, 1.2, 0x5a4a3e); jar(-13.2, -12.2, 1.0, 0x7d5638);
    const crate = (x, z, w, h, d, ry) => {
      const c = ctx.at([x, 0.12, z], [0, ry || 0, 0]);
      c.box(w, h, d, 0xa07a50, [0, h / 2, 0], null, FXX);
      for (let i = 0; i < 3; i++) c.box(w + 0.01, 0.03, d + 0.01, 0x7a5a3a, [0, h * (i + 0.5) / 3, 0], null, FXX);
    };
    crate(-12.9, -5.7, 0.7, 0.45, 0.5, 0.1); crate(-12.85, -5.75, 0.55, 0.35, 0.4, -0.2);
    crate(-9.8, -6.0, 0.6, 0.4, 0.45, 0.3); crate(-15.0, -11.2, 0.8, 0.5, 0.55, 0);
    // stacked old flower pots
    const pot = (x, y, z, s) => ctx.add(W.g.cyl(0.18, 0.13, 0.22, 14, true), 0xb5643a, [x, y + 0.11 * s, z], null, s, [0, 0, 0, 0]);
    for (let i = 0; i < 4; i++) pot(-8.6, 0.12 + i * 0.07, -5.7, 1);
    for (let i = 0; i < 3; i++) pot(-8.2, 0.12 + i * 0.07, -6.1, 0.9);
    pot(-14.0, 0.12, -5.5, 1.2);
    // watering can under floor
    ctx.add(W.g.cyl(0.14, 0.15, 0.26, 12), 0x8a9aa0, [-10.7, 0.25, -5.6], null, 1, [0, 0, 0, 12.0]);
    ctx.add(W.g.cyl(0.02, 0.03, 0.4, 6), 0x8a9aa0, [-10.45, 0.36, -5.6], [0, 0, -0.9], 1, [0, 0, 0, 12.0]);
    // firewood stack
    for (let i = 0; i < 9; i++) ctx.add(W.g.cyl(0.07, 0.07, 0.8, 8), W.jit(0x8a6a4a, 0.4, R), [-15.4 + (i % 3) * 0.15, 0.2 + Math.floor(i / 3) * 0.13, -7.6], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 17.0]);
  }

  // ---------- floor & engawa ----------
  function floors(B) {
    const ctx = new W.Ctx(B);
    const tat = W.atlas.get('tatami');
    // tatami layout: rows along z, alternating
    const R = W.rng(7);
    const x0 = -16, x1 = -6, z0 = -13, z1 = -5;
    // fill with 2.0 x 1.0 mats (scaled slightly) — 5 columns of 2m, 8 rows of 1m; alternate a band of rotated
    for (let r = 0; r < 8; r++) {
      for (let cI = 0; cI < 5; cI++) {
        const rot = (r % 4 === 1 && (cI === 1 || cI === 3));
        const cx = x0 + 1 + cI * 2, cz = z0 + 0.5 + r;
        ctx.add(W.g.box(1, 0.06, 2), 0xffffff, [cx, FL + 0.03, cz], [0, Math.PI / 2, 0], [0.995, 1, 0.995], [0, 0, 0, 15.0], tat);
      }
    }
    // tatami top face uses box uv — map entire region on each face (fine)
    // engawa floorboards (front + right), polished
    const eFront = { x0: -16, x1: -4.6, z0: -5, z1: -3.2 };
    for (let z = eFront.z0; z < eFront.z1 - 0.01; z += 0.15) {
      ctx.box(eFront.x1 - eFront.x0, 0.06, 0.145, W.jit(0x8a6040, 0.15, R), [(eFront.x0 + eFront.x1) / 2, EY - 0.03, z + 0.075], null, [0, 0, 0, 16.0]);
    }
    for (let x = -6; x < -4.61; x += 0.15) {
      ctx.box(0.145, 0.06, -5 - (-13), W.jit(0x8a6040, 0.15, R), [x + 0.075, EY - 0.03, -9], null, [0, 0, 0, 16.5]);
    }
    // engawa edge fascia
    ctx.box(11.4, 0.18, 0.06, 0x4a3426, [-10.3, EY - 0.12, -3.2], null, FXX);
    ctx.box(0.06, 0.18, 9.8, 0x4a3426, [-4.6, EY - 0.12, -8.1], null, WZ);
    // threshold (敷居) between room & engawa
    ctx.box(10, 0.06, 0.12, 0x5a3e2c, [-11, FL + 0.03, -5], null, FXX);
    ctx.box(0.12, 0.06, 8, 0x5a3e2c, [-6, FL + 0.03, -9], null, WZ);
    // front steps
    const st = ctx.at([W.L.STEPS_X, 0, 0]);
    st.box(1.3, 0.08, 0.3, 0x7a5638, [0, 1.06, -3.05], null, FXX);
    st.box(1.3, 0.08, 0.3, 0x7a5638, [0, 0.76, -2.78], null, FXX);
    [-0.6, 0.6].forEach((x) => { st.box(0.08, 1.0, 0.08, DARK, [x, 0.55, -2.72], null, WY); st.box(0.08, 0.06, 0.62, DARK, [x, 0.68, -2.92], [0.75, 0, 0], WZ); });
    // right steps
    const rs = ctx.at([0, 0, -8.1]);
    rs.box(0.3, 0.08, 1.2, 0x7a5638, [-4.45, 1.06, 0], null, WZ);
    rs.box(0.3, 0.08, 1.2, 0x7a5638, [-4.18, 0.76, 0], null, WZ);
  }

  // ---------- frame, walls ----------
  function frame(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(9);
    const xs = [-16, -14, -12, -10, -8, -6];
    const zs = [-13, -11, -9, -7, -5];
    // posts
    xs.forEach((x) => { beam(ctx, x, FL, -13, x, TOP, -13, 0.16, DARK); beam(ctx, x, FL, -5, x, TOP, -5, 0.16, DARK); });
    zs.forEach((z) => { beam(ctx, -6, FL, z, -6, TOP, z, 0.16, DARK); beam(ctx, -16, FL, z, -16, TOP, z, 0.16, DARK); });
    // top plates (桁) & lintels (鴨居) & ranma beams
    beam(ctx, -16.08, TOP - 0.18, -13, -5.92, TOP, -13, 0.2, DARK);
    beam(ctx, -16.08, TOP - 0.18, -5, -5.92, TOP, -5, 0.2, DARK);
    beam(ctx, -6, TOP - 0.18, -13.08, -6, TOP, -4.92, 0.2, DARK);
    beam(ctx, -16, TOP - 0.18, -13.08, -16, TOP, -4.92, 0.2, DARK);
    const LIN = FL + 1.92;
    beam(ctx, -16, LIN, -5, -6, LIN + 0.1, -5, 0.14, DARK); // front lintel
    beam(ctx, -6, LIN, -9, -6, LIN + 0.1, -7, 0.14, DARK);  // right lintel (shoji part)
    beam(ctx, -16, TOP - 0.55, -5, -6, TOP - 0.47, -5, 0.13, DARK); // nageshi
    // front ranma: fine lattice between lintel and top
    for (let x = -16; x < -6; x += 0.12) beam(ctx, x, LIN + 0.1, -5, x, TOP - 0.55, -5, 0.025, WOOD);
    beam(ctx, -16, LIN + 0.32, -5, -6, LIN + 0.34, -5, 0.03, WOOD);
    beam(ctx, -16, LIN + 0.55, -5, -6, LIN + 0.57, -5, 0.03, WOOD);
    // nageshi to top plate: plaster band
    ctx.box(10, TOP - 0.18 - (TOP - 0.47), 0.08, PLASTER, [-11, (TOP - 0.18 + TOP - 0.47) / 2, -5], null, [0, 0, 0, 0]);

    // back wall: plaster upper, wood lower; tokonoma alcove at [-16,-14]
    const backWall = (xa, xb) => {
      const w = xb - xa, cx = (xa + xb) / 2;
      ctx.box(w, 0.75, 0.08, WOOD, [cx, FL + 0.375, -13.02], null, FXX);
      ctx.box(w, TOP - FL - 0.93, 0.1, PLASTER, [cx, FL + 0.75 + (TOP - FL - 0.93) / 2, -13.02], null, [0, 0, 0, 0]);
      ctx.box(w, 0.04, 0.06, DARK, [cx, FL + 0.76, -12.96], null, FXX);
    };
    backWall(-14, -6);
    // tokonoma recess
    ctx.box(2.0, 0.12, 0.65, 0x3a2a22, [-15, FL + 0.18, -13.33], null, FXX); // toko floor raised
    ctx.box(2.0, TOP - FL, 0.1, 0xe8dcc4, [-15, FL + (TOP - FL) / 2, -13.68], null, [0, 0, 0, 0]);
    ctx.box(0.08, TOP - FL, 0.66, 0xe8dcc4, [-14.0, FL + (TOP - FL) / 2, -13.33], null, [0, 0, 0, 0]);
    beam(ctx, -14.05, FL, -13.05, -14.05, TOP, -13.05, 0.15, 0x6a4a2e); // tokobashira (natural wood)
    ctx.box(2.0, 0.1, 0.7, DARK, [-15, FL + 2.3, -13.33], null, FXX); // otoshigake
    ctx.box(2.0, TOP - FL - 2.35, 0.08, PLASTER, [-15, FL + 2.35 + (TOP - FL - 2.35) / 2, -13.0], null, [0, 0, 0, 0]);
    // right wall: [-13,-11] plaster, [-11,-9] round window wall, [-9,-5] shoji
    const rightWall = (za, zb, holeR) => {
      const d = zb - za, cz = (za + zb) / 2;
      ctx.box(0.08, 0.75, d, WOOD, [-6.02, FL + 0.375, cz], null, WZ);
      if (!holeR) ctx.box(0.1, TOP - FL - 0.93, d, PLASTER, [-6.02, FL + 0.75 + (TOP - FL - 0.93) / 2, cz], null, [0, 0, 0, 0]);
      ctx.box(0.06, 0.04, d, DARK, [-6.07, FL + 0.76, cz], null, WZ);
    };
    rightWall(-13, -11);
    rightWall(-11, -9, true);
    // round window wall: shape with hole
    {
      const h = TOP - FL - 0.93; const d = 2;
      const sh = new THREE.Shape(); sh.moveTo(-d / 2, -h / 2); sh.lineTo(d / 2, -h / 2); sh.lineTo(d / 2, h / 2); sh.lineTo(-d / 2, h / 2); sh.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 0.05, 0.62, 0, Math.PI * 2, true); sh.holes.push(hole);
      const geo = W.g.extrude(sh, 0.1, 0, 'roundwall', 24);
      ctx.add(geo, PLASTER, [-6.02, FL + 0.75 + h / 2, -10], [0, Math.PI / 2, 0], 1, [0, 0, 0, 0]);
      // window frame ring & lattice
      ctx.add(W.g.torus(0.63, 0.045, 8, 40), DARK, [-6.02, FL + 0.75 + h / 2 + 0.05, -10], [0, Math.PI / 2, 0], 1, FXX);
      for (let k = -2; k <= 2; k++) {
        const o = k * 0.22; const hl = Math.sqrt(Math.max(0, 0.62 * 0.62 - o * o));
        ctx.box(0.02, hl * 2, 0.02, WOOD, [-6.0, FL + 0.75 + h / 2 + 0.05, -10 + o], null, WY);
      }
      ctx.box(0.02, 0.02, 1.24, WOOD, [-6.0, FL + 0.75 + h / 2 + 0.05, -10], null, WZ);
      W.roundWin = new V3(-6.02, FL + 0.75 + h / 2 + 0.05, -10);
    }
    // shoji on right [-9,-5]: 4 panels; two slid open at [-7,-5]
    const shoji = (z, open) => {
      const c = ctx.at([-6.0 + (open ? -0.06 : 0), FL, z]);
      const hh = 1.92, ww = 1.0;
      c.box(0.04, hh, 0.04, WOOD, [0, hh / 2, -ww / 2 + 0.02], null, WY);
      c.box(0.04, hh, 0.04, WOOD, [0, hh / 2, ww / 2 - 0.02], null, WY);
      c.box(0.04, 0.05, ww, WOOD, [0, 0.025, 0], null, WZ);
      c.box(0.04, 0.05, ww, WOOD, [0, hh - 0.025, 0], null, WZ);
      c.box(0.035, 0.25, ww - 0.04, WOOD, [0, 0.15, 0], null, WZ);
      for (let k = 1; k < 3; k++) c.box(0.02, hh - 0.3, 0.015, WOOD, [0, 0.3 + (hh - 0.3) / 2, -ww / 2 + k * ww / 3], null, WY);
      for (let k = 1; k < 6; k++) c.box(0.02, 0.015, ww - 0.04, WOOD, [0, 0.3 + k * (hh - 0.3) / 6, 0], null, WZ);
      c.box(0.01, hh - 0.32, ww - 0.06, 0xf6eedc, [0.0, 0.3 + (hh - 0.32) / 2, 0], null, [0.0, 0, 0, 7.0]);
    };
    shoji(-7.5, false); shoji(-7.6, true);
    rightWall(-7, -5);
    ctx.box(0.08, TOP - FL - 2.02, 2, PLASTER, [-6.02, LIN + 0.1 + (TOP - LIN - 0.28) / 2, -8], null, [0, 0, 0, 0]);
    // left side: cut wall stub (section), sill
    ctx.box(0.12, 0.35, 8, PLASTER, [-15.98, FL + 0.175, -9], null, [0, 0, 0, 0]);
    ctx.box(0.16, 0.08, 8, DARK, [-15.98, FL + 0.38, -9], null, WZ);
    // section of cut wall: show bamboo lath (komai) & clay layers at cut tops
    for (let z = -12.8; z < -5.2; z += 0.12) ctx.box(0.03, 0.06, 0.02, 0x9a7a4a, [-15.98, FL + 0.44, z], null, [0, 0, 0, 0]);
    ctx.box(0.12, 0.03, 8, 0xb89a6a, [-15.98, FL + 0.36, -9], null, [0, 0, 0, 13.0]);
    // central beam (for fan, lanterns), tie beams across
    [-16, -12.2, -8, -6].forEach((x) => beam(ctx, x, TOP - 0.02, -13.1, x, TOP + 0.16, -4.9, 0.14, DARK));
    beam(ctx, -16.1, TOP + 0.16, -9.07, -5.6, TOP + 0.32, -8.93, 0.14, DARK);
  }

  // ---------- glass doors (front) ----------
  function glassDoors(B, G) {
    const ctx = new W.Ctx(B);
    const refl = W.atlas.get('glassRefl');
    const LIN = FL + 1.92;
    const panes = [];
    const door = (x, zOff) => {
      const c = ctx.at([x, FL, -5 + zOff]);
      const ww = 1.0, hh = 1.92;
      c.box(0.05, hh, 0.045, WOOD, [-ww / 2 + 0.025, hh / 2, 0], null, WY);
      c.box(0.05, hh, 0.045, WOOD, [ww / 2 - 0.025, hh / 2, 0], null, WY);
      c.box(ww, 0.06, 0.045, WOOD, [0, 0.03, 0], null, FXX);
      c.box(ww, 0.06, 0.045, WOOD, [0, hh - 0.03, 0], null, FXX);
      c.box(ww - 0.08, 0.32, 0.035, WOODL, [0, 0.2, 0], null, FXX);
      c.box(ww, 0.03, 0.045, WOOD, [0, 0.37, 0], null, FXX);
      for (let k = 1; k < 3; k++) c.box(0.022, hh - 0.42, 0.03, WOOD, [-ww / 2 + k * ww / 3, 0.37 + (hh - 0.42) / 2, 0], null, WY);
      for (let k = 1; k < 4; k++) c.box(ww - 0.08, 0.022, 0.03, WOOD, [0, 0.37 + k * (hh - 0.4) / 4, 0], null, FXX);
      panes.push([x, FL + 0.37 + (hh - 0.42) / 2, -5 + zOff, ww - 0.08, hh - 0.42]);
    };
    // bays [-16,-14],[-14,-12] closed; [-12,-8] open (doors slid behind neighbors); [-8,-6] closed
    door(-15.5, 0.03); door(-14.5, -0.03); door(-13.5, 0.03); door(-12.5, -0.03);
    door(-12.25, 0.08); door(-7.75, 0.08); // slid-open panels overlapping
    door(-7.5, -0.03); door(-6.5, 0.03);
    // rails
    ctx.box(10, 0.03, 0.14, 0x5a3e2c, [-11, FL + 0.065, -5], null, FXX);
    // glass mesh
    const pos = [], uv = [], nor = [], idx = [];
    panes.forEach((p, i) => {
      const [x, y, z, w, h] = p;
      const b = pos.length / 3;
      const pts = [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x - w / 2, y + h / 2], [x + w / 2, y + h / 2]];
      pts.forEach((q) => {
        pos.push(q[0], q[1], z); nor.push(0, 0, 1);
        const u = (q[0] + 16) / 10, v = (q[1] - FL) / 2.0;
        uv.push(refl[0] + (refl[2] - refl[0]) * u, refl[1] + (refl[3] - refl[1]) * v);
      });
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, W.makeGlassMat());
    m.layers.set(W.LAYER.FX); m.renderOrder = 3;
    W.scene.add(m);
    W.glassMesh = m;
  }

  // ---------- roof ----------
  function roof(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(13);
    const ridgeZ = -9, ridgeY = 6.45, pitch = Math.atan((ridgeY - TOP) / 4.0); // ~29°
    const eaveZ = -13.85;
    const slopeLen = (ridgeZ - eaveZ) / Math.cos(pitch);
    const xL = -16, xR = -5.35; const width = xR - xL, cx = (xL + xR) / 2;
    // skylight in local coords: x across (relative to center), z down-slope from ridge
    const skyX = cx + 11, skyZ = 1.15 / Math.cos(pitch);
    const hole = { x: skyX, z: skyZ, r: 0.62 };
    W.skylight = new V3(-11, ridgeY - Math.sin(pitch) * skyZ, ridgeZ - Math.cos(pitch) * skyZ);
    const m = slopeMatrix(new V3(cx, ridgeY + 0.12, ridgeZ), Math.PI, pitch);
    // tile surface
    const tg = tileSurface(width, slopeLen, hole, 4);
    const cols = tg.userData.colors;
    ctx.addM(tg, 0xffffff, new THREE.Matrix4().copy(m).premultiply(new THREE.Matrix4()), [0, 0, 0, 6.0], null, (lx, ly, lz) => {
      const c = W.C(TILE).clone().multiplyScalar(0.9 + 0.14 * W.noise2(Math.floor((lx + 20) / 0.3) * 3.1, Math.floor(lz / 0.32) * 1.7));
      return c;
    });
    // roof board (underside = ceiling) with hole
    {
      const sh = new THREE.Shape();
      sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(width / 2, slopeLen); sh.lineTo(-width / 2, slopeLen); sh.closePath();
      const hp = new THREE.Path(); hp.absarc(hole.x, hole.z, hole.r, 0, Math.PI * 2, true); sh.holes.push(hp);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 28 });
      geo.rotateX(Math.PI / 2); // shape y → z ; extrude along -y
      const mm = slopeMatrix(new V3(cx, ridgeY + 0.1, ridgeZ), Math.PI, pitch);
      ctx.addM(geo, 0x4c3a2e, mm, [0, 0, 0.55, 0.0], null, (lx, ly, lz) => { const f = ((lx % 0.3) + 0.3) % 0.3; return C(0x4c3a2e).clone().multiplyScalar(f < 0.012 ? 0.62 : 0.94 + 0.12 * W.noise2(Math.floor(lx / 0.3) * 3.7, lz * 0.8)); });
      // rafters under the board
      for (let x = -width / 2 + 0.15; x < width / 2; x += 0.45) {
        const rm = mm.clone().multiply(W.T([x, -0.17, slopeLen / 2], null, [0.07, 0.08, slopeLen]));
        if (Math.abs(x - hole.x) < hole.r + 0.05) {
          // split rafter around skylight
          const l1 = hole.z - hole.r - 0.02, l2 = slopeLen - (hole.z + hole.r + 0.02);
          ctx.addM(W.g.box(1, 1, 1), DARK, mm.clone().multiply(W.T([x, -0.17, l1 / 2], null, [0.07, 0.08, l1])), [0, 0, 0.8, 1.5]);
          ctx.addM(W.g.box(1, 1, 1), DARK, mm.clone().multiply(W.T([x, -0.17, slopeLen - l2 / 2], null, [0.07, 0.08, l2])), [0, 0, 0.8, 1.5]);
          continue;
        }
        ctx.addM(W.g.box(1, 1, 1), DARK, rm, [0, 0, 0.45, 1.5]);
      }
      // skylight frame: wooden ring + glass rim
      ctx.addM(W.g.cyl(hole.r + 0.06, hole.r + 0.06, 0.22, 32, true), 0x6a4a30, mm.clone().multiply(W.T([hole.x, -0.02, hole.z])), [0, 0, 0, 1.25]);
      ctx.addM(W.g.torus(hole.r + 0.06, 0.05, 6, 32), DARK, mm.clone().multiply(W.T([hole.x, 0.1, hole.z], [Math.PI / 2, 0, 0])), [0, 0, 0, 0]);
      // purlins under roof
      [0.3, 0.55, 0.8].forEach((f) => ctx.addM(W.g.box(1, 1, 1), DARK, mm.clone().multiply(W.T([0, -0.3, slopeLen * f], null, [width, 0.16, 0.16])), [0, 0, 0.5, 1.0]));
    }
    // cut edge at left (x=-16): show layered section of roof (board, clay, tile)
    {
      const mm = slopeMatrix(new V3(cx, ridgeY + 0.1, ridgeZ), Math.PI, pitch);
      ctx.addM(W.g.box(1, 1, 1), 0xa08060, mm.clone().multiply(W.T([width / 2 - 0.02, 0.06, slopeLen / 2], null, [0.04, 0.08, slopeLen])), [0, 0, 0, 13.0]);
    }
    // eave edge: round tile ends (瓦当)
    const eaveM = slopeMatrix(new V3(cx, ridgeY + 0.12, ridgeZ), Math.PI, pitch);
    for (let x = -width / 2 + 0.15; x < width / 2; x += 0.3) {
      ctx.addM(W.g.cyl(0.075, 0.075, 0.06, 14), 0x4a505c, eaveM.clone().multiply(W.T([x, 0.05, slopeLen + 0.02], [Math.PI / 2, 0, 0])), [0, 0, 0, 6.0]);
      ctx.addM(W.g.cyl(0.03, 0.03, 0.07, 8), 0x6a7080, eaveM.clone().multiply(W.T([x, 0.05, slopeLen + 0.03], [Math.PI / 2, 0, 0])), [0, 0, 0, 6.0]);
    }
    ctx.addM(W.g.box(1, 1, 1), 0x3a2a22, eaveM.clone().multiply(W.T([0, -0.06, slopeLen - 0.02], null, [width, 0.12, 0.08])), FXX);
    // ridge (棟): stacked noshi tiles + cap
    ctx.box(width, 0.18, 0.34, 0x4c525e, [cx, ridgeY + 0.22, ridgeZ], null, [0, 0, 0, 6.0]);
    ctx.box(width, 0.12, 0.28, 0x555c68, [cx, ridgeY + 0.37, ridgeZ], null, [0, 0, 0, 6.0]);
    ctx.add(W.g.cyl(0.16, 0.16, width, 14, false), 0x5a6170, [cx, ridgeY + 0.45, ridgeZ], [0, 0, Math.PI / 2], 1, [0, 0, 0, 6.0]);
    // onigawara at right end
    const oni = ctx.at([xR - 0.05, ridgeY + 0.35, ridgeZ], [0, -Math.PI / 2, 0]);
    oni.box(0.55, 0.6, 0.12, 0x4a505c, [0, 0.12, 0], null, [0, 0, 0, 6.0]);
    oni.add(W.g.cyl(0.2, 0.2, 0.08, 16), 0x5a6070, [0, 0.18, 0.08], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 6.0]);
    oni.add(W.g.cyl(0.09, 0.09, 0.1, 12), 0x4a505c, [0, 0.18, 0.12], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 6.0]);
    // right gable (back half): triangle wall + bargeboard
    {
      const sh = new THREE.Shape(); sh.moveTo(-13.0, TOP); sh.lineTo(ridgeZ, TOP); sh.lineTo(ridgeZ, ridgeY); sh.closePath();
      const geo = new THREE.ShapeGeometry(sh);
      geo.rotateY(-Math.PI / 2);
      ctx.add(geo, PLASTER, [-6.0, 0, 0], null, 1, [0, 0, 0, 0]);
      ctx.add(geo, PLASTER, [-6.1, 0, 0], null, 1, [0, 0, 0, 0]);
      // gable timbers
      beam(ctx, -6.05, TOP + 0.4, ridgeZ, -6.05, ridgeY, ridgeZ, 0.14, DARK); // king post
      beam(ctx, -6.05, TOP + 1.2, -11.8, -6.05, TOP + 1.3, ridgeZ, 0.1, DARK);
      const bm = new THREE.Matrix4().compose(new V3(xR + 0.02, (ridgeY + TOP - 0.3) / 2 + 0.1, (ridgeZ + eaveZ) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0)), new V3(0.08, 0.28, slopeLen + 0.2));
      ctx.addM(W.g.box(1, 1, 1), 0x3a2a22, bm, WZ);
    }
    // exposed front structure: ridge beam, purlins, king posts, a few rafters (cut)
    beam(ctx, -16, ridgeY - 0.12, ridgeZ - 0.1, -5.5, ridgeY + 0.08, ridgeZ + 0.1, 0.2, DARK);
    [-16, -6].forEach((x) => beam(ctx, x, TOP + 0.32, ridgeZ - 0.06, x, ridgeY - 0.1, ridgeZ + 0.06, 0.12, DARK));
    // a few rafters left on the front slope (skeleton) near right gable
    [-6.2].forEach((x) => {
      const p0 = new V3(x, ridgeY - 0.05, ridgeZ), p1 = new V3(x, TOP + 0.05, -4.8);
      const len = p0.distanceTo(p1);
      const mm = new THREE.Matrix4().compose(p0.clone().lerp(p1, 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, 0)), new V3(0.08, 0.1, len));
      ctx.addM(W.g.box(1, 1, 1), DARK, mm, WZ);
    });
    W.roofInfo = { ridgeZ, ridgeY, pitch, eaveZ, slopeLen, cx, width };
  }

  // ---------- hisashi (engawa roofs) ----------
  function hisashi(B) {
    const ctx = new W.Ctx(B);
    const y0 = TOP - 0.05, y1 = 3.48;
    // front hisashi: from z=-5 to z=-2.95 across x -16 .. -4.45
    const fw = 11.55, fcx = -16 + fw / 2, fd = 2.05;
    const fp = Math.atan((y0 - y1) / fd);
    const fl = fd / Math.cos(fp);
    const fm = slopeMatrix(new V3(fcx, y0 + 0.05, -5), 0, fp);
    ctx.addM(tileSurface(fw, fl, null, 9), 0xffffff, fm, [0, 0, 0, 6.0], null, (lx, ly, lz) => W.C(TILE).clone().multiplyScalar(0.9 + 0.14 * W.noise2(Math.floor((lx + 20) / 0.3) * 3.1, Math.floor(lz / 0.32) * 1.7)));
    ctx.addM(W.g.box(1, 1, 1), 0x4c3a2e, fm.clone().multiply(W.T([0, -0.05, fl / 2], null, [fw, 0.06, fl])), [0, 0, 0.9, 1.0]);
    for (let x = -fw / 2 + 0.15; x < fw / 2; x += 0.3) {
      ctx.addM(W.g.cyl(0.07, 0.07, 0.06, 12), 0x4a505c, fm.clone().multiply(W.T([x, 0.05, fl + 0.02], [Math.PI / 2, 0, 0])), [0, 0, 0, 6.0]);
    }
    for (let x = -fw / 2 + 0.2; x < fw / 2; x += 0.42) ctx.addM(W.g.box(1, 1, 1), DARK, fm.clone().multiply(W.T([x, -0.12, fl / 2], null, [0.06, 0.07, fl])), [0, 0, 0.8, 1.5]);
    ctx.addM(W.g.box(1, 1, 1), 0x3a2a22, fm.clone().multiply(W.T([0, -0.05, fl - 0.02], null, [fw, 0.14, 0.08])), FXX);
    // right hisashi: from x=-6 to x=-4.45 along z -13.6 .. -3
    const rw = 10.6, rcz = -13.6 + rw / 2, rd = 1.55;
    const rp = Math.atan((y0 - y1) / rd);
    const rl = rd / Math.cos(rp);
    const rm = slopeMatrix(new V3(-6.0, y0 + 0.05, rcz), Math.PI / 2, rp);
    ctx.addM(tileSurface(rw, rl, null, 10), 0xffffff, rm, [0, 0, 0, 6.0], null, (lx, ly, lz) => W.C(TILE).clone().multiplyScalar(0.9 + 0.14 * W.noise2(Math.floor((lx + 20) / 0.3) * 3.1, Math.floor(lz / 0.32) * 1.7)));
    ctx.addM(W.g.box(1, 1, 1), 0x4c3a2e, rm.clone().multiply(W.T([0, -0.05, rl / 2], null, [rw, 0.06, rl])), [0, 0, 0.9, 1.0]);
    for (let x = -rw / 2 + 0.15; x < rw / 2; x += 0.3) ctx.addM(W.g.cyl(0.07, 0.07, 0.06, 12), 0x4a505c, rm.clone().multiply(W.T([x, 0.05, rl + 0.02], [Math.PI / 2, 0, 0])), [0, 0, 0, 6.0]);
    ctx.addM(W.g.box(1, 1, 1), 0x3a2a22, rm.clone().multiply(W.T([0, -0.05, rl - 0.02], null, [rw, 0.14, 0.08])), FXX);
    // eave posts
    [[-15.9, -3.3], [-11.3, -3.3], [-4.7, -3.3], [-4.7, -8.6], [-4.7, -13.3]].forEach((p) => beam(ctx, p[0], EY, p[1], p[0], y1 - 0.02, p[1], 0.12, DARK));
    beam(ctx, -16, y1 - 0.2, -3.3, -4.6, y1 - 0.05, -3.3, 0.12, DARK);
    beam(ctx, -4.7, y1 - 0.2, -13.4, -4.7, y1 - 0.05, -3.3, 0.12, DARK);
    W.eave = { y: y1 - 0.12, zFront: -3.05, xRight: -4.5 };
  }

  // ---------- exterior details on engawa ----------
  function engawaDetails(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(17);
    // telescope on tripod (front-right corner)
    {
      const t = ctx.at([-5.35, EY, -3.85], [0, -0.6, 0]);
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2;
        const foot = new V3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
        t.add(W.g.tube([foot, new V3(0, 1.25, 0)], 0.018, 0.014, 6, 2), 0x6a4a30, null, null, undefined, [0, 0, 0, 1.25]);
      }
      t.add(W.g.cyl(0.06, 0.07, 0.1, 12), 0xc89a48, [0, 1.28, 0], null, 1, [0, 0, 0, 9.0]);
      const tube = t.at([0, 1.38, 0], [-0.75, 0.0, 0]);
      tube.add(W.g.cyl(0.075, 0.085, 1.25, 18), 0xc9a04c, [0, 0, 0.1], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]);
      tube.add(W.g.cyl(0.095, 0.095, 0.16, 18), 0xb08840, [0, 0, -0.5], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]);
      tube.add(W.g.cyl(0.09, 0.09, 0.05, 18), 0xd8b060, [0, 0, 0.3], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]);
      tube.add(W.g.cyl(0.03, 0.03, 0.18, 10), 0x2a2420, [0, 0.02, 0.78], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 12.0]);
      tube.add(W.g.cyl(0.02, 0.02, 0.3, 8), 0xc9a04c, [0, 0.12, 0.1], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]);
    }
    // basket with chestnuts and pine cones
    {
      const b = ctx.at([-5.5, EY, -4.55]);
      b.add(W.g.cyl(0.24, 0.18, 0.2, 16, true), 0xb08a52, [0, 0.1, 0], null, 1, [0, 0, 0, 1.25]);
      b.add(W.g.torus(0.24, 0.02, 6, 20), 0x8a6a3a, [0, 0.2, 0], [Math.PI / 2, 0, 0], 1);
      b.add(W.g.torus(0.2, 0.015, 6, 20, Math.PI), 0x8a6a3a, [0, 0.2, 0], [0, 0, 0], 1);
      for (let i = 0; i < 12; i++) {
        const a = R() * 6.28, r = R() * 0.17;
        if (i % 3 === 0) b.add(W.g.cone(0.05, 0.09, 8), 0x7a5232, [Math.cos(a) * r, 0.2, Math.sin(a) * r], [R(), R(), R()], 1, [0, 0, 0, 0]);
        else b.add(W.g.sph(1, 8), 0x6a3a22, [Math.cos(a) * r, 0.19, Math.sin(a) * r], null, [0.045, 0.04, 0.045], [0, 0, 0, 0]);
      }
    }
    // oil-paper umbrella leaning on right wall
    {
      const u = ctx.at([-5.85, EY, -6.2], [0.18, 0, -0.12]);
      u.add(W.g.cyl(0.012, 0.012, 1.3, 6), 0x5a3a22, [0, 0.65, 0], null, 1);
      u.add(W.g.cone(0.13, 0.95, 16, true), 0xc8442a, [0, 0.85, 0], [Math.PI, 0, 0], 1, [0, 0, 0, 7.0]);
      for (let i = 0; i < 16; i++) u.add(W.g.box(0.006, 0.9, 0.006), 0x3a2a20, [Math.cos(i / 16 * 6.28) * 0.07, 0.85, Math.sin(i / 16 * 6.28) * 0.07], [Math.sin(i / 16 * 6.28) * 0.07, 0, -Math.cos(i / 16 * 6.28) * 0.07], 1);
      u.add(W.g.torus(0.06, 0.012, 6, 16), 0x2a5a8a, [0, 0.6, 0], [Math.PI / 2, 0, 0], 1);
    }
    // half-rolled bamboo blind (right hisashi)
    {
      const y = W.eave.y - 0.05;
      const b = ctx.at([-4.62, y, -11.2]);
      for (let k = 0; k < 18; k++) b.box(0.012, 1.0, 0.11, 0xc8a86a, [0, -0.5, -0.9 + k * 0.106], null, [0, 0.0, 0, 1.25]);
      b.add(W.g.cyl(0.07, 0.07, 1.95, 12), 0xb89858, [0, -1.05, 0], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 1.5]);
      b.box(0.02, 0.06, 1.95, 0x4a6a8a, [0, -0.02, 0], null, WZ);
      [-0.6, 0.6].forEach((z) => b.add(W.g.cyl(0.006, 0.006, 1.1, 4), 0xd8c8a8, [0.07, -0.55, z], null, 1));
    }
    // rain chain at front-right corner + stone basin
    {
      const top = new V3(-4.48, W.eave.y, -3.0);
      const ch = W.part('rainchain', top);
      for (let k = 0; k < 14; k++) {
        ch.ctx.add(W.g.cone(0.07, 0.09, 10, true), 0xb8743a, [0, -0.15 - k * 0.2, 0], [Math.PI, 0, 0], 1, [0, 0, 0, 9.0]);
        ch.ctx.add(W.g.cyl(0.005, 0.005, 0.12, 4), 0x8a5a2a, [0, -0.25 - k * 0.2, 0], null, 1);
      }
      ctx.add(W.g.lathe([[0, 0], [0.32, 0], [0.38, 0.1], [0.36, 0.34], [0.26, 0.36], [0.24, 0.2], [0, 0.2]], 20, 'basin'), 0x8a8478, [-4.48, 0.08, -3.0], null, 1, [0, 0, 0, 3.0]);
      const wb = new THREE.Mesh(new THREE.CircleGeometry(0.25, 20), W.makeFlowMat({ still: true, tint: 0x7cc4d4 }));
      wb.rotation.x = -Math.PI / 2; wb.position.set(-4.48, 0.4, -3.0); wb.layers.set(W.LAYER.FX); W.scene.add(wb);
      // pebbles around
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; ctx.add(W.g.ico(1, 0), W.jit(0x9a958a, 0.5, R), [-4.48 + Math.cos(a) * 0.5, 0.1, -3.0 + Math.sin(a) * 0.5], [R(), R(), 0], [0.08, 0.05, 0.07], [0, 0, 0, 3.0]); }
    }
    // slippers on step stone
    {
      const s = ctx.at([W.L.STEPS_X, 0.45, -2.3]);
      [-0.11, 0.11].forEach((x, i) => {
        const p = s.at([x, 0, 0.02 * i], [0, (i ? 0.12 : -0.08), 0]);
        p.add(W.g.soft(0.11, 0.035, 0.27, 0.015, 2), 0x6a4a3a, [0, 0.0175, 0], null, 1);
        p.add(W.g.soft(0.1, 0.03, 0.12, 0.015, 2), 0x2f5a6e, [0, 0.045, -0.05], null, 1);
      });
    }
    // scarf on a hook by the door (outer post at x=-12)
    {
      const h = ctx.at([-12.0, FL + 1.55, -4.9]);
      h.add(W.g.cyl(0.012, 0.012, 0.1, 6), 0xc89a48, [0, 0, 0.05], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]);
      const sc = W.part('scarf', new V3(-12.0, FL + 1.55, -4.8));
      const plaid = (lx, ly) => { const a = Math.floor((lx + 1) * 22) % 3 === 0, b = Math.floor((-ly + 1) * 14) % 3 === 0; return a && b ? C(0x2a3a5a) : a || b ? C(0x8a2a2a) : C(0xc8423a); };
      sc.ctx.add(W.g.boxS(0.17, 0.82, 0.018, 4, 10, 1), 0xffffff, [0.03, -0.4, 0.025], [0.05, 0, 0.05], 1, [0, 0, 0, 0], null, plaid);
      sc.ctx.add(W.g.boxS(0.17, 0.62, 0.018, 4, 8, 1), 0xffffff, [-0.04, -0.3, 0.0], [-0.04, 0, -0.08], 1, [0, 0, 0, 0], null, plaid);
      sc.ctx.add(W.g.cyl(0.04, 0.04, 0.18, 10), 0xc8423a, [0, -0.02, 0.012], [0, 0, Math.PI / 2], [1, 1, 0.6]);
      for (let k = 0; k < 6; k++) { sc.ctx.add(W.g.box(0.008, 0.06, 0.006), 0xe8dcc4, [-0.06 + k * 0.025 + 0.03, -0.84, 0.025], null, 1); }
      sc.swing = 0.25;
    }
    // persimmon strings (hoshigaki) & wind chime under front eave
    W.hangers = [];
    [-11.0, -10.6, -10.2, -14.6, -14.2].forEach((x, i) => {
      const top = new V3(x, W.eave.y - 0.02, -3.28);
      const p = W.part('kaki' + i, top);
      p.ctx.add(W.g.cyl(0.004, 0.004, 0.75, 4), 0xd8c8a0, [0, -0.375, 0], null, 1);
      for (let k = 0; k < 6; k++) {
        p.ctx.add(W.g.sph(1, 10), W.jit(0xd9681c, 0.15, R), [0, -0.1 - k * 0.11, 0], null, [0.045, 0.05, 0.045], [0, 0, 0, 0]);
        p.ctx.add(W.g.cyl(0.018, 0.022, 0.012, 4), 0x4a3a22, [0, -0.055 - k * 0.11, 0], null, 1);
      }
      p.swing = 0.12 + R() * 0.05; p.phase = R() * 6;
      W.hangers.push(p);
    });
    {
      const top = new V3(-7.3, W.eave.y - 0.02, -3.25);
      const p = W.part('furin', top);
      p.ctx.add(W.g.cyl(0.003, 0.003, 0.12, 4), 0xd8c8a0, [0, -0.06, 0], null, 1);
      p.ctx.add(W.g.sph(1, 14), 0xd8eef2, [0, -0.16, 0], null, [0.07, 0.065, 0.07], [0.2, 0, 0, 0]);
      p.ctx.add(W.g.cyl(0.072, 0.072, 0.02, 14), 0x5aa6c8, [0, -0.2, 0], null, 1, [0.1, 0, 0, 0]);
      p.ctx.add(W.g.cyl(0.002, 0.002, 0.16, 4), 0xd8c8a0, [0, -0.28, 0], null, 1);
      p.ctx.box(0.06, 0.18, 0.004, 0xe86a5a, [0, -0.44, 0], null, [0, 0, 0, 7.0]);
      p.swing = 0.3; p.phase = 1.3; p.chime = true;
      W.hangers.push(p);
      W.furin = p;
    }
    // dried flower bunches hanging upside down (flower stall)
    [-15.4, -15.0, -14.6, -13.4].forEach((x, i) => {
      const top = new V3(x, W.eave.y - 0.02, -3.45);
      const p = W.part('dryfl' + i, top);
      p.ctx.add(W.g.cyl(0.004, 0.004, 0.2, 4), 0xa08050, [0, -0.1, 0], null, 1);
      const cols = [0xb8505a, 0xd89a4a, 0x8a6aa8, 0xc8b070];
      for (let k = 0; k < 9; k++) {
        const a = k * 0.7;
        p.ctx.add(W.g.cyl(0.004, 0.004, 0.32, 3), 0x7a8a4a, [Math.cos(a) * 0.02, -0.36, Math.sin(a) * 0.02], [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], 1);
        p.ctx.add(W.g.sph(1, 6), W.jit(cols[i], 0.2, R), [Math.cos(a) * 0.06, -0.54 - R() * 0.04, Math.sin(a) * 0.06], null, [0.035, 0.05, 0.035], [0, 0, 0, 7.0]);
      }
      p.ctx.add(W.g.cyl(0.02, 0.02, 0.04, 6), 0xc8a060, [0, -0.2, 0], null, 1);
      p.swing = 0.1; p.phase = i * 1.7;
      W.hangers.push(p);
    });
  }

  // ---------- flower stall ----------
  function flowerStall(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(23);
    const T = ctx.at([-14.25, EY, -4.45]);
    const tw = 2.0, td = 0.62, th = 0.78;
    // old table with drawers
    T.box(tw, 0.05, td, 0x8a5e3a, [0, th, 0], null, FXX);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => T.box(0.06, th, 0.06, 0x6a4a2e, [sx * (tw / 2 - 0.05), th / 2, sz * (td / 2 - 0.05)], null, WY));
    T.box(tw - 0.1, 0.16, td - 0.08, 0x7a5434, [0, th - 0.11, 0], null, FXX);
    [-0.55, 0, 0.55].forEach((x) => { T.box(0.5, 0.12, 0.02, 0x93683f, [x, th - 0.11, td / 2 - 0.02], null, FXX); T.add(W.g.sph(1, 6), 0xc8a050, [x, th - 0.11, td / 2], null, 0.018, [0, 0, 0, 9.0]); });
    T.box(tw - 0.1, 0.03, td - 0.1, 0x7a5434, [0, 0.12, 0], null, FXX);
    // buckets & crates
    const bucket = (c, x, y, z, r, h, col) => {
      c.add(W.g.cyl(r, r * 0.82, h, 18, true), col, [x, y + h / 2, z], null, 1, [0, 0, 0, 12.0]);
      c.add(W.g.torus(r, 0.008, 6, 20), C(col).clone().multiplyScalar(0.8), [x, y + h, z], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 12.0]);
      c.add(W.g.cyl(r * 0.8, r * 0.8, 0.01, 18), col, [x, y + 0.01, z], null, 1, [0, 0, 0, 12.0]);
    };
    const kinds = [
      ['rose', 0xd8282a], ['rose', 0xf07a3a], ['ranunculus', 0xf2903a], ['ranunculus', 0xe84a3a], ['anemone', 0x5a48b8], ['anemone', 0xd83a5a],
      ['dahlia', 0xc8243a], ['dahlia', 0xf0a03a], ['cosmos', 0xf28aa8], ['cosmos', 0xd84a8a], ['mum', 0xf2c23a], ['mum', 0xf6f0e0], ['lavender', 0x7a5ad0], ['lavender', 0x8a6ae0],
    ];
    const bunch = (c, x, y, z, kind, col, n, spread, h) => {
      for (let i = 0; i < n; i++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * spread;
        const top = new V3(x + Math.cos(a) * r * 1.6, y + h * R.range(0.85, 1.1), z + Math.sin(a) * r * 1.6);
        const base = new V3(x + Math.cos(a) * r * 0.3, y, z + Math.sin(a) * r * 0.3);
        c.add(W.g.tube([base, base.clone().lerp(top, 0.6), top], 0.006, 0.005, 3, 3), 0x5a7a2e, null, null, undefined, [0, 0.12, 0, 0]);
        if (kind !== 'lavender' && R() < 0.5) c.add(W.g.leaf('narrow'), W.jit(0x4f7a2a, 0.2, R), [top.x, top.y - 0.12, top.z], [0.6, a, 0], [0.05, 1, 0.16], [0, 0.15, 0, 8.0]);
        const wv = c.worldPos([top.x, top.y, top.z]);
        W.flowerHead(new W.Ctx(c.b), wv, kind, col, (kind === 'lavender' ? 0.06 : kind === 'dahlia' ? 0.115 : kind === 'mum' ? 0.095 : 0.085) * R.range(0.85, 1.15), R, [R.range(-0.5, 0.5), R() * 6, R.range(-0.5, 0.5)]);
      }
    };
    // on table: 5 buckets
    const tb = [[-0.75, 0.12, 0.17, 0.32, 0x8a9aa4, 0], [-0.3, -0.1, 0.14, 0.38, 0xb8c0c4, 2], [0.15, 0.1, 0.15, 0.3, 0x7a8a96, 4], [0.55, -0.12, 0.13, 0.36, 0xa8b0b4, 6], [0.82, 0.14, 0.12, 0.28, 0x8a96a0, 8]];
    tb.forEach((b, i) => { bucket(T, b[0], th + 0.025, b[1], b[2], b[3], b[4]); const k = kinds[b[5]]; bunch(T, b[0], th + 0.03, b[1], k[0], k[1], 12, b[2] * 0.62, b[3] + 0.3); const k2 = kinds[b[5] + 1]; bunch(T, b[0], th + 0.03, b[1], k2[0], k2[1], 6, b[2] * 0.5, b[3] + 0.22); });
    // under/front of table on floor: tall buckets, crates
    const fb = [[-0.8, 0.5, 0.18, 0.5, 0x9aa4aa, 10], [-0.35, 0.55, 0.16, 0.42, 0x6f7f8c, 12], [0.2, 0.52, 0.17, 0.46, 0xb4bcc0, 6], [0.75, 0.5, 0.15, 0.4, 0x8a96a0, 2]];
    fb.forEach((b, i) => { bucket(T, b[0], 0, b[1], b[2], b[3], b[4]); const k = kinds[b[5]]; bunch(T, b[0], 0.0, b[1], k[0], k[1], 14, b[2] * 0.62, b[3] + 0.36); const k2 = kinds[(b[5] + 3) % kinds.length]; bunch(T, b[0], 0.0, b[1], k2[0], k2[1], 7, b[2] * 0.5, b[3] + 0.28); });
    // overflow onto the ground in front of the engawa (visible from above)
    const G = new W.Ctx(B);
    [[-15.3, -2.72, 0.2, 0.46, 0x8a96a0, 2, 13], [-14.75, -2.62, 0.17, 0.4, 0xb4bcc0, 4, 6], [-14.2, -2.72, 0.19, 0.48, 0x9aa4aa, 6, 8]].forEach((b) => {
      const y = W.H(b[0], b[1]);
      const c = G.at([b[0], y, b[1]]);
      bucket(c, 0, 0, 0, b[2], b[3], b[4]);
      const k = kinds[b[5]], k2 = kinds[b[6]];
      bunch(c, 0, 0, 0, k[0], k[1], 14, b[2] * 0.62, b[3] + 0.36);
      bunch(c, 0, 0, 0, k2[0], k2[1], 7, b[2] * 0.5, b[3] + 0.28);
    });

    // wooden crates under table
    [[-0.55, 0.0], [0.45, -0.05]].forEach(([x, z], i) => {
      T.box(0.5, 0.28, 0.38, 0xa8804e, [x, 0.14 + 0.15, z], [0, i * 0.1, 0], FXX);
      T.box(0.52, 0.03, 0.4, 0x8a6a3a, [x, 0.4, z], [0, i * 0.1, 0], FXX);
      bunch(T, x, 0.3, z, kinds[i ? 9 : 1][0], kinds[i ? 9 : 1][1], 5, 0.1, 0.2);
    });
    // on table: watering can, shears, twine, kraft paper
    T.add(W.g.cyl(0.08, 0.09, 0.16, 14), 0x5a8a8a, [-0.95, th + 0.105, -0.18], null, 1, [0, 0, 0, 12.0]);
    T.add(W.g.cyl(0.012, 0.018, 0.22, 6), 0x5a8a8a, [-0.84, th + 0.16, -0.18], [0, 0, -1.0], 1, [0, 0, 0, 12.0]);
    T.add(W.g.torus(0.05, 0.008, 6, 12, Math.PI), 0x5a8a8a, [-0.95, th + 0.19, -0.18], null, 1, [0, 0, 0, 12.0]);
    T.add(W.g.cyl(0.05, 0.05, 0.07, 14), 0xc8a870, [0.35, th + 0.06, 0.2], null, 1);
    T.add(W.g.cyl(0.018, 0.018, 0.072, 8), 0x8a6a3a, [0.35, th + 0.06, 0.2], null, 1);
    T.box(0.5, 0.004, 0.36, 0xc49a62, [0.05, th + 0.03, 0.18], [0, 0.2, 0], [0, 0, 0, 7.0]);
    T.box(0.42, 0.004, 0.3, 0xd0a870, [0.0, th + 0.034, 0.16], [0, -0.15, 0], [0, 0, 0, 7.0]);
    const sh = T.at([-0.45, th + 0.035, 0.22], [0, 0.6, 0]);
    sh.box(0.16, 0.008, 0.018, 0xb0b8c0, [0.06, 0, 0], [0, 0.12, 0], [0, 0, 0, 12.0]);
    sh.box(0.16, 0.008, 0.018, 0xb0b8c0, [0.06, 0.004, 0], [0, -0.12, 0], [0, 0, 0, 12.0]);
    sh.add(W.g.torus(0.03, 0.008, 6, 12), 0xc83a2a, [-0.04, 0.004, 0.02], [Math.PI / 2, 0, 0], 1);
    sh.add(W.g.torus(0.03, 0.008, 6, 12), 0xc83a2a, [-0.04, 0.004, -0.02], [Math.PI / 2, 0, 0], 1);
    // wrapped bouquet lying on table
    {
      const bq = T.at([0.3, th + 0.06, 0.05], [0, 0.4, Math.PI / 2 - 0.15]);
      bq.add(W.g.cone(0.11, 0.42, 10, true), 0xc8a06a, [0, 0.0, 0], [Math.PI, 0, 0], 1, [0, 0, 0, 7.0]);
      for (let i = 0; i < 5; i++) W.flowerHead(new W.Ctx(B), bq.worldPos([R.range(-0.06, 0.06), 0.22, R.range(-0.06, 0.06)]), 'rose', [0xd8282a, 0xf07a3a, 0xf2c23a][i % 3], 0.05, R, [0, 0, -Math.PI / 2]);
    }
    // sign board in front
    {
      const s = ctx.at([-13.05, EY, -3.55], [0, -0.25, 0]);
      s.box(0.04, 0.55, 0.04, 0x6a4a2e, [-0.18, 0.27, 0], [0.12, 0, 0], WY);
      s.box(0.04, 0.55, 0.04, 0x6a4a2e, [0.18, 0.27, 0], [0.12, 0, 0], WY);
      s.box(0.42, 0.27, 0.025, 0xffffff, [0, 0.44, 0.02], [-0.15, 0, 0], [0, 0, 0, 0], W.atlas.get('sign'));
    }
    // fallen petals and trimmings on engawa
    const pc = [0xd8282a, 0xf07a3a, 0x7a5ad0, 0xf28aa8, 0xf2c23a];
    for (let i = 0; i < 40; i++) {
      ctx.add(W.g.leaf('round'), pc[i % pc.length], [-14.25 + R.range(-1.2, 1.2), EY + 0.005, -4.0 + R.range(-0.2, 0.75)], [R.range(-0.1, 0.1), R() * 6, 0], 0.05, [0, 0, 0, 7.0]);
    }
    for (let i = 0; i < 8; i++) {
      const x = -14.25 + R.range(-1, 1), z = -3.7 + R.range(-0.2, 0.3);
      ctx.add(W.g.cyl(0.005, 0.005, R.range(0.1, 0.25), 3), 0x5a7a2e, [x, EY + 0.008, z], [Math.PI / 2, R() * 6, 0], 1);
      ctx.add(W.g.leaf('narrow'), 0x4f7a2a, [x + 0.05, EY + 0.006, z], [0, R() * 6, 0], [0.05, 1, 0.14]);
    }
    // twine ball
    ctx.add(W.g.sph(1, 10), 0xc8a870, [-12.9, EY + 0.06, -4.1], null, 0.06, [0, 0, 0, 0]);
  }

  // ---------- leaves on roofs ----------
  function roofLeaves(B) {
    const ctx = new W.Ctx(W.bucket('leaves'));
    const R = W.rng(29);
    const ri = W.roofInfo;
    const m = slopeMatrix(new V3(ri.cx, ri.ridgeY + 0.12, ri.ridgeZ), Math.PI, ri.pitch);
    for (let i = 0; i < 170; i++) {
      const lx = R.range(-ri.width / 2, ri.width / 2), lz = Math.pow(R(), 0.6) * ri.slopeLen;
      if (Math.hypot(lx - (ri.cx + 11), lz - 1.15 / Math.cos(ri.pitch)) < 0.75) continue;
      const p = new V3(lx, 0.07, lz).applyMatrix4(m);
      const gink = R() < 0.55;
      ctx.add(W.g.leaf(gink ? 'ginkgo' : 'maple'), W.jit(gink ? 0xf0b820 : R() < 0.5 ? 0xc8301c : 0xe0601c, 0.3, R), [p.x, p.y, p.z], [-ri.pitch * 0.9 + R.range(-0.2, 0.2), R() * 6, R.range(-0.2, 0.2)], R.range(0.12, 0.17), [0, 0, 0, 8.0]);
    }
    // front & right hisashi
    for (let i = 0; i < 200; i++) {
      let x, z, y;
      if (R() < 0.6) { x = R.range(-15.9, -4.6); z = R.range(-4.9, -3.1); y = W.lerp(TOP + 0.05, 3.5, (z + 5) / 2.05) + 0.08; }
      else { x = R.range(-5.9, -4.6); z = R.range(-13.4, -3.2); y = W.lerp(TOP + 0.05, 3.5, (x + 6) / 1.55) + 0.08; }
      const gink = x > -9 ? R() < 0.7 : R() < 0.3;
      ctx.add(W.g.leaf(gink ? 'ginkgo' : 'maple'), W.jit(gink ? 0xf0b820 : 0xd0401c, 0.3, R), [x, y, z], [0.4 + R.range(-0.2, 0.2), R() * 6, R.range(-0.2, 0.2)], R.range(0.12, 0.16), [0, 0, 0, 8.0]);
    }
  }

  W.studio = {
    build: function () {
      const B = W.bucket('studio');
      platform(B);
      floors(B);
      frame(B);
      glassDoors(B);
      roof(B);
      hisashi(B);
      engawaDetails(B);
      flowerStall(W.bucket('stall'));
      roofLeaves(B);
    },
  };
})();
