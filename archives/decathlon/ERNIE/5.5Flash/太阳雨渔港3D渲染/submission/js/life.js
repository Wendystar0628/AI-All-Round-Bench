// ---------- seagulls, harbour cat, upturned skiff ----------
const LIFE = { gulls: [], cat: null, skiff: null };

function createGull() {
  const g = new THREE.Group();
  const white = toon(0xf8f9f3, { spec: 0.25, shine: 45, rim: 0.2 });
  const gray = toon(0xd3dad9, { spec: 0.2, shine: 40, rim: 0.16 });
  const dark = toon(0x4b5559, { spec: 0.2, rim: 0.1 });
  const beakM = toon(0xe0a33c, { spec: 0.3, shine: 50 });

  const body = sph(0.18, white, 0, 0, 0, 12, 9);
  body.scale.set(0.92, 0.85, 1.75);
  body.castShadow = true;
  g.add(body);
  const head = sph(0.105, white, 0, 0.11, 0.24, 10, 8);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.14, 6), beakM);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.10, 0.37);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), gray);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, 0.02, -0.34);
  tail.scale.set(1.2, 1, 0.5);
  g.add(tail);

  // wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.02, 0.02);
  wingShape.quadraticCurveTo(0.34, 0.16, 0.66, 0.06);
  wingShape.quadraticCurveTo(0.60, -0.08, 0.40, -0.16);
  wingShape.quadraticCurveTo(0.18, -0.18, 0.02, -0.06);
  const wgeo = new THREE.ShapeGeometry(wingShape, 6);
  wgeo.rotateX(-Math.PI / 2);
  const wings = [];
  [-1, 1].forEach(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.07, 0.05, 0.02);
    const w = new THREE.Mesh(wgeo, side > 0 ? gray : white);
    w.scale.x = side;
    w.castShadow = true;
    pivot.add(w);
    // dark wing tips
    const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.20), dark);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(side * 0.58, 0.005, -0.02);
    pivot.add(tip);
    g.add(pivot);
    wings.push({ pivot, side });
  });

  g.userData.wings = wings;
  return g;
}

function gullPerches() {
  const list = [
    { type: 'static', pos: new THREE.Vector3(-11.0, 0.84, 8.75) },
    { type: 'static', pos: new THREE.Vector3(-8.6, 0.84, 8.75) },
    { type: 'static', pos: new THREE.Vector3(-6.2, 0.84, 8.75) },
    { type: 'static', pos: new THREE.Vector3(-11.35, 0.84, 1.0) },
    { type: 'static', pos: new THREE.Vector3(5.9, 4.28, 10.4) },
    { type: 'static', pos: new THREE.Vector3(-6.2, 2.42, 14.4) }
  ];
  if (BOATS.hero) {
    const p = new THREE.Vector3(0.55, 2.35, 3.4);
    list.push({ type: 'boat', boat: BOATS.hero, local: p });
  }
  list.push({ type: 'water', pos: new THREE.Vector3(2.8, WATER_Y + 0.13, -5.0) });
  list.push({ type: 'water', pos: new THREE.Vector3(-5.2, WATER_Y + 0.13, 2.4) });
  return list;
}

function initLife(scene) {
  buildGulls(scene);
  buildCat(scene);
  buildSkiff(scene);
}

function buildGulls(scene) {
  const perches = gullPerches();
  const r = mulberry32(1001);
  for (let i = 0; i < 8; i++) {
    const g = createGull();
    const s = 0.85 + r() * 0.3;
    g.scale.setScalar(s);
    g.userData.tag = 'gull';
    scene.add(g);
    const rec = {
      group: g,
      phase: r() * TAU,
      radius: i >= 6 ? 5.5 + (i - 6) * 2.6 : 8 + i * 1.9,
      height: i >= 6 ? 3.0 + (i - 6) * 0.9 : 6.5 + (i % 4) * 1.7 + r() * 1.4,
      speed: 0.10 + r() * 0.05,
      flap: 5.5 + r() * 3.5,
      perch: perches[i % perches.length],
      perchCycle: 30 + i * 4.3,
      perchOffset: i === 0 ? 3 : r() * 20,
      low: i >= 6
    };
    LIFE.gulls.push(rec);
  }
}

function catPositionAt(t) {
  const lap = Math.floor(t / 26);
  const curves = LIFE.catPaths;
  const curve = curves[((lap % curves.length) + curves.length) % curves.length];
  const u = ((t % 26) / 26 + lap * 0.37) % 1;
  return { pos: curve.getPointAt(u), tan: curve.getTangentAt(u), u };
}

function buildCat(scene) {
  const cat = new THREE.Group();
  const white = toon(0xf2efe4, { spec: 0.22, shine: 40, rim: 0.16 });
  const orange = toon(0xd9995c, { spec: 0.16, shine: 30, rim: 0.12 });
  const dark = toon(0x5a5148, { spec: 0.1 });
  const pink = toon(0xd8a0a0, { spec: 0.2 });

  const body = sph(0.17, white, 0, 0.25, 0, 12, 9);
  body.scale.set(0.95, 0.85, 1.65);
  body.castShadow = true;
  cat.add(body);
  // orange patches
  const p1 = sph(0.13, orange, 0.0, 0.35, -0.02, 9, 7);
  p1.scale.set(0.95, 0.45, 1.2);
  cat.add(p1);
  const p2 = sph(0.09, orange, 0.02, 0.37, 0.20, 8, 6);
  p2.scale.set(1.0, 0.7, 0.9);
  cat.add(p2);

  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.24);
  const hs = sph(0.115, white, 0, 0, 0, 12, 9);
  hs.scale.set(1.0, 0.95, 1.0);
  head.add(hs);
  const patch = sph(0.08, orange, 0.03, 0.05, 0.02, 8, 6);
  patch.scale.set(1.0, 0.7, 1.0);
  head.add(patch);
  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), side > 0 ? orange : white);
    ear.position.set(side * 0.065, 0.11, -0.01);
    ear.rotation.z = side * -0.18;
    head.add(ear);
    const eye = sph(0.018, new THREE.MeshBasicMaterial({ color: 0x2b3a3a }), side * 0.045, 0.02, 0.10, 6, 5);
    head.add(eye);
  });
  const nose = sph(0.012, pink, 0, -0.02, 0.115, 5, 4);
  head.add(nose);
  cat.add(head);

  const legs = [];
  [[-0.09, 0.16], [0.09, 0.16], [-0.09, -0.16], [0.09, -0.16]].forEach(p => {
    const pivot = new THREE.Group();
    pivot.position.set(p[0], 0.20, p[1]);
    const leg = cyl(0.028, 0.024, 0.20, 5, white, 0, -0.10, 0);
    pivot.add(leg);
    const paw = sph(0.035, white, 0, -0.20, 0.01, 6, 5);
    paw.scale.set(1, 0.6, 1.2);
    pivot.add(paw);
    cat.add(pivot);
    legs.push({ pivot, phase: p[1] > 0 ? 0 : Math.PI });
  });

  const tail = new THREE.Group();
  tail.position.set(0, 0.30, -0.24);
  const segs = [];
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group();
    if (i > 0) seg.position.y = 0.07;
    const m = cyl(0.022 - i * 0.002, 0.024 - i * 0.002, 0.09, 5, i > 3 ? dark : (i > 1 ? orange : white), 0, 0.045, 0);
    seg.add(m);
    seg.rotation.x = 0.5;
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  cat.add(tail);
  cat.userData = { body, head, legs, tail, segs };
  cat.userData.tag = 'cat';
  scene.add(cat);
  LIFE.cat = cat;

  // cat paths on the quay
  const mk = (pts) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0.02, p[1])), true, 'catmullrom', 0.3);
  LIFE.catPaths = [
    mk([[7.6, 13.8], [6.0, 15.2], [3.0, 15.4], [1.2, 14.2], [1.4, 12.8], [3.0, 14.6]]),
    mk([[7.6, 13.8], [5.4, 15.2], [3.0, 15.4], [1.0, 14.0], [1.2, 12.6], [3.6, 14.2]]),
    mk([[7.6, 13.8], [7.0, 15.6], [4.0, 16.0], [1.0, 15.0], [0.6, 13.2], [3.0, 14.2]])
  ];
  // default position beside the upturned skiff
  cat.position.set(5.3, 0.02, 13.3);
}

function buildSkiff(scene) {
  const g = new THREE.Group();
  const L = 3.6, B = 1.35, D = 0.55;
  const { geo } = hullGeometry(L, B, D);
  const wood = toon(0xb08a5e, { map: cloneRepeat(TEX.wood, 1.5, 2), spec: 0.18, shine: 36, rim: 0.1, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(geo, wood);
  hull.castShadow = true; hull.receiveShadow = true;
  g.add(hull);
  // ribs on the (now upper) bottom
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.17;
    const z = -L / 2 + t * L;
    const w = B * 0.5 * (0.9 - Math.abs(t - 0.5) * 0.8);
    const rib = box(w * 2, 0.05, 0.06, MAT.woodDark, 0, -D + 0.48, z);
    g.add(rib);
  }
  // keel strip
  g.add(box(0.10, 0.06, L * 0.85, MAT.woodDark, 0, -D - 0.02, 0));
  // small painter rope
  const rope = makeRope(new THREE.Vector3(0, -D + 0.1, -L / 2), new THREE.Vector3(0.2, -0.4, -L / 2 - 0.8), 0.15, 0.02);
  g.add(rope);
  g.position.set(4.55, 0.36, 11.2);
  g.rotation.set(Math.PI - 0.12, 0.08, 0.03);
  g.userData.tag = 'skiff';
  scene.add(g);
  LIFE.skiff = g;
}

function updateLife(t, wind) {
  // ---- gulls ----
  const camPos = CAMERA ? CAMERA.position : null;
  LIFE.gulls.forEach((gu, i) => {
    const g = gu.group;
    const fly = new THREE.Vector3();
    const R = gu.radius;
    const ang = t * gu.speed + gu.phase;
    const cx = 0.5, cz = 0.5;
    let y = gu.height + Math.sin(t * 0.33 + gu.phase) * 1.1;
    if (gu.low) y = 2.8 + Math.sin(t * 0.5 + gu.phase) * 0.9;
    fly.set(
      cx + Math.cos(ang) * R,
      y,
      cz + Math.sin(ang) * R * 0.72
    );
    const tx = -Math.sin(ang) * R, tz = Math.cos(ang) * R * 0.72;
    const flyHeading = Math.atan2(tx, tz);

    // perch blending
    const cyc = gu.perchCycle;
    const p = (((t + gu.perchOffset) % cyc) + cyc) % cyc / cyc;
    let blend = 0;
    if (p > 0.42 && p < 0.80) {
      blend = smoothstep(0.42, 0.50, p) * (1 - smoothstep(0.72, 0.80, p));
    }
    // camera flee
    let flee = 0;
    let perchPos = new THREE.Vector3();
    if (gu.perch) {
      if (gu.perch.type === 'boat') {
        gu.perch.boat.group.updateMatrixWorld(true);
        perchPos.copy(gu.perch.local).applyMatrix4(gu.perch.boat.group.matrixWorld);
      } else {
        perchPos.copy(gu.perch.pos);
      }
      if (camPos) {
        const d = camPos.distanceTo(perchPos);
        flee = 1 - smoothstep(2.2, 7.5, d);
        if (flee > 0.01 && blend > 0.2) blend *= (1 - flee);
      }
    }
    const pos = fly.clone().lerp(perchPos, clamp(blend, 0, 1));
    if (flee > 0.01 && gu.perch) {
      pos.y += flee * (2.0 + i * 0.2);
      pos.x += flee * 0.8;
    }
    g.position.copy(pos);
    // orientation
    let heading = flyHeading;
    if (blend > 0.5 && gu.perch) {
      if (gu.perch.type === 'boat') {
        heading = gu.perch.boat.group.rotation.y;
      } else {
        heading = Math.atan2((camPos ? camPos.x : 0) - perchPos.x, (camPos ? camPos.z : 0) - perchPos.z) + Math.PI;
      }
    }
    // shortest-angle smoothing is unnecessary for a stylised bird; snap is hidden by motion
    g.rotation.y = heading;
    const flapAmt = (1 - blend) * (0.55 + 0.45 * Math.sin(t * gu.flap + gu.phase));
    const bank = (1 - blend) * 0.18 * Math.sin(t * 0.7 + gu.phase);
    g.rotation.z = bank;
    g.rotation.x = (1 - blend) * 0.06;
    const wings = g.userData.wings;
    wings.forEach(w => {
      if (blend > 0.6) {
        w.pivot.rotation.z = w.side * 1.35;
        w.pivot.rotation.y = w.side * -0.55;
      } else {
        w.pivot.rotation.z = w.side * flapAmt * 1.05;
        w.pivot.rotation.y = 0;
      }
    });
  });

  // ---- cat ----
  const cat = LIFE.cat;
  if (cat) {
    const ud = cat.userData;
    const rain = (typeof RAIN !== 'undefined') ? RAIN.intensity : 0.6;
    const out = smoothstep(0.72, 0.48, rain);
    const info = catPositionAt(t);
    const walkPos = info.pos;
    const under = new THREE.Vector3(5.3, 0.02, 13.3);
    const pos = under.clone().lerp(walkPos, out);
    // little arc when emerging
    pos.y += Math.sin(out * Math.PI) * 0.02;
    cat.position.copy(pos);
    const targetHeading = Math.atan2(info.tan.x, info.tan.z);
    let hd = targetHeading;
    if (out < 0.5) hd = -0.6;
    cat.rotation.y = hd;
    const walking = out > 0.55;
    const gait = t * 7.5;
    ud.legs.forEach((l, i) => {
      const sw = walking ? Math.sin(gait + l.phase + (i > 1 ? Math.PI : 0)) * 0.55 * out : 0;
      l.pivot.rotation.x = walking ? sw : (i < 2 ? -1.1 : 1.1);
    });
    ud.body.position.y = walking ? 0.25 + Math.abs(Math.sin(gait)) * 0.012 : 0.21;
    ud.body.scale.y = walking ? 0.85 : 0.78;
    ud.head.position.y = walking ? 0.34 : 0.28;
    ud.head.rotation.x = walking ? 0.05 : 0.28;
    // look at camera when near
    if (camPos) {
      cat.updateMatrixWorld(true);
      const d = camPos.distanceTo(cat.position);
      const look = 1 - smoothstep(4, 11, d);
      if (look > 0.01) {
        const local = cat.worldToLocal(camPos.clone());
        const yaw = Math.atan2(local.x, local.z);
        const pitch = -Math.atan2(local.y - 0.34, Math.hypot(local.x, local.z));
        ud.head.rotation.y = clamp(yaw, -0.9, 0.9) * look;
        ud.head.rotation.x = clamp(0.05 + pitch, -0.5, 0.5) * look + (walking ? 0.05 : 0.28) * (1 - look);
      } else {
        ud.head.rotation.y *= 0.9;
      }
    }
    // tail
    const tailSway = Math.sin(t * 1.6) * 0.25 + wind * 0.1;
    ud.segs.forEach((s, i) => {
      s.rotation.z = Math.sin(t * 1.4 + i * 0.6) * 0.16 * (0.5 + wind);
      s.rotation.x = (i === 0 ? -0.9 : 0.35) + tailSway * 0.15;
    });
    if (!walking) {
      ud.tail.rotation.x = -1.9;
      ud.tail.rotation.z = 0.5;
      ud.segs.forEach((s, i) => { s.rotation.x = 0.7; });
    } else {
      ud.tail.rotation.x = -0.9;
      ud.tail.rotation.z = 0;
    }
  }
}
