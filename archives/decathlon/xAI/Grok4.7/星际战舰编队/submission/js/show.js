/* Deterministic 78s fleet film. Time is the only input. */
(function () {
  var DURATION = 78;
  var FW = window.FW;
  var M = FW.mat;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hash(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function cat(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function hypot3(x, y, z) { return Math.hypot(x, y, z); }

  var CAM = [
    { t: 0, p: [-6, 14, -840], l: [4, 6, -380], f: 46, r: 0 },
    { t: 3.2, p: [-170, 34, -700], l: [-20, 6, -400], f: 42, r: 0.01 },
    { t: 5.4, p: [-280, 8, -380], l: [-50, 2, -60], f: 46, r: -0.01 },
    { t: 7.2, p: [-270, -96, -20], l: [-30, -24, 180], f: 50, r: -0.03 },
    { t: 10.6, p: [-300, 28, 300], l: [-70, 6, 500], f: 46, r: 0 },
    { t: 13.4, p: [-340, 36, 640], l: [0, 8, 500], f: 44, r: 0.02 },
    { t: 16.2, p: [-540, 190, 20], l: [10, 16, -240], f: 56, r: 0.04 },
    { t: 17.8, p: [-390, 8, 270], l: [-180, -2, 320], f: 48, r: 0 },
    { t: 19.5, p: [-200, -4, 292], l: [-132, -4, 400], f: 50, r: 0 },
    { t: 22.2, p: [-132, -8, 330], l: [-132, -2, 470], f: 48, r: 0 },
    { t: 25.4, p: [-132, -6, 420], l: [-128, 0, 545], f: 46, r: 0 },
    { t: 28.2, p: [-130, -4, 478], l: [-122, 2, 548], f: 42, r: 0 },
    { t: 28.25, cut: 1, p: [12, 70, -286], l: [0, 66, -380], f: 50, r: 0 },
    { t: 32.0, p: [4, 68, -314], l: [0, 66, -420], f: 48, r: 0.02 },
    { t: 35.4, p: [-2, 69, -346], l: [0, 66, -450], f: 46, r: 0 },
    { t: 38.0, p: [0, 70, -368], l: [0, 68, -470], f: 44, r: 0 },
    { t: 38.08, cut: 1, p: [26, -58, 78], l: [0, -10, 120], f: 54, r: 0 },
    { t: 41.6, p: [20, -4, 84], l: [0, 24, 124], f: 52, r: 0.03 },
    { t: 44.6, p: [16, 52, 90], l: [0, 78, 128], f: 50, r: -0.02 },
    { t: 47.4, p: [10, 102, 108], l: [0, 48, 140], f: 54, r: 0 },
    { t: 47.5, cut: 1, p: [0, -66, -48], l: [0, -64, -180], f: 50, r: 0 },
    { t: 51.0, p: [1, -64, -175], l: [0, -62, -310], f: 48, r: 0 },
    { t: 54.0, p: [0, -62, -250], l: [0, -60, -360], f: 46, r: 0 },
    { t: 56.05, p: [0, -60, -310], l: [0, -58, -390], f: 40, r: 0 },
    { t: 56.12, cut: 1, p: [-250, 64, -400], l: [20, 8, -980], f: 40, r: -0.02 },
    { t: 59.0, p: [-200, 46, -560], l: [60, 10, -1000], f: 36, r: -0.02 },
    { t: 61.3, p: [-220, 38, -760], l: [90, 8, -1040], f: 38, r: 0.02 },
    { t: 62.35, cut: 1, p: [110, 145, -280], l: [10, 70, -760], f: 46, r: 0.05 },
    { t: 64.55, cut: 1, p: [-430, 36, -120], l: [-250, 12, -560], f: 46, r: -0.05 },
    { t: 66.45, cut: 1, p: [40, 48, -900], l: [240, -8, -980], f: 42, r: 0.03 },
    { t: 68.9, p: [260, 100, -460], l: [20, 12, -860], f: 50, r: 0.02 },
    { t: 72.4, p: [-620, 230, 60], l: [0, 16, -220], f: 58, r: 0.04 },
    { t: 75.2, p: [-220, 70, -900], l: [0, 10, -520], f: 40, r: 0.01 },
    { t: 78, p: [-6, 14, -840], l: [4, 6, -380], f: 46, r: 0 }
  ];

  function cameraAt(t) {
    t = ((t % DURATION) + DURATION) % DURATION;
    var i = 0;
    for (var k = 0; k < CAM.length - 1; k++) {
      if (t >= CAM[k].t && t < CAM[k + 1].t) { i = k; break; }
    }
    var a = CAM[i], b = CAM[i + 1];
    if (b.cut) return { px: a.p[0], py: a.p[1], pz: a.p[2], lx: a.l[0], ly: a.l[1], lz: a.l[2], fov: a.f, roll: a.r };
    var u = (t - a.t) / Math.max(1e-4, b.t - a.t);
    var prev = a.cut ? a : (i === 0 ? CAM[CAM.length - 2] : CAM[i - 1]);
    var next;
    if (i + 2 >= CAM.length - 1) next = CAM[1];
    else next = CAM[i + 2].cut ? b : CAM[i + 2];
    function comp(getter) {
      return cat(getter(prev), getter(a), getter(b), getter(next), u);
    }
    return {
      px: comp(function (k) { return k.p[0]; }),
      py: comp(function (k) { return k.p[1]; }),
      pz: comp(function (k) { return k.p[2]; }),
      lx: comp(function (k) { return k.l[0]; }),
      ly: comp(function (k) { return k.l[1]; }),
      lz: comp(function (k) { return k.l[2]; }),
      fov: comp(function (k) { return k.f; }),
      roll: comp(function (k) { return k.r; })
    };
  }

  var GUARDS = [
    { x: -310, y: 24, z: -340, yaw: 0.05 },
    { x: 320, y: -16, z: -400, yaw: -0.06 },
    { x: -290, y: 96, z: -70, yaw: 0.03 },
    { x: 300, y: -78, z: -20, yaw: -0.04 },
    { x: -330, y: -64, z: 170, yaw: 0.07 },
    { x: 310, y: 86, z: 210, yaw: -0.05 },
    { x: -270, y: 140, z: 390, yaw: 0.04 },
    { x: 280, y: -120, z: 430, yaw: -0.03 },
    { x: -190, y: 48, z: 720, yaw: 0.09 },
    { x: 200, y: -36, z: 780, yaw: -0.07 },
    { x: -80, y: 120, z: 880, yaw: 0.02 },
    { x: 90, y: -100, z: 940, yaw: -0.02 },
    { x: 30, y: 230, z: 80, yaw: 0.08 },
    { x: -40, y: -210, z: 120, yaw: -0.06 },
    { x: 250, y: 160, z: -180, yaw: -0.12 },
    { x: -230, y: -130, z: -220, yaw: 0.1 }
  ];
  var VANS = [
    { x: -170, y: 36, z: -1000, yaw: 0.06 },
    { x: 190, y: -24, z: -1060, yaw: -0.05 },
    { x: -400, y: 80, z: -920, yaw: 0.14 },
    { x: 420, y: 54, z: -960, yaw: -0.12 },
    { x: -70, y: 160, z: -1200, yaw: 0.02 },
    { x: 90, y: -150, z: -1140, yaw: -0.03 },
    { x: 10, y: 28, z: -1380, yaw: 0 },
    { x: -300, y: -90, z: -1300, yaw: 0.1 },
    { x: 320, y: 100, z: -1260, yaw: -0.1 },
    { x: -660, y: 30, z: -340, yaw: 0.2 },
    { x: 700, y: -24, z: -160, yaw: -0.18 },
    { x: -740, y: -100, z: 200, yaw: 0.16 },
    { x: 760, y: 110, z: 320, yaw: -0.16 },
    { x: -620, y: 150, z: 660, yaw: 0.12 },
    { x: 660, y: -130, z: 740, yaw: -0.12 },
    { x: -880, y: 16, z: -660, yaw: 0.24 },
    { x: 900, y: 46, z: -720, yaw: -0.22 },
    { x: -520, y: -170, z: -540, yaw: 0.14 },
    { x: 540, y: 200, z: 60, yaw: -0.15 },
    { x: 30, y: -210, z: -880, yaw: 0.05 }
  ];

  function spread(t) {
    if (t < 50 || t > 74) return 0;
    if (t < 58) return smooth((t - 50) / 8);
    if (t < 66) return 1;
    return 1 - smooth((t - 66) / 8);
  }
  function enginePower(t) {
    var pulse = 0.035 * Math.sin(t * Math.PI * 2 * 3 / DURATION);
    if (t < 10) return lerp(1.08, 0.5, smooth(t / 10)) + pulse;
    if (t < 68.5) return 0.5 + pulse;
    if (t < 76) return lerp(0.5, 1.22, smooth((t - 68.5) / 7.5)) + pulse;
    return lerp(1.22, 1.08, smooth((t - 76) / 2)) + pulse;
  }
  function chargeOf(t) {
    if (t < 57.15 || t > 62.5) return 0;
    if (t < 58.35) return smooth((t - 57.15) / 1.2);
    if (t < 61.45) return 1;
    return 1 - smooth((t - 61.45) / 1.05);
  }
  function travel(t) {
    function integ(va, vb, dur, u) {
      var sInt = u * u * u - 0.5 * u * u * u * u;
      return dur * (va * u + (vb - va) * sInt);
    }
    if (t <= 10) return integ(230, 62, 10, t / 10);
    var a = integ(230, 62, 10, 1);
    if (t <= 68) return a + 62 * (t - 10);
    var b = a + 62 * 58;
    if (t <= 76) return b + integ(62, 230, 8, (t - 68) / 8);
    var c = b + integ(62, 230, 8, 1);
    return c + 230 * (t - 76);
  }
  var TRAVEL_END = travel(DURATION);
  var DUST_L = TRAVEL_END / Math.max(1, Math.round(TRAVEL_END / 140));

  function shieldOf(t, order) {
    var start = 69.15 + order * 0.16;
    var up = 0;
    if (t >= start) up = smooth(Math.min(1, (t - start) / 0.7));
    var alpha;
    if (t < 9) alpha = 0.26 * (1 - smooth(t / 9));
    else if (t < start) alpha = 0;
    else if (t < 76) alpha = up;
    else alpha = lerp(1, 0.26, smooth((t - 76) / 2));
    return { alpha: alpha, deploy: t < 9 ? 1 : up };
  }

  function poseEscort(def, t, phase) {
    var sp = spread(t);
    var w1 = Math.PI * 2 * 2 / DURATION;
    var w2 = Math.PI * 2 * 3 / DURATION;
    var w3 = Math.PI * 2 / DURATION;
    return {
      x: def.x * (1 + 0.26 * sp) + Math.sin(w1 * t + phase) * 7,
      y: def.y * (1 + 0.16 * sp) + Math.sin(w2 * t + phase * 1.3) * 5,
      z: def.z + Math.cos(w3 * t + phase) * 9 + sp * (def.z < -200 ? -30 : 16),
      yaw: def.yaw + Math.sin(w1 * t + phase) * 0.035,
      pitch: Math.sin(w2 * t + phase) * 0.015
    };
  }

  function craftPose(i, t) {
    var a = t * Math.PI * 2 / DURATION + i * 1.7;
    if (i === 0) {
      var dx = Math.cos(a) * 28;
      var dz = -Math.sin(a) * 46;
      return {
        x: -248 + Math.sin(a) * 28,
        y: 22 + Math.sin(a * 2) * 6,
        z: -700 + Math.cos(a) * 46,
        yaw: Math.atan2(dx, -dz)
      };
    }
    if (i === 1) {
      return {
        x: -250 + Math.sin(a) * 36,
        y: 28 + Math.sin(a * 2) * 12,
        z: 80 + Math.cos(a) * 420,
        yaw: Math.atan2(Math.cos(a) * 36, Math.sin(a) * 420)
      };
    }
    if (i === 2) {
      /* hangar departure visible mid-film */
      var keys = [0, 16, 18.6, 22, 26, 32, 48, 66, 78];
      var xs = [-240, -220, -138, -134, -130, -180, -236, -260, -240];
      var ys = [20, 10, -4, -6, -4, 8, 24, 22, 20];
      var zs = [40, 120, 276, 400, 500, 340, -20, -40, 40];
      var tt = ((t % DURATION) + DURATION) % DURATION;
      var k = 0;
      for (var n = 0; n < keys.length - 1; n++) if (tt >= keys[n] && tt < keys[n + 1]) k = n;
      var u2 = (tt - keys[k]) / (keys[k + 1] - keys[k]);
      u2 = smooth(u2);
      var x = lerp(xs[k], xs[k + 1], u2);
      var y = lerp(ys[k], ys[k + 1], u2);
      var z = lerp(zs[k], zs[k + 1], u2);
      var dx = xs[Math.min(k + 1, xs.length - 1)] - xs[k];
      var dz = zs[Math.min(k + 1, zs.length - 1)] - zs[k];
      return { x: x, y: y, z: z, yaw: Math.atan2(dx, -dz) };
    }
    var rad = 70 + (i % 3) * 16;
    return {
      x: Math.sin(a) * rad + (i % 2 ? 80 : -90),
      y: 30 + Math.cos(a * 2) * 16 + i * 3,
      z: -200 + Math.sin(a * 2 + i) * 220,
      yaw: a + Math.PI
    };
  }

  function rockAt(rock, t) {
    return [rock.x, rock.y, rock.z + (t - 60) * 34];
  }

  function aimOf(from, to) {
    var dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    var yaw = Math.atan2(dx, -dz);
    var pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { yaw: yaw, pitch: pitch };
  }

  function xform(m, x, y, z) {
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
  }

  var tmp = new Float32Array(16);
  var tmpB = new Float32Array(16);
  var tmpC = new Float32Array(16);
  var tmpD = new Float32Array(16);

  function boot() {
    var canvas = document.getElementById("c");
    var err = document.getElementById("err");
    var world, R, gpu;
    try {
      world = FW.buildWorld();
      R = FW.createRenderer(canvas);
      gpu = {
        flag: pack(R, world.flagship),
        bridge: pack(R, world.bridge),
        core: pack(R, world.core),
        hangar: pack(R, world.hangar),
        gallery: pack(R, world.gallery),
        guard: pack(R, world.guard.mesh),
        van: pack(R, world.vanguard.mesh),
        craft: pack(R, world.craft.mesh),
        turretBase: pack(R, world.turret.base),
        turretBarrel: pack(R, world.turret.barrel),
        missile: pack(R, world.missile),
        ingot: pack(R, world.ingot),
        clamp: pack(R, world.clamp),
        rings: world.rings.map(function (r) { return pack(R, r.mesh); }),
        rocks: world.rocks.map(function (rk) {
          return {
            intact: pack(R, rk.intact),
            pieces: rk.pieces.map(function (p) { return pack(R, p.mesh); })
          };
        }),
        blobs: world.blobs.map(function (b) { return pack(R, b); })
      };
    } catch (e) {
      if (err) { err.style.display = "block"; err.textContent = String(e && e.stack || e); }
      console.error(e);
      return;
    }

    var orders = escortOrder();
    var exportMode = false;
    var exportFps = 60;
    var exportTime = 0;
    var playT0 = performance.now();

    function renderAt(t) {
      var cam = window.__pose || cameraAt(t);
      var eng = enginePower(t);
      var charge = chargeOf(t);
      var lights = collectLights(t, cam, world, eng, charge);
      R.begin(cam, t, lights, eng, charge);
      drawOpaque(t, world, gpu, R, eng);
      R.beginGlass();
      drawGlass(t, world, gpu, R);
      R.endGlass();
      drawShields(t, world, gpu, R, orders);
      drawAdditive(t, world, gpu, R, cam, eng, charge);
      R.flushAdd();
    }

    window.__seek = function (t) { renderAt(t); return t; };
    window.__cam = cameraAt;

    window.videoExport = {
      runs: ["tour"],
      begin: function (runId, opts) {
        exportMode = true;
        exportFps = (opts && opts.fps) || 60;
        exportTime = 0;
        renderAt(0);
        var frames = Math.round(DURATION * exportFps);
        return Promise.resolve({ frames: frames });
      },
      frame: function (i) {
        exportTime = i / exportFps;
        renderAt(exportTime);
        R.gl.finish();
        return Promise.resolve();
      },
      end: function () {
        exportMode = false;
        playT0 = performance.now() - exportTime * 1000;
        return Promise.resolve();
      }
    };

    function frameLoop(now) {
      if (!exportMode) {
        var t = ((now - playT0) / 1000) % DURATION;
        renderAt(t);
      }
      requestAnimationFrame(frameLoop);
    }
    renderAt(0);
    requestAnimationFrame(frameLoop);
  }

  function pack(R, mesh) {
    if (!mesh) return { opaque: null, glass: null };
    if (mesh.positions) return { opaque: FW.uploadMesh(R.gl, mesh), glass: null };
    return {
      opaque: mesh.opaque && mesh.opaque.count ? FW.uploadMesh(R.gl, mesh.opaque) : null,
      glass: mesh.glass && mesh.glass.count ? FW.uploadMesh(R.gl, mesh.glass) : null
    };
  }

  function escortOrder() {
    var list = [{ z: 0, kind: "flag" }];
    GUARDS.forEach(function (g, i) { list.push({ z: g.z, kind: "g", i: i }); });
    VANS.forEach(function (g, i) { list.push({ z: g.z, kind: "v", i: i }); });
    list.sort(function (a, b) { return a.z - b.z; });
    var map = { flag: 0 };
    var n = 1;
    /* flagship first, then front to back */
    list.sort(function (a, b) {
      if (a.kind === "flag") return -1;
      if (b.kind === "flag") return 1;
      return a.z - b.z;
    });
    list.forEach(function (e) {
      if (e.kind === "flag") map.flag = 0;
      else map[e.kind + e.i] = n++;
    });
    return map;
  }

  function drawOpaque(t, world, gpu, R) {
    window.__rocks = world.rocks;
    var I = tmp; M.ident(I);
    R.drawVoxel(gpu.flag.opaque, I, 0, 1);
    R.drawVoxel(gpu.bridge.opaque, I, 0, 1);
    R.drawVoxel(gpu.core.opaque, I, 0, 1);
    R.drawVoxel(gpu.hangar.opaque, I, 0, 1);
    R.drawVoxel(gpu.gallery.opaque, I, 0, 1);
    world.rings.forEach(function (ring, idx) {
      var ang = t * ring.speed * Math.PI * 2;
      M.trs(tmp, 0, 16 + ring.y, 100, ang, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.rings[idx].opaque, tmp, 0, 1);
    });
    /* moving ingots */
    for (var i = 0; i < 9; i++) {
      var phase = (t * 0.37 + i * 0.17) % 1;
      var z = -360 + i * 38 + phase * 22;
      var x = (i % 2 ? 1 : -1) * 11;
      M.trs(tmp, x, -68, z, 0, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.ingot.opaque, tmp, 0, 1);
    }
    for (var c = 0; c < 4; c++) {
      var open = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2 / DURATION + c);
      var zz = -330 + c * 70;
      M.trs(tmp, -18 - open * 6, -74, zz, 0, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.clamp.opaque, tmp, 0, 1);
      M.trs(tmp, 18 + open * 6, -74, zz, 0, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.clamp.opaque, tmp, 0, 1);
    }
    GUARDS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 1.1);
      M.trs(tmp, p.x, p.y, p.z, p.yaw, p.pitch, 0, 1, 1, 1);
      R.drawVoxel(gpu.guard.opaque, tmp, 0, 0.97);
      drawGuns(R, gpu, world.guard.guns, tmp, t, i, p);
    });
    VANS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 0.8 + 2);
      M.trs(tmp, p.x, p.y, p.z, p.yaw, p.pitch, 0, 1, 1, 1);
      R.drawVoxel(gpu.van.opaque, tmp, 0, 1.04);
    });
    for (var ci = 0; ci < 7; ci++) {
      var cp = craftPose(ci, t);
      M.trs(tmp, cp.x, cp.y, cp.z, cp.yaw, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.craft.opaque, tmp, 0, 1);
    }
    world.parked.forEach(function (pk) {
      M.trs(tmp, pk.x, pk.y, pk.z, pk.yaw, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.craft.opaque, tmp, 0, 0.95);
    });
    drawTurrets(t, world, gpu, R);
    drawRocks(t, world, gpu, R);
    drawMissiles(t, world, gpu, R);
    drawFloaters(t, world, gpu, R);
  }

  function drawGlass(t, world, gpu, R) {
    var I = tmp; M.ident(I);
    if (gpu.flag.glass) R.drawVoxel(gpu.flag.glass, I, 0, 1);
    for (var ci = 0; ci < 7; ci++) {
      var cp = craftPose(ci, t);
      M.trs(tmp, cp.x, cp.y, cp.z, cp.yaw, 0, 0, 1, 1, 1);
      if (gpu.craft.glass) R.drawVoxel(gpu.craft.glass, tmp, 0, 1);
    }
    world.parked.forEach(function (pk) {
      M.trs(tmp, pk.x, pk.y, pk.z, pk.yaw, 0, 0, 1, 1, 1);
      if (gpu.craft.glass) R.drawVoxel(gpu.craft.glass, tmp, 0, 1);
    });
    GUARDS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 1.1);
      M.trs(tmp, p.x, p.y, p.z, p.yaw, p.pitch, 0, 1, 1, 1);
      if (gpu.guard.glass) R.drawVoxel(gpu.guard.glass, tmp, 0, 1);
    });
    VANS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 0.8 + 2);
      M.trs(tmp, p.x, p.y, p.z, p.yaw, p.pitch, 0, 1, 1, 1);
      if (gpu.van.glass) R.drawVoxel(gpu.van.glass, tmp, 0, 1);
    });
  }

  function drawGuns(R, gpu, guns, shipM, t, index, pose) {
    var target = pdcTarget(t);
    for (var i = 0; i < guns.length; i++) {
      var g = guns[i];
      var wp = xform(shipM, g.x, g.y, g.z);
      var aim = { yaw: pose.yaw, pitch: 0 };
      if (t > 62.4 && t < 66.4 && target) aim = aimOf(wp, target);
      M.trs(tmpB, wp[0], wp[1], wp[2], aim.yaw, aim.pitch, 0, 1, 1, 1);
      R.drawVoxel(gpu.turretBarrel.opaque, tmpB, 0, 1);
    }
  }

  function pdcTarget(t) {
    if (t < 62.5 || t > 66.6) return null;
    var rocks = window.__rocks;
    if (!rocks) return null;
    var best = null;
    for (var i = 0; i < rocks.length; i++) {
      if (rocks[i].kind !== "pdc") continue;
      var p = rockAt(rocks[i], Math.min(t, rocks[i].br));
      if (!best || p[0] < best[0]) best = p;
    }
    return best;
  }

  function drawTurrets(t, world, gpu, R) {
    var aimT = null;
    if (t > 60.6 && t < 65) {
      var rk = world.rocks[0];
      aimT = rockAt(rk, Math.min(t, rk.br));
    }
    world.turrets.forEach(function (tu, i) {
      var idle = Math.sin(t * Math.PI * 2 * 2 / DURATION + i) * 0.25;
      var yaw = idle, pitch = -0.15;
      if (aimT) {
        var a = aimOf([tu.x, tu.y + 6, tu.z], aimT);
        yaw = a.yaw; pitch = a.pitch;
      }
      M.trs(tmp, tu.x, tu.y, tu.z, yaw * 0.15, 0, 0, 1, 1, 1);
      R.drawVoxel(gpu.turretBase.opaque, tmp, 0, 1);
      M.trs(tmp, tu.x, tu.y + 6, tu.z, yaw, pitch, 0, 1, 1, 1);
      R.drawVoxel(gpu.turretBarrel.opaque, tmp, 0, 1);
    });
  }

  function drawRocks(t, world, gpu, R) {
    window.__rocks = world.rocks;
    world.rocks.forEach(function (rk, ri) {
      var p = rockAt(rk, t < rk.br ? t : rk.br);
      if (t < rk.br || !rk.pieces.length) {
        var hot = 0;
        if (rk.kind === "beam" && t > 58.3 && t < rk.br) hot = smooth((t - 58.3) / 1.6);
        if (rk.kind === "missile" && t > 65.2 && t < rk.br) hot = smooth((t - 65.2) / 0.8);
        if (rk.kind === "pulse" && t > rk.br - 0.6 && t < rk.br) hot = smooth((t - (rk.br - 0.6)) / 0.6);
        M.trs(tmp, p[0], p[1], p[2], 0, 0, 0, 1, 1, 1);
        R.drawVoxel(gpu.rocks[ri].intact.opaque, tmp, hot, 1);
      } else {
        var dt = t - rk.br;
        rk.pieces.forEach(function (pc, pi) {
          var dirx = pc.c[0] || 0.2, diry = pc.c[1] || 0.1, dirz = (pc.c[2] || 0) + 8;
          var mag = Math.hypot(dirx, diry, dirz) || 1;
          var sp = 16 + (pi % 5) * 7;
          var vx = dirx / mag * sp + (ri % 2 ? 10 : -6);
          var vy = diry / mag * sp * 0.6;
          var vz = 34 + dirz / mag * sp;
          if (rk.kind === "pdc") { vx *= 1.4; vz += 20; }
          if (rk.kind === "beam") { vx += 14; vz += 10; }
          var spin = dt * (0.35 + pi * 0.12) * (pi % 2 ? 1 : -1);
          M.trans(tmpB, -(pc.c[0]), -(pc.c[1]), -(pc.c[2]));
          M.rotY(tmpC, spin);
          M.mul(tmpD, tmpC, tmpB);
          M.rotX(tmpB, spin * 0.6);
          M.mul(tmpC, tmpB, tmpD);
          M.trans(tmpB, p[0] + pc.c[0] + vx * dt, p[1] + pc.c[1] + vy * dt, p[2] + pc.c[2] + vz * dt);
          M.mul(tmp, tmpB, tmpC);
          var hot = Math.exp(-dt * 0.55);
          R.drawVoxel(gpu.rocks[ri].pieces[pi].opaque, tmp, hot, 1);
          if (dt < 1.6 && pi < 5) {
            var bm = gpu.blobs[(pi + ri) % gpu.blobs.length].opaque;
            M.trs(tmp, p[0] + pc.c[0] + vx * dt * 1.4, p[1] + vy * dt * 1.3, p[2] + vz * dt * 1.2, spin, 0, 0, 1, 1, 1);
            R.drawVoxel(bm, tmp, hot * 0.5, 1);
          }
        });
      }
    });
  }

  function missilePlan(t) {
    var list = [];
    var launch0 = 63.55;
    for (var i = 0; i < 8; i++) {
      var lt = launch0 + i * 0.32;
      var van = VANS[i % 6];
      var pose = poseEscort(van, lt, (i % 6) * 0.8 + 2);
      var tube = (i % 2 === 0) ? { x: -34, y: 0, z: -18 + (i % 4) * 11 } : { x: 34, y: 0, z: -18 + (i % 4) * 11 };
      M.trs(tmp, pose.x, pose.y, pose.z, pose.yaw, pose.pitch, 0, 1, 1, 1);
      var origin = xform(tmp, tube.x, tube.y, tube.z);
      var rock = window.__rocks ? window.__rocks[1] : null;
      var impactT = lt + 2.05;
      var target = rock ? rockAt(rock, Math.min(impactT, rock.br)) : [260, -8, -833];
      target = [target[0] + ((i % 3) - 1) * 8, target[1] + ((i % 5) - 2) * 3, target[2]];
      list.push({ lt: lt, ft: 2.05, o: origin, target: target, i: i });
    }
    return list;
  }

  function bez(a, b, c, u) {
    var v = 1 - u;
    return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], v * v * a[2] + 2 * v * u * b[2] + u * u * c[2]];
  }

  function missilePoint(ms, u) {
    var ctrl = [
      (ms.o[0] + ms.target[0]) * 0.5 + (ms.i % 2 ? 40 : -30),
      (ms.o[1] + ms.target[1]) * 0.5 + 50 + (ms.i % 3) * 8,
      (ms.o[2] + ms.target[2]) * 0.45
    ];
    return bez(ms.o, ctrl, ms.target, u);
  }

  function drawMissiles(t, world, gpu, R) {
    var list = missilePlan(t);
    list.forEach(function (ms) {
      if (t < ms.lt || t > ms.lt + ms.ft) return;
      var u = (t - ms.lt) / ms.ft;
      var pos = missilePoint(ms, u);
      var ahead = missilePoint(ms, Math.min(1, u + 0.02));
      var aim = aimOf(pos, ahead);
      M.trs(tmp, pos[0], pos[1], pos[2], aim.yaw, aim.pitch, 0, 1, 1, 1);
      R.drawVoxel(gpu.missile.opaque, tmp, 0, 1);
    });
    window.__missiles = list;
  }

  function drawFloaters(t, world, gpu, R) {
    var base = travel(t);
    for (var i = 0; i < world.floaters.length; i++) {
      var s = world.floaters[i].seed;
      var span = TRAVEL_END;
      var z = ((hash(s, 1) * span + base) % span) - span * 0.35;
      var x = (hash(s, 2) - 0.5) * 1800;
      var y = (hash(s, 3) - 0.5) * 600;
      var spin = t * Math.PI * 2 * 2 / DURATION + s;
      var camP = R.camPos;
      if (Math.hypot(x - camP[0], y - camP[1], z - camP[2]) < 48) continue;
      M.trs(tmp, x, y, z, spin, spin * 0.4, 0, 1, 1, 1);
      R.drawVoxel(gpu.blobs[i % gpu.blobs.length].opaque, tmp, 0, 1);
    }
  }

  function shieldMatrix(x, y, z, yaw, b, mul) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var wx = x + b.x * cy + b.z * sy;
    var wy = y + b.y;
    var wz = z + (-b.x * sy + b.z * cy);
    M.trs(tmp, wx, wy, wz, yaw, 0, 0, b.hx * mul, b.hy * mul, b.hz * mul);
    return tmp;
  }

  function drawShields(t, world, gpu, R, orders) {
    var sf = shieldOf(t, 0);
    if (sf.alpha > 0.02) {
      shieldMatrix(0, 0, 0, 0, world.bounds.flagship, 1.12);
      R.drawShield(tmp, sf.deploy, t, sf.alpha);
    }
    GUARDS.forEach(function (g, i) {
      var sh = shieldOf(t, orders["g" + i] || i + 1);
      if (sh.alpha < 0.02) return;
      var p = poseEscort(g, t, i * 1.1);
      shieldMatrix(p.x, p.y, p.z, p.yaw, world.guard.bounds, 1.2);
      R.drawShield(tmp, sh.deploy, t, sh.alpha);
    });
    VANS.forEach(function (g, i) {
      var sh = shieldOf(t, orders["v" + i] || i + 10);
      if (sh.alpha < 0.02) return;
      var p = poseEscort(g, t, i * 0.8 + 2);
      shieldMatrix(p.x, p.y, p.z, p.yaw, world.vanguard.bounds, 1.22);
      R.drawShield(tmp, sh.deploy, t, sh.alpha);
    });
  }

  function collectLights(t, cam, world, eng, charge) {
    var arr = [];
    function add(x, y, z, r, g, b, radius, i) {
      if (i <= 0.01) return;
      arr.push({ x: x, y: y, z: z, r: r, g: g, b: b, radius: radius, i: i, d: hypot3(x - cam.px, y - cam.py, z - cam.pz) });
    }
    add(0, 20, 100, 0.45, 0.9, 1, 280, 4.2);
    add(0, 70, -340, 0.55, 0.9, 1, 110, 2.6);
    add(0, -68, -220, 0.35, 0.75, 1, 160, 2.2);
    add(0, -70, -450, 1, 0.55, 0.25, 140, 2.8);
    add(-150, 18, 300, 0.45, 0.75, 1, 120, 2.4);
    add(-145, 14, 420, 1, 0.62, 0.28, 110, 2.2);
    add(-140, 10, 520, 1, 0.7, 0.35, 100, 2.6);
    add(0, 4, -642, 1, 0.6, 0.25, 90, charge * 6);
    world.engines.flagship.forEach(function (e) {
      add(e.x, e.y, e.z + 6, 1, 0.45, 0.12, 70, 0.6 + eng * 1.4);
    });
    if (t > 58.2 && t < 62.6) {
      var rk = rockAt(world.rocks[0], Math.min(t, world.rocks[0].br));
      add(rk[0], rk[1], rk[2], 1, 0.45, 0.15, 160, charge * 5);
    }
    if (t > 66 && t < 68.5) {
      var rb = rockAt(world.rocks[1], world.rocks[1].br);
      add(rb[0], rb[1], rb[2], 1, 0.5, 0.2, 140, Math.exp(-(t - 66.1) * 1.2) * 4);
    }
    arr.sort(function (a, b) { return (b.i / (40 + b.d)) - (a.i / (40 + a.d)); });
    return arr.slice(0, 10);
  }

  function sideVec(ax, ay, az, bx, by, bz, cam) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
    var vx = cam[0] - mx, vy = cam[1] - my, vz = cam[2] - mz;
    var sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
    var sl = Math.hypot(sx, sy, sz) || 1;
    return [sx / sl, sy / sl, sz / sl];
  }

  function ribbon(R, ax, ay, az, bx, by, bz, wa, wb, ca, cb) {
    var cam = R.camPos;
    var s = sideVec(ax, ay, az, bx, by, bz, cam);
    var a1 = [ax + s[0] * wa, ay + s[1] * wa, az + s[2] * wa];
    var a2 = [ax - s[0] * wa, ay - s[1] * wa, az - s[2] * wa];
    var b1 = [bx + s[0] * wb, by + s[1] * wb, bz + s[2] * wb];
    var b2 = [bx - s[0] * wb, by - s[1] * wb, bz - s[2] * wb];
    R.vert(a1[0], a1[1], a1[2], ca[0], ca[1], ca[2], ca[3]);
    R.vert(b1[0], b1[1], b1[2], cb[0], cb[1], cb[2], cb[3]);
    R.vert(b2[0], b2[1], b2[2], cb[0], cb[1], cb[2], cb[3]);
    R.vert(a1[0], a1[1], a1[2], ca[0], ca[1], ca[2], ca[3]);
    R.vert(b2[0], b2[1], b2[2], cb[0], cb[1], cb[2], cb[3]);
    R.vert(a2[0], a2[1], a2[2], ca[0], ca[1], ca[2], ca[3]);
  }

  function sprite(R, x, y, z, size, col) {
    var r = R.camRight, u = R.camUp;
    function corner(sx, sy) {
      return [x + r[0] * sx + u[0] * sy, y + r[1] * sx + u[1] * sy, z + r[2] * sx + u[2] * sy];
    }
    var c0 = corner(-size, -size), c1 = corner(size, -size), c2 = corner(size, size), c3 = corner(-size, size);
    function fan(a, b) {
      R.vert(x, y, z, col[0], col[1], col[2], col[3]);
      R.vert(a[0], a[1], a[2], 0, 0, 0, 0);
      R.vert(b[0], b[1], b[2], 0, 0, 0, 0);
    }
    fan(c0, c1); fan(c1, c2); fan(c2, c3); fan(c3, c0);
  }

  function drawAdditive(t, world, gpu, R, cam, eng, charge) {
    /* engine plumes */
    function plume(x, y, z, yaw, len, rad, power) {
      var dx = Math.sin(yaw), dz = Math.cos(yaw);
      /* exhaust toward +Z in ship local, yaw rotates +Z exhaust? 
         Ship forward is -Z. Exhaust direction local +Z.
         rotY: local (0,0,1) -> (sin yaw, 0, cos yaw). Yes +Z maps to (sy,0,cy) if sy=sin, cy=cos.
         Our rotY: x' = c*x + s*z, z' = -s*x + c*z. (0,0,1) -> (s, 0, c). */
      var ex = Math.sin(yaw), ez = Math.cos(yaw);
      var steps = 5;
      for (var s = 0; s < steps; s++) {
        var u0 = s / steps, u1 = (s + 1) / steps;
        var wob = 1 + 0.06 * Math.sin(t * 22 + u0 * 12 + x);
        var p0 = [x + ex * len * u0, y, z + ez * len * u0];
        var p1 = [x + ex * len * u1, y + Math.sin(t * 13 + s) * rad * 0.15, z + ez * len * u1];
        var fade0 = (1 - u0) * power;
        var fade1 = (1 - u1) * power;
        var hot = [1.0 * fade0, 0.85 * fade0, 0.55 * fade0, 1];
        var cool = [0.95 * fade1, 0.35 * fade1, 0.08 * fade1, 1];
        if (s === 0) hot = [1.2 * fade0, 0.95 * fade0, 0.7 * fade0, 1];
        ribbon(R, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], rad * (0.25 + u0) * wob, rad * (0.25 + u1) * wob, hot, cool);
      }
    }
    world.engines.flagship.forEach(function (e) {
      plume(e.x, e.y, e.z, 0, 28 + eng * 55, e.rx * (0.7 + eng * 0.8), 0.35 + eng * 0.8);
    });
    GUARDS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 1.1);
      world.guard.engines.forEach(function (e) {
        var cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
        var wx = p.x + e.x * cy + e.z * sy;
        var wz = p.z + (-e.x * sy + e.z * cy);
        plume(wx, p.y + e.y, wz, p.yaw, 14 + eng * 22, 3.2 + eng * 2.2, 0.3 + eng * 0.7);
      });
    });
    VANS.forEach(function (g, i) {
      var p = poseEscort(g, t, i * 0.8 + 2);
      world.vanguard.engines.forEach(function (e) {
        var cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
        var wx = p.x + e.x * cy + e.z * sy;
        var wz = p.z + (-e.x * sy + e.z * cy);
        plume(wx, p.y + e.y, wz, p.yaw, 16 + eng * 26, 2.4 + eng * 1.8, 0.28 + eng * 0.65);
      });
    });
    for (var ci = 0; ci < 7; ci++) {
      var cp = craftPose(ci, t);
      var cy = Math.cos(cp.yaw), sy = Math.sin(cp.yaw);
      var wx = cp.x + 14 * sy;
      var wz = cp.z + 14 * cy;
      plume(wx, cp.y, wz, cp.yaw, 8 + eng * 6, 1.3, 0.45);
    }

    /* beam */
    if (charge > 0.08 && t > 58.25 && t < 62.7) {
      var muzzle = [world.cannon.x, world.cannon.y, world.cannon.z];
      var rk = rockAt(world.rocks[0], Math.min(t, world.rocks[0].br));
      var detach = t > 61.45 ? smooth((t - 61.45) / 0.9) : 0;
      var ax = lerp(muzzle[0], rk[0], detach * 0.75);
      var ay = lerp(muzzle[1], rk[1], detach * 0.75);
      var az = lerp(muzzle[2], rk[2], detach * 0.75);
      var width = (2.2 + charge * 6.5) * (1 - detach * 0.8);
      var steps = 18;
      for (var s = 0; s < steps; s++) {
        var u0 = s / steps, u1 = (s + 1) / steps;
        var q0 = [lerp(ax, rk[0], u0), lerp(ay, rk[1], u0), lerp(az, rk[2], u0)];
        var q1 = [lerp(ax, rk[0], u1), lerp(ay, rk[1], u1), lerp(az, rk[2], u1)];
        var pulse = 0.75 + 0.25 * Math.sin(u0 * 40 - t * 28);
        var core = [1.3 * charge * pulse, 1.15 * charge * pulse, 0.85 * charge, 1];
        var sheath = [0.85 * charge, 0.38 * charge, 0.08 * charge, 1];
        ribbon(R, q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], width * 0.28, width * 0.28, core, core);
        ribbon(R, q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], width, width, sheath, sheath);
      }
      sprite(R, muzzle[0], muzzle[1], muzzle[2], 8 + charge * 14, [charge, charge * 0.8, charge * 0.4, 1]);
      if (t > 58.4) sprite(R, rk[0], rk[1], rk[2], 18 + charge * 22, [charge, charge * 0.45, 0.12, 1]);
    }

    /* pulse bolts */
    if (t > 60.9 && t < 65.2) {
      world.turrets.forEach(function (tu, i) {
        var period = 0.42;
        var shift = (i % 2) * 0.2 + (i * 0.017);
        var age = (t - 60.9 - shift);
        if (age < 0) return;
        var shot = age % period;
        if (shot > 0.34) return;
        var u = shot / 0.34;
        var targets = [world.rocks[2], world.rocks[3], world.rocks[7], world.rocks[0]];
        var tg = targets[i % targets.length];
        var tp = rockAt(tg, Math.min(t, tg.br));
        var from = [tu.x, tu.y + 6, tu.z - 16];
        var x = lerp(from[0], tp[0], u), y = lerp(from[1], tp[1], u), z = lerp(from[2], tp[2], u);
        var x2 = lerp(from[0], tp[0], Math.min(1, u + 0.08));
        var y2 = lerp(from[1], tp[1], Math.min(1, u + 0.08));
        var z2 = lerp(from[2], tp[2], Math.min(1, u + 0.08));
        ribbon(R, x, y, z, x2, y2, z2, 1.1, 2.4, [0.5, 0.85, 1, 1], [0.15, 0.4, 0.7, 1]);
        sprite(R, x2, y2, z2, 2.2, [0.7, 0.95, 1, 1]);
        if (u > 0.92) sprite(R, tp[0], tp[1], tp[2], 8, [0.6, 0.8, 1, 1]);
      });
    }

    /* PDC tracers */
    if (t > 62.6 && t < 66.5) {
      GUARDS.forEach(function (g, gi) {
        if (gi % 2) return;
        var p = poseEscort(g, t, gi * 1.1);
        M.trs(tmp, p.x, p.y, p.z, p.yaw, p.pitch, 0, 1, 1, 1);
        var tgt = pdcTarget(t) || [-220, 10, -400];
        world.guard.guns.forEach(function (gun, bi) {
          var cycle = 0.09;
          var age = (t - 62.6 - bi * 0.015 - gi * 0.02);
          if (age < 0) return;
          var shot = age % cycle;
          if (shot > 0.07) return;
          var u = shot / 0.07;
          var wp = xform(tmp, gun.x, gun.y, gun.z - 16);
          var x = lerp(wp[0], tgt[0], u);
          var y = lerp(wp[1], tgt[1], u);
          var z = lerp(wp[2], tgt[2], u);
          var x2 = lerp(wp[0], tgt[0], Math.min(1, u + 0.18));
          var y2 = lerp(wp[1], tgt[1], Math.min(1, u + 0.18));
          var z2 = lerp(wp[2], tgt[2], Math.min(1, u + 0.18));
          ribbon(R, x, y, z, x2, y2, z2, 0.35, 0.15, [1, 0.85, 0.45, 1], [1, 0.4, 0.1, 0.2]);
          if (shot < 0.02) sprite(R, wp[0], wp[1], wp[2], 2.4, [1, 0.7, 0.3, 1]);
        });
      });
      if (t > 63.5) {
        var flick = (t * 20) % 1;
        sprite(R, -220, 12, -480, 3 + flick * 4, [1, 0.6, 0.2, 0.8]);
      }
    }

    /* missile trails and impacts */
    var missiles = window.__missiles || [];
    missiles.forEach(function (ms) {
      if (t < ms.lt || t > ms.lt + ms.ft + 0.8) return;
      var u = clamp((t - ms.lt) / ms.ft, 0, 1);
      var steps = 8;
      for (var s = 0; s < steps; s++) {
        var u0 = Math.max(0, u - 0.22 + s * 0.028);
        var u1 = Math.max(0, u - 0.22 + (s + 1) * 0.028);
        if (u1 <= 0) continue;
        var p0 = missilePoint(ms, u0);
        var p1 = missilePoint(ms, u1);
        var f0 = (s / steps) * (t < ms.lt + ms.ft ? 1 : Math.exp(-(t - ms.lt - ms.ft) * 3));
        var f1 = ((s + 1) / steps) * f0;
        ribbon(R, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.6 + f0 * 1.6, 0.8 + f1 * 2.4,
          [0.4 * f0, 0.2 * f0, 0.05 * f0, 1], [1.0 * f1, 0.55 * f1, 0.15 * f1, 1]);
      }
      if (u > 0.97) {
        var hit = ms.target;
        var dt = t - (ms.lt + ms.ft);
        if (dt < 0.7) {
          var a = Math.exp(-dt * 4);
          sprite(R, hit[0], hit[1], hit[2], 10 + dt * 28, [1.1 * a, 0.55 * a, 0.15 * a, 1]);
        }
      }
    });

    /* fine dust, kept off the lens */
    var base = travel(t);
    var camP = R.camPos;
    for (var i = 0; i < 90; i++) {
      var hx = hash(i, 2), hy = hash(i, 5), hz = hash(i, 9);
      var z = camP[2] + ((hz * DUST_L + base) % DUST_L) - DUST_L * 0.5;
      var x = camP[0] + (hx - 0.5) * 160;
      var y = camP[1] + (hy - 0.5) * 90;
      var dx = x - camP[0], dy = y - camP[1], dz = z - camP[2];
      var dist = Math.hypot(dx, dy, dz);
      if (dist < 12 || dist > 80) continue;
      var lift = (0.05 + eng * 0.04) * (1 - dist / 90);
      var sz = 0.035 + hash(i, 4) * 0.05;
      sprite(R, x, y, z, sz, [lift, lift * 0.92, lift * 0.75, 1]);
    }

    /* bridge holo */
    holo(R, t);

    /* muzzle sparks while charging */
    if (charge > 0.2 && t < 58.5) {
      sprite(R, world.cannon.x, world.cannon.y, world.cannon.z, 4 + charge * 10, [charge, charge * 0.6, 0.15, 1]);
    }
  }

  function holo(R, t) {
    var cx = 0, cy = 76.2, cz = -346;
    var s = 0.011;
    var spin = t * Math.PI * 2 / DURATION;
    var cs = Math.cos(spin), sn = Math.sin(spin);
    function pin(x, z, h, col) {
      var wx = cx + x * cs - z * sn;
      var wz = cz + x * sn + z * cs;
      ribbon(R, wx, cy, wz, wx, cy + h, wz, 0.12, 0.05, col, [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 1]);
      sprite(R, wx, cy + h, wz, 0.22, col);
    }
    var bow = [0.55, 0.95, 1, 1];
    pin(0, -520 * s, 2.4, [1, 0.72, 0.3, 1]);
    pin(0, 200 * s, 1.6, bow);
    ribbon(R, cx + sn * 200 * s, cy + 0.4, cz + cs * 200 * s, cx - sn * 520 * s, cy + 0.8, cz - cs * 520 * s, 0.2, 0.08, [0.25, 0.5, 0.75, 1], bow);
    GUARDS.forEach(function (g) {
      pin(g.x * s, g.z * s, 0.9, [0.4, 0.85, 1, 1]);
    });
    VANS.forEach(function (g) {
      pin(g.x * s * 0.85, g.z * s * 0.85, 0.7, [0.75, 0.9, 1, 1]);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
