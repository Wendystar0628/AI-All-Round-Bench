/* extra dressing for the open quay: kei truck, hand cart, fish-drying rack, float heap, tarped pile, baskets, parking lines */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, A = H.Atlas, rnd = H.mulberry(31337);
  var QY = L.QUAY_Y;

  function wheel(b, x, y, z, r, w) {
    var t = G.cyl(r, r, w, 16, 0x2c3034).rotateZ(Math.PI / 2).translate(x, y, z);
    b.add(t);
    b.add(G.fx(G.cyl(r * 0.58, r * 0.58, w + 0.02, 12, 0xcfd6d9).rotateZ(Math.PI / 2).translate(x, y, z), 0, 0.6));
    b.add(G.cyl(r * 0.2, r * 0.2, w + 0.04, 8, 0x8f9da1).rotateZ(Math.PI / 2).translate(x, y, z));
  }

  H.buildExtras = function (B) {
    var K = H.kit, i;
    A.add('plate', 160, 80, function (c, w, h) {
      c.fillStyle = '#f2cf45'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 4; c.strokeRect(3, 3, w - 6, h - 6);
      H.txt(c, '汐見 480', w / 2, 22, 20, '#2f2f2f'); H.txt(c, 'た 37-15', w / 2, 54, 30, '#2f2f2f', H.FONT_EN);
    });
    A.add('door_logo', 256, 96, function (c, w, h) {
      c.fillStyle = '#f7f8f3'; c.fillRect(0, 0, w, h);
      H.txt(c, '汐見漁協', w / 2, h / 2, 50, '#2b5873');
      H.fadeCanvas(c, w, h, 0.8, 91, '#f7f8f3');
    });

    // =========================================================== kei truck parked on the quay, loaded with fish boxes
    B.group(23.6, QY, 25.2, 0, -1.92, 0, 1, function (b) {
      var white = 0xf7f8f3, grey = 0xcfd6d9, dark = 0x2f3338;
      // chassis + wheels
      b.add(G.boxMM(-0.62, 0.3, -1.55, 0.62, 0.46, 1.55, 0x3a4046));
      [[-0.66, 1.0], [0.66, 1.0], [-0.66, -1.0], [0.66, -1.0]].forEach(function (p) { wheel(b, p[0], 0.27, p[1], 0.27, 0.17); });
      // load bed with drop sides
      b.add(G.fx(G.boxMM(-0.72, 0.46, -1.68, 0.72, 0.56, 0.42, white), 2, 0.3));
      b.add(G.fx(G.boxMM(-0.74, 0.56, -1.7, -0.69, 0.86, 0.42, white), 2, 0.3));
      b.add(G.fx(G.boxMM(0.69, 0.56, -1.7, 0.74, 0.86, 0.42, white), 2, 0.3));
      b.add(G.fx(G.boxMM(-0.74, 0.56, -1.72, 0.74, 0.86, -1.67, white), 2, 0.3));
      b.add(G.boxMM(-0.74, 0.56, 0.38, 0.74, 1.5, 0.43, grey));
      for (i = 0; i < 5; i++) b.add(G.box(1.3, 0.02, 0.03, 0x8f9da1).translate(0, 0.98 + i * 0.11, 0.45), 'solidNC');
      [[-0.745, -0.6], [-0.745, -1.2], [0.745, -0.6], [0.745, -1.2]].forEach(function (p) { b.add(G.box(0.02, 0.26, 0.06, 0x8f9da1).translate(p[0], 0.71, p[1])); });
      // cab
      b.add(G.fx(G.boxMM(-0.72, 0.4, 0.46, 0.72, 1.02, 1.66, white), 2, 0.35));
      b.add(G.fx(G.extrude([[0.46, 1.02], [1.66, 1.02], [1.5, 1.76], [0.5, 1.76]], 1.44, white).rotateY(-Math.PI / 2).translate(0.72, 0, 0), 2, 0.35));
      b.add(G.fx(G.boxMM(-0.7, 1.76, 0.5, 0.7, 1.8, 1.5, 0xf2f4ee), 0, 0.4));
      // glazing: windscreen (raked), side windows
      b.add(G.quad([-0.62, 1.08, 1.655], [0.62, 1.08, 1.655], [0.62, 1.66, 1.525], [-0.62, 1.66, 1.525], 0x7fa3b5));
      [1, -1].forEach(function (s) {
        b.add(G.box(0.012, 0.5, 0.62, 0x7fa3b5).translate(s * 0.726, 1.37, 1.02));
        b.add(G.box(0.014, 0.6, 0.03, dark).translate(s * 0.727, 1.3, 0.62));
        b.add(G.box(0.04, 0.03, 0.12, dark).translate(s * 0.74, 0.92, 0.72));
        b.add(G.box(0.1, 0.14, 0.04, dark).translate(s * 0.82, 1.32, 1.5));
        b.add(A.quad('door_logo', 0.56, 0.21).rotateY(s * Math.PI / 2).translate(s * 0.728, 0.76, 1.06), 'atlas');
      });
      b.add(G.box(1.2, 0.3, 0.012, 0x7fa3b5).translate(0, 1.42, 0.455));
      // nose: lamps, bumper, plate, wipers
      [-0.5, 0.5].forEach(function (x) {
        b.add(G.cyl(0.09, 0.09, 0.04, 12, 0xfffbe6).rotateX(Math.PI / 2).translate(x, 0.84, 1.67), 'glowFlat');
        b.add(G.torus(0.09, 0.015, 0xcfd6d9, 4, 12).translate(x, 0.84, 1.685));
        b.add(G.box(0.1, 0.05, 0.03, 0xf08a2c).translate(x, 0.68, 1.67));
      });
      b.add(G.boxMM(-0.72, 0.4, 1.64, 0.72, 0.58, 1.74, 0x55626a));
      b.add(A.quad('plate', 0.34, 0.17).translate(0, 0.5, 1.75), 'atlas');
      b.add(A.quad('plate', 0.34, 0.17).rotateY(Math.PI).translate(0, 0.66, -1.73), 'atlas');
      [-0.25, 0.3].forEach(function (x) { b.add(G.box(0.012, 0.36, 0.012, dark).rotateZ(0.9).translate(x, 1.14, 1.648), 'solidNC'); });
      [-0.55, 0.55].forEach(function (x) { b.add(G.box(0.14, 0.08, 0.03, 0xd9503f).translate(x, 0.66, -1.725)); });
      b.add(G.box(1.44, 0.07, 0.03, grey).translate(0, 0.95, 1.665));
      // cargo
      b.group(-0.33, 0.56, -1.2, 0, 0, 0, 1, function (d) { K.fishStack(d, 1, 2, 3, { ragged: false }); });
      b.group(0.33, 0.56, -1.15, 0, 0.05, 0, 1, function (d) { K.fishStack(d, 1, 2, 2, { open: true }); });
      b.group(0.2, 0.56, -0.2, 0, 0.3, 0, 1, function (d) { K.crateStack(d, 2); });
      b.group(-0.4, 0.56, -0.15, 0, 0, 0, 1, function (d) { K.bucket(d, 0xf4cb3c); });
      b.add(G.rope([[-0.7, 0.9, -0.9], [-0.3, 1.32, -1.0], [0.35, 1.1, -1.0], [0.72, 0.88, -0.95]], 0.014, C.rope, 16, 14));
    });
    H.DRIPS.push({ x: 23.6 + 1.2, y: QY + 0.84, z: 25.2 - 0.9, rate: 0.4, small: true });

    // parking bay lines + faded "P"
    for (i = 0; i < 4; i++) B.add(G.box(0.1, 0.008, 4.0, 0xf2f4ee).rotateY(-0.35).translate(20.5 + i * 2.9, QY + 0.006, 25.6), 'solidNC');

    // =========================================================== hand cart with crates
    B.group(13.0, QY, 28.6, 0, 0.6, 0, 1, function (b) {
      b.add(G.fx(G.boxB(1.0, 0.05, 1.5, 0xc9ae84).translate(0, 0.42, 0), 8, 0));
      [-0.5, 0.5].forEach(function (x) {
        b.add(G.fx(G.boxB(0.04, 0.28, 1.5, 0x8fa0a6).translate(x, 0.47, 0), 3, 0));
        b.add(G.torus(0.3, 0.03, 0x2c3034, 5, 18).rotateY(Math.PI / 2).translate(x * 1.16, 0.33, -0.1));
        for (var q = 0; q < 4; q++) { var a = q / 4 * Math.PI; b.add(G.pipe([x * 1.16, 0.33 + Math.sin(a) * 0.29, -0.1 + Math.cos(a) * 0.29], [x * 1.16, 0.33 - Math.sin(a) * 0.29, -0.1 - Math.cos(a) * 0.29], 0.008, 0xcfd6d9, 3), 'solidNC'); }
        b.add(G.fx(G.pipe([x, 0.5, 0.75], [x * 0.9, 0.62, 1.7], 0.022, 0x8fa0a6, 5), 3, 0));
      });
      b.add(G.fx(G.pipe([-0.45, 0.62, 1.7], [0.45, 0.62, 1.7], 0.022, 0x8fa0a6, 5), 3, 0));
      b.add(G.fx(G.pipe([0, 0.42, 0.7], [0, 0.0, 0.85], 0.02, 0x8fa0a6, 4), 3, 0));
      b.group(-0.18, 0.47, -0.3, 0, 0.1, 0, 1, function (d) { K.crateStack(d, 2); });
      b.group(0.2, 0.47, 0.35, 0, -0.3, 0, 1, function (d) { K.fishBox(d, {}); });
    });

    // =========================================================== fish drying rack (two mesh trays of split fish)
    B.group(27.8, QY, 20.4, 0, 0.25, 0, 1, function (b) {
      [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]].forEach(function (p) { b.add(G.fx(G.boxB(0.06, 1.35, 0.06, C.woodLight).translate(p[0], 0, p[1]), 8, 0)); });
      [0.75, 1.3].forEach(function (y, k) {
        b.add(G.fx(G.pipes([[-1.12, y, -0.47], [1.12, y, -0.47], [1.12, y, 0.47], [-1.12, y, 0.47], [-1.12, y, -0.47]], 0.02, C.wood, 4), 8, 0));
        b.add(H.sheetGeom(8, 4, function (u, v) { return [-1.1 + u * 2.2, y - 0.01 - Math.sin(u * 3.14) * 0.02, -0.45 + v * 0.9]; }, 7, 3, 0x8fc0d0), 'netStill');
        for (var q = 0; q < 8; q++) for (var r = 0; r < 2; r++) {
          var fx = -0.92 + q * 0.26 + (r ? 0.06 : 0), fz = -0.2 + r * 0.42;
          var fish = G.extrude([[0, 0.1], [0.07, 0.03], [0.08, -0.1], [0, -0.16], [-0.08, -0.1], [-0.07, 0.03]], 0.012, k ? 0xe2c9a0 : 0xd9b58a).rotateX(-Math.PI / 2).rotateY(0.3 * (q % 3 - 1));
          b.add(fish.translate(fx, y + 0.005, fz), 'solidNC');
        }
      });
      // rain cover: clear sheet on a hoop frame
      b.add(G.surf(8, 4, function (u, v) { return [-1.2 + u * 2.4, 1.55 + Math.sin(v * Math.PI) * 0.22, -0.55 + v * 1.1]; }, 0xf4fbfb), 'vinyl');
      [-1.2, 0, 1.2].forEach(function (x) {
        var pts = []; for (var q = 0; q <= 6; q++) pts.push([x, 1.55 + Math.sin(q / 6 * Math.PI) * 0.22, -0.55 + q / 6 * 1.1]);
        b.add(G.tube(pts, 0.012, 0x8f9da1, 4, 12));
      });
    });
    H.DRIPS.push({ x: 27.8 - 0.3, y: QY + 1.55, z: 20.4 + 0.58, rate: 0.5, small: true });

    // =========================================================== heap of spare floats under a net, baskets, tarped pile, anchor
    B.group(-18.6, QY, 26.6, 0, 0.2, 0, 1, function (b) {
      var cols = [0xf08a2c, 0xf4cb3c, 0xf7f8f3, 0xf08a2c, 0x3f8fb6, 0xd9503f];
      for (var q = 0; q < 17; q++) {
        var a = rnd() * 6.283, r = Math.sqrt(rnd()) * 1.0, layer = q < 10 ? 0 : (q < 15 ? 1 : 2), rad = 0.2 + rnd() * 0.08;
        b.add(G.fx(G.sph(rad, cols[q % cols.length], 10, 7).translate(Math.cos(a) * r * (1 - layer * 0.3), rad + layer * 0.3, Math.sin(a) * r * 0.8 * (1 - layer * 0.3)), 0, 0.5));
      }
      b.add(H.sheetGeom(10, 6, function (u, v) { var a = u * 6.283, r = 0.25 + v * 1.25; return [Math.cos(a) * r, 0.86 * (1 - v) * (1 - v) + 0.03 + 0.12 * (1 - v), Math.sin(a) * r * 0.85]; }, 12, 5, 0x9fd0c4), 'netStill');
    });
    B.group(-12.4, QY, 28.0, 0, 0, 0, 1, function (b) {
      for (var q = 0; q < 4; q++) {
        b.add(G.fx(G.lathe([[0, 0], [0.3, 0], [0.4, 0.26], [0.42, 0.26], [0.42, 0.3], [0.37, 0.3], [0.28, 0.03], [0, 0.03]], 14, q % 2 ? 0xf4cb3c : 0xf2b53c).rotateY(q).translate((q === 3 ? 0.9 : 0) + (rnd() - 0.5) * 0.04, (q === 3 ? 0 : q * 0.1), (q === 3 ? 0.2 : 0)), 0, 0.3), 'solidDS');
      }
    });
    B.group(-25.4, QY, 28.6, 0, 0.35, 0, 1, function (b) {
      b.add(G.surf(8, 8, function (u, v) {
        var x = -1.3 + u * 2.6, z = -0.9 + v * 1.8, e = Math.min(u, 1 - u, v, 1 - v);
        var h = Math.min(0.85, e * 5.0) + Math.sin(u * 9) * 0.03 + Math.sin(v * 7 + 1) * 0.03;
        return [x * (1 + (0.85 - h) * 0.05), h, z * (1 + (0.85 - h) * 0.05)];
      }, 0x3f8fc9), 'solidDS');
      b.add(G.rope([[-1.32, 0.05, 0.2], [-1.1, 0.7, 0.22], [0, 0.9, 0.25], [1.1, 0.7, 0.22], [1.32, 0.05, 0.2]], 0.018, 0xdccba0, 20, 12));
      b.add(G.rope([[-1.32, 0.05, -0.4], [-1.1, 0.7, -0.38], [0, 0.9, -0.36], [1.1, 0.7, -0.38], [1.32, 0.05, -0.4]], 0.018, 0xdccba0, 20, 12));
    });
    H.tyreGeom(B, -24.2, QY + 0.17, 27.5, Math.PI / 2, 0.4, 0, 0.9);
    H.tyreGeom(B, -26.9, QY + 0.5, 29.6, 0.3, 2.2, 0, 0.9);
    // stack of pallets + drums in the corner
    for (i = 0; i < 5; i++) B.group(29.0, QY + i * 0.15, 28.6, 0, (rnd() - 0.5) * 0.12, 0, 1, function (b) { K.pallet(b); });
    [[29.3, 15.6, 0xd9503f], [30.0, 16.2, 0x3f7fbd], [29.9, 15.3, 0x3f7fbd]].forEach(function (p) { B.group(p[0], QY, p[1], 0, 0, 0, 1, function (b) { K.barrel(b, p[2]); }); });
    // old anchor propped by the bollard at the slipway
    if (H.anchorGeom) H.anchorGeom(B, -7.0, QY + 0.1, 27.4, 0.6, 1.32);
    // wooden bench facing the harbour
    B.group(4.1, QY, 13.72, 0, Math.PI, 0, 1, function (b) {
      for (var q = 0; q < 3; q++) b.add(G.fx(G.boxB(1.9, 0.045, 0.11, C.wood).translate(0, 0.42, -0.13 + q * 0.13), 8, 0.15));
      for (q = 0; q < 2; q++) b.add(G.fx(G.box(1.9, 0.11, 0.035, C.wood).rotateX(-0.2).translate(0, 0.66 + q * 0.15, -0.26 - q * 0.03), 8, 0.15));
      [-0.8, 0.8].forEach(function (x) { b.add(G.fx(G.boxB(0.07, 0.42, 0.4, C.conc3).translate(x, 0, 0), 1, 0)); b.add(G.boxB(0.05, 0.5, 0.05, 0x55626a).rotateX(-0.2).translate(x, 0.42, -0.24)); });
    });
  };
})();
