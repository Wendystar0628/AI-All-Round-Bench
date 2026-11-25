import * as THREE from 'three';
import { SATS, CLK, P, dirOf } from '../world/layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const TOUR_DURATION = 90;

// ---------------------------------------------------------------------------------------------
// Motion design
// Speeds are perceived image speeds in rad/s, normalised to a 45° field of view: the camera's
// motion across the view (and half its motion along the view) divided by the distance of what the
// shot looks at, or the turning rate, whichever dominates.
// Most shots run at one steady speed. Only a few change speed, where the content asks for it: the
// orbit swings up to speed out of the slow rise, the gate shot slows after the passage to take in
// the market, and the last shot settles to rest. The rhythm comes from the shots themselves (slow
// wides, quicker details, long and short shots, changing motions); neighbouring shots meet at
// similar speeds and directions, and every cut happens in motion. The opening is moving from its
// first frame.
// d: duration; v: optional speed shape [seconds into the shot, relative speed] (smooth monotone
// curve; steady when absent), scaled so the shot covers exactly its path in its duration.
// trim: the part of the move that is used (cut points); dm: distance cap for the speed measure
// where close foreground (gate passage, stair statues, bridge hangers) carries the image motion;
// wIn / wOut: how strongly the start / end direction bends toward the neighbouring shot's motion.
// Sections: arrival (rise, orbit, underside: far -> near), the city (gate -> spire: near -> close),
// the water (wheel -> great fall: close -> far, the heaviest shot), the satellites (harbor ->
// ruins), and the close (ring road, the whole city settling to rest).
// ---------------------------------------------------------------------------------------------
export const PLAN = [
  // 0 rise out of the cloud sea, steady from the first frame, the city unfolding
  { d: 6.0 },
  // 1 half orbit across the sunlit front and the harbor side; swings up to speed out of the slow rise, then steady
  { d: 11.5, v: [[0, 0.25], [1.8, 1], [11.5, 1]] },
  // 2 underside: up past the crystals and the chain to the guardian
  { d: 4.5, trim: [0.16, 1.0] },
  // 3 gate: through the gate passage, then slowing to take in the market
  { d: 6.5, dm: 30, trim: [0.2, 1.0], v: [[0, 1], [1.5, 1], [2.8, 0.6], [6.5, 0.6]] },
  // 4 academy: sideways past the bell tower, tilting down into the cloister court
  { d: 4.5 },
  // 5 grand stair: up between the statues to the portal and rose window
  { d: 5.5, dm: 30, trim: [0.4, 1.0], wOut: 0.85 },
  // 6 spire: from the golden ribs up the spire onto the crystal ball and rings
  { d: 6.0, wIn: 0.85 },
  // 7 waterwheel: rise with the buckets to where they spill, then pull back along the aqueduct
  { d: 5.5 },
  // 8 cascades and the great fall (the heaviest shot): down past the rim and out until the whole fall hangs above the clouds
  { d: 7.0 },
  // 9 harbor: round the crane lifting its crate to the airship at its mast
  { d: 5.5, trim: [0.22, 1.0] },
  // 10 suspension bridge: hangers stream past toward the clock tower as the bell rings
  { d: 6.0, dm: 40, trim: [0.08, 1.0] },
  // 11 monastery: over the vineyard terraces past the cloister
  { d: 4.0, trim: [0.38, 0.8] },
  // 12 ruins: out from behind a pier of the broken bridge onto the planked gap, the temple beyond
  { d: 5.0, trim: [0.66, 1.0] },
  // 13 outer ring road: the lighthouse beam sweeps the clouds, the road's piers slide past, onto the city front
  { d: 5.5 },
  // 14 cloud shadow over the city: a slow arc that settles to rest on the whole city
  { d: 7.0, v: [[0, 1], [1.5, 1], [7.0, 0]] },
];
const SHOT_T0 = []; { let t = 0; for (const p of PLAN) { SHOT_T0.push(t); t += p.d; } }
// occasional events, placed relative to the shot that shows them (never overlapping)
export const TOUR_EVENTS = [
  ['gust', SHOT_T0[3] - 0.4],       // the gust front reaches the market as the gate shot ends, flags lift
  ['craneUp', SHOT_T0[9] - 3.5],    // crane lifts and swings during the harbor shot
  ['bell', SHOT_T0[10] + 1.5],      // bell rings on the suspension bridge, birds take off (after the crane finishes)
  ['shadow', SHOT_T0[14] - 8.0],    // cloud shadow lifts off the city in the final shot (after the bell)
];

function shot(pos, tgt, fov = [40, 40]) { return { pos, tgt, fov }; }

// monotone cubic (Fritsch-Carlson) through the keys, flat at both ends
function monotone(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h.push(xs[k + 1] - xs[k]); d.push((ys[k + 1] - ys[k]) / h[k]); }
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) continue;
    const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let k = 0; while (k < n - 2 && x > xs[k + 1]) k++;
    const t = (x - xs[k]) / h[k], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h[k] * m[k + 1];
  };
}

export function makeTour(ctx) {
  const L = ctx.landmarks;
  const shots = [];
  // 1. rise from the cloud sea: the whole city unfolds
  shots.push(shot(
    [V3(470, -268, 1560), V3(440, -170, 1470), V3(395, -10, 1380), V3(350, 150, 1300), V3(330, 205, 1270)],
    [V3(30, -150, 60), V3(10, -90, 40), V3(0, -55, 30), V3(0, -42, 30), V3(0, -40, 30)], [44, 39]));
  // 2. half orbit around the main island, across the sunlit front and the harbor / monastery side
  {
    const pos = [], tgt = [];
    for (let k = 0; k <= 12; k++) { const a = 0.32 - (k / 12) * Math.PI; const r = 1080 - Math.sin(k / 12 * Math.PI) * 60; pos.push(V3(Math.sin(a) * r, 235 - Math.sin(k / 12 * Math.PI) * 20, Math.cos(a) * r)); tgt.push(V3(0, -20, 0)); }
    shots.push(shot(pos, tgt, [44, 44]));
  }
  // 3. island bottom: up past crystals and chains to the guardian
  {
    const g = L.guardian;
    shots.push(shot(
      [V3(95, -268, 175), V3(105, -215, 250), V3(80, -150, 300), V3(48, -98, 290), V3(30, -78, 262)],
      [V3(0, -200, 30), V3(0, -168, 90), V3(0, -128, 140), g.clone().add(V3(0, 4, 0)), g.clone().add(V3(0, 14, 0))], [46, 40]));
  }
  // 4. through the main gate, along the street to the market
  {
    const m = L.market;
    shots.push(shot(
      [V3(0, 7.5, 226), V3(0, 8.8, 196), V3(0, 9.2, 176.5), V3(22, 9.5, 171.5), V3(46, 10.5, 166), V3(60, 12, 160)],
      [V3(0, 10, 160), V3(0, 9, 150), V3(12, 8.5, 158), V3(35, 8, 152), V3(68, 6, 140), m.clone().add(V3(10.5, 2.5, -6.2))], [50, 46]));
  }
  // 5. lateral move past the bell tower, tilting down into the academy cloister court
  {
    const B = L.bellTower, A = L.academy;
    const c = V3(A.x - B.x, 0, A.z - B.z).normalize(); const n = V3(-c.z, 0, c.x);
    if (n.dot(V3(B.x + A.x, 0, B.z + A.z)) < 0) n.negate();
    const p0 = V3(B.x, 54, B.z).addScaledVector(n, 42).addScaledVector(c, -2), p1 = V3(A.x, 48, A.z).addScaledVector(n, 42).addScaledVector(c, 1);
    shots.push(shot(
      [p0, p0.clone().lerp(p1, 1 / 3), p0.clone().lerp(p1, 2 / 3), p1],
      [V3(B.x, 50, B.z), V3(B.x + (A.x - B.x) * 0.35, 40, B.z + (A.z - B.z) * 0.35), V3(B.x + (A.x - B.x) * 0.7, 30, B.z + (A.z - B.z) * 0.7), V3(A.x, 24, A.z)], [42, 42]));
  }
  // 6. up the grand stair between the statues toward the portal and rose window
  shots.push(shot(
    [V3(0, 8, 172), V3(0, 19, 142), V3(0, 31, 113), V3(0, 42, 86), V3(0, 46.5, 64)],
    [V3(0, 30, 100), V3(0, 41, 80), V3(0, 53, 58), V3(0, 62, 40), V3(0, 70, 34)], [46, 44]));
  // 7. from the dome's golden ribs up the spire to the crystal ball and rings
  {
    const b = ctx.ballCenter;
    shots.push(shot(
      [V3(66, 112, 54), V3(60, 148, 48), V3(48, 176, 38), V3(31, b.y - 2, 23), V3(18, b.y - 0.5, 12)],
      [V3(0, 136, -14), V3(0, 160, -14), V3(0, 180, -14), V3(0, b.y - 2, -14), b.clone()], [42, 30]));
  }
  // 8a. water: rise with the waterwheel's buckets to where they spill into the trough, then pull back with the water along the aqueduct
  {
    const w = ctx.wheel.center;
    shots.push(shot(
      [w.clone().add(V3(12, 5, 32)), w.clone().add(V3(11, 13, 35)), w.clone().add(V3(15, 21, 57)), w.clone().add(V3(22, 30, 86)), w.clone().add(V3(28, 37, 112))],
      [w.clone().add(V3(-2, 5, 0)), w.clone().add(V3(-4, 10, 0)), w.clone().add(V3(-7, 6, 2)), w.clone().add(V3(-10, 1, 4)), w.clone().add(V3(-13, -4, 6))], [44, 46]));
  }
  // 8b. water: tiered cascades down the terraces, then down and out beside the great fall until it hangs whole above the clouds
  {
    const th = CLK(9.15);
    const W1 = ctx.waterfallW1;
    shots.push(shot(
      [P(335, th - 0.34, 96), P(360, th - 0.31, 40), P(400, th - 0.29, -18), P(445, th - 0.28, -50), P(480, th - 0.28, -62)],
      [P(112, th, 18), P(175, th, 0), W1.lip.clone().add(V3(0, -48, 0)), W1.mid.clone().add(V3(0, -12, 0)), W1.mid.clone().add(V3(0, -22, 0))], [42, 44]));
  }
  // 9. harbor: dock, crane lifting a crate, airship swaying at the mooring mast
  {
    const s = SATS.harbor; const out = dirOf(s.th); const side = V3(out.z, 0, -out.x);
    const c = L.crane, a = L.airship;
    shots.push(shot(
      [c.clone().addScaledVector(out, 46).addScaledVector(side, 30).add(V3(0, 10, 0)), c.clone().addScaledVector(out, 52).addScaledVector(side, 8).add(V3(0, 16, 0)), c.clone().addScaledVector(out, 58).addScaledVector(side, -22).add(V3(0, 22, 0))],
      [c.clone().add(V3(0, -2, 0)), c.clone().lerp(a, 0.4), c.clone().lerp(a, 0.75)], [44, 46]));
  }
  // 10. walk the suspension bridge toward the clock tower; the bell rings, birds take off
  {
    const S = ctx.suspension;
    const at = (t, up, off = 0) => S.F.at(t, S.deckY(t) + up, off);
    const top = L.clockTowerTop;
    shots.push(shot(
      [at(0.12, 4.0, 1.2), at(0.32, 5.5, 2.5), at(0.5, 9, 6), at(0.62, 14, 10)],
      [at(0.6, 6, 0), at(0.92, 14, 0), top.clone().add(V3(0, -8, 0)), top.clone().add(V3(0, -2, 0))], [48, 46]));
  }
  // 11. monastery cloister and terraced vineyard
  {
    const s = SATS.monastery; const out = dirOf(s.th); const side = V3(out.z, 0, -out.x);
    const m = L.monastery, v = L.vineyard;
    shots.push(shot(
      [v.clone().addScaledVector(out, 40).addScaledVector(side, 36).add(V3(0, 14, 0)), v.clone().addScaledVector(out, 18).addScaledVector(side, 10).add(V3(0, 22, 0)), m.clone().addScaledVector(out, 22).addScaledVector(side, -16).add(V3(0, 26, 0))],
      [v.clone(), m.clone().lerp(v, 0.5), m.clone().add(V3(0, -2, 0))], [44, 42]));
  }
  // 12. ruins, then down to the broken bridge mended with planks (the shot uses the end of this move)
  {
    const bb = L.brokenBridge, r = L.ruins;
    const F = L.brokenBridgeFrame.F;
    shots.push(shot(
      [bb.clone().addScaledVector(F.Z, 38).add(V3(0, -14, 0)), bb.clone().addScaledVector(F.Z, 46).addScaledVector(F.X, 26).add(V3(0, -2, 0)), r.clone().addScaledVector(F.Z, 60).addScaledVector(F.X, -10).add(V3(0, 22, 0))].reverse(),
      [bb.clone().add(V3(0, -4, 0)), bb.clone().lerp(r, 0.5), r.clone()].reverse(), [44, 44]));
  }
  // 13. the lighthouse beam sweeping the clouds, then along the outer ring road, its piers sliding past below
  shots.push(shot(
    [V3(250, 24, 820), V3(180, 27, 805), V3(100, 31, 785), V3(20, 35, 760), V3(-90, 39, 733)],
    [V3(320, -10, 325), V3(200, -10, 310), V3(80, -10, 290), V3(-20, -10, 270), V3(-120, -10, 252)], [44, 44]));
  // 14. atmosphere: a cloud shadow drifts off the city; sunlight returns to wall, lower city, temple
  {
    const R = 833.7, pos = [], tgt = [];
    for (let k = 0; k <= 6; k++) { const u = k / 6; const a = THREE.MathUtils.degToRad(-16.4 - 15.9 * u); pos.push(V3(Math.sin(a) * R, 140 - 12 * u, Math.cos(a) * R)); tgt.push(V3(0, 34 + 6 * u, 18 - 18 * u)); }
    shots.push(shot(pos, tgt, [35, 34]));
  }

  // ------------------------------------------------------------------ timing, cut points
  shots.forEach((s, i) => {
    s.t0 = SHOT_T0[i]; s.t1 = SHOT_T0[i] + PLAN[i].d; s.plan = PLAN[i];
    const tr = PLAN[i].trim;
    if (tr) { // keep only part of the move: resample both curves between the new cut points
      const cp = new THREE.CatmullRomCurve3(s.pos, false, 'centripetal'), ct = new THREE.CatmullRomCurve3(s.tgt, false, 'centripetal');
      const n = 6, pos = [], tgt = [];
      for (let k = 0; k < n; k++) { const u = Math.min(1, Math.max(0, tr[0] + (tr[1] - tr[0]) * k / (n - 1))); pos.push(cp.getPointAt(u)); tgt.push(ct.getPointAt(u)); }
      s.pos = pos; s.tgt = tgt;
      s.fov = [s.fov[0] + (s.fov[1] - s.fov[0]) * tr[0], s.fov[0] + (s.fov[1] - s.fov[0]) * tr[1]];
    }
  });
  const last = shots.length - 1;

  // ------------------------------------------------------------------ direction continuity at the cuts
  const up = V3(0, 1, 0);
  const frame = (p, t) => { const f = t.clone().sub(p).normalize(); const r = new THREE.Vector3().crossVectors(f, up).normalize(); const u = new THREE.Vector3().crossVectors(r, f); return { f, r, u }; };
  const toCam = (v, F) => V3(v.dot(F.r), v.dot(F.u), v.dot(F.f));
  const toWorld = (c, F) => new THREE.Vector3().addScaledVector(F.r, c.x).addScaledVector(F.u, c.y).addScaledVector(F.f, c.z);
  for (const s of shots) {
    s.cp0 = new THREE.CatmullRomCurve3(s.pos, false, 'centripetal');
    s.inDir = null; s.outDir = null;
  }
  for (let i = 0; i < last; i++) {
    const A = shots[i], B = shots[i + 1];
    const FA = frame(A.pos[A.pos.length - 1], A.tgt[A.tgt.length - 1]);
    const FB = frame(B.pos[0], B.tgt[0]);
    const cA = toCam(A.cp0.getTangentAt(1), FA), cB = toCam(B.cp0.getTangentAt(0), FB);
    const S = cA.clone().add(cB);
    if (S.length() < 0.35) continue; // nearly opposite: leave both alone
    S.normalize();
    const wOut = A.plan.wOut ?? 0.55, wIn = B.plan.wIn ?? 0.55;
    A.outDir = toWorld(cA.clone().multiplyScalar(1 - wOut).addScaledVector(S, wOut).normalize(), FA);
    B.inDir = toWorld(cB.clone().multiplyScalar(1 - wIn).addScaledVector(S, wIn).normalize(), FB);
  }
  // final camera curves: phantom end points steer the start / end tangents; the shot itself still
  // starts and ends exactly on its first and last framing.
  for (const s of shots) {
    const p = s.pos, n = p.length;
    const pts = p.map((v) => v.clone());
    let k0 = 0;
    if (s.inDir) { const l = p[1].distanceTo(p[0]); pts.unshift(p[1].clone().addScaledVector(s.inDir, -2 * l)); k0 = 1; }
    if (s.outDir) { const l = p[n - 1].distanceTo(p[n - 2]); pts.push(p[n - 2].clone().addScaledVector(s.outDir, 2 * l)); }
    s.cp = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const lens = s.cp.getLengths(2000); const tot = lens[lens.length - 1];
    const tOf = (k) => k / (pts.length - 1);
    s.uA = lens[Math.round(tOf(k0) * 2000)] / tot;
    s.uB = lens[Math.round(tOf(k0 + n - 1) * 2000)] / tot;
    s.len = (s.uB - s.uA) * tot;
    s.ct = new THREE.CatmullRomCurve3(s.tgt, false, 'centripetal');
  }

  // ------------------------------------------------------------------ even turning
  // The look direction is re-parametrised by its turning angle along the camera path, so a shot turns
  // in step with the camera's advance (turning and travel speed up and slow down together); the first
  // and last look directions (the framings at the cuts) are unchanged.
  const camAt = (s, sp) => s.cp.getPointAt(s.uA + (s.uB - s.uA) * sp);
  for (const s of shots) {
    const K = 360;
    const dirs = [], dists = [], cum = [0];
    for (let k = 0; k <= K; k++) {
      const sp = k / K;
      const c = camAt(s, sp), t = s.ct.getPointAt(sp);
      const d = t.clone().sub(c); dists.push(d.length()); dirs.push(d.normalize());
      if (k > 0) cum.push(cum[k - 1] + Math.acos(Math.min(1, dirs[k - 1].dot(dirs[k]))));
    }
    s.look = { K, dirs, dists, cum, total: cum[K] };
  }
  const _ld = new THREE.Vector3();
  function lookDir(s, sp) {
    const L = s.look;
    if (L.total < 1e-4) { const k = Math.round(sp * L.K); return { dir: _ld.copy(L.dirs[k]), dist: L.dists[k] }; }
    const want = L.total * sp;
    let lo = 0, hi = L.K;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L.cum[mid] <= want) lo = mid; else hi = mid; }
    const seg = L.cum[hi] - L.cum[lo]; const f = seg > 1e-9 ? (want - L.cum[lo]) / seg : 0;
    _ld.copy(L.dirs[lo]).lerp(L.dirs[hi], f).normalize();
    return { dir: _ld, dist: L.dists[lo] + (L.dists[hi] - L.dists[lo]) * f };
  }

  // ------------------------------------------------------------------ perceived path length
  // H(sp): accumulated image motion along the camera path (see the motion design note above).
  const HK = 2000;
  for (const s of shots) {
    const H = new Float64Array(HK + 1);
    let pc = camAt(s, 0), pf = lookDir(s, 0).dir.clone();
    for (let k = 1; k <= HK; k++) {
      const sp = k / HK;
      const c = camAt(s, sp); const ld = lookDir(s, sp); const f = ld.dir.clone();
      const fov = s.fov[0] + (s.fov[1] - s.fov[0]) * sp;
      const r = new THREE.Vector3().crossVectors(f, up).normalize(), u = new THREE.Vector3().crossVectors(r, f);
      const dv = c.clone().sub(pc);
      const a = dv.dot(r), b = dv.dot(u), z = dv.dot(f) * 0.5;
      const tr = Math.sqrt(a * a + b * b + z * z) / Math.max(Math.min(ld.dist, s.plan.dm ?? Infinity), 1);
      const rot = Math.acos(Math.min(1, pf.dot(f)));
      H[k] = H[k - 1] + Math.pow(tr ** 4 + rot ** 4, 0.25) * 45 / fov;
      pc = c; pf = f;
    }
    s.H = H; s.Htot = H[HK];
  }

  // ------------------------------------------------------------------ speed curves
  // The speed shape (steady unless the shot has keys) is scaled so the shot covers exactly its
  // perceived path length in its duration; the time table maps shot time -> accumulated motion.
  const NT = 1500;
  for (const s of shots) {
    const D = s.plan.d;
    const keys = s.plan.v || [[0, 1], [D, 1]];
    const shape = monotone(keys.map((k) => k[0]), keys.map((k) => k[1]));
    let area = 0; const n = 600, h0 = D / n;
    for (let j = 0; j < n; j++) area += (shape(j * h0) + 4 * shape((j + 0.5) * h0) + shape((j + 1) * h0)) * h0 / 6;
    s.alpha = s.Htot / area;
    const w = (t) => shape(t) * s.alpha;
    s.omega = w;
    const W = new Float64Array(NT + 1); const h = D / NT;
    for (let j = 1; j <= NT; j++) { const t0 = (j - 1) * h; W[j] = W[j - 1] + (w(t0) + 4 * w(t0 + h / 2) + w(t0 + h)) * h / 6; }
    const sc = s.Htot / W[NT]; for (let j = 0; j <= NT; j++) W[j] *= sc;
    s.W = W;
  }
  // progress along the camera path at time tl into shot s
  function progress(s, tl) {
    const x = Math.min(1, Math.max(0, tl / s.plan.d)) * NT;
    const j = Math.min(NT - 1, Math.floor(x));
    const want = s.W[j] + (s.W[j + 1] - s.W[j]) * (x - j);
    const H = s.H;
    if (want <= 0) return 0;
    if (want >= s.Htot) return 1;
    let lo = 0, hi = HK;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (H[mid] <= want) lo = mid; else hi = mid; }
    const seg = H[hi] - H[lo];
    return (lo + (seg > 1e-12 ? (want - H[lo]) / seg : 0)) / HK;
  }

  const out = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 40, shot: 0 };
  function at(t) {
    t = Math.max(0, Math.min(TOUR_DURATION - 1e-6, t));
    let i = shots.findIndex((s) => t >= s.t0 && t < s.t1); if (i < 0) i = last;
    const s = shots[i];
    const sp = progress(s, t - s.t0);
    out.pos.copy(camAt(s, sp));
    const ld = lookDir(s, sp);
    out.tgt.copy(out.pos).addScaledVector(ld.dir, ld.dist);
    out.fov = s.fov[0] + (s.fov[1] - s.fov[0]) * sp; out.shot = i;
    return out;
  }

  return { at, shots, duration: TOUR_DURATION, events: TOUR_EVENTS };
}
