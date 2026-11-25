/* shrine: torii, lanterns, temizuya, sanctuary, komainu, ema, omikuji, sake barrels, inari */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C, L = W.L;
  const VER = 0xd8401e, VER2 = 0xc8351c, BLK = 0x221c1c, STONE = 0x9a9486, WHITE = 0xf4f0e6;
  const LAQ = [0, 0, 0, 10.0], ST = [0, 0, 0, 3.0], FW = [0, 0, 0, 1.0], FWY = [0, 0, 0, 1.25];
  const TY = L.TERR_Y;

  // ---------- shared props ----------
  // shide: zigzag paper streamer hanging from p (top), length len
  W.shide = function (ctx, p, len, ry, sway) {
    if (p.isVector3) p = [p.x, p.y, p.z];
    const segs = 4, sh = len / segs;
    const sw = sway === undefined ? 0.25 : sway;
    for (let i = 0; i < segs; i++) {
      const x = (i % 2 ? 0.035 : 0) - 0.017;
      ctx.add(W.g.box(0.042, sh * 0.92, 0.004), WHITE, [p[0] + Math.cos(ry || 0) * x * 1.2, p[1] - sh * (i + 0.5), p[2] - Math.sin(ry || 0) * x * 1.2], [0, ry || 0, i % 2 ? 0.35 : -0.35], 1,
        (lx, ly) => [0, sw * (0.2 + (i + 0.5 - ly / sh) / segs), 0, 7.0]);
    }
  };
  // shimenawa rope between points (catenary), radius r
  W.shimenawa = function (ctx, a, b, r, sag, tassels) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; const p = new V3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    const rope = W.g.tube(pts, (t) => r * (0.75 + 0.35 * Math.sin(t * Math.PI)), 0, 10, 48);
    ctx.add(rope, 0xd8c88a, null, null, undefined, [0, 0, 0, 0], null, (lx, ly, lz, wv) => {
      const k = Math.sin((wv.x + wv.z) * 26 + Math.atan2(ly - a.y, lz) * 3);
      return C(0xd8c88a).clone().multiplyScalar(k > 0.2 ? 1.0 : 0.82);
    });
    const out = [];
    (tassels || []).forEach((t) => {
      const p = pts[Math.round(t * 12)];
      ctx.add(W.g.cone(r * 0.7, r * 3.2, 8), 0xd2c07a, [p.x, p.y - r * 2.2, p.z], [Math.PI, 0, 0], 1, (lx, ly) => [0, 0.08 + (-ly) * 0.2, 0, 0]);
      out.push(p);
    });
    return pts;
  };
  // stone lantern
  W.stoneLantern = function (ctx, x, y, z, s, style, ry, seed) {
    const R = W.rng(seed || 3);
    const c = ctx.at([x, y, z], [0, ry || 0, 0], s || 1);
    const sc = W.jit(STONE, 0.3, R);
    const hex = (r, h, col) => W.g.cyl(r, r, h, 6);
    const lantLight = [0.55, 0, 0, 7.0];
    const moss = (yy, r) => { for (let i = 0; i < 4; i++) { const a = R() * 6.28; c.add(W.g.blob(1, 1, 0.3, R() * 100 | 0), W.jit(0x5d7d2a, 0.4, R), [Math.cos(a) * r * 0.6, yy, Math.sin(a) * r * 0.6], [0, R() * 6, 0], [r * 0.4, 0.04, r * 0.3], [0, 0, 0, 4.0]); } };
    const roofLeaves = (yy, r) => { for (let i = 0; i < 4; i++) { const a = R() * 6.28; const gink = R() < 0.5; c.add(W.g.leaf(gink ? 'ginkgo' : 'maple'), W.jit(gink ? 0xf0b820 : 0xd0401c, 0.3, R), [Math.cos(a) * r * 0.5, yy, Math.sin(a) * r * 0.5], [0.3, R() * 6, 0], 0.12, [0, 0, 0, 8.0]); } };
    if (style === 'yukimi') {
      for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28; c.add(W.g.cyl(0.05, 0.07, 0.42, 6), sc, [Math.cos(a) * 0.32, 0.21, Math.sin(a) * 0.32], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], 1, ST); }
      c.add(hex(0.3, 0.08), sc, [0, 0.44, 0], null, 1, ST);
      c.add(W.g.cyl(0.2, 0.22, 0.3, 6), sc, [0, 0.63, 0], null, 1, ST);
      c.add(W.g.cyl(0.13, 0.13, 0.18, 6), 0xffd890, [0, 0.64, 0], null, 1, lantLight);
      c.add(W.g.cyl(0.05, 0.7, 0.28, 6), sc, [0, 0.92, 0], null, 1, ST);
      c.add(W.g.sph(1, 8), sc, [0, 1.1, 0], null, [0.09, 0.12, 0.09], ST);
      moss(1.0, 0.6); roofLeaves(1.0, 0.6);
      return c.worldPos([0, 0.64, 0]);
    }
    if (style === 'oribe') {
      c.add(W.g.box(0.22, 0.9, 0.22), sc, [0, 0.45, 0], null, 1, ST);
      c.add(W.g.box(0.4, 0.08, 0.4), sc, [0, 0.94, 0], null, 1, ST);
      c.add(W.g.box(0.3, 0.28, 0.3), sc, [0, 1.12, 0], null, 1, ST);
      c.add(W.g.box(0.16, 0.16, 0.31), 0xffd890, [0, 1.12, 0], null, 1, lantLight);
      c.add(W.g.cyl(0.05, 0.36, 0.22, 4), sc, [0, 1.37, 0], [0, Math.PI / 4, 0], 1, ST);
      c.add(W.g.sph(1, 8), sc, [0, 1.52, 0], null, [0.07, 0.09, 0.07], ST);
      moss(1.45, 0.35); roofLeaves(1.4, 0.4);
      return c.worldPos([0, 1.12, 0]);
    }
    // kasuga (default)
    c.add(hex(0.32, 0.14), sc, [0, 0.07, 0], null, 1, ST);
    c.add(W.g.cyl(0.24, 0.3, 0.12, 6), sc, [0, 0.2, 0], null, 1, ST);
    c.add(W.g.cyl(0.1, 0.12, 0.9, 12), sc, [0, 0.7, 0], null, 1, ST);
    c.add(W.g.torus(0.11, 0.025, 5, 12), sc, [0, 0.72, 0], [Math.PI / 2, 0, 0], 1, ST);
    c.add(W.g.cyl(0.3, 0.16, 0.14, 6), sc, [0, 1.2, 0], null, 1, ST);
    c.add(W.g.cyl(0.22, 0.22, 0.34, 6), sc, [0, 1.44, 0], null, 1, ST);
    c.add(W.g.cyl(0.16, 0.16, 0.22, 6), 0xffd890, [0, 1.44, 0], null, 1, lantLight);
    c.add(W.g.cyl(0.06, 0.46, 0.26, 6), sc, [0, 1.74, 0], null, 1, ST);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + Math.PI / 6; c.add(W.g.sph(1, 6), sc, [Math.cos(a) * 0.43, 1.64, Math.sin(a) * 0.43], null, [0.05, 0.05, 0.05], ST); }
    c.add(W.g.cyl(0.07, 0.09, 0.08, 8), sc, [0, 1.9, 0], null, 1, ST);
    c.add(W.g.sph(1, 8), sc, [0, 2.0, 0], null, [0.08, 0.11, 0.08], ST);
    moss(1.84, 0.45); moss(0.15, 0.4); roofLeaves(1.8, 0.45);
    return c.worldPos([0, 1.44, 0]);
  };
  W.lanternGlows = [];

  // small paper lantern (chochin), returns nothing; sway via shader
  function chochin(ctx, p, col, s) {
    const prof = []; for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push([0.05 + Math.sin(t * Math.PI) * 0.09, -t * 0.28]); }
    const top = p[1];
    const sw = (lx, ly, lz) => [0.45, 0.12 + Math.max(0, -ly) * 0.6, 0, 7.0];
    ctx.add(W.g.lathe(prof, 14, 'chochinS'), 0xffffff, [p[0], p[1] - 0.03, p[2]], null, s || 1, sw, null, (lx, ly) => {
      const band = Math.abs(Math.sin(ly * 70)) > 0.9;
      if (band) return C(0x8a6a4a);
      return ly < -0.1 && ly > -0.2 ? C(col === 'red' ? 0xf2ece0 : 0xd8301e) : C(col === 'red' ? 0xd8301e : 0xf6efe0);
    });
    ctx.add(W.g.cyl(0.05, 0.05, 0.03, 10), BLK, [p[0], p[1] - 0.02, p[2]], null, s || 1, (lx, ly) => [0, 0.12, 0, 0]);
    ctx.add(W.g.cyl(0.05, 0.05, 0.03, 10), BLK, [p[0], p[1] - 0.32 * (s || 1), p[2]], null, s || 1, (lx, ly) => [0, 0.28, 0, 0]);
  }

  // ---------- torii ----------
  function torii(B) {
    const T = L.TORII;
    const ctx = new W.Ctx(B).at([T.x, 0.03, T.z]);
    const R = W.rng(311);
    const H = 4.0, span = 2.9, pr = 0.17;
    [-1, 1].forEach((s) => {
      ctx.add(W.g.cyl(pr * 0.92, pr, H, 20), VER, [s * span / 2, H / 2, 0], [0, 0, s * 0.03], 1, LAQ);
      ctx.add(W.g.cyl(pr * 1.18, pr * 1.22, 0.5, 20), BLK, [s * span / 2, 0.25, 0], null, 1, [0, 0, 0, 10.0]);
      ctx.add(W.g.cyl(pr * 1.25, pr * 1.25, 0.05, 20), BLK, [s * span / 2, 0.5, 0], null, 1, [0, 0, 0, 10.0]);
      ctx.add(W.g.cyl(0.32, 0.36, 0.12, 8), STONE, [s * span / 2, 0.0, 0], null, 1, ST);
    });
    // nuki
    ctx.box(span + 0.9, 0.2, 0.15, VER, [0, H - 0.75, 0], null, LAQ);
    // kasagi + shimaki (curved)
    const curve = (len, h, d, y, col, up) => {
      const geo = new THREE.BoxGeometry(len, h, d, 24, 1, 1);
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i); const t = Math.abs(x) / (len / 2); P.setY(i, P.getY(i) + Math.pow(t, 2.6) * up); }
      geo.computeVertexNormals();
      ctx.add(geo, col, [0, y, 0], null, 1, col === BLK ? [0, 0, 0, 10.0] : LAQ);
    };
    curve(span + 1.7, 0.22, 0.3, H - 0.12, VER, 0.22);
    curve(span + 1.9, 0.14, 0.36, H + 0.06, BLK, 0.26);
    // gakuzuka + plaque
    ctx.box(0.16, 0.5, 0.14, VER, [0, H - 0.42, 0], null, LAQ);
    ctx.box(0.42, 0.66, 0.06, 0xffffff, [0, H - 0.4, 0.1], null, [0, 0, 0, 0], W.atlas.get('plaque'));
    ctx.box(0.42, 0.66, 0.06, 0xffffff, [0, H - 0.4, -0.1], [0, Math.PI, 0], [0, 0, 0, 0], W.atlas.get('plaque'));
    // shimenawa under nuki
    const sub = new W.Ctx(B);
    const a = ctx.worldPos([-span / 2 + 0.25, H - 0.95, 0.02]), b = ctx.worldPos([span / 2 - 0.25, H - 0.95, 0.02]);
    const pts = W.shimenawa(sub, a, b, 0.07, 0.25, [0.25, 0.5, 0.75]);
    [0.17, 0.42, 0.58, 0.83].forEach((t) => { const p = pts[Math.round(t * 12)]; W.shide(sub, [p.x, p.y - 0.05, p.z + 0.05], 0.42, 0, 0.35); });
    // shrine name pillar
    const pl = new W.Ctx(B).at([L.SANDO_X - 2.55, 0, T.z + 0.55]);
    pl.box(0.8, 0.25, 0.8, STONE, [0, 0.12, 0], null, ST);
    pl.box(0.36, 2.3, 0.36, 0xffffff, [0, 1.4, 0], [0, -0.35, 0], [0, 0, 0, 3.0], W.atlas.get('pillar'));
    pl.add(W.g.cyl(0.05, 0.26, 0.18, 4), STONE, [0, 2.63, 0], [0, Math.PI / 4 - 0.35, 0], 1, ST);
    W.toriiTop = ctx.worldPos([0, H + 0.2, 0]);
    W.toriiPillars = [ctx.worldPos([-span / 2, 0, 0]), ctx.worldPos([span / 2, 0, 0])];
  }

  // ---------- sando lanterns, paper lantern strings ----------
  function sando(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(321);
    const xl = L.STAIR_X0 - 1.25, xr = L.STAIR_X1 + 1.25;
    const lp = [[xl, 5.7, 'kasuga', 0.3], [xr, 5.7, 'kasuga', -0.3], [xl, 2.3, 'kasuga', 0.2], [xr, 2.3, 'kasuga', -0.2], [L.STAIR_X0 - 0.9, -6.4, 'kasuga', 0], [L.STAIR_X1 + 0.9, -6.4, 'kasuga', 0]];
    lp.forEach((p, i) => {
      const y = W.H(p[0], p[1]);
      const g = W.stoneLantern(ctx, p[0], y, p[1], 0.95, p[2], p[3], 400 + i);
      W.lanternGlows.push(g);
    });
    // poles and strings
    const poleZ = [6.2, 2.1, -1.6, -5.9];
    const sides = [L.STAIR_X0 - 0.22, L.STAIR_X1 + 0.22];
    const poleTops = sides.map((x) => poleZ.map((z) => {
      let y = z > L.STAIR_Z0 ? 0.03 : z < L.TERR_Z ? TY : W.stairY(z) + 0.25;
      const top = y + 2.7;
      ctx.add(W.g.cyl(0.05, 0.06, 2.75, 8), 0x6a4a30, [x, y + 1.37, z], null, 1, FWY);
      ctx.add(W.g.cyl(0.07, 0.07, 0.06, 8), 0x3a2a20, [x, top, z], null, 1);
      return new V3(x, top, z);
    }));
    W.sandoLanterns = [];
    poleTops.forEach((tops, si) => {
      for (let k = 0; k < tops.length - 1; k++) {
        const a = tops[k], b = tops[k + 1];
        const pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; const p = new V3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * 0.35; pts.push(p); }
        ctx.add(W.g.tube(pts, 0.008, 0.008, 4, 20), 0x4a3a2a, null, null, undefined, [0, 0, 0, 0]);
        const n = 4;
        for (let i = 1; i <= n; i++) {
          const t = i / (n + 1); const p = new V3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * 0.35;
          chochin(ctx, [p.x, p.y - 0.02, p.z], (i + k + si) % 2 ? 'red' : 'white', 1.0);
          W.sandoLanterns.push(p.clone());
        }
      }
    });
    // higanbana along stairs and slope
    for (let z = 4.0; z > -4.6; z -= 1.15) {
      W.higanbana(L.STAIR_X0 - 0.75 + R.range(-0.15, 0.15), z + R.range(-0.3, 0.3), 5, 600 + Math.round(z * 10));
      W.higanbana(L.STAIR_X1 + 0.75 + R.range(-0.15, 0.15), z + R.range(-0.3, 0.3), 5, 620 + Math.round(z * 10));
    }
    [[L.STAIR_X0 - 1.3, 4.6], [L.STAIR_X1 + 1.3, 4.6], [13.9, 12.6], [13.6, 9.0]].forEach((p, i) => W.higanbana(p[0], p[1], 7, 650 + i));
    W.susuki(14.3, 3.4, 1.0, 701); W.susuki(14.6, -4.4, 1.0, 702);
  }

  // ---------- temizuya ----------
  function temizuya(B) {
    const cx = 5.6, cz = -7.7;
    const ctx = new W.Ctx(B).at([cx, TY, cz]);
    const R = W.rng(331);
    // stone basin
    ctx.add(W.g.soft(1.25, 0.55, 0.65, 0.06, 3), 0x8e887c, [0, 0.27, 0], null, 1, ST);
    ctx.box(1.05, 0.02, 0.45, 0x3a5a6a, [0, 0.5, 0], null, ST);
    // water surface
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.48), W.makeFlowMat({ still: true, tint: 0x7ccbd8, scale: 0.6 }));
    wm.rotation.x = -Math.PI / 2; wm.position.set(cx, TY + 0.53, cz); wm.layers.set(W.LAYER.FX); wm.renderOrder = 2;
    W.scene.add(wm);
    W.temizuWater = new V3(cx, TY + 0.535, cz);
    // floating flowers & red leaves (chōzubachi decoration)
    const fl = [0xe8486a, 0xf28aa8, 0xf6f0e8, 0xf2a03a, 0xc83a6a, 0x9a6ad8];
    for (let i = 0; i < 64; i++) {
      const x = R.range(-0.5, 0.5), z = R.range(-0.21, 0.21);
      if (i % 3 === 0) ctx.add(W.g.leaf('maple'), W.jit(0xd02c1c, 0.3, R), [x, 0.536, z], [0, R() * 6, 0], R.range(0.08, 0.11), [0, 0, 0, 8.0]);
      else W.flowerHead(new W.Ctx(B), ctx.worldPos([x, 0.528, z]), i % 4 ? 'camellia' : 'mum', fl[i % fl.length], R.range(0.065, 0.09), R, [R.range(-0.2, 0.2), R() * 6, R.range(-0.2, 0.2)]);
    }
    // bamboo spout from a rock
    ctx.add(W.g.blob(1, 1, 0.2, 77), 0x7a756a, [0.75, 0.45, -0.2], null, [0.28, 0.42, 0.25], ST);
    ctx.add(W.g.cyl(0.035, 0.035, 0.6, 8), 0x8aa04a, [0.45, 0.75, -0.18], [0, 0, 1.25], 1);
    const spoutEnd = ctx.worldPos([0.18, 0.66, -0.18]);
    W.temizuSpout = spoutEnd;
    // ladles on rack
    ctx.box(1.1, 0.03, 0.06, 0x9ab05a, [0, 0.58, 0.29], null, FW);
    for (let i = 0; i < 6; i++) {
      const x = -0.42 + i * 0.17;
      ctx.add(W.g.cyl(0.04, 0.04, 0.07, 10, false), 0xd8c08a, [x, 0.64, 0.34], [0.3, 0, 0], 1, FWY);
      ctx.add(W.g.cyl(0.008, 0.008, 0.42, 5), 0xd8c08a, [x, 0.6, 0.1], [Math.PI / 2 - 0.25, 0, 0], 1);
    }
    // overflow lip to channel
    ctx.box(0.18, 0.04, 0.3, 0x8e887c, [-0.6, 0.48, 0.38], null, ST);
    // roof structure
    const PX = 0.85, PZ = 0.6, PH = 2.3;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
      ctx.add(W.g.cyl(0.07, 0.08, PH, 10), VER, [a * PX, PH / 2, b * PZ], null, 1, LAQ);
      ctx.add(W.g.cyl(0.13, 0.13, 0.12, 8), STONE, [a * PX, 0.06, b * PZ], null, 1, ST);
    });
    ctx.box(2 * PX + 0.3, 0.12, 0.12, VER, [0, PH - 0.05, -PZ], null, LAQ);
    ctx.box(2 * PX + 0.3, 0.12, 0.12, VER, [0, PH - 0.05, PZ], null, LAQ);
    ctx.box(0.12, 0.12, 2 * PZ + 0.2, VER, [-PX, PH - 0.05, 0], null, LAQ);
    ctx.box(0.12, 0.12, 2 * PZ + 0.2, VER, [PX, PH - 0.05, 0], null, LAQ);
    // gable roof (copper green)
    const rw = 2 * PX + 0.9, rd = 2 * PZ + 1.0, rh = 0.75;
    const pitch = Math.atan(rh / (rd / 2));
    const sl = (rd / 2) / Math.cos(pitch) + 0.05;
    [-1, 1].forEach((s) => {
      ctx.add(W.g.box(rw, 0.08, sl), 0x5a9a86, [0, PH + rh / 2 + 0.05, s * rd / 4], [s * pitch, 0, 0], 1, [0, 0, 0, 6.0], null, (lx) => C(0x5a9a86).clone().multiplyScalar(Math.abs(Math.sin(lx * 40)) > 0.85 ? 0.85 : 1.0));
      ctx.add(W.g.box(rw, 0.1, 0.06), 0x3a2a20, [0, PH + 0.06, s * (rd / 2 + 0.02)], null, 1, FW);
    });
    ctx.add(W.g.cyl(0.09, 0.09, rw + 0.05, 10), 0x4a8a76, [0, PH + rh + 0.08, 0], [0, 0, Math.PI / 2], 1, [0, 0, 0, 6.0]);
    // gable triangles
    [-1, 1].forEach((s) => {
      const sh = new THREE.Shape(); sh.moveTo(-rd / 2 + 0.25, 0); sh.lineTo(rd / 2 - 0.25, 0); sh.lineTo(0, rh - 0.1); sh.closePath();
      const geo = new THREE.ShapeGeometry(sh); geo.rotateY(Math.PI / 2);
      ctx.add(geo, 0x6a4a30, [s * (rw / 2 - 0.15), PH + 0.1, 0], null, 1, FW);
    });
    // leaves on roof
    for (let i = 0; i < 18; i++) ctx.add(W.g.leaf(i % 2 ? 'ginkgo' : 'maple'), W.jit(i % 2 ? 0xf0b820 : 0xd0401c, 0.3, R), [R.range(-1, 1), PH + 0.5 + R.range(0, 0.3), R.range(-0.6, 0.6)], [0.5, R() * 6, 0], 0.13, [0, 0, 0, 8.0]);
    W.temizuya = ctx.worldPos([0, 0.6, 0]);
  }

  // ---------- sanctuary ----------
  function sanctuary(B) {
    const S = L.SHRINE;
    const ctx = new W.Ctx(B).at([S.x, TY, S.z]);
    const R = W.rng(341);
    const BW = 3.2, BD = 2.6, FLY = 1.05; // body width, depth, floor height
    // stone base
    ctx.add(W.g.soft(BW + 1.6, 0.45, BD + 1.4, 0.05, 2), 0x9c9688, [0, 0.22, -0.1], null, 1, ST);
    // floor posts & floor
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) ctx.add(W.g.cyl(0.07, 0.07, FLY - 0.45, 8), 0x4a3426, [i * (BW + 0.9) / 4, 0.45 + (FLY - 0.45) / 2, j * (BD + 0.8) / 2 - 0.1], null, 1, FWY);
    ctx.box(BW + 1.1, 0.1, BD + 1.1, 0x6a4a30, [0, FLY, -0.1], null, FW);
    // veranda railing (vermilion)
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
      const c = ctx.at([(x0 + x1) / 2, FLY + 0.05, (z0 + z1) / 2], [0, ry, 0]);
      c.box(0.06, 0.06, len, VER, [0, 0.5, 0], null, LAQ);
      c.box(0.04, 0.04, len, VER, [0, 0.25, 0], null, LAQ);
      for (let k = 0; k <= Math.floor(len / 0.6); k++) c.box(0.06, 0.55, 0.06, VER, [0, 0.27, -len / 2 + k * len / Math.floor(len / 0.6)], null, LAQ);
    };
    const vx = (BW + 1.0) / 2, vz0 = -BD / 2 - 0.6, vz1 = BD / 2 + 0.35;
    rail(-vx, vz0 + 0.1, -vx, vz1); rail(vx, vz0 + 0.1, vx, vz1);
    rail(-vx, vz1, -0.8, vz1); rail(0.8, vz1, vx, vz1);
    // body: vermilion posts, white walls, front doors
    const top = FLY + 2.05;
    [[-1, -1], [1, -1], [-1, 1], [1, 1], [-0.33, 1], [0.33, 1]].forEach(([a, b]) => ctx.add(W.g.cyl(0.1, 0.1, top - FLY, 12), VER, [a * BW / 2, (FLY + top) / 2, b * BD / 2 - 0.1], null, 1, LAQ));
    ctx.box(BW, top - FLY - 0.3, 0.08, WHITE, [0, FLY + (top - FLY) / 2 - 0.1, -BD / 2 - 0.1], null, [0, 0, 0, 0]);
    ctx.box(0.08, top - FLY - 0.3, BD, WHITE, [-BW / 2, FLY + (top - FLY) / 2 - 0.1, -0.1], null, [0, 0, 0, 0]);
    ctx.box(0.08, top - FLY - 0.3, BD, WHITE, [BW / 2, FLY + (top - FLY) / 2 - 0.1, -0.1], null, [0, 0, 0, 0]);
    // front side panels (outer bays)
    [-1, 1].forEach((s) => {
      const c = ctx.at([s * BW * 0.415, FLY, BD / 2 - 0.1]);
      c.box(BW * 0.33 - 0.15, top - FLY - 0.35, 0.05, 0x6a4026, [0, (top - FLY - 0.35) / 2 + 0.05, 0], null, FW);
      for (let k = 1; k < 8; k++) c.box(BW * 0.33 - 0.15, 0.015, 0.06, 0x2a1a14, [0, k * 0.22, 0.01], null, FW);
      for (let k = 1; k < 4; k++) c.box(0.015, top - FLY - 0.4, 0.06, 0x2a1a14, [-BW * 0.165 + k * BW * 0.083, (top - FLY - 0.35) / 2 + 0.05, 0.01], null, FWY);
    });
    // beams
    ctx.box(BW + 0.4, 0.2, 0.2, VER, [0, top - 0.1, BD / 2 - 0.1], null, LAQ);
    ctx.box(BW + 0.4, 0.2, 0.2, VER, [0, top - 0.1, -BD / 2 - 0.1], null, LAQ);
    ctx.box(BW + 0.4, 0.14, 0.14, VER, [0, FLY + 0.15, BD / 2 - 0.1], null, LAQ);
    // central lattice doors: left fully open (folded inward), right half open
    const doorH = top - FLY - 0.35, doorW = BW * 0.33 / 2 - 0.02;
    const lattice = (c) => {
      c.box(doorW, doorH, 0.04, 0x3a2418, [0, doorH / 2, 0], null, FW, null);
      for (let k = 1; k < 10; k++) c.box(doorW, 0.014, 0.05, 0x5a3a26, [0, k * doorH / 10, 0], null, FW);
      for (let k = 1; k < 5; k++) c.box(0.014, doorH, 0.05, 0x5a3a26, [-doorW / 2 + k * doorW / 5, doorH / 2, 0], null, FWY);
      c.box(doorW * 0.86, doorH * 0.92, 0.01, 0x241812, [0, doorH / 2, -0.015], null, FW);
    };
    lattice(ctx.at([-doorW - 0.02 + 0.06, FLY + 0.05, BD / 2 - 0.15 - 0.36], [0, -Math.PI / 2 + 0.25, 0]).at([doorW / 2, 0, 0]));
    lattice(ctx.at([doorW + 0.02, FLY + 0.05, BD / 2 - 0.15], [0, 0.55, 0]).at([doorW / 2 - doorW, 0, 0]));
    // interior: dark back, altar steps, mirror, gohei, offerings
    ctx.box(BW - 0.2, doorH, 0.02, 0x2a1c16, [0, FLY + doorH / 2, -BD / 2 + 0.0], null, FW);
    ctx.box(BW - 0.2, 0.02, BD - 0.2, 0x5a3a26, [0, FLY + 0.06, -0.1], null, FW);
    const alt = ctx.at([0, FLY + 0.07, -BD / 2 + 0.55]);
    alt.box(1.4, 0.3, 0.6, 0x5a3a28, [0, 0.15, 0], null, FW);
    alt.box(1.0, 0.25, 0.4, 0x6a4430, [0, 0.42, -0.1], null, FW);
    // mirror on stand
    alt.add(W.g.cyl(0.24, 0.24, 0.03, 32), 0xdde6ea, [0, 1.0, -0.16], [Math.PI / 2, 0, 0], 1, [0.35, 0, 0, 12.0]);
    alt.add(W.g.torus(0.24, 0.025, 6, 32), 0xc9a24a, [0, 1.0, -0.16], null, 1, [0, 0, 0, 9.0]);
    alt.box(0.08, 0.5, 0.06, 0x6a4430, [0, 0.75, -0.18], null, FWY);
    alt.box(0.5, 0.05, 0.2, 0x6a4430, [0, 0.55, -0.18], null, FW);
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; alt.add(W.g.cyl(0.02, 0.0, 0.12, 4), 0xe8c050, [Math.cos(a) * 0.32, 1.0 + Math.sin(a) * 0.32, -0.17], [Math.PI / 2, 0, -a + Math.PI / 2], 1, [0.3, 0, 0, 9.0]); }
    // gohei
    [-0.5, 0.5].forEach((x) => {
      alt.add(W.g.cyl(0.012, 0.012, 0.8, 5), 0xd8c08a, [x, 0.7, -0.05], null, 1);
      alt.add(W.g.cyl(0.06, 0.07, 0.05, 8), 0x2a1c16, [x, 0.33, -0.05], null, 1);
      W.shide(new W.Ctx(alt.b), alt.worldPos([x - 0.05, 1.05, -0.05]), 0.35, 0, 0.0);
      W.shide(new W.Ctx(alt.b), alt.worldPos([x + 0.05, 1.05, -0.05]), 0.35, 0, 0.0);
    });
    // offerings on sanbo stands
    [[-0.38, 'rice'], [0.0, 'sake'], [0.38, 'fruit']].forEach(([x, k]) => {
      const sp = alt.at([x, 0.3, 0.2]);
      sp.box(0.22, 0.1, 0.22, 0xd8c08a, [0, 0.05, 0], null, FW);
      sp.box(0.26, 0.02, 0.26, 0xd8c08a, [0, 0.11, 0], null, FW);
      if (k === 'rice') sp.add(W.g.sph(1, 10), 0xf6f2ea, [0, 0.15, 0], null, [0.08, 0.05, 0.08]);
      if (k === 'sake') [-0.06, 0.06].forEach((xx) => { sp.add(W.g.lathe([[0, 0], [0.04, 0], [0.045, 0.1], [0.02, 0.16], [0.012, 0.2], [0, 0.2]], 12, 'heishi'), 0xf6f2ea, [xx, 0.12, 0], null, 1, [0, 0, 0, 6.0]); sp.add(W.g.leaf('narrow'), 0x2a5a2a, [xx, 0.33, 0], [-1.2, 0, 0], [0.04, 1, 0.12]); });
      if (k === 'fruit') { sp.add(W.g.sph(1, 10), 0xf08a1a, [-0.04, 0.16, 0], null, 0.05); sp.add(W.g.sph(1, 10), 0xd8401e, [0.05, 0.16, 0.02], null, 0.05); sp.add(W.g.sph(1, 10), 0xe8c040, [0.0, 0.21, -0.02], null, 0.045); }
    });
    // steps up to veranda
    for (let k = 0; k < 5; k++) ctx.box(1.6, 0.06, 0.28, 0x7a5638, [0, 0.45 + k * 0.13, BD / 2 + 0.95 - k * 0.25], null, FW);
    [-0.82, 0.82].forEach((x) => ctx.box(0.08, 0.8, 1.4, 0x5a3a28, [x, 0.55 + 0.1, BD / 2 + 0.55], [0.45, 0, 0], FW));
    // roof: nagare style, curved
    const ridgeY = top + 1.75, ridgeZ = -0.5;
    const roofSurf = (z0, z1, y0, y1, concave, wpad) => {
      const nx = 24, nz = 16, w = BW + 2.0 + (wpad || 0);
      const pos = [], idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const t = j / nz;
        const x = (i / nx - 0.5) * w;
        const z = W.lerp(z0, z1, t);
        let y = W.lerp(y0, y1, t) - Math.sin(t * Math.PI) * concave;
        y += Math.pow(Math.abs(x) / (w / 2), 3) * 0.12 * t;
        pos.push(x, y, z);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      ctx.add(g, 0x5a9a86, null, null, 1, [0, 0, 0, 6.0], null, (lx, ly, lz) => C(0x5a9a86).clone().multiplyScalar(Math.abs(Math.sin(lx * 9)) > 0.93 ? 0.78 : 0.95 + 0.1 * W.noise2(lx * 2, lz * 2)));
      // underside thickness (fascia) at low edge
      const yEnd = y1, zEnd = z1;
      ctx.box(w, 0.16, 0.1, 0x3a2a20, [0, yEnd - 0.08, zEnd], null, FW);
      return { z0, z1, y0, y1 };
    };
    roofSurf(ridgeZ, BD / 2 + 2.0, ridgeY, top - 0.05, 0.45);
    roofSurf(ridgeZ, -BD / 2 - 0.9, ridgeY, top + 0.15, 0.25);
    // ceiling boards under front roof
    ctx.box(BW + 1.6, 0.04, 2.2, 0x6a4a30, [0, top + 0.05, BD / 2 + 0.6], [0.32, 0, 0], FW);
    // ridge + chigi + katsuogi
    ctx.add(W.g.cyl(0.13, 0.13, BW + 2.1, 12), 0x3e7a68, [0, ridgeY + 0.08, ridgeZ], [0, 0, Math.PI / 2], 1, [0, 0, 0, 6.0]);
    [-1, 1].forEach((s) => {
      const c = ctx.at([s * (BW / 2 + 0.95), ridgeY + 0.1, ridgeZ]);
      c.box(0.08, 1.2, 0.14, 0x3a2a20, [0, 0.35, -0.25], [0.55, 0, 0], FW);
      c.box(0.08, 1.2, 0.14, 0x3a2a20, [0, 0.35, 0.25], [-0.55, 0, 0], FW);
      c.box(0.09, 0.12, 0.16, 0xc9a24a, [0, 0.86, -0.53], [0.55, 0, 0], [0, 0, 0, 9.0]);
      c.box(0.09, 0.12, 0.16, 0xc9a24a, [0, 0.86, 0.53], [-0.55, 0, 0], [0, 0, 0, 9.0]);
    });
    [-0.9, -0.3, 0.3, 0.9].forEach((x) => { ctx.add(W.g.cyl(0.08, 0.08, 0.6, 10), 0x3a2a20, [x, ridgeY + 0.28, ridgeZ], [Math.PI / 2, 0, 0], 1, FW); ctx.add(W.g.cyl(0.082, 0.082, 0.05, 10), 0xc9a24a, [x, ridgeY + 0.28, ridgeZ + 0.3], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]); ctx.add(W.g.cyl(0.082, 0.082, 0.05, 10), 0xc9a24a, [x, ridgeY + 0.28, ridgeZ - 0.3], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 9.0]); });
    // gable boards (hafu, vermilion)
    [-1, 1].forEach((s) => {
      const x = s * (BW / 2 + 1.0);
      const pts1 = [new V3(x, ridgeY, ridgeZ), new V3(x, ridgeY - 0.65, ridgeZ + 1.2), new V3(x, top + 0.15, BD / 2 + 2.0)];
      ctx.add(W.g.tube(pts1, 0.06, 0.06, 4, 12), VER, null, null, undefined, LAQ);
      const pts2 = [new V3(x, ridgeY, ridgeZ), new V3(x, ridgeY - 0.5, ridgeZ - 0.9), new V3(x, top + 0.3, -BD / 2 - 0.9)];
      ctx.add(W.g.tube(pts2, 0.06, 0.06, 4, 10), VER, null, null, undefined, LAQ);
      const sh = new THREE.Shape(); sh.moveTo(-BD / 2 - 0.1, top - 0.1); sh.lineTo(BD / 2 - 0.1, top - 0.1); sh.lineTo(ridgeZ, ridgeY - 0.15); sh.closePath();
      const geo = new THREE.ShapeGeometry(sh); geo.rotateY(-Math.PI / 2);
      ctx.add(geo, WHITE, [s * BW / 2, 0, 0], null, 1, [0, 0, 0, 0]);
    });
    // front: hanging beam, big shimenawa, bell with rope, offertory box
    const fb = ctx.at([0, top - 0.15, BD / 2 + 1.0]);
    [-1, 1].forEach((s) => ctx.add(W.g.cyl(0.09, 0.09, top - 0.15 - 0.45, 10), VER, [s * (BW / 2 + 0.25), (top - 0.15 + 0.45) / 2, BD / 2 + 1.5], null, 1, LAQ));
    ctx.box(BW + 0.9, 0.18, 0.16, VER, [0, top - 0.12, BD / 2 + 1.5], null, LAQ);
    const sub = new W.Ctx(B);
    const a = ctx.worldPos([-BW / 2 - 0.1, top - 0.32, BD / 2 + 1.55]), b = ctx.worldPos([BW / 2 + 0.1, top - 0.32, BD / 2 + 1.55]);
    const pts = W.shimenawa(sub, a, b, 0.16, 0.32, [0.3, 0.5, 0.7]);
    [0.15, 0.38, 0.62, 0.85].forEach((t) => { const p = pts[Math.round(t * 12)]; W.shide(sub, [p.x, p.y - 0.12, p.z + 0.1], 0.6, 0, 0.35); });
    const bellTop = ctx.worldPos([0, top - 0.2, BD / 2 + 1.42]);
    const bell = W.part('bell', bellTop);
    bell.ctx.add(W.g.cyl(0.01, 0.01, 0.25, 4), 0x8a6a3a, [0, -0.12, 0], null, 1);
    bell.ctx.add(W.g.sph(1, 16), 0xd8b050, [0, -0.36, 0], null, [0.17, 0.15, 0.17], [0, 0, 0, 9.0]);
    bell.ctx.box(0.25, 0.02, 0.03, 0x5a4020, [0, -0.42, 0.15], null, [0, 0, 0, 9.0]);
    const ropeTop = -0.5, ropeLen = 2.2;
    for (let k = 0; k < 3; k++) {
      const col = [0xd8281e, 0xf4f0e6, 0x6a3a9a][k];
      const pts2 = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts2.push(new V3(Math.sin(t * 14 + k * 2.1) * 0.035, ropeTop - t * ropeLen, Math.cos(t * 14 + k * 2.1) * 0.035)); }
      bell.ctx.add(W.g.tube(pts2, 0.03, 0.03, 5, 32), col, null, null, undefined, [0, 0, 0, 0]);
    }
    bell.ctx.add(W.g.cone(0.07, 0.25, 10), 0xd8281e, [0, ropeTop - ropeLen - 0.1, 0], [Math.PI, 0, 0], 1);
    bell.swing = 0.04; bell.phase = 0.7;
    W.hangers.push(bell);
    // offertory box
    const sb = ctx.at([0, 0.45, BD / 2 + 1.55 + 0.6]);
    sb.box(1.1, 0.55, 0.55, 0x6a4026, [0, 0.27, 0], null, FW);
    for (let k = 0; k < 6; k++) sb.box(1.0, 0.04, 0.05, 0x4a2a18, [0, 0.56, -0.2 + k * 0.08], [0.5, 0, 0], FW);
    sb.box(1.14, 0.05, 0.58, 0x2a1a14, [0, 0.03, 0], null, FW);
    sb.box(0.5, 0.12, 0.01, 0xd8b050, [0, 0.3, 0.28], null, [0, 0, 0, 9.0]);
    W.shrineFront = ctx.worldPos([0, FLY + 1.0, BD / 2]);
    W.shrineInside = ctx.worldPos([0, FLY + 1.0, -BD / 2 + 0.6]);
  }

  // ---------- komainu ----------
  function komainu(ctx, x, z, ry, open) {
    const y = TY;
    const c = ctx.at([x, y, z], [0, ry, 0]);
    const R = W.rng(open ? 351 : 352);
    const sc = 0xa29c8e;
    c.add(W.g.soft(0.75, 0.55, 0.75, 0.05, 2), 0x948e80, [0, 0.27, 0], null, 1, ST);
    c.add(W.g.soft(0.62, 0.12, 0.62, 0.03, 2), 0x9a9486, [0, 0.6, 0], null, 1, ST);
    const k = c.at([0, 0.66, 0]);
    k.add(W.g.blob(1, 2, 0.08, open ? 31 : 32), sc, [0, 0.42, -0.05], [0.25, 0, 0], [0.24, 0.36, 0.22], ST);
    k.add(W.g.blob(1, 2, 0.1, open ? 33 : 34), sc, [0, 0.16, -0.14], null, [0.26, 0.18, 0.28], ST);
    k.add(W.g.cyl(0.07, 0.08, 0.42, 8), sc, [-0.12, 0.2, 0.12], null, 1, ST);
    k.add(W.g.cyl(0.07, 0.08, 0.42, 8), sc, [0.12, 0.2, 0.12], null, 1, ST);
    k.add(W.g.sph(1, 8), sc, [-0.12, 0.03, 0.17], null, [0.08, 0.05, 0.1], ST);
    k.add(W.g.sph(1, 8), sc, [0.12, 0.03, 0.17], null, [0.08, 0.05, 0.1], ST);
    // head with mane
    const h = k.at([0, 0.78, 0.06]);
    h.add(W.g.blob(1, 2, 0.1, open ? 35 : 36), sc, [0, 0, 0], null, [0.2, 0.18, 0.2], ST);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; h.add(W.g.sph(1, 6), sc, [Math.cos(a) * 0.2, Math.sin(a) * 0.17 + 0.02, -0.08], null, 0.07, ST); }
    h.add(W.g.sph(1, 8), sc, [0, -0.05, 0.16], null, [0.11, 0.08, 0.08], ST);
    h.add(W.g.sph(1, 6), 0x2a2622, [-0.07, 0.04, 0.17], null, 0.025, ST);
    h.add(W.g.sph(1, 6), 0x2a2622, [0.07, 0.04, 0.17], null, 0.025, ST);
    if (open) h.box(0.12, 0.04, 0.05, 0x3a2a26, [0, -0.1, 0.2], null, ST);
    h.add(W.g.cone(0.05, 0.1, 6), sc, [-0.13, 0.17, 0.0], [0, 0, 0.4], 1, ST);
    h.add(W.g.cone(0.05, 0.1, 6), sc, [0.13, 0.17, 0.0], [0, 0, -0.4], 1, ST);
    // tail curls
    for (let i = 0; i < 4; i++) k.add(W.g.sph(1, 6), sc, [(i - 1.5) * 0.08, 0.35 + i * 0.05, -0.32], null, 0.07, ST);
    // moss at feet
    for (let i = 0; i < 6; i++) { const a = R() * 6.28; c.add(W.g.blob(1, 1, 0.3, 360 + i), W.jit(0x5d7d2a, 0.4, R), [Math.cos(a) * 0.38, 0.03 + R() * 0.1, Math.sin(a) * 0.38], null, [0.16, 0.06, 0.14], [0, 0, 0, 4.0]); }
    return c.worldPos([0, 1.6, 0.1]);
  }

  // ---------- ema rack ----------
  function emaRack(B) {
    const ctx = new W.Ctx(B).at([6.85, TY, -10.2], [0, 0.55, 0]);
    const R = W.rng(361);
    const w = 2.0, h = 1.9;
    [-1, 1].forEach((s) => ctx.box(0.1, h, 0.1, 0x6a4a30, [s * w / 2, h / 2, 0], null, FWY));
    ctx.add(W.g.box(w + 0.6, 0.06, 0.6), 0x5a9a86, [0, h + 0.14, 0], [0, 0, 0], 1, [0, 0, 0, 6.0]);
    ctx.add(W.g.cyl(0.04, 0.04, w + 0.6, 8), 0x4a8a76, [0, h + 0.2, 0], [0, 0, Math.PI / 2], 1);
    ctx.box(w + 0.5, 0.05, 0.55, 0x3a2a20, [0, h + 0.08, 0], null, FW);
    W.emaList = [];
    [0.75, 1.15, 1.55].forEach((ry, row) => {
      ctx.box(w, 0.05, 0.05, 0x6a4a30, [0, ry, 0], null, FW);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.12 + i * (w - 0.24) / (n - 1) + R.range(-0.03, 0.03);
        const side = (i + row) % 2 ? 1 : -1;
        const sh = new THREE.Shape(); sh.moveTo(-0.09, -0.13); sh.lineTo(0.09, -0.13); sh.lineTo(0.09, 0.02); sh.lineTo(0, 0.07); sh.lineTo(-0.09, 0.02); sh.closePath();
        const geo = W.g.extrude(sh, 0.012, 0, 'ema');
        // uv: remap ema shape uv from xy
        const reg = W.atlas.get('ema' + ((i + row * 2) % 6));
        const uvA = geo.attributes.uv; const P = geo.attributes.position;
        for (let q = 0; q < uvA.count; q++) uvA.setXY(q, (P.getX(q) + 0.09) / 0.18, (P.getY(q) + 0.13) / 0.2);
        const pos = [x, ry - 0.07, side * 0.04];
        const rot = [R.range(-0.08, 0.08), side < 0 ? Math.PI : 0, R.range(-0.12, 0.12)];
        ctx.add(geo, 0xffffff, pos, rot, 1, (lx, ly) => [0, 0.05 + Math.max(0, 0.05 - ly) * 1.6, 0, 0], reg);
        ctx.add(W.g.cyl(0.003, 0.003, 0.08, 3), 0xd8281e, [x, ry - 0.0, side * 0.04], null, 1);
        W.emaList.push(ctx.worldPos(pos));
      }
    });
    W.emaRackPos = ctx.worldPos([0, 1.2, 0]);
  }

  // ---------- omikuji ----------
  function omikuji(B) {
    const ctx = new W.Ctx(B).at([14.3, TY, -8.3], [0, -1.25, 0]);
    const R = W.rng(371);
    const w = 1.6;
    [-1, 1].forEach((s) => ctx.box(0.08, 1.6, 0.08, 0x6a4a30, [s * w / 2, 0.8, 0], null, FWY));
    [0.75, 1.05, 1.35].forEach((y) => {
      ctx.add(W.g.cyl(0.006, 0.006, w, 4), 0xd8d0b8, [0, y, 0], [0, 0, Math.PI / 2], 1);
      for (let i = 0; i < 16; i++) {
        const x = -w / 2 + 0.06 + i * (w - 0.12) / 15 + R.range(-0.02, 0.02);
        ctx.add(W.g.box(0.025, 0.06, 0.018), WHITE, [x, y, 0], [0, 0, R.range(-0.3, 0.3)], 1, [0, 0.1, 0, 7.0]);
        ctx.add(W.g.box(0.02, 0.07, 0.004), WHITE, [x + 0.01, y - 0.06, 0], [0, 0, R.range(-0.2, 0.2)], 1, (lx, ly) => [0, 0.12 + Math.max(0, -ly) * 2, 0, 7.0]);
      }
    });
    W.omikujiPos = ctx.worldPos([0, 1.1, 0]);
  }

  // ---------- sake barrels ----------
  function sakeBarrels(B) {
    const ctx = new W.Ctx(B).at([6.25, TY, -13.3], [0, Math.PI, 0]);
    const tiers = [[0.0, 5, 0.0], [0.62, 4, -0.38], [1.24, 3, -0.76]];
    // tiered rack
    tiers.forEach((t, i) => ctx.box(1.0 - i * 0.0, 0.08, 3.1, 0x6a4a30, [-0.0 + i * 0.32 + 0.1, t[0] + 0.02, 0], null, FW));
    ctx.box(0.08, 1.3, 3.1, 0x5a3a28, [0.62, 0.65, 0], null, FW);
    tiers.forEach((t, i) => {
      for (let k = 0; k < t[1]; k++) {
        const z = (k - (t[1] - 1) / 2) * 0.6;
        const c = ctx.at([i * 0.32 + 0.05, t[0] + 0.06, z]);
        const reg = W.atlas.get('sake' + ((k + i) % 4));
        c.add(W.g.cyl(0.28, 0.27, 0.56, 22), 0xffffff, [0, 0.28, 0], [0, Math.PI / 2, 0], 1, [0, 0, 0, 0], reg);
        c.add(W.g.cyl(0.24, 0.24, 0.02, 18), 0xc8a068, [0, 0.565, 0], null, 1, FW);
        c.add(W.g.torus(0.28, 0.015, 5, 22), 0x3a3030, [0, 0.52, 0], [Math.PI / 2, 0, 0], 1);
        c.add(W.g.torus(0.275, 0.015, 5, 22), 0x3a3030, [0, 0.06, 0], [Math.PI / 2, 0, 0], 1);
        // rope cross on top
        c.box(0.5, 0.02, 0.03, 0xd8c890, [0, 0.58, 0], [0, 0.6, 0]);
        c.box(0.5, 0.02, 0.03, 0xd8c890, [0, 0.58, 0], [0, -0.6, 0]);
      }
    });
    // small roof over barrels
    ctx.box(1.7, 0.06, 3.4, 0x5a9a86, [0.25, 2.25, 0], [0, 0, -0.35], [0, 0, 0, 6.0]);
    [-1.55, 1.55].forEach((z) => { ctx.box(0.08, 2.2, 0.08, 0x6a4a30, [-0.45, 1.1, z], null, FWY); ctx.box(0.08, 2.0, 0.08, 0x6a4a30, [0.85, 1.0, z], null, FWY); });
    W.sakePos = ctx.worldPos([0, 0.8, 0]);
  }

  // ---------- inari ----------
  function inari(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(381);
    const path = new THREE.CatmullRomCurve3([new V3(13.0, TY, -9.3), new V3(13.9, TY, -10.1), new V3(14.5, TY, -11.3), new V3(14.65, TY, -12.6), new V3(14.6, TY, -13.2)]);
    W.inariPath = path;
    // path stones
    for (let i = 0; i <= 16; i++) { const p = path.getPointAt(i / 16); ctx.add(W.g.blob(1, 1, 0.12, 900 + i), W.jit(0xa8a090, 0.3, R), [p.x, TY + 0.03, p.z], [0, R() * 6, 0], [0.3, 0.06, 0.26], ST); }
    // row of small torii
    const n = 7;
    W.smallTorii = [];
    for (let i = 0; i < n; i++) {
      const t = 0.2 + i / (n - 1) * 0.78;
      const p = path.getPointAt(t), tg = path.getTangentAt(t);
      const ry = Math.atan2(tg.x, tg.z);
      const c = ctx.at([p.x, TY, p.z], [0, ry, 0]);
      const h = 1.85 - i * 0.02, sp = 1.0;
      [-1, 1].forEach((s) => { c.add(W.g.cyl(0.05, 0.055, h, 10), VER, [s * sp / 2, h / 2, 0], null, 1, LAQ); c.add(W.g.cyl(0.065, 0.065, 0.18, 10), BLK, [s * sp / 2, 0.09, 0], null, 1); });
      c.box(sp + 0.36, 0.08, 0.1, VER, [0, h - 0.02, 0], null, LAQ);
      c.box(sp + 0.44, 0.05, 0.12, BLK, [0, h + 0.04, 0], null, [0, 0, 0, 10.0]);
      c.box(sp + 0.16, 0.06, 0.06, VER, [0, h - 0.3, 0], null, LAQ);
      W.smallTorii.push({ p: p.clone(), ry });
      // red flags alternate sides
      if (i % 2 === 0 && i < n - 1) {
        [-1, 1].forEach((s) => {
          const fp = c.worldPos([s * 0.85, 0, 0.25]);
          const fy = TY;
          ctx.add(W.g.cyl(0.015, 0.015, 1.7, 5), 0x7a6a50, [fp.x, fy + 0.85, fp.z], null, 1);
          ctx.add(W.g.cyl(0.006, 0.006, 0.3, 4), 0x7a6a50, [fp.x, fy + 1.62, fp.z], [0, ry, Math.PI / 2], 1);
          const fl = new THREE.PlaneGeometry(0.24, 1.0, 1, 6);
          ctx.add(fl, 0xffffff, [fp.x + Math.cos(ry) * 0.13 * 0, fy + 1.1, fp.z], [0, ry + Math.PI / 2, 0], 1, (lx, ly) => [0, 0.08 + (0.5 - ly) * 0.15 + 0.05, 0, 7.0], W.atlas.get('flag'));
          (W.inariFlags = W.inariFlags || []).push(new V3(fp.x, fy + 1.1, fp.z));
        });
      }
    }
    // hokora
    const hp = new V3(14.5, TY, -14.55);
    const hr = 0.0;
    const h = ctx.at([hp.x, TY, hp.z], [0, hr, 0]);
    h.add(W.g.soft(1.7, 0.4, 1.5, 0.04, 2), 0x9a9486, [0, 0.2, 0], null, 1, ST);
    h.box(1.0, 0.08, 0.9, 0x6a4a30, [0, 0.62, -0.1], null, FW);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => h.add(W.g.cyl(0.04, 0.04, 0.9, 8), VER, [a * 0.42, 0.62 + 0.45, b * 0.32 - 0.1], null, 1, LAQ));
    h.box(0.84, 0.8, 0.6, WHITE, [0, 1.06, -0.12], null, [0, 0, 0, 0]);
    h.box(0.5, 0.6, 0.02, 0x5a3a26, [0, 1.0, 0.2], null, FW);
    for (let k = 1; k < 6; k++) h.box(0.5, 0.012, 0.03, 0x2a1a14, [0, 0.7 + k * 0.1, 0.21], null, FW);
    [-1, 1].forEach((s) => h.add(W.g.box(1.3, 0.05, 0.75), 0x5a9a86, [0, 1.72, s * 0.3 - 0.1], [s * 0.6, 0, 0], 1, [0, 0, 0, 6.0]));
    h.add(W.g.cyl(0.05, 0.05, 1.32, 8), 0x4a8a76, [0, 1.92, -0.1], [0, 0, Math.PI / 2], 1);
    // steps with white fox figurines
    for (let k = 0; k < 3; k++) h.box(1.3, 0.12, 0.25, 0xa8a094, [0, 0.06 + k * 0.12, 0.85 - k * 0.22], null, ST);
    W.foxFigs = [];
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 7; i++) {
        const x = -0.55 + i * 0.18 + R.range(-0.02, 0.02);
        const fz = 0.85 - k * 0.22 + R.range(-0.04, 0.04);
        const fy = 0.12 + k * 0.12;
        const f = h.at([x, fy, fz], [0, R.range(-0.4, 0.4), 0], R.range(0.8, 1.1));
        f.add(W.g.cone(0.03, 0.1, 8), 0xf6f2ea, [0, 0.05, 0], null, 1, [0, 0, 0, 6.0]);
        f.add(W.g.sph(1, 8), 0xf6f2ea, [0, 0.11, 0.01], null, [0.025, 0.025, 0.03], [0, 0, 0, 6.0]);
        f.add(W.g.cone(0.008, 0.025, 4), 0xf6f2ea, [-0.012, 0.135, 0.0], null, 1);
        f.add(W.g.cone(0.008, 0.025, 4), 0xf6f2ea, [0.012, 0.135, 0.0], null, 1);
        f.add(W.g.box(0.03, 0.012, 0.01), 0xd8281e, [0, 0.085, 0.025]);
        if ((i + k) % 3 === 0) { h.add(W.g.cyl(0.02, 0.015, 0.02, 8), 0xf6f2ea, [x + 0.09, fy + 0.01, fz + 0.03], null, 1, [0, 0, 0, 6.0]); }
      }
    }
    // offerings (inari sushi, sake cups)
    h.add(W.g.cyl(0.08, 0.07, 0.02, 12), 0xf6f2ea, [-0.2, 0.72, 0.15], null, 1);
    h.add(W.g.soft(0.06, 0.03, 0.04, 0.015, 2), 0xc8843a, [-0.2, 0.745, 0.15], null, 1);
    h.add(W.g.soft(0.06, 0.03, 0.04, 0.015, 2), 0xc8843a, [-0.17, 0.745, 0.17], null, 1);
    // fox statues with red bibs
    [-1, 1].forEach((s) => {
      const f = h.at([s * 0.85, 0.4, 0.55], [0, -s * 0.35, 0]);
      f.box(0.36, 0.5, 0.36, 0x9a9486, [0, 0.25, 0], null, ST);
      const k = f.at([0, 0.5, 0]);
      k.add(W.g.cone(0.13, 0.5, 10), 0xb8b2a4, [0, 0.25, 0], null, 1, ST);
      k.add(W.g.sph(1, 10), 0xb8b2a4, [0, 0.55, 0.04], null, [0.09, 0.09, 0.1], ST);
      k.add(W.g.cone(0.04, 0.15, 6), 0xb8b2a4, [0, 0.55, 0.15], [Math.PI / 2, 0, 0], 1, ST);
      k.add(W.g.cone(0.03, 0.12, 5), 0xb8b2a4, [-0.05, 0.68, 0.02], null, 1, ST);
      k.add(W.g.cone(0.03, 0.12, 5), 0xb8b2a4, [0.05, 0.68, 0.02], null, 1, ST);
      k.add(W.g.tube([new V3(0, 0.1, -0.1), new V3(s * 0.1, 0.3, -0.2), new V3(s * 0.05, 0.55, -0.18)], 0.07, 0.03, 6, 6), 0xb8b2a4, null, null, undefined, ST);
      k.add(W.g.cone(0.13, 0.16, 10, true), 0xd8281e, [0, 0.38, 0.04], [Math.PI, 0, 0], [1, 1, 0.9], [0, 0.05, 0, 0]);
      k.add(W.g.sph(1, 6), 0xc8a050, [0, 0.42, 0.14], null, 0.025, [0, 0, 0, 9.0]);
    });
    W.inariHokora = new V3(hp.x, TY + 1.0, hp.z);
    W.foxSpot = W.smallTorii[W.smallTorii.length - 1];
  }

  // ---------- ginkgo props & stone hokora ----------
  function ginkgoProps(B) {
    const G = L.GINKGO;
    const ctx = new W.Ctx(B);
    const R = W.rng(391);
    // shimenawa around trunk
    const ty = TY + 1.6, r = 1.0;
    const ring = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; ring.push(new V3(G.x + Math.cos(a) * r, ty + Math.sin(a * 2) * 0.03, G.z + Math.sin(a) * r)); }
    ctx.add(W.g.tube(ring, 0.09, 0.09, 8, 60, true), 0xd8c88a, null, null, undefined, [0, 0, 0, 0], null, (lx, ly, lz, wv) => C(0xd8c88a).clone().multiplyScalar(Math.sin(Math.atan2(wv.z - G.z, wv.x - G.x) * 40) > 0 ? 1 : 0.82));
    for (let i = 0; i < 6; i++) { const a = -0.3 + i * 0.55; W.shide(ctx, [G.x + Math.cos(a) * (r + 0.05), ty - 0.05, G.z + Math.sin(a) * (r + 0.05)], 0.45, -a + Math.PI / 2, 0.3); }
    // sign
    const sg = ctx.at([G.x + 1.7, TY, G.z + 0.95], [0, 0.4, 0]);
    sg.box(0.06, 1.1, 0.06, 0x6a4a30, [0, 0.55, 0], null, FWY);
    sg.box(0.26, 0.5, 0.03, 0xffffff, [0, 1.0, 0.04], null, [0, 0, 0, 0], W.atlas.get('kanban'));
    // stone hokora at roots
    const sh = ctx.at([G.x + 1.5, TY, G.z - 2.3], [0, 0.4, 0]);
    sh.add(W.g.soft(0.6, 0.18, 0.5, 0.03, 2), 0x8e887c, [0, 0.09, 0], null, 1, ST);
    sh.add(W.g.soft(0.42, 0.42, 0.36, 0.03, 2), 0x9a9486, [0, 0.39, 0], null, 1, ST);
    sh.box(0.2, 0.22, 0.05, 0x3a3630, [0, 0.38, 0.17], null, ST);
    sh.add(W.g.cyl(0.04, 0.42, 0.22, 4), 0x948e80, [0, 0.7, 0], [0, Math.PI / 4, 0], 1, ST);
    sh.add(W.g.cyl(0.03, 0.02, 0.05, 6), 0xf6f2ea, [0.12, 0.2, 0.22], null, 1);
    sh.add(W.g.sph(1, 6), 0xf08a1a, [-0.12, 0.21, 0.22], null, 0.035);
    for (let i = 0; i < 5; i++) sh.add(W.g.leaf('ginkgo'), 0xf0b820, [R.range(-0.2, 0.2), 0.82, R.range(-0.2, 0.2)], [0.4, R() * 6, 0], 0.11, [0, 0, 0, 8.0]);
    W.stoneHokora = sh.worldPos([0, 0.4, 0]);
  }

  // ginkgo roots over ishigaki and in section
  function ginkgoRoots(B) {
    const G = L.GINKGO;
    const ctx = new W.Ctx(B);
    const R = W.rng(401);
    const bark = C(0x5d4a3a);
    const root = (pts, r0, r1) => ctx.add(W.g.tube(pts, (t) => W.lerp(r0, r1, t), 0, 7, pts.length * 4), bark, null, null, undefined, [0, 0, 0, 17.0]);
    // surface roots radiating on terrace
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + R() * 0.3;
      const len = R.range(1.5, 3.0);
      const p0 = new V3(G.x + Math.cos(a) * 0.7, TY + 0.25, G.z + Math.sin(a) * 0.7);
      const p1 = new V3(G.x + Math.cos(a) * (0.7 + len * 0.5), TY + 0.06, G.z + Math.sin(a) * (0.7 + len * 0.5));
      const p2 = new V3(G.x + Math.cos(a + 0.2) * (0.7 + len), TY - 0.02, G.z + Math.sin(a + 0.2) * (0.7 + len));
      root([p0, p1, p2], 0.28, 0.05);
    }
    // roots spilling over ishigaki front & left faces
    const fz = L.TERR_Z - 0.05, lx = L.TERR_X - 0.05;
    const spill = [[G.x - 0.9, fz, 'f'], [G.x + 0.25, fz, 'f'], [G.x + 1.35, fz, 'f'], [lx, G.z + 0.7, 'l'], [lx, G.z - 0.6, 'l'], [lx, G.z - 1.9, 'l']];
    // the ishigaki leans back (batter 0.16 from y0=-0.25): keep roots hugging the battered face
    const onFace = (s, y, lat) => { const f = s[2] === 'f'; const p = new V3(s[0], y, s[1]).addScaledVector(f ? new V3(0, 0, 1) : new V3(-1, 0, 0), 0.16 - (y + 0.25) * 0.16); if (f) p.x += lat; else p.z += lat; return p; };
    spill.forEach((s) => {
      const start = new V3(G.x, TY + 0.2, G.z).lerp(new V3(s[0], TY, s[1]), 0.35);
      const edge = onFace(s, TY + 0.14, 0).addScaledVector(s[2] === 'f' ? new V3(0, 0, 1) : new V3(-1, 0, 0), 0.06);
      const y1 = TY - 0.8 - R() * 0.4, y2 = y1 - 0.9 - R() * 0.8;
      const l1 = R.range(-0.3, 0.3), l2 = l1 + R.range(-0.4, 0.4);
      const down1 = onFace(s, y1, l1), down2 = onFace(s, y2, l2);
      root([start, edge, down1, down2], 0.16, 0.035);
      if (R() < 0.7) root([down1, onFace(s, y1 - 0.3, l1 + 0.4)], 0.05, 0.015);
    });
    // roots in back section (z=-16) & terrace soil
    for (let k = 0; k < 5; k++) {
      const x = R.range(L.TERR_X + 0.4, G.x + 4.5), y = R.range(0.8, 2.6);
      root([new V3(x, y, -15.85), new V3(x + R.range(-1.2, 1.2), y - R.range(0.2, 0.8), -16.02), new V3(x + R.range(-2, 2), y - R.range(0.6, 1.4), -16.0)], 0.09, 0.03);
      ctx.add(W.g.cyl(0.1, 0.1, 0.05, 10), 0xa88a62, [x + R.range(-1, 1), y - 0.5, -16.0], [Math.PI / 2, 0, 0], 1);
    }
    // thin root tips poking out of the stone joints on the left ishigaki face, near the ginkgo
    for (let k = 0; k < 4; k++) {
      const z = R.range(G.z - 3.4, G.z - 0.6), y = R.range(1.0, 2.5), x0 = L.TERR_X + (y + 0.25) * 0.16 - 0.03;
      root([new V3(x0 + 0.15, y, z), new V3(x0 - 0.12, y - 0.2, z + R.range(-0.3, 0.3)), new V3(x0 - 0.16, y - R.range(0.5, 0.9), z + R.range(-0.4, 0.4))], 0.055, 0.015);
    }
  }

  W.shrine = {
    build: function () {
      const B = W.bucket('shrine');
      torii(B);
      sando(B);
      temizuya(B);
      sanctuary(B);
      const kc = new W.Ctx(B);
      W.komainuHeads = [komainu(kc, L.SANDO_X - 1.7, -7.35, 0.45, true), komainu(kc, L.SANDO_X + 1.7, -7.35, -0.45, false)];
      emaRack(B);
      omikuji(B);
      sakeBarrels(B);
      inari(B);
      ginkgoProps(B);
      ginkgoRoots(W.bucket('ginkgo'));
    },
  };
})();
