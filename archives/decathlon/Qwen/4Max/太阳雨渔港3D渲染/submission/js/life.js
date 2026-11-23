/* 海鸥、港猫、鱼群、远处渔船 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp, outline = H.outline;
  const life = {};
  H.life = life;

  // ---------- 海鸥 ----------
  function makeGull() {
    const g = grp(0, 0, 0, null);
    const body = sph(0.11, toon(P.gullWhite), 0, 0, 0, g, 10, 8);
    body.scale.set(0.85, 0.8, 1.5);
    outline(body, 0.008);
    const head = grp(0, 0.075, 0.15, g);
    sph(0.055, toon(P.gullWhite), 0, 0, 0, head, 9, 7);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), toon(P.beak));
    beak.position.set(0, -0.005, 0.075); beak.rotation.x = Math.PI / 2; head.add(beak);
    sph(0.009, toon(0x33383a), 0.032, 0.015, 0.035, head, 5, 4);
    sph(0.009, toon(0x33383a), -0.032, 0.015, 0.035, head, 5, 4);
    const tail = box(0.07, 0.015, 0.12, toon(P.gullGray), 0, 0.01, -0.2, g);
    tail.rotation.x = -0.15;
    const wings = [];
    [-1, 1].forEach(function (s) {
      const w = grp(s * 0.07, 0.045, 0.01, g);
      const inner = box(0.18, 0.014, 0.13, toon(P.gullGray), s * 0.09, 0, -0.01, w);
      const outer = box(0.16, 0.012, 0.1, toon(P.gullWhite), s * 0.25, 0, -0.03, w);
      const tip = box(0.07, 0.012, 0.08, toon(P.gullTip), s * 0.35, 0, -0.04, w);
      wings.push(w);
    });
    const legs = [];
    [-1, 1].forEach(function (s) {
      const leg = cyl(0.008, 0.008, 0.07, 5, toon(P.beak), s * 0.03, -0.09, 0.02, g);
      leg.visible = false;
      legs.push(leg);
    });
    return { group: g, head: head, wings: wings, legs: legs, body: body };
  }

  // ---------- 港猫 ----------
  function makeCat() {
    const g = grp(0, 0, 0, null);
    const fur = toon(P.catFur), dark = toon(P.catDark), white = toon(P.catWhite);
    const body = sph(0.13, fur, 0, 0.11, 0, g, 12, 9);
    body.scale.set(0.85, 0.8, 1.7);
    outline(body, 0.008);
    const chest = sph(0.08, white, 0, 0.09, 0.14, g, 8, 6);
    chest.scale.set(0.8, 0.75, 0.9);
    // 条纹
    for (let i = 0; i < 4; i++) {
      const st = box(0.16, 0.02, 0.03, dark, 0, 0.19, -0.1 + i * 0.07, g);
      st.rotation.x = 0.2;
    }
    const headG = grp(0, 0.19, 0.24, g);
    const head = sph(0.085, fur, 0, 0, 0, headG, 11, 9);
    outline(head, 0.007);
    sph(0.045, white, 0, -0.025, 0.055, headG, 8, 6);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 5), fur);
    earL.position.set(0.05, 0.085, -0.01); earL.rotation.z = -0.25; headG.add(earL);
    const earR = earL.clone(); earR.position.x = -0.05; earR.rotation.z = 0.25; headG.add(earR);
    sph(0.012, toon(0x6fae7c), 0.035, 0.01, 0.072, headG, 6, 5);
    sph(0.012, toon(0x6fae7c), -0.035, 0.01, 0.072, headG, 6, 5);
    sph(0.01, toon(0xd98a8a), 0, -0.02, 0.088, headG, 5, 4);
    const legs = [];
    [[-0.06, 0.14], [0.06, 0.14], [-0.06, -0.13], [0.06, -0.13]].forEach(function (p) {
      const leg = cyl(0.022, 0.026, 0.11, 6, fur, p[0], 0.055, p[1], g);
      legs.push(leg);
    });
    const tailSegs = [];
    for (let i = 0; i < 6; i++) {
      const ts = sph(0.026 - i * 0.002, i === 5 ? dark : fur, 0, 0.12, -0.24 - i * 0.05, g, 6, 5);
      tailSegs.push(ts);
    }
    return { group: g, body: body, head: headG, legs: legs, tail: tailSegs, ears: [earL, earR] };
  }

  // ---------- 鱼 ----------
  function makeFish(col) {
    const g = grp(0, 0, 0, null);
    const body = sph(0.05, toon(col), 0, 0, 0, g, 8, 6);
    body.scale.set(0.55, 0.7, 1.6);
    const belly = sph(0.04, toon(P.fishBelly), 0, -0.012, 0.01, g, 7, 5);
    belly.scale.set(0.5, 0.5, 1.4);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 5), toon(col));
    tail.position.set(0, 0, -0.1); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.5;
    g.add(tail);
    const fin = box(0.01, 0.03, 0.03, toon(col), 0, 0.035, 0, g);
    sph(0.007, toon(0x2a3a40), 0.02, 0.008, 0.06, g, 4, 3);
    return { group: g, tail: tail };
  }

  life.init = function (scene) {
    life.scene = scene;
    life.gulls = [];
    for (let i = 0; i < 5; i++) {
      const g = makeGull();
      scene.add(g.group);
      life.gulls.push(g);
    }
    life.cat = makeCat();
    scene.add(life.cat.group);
    life.fishes = [];
    const cols = [P.fish, 0x8fc9b8, 0xa8c9d9, 0x7fb8c9];
    for (let i = 0; i < 12; i++) {
      const f = makeFish(cols[i % 4]);
      scene.add(f.group);
      life.fishes.push(f);
    }
    // 远处渔船
    const db = grp(0, 0, 0, scene);
    const hull = box(0.8, 0.2, 0.26, toon(0xc9d8d6), 0, 0.1, 0, db);
    box(0.3, 0.22, 0.2, toon(0xdfe9e7), -0.05, 0.3, 0, db);
    cyl(0.015, 0.02, 0.4, 5, toon(0xb9cfcd), 0.1, 0.55, 0, db);
    db.visible = false;
    life.distantBoat = db;
  };

  life.update = function (t, st) {
    // 海鸥
    st.gulls.forEach(function (gs, i) {
      const g = life.gulls[i];
      g.group.position.copy(gs.pos);
      g.group.rotation.y = gs.heading;
      if (gs.mode === 'perch' || gs.mode === 'water') {
        g.group.rotation.z = 0;
        g.group.rotation.x = gs.mode === 'water' ? 0.05 * Math.sin(t * 1.3 + i) : 0;
        g.wings[0].rotation.z = 1.25; g.wings[1].rotation.z = -1.25;
        g.wings[0].rotation.y = 0.25; g.wings[1].rotation.y = -0.25;
        g.legs.forEach(function (l) { l.visible = gs.mode === 'perch'; });
        g.head.rotation.y = Math.sin(t * 0.4 + i * 2) * 0.4;
        g.head.rotation.x = gs.lookCam ? -0.3 : 0.05 * Math.sin(t * 0.7 + i);
        if (gs.mode === 'water') g.group.position.y = L.waterY + 0.03 + 0.02 * Math.sin(t * 1.5 + i * 2);
      } else {
        g.legs.forEach(function (l) { l.visible = false; });
        const flapAmp = gs.glide ? 0.12 : 0.75;
        const flapSpd = gs.glide ? 1.2 : 9.0;
        const f = Math.sin(t * flapSpd + gs.phase) * flapAmp;
        g.wings[0].rotation.z = f + 0.08; g.wings[1].rotation.z = -f - 0.08;
        g.wings[0].rotation.y = 0; g.wings[1].rotation.y = 0;
        g.group.rotation.z = gs.bank || 0;
        g.group.rotation.x = gs.pitch || 0;
        g.head.rotation.y = 0; g.head.rotation.x = 0;
      }
    });

    // 猫
    const cs = st.cat;
    const c = life.cat;
    c.group.position.copy(cs.pos);
    c.group.rotation.y = cs.heading;
    if (cs.mode === 'curled') {
      c.body.scale.set(0.95, 0.62, 1.35);
      c.body.position.y = 0.075;
      c.head.position.set(0.05, 0.1, 0.16);
      c.head.rotation.set(0.25, 0.5, 0);
      c.legs.forEach(function (l) { l.visible = false; });
      for (let i = 0; i < 6; i++) {
        const a = 1.2 + i * 0.5;
        c.tail[i].position.set(Math.cos(a) * (0.16 + i * 0.01), 0.05, Math.sin(a) * (0.16 + i * 0.01) - 0.05);
      }
    } else {
      c.body.scale.set(0.85, 0.8, 1.7);
      c.body.position.y = 0.11;
      c.legs.forEach(function (l) { l.visible = true; });
      const spd = cs.speed || 0;
      const swing = Math.sin(t * (spd > 0.8 ? 14 : 8)) * Math.min(0.5, spd * 0.6);
      c.legs[0].rotation.x = swing; c.legs[3].rotation.x = swing;
      c.legs[1].rotation.x = -swing; c.legs[2].rotation.x = -swing;
      c.group.position.y = cs.pos.y + Math.abs(Math.sin(t * (spd > 0.8 ? 14 : 8))) * 0.012 * Math.min(1, spd);
      c.head.position.set(0, 0.19, 0.24);
      if (cs.lookCam) {
        // 抬头看镜头
        const dx = st.camPos.x - cs.pos.x, dz = st.camPos.z - cs.pos.z;
        const local = Math.atan2(dx, dz) - cs.heading;
        c.head.rotation.set(-0.45, H.clamp(local, -0.9, 0.9), 0);
        c.ears[0].rotation.z = -0.1; c.ears[1].rotation.z = 0.1;
      } else {
        c.head.rotation.set(0.05 * Math.sin(t * 0.9), 0.15 * Math.sin(t * 0.5), 0);
        c.ears[0].rotation.z = -0.25; c.ears[1].rotation.z = 0.25;
      }
      for (let i = 0; i < 6; i++) {
        c.tail[i].position.set(Math.sin(t * 2.2 + i * 0.5) * 0.04 * (i + 1) * 0.3, 0.13 + i * 0.028, -0.24 - i * 0.045);
      }
    }

    // 鱼群
    const fsh = st.fish;
    life.fishes.forEach(function (f, i) {
      const a = fsh.angles[i] + t * fsh.speeds[i] * (1 + fsh.scatter * 1.5);
      const r = fsh.radii[i] * (1 + fsh.scatter * 2.8);
      const x = fsh.center.x + Math.cos(a) * r;
      const z = fsh.center.z + Math.sin(a) * r * 0.8;
      const y = fsh.center.y + Math.sin(t * 0.8 + i * 1.7) * 0.12 + fsh.yOff[i];
      f.group.position.set(x, y, z);
      f.group.rotation.y = -a - Math.PI / 2 + Math.sin(t * 3 + i) * 0.1;
      f.tail.rotation.y = Math.sin(t * 9 + i * 2) * 0.45;
    });

    // 远处渔船
    const db = st.distantBoat;
    if (db.visible) {
      life.distantBoat.visible = true;
      life.distantBoat.position.set(db.x, L.waterY - 0.02, db.z);
      life.distantBoat.rotation.y = db.heading;
      life.distantBoat.position.y += Math.sin(t * 1.1) * 0.015;
    } else {
      life.distantBoat.visible = false;
    }
  };

})(window.HARBOR);