'use strict';
/* 港口道具：灯柱/电线、鱼箱、晾网架、绞盘与吊杆、浮标、告示牌、雨伞、乐器箱、风向袋 */
const LampTops = [];
const WINDSOCKS = [];
const FloatBuoys = [];

function crate(P, pos, rot, col, kind) {
  P.T(pos, rot, null, () => {
    if (kind === 'basket') {
      const W = 0.6, Hh = 0.3, D = 0.4, c = new Col(col), dk = c.clone().multiplyScalar(0.55);
      P.box(W, 0.03, D, [0, 0.015, 0], c);
      for (const sx of [-1, 1]) P.box(0.03, Hh, D, [sx * (W / 2 - 0.015), Hh / 2, 0], c);
      for (const sz of [-1, 1]) P.box(W, Hh, 0.03, [0, Hh / 2, sz * (D / 2 - 0.015)], c);
      P.box(W + 0.03, 0.035, D + 0.03, [0, Hh, 0], c);
      for (let i = -2; i <= 2; i++) for (const sz of [-1, 1]) P.box(0.07, 0.14, 0.012, [i * 0.1, 0.15, sz * (D / 2 + 0.002)], dk);
      for (const sx of [-1, 1]) P.box(0.012, 0.07, 0.2, [sx * (W / 2 + 0.002), 0.22, 0], dk);
    } else {
      const W = 0.52, Hh = 0.27, D = 0.36, c = new Col(col), dk = c.clone().multiplyScalar(0.7);
      P.box(W, Hh, D, [0, Hh / 2, 0], c); P.box(W + 0.02, 0.03, D + 0.02, [0, Hh, 0], dk);
      for (let i = -3; i <= 3; i++) for (const sz of [-1, 1]) P.box(0.04, 0.12, 0.008, [i * 0.07, 0.135, sz * (D / 2 + 0.002)], dk.clone().multiplyScalar(0.62));
      for (const sx of [-1, 1]) P.box(0.008, 0.05, 0.16, [sx * (W / 2 + 0.002), 0.2, 0], dk.clone().multiplyScalar(0.55));
    }
  });
}
function stackCrates(P, x, z, ry, cols, kind, n) {
  for (let i = 0; i < n; i++) crate(P, [x + (R() - 0.5) * 0.03, QH + i * (kind === 'basket' ? 0.3 : 0.27), z + (R() - 0.5) * 0.03], [0, ry + (R() - 0.5) * 0.08, 0], cols[i % cols.length], kind);
}

function lampPost(P, x, z, h, face) {
  const col = '#4d6e70';
  P.cyl(0.2, 0.26, 0.12, 10, [x, QH + 0.06, z], '#3e5557'); P.cyl(0.09, 0.12, h - 0.2, 10, [x, QH + h / 2 + 0.1, z], col);
  P.tor(0.115, 0.02, [x, QH + 0.4, z], '#6f8d90', [Math.PI / 2, 0, 0], 10, 4); P.tor(0.1, 0.018, [x, QH + 1.6, z], '#6f8d90', [Math.PI / 2, 0, 0], 10, 4);
  // 横臂伸向水面一侧
  const ax = x + Math.cos(face) * 0.55, az = z + Math.sin(face) * 0.55, ty = QH + h;
  P.rod([x, ty - 0.15, z], [x + Math.cos(face) * 0.25, ty + 0.12, z + Math.sin(face) * 0.25], 0.045, col, 7); P.rod([x + Math.cos(face) * 0.25, ty + 0.12, z + Math.sin(face) * 0.25], [ax, ty + 0.1, az], 0.04, col, 7);
  // 圆环形灯罩：碟形罩 + 圆环沿 + 灯泡
  P.T([ax, ty, az], [0, 0, 0], null, () => {
    P.cyl(0.07, 0.45, 0.14, 18, [0, 0.09, 0], '#e8efe9', [0, 0, 0], true);
    P.cyl(0.0, 0.07, 0.04, 10, [0, 0.18, 0], '#8aa0a3');
    P.tor(0.45, 0.035, [0, 0.02, 0], '#d6e1dd', [Math.PI / 2, 0, 0], 22, 6);
    P.tor(0.2, 0.014, [0, 0.07, 0], '#bccbc7', [Math.PI / 2, 0, 0], 16, 4);
    P.cyl(0.06, 0.06, 0.04, 8, [0, 0.0, 0], '#6c7f82');
  });
  LampTops.push({ x: ax, y: ty, z: az, top: new V3(x, ty + 0.1, z) });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; addDrip(ax + Math.cos(a) * 0.45, ty + 0.0, az + Math.sin(a) * 0.45, QH, { rate: 0.28, ripple: false }); }
}

function wireBetween(P, a, b, sag, r = 0.0065) {
  const n = 18; let prev = null;
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - sag * 4 * u * (1 - u), lerp(a[2], b[2], u)];
    if (prev) P.rod(prev, p, r, '#2b3538', 4); prev = p;
  }
}

function buildNetRack(scene) {
  const P = new Parts(); P.jit = 0.03; const x0 = -11.3, x1 = -7.3, z = 11.6, h = 2.3;
  for (const x of [x0, x1]) { P.rod([x, QH, z - 0.3], [x, QH + h, z], 0.045, '#8d4f2e', 7); P.rod([x, QH, z + 0.3], [x, QH + h, z], 0.045, '#8d4f2e', 7); P.cyl(0.07, 0.09, 0.05, 8, [x, QH + 0.025, z - 0.3], '#5f6a6c'); P.cyl(0.07, 0.09, 0.05, 8, [x, QH + 0.025, z + 0.3], '#5f6a6c'); }
  P.rod([x0 - 0.1, QH + h, z], [x1 + 0.1, QH + h, z], 0.04, '#9b5a33', 7);
  P.rod([x0, QH + 1.2, z - 0.3], [x1, QH + 1.2, z - 0.3], 0.02, '#7a5a40', 5);
  P.rod([x0 + 0.02, QH + 1.2, z - 0.28], [x0, QH + h - 0.1, z], 0.025, '#8d4f2e', 5);
  scene.add(mesh(P.build(), MAT.metal));
  // 渔网（飘动）
  const mkNet = (w, hh, cx, cy, cz, col, ry, tile) => {
    const g = new THREE.PlaneGeometry(w, hh, 14, 10);
    const pos = g.attributes.position, sw = [];
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); sw.push(clamp((hh / 2 - y) / hh, 0, 1) * 1.0, rnd(0, 6.28) * 0 + 0.7); }
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 2));
    const t = texNet(256, 256, 16, col); t.repeat.set(w * tile, hh * tile);
    const m = new THREE.Mesh(g, toonMat({ map: t, vc: false, color: 0xffffff, alphaTest: 0.3, side: THREE.DoubleSide, sway: 4, lift: 0.2, drops: 0 }));
    m.position.set(cx, cy, cz); m.rotation.y = ry; m.layers.set(LAYER.GLASS); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  };
  mkNet(2.0, 1.55, -10.3, QH + h - 0.78, z + 0.02, '#e1dbc0', 0.0, 2.0);
  mkNet(1.6, 1.3, -8.3, QH + h - 0.66, z - 0.04, '#6fb7b1', 0.05, 2.2);
  mkNet(1.1, 0.9, -9.2, QH + 1.2 - 0.45 + 0.02, z - 0.3, '#d8a65a', 0.0, 2.6);
  // 浮球串（绳垂成悬链）
  const Pf = new Parts(); Pf.jit = 0.02;
  const a = [x0 - 0.1, QH + h - 0.05, z + 0.0], b = [x1 + 0.1, QH + h - 0.05, z];
  const n = 20, sag = 0.5; let prev = null;
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - sag * 4 * u * (1 - u) - 0.02, lerp(a[2], b[2], u) + 0.18];
    if (prev) Pf.rod(prev, p, 0.014, '#d7cdb3', 4); prev = p;
    if (i % 2 === 1) Pf.sph(0.075, p, i % 4 === 1 ? '#f0f2ee' : (i % 4 === 3 ? '#f08a2c' : '#e0553a'), [1, 1, 1], 8, 6);
  }
  scene.add(mesh(Pf.build(), MAT.vcWet));
}

function buildWinchAndDavit(scene) {
  const P = new Parts(); P.jit = 0.05; const bx = -4.6, bz = 7.5, Y = QH;
  const rust = (x, y, z) => { const n = fbm2(x * 9 + y * 5, z * 9); return new Col(n > 0.62 ? '#9a5030' : (n > 0.45 ? '#7a4a38' : '#5b5249')); };
  P.T([bx, Y, bz], [0, 0.3, 0], null, () => {
    P.box(0.9, 0.06, 0.6, [0, 0.03, 0], rust);
    for (const sz of [-1, 1]) P.box(0.06, 0.55, 0.36, [sz * 0.0 + 0.0, 0.33, sz * 0.0], rust);
    P.box(0.05, 0.5, 0.36, [-0.28, 0.31, 0], rust); P.box(0.05, 0.5, 0.36, [0.28, 0.31, 0], rust);
    P.cyl(0.12, 0.12, 0.5, 12, [0, 0.42, 0], '#6d5d50', [0, 0, Math.PI / 2]);
    P.cyl(0.15, 0.15, 0.03, 12, [-0.2, 0.42, 0], rust, [0, 0, Math.PI / 2]); P.cyl(0.15, 0.15, 0.03, 12, [0.2, 0.42, 0], rust, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) P.tor(0.13, 0.02, [-0.13 + i * 0.052, 0.42, 0], '#d9cdb0', [0, Math.PI / 2, 0], 12, 4);
    P.cyl(0.04, 0.04, 0.16, 8, [0.34, 0.42, 0], '#8a6a52', [0, 0, Math.PI / 2]);
    P.rod([0.4, 0.42, 0], [0.4, 0.42 + 0.3, 0.0], 0.022, '#9a5030', 6); P.rod([0.4, 0.72, 0], [0.4 + 0.0, 0.72, 0.16], 0.022, '#9a5030', 6); P.cyl(0.03, 0.03, 0.14, 8, [0.4, 0.72, 0.2], '#4b3f38', [Math.PI / 2, 0, 0]);
    P.cyl(0.13, 0.13, 0.03, 12, [-0.33, 0.42, 0], '#7a5c46', [0, 0, Math.PI / 2]);
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.box(0.03, 0.03, 0.03, [-0.35, 0.42 + Math.sin(a) * 0.14, Math.cos(a) * 0.14], '#5b4a3e'); }
    for (const [x, z] of [[-0.38, -0.25], [0.38, -0.25], [-0.38, 0.25], [0.38, 0.25]]) P.cyl(0.03, 0.03, 0.025, 6, [x, 0.075, z], '#3b3a39');
    P.rod([0.25, 0.42, 0.1], [0.5, 0.06, 0.55], 0.03, '#d9cdb0', 5);        // 绳尾
  });
  // 吊杆（davit）
  const dx = -5.35, dz = 6.7;
  P.cyl(0.07, 0.1, 0.1, 10, [dx, Y + 0.05, dz], '#5b4a42');
  P.cyl(0.055, 0.07, 1.75, 8, [dx, Y + 0.95, dz], rust);
  P.rod([dx, Y + 1.78, dz], [dx + 0.05, Y + 1.9, dz - 1.05], 0.045, '#8a4a30', 7);
  P.rod([dx, Y + 1.1, dz], [dx + 0.05, Y + 1.8, dz - 0.7], 0.022, '#7a4a38', 5);
  P.tor(0.06, 0.012, [dx + 0.05, Y + 1.86, dz - 1.05], '#4a4a4a', [0, Math.PI / 2, 0], 10, 4);
  P.rod([dx + 0.05, Y + 1.85, dz - 1.05], [dx + 0.05, Y + 0.95, dz - 1.05], 0.012, '#d6cba9', 4);
  P.cyl(0.015, 0.015, 0.14, 5, [dx + 0.05, Y + 0.88, dz - 1.05], '#555'); P.tor(0.04, 0.01, [dx + 0.05, Y + 0.78, dz - 1.05], '#555', [0, Math.PI / 2, 0], 8, 4, 4.3);
  P.sph(0.1, [dx + 0.05, Y + 0.6, dz - 1.05], '#e8553a', null, 8, 6);
  scene.add(mesh(P.build(), MAT.metal));
  addDrip(dx + 0.05, Y + 0.5, dz - 1.05, 0.0, { rate: 0.4, water: true });
}

function buildBuoysAndSign(scene) {
  const tex1 = texBuoy('7', '#d9553c'), tex2 = texBuoy('12', '#2b82a6'), tex3 = texBuoy('3', '#e8a53a');
  const mkBuoy = (tex, r) => { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), toonMat({ map: tex, vc: false, color: 0xffffff, gloss: 0.5, drops: 0.8 })); body.castShadow = true; body.receiveShadow = true; g.add(body); const P = new Parts(); P.jit = 0; P.tor(r * 0.28, r * 0.07, [0, r * 1.02, 0], '#4d4540', [0, 0, 0], 10, 5); P.cyl(r * 0.2, r * 0.25, r * 0.12, 8, [0, r * 0.95, 0], '#4d4540'); P.cyl(r * 0.15, r * 0.2, r * 0.1, 8, [0, -r * 0.95, 0], '#4d4540'); g.add(mesh(P.build(), MAT.vc)); return g; };
  // 码头上的浮标（褪色编号）
  [[-8.0, -1.0, tex1, 0.32, 0.5], [-8.3, -0.3, tex2, 0.28, 0.2], [-12.9, 8.6, tex3, 0.3, 1.8]].forEach(([x, z, t, r, ry]) => { const b = mkBuoy(t, r); b.position.set(x, QH + r * 0.95, z); b.rotation.y = ry; scene.add(b); });
  // 水中的系船浮标
  [[-2.2, -2.8, tex1, 0.3], [3.1, -6.0, tex2, 0.34], [8.5, 1.5, tex3, 0.3]].forEach(([x, z, t, r], i) => {
    const b = mkBuoy(t, r); b.position.set(x, 0, z); scene.add(b);
    const P = new Parts(); P.jit = 0; const a = [x, -0.1, z], e = [x + 0.3, seabedH(x, z) + 0.1, z + 0.3];
    P.rod(a, e, 0.012, '#4b5d5a', 4); scene.add(mesh(P.build(), MAT.vcUnder, { cast: false }));
    FloatBuoys.push({ g: b, x, z, r, ph: rnd(0, 6.28), y0: -r * 0.2 });
  });
  Systems.push((dt, t) => {
    for (const f of FloatBuoys) {
      const w = Wake.at(f.x, f.z);
      f.g.position.y = f.y0 + Math.sin(t * 1.3 + f.ph) * 0.04 + w * 0.08 * Math.sin(t * 5 + f.ph);
      f.g.rotation.z = Math.sin(t * 0.9 + f.ph) * 0.1 + w * 0.2 * Math.sin(t * 4); f.g.rotation.x = Math.sin(t * 0.7 + f.ph * 2) * 0.08;
    }
  });
  // 告示牌
  const P = new Parts(); P.jit = 0.03; const sx = -2.4, sz = 7.2;
  for (const dx of [-0.95, 0.95]) { P.box(0.12, 1.7, 0.12, [sx + dx, QH + 0.85, sz], '#8a6a46'); P.box(0.2, 0.06, 0.2, [sx + dx, QH + 0.03, sz], '#6d7e83'); }
  P.box(2.2, 0.06, 0.14, [sx, QH + 1.62, sz - 0.01], '#7a5a3c'); P.box(2.2, 0.06, 0.14, [sx, QH + 0.58, sz - 0.01], '#7a5a3c');
  scene.add(mesh(P.build(), MAT.wall));
  scene.add(texPlane(texSign(), 2.1, 1.05, [sx, QH + 1.12, sz + 0.075], [0, 0, 0], { lift: 0.32, gloss: 0.4 }));
  addDrip(sx - 0.7, QH + 0.55, sz + 0.12, QH, { rate: 0.18, ripple: false }); addDrip(sx + 0.5, QH + 0.55, sz + 0.12, QH, { rate: 0.15, ripple: false });
}

function buildCasesAndUmbrella(scene) {
  const P = new Parts(); P.jit = 0.02; const Y = QH;
  const caseBox = (x, z, ry, L, W, H) => {
    P.T([x, Y, z], [0, ry, 0], null, () => {
      const sil = '#b9c2c4', dk = '#2b3236';
      P.box(L, H, W, [0, H / 2 + 0.02, 0], sil); P.box(L + 0.02, H * 0.12, W + 0.02, [0, H * 0.5 + 0.02, 0], '#9fa9ac');      // 箱体 + 腰线
      for (let i = -3; i <= 3; i++) { P.box(0.012, H + 0.01, W + 0.012, [i * L / 8, H / 2 + 0.02, 0], '#a3adb0'); }      // 加强筋
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P.box(0.06, H + 0.02, 0.06, [sx * (L / 2 - 0.015), H / 2 + 0.02, sz * (W / 2 - 0.015)], dk); }  // 护角
      for (const sx of [-0.25, 0.25]) { P.box(0.07, 0.05, 0.025, [sx * L, H * 0.5 + 0.02, W / 2 + 0.01], '#d4b04a'); P.box(0.04, 0.03, 0.03, [sx * L, H * 0.5 + 0.02, W / 2 + 0.02], '#8a6c1c'); }   // 金色搭扣
      P.box(0.22, 0.04, 0.05, [0, H + 0.04, 0], dk); P.box(0.2, 0.025, 0.03, [0, H + 0.035, 0.0], '#555a5c');          // 提手
      P.box(0.12, 0.08, 0.005, [L * 0.28, H * 0.75 + 0.02, W / 2 + 0.008], '#f4f0e2'); P.box(0.08, 0.05, 0.005, [-L * 0.3, H * 0.3 + 0.02, W / 2 + 0.008], '#d9453a');   // 贴纸
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(0.02, 0.025, 0.02, 6, [sx * (L / 2 - 0.08), 0.01, sz * (W / 2 - 0.05)], dk);  // 脚垫
    });
  };
  caseBox(2.55, 8.15, 0.06, 0.95, 0.4, 0.26);
  caseBox(2.6, 8.72, -0.05, 0.75, 0.32, 0.22);
  // 水迹：箱子旁小块湿痕（深色薄板）
  scene.add(mesh(P.build(), MAT.vcWet));

  // 透明雨伞：斜靠在台阶边
  const g = new THREE.Group(); g.position.set(0.15, Y + 0.0, 7.0);
  const R0 = 0.66;
  const cap = new THREE.SphereGeometry(R0, 20, 10, 0, TAU, 0, 1.12); cap.scale(1, 0.46, 1);
  const um = new THREE.Mesh(cap, glassMat({ tint: '#d3f1f7', opacity: 0.22 })); um.layers.set(LAYER.GLASS); um.renderOrder = 13; um.position.y = 0.0;
  const uP = new Parts(); uP.jit = 0;
  const rimY = R0 * 0.46 * Math.cos(1.12), rimR = R0 * Math.sin(1.12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; uP.rod([0, R0 * 0.46, 0], [Math.cos(a) * rimR, rimY, Math.sin(a) * rimR], 0.008, '#dbe3e2', 4); uP.sph(0.014, [Math.cos(a) * rimR, rimY, Math.sin(a) * rimR], '#e8eeee', null, 5, 4); }
  uP.tor(rimR, 0.006, [0, rimY, 0], '#e8eeee', [Math.PI / 2, 0, 0], 24, 3);
  uP.cyl(0.012, 0.012, 1.0, 6, [0, R0 * 0.46 - 0.5, 0], '#eef2f1'); uP.cyl(0.02, 0.01, 0.06, 6, [0, R0 * 0.46 + 0.03, 0], '#d3dad9');
  uP.tor(0.07, 0.016, [0.07, R0 * 0.46 - 1.02, 0], '#6e4d34', [0, 0, 0], 10, 5, Math.PI);
  uP.cyl(0.02, 0.02, 0.2, 8, [0.14, R0 * 0.46 - 0.92, 0], '#6e4d34');
  const um2 = mesh(uP.build(), MAT.vcWet); g.add(um, um2);
  // 伞面雨珠
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), toonMat({ vc: false, color: '#dff6fb', gloss: 0.5 }), 70);
  const m4 = new M4(), qq = new Q4(), sv = new V3(), pp = new V3();
  for (let i = 0; i < 70; i++) {
    const th = rnd(0.1, 1.08), ph = rnd(0, TAU);
    pp.set(Math.sin(th) * Math.cos(ph) * R0, Math.cos(th) * R0 * 0.46 + 0.012, Math.sin(th) * Math.sin(ph) * R0);
    const s = rnd(0.012, 0.026); m4.compose(pp, qq, sv.set(s, s * 0.7, s)); beads.setMatrixAt(i, m4);
  }
  g.add(beads);
  g.rotation.set(-0.62, 0.35, 0.08); g.position.set(5.55, Y + 0.88, 6.55);
  scene.add(g);
  // 伞沿滴水
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.3; const wp = new V3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR); g.updateMatrixWorld(true); g.localToWorld(wp); addDrip(wp.x, wp.y - 0.02, wp.z, Y, { rate: i === 0 ? 0.6 : 0.3, ripple: true }); }
  window.UMBRELLA = g;
}

function buildWindsock(scene) {
  const px = 7.8, pz = 12.9, Y = QH, h = 3.4;
  const P = new Parts(); P.jit = 0;
  P.cyl(0.05, 0.07, h, 8, [px, Y + h / 2, pz], '#e9eeee'); P.cyl(0.14, 0.17, 0.12, 8, [px, Y + 0.06, pz], '#6d7e83');
  P.rod([px, Y + h * 0.58, pz], [px + 0.12, Y + h * 0.58 - 0.25, pz], 0.012, '#8a9694', 4);
  scene.add(mesh(P.build(), MAT.vc));
  const sockRoot = new THREE.Group(); sockRoot.position.set(px, Y + h + 0.05, pz); scene.add(sockRoot);
  const segs = [];
  let parent = sockRoot;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 5, 16), toonMat({ color: '#a8b3b2', vc: false })); ring.rotation.y = Math.PI / 2; parent.add(ring);
  for (let i = 0; i < 6; i++) {
    const r0 = 0.2 - i * 0.026, r1 = r0 - 0.026, L = 0.27;
    const cg = new THREE.CylinderGeometry(r1, r0, L, 12, 1, true); cg.rotateZ(Math.PI / 2); cg.translate(L / 2, 0, 0);
    const seg = new THREE.Mesh(cg, toonMat({ color: i % 2 ? '#f1f1ea' : '#ee6a2c', vc: false, side: THREE.DoubleSide, lift: 0.1 })); seg.castShadow = true;
    const pivot = new THREE.Group(); if (i > 0) pivot.position.x = 0.27; pivot.add(seg); parent.add(pivot); parent = pivot; segs.push(pivot);
  }
  WINDSOCKS.push({ root: sockRoot, segs, x: px, z: pz });
  // 小旗（码头边的杆旗）
  const mkFlag = (x, z, hh, col, wide) => {
    const P2 = new Parts(); P2.jit = 0; P2.cyl(0.03, 0.04, hh, 6, [x, QH + hh / 2, z], '#cfd6d6'); P2.sph(0.045, [x, QH + hh + 0.02, z], '#d8b04a', null, 6, 5); scene.add(mesh(P2.build(), MAT.vc));
    const g = new THREE.PlaneGeometry(wide, wide * 0.62, 8, 3); g.translate(wide / 2, 0, 0);
    const P3 = new Parts(); P3.jit = 0; P3.add(g, [x, QH + hh - 0.25, z], [0, 0, 0], null, (px2, py2, pz2) => { const u = (px2 - x) / wide; return new Col(col).lerp(new Col('#ffffff'), u > 0.45 && u < 0.7 ? 0.9 : 0); }, (px2) => [clamp((px2 - x) / wide, 0, 1), 0.3]);
    const fm = mesh(P3.build(), toonMat({ vc: true, sway: 2, side: THREE.DoubleSide, lift: 0.15 }), { cast: false }); scene.add(fm);
    return fm;
  };
  mkFlag(-13.2, -3.0, 2.2, '#d9453a', 0.7);
  mkFlag(-13.2, 13.1, 2.0, '#2f7fa6', 0.6);
  Systems.push((dt, t) => {
    for (const w of WINDSOCKS) {
      const g = Env.windAt(w.x, w.z), base = 0.5 + 0.35 * Math.sin(t * 0.5) , wind = clamp(0.62 + base * 0.2 + g * 1.0, 0.4, 1.2);
      const dirAng = Math.atan2(Env.gust.dirx, Env.gust.dirz);   // 风向（吹向 -x,+z）
      w.root.rotation.y = lerpAngle(w.root.rotation.y, -Math.atan2(Env.gust.dirz, Env.gust.dirx) + 0.0, 0.03) ;
      for (let i = 0; i < w.segs.length; i++) {
        const droop = (1 - clamp(wind, 0, 1)) * 0.16 + 0.03;
        w.segs[i].rotation.z = -droop * (i === 0 ? 1.2 : 0.8) + Math.sin(t * (2 + wind * 4) - i * 0.9) * 0.06 * (0.4 + wind) * (i + 1) * 0.6;
        w.segs[i].rotation.y = Math.sin(t * (1.6 + wind * 2.4) - i * 0.7) * 0.07 * (0.5 + wind);
      }
    }
  });
}

function buildLampsAndWires(scene) {
  const P = new Parts(); P.jit = 0.02;
  lampPost(P, 6.9, 7.2, 3.9, Math.atan2(-1, 0.0));          // LP1 前台右侧（灯罩朝向水面）
  lampPost(P, -6.95, 0.2, 3.7, Math.atan2(0, 1));            // LP2 栈桥边
  lampPost(P, -6.95, -8.0, 3.6, Math.atan2(0, 1));           // LP3 栈桥远端
  lampPost(P, -9.5, 10.5, 3.6, Math.atan2(0, 1));            // LP4 前景
  scene.add(mesh(P.build(), MAT.metal));
  // 灯泡发光 + 光晕
  const bm = new THREE.MeshBasicMaterial({ color: '#fff3c8', toneMapped: false });
  for (const l of LampTops) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bm); b.position.set(l.x, l.y - 0.02, l.z); scene.add(b);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#ffe9a8', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    h.position.set(l.x, l.y - 0.1, l.z); h.layers.set(LAYER.FX); h.renderOrder = 17; scene.add(h); l.halo = h;
  }
  { const pts = []; for (const l of LampTops) for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + rnd(-0.1, 0.1); pts.push([l.x + Math.cos(a) * 0.45, l.y + 0.045, l.z + Math.sin(a) * 0.45]); } for (const l of LampTops) for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), r = rnd(0.1, 0.4); pts.push([l.x + Math.cos(a) * r, l.y + 0.09 + (0.45 - r) * 0.15, l.z + Math.sin(a) * r]); } scene.add(makeBeads(pts, 0.015, 0.035)); }
  Systems.push((dt, t) => { for (const l of LampTops) l.halo.material.opacity = 0.1 + 0.45 * Env.lamp + 0.02 * Math.sin(t * 2.0 + l.x); });
  // 电线：斜斜穿过天空
  const W = new Parts(); W.jit = 0;
  const tp = LampTops.map(l => [l.top.x, l.top.y - 0.12, l.top.z]);
  const pole = window.UTILITY_POLE || [-11.0, QH + 5.6, -11.0];
  const ins = (a, b) => { wireBetween(W, [a[0], a[1], a[2]], [b[0], b[1], b[2]], 0.45); wireBetween(W, [a[0], a[1] - 0.12, a[2] + 0.1], [b[0], b[1] - 0.12, b[2] + 0.1], 0.5); };
  ins(tp[0], tp[1]); ins(tp[1], tp[2]); ins(tp[2], pole); ins(tp[3], tp[0]);
  wireBetween(W, tp[0], [3.5, QH + 4.9, -11.1], 0.9, 0.0065);       // 一条长线伸向灯塔方向，斜穿天空
  wireBetween(W, tp[3], [-12.0, QH + 4.2, 1.0], 0.5, 0.0065);
  scene.add(mesh(W.build(), MAT.vc, { cast: false }));
}

function buildPortProps(scene) {
  const P = new Parts(); P.jit = 0.02;
  // 鱼箱 / 蓝色周转筐（被雨淋湿，层层叠放）
  stackCrates(P, -8.0, -3.6, 0.1, ['#f1f3ef', '#2d77b8', '#f1f3ef'], 'crate', 4);
  stackCrates(P, -8.0, -4.25, -0.05, ['#2d77b8', '#f1f3ef'], 'crate', 3);
  stackCrates(P, -7.45, -3.9, 0.3, ['#f1f3ef'], 'crate', 2);
  stackCrates(P, -7.7, 3.2, 0.1, ['#2d77b8', '#2d77b8', '#f1f3ef'], 'basket', 4);
  stackCrates(P, -7.7, 3.85, -0.1, ['#f1f3ef', '#2d77b8'], 'crate', 3);
  stackCrates(P, -11.8, 9.0, 0.2, ['#f1f3ef', '#f1f3ef', '#2d77b8'], 'crate', 5);
  stackCrates(P, -11.15, 9.35, 0.5, ['#2d77b8', '#f1f3ef'], 'basket', 3);
  stackCrates(P, 7.6, 10.2, 0.2, ['#2d77b8', '#f1f3ef'], 'crate', 3);
  crate(P, [6.9, QH, 10.8], [0, 0.4, 0], '#f1f3ef', 'crate'); crate(P, [7.3, QH, 11.3], [0, -0.3, 0], '#2d77b8', 'basket');
  crate(P, [-5.2, QH, 9.6], [0, 0.2, 0.0], '#f1f3ef', 'crate'); crate(P, [-5.2, QH + 0.27, 9.6], [0, 0.35, 0.0], '#f1f3ef', 'crate');
  // 盘起的缆绳、渔具
  for (let k = 0; k < 4; k++) P.tor(0.28 - k * 0.0, 0.05, [-9.3, QH + 0.05 + k * 0.07, 4.9], k % 2 ? '#e4602f' : '#cf4f25', [Math.PI / 2, 0, 0], 18, 6);
  P.cyl(0.2, 0.2, 0.28, 14, [-9.3, QH + 0.14, 4.9], '#b94e2a', [0, 0, 0], true);
  for (let k = 0; k < 6; k++) P.tor(0.32 - k * 0.012, 0.045, [-9.4, QH + 0.05, 4.9], '#d8ccb0', [Math.PI / 2, 0, 0], 18, 6);
  P.box(0.05, 1.5, 0.05, [-6.9 + 0.05, QH + 0.75, 5.1], '#a06a3a', [0, 0, 0.12]);
  scene.add(mesh(P.build(), MAT.vcWet));
  buildNetRack(scene); buildWinchAndDavit(scene); buildBuoysAndSign(scene); buildCasesAndUmbrella(scene); buildWindsock(scene); buildLampsAndWires(scene);
}
var buildProps = function (scene) { buildPortProps(scene); };

/* 放学后的自行车：斜靠着立在候船室旁，车筐里有一把折好的伞 */
function buildBicycle(scene) {
  const P = new Parts(); P.jit = 0.015; const Y = QH;
  P.T([-10.9, Y, 6.6], [0, 0.35, 0], null, () => {
    P.T([0, 0, 0], [0.12, 0, 0], null, () => {
      const wheel = (x) => {
        P.tor(0.335, 0.024, [x, 0.36, 0], '#2a3033', [0, 0, 0], 24, 6); P.tor(0.3, 0.008, [x, 0.36, 0], '#c3cbcc', [0, 0, 0], 24, 4);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; P.rod([x, 0.36, 0], [x + Math.cos(a) * 0.3, 0.36 + Math.sin(a) * 0.3, 0], 0.003, '#c3cbcc', 3); }
        P.cyl(0.03, 0.03, 0.08, 8, [x, 0.36, 0], '#9aa4a6', [Math.PI / 2, 0, 0]);
      };
      wheel(-0.55); wheel(0.55);
      const fr = '#9edccd';
      P.rod([-0.55, 0.36, 0], [-0.12, 0.66, 0], 0.016, fr, 6); P.rod([-0.12, 0.66, 0], [0.0, 0.3, 0], 0.018, fr, 6); P.rod([0.0, 0.3, 0], [-0.55, 0.36, 0], 0.014, fr, 6);
      P.rod([-0.12, 0.66, 0], [0.42, 0.72, 0], 0.016, fr, 6); P.rod([0.0, 0.3, 0], [0.42, 0.72, 0], 0.018, fr, 6); P.rod([0.42, 0.72, 0], [0.55, 0.36, 0], 0.016, '#cfd6d6', 6);
      P.rod([-0.12, 0.66, 0], [-0.13, 0.76, 0], 0.012, '#9aa4a6', 5); P.box(0.2, 0.04, 0.09, [-0.11, 0.79, 0], '#2b2f32'); P.sph(0.05, [-0.2, 0.78, 0], '#2b2f32', [1.4, 0.55, 0.9], 8, 6);
      P.rod([0.42, 0.72, 0], [0.4, 0.82, 0], 0.012, '#9aa4a6', 5); P.rod([0.4, 0.82, -0.22], [0.4, 0.82, 0.22], 0.013, '#9aa4a6', 5); P.cyl(0.018, 0.018, 0.1, 6, [0.4, 0.82, -0.25], '#2b2f32', [Math.PI / 2, 0, 0]); P.cyl(0.018, 0.018, 0.1, 6, [0.4, 0.82, 0.25], '#2b2f32', [Math.PI / 2, 0, 0]);
      P.box(0.3, 0.2, 0.32, [0.62, 0.64, 0], '#b8c4c6'); for (let i = -3; i <= 3; i++) { P.box(0.012, 0.2, 0.33, [0.62 + i * 0.045, 0.64, 0], '#8c9a9c'); }
      P.rod([0.55, 0.52, -0.1], [0.82, 0.76, -0.1], 0.02, '#e7eef0', 6); P.sph(0.03, [0.82, 0.77, -0.1], '#c0443a', null, 6, 5);     // 篮子里折好的伞
      P.box(0.4, 0.015, 0.18, [-0.75, 0.62, 0], '#8c9a9c'); P.rod([-0.55, 0.36, 0], [-0.72, 0.6, 0.07], 0.01, '#9aa4a6', 4);
      P.cyl(0.07, 0.07, 0.01, 10, [0.0, 0.3, 0.08], '#8c9a9c', [Math.PI / 2, 0, 0]); P.rod([0.0, 0.3, 0.08], [0.0, 0.14, 0.1], 0.012, '#5b6466', 4); P.box(0.08, 0.02, 0.05, [0.0, 0.12, 0.1], '#2b2f32');
      P.sph(0.03, [0.46, 0.8, 0.12], '#d8b04a', [1, 0.8, 1], 6, 5);        // 车铃
    });
    P.rod([-0.35, 0.28, 0.05], [-0.28, 0.0, 0.32], 0.014, '#6b7274', 5);          // 立脚架
  });
  scene.add(mesh(P.build(), MAT.vcWet));
}
const _bpOld = buildProps;
buildProps = function (scene) { _bpOld(scene); buildBicycle(scene); };

/* 前景堤岸补充：洗鱼台、地滑告示、木托盘、长椅、手推车 */
function buildMoreProps(scene) {
  const P = new Parts(); P.jit = 0.02; const Y = QH;
  // 洗鱼台（不锈钢台面 + 水龙头 + 水桶 + 砧板上的鱼）
  P.T([-5.2, Y, 11.9], [0, 0.12, 0], null, () => {
    P.box(1.6, 0.05, 0.72, [0, 0.86, 0], '#cfd8d8'); P.box(1.62, 0.03, 0.74, [0, 0.82, 0], '#aab6b6');
    for (const [x, z] of [[-0.72, -0.3], [0.72, -0.3], [-0.72, 0.3], [0.72, 0.3]]) P.box(0.05, 0.84, 0.05, [x, 0.42, z], '#8a9a9a');
    P.box(1.5, 0.03, 0.62, [0, 0.28, 0], '#9aa9a9'); P.box(0.5, 0.012, 0.4, [-0.4, 0.89, 0], '#6e8084');
    P.cyl(0.14, 0.12, 0.3, 12, [0.5, 0.15, 0.0], '#2d77b8'); P.tor(0.14, 0.01, [0.5, 0.3, 0], '#d8d6c2', [Math.PI / 2, 0, 0], 12, 3);
    P.rod([0.68, 0.89, -0.25], [0.68, 1.35, -0.25], 0.025, '#9aa7a7', 6); P.rod([0.68, 1.35, -0.25], [0.5, 1.38, -0.25], 0.022, '#9aa7a7', 6); P.cyl(0.02, 0.016, 0.1, 6, [0.45, 1.33, -0.25], '#9aa7a7'); P.box(0.04, 0.07, 0.03, [0.68, 1.3, -0.2], '#d63a2e');
    P.box(0.5, 0.025, 0.3, [0.2, 0.9, 0.1], '#c9a46a');
    P.sph(0.07, [0.2, 0.95, 0.1], '#b8cfd4', [2.2, 0.8, 0.9], 8, 6); P.cone(0.04, 0.1, 3, [0.0, 0.95, 0.1], '#9fb8c0', [0, 0, Math.PI / 2]);
    for (let k = 0; k < 6; k++) P.tor(0.14 - k * 0.0, 0.016, [-0.5, 0.1 + k * 0.032, 0.0], '#3f8f5a', [Math.PI / 2, 0, 0], 12, 4);     // 软管
  });
  addDrip(-5.2 + 0.68 - 0.5 * Math.cos(0.12) * 0.0 - 0.2, Y + 1.28, 11.9 - 0.3, Y + 0.88, { rate: 0.5, ripple: false });
  // 地滑告示（A 字牌）
  P.T([-6.2, Y, 8.5], [0, 0.5, 0], null, () => {
    for (const s of [-1, 1]) P.box(0.44, 0.7, 0.02, [0, 0.37, s * 0.17], '#f4c82a', [s * -0.28, 0, 0]);
    P.box(0.46, 0.04, 0.12, [0, 0.74, 0], '#d8aa1a');
  });
  const sg = texWetSign();
  for (const s of [-1, 1]) { const m = texPlane(sg, 0.4, 0.62, [-6.2 + Math.sin(0.5) * 0 + (s > 0 ? Math.sin(0.5) * 0.19 : -Math.sin(0.5) * 0.19), Y + 0.37, 8.5 + (s > 0 ? Math.cos(0.5) * 0.19 : -Math.cos(0.5) * 0.19)], [-0.28 * s * -1 * 0 + (s > 0 ? -0.28 : 0.28), 0.5 + (s > 0 ? 0 : Math.PI), 0], { lift: 0.3, gloss: 0.4 }); scene.add(m); }
  // 木托盘 + 鱼箱
  P.T([4.6, Y, 13.0], [0, 0.15, 0], null, () => {
    for (const z of [-0.4, 0, 0.4]) P.box(1.2, 0.03, 0.12, [0, 0.14, z], '#b58f5c');
    for (const x of [-0.5, 0, 0.5]) P.box(0.12, 0.1, 0.9, [x, 0.07, 0], '#a37e4e');
    for (const z of [-0.4, 0, 0.4]) P.box(1.2, 0.03, 0.12, [0, 0.02, z], '#a37e4e');
  });
  stackCrates(P, 4.45, 13.0, 0.2, ['#f1f3ef', '#2d77b8', '#f1f3ef'], 'crate', 3); stackCrates(P, 5.0, 13.05, 0.1, ['#2d77b8', '#f1f3ef'], 'crate', 2);
  // 长椅
  P.T([0.9, Y, 13.0], [0, 0.0, 0], null, () => {
    P.box(1.5, 0.05, 0.4, [0, 0.42, 0], '#a9855a'); for (let i = 0; i < 3; i++) P.box(1.5, 0.012, 0.11, [0, 0.45, -0.13 + i * 0.13], '#8f6f48');
    P.box(1.5, 0.3, 0.04, [0, 0.66, -0.18], '#a9855a', [0.1, 0, 0]); for (const x of [-0.6, 0.6]) { P.box(0.05, 0.42, 0.38, [x, 0.21, 0], '#6d7e83'); }
  });
  // 手推车 + 鱼箱
  P.T([-1.0, Y, 12.5], [0, -0.6, 0], null, () => {
    P.box(0.55, 0.04, 0.9, [0, 0.28, 0], '#3f6f8f'); P.cyl(0.16, 0.16, 0.06, 12, [0.3, 0.16, -0.2], '#2a2f31', [0, 0, Math.PI / 2]); P.cyl(0.16, 0.16, 0.06, 12, [-0.3, 0.16, -0.2], '#2a2f31', [0, 0, Math.PI / 2]);
    P.rod([-0.2, 0.28, -0.42], [-0.22, 1.0, -0.6], 0.022, '#8a9a9a', 5); P.rod([0.2, 0.28, -0.42], [0.22, 1.0, -0.6], 0.022, '#8a9a9a', 5); P.rod([-0.22, 1.0, -0.6], [0.22, 1.0, -0.6], 0.022, '#8a9a9a', 5);
    P.rod([-0.2, 0.28, 0.4], [-0.2, 0.12, 0.5], 0.02, '#6d7e83', 5); P.rod([0.2, 0.28, 0.4], [0.2, 0.12, 0.5], 0.02, '#6d7e83', 5);
  });
  crate(P, [-1.0, Y + 0.3, 12.55], [0, -0.55, 0], '#f1f3ef', 'crate');
  scene.add(mesh(P.build(), MAT.vcWet));
}
const _bpOld2 = buildProps;
buildProps = function (scene) { _bpOld2(scene); buildMoreProps(scene); };

/* 湿脚印：从候船室门口一路延伸到乐器箱旁——人刚离开的痕迹（没有人物） */
function buildFootprints(scene) {
  const c = mkCanvas(64, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 64, 128); x.fillStyle = 'rgba(38,70,78,0.85)';
  x.beginPath(); x.ellipse(32, 38, 17, 30, 0, 0, TAU); x.fill();            // 前掌
  x.beginPath(); x.ellipse(32, 98, 12, 18, 0, 0, TAU); x.fill();            // 脚跟
  x.clearRect(0, 66, 64, 8);
  const tex = canvasTex(c);
  const path = [[-10.2, 5.0], [-8.6, 6.6], [-6.4, 7.5], [-3.4, 7.9], [-0.6, 7.9], [1.6, 7.6]];
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const geo = new THREE.PlaneGeometry(0.21, 0.42);
  let total = 0; const segs = [];
  for (let i = 0; i < path.length - 1; i++) { const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); segs.push(L); total += L; }
  let d = 0, k = 0;
  while (d < total) {
    let acc = 0, si = 0; while (si < segs.length - 1 && acc + segs[si] < d) { acc += segs[si]; si++; }
    const t = (d - acc) / segs[si], a = path[si], b = path[si + 1];
    const px = lerp(a[0], b[0], t), pz = lerp(a[1], b[1], t), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const side = k % 2 ? 1 : -1, ox = Math.cos(ang) * 0.13 * side, oz = -Math.sin(ang) * 0.13 * side;
    const m = new THREE.Mesh(geo, mat); m.position.set(px + ox, QH + 0.006, pz + oz); m.rotation.set(-Math.PI / 2, 0, -ang + Math.PI + 0.0, 'YXZ');
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, 0, 0); m.rotateOnWorldAxis(new V3(0, 1, 0), ang + Math.PI * 0 + Math.PI);
    m.layers.set(LAYER.GLASS); m.renderOrder = 5; scene.add(m);
    d += 0.56; k++;
  }
}
const _bpOld3 = buildProps;
buildProps = function (scene) { _bpOld3(scene); buildFootprints(scene); };
