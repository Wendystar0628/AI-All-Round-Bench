// Built-in camera tour for video export (~90 s, 14 shots, hard cuts).
//
// Framing: every shot is one camera move path(e), e in [0,1] (position, look-at target, fov), with a single
// main motion (push, pull, truck, crane or orbit).
// Motion:  steady by default - shots travel their path at a constant rig speed (the pushes onto a detail and the
// final pull-back keep a constant rate of scale change instead, so they neither rush nor crawl at one end),
// every shot is already moving on its first frame and still moving when it is cut. Only a few shots change speed
// inside, where the content asks for it (keeping pace with the wave and easing off as it hits, slowing as the
// mech appears from behind the containers, the final pull-back settling to a stop). The rhythm comes from the
// shots differing from each other: their lengths and therefore speeds, sizes and kinds of move.
// Shot lengths are chosen so the on-screen motion on both sides of every cut is similar. On-screen motion
// ("screen flow", frame heights per second) is measured on a coarse proxy of the scene (mech capsules, sea,
// quay deck, ship, foreground containers, sky), calibrated against rendered motion.
// Everything here is deterministic (no clocks, no randomness).
import * as THREE from 'three';
import { WAVE, EVENT_DUR } from '../events.js';
import { SEA_LEVEL } from '../env/sea.js';
import { DECK_Y, QUAY_Z } from '../env/port.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;
const sph = (c, az, el, r) => V(c.x + r * Math.cos(el * D) * Math.sin(az * D), c.y + r * Math.sin(el * D), c.z + r * Math.cos(el * D) * Math.cos(az * D));
const lerp = THREE.MathUtils.lerp;
const L3 = (a, b, e) => a.clone().lerp(b, e);

const NS = 96;          // path samples per shot for the flow measurement
const ASPECT = 16 / 9;  // analysis frame
const TOTAL = 90;       // tour length (s)
const VMIN = 0.035;     // slowest on-screen drift allowed while a shot is running (frame heights / s)
const CUT_TOL = Math.log(1.4);  // on-screen speeds either side of a cut stay within this ratio
const VIS_E = [0, 0.27, 0.5, 0.73, 1]; // where the visible-motion calibration was sampled along each path
const visAt = (vis, e) => { if (e <= VIS_E[0]) return vis[0]; for (let i = 1; i < VIS_E.length; i++) if (e <= VIS_E[i]) return lerp(vis[i - 1], vis[i], (e - VIS_E[i - 1]) / (VIS_E[i] - VIS_E[i - 1])); return vis[vis.length - 1]; };

// ------------------------------------------------------------------ speed profiles (only for the few shots that change speed)
// A profile is a list of keys [x, rate, shape] over the shot's time x in [0,1]; between two keys the travel
// rate changes smoothly (zero acceleration at both ends of a change, so speed never jumps):
//   hold  constant      ss  smooth symmetric change      glide  most of the change early, long gentle tail
const SHAPE = {
  hold: { f: (u) => u * u * (3 - 2 * u), F: (u) => u * u * u - u * u * u * u / 2, I: 0.5 },
  ss: { f: (u) => u * u * (3 - 2 * u), F: (u) => u * u * u - u * u * u * u / 2, I: 0.5 },
  glide: { f: (u) => 1 - (1 - u) ** 3 * (1 + 3 * u), F: (u) => u - 0.4 + (1 - u) ** 4 - 0.6 * (1 - u) ** 5, I: 0.6 },
};
const STEADY = [[0, 1], [1, 1, 'hold']];
const curveIntegral = (keys) => { let a = 0; for (let i = 1; i < keys.length; i++) { const [xa, va] = keys[i - 1], [xb, vb, s] = keys[i]; a += (xb - xa) * (va + (vb - va) * SHAPE[s].I); } return a; };
// travel covered up to time x (unnormalised)
const curveCum = (keys, x) => {
  let a = 0;
  for (let i = 1; i < keys.length; i++) {
    const [xa, va] = keys[i - 1], [xb, vb, s] = keys[i], L = xb - xa;
    if (x <= xb || i === keys.length - 1) { const u = THREE.MathUtils.clamp((x - xa) / L, 0, 1); return a + L * (va * u + (vb - va) * SHAPE[s].F(u)); }
    a += L * (va + (vb - va) * SHAPE[s].I);
  }
  return a;
};
// travel rate at time x (unnormalised)
const curveRate = (keys, x) => {
  for (let i = 1; i < keys.length; i++) {
    const [xa, va] = keys[i - 1], [xb, vb, s] = keys[i];
    if (x <= xb || i === keys.length - 1) { const u = THREE.MathUtils.clamp((x - xa) / (xb - xa), 0, 1); return va + (vb - va) * SHAPE[s].f(u); }
  }
  return keys[keys.length - 1][1];
};

// ------------------------------------------------------------------ scene proxy for the flow measurement
function sceneProxy(M) {
  const S = [];
  const ball = (a, r) => S.push(a.x, a.y, a.z, r);
  const cap = (a, b, r) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / (0.7 * r))); for (let i = 0; i <= n; i++) ball(a.clone().lerp(b, i / n), r); };
  for (const s of ['L', 'R']) {
    cap(M['hip' + s], M['knee' + s], 4.2);
    cap(M['knee' + s], M['ankle' + s], 3.6);
    ball(M['shoulder' + s], 7.0);
    cap(M['shoulder' + s], M['elbow' + s], 3.2);
    cap(M['elbow' + s], M['wrist' + s], 3.2);
  }
  cap(M.hipL, M.hipR, 5.0);
  cap(M.pelvis, M.waist, 5.2);
  cap(M.waist, M.chest, 7.5);
  cap(M.shoulderL, M.shoulderR, 6.5);
  ball(M.chest.clone().add(V(0, 0, -5)), 7.0);
  ball(M.head, 3.4);
  cap(M.wristR, M.fingertipsR[1] || M.wristR, 2.2);
  cap(M.swordRoot, M.swordTip, 1.4);
  const B = [];
  const box = (x0, y0, z0, x1, y1, z1) => B.push(x0, y0, z0, x1, y1, z1);
  for (const [x, z, n, r] of [[-36, -64.6, 3, 0], [-35.5, -67.4, 2, 0], [-1.5, -66.0, 2, 0], [-2, -68.8, 3, 0], [-48, -78, 1, 1]]) {
    const hx = r ? 1.22 : 6.1, hz = r ? 6.1 : 1.22;
    box(x - hx, DECK_Y, z - hz, x + hx, DECK_Y + n * 2.59, z + hz);
  }
  box(-372, SEA_LEVEL, -58.5, -72, 36, -13.5); // moored ship
  return { S: new Float64Array(S), B: new Float64Array(B) };
}

function rayHit(P, ox, oy, oz, dx, dy, dz) {
  let best = Infinity;
  const S = P.S;
  for (let i = 0; i < S.length; i += 4) {
    const cx = S[i] - ox, cy = S[i + 1] - oy, cz = S[i + 2] - oz, r = S[i + 3];
    const b = cx * dx + cy * dy + cz * dz;
    if (b <= 0) continue;
    const c2 = cx * cx + cy * cy + cz * cz - b * b;
    if (c2 > r * r) continue;
    const t = b - Math.sqrt(r * r - c2);
    if (t > 0.5 && t < best) best = t;
  }
  const B = P.B;
  for (let i = 0; i < B.length; i += 6) {
    let t0 = 0, t1 = best, ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = B[i + a], hi = B[i + 3 + a];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok && t0 > 0.5 && t0 < best) best = t0;
  }
  if (dy < -1e-6) {
    let t = (SEA_LEVEL - oy) / dy;
    if (t > 0 && oz + dz * t >= QUAY_Z && t < best) best = t;
    t = (DECK_Y - oy) / dy;
    if (t > 0 && oz + dz * t < QUAY_Z && t < best) best = t;
  }
  return best < 4000 ? best : Infinity;
}

// camera frame of a path state (same convention as camera.lookAt with a level horizon)
const UP = V(0, 1, 0);
function frameOf(st) {
  const f = st.t.clone().sub(st.p).normalize();
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const u = new THREE.Vector3().crossVectors(r, f);
  return { p: st.p, f, r, u, th: Math.tan(st.fov * D / 2) };
}

// screen motion between two camera states, averaged over a grid of rays (frame heights)
const NX = 9, NY = 5;
function flowBetween(P, A, Bc) {
  let sum = 0, sx = 0, sy = 0, sdiv = 0, n = 0;
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    const xn = -0.88 + 1.76 * ix / (NX - 1), yn = -0.85 + 1.7 * iy / (NY - 1);
    const kx = xn * A.th * ASPECT, ky = yn * A.th;
    let dx = A.f.x + A.r.x * kx + A.u.x * ky, dy = A.f.y + A.r.y * kx + A.u.y * ky, dz = A.f.z + A.r.z * kx + A.u.z * ky;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const t = rayHit(P, A.p.x, A.p.y, A.p.z, dx, dy, dz);
    let vx, vy, vz;
    if (t === Infinity) { vx = dx; vy = dy; vz = dz; } else { vx = A.p.x + dx * t - Bc.p.x; vy = A.p.y + dy * t - Bc.p.y; vz = A.p.z + dz * t - Bc.p.z; }
    const z = vx * Bc.f.x + vy * Bc.f.y + vz * Bc.f.z;
    if (z < 1e-3 * Math.hypot(vx, vy, vz)) continue;
    const xb = (vx * Bc.r.x + vy * Bc.r.y + vz * Bc.r.z) / (z * Bc.th * ASPECT);
    const yb = (vx * Bc.u.x + vy * Bc.u.y + vz * Bc.u.z) / (z * Bc.th);
    const ddx = (xb - xn) * ASPECT / 2, ddy = (yb - yn) / 2;
    const px = xn * ASPECT / 2, py = yn / 2, pl = Math.max(0.08, Math.hypot(px, py));
    sum += Math.hypot(ddx, ddy); sx += ddx; sy += ddy; sdiv += (ddx * px + ddy * py) / pl; n++;
  }
  n = Math.max(1, n);
  return { m: sum / n, x: sx / n, y: sy / n, div: sdiv / n };
}

// ------------------------------------------------------------------ shot lengths
// Each shot k travels its path with the profile s_k (steady for most), so for a length D_k its on-screen speed
// at the start and end is a_k / D_k and b_k / D_k (a, b from the measured flow at the path ends), and its
// slowest moment is m_k / D_k. The solver picks lengths that keep near the intended ones (rhythm), make the
// speeds either side of each cut similar, never let a running shot crawl below VMIN, leave room for the
// scripted events, and add up to `total` seconds.
function minimize(cost, x0, iters = 600) {
  let x = x0.slice();
  const n = x.length;
  const grad = (v) => v.map((_, i) => { const p = v.slice(), q = v.slice(); p[i] += 1e-6; q[i] -= 1e-6; return (cost(p) - cost(q)) / 2e-6; });
  const eye = () => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  let H = eye(), fx = cost(x), g = grad(x);
  for (let it = 0; it < iters; it++) {
    let d = H.map(row => -row.reduce((acc, h, j) => acc + h * g[j], 0));
    let gd = d.reduce((acc, v, i) => acc + v * g[i], 0);
    if (!(gd < 0)) { H = eye(); d = g.map(v => -v); gd = -g.reduce((acc, v) => acc + v * v, 0); }
    let a = 1, xn = null, fn = Infinity;
    while (a > 1e-12) { xn = x.map((v, i) => v + a * d[i]); fn = cost(xn); if (fn <= fx + 1e-4 * a * gd) break; a *= 0.5; }
    if (a <= 1e-12) break;
    const gn = grad(xn);
    const sv = xn.map((v, i) => v - x[i]), yv = gn.map((v, i) => v - g[i]);
    const sy = sv.reduce((acc, v, i) => acc + v * yv[i], 0);
    if (sy > 1e-14) {
      const r = 1 / sy;
      const Hy = H.map(row => row.reduce((acc, h, j) => acc + h * yv[j], 0));
      const yHy = yv.reduce((acc, v, i) => acc + v * Hy[i], 0);
      H = H.map((row, i) => row.map((h, j) => h - r * (Hy[i] * sv[j] + sv[i] * Hy[j]) + (r * r * yHy + r) * sv[i] * sv[j]));
    }
    const conv = Math.abs(fx - fn) < 1e-14;
    x = xn; fx = fn; g = gn;
    if (conv) break;
  }
  return x;
}

function solveLengths(shots, total, extra = () => 0) {
  const N = shots.length;
  const norm = (y) => { const d = y.map(Math.exp); const f = d.reduce((a, b) => a + b, 0) / total; return d.map(v => v / f); };
  const cost = (y) => {
    const d = norm(y);
    let j = 0;
    shots.forEach((s, k) => {
      const l = Math.log(d[k] / s.want); j += 5 * s.w * l * l;
      if (d[k] < 3) { const e = Math.log(3 / d[k]); j += 100 * e * e; }
      const slow = s.slowest / d[k];
      if (slow < VMIN) { const e = Math.log(VMIN / slow); j += 1e3 * e * e; }
      if (k < N - 1) {
        const r = Math.abs(Math.log((s.vEnd / d[k]) / (shots[k + 1].vStart / d[k + 1])));
        if (r > CUT_TOL) { const e = r - CUT_TOL; j += 4 * (s.cutWeight ?? 1) * e * e; }
      }
    });
    return j + extra(d);
  };
  const y = minimize(cost, shots.map(s => Math.log(s.want)));
  return norm(y);
}

export function createTour({ M, events, helis }) {
  const time0 = 600;
  const R = M.reactor.clone(), RN = M.reactorN.clone();
  const sideR = V(1, 0, 0).applyAxisAngle(V(0, 1, 0), 10 * D);
  const swordA = M.swordTip.clone().sub(M.swordRoot).normalize();
  const bladeN = new THREE.Vector3().crossVectors(swordA, new THREE.Vector3().crossVectors(V(0, 0, 1), swordA)).normalize();
  if (bladeN.z < 0) bladeN.negate();
  const palm = M.wristR.clone().lerp(M.fingertipsR[1] || M.wristR, 0.55);
  const leg = M.legL.clone();

  // Visible-motion calibration: rendered camera-only motion / proxy flow, measured once per shot at e = VIS_E
  // (frozen scene with rain and spray hidden, two camera poses, block-matched; the end values re-measured at the
  // cuts). It corrects the coarse
  // proxy for what actually shows on screen: dark backgrounds that hide an orbit, nearby armour, cranes and yard
  // the proxy leaves out. Fixed numbers, so the timing stays identical on every machine.
  const VIS = [
    [1.24, 1.69, 0.64, 0.55, 0.76],
    [1.24, 1.23, 1.13, 1.27, 1.5],
    [0.67, 0.55, 0.66, 0.69, 0.65],
    [0.36, 0.62, 0.93, 0.53, 0.64],
    [1.13, 1.13, 0.84, 1.12, 0.81],
    [1.33, 2.93, 2.65, 2.44, 1.84],
    [1.73, 1.45, 2.07, 1.9, 1.67],
    [0.46, 0.72, 0.81, 0.86, 0.43],
    [0.79, 1.61, 1.58, 1.74, 0.72],
    [0.98, 0.73, 1.09, 1.14, 0.89],
    [1.51, 2.17, 3.52, 3.49, 2.36],
    [1.16, 1.58, 0.72, 1.93, 1.62],
    [0.32, 1.09, 0.95, 1.13, 0.57],
    [1.01, 1.24, 1.41, 1.31, 0.93],
  ];

  // ---------------------------------------------------------------- shots
  // want: intended length (s); w: how firmly to keep it; profile: travel rate over the shot (STEADY unless the
  // content asks for a change of pace).
  const shots = [];
  // mode: 'rig' = constant rig speed along the path, 'scale' = constant rate of on-screen change (pushes / pulls
  // where the distance to the subject changes several times over).
  const add = (want, profile, path, w = 1, mode = 'rig') => shots.push({ want, profile, path, w, mode, vis: VIS[shots.length] });

  // 1 wide: skimming low over the rolling sea, the silhouette grows and the port lights open up behind it.
  //   Already moving on the first frame.
  add(8.0, STEADY,
    (e) => ({ p: V(lerp(118, 42, e), lerp(17.6, 20.5, e), lerp(372, 140, e)), t: V(lerp(-8, 1, e), lerp(33, 38.5, e), 0), fov: lerp(30, 34, e) }), 2);
  // 2 wide/full body: crane up from the feet along the whole body until the visor light enters the top of the frame.
  add(9.5, STEADY,
    (e) => ({ p: V(lerp(30, 24, e), lerp(15.5, 48, e), lerp(46, 39, e)), t: V(lerp(6, 1, e), lerp(16, 61.5, e), 2), fov: lerp(50, 44, e) }));
  // 3 close: the visor light through the rain, water running down the crest plates; a push in on the visor
  //   drifting right.
  add(3.5, STEADY,
    (e) => { const v = M.visor; return { p: sph(v, lerp(8, 22, e), lerp(2, 4, e), lerp(23, 12.5, e)), t: v.clone().add(V(0, lerp(0.2, 0.8, e), 0)), fov: 30 }; }, 1, 'scale');
  // 4 medium: orbit round the stacked right pauldron (it sweeps through the foreground) to a front view with
  //   both wings curving up beside the head and the head lamp beam cutting the rain.
  add(6.0, STEADY,
    (e) => { const c = V(-4, 65, -0.5); return { p: sph(c, lerp(-92, -38, e), lerp(8, 6, e), 23), t: c.clone().add(V(lerp(-2, 2, e), 0.5, 0)), fov: 40 }; });
  // 5 close: push into the reactor, the turbine turning behind its cover.
  add(4.0, STEADY,
    (e) => ({ p: R.clone().addScaledVector(RN, lerp(44, 16, e)).addScaledVector(sideR, lerp(-6, -1, e)).add(V(0, lerp(1.5, 0.3, e), 0)), t: R.clone().add(V(0, lerp(1.4, 0, e), 0)), fov: lerp(38, 32, e) }), 1, 'scale');
  // 6 medium: slide down the right arm from the elbow thrusters to the open hand and its dripping fingers.
  add(6.0, STEADY,
    (e) => { const t = L3(M.elbowThruster, palm, lerp(-0.2, 1.05, e)); return { p: t.clone().add(V(lerp(-29, -27, e), lerp(8, 2.5, e), lerp(7, 3.5, e))), t, fov: lerp(40, 36, e) }; });
  // 7 close: along the chainsword from its case to the tip - segments and hook teeth stream past, ending on the
  //   tip where the drips fall into the sea.
  add(8.0, STEADY,
    (e) => { const t = M.swordRoot.clone().lerp(M.swordTip, lerp(-0.02, 1.01, e)); return { p: t.clone().addScaledVector(bladeN, lerp(13.5, 11, e)).add(V(0, lerp(2.8, 3.2, e), 0)).addScaledVector(swordA, -4), t, fov: lerp(44, 48, e) }; });
  // 8 medium: round the back - segmented spine, oval vents and wings.
  add(4.5, STEADY,
    (e) => { const c = V(0, 56, -14); return { p: sph(c, lerp(212, 152, e), lerp(9, 6, e), lerp(28, 26, e)), t: c, fov: 42 }; });
  // 9 close: truck across the narrow waist - hydraulic rods and cables show between the armour.
  add(4.5, STEADY,
    (e) => { const x = lerp(-7, 7, e); return { p: V(x, 47.5, 21 + Math.abs(x) * 0.12), t: V(x * 0.3, 47.2, 0), fov: 36 }; });
  // 10 medium, low over the sea: run in alongside a big wave towards the shin at its pace, easing off as it hits
  //   and the spray climbs the thigh.
  add(7.5, [[0, 1], [0.4, 1, 'hold'], [1, 0.45, 'ss']],
    (e) => ({ p: V(leg.x + lerp(46, 40, e), lerp(16.8, 18, e), leg.z + lerp(58, 5, e)), t: leg.clone().add(V(lerp(4, 0, e), lerp(4, 10, e), lerp(22, 1, e))), fov: 46 }), 3);
  // 11 wide from the helicopter: truck past it high above the water - the helicopter slides through the lower
  //   foreground, the lit mech crosses the frame more slowly and the cranes and yard below slower still.
  add(7.5, STEADY,
    (e) => ({ p: V(lerp(-110, -22, e), lerp(110, 116, e), lerp(62, 120, e)), t: V(lerp(-32, 34, e), 43, lerp(-24, 19, e)), fov: 48 }), 2);
  // 12 medium from the quay: truck out from behind a container stack (it fills the frame at the cut), slowing as
  //   the mech appears outlined by the crane lights.
  add(5.0, [[0, 1], [0.45, 1, 'hold'], [1, 0.6, 'ss']],
    (e) => ({ p: V(lerp(-5, -20, e), 18.6, -78), t: V(lerp(-3, -18, e), lerp(44, 47, e), 0), fov: 54 }));
  // 13 wide: lightning - truck low over the sea while the flash lights the silhouette.
  add(6.0, STEADY,
    (e) => ({ p: V(lerp(-105, -45, e), lerp(20.5, 22, e), lerp(162, 188, e)), t: V(lerp(-9, 9, e), lerp(37, 37.5, e), lerp(-4, 4, e)), fov: 34 }), 2);
  // 14 finale: pull back from the reactor to the whole mech and settle on the full picture.
  add(10.0, [[0, 1], [0.4, 1, 'hold'], [1, 0, 'glide']],
    (e) => ({ p: L3(R.clone().add(V(9, 0.5, 22)), V(37, 19, 115), e), t: L3(R, V(6, 38.5, 0), e), fov: lerp(34, 42, e) }), 2, 'scale');
  const N = shots.length;

  // ---------------------------------------------------------------- measure screen flow along every path
  const proxy = sceneProxy(M);
  const measure = (path) => {
    const fr = [];
    for (let j = 0; j <= NS; j++) fr.push(frameOf(path(j / NS)));
    const seg = [];
    for (let j = 0; j < NS; j++) seg.push(flowBetween(proxy, fr[j], fr[j + 1]));
    // smoothing so silhouette crossings of the coarse proxy do not show up as ripples
    const K = [1, 4, 9, 14, 16, 14, 9, 4, 1];
    const raw = seg.map((q, j) => { let a = 0, w = 0; for (let o = -4; o <= 4; o++) { const i = Math.min(NS - 1, Math.max(0, j + o)); a += seg[i].m * K[o + 4]; w += K[o + 4]; } return a / w * NS; });
    const dir = (a, b) => { let x = 0, y = 0, dv = 0, mm = 0; for (let j = a; j < b; j++) { x += seg[j].x; y += seg[j].y; dv += seg[j].div; mm += seg[j].m; } return [x / mm, y / mm, dv / mm].map(v => +v.toFixed(2)); };
    return { raw, dirIn: dir(0, 8), dirOut: dir(NS - 8, NS) };
  };
  shots.forEach((s, k) => {
    Object.assign(s, measure(s.path));
    // the calibration only feeds the estimates used to pick lengths; the travel itself never depends on it
    const rate = s.raw.map((r, j) => r * visAt(s.vis, (j + 0.5) / NS)); // visible motion per unit of progress
    const I = curveIntegral(s.profile);
    const tShare = (x) => curveCum(s.profile, x) / I;     // share of the travel done after a share x of the shot
    const rateOf = (x) => curveRate(s.profile, x) / I;    // d(share)/dx
    let toE = (u) => u;                                   // travel share -> path progress e
    let dEdU = () => 1;
    if (s.mode === 'scale') {
      const cum = new Float64Array(NS + 1);
      for (let j = 0; j < NS; j++) cum[j + 1] = cum[j] + s.raw[j] / NS;
      const tot = cum[NS];
      toE = (u) => { const w = THREE.MathUtils.clamp(u, 0, 1) * tot; let lo = 0, hi = NS; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= w) lo = mid; else hi = mid; } return (lo + (w - cum[lo]) / Math.max(1e-12, cum[hi] - cum[lo])) / NS; };
      dEdU = (e) => tot / s.raw[Math.min(NS - 1, Math.floor(e * NS))];
    }
    s.progress = (x) => toE(tShare(x));
    const speedAt = (x) => { const e = s.progress(x); return rate[Math.min(NS - 1, Math.floor(e * NS))] * dEdU(e) * rateOf(x); }; // on-screen speed x shot length
    s.theta = 0; for (let i = 0; i < 48; i++) s.theta += speedAt((i + 0.5) / 48) / 48;
    s.vStart = (speedAt(0) + speedAt(0.02)) / 2;
    s.vEnd = (speedAt(1) + speedAt(0.98)) / 2;
    let slow = Infinity;
    for (let i = 0; i <= 24; i++) { const x = i / 24; if (k === N - 1 && x > 0.6) break; slow = Math.min(slow, speedAt(x)); }
    s.slowest = slow;
  });
  shots[10].cutWeight = 0.1; // helicopter -> quay: the container fills the frame at the cut, so the pace may change

  // ---------------------------------------------------------------- lengths
  // scripted events stay one at a time: the wave hits the shin HIT_AT into shot 10 as the camera eases off, the
  // gust follows the wave over the helicopter and quay shots, the lightning comes LEAD s into shot 13.
  const HIT_AT = 0.4, GAP = 0.3, LEAD = 2.0;
  const waveRun = (WAVE.z0 - WAVE.legZ) / WAVE.speed;
  const room = (d) => {
    const need = HIT_AT * d[9] + (EVENT_DUR.wave - waveRun) + GAP + EVENT_DUR.gust + GAP - LEAD; // shot 10 start -> shot 13 start
    const have = d[9] + d[10] + d[11];
    let j = 0;
    if (have < need) { const l = Math.log(need / have); j += 1e5 * l * l; }
    const need13 = LEAD + EVENT_DUR.lightning + 0.6;
    if (d[12] < need13) { const l = Math.log(need13 / d[12]); j += 1e5 * l * l; }
    return j;
  };
  const durs = solveLengths(shots, TOTAL, room);

  let total = 0; const starts = [];
  shots.forEach((s, k) => {
    s.dur = durs[k];
    starts.push(total); total += s.dur;
    s.warp = (tau) => THREE.MathUtils.clamp(s.progress(tau / s.dur), 0, 1);
  });
  const startOf = (k) => starts[k];

  // ---------------------------------------------------------------- scripted events (one at a time)
  const waveHit = startOf(9) + HIT_AT * shots[9].dur;
  const waveT0 = waveHit - waveRun;
  const gustT = Math.max(startOf(10) + 1.0, waveT0 + EVENT_DUR.wave + GAP);
  const lightT = Math.max(startOf(12) + LEAD, gustT + EVENT_DUR.gust + GAP);
  const evs = [
    { type: 'wave', t0: time0 + waveT0, seed: 11 },
    { type: 'gust', t0: time0 + gustT, seed: 12 },
    { type: 'lightning', t0: time0 + lightT, seed: 913, pos: [70, 560, -700] },
  ];
  const armR = M.elbowR.clone().lerp(M.wristR, 0.6);
  const shotAt = (t) => { let i = 0; while (i < N - 1 && t >= starts[i + 1]) i++; return i; };
  const cue = (t) => {
    const k = shotAt(t);
    if (k === 5) return { chest: armR };
    if (k === 2 || k === 3) return { chest: M.head.clone().add(V(-2, -2, 0)) };
    if (k === 6) return { arm: M.swordRoot.clone().lerp(M.swordTip, 0.5) };
    if (k === 9) return { arm: M.legL.clone().add(V(0, 8, 0)) };
    return null;
  };
  const cutMatch = (k) => { const a = shots[k].dirOut, b = shots[k + 1].dirIn; return +((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) || 1)).toFixed(2); };
  const timing = shots.map((s, k) => ({
    k: k + 1, start: +starts[k].toFixed(2), dur: +s.dur.toFixed(2), want: s.want, steady: s.profile === STEADY,
    vStart: +(s.vStart / s.dur).toFixed(3), vEnd: +(s.vEnd / s.dur).toFixed(3), vMean: +(s.theta / s.dur).toFixed(3), vMin: +(s.slowest / s.dur).toFixed(3),
    cutSpeed: k < N - 1 ? +((shots[k + 1].vStart / shots[k + 1].dur) / (s.vEnd / s.dur)).toFixed(2) : null, cutDir: k < N - 1 ? cutMatch(k) : null,
  }));
  return {
    duration: total, time0, shots, events: evs, cue, timing,
    apply(t, camera) {
      const k = shotAt(t);
      const s = shots[k];
      const r = s.path(s.warp(THREE.MathUtils.clamp(t - starts[k], 0, s.dur)));
      camera.position.copy(r.p); camera.fov = r.fov; camera.updateProjectionMatrix();
      camera.lookAt(r.t); camera.updateMatrixWorld();
      return k;
    },
  };
}
