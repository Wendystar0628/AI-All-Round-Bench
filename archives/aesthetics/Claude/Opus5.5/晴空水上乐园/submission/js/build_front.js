'use strict';
/* ==========================================================================
   Front row: gate, plaza, service buildings, kids water castle, food street
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;
  const gy = (x, z) => P.groundY(x, z);
  P.inst = P.inst || {}; // instance lists by model name
  const addI = (P.addInst = function (name, it) { (P.inst[name] = P.inst[name] || []).push(it); });

  /* ------------------------------------------------------------ logo ring */
  P.logoRing = function (cx, cy, cz, face, R, thick) {
    const w = P.world;
    const r0 = R, r1 = R * 0.72;
    const n = Math.ceil(R / V) + 1;
    const fcx = Math.round(cx / V), fcy = Math.round(cy / V), fcz = Math.round(cz / V);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
      const x = a * V, y = b * V;
      const r = Math.hypot(x, y);
      if (r > r0) continue;
      let m;
      if (r > r1) m = (Math.atan2(y, x) > 2.2 || Math.atan2(y, x) < -2.6) ? M.lemon : M.sky2;
      else {
        m = M.white;
        if (Math.hypot(x - R * 0.12, y - R * 0.18) < R * 0.3) m = M.lemon;
        const wv = y + R * 0.28 + Math.sin(x / R * 6.0) * R * 0.06;
        if (wv < 0 && wv > -R * 0.13) m = M.sky;
        if (wv < -R * 0.22 && wv > -R * 0.33) m = M.sky2;
      }
      for (let d = 0; d < (thick || 2); d++) {
        if (face === 'S' || face === 'N') w.set(fcx + a, fcy + b, fcz + (face === 'S' ? d : -d), m);
        else w.set(fcx + (face === 'E' ? d : -d), fcy + b, fcz + a, m);
      }
    }
  };

  /* ------------------------------------------------------------ gate */
  function buildGate() {
    const B = P.B, F = P.FB;
    const y0 = 1.0;
    // pillars
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -11.5 : 7.5, xb = xa + 4;
      B.box(xa, y0, 112, xb, 10.5, 118, M.white);
      B.box(xa - 0.25, y0, 111.75, xb + 0.25, y0 + 0.75, 118.25, M.sky);
      for (let i = 0; i < 3; i++) B.box(xa - 0.25, 3 + i * 2.2, 111.75, xb + 0.25, 3.25 + i * 2.2, 118.25, M.sky);
      // wings (ticket halls)
      const wa = s < 0 ? -27 : 11.5, wb = s < 0 ? -11.5 : 27;
      B.box(wa, y0, 113, wb, 6.25, 117, M.white2);
      B.box(wa - 0.75, 6.25, 112.25, wb + 0.75, 6.75, 117.75, M.sky);
      B.box(wa - 0.5, 6.75, 112.5, wb + 0.5, 7.0, 117.5, M.white);
      // ticket windows south + north
      for (let i = 0; i < 3; i++) {
        const c = (s < 0 ? -23.5 : 15) + i * 4.25;
        B.box(c - 1.25, y0 + 1.25, 116.75, c + 1.25, y0 + 3.25, 117, M.win2);
        B.box(c - 1.5, y0 + 3.25, 117, c + 1.5, y0 + 3.5, 118.25, i % 2 ? M.lemon : M.white);
        B.box(c - 1.5, y0 + 0.75, 117, c + 1.5, y0 + 1.25, 117.75, M.white);
        P.board(c, y0 + 4.2, 117.0 + FV, 'S', 2.0, 0.75, M.signY, 1, 0.2);
        P.stampBits(P.textBits('售票', 5), c, y0 + 4.2, 117.0 + 2 * FV, 'S', M.signN, 1, 1);
        B.box(c - 1.25, y0 + 1.25, 113, c + 1.25, y0 + 3.75, 113.25, M.win);
      }
    }
    // lintel with name
    B.box(-11.5, 7, 112.5, 11.5, 10.5, 117.5, M.white);
    B.box(-11.75, 6.75, 112.25, 11.75, 7.0, 117.75, M.sky);
    const tb = P.textBits('晴空水上乐园', 18);
    P.stampBits(tb, 0, 8.75, 117.5, 'S', M.sky2, 2, 1);
    P.stampBits(tb, 0, 8.75, 112.5, 'N', M.sky2, 2, 1);
    const en = P.textBits('CLEAR SKY WATER PARK', 6, { font: P.FONT_EN });
    P.stampBits(en, 0, 7.45, 117.5, 'S', M.lemon2, 1, 1);
    // sweeping roof rising to the centre
    for (let x = -15; x < 15; x += V) {
      const top = 10.5 + 1.75 * Math.cos((x / 15) * Math.PI * 0.5) + 0.0;
      const yt = Math.round(top / V) * V;
      B.box(x, 10.5, 110.75, x + V, yt, 119.25, M.sky2);
      B.box(x, yt, 111.0, x + V, yt + V, 119.0, M.sky);
    }
    B.box(-15.25, 10.25, 110.5, 15.25, 10.5, 119.5, M.white);
    // logo ring on top
    P.logoRing(0, 16.2, 114.5, 'S', 3.6, 2);
    P.logoRing(0, 16.2, 114.5, 'N', 3.6, 1);
    B.box(-0.75, 11.5, 114.25, 0.75, 12.75, 115.25, M.white);
    // pylons
    for (const s of [-1, 1]) {
      const px = s * 31;
      B.box(px - 1.25, y0, 113.75, px + 1.25, 12, 116.25, M.white);
      const cols = [M.sky, M.lemon, M.mint, M.pink];
      cols.forEach((c, i) => B.box(px - 1.5, 12 + i * 0.75, 113.5, px + 1.5, 12.75 + i * 0.75, 116.5, c));
      B.box(px - 0.75, 15, 114.25, px + 0.75, 15.75, 115.75, M.white);
      F.box(px - 0.0625, 15.75, 114.9375, px + 0.0625, 18.5, 115.0625, M.steel);
      P.flags = P.flags || [];
      P.flags.push({ x: px, y: 18.4, z: 115, col: s < 0 ? M.sky : M.lemon, kind: 'flag' });
      P.logoRing(px, 9.5, 116.25, 'S', 0.95, 1);
    }
    // turnstiles: 6 lanes under the arch
    for (let i = 0; i <= 6; i++) {
      const x = -6.9 + i * 2.3;
      F.box(x - 0.1875, y0, 114.25, x + 0.1875, y0 + 1.0, 115.75, i % 2 ? M.steel : M.white);
      F.box(x - 0.125, y0 + 1.0, 114.5, x + 0.125, y0 + 1.125, 115.5, M.ledCyan);
      if (i < 6) F.box(x + 0.1875, y0 + 0.75, 114.9375, x + 1.0, y0 + 0.8125, 115.0625, M.steel2);
    }
    // planters in front of gate
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = s * (14 + i * 5), z = 121.5;
      P.B.box(x - 1.25, y0, z - 1.25, x + 1.25, y0 + 0.75, z + 1.25, M.white);
      addI('flowers' + ((i + (s > 0 ? 2 : 0)) % 4), { x: x - 0.5, y: y0 + 0.75, z: z - 0.5 });
      addI('flowers' + ((i + 1) % 4), { x: x + 0.5, y: y0 + 0.75, z: z + 0.5, rot: 1 });
    }
  }

  /* ------------------------------------------------------------ map board (park plan) */
  function mapBoard(cx, cz, face) {
    const y0 = gy(cx, cz);
    const B = P.B;
    const Wm = 6.0, Hm = 4.0;
    B.box(cx - Wm / 2 - 0.25, y0, cz - 0.25, cx - Wm / 2 + 0.25, y0 + Hm + 1.6, cz + 0.25, M.white);
    B.box(cx + Wm / 2 - 0.25, y0, cz - 0.25, cx + Wm / 2 + 0.25, y0 + Hm + 1.6, cz + 0.25, M.white);
    P.board(cx, y0 + 1.1 + Hm / 2, cz + 0.25, face, Wm + 0.25, Hm + 0.25, M.sky2, 2, 0.3);
    // sample the park plan into fine voxels
    const nx = Math.round((Wm - 0.5) / FV), nz = Math.round((Hm - 0.5) / FV);
    const T = P.terrain;
    const fy = Math.round((y0 + 1.1 + Hm / 2) / FV);
    const fz = Math.round((cz + 0.25) / FV);
    for (let v = 0; v < nz; v++) for (let u = 0; u < nx; u++) {
      const px = -172 + (u + 0.5) / nx * 344;
      const pz = -126 + (v + 0.5) / nz * 250;
      const k = P.colIndex(px, pz);
      let m = M.grass3;
      if (k >= 0) {
        const top = T.top[k];
        if (P.waterLevel[k] > -50) m = M.sky;
        else if (top === M.sand || top === M.sand2 || top === M.sandWet) m = M.cream;
        else if (T.H[k] * V > 3.5) m = (T.H[k] * V > 9.5) ? M.mint2 : M.mint;
        else if (top === M.grass || top === M.grass2 || top === M.grass3 || top === M.grassDk) m = M.grass3;
        else m = M.white;
      }
      P.fine.set(Math.round(cx / FV) - Math.floor(nx / 2) + u, fy + Math.floor(nz / 2) - v, fz + 1, m);
    }
    // header
    P.board(cx, y0 + 1.1 + Hm + 0.55, cz + 0.25, face, 3.0, 0.8, M.signY, 1, 0.3);
    P.stampBits(P.textBits('乐园导览', 6), cx, y0 + 1.1 + Hm + 0.55, cz + 0.25 + FV, 'S', M.signN, 1, 1);
    P.B.box(cx - Wm / 2 - 0.5, y0 + Hm + 1.6, cz - 0.75, cx + Wm / 2 + 0.5, y0 + Hm + 1.85, cz + 0.75, M.sky);
  }

  /* ------------------------------------------------------------ plaza */
  function buildPlaza() {
    const B = P.B, F = P.FB;
    const y0 = 1.0;
    // fountain nozzles ring
    P.fountain = { x: 0, z: 88, y: y0, rings: [] };
    for (const [r, n] of [[0, 1], [2.2, 8], [4.2, 14], [6.2, 22]]) {
      const ring = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r, z = 88 + Math.sin(a) * r;
        F.box(x - 0.125, y0, z - 0.125, x + 0.125, y0 + 0.0625 * 2, z + 0.125, M.steel);
        ring.push([x, z]);
      }
      P.fountain.rings.push(ring);
    }
    // basin-less rim stones
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const x = Math.cos(a) * 7.4, z = 88 + Math.sin(a) * 7.4;
      F.box(x - 0.25, y0, z - 0.25, x + 0.25, y0 + 0.25, z + 0.25, i % 2 ? M.white : M.skyPale);
    }
    // benches facing the fountain
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 11, z = 88 + Math.sin(a) * 11;
      addI('bench', { x, y: y0, z, ry: -a - Math.PI / 2 });
    }
    // flower beds: arcs between paths
    for (let q = 0; q < 4; q++) {
      const a0 = q * Math.PI / 2 + 0.22, a1 = (q + 1) * Math.PI / 2 - 0.22;
      for (let a = a0; a < a1; a += 0.055) {
        for (let r = 20.0; r < 23.0; r += 1.0) {
          const x = Math.cos(a) * r, z = 88 + Math.sin(a) * r;
          addI('flowers' + ((Math.floor(a * 6) + q) % 4), { x: Math.round(x * 8) / 8, y: y0 + 0.25, z: Math.round(z * 8) / 8, rot: Math.floor(a * 10) % 4 });
        }
        const bx = Math.cos(a) * 19.5, bz = 88 + Math.sin(a) * 19.5;
        B.box(bx - 0.25, y0, bz - 0.25, bx + 0.25, y0 + 0.5, bz + 0.25, M.white);
        const ox = Math.cos(a) * 23.5, oz = 88 + Math.sin(a) * 23.5;
        B.box(ox - 0.25, y0, oz - 0.25, ox + 0.25, y0 + 0.5, oz + 0.25, M.white);
      }
      // soil layer
      for (let a = a0; a < a1; a += 0.03) for (let r = 19.75; r < 23.25; r += 0.25) {
        const x = Math.cos(a) * r, z = 88 + Math.sin(a) * r;
        B.box(x - 0.125, y0, z - 0.125, x + 0.125, y0 + 0.25, z + 0.125, M.leafDk);
      }
    }
    // palms around plaza
    const palms = [[-36, 70], [36, 70], [-36, 106], [36, 106], [-27, 80], [27, 80], [-16, 102], [16, 102], [-27, 96], [27, 96], [-10, 68], [10, 68]];
    palms.forEach(([x, z], i) => addI('palm' + (i % 6), { x, y: y0, z, rot: i % 4 }));
    // lamps
    for (let i = 0; i < 10; i++) {
      const z = 70 + i * 4.8;
      addI('lamp', { x: -42, y: y0, z }); addI('lamp', { x: 42, y: y0, z });
    }
    mapBoard(-15, 108.5, 'S');
    // plaza signposts
    P.signPost(-6, 70, 'N', 1, 'wave', '造浪池', M.signB);
    P.signPost(6, 70, 'N', 2, 'river', '漂流河', M.signM);
  }

  /* ------------------------------------------------------------ service buildings */
  function serviceBuilding(x0, x1, z0, z1, accent, inner, label, icon) {
    const B = P.B;
    const y0 = 1.0, y1 = 5.0, y2 = 9.0;
    B.box(x0, y0, z0, x1, y2, z1, M.white);
    // base band + floor line
    B.box(x0 - 0.25, y0, z0 - 0.25, x1 + 0.25, y0 + 0.5, z1 + 0.25, accent);
    B.box(x0 - 0.25, y1 - 0.25, z0 - 0.25, x1 + 0.25, y1 + 0.25, z1 + 0.25, M.white2);
    // roof slab + parapet
    B.box(x0 - 0.75, y2, z0 - 0.75, x1 + 0.75, y2 + 0.5, z1 + 0.75, accent);
    B.box(x0 - 0.5, y2 + 0.5, z0 - 0.5, x1 + 0.5, y2 + 0.75, z1 + 0.5, M.white);
    B.box(x0 + 0.5, y2 + 0.5, z0 + 0.5, x1 - 0.5, y2 + 0.75, z1 - 0.5, M.concrete);
    // windows on all sides
    const fx = inner > 0 ? x1 : x0; // plaza-facing face x
    const ofx = inner > 0 ? x1 - 0.25 : x0;
    for (let z = z0 + 1.5; z < z1 - 1.5; z += 2.5) {
      // ground floor big glass
      B.box(ofx, y0 + 0.75, z, ofx + 0.25, y1 - 0.5, z + 2.0, M.win);
      // upper band windows + louvres
      B.box(ofx, y1 + 0.75, z, ofx + 0.25, y2 - 0.75, z + 2.0, M.win2);
      for (let y = y1 + 1.0; y < y2 - 0.75; y += 0.75) B.box(fx + (inner > 0 ? 0 : -0.5), y, z - 0.25, fx + (inner > 0 ? 0.5 : 0), y + 0.25, z + 2.25, M.white);
    }
    for (const zf of [z0, z1 - 0.25]) {
      for (let x = x0 + 1.5; x < x1 - 1.5; x += 3) {
        B.box(x, y0 + 0.75, zf, x + 2, y1 - 0.75, zf + 0.25, M.win);
        B.box(x, y1 + 0.75, zf, x + 2, y2 - 0.75, zf + 0.25, M.win2);
      }
    }
    // entrance canopy
    const zc = (z0 + z1) / 2;
    B.box(fx + (inner > 0 ? 0 : -3), y1 - 1.0, zc - 3, fx + (inner > 0 ? 3 : 0), y1 - 0.75, zc + 3, accent);
    B.box(ofx, y0, zc - 1.5, ofx + 0.25, y0 + 2.75, zc + 1.5, M.win2);
    // rooftop sign
    const sx = fx + (inner > 0 ? -1.0 : 1.0);
    B.box(sx - 0.25, y2 + 0.75, zc - 4.5, sx + 0.25, y2 + 4.25, zc + 4.5, M.white);
    P.board(sx + (inner > 0 ? 0.25 : -0.25), y2 + 2.5, zc, inner > 0 ? 'E' : 'W', 8.5, 3.0, M.signW, 1, 0.5);
    const face = inner > 0 ? 'E' : 'W';
    const bx = sx + (inner > 0 ? 0.25 + FV : -0.25 - FV);
    P.board(bx, y2 + 2.5, zc + (inner > 0 ? 2.9 : -2.9), face, 2.4, 2.4, accent === M.sky ? M.signB : M.signY, 1, 0.5);
    P.stampBits(P.iconBits(icon, 16), bx + (inner > 0 ? FV : -FV), y2 + 2.5, zc + (inner > 0 ? 2.9 : -2.9), face, M.signW, 1, 1);
    const tb = P.textBits(label, 12);
    P.stampBits(tb, bx, y2 + 2.5, zc + (inner > 0 ? -1.2 : 1.2), face, M.signN, 1, 1);
  }
  function buildServices() {
    serviceBuilding(-46, -30, 76, 101, M.sky, 1, '更衣室 储物柜', 'locker');
    serviceBuilding(30, 46, 76, 101, M.lemon, -1, '游客中心 泳圈', 'info');
    // tube rental rack (stacked rings) east building
    const F = P.FB;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      addI('tube' + ((i + j) % 6), { x: 27.4 - i * 1.2, y: 1.0 + j * 0.375, z: 80 + (j % 2) * 0.2, ry: 0 });
    }
    // first aid + drinking points
    const B = P.B;
    B.box(-44, 1, 104, -38, 4, 110, M.white);
    B.box(-44.25, 4, 103.75, -37.75, 4.5, 110.25, M.red);
    P.board(-40.9, 3.0, 110.0 + FV * 2, 'S', 1.2, 1.2, M.signW, 1, 0.3);
    P.stampBits(P.iconBits('aid', 8), -40.9, 3.0, 110 + 3 * FV, 'S', M.red, 1, 1);
  }

  /* ------------------------------------------------------------ kids area */
  function buildKids() {
    const B = P.B, F = P.FB;
    const cx = -108, cz = 92;
    const pf = P.L.frontY - 0.5; // pool floor
    // island deck under the castle
    B.box(cx - 8, pf, cz - 7, cx + 8, 1.0, cz + 7, M.tileBlue);
    const lev = [1.0, 3.0, 5.0, 7.0, 9.0];
    P.castle = { cx, cz, lev };
    // corner towers
    const towers = [[-6, -5, M.pink, M.lav], [6, -5, M.lemon, M.sky], [-6, 5, M.mint, M.pink], [6, 5, M.sky, M.lemon]];
    towers.forEach(([dx, dz, c1, c2], i) => {
      const x = cx + dx, z = cz + dz;
      const top = i < 2 ? 9.0 : 7.0;
      // 4 posts
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(x + a * 1.25 - 0.25, 1.0, z + b * 1.25 - 0.25, x + a * 1.25 + 0.25, top + 2.25, z + b * 1.25 + 0.25, c1);
      // floors
      for (const y of lev) if (y <= top && y > 1) B.box(x - 1.75, y - 0.25, z - 1.75, x + 1.75, y, z + 1.75, M.white);
      // pointed roof
      for (let k = 0; k < 6; k++) {
        const r = 2.0 - k * 0.375;
        B.box(x - r, top + 2.25 + k * 0.5, z - r, x + r, top + 2.75 + k * 0.5, z + r, k % 2 ? c2 : c1);
      }
      F.box(x - 0.0625, top + 5.25, z - 0.0625, x + 0.0625, top + 6.5, z + 0.0625, M.steel);
      P.flags = P.flags || [];
      P.flags.push({ x, y: top + 6.4, z, col: c2, kind: 'pennant' });
      // railings
      P.railing([[x - 1.75, z - 1.75], [x + 1.75, z - 1.75], [x + 1.75, z + 1.75], [x - 1.75, z + 1.75], [x - 1.75, z - 1.75]], top, { h: 1.0, mat: c2 });
    });
    // central platforms between towers
    B.box(cx - 4.25, 4.75, cz - 3.5, cx + 4.25, 5.0, cz + 3.5, M.wood);
    B.box(cx - 4.25, 6.75, cz - 6.75, cx + 4.25, 7.0, cz - 3.25, M.wood);
    B.box(cx - 2.5, 8.75, cz - 2.5, cx + 2.5, 9.0, cz + 2.5, M.white);
    for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(cx + a * 2.25 - 0.25, 1.0, cz + b * 2.25 - 0.25, cx + a * 2.25 + 0.25, 9.0, cz + b * 2.25 + 0.25, M.sky);
    P.railing([[cx - 4.25, cz - 3.5], [cx + 4.25, cz - 3.5]], 5.0, { mat: M.lemon });
    P.railing([[cx - 4.25, cz + 3.5], [cx + 4.25, cz + 3.5]], 5.0, { mat: M.lemon });
    P.railing([[cx - 2.5, cz - 2.5], [cx + 2.5, cz - 2.5], [cx + 2.5, cz + 2.5], [cx - 2.5, cz + 2.5], [cx - 2.5, cz - 2.5]], 9.0, { mat: M.pink });
    // net bridges (fine) between towers at level 7
    const net = (x0, z0, x1, z1, y) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / FV);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const sag = Math.sin(Math.PI * t) * 0.35;
        const px = -(z1 - z0) / L, pz = (x1 - x0) / L;
        for (let w = -6; w <= 6; w++) if (i % 2 === 0 || Math.abs(w) % 3 === 0) F.box(x + px * w * FV, y - sag, z + pz * w * FV, x + px * w * FV + FV, y - sag + FV, z + pz * w * FV + FV, M.white);
        for (const w of [-7, 7]) F.box(x + px * w * FV, y - sag + 0.75, z + pz * w * FV, x + px * w * FV + FV, y - sag + 0.875, z + pz * w * FV + FV, M.lemon2);
      }
    };
    net(cx - 4.25, cz + 5, cx + 4.25, cz + 5, 7.0);
    net(cx - 6, cz - 3.25, cx - 6, cz + 3.25, 7.0);
    net(cx + 6, cz - 3.25, cx + 6, cz + 3.25, 5.0);
    // stairs (inside towers implied) — external stair to level 3
    P.stairs(cx + 2, cz + 7.5, 'N', 1.5, 1.0, 3.0, M.white, 0.5);
    // small slides from level 5 / 7 into the pool (open troughs)
    P.castleSlides = [];
    const kslide = (pts, mat) => P.castleSlides.push({ pts, mat });
    kslide([[cx - 7.75, 7.0, cz - 3], [cx - 10, 5.5, cz - 4], [cx - 12, 3.6, cz - 2], [cx - 13, 1.6, cz + 1], [cx - 13.5, 0.9, cz + 3]], M.slPink);
    kslide([[cx + 7.75, 5.0, cz + 1], [cx + 10, 3.5, cz + 1], [cx + 12.5, 1.8, cz + 2], [cx + 14, 0.9, cz + 3.5]], M.slYellow);
    kslide([[cx, 7.0, cz - 6.75], [cx + 0.5, 5.4, cz - 9], [cx + 2, 3.0, cz - 11.5], [cx + 2.5, 1.2, cz - 13.5], [cx + 2.5, 0.9, cz - 14.5]], M.slMint);
    // big bucket frame on top
    const by = 9.0;
    for (const a of [-1, 1]) {
      B.box(cx + a * 2.25 - 0.25, by, cz - 0.25, cx + a * 2.25 + 0.25, by + 5.25, cz + 0.25, M.sky2);
    }
    B.box(cx - 2.5, by + 5.0, cz - 0.375, cx + 2.5, by + 5.5, cz + 0.375, M.sky2);
    // splash cone under bucket (spreads water)
    for (let k = 0; k < 4; k++) {
      const r = 2.25 - k * 0.5;
      B.box(cx - r, by + k * 0.25, cz + 3.25 - r * 0.0 - 0.0 - r, cx + r, by + (k + 1) * 0.25, cz + 3.25 + r - r * 0.0 - 0.0, k % 2 ? M.lemon : M.white);
    }
    // axle stubs on the posts
    B.box(cx - 2.25, by + 3.25, cz - 0.25, cx - 1.75, by + 3.75, cz + 0.25, M.lemon2);
    B.box(cx + 1.75, by + 3.25, cz - 0.25, cx + 2.25, by + 3.75, cz + 0.25, M.lemon2);
    P.bucket = { x: cx, y: by + 3.1, z: cz + 0.0, pivotY: by + 3.5, catchY: by + 1.0, catchZ: cz + 3.25 };
    // water wheel axle on the west tower side
    P.wheel = { x: cx - 8.4, y: 4.0, z: cz + 1.5, r: 1.6 };
    B.box(cx - 8.25, 3.75, cz + 1.25, cx - 7.75, 4.25, cz + 1.75, M.steel2);
    // shower heads under level 5 (dynamic spray), water guns on railings
    P.showers = [[cx - 3, 4.5, cz + 2], [cx + 3, 4.5, cz - 2], [cx, 6.5, cz - 5], [cx + 5.5, 6.5, cz + 3]];
    P.guns = [
      { x: cx + 7.6, y: 6.1, z: cz - 5, dx: 1, dz: -0.3 }, { x: cx - 7.6, y: 8.1, z: cz + 4.5, dx: -1, dz: 0.5 },
      { x: cx + 3.5, y: 5.6, z: cz + 3.8, dx: 0.3, dz: 1 }, { x: cx - 1, y: 9.6, z: cz - 2.6, dx: -0.4, dz: -1 },
    ];
    for (const g of P.guns) {
      F.box(g.x - 0.125, g.y - 0.25, g.z - 0.125, g.x + 0.125, g.y + 0.125, g.z + 0.125, M.lemon2);
      F.box(g.x + g.dx * 0.25 - 0.0625, g.y - 0.0625, g.z + g.dz * 0.25 - 0.0625, g.x + g.dx * 0.25 + 0.0625, g.y + 0.0625, g.z + g.dz * 0.25 + 0.0625, M.red);
    }
    // small tipping buckets along level 5 edge
    P.miniBuckets = [[cx - 3.5, 6.2, cz + 3.6], [cx + 3.5, 6.2, cz + 3.6], [cx, 6.2, cz + 3.6]];
    // mushroom & flower umbrellas
    P.mushrooms = [];
    const mush = (x, z, r, h, cap, dot) => {
      B.box(x - 0.5, pf, z - 0.5, x + 0.5, h, z + 0.5, M.white);
      for (let k = 0; k < 4; k++) {
        const rr = r - k * k * 0.22;
        B.cyl(x, z, rr, h + k * 0.25, h + (k + 1) * 0.25, (X, Y, Z) => ((Math.floor(X * 1.3) + Math.floor(Z * 1.3)) % 3 === 0 && k > 0 ? dot : cap));
      }
      P.mushrooms.push({ x, z, r, y: h });
    };
    mush(cx - 16, cz - 9, 2.25, 3.25, M.pink2, M.white);
    mush(cx + 15, cz - 10, 2.0, 2.75, M.red, M.white);
    mush(cx - 14, cz + 11, 1.75, 2.5, M.lav, M.white);
    // flower umbrella (petals)
    const flower = (x, z, h, c1, c2) => {
      B.box(x - 0.25, pf, z - 0.25, x + 0.25, h, z + 0.25, M.mint2);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        B.ellipsoid(x + Math.cos(a) * 1.0, h + 0.3, z + Math.sin(a) * 1.0, 0.85, 0.3, 0.85, c1);
      }
      B.ellipsoid(x, h + 0.45, z, 0.6, 0.4, 0.6, c2);
      P.mushrooms.push({ x, z, r: 1.7, y: h });
    };
    flower(cx + 12, cz + 11, 2.5, M.pink, M.lemon);
    flower(cx + 4, cz + 15, 2.25, M.lemon, M.coral);
    // animal sprayers around pool edge
    P.animals = [];
    const whale = (x, z) => {
      const y = pf;
      B.ellipsoid(x, y + 0.9, z, 1.8, 1.1, 1.2, (X, Y, Z) => (Y < y + 0.7 ? M.white : M.sky2));
      B.box(x + 1.5, y + 0.9, z - 0.75, x + 2.5, y + 1.25, z + 0.75, M.sky2);
      B.box(x - 1.25, y + 1.0, z - 1.25, x - 1.0, y + 1.25, z - 1.0, M.navy);
      P.animals.push({ x: x, y: y + 2.1, z, kind: 'whale' });
    };
    const frog = (x, z) => {
      const y = 1.0;
      B.ellipsoid(x, y + 0.6, z, 1.0, 0.7, 0.9, M.grass);
      B.ellipsoid(x - 0.45, y + 1.25, z + 0.5, 0.3, 0.3, 0.3, M.white);
      B.ellipsoid(x + 0.45, y + 1.25, z + 0.5, 0.3, 0.3, 0.3, M.white);
      P.animals.push({ x, y: y + 1.3, z: z + 0.6, kind: 'frog' });
    };
    const duck = (x, z) => {
      const y = pf;
      B.ellipsoid(x, y + 0.7, z, 1.0, 0.7, 0.75, M.lemon);
      B.ellipsoid(x + 0.7, y + 1.5, z, 0.5, 0.5, 0.5, M.lemon);
      B.box(x + 1.1, y + 1.4, z - 0.25, x + 1.6, y + 1.6, z + 0.25, M.coral);
      P.animals.push({ x: x + 1.5, y: y + 1.55, z, kind: 'duck' });
    };
    whale(cx - 11, cz - 13);
    frog(cx + 19, cz + 4);
    duck(cx + 9, cz - 14);
    whale(cx - 18, cz + 3);
    // splash pad with ground jets
    P.splashPad = { x: -72, z: 100, r: 6, y: 1.0, jets: [] };
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const x = -72 + (i - 3) * 1.7, z = 100 + (j - 3) * 1.7;
      if (Math.hypot(x + 72, z - 100) > 5.8) continue;
      F.box(x - 0.125, 1.0, z - 0.125, x + 0.125, 1.0625, z + 0.125, M.steel);
      P.splashPad.jets.push([x, z]);
    }
    // spiral slide tower
    {
      const sx = -130, sz = 80;
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(sx + a * 1.0 - 0.25, 1.0, sz + b * 1.0 - 0.25, sx + a * 1.0 + 0.25, 5.5, sz + b * 1.0 + 0.25, M.lav);
      B.box(sx - 1.5, 4.75, sz - 1.5, sx + 1.5, 5.0, sz + 1.5, M.white);
      for (let k = 0; k < 4; k++) B.box(sx - 1.75 + k * 0.375, 6.75 + k * 0.5, sz - 1.75 + k * 0.375, sx + 1.75 - k * 0.375, 7.25 + k * 0.5, sz + 1.75 - k * 0.375, k % 2 ? M.lemon : M.pink);
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box(sx + a * 1.5 - 0.25, 5.0, sz + b * 1.5 - 0.25, sx + a * 1.5 + 0.25, 6.75, sz + b * 1.5 + 0.25, M.white);
      P.stairs(sx + 1.0, sz + 2.0, 'S', 1.25, 5.0, 1.0, M.white, 0.5);
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = t * Math.PI * 2.4 + Math.PI;
        pts.push([sx + Math.cos(a) * 3.2, 4.9 - t * 3.7, sz + Math.sin(a) * 3.2]);
      }
      pts.push([sx + 6, 0.9, sz + 4]);
      kslide(pts, M.slSky);
      P.spiralSlide = { x: sx, z: sz };
    }
    // shade sails + benches along plaza side
    for (let i = 0; i < 5; i++) {
      const z = 72 + i * 9;
      const x = -55;
      for (const p of [[x - 2.5, z - 3], [x + 2.5, z - 3], [x, z + 3]]) B.box(p[0] - 0.125, 1.0, p[1] - 0.125, p[0] + 0.125, 4.5, p[1] + 0.125, M.white);
      // triangle sail at ~4 m
      for (let u = 0; u <= 1; u += 0.04) for (let v = 0; v <= 1 - u; v += 0.04) {
        const px = (x - 2.5) * (1 - u - v) + (x + 2.5) * u + x * v;
        const pz = (z - 3) * (1 - u - v) + (z - 3) * u + (z + 3) * v;
        const py = 4.25 - Math.sin(Math.PI * u) * 0.2 + v * 0.25;
        F.box(px, py, pz, px + FV, py + FV, pz + FV, i % 2 ? M.fabY : M.fabB);
      }
      addI('bench', { x: x - 0.5, y: 1.0, z: z + 0.5, ry: Math.PI / 2 });
    }
    // kids palms
    [[-150, 72], [-150, 112], [-88, 116], [-128, 116], [-62, 74], [-140, 92], [-92, 70], [-64, 112], [-158, 96], [-120, 70]].forEach(([x, z], i) => addI('palm' + ((i + 2) % 6), { x, y: 1.0, z, rot: i % 4 }));
    P.signPost(-80, 74, 'N', 13, 'castle', '戏水城堡', M.signP);
  }

  /* ------------------------------------------------------------ food street */
  function shop(x0, x1, z0, z1, side, col, label, icon, prop) {
    const B = P.B, F = P.FB;
    const y0 = 1.0, h = 5.0;
    B.box(x0, y0, z0, x1, y0 + h, z1, M.white);
    B.box(x0 - 0.25, y0 + h, z0 - 0.25, x1 + 0.25, y0 + h + 0.5, z1 + 0.25, col);
    // open counter on street side
    const sx = side > 0 ? x1 - 0.25 : x0;
    B.box(sx, y0 + 1.0, z0 + 1.0, sx + 0.25, y0 + 3.0, z1 - 1.0, P.CARVE);
    B.box(sx - (side > 0 ? 0 : 0), y0 + 0.75, z0 + 1.0, sx + 0.25, y0 + 1.0, z1 - 1.0, M.white2);
    B.box(x0 + 0.25, y0, z0 + 0.25, x1 - 0.25, y0 + 0.25, z1 - 0.25, M.tile);
    // interior back wall colour
    const bx = side > 0 ? x0 + 0.25 : x1 - 0.5;
    B.box(bx, y0 + 0.25, z0 + 0.5, bx + 0.25, y0 + h, z1 - 0.5, col);
    // striped awning sloping out
    for (let k = 0; k < 6; k++) {
      const off = 0.5 + k * 0.4;
      const ax = side > 0 ? x1 + off - 0.4 : x0 - off;
      for (let z = z0; z < z1; z += 0.5) B.box(ax, y0 + 3.75 - k * 0.25, z, ax + 0.4, y0 + 4.0 - k * 0.25, z + 0.5, (Math.floor((z - z0) / 0.5) & 1) ? col : M.white);
    }
    // sign board above awning
    const fx = side > 0 ? x1 : x0;
    const face = side > 0 ? 'E' : 'W';
    const zc = (z0 + z1) / 2;
    P.board(fx + (side > 0 ? 0.25 : -0.25), y0 + 4.6, zc, face, 5.0, 1.1, M.signW, 1, 0.3);
    P.board(fx + (side > 0 ? 0.25 + FV : -0.25 - FV), y0 + 4.6, zc + (side > 0 ? 1.85 : -1.85), face, 1.0, 1.0, col === M.lemon ? M.signY : col === M.sky ? M.signB : col === M.pink ? M.signP : col === M.mint ? M.signM : col === M.lav ? M.signL : M.signO, 1, 0.3);
    P.stampBits(P.iconBits(icon, 7), fx + (side > 0 ? 0.25 + 2 * FV : -0.25 - 2 * FV), y0 + 4.6, zc + (side > 0 ? 1.85 : -1.85), face, M.signW, 1, 1);
    P.stampBits(P.textBits(label, 7), fx + (side > 0 ? 0.25 + FV : -0.25 - FV), y0 + 4.6, zc + (side > 0 ? -0.5 : 0.5), face, M.signN, 1, 1);
    // rooftop prop
    prop((x0 + x1) / 2, y0 + h + 0.5, zc);
  }
  const props = {
    icecream: (x, y, z) => {
      const B = P.B;
      for (let k = 0; k < 14; k++) { const r = 0.25 + k * 0.1; B.cyl(x, z, r, y + k * 0.25, y + (k + 1) * 0.25, (X, Y, Z) => ((Math.floor(X * 2 + Y * 2) + Math.floor(Z * 2 - Y * 2)) & 1 ? M.wood : M.wood2)); }
      B.ellipsoid(x, y + 4.2, z, 1.8, 1.3, 1.8, M.pink);
      B.ellipsoid(x, y + 5.3, z, 1.3, 1.0, 1.3, M.cream);
      B.ellipsoid(x, y + 6.2, z, 0.8, 0.7, 0.8, M.choco);
      B.ellipsoid(x + 0.2, y + 6.9, z, 0.3, 0.3, 0.3, M.red);
    },
    shaved: (x, y, z) => {
      const B = P.B;
      B.cyl(x, z, 1.4, y, y + 0.5, M.skyPale);
      B.cyl(x, z, 1.9, y + 0.5, y + 1.25, M.white, 1.5);
      B.ellipsoid(x, y + 1.6, z, 1.7, 1.6, 1.7, (X, Y, Z) => (Y > y + 2.0 ? (X > x ? M.pink : M.lemon) : M.white));
      B.box(x - 0.25, y + 3.0, z - 0.25, x + 0.25, y + 3.5, z + 0.25, M.red);
    },
    juice: (x, y, z) => {
      const B = P.B;
      for (let k = 0; k < 14; k++) B.cyl(x, z, 1.0 + k * 0.04, y + k * 0.25, y + (k + 1) * 0.25, k > 10 ? M.white : (k % 3 === 0 ? M.lemon : M.coral));
      B.cyl(x, z, 1.6, y + 3.5, y + 3.75, M.white);
      B.beam(x + 0.3, y + 3.5, z, x + 1.3, y + 5.6, z - 0.3, 0.25, M.pink2);
      B.ellipsoid(x - 0.9, y + 3.6, z + 0.6, 0.55, 0.55, 0.2, M.lemon);
    },
    burger: (x, y, z) => {
      const B = P.B;
      B.cyl(x, z, 1.7, y, y + 0.5, M.wood);
      B.cyl(x, z, 1.85, y + 0.5, y + 0.75, M.grass);
      B.cyl(x, z, 1.75, y + 0.75, y + 1.25, M.choco);
      B.cyl(x, z, 1.9, y + 1.25, y + 1.5, M.lemon);
      B.cyl(x, z, 1.8, y + 1.5, y + 1.75, M.red);
      B.ellipsoid(x, y + 1.9, z, 1.8, 1.0, 1.8, (X, Y, Z) => (P.hash3i(Math.floor(X * 4), Math.floor(Y * 4), Math.floor(Z * 4)) < 0.06 && Y > y + 2.3 ? M.cream : M.wood));
    },
    bbq: (x, y, z) => {
      const B = P.B;
      B.beam(x - 0.2, y, z, x + 0.3, y + 6.0, z, 0.25, M.wood2);
      const cols = [M.choco, M.grass, M.red, M.choco, M.lemon, M.choco];
      cols.forEach((c, i) => B.box(x - 0.55 + i * 0.01, y + 1.0 + i * 0.75, z - 0.55, x + 0.55 + i * 0.08, y + 1.6 + i * 0.75, z + 0.55, c));
    },
    gift: (x, y, z) => {
      const B = P.B;
      B.box(x - 1.4, y, z - 1.4, x + 1.4, y + 2.6, z + 1.4, M.lav);
      B.box(x - 0.3, y, z - 1.5, x + 0.3, y + 2.7, z + 1.5, M.lemon);
      B.box(x - 1.5, y, z - 0.3, x + 1.5, y + 2.7, z + 0.3, M.lemon);
      B.ellipsoid(x - 0.6, y + 3.1, z, 0.6, 0.45, 0.3, M.lemon);
      B.ellipsoid(x + 0.6, y + 3.1, z, 0.6, 0.45, 0.3, M.lemon);
    },
  };
  function buildFood() {
    const B = P.B;
    shop(84, 95, 104, 115, 1, M.pink, '冰淇淋', 'star', props.icecream);
    shop(84, 95, 92, 103, 1, M.sky, '刨冰', 'star', props.shaved);
    shop(84, 95, 80, 91, 1, M.lemon, '果汁', 'cup', props.juice);
    shop(117, 128, 104, 115, -1, M.coral, '汉堡', 'food', props.burger);
    shop(117, 128, 92, 103, -1, M.mint, '烧烤', 'food', props.bbq);
    shop(117, 128, 80, 91, -1, M.lav, '纪念品', 'star', props.gift);
    // street gateway arch at the south end
    for (const x of [97, 115]) B.box(x - 0.5, 1, 116, x + 0.5, 7, 117, M.white);
    B.box(96.5, 7, 115.75, 115.5, 8.25, 117.25, M.lemon);
    P.stampBits(P.textBits('美食街', 8), 106, 7.6, 117.25, 'S', M.signN, 1, 1);
    P.stampBits(P.textBits('美食街', 8), 106, 7.6, 115.75, 'N', M.signN, 1, 1);
    // terrace tables & umbrellas facing the wave pool (north-west)
    P.umbrellas = P.umbrellas || [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const x = 82 + i * 9 + (j % 2) * 4, z = 69 + j * 4;
      addI('table', { x, y: 1.0, z });
      addI('chair', { x: x - 1.0, y: 1.0, z, ry: Math.PI / 2 + 0.6 });
      addI('chair', { x: x + 1.0, y: 1.0, z, ry: -Math.PI / 2 + 0.6 });
      addI('upole', { x, y: 1.0, z });
      P.umbrellas.push({ x, y: 3.5, z, c: (i + j) % 6 });
    }
    // terrace railing on river side
    P.railing([[74, 66.6], [140, 66.6]], 1.0, { mat: M.white });
    // ice cream truck parked by the road (south end, outside the street)
    {
      const x = 134, z = 108, y = 1.0;
      B.box(x - 3, y + 0.5, z - 1.25, x + 2, y + 3.0, z + 1.25, M.white);
      B.box(x + 2, y + 0.5, z - 1.25, x + 3.5, y + 2.25, z + 1.25, M.pink);
      B.box(x + 2.25, y + 1.5, z - 1.0, x + 3.25, y + 2.25, z + 1.0, M.win);
      B.box(x - 3, y + 3.0, z - 1.25, x + 2, y + 3.25, z + 1.25, M.pink);
      B.box(x - 2.5, y + 1.25, z - 1.5, x + 1.5, y + 2.5, z - 1.25, P.CARVE);
      B.box(x - 2.5, y + 1.25, z - 1.25, x + 1.5, y + 2.5, z - 1.0, M.lemon);
      for (let i = 0; i < 9; i++) B.box(x - 3 + i * 0.5 + 0.25, y + 2.5, z - 1.75, x - 2.75 + i * 0.5 + 0.25, y + 2.75, z - 1.25, i % 2 ? M.pink : M.white);
      for (const [wx, wz] of [[-2, -1.25], [-2, 1.0], [2.5, -1.25], [2.5, 1.0]]) B.box(x + wx - 0.5, y, z + wz, x + wx + 0.5, y + 0.75, z + wz + 0.25, M.dark);
      // giant cone on the roof
      for (let k = 0; k < 6; k++) B.cyl(x - 0.5, z, 0.2 + k * 0.1, y + 3.25 + k * 0.25, y + 3.5 + k * 0.25, M.wood);
      B.ellipsoid(x - 0.5, y + 5.2, z, 0.75, 0.6, 0.75, M.mint);
    }
    // palms
    [[70, 74], [70, 96], [70, 112], [140, 96], [148, 74], [150, 112], [106, 74], [80, 118], [132, 118], [160, 86]].forEach(([x, z], i) => addI('palm' + ((i + 3) % 6), { x, y: 1.0, z, rot: i % 4 }));
    P.signPost(100, 72, 'N', 16, 'food', '餐饮街', M.signO);
  }

  /* ------------------------------------------------------------ parking lot outside the gate (front-right) */
  function buildParking() {
    const T = P.terrain, M_ = M;
    const fy = Math.round(P.L.frontY / V);
    const x0 = 40, x1 = 152, z0 = 127, z1 = 163;
    P.eachCol(x0, z0, x1, z1, (k, x, z) => {
      T.H[k] = fy;
      T.top[k] = M_.road; T.side[k] = 0;
      if (x < x0 + 0.5 || x > x1 - 0.5 || z < z0 + 0.5 || z > z1 - 0.5) T.top[k] = M_.coping;
    });
    // driveway to the avenue
    P.eachCol(12, 140, x0, 147, (k) => { T.H[k] = fy; T.top[k] = M_.road; });
    // stall lines
    const rows = [[129.5, 135.0], [135.0, 140.5], [149.5, 155.0], [155.0, 160.5]];
    for (const [za, zb] of rows) {
      for (let x = x0 + 2; x <= x1 - 2; x += 2.75) P.eachCol(x - 0.125, za, x + 0.125, zb, (k) => { T.top[k] = M_.roadLine; });
    }
    P.eachCol(x0 + 2, 140.4, x1 - 2, 140.6, (k) => { T.top[k] = M_.roadLine; });
    P.eachCol(x0 + 2, 149.4, x1 - 2, 149.6, (k) => { T.top[k] = M_.roadLine; });
    // car models
    const carCols = [M.sky, M.lemon, M.pink, M.mint, M.white2, M.coral, M.lav];
    P.carModels = carCols.map((c, i) => P.makeModel('car' + i, V, (B) => {
      B.box(-0.875, 0.25, -2.0, 0.875, 1.0, 2.0, c);
      B.box(-0.75, 1.0, -1.0, 0.75, 1.5, 1.0, M.win2);
      B.box(-0.625, 1.5, -0.875, 0.625, 1.625, 0.875, c);
      B.box(-0.75, 1.0, -1.25, 0.75, 1.25, -1.0, c);
      B.box(-0.875, 0.5, 1.875, 0.875, 0.75, 2.0, M.white);
      for (const [wx, wz] of [[-0.875, -1.25], [0.875, -1.25], [-0.875, 1.25], [0.875, 1.25]]) B.box(wx - 0.125, 0, wz - 0.375, wx + 0.125, 0.5, wz + 0.375, M.dark);
      B.box(-0.625, 0.5, -2.125, -0.375, 0.75, -2.0, M.lampY); B.box(0.375, 0.5, -2.125, 0.625, 0.75, -2.0, M.lampY);
    }));
    P.makeModel('bus', V, (B) => {
      B.box(-1.25, 0.5, -6.0, 1.25, 3.25, 6.0, M.white);
      B.box(-1.25, 0.5, -6.0, 1.25, 1.25, 6.0, M.sky);
      B.box(-1.3, 1.75, -5.5, 1.3, 2.75, 5.0, M.win2);
      B.box(-1.25, 3.25, -5.75, 1.25, 3.5, 5.75, M.sky2);
      B.box(-1.1, 1.75, -6.05, 1.1, 2.9, -5.9, M.win);
      for (const wz of [-4, 4]) for (const wx of [-1.25, 1.25]) B.box(wx - 0.125, 0, wz - 0.5, wx + 0.125, 0.75, wz + 0.5, M.dark);
    });
    const rnd = P.rng(4711);
    for (const [za, zb] of rows) {
      const zc = (za + zb) / 2;
      const facing = za < 145 ? (zc < 135 ? 0 : Math.PI) : (zc < 155 ? 0 : Math.PI);
      for (let x = x0 + 3.375; x < x1 - 2; x += 2.75) {
        if (((x - x0) / 2.75 | 0) % 11 === 5) { // palm island
          P.addInst('palm' + Math.floor(rnd() * 6), { x, y: P.L.frontY, z: zc, rot: Math.floor(rnd() * 4) });
          continue;
        }
        if (rnd() < 0.62) P.addInst('car' + Math.floor(rnd() * carCols.length), { x, y: P.L.frontY, z: zc, ry: facing + (rnd() - 0.5) * 0.04 });
      }
    }
    P.addInst('bus', { x: 26, y: P.L.frontY, z: 131, ry: 0 });
    P.addInst('bus', { x: 26, y: P.L.frontY, z: 146, ry: 0 });
    // bus stop shelter by the forecourt
    const B = P.B;
    B.box(18, 1.0, 124, 30, 1.25, 127, M.concrete);
    for (const x of [18.5, 29.5]) B.box(x - 0.125, 1.25, 126.5, x + 0.125, 3.75, 126.75, M.white);
    B.box(17.75, 3.75, 124.25, 30.25, 4.0, 127.25, M.sky);
  }

  /* ------------------------------------------------------------ drinking water kiosks */
  function drinkingPoints() {
    const B = P.B;
    const spots = [[-50, 64.5, 0.0], [52, 64.5, 0.0], [-72, 46, 0.0], [74, 46, 0.0], [-118, -60.0, 0.0], [10, -60.0, 0], [118, -60.0, 0]];
    for (const [x, z] of spots) {
      const g = P.groundY(x, z);
      B.box(x - 0.375, g, z - 0.375, x + 0.375, g + 1.0, z + 0.375, M.white);
      B.box(x - 0.5, g + 1.0, z - 0.5, x + 0.5, g + 1.25, z + 0.5, M.sky);
      P.FB.box(x - 0.0625, g + 1.25, z - 0.0625, x + 0.0625, g + 1.5, z + 0.0625, M.steel);
      P.board(x, g + 2.1, z + 0.4, 'S', 0.75, 0.75, M.signB, 1, 0.25);
      P.FB.box(x - 0.0625, g + 1.25, z + 0.3, x + 0.0625, g + 1.75, z + 0.4, M.steel);
      P.stampBits(P.iconBits('cup', 5), x, g + 2.1, z + 0.4 + FV, 'S', M.signW, 1, 1);
    }
  }

  P.buildFront = function () {
    buildGate();
    buildPlaza();
    buildServices();
    buildKids();
    buildFood();
    buildParking();
    drinkingPoints();
  };
})();
