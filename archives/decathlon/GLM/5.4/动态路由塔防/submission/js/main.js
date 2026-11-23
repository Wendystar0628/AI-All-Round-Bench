/* 动态路由塔防 —— 主程序：流程、镜头、输入、拖放部署、渲染循环 */
window.G = window.G || {};
(function () {
  'use strict';
  const T = window.THREE, S = G.Sim, UI = G.UI, FX = G.FX, A = G.Audio;
  const App = {
    mode: 'menu', game: null, view: null, drag: null, itemMode: null, aim: null, acc: 0, lastT: 0, time: 0, menuOrbit: 0, selectedCell: null,
    init() {
      const container = document.getElementById('scene');
      this.view = G.View; this.view.init(container); FX.init(this.view); UI.init(this);
      this.setupInput(); this.bindKeys();
      this.buildIdleScene();
      UI.showScreen('menu'); UI.refreshBest();
      this.lastT = performance.now(); requestAnimationFrame(t => this.loop(t));
    },
    interactive() { return this.mode === 'battle' || this.mode === 'demo' || this.mode === 'export'; },
    buildIdleScene() {
      if (this.game && this.mode === 'menu') return;
      this.game = S.createGame('seg', { seed: 1 }); this.view.buildMap(this.game);
    },
    startMap(id) {
      A.init(); this.mode = 'battle'; this.itemMode = null; this.drag = null; this.aim = null;
      this.game = S.createGame(id, { seed: (Date.now() % 100000) | 0 });
      this.view.buildMap(this.game); FX.reset(); UI.setSelection(null); UI.showScreen('battle');
      A.startMusic(this.game.def.theme); A.play('click');
      UI.banner(this.game.def.name, this.game.def.intro, 'map', 4200);
    },
    toMenu() { this.mode = 'menu'; this.itemMode = null; this.drag = null; this.aim = null; this.buildIdleScene(); FX.reset(); UI.setSelection(null); UI.showScreen('menu'); UI.refreshBest(); A.stopMusic(); },
    openMenu() { if (this.mode === 'battle') { this.toMenu(); } },
    setSpeed(s) { if (this.game) { S.setSpeed(this.game, s); if (this.game.paused) S.setPaused(this.game, false); A.play('click'); } },
    togglePause() { if (!this.interactive()) return; S.setPaused(this.game, !this.game.paused); A.play('click'); },
    callNextWave() { const r = S.callNextWave(this.game); if (r.ok) A.play('wave'); else A.play('error'); },
    castSkill(id) { const r = S.castSkill(this.game, id); if (!r.ok && r.reason) { UI.toast(r.reason, 'bad'); A.play('error'); } },
    upgrade(id, branch) { const r = S.upgradeTower(this.game, id, branch); if (!r.ok && r.reason) { UI.toast(r.reason, 'bad'); A.play('error'); } },
    sell(id) { S.sellTower(this.game, id); UI.setSelection(null); },
    quickDeploy(type, cellId) { const r = S.deploy(this.game, type, cellId, 0); if (!r.ok) { UI.toast(r.reason, 'bad'); A.play('error'); } },

    // ---------- 输入 ----------
    setupInput() {
      const el = this.view.renderer.domElement; const self = this;
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('pointerdown', e => {
        A.init();
        if (e.button === 1) { e.preventDefault(); this.camDrag = { x: e.clientX, y: e.clientY, pan: e.shiftKey, moved: false }; el.setPointerCapture(e.pointerId); return; }
        if (e.button === 2) { this.cancelAction(); return; }
        if (e.button === 0) { this.onLeftDown(e); }
      });
      el.addEventListener('pointermove', e => {
        if (this.camDrag) {
          const dx = e.clientX - this.camDrag.x, dy = e.clientY - this.camDrag.y; this.camDrag.x = e.clientX; this.camDrag.y = e.clientY;
          if (Math.abs(dx) + Math.abs(dy) > 1) this.camDrag.moved = true;
          const c = this.view.cam; c.userMoved = true;
          if (this.camDrag.pan) { const k = c.dist * 0.0016; const right = new T.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); const fwd = new T.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw)); c.tTarget.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k); }
          else { c.tYaw -= dx * 0.006; c.tPitch = Math.max(0.12, Math.min(1.45, c.tPitch + dy * 0.004)); }
        }
        this.onMove(e);
      });
      const endCam = e => { if (this.camDrag) { this.camDrag = null; if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } };
      el.addEventListener('pointerup', endCam); el.addEventListener('pointercancel', endCam);
      el.addEventListener('wheel', e => { e.preventDefault(); const c = this.view.cam; c.userMoved = true; c.tDist = Math.max(10, Math.min(140, c.tDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
      window.addEventListener('pointermove', e => { if (this.drag) this.moveDrag(e.clientX, e.clientY); if (this.aim) this.moveAim(e.clientX, e.clientY); });
      window.addEventListener('pointerup', e => { if (this.drag && e.button === 0) this.endDrag(e.clientX, e.clientY); });
      el.addEventListener('click', e => { if (e.button === 0 && !this.drag && !this.aim) this.onClick(e); });
      el.addEventListener('pointerleave', () => { this.view.cellHover.visible = false; UI.cursorTip(null); });
    },
    bindKeys() {
      window.addEventListener('keydown', e => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        A.init();
        const k = e.key;
        if (k === ' ') { e.preventDefault(); if (this.mode === 'demo') return; this.togglePause(); }
        else if (k === '1' || k === '2' || k === '3') this.setSpeed(parseInt(k));
        else if (k === 'f' || k === 'F') { this.view.cam.userMoved = false; this.view.defaultCam(); A.play('camera'); }
        else if (k === 'Escape') { if (this.mode === 'demo') { this.exitDemo(); return; } if (!UI.el.codex.classList.contains('hidden')) UI.closeCodex(); else if (!UI.el.settings.classList.contains('hidden')) UI.closeSettings(); else this.cancelAction(); }
        else if (k === 'm' || k === 'M') { A.setMuted(!A.muted); UI.syncAudioBtns(); }
        else if (k === 'Delete' || k === 'Backspace') { if (UI.sel && UI.sel.kind === 'tower') this.sell(UI.sel.ref.id); }
      });
    },
    cancelAction() {
      if (this.drag) { this.clearPreview(); this.drag = null; UI.ghost(0, 0, false); UI.cursorTip(null); }
      if (this.aim) { this.clearPreview(); this.aim = null; UI.ghost(0, 0, false); UI.cursorTip(null); }
      if (this.itemMode) { this.itemMode = null; this.clearPreview(); UI.cursorTip(null); }
      this.view.cam.userMoved = false; this.view.defaultCam();
    },
    onLeftDown(e) {
      if (!this.interactive()) return;
      if (this.aim) { this.confirmAim(); return; }
      if (this.itemMode) { this.placeItem(e); return; }
      if (this.camDrag) return;
    },
    onClick(e) {
      if (!this.interactive()) return;
      const u = this.view.pick(e.clientX, e.clientY);
      if (u) { UI.setSelection({ kind: u.kind, ref: u.ref }); A.play('click'); this.view.selected = u.ref; return; }
      const c = this.view.cellAtScreen(e.clientX, e.clientY);
      if (c) { UI.setSelection({ kind: 'cell', ref: c }); A.play('click'); this.view.selected = c; }
      else { UI.setSelection(null); this.view.selected = null; }
    },
    onMove(e) {
      if (!this.interactive()) return;
      if (this.drag || this.aim || this.itemMode) return;
      const c = this.view.cellAtScreen(e.clientX, e.clientY);
      this.view.cellHover.visible = !!c; if (c) { this.view.cellHover.position.set(c.wx, c.wy + 0.04, c.wz); }
      const u = this.view.pick(e.clientX, e.clientY); this.view.hoverTower = u && u.kind === 'tower' ? u.ref : null;
      if (u) { const r = u.kind === 'tower' ? G.TOWERS[u.ref.type].name + ' ' + u.ref.level + ' 级 · ' + Math.max(0, u.ref.hp).toFixed(0) + '/' + u.ref.maxHp : G.ENEMIES[u.ref.type].name + ' · ' + Math.max(0, u.ref.hp).toFixed(0) + '/' + u.ref.maxHp.toFixed(0) + (u.ref.revealed ? '' : ' · 伪装'); UI.cursorTip(r, 'info'); UI.el['cursor-tip'].style.left = (e.clientX + 16) + 'px'; UI.el['cursor-tip'].style.top = (e.clientY + 18) + 'px'; }
      else UI.cursorTip(null);
    },
    // ---------- 拖放部署 ----------
    beginDrag(type, e) {
      if (!this.interactive()) return;
      A.init(); A.play('drag');
      this.drag = { type, x: e.clientX, y: e.clientY, valid: false, cell: null };
      UI.ghost(e.clientX, e.clientY, true, '<div class="ghost-card">' + UI.icon(type) + '<span>' + G.TOWERS[type].name + '</span></div>');
      this.moveDrag(e.clientX, e.clientY);
    },
    moveDrag(x, y) {
      if (!this.drag) return; this.drag.x = x; this.drag.y = y; UI.ghost(x, y, true);
      const c = this.view.cellAtScreen(x, y); const v = this.view;
      if (!c) { this.clearPreview(); UI.cursorTip(null); return; }
      const r = S.previewDeploy(this.game, this.drag.type, c.id); this.drag.cell = c; this.drag.valid = r.ok; this.drag.result = r;
      v.cellHover.visible = true; v.cellHover.position.set(c.wx, c.wy + 0.04, c.wz); v.cellHover.material.color.setHex(r.ok ? 0x7dffb2 : 0xff3030); v.cellHover.material.opacity = r.ok ? 0.3 : 0.35;
      this.showRange(this.drag.type, c, r.ok ? 0x7dffb2 : 0xff3030);
      if (r.routes) v.routes.setPreview(r.routes); else v.routes.setPreview(null);
      const d = G.TOWERS[this.drag.type]; const cost = d.cost + 'λ' + (c.type === 'node' && d.nodeIntel ? ' + ' + d.nodeIntel + '◇' : '');
      UI.cursorTip(r.ok ? (d.name + ' · ' + cost + (c.type === 'node' ? ' · 松开以确认，预览新路线' : '')) : r.reason, r.ok ? 'ok' : 'bad'); UI.el['cursor-tip'].style.left = (x + 18) + 'px'; UI.el['cursor-tip'].style.top = (y + 22) + 'px';
    },
    endDrag(x, y) {
      const d = this.drag; if (!d) return;
      if (d.valid && d.cell) {
        if (d.type === 'interceptor') { this.aim = { type: d.type, cell: d.cell, x, y }; this.drag = null; UI.cursorTip('移动鼠标设定朝向，左键确认，右键取消', 'ok'); this.moveAim(x, y); A.play('click'); return; }
        const r = S.deploy(this.game, d.type, d.cell.id, 0); if (!r.ok) { UI.toast(r.reason, 'bad'); A.play('error'); }
        this.drag = null; this.clearPreview(); UI.ghost(0, 0, false); UI.cursorTip(null);
      } else { if (d.cell && d.result && d.result.reason) { UI.toast(d.result.reason, 'bad'); A.play('error'); } this.drag = null; this.clearPreview(); UI.ghost(0, 0, false); UI.cursorTip(null); }
    },
    moveAim(x, y) {
      if (!this.aim) return; const v = this.view; const c = this.aim.cell; const p = v.groundPoint(x, y) || { x: c.wx, z: c.wz + 1 };
      const ang = Math.atan2(-(p.z - c.wz), p.x - c.wx); this.aim.facing = ang;
      v.arc.visible = true; v.arc.position.set(c.wx, c.wy + 0.07, c.wz); v.arc.rotation.z = ang; v.arc.scale.setScalar(G.TOWERS.interceptor.range * S.CELL); v.arc.material.opacity = 0.22;
      v.rangeRing.visible = true; v.rangeRing.position.set(c.wx, c.wy + 0.06, c.wz); v.rangeRing.scale.setScalar(G.TOWERS.interceptor.range * S.CELL); v.rangeRing.material.color.setHex(0x59c8ff);
      v.cellHover.visible = true; v.cellHover.position.set(c.wx, c.wy + 0.04, c.wz);
      UI.ghost(x, y, true, '<div class="ghost-card aim">' + UI.icon('interceptor') + '<span>设定朝向</span></div>');
    },
    confirmAim() {
      const a = this.aim; if (!a) return; const r = S.deploy(this.game, a.type, a.cell.id, a.facing); if (!r.ok) { UI.toast(r.reason, 'bad'); A.play('error'); }
      this.aim = null; this.clearPreview(); UI.ghost(0, 0, false); UI.cursorTip(null);
    },
    // ---------- 道具 ----------
    beginItem(item) {
      if (!this.interactive()) return;
      if (this.itemMode === item) { this.itemMode = null; this.clearPreview(); return; }
      A.init(); A.play('click'); this.itemMode = item; this.clearPreview();
      const names = { node: '交换节点', path: '链路', tower: '友方塔' };
      UI.cursorTip('选择' + names[G.ITEMS[item].target] + '投放「' + G.ITEMS[item].name + '」，右键取消', 'ok');
    },
    onItemHover(x, y) {
      const item = this.itemMode; if (!item) return; const v = this.view; const c = v.cellAtScreen(x, y); const u = v.pick(x, y);
      let target = null;
      if (G.ITEMS[item].target === 'tower') target = u && u.kind === 'tower' ? u.ref : null; else target = c;
      if (!target) { this.clearAoe(); UI.el['cursor-tip'].style.left = (x + 18) + 'px'; UI.el['cursor-tip'].style.top = (y + 22) + 'px'; return; }
      const r = S.previewItem(this.game, item, G.ITEMS[item].target === 'tower' ? target.id : target.id);
      const pos = G.ITEMS[item].target === 'tower' ? target : target;
      if (item === 'downgrade') { this.showAoe(r.cells || [], 0xffb040); v.rangeRing.visible = true; v.rangeRing.position.set(pos.x != null ? pos.x : pos.wx, (pos.y != null ? pos.y : pos.wy) + 0.06, pos.z != null ? pos.z : pos.wz); v.rangeRing.scale.setScalar(G.ITEMS.downgrade.radius * S.CELL); v.rangeRing.material.color.setHex(r.ok ? 0xffb040 : 0xff3030); }
      else if (item === 'isolator') { v.rangeRing.visible = true; v.rangeRing.position.set(target.wx, target.wy + 0.06, target.wz); v.rangeRing.scale.setScalar(2.2); v.rangeRing.material.color.setHex(r.ok ? 0xff8a3d : 0xff3030); if (r.routes) v.routes.setPreview(r.routes); }
      else { v.rangeRing.visible = true; v.rangeRing.position.set(target.x, target.y + 0.06, target.z); v.rangeRing.scale.setScalar(2.2); v.rangeRing.material.color.setHex(r.ok ? 0x9dff6a : 0xff3030); }
      UI.cursorTip(r.ok ? (G.ITEMS[item].name + ' · ' + G.ITEMS[item].cost + (G.ITEMS[item].kind === 'intel' ? '◇' : 'λ') + ' · 左键确认') : r.reason, r.ok ? 'ok' : 'bad'); UI.el['cursor-tip'].style.left = (x + 18) + 'px'; UI.el['cursor-tip'].style.top = (y + 22) + 'px';
    },
    placeItem(e) {
      const item = this.itemMode; if (!item) return; const v = this.view; const c = v.cellAtScreen(e.clientX, e.clientY); const u = v.pick(e.clientX, e.clientY);
      let target = null; if (G.ITEMS[item].target === 'tower') target = u && u.kind === 'tower' ? u.ref.id : null; else target = c ? c.id : null;
      if (!target) { A.play('error'); return; }
      const r = S.useItem(this.game, item, target); if (!r.ok) { UI.toast(r.reason || '无法使用', 'bad'); A.play('error'); } else { this.itemMode = null; this.clearPreview(); UI.cursorTip(null); }
    },
    showRange(type, c, color) {
      const v = this.view; const d = G.TOWERS[type]; v.arc.visible = false; v.rangeRing.visible = false; v.rangeDisc.visible = false;
      const r = d.range || d.lure; if (r) { v.rangeRing.visible = true; v.rangeRing.position.set(c.wx, c.wy + 0.06, c.wz); v.rangeRing.scale.setScalar(r * S.CELL); v.rangeRing.material.color.setHex(color); v.rangeDisc.visible = true; v.rangeDisc.position.copy(v.rangeRing.position); v.rangeDisc.scale.setScalar(r * S.CELL); v.rangeDisc.material.color.setHex(color); }
      if (type === 'interceptor') { v.arc.visible = true; v.arc.position.set(c.wx, c.wy + 0.07, c.wz); v.arc.rotation.z = 0; v.arc.scale.setScalar(d.range * S.CELL); v.arc.material.color.setHex(color); v.arc.material.opacity = 0.18; }
    },
    showAoe(cells, color) {
      const v = this.view; const m = v.aoeCells; const mtx = new T.Matrix4(); let n = 0;
      for (const id of cells) { if (n >= 64) break; const c = this.game.M.byId.get(id); mtx.makeRotationX(-Math.PI / 2); mtx.setPosition(c.wx, c.wy + 0.05, c.wz); m.setMatrixAt(n++, mtx); }
      m.count = n; m.instanceMatrix.needsUpdate = true; m.material.color.setHex(color);
    },
    clearAoe() { if (this.view.aoeCells) this.view.aoeCells.count = 0; },
    clearPreview() { const v = this.view; if (!v.rangeRing) return; v.rangeRing.visible = false; v.rangeDisc.visible = false; v.arc.visible = false; this.clearAoe(); if (v.routes) v.routes.setPreview(null); v.cellHover.visible = false; },
    // ---------- 演示 ----------
    startDemo(id) { A.init(); G.Demo.start(this, id); },
    exitDemo() { G.Demo.stop(this); this.toMenu(); },
    // ---------- 循环 ----------
    loop(now) {
      requestAnimationFrame(t => this.loop(t));
      const dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now; this.time += dt;
      if (this.mode === 'export') { return; }
      if (this.mode === 'menu') { this.menuOrbit += dt * 0.08; const c = this.view.cam; c.tYaw = this.menuOrbit; c.tPitch = 0.75 + Math.sin(this.time * 0.1) * 0.08; c.tDist = 62 + Math.sin(this.time * 0.07) * 6; this.view.syncField(this.game, dt, this.time); this.view.render(dt, this.time); return; }
      const g = this.game; if (!g) return;
      if (this.mode === 'demo') { G.Demo.update(this, g, dt); }
      if (!g.paused) { this.acc += dt * g.speed; let steps = 0; while (this.acc >= S.DT && steps < 12) { S.tick(g, S.DT); this.acc -= S.DT; steps++; } if (steps >= 12) this.acc = 0; }
      this.consumeEvents(g);
      this.view.syncUnits(g, dt, g.t); this.view.syncField(g, dt, g.t); FX.update(g.paused ? 0 : dt, g.t); UI.update(dt);
      if (this.itemMode) this.onItemHover(this.lastMouse ? this.lastMouse.x : 0, this.lastMouse ? this.lastMouse.y : 0);
      this.view.render(dt, g.t);
      if (g.finished && !this._resultShown) { this._resultShown = true; setTimeout(() => { if (this.mode === 'battle') { UI.showResult(g, g.phase === 'win'); UI.showScreen('result'); } }, 2200); }
      if (!g.finished) this._resultShown = false;
    },
    consumeEvents(g) {
      const evs = g.events; if (!evs.length) return;
      for (const ev of evs) {
        FX.handle(g, ev, g.t);
        switch (ev.type) {
          case 'reject': UI.toast(ev.reason, 'bad', 3200); if (ev.cell) { const c = g.M.byId.get(ev.cell); const v = this.view; v.cellBad.visible = true; v.cellBad.position.set(c.wx, c.wy + 0.08, c.wz); clearTimeout(this._badT); this._badT = setTimeout(() => v.cellBad.visible = false, 1800); } break;
          case 'waveStart': UI.banner('第 ' + (ev.idx + 1) + ' 波 · ' + ev.label, ev.flood ? '洪峰：三个入口同时出兵' : (g.def.waves[ev.idx].groups.length > 5 ? '多入口混合流量' : ''), ev.flood ? 'flood' : 'wave'); UI._lastForecast = null; break;
          case 'waveClear': UI.toast('第 ' + (ev.idx + 1) + ' 波击退 · 情报 +' + ev.reward, 'good'); break;
          case 'routeChange': { const parts = []; for (const en of ev.entries) { const r = g.routes.byEntry[en]; const ex = g.M.byId.get(r[r.length - 1]); parts.push(en + ' → ' + (ex && ex.type === 'exit' ? ex.name : '?') + '（' + r.length + ' 格）'); } UI.toast('路线变化：' + parts.join('，'), 'route', 3400); break; }
          case 'bossWarn': UI.banner(ev.kind === 'lock' ? '蛰影 · 锁死运维环' : '蜃楼 · 伪路由', ev.kind === 'lock' ? '前方链路即将被锁死，各入口将重新收敛' : '前方链路即将出现路由黑洞', 'warn', 2600); break;
          case 'bossPhase': UI.banner(ev.enemy.def.name + ' · ' + ({ escalate: '提权', destroy: '破坏阶段', spawn: '释放蠕虫', storm: '路由风暴' }[ev.phase] || ev.phase), ev.phase === 'storm' ? '附近塔的护盾被削弱' : ev.phase === 'spawn' ? '成群蠕虫涌出' : ev.phase === 'escalate' ? '护甲强化并放出木马' : '', 'warn', 2600); break;
          case 'bossDie': break;
          case 'isolatorEnd': break;
          case 'intelHold': break;
          case 'spawn': if (ev.enemy.def.boss) UI.banner('Boss 登场 · ' + ev.enemy.def.name, ev.enemy.def.title, 'boss', 3200); break;
        }
      }
      g.events.length = 0;
    },
  };
  window.addEventListener('pointermove', e => { App.lastMouse = { x: e.clientX, y: e.clientY }; });
  G.App = App;
})();
