/* quay furniture: bollards, hawsers, lamp posts, wires, mooring rings, ladders, barnacles / oysters / seaweed, sea-bed objects */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, rnd = H.brand;
  var QY = L.QUAY_Y;

  // world lists used by other systems
  H.BOLLARDS = [];     // {x, z, y(top)}
  H.DRIPS = [];        // static drip sources {x, y, z}
  H.LAMPS = [];        // lamp head positions

  // ------------------------------------------------------------ bollard
  function bollardGeom() {
    var prof = [[0, 0], [0.36, 0], [0.36, 0.05], [0.25, 0.09], [0.185, 0.16], [0.17, 0.34], [0.19, 0.43], [0.32, 0.47], [0.335, 0.53], [0.30, 0.60], [0.16, 0.655], [0, 0.665]];
    var g = G.lathe(prof, 16, C.iron);
    G.paintFn(g, function (x, y) { return y > 0.5 ? 0x3b434a : (y < 0.07 ? 0x353b41 : C.iron); });
    return g;
  }
  function addBollard(B, x, z, y0) {
    y0 = y0 === undefined ? QY : y0;
    B.add(bollardGeom().translate(x, y0, z));
    // bolts on the flange
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2 + 0.3;
      B.add(G.cylB(0.035, 0.035, 0.035, 6, 0x4a535a).translate(x + Math.cos(a) * 0.3, y0 + 0.05, z + Math.sin(a) * 0.3));
    }
    // rust-stained footprint on the concrete
    B.add(G.disc(0.5, 14, 0xc9b9a3).rotateX(-Math.PI / 2).translate(x, y0 + 0.006, z), 'solidNC');
    H.BOLLARDS.push({ x: x, z: z, y: y0 + 0.665, y0: y0 });
  }
  // helix of rope around the bollard neck
  function coil(B, x, z, turns, hex, r, y0) {
    var pts = [], n = turns * 10, i;
    y0 = y0 === undefined ? QY : y0;
    for (i = 0; i <= n; i++) {
      var a = i / 10 * Math.PI * 2, y = y0 + 0.13 + (i / n) * 0.26;
      pts.push([x + Math.cos(a) * 0.235, y, z + Math.sin(a) * 0.235]);
    }
    B.add(G.rope(pts, r || 0.05, hex, n * 2, 9));
  }
  H.ropeCoil = coil;

  // ------------------------------------------------------------ lamp post with ring shade
  function lampPost(B, x, z, ry) {
    var h = 5.3;
    B.group(x, QY, z, 0, ry, 0, 1, function (b) {
      b.add(G.cylB(0.26, 0.3, 0.12, 10, C.conc3));
      b.add(G.cylB(0.13, 0.16, 0.5, 10, 0x71848c).translate(0, 0.12, 0));
      b.add(G.cylB(0.07, 0.105, h - 0.6, 10, 0x8a9ca3).translate(0, 0.6, 0));
      b.add(G.fx(G.cylB(0.108, 0.108, 0.9, 10, 0x8a9ca3).translate(0, 0.45, 0), 3, 0));   // rusty foot
      // gooseneck arm
      var arm = [[0, h, 0], [0, h + 0.38, 0.06], [0.0, h + 0.62, 0.42], [0, h + 0.56, 0.95], [0, h + 0.38, 1.18]];
      b.add(G.tube(arm, 0.045, 0x8a9ca3, 6, 20));
      b.add(G.pipe([0, h - 0.5, 0], [0, h + 0.45, 0.62], 0.02, 0x6f8189, 4));               // stay
      // lamp head: enamel dish + ring shade + globe
      var lx = 0, ly = h + 0.33, lz = 1.2;
      b.add(G.cylB(0.07, 0.07, 0.12, 8, 0x6f8189).translate(lx, ly, lz));
      b.add(G.fx(G.lathe([[0.06, 0.02], [0.2, -0.02], [0.47, -0.14], [0.5, -0.17], [0.47, -0.17], [0.2, -0.06], [0.0, -0.04]], 18, 0xeef3ef).translate(lx, ly, lz), 0, 0.5));
      b.add(G.fx(G.torus(0.5, 0.045, 0xf6faf6, 8, 22).rotateX(Math.PI / 2).translate(lx, ly - 0.17, lz), 0, 0.6)); // ring shade
      b.add(G.torus(0.36, 0.018, 0x9aabb0, 5, 18).rotateX(Math.PI / 2).translate(lx, ly - 0.33, lz));              // guard ring
      for (var i = 0; i < 4; i++) {
        var a = i / 4 * Math.PI * 2 + 0.6;
        b.add(G.pipe([lx + Math.cos(a) * 0.46, ly - 0.17, lz + Math.sin(a) * 0.46], [lx + Math.cos(a) * 0.36, ly - 0.33, lz + Math.sin(a) * 0.36], 0.012, 0x9aabb0, 4));
      }
      b.add(G.sph(0.17, 0xfff4cf, 10, 8).scale(1, 1.15, 1).translate(lx, ly - 0.2, lz), 'glowFlat');
      // junction box + number plate
      b.add(G.box(0.2, 0.3, 0.12, 0xaebcc0).translate(0, 1.5, 0.13));
      b.add(G.box(0.14, 0.09, 0.02, 0xf2d24a).translate(0, 2.0, 0.1));
    });
    var c = Math.cos(ry), s = Math.sin(ry);
    var hx = x + s * 1.2, hz = z + c * 1.2, hy = QY + h + 0.16;
    H.LAMPS.push({ x: hx, y: hy, z: hz, top: [x, QY + h + 0.05, z] });
    for (var k = 0; k < 3; k++) {
      var a2 = k / 3 * Math.PI * 2 + x;
      H.DRIPS.push({ x: hx + Math.cos(a2) * 0.5, y: hy - 0.05, z: hz + Math.sin(a2) * 0.5, rate: 0.5 });
    }
    return [x, QY + h + 0.05, z];
  }

  // ------------------------------------------------------------ utility pole
  function utilityPole(B, x, y, z, ry, hgt) {
    hgt = hgt || 7.2;
    B.group(x, y, z, 0, ry, 0, 1, function (b) {
      b.add(G.fx(G.cylB(0.11, 0.16, hgt, 8, 0x9a8a78), 8, 0));
      b.add(G.fx(G.box(1.7, 0.1, 0.1, 0x8e7f6f).translate(0, hgt - 0.45, 0), 8, 0));
      b.add(G.fx(G.box(1.2, 0.09, 0.09, 0x8e7f6f).translate(0, hgt - 1.05, 0), 8, 0));
      [-0.75, -0.3, 0.3, 0.75].forEach(function (ox) {
        b.add(G.cylB(0.04, 0.05, 0.14, 6, 0xeef2ee).translate(ox, hgt - 0.4, 0));
      });
      [-0.5, 0.5].forEach(function (ox) { b.add(G.cylB(0.04, 0.05, 0.13, 6, 0xeef2ee).translate(ox, hgt - 1.0, 0)); });
      b.add(G.fx(G.cylB(0.2, 0.2, 0.5, 10, 0xaab7bb).translate(0.3, hgt - 1.9, 0), 0, 0.3));       // transformer can
      b.add(G.box(0.3, 0.05, 0.05, 0x6f7f86).translate(0.15, hgt - 1.65, 0));
      for (var i = 0; i < 5; i++) b.add(G.box(0.05, 0.03, 0.2, 0x6f7f86).translate(0, 1.4 + i * 0.42, 0)); // climbing pegs
      b.add(G.box(0.24, 0.34, 0.02, 0xf4f6f0).translate(0, 1.75, 0.15));
    });
    return { x: x, y: y + hgt, z: z, ry: ry };
  }
  function wire(B, a, b, sag, r) {
    B.add(G.tube(G.sagPts(a, b, sag, 10), r || 0.015, 0x4a565c, 4, 20), 'solidNC');
  }
  function crossEnd(p, off) { // point on the cross-arm of a pole
    return [p.x + Math.cos(p.ry) * off, p.y - 0.28, p.z - Math.sin(p.ry) * off];
  }

  // ------------------------------------------------------------ wall fittings
  // helper: orient geometry built around +y axis so +y points along (nx, 0, nz)
  function onWall(g, px, py, pz, nx, nz) {
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz).normalize());
    g.applyQuaternion(q); g.translate(px, py, pz); return g;
  }
  function mooringRing(B, px, py, pz, nx, nz) {
    B.add(G.fx(onWall(G.cylB(0.19, 0.19, 0.035, 8, C.rust), px, py, pz, nx, nz), 3, 0));
    B.add(G.fx(onWall(G.cylB(0.05, 0.05, 0.1, 6, C.rustDark), px, py, pz, nx, nz), 3, 0));
    // hanging ring (vertical plane parallel to the wall)
    var ring = G.torus(0.17, 0.032, C.rustDark, 6, 16);
    if (Math.abs(nx) > 0.5) ring.rotateY(Math.PI / 2);
    ring.translate(px + nx * 0.085, py - 0.17, pz + nz * 0.085);
    B.add(G.fx(ring, 3, 0));
    // rust streak below
    var st = G.plane(0.2, 0.9, 0xc59468);
    if (Math.abs(nx) > 0.5) st.rotateY(nx > 0 ? Math.PI / 2 : -Math.PI / 2); else if (nz < 0) st.rotateY(Math.PI);
    st.translate(px + nx * 0.012, py - 0.6, pz + nz * 0.012);
    B.add(st, 'solidNC');
  }
  function ladder(B, px, pz, nx, nz, yBot, yTop) {
    var tx = -nz, tz = nx, w = 0.26, off = 0.2, i;
    [-1, 1].forEach(function (s) {
      var bx = px + tx * w * s, bz = pz + tz * w * s;
      var pts = [[bx + nx * off, yBot, bz + nz * off], [bx + nx * off, yTop + 0.7, bz + nz * off], [bx + nx * (off - 0.2), yTop + 0.95, bz + nz * (off - 0.2)], [bx - nx * 0.45, yTop + 0.95, bz - nz * 0.45], [bx - nx * 0.6, yTop + 0.75, bz - nz * 0.6], [bx - nx * 0.6, yTop, bz - nz * 0.6]];
      B.add(G.fx(G.tube(pts, 0.035, C.rust, 5, 26, false, 0.15), 3, 0));
      for (var y = yBot + 0.6; y < yTop; y += 1.5) B.add(G.fx(G.pipe([bx + nx * off, y, bz + nz * off], [bx - nx * 0.02, y, bz - nz * 0.02], 0.025, C.rustDark, 4), 3, 0));
    });
    for (var y = yBot + 0.2; y < yTop + 0.1; y += 0.3) {
      B.add(G.fx(G.pipe([px + tx * w + nx * off, y, pz + tz * w + nz * off], [px - tx * w + nx * off, y, pz - tz * w + nz * off], 0.024, G.jit(C.rust, 0.05), 5), 3, 0));
    }
  }
  // barnacles + oysters + seaweed on a wall strip
  function wallLife(B, o) {
    // o: {axis, c, sign, a0, a1, density}
    var len = o.a1 - o.a0, n = Math.round(len * (o.density || 2.2)), i, a, y;
    function P(a, y, out) { return o.axis === 'x' ? [a, y, o.c + o.sign * out] : [o.c + o.sign * out, y, a]; }
    var nx = o.axis === 'x' ? 0 : o.sign, nz = o.axis === 'x' ? o.sign : 0;
    for (i = 0; i < n; i++) {
      a = o.a0 + rnd() * len;
      var cl = 2 + Math.floor(rnd() * 5);
      y = -0.45 + rnd() * 0.6;
      for (var k = 0; k < cl; k++) {                        // barnacle cluster near the waterline
        var aa = a + (rnd() - 0.5) * 0.3, yy = y + (rnd() - 0.5) * 0.25, s = 0.035 + rnd() * 0.04;
        var p = P(aa, yy, 0.03);
        B.add(onWall(G.cylB(s * 0.45, s, s * 1.1, 5, G.jit(0xdfe2d6, 0.05)), p[0], p[1], p[2], nx, nz), 'solidNC');
      }
    }
    n = Math.round(len * (o.density || 2.2) * 0.8);
    for (i = 0; i < n; i++) {                               // oyster shells lower down and at the foot of the wall
      a = o.a0 + rnd() * len;
      var bedY = (o.bed !== undefined) ? o.bed : H.seabedY.apply(null, o.axis === 'x' ? [a, o.c + o.sign * 0.5] : [o.c + o.sign * 0.5, a]);
      y = rnd() < 0.5 ? (-0.3 - rnd() * 1.6) : (bedY + 0.1 + rnd() * 1.0);
      var s2 = 0.07 + rnd() * 0.09, p2 = P(a, y, 0.04);
      s2 *= 0.62; var sh = G.sph(s2, G.jit(rnd() < 0.5 ? 0xa9b0a4 : 0x8f988f, 0.05), 6, 4).scale(1, 0.3, 0.7 + rnd() * 0.5);
      sh.rotateY(rnd() * 3.1);
      B.add(onWall(sh, p2[0], p2[1], p2[2], nx, nz), 'solidNC');
      if (rnd() < 0.5) {
        var p3 = P(a + 0.02, y + 0.01, 0.07);
        B.add(onWall(G.sph(s2 * 0.6, 0xc9cec2, 5, 3).scale(1, 0.25, 0.8), p3[0], p3[1], p3[2], nx, nz), 'solidNC');
      }
    }
    n = Math.round(len * (o.weed || 1.3));
    for (i = 0; i < n; i++) {                               // seaweed fronds: tufts on the wall and at its foot
      a = o.a0 + rnd() * len;
      var bedY2 = (o.bed !== undefined) ? o.bed : H.seabedY.apply(null, o.axis === 'x' ? [a, o.c + o.sign * 0.4] : [o.c + o.sign * 0.4, a]);
      var foot = rnd() < 0.55;
      var hgt = foot ? 0.7 + rnd() * 1.4 : 0.35 + rnd() * 0.6;
      var y0 = foot ? bedY2 - 0.05 : (-0.25 - rnd() * 1.6);
      var pp = P(a, y0, foot ? 0.25 + rnd() * 0.5 : 0.05);
      weed(B, pp[0], pp[1], pp[2], hgt, foot ? 1 : -1, nx, nz, rnd() < 0.3 ? C.kelp : (rnd() < 0.5 ? C.seaweed : C.seaweed2));
    }
  }
  // one frond: tapered ribbon, sway weight grows along its length
  function weed(B, x, y, z, hgt, dir, nx, nz, hex) {
    var w = 0.06 + rnd() * 0.07, segs = 6, bend = (rnd() - 0.5) * 0.5, lean = dir < 0 ? 0.35 : 0.08;
    var ph = rnd() * 6.28, ry = rnd() * Math.PI;
    var g = new THREE.PlaneGeometry(w * 2, hgt, 1, segs);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var t = p.getY(i) / hgt + 0.5;
      var ww = (1 - t * 0.75) * (0.6 + 0.4 * Math.sin(t * 9 + ph));
      p.setX(i, p.getX(i) * ww + Math.sin(t * 2.2 + ph) * bend * t);
      p.setY(i, t * hgt * dir);
      p.setZ(i, Math.sin(t * 1.6) * lean * hgt * 0.5);
    }
    g.computeVertexNormals();
    G.grad(g, dir > 0 ? G.mix(hex, 0x1f4a3a, 0.4) : hex, dir > 0 ? G.mix(hex, 0xa9d68a, 0.35) : G.mix(hex, 0x1f4a3a, 0.3), 'y');
    G.fx(g, 4, 0);
    G.sway(g, function (px, py) { var tt = Math.abs(py) / hgt; return tt * tt * (0.8 + hgt * 0.5); }, ph);
    g.rotateY(ry);
    // lean away from the wall
    g.translate(x + nx * 0.02, y, z + nz * 0.02);
    B.add(g, 'solidDS');
  }
  H.weed = weed;

  // ------------------------------------------------------------ chain along a path (list of [x,y,z])
  function chain(B, pts, hex, size) {
    size = size || 0.11;
    var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
    var len = curve.getLength(), n = Math.floor(len / (size * 1.55)), i;
    var P = new THREE.Vector3(), T = new THREE.Vector3(), q = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), q2 = new THREE.Quaternion();
    for (i = 0; i <= n; i++) {
      curve.getPointAt(i / n, P); curve.getTangentAt(i / n, T);
      var g = G.torus(size, size * 0.27, hex, 5, 8).scale(1.45, 1, 1);
      if (i % 2) g.rotateX(Math.PI / 2);
      q.setFromUnitVectors(X, T.normalize());
      g.applyQuaternion(q); g.translate(P.x, P.y, P.z);
      B.add(G.fx(g, 3, 0), 'solidNC');
    }
  }
  H.chain = chain;

  function anchor(B, x, y, z, ry, rz) {
    B.group(x, y, z, 0, ry, rz, 1, function (b) {
      var col = 0x6f6a62;
      b.add(G.fx(G.box(0.12, 1.5, 0.1, col).translate(0, 0.75, 0), 3, 0));                 // shank
      b.add(G.fx(G.torus(0.13, 0.035, col, 5, 10).translate(0, 1.6, 0), 3, 0));            // ring
      b.add(G.fx(G.box(0.95, 0.09, 0.09, col).translate(0, 1.36, 0).rotateY(Math.PI / 2), 3, 0)); // stock
      // curved arms + flukes
      b.add(G.fx(G.tube([[-0.62, 0.42, 0], [-0.42, 0.1, 0], [0, 0, 0], [0.42, 0.1, 0], [0.62, 0.42, 0]], 0.065, col, 5, 16), 3, 0));
      [-1, 1].forEach(function (s) {
        b.add(G.fx(G.extrude([[0, 0], [0.26, -0.06], [0.1, 0.34]], 0.05, col).translate(-0.1, 0, -0.025).rotateZ(s > 0 ? -0.5 : 0.5 + Math.PI * 0).scale(s, 1, 1).translate(s * 0.6, 0.36, 0), 3, 0), 'solidDS');
      });
    });
  }
  function tyre(B, x, y, z, rx, ry, rz, s) {
    var g = G.torus(0.42, 0.17, C.tyre, 8, 18);
    G.paintFn(g, function (px, py, pz) { return Math.abs(pz) > 0.12 ? 0x2c3034 : 0x3b4046; });
    g.scale(s || 1, s || 1, (s || 1) * 1.1);
    G.at(g, x, y, z, rx, ry, rz);
    B.add(g);
    // tread notches
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI * 2;
      var nb = G.box(0.035, 0.05, 0.15, 0x24272b).translate(0.578 * (s || 1), 0, 0).rotateZ(a);
      G.at(nb, x, y, z, rx, ry, rz); B.add(nb, 'solidNC');
    }
  }
  H.tyreGeom = tyre;
  H.anchorGeom = anchor;

  H.buildQuay = function (B) {
    var i;
    // ---------------- bollards : a row along the arm quay, more along the front quay
    var front = [-23.3, -11.2, -8.5, 2.15, 10.7];
    front.forEach(function (x) { addBollard(B, x, L.FRONT_Z + 1.0); });
    var arm = [9.2, 4.6, -0.1, -4.7, -9.3];
    arm.forEach(function (z) { addBollard(B, L.ARM_X + 0.98, z); });
    addBollard(B, 5.5, L.BW.z1 - 0.75, L.BW.top);    // on the breakwater root
    addBollard(B, -2.5, L.BW.z1 - 0.75, L.BW.top);

    // spare hawsers: wound round a bollard, tail over the edge and down into the water (wet part darker)
    function hawser(bi, tailDx, tailDz, wallX, wallZ, hex) {
      var b = H.BOLLARDS[bi], Y = b.y0;
      coil(B, b.x, b.z, 3, hex, 0.055, Y);
      var pts = [[b.x + 0.235, Y + 0.16, b.z], [b.x + tailDx * 0.4 + 0.1, Y + 0.07, b.z + tailDz * 0.4], [b.x + tailDx * 0.8, Y + 0.06, b.z + tailDz * 0.8]];
      var ex = wallX !== null ? wallX : b.x + tailDx, ez = wallZ !== null ? wallZ : b.z + tailDz;
      pts.push([ex, Y + 0.3, ez]);
      var ox = wallX !== null ? (wallX > b.x ? 0.22 : -0.22) : 0, oz = wallZ !== null ? (wallZ > b.z ? 0.22 : -0.22) : 0;
      pts.push([ex + ox, Y - 0.1, ez + oz], [ex + ox * 1.1, 0.6, ez + oz * 1.1], [ex + ox * 1.2, -0.4, ez + oz * 1.2 + 0.05], [ex + ox * 1.5 + 0.1, -1.5, ez + oz * 1.5 + 0.12]);
      var g = G.rope(pts, 0.055, hex, 60, 9);
      G.paintFn(g, function (x, y) { return y < 0.34 ? C.ropeWet : (y < 0.62 ? G.mix(hex, C.ropeWet, 0.6) : (y < 0.9 ? G.mix(hex, C.ropeWet, 0.25) : hex)); });
      B.add(g);
    }
    hawser(1, 0.5, -1.0, null, L.FRONT_Z - 0.02, C.rope);
    hawser(0, 0.3, -1.0, null, L.FRONT_Z - 0.02, C.rope);
    hawser(9, -1.0, 0.5, L.ARM_X - 0.02, null, C.rope);
    hawser(10, 0.4, 1.0, null, L.BW.z1 + 0.02, 0xdccba0);

    // ---------------- lamp posts + utility poles + thin wires across the sky
    var p4 = lampPost(B, -29.0, 21.0, Math.PI);
    var p1 = lampPost(B, -10.3, 14.1, Math.PI);
    var p2 = lampPost(B, 11.9, 14.3, Math.PI);
    var p3 = lampPost(B, 16.1, 1.0, -Math.PI / 2);
    var poleA = utilityPole(B, 21.2, QY, 12.6, 0.25, 7.4);
    var poleB = utilityPole(B, 20.9, QY, -13.2, 0.1, 7.2);
    H.POLES = [poleA, poleB];
    wire(B, p4, p1, 1.5); wire(B, p1, p2, 1.7);
    wire(B, p2, crossEnd(poleA, -0.75), 0.9);
    wire(B, [p1[0], p1[1] - 0.12, p1[2]], [p2[0], p2[1] - 0.12, p2[2]], 1.95, 0.016);
    wire(B, crossEnd(poleA, 0.75), crossEnd(poleB, 0.75), 2.2);
    wire(B, crossEnd(poleA, 0.3), crossEnd(poleB, 0.3), 2.45);
    wire(B, crossEnd(poleA, -0.3), crossEnd(poleB, -0.3), 2.0, 0.016);
    wire(B, p3, crossEnd(poleB, -0.75), 0.8);
    H.WIRE_A = crossEnd(poleA, -0.75); H.WIRE_B = crossEnd(poleB, 0.75);

    // ---------------- mooring rings & rusty ladders running down the quay wall
    [-9.6, -1.2, 6.2, 12.4].forEach(function (x) { mooringRing(B, x, 0.98, L.FRONT_Z - 0.03, 0, -1); });
    [8.2, 1.4, -6.4].forEach(function (z) { mooringRing(B, L.ARM_X - 0.03, 0.98, z, -1, 0); });
    mooringRing(B, L.PLAT.x0 + 2.6, 0.05, L.PLAT.z0 - 0.03, 0, -1);
    ladder(B, -11.7, L.FRONT_Z - 0.04, 0, -1, -2.4, QY);
    ladder(B, L.ARM_X - 0.04, -1.9, -1, 0, -2.6, QY);
    ladder(B, L.ARM_X - 0.04, 10.9, -1, 0, -2.2, QY);
    ladder(B, -23.4, L.FRONT_Z - 0.04, 0, -1, -2.0, QY);

    // ---------------- life on the walls
    wallLife(B, { axis: 'x', c: L.FRONT_Z, sign: -1, a0: -24.4, a1: L.STEPS.x0 - 0.4 });
    wallLife(B, { axis: 'x', c: L.FRONT_Z, sign: -1, a0: L.PLAT.x1, a1: L.ARM_X });
    wallLife(B, { axis: 'x', c: L.FRONT_Z, sign: -1, a0: -32, a1: -31, density: 4, weed: 3 });
    wallLife(B, { axis: 'z', c: L.ARM_X, sign: -1, a0: L.BW.z1, a1: L.FRONT_Z });
    wallLife(B, { axis: 'x', c: L.PLAT.z0, sign: -1, a0: L.PLAT.x0, a1: L.PLAT.x1, density: 3 });
    wallLife(B, { axis: 'x', c: L.BW.z1, sign: 1, a0: L.BW.x0, a1: L.BW.x1, density: 1.6 });
    wallLife(B, { axis: 'x', c: L.BW.z0, sign: -1, a0: L.BW.x0, a1: L.HILL_X, density: 1.3 });
    wallLife(B, { axis: 'z', c: L.SLIP.x0, sign: -1, a0: L.SLIP.zEnd, a1: L.FRONT_Z, density: 3, weed: 2.5 });
    wallLife(B, { axis: 'z', c: L.HILL_X, sign: -1, a0: -32, a1: L.ARM_Z, density: 1.2 });

    // ---------------- sea-bed objects (clustered near the left section pane so they read through the glass)
    function bed(x, z) { return H.seabedY(x, z); }
    tyre(B, -27.6, bed(-27.6, 2.6) + 0.17, 2.6, Math.PI / 2, 0.3, 0.12, 1.15);
    tyre(B, -25.2, bed(-25.2, -1.4) + 0.38, -1.4, 0.35, 1.1, 0.0, 1.0);
    tyre(B, -6.0, bed(-6, 6.5) + 0.16, 6.5, Math.PI / 2, 0, 0.1, 1.0);
    tyre(B, -19.5, bed(-19.5, -27) + 0.16, -27.2, Math.PI / 2, 0, -0.08, 1.1);
    anchor(B, -29.0, bed(-29, -3.6) + 0.12, -3.6, 0.5, 1.25);
    // old chain snaking from the anchor past the tyre
    var cpts = [[-29.0, 0, -3.9], [-28.2, 0, -2.6], [-28.8, 0, -1.0], [-27.6, 0, 0.4], [-26.3, 0, 0.2], [-25.6, 0, 1.9], [-26.6, 0, 3.6], [-27.9, 0, 4.4], [-28.6, 0, 6.0]];
    cpts.forEach(function (p) { p[1] = bed(p[0], p[2]) + 0.07; });
    chain(B, cpts, 0x6f6a62, 0.12);
    var c2 = [[-21, 0, -26.4], [-19.6, 0, -25.6], [-18.2, 0, -26.5], [-16.4, 0, -25.8], [-15, 0, -26.9]];
    c2.forEach(function (p) { p[1] = bed(p[0], p[2]) + 0.07; });
    chain(B, c2, 0x6f6a62, 0.11);
    // seagrass clumps
    var clumps = [[-29.5, 7.2], [-26.3, 5.2], [-23.4, 1.2], [-29.8, -8.6], [-25.6, -6.4], [-21.4, 7.8], [-28.2, -15.5], [-13, -27.4], [-24.6, -22.6], [-17.6, 2.8], [-9.6, 9.0], [2.6, 5.2], [9.5, -3.4], [-30.2, 0.6]];
    clumps.forEach(function (c) {
      var n = 9 + Math.floor(rnd() * 8);
      for (var k = 0; k < n; k++) {
        var a = rnd() * 6.28, r = rnd() * 0.75, x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
        weed(B, x, bed(x, z) - 0.05, z, 0.8 + rnd() * 1.5, 1, 0, 0, [0x4f9a5f, 0x69b06a, 0x3f8a66, 0x86c070][Math.floor(rnd() * 4)]);
      }
    });
    // starfish, urchins and a lost bottle
    function star(x, z, hex, s) {
      var pts = [];
      for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2, r = k % 2 ? 0.1 : 0.26; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      B.add(G.extrude(pts, 0.05, hex).rotateX(-Math.PI / 2).scale(s, s, s).rotateY(rnd() * 3).translate(x, bed(x, z) + 0.04, z), 'solidNC');
    }
    star(-28.6, 1.6, 0xf28a4a, 1.0); star(-24.4, 4.0, 0xe9694f, 0.8); star(-22.6, -4.8, 0xf2a04a, 0.9); star(-12.4, -29.6, 0xf28a4a, 0.9);
    [[-27.0, -5.4], [-30.2, 4.4], [-23.8, 7.0], [-26.2, -24.4]].forEach(function (u) {
      B.add(G.ico(0.14, 1, 0x3a2f4a).scale(1, 0.75, 1).translate(u[0], bed(u[0], u[1]) + 0.08, u[1]), 'solidNC');
      for (var k = 0; k < 9; k++) {
        var a = k / 9 * 6.28, t = 0.3 + rnd() * 0.9;
        B.add(G.pipe([u[0], bed(u[0], u[1]) + 0.08, u[1]], [u[0] + Math.cos(a) * 0.26 * Math.cos(t), bed(u[0], u[1]) + 0.08 + Math.sin(t) * 0.26, u[1] + Math.sin(a) * 0.26 * Math.cos(t)], 0.012, 0x2e2540, 3, 0.002), 'solidNC');
      }
    });
    B.add(G.fx(G.lathe([[0, 0], [0.07, 0], [0.07, 0.2], [0.03, 0.27], [0.03, 0.34], [0, 0.34]], 8, 0x8fc7a8).rotateZ(1.4).translate(-24.9, bed(-24.9, 8.6) + 0.09, 8.6), 0, 0.6), 'solidNC');
    // bigger boulders by the wall feet
    for (i = 0; i < 46; i++) {
      var x = -31 + rnd() * 44, z = L.FRONT_Z - 0.7 - rnd() * 2.6;
      if (rnd() < 0.4) { x = L.ARM_X - 0.7 - rnd() * 2.4; z = -10 + rnd() * 21; }
      if (x > L.SLIP.x0 - 0.5 && x < L.SLIP.x1 + 0.5 && z > L.SLIP.zEnd) continue;
      if (x > L.STEPS.x0 - 0.6 && x < L.PLAT.x1 + 0.4 && z > L.PLAT.z0 - 0.5) continue;
      var s = 0.3 + rnd() * 0.45;
      B.add(G.ico(s, 0, G.jit([C.rock, 0x7b8b8a, 0xa3aeaa][Math.floor(rnd() * 3)], 0.04)).scale(1, 0.7, 0.85).rotateY(rnd() * 6).translate(x, bed(x, z) + s * 0.3, z));
    }
  };
})();
