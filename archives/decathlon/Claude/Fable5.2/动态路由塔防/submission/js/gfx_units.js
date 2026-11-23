/* 网络安全攻防战 — 塔与敌人的程序化模型和动作 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE, GX = TD.GX, G = GX.G, mk = GX.mk, grp = GX.grp;
  const PI = Math.PI, sin = Math.sin, cos = Math.cos, cl = TD.clamp;
  const pulse = (x, w) => { x = x / w; return x < 0 || x > 1 ? 0 : sin(x * PI); };        // 0→1→0
  const punch = (x, w) => { x = x / w; return x < 0 || x > 1 ? 0 : (x < 0.25 ? x / 0.25 : 1 - (x - 0.25) / 0.75); };

  // 每个实例克隆自己用到的材质，便于闪白、加密变色、潜伏透明
  function matSet() {
    const set = {}, list = [];
    const C = (name) => { if (!set[name]) { const m = GX.M[name].clone(); m.userData.e0 = m.emissive ? m.emissive.clone() : null; m.userData.i0 = m.emissiveIntensity; m.userData.c0 = m.color.clone(); m.userData.o0 = m.opacity; set[name] = m; list.push(m); } return set[name]; };
    C.list = list; C.set = set;
    return C;
  }
  GX.flashMats = function (list, k, col, tint, tintK) {
    for (const m of list) {
      if (!m.userData.e0) continue;
      m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.i0;
      if (tintK > 0 && tint) { m.color.copy(m.userData.c0).lerp(tint, tintK * 0.65); if (m.userData.i0 > 1) { m.emissive.lerp(tint, tintK * 0.8); m.emissiveIntensity = m.userData.i0 * (1 - tintK * 0.55); } }
      else m.color.copy(m.userData.c0);
      if (k > 0) { m.emissive.lerp(col, Math.min(1, k)); m.emissiveIntensity = Math.max(m.userData.i0, 0.2) + k * 2.2; }
    }
  };

  // =====================================================================
  //                                塔
  // =====================================================================
  // 动画参数 a: { t, fire(距上次开火秒), hit, deploy, skill(剩余), aim(世界偏航), hasAim, heal(是否在治疗), cdK(装填进度0..1), up(距升级秒), pitch }
  const TOWER = {};

  TOWER.firewall = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), GL = C('tGlow');
    g.add(mk(G.box(0.86, 0.07, 0.42), D, [0, 0.035, 0]));
    const py = lv >= 2 ? 0.82 : 0.66;
    for (const s of [-1, 1]) { g.add(mk(G.box(0.11, py, 0.2), S, [s * 0.37, py / 2, 0])); g.add(mk(G.box(0.05, py * 0.8, 0.03), GL, [s * 0.37, py / 2, 0.11])); g.add(mk(G.box(0.15, 0.06, 0.24), W, [s * 0.37, py + 0.03, 0])); }
    const plates = new THREE.Group(); g.add(plates);
    const hex = (x, y, z, r, ry) => { const p = grp([x, y, z]); p.rotation.y = ry; p.add(mk(G.prism(r, 0.05, 6), W, null, [PI / 2, 0, 0])); const o = mk(G.tor(r * 0.72, 0.012, 6, 6), GL, [0, 0, 0.03]); o.castShadow = false; p.add(o); p.userData.z0 = z; plates.add(p); return p; };
    const pl = [hex(0, 0.36, 0.1, 0.2, 0), hex(-0.21, 0.26, 0.07, 0.14, -0.25), hex(0.21, 0.26, 0.07, 0.14, 0.25), hex(-0.14, 0.52, 0.07, 0.12, -0.15), hex(0.14, 0.52, 0.07, 0.12, 0.15)];
    if (lv >= 2) { pl.push(hex(0, 0.66, 0.1, 0.13, 0), hex(-0.3, 0.46, 0.03, 0.1, -0.4), hex(0.3, 0.46, 0.03, 0.1, 0.4)); for (const s of [-1, 1]) g.add(mk(G.box(0.05, 0.3, 0.34), W, [s * 0.44, 0.3, -0.02], [0, 0, s * -0.25])); }
    const bm = GX.M.tBarrier.clone(); const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.64, py - 0.08), bm); bar.position.set(0, py / 2 + 0.02, -0.02); g.add(bar);
    let ring = null; if (lv >= 2) { ring = mk(G.tor(0.2, 0.02, 6, 24), GL, [0, 0.98, 0], [PI / 2, 0, 0]); g.add(ring); g.add(mk(G.cyl(0.03, 0.03, 0.16, 6), S, [0, 0.9, 0])); }
    return { g, tick(a) {
      const f = punch(a.fire, 0.3), h = pulse(a.hit, 0.25);
      pl.forEach((p, i) => { p.position.z = p.userData.z0 + f * 0.16 + sin(a.t * 2 + i * 1.3) * 0.008 - h * 0.05; });
      bm.opacity = 0.2 + 0.1 * sin(a.t * 5) + f * 0.4 + h * 0.3 + (a.skill > 0 ? 0.35 : 0);
      bm.color.setHex(a.skill > 0 ? 0xbff6ff : 0x49d8ff);
      if (ring) { ring.rotation.z = a.t * 1.6; ring.position.y = 0.98 + sin(a.t * 3) * 0.015; }
      g.rotation.x = -h * 0.09;
    } };
  };

  TOWER.honeypot = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), A = C('tAmber'), GL = C('tGlow');
    g.add(mk(G.prism(0.36, 0.06, 6), D, [0, 0.03, 0]));
    const pot = mk(G.lathe('pot', [[0, 0], [0.19, 0], [0.27, 0.12], [0.3, 0.26], [0.24, 0.42], [0.17, 0.5], [0.2, 0.56], [0.17, 0.56], [0.14, 0.5], [0, 0.5]], 18), W, [0, 0.06, 0]); g.add(pot);
    for (const y of [0.2, 0.34]) { const b = mk(G.tor(y === 0.2 ? 0.285 : 0.3, 0.014, 6, 24), A, [0, y, 0], [PI / 2, 0, 0]); b.castShadow = false; g.add(b); }
    const honey = mk(G.hemi(0.15, 16), A, [0, 0.58, 0]); g.add(honey);
    const lure = mk(G.oct(0.07), A, [0, 0.88, 0]); g.add(lure);
    const cells = new THREE.Group(); g.add(cells);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; cells.add(mk(G.prism(0.045, 0.03, 6), i % 2 ? A : S, [cos(a) * 0.38, 0.1, sin(a) * 0.38])); }
    const waves = []; for (let i = 0; i < 2; i++) { const m = GX.basicAdd(0xffb53a, 0.5); const w = new THREE.Mesh(G.ring(0.9, 1.0, 40), m); w.position.y = 0.05; g.add(w); waves.push(w); }
    const cage = new THREE.Group(); g.add(cage); cage.visible = false;
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; const b = mk(G.cyl(0.012, 0.012, 0.9, 5), A, [cos(a) * 0.52, 0.45, sin(a) * 0.52]); b.castShadow = false; cage.add(b); }
    const ct = mk(G.tor(0.52, 0.012, 5, 32), A, [0, 0.9, 0], [PI / 2, 0, 0]); ct.castShadow = false; cage.add(ct);
    let lens = null, sats = null;
    if (lv >= 2 && br === 'a') { lens = grp([0, 0.72, 0]); const arm = grp([0.36, 0, 0]); arm.add(mk(G.tor(0.15, 0.022, 8, 24), S)); const gl = new THREE.Mesh(G.cyl(0.14, 0.14, 0.01, 20), GX.M.tGlass); gl.rotation.x = PI / 2; arm.add(gl); arm.add(mk(G.box(0.03, 0.03, 0.03), GL, [0, 0.17, 0])); lens.add(arm); lens.add(mk(G.box(0.36, 0.025, 0.025), S, [0.18, -0.16, 0], [0, 0, 0.0])); lens.add(mk(G.cyl(0.02, 0.02, 0.16, 6), S, [0.36, -0.08, 0])); g.add(lens); }
    if (lv >= 2 && br === 'b') { sats = new THREE.Group(); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + 0.5; const s = mk(G.lathe('pot', [], 18), W, [cos(a) * 0.36, 0.06, sin(a) * 0.36], null, 0.42); sats.add(s); const hh = mk(G.hemi(0.15, 12), A, [cos(a) * 0.36, 0.3, sin(a) * 0.36], null, 0.42); sats.add(hh); const lk = mk(G.cyl(0.01, 0.01, 0.36, 5), A, [cos(a) * 0.18, 0.2, sin(a) * 0.18], [0, -a, PI / 2]); lk.castShadow = false; sats.add(lk); } g.add(sats); }
    return { g, noYaw: true, tick(a) {
      lure.position.y = 0.88 + sin(a.t * 2.2) * 0.04; lure.rotation.y = a.t * 2;
      honey.scale.setScalar(1 + sin(a.t * 3) * 0.05 + pulse(a.hit, 0.2) * 0.2);
      cells.rotation.y = a.t * 0.5;
      const rr = (a.lureR || 2.6);
      waves.forEach((w, i) => { const u = ((a.t * 0.45 + i * 0.5) % 1); const s = 0.25 + u * (rr - 0.25); w.scale.set(s, 1, s); w.material.opacity = 0.42 * (1 - u) * (a.enc ? 0.2 : 1); });
      const sk = a.skill > 0 ? 1 : 0; cage.visible = sk > 0 || cage.scale.y > 0.05; cage.scale.y += ((sk ? 1 : 0.001) - cage.scale.y) * 0.2; cage.rotation.y = a.t * 0.8;
      if (lens) lens.rotation.y = a.t * 1.1;
      if (sats) sats.rotation.y = -a.t * 0.25;
      g.rotation.z = pulse(a.hit, 0.25) * 0.08;
    } };
  };

  TOWER.gateway = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), WN = C('tWarn'), GL = C('tGlow');
    g.add(mk(G.cyl(0.42, 0.46, 0.06, 8), D, [0, 0.03, 0], [0, PI / 8, 0]));
    const k = lv >= 2 ? 1.18 : 1;
    for (const s of [-1, 1]) { g.add(mk(G.box(0.15 * k, 0.74, 0.22 * k), W, [s * 0.33, 0.4, 0])); g.add(mk(G.box(0.04, 0.6, 0.03), GL, [s * 0.33, 0.4, 0.12 * k])); }
    g.add(mk(G.box(0.86, 0.12, 0.24 * k), S, [0, 0.8, 0]));
    const blade = grp([0, 0, 0]); g.add(blade);
    blade.add(mk(G.box(0.5, 0.52, 0.06), S, [0, 0, 0.02]));
    for (let i = 0; i < 4; i++) blade.add(mk(G.box(0.5, 0.035, 0.065), i % 2 ? WN : W, [0, -0.2 + i * 0.13, 0.022]));
    let blade2 = null; if (lv >= 2) { blade2 = mk(G.box(0.5, 0.52, 0.05), W, [0, 0.35, -0.08]); g.add(blade2); for (const s of [-1, 1]) { g.add(mk(G.box(0.04, 0.5, 0.04), S, [s * 0.44, 0.3, 0.16], [0.5, 0, 0])); g.add(mk(G.box(0.04, 0.5, 0.04), S, [s * 0.44, 0.3, -0.16], [-0.5, 0, 0])); } }
    const arm = grp([-0.2, 0.86, 0]); arm.add(mk(G.box(0.46, 0.04, 0.05), W, [0.23, 0, 0])); arm.add(mk(G.sph(0.045, 8, 6), WN, [0.46, 0, 0])); g.add(arm);
    g.add(mk(G.cyl(0.04, 0.04, 0.1, 8), S, [-0.2, 0.88, 0], [PI / 2, 0, 0])); g.add(mk(G.box(0.06, 0.08, 0.06), S, [0.26, 0.89, 0]));
    const lamps = []; for (const s of [-1, 1]) { const l = mk(G.sph(0.045, 8, 6), C(s < 0 ? 'tWarn' : 'tAmber'), [s * 0.33, 0.8 + 0.1, 0.0]); g.add(l); lamps.push(l); }
    return { g, noYaw: true, tick(a) {
      const d = TD.easeOut(cl(a.deploy / 0.5, 0, 1)), h = pulse(a.hit, 0.3);
      blade.position.y = 0.36 + (1 - d) * 0.5 + h * 0.03 * sin(a.t * 60);
      if (blade2) blade2.position.y = 0.36 + (1 - TD.easeOut(cl((a.deploy - 0.15) / 0.5, 0, 1))) * 0.5;
      arm.rotation.z = (1 - d) * 0.9;
      lamps.forEach((l, i) => { l.scale.setScalar(0.7 + 0.5 * (sin(a.t * 4 + i * PI) > 0 ? 1 : 0) + h); });
      g.rotation.x = h * 0.05 * sin(a.t * 45);
    } };
  };

  TOWER.interceptor = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), GL = C('tGlow');
    g.add(mk(G.cyl(0.3, 0.36, 0.09, 12), D, [0, 0.045, 0]));
    // 朝向标记（随底座，不随炮塔）
    const mark = mk(G.cone(0.09, 0.2, 3), GL, [0, 0.07, 0.38], [PI / 2, 0, 0]); mark.scale.set(1, 1, 0.3); g.add(mark);
    g.add(mk(G.box(0.05, 0.02, 0.24), GL, [0, 0.095, 0.2]));
    g.add(mk(G.cyl(0.12, 0.17, 0.2, 10), S, [0, 0.19, 0]));
    const turret = grp([0, 0.3, 0]); g.add(turret);
    const head = grp([0, 0.1, 0]); turret.add(head);
    head.add(mk(G.rbox(0.28, 0.2, 0.36, 0.04), W, [0, 0, 0]));
    head.add(mk(G.box(0.06, 0.1, 0.3), S, [-0.17, 0, 0])); head.add(mk(G.box(0.06, 0.1, 0.3), S, [0.17, 0, 0]));
    head.add(mk(G.sph(0.05, 10, 8), GL, [0, 0.12, -0.06]));
    const barrel = grp([0, 0, 0.18]); head.add(barrel);
    let rotor = null, dish = null, charge = null;
    if (lv < 2) { barrel.add(mk(G.cyl(0.045, 0.05, 0.46, 10), S, [0, 0, 0.2], [PI / 2, 0, 0])); barrel.add(mk(G.cyl(0.06, 0.06, 0.06, 10), D, [0, 0, 0.42], [PI / 2, 0, 0])); barrel.add(mk(G.tor(0.05, 0.012, 6, 14), GL, [0, 0, 0.46])); }
    else if (br === 'a') {
      for (const s of [-1, 1]) barrel.add(mk(G.box(0.035, 0.07, 0.86), S, [s * 0.055, 0, 0.42]));
      for (let i = 0; i < 4; i++) barrel.add(mk(G.tor(0.085, 0.014, 6, 14), GL, [0, 0, 0.14 + i * 0.2]));
      charge = mk(G.sph(0.06, 10, 8), GL, [0, 0, 0.02]); barrel.add(charge);
      head.add(mk(G.box(0.1, 0.1, 0.3), W, [0, 0.14, -0.12]));
    } else {
      rotor = grp([0, 0, 0.1]); barrel.add(rotor);
      for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; rotor.add(mk(G.cyl(0.03, 0.03, 0.36, 8), S, [cos(a) * 0.07, sin(a) * 0.07, 0.14], [PI / 2, 0, 0])); rotor.add(mk(G.cyl(0.035, 0.035, 0.03, 8), GL, [cos(a) * 0.07, sin(a) * 0.07, 0.32], [PI / 2, 0, 0])); }
      rotor.add(mk(G.cyl(0.11, 0.11, 0.05, 12), D, [0, 0, 0.0], [PI / 2, 0, 0]));
      dish = grp([0, 0.2, -0.1]); dish.add(mk(G.hemi(0.13, 14), W, null, [PI * 0.72, 0, 0])); dish.add(mk(G.cyl(0.012, 0.012, 0.14, 5), GL, [0, 0.03, 0.06], [0.9, 0, 0])); head.add(dish);
    }
    let sweep = 0, yaw = 0, pit = 0;
    return { g, tick(a) {
      // a.aim: 相对底座朝向的偏航（弧度）
      const target = a.hasAim ? a.aim : sin(a.t * 0.7 + a.seed * 9) * 0.5;
      yaw += TD.angDiff(yaw, target) * Math.min(1, a.dt * (a.hasAim ? 14 : 2.5));
      turret.rotation.y = yaw;
      pit += ((a.hasAim ? a.pitch : 0) - pit) * Math.min(1, a.dt * 10); head.rotation.x = -pit;
      const rc = punch(a.fire, br === 'a' ? 0.5 : 0.16);
      barrel.position.z = 0.18 - rc * (br === 'a' ? 0.16 : 0.07);
      head.position.z = -rc * 0.02;
      if (rotor) rotor.rotation.z += a.dt * (a.hasAim ? 22 : 1.5);
      if (dish) dish.rotation.y = a.t * 2.4;
      if (charge) { const k = a.hasAim ? cl(a.cdK, 0, 1) : 0.15; charge.scale.setScalar(0.5 + k * 1.3); }
      g.rotation.x = pulse(a.hit, 0.2) * 0.07;
    } };
  };

  TOWER.sandbox = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), GL = C('tGlow');
    const k = lv >= 2 ? 1.14 : 1;
    g.add(mk(G.rbox(0.66 * k, 0.1, 0.66 * k, 0.03), D, [0, 0.05, 0]));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.add(mk(G.box(0.05, 0.6 * k, 0.05), S, [x * 0.28 * k, 0.1 + 0.3 * k, z * 0.28 * k])); if (lv >= 2) g.add(mk(G.sph(0.04, 8, 6), GL, [x * 0.28 * k, 0.12 + 0.6 * k, z * 0.28 * k])); }
    g.add(mk(G.rbox(0.64 * k, 0.05, 0.64 * k, 0.02), W, [0, 0.12 + 0.6 * k, 0]));
    const cube = new THREE.Mesh(G.box(0.5 * k, 0.56 * k, 0.5 * k), GX.M.tGlass); cube.position.y = 0.1 + 0.3 * k; cube.renderOrder = 6; g.add(cube);
    const core = mk(G.oct(0.13 * k), GL, [0, 0.1 + 0.3 * k, 0]); g.add(core);
    const core2 = mk(G.oct(0.2 * k), C('tSteel'), [0, 0.1 + 0.3 * k, 0]); core2.material = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }); core2.castShadow = false; g.add(core2);
    const scan = mk(G.tor(0.36 * k, 0.012, 6, 4), GL, [0, 0.3, 0], [PI / 2, 0, PI / 4]); scan.castShadow = false; g.add(scan);
    const dish = grp([0, 0.17 + 0.6 * k, 0]); dish.add(mk(G.cyl(0.02, 0.02, 0.14, 6), S, [0, 0.07, 0])); dish.add(mk(G.hemi(0.11, 12), W, [0, 0.16, 0], [PI * 0.75, 0, 0])); dish.add(mk(G.sph(0.025, 6, 5), GL, [0, 0.19, 0.06])); g.add(dish);
    let motes = null; if (lv >= 2) { motes = grp([0, 0.45, 0]); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; const m = mk(G.sph(0.045, 8, 6), GL, [cos(a) * 0.52, 0, sin(a) * 0.52]); m.castShadow = false; motes.add(m); motes.add(mk(G.box(0.02, 0.1, 0.02), S, [cos(a) * 0.52, -0.08, sin(a) * 0.52])); } g.add(motes); }
    return { g, noYaw: true, tick(a) {
      const f = pulse(a.fire, 0.35);
      core.rotation.set(a.t * 1.3, a.t * 1.9, 0); core.scale.setScalar(1 + f * 1.0 + (a.skill > 0 ? 0.3 : 0));
      core2.rotation.set(-a.t * 0.7, a.t * 0.5, a.t * 0.3); core2.scale.setScalar(1 + f * 0.5);
      scan.position.y = 0.1 + (0.3 + 0.26 * sin(a.t * (a.skill > 0 ? 6 : 2.2))) * k;
      dish.rotation.y = a.t * 1.5;
      if (motes) { motes.rotation.y = a.t * 1.2; motes.position.y = 0.45 + sin(a.t * 2) * 0.05; }
      g.rotation.z = pulse(a.hit, 0.2) * 0.07;
    } };
  };

  TOWER.repair = function (lv, br, C) {
    const g = new THREE.Group(), W = C('tWhite'), S = C('tSteel'), D = C('tDark'), H = C('tHeal');
    g.add(mk(G.cyl(0.3, 0.35, 0.08, 12), D, [0, 0.04, 0]));
    g.add(mk(G.cyl(0.055, 0.09, 0.5, 10), W, [0, 0.33, 0]));
    for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; g.add(mk(G.box(0.04, 0.26, 0.04), S, [cos(a) * 0.16, 0.2, sin(a) * 0.16], [sin(a) * 0.55, 0, -cos(a) * 0.55])); }
    g.add(mk(G.tor(0.11, 0.02, 6, 16), H, [0, 0.58, 0], [PI / 2, 0, 0]));
    const drone = grp([0, 0.92, 0]); g.add(drone);
    drone.add(mk(G.tor(0.2, 0.03, 8, 28), W, null, [PI / 2, 0, 0]));
    drone.add(mk(G.box(0.24, 0.05, 0.07), H)); drone.add(mk(G.box(0.07, 0.05, 0.24), H));
    const em = []; for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; drone.add(mk(G.box(0.03, 0.03, 0.12), S, [cos(a) * 0.26, 0, sin(a) * 0.26], [0, -a + PI / 2, 0])); const e = mk(G.sph(0.035, 8, 6), H, [cos(a) * 0.32, 0, sin(a) * 0.32]); drone.add(e); em.push(e); }
    let ring2 = null; if (lv >= 2) { ring2 = grp([0, 0.92, 0]); ring2.add(mk(G.tor(0.34, 0.018, 6, 36), W, null, [PI / 2, 0, 0])); for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2; ring2.add(mk(G.oct(0.04), H, [cos(a) * 0.34, 0, sin(a) * 0.34])); } g.add(ring2); }
    const wm = GX.basicAdd(0x55ff9a, 0); const wave = new THREE.Mesh(G.ring(0.92, 1, 48), wm); wave.position.y = 0.06; g.add(wave);
    return { g, noYaw: true, tick(a) {
      drone.position.y = 0.92 + sin(a.t * 2.4) * 0.04; drone.rotation.y = a.t * (a.heal ? 4.5 : 1.2);
      drone.rotation.x = a.heal ? sin(a.t * 3) * 0.12 : 0;
      em.forEach((e, i) => e.scale.setScalar(a.heal ? 1.3 + 0.5 * sin(a.t * 12 + i * 2) : 0.8));
      if (ring2) { ring2.rotation.y = -a.t * 0.9; ring2.rotation.x = sin(a.t * 0.8) * 0.2; ring2.position.y = 0.92 + sin(a.t * 2.4 + 1) * 0.04; }
      const u = a.skill > 0 ? 1 - a.skill / 1.2 : 1;
      if (u < 1) { const s = 0.3 + u * (a.range || 2.6); wave.scale.set(s, 1, s); wm.opacity = 0.8 * (1 - u); wave.visible = true; } else wave.visible = false;
      g.rotation.z = pulse(a.hit, 0.2) * 0.08;
    } };
  };

  // 细节层：地脚、指示灯、管线、控制台等，让推近后仍有可看的结构；2 级另加加固环与信标天线
  function detailTower(m, type, lv, br, C) {
    const g = m.g, D = C('tDark'), S = C('tSteel'), W = C('tWhite'), GL = C('tGlow'), ex = [];
    const acc = C(type === 'repair' ? 'tHeal' : type === 'honeypot' ? 'tAmber' : type === 'gateway' ? 'tWarn' : 'tGlow');
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4, x = cos(a) * 0.4, z = sin(a) * 0.4; g.add(mk(G.box(0.1, 0.045, 0.16), D, [x, 0.022, z], [0, -a, 0])); const led = mk(G.sph(0.018, 6, 5), acc, [x * 0.86, 0.06, z * 0.86]); led.castShadow = false; g.add(led); }
    if (lv >= 2) {
      g.add(mk(G.tor(0.37, 0.014, 6, 24), S, [0, 0.075, 0], [PI / 2, 0, 0]));
      const tips = []; for (const s of [-1, 1]) { g.add(mk(G.cyl(0.008, 0.012, 0.42, 5), S, [s * 0.3, 0.26, -0.3])); const t = mk(G.sph(0.024, 6, 5), acc, [s * 0.3, 0.48, -0.3]); t.castShadow = false; g.add(t); tips.push(t); }
      ex.push(a => { tips.forEach((t, i) => t.scale.setScalar(0.6 + 0.8 * Math.max(0, sin(a.t * 5 + i * PI)))); });
    }
    if (type === 'firewall') {
      const py = lv >= 2 ? 0.82 : 0.66;
      g.add(mk(G.box(0.56, 0.1, 0.05), S, [0, 0.12, 0.17])); g.add(mk(G.box(0.3, 0.16, 0.1), D, [0, 0.16, -0.17]));
      for (const s of [-1, 1]) { g.add(mk(G.cyl(0.015, 0.015, 0.22, 5), S, [s * 0.2, 0.14, -0.17], [0, 0, PI / 2])); for (const z of [-0.07, 0.07]) g.add(mk(G.box(0.05, 0.06, 0.06), W, [s * 0.37, py + 0.09, z])); g.add(mk(G.box(0.012, py * 0.5, 0.16), D, [s * 0.43, py * 0.5, 0])); }
      for (let i = 0; i < 3; i++) g.add(mk(G.box(0.2, 0.012, 0.012), GL, [0, 0.12 + i * 0.035, -0.225]));
    } else if (type === 'honeypot') {
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; g.add(mk(G.cone(0.025, 0.1, 5), acc, [cos(a) * 0.2, 0.56, sin(a) * 0.2], [PI, 0, 0])); }
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.add(mk(G.prism(0.05, 0.012, 6), S, [cos(a) * 0.285, 0.27, sin(a) * 0.285], [PI / 2, 0, -a + PI / 2])); }
      const bees = grp([0, 0.76, 0]); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; const b = mk(G.oct(0.028), acc, [cos(a) * 0.3, sin(i * 2) * 0.05, sin(a) * 0.3]); b.castShadow = false; bees.add(b); } g.add(bees);
      ex.push(a => { bees.rotation.y = -a.t * 1.7; bees.position.y = 0.76 + sin(a.t * 3) * 0.04; });
    } else if (type === 'gateway') {
      for (const s of [-1, 1]) { for (const y of [0.2, 0.56]) g.add(mk(G.box(0.165, 0.03, 0.235), acc, [s * 0.33, y, 0])); g.add(mk(G.box(0.03, 0.02, 0.62), S, [s * 0.2, 0.07, 0])); g.add(mk(G.cyl(0.02, 0.02, 0.5, 6), S, [s * 0.24, 0.5, -0.09])); }
      g.add(mk(G.box(0.14, 0.2, 0.1), D, [0.47, 0.16, 0.2])); const scr = mk(G.box(0.1, 0.07, 0.01), GL, [0.47, 0.2, 0.255]); scr.castShadow = false; g.add(scr);
      ex.push(a => { scr.scale.y = 0.6 + 0.4 * Math.abs(sin(a.t * 2.3)); });
    } else if (type === 'interceptor') {
      g.add(mk(G.cyl(0.065, 0.065, 0.2, 10), W, [-0.2, 0.14, -0.2])); g.add(mk(G.cyl(0.07, 0.07, 0.025, 10), GL, [-0.2, 0.25, -0.2])); g.add(mk(G.box(0.14, 0.1, 0.1), D, [0.2, 0.12, -0.22]));
      g.add(mk(G.tor(0.09, 0.012, 5, 14, PI), S, [0, 0.1, -0.27])); for (let i = 0; i < 3; i++) g.add(mk(G.box(0.1, 0.012, 0.012), S, [0.2, 0.1 + i * 0.03, -0.165]));
    } else if (type === 'sandbox') {
      g.add(mk(G.box(0.22, 0.12, 0.06), D, [0, 0.16, 0.37])); const st = mk(G.box(0.16, 0.02, 0.012), GL, [0, 0.19, 0.404]); st.castShadow = false; g.add(st);
      const gly = grp([0, 0.4, 0]); for (let i = 0; i < 4; i++) { const p = mk(G.box(0.12, 0.018, 0.004), GL, [0, (i - 1.5) * 0.09, 0], [0, i * 0.8, 0]); p.castShadow = false; gly.add(p); } g.add(gly);
      ex.push(a => { gly.rotation.y = a.t * 0.9; gly.children.forEach((p, i) => { p.scale.x = 0.5 + 0.5 * Math.abs(sin(a.t * 2 + i * 1.3)); }); });
    } else if (type === 'repair') {
      g.add(mk(G.tor(0.09, 0.02, 6, 16), S, [0.2, 0.1, 0.16], [PI / 2, 0, 0])); g.add(mk(G.box(0.14, 0.08, 0.1), W, [-0.2, 0.12, 0.17])); g.add(mk(G.box(0.07, 0.012, 0.02), acc, [-0.2, 0.165, 0.17])); g.add(mk(G.box(0.02, 0.012, 0.07), acc, [-0.2, 0.165, 0.17]));
      const dr = grp([0, 0.32, 0]); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; const d = grp([cos(a) * 0.4, 0, sin(a) * 0.4]); d.add(mk(G.box(0.07, 0.02, 0.07), W)); const dot = mk(G.sph(0.014, 5, 4), acc, [0, 0.02, 0]); dot.castShadow = false; d.add(dot); dr.add(d); } g.add(dr);
      ex.push(a => { dr.rotation.y = a.t * (a.heal ? 2.6 : 0.9); dr.children.forEach((d, i) => { d.position.y = sin(a.t * 3 + i * 2) * 0.04; }); });
    }
    if (ex.length) { const base = m.tick; m.tick = function (a) { base(a); for (const f of ex) f(a); }; }
  }
  // 敌人细节：背刺、尾针、触角、锁链、飘带等，挂在各自会动的部件上
  function detailEnemy(m, type, C) {
    const g = m.g, B = C('eBody'), SH = C('eShell'), BO = C('eBone'), R = C('eGlow'), GL = C('eGlow2'), ex = [], k0 = g.children[0];
    if (type === 'worm') {
      for (let i = 0; i < 6; i++) { const s = g.children[i], r = s.userData.r; s.add(mk(G.cone(r * 0.22, r * 0.9, 4), BO, [0, r * 0.9, -0.01], [-0.35, 0, 0])); if (i % 2) for (const k of [-1, 1]) s.add(mk(G.cone(r * 0.14, r * 0.7, 4), BO, [k * r * 0.85, r * 0.05, 0], [0, 0, -k * 1.25])); }
      g.children[5].add(mk(G.cone(0.028, 0.14, 5), C('ePink'), [0, 0.01, -0.1], [-PI / 2, 0, 0]));
    } else if (type === 'flood') {
      const ring = mk(G.tor(0.3, 0.018, 6, 28), GL, null, [1.1, 0, 0.4]); ring.castShadow = false; k0.add(ring);
      for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.6; k0.add(mk(G.cone(0.04, 0.2, 5), BO, [cos(a) * 0.2, 0.1, sin(a) * 0.2], [sin(a) * 1.1, 0, -cos(a) * 1.1])); }
    } else if (type === 'trojan') {
      const b = g.children[1]; b.add(mk(G.cone(0.03, 0.22, 5), R, [0, 0.03, -0.26], [-PI / 2 - 0.35, 0, 0])); for (const k of [-1, 1]) { b.add(mk(G.box(0.03, 0.12, 0.26), SH, [k * 0.115, 0.01, 0])); b.add(mk(G.box(0.012, 0.02, 0.2), R, [k * 0.132, 0.04, 0])); }
    } else if (type === 'ransom') {
      for (const k of [-1, 1]) { k0.add(mk(G.cone(0.025, 0.17, 5), BO, [k * 0.13, 0.2, -0.03], [0, 0, -k * 0.5])); const tip = mk(G.sph(0.02, 6, 5), R, [k * 0.175, 0.275, -0.03]); tip.castShadow = false; k0.add(tip); for (const y of [-0.09, 0.09]) k0.add(mk(G.sph(0.016, 5, 4), BO, [k * 0.15, y, 0.112])); }
      const ch = grp([0.13, -0.15, 0.06]); ch.add(mk(G.tor(0.03, 0.009, 5, 10), BO)); ch.add(mk(G.tor(0.03, 0.009, 5, 10), BO, [0, -0.05, 0], [0, PI / 2, 0])); ch.add(mk(G.box(0.05, 0.035, 0.012), R, [0, -0.1, 0])); k0.add(ch);
      ex.push(a => { ch.rotation.z = sin(a.t * 6) * 0.3 * (a.move ? 1 : 0.3); });
    } else if (type === 'hotspot') {
      const tails = []; for (const k of [-1, 1]) { const t = grp([k * 0.05, -0.01, -0.22]); t.add(mk(G.box(0.012, 0.012, 0.3), GL, [0, 0, -0.15])); k0.add(t); tails.push(t); }
      k0.add(mk(G.sph(0.05, 8, 6), R, [0, -0.07, 0.02])); const rg = mk(G.tor(0.13, 0.008, 5, 20), GL, [0, 0.01, -0.1], [PI / 2, 0, 0]); rg.castShadow = false; k0.add(rg);
      ex.push(a => { tails.forEach((t, i) => { t.rotation.x = sin(a.t * 7 + i) * 0.25; t.rotation.y = sin(a.t * 5 + i * 2) * 0.2; }); rg.rotation.z = a.t * 4; });
    } else if (type === 'packer') {
      const tips = []; for (const k of [-1, 1]) { g.add(mk(G.cyl(0.006, 0.012, 0.34, 4), BO, [k * 0.09, 0.3, 0.14], [0.5, 0, -k * 0.35])); const t = mk(G.sph(0.022, 6, 5), GL, [k * 0.15, 0.45, 0.22]); t.castShadow = false; g.add(t); tips.push(t); }
      g.add(mk(G.tor(0.2, 0.02, 5, 20), SH, [0, 0.13, 0], [PI / 2, 0, 0]));
      ex.push(a => { tips.forEach((t, i) => t.scale.setScalar(0.8 + 0.6 * Math.max(0, sin(a.t * 4 + i * 2)))); });
    } else if (type === 'boss1') {
      for (const k of [-1, 1]) { k0.add(mk(G.sph(0.17, 10, 8), SH, [k * 0.4, 0.99, 0], null, [1, 0.6, 1])); k0.add(mk(G.cone(0.04, 0.26, 5), BO, [k * 0.46, 1.14, 0], [0, 0, -k * 0.7])); }
      for (let i = 0; i < 4; i++) k0.add(mk(G.cone(0.045, 0.3, 5), BO, [0, 0.4 + i * 0.2, -0.36 + i * 0.012], [-1.15, 0, 0]));
      const halo = mk(G.tor(0.36, 0.014, 6, 30), R, [0, 1.25, -0.14]); halo.castShadow = false; k0.add(halo); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; halo.add(mk(G.cone(0.02, 0.1, 4), R, [cos(a) * 0.42, sin(a) * 0.42, 0], [0, 0, a - PI / 2])); }
      ex.push(a => { halo.rotation.z = a.t * 0.6; });
    } else if (type === 'boss2') {
      const orb = grp([0, 0, 0]); for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; const sh = mk(G.tet(0.09 + (i % 3) * 0.02), i % 2 ? GL : R, [cos(a) * 1.0, 0.5 + (i * 0.37) % 1.6, sin(a) * 1.0]); sh.castShadow = false; orb.add(sh); } g.add(orb);
      ex.push(a => { orb.rotation.y = -a.t * 0.5; orb.children.forEach((sh, i) => { sh.rotation.set(a.t * 1.3 + i, a.t * 0.9, 0); }); });
    } else if (type === 'boss3') {
      for (let i = 0; i < 6; i++) k0.add(mk(G.cone(0.035, 0.2 - Math.abs(i - 2) * 0.02, 5), BO, [0, 0.21, 0.42 - i * 0.14], [-0.5, 0, 0]));
      for (const k of [-1, 1]) { k0.add(mk(G.cone(0.014, 0.55, 4), BO, [k * 0.12, 0.12, 0.92], [PI / 2 - 0.5, 0, -k * 0.3])); k0.add(mk(G.sph(0.06, 8, 6), SH, [k * 0.31, 0.02, 0.36])); }
    }
    if (ex.length) { const base = m.tick; m.tick = function (a) { base(a); for (const f of ex) f(a); }; }
  }
  GX.makeTower = function (type, level, branch) {
    const C = matSet(); const m = TOWER[type](level, branch, C); detailTower(m, type, level, branch, C); m.mats = C.list; return m;
  };

  // =====================================================================
  //                                敌人
  // =====================================================================
  // 动画参数 a: { t, dt, sp(当前速度), move(bool), atk(距上次攻击秒), hit, state, hidden, revealK, phase, cast(距上次施法秒), seed, frozen }
  const ENEMY = {};

  ENEMY.worm = function (C) {
    const g = new THREE.Group(), B = C('eBody'), P = C('ePink'), BO = C('eBone');
    const segs = [], N = 6;
    for (let i = 0; i < N; i++) { const r = 0.125 - i * 0.012; const s = grp([0, r, -i * 0.12]); s.add(mk(G.sph(r, 12, 9), B, null, null, [1, 0.85, 1.05])); if (i > 0) { const b = mk(G.tor(r * 0.86, 0.016, 5, 12), P, [0, 0, 0.055]); b.castShadow = false; s.add(b); } s.userData.r = r; g.add(s); segs.push(s); }
    const head = segs[0]; const jaws = [];
    for (const s of [-1, 1]) { const j = grp([s * 0.06, -0.02, 0.09]); j.add(mk(G.cone(0.028, 0.13, 6), BO, [0, 0, 0.05], [PI / 2, 0, 0])); head.add(j); jaws.push(j); head.add(mk(G.sph(0.022, 6, 5), P, [s * 0.05, 0.05, 0.09])); }
    head.add(mk(G.cone(0.03, 0.08, 5), BO, [0, 0.11, -0.02], [-0.5, 0, 0]));
    let ph = 0;
    return { g, h: 0.28, tick(a) {
      ph += a.dt * (a.move ? 9 * a.sp : 1.5);
      const bite = punch(a.atk, 0.3), fl = pulse(a.hit, 0.18);
      for (let i = 0; i < N; i++) { const s = segs[i], w = ph - i * 0.9; s.position.x = sin(w) * 0.035 * (i * 0.4 + 0.3); s.position.y = s.userData.r + Math.max(0, sin(w * 1.0 + 0.5)) * 0.045 * (a.move ? 1 : 0.3) + fl * 0.03 * sin(i * 2.0); s.position.z = -i * 0.12 + cos(w) * 0.012 + (i === 0 ? bite * 0.14 : bite * 0.05 * (1 - i / N)); s.rotation.y = cos(w) * 0.25; }
      jaws.forEach((j, i) => { j.rotation.y = (i ? -1 : 1) * (0.25 + 0.2 * sin(a.t * 8) + bite * 0.6); });
    } };
  };

  ENEMY.flood = function (C) {
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), GL = C('eGlow2'), R = C('eGlow');
    const core = grp([0, 0.42, 0]); g.add(core);
    core.add(mk(G.ico(0.2, 1), B)); const wire = mk(G.ico(0.215, 1), GL); wire.material = new THREE.MeshBasicMaterial({ color: 0xc23cff, wireframe: true, transparent: true, opacity: 0.75, toneMapped: false }); wire.castShadow = false; core.add(wire);
    const eye = mk(G.sph(0.07, 10, 8), R, [0, 0.03, 0.17]); core.add(eye);
    const bits = [], rg = TD.makeRng(77);
    for (let i = 0; i < 18; i++) { const sz = 0.06 + rg() * 0.07; const b = mk(i % 5 === 0 ? G.oct(sz * 0.8) : G.box(sz, sz, sz), i % 4 === 0 ? R : (i % 3 === 0 ? GL : SH)); b.userData = { r: 0.26 + rg() * 0.16, sp: (1.5 + rg() * 2.5) * (rg() < 0.5 ? -1 : 1), tilt: rg() * PI, ph: rg() * 6.28, tw: rg() * 6 }; g.add(b); bits.push(b); }
    let ph = 0;
    return { g, h: 0.85, tick(a) {
      ph += a.dt * (a.move ? 1.6 : 0.8);
      const sm = punch(a.atk, 0.45), fl = pulse(a.hit, 0.18);
      const cz = sm * 0.32;
      core.position.set(0, 0.42 + sin(a.t * 3) * 0.03 + sm * 0.06, cz); core.rotation.x += a.dt * (a.move ? 3.5 * a.sp : 0.6); core.rotation.y = sin(a.t) * 0.3;
      wire.scale.setScalar(1 + fl * 0.25 + 0.04 * sin(a.t * 9));
      const k = 1 - sm * 0.55 + fl * 0.25 + (a.state === 'smash' ? 0.12 * sin(a.t * 14) : 0);
      for (const b of bits) { const u = b.userData, w = ph * u.sp + u.ph, r = u.r * k; const x = cos(w) * r, y = sin(w) * r; b.position.set(x * cos(u.tilt), 0.42 + y, x * sin(u.tilt) + cz); b.rotation.set(a.t * 2 + u.tw, a.t * 1.3 + u.tw, 0); }
    } };
  };

  ENEMY.trojan = function (C) {
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), R = C('eGlow'), PK = C('pkt'), PG = C('pktGlow'), BO = C('eBone');
    // 伪装外壳：一枚干净的封装数据包（比业务包大一号）
    const shell = grp([0, 0.26, 0]); g.add(shell);
    const halves = [];
    for (const s of [-1, 1]) { const h = grp([s * 0.19, -0.13, 0]); h.add(mk(G.rbox(0.19, 0.26, 0.44, 0.03), PK, [-s * 0.095, 0.13, 0])); h.add(mk(G.box(0.2, 0.03, 0.445), PG, [-s * 0.095, 0.2, 0])); h.add(mk(G.box(0.06, 0.06, 0.02), PG, [-s * 0.1, 0.1, 0.222])); shell.add(h); halves.push(h); }
    const seam = mk(G.box(0.012, 0.262, 0.444), R, [0, 0, 0]); seam.castShadow = false; shell.add(seam);
    // 真身
    const body = grp([0, 0.2, 0]); g.add(body);
    body.add(mk(G.rbox(0.2, 0.16, 0.34, 0.04), B)); body.add(mk(G.box(0.12, 0.2, 0.1), SH, [0, 0.12, 0.13], [0.5, 0, 0]));
    const head = grp([0, 0.22, 0.2]); head.add(mk(G.box(0.1, 0.1, 0.2), SH, [0, 0, 0.05], [0.35, 0, 0])); for (const s of [-1, 1]) { head.add(mk(G.sph(0.02, 6, 5), R, [s * 0.05, 0.03, 0.08])); head.add(mk(G.cone(0.02, 0.07, 4), BO, [s * 0.035, 0.08, -0.02])); } body.add(head);
    for (let i = 0; i < 4; i++) body.add(mk(G.cone(0.03, 0.12, 4), R, [0, 0.14 + i * 0.012, 0.08 - i * 0.075], [-0.5, 0, 0]));
    const legs = []; for (const s of [-1, 1]) for (const z of [-0.1, 0.1]) { const l = grp([s * 0.1, -0.04, z]); l.add(mk(G.box(0.03, 0.17, 0.03), BO, [s * 0.04, -0.07, 0], [0, 0, s * 0.5])); body.add(l); legs.push(l); }
    let ph = 0;
    return { g, h: 0.55, tick(a) {
      const k = a.revealK; ph += a.dt * 12 * a.sp;
      shell.visible = k < 0.99; body.visible = k > 0.02;
      halves.forEach((h, i) => { h.rotation.z = (i ? -1 : 1) * k * 2.1; h.scale.setScalar(1 - TD.smooth((k - 0.5) * 2) * 0.9); });
      seam.visible = k < 0.1; seam.scale.x = 0.6 + 0.8 * Math.max(0, sin(a.t * 3 + a.seed * 20) - 0.85) * 6;
      shell.position.y = 0.26 + (k < 0.5 ? sin(a.t * 2.5 + a.seed * 6) * 0.025 : 0);
      body.scale.setScalar(0.3 + 0.7 * TD.smooth(k)); body.position.y = 0.2 + pulse(a.hit, 0.15) * 0.04;
      const bite = punch(a.atk, 0.3); head.rotation.x = -bite * 0.7; body.position.z = bite * 0.1;
      legs.forEach((l, i) => { l.rotation.x = a.move ? sin(ph + (i % 3 === 0 ? 0 : PI)) * 0.6 : 0; });
    } };
  };

  ENEMY.ransom = function (C) {
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), R = C('eGlow'), BO = C('eBone');
    const body = grp([0, 0.34, 0]); g.add(body);
    body.add(mk(G.rbox(0.36, 0.28, 0.22, 0.04), SH)); body.add(mk(G.box(0.38, 0.03, 0.24), B, [0, -0.06, 0]));
    body.add(mk(G.cyl(0.045, 0.045, 0.02, 12), R, [0, 0.03, 0.115], [PI / 2, 0, 0])); body.add(mk(G.box(0.03, 0.09, 0.02), R, [0, -0.04, 0.115]));
    const shackle = grp([0, 0.14, 0]); shackle.add(mk(G.tor(0.11, 0.032, 8, 16, PI), BO)); shackle.add(mk(G.cyl(0.032, 0.032, 0.1, 8), BO, [-0.11, -0.05, 0])); shackle.add(mk(G.cyl(0.032, 0.032, 0.1, 8), BO, [0.11, -0.05, 0])); body.add(shackle);
    const legs = []; for (const s of [-1, 1]) for (const z of [-0.08, 0.08]) { const hip = grp([s * 0.17, -0.1, z]); hip.add(mk(G.box(0.04, 0.04, 0.04), B)); const up = mk(G.box(0.16, 0.035, 0.035), BO, [s * 0.07, 0.02, 0], [0, 0, s * 0.5]); hip.add(up); const lo = mk(G.box(0.035, 0.24, 0.035), B, [s * 0.14, -0.1, 0], [0, 0, s * -0.12]); hip.add(lo); hip.add(mk(G.sph(0.03, 6, 5), R, [s * 0.14, 0.04, 0])); g.add(hip); hip.position.y += 0.34; legs.push(hip); }
    let ph = 0;
    return { g, h: 0.75, muzzle: [0, 0.37, 0.14], tick(a) {
      ph += a.dt * 9 * a.sp;
      const f = punch(a.atk, 0.4), fl = pulse(a.hit, 0.18);
      body.position.y = 0.34 + (a.move ? Math.abs(sin(ph)) * 0.02 : 0) + fl * 0.03; body.position.z = -f * 0.07; body.rotation.x = -f * 0.18 + fl * 0.1;
      shackle.position.y = 0.14 + f * 0.1; shackle.rotation.y = f * 1.2;
      legs.forEach((l, i) => { const w = ph + ((i === 0 || i === 3) ? 0 : PI); l.rotation.x = a.move ? sin(w) * 0.5 : 0; l.position.y = 0.24 + (a.move ? Math.max(0, cos(w)) * 0.03 : 0); });
    } };
  };

  ENEMY.hotspot = function (C) {
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), GL = C('eGlow2'), R = C('eGlow');
    const b = grp([0, 0, 0]); g.add(b);
    b.add(mk(G.cone(0.1, 0.36, 8), B, [0, 0, 0.05], [PI / 2, 0, 0])); b.add(mk(G.sph(0.09, 10, 8), SH, [0, 0.02, -0.1])); b.add(mk(G.sph(0.035, 8, 6), R, [0, 0.03, 0.2]));
    const wings = []; for (const s of [-1, 1]) { const w = grp([s * 0.07, 0, -0.03]); const p = mk(G.cone(0.2, 0.42, 3), SH, [s * 0.2, 0, -0.03], [PI / 2, 0, s * PI / 2]); p.scale.set(1, 1, 0.12); w.add(p); w.add(mk(G.box(0.36, 0.012, 0.02), GL, [s * 0.2, 0.012, 0.06])); b.add(w); wings.push(w); }
    b.add(mk(G.box(0.012, 0.14, 0.14), SH, [0, 0.08, -0.2], [0.4, 0, 0]));
    const arcs = []; for (let i = 0; i < 3; i++) { const m = C('eGlow2' ); const a = mk(G.tor(0.1 + i * 0.075, 0.014, 5, 16, PI * 0.6), GX.M.eGlow2.clone(), [0, 0.1 + i * 0.01, -0.02], [-PI / 2 + 0.5, 0, PI * 0.2]); a.castShadow = false; b.add(a); arcs.push(a); }
    b.add(mk(G.cyl(0.008, 0.008, 0.14, 4), B, [0, 0.12, 0]));
    return { g, h: 0.4, fly: true, tick(a) {
      const fl = pulse(a.hit, 0.2);
      b.position.y = sin(a.t * 2.6 + a.seed * 9) * 0.06; b.rotation.x = sin(a.t * 1.7 + a.seed * 4) * 0.06 + fl * 0.3;
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (sin(a.t * 9 + a.seed * 5) * 0.32 + 0.12); });
      arcs.forEach((r, i) => { const u = (a.t * 1.6 - i * 0.25) % 1; r.material.emissiveIntensity = 0.6 + 3.2 * Math.max(0, 1 - Math.abs(u - 0.3) * 4); r.scale.setScalar(1 + 0.06 * sin(a.t * 6 - i)); });
    } };
  };

  ENEMY.packer = function (C) {
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), GL = C('eGlow2'), BO = C('eBone');
    const core = grp([0, 0.36, 0]); g.add(core);
    core.add(mk(G.sph(0.13, 14, 10), GL));
    const shells = [];
    for (let i = 0; i < 3; i++) { const r = 0.2 + i * 0.055; const geo = G.box(0.001, 0.001, 0.001); const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, PI * 1.15, 0.35, PI * 0.5), SH); s.material = SH; s.castShadow = true; const p = grp([0, 0, 0]); p.add(s); const e = mk(G.tor(r, 0.012, 5, 20, PI * 1.15), GL, null, [PI / 2, 0, 0]); e.castShadow = false; p.add(e); p.userData = { ax: i, sp: (1.1 + i * 0.5) * (i % 2 ? -1 : 1) }; core.add(p); shells.push(p); }
    const legs = []; for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, z = ((i % 3) - 1) * 0.13; const l = grp([s * 0.14, 0.14, z]); l.add(mk(G.box(0.16, 0.03, 0.03), BO, [s * 0.07, 0.02, 0], [0, 0, s * 0.4])); l.add(mk(G.cone(0.02, 0.16, 5), B, [s * 0.15, -0.06, 0], [0, 0, PI])); g.add(l); legs.push(l); }
    g.add(mk(G.rbox(0.24, 0.07, 0.34, 0.03), B, [0, 0.15, 0]));
    let ph = 0;
    return { g, h: 0.75, tick(a) {
      ph += a.dt * 10 * a.sp; const cst = punch(a.atk, 0.6), fl = pulse(a.hit, 0.18);
      core.position.y = 0.38 + sin(a.t * 2.2) * 0.02 + cst * 0.12;
      shells.forEach((p, i) => { const u = p.userData; p.rotation.set(i === 0 ? a.t * u.sp : 0.6, i === 1 ? a.t * u.sp : a.t * 0.4, i === 2 ? a.t * u.sp : 0.3); p.scale.setScalar(1 + cst * 0.45 + fl * 0.15); });
      core.children[0].scale.setScalar(1 + cst * 0.8 + 0.08 * sin(a.t * 7));
      legs.forEach((l, i) => { l.rotation.y = a.move ? sin(ph + i * 2.1) * 0.5 : 0; l.position.y = 0.14 + (a.move ? Math.max(0, sin(ph + i * 2.1 + 1.5)) * 0.03 : 0); });
    } };
  };

  // ---------------- Boss ----------------
  ENEMY.boss1 = function (C) {   // 万傀：悬浮的操偶师，牵着成群的傀儡
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), R = C('eGlow'), BO = C('eBone'), GL = C('eGlow2');
    const body = grp([0, 0.55, 0]); g.add(body);
    body.add(mk(G.cyl(0.3, 0.46, 0.95, 6), B, [0, 0.5, 0]));
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + PI / 6; body.add(mk(G.box(0.03, 0.8, 0.03), R, [cos(a) * 0.385, 0.5, sin(a) * 0.385], [sin(a) * 0.17, 0, -cos(a) * 0.17])); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; body.add(mk(G.box(0.2, 0.42, 0.04), SH, [cos(a) * 0.4, 0.06, sin(a) * 0.4], [0, -a + PI / 2, 0.0])); body.add(mk(G.cone(0.03, 0.34, 5), B, [cos(a) * 0.36, -0.28, sin(a) * 0.36], [PI, 0, 0])); }
    const chest = []; for (const s of [-1, 1]) { const p = grp([s * 0.17, 0.62, 0.3]); p.add(mk(G.box(0.2, 0.4, 0.05), SH, [-s * 0.07, 0, 0])); body.add(p); chest.push(p); }
    const heart = mk(G.sph(0.17, 14, 10), R, [0, 0.62, 0.2]); body.add(heart);
    const head = grp([0, 1.2, 0.02]); body.add(head);
    head.add(mk(G.oct(0.24), SH, null, null, [1, 1.25, 0.9])); head.add(mk(G.box(0.26, 0.035, 0.03), R, [0, 0.03, 0.2]));
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.42; head.add(mk(G.cone(0.035, 0.3 - Math.abs(i - 2) * 0.05, 5), BO, [sin(a) * 0.22, 0.26 + cos(a) * 0.08, -0.04], [0, 0, -a * 0.8])); }
    const arms = [];
    for (const s of [-1, 1]) { const sh = grp([s * 0.36, 0.9, 0]); sh.add(mk(G.sph(0.1, 10, 8), SH)); const up = mk(G.box(0.07, 0.42, 0.07), B, [s * 0.12, -0.16, 0], [0, 0, s * 0.6]); sh.add(up); const fore = grp([s * 0.25, -0.34, 0]); fore.add(mk(G.box(0.06, 0.4, 0.06), BO, [0, 0.16, 0.12], [0.7, 0, 0])); const hand = grp([0, 0.33, 0.27]); hand.add(mk(G.sph(0.07, 8, 6), SH)); for (let f = 0; f < 3; f++) hand.add(mk(G.cone(0.016, 0.14, 4), BO, [(f - 1) * 0.05, 0.02, 0.09], [1.2, 0, 0])); fore.add(hand); sh.add(fore); body.add(sh); arms.push({ sh, fore, hand }); }
    // 傀儡与牵线
    const pups = [], lineMat = new THREE.LineBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0.8, toneMapped: false });
    for (let i = 0; i < 6; i++) { const p = grp([0, 0, 0]); p.add(mk(G.tet(0.11), SH)); p.add(mk(G.sph(0.035, 6, 5), R, [0, 0.02, 0.07])); p.add(mk(G.cone(0.02, 0.12, 4), BO, [0, -0.1, 0], [PI, 0, 0])); g.add(p); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const ln = new THREE.Line(lg, lineMat); ln.frustumCulled = false; g.add(ln); pups.push({ p, ln, a: i / 6 * PI * 2, r: 0.85 + (i % 2) * 0.22, y: 0.5 + (i % 3) * 0.28 }); }
    const hp = new THREE.Vector3(), tmp = new THREE.Vector3();
    return { g, h: 2.2, boss: true, tick(a) {
      const cst = pulse(a.cast, 2.6), hit = punch(a.atk, 0.5), fl = pulse(a.hit, 0.15), p2 = a.phase >= 2 ? TD.smooth((a.phaseAge || 9) / 1.2) : 0;
      body.position.y = 0.55 + sin(a.t * 1.3) * 0.06 + cst * 0.15; body.rotation.z = sin(a.t * 0.9) * 0.03 + fl * 0.03; body.rotation.x = hit * 0.35 - cst * 0.12;
      head.rotation.y = sin(a.t * 0.7) * 0.3; head.rotation.x = -cst * 0.4 + sin(a.t * 6) * 0.02 * (1 + p2 * 3);
      chest.forEach((p, i) => { p.rotation.y = (i ? 1 : -1) * p2 * 1.4; });
      heart.scale.setScalar(0.6 + p2 * 0.7 + 0.12 * sin(a.t * (4 + p2 * 6)));
      arms.forEach((ar, i) => { const s = i ? 1 : -1; ar.sh.rotation.z = s * (0.2 + 0.25 * sin(a.t * 1.6 + i * 2) + cst * 1.3); ar.sh.rotation.x = -0.3 + sin(a.t * 1.1 + i) * 0.3 - cst * 0.8 + hit * 1.2; ar.fore.rotation.x = sin(a.t * 2.3 + i * 1.7) * 0.3; });
      g.updateMatrixWorld(true);
      pups.forEach((u, i) => {
        const vis = p2 < 0.6 || i % 3 === 0; u.p.visible = u.ln.visible = vis && (1 - p2 * 0.0) > 0;
        const w = a.t * (0.9 + p2 * 1.5) + u.a, r = u.r * (1 - cst * 0.5) + p2 * 0.3;
        u.p.position.set(cos(w) * r, u.y + sin(a.t * 2.2 + i) * 0.12 + cst * 0.5, sin(w) * r + cst * 0.6);
        u.p.rotation.set(sin(a.t * 3 + i) * 0.5, -w, sin(a.t * 2 + i) * 0.4);
        const hand = arms[i % 2].hand; hand.getWorldPosition(hp); g.worldToLocal(hp);
        const arr = u.ln.geometry.attributes.position.array; arr[0] = hp.x; arr[1] = hp.y; arr[2] = hp.z; arr[3] = u.p.position.x; arr[4] = u.p.position.y + 0.08; arr[5] = u.p.position.z; u.ln.geometry.attributes.position.needsUpdate = true;
      });
    } };
  };

  ENEMY.boss2 = function (C) {   // 蜃楼：层叠旋转的棱晶与它的幻影
    const g = new THREE.Group(), B = C('eBody'), GL = C('eGlow2'), R = C('eGlow');
    const prismM = new THREE.MeshPhysicalMaterial({ color: 0x2a1650, metalness: 0.85, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, emissive: 0x7a2ad0, emissiveIntensity: 0.55 });
    prismM.userData.e0 = prismM.emissive.clone(); prismM.userData.i0 = 0.55; prismM.userData.c0 = prismM.color.clone(); C.list.push(prismM);
    const ghostM = new THREE.MeshBasicMaterial({ color: 0xb060ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const stack = grp([0, 0.5, 0]); g.add(stack);
    const tiers = [], sizes = [[0.42, 0.34, 3], [0.34, 0.4, 4], [0.27, 0.36, 3], [0.2, 0.34, 4], [0.12, 0.3, 3]];
    let y = 0;
    sizes.forEach((s, i) => { const t = grp([0, y + s[1] / 2, 0]); t.add(mk(G.prism(s[0], s[1], s[2]), prismM)); const e = mk(G.tor(s[0] * 0.9, 0.012, 5, s[2]), GL, [0, s[1] / 2 + 0.02, 0], [PI / 2, 0, 0]); e.castShadow = false; t.add(e); t.userData = { y: y + s[1] / 2, sp: (0.7 + i * 0.35) * (i % 2 ? -1 : 1), r: 0 }; stack.add(t); tiers.push(t); y += s[1] + 0.07; });
    const tip = mk(G.oct(0.11), R, [0, y + 0.12, 0]); stack.add(tip);
    stack.add(mk(G.cone(0.3, 0.55, 3), B, [0, -0.32, 0], [PI, 0, 0]));
    const ghosts = []; for (const s of [-1, 1]) { const gh = grp([s * 0.5, 0.5, 0]); let yy = 0; sizes.forEach((sz, i) => { const m = new THREE.Mesh(G.prism(sz[0], sz[1], sz[2]), ghostM); m.position.y = yy + sz[1] / 2; gh.add(m); yy += sz[1] + 0.07; }); g.add(gh); ghosts.push(gh); }
    const glyphs = grp([0, 0.9, 0]); g.add(glyphs);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; const p = mk(G.box(0.14, 0.2, 0.012), i % 2 ? GL : R, [cos(a) * 0.75, sin(i * 1.7) * 0.2, sin(a) * 0.75], [0, -a + PI / 2, 0]); p.castShadow = false; glyphs.add(p); }
    const storm = new THREE.Mesh(G.ring(0.94, 1, 48), GX.basicAdd(0xc060ff, 0)); storm.position.y = 0.1; g.add(storm);
    return { g, h: 2.5, boss: true, tick(a) {
      const cst = pulse(a.cast, 2.4), fl = pulse(a.hit, 0.15), p2 = a.phase >= 2 ? TD.smooth((a.phaseAge || 9) / 1.2) : 0, hit = punch(a.atk, 0.5);
      stack.position.y = 0.5 + sin(a.t * 1.1) * 0.08; stack.rotation.x = hit * 0.4;
      tiers.forEach((t, i) => { t.rotation.y = cst > 0.3 ? TD.lerp(t.rotation.y, 0, 0.1) : t.rotation.y + a.dt * t.userData.sp * (1 + p2 * 1.5); t.position.y = t.userData.y + i * 0.09 * p2 + sin(a.t * 2 + i) * 0.015; const rr = p2 * 0.16 * (i % 2 ? 1 : -1); t.position.x = cos(a.t * 1.4 + i * 1.3) * rr + fl * 0.03 * sin(i * 3.0); t.position.z = sin(a.t * 1.4 + i * 1.3) * rr; });
      tip.rotation.y = a.t * 3; tip.scale.setScalar(1 + cst * 1.6 + 0.15 * sin(a.t * 6));
      ghosts.forEach((gh, i) => { const s = i ? 1 : -1; gh.position.x = s * (0.45 + 0.25 * sin(a.t * 0.8 + i * 2) + p2 * 0.3); gh.position.y = 0.5 + sin(a.t * 1.1 + 1 + i) * 0.1; gh.rotation.y = -a.t * 0.6 * s; gh.visible = sin(a.t * 13 + i * 4) > -0.75; });
      ghostM.opacity = 0.14 + 0.1 * sin(a.t * 3) + cst * 0.3 + p2 * 0.08;
      glyphs.rotation.y = a.t * (0.6 + p2 * 1.4); glyphs.position.y = 0.9 + sin(a.t * 0.9) * 0.12;
      const su = a.stormAge != null && a.stormAge < 1 ? a.stormAge : -1;
      if (su >= 0) { storm.visible = true; const s = 0.4 + su * (a.stormR || 3.6); storm.scale.set(s, 1, s); storm.material.opacity = 0.9 * (1 - su); } else storm.visible = false;
    } };
  };

  ENEMY.boss3 = function (C) {   // 蛰影：潜伏的节肢体，提权长甲，破坏时展翅露核
    const g = new THREE.Group(), B = C('eBody'), SH = C('eShell'), R = C('eGlow'), BO = C('eBone'), W = C('tWarn');
    const body = grp([0, 0.42, 0]); g.add(body);
    body.add(mk(G.sph(0.34, 18, 12), B, [0, 0, 0.1], null, [1, 0.62, 1.35]));
    const head = grp([0, -0.02, 0.6]); body.add(head);
    head.add(mk(G.sph(0.2, 14, 10), SH, null, null, [1.15, 0.6, 1]));
    for (let i = 0; i < 6; i++) head.add(mk(G.sph(0.028, 6, 5), R, [(i % 3 - 1) * 0.09, 0.06 + (i < 3 ? 0 : 0.045), 0.15 - Math.abs(i % 3 - 1) * 0.03]));
    const jaws = []; for (const s of [-1, 1]) { const j = grp([s * 0.1, -0.03, 0.14]); j.add(mk(G.cone(0.04, 0.3, 5), BO, [s * 0.03, 0, 0.13], [PI / 2, 0, -s * 0.25])); head.add(j); jaws.push(j); }
    const tail = []; let par = body, px = -0.36;
    for (let i = 0; i < 5; i++) { const s = grp([0, i === 0 ? 0.04 : 0, i === 0 ? -0.36 : -0.24]); const r = 0.24 - i * 0.035; s.add(mk(G.sph(r, 12, 8), i % 2 ? SH : B, null, null, [1, 0.7, 1.2])); const b = mk(G.tor(r * 0.9, 0.014, 5, 14), R, [0, 0, 0.1]); b.castShadow = false; s.add(b); par.add(s); par = s; tail.push(s); }
    const sting = mk(G.cone(0.06, 0.36, 6), R, [0, 0.05, -0.26], [-PI / 2 - 0.5, 0, 0]); par.add(sting);
    const legs = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const hip = grp([s * 0.3, -0.02, 0.36 - i * 0.3]); const up = grp([0, 0, 0]); up.add(mk(G.box(0.38, 0.055, 0.055), BO, [s * 0.17, 0.1, 0], [0, 0, s * 0.55])); const lo = mk(G.cone(0.035, 0.55, 5), B, [s * 0.36, -0.06, 0], [0, 0, PI + s * 0.18]); up.add(lo); up.add(mk(G.sph(0.045, 6, 5), SH, [s * 0.33, 0.2, 0])); hip.add(up); body.add(hip); legs.push({ hip, s, i }); }
    // 提权护甲
    const armor = []; for (let i = 0; i < 4; i++) { const p = mk(G.box(0.5 - i * 0.07, 0.05, 0.24), SH, [0, 0.215 - i * 0.012, 0.36 - i * 0.24], [0.08, 0, 0]); p.add(mk(G.box(0.3 - i * 0.05, 0.02, 0.03), W, [0, 0.035, 0])); body.add(p); armor.push(p); }
    // 鞘翅与核心
    const core = mk(G.sph(0.15, 12, 9), R, [0, 0.18, 0.0]); body.add(core);
    const wings = []; for (const s of [-1, 1]) { const w = grp([s * 0.06, 0.24, 0.22]); const p = mk(G.sph(0.3, 12, 8), SH, [s * 0.14, 0, -0.34], null, [0.55, 0.14, 1.3]); w.add(p); const bl = mk(G.cone(0.08, 0.8, 4), R, [s * 0.16, 0.02, -0.5], [-PI / 2, 0, 0]); bl.scale.set(1, 1, 0.15); w.add(bl); body.add(w); wings.push(w); }
    let ph = 0;
    return { g, h: 1.3, boss: true, tick(a) {
      ph += a.dt * 7 * Math.max(0.2, a.sp * 2);
      const cst = pulse(a.cast, 3), fl = pulse(a.hit, 0.15), hit = punch(a.atk, 0.45);
      const k2 = a.phase >= 2 ? TD.smooth((a.phase > 2 ? 9 : a.phaseAge || 9) / 1.0) : 0, k3 = a.phase >= 3 ? TD.smooth((a.phaseAge || 9) / 1.2) : 0;
      const crouch = a.phase === 1 ? 0.1 : 0;
      body.position.y = 0.42 - crouch + sin(ph * 2) * 0.012 * (a.move ? 1 : 0) + k3 * 0.08 + fl * 0.02; body.rotation.x = -hit * 0.3 + cst * 0.14; body.position.z = hit * 0.25;
      head.rotation.y = sin(a.t * 1.3) * 0.25; jaws.forEach((j, i) => { j.rotation.y = (i ? -1 : 1) * (0.15 + 0.15 * sin(a.t * 5) + hit * 0.7 + cst * 0.5); });
      tail.forEach((s, i) => { s.rotation.x = 0.1 + (0.16 + k3 * 0.22 + cst * 0.12) * (i > 0 ? 1 : 0.3) + sin(a.t * 2 + i * 0.6) * 0.04; s.rotation.y = sin(a.t * 1.6 - i * 0.7) * 0.12; });
      sting.scale.setScalar(1 + k3 * 0.6 + cst * 0.5);
      legs.forEach((l) => { const w = ph + ((l.i + (l.s > 0 ? 1 : 0)) % 2 ? PI : 0); l.hip.rotation.y = a.move ? sin(w) * 0.35 * l.s : 0; l.hip.rotation.z = (a.move ? Math.max(0, cos(w)) * 0.22 : 0) * l.s + l.s * crouch * 1.2; });
      armor.forEach((p, i) => { const s = TD.smooth(k2 * 1.6 - i * 0.2); p.visible = s > 0.02; p.scale.set(s, 1, s); });
      wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.y = s * k3 * 0.9; w.rotation.z = s * k3 * 0.55; w.rotation.x = -k3 * 0.25 + (k3 > 0.5 ? sin(a.t * 24) * 0.04 : 0); });
      core.scale.setScalar(0.5 + k3 * 1.1 + 0.1 * sin(a.t * 6) + cst * 0.5);
    } };
  };

  GX.makeEnemy = function (type) { const C = matSet(); const m = ENEMY[type](C); detailEnemy(m, type, C); m.mats = C.list; return m; };

  // 业务数据包（纯视觉，正常流量）
  GX.pktGeo = function () { return G.rbox(0.15, 0.1, 0.2, 0.02); };
})(window);
