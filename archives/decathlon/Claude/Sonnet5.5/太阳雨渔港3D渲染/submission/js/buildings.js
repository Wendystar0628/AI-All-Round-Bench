'use strict';
/* 渔协仓库、候船室、自动贩卖机 */
function texPlane(tex, w, h, pos, rot, opt = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMat({ map: tex, vc: false, color: 0xffffff, lift: opt.lift !== undefined ? opt.lift : 0.28, gloss: opt.gloss || 0, side: opt.side || THREE.FrontSide, emissive: opt.emissive, emissiveMap: opt.emissiveMap, emissiveIntensity: opt.ei }));
  m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rot[0], rot[1], rot[2]); m.rotation.order = 'YXZ';
  m.castShadow = false; m.receiveShadow = true; return m;
}
function boot(P, pos, col, rot, scale = 1) {
  P.T(pos, rot, [scale, scale, scale], () => {
    P.cyl(0.072, 0.084, 0.44, 10, [0, 0.25, 0], col);
    P.box(0.155, 0.1, 0.32, [0, 0.07, 0.1], col); P.sph(0.078, [0, 0.07, 0.25], col, [1, 0.62, 0.9], 8, 6);
    P.box(0.16, 0.035, 0.34, [0, 0.0175, 0.1], '#2b2f31');
    P.cyl(0.078, 0.078, 0.02, 10, [0, 0.47, 0], shade(col, 0.82));
  });
}
function glassPane(Pg, axis, c, a0, a1, y0, y1) {
  const w = a1 - a0, h = y1 - y0;
  if (axis === 'x') Pg.plane(w, h, [c, (y0 + y1) / 2, (a0 + a1) / 2], '#fff', [0, Math.PI / 2, 0]);
  else Pg.plane(w, h, [(a0 + a1) / 2, (y0 + y1) / 2, c], '#fff', [0, 0, 0]);
}

function buildWarehouse(scene) {
  const x0 = -13.7, x1 = -9.3, z0 = -9.0, z1 = -2.3, Y = QH, H = 3.0, th = 0.14;
  const P = new Parts(); P.jit = 0.012; const Pin = new Parts(); Pin.jit = 0.02; const Pg = new Parts(); Pg.jit = 0;
  const cWall = new Col('#ebeee8'), cBand = new Col('#77adb1'), cIn = new Col('#e1e7e1');
  const BH = 0.95;
  const walls = (axis, c, a0, a1, ops, col) => {
    wallWithOpenings(P, axis, c, a0, a1, Y, Y + BH, th, ops, cBand);
    wallWithOpenings(P, axis, c, a0, a1, Y + BH, Y + H, th, ops, col || cWall);
  };
  const doorOp = { a0: -8.5, a1: -5.2, y0: Y, y1: Y + 2.7 };
  const winOps = [{ a0: -4.9, a1: -3.8, y0: Y + 2.15, y1: Y + 2.78 }, { a0: -3.5, a1: -2.6, y0: Y + 2.15, y1: Y + 2.78 }];
  walls('x', x1 - th / 2, z0, z1, [doorOp, ...winOps]);
  walls('x', x0 + th / 2, z0, z1, []);
  walls('z', z0 + th / 2, x0, x1, []);
  const bigWin = { a0: -13.0, a1: -10.0, y0: Y + 0.9, y1: Y + 2.4 };
  walls('z', z1 - th / 2, x0, x1, [bigWin]);
  // 窗框 + 玻璃
  const frame = (axis, c, o, col = '#f3f5f1') => {
    const t = 0.07;
    if (axis === 'x') { P.box(0.18, t, o.a1 - o.a0 + 0.1, [c, o.y0, (o.a0 + o.a1) / 2], col); P.box(0.18, t, o.a1 - o.a0 + 0.1, [c, o.y1, (o.a0 + o.a1) / 2], col); for (const a of [o.a0, o.a1]) P.box(0.18, o.y1 - o.y0, t, [c, (o.y0 + o.y1) / 2, a], col); }
    else { P.box(o.a1 - o.a0 + 0.1, t, 0.18, [(o.a0 + o.a1) / 2, o.y0, c], col); P.box(o.a1 - o.a0 + 0.1, t, 0.18, [(o.a0 + o.a1) / 2, o.y1, c], col); for (const a of [o.a0, o.a1]) P.box(t, o.y1 - o.y0, 0.18, [a, (o.y0 + o.y1) / 2, c], col); }
  };
  for (const o of winOps) { frame('x', x1 - th / 2, o); glassPane(Pg, 'x', x1 - th / 2, o.a0, o.a1, o.y0, o.y1); P.box(0.1, o.y1 - o.y0, 0.04, [x1 - th / 2, (o.y0 + o.y1) / 2, (o.a0 + o.a1) / 2], '#f3f5f1'); }
  frame('z', z1 - th / 2, bigWin); glassPane(Pg, 'z', z1 - th / 2, bigWin.a0, bigWin.a1, bigWin.y0, bigWin.y1);
  for (const a of [-12.0, -11.0]) P.box(0.04, bigWin.y1 - bigWin.y0, 0.1, [a, (bigWin.y0 + bigWin.y1) / 2, z1 - th / 2], '#f3f5f1');
  P.box(3.1, 0.06, 0.3, [(bigWin.a0 + bigWin.a1) / 2, bigWin.y0 - 0.02, z1 + 0.02], '#cfd8d4');   // 窗台
  // 卷帘门（半拉起）
  const dx = x1 - 0.04, dw = doorOp.a1 - doorOp.a0, dz = (doorOp.a0 + doorOp.a1) / 2;
  const topY = Y + 2.7, botY = Y + 1.5;
  for (let y = topY - 0.04, i = 0; y > botY; y -= 0.082, i++) {
    const col = i % 2 ? '#a3c7ca' : '#97bcc0';
    P.box(0.05, 0.078, dw - 0.04, [dx, y - 0.039, dz], R() < 0.12 ? '#b98760' : col);
  }
  P.box(0.09, 0.1, dw - 0.02, [dx, botY - 0.04, dz], '#5f7f84');
  P.box(0.12, 0.05, 0.4, [dx + 0.06, botY - 0.04, dz], '#2d3c40');
  P.rod([dx + 0.05, botY - 0.06, dz + 0.9], [dx + 0.05, botY - 0.75, dz + 0.9], 0.012, '#d8d2b2', 4);   // 拉绳
  P.sph(0.03, [dx + 0.05, botY - 0.78, dz + 0.9], '#d8d2b2', null, 6, 5);
  for (const a of [doorOp.a0 - 0.05, doorOp.a1 + 0.05]) P.box(0.16, 2.74, 0.1, [dx + 0.02, Y + 1.37, a], '#6a8d92');
  P.box(0.5, 0.42, dw + 0.4, [x1 + 0.1, Y + 2.9, dz], '#6a8d92');              // 卷帘盒
  P.cyl(0.04, 0.04, dw + 0.5, 6, [x1 + 0.1, Y + 2.62, dz], '#4b5e63', [Math.PI / 2, 0, 0]);
  // 屋顶
  const rx = (x0 + x1) / 2, ridgeY = Y + H + 0.95, eY = Y + H + 0.06, zA = z0 - 0.3, zB = z1 + 0.3, len = zB - zA, zm = (zA + zB) / 2;
  const slopeR = Math.hypot(x1 + 0.35 - rx, ridgeY - eY), angR = Math.atan2(eY - ridgeY, x1 + 0.35 - rx);
  const slopeL = Math.hypot(rx - (x0 - 0.35), ridgeY - eY), angL = Math.atan2(ridgeY - eY, rx - (x0 - 0.35));
  P.T([(rx + x0 - 0.35) / 2, (ridgeY + eY) / 2, zm], [0, 0, angL], null, () => {
    P.box(slopeL + 0.05, 0.07, len, [0, 0, 0], '#8aa7ae');
    for (let i = -10; i <= 10; i++) P.box(slopeL + 0.05, 0.03, 0.06, [0, 0.05, i * len / 21], '#7f9ca3');
    for (let i = 0; i < 5; i++) P.box(0.5 + R() * 0.7, 0.012, 0.4 + R() * 0.5, [rnd(-slopeL / 2, slopeL / 2), 0.04, rnd(-len / 2, len / 2)], '#b4785a');
  });
  P.box(0.2, 0.1, len + 0.05, [rx, ridgeY + 0.05, zm], '#7b979e');
  // 受光一侧：半透明采光板 + 筋
  P.T([(rx + x1 + 0.35) / 2, (ridgeY + eY) / 2, zm], [0, 0, angR], null, () => {
    for (let i = -9; i <= 9; i += 3) P.box(slopeR, 0.035, 0.035, [0, 0.035, i * len / 21], '#dfe9e8');
    P.box(slopeR, 0.05, 0.06, [0, 0.03, -len / 2 + 0.03], '#cfdad9'); P.box(slopeR, 0.05, 0.06, [0, 0.03, len / 2 - 0.03], '#cfdad9');
    P.box(0.07, 0.05, len, [-slopeR / 2, 0.03, 0], '#7b979e'); P.box(0.07, 0.05, len, [slopeR / 2, 0.03, 0], '#7b979e');
    Pg.plane(slopeR, len, [0, 0.02, 0], '#fff', [-Math.PI / 2, 0, 0]);
  });
  // 山墙三角
  const tri = new THREE.Shape([new THREE.Vector2(x0, Y + H), new THREE.Vector2(x1, Y + H), new THREE.Vector2(rx, ridgeY)]);
  const triG = new THREE.ExtrudeGeometry(tri, { depth: th, bevelEnabled: false });
  P.geo(triG, [0, 0, z0], '#ebeee8'); P.geo(triG, [0, 0, z1 - th], '#ebeee8');
  // 雨水槽
  P.box(0.16, 0.1, len, [x1 + 0.38, eY - 0.1, zm], '#7a9298'); P.cyl(0.04, 0.04, 2.6, 6, [x1 + 0.4, Y + 1.5, z1 + 0.15], '#7a9298');
  // 内部结构
  const fx = (x0 + x1) / 2, fz = (z0 + z1) / 2;
  Pin.box(x1 - x0 - 0.2, 0.05, z1 - z0 - 0.2, [fx, Y + 0.025, fz], '#b9c5c4');
  // 桁架
  for (let k = 0; k < 4; k++) { const zz = z0 + 0.5 + k * 1.9; Pin.rod([x0 + 0.1, Y + H, zz], [rx, ridgeY - 0.05, zz], 0.04, '#8ea3a8', 5); Pin.rod([x1 - 0.1, Y + H, zz], [rx, ridgeY - 0.05, zz], 0.04, '#8ea3a8', 5); Pin.rod([x0 + 0.1, Y + H - 0.02, zz], [x1 - 0.1, Y + H - 0.02, zz], 0.035, '#8ea3a8', 5); }
  // 鱼箱成垛（靠后墙）
  for (let c = 0; c < 4; c++) for (let r = 0; r < 6; r++) {
    const col = (r + c) % 3 === 1 ? '#2d77b8' : '#f1f3ef';
    if (c === 3 && r > 3) continue; if (c === 1 && r > 4) continue;
    fishBox(Pin, [x0 + 0.5, Y + 0.05 + r * 0.265, -8.45 + c * 0.58], col, [0, (R() - 0.5) * 0.08, 0]);
    fishBox(Pin, [x0 + 1.12, Y + 0.05 + r * 0.265, -8.45 + c * 0.58], (r + c + 1) % 3 === 1 ? '#2d77b8' : '#f1f3ef', [0, (R() - 0.5) * 0.08, 0]);
    if (r > 4) break;
  }
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4 - c; r++) fishBox(Pin, [x0 + 0.5, Y + 0.05 + r * 0.265, -3.2 - c * 0.58], r % 2 ? '#2d77b8' : '#f1f3ef', [0, (R() - 0.5) * 0.1, 0]);
  // 冰柜
  Pin.T([-12.2, Y + 0.05, -3.9], [0, 0.05, 0], null, () => {
    Pin.box(1.35, 0.8, 0.68, [0, 0.4, 0], '#f1f4f2'); Pin.box(1.4, 0.07, 0.72, [0, 0.83, 0], '#dfe6e4'); Pin.box(0.5, 0.05, 0.05, [0, 0.9, 0.34], '#8a9794');
    Pin.box(1.38, 0.08, 0.7, [0, 0.12, 0], '#4a5b5f'); Pin.box(0.12, 0.08, 0.02, [0.45, 0.55, 0.35], '#3fb6d9'); Pin.box(0.16, 0.05, 0.02, [-0.4, 0.62, 0.35], '#e24d3d');
    Pin.box(0.3, 0.2, 0.02, [-0.4, 0.38, 0.35], '#3a8fb7');
  });
  // 磅秤
  Pin.T([-10.7, Y + 0.05, -4.4], [0, -0.3, 0], null, () => {
    Pin.box(0.8, 0.09, 0.8, [0, 0.045, 0], '#6d8e84'); Pin.box(0.74, 0.02, 0.74, [0, 0.1, 0], '#9bb5ac');
    for (let i = -3; i <= 3; i++) Pin.box(0.74, 0.012, 0.025, [0, 0.112, i * 0.1], '#7c9a90');
    Pin.cyl(0.04, 0.04, 0.8, 8, [-0.3, 0.45, -0.3], '#5f7f75'); Pin.box(0.36, 0.34, 0.22, [-0.3, 0.9, -0.3], '#6d8e84');
  });
  const dial = texPlane(texScaleDial(), 0.28, 0.28, [-10.7 + (-0.3) * Math.cos(-0.3) + (-0.3) * Math.sin(-0.3) * -1 + 0.12, Y + 0.95, -4.4 + 0.1], [0, 1.2, 0], { lift: 0.4 });
  dial.position.set(-10.7 - 0.3 * Math.cos(-0.3) - 0.3 * Math.sin(-0.3) + 0.1, Y + 0.05 + 0.9, -4.4 + 0.3 * Math.sin(-0.3) - 0.3 * Math.cos(-0.3) + 0.12);
  scene.add(dial);
  // 手推车
  Pin.T([-11.3, Y + 0.05, -6.4], [0, 0.8, 0], null, () => { Pin.box(0.5, 0.04, 0.8, [0, 0.25, 0], '#3f6f8f'); Pin.cyl(0.14, 0.14, 0.05, 10, [0.28, 0.14, -0.2], '#2a2f31', [0, 0, Math.PI / 2]); Pin.cyl(0.14, 0.14, 0.05, 10, [-0.28, 0.14, -0.2], '#2a2f31', [0, 0, Math.PI / 2]); Pin.rod([0, 0.25, -0.38], [0, 1.0, -0.5], 0.02, '#8a9794', 5); fishBox(Pin, [0, 0.27, 0.1], '#f1f3ef'); });
  // 水桶
  Pin.cyl(0.17, 0.14, 0.34, 12, [-12.9, Y + 0.22, -2.9], '#e8873a'); Pin.tor(0.17, 0.01, [-12.9, Y + 0.39, -2.9], '#6b5a48', [Math.PI / 2, 0, 0], 12, 3);
  // 散落冰块
  for (let i = 0; i < 16; i++) Pin.box(0.1 + R() * 0.07, 0.09 + R() * 0.04, 0.1 + R() * 0.07, [rnd(-10.8, -9.7), Y + 0.1, rnd(-8.0, -3.0)], R() < 0.5 ? '#e3f6fb' : '#d5eef6', [R() * 3, R() * 3, R() * 3]);
  // 雨靴：搁架 + 挂钉
  Pin.box(2.6, 0.04, 0.5, [-11.7, Y + 0.62, z0 + th + 0.28], '#9b7b55');
  const bc = ['#f2c72a', '#2f6d4f', '#25282b', '#eef0e8', '#f2c72a', '#2a5da8'];
  for (let i = 0; i < 6; i++) boot(Pin, [-12.7 + i * 0.5, Y + 0.64, z0 + th + 0.1], bc[i], [0, (R() - 0.5) * 0.4, 0], 1.0);
  Pin.box(2.2, 0.06, 0.07, [-11.7, Y + 1.78, z0 + th + 0.04], '#8a6a46');
  for (let i = 0; i < 4; i++) { Pin.cyl(0.015, 0.015, 0.1, 5, [-12.6 + i * 0.6, Y + 1.78, z0 + th + 0.1], '#aaa', [Math.PI / 2, 0, 0]); boot(Pin, [-12.6 + i * 0.6, Y + 1.78 + 0.02, z0 + th + 0.12], i % 2 ? '#f2c72a' : '#2f6d4f', [Math.PI, 0, 0], 0.9); }
  // 黑板
  Pin.box(2.1, 0.08, 0.05, [x0 + th + 0.04, Y + 2.46, -5.85], '#8a6a46'); Pin.box(2.1, 0.08, 0.05, [x0 + th + 0.04, Y + 1.32, -5.85], '#8a6a46');
  Pin.box(0.08, 1.2, 0.05, [x0 + th + 0.04, Y + 1.89, -6.88], '#8a6a46'); Pin.box(0.08, 1.2, 0.05, [x0 + th + 0.04, Y + 1.89, -4.82], '#8a6a46');
  scene.add(texPlane(texBlackboard(), 1.95, 1.1, [x0 + th + 0.015, Y + 1.89, -5.85], [0, Math.PI / 2, 0], { lift: 0.42 }));
  // 挂钟 + 日历 + 灯管
  scene.add(texPlane(texClock(), 0.42, 0.42, [x0 + th + 0.02, Y + 2.55, -8.1], [0, Math.PI / 2, 0.05], { lift: 0.4 }));
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe6', toneMapped: false });
  for (const zz of [-7.4, -4.0]) { const L = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.3), lampMat); L.position.set(fx - 0.2, Y + H - 0.1, zz); scene.add(L); Pin.rod([fx - 0.2, Y + H - 0.02, zz - 0.5], [fx - 0.2, Y + H + 0.18, zz - 0.5], 0.008, '#555', 3); Pin.rod([fx - 0.2, Y + H - 0.02, zz + 0.5], [fx - 0.2, Y + H + 0.18, zz + 0.5], 0.008, '#555', 3); }
  // 外部：靠墙的长柄网兜与水桶、门边水渍
  P.T([x1 + 0.08, Y, -2.78], [0, 0, 0], null, () => {
    P.rod([0.2, 0.04, 0.0], [-0.05, 1.7, 0.0], 0.022, '#a0764a', 6);
    P.tor(0.19, 0.012, [0.06, 1.75, 0.0], '#868e8c', [0, 0, 0.0], 14, 4);
    P.cyl(0.2, 0.2, 0.01, 12, [0.06, 1.73, 0.0], '#d8d6c2', [0.0, 0, 0], false);
  });
  P.cyl(0.18, 0.15, 0.36, 12, [x1 + 0.55, Y + 0.18, -2.7], '#2d77b8'); P.tor(0.18, 0.01, [x1 + 0.55, Y + 0.36, -2.7], '#d8d6c2', [Math.PI / 2, 0, 0], 12, 3);

  // 招牌、灭火器、油桶
  scene.add(texPlane(texCoopSign(), 2.1, 0.52, [x1 + 0.012, Y + 1.58, -3.65], [0, Math.PI / 2, 0], { lift: 0.18, gloss: 0.3 }));
  P.box(0.5, 0.05, 0.05, [x1 + 0.04, Y + 1.88, -3.65], '#8a8f8d');
  P.cyl(0.07, 0.07, 0.32, 10, [x1 + 0.12, Y + 0.75, -2.5], '#c93a30'); P.cyl(0.03, 0.03, 0.06, 6, [x1 + 0.12, Y + 0.95, -2.5], '#2a2a2a'); P.box(0.04, 0.38, 0.1, [x1 + 0.035, Y + 0.78, -2.5], '#8f2a24');
  for (const [dx, dz, col] of [[-8.25, -8.55, '#2d77b8'], [-7.75, -8.8, '#2d77b8'], [-8.1, -9.0, '#a85d34']]) {
    const mx = dx, mz = dz; P.cyl(0.22, 0.22, 0.58, 14, [mx, Y + 0.29, mz], col);
    for (const yy of [0.12, 0.29, 0.46]) P.tor(0.222, 0.012, [mx, Y + yy, mz], shade(col, 0.78), [Math.PI / 2, 0, 0], 14, 4);
    P.cyl(0.2, 0.2, 0.025, 12, [mx, Y + 0.585, mz], shade(col, 0.88));
  }
  scene.add(mesh(P.build(), MAT.wall));
  scene.add(mesh(Pin.build(), MAT.vcInteriorWet));
  const mg = new THREE.Mesh(Pg.build(), MAT.glassRoof); mg.layers.set(LAYER.GLASS); mg.renderOrder = 12; scene.add(mg);
  // 光柱：由高窗入射
  const ldir = Env.sunDir.clone().negate();
  for (const o of winOps) {
    const wx = x1 - th / 2 - 0.02;
    const top = [new V3(wx, o.y0, o.a0), new V3(wx, o.y0, o.a1), new V3(wx, o.y1, o.a1), new V3(wx, o.y1, o.a0)];
    const L = (o.y0 - Y - 0.04) / Math.abs(ldir.y);
    const s = makeShaft(top, ldir, L, { amt: 0.95, color: '#ffe6a0', pow: 1.0 }); scene.add(s);
  }
  scene.add(makeCaustic(4.0, 6.3, [rx, Y + H + 0.25, fz - 0.1], [Math.PI / 2, 0, 0], { amt: 0.22, scale: 0.9 }));
  scene.add(makeCaustic(5.0, 1.4, [x0 + th + 0.03, Y + 2.7, -5.6], [0, Math.PI / 2, 0], { amt: 0.2 }));
  addDrip(x1 + 0.45, eY - 0.08, -3.0, QH, { rate: 0.35, ripple: false });
  addDrip(x1 + 0.45, eY - 0.08, -6.0, QH, { rate: 0.28, ripple: false });
  addDrip(x1 + 0.45, eY - 0.08, -8.4, QH, { rate: 0.3, ripple: false });
}

function buildWaitingRoom(scene) {
  const x0 = -13.6, x1 = -10.0, z0 = 0.5, z1 = 4.4, Y = QH, H = 2.65, th = 0.12;
  const P = new Parts(); P.jit = 0.012; const Pin = new Parts(); Pin.jit = 0.02; const Pg = new Parts();
  const cWall = '#f0ebdc', cBand = '#8fb7a8';
  // 基座与地板
  P.box(x1 - x0 + 0.1, 0.12, z1 - z0 + 0.1, [(x0 + x1) / 2, Y + 0.06, (z0 + z1) / 2], '#cfd5d0');
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.2, z1 - z0 - 0.2), toonMat({ map: texWood(256, 256, '#c1996a', '#8d6a46'), vc: false, lift: 0.3, gloss: 0.3 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, Y + 0.125, (z0 + z1) / 2); fl.receiveShadow = true; scene.add(fl);
  // 实体墙（后墙 -x，侧墙 -z），其余两面为落地玻璃
  P.box(th, H, z1 - z0, [x0 + th / 2, Y + 0.12 + H / 2, (z0 + z1) / 2], cWall);
  P.box(x1 - x0, H, th, [(x0 + x1) / 2, Y + 0.12 + H / 2, z0 + th / 2], cWall);
  P.box(th + 0.02, 0.5, z1 - z0, [x0 + th / 2, Y + 0.37, (z0 + z1) / 2], cBand); P.box(x1 - x0, 0.5, th + 0.02, [(x0 + x1) / 2, Y + 0.37, z0 + th / 2], cBand);
  // 玻璃立面：+x 与 +z（落地玻璃）
  const gy0 = Y + 0.12, gy1 = Y + 0.12 + H;
  const mullion = (axis, c, a) => axis === 'x' ? P.box(0.08, H, 0.06, [c, gy0 + H / 2, a], '#e7ece8') : P.box(0.06, H, 0.08, [a, gy0 + H / 2, c], '#e7ece8');
  for (let i = 0; i <= 3; i++) mullion('x', x1, z0 + i * (z1 - z0) / 3);
  for (let i = 0; i <= 3; i++) mullion('z', z1, x0 + i * (x1 - x0) / 3);
  P.box(0.1, 0.08, z1 - z0, [x1, gy0 + 0.04, (z0 + z1) / 2], '#cfd8d4'); P.box(0.1, 0.08, z1 - z0, [x1, gy1 - 0.04, (z0 + z1) / 2], '#e7ece8'); P.box(0.1, 0.06, z1 - z0, [x1, gy0 + 0.95, (z0 + z1) / 2], '#e7ece8');
  P.box(x1 - x0, 0.08, 0.1, [(x0 + x1) / 2, gy0 + 0.04, z1], '#cfd8d4'); P.box(x1 - x0, 0.08, 0.1, [(x0 + x1) / 2, gy1 - 0.04, z1], '#e7ece8'); P.box(x1 - x0, 0.06, 0.1, [(x0 + x1) / 2, gy0 + 0.95, z1], '#e7ece8');
  glassPane(Pg, 'x', x1, z0, z1, gy0, gy1); glassPane(Pg, 'z', z1, x0, x1, gy0, gy1);
  // 门（+z 面靠右，半开）
  P.T([x1 - 1.0, 0, z1], [0, 0.7, 0], null, () => { P.box(0.9, 2.2, 0.05, [0.45, gy0 + 1.1 + 0.05, 0.0], '#e9efec'); P.box(0.06, 0.3, 0.07, [0.8, gy0 + 1.05, 0], '#8c8f8a'); });
  // 屋顶：缓坡 + 檐 + 雨槽
  P.box(x1 - x0 + 0.8, 0.14, z1 - z0 + 0.8, [(x0 + x1) / 2 + 0.2, gy1 + 0.07, (z0 + z1) / 2 + 0.2], '#7fa3ad');
  P.box(x1 - x0 + 0.84, 0.05, z1 - z0 + 0.84, [(x0 + x1) / 2 + 0.2, gy1 - 0.0, (z0 + z1) / 2 + 0.2], '#e8efec');
  P.box(0.1, 0.1, z1 - z0 + 0.8, [x1 + 0.58, gy1 - 0.02, (z0 + z1) / 2 + 0.2], '#6f8f98'); P.box(x1 - x0 + 0.8, 0.1, 0.1, [(x0 + x1) / 2 + 0.2, gy1 - 0.02, z1 + 0.6], '#6f8f98');
  scene.add(texPlane(texWaitSign(), 1.5, 0.28, [(x0 + x1) / 2 + 0.3, gy1 - 0.01, z1 + 0.66], [0, 0, 0], { lift: 0.25 }));
  // 站牌
  P.box(0.06, 0.9, 0.06, [x1 + 0.9, QH + 0.45, z1 - 0.1], '#6e7d80'); P.cyl(0.27, 0.27, 0.04, 16, [x1 + 0.9, QH + 1.05, z1 - 0.1], '#2d77b8', [0, 0, 0]);
  Pin.box(0.1, 0.1, 0.1, [x1 + 0.9, QH + 1.05, z1 - 0.1], '#2d77b8');
  // ---- 室内 ----
  const yI = Y + 0.125;
  // 木长椅（靠后墙，面向玻璃）
  Pin.box(0.5, 0.06, 2.9, [x0 + 0.5, yI + 0.44, (z0 + z1) / 2 + 0.05], '#b88b55');
  for (let i = 0; i < 4; i++) Pin.box(0.02, 0.07, 2.9, [x0 + 0.5 - 0.2 + i * 0.13, yI + 0.44, (z0 + z1) / 2 + 0.05], '#9b7342');
  Pin.box(0.06, 0.5, 2.9, [x0 + 0.28, yI + 0.72, (z0 + z1) / 2 + 0.05], '#a97c47');
  for (const zz of [z0 + 0.5, (z0 + z1) / 2 + 0.05, z1 - 0.5]) { Pin.box(0.46, 0.4, 0.06, [x0 + 0.5, yI + 0.2, zz], '#8a6a40'); }
  // 书包（放学后）+ 保温杯
  Pin.T([x0 + 0.52, yI + 0.47, 2.9], [0, 0.4, 0], null, () => {
    Pin.box(0.3, 0.38, 0.17, [0, 0.19, 0], '#c7493c'); Pin.box(0.28, 0.14, 0.19, [0, 0.31, 0.0], '#b73c30'); Pin.box(0.12, 0.1, 0.02, [0, 0.2, 0.1], '#e9c75a');
    Pin.rod([-0.1, 0.36, -0.09], [-0.1, 0.5, -0.12], 0.012, '#8d3028', 4); Pin.rod([0.1, 0.36, -0.09], [0.1, 0.5, -0.12], 0.012, '#8d3028', 4);
  });
  Pin.cyl(0.04, 0.036, 0.1, 10, [x0 + 0.5, yI + 0.52, 1.7], '#f6f3ea'); Pin.tor(0.04, 0.006, [x0 + 0.5, yI + 0.57, 1.7], '#2a5da8', [Math.PI / 2, 0, 0], 10, 4);
  // 小桌：老式收音机 + 热水壶
  const tx = x0 + 0.45, tz = z0 + 0.55;
  Pin.box(0.6, 0.05, 0.6, [tx, yI + 0.7, tz], '#9a7647'); for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) Pin.box(0.05, 0.7, 0.05, [tx + a, yI + 0.35, tz + b], '#7b5d37');
  Pin.box(0.2, 0.26, 0.42, [tx - 0.05, yI + 0.86, tz - 0.05], '#a68a5a'); Pin.box(0.205, 0.04, 0.43, [tx - 0.05, yI + 1.0, tz - 0.05], '#6a5a3c');
  Pin.rod([tx - 0.1, yI + 1.0, tz - 0.2], [tx - 0.02, yI + 1.34, tz - 0.3], 0.006, '#c9c9c9', 3);
  Pin.cyl(0.075, 0.085, 0.22, 12, [tx + 0.02, yI + 0.84, tz + 0.2], '#f4f1e8'); Pin.cyl(0.08, 0.08, 0.04, 12, [tx + 0.02, yI + 0.97, tz + 0.2], '#c0392b');
  Pin.box(0.04, 0.12, 0.012, [tx + 0.02, yI + 0.84, tz + 0.285], '#8a8f8f'); Pin.rod([tx + 0.1, yI + 0.85, tz + 0.2], [tx + 0.16, yI + 0.82, tz + 0.2], 0.012, '#8a8f8f', 4);
  scene.add(texPlane(texRadio(), 0.4, 0.2, [tx + 0.0525 + 0.05, yI + 0.86, tz - 0.05], [0, Math.PI / 2, 0], { lift: 0.4 }));
  // 墙上：时刻表、日历、歪斜的挂钟
  scene.add(texPlane(texTimetable(), 0.9, 1.12, [(x0 + x1) / 2 - 0.2, yI + 1.6, z0 + th + 0.01], [0, 0, 0.03], { lift: 0.45 }));
  scene.add(texPlane(texNotice(), 0.4, 0.5, [x0 + th + 0.01, yI + 1.5, 3.3], [0, Math.PI / 2, -0.04], { lift: 0.42 }));
  const clk = texPlane(texClock(), 0.46, 0.46, [x0 + th + 0.02, yI + 1.95, 2.0], [0, Math.PI / 2, 0.18], { lift: 0.45 }); scene.add(clk);
  Pin.box(0.03, 0.03, 0.03, [x0 + th + 0.01, yI + 2.19, 2.0], '#6a4a2a');
  // 绿萝（柜上，垂蔓）
  const px = x1 - 0.5, pz = z0 + 0.45;
  Pin.box(0.55, 0.62, 0.45, [px, yI + 0.31, pz], '#d7c9a6'); Pin.box(0.58, 0.04, 0.48, [px, yI + 0.64, pz], '#a9895a');
  Pin.cyl(0.13, 0.1, 0.17, 12, [px, yI + 0.75, pz], '#f0f3f1'); Pin.cyl(0.14, 0.14, 0.02, 12, [px, yI + 0.84, pz], '#f0f3f1');
  Pin.cyl(0.11, 0.11, 0.02, 10, [px, yI + 0.83, pz], '#4a3a2a');
  const Pv = new Parts(); Pv.jit = 0.08;
  const leaf = (x, y, z, s) => Pv.sph(0.05 * s, [x, y, z], pick(['#3f8f45', '#52a352', '#2f7d3e', '#7bb85a']), [1.1, 0.35, 0.9], 6, 4, (a, b, c) => [clamp((0.9 - b + 0.0) / 0.6, 0, 1) * 0.9 + 0.1, 0.5]);
  for (let v = 0; v < 6; v++) {
    const a = v / 6 * TAU, len = rnd(0.35, 0.75); const sx = px + Math.cos(a) * 0.08, sz = pz + Math.sin(a) * 0.08;
    for (let k = 0; k < 7; k++) { const t = k / 6; const y = yI + 0.86 - t * len * 0.9 + (k < 2 ? 0.1 * (1 - t) : 0); const rr = 0.08 + t * 0.12; leaf(sx + Math.cos(a) * rr * (1 + t), y, sz + Math.sin(a) * rr * (1 + t), rnd(0.9, 1.5)); }
  }
  for (let k = 0; k < 7; k++) { const a = rnd(0, 6.28); leaf(px + Math.cos(a) * 0.06, yI + 0.9 + rnd(0, 0.12), pz + Math.sin(a) * 0.06, rnd(1.1, 1.7)); }
  const mv = mesh(Pv.build(), toonMat({ vc: true, sway: 4, lift: 0.3 }), { cast: false }); scene.add(mv);
  // 吊灯（暖光）
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff0c0', toneMapped: false })); lamp.position.set((x0 + x1) / 2 + 0.2, gy1 - 0.35, (z0 + z1) / 2); scene.add(lamp);
  Pin.rod([(x0 + x1) / 2 + 0.2, gy1, (z0 + z1) / 2], [(x0 + x1) / 2 + 0.2, gy1 - 0.25, (z0 + z1) / 2], 0.008, '#444', 3);
  // 垃圾桶 + 雨伞架
  Pin.cyl(0.14, 0.12, 0.3, 10, [x1 - 0.4, yI + 0.15, z1 - 0.4], '#5c7f7a');
  Pin.cyl(0.12, 0.12, 0.38, 10, [x1 - 0.5, yI + 0.19, z1 - 1.1], '#a7b8b5');
  Pin.rod([x1 - 0.5, yI + 0.35, z1 - 1.1], [x1 - 0.42, yI + 0.95, z1 - 1.05], 0.012, '#28557a', 4); Pin.rod([x1 - 0.42, yI + 0.95, z1 - 1.05], [x1 - 0.37, yI + 0.99, z1 - 1.0], 0.012, '#28557a', 4);

  scene.add(mesh(P.build(), MAT.wall));
  scene.add(mesh(Pin.build(), MAT.vcInterior));
  const mg = new THREE.Mesh(Pg.build(), MAT.glassWin); mg.layers.set(LAYER.GLASS); mg.renderOrder = 12; scene.add(mg);
  addDrip(x1 + 0.6, gy1 - 0.05, 1.2, QH, { rate: 0.3, ripple: false }); addDrip(x1 + 0.6, gy1 - 0.05, 3.6, QH, { rate: 0.25, ripple: false });
  scene.add(makeCaustic(3.4, 3.4, [(x0 + x1) / 2, gy1 - 0.04, (z0 + z1) / 2], [Math.PI / 2, 0, 0], { amt: 0.14, scale: 0.9, color: '#dffbf2' }));
}

function buildVending(scene) {
  const x = -12.9, z = 6.9, Y = QH;     // 面朝 +x
  const P = new Parts(); P.jit = 0.015;
  P.T([x, Y, z], [0, 0, 0], null, () => {
    P.box(0.78, 1.82, 0.88, [0, 0.91, 0], '#2f7f93');
    P.box(0.8, 0.12, 0.9, [0, 1.84, 0], '#e8efec');
    P.box(0.82, 0.06, 0.92, [0, 0.03, 0], '#3b4a50');
    // 锈蚀的挡雨檐 + 立柱
    P.box(1.25, 0.05, 1.5, [0.28, 2.02, 0], '#8a9ba0', [0, 0, -0.14]);
    for (let i = 0; i < 6; i++) P.box(0.4 + R() * 0.3, 0.012, 0.3 + R() * 0.3, [0.28 + rnd(-0.45, 0.45), 2.04 + rnd(-0.07, 0.04), rnd(-0.65, 0.65)], '#a85f3a', [0, 0, -0.14]);
    P.box(0.04, 0.2, 1.52, [0.86, 1.92, 0], '#6d7e83', [0, 0, -0.14]);
    for (const zz of [-0.62, 0.62]) P.rod([0.8, 0.0, zz], [0.8, 1.98, zz], 0.025, '#6a6f70', 6);
    P.box(0.08, 0.1, 0.9, [0.4, 0.05, 0], '#3b4a50');
  });
  const front = texVending();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.62), new THREE.MeshBasicMaterial({ map: front, toneMapped: false }));
  face.position.set(x + 0.395, Y + 0.95, z); face.rotation.y = Math.PI / 2; scene.add(face);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#bff2ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.position.set(x + 0.55, Y + 1.0, z); glow.rotation.y = Math.PI / 2; glow.layers.set(LAYER.FX); glow.renderOrder = 16; scene.add(glow);
  Systems.push((dt, t) => { glow.material.opacity = 0.22 + 0.06 * Math.sin(t * 6.3) * Math.sin(t * 0.7) + 0.1 * Env.dark; });
  scene.add(mesh(P.build(), MAT.metal));
  addDrip(x + 0.9, Y + 1.85, z - 0.6, Y, { rate: 0.5, ripple: false }); addDrip(x + 0.9, Y + 1.85, z + 0.55, Y, { rate: 0.4, ripple: false });
  scene.add(makeCaustic(0.7, 0.4, [x + 0.3, Y + 1.99, z], [Math.PI / 2, 0, 0], { amt: 0.0 }));
}

/* 室内暖光：柔和的光晕，让屋里“有人刚离开、灯还亮着”的感觉更清楚 */
function interiorGlow(scene, pts, size, op, col = '#ffe2a0') {
  const gl = [];
  for (const p of pts) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: haloTexture(), color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    h.position.set(p[0], p[1], p[2]); h.layers.set(LAYER.FX); h.renderOrder = 17; h.userData.sp = true; scene.add(h); gl.push(h);
  }
  Systems.push((dt, t) => { const cam = APP.camera; for (const h of gl) { h.quaternion.copy(cam.quaternion); h.material.opacity = op * (0.9 + 0.1 * Math.sin(t * 1.3 + h.position.x)) * (1 + 0.8 * Env.dark); } });
}
function buildBuildings(scene) {
  MAT.wall = toonMat({ vc: true, gloss: 0.25, drops: 0.6, weather: true });
  MAT.glassRoof = glassMat({ tint: '#e6f6f6', opacity: 0.16, stripe: 0 });
  MAT.glassWin = glassMat({ tint: '#d3f0f2', opacity: 0.1 });
  buildWarehouse(scene); buildWaitingRoom(scene); buildVending(scene);
  interiorGlow(scene, [[-11.6, QH + 2.8, -7.4], [-11.6, QH + 2.8, -4.0]], 3.2, 0.14);
  interiorGlow(scene, [[-11.6, QH + 2.2, 2.45]], 3.6, 0.18);
}
