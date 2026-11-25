'use strict';
/* ==========================================================================
   Planting: coconut ring, avenue, beach & promenade palms, mountain greenery,
   perimeter fence
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;
  const gy = (x, z) => P.groundY(x, z);
  const addI = (n, it) => P.addInst(n, it);
  const hardTops = () => new Set([M.pave, M.pave2, M.paveEdge, M.plaza, M.plazaBlue, M.plazaSky, M.plazaLemon, M.plazaMint, M.plazaPink,
    M.tile, M.tile2, M.coping, M.wood, M.wood2, M.road, M.roadLine, M.soft1, M.soft2, M.soft3, M.soft4, M.poolFloor, M.riverBed, M.mosaic]);
  let HARD = null;
  // occupancy check: free column above ground in radius r up to height h
  function free(x, z, r, h, allowHard) {
    const k = P.colIndex(x, z);
    if (k < 0) return true;
    if (P.waterLevel[k] > -50) return false;
    if (!allowHard && HARD.has(P.terrain.top[k])) return false;
    const g = P.terrain.H[k];
    const w = P.world;
    for (let a = -r; a <= r; a += Math.max(0.5, r)) for (let b = -r; b <= r; b += Math.max(0.5, r)) {
      const kk = P.colIndex(x + a, z + b);
      if (kk >= 0 && P.waterLevel[kk] > -50) return false;
      const X = Math.floor((x + a) / V), Z = Math.floor((z + b) / V);
      for (let y = g; y < g + Math.round(h / V); y += 2) {
        const m = w.get(X, y, Z);
        if (m && m !== 255) return false;
      }
    }
    return true;
  }
  P.canPlant = free;

  function fence() {
    const F = P.FB;
    const segs = [
      [[-171, -123.6], [171, -123.6]], [[171, -123.6], [171, 121.2]], [[-171, -123.6], [-171, 121.2]],
      [[-171, 121.2], [-34, 121.2]], [[34, 121.2], [171, 121.2]],
    ];
    for (const s of segs) {
      const [a, b] = s;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.round(L / FV);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const k = P.colIndex(x, z);
        if (k >= 0 && P.waterLevel[k] > -50) continue;
        const g = gy(x, z);
        const X = Math.floor(x / FV), Z = Math.floor(z / FV), Y = Math.round(g / FV);
        if (P.world.get(Math.floor(x / V), Math.round(g / V), Math.floor(z / V))) continue;
        P.fine.set(X, Y + 6, Z, M.white);
        P.fine.set(X, Y + 3, Z, M.white);
        if (i % 8 === 0) for (let y = 0; y < 7; y++) P.fine.set(X, Y + y, Z, M.white);
      }
    }
  }

  P.buildPlanting = function () {
    HARD = hardTops();
    const rnd = P.rng(9090);
    let palmN = 0;
    const palm = (x, z, allowHard) => {
      if (!free(x, z, 0.75, 9, allowHard)) return false;
      addI('palm' + Math.floor(rnd() * 6), { x: Math.round(x * 8) / 8, y: gy(x, z), z: Math.round(z * 8) / 8, rot: Math.floor(rnd() * 4) });
      palmN++;
      return true;
    };
    fence();
    // coconut grove ring: two staggered rows around the fence
    const ring = (x0, z0, x1, z1, step, off) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step);
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        for (const o of off) {
          const jit = (rnd() - 0.5) * 1.6;
          palm(x0 + (x1 - x0) * t + nx * (o + jit) + (rnd() - 0.5) * 1.5, z0 + (z1 - z0) * t + nz * (o + jit), true);
        }
      }
    };
    ring(-168, -127, 168, -127, 7.5, [0, 3.2]);
    ring(175, -122, 175, 118, 7.5, [0, -3.0]);
    ring(-175, -120, -175, 118, 7.0, [0, 3.2]);
    ring(-168, 124.5, -36, 124.5, 7.5, [0]);
    ring(36, 124.5, 168, 124.5, 7.5, [0]);
    ring(-166, 117.5, -40, 117.5, 9, [0]);
    // avenue palm rows
    for (let z = 128; z < 248; z += 8) {
      for (const x of [-10, 10, -17, 17]) palm(x + (rnd() - 0.5) * 0.5, z + (Math.abs(x) > 12 ? 4 : 0), true);
    }
    // beach promenade palms (arc behind beach) + inner promenade
    for (let th = -36 * P.deg; th <= 36 * P.deg; th += 5.2 * P.deg) {
      const r = 114.2;
      palm(Math.sin(th) * r, P.L.wave.az + Math.cos(th) * r, true);
    }
    for (let x = -126; x <= 126; x += 9) palm(x, 47.6 + (rnd() - 0.5), true);
    // loop path palms (outer side)
    for (let s = 0; s < P.river.len; s += 11) {
      const p = P.river.at(s);
      const nx = p.tz, nz = -p.tx; // right side = outer for ccw loop
      palm(p.x + nx * 9.0, p.z + nz * 9.0, false);
    }
    // middle lawns: clusters
    for (let i = 0; i < 260; i++) {
      const x = -165 + rnd() * 330, z = -50 + rnd() * 100;
      const k = P.colIndex(x, z);
      if (k < 0) continue;
      const top = P.terrain.top[k];
      if (top !== M.grass && top !== M.grass2 && top !== M.grass3) continue;
      const r = rnd();
      if (r < 0.32) palm(x, z, false);
      else if (r < 0.7) { if (free(x, z, 1.0, 3, false)) addI('bush' + Math.floor(rnd() * 5), { x, y: gy(x, z), z, rot: Math.floor(rnd() * 4) }); }
      else if (r < 0.85) { if (free(x, z, 0.5, 2, false)) addI('flowers' + Math.floor(rnd() * 4), { x: Math.round(x * 8) / 8, y: gy(x, z), z: Math.round(z * 8) / 8 }); }
      else { if (free(x, z, 2.2, 7, false)) addI('tree' + Math.floor(rnd() * 4), { x, y: gy(x, z), z, rot: Math.floor(rnd() * 4) }); }
    }
    // front row lawns & coast strips
    for (let i = 0; i < 140; i++) {
      const x = -190 + rnd() * 380, z = -150 + rnd() * 400;
      const k = P.colIndex(x, z);
      if (k < 0) continue;
      const top = P.terrain.top[k];
      const inPark = Math.abs(x) < 170 && z > -122 && z < 120;
      if (top === M.sand || top === M.sand2) { if (!inPark && P.terrain.H[k] >= 0) palm(x, z, true); continue; }
      if (top !== M.grass && top !== M.grass2 && top !== M.grass3) continue;
      if (inPark && z > -40 && z < 50) continue;
      if (rnd() < 0.5) palm(x, z, false);
      else if (free(x, z, 2.2, 7, false)) addI('tree' + Math.floor(rnd() * 4), { x, y: gy(x, z), z, rot: Math.floor(rnd() * 4) });
    }
    // mountain greenery
    for (let i = 0; i < 1300; i++) {
      const x = -166 + rnd() * 332, z = -122 + rnd() * 62;
      const k = P.colIndex(x, z);
      if (k < 0) continue;
      const top = P.terrain.top[k];
      const g = P.terrain.H[k] * V;
      if (g < 0.5) continue;
      const grassy = top === M.grass || top === M.grass2 || top === M.grass3 || top === M.grassDk;
      if (!grassy) continue;
      const r = rnd();
      if (r < 0.42) { if (free(x, z, 0.75, 2.5, false)) addI('bush' + Math.floor(rnd() * 5), { x, y: g, z, rot: Math.floor(rnd() * 4) }); }
      else if (r < 0.72) { if (free(x, z, 0.5, 1.5, false)) addI('fern' + Math.floor(rnd() * 3), { x: Math.round(x * 8) / 8, y: g, z: Math.round(z * 8) / 8, rot: Math.floor(rnd() * 4) }); }
      else if (r < 0.84) { if (free(x, z, 0.5, 1.5, false)) addI('flowers' + Math.floor(rnd() * 4), { x: Math.round(x * 8) / 8, y: g, z: Math.round(z * 8) / 8 }); }
      else if (r < 0.94) { if (free(x, z, 2.4, 8, false)) addI('tree' + Math.floor(rnd() * 4), { x, y: g, z, rot: Math.floor(rnd() * 4) }); }
      else palm(x, z, false);
    }
    // west outside: forest edge
    for (let i = 0; i < 160; i++) {
      const x = -196 + rnd() * 22, z = -140 + rnd() * 380;
      if (free(x, z, 2, 6, true)) addI(rnd() < 0.6 ? 'tree' + Math.floor(rnd() * 4) : 'palm' + Math.floor(rnd() * 6), { x, y: gy(x, z), z, rot: Math.floor(rnd() * 4) });
    }
    console.log('palms', palmN);
  };
})();
