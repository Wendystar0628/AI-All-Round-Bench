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
