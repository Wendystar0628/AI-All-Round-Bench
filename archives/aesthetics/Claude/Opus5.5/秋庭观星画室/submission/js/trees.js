/* procedural trees & plants */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C;
  const UP = new V3(0, 1, 0);

  function randDir(R, base, spread) {
    const v = new V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    return base.clone().addScaledVector(v, spread).normalize();
  }

  // generic branching structure
  function branchTree(B, o) {
    const R = W.rng(o.seed || 1);
    const tips = [];
    const barkC = C(o.bark || 0x5a4636);
    const ctx = new W.Ctx(B);
    function grow(p0, dir, len, r, depth) {
      const pts = [p0.clone()];
      let d = dir.clone(); let p = p0.clone();
      const seg = 4;
      for (let i = 0; i < seg; i++) {
        d.addScaledVector(new V3(R() - 0.5, R() - 0.5, R() - 0.5), o.wobble || 0.35);
        d.y += (o.upBias || 0.15) * (depth === 0 ? 1.5 : 1) - (o.droop || 0) * depth * 0.1;
        d.normalize();
        p = p.clone().addScaledVector(d, len / seg);
        pts.push(p);
      }
      const r1 = r * (o.taper || 0.6);
      ctx.add(W.g.tube(pts, (t) => W.lerp(r, r1, t), 0, depth < 2 ? 9 : 6, seg * 2), barkC, null, null, undefined, [0, depth > 2 ? 0.05 : 0, 0, 17.0],
        null, (lx, ly, lz, wv) => barkC.clone().multiplyScalar(0.85 + 0.25 * W.noise2(wv.x * 3, wv.y * 3 + wv.z)));
      if (depth >= (o.depth || 3)) { tips.push({ p: p.clone(), d: d.clone(), r: r1 }); return; }
      const nChild = o.children ? o.children(depth, R) : (depth === 0 ? 3 : 2 + (R() < 0.4 ? 1 : 0));
      for (let c = 0; c < nChild; c++) {
        const t = depth === 0 ? R.range(0.55, 1.0) : R.range(0.5, 1.0);
        const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const sp = pts[idx];
        const ang = (c / nChild) * Math.PI * 2 + R() * 1.2;
        const side = new V3(Math.cos(ang), 0, Math.sin(ang));
        const spread = o.spread || 0.8;
        const nd = d.clone().multiplyScalar(1 - spread * 0.6).addScaledVector(side, spread).normalize();
        if (o.lean) nd.add(o.lean.clone().multiplyScalar(0.2)).normalize();
        grow(sp, nd, len * (o.lenDecay || 0.68) * R.range(0.85, 1.1), r1 * R.range(0.75, 0.95), depth + 1);
      }
      if (depth > 0 && R() < 0.5) tips.push({ p: p.clone(), d: d.clone(), r: r1 });
    }
    const base = new V3(o.x, o.y, o.z);
    const d0 = (o.trunkDir || UP).clone().normalize();
    grow(base, d0, o.trunkLen || 3, o.trunkR || 0.25, 0);
    return tips;
  }

  // foliage cluster: blobs + leaves on surface
  function foliage(B, BL, center, rad, o, R, k) {
    const ctx = new W.Ctx(B);
    const col = o.colors[Math.floor(R() * o.colors.length)];
    const c = W.jit(col, 0.25, R);
    const sq = o.squash || 0.75;
    const blobGeo = W.g.blob(1, 2, 0.34, (o.seed || 1) * 100 + k, 1);
    ctx.add(blobGeo, c, [center.x, center.y, center.z], [0, R() * 6, 0], [rad * 0.9, rad * sq * 0.9, rad * 0.9], [0, o.sway || 0.06, 0, 8.0],
      null, (lx, ly, lz, wv, wn) => {
        // darker underside, lighter top: painted foliage gradient
        const t = W.clamp(ly * 0.5 + 0.5, 0, 1);
        return c.clone().multiplyScalar(0.62 + 0.45 * t);
      });
    // leaf cards on outer surface
    const nLeaves = Math.round((o.leafDensity || 30) * rad * rad * 2.5);
    const lctx = new W.Ctx(BL);
    for (let i = 0; i < nLeaves; i++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2; const s = Math.sqrt(1 - u * u);
      const dir = new V3(s * Math.cos(th), u * sq, s * Math.sin(th));
      if (dir.y < -0.5 * sq && R() < 0.6) continue;
      const pr = rad * R.range(0.9, 1.16);
      const p = center.clone().addScaledVector(dir, pr);
      const lc = W.jit(o.colors[Math.floor(R() * o.colors.length)], 0.35, R);
      const ls = (o.leafSize || 0.16) * R.range(0.8, 1.35);
      const rx = Math.atan2(Math.hypot(dir.x, dir.z), dir.y) * R.range(0.4, 1.0);
      const ry = Math.atan2(dir.x, dir.z) + R.range(-0.6, 0.6);
      lctx.add(W.g.leaf(o.leaf || 'maple'), lc, [p.x, p.y, p.z], [rx, ry, R.range(-0.5, 0.5)], ls, [0, (o.sway || 0.06) * 1.6, 0, 8.0]);
    }
  }

  W.foliageCluster = function (B, BL, c, rad, o, R, k) { foliage(B, BL, c, rad, o, R, k); };

  W.tree = function (B, o) {
    const R = W.rng((o.seed || 1) * 7 + 3);
    const BL = o.leafBucket || W.bucket('leaves');
    const tips = branchTree(B, o);
    const clusters = [];
    tips.forEach((t, k) => {
      const rad = (o.clusterR || 0.9) * R.range(0.75, 1.2);
      const c = t.p.clone().addScaledVector(t.d, rad * 0.35);
      if (o.clusterLift) c.y += o.clusterLift;
      foliage(B, BL, c, rad, o, R, k);
      clusters.push({ c, r: rad });
      if (o.extra && R() < o.extra) {
        const c2 = c.clone().add(new V3(R.range(-1, 1), R.range(-0.4, 0.5), R.range(-1, 1)).multiplyScalar(rad * 0.8));
        foliage(B, BL, c2, rad * 0.7, o, R, k + 1000);
        clusters.push({ c: c2, r: rad * 0.7 });
      }
    });
    return { tips, clusters };
  };

  // ---------- specific species ----------
  W.maple = function (x, z, o) {
    o = o || {};
    const y = o.y !== undefined ? o.y : W.H(x, z);
    const s = o.scale || 1;
    const palettes = {
      deep: [0xd23a1c, 0xe0481e, 0xc42c1a, 0xe85a20, 0xb8261a],
      orange: [0xe8581a, 0xf07a1e, 0xe0441a, 0xf59a2a, 0xd23a1a],
      mixed: [0xd02c1a, 0xec6a1c, 0xf2a22a, 0xc02018, 0xe0521c],
    };
    const t = W.tree(W.bucket(o.bucket || 'trees'), {
      x, y, z, seed: o.seed || 3, trunkLen: 2.0 * s, trunkR: 0.16 * s, depth: 3, lenDecay: 0.7, spread: 0.95, upBias: 0.12, wobble: 0.45,
      clusterR: 0.95 * s, colors: palettes[o.palette || 'deep'], leaf: 'maple', leafSize: 0.2 * Math.sqrt(s), leafDensity: 34, squash: 0.62, extra: 0.6, bark: 0x4a3a32,
      trunkDir: o.lean || new V3(0.1, 1, 0.05), sway: 0.07,
    });
    W.treeList.push({ kind: 'maple', x, y, z, s, clusters: t.clusters, colors: palettes[o.palette || 'deep'] });
    return t;
  };

  // the sacred ginkgo: tallest point (~2x the studio ridge), crown no wider than a third of the base
  W.ginkgoTree = function (x, y, z) {
    const B = W.bucket('ginkgo');
    const BL = W.bucket('ginkgoLeaves');
    const R = W.rng(41);
    const ctx = new W.Ctx(B);
    const bark = C(0x5d4a3a);
    const barkFn = (lx, ly, lz, wv) => bark.clone().multiplyScalar(0.82 + 0.3 * W.noise2(wv.x * 3, wv.y * 2.5 + wv.z));
    const trunkTop = new V3(x + 0.15, y + 4.4, z - 0.1);
    const trunk = [new V3(x, y - 0.2, z), new V3(x + 0.05, y + 1.6, z + 0.05), new V3(x + 0.12, y + 3.0, z - 0.05), trunkTop];
    ctx.add(W.g.tube(trunk, (t) => W.lerp(0.95, 0.55, t) + (t < 0.12 ? (0.12 - t) * 3.0 : 0), 0, 14, 16), bark, null, null, undefined, [0, 0, 0, 17.0], null, barkFn);
    const cc = new V3(x - 0.1, y + 7.4, z - 0.3); // crown centre
    const RX = 4.3, RY = 2.75, RZ = 3.9;
    const o = { colors: [0xeaa818, 0xf2bc2a, 0xdc9812, 0xf6cc48, 0xd08a10], leaf: 'ginkgo', leafSize: 0.2, leafDensity: 22, squash: 0.78, sway: 0.05, seed: 41 };
    const clusters = [];
    // main limbs: trunk top -> points inside the crown
    const limbEnds = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.4;
      const end = new V3(cc.x + Math.cos(a) * RX * 0.62, cc.y - 0.4 + (k % 2) * 0.9, cc.z + Math.sin(a) * RZ * 0.62);
      const mid = trunkTop.clone().lerp(end, 0.5); mid.y += 0.5;
      ctx.add(W.g.tube([trunkTop, mid, end], (t) => W.lerp(0.36, 0.12, t), 0, 8, 10), bark, null, null, undefined, [0, 0, 0, 17.0], null, barkFn);
      limbEnds.push(end);
      // secondary twigs
      for (let q = 0; q < 2; q++) {
        const d = new V3(R() - 0.5, R() * 0.6, R() - 0.5).normalize();
        const e2 = end.clone().addScaledVector(d, R.range(1.0, 1.7));
        ctx.add(W.g.tube([end, end.clone().lerp(e2, 0.5).add(new V3(0, 0.15, 0)), e2], 0.1, 0.04, 6, 6), bark, null, null, undefined, [0, 0.02, 0, 17.0]);
        limbEnds.push(e2);
      }
    }
    ctx.add(W.g.tube([trunkTop, trunkTop.clone().add(new V3(0.1, 1.6, 0.1)), cc.clone().add(new V3(0, 1.2, 0))], (t) => W.lerp(0.4, 0.12, t), 0, 8, 10), bark, null, null, undefined, [0, 0, 0, 17.0], null, barkFn);
    // crown clusters: fill an ellipsoid, denser toward the outside
    const pts = [];
    limbEnds.forEach((p) => pts.push(p.clone()));
    for (let k = 0; k < 22; k++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2, s2 = Math.sqrt(1 - u * u);
      const rr = Math.pow(R(), 0.35) * 0.82;
      pts.push(new V3(cc.x + s2 * Math.cos(th) * RX * rr, cc.y + u * RY * rr, cc.z + s2 * Math.sin(th) * RZ * rr));
    }
    pts.forEach((p, k) => {
      // keep inside the crown envelope
      const d = new V3((p.x - cc.x) / RX, (p.y - cc.y) / RY, (p.z - cc.z) / RZ);
      if (d.length() > 0.85) { d.setLength(0.85); p.set(cc.x + d.x * RX, cc.y + d.y * RY, cc.z + d.z * RZ); }
      const rad = R.range(1.15, 1.6) * (1 - Math.max(0, d.y) * 0.25);
      W.foliageCluster(B, BL, p, rad, o, R, k);
      clusters.push({ c: p, r: rad });
    });
    W.treeList.push({ kind: 'ginkgo', x, y, z, s: 1, clusters, crown: { c: cc, rx: RX, ry: RY, rz: RZ } });
    W.ginkgoCrown = { c: cc, rx: RX, ry: RY, rz: RZ };
    return { clusters };
  };

  W.pineTree = function (x, z, lean) {
    const y = W.H(x, z);
    const B = W.bucket('trees');
    const ctx = new W.Ctx(B);
    const R = W.rng(91);
    // leaning sinuous trunk
    const pts = [];
    let p = new V3(x, y - 0.1, z);
    const ld = lean.clone().normalize();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new V3(x + ld.x * t * 3.4 + Math.sin(t * 5) * 0.25, y - 0.1 + t * 3.6 - t * t * 0.6, z + ld.z * t * 3.4 + Math.cos(t * 4) * 0.2));
    }
    const bark = C(0x5b4334);
    ctx.add(W.g.tube(pts, (t) => W.lerp(0.26, 0.09, t), 0, 9, 24), bark, null, null, undefined, [0, 0, 0, 17.0], null, (lx, ly, lz, wv) => bark.clone().multiplyScalar(0.8 + 0.35 * W.noise2(wv.x * 4, wv.y * 6)));
    // branches with flat cloud-pads
    const pads = [];
    const padAt = [0.35, 0.5, 0.62, 0.75, 0.88, 1.0];
    const curve = new THREE.CatmullRomCurve3(pts);
    padAt.forEach((t, i) => {
      const bp = curve.getPointAt(t);
      const ang = i * 2.1 + 0.5;
      const dir = new V3(Math.cos(ang), 0.15, Math.sin(ang)).add(ld.clone().multiplyScalar(0.6)).normalize();
      const len = (1.6 - t * 0.7) * R.range(0.8, 1.1);
      const end = bp.clone().addScaledVector(dir, len);
      const mid = bp.clone().lerp(end, 0.5); mid.y += 0.15;
      ctx.add(W.g.tube([bp, mid, end], (q) => W.lerp(0.08, 0.035, q), 0, 6, 6), bark, null, null, undefined, [0, 0, 0, 17.0]);
      pads.push({ c: end.clone().add(new V3(0, 0.12, 0)), r: (0.95 - t * 0.3) * R.range(0.85, 1.15) });
    });
    pads.push({ c: pts[8].clone().add(new V3(0, 0.3, 0)), r: 0.85 });
    pads.forEach((pd, k) => {
      const c = W.jit(0x2f5a2c, 0.2, R);
      for (let j = 0; j < 3; j++) {
        const off = new V3(R.range(-0.4, 0.4), R.range(-0.05, 0.1), R.range(-0.4, 0.4)).multiplyScalar(pd.r);
        const rr = pd.r * R.range(0.6, 0.85);
        ctx.add(W.g.blob(1, 2, 0.18, 700 + k * 3 + j), c, [pd.c.x + off.x, pd.c.y + off.y, pd.c.z + off.z], [0, R() * 6, 0], [rr * 1.15, rr * 0.38, rr], [0, 0.04, 0, 8.0],
          null, (lx, ly) => c.clone().multiplyScalar(0.7 + 0.5 * W.clamp(ly * 0.5 + 0.5, 0, 1)));
      }
      // needle tufts on top
      const nctx = new W.Ctx(W.bucket('leaves'));
      for (let n = 0; n < 40; n++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * pd.r * 1.0;
        nctx.add(W.g.leaf('narrow'), W.jit(0x3d6e32, 0.3, R), [pd.c.x + Math.cos(a) * rr, pd.c.y + pd.r * 0.28, pd.c.z + Math.sin(a) * rr], [R.range(-0.6, 0.6), R() * 6, R.range(-0.6, 0.6)], [0.09, 1, 0.3], [0, 0.06, 0, 8.0]);
      }
    });
    W.treeList.push({ kind: 'pine', x, y, z, clusters: pads });
  };

  W.persimmon = function (x, z) {
    const y = W.H(x, z);
    const B = W.bucket('trees');
    const t = branchTree(B, { x, y, z, seed: 57, trunkLen: 1.9, trunkR: 0.15, depth: 4, lenDecay: 0.68, spread: 0.9, upBias: 0.1, wobble: 0.5, bark: 0x3f3430, taper: 0.62 });
    const ctx = new W.Ctx(B);
    const R = W.rng(58);
    W.persimmonFruits = [];
    t.forEach((tip, i) => {
      // twigs
      for (let k = 0; k < 2; k++) {
        const d = randDir(R, tip.d, 0.9);
        const e = tip.p.clone().addScaledVector(d, R.range(0.25, 0.45));
        ctx.add(W.g.tube([tip.p, tip.p.clone().lerp(e, 0.5).add(new V3(0, 0.03, 0)), e], 0.012, 0.005, 4, 3), 0x3f3430, null, null, undefined, [0, 0.05, 0, 17.0]);
        if (R() < 0.8) {
          const fp = e.clone().add(new V3(0, -0.06, 0));
          ctx.add(W.g.sph(1, 12), W.jit(0xf07a18, 0.2, R), [fp.x, fp.y, fp.z], null, [0.085, 0.075, 0.085], [0, 0.04, 0, 0]);
          ctx.add(W.g.cyl(0.035, 0.04, 0.015, 4), 0x4b5a26, [fp.x, fp.y + 0.075, fp.z], [0, R() * 3, 0], 1, [0, 0.04, 0, 0]);
          W.persimmonFruits.push(fp);
        }
      }
      if (R() < 0.3) {
        new W.Ctx(W.bucket('leaves')).add(W.g.leaf('round'), W.jit(0xc8681c, 0.3, R), [tip.p.x, tip.p.y, tip.p.z], [R() - 0.5, R() * 6, R() - 0.5], 0.16, [0, 0.08, 0, 8.0]);
      }
    });
    W.treeList.push({ kind: 'persimmon', x, y, z, clusters: [] });
  };

  W.sugi = function (x, z, h, seed) {
    const y = W.H(x, z);
    const B = W.bucket('back');
    const ctx = new W.Ctx(B);
    const R = W.rng(seed || 5);
    const bark = C(0x6a4a36);
    ctx.add(W.g.cyl(0.07, 0.24, h * 0.95, 10), bark, [x, y + h * 0.475, z], null, 1, [0, 0, 0, 17.0]);
    const tiers = 10;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const ty = y + h * (0.28 + t * 0.66);
      const r = (1 - t) * 1.55 + 0.22;
      const th = 1.0 + (1 - t) * 0.6;
      const c = W.jit(t > 0.6 ? 0x34654a : 0x2a5540, 0.12, R);
      const geo = new THREE.ConeGeometry(1, 1, 16, 2, true);
      const P = geo.attributes.position; const ph = R() * 6;
      for (let q = 0; q < P.count; q++) {
        const px = P.getX(q), py = P.getY(q), pz = P.getZ(q);
        const rr = Math.hypot(px, pz);
        if (rr > 0.001) {
          const a = Math.atan2(pz, px);
          const jag = 1 + 0.22 * Math.sin(a * 7 + ph) + 0.12 * Math.sin(a * 13 + ph * 2);
          P.setX(q, px * jag); P.setZ(q, pz * jag);
          if (py < 0) P.setY(q, py - 0.18 * (jag - 1) * 2 - 0.06);
        }
      }
      geo.computeVertexNormals();
      ctx.add(geo, c, [x + R.range(-0.08, 0.08), ty, z + R.range(-0.08, 0.08)], [R.range(-0.05, 0.05), R() * 6, R.range(-0.05, 0.05)], [r, th, r], [0, 0.03 * t, 0, 8.0],
        null, (lx, ly) => c.clone().multiplyScalar(0.62 + 0.55 * W.clamp(0.5 - ly, 0, 1) * 0 + 0.5 * W.clamp(ly + 0.5, 0, 1)));
    }
    ctx.add(W.g.cone(0.25, 1.0, 8), 0x34654a, [x, y + h * 0.97, z], null, 1, [0, 0.03, 0, 8.0]);
    W.treeList.push({ kind: 'sugi', x, y, z, h });
  };

  W.bamboo = function (x, z, h, seed) {
    const y = W.H(x, z);
    const B = W.bucket('back');
    const ctx = new W.Ctx(B);
    const R = W.rng(seed);
    const lean = new V3(R.range(-0.08, 0.08), 1, R.range(-0.08, 0.08)).normalize();
    const r = R.range(0.055, 0.085);
    const col = W.jit(R() < 0.7 ? 0x7fa04a : 0x9aa856, 0.2, R);
    const segs = Math.round(h / 0.45);
    for (let i = 0; i < segs; i++) {
      const p = new V3(x, y, z).addScaledVector(lean, (i + 0.5) * (h / segs));
      const sway = (i / segs) * 0.35;
      ctx.add(W.g.cyl(r * 0.96, r, h / segs - 0.02, 8), col, [p.x, p.y, p.z], [lean.z * 0.0, 0, 0], 1, [0, sway, 0, 0]);
      ctx.add(W.g.cyl(r * 1.12, r * 1.12, 0.03, 8), col.clone().multiplyScalar(0.85), [p.x, p.y + h / segs / 2, p.z], null, 1, [0, sway, 0, 0]);
    }
    // leaves near top
    const lctx = new W.Ctx(W.bucket('leaves'));
    for (let k = 0; k < 55; k++) {
      const t = R.range(0.55, 1.0);
      const p = new V3(x, y, z).addScaledVector(lean, t * h);
      const a = R() * Math.PI * 2; const rr = R.range(0.2, 1.0) * (1.2 - t * 0.6);
      lctx.add(W.g.leaf('narrow'), W.jit(0x6f9a3e, 0.3, R), [p.x + Math.cos(a) * rr, p.y + R.range(-0.2, 0.1), p.z + Math.sin(a) * rr], [R.range(0.2, 0.9), a, R.range(-0.4, 0.4)], [0.22, 1, 0.75], [0, 0.3 + t * 0.2, 0, 8.0]);
    }
  };

  // shrub (camellia etc.)
  W.shrub = function (x, z, o) {
    const y = o.y !== undefined ? o.y : W.H(x, z);
    const B = W.bucket('trees');
    const ctx = new W.Ctx(B);
    const R = W.rng(o.seed || 9);
    const r = o.r || 0.7;
    for (let i = 0; i < (o.n || 4); i++) {
      const a = i * 2.4; const off = r * 0.45;
      const c = W.jit(o.color || 0x2f5a2a, 0.2, R);
      const rr = r * R.range(0.55, 0.8);
      ctx.add(W.g.blob(1, 2, 0.2, (o.seed || 9) * 10 + i), c, [x + Math.cos(a) * off * R(), y + rr * 0.9 + R() * r * 0.4, z + Math.sin(a) * off * R()], [0, R() * 6, 0], [rr, rr * 0.9, rr], [0, 0.04, 0, 8.0],
        null, (lx, ly) => c.clone().multiplyScalar(0.7 + 0.45 * W.clamp(ly * 0.5 + 0.5, 0, 1)));
    }
    const lctx = new W.Ctx(W.bucket('leaves'));
    for (let k = 0; k < (o.leaves || 80); k++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2; const s = Math.sqrt(1 - u * u);
      const d = new V3(s * Math.cos(th), Math.abs(u) * 0.9, s * Math.sin(th));
      const p = new V3(x, y + r * 1.05, z).addScaledVector(d, r * 0.95);
      lctx.add(W.g.leaf('round'), W.jit(o.leafColor || 0x2c5a26, 0.3, R), [p.x, p.y, p.z], [R() - 0.5, th, R() - 0.5], o.leafSize || 0.11, [0, 0.05, 0, 8.0]);
    }
    // flowers or berries
    (o.flowers || 0) && (() => {
      for (let k = 0; k < o.flowers; k++) {
        const u = R() * 2 - 1, th = R() * Math.PI * 2; const s = Math.sqrt(1 - u * u);
        const d = new V3(s * Math.cos(th), Math.abs(u), s * Math.sin(th));
        const p = new V3(x, y + r * 1.05, z).addScaledVector(d, r * 1.0);
        W.flowerHead(ctx, p, o.flowerKind || 'camellia', o.flowerColor || 0xf28aa8, 0.09, R, [Math.atan2(Math.hypot(d.x, d.z), d.y), Math.atan2(d.x, d.z), 0]);
      }
    })();
  };

  // nandina: thin canes with compound leaves and red berry clusters
  W.nandina = function (x, z, seed) {
    const y = W.H(x, z);
    const ctx = new W.Ctx(W.bucket('trees'));
    const R = W.rng(seed || 13);
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2; const h = R.range(0.8, 1.4);
      const top = new V3(x + Math.cos(a) * 0.15, y + h, z + Math.sin(a) * 0.15);
      ctx.add(W.g.tube([new V3(x, y, z), new V3(x + Math.cos(a) * 0.08, y + h * 0.5, z + Math.sin(a) * 0.08), top], 0.018, 0.012, 5, 4), 0x6b4a32, null, null, undefined, [0, 0.1, 0, 0]);
      for (let k = 0; k < 9; k++) {
        const b = R() * Math.PI * 2; const rr = R.range(0.08, 0.35);
        ctx.add(W.g.leaf('narrow'), W.jit(R() < 0.5 ? 0x8a3a24 : 0x4f6a2c, 0.3, R), [top.x + Math.cos(b) * rr, top.y - R.range(0, 0.35), top.z + Math.sin(b) * rr], [R.range(0.3, 1.0), b, 0], [0.12, 1, 0.5], [0, 0.15, 0, 8.0]);
      }
      if (R() < 0.75) {
        for (let k = 0; k < 14; k++) {
          ctx.add(W.g.sph(1, 6), W.jit(0xd8201c, 0.15, R), [top.x + R.range(-0.08, 0.08), top.y - R.range(0.02, 0.2), top.z + R.range(-0.08, 0.08)], null, 0.03, [0, 0.12, 0, 0]);
        }
      }
    }
  };

  // susuki (pampas grass) clump: blades + plumes
  W.susuki = function (x, z, s, seed, y0) {
    const y = y0 !== undefined ? y0 : W.H(x, z);
    const ctx = new W.Ctx(W.bucket('plants'));
    const R = W.rng(seed || 17);
    s = s || 1;
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, lean = R.range(0.2, 0.7);
      const h = R.range(0.6, 1.1) * s;
      const d = new V3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
      const p1 = new V3(x, y, z).addScaledVector(d, h * 0.5); const p2 = new V3(x, y, z).addScaledVector(d, h); p2.y -= h * 0.25 * lean;
      ctx.add(W.g.tube([new V3(x + R.range(-0.05, 0.05), y, z + R.range(-0.05, 0.05)), p1, p2], (t) => 0.012 * (1 - t) + 0.002, 0, 3, 5), W.jit(0x8a8f4a, 0.3, R), null, null, undefined, [0, 0.35 * s, 0, 8.0]);
    }
    for (let i = 0; i < 11; i++) {
      const a = R() * Math.PI * 2, lean = R.range(0.05, 0.4);
      const h = R.range(1.1, 1.6) * s;
      const base = new V3(x + R.range(-0.06, 0.06), y, z + R.range(-0.06, 0.06));
      const top = base.clone().add(new V3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h));
      ctx.add(W.g.tube([base, base.clone().lerp(top, 0.6), top], 0.008, 0.005, 3, 4), 0xa59a62, null, null, undefined, [0, 0.4 * s, 0, 0]);
      // plume: cluster of drooping strands
      for (let k = 0; k < 7; k++) {
        const b = a + (k - 3) * 0.25;
        const e = top.clone().add(new V3(Math.cos(b) * 0.12 * s, -0.22 * s * R.range(0.6, 1), Math.sin(b) * 0.12 * s));
        ctx.add(W.g.tube([top, top.clone().lerp(e, 0.5).add(new V3(0, 0.05 * s, 0)), e], 0.022 * s, 0.008 * s, 4, 4), W.jit(0xe8dcc0, 0.15, R), null, null, undefined, [0, 0.55 * s, 0, 7.0]);
      }
    }
  };

  // higanbana (red spider lily) cluster
  W.higanbana = function (x, z, n, seed, y0) {
    const R = W.rng(seed || 23);
    const ctx = new W.Ctx(W.bucket('plants'));
    for (let i = 0; i < (n || 7); i++) {
      const px = x + R.range(-0.35, 0.35), pz = z + R.range(-0.35, 0.35);
      const py = y0 !== undefined ? y0 : W.H(px, pz);
      const h = R.range(0.38, 0.55);
      const top = new V3(px + R.range(-0.04, 0.04), py + h, pz + R.range(-0.04, 0.04));
      ctx.add(W.g.tube([new V3(px, py, pz), top], 0.01, 0.008, 4, 2), 0x5c7a2a, null, null, undefined, [0, 0.2, 0, 0]);
      // petals: curled ribbons
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + R();
        const d = new V3(Math.cos(a), 0, Math.sin(a));
        const p1 = top.clone().addScaledVector(d, 0.06).add(new V3(0, 0.01, 0));
        const p2 = top.clone().addScaledVector(d, 0.1).add(new V3(0, -0.03, 0));
        ctx.add(W.g.tube([top, p1, p2], 0.012, 0.004, 3, 4), W.jit(0xe0141c, 0.12, R), null, null, undefined, [0.15, 0.25, 0, 7.0]);
        // stamens
        const s1 = top.clone().addScaledVector(d, 0.11).add(new V3(0, 0.09, 0));
        ctx.add(W.g.tube([top, top.clone().addScaledVector(d, 0.06).add(new V3(0, 0.07, 0)), s1], 0.003, 0.002, 3, 3), 0xf0242a, null, null, undefined, [0.1, 0.25, 0, 0]);
      }
    }
  };

  // flower head generator (used for bouquets etc)
  W.flowerHead = function (ctx, p, kind, color, size, R, rot) {
    R = R || W.R;
    const c = W.jit(color, 0.18, R);
    const f = ctx.at([p.x, p.y, p.z], rot || [0, 0, 0], size);
    const pet = W.g.leaf('round');
    const fx = [0.05, 0.12, 0, 7.0];
    if (kind === 'rose') {
      f.add(W.g.sph(1, 10), c.clone().multiplyScalar(0.8), [0, 0.35, 0], null, [0.42, 0.5, 0.42], fx);
      for (let i = 0; i < 9; i++) { const a = i * 2.4; const r = 0.35 + (i % 3) * 0.12; f.add(pet, c, [Math.cos(a) * r * 0.5, 0.35 + (i % 3) * 0.05, Math.sin(a) * r * 0.5], [0.9 - (i % 3) * 0.3, -a + Math.PI / 2, 0], 0.62, fx); }
    } else if (kind === 'ranunculus') {
      for (let l = 0; l < 4; l++) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + l * 0.4; const r = 0.55 - l * 0.13; f.add(pet, c.clone().multiplyScalar(1 - l * 0.06), [Math.cos(a) * r * 0.6, 0.2 + l * 0.1, Math.sin(a) * r * 0.6], [1.2 - l * 0.25, -a + Math.PI / 2, 0], 0.5 - l * 0.06, fx); }
    } else if (kind === 'anemone') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; f.add(pet, c, [Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38], [0.25, -a + Math.PI / 2, 0], [0.75, 1, 0.9], fx); }
      f.add(W.g.sph(1, 8), 0x1a1424, [0, 0.16, 0], null, [0.2, 0.12, 0.2], [0, 0.12, 0, 0]);
    } else if (kind === 'dahlia') {
      for (let l = 0; l < 3; l++) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + l * 0.26; const r = 0.75 - l * 0.22; f.add(W.g.leaf('narrow'), c.clone().multiplyScalar(1 - l * 0.08), [Math.cos(a) * r * 0.5, 0.1 + l * 0.09, Math.sin(a) * r * 0.5], [0.35 + l * 0.35, -a + Math.PI / 2, 0], [0.5, 1, 0.55 - l * 0.1], fx); }
      f.add(W.g.sph(1, 8), c.clone().multiplyScalar(0.7), [0, 0.3, 0], null, [0.15, 0.1, 0.15], fx);
    } else if (kind === 'cosmos') {
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; f.add(pet, c, [Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42], [0.15, -a + Math.PI / 2, 0], [0.55, 1, 0.9], fx); }
      f.add(W.g.sph(1, 8), 0xf0b020, [0, 0.1, 0], null, [0.16, 0.08, 0.16], [0, 0.12, 0, 0]);
    } else if (kind === 'mum') {
      for (let l = 0; l < 4; l++) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + l * 0.2; const r = 0.85 - l * 0.2; f.add(W.g.leaf('narrow'), c.clone().multiplyScalar(1 - l * 0.05), [Math.cos(a) * r * 0.5, 0.1 + l * 0.12, Math.sin(a) * r * 0.5], [0.3 + l * 0.38, -a + Math.PI / 2, 0], [0.38, 1, 0.6 - l * 0.08], fx); }
    } else if (kind === 'lavender') {
      for (let i = 0; i < 7; i++) f.add(W.g.sph(1, 6), c, [0, i * 0.18, 0], null, [0.12, 0.1, 0.12], fx);
    } else if (kind === 'camellia') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; f.add(pet, c, [Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36], [0.5, -a + Math.PI / 2, 0], [0.8, 1, 0.9], fx); }
      f.add(W.g.cyl(0.12, 0.08, 0.2, 8), 0xf2d040, [0, 0.15, 0], null, 1, fx);
    }
  };

  W.treeList = [];
})();
