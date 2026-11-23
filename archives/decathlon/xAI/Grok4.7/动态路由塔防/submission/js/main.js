/* 输入、主循环、演示驱动和 videoExport。战斗时间只来自这里传入的 dt。 */
(function (root) {
  'use strict';
  var TD = root.TD;
  var THREE = root.THREE;
  var canvas = document.getElementById('view');
  var view = TD.createView(canvas, document.getElementById('floats'));
  var G = {
    screen: 'title', battle: null, demo: null, queue: null,
    paused: false, speed: 1, sel: null, aim: null, drag: null,
    pointer: { x: 0, y: 0 }, press: null, baseRoutes: {},
    exporting: false, sealFlash: null, seed: 3, audioReady: false, last: 0, raf: 0
  };
  var keys = {};
  var orbit = null;
  var exportFps = 30, exportIndex = -1, exportRun = null;
  var ui;

  function snapRoutes(b) {
    var o = {};
    Object.keys(b.routes).forEach(function (id) {
      o[id] = b.routes[id] ? b.routes[id].path.join('|') : '';
    });
    return o;
  }

  function state() {
    return {
      screen: G.screen, battle: G.battle, demo: G.demo, paused: G.paused,
      speed: G.speed, sel: G.sel, aim: G.aim, baseRoutes: G.baseRoutes,
      previewKey: G.drag && G.drag.active ? (G.drag.cx + ',' + G.drag.cy) : ''
    };
  }

  function stepSim(dt) {
    if (!G.battle || dt <= 0) return;
    var left = dt;
    while (left > 1e-6) {
      var h = Math.min(0.1, left);
      G.battle.update(h);
      left -= h;
    }
  }

  function paint() {
    view.sync(G.battle, computeGuides(), G.battle ? G.battle.time : 0);
    view.render();
    ui.sync(state());
  }

  function adopt(b) {
    G.battle = b;
    G.baseRoutes = snapRoutes(b);
    G.sel = null;
    G.aim = null;
    G.drag = null;
    G.paused = false;
    G.sealFlash = null;
    view.load(b);
    ui.bindBattle(b);
    TD.audio.setMap(b.map.id);
    G.screen = 'battle';
  }

  function showSelect() {
    G.screen = 'select';
    G.paused = false;
    var nodes = document.querySelectorAll('.modal');
    for (var i = 0; i < nodes.length; i++) nodes[i].style.display = 'none';
  }

  function stopDemo() {
    G.demo = null;
    G.queue = null;
    G.drag = null;
    G.aim = null;
    ui.setCursor(0, 0, false);
    ui.setSubtitle('');
    ui.setGhost('', 0, 0, false);
  }

  function bootDemo(id) {
    var def = TD.demoById(id);
    if (!def) return;
    var b = TD.createBattle(TD.mapById(def.map), 7);
    def.setup(b);
    adopt(b);
    G.demo = new TD.DemoPlayer(def, api);
    G.demo.present(0);
  }

  function finishDemo() {
    var q = G.queue ? G.queue.slice() : null;
    G.demo = null;
    G.drag = null;
    ui.setCursor(0, 0, false);
    ui.setSubtitle('');
    ui.setGhost('', 0, 0, false);
    if (G.exporting) return;
    if (q && q.length) {
      G.queue = q;
      bootDemo(G.queue.shift());
      return;
    }
    G.queue = null;
    showSelect();
  }

  function cellFromPointer(x, y) {
    var hit = view.pick(x, y);
    if (!hit || !G.battle) return null;
    if (hit.kind === 'cell') return hit;
    if (hit.kind === 'tower') {
      var t = G.battle.towerById(hit.id);
      return t ? { kind: 'cell', c: t.c, r: t.r } : null;
    }
    if (hit.kind === 'holder') return null;
    if (hit.kind === 'enemy') {
      var e = G.battle.enemyById(hit.id);
      return e ? { kind: 'cell', c: e.c, r: e.r } : null;
    }
    return null;
  }

  function selectHit(hit) {
    if (!hit || !G.battle) { G.sel = null; return; }
    if (hit.kind === 'tower' || hit.kind === 'enemy') { G.sel = { kind: hit.kind, id: hit.id }; return; }
    if (hit.kind === 'cell') {
      var tower = G.battle.towerAt(hit.c, hit.r);
      if (tower) { G.sel = { kind: 'tower', id: tower.id }; return; }
      var best = null, bd = 0.8;
      G.battle.enemies.forEach(function (e) {
        if (!G.battle.living(e) || e.flying) return;
        var d = Math.hypot(e.x / TD.CELL - hit.c, e.z / TD.CELL - hit.r);
        if (d < bd) { bd = d; best = e; }
      });
      G.sel = best ? { kind: 'enemy', id: best.id } : { kind: 'cell', c: hit.c, r: hit.r };
    }
  }

  function beginDrag(card, x, y) {
    G.aim = null;
    var tower = card.getAttribute('data-card');
    var item = card.getAttribute('data-item');
    G.drag = {
      kind: tower ? 'tower' : 'item',
      id: tower || item,
      name: tower ? TD.TOWERS[tower].name : TD.ITEMS[item].name,
      sx: x, sy: y, x: x, y: y, active: false, cx: null, cy: null
    };
  }

  function moveDrag(x, y) {
    if (!G.drag) return;
    G.drag.x = x; G.drag.y = y;
    if (!G.drag.active && Math.hypot(x - G.drag.sx, y - G.drag.sy) > 6) G.drag.active = true;
    var cell = cellFromPointer(x, y);
    G.drag.cx = cell ? cell.c : null;
    G.drag.cy = cell ? cell.r : null;
    ui.setGhost(G.drag.name, x, y, G.drag.active);
  }

  function endDrag(x, y) {
    var drag = G.drag;
    G.drag = null;
    ui.setGhost('', 0, 0, false);
    if (!drag || !drag.active || !G.battle) return;
    var cell = cellFromPointer(x, y);
    if (!cell) return;
    if (drag.kind === 'item') {
      var res = G.battle.useItem(drag.id, cell.c, cell.r);
      if (res && res.sealed) G.sealFlash = { cells: res.sealed, until: G.battle.time + 2.4 };
      return;
    }
    if (drag.id === 'intercept') {
      var chk = G.battle.canPlace('intercept', cell.c, cell.r);
      if (!chk.ok) {
        if (chk.sealed) G.sealFlash = { cells: chk.sealed, until: G.battle.time + 2.4 };
        return;
      }
      G.aim = { type: 'intercept', c: cell.c, r: cell.r, facing: 0 };
      return;
    }
    var placed = G.battle.place(drag.id, cell.c, cell.r, 0);
    if (placed && placed.sealed) G.sealFlash = { cells: placed.sealed, until: G.battle.time + 2.4 };
  }

  function aimMove(x, y) {
    if (!G.aim) return;
    var hit = view.groundPoint(x, y, 0.8);
    if (!hit) return;
    G.aim.facing = Math.atan2(hit.x - G.aim.c * TD.CELL, hit.z - G.aim.r * TD.CELL);
  }

  function confirmAim() {
    if (!G.aim || !G.battle) return;
    var a = G.aim;
    G.aim = null;
    var placed = G.battle.place(a.type, a.c, a.r, a.facing);
    if (placed && placed.sealed) G.sealFlash = { cells: placed.sealed, until: G.battle.time + 2.4 };
  }

  function onPointer(type, x, y, ev) {
    ev = ev || {};
    G.pointer.x = x; G.pointer.y = y;
    if ((G.demo || G.exporting) && !ev.synthetic) return;
    var node = document.elementFromPoint(x, y);
    if (type === 'down' && ev.button === 2) {
      G.aim = null; G.drag = null;
      ui.setGhost('', 0, 0, false);
      return;
    }
    var card = node && node.closest ? node.closest('[data-card], [data-item]') : null;
    if (type === 'down' && card && (ev.button === 0 || ev.synthetic)) {
      beginDrag(card, x, y);
      return;
    }
    if (G.drag && type === 'move') { moveDrag(x, y); return; }
    if (G.drag && type === 'up') { endDrag(x, y); return; }
    if (G.aim && type === 'move') { aimMove(x, y); return; }
    if (G.aim && type === 'up' && (ev.button === 0 || ev.synthetic)) { confirmAim(); return; }
    var button = node && node.closest ? node.closest('button, input, a, label') : null;
    if (button) {
      if (ev.synthetic && type === 'up') {
        var b = node.closest('button');
        if (b && !b.disabled) b.click();
      }
      return;
    }
    if (node && node.closest && node.closest('.panel, .sheet, .modal')) return;
    if (type === 'down' && (ev.button === 0 || ev.synthetic)) G.press = { x: x, y: y };
    if (type === 'up' && (ev.button === 0 || ev.synthetic)) {
      var dx = x - (G.press ? G.press.x : x);
      var dy = y - (G.press ? G.press.y : y);
      if (dx * dx + dy * dy < 36) selectHit(view.pick(x, y));
    }
  }

  function computeGuides() {
    var g = { sealed: [], zone: null, preview: null, range: null, hover: null, bad: false, select: null };
    var b = G.battle;
    if (!b) return g;
    if (G.sealFlash && b.time < G.sealFlash.until) g.sealed = G.sealFlash.cells.slice();
    if (G.sel && G.sel.kind === 'tower') {
      var st = b.towerById(G.sel.id);
      if (st && !st.dead) g.select = { c: st.c, r: st.r };
    } else if (G.sel && G.sel.kind === 'cell') g.select = { c: G.sel.c, r: G.sel.r };
    else if (G.sel && G.sel.kind === 'enemy') {
      var se = b.enemyById(G.sel.id);
      if (se) g.select = { c: se.c, r: se.r };
    }
    var c = null, r = null, kind = null, id = null;
    if (G.aim) { c = G.aim.c; r = G.aim.r; kind = 'tower'; id = 'intercept'; }
    else if (G.drag && G.drag.active && G.drag.cx != null) { c = G.drag.cx; r = G.drag.cy; kind = G.drag.kind; id = G.drag.id; }
    if (c == null) return g;
    g.hover = { c: c, r: r };
    var cell = b.cellAt(c, r);
    if (G.aim || (kind === 'tower' && id === 'intercept')) {
      var def = TD.TOWERS.intercept;
      g.range = { x: c * TD.CELL, z: r * TD.CELL, y: view.surfaceY(b, c, r), radius: def.range, cone: def.cone, facing: G.aim ? G.aim.facing : 0 };
    } else if (kind === 'tower' && (id === 'sandbox' || id === 'repair' || id === 'honeypot')) {
      var td = TD.TOWERS[id];
      g.range = { x: c * TD.CELL, z: r * TD.CELL, y: view.surfaceY(b, c, r), radius: id === 'honeypot' ? td.attract : td.range };
    }
    if (kind === 'tower' && cell && cell.kind === 'node' && (id === 'gate' || id === 'firewall')) {
      var node = b.nodeAt(c, r);
      if (node) {
        var prev = b.previewIsolation(node.id);
        g.preview = prev.routes;
        g.bad = !prev.ok;
        if (prev.sealed) g.sealed = g.sealed.concat(prev.sealed);
      }
    }
    if (kind === 'item' && id === 'isolator' && cell && cell.kind === 'node') {
      var node2 = b.nodeAt(c, r);
      if (node2) {
        var prev2 = b.previewIsolation(node2.id);
        g.preview = prev2.routes;
        g.bad = !prev2.ok;
        if (prev2.sealed) g.sealed = g.sealed.concat(prev2.sealed);
      }
    }
    if (kind === 'item' && id === 'downgrade') {
      var zone = b.previewDowngrade(c, r);
      g.zone = zone.cells;
      g.preview = zone.routes;
      g.bad = !zone.ok;
    }
    if (kind === 'item' && id === 'restore') {
      g.bad = !b.towerAt(c, r);
    }
    return g;
  }

  var api = {
    battle: function () { return G.battle; },
    applyCamera: function (sph) {
      view.cam.theta = sph.theta;
      view.cam.phi = sph.phi;
      view.cam.radius = sph.radius;
      view.cam.target.set(sph.tx, 0, sph.tz);
      view.applyCamera();
    },
    project: function (x, y, z) { return view.project(x, y, z); },
    pointer: function (type, x, y) { onPointer(type, x, y, { synthetic: true, button: 0 }); },
    sync: function () { ui.sync(state()); },
    setSub: function (text) { ui.setSubtitle(text); },
    setCursor: function (x, y, on) { ui.setCursor(x, y, on); }
  };

  function selectedTower() {
    if (!G.sel || G.sel.kind !== 'tower' || !G.battle) return null;
    return G.battle.towerById(G.sel.id);
  }

  var handlers = {
    screen: function (name) { G.screen = name; },
    start: function (id) { stopDemo(); G.seed += 1; adopt(TD.createBattle(TD.mapById(id), G.seed)); },
    demo: function (id) { if (G.exporting) return; G.queue = null; bootDemo(id); },
    playDemos: function () { if (G.exporting) return; G.queue = ['demo-2', 'demo-3']; bootDemo('demo-1'); },
    pauseToggle: function () { if (G.demo || G.screen !== 'battle') return; G.paused = !G.paused; },
    pause: function (v) { G.paused = !!v; },
    speed: function (n) { if (!G.demo) G.speed = n; },
    resetCam: function () { if (!G.demo) view.resetCamera(); },
    skip: function () { if (G.battle && !G.demo) G.battle.skipPrep(); },
    restart: function () {
      if (!G.battle) return;
      var id = G.battle.map.id;
      stopDemo();
      G.seed += 1;
      adopt(TD.createBattle(TD.mapById(id), G.seed));
    },
    quit: function () { stopDemo(); showSelect(); },
    skipDemo: function () { if (G.exporting) return; stopDemo(); showSelect(); },
    mute: function () { TD.audio.toggleMute(); },
    volume: function (v) { TD.audio.setVolume(v); },
    upgrade: function () {
      var t = selectedTower();
      if (!t) return;
      var res = G.battle.upgrade(t.id);
      if (res && res.needBranch) ui.openBranch(t);
    },
    branch: function (id) {
      var t = selectedTower();
      if (t) G.battle.upgrade(t.id, id);
    },
    skill: function () { var t = selectedTower(); if (t) G.battle.castSkill(t.id); },
    sell: function () { var t = selectedTower(); if (t) { G.battle.sell(t.id); G.sel = null; } }
  };

  ui = TD.createUI(handlers);

  function loop(now) {
    if (G.exporting) return;
    G.raf = root.requestAnimationFrame(loop);
    var dt = Math.min(0.1, Math.max(0, (now - G.last) / 1000 || 0));
    G.last = now;
    if (G.screen === 'title' && !G.demo) {
      view.cam.theta += dt * 0.07;
      view.applyCamera();
    }
    if (G.demo) {
      var t0 = G.demo.t;
      var t1 = Math.min(G.demo.def.duration, t0 + dt);
      G.demo.fire(t0, t1);
      stepSim(t1 - t0);
      G.demo.t = t1;
      G.demo.present(t1);
      if (t1 >= G.demo.def.duration - 1e-4) finishDemo();
    } else if (G.battle && G.screen === 'battle' && !G.paused) {
      stepSim(dt * G.speed);
    }
    paint();
    TD.audio.consume(G.screen === 'battle' ? G.battle : null);
  }

  root.addEventListener('pointerdown', function (e) {
    if (!G.audioReady) { TD.audio.resume(); G.audioReady = true; }
    if (e.button === 1 && !G.demo && !G.exporting) {
      orbit = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    onPointer('down', e.clientX, e.clientY, e);
  });
  root.addEventListener('pointermove', function (e) {
    if (orbit) {
      var dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
      orbit.x = e.clientX; orbit.y = e.clientY;
      if (e.shiftKey || keys.ShiftLeft || keys.ShiftRight) {
        var right = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 0);
        var up = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 1);
        var scale = view.cam.radius / Math.max(480, canvas.clientHeight);
        view.cam.target.addScaledVector(right, -dx * scale);
        view.cam.target.addScaledVector(up, dy * scale);
      } else {
        view.cam.theta -= dx * 0.005;
        view.cam.phi = Math.max(0.28, Math.min(1.25, view.cam.phi - dy * 0.005));
      }
      view.applyCamera();
      return;
    }
    onPointer('move', e.clientX, e.clientY, e);
  });
  root.addEventListener('pointerup', function (e) {
    if (e.button === 1) { orbit = null; return; }
    onPointer('up', e.clientX, e.clientY, e);
  });
  root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  root.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (!G.audioReady) { TD.audio.resume(); G.audioReady = true; }
    if (e.code === 'Space') { e.preventDefault(); handlers.pauseToggle(); }
    if (e.code === 'Digit1') handlers.speed(1);
    if (e.code === 'Digit2') handlers.speed(2);
    if (e.code === 'Digit3') handlers.speed(3);
    if (e.code === 'Escape') {
      if (G.aim || G.drag) { G.aim = null; G.drag = null; ui.setGhost('', 0, 0, false); return; }
      handlers.pauseToggle();
    }
  });
  root.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('wheel', function (e) {
    if (G.demo || G.exporting) return;
    e.preventDefault();
    view.cam.radius = Math.max(14, Math.min(140, view.cam.radius * Math.exp(e.deltaY * 0.001)));
    view.applyCamera();
  }, { passive: false });
  root.addEventListener('resize', function () { view.resize(); });

  function stepExport(i) {
    var t0 = (i - 1) / exportFps;
    var t1 = i / exportFps;
    G.demo.fire(t0, t1);
    stepSim(Math.max(0, t1 - t0));
    G.demo.t = t1;
    G.demo.present(t1);
  }

  root.videoExport = {
    runs: ['demo-1', 'demo-2', 'demo-3'],
    begin: function (runId, opts) {
      G.exporting = true;
      if (G.raf) root.cancelAnimationFrame(G.raf);
      TD.audio.setSuppress(true);
      exportFps = (opts && opts.fps) || 30;
      exportRun = runId;
      bootDemo(runId);
      exportIndex = 0;
      paint();
      var def = TD.demoById(runId);
      return { frames: def ? Math.round(def.duration * exportFps) : 0 };
    },
    frame: function (i) {
      if (!exportRun || !G.demo) return;
      if (i <= 0) {
        bootDemo(exportRun);
        exportIndex = 0;
        paint();
        return;
      }
      if (i !== exportIndex + 1) {
        bootDemo(exportRun);
        for (var k = 1; k <= i; k++) stepExport(k);
        exportIndex = i;
      } else {
        stepExport(i);
        exportIndex = i;
      }
      paint();
    },
    end: function () {
      G.exporting = false;
      exportRun = null;
      TD.audio.setSuppress(false);
      stopDemo();
      showSelect();
      G.last = root.performance.now();
      G.raf = root.requestAnimationFrame(loop);
    }
  };

  root.__selfTestFacing = function () {
    var notes = [];
    view.camera.position.set(0, 12, 24);
    view.camera.up.set(0, 1, 0);
    view.camera.lookAt(0, 0, 0);
    view.camera.updateMatrixWorld();
    var right = new THREE.Vector3().setFromMatrixColumn(view.camera.matrixWorld, 0);
    notes.push('screen-right x=' + right.x.toFixed(2) + ' (want > 0.8)');
    var b = TD.createBattle(TD.mapById('intranet'), 4);
    b.suppressEnd = true;
    b.phase = 'combat';
    b.spawnQ = [];
    var worm = b.spawnAt('worm', 3, 5, 'A');
    view.load(b);
    var z0 = worm.z;
    for (var i = 0; i < 25; i++) b.update(0.08);
    view.sync(b, {}, b.time);
    var moved = worm.z - z0;
    var pack = view.findNose(worm.id);
    var noseDir = null;
    if (pack) {
      var wp = new THREE.Vector3();
      var np = new THREE.Vector3();
      pack.pivot.getWorldPosition(wp);
      pack.nose.getWorldPosition(np);
      noseDir = np.sub(wp);
      noseDir.y = 0;
      if (noseDir.length() > 0.001) noseDir.normalize();
    }
    var vel = new THREE.Vector3(Math.sin(worm.yaw || 0), 0, Math.cos(worm.yaw || 0));
    var dot = noseDir ? noseDir.dot(vel) : -1;
    notes.push('worm dz=' + moved.toFixed(2) + ' nose·yaw=' + dot.toFixed(2));
    view.resetCamera();
    return { ok: moved > 0.4 && dot > 0.85 && right.x > 0.8, notes: notes };
  };

  var backdrop = TD.createBattle(TD.MAPS[0], 1);
  G.battle = backdrop;
  G.baseRoutes = snapRoutes(backdrop);
  view.load(backdrop);
  view.resize();
  ui.bindBattle(backdrop);
  G.last = root.performance.now();
  G.raf = root.requestAnimationFrame(loop);
})(window);
