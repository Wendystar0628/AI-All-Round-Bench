/* 输入：Blender 式镜头、拖放部署、选中、道具、快捷键 */
(function (G) {
'use strict';
var T = window.THREE, gfx = G.gfx, K = G.K;

// ---------- 镜头 ----------
var cam = G.camCtl = {
  tx: 8, tz: 6, az: 0, pitch: 58, dist: 20, gtx: 8, gtz: 6, gaz: 0, gpitch: 58, gdist: 20, shakeAmt: 0, def: null, userMoved: false,
  setDefault: function (map, aspect) {
    var c = map.cam, a = aspect || (window.innerWidth / window.innerHeight);
    var d = c.dist * 1.07 * Math.max(1, 1.85 / a);
    cam.def = { tx: c.tx, tz: c.tz + 0.15, az: 0, pitch: c.pitch, dist: d };
  },
  focusT: 0,
  focus: function (x, z, dist, dur) { if (cam.userMoved) return; cam.gtx = x; cam.gtz = z; cam.gdist = dist; cam.gpitch = 46; cam.focusT = dur; },
  reset: function (instant) {
    var d = cam.def; if (!d) return;
    cam.gtx = d.tx; cam.gtz = d.tz; cam.gaz = d.az; cam.gpitch = d.pitch; cam.gdist = d.dist;
    if (instant) { cam.tx = d.tx; cam.tz = d.tz; cam.az = d.az; cam.pitch = d.pitch; cam.dist = d.dist; }
  },
  update: function (dt) {
    if (cam.focusT > 0) { cam.focusT -= dt; if (cam.focusT <= 0) cam.reset(); }
    var k = Math.min(1, dt * 10);
    cam.tx += (cam.gtx - cam.tx) * k; cam.tz += (cam.gtz - cam.tz) * k; cam.az += (cam.gaz - cam.az) * k; cam.pitch += (cam.gpitch - cam.pitch) * k; cam.dist += (cam.gdist - cam.dist) * k;
    var p = cam.pitch * Math.PI / 180, c = gfx.camera;
    var sx = 0, sy = 0, sz = 0;
    if (cam.shakeAmt > 0) { sx = (G.rand() - 0.5) * cam.shakeAmt * 0.35; sy = (G.rand() - 0.5) * cam.shakeAmt * 0.25; sz = (G.rand() - 0.5) * cam.shakeAmt * 0.35; }
    c.position.set(cam.tx + Math.sin(cam.az) * Math.cos(p) * cam.dist + sx, Math.sin(p) * cam.dist + sy, cam.tz + Math.cos(cam.az) * Math.cos(p) * cam.dist + sz);
    c.lookAt(cam.tx + sx, 0, cam.tz + sz);
  }
};

// ---------- 输入状态 ----------
var inp = G.input = { mode: 'idle', armed: null, item: null, facing: 0, tile: -1, ghostTile: -1, cx: 0, cy: 0, drag: null, confirm: null, lastKey: '' };
var mouse = { x: 0, y: 0, mid: false, shift: false };

function M() { return G.match; }
function ui() { return G.ui; }

inp.attach = function (canvas) {
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('auxclick', function (e) { e.preventDefault(); });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', function (e) { if (e.key === 'Shift') mouse.shift = false; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault(); if (!M() || M().inMenu) return;
    var f = Math.exp(e.deltaY * 0.0011); cam.gdist = Math.max(5, Math.min(55, cam.gdist * f)); cam.userMoved = true;
  }, { passive: false });
  window.addEventListener('resize', function () { if (G.exportActive) { var mm = M(); if (mm) cam.setDefault(mm.game.map); return; } if (cam.def && !cam.userMoved) { var m = M(); if (m) { cam.setDefault(m.game.map); cam.reset(true); } } });
};
inp.cancel = function () {
  if (inp.mode === 'idle' && !inp.armed && !inp.item) return false;
  inp.mode = 'idle'; inp.armed = null; inp.item = null; inp.drag = null; inp.confirm = null;
  var m = M(); if (m) { m.world.setGhost(null); m.world.hideRange(); m.world.showItemRange(null); m.world.clearPreview(); m.world.hoverNodeHint = null; m.world.setDeployHint(null); }
  ui().hideTip(); ui().hideConfirm(); ui().refreshCards(); return true;
};
inp.arm = function (kind) {
  var m = M(); if (!m || m.game.over) return; inp.cancel(); inp.mode = 'armed'; inp.armed = kind; ui().refreshCards();
  ui().toast('已选择「' + G.TOWERS[kind].name + '」：点击地图部署（右键 / Esc 取消）', 'info', 1800);
};
inp.armItem = function (id) {
  var m = M(); if (!m || m.game.over) return; inp.cancel();
  if (!m.game.itemReady(id)) { ui().toast(G.ITEMS[id].name + ' 冷却中（' + Math.ceil(m.game.itemCd[id]) + ' 秒）', 'warn'); sfxErr(); return; }
  inp.mode = 'item'; inp.item = id; ui().refreshCards();
  ui().toast('「' + G.ITEMS[id].name + '」：移动鼠标查看影响范围，点击确认投放（右键 / Esc 取消）', 'info', 2200);
};
function sfxErr() { if (G.audio) G.audio.play('deny'); }
inp.startDrag = function (kind, ev) { // 从卡片开始拖放
  var m = M(); if (!m || m.game.over) return; inp.cancel();
  inp.drag = { kind: kind, sx: ev.clientX, sy: ev.clientY, moved: false }; inp.mode = 'drag'; inp.armed = kind; ui().refreshCards(); if (m.world) m.world.setDeployHint(kind);
};

function hoverUpdate(cx, cy) {
  var m = M(); if (!m) return; var w = m.world, g = m.game;
  w.hoverNodeHint = (inp.armed === 'firewall' || inp.armed === 'airgap' || inp.item === 'isolator') ? g.nodes : null;
  w.setDeployHint(inp.armed && inp.mode !== 'facing' && inp.mode !== 'confirm' ? inp.armed : null);
  var ti = w.tileAt(cx, cy); inp.tile = ti; w.hoverTile = ti;
  if (inp.mode === 'idle' && !G.camMidDown) { if (ti >= 0) ui().hoverInfo(ti, cx, cy); else ui().hideTip(); }
  if (inp.mode === 'armed' || inp.mode === 'drag') placementPreview(ti, cx, cy);
  else if (inp.mode === 'facing') facingPreview(cx, cy);
  else if (inp.mode === 'item') itemPreview(ti, cx, cy);
  else if (inp.mode === 'confirm') { }
}
function placementPreview(ti, cx, cy) {
  var m = M(), w = m.world, g = m.game, kind = inp.armed; if (!kind) return;
  if (ti < 0 || !g.inb(g.tx(ti), g.ty(ti))) { w.setGhost(null); w.hideRange(); w.clearPreview(); ui().setTip(G.TOWERS[kind].name + '：拖到地图上部署', 'info', cx, cy); return; }
  var x = g.tx(ti), y = g.ty(ti), r = g.canPlace(kind, x, y);
  inp.lastCheck = r;
  w.setGhost(kind, x, y, r.ok, inp.facing);
  var face = defaultFace(kind, x, y);
  var spec = { x: x, y: y, kind: kind, level: 1, face: face, ok: r.ok || (!r.sealed && !r.cd && r.afford === false ? true : r.ok), nodeAdj: kind === 'firewall' && g.kind[ti] === K.NODE };
  w.showRange(spec);
  if (r.pv) { if (r.pv.anyChanged || r.ok) w.setPreview(r.pv); } else w.clearPreview();
  if (r.ok || (r.afford === false)) {
    var txt = G.TOWERS[kind].name + '：' + (r.isolates ? '隔离「' + g.nodeName(ti) + '」' : '可部署');
    if (r.pv) { var ch = []; g.entrances.forEach(function (en) { var rr = r.pv.routes[en.id]; if (rr && rr.changed) ch.push(en.id + ' 改走 ' + (rr.zones.slice(0, -1).join('→') || '另一条路') + '（路程 ' + (rr.deltaCost >= 0 ? '+' : '') + rr.deltaCost.toFixed(1) + '）'); }); txt += ch.length ? '\n' + ch.join('\n') : '\n无入口改道'; }
    if (r.afford === false) txt = r.msg;
    ui().setTip(txt, r.afford === false ? 'warn' : 'ok', cx, cy);
  } else ui().setTip(r.msg, 'bad', cx, cy);
}
function defaultFace(kind, x, y) {
  if (kind !== 'interceptor') return 0;
  var g = M().game; // 默认朝向最近的道路方向
  var best = 0, bd = 1e9;
  for (var d = 0; d < 4; d++) { for (var s = 1; s <= 3; s++) { var nx = x + G.DX[d] * s, ny = y + G.DY[d] * s; if (g.inb(nx, ny) && g.isRoadKind(g.kind[g.idx(nx, ny)])) { if (s < bd) { bd = s; best = Math.atan2(G.DY[d], G.DX[d]); } } } }
  return best;
}
function facingPreview(cx, cy) {
  var m = M(), w = m.world, g = m.game, c = inp.confirm; if (!c) return;
  var pt = w.groundPoint(cx, cy, 0.39); if (!pt) return;
  var dx = pt.x - c.x, dy = pt.y - c.y; if (Math.hypot(dx, dy) > 0.35) inp.facing = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  w.setGhost('interceptor', c.x, c.y, true, inp.facing);
  w.showRange({ x: c.x, y: c.y, kind: 'interceptor', level: 1, face: inp.facing, ok: true });
  var v = w.towerViews; ui().setTip('设定朝向：移动鼠标，点击确认；R 旋转 45°；右键取消', 'ok', cx, cy);
}
function itemPreview(ti, cx, cy) {
  var m = M(), w = m.world, g = m.game, id = inp.item; if (!id) return;
  var it = G.ITEMS[id];
  if (ti < 0) { w.showItemRange(null); w.clearPreview(); ui().setTip(it.name + '：' + it.brief, 'info', cx, cy); return; }
  var x = g.tx(ti), y = g.ty(ti);
  if (id === 'downgrade') { var pt = w.groundPoint(cx, cy, 0.1) || { x: x, y: y }; x = pt.x; y = pt.y; }
  var r = g.canUseItem(id, id === 'downgrade' ? Math.round(x * 2) / 2 : x, id === 'downgrade' ? Math.round(y * 2) / 2 : y);
  inp.lastCheck = r; inp.itemPos = { x: x, y: y };
  if (id === 'downgrade') { inp.itemPos = { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 }; w.showItemRange({ x: inp.itemPos.x, y: inp.itemPos.y, radius: it.radius, color: '#ff9a3d', ok: r.ok }); }
  else if (id === 'isolator') w.showItemRange({ x: g.tx(ti), y: g.ty(ti), radius: 0.62, color: '#ff4f5f', ok: r.ok });
  else if (id === 'restore') w.showItemRange({ x: g.tx(ti), y: g.ty(ti), radius: 0.7, color: '#6dffe9', ok: r.ok });
  if (r.pv && (r.ok || r.sealed)) { if (r.ok) w.setPreview(r.pv); else w.clearPreview(); } else w.clearPreview();
  if (r.ok) {
    var txt = it.name + '：点击确认'; if (r.pv) { var ch = []; g.entrances.forEach(function (en) { var rr = r.pv.routes[en.id]; if (rr && rr.changed) ch.push(en.id + ' ' + (rr.zones.slice(0, -1).join('→') || '改道') + '（' + (rr.deltaCost >= 0 ? '+' : '') + rr.deltaCost.toFixed(1) + '）'); }); txt += ch.length ? '\n路线变化：\n' + ch.join('\n') : '\n路线不变'; }
    ui().setTip(txt, 'ok', cx, cy);
  } else ui().setTip(r.msg, 'bad', cx, cy);
}

function tryPlace(ti, cx, cy) {
  var m = M(), g = m.game, w = m.world, kind = inp.armed;
  var x = g.tx(ti), y = g.ty(ti), r = g.canPlace(kind, x, y);
  if (!r.ok) {
    ui().toast(r.msg, 'bad'); sfxErr(); if (r.sealed) w.flashDeny(r.tiles, r.msg);
    return false;
  }
  if (kind === 'interceptor') { // 设置朝向
    inp.mode = 'facing'; inp.confirm = { kind: kind, x: x, y: y, idx: ti }; inp.facing = defaultFace(kind, x, y); w.hoverTile = ti; facingPreview(cx, cy); ui().refreshCards(); return true;
  }
  if (r.isolates) { // 隔离节点需要确认
    inp.mode = 'confirm'; inp.confirm = { kind: kind, x: x, y: y, idx: ti, pv: r.pv };
    w.setGhost(kind, x, y, true, 0); w.setPreview(r.pv);
    ui().showConfirm({ kind: kind, idx: ti, pv: r.pv, cost: r.cost }, function () { confirmPlace(); }, function () { inp.cancel(); });
    ui().hideTip(); return true;
  }
  var res = g.deploy(kind, x, y, 0);
  finishPlace(res, kind);
  return true;
}
function confirmPlace() {
  var m = M(), g = m.game, c = inp.confirm; if (!c) return;
  var res = g.deploy(c.kind, c.x, c.y, inp.facing);
  if (!res.ok) { ui().toast(res.msg, 'bad'); if (res.sealed) m.world.flashDeny(res.tiles, res.msg); sfxErr(); inp.cancel(); return; }
  finishPlace(res, c.kind);
}
function finishPlace(res, kind) {
  var m = M(), g = m.game;
  if (!res.ok) { ui().toast(res.msg, 'bad'); sfxErr(); return; }
  if (kind === 'interceptor') res.tw.face = inp.facing;
  // 连续部署：保留手持状态（按住 Shift）
  inp.mode = 'idle'; inp.confirm = null; inp.armed = null; inp.drag = null;
  m.world.setGhost(null); m.world.hideRange(); m.world.clearPreview(); ui().hideTip(); ui().hideConfirm(); ui().refreshCards();
  m.world.setSelection(res.tw, 'tower'); ui().select('tower', res.tw);
}
inp.confirmNow = function () { if (inp.mode === 'confirm') confirmPlace(); };

function onDown(e) {
  if (G.exportActive) return;   // 视频导出期间忽略真实输入，对局只由 videoExport 推进
  var m = M(); if (!m || m.inMenu) return;
  if (e.button === 1) { e.preventDefault(); mouse.mid = true; G.camMidDown = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.shift = e.shiftKey; try { e.target.setPointerCapture(e.pointerId); } catch (x) {} return; }
  if (e.button === 2) { if (!inp.cancel()) { m.world.setSelection(null); ui().select(null); } return; }
  if (e.button !== 0) return;
  if (m.demo && m.demo.active) return;
  inp.leftClick(e.clientX, e.clientY);
}
inp.hover = function (cx, cy) { hoverUpdate(cx, cy); };
inp.leftClick = function (cx, cy) {
  var m = M(), w = m.world;
  if (inp.mode === 'armed') { var ti = w.tileAt(cx, cy); if (ti >= 0) tryPlace(ti, cx, cy); return; }
  if (inp.mode === 'facing') { var c = inp.confirm; var res = m.game.deploy(c.kind, c.x, c.y, inp.facing); finishPlace(res, c.kind); return; }
  if (inp.mode === 'item') { useItemAt(cx, cy); return; }
  if (inp.mode === 'confirm') return;
  // 选中
  var en = w.enemyAt(cx, cy);
  if (en) { w.setSelection(en, 'enemy'); ui().select('enemy', en); return; }
  var tw = w.towerAtScreen(cx, cy), ti2 = w.tileAt(cx, cy);
  if (ti2 >= 0 && m.game.towerAt[ti2]) tw = m.game.towerAt[ti2];
  if (tw) { w.setSelection(tw, 'tower'); ui().select('tower', tw); return; }
  if (ti2 >= 0) { w.setSelection(ti2, 'tile'); ui().select('tile', ti2); return; }
  w.setSelection(null); ui().select(null);
}
function useItemAt(cx, cy) {
  var m = M(), g = m.game, w = m.world, id = inp.item, ti = w.tileAt(cx, cy);
  if (ti < 0) return;
  var x = g.tx(ti), y = g.ty(ti);
  if (id === 'downgrade' && inp.itemPos) { x = inp.itemPos.x; y = inp.itemPos.y; }
  var r = g.useItem(id, x, y);
  if (!r.ok) { ui().toast(r.msg, 'bad'); sfxErr(); if (r.sealed) w.flashDeny(r.tiles, r.msg); return; }
  inp.cancel();
}
function onMove(e) {
  if (G.exportActive) return;   // 视频导出期间忽略真实输入，对局只由 videoExport 推进
  var m = M(); if (!m) return;
  inp.cx = e.clientX; inp.cy = e.clientY;
  if (mouse.mid) {
    var dx = e.clientX - mouse.x, dy = e.clientY - mouse.y; mouse.x = e.clientX; mouse.y = e.clientY; cam.userMoved = true;
    if (e.shiftKey) { // 平移
      var f = cam.dist * 0.0016, c = Math.cos(cam.az), s = Math.sin(cam.az), p = cam.pitch * Math.PI / 180;
      cam.gtx -= (dx * c + dy * s * Math.sin(p)) * f * -1 * -1; cam.gtz -= (-dx * s + dy * c * Math.sin(p)) * f * -1 * -1;
      cam.gtx = Math.max(-4, Math.min(m.game.W + 3, cam.gtx)); cam.gtz = Math.max(-4, Math.min(m.game.H + 3, cam.gtz));
    } else { cam.gaz -= dx * 0.006; cam.gpitch = Math.max(14, Math.min(86, cam.gpitch + dy * 0.28)); }
    return;
  }
  if (m.inMenu) return;
  if (inp.mode === 'drag' && inp.drag) { var d = inp.drag; if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true; ui().dragGhost(e.clientX, e.clientY, d.moved ? G.TOWERS[d.kind] : null); }
  if (e.target && e.target.id === 'gl' || inp.mode === 'drag' || inp.mode === 'facing' || inp.mode === 'armed' || inp.mode === 'item') hoverUpdate(e.clientX, e.clientY);
  else { m.world.hoverTile = -1; }
}
function onUp(e) {
  if (G.exportActive) return;   // 视频导出期间忽略真实输入，对局只由 videoExport 推进
  var m = M(); if (!m) return;
  if (e.button === 1) { mouse.mid = false; G.camMidDown = false; return; }
  if (e.button !== 0) return;
  if (inp.mode === 'drag' && inp.drag) {
    var d = inp.drag; ui().dragGhost(0, 0, null);
    if (!d.moved) { inp.drag = null; inp.mode = 'armed'; inp.armed = d.kind; ui().refreshCards(); ui().toast('已选择「' + G.TOWERS[d.kind].name + '」：点击地图部署（右键 / Esc 取消）', 'info', 1800); return; }
    var canvas = gfx.renderer.domElement, over = document.elementFromPoint(e.clientX, e.clientY) === canvas;
    inp.drag = null;
    if (!over) { inp.cancel(); return; }
    var ti = m.world.tileAt(e.clientX, e.clientY); inp.mode = 'armed'; inp.armed = d.kind;
    if (ti < 0) { inp.cancel(); return; }
    tryPlace(ti, e.clientX, e.clientY);
    if (inp.mode === 'armed') inp.cancel();
  }
}
function onKey(e) {
  if (G.exportActive) return;   // 视频导出期间忽略真实输入，对局只由 videoExport 推进
  var m = M(); if (!m) return; var k = e.key;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (k === 'Shift') mouse.shift = true;
  if (k === 'Escape') { if (!inp.cancel()) ui().escape(); return; }
  if (m.inMenu) return;
  if (k === ' ') { e.preventDefault(); ui().togglePause(); return; }
  if (k === 'z' || k === 'Z') { m.world.zoneOn = !m.world.zoneOn; ui().toast(m.world.zoneOn ? '区域名称：常驻显示（Z 关闭）' : '区域名称：改道 / 预览时显示（Z 常驻）', 'info', 1500); return; }
  if (k === 'Home' || k === 'h' || k === 'H') { cam.userMoved = false; cam.reset(); return; }
  if (m.demo && m.demo.active) return;
  if (k === 'Enter') { if (inp.mode === 'confirm') confirmPlace(); return; }
  if (k === 'r' || k === 'R') { if (inp.mode === 'facing') { inp.facing += Math.PI / 4; hoverUpdate(inp.cx, inp.cy); } else if (G.ui.sel && G.ui.sel.type === 'tower' && G.ui.sel.obj.kind === 'interceptor') { var tw = G.ui.sel.obj; tw.face += Math.PI / 4; if (G.audio) G.audio.play('ui'); m.world.refreshRange(); } return; }
  var n = '123456'.indexOf(k); if (n >= 0 && k.length === 1) { inp.arm(G.TOWER_ORDER[n]); return; }
  var it = { q: 'isolator', w: 'downgrade', e: 'restore', Q: 'isolator', W: 'downgrade', E: 'restore' }[k]; if (it) { inp.armItem(it); return; }
  if (k === 'u' || k === 'U') { ui().quickUpgrade(); return; }
  if (k === 'f' || k === 'F') { ui().quickSkill(); return; }
  if (k === 'Delete' || k === 'x' || k === 'X') { ui().quickSell(); return; }
  if (k === 'n' || k === 'N') { ui().callWave(); return; }
  if (k === 'Tab') { e.preventDefault(); ui().cycleSpeed(); return; }
}
})(window.G = window.G || {});
