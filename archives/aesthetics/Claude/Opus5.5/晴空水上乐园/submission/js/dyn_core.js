'use strict';
/* ==========================================================================
   Dynamics core: deterministic scheduler, cube batches (particles/streams),
   instanced model pools
   ========================================================================== */
(function () {
  const P = window.P;
  const D = (P.Dyn = { systems: [] });
  const h1 = P.hash1;
  const hh = (a, b) => P.hash2i(a | 0, b | 0);
  D.hash = hh;

  /* ------------------------------------------------------------ event schedule */
  // live mode: repeating cycle; tour mode: explicit list per event
  const CYCLE = 104;
  const LIVE = { wave: 2, bucket: 40, vertical: 55, race: 68, fountain: 84 };
  D.tourSched = null; // {name: [t0, t1, ...]}
  D.lastStart = function (name, t) {
    if (D.tourSched) {
      const arr = D.tourSched[name] || [];
      let best = null;
      for (const s of arr) if (s <= t && (best === null || s > best)) best = s;
      return best;
    }
    const off = LIVE[name];
    if (off == null) return null;
    const k = Math.floor((t - off) / CYCLE);
    return off + k * CYCLE;
  };
  D.nextStart = function (name, t) {
    if (D.tourSched) {
      const arr = D.tourSched[name] || [];
      let best = null;
      for (const s of arr) if (s > t && (best === null || s < best)) best = s;
      return best;
    }
    const off = LIVE[name];
    const k = Math.floor((t - off) / CYCLE) + 1;
    return off + k * CYCLE;
  };
  D.CYCLE = CYCLE;

  /* ------------------------------------------------------------ cube batch (instanced boxes) */
  class CubeBatch {
    constructor(scene, max, mat, order) {
      this.max = max;
      const base = new THREE.BoxGeometry(1, 1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.getAttribute('position'));
      g.setAttribute('normal', base.getAttribute('normal'));
      this.pos = new Float32Array(max * 4);
      this.size = new Float32Array(max * 4);
      this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
      this.aSize = new THREE.InstancedBufferAttribute(this.size, 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', this.aPos);
      g.setAttribute('iSize', this.aSize);
      g.instanceCount = 0;
      this.geo = g;
      this.mesh = new THREE.Mesh(g, mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = order || 10;
      scene.add(this.mesh);
      this.n = 0;
    }
    begin() { this.n = 0; }
    push(x, y, z, sx, sy, sz, a, tint) {
      if (this.n >= this.max) return;
      const i = this.n++ * 4;
      this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z; this.pos[i + 3] = a;
      this.size[i] = sx; this.size[i + 1] = sy; this.size[i + 2] = sz; this.size[i + 3] = tint || 0;
    }
    end() {
      this.geo.instanceCount = this.n;
      this.aPos.needsUpdate = true; this.aSize.needsUpdate = true;
      this.aPos.clearUpdateRanges(); this.aSize.clearUpdateRanges();
      this.aPos.addUpdateRange(0, this.n * 4); this.aSize.addUpdateRange(0, this.n * 4);
    }
  }
  D.CubeBatch = CubeBatch;

  /* ------------------------------------------------------------ instanced model pool */
  class ModelPool {
    constructor(scene, model, max, opts) {
      opts = opts || {};
      let mat = model.size === P.FV ? P.fineMat : P.opMat;
      let geo = model.op;
      if (!geo && model.wa) { geo = model.wa; mat = P.makeSlideWaterMaterial(model.size); }
      if (!geo && model.gl) { geo = model.gl; mat = P.makeGlassMaterial(model.size); }
      if (!geo) geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      this.im = new THREE.InstancedMesh(geo, mat, max);
      if (mat.transparent) { this.im.renderOrder = 9; opts.cast = false; }
      this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.im.count = 0;
      this.im.frustumCulled = false;
      if (opts.cast !== false) this.im.layers.enable(2);
      scene.add(this.im);
      this.max = max; this.n = 0; this.size = model.size;
      this.m4 = new THREE.Matrix4();
      this.sc = new THREE.Vector3();
    }
    begin() { this.n = 0; }
    // place with position + basis (right, up, fwd) + uniform scale
    pushBasis(p, r, u, f, s) {
      if (this.n >= this.max) return;
      const k = this.size * (s == null ? 1 : s);
      this.m4.set(r.x * k, u.x * k, f.x * k, p.x, r.y * k, u.y * k, f.y * k, p.y, r.z * k, u.z * k, f.z * k, p.z, 0, 0, 0, 1);
      this.im.setMatrixAt(this.n++, this.m4);
    }
    pushYaw(x, y, z, yaw, s, tiltX, tiltZ) {
      if (this.n >= this.max) return;
      const k = this.size * (s == null ? 1 : s);
      const e = new THREE.Euler(tiltX || 0, yaw, tiltZ || 0, 'YXZ');
      this.m4.makeRotationFromEuler(e);
      this.m4.scale(this.sc.set(k, k, k));
      this.m4.setPosition(x, y, z);
      this.im.setMatrixAt(this.n++, this.m4);
    }
    pushMatrix(m) { if (this.n < this.max) this.im.setMatrixAt(this.n++, m); }
    end() { this.im.count = this.n; this.im.instanceMatrix.needsUpdate = true; }
  }
  D.ModelPool = ModelPool;

  /* ------------------------------------------------------------ particle helpers */
  const G = 9.81;
  // emit a burst: N particles at time t0 from (x,y,z), velocity spread
  // returns via batch push. floorY: particles vanish below
  D.burst = function (batch, t, t0, id, o) {
    const age0 = t - t0;
    if (age0 < 0 || age0 > (o.life || 1.6) + 0.5) return;
    const n = o.n || 30;
    for (let i = 0; i < n; i++) {
      const r1 = hh(id, i * 7 + 1), r2 = hh(id, i * 7 + 2), r3 = hh(id, i * 7 + 3), r4 = hh(id, i * 7 + 4), r5 = hh(id, i * 7 + 5);
      const life = (o.life || 1.4) * (0.55 + 0.45 * r4);
      const age = age0 - r5 * (o.spread || 0.15);
      if (age < 0 || age > life) continue;
      const a = r1 * Math.PI * 2;
      const hs = (o.hs || 2.5) * (0.3 + 0.7 * r2);
      const vs = (o.vs || 4) * (0.45 + 0.55 * r3);
      const vx = Math.cos(a) * hs + (o.dx || 0), vz = Math.sin(a) * hs + (o.dz || 0), vy = vs;
      const x = o.x + vx * age + Math.cos(a) * (o.r || 0) * r2, z = o.z + vz * age + Math.sin(a) * (o.r || 0) * r2;
      const y = o.y + vy * age - 0.5 * G * age * age;
      if (y < (o.floor != null ? o.floor : -100)) continue;
      const u = age / life;
      const s = (o.size || 0.11) * (0.6 + 0.8 * r4) * (1 - u * 0.65);
      batch.push(x, y, z, s, s, s, (o.alpha || 0.85) * (1 - u * u), r3 > 0.6 ? 1 : 0);
    }
  };
  // continuous jet: rate per second, velocity (vx,vy,vz) with jitter
  D.jet = function (batch, t, id, o) {
    const rate = o.rate || 30, life = o.life || 1.2;
    const i0 = Math.ceil((t - life) * rate), i1 = Math.floor(t * rate);
    const on = o.on; // optional fn(spawnTime) -> intensity 0..1
    for (let i = i0; i <= i1; i++) {
      const ts = i / rate;
      const age = t - ts;
      if (age < 0) continue;
      let k = 1;
      if (on) { k = on(ts); if (k <= 0.02) continue; }
      const r1 = hh(id, i * 5 + 1), r2 = hh(id, i * 5 + 2), r3 = hh(id, i * 5 + 3), r4 = hh(id, i * 5 + 4);
      if (r4 > k + 0.05) continue;
      const lf = life * (0.75 + 0.25 * r1);
      if (age > lf) continue;
      const j = o.jit || 0.12;
      const vx = (o.vx || 0) * (0.92 + 0.16 * r2) + (r1 - 0.5) * j * 4, vy = (o.vy || 0) * (0.9 + 0.2 * r3) * Math.sqrt(k), vz = (o.vz || 0) * (0.92 + 0.16 * r3) + (r2 - 0.5) * j * 4;
      const x = o.x + vx * age, y = o.y + vy * age - 0.5 * G * (o.g == null ? 1 : o.g) * age * age, z = o.z + vz * age;
      if (y < (o.floor != null ? o.floor : -100)) continue;
      const u = age / lf;
      const s = (o.size || 0.1) * (0.7 + 0.6 * r3) * (1 - u * 0.6);
      batch.push(x, y, z, s, s * (o.stretch || 1), s, (o.alpha || 0.8) * (1 - u * u), r2 > 0.55 ? 1 : 0);
    }
  };
  // falling sheet (waterfall/curtain/pour) of voxel strips along a lip line
  // o: x0,z0,x1,z1 lip; y0; y1 floor; ox,oz outward dir; v0 outward speed; seg interval; strength
  D.sheet = function (batch, t, id, o) {
    const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0);
    const cols = Math.max(1, Math.round(len / 0.25));
    const dts = o.dt || 0.075;
    const H = o.y0 - o.y1;
    const v0 = o.v0 != null ? o.v0 : 0.8;
    const tf = (Math.sqrt(2 * G * Math.max(0.1, H) + 0.01) - 0) / G + 0.05;
    const amp = o.amp == null ? 1 : o.amp;
    for (let c = 0; c <= cols; c++) {
      const u = c / Math.max(1, cols);
      const bx = o.x0 + (o.x1 - o.x0) * u, bz = o.z0 + (o.z1 - o.z0) * u;
      const cr = hh(id, c * 13 + 3);
      const edge = Math.min(u, 1 - u) * len;
      const thin = edge < 0.35 ? 0.55 : 1;
      const i0 = Math.ceil((t - tf) / dts), i1 = Math.floor(t / dts);
      for (let i = i0; i <= i1; i++) {
        const ts = i * dts + cr * dts;
        const age = t - ts;
        if (age < 0 || age > tf) continue;
        const r = hh(id + c * 31, i);
        if (r > amp * (0.9 + 0.1 * thin)) continue;
        const vy = -G * age;
        const y = o.y0 - 0.5 * G * age * age;
        if (y < o.y1) continue;
        const hx = bx + o.ox * v0 * age * (0.85 + 0.3 * cr), hz = bz + o.oz * v0 * age * (0.85 + 0.3 * cr);
        const spd = Math.sqrt(v0 * v0 + vy * vy);
        const L = Math.max(0.12, Math.min(1.4, spd * dts * 0.95));
        const w = 0.25 * thin * (0.85 + 0.3 * r);
        batch.push(hx, y - L * 0.5, hz, w, L, w * 0.8, (o.alpha || 0.78) * (0.85 + 0.15 * r), r > 0.7 ? 1 : 0);
      }
    }
  };
})();
