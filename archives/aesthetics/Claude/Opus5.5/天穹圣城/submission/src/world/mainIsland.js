import * as THREE from 'three';
import { Batch, mat, mul, matSeg, matFrame, invertGeo } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG, perlin3, smoothstep } from '../core/noise.js';
import { makeRock, makeCap } from './rock.js';
import { MAIN, CLK, P, angDist, outRot, dirOf } from './layout.js';
import { addStatue, addPedestal } from './statues.js';
import { vineStrip, shrub } from './vegetation.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// crystal: hex prism + pyramid tip from base B along dir d
export function addCrystal(b, B, d, L, r, rng, key = 'crystal') {
  d = d.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
  const twist = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rng.next() * 6.28);
  q.multiply(twist);
  const prism = new THREE.CylinderGeometry(r * 0.92, r, L * 0.78, 6, 1, false); prism.translate(0, L * 0.39, 0);
  const tip = new THREE.ConeGeometry(r * 0.92, L * 0.24, 6, 1, false); tip.translate(0, L * 0.78 + L * 0.12, 0);
  const m = new THREE.Matrix4().compose(B, q, V3(1, 1, 1));
  const ph = rng.next();
  const aux = (x, y, z) => { const t = new THREE.Vector3(x, y, z).sub(B).dot(d) / L; return [Math.max(0, Math.min(1, t)), ph]; };
  const c = new THREE.Color().setHSL(0.53 + rng.next() * 0.04, 0.6, 0.78 + rng.next() * 0.1);
  b.add(key, prism, m, c, { aux }); b.add(key, tip, m, c, { aux });
}

export function buildMainIsland(ctx) {
  const { scene, M, collider } = ctx;
  const b = new Batch('mainRock');
  const rng = new RNG(101);
  const FRONT = Math.PI;

  const cliffR = (y) => 182 - 0.2 * Math.abs(y);
  const shape = (th, y, r) => {
    const d = angDist(th, FRONT);
    const f = Math.exp(-Math.pow(d / 0.5, 2));
    if (f < 0.004) return r;
    const yy = -y;
    const v = smoothstep(3, 14, yy) * (1 - smoothstep(124, 152, yy));
    return r + Math.max(0, cliffR(y) - r) * f * v;
  };
  const rockOpts = { R0: MAIN.rimR, depth: MAIN.depth, seed: 3, p: 1.32, q: 0.9, lobes: 0.09, strata: 0.085, layerH: 11, cracks: 0.13, facets: 0.05, facetScale: 13, mossDepth: 0.42, shape };
  const pre = makeRock({ ...rockOpts, seg: 8, rings: 3 });
  const rFace = (th, y) => pre.radiusAt(th, y);

  // ---------- local frames for carved features ----------
  // guardian niche on the front cliff (tilted to follow the cliff lean)
  const NI = { w: 34, spring: 62, floorY: -118 };
  const nO = V3(0, NI.floorY, cliffR(NI.floorY));
  const nY = V3(0, 1, 0.2).normalize(), nZ = V3(0, -0.2, 1).normalize(), nX = V3(1, 0, 0);
  const nFrame = matFrame(nO, nX, nY, nZ);
  const toNiche = (p) => { const d = p.clone().sub(nO); return [d.dot(nX), d.dot(nY), d.dot(nZ)]; };
  // ancient arch gate
  const AR = { th: 3.50, floorY: -66, w: 15, spring: 14, depth: 42 };
  const arR = rFace(AR.th, AR.floorY + 8) - 0.5;
  const aO = P(arR, AR.th, AR.floorY);
  const aZ = dirOf(AR.th), aY = V3(0, 1, 0), aX = new THREE.Vector3().crossVectors(aY, aZ).normalize();
  const aFrame = matFrame(aO, aX, aY, aZ);
  const toArch = (p) => { const d = p.clone().sub(aO); return [d.dot(aX), d.dot(aY), d.dot(aZ)]; };
  const inArchShape = (lx, ly, hw, spring) => ly > -1 && Math.abs(lx) < hw && (ly < spring || lx * lx + (ly - spring) * (ly - spring) < hw * hw);

  const cut = (th, y) => {
    const r = rFace(th, y); const p = P(r, th, y);
    const [nx, ny, nz] = toNiche(p);
    if (nz > -30 && nz < 12 && inArchShape(nx, ny, NI.w / 2 + 1.0, NI.spring)) return true;
    const [ax, ay, az] = toArch(p);
    if (az > -20 && az < 10 && inArchShape(ax, ay, AR.w / 2 + 0.6, AR.spring)) return true;
    return false;
  };

  // wetness below waterfalls
  const wetAt = (th, y) => {
    let w = 0;
    for (const wth of [CLK(4.62), CLK(9.0)]) { const d = angDist(th, wth) * 180; w = Math.max(w, Math.exp(-d * d / 300) * smoothstep(-2, -12, y)); }
    return w * 0.85;
  };
  const rock = makeRock({ ...rockOpts, seg: 288, rings: 120, cut, wet: wetAt });
  ctx.mainRock = rock;
  b.add('rock', rock.geo, null, null, { aux: (x, y, z, i) => [rock.geo.attributes.aux.getX(i), rock.geo.attributes.aux.getY(i)] });
  // top surface (visible as the grassy ledge outside the wall)
  b.add('grass', makeCap(rock, 160, 6, 0, 0), mat(0, 0.15, 0), 0x6a7f3c);
  collider.addRock(0, 0, 0, (th, y) => rock.radiusAt(th, y), MAIN.depth, MAIN.rimR);

  // ---------- guardian niche ----------
  const stoneOld = 0xc4b9a4, stoneOld2 = 0xb3a891;
  {
    const hw = NI.w / 2, sp = NI.spring;
    const shell = new THREE.CylinderGeometry(hw, hw, sp, 40, 4, true, Math.PI / 2, Math.PI); // half cylinder behind plane z<=0
    shell.translate(0, sp / 2, 0);
    b.add('stone', invertGeo(shell), nFrame, stoneOld2);
    const dome = new THREE.SphereGeometry(hw, 40, 12, Math.PI, Math.PI, 0, Math.PI / 2);
    b.add('stone', invertGeo(dome), mul(nFrame, mat(0, sp, 0)), stoneOld2);
    // carved ribs inside the semi-dome
    for (let i = 1; i < 8; i++) {
      const rib = G.torus(hw - 0.4, 0.5, 5, 20, Math.PI / 2);
      b.add('stone', rib, mul(nFrame, mat(0, sp, 0), new THREE.Matrix4().makeRotationY(i / 8 * Math.PI)), stoneOld);
    }
    // floor ledge with steps
    b.add('stone', G.cylC(hw + 1, hw + 1, 2, 40), mul(nFrame, mat(0, -1, 0)), stoneOld);
    b.add('stone', G.box(NI.w + 8, 3, 10), mul(nFrame, mat(0, -3, 4)), stoneOld2);
    for (let i = 0; i < 4; i++) b.add('stone', G.box(NI.w + 6 - i * 3, 0.7, 2.2), mul(nFrame, mat(0, -3 + 3 + i * 0.0, 8.5 - i * 1.4)), stoneOld);
    // corbels under the ledge
    for (let i = -2; i <= 2; i++) for (let k = 0; k < 4; k++) b.add('stone', G.box(3.6 - k * 0.7, 1.6, 7.5 - k * 1.6), mul(nFrame, mat(i * 8.5, -4.6 - k * 1.6, 3.8 - k * 0.8)), k % 2 ? stoneOld : stoneOld2);
    // frame: jambs, arch ring, cornice, keystone
    for (const s of [-1, 1]) {
      b.add('stone', G.box(4.2, sp, 4), mul(nFrame, mat(s * (hw + 1.6), 0, 0.6)), stoneOld);
      b.add('stone', G.box(5.2, 2.2, 5), mul(nFrame, mat(s * (hw + 1.6), 0, 0.6)), stoneOld2);
      b.add('stone', G.box(5.0, 1.6, 4.8), mul(nFrame, mat(s * (hw + 1.6), sp - 1.6, 0.6)), stoneOld2);
      // fluting on jambs
      for (let k = -1; k <= 1; k++) b.add('stone', G.box(0.5, sp - 6, 0.5), mul(nFrame, mat(s * (hw + 1.6) + k * 1.2, 3, 2.7)), stoneOld2);
    }
    b.add('stone', G.archRing(NI.w + 0.4, 3.6, 4, 'round', 28, 0), mul(nFrame, mat(0, sp, 0.6)), stoneOld);
    b.add('stone', G.archRing(NI.w + 7.6, 1.4, 4.6, 'round', 28, 0), mul(nFrame, mat(0, sp, 0.6)), stoneOld2);
    b.add('stone', G.box(4, 6, 5), mul(nFrame, mat(0, sp + hw + 1.5, 0.8)), stoneOld2);
    // relief band (rhythm of small blocks) above the arch
    b.add('stone', G.box(NI.w + 14, 2.4, 3), mul(nFrame, mat(0, sp + hw + 7, 0)), stoneOld);
    for (let k = -6; k <= 6; k++) b.add('stone', G.box(1.6, 3.2, 1.2), mul(nFrame, mat(k * 3.1, sp + hw + 9.4, 0.6)), stoneOld2);
    b.add('stone', G.box(NI.w + 16, 1.8, 3.6), mul(nFrame, mat(0, sp + hw + 12.6, 0)), stoneOld);
    // guardian statue
    const gM = mul(nFrame, mat(0, 0, -5.5));
    addPedestal(b, gM, 13, 5, 'stone', stoneOld);
    addStatue(b, mul(gM, mat(0, 5, 0)), 52, 'guardian', 'stone', 7, 0xc9bfaa);
    collider.addBox(0, -95, 158, 22, 42, 12, 0);
    ctx.landmarks = ctx.landmarks || {};
    ctx.landmarks.guardian = new THREE.Vector3().setFromMatrixPosition(gM).add(V3(0, 34, 0));
    ctx.landmarks.nicheFrame = nFrame;
  }

  // ---------- ancient arch gate with ruined colonnade ----------
  {
    const hw = AR.w / 2, sp = AR.spring, D = AR.depth;
    // side walls + barrel vault + floor + end wall (inside the rock, inward-facing)
    for (const s of [-1, 1]) b.add('stone', G.box(2, sp, D), mul(aFrame, mat(s * (hw + 1), 0, -D / 2)), stoneOld2);
    const vault = new THREE.CylinderGeometry(hw + 0.2, hw + 0.2, D, 24, 1, true, Math.PI / 2, Math.PI);
    vault.rotateX(Math.PI / 2);
    b.add('stone', invertGeo(vault), mul(aFrame, mat(0, sp, -D / 2)), stoneOld2);
    b.add('paving', G.box(AR.w + 2, 1, D + 2), mul(aFrame, mat(0, -1, -D / 2 + 1)), 0xb8ad97);
    b.add('stone', G.box(AR.w + 4, sp + hw + 2, 2), mul(aFrame, mat(0, 0, -D - 1)), 0x8c8373);
    // colonnade inside (some broken)
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const z = -5 - i * 6.2;
        const broken = rng.chance(0.35);
        const h = broken ? 3 + rng.next() * 6 : sp - 0.8;
        b.add('marble', G.column(h, 0.55, 10, 'doric'), mul(aFrame, mat(s * (hw - 1.6), 0, z)), 0xcfc4ae);
        if (broken && rng.chance(0.6)) {
          const g = G.cylC(0.5, 0.5, 3 + rng.next() * 3, 10); g.rotateZ(Math.PI / 2);
          b.add('marble', g, mul(aFrame, mat(s * (hw - 3.6), 0.5, z + rng.range(-1, 1), rng.range(-0.6, 0.6))), 0xcfc4ae);
        }
      }
    }
    // a faint crystal glow deep inside
    for (let i = 0; i < 6; i++) addCrystal(b, new THREE.Vector3().setFromMatrixPosition(mul(aFrame, mat(rng.range(-4, 4), 0, -D + 2))), V3(rng.range(-0.4, 0.4), 1, rng.range(0, 0.4)).applyMatrix4(new THREE.Matrix4().extractRotation(aFrame)), 2 + rng.next() * 3.5, 0.5 + rng.next() * 0.4, rng);
    // frame
    b.add('stone', G.archRing(AR.w, 2.2, 3.2, 'round', 22, 0), mul(aFrame, mat(0, sp, 0.6)), stoneOld);
    b.add('stone', G.archRing(AR.w + 4.4, 0.9, 3.6, 'round', 22, 0), mul(aFrame, mat(0, sp, 0.6)), stoneOld2);
    for (const s of [-1, 1]) {
      b.add('stone', G.box(2.6, sp, 3.4), mul(aFrame, mat(s * (hw + 1.3), 0, 0.6)), stoneOld);
      b.add('stone', G.box(3.2, 1.0, 3.8), mul(aFrame, mat(s * (hw + 1.3), sp - 1, 0.6)), stoneOld2);
    }
    b.add('stone', G.box(AR.w + 9, 1.6, 3.6), mul(aFrame, mat(0, sp + hw + 3.2, 0.3)), stoneOld2);
    // ledge platform in front of the gate (end of the zigzag stairs)
    b.add('stone', G.box(AR.w + 14, 2, 9), mul(aFrame, mat(-2, -2, 4)), stoneOld2);
    for (let i = -2; i <= 2; i++) b.add('stone', G.cyl(0.2, 2.2, 8, 6), mul(aFrame, mat(i * 5, -10, 3.5), new THREE.Matrix4().makeRotationX(Math.PI)), stoneOld2);
    for (let i = -6; i <= 4; i++) b.add('stone', G.box(1.6, 1.0, 0.5), mul(aFrame, mat(i * 2.1 - 1, 0, 8.2)), stoneOld);
    ctx.landmarks.archGate = new THREE.Vector3().setFromMatrixPosition(aFrame).add(V3(0, 10, 0));
  }

  // ---------- zigzag stairs carved along the cliff + boardwalk + landings ----------
  {
    const flights = [
      [FRONT + 0.035, 0.6, 3.30, -13],
      [3.30, -13, 3.205, -26],
      [3.205, -26, 3.34, -39],
      [3.34, -39, 3.235, -52],
      [3.235, -52, AR.th - 0.07, -66],
    ];
    const OUT = 1.7;
    flights.forEach(([th0, y0, th1, y1], fi) => {
      const len = Math.abs(th1 - th0) * 175;
      const n = Math.max(8, Math.round(Math.abs(y1 - y0) / 0.24));
      const wooden = fi === 2;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n; const th = th0 + (th1 - th0) * t; const y = y0 + (y1 - y0) * t;
        const r = Math.max(rFace(th, y), rFace(th, y - 2)) + OUT;
        const ry = outRot(th);
        if (!wooden) {
          b.add('stone', G.box(len / n + 0.06, 0.5, 3.2), mat(Math.sin(th) * r, y - 0.5, -Math.cos(th) * r, ry), 0xc9bfa9);
          if (i % 3 === 0) {
            const rr = rFace(th, y - 4);
            b.add('stone', G.box(len / n * 3, 4.2, Math.max(1.5, r - rr + 1.2)), mat(Math.sin(th) * (r + rr) / 2, y - 4.6, -Math.cos(th) * (r + rr) / 2, ry), 0xb3a891);
          }
        } else {
          b.add('wood', G.box(len / n + 0.02, 0.14, 2.6), mat(Math.sin(th) * r, y - 0.14, -Math.cos(th) * r, ry), 0x8a7058);
          if (i % 6 === 0) {
            const a = P(r + 1.1, th, y - 0.2), c = P(rFace(th, y - 4) + 0.2, th, y - 4.2);
            b.add('wood', G.box(1, 0.22, 0.22).translate(0.5, 0, 0), matSeg(a, c), 0x6e5844);
            const post = P(r + 1.2, th, y);
            b.add('wood', G.box(0.16, 1.15, 0.16), mat(post.x, post.y, post.z), 0x6e5844);
            if (prev) b.add('rope', G.tube([prev, post.clone().add(V3(0, 1.05, 0)).lerp(prev, 0.5).add(V3(0, -0.25, 0)), post.clone().add(V3(0, 1.05, 0))], 0.05, 4, 6), null, 0xb9a27c);
            prev = post.clone().add(V3(0, 1.05, 0));
          }
        }
        // outer parapet (stone flights)
        if (!wooden && i % 4 === 0 && i < n) {
          const t2 = Math.min(1, (i + 4) / n);
          const thb = th0 + (th1 - th0) * t2, yb = y0 + (y1 - y0) * t2;
          const rb = Math.max(rFace(thb, yb), rFace(thb, yb - 2)) + OUT;
          const a = P(r + 1.45, th, y - 0.3), c = P(rb + 1.45, thb, yb - 0.3);
          b.add('stone', G.box(1, 1.1, 0.4).translate(0.5, 0.55, 0), matSeg(a, c), 0xd2c8b2);
        }
      }
      // landing at the end of each flight
      if (fi < flights.length - 1) {
        const r = Math.max(rFace(th1, y1), rFace(th1, y1 - 2)) + OUT;
        const pL = P(r, th1, y1);
        b.add('stone', G.cylC(3.4, 3.4, 0.9, 20), mat(pL.x, y1 - 0.45, pL.z), 0xc9bfa9);
        b.add('stone', G.cyl(0.4, 3.0, 5, 10), mul(mat(pL.x, y1 - 0.9, pL.z), new THREE.Matrix4().makeRotationX(Math.PI)), 0xb3a891);
        b.add('stone', G.torus(3.3, 0.22, 5, 22, Math.PI), mul(mat(pL.x, y1 + 0.9, pL.z, outRot(th1)), new THREE.Matrix4().makeRotationX(Math.PI / 2)), 0xd2c8b2);
        for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI; const pp = new THREE.Vector3(Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3).applyAxisAngle(V3(0, 1, 0), outRot(th1)); b.add('stone', G.box(0.3, 0.9, 0.3), mat(pL.x + pp.x, y1, pL.z + pp.z), 0xd2c8b2); }
      }
    });
    ctx.landmarks.stairs = P(rFace(3.27, -30) + 3, 3.27, -30);
  }

  // ---------- anchor chains wrapped by roots ----------
  const chainPaths = [];
  for (const [hour, sgn] of [[4.8, 1], [7.45, -1]]) {
    const th = CLK(hour), y = -88;
    const r = rFace(th, y);
    const A = P(r + 1.5, th, y);
    const out = dirOf(th);
    const C = A.clone().addScaledVector(out, 10).add(V3(0, -80, 0));
    const E = A.clone().addScaledVector(out, 62).add(V3(sgn * 12, -238, 0));
    const curve = new THREE.QuadraticBezierCurve3(A, C, E);
    chainPaths.push(curve);
    // anchor collar + eye
    b.add('stone', G.cylC(4.6, 5.4, 5, 14).rotateX(Math.PI / 2), mul(mat(A.x, A.y, A.z, outRot(th)), mat(0, 0, -1.5)), 0xa89d88);
    b.add('iron', G.torus(3.0, 0.95, 8, 20), mul(mat(A.x, A.y - 2.6, A.z, outRot(th)), new THREE.Matrix4().makeRotationY(Math.PI / 2)), 0x3b3632);
    const L = curve.getLength(); const pitch = 6.5; const n = Math.floor(L / pitch);
    const link = G.chainLink(9.2, 5.4, 0.98, 6, 14);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = curve.getPointAt(t); const tg = curve.getTangentAt(t);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), tg);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (i % 2) * Math.PI / 2 + 0.3));
      b.add('iron', link, new THREE.Matrix4().compose(p.clone().add(V3(0, -2.6, 0)), q, V3(1, 1, 1)), 0x3e3935);
    }
    // roots spiralling around the upper chain
    for (let k = 0; k < 4; k++) {
      const pts = [];
      const st = A.clone().add(V3(Math.cos(k * 2.1) * 7, 6 + k * 3, 0)).addScaledVector(out, -3);
      pts.push(st);
      for (let j = 0; j <= 10; j++) {
        const t = 0.01 + j * 0.012 + k * 0.004;
        const c = curve.getPointAt(Math.min(t, 0.2)); const tg = curve.getTangentAt(Math.min(t, 0.2));
        const side = new THREE.Vector3().crossVectors(tg, V3(0, 0, 1)).normalize(); const side2 = new THREE.Vector3().crossVectors(tg, side);
        const a = j * 0.9 + k * 1.57; const rad = 3.2 + Math.sin(j) * 0.3;
        pts.push(c.clone().add(V3(0, -2.6, 0)).addScaledVector(side, Math.cos(a) * rad).addScaledVector(side2, Math.sin(a) * rad));
      }
      b.add('wood', G.taperTube(pts, 1.25 - k * 0.15, 0.25, 7, 60), null, 0x4a3b2d);
    }
  }
  ctx.landmarks.chain = chainPaths[0].getPointAt(0.15);
  ctx.chainPaths = chainPaths;

  // dangling roots from the underside
  for (let i = 0; i < 18; i++) {
    const th = rng.next() * Math.PI * 2; if (angDist(th, FRONT) < 0.4) continue;
    const y = -40 - rng.next() * 90; const r = rFace(th, y) - 1;
    const st = P(r, th, y); const len = 12 + rng.next() * 26; const out = dirOf(th);
    const pts = [st];
    for (let j = 1; j <= 5; j++) pts.push(st.clone().addScaledVector(out, j * 0.6 + Math.sin(j + i) * 0.8).add(V3(Math.sin(j * 1.7 + i) * 1.4, -len * j / 5, Math.cos(j * 1.3 + i) * 1.4)));
    b.add('wood', G.taperTube(pts, 0.7 + rng.next() * 0.4, 0.08, 6, 24), null, 0x4d3e30);
  }

  // ---------- crystals ----------
  const tipY = -MAIN.depth;
  addCrystal(b, V3(0, tipY + 10, 0), V3(0, -1, 0), 60, 6.0, rng);
  addCrystal(b, V3(6, tipY + 12, 4), V3(0.25, -1, 0.1), 44, 4.4, rng);
  addCrystal(b, V3(-5, tipY + 12, -3), V3(-0.2, -1, -0.15), 48, 4.8, rng);
  for (let i = 0; i < 44; i++) {
    const a = rng.next() * Math.PI * 2; const ring = Math.pow(rng.next(), 0.8);
    const y = tipY + 6 + ring * 34; const r = Math.max(2, rFace(a, y) - 1.5);
    const base = P(r * 0.9, a, y);
    const d = dirOf(a).multiplyScalar(0.3 + ring * 1.0).add(V3(rng.range(-0.2, 0.2), -1, rng.range(-0.2, 0.2))).normalize();
    const L = (48 - ring * 32) * (0.55 + rng.next() * 0.6);
    addCrystal(b, base, d, L, L * (0.09 + rng.next() * 0.04), rng);
  }
  const smallSpots = [[1.5, -60], [3.2, -95], [5.6, -48], [8.6, -105], [10.4, -70], [11.6, -120], [2.4, -130], [9.4, -135], [4.3, -140]];
  for (const [h, y] of smallSpots) {
    const th = CLK(h); const r = rFace(th, y) - 0.6;
    for (let k = 0; k < 6; k++) {
      const th2 = th + rng.range(-0.04, 0.04), y2 = y + rng.range(-4, 4);
      const base = P(rFace(th2, y2) - 0.6, th2, y2);
      const d = dirOf(th2).add(V3(rng.range(-0.4, 0.4), rng.range(-0.8, 0.3), rng.range(-0.4, 0.4))).normalize();
      const L = 2.5 + rng.next() * 6;
      addCrystal(b, base, d, L, L * 0.13, rng);
    }
  }

  // ---------- vines and shrubs along the rim ----------
  const skipVine = (th) => angDist(th, FRONT) < 0.075 || angDist(th, CLK(8)) < 0.05 || angDist(th, CLK(2)) < 0.05 || angDist(th, CLK(10)) < 0.05 || angDist(th, CLK(12)) < 0.06;
  for (let i = 0; i < 460; i++) {
    const th = (i / 460) * Math.PI * 2 + rng.range(-0.005, 0.005);
    if (skipVine(th)) continue;
    const front = angDist(th, FRONT) < 0.55;
    const r = rock.rimAt(th) - 0.4;
    const top = P(r, th, 0.4);
    const clump = 0.35 + 0.65 * Math.min(1, Math.abs(perlin3(th * 4, 0.5, 0.5) * 2.6));
    const len = ((front ? 14 : 8) + rng.next() * (front ? 30 : 24)) * clump;
    vineStrip(b, top, dirOf(th), len, (1.8 + rng.next() * 2.2) * (0.6 + clump * 0.5), rng, 0.0);
    if (i % 3 === 0) shrub(b, top.x, 0.2, top.z, 1.0 + rng.next() * 1.1, rng);
  }
  // vines draped over the niche frame top & along strata ledges
  for (let i = 0; i < 26; i++) {
    const lx = rng.range(-22, 22);
    const top = new THREE.Vector3().setFromMatrixPosition(mul(nFrame, mat(lx, NI.spring + NI.w / 2 + 13.6, 1.8)));
    vineStrip(b, top, nZ.clone().setY(0).normalize(), 4 + rng.next() * 12, 1.1 + rng.next(), rng);
  }

  b.build(scene, M, { vine: { cast: true, receive: true }, crystal: { cast: false } });

  // ---------- floating debris rocks (instanced, animated) ----------
  {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + perlin3(x * 1.3, y * 1.3, z * 1.3) * 0.38 + perlin3(x * 3.1, y * 3.1, z * 3.1) * 0.12; p.setXYZ(i, x * k, (y > 0 ? y * 0.55 : y * 1.25) * k, z * k); }
    geo.computeVertexNormals();
    const cols = new Float32Array(p.count * 3); const c = new THREE.Color(0x8a7c6b);
    for (let i = 0; i < p.count; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const aux = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { aux[i * 2] = p.getY(i) > 0.2 ? 0.8 : 0.0; aux[i * 2 + 1] = 0; }
    geo.setAttribute('aux', new THREE.BufferAttribute(aux, 2));
    const N = 72;
    const im = new THREE.InstancedMesh(geo, M.rock, N);
    im.castShadow = true; im.receiveShadow = true;
    const data = [];
    for (let i = 0; i < N; i++) {
      const th = rng.next() * Math.PI * 2; const y = -170 + rng.next() * 175;
      const rr = rFace(th, Math.min(0, y)) + 18 + rng.next() * 110 * (y < -100 ? 0.6 : 1) + (angDist(th, Math.PI) < 0.35 ? 30 : 0);
      const s = Math.pow(rng.next(), 2.8) * 9 + 0.9;
      data.push({ th, y, rr, s, ax: V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), w: rng.range(0.03, 0.12) * (rng.chance(0.5) ? 1 : -1), ph: rng.next() * 6.28, bob: rng.range(0.6, 2.2), orbit: rng.range(-0.0025, 0.0025) });
    }
    im.frustumCulled = false;
    scene.add(im);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const upd = (t) => {
      for (let i = 0; i < N; i++) {
        const d = data[i]; const th = d.th + d.orbit * t;
        pos.set(Math.sin(th) * d.rr, d.y + Math.sin(t * 0.35 + d.ph) * d.bob, -Math.cos(th) * d.rr);
        q.setFromAxisAngle(d.ax, d.ph + t * d.w);
        sc.set(d.s, d.s, d.s);
        mm.compose(pos, q, sc); im.setMatrixAt(i, mm);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    upd(0);
    ctx.updaters.push(upd);
  }
  return rock;
}
