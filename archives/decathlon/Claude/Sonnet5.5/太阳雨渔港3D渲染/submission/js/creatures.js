'use strict';
/* 海鸥、港猫、水下鱼群、出港渔船、远处过往渔船 */
const Gulls = [], Fishes = [];
let CAT = null, VOY = null;

/* ================= 海鸥 ================= */
function makeGullModel() {
  const root = new THREE.Group();
  const P = new Parts(); P.jit = 0.0;
  P.sph(0.12, [0, 0, 0], '#f8f9f7', [0.78, 0.72, 1.9], 10, 8);
  P.sph(0.11, [0, 0.04, -0.03], '#b3c3c7', [0.8, 0.45, 1.55], 8, 6);
  P.sph(0.072, [0, 0.07, 0.27], '#f8f9f7', null, 9, 7);
  P.cone(0.022, 0.11, 6, [0, 0.055, 0.37], '#f2b630', [Math.PI / 2, 0, 0]);
  P.sph(0.012, [0.04, 0.085, 0.31], '#1b2226', null, 5, 4); P.sph(0.012, [-0.04, 0.085, 0.31], '#1b2226', null, 5, 4);
  P.box(0.14, 0.014, 0.2, [0, 0.0, -0.33], '#f8f9f7', [0.12, 0, 0]);
  P.box(0.1, 0.012, 0.1, [0, 0.0, -0.4], '#2b3b42');
  root.add(mesh(P.build(), toonMat({ vc: true, drops: 0.3, gloss: 0.2 }), { cast: true }));
  const L = new Parts(); L.jit = 0; L.rod([0.04, -0.06, 0.02], [0.04, -0.22, 0.04], 0.012, '#e8934a', 4); L.rod([-0.04, -0.06, 0.02], [-0.04, -0.22, 0.04], 0.012, '#e8934a', 4);
  L.box(0.07, 0.01, 0.1, [0.04, -0.22, 0.08], '#e8934a'); L.box(0.07, 0.01, 0.1, [-0.04, -0.22, 0.08], '#e8934a');
  const legs = mesh(L.build(), MAT.vc, { cast: false }); root.add(legs);
  const wingShape = (pts, side) => {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0] * side, -p[1])));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g;
  };
  const wmat = toonMat({ vc: true, side: THREE.DoubleSide, drops: 0.2, lift: 0.1 });
  const mkWing = (side) => {
    const hinge = new THREE.Group(); hinge.position.set(side * 0.07, 0.04, 0.06);
    const inner = [[0, 0.13], [0.16, 0.12], [0.31, 0.08], [0.33, -0.05], [0.16, -0.12], [0, -0.13]];
    const outer = [[0, 0.08], [0.14, 0.07], [0.3, 0.0], [0.4, -0.14], [0.2, -0.09], [0.0, -0.08]];
    const W = new Parts(); W.jit = 0;
    W.geo(wingShape(inner, side), [0, 0, 0], (x, y, z) => new Col(Math.abs(x) < 0.18 ? '#b9c8cc' : '#eef2f2'));
    const tip = new THREE.Group(); tip.position.x = side * 0.32; const T = new Parts(); T.jit = 0;
    T.geo(wingShape(outer, side), [0, 0, 0], (x, y, z) => new Col(Math.abs(x) > 0.12 ? '#27353b' : '#f3f6f6'));
    hinge.add(mesh(W.build(), wmat, { cast: true })); tip.add(mesh(T.build(), wmat, { cast: true })); hinge.add(tip);
    root.add(hinge); return { hinge, tip };
  };
  const wl = mkWing(-1), wr = mkWing(1);
  root.userData = { wl, wr, legs };
  return root;
}
function setWings(g, flap, fold) {
  const { wl, wr } = g.userData;
  const up = flap;             // -1..1
  for (const [w, s] of [[wl, -1], [wr, 1]]) {
    w.hinge.rotation.z = s * (up * 0.7 * (1 - fold) - fold * 0.2) * -1 * -1 + 0;
    w.hinge.rotation.z = -s * (-up * 0.75 * (1 - fold)) + s * fold * 0.1;
    w.hinge.rotation.y = s * fold * 1.25;
    w.tip.rotation.z = -s * (-up * 0.5 * (1 - fold)) + s * fold * 0.9;
    w.tip.rotation.y = s * fold * 0.7;
    w.hinge.scale.x = 1 - fold * 0.15;
  }
}

const GULL_SPOTS = [];
function buildGullSpots() {
  const B = Boats;
  const bol = (z) => ({ get: (v) => v.set(-6.64, QH + 0.55, z), yaw: Math.PI / 2 + 0.6, kind: 'bollard' });
  GULL_SPOTS.push({ ...bol(5.8), used: false }, { ...bol(-3.9), used: false }, { ...bol(-8.8), used: false });
  GULL_SPOTS.push({ get: (v) => v.set(-1.7, QH + 0.55, 6.64), yaw: 0.3, kind: 'bollard', used: false });
  // 船顶栏杆 / 桅杆
  GULL_SPOTS.push({ boat: B[1], local: new V3(0.0, 1.45, 0.4), yaw: 0.0, kind: 'boat', used: false });
  GULL_SPOTS.push({ boat: B[0], local: new V3(0.0, 2.35, 0.3), yaw: 1.0, kind: 'boat', used: false });
  GULL_SPOTS.push({ boat: B[2], local: new V3(0.0, 2.9, 0.3), yaw: 2.0, kind: 'boat', used: false });
  GULL_SPOTS.push({ get: (v) => v.set(6.9, QH + 3.95, 7.2 - 0.55), yaw: 1.5, kind: 'lamp', used: false });
  GULL_SPOTS.push({ get: (v) => v.set(3.0, 0.0, -2.0), yaw: 0.8, kind: 'water', used: false });
  GULL_SPOTS.push({ get: (v) => v.set(8.0, 0.0, 3.5), yaw: 2.4, kind: 'water', used: false });
  GULL_SPOTS.push({ get: (v) => v.set(1.5, 0.0, -9.0), yaw: -1.2, kind: 'water', used: false });
  GULL_SPOTS.push({ get: (v) => v.set(-2.5, 0.78 + 0.45, -11.1), yaw: 1.8, kind: 'bollard', used: false });
}
function spotPos(s, out) {
  if (s.boat) { out.copy(s.local); s.boat.g.localToWorld(out); } else s.get(out);
  return out;
}
function buildGulls(scene) {
  buildGullSpots();
  const N = 6;
  for (let i = 0; i < N; i++) {
    const g = makeGullModel(); g.scale.setScalar(0.9); scene.add(g);
    const o = { g, i, state: 'fly', a: rnd(0, TAU), cx: rnd(-2, 5), cz: rnd(-5, 3), r: rnd(4.5, 9), h: rnd(3.8, 7.5), w: (R() < 0.5 ? -1 : 1) * rnd(0.22, 0.38), ph: rnd(0, 6.28), spot: null, timer: rnd(8, 30), s: 0, from: new V3(), to: new V3(), flap: rnd(0, 6), cool: 0 };
    Gulls.push(o);
  }
  // 初始：两只落在码头/船上，一只浮在水面
  const place = (o, spotIdx) => { o.state = 'perch'; o.spot = GULL_SPOTS[spotIdx]; o.spot.used = true; o.timer = rnd(25, 60); };
  place(Gulls[0], 0); place(Gulls[1], 4); place(Gulls[2], 9);
  const tmp = new V3(), tmp2 = new V3(), cam = new V3();
  Systems.push((dt, t) => {
    const camP = APP.camera.position;
    for (const o of Gulls) {
      const g = o.g;
      o.flap += dt;
      if (o.state === 'fly') {
        o.a += o.w * dt;
        const x = o.cx + Math.cos(o.a) * o.r, z = o.cz + Math.sin(o.a) * o.r * 0.8;
        const y = o.h + Math.sin(o.a * 2.0 + o.ph) * 0.7 + (Env.windAt(x, z)) * 0.4;
        const nx = o.cx + Math.cos(o.a + 0.05 * Math.sign(o.w)) * o.r, nz = o.cz + Math.sin(o.a + 0.05 * Math.sign(o.w)) * o.r * 0.8;
        g.position.set(x, y, z);
        const hd = Math.atan2(nx - x, nz - z);
        g.rotation.y = lerpAngle(g.rotation.y, hd, 0.2); g.rotation.z = -Math.sign(o.w) * 0.32 + Math.sin(t * 0.7 + o.ph) * 0.06;
        g.rotation.x = Math.cos(o.a * 2 + o.ph) * 0.12;
        const flapOn = Math.sin(t * 0.35 + o.ph * 2) > -0.2 ? 1 : 0;
        setWings(g, flapOn ? Math.sin(o.flap * 7.5) * 0.9 : Math.sin(t * 0.6 + o.ph) * 0.12, 0);
        g.userData.legs.visible = false;
        // 偶尔俯冲掠过水面
        o.timer -= dt; o.cool -= dt;
        if (o.timer <= 0) { o.timer = rnd(10, 26); const free = GULL_SPOTS.filter(s => !s.used && !(s.cd > t)); const perched = Gulls.filter(q => q.state === 'perch' || q.state === 'approach').length; if (free.length && perched < 3 && R() < 0.8) { const s = pick(free); s.used = true; o.spot = s; o.state = 'approach'; o.s = 0; o.from.copy(g.position); o.dur = 5.5; } else { o.dip = 1; } }
        if (o.dip) { o.dip = 0; o.cz = rnd(-3, 3); o.h = rnd(0.45, 0.8); setTimeout(() => { o.h = rnd(3.8, 7.5); }, 3200); }
      } else if (o.state === 'approach') {
        o.s += dt / o.dur; const s = clamp(o.s, 0, 1);
        spotPos(o.spot, tmp);
        const mid = tmp2.copy(o.from).lerp(tmp, 0.55); mid.y = Math.max(tmp.y + 1.5, lerp(o.from.y, tmp.y, 0.6));
        const e = s;                      // 二次贝塞尔
        const bx = (1 - e) * (1 - e) * o.from.x + 2 * (1 - e) * e * mid.x + e * e * tmp.x, by = (1 - e) * (1 - e) * o.from.y + 2 * (1 - e) * e * mid.y + e * e * tmp.y, bz = (1 - e) * (1 - e) * o.from.z + 2 * (1 - e) * e * mid.z + e * e * tmp.z;
        const dx = bx - g.position.x, dz = bz - g.position.z;
        g.position.set(bx, by, bz);
        if (Math.hypot(dx, dz) > 1e-4) g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), 0.2);
        g.rotation.z *= 0.9; g.rotation.x = -0.25 * (1 - s) + 0.5 * s * s;
        setWings(g, Math.sin(o.flap * (9 + 5 * s)) * (0.5 + 0.5 * s), 0);
        g.userData.legs.visible = s > 0.7;
        if (s >= 1) { o.state = 'perch'; o.timer = rnd(14, 34); g.rotation.set(0, o.spot.yaw, 0); }
      } else if (o.state === 'perch') {
        spotPos(o.spot, tmp);
        const water = o.spot.kind === 'water';
        g.position.copy(tmp); g.position.y += water ? 0.06 + Math.sin(t * 1.4 + o.ph) * 0.03 : 0.2;
        if (water) { const w = Wake.at(tmp.x, tmp.z); g.position.y += w * 0.06 * Math.sin(t * 6); }
        g.rotation.y = lerpAngle(g.rotation.y, o.spot.yaw + Math.sin(t * 0.4 + o.ph) * 0.15, 0.1); g.rotation.x = Math.sin(t * 0.9 + o.ph) * 0.03; g.rotation.z = (o.spot.boat ? o.spot.boat.g.rotation.z : 0) * 0.5;
        setWings(g, 0, 1); g.userData.legs.visible = !water;
        if (water) g.position.y -= 0.12 - 0.0;
        // 偶尔转头(整体微转) 抖水
        if (Math.sin(t * 0.7 + o.ph * 5) > 0.985) g.rotation.y += 0.3 * Math.sin(t * 20);
        o.timer -= dt;
        const dcam = camP.distanceTo(g.position);
        if (o.timer <= 0 || dcam < 8.0) {
          o.state = 'takeoff'; o.s = 0; o.from.copy(g.position); o.fast = dcam < 8.0; o.spot.used = false; o.spot.cd = t + 25;
          o.a = Math.atan2((g.position.z - o.cz) / 0.8, g.position.x - o.cx); o.dur = o.fast ? 1.8 : 3.0; if (o.fast) o.cool = 6;
        }
      } else if (o.state === 'takeoff') {
        o.s += dt / o.dur; const s = clamp(o.s, 0, 1);
        const a1 = o.a + o.w * 0.9, tx = o.cx + Math.cos(a1) * o.r, tz = o.cz + Math.sin(a1) * o.r * 0.8, ty = o.h;
        const e = s * s * (3 - 2 * s);
        const x = lerp(o.from.x, tx, e), z = lerp(o.from.z, tz, e), y = lerp(o.from.y, ty, e) + Math.sin(s * Math.PI) * 0.5;
        const dx = x - g.position.x, dz = z - g.position.z; g.position.set(x, y, z);
        if (Math.hypot(dx, dz) > 1e-4) g.rotation.y = lerpAngle(g.rotation.y, Math.atan2(dx, dz), 0.25);
        g.rotation.x = -0.35 * (1 - s); g.rotation.z *= 0.9;
        setWings(g, Math.sin(o.flap * 12) * 1.0, 0); g.userData.legs.visible = s < 0.4;
        if (s >= 1) { o.state = 'fly'; o.a = a1; o.timer = rnd(14, 30); }
      }
    }
  });
}

/* ================= 港猫 ================= */
function makeCatModel() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const gin = '#e1893d', gin2 = '#c4692a', wht = '#f6f1e8';
  const B = new Parts(); B.jit = 0.0;
  B.sph(0.1, [0, 0.14, 0], gin, [0.95, 0.88, 1.75], 12, 10);
  B.sph(0.09, [0, 0.17, 0.04], gin2, [0.9, 0.4, 1.6], 10, 8);       // 背部条纹色
  B.sph(0.07, [0, 0.1, 0.15], wht, [0.9, 0.9, 1.0], 8, 6);          // 胸口白
  for (let i = 0; i < 4; i++) B.box(0.19, 0.012, 0.025, [0, 0.2, -0.12 + i * 0.07], gin2, [0.1, 0, 0]);
  const bm = mesh(B.build(), toonMat({ vc: true, drops: 0.5, gloss: 0.15 }), { cast: true }); body.add(bm);
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.2); body.add(head);
  const H = new Parts(); H.jit = 0;
  H.sph(0.085, [0, 0, 0], gin, [1.05, 0.95, 0.95], 12, 9);
  H.sph(0.05, [0, -0.025, 0.065], wht, [1.0, 0.7, 0.8], 8, 6);        // 口鼻白
  H.cone(0.04, 0.09, 4, [-0.055, 0.085, 0.0], gin, [0.1, 0, 0.25]); H.cone(0.04, 0.09, 4, [0.055, 0.085, 0.0], gin, [0.1, 0, -0.25]);
  H.cone(0.022, 0.06, 4, [-0.055, 0.082, 0.012], '#f1c7b8', [0.1, 0, 0.25]); H.cone(0.022, 0.06, 4, [0.055, 0.082, 0.012], '#f1c7b8', [0.1, 0, -0.25]);
  H.sph(0.014, [0, -0.0, 0.1], '#d99a8a', null, 5, 4);
  for (const s of [-1, 1]) { H.rod([s * 0.03, -0.02, 0.09], [s * 0.13, -0.01, 0.1], 0.004, '#f4f1ea', 3); H.rod([s * 0.03, -0.03, 0.09], [s * 0.12, -0.05, 0.09], 0.004, '#f4f1ea', 3); }
  head.add(mesh(H.build(), MAT.vc, { cast: false }));
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#d6a52c', toneMapped: false });
  const eyes = []; for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), eyeMat); e.position.set(s * 0.036, 0.015, 0.07); e.scale.set(1, 1.2, 0.5); head.add(e); eyes.push(e); const p = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.004), new THREE.MeshBasicMaterial({ color: '#1b1b1b' })); p.position.set(s * 0.036, 0.015, 0.078); head.add(p); e.userData.pupil = p; }
  // 腿
  const legs = [];
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
    const lg = new THREE.Group(); lg.position.set(x, 0.12, z); body.add(lg);
    const Lp = new Parts(); Lp.jit = 0; Lp.cyl(0.026, 0.02, 0.12, 6, [0, -0.06, 0], gin); Lp.sph(0.03, [0, -0.12, 0.01], z > 0 ? wht : gin, [1, 0.7, 1.3], 6, 5);
    lg.add(mesh(Lp.build(), MAT.vc, { cast: false })); legs.push(lg);
  }
  // 尾巴（链式）
  const tail = []; let parent = body; const T0 = new THREE.Group(); T0.position.set(0, 0.16, -0.2); body.add(T0); parent = T0;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group(); seg.position.z = i === 0 ? 0 : -0.065;
    const Tp = new Parts(); Tp.jit = 0; Tp.sph(0.03 - i * 0.002, [0, 0, -0.03], i > 3 ? gin2 : gin, [1, 1, 1.5], 6, 5); if (i === 5) Tp.sph(0.03, [0, 0, -0.07], wht, null, 6, 5);
    seg.add(mesh(Tp.build(), MAT.vc, { cast: false })); parent.add(seg); parent = seg; tail.push(seg);
  }
  root.userData = { body, head, legs, tail, eyes, bm };
  return root;
}
const CAT_SPOTS = [[8.3, 9.0], [7.4, 12.3], [6.0, 9.6], [4.9, 11.7], [2.0, 10.8], [0.8, 9.6], [-1.4, 11.9], [-3.4, 8.8], [4.8, 7.1], [6.6, 7.7], [8.4, 7.4], [7.2, 13.2], [-0.5, 13.0], [1.6, 7.3], [-5.0, 11.0], [3.6, 9.7]];
function catGround(x, z) { if (x > 9.9 && z > 8.2 && z < 11.6) return Math.max(QH - (x - 9.9) * (1.85 / 3.0), -0.8); return QH; }
function buildCat(scene) {
  const cat = makeCatModel(); cat.scale.setScalar(0.8); scene.add(cat);
  const home = new V3(10.85, 0, 11.05);
  CAT = { g: cat, state: 'rest', home, pos: home.clone(), yaw: 0.9, path: [], pi: 0, pause: 0, look: 0, lookCool: 0, walkPh: 0, t0: 0, speed: 0.6 };
  cat.rotation.order = 'ZYX'; cat.position.set(home.x, catGround(home.x, home.z) + 0.0, home.z); cat.rotation.y = CAT.yaw;
  Systems.push((dt, t) => updateCat(dt, t));
}
function updateCat(dt, t) {
  const C = CAT, g = C.g, u = g.userData;
  const cam = APP.camera.position;
  const dcam = cam.distanceTo(g.position);
  // 状态
  if (C.state === 'rest' && Env.catOut === 1 && Env.rainNow < 0.35) {
    C.state = 'emerge'; C.t0 = t; C.path = []; const n = rndi(3, 5), used = new Set();
    for (let i = 0; i < n; i++) { let k; do { k = Math.floor(R() * CAT_SPOTS.length); } while (used.has(k)); used.add(k); C.path.push(new V3(CAT_SPOTS[k][0], 0, CAT_SPOTS[k][1])); }
    C.path.push(new V3(home().x, 0, home().z)); C.pi = 0; C.pause = 0;
  }
  function home() { return C.home; }
  const wantHome = Env.catOut === 0 || Env.rainTarget > 0.5 || Env.rainNow > 0.55;
  if ((C.state === 'walk' || C.state === 'emerge' || C.state === 'sit') && wantHome && C.state !== 'return') { C.state = 'return'; C.path = [new V3(C.home.x, 0, C.home.z)]; C.pi = 0; C.speed = 1.9; }
  let moving = false, targetYaw = C.yaw;
  if (C.state === 'emerge') { C.state = 'walk'; C.speed = 0.7; }
  if (C.state === 'walk' || C.state === 'return') {
    if (C.pause > 0) { C.pause -= dt; }
    else {
      const tgt = C.path[C.pi];
      const dx = tgt.x - C.pos.x, dz = tgt.z - C.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.12) {
        C.pi++;
        if (C.pi >= C.path.length) {
          if (C.state === 'return') { C.state = 'rest'; Env.catHome = true; C.speed = 0.7; C.pos.copy(C.home); }
          else { C.state = 'rest'; }
        } else { if (R() < 0.45 && C.state === 'walk') C.pause = rnd(1.5, 4.0); }
      } else {
        const sp = C.speed * (C.state === 'return' ? 1 : (0.75 + 0.25 * Math.sin(t * 0.8)));
        C.pos.x += dx / d * sp * dt; C.pos.z += dz / d * sp * dt; moving = true;
        targetYaw = Math.atan2(dx, dz);
      }
    }
  }
  C.yaw = lerpAngle(C.yaw, targetYaw, 0.12);
  const gy = catGround(C.pos.x, C.pos.z);
  g.position.set(C.pos.x, gy, C.pos.z); g.rotation.y = C.yaw;
  // 坡面倾斜
  const slope = C.pos.x > 9.9 && C.pos.x < 13 && C.pos.z > 8.2 && C.pos.z < 11.6 ? -0.553 : 0;
  g.rotation.z += (slope - g.rotation.z) * 0.15;
  // 动画
  const rest = C.state === 'rest';
  const awake = !rest || C.look > 0;
  // 抬头看镜头
  C.lookCool -= dt;
  if (rest && dcam < 15 && C.look <= 0 && C.lookCool <= 0) { C.look = 4.5; C.lookCool = 14; }
  if (C.look > 0) C.look -= dt;
  const lookAmt = rest ? smooth(0, 0.6, C.look) * (1 - smooth(4.0, 4.5, 4.5 - C.look + 0.0) * 0) : 0;
  const bodyBase = rest ? 0.62 : 1.0;
  u.body.scale.set(1.0, lerp(bodyBase, 1.0, rest ? lookAmt * 0.5 : 1), lerp(rest ? 0.8 : 1.0, 1.0, rest ? lookAmt * 0.4 : 1));
  u.body.position.y = rest ? -0.03 * (1 - lookAmt) : 0;
  C.walkPh += dt * (moving ? (C.state === 'return' ? 14 : 8) : 0);
  u.legs.forEach((lg, i) => { const ph = C.walkPh + (i === 0 || i === 3 ? 0 : Math.PI); lg.rotation.x = moving ? Math.sin(ph) * (C.state === 'return' ? 0.8 : 0.55) : (rest ? -0.9 * (1 - lookAmt) : 0); lg.visible = !(rest && lookAmt < 0.4); });
  u.body.position.y += moving ? Math.abs(Math.sin(C.walkPh)) * 0.012 : 0;
  // 头：看镜头
  const headWorld = new V3(); u.head.getWorldPosition(headWorld);
  const toCam = cam.clone().sub(headWorld); const yawToCam = Math.atan2(toCam.x, toCam.z) - C.yaw;
  const yawLocal = lerpAngle(0, yawToCam, 1); const clampY = clamp(((yawLocal + Math.PI) % TAU + TAU) % TAU - Math.PI, -1.1, 1.1);
  const pitchToCam = clamp(Math.atan2(toCam.y, Math.hypot(toCam.x, toCam.z)), -0.3, 0.5);
  if (rest) {
    u.head.rotation.y += ((clampY * lookAmt) - u.head.rotation.y) * 0.1;
    u.head.rotation.x += ((-0.55 * (1 - lookAmt) - pitchToCam * lookAmt) - u.head.rotation.x) * 0.1;
    u.head.position.y = lerp(0.12, 0.23, lookAmt); u.head.position.z = lerp(0.2, 0.19, lookAmt);
  } else {
    u.head.rotation.y += (Math.sin(t * 0.7) * 0.2 - u.head.rotation.y) * 0.1; u.head.rotation.x += ((moving ? 0.1 : 0) - u.head.rotation.x) * 0.1; u.head.position.set(0, 0.22, 0.2);
    if (!moving && C.pause > 0 && dcam < 18) { u.head.rotation.y += (clampY * 0.7 - u.head.rotation.y) * 0.08; }
  }
  // 眼睛：睡觉时眯成线
  const eyeOpen = rest ? 0.12 + 0.88 * lookAmt : 1;
  for (const e of u.eyes) { e.scale.y = 1.2 * eyeOpen + 0.05; e.userData.pupil.visible = eyeOpen > 0.5; }
  // 呼吸、尾巴
  const br = 1 + Math.sin(t * 2.2) * (rest ? 0.045 : 0.015); u.bm.scale.set(br, br, 1);
  u.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * (moving ? 3 : 1.4) - i * 0.6) * (moving ? 0.14 : 0.09 + (rest ? 0.0 : 0.05)); s.rotation.x = rest ? (i === 0 ? 0.25 : 0.04) : (i === 0 ? 0.85 : (i < 4 ? 0.14 : -0.28)); });
  if (rest) { u.tail.forEach((s, i) => { s.rotation.y += 0.28 * (i / 5); }); }
  // 耳朵偶尔抖动：整体头小抖
  if (rest && Math.sin(t * 0.9 + 3) > 0.995) u.head.rotation.z = 0.12; else u.head.rotation.z *= 0.9;
}

/* ================= 水下鱼群 ================= */
function buildFish(scene) {
  const mkFish = (len, bodyCol, bellyCol, tailCol, stripe) => {
    const P = new Parts(); P.jit = 0.02;
    const sw = (x) => (x, y, z) => [clamp((-z / len - 0.1) / 0.55, 0, 1), 0.0];
    const swf = (x, y, z) => [clamp((-z / len - 0.05) / 0.6, 0, 1), 0];
    P.sph(len * 0.32, [0, 0, 0], (x, y, z) => new Col(y < -0.01 ? bellyCol : bodyCol), [0.5, 0.62, 1.55], 10, 8, swf);
    P.cone(len * 0.2, len * 0.35, 4, [0, 0, -len * 0.62], tailCol, [-Math.PI / 2, 0, 0]);
    P.geo(cached('tailF', () => { const g = new THREE.CircleGeometry(1, 3); return g; }), [0, 0, -len * 0.74], tailCol, [0, Math.PI / 2, 0], [len * 0.28, len * 0.28, 1], swf);
    P.cone(len * 0.12, len * 0.28, 3, [0, len * 0.18, -len * 0.05], tailCol, [0.2, 0, 0], swf);
    P.sph(len * 0.04, [len * 0.14, len * 0.07, len * 0.35], '#10181c', null, 5, 4); P.sph(len * 0.04, [-len * 0.14, len * 0.07, len * 0.35], '#10181c', null, 5, 4);
    if (stripe) P.sph(len * 0.32, [0, 0.0, 0], stripe, [0.52, 0.12, 1.5], 10, 6, swf);
    return P.build();
  };
  const mat = toonMat({ vc: true, under: true, sway: 5, side: THREE.DoubleSide });
  const gA = mkFish(0.34, '#8fb4b2', '#e7f2ee', '#6aa0a4', '#e8c34a');
  const gB = mkFish(0.5, '#d9604a', '#f3c9b8', '#c9503e', null);
  const schools = [
    { cx: 4.5, cz: -3.5, rx: 6.0, rz: 4.0, y: -1.6, n: 11, geo: gA, sp: 0.5, ph: 0, scat: 0 },
    { cx: 11.4, cz: 10.0, rx: 1.6, rz: 2.4, y: -1.9, n: 5, geo: gB, sp: 0.4, ph: 2, scat: 0 },
    { cx: 1.5, cz: 2.2, rx: 4.2, rz: 2.0, y: -1.3, n: 5, geo: gA, sp: 0.35, ph: 4, scat: 0 }
  ];
  for (const s of schools) {
    s.fish = [];
    for (let i = 0; i < s.n; i++) {
      const m = new THREE.Mesh(s.geo, mat); m.castShadow = false; m.receiveShadow = true; scene.add(m);
      s.fish.push({ m, off: new V3(rnd(-0.9, 0.9), rnd(-0.35, 0.35), rnd(-0.9, 0.9)), ph: rnd(0, 6.28), sc: new V3(), prev: new V3(), vel: new V3(), yaw: 0 });
      m.scale.setScalar(rnd(0.9, 1.15));
    }
  }
  Fishes.push(...schools);
  const cam = APP.camera, tmp = new V3();
  Systems.push((dt, t) => {
    for (const s of schools) {
      const a = t * s.sp * 0.5 + s.ph;
      const cx = s.cx + Math.sin(a * 0.9) * s.rx * 0.5, cz = s.cz + Math.sin(a * 1.3 + 1) * s.rz * 0.5, cy = s.y + Math.sin(a * 1.7) * 0.25;
      tmp.set(cx, cy, cz);
      const dcam = cam.position.distanceTo(tmp);
      const near = dcam < 12.5;
      s.scat += ((near ? 1 : 0) - s.scat) * Math.min(1, dt * (near ? 3.5 : 0.35));      // 散开快、聚拢慢
      for (const f of s.fish) {
        const o = f.off;
        const px = cx + o.x * (1 + s.scat * 3.2) + Math.sin(t * 0.8 + f.ph) * 0.25, py = cy + o.y * (1 + s.scat * 1.5) + Math.sin(t * 1.1 + f.ph) * 0.1 - s.scat * 0.35, pz = cz + o.z * (1 + s.scat * 3.2) + Math.cos(t * 0.7 + f.ph) * 0.25;
        // 约束在水体内
        const clx = clamp(px, -5.2, 13.3), clz = clamp(pz, -13.3, 13.3);
        f.sc.set(clx, clamp(py, -2.55, -0.55), clz);
        f.vel.subVectors(f.sc, f.prev); f.prev.copy(f.sc);
        f.m.position.copy(f.sc);
        if (f.vel.lengthSq() > 1e-8) { const yw = Math.atan2(f.vel.x, f.vel.z); f.yaw = lerpAngle(f.yaw, yw, 0.1); }
        f.m.rotation.y = f.yaw;
      }
    }
  });
}

/* ================= 出港渔船 ================= */
function buildVoyage(scene) {
  const b = Boats[2];
  const berth = b.home.clone();
  const pts = [
    [-4.83, -6.3], [-3.4, -6.7], [-1.0, -6.9], [1.8, -7.0], [4.2, -7.0], [6.6, -7.1], [7.7, -8.4], [7.7, -10.2], [7.9, -12.0], [8.7, -12.9], [9.5, -12.0], [9.6, -10.0], [9.2, -8.4], [8.0, -7.4], [5.0, -7.9], [2.3, -7.9], [-0.5, -7.9], [-2.6, -7.2], [-4.3, -6.5], [-4.83, -6.3]
  ].map(p => new V3(p[0], 0, p[1]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength();
  VOY = { b, curve, len, state: 'idle', u: 0, t: 0, lastWake: 0, speed: 1.75, slaps: [], hung: [] };
  // 离港后系船柱上垂下的缆绳端
  const mkEnd = (x, z) => { const bol = BOLLARDS.find(q => Math.abs(q.x - x) < 0.05 && Math.abs(q.z - z) < 0.05); const top = bol.top.clone(); const r = new Rope(scene, top, new V3(top.x + 0.9, -0.5, top.z - 0.1), { slack: 0.0, r: 0.052, n: 12 }); r.mesh.visible = false; r.top = top; r.end = new V3(top.x + 0.9, -0.5, top.z - 0.1); return r; };
  VOY.hung = [mkEnd(-6.64, -8.8), mkEnd(-6.64, -3.9)];
  // 远处过往渔船
  const mkFar = () => {
    const g = createBoat({ L: 3.6, B: 1.4, D: 0.4, F: 0.5, name: '海', sub: '', seed: 4, accent: '#2a8f94', hull: '#eef3f1', bottom: '#4a7a86', deck: '#a9c2bf', rail: '#e9ece6', extra: null });
    g.scale.setScalar(0.62); g.visible = false; scene.add(g);
    return g;
  };
  VOY.far = { g: mkFar(), active: false, u: 0, dir: 1, cool: 12 };
  Systems.push((dt, t) => updateVoyage(dt, t));
}
const _tv = new V3(), _tv2 = new V3();
function updateVoyage(dt, t) {
  const V = VOY, b = V.b, g = b.g;
  if (V.state === 'idle') {
    if (Env.boatOut === 1) { V.far.active = false; V.far.g.visible = false; V.far.cool = Math.max(V.far.cool, 70); V.state = 'castoff'; V.t = 0; b.mode = 'away'; for (const r of b.ropes) r.rope.mesh.visible = false; for (const h of V.hung) h.mesh.visible = true; V.from = g.position.clone(); V.fromYaw = g.rotation.y; }
  } else if (V.state === 'castoff') {
    V.t += dt; const s = clamp(V.t / 5.0, 0, 1);
    // 先松缆，船尾慢慢荡开，再起航
    const p0 = V.curve.getPointAt(0.0);
    g.position.set(lerp(V.from.x, p0.x - 0.0, 0.0) + 0.55 * s * s, 0.02 + Math.sin(t * 1.2) * 0.02, V.from.z + 0.0);
    g.rotation.y = lerpAngle(V.fromYaw, Math.atan2(V.curve.getTangentAt(0.02).x, V.curve.getTangentAt(0.02).z), smooth(0.2, 1.0, s));
    g.rotation.z = Math.sin(t * 1.1) * 0.03 + 0.04 * Math.sin(s * Math.PI);
    if (V.t > 5.0) { V.state = 'sail'; V.t = 0; V.u = 0.0; }
  } else if (V.state === 'sail') {
    const v = V.speed * (1 - 0.65 * smooth(0.92, 1.0, V.u)) * (0.35 + 0.65 * smooth(0.0, 0.05, V.u));
    V.u = Math.min(1, V.u + v * dt / V.len);
    const p = V.curve.getPointAt(V.u), tg = V.curve.getTangentAt(Math.min(0.999, V.u));
    const yaw = Math.atan2(tg.x, tg.z);
    const dyaw = ((yaw - g.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI;
    g.rotation.y += dyaw * Math.min(1, dt * 3.0);
    const endBlend = smooth(0.9, 1.0, V.u);
    g.position.set(p.x, 0.02 + Math.sin(t * 2.3) * 0.015 + 0.02 * Math.min(1, v), p.z);
    if (endBlend > 0) g.rotation.y = lerpAngle(g.rotation.y, b.homeHead, endBlend * 0.15);
    g.rotation.z = lerp(g.rotation.z, clamp(-dyaw * 0.9, -0.14, 0.14) + Math.sin(t * 1.6) * 0.02, 0.08);
    g.rotation.x = lerp(g.rotation.x, -0.035 * Math.min(1, v / 1.2) + Math.sin(t * 1.9) * 0.01, 0.1);
    // 航迹
    V.lastWake += dt;
    if (V.lastWake > 0.3 && v > 0.25) {
      V.lastWake = 0;
      _tv.set(0, 0, -1.9); g.localToWorld(_tv); Wake.add(_tv.x, _tv.z, clamp(v / 1.5, 0.3, 1));
      for (const [wx, wz, d] of [[-6.0, _tv.z, 1], [5.6, -11.6, 1], [5.4, -9.4, 1], [-1.8, -10.0, 1], [3.5, -12.2, 1]]) {
        const dist = Math.hypot(_tv.x - wx, _tv.z - wz); if (dist < 11) V.slaps.push({ at: Env.t + (dist - 0.3) / 1.5, x: wx, z: wz });
      }
    }
    if (V.u >= 1) { V.state = 'dock'; V.t = 0; V.dockFrom = g.position.clone(); V.dockYaw = g.rotation.y; }
  } else if (V.state === 'dock') {
    V.t += dt; const s = clamp(V.t / 4.0, 0, 1), e = s * s * (3 - 2 * s);
    g.position.set(lerp(V.dockFrom.x, b.home.x, e), 0.02, lerp(V.dockFrom.z, b.home.z, e));
    g.rotation.y = lerpAngle(V.dockYaw, b.homeHead, e); g.rotation.z *= 0.95; g.rotation.x *= 0.95;
    if (V.t > 4.0) { V.state = 'idle'; b.mode = 'moored'; for (const r of b.ropes) r.rope.mesh.visible = true; for (const h of V.hung) h.mesh.visible = false; Env.boatOut = 0; Env.boatDone = true; }
  }
  for (const h of V.hung) if (h.mesh.visible) h.update(t, h.top, _tv2.copy(h.end).add(new V3(Math.sin(t * 0.9) * 0.05, 0, 0)), 0.0);
  // 航迹浪拍上岸壁和消波块：到时间在受击点生成涟漪与泡沫
  for (let i = V.slaps.length - 1; i >= 0; i--) {
    const s = V.slaps[i]; if (Env.t >= s.at) { Ripples.add(s.x + (s.x < -5 ? 0.35 : 0), s.z, 1.0); Ripples.add(s.x + (s.x < -5 ? 0.6 : 0.1), s.z + 0.3, 0.8); addSlap(s.x, s.z, 1.0); V.slaps.splice(i, 1); }
  }
  // 远处渔船偶尔驶过
  const F = V.far;
  F.cool -= dt;
  if (!F.active && F.cool <= 0 && Env.event !== 'boat') { F.active = true; F.u = 0; F.dir = R() < 0.5 ? 1 : -1; F.g.visible = true; }
  if (F.active) {
    F.u += dt * 0.03;
    const x = F.dir > 0 ? lerp(13.4, 8.6, F.u) : lerp(8.6, 13.4, F.u);
    F.g.position.set(x, 0.01 + Math.sin(t * 1.4) * 0.02, -11.6 + Math.sin(F.u * 6) * 0.3); F.g.rotation.y = F.dir > 0 ? -Math.PI / 2 : Math.PI / 2; F.g.rotation.z = Math.sin(t * 0.9) * 0.03;
    if (F.u >= 1) { F.active = false; F.g.visible = false; F.cool = rnd(30, 55); }
    else if (F.u > 0.02 && Math.floor(t * 2) % 6 === 0) { }
  }
}
const FoamBoost = [];

function buildCreatures(scene) {
  buildGulls(scene); buildCat(scene); buildFish(scene); buildVoyage(scene);
}
