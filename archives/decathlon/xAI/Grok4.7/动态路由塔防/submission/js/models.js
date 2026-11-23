/* 程序化模型。局部 +Z 为前方，由调用方设置 rotation.y = atan2(dir.x, dir.z)。 */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var TD = root.TD = root.TD || {};

  function mat(color, em, emi, rough, metal) {
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.42 : rough,
      metalness: metal == null ? 0.55 : metal,
      emissive: new THREE.Color(em || 0x000000),
      emissiveIntensity: emi == null ? 0.35 : emi
    });
    m.userData.baseI = m.emissiveIntensity;
    return m;
  }
  function add(g, mesh) { g.add(mesh); return mesh; }
  function box(g, w, h, d, color, x, y, z, em) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, em || color, 0.25));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function cyl(g, rt, rb, h, color, x, y, z, em) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat(color, em || color, 0.3));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function sph(g, r, color, x, y, z, em) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color, em || color, 0.45, 0.35, 0.4));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  function nose(g, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0xffffff, 0xffffff, 0.8));
    m.position.set(x, y, z);
    m.userData.nose = true;
    g.add(m);
    return m;
  }
  function finish(g, parts, tick) {
    g.userData.parts = parts;
    g.userData.tick = tick;
    return g;
  }

  function towerFirewall(level) {
    var g = new THREE.Group();
    box(g, 1.15, 0.18, 1.15, 0x163040, 0, 0.09, 0);
    var left = box(g, 0.18, level >= 2 ? 1.55 : 1.2, 0.9, 0x1d4e66, -0.42, 0.7, 0, 0x14485f);
    var right = box(g, 0.18, level >= 2 ? 1.55 : 1.2, 0.9, 0x1d4e66, 0.42, 0.7, 0, 0x14485f);
    var bars = [];
    for (var i = 0; i < (level >= 2 ? 4 : 3); i++) {
      bars.push(box(g, 0.7, 0.06, 0.08, 0x7ee7ff, 0, 0.4 + i * 0.28, 0.42, 0x3ec8ff));
    }
    if (level >= 2) box(g, 1.2, 0.1, 0.4, 0x9adfff, 0, 1.55, 0, 0x3ec8ff);
    nose(g, 0, 0.7, 0.62);
    return finish(g, { bars: bars, left: left, right: right }, function (group, u, time) {
      var p = group.userData.parts;
      for (var i = 0; i < p.bars.length; i++) {
        p.bars[i].material.emissiveIntensity = 0.4 + 0.6 * Math.abs(Math.sin(time * 3 + i));
      }
      var slam = u.anim > 0 ? Math.sin((0.3 - u.anim) * 18) * 0.08 : 0;
      p.left.position.x = -0.42 - slam;
      p.right.position.x = 0.42 + slam;
    });
  }

  function towerHoneypot(branch) {
    var g = new THREE.Group();
    cyl(g, 0.28, 0.38, 0.3, 0x3a2030, 0, 0.15, 0);
    var lure = sph(g, branch === 'mirror' ? 0.42 : 0.32, 0xff5ea8, 0, 0.7, 0, 0xff5ea8);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 6, 16), mat(0xffd0e6, 0xff8ac4, 0.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7;
    g.add(ring);
    var extras = [];
    if (branch === 'mirror') {
      for (var i = 0; i < 3; i++) extras.push(box(g, 0.16, 0.16, 0.16, 0xff9ac8, 0, 1.05, 0, 0xff5ea8));
    }
    if (branch === 'reflect') {
      for (var k = 0; k < 4; k++) {
        var sp = cyl(g, 0.02, 0.08, 0.35, 0xffe0f0, 0, 0.9, 0, 0xffd0e6);
        var a = k * Math.PI / 2;
        sp.position.set(Math.cos(a) * 0.28, 0.85, Math.sin(a) * 0.28);
        sp.rotation.z = Math.cos(a) * 0.8;
        sp.rotation.x = Math.sin(a) * 0.8;
      }
    }
    nose(g, 0, 0.7, 0.5);
    return finish(g, { lure: lure, ring: ring, extras: extras }, function (group, u, time) {
      var p = group.userData.parts;
      p.lure.position.y = 0.7 + Math.sin(time * 2.4) * 0.06;
      p.ring.rotation.z = time * 0.8;
      for (var i = 0; i < p.extras.length; i++) {
        var a = time * 1.4 + i * 2.1;
        p.extras[i].position.set(Math.cos(a) * 0.55, 1.05, Math.sin(a) * 0.55);
      }
    });
  }

  function towerGate(level) {
    var g = new THREE.Group();
    box(g, 1.3, 0.16, 1.3, 0x2a3340, 0, 0.08, 0);
    box(g, 0.16, 1.35, 0.7, 0x8b9bb4, -0.5, 0.75, 0);
    box(g, 0.16, 1.35, 0.7, 0x8b9bb4, 0.5, 0.75, 0);
    var doorL = box(g, 0.28, 0.9, 0.16, 0xd5dde6, -0.18, 0.6, 0, 0x9fb0c4);
    var doorR = box(g, 0.28, 0.9, 0.16, 0xd5dde6, 0.18, 0.6, 0, 0x9fb0c4);
    var halo = null;
    if (level >= 2) {
      halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 6, 20), mat(0xffb020, 0xffb020, 0.7));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.2;
      g.add(halo);
    }
    nose(g, 0, 0.7, 0.5);
    return finish(g, { doorL: doorL, doorR: doorR, halo: halo }, function (group, u, time) {
      var p = group.userData.parts;
      var open = u.dead ? 0.3 : 0.02 + Math.sin(time * 1.5) * 0.015;
      p.doorL.position.x = -0.16 - open;
      p.doorR.position.x = 0.16 + open;
      if (p.halo) p.halo.rotation.z = time * 0.6;
    });
  }

  function towerIntercept(branch) {
    var g = new THREE.Group();
    cyl(g, 0.34, 0.42, 0.28, 0x243044, 0, 0.16, 0);
    var head = new THREE.Group();
    head.position.y = 0.55;
    g.add(head);
    box(head, 0.36, 0.28, 0.36, 0x7aa2ff, 0, 0.1, 0, 0x7aa2ff);
    var barrel;
    if (branch === 'pierce') barrel = box(head, 0.08, 0.08, 1.15, 0xd6e4ff, 0, 0.12, 0.7, 0xffffff);
    else if (branch === 'suppress') {
      barrel = new THREE.Group();
      box(barrel, 0.08, 0.08, 0.55, 0xb7fff0, -0.1, 0.12, 0.4, 0x7dffe0);
      box(barrel, 0.08, 0.08, 0.55, 0xb7fff0, 0.1, 0.12, 0.4, 0x7dffe0);
      head.add(barrel);
    } else barrel = box(head, 0.12, 0.12, 0.78, 0xd6e4ff, 0, 0.12, 0.5, 0xffffff);
    var tip = nose(head, 0, 0.12, branch === 'pierce' ? 1.2 : 0.85);
    return finish(g, { head: head, barrel: barrel, tip: tip }, function (group, u, time) {
      var p = group.userData.parts;
      if (p.baseZ == null) p.baseZ = p.barrel.position.z;
      var kick = u.anim > 0 ? u.anim * 0.35 : 0;
      p.barrel.position.z = p.baseZ - kick;
      p.head.rotation.x = Math.sin(time * 1.6) * 0.04;
    });
  }

  function towerSandbox(level) {
    var g = new THREE.Group();
    cyl(g, 0.46, 0.5, 0.22, 0x14302c, 0, 0.12, 0);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9fffe8, 0x3dffc5, 0.45, 0.15, 0.1));
    dome.material.transparent = true;
    dome.material.opacity = 0.55;
    dome.position.y = 0.24;
    g.add(dome);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(level >= 2 ? 0.62 : 0.5, 0.035, 6, 20), mat(0x3dffc5, 0x3dffc5, 0.8));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    g.add(ring);
    nose(g, 0, 0.4, 0.48);
    return finish(g, { ring: ring, dome: dome }, function (group, u, time) {
      var p = group.userData.parts;
      p.ring.rotation.z = time * (1.2 + (u.anim > 0 ? 3 : 0));
      p.dome.scale.y = 1 + (u.anim > 0 ? u.anim * 0.4 : 0) + Math.sin(time * 2) * 0.03;
    });
  }

  function towerRepair(level) {
    var g = new THREE.Group();
    cyl(g, 0.22, 0.32, 0.25, 0x1c3320, 0, 0.14, 0);
    var arm = new THREE.Group();
    arm.position.y = 0.45;
    g.add(arm);
    box(arm, 0.08, 0.08, level >= 2 ? 0.9 : 0.7, 0x7dff6a, 0, 0, 0.3, 0x7dff6a);
    box(arm, 0.28, 0.08, 0.08, 0xb8ff9a, 0, 0, level >= 2 ? 0.72 : 0.58, 0x7dff6a);
    box(arm, 0.08, 0.28, 0.08, 0xb8ff9a, 0, 0, level >= 2 ? 0.72 : 0.58, 0x7dff6a);
    var bob = sph(g, 0.12, 0xc8ffb0, 0, 0.85, 0, 0x7dff6a);
    nose(g, 0, 0.45, 0.7);
    return finish(g, { arm: arm, bob: bob }, function (group, u, time) {
      var p = group.userData.parts;
      p.arm.rotation.y = Math.sin(time * 1.3) * 0.7;
      p.bob.position.y = 0.85 + Math.sin(time * 3) * 0.05;
    });
  }

  function enemyWorm() {
    var g = new THREE.Group();
    var segs = [];
    for (var i = 0; i < 4; i++) segs.push(sph(g, 0.22 - i * 0.03, i === 0 ? 0xc6ff8a : 0x7dba45, 0, 0.28, 0.35 - i * 0.28, 0x9be56b));
    nose(g, 0, 0.28, 0.55);
    return finish(g, { segs: segs }, function (group, u, time) {
      var p = group.userData.parts;
      for (var i = 0; i < p.segs.length; i++) {
        p.segs[i].position.y = 0.28 + Math.sin(time * 8 + i + (u.phase0 || 0)) * 0.06;
        p.segs[i].position.x = Math.sin(time * 6 + i) * 0.05;
      }
    });
  }

  function enemyFlood() {
    var g = new THREE.Group();
    var blobs = [];
    blobs.push(sph(g, 0.46, 0xff5a3c, 0, 0.42, 0, 0xff5a3c));
    blobs.push(sph(g, 0.28, 0xff8866, -0.32, 0.32, 0.1, 0xff5a3c));
    blobs.push(sph(g, 0.26, 0xff8866, 0.3, 0.3, -0.05, 0xff5a3c));
    blobs.push(sph(g, 0.2, 0xffd0a8, 0.05, 0.62, 0.22, 0xffb090));
    nose(g, 0, 0.4, 0.5);
    return finish(g, { blobs: blobs }, function (group, u, time) {
      var p = group.userData.parts;
      for (var i = 0; i < p.blobs.length; i++) {
        var s = 1 + Math.sin(time * 3 + i) * 0.08;
        p.blobs[i].scale.setScalar(s);
      }
    });
  }

  function enemyTrojan() {
    var g = new THREE.Group();
    var crate = new THREE.Group();
    box(crate, 0.5, 0.42, 0.5, 0xd9c39a, 0, 0.28, 0);
    box(crate, 0.52, 0.06, 0.08, 0x8a6a3a, 0, 0.28, 0.22);
    g.add(crate);
    var core = new THREE.Group();
    sph(core, 0.2, 0xff4455, 0, 0.32, 0, 0xff4455);
    box(core, 0.08, 0.08, 0.45, 0xff8890, 0, 0.32, 0.2, 0xff4455);
    box(core, 0.36, 0.06, 0.08, 0xff8890, 0, 0.2, 0.1, 0xff4455);
    core.visible = false;
    g.add(core);
    nose(g, 0, 0.3, 0.4);
    return finish(g, { crate: crate, core: core }, function (group, u, time) {
      var p = group.userData.parts;
      var shown = !!(u.revealed);
      p.crate.visible = !shown;
      p.core.visible = shown;
      p.core.rotation.y = time * 2;
      p.crate.position.y = Math.sin(time * 2) * 0.03;
    });
  }

  function enemyRansom() {
    var g = new THREE.Group();
    cyl(g, 0.08, 0.16, 0.7, 0x6a3080, 0, 0.4, 0, 0xd45bff);
    var dish = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 8), mat(0xd45bff, 0xd45bff, 0.5));
    dish.rotation.x = Math.PI / 2;
    dish.position.set(0, 0.72, 0.16);
    g.add(dish);
    var key = box(g, 0.16, 0.1, 0.1, 0xffe1ff, 0, 0.95, 0, 0xffb6ff);
    nose(dish, 0, 0, 0.2);
    return finish(g, { dish: dish, key: key }, function (group, u, time) {
      var p = group.userData.parts;
      p.dish.rotation.z = Math.sin(time * 3) * 0.4 + (u.anim > 0 ? 0.6 : 0);
      p.key.position.y = 0.95 + Math.sin(time * 4) * 0.04;
    });
  }

  function enemyFlyer() {
    var g = new THREE.Group();
    var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), mat(0x5ce1ff, 0x5ce1ff, 0.6, 0.3, 0.5));
    disc.position.y = 0.1;
    g.add(disc);
    var r1 = box(g, 0.5, 0.03, 0.08, 0xd9fbff, 0, 0.2, 0, 0xffffff);
    var r2 = box(g, 0.08, 0.03, 0.5, 0xd9fbff, 0, 0.22, 0, 0xffffff);
    sph(g, 0.1, 0xffffff, 0, 0.1, 0.1, 0xffffff);
    nose(g, 0, 0.12, 0.46);
    return finish(g, { r1: r1, r2: r2, disc: disc }, function (group, u, time) {
      var p = group.userData.parts;
      p.r1.rotation.y = time * 14;
      p.r2.rotation.y = -time * 11;
      p.disc.rotation.z = Math.sin(time * 2) * 0.08;
    });
  }

  function enemyShell() {
    var g = new THREE.Group();
    cyl(g, 0.32, 0.36, 0.4, 0xf0d080, 0, 0.32, 0, 0xf0d080);
    var plates = [];
    for (var i = 0; i < 3; i++) plates.push(box(g, 0.18, 0.22, 0.06, 0xfff1c2, 0, 0.4, 0.34, 0xffe7a0));
    nose(g, 0, 0.36, 0.46);
    return finish(g, { plates: plates }, function (group, u, time) {
      var p = group.userData.parts;
      for (var i = 0; i < p.plates.length; i++) {
        var a = time * 1.5 + i * 2.1;
        p.plates[i].position.set(Math.cos(a) * 0.4, 0.45, Math.sin(a) * 0.4);
      }
    });
  }

  function bossWankui() {
    var g = new THREE.Group();
    sph(g, 0.55, 0xff3355, 0, 0.7, 0, 0xff3355);
    var cages = [];
    for (var i = 0; i < 4; i++) {
      var c = new THREE.Group();
      box(c, 0.36, 0.36, 0.36, 0x4a1822, 0, 0, 0);
      c.children[0].material.wireframe = true;
      var worm = sph(c, 0.1, 0xc6ff8a, 0, 0, 0, 0x9be56b);
      cages.push({ g: c, worm: worm });
      g.add(c);
    }
    nose(g, 0, 0.7, 0.7);
    return finish(g, { cages: cages }, function (group, u, time) {
      var p = group.userData.parts;
      var open = u.phase >= 2 ? 0.35 : 0;
      for (var i = 0; i < p.cages.length; i++) {
        var a = time * 0.7 + i * Math.PI / 2;
        var rad = 0.85 + open;
        p.cages[i].g.position.set(Math.cos(a) * rad, 0.85 + Math.sin(time * 2 + i) * 0.08, Math.sin(a) * rad);
        p.cages[i].worm.position.y = Math.sin(time * 6 + i) * (0.05 + open);
      }
    });
  }

  function bossMirage() {
    var g = new THREE.Group();
    var shards = [];
    for (var i = 0; i < 5; i++) {
      var s = new THREE.Mesh(new THREE.OctahedronGeometry(i === 0 ? 0.48 : 0.22), mat(0xb388ff, 0xb388ff, 0.55, 0.2, 0.3));
      s.material.transparent = true;
      s.material.opacity = 0.8;
      shards.push(s);
      g.add(s);
    }
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 6, 24), mat(0xe7d4ff, 0xffffff, 0.8));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    nose(g, 0, 0.4, 0.7);
    return finish(g, { shards: shards, ring: ring }, function (group, u, time) {
      var p = group.userData.parts;
      p.shards[0].position.y = 0.7 + Math.sin(time * 2) * 0.06;
      p.shards[0].rotation.y = time * 0.8;
      for (var i = 1; i < p.shards.length; i++) {
        var a = time * (u.phase >= 2 ? 2.4 : 0.9) + i;
        p.shards[i].position.set(Math.cos(a) * 0.7, 0.55 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.7);
        p.shards[i].rotation.x = time;
      }
      p.ring.rotation.z = time * (u.phase >= 2 ? 2 : 0.4);
    });
  }

  function bossShadow() {
    var g = new THREE.Group();
    var cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 6), mat(0x2a2038, 0x6a4a88, 0.4, 0.6, 0.2));
    cloak.position.y = 0.8;
    g.add(cloak);
    var plates = [];
    for (var i = 0; i < 3; i++) plates.push(box(g, 0.5 - i * 0.08, 0.12, 0.5 - i * 0.08, 0xc9b6ff, 0, 0.5 + i * 0.28, 0.1, 0x8a70c8));
    var blades = [];
    blades.push(box(g, 0.08, 0.08, 0.9, 0xff5577, -0.35, 0.7, 0.3, 0xff3355));
    blades.push(box(g, 0.08, 0.08, 0.9, 0xff5577, 0.35, 0.7, 0.3, 0xff3355));
    var eye = sph(g, 0.08, 0xffe1ff, 0, 1.15, 0.28, 0xffffff);
    nose(g, 0, 0.9, 0.7);
    return finish(g, { cloak: cloak, plates: plates, blades: blades, eye: eye }, function (group, u, time) {
      var p = group.userData.parts;
      var ph = u.phase || 1;
      p.cloak.material.opacity = u.revealed ? 0.95 : 0.55;
      p.cloak.material.transparent = true;
      p.cloak.scale.x = 1 + Math.sin(time * 1.4) * 0.04;
      for (var i = 0; i < p.plates.length; i++) p.plates[i].visible = ph >= 2;
      for (var j = 0; j < p.blades.length; j++) {
        p.blades[j].visible = ph >= 3;
        p.blades[j].position.z = 0.3 + Math.sin(time * 2 + j) * 0.08;
      }
      p.eye.visible = !!u.revealed;
      p.eye.position.y = 1.15 + Math.sin(time * 3) * 0.03;
    });
  }

  function holderMesh() {
    var g = new THREE.Group();
    cyl(g, 0.22, 0.3, 0.35, 0xd7b4ff, 0, 0.2, 0, 0xd7b4ff);
    var arm = box(g, 0.08, 0.55, 0.08, 0xf3e6ff, 0, 0.55, 0, 0xffffff);
    return finish(g, { arm: arm }, function (group, u, time) {
      group.userData.parts.arm.rotation.y = time * 2;
      group.userData.parts.arm.scale.y = 1 + Math.sin(time * 6) * 0.05;
    });
  }

  TD.models = {
    tower: function (type, level, branch) {
      if (type === 'firewall') return towerFirewall(level);
      if (type === 'honeypot') return towerHoneypot(branch);
      if (type === 'gate') return towerGate(level);
      if (type === 'intercept') return towerIntercept(branch);
      if (type === 'sandbox') return towerSandbox(level);
      if (type === 'repair') return towerRepair(level);
      return towerFirewall(1);
    },
    enemy: function (type) {
      if (type === 'worm') return enemyWorm();
      if (type === 'flood') return enemyFlood();
      if (type === 'trojan') return enemyTrojan();
      if (type === 'ransom') return enemyRansom();
      if (type === 'flyer') return enemyFlyer();
      if (type === 'shell') return enemyShell();
      if (type === 'wankui') return bossWankui();
      if (type === 'mirage') return bossMirage();
      if (type === 'shadow') return bossShadow();
      return enemyWorm();
    },
    holder: holderMesh
  };
})(typeof window !== 'undefined' ? window : globalThis);
