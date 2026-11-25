/* life: events, wind, clouds, leaves, water, mechanisms, creatures */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C, L = W.L, U = W.U;
  const life = (W.life = {});
  const PI = Math.PI, TAU = PI * 2;
  let RS = W.rng(7); // sim rng (reset per run)
  const sm = W.smooth;

  // ================= events =================
  const EV = (W.ev = { gusts: [], clouds: [], cats: [], foxes: [], crows: [], turtles: [], leaves: [] });
  function genLive() {
    const h = W.hash;
    EV.gusts = []; EV.clouds = []; EV.cats = []; EV.foxes = []; EV.crows = []; EV.turtles = []; EV.leaves = [];
    for (let k = 0; k < 900; k++) EV.gusts.push(16 + k * 46 + h(k) * 12);
    for (let k = 0; k < 600; k++) EV.clouds.push(38 + k * 71 + h(k + 50) * 14);
    for (let k = 0; k < 450; k++) EV.cats.push({ t: 24 + k * 95 + h(k + 90) * 15, route: k % 3 });
    for (let k = 0; k < 700; k++) EV.foxes.push(10 + k * 58 + h(k + 130) * 10);
    for (let k = 0; k < 1100; k++) EV.crows.push(30 + k * 37 + h(k + 170) * 9);
    for (let k = 0; k < 800; k++) EV.turtles.push(20 + k * 52 + h(k + 210) * 10);
  }
  life.setEvents = function (ev) { Object.assign(EV, ev); };
  life.genLive = genLive;
  function lastBefore(arr, t, get) {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const v = get ? get(arr[mid]) : arr[mid]; if (v <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  // ================= wind & cloud =================
  const WD = new V3(-0.97, 0, -0.24).normalize();
  U.uWindDir.value.set(WD.x, WD.z);
  const GS = 5.2, S0 = -21, S1 = 23, DECAY = 9;
  const gustEnd = (S1 - S0) / GS;
  function gustInfo(t) {
    const i = lastBefore(EV.gusts, t);
    if (i < 0) return { front: -999, amp: 0, e: 999 };
    const e = t - EV.gusts[i];
    const amp = 0.7 * sm(0, 0.8, e) * (1 - sm(gustEnd, gustEnd + 5, e));
    return { front: S0 + GS * e, amp, e };
  }
  function gustAtInfo(gi, x, z) {
    const s = x * WD.x + z * WD.z; const d = gi.front - s;
    return gi.amp * sm(-1, 1.5, d) * Math.exp(-Math.max(d, 0) / DECAY);
  }
  life.gustAt = (x, z, t) => gustAtInfo(gustInfo(t), x, z);
  const CP0 = new V3(32, 0, 12), CP1 = new V3(-32, 0, -12);
  let CDUR = 30;
  const CD = CP1.clone().sub(CP0).normalize();
  U.uCloudDir.value.set(CD.x, CD.z);
  function cloudInfo(t) {
    const i = lastBefore(EV.clouds, t);
    if (i < 0) return { x: 999, z: 999, amt: 0 };
    const e = (t - EV.clouds[i]) / CDUR;
    if (e > 1) return { x: 999, z: 999, amt: 0 };
    const p = CP0.clone().lerp(CP1, e);
    return { x: p.x, z: p.z, amt: 0.84 * sm(0, 0.08, e) * (1 - sm(0.92, 1, e)) };
  }
  function cloudAtCPU(ci, x, z) {
    const dx = x - ci.x, dz = z - ci.z;
    const a = dx * CD.x + dz * CD.z, b = -dx * CD.z + dz * CD.x;
    const r = Math.hypot(a / 1.25, b / 0.8) / 14 + 0.17;
    return 1 - ci.amt * (1 - sm(0.62, 0.95, r));
  }
  life.cloudInfo = cloudInfo;

  // ================= helpers =================
  function prep(geo, color, fx) {
    const g = geo.clone();
    const n = g.attributes.position.count;
    const c = C(color === undefined ? 0xffffff : color);
    const ca = new Float32Array(n * 3), fa = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; fa[i * 4] = fx[0]; fa[i * 4 + 1] = fx[1]; fa[i * 4 + 2] = fx[2]; fa[i * 4 + 3] = fx[3]; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('fx', new THREE.BufferAttribute(fa, 4));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(W.WHITE_UV[0]), 2));
    else { const u = g.attributes.uv; for (let i = 0; i < n; i++) u.setXY(i, W.WHITE_UV[0], W.WHITE_UV[1]); }
    return g;
  }
  W.prepGeo = prep;
  // simple rig node: Bucket-built mesh
  function node(name, parent, buildFn, pos) {
    const b = new W.Bucket(name);
    buildFn(new W.Ctx(b));
    const m = b.mesh(W.mat);
    m.name = name;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    (parent || W.scene).add(m);
    return m;
  }
  const surface = function (x, z) {
    const P = W.pondInfo;
    const pr = Math.hypot(x - P.CX, z - P.CZ);
    if (pr < P.RI) { const a = Math.atan2(z - P.CZ, x - P.CX); if (!(a > P.TH1 && a < P.TH2)) return { y: P.WY + 0.012, type: 'water' }; }
    if (pr < P.RO + 0.05) return { y: P.RIM, type: 'ground' };
    // studio roofs / floor
    const S = L.STUDIO;
    if (x < -4.45 && z < S.z1 + 2.05 && x > -16 && z > S.z0 - 0.9) {
      const ri = W.roofInfo;
      if (z < ri.ridgeZ && x < -5.35) return { y: ri.ridgeY + 0.15 - (ri.ridgeZ - z) * Math.tan(ri.pitch), type: 'roof' };
      if (z > S.z1 && z < S.z1 + 2.05) return { y: W.lerp(4.2, 3.55, (z - S.z1) / 2.05), type: 'roof' };
      if (x > -6 && x < -4.45) return { y: W.lerp(4.2, 3.55, (x + 6) / 1.55), type: 'roof' };
      return { y: S.floor + 0.07, type: 'floor' };
    }
    if (Math.abs(x - L.SHRINE.x) < 2.4 && z > L.SHRINE.z - 2.4 && z < L.SHRINE.z + 2.7) return { y: L.TERR_Y + 3.6, type: 'roof' };
    const ds = W.distToStream(x, z);
    if (ds[0] < L.streamWidth(ds[1]) * 0.7 && W.region(x, z) === 'bed') return { y: -0.115, type: 'stream', u: ds[1] };
    return { y: W.H(x, z) + 0.012, type: 'ground' };
  };
  life.surface = surface;

  // ================= ripples =================
  let ripIdx = 0;
  function ripple(x, z, t, amp) {
    const r = W.waterUniforms.uRip.value[ripIdx % 16];
    r.set(x, z, t, amp || 1);
    ripIdx++;
    life.lastRipple = { x, z, t };
  }
  life.ripple = ripple;

  // ================= falling leaves =================
  const LEAVES = [];
  let leafMesh = {};
  const NM = 150, NG = 230;
  const mapleCols = [0xd0301a, 0xe0481c, 0xc02018, 0xec6a1c, 0xb81e18, 0xf28a24];
  const ginkCols = [0xf2b81e, 0xf7c934, 0xe8a616, 0xfad55a];
  function buildLeaves() {
    ['maple', 'ginkgo'].forEach((kind) => {
      const n = kind === 'maple' ? NM : NG;
      const geo = prep(W.g.leaf(kind), 0xffffff, [0, 0, 0, 7.0]);
      const m = new THREE.InstancedMesh(geo, W.mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      const cols = kind === 'maple' ? mapleCols : ginkCols;
      const RR = W.rng(kind === 'maple' ? 5 : 6);
      for (let i = 0; i < n; i++) {
        m.setColorAt(i, W.jit(cols[i % cols.length], 0.3, RR));
        LEAVES.push({ kind, i, mesh: m, mode: 'idle', p: new V3(0, -50, 0), q: new THREE.Quaternion(), s: 0.15, age: 0, life: 0, ph: 0, ax: new V3(1, 0, 0), u: 0, lat: 0 });
      }
      m.instanceColor.needsUpdate = true;
      W.scene.add(m);
      leafMesh[kind] = m;
    });
  }
  const spawnSrc = { maple: [], ginkgo: [] };
  function collectSources() {
    W.treeList.forEach((t) => {
      if (t.kind === 'maple') t.clusters.forEach((c) => spawnSrc.maple.push(c));
      if (t.kind === 'ginkgo') t.clusters.forEach((c) => spawnSrc.ginkgo.push(c));
    });
  }
  function takeLeaf(kind) {
    let best = null, bestAge = -1;
    for (const l of LEAVES) {
      if (l.kind !== kind) continue;
      if (l.mode === 'idle') return l;
      if ((l.mode === 'ground' || l.mode === 'rest') && l.age > bestAge) { bestAge = l.age; best = l; }
    }
    return best;
  }
  function spawnLeaf(kind, pos, opts) {
    const l = takeLeaf(kind);
    if (!l) return null;
    l.mode = 'fall'; l.age = 0;
    l.p.copy(pos);
    l.c0 = pos.clone();
    l.ph = RS() * TAU;
    l.s = (kind === 'maple' ? 0.17 : 0.16) * RS.range(0.85, 1.2);
    l.ax.set(RS() - 0.5, 0, RS() - 0.5).normalize();
    l.spin = RS.range(4, 7) * (RS() < 0.5 ? -1 : 1);
    l.drift = new V3(RS.range(-0.15, 0.15), 0, RS.range(-0.15, 0.15));
    l.scripted = opts && opts.scripted;
    return l;
  }
  life.spawnLeaf = spawnLeaf;
  function randomSource(kind) {
    const arr = spawnSrc[kind]; if (!arr.length) return null;
    const c = arr[Math.floor(RS() * arr.length)];
    const d = new V3(RS() - 0.5, -RS() * 0.6, RS() - 0.5).normalize().multiplyScalar(c.r * 0.9);
    return c.c.clone().add(d);
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3();
  let spawnAcc = { maple: 0, ginkgo: 0 }, lastBurstGust = -1;
  function updateLeaves(t, dt, gi) {
    // spawn
    const rate = { maple: 1.6, ginkgo: 2.0 };
    ['maple', 'ginkgo'].forEach((k) => {
      spawnAcc[k] += dt * rate[k] * (1 + gi.amp * 1.5);
      while (spawnAcc[k] >= 1) { spawnAcc[k] -= 1; const p = randomSource(k); if (p) spawnLeaf(k, p); }
    });
    // ginkgo burst when the gust front passes the tree
    const gs = L.GINKGO.x * WD.x + L.GINKGO.z * WD.z;
    const gIdx = lastBefore(EV.gusts, t);
    if (gIdx >= 0 && gIdx !== lastBurstGust && gi.front > gs - 1 && gi.amp > 0.3) {
      lastBurstGust = gIdx;
      for (let i = 0; i < 70; i++) { const p = randomSource('ginkgo'); if (p) spawnLeaf('ginkgo', p); }
    }
    const P = W.pondInfo;
    for (const l of LEAVES) {
      if (l.mode === 'idle') continue;
      l.age += dt;
      if (l.mode === 'fall') {
        const g = gustAtInfo(gi, l.p.x, l.p.z);
        const wind = WD.clone().multiplyScalar(0.12 + g * 3.2).add(l.drift);
        if (l.kind === 'maple') {
          l.ph += l.spin * dt;
          l.c0.addScaledVector(wind, dt); l.c0.y -= 0.42 * dt;
          l.p.set(l.c0.x + Math.cos(l.ph) * 0.16, l.c0.y, l.c0.z + Math.sin(l.ph) * 0.16);
          _e.set(l.ph * 0.9, l.ph * 1.7, 0.7 + Math.sin(l.ph) * 0.4);
          l.q.setFromEuler(_e);
        } else {
          l.ph += 2.3 * dt;
          const sw = Math.sin(l.ph);
          l.c0.addScaledVector(wind, dt);
          l.c0.y -= 0.5 * (0.45 + 0.75 * Math.abs(Math.cos(l.ph))) * dt;
          l.p.copy(l.c0).addScaledVector(l.ax, sw * 0.38);
          l.p.y += -Math.abs(sw) * 0.06;
          _q.setFromAxisAngle(new V3(-l.ax.z, 0, l.ax.x), sw * 0.9);
          l.q.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), l.ph * 0.2));
        }
        const sf = surface(l.p.x, l.p.z);
        if (l.p.y <= sf.y || l.p.y < -3) {
          l.p.y = sf.y;
          if (sf.type === 'water') { l.mode = 'water'; l.age = 0; ripple(l.p.x, l.p.z, t, 1); }
          else if (sf.type === 'stream') { l.mode = 'stream'; l.u = sf.u; l.lat = 0; l.age = 0; }
          else { l.mode = 'ground'; l.age = 0; }
          l.q.setFromEuler(_e.set(0, RS() * TAU, 0));
        }
      } else if (l.mode === 'water') {
        l.p.x += Math.sin(t * 0.3 + l.ph) * 0.04 * dt + WD.x * 0.03 * dt;
        l.p.z += Math.cos(t * 0.27 + l.ph) * 0.04 * dt + WD.z * 0.03 * dt;
        l.p.y = P.WY + 0.012 + Math.sin(t * 1.6 + l.p.x * 2) * 0.006;
        const r = Math.hypot(l.p.x - P.CX, l.p.z - P.CZ);
        if (r > P.RI - 0.15) { const f = (P.RI - 0.15) / r; l.p.x = P.CX + (l.p.x - P.CX) * f; l.p.z = P.CZ + (l.p.z - P.CZ) * f; }
        if (l.age > 70) l.mode = 'idle';
      } else if (l.mode === 'stream') {
        const curve = L.streamCurve;
        l.u += dt * 0.42 / curve.getLength();
        if (l.u >= 0.995) { l.mode = 'water'; l.age = 0; const e = curve.getPointAt(1); l.p.set(e.x + 0.3, P.WY, e.z + 0.5); ripple(l.p.x, l.p.z, t, 0.5); continue; }
        const cp = curve.getPointAt(l.u), tg = curve.getTangentAt(l.u);
        l.lat *= Math.exp(-dt * 0.5);
        l.p.set(cp.x - tg.z * (l.lat + Math.sin(t + l.ph) * 0.08), -0.115 + Math.sin(t * 3 + l.ph) * 0.004, cp.z + tg.x * (l.lat + Math.sin(t + l.ph) * 0.08));
        _q.setFromAxisAngle(new V3(0, 1, 0), t * 0.5 + l.ph);
        l.q.copy(_q);
      } else if (l.mode === 'ground') {
        const g = gustAtInfo(gi, l.p.x, l.p.z);
        if (g > 0.45 && RS() < dt * 0.6 && l.kind === 'ginkgo') { l.mode = 'fall'; l.c0.copy(l.p).add(new V3(0, 0.6, 0)); }
        if (l.age > 240) { l.mode = 'idle'; }
      }
    }
    // write matrices
    for (const k of ['maple', 'ginkgo']) {
      const m = leafMesh[k];
      for (const l of LEAVES) {
        if (l.kind !== k) continue;
        let s = l.s;
        if (l.mode === 'idle') s = 0;
        else if (l.mode === 'ground' && l.age > 225) s *= Math.max(0, (240 - l.age) / 15);
        else if (l.mode === 'water' && l.age > 60) s *= Math.max(0, (70 - l.age) / 10);
        _s.set(s, s, s);
        _m4.compose(l.p, l.q, _s);
        m.setMatrixAt(l.i, _m4);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  }
  life.leaves = LEAVES;

  // ================= puffs (steam & smoke) =================
  const puffs = [];
  function makePuffs(pos, n, opts) {
    const g = new THREE.BufferGeometry();
    const p = [], d = [];
    const R = W.rng(Math.round(pos.x * 100 + pos.z * 7));
    for (let i = 0; i < n; i++) { p.push(pos.x, pos.y, pos.z); d.push(i / n + R() * 0.02, R.range(0.8, 1.2), 0, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(d, 4));
    const m = new THREE.Points(g, W.makePuffMat(opts));
    m.layers.set(W.LAYER.FX); m.frustumCulled = false; m.renderOrder = 10;
    W.scene.add(m);
    const o = { m, pos, bendK: opts.bendK || 0.3 };
    puffs.push(o);
    return o;
  }

  // ================= creatures: builders =================
  function koiModel(k, pattern) {
    const root = new THREE.Group(); W.scene.add(root);
    const base = { kohaku: 0xf6f2ea, sanke: 0xf6f2ea, ogon: 0xf2b83a, showa: 0x2a2626, asagi: 0x7a8ea8, beni: 0xe0441e, yamabuki: 0xf2cc3a }[pattern];
    const patch = (lx, ly, lz) => {
      const n = W.noise2(lx * 7 + k * 3.1, lz * 5 + ly * 3 + k);
      if (pattern === 'kohaku') return n > 0.5 && ly > -0.02 ? C(0xe03a1c) : C(base);
      if (pattern === 'sanke') return n > 0.55 && ly > -0.02 ? C(0xe03a1c) : (W.noise2(lx * 13 + 9, lz * 11) > 0.78 ? C(0x1a1a1a) : C(base));
      if (pattern === 'showa') return n > 0.5 ? C(0xe0441e) : (W.noise2(lx * 9 + 4, lz * 8) > 0.6 ? C(0xf6f2ea) : C(base));
      if (pattern === 'asagi') return ly < -0.02 ? C(0xe8742a) : C(base);
      return C(base);
    };
    const body = node('koi' + k, root, (c) => {
      const prof = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; const r = Math.sin(Math.pow(t, 0.62) * PI) * 0.13 * (1 - t * 0.55) + 0.006; prof.push([r, (t - 0.42) * 0.92]); }
      const g = W.g.lathe(prof, 14, 'koiBody');
      c.add(g, 0xffffff, [0, 0, 0], [-PI / 2, 0, 0], [1, 1, 0.82], [0.0, 0, 0, pattern === 'ogon' || pattern === 'yamabuki' ? 9.0 : 0], null, (lx, ly, lz) => patch(lx, lz, ly));
      c.add(W.g.sph(1, 6), 0x111111, [0.06, 0.035, 0.32], null, 0.016);
      c.add(W.g.sph(1, 6), 0x111111, [-0.06, 0.035, 0.32], null, 0.016);
      const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.12, -0.05); fin.lineTo(0.1, 0.04); fin.closePath();
      c.add(W.g.shape(fin, 'koiFin'), 0xf6efe6, [0.08, -0.04, 0.2], [PI / 2 - 0.3, 0, -0.3], 1, [0.1, 0, 0, 7.0]);
      c.add(W.g.shape(fin, 'koiFin'), 0xf6efe6, [-0.08, -0.04, 0.2], [PI / 2 - 0.3, PI, 0.3], 1, [0.1, 0, 0, 7.0]);
      const df = new THREE.Shape(); df.moveTo(0, 0); df.lineTo(0.22, 0); df.quadraticCurveTo(0.1, 0.08, 0.0, 0.06); df.closePath();
      c.add(W.g.shape(df, 'koiDorsal'), base === 0x2a2626 ? 0x3a3434 : 0xf0e6dc, [0, 0.1, 0.05], [0, -PI / 2, 0], 1, [0.05, 0, 0, 7.0]);
    });
    const tail = node('koiTail' + k, body, (c) => {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.12, -0.12, 0.08, -0.26); sh.quadraticCurveTo(0, -0.18, -0.08, -0.26); sh.quadraticCurveTo(-0.12, -0.12, 0, 0);
      c.add(W.g.shape(sh, 'koiTailS'), pattern === 'showa' ? 0x2a2626 : 0xf8efe4, [0, 0, 0], [PI / 2, 0, 0], 1, [0.1, 0, 0, 7.0]);
    }, [0, 0, -0.38]);
    return { root, body, tail };
  }
  function turtleModel() {
    const root = new THREE.Group(); W.scene.add(root);
    node('turtle', root, (c) => {
      c.add(W.g.sph(1, 14), 0x4a5a2a, [0, 0.06, 0], null, [0.22, 0.1, 0.27], [0, 0, 0, 0], null, (lx, ly, lz) => C((Math.floor(lx * 9 + 9) + Math.floor(lz * 9 + 9)) % 2 ? 0x5a6a32 : 0x3e4c24));
      c.add(W.g.sph(1, 10), 0x7a8a4a, [0, 0.03, 0.3], null, [0.07, 0.06, 0.09]);
      c.add(W.g.sph(1, 6), 0x111111, [0.04, 0.06, 0.36], null, 0.012);
      c.add(W.g.sph(1, 6), 0x111111, [-0.04, 0.06, 0.36], null, 0.012);
      [[0.18, 0.15], [-0.18, 0.15], [0.17, -0.17], [-0.17, -0.17]].forEach((p) => c.add(W.g.sph(1, 8), 0x7a8a4a, [p[0], 0.01, p[1]], null, [0.07, 0.025, 0.05]));
      c.add(W.g.cone(0.03, 0.08, 6), 0x7a8a4a, [0, 0.02, -0.3], [-PI / 2, 0, 0], 1);
    });
    return { root };
  }
  function dragonflyModel(i) {
    const root = new THREE.Group(); W.scene.add(root);
    node('dfly' + i, root, (c) => {
      c.add(W.g.cyl(0.008, 0.005, 0.16, 6), 0xd02a1a, [0, 0, -0.05], [PI / 2, 0, 0], 1, [0.15, 0, 0, 0]);
      c.add(W.g.sph(1, 8), 0xb83a22, [0, 0, 0.04], null, [0.016, 0.014, 0.022]);
      c.add(W.g.sph(1, 8), 0x8a2a1a, [0, 0.004, 0.065], null, 0.014);
    });
    const wings = [];
    [[1, 0.035], [-1, 0.035], [1, 0.01], [-1, 0.01]].forEach((w, k) => {
      wings.push(node('dwing' + i + k, root, (c) => {
        const sh = new THREE.Shape(); sh.absellipse(0.05, 0, 0.05, 0.012, 0, TAU);
        c.add(W.g.shape(sh, 'dwing'), 0xe8f0f4, [0, 0, 0], [-PI / 2, 0, 0], [w[0], 1, 1], [0.2, 0, 0, 7.0]);
      }, [0, 0.008, w[1]]));
    });
    return { root, wings };
  }
  function birdModel(i, crow) {
    const root = new THREE.Group(); W.scene.add(root);
    const s = crow ? 2.6 : 1.45;
    const bc = crow ? 0x1c1a22 : 0x8a6440, hc = crow ? 0x1c1a22 : 0x6a3a22;
    const body = node('bird' + i, root, (c) => {
      c.add(W.g.sph(1, 10), bc, [0, 0, 0], null, [0.045 * s, 0.04 * s, 0.065 * s], [0, 0, 0, 0], null, (lx, ly) => (crow ? C(bc) : C(ly < -0.01 ? 0xe8dcc8 : bc)));
      c.add(W.g.sph(1, 8), hc, [0, 0.03 * s, 0.05 * s], null, 0.03 * s);
      c.add(W.g.cone(0.008 * s, 0.025 * s, 5), crow ? 0x2a2a2a : 0x3a3030, [0, 0.028 * s, 0.085 * s], [PI / 2, 0, 0], 1);
      c.add(W.g.box(0.03 * s, 0.005 * s, 0.05 * s), bc, [0, 0.0, -0.08 * s], [-0.3, 0, 0], 1);
      if (!crow) { c.add(W.g.sph(1, 5), 0xf6f2ea, [0.022, 0.025, 0.06], null, 0.01); c.add(W.g.sph(1, 5), 0xf6f2ea, [-0.022, 0.025, 0.06], null, 0.01); }
    });
    const wl = node('bwl' + i, root, (c) => c.add(W.g.box(0.08 * s, 0.006 * s, 0.05 * s), crow ? 0x24222a : 0x6a4a30, [0.04 * s, 0, 0], null, 1), [0.03 * s, 0.015 * s, 0]);
    const wr = node('bwr' + i, root, (c) => c.add(W.g.box(0.08 * s, 0.006 * s, 0.05 * s), crow ? 0x24222a : 0x6a4a30, [-0.04 * s, 0, 0], null, 1), [-0.03 * s, 0.015 * s, 0]);
    return { root, body, wl, wr };
  }
  function catModel() {
    const root = new THREE.Group(); W.scene.add(root);
    const calico = (lx, ly, lz) => {
      const n = W.noise2(lx * 6 + 3, lz * 6 + ly * 4);
      if (ly < -0.03) return C(0xf8f2e8);
      return n > 0.62 ? C(0xe0862e) : n < 0.3 ? C(0x2e2a28) : C(0xf8f2e8);
    };
    const body = node('catBody', root, (c) => {
      c.add(W.g.sph(1, 14), 0xffffff, [0, 0, 0], null, [0.11, 0.1, 0.22], [0, 0, 0, 0], null, calico);
    }, [0, 0.2, 0]);
    const head = node('catHead', body, (c) => {
      c.add(W.g.sph(1, 14), 0xffffff, [0, 0, 0], null, [0.085, 0.075, 0.08], [0, 0, 0, 0], null, (lx, ly, lz) => (lx > 0.01 && ly > 0 ? C(0xe0862e) : lx < -0.01 && ly > 0.01 ? C(0x2e2a28) : C(0xf8f2e8)));
      c.add(W.g.cone(0.03, 0.06, 4), 0xe0862e, [0.045, 0.07, -0.01], [0, 0, -0.3], 1);
      c.add(W.g.cone(0.03, 0.06, 4), 0x2e2a28, [-0.045, 0.07, -0.01], [0, 0, 0.3], 1);
      c.add(W.g.sph(1, 6), 0x2a3a2a, [0.032, 0.012, 0.07], null, [0.012, 0.016, 0.008]);
      c.add(W.g.sph(1, 6), 0x2a3a2a, [-0.032, 0.012, 0.07], null, [0.012, 0.016, 0.008]);
      c.add(W.g.sph(1, 6), 0xe88a8a, [0, -0.012, 0.08], null, 0.01);
      for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 2; k++) c.add(W.g.box(0.08, 0.002, 0.002), 0xf8f8f8, [s * 0.06, -0.015 - k * 0.01, 0.06], [0, 0, s * (0.1 - k * 0.15)], 1);
    }, [0, 0.07, 0.22]);
    const tail = node('catTail', body, (c) => {
      const pts = [new V3(0, 0, 0), new V3(0, 0.08, -0.1), new V3(0.02, 0.18, -0.14), new V3(0.03, 0.26, -0.1)];
      c.add(W.g.tube(pts, 0.025, 0.018, 6, 10), 0xe0862e, null, null, undefined, [0, 0, 0, 0], null, (lx, ly) => C(Math.floor(ly * 30) % 2 ? 0xe0862e : 0x2e2a28));
    }, [0, 0.02, -0.2]);
    const legs = [];
    [[0.06, 0.13], [-0.06, 0.13], [0.06, -0.14], [-0.06, -0.14]].forEach((p, i) => {
      legs.push(node('catLeg' + i, body, (c) => {
        c.add(W.g.cyl(0.025, 0.022, 0.17, 6), 0xf8f2e8, [0, -0.085, 0], null, 1);
        c.add(W.g.sph(1, 6), 0xf8f2e8, [0, -0.17, 0.01], null, [0.028, 0.02, 0.035]);
      }, [p[0], -0.03, p[1]]));
    });
    return { root, body, head, tail, legs };
  }
  function foxModel() {
    const root = new THREE.Group(); W.scene.add(root); root.scale.setScalar(1.35);
    const body = node('foxBody', root, (c) => {
      c.add(W.g.sph(1, 14), 0xf6eee2, [0, 0, 0], null, [0.11, 0.13, 0.2]);
    }, [0, 0.22, 0]);
    const head = node('foxHead', body, (c) => {
      c.add(W.g.sph(1, 12), 0xf8f6f2, [0, 0, 0], null, [0.08, 0.075, 0.085]);
      c.add(W.g.cone(0.045, 0.14, 8), 0xf8f6f2, [0, -0.015, 0.11], [PI / 2, 0, 0], 1);
      c.add(W.g.sph(1, 6), 0x2a2222, [0, -0.012, 0.18], null, 0.012);
      c.add(W.g.cone(0.035, 0.11, 4), 0xf8f6f2, [0.045, 0.09, -0.01], [0, 0, -0.25], 1);
      c.add(W.g.cone(0.035, 0.11, 4), 0xf8f6f2, [-0.045, 0.09, -0.01], [0, 0, 0.25], 1);
      c.add(W.g.box(0.03, 0.006, 0.004), 0xd8281e, [0.035, 0.015, 0.075], [0, 0, 0.2], 1, [0.4, 0, 0, 0]);
      c.add(W.g.box(0.03, 0.006, 0.004), 0xd8281e, [-0.035, 0.015, 0.075], [0, 0, -0.2], 1, [0.4, 0, 0, 0]);
    }, [0, 0.16, 0.13]);
    const tail = node('foxTail', body, (c) => {
      const pts = [new V3(0, 0, 0), new V3(0.05, 0.02, -0.15), new V3(0.12, 0.1, -0.25), new V3(0.1, 0.25, -0.22)];
      c.add(W.g.tube(pts, (t) => 0.04 + Math.sin(t * PI) * 0.05, 0, 8, 12), 0xf8f6f2, null, null, undefined, [0, 0, 0, 0]);
    }, [0, -0.05, -0.17]);
    const legs = [];
    [[0.05, 0.1], [-0.05, 0.1], [0.05, -0.1], [-0.05, -0.1]].forEach((p, i) => legs.push(node('foxLeg' + i, body, (c) => c.add(W.g.cyl(0.018, 0.015, 0.2, 6), 0xf8f6f2, [0, -0.1, 0], null, 1), [p[0], -0.05, p[1]])));
    return { root, body, head, tail, legs };
  }
  function goldfishModel(i) {
    const root = new THREE.Group(); W.scene.add(root);
    node('gf' + i, root, (c) => {
      c.add(W.g.sph(1, 8), 0xf06a1e, [0, 0, 0], null, [0.025, 0.03, 0.05]);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.04, -0.06); sh.lineTo(-0.04, -0.06); sh.closePath();
      c.add(W.g.shape(sh, 'gfTail'), 0xf6a060, [0, 0, -0.04], [PI / 2, 0, 0], 1, [0.1, 0, 0, 7.0]);
    });
    return { root };
  }

  // ================= build =================
  let koi = [], turtle, dflies = [], birds = [], crow, cat, fox, goldfish = [], spoutMesh, kakehiMesh, splash;
  life.build = function () {
    genLive();
    buildLeaves();
    // puffs
    (W.teaCups || []).forEach((p) => makePuffs(p.clone(), 34, { color: 0xffffff, shade: 0xd4d8ec, rise: 0.42, life: 3.4, size: 0.085, spread: 0.03, alpha: 0.32, bendK: 0.2 }));
    if (W.kettleSpout) makePuffs(W.kettleSpout.clone(), 40, { color: 0xffffff, shade: 0xd0d6ea, rise: 0.6, life: 2.8, size: 0.12, spread: 0.045, alpha: 0.36, bendK: 0.25 });
    (W.benchCups || []).forEach((p) => makePuffs(p.clone(), 26, { color: 0xffffff, shade: 0xd8dcee, rise: 0.38, life: 3.2, size: 0.075, spread: 0.028, alpha: 0.3, bendK: 0.6 }));
    if (W.leafPile) W.smoke = makePuffs(W.leafPile.clone(), 60, { color: 0xeeeae6, shade: 0xb8b4c8, rise: 2.2, life: 7.0, size: 0.24, spread: 0.1, alpha: 0.26, bendK: 1.6 });
    // spout water (temizuya) and kakehi stream into shishi-odoshi
    const flowTube = (a, b, r) => {
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(r, r * 0.8, len, 8, 6, true);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getY(i), uv.getX(i));
      const m = new THREE.Mesh(g, W.makeFlowMat({ speed: 1.6, scale: 0.4, tint: 0xa8e0ec }));
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new V3(0, 1, 0), a.clone().sub(b).normalize());
      m.layers.set(W.LAYER.FX); m.renderOrder = 3;
      W.scene.add(m);
      return m;
    };
    if (W.temizuSpout) spoutMesh = flowTube(W.temizuSpout.clone().add(new V3(-0.02, -0.01, 0)), new V3(W.temizuSpout.x - 0.1, W.temizuWater.y, W.temizuSpout.z), 0.022);
    if (W.kakehiEnd) kakehiMesh = flowTube(W.kakehiEnd.clone(), W.kakehiEnd.clone().add(new V3(0, -0.28, 0.02)), 0.018);
    // splash puffs at waterfall foot
    splash = makePuffs(new V3(6.2, -0.1, -3.15), 16, { color: 0xffffff, shade: 0xc8e4f0, rise: 0.35, life: 1.4, size: 0.12, spread: 0.18, alpha: 0.5, bendK: 0.1 });
    // creatures
    const pats = ['kohaku', 'ogon', 'sanke', 'showa', 'kohaku', 'asagi', 'beni', 'yamabuki'];
    pats.forEach((p, k) => {
      const m = koiModel(k, p);
      const R = W.rng(700 + k);
      m.prm = { rMid: R.range(1.8, 3.2), rAmp: R.range(0.3, 0.7), angAmp: R.range(1.4, 2.4), w: R.range(0.07, 0.12) * (R() < 0.5 ? -1 : 1), ph: R() * TAU, ph2: R() * TAU, depth: R.range(0.18, 0.55), scale: R.range(0.85, 1.25) };
      m.off = new V3(); m.prev = null;
      koi.push(m);
    });
    turtle = turtleModel();
    for (let i = 0; i < 3; i++) dflies.push(dragonflyModel(i));
    for (let i = 0; i < 4; i++) birds.push(birdModel(i));
    crow = birdModel(9, true);
    cat = catModel();
    fox = foxModel();
    for (let i = 0; i < 3; i++) goldfish.push(goldfishModel(i));
    collectSources();
    setupPerches();
    life.reset();
  };

  // ================= reset (deterministic start) =================
  life.reset = function (seed) {
    RS = W.rng(seed || 4242);
    LEAVES.forEach((l) => { l.mode = 'idle'; l.age = 0; });
    spawnAcc = { maple: 0, ginkgo: 0 }; lastBurstGust = -1;
    W.waterUniforms.uRip.value.forEach((r) => r.set(0, 0, -100, 0));
    life.lastRipple = null;
    ripIdx = 0;
    // prefill: some leaves already resting on the ground
    for (let i = 0; i < 90; i++) {
      const k = i % 3 ? 'ginkgo' : 'maple';
      const p = randomSource(k); if (!p) continue;
      const l = spawnLeaf(k, p);
      if (!l) continue;
      l.p.x += RS.range(-1.5, 1.5); l.p.z += RS.range(-1.5, 1.5);
      const sf = surface(l.p.x, l.p.z);
      if (sf.type === 'water' || sf.type === 'stream') { l.mode = 'idle'; continue; }
      l.p.y = sf.y; l.mode = 'ground'; l.age = RS() * 120; l.q.setFromEuler(_e.set(0, RS() * TAU, 0));
    }
    hang.clear();
    koi.forEach((k) => { k.off.set(0, 0, 0); k.prev = null; k.attract = null; });
    birds.forEach((b, i) => { b.state = 'perch'; b.perch = PERCH.normal[i * 2 % PERCH.normal.length]; b.timer = RS.range(2, 6); b.from = null; b.flee = 0; b.root.position.copy(b.perch.p); });
    BIRD_SCRIPT.forEach((s) => { s.done = false; });
    pwAngles.fill(0); pwSpeeds.fill(0);
    pageState = { dir: 1, lastGust: -1, flips: [0, 0, 0, 0], start: -100 };
    sheetLift = [0, 0]; sheetVel = [0, 0];
    catState = { look: 0 };
    foxState = { hide: 0 };
  };

  // ================= hanging things: damped springs driven by wind =================
  const hang = new Map();
  function swingUpdate(p, t, dt, gi, gain) {
    let s = hang.get(p);
    if (!s) { s = { ax: 0, vx: 0, az: 0, vz: 0 }; hang.set(p, s); }
    const pos = p.pivot;
    const g = gustAtInfo(gi, pos.x, pos.z);
    const br = 0.12 * (Math.sin(t * 1.3 + pos.x) * 0.6 + Math.sin(t * 2.9 + pos.z * 1.7) * 0.4);
    const force = (br + g * 2.6 * (0.85 + 0.3 * Math.sin(t * 9 + pos.x * 3))) * (p.swing || 0.1) * (gain || 1);
    const k = 9, c = 1.4;
    // force along wind dir → rotation around axis perpendicular
    s.vx += (-k * s.ax - c * s.vx + force * 12 * WD.z * -1) * dt;
    s.vz += (-k * s.az - c * s.vz + force * 12 * WD.x) * dt;
    s.ax += s.vx * dt; s.az += s.vz * dt;
    p.mesh.rotation.set(s.ax, 0, s.az);
    return s;
  }
  hang.clear = Map.prototype.clear;

  // ================= perches =================
  const PERCH = { normal: [], safe: [], drink: [] };
  function setupPerches() {
    const tt = W.toriiTop;
    if (tt) [-1.2, -0.5, 0.6, 1.4].forEach((x) => PERCH.normal.push({ p: new V3(tt.x + x, tt.y + 0.03 + Math.pow(Math.abs(x) / 2.4, 2.6) * 0.26, tt.z), kind: 'torii' }));
    (W.lanternGlows || []).slice(0, 4).forEach((g) => PERCH.normal.push({ p: new V3(g.x, g.y + 0.6, g.z), kind: 'lantern' }));
    if (W.temizuWater) { const w = W.temizuWater; [-0.42, 0.05, 0.38].forEach((x) => PERCH.drink.push({ p: new V3(w.x + x, w.y + 0.03, w.z - 0.27), kind: 'drink' })); }
    PERCH.drink.forEach((d) => PERCH.normal.push(d));
    if (W.emaRackPos) PERCH.normal.push({ p: W.emaRackPos.clone().add(new V3(0, 0.95, 0)), kind: 'ema' });
    (W.treeList || []).filter((t) => t.kind === 'sugi').forEach((t) => PERCH.safe.push({ p: new V3(t.x, t.y + t.h * 0.9, t.z + 0.6), kind: 'safe' }));
    PERCH.safe.push({ p: new V3(L.GINKGO.x, 12.6, L.GINKGO.z - 0.3), kind: 'safe' });
  }

  // ================= pinwheels / pages / sheets state =================
  let pwAngles = [], pwSpeeds = [];
  let pageState, sheetLift = [0, 0], sheetVel = [0, 0], catState, foxState;

  // ================= main update =================
  const _v = new V3(), _w = new V3();
  life.update = function (t, dt) {
    const gi = gustInfo(t);
    const breeze = 0.1 + 0.035 * Math.sin(t * 0.13) + 0.02 * Math.sin(t * 0.37);
    U.uWind.value.set(breeze, gi.front, gi.amp, DECAY);
    const ci = cloudInfo(t);
    U.uCloud.value.set(ci.x, ci.z, 14, ci.amt);
    const studioCl = cloudAtCPU(ci, -11, -9);
    U.uInDark.value = 1 - studioCl;
    life.gi = gi; life.ci = ci;
    // shaft opacity dims under cloud (handled in shader); dust motes amount
    if (W.dustMotes) W.dustMotes.material.uniforms.uAmt.value = 1 - ci.amt * 0.7;
    if (dt <= 0) { writeAll(t, 0, gi); return; }
    updateLeaves(t, dt, gi);
    writeAll(t, dt, gi);
  };

  function writeAll(t, dt, gi) {
    const camPos = W.render.camera.position;
    // ---------- studio mechanics ----------
    if (W.parts) {
      const fanR = W.fanRotor; if (fanR && fanR.mesh) fanR.mesh.rotation.y = t * 0.75;
      if (W.pendulum && W.pendulum.mesh) W.pendulum.mesh.rotation.z = Math.sin(t * PI) * 0.16;
      if (W.planetMobile && W.planetMobile.mesh) W.planetMobile.mesh.rotation.y = t * 0.09 + Math.sin(t * 0.21) * 0.15;
      if (dt > 0) (W.hangers || []).forEach((p) => p.mesh && swingUpdate(p, t, dt, gi, p.chime ? 1.6 : 1));
      const sc = W.parts.find((p) => p.name === 'scarf');
      if (sc && sc.mesh && dt > 0) swingUpdate(sc, t, dt, gi, 0.7);
      // shishi-odoshi
      if (W.shishi && W.shishi.mesh) W.shishi.mesh.rotation.x = shishiAngle(t);
      // lifting sheets
      (W.liftSheets || []).forEach((p, i) => {
        if (!p.mesh) return;
        const g = gustAtInfo(gi, p.pivot.x, p.pivot.z);
        const target = g > 0.12 ? Math.min(0.9, g * 1.6) * (0.75 + 0.25 * Math.sin(t * 11 + i * 2)) : 0;
        if (dt > 0) { sheetVel[i] += ((target - sheetLift[i]) * 30 - sheetVel[i] * 6) * dt; sheetLift[i] = Math.max(0, sheetLift[i] + sheetVel[i] * dt); }
        p.mesh.rotation.set(0, p.baseRotY, 0);
        p.mesh.rotateX(-sheetLift[i] * (i === 0 ? 1 : 0.7));
      });
      // notebook pages flip
      if (W.notePages && W.notePages.length) {
        const sp = W.notePages[0].pivot;
        const g = gustAtInfo(gi, sp.x, sp.z);
        const gIdx = lastBefore(EV.gusts, t);
        if (g > 0.25 && gIdx !== pageState.lastGust) { pageState.lastGust = gIdx; pageState.start = t; pageState.dir *= -1; }
        W.notePages.forEach((p, i) => {
          const e = t - pageState.start - i * 0.32;
          const k = sm(0, 0.55, e);
          const from = pageState.dir > 0 ? PI : 0, to = pageState.dir > 0 ? 0 : PI;
          const a = pageState.start < 0 ? 0 : W.lerp(from, to, k);
          p.mesh.rotation.set(0, 0, a + Math.sin(a) * 0.0);
          p.mesh.position.set(p.pivot.x, p.pivot.y + i * 0.0015, p.pivot.z);
        });
      }
      // pinwheels: spin when breeze strong or gust passes, order along rack
      (W.pinwheels || []).forEach((p, i) => {
        if (!p.mesh) return;
        if (pwAngles.length < W.pinwheels.length) { pwAngles = new Array(W.pinwheels.length).fill(0); pwSpeeds = new Array(W.pinwheels.length).fill(0); }
        const g = gustAtInfo(gi, p.pivot.x, p.pivot.z);
        const br = Math.max(0, Math.sin(t * 0.23 + p.phase * 0.3) * 0.6 + Math.sin(t * 0.71 + p.phase) * 0.4 - 0.25);
        const want = br * 5 + g * 26;
        if (dt > 0) { pwSpeeds[i] += (want - pwSpeeds[i]) * (1 - Math.exp(-dt * (want > pwSpeeds[i] ? 3 : 0.7))); pwAngles[i] += pwSpeeds[i] * dt; }
        p.mesh.quaternion.copy(p.baseQ);
        p.mesh.rotateZ(pwAngles[i]);
      });
    }
    // ---------- orrery ----------
    orreryUpdate(t, dt);
    // ---------- puffs bending ----------
    puffs.forEach((o) => {
      const g = gustAtInfo(gi, o.pos.x, o.pos.z);
      const k = (0.06 + g * 1.4) * o.bendK;
      o.m.material.uniforms.uBend.value.set(WD.x * k, WD.z * k);
    });
    // ---------- creatures ----------
    koiUpdate(t, dt, camPos);
    turtleUpdate(t, dt);
    dragonflyUpdate(t, dt);
    birdUpdate(t, dt, gi, camPos);
    crowUpdate(t);
    catUpdate(t, dt, camPos);
    foxUpdate(t, dt, camPos);
    goldfish.forEach((g, i) => {
      const a = t * (0.5 + i * 0.13) + i * 2.1;
      const r = 0.18 + 0.08 * Math.sin(t * 0.3 + i);
      const jar = W.goldfishJar;
      g.root.position.set(jar.x + Math.cos(a) * r, jar.y + 0.02 + Math.sin(t * 0.7 + i) * 0.03, jar.z + Math.sin(a) * r);
      g.root.rotation.set(0, -a + (i % 2 ? 0 : 0), 0);
      g.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + 0;
      g.root.lookAt(jar.x + Math.cos(a + 0.3) * r, g.root.position.y, jar.z + Math.sin(a + 0.3) * r);
    });
    // ---------- lights ----------
    lightsUpdate(t);
  }

  // ---------- shishi-odoshi ----------
  const SP = 7.5;
  let SHISHI_OFF = 3.0, ORR_OFF = 0, BIRD_SCRIPT = [], DFLY_OVR = null;
  life.tourOverrides = function (on) {
    if (!on) { SHISHI_OFF = 3.0; ORR_OFF = 0; BIRD_SCRIPT = []; DFLY_OVR = null; CDUR = 30; return; }
    CDUR = 20;
    const T = W.tour;
    const tp = T.leafTime ? T.leafTime(0.183) : T.shotStart('streamLeaf') + 0.87; // spout tips as the leaf drifts past
    SHISHI_OFF = ((5.2 - (tp % SP)) % SP + SP) % SP;
    const tf = T.shotStart('orrery') + 2.6;
    ORR_OFF = ((ORP / 2 - (tf % (ORP / 2))) % (ORP / 2) + ORP / 2) % (ORP / 2);
    const ts = T.shotStart('temizu');
    BIRD_SCRIPT = isFinite(ts) ? [{ t: ts - 5.0, i: 0, k: 0 }, { t: ts - 4.4, i: 1, k: 2 }, { t: ts - 6.0, i: 2, k: 1 }] : [];
    const tk = T.shotStart('koi');
    DFLY_OVR = { i: 0, t0: tk - 3, t1: tk + 6, p: W.limes[0].clone().add(new V3(0.42, 0.04, 0.32)) };
  };
  function shishiAngle(t) {
    const a0 = 0.32, a1 = -0.5;
    const e = ((t + SHISHI_OFF) % SP + SP) % SP;
    if (e < 5.0) return a0 - 0.08 * sm(0.5, 5.0, e);
    if (e < 5.4) return W.lerp(a0 - 0.08, a1, sm(5.0, 5.4, e));
    if (e < 5.7) return a1;
    if (e < 5.95) return W.lerp(a1, a0 + 0.07, sm(5.7, 5.95, e));
    const k = e - 5.95;
    return a0 + 0.07 * Math.cos(k * 14) * Math.exp(-k * 4.5);
  }
  life.shishiAngle = shishiAngle;
  life.shishiPhase = (t) => ((t + SHISHI_OFF) % SP + SP) % SP;

  // ---------- orrery ----------
  const ORP = 90;
  function orreryUpdate(t0, dt) {
    const t = t0 + ORR_OFF;
    const rings = W.orreryRings; if (!rings) return;
    rings.forEach((r) => {
      if (!r.mesh) return;
      const a = r.k * TAU * t / ORP;
      if (r.axis === 'y') r.mesh.rotation.set(0, a, 0); else r.mesh.rotation.set(a, 0, 0);
    });
    // star projection follows ring0
    const a0 = rings[0].k * TAU * t / ORP;
    const m = new THREE.Matrix4().makeRotationY(-a0 * 0.5);
    U.uOrrRot.value.setFromMatrix4(m);
    // alignment flash every ORP/2 seconds
    const e = ((t % (ORP / 2)) + ORP / 2) % (ORP / 2);
    const fl = e < 2.6 ? Math.exp(-e * 1.6) * sm(0, 0.15, e) : 0;
    U.uFlash.value = fl;
    life.orreryFlash = fl;
    if (W.orb) { W.orb.material.uniforms.uGlow.value = 0.5 + 0.25 * Math.sin(t * 0.9) + U.uInDark.value * 0.7; W.orb.rotation.y = t * 0.15; }
    U.uStarAmt.value = 0.28 + U.uInDark.value * 0.9 + fl * 1.2;
    if (W.orbBurst) {
      const b = W.orbBurst;
      b.visible = e < 3.2;
      const s = 0.25 + sm(0, 3.0, e) * 2.4;
      b.scale.set(s, s, s);
      b.material.uniforms.uAmt.value = (1 - sm(1.0, 3.2, e)) * 1.6;
    }
    if (W.orbHalo) { const c = W.orbHalo.geometry.attributes.aCol; c.setW(0, 0.3 + fl * 0.8 + U.uInDark.value * 0.35); c.setW(1, 0.22 + 0.1 * Math.sin(t * 0.9) + fl * 0.6); c.needsUpdate = true; }
    (W.orbBodies || []).forEach((b, i) => { if (!b.mesh) return; b.mesh.rotation.set(b.tilt, t * b.speed * 2, b.tilt * 0.5); });
  }

  // ---------- point lights ----------
  function lightsUpdate(t) {
    const dark = U.uInDark.value;
    const pl = U.uPL.value, pc = U.uPLc.value;
    const oc = W.orreryCenter;
    const fl = life.orreryFlash || 0;
    if (oc) {
      pl[0].set(oc.x, oc.y, oc.z, 4.8); pc[0].set(0.42, 0.66, 1.0, 0.55 + 0.25 * dark + fl * 0.9 + 0.08 * Math.sin(t * 0.9));
      pl[1].set(oc.x, oc.y - 0.2, oc.z, 2.6); pc[1].set(1.0, 0.85, 0.55, 0.3 + 0.2 * dark + fl * 0.5);
    }
    const lantern = (i, p, r, c, a) => { if (!p) return; pl[i].set(p.x, p.y, p.z, r); pc[i].set(c[0], c[1], c[2], a); };
    const warm = [1.0, 0.72, 0.42];
    lantern(2, W.lanternPos && W.lanternPos[0], 3.2, warm, 0.22 + dark * 0.5);
    lantern(3, W.lanternPos && W.lanternPos[1], 3.2, warm, 0.22 + dark * 0.5);
    lantern(4, W.andonPos, 2.4, warm, 0.25 + dark * 0.45);
    lantern(5, W.deskLamp, 2.0, [1.0, 0.8, 0.5], 0.35 + dark * 0.3);
    lantern(6, W.sideLamp, 2.0, warm, 0.25 + dark * 0.4);
    lantern(7, W.kettleSpout ? W.kettleSpout.clone().add(new V3(-0.2, -0.2, 0)) : null, 1.6, [1.0, 0.45, 0.2], 0.3 + dark * 0.2);
  }

  // ---------- koi ----------
  function koiUpdate(t, dt, cam) {
    const P = W.pondInfo;
    const lr = life.lastRipple;
    koi.forEach((k, i) => {
      const q = k.prm;
      const mid = 3.61, a = mid + q.angAmp * Math.sin(q.w * t * 2.2 + q.ph);
      const r = q.rMid + q.rAmp * Math.sin(q.w * t * 1.5 + q.ph2);
      const base = new V3(P.CX + Math.cos(a) * r, P.WY - q.depth, P.CZ + Math.sin(a) * r);
      // attraction to recent landing leaf
      if (lr && t - lr.t < 7 && t - lr.t >= 0) {
        const d = Math.hypot(lr.x - base.x, lr.z - base.z);
        if (d < 3.2 && dt > 0) { _v.set(lr.x - base.x - k.off.x, 0, lr.z - base.z - k.off.z); k.off.addScaledVector(_v, dt * 0.5); }
      }
      // scatter from camera
      const cd = Math.hypot(cam.x - (base.x + k.off.x), cam.z - (base.z + k.off.z)), cy = cam.y - P.WY;
      if (dt > 0) {
        if (cd < 3.6 && cy < 4.5) { _v.set(base.x + k.off.x - cam.x, 0, base.z + k.off.z - cam.z).normalize(); k.off.addScaledVector(_v, dt * 2.2 * (1 - cd / 3.6) * 2); }
        else k.off.multiplyScalar(Math.exp(-dt * 0.35));
        if (k.off.length() > 2.2) k.off.setLength(2.2);
      }
      const p = base.clone().add(k.off);
      // keep inside & out of wedge
      let rr = Math.hypot(p.x - P.CX, p.z - P.CZ), aa = Math.atan2(p.z - P.CZ, p.x - P.CX);
      if (rr > P.RI - 0.45) rr = P.RI - 0.45;
      if (aa > P.TH1 - 0.25 && aa < P.TH2 + 0.25) aa = aa < (P.TH1 + P.TH2) / 2 ? P.TH1 - 0.25 : P.TH2 + 0.25;
      if (p.z > 15.8) p.z = 15.8;
      p.x = P.CX + Math.cos(aa) * rr; p.z = Math.min(15.75, P.CZ + Math.sin(aa) * rr);
      if (!k.prev) k.prev = p.clone();
      const vel = p.clone().sub(k.prev);
      if (vel.lengthSq() > 1e-8) k.heading = Math.atan2(vel.x, vel.z);
      k.prev.copy(p);
      k.root.position.copy(p);
      k.root.rotation.set(0, k.heading || 0, 0);
      k.root.scale.setScalar(q.scale);
      const sw = Math.sin(t * 6 + i * 1.7);
      k.body.rotation.y = sw * 0.08;
      k.tail.rotation.y = Math.sin(t * 6 + i * 1.7 - 1.0) * 0.45;
      life.koiPos = life.koiPos || []; life.koiPos[i] = p;
    });
  }

  // ---------- turtle ----------
  function turtleUpdate(t) {
    if (!turtle || !W.limes) return;
    const A = W.limes[0], Bp = W.limes[5];
    const i = lastBefore(EV.turtles, t);
    const n = i < 0 ? 0 : i + 1;
    const from = n % 2 ? Bp : A, to = n % 2 ? A : Bp;
    let pos, ry = 0.6, pitch = 0;
    const e = i < 0 ? 999 : t - EV.turtles[i];
    const fromP = (n - 1) % 2 ? Bp : A;
    const toP = (n - 1) % 2 ? A : Bp;
    if (i < 0 || e > 10) { pos = (i < 0 ? A : toP).clone(); pos.y += 0.02; ry = 0.6 + (i < 0 ? 0 : 2.4); }
    else {
      const dir = toP.clone().sub(fromP); const head = Math.atan2(dir.x, dir.z);
      if (e < 1.2) { const k = sm(0, 1.2, e); pos = fromP.clone().addScaledVector(dir.clone().normalize(), k * 0.45); pos.y = fromP.y + 0.02 - k * 0.32; pitch = k * 0.5; ry = head; }
      else if (e < 8.5) { const k = sm(1.2, 8.5, e); pos = fromP.clone().lerp(toP, k); pos.y = W.WATER_Y - 0.28 + Math.sin(k * PI) * -0.05; ry = head + Math.sin(e * 2) * 0.1; }
      else { const k = sm(8.5, 10, e); pos = toP.clone().addScaledVector(dir.clone().normalize(), (k - 1) * 0.45); pos.y = W.WATER_Y - 0.28 + k * 0.32; pitch = -(1 - k) * 0.5; ry = head; }
    }
    turtle.root.position.copy(pos);
    turtle.root.rotation.set(pitch, ry, 0);
    life.turtlePos = pos;
  }
  life.turtleEvent = (t) => { const i = lastBefore(EV.turtles, t); return i < 0 ? 999 : t - EV.turtles[i]; };

  // ---------- dragonflies ----------
  function dflyPerches() {
    const arr = [];
    (W.limes || []).forEach((l) => arr.push(l.clone().add(new V3(0, 0.05, 0))));
    (W.limeSteps || []).slice(0, 3).forEach((l) => arr.push(l.clone().add(new V3(0, 0.02, 0))));
    if (W.shishi && W.shishi.pivot) arr.push(W.shishi.pivot.clone().add(new V3(0.3, 0.35, 0.25)));
    arr.push(new V3(4.95, 1.4, 7.3), new V3(-5.25, 1.35, 15.1), new V3(14.3, 1.4, 9.6));
    return arr;
  }
  let DFP = null;
  function dragonflyUpdate(t) {
    if (!DFP) DFP = dflyPerches();
    dflies.forEach((d, i) => {
      const slot = 6.5, n = Math.floor((t + i * 2.3) / slot), e = (t + i * 2.3) - n * slot;
      const pa = DFP[Math.floor(W.hash(n * 3 + i * 17) * DFP.length)], pb = DFP[Math.floor(W.hash((n + 1) * 3 + i * 17) * DFP.length)];
      let p, flying;
      if (DFLY_OVR && DFLY_OVR.i === i && t > DFLY_OVR.t0 && t < DFLY_OVR.t1) {
        const q = DFLY_OVR.p.clone();
        const k = W.clamp((t - DFLY_OVR.t0) / 1.6, 0, 1);
        const st = d.root.position.lengthSq() > 0 ? d.root.position.clone() : q.clone().add(new V3(0, 1, 0));
        if (k < 1) { q.lerp(st, 1 - W.easeS(k)); q.y += Math.sin(k * PI) * 0.3; }
        d.root.position.copy(q); d.root.rotation.set(0, 0.8, 0);
        d.wings.forEach((w, kk) => { w.rotation.z = (kk % 2 ? -1 : 1) * (k < 1 ? Math.sin(t * 60 + kk) * 0.6 : 0.05); });
        return;
      }
      if (e < 4.0) { p = pa.clone(); p.y += 0.01; flying = false; if (e < 0.25 || e > 3.75) p.y += 0.03; }
      else { const k = sm(4.0, 6.5, e); p = pa.clone().lerp(pb, k); p.y += Math.sin(k * PI) * 1.0 + Math.sin(t * 7) * 0.05; p.x += Math.sin(t * 3 + i) * 0.12 * Math.sin(k * PI); flying = true; }
      d.root.position.copy(p);
      const head = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      d.root.rotation.set(0, flying ? head : head + 0.4, 0);
      d.wings.forEach((w, k) => { w.rotation.z = (k % 2 ? -1 : 1) * (flying ? Math.sin(t * 60 + k) * 0.6 : 0.05); });
    });
    life.dflyPos = dflies.map((d) => d.root.position);
  }

  // ---------- sparrows ----------
  function birdUpdate(t, dt, gi, cam) {
    if (dt > 0) BIRD_SCRIPT.forEach((s) => { if (!s.done && t >= s.t) { s.done = true; const b = birds[s.i]; if (b && PERCH.drink[s.k]) { startFly(b, PERCH.drink[s.k], 1.6); b.stay = 11; } } });
    birds.forEach((b, i) => {
      if (dt > 0) {
        b.timer -= dt;
        const here = b.state === 'fly' ? null : b.perch.p;
        const near = here && cam.distanceTo(here) < 2.15;
        const g = here ? gustAtInfo(gi, here.x, here.z) : 0;
        if (b.state === 'perch' && (near || g > 0.3)) { startFly(b, PERCH.safe[Math.floor(RS() * PERCH.safe.length)], 2.6); b.flee = 1; }
        else if (b.state === 'perch' && b.timer <= 0) {
          const pool = RS() < 0.4 ? PERCH.drink : PERCH.normal;
          let np = pool[Math.floor(RS() * pool.length)];
          if (np === b.perch) np = PERCH.normal[(PERCH.normal.indexOf(np) + 1) % PERCH.normal.length];
          if (cam.distanceTo(np.p) > 3.0) startFly(b, np, 1.6); else b.timer = 2;
        } else if (b.state === 'fly') {
          b.fk += dt / b.fdur;
          if (b.fk >= 1) { b.state = 'perch'; b.timer = b.stay ? b.stay : (b.perch.kind === 'safe' ? RS.range(9, 14) : RS.range(3, 8)); b.stay = 0; }
        }
      }
      let p;
      if (b.state === 'fly') {
        const k = W.easeS(Math.min(1, b.fk));
        p = b.from.clone().lerp(b.perch.p, k); p.y += Math.sin(k * PI) * (0.8 + b.from.distanceTo(b.perch.p) * 0.15);
        const dir = b.perch.p.clone().sub(b.from);
        b.root.rotation.set(-0.15, Math.atan2(dir.x, dir.z), 0);
        const f = Math.sin(t * 38 + i) * 0.9;
        b.wl.rotation.set(0, 0, f); b.wr.rotation.set(0, 0, -f);
      } else {
        p = b.perch.p.clone();
        const hop = Math.max(0, Math.sin(t * 2.3 + i * 1.3)) > 0.97 ? 0.03 : 0;
        p.y += hop;
        const peck = b.perch.kind === 'drink' ? Math.max(0, Math.sin(t * 3 + i)) : 0;
        b.root.rotation.set(peck * 0.6, b.perch.kind === 'drink' ? Math.sin(i * 2.3) * 0.5 : (i * 1.7 + Math.floor(t / 2.5 + i) * 0.9) % TAU, 0);
        b.wl.rotation.set(0, -1.3, 0.1); b.wr.rotation.set(0, 1.3, -0.1);
      }
      b.root.position.copy(p);
    });
    life.birdPos = birds.map((b) => b.root.position);
  }
  function startFly(b, perch, dur) { b.from = b.root.position.clone(); if (b.from.lengthSq() < 1e-6) b.from = b.perch.p.clone(); b.perch = perch; b.state = 'fly'; b.fk = 0; b.fdur = dur + b.from.distanceTo(perch.p) * 0.05; }

  // ---------- crow ----------
  function crowUpdate(t) {
    const i = lastBefore(EV.crows, t);
    const e = i < 0 ? 999 : t - EV.crows[i];
    if (e > 14) { crow.root.visible = false; return; }
    crow.root.visible = true;
    const k = e / 14;
    const a = new V3(-60, 24, -34), b = new V3(60, 27, 6);
    const p = a.clone().lerp(b, k); p.y += Math.sin(k * PI) * 4;
    crow.root.position.copy(p);
    crow.root.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), Math.sin(t * 0.8) * 0.1);
    const f = Math.sin(t * 9) * 0.7;
    crow.wl.rotation.z = f; crow.wr.rotation.z = -f;
  }

  // ---------- cat ----------
  const FLc = L.STUDIO.floor, EYc = 1.35;
  function catRoutes() {
    const home = W.catHome.clone(); home.y = FLc + 0.1;
    const sx = L.STEPS_X, z1 = L.STUDIO.z1;
    const g = (x, z, dy) => new V3(x, W.H(x, z) + (dy === undefined ? 0.12 : dy), z);
    const inside = [home, new V3(-11.6, FLc, z1 - 0.6), new V3(-10.6, EYc, z1 + 0.8), new V3(sx, EYc, z1 + 1.5), new V3(sx, 1.12, z1 + 1.95), new V3(sx, 0.82, z1 + 2.22), new V3(sx, 0.46, z1 + 2.7)];
    const br = W.paths.branch.map((p) => g(p[0], p[1]));
    const P = W.pondInfo;
    const rimA = new V3(P.CX + Math.cos(-2.0) * (P.RO - 0.2), P.RIM + 0.03, P.CZ + Math.sin(-2.0) * (P.RO - 0.2));
    const A = inside.concat(br.slice(0, 6)).concat([rimA]);
    const ll = W.paths.limeLeft.map((p) => g(p[0], p[1]));
    const B = inside.concat(br.slice(0, 4)).concat(ll).concat([W.limeSteps[0].clone().add(new V3(0, 0.01, 0))]);
    const Cc = inside.concat([g(sx + 1.2, 1.25), g(-7.4, 1.3), g(-6.3, 1.35), g(-5.95, 1.15)]);
    return [A, B, Cc];
  }
  let ROUTES = null;
  function routeLen(r) { let s = 0; for (let i = 1; i < r.length; i++) s += r[i].distanceTo(r[i - 1]); return s; }
  function routeAt(r, d) {
    let acc = 0;
    for (let i = 1; i < r.length; i++) { const l = r[i].distanceTo(r[i - 1]); if (acc + l >= d) { const k = (d - acc) / l; return { p: r[i - 1].clone().lerp(r[i], k), dir: r[i].clone().sub(r[i - 1]) }; } acc += l; }
    return { p: r[r.length - 1].clone(), dir: r[r.length - 1].clone().sub(r[r.length - 2]) };
  }
  const CAT_SPEED = 0.95;
  life.catArrive = function (route) { if (!ROUTES) ROUTES = catRoutes(); return 2.5 + routeLen(ROUTES[route]) / CAT_SPEED; };
  function catPlan(t) {
    if (!ROUTES) ROUTES = catRoutes();
    const i = lastBefore(EV.cats, t, (o) => o.t);
    if (i < 0) return { mode: 'sleep' };
    const ev = EV.cats[i]; const e = t - ev.t;
    const r = ROUTES[ev.route % ROUTES.length]; const len = routeLen(r);
    const walk = len / CAT_SPEED;
    const T1 = 2.5, T2 = T1 + walk, T3 = T2 + 7.5, T4 = T3 + walk, T5 = T4 + 1.5;
    if (e < T1) return { mode: 'stretch', k: e / T1, r };
    if (e < T2) { const q = routeAt(r, (e - T1) * CAT_SPEED); return { mode: 'walk', p: q.p, dir: q.dir, r }; }
    if (e < T3) return { mode: 'watch', k: (e - T2), r, p: r[r.length - 1].clone(), dir: r[r.length - 1].clone().sub(r[r.length - 2]) };
    if (e < T4) { const q = routeAt(r, len - (e - T3) * CAT_SPEED); return { mode: 'walk', p: q.p, dir: q.dir.negate(), r }; }
    if (e < T5) return { mode: 'settle', k: (e - T4) / 1.5, r };
    return { mode: 'sleep' };
  }
  life.catPlan = catPlan;
  function catUpdate(t, dt, cam) {
    const pl = catPlan(t);
    const home = W.catHome;
    const c = cat;
    let pos, ry = 0.6, bodyPitch = 0, bodyY = 0.2, legSw = 0, headTurn = 0, headPitch = 0, sleep = false;
    if (pl.mode === 'sleep' || pl.mode === 'settle') {
      pos = home.clone(); sleep = true; ry = 2.2;
    } else if (pl.mode === 'stretch') {
      pos = home.clone(); ry = 2.2 + pl.k * 0.3;
      const s = Math.sin(pl.k * PI);
      bodyPitch = s * 0.35; bodyY = 0.17 + pl.k * 0.03;
    } else if (pl.mode === 'walk') {
      pos = pl.p; ry = Math.atan2(pl.dir.x, pl.dir.z); legSw = Math.sin(t * 9);
      bodyPitch = -Math.atan2(pl.dir.y, Math.hypot(pl.dir.x, pl.dir.z)) * 0.6;
    } else {
      pos = pl.p; ry = Math.atan2(pl.dir.x, pl.dir.z);
      bodyY = 0.15; bodyPitch = -0.25;
      headPitch = 0.35;
    }
    // look at camera if near
    const cd = cam.distanceTo(pos);
    const want = cd < 3.2 ? 1 : 0;
    if (dt > 0) catState.look += (want - catState.look) * (1 - Math.exp(-dt * 3));
    c.root.position.copy(pos);
    c.root.rotation.set(0, ry, 0);
    c.body.position.set(0, sleep ? 0.11 : bodyY, 0);
    c.body.rotation.set(bodyPitch, 0, sleep ? 0.0 : 0);
    c.body.scale.set(sleep ? 1.25 : 1, sleep ? 0.75 : 1, sleep ? 0.85 : 1);
    c.legs.forEach((l, i) => { l.visible = !sleep; l.rotation.x = legSw * 0.55 * (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1); });
    if (pl.mode === 'watch') { const pw = Math.max(0, Math.sin(pl.k * 2.2)); c.legs[0].rotation.x = -pw * 1.3; }
    if (pl.mode === 'stretch') { c.legs[0].rotation.x = c.legs[1].rotation.x = -Math.sin(pl.k * PI) * 0.7; }
    // head
    let hy = 0, hp = headPitch, hz = 0;
    if (sleep) { c.head.position.set(0.06, 0.0, 0.16); hy = 0.6; hp = 0.35; hz = 0.5; c.tail.rotation.set(1.2, 1.4, 0); }
    else { c.head.position.set(0, 0.07, 0.22); c.tail.rotation.set(-0.3 + Math.sin(t * 2) * 0.15, Math.sin(t * 1.3) * 0.3, 0); }
    if (catState.look > 0.01) {
      const hp0 = pos.clone().add(new V3(Math.sin(ry) * 0.22, 0.27, Math.cos(ry) * 0.22));
      const dir = cam.clone().sub(hp0);
      const local = Math.atan2(dir.x, dir.z) - ry;
      const yaw = Math.atan2(Math.sin(local), Math.cos(local));
      hy = W.lerp(hy, W.clamp(yaw, -1.2, 1.2), catState.look);
      hp = W.lerp(hp, -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6, catState.look);
      hz = W.lerp(hz, 0, catState.look);
      if (sleep) c.head.position.y = W.lerp(0.0, 0.08, catState.look);
    }
    c.head.rotation.set(hp, hy, hz);
    life.catPos = pos;
  }

  // ---------- fox ----------
  function foxUpdate(t, dt, cam) {
    const spot = W.foxSpot; if (!spot) return;
    const i = lastBefore(EV.foxes, t);
    const e = i < 0 ? 999 : t - EV.foxes[i];
    const dur = 20;
    const f = fox;
    const fwd = new V3(Math.sin(spot.ry), 0, Math.cos(spot.ry));
    const side = new V3(fwd.z, 0, -fwd.x);
    const base = spot.p.clone(); base.y = L.TERR_Y;
    const enter = base.clone().addScaledVector(side, -1.6).addScaledVector(fwd, -0.8);
    if (e > dur) { f.root.visible = false; foxState.hide = 0; life.foxPos = null; return; }
    f.root.visible = true;
    let pos, ry, walking = false, sit = false;
    if (e < 2.5) { const k = sm(0, 2.5, e); pos = enter.clone().lerp(base, k); ry = Math.atan2(base.x - enter.x, base.z - enter.z); walking = true; }
    else if (e < dur - 2.5) { pos = base.clone(); ry = Math.atan2(-fwd.x, -fwd.z) + Math.sin(e * 0.5) * 0.4; sit = true; }
    else { const k = sm(dur - 2.5, dur, e); pos = base.clone().lerp(enter, k); ry = Math.atan2(enter.x - base.x, enter.z - base.z); walking = true; }
    // hide behind pillar when camera approaches
    const cd = Math.hypot(cam.x - base.x, cam.z - base.z);
    const want = cd < 2.6 && cam.y < L.TERR_Y + 4 ? 1 : 0;
    if (dt > 0) foxState.hide += (want - foxState.hide) * (1 - Math.exp(-dt * (want ? 3.5 : 1.0)));
    if (foxState.hide > 0.01) {
      const pil = [base.clone().addScaledVector(side, 0.5), base.clone().addScaledVector(side, -0.5)];
      const pp = pil[0].distanceTo(cam) > pil[1].distanceTo(cam) ? pil[0] : pil[1];
      const away = pp.clone().sub(new V3(cam.x, pp.y, cam.z)).normalize();
      const hidePos = pp.clone().addScaledVector(away, 0.32);
      pos = pos.clone().lerp(hidePos, W.easeS(foxState.hide));
      ry = W.lerp(ry, Math.atan2(-away.x, -away.z), foxState.hide);
      sit = true; walking = false;
    }
    f.root.position.copy(pos);
    f.root.rotation.set(0, ry, 0);
    const crouch = foxState.hide * 0.05;
    f.body.position.set(0, (sit ? 0.2 : 0.24) - crouch, 0);
    f.body.rotation.set(sit ? -0.55 : 0, 0, 0);
    f.head.rotation.set(sit ? 0.5 : 0.05, Math.sin(t * 0.6) * 0.3 * (sit ? 1 : 0), 0);
    f.legs.forEach((l, k) => { l.rotation.x = walking ? Math.sin(t * 10 + k * PI) * 0.6 : (sit ? (k < 2 ? 0.55 : -1.0) : 0); });
    f.tail.rotation.set(sit ? 0.9 : 0.2, Math.sin(t * 1.5) * 0.2, 0);
    life.foxPos = pos;
  }
})();
