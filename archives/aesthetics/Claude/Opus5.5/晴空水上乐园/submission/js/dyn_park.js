'use strict';
/* ==========================================================================
   Park dynamics: riders, rides, water effects, wind props, boats, displays
   All state is a pure function of time t (deterministic for video export).
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, D = P.Dyn, V = P.V, FV = P.FV;
  const v3 = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const hh = D.hash;
  const clamp = P.clamp, sm = P.smooth;
  const G = 9.81;
  const S = { p: v3(), T: v3(), U: v3(), R: v3(), v: 0, k: 0 };
  const tA = v3(), tB = v3(), tC = v3(), tD = v3();
  const UP = v3(0, 1, 0);

  /* ------------------------------------------------------------ small dynamic models */
  function buildDynModels() {
    // buoy
    P.makeModel('buoyY', FV, (B, w) => { for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 0; y <= 2; y++) if (Math.abs(x) + Math.abs(z) + Math.abs(y - 1) <= 2) w.set(x, y, z, M.lemon); });
    P.makeModel('buoyW', FV, (B, w) => { for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 0; y <= 2; y++) if (Math.abs(x) + Math.abs(z) + Math.abs(y - 1) <= 2) w.set(x, y, z, M.white); });
    // lily pad
    P.makeModel('lily', FV, (B, w) => {
      for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
        const r = Math.hypot(x, z);
        if (r > 6.3) continue;
        const a = Math.atan2(z, x);
        if (a > -0.25 && a < 0.25 && r > 1) continue;
        w.set(x, 0, z, r > 5.2 ? M.mint2 : M.grass);
        if (r < 1.2) w.set(x, 1, z, M.flowerP);
      }
    });
    // pennant (triangle) colours
    const pc = [M.fabB, M.fabY, M.fabP, M.fabM, M.fabL, M.fabO];
    P.pennantModels = pc.map((c, i) => P.makeModel('pen' + i, FV, (B, w) => {
      for (let y = 0; y < 6; y++) for (let x = -(5 - y) >> 1; x <= (5 - y) >> 1; x++) w.set(x, -y, 0, c);
    }));
    // flags (rectangular, pivot at mast edge)
    P.flagModels = [M.fabB, M.fabY, M.fabR, M.fabM].map((c, i) => P.makeModel('flag' + i, FV, (B, w) => {
      for (let x = 0; x < 10; x++) for (let y = 0; y < 6; y++) w.set(x, -y, 0, (y === 2 || y === 3) && i !== 2 ? M.fabW : c);
    }));
    // curtain panel
    P.makeModel('curtain', FV, (B, w) => { for (let x = 0; x < 4; x++) for (let y = 0; y < 17; y++) w.set(x, -y, 0, (y > 12 && x > 1) ? M.fabW : M.fabW); for (let x = 0; x < 4; x++) w.set(x, -9, 1, M.lemon); });
    // windsock segment ring
    P.makeModel('sockR', FV, (B, w) => { for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; w.set(Math.round(Math.cos(an) * 2.4), Math.round(Math.sin(an) * 2.4), 0, M.fabR); w.set(Math.round(Math.cos(an) * 2.4), Math.round(Math.sin(an) * 2.4), 1, M.fabR); } });
    P.makeModel('sockW', FV, (B, w) => { for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; w.set(Math.round(Math.cos(an) * 2.1), Math.round(Math.sin(an) * 2.1), 0, M.fabW); w.set(Math.round(Math.cos(an) * 2.1), Math.round(Math.sin(an) * 2.1), 1, M.fabW); } });
    // big bucket (coarse)
    P.makeModel('bucket', V, (B, w) => {
      B.cyl(0, 0, 1.35, -1.25, 1.25, (x, y, z) => (y > 0.95 ? M.white : (Math.floor((y + 1.25) / 0.5) & 1) ? M.sky : M.sky2), 1.05);
      B.cyl(0, 0, 1.35, -1.5, -1.25, M.sky2);
      B.box(-1.6, 0.25, -0.125, 1.6, 0.5, 0.125, M.lemon2);
    });
    P.makeModel('bucketWater', V, (B) => { B.cyl(0, 0, 1.05, -1.25, 1.0, M.waterV); });
    // water wheel
    P.makeModel('wheel', FV, (B, w) => {
      for (let a = 0; a < 64; a++) {
        const an = a / 64 * Math.PI * 2;
        for (let r = 11; r <= 13; r++) for (let z = -3; z <= 3; z += 6) w.set(Math.round(Math.cos(an) * r), Math.round(Math.sin(an) * r), z, M.lemon);
      }
      for (let k = 0; k < 8; k++) {
        const an = k / 8 * Math.PI * 2;
        for (let r = 0; r <= 12; r++) w.set(Math.round(Math.cos(an) * r), Math.round(Math.sin(an) * r), 0, M.white);
        for (let z = -3; z <= 3; z++) for (let r = 10; r <= 14; r++) w.set(Math.round(Math.cos(an) * r), Math.round(Math.sin(an) * r), z, k % 2 ? M.pink : M.sky);
      }
    });
    // mini tipping bucket
    P.makeModel('mbucket', FV, (B, w) => { for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = -3; y <= 3; y++) { const r = Math.hypot(x, z); if (r <= 3.2 && (r > 2.2 || y === -3)) w.set(x, y, z, y > 1 ? M.white : M.coral); } });
    // trapdoor halves
    P.makeModel('door', V, (B, w) => { for (let x = 0; x < 4; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x + 0.5, z) < 4) w.set(x, 0, z, M.slSky); });
    // light cube
    P.makeModel('lightOn', FV, (B, w) => { for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -1; z <= 1; z++) w.set(x, y, z, M.lampY); });
    P.makeModel('lightOff', FV, (B, w) => { for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -1; z <= 1; z++) w.set(x, y, z, M.lampOff); });
    P.makeModel('lightR', FV, (B, w) => { for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -1; z <= 1; z++) w.set(x, y, z, M.ledPink); });
    P.makeModel('lightG', FV, (B, w) => { for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -1; z <= 1; z++) w.set(x, y, z, M.ledCyan); });
    // boats
    P.makeModel('sailboat', V, (B) => {
      for (let z = -4; z < 4; z += V) { const w2 = 1.3 * Math.sqrt(1 - Math.pow(z / 4.3, 2)) * (z < 0 ? 1 : 1 - (z / 4) * 0.4); B.box(-w2, 0, z, w2, 1.0, z + V, Math.abs(z) < 3 ? M.hull : M.hull); }
      B.box(-1.2, 0.5, -3.5, 1.2, 0.75, 3.0, M.hullB);
      B.box(-0.125, 1.0, -0.5, 0.125, 10.0, -0.25, M.white);
      for (let y = 1.5; y < 9.5; y += V) { const L = (9.5 - y) * 0.42; B.box(-0.06, y, -0.25, 0.06 + 0.0, y + V, -0.25 + L, M.sail); }
      for (let y = 1.5; y < 7.5; y += V) { const L = (7.5 - y) * 0.35; B.box(-0.06, y, -0.75 - L, 0.06, y + V, -0.75, M.sail); }
    });
    P.makeModel('ship', V, (B) => {
      for (let z = -80; z < 80; z += 1) {
        const w2 = 12 * Math.min(1, Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, z - 50) / 32, 2)))) * (z < -70 ? 0.9 : 1);
        B.box(-w2, 0, z, w2, 9, z + 1, M.hull);
        B.box(-w2 - 0.25, 1.5, z, w2 + 0.25, 3.0, z + 1, M.hullB);
        if (z > -72 && z < 46) {
          for (let d = 0; d < 4; d++) {
            const ww = w2 - 1.5 - d * 1.5;
            if (z > 40 - d * 12) continue;
            B.box(-ww, 9 + d * 3, z, ww, 12 + d * 3, z + 1, M.hull);
            if ((z & 3) === 0) B.box(-ww - 0.25, 10 + d * 3, z, ww + 0.25, 11 + d * 3, z + 0.5, M.cityG);
          }
        }
      }
      B.box(-3, 21, -40, 3, 28, -30, M.sky);
      B.box(-3.25, 26, -40.25, 3.25, 28, -29.75, M.lemon);
    });
  }

  /* ------------------------------------------------------------ rider pose on a track */
  // returns false if out of range
  function trackPose(tr, tau, rIn, maxRoll, out) {
    const fi = P.trackIndexAt(tr, tau);
    P.trackSample(tr, fi, S);
    let phi = -Math.atan(S.v * S.v * S.k / G);
    phi = clamp(phi, -maxRoll, maxRoll);
    // radial dir from centreline to rider
    const c = Math.cos(phi), s = Math.sin(phi);
    tA.copy(S.U).multiplyScalar(-c).addScaledVector(S.R, s); // radial
    out.p.copy(S.p).addScaledVector(tA, rIn);
    out.u.copy(tA).negate();
    out.f.copy(S.T);
    out.r.crossVectors(out.u, out.f).normalize();
    out.f.crossVectors(out.r, out.u).normalize();
    out.v = S.v;
    return true;
  }
  const pose = { p: v3(), u: v3(), f: v3(), r: v3(), v: 0 };

  /* ------------------------------------------------------------ rides */
  const rides = [];
  function poolFor(x, z) {
    for (const k in P.splash) {
      const s = P.splash[k];
      if (Math.abs(x - s.cx) <= s.hx + 1.5 && Math.abs(z - s.cz) <= s.hz + 1.5) return s;
    }
    return null;
  }
  // find time when a track first touches pool water
  function hitTime(tr) {
    for (let i = 0; i < tr.n; i++) {
      const p = tr.p[i];
      const k = P.colIndex(p.x, p.z);
      if (k >= 0 && P.waterLevel[k] > -50 && p.y < P.waterLevel[k] + 0.9) return { tau: tr.tau[i], i, x: p.x, z: p.z, y: P.waterLevel[k] };
    }
    return { tau: tr.T_total, i: tr.n - 1, x: tr.p[tr.n - 1].x, z: tr.p[tr.n - 1].z, y: -0.1 };
  }
  function addRide(o) {
    o.hit = o.hit || hitTime(o.tracks ? o.tracks[o.tracks.length - 1] : o.track);
    rides.push(o);
    return o;
  }

  // standard pool phase after the slide: glide + drift to edge + sink
  const POOL_T = 11;
  function poolPhase(r, dt, endP, endT, vEnd, pool, seed, out) {
    // glide
    const tx = endT.x, tz = endT.z, l = Math.hypot(tx, tz) || 1;
    const dx = tx / l, dz = tz / l;
    const g = Math.min(vEnd, 6) * 0.75 * (1 - Math.exp(-dt / 0.75));
    let x = endP.x + dx * g, z = endP.z + dz * g;
    // drift toward nearest pool edge (side)
    if (pool) {
      const side = hh(seed, 9) < 0.5 ? -1 : 1;
      const ex = pool.cx + side * (pool.hx - 0.9), ez = clamp(z, pool.cz - pool.hz + 0.9, pool.cz + pool.hz - 0.9);
      const k = sm(1.5, 9.5, dt);
      x = x + (ex - x) * k * 0.8; z = z + (ez - z) * k * 0.5;
      x = clamp(x, pool.cx - pool.hx + 0.7, pool.cx + pool.hx - 0.7);
      z = clamp(z, pool.cz - pool.hz + 0.7, pool.cz + pool.hz - 0.7);
    }
    const wl = pool ? pool.level : -0.1;
    const bob = Math.sin(dt * 2.2 + seed) * 0.035;
    out.x = x; out.z = z; out.y = wl - 0.05 + bob;
    out.yaw = Math.atan2(dx, dz) + dt * 0.25 * (hh(seed, 3) - 0.5);
    out.tx = Math.sin(dt * 1.7 + seed) * 0.05; out.tz = Math.cos(dt * 1.3 + seed) * 0.05;
    out.s = 1 - sm(POOL_T - 1.0, POOL_T, dt);
    out.y -= sm(POOL_T - 1.0, POOL_T, dt) * 0.3;
  }

  function setupRides() {
    const tubes = [0, 1, 2, 3, 4, 5].map((i) => 'tube' + i);
    const std = (slide, models, interval, offset, rIn, roll) => addRide({ kind: 'std', track: slide.track, models, interval, offset, rIn: slide.r - 0.24, roll: roll || 1.1, name: slide.name });
    std(P.helixA, tubes, 9.0, 1.0, 0.44, 1.2);
    std(P.helixB, tubes, 9.0, 5.5, 0.44, 1.2);
    std(P.loopSlide, tubes, 13.0, 3.0, 0.5, 1.2);
    std(P.blackhole, tubes, 10.0, 2.0, 0.5, 1.2);
    std(P.kid1, ['tube2x'], 11.0, 1.5, 0.58, 1.1);
    std(P.kid2, ['tube2x'], 11.0, 7.0, 0.58, 1.1);
    std(P.familySlide, ['raft'], 15.0, 4.0, 1.35, 0.7);
    std(P.coaster, ['raft'], 13.0, 0.0, 1.15, 0.6);
    P.waveSlides.forEach((s, i) => std(s, ['mat'], 7.0 + i, i * 2.3, 0.82, 0.5));
    // funnel: inbound + funnel swing + out chute
    addRide({ kind: 'funnel', tracks: [P.funnelIn.track, P.funnelOut.track], models: tubes, interval: 14, offset: 6, swing: 6.5 });
    // bowl
    addRide({ kind: 'bowl', tracks: [P.bowlIn.track], models: tubes, interval: 15, offset: 9, spin: 7.5, hit: { tau: 0, x: P.bowl.x, z: P.bowl.z, y: -0.1 } });
    // half-pipe
    addRide({ kind: 'half', tracks: [P.halfOut.track], models: ['raft'], interval: 22, offset: 3 });
    // vertical (event)
    addRide({ kind: 'vertical', track: P.vertical.track, models: tubes });
    // racer lanes (event)
    P.racer.lanes.forEach((s, i) => addRide({ kind: 'racer', track: s.track, lane: i, models: ['mat'] }));
    // half-pipe pendulum table
    {
      const hp = P.halfpipe;
      const tab = [];
      let u = 0.6, vu = 0, t = 0;
      const dt = 1 / 120;
      const yAt = hp.yAt;
      for (let i = 0; i < 16 * 120; i++) {
        const dy = (yAt(u + 0.01) - yAt(u - 0.01)) / 0.02;
        const ds = Math.sqrt(1 + dy * dy);
        // acceleration along arc
        let a = -G * dy / ds;
        const v = vu * ds;
        a -= Math.sign(v) * (0.08 * G / ds + 0.012 * v * v);
        const vs = v + a * dt;
        vu = vs / ds;
        u += vu * dt;
        if (u < 0.2) { u = 0.2; vu = Math.abs(vu) * 0.3; }
        if (u > 23.8) { u = 23.8; vu = -Math.abs(vu) * 0.3; }
        if (i % 2 === 0) tab.push(u);
        t += dt;
      }
      hp.tab = tab; // 60 Hz samples of u
    }
    // funnel exit timing
    for (const r of rides) {
      if (r.kind === 'std' || r.kind === 'vertical' || r.kind === 'racer') r.T = r.track.T_total;
      if (r.kind === 'funnel') r.T = r.tracks[0].T_total + r.swing + r.tracks[1].T_total;
      if (r.kind === 'bowl') r.T = r.tracks[0].T_total + r.spin + 0.9;
      if (r.kind === 'half') r.T = 13.5 + r.tracks[0].T_total;
      const last = r.tracks ? r.tracks[r.tracks.length - 1] : r.track;
      const e = last.n - 1;
      r.endP = last.p[e].clone(); r.endT = last.T[e].clone(); r.vEnd = last.v[e];
      r.pool = r.kind === 'bowl' ? P.splash.bowl : poolFor(r.endP.x, r.endP.z);
      if (r.kind !== 'bowl') r.hit = hitTime(last);
    }
    // racer finish order
    const fin = P.racerFinish;
    P.racer.lanes.forEach((s, i) => {
      const tr = s.track;
      let bi = 0, bd = 1e9;
      for (let k = 0; k < tr.n; k++) { const d = Math.hypot(tr.p[k].x - fin.x, tr.p[k].z - fin.z); if (d < bd) { bd = d; bi = k; } }
      rides.filter((r) => r.kind === 'racer')[i].tFinish = tr.tau[bi];
    });
    const rr = rides.filter((r) => r.kind === 'racer');
    const sorted = rr.slice().sort((a, b) => a.tFinish - b.tFinish);
    sorted.forEach((r, k) => (r.rank = k + 1));
  }

  /* ------------------------------------------------------------ init */
  D.init = function (scene) {
    buildDynModels();
    const smat = P.makeStreamMaterial();
    D.water = new D.CubeBatch(scene, 90000, smat, 12);
    D.pools = {};
    const pool = (name, max, opts) => (D.pools[name] = new D.ModelPool(scene, P.models[name], max, opts));
    for (let i = 0; i < 6; i++) pool('tube' + i, 70);
    pool('tube2x', 12); pool('raft', 16); pool('mat', 24); pool('bed', 6);
    pool('buoyY', 60, { cast: false }); pool('buoyW', 60, { cast: false });
    pool('lily', 12);
    for (let i = 0; i < 6; i++) pool('pen' + i, 40, { cast: false });
    for (let i = 0; i < 4; i++) pool('flag' + i, 12, { cast: false });
    pool('curtain', 160, { cast: false });
    pool('sockR', 4, { cast: false }); pool('sockW', 4, { cast: false });
    pool('bucket', 1); pool('bucketWater', 1, { cast: false });
    pool('wheel', 1); pool('mbucket', 4); pool('door', 2);
    pool('lightOn', 40, { cast: false }); pool('lightOff', 40, { cast: false }); pool('lightR', 8, { cast: false }); pool('lightG', 8, { cast: false });
    for (let i = 0; i < 6; i++) pool('ucan' + i, 120, { cast: true });
    pool('sailboat', 6, { cast: false }); pool('ship', 1, { cast: false });
    setupRides();
    setupDisplays(scene);
    // foam source lists per water mesh
    D.foamStatic = {};
    const addFoam = (pname, x, z, r, s) => (D.foamStatic[pname] = D.foamStatic[pname] || []).push([x, z, r, s]);
    for (const f of P.falls) {
      const mx = (f.x0 + f.x1) / 2 + f.ox * 1.0, mz = (f.z0 + f.z1) / 2 + f.oz * 1.0;
      const k = P.colIndex(mx, mz);
      const id = k >= 0 ? P.waterId[k] : 0;
      const pl = P.pools.find((p) => p.id === id);
      if (pl) addFoam(pl.name, mx, mz, Math.max(2.5, Math.hypot(f.x1 - f.x0, f.z1 - f.z0) * 0.7), 0.6 * f.s);
    }
    for (const r of rides) {
      if (!r.pool) continue;
      const nm = Object.keys(P.splash).find((k) => P.splash[k] === r.pool);
      if (nm) addFoam(nm, r.hit.x, r.hit.z, 2.6, 0.45);
    }
  };

  /* ------------------------------------------------------------ displays (pixel LED canvases) */
  const FONT5 = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'], ':': ['0', '1', '0', '1', '0'], ' ': ['0', '0', '0', '0', '0'],
  };
  function drawPix(ctx, str, x, y, col, s) {
    let cx = x;
    for (const ch of str) {
      const g = FONT5[ch] || FONT5[' '];
      for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '1') { ctx.fillStyle = col; ctx.fillRect(cx + c * s, y + r * s, s - 0.15 * s, s - 0.15 * s); }
      cx += (g[0].length + 1) * s;
    }
  }
  function screenMesh(scene, sp, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, P.U, { tMap: { value: tex } }),
      vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; varying vec3 vWorld; ${P.GLSL.COMMON}
        void main(){ vec3 c = texture(tMap, vUv).rgb; vec2 px = fract(vUv * vec2(${w}.0, ${h}.0)); float g = smoothstep(0.0, 0.12, min(min(px.x, 1.0-px.x), min(px.y, 1.0-px.y)));
        vec3 col = c * (0.55 + 0.45 * g) * 1.9 + vec3(0.02, 0.05, 0.1); col = applyFog(col, vWorld); gl_FragColor = vec4(col, 1.0); }`,
    });
    const g = new THREE.PlaneGeometry(sp.w, sp.h);
    const m = new THREE.Mesh(g, mat);
    m.position.set(sp.x, sp.y, sp.z);
    if (sp.ry) m.rotation.y = sp.ry;
    scene.add(m);
    return { cv, ctx: cv.getContext('2d'), tex, mesh: m, last: '' };
  }
  function setupDisplays(scene) {
    D.scr1 = screenMesh(scene, P.waveScreen, 44, 26);
    D.scr2 = screenMesh(scene, P.waveScreen2, 44, 26);
    // rank display on racer gantry
    const f = P.racerFinish, rd = P.racer;
    D.scrRank = screenMesh(scene, { x: f.x + rd.dx * 0.42, y: 4.25, z: f.z + rd.dz * 0.42, w: 7.2, h: 0.72, ry: Math.atan2(rd.dx, rd.dz) }, 72, 9);
  }

  /* ------------------------------------------------------------ helpers for update */
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = v3();
  function pushYawTilt(pool, x, y, z, yaw, s, tx, tz) { pool.pushYaw(x, y, z, yaw, s, tx, tz); }
  const pp = { x: 0, y: 0, z: 0, yaw: 0, tx: 0, tz: 0, s: 1 };

  function emitSplash(t, t0, id, x, y, z, big) {
    D.burst(D.water, t, t0, id, { x, y: y + 0.05, z, n: big ? 70 : 40, hs: big ? 3.2 : 2.2, vs: big ? 5.5 : 3.8, life: 1.3, size: 0.12, floor: y - 0.1, r: 0.5 });
  }

  /* ------------------------------------------------------------ update: rides */
  function updateRides(t) {
    for (const r of rides) {
      if (r.kind === 'vertical' || r.kind === 'racer') continue;
      const life = r.T + POOL_T;
      const off = (D.tourSched && r.tourOffset != null) ? r.tourOffset : r.offset;
      const k0 = Math.ceil((t - life - off) / r.interval), k1 = Math.floor((t - off) / r.interval);
      for (let k = k0; k <= k1; k++) {
        const tl = off + k * r.interval;
        const tau = t - tl;
        if (tau < 0) continue;
        const mname = r.models[(((k * 7) % r.models.length) + r.models.length) % r.models.length];
        const pool = D.pools[mname];
        const seed = (k * 131 + rides.indexOf(r) * 17) | 0;
        if (r.kind === 'std') {
          if (tau <= r.T) {
            trackPose(r.track, tau, r.rIn, r.roll, pose);
            pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
            if (r.track === P.coaster.track) coasterJets(t, tau, r, pose, seed);
          } else {
            poolPhase(r, tau - r.T, r.endP, r.endT, r.vEnd, r.pool, seed, pp);
            if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz);
          }
          if (r.hit) emitSplash(t, tl + r.hit.tau, seed, r.hit.x, r.hit.y, r.hit.z, mname === 'raft');
        } else if (r.kind === 'funnel') funnelRider(t, tau, r, pool, seed, tl);
        else if (r.kind === 'bowl') bowlRider(t, tau, r, pool, seed, tl);
        else if (r.kind === 'half') halfRider(t, tau, r, pool, seed, tl);
      }
    }
  }
  function coasterJets(t, tau, r, pose, seed) {
    // extra spray behind raft on uphill sections
    const s = P.trackIndexAt(r.track, tau) * r.track.ds;
    for (const j of P.coaster.jets) if (s > j[0] && s < j[1]) {
      D.jet(D.water, t, seed + 999, { x: pose.p.x - pose.f.x * 1.4, y: pose.p.y - 0.2, z: pose.p.z - pose.f.z * 1.4, vx: -pose.f.x * 2, vy: 3.0, vz: -pose.f.z * 2, rate: 40, life: 0.6, size: 0.1 });
    }
  }
  function funnelRider(t, tau, r, pool, seed, tl) {
    const a = r.tracks[0], b = r.tracks[1];
    const F = P.funnel;
    if (tau <= a.T_total) { trackPose(a, tau, P.funnelIn.r - 0.24, 1.2, pose); pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1); return; }
    const t2 = tau - a.T_total;
    if (t2 <= r.swing) {
      const k = t2 / r.swing;
      const u = 0.04 + 0.82 * (1 - Math.pow(1 - k, 1.6));
      const amp = 1.25 * Math.exp(-t2 / 3.2) + 0.05;
      const psi = amp * Math.sin(t2 * 2 * Math.PI / 2.4);
      const ax = F.A.x + (F.B.x - F.A.x) * u, ay = F.A.y + (F.B.y - F.A.y) * u;
      const rr = F.rr(u) - 0.35;
      tA.set(0, -Math.cos(psi), Math.sin(psi));
      pose.p.set(ax, ay + tA.y * rr, F.A.z + tA.z * rr);
      pose.u.copy(tA).negate();
      pose.f.set(1, 0, 0);
      pose.r.crossVectors(pose.u, pose.f).normalize();
      pose.f.crossVectors(pose.r, pose.u).normalize();
      pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
      return;
    }
    const t3 = t2 - r.swing;
    if (t3 <= b.T_total) { trackPose(b, t3, P.funnelOut.r - 0.24, 0.8, pose); pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1); }
    else { poolPhase(r, t3 - b.T_total, r.endP, r.endT, r.vEnd, r.pool, seed, pp); if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz); }
    emitSplash(t, tl + a.T_total + r.swing + r.hit.tau, seed, r.hit.x, r.hit.y, r.hit.z);
  }
  function bowlRider(t, tau, r, pool, seed, tl) {
    const a = r.tracks[0];
    const c = P.bowl;
    if (tau <= a.T_total) { trackPose(a, tau, P.bowlIn.r - 0.24, 1.2, pose); pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1); return; }
    const t2 = tau - a.T_total;
    if (t2 <= r.spin) {
      const k = t2 / r.spin;
      const rad = 6.6 - 5.5 * Math.pow(k, 1.35);
      // angle: integrate omega ~ v/r with v rising slightly
      const th = -Math.PI / 2 - (t2 * 0.9 + Math.pow(k, 2.2) * r.spin * 1.6);
      const x = c.x + Math.cos(th) * rad, z = c.z + Math.sin(th) * rad;
      const y = c.yb + c.D * Math.pow(rad / c.R, 2) + 0.12;
      // bank: tilt toward centre according to slope
      const slope = 2 * c.D * rad / (c.R * c.R);
      tA.set(-Math.cos(th) * slope, 1, -Math.sin(th) * slope).normalize();
      pose.p.set(x, y, z);
      pose.u.copy(tA);
      pose.f.set(Math.sin(th), 0, -Math.cos(th));
      pose.r.crossVectors(pose.u, pose.f).normalize();
      pose.f.crossVectors(pose.r, pose.u).normalize();
      pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
      return;
    }
    const t3 = t2 - r.spin;
    if (t3 < 1.1) {
      // drop through the hole
      const y = c.yb - 0.5 * G * t3 * t3 - 0.2;
      const yy = Math.max(y, -0.15);
      pool.pushYaw(c.x, yy, c.z, t3 * 3, 1, 0.3, 0);
      emitSplash(t, tl + a.T_total + r.spin + Math.sqrt(2 * (c.yb + 0.1) / G), seed, c.x, -0.1, c.z, true);
      return;
    }
    poolPhase(r, t3 - 1.1, v3(c.x, 0, c.z), v3(1, 0, 0.3), 1.2, r.pool, seed, pp);
    if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz);
    emitSplash(t, tl + a.T_total + r.spin + Math.sqrt(2 * (c.yb + 0.1) / G), seed, c.x, -0.1, c.z, true);
  }
  function halfRider(t, tau, r, pool, seed, tl) {
    const hp = P.halfpipe;
    const TH = 13.5;
    if (tau <= TH) {
      let u;
      if (tau < 1.5) u = 0.6; // waiting on the start platform edge
      else {
        const i = Math.min(hp.tab.length - 1, Math.floor((tau - 1.5) * 60));
        u = hp.tab[i];
        // ease toward exit centre after settling
        u = u + (12 - u) * sm(9.5, 12, tau);
      }
      const x = hp.x0 + u, y = hp.yAt(u) + 0.12;
      const dy = (hp.yAt(u + 0.05) - hp.yAt(u - 0.05)) / 0.1;
      const ang = Math.atan(dy);
      tA.set(-Math.sin(ang), Math.cos(ang), 0);
      pose.p.set(x, y + (tau < 1.5 ? 0.4 : 0), hp.z);
      pose.u.copy(tA);
      pose.f.set(0, 0, 1);
      pose.r.crossVectors(pose.u, pose.f).normalize();
      pose.f.crossVectors(pose.r, pose.u).normalize();
      // turn to face exit
      if (tau > 11) { const k = sm(11, 13.5, tau); pose.f.lerp(v3(0, 0, 1), k).normalize(); }
      pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
      return;
    }
    const a = r.tracks[0];
    const t2 = tau - TH;
    if (t2 <= a.T_total) { trackPose(a, t2, P.halfOut.r - 0.24, 0.6, pose); pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1); }
    else { poolPhase(r, t2 - a.T_total, r.endP, r.endT, r.vEnd, r.pool, seed, pp); if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz); }
    emitSplash(t, tl + TH + r.hit.tau, seed, r.hit.x, r.hit.y, r.hit.z, true);
  }

  /* ------------------------------------------------------------ vertical drop event */
  function updateVertical(t) {
    const r = rides.find((x) => x.kind === 'vertical');
    const t0 = D.lastStart('vertical', t);
    const cap = P.capsule;
    let doorOpen = 0;
    const lights = [0, 0, 0];
    if (t0 != null) {
      const e = t - t0;
      const pool = D.pools.tube1;
      if (e >= 0 && e < 5.0) {
        // tube lowered into capsule, countdown lights
        const yy = cap.y + 0.25 + Math.max(0, 1.0 - e) * 2.5;
        pool.pushYaw(cap.x, yy, cap.z, e * 0.2, 1, 0, 0);
        for (let i = 0; i < 3; i++) lights[i] = e > 1.5 + i * 1.1 ? 1 : 0;
      }
      if (e >= 5.0) {
        doorOpen = sm(5.0, 5.25, e) * (1 - sm(8, 9, e));
        const tau = e - 5.0;
        if (tau <= r.T) { trackPose(r.track, tau, P.vertical.r - 0.24, 1.1, pose); pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1); }
        else if (tau < r.T + POOL_T) { poolPhase(r, tau - r.T, r.endP, r.endT, r.vEnd, r.pool, 5, pp); if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz); }
        if (r.hit) emitSplash(t, t0 + 5.0 + r.hit.tau, 4242 + Math.floor(t0), r.hit.x, r.hit.y, r.hit.z, true);
        // long spray down the run-out channel
        if (tau > r.hit.tau && tau < r.hit.tau + 2.5) {
          const k = 1 - (tau - r.hit.tau) / 2.5;
          trackPose(r.track, Math.min(tau, r.T), 0.5, 1.1, pose);
          D.jet(D.water, t, 777, { x: pose.p.x, y: -0.05, z: pose.p.z, vx: 0, vy: 2.6 * k + 0.5, vz: 0, rate: 70, life: 0.7, size: 0.11, jit: 0.4, on: () => k });
        }
      }
      if (e >= 4.95 && e < 5.6) for (let i = 0; i < 3; i++) lights[i] = 1;
    }
    // trapdoor halves
    const dp = D.pools.door;
    const ang = doorOpen * 1.45;
    dp.pushYaw(cap.x - 0.95, cap.y - 0.25, cap.z, 0, 1, 0, -ang);
    dp.pushYaw(cap.x + 0.95, cap.y - 0.25, cap.z, Math.PI, 1, 0, -ang);
    // capsule lights on top
    for (let i = 0; i < 3; i++) {
      const x = cap.x - 0.6 + i * 0.6;
      const name = lights[i] ? (i === 2 ? 'lightG' : 'lightR') : 'lightOff';
      D.pools[name].pushYaw(x, cap.y + 4.1, cap.z - 0.3, 0, 1.4);
    }
  }

  /* ------------------------------------------------------------ rainbow race event */
  function updateRace(t) {
    const t0 = D.lastStart('race', t);
    const racers = rides.filter((r) => r.kind === 'racer');
    let rankStr = '      ';
    const lit = [0, 0, 0, 0, 0, 0];
    if (t0 != null) {
      const e = t - t0;
      for (const r of racers) {
        const pool = D.pools.mat;
        const tau = e - 3.0;
        if (e >= 0 && tau < 0) {
          // waiting at the start gate
          trackPose(r.track, 0.01, 0.31, 0.4, pose);
          pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
        } else if (tau >= 0 && tau <= r.T) {
          trackPose(r.track, tau, 0.31, 0.4, pose);
          pool.pushBasis(pose.p, pose.r, pose.u, pose.f, 1);
        } else if (tau > r.T && tau < r.T + POOL_T) {
          poolPhase(r, tau - r.T, r.endP, r.endT, r.vEnd, r.pool, r.lane * 3 + 1, pp);
          if (pp.s > 0.02) pool.pushYaw(pp.x, pp.y, pp.z, pp.yaw, pp.s, pp.tx, pp.tz);
        }
        if (tau >= 0 && r.hit) emitSplash(t, t0 + 3 + r.hit.tau, 900 + r.lane, r.hit.x, r.hit.y, r.hit.z);
        if (tau > r.tFinish && e < 26) { lit[r.lane] = r.rank; }
      }
      if (e < 26) rankStr = lit.map((v) => (v ? String(v) : ' ')).join('');
    }
    // rank lights: light up in finish order
    P.rankLights.forEach((L, i) => {
      const name = lit[i] ? (lit[i] === 1 ? 'lightOn' : 'lightG') : 'lightOff';
      D.pools[name].pushYaw(L.x, L.y, L.z, Math.atan2(P.racerFinish.px, P.racerFinish.pz), 1.6);
    });
    // rank digits
    const s = D.scrRank;
    if (s.last !== rankStr) {
      s.last = rankStr;
      const c = s.ctx;
      c.fillStyle = '#0b2347'; c.fillRect(0, 0, 72, 9);
      const cols = ['#ff5a6e', '#ff9f43', '#ffd83b', '#5ad86b', '#3ba5f5', '#a57cf0'];
      for (let i = 0; i < 6; i++) {
        const ch = rankStr[i];
        if (ch !== ' ') drawPix(c, ch, 3 + i * 12, 2, ch === '1' ? '#fff27a' : cols[i], 1);
        else { c.fillStyle = '#16345e'; c.fillRect(3 + i * 12, 2, 3, 5); }
      }
      s.tex.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------ wave pool */
  function updateWavePool(t) {
    const st = D.lastStart('wave', t);
    const nx = D.nextStart('wave', t);
    const W = P.W;
    const active = st != null && t - st < 34;
    W.update(t, active || (nx != null && nx - t < 3.2) ? (active ? st : nx) : null);
    // screens
    let txt;
    const lightsOn = active && t - st < 30;
    if (lightsOn) txt = 'WAVE';
    else { const rem = Math.max(0, Math.ceil((nx != null ? nx : t + 99) - t)); txt = (rem > 99 ? 99 : rem).toString().padStart(2, '0'); }
    const s = D.scr1;
    const key = txt + (lightsOn ? Math.floor(t * 4) % 4 : '');
    if (s.last !== key) {
      s.last = key;
      const c = s.ctx;
      c.fillStyle = '#071e3d'; c.fillRect(0, 0, 44, 26);
      if (txt === 'WAVE') {
        for (let x = 0; x < 44; x++) {
          const y = 13 + Math.round(Math.sin(x * 0.45 - t * 6) * 4);
          c.fillStyle = '#7ff2ff'; c.fillRect(x, y, 1, 2);
          c.fillStyle = '#2e8fe0'; c.fillRect(x, y + 2, 1, 26 - y - 2);
        }
      } else {
        drawPix(c, '0:' + txt, 5, 5, '#ffe55c', 3);
      }
      s.tex.needsUpdate = true;
    }
    const s2 = D.scr2;
    const k2 = Math.floor(t * 3) % 6;
    if (s2.last !== k2) {
      s2.last = k2;
      const c = s2.ctx;
      c.fillStyle = '#071e3d'; c.fillRect(0, 0, 44, 26);
      // pixel logo: sun + waves animating
      c.fillStyle = '#ffd83b';
      for (let a = 0; a < 6.28; a += 0.2) c.fillRect(Math.round(22 + Math.cos(a) * 5), Math.round(9 + Math.sin(a) * 5), 1, 1);
      c.fillRect(19, 6, 7, 7);
      for (let x = 0; x < 44; x++) { c.fillStyle = '#5fd0ff'; c.fillRect(x, 19 + Math.round(Math.sin(x * 0.5 + k2) * 1.5), 1, 2); }
      s2.tex.needsUpdate = true;
    }
    // lights row
    for (let i = 0; i < P.waveLights.length; i++) {
      const L = P.waveLights[i];
      const on = lightsOn && ((Math.floor(t * 6) + i) % 3 !== 0);
      D.pools[on ? 'lightOn' : 'lightOff'].pushYaw(L.x, L.y, L.z, 0, 1.4);
    }
    // floats: tubes & beds bob, tilt with the surface, lag behind it, pushed to shore
    const WP = P.W.wave;
    const push = st != null ? sm(st + 6, st + 26, t) * (1 - sm(st + 34, st + 90, t)) : 0;
    // lagged surface
    P.W.wave.update(t - 0.4, active || (nx != null && nx - (t - 0.4) < 3.2) ? (active ? st : nx) : null);
    for (const f of P.poolFloats) {
      const r = Math.min(85, f.r + push * 4.0 * (1 - f.r / 105));
      const th = f.th + Math.sin(t * 0.05 + f.ph) * 0.03;
      const x = Math.sin(th) * r, z = P.L.wave.az + Math.cos(th) * r;
      const h = WP.height(x, z);
      const e = 0.6;
      const hx = WP.height(x + e, z) - WP.height(x - e, z), hz = WP.height(x, z + e) - WP.height(x, z - e);
      const tiltX = Math.atan(hz / (2 * e)), tiltZ = -Math.atan(hx / (2 * e));
      const y = P.L.wave.level + h - 0.06 + Math.sin(t * 1.3 + f.ph) * 0.03;
      const yaw = f.rot + t * 0.04 * (f.ph % 2 ? 1 : -1);
      if (f.kind === 'tube') D.pools['tube' + f.c].pushYaw(x, y, z, yaw, 1, tiltX, tiltZ);
      else D.pools.bed.pushYaw(x, y, z, yaw, 1, tiltX, tiltZ);
    }
    // buoy lines
    for (const bl of P.buoyLines) {
      const half = P.L.wave.half;
      for (let i = 0; i <= bl.n; i++) {
        const th = -half + (i / bl.n) * 2 * half;
        const x = Math.sin(th) * bl.r, z = P.L.wave.az + Math.cos(th) * bl.r;
        const y = P.L.wave.level + WP.height(x, z) - 0.12;
        D.pools[i % 2 ? 'buoyW' : 'buoyY'].pushYaw(x, y, z, th, 1);
      }
    }
    // restore current surface
    P.W.wave.update(t, active || (nx != null && nx - t < 3.2) ? (active ? st : nx) : null);
    // crest spray at breaking zone
    if (active) {
      for (let k = 0; k < WP.NW; k++) {
        if (WP.A[k] < 0.15 || WP.R[k] < 70 || WP.R[k] > 92) continue;
        for (let j = 0; j < 14; j++) {
          const th = (-0.45 + j / 13 * 0.9) * P.L.wave.half;
          const x = Math.sin(th) * (WP.R[k] + 0.6), z = P.L.wave.az + Math.cos(th) * (WP.R[k] + 0.6);
          D.jet(D.water, t, 5000 + k * 50 + j, { x, y: P.L.wave.level + WP.A[k] * 0.9, z, vx: Math.sin(th) * 1.2, vy: 1.6, vz: Math.cos(th) * 1.2, rate: 9, life: 0.7, size: 0.12, jit: 0.25 });
        }
      }
    }
  }

  /* ------------------------------------------------------------ lazy river tubes */
  function updateRiver(t) {
    const path = P.river;
    const L = path.len;
    const v = 1.2;
    const groups = 7, per = 4;
    const rOff = D.tourSched ? (D.tourRiverOffset || 0) : 0;
    const lv = P.L.river.level;
    for (let g = 0; g < groups; g++) {
      for (let j = 0; j < per; j++) {
        const s0 = (g / groups) * L + j * 3.4 + hh(g, j) * 1.2;
        const s = ((s0 + v * t + rOff) % L + L) % L;
        const p = path.at(s);
        const w = Math.sin(t * 0.11 + g * 1.7 + j) * 1.1;
        const x = p.x - p.tz * w, z = p.z + p.tx * w;
        const yaw = Math.atan2(p.tx, p.tz) + t * 0.18 * (j % 2 ? 1 : -1) + j;
        const y = lv - 0.07 + Math.sin(t * 1.6 + g + j * 2) * 0.03;
        D.pools['tube' + ((g + j) % 6)].pushYaw(x, y, z, yaw, 1, Math.sin(t * 1.1 + j) * 0.04, Math.cos(t * 0.9 + g) * 0.04);
        // wet under the curtain & spray arches
        const c = P.curtain;
        if (Math.abs(x - c.x) < 1.2 && z > c.z0 && z < c.z1) D.burst(D.water, t, Math.floor(t * 4) / 4, g * 100 + j, { x, y: lv + 0.4, z, n: 12, hs: 1.5, vs: 2, life: 0.6, size: 0.09, floor: lv });
      }
    }
  }

  /* ------------------------------------------------------------ waterfalls, curtain, outlets */
  function updateFalls(t) {
    P.falls.forEach((f, i) => {
      D.sheet(D.water, t, 7000 + i * 97, { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, y0: f.y0, y1: f.y1, ox: f.ox, oz: f.oz, v0: 0.9, dt: 0.07, amp: 0.92 });
      // foot splash
      const mx = (f.x0 + f.x1) / 2, mz = (f.z0 + f.z1) / 2;
      const H = f.y0 - f.y1;
      const tf = Math.sqrt(2 * H / G);
      const fx = mx + f.ox * 0.9 * tf, fz = mz + f.oz * 0.9 * tf;
      const wlen = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      const n = Math.max(3, Math.round(wlen / 0.9));
      for (let j = 0; j < n; j++) {
        const u = (j + 0.5) / n;
        D.jet(D.water, t, 8000 + i * 61 + j, { x: f.x0 + (f.x1 - f.x0) * u + f.ox * 0.9 * tf, y: f.y1 + 0.05, z: f.z0 + (f.z1 - f.z0) * u + f.oz * 0.9 * tf, vx: f.ox * 0.6, vy: 2.2 + Math.min(2, H * 0.15), vz: f.oz * 0.6, rate: 22, life: 0.8, size: 0.12, jit: 0.45, floor: f.y1 - 0.05 });
      }
    });
    // slide outlets: water flowing out into pools
    for (const r of rides) {
      if (!r.hit || r.kind === 'bowl') continue;
      const last = r.tracks ? r.tracks[r.tracks.length - 1] : r.track;
      const i = Math.max(0, r.hit.i - 2);
      const p = last.p[i], T = last.T[i];
      D.jet(D.water, t, 9100 + rides.indexOf(r) * 13, { x: p.x, y: r.hit.y + 0.12, z: p.z, vx: T.x * 2.5, vy: 0.9, vz: T.z * 2.5, rate: 26, life: 0.55, size: 0.1, jit: 0.25, floor: r.hit.y - 0.05 });
    }
  }

  /* ------------------------------------------------------------ fountain (plaza) */
  function updateFountain(t) {
    const f = P.fountain;
    const st = D.lastStart('fountain', t);
    const e = st != null ? t - st : 1e9;
    const show = e >= 0 && e < 22;
    const rings = f.rings;
    rings.forEach((ring, ri) => {
      ring.forEach(([x, z], j) => {
        let h = 0;
        if (!show) {
          // idle: gentle bubblers on inner rings
          h = ri === 0 ? 1.4 : ri === 1 ? 0.8 : ri === 2 ? 0.35 : 0;
        } else {
          const seg = Math.floor(e / 4.4);
          const le = e - seg * 4.4;
          if (seg === 0) h = [5.5, 3.5, 2.4, 1.6][ri] * sm(ri * 0.6, ri * 0.6 + 0.4, le);
          else if (seg === 1) h = ri === 3 ? 2.6 * Math.max(0, Math.sin(le * 4 - j / ring.length * Math.PI * 4)) : ri === 0 ? 2 : 0.6;
          else if (seg === 2) h = ri === 0 ? 7.5 : ri === 2 ? 3.2 : ri === 1 ? 0 : 1.2;
          else if (seg === 3) h = [6, 4.5, 3.6, 2.8][ri] * (0.75 + 0.25 * Math.sin(le * 3 + ri));
          else h = [5, 3, 2, 1.4][ri] * (1 - sm(0, 4.4, le));
        }
        if (h < 0.1) return;
        const vy = Math.sqrt(2 * G * h);
        const inward = show && e > 8.8 && e < 13.2 && ri === 2 ? 0.8 : 0;
        const dx = -x, dz = 88 - z, l = Math.hypot(dx, dz) || 1;
        D.jet(D.water, t, 20000 + ri * 100 + j, { x, y: f.y + 0.05, z, vx: dx / l * inward, vy, vz: dz / l * inward, rate: Math.min(64, 20 + h * 9), life: Math.max(0.4, 2 * vy / G + 0.2), size: 0.12 + 0.028 * Math.min(h, 3), jit: 0.05, floor: f.y, stretch: 1.7 });
      });
    });
  }

  /* ------------------------------------------------------------ kids area */
  function updateKids(t) {
    const c = P.castle;
    // big bucket cycle
    const b = P.bucket;
    const st = D.lastStart('bucket', t);
    const prev = st;
    let ang = 0, fill = 0, pour = 0, e = 1e9;
    if (st != null) e = t - st;
    const fillStart = (st != null ? st + 9 : -1e9);
    const nx = D.nextStart('bucket', t);
    if (e < 9) {
      if (e < 0) { ang = 0; }
      else if (e < 1.3) ang = Math.pow(e / 1.3, 2.2) * 2.0;
      else if (e < 3.2) ang = 2.0 + Math.sin((e - 1.3) * 1.5) * 0.05;
      else { const k = e - 3.2; ang = 2.0 * Math.exp(-k * 1.25) * Math.cos(k * 3.6); }
      fill = e < 0.6 ? 1 : Math.max(0, 1 - (e - 0.6) * 1.2);
      pour = e > 0.75 && e < 3.6 ? Math.sin(Math.PI * (e - 0.75) / 2.85) : 0;
    } else {
      // filling up toward next event; wobble just before tipping
      const toNext = nx != null ? nx - t : 99;
      fill = clamp((t - fillStart) / Math.max(5, (nx != null ? nx - fillStart : 60) - 2), 0, 1);
      if (toNext < 2.0) ang = Math.sin((2.0 - toNext) * 9) * 0.07 * (2.0 - toNext);
    }
    const pivotY = b.pivotY;
    const bp = D.pools.bucket;
    // bucket centre sits 0.4 m below the axle; rotation about x tips the mouth toward +z
    const ox = 0, oy = -0.4 * Math.cos(ang), oz = 0.4 * Math.sin(ang);
    tmpE.set(ang, 0, 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tA.set(b.x + ox, pivotY + oy, b.z + oz), tmpQ, tmpS.set(V, V, V));
    bp.pushMatrix(tmpM);
    if (fill > 0.02) {
      const wp = D.pools.bucketWater;
      tmpM.compose(tA.set(b.x + ox, pivotY + oy - (1 - fill) * 1.1 * Math.cos(ang), b.z + oz + (1 - fill) * 1.1 * Math.sin(ang)), tmpQ, tmpS.set(V * 0.98, V * Math.max(0.05, fill), V * 0.98));
      wp.pushMatrix(tmpM);
    }
    // filling pipe stream
    if (e > 9 || e < 0) D.sheet(D.water, t, 30001, { x0: b.x - 0.25, z0: b.z - 0.6, x1: b.x + 0.25, z1: b.z - 0.6, y0: pivotY + 0.6, y1: pivotY - 1.3 + fill * 2.0, ox: 0, oz: 0, v0: 0.1, dt: 0.06, amp: 0.95 });
    // overflow lips before tipping
    const toNext = nx != null ? nx - t : 99;
    if (toNext < 3.5 && e > 9) D.sheet(D.water, t, 30002, { x0: b.x - 0.8, z0: b.z + 1.4, x1: b.x + 0.8, z1: b.z + 1.4, y0: pivotY - 0.35, y1: c.lev[4], ox: 0, oz: 1, v0: 0.4, dt: 0.08, amp: 0.45 * sm(3.5, 1.5, toNext) + 0.1 });
    // pour
    if (pour > 0.01) {
      const lipY = pivotY + oy + 1.25 * Math.cos(ang) * 0 - 0.2;
      D.sheet(D.water, t, 30003, { x0: b.x - 1.1, z0: b.z + oz + 1.0, x1: b.x + 1.1, z1: b.z + oz + 1.0, y0: pivotY - 0.6, y1: b.catchY, ox: 0, oz: 1, v0: 1.6, dt: 0.05, amp: pour, alpha: 0.85 });
      D.sheet(D.water, t, 30004, { x0: b.x - 0.9, z0: b.z + oz + 1.3, x1: b.x + 0.9, z1: b.z + oz + 1.3, y0: pivotY - 0.3, y1: b.catchY, ox: 0, oz: 1, v0: 2.4, dt: 0.05, amp: pour * 0.8, alpha: 0.8 });
    }
    // impact splash + cascades down platform edges
    if (e >= 0 && e < 9) {
      D.burst(D.water, t, st + 1.0, 31000, { x: b.x, y: b.catchY + 0.3, z: b.catchZ, n: 160, hs: 4.5, vs: 4.5, life: 1.5, size: 0.14, floor: c.lev[3] - 0.1, r: 1.2 });
      D.burst(D.water, t, st + 1.6, 31001, { x: b.x, y: b.catchY + 0.3, z: b.catchZ, n: 120, hs: 3.6, vs: 3.6, life: 1.4, size: 0.13, floor: c.lev[3] - 0.1, r: 1.5 });
      const cas = [
        [c.cx - 4.25, c.cz + 3.5, c.cx + 4.25, c.cz + 3.5, 5.0, 0.6, 0, 1, 1.5],
        [c.cx - 4.25, c.cz - 3.5, c.cx + 4.25, c.cz - 3.5, 5.0, 0.6, 0, -1, 1.9],
        [c.cx - 2.5, c.cz + 2.5, c.cx + 2.5, c.cz + 2.5, 9.0, 5.0, 0, 1, 1.2],
        [c.cx - 2.5, c.cz - 2.5, c.cx + 2.5, c.cz - 2.5, 9.0, 5.0, 0, -1, 1.3],
        [c.cx + 2.5, c.cz - 2.5, c.cx + 2.5, c.cz + 2.5, 9.0, 5.0, 1, 0, 1.4],
        [c.cx - 2.5, c.cz - 2.5, c.cx - 2.5, c.cz + 2.5, 9.0, 5.0, -1, 0, 1.4],
        [c.cx - 4.25, c.cz - 6.75, c.cx + 4.25, c.cz - 6.75, 7.0, 0.6, 0, -1, 1.8],
      ];
      cas.forEach((q, i) => {
        const k = sm(q[8], q[8] + 0.4, e) * (1 - sm(q[8] + 1.5, q[8] + 4.5, e));
        if (k > 0.03) D.sheet(D.water, t, 31100 + i * 7, { x0: q[0], z0: q[1], x1: q[2], z1: q[3], y0: q[4] - 0.2, y1: q[5], ox: q[6], oz: q[7], v0: 0.7, dt: 0.07, amp: k * 0.9 });
      });
      D.burst(D.water, t, st + 2.0, 31002, { x: c.cx, y: 0.6, z: c.cz + 4.5, n: 90, hs: 3, vs: 2.6, life: 1.2, size: 0.12, floor: 0.5, r: 3 });
    }
    // water wheel (rotating) with feed spout
    const wh = P.wheel;
    const wa = t * 0.9;
    tmpE.set(0, Math.PI / 2, 0); tmpQ.setFromEuler(tmpE);
    const q2 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), wa);
    tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), wa));
    tmpM.compose(tA.set(wh.x, wh.y, wh.z), tmpQ, tmpS.set(FV, FV, FV));
    D.pools.wheel.pushMatrix(tmpM);
    D.sheet(D.water, t, 32000, { x0: wh.x - 0.3, z0: wh.z - 1.5, x1: wh.x + 0.3, z1: wh.z - 1.5, y0: wh.y + 2.6, y1: wh.y + 0.4, ox: 0, oz: 0.3, v0: 0.3, dt: 0.06 });
    D.jet(D.water, t, 32001, { x: wh.x, y: wh.y - 1.8, z: wh.z + 0.6, vx: 0, vy: 0.8, vz: 1.2, rate: 30, life: 0.7, size: 0.1, jit: 0.4, floor: 0.55 });
    // showers & guns (intermittent)
    P.showers.forEach((s, i) => {
      const on = (u) => ((Math.floor(u / 3.0) + i) % 3 !== 0 ? 1 : 0);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; D.jet(D.water, t, 33000 + i * 10 + k, { x: s[0] + Math.cos(a) * 0.15, y: s[1], z: s[2] + Math.sin(a) * 0.15, vx: Math.cos(a) * 0.6, vy: -0.5, vz: Math.sin(a) * 0.6, rate: 14, life: 1.0, size: 0.08, jit: 0.1, on, floor: 0.6 }); }
    });
    P.guns.forEach((g, i) => {
      const on = (u) => ((u + i * 1.7) % 5.0 < 2.6 ? 1 : 0);
      D.jet(D.water, t, 34000 + i, { x: g.x + g.dx * 0.35, y: g.y, z: g.z + g.dz * 0.35, vx: g.dx * 6.5, vy: 2.6, vz: g.dz * 6.5, rate: 55, life: 1.4, size: 0.08, jit: 0.05, on, floor: 0.6 });
    });
    // mini tipping buckets
    P.miniBuckets.forEach((m, i) => {
      const per = 7 + i * 1.3, ph = (t + i * 2.1) % per;
      const a = ph > per - 1.2 ? Math.sin((ph - (per - 1.2)) / 1.2 * Math.PI) * 1.9 : Math.sin(ph * 2) * 0.02;
      D.pools.mbucket.pushYaw(m[0], m[1], m[2], 0, 1, a, 0);
      if (ph > per - 0.9) D.sheet(D.water, t, 35000 + i, { x0: m[0] - 0.3, z0: m[2] + 0.45, x1: m[0] + 0.3, z1: m[2] + 0.45, y0: m[1], y1: 0.6, ox: 0, oz: 1, v0: 0.6, dt: 0.06, amp: 0.9 });
    });
    // mushroom umbrellas: water sheets falling from cap edges
    P.mushrooms.forEach((mu, i) => {
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a0 = k / n * Math.PI * 2, a1 = (k + 0.6) / n * Math.PI * 2;
        D.sheet(D.water, t, 36000 + i * 40 + k, { x0: mu.x + Math.cos(a0) * mu.r, z0: mu.z + Math.sin(a0) * mu.r, x1: mu.x + Math.cos(a1) * mu.r, z1: mu.z + Math.sin(a1) * mu.r, y0: mu.y + 0.1, y1: 0.55, ox: Math.cos(a0), oz: Math.sin(a0), v0: 0.35, dt: 0.08, amp: 0.7 });
      }
    });
    // animal sprayers
    P.animals.forEach((an, i) => {
      const on = (u) => ((u + i * 2.3) % 6 < 4 ? 1 : 0);
      const a = i * 1.9 + 0.5;
      D.jet(D.water, t, 37000 + i, { x: an.x, y: an.y, z: an.z, vx: an.kind === 'whale' ? 0 : Math.cos(a) * 2.2, vy: an.kind === 'whale' ? 5.2 : 3.6, vz: an.kind === 'whale' ? 0 : Math.sin(a) * 2.2, rate: 40, life: 1.3, size: 0.09, jit: an.kind === 'whale' ? 0.25 : 0.06, on, floor: 0.55 });
    });
    // splash pad jets (chasing pattern)
    const sp = P.splashPad;
    sp.jets.forEach(([x, z], j) => {
      const d = Math.hypot(x - sp.x, z - sp.z);
      const on = (u) => (Math.sin(u * 2.2 - d * 1.2) > 0.2 ? 1 : 0);
      D.jet(D.water, t, 38000 + j, { x, y: sp.y + 0.05, z, vy: 5.0, rate: 18, life: 1.1, size: 0.09, jit: 0.04, on, floor: sp.y, stretch: 1.5 });
    });
  }

  /* ------------------------------------------------------------ river features */
  function updateRiverFX(t) {
    // curtain at tunnel portal
    const c = P.curtain;
    // spray arches (intermittent curtains)
    P.sprayArches.forEach((a, i) => {
      const on = (u) => (((u + a.ph) % 9) < 6 ? 1 : 0);
      for (let k = 0; k < 9; k++) {
        const u = 0.1 + 0.8 * k / 8;
        const x = a.ax + (a.bx - a.ax) * u, z = a.az + (a.bz - a.az) * u;
        const y = 4.2 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, 2))) - 0.05;
        D.jet(D.water, t, 40000 + i * 20 + k, { x, y, z, vx: 0, vy: -0.6, vz: 0, rate: 20, life: 1.3, size: 0.1, jit: 0.18, on, floor: P.L.river.level });
      }
    });
    // water cannons
    P.cannons.forEach((cn, i) => {
      const on = (u) => (((u + i * 2.6) % 8) < 3 ? 1 : 0);
      D.jet(D.water, t, 41000 + i, { x: cn.x, y: cn.y, z: cn.z, vx: cn.dx * 6.0, vy: 3.2, vz: cn.dz * 6.0, rate: 70, life: 1.3, size: 0.1, jit: 0.05, on, floor: P.L.river.level });
    });
    // coaster uphill jets (always running)
    const tr = P.coaster.track;
    for (const j of P.coaster.jets) {
      for (let s = j[0] + 0.5; s < j[1]; s += 3.0) {
        const i = Math.round(s / tr.ds);
        const p = tr.p[i], T = tr.T[i], U = tr.U[i];
        D.jet(D.water, t, 42000 + i, { x: p.x - U.x * 1.3, y: p.y - U.y * 1.3 + 0.1, z: p.z - U.z * 1.3, vx: T.x * 3.0, vy: T.y * 3.0 + 1.0, vz: T.z * 3.0, rate: 10, life: 0.5, size: 0.08, jit: 0.15 });
      }
    }
    // spa bubbles & overflow
    for (const tr2 of P.spaTiers) {
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + tr2.x;
        const rr = tr2.r * 0.6;
        D.jet(D.water, t, 43000 + Math.round(tr2.x * 10) + k, { x: tr2.x + Math.cos(a) * rr, y: tr2.lv - 0.6, z: tr2.z + Math.sin(a) * rr, vx: 0, vy: 1.0, vz: 0, g: -0.05, rate: 10, life: 0.62, size: 0.07, jit: 0.06 });
      }
    }
    for (let i = 0; i < P.spaTiers.length - 1; i++) {
      const a = P.spaTiers[i], b = P.spaTiers[i + 1];
      const x = a.x + a.r * 0.6 + 0.5, z = a.z + a.r * 0.6 + 0.5;
      if (b.lv < a.lv) D.sheet(D.water, t, 44000 + i, { x0: x - 0.4, z0: z, x1: x + 0.4, z1: z, y0: a.lv, y1: b.lv - 0.05, ox: 0.6, oz: 0.6, v0: 0.4, dt: 0.07, amp: 0.85 });
    }
    // surf whitewater along the standing wave crest
    const s = P.L.surf;
    for (let k = 0; k < 16; k++) {
      const x = s.cx - 7.5 + k * 1.0;
      const u = 0.58, dz = 11 - u * 22;
      const y = -0.5 + 2.9 * Math.pow(u, 1.8) + 1.25;
      D.jet(D.water, t, 45000 + k, { x, y, z: s.cz + dz + 0.3, vx: 0, vy: 2.2, vz: -2.4, rate: 24, life: 0.8, size: 0.13, jit: 0.3 });
      D.jet(D.water, t, 45100 + k, { x: x + 0.5, y: -0.1, z: s.cz + 10.6, vx: 0, vy: 1.2, vz: -4.5, rate: 14, life: 0.5, size: 0.1, jit: 0.3 });
    }
  }

  /* ------------------------------------------------------------ wind props */
  function updateWind(t) {
    // umbrellas
    (P.umbrellas || []).forEach((u, i) => {
      const ph = i * 1.37;
      const tx = Math.sin(t * 1.3 + ph) * 0.035 + 0.02, tz = Math.cos(t * 1.1 + ph * 1.3) * 0.035;
      D.pools['ucan' + u.c].pushYaw(u.x, u.y, u.z, i * 0.4, 1, tx, tz);
    });
    // pennant strings
    (P.pennants || []).forEach((s, si) => {
      for (let i = 0; i <= s.n; i++) {
        const u = i / s.n;
        const x = s.a[0] + (s.b[0] - s.a[0]) * u, z = s.a[2] + (s.b[2] - s.a[2]) * u;
        const y = s.a[1] + (s.b[1] - s.a[1]) * u - Math.sin(Math.PI * u) * (s.sag || 0.6);
        const yaw = Math.atan2(s.b[0] - s.a[0], s.b[2] - s.a[2]) + Math.PI / 2;
        const sway = Math.sin(t * 3.1 + i * 0.7 + si) * 0.35 + 0.35;
        D.pools['pen' + ((i + si) % 6)].pushYaw(x, y, z, yaw, 1, sway, 0);
      }
    });
    // flags on masts
    (P.flags || []).forEach((f, i) => {
      const yaw = -0.6 + Math.sin(t * 0.7 + i) * 0.15;
      const fl = Math.sin(t * 4.5 + i * 2) * 0.12;
      const name = f.col === M.sky ? 'flag0' : f.col === M.lemon ? 'flag1' : f.col === M.red ? 'flag2' : 'flag3';
      D.pools[name].pushYaw(f.x, f.y, f.z, yaw + fl, f.small ? 0.7 : 1.0, 0, 0);
    });
    // windsock
    const w = P.windsock;
    if (w) {
      for (let i = 0; i < 6; i++) {
        const yaw = Math.atan2(-0.8, -0.6) + Math.sin(t * 1.4 - i * 0.6) * 0.1 * (i / 5);
        const d = 0.2 + i * 0.4;
        const droop = i * i * 0.014 + Math.sin(t * 2 - i) * 0.03 * i / 5;
        const s = 1 - i * 0.1;
        D.pools[i % 2 ? 'sockW' : 'sockR'].pushYaw(w.x + Math.sin(yaw) * d, w.y - droop, w.z + Math.cos(yaw) * d, yaw, s, 0, 0);
      }
    }
    // cabana curtains (tied at front corners), gentle sway
    (P.cabanas || []).forEach((c, i) => {
      for (const s of [-1, 1]) {
        const lx = s * 1.25, lz = 1.3;
        const ca = Math.cos(c.ry), sa = Math.sin(c.ry);
        const x = c.x + lx * ca + lz * sa, z = c.z - lx * sa + lz * ca;
        const sw = Math.sin(t * 1.6 + i + s) * 0.08 + 0.04;
        D.pools.curtain.pushYaw(x, c.y + 2.55, z, c.ry + (s > 0 ? Math.PI : 0), 1, sw, 0);
      }
    });
  }

  /* ------------------------------------------------------------ conveyors, lilies, boats */
  function updateMisc(t) {
    for (const cv of P.conveyors) {
      const n = Math.floor(cv.L / 2.4);
      for (let i = 0; i < n; i++) {
        const u = (((t * 0.55 + i * 2.4) % cv.L) + cv.L) % cv.L / cv.L;
        const x = cv.a[0] + (cv.b[0] - cv.a[0]) * u, y = cv.a[1] + (cv.b[1] - cv.a[1]) * u, z = cv.a[2] + (cv.b[2] - cv.a[2]) * u;
        const yaw = Math.atan2(cv.b[0] - cv.a[0], cv.b[2] - cv.a[2]);
        const pitch = -Math.atan2(cv.b[1] - cv.a[1], Math.hypot(cv.b[0] - cv.a[0], cv.b[2] - cv.a[2]));
        D.pools['tube' + (i % 6)].pushYaw(x, y + 0.05, z, yaw, 1, pitch, 0);
      }
    }
    // lily pads bobbing
    for (const [i, l] of (P.lilies || []).entries()) {
      D.pools.lily.pushYaw(l.x, P.L.act.level - 0.02 + Math.sin(t * 1.4 + i) * 0.03, l.z, i * 0.9, 1, Math.sin(t * 1.1 + i * 2) * 0.05, Math.cos(t * 0.9 + i) * 0.05);
    }
    // boats
    const boats = [[600, -700, 1, 0.35, 3.2], [900, -1300, -1, 0.2, 2.6], [380, -1050, 1, -0.5, 2.2], [1300, -500, -1, 0.1, 2.8], [-300, -900, 1, 0.4, 2.0]];
    boats.forEach(([x0, z0, dir, ang, sp], i) => {
      const d = ((t * sp * dir + i * 300) % 1600 + 1600) % 1600 - 800;
      const x = x0 + Math.cos(ang) * d, z = z0 + Math.sin(ang) * d;
      const yaw = Math.atan2(Math.cos(ang) * dir, Math.sin(ang) * dir);
      D.pools.sailboat.pushYaw(x, P.L.seaY - 0.3 + Math.sin(t * 0.8 + i) * 0.1, z, yaw, 1.6, Math.sin(t * 0.6 + i) * 0.03, Math.sin(t * 0.5 + i * 2) * 0.05 + 0.08 * dir);
    });
    const sd = (t * 4.0) % 6000 - 3000;
    D.pools.ship.pushYaw(1200 + sd * 0.9, P.L.seaY - 1.2, -2500 + sd * 0.25, Math.atan2(0.9, 0.25), 1);
  }

  /* ------------------------------------------------------------ foam sources per water mesh */
  function updateFoam(t) {
    const meshes = P.W.meshes;
    for (const name in meshes) {
      const mat = meshes[name].material;
      const arr = mat.uniforms.uFoamSrc.value;
      let n = 0;
      const st = D.foamStatic[name] || [];
      for (const f of st) { if (n < 8) arr[n++].set(f[0], f[1], f[2], f[3]); }
      for (; n < 8; n++) arr[n].set(0, 0, 1, 0);
    }
  }

  /* ------------------------------------------------------------ main update */
  D.update = function (t, dt) {
    D.water.begin();
    for (const k in D.pools) D.pools[k].begin();
    updateRides(t);
    updateVertical(t);
    updateRace(t);
    updateWavePool(t);
    updateRiver(t);
    updateFalls(t);
    updateFountain(t);
    updateKids(t);
    updateRiverFX(t);
    updateWind(t);
    updateMisc(t);
    updateFoam(t);
    D.water.end();
    for (const k in D.pools) D.pools[k].end();
  };
  D.rides = rides;
  P.buildDynamic = function (scene) { D.init(scene); };
})();
