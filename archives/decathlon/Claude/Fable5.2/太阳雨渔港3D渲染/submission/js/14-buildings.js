/* fishery co-op warehouse (half raised shutter, visible interior) and ferry waiting room (floor-to-ceiling glass) */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, rnd = H.brand, A = H.Atlas;
  var QY = L.QUAY_Y;

  H.SHAFTS = [];     // window quads that throw visible light shafts: {p:[4 corners], len}
  H.CAUSTICS = [];   // quads receiving water caustics: {p:[4 corners]}

  // ------------------------------------------------------------ canvas text helpers
  function txt(c, s, x, y, size, col, font, align, weight) {
    c.font = (weight || 'bold') + ' ' + size + 'px ' + (font || H.FONT_JP);
    c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y);
  }
  // fade / stain a printed surface
  function fade(c, w, h, amt, seed, tint) {
    var r = H.mulberry(seed || 5), i;
    c.save();
    for (i = 0; i < 40 * amt; i++) {
      c.globalAlpha = 0.04 + r() * 0.10; c.fillStyle = tint || '#ffffff';
      c.beginPath(); c.ellipse(r() * w, r() * h, 6 + r() * w * 0.2, 4 + r() * h * 0.12, r() * 3, 0, 7); c.fill();
    }
    for (i = 0; i < 26 * amt; i++) {
      c.globalAlpha = 0.10 + r() * 0.14; c.fillStyle = r() < 0.5 ? '#b98d63' : '#8a7c6c';
      var x = r() * w, y = r() * h;
      c.fillRect(x, y, 1 + r() * 2.5, 4 + r() * h * 0.16);
    }
    c.restore();
  }
  H.txt = txt; H.fadeCanvas = fade;

  // ------------------------------------------------------------ shared kit of small props (add into a builder under its transform)
  var K = H.kit = {};
  K.fishBox = function (b, o) {            // white foam fish box 0.62 x 0.2 x 0.38
    o = o || {};
    var hex = o.hex || G.jit(C.fishBox, 0.012);
    b.add(G.fx(G.boxB(0.62, 0.2, 0.38, hex), 0, 0.25));
    b.add(G.boxB(0.66, 0.035, 0.42, G.mix(hex, 0xb9c8cc, 0.25)).translate(0, 0.165, 0));
    if (o.open) {
      b.add(G.boxB(0.54, 0.02, 0.30, C.ice).translate(0, 0.19, 0), 'solidNC');
      for (var i = 0; i < 4; i++) {         // silver fish on ice
        var f = G.sph(0.06, i % 2 ? 0xb9c9d6 : 0x9fb6c8, 8, 5).scale(2.9, 0.5, 0.75).rotateY(0.15 * (i - 1.5)).translate(-0.02 + (i % 2) * 0.04, 0.215, -0.11 + i * 0.075);
        b.add(G.fx(f, 0, 0.7), 'solidNC');
        b.add(G.tri([0.2, 0.215, -0.11 + i * 0.075], [0.28, 0.215, -0.15 + i * 0.075], [0.28, 0.215, -0.07 + i * 0.075], 0x8fa7ba), 'solidDS');
      }
    } else if (o.lid !== false) {
      b.add(G.fx(G.boxB(0.64, 0.03, 0.40, G.mix(hex, 0xffffff, 0.4)).translate(0, 0.2, 0), 0, 0.3));
    }
    if (o.band) b.add(G.box(0.03, 0.235, 0.39, 0x3f88cb).translate(0.12, 0.117, 0));
  };
  K.crate = function (b, hex) {            // blue returnable crate 0.6 x 0.3 x 0.4 with slotted sides
    hex = hex || G.jit(C.crateBlue, 0.02);
    var dk = G.mix(hex, 0x0b2c55, 0.45);
    b.add(G.fx(G.boxB(0.6, 0.05, 0.4, hex), 0, 0.3));
    [[0, 0.19], [0, -0.19]].forEach(function (p) { b.add(G.fx(G.boxB(0.6, 0.3, 0.025, hex).translate(p[0], 0, p[1]), 0, 0.3)); });
    [[0.2875, 0], [-0.2875, 0]].forEach(function (p) { b.add(G.fx(G.boxB(0.025, 0.3, 0.4, hex).translate(p[0], 0, p[1]), 0, 0.3)); });
    b.add(G.fx(G.boxB(0.64, 0.04, 0.44, hex).translate(0, 0.27, 0), 0, 0.3));
    for (var i = 0; i < 5; i++) {
      b.add(G.box(0.07, 0.13, 0.012, dk).translate(-0.2 + i * 0.1, 0.14, 0.204), 'solidNC');
      b.add(G.box(0.07, 0.13, 0.012, dk).translate(-0.2 + i * 0.1, 0.14, -0.204), 'solidNC');
    }
    for (i = 0; i < 3; i++) {
      b.add(G.box(0.012, 0.13, 0.07, dk).translate(0.302, 0.14, -0.1 + i * 0.1), 'solidNC');
      b.add(G.box(0.012, 0.13, 0.07, dk).translate(-0.302, 0.14, -0.1 + i * 0.1), 'solidNC');
    }
    b.add(G.boxB(0.52, 0.01, 0.34, dk).translate(0, 0.05, 0), 'solidNC');
  };
  K.pallet = function (b) {
    for (var i = 0; i < 5; i++) b.add(G.fx(G.boxB(1.4, 0.03, 0.17, G.jit(C.woodLight, 0.04)).translate(0, 0.11, -0.46 + i * 0.23), 8, 0));
    for (i = 0; i < 3; i++) b.add(G.fx(G.boxB(0.1, 0.09, 1.1, C.wood).translate(-0.6 + i * 0.6, 0.02, 0), 8, 0));
    for (i = 0; i < 3; i++) b.add(G.fx(G.boxB(1.4, 0.02, 0.14, C.woodDark).translate(0, 0, -0.44 + i * 0.44), 8, 0));
  };
  // stack of fish boxes: nx * nz footprint, h layers, optional messy offsets
  K.fishStack = function (b, nx, nz, h, o) {
    o = o || {};
    for (var y = 0; y < h; y++) for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nz; iz++) {
      if (y === h - 1 && o.ragged && rnd() < 0.35) continue;
      var top = y === h - 1;
      b.group((ix - (nx - 1) / 2) * 0.68 + (rnd() - 0.5) * 0.03, y * 0.235, (iz - (nz - 1) / 2) * 0.44 + (rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06, 0, 1, function (bb) {
        K.fishBox(bb, { open: top && o.open && ix === 0 && iz === 0, band: rnd() < 0.3 });
      });
    }
  };
  K.crateStack = function (b, n, hexes) {
    for (var y = 0; y < n; y++) b.group((rnd() - 0.5) * 0.03, y * 0.3, (rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08, 0, 1, function (bb) {
      K.crate(bb, hexes ? hexes[y % hexes.length] : undefined);
    });
  };
  K.barrel = function (b, hex) {
    hex = hex || 0x3f7fbd;
    b.add(G.fx(G.lathe([[0, 0], [0.27, 0], [0.29, 0.04], [0.29, 0.3], [0.305, 0.32], [0.29, 0.34], [0.29, 0.6], [0.305, 0.62], [0.29, 0.64], [0.29, 0.86], [0.27, 0.9], [0.0, 0.9]], 14, hex), 0, 0.4));
    b.add(G.cylB(0.05, 0.05, 0.03, 6, 0xeef2ee).translate(0.15, 0.9, 0.05));
  };
  K.bucket = function (b, hex) {
    hex = hex || 0x3f9ad6;
    b.add(G.fx(G.lathe([[0, 0], [0.13, 0], [0.17, 0.3], [0.18, 0.3], [0.18, 0.32], [0.16, 0.32], [0.125, 0.03], [0, 0.03]], 12, hex), 0, 0.45), 'solidDS');
    b.add(G.tube([[-0.17, 0.3, 0], [-0.15, 0.42, 0.03], [0, 0.48, 0.06], [0.15, 0.42, 0.03], [0.17, 0.3, 0]], 0.008, 0xcfd6d9, 4, 14));
  };
  K.extinguisher = function (b) {
    b.add(G.fx(G.cylB(0.085, 0.085, 0.42, 10, C.red), 0, 0.5));
    b.add(G.sph(0.085, C.red, 10, 6).translate(0, 0.42, 0));
    b.add(G.cylB(0.03, 0.03, 0.1, 6, 0x2f3338).translate(0, 0.48, 0));
    b.add(G.box(0.16, 0.03, 0.03, 0x2f3338).translate(0.04, 0.59, 0));
    b.add(G.tube([[0, 0.55, 0], [-0.1, 0.5, 0.02], [-0.11, 0.3, 0.02]], 0.014, 0x2f3338, 4, 8));
  };

  // wall made of boxes around rectangular openings. axis 'x' (runs along x at z = c) or 'z'
  function wall(B, o) {
    var cuts = [o.a0, o.a1], i, k;
    var ops = o.openings || [];
    ops.forEach(function (p) { cuts.push(p.a0, p.a1); });
    cuts.sort(function (a, b) { return a - b; });
    var t = o.t || 0.18;
    function put(a0, a1, y0, y1) {
      if (a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return;
      var g = o.axis === 'x' ? G.boxMM(a0, y0, o.c - t / 2, a1, y1, o.c + t / 2, o.hex) : G.boxMM(o.c - t / 2, y0, a0, o.c + t / 2, y1, a1, o.hex);
      B.add(G.fx(g, o.fx || 0, o.gloss || 0), o.bucket);
    }
    for (i = 0; i < cuts.length - 1; i++) {
      var a0 = cuts[i], a1 = cuts[i + 1]; if (a1 - a0 < 1e-3 || a0 < o.a0 - 1e-6 || a1 > o.a1 + 1e-6) continue;
      var mid = (a0 + a1) / 2, ys = [];
      for (k = 0; k < ops.length; k++) if (mid > ops[k].a0 && mid < ops[k].a1) ys.push([ops[k].y0, ops[k].y1]);
      ys.sort(function (p, q) { return p[0] - q[0]; });
      var y = o.y0;
      for (k = 0; k < ys.length; k++) { put(a0, a1, y, ys[k][0]); y = ys[k][1]; }
      put(a0, a1, y, o.y1);
    }
  }
  H.wallWithOpenings = wall;

  // ------------------------------------------------------------ atlas prints
  function prints() {
    A.add('sign_kumiai', 1024, 160, function (c, w, h) {
      c.fillStyle = '#f2f1e6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2f6f8f'; c.fillRect(0, 0, w, 12); c.fillRect(0, h - 12, w, 12);
      txt(c, '汐見漁業協同組合', w * 0.44, h * 0.52, 92, '#2b5873', H.FONT_JP);
      txt(c, '第二', w * 0.89, h * 0.36, 44, '#b5503f'); txt(c, '倉庫', w * 0.89, h * 0.70, 44, '#b5503f');
      fade(c, w, h, 1.2, 11, '#f2f1e6');
    });
    A.add('blackboard', 768, 400, function (c, w, h) {
      c.fillStyle = '#2f4a40'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#b08a5a'; c.lineWidth = 16; c.strokeRect(8, 8, w - 16, h - 16);
      var r = H.mulberry(31);
      c.save(); c.globalAlpha = 0.10; c.fillStyle = '#ffffff';
      for (var i = 0; i < 26; i++) { c.beginPath(); c.ellipse(40 + r() * (w - 80), 40 + r() * (h - 80), 50 + r() * 90, 10 + r() * 22, r() * 0.5 - 0.25, 0, 7); c.fill(); }
      c.restore();
      txt(c, '本日のセリ値', w * 0.3, 62, 50, '#f6f4e6', H.FONT_HAND);
      txt(c, '（円／kg）', w * 0.72, 66, 30, '#f2e9a8', H.FONT_HAND);
      c.strokeStyle = 'rgba(246,244,230,0.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(40, 98); c.lineTo(w - 40, 100); c.stroke();
      var rows = [['真鯛', '1,850', '#f8c9c0'], ['鯵', '680', '#f6f4e6'], ['鯖', '450', '#f6f4e6'], ['烏賊', '920', '#cfe6f6'], ['鰤', '1,300', '#f6f4e6'], ['太刀魚', '1,100', '#f2e9a8']];
      rows.forEach(function (rw, k) {
        var col = k < 3 ? 0 : 1, ry = 148 + (k % 3) * 78, rx = 60 + col * 350;
        txt(c, rw[0], rx, ry, 52, rw[2], H.FONT_HAND, 'left');
        txt(c, rw[1], rx + 300, ry, 50, '#f6f4e6', H.FONT_HAND, 'right');
      });
      txt(c, '次回 入札 5:30', w * 0.74, h - 44, 28, '#f8c9c0', H.FONT_HAND);
      txt(c, '氷あり', w * 0.2, h - 44, 30, '#cfe6f6', H.FONT_HAND);
    });
    A.add('calendar', 200, 280, function (c, w, h) {
      c.fillStyle = '#fbfaf2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3f8fb6'; c.fillRect(0, 0, w, 86);
      txt(c, '7', w * 0.5, 44, 64, '#ffffff', H.FONT_EN);
      for (var i = 0; i < 31; i++) {
        var cx = 22 + (i % 7) * 26, cy = 112 + Math.floor(i / 7) * 34;
        txt(c, '' + (i + 1), cx, cy, 16, i % 7 === 0 ? '#d9503f' : '#44525a', H.FONT_EN, 'center', 'normal');
      }
      c.strokeStyle = '#d9503f'; c.lineWidth = 2.5; c.beginPath(); c.arc(22 + 3 * 26, 112 + 2 * 34, 12, 0, 7); c.stroke();
    });
    A.add('scale_dial', 200, 200, function (c, w, h) {
      c.fillStyle = '#f6f6ee'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a454c'; c.lineWidth = 2;
      for (var i = 0; i < 50; i++) {
        var a = i / 50 * Math.PI * 2, r0 = i % 5 ? 82 : 72;
        c.beginPath(); c.moveTo(100 + Math.cos(a) * r0, 100 + Math.sin(a) * r0); c.lineTo(100 + Math.cos(a) * 92, 100 + Math.sin(a) * 92); c.stroke();
      }
      txt(c, 'kg', 100, 140, 26, '#3a454c', H.FONT_EN);
      c.strokeStyle = '#d9503f'; c.lineWidth = 5; c.beginPath(); c.moveTo(100, 100); c.lineTo(100 + 70 * Math.cos(-2.2), 100 + 70 * Math.sin(-2.2)); c.stroke();
      c.fillStyle = '#3a454c'; c.beginPath(); c.arc(100, 100, 9, 0, 7); c.fill();
    });
    A.add('timetable', 520, 660, function (c, w, h) {
      c.fillStyle = '#f0ead6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#6fa5b8'; c.fillRect(0, 0, w, 96);
      txt(c, '定期船 時刻表', w / 2, 50, 50, '#fbfaf0');
      txt(c, '汐見港 発', w * 0.27, 134, 32, '#4a6a78'); txt(c, '沖ノ島 発', w * 0.75, 134, 32, '#4a6a78');
      c.strokeStyle = '#8fa9b3'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(w / 2, 108); c.lineTo(w / 2, h - 110); c.stroke();
      c.beginPath(); c.moveTo(24, 160); c.lineTo(w - 24, 160); c.stroke();
      var t1 = ['6:40', '8:15', '10:30', '13:05', '15:50', '17:30'], t2 = ['7:25', '9:00', '11:20', '14:10', '16:35', '18:10'];
      for (var i = 0; i < 6; i++) {
        var y = 204 + i * 62;
        txt(c, t1[i], w * 0.27, y, 44, i === 4 ? '#c9614f' : '#55656d', H.FONT_EN);
        txt(c, t2[i], w * 0.75, y, 44, '#55656d', H.FONT_EN);
        c.strokeStyle = 'rgba(143,169,179,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(24, y + 31); c.lineTo(w - 24, y + 31); c.stroke();
      }
      txt(c, '※ 荒天時は欠航することがあります', w / 2, h - 66, 24, '#7a6f62', H.FONT_JP, 'center', 'normal');
      txt(c, '汐見港 待合所', w / 2, h - 28, 22, '#7a6f62', H.FONT_JP, 'center', 'normal');
      fade(c, w, h, 2.4, 3, '#f7f2e4');
    });
    A.add('clock', 256, 256, function (c, w, h) {
      c.fillStyle = '#e9e6da'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fbfaf3'; c.beginPath(); c.arc(128, 128, 118, 0, 7); c.fill();
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2 - Math.PI / 2;
        txt(c, '' + (i === 0 ? 12 : i), 128 + Math.cos(a) * 92, 130 + Math.sin(a) * 92, 30, '#3f4a50', H.FONT_EN);
      }
      for (i = 0; i < 60; i++) {
        var a2 = i / 60 * Math.PI * 2; c.strokeStyle = '#6f7d83'; c.lineWidth = i % 5 ? 1.5 : 3.5;
        c.beginPath(); c.moveTo(128 + Math.cos(a2) * 110, 128 + Math.sin(a2) * 110); c.lineTo(128 + Math.cos(a2) * 116, 128 + Math.sin(a2) * 116); c.stroke();
      }
    });
    A.add('radio_face', 320, 180, function (c, w, h) {
      c.fillStyle = '#b08a62'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e6dcc2'; c.fillRect(14, 14, 150, h - 28);
      c.fillStyle = '#6a5a48';
      for (var i = 0; i < 9; i++) for (var j = 0; j < 9; j++) { c.beginPath(); c.arc(28 + i * 15.5, 28 + j * 15.5, 4.2, 0, 7); c.fill(); }
      c.fillStyle = '#f4efd8'; c.fillRect(178, 18, 128, 62);
      c.strokeStyle = '#5a4c40'; c.lineWidth = 2;
      for (i = 0; i < 12; i++) { c.beginPath(); c.moveTo(186 + i * 10, 30); c.lineTo(186 + i * 10, i % 3 ? 44 : 54); c.stroke(); }
      c.strokeStyle = '#d9503f'; c.lineWidth = 3; c.beginPath(); c.moveTo(262, 22); c.lineTo(262, 76); c.stroke();
      txt(c, 'AM  FM', 242, 68, 15, '#5a4c40', H.FONT_EN);
    });
    A.add('wait_sign', 900, 150, function (c, w, h) {
      c.fillStyle = '#f7f6ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3f8fb6'; c.fillRect(0, 0, 150, h);
      c.fillStyle = '#ffffff';            // little ferry pictogram
      c.beginPath(); c.moveTo(34, 86); c.lineTo(118, 86); c.lineTo(104, 108); c.lineTo(46, 108); c.closePath(); c.fill();
      c.fillRect(56, 62, 44, 24); c.fillRect(70, 44, 12, 18);
      txt(c, '汐見港', 268, h * 0.52, 78, '#2b5873');
      txt(c, '待合所', 580, h * 0.52, 88, '#34424a');
      txt(c, 'のりば', 800, h * 0.36, 36, '#c9614f'); txt(c, 'FERRY', 800, h * 0.72, 30, '#7f8d93', H.FONT_EN);
      fade(c, w, h, 1.0, 21, '#f7f6ee');
    });
    A.add('poster_sea', 300, 420, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#bfe6ee'); g.addColorStop(0.55, '#e9f6f2'); g.addColorStop(0.56, '#6fbfc4'); g.addColorStop(1, '#3f95a6');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(220, 96, 34, 0, 7); c.fill();
      c.fillStyle = '#f4f6f0'; c.beginPath(); c.moveTo(60, 250); c.lineTo(180, 250); c.lineTo(160, 280); c.lineTo(76, 280); c.closePath(); c.fill();
      c.fillRect(100, 222, 46, 28);
      txt(c, '海の日', w / 2, 340, 54, '#ffffff'); txt(c, 'みなと祭り', w / 2, 388, 30, '#fdf3c4');
      fade(c, w, h, 1.2, 9, '#ffffff');
    });
    A.add('poster_safe', 300, 420, function (c, w, h) {
      c.fillStyle = '#f6e9b8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e08a3c'; c.fillRect(0, 0, w, 80);
      txt(c, '安全第一', w / 2, 42, 50, '#ffffff');
      c.strokeStyle = '#e08a3c'; c.lineWidth = 16; c.beginPath(); c.arc(w / 2, 210, 70, 0, 7); c.stroke();
      c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 90, 198, 34, 24); c.fillRect(w / 2 + 56, 198, 34, 24); c.fillRect(w / 2 - 12, 120, 24, 34); c.fillRect(w / 2 - 12, 266, 24, 34);
      txt(c, '救命胴衣を着用', w / 2, 350, 30, '#6a5a3c'); txt(c, '汐見漁協', w / 2, 392, 22, '#8a7a5c', H.FONT_JP, 'center', 'normal');
      fade(c, w, h, 1.5, 13, '#f6f1dc');
    });
    A.add('vend_front', 400, 720, function (c, w, h) {
      c.fillStyle = '#eef3f4'; c.fillRect(0, 0, w, h);
      // lit display window
      var g = c.createLinearGradient(0, 30, 0, 330); g.addColorStop(0, '#fffdf0'); g.addColorStop(1, '#f6f1d8');
      c.fillStyle = g; c.fillRect(22, 30, w - 44, 300);
      var cols = ['#d9503f', '#3f8fb6', '#f4cb3c', '#4fa283', '#e9743c', '#7a5c9a', '#f7f8f3', '#2f6f8f'];
      for (var row = 0; row < 3; row++) {
        for (var i = 0; i < 8; i++) {
          var x = 36 + i * 42, y = 46 + row * 98;
          c.fillStyle = cols[(i * 3 + row * 5) % cols.length];
          c.beginPath(); c.roundRect(x, y, 28, 62, 6); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(x + 4, y + 20, 20, 16);
          c.fillStyle = row === 0 && i < 3 ? '#d9503f' : '#3f8fb6'; c.fillRect(x + 2, y + 70, 24, 12);
        }
        c.fillStyle = '#c9d3d6'; c.fillRect(22, 46 + row * 98 + 86, w - 44, 5);
      }
      c.fillStyle = '#3f8fb6'; c.fillRect(22, 350, w - 44, 52);
      txt(c, 'つめた〜い', 140, 377, 30, '#ffffff'); txt(c, 'あったか〜い', 296, 377, 22, '#fdd9c9');
      // coin slot panel
      c.fillStyle = '#d6dee0'; c.fillRect(250, 420, 124, 150);
      c.fillStyle = '#2f3a40'; c.fillRect(270, 440, 56, 10); c.fillRect(270, 470, 84, 34);
      c.fillStyle = '#7fdc9a'; c.fillRect(276, 476, 30, 22);
      c.fillStyle = '#d9503f'; c.beginPath(); c.arc(348, 446, 8, 0, 7); c.fill();
      c.fillStyle = '#2f3a40'; c.beginPath(); c.roundRect(280, 524, 60, 30, 8); c.fill();
      txt(c, '¥100', 110, 470, 54, '#3f8fb6', H.FONT_EN);
      txt(c, 'DRINK', 110, 520, 28, '#9fb0b6', H.FONT_EN);
      // delivery flap
      c.fillStyle = '#2f3a40'; c.beginPath(); c.roundRect(40, 610, w - 80, 72, 10); c.fill();
      c.fillStyle = '#56646b'; c.fillRect(54, 622, w - 108, 48);
      fade(c, w, h, 0.5, 17, '#ffffff');
    });
    A.add('vend_side', 200, 720, function (c, w, h) {
      c.fillStyle = '#e9eff0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3f8fb6'; c.fillRect(0, 120, w, 150);
      txt(c, '汐', w / 2, 196, 110, '#ffffff');
      c.fillStyle = '#d9503f'; c.fillRect(0, 286, w, 10);
      fade(c, w, h, 2.0, 19, '#f4f6f4');
      var r = H.mulberry(8); c.fillStyle = '#b06a3c';
      for (var i = 0; i < 30; i++) { c.globalAlpha = 0.25 + r() * 0.3; c.fillRect(r() * w, h - 150 + r() * 150, 2 + r() * 5, 10 + r() * 50); }
      c.globalAlpha = 1;
    });
    A.add('ticket', 300, 150, function (c, w, h) {
      c.fillStyle = '#f7f6ee'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3f8fb6'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
      txt(c, 'きっぷ うりば', w / 2, 54, 40, '#2b5873'); txt(c, '本日の営業は終了しました', w / 2, 108, 21, '#c9614f', H.FONT_JP, 'center', 'normal');
    });
    A.add('mat', 256, 160, function (c, w, h) {
      c.fillStyle = '#4f8f7d'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3c7566'; c.lineWidth = 4; for (var i = 0; i < 12; i++) { c.beginPath(); c.moveTo(0, i * 14 + 5); c.lineTo(w, i * 14 + 5); c.stroke(); }
      c.strokeStyle = '#e9f3ec'; c.lineWidth = 5; c.strokeRect(12, 12, w - 24, h - 24);
      txt(c, 'ようこそ', w / 2, h / 2, 44, '#e9f3ec');
    });
  }

  H.buildBuildings = function (B) {
    prints();
    var i, k, FY = QY + 0.02;

    // =============================================================== warehouse
    var X0 = 21.5, X1 = 31.5, Z0 = -12.5, Z1 = 0.5, EY = QY + 6.0, RY = QY + 7.45, XR = (X0 + X1) / 2;
    var wallC = 0xcfdfe0, wallC2 = 0xc3d5d8;
    H.WAREHOUSE = { x0: X0, x1: X1, z0: Z0, z1: Z1, ey: EY, ry: RY, door: { z0: -10.0, z1: -2.5, y1: QY + 4.3, open: QY + 2.25 } };
    var DZ0 = -10.0, DZ1 = -2.5, DY = QY + 4.3, OPEN = QY + 2.25;
    // floor (wet, reflective) + threshold
    var fl = new THREE.PlaneGeometry(X1 - X0 - 0.2, Z1 - Z0 - 0.2).rotateX(-Math.PI / 2).translate(XR, FY, (Z0 + Z1) / 2);
    B.add(G.paint(fl, 0xd0d8d4), 'ground');
    B.add(G.fx(G.boxMM(X0 - 0.5, QY, DZ0, X0 + 0.1, FY + 0.005, DZ1, 0xd9ddd8), 1, 0), 'solidNC');
    B.add(G.boxMM(X0 - 0.02, FY, DZ0, X0 + 0.06, FY + 0.03, DZ1, 0x8f9da1), 'solidNC');
    // walls with real openings so sunlight really gets in
    var westOps = [{ a0: DZ0, a1: DZ1, y0: QY, y1: DY }], hw = [];
    [-8.8, -6.25, -3.7, -1.15].forEach(function (zc) { westOps.push({ a0: zc - 0.8, a1: zc + 0.8, y0: QY + 4.95, y1: QY + 5.7 }); hw.push(zc); });
    wall(B, { axis: 'z', c: X0, a0: Z0, a1: Z1, y0: QY, y1: EY, openings: westOps, hex: wallC, fx: 9 });
    var southOps = [];
    [23.7, 26.5, 29.3].forEach(function (xc) { southOps.push({ a0: xc - 0.85, a1: xc + 0.85, y0: QY + 4.1, y1: QY + 5.0 }); });
    wall(B, { axis: 'x', c: Z1, a0: X0, a1: X1, y0: QY, y1: EY, openings: southOps, hex: wallC, fx: 9 });
    wall(B, { axis: 'x', c: Z0, a0: X0, a1: X1, y0: QY, y1: EY, hex: wallC2, fx: 9 });
    wall(B, { axis: 'z', c: X1, a0: Z0, a1: Z1, y0: QY, y1: EY, hex: wallC2, fx: 9 });
    // concrete skirt
    B.add(G.fx(G.boxMM(X0 - 0.12, QY, Z0 - 0.12, X0 + 0.1, QY + 0.55, DZ0, C.conc2), 1, 0));
    B.add(G.fx(G.boxMM(X0 - 0.12, QY, DZ1, X0 + 0.1, QY + 0.55, Z1 + 0.12, C.conc2), 1, 0));
    B.add(G.fx(G.boxMM(X0, QY, Z1 - 0.1, X1, QY + 0.55, Z1 + 0.12, C.conc2), 1, 0));
    B.add(G.fx(G.boxMM(X0, QY, Z0 - 0.12, X1, QY + 0.55, Z0 + 0.1, C.conc2), 1, 0));
    // gable triangles (north / south)
    [[Z1, 1], [Z0, -1]].forEach(function (gz) {
      var a = [X0, EY, gz[0]], b = [X1, EY, gz[0]], c = [XR, RY, gz[0]];
      B.add(G.fx(gz[1] > 0 ? G.tri(a, b, c, wallC) : G.tri(b, a, c, wallC2), 9, 0), 'solidDS');
      // round vent
      B.add(G.torus(0.42, 0.07, 0x8fa3a8, 6, 16).translate(XR, EY + 0.55, gz[0] + gz[1] * 0.1));
      for (k = 0; k < 4; k++) B.add(G.box(0.8 - Math.abs(k - 1.5) * 0.16, 0.05, 0.05, 0x7f9398).translate(XR, EY + 0.3 + k * 0.17, gz[0] + gz[1] * 0.1));
    });
    // roof: two corrugated slopes, ridge cap, gutters
    var ov = 0.55, half = (X1 - X0) / 2 + ov, sl = Math.hypot(half, RY - EY + 0.12), ang = Math.atan2(RY - EY + 0.12, half);
    [-1, 1].forEach(function (s) {
      var g = G.fx(G.box(sl, 0.1, Z1 - Z0 + ov * 2, 0x9db9c1), 9, 0.3);
      g.rotateZ(-s * ang);               // tilt down away from the ridge
      g.translate(XR + s * half / 2, (EY - 0.12 + RY) / 2 + 0.08, (Z0 + Z1) / 2);
      B.add(g);
      B.add(G.fx(G.cyl(0.11, 0.11, Z1 - Z0 + ov * 2, 8, 0x8fa3a8, true).rotateX(Math.PI / 2).translate(XR + s * (half + 0.05), EY - 0.2, (Z0 + Z1) / 2), 0, 0.3), 'solidDS');
    });
    B.add(G.fx(G.box(0.5, 0.12, Z1 - Z0 + ov * 2 + 0.1, 0x86a2ab).translate(XR, RY + 0.12, (Z0 + Z1) / 2), 0, 0.3));
    // downpipes
    [[X0 - 0.42, Z1 + 0.3], [X0 - 0.42, Z0 - 0.3]].forEach(function (p) {
      B.add(G.tube([[p[0] - 0.13, EY - 0.25, p[1]], [p[0] + 0.1, EY - 0.6, p[1]], [p[0] + 0.28, EY - 0.9, p[1]], [p[0] + 0.28, QY + 0.1, p[1]]], 0.06, 0x8fa3a8, 6, 16, false, 0.2));
    });
    // roof trusses seen from below
    [-11.0, -8.6, -6.2, -3.8, -1.4].forEach(function (z) {
      B.add(G.box(X1 - X0 - 0.2, 0.12, 0.1, 0x7f979d).translate(XR, EY - 0.1, z), 'solidNC');
      [-1, 1].forEach(function (s) {
        var r = G.box(sl - 0.6, 0.1, 0.1, 0x7f979d); r.rotateZ(-s * ang); r.translate(XR + s * half / 2 - s * 0.2, (EY + RY) / 2 - 0.08, z); B.add(r, 'solidNC');
        B.add(G.pipe([XR + s * 2.4, EY - 0.05, z], [XR + s * 1.1, RY - 0.42, z], 0.035, 0x7f979d, 4), 'solidNC');
      });
      B.add(G.pipe([XR, EY - 0.05, z], [XR, RY - 0.2, z], 0.035, 0x7f979d, 4), 'solidNC');
    });
    // hanging strip lights
    [-9.2, -5.0, -1.6].forEach(function (z) {
      [24.2, 28.6].forEach(function (x) {
        B.add(G.box(0.14, 0.07, 1.3, 0xe6ecec).translate(x, EY - 0.75, z), 'solidNC');
        B.add(G.box(0.08, 0.04, 1.2, 0xfffbe6).translate(x, EY - 0.8, z), 'glowFlat');
        B.add(G.pipe([x, EY - 0.7, z - 0.5], [x, EY - 0.1, z - 0.5], 0.008, 0x6f7f86, 3), 'solidNC');
        B.add(G.pipe([x, EY - 0.7, z + 0.5], [x, EY - 0.1, z + 0.5], 0.008, 0x6f7f86, 3), 'solidNC');
      });
    });
    // roller shutter: half raised curtain of slats, guides, box, bottom bar with warning tape
    var nSl = Math.round((DY - OPEN) / 0.13);
    for (i = 0; i < nSl; i++) {
      var sy = OPEN + 0.1 + i * ((DY - OPEN - 0.1) / nSl);
      B.add(G.fx(G.box(0.07, 0.115, DZ1 - DZ0 - 0.1, i % 7 === 3 ? 0xb9c9cc : 0xc6d4d6).rotateZ(0.12).translate(X0 - 0.02, sy + 0.06, (DZ0 + DZ1) / 2), 0, 0.3));
    }
    B.add(G.fx(G.box(0.1, 0.12, DZ1 - DZ0 - 0.1, 0x8fa0a6).translate(X0 - 0.02, OPEN + 0.04, (DZ0 + DZ1) / 2), 12, 0));
    [-2.2, 2.2].forEach(function (oz) { B.add(G.torus(0.09, 0.02, 0x5f6f76, 4, 10).rotateY(Math.PI / 2).translate(X0 - 0.09, OPEN + 0.02, (DZ0 + DZ1) / 2 + oz)); });
    [DZ0, DZ1].forEach(function (z) { B.add(G.fx(G.boxMM(X0 - 0.14, QY, z - 0.09, X0 + 0.14, DY + 0.1, z + 0.09, 0x8fa0a6), 3, 0)); });
    B.add(G.fx(G.boxMM(X0 - 0.36, DY, DZ0 - 0.2, X0 + 0.12, DY + 0.55, DZ1 + 0.2, 0xb4c4c8), 0, 0.2));
    // pull chain
    B.add(G.pipe([X0 - 0.2, DY, DZ1 + 0.3], [X0 - 0.2, QY + 1.2, DZ1 + 0.3], 0.012, 0x7f8c93, 3));
    // high window frames + glass
    hw.forEach(function (zc) {
      B.add(G.box(0.24, 0.06, 1.72, 0xf2f4ee).translate(X0, QY + 4.93, zc));
      B.add(G.box(0.24, 0.06, 1.72, 0xf2f4ee).translate(X0, QY + 5.72, zc));
      B.add(G.plane(1.56, 0.71, 0xd6f0f0).rotateY(-Math.PI / 2).translate(X0 - 0.045, QY + 5.325, zc), 'glass');
      B.add(G.box(0.1, 0.71, 0.04, 0xf2f4ee).translate(X0, QY + 5.325, zc));
      H.SHAFTS.push({ p: [[X0 + 0.1, QY + 4.97, zc - 0.76], [X0 + 0.1, QY + 4.97, zc + 0.76], [X0 + 0.1, QY + 5.68, zc + 0.76], [X0 + 0.1, QY + 5.68, zc - 0.76]], floor: FY, k: 1.0 });
    });
    [23.7, 26.5, 29.3].forEach(function (xc) {
      B.add(G.plane(1.66, 0.86, 0xd6f0f0).translate(xc, QY + 4.55, Z1 + 0.05), 'glass');
      B.add(G.box(1.84, 0.07, 0.24, 0xf2f4ee).translate(xc, QY + 4.07, Z1 + 0.02));
      B.add(G.box(1.84, 0.07, 0.24, 0xf2f4ee).translate(xc, QY + 5.03, Z1 + 0.02));
      B.add(G.box(0.05, 0.9, 0.22, 0xf2f4ee).translate(xc, QY + 4.55, Z1 + 0.02));
      H.SHAFTS.push({ p: [[xc - 0.83, QY + 4.12, Z1 - 0.1], [xc + 0.83, QY + 4.12, Z1 - 0.1], [xc + 0.83, QY + 4.98, Z1 - 0.1], [xc - 0.83, QY + 4.98, Z1 - 0.1]], floor: FY, k: 0.9 });
    });
    // the big door opening also lets a slab of light in
    H.SHAFTS.push({ p: [[X0 + 0.1, QY + 0.9, DZ0 + 0.3], [X0 + 0.1, QY + 0.9, DZ1 - 0.3], [X0 + 0.1, OPEN - 0.05, DZ1 - 0.3], [X0 + 0.1, OPEN - 0.05, DZ0 + 0.3]], floor: FY, k: 0.3 });
    // facade sign, lamp, side door
    B.add(A.quad('sign_kumiai', 6.4, 1.0).rotateY(-Math.PI / 2).translate(X0 - 0.38, DY + 0.28, (DZ0 + DZ1) / 2), 'atlas');
    B.add(G.box(0.08, 2.1, 1.0, 0x7fa3b0).translate(X0 - 0.1, QY + 1.07, -1.25));
    B.add(G.box(0.1, 0.5, 0.55, 0xbfe0e6).translate(X0 - 0.11, QY + 1.6, -1.25));
    B.add(G.sph(0.045, C.brass, 6, 4).translate(X0 - 0.17, QY + 1.05, -0.9));
    B.add(G.fx(G.boxB(1.2, 0.07, 0.5, C.rust).translate(X0 - 0.35, QY + 2.25, -1.25), 3, 0));
    B.group(X0 - 0.1, QY + 4.75, -1.6, 0, 0, 0, 1, function (b) {       // gooseneck wall lamp
      b.add(G.tube([[0, 0, 0], [-0.3, 0.12, 0], [-0.55, 0.0, 0]], 0.03, 0x7f8c93, 5, 10));
      b.add(G.fx(G.lathe([[0.05, 0], [0.24, -0.16], [0.26, -0.18], [0.05, -0.04]], 12, 0x4fa283).translate(-0.55, 0, 0), 0, 0.5), 'solidDS');
      b.add(G.sph(0.08, 0xfff4cf, 8, 6).translate(-0.55, -0.14, 0), 'glowFlat');
    });
    H.DRIPS.push({ x: X0 - 0.95, y: EY - 0.3, z: -11.0, rate: 0.6 }, { x: X0 - 0.95, y: EY - 0.3, z: -4.5, rate: 0.5 }, { x: X0 - 0.95, y: EY - 0.3, z: -0.6, rate: 0.45 });

    // ---------------- interior
    var ix1 = X1 - 0.1;  // inner face of the back (east) wall
    // blackboard with auction prices, opposite the door
    B.add(G.fx(G.box(0.07, 1.72, 3.2, C.wood).translate(ix1 - 0.04, QY + 2.2, -6.25), 8, 0), 'solidNC');
    B.add(A.quad('blackboard', 3.1, 1.62).rotateY(-Math.PI / 2).translate(ix1 - 0.085, QY + 2.2, -6.25), 'atlas');
    B.add(G.box(0.12, 0.05, 3.0, C.woodDark).translate(ix1 - 0.1, QY + 1.33, -6.25), 'solidNC');
    B.add(G.box(0.05, 0.035, 0.12, 0xf6f4e6).translate(ix1 - 0.12, QY + 1.375, -5.4), 'solidNC');
    B.add(G.box(0.07, 0.05, 0.18, 0x8a6f52).translate(ix1 - 0.12, QY + 1.385, -7.2), 'solidNC');
    // rain boots hanging on pegs
    B.add(G.fx(G.box(0.06, 0.1, 3.1, C.woodDark).translate(ix1 - 0.04, QY + 2.35, -2.3), 8, 0), 'solidNC');
    var bootCols = [0xf4f6f0, 0xf4cb3c, 0x2f5f7f, 0xf4f6f0, 0x3f8f6f, 0xf4f6f0];
    for (i = 0; i < 6; i++) {
      (function (bz, hex, tilt) {
        B.group(ix1 - 0.2, QY + 2.3, bz, 0, 0, tilt, 1, function (b) {
          b.add(G.pipe([0.16, 0.06, 0], [0.0, 0.0, 0], 0.016, 0x6f7d83, 4), 'solidNC');
          // boot hung upside-down by its sole: shaft down, foot up
          b.add(G.fx(G.cyl(0.085, 0.07, 0.42, 8, hex).translate(0, -0.3, 0), 0, 0.5), 'solidNC');
          b.add(G.fx(G.box(0.12, 0.1, 0.26, hex).translate(0, -0.06, 0.07), 0, 0.5), 'solidNC');
          b.add(G.box(0.13, 0.03, 0.28, 0x55626a).translate(0, 0.0, 0.07), 'solidNC');
          b.add(G.torus(0.078, 0.012, G.mix(hex, 0x000000, 0.2), 4, 10).rotateX(Math.PI / 2).translate(0, -0.51, 0), 'solidNC');
        });
      })(-3.6 + i * 0.5 + (i % 2) * 0.08, bootCols[i], (i % 2 ? 0.06 : -0.05));
    }
    B.add(A.quad('calendar', 0.5, 0.7).rotateY(-Math.PI / 2).translate(ix1 - 0.02, QY + 2.3, -9.3), 'atlas');
    B.add(A.quad('poster_safe', 0.66, 0.92).rotateY(-Math.PI / 2).translate(ix1 - 0.02, QY + 2.4, -10.5), 'atlas');
    // rubber apron on a hook
    B.add(G.fx(G.sway(G.box(0.03, 1.0, 0.6, 0x3f6f8f).translate(ix1 - 0.08, QY + 1.75, -0.6), 0.2, 2), 7, 0.4), 'solidNC');
    B.add(G.box(0.03, 0.2, 0.2, 0x3f6f8f).translate(ix1 - 0.08, QY + 2.3, -0.6), 'solidNC');
    // chest freezers along the back wall
    B.group(ix1 - 0.62, FY, -10.4, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.boxB(1.05, 0.95, 2.9, 0xf4f6f2), 0, 0.3));
      b.add(G.boxB(1.09, 0.07, 2.94, 0xdde5e6).translate(0, 0.95, 0));
      [-0.72, 0.72].forEach(function (oz) {
        b.add(G.fx(G.boxB(0.95, 0.04, 1.36, 0xcfe6ec).translate(0, 1.02, oz), 0, 0.6));
        b.add(G.box(0.05, 0.05, 0.5, 0x8f9da1).translate(-0.42, 1.08, oz));
      });
      b.add(G.box(0.02, 0.3, 0.9, 0x9fb0b4).translate(-0.535, 0.25, 0.8), 'solidNC');
      for (var q = 0; q < 6; q++) b.add(G.box(0.025, 0.02, 0.8, 0x6f7f86).translate(-0.54, 0.14 + q * 0.045, 0.8), 'solidNC');
      b.add(G.box(0.02, 0.1, 0.24, 0x2f3a40).translate(-0.535, 0.7, -1.0), 'solidNC');
      b.add(G.box(0.025, 0.04, 0.04, 0xff5a4a).translate(-0.54, 0.7, -0.93), 'glowFlat');
      b.add(G.box(0.025, 0.04, 0.04, 0x7fe08a).translate(-0.54, 0.7, -1.06), 'glowFlat');
    });
    // ice hopper + heap of crushed ice + scattered cubes on the wet floor
    B.group(29.2, FY, -11.7, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.boxB(1.4, 1.5, 0.9, 0xdfe7e8), 0, 0.3));
      b.add(G.box(1.0, 0.5, 0.04, 0x55626a).translate(0, 0.45, 0.46));
      b.add(G.fx(G.box(1.1, 0.06, 0.5, 0xaebcc0).rotateX(0.5).translate(0, 0.3, 0.66), 0, 0.4));
      var r = H.mulberry(5);
      for (var q = 0; q < 46; q++) {
        var a = r() * 6.28, d = r() * 0.6, s = 0.05 + r() * 0.06;
        b.add(G.fx(G.box(s, s, s, r() < 0.5 ? 0xeafafc : 0xcdeef4).rotateY(r() * 3).rotateX(r() * 3).translate(Math.cos(a) * d, 0.04 + (0.6 - d) * 0.35 * r(), 0.95 + Math.sin(a) * d * 0.6), 0, 0.9), 'solidNC');
      }
    });
    var ri = H.mulberry(61);
    for (i = 0; i < 70; i++) {
      var ixp = 22.4 + ri() * 8.2, izp = -11.2 + ri() * 10.8, s = 0.04 + ri() * 0.05;
      if (ri() < 0.5) { ixp = 26.4 + ri() * 3.4; izp = -10.6 + ri() * 2.6; }
      B.add(G.fx(G.box(s, s * 0.8, s, ri() < 0.5 ? 0xeafafc : 0xcfeff5).rotateY(ri() * 3).translate(ixp, FY + s * 0.4, izp), 0, 0.9), 'solidNC');
    }
    // platform scale
    B.group(24.3, FY, -8.7, 0, 0.5, 0, 1, function (b) {
      b.add(G.fx(G.boxB(0.9, 0.12, 0.7, 0x5f8fa8), 0, 0.3));
      b.add(G.fx(G.boxB(0.82, 0.03, 0.62, 0xb9c6ca).translate(0, 0.12, 0), 0, 0.6));
      b.add(G.boxB(0.09, 1.15, 0.07, 0x5f8fa8).translate(0, 0.1, -0.33));
      b.add(G.cyl(0.26, 0.26, 0.12, 20, 0x5f8fa8).rotateX(Math.PI / 2).translate(0, 1.38, -0.33));
      b.add(A.quad('scale_dial', 0.44, 0.44).translate(0, 1.38, -0.265), 'atlas');
      b.add(G.torus(0.25, 0.025, 0xdfe7e8, 5, 20).translate(0, 1.38, -0.27));
      for (var q = 0; q < 4; q++) b.add(G.cylB(0.04, 0.05, 0.05, 6, 0x2f3338).translate((q % 2 ? 1 : -1) * 0.36, -0.03, (q < 2 ? 1 : -1) * 0.27));
    });
    // stacks of fish boxes on pallets
    var stacks = [[23.4, -4.1, 0.1, 2, 2, 5, true], [25.6, -3.4, -0.08, 2, 2, 6, false], [27.8, -3.9, 0.3, 2, 1, 4, true], [24.2, -11.4, 0, 2, 2, 6, false], [26.3, -11.5, 0.05, 2, 2, 4, false], [30.2, -4.6, 1.57, 2, 2, 5, false], [22.9, -1.0, 1.5, 2, 2, 3, true]];
    stacks.forEach(function (s) {
      B.group(s[0], FY, s[1], 0, s[2], 0, 1, function (b) {
        K.pallet(b);
        b.group(0, 0.14, 0, 0, 0, 0, 1, function (bb) { K.fishStack(bb, s[3], s[4], s[5], { open: s[6], ragged: true }); });
      });
    });
    // blue crates, barrels, sorting table with an open box of fish
    [[29.9, -1.3, 4], [30.5, -1.9, 3], [29.2, -0.9, 2], [22.6, -11.3, 3]].forEach(function (c) {
      B.group(c[0], FY, c[1], 0, rnd() * 0.5, 0, 1, function (b) { K.crateStack(b, c[2]); });
    });
    [[30.6, -7.9], [30.6, -8.6], [30.0, -8.3]].forEach(function (p, q) {
      B.group(p[0], FY, p[1], 0, 0, 0, 1, function (b) { K.barrel(b, q === 2 ? 0xe9eef0 : 0x3f7fbd); });
    });
    B.group(28.0, FY, -7.3, 0, 0.2, 0, 1, function (b) {
      b.add(G.fx(G.boxB(1.8, 0.05, 0.8, 0xc9d3d6).translate(0, 0.8, 0), 0, 0.7));
      [[-0.82, -0.33], [0.82, -0.33], [-0.82, 0.33], [0.82, 0.33]].forEach(function (p) { b.add(G.boxB(0.05, 0.8, 0.05, 0xaebcc0).translate(p[0], 0, p[1])); });
      b.add(G.boxB(1.7, 0.03, 0.7, 0xb9c6ca).translate(0, 0.25, 0));
      b.group(-0.4, 0.85, 0, 0, 0.1, 0, 1, function (bb) { K.fishBox(bb, { open: true }); });
      b.group(0.45, 0.85, 0.05, 0, -0.2, 0, 1, function (bb) { K.fishBox(bb, { lid: false }); });
      b.group(0.3, 0.28, 0, 0, 0, 0, 1, function (bb) { K.bucket(bb, 0xf4cb3c); });
    });
    // pallet jack
    B.group(26.6, FY, -7.9, 0, -0.6, 0, 1, function (b) {
      [-0.2, 0.2].forEach(function (oz) { b.add(G.boxB(1.15, 0.06, 0.16, 0xe08a3c).translate(0.3, 0.06, oz)); });
      b.add(G.boxB(0.25, 0.4, 0.56, 0xe08a3c).translate(-0.4, 0.06, 0));
      b.add(G.tube([[-0.42, 0.45, 0], [-0.62, 0.9, 0], [-0.72, 1.18, 0]], 0.025, 0x2f3338, 5, 8));
      b.add(G.torus(0.11, 0.022, 0x2f3338, 5, 12).rotateY(Math.PI / 2).translate(-0.74, 1.26, 0));
      b.add(G.cyl(0.09, 0.09, 0.12, 10, 0x2f3338).rotateX(Math.PI / 2).translate(-0.5, 0.09, 0));
    });
    // hose on a wall reel + green hose snaking over the floor
    B.add(G.torus(0.3, 0.07, 0x4fa283, 6, 16).rotateY(Math.PI / 2).translate(X0 + 0.25, QY + 1.3, -11.4), 'solidNC');
    B.add(G.torus(0.3, 0.06, 0x4fa283, 6, 16).rotateY(Math.PI / 2).translate(X0 + 0.37, QY + 1.3, -11.4), 'solidNC');
    B.add(G.tube([[X0 + 0.3, QY + 1.0, -11.4], [X0 + 0.5, FY + 0.05, -11.2], [23.2, FY + 0.04, -10.2], [24.6, FY + 0.04, -9.9], [25.3, FY + 0.04, -9.0], [24.9, FY + 0.04, -7.6], [25.6, FY + 0.04, -6.6]], 0.035, 0x4fa283, 5, 40), 'solidNC');
    B.add(G.cyl(0.03, 0.045, 0.14, 6, C.brass).rotateZ(Math.PI / 2).rotateY(-0.9).translate(25.66, FY + 0.045, -6.52), 'solidNC');
    B.group(X0 + 0.25, FY, -2.0, 0, 0, 0, 1, function (b) { K.extinguisher(b); });
    // floor drain
    B.add(G.box(0.5, 0.012, 0.5, 0x6f7f86).translate(25.8, FY + 0.006, -5.4), 'solidNC');
    for (i = 0; i < 5; i++) B.add(G.box(0.44, 0.014, 0.04, 0x3a454c).translate(25.8, FY + 0.008, -5.6 + i * 0.1), 'solidNC');
    // water-light dancing on the ceiling and upper back wall
    H.CAUSTICS.push({ p: [[X0 + 0.3, EY - 0.18, DZ0 - 0.6], [X0 + 0.3, EY - 0.18, DZ1 + 0.6], [XR + 1.5, RY - 0.75, DZ1 + 0.6], [XR + 1.5, RY - 0.75, DZ0 - 0.6]], k: 1.0, s: 0.9 });
    H.CAUSTICS.push({ p: [[ix1 - 0.03, QY + 3.3, DZ0 - 0.8], [ix1 - 0.03, QY + 3.3, DZ1 + 0.8], [ix1 - 0.03, EY - 0.3, DZ1 + 0.8], [ix1 - 0.03, EY - 0.3, DZ0 - 0.8]], k: 0.7, s: 0.9 });

    // =============================================================== waiting room
    var wx0 = 23.4, wx1 = 31.2, wz0 = 4.3, wz1 = 11.3, wh = 3.25, wy = QY + 0.12;
    H.WAITROOM = { x0: wx0, x1: wx1, z0: wz0, z1: wz1, y: wy, h: wh };
    var frameC = 0xdfe6e6, wallW = 0xf2efe4;
    // plinth + interior floor (pale linoleum, slightly glossy)
    B.add(G.fx(G.boxMM(wx0 - 0.25, QY, wz0 - 0.2, wx1 + 0.2, wy, wz1 + 0.25, C.conc2), 1, 0));
    B.add(G.fx(G.boxMM(wx0, wy - 0.01, wz0, wx1, wy + 0.012, wz1, 0xe9e2cf), 0, 0.5), 'solidNC');
    for (i = 0; i < 6; i++) B.add(G.box(wx1 - wx0, 0.004, 0.02, 0xd3ccb8).translate((wx0 + wx1) / 2, wy + 0.015, wz0 + 1.0 + i * 1.1), 'solidNC');
    // solid walls: north + east, and the service block on the north part of the west side
    wall(B, { axis: 'x', c: wz0, a0: wx0, a1: wx1, y0: wy, y1: wy + wh, hex: wallW, openings: [{ a0: 28.4, a1: 29.8, y0: wy + 1.6, y1: wy + 2.5 }] });
    wall(B, { axis: 'z', c: wx1, a0: wz0, a1: wz1, y0: wy, y1: wy + wh, hex: wallW });
    wall(B, { axis: 'z', c: wx0, a0: wz0, a1: wz0 + 2.3, y0: wy, y1: wy + wh, hex: wallW });
    B.add(G.plane(1.3, 0.82, 0xd6f0f0).translate(29.1, wy + 2.05, wz0), 'glass');
    B.add(G.box(1.5, 0.06, 0.26, frameC).translate(29.1, wy + 1.58, wz0)); B.add(G.box(1.5, 0.06, 0.26, frameC).translate(29.1, wy + 2.52, wz0));
    // timber wainscot inside
    B.add(G.fx(G.boxMM(wx0 + 0.1, wy, wz0 + 0.09, wx1 - 0.09, wy + 0.95, wz0 + 0.13, C.woodLight), 8, 0), 'solidNC');
    B.add(G.fx(G.boxMM(wx1 - 0.13, wy, wz0 + 0.1, wx1 - 0.09, wy + 0.95, wz1 - 0.1, C.woodLight), 8, 0), 'solidNC');
    // glazing: west (from the service block to the south corner) and the whole south front
    function mullion(x, z) { B.add(G.boxB(0.09, wh, 0.09, frameC).translate(x, wy, z)); }
    var zs = [wz0 + 2.3, wz0 + 3.45, wz0 + 4.6, wz0 + 5.8, wz1];
    zs.forEach(function (z) { mullion(wx0, z); });
    var doorOpen = 0.55;   // the sliding door on the west stands partly open
    for (i = 0; i < zs.length - 1; i++) {
      var za = zs[i], zb = zs[i + 1];
      if (i === 1) {     // sliding door leaf, slid half over the next bay
        B.add(G.plane(zb - za - 0.06, wh - 0.5, 0xd6f0f0).rotateY(-Math.PI / 2).translate(wx0 + 0.07, wy + (wh - 0.5) / 2 + 0.05, (za + zb) / 2 + doorOpen), 'glass');
        B.add(G.box(0.05, wh - 0.45, 0.06, frameC).translate(wx0 + 0.07, wy + (wh - 0.45) / 2, za + doorOpen + 0.02));
        B.add(G.box(0.05, wh - 0.45, 0.06, frameC).translate(wx0 + 0.07, wy + (wh - 0.45) / 2, zb + doorOpen - 0.02));
        B.add(G.box(0.05, 0.06, zb - za, frameC).translate(wx0 + 0.07, wy + 0.05, (za + zb) / 2 + doorOpen));
        B.add(G.box(0.05, 0.06, zb - za, frameC).translate(wx0 + 0.07, wy + wh - 0.42, (za + zb) / 2 + doorOpen));
        B.add(G.box(0.03, 0.3, 0.04, 0x8f9da1).translate(wx0 + 0.02, wy + 1.15, za + doorOpen + 0.1));
        B.add(G.plane(zb - za, 0.4, 0xd6f0f0).rotateY(-Math.PI / 2).translate(wx0, wy + wh - 0.2, (za + zb) / 2), 'glass');
      } else {
        B.add(G.plane(zb - za, wh - 0.08, 0xd6f0f0).rotateY(-Math.PI / 2).translate(wx0, wy + wh / 2, (za + zb) / 2), 'glass');
      }
    }
    B.add(G.boxMM(wx0 - 0.05, wy + wh - 0.42, wz0 + 2.3, wx0 + 0.05, wy + wh - 0.36, wz1, frameC));
    var xs = [wx0, wx0 + 1.56, wx0 + 3.12, wx0 + 4.68, wx0 + 6.24, wx1];
    xs.forEach(function (x) { mullion(x, wz1); });
    for (i = 0; i < xs.length - 1; i++) B.add(G.plane(xs[i + 1] - xs[i], wh - 0.08, 0xd6f0f0).translate((xs[i] + xs[i + 1]) / 2, wy + wh / 2, wz1), 'glass');
    B.add(G.boxMM(wx0, wy + wh - 0.42, wz1 - 0.05, wx1, wy + wh - 0.36, wz1 + 0.05, frameC));
    B.add(G.boxMM(wx0 - 0.06, wy, wz1 - 0.06, wx1, wy + 0.1, wz1 + 0.06, frameC));
    B.add(G.boxMM(wx0 - 0.06, wy, wz0 + 2.3, wx0 + 0.06, wy + 0.1, wz1, frameC));
    // flat roof with deep overhang, fascia sign, ceiling
    B.add(G.fx(G.boxMM(wx0 - 1.3, wy + wh, wz0 - 0.3, wx1 + 0.25, wy + wh + 0.28, wz1 + 1.3, 0xe9eeec), 0, 0.2));
    B.add(G.boxMM(wx0 - 1.36, wy + wh + 0.28, wz0 - 0.36, wx1 + 0.3, wy + wh + 0.36, wz1 + 1.36, 0x7fa9b8));
    B.add(G.boxMM(wx0 + 0.1, wy + wh - 0.03, wz0 + 0.1, wx1 - 0.1, wy + wh, wz1 - 0.1, 0xf7f6ee), 'solidNC');
    B.add(A.quad('wait_sign', 4.6, 0.77).translate(wx0 + 3.2, wy + wh + 0.72, wz1 + 1.25), 'atlas');
    B.add(G.box(4.8, 0.9, 0.08, 0xf2f1e8).translate(wx0 + 3.2, wy + wh + 0.72, wz1 + 1.2));
    [-2.0, 2.0].forEach(function (ox) { B.add(G.boxB(0.07, 0.3, 0.07, 0x8f9da1).translate(wx0 + 3.2 + ox, wy + wh + 0.3, wz1 + 1.18)); });
    // canopy posts
    [[wx0 - 1.15, wz1 + 1.15], [wx1, wz1 + 1.15], [wx0 - 1.15, wz0 + 2.4]].forEach(function (p) { B.add(G.fx(G.boxB(0.12, wh + 0.12, 0.12, 0xb9c6ca).translate(p[0], QY, p[1]), 3, 0)); });
    H.DRIPS.push({ x: wx0 - 1.36, y: wy + wh + 0.2, z: wz1 - 1.0, rate: 0.5 }, { x: wx0 + 2.0, y: wy + wh + 0.2, z: wz1 + 1.36, rate: 0.55 }, { x: wx0 + 5.5, y: wy + wh + 0.2, z: wz1 + 1.36, rate: 0.4 });
    // ceiling lights
    [[25.6, 8.9], [29.0, 8.9], [27.3, 6.0]].forEach(function (p) {
      B.add(G.box(1.2, 0.05, 0.22, 0xe9eeec).translate(p[0], wy + wh - 0.06, p[1]), 'solidNC');
      B.add(G.box(1.1, 0.03, 0.12, 0xfffbe6).translate(p[0], wy + wh - 0.1, p[1]), 'glowFlat');
    });

    // ---------------- interior furnishing
    function bench(x, z, ry, len) {
      B.group(x, wy, z, 0, ry, 0, 1, function (b) {
        for (var q = 0; q < 4; q++) b.add(G.fx(G.boxB(len, 0.045, 0.1, G.jit(C.wood, 0.03)).translate(0, 0.42, -0.165 + q * 0.11), 8, 0.15));
        for (q = 0; q < 3; q++) b.add(G.fx(G.box(len, 0.1, 0.035, G.jit(C.wood, 0.03)).rotateX(-0.2).translate(0, 0.62 + q * 0.13, -0.25 - q * 0.027), 8, 0.15));
        [-1, 0, 1].forEach(function (s) {
          var ox = s * (len / 2 - 0.25);
          b.add(G.boxB(0.05, 0.42, 0.05, 0x55626a).translate(ox, 0, 0.16));
          b.add(G.boxB(0.05, 0.95, 0.05, 0x55626a).rotateX(-0.12).translate(ox, 0, -0.2));
          b.add(G.box(0.05, 0.05, 0.42, 0x55626a).translate(ox, 0.39, -0.02));
        });
      });
    }
    bench(26.2, 9.2, Math.PI, 3.0);          // faces the sea-side glass
    bench(26.2, 8.55, 0, 3.0);               // back to back
    bench(30.55, 8.0, -Math.PI / 2, 2.6);    // along the east wall
    // a paper bag and a folded newspaper left on the bench
    B.add(G.box(0.3, 0.02, 0.22, 0xf0ede0).rotateY(0.3).translate(25.5, wy + 0.48, 9.2), 'solidNC');
    B.add(G.box(0.2, 0.26, 0.12, 0xd9b98c).translate(27.2, wy + 0.6, 9.22), 'solidNC');
    // faded timetable + posters on the north wall (seen through the south glass)
    var nz0 = wz0 + 0.1;
    B.add(G.box(1.36, 1.72, 0.03, 0xb9a98c).translate(26.6, wy + 2.0, nz0), 'solidNC');
    B.add(A.quad('timetable', 1.28, 1.62).translate(26.6, wy + 2.0, nz0 + 0.03), 'atlas');
    B.add(A.quad('poster_sea', 0.72, 1.0).rotateZ(-0.03).translate(24.9, wy + 2.05, nz0 + 0.02), 'atlas');
    B.add(A.quad('poster_safe', 0.6, 0.84).rotateZ(0.04).translate(28.0, wy + 2.3, nz0 + 0.02), 'atlas');
    // wall clock, hanging a little crooked
    B.group(30.1, wy + 2.62, nz0 + 0.03, 0, 0, -0.16, 1, function (b) {
      b.add(G.cyl(0.36, 0.36, 0.07, 24, 0x6f5a48).rotateX(Math.PI / 2), 'solidNC');
      b.add(A.quad('clock', 0.66, 0.66).translate(0, 0, 0.04), 'atlas');
      b.add(G.box(0.03, 0.2, 0.012, 0x2f3338).translate(0, 0.075, 0.055).rotateZ(-2.25), 'solidNC');  // hour hand ~ 4:20
      b.add(G.box(0.02, 0.28, 0.012, 0x2f3338).translate(0, 0.12, 0.06).rotateZ(-2.1 - 0.0), 'solidNC');
      b.add(G.cyl(0.02, 0.02, 0.02, 8, 0xd9503f).rotateX(Math.PI / 2).translate(0, 0, 0.07), 'solidNC');
      b.add(G.torus(0.345, 0.03, 0x8a6f52, 5, 24).translate(0, 0, 0.035), 'solidNC');
    });
    H.CLOCK = { x: 30.1, y: wy + 2.62, z: nz0 + 0.1 };
    // ticket window on the east wall (closed for the day)
    var ex = wx1 - 0.1;
    B.add(G.box(0.05, 1.0, 1.5, 0x9fb6c0).translate(ex - 0.02, wy + 1.75, 5.6), 'solidNC');
    B.add(G.box(0.06, 0.9, 1.4, 0xcbd6d8).translate(ex - 0.04, wy + 1.75, 5.6), 'solidNC');
    for (i = 0; i < 7; i++) B.add(G.box(0.07, 0.02, 1.4, 0xaebcc0).translate(ex - 0.05, wy + 1.38 + i * 0.125, 5.6), 'solidNC');
    B.add(G.box(0.4, 0.05, 1.6, C.wood).translate(ex - 0.2, wy + 1.22, 5.6), 'solidNC');
    B.add(A.quad('ticket', 1.0, 0.5).rotateY(-Math.PI / 2).translate(ex - 0.03, wy + 2.6, 5.6), 'atlas');
    // shelf with the old radio (aerial up)
    B.group(ex - 0.32, wy + 1.22, 10.2, 0, -Math.PI / 2, 0, 1, function (b) {
      b.add(G.fx(G.box(1.2, 0.05, 0.5, C.wood).translate(0, -0.03, 0), 8, 0));
      [-0.5, 0.5].forEach(function (ox) { b.add(G.tri([ox, -0.05, -0.25], [ox, -0.05, 0.15], [ox, -0.4, -0.25], C.woodDark), 'solidDS'); });
      b.add(G.fx(G.rbox(0.62, 0.36, 0.2, 0.04, 0xb08a62, 0.015).translate(0, 0.18, 0), 8, 0.2));
      b.add(A.quad('radio_face', 0.58, 0.325).translate(0, 0.18, 0.103), 'atlas');
      b.add(G.cyl(0.035, 0.035, 0.03, 10, 0xe6dcc2).rotateX(Math.PI / 2).translate(0.12, 0.08, 0.11));
      b.add(G.cyl(0.035, 0.035, 0.03, 10, 0xe6dcc2).rotateX(Math.PI / 2).translate(0.23, 0.08, 0.11));
      b.add(G.pipe([0.26, 0.36, -0.05], [0.42, 0.9, -0.08], 0.008, 0xcfd6d9, 4));
      b.add(G.tube([[-0.2, 0.36, 0], [-0.1, 0.44, 0], [0.1, 0.44, 0], [0.2, 0.36, 0]], 0.012, 0x6a5a48, 4, 10));
      // small stack of magazines beside it
      b.add(G.box(0.26, 0.05, 0.34, 0xd9e6ea).rotateY(0.2).translate(-0.42, 0.025, 0));
      b.add(G.box(0.25, 0.02, 0.33, 0xe9b0a0).rotateY(-0.1).translate(-0.42, 0.06, 0));
    });
    // corner: paraffin stove with the kettle on top, and the pothos on a stand
    B.group(24.3, wy, 5.2, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.cylB(0.26, 0.28, 0.5, 14, 0xe9e6da), 0, 0.3));
      b.add(G.cylB(0.3, 0.3, 0.04, 14, 0x55626a).translate(0, 0.5, 0));
      b.add(G.cylB(0.3, 0.32, 0.05, 14, 0x55626a));
      for (var q = 0; q < 10; q++) { var a = q / 10 * 6.28; b.add(G.pipe([Math.cos(a) * 0.2, 0.52, Math.sin(a) * 0.2], [Math.cos(a) * 0.2, 0.74, Math.sin(a) * 0.2], 0.008, 0x8f9da1, 3)); }
      b.add(G.cylB(0.22, 0.22, 0.03, 14, 0x8f9da1).translate(0, 0.74, 0));
      // kettle
      b.add(G.fx(G.lathe([[0, 0], [0.15, 0], [0.17, 0.05], [0.16, 0.14], [0.11, 0.2], [0.05, 0.215], [0, 0.215]], 14, 0xe2b65a).translate(0, 0.77, 0), 0, 0.8));
      b.add(G.sph(0.022, 0x2f3338, 6, 4).translate(0, 1.0, 0));
      b.add(G.fx(G.tube([[0.14, 0.86, 0], [0.24, 0.9, 0], [0.29, 0.97, 0]], 0.018, 0xe2b65a, 5, 8), 0, 0.8));
      b.add(G.tube([[-0.11, 0.95, 0], [-0.08, 1.08, 0], [0.08, 1.08, 0], [0.11, 0.95, 0]], 0.012, 0x2f3338, 4, 10));
    });
    B.group(24.2, wy, 10.5, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.cylB(0.2, 0.2, 0.04, 10, C.wood).translate(0, 0.72, 0), 8, 0));
      [0, 2.1, 4.2].forEach(function (a) { b.add(G.fx(G.pipe([Math.cos(a) * 0.16, 0.72, Math.sin(a) * 0.16], [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], 0.018, C.woodDark, 5), 8, 0)); });
      b.add(G.fx(G.lathe([[0, 0], [0.12, 0], [0.17, 0.22], [0.185, 0.22], [0.185, 0.26], [0.15, 0.26], [0.1, 0.03], [0, 0.03]], 12, 0xe7ded0).translate(0, 0.76, 0), 0, 0.5), 'solidDS');
      // pothos: heart leaves on trailing vines
      var r = H.mulberry(23);
      for (var v = 0; v < 7; v++) {
        var a0 = v / 7 * 6.28 + r(), len = 0.35 + r() * 0.75, px = 0, py = 1.02, pz = 0;
        var pts = [[0, 1.0, 0]];
        for (var q = 1; q <= 5; q++) {
          var t = q / 5; px = Math.cos(a0) * (0.12 + t * 0.2); pz = Math.sin(a0) * (0.12 + t * 0.2); py = 1.02 + 0.12 * Math.sin(t * 3.1) - t * t * len;
          pts.push([px, py, pz]);
          var leaf = G.sph(0.07, r() < 0.3 ? 0x9fd67f : (r() < 0.5 ? 0x5fae62 : 0x4f9a5c), 6, 4).scale(1, 0.18, 0.8);
          leaf.rotateZ(-0.5 - r() * 0.6).rotateY(-a0 + (r() - 0.5));
          leaf.translate(px + (r() - 0.5) * 0.08, py + 0.02, pz + (r() - 0.5) * 0.08);
          b.add(G.fx(G.sway(leaf, 0.1, v), 7, 0.2), 'solidNC');
        }
        b.add(G.tube(pts, 0.008, 0x4f8a50, 3, 10), 'solidNC');
      }
      for (v = 0; v < 6; v++) {
        var lf = G.sph(0.08, v % 2 ? 0x6fb86a : 0x8fcf78, 6, 4).scale(1, 0.2, 0.8).rotateZ(0.5).rotateY(v * 1.05).translate(Math.cos(v * 1.05) * 0.08, 1.08 + (v % 3) * 0.04, -Math.sin(v * 1.05) * 0.08);
        b.add(G.fx(lf, 0, 0.2), 'solidNC');
      }
    });
    // umbrella stand, bin, door mat, notice shelf
    B.group(24.0, wy, 7.2, 0, 0, 0, 1, function (b) {
      b.add(G.cylB(0.16, 0.14, 0.5, 10, 0x6f8f9a, true), 'solidDS');
      b.add(G.cylB(0.14, 0.14, 0.02, 10, 0x5f7f8a));
      b.add(G.pipe([0.03, 0.05, 0.02], [0.1, 0.95, 0.06], 0.02, 0x2f5f7f, 5));
      b.add(G.torus(0.05, 0.012, 0x8a6f52, 4, 8, Math.PI).translate(0.15, 0.95, 0.06));
    });
    B.add(G.fx(G.cylB(0.2, 0.17, 0.55, 10, 0x8fa9b3).translate(30.6, wy, 10.9), 0, 0.3));
    B.add(A.quad('mat', 1.2, 0.75).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(wx0 + 0.9, wy + 0.02, (zs[1] + zs[2]) / 2 + 0.3), 'atlas');
    // caustics on the waiting room ceiling near the glass front
    H.CAUSTICS.push({ p: [[wx0 + 0.2, wy + wh - 0.04, wz1 - 3.2], [wx0 + 0.2, wy + wh - 0.04, wz1 - 0.2], [wx0 + 5.5, wy + wh - 0.04, wz1 - 0.2], [wx0 + 5.5, wy + wh - 0.04, wz1 - 3.2]], k: 0.5, s: 1.0 });

    // =============================================================== vending machine under a rusty canopy (west face of the service block)
    B.group(wx0 - 0.48, QY, wz0 + 1.1, 0, -Math.PI / 2, 0, 1, function (b) {
      b.add(G.fx(G.boxB(1.0, 0.08, 0.8, C.conc3), 1, 0));
      b.add(G.fx(G.boxB(0.95, 1.83, 0.72, 0xeef3f4).translate(0, 0.08, 0), 0, 0.3));
      b.add(A.quad('vend_front', 0.95, 1.71).translate(0, 0.08 + 0.915, 0.362), 'atlas');
      // softly glowing display
      var r = A.regions.vend_front;
      var lit = A.quad('vend_front', 0.845, 0.71);
      (function () {        // crop uv to the display window (y 30..330 of 720, x 22..378 of 400)
        var S = A.size, uv = lit.attributes.uv.array;
        var u0 = (r.x + 22) / S, u1 = (r.x + 378) / S, v1 = 1 - (r.y + 30) / S, v0 = 1 - (r.y + 330) / S;
        uv[0] = u0; uv[1] = v1; uv[2] = u1; uv[3] = v1; uv[4] = u0; uv[5] = v0; uv[6] = u1; uv[7] = v0;
      })();
      b.add(lit.translate(0, 0.08 + 1.83 - 0.07 - 0.36, 0.366), 'glow');
      b.add(A.quad('vend_side', 0.72, 1.83).rotateY(Math.PI / 2).translate(0.477, 0.08 + 0.915, 0), 'atlas');
      b.add(A.quad('vend_side', 0.72, 1.83).rotateY(-Math.PI / 2).translate(-0.477, 0.08 + 0.915, 0), 'atlas');
      b.add(G.box(0.97, 0.05, 0.74, 0xcfd8da).translate(0, 1.93, 0));
      // rusty corrugated rain canopy on two posts
      b.add(G.fx(G.box(1.7, 0.05, 1.3, 0xb9a48c).rotateX(0.2).translate(0, 2.45, 0.28), 3, 0), 'solidDS');
      for (var q = 0; q < 9; q++) b.add(G.fx(G.box(0.05, 0.035, 1.3, 0xa07e5e).rotateX(0.2).translate(-0.74 + q * 0.185, 2.485, 0.28), 3, 0));
      [-0.78, 0.78].forEach(function (ox) {
        b.add(G.fx(G.pipe([ox, 0, 0.82], [ox, 2.34, 0.82], 0.03, C.rust, 5), 3, 0));
        b.add(G.fx(G.pipe([ox, 2.56, -0.36], [ox, 2.34, 0.82], 0.022, C.rust, 4), 3, 0));
      });
      b.add(G.fx(G.box(1.66, 0.04, 0.04, C.rust).translate(0, 2.33, 0.86), 3, 0));
      // recycling bin beside it
      b.add(G.fx(G.boxB(0.42, 0.75, 0.4, 0x4f9ac0).translate(0.82, 0.0, 0.05), 0, 0.3));
      b.add(G.cyl(0.07, 0.07, 0.02, 10, 0x24323a).rotateX(Math.PI / 2).translate(0.75, 0.55, 0.26));
      b.add(G.cyl(0.07, 0.07, 0.02, 10, 0x24323a).rotateX(Math.PI / 2).translate(0.92, 0.55, 0.26));
    });
    H.VENDING = { x: wx0 - 0.9, y: QY + 1.4, z: wz0 + 1.1 };
    H.DRIPS.push({ x: wx0 - 1.55, y: QY + 2.36, z: wz0 + 0.6, rate: 0.7 }, { x: wx0 - 1.55, y: QY + 2.36, z: wz0 + 1.6, rate: 0.5 });
    // puddles inside the warehouse are added to the shared mask
    H.PUDDLES.push([24.4, -6.4, 1.5], [27.2, -9.4, 1.3], [23.0, -3.0, 0.9], [29.0, -5.6, 1.0], [25.9, -1.6, 0.8]);
  };
})();
