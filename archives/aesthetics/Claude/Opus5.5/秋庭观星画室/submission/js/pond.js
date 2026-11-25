/* the fruit-tart pond */
(function () {
  'use strict';
  const W = window.W, V3 = THREE.Vector3, C = W.C, L = W.L;
  const P = L.POND;
  const CX = P.x, CZ = P.z;
  const RO = P.r, RI = P.r - 0.42, RIM = 0.42, WY = -0.08, IB = -0.85, CB = -1.12, FRONT = 16;
  W.WATER_Y = WY;
  const TH1 = 15 * Math.PI / 180, TH2 = 40 * Math.PI / 180, THM = (TH1 + TH2) / 2;
  const PULL = 0.7, LIFT = 0.32;
  const NOTCH_R = RO + PULL + 0.25;
  W.pondInfo = { CX, CZ, RO, RI, RIM, WY, IB, CB, TH1, TH2, PULL, LIFT };
  const CRUST = 0xdca04e, CRUST_D = 0xb87a34, CRUST_IN = 0xf0d49a;
  const FW = [0, 0, 0, 1.0];

  W.inNotch = function (x, z) {
    const dx = x - CX, dz = z - CZ; const r = Math.hypot(dx, dz);
    if (r > NOTCH_R + 0.1 || r < RO - 0.4) return false;
    const a = Math.atan2(dz, dx);
    return a > TH1 - 0.07 && a < TH2 + 0.07;
  };
  W.pondAvoid = function (a) { return a > TH1 - 0.22 && a < TH2 + 0.22; };

  // radius profile of crust (r,y) loop: outer → rim → inner → bottom
  function outerR(th, y) { const fl = Math.pow(Math.abs(Math.cos(th * 26)), 0.6) * 0.1; return RO - 0.05 + fl * W.smooth(CB, 0.0, y); }
  function clampFront(r, th) {
    // keep z <= FRONT: if beyond, slide angle to the boundary
    const z = CZ + r * Math.sin(th);
    if (z <= FRONT || r <= FRONT - CZ) return th;
    const sb = (FRONT - CZ) / r;
    const a1 = Math.asin(sb), a2 = Math.PI - a1;
    // th is between a1 and a2 (front zone); choose nearest boundary
    let t = ((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.abs(t - a1) < Math.abs(t - a2) ? a1 : a2;
  }

  // build revolved crust between angles thA..thB (thB > thA), optional transform
  function crustRevolve(B, thA, thB, nAng, xf, clamp) {
    const prof = [];
    // outer wall from bottom to top
    for (let i = 0; i <= 10; i++) { const y = W.lerp(CB, RIM - 0.1, i / 10); prof.push(['o', y]); }
    // rim rounded
    for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI; prof.push(['rim', a]); }
    // inner wall down
    for (let i = 0; i <= 8; i++) { const y = W.lerp(RIM - 0.12, IB, i / 8); prof.push(['i', y]); }
    // inner bottom to center
    for (let i = 1; i <= 4; i++) prof.push(['b', 1 - i / 4]);
    // underside from center to outer
    const pos = [], col = [], idx = [], fxA = [], outside = [];
    const nP = prof.length + 3;
    for (let j = 0; j <= nAng; j++) {
      const th0 = W.lerp(thA, thB, j / nAng);
      const ptsRow = [];
      prof.forEach((p) => {
        let r, y;
        if (p[0] === 'o') { r = outerR(th0, p[1]); y = p[1]; }
        else if (p[0] === 'rim') { const ro = outerR(th0, RIM - 0.1), ri = RI; const mid = (ro + ri) / 2, half = (ro - ri) / 2; r = mid + Math.cos(p[1]) * half; y = RIM - 0.1 + Math.sin(p[1]) * 0.12 + Math.sin(th0 * 26) * 0.0; }
        else if (p[0] === 'i') { r = RI - (RIM - 0.12 - p[1]) * 0.04; y = p[1]; }
        else { r = (RI - 0.05) * p[1]; y = IB; }
        ptsRow.push([r, y, p[0]]);
      });
      // underside
      ptsRow.push([0.0, CB, 'u']); ptsRow.push([(RO - 0.05) * 0.5, CB, 'u']); ptsRow.push([RO - 0.05, CB, 'u']);
      ptsRow.forEach((q) => {
        let th = th0;
        outside.push(clamp && CZ + q[0] * Math.sin(th0) > FRONT + 1e-4 ? 1 : 0);
        if (clamp) th = clampFront(q[0], th0);
        const v = new V3(CX + q[0] * Math.cos(th), q[1], CZ + q[0] * Math.sin(th));
        if (xf) v.applyMatrix4(xf);
        pos.push(v.x, v.y, v.z);
        // color: baked darker on top & outer ridge, lighter on inner wall
        let c;
        if (q[2] === 'rim') c = C(CRUST_D).clone().lerp(C(CRUST), 0.35 + 0.3 * W.noise2(th * 20, q[1] * 9));
        else if (q[2] === 'o') c = C(CRUST).clone().lerp(C(CRUST_D), 0.3 * W.noise2(th * 30, q[1] * 6) + Math.pow(Math.abs(Math.cos(th0 * 26)), 4) * 0.25);
        else if (q[2] === 'i') c = C(CRUST_IN).clone().lerp(C(CRUST), 0.35);
        else c = C(CRUST_IN).clone().lerp(C(CRUST), 0.2);
        col.push(c.r, c.g, c.b);
        fxA.push(0, 0, q[2] === 'i' || q[2] === 'b' ? 1 : 0.0, 5);
      });
    }
    const nR = prof.length + 3;
    const tri = (a, b, c) => { if (outside[a] && outside[b] && outside[c]) return; idx.push(a, b, c); };
    for (let j = 0; j < nAng; j++) for (let i = 0; i < nR - 1; i++) {
      const a = j * nR + i, b = a + 1, c = a + nR, d = c + 1;
      tri(a, c, b); tri(b, c, d);
    }
    // close loop underside→outer bottom
    for (let j = 0; j < nAng; j++) { const a = j * nR + (nR - 1), b = j * nR, c = a + nR, d = b + nR; tri(a, c, b); tri(b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // add via bucket with per-vertex color & fx
    const colors = col; let k = 0;
    const fxs = fxA;
    let vi = 0;
    B.add(g, new THREE.Matrix4(), 0xffffff, (lx, ly, lz) => { const o = (vi - 1) * 4; return [fxs[o], fxs[o + 1], fxs[o + 2], fxs[o + 3]]; }, null, (lx, ly, lz) => { const o = vi * 3; vi++; return new THREE.Color(colors[o], colors[o + 1], colors[o + 2]); });
  }

  // radial section face (crust + water) at angle th, facing direction sign
  function radialSection(B, th, xf, waterList) {
    const ctx = new W.Ctx(B);
    const dir = new V3(Math.cos(th), 0, Math.sin(th));
    const quad = (r0, r1, y0, y1, color, fx) => {
      const pts = [[r0, y0], [r1, y0], [r1, y1], [r0, y1]].map((q) => { const v = new V3(CX + dir.x * q[0], q[1], CZ + dir.z * q[0]); if (xf) v.applyMatrix4(xf); return v; });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(...pts.map((v) => [v.x, v.y, v.z])), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      return g;
    };
    const crustFace = (r0, r1, y0, y1) => {
      const g = quad(r0, r1, y0, y1);
      ctx.add(g, CRUST_IN, null, null, undefined, [0, 0, 0, 5.0], null, (lx, ly, lz) => {
        const edge = Math.min(Math.abs(ly - CB), Math.abs(ly - RIM)) < 0.05;
        return C(edge ? CRUST_D : CRUST_IN).clone().multiplyScalar(0.92 + 0.12 * W.noise2(lx * 13 + lz * 7, ly * 15));
      });
    };
    crustFace(0, RO - 0.05, CB, IB);
    crustFace(RI, RO - 0.05, IB, RIM - 0.1);
    // water face
    waterList.push(quad(0, RI, IB, WY));
  }

  function waterTop(thA, thB, nAng, xf, clamp) {
    const pos = [], idx = [];
    const rings = 14;
    for (let j = 0; j <= nAng; j++) {
      const th0 = W.lerp(thA, thB, j / nAng);
      for (let i = 0; i <= rings; i++) {
        const r = RI * i / rings;
        const th = clamp ? clampFront(r, th0) : th0;
        const v = new V3(CX + r * Math.cos(th), WY, CZ + r * Math.sin(th));
        if (xf) v.applyMatrix4(xf);
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let j = 0; j < nAng; j++) for (let i = 0; i < rings; i++) { const a = j * (rings + 1) + i, b = a + 1, c = a + rings + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function quadXY(x0, x1, y0, y1, z) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    return g;
  }

  function mergeGeos(list) {
    const pos = [], idx = []; let off = 0;
    list.forEach((g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off); off += p.count; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  function build() {
    const B = W.bucket('pond');
    const ctx = new W.Ctx(B);
    const R = W.rng(1001);
    // main crust: from TH2 around to TH1 + 2π
    crustRevolve(B, TH2, TH1 + Math.PI * 2, 300, null, true);
    // wedge transform
    const wx = new THREE.Matrix4().makeTranslation(Math.cos(THM) * PULL, LIFT, Math.sin(THM) * PULL);
    W.wedgeXf = wx;
    crustRevolve(B, TH1, TH2, 30, wx, false);
    // radial sections
    const wsec = [];
    radialSection(B, TH1, null, wsec);
    radialSection(B, TH2, null, wsec);
    radialSection(B, TH1, wx, wsec);
    radialSection(B, TH2, wx, wsec);
    // front section at z=16
    const dz = FRONT - CZ;
    const hw = (r) => Math.sqrt(Math.max(0, r * r - dz * dz));
    const fsec = [];
    const crustFront = (x0, x1, y0, y1) => ctx.add(quadXY(x0, x1, y0, y1, FRONT + 0.002), CRUST_IN, null, null, undefined, [0, 0, 0, 5.0], null, (lx, ly) => {
      const edge = Math.abs(ly - CB) < 0.05 || Math.abs(ly - (RIM - 0.08)) < 0.06;
      return C(edge ? CRUST_D : CRUST_IN).clone().multiplyScalar(0.92 + 0.12 * W.noise2(lx * 13, ly * 15));
    });
    crustFront(CX - hw(RO - 0.05), CX + hw(RO - 0.05), CB, IB);
    crustFront(CX - hw(RO - 0.05), CX - hw(RI), IB, RIM - 0.08);
    crustFront(CX + hw(RI), CX + hw(RO - 0.05), IB, RIM - 0.08);
    fsec.push(quadXY(CX - hw(RI), CX + hw(RI), IB, WY, FRONT + 0.004));
    W.pondFront = { x0: CX - hw(RI), x1: CX + hw(RI) };
    // water meshes
    const topMain = waterTop(TH2, TH1 + Math.PI * 2, 300, null, true);
    const topWedge = waterTop(TH1, TH2, 24, wx, false);
    const topMat = W.makePondMat(0);
    const topMesh = new THREE.Mesh(mergeGeos([topMain, topWedge]), topMat);
    topMesh.layers.set(W.LAYER.WATER); topMesh.renderOrder = 1;
    W.scene.add(topMesh);
    W.pondTop = topMesh;
    const secMat = W.makePondMat(1); secMat.side = THREE.DoubleSide;
    const secMesh = new THREE.Mesh(mergeGeos(fsec.concat(wsec)), secMat);
    secMesh.layers.set(W.LAYER.WATER); secMesh.renderOrder = 0;
    W.scene.add(secMesh);
    W.waterUniforms.uPondC.value.set(CX, WY, CZ);
    // crumbs on bank
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2; if (W.pondAvoid(a)) continue;
      const r = RO + R.range(0.05, 0.9);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (z > 15.9) continue;
      ctx.add(W.g.ico(1, 0), W.jit(CRUST, 0.4, R), [x, W.H(x, z) + 0.02, z], [R(), R(), R()], R.range(0.03, 0.07), [0, 0, 0, 5.0]);
    }
    // notch pit (soil walls & floor)
    const soil = 0x7b5533;
    const pitAng0 = TH1 - 0.07, pitAng1 = TH2 + 0.07;
    const pit = (a, r0, r1) => { const pts = []; return pts; };
    const pitWall = (p0, p1) => {
      const y0a = W.H(p0.x, p0.z), y1a = W.H(p1.x, p1.z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, CB, p0.z, p1.x, CB, p1.z, p1.x, y1a, p1.z, p0.x, y0a, p0.z], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      ctx.add(g, soil, null, null, undefined, [0, 0, 0, 13.0], null, (lx, ly) => C(ly > -0.15 ? 0x4a3424 : soil).clone().multiplyScalar(0.9 + 0.15 * W.noise2(lx * 5, ly * 8)));
    };
    const pp = (a, r) => new V3(CX + Math.cos(a) * r, 0, CZ + Math.sin(a) * r);
    pitWall(pp(pitAng0, RO - 0.3), pp(pitAng0, NOTCH_R));
    pitWall(pp(pitAng1, NOTCH_R), pp(pitAng1, RO - 0.3));
    for (let k = 0; k < 8; k++) { const a0 = W.lerp(pitAng0, pitAng1, k / 8), a1 = W.lerp(pitAng0, pitAng1, (k + 1) / 8); pitWall(pp(a0, NOTCH_R), pp(a1, NOTCH_R)); }
    // pit floor
    {
      const sh = new THREE.Shape();
      const f0 = pp(pitAng0, RO - 0.3); sh.moveTo(f0.x, f0.z);
      for (let k = 0; k <= 8; k++) { const q = pp(W.lerp(pitAng0, pitAng1, k / 8), NOTCH_R); sh.lineTo(q.x, q.z); }
      const f1 = pp(pitAng1, RO - 0.3); sh.lineTo(f1.x, f1.z);
      const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);
      ctx.add(g, 0x5a3e28, [0, CB + 0.01, 0], null, 1, [0, 0, 0, 13.0]);
    }
    // cake server: blade under wedge, handle resting on the bank
    {
      const bisect = new V3(Math.cos(THM), 0, Math.sin(THM));
      const tip = new V3(CX, CB + LIFT - 0.02, CZ).addScaledVector(bisect, PULL + 1.6);
      const heel = new V3(CX, CB + LIFT - 0.02, CZ).addScaledVector(bisect, PULL + RO + 0.05);
      const ry = Math.atan2(bisect.x, bisect.z);
      const sv = new W.Ctx(B);
      const bladeLen = heel.distanceTo(tip);
      const shp = new THREE.Shape(); shp.moveTo(-0.42, 0); shp.lineTo(0.42, 0); shp.lineTo(0.62, bladeLen * 0.85); shp.quadraticCurveTo(0, bladeLen * 1.08, -0.62, bladeLen * 0.85); shp.closePath();
      const bg = W.g.extrude(shp, 0.03, 0, 'server', 16); bg.rotateX(-Math.PI / 2);
      sv.add(bg, 0xd8dde2, [heel.x, heel.y, heel.z], [0, ry + Math.PI, 0], 1, [0, 0, 0, 12.0]);
      // neck rising out of pit then a flat ornate handle resting on the bank
      const bank = new V3(CX, 0, CZ).addScaledVector(bisect, NOTCH_R + 1.35);
      bank.y = W.H(bank.x, bank.z) + 0.07;
      const neck1 = new V3(CX, 0.3, CZ).addScaledVector(bisect, NOTCH_R + 0.12);
      const bar = (a, b, w, th, col, fx) => {
        const len = a.distanceTo(b);
        const m = new THREE.Matrix4().lookAt(a, b, new V3(0, 1, 0));
        m.setPosition(a.clone().lerp(b, 0.5));
        sv.addM(W.g.soft(w, th, len, Math.min(w, th) * 0.45, 2), col, m.multiply(new THREE.Matrix4().makeScale(1, 1, 1)), fx || [0, 0, 0, 12.0]);
      };
      const lip = heel.clone().addScaledVector(bisect, 0.18).add(new V3(0, 0.02, 0));
      bar(heel.clone().addScaledVector(bisect, -0.6), lip, 0.5, 0.03, 0xdfe4e8);
      const bend = lip.clone().addScaledVector(bisect, 0.12).add(new V3(0, 0.25, 0));
      bar(lip, bend, 0.16, 0.035, 0xd6dce2);
      bar(bend, neck1, 0.14, 0.035, 0xd6dce2);
      bar(neck1, bank, 0.26, 0.06, 0xe9edf0);
      bar(neck1.clone().lerp(bank, 0.18), neck1.clone().lerp(bank, 0.82), 0.12, 0.068, 0xc8a050, [0, 0, 0, 9.0]);
      const endM = new THREE.Matrix4().lookAt(neck1, bank, new V3(0, 1, 0)); endM.setPosition(bank);
      sv.addM(W.g.cyl(0.2, 0.2, 0.065, 24), 0xe9edf0, endM.clone().multiply(new THREE.Matrix4().makeScale(1, 1, 1.35)), [0, 0, 0, 12.0]);
      sv.addM(W.g.torus(0.13, 0.02, 6, 20), 0xc8a050, endM.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.035, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), [0, 0, 0, 9.0]);
      W.server = { heel, bank, neck1 };
    }
    // fruit
    fruits(B, R);
    // bank decor: rocks, moss
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2; if (W.pondAvoid(a) || (a > 0.9 && a < 2.2)) continue;
      const r = RO + R.range(0.2, 1.2);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      if (z > 15.7) continue;
      const big = R() < 0.3;
      ctx.add(W.g.blob(1, 1, 0.22, 1100 + i), W.jit(big ? 0x8a857a : 0x5d7d2a, 0.4, R), [x, W.H(x, z) + (big ? 0.1 : 0.02), z], [0, R() * 6, 0], big ? [0.32, 0.25, 0.28] : [0.3, 0.08, 0.25], big ? [0, 0, 0, 3.0] : [0, 0, 0, 4.0]);
    }
    // folding stool with open sketchbook and pencils
    const st = ctx.at([6.75, W.H(6.75, 12.7), 12.7], [0, -0.9, 0]);
    [-1, 1].forEach((s) => { st.box(0.03, 0.55, 0.03, 0x6a5a4a, [s * 0.15, 0.27, 0], [s * 0.0, 0, 0.45], FW); st.box(0.03, 0.55, 0.03, 0x6a5a4a, [s * 0.15, 0.27, 0], [0, 0, -0.45], FW); });
    st.box(0.42, 0.03, 0.32, 0x2f5a6e, [0, 0.52, 0], null, [0, 0, 0, 0]);
    st.box(0.34, 0.012, 0.24, 0xffffff, [0, 0.545, 0], [0, 0.2, 0], [0, 0, 0, 7.0], W.atlas.get('sketchbook'));
    for (let i = 0; i < 3; i++) st.add(W.g.cyl(0.006, 0.006, 0.17, 6), [0x2a5a3a, 0xd8a040, 0x8a3a2a][i], [0.12, 0.56, -0.08 + i * 0.04], [Math.PI / 2, 0.4, 0], 1);
    W.stool = st.worldPos([0, 0.6, 0]);
  }

  function fruits(B, R) {
    const ctx = new W.Ctx(B);
    W.limes = [];
    const lime = (x, z, r, y, tilt, drift) => {
      const c = ctx.at([x, y, z], [tilt ? tilt[0] : 0, R() * 6, tilt ? tilt[1] : 0]);
      const fx = [0, drift === undefined ? 0.12 : drift, 0, 0];
      c.add(W.g.cyl(1, 1, 0.08, 36, true), 0x4f8a1e, [0, 0, 0], null, [r, 1, r], fx);
      c.add(W.g.circle(1, 36), 0xffffff, [0, 0.04, 0], [-Math.PI / 2, 0, 0], [r, r, 1], fx, W.atlas.get('lime'));
      c.add(W.g.circle(1, 36), 0xffffff, [0, -0.04, 0], [Math.PI / 2, 0, 0], [r, r, 1], fx, W.atlas.get('lime'));
      return c;
    };
    // floating limes (lily pads)
    const K = RO / 4.75, M = (q) => { q[0] = (q[0] + 1) * K + CX; q[1] = (q[1] - 12) * K + CZ; return q; };
    const fl = [[-2.6, 10.0, 0.75], [0.6, 13.6, 0.65], [-3.2, 13.8, 0.5], [1.9, 10.6, 0.45], [-1.5, 15.0, 0.42], [0.2, 9.0, 0.55], [-4.1, 11.9, 0.38], [2.6, 13.4, 0.36], [-1.0, 11.4, 0.4]];
    fl.forEach(M);
    fl.forEach((f) => { if (W.pondAvoid(Math.atan2(f[1] - CZ, f[0] - CX))) return; lime(f[0], f[1], f[2], WY + 0.015, null); W.limes.push(new V3(f[0], WY + 0.06, f[1])); });
    // stepping limes row across the pond (left bank → right bank)
    W.limeSteps = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const x = W.lerp(CX - 4.25, CX + 4.3, t), z = CZ - 2.05 + Math.sin(t * Math.PI) * 0.55 + (t - 0.5) * 0.1;
      lime(x, z, 0.55, WY + 0.04, null, 0);
      ctx.add(W.g.cyl(0.5, 0.5, 0.2, 18), 0x4a7a2a, [x, WY - 0.1, z], null, 1);
      W.limeSteps.push(new V3(x, WY + 0.1, z));
    }
    // star fruit slices
    const star = W.g.extrude(W.g.star(1, 0.45, 5), 0.06, 0, 'starfruit');
    const sreg = W.atlas.get('starfruit');
    const uvA = star.attributes.uv; const SP = star.attributes.position;
    for (let q = 0; q < uvA.count; q++) uvA.setXY(q, (SP.getX(q) + 1) / 2, (SP.getY(q) + 1) / 2);
    const sf = [[-1.8, 12.6, 0.32, WY + 0.02], [1.1, 11.8, 0.28, WY + 0.02], [-3.0, 9.6, 0.3, WY - 0.3], [-0.5, 14.6, 0.3, WY - 0.45], [0.3, 15.4, 0.26, WY - 0.2], [-2.2, 15.3, 0.28, WY - 0.6], [2.2, 12.6, 0.25, WY - 0.12], [-3.6, 12.9, 0.27, WY + 0.02]];
    sf.forEach(M);
    sf.forEach((s) => !W.pondAvoid(Math.atan2(s[1] - CZ, s[0] - CX)) && ctx.add(star, 0xffffff, [s[0], s[3], s[1]], [Math.PI / 2 + R.range(-0.2, 0.2), 0, R() * 6], s[2], [0, s[3] > WY - 0.05 ? 0.14 : 0.04, 0, 0], sreg));
    // submerged limes (visible in section)
    [[-0.3, 15.5, 0.4, WY - 0.35], [1.0, 15.2, 0.35, WY - 0.6], [-1.8, 14.6, 0.32, WY - 0.25]].map(M).forEach((s) => lime(s[0], s[1], s[2], s[3], [0.5, 0.3]));
    // blueberries: floating & sunk
    const bb = (x, y, z) => { ctx.add(W.g.sph(1, 10), W.jit(0x2a3a7a, 0.15, R), [x, y, z], null, 0.075); ctx.add(W.g.starG(0.03, 0.012, 5), 0x1a1a3a, [x, y + 0.074, z], [-Math.PI / 2, 0, 0], 1); };
    for (let i = 0; i < 30; i++) {
      const a = R() * Math.PI * 2; if (W.pondAvoid(a)) continue;
      const r = Math.sqrt(R()) * (RI - 0.3);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (z > 15.85) continue;
      const mode = R();
      const y = mode < 0.45 ? WY + 0.02 : mode < 0.75 ? IB + 0.07 : W.lerp(IB + 0.1, WY - 0.1, R());
      bb(x, y, z);
    }
    // blueberries lined in section
    for (let i = 0; i < 7; i++) bb(CX + W.lerp(-1.6, 1.6, i / 6) + R.range(-0.1, 0.1), W.lerp(IB + 0.08, WY - 0.12, R()), 15.6 + R.range(-0.2, 0.2));
    // mint leaves
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2; if (W.pondAvoid(a)) continue;
      const r = Math.sqrt(R()) * (RI - 0.4);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (z > 15.8) continue;
      const y = R() < 0.7 ? WY + 0.02 : WY - R.range(0.1, 0.5);
      for (let k = 0; k < 3; k++) ctx.add(W.g.leaf('round'), W.jit(0x3aa04a, 0.2, R), [x + R.range(-0.06, 0.06), y, z + R.range(-0.06, 0.06)], [R.range(-0.2, 0.2), k * 2.1 + R(), 0], 0.18, [0, y > WY ? 0.14 : 0.03, 0, 8.0]);
    }
    // wedge top fruit
    const wedgeC = new V3(CX, 0, CZ).addScaledVector(new V3(Math.cos(THM), 0, Math.sin(THM)), PULL + 2.6);
    lime(wedgeC.x, wedgeC.z, 0.42, WY + LIFT + 0.015, null);
    ctx.add(star, 0xffffff, [wedgeC.x - 0.5, WY + LIFT + 0.02, wedgeC.z + 0.6], [Math.PI / 2, 0, 0.4], 0.26, [0, 0, 0, 0], sreg);
    bb(wedgeC.x + 0.6, WY + LIFT + 0.03, wedgeC.z - 0.4);
    bb(wedgeC.x + 0.2, WY + LIFT - 0.3, wedgeC.z + 0.2);
    // floating fallen leaves (static)
    for (let i = 0; i < 18; i++) {
      const a = R() * Math.PI * 2; if (W.pondAvoid(a)) continue;
      const r = Math.sqrt(R()) * (RI - 0.25);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (z > 15.85) continue;
      const gink = R() < 0.45;
      ctx.add(W.g.leaf(gink ? 'ginkgo' : 'maple'), W.jit(gink ? 0xf0b820 : 0xd02c1c, 0.3, R), [x, WY + 0.012, z], [0, R() * 6, 0], R.range(0.13, 0.17), [0, 0.18, 0, 8.0]);
    }
  }

  W.pond = { build };
})();
