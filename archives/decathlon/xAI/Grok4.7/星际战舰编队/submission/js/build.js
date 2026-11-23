/* Fleet geometry. One voxel = one grid cell across every solid object. */
(function () {
  var FW = window.FW;
  var H = 1, D = 2, T = 3, E = 4, C = 5, S = 6, N = 7, G = 8, RK = 9, HOT = 10, SC = 11;

  function mesh(vol) {
    return FW.meshVolume(vol);
  }

  function hash(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function nozzle(vol, cx, cy, z1, len, rx, ry) {
    var z0 = z1 - len;
    var y0 = cy - ry - 2, y1 = cy + ry + 2, x0 = cx - rx - 2, x1 = cx + rx + 2;
    for (var z = z0; z < z1 + 1; z++) {
      var u = Math.max(0, Math.min(1, (z - z0) / len));
      var erx = rx * (0.42 + 0.58 * u);
      var ery = ry * (0.42 + 0.58 * u);
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var nx = (x + 0.5 - cx) / erx, ny = (y + 0.5 - cy) / ery;
          var d2 = nx * nx + ny * ny;
          if (d2 <= 1) vol.set(x, y, z, 0);
          else if (d2 < 1.35 && z > z1 - 4) vol.set(x, y, z, T);
        }
      }
    }
    var zg = z0 + 2;
    var irx = rx * 0.48, iry = ry * 0.48;
    for (var y2 = cy - iry; y2 <= cy + iry; y2++) {
      for (var x2 = cx - irx; x2 <= cx + irx; x2++) {
        var nx2 = (x2 + 0.5 - cx) / irx, ny2 = (y2 + 0.5 - cy) / iry;
        var d = nx2 * nx2 + ny2 * ny2;
        if (d <= 1 && d > 0.25) vol.set(x2, y2, zg, E);
      }
    }
  }

  function ellipseCarve(vol, cx, cy, z0, z1, rx, ry) {
    for (var z = z0; z < z1; z++) {
      for (var y = cy - ry; y <= cy + ry; y++) {
        for (var x = cx - rx; x <= cx + rx; x++) {
          var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
          if (nx * nx + ny * ny <= 1) vol.set(x, y, z, 0);
        }
      }
    }
  }

  function buildFlagship(out) {
    var vol = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { vol.fillBox(a, b, c, d, e, f, m); };
    var R = function (a, b, c, d, e, f, t, m) { vol.frame(a, b, c, d, e, f, t, m); };
    var K = function (a, b, c, d, e, f) { vol.carve(a, b, c, d, e, f); };

    /* Center tine: long beam cannon, muzzle proud of the side prongs. */
    R(-46, -28, -400, 46, 38, -330, 3, H);
    R(-32, -20, -480, 32, 28, -400, 3, H);
    R(-22, -14, -560, 22, 22, -480, 3, H);
    R(-16, -10, -640, 16, 18, -560, 3, H);
    R(-18, -12, -644, 18, 20, -630, 2, T);
    ellipseCarve(vol, 0, 4, -646, -390, 9, 9);
    for (var z = -610; z < -410; z += 18) {
      R(-20, -12, z, 20, 20, z + 3, 2, T);
      F(-2, 16, z, 2, 22, z + 2, C);
      F(-2, -16, z, 2, -10, z + 2, C);
      F(-18, 1, z, -12, 8, z + 2, C);
      F(12, 1, z, 18, 8, z + 2, C);
    }
    F(-5, 0, -470, 5, 9, -430, C);
    for (var zz = -630; zz < -560; zz += 4) F(-1, 2, zz, 1, 6, zz + 1, C);
    /* Dark throats beside the cannon where the fork opens. */
    K(-78, -6, -430, -40, 20, -360);
    K(40, -6, -430, 78, 20, -360);

    function prong(sign) {
      var a = sign < 0 ? -1 : 1;
      function span(x0, x1, y0, y1, z0, z1, t, m) {
        var xa = Math.min(a * x0, a * x1), xb = Math.max(a * x0, a * x1);
        if (t) R(xa, y0, z0, xb, y1, z1, t, m);
        else F(xa, y0, z0, xb, y1, z1, m);
      }
      /* Shoulder ties the fork back into the bow face. */
      span(78, 150, -24, 34, -390, -300, 2, H);
      span(100, 158, -16, 24, -480, -390, 2, H);
      span(112, 146, -8, 16, -548, -480, 2, H);
      /* Tip cavity, inner dark cheek, outer bone lip, dorsal step. */
      K(Math.min(a * 122, a * 132), -2, -548, Math.max(a * 122, a * 132), 10, -500);
      span(86, 102, -4, 12, -470, -360, 0, D);
      span(148, 164, -14, -4, -500, -360, 0, T);
      span(108, 144, 20, 32, -460, -390, 0, H);
      for (var g = -520; g < -340; g += 22) span(108, 148, -1, 1, g, g + 1, 0, S);
    }
    prong(1);
    prong(-1);

    /* Forward body and bridge fortress. */
    R(-90, -44, -400, 90, 46, -180, 2, H);
    R(-118, -30, -370, -90, 22, -190, 2, H);
    R(90, -30, -370, 118, 22, -190, 2, H);
    R(-86, 34, -426, 86, 116, -250, 3, H);
    R(-108, -52, -180, 108, 54, -16, 2, H);
    R(-136, -80, -16, 136, 82, 36, 2, H);

    /* Core cathedral. */
    R(-172, -132, -6, 172, 160, 222, 3, H);
    F(-184, -20, 30, -172, 90, 170, H);
    F(172, -20, 30, 184, 90, 170, H);
    F(-70, 156, 40, 70, 172, 160, H);
    F(-150, -140, 20, -40, -128, 180, D);
    F(40, -140, 20, 150, -128, 180, D);

    /* Aft spine, hangar pods, engines. */
    R(-100, -58, 200, 100, 68, 440, 2, H);
    R(-210, -44, 186, -78, 76, 566, 2, H);
    R(78, -44, 186, 210, 76, 566, 2, H);
    F(-130, -24, 210, -96, 46, 300, H);
    F(96, -24, 210, 130, 46, 300, H);
    R(-74, -42, 430, 74, 50, 512, 2, H);
    R(-56, -32, 512, 56, 38, 552, 2, T);
    R(-40, -22, 548, 40, 28, 568, 2, H);

    /* Stepped chin, narrower than the fork, so the tines are the silhouette. */
    R(-26, -46, -560, 26, -18, -470, 2, H);
    R(-46, -72, -490, 46, -18, -400, 2, H);
    R(-68, -108, -420, 68, -18, -340, 2, H);
    R(-84, -128, -360, 84, -18, -10, 3, H);

    /* Layered flank plates. */
    for (var i = 0; i < 6; i++) {
      var zs = -350 + i * 36;
      F(-122, -8, zs, -90, 18, zs + 24, H);
      F(-126, -4, zs + 2, -122, 14, zs + 22, D);
      F(90, -8, zs, 122, 18, zs + 24, H);
      F(122, -4, zs + 2, 126, 14, zs + 22, D);
    }
    for (var k = 0; k < 4; k++) {
      var za = 40 + k * 40;
      F(-188, 8, za, -168, 36, za + 26, H);
      F(168, 8, za, 188, 36, za + 26, H);
    }

    /* Dorsal ridge steps outside the bridge. */
    R(-28, 46, -170, 28, 70, -20, 2, H);
    R(-22, 66, -150, 22, 84, -40, 2, T);
    F(-16, 160, 50, 16, 178, 150, H);

    /* Belly ribs. */
    for (var rib = -380; rib < 180; rib += 28) {
      F(-64, -64, rib, 64, -46, rib + 3, D);
      F(-2, -70, rib, 2, -48, rib + 1, S);
    }
    for (var seam = -420; seam < 500; seam += 48) {
      F(-2, 42, seam, 2, 46, seam + 1, S);
    }

    /* Rooms and openings. */
    K(-68, 46, -400, 68, 104, -264);
    K(-42, 58, -432, 42, 90, -394);
    K(-126, -112, -2, 126, 142, 210);
    K(-56, -104, -398, 56, -30, -18);
    K(-82, -118, -402, 82, -20, -328);
    K(-180, -28, 200, -86, 60, 550);
    K(86, -28, 200, 180, 60, 550);
    K(-216, -16, 246, -170, 52, 346);
    K(170, -16, 246, 216, 52, 346);
    K(-156, -6, 528, -112, 36, 566);
    K(112, -6, 528, 156, 36, 566);

    /* A few narrow light slits on the core hull. */
    for (var sli = 0; sli < 5; sli++) {
      var zy = 30 + sli * 32;
      K(-176, 20 + sli * 8, zy, -168, 28 + sli * 8, zy + 10);
      K(168, 20 + sli * 8, zy, 176, 28 + sli * 8, zy + 10);
    }

    var engines = [
      { x: 0, y: 6, z: 566, rx: 16, ry: 14, len: 36 },
      { x: -32, y: 18, z: 548, rx: 11, ry: 10, len: 28 },
      { x: 32, y: 18, z: 548, rx: 11, ry: 10, len: 28 },
      { x: -40, y: -12, z: 536, rx: 10, ry: 9, len: 26 },
      { x: 40, y: -12, z: 536, rx: 10, ry: 9, len: 26 },
      { x: -16, y: -22, z: 524, rx: 8, ry: 8, len: 22 },
      { x: 16, y: -22, z: 524, rx: 8, ry: 8, len: 22 }
    ];
    engines.forEach(function (e) { nozzle(vol, e.x, e.y, e.z, e.len, e.rx, e.ry); });

    /* Glass sensor band above the bow, not a cockpit. */
    F(-10, 30, -430, 10, 34, -400, G);
    F(-6, 108, -360, 6, 112, -300, G);

    out.flagship = mesh(vol);
    out.engines.flagship = engines;
    out.cannon = { x: 0, y: 4, z: -642 };
    out.turrets = [
      { x: 0, y: 36, z: -520 },
      { x: -78, y: 44, z: -450 },
      { x: 78, y: 44, z: -420 },
      { x: -48, y: 120, z: -360 },
      { x: 52, y: 120, z: -300 },
      { x: -18, y: 74, z: -120 },
      { x: 20, y: 74, z: -50 },
      { x: -30, y: 176, z: 70 },
      { x: 34, y: 176, z: 130 },
      { x: 0, y: 184, z: 180 },
      { x: -120, y: 40, z: 80 },
      { x: 124, y: 36, z: 150 },
      { x: -70, y: 78, z: 300 },
      { x: 74, y: 80, z: 360 }
    ];
    out.bounds.flagship = { x: 0, y: 16, z: 0, hx: 216, hy: 168, hz: 650 };
  }

  function buildBridge() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    var R = function (a, b, c, d, e, f, t, m) { v.frame(a, b, c, d, e, f, t, m); };
    var K = function (a, b, c, d, e, f) { v.carve(a, b, c, d, e, f); };
    F(-66, 46, -396, 66, 49, -268, D);
    F(-66, 100, -396, 66, 103, -268, D);
    F(36, 49, -390, 64, 52, -272, H);
    F(-64, 49, -390, -36, 52, -272, H);
    F(34, 62, -388, 64, 65, -274, H);
    F(-64, 62, -388, -34, 65, -274, H);
    for (var s = 0; s < 10; s++) {
      F(26, 49 + s * 1.3, -312 - s * 2, 36, 52 + s * 1.3, -309 - s * 2, T);
      F(-36, 49 + s * 1.3, -332 - s * 2, -26, 52 + s * 1.3, -329 - s * 2, T);
    }
    F(-16, 49, -362, 16, 56, -332, H);
    F(-12, 56, -358, 12, 60, -336, D);
    F(-8, 60, -354, 8, 64, -340, T);
    R(-20, 72, -366, 20, 76, -328, 1, T);
    F(-16, 73, -362, 16, 75, -332, SC);
    R(-6, 80, -352, 6, 92, -344, 1, T);
    F(-4, 82, -350, 4, 90, -346, SC);
    for (var z = -384; z < -280; z += 26) F(-62, 96, z, 62, 100, z + 3, H);
    for (var k = 0; k < 8; k++) {
      var zz = -378 + k * 13;
      F(40, 52, zz, 60, 57, zz + 8, D);
      F(42, 56, zz + 1, 58, 58, zz + 7, SC);
      F(-60, 52, zz, -40, 57, zz + 8, D);
      F(-58, 56, zz + 1, -42, 58, zz + 7, SC);
      F(40, 65, zz, 58, 69, zz + 6, D);
      F(42, 68, zz + 1, 56, 70, zz + 5, SC);
      F(-58, 65, zz, -40, 69, zz + 6, D);
      F(-56, 68, zz + 1, -42, 70, zz + 5, SC);
    }
    F(-2, 49, -390, 2, 50, -274, S);
    F(-30, 49, -310, -26, 100, -306, H);
    F(26, 49, -348, 30, 100, -344, H);
    F(-44, 49, -286, -40, 96, -282, H);
    R(-50, 54, -400, 50, 96, -392, 2, T);
    K(-40, 60, -402, 40, 88, -390);
    R(44, 70, -330, 62, 88, -312, 1, T);
    F(46, 74, -326, 60, 84, -316, SC);
    R(-62, 70, -360, -44, 90, -340, 1, T);
    F(-60, 74, -356, -46, 86, -344, SC);
    return mesh(v);
  }

  function buildCore() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    var levels = [-80, -40, 0, 40, 80, 116];
    for (var li = 0; li < levels.length; li++) {
      var y = levels[li];
      var outer = 100;
      var inner = 78;
      F(-outer, y, 100 - outer, outer, y + 4, 100 + outer, H);
      v.carve(-inner, y - 1, 100 - inner, inner, y + 5, 100 + inner);
      v.carve(-10, y - 1, 100 + inner - 8, 10, y + 5, 100 + outer + 2);
      v.carve(-10, y - 1, 100 - outer - 2, 10, y + 5, 100 - inner + 8);
      v.carve(inner - 8, y - 1, 94, outer + 2, y + 5, 106);
      v.carve(-outer - 2, y - 1, 94, -inner + 8, y + 5, 106);
      F(-outer, y + 4, 100 - outer, -outer + 3, y + 7, 100 + outer, T);
      F(outer - 3, y + 4, 100 - outer, outer, y + 7, 100 + outer, T);
    }
    [[-14, -14], [10, -14], [-14, 10], [10, 10]].forEach(function (p) {
      F(p[0], -104, 100 + p[1], p[0] + 4, 134, 100 + p[1] + 4, T);
    });
    for (var y = -96; y < 132; y += 7) {
      v.frame(-7, y, 93, 7, y + 2, 107, 1, N);
    }
    F(-3, -100, 97, 3, 130, 103, N);
    function strut(y, x0, z0, x1, z1) {
      var steps = 36;
      for (var i = 0; i < steps; i++) {
        var u = i / (steps - 1);
        var x = (x0 + (x1 - x0) * u) | 0;
        var z = (z0 + (z1 - z0) * u) | 0;
        F(x, y, z, x + 5, y + 7, z + 5, D);
      }
    }
    strut(-20, -116, 40, -16, 92);
    strut(20, 116, 168, 16, 112);
    strut(60, -110, 176, -16, 114);
    strut(-60, 100, 30, 14, 90);
    for (var i = 0; i < 7; i++) {
      var z = 16 + i * 26;
      F(-124, -100, z, -120, 136, z + 3, D);
      F(120, -100, z, 124, 136, z + 3, D);
    }
    for (var j = 0; j < 6; j++) {
      var yy = -90 + j * 36;
      F(-20, yy, 8, 20, yy + 3, 192, D);
    }
    return mesh(v);
  }

  function buildHangar() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    [-1, 1].forEach(function (sg) {
      var x0 = sg < 0 ? -178 : 88;
      var x1 = sg < 0 ? -88 : 178;
      F(x0, -28, 202, x1, -24, 548, D);
      var gx = sg < 0 ? -134 : 116;
      F(gx, -24, 210, gx + 3, -23, 540, S);
      F(gx + 10, -24, 210, gx + 13, -23, 540, S);
      for (var i = 0; i < 8; i++) {
        var z = 228 + i * 36;
        var inner = sg < 0 ? -114 : 92;
        var outer = sg < 0 ? -170 : 148;
        F(outer, -22, z, outer + 22 * (sg < 0 ? 1 : 1), 30, z + 3, H);
        if (sg < 0) F(-170, -22, z, -148, 30, z + 3, H);
        else F(148, -22, z, 170, 30, z + 3, H);
        if (sg < 0) F(-116, -22, z, -94, 30, z + 3, H);
        else F(94, -22, z, 116, 30, z + 3, H);
        if (i % 2 === 0) {
          if (sg < 0) F(-172, 42, z, -92, 48, z + 6, T);
          else F(92, 42, z, 172, 48, z + 6, T);
        }
      }
      for (var j = 0; j < 5; j++) {
        var zz = 260 + j * 52;
        if (sg < 0) {
          F(-158, 6, zz, -146, 12, zz + 18, D);
          F(-148, 4, zz + 6, -122, 10, zz + 11, T);
        } else {
          F(146, 6, zz, 158, 12, zz + 18, D);
          F(122, 4, zz + 6, 148, 10, zz + 11, T);
        }
      }
      if (sg < 0) {
        F(-172, -22, 522, -94, 54, 528, H);
        v.carve(-150, -4, 520, -114, 34, 532);
        F(-148, -2, 544, -116, 30, 550, N);
      } else {
        F(94, -22, 522, 172, 54, 528, H);
        v.carve(114, -4, 520, 150, 34, 532);
        F(116, -2, 544, 148, 30, 550, N);
      }
      /* ceiling ribs */
      for (var c = 210; c < 520; c += 30) {
        if (sg < 0) F(-170, 52, c, -96, 56, c + 2, D);
        else F(96, 52, c, 170, 56, c + 2, D);
      }
    });
    return mesh(v);
  }

  function buildGallery() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    var R = function (a, b, c, d, e, f, t, m) { v.frame(a, b, c, d, e, f, t, m); };
    F(-54, -104, -396, 54, -100, -22, D);
    F(-54, -36, -396, 54, -32, -22, D);
    F(-2, -100, -390, 2, -99, -28, S);
    for (var i = 0; i < 9; i++) {
      var z = -372 + i * 38;
      R(-50, -98, z, -28, -40, z + 16, 2, H);
      R(28, -98, z, 50, -40, z + 16, 2, H);
      F(-42, -86, z + 4, -36, -52, z + 11, N);
      F(36, -86, z + 4, 42, -52, z + 11, N);
      F(-30, -88, z + 1, -27, -48, z + 15, D);
      F(27, -88, z + 1, 30, -48, z + 15, D);
      R(-26, -92, z + 16, 26, -40, z + 21, 2, T);
      v.carve(-16, -82, z + 15, 16, -48, z + 23);
    }
    F(-5, -44, -392, 5, -39, -26, N);
    F(-18, -50, -392, -13, -45, -26, D);
    F(13, -50, -392, 18, -45, -26, D);
    R(-78, -116, -400, 78, -22, -328, 3, T);
    v.carve(-64, -104, -394, 64, -34, -336);
    v.carve(-46, -96, -336, 46, -42, -322);
    F(-58, -96, -398, 58, -38, -392, N);
    F(-74, -110, -390, -66, -28, -30, S);
    F(66, -110, -390, 74, -28, -30, S);
    for (var p = 0; p < 4; p++) {
      var zz = -340 + p * 70;
      F(-22, -78, zz, -8, -70, zz + 10, D);
      F(8, -78, zz, 22, -70, zz + 10, D);
    }
    return mesh(v);
  }

  function torus(R, tube, mat) {
    var v = new FW.Volume();
    var steps = Math.max(24, (R * 6.2) | 0);
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2;
      var x = Math.round(Math.cos(a) * R);
      var z = Math.round(Math.sin(a) * R);
      v.fillBox(x - tube, -tube, z - tube, x + tube + 1, tube + 1, z + tube + 1, mat);
    }
    return mesh(v).opaque;
  }

  function buildGuard() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    var R = function (a, b, c, d, e, f, t, m) { v.frame(a, b, c, d, e, f, t, m); };
    R(-22, -16, -70, 22, 18, 62, 2, H);
    R(-16, -12, -92, 16, 12, -70, 2, H);
    R(-12, -8, -104, 12, 9, -92, 2, T);
    v.carve(-3, -2, -106, 3, 6, -86);
    F(-4, 10, -100, -1, 14, -92, H);
    F(1, 10, -100, 4, 14, -92, H);
    F(-48, -4, -8, -18, 9, 40, H);
    F(18, -4, -8, 48, 9, 40, H);
    F(-42, 9, 0, -20, 14, 32, H);
    F(20, 9, 0, 42, 14, 32, H);
    F(-46, 7, 2, -20, 9, 30, D);
    F(20, 7, 2, 46, 9, 30, D);
    R(-16, 16, -20, 16, 34, 48, 2, H);
    F(-10, 32, -8, 10, 40, 30, T);
    F(-32, -4, -28, -20, 12, 16, D);
    F(20, -4, -28, 32, 12, 16, D);
    R(-18, -18, 62, 18, 16, 92, 2, H);
    nozzle(v, -10, 0, 90, 18, 6, 6);
    nozzle(v, 10, 0, 90, 18, 6, 6);
    for (var z = -60; z < 50; z += 16) F(-20, -2, z, 20, 0, z + 1, S);
    F(-6, 16, -40, 6, 20, -10, G);
    var guns = [
      { x: -27, y: 8, z: -24 }, { x: -27, y: 3, z: -18 }, { x: -27, y: 12, z: -12 },
      { x: 27, y: 8, z: -24 }, { x: 27, y: 3, z: -18 }, { x: 27, y: 12, z: -12 }
    ];
    guns.forEach(function (g) {
      F(g.x - 1, g.y - 1, g.z - 11, g.x + 1, g.y + 1, g.z, D);
      F(g.x - 1, g.y - 1, g.z - 13, g.x + 1, g.y + 1, g.z - 11, T);
    });
    return { mesh: mesh(v), guns: guns, engines: [{ x: -10, y: 0, z: 92, rx: 5 }, { x: 10, y: 0, z: 92, rx: 5 }], bounds: { x: 0, y: 4, z: -6, hx: 52, hy: 30, hz: 100 } };
  }

  function buildVanguard() {
    var v = new FW.Volume();
    var F = function (a, b, c, d, e, f, m) { v.fillBox(a, b, c, d, e, f, m); };
    var R = function (a, b, c, d, e, f, t, m) { v.frame(a, b, c, d, e, f, t, m); };
    R(-12, -9, -70, 12, 11, 78, 2, H);
    R(-9, -7, -96, 9, 8, -70, 2, H);
    R(-7, -5, -112, 7, 6, -96, 2, T);
    v.carve(-2, -1, -114, 2, 4, -90);
    F(-5, 6, -110, -2, 9, -98, H);
    F(2, 6, -110, 5, 9, -98, H);
    F(-38, -6, -36, -10, 6, 70, H);
    F(10, -6, -36, 38, 6, 70, H);
    F(-34, 6, -20, -12, 9, 58, T);
    F(12, 6, -20, 34, 9, 58, T);
    F(-36, -8, -30, -12, -5, 64, D);
    F(12, -8, -30, 36, -5, 64, D);
    var tubes = [];
    for (var i = 0; i < 7; i++) {
      var z = -18 + i * 11;
      v.carve(-38, -3, z, -28, 3, z + 3);
      v.carve(28, -3, z, 38, 3, z + 3);
      F(-30, -1, z, -27, 1, z + 2, D);
      F(27, -1, z, 30, 1, z + 2, D);
      if (i % 2 === 0) {
        tubes.push({ x: -34, y: 0, z: z + 1 });
        tubes.push({ x: 34, y: 0, z: z + 1 });
      }
    }
    R(-14, -10, 78, 14, 10, 104, 2, H);
    nozzle(v, -7, 0, 102, 16, 4, 4);
    nozzle(v, 7, 0, 102, 16, 4, 4);
    for (var s = -80; s < 70; s += 18) F(-10, 10, s, 10, 12, s + 1, S);
    F(-4, 9, -60, 4, 12, -20, G);
    return {
      mesh: mesh(v),
      tubes: tubes,
      engines: [{ x: -7, y: 0, z: 104, rx: 3.5 }, { x: 7, y: 0, z: 104, rx: 3.5 }],
      bounds: { x: 0, y: 0, z: -4, hx: 42, hy: 16, hz: 112 }
    };
  }

  function buildCraft() {
    var v = new FW.Volume();
    v.frame(-4, -3, -8, 4, 3, 10, 1, H);
    v.frame(-3, -2, -16, -1, 2, -8, 1, H);
    v.frame(1, -2, -16, 3, 2, -8, 1, H);
    v.carve(-1, -1, -16, 1, 1, -12);
    v.fillBox(-2, 2, -4, 2, 4, 2, G);
    v.fillBox(-3, -1, 8, 3, 2, 12, T);
    nozzle(v, 0, 0, 13, 6, 2, 2);
    v.fillBox(-1, 3, -6, 1, 4, 6, S);
    return {
      mesh: mesh(v),
      engines: [{ x: 0, y: 0, z: 14, rx: 1.6 }],
      bounds: { x: 0, y: 0, z: -1, hx: 6, hy: 5, hz: 16 }
    };
  }

  function buildTurret() {
    var base = new FW.Volume();
    base.frame(-7, 0, -7, 7, 6, 7, 2, H);
    base.fillBox(-5, 5, -5, 5, 8, 5, D);
    base.fillBox(-2, 6, -2, 2, 9, 2, T);
    var barrel = new FW.Volume();
    barrel.frame(-3, -3, -18, 3, 3, 0, 1, H);
    barrel.frame(-4, -4, -20, 4, 4, -16, 1, T);
    ellipseCarve(barrel, 0, 0, -21, -8, 1, 1);
    barrel.fillBox(-1, -1, -10, 1, 1, -8, C);
    return { base: mesh(base).opaque, barrel: mesh(barrel).opaque };
  }

  function buildMissile() {
    var v = new FW.Volume();
    v.frame(-2, -2, -2, 2, 2, 8, 1, H);
    v.frame(-1, -1, -8, 1, 1, -2, 1, T);
    v.fillBox(-1, -1, 6, 1, 1, 8, E);
    v.fillBox(-3, -1, 0, -2, 1, 5, D);
    v.fillBox(2, -1, 0, 3, 1, 5, D);
    return mesh(v).opaque;
  }

  function buildIngot() {
    var v = new FW.Volume();
    v.fillBox(-3, -2, -4, 3, 2, 4, N);
    v.frame(-4, -3, -5, 4, 3, 5, 1, T);
    return mesh(v).opaque;
  }

  function buildClamp() {
    var v = new FW.Volume();
    v.frame(-2, -6, -5, 3, 6, 5, 1, D);
    v.fillBox(-1, -2, -2, 2, 2, 2, T);
    return mesh(v).opaque;
  }

  function blob(seed, n) {
    var v = new FW.Volume();
    var x = 0, y = 0, z = 0;
    for (var i = 0; i < n; i++) {
      v.set(x, y, z, RK);
      if ((i % 4) === 0) v.set(x, y + 1, z, RK);
      var h = hash(i + seed * 19, seed);
      if (h < 0.34) x += hash(seed, i) > 0.5 ? 1 : -1;
      else if (h < 0.67) y += hash(i, seed + 2) > 0.5 ? 1 : -1;
      else z += hash(seed + 4, i) > 0.5 ? 1 : -1;
    }
    return mesh(v).opaque;
  }

  function makeRock(r, seed, crack) {
    var v = new FW.Volume();
    for (var z = -r; z <= r; z++) {
      for (var y = -r; y <= r; y++) {
        for (var x = -r; x <= r; x++) {
          var d = Math.sqrt(x * x + y * y + z * z) / r;
          var n = hash(x * 0.37 + seed, y * 0.41 + z * 0.29);
          var n2 = hash(x * 0.13 + seed * 3, z * 0.17 + y * 0.11);
          var terr = 0.08 * Math.abs(((y + r) % 5) - 2);
          if (d < 0.62 + n * 0.28 + n2 * 0.16 - terr) {
            var mat = RK;
            if (crack && Math.abs(x * 0.7 + Math.sin((y + seed) * 0.35) * 3) < 1.4 && d > 0.42) mat = HOT;
            v.set(x, y, z, mat);
          }
        }
      }
    }
    v.carve(-2, -Math.floor(r * 0.8), -1, 2, Math.floor(r * 0.3), 2);
    v.carve(Math.floor(r * 0.45), -3, -Math.floor(r * 0.6), r + 2, 4, Math.floor(r * 0.2));
    return v;
  }

  function splitPieces(vol, seed) {
    var groups = new Map();
    vol.forEach(function (x, y, z, m) {
      var jx = x + Math.round((hash(y + seed, z) - 0.5) * 6);
      var jy = y + Math.round((hash(x, z + seed) - 0.5) * 5);
      var id = (jx > 1 ? 1 : 0) + (jy > 0 ? 2 : 0) + (z > -1 ? 4 : 0);
      var g = groups.get(id);
      if (!g) { g = new FW.Volume(); groups.set(id, g); }
      var mat = m;
      if (m === RK && (Math.abs(jx - 1) <= 1 || Math.abs(jy) <= 1)) mat = HOT;
      g.set(x, y, z, mat);
    });
    var pieces = [];
    groups.forEach(function (gv) {
      var cx = 0, cy = 0, cz = 0, n = 0;
      gv.forEach(function (x, y, z) { cx += x; cy += y; cz += z; n++; });
      if (n < 8) return;
      pieces.push({
        mesh: mesh(gv).opaque,
        c: [cx / n, cy / n, cz / n],
        n: n
      });
    });
    return pieces;
  }

  FW.buildWorld = function () {
    var t0 = Date.now();
    var out = {
      engines: {},
      bounds: {},
      turrets: [],
      rocks: [],
      blobs: [],
      parked: []
    };
    console.log("[fleet] sculpting flagship");
    buildFlagship(out);
    console.log("[fleet] interiors");
    out.bridge = buildBridge();
    out.core = buildCore();
    out.hangar = buildHangar();
    out.gallery = buildGallery();
    out.rings = [
      { mesh: torus(30, 2, T), y: -10, speed: 0.18 },
      { mesh: torus(46, 2, H), y: 18, speed: -0.12 },
      { mesh: torus(62, 3, D), y: 44, speed: 0.08 },
      { mesh: torus(24, 2, N), y: 70, speed: 0.22 }
    ];
    out.ingot = buildIngot();
    out.clamp = buildClamp();
    console.log("[fleet] escorts");
    out.guard = buildGuard();
    out.vanguard = buildVanguard();
    out.craft = buildCraft();
    out.turret = buildTurret();
    out.missile = buildMissile();
    for (var i = 0; i < 8; i++) {
      var z = 246 + i * 36;
      out.parked.push({ x: -156, y: -16, z: z + 14, yaw: Math.PI });
      if (i % 2 === 0) out.parked.push({ x: 156, y: -16, z: z + 16, yaw: 0 });
    }
    out.blobs = [blob(1, 10), blob(2, 14), blob(3, 8), blob(4, 18), blob(5, 6)];
    console.log("[fleet] asteroids");
    var specs = [
      { id: "A", r: 28, seed: 11, x: 90, y: 16, z: -900, br: 60.6, kind: "beam", crack: true },
      { id: "B", r: 22, seed: 23, x: 260, y: -8, z: -1040, br: 66.1, kind: "missile", crack: true },
      { id: "C", r: 15, seed: 31, x: 160, y: 46, z: -820, br: 62.1, kind: "pulse", crack: false },
      { id: "D", r: 13, seed: 37, x: 40, y: -36, z: -760, br: 63.2, kind: "pulse", crack: false },
      { id: "E", r: 9, seed: 41, x: -240, y: 18, z: -640, br: 63.6, kind: "pdc", crack: false },
      { id: "F", r: 8, seed: 43, x: -280, y: -10, z: -560, br: 64.4, kind: "pdc", crack: false },
      { id: "G", r: 7, seed: 47, x: -190, y: 36, z: -500, br: 65.1, kind: "pdc", crack: false },
      { id: "H", r: 11, seed: 53, x: 210, y: 20, z: -700, br: 62.8, kind: "pulse", crack: false },
      { id: "I", r: 6, seed: 59, x: -150, y: -24, z: -430, br: 65.6, kind: "pdc", crack: false },
      { id: "J", r: 18, seed: 61, x: -60, y: 70, z: -1120, br: 99, kind: "scenery", crack: false },
      { id: "K", r: 12, seed: 67, x: 340, y: -40, z: -1180, br: 99, kind: "scenery", crack: false },
      { id: "L", r: 8, seed: 71, x: 120, y: 90, z: -980, br: 99, kind: "scenery", crack: false }
    ];
    specs.forEach(function (sp) {
      var vol = makeRock(sp.r, sp.seed, sp.crack);
      var intact = mesh(vol);
      var pieces = sp.kind === "scenery" ? [] : splitPieces(vol, sp.seed);
      out.rocks.push({
        id: sp.id, x: sp.x, y: sp.y, z: sp.z, br: sp.br, kind: sp.kind, r: sp.r,
        intact: intact.opaque, pieces: pieces
      });
    });
    out.floaters = [];
    for (var f = 0; f < 18; f++) {
      out.floaters.push({
        mesh: f % 5,
        seed: f * 17 + 3,
        scale: 1
      });
    }
    console.log("[fleet] build ms", Date.now() - t0,
      "flag verts", out.flagship.opaque.count,
      "bridge", out.bridge.opaque.count,
      "core", out.core.opaque.count,
      "hangar", out.hangar.opaque.count,
      "gallery", out.gallery.opaque.count);
    return out;
  };
})();
