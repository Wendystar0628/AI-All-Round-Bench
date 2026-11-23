/* breakwaters, lighthouse, tetrapods, wooded hill with tiled-roof houses */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, rnd = H.brand;
  var QY = L.QUAY_Y, SB = L.SEABED_Y, HALF = L.HALF;

  function nz(x, z) { return H.noise1(x * 0.31 + z * 0.17) * 0.5 + H.noise1(x * 0.13 - z * 0.41 + 7.7) * 0.5; }

  // ------------------------------------------------------------ hill terrain
  var PADS = [
    { x: 19.6, z: -19.6, r: 3.6, y: 4.3 },
    { x: 27.2, z: -22.2, r: 3.8, y: 6.5 },
    { x: 21.8, z: -27.6, r: 3.3, y: 7.9 },
    { x: 28.6, z: -29.2, r: 2.4, y: 9.3 }
  ];
  H.HILL_PADS = PADS;
  var HZ = -14.3;       // top line of the retaining wall
  H.hillY = function (x, z) {
    var u = H.clamp((x - 12) / 20, 0, 1), v = H.clamp((HZ - z) / 17.7, 0, 1);
    var d = Math.min(1, (u * 0.85 + v * 1.05) / 1.22);
    var h = 2.9 + 7.6 * Math.pow(H.smooth(0, 1, d), 1.12);
    h += (nz(x * 0.9, z * 0.9) - 0.5) * 1.0;
    for (var i = 0; i < PADS.length; i++) {
      var p = PADS[i], dd = Math.hypot(x - p.x, z - p.z);
      h = H.lerp(h, p.y, H.smooth(p.r + 1.9, p.r - 0.2, dd));
    }
    h = H.lerp(2.25, h, H.smooth(0, 3.2, x - 12));
    h = H.lerp(Math.min(h, 3.0), h, H.smooth(0, 2.4, HZ - z));
    return h;
  };

  // ------------------------------------------------------------ tetrapod
  var TDIR = [[0, 1, 0], [0.9428, -0.3333, 0], [-0.4714, -0.3333, 0.8165], [-0.4714, -0.3333, -0.8165]];
  function tetrapod(s, hex) {
    var list = [], up = new THREE.Vector3(0, 1, 0);
    TDIR.forEach(function (d) {
      var g = new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 0.98 * s, 9, 1, false).translate(0, 0.49 * s, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(d[0], d[1], d[2])));
      list.push(G.paint(g, hex));
    });
    list.push(G.sph(0.36 * s, hex, 8, 6));
    return G.fx(G.merge(list), 1, 0);
  }
  H.tetrapodGeom = tetrapod;

  // ------------------------------------------------------------ small tiled-roof house
  function house(B, o) {
    var w = o.w, d = o.d, wallH = o.wallH || 2.5, roofH = o.roofH || 1.35, ov = 0.55;
    var wallC = o.wall || 0xf3efe2, woodC = o.wood || 0x9c7b5c, tileC = o.tile || C.tile;
    B.group(o.x, o.y, o.z, 0, o.ry || 0, 0, 1, function (b) {
      // stone footing
      b.add(G.fx(G.boxB(w + 0.3, 0.35, d + 0.3, 0xb9bdb2).translate(0, -0.05, 0), 1, 0));
      // walls: plaster above, timber boards below
      b.add(G.boxB(w, wallH, d, wallC).translate(0, 0.3, 0));
      b.add(G.fx(G.boxB(w + 0.04, 0.95, d + 0.04, woodC).translate(0, 0.3, 0), 8, 0));
      b.add(G.boxB(w + 0.08, 0.06, d + 0.08, G.mix(woodC, 0x000000, 0.25)).translate(0, 1.25, 0));
      // corner posts and beams
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        b.add(G.fx(G.boxB(0.14, wallH, 0.14, woodC).translate(s[0] * (w / 2), 0.3, s[1] * (d / 2)), 8, 0));
      });
      b.add(G.fx(G.boxB(w + 0.12, 0.14, d + 0.12, woodC).translate(0, 0.3 + wallH - 0.14, 0), 8, 0));
      // windows (front = +z) : frames, dark panes, a little warm lamp in one
      function win(cx, cy, ww, hh, zf, face) {
        var gz = (d / 2 + 0.03) * zf;
        var put = function (g) { if (face === 'x') { g.rotateY(Math.PI / 2 * zf); g.translate((w / 2 + 0.03) * zf, 0, 0); g.translate(0, cy, cx); } else { if (zf < 0) g.rotateY(Math.PI); g.translate(cx, cy, gz); } return g; };
        b.add(put(G.box(ww + 0.14, hh + 0.14, 0.05, 0xfbfbf5)));
        b.add(put(G.box(ww, hh, 0.07, o.lit && cx > 0 ? 0xf6dba0 : 0x6f95a6)));
        b.add(put(G.box(0.04, hh, 0.09, 0xfbfbf5)));
        b.add(put(G.box(ww, 0.04, 0.09, 0xfbfbf5)));
        b.add(put(G.box(ww + 0.3, 0.05, 0.16, 0xe9e6da).translate(0, -hh / 2 - 0.09, 0)));
      }
      win(-w * 0.24, 1.95, 1.15, 0.85, 1); win(w * 0.26, 1.95, 1.0, 0.85, 1);
      win(0, 1.95, 1.1, 0.8, -1);
      win(0.1, 1.95, 1.0, 0.8, 1, 'x'); win(-0.2, 1.95, 0.9, 0.8, -1, 'x');
      // sliding door + step stone
      b.add(G.fx(G.box(1.0, 1.75, 0.06, 0x7d6248).translate(w * 0.02, 0.3 + 0.9, d / 2 + 0.03), 8, 0));
      b.add(G.box(0.42, 1.2, 0.07, 0xdfe9e6).translate(w * 0.02 - 0.24, 0.3 + 1.0, d / 2 + 0.04));
      b.add(G.box(0.42, 1.2, 0.07, 0xdfe9e6).translate(w * 0.02 + 0.24, 0.3 + 1.0, d / 2 + 0.04));
      b.add(G.fx(G.boxB(1.3, 0.16, 0.5, 0xc4c8be).translate(w * 0.02, 0.0, d / 2 + 0.4), 1, 0));
      // gable roof with rows of round tiles
      var half = d / 2 + ov, sl = Math.hypot(half, roofH), ang = Math.atan2(roofH, half), y0 = 0.3 + wallH;
      [-1, 1].forEach(function (s) {
        var slab = G.fx(G.box(w + ov * 2, 0.09, sl + 0.1, tileC), 0, 0.35);
        slab.rotateX(s * ang).translate(0, y0 + roofH / 2, s * half / 2);
        b.add(slab);
        var n = Math.round((w + ov * 2) / 0.34);
        for (var i = 0; i <= n; i++) {
          var tx = -(w + ov * 2) / 2 + 0.06 + i * ((w + ov * 2 - 0.12) / n);
          var t = G.fx(G.cyl(0.075, 0.075, sl + 0.12, 5, i % 5 === 2 ? C.tileLight : C.tileDark), 0, 0.45);
          t.rotateX(Math.PI / 2).rotateX(s * ang).translate(tx, y0 + roofH / 2 + 0.06, s * half / 2);
          b.add(t);
        }
        // eave edge course
        var e = G.box(w + ov * 2 + 0.06, 0.12, 0.14, C.tileDark).rotateX(s * ang).translate(0, y0 + 0.02 - 0.0, s * (half - 0.02));
        b.add(e);
      });
      b.add(G.fx(G.box(w + ov * 2 + 0.2, 0.2, 0.3, C.tileDark).translate(0, y0 + roofH + 0.1, 0), 0, 0.4));
      b.add(G.fx(G.cyl(0.11, 0.11, w + ov * 2 + 0.24, 6, C.tile).rotateZ(Math.PI / 2).translate(0, y0 + roofH + 0.24, 0), 0, 0.5));
      [-1, 1].forEach(function (s) { b.add(G.box(0.16, 0.36, 0.4, C.tileDark).translate(s * (w / 2 + ov + 0.06), y0 + roofH + 0.12, 0)); });
      // gable ends (triangles) in plaster with a vent
      [-1, 1].forEach(function (s) {
        var gx = s * (w / 2);
        var tri = s > 0 ? G.tri([gx, y0, d / 2], [gx, y0, -d / 2], [gx, y0 + roofH - 0.05, 0], wallC) : G.tri([gx, y0, -d / 2], [gx, y0, d / 2], [gx, y0 + roofH - 0.05, 0], wallC);
        b.add(tri);
        b.add(G.box(0.05, 0.3, 0.42, woodC).translate(gx + s * 0.02, y0 + roofH * 0.42, 0));
      });
      // bits of life: air conditioner unit, gas bottles, antenna, potted plants
      b.add(G.boxB(0.75, 0.55, 0.3, 0xe6ebe8).translate(-w / 2 + 0.7, 0.3, -d / 2 - 0.22));
      b.add(G.cyl(0.2, 0.2, 0.03, 10, 0x9fb0b4).rotateX(Math.PI / 2).translate(-w / 2 + 0.6, 0.6, -d / 2 - 0.38));
      [0, 0.34].forEach(function (ox) {
        b.add(G.fx(G.cylB(0.13, 0.13, 0.62, 8, 0xc7cfcf).translate(w / 2 + 0.25, 0.25, -d / 2 + 0.5 + ox), 0, 0.3));
        b.add(G.sph(0.13, 0xc7cfcf, 8, 5).translate(w / 2 + 0.25, 0.87, -d / 2 + 0.5 + ox));
      });
      b.add(G.pipe([w * 0.3, y0 + roofH + 0.2, 0], [w * 0.3, y0 + roofH + 1.5, 0], 0.02, 0x8b979c, 4));
      for (var k = 0; k < 4; k++) b.add(G.box(0.5 - k * 0.07, 0.02, 0.02, 0x8b979c).translate(w * 0.3, y0 + roofH + 0.85 + k * 0.17, 0));
      b.add(G.cylB(0.13, 0.1, 0.2, 7, 0xb5754f).translate(-w * 0.34, 0.2, d / 2 + 0.3));
      b.add(G.fx(G.sway(G.ico(0.2, 1, C.leaf).translate(-w * 0.34, 0.52, d / 2 + 0.3), 0.15, 1), 5, 0));
      if (o.porch) {   // little veranda roof on posts
        b.add(G.fx(G.box(w * 0.55, 0.07, 1.1, tileC).rotateX(0.22).translate(-w * 0.1, 0.3 + 2.02, d / 2 + 0.5), 0, 0.3));
        [-1, 1].forEach(function (s) { b.add(G.fx(G.boxB(0.09, 1.72, 0.09, woodC).translate(-w * 0.1 + s * w * 0.25, 0.2, d / 2 + 0.95), 8, 0)); });
        b.add(G.fx(G.boxB(w * 0.55, 0.12, 0.95, woodC).translate(-w * 0.1, 0.2, d / 2 + 0.52), 8, 0));
      }
    });
  }

  // ------------------------------------------------------------ tree
  function tree(B, x, y, z, s, kind) {
    var greens = kind === 1 ? [0x4f9a63, 0x3f8862, 0x6aae69] : (kind === 2 ? [0x7fbf6f, 0x66ac68, 0x9bcf7c] : [0x66ad68, 0x4f9a63, 0x8cc674]);
    var th = (0.9 + rnd() * 0.7) * s;
    B.add(G.fx(G.cylB(0.09 * s, 0.16 * s, th + 0.4 * s, 6, 0x8a6a4c).translate(x, y - 0.1, z), 8, 0));
    var n = 4 + Math.floor(rnd() * 3), list = [], i;
    for (i = 0; i < n; i++) {
      var a = rnd() * 6.28, r = (i === 0 ? 0 : 0.35 + rnd() * 0.5) * s;
      var br = (0.62 + rnd() * 0.38) * s * (i === 0 ? 1.15 : 0.85);
      var g = new THREE.IcosahedronGeometry(br, 1);
      g.scale(1, 0.78 + rnd() * 0.2, 1);
      g.translate(Math.cos(a) * r, th + (i === 0 ? 0.55 * s : rnd() * 0.75 * s), Math.sin(a) * r);
      list.push(G.paint(g, greens[i % 3]));
    }
    var m = G.merge(list);
    var topY = th + 1.6 * s;
    var lo = new THREE.Color(greens[1]), hi = new THREE.Color(greens[2]);
    var ca = m.attributes.color, pa = m.attributes.position;
    for (i = 0; i < pa.count; i++) {
      var t = H.clamp((pa.getY(i) - th + 0.3 * s) / (1.7 * s), 0, 1);
      var k = t > 0.62 ? 1.12 : (t < 0.25 ? 0.86 : 1.0);     // flat banded light: tops lighter, undersides darker
      ca.setXYZ(i, ca.getX(i) * k, ca.getY(i) * k, ca.getZ(i) * k);
    }
    G.fx(m, 5, 0);
    var ph = rnd() * 6.28;
    G.sway(m, function (px, py) { return H.clamp((py - th * 0.5) / (topY), 0, 1) * 1.0 * (0.6 + s * 0.4); }, ph);
    m.translate(x, y, z);
    B.add(m);
  }
  H.treeGeom = tree;

  H.buildLandscape = function (B, scene) {
    var i, g, bw = L.BW, fb = L.FBW;

    // ====================================================== short breakwater
    H.blockWall(B, { axis: 'x', c: bw.z1, sign: 1, a0: bw.x0, a1: bw.x1, y0: SB, y1: bw.top });
    H.blockWall(B, { axis: 'x', c: bw.z0, sign: -1, a0: bw.x0, a1: L.HILL_X, y0: SB, y1: bw.top });
    B.add(G.fx(G.boxMM(bw.x0, bw.top - 0.3, bw.z0 + 0.02, bw.x1 + 0.3, bw.top, bw.z1 - 0.02, C.conc), 1, 0));
    // wave wall (parapet) on the sea side, in cast sections
    for (var x = bw.x0 + 0.4; x < L.HILL_X - 0.2; x += 2.75) {
      var x1 = Math.min(x + 2.7, L.HILL_X);
      B.add(G.fx(G.boxMM(x, bw.top, bw.z0 + 0.02, x1, bw.top + 0.82, bw.z0 + 0.5, G.jit(C.conc2, 0.02)), 1, 0));
      B.add(G.fx(G.boxMM(x, bw.top + 0.82, bw.z0 - 0.06, x1, bw.top + 0.98, bw.z0 + 0.58, C.conc), 1, 0));
    }
    // small step from the arm quay up onto the breakwater
    B.add(G.fx(G.boxMM(bw.x1 - 0.2, QY, bw.z0 + 0.6, bw.x1 + 0.75, QY + 0.15, bw.z1, C.conc2), 1, 0));
    // round head
    var lh = L.LH, headR = 2.65;
    for (i = 0; i < 6; i++) {
      var y0 = SB + i * ((bw.top - SB) / 6), hh = (bw.top - SB) / 6;
      g = G.cylB(headR + (i % 2 ? 0.0 : 0.05), headR + (i % 2 ? 0.0 : 0.05), hh - 0.04, 20, G.jit(C.conc2, 0.02)).rotateY(i * 0.31).translate(lh.x, y0, lh.z);
      B.add(G.fx(g, 1, 0));
    }
    B.add(G.fx(G.cylB(headR - 0.05, headR - 0.05, 0.06, 20, C.conc).translate(lh.x, bw.top - 0.03, lh.z), 1, 0));
    // kerb ring + mooring ring on the head
    B.add(G.fx(G.torus(headR - 0.12, 0.1, C.conc2, 6, 28).rotateX(Math.PI / 2).translate(lh.x, bw.top + 0.03, lh.z), 1, 0));

    // ====================================================== lighthouse (small, red and white)
    var ly = bw.top;
    B.group(lh.x, ly, lh.z, 0, 0.2, 0, 1, function (b) {
      b.add(G.fx(G.cylB(1.45, 1.6, 0.42, 8, C.conc), 1, 0));
      b.add(G.fx(G.cylB(1.2, 1.3, 0.2, 8, C.conc2).translate(0, 0.42, 0), 1, 0));
      // tower bands
      var bands = [[0.62, 0.98, 0.92, 0xf6f6f0], [1.62, 0.92, 0.86, C.red], [2.62, 0.86, 0.80, 0xf6f6f0], [3.62, 0.80, 0.74, C.red], [4.62, 0.74, 0.70, 0xf6f6f0]];
      bands.forEach(function (bd, k) {
        b.add(G.fx(G.cylB(bd[2], bd[1], 1.0, 20, bd[3]).translate(0, bd[0], 0), 0, 0.3));
      });
      b.add(G.cylB(0.74, 0.72, 0.12, 20, 0xdfe3dd).translate(0, 5.62, 0));
      // door with a little canopy and steps
      b.add(G.box(0.62, 1.25, 0.1, 0x3f6f7d).translate(0, 1.25, 0.95));
      b.add(G.box(0.74, 1.37, 0.06, 0xe9ece6).translate(0, 1.25, 0.93));
      b.add(G.sph(0.045, C.brass, 6, 4).translate(0.2, 1.2, 1.01));
      b.add(G.box(0.9, 0.06, 0.4, C.red).translate(0, 1.98, 1.05));
      b.add(G.fx(G.boxB(0.9, 0.2, 0.5, C.conc2).translate(0, 0.42, 1.15), 1, 0));
      // portholes
      [[2.9, 0.4], [4.2, -1.9], [3.5, 2.6]].forEach(function (p) {
        var r = 0.86 - (p[0] - 1.6) * 0.06;
        b.add(G.torus(0.17, 0.04, 0xdfe3dd, 5, 12).rotateY(p[1]).translate(Math.sin(p[1]) * r, p[0], Math.cos(p[1]) * r));
        b.add(G.cyl(0.15, 0.15, 0.04, 10, 0x5d8798).rotateX(Math.PI / 2).rotateY(p[1]).translate(Math.sin(p[1]) * (r - 0.01), p[0], Math.cos(p[1]) * (r - 0.01)));
      });
      // gallery deck + railing
      b.add(G.cylB(1.14, 1.0, 0.1, 20, 0xe9ece6).translate(0, 5.72, 0));
      b.add(G.cylB(1.16, 1.16, 0.05, 20, C.red).translate(0, 5.82, 0));
      for (var k = 0; k < 12; k++) {
        var a = k / 12 * Math.PI * 2;
        b.add(G.pipe([Math.cos(a) * 1.08, 5.85, Math.sin(a) * 1.08], [Math.cos(a) * 1.08, 6.5, Math.sin(a) * 1.08], 0.022, 0xf2f4ee, 4));
      }
      b.add(G.torus(1.08, 0.025, 0xf2f4ee, 4, 28).rotateX(Math.PI / 2).translate(0, 6.5, 0));
      b.add(G.torus(1.08, 0.018, 0xf2f4ee, 4, 28).rotateX(Math.PI / 2).translate(0, 6.18, 0));
      // lantern room: sill, mullions, cap
      b.add(G.cylB(0.6, 0.66, 0.3, 12, 0xf6f6f0).translate(0, 5.85, 0));
      for (k = 0; k < 8; k++) {
        var a2 = k / 8 * Math.PI * 2;
        b.add(G.pipe([Math.cos(a2) * 0.56, 6.15, Math.sin(a2) * 0.56], [Math.cos(a2) * 0.56, 7.0, Math.sin(a2) * 0.56], 0.025, 0xe6e9e2, 4));
      }
      b.add(G.cyl(0.555, 0.555, 0.85, 16, 0xd6f0f0, true).translate(0, 6.575, 0), 'glass');
      b.add(G.cylB(0.64, 0.6, 0.1, 12, 0xf6f6f0).translate(0, 7.0, 0));
      b.add(G.fx(G.lathe([[0.68, 0], [0.62, 0.12], [0.42, 0.36], [0.16, 0.52], [0.08, 0.6], [0, 0.6]], 16, C.red).translate(0, 7.1, 0), 0, 0.4));
      b.add(G.sph(0.09, C.red, 8, 6).translate(0, 7.76, 0));
      b.add(G.pipe([0, 7.8, 0], [0, 8.35, 0], 0.012, 0x6f7d83, 4));
      // lens pedestal inside
      b.add(G.cylB(0.14, 0.2, 0.25, 8, 0x9aa8ab).translate(0, 6.15, 0), 'solidNC');
      // service ladder on the back
      [-0.14, 0.14].forEach(function (ox) { b.add(G.pipe([ox, 0.7, -0.99], [ox, 5.7, -0.76], 0.018, 0xd8dcd6, 4)); });
      for (k = 0; k < 16; k++) b.add(G.pipe([-0.14, 0.9 + k * 0.3, -0.98 + k * 0.0138], [0.14, 0.9 + k * 0.3, -0.98 + k * 0.0138], 0.014, 0xd8dcd6, 4));
    });
    H.LIGHTHOUSE = { x: lh.x, y: ly + 6.56, z: lh.z };
    H.DRIPS.push({ x: lh.x + 1.1, y: ly + 5.7, z: lh.z + 0.3, rate: 0.35 });

    // ====================================================== far, longer breakwater (veiled by the sea mist)
    var ft = [0xd3d9d5, 0xc7cfcc, 0xcfd6d2];
    H.blockWall(B, { axis: 'x', c: fb.z1, sign: 1, a0: fb.x0, a1: fb.x1, y0: SB, y1: fb.top, tones: ft, blockL: 2.8 });
    H.blockWall(B, { axis: 'x', c: fb.z0, sign: -1, a0: fb.x0, a1: fb.x1, y0: SB, y1: fb.top, tones: ft, blockL: 2.8 });
    H.blockWall(B, { axis: 'z', c: fb.x0, sign: -1, a0: fb.z0, a1: fb.z1, y0: SB, y1: fb.top, tones: ft });
    H.blockWall(B, { axis: 'z', c: fb.x1, sign: 1, a0: fb.z0, a1: fb.z1, y0: SB, y1: fb.top, tones: ft });
    B.add(G.fx(G.boxMM(fb.x0 + 0.02, fb.top - 0.2, fb.z0 + 0.02, fb.x1 - 0.02, fb.top, fb.z1 - 0.02, C.conc), 1, 0));
    for (x = fb.x0 + 0.3; x < fb.x1 - 1.6; x += 3.05) {
      B.add(G.fx(G.boxMM(x, fb.top, fb.z0 + 0.05, Math.min(x + 3.0, fb.x1 - 1.6), fb.top + 0.7, fb.z0 + 0.5, G.jit(C.conc2, 0.02)), 1, 0));
    }
    // little green-white beacon on its east end
    B.group(fb.x1 - 0.8, fb.top, (fb.z0 + fb.z1) / 2, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.cylB(0.5, 0.56, 0.3, 10, C.conc), 1, 0));
      b.add(G.cylB(0.2, 0.26, 1.0, 10, 0xf4f6f0).translate(0, 0.3, 0));
      b.add(G.cylB(0.18, 0.2, 0.8, 10, 0x4fa283).translate(0, 1.3, 0));
      b.add(G.cylB(0.3, 0.3, 0.06, 10, 0xf4f6f0).translate(0, 2.1, 0));
      b.add(G.cylB(0.12, 0.12, 0.26, 8, 0xbff0d8).translate(0, 2.16, 0), 'glowFlat');
      b.add(G.cone(0.2, 0.2, 8, 0x4fa283).translate(0, 2.52, 0));
    });

    // ====================================================== tetrapods
    var tr = H.mulberry(4242);
    H.TETRA.forEach(function (t, ti) {
      for (i = 0; i < t.n; i++) {
        var a = tr() * 6.28, r = Math.sqrt(tr()) * t.r * 0.8;
        var tx = t.x + Math.cos(a) * r, tz = t.z + Math.sin(a) * r;
        var s = 0.95 + tr() * 0.3;
        var lift = (1 - r / (t.r * 0.8)) * 0.75;
        var ty = -0.55 + lift + tr() * 0.25;
        g = tetrapod(s, G.jit([0xe3e7e2, 0xd6dcd8, 0xdde2dc][Math.floor(tr() * 3)], 0.02, tr));
        G.at(g, tx, ty, tz, tr() * 6.28, tr() * 6.28, tr() * 6.28);
        B.add(g);
      }
    });
    // a few more along the outside of the far breakwater
    for (i = 0; i < 9; i++) {
      g = tetrapod(1.0 + tr() * 0.2, G.jit(0xdde2dc, 0.02, tr));
      G.at(g, fb.x0 + 2 + i * 3.3 + tr() * 1.2, -0.5 + tr() * 0.5, fb.z0 - 0.9 - tr() * 0.6, tr() * 6.28, tr() * 6.28, tr() * 6.28);
      B.add(g);
    }

    // ====================================================== hill
    var NX = 26, NZ = 24, x0 = L.HILL_X, x1 = HALF, z0 = -HALF, z1 = HZ;
    var hg = G.surf(NX, NZ, function (u, v) {
      var px = x0 + u * (x1 - x0), pz = z0 + v * (z1 - z0);
      return [px, H.hillY(px, pz), pz];
    }, C.grass);
    G.paintFn(hg, function (px, py, pz) {
      var n = nz(px * 2.1 + 3, pz * 2.1), n2 = nz(px * 0.7 + 9, pz * 0.7);
      var onPad = false;
      for (var k = 0; k < PADS.length; k++) if (Math.hypot(px - PADS[k].x, pz - PADS[k].z) < PADS[k].r - 0.3) onPad = true;
      if (onPad) return n > 0.5 ? 0xd9d2b8 : 0xcfc8ad;
      if (px < 13.4) return n > 0.5 ? 0xb9bdae : 0xa9b0a4;
      return n2 > 0.58 ? 0x9ccf7e : (n > 0.5 ? 0x86c273 : 0x77b56d);
    });
    B.add(G.fx(hg, 0, 0));
    // earth section on the two cut faces
    function hillSide(fn, flip) {
      var n = 26;
      for (var k = 0; k < n; k++) {
        var p0 = fn(k / n), p1 = fn((k + 1) / n);
        var h0 = H.hillY(p0[0], p0[1]), h1 = H.hillY(p1[0], p1[1]);
        var layers = [[0, 0.45, 0xb9ad98], [0.45, 0.82, 0xcdbd9a], [0.82, 0.955, 0x9a7d5c], [0.955, 1.0, 0x7fb56c]];
        layers.forEach(function (ly2) {
          var a = [p0[0], QY + (h0 - QY) * ly2[0], p0[1]], bq = [p1[0], QY + (h1 - QY) * ly2[0], p1[1]];
          var c = [p1[0], QY + (h1 - QY) * ly2[1], p1[1]], d = [p0[0], QY + (h0 - QY) * ly2[1], p0[1]];
          B.add(flip ? G.quad(bq, a, d, c, ly2[2]) : G.quad(a, bq, c, d, ly2[2]));
        });
      }
    }
    hillSide(function (t) { return [HALF, z0 + t * (z1 - z0)]; }, true);
    hillSide(function (t) { return [x0 + t * (x1 - x0), -HALF]; }, true);
    // stone retaining wall along the quay with a stair gap
    var stoneT = [0xc9c6b6, 0xbdbcae, 0xd3d0c1, 0xb3b5a9];
    H.blockWall(B, { axis: 'x', c: HZ + 0.02, sign: 1, a0: L.ARM_X + 0.2, a1: 17.0, y0: QY, y1: 3.0, rowH: 0.47, blockL: 1.0, jitter: 0.07, tones: stoneT });
    H.blockWall(B, { axis: 'x', c: HZ + 0.02, sign: 1, a0: 18.5, a1: HALF, y0: QY, y1: 3.0, rowH: 0.47, blockL: 1.0, jitter: 0.07, tones: stoneT });
    B.add(G.fx(G.boxMM(L.ARM_X + 0.2, 3.0, HZ - 0.3, 17.0, 3.1, HZ + 0.12, 0xd6d6c8), 1, 0));
    B.add(G.fx(G.boxMM(18.5, 3.0, HZ - 0.3, HALF, 3.1, HZ + 0.12, 0xd6d6c8), 1, 0));
    // western shore wall cap of the hill
    B.add(G.fx(G.boxMM(L.HILL_X - 0.05, QY + 0.5, -HALF, L.HILL_X + 0.5, QY + 0.66, L.ARM_Z, C.conc), 1, 0));
    // stone stairs up the hill
    for (i = 0; i < 9; i++) {
      var sz = HZ + 1.35 - i * 0.42, sy = QY + (i + 1) * 0.27;
      B.add(G.fx(G.boxMM(17.0, QY - 0.1, sz - 0.42, 18.5, sy, sz, G.jit(0xcfcfc2, 0.02)), 1, 0));
    }
    [16.94, 18.56].forEach(function (cx) {       // cheek walls
      B.add(G.fx(G.boxMM(cx - 0.12, QY, HZ - 2.6, cx + 0.12, 3.25, HZ + 1.4, 0xc6c6ba), 1, 0));
    });
    // stepping-stone path winding between the houses
    var path = [[17.75, -17.2], [18.0, -18.3], [17.4, -19.3], [16.9, -20.4], [17.6, -21.6], [18.9, -22.6], [20.4, -23.2], [22.0, -23.1], [23.6, -22.5], [24.0, -24.0], [23.6, -25.4], [23.9, -26.6], [25.2, -27.3], [26.4, -28.0], [27.2, -28.6]];
    path.forEach(function (p, k) {
      B.add(G.fx(G.cylB(0.42, 0.46, 0.14, 7, G.jit(0xcfd0c4, 0.03)).rotateY(k * 1.3).scale(1.15, 1, 0.9).translate(p[0], H.hillY(p[0], p[1]) - 0.04, p[1]), 1, 0));
    });

    // houses
    house(B, { x: 19.7, y: 4.3, z: -19.7, w: 4.8, d: 3.7, ry: 0.18, porch: true, lit: true });
    house(B, { x: 27.3, y: 6.5, z: -22.3, w: 5.2, d: 3.9, ry: -0.22, tile: 0x5a7281, wall: 0xf1ece0, wood: 0x8b6f55 });
    house(B, { x: 21.9, y: 7.9, z: -27.7, w: 4.4, d: 3.5, ry: 0.5, porch: true, tile: 0x66808f });
    house(B, { x: 28.7, y: 9.3, z: -29.3, w: 3.2, d: 2.8, ry: -0.5, wallH: 2.2, roofH: 1.1, tile: 0x5f7887, wood: 0xa8805c });
    // tiny red torii on the path to the top house
    B.group(26.3, H.hillY(26.3, -27.9), -27.9, 0, 0.9, 0, 1, function (b) {
      [-0.55, 0.55].forEach(function (ox) { b.add(G.cylB(0.07, 0.085, 1.7, 8, 0xd9523f).translate(ox, 0, 0)); });
      b.add(G.box(1.75, 0.12, 0.16, 0xd9523f).translate(0, 1.72, 0));
      b.add(G.box(1.95, 0.08, 0.2, 0x3c3f45).translate(0, 1.82, 0));
      b.add(G.box(1.3, 0.09, 0.1, 0xd9523f).translate(0, 1.38, 0));
    });
    // low white guard rail along the west edge of the lower pad
    for (i = 0; i < 6; i++) {
      var gx = 15.4, gz = -16.4 - i * 1.25;
      B.add(G.cylB(0.05, 0.05, 0.7, 6, 0xf2f4ee).translate(gx, H.hillY(gx, gz) - 0.05, gz));
      if (i < 5) B.add(G.pipe([gx, H.hillY(gx, gz) + 0.55, gz], [gx, H.hillY(gx, gz - 1.25) + 0.55, gz - 1.25], 0.035, 0xf2f4ee, 5));
    }
    // hill utility pole feeding the port
    (function () {
      var px = 16.0, pz = -15.7, py = H.hillY(px, pz) - 0.1, ht = 6.0;
      B.add(G.fx(G.cylB(0.1, 0.14, ht, 8, 0x9a8a78).translate(px, py, pz), 8, 0));
      B.add(G.fx(G.box(1.3, 0.09, 0.09, 0x8e7f6f).translate(px, py + ht - 0.4, pz), 8, 0));
      var top = [px, py + ht - 0.3, pz];
      if (H.POLES) {
        var pb = H.POLES[1];
        B.add(G.tube(G.sagPts([pb.x + 0.7, pb.y - 0.28, pb.z], [px + 0.55, top[1], pz], 0.7, 8), 0.02, 0x3a454c, 4, 16), 'solidNC');
        B.add(G.tube(G.sagPts([pb.x - 0.3, pb.y - 0.28, pb.z], [px - 0.55, top[1], pz], 0.8, 8), 0.016, 0x3a454c, 4, 16), 'solidNC');
      }
      B.add(G.tube(G.sagPts([px, top[1], pz], [20.4, 4.3 + 3.9, -18.2], 0.5, 8), 0.016, 0x3a454c, 4, 14), 'solidNC');
      B.add(G.tube(G.sagPts([px + 0.4, top[1], pz], [25.2, 6.5 + 4.0, -21.0], 1.0, 8), 0.016, 0x3a454c, 4, 14), 'solidNC');
    })();

    // trees and bushes covering the slope
    var placed = [];
    function okSpot(px, pz, minD) {
      for (var k = 0; k < PADS.length; k++) if (Math.hypot(px - PADS[k].x, pz - PADS[k].z) < PADS[k].r + 0.5) return false;
      for (k = 0; k < path.length; k++) if (Math.hypot(px - path[k][0], pz - path[k][1]) < 0.9) return false;
      if (px > 16.6 && px < 18.9 && pz > -17.2) return false;
      for (k = 0; k < placed.length; k++) if (Math.hypot(px - placed[k][0], pz - placed[k][1]) < minD) return false;
      return true;
    }
    var tries = 0, nTrees = 0;
    while (nTrees < 58 && tries < 3000) {
      tries++;
      var tx = 13.3 + rnd() * 18.2, tz = -31.4 + rnd() * 16.6;
      if (!okSpot(tx, tz, 1.45)) continue;
      placed.push([tx, tz]);
      var sc = 0.85 + rnd() * 0.75;
      if (tx > 30.6 || tz < -30.6) sc *= 0.8;
      tree(B, tx, H.hillY(tx, tz), tz, sc, Math.floor(rnd() * 3));
      nTrees++;
    }
    for (i = 0; i < 40; i++) {
      var bx = 13.0 + rnd() * 18.6, bz = -31.6 + rnd() * 17.0;
      if (!okSpot(bx, bz, 0.8)) continue;
      placed.push([bx, bz]);
      var bs = 0.3 + rnd() * 0.35;
      g = new THREE.IcosahedronGeometry(bs, 1); g.scale(1.2, 0.75, 1.1);
      G.paint(g, [0x79b86c, 0x5fa566, 0x93c978][Math.floor(rnd() * 3)]);
      G.fx(g, 5, 0); G.sway(g, 0.12, rnd() * 6);
      B.add(g.translate(bx, H.hillY(bx, bz) + bs * 0.4, bz));
    }
    // grass tufts along the top of the retaining wall
    for (i = 0; i < 30; i++) {
      var gx2 = 14.6 + rnd() * 17, gz2 = HZ - 0.25 - rnd() * 0.5;
      if (gx2 > 16.7 && gx2 < 18.8) continue;
      g = G.cone(0.1, 0.35 + rnd() * 0.2, 4, 0x7fbe6c);
      G.fx(g, 5, 0); G.sway(g, function (a, y) { return (y + 0.2) * 0.3; }, rnd() * 6);
      B.add(g.translate(gx2, 3.25, gz2));
    }
  };
})();
