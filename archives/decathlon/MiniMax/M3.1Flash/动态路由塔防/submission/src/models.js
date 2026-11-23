/* =========================================================================
 *  动态路由塔防 · 模型库
 *  models.js — 塔 / 敌人 / Boss 的程序化建模与动画
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;
  const Art = RT.Art;

  const G = {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 16),
    cyl8: new T.CylinderGeometry(1, 1, 1, 8),
    sph: new T.SphereGeometry(1, 18, 12),
    sph8: new T.SphereGeometry(1, 12, 8),
    cone: new T.ConeGeometry(1, 1, 10),
    torus: new T.TorusGeometry(1, 0.12, 8, 28),
    ring: new T.RingGeometry(0.8, 1, 32),
    plane: new T.PlaneGeometry(1, 1),
    oct: new T.OctahedronGeometry(1, 0),
    icos: new T.IcosahedronGeometry(1, 0),
    tetra: new T.TetrahedronGeometry(1, 0),
    capsule: new T.CapsuleGeometry(0.5, 0.8, 6, 12)
  };

  function m(geo, mat, x, y, z, sx, sy, sz) {
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (sx !== undefined) mesh.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function glow(color, size, opacity) {
    const s = new T.Sprite(new T.SpriteMaterial({
      map: Art.getTextures(RT.DATA.MAPS[0].theme).glowWhite,
      color: new T.Color(color), transparent: true,
      opacity: opacity === undefined ? 0.65 : opacity,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(size, size, 1);
    return s;
  }
  function baseMat(color, rough, metal) {
    return Art.std(color, { roughness: rough === undefined ? 0.5 : rough, metalness: metal === undefined ? 0.6 : metal });
  }
  function emisMat(color, i) { return Art.emis(color, i); }

  /* =======================================================================
   *  塔
   * ===================================================================== */
  function makeTower(type, opt) {
    opt = opt || {};
    const group = new T.Group();
    const api = { group: group, type: type, level: 1, branch: null, anim: { t: Math.random() * 6, recoil: 0, flash: 0 } };

    if (type === 'firewall') {
      const steel = baseMat('#243447', 0.45, 0.7);
      const dark = baseMat('#141c28', 0.6, 0.5);
      const blue = emisMat('#49a9ff', 1.5);
      group.add(m(Art.hexGeo(0.72, 0.26), steel, 0, 0.13, 0));
      const plate = m(G.box, steel, 0, 0.72, 0, 1.0, 1.15, 0.3);
      group.add(plate);
      api.shield = m(G.box, blue, 0, 0.72, 0.16, 0.78, 0.9, 0.06);
      api.shield.material = blue.clone();
      group.add(api.shield);
      for (let i = 0; i < 3; i++) group.add(m(G.box, dark, 0, 0.42 + i * 0.3, -0.2, 1.12, 0.08, 0.42));
      group.add(glow('#3f9dff', 1.9, 0.45)).position.set(0, 0.7, 0);
      api.shieldGlow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.shieldGlow.material.opacity = 0.35 + 0.18 * Math.sin(this.t * 2.4);
        api.shield.scale.y = 0.9 + 0.06 * Math.sin(this.t * 2.0);
        if (api.level > 1) plate.scale.y = 1.15 + 0.05 * Math.sin(this.t * 1.6);
      };
      api.setLevel = function (lv) {
        this.level = lv;
        plate.scale.set(1.0, lv > 1 ? 1.42 : 1.15, 0.3);
        api.shield.scale.set(0.78, lv > 1 ? 1.15 : 0.9, 0.06);
        group.add(m(G.box, dark, 0, 1.05, -0.18, 1.2, 0.12, 0.5)); // 二级加强环
      };
    }

    else if (type === 'honeypot') {
      const gold = baseMat('#8a6a24', 0.35, 0.85);
      const amber = emisMat('#ffc44d', 2.0);
      group.add(m(Art.hexGeo(0.6, 0.18), baseMat('#2a2114', 0.6, 0.5), 0, 0.09, 0));
      api.core = m(G.sph, amber, 0, 0.62, 0, 0.34, 0.42, 0.34);
      group.add(api.core);
      api.shell = m(G.sph, new T.MeshStandardMaterial({
        color: new T.Color('#ffd77a'), transparent: true, opacity: 0.3,
        roughness: 0.1, metalness: 0.2, emissive: new T.Color('#ff9f2e'), emissiveIntensity: 0.7,
        side: T.DoubleSide
      }), 0, 0.62, 0, 0.62, 0.66, 0.62);
      group.add(api.shell);
      api.rings = [];
      for (let i = 0; i < 2; i++) {
        const r = m(G.torus, gold, 0, 0.62, 0, 0.72 + i * 0.16, 0.72 + i * 0.16, 1);
        r.rotation.x = Math.PI / 2; group.add(r); api.rings.push(r);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const sp = m(G.cone, gold, Math.cos(a) * 0.5, 0.42, Math.sin(a) * 0.5, 0.1, 0.42, 0.1);
        sp.rotation.z = Math.cos(a) * 0.5; sp.rotation.x = -Math.sin(a) * 0.5;
        group.add(sp);
      }
      group.add(glow('#ffb347', 1.7, 0.5)).position.set(0, 0.62, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.rings[0].rotation.z += dt * 1.4; api.rings[1].rotation.z -= dt * 0.9;
        api.rings[0].rotation.y = Math.sin(this.t) * 0.4;
        api.core.scale.set(0.34 + Math.sin(this.t * 3) * 0.02, 0.42, 0.34 + Math.cos(this.t * 3) * 0.02);
        api.glow.material.opacity = 0.4 + 0.16 * Math.sin(this.t * 2.6);
      };
      api.setBranch = function (id) {
        this.branch = id;
        if (id === 'deep') { api.shell.scale.set(0.78, 0.82, 0.78); api.core.scale.set(0.4, 0.5, 0.4); }
        else { api.shell.scale.set(0.62, 0.66, 0.62); api.core.scale.set(0.38, 0.44, 0.38); }
      };
    }

    else if (type === 'gateway') {
      const frame = baseMat('#1b3a3a', 0.5, 0.7);
      const teal = emisMat('#52e5c8', 1.8);
      group.add(m(G.cyl8, baseMat('#10201f', 0.7, 0.4), 0, 0.08, 0, 0.85, 0.16, 0.85));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        group.add(m(G.box, frame, Math.cos(a) * 0.72, 0.42, Math.sin(a) * 0.72, 0.14, 0.84, 0.14));
      }
      group.add(m(G.box, frame, 0, 0.88, 0, 1.6, 0.14, 0.2));
      api.gates = [];
      for (let i = 0; i < 2; i++) {
        const g = m(G.box, frame, 0, 0.45, (i ? 0.22 : -0.22), 1.3, 0.78, 0.1);
        group.add(g); api.gates.push(g);
      }
      api.barrier = m(G.box, new T.MeshBasicMaterial({
        color: new T.Color('#52e5c8'), transparent: true, opacity: 0.16,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      }), 0, 0.45, 0, 1.3, 0.78, 0.4);
      group.add(api.barrier);
      group.add(glow('#52e5c8', 1.6, 0.4)).position.set(0, 0.5, 0);
      api.glow = group.children[group.children.length - 1];
      api.closed = false;
      api.anim.update = function (dt) {
        this.t += dt;
        const target = api.closed ? 0 : 0.22;
        api.gates[0].position.z += (target - 0.22 - api.gates[0].position.z) * Math.min(1, dt * 6);
        api.gates[1].position.z += (target - 0.22 - api.gates[1].position.z) * Math.min(1, dt * 6);
        api.barrier.material.opacity = api.closed ? 0.22 + 0.08 * Math.sin(this.t * 4) : 0.04;
        api.glow.material.opacity = api.closed ? 0.55 : 0.18;
      };
      api.setClosed = function (v) { api.closed = v; };
    }

    else if (type === 'interceptor') {
      const steel = baseMat('#3a2b45', 0.4, 0.75);
      const dark = baseMat('#1c1526', 0.6, 0.5);
      const pink = emisMat('#ff7bd5', 2.2);
      group.add(m(G.cyl8, dark, 0, 0.1, 0, 0.62, 0.2, 0.62));
      group.add(m(G.cyl, steel, 0, 0.3, 0, 0.2, 0.4, 0.2));
      api.head = new T.Group(); api.head.position.y = 0.58; group.add(api.head);
      api.head.add(m(G.box, steel, 0, 0, 0, 0.58, 0.34, 0.68));
      api.barrel = m(G.cyl, dark, 0, 0.02, 0.62, 0.075, 0.8, 0.075);
      api.barrel.rotation.x = Math.PI / 2; api.head.add(api.barrel);
      api.muzzle = m(G.sph, pink, 0, 0.02, 1.0, 0.13, 0.13, 0.13);
      api.head.add(api.muzzle);
      for (let i = 0; i < 2; i++) {
        const wing = m(G.box, steel, i ? 0.44 : -0.44, 0.06, -0.1, 0.34, 0.05, 0.5);
        wing.rotation.z = i ? -0.35 : 0.35; api.head.add(wing);
      }
      api.emitter = m(G.sph8, pink, 0, 0.02, -0.34, 0.12, 0.12, 0.12);
      api.head.add(api.emitter);
      api.ring = m(G.torus, steel, 0, 0.58, 0, 0.5, 0.5, 1); api.ring.rotation.x = Math.PI / 2;
      group.add(api.ring);
      group.add(glow('#ff7bd5', 1.5, 0.35)).position.set(0, 0.58, 0.4);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.ring.rotation.z += dt * 0.8;
        api.glow.material.opacity = 0.25 + 0.12 * Math.sin(this.t * 3);
        if (this.recoil > 0) {
          this.recoil -= dt * 4;
          api.barrel.position.z = 0.62 - this.recoil * 0.2;
        }
      };
      api.aim = function (x, z) {
        const a = Math.atan2(x - group.position.x, z - group.position.z);
        let d = a - api.head.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        api.head.rotation.y += d * 0.25;
      };
      api.setBranch = function (id) {
        this.branch = id;
        if (id === 'pierce') {
          api.barrel.scale.set(0.09, 0.9, 0.09); api.muzzle.scale.set(0.17, 0.17, 0.17);
          api.barrel.material = emisMat('#ffd0f4', 2.4);
        } else if (id === 'suppress') {
          api.barrel.scale.set(0.11, 0.72, 0.11); api.muzzle.scale.set(0.2, 0.2, 0.2);
          api.emitter.scale.set(0.18, 0.18, 0.18);
        }
      };
      api.setLevel = function (lv) {
        this.level = lv;
        api.head.scale.setScalar(lv > 1 ? 1.14 : 1);
        api.ring.scale.setScalar(lv > 1 ? 1.2 : 1);
      };
    }

    else if (type === 'sandbox') {
      const dark = baseMat('#241d3d', 0.5, 0.6);
      const violet = emisMat('#a78bfa', 2.0);
      group.add(m(G.cyl8, dark, 0, 0.1, 0, 0.66, 0.2, 0.66));
      api.core = m(G.box, violet, 0, 0.42, 0, 0.42, 0.42, 0.42);
      group.add(api.core);
      api.dome = m(G.sph, new T.MeshStandardMaterial({
        color: new T.Color('#b9a8ff'), transparent: true, opacity: 0.16,
        roughness: 0.05, metalness: 0.0, emissive: new T.Color('#7c5cff'), emissiveIntensity: 0.5,
        side: T.DoubleSide, depthWrite: false
      }), 0, 0.42, 0, 0.66, 0.62, 0.66);
      group.add(api.dome);
      api.scans = [];
      for (let i = 0; i < 2; i++) {
        const r = m(G.torus, violet, 0, 0.42, 0, 0.5 + i * 0.1, 0.5 + i * 0.1, 1);
        r.rotation.x = Math.PI / 2 + (i ? 0.5 : 0); group.add(r); api.scans.push(r);
      }
      group.add(glow('#a78bfa', 1.6, 0.4)).position.set(0, 0.5, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.scans[0].rotation.z += dt * 2.2; api.scans[1].rotation.z -= dt * 1.5;
        api.scans[1].rotation.y += dt * 1.1;
        api.core.rotation.y += dt * 0.9;
        api.core.scale.setScalar(0.42 + Math.sin(this.t * 4) * 0.015);
        api.glow.material.opacity = 0.3 + 0.14 * Math.sin(this.t * 3.2);
      };
      api.setLevel = function (lv) { this.level = lv; api.dome.scale.setScalar(lv > 1 ? 1.14 : 1); };
    }

    else if (type === 'repair') {
      const white = baseMat('#d8e8f0', 0.4, 0.3);
      const green = emisMat('#7ef0b4', 2.0);
      group.add(m(G.cyl8, baseMat('#1b2a24', 0.6, 0.4), 0, 0.08, 0, 0.5, 0.16, 0.5));
      api.hub = new T.Group(); api.hub.position.y = 0.62; group.add(api.hub);
      api.hub.add(m(G.box, white, 0, 0, 0, 0.36, 0.3, 0.36));
      api.hub.add(m(G.box, green, 0, 0.2, 0, 0.16, 0.1, 0.16));
      api.arms = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const arm = new T.Group();
        arm.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2);
        arm.rotation.y = -a;
        arm.add(m(G.box, white, 0.34, 0, 0, 0.42, 0.09, 0.14));
        const tip = m(G.sph, green, 0.56, 0, 0, 0.1, 0.1, 0.1);
        arm.add(tip);
        api.hub.add(arm); api.arms.push(arm);
      }
      api.sat = [];
      for (let i = 0; i < 3; i++) {
        const s = m(G.oct, green, 0, 0, 0, 0.09, 0.09, 0.09);
        group.add(s); api.sat.push(s);
      }
      group.add(glow('#7ef0b4', 1.7, 0.4)).position.set(0, 0.62, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.hub.rotation.y += dt * 0.5;
        api.sat.forEach((s, i) => {
          const a = this.t * 1.4 + i * 2.09;
          s.position.set(Math.cos(a) * 0.58, 0.62 + Math.sin(this.t * 2 + i) * 0.12, Math.sin(a) * 0.58);
          s.rotation.y += dt * 2;
        });
        api.glow.material.opacity = 0.32 + 0.16 * Math.sin(this.t * 2.8);
      };
      api.setLevel = function (lv) {
        this.level = lv;
        if (lv > 1 && api.arms.length === 4) {
          for (let i = 0; i < 2; i++) {
            const a = (i / 2) * Math.PI * 2 + Math.PI / 4;
            const arm = new T.Group();
            arm.position.set(Math.cos(a) * 0.2, -0.08, Math.sin(a) * 0.2);
            arm.rotation.y = -a;
            arm.add(m(G.box, white, 0.32, 0, 0, 0.36, 0.07, 0.11));
            arm.add(m(G.sph, green, 0.52, 0, 0, 0.08, 0.08, 0.08));
            api.hub.add(arm); api.arms.push(arm);
          }
        }
      };
    }

    api.group.userData.model = api;
    return api;
  }

  /* =======================================================================
   *  敌人
   * ===================================================================== */
  function makeEnemy(type, opt) {
    opt = opt || {};
    const group = new T.Group();
    const api = { group: group, type: type, anim: { t: Math.random() * 6, flash: 0, dead: false }, parts: [] };

    if (type === 'worm') {
      const flesh = baseMat('#8f2b2b', 0.7, 0.2);
      const red = emisMat('#ff5b52', 1.8);
      group.add(m(G.sph, flesh, 0, 0.28, 0, 0.34, 0.3, 0.42));
      group.add(m(G.sph, red, 0, 0.36, 0.32, 0.11, 0.09, 0.09));
      api.seg = [];
      for (let i = 0; i < 6; i++) {
        const s = m(G.sph, flesh, 0, 0.24, -0.45 - i * 0.34, 0.3 - i * 0.032, 0.24 - i * 0.026, 0.28 - i * 0.03);
        group.add(s); api.seg.push(s);
      }
      for (let i = 0; i < 3; i++) {
        const l = m(G.cone, baseMat('#4a1414', 0.8, 0.2), -0.26, 0.06, -0.2 - i * 0.55, 0.06, 0.28, 0.06);
        l.rotation.z = 0.6; group.add(l);
        const r = m(G.cone, baseMat('#4a1414', 0.8, 0.2), 0.26, 0.06, -0.2 - i * 0.55, 0.06, 0.28, 0.06);
        r.rotation.z = -0.6; group.add(r);
      }
      api.anim.update = function (dt) {
        this.t += dt;
        api.seg.forEach((s, i) => {
          const w = Math.sin(this.t * 6 - i * 0.8) * 0.12;
          s.position.x = w; s.position.y = 0.24 + Math.abs(Math.sin(this.t * 6 - i * 0.8)) * 0.07;
        });
      };
    }

    else if (type === 'flood') {
      const orange = baseMat('#a8541c', 0.65, 0.3);
      const hot = emisMat('#ff9f2e', 1.5);
      group.add(m(G.icos, orange, 0, 0.62, 0, 0.82, 0.7, 0.82));
      const lumps = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r = 0.62 + (i % 3) * 0.12;
        const l = m(G.sph8, i % 2 ? orange : baseMat('#c26a22', 0.6, 0.25),
          Math.cos(a) * r, 0.5 + (i % 2) * 0.28, Math.sin(a) * r, 0.34, 0.3, 0.34);
        group.add(l); lumps.push(l);
      }
      api.core = m(G.sph, hot, 0, 0.66, 0, 0.34, 0.34, 0.34);
      group.add(api.core);
      api.ring = m(G.torus, hot, 0, 0.7, 0, 0.8, 0.8, 1); api.ring.rotation.x = Math.PI / 2.4;
      group.add(api.ring);
      group.add(glow('#ff9f2e', 2.4, 0.4)).position.set(0, 0.7, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        lumps.forEach((l, i) => {
          const p = 1 + Math.sin(this.t * 3 + i) * 0.12;
          l.scale.set(0.34 * p, 0.3 * p, 0.34 * p);
        });
        api.ring.rotation.z += dt * 1.4;
        api.core.scale.setScalar(0.34 + Math.sin(this.t * 5) * 0.04);
        api.glow.material.opacity = 0.3 + 0.14 * Math.sin(this.t * 3);
      };
    }

    else if (type === 'trojan') {
      const shell = baseMat('#243a24', 0.6, 0.4);
      const green = emisMat('#8bff6a', 2.0);
      api.body = m(G.capsule, shell, 0, 0.28, 0, 0.42, 0.42, 0.42);
      api.body.rotation.x = Math.PI / 2;
      group.add(api.body);
      api.mask = m(G.box, baseMat('#0e1a10', 0.5, 0.4), 0, 0.34, 0.3, 0.4, 0.3, 0.1);
      group.add(api.mask);
      group.add(m(G.sph, green, -0.1, 0.36, 0.36, 0.05, 0.04, 0.04));
      group.add(m(G.sph, green, 0.1, 0.36, 0.36, 0.05, 0.04, 0.04));
      for (let i = 0; i < 2; i++) {
        const l = m(G.box, shell, i ? 0.26 : -0.26, 0.08, -0.05, 0.06, 0.2, 0.06);
        group.add(l);
        const l2 = m(G.box, shell, i ? 0.26 : -0.26, 0.08, 0.12, 0.06, 0.2, 0.06);
        group.add(l2);
      }
      api.disguise = m(G.box, new T.MeshBasicMaterial({
        color: new T.Color('#8bff6a'), wireframe: true, transparent: true, opacity: 0.45
      }), 0, 0.32, 0, 0.9, 0.62, 0.9);
      group.add(api.disguise);
      api.anim.update = function (dt) {
        this.t += dt;
        api.disguise.rotation.y += dt * 0.9;
        api.disguise.material.opacity = 0.3 + 0.18 * Math.sin(this.t * 3);
        api.body.position.y = 0.28 + Math.sin(this.t * 7) * 0.03;
      };
      api.setHidden = function (h) { api.disguise.visible = h; };
    }

    else if (type === 'extorter') {
      const dark = baseMat('#3b2450', 0.6, 0.5);
      const purple = emisMat('#c07bff', 2.2);
      api.body = m(G.cone, dark, 0, 0.56, 0, 0.42, 0.85, 0.42);
      group.add(api.body);
      api.visor = m(G.box, purple, 0, 0.92, 0.18, 0.34, 0.1, 0.12);
      group.add(api.visor);
      api.blades = [];
      for (let i = 0; i < 2; i++) {
        const b = m(G.box, baseMat('#d8d0e8', 0.25, 0.9), 0.34, 0.62, 0.05, 0.06, 0.7, 0.14);
        b.rotation.z = i ? -0.5 : 0.5; group.add(b); api.blades.push(b);
      }
      api.legs = [];
      for (let i = 0; i < 2; i++) {
        const l = m(G.box, dark, i ? 0.16 : -0.16, 0.14, 0, 0.08, 0.3, 0.08);
        group.add(l); api.legs.push(l);
      }
      group.add(glow('#c07bff', 1.6, 0.4)).position.set(0, 0.85, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.legs[0].position.z = Math.sin(this.t * 7) * 0.09;
        api.legs[1].position.z = -Math.sin(this.t * 7) * 0.09;
        api.body.position.y = 0.56 + Math.sin(this.t * 4) * 0.04;
        api.glow.material.opacity = 0.3 + 0.14 * Math.sin(this.t * 3.4);
      };
      api.strike = function () { api.strikeT = 0.25; };
      api.anim.update = function (dt) {
        this.t += dt;
        api.legs[0].position.z = Math.sin(this.t * 7) * 0.09;
        api.legs[1].position.z = -Math.sin(this.t * 7) * 0.09;
        api.body.position.y = 0.56 + Math.sin(this.t * 4) * 0.04;
        api.glow.material.opacity = 0.3 + 0.14 * Math.sin(this.t * 3.4);
        if (this.strikeT > 0) {
          this.strikeT -= dt;
          const k = Math.max(0, this.strikeT) / 0.25;
          api.blades[0].rotation.x = -0.9 * (1 - k); api.blades[1].rotation.x = 0.9 * (1 - k);
        }
      };
    }

    else if (type === 'hotspot') {
      const white = baseMat('#dff2ff', 0.3, 0.4);
      const cyan = emisMat('#7fe6ff', 2.2);
      api.body = m(G.cyl, white, 0, 0, 0, 0.42, 0.12, 0.42);
      group.add(api.body);
      api.rotors = [];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const arm = new T.Group();
        arm.position.set(Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36);
        arm.add(m(G.box, white, 0, 0, 0, 0.34, 0.05, 0.08));
        const rot = new T.Group(); rot.position.set(0.16, 0.04, 0);
        rot.add(m(G.cyl, new T.MeshStandardMaterial({ color: new T.Color('#a8e8ff'), transparent: true, opacity: 0.35, roughness: 0.1 }), 0, 0, 0, 0.24, 0.012, 0.24));
        arm.add(rot); group.add(arm);
        api.rotors.push(rot);
      }
      api.antenna = m(G.cone, cyan, 0, -0.18, 0, 0.1, 0.34, 0.1);
      api.antenna.rotation.x = Math.PI; group.add(api.antenna);
      api.beam = m(G.cyl, new T.MeshBasicMaterial({
        color: new T.Color('#7fe6ff'), transparent: true, opacity: 0.16,
        blending: T.AdditiveBlending, depthWrite: false
      }), 0, -0.8, 0, 0.16, 0.8, 0.16);
      group.add(api.beam);
      group.add(glow('#9fefff', 2.0, 0.4)).position.set(0, 0, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.rotors.forEach((r) => { r.rotation.y += dt * 26; });
        group.position.y = group.userData.baseY !== undefined ? group.userData.baseY : group.position.y;
        api.beam.material.opacity = 0.12 + 0.07 * Math.sin(this.t * 5);
        api.glow.material.opacity = 0.3 + 0.14 * Math.sin(this.t * 4);
      };
    }

    else if (type === 'shell') {
      const teal = baseMat('#1d5a54', 0.5, 0.6);
      const cyan = emisMat('#4fd6c8', 1.9);
      group.add(m(Art.hexGeo(0.55, 0.4), teal, 0, 0.4, 0));
      api.core = m(G.oct, cyan, 0, 0.72, 0, 0.26, 0.3, 0.26);
      group.add(api.core);
      api.plates = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = m(G.box, teal, Math.cos(a) * 0.52, 0.62, Math.sin(a) * 0.52, 0.4, 0.06, 0.24);
        p.rotation.y = -a; group.add(p); api.plates.push(p);
      }
      api.ring = m(G.torus, cyan, 0, 0.62, 0, 0.78, 0.78, 1); api.ring.rotation.x = Math.PI / 2;
      group.add(api.ring);
      group.add(glow('#4fd6c8', 2.0, 0.35)).position.set(0, 0.65, 0);
      api.glow = group.children[group.children.length - 1];
      api.anim.update = function (dt) {
        this.t += dt;
        api.ring.rotation.z += dt * 1.1;
        api.core.rotation.y += dt * 1.3;
        api.plates.forEach((p, i) => {
          const k = 0.62 + Math.sin(this.t * 2 + i * 0.6) * 0.12;
          const a = (i / 6) * Math.PI * 2;
          p.position.x = Math.cos(a) * k; p.position.z = Math.sin(a) * k;
        });
        api.glow.material.opacity = 0.26 + 0.12 * Math.sin(this.t * 3);
      };
    }

    /* ---------------- Boss ---------------- */
    else if (type === 'wankui') {
      const dark = baseMat('#3a0f22', 0.6, 0.5);
      const pink = emisMat('#ff2f6d', 2.2);
      group.add(m(G.icos, dark, 0, 1.3, 0, 1.0, 0.95, 1.0));
      api.core = m(G.sph, pink, 0, 1.3, 0, 0.42, 0.42, 0.42);
      group.add(api.core);
      api.drones = [];
      for (let i = 0; i < 12; i++) {
        const d = new T.Group();
        d.add(m(G.oct, dark, 0, 0, 0, 0.17, 0.17, 0.17));
        d.add(m(G.sph8, pink, 0, 0, 0.16, 0.07, 0.07, 0.07));
        group.add(d); api.drones.push(d);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = m(G.cone, baseMat('#71162f', 0.7, 0.3), Math.cos(a) * 0.9, 1.3, Math.sin(a) * 0.9, 0.16, 0.8, 0.16);
        sp.rotation.z = -Math.cos(a) * 0.7; sp.rotation.x = Math.sin(a) * 0.7;
        group.add(sp);
      }
      api.rings = [];
      for (let i = 0; i < 2; i++) {
        const r = m(G.torus, pink, 0, 1.3, 0, 1.25 + i * 0.3, 1.25 + i * 0.3, 1);
        r.rotation.x = Math.PI / 2 + i * 0.5; group.add(r); api.rings.push(r);
      }
      group.add(glow('#ff2f6d', 3.4, 0.45)).position.set(0, 1.3, 0);
      api.glow = group.children[group.children.length - 1];
      api.phase = 1;
      api.anim.update = function (dt) {
        this.t += dt;
        const sp = this.phase > 1 ? 2.4 : 1;
        api.drones.forEach((d, i) => {
          const a = this.t * 0.9 * sp + i * (Math.PI * 2 / 12);
          const rr = 1.55 + Math.sin(this.t * 2 + i) * 0.16;
          d.position.set(Math.cos(a) * rr, 1.3 + Math.sin(a * 2) * 0.5, Math.sin(a) * rr);
          d.rotation.y += dt * 2;
        });
        api.rings[0].rotation.z += dt * 0.8 * sp; api.rings[1].rotation.z -= dt * 1.1 * sp;
        api.core.scale.setScalar(0.42 + Math.sin(this.t * 4) * 0.05);
        api.glow.material.opacity = 0.34 + 0.16 * Math.sin(this.t * 3);
      };
      api.setPhase = function (p) { this.phase = p; };
    }

    else if (type === 'shanlou') {
      const stone = baseMat('#6a5a32', 0.5, 0.7);
      const gold = emisMat('#ffe08a', 2.3);
      group.add(m(G.cone, stone, 0, 1.5, 0, 0.85, 2.6, 0.85));
      api.core = m(G.oct, gold, 0, 1.8, 0, 0.42, 0.6, 0.42);
      group.add(api.core);
      api.rings = [];
      for (let i = 0; i < 3; i++) {
        const r = m(G.torus, gold, 0, 0.8 + i * 0.7, 0, 1.1 + i * 0.16, 1.1 + i * 0.16, 1);
        r.rotation.x = Math.PI / 2 + i * 0.35; r.rotation.z = i * 0.6;
        group.add(r); api.rings.push(r);
      }
      api.ghosts = [];
      for (let i = 0; i < 3; i++) {
        const g = m(G.torus, new T.MeshBasicMaterial({
          color: new T.Color('#ffe08a'), transparent: true, opacity: 0.18,
          blending: T.AdditiveBlending, depthWrite: false
        }), 0, 1.2, 0, 1.5, 1.5, 1);
        g.rotation.x = Math.PI / 2; group.add(g); api.ghosts.push(g);
      }
      group.add(glow('#ffe08a', 3.4, 0.42)).position.set(0, 1.6, 0);
      api.glow = group.children[group.children.length - 1];
      api.phase = 1;
      api.anim.update = function (dt) {
        this.t += dt;
        const sp = this.phase > 1 ? 2.6 : 1;
        api.rings.forEach((r, i) => { r.rotation.z += dt * (0.6 + i * 0.3) * sp; });
        api.ghosts.forEach((g, i) => { g.rotation.z += dt * (i % 2 ? 1.2 : -1.0) * sp; g.scale.setScalar(1.4 + Math.sin(this.t * 2 + i) * 0.12); });
        api.core.rotation.y += dt * 1.2;
        api.glow.material.opacity = 0.32 + 0.16 * Math.sin(this.t * 3.2);
      };
      api.setPhase = function (p) { this.phase = p; };
    }

    else if (type === 'zheyin') {
      const black = baseMat('#14070c', 0.7, 0.4);
      const crimson = emisMat('#ff2f4a', 2.4);
      group.add(m(G.cone, black, 0, 1.5, 0, 0.9, 2.8, 0.9));
      api.mask = m(G.box, baseMat('#2a0812', 0.4, 0.5), 0, 2.0, 0.5, 0.7, 0.8, 0.16);
      group.add(api.mask);
      api.eyes = [];
      for (let i = 0; i < 2; i++) {
        const e = m(G.sph, crimson, i ? 0.17 : -0.17, 2.08, 0.6, 0.08, 0.05, 0.06);
        group.add(e); api.eyes.push(e);
      }
      api.claws = [];
      for (let i = 0; i < 2; i++) {
        const c = m(G.cone, baseMat('#3a0d16', 0.7, 0.4), i ? 0.9 : -0.9, 1.3, 0.1, 0.18, 1.1, 0.18);
        c.rotation.z = i ? -0.9 : 0.9; group.add(c); api.claws.push(c);
      }
      api.spikes = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = m(G.cone, crimson, Math.cos(a) * 0.72, 2.5, Math.sin(a) * 0.72, 0.12, 0.7, 0.12);
        s.rotation.z = -Math.cos(a) * 0.5; s.rotation.x = Math.sin(a) * 0.5;
        group.add(s); api.spikes.push(s);
      }
      api.armor = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const p = m(G.box, baseMat('#2c0d18', 0.6, 0.6), Math.cos(a) * 0.62, 1.2, Math.sin(a) * 0.62, 0.5, 0.7, 0.12);
        p.rotation.y = -a; p.visible = false; group.add(p); api.armor.push(p);
      }
      group.add(glow('#ff2f4a', 3.6, 0.4)).position.set(0, 1.9, 0);
      api.glow = group.children[group.children.length - 1];
      api.phase = 1;
      api.anim.update = function (dt) {
        this.t += dt;
        api.spikes.forEach((s, i) => { s.rotation.y += dt * 0.4 * (i % 2 ? 1 : -1); });
        api.claws.forEach((c, i) => {
          c.rotation.x = Math.sin(this.t * 2 + i) * 0.25;
        });
        api.eyes.forEach((e) => { e.material.emissiveIntensity = 1.6 + Math.sin(this.t * 5) * 0.8; });
        api.glow.material.opacity = 0.3 + 0.16 * Math.sin(this.t * 2.6);
      };
      api.setPhase = function (p) {
        this.phase = p;
        api.armor.forEach((a) => { a.visible = p >= 2; });
        api.spikes.forEach((s) => { s.scale.y = p >= 2 ? 1.25 : 0.85; });
      };
      // 潜伏：半透明、轮廓模糊，显形后恢复实体感
      api.setStealth = function (h) {
        this.stealth = h;
        group.traverse((o) => {
          if (!o.isMesh) return;
          if (!o.material) return;
          if (!o.userData._baseOpacity) o.userData._baseOpacity = o.material.opacity;
          o.material.transparent = h ? true : o.material.transparent;
          o.material.opacity = h ? o.userData._baseOpacity * 0.34 : o.userData._baseOpacity;
          o.material.depthWrite = !h;
        });
      };
      api.setStealth(false);
    }

    api.group.userData.model = api;
    return api;
  }

  RT.Models = { makeTower, makeEnemy, G, glow };
})(typeof window !== 'undefined' ? window : globalThis);
