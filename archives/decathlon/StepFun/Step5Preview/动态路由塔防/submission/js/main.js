/* 主程序：渲染循环、摄像机、输入、流程 */
(function (g) {
'use strict';
const TD = g.TD;
const App = TD.App = {
  screen: 'menu', canvas: null, renderer: null, cam: null,
  scene: null, sim: null, mapId: 'm1',
  lastT: 0, acc: 0, fps: 0, fpsT: 0, fpsN: 0,
  keys: {}, mouse: { x: 0, y: 0, nx: 0, ny: 0, down: false, btn: -1, lx: 0, ly: 0, moved: false },
  orbit: null, pan: null,
  hover: null, selected: null, infoTarget: null,
  drag: null, itemMode: null, facingMode: null,
  preview: null, changed: null,
  exportMode: false, exportRun: null,
  audioReady: false, settings: { master: 0.7, music: 0.5, sfx: 0.7, muted: false },
  stats: { frames: 0 }
};

function $(id) { return document.getElementById(id); }

function init() {
  App.canvas = $('gl');
  const ok = TD.Renderer.init(App.canvas);
  if (!ok) return;
  App.renderer = TD.Renderer;
  App.cam = new TD.Camera();
  resize();
  window.addEventListener('resize', resize);
  bindInput();
  TD.Audio.init(App.settings);
  TD.UI.init();
  // 菜单背景场景
  loadScene('m1');
  App.cam.pitch = 0.78; App.cam.yaw = 0.62;
  showScreen('menu');
  requestAnimationFrame(frame);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  App.renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
}
function loadScene(mapId) {
  if (App.scene && App.scene.mapDef.id === mapId) return;
  App.scene = TD.View.build(mapId);
  App.renderer.setStatic(App.scene.staticMesh);
  App.renderer.env = App.scene.env;
  const b = App.scene.bounds;
  App.cam.target = [b.cx, 4, b.cy];
  App.home = { target: [b.cx, 4, b.cy], dist: Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.86, yaw: 0.62, pitch: 0.78 };
  resetView();
}
function resetView() {
  const h = App.home;
  if (!h) return;
  App.cam.target = h.target.slice();
  App.cam.dist = h.dist; App.cam.yaw = h.yaw; App.cam.pitch = h.pitch;
}

/* ---------- 屏幕 ---------- */
function showScreen(name) {
  App.screen = name;
  for (const s of ['menu', 'levels', 'codex', 'help', 'set', 'demos', 'report']) $('scr-' + s).classList.toggle('hidden', name !== s);
  $('hud').classList.toggle('hidden', !(name === 'game' || name === 'demo'));
  $('subtitle').classList.toggle('hidden', name !== 'demo');
  if (name === 'levels') TD.UI.buildLevels();
  if (name === 'codex') TD.UI.buildCodex();
  if (name === 'help') TD.UI.buildHelp();
  if (name === 'set') TD.UI.buildSettings();
  if (name === 'demos') TD.UI.buildDemos();
}

/* ---------- 对局 ---------- */
function startGame(mapId, seed) {
  App.mapId = mapId;
  loadScene(mapId);
  App.sim = TD.Sim.create(mapId, seed || (Math.random() * 1e9 | 0));
  App.selected = null; App.infoTarget = null; App.preview = null; App.changed = null;
  App.speed = 1;
  showScreen('game');
  TD.UI.buildDeck();
  TD.UI.buildItems();
  TD.UI.refresh(true);
  TD.Audio.startMap(mapId);
  toast('战场就绪：' + App.sim.mapDef.name);
}
function restart() { startGame(App.mapId); }
function endGame() {
  if (!App.sim) return;
  showScreen('report');
  TD.UI.buildReport(App.sim.result === 'win');
}

/* ---------- 输入 ---------- */
function bindInput() {
  const cv = App.canvas;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    TD.Audio.unlock();
    App.mouse.down = true; App.mouse.btn = e.button; App.mouse.lx = e.clientX; App.mouse.ly = e.clientY; App.mouse.moved = false;
    if (e.button === 1) {
      if (e.shiftKey) App.pan = { x: e.clientX, y: e.clientY };
      else App.orbit = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', e => {
    App.mouse.px = App.mouse.x; App.mouse.py = App.mouse.y;
    App.mouse.x = e.clientX; App.mouse.y = e.clientY;
    App.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
    App.mouse.ny = 1 - (e.clientY / window.innerHeight) * 2;
    if (App.mouse.down && (Math.abs(e.clientX - App.mouse.lx) > 3 || Math.abs(e.clientY - App.mouse.ly) > 3)) App.mouse.moved = true;
    if (App.orbit) {
      App.cam.yaw -= (e.clientX - App.orbit.x) * 0.006;
      App.cam.pitch = Math.max(0.12, Math.min(1.5, App.cam.pitch + (e.clientY - App.orbit.y) * 0.005));
      App.orbit.x = e.clientX; App.orbit.y = e.clientY;
    } else if (App.pan) {
      const s = App.cam.dist * 0.0016;
      const dx = (e.clientX - App.pan.x), dy = (e.clientY - App.pan.y);
      App.cam.target[0] -= (App.cam.right[0] * dx - App.cam.up[0] * dy) * s;
      App.cam.target[2] -= (App.cam.right[2] * dx - App.cam.up[2] * dy) * s;
      App.pan.x = e.clientX; App.pan.y = e.clientY;
    }
    if (App.drag) updateDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', e => {
    if (App.orbit) App.orbit = null;
    if (App.pan) App.pan = null;
    if (App.drag) { finishDrag(e.clientX, e.clientY); }
    else if (App.mouse.down && e.button === 0 && !App.mouse.moved && App.screen === 'game') onClick(e.clientX, e.clientY);
    App.mouse.down = false; App.mouse.btn = -1;
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.12 : 0.89;
    if (App.facingMode) { rotateFacing(e.deltaY > 0 ? 1 : -1); return; }
    App.cam.dist = Math.max(40, Math.min(600, App.cam.dist * f));
  }, { passive: false });
  window.addEventListener('keydown', e => {
    TD.Audio.unlock();
    App.keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); if (App.screen === 'game') togglePause(); }
    if (e.code === 'KeyF' && App.screen === 'game') cycleSpeed();
    if (e.code === 'Home') resetView();
    if (e.code === 'Escape') { if (App.facingMode) cancelFacing(); else if (App.itemMode) App.itemMode = null; else if (App.screen === 'game') togglePause(); else if (App.screen !== 'menu') showScreen('menu'); }
    if (App.facingMode && (e.code === 'KeyR')) rotateFacing(1);
    if (App.screen === 'game' && !App.facingMode) {
      const k = e.key;
      for (const id in TD.DATA.TOWERS) { const d = TD.DATA.TOWERS[id]; if (d.hotkey === k) { startDragCard(id, null); } }
      for (const id in TD.DATA.ITEMS) { const d = TD.DATA.ITEMS[id]; if (d.key === k) startItem(id); }
    }
  });
  window.addEventListener('keyup', e => { App.keys[e.code] = false; });
}

/* ---------- 拾取 ---------- */
function screenToGround(cx, cy, planeY) {
  const r = App.cam.ray((cx / window.innerWidth) * 2 - 1, 1 - (cy / window.innerHeight) * 2, window.innerWidth / window.innerHeight);
  if (Math.abs(r.d[1]) < 1e-6) return null;
  const t = (planeY - r.o[1]) / r.d[1];
  if (t < 0) return null;
  return [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t];
}
function pickSpot(cx, cy) {
  const p0 = screenToGround(cx, cy, 0);
  const p7 = screenToGround(cx, cy, 7.6);
  const out = { ground: p0, plat: p7, best: null };
  if (!App.sim) return out;
  const G = App.sim.G, mapDef = App.sim.mapDef;
  let best = null, bd = 1e9;
  // 平台
  for (const pf of mapDef.platforms) {
    if (!p7) break;
    const d = Math.hypot(p7[0] - pf.x, p7[1] - pf.y);
    if (d < 8 && d < bd) { bd = d; best = { kind: 'platform', x: pf.x, y: pf.y, z: 7, key: 'pf:' + pf.x + ',' + pf.y }; }
  }
  // 链路部署点
  if (p0) {
    for (const pt of G.points) {
      const d = Math.hypot(p0[0] - pt.x, p0[1] - pt.y);
      if (d < 7 && d < bd) { bd = d; best = { kind: 'link', x: pt.x, y: pt.y, z: 0, key: pt.key, point: pt }; }
    }
    // 交换节点
    for (const n of mapDef.nodes) {
      if (n.kind === 'entry' || n.kind === 'exit') continue;
      const d = Math.hypot(p0[0] - n.x, p0[1] - n.y);
      if (d < 9 && d < bd) { bd = d; best = { kind: 'node', x: n.x, y: n.y, z: 0, key: 'nd:' + n.id, nodeId: n.id, node: n }; }
    }
  }
  out.best = best;
  return out;
}
function pickTower(cx, cy) {
  const pk = pickSpot(cx, cy);
  if (pk.best) {
    const t = App.sim.towerAt.get(pk.best.key);
    if (t && !t.dead) return t;
  }
  return null;
}
function pickEnemy(cx, cy) {
  const p0 = screenToGround(cx, cy, 1.6);
  if (!p0 || !App.sim) return null;
  let best = null, bd = 9;
  for (const en of App.sim.enemies) {
    if (en.dead || en.leaked) continue;
    const d = Math.hypot(p0[0] - en.x, p0[1] - en.y);
    if (d < bd) { bd = d; best = en; }
  }
  return best;
}
function onClick(cx, cy) {
  if (!App.sim) return;
  if (App.itemMode) { applyItem(cx, cy); return; }
  if (App.facingMode) { confirmFacing(cx, cy); return; }
  const en = pickEnemy(cx, cy);
  if (en) { App.selected = null; App.infoTarget = en; TD.UI.showEnemy(en); TD.Audio.click(); return; }
  const t = pickTower(cx, cy);
  if (t) { App.infoTarget = null; App.selected = t; TD.UI.showTower(t); TD.Audio.click(); return; }
  const pk = pickSpot(cx, cy);
  if (pk.best) { App.selected = null; App.infoTarget = pk.best; TD.UI.showTerrain(pk.best); TD.Audio.click(); return; }
  App.selected = null; App.infoTarget = null; TD.UI.hidePanels();
}

/* ---------- 部署 ---------- */
function startDragCard(type, fromEl) {
  if (!App.sim) return;
  const d = TD.DATA.TOWERS[type];
  if (App.sim.compute < d.cost) { toast('算力不足'); TD.Audio.deny(); return; }
  App.drag = { type, el: fromEl, ghost: null };
  document.body.style.cursor = 'crosshair';
}
function updateDrag(cx, cy) {
  if (!App.drag) return;
  if (!App.drag.ghost) {
    const gh = document.createElement('div');
    gh.className = 'drag-ghost';
    gh.innerHTML = '<div class="nm">' + TD.DATA.TOWERS[App.drag.type].name + '</div><div class="cost">' + TD.DATA.TOWERS[App.drag.type].cost + ' 算力</div>';
    document.body.appendChild(gh);
    App.drag.ghost = gh;
  }
  App.drag.ghost.style.left = cx + 'px';
  App.drag.ghost.style.top = cy + 'px';
  const pk = pickSpot(cx, cy);
  App.hover = pk.best;
}
function finishDrag(cx, cy) {
  const d = App.drag;
  App.drag = null;
  document.body.style.cursor = '';
  if (d.ghost) d.ghost.remove();
  const pk = pickSpot(cx, cy);
  const type = d.type, def = TD.DATA.TOWERS[type];
  if (!pk.best) { TD.Audio.deny(); return; }
  const spot = pk.best;
  if (spot.kind === 'platform' && !def.onPlatform) { toast('该设备只能部署在设备平台'); TD.Audio.deny(); return; }
  if (spot.kind === 'link' && !def.onLink) { toast('该设备只能部署在链路或平台'); TD.Audio.deny(); return; }
  if (spot.kind === 'node' && !def.onNode) { toast('该设备只能部署在交换节点'); TD.Audio.deny(); return; }
  if (App.sim.towerAt.get(spot.key)) { toast('该位置已有设备'); TD.Audio.deny(); return; }
  if (spot.kind === 'node') {
    // 预览改道
    const chk = TD.Sim.canChange(App.sim, spot.nodeId);
    if (!chk.ok) { toast(chk.why === 'entry' ? '会封死入口，操作被拒绝' : '会让场上敌人无路可走'); TD.Audio.deny(); return; }
    App.preview = previewRoutes(spot.nodeId);
    const t = TD.Sim.placeTower(App.sim, type, spot, def.facing ? 0 : null);
    if (t) {
      TD.Audio.build();
      App.selected = t; TD.UI.showTower(t);
      toast(spot.node.name + ' 已隔离 · 路线重新收敛');
      TD.UI.refresh();
    }
    App.preview = null;
    return;
  }
  const t = TD.Sim.placeTower(App.sim, type, spot, def.facing ? 0 : null);
  if (!t) { TD.Audio.deny(); return; }
  TD.Audio.build();
  if (def.facing) { App.facingMode = { tower: t }; toast('设定拦截器朝向：点击方向或按 R / 滚轮'); }
  else { App.selected = t; TD.UI.showTower(t); }
  TD.UI.refresh();
}
function previewRoutes(nodeId) {
  const st = App.sim;
  const iso = new Set(st.isolated); iso.add(nodeId);
  const rs = { isolated: iso, down: st.down, black: st.black, locked: st.locked, pref: {} };
  for (const n of st.mapDef.nodes) if (n.kind === 'entry') rs.pref[n.id] = TD.Sim.prefFor(st, n.id);
  return TD.Route.entryRoutes(st.G, st.mapDef, rs, st.assign);
}
function rotateFacing(dir) {
  if (!App.facingMode) return;
  const t = App.facingMode.tower;
  t.facing += dir * Math.PI / 8;
}
function confirmFacing(cx, cy) {
  const p = screenToGround(cx, cy, 0);
  if (p) {
    const t = App.facingMode.tower;
    t.facing = Math.atan2(p[1] - t.y, p[0] - t.x);
  }
  const t = App.facingMode.tower;
  App.facingMode = null;
  App.selected = t; TD.UI.showTower(t);
  TD.Audio.click();
}
function cancelFacing() { App.facingMode = null; toast('已取消朝向设定'); }

/* ---------- 道具 ---------- */
function startItem(id) {
  const it = TD.DATA.ITEMS[id];
  const st = App.sim;
  const res = it.res === 'intel' ? st.intel : st.compute;
  if (res < it.cost) { toast((it.res === 'intel' ? '情报' : '算力') + '不足'); TD.Audio.deny(); return; }
  App.itemMode = { id };
  toast('选择目标：' + it.name);
}
function applyItem(cx, cy) {
  const st = App.sim, it = TD.DATA.ITEMS[App.itemMode.id];
  const pk = pickSpot(cx, cy);
  let r = null;
  if (it.target === 'node') {
    if (pk.best && pk.best.kind === 'node') r = TD.Sim.useIsolator(st, pk.best.nodeId);
    else { toast('需要选择交换节点'); TD.Audio.deny(); return; }
  } else if (it.target === 'tower') {
    const t = pickTower(cx, cy);
    if (t) r = TD.Sim.useRestore(st, t);
    else { toast('需要选择一座塔'); TD.Audio.deny(); return; }
  } else {
    const p = screenToGround(cx, cy, 0);
    if (p) r = TD.Sim.useDowngrade(st, p[0], p[1]);
  }
  App.itemMode = null;
  if (r && r.ok) { TD.Audio.item(); toast(it.name + ' 已生效'); TD.UI.refresh(); }
  else { toast((r && r.msg) || '无法使用'); TD.Audio.deny(); }
}

/* ---------- 暂停/速度 ---------- */
function togglePause() {
  if (!App.sim) return;
  App.sim.paused = !App.sim.paused;
  $('btn-pause').classList.toggle('on', App.sim.paused);
  $('btn-pause').textContent = App.sim.paused ? '▶' : '⏸';
  TD.Audio.click();
}
function cycleSpeed() {
  if (!App.sim) return;
  App.sim.speed = App.sim.speed >= 3 ? 1 : App.sim.speed + 1;
  $('btn-speed').textContent = App.sim.speed + '×';
  TD.Audio.click();
}

/* ---------- 主循环 ---------- */
function frame(tms) {
  requestAnimationFrame(frame);
  const now = tms / 1000;
  let dt = App.lastT ? now - App.lastT : 0.016;
  App.lastT = now;
  if (dt > 0.25) dt = 0.25;
  App.fpsN++; App.fpsT += dt;
  if (App.fpsT > 0.5) { App.fps = Math.round(App.fpsN / App.fpsT); App.fpsN = 0; App.fpsT = 0; $('fps').textContent = App.fps + 'fps'; }
  const active = (App.screen === 'game' || App.screen === 'demo');
  if (App.screen === 'menu' || App.screen === 'levels' || App.screen === 'codex' || App.screen === 'help' || App.screen === 'set' || App.screen === 'demos') {
    App.cam.yaw += dt * 0.045;
  }
  if (active && App.sim && !App.exportMode) {
    const sp = App.sim.paused ? 0 : App.sim.speed;
    if (sp > 0) {
      App.acc += dt * sp;
      let n = 0;
      while (App.acc >= TD.Sim.STEP && n < 8) { TD.Sim.step(App.sim, TD.Sim.STEP); App.acc -= TD.Sim.STEP; n++; }
      if (n >= 8) App.acc = 0;
    }
    if (App.sim.waveState === 'won' || App.sim.waveState === 'lost') {
      if (!App.endT) App.endT = now;
      else if (now - App.endT > 1.6) { App.endT = null; endGame(); }
    }
    TD.UI.refresh();
  }
  draw();
}
function draw() {
  const cam = App.cam, sc = App.scene;
  if (!sc) return;
  const aspect = App.renderer.w / App.renderer.h;
  const b = sc.bounds;
  const lc = [b.cx, 6, b.cy];
  const rad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.72;
  cam.update(aspect, sc.env.lightDir, lc, rad);
  let opts = { routes: true };
  if (App.sim && (App.screen === 'game' || App.screen === 'demo')) {
    opts.preview = App.preview;
    opts.changed = App.changed;
    opts.place = App.drag && App.hover ? { x: App.hover.x, y: App.hover.y, type: App.drag.type, facing: App.facingMode ? App.facingMode.tower.facing : null } : null;
    if (App.facingMode) opts.place = { x: App.facingMode.tower.x, y: App.facingMode.tower.y, type: 'interceptor', facing: App.facingMode.tower.facing, radius: 36 };
    if (App.itemMode && App.itemMode.id === 'downgrade') {
      const p = screenToGround(App.mouse.x, App.mouse.y, 0);
      if (p) opts.place = { x: p[0], y: p[1], type: 'sandbox', radius: 20 };
    }
    if (App.selected) App.selected.selected = true;
    for (const t of App.sim.towers) if (t !== App.selected) t.selected = false;
    if (App.infoTarget && App.infoTarget.def) App.infoTarget.selected = true;
    const out = TD.View.render(App.sim, cam, App.renderer, opts);
    App.renderer.render(cam, out.dyn, out.trans);
  } else {
    // 菜单背景：渲染静态场景 + 简单动态
    const A = new TD.Acc(), T = new TD.Acc();
    const st = { time: performance.now() / 1000, G: sc.G, mapDef: sc.mapDef, routes: {}, black: new Set(), isolated: new Set(), time2: 0 };
    App.renderer.render(cam, A.build(), T.build());
  }
}

/* ---------- 工具 ---------- */
function toast(text) {
  const w = $('toast-wrap');
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = text;
  w.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; }, 2200);
  setTimeout(() => d.remove(), 2700);
  while (w.children.length > 5) w.firstChild.remove();
}
TD.App.run = init;
TD.App.startGame = startGame;
TD.App.restart = restart;
TD.App.showScreen = showScreen;
TD.App.endGame = endGame;
TD.App.toast = toast;
TD.App.togglePause = togglePause;
TD.App.cycleSpeed = cycleSpeed;
TD.App.startDragCard = startDragCard;
TD.App.startItem = startItem;
TD.App.resetView = resetView;
TD.App.screenToGround = screenToGround;
TD.App.pickSpot = pickSpot;

document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
