/* 主控：启动、状态机、镜头/鼠标/键盘输入、固定步长循环、部署/道具/选中交互、演示与导出接入。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const App = ND.App = {
    state: 'menu', renderer: null, game: null, speed: 1, paused: false,
    selected: null, seenTypes: {}, _acc: 0, _last: 0, _uiTick: 0,
  };
  const REJECT_MSG = { cost: '资源不足', occupied: '该位置已有设备', terrain: '此地形不能部署该设备', already: '节点已被隔离', cooldown: '节点再隔离冷却中', block: '会封死道路，操作被拒绝', unknown: '无效操作', target: '无效目标' };

  App.init = function () {
    App.renderer = new ND.Renderer(document.getElementById('canvas-wrap'));
    ND.UI.init();
    App.bindInput();
    App.toMenu();
    App._last = performance.now();
    requestAnimationFrame(App.loop);
    // 首次手势启动音频
    const startAudio = () => { ND.Audio.init(); root.removeEventListener('pointerdown', startAudio); root.removeEventListener('keydown', startAudio); };
    root.addEventListener('pointerdown', startAudio);
    root.addEventListener('keydown', startAudio);
  };

  // ---- 状态切换 ----
  App.toMenu = function () { App.state = 'menu'; App.game = null; ND.UI.hideBattle(); ND.UI.showScreen('menu'); ND.Audio.stopMusic(); };
  App.toLevels = function () { App.state = 'menu'; App.game = null; ND.UI.hideBattle(); ND.UI.showScreen('levels'); };
  App.startBattle = function (mapId) {
    App.game = ND.createGame(mapId, { seed: (Math.random() * 1e9) | 0 });
    App.state = 'battle'; App.paused = false; App.speed = 1; App.selected = null; App.seenTypes = {};
    App.renderer.loadGame(App.game); App.renderer.deploy = null; App.renderer.itemTarget = null; App.renderer.selected = null;
    ND.UI.showBattle(App.game);
    ND.Audio.startMusic(App.game.mapDef.theme);
    ND.UI.log('守护进程已上线，接管 ' + App.game.mapDef.name, '');
    ND.UI.toast('防守开始 · ' + App.game.mapDef.name, 'good');
  };
  App.restart = function () { if (App.game) App.startBattle(App.game.mapId); };
  App.setPaused = function (p) {
    if (App.state !== 'battle') return;
    App.paused = p; ND.UI.setPauseUI(p);
    if (p) ND.UI.showScreen; // no-op
  };
  App.setSpeed = function (s) { App.speed = s; ND.UI.setSpeedUI(s); };

  // ---- 交互 ----
  App.beginDeploy = function (type) {
    if (App.state !== 'battle') return;
    App.renderer.itemTarget = null; App.renderer.deploy = { type, facing: 0, facingMode: false };
    App.selected = null; App.renderer.selected = null; ND.UI.hideSelection();
    ND.Audio.play('click');
  };
  App.beginItem = function (id) {
    if (App.state !== 'battle') return;
    const def = ND.ITEMS[id];
    if (App.game.itemCd[id] > App.game.time) { ND.UI.toast('道具冷却中', 'warn'); return; }
    const res = def.res === 'intel' ? App.game.intel : App.game.compute;
    if (res < def.cost) { ND.UI.toast('资源不足', 'error'); ND.Audio.play('error'); return; }
    App.renderer.deploy = null; App.renderer.itemTarget = id;
    ND.Audio.play('click');
    ND.UI.toast('选择投放位置 · ' + def.name, '');
  };
  App.cancelAction = function () {
    App.renderer.deploy = null; App.renderer.itemTarget = null;
    App.renderer.clearPreview();
  };
  App.upgradeSelected = function (branch) {
    const t = App.game.towers.find(x => x.id === App.selected); if (!t) return;
    const r = App.game.upgradeTower(t, branch);
    if (!r.ok) { ND.UI.toast(r.why === 'cost' ? '资源不足' : '无法升级', 'error'); ND.Audio.play('error'); }
    else { ND.UI.showSelection(App.game, t.id); }
  };
  App.skillSelected = function () {
    const t = App.game.towers.find(x => x.id === App.selected); if (!t) return;
    const r = App.game.useSkill(t);
    if (!r.ok) { ND.UI.toast(r.why === 'encrypted' ? '设备被加密，无法释放技能' : '技能冷却中', 'warn'); ND.Audio.play('error'); }
  };
  App.sellSelected = function () {
    const t = App.game.towers.find(x => x.id === App.selected); if (!t) return;
    App.game.sellTower(t); App.selected = null; App.renderer.selected = null; ND.UI.hideSelection();
  };

  App.bindInput = function () {
    const cv = App.renderer.renderer.domElement;
    let orbiting = false, panning = false, lastX = 0, lastY = 0, downX = 0, downY = 0, moved = 0;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      lastX = downX = e.clientX; lastY = downY = e.clientY; moved = 0;
      if (e.button === 1) { e.preventDefault(); if (e.shiftKey) panning = true; else orbiting = true; }
    });
    root.addEventListener('mousemove', e => {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (orbiting) App.renderer.orbit(dx, dy);
      if (panning) App.renderer.pan(dx, dy);
      lastX = e.clientX; lastY = e.clientY;
      // 悬停格
      const rect = cv.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      if (App.game && px >= 0 && py >= 0 && px <= rect.width && py <= rect.height) {
        App.renderer.hoverCell = App.renderer.screenToCell(px, py);
        if (App.renderer.deploy && App.renderer.deploy.facingMode && App.renderer.hoverCell >= 0) {
          const c = App.game.cellCenter(App.renderer.deploy.cell);
          const w = App.renderer.screenToCell(px, py);
          const wp = App.game.cellCenter(w);
          App.renderer.deploy.facing = Math.atan2(wp.x - c.x, wp.z - c.z);
        }
      } else App.renderer.hoverCell = -1;
    });
    root.addEventListener('mouseup', e => {
      if (e.button === 1) { orbiting = panning = false; }
      document.querySelectorAll('.tcard.dragging').forEach(c => c.classList.remove('dragging'));
      if (e.button === 0 && App.state === 'battle') {
        const rect = cv.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        const overCanvas = px >= 0 && py >= 0 && px <= rect.width && py <= rect.height && e.target === cv;
        if (overCanvas && moved < 8) App.handleClick(px, py);
      }
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); App.renderer.zoom(e.deltaY); }, { passive: false });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (App.state === 'demo') { App.exitDemo(); return; }
        if (ND.UI.current === 'codex' && App.state === 'battle') { ND.UI.hideScreens(); return; }
        if (App.renderer.deploy || App.renderer.itemTarget) { App.cancelAction(); return; }
        if (App.selected) { App.selected = null; App.renderer.selected = null; ND.UI.hideSelection(); return; }
        if (App.state === 'battle') App.setPaused(!App.paused);
        return;
      }
      if (App.state !== 'battle') return;
      if (e.code === 'Space') { e.preventDefault(); App.setPaused(!App.paused); }
      else if (e.key === 'Home') App.renderer.defaultView();
      else if (e.key >= '1' && e.key <= '6') { const id = ND.TOWER_ORDER[+e.key - 1]; App.beginDeploy(id); }
      else if (e.key === 'q' || e.key === 'Q') App.beginItem('isolator');
      else if (e.key === 'w' || e.key === 'W') App.beginItem('downgrade');
      else if (e.key === 'e' || e.key === 'E') App.beginItem('restore');
      else if (e.key === 'f' || e.key === 'F') App.skillSelected();
      else if (e.key === 'u' || e.key === 'U') App.upgradeSelected(null);
      else if (e.key === 'x' || e.key === 'X') App.sellSelected();
    });
  };

  App.handleClick = function (px, py) {
    const g = App.game, r = App.renderer;
    const cell = r.screenToCell(px, py);
    // 部署
    if (r.deploy) {
      if (r.deploy.facingMode) {
        const res = g.placeTower(r.deploy.type, r.deploy.cell, r.deploy.facing);
        if (res.ok) { r.deploy = null; App.cancelAction(); }
        else ND.UI.toast(REJECT_MSG[res.why] || '无法部署', 'error');
        return;
      }
      if (cell < 0) return;
      const chk = g.canPlace(r.deploy.type, cell);
      if (!chk.ok) { ND.UI.toast(REJECT_MSG[chk.why] || '无法部署', 'error'); ND.Audio.play('error'); if (chk.why === 'block') App.flashBlocked(chk.cell); return; }
      if (r.deploy.type === 'interceptor') { r.deploy.cell = cell; r.deploy.facingMode = true; ND.UI.toast('设定拦截器朝向 · 左键确认 / 右键取消', ''); return; }
      const res = g.placeTower(r.deploy.type, cell);
      if (res.ok) { App.cancelAction(); }
      return;
    }
    // 道具
    if (r.itemTarget) {
      const id = r.itemTarget;
      let target = cell;
      if (id === 'restore') { target = g.towerAt(cell); }
      const res = g.useItem(id, target);
      if (res.ok) { r.itemTarget = null; }
      else { ND.UI.toast(REJECT_MSG[res.why] || '无法投放', 'error'); ND.Audio.play('error'); if (res.why === 'block') App.flashBlocked(res.cell); }
      return;
    }
    // 选中
    const entId = r.pickEntity(px, py);
    if (entId) { App.selected = entId; r.selected = entId; ND.UI.showSelection(g, entId); ND.Audio.play('click'); return; }
    if (cell >= 0 && g.grid.cells[cell].type !== ND.CELL.VOID) { App.selected = null; r.selected = null; ND.UI.showTileInfo(g, cell); return; }
    App.selected = null; r.selected = null; ND.UI.hideSelection();
  };
  App.flashBlocked = function (i) { if (i == null) return; const p = App.game.cellCenter(i); App.renderer.burst(p.x, 0.5, p.z, 0xff2020, 16, 4, 0.6); App.renderer.shake(0.3); };

  // ---- 事件 → UI ----
  App.processEvents = function (g) {
    for (const ev of g.events) {
      const d = ev.data;
      switch (ev.type) {
        case 'waveStart':
          ND.UI.waveBanner('第 ' + d.wave + ' 波', d.isBoss ? 'BOSS 接近 · ' + ND.ENEMIES[g.mapDef.boss].name : d.flood ? '洪峰 · 多入口同时来袭' : '');
          ND.UI.log('波次 ' + d.wave + ' 来袭' + (d.flood ? '（洪峰）' : ''), d.isBoss ? 'err' : 'warn');
          ND.UI.updateForecast(g);
          break;
        case 'waveCleared': ND.UI.toast('波次 ' + d.wave + ' 肃清 · 情报 +8', 'good'); ND.UI.updateForecast(g); break;
        case 'enemySpawn':
          if (!App.seenTypes[d.enemy.type]) { App.seenTypes[d.enemy.type] = true; if (!d.enemy.boss) ND.UI.toast('新威胁识别 · ' + d.enemy.def.name, 'warn'); }
          break;
        case 'bossSpawn': ND.UI.waveBanner(d.enemy.def.name, 'BOSS 登场'); ND.UI.log('BOSS ' + d.enemy.def.name + ' 出现', 'err'); break;
        case 'bossPhase': ND.UI.toast(d.boss.def.name + ' 进入阶段 ' + (d.phase + 1), 'warn'); break;
        case 'rejected': ND.UI.toast(REJECT_MSG[d.why] || '操作被拒绝', 'error'); if (d.why === 'block') App.flashBlocked(d.cell); break;
        case 'nodeBroken': ND.UI.toast('节点被冲垮 · 道路重新开放', 'warn'); ND.UI.log('交换节点失守，旁路直通', 'warn'); break;
        case 'isolatorDestroyed': ND.UI.toast('应急隔离器被冲毁', 'warn'); break;
        case 'towerDestroyed': ND.UI.log('设备被摧毁：' + d.tower.def.name, 'err'); break;
        case 'routesChanged': ND.UI.log('路由收敛 · 入口 ' + d.changed.join('/') + ' 改道', ''); break;
        case 'leak': ND.UI.log('威胁突破出口 · 完整度 -' + d.dmg, 'err'); break;
        case 'gameEnd': setTimeout(() => { if (App.state === 'battle') { App.state = 'report'; ND.UI.showReport(g); } }, 900); break;
      }
    }
  };

  // ---- 主循环 ----
  App.loop = function (now) {
    requestAnimationFrame(App.loop);
    let dt = (now - App._last) / 1000; App._last = now;
    if (dt > 0.1) dt = 0.1;
    const r = App.renderer;
    if (App.state === 'battle' && App.game && !App.paused) {
      App._acc += dt * App.speed;
      const step = ND.DT; let n = 0;
      while (App._acc >= step && n < 12) { App.game.step(step); App._acc -= step; n++; }
      App.processEvents(App.game);
      r.consumeEvents(App.game);
      App._uiTick += dt;
      if (App._uiTick > 0.1) { App._uiTick = 0; ND.UI.updateHUD(App.game); if (App.selected) ND.UI.showSelection(App.game, App.selected); }
      ND.UI.updateHUD(App.game);
    } else if (App.state === 'demo' && App.game) {
      ND.Demo.update(dt);
    }
    if (App.state !== 'export') {
      if (App.game) r.sync(App.game, dt);
      else { r.updateCamera(dt); r.renderer.render(r.scene, r.camera); }
    }
  };

  // ---- 演示 ----
  App.startDemo = function (id) {
    const def = (ND.DEMOS || []).find(d => d.id === id); if (!def) return;
    App.game = ND.createGame(def.map, { seed: def.seed || 7, firstPrep: 9999 });
    App.state = 'demo'; App.paused = false; App.speed = 1;
    App.renderer.loadGame(App.game);
    ND.UI.hideBattle(); ND.UI.hideScreens();
    document.getElementById('forecast').style.display = 'none';
    document.getElementById('demo-overlay').classList.remove('hidden');
    document.getElementById('demo-title').textContent = '实战演示 · ' + def.title;
    document.getElementById('virtual-cursor').classList.remove('hidden');
    ND.Audio.startMusic(App.game.mapDef.theme);
    ND.Demo.start(def, App.game, App.renderer);
  };
  App.exitDemo = function () {
    ND.Demo.stop();
    document.getElementById('demo-overlay').classList.add('hidden');
    document.getElementById('virtual-cursor').classList.add('hidden');
    App.game = null; App.toMenu();
  };

  App.boot = function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.init); else App.init(); };
  App.boot();
})(typeof window !== 'undefined' ? window : globalThis);