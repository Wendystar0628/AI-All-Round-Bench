'use strict';
// ---------- 资源装载（分步，避免界面假死） ----------
var LAYOUT = null;
function loadAssets(onProgress, onDone) {
  var tasks = [];
  var A = ASSET;
  tasks.push(['舰队旗舰', function () {
    var fs = buildFlagship();
    A.meta.flag = fs.meta;
    A.models.flag = meshOf(fs.g, { sun: SUN_LOCAL, bleed: true });
    if (window.__KEEP_GRIDS) window.__GRID_FLAG = fs.g;
    var wg = buildFlagshipWings();
    A.models.wings = meshOf(wg.g, { sun: SUN_LOCAL, bleed: true });
    if (window.__KEEP_GRIDS) window.__GRID_WING = wg.g;
  }]);
  tasks.push(['护卫舰', function () {
    var c0 = buildEscortClose(0), c1 = buildEscortClose(1);
    A.meta.ce = [c0.meta, c1.meta];
    A.models.ce = [meshOf(c0.g, { sun: SUN_LOCAL, bleed: true }), meshOf(c1.g, { sun: SUN_LOCAL, bleed: true })];
    var v0 = buildVanguard(0), v1 = buildVanguard(1);
    A.meta.vg = [v0.meta, v1.meta];
    A.models.vg = [meshOf(v0.g, { sun: SUN_LOCAL, bleed: true }), meshOf(v1.g, { sun: SUN_LOCAL, bleed: true })];
  }]);
  tasks.push(['小艇与炮台', function () {
    A.models.craft = [meshOf(buildCraft(0).g, { sun: SUN_LOCAL, bleed: true }), meshOf(buildCraft(1).g, { sun: SUN_LOCAL, bleed: true })];
    A.meta.craft = buildCraft(0).meta;
    A.models.pd = meshOf(buildPDHead(), {});
    A.models.pulse = meshOf(buildPulseHead(), {});
    A.models.fbase = meshOf(buildFloatBase(), {});
    A.models.missile = meshOf(buildMissile(), {});
  }]);
  tasks.push(['阵列', function () { LAYOUT = buildLayout(); finalizeLayout(A); }]);
  if (typeof loadMeteors === 'function') tasks.push(['陨石群', function () { loadMeteors(A); }]);
  if (typeof loadInteriors === 'function') {
    tasks.push(['舰桥与机库', function () { loadInteriorA(A); }]);
    tasks.push(['动力中庭', function () { loadInteriorCore(A); }]);
    tasks.push(['能量长廊', function () { loadInteriorCorridor(A); }]);
  }
  var i = 0;
  function step() {
    if (i >= tasks.length) { A.ready = true; onDone(); return; }
    onProgress(tasks[i][0], i / tasks.length);
    var task = tasks[i++];
    setTimeout(function () { task[1](); step(); }, 16);
  }
  step();
}

function finalizeLayout(A) {
  LAYOUT.forEach(function (s, idx) {
    s.id = idx;
    if (s.kind === 'F') { s.model = A.models.flag; s.meta = A.meta.flag; s.rad = [650, 180, 305]; s.cen = [0, 40, 0]; s.cell = 7; s.len = 1120; }
    else if (s.kind === 'C') { var v = s.gi % 2; s.model = A.models.ce[v]; s.meta = A.meta.ce[v]; s.rad = [132, 52, 84]; s.cen = [-2, 10, 0]; s.cell = 4.5; s.len = 200; }
    else { var w = s.gi % 2; s.model = A.models.vg[w]; s.meta = A.meta.vg[w]; s.rad = [152, 54, 92]; s.cen = [0, 6, 0]; s.cell = 4.5; s.len = 230; }
  });
}

// ---------- 工具：局部→世界 ----------
function xfPoint(pose, p) { var w = m3vec(pose.R, p); return [w[0] + pose.pos[0], w[1] + pose.pos[1], w[2] + pose.pos[2]]; }

// ---------- 尾焰 ----------
function addFlame(sp, pose, nz, thr, seed, t, scale) {
  var back = m3vec(pose.R, [-1, 0, 0]);
  var base = xfPoint(pose, [nz.x + 1.5, nz.y, nz.z]);
  var r = nz.r * (scale || 1);
  var len = r * (7 + 11 * thr);
  var core = [0.35, 0.88, 1.0];
  var fl = 0.85 + 0.15 * Math.sin(t * 17 + seed * 7);
  // 主体
  sp.add(5, base[0] + back[0] * len * 0.5, base[1] + back[1] * len * 0.5, base[2] + back[2] * len * 0.5, len * 0.5, r * 1.15 * (0.8 + 0.25 * thr), -back[0], -back[1], -back[2], core[0], core[1], core[2], (0.62 + 0.55 * thr) * fl, seed, 1.0, 1);
  // 接近喷口的凝聚亮斑
  sp.add(0, base[0] + back[0] * r * 0.6, base[1] + back[1] * r * 0.6, base[2] + back[2] * r * 0.6, r * (1.1 + 0.4 * thr), r * 1.1, 0, 0, 0, 0.5, 0.95, 1.0, 0.42 * fl, 0, 0, 0);
  // 沿尾焰的光团（端射时也有体积）
  var nb = 4;
  for (var i = 1; i <= nb; i++) {
    var u = i / (nb + 1), s = r * (1.5 - u * 0.9) * (0.8 + 0.3 * thr);
    var px = base[0] + back[0] * len * u * 0.85, py = base[1] + back[1] * len * u * 0.85, pz = base[2] + back[2] * len * u * 0.85;
    sp.add(0, px, py, pz, s * 1.2, s * 1.2, 0, 0, 0, 0.15, 0.62, 1.0, (0.55 - u * 0.35) * (0.7 + 0.5 * thr) * fl, 0, 0, 0);
  }
  // 外缘散开的细流与光屑
  var ns = 4 + Math.floor(thr * 4);
  for (var k = 0; k < ns; k++) {
    var ph = fract(t * (0.7 + 0.5 * thr) * (0.6 + 0.4 * hash1(seed + k)) + hash1(seed * 3.1 + k * 7.7));
    var lat = (hash1(seed + k * 13.1) - 0.5) * 2, lat2 = (hash1(seed + k * 5.3) - 0.5) * 2;
    var dist = ph * len * 1.25;
    var spread = r * (0.5 + ph * 1.5);
    var up = vnorm(vcross(back, [0, 1, 0]));
    var upv = vcross(up, back);
    var px2 = base[0] + back[0] * dist + up[0] * lat * spread + upv[0] * lat2 * spread;
    var py2 = base[1] + back[1] * dist + up[1] * lat * spread + upv[1] * lat2 * spread;
    var pz2 = base[2] + back[2] * dist + up[2] * lat * spread + upv[2] * lat2 * spread;
    sp.add(8, px2, py2, pz2, r * 0.22, r * 0.22, 0, 0, 0, 0.5, 0.95, 1.0, (1 - ph) * 1.2, 0, 0, 0);
  }
}
