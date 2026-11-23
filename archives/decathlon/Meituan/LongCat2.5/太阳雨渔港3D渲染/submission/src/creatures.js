import * as THREE from 'three';
import { PAL, WATER_Y, QUAY_Y, toon, flat, addOutline, box, cyl, sph, mulberry32, hash1, clamp, lerp, easeInOut, shadowify } from './common.js';

function makeGull() {
  const g = new THREE.Group();
  const white = toon(0xf4f2ea);
  const grey = toon(0xb9bcbe);
  const body = sph(0.16, white, 0, 0, 0, 10, 8);
  body.scale.set(1, 0.85, 1.5);
  g.add(body);
  const head = sph(0.09, white, 0, 0.1, 0.19, 8, 6);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 6), toon(0xe8a13a));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.1, 0.31);
  g.add(beak);
  const tail = box(0.1, 0.02, 0.14, grey, 0, 0.02, -0.22);
  g.add(tail);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1c1c1c });
  for (const s of [-1, 1]) {
    g.add(sph(0.016, eyeMat, s * 0.055, 0.13, 0.24, 5, 4));
  }
  const wingGeo = new THREE.PlaneGeometry(0.62, 0.2, 4, 1);
  wingGeo.translate(0.31, 0, 0);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(wingGeo, new THREE.MeshToonMaterial({ color: 0xeceadf, side: THREE.DoubleSide }));
    w.rotation.y = s > 0 ? 0 : Math.PI;
    pivot.add(w);
    pivot.position.set(s * 0.06, 0.05, 0.02);
    g.add(pivot);
    wings.push({ pivot, side: s });
  }
  shadowify(g);
  return { g, wings, head };
}

export function buildCreatures(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);

  const perches = [
    new THREE.Vector3(-0.85, 0.72, -26.5), new THREE.Vector3(-0.85, 0.72, -16.1),
    new THREE.Vector3(-0.85, 0.72, -5.7), new THREE.Vector3(-0.85, 0.72, 4.7),
    new THREE.Vector3(4.2, 0.72, -18.75), new THREE.Vector3(12.2, 0.72, -18.75),
    new THREE.Vector3(5.2, WATER_Y + 1.75, -16.4), new THREE.Vector3(-2.2, 4.5, -8),
  ];
  const gulls = [];
  const N_GULL = 6;
  for (let i = 0; i < N_GULL; i++) {
    const { g, wings, head } = makeGull();
    root.add(g);
    const T = 34 + hash1(i * 3 + 1) * 18;
    const perchIdx = i % perches.length;
    const center = new THREE.Vector3(10 + hash1(i * 5) * 10, 5 + hash1(i * 7) * 6, -10 + hash1(i * 9) * 12);
    const R = 5 + hash1(i * 11) * 9;
    const w = 0.20 + hash1(i * 13) * 0.12;
    gulls.push({
      g, wings, head, T, perch: perches[perchIdx], perchIdx, center, R, w,
      phase: hash1(i * 17) * 6.28,
      perchDur: 6 + hash1(i * 19) * 5,
      state: 'fly', stateT: 0, fromPos: new THREE.Vector3(), flushed: false,
      pos: new THREE.Vector3().copy(center),
    });
  }

  const catRoot = new THREE.Group();
  const catOrange = toon(PAL.catOrange);
  const catCream = toon(0xf0e0cc);
  const catBody = sph(0.19, catOrange, 0, 0.19, 0, 12, 9);
  catBody.scale.set(1.5, 0.95, 0.9);
  catRoot.add(catBody);
  const catHeadG = new THREE.Group();
  const catHead = sph(0.115, catOrange, 0, 0, 0, 10, 8);
  catHeadG.add(catHead);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 5), catOrange);
    ear.position.set(s * 0.07, 0.11, 0);
    ear.rotation.z = -s * 0.2;
    catHeadG.add(ear);
    catHeadG.add(sph(0.014, new THREE.MeshBasicMaterial({ color: 0x1c1c1c }), s * 0.045, 0.02, 0.1, 5, 4));
  }
  catHeadG.add(sph(0.02, catCream, 0, -0.03, 0.1, 6, 5));
  catHeadG.position.set(0.28, 0.3, 0);
  catRoot.add(catHeadG);
  const stripeMat = toon(0xb06f33);
  for (let i = 0; i < 3; i++) {
    catRoot.add(box(0.03, 0.02, 0.16, stripeMat, -0.05 - i * 0.09, 0.34 - i * 0.012, 0));
  }
  const legGeo = new THREE.CylinderGeometry(0.028, 0.024, 0.16, 6);
  const catLegs = [];
  for (const [lx, lz] of [[0.16, 0.09], [0.16, -0.09], [-0.16, 0.09], [-0.16, -0.09]]) {
    const leg = new THREE.Mesh(legGeo, catOrange);
    leg.geometry = legGeo.clone();
    leg.geometry.translate(0, -0.08, 0);
    leg.position.set(lx, 0.16, lz);
    catRoot.add(leg);
    catLegs.push(leg);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.26, 0.22, 0), new THREE.Vector3(-0.4, 0.3, 0.04),
    new THREE.Vector3(-0.48, 0.42, 0.02),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 8, 0.028, 6), catOrange);
  catRoot.add(tail);
  shadowify(catRoot);
  const catHome = new THREE.Vector3(1.75, -0.34, 7.9);
  catRoot.position.copy(catHome);
  root.add(catRoot);

  const dinghy = new THREE.Group();
  const hullMat = toon(0x9a7a55);
  const dinghyHull = sph(0.85, hullMat, 0, 0, 0, 14, 10);
  dinghyHull.scale.set(1.6, 0.55, 0.75);
  dinghy.add(dinghyHull);
  const dinghyRim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 6, 20), toon(0x7a5f40));
  dinghyRim.rotation.x = Math.PI / 2;
  dinghyRim.scale.set(1.25, 0.72, 1);
  dinghyRim.position.y = 0.10;
  dinghy.add(dinghyRim);
  dinghy.position.set(0.75, 0.36, 7.6);
  dinghy.rotation.z = 0.06;
  dinghy.rotation.y = 0.4;
  shadowify(dinghy);
  root.add(dinghy);

  const fishGroup = new THREE.Group();
  root.add(fishGroup);
  const fishMat = toon(0x9ab8c4);
  const fishMat2 = toon(0xb9ccd4);
  const fishBodyGeo = new THREE.ConeGeometry(0.06, 0.28, 6);
  fishBodyGeo.rotateZ(-Math.PI / 2);
  fishBodyGeo.scale(1, 0.6, 1);
  const fishTailGeo = new THREE.PlaneGeometry(0.1, 0.12);
  fishTailGeo.translate(-0.18, 0, 0);
  const fishes = [];
  const N_FISH = 14;
  for (let i = 0; i < N_FISH; i++) {
    const fg = new THREE.Group();
    const bodyM = new THREE.Mesh(fishBodyGeo, i % 3 === 0 ? fishMat2 : fishMat);
    const tailM = new THREE.Mesh(fishTailGeo, fishMat);
    fg.add(bodyM, tailM);
    fishGroup.add(fg);
    fishes.push({
      g: fg, tail: tailM,
      ph: hash1(i * 23) * 6.28,
      r: 0.5 + hash1(i * 29) * 2.2,
      sp: 0.5 + hash1(i * 31) * 0.5,
      yv: -5.6 + hash1(i * 37) * 2.4,
    });
  }
  const fishCenter = new THREE.Vector3(20, -6.0, 2);

  let catState = 'hide';
  let catTrip = 0;
  let catPath = [];
  let catPathLen = 0;
  let catT0 = 0;
  let catSpeed = 0.8;
  let gullPrevT = 0;

  const catWaypoints = [
    new THREE.Vector3(1.6, 0.02, 2.5), new THREE.Vector3(-1.6, 0, -24.5),
    new THREE.Vector3(-2.6, 0, -17.5), new THREE.Vector3(-4.5, 0, -11),
    new THREE.Vector3(-1.8, 0, -4), new THREE.Vector3(-3.4, 0, 2.5),
    new THREE.Vector3(-2.2, 0, 10), new THREE.Vector3(-6.0, 0, -7),
    new THREE.Vector3(-8.5, 0, -14), new THREE.Vector3(1.0, -0.04, 4.2),
  ];

  function pickCatPath() {
    const pts = [new THREE.Vector3(1.4, -0.02, 3.2)];
    const n = 4 + Math.floor(hash1(catTrip * 7) * 3);
    let idx = Math.floor(hash1(catTrip * 11) * catWaypoints.length);
    for (let i = 0; i < n; i++) {
      pts.push(catWaypoints[idx % catWaypoints.length].clone());
      idx += 1 + Math.floor(hash1(catTrip * 13 + i) * 2);
    }
    pts.push(catHome.clone());
    return pts;
  }

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    return L;
  }

  function pathPoint(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const seg = pts[i].distanceTo(pts[i - 1]);
      if (d <= seg) {
        const k = seg > 0 ? d / seg : 0;
        return pts[i - 1].clone().lerp(pts[i], k);
      }
      d -= seg;
    }
    return pts[pts.length - 1].clone();
  }

  function startCatWalk(t, returnHome = false) {
    catT0 = t;
    catPath = returnHome ? [catRoot.position.clone(), catHome.clone()] : pickCatPath();
    catPathLen = pathLength(catPath);
    catSpeed = returnHome ? 1.25 : 0.75 + hash1(catTrip * 3) * 0.3;
    catState = 'walk';
  }

  ctx.updaters.push((t, dyn) => {
    if (t < gullPrevT) {
      for (const gu of gulls) {
        gu.state = 'fly'; gu.flushed = false; gu.pos.copy(gu.center);
      }
      catState = 'hide'; catTrip = 0;
      catRoot.position.copy(catHome);
    }
    gullPrevT = t;

    for (const gu of gulls) {
      const local = t % gu.T;
      const flyDur = gu.T - gu.perchDur;
      const circlePos = (tt) => {
        const a = tt * gu.w + gu.phase;
        return new THREE.Vector3(
          gu.center.x + Math.cos(a) * gu.R,
          gu.center.y + Math.sin(tt * 0.7 + gu.phase) * 0.8,
          gu.center.z + Math.sin(a) * gu.R
        );
      };
      if (gu.state === 'fly') {
        gu.pos.copy(circlePos(local));
        gu.g.rotation.y = Math.atan2(-(Math.cos(local * gu.w + gu.phase)) , Math.sin(local * gu.w + gu.phase)) + Math.PI / 2;
        const flap = Math.sin(t * (7 + gu.w * 10) + gu.phase);
        for (const wg of gu.wings) wg.pivot.rotation.z = wg.side * (0.15 + flap * 0.5);
        if (local >= flyDur - 2.2 && !gu.flushed) {
          gu.state = 'landing';
          gu.fromPos.copy(gu.pos);
          gu.stateT = t;
        }
      } else if (gu.state === 'landing') {
        const k = clamp((t - gu.stateT) / 2.2, 0, 1);
        gu.pos.lerpVectors(gu.fromPos, gu.perch, easeInOut(k));
        for (const wg of gu.wings) wg.pivot.rotation.z = wg.side * (0.9 - k * 0.6);
        gu.g.rotation.y = Math.atan2(gu.perch.x - gu.fromPos.x, gu.perch.z - gu.fromPos.z) + Math.PI / 2;
        if (k >= 1) { gu.state = 'perch'; gu.stateT = t; }
      } else if (gu.state === 'perch') {
        gu.pos.copy(gu.perch);
        for (const wg of gu.wings) wg.pivot.rotation.z = wg.side * 0.35;
        gu.head.position.y = 0.1 + Math.sin(t * 2 + gu.phase) * 0.012;
        const camD = ctx.camera.position.distanceTo(gu.perch);
        if ((local >= gu.T - 0.5 && !gu.flushed) || (camD < 6.0 && !gu.flushed)) {
          gu.state = 'takeoff';
          gu.fromPos.copy(gu.pos);
          gu.stateT = t;
          gu.flushed = camD < 6.0;
        }
      } else if (gu.state === 'takeoff') {
        const k = clamp((t - gu.stateT) / 2.0, 0, 1);
        const target = circlePos(gu.flushed ? local : 0);
        gu.pos.lerpVectors(gu.fromPos, target, easeInOut(k));
        gu.pos.y += Math.sin(k * Math.PI) * 1.2;
        for (const wg of gu.wings) wg.pivot.rotation.z = wg.side * (0.35 + Math.sin(t * 16) * 0.6 * (1 - k));
        if (k >= 1) {
          gu.state = 'fly';
          if (gu.flushed) {
            gu.T = 20 + hash1(Math.floor(t)) * 10;
          }
        }
      }
      if (gu.state === 'fly' && gu.flushed && ctx.camera.position.distanceTo(gu.perch) > 12) {
        gu.flushed = false;
      }
      gu.g.position.copy(gu.pos);
    }

    const camPos = ctx.camera.position;
    if (catState === 'hide') {
      catRoot.position.set(catHome.x, catHome.y + 0.02 + Math.sin(t * 1.4) * 0.008, catHome.z);
      catRoot.rotation.set(0, 0.6, 0);
      catBody.scale.set(1.5, 0.95, 0.9);
      catHeadG.position.set(0.28, 0.24, 0);
      catLegs.forEach((leg) => { leg.rotation.x *= 0.9; });
      if (dyn.rain < 0.42) {
        catTrip++;
        startCatWalk(t);
      }
    } else if (catState === 'walk') {
      const d = (t - catT0) * catSpeed;
      if (d >= catPathLen) {
        catState = 'hide';
        catRoot.position.copy(catHome);
      } else {
        const pos = pathPoint(catPath, d);
        const ahead = pathPoint(catPath, Math.min(d + 0.4, catPathLen));
        catRoot.position.copy(pos);
        catRoot.position.y = pos.y + Math.abs(Math.sin(t * 9)) * 0.018;
        const dvec = ahead.sub(pos);
        if (dvec.lengthSq() > 1e-6) {
          const targetYaw = Math.atan2(dvec.x, dvec.z);
          let dy = targetYaw - catRoot.rotation.y;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          catRoot.rotation.y += dy * 0.15;
        }
        catLegs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 9 + i * 1.57) * 0.45; });
        tail.rotation.y = Math.sin(t * 3) * 0.3;
        catHeadG.rotation.y = Math.sin(t * 0.7) * 0.35;
      }
      if (dyn.rain > 0.55) {
        startCatWalk(t, true);
      }
    }
    const camDist = camPos.distanceTo(catRoot.position);
    if (camDist < 6 && catState === 'hide') {
      const dir = camPos.clone().sub(catRoot.position);
      const yaw = Math.atan2(dir.x, dir.z) - catRoot.rotation.y;
      catHeadG.rotation.y = clamp(yaw, -1.1, 1.1);
      catHeadG.rotation.x = clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.5, -0.4, 0.4);
    } else {
      catHeadG.rotation.x *= 0.95;
    }

    const fishCamD = Math.hypot(camPos.x - fishCenter.x, camPos.z - fishCenter.z);
    const camUnderwater = camPos.y < WATER_Y - 0.3;
    const effScatter = clamp((10.5 - fishCamD) / 5, 0, 1) * (camUnderwater ? 1 : 0);
    for (const f of fishes) {
      const a = t * f.sp * 0.4 + f.ph;
      const rr = f.r + effScatter * 2.2;
      const px = fishCenter.x + Math.cos(a) * rr + effScatter * Math.cos(f.ph * 3.1) * 1.5;
      const pz = fishCenter.z + Math.sin(a) * rr + effScatter * Math.sin(f.ph * 3.1) * 1.5;
      const py = fishCenter.y + f.yv * 0.3 + Math.sin(t * 0.8 + f.ph) * 0.2;
      f.g.position.set(px, py, pz);
      f.g.rotation.y = Math.atan2(-(Math.cos(a)), Math.sin(a)) + Math.PI / 2;
      f.tail.rotation.y = Math.sin(t * 6 + f.ph) * 0.5;
    }
  });
}
