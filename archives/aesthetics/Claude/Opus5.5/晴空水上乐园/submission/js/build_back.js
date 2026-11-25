'use strict';
/* ==========================================================================
   Back row: towers, conveyors, slides & special slide structures
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;
  const gy = (x, z) => P.groundY(x, z);
  const L = P.L;
  const addI = (n, it) => P.addInst(n, it);

  /* ------------------------------------------------------------ tower helper */
  // square open frame tower with decks
  function tower(o) {
    const B = P.B, F = P.FB;
    const { x, z, base, decks, half, c1, c2, deckHalf } = o;
    const top = decks[decks.length - 1];
    const colT = o.colT || 0.75;
    // columns with alternating colour bands
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const cx = x + a * half, cz = z + b * half;
      for (let y = base; y < top + 3.5; y += 2) B.box(cx - colT / 2, y, cz - colT / 2, cx + colT / 2, Math.min(y + 2, top + 3.5), cz + colT / 2, (Math.floor((y - base) / 2) & 1) ? c2 : c1);
      B.box(cx - colT / 2 - 0.25, base, cz - colT / 2 - 0.25, cx + colT / 2 + 0.25, base + 0.5, cz + colT / 2 + 0.25, M.concrete);
    }
    // ring beams + X bracing on each face between levels
    const levels = [base].concat(decks);
    for (let li = 0; li < levels.length; li++) {
      const y = levels[li];
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        B.beam(x + ax * half, y + 0.1, z + az * half, x + bx * half, y + 0.1, z + bz * half, 0.5, c1);
        if (li < levels.length - 1) {
          const y2 = levels[li + 1];
          B.beam(x + ax * half, y + 0.4, z + az * half, x + bx * half, y2 - 0.2, z + bz * half, 0.25, li % 2 ? c2 : M.white);
          B.beam(x + bx * half, y + 0.4, z + bz * half, x + ax * half, y2 - 0.2, z + az * half, 0.25, li % 2 ? c2 : M.white);
        }
      }
    }
    // spiral stair around a central post
    const sr = Math.min(half - 1.0, 2.6);
    B.box(x - 0.375, base, z - 0.375, x + 0.375, top, z + 0.375, M.white2);
    const steps = Math.round((top - base) / V);
    for (let i = 0; i < steps; i++) {
      const a = i * (Math.PI * 2 / 18);
      const y = base + i * V;
      for (let r = 0.5; r <= sr; r += 0.2) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        B.box(px - 0.2, y, pz - 0.2, px + 0.2, y + V, pz + 0.2, i % 2 ? M.white : M.skyPale);
      }
      // outer handrail posts (fine)
      const hx = x + Math.cos(a) * (sr + 0.2), hz = z + Math.sin(a) * (sr + 0.2);
      F.box(hx - 0.0625, y + 0.25, hz - 0.0625, hx + 0.0625, y + 1.25, hz + 0.0625, M.rail);
    }
    // decks
    decks.forEach((y, i) => {
      const dh = deckHalf[i];
      B.box(x - dh, y - 0.5, z - dh, x + dh, y, z + dh, M.white);
      // checker deck top
      B.box(x - dh + 0.25, y - 0.25, z - dh + 0.25, x + dh - 0.25, y, z + dh - 0.25, i % 2 ? M.tile2 : M.tile);
      B.box(x - dh - 0.25, y - 0.75, z - dh - 0.25, x + dh + 0.25, y - 0.5, z + dh + 0.25, c2);
      // carve stair opening
      B.box(x - sr - 0.3, y - 0.75, z - sr - 0.3, x + sr + 0.3, y, z + sr + 0.3, P.CARVE);
      B.box(x - 0.375, y - 0.75, z - 0.375, x + 0.375, y, z + 0.375, M.white2);
      if (!o.noRail) P.railing([[x - dh, z - dh], [x + dh, z - dh], [x + dh, z + dh], [x - dh, z + dh], [x - dh, z - dh]], y, { mat: M.rail, post: c1, glass: true });
      // canopy (shade roof) above deck
      const ch = y + (i === decks.length - 1 ? 3.25 : 2.75);
      if (i === decks.length - 1 || o.allCanopies) {
        for (let k = 0; k < 3; k++) {
          const r = dh + 0.5 - k * 0.75;
          for (let xx = x - r; xx < x + r; xx += 1) B.box(xx, ch + k * 0.25, z - r, Math.min(xx + 1, x + r), ch + k * 0.25 + 0.25, z + r, (Math.floor((xx - x + r) / 1) & 1) ? o.roof1 : o.roof2);
        }
        for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(x + a * (dh - 0.25) - 0.125, y, z + b * (dh - 0.25) - 0.125, x + a * (dh - 0.25) + 0.125, ch, z + b * (dh - 0.25) + 0.125, M.white);
      }
    });
    return { top };
  }

  /* ------------------------------------------------------------ conveyor */
  P.conveyors = [];
  function conveyor(ax, ay, az, bx, by, bz) {
    const B = P.B, F = P.FB;
    const L0 = Math.hypot(bx - ax, by - ay, bz - az);
    const dx = (bx - ax) / L0, dy = (by - ay) / L0, dz = (bz - az) / L0;
    const px = -dz, pz = dx; // horizontal perpendicular
    const pl = Math.hypot(px, pz) || 1;
    const n = Math.ceil(L0 / 0.25);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (let w = -0.75; w <= 0.75; w += 0.25) {
        const X = x + px / pl * w, Z = z + pz / pl * w;
        B.box(X - 0.125, y - 0.25, Z - 0.125, X + 0.125, y, Z + 0.125, Math.abs(w) > 0.6 ? M.white : M.rubber);
      }
      // side rails
      for (const w of [-1.0, 1.0]) {
        const X = x + px / pl * w, Z = z + pz / pl * w;
        F.box(X - 0.0625, y + 0.375, Z - 0.0625, X + 0.0625, y + 0.5, Z + 0.0625, M.sky);
      }
      if (i % 24 === 0) {
        const g = gy(x, z);
        if (y - g > 1) {
          for (const w of [-0.75, 0.75]) {
            const X = x + px / pl * w, Z = z + pz / pl * w;
            B.box(X - 0.125, g, Z - 0.125, X + 0.125, y - 0.25, Z + 0.125, M.white2);
          }
        }
      }
    }
    P.conveyors.push({ a: [ax, ay, az], b: [bx, by, bz], L: L0 });
  }

  /* ------------------------------------------------------------ waterfalls / streams registry */
  P.falls = []; // {x0,z0,x1,z1 (lip line), y0 (lip), y1 (landing), vx,vz (outflow dir), w, strength}
  function fall(x0, z0, x1, z1, y0, y1, ox, oz, strength) {
    P.falls.push({ x0, z0, x1, z1, y0, y1, ox, oz, s: strength || 1 });
  }
  P.addFall = fall;

  /* ------------------------------------------------------------ mountain rock dressing & waterfalls */
  function mountainDressing() {
    const B = P.B;
    const rnd = P.rng(2024);
    // boulders on terraces & foot
    for (let i = 0; i < 160; i++) {
      const x = -160 + rnd() * 320, z = -118 + rnd() * 56;
      if (Math.abs(x) < 10 && z > -90) continue; // waterfall axis
      const k = P.colIndex(x, z);
      if (k < 0 || P.waterLevel[k] > -50) continue;
      const g = gy(x, z);
      if (g < 1.0) continue;
      const top = P.terrain.top[k];
      if (top === M.pave || top === M.pave2 || top === M.paveEdge) continue;
      const r = 0.6 + rnd() * 1.6;
      B.ellipsoid(x, g + r * 0.35, z, r, r * 0.75, r * 0.85, (X, Y, Z) => {
        const h = P.hash3i(Math.floor(X * 2), Math.floor(Y * 2), Math.floor(Z * 2));
        return Y > g + r * 0.7 ? (h < 0.5 ? M.rock3 : M.rock) : h < 0.4 ? M.rock2 : M.rock;
      });
    }
    // central waterfall cascade: T3 basin -> T2 basin -> plunge pool
    // lip rocks
    for (const [z, y] of [[-82.0, 14], [-71.6, 9]]) {
      for (let x = -4.5; x <= 4.5; x += 0.25) {
        B.box(x, y - 0.25, z - 0.25, x + 0.25, y + 0.25, z + 0.25, Math.abs(x) > 3 ? M.rock3 : M.rockWet);
      }
    }
    fall(-2.6, -82.2, 2.6, -82.2, 13.85, 8.8, 0, 1, 1.0);
    fall(-3.6, -71.9, 3.6, -71.9, 8.8, -0.3, 0, 1, 1.4);
    // left-wing waterfall into lwbasin then down the cliff to the strip
    fall(-87.2, -83.4, -83.0, -83.4, 9.9, 6.8, 0, 1, 0.8);
    fall(-86.5, -78.6, -83.5, -78.6, 6.8, 0.0, 0, 1, 0.9);
    // carve stream runnel from lwbasin to cliff edge
    P.B.box(-86.5, 6.25, -79.0, -83.5, 7.0, -78.0, P.CARVE);
    // plunge pool for the left waterfall foot (small)
    // right wing small waterfall (family zone) near the arch built later
  }

  /* ------------------------------------------------------------ tunnel through the spur + curtain ledge */
  function tunnel() {
    const B = P.B;
    const t = L.tunnel;
    const lv = L.river.level;
    // carve along river centreline inside spur
    const path = P.river;
    for (let x = t.x0 - 1.0; x <= t.x1 + 1.0; x += 0.25) {
      const q = path.nearest(x, -54, 12);
      const z0 = q ? path.at(q.s).z : -54;
      for (let dz = -4.25; dz <= 4.25; dz += 0.25) {
        const w = Math.abs(dz);
        const ceil = lv + (t.ceil + 0.6) * Math.sqrt(Math.max(0, 1 - Math.pow(w / 4.4, 2))) + 0.6;
        const z = z0 + dz;
        // bed
        const bed = w < 3.5 ? L.river.bed + (w > 2.9 ? 0.25 : 0) : lv + 0.25;
        B.box(x, bed - 0.25, z, x + 0.25, bed, z + 0.25, w < 3.5 ? M.riverBed : M.caveRock2);
        B.box(x, bed, z, x + 0.25, ceil, z + 0.25, P.CARVE);
        // walkway ledge inside tunnel along the north side
      }
    }
    // portals: rock arches framing each end
    for (const px of [t.x0 - 0.5, t.x1 + 0.5]) {
      for (let dz = -5.25; dz <= 5.25; dz += 0.25) {
        const w = Math.abs(dz);
        const inner = lv + (t.ceil + 0.6) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(w, 4.4) / 4.4, 2))) + 0.6;
        const outer = inner + 1.0;
        if (w > 4.4) continue;
        B.box(px - 0.5, inner, -54 + dz, px + 0.5, outer, -54 + dz + 0.25, (Math.floor((dz + 6) / 0.75) & 1) ? M.rock3 : M.rock);
      }
    }
    // overhanging lip above east portal: water curtain falls in front of the portal
    B.box(t.x1 - 0.5, 5.75, -58.5, t.x1 + 2.0, 7.0, -49.5, M.rock);
    B.box(t.x1 + 1.5, 5.5, -58.25, t.x1 + 2.25, 6.0, -49.75, M.rockWet);
    fall(t.x1 + 1.9, -58.0, t.x1 + 1.9, -50.0, 5.6, lv, 1, 0, 1.2);
    P.curtain = { x: t.x1 + 1.9, z0: -58, z1: -50, y0: 5.6 };
    // glowing crystals & light strips inside the tunnel walls
    const rnd = P.rng(77);
    const cols = [M.crystalC, M.crystalP, M.crystalB];
    for (let i = 0; i < 46; i++) {
      const x = t.x0 + 1 + rnd() * (t.x1 - t.x0 - 2);
      const side = rnd() < 0.5 ? -1 : 1;
      const z = -54 + side * (3.9 + rnd() * 0.3);
      const y = lv + 0.6 + rnd() * 2.6;
      const c = cols[Math.floor(rnd() * 3)];
      const h = 0.5 + rnd() * 0.9;
      B.box(x, y, z - 0.25, x + 0.25, y + h, z + 0.25, c);
      B.box(x - 0.25, y, z - 0.25, x + 0.5, y + h * 0.5, z + 0.25, c);
    }
    // light strips along both walls (two colours)
    for (let x = t.x0 + 0.5; x < t.x1 - 0.5; x += 0.25) {
      const k = Math.floor((x - t.x0) / 1.5) % 3;
      for (const side of [-1, 1]) {
        const z = -54 + side * 4.1;
        B.box(x, lv + 0.35, z - 0.125, x + 0.25, lv + 0.6, z + 0.125, [M.ledCyan, M.ledPink, M.ledLemon][k]);
      }
      // ceiling strip
      B.box(x, lv + t.ceil + 1.0, -54.25, x + 0.25, lv + t.ceil + 1.25, -53.75, (Math.floor((x - t.x0) / 2) & 1) ? M.ledLav : M.ledCyan);
    }
  }

  /* ------------------------------------------------------------ helpers for slide control points */
  // raise control points so the slide clears the terrain
  function clear(ctrl, cl) {
    return ctrl.map((p) => {
      let g = -1e9;
      for (let a = -1.5; a <= 1.5; a += 1.5) for (let b = -1.5; b <= 1.5; b += 1.5) g = Math.max(g, gy(p[0] + a, p[2] + b));
      return [p[0], Math.max(p[1], g + cl), p[2]];
    });
  }
  // path along direction with profile [[d, y], ...], lateral offset
  function linePath(x0, z0, dx, dz, prof, lat) {
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const px = dz, pz = -dx;
    return prof.map(([d, y]) => [x0 + dx * d + px * (lat || 0), y, z0 + dz * d + pz * (lat || 0)]);
  }

  /* ------------------------------------------------------------ SKY TOWER & central slides */
  function skyTower() {
    const t = L.tower;
    tower({ x: t.x, z: t.z, base: t.base, decks: [t.low, t.mid, t.top], half: 4, deckHalf: [5.5, 7.0, 6.5], c1: M.white, c2: M.sky, roof1: M.sky, roof2: M.white, allCanopies: true });
    const B = P.B, F = P.FB;
    // roof crown + ring logo + windsock mast
    B.box(t.x - 1.0, t.top + 3.5, t.z - 1.0, t.x + 1.0, t.top + 4.5, t.z + 1.0, M.white);
    P.logoRing(t.x, t.top + 8.6, t.z + 0.25, 'S', 4.0, 2);
    P.logoRing(t.x, t.top + 8.6, t.z - 0.25, 'N', 4.0, 1);
    B.box(t.x - 0.5, t.top + 4.5, t.z - 0.5, t.x + 0.5, t.top + 4.75, t.z + 0.5, M.sky2);
    F.box(t.x + 4.5 - 0.0625, t.top + 3.5, t.z - 0.0625, t.x + 4.5 + 0.0625, t.top + 11.0, t.z + 0.0625, M.steel);
    P.windsock = { x: t.x + 4.5, y: t.top + 10.8, z: t.z };
    // name board on the tower front
    P.board(t.x, t.low + 3.0, t.z + 5.5 + 0.5, 'S', 7.5, 1.6, M.signW, 1, 0.4);
    P.stampBits(P.textBits('晴空塔', 11), t.x, t.low + 3.0, t.z + 6.0 + FV, 'S', M.sky2, 1, 1);
  }

  function centralSlides() {
    const t = L.tower;
    const B = P.B, F = P.FB;
    /* ---------- vertical speed slide with launch capsule */
    {
      const cx = -9.5, cz = -87.5, cy = t.top;
      // walkway from the top deck to the capsule
      B.box(-7.0, cy - 0.5, -89.0, -8.0, cy, -86.0, M.white);
      B.box(-11.25, cy - 0.5, -89.25, -7.75, cy, -85.75, M.white);
      B.box(-11.5, cy - 0.75, -89.5, -7.5, cy - 0.5, -85.5, M.sky);
      // capsule: transparent cylinder with top cap & countdown lights
      B.cyl(cx, cz, 1.25, cy, cy + 3.0, M.glClear, 1.0);
      B.cyl(cx, cz, 1.6, cy + 3.0, cy + 3.5, M.sky2);
      B.cyl(cx, cz, 1.2, cy + 3.5, cy + 3.75, M.white);
      B.cyl(cx, cz, 1.6, cy - 0.75, cy, M.lemon, 1.0);
      B.cyl(cx, cz, 1.45, cy + 1.5, cy + 1.75, M.lemon, 1.25);
      for (const a of [0.785, 2.356, 3.927, 5.498]) B.box(cx + Math.cos(a) * 1.3 - 0.125, cy, cz + Math.sin(a) * 1.3 - 0.125, cx + Math.cos(a) * 1.3 + 0.125, cy + 3.0, cz + Math.sin(a) * 1.3 + 0.125, M.sky);
      P.board(cx, cy + 4.4, cz + 1.65, 'S', 2.6, 0.75, M.signY, 1, 0.25);
      P.stampBits(P.textBits('垂直高速', 5), cx, cy + 4.4, cz + 1.65 + FV, 'S', M.signN, 1, 1);
      P.B.box(cx - 0.125, cy + 3.75, cz + 1.4, cx + 0.125, cy + 4.1, cz + 1.65, M.white);
      // carve inside capsule floor -> trapdoor (dynamic) — leave floor open
      B.cyl(cx, cz, 0.95, cy - 0.75, cy + 3.0, P.CARVE);
      P.capsule = { x: cx, y: cy, z: cz };
      // frame around the vertical drop
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(cx + a * 1.3 - 0.125, 20, cz + b * 1.3 - 0.125, cx + a * 1.3 + 0.125, cy - 0.5, cz + b * 1.3 + 0.125, M.white2);
      for (let y = 22; y < cy; y += 4) B.box(cx - 1.45, y, cz - 1.45, cx + 1.45, y + 0.25, cz + 1.45, M.sky);
      const ctrl = [
        [cx, cy + 0.2, cz], [cx, cy - 4, cz], [cx, cy - 9, cz], [cx, 25.0, cz], [cx, 22.6, cz + 0.2],
      ];
      // curve out then descend SSW
      const d0x = -0.42, d0z = 0.91;
      const prof = [[1.0, 21.0], [3.0, 19.4], [6.0, 17.9], [12, 15.4], [20, 12.0], [28, 8.6], [36, 5.0], [42, 2.6], [46, 1.2], [50, 0.62], [54, 0.5], [64, 0.48]];
      const sx = cx, sz = cz + 0.6;
      for (const [d, y] of prof) ctrl.push([sx + d0x * d, y, sz + d0z * d]);
      P.vertical = P.addSlide({
        name: 'vertical', ctrl: clear(ctrl, 1.6), r: 0.72, th: 0.3, open: 180, mat: M.slSky,
        glass: [[0, 15.5, M.glClear]], rim: null, rider: 'tube', kind: 'vertical',
        phys: { v0: 0.2, mu: 0.03, drag: 0.004, vmin: 0.3 }, sup: { from: 18, every: 5 },
      });
      // run-out channel (decelerating water) — diagonal capsule-shaped pool
      const ro = (P.runout = { x0: sx + d0x * 47, z0: sz + d0z * 47, x1: sx + d0x * 64, z1: sz + d0z * 64 });
      const segD = (x, z) => {
        const dx = ro.x1 - ro.x0, dz = ro.z1 - ro.z0, L2 = dx * dx + dz * dz;
        let t = ((x - ro.x0) * dx + (z - ro.z0) * dz) / L2; t = Math.max(0, Math.min(1, t));
        return Math.hypot(x - ro.x0 - dx * t, z - ro.z0 - dz * t);
      };
      P.carvePool('vertical', [Math.min(ro.x0, ro.x1) - 2, Math.min(ro.z0, ro.z1) - 2, Math.max(ro.x0, ro.x1) + 2, Math.max(ro.z0, ro.z1) + 2],
        (x, z) => segD(x, z) - 1.4, () => -0.75, { level: -0.1, rim: 0.6, deck: 1.8, deckY: 0, deckMat: M.tile });
      P.splash.vertical = { cx: ro.x1, cz: ro.z1, hx: 1.4, hz: 1.4, level: -0.1 };
    }
    /* ---------- loop slide */
    {
      const ctrl = [[7.6, t.top + 0.3, -97], [9.2, t.top - 0.6, -97], [11.0, t.top - 3.4, -97], [12.6, t.top - 7.6, -97], [14.2, 26.0, -97], [16.2, 24.9, -97]];
      const pts = P.catmull3(ctrl, 0.2);
      const lc = { x: 19.2, y: 29.1, z: -97 }, R = 4.2;
      for (let i = 1; i <= 120; i++) {
        const ph = (i / 120) * Math.PI * 2;
        pts.push(new THREE.Vector3(lc.x + R * Math.sin(ph), lc.y - R * Math.cos(ph), lc.z + 2.5 * (ph / (Math.PI * 2))));
      }
      const tail = clear([[19.2, 24.9, -94.5], [22.5, 24.5, -94.5], [26.5, 23.4, -94.0], [30.5, 21.8, -91.5], [34, 20.0, -87], [36.6, 18.0, -81.5], [39.2, 15.6, -75], [41.8, 13.0, -69], [44.2, 10.2, -63.5], [46.4, 7.2, -58.4], [48.4, 4.4, -53.4], [50.0, 2.2, -48.8], [51.0, 0.9, -45.0], [51.4, 0.5, -42.0], [51.5, 0.46, -38.5]], 1.6);
      // smooth join
      const tp = P.catmull3([[lc.x, lc.y - R, lc.z + 2.5]].concat(tail), 0.2);
      for (const p of tp.slice(1)) pts.push(p);
      P.loopSlide = P.addSlide({
        name: 'loop', pts, r: 0.7, th: 0.3, open: 180, mat: M.slPink,
        glass: [[14.5, 46.5, M.glPink]], rider: 'tube',
        phys: { v0: 1.0, mu: 0.03, drag: 0.003 }, sup: { every: 6, from: 48 },
      });
      // loop support frame
      for (const zz of [-97.9, -93.7]) {
        B.box(lc.x - 5.2, 14, zz - 0.25, lc.x - 4.7, lc.y + 1, zz + 0.25, M.white2);
        B.box(lc.x + 4.7, 14, zz - 0.25, lc.x + 5.2, lc.y + 1, zz + 0.25, M.white2);
        B.box(lc.x - 5.2, lc.y + 4.9, zz - 0.25, lc.x + 5.2, lc.y + 5.4, zz + 0.25, M.pink2);
      }
      B.box(lc.x - 5.2, lc.y + 4.9, -97.9, lc.x - 4.7, lc.y + 5.4, -93.7, M.pink2);
      B.box(lc.x + 4.7, lc.y + 4.9, -97.9, lc.x + 5.2, lc.y + 5.4, -93.7, M.pink2);
      P.loop = lc;
    }
    /* ---------- double helix (two intertwined tubes) */
    {
      const ax = -21, az = -90, R = 3.9, y0 = t.mid + 0.1, pitch = 6.6, turns = 2.1;
      const mk = (phase, dy, conn, tailCtrl, mat, glassMat) => {
        const pts = P.catmull3(conn, 0.2);
        const n = 220;
        for (let i = 1; i <= n; i++) {
          const ph = (i / n) * turns * Math.PI * 2;
          pts.push(new THREE.Vector3(ax + R * Math.cos(ph + phase), y0 - dy - pitch * ph / (Math.PI * 2), az + R * Math.sin(ph + phase)));
        }
        const last = pts[pts.length - 1];
        const tp = P.catmull3([[last.x, last.y, last.z]].concat(clear(tailCtrl, 1.6)), 0.2);
        for (const p of tp.slice(1)) pts.push(p);
        return P.addSlide({
          name: 'helix' + (phase ? 'B' : 'A'), pts, r: 0.62, th: 0.28, open: 180, mat,
          rings: { every: 2.6, width: 0.6, mat: glassMat }, rider: 'tube',
          phys: { v0: 1.2, mu: 0.06, drag: 0.006 }, sup: { every: 5, from: 66 },
        });
      };
      const endA = y0 - 0 - pitch * turns;
      const a1 = turns * Math.PI * 2;
      // tube A: from mid deck west edge heading west into helix east point
      P.helixA = mk(0, 0, [[-7.5, y0 + 0.2, -92.5], [-10.5, y0 + 0.1, -91.6], [-13.8, y0 + 0.05, -90.6], [ax + R + 0.02, y0, az - 0.4]],
        [[-26, endA - 1.5, -86], [-31, endA - 3.0, -80], [-36, endA - 4.6, -73], [-41, endA - 7.0, -65], [-44.5, endA - 9.6, -58], [-47.0, endA - 12, -51], [-48.5, 1.6, -46], [-49.5, 0.7, -42.5], [-50, 0.46, -39]], M.slSky, M.glBlue);
      // tube B: connector loops north at a higher level and enters at the opposite point
      P.helixB = mk(Math.PI, 0, [[-7.5, y0 + 0.2, -96.5], [-12, y0 + 0.25, -97.8], [-18, y0 + 0.2, -97.2], [-23.5, y0 + 0.1, -94.2], [ax - R - 0.02, y0, az + 0.4]],
        [[-30, endA - 2.2, -91], [-35, endA - 3.6, -84], [-40, endA - 5.4, -76], [-44.5, endA - 7.6, -67], [-48, endA - 10, -59], [-51, endA - 12.4, -52], [-52.5, 1.5, -46.5], [-53.2, 0.7, -43], [-53.5, 0.46, -40]], M.slYellow, M.glYellow);
      // central mast of the helix
      B.box(ax - 0.5, 14, az - 0.5, ax + 0.5, y0 + 3.5, az + 0.5, M.white);
      for (let y = 15; y < y0 + 3; y += 3.3) {
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + y * 0.9;
          B.beam(ax, y, az, ax + Math.cos(a) * (R - 0.8), y, az + Math.sin(a) * (R - 0.8), 0.25, M.white2);
        }
      }
      B.cyl(ax, az, 1.2, y0 + 3.5, y0 + 4.0, M.lemon);
      P.helixAxis = { x: ax, z: az, y0, R };
    }
    /* ---------- rainbow racer (6 lanes) */
    {
      const lanes = [M.rbRed, M.rbOrange, M.rbYellow, M.rbGreen, M.rbBlue, M.rbPurple];
      const dx = 0.493, dz = 0.870;
      const prof = [[0, t.mid + 0.25], [1.5, t.mid + 0.15], [4, t.mid - 1.4], [7, 24.2], [10, 20.4], [13, 17.8], [16, 16.6], [19, 16.6], [22, 15.0], [25, 13.2], [28, 12.4], [30.5, 12.5], [33, 11.0], [36, 8.4], [39, 6.2], [41.5, 5.3], [44, 5.0], [47, 3.0], [50, 1.1], [52.5, 0.55], [56, 0.46], [59, 0.45]];
      P.racer = { lanes: [], dx, dz };
      lanes.forEach((mat, i) => {
        const lat = (i - 2.5) * 1.15;
        const ctrl = linePath(4.9, -90.6, dx, dz, prof, lat);
        const s = P.addSlide({
          name: 'racer' + i, ctrl, r: 0.55, th: 0.25, open: 98, mat, rim: (i === 0 || i === 5) ? M.white : null, rider: 'mat', kind: 'racer', lane: i,
          phys: { v0: 0.6, mu: 0.07 + i * 0.0035 * ((i * 7) % 3), drag: 0.008 }, supports: i === 0 || i === 5, sup: { every: 5 },
        });
        P.racer.lanes.push(s);
      });
      // start gate & finish gantry with ranking lights
      const fx = 4.9 + dx * 53, fz = -90.6 + dz * 53;
      const px = dz, pz = -dx;
      for (const s of [-1, 1]) {
        const x = fx + px * s * 4.2, z = fz + pz * s * 4.2;
        B.box(x - 0.25, 0, z - 0.25, x + 0.25, 4.25, z + 0.25, M.white);
      }
      B.beam(fx - px * 4.2, 4.25, fz - pz * 4.2, fx + px * 4.2, 4.25, fz + pz * 4.2, 0.75, M.signN);
      P.rankLights = [];
      for (let i = 0; i < 6; i++) {
        const lat = (i - 2.5) * 1.15;
        P.rankLights.push({ x: fx + px * lat, y: 3.6, z: fz + pz * lat });
      }
      P.racerFinish = { x: fx, z: fz, px, pz };
    }
  }

  /* ------------------------------------------------------------ EXTREME zone */
  function extremeZone() {
    const t = L.xtower;
    tower({ x: t.x, z: t.z, base: t.base, decks: [t.mid, t.top], half: 3.25, deckHalf: [4.5, 5.0], c1: M.white, c2: M.pink, roof1: M.pink, roof2: M.white, allCanopies: true });
    const B = P.B;
    P.board(t.x, t.mid + 2.6, t.z + 5.0 + 0.25, 'S', 6.0, 1.4, M.signW, 1, 0.4);
    P.stampBits(P.textBits('极限区', 10), t.x, t.mid + 2.6, t.z + 5.25 + FV, 'S', M.pink2, 1, 1);
    /* ---------- giant funnel (horn on its side) */
    {
      const A = { x: -112, y: 19.0, z: -84 }, Bp = { x: -96, y: 14.2, z: -84 };
      const rr = (u) => 1.15 + 4.9 * u * u;
      B.fill(A.x - 0.5, 6, -92, Bp.x + 0.5, 26, -76, (x, y, z) => {
        const u = (x - A.x) / (Bp.x - A.x);
        if (u < 0 || u > 1) return 0;
        const ay = A.y + (Bp.y - A.y) * u;
        const dyy = y - ay, dzz = z - A.z;
        const d = Math.hypot(dyy, dzz);
        const r = rr(u);
        if (d < r || d > r + 0.32) return 0;
        const ang = Math.atan2(dzz, -dyy);
        // exit hole at the bottom near the mouth
        if (u > 0.8 && u < 0.93 && Math.abs(ang) < 0.32) return 0;
        const band = Math.floor(u * 9) & 1;
        if (u > 0.965) return M.white;
        return band ? M.slPink : M.slLav;
      });
      // smooth normals for funnel voxels
      for (let x = A.x; x <= Bp.x; x += V) for (let y = 6; y < 26; y += V) for (let z = -92; z < -76; z += V) {
        const X = Math.floor(x / V), Y = Math.floor(y / V), Z = Math.floor(z / V);
        const m = P.world.get(X, Y, Z);
        if (m !== M.slPink && m !== M.slLav && m !== M.white) continue;
        const u = (x - A.x) / (Bp.x - A.x);
        const ay = A.y + (Bp.y - A.y) * u;
        const dyy = (Y + 0.5) * V - ay, dzz = (Z + 0.5) * V - A.z;
        const d = Math.hypot(dyy, dzz) || 1;
        P.world.setN(X, Y, Z, -0.25, dyy / d, dzz / d);
      }
      // support legs
      for (const [x, z] of [[-110, -86], [-104, -89], [-104, -79], [-98, -89.5], [-98, -78.5]]) {
        const g = gy(x, z);
        const u = (x - A.x) / (Bp.x - A.x);
        const ay = A.y + (Bp.y - A.y) * u;
        const top = ay - Math.sqrt(Math.max(0, Math.pow(rr(u) + 0.3, 2) - Math.pow(z - A.z, 2)));
        if (top > g) B.box(x - 0.375, g, z - 0.375, x + 0.375, top + 0.25, z + 0.375, M.white2);
      }
      P.funnel = { A, B: Bp, rr };
      // inbound tube from tower top
      const inCtrl = clear([[-116.6, t.top + 0.25, -95.5], [-113.5, t.top - 0.6, -96.5], [-109, t.top - 2.0, -96], [-105, t.top - 3.6, -93], [-104.5, t.top - 5.0, -89], [-107.5, t.top - 6.4, -86], [-110.5, A.y + 0.9, -84.3], [-112.6, A.y + 0.15, -84.0], [-111.6, A.y - 0.05, -84.0]], 1.6);
      P.funnelIn = P.addSlide({ name: 'funnelIn', ctrl: inCtrl, r: 0.66, th: 0.28, open: 180, mat: M.slLav, glass: [[6, 9, M.glLav]], rider: 'tube', phys: { v0: 1.0, mu: 0.05 } });
      // exit chute from the hole down to the pool
      const sp = P.splash.funnel;
      P.funnelOut = P.addSlide({
        name: 'funnelOut', ctrl: clear([[-97.6, 8.9, -84.0], [-97.4, 7.9, -82.2], [-97.6, 6.6, -79.0], [-98.4, 4.6, -74.5], [-99.2, 2.6, -70.5], [-99.8, 1.0, -67.6], [-100, 0.5, -65.5], [-100, 0.46, -63.5]], 1.4),
        r: 0.62, th: 0.28, open: 100, mat: M.slPink, rim: M.white, rider: 'tube', phys: { v0: 2.0, mu: 0.06 },
      });
    }
    /* ---------- giant bowl */
    {
      const c = { x: -128, z: -66, yb: 5.8, R: 7.0, D: 3.6 };
      B.fill(c.x - 7.6, c.yb - 0.6, c.z - 7.6, c.x + 7.6, c.yb + c.D + 0.6, c.z + 7.6, (x, y, z) => {
        const r = Math.hypot(x - c.x, z - c.z);
        if (r > 7.45 || r < 0.95) return 0;
        const ys = c.yb + c.D * Math.pow(Math.min(r, c.R) / c.R, 2);
        if (r > c.R) return (y >= ys - 0.45 && y <= ys + 0.3) ? M.white : 0;
        if (y > ys || y < ys - 0.36) return 0;
        const a = Math.atan2(z - c.z, x - c.x);
        const sp = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12 + r * 0.55) & 1;
        return sp ? M.slYellow : M.slWhite;
      });
      for (let X = Math.floor((c.x - 7.6) / V); X <= Math.floor((c.x + 7.6) / V); X++)
        for (let Z = Math.floor((c.z - 7.6) / V); Z <= Math.floor((c.z + 7.6) / V); Z++)
          for (let Y = Math.floor((c.yb - 0.6) / V); Y <= Math.floor((c.yb + c.D + 0.6) / V); Y++) {
            const m = P.world.get(X, Y, Z);
            if (m !== M.slYellow && m !== M.slWhite) continue;
            const x = (X + 0.5) * V - c.x, z = (Z + 0.5) * V - c.z;
            const r = Math.hypot(x, z) || 1;
            const slope = 2 * c.D * r / (c.R * c.R);
            const l = Math.hypot(slope, 1);
            P.world.setN(X, Y, Z, -x / r * slope / l, 1 / l, -z / r * slope / l);
          }
      // legs
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + 0.3;
        const x = c.x + Math.cos(a) * 5.0, z = c.z + Math.sin(a) * 5.0;
        const g = gy(x, z);
        const ys = c.yb + c.D * Math.pow(5.0 / c.R, 2) - 0.36;
        B.box(x - 0.375, g, z - 0.375, x + 0.375, ys, z + 0.375, M.white2);
      }
      P.bowl = c;
      const inCtrl = clear([[-127.6, t.top + 0.25, -93.5], [-131.5, t.top - 1.4, -91.5], [-135.5, t.top - 3.2, -88.0], [-137.2, t.top - 5.0, -83.5], [-135.5, t.top - 6.8, -79.6], [-131.5, t.top - 8.6, -78.4], [-127, t.top - 10.4, -78.8], [-123.4, t.top - 12.2, -77.2], [-122.4, t.top - 14.0, -74.6], [-123.8, c.yb + c.D + 0.9, -73.2], [-126.0, c.yb + c.D + 0.4, -72.85], [-128.0, c.yb + c.D + 0.15, -72.8]], 1.6);
      P.bowlIn = P.addSlide({ name: 'bowlIn', ctrl: inCtrl, r: 0.66, th: 0.28, open: 180, mat: M.slYellow, glass: [[18, 21, M.glYellow]], rider: 'tube', phys: { v0: 1.0, mu: 0.05 } });
    }
    /* ---------- U half-pipe (raft) */
    {
      const hp = { x0: -164, x1: -140, z: -77, base: 7.6, H: 9.0, w: 2.25 };
      const yAt = (u) => hp.base + hp.H * Math.pow(Math.max(0, Math.abs(u - 12) - 2.5), 2) / Math.pow(9.5, 2);
      P.halfpipe = Object.assign(hp, { yAt });
      B.fill(hp.x0, hp.base - 1.2, hp.z - hp.w - 0.75, hp.x1, hp.base + hp.H + 1.6, hp.z + hp.w + 0.75, (x, y, z) => {
        const u = x - hp.x0;
        const ys = yAt(u);
        const dz = Math.abs(z - hp.z);
        const curve = ys + Math.pow(dz / hp.w, 4) * 0.5;
        if (dz <= hp.w) {
          if (y <= curve && y > curve - 0.32) return (Math.floor(u / 2) & 1) ? M.slMint : M.slTeal;
          return 0;
        }
        if (dz <= hp.w + 0.5 && y > ys - 0.3 && y < ys + 1.1) return M.white;
        return 0;
      });
      // exit opening in the south wall at the bottom + chute
      B.box(hp.x0 + 10.5, hp.base - 0.2, hp.z + hp.w - 0.25, hp.x0 + 13.5, hp.base + 1.4, hp.z + hp.w + 0.75, P.CARVE);
      // support frame
      for (let u = 0; u <= 24; u += 3) {
        const x = hp.x0 + u;
        const ys = yAt(u);
        for (const s of [-1, 1]) {
          const z = hp.z + s * (hp.w + 0.25);
          const g = gy(x, z);
          if (ys - g > 0.6) B.box(x - 0.25, g, z - 0.25, x + 0.25, ys - 0.3, z + 0.25, M.white2);
        }
      }
      // start platform on the west rim
      B.box(hp.x0 - 3.5, hp.base + hp.H - 0.5, hp.z - 2.75, hp.x0 + 0.25, hp.base + hp.H, hp.z + 2.75, M.white);
      for (const s of [-1, 1]) for (const q of [-3.25, -0.25]) { const g = gy(hp.x0 + q, hp.z + s * 2.5); B.box(hp.x0 + q - 0.25, g, hp.z + s * 2.5 - 0.25, hp.x0 + q + 0.25, hp.base + hp.H, hp.z + s * 2.5 + 0.25, M.mint2); }
      for (let k = 0; k < 3; k++) B.box(hp.x0 - 3.75 + k * 0.5, hp.base + hp.H + 2.6 + k * 0.25, hp.z - 3 + k * 0.5, hp.x0 + 0.5 - k * 0.5, hp.base + hp.H + 2.85 + k * 0.25, hp.z + 3 - k * 0.5, k % 2 ? M.white : M.mint);
      for (const s of [-1, 1]) B.box(hp.x0 - 3.4, hp.base + hp.H, hp.z + s * 2.6 - 0.125, hp.x0 - 3.15, hp.base + hp.H + 2.6, hp.z + s * 2.6 + 0.125, M.white);
      P.stairs(hp.x0 - 1.5, hp.z - 2.75, 'N', 1.25, hp.base + hp.H, gy(hp.x0 - 1.5, hp.z - 8), M.white, 0.375);
      const out = clear([[hp.x0 + 12, hp.base + 0.05, hp.z + 0.5], [hp.x0 + 12, hp.base - 0.05, hp.z + hp.w + 1.0], [hp.x0 + 12.4, hp.base - 1.0, hp.z + 4.4], [hp.x0 + 13.0, hp.base - 3.4, hp.z + 7.5], [hp.x0 + 13.6, 2.4, -66.5], [hp.x0 + 14, 0.8, -64.2], [hp.x0 + 14, 0.46, -62.2], [hp.x0 + 14, 0.46, -61.0]], 1.2);
      P.halfOut = P.addSlide({ name: 'halfOut', ctrl: out, r: 1.35, th: 0.3, open: 95, mat: M.slMint, rim: M.white, rider: 'raft', phys: { v0: 2.5, mu: 0.06 } });
      P.splash.halfpipe.cx = hp.x0 + 14; // pool is placed under
    }
    /* ---------- black hole */
    {
      const ctrl = clear([[-119.4, t.mid + 0.25, -89.2], [-118.6, t.mid - 0.8, -85.2], [-115.8, t.mid - 2.4, -81.6], [-114.6, t.mid - 4.2, -77.6], [-117.2, t.mid - 6.0, -74.8], [-119.6, t.mid - 7.8, -71.2], [-118.6, t.mid - 9.6, -67.4], [-115.4, t.mid - 11.4, -64.4], [-114.6, t.mid - 13.2, -60.4], [-116.8, t.mid - 15.0, -56.4], [-118.2, 2.8, -51.4], [-118.2, 1.2, -47.2], [-118.0, 0.5, -44.0], [-118.0, 0.46, -40.6]], 1.6);
      P.blackhole = P.addSlide({ name: 'blackhole', ctrl, r: 0.68, th: 0.3, open: 180, mat: M.slNavy, stars: true, rider: 'tube', phys: { v0: 1.0, mu: 0.05 } });
    }
    // extreme conveyor
    conveyor(-106, gy(-106, -104) + 0.25, -104, -118.6, t.mid - 0.25, -97.0);
  }

  /* ------------------------------------------------------------ FAMILY zone + coaster */
  function familyZone() {
    const t = L.ftower;
    tower({ x: t.x, z: t.z, base: t.base, decks: [t.mid, t.top], half: 3.25, deckHalf: [4.5, 5.5], c1: M.white, c2: M.lemon, roof1: M.lemon, roof2: M.white, allCanopies: true });
    const B = P.B;
    P.board(t.x, t.mid + 2.6, t.z + 5.0 + 0.25, 'S', 6.0, 1.4, M.signW, 1, 0.4);
    P.stampBits(P.textBits('家庭区', 10), t.x, t.mid + 2.6, t.z + 5.25 + FV, 'S', M.lemon2, 1, 1);
    /* ---------- family raft slide (wide open trough) passing through a waterfall arch */
    {
      const ctrl = clear([[112.4, t.top + 0.3, -88.4], [110.0, t.top - 0.5, -85.0], [105.4, t.top - 1.6, -82.0], [100.2, t.top - 2.7, -79.6], [96.4, t.top - 3.9, -75.2], [96.8, t.top - 5.1, -69.6], [101.0, t.top - 6.2, -65.4], [106.8, t.top - 7.4, -62.8], [111.2, t.top - 8.6, -59.6], [112.0, t.top - 10.0, -55.2], [109.6, t.top - 11.6, -51.2], [106.2, t.top - 13.2, -48.2], [105.0, 3.0, -46.6], [104.6, 1.0, -44.6], [104.4, 0.48, -42.2], [104.2, 0.46, -39.4]], 2.0);
      P.familySlide = P.addSlide({ name: 'family', ctrl, r: 1.65, th: 0.3, open: 100, mat: M.slYellow, rim: M.white, rider: 'raft', phys: { v0: 1.2, mu: 0.05, drag: 0.01 }, sup: { every: 5 } });
      // waterfall arch over the slide around index of point (101, -65.4)
      const tr = P.familySlide.track;
      let best = 0, bd = 1e9;
      for (let i = 0; i < tr.n; i++) { const d = Math.hypot(tr.p[i].x - 103.5, tr.p[i].z - 64.2 * -1); if (d < bd) { bd = d; best = i; } }
      const p = tr.p[best], R = tr.R[best];
      const archY = p.y + 4.6;
      for (const s of [-1, 1]) {
        const x = p.x + R.x * s * 3.4, z = p.z + R.z * s * 3.4;
        const g = gy(x, z);
        B.ellipsoid(x, (g + archY) / 2, z, 1.4, (archY - g) / 2 + 0.6, 1.4, (X, Y, Z) => (P.hash3i(Math.floor(X * 2), Math.floor(Y * 2), Math.floor(Z * 2)) < 0.45 ? M.rock3 : M.rock));
      }
      B.beam(p.x - R.x * 3.4, archY, p.z - R.z * 3.4, p.x + R.x * 3.4, archY, p.z + R.z * 3.4, 1.5, M.rock);
      B.beam(p.x - R.x * 3.0, archY + 0.9, p.z - R.z * 3.0, p.x + R.x * 3.0, archY + 0.9, p.z + R.z * 3.0, 1.0, M.rock3);
      const T = tr.T[best];
      fall(p.x - R.x * 2.4 + T.x * 0.7, p.z - R.z * 2.4 + T.z * 0.7, p.x + R.x * 2.4 + T.x * 0.7, p.z + R.z * 2.4 + T.z * 0.7, archY - 0.75, p.y - 1.2, T.x, T.z, 0.9);
      P.familyFall = { i: best };
    }
    /* ---------- parent-child double tubes (two medium tubes) */
    {
      const c1 = clear([[110.6, t.mid + 0.25, -96.6], [107.0, t.mid - 0.4, -99.0], [102.4, t.mid - 1.2, -98.8], [99.2, t.mid - 2.0, -95.6], [99.6, t.mid - 2.8, -91.4], [103.0, t.mid - 3.6, -89.4], [105.6, t.mid - 4.4, -86.2], [103.2, t.mid - 5.2, -82.2], [97.6, t.mid - 6.2, -80.4], [91.4, t.mid - 7.2, -78.2], [86.6, t.mid - 8.2, -74.2], [84.2, t.mid - 9.2, -68.6], [82.6, 3.0, -61.4], [80.6, 2.0, -54.4], [79.4, 1.1, -48.6], [78.6, 0.5, -45.0], [78.4, 0.46, -41.6]], 1.6);
      P.kid1 = P.addSlide({ name: 'kid1', ctrl: c1, r: 0.78, th: 0.28, open: 180, mat: M.slMint, glass: [[24, 30, M.glMint]], rider: 'tube2x', phys: { v0: 1.0, mu: 0.06 } });
      const c2 = clear([[110.6, t.mid + 0.25, -90.0], [106.6, t.mid - 0.4, -88.6], [102.0, t.mid - 1.2, -90.2], [96.8, t.mid - 2.0, -90.0], [93.0, t.mid - 2.9, -86.6], [92.2, t.mid - 3.8, -82.0], [88.2, t.mid - 4.8, -80.6], [83.4, t.mid - 5.8, -82.4], [79.4, t.mid - 6.8, -79.4], [78.0, t.mid - 7.8, -74.0], [77.0, t.mid - 8.8, -67.0], [76.4, 3.2, -60.0], [75.6, 2.0, -53.4], [75.2, 1.0, -47.8], [75.0, 0.5, -44.6], [75.0, 0.46, -41.4]], 1.6);
      P.kid2 = P.addSlide({ name: 'kid2', ctrl: c2, r: 0.78, th: 0.28, open: 180, mat: M.slOrange, glass: [[34, 40, M.glYellow]], rider: 'tube2x', phys: { v0: 1.0, mu: 0.06 } });
    }
    /* ---------- short wave slides (3 wide gentle lanes) */
    {
      P.waveSlides = [];
      const g0 = gy(140, -83);
      B.box(132.5, g0, -86, 147.5, g0 + 2.75, -82.5, M.white);
      B.box(132.25, g0 + 2.75, -86.25, 147.75, g0 + 3.0, -82.25, M.mint);
      P.stairs(140, -86, 'N', 3, g0 + 2.75, g0, M.white, 0.5);
      [136, 140, 144].forEach((x, i) => {
        const prof = [[0, g0 + 3.0], [2, g0 + 2.8], [4, g0 + 2.0], [6, g0 + 1.7], [8, g0 + 1.9], [10, g0 + 1.2], [12, g0 + 0.9], [14, g0 + 1.1], [16, 0.7], [18, 0.48], [20.5, 0.46]];
        const ctrl = prof.map(([d, y]) => [x, y, -84 + d]);
        P.waveSlides.push(P.addSlide({ name: 'wslide' + i, ctrl, r: 0.95, th: 0.25, open: 88, mat: [M.slSky, M.slLav, M.slMint][i], rim: M.white, rider: 'mat', phys: { v0: 1.0, mu: 0.08 }, supports: false }));
      });
    }
    /* ---------- water coaster: from tower top around the right wing, over the river into end pool */
    {
      const raw = [
        [120.6, t.top + 0.3, -93.2], [124.6, t.top - 0.4, -95.0], [129.4, t.top - 2.4, -96.4], [134.6, t.top - 5.6, -97.0],
        [139.6, t.top - 8.0, -95.6], [143.6, t.top - 8.6, -92.6], // valley
        [147.2, t.top - 7.4, -89.0], [150.2, t.top - 5.4, -85.0], [152.4, t.top - 4.6, -80.6], // uphill 1 crest
        [154.6, t.top - 6.8, -75.8], [157.0, t.top - 10.0, -70.6], [159.2, t.top - 11.2, -65.0], // drop
        [160.6, t.top - 10.0, -59.4], [161.4, t.top - 8.0, -53.6], [161.6, t.top - 7.2, -48.0], // uphill 2 crest
        [160.8, t.top - 9.6, -42.0], [158.6, t.top - 12.6, -36.2], [155.4, t.top - 13.8, -30.8], // drop
        [151.0, t.top - 12.4, -26.4], [146.0, t.top - 10.6, -23.8], [141.0, t.top - 10.2, -23.0], // uphill 3 over river crest
        [136.6, t.top - 12.6, -23.8], [132.6, t.top - 15.6, -25.4], [130.0, 1.8, -27.0], [128.0, 0.7, -28.4], [125.6, 0.47, -29.6], [122.6, 0.46, -30.4],
      ];
      const ctrl = clear(raw, 1.5);
      const def = P.addSlide({
        name: 'coaster', ctrl, r: 1.4, th: 0.3, open: 96, mat: M.slTeal, rim: M.white, rider: 'raft', kind: 'coaster',
        glass: [], phys: { v0: 1.5, mu: 0.07, drag: 0.012, vmin: 2.0, boost: [] }, noVoxel: true, supports: false,
      });
      // find uphill ranges -> jets
      const tr = def.track;
      const jets = [];
      let inUp = false, s0 = 0;
      for (let i = 1; i < tr.n; i++) {
        const up = tr.T[i].y > 0.04;
        if (up && !inUp) { inUp = true; s0 = i * tr.ds; }
        if (!up && inUp) { inUp = false; if (i * tr.ds - s0 > 4) jets.push([s0, i * tr.ds]); }
      }
      def.jets = jets;
      // recompute physics with boost on uphill ranges
      def.phys.boost = jets.map((j) => [j[0], j[1], 5.2]);
      P.addSlide; // keep
      const def2 = P.addSlide({
        name: 'coaster', pts: null, ctrl, r: 1.4, th: 0.3, open: 96, mat: M.slTeal, rim: M.white, rider: 'raft', kind: 'coaster',
        stripe: { every: 3, from: 1.2, mat: M.slMint }, phys: { v0: 1.5, mu: 0.07, drag: 0.012, vmin: 2.0, boost: def.phys.boost }, sup: { every: 5 },
      });
      def2.jets = jets;
      P.slides.splice(P.slides.indexOf(def), 1);
      P.coaster = def2;
      // jet nozzles (lemon blocks) along uphill trough bottoms
      const tr2 = def2.track;
      for (const j of jets) {
        for (let s = j[0] + 0.5; s < j[1]; s += 1.5) {
          const i = Math.round(s / tr2.ds);
          const p = tr2.p[i], U = tr2.U[i];
          const x = p.x - U.x * 1.45, y = p.y - U.y * 1.45, z = p.z - U.z * 1.45;
          P.B.box(x - 0.25, y - 0.125, z - 0.25, x + 0.25, y + 0.125, z + 0.25, M.lemon2);
        }
      }
    }
    conveyor(133, gy(133, -101) + 0.25, -101, 121.6, t.mid - 0.25, -95.2);
  }

  P.buildBack = function () {
    mountainDressing();
    tunnel();
    skyTower();
    centralSlides();
    extremeZone();
    familyZone();
    // sky tower conveyor (north-east side)
    conveyor(23, gy(23, -107) + 0.25, -107, 7.6, L.tower.mid - 0.25, -102.6);
    // kids castle slides (small open troughs)
    for (const cs of P.castleSlides || []) {
      P.addSlide({ name: 'castle', ctrl: cs.pts, r: 0.42, th: 0.25, open: 100, mat: cs.mat, rim: M.white, phys: { v0: 1.0, mu: 0.08 }, sup: { every: 3 } });
    }
    // project signs hung over each slide entrance (facing the deck)
    const startSign = (slide, num, icon, name, col, lift) => {
      const tr = slide.track;
      const p = tr.p[0], T = tr.T[Math.min(10, tr.n - 1)];
      let face;
      if (Math.abs(T.x) > Math.abs(T.z)) face = T.x > 0 ? 'W' : 'E'; else face = T.z > 0 ? 'N' : 'S';
      P.sign(p.x - T.x * 0.7, p.y + (lift || 1.85), p.z - T.z * 0.7, face, num, icon, name, col);
    };
    startSign(P.loopSlide, 4, 'loop', '回环滑道', M.signP);
    startSign(P.helixA, 5, 'helix', '双螺旋 A', M.signB);
    startSign(P.helixB, 5, 'helix', '双螺旋 B', M.signY);
    startSign(P.racer.lanes[2], 6, 'race', '彩虹竞速', M.signY);
    startSign(P.funnelIn, 7, 'funnel', '巨型漏斗', M.signL);
    startSign(P.bowlIn, 8, 'bowl', '巨碗', M.signY);
    startSign(P.blackhole, 10, 'hole', '黑洞管道', M.signL);
    startSign(P.familySlide, 11, 'family', '家庭筏', M.signY, 2.2);
    startSign(P.kid1, 12, 'tube', '亲子管道', M.signM);
    startSign(P.kid2, 12, 'tube', '亲子管道', M.signO);
    startSign(P.coaster, 14, 'coaster', '水上过山车', M.signB, 2.2);
    {
      const hp = P.halfpipe;
      P.sign(hp.x0 - 1.5, hp.base + hp.H + 1.9, hp.z - 2.6, 'S', 9, 'half', 'U型滑板', M.signM);
    }
  };
})();
