/* seagulls (flock AI with perching), the harbour cat, schools of small fish */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L;
  var QY = L.QUAY_Y;
  var V3 = THREE.Vector3;
  var _v = new V3(), _v2 = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3();

  function mesh(parent, geom, key, cast) {
    var def = H.M[key || 'solid'];
    var m = new THREE.Mesh(G.merge(Array.isArray(geom) ? geom : [geom]), def.mat);
    m.castShadow = cast !== false; m.receiveShadow = true; parent.add(m); return m;
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  // =========================================================================== gulls
  function makeGull(scene, k) {
    var g = new THREE.Group(); g.name = 'gull' + k;
    var white = 0xfbfbf6, grey = 0xb9c4cc, dark = 0x3a4046, bill = 0xf2b53c;
    var body = G.sph(0.17, white, 10, 8).scale(0.78, 0.74, 1.75);
    G.paintFn(body, function (x, y, z) { return y > 0.045 && z < 0.2 ? grey : white; });
    var parts = [body,
      G.sph(0.092, white, 9, 7).translate(0, 0.085, 0.3),
      G.cone(0.03, 0.13, 6, bill).rotateX(Math.PI / 2).translate(0, 0.075, 0.43),
      G.sph(0.016, 0x1f2428, 6, 5).translate(0.078, 0.102, 0.35), G.sph(0.016, 0x1f2428, 6, 5).translate(-0.078, 0.102, 0.35),
      G.extrude([[-0.085, 0], [0.085, 0], [0.12, -0.24], [-0.12, -0.24]], 0.012, white).rotateX(Math.PI / 2).translate(0, 0.02, -0.24)];
    var b = mesh(g, parts);
    var legs = mesh(g, [G.pipe([0.05, -0.1, 0.03], [0.05, -0.26, 0.05], 0.011, bill, 4), G.pipe([-0.05, -0.1, 0.03], [-0.05, -0.26, 0.05], 0.011, bill, 4),
      G.box(0.06, 0.012, 0.09, bill).translate(0.05, -0.262, 0.08), G.box(0.06, 0.012, 0.09, bill).translate(-0.05, -0.262, 0.08)]);
    var wings = [];
    [1, -1].forEach(function (s) {
      var sh = new THREE.Group(); sh.position.set(s * 0.09, 0.05, 0.06); g.add(sh);
      var inner = G.extrude([[0, -0.13], [s * 0.42, -0.11], [s * 0.42, 0.09], [0, 0.13]], 0.022, grey).rotateX(Math.PI / 2).translate(0, 0.011, 0);
      mesh(sh, [inner], 'solidDS');
      var el = new THREE.Group(); el.position.set(s * 0.42, 0, 0); sh.add(el);
      var outer = G.extrude([[0, -0.11], [s * 0.3, -0.07], [s * 0.52, 0.0], [s * 0.3, 0.07], [0, 0.09]], 0.016, grey).rotateX(Math.PI / 2).translate(0, 0.008, 0);
      G.paintFn(outer, function (x) { return Math.abs(x) > 0.34 ? dark : grey; });
      mesh(el, [outer], 'solidDS');
      wings.push({ sh: sh, el: el, s: s });
    });
    scene.add(g);
    return { g: g, legs: legs, wings: wings, id: k };
  }
  // wing pose: a = shoulder lift (rad, + up), b = elbow, fold 0..1
  function poseWings(gu, a, b, fold) {
    for (var i = 0; i < 2; i++) {
      var w = gu.wings[i], s = w.s;
      // spread: rotate about z (lift). folded: swing back about y and tuck down
      // folded: swept back along the flank, tipped on edge like a little tent over the back
      w.sh.rotation.set(fold * 0.95, s * fold * 1.34, s * (a * (1 - fold)), 'YXZ');
      w.el.rotation.set(0, s * fold * 0.2, s * (b * (1 - fold)), 'YXZ');
      w.sh.scale.set(1 - fold * 0.46, 1, 1 - fold * 0.18);
      w.sh.position.y = 0.05 + fold * 0.03;
    }
  }

  var GULL_N = 7;
  var gulls = [], perches = [];
  function buildPerches() {
    perches = [];
    H.BOLLARDS.forEach(function (b, i) { perches.push({ kind: 'bollard', x: b.x, y: b.y + 0.265, z: b.z, id: 'b' + i, busy: -1 }); });
    H.LAMPS.forEach(function (l, i) { perches.push({ kind: 'lamp', x: l.x, y: l.y + 0.2 + 0.265, z: l.z, id: 'l' + i, busy: -1 }); });
    perches.push({ kind: 'rail', x: L.LH.x + 1.02, y: L.BW.top + 6.5 + 0.28, z: L.LH.z + 0.35, id: 'lh', busy: -1 });
    [[-3.0, L.BW.z0 + 0.26], [3.8, L.BW.z0 + 0.26], [9.2, L.BW.z0 + 0.26]].forEach(function (p, i) { perches.push({ kind: 'wall', x: p[0], y: L.BW.top + 0.98 + 0.265, z: p[1], id: 'w' + i, busy: -1 }); });
    perches.push({ kind: 'sign', x: -22.9, y: QY + 2.6 + 0.265, z: 15.0, id: 'sg', busy: -1 });
    (H.BOATS || []).forEach(function (bt) {
      bt.info.perches.forEach(function (p, i) { perches.push({ kind: 'boat', boat: bt, local: new V3(p[0], p[1] + 0.265, p[2]), x: 0, y: 0, z: 0, id: bt.id + i, busy: -1 }); });
    });
    [[-13.5, -1.5], [-3.5, 1.2], [5.5, -7.5], [-21.0, 3.5], [-17.0, -19.0]].forEach(function (p, i) { perches.push({ kind: 'water', x: p[0], y: 0.13, z: p[1], id: 'wt' + i, busy: -1 }); });
    H.PERCHES = perches;
  }
  function perchPos(p, out) {
    if (p.kind === 'boat') { out.copy(p.local).applyMatrix4(p.boat.inner.matrixWorld); }
    else out.set(p.x, p.y, p.z);
    return out;
  }
  function orbitTarget(gu, t, out) {
    var a = gu.orbPh + t * gu.orbSp;
    var R = gu.orbR * (1 + 0.25 * Math.sin(t * 0.07 + gu.id));
    out.set(gu.cx + Math.cos(a) * R * 1.25, gu.alt + Math.sin(t * 0.11 + gu.id * 2.1) * 2.2, gu.cz + Math.sin(a) * R);
    return out;
  }
  function resetGulls(mode, rng) {
    var i;
    perches.forEach(function (p) { p.busy = -1; });
    for (i = 0; i < gulls.length; i++) {
      var gu = gulls[i];
      gu.orbPh = rng() * 6.28; gu.orbSp = (0.11 + rng() * 0.07) * (i % 2 ? 1 : -1); gu.orbR = 13 + rng() * 12; gu.alt = 9.5 + rng() * 7;
      gu.cx = -4 + rng() * 10; gu.cz = 0 + rng() * 9;
      orbitTarget(gu, 0, _v);
      gu.pos = _v.clone(); gu.head = gu.orbPh + (gu.orbSp > 0 ? Math.PI / 2 : -Math.PI / 2); gu.speed = 6.2 + rng() * 1.2; gu.vy = 0; gu.bank = 0; gu.pitch = 0;
      gu.state = 'fly'; gu.flapT = rng() * 3; gu.flapPh = rng() * 6; gu.flapping = 0; gu.fold = 0; gu.timer = 6 + rng() * 22; gu.perch = null; gu.sub = 0;
      gu.headTurn = 0; gu.patience = 0; gu.calm = 0; gu.skim = 0;
    }
    // some start already perched
    function sit(i, id, patience) {
      var p = null; perches.forEach(function (q) { if (q.id === id) p = q; });
      if (!p || !gulls[i]) return;
      var gu = gulls[i]; gu.state = p.kind === 'water' ? 'float' : 'perch'; gu.perch = p; p.busy = i; gu.fold = 1; gu.timer = patience; gu.patience = patience; gu.head = rng() * 6.28;
      perchPos(p, gu.pos);
    }
    if (mode === 'tour') { sit(0, 'b6', 400); sit(1, 'l2', 26); sit(2, 'wt2', 30); sit(3, 'w1', 60); sit(4, 'b0', 34); }
    else { sit(0, 'b0', 14 + rng() * 14); sit(1, 'b6', 9 + rng() * 14); sit(2, 'wt1', 18 + rng() * 10); }
  }
  function freePerch(gu, rng) {
    var cand = [];
    for (var i = 0; i < perches.length; i++) {
      var p = perches[i]; if (p.busy >= 0) continue;
      if (p.kind === 'boat' && (!p.boat.moored)) continue;
      perchPos(p, _v2);
      if (_v2.distanceTo(H.camPos) < 9) continue;
      cand.push(p);
    }
    if (!cand.length) return null;
    return cand[Math.floor(rng() * cand.length) % cand.length];
  }
  function updateGull(gu, dt, t, rng) {
    var cam = H.camPos, i;
    var tgt = _v, desiredSpeed = 6.6, flap = false, foldTo = 0;
    if (gu.state === 'perch' || gu.state === 'float') {
      var p = gu.perch; perchPos(p, gu.pos);
      if (p.kind === 'water') gu.pos.y = 0.13 + Math.sin(t * 1.3 + gu.id) * 0.035;
      gu.fold += (1 - gu.fold) * Math.min(1, dt * 5);
      gu.vy = 0; gu.bank *= 0.9; gu.pitch += (0 - gu.pitch) * dt * 4;
      gu.timer -= dt;
      // look about
      gu.sub -= dt; if (gu.sub <= 0) { gu.sub = 1.2 + rng() * 3; gu.headTurn = (rng() - 0.5) * 1.6; }
      gu.head += gu.headTurn * dt * 0.35; gu.headTurn *= 0.97;
      // startled by a close camera
      var dc = gu.pos.distanceTo(cam);
      var near = dc < 8.0;
      var approaching = dc < gu.lastDc - 0.004;
      var leave = gu.timer <= 0 || (dc < 5.0 && approaching) || dc < 3.0;
      if (p.kind === 'boat' && !p.boat.moored) leave = true;
      gu.lastDc = dc;
      if (leave) {
        gu.state = 'takeoff'; gu.timer = 1.6; p.busy = -1; gu.perch = null; gu.speed = 1.0; gu.vy = 2.6;
        // flee away from the camera, roughly
        var away = Math.atan2(gu.pos.x - cam.x, gu.pos.z - cam.z) + (rng() - 0.5) * 1.2;
        gu.head = near ? away : gu.head; gu.flapPh = 0;
      }
    } else {
      if (gu.state === 'takeoff') {
        flap = true; desiredSpeed = 7.4; gu.timer -= dt; gu.fold += (0 - gu.fold) * Math.min(1, dt * 9);
        tgt.set(gu.pos.x + Math.sin(gu.head) * 10, gu.pos.y + 5, gu.pos.z + Math.cos(gu.head) * 10);
        if (gu.timer <= 0) { gu.state = 'fly'; gu.timer = 14 + rng() * 26; }
      } else if (gu.state === 'fly') {
        orbitTarget(gu, t, tgt);
        if (gu.skim > 0) {       // glide low over the harbour water for a while
          gu.skim -= dt; tgt.set(gu.skimX, 0.75, gu.skimZ);
          if (Math.hypot(gu.pos.x - gu.skimX, gu.pos.z - gu.skimZ) < 2.5) { gu.skimX += Math.sin(gu.head) * 9; gu.skimZ += Math.cos(gu.head) * 9; gu.skim = Math.min(gu.skim, 2.2); }
          if (gu.pos.x < -30 || gu.pos.x > 12 || gu.pos.z < -26 || gu.pos.z > 10) gu.skim = 0;
        }
        gu.timer -= dt;
        if (gu.timer <= 0) {
          var r = rng();
          if (r < 0.5) { var pp = freePerch(gu, rng); if (pp) { gu.perch = pp; pp.busy = gu.id; gu.state = 'approach'; gu.timer = 30; } else gu.timer = 6; }
          else if (r < 0.8) { gu.skim = 9; gu.skimX = -16 + rng() * 20; gu.skimZ = -6 + rng() * 12; gu.timer = 16 + rng() * 14; }
          else gu.timer = 10 + rng() * 16;
        }
        gu.flapT -= dt; if (gu.flapT <= 0) { gu.flapping = gu.flapping ? 0 : 1; gu.flapT = gu.flapping ? 0.9 + rng() * 1.4 : 2.2 + rng() * 4.5; }
        flap = gu.flapping === 1 || gu.pos.y < tgt.y - 2.5;
      } else if (gu.state === 'approach') {
        var pr = gu.perch; perchPos(pr, _v2);
        var dH = Math.hypot(_v2.x - gu.pos.x, _v2.z - gu.pos.z), dV = gu.pos.y - _v2.y;
        gu.timer -= dt;
        if (pr.kind === 'boat' && !pr.boat.moored) { pr.busy = -1; gu.perch = null; gu.state = 'fly'; gu.timer = 12; }
        else if (dH > 7) { tgt.set(_v2.x, _v2.y + 2.6, _v2.z); desiredSpeed = 6.4; }
        else {
          tgt.set(_v2.x, _v2.y + 0.25 + dH * 0.22, _v2.z); desiredSpeed = Math.max(1.1, dH * 1.15); flap = true;
          if (dH < 0.3 && Math.abs(dV) < 0.6) {
            gu.state = pr.kind === 'water' ? 'float' : 'perch'; gu.timer = 9 + rng() * 22; gu.speed = 0; gu.calm = 0; gu.lastDc = 99;
          }
        }
        if (gu.timer <= 0 && gu.state === 'approach') { pr.busy = -1; gu.perch = null; gu.state = 'fly'; gu.timer = 10; }
      }
      if (gu.state !== 'perch' && gu.state !== 'float') {
        // steer
        var want = Math.atan2(tgt.x - gu.pos.x, tgt.z - gu.pos.z);
        var d = angDiff(want, gu.head);
        var maxTurn = (gu.state === 'approach' ? 2.2 : 1.15) * dt;
        var turn = H.clamp(d, -maxTurn, maxTurn);
        gu.head += turn;
        gu.bank += (H.clamp(-d * 1.1, -0.75, 0.75) - gu.bank) * Math.min(1, dt * 2.5);
        gu.speed += (desiredSpeed - gu.speed) * Math.min(1, dt * 1.4);
        var wantVy = H.clamp((tgt.y - gu.pos.y) * 0.8, -3.0, 2.6);
        gu.vy += (wantVy - gu.vy) * Math.min(1, dt * 2.0);
        gu.pos.x += Math.sin(gu.head) * gu.speed * dt; gu.pos.z += Math.cos(gu.head) * gu.speed * dt; gu.pos.y += gu.vy * dt;
        var gy = H.groundY(gu.pos.x, gu.pos.z) + 0.3; if (gu.pos.y < gy) { gu.pos.y = gy; gu.vy = Math.max(0, gu.vy); }
        gu.pitch += (H.clamp(-gu.vy * 0.09, -0.4, 0.4) + (gu.state === 'approach' && gu.speed < 3 ? -0.45 : 0) - gu.pitch) * Math.min(1, dt * 3);
        gu.fold += (0 - gu.fold) * Math.min(1, dt * 8);
      }
    }
    // wings
    var a, b;
    if (flap) { gu.flapPh += dt * (gu.state === 'takeoff' || gu.state === 'approach' ? 15 : 9.5); a = Math.sin(gu.flapPh) * 0.72 + 0.1; b = Math.sin(gu.flapPh - 1.0) * 0.55 - 0.1; }
    else { a = 0.13 + Math.sin(t * 0.9 + gu.id) * 0.03; b = -0.2; gu.flapPh *= 0.9; }
    gu.wa = gu.wa === undefined ? a : gu.wa + (a - gu.wa) * Math.min(1, dt * 14);
    gu.wb = gu.wb === undefined ? b : gu.wb + (b - gu.wb) * Math.min(1, dt * 14);
  }
  function presentGull(gu) {
    gu.g.position.copy(gu.pos);
    gu.g.rotation.set(gu.pitch, gu.head, gu.bank, 'YXZ');
    poseWings(gu, gu.wa || 0, gu.wb || 0, gu.fold);
    gu.legs.visible = gu.state === 'perch';
  }

  // =========================================================================== cat
  var cat = null;
  var NODES = [[-27.6, 16.0], [-27.2, 19.7], [-23.4, 17.4], [-18.4, 14.3], [-14.1, 16.1], [-9.0, 15.3], [-3.6, 17.6], [1.5, 14.2], [7.0, 16.8], [12.5, 14.7],
    [15.9, 9.6], [17.3, 3.5], [16.5, -3.6], [-12.0, 22.2], [-22.0, 24.6], [4.6, 25.6], [21.8, 17.0], [-20.3, 13.1]];
  var EDGES = [[0, 1], [1, 2], [1, 14], [2, 3], [2, 17], [3, 17], [3, 4], [4, 5], [4, 13], [5, 6], [5, 7], [6, 7], [6, 8], [6, 13], [8, 9], [8, 15], [9, 10], [9, 16], [10, 11], [11, 12], [13, 14], [13, 15], [15, 16], [2, 14], [3, 13], [7, 8]];
  var ADJ = NODES.map(function () { return []; });
  EDGES.forEach(function (e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
  function bfs(a, b) {
    var prev = {}, q = [a], seen = {}; seen[a] = 1;
    while (q.length) { var n = q.shift(); if (n === b) break; ADJ[n].forEach(function (m) { if (!seen[m]) { seen[m] = 1; prev[m] = n; q.push(m); } }); }
    var path = [b]; while (path[0] !== a) { if (prev[path[0]] === undefined) return [a]; path.unshift(prev[path[0]]); }
    return path;
  }
  function catY(x, z) {
    var S = L.SLIP; if (x > S.x0 && x < S.x1 && z < S.zTop) return H.slipY(z);
    return QY;
  }
  function makeCat(scene) {
    var g = new THREE.Group(); g.name = 'cat';
    var fur = 0xe9a55f, furD = 0xcf8a45, wh = 0xfbf7ee, pink = 0xf2a69a;
    var body = G.sph(0.14, fur, 10, 8).scale(0.9, 0.86, 1.95);
    G.paintFn(body, function (x, y, z) { return y < -0.045 ? wh : (Math.sin(z * 26) > 0.55 && y > 0.02 ? furD : fur); });
    var bodyG = new THREE.Group(); g.add(bodyG);
    var bm = mesh(bodyG, [body]);
    var headG = new THREE.Group(); headG.position.set(0, 0.07, 0.27); bodyG.add(headG);
    var hd = G.sph(0.105, fur, 10, 8).scale(1.05, 0.92, 0.95);
    G.paintFn(hd, function (x, y, z) { return (y < -0.01 && z > 0.02) ? wh : (Math.abs(x) < 0.02 && y > 0.05 ? furD : fur); });
    mesh(headG, [hd,
      G.cone(0.04, 0.075, 4, fur).translate(0.062, 0.1, 0.0), G.cone(0.04, 0.075, 4, fur).translate(-0.062, 0.1, 0.0),
      G.cone(0.022, 0.04, 4, pink).translate(0.062, 0.093, 0.012), G.cone(0.022, 0.04, 4, pink).translate(-0.062, 0.093, 0.012),
      G.sph(0.016, 0x2a3a2a, 6, 5).scale(0.8, 1.15, 0.6).translate(0.042, 0.018, 0.092), G.sph(0.016, 0x2a3a2a, 6, 5).scale(0.8, 1.15, 0.6).translate(-0.042, 0.018, 0.092),
      G.sph(0.03, wh, 6, 5).scale(1.5, 0.8, 0.9).translate(0, -0.03, 0.085), G.sph(0.011, pink, 5, 4).translate(0, -0.012, 0.108)]);
    var legs = [];
    [[0.062, 0.15], [-0.062, 0.15], [0.065, -0.17], [-0.065, -0.17]].forEach(function (p, i) {
      var lg = new THREE.Group(); lg.position.set(p[0], -0.05, p[1]); bodyG.add(lg);
      mesh(lg, [G.cyl(0.03, 0.026, 0.19, 6, i < 2 ? fur : fur).translate(0, -0.085, 0), G.sph(0.034, wh, 6, 5).scale(1, 0.7, 1.25).translate(0, -0.18, 0.012)]);
      legs.push(lg);
    });
    var tailG = new THREE.Group(); tailG.position.set(0, 0.03, -0.25); bodyG.add(tailG);
    var tl = G.tube([[0, 0, 0], [0, 0.06, -0.12], [0, 0.17, -0.2], [0, 0.3, -0.22], [0.0, 0.4, -0.18]], 0.024, fur, 6, 14);
    G.paintFn(tl, function (x, y) { return y > 0.32 ? wh : (Math.sin(y * 50) > 0.5 ? furD : fur); });
    mesh(tailG, [tl]);
    scene.add(g);
    return { g: g, body: bodyG, head: headG, legs: legs, tail: tailG };
  }
  function resetCat(mode, rng) {
    var c = cat; c.node = 0; c.x = NODES[0][0]; c.z = NODES[0][1]; c.yaw = 1.5708; c.state = 'hide'; c.t = 0; c.path = []; c.walkPh = 0; c.speed = 0;
    c.sit = 0; c.loaf = 1; c.look = 0; c.lookT = 0; c.lookCd = 0; c.trips = 0; c.wait = mode === 'tour' ? 9999 : 4 + rng() * 6; c.headYaw = 0; c.headPitch = 0; c.pause = 0; c.lastCamD = 99;
  }
  function updateCat(dt, t, rng) {
    var c = cat, rain = H.state.rain, cam = H.camPos;
    var wet = rain > 0.56, dry = rain < 0.40;
    var moveTo = null, sp = 0;
    if (c.state === 'hide') {
      c.loaf += (1 - c.loaf) * Math.min(1, dt * 3); c.sit += (0 - c.sit) * Math.min(1, dt * 3);
      c.yaw += angDiff(1.5708, c.yaw) * Math.min(1, dt * 3);
      if (dry) { c.wait -= dt; if (c.wait <= 0) {
        // choose a destination a few hops away; a different one every outing
        var cand = []; for (var i = 2; i < NODES.length; i++) if (i !== c.lastDest) cand.push(i);
        var dest = cand[Math.floor(rng() * cand.length) % cand.length];
        c.path = bfs(0, dest); c.lastDest = dest; c.state = 'walk'; c.pi = 1; c.hops = 1 + Math.floor(rng() * 2); c.off = [(rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2];
      } }
    } else if (c.state === 'walk' || c.state === 'home' || c.state === 'run') {
      c.loaf += (0 - c.loaf) * Math.min(1, dt * 4); c.sit += (0 - c.sit) * Math.min(1, dt * 5);
      if (wet && c.state === 'walk') { c.path = bfs(c.node, 0); c.pi = c.path.length > 1 && c.path[0] === c.node ? 1 : 0; c.state = 'run'; }
      var ni = c.path[c.pi];
      if (ni === undefined) {
        if (c.state === 'walk') { c.state = 'sitting'; c.t = 5 + rng() * 9; }
        else { c.state = 'hide'; c.wait = 14 + rng() * 20; c.homing = 1; }
      } else {
        var last = c.pi === c.path.length - 1;
        var tx = NODES[ni][0] + (last && ni !== 0 ? c.off[0] : 0), tz = NODES[ni][1] + (last && ni !== 0 ? c.off[1] : 0);
        moveTo = [tx, tz]; sp = c.state === 'run' ? 3.6 : 0.95;
        if (c.pause > 0) { c.pause -= dt; sp = 0; }
        else if (c.state === 'walk' && rng() < dt * 0.06) c.pause = 0.8 + rng() * 1.6;     // stops to sniff the air
        if (Math.hypot(tx - c.x, tz - c.z) < 0.18) { c.node = ni; c.pi++; }
      }
    } else if (c.state === 'sitting') {
      c.sit += (1 - c.sit) * Math.min(1, dt * 3.5);
      c.t -= dt;
      if (wet) { c.path = bfs(c.node, 0); c.pi = 1; c.state = 'run'; }
      else if (c.t <= 0) {
        if (c.hops > 0 && dry) { c.hops--; var nb = ADJ[c.node].filter(function (n) { return n !== 0; }); var d2 = nb[Math.floor(rng() * nb.length) % nb.length]; var further = ADJ[d2].filter(function (n) { return n !== c.node && n !== 0; }); if (further.length && rng() < 0.6) { c.path = [c.node, d2, further[Math.floor(rng() * further.length) % further.length]]; } else c.path = [c.node, d2]; c.pi = 1; c.state = 'walk'; c.off = [(rng() - 0.5) * 1.2, (rng() - 0.5) * 1.2]; }
        else { c.path = bfs(c.node, 0); c.pi = 1; c.state = 'home'; }
      }
    }
    if (moveTo) {
      var want = Math.atan2(moveTo[0] - c.x, moveTo[1] - c.z), d = angDiff(want, c.yaw);
      c.yaw += H.clamp(d, -dt * (sp > 2 ? 7 : 3.4), dt * (sp > 2 ? 7 : 3.4));
      var k = Math.max(0, Math.cos(d));
      c.speed += (sp * k - c.speed) * Math.min(1, dt * 5);
      c.x += Math.sin(c.yaw) * c.speed * dt; c.z += Math.cos(c.yaw) * c.speed * dt;
      c.walkPh += c.speed * dt * (sp > 2 ? 5.2 : 9.0);
    } else c.speed += (0 - c.speed) * Math.min(1, dt * 6);
    // glance at the camera when it comes close
    var cx = cam.x - c.x, cy = cam.y - (catY(c.x, c.z) + 0.25), cz = cam.z - c.z, cd = Math.sqrt(cx * cx + cy * cy + cz * cz);
    c.lookCd -= dt;
    if (cd < 13 && cd < c.lastCamD - 0.002 && c.lookCd <= 0 && c.lookT <= 0) { c.lookT = 2.4 + rng() * 1.2; c.lookCd = 9 + rng() * 6; }
    c.lastCamD = cd;
    var ty = 0, tp = 0;
    if (c.lookT > 0) {
      c.lookT -= dt;
      ty = H.clamp(angDiff(Math.atan2(cx, cz), c.yaw), -1.5, 1.5); tp = H.clamp(-Math.atan2(cy, Math.hypot(cx, cz)), -0.9, 0.3);
      c.look += (1 - c.look) * Math.min(1, dt * 6);
    } else { c.look += (0 - c.look) * Math.min(1, dt * 3); if (c.state === 'sitting') { ty = Math.sin(t * 0.4) * 0.7; } }
    c.headYaw += (ty - c.headYaw) * Math.min(1, dt * 7); c.headPitch += (tp - c.headPitch) * Math.min(1, dt * 7);
  }
  function presentCat(t) {
    var c = cat, y = catY(c.x, c.z);
    var loaf = c.loaf, sit = c.sit, moving = Math.min(1, c.speed / 0.8);
    var run = H.clamp((c.speed - 1.5) / 1.5, 0, 1);
    var bob = Math.abs(Math.sin(c.walkPh)) * 0.012 * moving + Math.max(0, Math.sin(c.walkPh * 1.0)) * 0.06 * run;
    c.g.position.set(c.x, y + 0.235 - loaf * 0.115 - sit * 0.02 + bob, c.z);
    var slopeTilt = (c.x > L.SLIP.x0 && c.x < L.SLIP.x1 && c.z < L.SLIP.zTop) ? Math.atan((QY + 1.3) / (L.SLIP.zTop - L.SLIP.zEnd)) * Math.cos(c.yaw) : 0;
    c.g.rotation.set(-slopeTilt, c.yaw, 0, 'YXZ');
    c.body.rotation.x = -sit * 0.62 + Math.sin(c.walkPh) * 0.06 * run;
    c.body.position.y = sit * 0.045;
    c.head.rotation.set(c.headPitch + sit * 0.55 + loaf * 0.12 - c.look * loaf * 0.3 - moving * 0.08, c.headYaw, 0, 'YXZ');
    c.head.position.y = 0.07 - loaf * 0.02 + c.look * 0.012;
    for (var i = 0; i < 4; i++) {
      var front = i < 2, ph = c.walkPh + (i === 0 || i === 3 ? 0 : Math.PI) + (run > 0.5 ? (front ? 0 : 0.9) : 0);
      var sw = Math.sin(ph) * (0.5 + run * 0.4) * moving;
      var lg = c.legs[i];
      lg.rotation.x = sw + (front ? sit * 0.62 : -sit * 0.95) + loaf * (front ? -1.45 : 1.3);
      lg.scale.y = 1 - loaf * (front ? 0.25 : 0.7) - (front ? 0 : sit * 0.35);
      lg.position.y = -0.05 - loaf * (front ? 0.045 : 0.03);
    }
    c.tail.rotation.set(-0.2 - sit * 0.9 - loaf * 1.25 + Math.sin(t * 1.7) * 0.08 * (1 - loaf * 0.7) - run * 0.9, Math.sin(t * 1.1) * 0.3 * (1 - loaf) + loaf * 2.2 + sit * 0.9, 0, 'YXZ');
  }

  // =========================================================================== fish
  var schools = [], fishMesh, FISH_N = 0;
  var SCHOOLS = [
    { c: [-27.0, -2.3, 2.5], r: [2.6, 0.7, 3.6], n: 22, sp: 0.19, s: 1.5 },
    { c: [-21.0, -2.6, -22.5], r: [5.5, 0.7, 2.6], n: 18, sp: 0.16, s: 1.5 },
    { c: [1.5, -2.0, 2.0], r: [4.0, 0.6, 2.6], n: 14, sp: 0.21, s: 1.3 },
    { c: [-29.0, -3.2, -13.0], r: [1.8, 0.5, 4.5], n: 5, sp: 0.1, s: 3.0 }       // a few larger bream
  ];
  function makeFish(scene) {
    var body = G.sph(0.1, 0xb9d2e0, 8, 6).scale(0.42, 0.85, 1.9);
    G.paintFn(body, function (x, y) { return y > 0.03 ? 0x2f6f8f : (y < -0.03 ? 0xfbfdfb : 0xc9dde6); });
    var tail = G.merge([G.tri([0, 0, -0.17], [0, 0.085, -0.3], [0, -0.085, -0.3], 0x2f6f8f), G.tri([0, 0.07, 0.0], [0, 0.125, -0.07], [0, 0.07, -0.1], 0x2f6f8f)]);
    var geo = G.merge([body, tail]);
    FISH_N = 0; SCHOOLS.forEach(function (s) { FISH_N += s.n; });
    fishMesh = new THREE.InstancedMesh(geo, H.M.solidDS.mat, FISH_N);
    fishMesh.castShadow = false; fishMesh.receiveShadow = true; fishMesh.frustumCulled = false; fishMesh.name = 'fish';
    scene.add(fishMesh);
  }
  function resetFish(mode, rng) {
    schools = SCHOOLS.map(function (d, si) {
      var fish = [];
      for (var i = 0; i < d.n; i++) fish.push({ ox: (rng() - 0.5) * 2, oy: (rng() - 0.5) * 2, oz: (rng() - 0.5) * 2, ph: rng() * 6.28, sp: 0.8 + rng() * 0.5, sc: 0.75 + rng() * 0.5, px: 0, py: 0, pz: 0, yaw: 0, init: false, fx: 0, fy: 0, fz: 0 });
      return { d: d, fish: fish, ph: rng() * 6.28, scatter: 0, cool: 0, lastD: 99, away: 0, cx: d.c[0], cy: d.c[1], cz: d.c[2] };
    });
  }
  function updateFish(dt, t, rng) {
    var cam = H.camPos;
    schools.forEach(function (sc, si) {
      var d = sc.d, a = t * d.sp + sc.ph;
      sc.cx = d.c[0] + Math.sin(a) * d.r[0]; sc.cy = d.c[1] + Math.sin(a * 0.7 + 1) * d.r[1]; sc.cz = d.c[2] + Math.sin(a * 0.63 + 2.0) * d.r[2];
      var dist = Math.hypot(cam.x - sc.cx, cam.y - sc.cy, cam.z - sc.cz);
      sc.cool -= dt;
      if (dist < 11.8 && dist < sc.lastD - 0.003 && sc.cool <= 0) { sc.scatter = 1; sc.cool = 9; sc.away = Math.atan2(sc.cx - cam.x, sc.cz - cam.z); }
      sc.lastD = dist;
      sc.scatter += (0 - sc.scatter) * Math.min(1, dt * 0.38);
      for (var i = 0; i < sc.fish.length; i++) {
        var f = sc.fish[i], sp = 1.1 * f.sp;
        var w = t * sp + f.ph;
        var spread = d.s * (0.75 + sc.scatter * 3.4);
        var tx = sc.cx + (f.ox * 0.9 + Math.sin(w) * 0.5) * spread + Math.sin(sc.away + f.ox * 1.4) * sc.scatter * 2.2;
        var ty = sc.cy + (f.oy * 0.35 + Math.sin(w * 1.3) * 0.12) * (1 + sc.scatter * 1.2);
        var tz = sc.cz + (f.oz * 0.9 + Math.cos(w * 0.8) * 0.5) * spread + Math.cos(sc.away + f.oz * 1.4) * sc.scatter * 2.2;
        ty = Math.min(-0.5, Math.max(H.seabedY(tx, tz) + 0.35, ty));
        if (!f.init) { f.px = tx; f.py = ty; f.pz = tz; f.init = true; }
        var k = Math.min(1, dt * (1.6 + sc.scatter * 5));
        var nx = f.px + (tx - f.px) * k, ny = f.py + (ty - f.py) * k, nzz = f.pz + (tz - f.pz) * k;
        var vx = nx - f.px, vz = nzz - f.pz;
        if (vx * vx + vz * vz > 1e-8) { var wy = Math.atan2(vx, vz); f.yaw += angDiff(wy, f.yaw) * Math.min(1, dt * 6); }
        f.px = nx; f.py = ny; f.pz = nzz;
      }
    });
  }
  function presentFish(t) {
    var n = 0;
    schools.forEach(function (sc) {
      for (var i = 0; i < sc.fish.length; i++) {
        var f = sc.fish[i];
        _e.set(0, f.yaw + Math.sin(t * (7 + sc.scatter * 9) * f.sp + f.ph) * 0.22, 0, 'YXZ'); _q.setFromEuler(_e);
        _v.set(f.px, f.py, f.pz); _s.setScalar(f.sc * sc.d.s);
        _m.compose(_v, _q, _s); fishMesh.setMatrixAt(n++, _m);
      }
    });
    fishMesh.instanceMatrix.needsUpdate = true;
  }

  // =========================================================================== build + system
  H.buildCreatures = function (scene) {
    buildPerches();
    for (var i = 0; i < GULL_N; i++) gulls.push(makeGull(scene, i));
    H.GULLS = gulls;
    cat = H.CAT = makeCat(scene);
    makeFish(scene);
    var rng = H.mulberry(1);
    H.addSystem({
      reset: function (mode) {
        rng = H.mulberry(mode === 'tour' ? 424242 : (Date.now() & 0xffff) + 17);
        resetGulls(mode, rng); resetCat(mode, rng); resetFish(mode, rng);
      },
      update: function (dt, t) {
        for (var i = 0; i < gulls.length; i++) updateGull(gulls[i], dt, t, rng);
        updateCat(dt, t, rng); updateFish(dt, t, rng);
      },
      present: function (t) {
        for (var i = 0; i < gulls.length; i++) presentGull(gulls[i]);
        presentCat(t); presentFish(t);
      }
    });
  };
})();
