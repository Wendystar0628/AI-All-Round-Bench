/* studio interior: orrery, painting corner, tea, reading corner, furnishings */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C;
  const FL = W.L.STUDIO.floor, TOP = W.L.STUDIO.wallTop;
  const DARK = 0x3d2b20, BRASS = 0xc9a24a, BRASS2 = 0xb8893a;
  const FB = [0, 0, 0, 9.0], FW = [0, 0, 0, 1.0], FWY = [0, 0, 0, 1.25], FWZ = [0, 0, 0, 1.5];
  const GLOW = (e) => [e, 0, 0, 0];

  // ---------- ORRERY ----------
  function orrery() {
    const O = new V3(-11, FL, -9.2);
    W.orreryPos = O;
    const B = W.bucket('orreryBase');
    const ctx = new W.Ctx(B).at([O.x, O.y, O.z]);
    // carved pedestal: lathe profile
    const prof = [[0, 0], [0.62, 0], [0.64, 0.05], [0.58, 0.09], [0.5, 0.1], [0.46, 0.16], [0.3, 0.2], [0.22, 0.28], [0.17, 0.4], [0.2, 0.48], [0.14, 0.55], [0.12, 0.72], [0.16, 0.78], [0.2, 0.82], [0.0, 0.82]];
    ctx.add(W.g.lathe(prof, 32, 'orrbase'), 0x4a2e22, [0, 0, 0], null, 1, [0, 0, 0, 1.25]);
    [0.05, 0.2, 0.48, 0.78].forEach((y, i) => ctx.add(W.g.torus([0.6, 0.3, 0.2, 0.18][i], 0.018, 6, 40), BRASS, [0, y, 0], [Math.PI / 2, 0, 0], 1, FB));
    // carved scroll legs
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      const pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; const r = 0.22 + t * 0.42; pts.push(new V3(Math.cos(a) * r, 0.42 - t * 0.36 + Math.sin(t * Math.PI) * 0.08, Math.sin(a) * r)); }
      ctx.add(W.g.tube(pts, (t) => 0.045 - t * 0.02, 0, 7, 14), 0x5a3626, null, null, undefined, FWY);
      const e = pts[pts.length - 1];
      ctx.add(W.g.torus(0.05, 0.016, 6, 14), BRASS, [e.x, e.y + 0.03, e.z], [0, -a, 0], 1, FB);
      // carved leaf ornaments on base
      ctx.add(W.g.leaf('maple'), BRASS, [Math.cos(a + 0.78) * 0.35, 0.19, Math.sin(a + 0.78) * 0.35], [-0.9, -a - 0.78 + Math.PI / 2, 0], 0.09, FB);
    }
    // stand: fixed meridian half-ring & horizon ring
    const HC = 1.72; // center height above floor
    W.orreryCenter = new V3(O.x, O.y + HC, O.z);
    W.U.uOrrC.value.copy(W.orreryCenter);
    ctx.add(W.g.cyl(0.035, 0.05, HC - 0.82 - 0.74, 10), BRASS2, [0, 0.82 + (HC - 0.82 - 0.74) / 2, 0], null, 1, FB);
    ctx.add(W.g.torus(0.76, 0.024, 8, 64, Math.PI * 5 / 3), BRASS, [0, HC, 0], [0, 0, -Math.PI / 3], 1, FB);
    // horizon ring: wide band
    ctx.add(W.g.cyl(0.8, 0.8, 0.06, 64, true), BRASS, [0, HC, 0], null, 1, FB);
    ctx.add(W.g.cyl(0.84, 0.84, 0.02, 64, true), BRASS2, [0, HC + 0.03, 0], null, 1, FB);
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; ctx.box(0.006, 0.012 + (i % 6 === 0 ? 0.02 : 0), 0.03, 0x5a4020, [Math.cos(a) * 0.82, HC + 0.035, Math.sin(a) * 0.82], [0, -a, 0], [0, 0, 0, 0]); }
    // horizon ring supports
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; ctx.add(W.g.tube([new V3(Math.cos(a) * 0.15, 0.85, Math.sin(a) * 0.15), new V3(Math.cos(a) * 0.55, HC - 0.35, Math.sin(a) * 0.55), new V3(Math.cos(a) * 0.79, HC - 0.02, Math.sin(a) * 0.79)], 0.016, 0.012, 6, 8), BRASS2, null, null, undefined, FB); }
    // zodiac star marks on horizon band (emissive dots)
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.26; ctx.add(W.g.starG(0.025, 0.011, 5), 0xfff0b0, [Math.cos(a) * 0.805, HC, Math.sin(a) * 0.805], [0, -a + Math.PI / 2, 0], 1, GLOW(0.9)); }

    // moving rings (nested gimbals)
    const radii = [0.68, 0.59, 0.5, 0.41];
    const rings = [];
    let parent = null;
    radii.forEach((r, i) => {
      const p = W.part('ring' + i, i === 0 ? W.orreryCenter : new V3(), { parent });
      const c = p.ctx;
      const band = i % 2 ? 0x8a6a3a : BRASS;
      // band ring lying in XY plane: cylinder axis along Z
      c.add(W.g.cyl(r, r, 0.045, 72, true), band, [0, 0, 0], [Math.PI / 2, 0, 0], 1, FB);
      c.add(W.g.torus(r, 0.008, 5, 72), BRASS2, [0, 0, 0.024], null, 1, FB);
      c.add(W.g.torus(r, 0.008, 5, 72), BRASS2, [0, 0, -0.024], null, 1, FB);
      // tick marks
      for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; c.box(0.012, 0.004 + (k % 4 === 0 ? 0.01 : 0), 0.03, 0x4a3018, [Math.cos(a) * (r + 0.002), Math.sin(a) * (r + 0.002), 0], [0, 0, a + Math.PI / 2], [0, 0, 0, 0]); }
      // constellation pattern stars on the band
      const R = W.rng(300 + i);
      for (let k = 0; k < 9; k++) {
        const a0 = R() * Math.PI * 2;
        for (let s = 0; s < 3; s++) { const a = a0 + s * 0.07; const zz = (k % 2 ? 1 : -1) * 0.0235; c.add(W.g.starG(0.012 + (s === 1 ? 0.006 : 0), 0.005, 5), 0xd8f0ff, [Math.cos(a) * (r - 0.004), Math.sin(a) * (r - 0.004), zz], [0, zz < 0 ? Math.PI : 0, 0], [1, 1, 1], GLOW(1.0)); }
      }
      // pivots to next ring
      const axisY = i % 2 === 0; // ring i+1 rotates about local X if i even? define: ring0 about Y (world), ring1 about X, ring2 about Y, ring3 about X
      if (i < radii.length - 1) {
        const nr = radii[i + 1];
        const pAxis = (i + 1) % 2 === 1 ? 'x' : 'y';
        [-1, 1].forEach((sgn) => {
          const pp = pAxis === 'x' ? [sgn * (r + nr) / 2, 0, 0] : [0, sgn * (r + nr) / 2, 0];
          c.add(W.g.cyl(0.012, 0.012, r - nr, 6), BRASS2, pp, pAxis === 'x' ? [0, 0, Math.PI / 2] : null, 1, FB);
          c.add(W.g.sph(1, 8), BRASS, pAxis === 'x' ? [sgn * r, 0, 0] : [0, sgn * r, 0], null, 0.025, FB);
        });
      } else {
        // inner ring holds the star via 2 thin spokes
        [-1, 1].forEach((sgn) => c.add(W.g.cyl(0.006, 0.006, r - 0.2, 5), BRASS2, [0, sgn * (r + 0.2) / 2, 0], null, 1, FB));
      }
      if (i === 0) {
        // pivots on stand meridian (top & bottom)
        [-1, 1].forEach((sgn) => c.add(W.g.sph(1, 8), BRASS, [0, sgn * r, 0], null, 0.03, FB));
      }
      p.axis = i % 2 === 0 ? 'y' : 'x';
      p.k = [1, -1, 2, -2][i];
      rings.push(p);
      parent = p;
    });
    W.orreryRings = rings;
    // fixed meridian connecting to ring0 pivots
    ctx.add(W.g.cyl(0.012, 0.012, 0.09, 6), BRASS2, [0, HC + 0.72, 0], null, 1, FB);
    ctx.add(W.g.cyl(0.012, 0.012, 0.09, 6), BRASS2, [0, HC - 0.72, 0], null, 1, FB);
    // glowing star (own material)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 28), W.makeOrbMat());
    orb.position.copy(W.orreryCenter);
    W.scene.add(orb);
    W.orb = orb;
    // small orbiting bodies
    W.orbBodies = [];
    [[0.27, 0xbfe6ff, 0.035, 0.6, 0.3], [0.31, 0xffd890, 0.028, -0.45, -0.5], [0.35, 0xf0b0d0, 0.024, 0.32, 1.1]].forEach((b, i) => {
      const p = W.part('body' + i, W.orreryCenter);
      p.ctx.add(W.g.sph(1, 12), b[1], [b[0], 0, 0], null, b[2], GLOW(1.0));
      p.speed = b[3]; p.tilt = b[4];
      W.orbBodies.push(p);
    });
    // instruments around the base
    // astrolabe
    {
      const a = new W.Ctx(B).at([-10.05, FL, -8.55], [0, -0.4, 0]);
      a.add(W.g.cyl(0.07, 0.09, 0.03, 12), DARK, [0, 0.015, 0], null, 1, FW);
      a.add(W.g.cyl(0.015, 0.015, 0.28, 6), BRASS2, [0, 0.16, 0], null, 1, FB);
      const disc = a.at([0, 0.42, 0], [0, 0, 0]);
      disc.add(W.g.cyl(0.16, 0.16, 0.012, 36), BRASS, [0, 0, 0], [Math.PI / 2, 0, 0], 1, FB);
      disc.add(W.g.torus(0.16, 0.01, 5, 36), BRASS2, [0, 0, 0], null, 1, FB);
      disc.add(W.g.torus(0.1, 0.004, 4, 30), 0x5a4020, [0, 0, 0.008], null, 1, FB);
      disc.add(W.g.torus(0.06, 0.004, 4, 30), 0x5a4020, [0, 0, 0.008], null, 1, FB);
      disc.box(0.3, 0.012, 0.006, BRASS2, [0, 0, 0.012], [0, 0, 0.6], FB);
      disc.add(W.g.torus(0.02, 0.006, 4, 12), BRASS, [0, 0.18, 0], null, 1, FB);
      for (let k = 0; k < 6; k++) disc.add(W.g.starG(0.012, 0.005, 5), 0xfff0b0, [Math.cos(k) * 0.12, Math.sin(k * 1.3) * 0.1, 0.01], null, 1, GLOW(0.6));
    }
    // hourglass
    {
      const h = new W.Ctx(B).at([-11.95, FL, -8.45]);
      h.add(W.g.cyl(0.09, 0.09, 0.025, 6), DARK, [0, 0.012, 0], null, 1, FW);
      h.add(W.g.cyl(0.09, 0.09, 0.025, 6), DARK, [0, 0.3, 0], null, 1, FW);
      for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28; h.add(W.g.cyl(0.008, 0.008, 0.28, 5), DARK, [Math.cos(a) * 0.075, 0.155, Math.sin(a) * 0.075], null, 1, FWY); }
      h.add(W.g.lathe([[0.005, 0], [0.06, 0.02], [0.065, 0.06], [0.04, 0.1], [0.01, 0.135], [0.04, 0.17], [0.065, 0.21], [0.06, 0.25], [0.005, 0.27]], 16, 'hglass'), 0xdfeff2, [0, 0.025, 0], null, 1, [0.15, 0, 0, 0]);
      h.add(W.g.cone(0.05, 0.05, 12), 0xe8c070, [0, 0.06, 0], null, 1, [0, 0, 0, 0]);
      h.add(W.g.cone(0.035, 0.03, 12), 0xe8c070, [0, 0.19, 0], [Math.PI, 0, 0], 1, [0, 0, 0, 0]);
    }
    // sextant lying on a small box
    {
      const s = new W.Ctx(B).at([-11.75, FL, -10.15], [0, 0.6, 0]);
      s.box(0.42, 0.12, 0.32, 0x6a4430, [0, 0.06, 0], null, FW);
      const sx = s.at([0, 0.13, 0], [-Math.PI / 2 + 0.1, 0, 0]);
      sx.add(W.g.torus(0.2, 0.01, 5, 24, Math.PI / 3), BRASS, [0, -0.1, 0], [0, 0, Math.PI / 3], 1, FB);
      sx.box(0.012, 0.22, 0.01, BRASS, [-0.05, 0.0, 0], [0, 0, -0.26], FB);
      sx.box(0.012, 0.22, 0.01, BRASS, [0.05, 0.0, 0], [0, 0, 0.26], FB);
      sx.box(0.01, 0.24, 0.01, BRASS2, [0.02, 0.0, 0.01], [0, 0, 0.1], FB);
      sx.add(W.g.cyl(0.015, 0.015, 0.12, 8), 0x3a3030, [-0.06, 0.05, 0.02], [0, 0, Math.PI / 2], 1, FB);
    }
    // halo + motes
    W.orbHalo = makeHalo([[W.orreryCenter, 0x9fd0ff, 2.4, 0.4], [W.orreryCenter, 0xffe0a0, 1.1, 0.3]]);
    const motes = new THREE.BufferGeometry();
    const mp = [], md = [];
    const R = W.rng(77);
    for (let i = 0; i < 90; i++) {
      const d = new V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(R.range(0.3, 1.3));
      mp.push(W.orreryCenter.x + d.x, W.orreryCenter.y + d.y * 0.8, W.orreryCenter.z + d.z);
      md.push(R(), R.range(0.6, 1.4), 0, R.range(0.5, 1));
    }
    motes.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    motes.setAttribute('aData', new THREE.Float32BufferAttribute(md, 4));
    const mm = W.makeMoteMat({ color: 0xbfe0ff, size: 0.045, drift: 0.25 });
    mm.uniforms.uBox.value.set(0.25, 0.25, 0.25);
    const pts = new THREE.Points(motes, mm);
    pts.layers.set(W.LAYER.FX); pts.frustumCulled = false; pts.renderOrder = 5;
    W.scene.add(pts);
    W.orbMotes = pts;
    // burst ring (flash): points on a circle expanding
    const bg = new THREE.BufferGeometry(); const bp = [], bd = [];
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; bp.push(Math.cos(a), R.range(-0.05, 0.05), Math.sin(a)); bd.push(R(), R.range(0.8, 1.4), 0, 1); }
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('aData', new THREE.Float32BufferAttribute(bd, 4));
    const bmat = W.makeMoteMat({ color: 0xe8f4ff, size: 0.06, drift: 0.0 });
    bmat.uniforms.uBox.value.set(0, 0, 0);
    const burst = new THREE.Points(bg, bmat);
    burst.position.copy(W.orreryCenter);
    burst.layers.set(W.LAYER.FX); burst.frustumCulled = false; burst.renderOrder = 6; burst.visible = false;
    W.scene.add(burst);
    W.orbBurst = burst;
    // skylight shaft
    makeShaft(W.skylight.clone().add(new V3(0, 0.1, 0)), W.orreryCenter.clone().add(new V3(0, -1.2, 0.0)), 0.55, 0.7, 2);
  }

  function makeHalo(list) {
    const g = new THREE.BufferGeometry(); const p = [], c = [], s = [];
    list.forEach((h) => { p.push(h[0].x, h[0].y, h[0].z); const cc = C(h[1]); c.push(cc.r, cc.g, cc.b, h[3]); s.push(h[2]); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(c, 4));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(s, 1));
    const m = new THREE.Points(g, W.makeHaloMat());
    m.layers.set(W.LAYER.FX); m.frustumCulled = false; m.renderOrder = 7;
    W.scene.add(m);
    return m;
  }
  W.makeHalo = makeHalo;

  // light shaft geometry (box between two points)
  function makeShaft(a, b, w0, w1, seed) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(w0, w1, len, 16, 1, true);
    const uv = g.attributes.uv; const P = g.attributes.position;
    for (let i = 0; i < uv.count; i++) { uv.setXY(i, uv.getX(i), 1 - uv.getY(i)); }
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(P.count).fill(seed || 0), 1));
    const m = new THREE.Mesh(g, W.makeShaftMat());
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), a.clone().sub(b).normalize());
    m.layers.set(W.LAYER.FX); m.renderOrder = 8;
    W.scene.add(m);
    (W.shafts = W.shafts || []).push(m);
    return m;
  }
  W.makeShaft = makeShaft;

  // ---------- painting corner ----------
  function paintingCorner(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(201);
    // easel
    const e = ctx.at([-9.35, FL, -6.2], [0, 0.18, 0]);
    e.add(W.g.box(0.045, 1.9, 0.035), 0x9a7048, [-0.38, 0.94, 0.06], [0.08, 0, 0.12], 1, FWY);
    e.add(W.g.box(0.045, 1.9, 0.035), 0x9a7048, [0.38, 0.94, 0.06], [0.08, 0, -0.12], 1, FWY);
    e.add(W.g.box(0.045, 1.8, 0.035), 0x9a7048, [0, 0.88, -0.38], [-0.3, 0, 0], 1, FWY);
    e.box(0.95, 0.05, 0.08, 0x8a6040, [0, 0.72, 0.1], null, FW);
    e.box(0.7, 0.035, 0.035, 0x8a6040, [0, 1.72, 0.0], null, FW);
    // canvas with unfinished painting
    e.box(0.98, 0.74, 0.03, 0xffffff, [0, 1.11, 0.1], [-0.08, 0, 0], [0, 0, 0, 0], W.atlas.get('painting'));
    e.box(1.0, 0.76, 0.02, 0xe8e0cc, [0, 1.11, 0.085], [-0.08, 0, 0], FW);
    // paint supplies on a low crate-table
    const t = ctx.at([-8.35, FL, -6.45], [0, -0.25, 0]);
    t.box(0.7, 0.36, 0.45, 0x8a6a46, [0, 0.18, 0], null, FW);
    // open paint box with tubes
    const pb = t.at([-0.12, 0.36, 0.02]);
    pb.box(0.36, 0.06, 0.26, 0x6a4a2e, [0, 0.03, 0], null, FW);
    pb.box(0.36, 0.02, 0.26, 0x7a5a3a, [0, 0.13, -0.17], [-1.2, 0, 0], FW);
    const tc = [0xd8282a, 0xf2c040, 0x2a6ac8, 0x3a9a4a, 0xf08a2a, 0x8a4ac8, 0xf6f0e0, 0x5a3a22, 0xc84a8a, 0x2a2a2a];
    for (let i = 0; i < 10; i++) {
      const x = -0.15 + (i % 5) * 0.075, z = -0.06 + Math.floor(i / 5) * 0.11;
      pb.add(W.g.cyl(0.014, 0.014, 0.09, 8), 0xe8e8e8, [x, 0.075, z], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 12.0]);
      pb.add(W.g.cyl(0.0145, 0.0145, 0.03, 8), tc[i], [x, 0.075, z + 0.02], [Math.PI / 2, 0, 0], 1);
    }
    // watercolor tin
    const wt = t.at([0.2, 0.36, -0.08], [0, 0.3, 0]);
    wt.box(0.22, 0.02, 0.1, 0x2a3a5a, [0, 0.01, 0], null, [0, 0, 0, 12.0]);
    for (let i = 0; i < 12; i++) wt.box(0.026, 0.012, 0.03, tc[i % tc.length], [-0.085 + (i % 6) * 0.034, 0.022, -0.02 + Math.floor(i / 6) * 0.04], null);
    wt.box(0.22, 0.1, 0.01, 0xf2f2f2, [0, 0.06, -0.055], [-0.3, 0, 0], [0, 0, 0, 12.0]);
    // palette with paint dabs
    const pl = t.at([0.12, 0.365, 0.14], [0, -0.4, 0]);
    pl.add(W.g.cyl(0.13, 0.13, 0.012, 20), 0xd8b888, [0, 0.006, 0], null, [1.3, 1, 1], FW);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 5 + 0.4; pl.add(W.g.sph(1, 6), tc[i], [Math.cos(a) * 0.12, 0.014, Math.sin(a) * 0.08], null, [0.022, 0.008, 0.018]); }
    pl.add(W.g.sph(1, 6), 0x8a5aa8, [0.0, 0.014, 0.0], null, [0.05, 0.005, 0.03]);
    // brush washer (murky water)
    ctx.add(W.g.cyl(0.11, 0.1, 0.16, 16, true), 0x9aa8b0, [-8.75, FL + 0.08, -5.75], null, 1, [0, 0, 0, 12.0]);
    ctx.add(W.g.cyl(0.1, 0.1, 0.01, 16), 0x7a7a5a, [-8.75, FL + 0.13, -5.75], null, 1, [0.05, 0, 0, 0]);
    ctx.add(W.g.cyl(0.006, 0.004, 0.32, 5), 0xa07040, [-8.72, FL + 0.22, -5.75], [0, 0, 0.5], 1);
    ctx.add(W.g.cyl(0.006, 0.004, 0.3, 5), 0x3a2a1a, [-8.78, FL + 0.22, -5.73], [0.3, 0, -0.4], 1);
    // brush pot
    const bp = ctx.at([-7.95, FL + 0.36, -6.62]);
    bp.add(W.g.cyl(0.06, 0.055, 0.16, 14, true), 0x4a6a8a, [0, 0.08, 0], null, 1, [0, 0, 0, 6.0]);
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.03; const L = R.range(0.22, 0.42); bp.add(W.g.cyl(0.005, 0.004, L, 5), [0xa07040, 0x3a2a1a, 0xd8b060, 0x8a2a1a][i % 4], [Math.cos(a) * r, L / 2 + 0.04, Math.sin(a) * r], [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], 1); bp.add(W.g.cone(0.008, 0.03, 5), 0x2a2220, [Math.cos(a) * (r + 0.018), L + 0.05, Math.sin(a) * (r + 0.018)], [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], 1); }
    // pencils and eraser crumbs on tatami
    for (let i = 0; i < 3; i++) ctx.add(W.g.cyl(0.006, 0.006, 0.18, 6), [0x2a5a3a, 0xc8a040, 0x3a3a8a][i], [-9.9 + i * 0.12, FL + 0.064, -6.85 + i * 0.05], [Math.PI / 2, i * 0.7, 0], 1);
    ctx.box(0.05, 0.02, 0.025, 0xf2e8e0, [-9.62, FL + 0.07, -6.9], [0, 0.4, 0]);
    for (let i = 0; i < 14; i++) ctx.add(W.g.ico(1, 0), 0xe8dcd0, [-9.6 + R.range(-0.15, 0.15), FL + 0.064, -6.95 + R.range(-0.1, 0.1)], [R(), R(), 0], 0.008);
    // scattered drawings on tatami (some lift in gusts)
    const sheets = [['sketchMaple', -10.3, -7.2, 0.4], ['sketchTorii', -9.75, -7.55, -0.3], ['sketchStars', -8.9, -7.3, 0.9], ['sketchGarden', -10.6, -6.5, -0.7], ['sketchMaple', -8.4, -7.6, 1.6]];
    W.liftSheets = [];
    sheets.forEach((s, i) => {
      if (i < 2) {
        // pivot at far edge so the near corner can lift
        const piv = new V3(s[1], FL + 0.065, s[2]);
        const p = W.part('sheet' + i, piv);
        p.ctx.add(W.g.box(0.42, 0.004, 0.52), 0xffffff, [0, 0, 0.26], null, 1, [0, 0, 0, 7.0], W.atlas.get(s[0]));
        p.baseRotY = s[3];
        W.liftSheets.push(p);
      } else {
        ctx.add(W.g.box(0.42, 0.004, 0.52), 0xffffff, [s[1], FL + 0.065, s[2]], [0, s[3], 0], 1, [0, 0, 0, 7.0], W.atlas.get(s[0]));
      }
    });
    // taped sketches on right wall [-7,-5] (inner face x=-6.08)
    [['sketchMaple', -6.55, FL + 1.75, -0.08], ['sketchTorii', -5.85, FL + 1.85, 0.05], ['sketchStars', -6.25, FL + 1.1, -0.04]].forEach((s, i) => {
      ctx.box(0.004, 0.46, 0.37, 0xffffff, [-6.075, s[2], s[1]], [s[3], -Math.PI / 2 * 0, 0], [0, 0, 0, 7.0], W.atlas.get(s[0]));
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => ctx.box(0.006, 0.03, 0.07, 0xe8d6a0, [-6.078, s[2] + a * 0.21, s[1] + b * 0.16], [0, 0, 0], [0, 0, 0, 7.0]));
    });
    // frames leaning against right wall & rolled papers
    [[-6.3, -5.55, 0.7, 0.55, 0x6a4a30], [-6.28, -5.85, 0.55, 0.45, 0xc8a060], [-6.26, -6.1, 0.4, 0.5, 0x2a2a2a]].forEach((f) => {
      const fr = ctx.at([f[0], FL, f[1]], [0, Math.PI / 2, 0.0]);
      const ww = f[2], hh = f[3];
      const lean = fr.at([0, 0, 0], [-0.18, 0, 0]);
      lean.box(ww, 0.04, 0.03, f[4], [0, 0.02, 0], null, FW);
      lean.box(ww, 0.04, 0.03, f[4], [0, hh, 0], null, FW);
      lean.box(0.04, hh, 0.03, f[4], [-ww / 2, hh / 2, 0], null, FWY);
      lean.box(0.04, hh, 0.03, f[4], [ww / 2, hh / 2, 0], null, FWY);
      lean.box(ww - 0.06, hh - 0.04, 0.01, 0xf2ead8, [0, hh / 2, -0.01], null, [0, 0, 0, 7.0]);
    });
    for (let i = 0; i < 5; i++) ctx.add(W.g.cyl(0.035, 0.035, R.range(0.55, 0.8), 10), [0xf2ead8, 0xe8dcc0, 0xd8e2e8][i % 3], [-6.35 - (i % 2) * 0.07, FL + 0.32, -6.55 - i * 0.07], [0.08 * (i - 2), 0, 0.1], 1, [0, 0, 0, 7.0]);
    // apron on hook
    ctx.add(W.g.cyl(0.01, 0.01, 0.08, 6), BRASS, [-6.1, FL + 1.65, -6.9], [0, 0, Math.PI / 2], 1, FB);
    const ap = ctx.at([-6.12, FL + 1.62, -6.9], [0, -Math.PI / 2, 0]);
    ap.box(0.42, 0.66, 0.012, 0xffffff, [0, -0.33, 0.0], [0.04, 0, 0], [0, 0.02, 0, 0], W.atlas.get('apron'));
    ap.add(W.g.torus(0.08, 0.008, 4, 10, Math.PI), 0x4a5a70, [0, 0.03, 0], null, 1);
  }

  // ---------- tea area ----------
  function teaArea(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(211);
    const T = ctx.at([-13.75, FL, -7.25]);
    // low table
    T.box(1.3, 0.06, 0.85, 0x6a4430, [0, 0.33, 0], null, FW);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => T.box(0.07, 0.3, 0.07, 0x5a3a28, [a * 0.56, 0.15, b * 0.34], null, FWY));
    // cushions
    [[0, 0.75, 0xc0503a], [0, -0.75, 0x3a5a8a], [-0.95, 0, 0x8a6a3a]].forEach((c) => T.add(W.g.soft(0.62, 0.1, 0.62, 0.05, 3), c[2], [c[0], 0.05, c[1]], [0, R.range(-0.2, 0.2), 0], 1, [0, 0, 0, 0]));
    // teapot (kyusu)
    const tp = T.at([-0.3, 0.36, -0.1]);
    tp.add(W.g.sph(1, 16), 0x6a4a3a, [0, 0.08, 0], null, [0.1, 0.085, 0.1], [0, 0, 0, 6.0]);
    tp.add(W.g.cyl(0.05, 0.06, 0.02, 14), 0x5a3a2a, [0, 0.165, 0], null, 1, [0, 0, 0, 6.0]);
    tp.add(W.g.sph(1, 8), 0x5a3a2a, [0, 0.18, 0], null, 0.015);
    tp.add(W.g.cyl(0.012, 0.022, 0.1, 8), 0x6a4a3a, [0.12, 0.1, 0], [0, 0, -1.0], 1, [0, 0, 0, 6.0]);
    tp.add(W.g.cyl(0.018, 0.018, 0.12, 8), 0x3a2a22, [0, 0.09, 0.14], [Math.PI / 2, 0, 0], 1);
    // cups with steam
    W.teaCups = [];
    [[0.12, 0.22], [0.35, -0.05]].forEach((p, i) => {
      const cu = T.at([p[0], 0.36, p[1]]);
      cu.add(W.g.lathe([[0, 0], [0.035, 0], [0.04, 0.01], [0.042, 0.07], [0.038, 0.07], [0.036, 0.012], [0, 0.012]], 16, 'cup'), i ? 0xe8e0d0 : 0x5a7a8a, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
      cu.add(W.g.cyl(0.037, 0.037, 0.005, 14), 0x9aa840, [0, 0.055, 0], null, 1);
      cu.add(W.g.cyl(0.05, 0.05, 0.01, 6), 0x7a5a3a, [0, -0.002, 0], null, 1, FW);
      W.teaCups.push(cu.worldPos([0, 0.07, 0]));
    });
    // wagashi plate
    const wp = T.at([0.25, 0.365, 0.2]);
    wp.add(W.g.cyl(0.11, 0.08, 0.02, 20), 0xe8e4d8, [0, 0.01, 0], null, 1, [0, 0, 0, 6.0]);
    wp.add(W.g.leaf('maple'), 0xe0482a, [-0.04, 0.035, 0], [0, 0.4, 0], [0.06, 3, 0.06]);
    wp.add(W.g.soft(0.05, 0.03, 0.05, 0.015, 2), 0x9ac85a, [0.04, 0.035, 0.02], null, 1);
    wp.add(W.g.sph(1, 10), 0xf6f0e8, [0.03, 0.04, -0.04], null, [0.028, 0.022, 0.028]);
    wp.add(W.g.sph(1, 10), 0xf2b8c8, [-0.02, 0.04, 0.05], null, [0.026, 0.02, 0.026]);
    // basket of mikan
    const mb = T.at([0.45, 0.36, -0.22]);
    mb.add(W.g.cyl(0.14, 0.1, 0.07, 16, true), 0xb08a52, [0, 0.035, 0], null, 1, FWY);
    [[0, 0.08, 0], [0.06, 0.08, 0.05], [-0.06, 0.08, 0.04], [0.04, 0.08, -0.06], [-0.05, 0.08, -0.05], [0, 0.13, 0.0]].forEach((q) => { mb.add(W.g.sph(1, 10), 0xf08a1a, q, null, [0.042, 0.036, 0.042]); mb.add(W.g.sph(1, 4), 0x3a6a2a, [q[0], q[1] + 0.035, q[2]], null, 0.008); });
    // small tart slice
    const ts = T.at([-0.05, 0.365, 0.28], [0, 0.6, 0]);
    ts.add(W.g.cyl(0.07, 0.07, 0.012, 18), 0xe8e4d8, [0, 0.006, 0], null, 1, [0, 0, 0, 6.0]);
    {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, 0.09, -0.35, 0.35, false); sh.lineTo(0, 0);
      const geo = W.g.extrude(sh, 0.035, 0, 'tartslice', 8); geo.rotateX(-Math.PI / 2);
      ts.add(geo, 0xd8a050, [-0.04, 0.03, 0], null, 1, [0, 0, 0, 5.0]);
      ts.add(W.g.box(0.06, 0.01, 0.04), 0x5ab8d0, [0.0, 0.05, 0], null, 1, [0.1, 0, 0, 0]);
      ts.add(W.g.cyl(0.012, 0.012, 0.004, 10), 0xb8d84a, [0.01, 0.058, 0.005], null, 1);
      ts.add(W.g.sph(1, 6), 0x3a3a8a, [0.025, 0.058, -0.008], null, 0.006);
    }
    // book half-read with glasses
    const bk = T.at([-0.35, 0.365, 0.2], [0, 0.3, 0]);
    bk.box(0.3, 0.012, 0.21, 0x7a3a2a, [0, 0.006, 0], null, FW);
    bk.box(0.14, 0.02, 0.2, 0xf6efde, [-0.075, 0.018, 0], [0, 0, 0.06], [0, 0, 0, 7.0], W.atlas.get('book'));
    bk.box(0.14, 0.02, 0.2, 0xf6efde, [0.075, 0.018, 0], [0, 0, -0.06], [0, 0, 0, 7.0], W.atlas.get('book'));
    const gl = bk.at([0.0, 0.04, 0.0], [0, 0.4, 0]);
    gl.add(W.g.torus(0.03, 0.004, 5, 16), 0x3a2a22, [-0.035, 0, 0], [Math.PI / 2, 0, 0], 1, FB);
    gl.add(W.g.torus(0.03, 0.004, 5, 16), 0x3a2a22, [0.035, 0, 0], [Math.PI / 2, 0, 0], 1, FB);
    gl.box(0.012, 0.004, 0.004, 0x3a2a22, [0, 0, 0], null, FB);
    gl.box(0.004, 0.004, 0.1, 0x3a2a22, [-0.066, 0, -0.05], null, FB);
    gl.box(0.004, 0.004, 0.1, 0x3a2a22, [0.066, 0, -0.05], null, FB);
    // hibachi with iron kettle
    const hb = ctx.at([-15.05, FL, -8.35]);
    hb.add(W.g.lathe([[0, 0], [0.26, 0], [0.32, 0.08], [0.34, 0.3], [0.3, 0.36], [0.27, 0.36], [0.28, 0.14], [0, 0.14]], 24, 'hibachi'), 0x3a5a7a, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
    hb.add(W.g.cyl(0.27, 0.27, 0.02, 20), 0xcfc4b0, [0, 0.3, 0], null, 1, [0, 0, 0, 3.0]);
    for (let i = 0; i < 5; i++) hb.add(W.g.ico(1, 0), 0xe0501a, [R.range(-0.08, 0.08), 0.32, R.range(-0.08, 0.08)], [R(), R(), 0], 0.035, GLOW(0.85));
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28; hb.add(W.g.cyl(0.01, 0.01, 0.12, 5), 0x2a2a2a, [Math.cos(a) * 0.14, 0.38, Math.sin(a) * 0.14], null, 1, [0, 0, 0, 12.0]); }
    hb.add(W.g.torus(0.15, 0.012, 5, 20), 0x2a2a2a, [0, 0.44, 0], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 12.0]);
    const kt = hb.at([0, 0.45, 0]);
    kt.add(W.g.lathe([[0, 0], [0.13, 0.0], [0.17, 0.06], [0.16, 0.14], [0.08, 0.19], [0.05, 0.2], [0, 0.2]], 20, 'kettle'), 0x2e2a2a, [0, 0, 0], null, 1, [0, 0, 0, 12.0], null, (lx, ly, lz) => C(0x2e2a2a).clone().multiplyScalar(0.85 + 0.3 * ((Math.floor(lx * 60) + Math.floor(ly * 60) + Math.floor(lz * 60)) % 2)));
    kt.add(W.g.cyl(0.015, 0.03, 0.13, 8), 0x2e2a2a, [0.17, 0.12, 0], [0, 0, -0.9], 1, [0, 0, 0, 12.0]);
    kt.add(W.g.torus(0.13, 0.012, 6, 16, Math.PI), 0x2e2a2a, [0, 0.2, 0], null, 1, [0, 0, 0, 12.0]);
    W.kettleSpout = kt.worldPos([0.23, 0.17, 0]);
    // cat cushion
    ctx.add(W.g.soft(0.6, 0.1, 0.6, 0.05, 3), 0xd8a040, [-14.85, FL + 0.05, -6.35], [0, 0.3, 0], 1);
    W.catHome = new V3(-14.85, FL + 0.1, -6.35);
  }

  // ---------- reading / stargazing corner ----------
  function readingCorner(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(221);
    const D = ctx.at([-8.55, FL, -12.25]);
    D.box(1.4, 0.06, 0.62, 0x5a3a28, [0, 0.36, 0], null, FW);
    D.box(1.32, 0.3, 0.04, 0x4a3022, [0, 0.18, -0.28], null, FW);
    D.box(0.05, 0.33, 0.6, 0x4a3022, [-0.66, 0.165, 0], null, FWZ);
    D.box(0.05, 0.33, 0.6, 0x4a3022, [0.66, 0.165, 0], null, FWZ);
    ctx.add(W.g.soft(0.6, 0.1, 0.6, 0.05, 3), 0x5a6a3a, [-8.55, FL + 0.05, -11.45], null, 1);
    // notebook (pages flip in gust)
    D.box(0.5, 0.012, 0.36, 0x2a3a5a, [-0.05, 0.395, 0.08], null, FW);
    D.box(0.24, 0.01, 0.34, 0xffffff, [-0.175, 0.405, 0.08], null, [0, 0, 0, 7.0], [W.atlas.get('notes')[0], W.atlas.get('notes')[1], (W.atlas.get('notes')[0] + W.atlas.get('notes')[2]) / 2, W.atlas.get('notes')[3]]);
    D.box(0.24, 0.01, 0.34, 0xffffff, [0.075, 0.405, 0.08], null, [0, 0, 0, 7.0], [(W.atlas.get('notes')[0] + W.atlas.get('notes')[2]) / 2, W.atlas.get('notes')[1], W.atlas.get('notes')[2], W.atlas.get('notes')[3]]);
    W.notePages = [];
    const spine = D.worldPos([-0.05, 0.41, 0.08]);
    for (let i = 0; i < 4; i++) {
      const p = W.part('page' + i, spine);
      p.ctx.add(W.g.box(0.235, 0.002, 0.33), 0xf7f1e2, [0.12, 0, 0], null, 1, [0, 0, 0, 7.0]);
      p.ctx.add(W.g.box(0.18, 0.001, 0.2), 0xd8d4e8, [0.12, 0.0015, -0.02], null, 1, [0, 0, 0, 7.0]);
      W.notePages.push(p);
    }
    // ink bottle, pen, compass, magnifier
    D.add(W.g.cyl(0.035, 0.04, 0.06, 10), 0x1a2a4a, [0.42, 0.42, -0.1], null, 1, [0.2, 0, 0, 0]);
    D.add(W.g.cyl(0.02, 0.02, 0.025, 8), 0x2a2a2a, [0.42, 0.465, -0.1], null, 1);
    D.add(W.g.cyl(0.007, 0.006, 0.15, 8), 0x1a1a2a, [0.3, 0.4, 0.12], [Math.PI / 2, 0.6, 0], 1, [0, 0, 0, 12.0]);
    D.add(W.g.cyl(0.0075, 0.0075, 0.03, 8), BRASS, [0.27, 0.4, 0.08], [Math.PI / 2, 0.6, 0], 1, FB);
    const cp = D.at([0.45, 0.4, 0.15], [0, -0.5, 0]);
    cp.box(0.008, 0.004, 0.14, 0xb8c0c8, [-0.02, 0, 0], [0, 0.15, 0], [0, 0, 0, 12.0]);
    cp.box(0.008, 0.004, 0.14, 0xb8c0c8, [0.02, 0, 0], [0, -0.15, 0], [0, 0, 0, 12.0]);
    cp.add(W.g.cyl(0.01, 0.01, 0.02, 8), BRASS, [0, 0.005, -0.07], null, 1, FB);
    const mg = D.at([0.2, 0.41, -0.15], [0, 0.8, 0]);
    mg.add(W.g.torus(0.05, 0.008, 6, 20), BRASS, [0, 0, 0], [Math.PI / 2, 0, 0], 1, FB);
    mg.add(W.g.cyl(0.048, 0.048, 0.004, 20), 0xdff0f4, [0, 0, 0], null, 1, [0.2, 0, 0, 0]);
    mg.add(W.g.cyl(0.01, 0.012, 0.12, 8), 0x3a2a22, [0.1, 0, 0], [0, 0, Math.PI / 2], 1);
    // desk lamp
    const lp = D.at([-0.5, 0.39, -0.15]);
    lp.add(W.g.cyl(0.07, 0.08, 0.03, 14), BRASS, [0, 0.015, 0], null, 1, FB);
    lp.add(W.g.tube([new V3(0, 0.02, 0), new V3(0.02, 0.25, 0.0), new V3(0.08, 0.38, 0.06)], 0.008, 0.008, 6, 6), BRASS2, null, null, undefined, FB);
    lp.add(W.g.cone(0.09, 0.1, 16, true), 0x2a6a4a, [0.1, 0.38, 0.09], [0.6, 0, -0.3], 1, [0, 0, 0, 12.0]);
    lp.add(W.g.sph(1, 10), 0xfff2c0, [0.11, 0.35, 0.11], null, 0.03, GLOW(1.0));
    W.deskLamp = lp.worldPos([0.12, 0.3, 0.12]);
    // star chart & constellation hanging, moon phase chart, clock
    ctx.box(1.05, 1.05, 0.01, 0xffffff, [-8.75, FL + 1.75, -12.94], null, [0, 0, 0, 7.0], W.atlas.get('starchart'));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => ctx.add(W.g.sph(1, 6), 0xc83a2a, [-8.75 + a * 0.48, FL + 1.75 + b * 0.48, -12.93], null, 0.02));
    ctx.box(0.42, 0.82, 0.01, 0xffffff, [-6.08, FL + 1.65, -12.1], [0, Math.PI / 2, 0], [0, 0, 0, 7.0], W.atlas.get('constscroll'));
    ctx.add(W.g.cyl(0.015, 0.015, 0.5, 6), DARK, [-6.07, FL + 2.08, -12.1], [Math.PI / 2, 0, 0], 1);
    ctx.add(W.g.cyl(0.015, 0.015, 0.5, 6), DARK, [-6.07, FL + 1.23, -12.1], [Math.PI / 2, 0, 0], 1);
    ctx.box(0.95, 0.48, 0.01, 0xffffff, [-12.9, FL + 2.0, -12.94], null, [0, 0, 0, 7.0], W.atlas.get('moonphase'));
    // wall clock with pendulum
    const ck = ctx.at([-7.05, FL + 1.95, -12.9]);
    ck.box(0.42, 0.95, 0.14, 0x5a3424, [0, -0.2, 0.05], null, FWY);
    ck.add(W.g.cyl(0.19, 0.19, 0.02, 24), 0xffffff, [0, 0.08, 0.13], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 0], W.atlas.get('clock'));
    ck.add(W.g.torus(0.19, 0.015, 6, 24), BRASS, [0, 0.08, 0.135], null, 1, FB);
    ck.box(0.32, 0.4, 0.01, 0xd8eef2, [0, -0.42, 0.125], null, [0.1, 0, 0, 0]);
    ck.box(0.46, 0.05, 0.16, 0x4a2a1c, [0, 0.3, 0.05], null, FW);
    ck.box(0.46, 0.05, 0.16, 0x4a2a1c, [0, -0.67, 0.05], null, FW);
    W.pendulum = W.part('pendulum', ck.worldPos([0, -0.08, 0.09]));
    W.pendulum.ctx.add(W.g.cyl(0.004, 0.004, 0.34, 4), BRASS2, [0, -0.17, 0], null, 1, FB);
    W.pendulum.ctx.add(W.g.cyl(0.055, 0.055, 0.012, 18), BRASS, [0, -0.36, 0], [Math.PI / 2, 0, 0], 1, FB);
    // bookshelf + globe
    const bs = ctx.at([-11.1, FL, -12.75]);
    bs.box(1.8, 2.05, 0.04, 0x4a3022, [0, 1.025, -0.2], null, FW);
    bs.box(0.05, 2.05, 0.42, 0x5a3a28, [-0.88, 1.025, 0], null, FWY);
    bs.box(0.05, 2.05, 0.42, 0x5a3a28, [0.88, 1.025, 0], null, FWY);
    const bcols = [0x7a2a22, 0x2a4a6a, 0x3a5a3a, 0xa8823a, 0x5a3a5a, 0x2a2a3a, 0xc8b89a, 0x8a4a2a, 0x3a6a7a, 0x6a2a3a];
    for (let s = 0; s < 5; s++) {
      const y = 0.04 + s * 0.4;
      bs.box(1.72, 0.03, 0.4, 0x5a3a28, [0, y, 0], null, FW);
      let x = -0.83;
      while (x < 0.8) {
        const r = R();
        if (r < 0.08 && s > 0) { // scroll pile
          for (let k = 0; k < 3; k++) bs.add(W.g.cyl(0.03, 0.03, 0.34, 8), 0xe8dcc0, [x + 0.04, y + 0.045 + k * 0.05, 0], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 7.0]);
          x += 0.1; continue;
        }
        if (r < 0.15) { // lying stack (star atlases)
          for (let k = 0; k < 3; k++) bs.box(0.26, 0.04, 0.3, bcols[(s + k) % bcols.length], [x + 0.14, y + 0.035 + k * 0.042, 0], [0, R.range(-0.1, 0.1), 0], FW);
          x += 0.3; continue;
        }
        const bw = R.range(0.03, 0.065), bh = R.range(0.22, 0.34);
        const tilt = R() < 0.1 ? 0.25 : 0;
        bs.box(bw, bh, R.range(0.22, 0.3), W.jit(bcols[Math.floor(R() * bcols.length)], 0.3, R), [x + bw / 2, y + 0.015 + bh / 2, 0.02], [0, 0, tilt], FW);
        bs.box(bw + 0.002, 0.015, 0.02, BRASS, [x + bw / 2, y + bh * 0.8, 0.17], [0, 0, tilt], FB);
        x += bw + 0.004 + tilt * 0.1;
      }
    }
    bs.box(1.8, 0.04, 0.44, 0x5a3a28, [0, 2.05, 0], null, FW);
    // globe on top
    const gb = bs.at([0.35, 2.07, 0]);
    gb.add(W.g.cyl(0.09, 0.11, 0.04, 14), DARK, [0, 0.02, 0], null, 1, FW);
    gb.add(W.g.cyl(0.012, 0.012, 0.12, 6), BRASS2, [0, 0.1, 0], null, 1, FB);
    gb.add(W.g.sph(1, 24), 0xffffff, [0, 0.33, 0], [0, 0, 0.41], 0.18, [0, 0, 0, 0], W.atlas.get('globe'));
    gb.add(W.g.torus(0.2, 0.008, 5, 30, Math.PI), BRASS, [0, 0.33, 0], [0, Math.PI / 2, 0.41], 1, FB);
    // books stacked on floor near desk
    for (let k = 0; k < 4; k++) ctx.box(0.28, 0.05, 0.2, bcols[k + 2], [-7.45, FL + 0.085 + k * 0.05, -11.6], [0, R.range(-0.3, 0.3), 0], FW);
    // planet mobile
    const pm = W.part('planets', new V3(-8.0, TOP + 0.02, -11.0));
    pm.ctx.add(W.g.cyl(0.006, 0.006, 0.45, 4), 0xd8c8a0, [0, -0.22, 0], null, 1);
    pm.ctx.add(W.g.torus(0.6, 0.008, 5, 40), BRASS, [0, -0.45, 0], [Math.PI / 2, 0, 0], 1, FB);
    pm.ctx.box(1.2, 0.012, 0.012, BRASS2, [0, -0.45, 0], null, FB);
    pm.ctx.box(0.012, 0.012, 1.2, BRASS2, [0, -0.45, 0], null, FB);
    pm.ctx.add(W.g.sph(1, 16), 0xf2b030, [0, -0.62, 0], null, 0.13, GLOW(0.55));
    pm.ctx.add(W.g.cyl(0.003, 0.003, 0.17, 3), 0xd8c8a0, [0, -0.535, 0], null, 1);
    const pls = [[0.6, 0, 0.05, 0x8ab8e8, 0.35], [0, 0.6, 0.07, 0xd86a3a, 0.5], [-0.6, 0, 0.09, 0xe8c88a, 0.65], [0, -0.6, 0.06, 0x6a8ad8, 0.3], [0.42, 0.42, 0.04, 0xc8b8a8, 0.42]];
    pls.forEach((p) => {
      pm.ctx.add(W.g.cyl(0.003, 0.003, p[4], 3), 0xd8c8a0, [p[0], -0.45 - p[4] / 2, p[1]], null, 1);
      pm.ctx.add(W.g.sph(1, 14), p[3], [p[0], -0.45 - p[4] - p[2], p[1]], null, p[2]);
      if (p[3] === 0xe8c88a) pm.ctx.add(W.g.torus(p[2] * 1.7, p[2] * 0.25, 4, 24), 0xd8c08a, [p[0], -0.45 - p[4] - p[2], p[1]], [1.2, 0, 0.3], 1);
    });
    W.planetMobile = pm;
  }

  // ---------- furnishings: tokonoma, sideboard, fan, lanterns, andon, plants ----------
  function furnishings(B) {
    const ctx = new W.Ctx(B);
    const R = W.rng(231);
    // tokonoma scroll + ikebana
    ctx.box(0.5, 1.35, 0.01, 0xffffff, [-15.0, FL + 1.38, -13.6], null, [0, 0, 0, 7.0], W.atlas.get('scroll'));
    ctx.add(W.g.cyl(0.018, 0.018, 0.58, 6), DARK, [-15.0, FL + 2.06, -13.59], [0, 0, Math.PI / 2], 1);
    ctx.add(W.g.cyl(0.022, 0.022, 0.6, 6), DARK, [-15.0, FL + 0.7, -13.59], [0, 0, Math.PI / 2], 1);
    const ik = ctx.at([-14.75, FL + 0.24, -13.3]);
    ik.add(W.g.lathe([[0, 0], [0.12, 0], [0.13, 0.03], [0.07, 0.08], [0.05, 0.2], [0.065, 0.24], [0, 0.24]], 16, 'ikevase'), 0x2a3a4a, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
    const br = [new V3(0, 0.22, 0), new V3(-0.15, 0.6, 0.02), new V3(-0.35, 0.85, 0.05), new V3(-0.55, 0.9, 0.05)];
    ik.add(W.g.tube(br, 0.012, 0.005, 5, 8), 0x4a3020, null, null, undefined, [0, 0, 0, 17.0]);
    for (let i = 0; i < 12; i++) { const p = new THREE.CatmullRomCurve3(br).getPointAt(0.3 + i / 12 * 0.7); ik.add(W.g.leaf('maple'), W.jit(0xd8301c, 0.3, R), [p.x + R.range(-0.06, 0.06), p.y + R.range(-0.05, 0.05), p.z + R.range(-0.04, 0.04)], [R.range(-0.8, 0.8), R() * 6, R.range(-0.8, 0.8)], 0.07, [0, 0.03, 0, 8.0]); }
    W.flowerHead(new W.Ctx(B), ik.worldPos([0.06, 0.4, 0.02]), 'mum', 0xf6f0e0, 0.06, R, [0.3, 0, -0.3]);
    W.flowerHead(new W.Ctx(B), ik.worldPos([0.0, 0.34, 0.06]), 'mum', 0xf2c23a, 0.05, R, [0.5, 0, 0.1]);
    ik.add(W.g.tube([new V3(0, 0.2, 0), new V3(0.06, 0.4, 0.02)], 0.005, 0.004, 4, 2), 0x4a6a2a, null, null, undefined);
    // sideboard with makie
    const sb = ctx.at([-12.9, FL, -12.72]);
    sb.box(1.6, 0.72, 0.46, 0x1e1616, [0, 0.38, 0], null, [0, 0, 0, 12.0]);
    sb.box(1.5, 0.6, 0.01, 0xffffff, [0, 0.38, 0.235], null, [0, 0, 0, 0], W.atlas.get('makie'));
    sb.box(1.64, 0.03, 0.5, 0x2a1e1a, [0, 0.755, 0], null, [0, 0, 0, 12.0]);
    [-0.4, 0.4].forEach((x) => sb.add(W.g.torus(0.025, 0.005, 5, 10), BRASS, [x, 0.4, 0.245], null, 1, FB));
    [[-0.75, -0.2], [0.75, -0.2], [-0.75, 0.2], [0.75, 0.2]].forEach(([x, z]) => sb.box(0.06, 0.04, 0.06, BRASS2, [x, 0.02, z], null, FB));
    // on sideboard: lamp, camera, vases, radio
    const top = 0.77;
    const lamp = sb.at([-0.6, top, 0]);
    lamp.add(W.g.cyl(0.06, 0.08, 0.04, 12), BRASS, [0, 0.02, 0], null, 1, FB);
    lamp.add(W.g.cyl(0.015, 0.015, 0.3, 6), BRASS2, [0, 0.19, 0], null, 1, FB);
    lamp.add(W.g.cyl(0.08, 0.15, 0.18, 16, true), 0xf4e2b8, [0, 0.38, 0], null, 1, [0.45, 0, 0, 7.0]);
    W.sideLamp = lamp.worldPos([0, 0.36, 0]);
    const cam = sb.at([-0.25, top, 0.05], [0, 0.4, 0]);
    cam.box(0.16, 0.1, 0.08, 0x2a2a2a, [0, 0.05, 0], null, [0, 0, 0, 12.0]);
    cam.box(0.16, 0.03, 0.082, 0xb8b8b0, [0, 0.085, 0], null, [0, 0, 0, 12.0]);
    cam.add(W.g.cyl(0.035, 0.04, 0.06, 14), 0x1a1a1a, [0, 0.05, 0.06], [Math.PI / 2, 0, 0], 1, [0, 0, 0, 12.0]);
    cam.add(W.g.cyl(0.026, 0.026, 0.004, 14), 0x6a8aa8, [0, 0.05, 0.092], [Math.PI / 2, 0, 0], 1, [0.3, 0, 0, 0]);
    cam.box(0.03, 0.02, 0.02, 0xb8b8b0, [0.05, 0.11, 0], null, [0, 0, 0, 12.0]);
    [[0.05, 0x8a3a2a, 0.2], [0.18, 0x3a6a8a, 0.14], [0.28, 0xe8dcc8, 0.24]].forEach((v, i) => {
      sb.add(W.g.lathe([[0, 0], [0.05, 0], [0.06, 0.04], [0.035, v[2] * 0.7], [0.025, v[2] * 0.9], [0.035, v[2]], [0, v[2]]], 14, 'vase' + i), v[1], [v[0], top, -0.08], null, 1, [0, 0, 0, 6.0]);
    });
    W.flowerHead(new W.Ctx(B), sb.worldPos([0.28, top + 0.3, -0.08]), 'cosmos', 0xf28aa8, 0.05, R, [0.3, 0, 0.2]);
    W.flowerHead(new W.Ctx(B), sb.worldPos([0.26, top + 0.27, -0.06]), 'cosmos', 0xfff0f0, 0.045, R, [-0.3, 0, -0.1]);
    const rd = sb.at([0.58, top, 0.0], [0, -0.2, 0]);
    rd.add(W.g.soft(0.36, 0.24, 0.16, 0.05, 3), 0x6a4026, [0, 0.12, 0], null, 1, FW);
    rd.box(0.3, 0.17, 0.01, 0xffffff, [0, 0.12, 0.081], null, [0, 0, 0, 0], W.atlas.get('radio'));
    [-0.09, 0.09].forEach((x) => rd.add(W.g.cyl(0.02, 0.02, 0.02, 10), 0xd8c8a0, [x, 0.02, 0.085], [Math.PI / 2, 0, 0], 1));
    // ceiling fan
    const fan = W.part('fan', new V3(-13.4, TOP + 0.2, -9));
    fan.ctx.add(W.g.cyl(0.02, 0.02, 0.4, 6), DARK, [0, -0.2, 0], null, 1, FB);
    fan.ctx.add(W.g.cyl(0.1, 0.12, 0.14, 16), 0x5a3a28, [0, -0.45, 0], null, 1, FW);
    fan.ctx.add(W.g.cyl(0.06, 0.04, 0.05, 12), BRASS, [0, -0.54, 0], null, 1, FB);
    W.fanRotor = W.part('fanRotor', new V3(0, -0.5, 0), { parent: fan });
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2;
      W.fanRotor.ctx.add(W.g.soft(0.62, 0.012, 0.15, 0.006, 2), 0x7a5234, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], [0, -a, 0.12], 1, FW);
      W.fanRotor.ctx.box(0.15, 0.015, 0.03, BRASS2, [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], [0, -a, 0], FB);
    }
    // paper lanterns
    W.lanternPos = [];
    [[-14.9, -9.0], [-8.9, -9.0]].forEach((p, i) => {
      const L = W.part('lantern' + i, new V3(p[0], TOP + 0.16, p[1]));
      L.ctx.add(W.g.cyl(0.004, 0.004, 0.55, 4), 0x2a2a2a, [0, -0.28, 0], null, 1);
      L.ctx.add(W.g.cyl(0.08, 0.08, 0.04, 14), 0x2a2220, [0, -0.57, 0], null, 1);
      const prof = []; for (let k = 0; k <= 10; k++) { const t = k / 10; prof.push([0.08 + Math.sin(t * Math.PI) * 0.14, -t * 0.5]); }
      L.ctx.add(W.g.lathe(prof, 20, 'chochin'), 0xfff0d0, [0, -0.59, 0], null, 1, [0.42, 0, 0, 7.0], null, (lx, ly) => C(Math.abs(Math.sin(ly * 60)) > 0.92 ? 0xb89868 : 0xfff0d0));
      L.ctx.add(W.g.cyl(0.08, 0.08, 0.04, 14), 0x2a2220, [0, -1.1, 0], null, 1);
      L.swing = 0.04; L.phase = i * 2.1;
      W.hangers.push(L);
      W.lanternPos.push(new V3(p[0], TOP + 0.2 - 0.85, p[1]));
    });
    // andon
    const an = ctx.at([-15.45, FL, -12.35]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => an.box(0.025, 0.82, 0.025, DARK, [a * 0.15, 0.41, b * 0.15], null, FWY));
    an.box(0.32, 0.5, 0.32, 0xfff0d0, [0, 0.5, 0], null, [0.45, 0, 0, 7.0]);
    for (let k = 0; k < 4; k++) an.box(0.33, 0.012, 0.33, DARK, [0, 0.26 + k * 0.16, 0], null, FW);
    an.box(0.36, 0.03, 0.36, DARK, [0, 0.82, 0], null, FW);
    W.andonPos = an.worldPos([0, 0.5, 0]);
    // plants by round window & maple branch in vase
    const pot = (x, z, h, col, leafCol, kind) => {
      const p = ctx.at([x, FL, z]);
      p.add(W.g.lathe([[0, 0], [0.12, 0], [0.16, 0.2], [0.17, 0.24], [0, 0.24]], 16, 'pot1'), col, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
      p.add(W.g.cyl(0.15, 0.15, 0.01, 14), 0x4a3022, [0, 0.22, 0], null, 1);
      for (let i = 0; i < 16; i++) {
        const a = R() * 6.28; const r = R.range(0.02, 0.2);
        const top = new V3(Math.cos(a) * r, 0.24 + h * R.range(0.5, 1), Math.sin(a) * r);
        p.add(W.g.tube([new V3(0, 0.22, 0), top], 0.006, 0.004, 3, 2), 0x4a6a2a, null, null, undefined, [0, 0.02, 0, 0]);
        p.add(W.g.leaf(kind || 'round'), W.jit(leafCol, 0.25, R), [top.x, top.y, top.z], [R.range(-0.8, 0.8), a, 0], 0.1, [0, 0.03, 0, 8.0]);
      }
    };
    pot(-6.45, -10.75, 0.45, 0xb8643a, 0x3a7a3a);
    pot(-6.5, -11.4, 0.3, 0x8aa0b0, 0x5a8a3a, 'narrow');
    pot(-6.45, -8.7, 0.55, 0xe8e0d0, 0x2f6a35);
    const mv = ctx.at([-6.5, FL, -9.25]);
    mv.add(W.g.lathe([[0, 0], [0.08, 0], [0.12, 0.12], [0.07, 0.3], [0.05, 0.36], [0.06, 0.4], [0, 0.4]], 16, 'mvase'), 0x5a6a7a, [0, 0, 0], null, 1, [0, 0, 0, 6.0]);
    const mbr = [new V3(0, 0.38, 0), new V3(-0.1, 0.8, 0.05), new V3(-0.2, 1.15, -0.05), new V3(-0.15, 1.4, 0.1)];
    mv.add(W.g.tube(mbr, 0.012, 0.004, 5, 10), 0x4a3020, null, null, undefined, [0, 0, 0, 17.0]);
    const mbc = new THREE.CatmullRomCurve3(mbr);
    for (let i = 0; i < 26; i++) { const p = mbc.getPointAt(0.25 + i / 26 * 0.75); mv.add(W.g.leaf('maple'), W.jit(0xd8281c, 0.3, R), [p.x + R.range(-0.12, 0.12), p.y + R.range(-0.08, 0.08), p.z + R.range(-0.1, 0.1)], [R.range(-1, 1), R() * 6, R.range(-1, 1)], 0.075, [0, 0.03, 0, 8.0]); }
  }

  W.interior = {
    build: function () {
      const B = W.bucket('interior');
      orrery();
      paintingCorner(B);
      teaArea(B);
      readingCorner(B);
      furnishings(B);
    },
  };
})();
