/* 塔、敌人、Boss 的程序化建模与动作 */
(function (G) {
'use strict';
var T = window.THREE, gfx = G.gfx;
var models = G.models = {};
function C(hex, o) { return gfx.mat(hex, o); }
function GLW(hex, k, a, add) { return gfx.glow(hex, k, a, add); }
function mk(parent, geo, mat, x, y, z, sx, sy, sz) {
  var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
  m.castShadow = true; if (parent) parent.add(m); return m;
}
function grp(parent, x, y, z) { var g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
var WHITE = '#f6f3eb', STEEL = '#344843', DARK = '#1a2522';
G.roleColor = function (kind) { return G.TOWERS[kind].color; };

// 为每个实例克隆标准材质，便于受击闪白 / 加密着色 / 潜伏半透明
function prepInstance(g) {
  var map = new Map(), list = [];
  g.traverse(function (o) {
    if (!o.isMesh) return;
    var m = o.material;
    if (m.isMeshStandardMaterial) {
      var c = map.get(m); if (!c) { c = m.clone(); c.userData.base = { e: m.emissive.clone(), ei: m.emissiveIntensity, op: m.opacity, tr: m.transparent }; map.set(m, c); list.push(c); }
      o.material = c;
    }
  });
  return list;
}
function applyFlash(list, hit, tint, tintAmt, opacity) {
  for (var i = 0; i < list.length; i++) {
    var m = list[i], b = m.userData.base;
    if (hit > 0.01) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = hit * 1.8; }
    else if (tintAmt > 0.01) { m.emissive.copy(tint); m.emissiveIntensity = tintAmt; }
    else { m.emissive.copy(b.e); m.emissiveIntensity = b.ei; }
    if (opacity != null && opacity < 0.99) { m.transparent = true; m.opacity = b.op * opacity; m.depthWrite = false; }
    else if (m.opacity !== b.op) { m.opacity = b.op; m.transparent = b.tr; m.depthWrite = true; }
  }
}
function baseOf(parent, col, lvl) {
  var g = grp(parent);
  mk(g, gfx.cyl(0.42, 0.46, 0.07, 8), C(STEEL, { m: 0.8, r: 0.3 }), 0, 0.035, 0);
  mk(g, gfx.cyl(0.36, 0.38, 0.03, 8), C('#141e1c', { m: 0.6, r: 0.4 }), 0, 0.085, 0);
  var rg = mk(g, gfx.tor(0.39, 0.018, 6, 8), GLW(col, 2.0), 0, 0.075, 0); rg.rotation.x = Math.PI / 2; rg.rotation.z = Math.PI / 8; rg.castShadow = false;
  for (var i = 0; i < (lvl >= 2 ? 2 : 1); i++) { // 等级标记
    for (var s = 0; s < 4; s++) { var a = s * Math.PI / 2 + Math.PI / 4; var f = mk(g, gfx.box(0.07, 0.02 + i * 0.025, 0.03), GLW(col, 2.4), Math.cos(a) * 0.4, 0.1 + i * 0.03, Math.sin(a) * 0.4); f.rotation.y = -a; f.castShadow = false; }
  }
  return g;
}

// ================= 塔 =================
// 返回 { group, update(dt, s) }；group 局部 +X 为前方
models.tower = function (kind, level, branch, opts) {
  opts = opts || {};
  var d = G.TOWERS[kind], col = d.color, root = new T.Group(), t = { root: root, upd: null };
  var L = level || 1;
  baseOf(root, col, L);
  var fn = models['t_' + kind](root, col, L, branch, opts);
  var mats = prepInstance(root);
  var tintEnc = new T.Color('#fb53c5');
  return { group: root, update: function (dt, s) { fn(dt, s); applyFlash(mats, s.hit || 0, tintEnc, s.enc ? 0.55 + 0.25 * Math.sin(s.t * 14) : 0); } };
};

models.t_firewall = function (root, col, L, br, opts) {
  var wall = grp(root, 0, 0.1, 0), bricks = [];
  var onNode = opts.onNode;
  var brick = C('#e5ddca', { m: 0.5, r: 0.45 }), brick2 = C('#bbaf91', { m: 0.5, r: 0.5 }), fire = GLW('#ff7a2e', 2.2);
  var rows = L >= 2 ? 4 : 3;
  if (!onNode) {
    for (var r = 0; r < rows; r++) for (var c = 0; c < 3; c++) {
      var b = mk(wall, gfx.box(0.23, 0.14, 0.2), (r + c) % 2 ? brick : brick2, (c - 1) * 0.25 + (r % 2 ? 0.06 : -0.02), 0.07 + r * 0.155, 0);
      b.userData.home = b.position.clone(); bricks.push(b); b.rotation.y = 0;
    }
    // 火焰条
    var strip = mk(wall, gfx.box(0.76, 0.03, 0.24), fire, 0, 0.16 * rows + 0.03, 0); strip.castShadow = false;
    for (var s = -1; s <= 1; s += 2) mk(wall, gfx.box(0.07, 0.18 * rows + 0.1, 0.26), C(STEEL, { m: 0.8, r: 0.3 }), s * 0.41, (0.18 * rows + 0.1) / 2, 0);
    if (L >= 2) for (var k = -2; k <= 2; k++) mk(wall, gfx.cone(0.05, 0.16, 5), C('#ffb066', { m: 0.6, r: 0.3, e: 0.5, ec: '#ff7a2e' }), k * 0.15, 0.16 * rows + 0.14, 0);
    var panel = mk(wall, gfx.plane(0.8, 0.5), new T.MeshBasicMaterial({ color: new T.Color('#ff8a4c').multiplyScalar(1.4), transparent: true, opacity: 0.0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.3, 0.22); panel.castShadow = false; panel.userData.noBox = true;
    wall.rotation.y = opts.wallYaw || 0;
    var shield = null;
  } else { // 节点防火墙：四根火墙柱围成闸门
    var pill = [];
    for (var p = 0; p < 4; p++) { var a = p * Math.PI / 2 + Math.PI / 4; var pl = mk(wall, gfx.box(0.16, 0.5 + (L - 1) * 0.15, 0.16), brick, Math.cos(a) * 0.33, 0.25 + (L - 1) * 0.07, Math.sin(a) * 0.33); mk(wall, gfx.box(0.18, 0.03, 0.18), fire, Math.cos(a) * 0.33, 0.5 + (L - 1) * 0.15, Math.sin(a) * 0.33); pill.push(pl); }
    var gate = mk(wall, gfx.cyl(0.26, 0.26, 0.5, 8, 1), GLW('#ff7a2e', 1.0, 0.25, true), 0, 0.32, 0); gate.castShadow = false;
    var crown = mk(wall, gfx.tor(0.34, 0.025, 6, 20), fire, 0, 0.58 + (L - 1) * 0.1, 0); crown.rotation.x = Math.PI / 2;
    bricks = pill;
  }
  var hardenRing = mk(wall, gfx.tor(0.5, 0.03, 6, 28), GLW('#ffb066', 2.4), 0, 0.2, 0); hardenRing.rotation.x = Math.PI / 2; hardenRing.visible = false; hardenRing.castShadow = false; hardenRing.userData.noBox = true;
  return function (dt, s) {
    var hit = s.atk || 0;
    for (var i = 0; i < bricks.length; i++) { var b = bricks[i]; if (b.userData.home) { b.position.z = b.userData.home.z + Math.sin(s.t * 40 + i) * 0.02 * hit; b.position.x = b.userData.home.x + Math.sin(s.t * 33 + i * 2) * 0.012 * hit; } else { b.position.y += (0 - 0) * dt; b.scale.y = 1 + hit * 0.15; } }
    hardenRing.visible = s.harden > 0; hardenRing.rotation.z = s.t * 2; hardenRing.scale.setScalar(1 + 0.05 * Math.sin(s.t * 8));
    if (panel) panel.material.opacity = 0.18 * (s.blocking || 0) + 0.3 * hit + (s.harden > 0 ? 0.25 : 0);
    fire.color.setScalar(1.8 + 0.4 * Math.sin(s.t * 9) + hit * 1.2);
  };
};

models.t_honeypot = function (root, col, L, br, opts) {
  var jar = grp(root, 0, 0.1, 0), liquids = [], bubbles = [], rings = [];
  var glass = new T.MeshStandardMaterial({ color: new T.Color('#d6aafb'), transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, emissive: new T.Color('#a346f5'), emissiveIntensity: 0.45, depthWrite: false });
  var honey = GLW(br === 'B' ? '#ff7a2e' : '#d684f8', 1.8);
  function makeJar(g, x, z, sc) {
    var j = grp(g, x, 0, z); j.scale.setScalar(sc);
    mk(j, gfx.cyl(0.24, 0.2, 0.06, 14), C('#395750', { m: 0.7, r: 0.3 }), 0, 0.03, 0);
    var body = mk(j, gfx.cyl(0.25, 0.22, 0.46, 16), glass, 0, 0.31, 0); body.castShadow = false;
    var liq = mk(j, gfx.sph(0.17, 12, 8), honey, 0, 0.3, 0); liquids.push(liq);
    mk(j, gfx.cyl(0.19, 0.25, 0.07, 14), C('#395750', { m: 0.7, r: 0.3 }), 0, 0.57, 0);
    var an = mk(j, gfx.cyl(0.012, 0.012, 0.3, 5), C('#f1e9d4', { m: 0.8, r: 0.2 }), 0, 0.77, 0); var tip = mk(j, gfx.sph(0.032, 8, 6), GLW('#ecd2fd', 2.6), 0, 0.93, 0);
    for (var b = 0; b < 3; b++) { var bu = mk(j, gfx.sph(0.025, 6, 5), GLW('#f4e2fd', 2.2), 0, 0.2, 0); bu.userData.ph = b / 3; bu.castShadow = false; bubbles.push(bu); }
    return j;
  }
  if (br === 'A') {
    makeJar(jar, 0, 0, 1.0); makeJar(jar, 0.3, 0.18, 0.62); makeJar(jar, -0.3, 0.2, 0.62); makeJar(jar, 0.05, -0.32, 0.62);
    var web = mk(jar, gfx.tor(0.44, 0.012, 4, 20), GLW('#d684f8', 1.8), 0, 0.12, 0); web.rotation.x = Math.PI / 2; rings.push(web);
    for (var sp = 0; sp < 6; sp++) { var sa = sp / 6 * Math.PI * 2; var spoke = mk(jar, gfx.box(0.44, 0.008, 0.012), GLW('#d684f8', 1.4), 0, 0.12, 0); spoke.rotation.y = -sa; spoke.castShadow = false; }
  } else if (br === 'B') {
    makeJar(jar, 0, 0, 0.95);
    for (var h = 0; h < 12; h++) { var ha = h / 12 * Math.PI * 2; mk(jar, gfx.box(0.12, 0.05, 0.05), h % 2 ? C('#151c1b', { m: 0.3 }) : C('#ffd23a', { m: 0.3, e: 0.5, ec: '#ffb000' }), Math.cos(ha) * 0.3, 0.055, Math.sin(ha) * 0.3).rotation.y = -ha - Math.PI / 2; }
    for (var sp2 = 0; sp2 < 4; sp2++) { var a2 = sp2 * Math.PI / 2 + Math.PI / 4; var spk = mk(jar, gfx.cone(0.04, 0.2, 5), GLW('#ff5d3d', 2.0), Math.cos(a2) * 0.3, 0.2, Math.sin(a2) * 0.3); spk.rotation.z = -Math.cos(a2) * 0.5; spk.rotation.x = Math.sin(a2) * 0.5; }
  } else makeJar(jar, 0, 0, 1.0);
  var lureRings = []; for (var w = 0; w < 3; w++) { var lr = mk(jar, gfx.ring(0.3, 0.33, 32), new T.MeshBasicMaterial({ color: new T.Color(br === 'B' ? '#ff9a5a' : '#e3aafb').multiplyScalar(1.6), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.12, 0); lr.rotation.x = -Math.PI / 2; lr.userData.ph = w / 3; lr.userData.noBox = true; lr.castShadow = false; lureRings.push(lr); }
  return function (dt, s) {
    liquids.forEach(function (l, i) { l.position.y = 0.3 + Math.sin(s.t * 2 + i) * 0.015; l.scale.setScalar(1 + Math.sin(s.t * 3 + i) * 0.05 + (s.atk || 0) * 0.15); });
    bubbles.forEach(function (b) { var p = (s.t * 0.5 + b.userData.ph) % 1; b.position.y = 0.2 + p * 0.3; b.position.x = Math.sin(p * 9 + b.userData.ph * 6) * 0.06; b.material = GLW('#f4e2fd', 2.2); b.scale.setScalar(1 - p * 0.4); });
    lureRings.forEach(function (r) { var p = (s.t * 0.55 + r.userData.ph) % 1; var rad = (s.lure || 2.4); r.scale.setScalar(1 + p * rad * 3.2); r.material.opacity = (1 - p) * 0.42 * (s.alive === false ? 0 : 1); });
    rings.forEach(function (r) { r.rotation.z = s.t; });
    if (s.trap > 0) jar.rotation.y += dt * 8; else jar.rotation.y *= 0.9;
  };
};

models.t_airgap = function (root, col, L, br, opts) {
  var g = grp(root, 0, 0.1, 0), steel = C('#e9e5d8', { m: 0.7, r: 0.3 }), dark = C(STEEL, { m: 0.8, r: 0.3 });
  var gap = L >= 2 ? 0.2 : 0.17, sc = L >= 2 ? 1.2 : 1.0;
  var left = grp(g, -gap / 2 - 0.1, 0, 0), right = grp(g, gap / 2 + 0.1, 0, 0);
  [left, right].forEach(function (p, i) {
    mk(p, gfx.box(0.2 * sc, 0.6 * sc, 0.46 * sc), steel, 0, 0.3 * sc, 0);
    mk(p, gfx.box(0.22 * sc, 0.05, 0.5 * sc), dark, 0, 0.62 * sc, 0);
    mk(p, gfx.box(0.02, 0.4 * sc, 0.3 * sc), GLW('#cfe9e2', 1.8), (i ? -1 : 1) * 0.1 * sc, 0.3 * sc, 0);
    if (L >= 2) { mk(p, gfx.box(0.24, 0.12, 0.54), dark, 0, 0.18, 0); mk(p, gfx.box(0.24, 0.12, 0.54), dark, 0, 0.5, 0); }
  });
  var arcs = []; for (var a = 0; a < 3; a++) { var ar = mk(g, gfx.cyl(0.012, 0.012, gap + 0.12, 4), GLW('#ffffff', 3), 0, 0.2 + a * 0.15, (a - 1) * 0.1); ar.rotation.z = Math.PI / 2; ar.castShadow = false; arcs.push(ar); }
  var lock = mk(g, gfx.tor(0.08, 0.02, 6, 12, Math.PI), GLW('#cfe9e2', 2), 0, 0.72 * sc, 0.0); lock.scale.set(1, 1, 1); mk(g, gfx.box(0.2, 0.14, 0.1), C('#b4def0', { m: 0.7, r: 0.3 }), 0, 0.64 * sc, 0.0);
  var halo = mk(g, gfx.tor(0.42, 0.02, 6, 28), GLW('#cfe9e2', 1.5), 0, 0.1, 0); halo.rotation.x = Math.PI / 2; halo.castShadow = false;
  return function (dt, s) {
    arcs.forEach(function (a, i) { a.visible = Math.sin(s.t * 31 + i * 5) > -0.3; a.rotation.y = Math.sin(s.t * 20 + i) * 0.4; a.position.y = 0.2 + i * 0.15 + Math.sin(s.t * 13 + i) * 0.04; });
    left.position.x = -gap / 2 - 0.1 - (s.atk || 0) * 0.02; right.position.x = gap / 2 + 0.1 + (s.atk || 0) * 0.02;
    halo.rotation.z = s.t * 1.4; halo.scale.setScalar(1 + Math.sin(s.t * 3) * 0.04);
  };
};

models.t_interceptor = function (root, col, L, br, opts) {
  var arrow = grp(root, 0, 0.1, 0);
  for (var i = 0; i < 3; i++) { var ch = mk(arrow, gfx.box(0.16, 0.012, 0.035), GLW('#9fd2f5', 2.0 - i * 0.3), 0.18 + i * 0.1, 0, 0.0); ch.castShadow = false; ch.userData.i = i; }
  var chevs = arrow.children.slice(); // 简化为三段指向条
  var pivot = grp(root, 0, 0.14, 0);
  var white = C(WHITE, { m: 0.6, r: 0.3 }), dark = C(STEEL, { m: 0.8, r: 0.3 }), green = GLW('#6fb6e6', 2.2);
  mk(pivot, gfx.cyl(0.2, 0.26, 0.2, 10), white, 0, 0.1, 0);
  var head = grp(pivot, 0, 0.3, 0);
  mk(head, gfx.box(0.36, 0.2, 0.3), white, -0.02, 0.05, 0); mk(head, gfx.box(0.38, 0.03, 0.32), dark, -0.02, 0.17, 0);
  var parts = { barrel: null, recoil: [] };
  if (br === 'A') { // 贯穿射线：长轨道炮
    var rail = grp(head, 0.1, 0.06, 0);
    mk(rail, gfx.box(0.6, 0.05, 0.05), dark, 0.2, 0.05, 0.07); mk(rail, gfx.box(0.6, 0.05, 0.05), dark, 0.2, 0.05, -0.07);
    mk(rail, gfx.box(0.62, 0.02, 0.02), GLW('#d4ecfb', 2.5), 0.2, 0.05, 0);
    for (var c = 0; c < 4; c++) { var coil = mk(rail, gfx.tor(0.09, 0.015, 5, 14), green, 0.0 + c * 0.14, 0.05, 0); coil.rotation.y = Math.PI / 2; }
    parts.barrel = rail; mk(head, gfx.box(0.12, 0.18, 0.36), dark, -0.2, 0.06, 0);
  } else if (br === 'B') { // 压制脉冲：双发射器 + 碟形
    var em = grp(head, 0.15, 0.06, 0);
    mk(em, gfx.cyl(0.04, 0.04, 0.36, 8), dark, 0.1, 0.05, 0.08).rotation.z = Math.PI / 2; mk(em, gfx.cyl(0.04, 0.04, 0.36, 8), dark, 0.1, 0.05, -0.08).rotation.z = Math.PI / 2;
    var dish = mk(em, gfx.cone(0.2, 0.12, 14), C('#d2eef8', { m: 0.6, r: 0.3 }), 0.34, 0.05, 0); dish.rotation.z = -Math.PI / 2; dish.scale.set(1, 1, 1);
    var pulse = mk(em, gfx.tor(0.15, 0.015, 6, 20), GLW('#9fd6ea', 2.5), 0.4, 0.05, 0); pulse.rotation.y = Math.PI / 2; parts.pulse = pulse;
    parts.barrel = em;
  } else {
    var bar = grp(head, 0.1, 0.06, 0);
    mk(bar, gfx.cyl(0.05, 0.06, 0.42, 8), dark, 0.2, 0.04, 0).rotation.z = Math.PI / 2;
    mk(bar, gfx.cyl(0.07, 0.07, 0.08, 8), white, 0.08, 0.04, 0).rotation.z = Math.PI / 2;
    mk(bar, gfx.sph(0.04, 6, 5), green, 0.42, 0.04, 0); parts.barrel = bar;
    if (L >= 2) mk(head, gfx.box(0.16, 0.08, 0.14), dark, 0, 0.22, 0);
  }
  var muzzle = mk(head, gfx.sph(0.09, 8, 6), GLW('#c4e6fb', 3, 0.0, true), 0.6, 0.1, 0); muzzle.castShadow = false;
  var dir = 0;
  return function (dt, s) {
    var aim = s.aimYaw != null ? s.aimYaw : 0;
    pivot.rotation.y = aim;
    arrow.rotation.y = s.faceYaw != null ? s.faceYaw : 0;
    arrow.visible = !!s.showFace;
    var at = s.atk || 0;
    parts.barrel.position.x = 0.1 - at * 0.07 - (br === 'B' ? -0.05 : 0);
    head.position.y = 0.3 + (s.cooling ? 0 : Math.sin(s.t * 3) * 0.004);
    muzzle.material.opacity = at; muzzle.visible = at > 0.05; muzzle.scale.setScalar(0.6 + at);
    if (parts.pulse) { parts.pulse.rotation.z = s.t * 6; parts.pulse.scale.setScalar(1 + at * 0.5); }
    chevs.forEach(function (c, i) { c.material = GLW('#9fd2f5', 1.4 + Math.sin(s.t * 5 - i) * 0.9); });
  };
};
models.muzzleOffset = function (kind) { return 0.6; };

models.t_sandbox = function (root, col, L, br, opts) {
  var g = grp(root, 0, 0.1, 0), sc = L >= 2 ? 1.18 : 1.0;
  var glass = new T.MeshStandardMaterial({ color: new T.Color('#ffe58a'), transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, emissive: new T.Color('#ffb800'), emissiveIntensity: 0.35, depthWrite: false });
  var dark = C(STEEL, { m: 0.8, r: 0.3 });
  for (var c = 0; c < 4; c++) { var a = c * Math.PI / 2 + Math.PI / 4; mk(g, gfx.box(0.05 * sc, 0.5 * sc, 0.05 * sc), C('#f4d35e', { m: 0.7, r: 0.3 }), Math.cos(a) * 0.27 * sc, 0.25 * sc, Math.sin(a) * 0.27 * sc); }
  mk(g, gfx.box(0.6 * sc, 0.05, 0.6 * sc), dark, 0, 0.025, 0); mk(g, gfx.box(0.6 * sc, 0.05, 0.6 * sc), dark, 0, 0.52 * sc, 0);
  var cube = mk(g, gfx.box(0.5 * sc, 0.46 * sc, 0.5 * sc), glass, 0, 0.27 * sc, 0); cube.castShadow = false;
  var scan = mk(g, gfx.plane(0.46 * sc, 0.46 * sc), new T.MeshBasicMaterial({ color: new T.Color('#fff3b0').multiplyScalar(1.8), transparent: true, opacity: 0.7, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.2, 0); scan.rotation.x = Math.PI / 2;
  var bug = mk(g, gfx.ico(0.07, 0), GLW('#ff5d6c', 2.2), 0, 0.25 * sc, 0);
  var ring = mk(g, gfx.tor(0.38 * sc, 0.02, 6, 28), GLW('#ffd43b', 2.0), 0, 0.6 * sc, 0); ring.rotation.x = Math.PI / 2;
  var ring2 = null; if (L >= 2) { ring2 = mk(g, gfx.tor(0.3 * sc, 0.015, 6, 24), GLW('#fff0a0', 2.2), 0, 0.68 * sc, 0); }
  var mort = grp(g, 0, 0.58 * sc, 0);
  var tube = mk(mort, gfx.cyl(0.07, 0.09, 0.3, 10), dark, 0.0, 0.14, 0); mk(mort, gfx.cyl(0.085, 0.085, 0.04, 10), C('#f4d35e', { m: 0.7, r: 0.3 }), 0, 0.3, 0);
  var flash = mk(mort, gfx.sph(0.1, 8, 6), GLW('#ffe58a', 3, 0, true), 0, 0.36, 0); flash.castShadow = false;
  var ant = mk(g, gfx.cyl(0.01, 0.01, 0.3, 4), dark, -0.2 * sc, 0.65 * sc, -0.2 * sc); mk(g, gfx.sph(0.03, 6, 5), GLW('#ff5d6c', 3), -0.2 * sc, 0.82 * sc, -0.2 * sc);
  return function (dt, s) {
    scan.position.y = 0.06 + ((s.t * 0.6) % 1) * 0.42 * sc; bug.rotation.y = s.t * 2; bug.rotation.x = s.t * 1.3; bug.position.y = 0.25 * sc + Math.sin(s.t * 2) * 0.03;
    ring.rotation.z = s.t * 1.5; if (ring2) ring2.rotation.y = s.t * 2.2; ring2 && (ring2.rotation.x = Math.PI / 2 + Math.sin(s.t) * 0.3);
    mort.rotation.y = s.aimYaw != null ? s.aimYaw : 0; mort.rotation.z = -0.35 - (s.atk || 0) * 0.1; tube.position.y = 0.14 - (s.atk || 0) * 0.04;
    flash.material.opacity = s.atk || 0; flash.visible = (s.atk || 0) > 0.05;
    scan.material.opacity = s.detecting ? 0.9 : 0.55;
  };
};

models.t_repair = function (root, col, L, br, opts) {
  var g = grp(root, 0, 0.1, 0), teal = GLW('#58d8a8', 2.0), sc = L >= 2 ? 1.2 : 1.0;
  mk(g, gfx.cyl(0.1, 0.18, 0.2, 8), C('#d6f5ee', { m: 0.6, r: 0.3 }), 0, 0.1, 0);
  var emit = mk(g, gfx.tor(0.2, 0.02, 6, 20), teal, 0, 0.22, 0); emit.rotation.x = Math.PI / 2;
  var crys = grp(g, 0, 0.55 * sc, 0), body = mk(crys, gfx.oct(0.2 * sc), C('#c4f5e0', { m: 0.2, r: 0.1, e: 0.9, ec: '#58d8a8' }), 0, 0, 0); body.scale.y = 1.3;
  var cross = grp(crys); mk(cross, gfx.box(0.26 * sc, 0.07 * sc, 0.07 * sc), GLW('#ffffff', 2.4), 0, 0, 0.0); mk(cross, gfx.box(0.07 * sc, 0.26 * sc, 0.07 * sc), GLW('#ffffff', 2.4), 0, 0, 0); cross.position.z = 0; cross.rotation.y = 0;
  var cross2 = grp(crys); cross2.rotation.y = Math.PI / 2; mk(cross2, gfx.box(0.26 * sc, 0.07 * sc, 0.07 * sc), GLW('#ffffff', 2.4), 0, 0, 0); mk(cross2, gfx.box(0.07 * sc, 0.26 * sc, 0.07 * sc), GLW('#ffffff', 2.4), 0, 0, 0);
  var bots = []; var nb = L >= 2 ? 5 : 3; for (var i = 0; i < nb; i++) { bots.push(mk(g, gfx.sph(0.04, 6, 5), GLW('#a8f0d0', 2.4), 0, 0.5, 0)); }
  var halo = L >= 2 ? mk(g, gfx.tor(0.34, 0.015, 6, 28), teal, 0, 0.55 * sc, 0) : null;
  var aura = mk(g, gfx.ring(0.3, 0.34, 30), new T.MeshBasicMaterial({ color: new T.Color('#58d8a8').multiplyScalar(1.5), transparent: true, opacity: 0.0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.13, 0); aura.rotation.x = -Math.PI / 2; aura.castShadow = false; aura.userData.noBox = true;
  return function (dt, s) {
    crys.position.y = 0.55 * sc + Math.sin(s.t * 2.2) * 0.05; crys.rotation.y = s.t * 0.9; emit.rotation.z = s.t * 2;
    bots.forEach(function (b, i) { var a = s.t * 2 + i / bots.length * Math.PI * 2; b.position.set(Math.cos(a) * 0.3, 0.5 + Math.sin(a * 1.5) * 0.1, Math.sin(a) * 0.3); });
    if (halo) { halo.rotation.x = Math.PI / 2 + Math.sin(s.t) * 0.3; halo.rotation.y = s.t * 1.1; }
    aura.material.opacity = s.healing ? 0.5 + 0.3 * Math.sin(s.t * 6) : 0; aura.scale.setScalar(1 + (s.healing ? ((s.t * 1.2) % 1) * 2 : 0));
    crys.scale.setScalar(1 + (s.skill || 0) * 0.3);
  };
};

// ================= 敌人 =================
models.enemy = function (type) {
  var root = new T.Group(), fn = models['e_' + type](root);
  var mats = prepInstance(root), flashC = new T.Color('#ffffff');
  var obj = { group: root, update: function (dt, s) { fn(dt, s); applyFlash(mats, s.hit || 0, flashC, 0, s.opacity); }, type: type };
  return obj;
};
function eyes(parent, x, y, z, sp, col) { var a = mk(parent, gfx.sph(0.03, 6, 5), GLW(col || '#ffee55', 3), x, y, z + sp); var b = mk(parent, gfx.sph(0.03, 6, 5), GLW(col || '#ffee55', 3), x, y, z - sp); a.castShadow = b.castShadow = false; return [a, b]; }

models.e_worm = function (root) {
  var segs = [], N = 6, red = C('#b9414b', { m: 0.3, r: 0.45, e: 0.25, ec: '#ea4256' }), dk = C('#44181d', { m: 0.3, r: 0.5 });
  for (var i = 0; i < N; i++) {
    var g = grp(root), r = i === 0 ? 0.15 : 0.13 - i * 0.012;
    mk(g, gfx.sph(r, 10, 8), i === 0 ? red : (i % 2 ? red : dk), 0, 0, 0);
    if (i > 0) mk(g, gfx.cone(0.035, 0.1, 5), GLW('#ed5e6b', 1.6), 0, r * 0.95, 0);
    g.userData.r = r; segs.push(g);
  }
  var head = segs[0]; eyes(head, 0.11, 0.05, 0, 0.06, '#ecdd57');
  var mL = mk(head, gfx.cone(0.03, 0.12, 5), C('#f8c0c5', { m: 0.3 }), 0.15, -0.04, 0.05), mR = mk(head, gfx.cone(0.03, 0.12, 5), C('#f8c0c5', { m: 0.3 }), 0.15, -0.04, -0.05); mL.rotation.z = -Math.PI / 2; mR.rotation.z = -Math.PI / 2;
  return function (dt, s) {
    var m = s.m || 0, mv = s.mv == null ? 1 : s.mv;
    for (var i = 0; i < N; i++) {
      var g = segs[i], x = -i * 0.17, ph = m * 7 - i * 0.9;
      g.position.set(x + (i === 0 ? 0 : 0), 0.15 + Math.max(0, Math.sin(ph)) * 0.05 * mv + (1 - mv) * Math.sin(s.t * 3 + i) * 0.01, Math.sin(ph) * 0.07 * mv + Math.sin(s.t * 2 + i) * 0.01);
      g.scale.setScalar(1 + (s.atk || 0) * (i === 0 ? 0.35 : 0.0));
    }
    head.rotation.z = (s.atk || 0) * -0.4; mL.rotation.y = -(s.atk || 0) * 0.9; mR.rotation.y = (s.atk || 0) * 0.9;
    root.rotation.z = 0;
  };
};

models.e_flooder = function (root) {
  var core = mk(root, gfx.ico(0.3, 1), C('#ea8043', { m: 0.2, r: 0.4, e: 0.7, ec: '#e86431' }), 0, 0.38, 0), orbs = [], rings = [];
  core.material.flatShading = true; core.material.needsUpdate = true;
  var inner = mk(root, gfx.ico(0.18, 1), GLW('#f0c776', 2.4), 0, 0.38, 0);
  for (var i = 0; i < 14; i++) { var o = mk(root, gfx.sph(0.06 + (i % 3) * 0.015, 6, 5), i % 2 ? GLW('#eea765', 2) : C('#ea7343', { m: 0.2, e: 0.6, ec: '#e85731' }), 0, 0.38, 0); o.userData = { a: i / 14 * Math.PI * 2, r: 0.4 + (i % 4) * 0.06, y: (i % 5 - 2) * 0.08, sp: 1.4 + (i % 3) * 0.6 }; orbs.push(o); }
  for (var k = 0; k < 2; k++) { var rg = grp(root, 0, 0.38, 0); for (var c = 0; c < 8; c++) { var a = c / 8 * Math.PI * 2; var sp = mk(rg, gfx.cone(0.04, 0.16, 5), C('#6f2f1b', { m: 0.4 }), Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); sp.rotation.z = -Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); sp.rotation.set(0, 0, 0); sp.rotation.z = Math.PI / 2; sp.rotation.y = a; } rings.push(rg); }
  return function (dt, s) {
    var p = 1 + Math.sin(s.t * 4) * 0.06 + (s.atk || 0) * 0.25; core.scale.setScalar(p); inner.scale.setScalar(p * (0.9 + Math.sin(s.t * 9) * 0.1));
    core.rotation.y = s.t * 0.6; core.rotation.x = s.t * 0.4;
    orbs.forEach(function (o) { var u = o.userData, a = u.a + s.t * u.sp; var r = u.r * (1 + (s.atk || 0) * 0.3); o.position.set(Math.cos(a) * r, 0.38 + u.y + Math.sin(a * 2) * 0.05, Math.sin(a) * r); });
    rings[0].rotation.y = s.t * 1.4; rings[1].rotation.y = -s.t * 2; rings[0].rotation.z = 0.5; rings[1].rotation.z = -0.4;
    root.position.y = Math.sin(s.t * 3) * 0.02;
  };
};

models.e_trojan = function (root) {
  var pk = grp(root, 0, 0.2, 0), horse = grp(root, 0, 0.22, 0), white = C('#f9f6ee', { m: 0.3, r: 0.4 }), blue = C('#7fb2c4', { m: 0.4, r: 0.4, e: 0.3, ec: '#6aa8bc' });
  var lower = mk(pk, gfx.box(0.34, 0.16, 0.34), white, 0, -0.04, 0), lid = grp(pk, 0, 0.04, 0);
  mk(lid, gfx.box(0.36, 0.1, 0.36), white, 0, 0.05, 0);
  mk(pk, gfx.box(0.37, 0.03, 0.37), blue, 0, -0.04, 0); mk(pk, gfx.box(0.12, 0.17, 0.37), blue, 0, -0.04, 0);
  var tick = mk(lid, gfx.box(0.1, 0.02, 0.04), GLW('#6befa8', 2.4), 0.19, 0.06, 0); tick.castShadow = false; var badge = mk(lid, gfx.box(0.01, 0.09, 0.09), GLW('#6befa8', 2), 0.185, 0.05, 0.0); badge.castShadow = false;
  // 木马本体
  var hc = C('#2f7a2a', { m: 0.3, r: 0.5, e: 0.35, ec: '#6ceb4d' }), hd = C('#143a12', { m: 0.3, r: 0.6 });
  var body = mk(horse, gfx.box(0.34, 0.15, 0.17), hc, 0, 0.1, 0), neck = mk(horse, gfx.box(0.1, 0.22, 0.12), hc, 0.2, 0.2, 0); neck.rotation.z = -0.4;
  var hh = mk(horse, gfx.box(0.18, 0.1, 0.11), hc, 0.3, 0.33, 0); hh.rotation.z = -0.2; eyes(hh, 0.07, 0.04, 0, 0.05, '#ea4545');
  var legs = []; for (var i = 0; i < 4; i++) { var lg = mk(horse, gfx.box(0.05, 0.16, 0.05), hd, (i % 2 ? 0.12 : -0.12), 0.0, (i < 2 ? 0.07 : -0.07)); legs.push(lg); }
  for (var j = 0; j < 5; j++) mk(horse, gfx.cone(0.03, 0.1, 4), GLW('#95ee69', 2), -0.15 + j * 0.07, 0.2, 0).castShadow = false;
  var wheel = mk(horse, gfx.box(0.04, 0.12, 0.04), hd, -0.2, 0.14, 0.0);
  return function (dt, s) {
    var rv = s.rev || 0, m = s.m || 0;
    var pkS = 1 - rv * 0.9, hs = clamp(rv * 1.25, 0, 1);
    pk.scale.setScalar(Math.max(0.01, pkS)); pk.visible = rv < 0.98; lid.position.y = 0.04 + rv * 0.16; lid.rotation.z = rv * 0.7;
    horse.scale.setScalar(Math.max(0.01, hs) * (1 + Math.sin(clamp(rv, 0, 1) * Math.PI) * 0.15)); horse.visible = rv > 0.05;
    pk.position.y = 0.2 + Math.abs(Math.sin(m * 6)) * 0.04 * (s.mv == null ? 1 : s.mv);
    legs.forEach(function (l, i) { l.rotation.z = Math.sin(m * 9 + (i % 2) * Math.PI) * 0.6 * (s.mv == null ? 1 : s.mv); });
    horse.position.y = 0.22 + Math.abs(Math.sin(m * 9)) * 0.03; horse.rotation.z = Math.sin(m * 9) * 0.04;
    if (rv > 0.05 && rv < 0.95) root.position.x = Math.sin(s.t * 70) * 0.012; else root.position.x = 0;
  };
};

models.e_ransom = function (root) {
  var body = grp(root, 0, 0.55, 0), mag = C('#a33a84', { m: 0.55, r: 0.35, e: 0.35, ec: '#e855b9' });
  mk(body, gfx.box(0.3, 0.26, 0.2), mag, 0, 0, 0); mk(body, gfx.box(0.32, 0.04, 0.22), C('#35142e', { m: 0.6 }), 0, 0.14, 0); mk(body, gfx.box(0.32, 0.04, 0.22), C('#35142e', { m: 0.6 }), 0, -0.14, 0);
  var shackle = grp(body, 0, 0.14, 0), shg = new T.TorusGeometry(0.1, 0.028, 6, 14, Math.PI);
  var sh = mk(shackle, shg, C('#e2ade2', { m: 0.8, r: 0.25 }), 0, 0, 0); sh.rotation.y = Math.PI / 2; shackle.position.set(0, 0.14, 0);
  var key = mk(body, gfx.cyl(0.04, 0.04, 0.02, 10), GLW('#f7c6e9', 3), 0.105, 0.03, 0); key.rotation.z = Math.PI / 2; var slot = mk(body, gfx.box(0.02, 0.09, 0.025), GLW('#f7c6e9', 3), 0.106, -0.04, 0);
  eyes(body, 0.1, 0.1, 0, 0.07, '#e6475f');
  var tent = []; for (var t = 0; t < 3; t++) { var arr = []; for (var s = 0; s < 5; s++) { arr.push(mk(body, gfx.sph(0.03 - s * 0.003, 6, 5), s % 2 ? C('#6f255b', { m: 0.7 }) : GLW('#e855b9', 1.5), 0, -0.16 - s * 0.07, (t - 1) * 0.08)); } tent.push(arr); }
  return function (dt, s) {
    var m = s.m || 0;
    body.position.y = 0.55 + Math.sin(s.t * 2.4) * 0.05; body.rotation.z = Math.sin(s.t * 1.7) * 0.05;
    shackle.rotation.z = (s.atk || 0) * 0.9; shackle.position.y = 0.14 + (s.atk || 0) * 0.05;
    tent.forEach(function (arr, t) { arr.forEach(function (b, i) { b.position.x = Math.sin(s.t * 3 + t * 2 + i * 0.7) * 0.04 * (i + 1) - (i * 0.02); b.position.z = (t - 1) * 0.08 + Math.cos(s.t * 2.5 + t + i * 0.5) * 0.03 * i; }); });
    key.material = GLW('#f7c6e9', 2.5 + (s.atk || 0) * 3);
  };
};

models.e_hotspot = function (root) {
  var g = grp(root, 0, 0, 0), bluec = C('#4f8fb0', { m: 0.6, r: 0.3, e: 0.4, ec: '#7cc9e4' }), dk = C('#1a2f2a', { m: 0.7, r: 0.3 });
  mk(g, gfx.cyl(0.2, 0.17, 0.07, 10), bluec, 0, 0, 0); mk(g, gfx.sph(0.12, 10, 6), C('#d2eef8', { m: 0.2, r: 0.2, e: 0.5, ec: '#7cc9e4' }), 0, 0.05, 0).scale.y = 0.7;
  var rotors = [];
  for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2 + Math.PI / 4; mk(g, gfx.box(0.2, 0.02, 0.02), dk, Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17).rotation.y = -a; var r = grp(g, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3); mk(r, gfx.box(0.2, 0.008, 0.03), GLW('#c2e8f4', 1.4, 0.7), 0, 0, 0); mk(r, gfx.box(0.03, 0.008, 0.2), GLW('#c2e8f4', 1.4, 0.7), 0, 0, 0); rotors.push(r); }
  var arcs = []; for (var w = 0; w < 3; w++) { var tg = new T.TorusGeometry(0.12 + w * 0.09, 0.012, 4, 14, 1.4); var arc = mk(g, tg, GLW('#7cc9e4', 2.4), 0, 0.12 + w * 0.0, 0); arc.rotation.x = -Math.PI / 2 + 0.3; arc.rotation.z = Math.PI / 2 - 0.7; arc.position.y = 0.18; arc.castShadow = false; arcs.push(arc); }
  var led = mk(g, gfx.sph(0.03, 6, 5), GLW('#ea4252', 3), 0, -0.05, 0);
  return function (dt, s) {
    rotors.forEach(function (r, i) { r.rotation.y = s.t * 40 * (i % 2 ? 1 : -1); });
    arcs.forEach(function (a, i) { var p = (s.t * 1.3 + i * 0.33) % 1; a.scale.setScalar(0.6 + p * 0.8); a.material = GLW('#7cc9e4', 2.4 * (1 - p), 1, true); a.position.y = 0.16 + p * 0.25; });
    g.position.y = Math.sin(s.t * 2.5) * 0.06; g.rotation.z = Math.sin(s.t * 1.5) * 0.08 - 0.1; g.rotation.x = Math.cos(s.t * 1.2) * 0.06;
    led.visible = Math.sin(s.t * 8) > 0;
  };
};

models.e_packer = function (root) {
  var y = C('#d5b941', { m: 0.5, r: 0.35, e: 0.12, ec: '#e6c319' }), blk = C('#161e1c', { m: 0.4, r: 0.5 });
  var shell = mk(root, gfx.sph(0.3, 14, 8), y, 0, 0.3, 0); shell.scale.set(1.1, 0.78, 0.95);
  for (var i = 0; i < 4; i++) { var band = mk(root, gfx.tor(0.255 - Math.abs(i - 1.5) * 0.05, 0.022, 5, 20), blk, (i - 1.5) * 0.11, 0.34, 0); band.rotation.y = Math.PI / 2; band.scale.set(1, 1, 0.9); }
  mk(root, gfx.box(0.2, 0.1, 0.2), blk, 0.32, 0.2, 0); eyes(root, 0.43, 0.22, 0, 0.05, '#ea4545');
  var legs = []; for (var l = 0; l < 6; l++) { var lg = mk(root, gfx.box(0.04, 0.2, 0.04), blk, -0.15 + (l % 3) * 0.15, 0.1, (l < 3 ? 0.22 : -0.22)); legs.push(lg); }
  var orbs = []; for (var o = 0; o < 3; o++) orbs.push(mk(root, gfx.ico(0.07, 0), GLW('#a9d6ea', 2), 0, 0.55, 0));
  var aura = mk(root, gfx.ring(0.55, 0.6, 36), new T.MeshBasicMaterial({ color: new T.Color('#a9d6ea').multiplyScalar(1.8), transparent: true, opacity: 0.0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.08, 0); aura.rotation.x = -Math.PI / 2; aura.castShadow = false; aura.userData.noBox = true;
  return function (dt, s) {
    var m = s.m || 0, mv = s.mv == null ? 1 : s.mv;
    legs.forEach(function (lg, i) { lg.rotation.z = Math.sin(m * 8 + i * 1.7) * 0.5 * mv; lg.position.y = 0.1 + Math.max(0, Math.sin(m * 8 + i * 1.7)) * 0.03 * mv; });
    shell.position.y = 0.3 + Math.abs(Math.sin(m * 4)) * 0.025 * mv; root.rotation.z = Math.sin(m * 4) * 0.03 * mv;
    orbs.forEach(function (b, i) { var a = s.t * 2.2 + i * 2.09; b.position.set(Math.cos(a) * 0.38, 0.56 + Math.sin(s.t * 3 + i) * 0.04, Math.sin(a) * 0.38); b.rotation.y = s.t * 2; b.scale.setScalar(1 + (s.pulse || 0) * 0.8); });
    aura.material.opacity = (s.pulse || 0) * 0.8; aura.scale.setScalar(1 + (1 - (s.pulse || 0)) * 2.6);
  };
};

// ---- Boss ----
models.e_boss1 = function (root) {
  var core = mk(root, gfx.ico(0.55, 1), C('#7f3223', { m: 0.4, r: 0.45, e: 0.6, ec: '#e85731' }), 0, 1.0, 0), arms = [], drones = [], legs = [];
  core.material.flatShading = true; core.material.needsUpdate = true;
  var inner = mk(root, gfx.ico(0.32, 1), GLW('#eea765', 2.6), 0, 1.0, 0);
  var crown = []; for (var c = 0; c < 8; c++) { var a = c / 8 * Math.PI * 2; var sp = mk(root, gfx.cone(0.09, 0.4, 5), C('#ea6a42', { m: 0.6, e: 0.6, ec: '#e64a19' }), Math.cos(a) * 0.55, 1.35, Math.sin(a) * 0.55); sp.rotation.z = -Math.cos(a) * 0.5; sp.rotation.x = Math.sin(a) * 0.5; crown.push(sp); }
  for (var i = 0; i < 8; i++) { var arm = grp(root, 0, 1.0, 0), ang = i / 8 * Math.PI * 2; arm.userData.ang = ang; var segs = []; for (var s = 0; s < 4; s++) segs.push(mk(arm, gfx.sph(0.07 - s * 0.008, 6, 5), s === 3 ? GLW('#ea5e42', 2.4) : C('#3a1a14', { m: 0.7 }), 0, 0, 0)); var head = mk(arm, gfx.box(0.16, 0.12, 0.14), C('#3a1a14', { m: 0.6, e: 0.3, ec: '#e64a19' }), 0, 0, 0); eyes(head, 0.08, 0.02, 0, 0.04, '#ecdd57'); arm.userData.segs = segs; arm.userData.head = head; arms.push(arm); }
  for (var l = 0; l < 4; l++) { var lg = grp(root, Math.cos(l * 1.57 + 0.78) * 0.5, 0.8, Math.sin(l * 1.57 + 0.78) * 0.5); mk(lg, gfx.box(0.12, 0.8, 0.12), C('#2a1410', { m: 0.7, r: 0.4 }), 0, -0.4, 0); mk(lg, gfx.box(0.2, 0.06, 0.2), GLW('#ea6a42', 1.6), 0, -0.8, 0); legs.push(lg); }
  for (var d = 0; d < 6; d++) { var dr = grp(root); mk(dr, gfx.box(0.12, 0.08, 0.12), C('#401c16', { m: 0.5, e: 0.4, ec: '#e64a19' }), 0, 0, 0); mk(dr, gfx.sph(0.03, 5, 4), GLW('#ecdd57', 3), 0.07, 0, 0); drones.push(dr); }
  var ring = mk(root, gfx.tor(0.9, 0.03, 6, 40), GLW('#ea6a42', 2), 0, 0.12, 0); ring.rotation.x = Math.PI / 2; ring.castShadow = false; ring.userData.noBox = true;
  root.scale.setScalar(1.15);
  return function (dt, s) {
    var m = s.m || 0, ph2 = s.phase >= 2 ? 1 : 0, mv = s.mv == null ? 1 : s.mv;
    var beat = 1 + Math.sin(s.t * (3 + ph2 * 3)) * 0.05 + (s.atk || 0) * 0.15; core.scale.setScalar(beat); inner.scale.setScalar(beat * (0.8 + Math.sin(s.t * 11) * 0.1));
    core.rotation.y = s.t * 0.4; core.position.y = 1.0 + Math.sin(s.t * 1.6) * 0.04 + Math.abs(Math.sin(m * 3)) * 0.05 * mv;
    inner.position.y = core.position.y;
    crown.forEach(function (c, i) { c.rotation.x += 0; c.scale.y = 1 + Math.sin(s.t * 3 + i) * 0.15 + ph2 * 0.3; });
    arms.forEach(function (arm, i) {
      var u = arm.userData, a = u.ang + s.t * 0.35, R = 0.45;
      arm.position.set(Math.cos(a) * 0.1, core.position.y, Math.sin(a) * 0.1);
      var wv = Math.sin(s.t * 2 + i) * 0.3 + (s.surge || 0) * 0.4;
      for (var k = 0; k < u.segs.length; k++) { var q = (k + 1) / 4; var rr = (0.55 + q * (0.9 + ph2 * 0.25)) * (1 + (s.surge || 0) * 0.3); u.segs[k].position.set(Math.cos(a) * rr, Math.sin(wv + q * 1.1) * 0.4 * q - q * 0.3 + (s.atk || 0) * 0.1, Math.sin(a) * rr); }
      u.head.position.set(Math.cos(a) * (1.55 + ph2 * 0.25), Math.sin(wv + 1.1) * 0.4 - 0.3, Math.sin(a) * (1.55 + ph2 * 0.25)); u.head.rotation.y = -a;
    });
    legs.forEach(function (lg, i) { lg.rotation.z = Math.sin(m * 3 + i * 1.6) * 0.3 * mv; lg.rotation.x = Math.cos(m * 3 + i * 1.6) * 0.15 * mv; });
    drones.forEach(function (dr, i) { var a = -s.t * 1.1 + i / 6 * Math.PI * 2, rr = 1.05 + ph2 * 0.35; dr.position.set(Math.cos(a) * rr, 0.25 + Math.sin(s.t * 2 + i) * 0.1, Math.sin(a) * rr); dr.rotation.y = -a; dr.visible = i < 3 || ph2 > 0; dr.scale.setScalar(ph2 ? 1.2 : 1); });
    ring.rotation.z = s.t * 0.8; ring.scale.setScalar(1 + (s.surge || 0) * 0.6 + Math.sin(s.t * 2) * 0.03);
  };
};
models.e_boss2 = function (root) {
  var crys = C('#e7c263', { m: 0.1, r: 0.05, e: 0.7, ec: '#bc7eea' }), core = mk(root, gfx.oct(0.55), crys, 0, 1.15, 0); core.scale.y = 1.5;
  var edges = mk(root, new T.EdgesGeometry(new T.OctahedronGeometry(0.58)), new T.LineBasicMaterial({ color: new T.Color('#ffffff').multiplyScalar(2) }), 0, 1.15, 0); edges.scale.y = 1.5;
  var shards = []; for (var i = 0; i < 8; i++) { var sh = mk(root, gfx.box(0.1, 0.34, 0.04), C('#f3eddc', { m: 0.2, r: 0.05, e: 0.8, ec: '#caa0f0' }), 0, 1, 0); shards.push(sh); }
  var ghosts = []; for (var g = 0; g < 3; g++) { var gh = mk(root, gfx.oct(0.5), new T.MeshBasicMaterial({ color: new T.Color('#bc7eea').multiplyScalar(1.3), transparent: true, opacity: 0.18, wireframe: g % 2 === 0, depthWrite: false, blending: T.AdditiveBlending }), 0, 1.15, 0); gh.scale.y = 1.5; gh.castShadow = false; ghosts.push(gh); }
  var eye = mk(root, gfx.sph(0.14, 10, 8), GLW('#ffffff', 3), 0, 1.15, 0.0);
  var rip = []; for (var r = 0; r < 3; r++) { var rg = mk(root, gfx.ring(0.7, 0.74, 40), new T.MeshBasicMaterial({ color: new T.Color('#caa0f0').multiplyScalar(1.8), transparent: true, opacity: 0.4, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.1, 0); rg.rotation.x = -Math.PI / 2; rg.castShadow = false; rg.userData.noBox = true; rip.push(rg); }
  var storm = mk(root, gfx.tor(1.2, 0.02, 6, 48), GLW('#be8bec', 1.3), 0, 1.1, 0); storm.rotation.x = Math.PI / 2; storm.castShadow = false; storm.userData.noBox = true;
  root.scale.setScalar(1.1);
  return function (dt, s) {
    var ph2 = s.phase >= 2 ? 1 : 0;
    core.position.y = 1.15 + Math.sin(s.t * 1.8) * 0.08; core.rotation.y = s.t * 0.7; edges.position.y = core.position.y; edges.rotation.y = core.rotation.y; eye.position.y = core.position.y; eye.scale.setScalar(1 + Math.sin(s.t * 6) * 0.15 + (s.atk || 0) * 0.5);
    shards.forEach(function (sh, i) { var a = s.t * (0.8 + (i % 3) * 0.2) + i * 0.785, rr = 0.85 + (i % 2) * 0.25; sh.position.set(Math.cos(a) * rr, core.position.y - 0.1 + Math.sin(a * 2) * 0.3, Math.sin(a) * rr); sh.rotation.y = -a; sh.rotation.z = s.t + i; });
    ghosts.forEach(function (gh, i) { var j = (s.hit ? 0.12 : 0.04) + ph2 * 0.04; gh.position.set(Math.sin(s.t * 1.7 + i * 2) * 0.5 + (G.rand() - 0.5) * j, core.position.y + Math.sin(s.t * 2 + i) * 0.12, Math.cos(s.t * 1.3 + i * 2) * 0.5 + (G.rand() - 0.5) * j); gh.rotation.y = s.t * (i + 1) * 0.4; gh.material.opacity = 0.14 + 0.1 * Math.sin(s.t * 3 + i); });
    rip.forEach(function (r, i) { var p = (s.t * 0.5 + i / 3) % 1; r.scale.setScalar(0.6 + p * 1.6); r.material.opacity = (1 - p) * 0.4; });
    storm.visible = ph2 > 0; storm.rotation.z = s.t * 2; storm.scale.setScalar(1 + (s.surge || 0) * 1.5); storm.position.y = core.position.y;
  };
};
models.e_boss3 = function (root) {
  var dk = C('#0c1210', { m: 0.7, r: 0.3, e: 0.15, ec: '#ea4262' }), red = GLW('#ea4262', 2.6);
  var obe = mk(root, gfx.cyl(0.18, 0.5, 1.7, 6), dk, 0, 0.85, 0);
  for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + Math.PI / 6; var seam = mk(root, gfx.box(0.025, 1.5, 0.025), red, Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3); seam.rotation.z = -Math.cos(a) * 0.14; seam.rotation.x = Math.sin(a) * 0.14; seam.castShadow = false; }
  var eye = mk(root, gfx.tor(0.15, 0.03, 6, 20), red, 0, 1.55, 0.0); eye.rotation.y = Math.PI / 2; var pupil = mk(root, gfx.sph(0.07, 8, 6), GLW('#f6b2bf', 1.8), 0.1, 1.55, 0);
  var blades = []; for (var b = 0; b < 4; b++) { var bl = grp(root, 0, 1.0, 0); mk(bl, gfx.cone(0.1, 1.0, 4), dk, 0.5, 0, 0).rotation.z = -Math.PI / 2; mk(bl, gfx.box(0.9, 0.012, 0.015), red, 0.5, 0, 0); bl.userData.ang = b * Math.PI / 2; blades.push(bl); }
  var plates = []; for (var p = 0; p < 6; p++) { var pa = p / 6 * Math.PI * 2; var pl = mk(root, gfx.box(0.04, 0.5, 0.26), C('#3a4341', { m: 0.9, r: 0.2, e: 0.2, ec: '#ea4262' }), Math.cos(pa) * 0.46, 0.5, Math.sin(pa) * 0.46); pl.rotation.y = -pa; plates.push(pl); }
  var spikes = []; for (var k = 0; k < 6; k++) { var ka = k / 6 * Math.PI * 2; var sp = mk(root, gfx.cone(0.07, 0.5, 4), C('#17101c', { m: 0.8, e: 0.4, ec: '#ea4262' }), Math.cos(ka) * 0.62, 0.25, Math.sin(ka) * 0.62); sp.rotation.z = -Math.cos(ka) * 0.8; sp.rotation.x = Math.sin(ka) * 0.8; spikes.push(sp); }
  var aura = mk(root, gfx.ring(0.8, 0.86, 44), new T.MeshBasicMaterial({ color: new T.Color('#ea4262').multiplyScalar(1.3), transparent: true, opacity: 0.25, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.1, 0); aura.rotation.x = -Math.PI / 2; aura.castShadow = false;
  root.scale.setScalar(1.15);
  return function (dt, s) {
    var ph = s.phase || 1;
    root.position.y = Math.sin(s.t * 1.5) * 0.06 + 0.06; obe.rotation.y = s.t * 0.15;
    eye.rotation.z = s.t * 1.2; pupil.scale.setScalar(1 + (s.atk || 0) * 1.0 + Math.sin(s.t * 5) * 0.1);
    blades.forEach(function (bl, i) { var ext = ph === 3 ? 1.35 : (ph === 2 ? 1.0 : 0.55); bl.rotation.y = bl.userData.ang + s.t * (ph === 3 ? 1.6 : 0.5); bl.scale.set(ext, 1, 1); bl.position.y = 1.0 + Math.sin(s.t * 2 + i) * 0.1; bl.rotation.z = 0.15 * Math.sin(s.t + i); });
    plates.forEach(function (pl) { pl.visible = ph >= 2; }); spikes.forEach(function (sp) { sp.visible = ph >= 3; sp.scale.y = 1 + Math.sin(s.t * 4) * 0.1; });
    aura.material.opacity = ph === 3 ? 0.4 : 0.2; aura.scale.setScalar(1 + Math.sin(s.t * 3) * 0.05 + (s.surge || 0));
  };
};

// ---- 图标缓存 ----
var iconCache = {};
models.icon = function (key, size) {
  size = size || 96; var k = key + '@' + size; if (iconCache[k]) return iconCache[k];
  var obj;
  if (key.indexOf('t:') === 0) { var p = key.split(':'); obj = models.tower(p[1], +p[2] || 1, p[3] || null, { onNode: false }); }
  else obj = models.enemy(key.slice(2));
  obj.update(0, { t: 0.7, m: 0.4, mv: 0, rev: key === 'e:trojan' ? 0 : 0, aimYaw: 0.5, phase: 1 });
  var big = key.indexOf('boss') > 0;
  var url = gfx.renderIcon(obj.group, size, { zoom: big ? 1.0 : 1.05, az: 0.75, el: 0.42 });
  iconCache[k] = url; return url;
};
})(window.G = window.G || {});
