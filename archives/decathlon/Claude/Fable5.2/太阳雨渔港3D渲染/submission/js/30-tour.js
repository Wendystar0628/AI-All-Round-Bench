/* built-in camera tour + the fixed window.videoExport interface (deterministic, frame-stepped) */
(function () {
  'use strict';
  var H = window.H, L = H.L, QY = L.QUAY_Y;

  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // gentle ease: mostly steady drift with soft ends
  function ez(t, k) { k = k === undefined ? 0.55 : k; var s = t * t * (3 - 2 * t); return t * (1 - k) + s * k; }
  // quadratic bezier through a control point (for arcing moves)
  function bez(a, c, b, t) { var u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; }

  var SHOTS = [];
  function shot(dur, near, fn) { var t0 = SHOTS.length ? SHOTS[SHOTS.length - 1].t1 : 0; SHOTS.push({ t0: t0, t1: t0 + dur, near: near, fn: fn }); }

  H.setupTour = function () {
    var B = H.boatById.B, A = H.boatById.A;
    var gullP = [H.BOLLARDS[6].x, H.BOLLARDS[6].y + 0.3, H.BOLLARDS[6].z];
    var catP = [H.SAMPAN.x + 0.4, H.SAMPAN.y + 0.2, H.SAMPAN.z];
    var W = H.WAREHOUSE, R = H.WAITROOM;

    // 1 — wide: from high outside the harbour, easing in towards the L-shaped quay while a cloud shadow crosses
    shot(7.5, 1.2, function (u) {
      var e = ez(u, 0.5);
      return { p: mix([-86, 54, 58], [-58, 33, 47], e), l: mix([-2, 0, -4], [0, 0.5, 0], e), fov: 30 };
    });
    // 2 — medium: tracking along the quay past the berthed boats and the buoys
    shot(5.5, 0.3, function (u) {
      var e = ez(u, 0.4);
      return { p: mix([-15.5, 5.4, 21.5], [5.5, 5.0, 21.0], e), l: mix([-9.5, 1.2, 7.5], [8.0, 1.0, 7.0], e), fov: 34 };
    });
    // 3 — close: the gull on the bollard; the push-in sends it flapping away
    shot(4.5, 0.08, function (u) {
      var e = ez(u, 0.35);
      var g = H.GULLS && H.GULLS[0] ? H.GULLS[0].pos : null;
      var look = [gullP[0], gullP[1], gullP[2]];
      if (g && u > 0.4) { var k = Math.min(1, (u - 0.4) / 0.6) * 0.16; look = mix(look, [g.x, Math.min(g.y, gullP[1] + 3.0), g.z], k); }
      return { p: mix([gullP[0] + 4.9, 3.45, gullP[2] + 5.3], [gullP[0] + 1.75, 2.86, gullP[2] + 1.85], e), l: look, fov: 26 };
    });
    // 4 — medium: the umbrella on the steps, the two instrument cases, then the puddle mirroring lamp post and boats
    shot(5.5, 0.1, function (u) {
      var e = ez(u, 0.7);
      return { p: mix([-22.6, 4.1, 17.4], [-18.2, 2.75, 19.2], e), l: mix([-18.9, 1.1, 11.9], [-10.6, 1.45, 14.6], e), fov: 34 };
    });
    // 5 — close: the harbour cat under the upturned sampan lifts its head
    shot(4.5, 0.05, function (u) {
      var e = ez(u, 0.5);
      return { p: mix([catP[0] + 4.3, catP[1] + 1.25, catP[2] + 2.5], [catP[0] + 2.45, catP[1] + 0.5, catP[2] + 1.2], e), l: [catP[0] - 0.25, catP[1] + 0.05, catP[2] - 0.1], fov: 27 };
    });
    // 6 — medium: a gust arrives from the sea; float strings, nets, wind-sock and pennants answer one after another
    shot(6.2, 0.2, function (u) {
      var e = ez(u, 0.4);
      return { p: mix([18.6, 4.9, 33.5], [16.4, 4.5, 31.6], e), l: mix([5.0, 2.6, 16.0], [5.6, 2.9, 17.0], e), fov: 36 };
    });
    // 7 — close: through the wheelhouse glass towards radar, chart and thermos
    shot(5.5, 0.04, function (u) {
      var e = ez(u, 0.5);
      var g = A.group.position, y = A.info.cabin.y + (A.heaveT || 0);
      // boat A lies bow-north: cabin centre at world z = g.z - cabin.z ; the dash is on its north side
      var cz = g.z - A.info.cabin.z, cx = g.x;
      return { p: mix([cx - 1.2, y + 1.78, cz + 3.5], [cx - 0.72, y + 1.5, cz + 1.72], e), l: mix([cx + 0.22, y + 1.05, cz - 0.9], [cx + 0.3, y + 1.0, cz - 0.9], e), fov: 34 };
    });
    // 8 — medium: along the apron past the half-raised shutter, into the warehouse with its shafts of light
    shot(6.0, 0.1, function (u) {
      var e = ez(u, 0.4);
      return { p: mix([15.9, 2.95, 2.6], [17.3, 2.75, -6.9], e), l: mix([24.0, 2.9, -2.6], [27.5, 3.05, -6.8], e), fov: 38 };
    });
    // 9 — medium: the lighthouse on the breakwater head, foam working between the tetrapods;
    //     the rain has just eased and a very faint rainbow stands over the sea behind it
    shot(4.5, 0.2, function (u) {
      var e = ez(u, 0.4);
      return { p: mix([-23.5, 2.6, -2.6], [-21.8, 4.2, -3.4], e), l: mix([-10.9, 3.3, -13.4], [-10.7, 4.0, -13.4], e), fov: 36 };
    });
    // 10 — medium: sliding along the waiting room's glass front
    shot(5.0, 0.1, function (u) {
      var e = ez(u, 0.4);
      return { p: mix([R.x0 - 0.6, R.y + 1.75, R.z1 + 4.6], [R.x1 - 1.6, R.y + 1.7, R.z1 + 4.2], e), l: mix([R.x0 + 1.6, R.y + 1.25, R.z0 + 2.6], [R.x1 - 1.0, R.y + 1.45, R.z0 + 1.5], e), fov: 36 };
    });
    // 11 — medium: sinking down the cut face of the base: quay wall section, sea bed, fish
    //      (above the waterline the white boat is casting off)
    shot(5.5, 0.2, function (u) {
      var e = ez(u, 0.6);
      return { p: bez([-47, 4.4, 9.5], [-45, 0.5, 7.5], [-37.4, -2.2, 4.4], e), l: mix([-30, 0.6, 6.5], [-27.0, -2.6, 2.4], e), fov: 34 };
    });
    // 12 — wide: following the white boat out of the harbour, rising to take in its wake
    shot(8.0, 0.5, function (u) {
      var e = ez(u, 0.5);
      var bp = B.group.position, hx = Math.sin(B.ry), hz = Math.cos(B.ry);
      // start low over the quay astern of her, then climb and pull back so the whole wake lies in frame
      var p = bez([-1.5, 9.0, 16.5], [3.0, 16.0, 21.0], [6.5, 33.0, 23.0], e);
      var lk = mix([bp.x, 0.8, bp.z], [bp.x * 0.62 - 2.0, 0.0, bp.z * 0.62 + 1.0], e * 0.75);
      return { p: p, l: lk, fov: 32 };
    });
    H.TOUR_DUR = SHOTS[SHOTS.length - 1].t1;
  };

  var _look = new THREE.Vector3();
  var smooth = { on: false, p: new THREE.Vector3(), l: new THREE.Vector3() };
  function applyTour(t) {
    var cam = H.camera, s = SHOTS[SHOTS.length - 1], i;
    for (i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].t1) { s = SHOTS[i]; break; }
    var u = H.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
    var c = s.fn(u, t);
    cam.position.set(c.p[0], c.p[1], c.p[2]);
    cam.up.set(0, 1, 0);
    _look.set(c.l[0], c.l[1], c.l[2]);
    cam.lookAt(_look);
    if (cam.fov !== c.fov || cam.near !== s.near) { cam.fov = c.fov; cam.near = s.near; cam.far = 620; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
  H.applyTour = applyTour;

  // ------------------------------------------------------------------ export interface
  var ex = { fps: 60, frames: 0, steps: 0, cur: -1, active: false, saved: null };
  function nextPaint() {
    return new Promise(function (res) {
      var done = false;
      function fin() { if (!done) { done = true; res(); } }
      requestAnimationFrame(function () { requestAnimationFrame(fin); });
      setTimeout(fin, 120);
    });
  }
  function beginRun(fps) {
    var C = H.Controls;
    if (!ex.active) ex.saved = { t: C.gTarget.clone(), th: C.gTheta, ph: C.gPhi, d: C.gDist, fov: H.camera.fov };
    ex.active = true; H.exporting = true; C.enabled = false;
    ex.fps = fps; ex.frames = Math.round(H.TOUR_DUR * fps); ex.steps = 0; ex.cur = -1;
    H.Render.resize(false);
    H.Sim.reset('tour');
    applyTour(0);
    H.Sim.present();
  }
  function advanceTo(i) {
    var target = Math.round(i * 60 / ex.fps);
    while (ex.steps < target) {
      // the camera is part of the world the creatures react to: keep it in step with the simulation
      applyTour(ex.steps / 60);
      H.Sim.step(); ex.steps++;
      H.Sim.present();
    }
  }
  window.videoExport = {
    runs: ['tour'],
    begin: function (runId, opts) {
      return new Promise(function (resolve, reject) {
        if (runId !== 'tour') { reject(new Error('unknown run: ' + runId)); return; }
        var fps = (opts && opts.fps) ? Number(opts.fps) : 60;
        if (!(fps > 0)) fps = 60;
        beginRun(fps);
        resolve({ frames: ex.frames });
      });
    },
    frame: function (i) {
      if (!ex.active) beginRun(60);
      i = Math.max(0, Math.round(i));
      if (i < ex.cur) beginRun(ex.fps);          // stepping backwards: replay from the start
      H.Render.resize(false);
      advanceTo(i);
      ex.cur = i;
      applyTour(i / ex.fps);
      H.Sim.present();
      H.Render.frame();
      return nextPaint();
    },
    end: function () {
      if (!ex.active) return;
      ex.active = false; H.exporting = false;
      var C = H.Controls, s = ex.saved;
      H.camera.fov = s.fov; H.camera.updateProjectionMatrix();
      C.gTarget.copy(s.t); C.gTheta = s.th; C.gPhi = s.ph; C.gDist = s.d; C.snap(); C.enabled = true;
      H.Sim.reset('free');
    }
  };
})();
