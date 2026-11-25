'use strict';
/* ==========================================================================
   Tour (camera sequence) + window.videoExport
   ========================================================================== */
(function () {
  const P = window.P;
  const v3 = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const T = (P.Tour = {});
  const lerp3 = (a, b, u, out) => out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
  const clamp = P.clamp, sm = P.smooth;

  // event schedule (tour seconds)
  T.sched = { fountain: [8.0], wave: [8.8], vertical: [37.6], race: [49.4], bucket: [75.2] };

  let shots = [];
  T.duration = 94;

  // find tau at which a track reaches the point nearest (x,y,z)
  function tauNear(tr, x, y, z) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < tr.n; i += 2) { const p = tr.p[i]; const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return tr.tau[bi];
  }

  T.init = function () {
    const D = P.Dyn;
    const rides = D.rides;
    const byName = (n) => rides.find((r) => r.track && P.slides.find((s) => s.track === r.track && s.name === n));
    // ride offsets for the tour (launch times so that action happens on camera)
    const helixR = byName('helixA');
    const hx = P.helixAxis;
    const tauHelix = tauNear(helixR.track, hx.x + hx.R, hx.y0, hx.z);
    helixR.tourOffset = 32.4 - tauHelix;
    const loopR = byName('loop');
    const tauLoop = tauNear(loopR.track, P.loop.x, P.loop.y - 4.2, P.loop.z);
    loopR.tourOffset = 46.6 - tauLoop;
    const bowlR = rides.find((r) => r.kind === 'bowl');
    bowlR.tourOffset = 59.2 - bowlR.tracks[0].T_total;
    const coastR = byName('coaster');
    const j0 = P.coaster.jets[0];
    const tauJ = coastR.track.tau[Math.round((j0[0] + 2) / coastR.track.ds)];
    coastR.tourOffset = 67.6 - tauJ;
    const famR = byName('family');
    famR.tourOffset = 3.0;
    T.coasterJet = j0; T.coastR = coastR;
    // river: lead tube of group 0 at curtain - 6 m when shot 4 starts
    const cq = P.river.nearest(P.curtain.x + 0.2, -54, 10);
    T.sCurtain = cq.s;
    // group 0 lead tube (j = 3) base s0
    const s0 = 0 * P.river.len + 3 * 3.4 + D.hash(0, 3) * 1.2;
    const want = T.sCurtain - 6.5; // at t = 23.5
    D.tourRiverOffset = want - s0 - 1.2 * 23.5;
    buildShots();
  };

  function buildShots() {
    const D = P.Dyn;
    shots = [];
    const add = (t0, t1, fn) => shots.push({ t0, t1, fn });
    const tmpA = v3(), tmpB = v3();
    // 1. from above the bay over the coconut grove — park unfolds.
    //    Starts at the distance where the whole park just fills the frame, already moving,
    //    then pushes in at constant speed along the original approach heading (WNW, gently
    //    descending); the view direction stays fixed (pure dolly), so the layout spreads open.
    const OPEN_DIR = v3(-378, -42, -134).normalize();
    const OPEN_P0 = v3(282, 104, 65), OPEN_L0 = v3(121, 6, 8), OPEN_S = 168;
    add(0, 9.0, (u, cam) => {
      cam.position.copy(OPEN_P0).addScaledVector(OPEN_DIR, OPEN_S * u);
      tmpA.copy(OPEN_L0).addScaledVector(OPEN_DIR, OPEN_S * u);
      cam.lookAt(tmpA);
      // keep the horizontal coverage of a 16:9 frame on narrower aspect ratios
      const a = cam.aspect || 16 / 9;
      return a < 16 / 9 ? 2 * Math.atan(Math.tan(23 * Math.PI / 180) * (16 / 9) / a) * 180 / Math.PI : 46;
    });
    // 2. through the gate arch, fountain show slides by
    add(9.0, 16.6, (u, cam) => {
      lerp3([3.0, 4.1, 140], [6.2, 4.7, 93], u, cam.position);
      lerp3([1, 6, -40], [-2, 8, -70], u, tmpA);
      cam.lookAt(tmpA); return 52;
    });
    // 3. skimming the wave pool, waves rolling in
    add(16.6, 23.5, (u, cam) => {
      lerp3([-4, 1.15, 31], [-4.5, 1.35, 5], u, cam.position);
      lerp3([-3, 0.9, -40], [-4, 1.4, -60], u, tmpA);
      cam.lookAt(tmpA); return 54;
    });
    // 4. follow tubes on the lazy river through the curtain into the glowing tunnel
    add(23.5, 32.0, (u, cam, t) => {
      const sLead = T.sCurtain - 6.5 + 1.2 * (t - 23.5);
      const pc = P.river.at(sLead - 5.0), pl = P.river.at(sLead + 7);
      cam.position.set(pc.x + pc.tz * 0.4, P.L.river.level + 2.05, pc.z - pc.tx * 0.4);
      cam.lookAt(pl.x, P.L.river.level + 0.9, pl.z); return 58;
    });
    // 5. double helix: crane down beside the helix following a tube
    add(32.0, 38.0, (u, cam, t) => {
      const hx = P.helixAxis;
      const y = hx.y0 + 3.0 - u * 10.5;
      const a = 0.95 + u * 0.22;
      cam.position.set(hx.x + Math.cos(a) * 17.5, y, hx.z + Math.sin(a) * 17.5);
      cam.lookAt(hx.x, y - 4.2, hx.z); return 44;
    });
    // 6. vertical drop capsule: trapdoor opens, tube plunges (crane down)
    add(38.0, 44.6, (u, cam, t) => {
      const c = P.capsule;
      // medium shot from south-west, capsule silhouetted against the sky; crane down with the drop
      // low angle from the south-west: capsule against the sky, tower behind to the right; tilt down with the drop
      lerp3([c.x - 13.5, c.y - 7.5, c.z + 17.5], [c.x - 14.5, c.y - 10.5, c.z + 18.5], u, cam.position);
      const e = t - (37.6 + 5.0);
      const drop = e > 0 ? Math.min(15, 0.5 * 9.81 * e * e) : 0;
      tmpA.set(c.x, c.y + 1.4 - drop * 0.75, c.z);
      cam.lookAt(tmpA); return 48;
    });
    // 7. loop slide: slow push toward the transparent loop
    add(44.6, 50.6, (u, cam) => {
      const L = P.loop;
      lerp3([L.x - 2, L.y + 1.0, L.z + 20], [L.x - 1, L.y + 0.4, L.z + 14.5], u, cam.position);
      tmpA.set(L.x, L.y - 0.4, L.z + 1.2);
      cam.lookAt(tmpA); return 50;
    });
    // 8. rainbow racer: tracking alongside the lanes to the finish
    // precompute smoothed plan-distance of the lead mat over time (for a following camera)
    const rd0 = P.racer, lane0 = P.racer.lanes[2].track;
    const raceStart = T.sched.race[0] + 3.0;
    const dAt = (t) => {
      const tau = t - raceStart;
      if (tau <= 0) return 0;
      const fi = P.trackIndexAt(lane0, Math.min(tau, lane0.T_total));
      const p = lane0.p[Math.max(0, Math.min(lane0.n - 1, Math.round(fi)))];
      return (p.x - 4.9) * rd0.dx + (p.z + 90.6) * rd0.dz;
    };
    const dSm = (t) => { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { s += dAt(t + k * 0.09); n++; } return s / n; };
    const smax = (a, b, k) => Math.log(Math.exp(k * a) + Math.exp(k * b)) / k;
    add(50.6, 60.0, (u, cam, t) => {
      const rd = P.racer;
      const px = rd.dz, pz = -rd.dx;
      const d = Math.min(56, smax(2.5 + 1.1 * (t - 50.6), dSm(t) + 1.5, 0.9));
      const x0 = 4.9, z0 = -90.6;
      const lane = P.racer.lanes[2].track;
      // height of the lanes near d
      const lx = x0 + rd.dx * d, lz = z0 + rd.dz * d;
      let ly = 0;
      { let bi = 0, bd = 1e9; for (let i = 0; i < lane.n; i += 4) { const p = lane.p[i]; const dd = (p.x - lx) ** 2 + (p.z - lz) ** 2; if (dd < bd) { bd = dd; bi = i; } } ly = lane.p[bi].y; }
      T._ly = T._ly == null ? ly : ly; // deterministic
      cam.position.set(lx + px * 8.0, Math.max(ly, 2) + 3.4 + (1 - u) * 1.2, lz + pz * 8.0);
      cam.lookAt(lx + rd.dx * 0.5 - px * 0.5, Math.max(ly, 1) - 0.6, lz + rd.dz * 0.5 - pz * 0.5); return 54;
    });
    // 9. giant bowl: slow orbit, tube spinning faster and faster
    add(60.0, 66.0, (u, cam) => {
      const b = P.bowl;
      const a = 0.35 + u * 0.4;
      cam.position.set(b.x + Math.sin(a) * 15.5, b.yb + 11.0, b.z + Math.cos(a) * 15.5);
      cam.lookAt(b.x, b.yb + 1.2, b.z); return 50;
    });
    // 10. water coaster: raft pushed uphill by jets then plunges (lateral follow)
    add(66.0, 73.0, (u, cam, t) => {
      const r = T.coastR, tr = r.track;
      const tau = t - r.tourOffset;
      const fi = P.trackIndexAt(tr, Math.max(0, Math.min(tr.T_total, tau)));
      const i = Math.max(0, Math.min(tr.n - 1, Math.round(fi)));
      // smoothed anchor: average of nearby samples
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let k = -40; k <= 40; k += 8) { const p = tr.p[Math.max(0, Math.min(tr.n - 1, i + k))]; ax += p.x; ay += p.y; az += p.z; n++; }
      ax /= n; ay /= n; az /= n;
      cam.position.set(ax + 10.5, ay + 7.5, az + 8.0);
      cam.lookAt(ax - 0.5, ay - 0.6, az - 0.5); return 50;
    });
    // 11. kids castle: giant bucket tips, water pours down the levels
    add(73.0, 80.0, (u, cam) => {
      const b = P.bucket;
      lerp3([b.x + 15.5, b.pivotY + 1.5, b.z + 18.5], [b.x + 11.0, b.pivotY - 0.2, b.z + 14.0], u, cam.position);
      tmpA.set(b.x, b.pivotY - 3.2, b.z + 1.2);
      cam.lookAt(tmpA); return 50;
    });
    // 12. lateral track past the activity pool's lily pads under the net
    add(80.0, 85.6, (u, cam) => {
      const a = P.L.act;
      lerp3([a.cx - 20, 4.6, a.cz + 19], [a.cx + 6, 4.6, a.cz + 19], u, cam.position);
      lerp3([a.cx - 14, 0.5, a.cz + 4], [a.cx + 12, 0.5, a.cz + 4], u, tmpA);
      cam.lookAt(tmpA); return 50;
    });
    // 13. from the top of Sky Tower: slides spread like ribbons — slow rise, settle
    add(85.6, 94.0, (u, cam) => {
      const k = 1 - Math.pow(1 - u, 2.2);
      lerp3([0.5, 43.4, -88.4], [0.5, 58, -80], k, cam.position);
      lerp3([2, 2, -30], [0, 0, -6], k, tmpA);
      cam.lookAt(tmpA); return 56;
    });
  }

  T.apply = function (t, cam) {
    let s = shots[shots.length - 1];
    for (const sh of shots) if (t >= sh.t0 && t < sh.t1) { s = sh; break; }
    const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
    cam.up.set(0, 1, 0);
    const fov = s.fn(u, cam, t);
    cam.fov = fov || 50;
    const gy = P.groundY(cam.position.x, cam.position.z);
    if (cam.position.y < gy + 0.6) cam.position.y = gy + 0.6;
    P.Cam.nearHint = clamp(0.12 + (cam.position.y - gy) * 0.004, 0.1, 1.0);
  };

  /* ------------------------------------------------------------ video export API */
  let fps = 60;
  const raf = () => new Promise((res) => { let done = false; const f = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
  function enterExport() {
    P.exportMode = true;
    const ld = document.getElementById('loader');
    if (ld) ld.style.display = 'none';
    const er = document.getElementById('err');
    if (er) er.style.display = 'none';
    P.Dyn.tourSched = T.sched;
    if (P.Cam.setUIVisible) P.Cam.setUIVisible(false);
    if (P.resize) P.resize();
  }
  function renderTour(t, dt) {
    if (P.resize) P.resize();
    T.apply(t, P.camera);
    P.renderAt(t, dt, true);
  }
  window.videoExport = {
    runs: ['tour'],
    begin: async function (runId, opts) {
      await P.readyPromise;
      if (runId !== 'tour') throw new Error('unknown run: ' + runId);
      fps = (opts && opts.fps) || 60;
      enterExport();
      renderTour(0, 1 / fps);
      await raf();
      renderTour(0, 1 / fps);
      await raf();
      return { frames: Math.round(T.duration * fps) };
    },
    frame: async function (i) {
      const t = i / fps;
      renderTour(t, 1 / fps);
      await raf();
    },
    end: function () {
      P.exportMode = false;
      P.Dyn.tourSched = null;
      if (P.Cam.setUIVisible) P.Cam.setUIVisible(true);
      if (P.resize) P.resize();
      P.clockStart = performance.now();
      P.liveOffset = 6;
      P.Cam.go(P.Cam.current, true);
    },
  };
  // optional: preview tour in the browser with ?tour
  T.preview = function () {
    enterExport();
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > T.duration || !P.exportMode) { window.videoExport.end(); return; }
      renderTour(t, 1 / 60);
      requestAnimationFrame(step);
    };
    step();
  };
})();
