import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG, perlin3, smoothstep } from '../core/noise.js';
import { makeRock, makeCap } from './rock.js';
import { SATS, CLK, P, angDist, outRot, dirOf } from './layout.js';
import { addCrystal } from './mainIsland.js';
import { addStatue } from './statues.js';
import { house, windowOn, doorOn, arcade, lampPost, TRIM, BASE } from './buildings.js';
import { cypress, oliveTree, shrub, flowerBush, vineStrip, bigTree } from './vegetation.js';
import { roundTower } from './wall.js';
import { pinnacle } from './temple.js';
import { eventPhase, sinceLast } from '../events.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const STONE = 0xe4dac6, STONE2 = 0xd6c9ae, COP = 0x5d9e8b, GOLD = 0xe8bd62, WOOD = 0x7d6248, WOODD = 0x5e4a38;

// ---------------------------------------------------------------- common island base
function islandBase(ctx, key, b, rng, opts = {}) {
  const s = SATS[key];
  const rock = makeRock({ R0: s.R, depth: s.depth, seg: 192, rings: 74, seed: s.seed, p: 1.3, q: 0.9, lobes: 0.11, strata: 0.09, layerH: 7.5, cracks: 0.13, facets: 0.05, facetScale: 9, mossDepth: 0.5 });
  b.add('rock', rock.geo, mat(s.pos.x, s.y, s.pos.z), null, { aux: (x, y, z, i) => [rock.geo.attributes.aux.getX(i), rock.geo.attributes.aux.getY(i)] });
  b.add('grass', makeCap(rock, 120, 9, 0), mat(s.pos.x, s.y + 0.1, s.pos.z), opts.grassCol || 0x6c8c3a);
  ctx.collider.addRock(s.pos.x, s.y, s.pos.z, (th, y) => rock.radiusAt(th, y), s.depth, s.R);
  ctx.collider.addGround(() => s.y + 0.1, s.pos.x, s.pos.z, s.R - 1);
  const F = mat(s.pos.x, s.y, s.pos.z, outRot(s.th));
  const W = (x, y, z) => V3(x, y, z).applyMatrix4(F);
  // rim vines and shrubs
  const n = Math.round(2 * Math.PI * s.R / 2.2);
  for (let i = 0; i < n; i++) {
    const th = (i + rng.next() * 0.5) / n * Math.PI * 2;
    if (opts.skipRim && opts.skipRim(th)) continue;
    const r = rock.rimAt(th) - 0.4;
    const top = V3(s.pos.x + Math.sin(th) * r, s.y + 0.4, s.pos.z - Math.cos(th) * r);
    const clump = 0.3 + 0.7 * Math.abs(perlin3(th * 3 + s.seed, 0.5, 0.2) * 2.4);
    if (rng.chance(0.75)) vineStrip(b, top, dirOf(th), (5 + rng.next() * 18) * Math.min(1.2, clump), 1.4 + rng.next() * 1.6, rng);
    if (i % 3 === 0) shrub(b, top.x - Math.sin(th) * 1.5, s.y, top.z + Math.cos(th) * 1.5, 0.8 + rng.next(), rng);
  }
  // bottom: crystals or hanging roots
  const tip = V3(s.pos.x, s.y - s.depth, s.pos.z);
  if (opts.crystals !== false) {
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2; const y = -s.depth + 3 + rng.next() * 10; const r = Math.max(1, rock.radiusAt(a, y) * 0.85);
      const base = V3(s.pos.x + Math.sin(a) * r, s.y + y, s.pos.z - Math.cos(a) * r);
      addCrystal(b, base, dirOf(a).multiplyScalar(0.5).add(V3(0, -1, 0)), 5 + rng.next() * 9, 0.6 + rng.next() * 0.6, rng);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = rng.next() * Math.PI * 2; const y = -s.depth * (0.35 + rng.next() * 0.45); const r = rock.radiusAt(a, y) - 0.5;
    const st = V3(s.pos.x + Math.sin(a) * r, s.y + y, s.pos.z - Math.cos(a) * r);
    const len = 8 + rng.next() * 16; const pts = [st];
    for (let j = 1; j <= 4; j++) pts.push(st.clone().addScaledVector(dirOf(a), j * 0.5).add(V3(Math.sin(j * 1.7 + i) * 0.8, -len * j / 4, Math.cos(j * 1.3 + i) * 0.8)));
    b.add('wood', G.taperTube(pts, 0.45, 0.06, 5, 16), null, 0x4d3e30);
  }
  // scattered trees
  for (let i = 0; i < (opts.trees ?? 5); i++) {
    const a = rng.next() * Math.PI * 2, rr = s.R * (0.45 + rng.next() * 0.4);
    const lx = Math.sin(a) * rr, lz = -Math.cos(a) * rr;
    if (opts.keepOut && opts.keepOut(lx, lz)) continue;
    const p = W(lx, 0, lz);
    if (rng.chance(0.5)) cypress(b, p.x, s.y, p.z, 7 + rng.next() * 6, rng); else oliveTree(b, p.x, s.y, p.z, 0.8 + rng.next() * 0.3, rng);
  }
  return { s, rock, F, W };
}

// ---------------------------------------------------------------- HARBOR (airship port)
function buildHarbor(ctx, scene, M) {
  const b = new Batch('harbor'); const rng = new RNG(701);
  const { s, F, W } = islandBase(ctx, 'harbor', b, rng, { keepOut: (x, z) => z > 8 || (x < -2 && z < -5) });
  const y0 = s.y;
  const L = ctx.landmarks;
  // warehouse
  {
    const Mw = mul(F, mat(-20, 0, -20, 0));
    b.add('plaster', G.box(28, 9.5, 14), mul(Mw, mat(0, 0, 0)), 0xe6d8bc);
    b.add('stone', G.box(28.3, 1.0, 14.3), mul(Mw, mat(0, -0.3, 0)), BASE);
    b.add('roof', G.gableRoof(28, 14, 5.2, 0.6, 0.2), mul(Mw, mat(0, 9.5, 0)), 0xa8603f);
    for (const sx of [-1, 1]) b.add('plaster', G.gableWall(14, 5.2, 0.3), mul(Mw, mat(sx * 13.85, 9.5, 0)), 0xe6d8bc);
    for (let k = -1; k <= 1; k++) {
      const Md = mul(Mw, mat(k * 8.5, 0, 7.0));
      b.add('wood', G.box(4.2, 5.2, 0.3), Md, 0x6e4f34);
      b.add('stone', G.archRing(4.2, 0.4, 0.5, 'round', 10, 0), mul(Md, mat(0, 5.2, 0.1)), TRIM);
      for (let j = 0; j < 3; j++) b.add('iron', G.box(4.3, 0.16, 0.35), mul(Md, mat(0, 1 + j * 1.6, 0.05)), 0x2e2b28);
    }
    for (let k = 0; k < 7; k++) windowOn(b, mul(Mw, mat(0, 0, -7.0, Math.PI)), -12 + k * 4, 5.5, 1.0, 1.4, rng, { frame: false });
    // sign
    b.add('wood', G.box(8, 1.2, 0.2), mul(Mw, mat(0, 6.4, 7.2)), 0x4b3a2a);
    b.add('gold', G.box(6.6, 0.5, 0.25), mul(Mw, mat(0, 6.75, 7.25)), GOLD);
    const c = W(-20, 0, -20); ctx.collider.addBox(c.x, y0 + 7, c.z, 14, 7.5, 7, -outRot(s.th));
  }
  // timber pier extending outward
  const pierRoot = V3(14, 0, s.R - 6), pierLen = 46;
  {
    const Mp = mul(F, mat(pierRoot.x, 0, pierRoot.z, 0));
    for (let k = 0; k < Math.round(pierLen / 0.9); k++) b.add('wood', G.box(7.6, 0.22, 0.82), mul(Mp, mat(0, -0.22, k * 0.9 + 0.45)), k % 3 ? 0x8c7258 : 0x7d6550);
    for (const sx of [-1, 1]) {
      b.add('wood', G.box(0.5, 0.6, pierLen), mul(Mp, mat(sx * 3.5, -0.8, pierLen / 2)), WOODD);
      for (let k = 0; k <= 8; k++) {
        const z = k * pierLen / 8;
        b.add('wood', G.box(0.35, 1.2, 0.35), mul(Mp, mat(sx * 3.7, 0, z)), WOODD); // railing posts
        // hanging truss struts down to the rock
        const top = V3(sx * 3.4, -0.9, z).applyMatrix4(Mp); const bot = V3(sx * 2.2, -9 - (pierLen - z) * 0.05, Math.max(-2, z * 0.35 - 6)).applyMatrix4(Mp);
        if (z < pierLen * 0.75) b.add('wood', G.box(1, 0.32, 0.32).translate(0.5, 0, 0), matSeg(top, bot), WOODD);
      }
      const r0 = V3(sx * 3.7, 1.1, 0).applyMatrix4(Mp), r1 = V3(sx * 3.7, 1.1, pierLen).applyMatrix4(Mp);
      b.add('rope', G.tube([r0, r0.clone().lerp(r1, 0.5).add(V3(0, -0.25, 0)), r1], 0.06, 4, 16), null, 0xb9a27c);
    }
    for (let k = 0; k < 4; k++) b.add('wood', G.box(0.4, 0.4, pierLen), mul(Mp, mat((k - 1.5) * 1.8, -1.2, pierLen / 2)), WOODD);
    // bollards, rope coils, crates & barrels
    for (let k = 1; k <= 4; k++) for (const sx of [-1, 1]) {
      const Mb = mul(Mp, mat(sx * 3.0, 0, k * pierLen / 5));
      b.add('iron', G.cyl(0.32, 0.38, 0.9, 10), Mb, 0x2f2c2a); b.add('iron', G.cyl(0.45, 0.45, 0.16, 10), mul(Mb, mat(0, 0.9, 0)), 0x2f2c2a);
      if (k % 2) b.add('rope', G.torus(0.55, 0.13, 6, 14).rotateX(Math.PI / 2), mul(Mb, mat(sx * -1.2, 0.14, 0.6)), 0xc2a77c);
    }
    for (let k = 0; k < 9; k++) {
      const x = rng.range(-2.4, 2.4), z = rng.range(3, pierLen - 4);
      if (rng.chance(0.5)) { const sz = rng.range(0.8, 1.4); b.add('wood', G.box(sz, sz, sz), mul(Mp, mat(x, 0, z, rng.next())), rng.pick([0x9a7a54, 0x8a6a46, 0xa88a60])); }
      else b.add('wood', G.lathe([[0.001, 0], [0.42, 0.02], [0.5, 0.55], [0.42, 1.1], [0.001, 1.12]], 12, false), mul(Mp, mat(x, 0, z)), 0x7a5a3a);
    }
    // signal flag line above the dock: from warehouse roof to a tall pole near the pier root
    const pole = V3(pierRoot.x + 4.5, 0, pierRoot.z - 3).applyMatrix4(F);
    b.add('wood', G.cyl(0.18, 0.25, 15, 8), mat(pole.x, y0, pole.z), WOODD);
    const a = W(-8, 15.6, -13), c = V3(pole.x, y0 + 14.6, pole.z);
    const np = 11;
    for (let k = 0; k <= np; k++) {
      const t = k / np; const p = a.clone().lerp(c, t); p.y -= Math.sin(t * Math.PI) * 1.6;
      if (k < np) { const q = a.clone().lerp(c, (k + 1) / np); q.y -= Math.sin((k + 1) / np * Math.PI) * 1.6; b.add('rope', G.box(1, 0.06, 0.06).translate(0.5, 0, 0), matSeg(p, q), 0x4a4038); }
      if (k > 0 && k < np) ctx.flags.push({ pos: p.clone(), w: 1.5, h: 1.3, kind: 10 + (k % 5), pennant: true, dir: c.clone().sub(a).normalize() });
    }
    L.pier = V3(pierRoot.x, 2, pierRoot.z + pierLen * 0.5).applyMatrix4(F);
    L.harborWarehouse = W(-20, 6, -12);
    const pc = V3(pierRoot.x, 0, pierRoot.z + pierLen / 2).applyMatrix4(F); ctx.collider.addBox(pc.x, y0 - 1, pc.z, 4.5, 2, pierLen / 2, -outRot(s.th));
  }
  // crane (animated): base on island near pier root
  {
    const base = V3(pierRoot.x - 7.5, 0, pierRoot.z - 4).applyMatrix4(F);
    b.add('stone', G.cyl(2.4, 2.8, 1.6, 12), mat(base.x, y0, base.z), STONE2);
    const g = new THREE.Group(); g.position.set(base.x, y0 + 1.6, base.z); scene.add(g);
    const cb = new Batch('crane');
    // rotating part (mast + jib)
    cb.add('wood', G.box(1.0, 11, 1.0), mat(0, 0, 0), WOOD);
    cb.add('wood', G.box(0.6, 0.6, 17).translate(0, 0, 8.5), mat(0, 10.2, 0, 0, 1, 1, 1, -0.18), WOOD);
    cb.add('wood', G.box(1, 0.35, 0.35).translate(0.5, 0, 0), matSeg(V3(0, 3, 0), V3(0, 10.4, 14.5).applyMatrix4(new THREE.Matrix4().identity())), WOODD);
    cb.add('wood', G.box(1, 0.3, 0.3).translate(0.5, 0, 0), matSeg(V3(0, 11, 0), V3(0, 10.9, 15.6)), WOODD);
    cb.add('wood', G.box(2.2, 2.0, 2.2), mat(0, 2.0, -1.6), WOODD); // counterweight box
    cb.add('stone', G.box(1.8, 1.6, 1.8), mat(0, 4.2, -1.6), 0x9a9080);
    cb.add('iron', G.cyl(0.7, 0.7, 1.2, 12).rotateZ(Math.PI / 2), mat(0, 1.6, 0.9), 0x3a3634); // winch drum
    const jib = new THREE.Group(); g.add(jib);
    cb.build(jib, M);
    // hook + rope + crate (moves vertically)
    const hook = new THREE.Group(); hook.position.set(0, 10.2 - 0.18 * 14.8 + 0.2, 14.8); jib.add(hook);
    const hb = new Batch('hook');
    hb.add('iron', G.cyl(0.05, 0.05, 1, 4).translate(0, -0.5, 0), mat(0, 0, 0), 0x2f2c2a);
    hb.add('wood', G.box(2.0, 1.6, 2.0), mat(0, -1.6, 0), 0x9a7a54);
    for (let j = 0; j < 4; j++) hb.add('rope', G.cyl(0.04, 0.04, 1.6, 3), mat((j % 2 ? 1 : -1) * 0.8, -1.0, (j < 2 ? 1 : -1) * 0.8), 0xb9a27c);
    const hookMeshes = hb.build(hook, M);
    const rope = hookMeshes.find((m) => m.name.endsWith(':iron'));
    const crateGroup = hookMeshes.filter((m) => !m.name.endsWith(':iron'));
    const rest = { yaw: 0.5, len: 6 };
    ctx.updaters.push((t) => {
      const e = (a, b2, u) => a + (b2 - a) * smoothstep(0, 1, Math.max(0, Math.min(1, u)));
      const up = eventPhase('craneUp', t), dn = eventPhase('craneDown', t);
      const yawA = rest.yaw, yawB = rest.yaw - 1.9;
      let yaw, len;
      if (up >= 0) {
        if (up < 2.5) { yaw = yawA; len = e(6, 13, up / 2.5); }
        else if (up < 6) { yaw = yawA; len = e(13, 3.5, (up - 2.5) / 3.5); }
        else { len = 3.5; yaw = e(yawA, yawB, (up - 6) / 4); }
      } else if (dn >= 0) {
        if (dn < 3) { yaw = yawB; len = e(3.5, 8.5, dn / 3); }
        else if (dn < 5) { yaw = yawB; len = e(8.5, 3.5, (dn - 3) / 2); }
        else { yaw = e(yawB, yawA, (dn - 5) / 5); len = e(3.5, 6, (dn - 5) / 5); }
      } else {
        const lu = sinceLast('craneUp', t), ld = sinceLast('craneDown', t);
        const atB = lu < ld; yaw = atB ? yawB : yawA; len = atB ? 3.5 : 6;
      }
      jib.rotation.y = yaw + outRot(s.th) + Math.sin(t * 0.4) * 0.01;
      hook.position.y = 10.2 - 0.18 * 14.8 + 0.2 - len;
      if (rope) { rope.scale.set(1, len, 1); rope.position.y = len; rope.updateMatrix(); }
      hook.rotation.z = Math.sin(t * 1.1) * 0.02; hook.rotation.y = Math.sin(t * 0.3) * 0.2;
    });
    L.crane = V3(base.x, y0 + 8, base.z);
    ctx.collider.addCyl(base.x, base.z, 1.5, y0, y0 + 13);
  }
  // mooring mast
  const mastPos = V3(-24, 0, s.R * 0.72).applyMatrix4(F);
  const mastTop = mastPos.clone().setY(y0 + 34);
  {
    b.add('stone', G.cyl(4.2, 5.0, 8, 8), mat(mastPos.x, y0, mastPos.z, Math.PI / 8), STONE2);
    b.add('stone', G.cyl(4.6, 4.6, 0.6, 8), mat(mastPos.x, y0 + 8, mastPos.z, Math.PI / 8), TRIM);
    // iron lattice tower (4 legs + cross bracing)
    const legs = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; legs.push([V3(mastPos.x + Math.sin(a) * 3.2, y0 + 8.6, mastPos.z + Math.cos(a) * 3.2), V3(mastPos.x + Math.sin(a) * 1.0, y0 + 32, mastPos.z + Math.cos(a) * 1.0)]); }
    for (const [a, c] of legs) b.add('iron', G.box(1, 0.4, 0.4).translate(0.5, 0, 0), matSeg(a, c), 0x3c3a38);
    for (let lv = 0; lv < 6; lv++) {
      const t0 = lv / 6, t1 = (lv + 1) / 6;
      for (let k = 0; k < 4; k++) {
        const A0 = legs[k][0].clone().lerp(legs[k][1], t0), B1 = legs[(k + 1) % 4][0].clone().lerp(legs[(k + 1) % 4][1], t1);
        const A1 = legs[k][0].clone().lerp(legs[k][1], t1);
        b.add('iron', G.box(1, 0.16, 0.16).translate(0.5, 0, 0), matSeg(A0, B1), 0x3c3a38);
        b.add('iron', G.box(1, 0.2, 0.2).translate(0.5, 0, 0), matSeg(A1, legs[(k + 1) % 4][0].clone().lerp(legs[(k + 1) % 4][1], t1)), 0x3c3a38);
      }
    }
    b.add('iron', G.cyl(1.6, 1.2, 2.4, 12), mat(mastTop.x, y0 + 32, mastTop.z), 0x3c3a38);
    b.add('gold', G.torus(1.3, 0.25, 6, 18), mul(mat(mastTop.x, y0 + 35.2, mastTop.z), new THREE.Matrix4().makeRotationX(Math.PI / 2)), GOLD);
    b.add('iron', G.cone(0.9, 1.6, 10), mat(mastTop.x, y0 + 34.4, mastTop.z), 0x3c3a38);
    ctx.flags.push({ pos: V3(mastTop.x, y0 + 41.5, mastTop.z), w: 4.4, h: 2.6, kind: 3 });
    b.add('iron', G.cyl(0.08, 0.08, 6, 5), mat(mastTop.x, y0 + 35.6, mastTop.z), 0x333030);
    ctx.collider.addCyl(mastPos.x, mastPos.z, 5, y0, y0 + 37);
    L.mast = mastTop.clone();
  }
  // airship (animated group)
  {
    const ship = new THREE.Group(); scene.add(ship);
    const sb = new Batch('airship');
    const Lh = 62, Rr = 8.6;
    // envelope along local +z (nose at z=0, tail at z=-Lh)
    const prof = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const r = Rr * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.75) * (1 - 0.15 * t); prof.push([Math.max(r, 0.05), -t * Lh]); }
    const env = G.lathe(prof, 40, true); env.rotateX(Math.PI / 2); // lathe y -> z
    // after rotateX(PI/2): (x, y, z) -> (x, -z, y)?  we want axis along z
    sb.add('fabric', env, null, 0xe9dcc0);
    // rib frames
    for (let i = 2; i < 23; i += 2) { const [r, y] = prof[i]; sb.add('wood', G.torus(r + 0.12, 0.16, 5, 40), mat(0, 0, y), 0x8a6a4c); }
    // longitudinal seams
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const pts = prof.slice(1, -1).map(([r, y]) => V3(Math.cos(a) * (r + 0.08), Math.sin(a) * (r + 0.08), y));
      sb.add('rope', G.tube(pts, 0.1, 4, 40), null, 0xc8b48c);
    }
    // patches
    for (let k = 0; k < 7; k++) {
      const i = 4 + Math.floor(rng.next() * 15); const [r, y] = prof[i]; const a = rng.next() * Math.PI * 2;
      const pg = new THREE.SphereGeometry(r + 0.1, 8, 4, a, 0.35, Math.PI / 2 - 0.2, 0.4);
      pg.rotateX(Math.PI / 2);
      sb.add('fabric', pg, mat(0, 0, y), rng.pick([0xd6c49c, 0xc9b28a, 0xf0e6d0, 0xb8a27a]));
    }
    // fins (cross) with rudder
    for (let k = 0; k < 4; k++) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-11, 0); sh.lineTo(-14, 6.5); sh.lineTo(-6, 6.5); sh.lineTo(0, 1.5); sh.lineTo(0, 0);
      const fg = G.extrude(sh, 0.4, 0, 2); fg.rotateY(-Math.PI / 2); // x->z
      sb.add('fabric', fg, mul(new THREE.Matrix4().makeRotationZ(k * Math.PI / 2), mat(0, 3.0, -Lh + 13)), k % 2 ? 0xb8483a : 0xe9dcc0);
    }
    sb.add('wood', G.box(0.3, 7, 4.5), mat(0, 7.5, -Lh + 0.8), 0x8a6a4c); // rudder
    // gondola
    const gz = -24;
    sb.add('wood', G.box(4.2, 3.4, 16), mat(0, -Rr - 4.2, gz), 0x8a6040);
    sb.add('wood', G.box(4.6, 0.5, 16.6), mat(0, -Rr - 4.4, gz), 0x5e4532);
    sb.add('gold', G.box(4.4, 0.18, 16.2), mat(0, -Rr - 1.1, gz), GOLD);
    sb.add('wood', G.cylC(2.1, 2.1, 3.4, 12, false).rotateX(0), mat(0, -Rr - 2.5, gz + 8), 0x8a6040);
    for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) { const pw = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12); pw.rotateZ(Math.PI / 2); sb.add('glass', pw, mat(sx * 2.12, -Rr - 2.3, gz - 6 + k * 2.4), 0x2a3550); sb.add('gold', G.torus(0.45, 0.07, 4, 12).rotateY(Math.PI / 2), mat(sx * 2.15, -Rr - 2.3, gz - 6 + k * 2.4), GOLD); }
    for (const zz of [gz - 7, gz - 2, gz + 3, gz + 7]) for (const sx of [-1, 1]) sb.add('rope', G.box(0.06, 1, 0.06).translate(0, 0.5, 0), mat(sx * 1.8, -Rr - 1, zz, 0, 1, 1.6, 1, 0, sx * 0.25), 0x6a5a48);
    // propellers on outriggers
    const props = [];
    for (const sx of [-1, 1]) {
      sb.add('iron', G.box(5, 0.3, 0.3).translate(sx * 2.5, 0, 0), mat(sx * 2, -Rr - 3, gz - 4), 0x3a3634);
      sb.add('iron', G.cyl(0.55, 0.4, 2.2, 10).rotateX(Math.PI / 2), mat(sx * 7, -Rr - 3, gz - 4), 0x3a3634);
      props.push(V3(sx * 7, -Rr - 3, gz - 5.3));
    }
    // nose cap
    sb.add('iron', new THREE.SphereGeometry(1.1, 10, 8), mat(0, 0, 0.2), 0x6a5a48);
    sb.build(ship, M);
    const propGroups = props.map((p) => { const pg = new THREE.Group(); pg.position.copy(p); ship.add(pg); const pb = new Batch('prop'); for (let k = 0; k < 3; k++) pb.add('wood', G.box(0.5, 3.6, 0.12).translate(0, 1.8, 0), mat(0, 0, 0, 0, 1, 1, 1, 0, k * Math.PI * 2 / 3), 0x6e5440); pb.build(pg, M); return pg; });
    // mooring lines (rebuilt each frame)
    const lineMat = M.rope;
    const lines = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), lineMat); m.castShadow = true; scene.add(m); return m; });
    const anchors = [V3(-14, 0.3, s.R * 0.62).applyMatrix4(F), V3(-34, 0.3, s.R * 0.55).applyMatrix4(F)];
    for (const a of anchors) b.add('iron', G.cyl(0.4, 0.5, 1.0, 8), mat(a.x, y0, a.z), 0x2f2c2a);
    const out = dirOf(s.th);
    const wd = ctx.U.uWindDir.value; const baseYaw = Math.atan2(-wd.x, -wd.y);
    const aux = new Float32Array(0);
    const tmpV = new THREE.Vector3();
    ctx.updaters.push((t) => {
      const yaw = baseYaw + Math.sin(t * 0.21) * 0.05 + Math.sin(t * 0.083 + 1) * 0.035;
      const roll = Math.sin(t * 0.37) * 0.025, pitch = Math.sin(t * 0.29 + 0.6) * 0.018;
      ship.position.copy(mastTop).add(V3(0, 1.0 + Math.sin(t * 0.33) * 0.35, 0));
      ship.rotation.set(pitch, yaw, roll, 'YXZ');
      ship.updateMatrixWorld(true);
      for (const pg of propGroups) pg.rotation.z = t * 1.4;
      // gondola attachment points -> anchors
      const att = [V3(0, -Rr - 4.4, gz - 7), V3(0, -Rr - 4.4, gz + 7)];
      for (let i = 0; i < 2; i++) {
        const p0 = att[i].clone().applyMatrix4(ship.matrixWorld); const p1 = anchors[i].clone().add(V3(0, 1, 0));
        const d = p0.distanceTo(p1);
        const sag = Math.max(0.2, (48 - d) * 0.35 + 1.2 + Math.sin(t * 0.21) * 0.6);
        const pts = []; for (let k = 0; k <= 14; k++) { const u = k / 14; tmpV.copy(p0).lerp(p1, u); tmpV.y -= Math.sin(u * Math.PI) * sag; pts.push(tmpV.clone()); }
        lines[i].geometry.dispose();
        lines[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.09, 4, false);
        if (!lines[i].geometry.attributes.color) { const n = lines[i].geometry.attributes.position.count; const c = new Float32Array(n * 3).fill(0.55); lines[i].geometry.setAttribute('color', new THREE.BufferAttribute(c, 3)); lines[i].geometry.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); }
      }
    });
    L.airship = mastTop.clone().add(V3(0, -2, 0)).addScaledVector(V3(Math.sin(baseYaw), 0, Math.cos(baseYaw)), -26);
    ctx.airship = ship;
    ctx.collider.addCyl(L.airship.x, L.airship.z, 14, mastTop.y - 18, mastTop.y + 10);
  }
  // lamp posts along the island road edge / dock
  for (let k = 0; k < 4; k++) { const p = W(-30 + k * 16, 0, 2); lampPost(b, mat(p.x, y0, p.z)); }
  // dockworkers' houses, tavern, customs house, cargo yard
  const hs = [[24, -22, 0.15, 9, 8, 2], [37, -12, -0.4, 8, 7, 2], [30, -36, 0.5, 8, 7, 1], [-42, 4, Math.PI / 2 + 0.1, 11, 9, 2], [0, -46, Math.PI, 10, 8, 2]];
  hs.forEach(([x, z, r, w, d, f], i) => {
    const Mh = mul(F, mat(x, 0, z, r));
    const info = house(b, Mh, w, d, f, rng, { roofRed: i % 2 === 0, balcony: i === 3, bigDoor: i === 4 });
    if (i === 3) { b.add('wood', G.box(1.4, 0.9, 0.1), mul(Mh, mat(w / 2 - 1, 3.4, 0.9)), 0x5a3e2a); b.add('gold', G.box(0.7, 0.45, 0.12), mul(Mh, mat(w / 2 - 1, 3.6, 0.95)), GOLD); for (let k = 0; k < 3; k++) { b.add('wood', G.box(2.0, 0.75, 0.9), mul(Mh, mat(-3 + k * 3, 0, 3.4)), 0x7a5c40); b.add('wood', G.box(2.0, 0.45, 0.4), mul(Mh, mat(-3 + k * 3, 0, 2.4)), 0x6a4e36); } }
    const c = W(x, 0, z); ctx.collider.addBox(c.x, y0 + 6, c.z, Math.max(w, d) / 2, 6, Math.max(w, d) / 2, 0);
  });
  ctx.flags.push({ pos: W(0, 14.5, -40), w: 3.2, h: 2.0, kind: 1 });
  b.add('wood', G.cyl(0.12, 0.16, 14, 6), mul(F, mat(0, 0, -40)), WOODD);
  for (let k = 0; k < 26; k++) {
    const x = 30 + rng.range(-9, 9), z = 6 + rng.range(-7, 7);
    const p = W(x, 0, z);
    const stack = rng.int(1, 3);
    for (let j = 0; j < stack; j++) {
      if (rng.chance(0.6)) { const sz = rng.range(1.0, 1.6); b.add('wood', G.box(sz, sz, sz), mat(p.x + rng.range(-0.2, 0.2), y0 + j * sz, p.z + rng.range(-0.2, 0.2), rng.next() * 3), rng.pick([0x9a7a54, 0x8a6a46, 0xa88a60, 0x7e6244])); }
      else b.add('wood', G.lathe([[0.001, 0], [0.42, 0.02], [0.5, 0.55], [0.42, 1.1], [0.001, 1.12]], 12, false), mat(p.x, y0 + j * 1.12, p.z), 0x7a5a3a);
    }
  }
  // hand cart
  { const Mc = mul(F, mat(22, 0, 14, 0.7)); b.add('wood', G.box(2.2, 0.5, 1.4), mul(Mc, mat(0, 0.9, 0)), 0x8a6a46); for (const sz of [-1, 1]) b.add('wood', G.torus(0.6, 0.08, 5, 14), mul(Mc, mat(0, 0.6, sz * 0.8)), 0x5e4a38); b.add('wood', G.box(2.4, 0.1, 0.1), mul(Mc, mat(1.9, 1.0, 0.5, 0, 1, 1, 1, 0, -0.3)), 0x5e4a38); b.add('wood', G.box(2.4, 0.1, 0.1), mul(Mc, mat(1.9, 1.0, -0.5, 0, 1, 1, 1, 0, -0.3)), 0x5e4a38); }
  // gravel paths: viaduct landing -> warehouse / pier
  for (const [ax, az, bx, bz] of [[0, -60, -8, -14], [0, -60, 14, 40], [14, 40, 14, 58]]) b.add('paving', G.box(1, 0.12, 3.2).translate(0.5, 0, 0), matSeg(W(ax, 0.08, az), W(bx, 0.08, bz)), 0xcdbf9f);
  L.harbor = W(0, 8, 10);
  b.build(scene, M, { glowSoft: { cast: false } });
}

// ---------------------------------------------------------------- MONASTERY with terraced vineyard
function buildMonastery(ctx, scene, M) {
  const b = new Batch('monastery'); const rng = new RNG(702);
  const s = SATS.monastery;
  const MC = V3(0, 0, -17); // mound centre (local)
  const plateauR = 22, rings = [[22, 27, 4.5], [27, 32, 3.0], [32, 37, 1.5]];
  const { F, W } = islandBase(ctx, 'monastery', b, rng, { keepOut: (x, z) => Math.hypot(x - MC.x, z - MC.z) < 39, trees: 6 });
  const y0 = s.y; const L = ctx.landmarks;
  // mound terraces (stacked cylinders with retaining walls)
  b.add('stone', G.cyl(plateauR, plateauR + 0.5, 6, 48), mul(F, mat(MC.x, 0, MC.z)), 0xc9bda3);
  b.add('grass', G.cylC(plateauR - 0.2, plateauR - 0.2, 0.2, 48), mul(F, mat(MC.x, 6.0, MC.z)), 0x7a8f45);
  for (const [r0, r1, h] of rings) {
    b.add('stone', G.cyl(r1, r1 + 0.4, h, 64), mul(F, mat(MC.x, 0, MC.z)), 0xc2b59a);
    const top = new THREE.RingGeometry(r0, r1 - 0.3, 64, 1); top.rotateX(-Math.PI / 2);
    b.add('grass', top, mul(F, mat(MC.x, h + 0.02, MC.z)), 0x8a7a50);
    // vine rows along contours (arc segments of trellis + foliage)
    const nRows = 2;
    for (let rr = 0; rr < nRows; rr++) {
      const rad = r0 + 1.6 + rr * 2.4;
      const n = Math.round(2 * Math.PI * rad / 3.0);
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI * 2;
        const lx = MC.x + Math.sin(a) * rad, lz = MC.z - Math.cos(a) * rad;
        if (lz < MC.z - 14 && Math.abs(lx - 6) < 3.5) continue; // path to the bridge
        const Mv = mul(F, mat(lx, h, lz, -a + Math.PI / 2));
        b.add('wood', G.box(0.12, 1.7, 0.12), mul(Mv, mat(-1.5, 0, 0)), WOODD);
        b.add('wood', G.box(3.0, 0.05, 0.05), mul(Mv, mat(0, 1.55, 0)), WOODD);
        b.add('foliage', new THREE.IcosahedronGeometry(0.75, 1).scale(2.0, 0.9, 0.55), mul(Mv, mat(0, 1.1, 0)), rng.pick([0x5f7d33, 0x6b8a38, 0x56722e]), { aux: () => [0.5, rng.next()] });
        if (rng.chance(0.35)) b.add('plain', new THREE.IcosahedronGeometry(0.18, 0).scale(1, 1.4, 1), mul(Mv, mat(rng.range(-1, 1), 0.75, 0.32)), 0x5a2a48);
      }
    }
  }
  // stair from bridge landing up the mound
  for (let k = 0; k < 30; k++) { const z = MC.z - 37 + k * 0.6; const y = Math.min(6, k * 0.2); b.add('stone', G.box(4.2, y + 0.2, 0.62), mul(F, mat(6, 0, z)), 0xd2c6ad); }
  const T = 6; // plateau height
  // cloister 18x18 with arcades and well
  const C = mul(F, mat(MC.x + 6, T, MC.z + 2));
  const cw = 20;
  arcade(b, mul(C, mat(0, 0, -cw / 2 + 3.6, 0)), cw - 7.2, 4.0, 3.2, 2.8, 0xa8603f);
  arcade(b, mul(C, mat(0, 0, cw / 2 - 3.6, Math.PI)), cw - 7.2, 4.0, 3.2, 2.8, 0xa8603f);
  arcade(b, mul(C, mat(cw / 2 - 3.6, 0, 0, -Math.PI / 2)), cw - 7.2, 4.0, 3.2, 2.8, 0xa8603f);
  arcade(b, mul(C, mat(-cw / 2 + 3.6, 0, 0, Math.PI / 2)), cw - 7.2, 4.0, 3.2, 2.8, 0xa8603f);
  for (const [x, z, r] of [[0, -cw / 2 + 1.2, 0], [0, cw / 2 - 1.2, Math.PI], [cw / 2 - 1.2, 0, -Math.PI / 2], [-cw / 2 + 1.2, 0, Math.PI / 2]]) {
    b.add('plaster', G.box(cw, 6.5, 2.6), mul(C, mat(x, 0, z, r)), 0xece2cf);
    b.add('roof', G.hipRoof(cw + 0.4, 2.6, 1.6, 0.4), mul(C, mat(x, 6.5, z, r)), 0xa8603f);
  }
  b.add('grass', G.box(cw - 13.5, 0.2, cw - 13.5), C, 0x6d9240);
  // well
  b.add('stone', G.cyl(1.2, 1.25, 1.0, 16), C, BASE); b.add('dark', G.cylC(0.95, 0.95, 0.05, 16), mul(C, mat(0, 1.0, 0)));
  for (const sx of [-1, 1]) b.add('wood', G.box(0.18, 2.6, 0.18), mul(C, mat(sx * 1.0, 1.0, 0)), WOODD);
  b.add('wood', G.box(2.3, 0.18, 0.18), mul(C, mat(0, 3.5, 0)), WOODD);
  b.add('roof', G.gableRoof(2.6, 2.0, 0.8, 0.15, 0.1), mul(C, mat(0, 3.6, 0)), 0xa8603f);
  b.add('wood', G.cyl(0.25, 0.22, 0.4, 8), mul(C, mat(0, 1.6, 0)), 0x6e5440);
  L.cloister = V3(0, 2, 0).applyMatrix4(C);
  // chapel (inner side) with apse and bell tower
  {
    const Ch = mul(F, mat(MC.x - 12.5, T, MC.z + 1, -Math.PI / 2)); // long axis along local z, apse toward the main island
    b.add('stone', G.box(18, 9.5, 9), mul(Ch, mat(0, 0, 0)), 0xe6dcc8);
    b.add('roof', G.gableRoof(18.6, 9, 4.2, 0.4, 0.2), mul(Ch, mat(0, 9.5, 0)), 0xa8603f);
    b.add('stone', G.gableWall(9, 4.2, 0.4), mul(Ch, mat(9.0, 9.5, 0)), 0xe6dcc8);
    b.add('stone', G.cyl(4.4, 4.4, 8, 16, false, 1), mul(Ch, mat(-9, 0, 0)), 0xe6dcc8);
    b.add('roof', G.lathe([[4.8, 0], [0.01, 3.2]], 16, true, Math.PI, Math.PI), mul(Ch, mat(-9, 8, 0)), 0xa8603f);
    for (let k = 0; k < 4; k++) for (const sz of [-1, 1]) windowOn(b, mul(Ch, mat(-6 + k * 4, 0, sz * 4.52, sz > 0 ? 0 : Math.PI)), 0, 3, 1.1, 3.0, rng, { arched: true });
    const Mf = mul(Ch, mat(9.02, 0, 0, Math.PI / 2));
    doorOn(b, Mf, 0, 2.2, 3.4, true);
    b.add('stone', new THREE.TorusGeometry(1.3, 0.22, 6, 20), mul(Mf, mat(0, 6.5, 0.1)), TRIM);
    b.add('stainedA', new THREE.CircleGeometry(1.25, 16), mul(Mf, mat(0, 6.5, 0.05)), 0x2c55a8);
    b.add('gold', G.box(0.18, 1.6, 0.18), mul(Ch, mat(9.2, 13.8, 0)), GOLD); b.add('gold', G.box(0.18, 0.18, 1.0), mul(Ch, mat(9.2, 14.8, 0)), GOLD);
    // bell tower (campanile)
    const Bt = mul(F, mat(MC.x - 12.5, T, MC.z - 14));
    b.add('stone', G.box(5, 15, 5), Bt, 0xe6dcc8);
    for (let f = 0; f < 4; f++) { const Mtf = mul(Bt, mat(0, 0, 0, f * Math.PI / 2), mat(0, 0, 2.52)); b.add('dark', G.box(1.6, 3.2, 0.2), mul(Mtf, mat(0, 15.6, 0))); b.add('stone', G.archRing(1.6, 0.25, 0.4, 'round', 8, 0), mul(Mtf, mat(0, 18.8, 0)), TRIM); }
    b.add('stone', G.box(5, 4.6, 5).translate(0, 0, 0), mul(Bt, mat(0, 15, 0)), 0xe6dcc8);
    b.add('bronze', G.lathe([[0.001, 0], [0.9, 0.02], [0.85, 0.2], [0.6, 0.7], [0.5, 1.3], [0.2, 1.5], [0.001, 1.52]], 14, false), mul(Bt, mat(0, 16.3, 0)), 0xb8823e);
    b.add('roof', G.pyramidRoof(5.6, 5.6, 4.2, 0.3), mul(Bt, mat(0, 19.6, 0)), 0xa8603f);
    b.add('gold', G.box(0.15, 1.4, 0.15), mul(Bt, mat(0, 23.6, 0)), GOLD);
    const bp = V3(0, 0, 0).applyMatrix4(Bt); ctx.collider.addBox(bp.x, y0 + T + 12, bp.z, 3, 13, 3, 0);
  }
  const cc = W(MC.x, 0, MC.z); ctx.collider.addCyl(cc.x, cc.z, 21, y0, y0 + T + 9);
  // press house at the foot of the slope (outer side)
  {
    const Pm = mul(F, mat(14, 0, 23, -0.3));
    house(b, Pm, 9, 7, 1, rng, { roofRed: true, bigDoor: true, hip: false });
    for (let k = 0; k < 4; k++) b.add('wood', G.cyl(0.6, 0.6, 1.2, 12).rotateZ(Math.PI / 2), mul(Pm, mat(-3 + k * 1.4, 0.6, 2.2)), 0x6e4f34);
    b.add('wood', G.cyl(1.1, 1.1, 1.0, 14), mul(Pm, mat(4.2, 0, 2.2)), 0x7a5a3c);
    L.pressHouse = V3(0, 3, 0).applyMatrix4(Pm);
  }
  L.monastery = W(MC.x, T + 3, MC.z);
  L.vineyard = W(MC.x + 18, 4, MC.z + 22);
  b.build(scene, M, { dark: { cast: false }, stainedA: { cast: false } });
}

// ---------------------------------------------------------------- WATERWHEEL island
function buildWheel(ctx, scene, M) {
  const b = new Batch('wheel'); const rng = new RNG(703);
  const { s, F, W } = islandBase(ctx, 'wheel', b, rng, { keepOut: (x, z) => Math.abs(x) < 30 && z < 12, trees: 6 });
  const y0 = s.y; const L = ctx.landmarks;
  // reservoir tank (round, elevated)
  const tankC = V3(16, 0, -10), tankR = 9, tankH = 21;
  b.add('stone', G.cyl(tankR, tankR + 0.8, tankH, 40), mul(F, mat(tankC.x, 0, tankC.z)), 0xd8ccb2);
  for (const yy of [6, 13, tankH - 0.8]) b.add('stone', G.cyl(tankR + 0.5, tankR + 0.5, 0.7, 40), mul(F, mat(tankC.x, yy, tankC.z)), TRIM);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.add('stone', G.box(1.4, tankH - 1, 1.4), mul(F, mat(tankC.x + Math.sin(a) * (tankR + 0.5), 0, tankC.z + Math.cos(a) * (tankR + 0.5), a)), 0xcfc2a6); }
  for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2; windowOn(b, mul(F, mat(tankC.x + Math.sin(a) * (tankR + 0.82), 8, tankC.z + Math.cos(a) * (tankR + 0.82), a)), 0, 0, 1.0, 2.2, rng, { arched: true, frame: false }); }
  ctx.wheelTank = { c: W(tankC.x, tankH - 0.9, tankC.z), r: tankR - 0.6, y: y0 + tankH - 0.9 };
  ctx.collider.addCyl(W(tankC.x, 0, tankC.z).x, W(tankC.x, 0, tankC.z).z, tankR + 1.5, y0, y0 + tankH + 1);
  L.wheelTank = W(tankC.x, tankH, tankC.z);
  // wheel pit with water channel
  const wc = V3(-9, 11.5, -4), wR = 13.5, wW = 4.2;
  b.add('stone', G.box(6.5, 2.6, 30), mul(F, mat(wc.x, -2.4, wc.z)), 0x9a8f7c);
  for (const sx of [-1, 1]) b.add('stone', G.box(0.8, 3.4, 30), mul(F, mat(wc.x + sx * 3.4, -2.4, wc.z)), STONE2);
  ctx.wheelPit = { a: W(wc.x, -0.6, wc.z - 15), b: W(wc.x, -0.6, wc.z + 15), w: 5.8 };
  // axle supports
  for (const sz of [-1, 1]) {
    b.add('stone', G.box(3, wc.y + 1.5, 2.4), mul(F, mat(wc.x, 0, wc.z + sz * (wW / 2 + 2.2))), STONE2);
    b.add('wood', G.box(3.4, 0.8, 3.0), mul(F, mat(wc.x, wc.y + 0.6, wc.z + sz * (wW / 2 + 2.2))), WOODD);
  }
  // trough from wheel top to the tank
  const trA = V3(wc.x + 3, wc.y + wR - 0.5, wc.z), trB = V3(tankC.x - tankR + 0.5, tankH - 0.6, tankC.z);
  {
    const a = trA.clone().applyMatrix4(F), c = trB.clone().applyMatrix4(F);
    b.add('wood', G.box(1, 0.3, 1.8).translate(0.5, 0, 0), matSeg(a, c), WOOD);
    for (const sd of [-1, 1]) b.add('wood', G.box(1, 0.8, 0.18).translate(0.5, 0.4, sd * 0.85), matSeg(a, c), WOOD);
    for (let k = 1; k < 4; k++) { const p = a.clone().lerp(c, k / 4); b.add('wood', G.box(0.4, p.y - y0, 0.4), mat(p.x, y0, p.z), WOODD); }
    ctx.wheelTrough = { a: a.clone().add(V3(0, 0.4, 0)), b: c.clone().add(V3(0, 0.4, 0)) };
  }
  // the wheel itself (animated)
  {
    const g = new THREE.Group();
    const wp = wc.clone().applyMatrix4(F);
    g.position.copy(wp);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(F));
    scene.add(g);
    const inner = new THREE.Group(); g.add(inner);
    const wb = new Batch('wheelRot');
    for (const sz of [-1, 1]) {
      wb.add('wood', G.torus(wR, 0.45, 6, 64), mat(0, 0, sz * wW / 2), WOOD);
      wb.add('wood', G.torus(wR - 2.2, 0.35, 6, 64), mat(0, 0, sz * wW / 2), WOOD);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; wb.add('wood', G.boxC(0.45, wR - 0.3, 0.45).translate(0, (wR - 0.3) / 2, 0), mul(mat(0, 0, sz * wW / 2), new THREE.Matrix4().makeRotationZ(a)), WOODD); }
    }
    // buckets / paddles
    const NB = 28;
    for (let k = 0; k < NB; k++) {
      const a = k / NB * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationZ(a);
      wb.add('wood', G.box(0.25, 2.3, wW + 0.4), mul(m, mat(0, wR - 2.3, 0)), 0x8a7052);
      wb.add('wood', G.box(1.3, 0.22, wW + 0.4), mul(m, mat(0.55, wR - 2.15, 0)), 0x8a7052);
    }
    wb.add('wood', G.cyl(1.0, 1.0, wW + 6, 12).rotateX(Math.PI / 2).translate(0, 0, -(wW + 6) / 2), mat(0, 0, 0), WOODD);
    wb.add('iron', G.cyl(1.5, 1.5, 0.6, 12).rotateX(Math.PI / 2), mat(0, 0, wW / 2 + 0.4), 0x3a3634);
    wb.add('iron', G.cyl(1.5, 1.5, 0.6, 12).rotateX(Math.PI / 2), mat(0, 0, -wW / 2 - 0.4), 0x3a3634);
    wb.build(inner, M);
    ctx.wheel = { group: g, inner, R: wR, W: wW, center: wp.clone(), omega: 0.16, nb: NB };
    ctx.updaters.push((t) => { inner.rotation.z = -t * 0.16; });
    ctx.collider.addCyl(wp.x, wp.z, wR + 1, y0 - 3, y0 + wc.y + wR + 1);
    L.wheel = wp.clone();
  }
  // pump house
  {
    const Pm = mul(F, mat(4, 0, 12, 0));
    house(b, Pm, 7, 6, 1, rng, { roofRed: false, hip: true });
    b.add('iron', G.cyl(0.35, 0.35, 8, 8).rotateZ(Math.PI / 2), mul(Pm, mat(-4, 1.2, -3)), 0x4a4440);
    b.add('stone', G.box(1.4, 3.6, 1.4), mul(Pm, mat(3.2, 3.2, -3)), 0xd9cbb0);
    L.pumpHouse = V3(0, 2, 0).applyMatrix4(Pm);
  }
  // spring rocks feeding the stream
  for (let k = 0; k < 5; k++) { const p = W(wc.x - 3 + rng.range(-3, 3), 0, wc.z - 17 - rng.next() * 3); b.add('rock', new THREE.IcosahedronGeometry(1.5 + rng.next() * 1.8, 1), mat(p.x, y0 + 0.3, p.z, rng.next() * 3), 0x8a7d6c, { aux: () => [0.6, 0] }); }
  L.wheelIsland = W(0, 10, 0);
  b.build(scene, M, {});
}

// ---------------------------------------------------------------- CLOCK TOWER island
function buildClock(ctx, scene, M) {
  const b = new Batch('clock'); const rng = new RNG(704);
  const { s, F, W } = islandBase(ctx, 'clock', b, rng, { keepOut: (x, z) => Math.hypot(x - 11, z + 2) < 14 || z < -28 || Math.hypot(x + 12, z - 14) < 9, trees: 6 });
  const y0 = s.y; const L = ctx.landmarks;
  const T = mul(F, mat(11, 0, -2));
  const sw = 7.6, bodyH = 22;
  b.add('stone', G.box(sw + 2, 1.6, sw + 2), T, BASE);
  b.add('stone', G.box(sw, bodyH, sw), T, 0xebe2cf);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('stone', G.box(0.9, bodyH, 0.9), mul(T, mat(sx * (sw / 2 - 0.1), 0, sz * (sw / 2 - 0.1))), TRIM);
  for (const yy of [7, 14]) b.add('stone', G.box(sw + 0.6, 0.45, sw + 0.6), mul(T, mat(0, yy, 0)), TRIM);
  const faceY = bodyH - 3.4;
  ctx.clockHands = ctx.clockHands || [];
  for (let f = 0; f < 4; f++) {
    const Mf = mul(T, mat(0, 0, 0, f * Math.PI / 2), mat(0, 0, sw / 2));
    windowOn(b, Mf, 0, 4, 1.0, 2.0, rng, { arched: true });
    windowOn(b, Mf, 0, 9.5, 1.0, 2.2, rng, { arched: true });
    const face = new THREE.CylinderGeometry(2.7, 2.7, 0.3, 36); face.rotateX(Math.PI / 2);
    b.add('stone', face, mul(Mf, mat(0, faceY, 0.15)), 0xf7f1e3);
    b.add('gold', G.torus(2.75, 0.22, 6, 36), mul(Mf, mat(0, faceY, 0.3)), GOLD);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.add('iron', G.box(0.16, 0.55, 0.06), mul(Mf, mat(Math.sin(a) * 2.25, faceY - 0.27 + Math.cos(a) * 2.25, 0.33), new THREE.Matrix4().makeRotationZ(-a)), 0x2a2622); }
    ctx.clockHands.push({ frame: mul(Mf, mat(0, faceY, 0.42)), r: 2.7 });
    b.add('stone', G.box(sw + 0.2, 0.4, 0.5), mul(Mf, mat(0, faceY + 3.3, 0.1)), TRIM);
  }
  // belfry with pointed arches
  const by = bodyH;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('stone', G.box(1.4, 7.4, 1.4), mul(T, mat(sx * (sw / 2 - 0.7), by, sz * (sw / 2 - 0.7))), 0xebe2cf);
  for (let f = 0; f < 4; f++) {
    const Mf = mul(T, mat(0, by, 0, f * Math.PI / 2), mat(0, 0, sw / 2 - 0.35));
    b.add('stone', G.wallWithOpenings(sw - 2.8, 7.4, 0.7, [{ x: 0, w: 3.4, sh: 3.4, y0: 0.9, type: 'pointed' }], 10), Mf, TRIM);
    pinnacle(b, mul(T, mat(0, by + 7.4, 0, f * Math.PI / 2), mat(sw / 2 - 0.5, 0, sw / 2 - 0.5)), 0.9, 4.5);
  }
  b.add('wood', G.box(sw - 2, 0.45, 0.6), mul(T, mat(0, by + 6.3, 0)), 0x6e5440);
  b.add('stone', G.box(sw + 0.8, 0.7, sw + 0.8), mul(T, mat(0, by + 7.4, 0)), TRIM);
  // spire + weather vane
  b.add('copper', G.rotY45(new THREE.ConeGeometry(sw * 0.66, 11, 4, 1, true)).translate(0, 5.5, 0), mul(T, mat(0, by + 8.1, 0)), COP);
  b.add('gold', new THREE.SphereGeometry(0.35, 8, 6), mul(T, mat(0, by + 19.2, 0)), GOLD);
  b.add('iron', G.cyl(0.06, 0.06, 2.6, 4), mul(T, mat(0, by + 19.2, 0)), 0x2a2622);
  b.add('iron', G.box(0.1, 0.1, 1.6), mul(T, mat(0, by + 20.6, 0)), 0x2a2622);
  b.add('gold', G.box(0.05, 0.7, 1.1), mul(T, mat(0, by + 20.9, 0.5)), GOLD);
  b.add('iron', G.box(0.9, 0.05, 0.05), mul(T, mat(0, by + 20.0, 0)), 0x2a2622); b.add('iron', G.box(0.05, 0.05, 0.9), mul(T, mat(0, by + 20.0, 0)), 0x2a2622);
  // swinging bell (animated)
  {
    const bg = new THREE.Group();
    const bp = V3(0, by + 6.0, 0).applyMatrix4(T);
    bg.position.copy(bp); bg.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(T));
    scene.add(bg);
    const bell = new THREE.Group(); bg.add(bell);
    const bb = new Batch('bell');
    bb.add('bronze', G.lathe([[0.001, 0], [1.25, 0.03], [1.2, 0.3], [0.85, 1.0], [0.75, 1.9], [0.35, 2.15], [0.001, 2.18]], 18, false), mat(0, -2.4, 0), 0xb8823e);
    bb.add('iron', G.cyl(0.1, 0.1, 1.6, 6), mat(0, -2.3, 0), 0x2a2622);
    bb.add('iron', new THREE.SphereGeometry(0.28, 8, 6), mat(0, -2.35, 0), 0x2a2622);
    bb.build(bell, M);
    const hammer = new THREE.Group(); bg.add(hammer);
    const hb = new Batch('hammer');
    hb.add('wood', G.box(0.18, 1.6, 0.18).translate(0, -0.8, 0), mat(0, 0, 0), 0x6e5440);
    hb.add('iron', G.box(0.5, 0.5, 0.5), mat(0, -1.8, 0), 0x2a2622);
    hb.build(hammer, M);
    hammer.position.set(1.6, -0.4, 0);
    ctx.updaters.push((t) => {
      const ph = eventPhase('bell', t);
      let a = 0, h = 0;
      if (ph >= 0 && ph < 10) {
        const env = Math.sin(Math.min(1, ph / 9) * Math.PI);
        a = Math.sin(ph * 2.6) * 0.42 * env;
        h = Math.max(0, Math.sin(ph * 2.6 + 1.2)) * 0.5 * env;
      }
      bell.rotation.z = a; hammer.rotation.z = -0.3 - h;
    });
    ctx.clockBell = bp.clone();
  }
  // small gatehouse at the bridge end (inner side) - also the suspension bridge's island tower
  {
    const Gm = mul(F, mat(0, 0, -s.R + 7));
    const gw = 13, gd = 9, gh = 27;
    const sh = new THREE.Shape(); sh.moveTo(-gw / 2, 0); sh.lineTo(gw / 2, 0); sh.lineTo(gw / 2, gh); sh.lineTo(-gw / 2, gh); sh.lineTo(-gw / 2, 0);
    const hole = new THREE.Path(); const tmp = new THREE.Path(); G.roundArchPath(tmp, 5, 5.5, 0, 12); const pts = tmp.getPoints(); hole.moveTo(pts[0].x, pts[0].y + 2); for (let k = 1; k < pts.length; k++) hole.lineTo(pts[k].x, pts[k].y + 2);
    sh.holes.push(hole);
    const gm = G.extrude(sh, gd, 0, 12); gm.rotateY(Math.PI / 2);
    b.add('stone', gm, mul(Gm, mat(0, 0, 0, Math.PI / 2)), 0xe6dcc8);
    b.add('stone', G.box(gw + 1, 0.8, gd + 1), mul(Gm, mat(0, gh, 0)), TRIM);
    b.add('copper', G.rotY45(new THREE.ConeGeometry(gw * 0.68, 7, 4, 1, true)).translate(0, 3.5, 0), mul(Gm, mat(0, gh + 0.8, 0)), COP);
    for (let k = -2; k <= 2; k++) for (const zz of [-1, 1]) b.add('stone', G.box(1.2, 1.4, 0.8), mul(Gm, mat(k * 2.4, gh - 0.6, zz * (gd / 2 - 0.4))), STONE);
    ctx.flags.push({ pos: V3(0, gh + 12.5, 0).applyMatrix4(Gm), w: 3.6, h: 2.2, kind: 2 });
    b.add('iron', G.cyl(0.07, 0.07, 5, 5), mul(Gm, mat(0, gh + 7.6, 0)), 0x333030);
    ctx.clockGate = { top: V3(0, gh - 1, 0).applyMatrix4(Gm), deck: V3(0, 2.2, 0).applyMatrix4(Gm), frame: Gm };
    const gp = V3(0, 0, 0).applyMatrix4(Gm); ctx.collider.addBox(gp.x, y0 + gh / 2, gp.z, gw / 2 + 1, gh / 2 + 1, gd / 2 + 1, -outRot(s.th));
  }
  const tp = V3(0, 0, 0).applyMatrix4(T); ctx.collider.addBox(tp.x, y0 + 22, tp.z, sw / 2 + 1.2, 22, sw / 2 + 1.2, -outRot(s.th));
  // keeper cottages and a walled garden around the clock tower
  for (const [x, z, r, w, d] of [[-20, -16, 0.6, 8, 7], [26, -16, -0.5, 9, 7], [-26, 2, 1.7, 7, 6]]) {
    const Mh = mul(F, mat(x, 0, z, r)); house(b, Mh, w, d, 2, rng, { roofRed: true });
    const c = W(x, 0, z); ctx.collider.addBox(c.x, y0 + 6, c.z, w / 2 + 1, 6, w / 2 + 1, 0);
  }
  { const Gm = mul(F, mat(-12, 0, 14, 0)); for (const [x, z, l, r] of [[0, -6, 12, 0], [0, 6, 12, 0], [-6, 0, 12, Math.PI / 2], [6, 0, 12, Math.PI / 2]]) b.add('stone', G.box(l, 1.1, 0.5), mul(Gm, mat(x, 0, z, r)), STONE2); for (let k = 0; k < 6; k++) flowerBush(b, ...V3(rng.range(-4, 4), 0, rng.range(-4, 4)).applyMatrix4(Gm).toArray(), 0.8, rng); oliveTree(b, ...V3(0, 0, 0).applyMatrix4(Gm).toArray(), 0.8, rng); }
  for (let k = 0; k < 4; k++) { const p = W(-10 + k * 7, 0, 12); lampPost(b, mat(p.x, y0, p.z)); }
  L.clockTower = V3(0, faceY, 0).applyMatrix4(T);
  L.clockTowerTop = V3(0, by + 12, 0).applyMatrix4(T);
  ctx.clockTowerFrame = T;
  b.build(scene, M, { dark: { cast: false } });
}

// ---------------------------------------------------------------- RUINS island
function buildRuins(ctx, scene, M) {
  const b = new Batch('ruins'); const rng = new RNG(705);
  const { s, F, W } = islandBase(ctx, 'ruins', b, rng, { keepOut: (x, z) => Math.abs(x) < 24 && Math.abs(z + 4) < 16, trees: 8, grassCol: 0x6f8a3a });
  const y0 = s.y; const L = ctx.landmarks;
  const Tm = mul(F, mat(0, 0, -4, 0.06));
  const len = 34, wid = 18;
  // stylobate (3 steps), cracked
  for (let k = 0; k < 3; k++) b.add('stone', G.box(len + 4 - k * 1.4, 0.55, wid + 4 - k * 1.4), mul(Tm, mat(0, k * 0.55, 0)), k % 2 ? 0xd2c6ad : 0xc9bc9f);
  const top = 1.65;
  const colH = 9.5, colR = 0.62;
  const nx = 10, nz = 5;
  const colPos = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    colPos.push([-len / 2 + 1.2 + i * (len - 2.4) / (nx - 1), -wid / 2 + 1.2 + j * (wid - 2.4) / (nz - 1)]);
  }
  const standing = [];
  colPos.forEach(([x, z], idx) => {
    const r = perlin3(x * 0.15, z * 0.15, 3.3);
    const keep = x < 2 ? r > -0.25 : r > 0.25;
    if (keep) {
      b.add('marble', G.column(colH, colR, 12, 'doric'), mul(Tm, mat(x, top, z)), 0xddd2bc);
      standing.push([x, z]);
    } else {
      const h = 0.8 + rng.next() * 3.2;
      b.add('marble', G.cyl(colR * 0.95, colR * 1.05, h, 12), mul(Tm, mat(x, top, z)), 0xd6cab2);
      // fallen drums nearby
      if (rng.chance(0.7)) {
        const ang = rng.next() * Math.PI * 2; const dist = 2.5 + rng.next() * 4;
        for (let k = 0; k < 3; k++) {
          const g = G.cylC(colR * 0.95, colR * 0.95, 1.6, 12); g.rotateZ(Math.PI / 2);
          b.add('marble', g, mul(Tm, mat(x + Math.cos(ang) * (dist + k * 1.7), top - (dist > 3 ? 1.6 : 0) + colR * 0.9, z + Math.sin(ang) * (dist + k * 1.7), -ang, 1, 1, 1, 0, rng.range(-0.1, 0.1))), 0xd6cab2);
        }
      }
    }
  });
  // entablature over standing columns along the west end
  for (const zz of [-wid / 2 + 1.2, wid / 2 - 1.2]) b.add('marble', G.box(len * 0.45, 1.3, 1.6), mul(Tm, mat(-len / 2 + len * 0.22, top + colH, zz)), 0xddd2bc);
  b.add('marble', G.box(1.6, 1.3, wid - 1), mul(Tm, mat(-len / 2 + 1.2, top + colH, 0)), 0xddd2bc);
  b.add('marble', G.box(len * 0.45 + 0.6, 0.6, 2.0), mul(Tm, mat(-len / 2 + len * 0.22, top + colH + 1.3, -wid / 2 + 1.2)), TRIM);
  // half of a pediment still standing on the west end
  const ped = new THREE.Shape(); ped.moveTo(-wid / 2, 0); ped.lineTo(0, 3.6); ped.lineTo(2.2, 2.4); ped.lineTo(1.0, 1.6); ped.lineTo(2.0, 0); ped.lineTo(-wid / 2, 0);
  b.add('marble', G.extrude(ped, 1.4, 0, 2).rotateY(Math.PI / 2), mul(Tm, mat(-len / 2 + 1.2, top + colH + 1.3, 0)), 0xd8ccb5);
  // broken pediment piece lying in the grass
  const ped2 = new THREE.Shape(); ped2.moveTo(0, 0); ped2.lineTo(7, 0); ped2.lineTo(0, 2.8); ped2.lineTo(0, 0);
  b.add('marble', G.extrude(ped2, 1.3, 0, 2), mul(Tm, mat(len / 2 + 4, 0.7, wid / 2 + 5, 0.6), new THREE.Matrix4().makeRotationX(-1.35)), 0xd3c7ae);
  // scattered capitals and blocks
  for (let k = 0; k < 12; k++) {
    const p = W(rng.range(-26, 26), 0, rng.range(-24, 18));
    const g = rng.chance(0.5) ? G.box(1.6, 0.6, 1.6) : G.lathe([[0.55, 0], [0.8, 0.25], [1.0, 0.45], [1.0, 0.6], [0.001, 0.6]], 10, false);
    b.add('marble', g, mat(p.x, y0 + 0.05, p.z, rng.next() * 3, 1, 1, 1, rng.range(-0.3, 0.3)), 0xd3c7ae);
  }
  // vines & small trees growing from cracks
  for (const [x, z] of standing.slice(0, 8)) { const p = V3(x, top + colH, z).applyMatrix4(Tm); vineStrip(b, p, V3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(Tm)), 3 + rng.next() * 5, 0.9, rng); }
  for (let k = 0; k < 6; k++) { const p = V3(rng.range(-len / 2, len / 2), top, rng.range(-wid / 2, wid / 2)).applyMatrix4(Tm); if (rng.chance(0.5)) oliveTree(b, p.x, p.y, p.z, 0.55, rng); else shrub(b, p.x, p.y, p.z, 1.0, rng); }
  // wooden scaffolding on the east end with hoisted block
  {
    const Sm = mul(Tm, mat(len / 2 - 2.5, top, 0));
    const xs = [-2.5, 1.2], zs = [-6, -2, 2, 6];
    for (const x of xs) for (const z of zs) b.add('wood', G.box(0.28, 13, 0.28), mul(Sm, mat(x, 0, z)), WOOD);
    for (const yy of [4, 8, 12]) for (const x of xs) b.add('wood', G.box(0.22, 0.22, 12.6), mul(Sm, mat(x, yy, 0)), WOOD);
    for (const yy of [4, 8]) b.add('wood', G.box(4.0, 0.14, 12.2), mul(Sm, mat(-0.65, yy + 0.12, 0)), 0x9a8060);
    for (const z of [-6, 2]) b.add('wood', G.box(1, 0.18, 0.18).translate(0.5, 0, 0), matSeg(V3(-2.5, 0.3, z).applyMatrix4(Sm), V3(-2.5, 7.8, z + 4).applyMatrix4(Sm)), WOOD);
    // tools on platforms
    b.add('wood', G.box(0.9, 0.5, 0.6), mul(Sm, mat(-1.2, 4.26, -3)), 0x7a5c40);
    b.add('iron', G.box(0.14, 0.14, 0.9), mul(Sm, mat(-0.4, 4.4, -2.0, 0.5)), 0x3a3634);
    b.add('wood', G.box(0.07, 0.07, 1.2), mul(Sm, mat(-0.2, 4.36, -1.0, -0.4)), 0x8a6a4c);
    b.add('iron', G.box(0.35, 0.2, 0.2), mul(Sm, mat(-0.2, 4.36, -0.45, -0.4)), 0x3a3634);
    b.add('wood', G.cyl(0.3, 0.3, 0.6, 8), mul(Sm, mat(0.4, 8.26, 3)), 0x7a5c40);
    // pulley beam + hoisted stone block
    b.add('wood', G.box(0.3, 0.3, 6), mul(Sm, mat(4.5, 12.3, 0, Math.PI / 2)), WOOD);
    b.add('wood', G.box(1, 0.25, 0.25).translate(0.5, 0, 0), matSeg(V3(1.2, 12.4, 0).applyMatrix4(Sm), V3(5.8, 12.4, 0).applyMatrix4(Sm)), WOOD);
    b.add('iron', G.cyl(0.35, 0.35, 0.25, 10).rotateX(Math.PI / 2), mul(Sm, mat(5.6, 12.1, 0)), 0x3a3634);
    b.add('rope', G.cyl(0.05, 0.05, 5.2, 4), mul(Sm, mat(5.6, 6.9, 0)), 0xb9a27c);
    b.add('marble', G.box(1.6, 1.0, 1.1), mul(Sm, mat(5.6, 5.9, 0, 0.2)), 0xd6cab2);
    L.scaffold = V3(1, 7, 0).applyMatrix4(Sm);
  }
  const tc = V3(0, 0, 0).applyMatrix4(Tm); ctx.collider.addBox(tc.x, y0 + 6, tc.z, len / 2 + 3, 6.5, wid / 2 + 2, -outRot(s.th) - 0.06);
  L.ruins = V3(0, 6, 0).applyMatrix4(Tm);
  b.build(scene, M, {});
}

// ---------------------------------------------------------------- LIGHTHOUSE island
function buildLighthouse(ctx, scene, M) {
  const b = new Batch('lighthouse'); const rng = new RNG(706);
  const { s, F, W } = islandBase(ctx, 'lighthouse', b, rng, { keepOut: (x, z) => Math.hypot(x, z - 4) < 9 || Math.hypot(x - 13, z + 8) < 8, trees: 5 });
  const y0 = s.y; const L = ctx.landmarks;
  const Lm = mul(F, mat(0, 0, 4));
  b.add('stone', G.cyl(5.8, 6.2, 3.5, 8), mul(Lm, mat(0, 0, 0, Math.PI / 8)), STONE2);
  b.add('stone', G.cyl(6.2, 6.2, 0.5, 8), mul(Lm, mat(0, 3.5, 0, Math.PI / 8)), TRIM);
  const H = 38, n = 12;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const r0 = 4.6 - t0 * 1.5, r1 = 4.6 - t1 * 1.5;
    b.add(k % 2 ? 'plaster' : 'plaster', G.cyl(r1, r0, H / n, 28), mul(Lm, mat(0, 4 + t0 * H, 0)), k % 2 ? 0xb4553e : 0xf2ece0);
  }
  for (let k = 0; k < 5; k++) { const a = k * 1.3; windowOn(b, mul(Lm, mat(Math.sin(a) * (4.4 - k * 0.3), 8 + k * 6.5, Math.cos(a) * (4.4 - k * 0.3), a)), 0, 0, 0.7, 1.3, rng, { frame: false, arched: true }); }
  doorOn(b, mul(Lm, mat(0, 0, 6.0)), 0, 1.4, 2.4, true);
  // gallery
  const gy = 4 + H;
  b.add('stone', G.cyl(4.6, 3.3, 1.2, 28), mul(Lm, mat(0, gy - 1.2, 0)), TRIM);
  b.add('stone', G.cyl(4.6, 4.6, 0.4, 28), mul(Lm, mat(0, gy, 0)), TRIM);
  for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; b.add('iron', G.box(0.06, 1.1, 0.06), mul(Lm, mat(Math.sin(a) * 4.4, gy + 0.4, Math.cos(a) * 4.4)), 0x2f2c2a); }
  b.add('iron', G.torus(4.4, 0.06, 4, 32).rotateX(Math.PI / 2), mul(Lm, mat(0, gy + 1.5, 0)), 0x2f2c2a);
  // lantern room (glowing glass) + copper dome
  b.add('stone', G.cyl(2.9, 2.9, 1.0, 16), mul(Lm, mat(0, gy + 0.4, 0)), STONE2);
  b.add('lamp', G.cyl(2.6, 2.6, 4.2, 16), mul(Lm, mat(0, gy + 1.4, 0)), 0xffffff);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.add('iron', G.box(0.14, 4.2, 0.14), mul(Lm, mat(Math.sin(a) * 2.65, gy + 1.4, Math.cos(a) * 2.65)), 0x2f2c2a); }
  b.add('copper', G.lathe(G.domeProfile(3.1, 3.0, 10, 'round'), 24), mul(Lm, mat(0, gy + 5.6, 0)), COP);
  b.add('gold', G.cyl(0.15, 0.25, 1.4, 6), mul(Lm, mat(0, gy + 8.4, 0)), GOLD);
  b.add('gold', new THREE.SphereGeometry(0.35, 8, 6), mul(Lm, mat(0, gy + 9.9, 0)), GOLD);
  const lampPos = V3(0, gy + 3.5, 0).applyMatrix4(Lm);
  ctx.lighthouseLamp = lampPos;
  const lp = V3(0, 0, 0).applyMatrix4(Lm); ctx.collider.addCyl(lp.x, lp.z, 6.5, y0, gy + 10);
  L.lighthouse = V3(0, gy, 0).applyMatrix4(Lm);
  // keeper's hut with laundry and ladder
  const Hm = mul(F, mat(13, 0, -8, 0.4));
  house(b, Hm, 7, 5.5, 1, rng, { roofRed: true, hip: false, balcony: false });
  b.add('wood', G.box(0.12, 4.2, 0.12), mul(Hm, mat(-2.6, 0, 0.6, 0, 1, 1, 1, -0.28)), 0x8a6a4c);
  b.add('wood', G.box(0.12, 4.2, 0.12), mul(Hm, mat(-3.3, 0, 0.6, 0, 1, 1, 1, -0.28)), 0x8a6a4c);
  for (let k = 0; k < 9; k++) b.add('wood', G.box(0.8, 0.08, 0.08), mul(Hm, mat(-2.95, 0.4 + k * 0.42, 0.6 + k * 0.12)), 0x8a6a4c);
  const p1 = V3(-6, 0, 6).applyMatrix4(Hm), p2 = V3(4, 0, 9).applyMatrix4(Hm);
  b.add('wood', G.box(0.14, 2.6, 0.14), mat(p1.x, y0, p1.z), 0x8a6a4c); b.add('wood', G.box(0.14, 2.6, 0.14), mat(p2.x, y0, p2.z), 0x8a6a4c);
  const la = p1.clone().setY(y0 + 2.5), lb = p2.clone().setY(y0 + 2.5);
  b.add('rope', G.tube([la, la.clone().lerp(lb, 0.5).add(V3(0, -0.3, 0)), lb], 0.03, 3, 10), null, 0xd8ceb8);
  const clothes = [0xf2f0ea, 0x6d8cb8, 0xc85a4a, 0xe8d8a0, 0xffffff, 0x7aa070];
  for (let k = 0; k < 6; k++) {
    const u = (k + 0.7) / 7; const p = la.clone().lerp(lb, u); p.y -= Math.sin(u * Math.PI) * 0.3;
    const g = G.box(0.9, 1.0 + rng.next() * 0.4, 0.04); g.translate(0, -0.55, 0);
    b.add('fabricSway', g, mat(p.x, p.y, p.z, Math.atan2(lb.x - la.x, lb.z - la.z) + Math.PI / 2), clothes[k], { aux: (x, y) => [Math.min(1, (p.y - y) * 0.9), k * 0.17] });
  }
  L.keeperHut = V3(0, 3, 0).applyMatrix4(Hm);
  b.build(scene, M, { lamp: { cast: false } });
}

export function buildSatellites(ctx) {
  const { scene, M } = ctx;
  buildHarbor(ctx, scene, M);
  buildMonastery(ctx, scene, M);
  buildWheel(ctx, scene, M);
  buildClock(ctx, scene, M);
  buildRuins(ctx, scene, M);
  buildLighthouse(ctx, scene, M);
}
