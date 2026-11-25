'use strict';
/* ==========================================================================
   Middle row: wave pool dressing, cabanas, bridges, river features,
   activity pool, spa, surf simulator
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;
  const gy = (x, z) => P.groundY(x, z);
  const L = P.L;
  const addI = (n, it) => P.addInst(n, it);

  /* ------------------------------------------------------------ wave machine house */
  function waveHouse() {
    const B = P.B;
    const z0 = -41, z1 = -31.25;
    B.box(-23, -2.6, z0, 23, 8, z1, M.white);
    // facade backdrop rising in the middle with a stepped crest
    for (let x = -15; x < 15; x += V) {
      const top = 8 + 6.2 * Math.cos((x / 15) * Math.PI * 0.5);
      B.box(x, 8, z1 - 1.5, x + V, Math.round(top / V) * V, z1, M.white);
      B.box(x, Math.round(top / V) * V, z1 - 1.75, x + V, Math.round(top / V) * V + 0.5, z1 + 0.25, M.sky);
    }
    // side wings: sky roofs
    B.box(-23.5, 8, z0 - 0.5, 23.5, 8.5, z1 + 0.5, M.sky2);
    B.box(-23, 8.5, z0, -15, 9.0, z1, M.white);
    B.box(15, 8.5, z0, 23, 9.0, z1, M.white);
    // big logo + title
    P.logoRing(0, 9.6, z1 + 0.25, 'S', 4.4, 2);
    P.stampBits(P.textBits('超级造浪池', 12), 0, 4.2, z1 + 0.25, 'S', M.sky2, 2, 1);
    P.stampBits(P.textBits('SUPER WAVE POOL', 6, { font: P.FONT_EN }), 0, 2.9, z1 + 0.25, 'S', M.lemon2, 1, 1);
    // wave chamber grilles at the waterline
    for (let x = -18; x < 18; x += 3) {
      B.box(x, -2.4, z1 - 0.5, x + 1.5, -0.4, z1 + 0.25, P.CARVE);
      B.box(x, -2.4, z1 - 0.75, x + 1.5, -0.4, z1 - 0.5, M.navy);
      for (let k = 0; k < 3; k++) B.box(x + 0.25 + k * 0.5, -2.4, z1 - 0.25, x + 0.5 + k * 0.5, -0.4, z1, M.steel2);
    }
    // countdown screen (dynamic texture placed on this frame)
    B.box(8.5, 5.0, z1, 14.5, 8.75, z1 + 0.5, M.signN);
    P.waveScreen = { x: 11.5, y: 6.875, z: z1 + 0.5 + 0.01, w: 5.5, h: 3.25 };
    B.box(-14.5, 5.0, z1, -8.5, 8.75, z1 + 0.5, M.signN);
    P.waveScreen2 = { x: -11.5, y: 6.875, z: z1 + 0.5 + 0.01, w: 5.5, h: 3.25 };
    // warning lights row along the crest (dynamic glow)
    P.waveLights = [];
    for (let i = 0; i < 13; i++) {
      const x = -12 + i * 2;
      const top = 8 + 6.2 * Math.cos((x / 15) * Math.PI * 0.5);
      const y = Math.round(top / V) * V + 0.5;
      B.box(x - 0.25, y, z1 - 0.75, x + 0.25, y + 0.25, z1 - 0.25, M.white);
      P.waveLights.push({ x, y: y + 0.5, z: z1 - 0.5 });
    }
    // pennant strings on the roof
    P.pennants = P.pennants || [];
    P.pennants.push({ a: [-23, 9.2, -36], b: [-12, 13.6, -32.5], n: 14 });
    P.pennants.push({ a: [12, 13.6, -32.5], b: [23, 9.2, -36], n: 14 });
    P.pennants.push({ a: [-12, 13.6, -32.5], b: [12, 13.6, -32.5], n: 26, sag: 1.6 });
    // roof masts
    for (const x of [-23, 23]) B.box(x - 0.125, 8.5, -36.125, x + 0.125, 9.5, -35.875, M.white);
  }

  /* ------------------------------------------------------------ beach: umbrellas, loungers, lifeguards */
  function beach() {
    const w = L.wave;
    P.umbrellas = P.umbrellas || [];
    const rows = [99.5, 103.5, 107.5];
    rows.forEach((r, ri) => {
      const n = Math.round(((w.half + 3 * P.deg) * 2 * r) / 6.2);
      for (let i = 0; i <= n; i++) {
        const th = -(w.half + 3 * P.deg) + (i / n) * 2 * (w.half + 3 * P.deg);
        if (Math.abs(th) < 2.6 * P.deg) continue; // central path to water
        const x = Math.sin(th) * r, z = w.az + Math.cos(th) * r;
        const y = gy(x, z);
        addI('upole', { x, y, z });
        P.umbrellas.push({ x, y: y + 2.5, z, c: (i + ri * 2) % 6 });
        // two loungers facing the pool (toward apex)
        const ry = Math.atan2(-Math.sin(th), -Math.cos(th));
        for (const s of [-1, 1]) {
          const lx = x + Math.cos(th) * s * 0.9 - Math.sin(th) * 0.6, lz = z - Math.sin(th) * s * 0.9 - Math.cos(th) * 0.6;
          addI('lounger', { x: lx, y: gy(lx, lz), z: lz, ry });
        }
      }
    });
    // lifeguard towers (both sides of the beach)
    const B = P.B;
    P.lifeguards = [];
    for (const s of [-1, 1]) {
      const th = s * 21 * P.deg, r = 93.5;
      const x = Math.sin(th) * r, z = w.az + Math.cos(th) * r;
      const g = gy(x, z);
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(x + a * 0.875 - 0.125, g, z + b * 0.875 - 0.125, x + a * 0.875 + 0.125, g + 3.0, z + b * 0.875 + 0.125, M.white);
      B.box(x - 1.125, g + 2.75, z - 1.125, x + 1.125, g + 3.0, z + 1.125, M.sky);
      B.box(x - 0.5, g + 3.0, z - 0.25, x + 0.5, g + 3.5, z + 0.5, M.red);
      B.box(x - 0.5, g + 3.5, z + 0.25, x + 0.5, g + 4.25, z + 0.5, M.red);
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(x + a * 1.0 - 0.0625 * 2, g + 3.0, z + b * 1.0 - 0.125, x + a * 1.0 + 0.125, g + 5.0, z + b * 1.0 + 0.125, M.white);
      B.box(x - 1.375, g + 5.0, z - 1.375, x + 1.375, g + 5.25, z + 1.375, M.lemon);
      B.box(x - 1.0, g + 5.25, z - 1.0, x + 1.0, g + 5.5, z + 1.0, M.white);
      P.stairs(x, z + 1.25, 'S', 0.75, g + 2.75, g, M.white, 0.3);
      P.flags = P.flags || [];
      P.flags.push({ x: x + 0.9, y: g + 6.6, z: z - 0.9, col: M.red, kind: 'flag', small: true });
      P.FB.box(x + 0.9 - 0.0625, g + 5.5, z - 0.9 - 0.0625, x + 0.9 + 0.0625, g + 6.75, z - 0.9 + 0.0625, M.steel);
      P.lifeguards.push({ x, z });
    }
    // buoy lines (dynamic) — store arcs
    P.buoyLines = [{ r: 62, n: 40 }, { r: 77, n: 50 }];
    // floats in the wave pool
    P.poolFloats = [];
    const rnd = P.rng(808);
    for (let i = 0; i < 18; i++) {
      const r = 46 + rnd() * 36, th = (rnd() * 2 - 1) * (w.half - 4 * P.deg);
      P.poolFloats.push({ r, th, kind: i < 14 ? 'tube' : 'bed', c: i % 6, rot: rnd() * 6.28, ph: rnd() * 10 });
    }
    // signs
    P.signPost(-5, 47.5, 'S', 1, 'wave', '超级造浪池', M.signB);
  }

  /* ------------------------------------------------------------ cabanas */
  function cabanaModels() {
    const cols = [[M.sky, M.white], [M.lemon, M.white], [M.pink, M.white], [M.mint, M.white], [M.lav, M.white]];
    P.cabanaModels = cols.map((c, i) => P.makeModel('cabana' + i, FV, (B) => {
      // 3 x 3 m footprint centred, open front +z
      B.box(-1.5, 0, -1.5, 1.5, 0.25, 1.5, M.wood);
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(a * 1.375 - 0.0625 * 2, 0.25, b * 1.375 - 0.125, a * 1.375 + 0.125, 2.6, b * 1.375 + 0.125, M.white);
      // roof: stepped pyramid
      for (let k = 0; k < 6; k++) {
        const r = 1.75 - k * 0.25;
        B.box(-r, 2.6 + k * 0.125, -r, r, 2.725 + k * 0.125, r, (k % 2) ? c[1] : c[0]);
      }
      B.box(-0.125, 3.35, -0.125, 0.125, 3.6, 0.125, c[0]);
      // lounger + table inside
      B.box(-0.9, 0.25, -1.0, -0.1, 0.5, 0.9, M.white);
      B.box(-0.9, 0.5, -1.0, -0.1, 0.875, -0.6, M.white);
      B.box(0.4, 0.25, -0.3, 0.6, 0.6, -0.1, M.steel2);
      B.box(0.2, 0.6, -0.5, 0.8, 0.725, 0.1, M.white);
      B.box(0.35, 0.725, -0.35, 0.45, 0.85, -0.25, c[0]);
    }));
  }
  function cabanas() {
    cabanaModels();
    const w = L.wave;
    P.cabanas = [];
    // along both side decks (outside the pool edge)
    for (const s of [-1, 1]) {
      for (let r = 44; r <= 84; r += 4.2) {
        const th = s * (w.half + 5.2 / r);
        const x = Math.sin(th) * r, z = w.az + Math.cos(th) * r;
        const k = P.cabanas.length;
        // face pool: rotate so +z faces toward pool centre line
        const ryc = s > 0 ? Math.atan2(-Math.cos(th), Math.sin(th)) : Math.atan2(Math.cos(th), -Math.sin(th));
        addI('cabana' + (k % 5), { x, y: 0, z, ry: ryc });
        P.cabanas.push({ x, y: 0, z, ry: ryc, c: k % 5 });
      }
    }
    // row behind the beach
    for (let th = -34 * P.deg; th <= 34 * P.deg; th += 4.0 * P.deg) {
      if (Math.abs(th) < 4 * P.deg) continue;
      const r = 110.5;
      const x = Math.sin(th) * r, z = w.az + Math.cos(th) * r;
      const k = P.cabanas.length;
      addI('cabana' + (k % 5), { x, y: gy(x, z), z, ry: th + Math.PI });
      P.cabanas.push({ x, y: gy(x, z), z, ry: th + Math.PI, c: k % 5 });
    }
  }

  /* ------------------------------------------------------------ bridges */
  function bridges() {
    const B = P.B, F = P.FB;
    // main bridge (wide, white with sky railings), deck +1.25
    {
      const x0 = -9, x1 = 9, z0 = 52.5, z1 = 63.5;
      for (let z = z0; z < z1; z += V) {
        const t = (z - z0) / (z1 - z0);
        const top = 1.0 + 0.5 * Math.sin(Math.PI * t);
        const yt = Math.round(top / V) * V;
        B.box(x0, yt - 0.5, z, x1, yt, z + V, M.white);
        B.box(x0, yt - 0.25, z, x1, yt, z + V, (Math.floor(z / 1) & 1) ? M.pave : M.pave2);
        // arch underside (thin in the middle)
        const under = -0.2 + 1.2 * Math.sin(Math.PI * t);
        B.box(x0 - 0.25, under, z, x0 + 0.5, yt, z + V, M.white);
        B.box(x1 - 0.5, under, z, x1 + 0.25, yt, z + V, M.white);
      }
      for (const x of [x0 + 0.25, x1 - 0.25]) {
        P.railing([[x, z0], [x, z1]], (xx, zz) => 1.0 + 0.5 * Math.sin(Math.PI * (zz - z0) / (z1 - z0)), { h: 1.1, mat: M.sky, post: M.white, spacing: 1.5 });
      }
      // wide steps down to beach level on the north end
      for (let i = 0; i < 4; i++) B.box(x0, 0, z0 - 0.5 * (i + 1), x1, 1.0 - 0.25 * (i + 1), z0 - 0.5 * i, M.pave);
      // lamp posts
      for (const x of [x0, x1]) for (const z of [z0 + 0.5, z1 - 0.5]) addI('lamp', { x, y: 1.25, z });
      P.signPost(-11.5, 64.5, 'S', 0, 'pano', '主桥', M.signB, 1.6);
    }
    // wooden trestle bridge across the west segment
    {
      const z = 4, zc = z;
      const q = P.river.nearest(-150, zc, 10);
      const x0 = -155.5, x1 = -144.5;
      for (let x = x0; x < x1; x += V) B.box(x, 0.5, zc - 1.5, x + V, 0.75, zc + 1.5, (Math.floor(x / 0.5) & 1) ? M.wood : M.wood2);
      for (let x = x0 + 1; x < x1; x += 2.5) for (const s of [-1, 1]) B.box(x - 0.25, -1.6, zc + s * 1.25 - 0.25, x + 0.25, 0.5, zc + s * 1.25 + 0.25, M.woodDk);
      for (const s of [-1, 1]) P.railing([[x0, zc + s * 1.45], [x1, zc + s * 1.45]], 0.75, { h: 1.0, mat: M.woodDk, post: M.woodDk, spacing: 1.25 });
    }
    // arch bridge across the east segment
    {
      const zc = 4, x0 = 144, x1 = 156;
      for (let x = x0; x < x1; x += V) {
        const t = (x - x0) / (x1 - x0);
        const top = 0.75 + 1.75 * Math.sin(Math.PI * t);
        const yt = Math.round(top / V) * V;
        B.box(x, yt - 0.5, zc - 1.75, x + V, yt, zc + 1.75, M.white);
        const under = -0.3 + 1.6 * Math.sin(Math.PI * t);
        B.box(x, Math.min(under, yt - 0.5), zc - 1.75, x + V, yt - 0.5, zc - 1.25, M.white2);
        B.box(x, Math.min(under, yt - 0.5), zc + 1.25, x + V, yt - 0.5, zc + 1.75, M.white2);
        B.box(x, yt, zc - 1.75, x + V, yt + 0.75, zc - 1.5, (Math.floor((x - x0) / 1) & 1) ? M.sky : M.white);
        B.box(x, yt, zc + 1.5, x + V, yt + 0.75, zc + 1.75, (Math.floor((x - x0) / 1) & 1) ? M.sky : M.white);
      }
    }
    // simple footbridges (front-left, front-right, back)
    const foot = (x, zc, along, half, y, mat) => {
      if (along === 'z') {
        for (let z = zc - half; z < zc + half; z += V) B.box(x - 1.5, y - 0.25, z, x + 1.5, y, z + V, mat);
        for (const s of [-1, 1]) P.railing([[x + s * 1.4, zc - half], [x + s * 1.4, zc + half]], y, { mat: M.rail, post: M.white, glass: true });
      }
    };
    foot(-100, 58, 'z', 5.5, 1.0, M.pave);
    foot(100, 58, 'z', 5.5, 1.0, M.pave);
    foot(-45, -54, 'z', 5.5, 0.5, M.pave2);
    foot(70, -54, 'z', 5.5, 0.5, M.pave2);
    foot(0, -60.5, 'z', 2.5, 0.25, M.rock3); // over plunge-pool outflow
  }

  /* ------------------------------------------------------------ river features */
  function riverFeatures() {
    const B = P.B, F = P.FB;
    // spray arch gates over the west segment
    // spray arch gates over the north segment, just before the curtain & tunnel
    P.sprayArches = [];
    for (let i = 0; i < 4; i++) {
      const x = -60.5 - i * 2.6;
      const q = P.river.nearest(x, -54, 8);
      const zc = q ? P.river.at(q.s).z : -54;
      const z0 = zc - 4.4, z1 = zc + 4.4;
      for (let z = z0; z <= z1; z += V) {
        const t = (z - z0) / (z1 - z0);
        const y = 0.0 + 4.2 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2)));
        B.box(x - 0.25, y, z, x + 0.25, y + 0.5, z + V, i % 2 ? M.sky : M.lemon);
      }
      B.box(x - 0.3, -0.6, z0 - 0.25, x + 0.3, 0.5, z0 + 0.35, M.white);
      B.box(x - 0.3, -0.6, z1 - 0.35, x + 0.3, 0.5, z1 + 0.25, M.white);
      P.sprayArches.push({ ax: x, az: z0, bx: x, bz: z1, y: 4.2, ph: i * 0.9 });
    }
    // water cannons
    P.cannons = [];
    const cannon = (x, z, ax, az) => {
      const g = gy(x, z);
      B.box(x - 0.5, g, z - 0.5, x + 0.5, g + 1.0, z + 0.5, M.white);
      B.box(x - 0.75, g + 1.0, z - 0.75, x + 0.75, g + 1.25, z + 0.75, M.sky);
      const l = Math.hypot(ax, az);
      F.beam(x, g + 1.5, z, x + ax / l * 1.1, g + 1.9, z + az / l * 1.1, 0.375, M.lemon2);
      F.beam(x + ax / l * 1.0, g + 1.85, z + az / l * 1.0, x + ax / l * 1.3, g + 1.95, z + az / l * 1.3, 0.25, M.red);
      P.cannons.push({ x: x + ax / l * 1.35, y: g + 1.95, z: z + az / l * 1.35, dx: ax / l, dz: az / l });
    };
    cannon(-154.6, 24, 1, -0.15);
    cannon(-60, 62.4, 0.15, -1);
    cannon(154.8, -8, -1, 0.2);
    // docks
    const dock = (x0, x1, zEdge, dir) => {
      // stairs into water + rails + tube rack
      for (let i = 0; i < 4; i++) {
        const z = zEdge + dir * (0.5 * i);
        B.box(x0, -1.25 + 0.25 * (3 - i) - 0.25, Math.min(z, z + dir * 0.5), x1, -0.5 + 0.25 * (3 - i) - 0.25 + 0.25, Math.max(z, z + dir * 0.5), M.tile2);
      }
      for (const x of [x0 + 0.25, (x0 + x1) / 2, x1 - 0.25]) P.railing([[x, zEdge - dir * 0.5], [x, zEdge + dir * 2.5]], (xx, zz) => -0.5 + Math.max(0, (zEdge + dir * 2.0 - zz) * dir) * 0.5 + 0.5, { h: 1.0, mat: M.rail, noMid: true });
      // rack
      const rz = zEdge - dir * 2.5;
      B.box(x1 + 0.5, gy(x1 + 0.5, rz), rz - 0.25, x1 + 4.5, gy(x1 + 0.5, rz) + 0.25, rz + 0.25, M.steel2);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) addI('tube' + ((i + j) % 6), { x: x1 + 1.0 + i * 1.2, y: gy(x1 + 1, rz) + 0.25 + j * 0.375, z: rz });
    };
    dock(22, 30, 51.0, 1);
    dock(104, 112, -58.0, -1);
    P.docks = [{ x: 26, z: 54.4 }, { x: 108, z: -57.6 }];
    // shaded green section along the east segment: big trees both banks
    for (let z = -26; z <= 32; z += 7) {
      for (const s of [-1, 1]) {
        const x = 150 + s * (6.5 + ((z * 7) % 3));
        addI('tree' + (((z / 7) | 0) + (s > 0 ? 1 : 0) & 3), { x, y: gy(x, z), z: z + (s > 0 ? 3 : 0), rot: (z & 3) });
      }
    }
    for (let z = -28; z <= 34; z += 3.1) for (const s of [-1, 1]) {
      const x = 150 + s * (4.6 + (z % 1.5));
      if (Math.abs(z - 4) < 4) continue;
      addI('fern' + (Math.abs(Math.round(z)) % 3), { x, y: gy(x, z), z, rot: Math.abs(Math.round(z)) % 4 });
    }
    // floating tubes in the river handled in dynamics
    P.signPost(-148, 46, 'S', 2, 'river', '环园漂流河', M.signM);
  }

  /* ------------------------------------------------------------ activity pool */
  function activity() {
    const B = P.B, F = P.FB;
    const a = L.act;
    // lily pads line (dynamic); store positions
    P.lilies = [];
    for (let i = 0; i < 11; i++) P.lilies.push({ x: a.cx - 15 + i * 3.0, z: a.cz + 6 + Math.sin(i * 1.3) * 0.8 });
    // overhead climbing net frame
    const zN = a.cz + 6;
    for (const x of [a.cx - 18.5, a.cx + 18.5]) for (const s of [-1, 1]) B.box(x - 0.25, 0, zN + s * 2.4 - 0.25, x + 0.25, 4.5, zN + s * 2.4 + 0.25, M.lemon);
    B.box(a.cx - 18.75, 4.5, zN - 2.65, a.cx + 18.75, 4.75, zN - 2.15, M.lemon);
    B.box(a.cx - 18.75, 4.5, zN + 2.15, a.cx + 18.75, 4.75, zN + 2.65, M.lemon);
    for (let x = a.cx - 18.5; x <= a.cx + 18.5; x += 0.5) {
      const t = (x - (a.cx - 18.5)) / 37;
      const sag = Math.sin(Math.PI * t) * 0.6;
      for (let z = zN - 2.25; z <= zN + 2.25; z += FV) {
        const onX = Math.abs(((x - a.cx) % 1.0)) < 0.01;
        F.box(x, 4.4 - sag, z, x + FV, 4.4 - sag + FV, z + FV, M.white);
      }
    }
    for (let z = zN - 2.25; z <= zN + 2.25; z += 0.75) {
      for (let x = a.cx - 18.5; x <= a.cx + 18.5; x += FV) {
        const t = (x - (a.cx - 18.5)) / 37;
        const sag = Math.sin(Math.PI * t) * 0.6;
        F.box(x, 4.4 - sag, z, x + FV, 4.4 - sag + FV, z + FV, M.white);
      }
    }
    // climbing wall leaning over the deep end
    const wx = a.cx - a.hx + 1.0;
    for (let y = 0; y < 6.5; y += V) {
      const lean = (y / 6.5) * 1.6;
      B.box(wx - 0.5 + lean, y, a.cz - 5, wx + lean, y + V, a.cz + 5, (Math.floor(y / 1.0) & 1) ? M.sky : M.sky2);
    }
    const rnd = P.rng(55);
    const holdC = [M.lemon, M.pink2, M.mint, M.coral, M.lav];
    for (let i = 0; i < 60; i++) {
      const y = 0.8 + rnd() * 5.4, z = a.cz - 4.5 + rnd() * 9;
      const lean = (y / 6.5) * 1.6;
      F.box(wx + lean, y, z, wx + lean + FV * 2, y + FV * 2, z + FV * 2, holdC[i % 5]);
    }
    B.box(wx - 2.5, 0, a.cz - 5.5, wx - 0.5, 6.75, a.cz + 5.5, M.white);
    B.box(wx - 2.5, 6.5, a.cz - 5.5, wx + 2.1, 6.75, a.cz + 5.5, M.sky2);
    // basketball hoops
    for (const [x, z, s] of [[a.cx + 12, a.cz - a.hz - 0.6, 1], [a.cx + 12, a.cz + a.hz + 0.6, -1]]) {
      B.box(x - 0.25, 0, z - 0.25, x + 0.25, 3.25, z + 0.25, M.white);
      B.box(x - 0.25, 3.0, z, x + 0.25, 3.25, z + s * 1.25, M.white);
      F.box(x - 0.75, 3.0, z + s * 1.25, x + 0.75, 4.0, z + s * 1.25 + FV * s, M.white);
      F.box(x - 0.25, 3.25, z + s * 1.25 + FV * s, x + 0.25, 3.5, z + s * 1.25 + FV * s * 2, M.coral);
      for (let k = 0; k < 16; k++) {
        const an = k / 16 * Math.PI * 2;
        const hx = x + Math.cos(an) * 0.3, hz = z + s * 1.65 + Math.sin(an) * 0.3;
        F.box(hx, 3.125, hz, hx + FV, 3.25, hz + FV, M.coral);
      }
    }
    // loungers & umbrellas around
    for (let i = 0; i < 7; i++) {
      const x = a.cx - 15 + i * 5, z = a.cz + a.hz + 4.5;
      addI('lounger', { x, y: 0, z, ry: Math.PI });
      if (i % 2 === 0) { addI('upole', { x: x + 2.2, y: 0, z }); P.umbrellas.push({ x: x + 2.2, y: 2.5, z, c: i % 6 }); }
    }
    P.signPost(a.cx + 8, a.cz + a.hz + 2.6, 'S', 17, 'climb', '活动池', M.signY);
  }

  /* ------------------------------------------------------------ spa dressing */
  function spa() {
    const B = P.B;
    const s = L.spa;
    // steps between tiers + loungers + small cabanas + plants
    for (const t of P.spaTiers) {
      // overflow notch toward next tier (visual lip)
      B.box(t.x + t.r * 0.6, t.lv - 0.05, t.z + t.r * 0.6, t.x + t.r * 0.6 + 1.0, t.rim, t.z + t.r * 0.6 + 1.0, M.coping);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const x = s.cx + Math.cos(a) * 21, z = s.cz + Math.sin(a) * 13.5;
      addI('lounger', { x, y: gy(x, z), z, ry: -a + Math.PI / 2 });
    }
    for (let i = 0; i < 4; i++) {
      const x = s.cx - 20 + i * 12, z = s.cz - 15.5;
      addI('cabana' + (i % 5), { x, y: gy(x, z), z, ry: 0 });
    }
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2;
      const x = s.cx + Math.cos(a) * 24.5, z = s.cz + Math.sin(a) * 16;
      addI(i % 3 === 0 ? 'bush' + (i % 5) : 'fern' + (i % 3), { x, y: gy(x, z), z, rot: i % 4 });
    }
    P.signPost(s.cx + 18, s.cz + 14, 'S', 18, 'spa', '温泉休闲池', M.signL);
  }

  /* ------------------------------------------------------------ surf simulator */
  function surf() {
    const B = P.B, F = P.FB;
    const s = L.surf;
    // bleachers on the east side
    for (let k = 0; k < 5; k++) {
      B.box(s.cx + 10.5 + k * 1.0, 0, s.cz - 10, s.cx + 11.5 + k * 1.0, 0.5 + k * 0.5, s.cz + 10, k % 2 ? M.sky : M.white);
    }
    B.box(s.cx + 15.5, 0, s.cz - 10, s.cx + 16, 4.5, s.cz + 10, M.white);
    for (let z = s.cz - 9.5; z <= s.cz + 9.5; z += 4.75) B.box(s.cx + 11, 4.25, z - 0.25, s.cx + 16, 4.5, z + 0.25, M.sky2);
    B.box(s.cx + 10.5, 4.5, s.cz - 10.5, s.cx + 16.5, 4.75, s.cz + 10.5, M.lemon);
    // board racks on the west side
    const bcols = [M.sky, M.lemon, M.pink, M.mint, M.lav, M.coral];
    B.box(s.cx - 13, 0, s.cz - 6, s.cx - 12.5, 2.5, s.cz + 6, M.white2);
    for (let i = 0; i < 12; i++) {
      const z = s.cz - 5.5 + i;
      F.box(s.cx - 12.5, 0.25, z - 0.25, s.cx - 12.25, 2.25, z + 0.25, bcols[i % 6]);
      F.box(s.cx - 12.25, 0.5, z - 0.1875, s.cx - 12.125, 2.0, z + 0.1875, M.white);
    }
    // control booth at the back lip
    B.box(s.cx - 3, 2.75, s.cz - 14.5, s.cx + 3, 5.5, s.cz - 12.5, M.white);
    B.box(s.cx - 2.5, 3.5, s.cz - 12.5, s.cx + 2.5, 5.0, s.cz - 12.25, M.win);
    B.box(s.cx - 3.5, 5.5, s.cz - 15, s.cx + 3.5, 5.75, s.cz - 12, M.sky);
    // nozzle bar at the front (low end)
    B.box(s.cx - 8, -0.25, s.cz + 10.75, s.cx + 8, 0.25, s.cz + 11.0, M.steel2);
    P.surfWave = { x: s.cx, z: s.cz };
    P.signPost(s.cx - 12, s.cz + 13.5, 'S', 15, 'surf', '冲浪模拟器', M.signB);
  }

  /* ------------------------------------------------------------ splash pool dressing & signs */
  function splashDressing() {
    const signs = [
      [-50, -32.5, 5, 'helix', '双螺旋管道', M.signB], [-36, -30, 3, 'drop', '垂直高速滑道', M.signN],
      [31, -32.5, 6, 'race', '彩虹竞速', M.signY], [51, -32.5, 4, 'loop', '回环滑道', M.signP],
      [-118, -35, 10, 'hole', '黑洞管道', M.signL], [106, -34, 11, 'family', '家庭筏滑道', M.signY],
      [78, -36, 12, 'tube', '亲子双人管道', M.signM], [128, -19, 14, 'coaster', '水上过山车', M.signB],
    ];
    for (const [x, z, n, ic, nm, c] of signs) P.signPost(x, z, 'S', n, ic, nm, c);
  }

  P.buildMid = function () {
    waveHouse();
    beach();
    cabanas();
    bridges();
    riverFeatures();
    activity();
    spa();
    surf();
    splashDressing();
  };
})();
