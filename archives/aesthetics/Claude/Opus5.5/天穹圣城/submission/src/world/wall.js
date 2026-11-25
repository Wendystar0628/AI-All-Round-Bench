import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { MAIN, CLK, P, angDist, outRot, dirOf } from './layout.js';
import { addStatue } from './statues.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const WALL_COL = 0xe6dcc6, WALL_COL2 = 0xd8ccb2, TRIM = 0xefe6d2;

// round tower with corbelled battlement, conical copper roof, finial and a flag
export function roundTower(b, ctx, x, y0, z, r, h, opts = {}) {
  const roofH = opts.roofH || r * 1.75;
  b.add('stone', G.cyl(r * 1.06, r * 1.14, 3, 28), mat(x, y0, z), WALL_COL2);            // batter
  b.add('stone', G.cyl(r, r, h, 28, false, 3), mat(x, y0, z), WALL_COL);
  b.add('stone', G.cyl(r + 0.35, r + 0.35, 0.6, 28), mat(x, y0 + h * 0.45, z), TRIM);   // string course
  // corbel ring + parapet
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; b.add('stone', G.box(0.7, 1.1, 1.3), mat(x + Math.sin(a) * (r + 0.4), y0 + h - 0.6, z - Math.cos(a) * (r + 0.4), -a), TRIM); }
  b.add('stone', G.cyl(r + 0.9, r + 0.9, 2.0, 28, true), mat(x, y0 + h + 0.5, z), WALL_COL);
  b.add('stone', G.cyl(r + 0.9, r + 0.7, 0.5, 28), mat(x, y0 + h + 0.3, z), TRIM);
  // arrow slits
  for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + (opts.slitRot || 0) + k * 0.4;
    b.add('dark', G.box(0.35, 2.2, 0.3), mat(x + Math.sin(a) * (r + 0.02), y0 + h * (0.35 + k * 0.33), z - Math.cos(a) * (r + 0.02), -a));
  }
  // roof
  if (!opts.noRoof) {
    b.add('copper', G.cone(r + 1.3, roofH, 28), mat(x, y0 + h + 1.4, z), 0x5f9f8d);
    b.add('gold', G.cyl(0.25, 0.4, 1.4, 8), mat(x, y0 + h + 1.4 + roofH - 0.4, z), 0xe8bd62);
    b.add('gold', new THREE.SphereGeometry(0.55, 10, 8), mat(x, y0 + h + 1.4 + roofH + 1.2, z), 0xe8bd62);
    b.add('iron', G.cyl(0.08, 0.08, 6, 5), mat(x, y0 + h + roofH + 1.4, z), 0x333030);
    if (ctx.flags) ctx.flags.push({ pos: V3(x, y0 + h + roofH + 7.2, z), w: opts.flagW || 4.2, h: opts.flagH || 2.6, kind: opts.flagKind ?? 0 });
  }
  if (ctx.collider) ctx.collider.addCyl(x, z, r + 1, y0 - 5, y0 + h + roofH);
}

export function buildWall(ctx) {
  const { scene, M, collider } = ctx;
  const b = new Batch('wall');
  const rng = new RNG(202);
  const R = MAIN.wallR, T = MAIN.wallT, H = MAIN.wallTop;
  const towerHours = [1, 3, 4, 5, 7, 9, 10.75, 11];
  const towers = towerHours.map(CLK);
  const GATE = Math.PI;
  const gaps = [
    { th: GATE, hw: 0.075 },              // main gatehouse
    { th: CLK(8), hw: 0.045 },            // harbor viaduct gatehouse
    { th: CLK(2), hw: 0.045 },            // suspension bridge tower
  ];
  for (const t of towers) gaps.push({ th: t, hw: 0.028 });
  const inGap = (th) => gaps.some((g) => angDist(th, g.th) < g.hw);

  // ---- wall segments ----
  const NS = 240;
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2, am = (a0 + a1) / 2;
    if (inGap(am)) continue;
    const len = 2 * R * Math.sin((a1 - a0) / 2) + 0.15;
    const ry = outRot(am);
    const c = P(R, am, 0);
    b.add('stone', G.box(len, H, T), mat(c.x, 0, c.z, ry), WALL_COL);
    const cb = P(R + 1.2, am, 0);
    b.add('stone', G.box(len, 3.2, T + 2.4), mat(cb.x, -1.5, cb.z, ry), WALL_COL2); // batter / foundation
    const f = P(R + 1.4, am, 0);
    b.add('stone', G.box(len, 2.2, 1.2), mat(f.x, -4.5, f.z, ry), 0xb9ae98); // ancient footing course
    // walkway paving
    b.add('paving', G.box(len, 0.25, T - 1.2), mat(c.x, H, c.z, ry), 0xd9cfba);
    // outer parapet & merlons
    const po = P(R + T / 2 - 0.45, am, 0);
    b.add('stone', G.box(len, 1.5, 0.9), mat(po.x, H, po.z, ry), WALL_COL);
    b.add('stone', G.box(len, 0.35, 1.25), mat(po.x, H + 1.5, po.z, ry), TRIM);
    const nm = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k < nm; k++) {
      const t = (k + 0.5) / nm; const a = a0 + (a1 - a0) * t;
      const pm = P(R + T / 2 - 0.45, a, 0);
      b.add('stone', G.box(1.3, 1.7, 0.9), mat(pm.x, H + 1.85, pm.z, outRot(a)), WALL_COL);
    }
    // machicolation corbels and string course on the outer face
    const sc = P(R + T / 2 + 0.2, am, 0);
    b.add('stone', G.box(len, 0.55, 0.6), mat(sc.x, H - 2.2, sc.z, ry), TRIM);
    for (let k = 0; k < 3; k++) { const a = a0 + (a1 - a0) * (k + 0.5) / 3; const pc = P(R + T / 2 + 0.25, a, 0); b.add('stone', G.box(0.6, 1.2, 0.7), mat(pc.x, H - 1.2, pc.z, outRot(a)), TRIM); }
    // inner low parapet
    const pi = P(R - T / 2 + 0.3, am, 0);
    b.add('stone', G.box(len, 1.0, 0.55), mat(pi.x, H, pi.z, ry), WALL_COL);
    // buttresses every other segment (outer face)
    if (i % 3 === 0) {
      const pb = P(R + T / 2 + 1.1, am, 0);
      b.add('stone', G.box(2.4, H - 4, 2.2), mat(pb.x, -2, pb.z, ry), WALL_COL2);
      b.add('stone', G.box(2.4, 1.2, 1.4), mat(P(R + T / 2 + 0.7, am).x, H - 6, P(R + T / 2 + 0.7, am).z, ry), TRIM);
    }
    // a few small windows/loopholes on the inner face (guard rooms)
    if (i % 5 === 2) { const pw = P(R - T / 2 - 0.02, am, 0); b.add('dark', G.box(0.9, 1.6, 0.2), mat(pw.x, 8, pw.z, ry)); }
    collider.addBox(c.x, H / 2 + 1, c.z, len / 2, H / 2 + 2.5, T / 2 + 1.5, -ry);
  }

  // ---- round towers ----
  towers.forEach((th, i) => {
    const p = P(R + 1.8, th, 0);
    roundTower(b, ctx, p.x, -2, p.z, 7.2, 27 + (i % 2) * 3, { slitRot: th, flagKind: i % 3 });
  });

  // ---- main gate ----
  {
    const th = GATE, gc = P(R, th, 0);
    const ry = outRot(th);
    const gw = 26, gd = 15, gh = 23;
    const sh = new THREE.Shape(); sh.moveTo(-gw / 2, 0); sh.lineTo(gw / 2, 0); sh.lineTo(gw / 2, gh); sh.lineTo(-gw / 2, gh); sh.lineTo(-gw / 2, 0);
    const hole = new THREE.Path(); G.roundArchPath(hole, 7.5, 9.0, 0, 14);
    const hp = hole.getPoints(); const hh = new THREE.Path(); hh.moveTo(hp[0].x, hp[0].y + 3); for (let k = 1; k < hp.length; k++) hh.lineTo(hp[k].x, hp[k].y + 3);
    sh.holes.push(hh);
    const gm = mul(mat(gc.x, 0, gc.z, ry), mat(0, 0, 0));
    b.add('stone', G.extrude(sh, gd, 0, 14), gm, WALL_COL);
    // gate floor & inner doors
    b.add('paving', G.box(7.4, 0.3, gd + 0.2), mul(gm, mat(0, 2.85, 0)), 0xd4c9b2);
    for (const s of [-1, 1]) {
      const door = G.box(3.6, 9.5, 0.4);
      b.add('wood', door, mul(gm, mat(s * 3.5, 3.1, -gd / 2 + 1.0, s * -1.25), mat(-s * 1.8, 0, 0)), 0x6e4f34);
      for (let k = 0; k < 4; k++) b.add('iron', G.box(3.62, 0.18, 0.45), mul(gm, mat(s * 3.5, 3.1, -gd / 2 + 1.0, s * -1.25), mat(-s * 1.8, 1.4 + k * 2.4, 0)), 0x2e2b28);
    }
    // arch voussoirs + keystone on the outer face
    b.add('stone', G.archRing(7.5, 1.3, 1.2, 'round', 16, 0), mul(gm, mat(0, 12, gd / 2 + 0.4)), TRIM);
    b.add('stone', G.archRing(9.9, 0.6, 1.0, 'round', 16, 0), mul(gm, mat(0, 12, gd / 2 + 0.6)), TRIM);
    b.add('stone', G.box(1.6, 2.4, 1.6), mul(gm, mat(0, 15.4, gd / 2 + 0.6)), TRIM);
    // relief panel above the arch (lintel relief): frame + medallion + two kneeling figures
    b.add('stone', G.box(15, 5.2, 0.7), mul(gm, mat(0, 16.6, gd / 2 + 0.3)), TRIM);
    b.add('stone', G.box(13.6, 4.2, 0.5), mul(gm, mat(0, 17.1, gd / 2 + 0.55)), WALL_COL2);
    const med = new THREE.CylinderGeometry(1.7, 1.7, 0.7, 24); med.rotateX(Math.PI / 2);
    b.add('gold', med, mul(gm, mat(0, 19.2, gd / 2 + 1.0)), 0xe2b85e);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.add('gold', G.box(0.25, 1.0, 0.3), mul(gm, mat(Math.cos(a) * 2.3, 19.2 + Math.sin(a) * 2.3, gd / 2 + 1.0), new THREE.Matrix4().makeRotationZ(a - Math.PI / 2)), 0xe2b85e); }
    for (const s of [-1, 1]) {
      addStatue(b, mul(gm, mat(s * 4.6, 15.2, gd / 2 + 0.9, s * -0.9), new THREE.Matrix4().makeScale(1, 0.9, 0.55)), 3.3, 'pray', 'marble', 30 + s, 0xe9e0cd);
      for (let k = 0; k < 3; k++) b.add('stone', G.box(0.6, 3.6, 0.4), mul(gm, mat(s * (7.4 + k * 1.6 - 0.0), 15.4, gd / 2 + 0.55)), TRIM);
    }
    // battlements on gatehouse
    for (let k = -5; k <= 5; k++) b.add('stone', G.box(1.4, 1.8, 1.0), mul(gm, mat(k * 2.4, gh, gd / 2 - 0.5)), WALL_COL);
    b.add('stone', G.box(gw + 1, 0.6, gd + 1), mul(gm, mat(0, gh - 0.6, 0)), TRIM);
    // flanking gate towers
    for (const s of [-1, 1]) {
      const tp = new THREE.Vector3().setFromMatrixPosition(mul(gm, mat(s * (gw / 2 + 5.5), 0, 2)));
      roundTower(b, ctx, tp.x, -2, tp.z, 7.0, 33, { roofH: 15, slitRot: th, flagKind: 1, flagW: 5, flagH: 3 });
    }
    // outer platform with steps down and balustrade, corbelled over the rim
    const op = P(R + 15, th, 0);
    b.add('paving', G.cylC(16, 16, 1.2, 40), mat(op.x, -0.3, op.z), 0xd2c7b0);
    b.add('stone', G.cyl(9, 15.6, 9, 32), mul(mat(op.x, -0.9, op.z), new THREE.Matrix4().makeRotationX(Math.PI)), 0xc2b69e);
    for (let k = 0; k < 14; k++) {
      const st = new THREE.Vector3().setFromMatrixPosition(mul(gm, mat(0, 2.7 - k * 0.2, gd / 2 + 0.6 + k * 0.4)));
      b.add('stone', G.box(11 + k * 0.4, 0.25, 0.45), mat(st.x, st.y, st.z, ry), 0xd8ceb8);
    }
    for (let k = 0; k < 44; k++) {
      const a = th - 1.05 + k / 43 * 2.1; // around the outer half
      const bp = new THREE.Vector3(op.x + Math.sin(a) * 15.6, 0.3, op.z - Math.cos(a) * 15.6);
      b.add('stone', G.baluster(0.95, 0.12, 6), mat(bp.x, 0.3, bp.z), TRIM);
    }
    b.add('stone', G.torus(15.6, 0.22, 4, 40, 2.1).rotateX(Math.PI / 2), mat(op.x, 1.4, op.z, -th + 1.05 - Math.PI / 2 + Math.PI), TRIM);
    collider.addBox(gc.x, gh / 2, gc.z, gw / 2 + 12, gh / 2 + 2, gd / 2 + 1, 0);
    ctx.landmarks.gate = new THREE.Vector3().setFromMatrixPosition(mul(gm, mat(0, 8, gd / 2)));
    ctx.landmarks.gatePlatform = op.clone();
  }

  // ---- bridge gatehouses on the wall (harbor viaduct at 8, suspension bridge tower at 2) ----
  for (const [hour, kind] of [[8, 'viaduct'], [2, 'suspension']]) {
    const th = CLK(hour), c = P(R + 1, th, 0), ry = outRot(th);
    const w = 18, d = 14, h = kind === 'suspension' ? 42 : 30;
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); const tmp = new THREE.Path(); G.roundArchPath(tmp, 6, 6.5, 0, 12);
    const hp = tmp.getPoints(); hole.moveTo(hp[0].x, hp[0].y + 16); for (let k = 1; k < hp.length; k++) hole.lineTo(hp[k].x, hp[k].y + 16);
    sh.holes.push(hole);
    const gm = mat(c.x, 0, c.z, ry);
    b.add('stone', G.extrude(sh, d, 0, 12), gm, WALL_COL);
    b.add('paving', G.box(6, 0.3, d + 0.4), mul(gm, mat(0, 15.85, 0)), 0xd4c9b2);
    b.add('stone', G.archRing(6, 1.0, 1.0, 'round', 12, 0), mul(gm, mat(0, 22.5, d / 2 + 0.3)), TRIM);
    b.add('stone', G.box(w + 1.2, 0.8, d + 1.2), mul(gm, mat(0, h - 2.2, 0)), TRIM);
    for (let k = -3; k <= 3; k++) for (const zz of [-1, 1]) b.add('stone', G.box(1.4, 1.8, 1.0), mul(gm, mat(k * 2.5, h, zz * (d / 2 - 0.5))), WALL_COL);
    if (kind === 'suspension') {
      // pyramidal copper cap on the bridge tower
      b.add('copper', G.rotY45(new THREE.ConeGeometry(w * 0.68, 11, 4, 1, true)).translate(0, 5.5, 0), mul(gm, mat(0, h + 0.5, 0)), 0x5f9f8d);
      ctx.flags.push({ pos: new THREE.Vector3().setFromMatrixPosition(mul(gm, mat(0, h + 17, 0))), w: 4.5, h: 2.8, kind: 2 });
      b.add('iron', G.cyl(0.08, 0.08, 7, 5), mul(gm, mat(0, h + 11, 0)), 0x333030);
    } else {
      b.add('roof', G.hipRoof(w + 1, d + 1, 6, 0.6), mul(gm, mat(0, h + 0.4, 0)), 0x5f9f8d);
    }
    collider.addBox(c.x, h / 2, c.z, w / 2 + 1, h / 2 + 2, d / 2 + 1, -ry);
    ctx.landmarks['gate_' + kind] = new THREE.Vector3().setFromMatrixPosition(mul(gm, mat(0, 16, d / 2)));
  }

  // ---- postern at 10 o'clock (monastery single-arch bridge) & old rock gate at 4 (ruins bridge) handled in bridges ----

  // ---- cantilevered round overlooks ----
  for (const hour of [5.2, 6.85]) {
    const th = CLK(hour), y = 9;
    const c = P(R + T / 2 + 6.2, th, 0);
    b.add('paving', G.cylC(6.4, 6.4, 0.8, 28), mat(c.x, y - 0.4, c.z), 0xd8ceb8);
    b.add('stone', G.cyl(6.4, 6.6, 0.5, 28), mat(c.x, y - 0.9, c.z), TRIM);
    // stone brackets
    for (let k = -2; k <= 2; k++) {
      const a = th + k * 0.025;
      const p0 = P(R + T / 2, a, y - 6.5), p1 = P(R + T / 2 + 6.0, a, y - 0.9);
      b.add('stone', G.box(1, 1.0, 0.9).translate(0.5, -0.5, 0), matSeg(p0, p1), WALL_COL2);
      b.add('stone', G.box(4.5, 1.2, 1.0).translate(0, 0, 0), mat(P(R + T / 2 + 1.8, a).x, y - 2.2, P(R + T / 2 + 1.8, a).z, outRot(a) + Math.PI / 2), WALL_COL2);
    }
    // balustrade
    for (let k = 0; k <= 26; k++) {
      const a = th - Math.PI * 0.62 + k / 26 * Math.PI * 1.24;
      const off = new THREE.Vector3(Math.sin(a) * 6.0, 0, -Math.cos(a) * 6.0);
      b.add('stone', G.baluster(0.9, 0.11, 6), mat(c.x + off.x, y, c.z + off.z), TRIM);
    }
    b.add('stone', G.torus(6.0, 0.18, 4, 32, Math.PI * 1.24).rotateX(Math.PI / 2), mat(c.x, y + 0.95, c.z, -th + Math.PI * 0.62 + Math.PI / 2 - Math.PI + Math.PI), TRIM);
    // benches
    for (const s of [-1, 1]) {
      const a = th + s * 0.9; const bp = new THREE.Vector3(c.x + Math.sin(a) * 4.3, y, c.z - Math.cos(a) * 4.3);
      b.add('stone', G.box(2.4, 0.45, 0.7), mat(bp.x, y + 0.0, bp.z, -a), TRIM);
      b.add('stone', G.box(0.4, 0.45, 0.6), mat(bp.x, y, bp.z, -a), WALL_COL2);
      b.add('wood', G.box(2.6, 0.12, 0.75), mat(bp.x, y + 0.45, bp.z, -a), 0x8a6a4c);
    }
    // doorway in the wall to the overlook
    const dp = P(R + T / 2 + 0.05, th, 0);
    b.add('dark', G.box(2.2, 3.4, 0.2), mat(dp.x, y, dp.z, outRot(th)));
    b.add('stone', G.archRing(2.2, 0.4, 0.5, 'round', 10, 0), mat(dp.x, y + 3.4, dp.z, outRot(th)), TRIM);
    collider.addCyl(c.x, c.z, 6.6, y - 6, y + 1.2);
    ctx.landmarks['overlook' + hour] = new THREE.Vector3(c.x, y + 2, c.z);
  }

  // ---- inner stairs and ramps up to the wall walk ----
  const climbs = [[4.35, 'stair', 1], [7.35, 'stair', -1], [11.3, 'stair', 1], [1.6, 'ramp', -1], [9.6, 'ramp', 1]];
  for (const [hour, kind, dir] of climbs) {
    const th0 = CLK(hour);
    const rr = R - T / 2 - 2.0;
    const rise = H - MAIN.T1.y; const run = kind === 'stair' ? 26 : 46;
    const dth = run / rr * dir;
    const n = kind === 'stair' ? 44 : 30;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const a = th0 + dth * (t0 + t1) / 2;
      const y = MAIN.T1.y + rise * t1;
      const p = P(rr, a, 0);
      const seglen = Math.abs(dth) * rr / n + 0.08;
      b.add('stone', G.box(seglen, y - MAIN.T1.y + 0.01, 3.8), mat(p.x, MAIN.T1.y, p.z, outRot(a)), kind === 'stair' ? 0xd5cab3 : 0xcfc4ad);
      if (kind === 'stair') b.add('stone', G.box(seglen * 0.5, 0.18, 3.9), mat(P(rr, a + dth / n * 0.25, 0).x, y, P(rr, a + dth / n * 0.25, 0).z, outRot(a)), TRIM);
      // outer parapet (towards the city)
      if (k % 2 === 0) { const pp = P(rr - 1.85, a, 0); b.add('stone', G.box(seglen * 2.05, 1.0, 0.4), mat(pp.x, y, pp.z, outRot(a)), WALL_COL); }
    }
  }

  b.build(scene, M, { dark: { cast: false } });
  return b;
}
