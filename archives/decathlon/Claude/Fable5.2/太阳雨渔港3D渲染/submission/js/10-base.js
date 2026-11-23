/* square base: slab, sea bed, dock body with block-built quay walls, wet quay top, wheel stops, steps, platform, slipway */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, rnd = H.brand;
  var HALF = L.HALF, QY = L.QUAY_Y, SB = L.SEABED_Y;

  // sea bed height (world) ---------------------------------------------------
  function mound(d, w, hgt) { return d < w ? hgt * H.ease(1 - d / w) : 0; }
  function distRect(x, z, x0, z0, x1, z1) {
    var dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    return Math.sqrt(dx * dx + dz * dz);
  }
  function nz(x, z) {
    return H.noise1(x * 0.31 + z * 0.17) * 0.5 + H.noise1(x * 0.13 - z * 0.41 + 7.7) * 0.5;
  }
  H.seabedY = function (x, z) {
    var h = SB + 0.15 + (nz(x, z) - 0.5) * 0.7 + (nz(x * 2.7 + 3, z * 2.7) - 0.5) * 0.22;
    var m = 0;
    m = Math.max(m, mound(L.FRONT_Z - z, 4.0, 1.5));                                    // front quay toe
    if (z > L.ARM_Z - 2) m = Math.max(m, mound(L.ARM_X - x, 3.6, 1.4));                 // arm toe
    m = Math.max(m, mound(distRect(x, z, L.BW.x0 - 2.5, L.BW.z0, L.BW.x1, L.BW.z1), 3.8, 1.9)); // breakwater rubble
    m = Math.max(m, mound(distRect(x, z, L.FBW.x0, L.FBW.z0, L.FBW.x1, L.FBW.z1), 3.4, 1.8));
    if (z < L.ARM_Z) m = Math.max(m, mound(L.HILL_X - x, 4.5, 2.2));                    // hill shore
    m = Math.max(m, mound(distRect(x, z, L.SLIP.x0, L.SLIP.zEnd + 1, L.SLIP.x1, 12), 3.5, 2.6)); // slipway foot
    m = Math.max(m, mound(distRect(x, z, L.STEPS.x0, 6.8, L.STEPS.x1, 12), 2.5, 1.6));
    m = Math.max(m, mound(distRect(x, z, L.PLAT.x0, 9.4, L.PLAT.x1, 12), 2.5, 1.2));
    m = Math.max(m, mound(distRect(x, z, -32, -32, -27, -29), 4.5, 2.0));               // corner tetrapod pile
    return h + m;
  };

  // block-built wall --------------------------------------------------------
  // axis 'x': runs along x at z = c, facing sign*z ; axis 'z': runs along z at x = c, facing sign*x
  function blockWall(B, o) {
    var rowH = o.rowH || 1.1, bl = o.blockL || 2.3, jit = o.jitter === undefined ? 0.05 : o.jitter;
    var rows = Math.max(1, Math.round((o.y1 - o.y0) / rowH)); rowH = (o.y1 - o.y0) / rows;
    var depth = 0.55, gap = 0.045, r, a;
    var tones = o.tones || [C.conc2, C.conc3, C.conc2, 0xcbd3cf, 0xd8ddd8];
    for (r = 0; r < rows; r++) {
      var y = o.y0 + r * rowH;
      var off = (r % 2) * bl * 0.5 + (rnd() - 0.5) * 0.3;
      for (a = o.a0 - off; a < o.a1; a += bl) {
        var s0 = Math.max(a, o.a0), s1 = Math.min(a + bl, o.a1), len = s1 - s0;
        if (len < 0.12) continue;
        var out = (rnd() - 0.3) * jit;
        var hex = G.jit(tones[Math.floor(rnd() * tones.length)], 0.025);
        var g = o.axis === 'x'
          ? G.box(len - gap, rowH - gap, depth, hex).translate((s0 + s1) / 2, y + rowH / 2, o.c + o.sign * (out - depth / 2))
          : G.box(depth, rowH - gap, len - gap, hex).translate(o.c + o.sign * (out - depth / 2), y + rowH / 2, (s0 + s1) / 2);
        B.add(G.fx(g, 1, 0));
      }
    }
    // dark joint backing just behind the block faces
    var bk = o.axis === 'x'
      ? G.box(o.a1 - o.a0, o.y1 - o.y0 - 0.03, 0.3, 0x9aabaa).translate((o.a0 + o.a1) / 2, (o.y0 + o.y1) / 2 - 0.015, o.c - o.sign * 0.2)
      : G.box(0.3, o.y1 - o.y0 - 0.03, o.a1 - o.a0, 0x9aabaa).translate(o.c - o.sign * 0.2, (o.y0 + o.y1) / 2 - 0.015, (o.a0 + o.a1) / 2);
    B.add(G.fx(bk, 1, 0));
  }
  H.blockWall = blockWall;

  H.buildBase = function (B) {
    var i, j, g;

    // ---------------- plinth + strata slab under the sea bed
    B.add(G.fx(G.rbox(HALF * 2 + 2.4, HALF * 2 + 2.4, 0.9, 1.0, 0x3d5560, 0.1).rotateX(Math.PI / 2).translate(0, L.SLAB_Y - 0.5, 0), 0, 0.15));
    B.add(G.box(HALF * 2 + 1.2, 0.22, HALF * 2 + 1.2, 0x567684).translate(0, L.SLAB_Y - 0.0, 0));

    // sea bed surface
    var N = 64;
    var sb = G.surf(N, N, function (u, v) {
      var x = -HALF + u * HALF * 2, z = -HALF + v * HALF * 2;
      return [x, H.seabedY(x, z), z];
    }, C.gravel);
    G.paintFn(sb, function (x, y, z) {
      var n = nz(x * 1.9 + 11, z * 1.9), n2 = nz(x * 0.6, z * 0.6 + 5);
      var hex = n2 > 0.56 ? C.sand : (n > 0.55 ? C.gravel : C.gravel2);
      if (y > SB + 1.0) hex = n > 0.5 ? C.rock : C.gravel2;
      return hex;
    });
    B.add(sb);
    // strata side faces following the sea-bed profile on all four cut faces
    var strata = [0x7b8d8e, 0x94a29c, 0xb3b49c, 0xcbc6a6];
    function sideStrip(fn, flip) {
      for (i = 0; i < N; i++) {
        var p0 = fn(i / N), p1 = fn((i + 1) / N);
        var h0 = H.seabedY(p0[0], p0[1]), h1 = H.seabedY(p1[0], p1[1]);
        var yb = L.SLAB_Y, k;
        for (k = 0; k < 4; k++) {
          var f0 = k / 4, f1 = (k + 1) / 4;
          var a = [p0[0], yb + (h0 - yb) * f0, p0[1]], b = [p1[0], yb + (h1 - yb) * f0, p1[1]];
          var c = [p1[0], yb + (h1 - yb) * f1, p1[1]], d = [p0[0], yb + (h0 - yb) * f1, p0[1]];
          B.add(G.fx(flip ? G.quad(b, a, d, c, strata[k]) : G.quad(a, b, c, d, strata[k]), 1, 0));
        }
      }
    }
    sideStrip(function (t) { return [-HALF + t * 2 * HALF, HALF]; }, false);   // front (+z)
    sideStrip(function (t) { return [-HALF + t * 2 * HALF, -HALF]; }, true);   // back
    sideStrip(function (t) { return [-HALF, -HALF + t * 2 * HALF]; }, false);  // left (-x)
    sideStrip(function (t) { return [HALF, -HALF + t * 2 * HALF]; }, true);    // right
    B.add(G.box(HALF * 2, 0.1, HALF * 2, 0x5c7175).translate(0, L.SLAB_Y + 0.05, 0));

    // gravel / stones scattered on the bed
    for (i = 0; i < 520; i++) {
      var x = -HALF + 0.6 + rnd() * (HALF * 2 - 1.2), z = -HALF + 0.6 + rnd() * (HALF * 2 - 1.2);
      if (z > L.FRONT_Z - 0.3 || (x > L.ARM_X - 0.3 && z > L.ARM_Z) || (x > L.HILL_X - 0.3 && z <= L.ARM_Z)) continue;
      var edge = Math.min(x + HALF, z + HALF);
      if (edge > 9 && rnd() < 0.55) continue;
      var s = 0.10 + rnd() * rnd() * 0.5;
      g = G.ico(s, 0, G.jit([C.gravel, C.gravel2, C.rock, 0xb5bdb4, 0x6f8280][Math.floor(rnd() * 5)], 0.05));
      g.scale(1, 0.55 + rnd() * 0.35, 0.7 + rnd() * 0.5).rotateY(rnd() * 6.28).translate(x, H.seabedY(x, z) + s * 0.25, z);
      B.add(g);
    }

    // ---------------- dock body : quay walls facing the harbour water
    var S = L.SLIP;
    blockWall(B, { axis: 'x', c: L.FRONT_Z, sign: -1, a0: -HALF, a1: S.x0, y0: SB, y1: QY });
    blockWall(B, { axis: 'x', c: L.FRONT_Z, sign: -1, a0: S.x1, a1: L.ARM_X, y0: SB, y1: QY });
    blockWall(B, { axis: 'z', c: L.ARM_X, sign: -1, a0: L.BW.z1, a1: L.FRONT_Z, y0: SB, y1: QY });
    blockWall(B, { axis: 'z', c: L.HILL_X, sign: -1, a0: -HALF, a1: L.ARM_Z, y0: SB, y1: QY + 0.6 });
    // cut faces of the dock on the base boundary (section through block courses)
    var cutTones = [0xcdd4d0, 0xc3ccc9, 0xd3d9d5, 0xbcc6c4];
    blockWall(B, { axis: 'x', c: HALF, sign: 1, a0: -HALF, a1: HALF, y0: SB, y1: QY - 0.34, jitter: 0, tones: cutTones, blockL: 2.6 });
    blockWall(B, { axis: 'z', c: HALF, sign: 1, a0: -HALF, a1: HALF, y0: SB, y1: QY - 0.34, jitter: 0, tones: cutTones, blockL: 2.6 });
    blockWall(B, { axis: 'z', c: -HALF, sign: -1, a0: L.FRONT_Z, a1: HALF, y0: SB, y1: QY - 0.34, jitter: 0, tones: cutTones, blockL: 2.6 });
    blockWall(B, { axis: 'x', c: -HALF, sign: -1, a0: L.HILL_X, a1: HALF, y0: SB, y1: QY - 0.34, jitter: 0, tones: cutTones, blockL: 2.6 });
    // concrete deck slab seen in section (top band on the cut faces)
    function capBand(x0, z0, x1, z1) {
      B.add(G.fx(G.boxMM(x0, QY - 0.34, z0, x1, QY, z1, 0xe4e8e3), 1, 0));
    }
    capBand(-HALF, HALF - 0.5, HALF, HALF + 0.02);
    capBand(HALF - 0.5, -HALF, HALF + 0.02, HALF);
    capBand(-HALF - 0.02, L.FRONT_Z, -HALF + 0.5, HALF);
    capBand(L.HILL_X, -HALF - 0.02, HALF, -HALF + 0.5);
    // thin bedding layer line under the slab
    B.add(G.box(HALF * 2 + 0.06, 0.07, 0.06, 0x8fa3a3).translate(0, QY - 0.36, HALF));
    B.add(G.box(0.06, 0.07, HALF * 2 + 0.06, 0x8fa3a3).translate(HALF, QY - 0.36, 0));
    B.add(G.box(0.06, 0.07, HALF - L.FRONT_Z, 0x8fa3a3).translate(-HALF, QY - 0.36, (HALF + L.FRONT_Z) / 2));

    // ---------------- wet quay top (ground material: puddles + reflections)
    function top(x0, z0, x1, z1) {
      var gg = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, QY, (z0 + z1) / 2);
      B.add(G.paint(gg, C.conc), 'ground');
    }
    top(-HALF, L.FRONT_Z, S.x0, S.zTop);
    top(S.x1, L.FRONT_Z, HALF, S.zTop);
    top(-HALF, S.zTop, HALF, HALF);
    top(L.ARM_X, L.ARM_Z, HALF, L.FRONT_Z);
    // expansion joints (thin dark grooves) on the quay
    var jc = 0xb4c0bf;
    for (i = -26; i <= 30; i += 6.5) if (i > S.x1 + 0.5 || i < S.x0 - 0.5 || true) {
      B.add(G.box(0.07, 0.012, HALF - S.zTop - 0.2, jc).translate(i + 0.4, QY + 0.004, (HALF + S.zTop) / 2), 'solidNC');
    }
    B.add(G.box(HALF * 2 - 0.4, 0.012, 0.07, jc).translate(0, QY + 0.004, 22.2), 'solidNC');
    B.add(G.box(HALF - S.x1 - 0.4, 0.012, 0.07, jc).translate((HALF + S.x1) / 2, QY + 0.004, 15.6), 'solidNC');
    for (i = -9; i <= 9; i += 6) B.add(G.box(HALF - L.ARM_X - 0.4, 0.012, 0.07, jc).translate((HALF + L.ARM_X) / 2, QY + 0.004, i), 'solidNC');
    B.add(G.box(0.07, 0.012, L.FRONT_Z - L.ARM_Z, jc).translate(20.9, QY + 0.004, (L.FRONT_Z + L.ARM_Z) / 2), 'solidNC');
    // a few hairline cracks
    var cracks = [[-6, 19.5, 0.5], [9, 26.5, -0.7], [-20, 28, 0.25], [18, 3, 1.2], [24.5, 18, -0.4], [-29, 21.5, 1.0]];
    cracks.forEach(function (c) {
      var px = c[0], pz = c[1], a = c[2];
      for (var k = 0; k < 6; k++) {
        var len = 0.5 + rnd() * 0.8; a += (rnd() - 0.5) * 0.9;
        var nx = px + Math.cos(a) * len, nzv = pz + Math.sin(a) * len;
        B.add(G.box(len, 0.01, 0.035, 0xa7b5b5).rotateY(-a).translate((px + nx) / 2, QY + 0.004, (pz + nzv) / 2), 'solidNC');
        px = nx; pz = nzv;
      }
    });

    // ---------------- wheel stops with worn yellow / black stripes
    function curbRun(axis, c, a0, a1, sign) {
      var segL = 2.3, gapL = 0.16, a = a0;
      while (a < a1 - 0.3) {
        var e = Math.min(a + segL, a1), len = e - a;
        var gg = axis === 'x'
          ? G.box(len, 0.25, 0.32, C.conc2).translate((a + e) / 2, QY + 0.125, c + sign * 0.19)
          : G.box(0.32, 0.25, len, C.conc2).translate(c + sign * 0.19, QY + 0.125, (a + e) / 2);
        B.add(G.fx(gg, 12, 0.0));
        a = e + gapL;
      }
    }
    curbRun('x', L.FRONT_Z, S.x1 + 0.15, L.STEPS.x0 - 0.1, 1);
    curbRun('x', L.FRONT_Z, L.STEPS.x1 + 0.1, L.ARM_X - 0.35, 1);
    curbRun('z', L.ARM_X, L.BW.z1 + 0.3, L.FRONT_Z - 0.35, 1);
    curbRun('z', S.x1, L.FRONT_Z + 0.4, S.zTop - 1.2, 1);
    curbRun('x', L.FRONT_Z, -HALF + 0.1, S.x0 - 0.1, 1);

    // ---------------- steps down to the water + low boarding platform
    var st = L.STEPS, rise = 0.2, run = 0.6, nSteps = 9;
    H.STEP_DIM = { rise: rise, run: run, n: nSteps };
    for (i = 0; i < nSteps; i++) {
      var ty = QY - rise * (i + 1), z1 = L.FRONT_Z - run * i, z0 = z1 - run;
      B.add(G.fx(G.boxMM(st.x0, -1.6, z0, st.x1, ty, z1, G.jit(C.conc, 0.015)), 1, 0));
      // nosing line
      B.add(G.fx(G.boxMM(st.x0, ty - 0.035, z0 - 0.03, st.x1, ty + 0.004, z0 + 0.05, 0xedf0ea), 1, 0));
    }
    B.add(G.fx(G.boxMM(st.x0, SB, L.FRONT_Z - run * nSteps, st.x1, -1.6, L.FRONT_Z, C.conc3), 1, 0));
    // side cheek wall of the stair (west side) with a rounded top
    B.add(G.fx(G.boxMM(st.x0 - 0.35, SB, L.FRONT_Z - run * nSteps - 0.1, st.x0, 0.62, L.FRONT_Z, C.conc2), 1, 0));
    // platform
    var P = L.PLAT;
    B.add(G.fx(G.boxMM(P.x0, SB, P.z0, P.x1, P.y, P.z1, C.conc), 1, 0));
    B.add(G.fx(G.boxMM(P.x0, P.y - 0.16, P.z0 - 0.06, P.x1 + 0.06, P.y - 0.02, P.z1, 0xd0d6d2), 1, 0));
    // rubber strip + small cleat on the platform edge
    B.add(G.boxMM(P.x0 + 0.2, P.y - 0.42, P.z0 - 0.12, P.x1 - 0.2, P.y - 0.2, P.z0 - 0.05, C.rubber));
    for (i = 0; i < 2; i++) {
      var cx = P.x0 + 1.2 + i * 2.8;
      B.add(G.boxB(0.5, 0.06, 0.16, C.iron).translate(cx, P.y, P.z0 + 0.35));
      B.add(G.cylB(0.05, 0.06, 0.14, 6, C.iron).translate(cx - 0.12, P.y + 0.06, P.z0 + 0.35));
      B.add(G.cylB(0.05, 0.06, 0.14, 6, C.iron).translate(cx + 0.12, P.y + 0.06, P.z0 + 0.35));
      B.add(G.box(0.62, 0.07, 0.1, C.iron).translate(cx, P.y + 0.22, P.z0 + 0.35));
    }

    // ---------------- slipway
    var slope = (QY + 1.3) / (S.zTop - S.zEnd);
    H.slipY = function (z) { return QY - (S.zTop - z) * slope; };
    // ramp body: extrude profile (z,y) along x
    var prof = [[S.zTop, QY], [S.zEnd, -1.3], [S.zEnd, SB + 0.3], [S.zTop, SB + 0.3]];
    g = G.extrude(prof.map(function (p) { return [p[0], p[1]]; }), S.x1 - S.x0, C.conc);
    // extrude: shape in xy (x=z_world, y=y), depth along z -> rotate so shape x -> world z, depth -> world x
    g.rotateY(-Math.PI / 2);              // (x,y,z) -> (-z, y, x) : shape x -> world z ; depth z -> world -x
    g.translate(S.x1, 0, 0);
    B.add(G.fx(g, 1, 0));
    // anti-slip ribs
    for (var zr = S.zTop - 0.9; zr > S.zEnd + 0.3; zr -= 0.62) {
      var rb = G.box(S.x1 - S.x0 - 0.5, 0.05, 0.13, 0xd0d6d2).rotateX(-Math.atan(slope));
      rb.translate((S.x0 + S.x1) / 2, H.slipY(zr) + 0.02, zr);
      B.add(G.fx(rb, 1, 0));
    }
    // timber skids for hauling boats
    [-29.3, -26.4].forEach(function (sx) {
      var len = S.zTop - 1.2 - (S.zEnd + 2.2);
      var sk = G.box(0.22, 0.12, len / Math.cos(Math.atan(slope)), C.woodGrey).rotateX(-Math.atan(slope));
      sk.translate(sx, H.slipY((S.zTop - 1.2 + S.zEnd + 2.2) / 2) + 0.08, (S.zTop - 1.2 + S.zEnd + 2.2) / 2);
      B.add(G.fx(sk, 8, 0));
    });
    // notch cheeks (walls either side of the ramp, inside the quay)
    function cheek(xc, facing) {
      var yE = H.slipY(L.FRONT_Z);
      var a = [xc, yE, L.FRONT_Z], b = [xc, QY, S.zTop], c2 = [xc, QY, L.FRONT_Z];
      B.add(G.fx(facing > 0 ? G.tri(a, c2, b, C.conc2) : G.tri(a, b, c2, C.conc2), 1, 0));
    }
    cheek(S.x0, 1); cheek(S.x1, -1);
  };

  // ---------------------------------------------------------------- quay puddle / wear mask
  H.PUDDLES = [
    [-11.4, 16.3, 2.3], [-9.6, 17.5, 1.5], [-13.0, 17.4, 1.2],
    [6.4, 15.6, 1.9], [8.1, 16.5, 1.3],
    [-27.2, 25.2, 2.1], [-25.6, 26.4, 1.2],
    [0.5, 24.6, 2.4], [2.6, 25.8, 1.5], [-1.4, 26.0, 1.2],
    [18.6, 20.4, 1.7], [17.1, -3.2, 1.5], [17.9, -1.7, 1.0], [16.6, 6.4, 1.2],
    [25.4, 27.2, 1.8], [-18.5, 21.3, 1.4], [10.2, 28.3, 1.6], [-20.4, 15.4, 1.1], [28.3, 14.6, 1.3]
  ];
  H.buildShoreMask = function () {
    var S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    var k = S / (HALF * 2);
    function px(v) { return (v + HALF) * k; }
    x.globalCompositeOperation = 'lighter';
    H.PUDDLES.forEach(function (p) {
      var gr = x.createRadialGradient(px(p[0]), px(p[1]), 0, px(p[0]), px(p[1]), p[2] * k * 1.9);
      gr.addColorStop(0, 'rgba(255,0,0,0.95)'); gr.addColorStop(0.5, 'rgba(255,0,0,0.5)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px(p[0]), px(p[1]), p[2] * k * 1.9, 0, 7); x.fill();
    });
    // roofed floors (green channel): no rain rings in the puddles indoors
    x.fillStyle = 'rgb(0,255,0)';
    [H.WAREHOUSE, H.WAITROOM].forEach(function (b) { if (b) x.fillRect(px(b.x0), px(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); });
    // wear: drag marks and tyre arcs (blue channel)
    x.strokeStyle = 'rgba(0,0,255,0.35)'; x.lineCap = 'round';
    var r = H.mulberry(77);
    for (var i = 0; i < 26; i++) {
      x.lineWidth = 1.5 + r() * 3;
      var sx = -28 + r() * 56, sz = 14 + r() * 16, a = (r() - 0.5) * 0.8, len = 3 + r() * 9;
      x.beginPath(); x.moveTo(px(sx), px(sz)); x.quadraticCurveTo(px(sx + len * 0.5), px(sz + (r() - 0.5) * 3), px(sx + len * Math.cos(a)), px(sz + len * Math.sin(a))); x.stroke();
    }
    for (i = 0; i < 10; i++) {
      x.lineWidth = 1.5 + r() * 2.5;
      var sz2 = -12 + r() * 22, sx2 = 15.5 + r() * 5;
      x.beginPath(); x.moveTo(px(sx2), px(sz2)); x.lineTo(px(sx2 + (r() - 0.5) * 1.5), px(sz2 + 3 + r() * 6)); x.stroke();
    }
    // drag marks at the top of the slipway
    x.strokeStyle = 'rgba(0,0,255,0.55)';
    for (i = 0; i < 6; i++) { x.lineWidth = 2; x.beginPath(); x.moveTo(px(-30 + i * 1.0), px(18.4)); x.lineTo(px(-30 + i * 1.0 + (r() - 0.5)), px(22 + r() * 3)); x.stroke(); }
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.flipY = false;
    H.U.uShore.value = t;
  };
})();
