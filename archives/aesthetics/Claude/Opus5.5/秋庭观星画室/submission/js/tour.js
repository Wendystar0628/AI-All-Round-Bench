/* scripted camera tour + video export interface */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, L = W.L;
  const tour = (W.tour = {});
  const PI = Math.PI;
  const v = (a) => new V3(a[0], a[1], a[2]);

  // shot helpers -------------------------------------------------------
  // A shot is a pure camera path geo(e, t) -> {p, t, fov} with e running 0..1 along it. How fast e
  // advances is decided by the pacing below, never by the path itself.
  const lin = (a, b, e) => v(a).lerp(v(b), e);
  // zoom at a constant perceived rate: the image scale changes by the same factor for equal steps of e
  const zoom = (f0, f1, e) => {
    if (f1 === undefined || f1 === f0) return f0;
    const a = Math.tan(f0 * PI / 360), b = Math.tan(f1 * PI / 360);
    return Math.atan(a * Math.pow(b / a, e)) * 360 / PI;
  };
  function move(p0, p1, t0, t1, f0, f1) { return (e) => ({ p: lin(p0, p1, e), t: lin(t0, t1, e), fov: zoom(f0, f1, e) }); }
  function path(ps, ts, f0, f1) {
    const cp = new THREE.CatmullRomCurve3(ps.map(v), false, 'centripetal');
    const ct = new THREE.CatmullRomCurve3(ts.map(v), false, 'centripetal');
    return (e) => ({ p: cp.getPointAt(e), t: ct.getPointAt(e), fov: zoom(f0, f1, e) });
  }
  // the same straight move stretched around its middle frame (|A| > 1) and/or played backwards (A < 0);
  // the lens keeps its own range (Af, default A)
  const around = (geo, A, Af) => (e, t) => { const c = geo(0.5 + (e - 0.5) * A, t); if (Af !== undefined) c.fov = geo(0.5 + (e - 0.5) * Af, t).fov; return c; };
  function slerpDir(a, b, g) {
    const th = Math.acos(W.clamp(a.dot(b), -1, 1));
    if (th < 1e-5) return a.clone();
    const s = Math.sin(th);
    return a.clone().multiplyScalar(Math.sin((1 - g) * th) / s).addScaledVector(b, Math.sin(g * th) / s);
  }

  // ---- pacing -----------------------------------------------------------------------------------
  // How much the picture moves between two camera states: the median on-screen shift (in half
  // frame-heights) of a grid of points spread through the view around the look-at depth. Summed along
  // a path it measures how much a shot moves the image; pacing every shot on it keeps the on-screen
  // speed even inside a shot (a push slows in metres as it nears its subject, so it does not seem to
  // rush at the end) and lets each shot hand its speed to the next one across the cut.
  const UP = new V3(0, 1, 0), ASPECT = 16 / 9;
  const _q = new V3(), _w = new V3();
  function viewOf(c, depth) {
    const f = c.t.clone().sub(c.p), L0 = f.length(), D = depth || L0;
    f.multiplyScalar(1 / L0);
    const r = new V3().crossVectors(f, UP).normalize(), u = new V3().crossVectors(r, f);
    return { p: c.p, f, r, u, th: Math.tan(c.fov * PI / 360), D };
  }
  function screenShift(c0, c1, depth) {
    const a = viewOf(c0, depth), b = viewOf(c1, depth), m = [];
    for (const xn of [-0.75, -0.25, 0.25, 0.75]) for (const yn of [-0.6, 0, 0.6]) for (const df of [0.6, 1, 1.7]) {
      _w.copy(a.f).addScaledVector(a.r, xn * a.th * ASPECT).addScaledVector(a.u, yn * a.th).multiplyScalar(a.D * df).add(a.p);
      _q.copy(_w).sub(b.p);
      const z = _q.dot(b.f);
      m.push(Math.hypot((_q.dot(b.r) / (z * b.th * ASPECT) - xn) * ASPECT, _q.dot(b.u) / (z * b.th) - yn));
    }
    m.sort((x, y) => x - y);
    return m[m.length >> 1];
  }
  tour.screenShift = screenShift;
  // tabulate a shot's on-screen motion along its path: F = shift per unit of e, Phi = total
  function measure(s) {
    const N = 96, h = 1 / 2048, F = new Float64Array(N + 1);
    for (let j = 0; j <= N; j++) { const e = Math.min(j / N, 1 - h); F[j] = Math.max(1e-4, screenShift(s.geo(e, 0), s.geo(e + h, 0), s.depth) / h); }
    const G = F.map((x, j) => 0.25 * F[Math.max(0, j - 1)] + 0.5 * x + 0.25 * F[Math.min(N, j + 1)]);
    const cum = new Float64Array(N + 1);
    for (let j = 1; j <= N; j++) cum[j] = cum[j - 1] + 0.5 * (G[j - 1] + G[j]) / N;
    s.F = G; s.cum = cum; s.Phi = cum[N];
  }
  // path parameter reached once the fraction m of the shot's on-screen motion has played
  function eAt(s, m) {
    const c = s.cum, N = c.length - 1, need = W.clamp(m, 0, 1) * s.Phi;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= need) lo = mid; else hi = mid; }
    const f0 = s.F[lo], f1 = s.F[hi], w = 1 / N, r = need - c[lo], qa = (f1 - f0) / (2 * w);
    const x = Math.abs(qa) < 1e-9 ? r / f0 : (-f0 + Math.sqrt(Math.max(0, f0 * f0 + 4 * qa * r))) / (2 * qa);
    return Math.min(1, (lo + W.clamp(x / w, 0, 1)) / N);
  }
  // speed curves: each shot lists keys [k, v] — shot time k (0..1) and on-screen speed v (half
  // frame-heights per second). A monotone cubic runs through the keys, so speed changes smoothly with
  // no overshoot; the shot lasts exactly as long as its path needs at those speeds.
  function curve(keys) {
    const n = keys.length, K = keys.map((q) => q[0]), V = keys.map((q) => q[1]);
    const dk = [], sl = [];
    for (let i = 0; i < n - 1; i++) { dk.push(K[i + 1] - K[i]); sl.push((V[i + 1] - V[i]) / dk[i]); }
    const m = new Array(n);
    m[0] = sl[0]; m[n - 1] = sl[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (3 * (dk[i - 1] + dk[i])) / ((2 * dk[i] + dk[i - 1]) / sl[i - 1] + (dk[i] + 2 * dk[i - 1]) / sl[i]);
    for (let i = 0; i < n - 1; i++) {
      if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const al = m[i] / sl[i], be = m[i + 1] / sl[i], h = al * al + be * be;
      if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * al * sl[i]; m[i + 1] = t * be * sl[i]; }
    }
    return (k) => {
      let i = 0; while (i < n - 2 && k > K[i + 1]) i++;
      const h = dk[i], t = W.clamp((k - K[i]) / h, 0, 1), t2 = t * t, t3 = t2 * t;
      return Math.max(0, (2 * t3 - 3 * t2 + 1) * V[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * V[i + 1] + (t3 - t2) * h * m[i + 1]);
    };
  }
  // tabulate a shot's speed curve: cumulative fraction of its motion against shot time
  function timing(s) {
    const v = curve(s.keys), N = 512, cum = new Float64Array(N + 1);
    let prev = v(0);
    for (let j = 1; j <= N; j++) { const cur = v(j / N); cum[j] = cum[j - 1] + 0.5 * (prev + cur) / N; prev = cur; }
    s.speed = v; s.mcum = cum; s.I = cum[N];
    s.d = s.Phi / s.I;
  }
  function shotM(s, k) {
    const N = s.mcum.length - 1, x = W.clamp(k, 0, 1) * N, j = Math.min(N - 1, Math.floor(x));
    return (s.mcum[j] + (s.mcum[j + 1] - s.mcum[j]) * (x - j)) / s.I;
  }
  const shotE = (s, k) => eAt(s, shotM(s, k));
  tour.shotE = shotE;

  let SHOTS = [], START = [], TOTAL = 0, EVT = {};
  const LEAF_U0 = 0.2; // the leaf enters the shot at the bamboo spout (a trailing camera any higher would sit in the terrace wall)
  function defineShots() {
    const oc = W.orreryCenter;
    const SX = L.SANDO_X, P = W.pondInfo;
    const bis = new V3(Math.cos((P.TH1 + P.TH2) / 2), 0, Math.sin((P.TH1 + P.TH2) / 2));
    const pondC = new V3(P.CX, 0.0, P.CZ);
    const wedge = new V3(P.CX, -0.1, P.CZ).addScaledVector(bis, 3.4); // the lifted tart wedge resting on the cake server
    const LB0 = Math.tan(54 * PI / 360), LB1 = Math.tan(10 * PI / 360), LBT = new V3(-1.5, 0.9, 7.0);
    const leafAt = (e) => L.streamCurve.getPointAt(LEAF_U0 + (1 - LEAF_U0) * W.clamp(e, 0, 1));
    // the whole base, framed so that it just fits: the tour opens on it and the finale settles back on it
    const HOME_T = new V3(-0.4, 1.5, 0.3), HOME_D = 54, HOME_P = 0.56;
    const HOME = HOME_T.clone().add(new V3(0, Math.sin(HOME_P) * HOME_D, Math.cos(HOME_P) * HOME_D));
    // 15 shots in four movements: the shrine (wide -> close), the water (stream -> pond -> detail ->
    // section), the studio (a look across the garden into it, then roof -> engawa -> inside -> orrery,
    // the heaviest shot, -> tea), and the close (cloud -> door view -> a half turn back to the whole base).
    // Each shot has one main motion and, apart from four, runs it at one steady on-screen speed (a push
    // toward a subject therefore eases off in metres as it gets close, without braking on screen). The
    // rhythm comes from shot to shot: slow detail shots, quicker travelling ones, wide shots given time,
    // neighbouring speeds kept close at each cut. Only four shots change speed, each for a reason in
    // the picture: the opening is moving on its first frame and reaches its pace at once, the leaf slows
    // as the current dies into the pond, the camera eases off once through the sliding doors to look at
    // the painting and the orrery, and the finale settles to a stop on the whole base.
    SHOTS = [
      // 全景, wide: already moving on the first frame — the whole base, low sun, light shafts, falling
      // leaves — and at its steady pace within half a second, pushing in toward the torii
      { name: 'push', keys: [[0, 0.2], [0.08, 0.28], [1, 0.28]],
        geo: move(HOME.toArray(), [7.5, 9.0, 27.5], HOME_T.toArray(), [8.5, 1.5, 13.0], 34, 36) },
      // medium: through the torii and up the stairs past lanterns, higanbana and paper lanterns, arriving
      // at the shimenawa, bell rope and komainu
      { name: 'thruTorii', keys: [[0, 0.4], [1, 0.4]],
        geo: path([[SX, 1.9, 19.6], [SX, 2.15, 13.6], [SX, 2.8, 8.0], [SX, 4.1, 3.0], [SX, 4.75, -2.0], [SX, 4.85, -5.4]], [[SX, 2.7, 9.0], [SX, 3.1, 4.0], [SX, 4.4, -1.5], [SX, 5.5, -7.0], [SX, 5.1, -10.0], [SX, 5.0, -10.3]], 46, 40) },
      // medium: follow one leaf from the bamboo spout along the channel and past the arched bridge; it
      // slows as the current dies out in the pond
      { name: 'streamLeaf', leaf: true, keys: [[0, 0.55], [0.55, 0.55], [0.85, 0.3], [1, 0.28]],
        geo: (e) => {
          const lp = leafAt(e); lp.y = -0.105;
          const u = LEAF_U0 + (1 - LEAF_U0) * e;
          const tg = L.streamCurve.getPointAt(Math.min(1, u + 0.07)).sub(L.streamCurve.getPointAt(Math.max(0, u - 0.07))).setY(0).normalize();
          const p = lp.clone().addScaledVector(tg, -2.5).add(new V3(-tg.z * 0.9, 1.55, tg.x * 0.9));
          return { p, t: lp.clone().addScaledVector(tg, 0.9).add(new V3(0, 0.05, 0)), fov: 46 };
        } },
      // wide: circle the fruit-tart pond (frilled crust, lime slices, lime stepping stones, leaning pine),
      // coming round to the cake server holding the cut wedge
      { name: 'pondAll', keys: [[0, 0.27], [1, 0.27]],
        geo: (e) => {
          const a = W.lerp(-0.5, 1.08, e), r = 9.6;
          return { p: new V3(P.CX + Math.sin(a) * r, W.lerp(5.2, 4.2, e), P.CZ + Math.cos(a) * r), t: pondC.clone().lerp(wedge, 0.35 * e), fov: zoom(42, 38, e) };
        } },
      // close: a short slow push onto the lime slice where the dragonfly sits and koi pass beneath
      { name: 'koi', keys: [[0, 0.16], [1, 0.16]],
        geo: (e) => { const l = W.limes[0]; return { p: l.clone().add(new V3(W.lerp(-0.95, -0.55, e), W.lerp(2.75, 2.05, e), W.lerp(3.25, 2.3, e))), t: l.clone().add(new V3(0.25, -0.3, -0.25)), fov: zoom(38, 34, e) }; } },
      // medium: sink down the front edge to the cut — pond section, soil strata
      { name: 'frontEdge', keys: [[0, 0.22], [1, 0.22]],
        geo: move([-1.2, 3.4, 21.3], [1.4, -1.5, 19.6], [-0.5, 0.3, 16.0], [0.9, -1.7, 16.0], 40, 44) },
      // wide: from under the torii, look back across the pond; a steady zoom carries the eye into the
      // studio and the cut comes as the glowing orrery fills the view
      { name: 'lookBack', keys: [[0, 0.3], [1, 0.3]],
        geo: (e) => {
          // under the torii, placed so the sight line threads the top glass pane past the corner rain chain
          const p = new V3(9.0, 3.0 - e * 0.05, L.TORII.z + 0.15);
          const g = (Math.pow(LB1 / LB0, e) - 1) / (LB1 / LB0 - 1);
          const d0 = LBT.clone().sub(p), d1 = oc.clone().sub(p);
          const dir = slerpDir(d0.clone().normalize(), d1.clone().normalize(), g);
          return { p, t: p.clone().addScaledVector(dir, W.lerp(d0.length(), d1.length(), g)), fov: zoom(54, 10, e) };
        } },
      // medium: carry that push in over the cut-open roof — tiles, beams, the room below — and on over
      // the ridge, tipping down onto the round skylight in the back slope
      { name: 'roof', keys: [[0, 0.36], [1, 0.36]],
        geo: move([-9.0, 11.0, 3.0], [-10.8, 9.4, -7.6], [-9.8, 2.6, -4.2], [-11.0, 5.8, -8.4], 46, 46) },
      // medium: track along the engawa past the telescope and persimmon strings, posts sliding by in
      // front, to the flower stall and its reflection in the lattice glass
      { name: 'engawa', keys: [[0, 0.5], [1, 0.5]],
        geo: move([-5.0, 2.75, 0.75], [-12.6, 2.75, 0.6], [-7.2, 2.6, -2.3], [-14.5, 2.6, -2.4], 44, 44) },
      // medium, short: in through the open sliding doors, easing off once inside to take in the unfinished
      // painting, the loose sheets and the orrery beyond
      { name: 'enter', keys: [[0, 0.42], [0.4, 0.42], [0.75, 0.2], [1, 0.18]],
        geo: path([[-9.7, 2.7, 0.4], [-10.1, 2.65, -1.4], [-10.4, 2.55, -2.9]], [[-9.3, 2.35, -4.2], [-9.4, 2.3, -4.3], [-10.3, 1.6, -5.4]], 44, 46) },
      // close, the heaviest shot: a slow, even arc around the orrery while its rings come into one
      // plane, flash and throw out a ring of light
      { name: 'orrery', keys: [[0, 0.18], [1, 0.18]],
        geo: (e) => { const a = W.lerp(0.1, 1.05, e), r = W.lerp(2.45, 1.95, e); return { p: new V3(oc.x + Math.sin(a) * r, oc.y + W.lerp(0.38, 0.06, e), oc.z + Math.cos(a) * r), t: new V3(oc.x, oc.y - W.lerp(0.25, 0.1, e), oc.z), fov: 42 }; } },
      // close: a slow push past the steaming tea and the slice of tart; the cat on its cushion looks up
      { name: 'tea', keys: [[0, 0.14], [1, 0.14]],
        geo: move([-12.6, 2.42, -3.2], [-13.15, 2.18, -3.45], [-13.9, 1.74, -4.88], [-14.15, 1.64, -4.72], 40, 38) },
      // 氛围时刻, medium: a cloud shadow dims the studio; the camera lifts toward the ceiling as the
      // orrery's constellations surface there
      { name: 'cloud', keys: [[0, 0.17], [1, 0.17]],
        geo: move([-8.6, 1.85, -4.6], [-8.9, 3.05, -5.0], [-11.3, 3.7, -9.0], [-11.6, 5.0, -9.4], 52, 50) },
      // wide: from inside, slide past a door post so the doorway opens onto the pond and the distant torii
      { name: 'lookout', depth: 3.5, keys: [[0, 0.25], [1, 0.25]],
        geo: move([-13.3, 2.85, -4.5], [-12.0, 2.85, -5.6], [2.0, 0.6, 9.5], [2.6, 0.6, 9.2], 44, 44) },
      // 全景, wide: half a turn around the base — sugi, bamboo and mist along the back — easing into a
      // long glide that settles on the whole base, where the tour began
      { name: 'finale', keys: [[0, 0.4], [0.5, 0.4], [1, 0]],
        geo: (e) => {
          const a = W.lerp(PI - 0.15, 0, e), R = Math.cos(HOME_P) * HOME_D;
          return { p: new V3(HOME_T.x + Math.sin(a) * R, W.lerp(HOME.y - 6, HOME.y, e), HOME_T.z + Math.cos(a) * R), t: HOME_T.clone(), fov: 34 };
        } },
    ];
    SHOTS.forEach((s) => { measure(s); timing(s); });
    START = []; TOTAL = 0;
    SHOTS.forEach((s) => { START.push(TOTAL); TOTAL += s.d; });
    tour.TOTAL = TOTAL;
    tour.shots = SHOTS; tour.starts = START;
    const st = (n) => { const i = SHOTS.findIndex((q) => q.name === n); return i < 0 ? NaN : START[i]; };
    // events (tour time)
    EVT = {
      gusts: [st('push') + 1.6],
      clouds: [st('cloud') + 3.4 - 13.4],
      cats: [], foxes: [], crows: [st('push') + 1.5, st('finale') + 1.0], turtles: [st('koi') + 1.0],
    };
    tour.shotStart = st;
  }

  // scripted leaf down the stream: it rides the streamLeaf shot's own pacing, so the camera that
  // follows it never stops; leafTime(u) tells when it passes a point of the stream
  const leafShot = () => SHOTS.find((q) => q.leaf);
  tour.leafU = function (t) {
    const s = leafShot(), i = SHOTS.indexOf(s);
    return LEAF_U0 + (1 - LEAF_U0) * shotE(s, (t - START[i]) / s.d);
  };
  tour.leafPos = function (t) { const p = L.streamCurve.getPointAt(tour.leafU(t)); p.y = -0.105 + Math.sin(t * 4) * 0.004; return p; };
  tour.leafTime = function (u) {
    const s = leafShot(), i = SHOTS.indexOf(s);
    let lo = 0, hi = 1;
    for (let j = 0; j < 40; j++) { const mid = (lo + hi) / 2; if (tour.leafU(START[i] + mid * s.d) < u) lo = mid; else hi = mid; }
    return START[i] + lo * s.d;
  };

  // environment overrides for tour mode
  function applyTourEnv() {
    const cat = W.life.catPlanFor; // computed below
    const life = W.life;
    life.setEvents({ gusts: EVT.gusts.slice(), clouds: EVT.clouds.slice(), cats: [], foxes: EVT.foxes.slice(), crows: EVT.crows.slice(), turtles: EVT.turtles.slice() });
    // cat: arrive at the pond during pondAll shot
    const want = tour.shotStart('pondAll') + 0.6;
    const pre = W.life.catArrive ? W.life.catArrive(0) : 28;
    W.ev.cats = [{ t: want - pre, route: 0 }];
    W.tourMode = true;
  }

  tour.init = function () {
    defineShots();
    // scripted leaf mesh
    const b = new W.Bucket('tourLeaf');
    new W.Ctx(b).add(W.g.leaf('maple'), 0xe03a1a, [0, 0, 0], null, 0.2, [0, 0, 0, 7.0]);
    tour.leafMesh = b.mesh(W.mat); tour.leafMesh.visible = false; W.scene.add(tour.leafMesh);
    const b2 = new W.Bucket('sandLeaf');
    new W.Ctx(b2).add(W.g.leaf('maple'), 0xd8301c, [0, 0, 0], null, 0.17, [0, 0, 0, 7.0]);
    tour.sandLeaf = b2.mesh(W.mat); tour.sandLeaf.visible = false; W.scene.add(tour.sandLeaf);
  };

  // per-step hook (camera + scripted props), called from W.step during export/preview
  tour.apply = function (t) {
    let i = 0; while (i < SHOTS.length - 1 && t >= START[i + 1]) i++;
    const s = SHOTS[i];
    const k = W.clamp((t - START[i]) / s.d, 0, 1);
    const c = s.geo(shotE(s, k), t);
    if (s.leaf) { const lp = tour.leafPos(t); c.t.y += lp.y + 0.105; c.p.y += lp.y + 0.105; }
    const cam = W.render.camera;
    cam.position.copy(c.p); cam.up.set(0, 1, 0); cam.lookAt(c.t);
    if (Math.abs(cam.fov - c.fov) > 1e-4) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    tour.shot = s.name;
    // scripted stream leaf
    const ls = tour.shotStart('streamLeaf');
    const lm = tour.leafMesh;
    const ld = leafShot().d;
    if (t > ls - 0.5 && t < ls + ld + 0.2) {
      lm.visible = true; lm.position.copy(tour.leafPos(t)); lm.rotation.set(0, t * 0.6, 0);
      if (t > ls + ld - 0.4) { const f = 1 - (t - ls - ld + 0.4) / 0.6; lm.scale.setScalar(Math.max(0.01, f)); } else lm.scale.setScalar(1);
    } else lm.visible = false;
    // scripted maple leaf onto the sand
    const ss = tour.shotStart('sand');
    const sl = tour.sandLeaf;
    const land = W.sandLeafSpot;
    if (isFinite(ss) && t > ss - 0.2 && t < ss + 12) {
      sl.visible = true;
      const e = t - ss;
      const fall = W.clamp(e / 3.0, 0, 1);
      const ph = e * 5.5;
      if (fall < 1) { sl.position.set(land.x + Math.cos(ph) * 0.15 * (1 - fall) + (1 - fall) * 0.6, land.y + (1 - fall) * 2.0, land.z + Math.sin(ph) * 0.15 * (1 - fall)); sl.rotation.set(ph * 0.9, ph * 1.6, 0.7); }
      else { sl.position.copy(land); sl.rotation.set(0, 1.1, 0); }
    } else sl.visible = false;
    return c;
  };

  // ---------------------------------------------------------------- export API
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  let FPS = 60, saved = null;
  function enterTour() {
    if (!saved) saved = { cam: W.cam.snapshot ? W.cam.snapshot() : null };
    W.clock.exporting = true;
    W.cam.setUIVisible(false);
    applyTourEnv();
    W.life.tourOverrides(true);
    const veil = document.getElementById('veil'); if (veil) veil.style.display = 'none';
    W.life.reset(2026);
    W.sim.t = 0;
    W.tourActive = true;
    W.step(0, 0);
  }
  window.videoExport = {
    runs: ['tour'],
    begin: async function (runId, opts) {
      if (runId !== 'tour') throw new Error('unknown run ' + runId);
      await W.ready;
      FPS = (opts && opts.fps) || 60;
      enterTour();
      W.renderNow();
      await raf();
      return { frames: Math.round(TOTAL * FPS) };
    },
    frame: async function (i) {
      await W.ready;
      if (!W.tourActive) enterTour();
      const t = i / FPS;
      if (t < W.sim.t - 1e-6) { W.life.reset(2026); W.sim.t = 0; W.step(0, 0); }
      W.stepSim(t);
      tour.apply(t);
      W.renderNow();
      await raf();
    },
    end: function () {
      W.tourActive = false;
      W.tourMode = false;
      W.life.tourOverrides(false);
      W.life.genLive();
      W.life.reset();
      W.sim.t = 0; W.clock.t = 0; W.clock.last = performance.now();
      tour.leafMesh.visible = false; tour.sandLeaf.visible = false;
      if (saved && saved.cam) W.cam.restore(saved.cam);
      saved = null;
      W.cam.setUIVisible(true);
      W.clock.exporting = false;
      const c = W.render.camera; c.fov = W.cam.S.fov; c.updateProjectionMatrix();
    },
  };
  // live preview helper (debug): plays the tour in real time
  tour.preview = function (from) {
    enterTour();
    const t0 = performance.now() - (from || 0) * 1000;
    if (from) W.stepSim(from);
    const tick = () => {
      if (!W.tourActive) return;
      const t = (performance.now() - t0) / 1000;
      if (t > TOTAL) { window.videoExport.end(); return; }
      W.stepSim(t); tour.apply(t); W.renderNow();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  tour.jump = function (t) {
    // debug: render a single tour frame at time t
    if (!W.tourActive) enterTour();
    if (t < W.sim.t) { W.life.reset(2026); W.sim.t = 0; W.step(0, 0); }
    W.stepSim(t); tour.apply(t); W.renderNow();
  };
})();
