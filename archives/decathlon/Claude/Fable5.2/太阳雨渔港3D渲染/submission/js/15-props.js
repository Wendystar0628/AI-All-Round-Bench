/* harbour props: nets on racks, float strings, winch, derrick, notice board, wind-sock, flags, cases, umbrella, sampan ... */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, rnd = H.brand, A = H.Atlas, K;
  var QY = L.QUAY_Y, U = H.U;

  // sheet with real uvs (for the net texture): fn(u,v) -> [x,y,z]; sway weight from swFn(u,v)
  function sheet(nu, nv, fn, uS, vS, hex, swFn, phase) {
    var pos = [], uv = [], sw = [], idx = [], i, j;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); uv.push(i / nu * uS, j / nv * vS);
      sw.push(swFn ? swFn(i / nu, j / nv) : 0, phase || 0);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) { var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(sw), 2));
    g.setIndex(idx); g.computeVertexNormals(); g._keepUV = true;
    return G.paint(g, hex);
  }
  H.sheetGeom = sheet;

  function prints() {
    var txt = H.txt, fade = H.fadeCanvas;
    A.add('notice', 720, 440, function (c, w, h) {
      c.fillStyle = '#f3f1e4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3f86a8'; c.fillRect(0, 0, w, 118);
      txt(c, '汐見漁港', w / 2, 62, 78, '#f6f6ee');
      // warning triangle + waves
      c.fillStyle = '#f0c63a'; c.beginPath(); c.moveTo(112, 168); c.lineTo(190, 300); c.lineTo(34, 300); c.closePath(); c.fill();
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 8; c.lineJoin = 'round'; c.stroke();
      txt(c, '!', 112, 252, 96, '#3a3a3a', H.FONT_EN);
      txt(c, '注意落水', 446, 236, 122, '#c9483a');
      c.strokeStyle = '#3f86a8'; c.lineWidth = 7; c.beginPath();
      for (var x = 40; x < w - 40; x += 6) { var y = 344 + Math.sin(x * 0.045) * 9; if (x === 40) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
      txt(c, '岸壁より海面まで高さがあります　足元にご注意ください', w / 2, 388, 23, '#5a5f60', H.FONT_JP, 'center', 'normal');
      txt(c, '汐見漁業協同組合・港湾管理事務所', w / 2, 420, 20, '#7a7f7f', H.FONT_JP, 'center', 'normal');
      fade(c, w, h, 3.2, 41, '#f6f4ea');
      var r = H.mulberry(43); c.fillStyle = '#a8683c';
      for (var i = 0; i < 40; i++) { c.globalAlpha = 0.18 + r() * 0.22; var px = r() < 0.5 ? r() * 30 : w - r() * 30; c.fillRect(px, r() * h, 2 + r() * 6, 8 + r() * 40); }
      c.globalAlpha = 1;
    });
    A.add('berth_no', 256, 128, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(227,185,58,0.02)'; c.fillRect(0, 0, w, h);
      txt(c, '3', 64, 68, 104, '#e3b93a', H.FONT_EN); txt(c, '4', 192, 68, 104, '#e3b93a', H.FONT_EN);
      // worn paint: scratch bits of it away
      var rr = H.mulberry(51); c.save(); c.globalCompositeOperation = 'destination-out';
      for (var q = 0; q < 110; q++) { c.globalAlpha = 1; c.fillRect(rr() * w, rr() * h, 2 + rr() * 9, 1 + rr() * 5); }
      for (q = 0; q < 14; q++) { c.beginPath(); c.ellipse(rr() * w, rr() * h, 4 + rr() * 12, 3 + rr() * 7, rr() * 3, 0, 7); c.fill(); }
      c.restore();
    });
    A.add('sticker', 128, 128, function (c, w, h) {
      c.fillStyle = '#f7f3e2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8734a'; c.beginPath(); c.arc(64, 64, 50, 0, 7); c.fill();
      txt(c, '♪', 64, 66, 76, '#fffbe8', H.FONT_EN);
    });
    A.add('tag', 160, 96, function (c, w, h) {
      c.fillStyle = '#f7f3e2'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7f9aa8'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10);
      txt(c, '汐見高校', w / 2, 34, 26, '#44606e'); txt(c, '吹奏楽部', w / 2, 66, 26, '#44606e');
    });
    A.add('cone_stripe', 64, 64, function (c, w, h) { c.fillStyle = '#f7f8f3'; c.fillRect(0, 0, w, h); });
  }

  // ------------------------------------------------------------ net drying rack
  function netRack(B, x, z, ry, len, netHex, seed) {
    var r = H.mulberry(seed), hgt = 2.1;
    B.group(x, QY, z, 0, ry, 0, 1, function (b) {
      var ir = 0x8d9aa0;
      [-len / 2, 0, len / 2].forEach(function (ox) {
        b.add(G.fx(G.pipe([ox, 0, -0.6], [ox, hgt, 0], 0.035, ir, 5), 3, 0));
        b.add(G.fx(G.pipe([ox, 0, 0.6], [ox, hgt, 0], 0.035, ir, 5), 3, 0));
        b.add(G.fx(G.pipe([ox, 0.9, -0.34], [ox, 0.9, 0.34], 0.025, ir, 4), 3, 0));
      });
      b.add(G.fx(G.pipe([-len / 2 - 0.2, hgt, 0], [len / 2 + 0.2, hgt, 0], 0.04, ir, 6), 3, 0));
      b.add(G.fx(G.pipe([-len / 2, 0.9, -0.34], [len / 2, 0.9, -0.34], 0.022, ir, 4), 3, 0));
      b.add(G.fx(G.pipe([-len / 2, 0.9, 0.34], [len / 2, 0.9, 0.34], 0.022, ir, 4), 3, 0));
      // net draped over the top bar, hanging both sides, bunched in soft folds
      var ph = r() * 6;
      [-1, 1].forEach(function (s) {
        var drop = s > 0 ? 1.85 : 1.35;
        var g = sheet(22, 9, function (u, v) {
          var px = -len / 2 + 0.1 + u * (len - 0.2);
          var fold = Math.sin(u * 23 + ph) * 0.06 + Math.sin(u * 9.1 + ph * 2) * 0.05;
          var py = hgt + 0.05 - v * drop + Math.sin(u * 5 + ph) * 0.05 * v;
          var pz = s * (0.04 + v * 0.42 + fold * v * 1.4);
          return [px, py, pz];
        }, len * 2.2, drop * 2.2, netHex, function (u, v) { return v * v * 0.55; }, ph);
        b.add(g, 'net');
        // lead line with small sinkers along the bottom edge, cork floats along the top
        for (var q = 0; q < 9; q++) {
          var u = (q + 0.5) / 9, px = -len / 2 + 0.1 + u * (len - 0.2);
          var fold = Math.sin(u * 23 + ph) * 0.06 + Math.sin(u * 9.1 + ph * 2) * 0.05;
          var fl = G.sph(0.07, q % 3 ? 0xf08a2c : 0xf7f8f3, 7, 5).scale(1.25, 0.85, 0.85);
          G.fx(fl, 6, 0.4); G.sway(fl, 0.55, ph);
          b.add(fl.translate(px, hgt + 0.05 - drop + Math.sin(u * 5 + ph) * 0.05, s * (0.04 + 0.42 + fold * 1.4)), 'solid');
        }
      });
      // a second, darker net bundled over one end
      var g2 = sheet(8, 7, function (u, v) {
        return [len / 2 - 1.3 + u * 1.2, hgt + 0.09 - v * 1.5, 0.1 + v * 0.5 + Math.sin(u * 11) * 0.07 * v];
      }, 3, 3.4, 0x3f7fa8, function (u, v) { return v * v * 0.45; }, ph + 2);
      b.add(g2, 'net');
    });
  }

  // ------------------------------------------------------------ instrument hard cases
  function hardCase(b, len, wid, hgt, hex, o) {
    o = o || {};
    b.add(G.fx(G.rbox(len, hgt, wid, 0.06, hex, 0.035).translate(0, hgt / 2, 0), 0, 0.75));
    // moulded ribs on the lid
    for (var i = 0; i < 4; i++) b.add(G.fx(G.box(len * 0.82, 0.014, 0.02, G.mix(hex, 0xffffff, 0.35)).translate(0, hgt + 0.004, -wid * 0.3 + i * wid * 0.2), 0, 0.8), 'solidNC');
    // black edge trim + corner guards
    b.add(G.box(len + 0.012, 0.03, wid + 0.012, C.caseTrim).translate(0, hgt * 0.52, 0));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      b.add(G.fx(G.box(0.07, hgt + 0.012, 0.07, 0x9aa5ab).translate(s[0] * (len / 2 - 0.025), hgt / 2, s[1] * (wid / 2 - 0.025)), 0, 0.8));
    });
    // brass latches + handle on the front long side
    [-0.3, 0.3].forEach(function (f) {
      b.add(G.fx(G.box(0.07, 0.085, 0.02, C.brass).translate(f * len, hgt * 0.52, wid / 2 + 0.012), 0, 1.0));
      b.add(G.box(0.045, 0.02, 0.026, 0xf6dc8c).translate(f * len, hgt * 0.60, wid / 2 + 0.014), 'glowFlat');
    });
    b.add(G.tube([[-0.1, hgt * 0.5, wid / 2 + 0.01], [-0.08, hgt * 0.5, wid / 2 + 0.06], [0.08, hgt * 0.5, wid / 2 + 0.06], [0.1, hgt * 0.5, wid / 2 + 0.01]], 0.016, C.caseTrim, 5, 10));
    // hinges at the back
    [-0.3, 0.3].forEach(function (f) { b.add(G.fx(G.box(0.08, 0.05, 0.016, 0x8f9aa0).translate(f * len, hgt * 0.52, -wid / 2 - 0.008), 0, 0.6)); });
    if (o.sticker) b.add(A.quad('sticker', 0.13, 0.13).rotateX(-Math.PI / 2).rotateY(0.3).translate(len * 0.28, hgt + 0.012, wid * 0.12), 'atlas');
    if (o.tag) {
      b.add(A.quad('tag', 0.15, 0.09).rotateX(-Math.PI / 2 + 0.25).rotateY(-0.5).translate(-len * 0.16, hgt * 0.38, wid / 2 + 0.11), 'atlas');
      b.add(G.pipe([-len * 0.12, hgt * 0.5, wid / 2 + 0.05], [-len * 0.16, hgt * 0.42, wid / 2 + 0.09], 0.004, 0xd9503f, 3));
    }
    // rain beads on the lid: tiny warm glints
    var r = H.mulberry(o.seed || 1);
    for (i = 0; i < 16; i++) b.add(G.sph(0.009 + r() * 0.006, 0xfff3d0, 5, 3).scale(1, 0.5, 1).translate((r() - 0.5) * len * 0.86, hgt + 0.006, (r() - 0.5) * wid * 0.8), 'glowFlat');
  }

  H.buildProps = function (B, scene) {
    K = H.kit;
    prints();
    var i, g;

    // =========================================================== notice board : port name + 注意落水
    B.group(-22.9, QY, 14.9, 0, 0.35, 0, 1, function (b) {
      [-1.0, 1.0].forEach(function (ox) {
        b.add(G.fx(G.boxB(0.1, 2.5, 0.1, 0x8fa0a6).translate(ox, 0, 0), 3, 0));
        b.add(G.fx(G.boxB(0.26, 0.12, 0.26, C.conc3).translate(ox, 0, 0), 1, 0));
      });
      b.add(G.box(2.36, 1.46, 0.06, 0xdcdccf).translate(0, 1.7, 0.02));
      b.add(A.quad('notice', 2.26, 1.38).translate(0, 1.7, 0.055), 'atlas');
      b.add(G.fx(G.box(2.5, 0.07, 0.3, 0x7f9aa6).rotateX(0.25).translate(0, 2.5, 0.1), 3, 0));
    });
    H.DRIPS.push({ x: -22.3, y: QY + 2.44, z: 15.3, rate: 0.4 });

    // =========================================================== lifebuoy station by the steps
    B.group(-12.0, QY, 13.25, 0, 0.0, 0, 1, function (b) {
      b.add(G.boxB(0.09, 1.7, 0.09, C.red));
      b.add(G.box(0.7, 0.8, 0.06, 0xf7f8f3).translate(0, 1.35, 0.06));
      var ring = G.torus(0.26, 0.075, C.orange, 8, 20);
      G.paintFn(ring, function (x, y) { var a = Math.atan2(y, x); return (Math.floor((a + Math.PI) / (Math.PI / 4)) % 2) ? C.orange : 0xf7f8f3; });
      b.add(G.fx(ring, 0, 0.5).translate(0, 1.35, 0.14));
      b.add(G.rope([[0.2, 1.15, 0.12], [0.3, 0.85, 0.1], [0.22, 0.6, 0.1], [0.3, 0.42, 0.1]], 0.015, 0xf2e6c8, 12, 12));
    });

    // =========================================================== net drying yard on the front quay
    netRack(B, 3.4, 18.6, 0.18, 4.6, 0x4fa08f, 7);
    netRack(B, 9.4, 20.9, -0.12, 4.2, 0xc98a4a, 9);
    netRack(B, 15.6, 23.6, 0.3, 4.0, 0x4f93b0, 13);
    // heap of net with floats on the ground
    B.group(-0.6, QY, 21.4, 0, 0.4, 0, 1, function (b) {
      b.add(sheet(8, 8, function (u, v) {
        var a = u * 6.283, r = 0.15 + v * 1.0;
        return [Math.cos(a) * r * 1.2, 0.5 * (1 - v) * (0.8 + 0.2 * Math.sin(a * 3)) + 0.03, Math.sin(a) * r];
      }, 9, 4, 0x4fa08f), 'netStill');
      b.add(G.sph(0.42, 0x3f8a7c, 8, 6).scale(1.5, 0.55, 1.2).translate(0, 0.16, 0));
      for (var q = 0; q < 7; q++) b.add(G.fx(G.sph(0.09, q % 2 ? 0xf08a2c : 0xf4cb3c, 8, 6).translate(Math.cos(q * 1.1) * (0.5 + q * 0.07), 0.12 + (q % 3) * 0.08, Math.sin(q * 1.1) * 0.6), 0, 0.5));
    });
    // fish traps (cages) stacked
    function trap(b) {
      var c = 0x6f8f8a;
      [[0.45, 0.3], [-0.45, 0.3]].forEach(function (p) { b.add(G.torus(0.3, 0.018, c, 4, 14).rotateY(Math.PI / 2).translate(p[0], 0.3, 0)); });
      for (var q = 0; q < 8; q++) { var a = q / 8 * 6.283; b.add(G.pipe([-0.45, 0.3 + Math.sin(a) * 0.3, Math.cos(a) * 0.3], [0.45, 0.3 + Math.sin(a) * 0.3, Math.cos(a) * 0.3], 0.012, c, 3)); }
      b.add(sheet(10, 3, function (u, v) { var a = u * 6.283; return [-0.45 + v * 0.9, 0.3 + Math.sin(a) * 0.29, Math.cos(a) * 0.29]; }, 6, 3, 0x86b0a6), 'netStill');
    }
    [[20.4, 15.4, 0], [20.5, 16.2, 0.1], [20.45, 15.8, 0.05, 0.58]].forEach(function (p) {
      B.group(p[0], QY + (p[3] || 0), p[1], 0, p[2] + Math.PI / 2, 0, 1, trap);
    });

    // =========================================================== float strings (static posts; the swinging strings are dynamic objects)
    var FS = H.FLOAT_STRINGS = [
      { a: [-3.6, QY + 2.3, 14.0], b: [1.4, QY + 2.05, 15.3], sag: 0.75, n: 13, seed: 3 },
      { a: [1.4, QY + 2.05, 15.3], b: [6.6, QY + 2.3, 14.2], sag: 0.7, n: 13, seed: 5 },
      { a: [12.6, QY + 2.2, 18.4], b: [12.9, QY + 2.2, 23.2], sag: 0.6, n: 11, seed: 8 }
    ];
    [[-3.6, 14.0, 2.3], [1.4, 15.3, 2.05], [6.6, 14.2, 2.3], [12.6, 18.4, 2.2], [12.9, 23.2, 2.2]].forEach(function (p) {
      B.add(G.fx(G.cylB(0.045, 0.06, p[2] + 0.1, 6, 0x9a8a78).translate(p[0], QY, p[1]), 8, 0));
      B.add(G.fx(G.cylB(0.16, 0.2, 0.14, 8, C.conc3).translate(p[0], QY, p[1]), 1, 0));
    });

    // =========================================================== hand winch at the head of the slipway, cable down to the sampan
    B.group(-27.9, QY, 22.3, 0, 0, 0, 1, function (b) {
      var rc = C.rust;
      b.add(G.fx(G.boxB(1.1, 0.1, 0.9, C.conc3), 1, 0));
      [-0.36, 0.36].forEach(function (ox) {
        b.add(G.fx(G.extrude([[-0.38, 0], [0.38, 0], [0.16, 0.72], [-0.16, 0.72]], 0.05, rc).rotateY(Math.PI / 2).translate(ox - 0.025, 0.1, 0), 3, 0));
      });
      b.add(G.fx(G.cyl(0.2, 0.2, 0.62, 14, 0x8a6a52).rotateZ(Math.PI / 2).translate(0, 0.6, 0), 3, 0));
      [-0.3, 0.3].forEach(function (ox) { b.add(G.fx(G.cyl(0.3, 0.3, 0.035, 16, rc).rotateZ(Math.PI / 2).translate(ox, 0.6, 0), 3, 0)); });
      // cable turns on the drum
      for (var q = 0; q < 8; q++) b.add(G.torus(0.215, 0.018, 0x9aa6ab, 4, 14).rotateY(Math.PI / 2).translate(-0.22 + q * 0.062, 0.6, 0));
      // gear + crank handle
      b.add(G.fx(G.cyl(0.24, 0.24, 0.05, 12, C.rustDark).rotateZ(Math.PI / 2).translate(0.43, 0.6, 0), 3, 0));
      for (q = 0; q < 12; q++) { var a = q / 12 * 6.283; b.add(G.fx(G.box(0.05, 0.06, 0.05, C.rustDark).translate(0.43, 0.6 + Math.sin(a) * 0.25, Math.cos(a) * 0.25), 3, 0)); }
      b.add(G.fx(G.pipe([0.46, 0.6, 0], [0.62, 0.6, 0], 0.03, rc, 5), 3, 0));
      b.add(G.fx(G.pipe([0.6, 0.6, 0], [0.6, 0.95, 0.2], 0.025, rc, 5), 3, 0));
      b.add(G.fx(G.pipe([0.6, 0.95, 0.2], [0.82, 0.95, 0.2], 0.03, 0x7a5c44, 6), 8, 0));
      b.add(G.fx(G.box(0.04, 0.3, 0.05, rc).rotateX(0.5).translate(-0.43, 0.82, 0.12), 3, 0));    // pawl
    });
    B.add(G.tube([[-27.9, QY + 0.42, 22.2], [-27.95, QY + 0.2, 20.4], [-28.0, QY + 0.1, 18.9], [-28.0, QY - 0.2, 17.75]], 0.016, 0x8f9da1, 4, 14), 'solidNC');

    // =========================================================== small derrick (jib crane) on the quay edge
    B.group(8.3, QY, 13.0, 0, 0.35, 0, 1, function (b) {
      var rc = 0x9a8a72;
      b.add(G.fx(G.cylB(0.3, 0.34, 0.14, 10, C.conc3), 1, 0));
      b.add(G.fx(G.cylB(0.085, 0.11, 2.6, 8, rc), 3, 0));
      b.add(G.fx(G.pipe([0, 2.3, 0], [0.1, 3.3, -2.3], 0.06, rc, 6), 3, 0));         // jib leaning over the water
      b.add(G.fx(G.pipe([0, 2.6, 0], [0.1, 3.3, -2.3], 0.014, 0x7f8c93, 3), 0, 0));
      b.add(G.fx(G.pipe([0, 1.2, 0], [0.05, 2.75, -1.0], 0.03, rc, 5), 3, 0));
      b.add(G.fx(G.cyl(0.11, 0.11, 0.06, 10, C.rustDark).rotateZ(Math.PI / 2).translate(0.1, 3.27, -2.28), 3, 0));
      b.add(G.pipe([0.1, 3.2, -2.3], [0.1, 1.5, -2.3], 0.012, 0x7f8c93, 3));
      b.add(G.fx(G.tube([[0.1, 1.5, -2.3], [0.1, 1.38, -2.3], [0.16, 1.3, -2.3], [0.1, 1.24, -2.3], [0.05, 1.3, -2.3]], 0.02, C.rustDark, 4, 10), 3, 0));
      b.add(G.fx(G.box(0.1, 0.16, 0.1, C.rustDark).translate(0.1, 1.56, -2.3), 3, 0));
      // little hand winch on the post
      b.add(G.fx(G.cyl(0.1, 0.1, 0.22, 10, 0x8a6a52).rotateZ(Math.PI / 2).translate(0, 1.0, 0.13), 3, 0));
      b.add(G.fx(G.pipe([0.12, 1.0, 0.13], [0.2, 1.18, 0.13], 0.016, rc, 4), 3, 0));
      b.add(G.fx(G.pipe([0.2, 1.18, 0.13], [0.32, 1.18, 0.13], 0.02, 0x7a5c44, 5), 8, 0));
    });
    H.DRIPS.push({ x: 8.3 + Math.sin(0.35) * -2.3 + 0.1, y: QY + 1.22, z: 13.0 - Math.cos(0.35) * 2.3, rate: 0.35 });

    // =========================================================== stacked fish boxes and blue crates out in the rain
    var outStacks = [
      [17.4, -12.5, 0.2, 'f', 2, 2, 5], [19.3, -12.7, -0.1, 'f', 2, 1, 4], [20.75, -10.6, 0.0, 'c', 5], [20.8, -11.3, 0.3, 'c', 4], [20.2, -11.2, -0.2, 'c', 2],
      [18.9, 3.1, 0.1, 'c', 3], [19.6, 3.6, 0.5, 'c', 4],
      [16.6, 14.6, 0.3, 'f', 2, 2, 4], [18.2, 15.6, -0.25, 'f', 2, 2, 3], [16.9, 16.7, 0.1, 'c', 4], [17.6, 16.9, 0.4, 'c', 3], [18.3, 17.4, -0.1, 'c', 5],
      [-6.6, 16.4, 0.2, 'f', 2, 1, 3], [-5.2, 16.9, -0.3, 'c', 3]
    ];
    outStacks.forEach(function (s) {
      B.group(s[0], QY, s[1], 0, s[2], 0, 1, function (b) {
        if (s[3] === 'f') { K.pallet(b); b.group(0, 0.14, 0, 0, 0, 0, 1, function (bb) { K.fishStack(bb, s[4], s[5], s[6], { ragged: true, open: false }); }); }
        else K.crateStack(b, s[4], rnd() < 0.3 ? [C.crateBlue, 0x4f9ad6, C.crateBlueDark] : null);
      });
    });
    // one tipped crate + a loose lid
    B.group(19.6, QY + 0.2, -6.9, 0, 0.8, 1.45, 1, function (b) { K.crate(b); });
    B.add(G.fx(G.boxB(0.64, 0.03, 0.4, 0xf7f8f3).rotateY(0.6).translate(-4.2, QY, 15.8), 0, 0.3));
    // barrels, coiled ropes, spare buoys
    [[20.75, 1.25, 0x3f7fbd], [20.9, 2.05, 0x3f7fbd], [20.15, 1.75, 0xd9a03f]].forEach(function (p) { B.group(p[0], QY, p[1], 0, 0, 0, 1, function (b) { K.barrel(b, p[2]); }); });
    function ropeCoilFlat(x, z, hex, r0) {
      for (var q = 0; q < 4; q++) B.add(G.torus(r0 - q * 0.02, 0.045, hex, 6, 20).rotateX(Math.PI / 2).translate(x, QY + 0.05 + q * 0.085, z));
      B.add(G.rope([[x + r0, QY + 0.3, z], [x + r0 + 0.25, QY + 0.06, z + 0.2], [x + r0 + 0.7, QY + 0.05, z + 0.1]], 0.04, hex, 12, 10));
    }
    ropeCoilFlat(-7.2, 14.4, C.rope, 0.42); ropeCoilFlat(16.4, 3.2, 0xdccba0, 0.4); ropeCoilFlat(13.0, 15.9, 0x4f9ac0, 0.36); ropeCoilFlat(16.3, -11.5, C.rope, 0.4);
    [[22.4, 18.6, 0xf08a2c], [23.2, 18.2, 0xf4cb3c], [22.9, 19.2, 0xf08a2c]].forEach(function (p) {
      B.add(G.fx(G.sph(0.36, p[2], 12, 9).translate(p[0], QY + 0.34, p[1]), 0, 0.5));
      B.add(G.torus(0.09, 0.025, 0x55626a, 4, 10).translate(p[0], QY + 0.74, p[1]));
    });
    // old tyres stacked as spare fenders
    for (i = 0; i < 3; i++) H.tyreGeom(B, 14.9 + (i % 2) * 0.05, QY + 0.17 + i * 0.36, 11.1, Math.PI / 2, i * 0.7, 0, 0.95);
    H.tyreGeom(B, 15.7, QY + 0.5, 11.25, 0.25, 1.2, 0, 0.95);

    // =========================================================== landing net + bucket + broom against the warehouse wall (alley side)
    var wz = 0.5 + 0.12;
    B.group(23.2, QY, wz + 0.5, 0, 0, 0, 1, function (b) {
      b.add(G.fx(G.pipe([0, 0, 0.1], [0.25, 2.5, -0.38], 0.022, 0xd9c08c, 5), 8, 0));            // long handle leaning on the wall
      var hoop = G.torus(0.3, 0.018, 0x8f9da1, 5, 18).rotateX(1.0).rotateY(0.3).translate(0.3, 2.82, -0.36);
      b.add(hoop);
      b.add(sheet(10, 4, function (u, v) {
        var a = u * 6.283, r = 0.3 * (1 - v * 0.85);
        return [0.3 + Math.cos(a) * r, 2.82 - v * 0.55 + Math.sin(a) * r * 0.5, -0.36 + Math.sin(a) * r * 0.5 + v * 0.1];
      }, 8, 3, 0x9fd0c4, function (u, v) { return v * 0.12; }, 1), 'net');
      b.group(0.75, 0, 0.05, 0, 0.4, 0, 1, function (bb) { K.bucket(bb, 0x3f9ad6); });
      b.group(1.2, 0, 0.2, 0, 0, 0, 1, function (bb) { K.bucket(bb, 0xf7f8f3); });
      // deck brush
      b.add(G.fx(G.pipe([-0.5, 0.08, 0.15], [-0.42, 1.5, -0.36], 0.018, 0x7fb0c8, 5), 0, 0.3));
      b.add(G.box(0.3, 0.06, 0.09, 0x3f6f8f).translate(-0.5, 0.09, 0.15));
      b.add(G.box(0.28, 0.07, 0.07, 0xf2e6c8).translate(-0.5, 0.035, 0.15));
      b.group(2.0, 0, 0.0, 0, 0.2, 0, 1, function (bb) { K.crateStack(bb, 2); });
    });
    // gas bottles + bicycle further down the alley
    [[26.4, wz + 0.3], [26.85, wz + 0.32]].forEach(function (p) {
      B.add(G.fx(G.cylB(0.16, 0.16, 1.0, 10, 0xc7cfcf).translate(p[0], QY, p[1]), 0, 0.35));
      B.add(G.sph(0.16, 0xc7cfcf, 10, 6).translate(p[0], QY + 1.0, p[1]));
      B.add(G.cylB(0.05, 0.05, 0.12, 6, 0xb5754f).translate(p[0], QY + 1.14, p[1]));
    });
    B.group(21.9, QY, 14.6, 0, 1.2, 0.12, 1, function (b) {     // a bicycle leaning on the canopy post
      var fc = 0x4f9ac0;
      [-0.52, 0.52].forEach(function (ox) {
        b.add(G.torus(0.33, 0.025, 0x2f3338, 5, 20).translate(ox, 0.35, 0));
        b.add(G.torus(0.31, 0.012, 0xcfd6d9, 4, 20).translate(ox, 0.35, 0));
        for (var q = 0; q < 6; q++) { var a = q / 6 * Math.PI; b.add(G.pipe([ox + Math.cos(a) * 0.31, 0.35 + Math.sin(a) * 0.31, 0], [ox - Math.cos(a) * 0.31, 0.35 - Math.sin(a) * 0.31, 0], 0.004, 0xcfd6d9, 3), 'solidNC'); }
      });
      b.add(G.pipes([[-0.52, 0.35, 0], [-0.15, 0.36, 0], [0.3, 0.82, 0], [-0.2, 0.8, 0], [-0.15, 0.36, 0]], 0.022, fc, 5));
      b.add(G.pipe([-0.2, 0.8, 0], [-0.52, 0.35, 0], 0.016, fc, 4));
      b.add(G.pipe([0.3, 0.82, 0], [0.52, 0.35, 0], 0.02, fc, 5));
      b.add(G.pipe([0.3, 0.82, 0], [0.26, 1.02, 0], 0.016, 0xcfd6d9, 4));
      b.add(G.pipe([0.26, 1.02, -0.26], [0.26, 1.02, 0.26], 0.014, 0xcfd6d9, 4));
      b.add(G.box(0.26, 0.05, 0.14, 0x2f3338).translate(-0.22, 0.93, 0));
      b.add(G.pipe([-0.2, 0.8, 0], [-0.22, 0.92, 0], 0.014, 0xcfd6d9, 4));
      b.add(G.box(0.3, 0.2, 0.34, 0xaebcc0).translate(0.52, 0.9, 0));                  // front basket
      b.add(G.boxB(0.26, 0.012, 0.3, 0x8f9da1).translate(0.52, 0.8, 0));
      b.add(G.box(0.3, 0.02, 0.16, 0x8f9da1).translate(-0.6, 0.72, 0));                // rear rack
    });

    // =========================================================== painted markings
    B.add(A.quad('berth_no', 2.2, 1.1).rotateX(-Math.PI / 2).translate(-1.0, QY + 0.012, 14.9), 'atlas');
    for (i = 0; i < 11; i++) B.add(G.box(1.6, 0.008, 0.11, 0xe9c95a).translate(-22.5 + i * 3.2, QY + 0.006, 13.55), 'solidNC');
    for (i = 0; i < 7; i++) B.add(G.box(0.11, 0.008, 1.6, 0xe9c95a).translate(15.55, QY + 0.006, -10 + i * 3.2), 'solidNC');
    // drain covers
    [[-14, 20.5], [5.5, 29], [18.8, 8.3], [26.5, 1.9]].forEach(function (p) {
      B.add(G.box(0.7, 0.012, 0.5, 0x7f8f93).translate(p[0], QY + 0.006, p[1]), 'solidNC');
      for (var q = 0; q < 6; q++) B.add(G.box(0.05, 0.014, 0.4, 0x4a585e).translate(p[0] - 0.27 + q * 0.108, QY + 0.008, p[1]), 'solidNC');
    });
    // traffic cones near the slipway
    [[-24.0, 19.6], [-23.6, 20.9], [-31.5, 19.3]].forEach(function (p) {
      B.add(G.boxB(0.34, 0.03, 0.34, C.red).translate(p[0], QY, p[1]));
      var cone = G.cylB(0.03, 0.14, 0.55, 10, C.red);
      G.paintFn(cone, function (x, y) { return (y > 0.2 && y < 0.3) || (y > 0.38 && y < 0.45) ? 0xf7f8f3 : C.red; });
      B.add(G.fx(cone.translate(p[0], QY + 0.03, p[1]), 0, 0.4));
    });
    // a cat bowl and a folded towel left beside the sampan
    B.add(G.fx(G.lathe([[0, 0], [0.09, 0], [0.11, 0.05], [0.095, 0.05], [0.08, 0.015], [0, 0.015]], 10, 0x8fc7d6).translate(-25.6, QY, 19.0), 0, 0.5), 'solidDS');
    B.add(G.cylB(0.075, 0.075, 0.012, 8, 0xc9a070).translate(-25.6, QY + 0.02, 19.0), 'solidNC');

    // =========================================================== two silver instrument cases, side by side by the steps
    B.group(-15.6, QY, 14.5, 0, 0.32, 0, 1, function (b) { hardCase(b, 0.98, 0.34, 0.26, C.case1, { sticker: true, seed: 3 }); });
    B.group(-15.25, QY, 15.02, 0, 0.36, 0, 1, function (b) { hardCase(b, 0.62, 0.36, 0.28, C.case2, { tag: true, seed: 9 }); });
    H.CASES = { x: -15.4, y: QY + 0.2, z: 14.75 };

    // =========================================================== transparent umbrella resting on the top step
    (function () {
      var dir = new THREE.Vector3(-0.12, 0.40, -0.91).normalize();
      var handle = new THREE.Vector3(-19.62, QY + 0.035, 12.62);
      var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      var m = new THREE.Matrix4().compose(handle, q, new THREE.Vector3(1, 1, 1));
      var Rr = 0.52, yA = 0.80, yR = 0.60, nSeg = 8;
      function dome(u, v) {     // u around, v from apex (0) to rim (1); scalloped between ribs
        var a = u * Math.PI * 2;
        var k = Math.abs(Math.sin(a * nSeg / 2));
        var rr = Rr * Math.sin(v * Math.PI / 2) * (1 - 0.055 * k * v);
        var y = yA - (yA - yR) * (1 - Math.cos(v * Math.PI / 2)) + 0.03 * k * v * v;
        return [Math.cos(a) * rr, y, Math.sin(a) * rr];
      }
      var can = G.surf(48, 8, dome, 0xf4fbfb);
      B.push(m);
      B.add(can, 'vinyl');
      for (i = 0; i < nSeg; i++) {
        var pts = [];
        for (var v = 0; v <= 6; v++) pts.push(dome(i / nSeg, v / 6));
        B.add(G.tube(pts, 0.006, 0xf7f8f3, 4, 10));
        var rim = dome(i / nSeg, 1); B.add(G.sph(0.012, 0xf7f8f3, 5, 4).translate(rim[0], rim[1], rim[2]));
        // stretchers
        B.add(G.pipe([rim[0] * 0.55, yA - 0.085, rim[2] * 0.55], [0, yA - 0.26, 0], 0.004, 0xdfe6e8, 3));
      }
      var rimPts = []; for (i = 0; i <= 48; i++) rimPts.push(dome(i / 48, 1));
      B.add(G.tube(rimPts, 0.005, 0xf7f8f3, 4, 48));
      B.add(G.fx(G.pipe([0, 0.1, 0], [0, yA + 0.02, 0], 0.009, 0xdfe6e8, 5), 0, 0.8));
      B.add(G.cone(0.012, 0.07, 6, 0xf7f8f3).translate(0, yA + 0.05, 0));
      B.add(G.cylB(0.022, 0.022, 0.04, 8, 0xf7f8f3).translate(0, yA - 0.28, 0));
      B.add(G.fx(G.tube([[0, 0.12, 0], [0, 0.03, 0], [0.03, -0.02, 0], [0.08, -0.02, 0], [0.1, 0.03, 0], [0.1, 0.07, 0]], 0.016, 0xf7f8f3, 6, 16), 0, 0.6));
      // rain beads clinging to the canopy
      var r = H.mulberry(77), tmp = new THREE.Vector3();
      H.UMBRELLA = { rim: [], apex: new THREE.Vector3(0, yA, 0).applyMatrix4(m) };
      for (i = 0; i < 46; i++) {
        var p = dome(r(), 0.25 + r() * 0.75);
        B.add(G.sph(0.008 + r() * 0.007, 0xfff6dc, 5, 3).translate(p[0] * 1.01, p[1] + 0.004, p[2] * 1.01), 'glowFlat');
      }
      B.pop();
      // drip points: the lowest scallop tips of the rim
      var cand = [];
      for (i = 0; i < nSeg; i++) { var rp = dome(i / nSeg, 1); tmp.set(rp[0], rp[1], rp[2]).applyMatrix4(m); cand.push(tmp.clone()); }
      cand.sort(function (a, b) { return a.y - b.y; });
      for (i = 1; i < 4; i++) { H.DRIPS.push({ x: cand[i].x, y: cand[i].y - 0.01, z: cand[i].z, rate: 0.75, small: true, key: 'umbrella' }); H.UMBRELLA.rim.push(cand[i]); }
    })();

    // =========================================================== upturned wooden sampan, half hauled up the slipway (the cat's shelter)
    (function () {
      var cx = -28.05, cz = 16.0, slope = Math.atan((QY + 1.3) / (L.SLIP.zTop - L.SLIP.zEnd));
      var len = 3.9, bw = 0.66, hh = 0.46, lift = 0.45;
      function hw(s) { return bw * (1 - 0.9 * Math.pow(Math.max(0, s - 0.42) / 0.58, 2.1)) * (0.86 + 0.14 * Math.min(1, s * 4)); }
      function pt(s, k) {       // k: 0 gunwale L, 1 chine L, 2 keel, 3 chine R, 4 gunwale R ; boat upside down
        var w = hw(s), z = (s - 0.5) * len, rise = 0.1 * s * s;
        if (k === 0) return [-w, 0 - rise * 0.2, z]; if (k === 4) return [w, 0 - rise * 0.2, z];
        if (k === 1) return [-w * 0.74, hh * 0.86, z]; if (k === 3) return [w * 0.74, hh * 0.86, z];
        return [0, hh + 0.02 - rise, z];
      }
      var M = G.m4(cx, H.slipY(cz) + lift, cz, -slope, 0, 0);
      B.push(M);
      var woods = [0xb99a72, 0xa98a66, 0xc2a57e, 0xb09170];
      for (var k = 0; k < 4; k++) {
        (function (k) {
          var s = G.surf(14, 1, function (u, v) { var a = pt(u, k), b = pt(u, k + 1); return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v, a[2] + (b[2] - a[2]) * v]; }, woods[k]);
          B.add(G.fx(s, 8, 0.15), 'solidDS');
        })(k);
      }
      // transom
      var t0 = pt(0, 0), t1 = pt(0, 1), t2 = pt(0, 2), t3 = pt(0, 3), t4 = pt(0, 4);
      B.add(G.fx(G.merge([G.tri(t0, t2, t1, 0xa98a66), G.tri(t0, t4, t2, 0xa98a66), G.tri(t4, t3, t2, 0xa98a66)]), 8, 0), 'solidDS');
      // keel strip, rub strakes, plank seams
      var kp = [], gl = [], gr = [];
      for (i = 0; i <= 14; i++) { var s2 = i / 14; var p2 = pt(s2, 2); kp.push([p2[0], p2[1] + 0.02, p2[2]]); var a = pt(s2, 0), c = pt(s2, 4); gl.push([a[0] - 0.015, a[1] + 0.03, a[2]]); gr.push([c[0] + 0.015, c[1] + 0.03, c[2]]); }
      B.add(G.fx(G.tube(kp, 0.035, 0x8a6f52, 4, 28), 8, 0));
      B.add(G.fx(G.tube(gl, 0.03, 0x8a6f52, 4, 28), 8, 0)); B.add(G.fx(G.tube(gr, 0.03, 0x8a6f52, 4, 28), 8, 0));
      [1, 3].forEach(function (kk) { var cp = []; for (i = 0; i <= 14; i++) { var q = pt(i / 14, kk); cp.push([q[0] * 1.01, q[1] + 0.008, q[2]]); } B.add(G.tube(cp, 0.012, 0x7f6850, 3, 28), 'solidNC'); });
      // faded paint band + a patch
      B.add(G.fx(G.box(0.5, 0.01, 0.36, 0x7fb5c4).rotateZ(0.2).translate(-0.33, hh * 0.93, -0.6), 0, 0), 'solidNC');
      // thwarts glimpsed underneath
      [-0.9, 0.3].forEach(function (z) { B.add(G.fx(G.box(hw(z / len + 0.5) * 1.9, 0.035, 0.2, 0xa08462).translate(0, 0.16, z), 8, 0), 'solidNC'); });
      B.pop();
      // timber blocks it rests on (raises one side: the cat-sized gap)
      [-1.15, 1.05].forEach(function (dz) {
        var z = cz + dz, y = H.slipY(z);
        B.add(G.fx(G.box(1.75, 0.15, 0.16, 0x9a8468).rotateX(-slope).translate(cx, y + 0.085, z), 8, 0));
        B.add(G.fx(G.box(0.18, 0.3, 0.3, 0x8a7458).rotateX(-slope).translate(cx - 0.62, y + 0.3, z), 8, 0));
        B.add(G.fx(G.box(0.18, 0.3, 0.3, 0x8a7458).rotateX(-slope).translate(cx + 0.62, y + 0.3, z), 8, 0));
      });
      // a pair of oars leaning on it
      [0.12, -0.1].forEach(function (o2, q) {
        B.add(G.fx(G.pipe([cx - 1.15 - q * 0.12, H.slipY(cz + 1.7) + 0.05, cz + 1.7], [cx - 0.80 - o2, H.slipY(cz - 1.0) + 0.9, cz - 1.0], 0.025, 0xc9ae84, 5), 8, 0));
        B.add(G.fx(G.box(0.14, 0.02, 0.55, 0xc9ae84).rotateX(-slope - 0.25).translate(cx - 0.77 - o2, H.slipY(cz - 1.3) + 0.98, cz - 1.3), 8, 0));
      });
      H.SAMPAN = { x: cx, z: cz, y: H.slipY(cz) + 0.03, slope: slope };
      H.DRIPS.push({ x: cx + 0.66, y: H.slipY(cz) + lift - 0.02, z: cz + 0.45, rate: 0.5, small: true });
    })();
  };
})();
