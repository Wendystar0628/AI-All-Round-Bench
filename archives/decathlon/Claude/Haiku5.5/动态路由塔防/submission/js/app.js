// 应用主控：状态机、输入、界面同步、主循环与视频导出接口。
(function () {
  const D = window.GAME_DATA;
  const UD = window.UI_DATA;
  const UI = window.UI;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const S = () => window.Snd || { play() {}, init() {}, music() {}, resumeCtx() {} };

  const App = {
    sim: null,
    mapDef: null,
    view: null,
    paused: false,
    speed: 1,
    mode: null,        // { type: 'tower'|'item'|'aim', id, cell, angle }
    selected: null,    // { type:'tower'|'enemy'|'cell', id|cell }
    hover: -1,
    drag: null,
    orbit: null,
    demo: null,
    exportMode: false,
    inGame: false,
    lastT: 0,
    clock: 0,
    waveShown: 0,
    lastSelRefresh: 0,
    bossIdShown: null,
    lastHudKey: '',
    logCount: 0,

    init() {
      const canvas = $('#c3d');
      const ov = $('#ov');
      this.view = new window.View(canvas, ov);
      this.view.overlayExtra = (c, v) => this.drawOverlayExtra(c, v);
      UI.buildLevels((id) => this.startMap(id));
      UI.buildDemos((id) => this.startDemo(id));
      UI.buildHelp();
      UI.buildCards((card, ev) => this.onCardDown(card, ev), (card, el, enter) => this.onCardHover(card, el, enter));
      this.bindMenus();
      this.bindInput(canvas);
      window.addEventListener('resize', () => { this.view.resize(); this.applyUiScale(); if (this.inGame) this.view.fitCamera(); });
      this.applyUiScale();
      window.addEventListener('keydown', (e) => this.onKey(e));
      $('#loading').classList.add('gone');
      UI.show('title');
      requestAnimationFrame((t) => { this.lastT = t; this.loop(t); });
      S().init && S().init();
      this.installExport();
    },

    // 界面随窗口放大：以 1600×900 为基准，保证大分辨率下文字与控件不会过小
    applyUiScale() {
      const s = Math.max(0.8, Math.min(2.6, Math.min(window.innerWidth / 1600, window.innerHeight / 900)));
      for (const id of ['hud', 'screens']) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.style.zoom = s.toFixed(3);
        el.style.width = (window.innerWidth / s) + 'px';
        el.style.height = (window.innerHeight / s) + 'px';
      }
      this.uiScale = s;
    },

    // ---------- 屏幕与流程 ----------
    bindMenus() {
      document.body.addEventListener('click', (ev) => {
        const go = ev.target.closest('[data-go]');
        if (go && !go.disabled) {
          S().init && S().init();
          const to = go.dataset.go;
          if (to === 'codex') { UI.openCodex(); return; }
          if (to === 'help') { UI.show('help'); return; }
          if (to === 'levels') { UI.buildLevels((id) => this.startMap(id)); UI.show('levels'); return; }
          if (to === 'demos') { UI.show('demos'); return; }
          UI.show(to);
        }
      });
      $$('.tab').forEach((b) => b.addEventListener('click', () => UI.openCodex(b.dataset.tab)));
      $$('[data-vol]').forEach((el) => el.addEventListener('input', () => {
        const k = el.dataset.vol;
        $('#v' + k[0].toUpperCase() + k.slice(1)).textContent = el.value;
        S().setVolume && S().setVolume(k, +el.value / 100);
      }));
      $('#btnMuteSet').onclick = () => this.toggleMute();
      $('#btnMute').onclick = () => this.toggleMute();
      $('#pResume').onclick = () => this.resume();
      $('#pRestart').onclick = () => this.restart();
      $('#pLevels').onclick = () => this.toLevels();
      $('#btnPause').onclick = () => this.togglePause();
      $('#btnView').onclick = () => { if (this.inGame) { this.view.setDefaultView(false); this.toastOk('已回到默认视角'); } };
      $('#btnMenu').onclick = () => this.openPause();
      $('#btnNext').onclick = () => { if (this.sim && this.sim.state === 'prep') { this.sim.skipPrep(); this.sim.res.compute += 25; UI.toast('已提前来袭，获得 25 算力', 'info'); } };
      $$('.spd').forEach((b) => b.onclick = () => this.setSpeed(+b.dataset.s));
      $('#btnDemoExit').onclick = () => this.endDemo(true);
      document.body.addEventListener('contextmenu', (e) => e.preventDefault());
      $('#selBody').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-act]');
        if (!b || b.disabled || !this.sim || !this.selected || this.selected.type !== 'tower') return;
        const id = this.selected.id;
        const act = b.dataset.act;
        let r;
        if (act === 'skill') r = this.sim.useSkill(id);
        else if (act === 'upgrade') r = this.sim.upgrade(id);
        else if (act === 'branch') r = this.sim.chooseBranch(id, b.dataset.key);
        else if (act === 'sell') { r = this.sim.sell(id); if (r.ok) { this.selected = null; this.toastOk(`已撤下，退还算力 ${r.refund}`); } }
        if (r && r.ok === false) UI.toast(r.reason);
        else if (r && r.ok && act !== 'sell') this.toastOk(act === 'skill' ? '技能已释放' : act === 'upgrade' ? '升级完成' : '分支已选定');
        this.refreshSel(true);
      });
    },
    toggleMute() {
      const m = S().toggleMute ? S().toggleMute() : false;
      $('#btnMute').classList.toggle('on', m);
      $('#btnMuteSet').textContent = m ? '取消静音' : '静音';
    },
    startMap(id) {
      this.endDemo(false);
      this.mapDef = window.MAP_DEFS.find((m) => m.id === id);
      this.sim = new window.Sim(this.mapDef, { seed: 11 + Math.floor(Math.random() * 1000), compute: 260, intel: 80, prepT: 30 });
      this.view.buildMap(this.sim);
      this.view.setDefaultView(true);
      this.inGame = true;
      this.paused = false;
      this.speed = 1;
      this.mode = null;
      this.selected = null;
      this.clearPreview();
      this.setSpeed(1);
      this.enterHud();
      $('#mapName').textContent = `${this.mapDef.name} · ${this.mapDef.kind}`;
      $('#logBox').innerHTML = '';
      this.logLine(`拓扑载入：${this.mapDef.name}。预计 ${this.mapDef.waves} 波，Boss ${D.BOSSES[D.BOSS_NAME_BY_MAP[id]].name}。`, 'info');
      this.logLine('守护进程已上线，部署设备前请先观察流量路线。', 'info');
      UI.hideAll();
      this.waveShown = 0;
      this.bossIdShown = null;
      this.waveFc = -1;
      UI.renderForecast(this.sim, this.mapDef);
      this.showBanner(`首波倒计时`, `${this.mapDef.entries.map((e) => e.id + ' ' + e.name).join('　')}`);
      S().music && S().music(this.mapDef.theme);
      this.setSubtitleVisible(false);
    },
    enterHud() { $('#hud').classList.remove('hidden'); this.screenGame = true; },
    leaveHud() { $('#hud').classList.add('hidden'); this.inGame = false; },
    restart() {
      UI.hideAll();
      if (this.demo) { this.startDemo(this.demo.id); return; }
      this.startMap(this.mapDef.id);
    },
    toLevels() {
      this.endDemo(false);
      this.leaveHud();
      UI.hideAll();
      UI.buildLevels((id) => this.startMap(id));
      UI.show('levels');
      $('#scrLevels').classList.add('show');
      S().music && S().music('title');
    },
    openPause() {
      if (!this.inGame) return;
      this.paused = true;
      UI.hideAll();
      $('#scrPause').classList.add('show');
    },
    resume() {
      if (!this.inGame) return;
      UI.hideAll();
      this.paused = false;
    },
    togglePause() {
      if (!this.inGame) return;
      this.paused = !this.paused;
      $('#btnPause').classList.toggle('on', this.paused);
      $('#btnPause use').setAttribute('href', this.paused ? '#i-play' : '#i-pause');
    },
    setSpeed(s) {
      this.speed = s;
      $$('.spd').forEach((b) => b.classList.toggle('on', +b.dataset.s === s));
    },
    showBanner(main, sub, boss) {
      const el = $('#waveBanner');
      el.className = 'wave-banner' + (boss ? ' boss' : '');
      el.innerHTML = `${main}<small>${sub || ''}</small>`;
      el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      clearTimeout(this._bt);
      this._bt = setTimeout(() => el.classList.add('hidden'), 2700);
    },
    setSubtitleVisible(v, text) {
      const el = $('#subtitle');
      if (!v) { el.classList.add('hidden'); return; }
      el.textContent = text || '';
      el.classList.remove('hidden');
    },
    logLine(text, kind) {
      const t = this.sim ? UI.fmtTime(this.sim.t) : '00:00';
      UI.log(text, kind, `[${t}]`);
    },

    // ---------- 实战演示 ----------
    startDemo(id) {
      if (window.Demo && window.Demo.prepare) {
        this.demo = window.Demo.prepare(id);
        this.startMapForDemo(this.demo);
        $('#demoTitle').textContent = `实战演示 · ${this.demo.title}`;
        $('#demoBar').classList.remove('hidden');
        UI.hideAll();
        this.leaveHidden();
      }
    },
    leaveHidden() {},
    startMapForDemo(demo) {
      this.mapDef = window.MAP_DEFS.find((m) => m.id === demo.map);
      this.sim = new window.Sim(this.mapDef, { seed: demo.seed, compute: demo.compute, intel: demo.intel, prepT: 9999 });
      this.view.buildMap(this.sim);
      this.view.setDefaultView(true);
      this.inGame = true;
      this.paused = false;
      this.setSpeed(1);
      this.mode = null;
      this.selected = null;
      this.clearPreview();
      this.enterHud();
      $('#mapName').textContent = `${this.mapDef.name} · ${this.mapDef.kind}`;
      $('#logBox').innerHTML = '';
      this.waveShown = 0;
      this.bossIdShown = null;
      demo.setup(this);
      UI.renderForecast(this.sim, this.mapDef);
      S().music && S().music(this.mapDef.theme);
    },
    endDemo(toMenu) {
      if (!this.demo) return;
      if (window.Demo && window.Demo.cleanup) window.Demo.cleanup(this);
      this.demo = null;
      $('#demoBar').classList.add('hidden');
      this.setSubtitleVisible(false);
      $('#cursorFx').classList.add('hidden');
      if (toMenu) { this.leaveHud(); UI.hideAll(); UI.show('demos'); $('#scrDemos').classList.add('show'); }
    },

    // ---------- 主循环 ----------
    loop(now) {
      const dtReal = Math.min(0.05, Math.max(0, (now - this.lastT) / 1000));
      this.lastT = now;
      this.clock += dtReal;
      if (!this.exportMode && this.view && this.view.sim) {
        if (this.inGame && !this.paused) {
          this.advance(dtReal * this.speed, dtReal * this.speed);
        } else {
          // 暂停或菜单：只刷新镜头与表现
          this.view.frame(dtReal, this.view.sim);
          if (this.inGame) this.refreshHud(false);
        }
      }
      requestAnimationFrame((t) => this.loop(t));
    },
    // 推进一段模拟时间（dtSim 已含倍速），再渲染一帧
    advance(dtSim, dtView) {
      this.advanceSim(dtSim);
      this.view.frame(dtView != null ? dtView : dtSim, this.sim);
      this.refreshHud(false);
    },
    // 只推进逻辑（可细分步长）
    advanceSim(dtSim) {
      if (this.demo && window.Demo && window.Demo.tick) window.Demo.tick(this, dtSim);
      this.sim.update(dtSim);
      this.consumeEvents(this.sim.drainEvents());
      if (this.sim.state === 'won' || this.sim.state === 'lost') this.onGameEnd();
    },
    onGameEnd() {
      if (this.endShown) return;
      this.endShown = true;
      setTimeout(() => {
        this.endShown = false;
        if (this.demo) { this.endDemo(true); return; }
        UI.showReport(this.sim, this.sim.state, this.mapDef);
        $('#repRestart').onclick = () => { UI.hideAll(); this.startMap(this.mapDef.id); };
        $('#repLevels').onclick = () => this.toLevels();
      }, 1400);
      this.paused = true;
    },

    consumeEvents(events) {
      const sim = this.sim;
      this.view.previewPaths = this.previewPaths || null;
      this.view.handleEvents(events);
      for (const ev of events) {
        switch (ev.type) {
          case 'wave': {
            this.waveShown = ev.no;
            const peak = D.PEAK_WAVE[this.mapDef.id] === ev.no;
            const isBoss = ev.boss;
            this.showBanner(`第 ${ev.no} 波 / ${ev.total}`, isBoss ? `Boss 来袭：${D.BOSSES[D.BOSS_NAME_BY_MAP[this.mapDef.id]].name}` : peak ? '洪峰：三个入口同时大量出兵' : '敌方攻势正在推进', isBoss || peak);
            this.logLine(`第 ${ev.no} 波开始。${isBoss ? 'Boss 已进入战场。' : ''}`, isBoss ? 'bad' : 'warn');
            S().play('wave');
            if (isBoss) S().play('boss');
            break;
          }
          case 'newType': {
            const info = ev.boss ? null : D.ENEMIES[ev.kind];
            const name = info ? info.name : D.BOSSES[ev.kind].name;
            const desc = info ? info.brief.split('。')[0] + '。' : D.BOSSES[ev.kind].brief.split('。')[0] + '。';
            S().play('warn');
            UI.toast(`新威胁出现：${name}。${desc}`, 'info', 4200);
            this.logLine(`情报更新：首次发现${name}。`, 'warn');
            break;
          }
          case 'waveClear':
            this.logLine(`第 ${ev.no} 波已清理。情报 +${ev.bonus}，算力 +${20 + ev.no * 2}。`, 'good');
            S().play('clear');
            break;
          case 'spawn':
            if (ev.boss) { this.logLine(`Boss 登场：${D.BOSSES[ev.kind].name}（${this.mapDef.entries.find((e) => e.id === ev.entry).name}）`, 'bad'); S().play('boss'); }
            break;
          case 'reroute': {
            const names = ev.entries.map((id) => id + ' ' + (this.mapDef.entries.find((e) => e.id === id) || {}).name).join('、');
            this.logLine(`路线改写：${names} 已重新寻路。`, 'warn');
            S().play('reroute');
            break;
          }
          case 'isolate':
            if (ev.kind === 'device') this.logLine(`节点隔离：${this.nodeLabel(ev.cell)}。`, 'info');
            else this.logLine(`应急隔离器接入：${this.nodeLabel(ev.cell)}。`, 'info');
            S().play('isolate');
            break;
          case 'restore':
            this.logLine(`节点恢复直通：${this.nodeLabel(ev.cell)}${ev.kind === 'broken' ? '（隔离被冲毁）' : ev.kind === 'expire' ? '（有效期结束）' : ''}。`, 'good');
            S().play('restore');
            break;
          case 'built': {
            const t = sim.towers.get(ev.tower);
            if (t) this.logLine(`${D.TOWERS[t.kind].name}已部署在${this.cellName(t.cell)}。`, 'info');
            S().play('build');
            break;
          }
          case 'sold': S().play('sell'); break;
          case 'towerDown': {
            this.logLine(`告警：${D.TOWERS[ev.kind].name}（${this.cellName(ev.cell)}）已被摧毁。`, 'bad');
            S().play('boom');
            break;
          }
          case 'upgrade': this.logLine(`${D.TOWERS[ev.kind].name}升至 2 级。`, 'good'); S().play('upgrade'); break;
          case 'branch': this.logLine(`${D.TOWERS[ev.kind].name}选定分支：${D.TOWERS[ev.kind].branches[ev.branch].name}。`, 'good'); S().play('upgrade'); break;
          case 'skill': this.logLine(`${D.TOWERS[ev.kind].name}释放技能：${D.TOWERS[ev.kind].skill.name}。`, 'info'); S().play('skill'); break;
          case 'reveal': S().play('reveal'); break;
          case 'payload': this.logLine('木马载荷引爆，附近设备受损。', 'bad'); S().play('boom'); break;
          case 'slam': if (ev.kind === 'boss') this.logLine('洪峰冲击：隔离节点被冲击。', 'bad'); S().play('boom'); break;
          case 'warn': this.logLine(ev.kind === 'blackhole' ? '预警：伪路由即将在前方链路生成黑洞。' : '预警：运维环即将被锁死。', 'bad'); S().play('warn'); break;
          case 'blackhole': this.logLine('伪路由黑洞已生成，相关链路暂时截断。', 'bad'); S().play('boom'); break;
          case 'lock': this.logLine('运维环被锁死，流量改道。', 'bad'); S().play('boom'); break;
          case 'phase': this.logLine(`Boss 阶段变化：${ev.name}。`, 'bad'); S().play('boss'); break;
          case 'downgrade': this.logLine(`协议降级生效：${ev.cells.length} 段链路转为旧协议。`, 'warn'); S().play('downgrade'); break;
          case 'restoreTower': this.logLine('备份还原完成，设备恢复。', 'good'); S().play('heal'); break;
          case 'item': S().play('item'); break;
          case 'leak': S().play('leak'); break;
          case 'kill': if (ev.boss) { this.logLine('Boss 已被击溃！', 'good'); } S().play(ev.boss ? 'bossKill' : 'kill'); break;
          case 'hit': S().play('hit'); break;
          case 'shot': S().play('shot'); break;
          case 'block': S().play('block'); break;
          case 'heal': S().play('heal'); break;
          case 'encrypt': this.logLine('设备被加密，暂停攻击与治疗。', 'bad'); S().play('lock'); break;
          case 'trap': S().play('trap'); break;
          case 'clone': S().play('clone'); break;
          case 'aoe': S().play('aoe'); break;
          case 'towerHit': if (Math.random() < 0.25) S().play('towerHit'); break;
          case 'end': break;
        }
      }
    },
    // 操作被拒（会封死）：在位置上标出红色脉冲
    sealFeedback(cell) {
      const g = this.sim.g;
      this.view.emitRing(g.worldX(cell), 0.3, g.worldZ(cell), 0xff4d6d, 1.8, 0.9);
      this.view.emitText(g.worldX(cell), 1.3, g.worldZ(cell), '会封死', '#ff7a8f', true);
    },
    nodeLabel(cell) { return this.cellName(cell); },
    cellName(cell) {
      const g = this.sim.g;
      const nm = this.mapDef.names && this.mapDef.names[g.x[cell] + ',' + g.y[cell]];
      return nm ? `${nm}（${g.x[cell]},${g.y[cell]}）` : `(${g.x[cell]},${g.y[cell]})`;
    },

    // ---------- 输入 ----------
    bindInput(canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.orbit = { x: e.clientX, y: e.clientY, pan: e.shiftKey };
          canvas.setPointerCapture(e.pointerId);
        } else if (e.button === 2) {
          this.cancelAll();
        } else if (e.button === 0) {
          this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
          canvas.setPointerCapture(e.pointerId);
        }
      });
      canvas.addEventListener('pointermove', (e) => {
        if (this.orbit) {
          const dx = e.clientX - this.orbit.x, dy = e.clientY - this.orbit.y;
          this.orbit.x = e.clientX; this.orbit.y = e.clientY;
          if (e.shiftKey || this.orbit.pan) this.view.pan(dx, dy); else this.view.orbit(dx, dy);
          return;
        }
        this.updateHover(e.clientX, e.clientY);
      });
      canvas.addEventListener('pointerup', (e) => {
        if (this.orbit) { this.orbit = null; return; }
        if (e.button === 0 && this.pointerDown) {
          const d = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
          this.pointerDown = null;
          if (d < 6) this.onCanvasClick(e.clientX, e.clientY);
        }
      });
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.view.zoom(e.deltaY); }, { passive: false });
      canvas.addEventListener('auxclick', (e) => e.preventDefault());
      canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    },
    onKey(e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' && this.inGame && !this.demo) { e.preventDefault(); this.togglePause(); }
      else if (e.code === 'Space' && this.demo) { e.preventDefault(); this.togglePause(); }
      else if (e.key === '1' && this.inGame) this.setSpeed(1);
      else if (e.key === '2' && this.inGame) this.setSpeed(2);
      else if (e.key === '3' && this.inGame) this.setSpeed(3);
      else if (e.key === 'Home' && this.inGame) { this.view.setDefaultView(false); e.preventDefault(); }
      else if (e.key === 'Escape') {
        if (this.demo) { this.endDemo(true); return; }
        if (this.mode || this.selected) this.cancelAll();
        else if (this.inGame && !$('#scrPause').classList.contains('show')) this.openPause();
        else if ($('#scrPause').classList.contains('show')) this.resume();
        else if (!this.inGame) UI.show('title');
      }
    },
    cancelAll() {
      this.mode = null;
      this.selected = null;
      this.clearPreview();
      this.drag = null;
      this.hideGhost();
      this.setArmed(null);
      $('#modeHint').classList.add('hidden');
      this.refreshSel(true);
    },
    onCardDown(card, ev) {
      if (!this.inGame) return;
      ev.preventDefault();
      S().play('click');
      this.drag = { card, x0: ev.clientX, y0: ev.clientY, moved: false };
      const move = (e) => {
        if (!this.drag) return;
        const dd = Math.hypot(e.clientX - this.drag.x0, e.clientY - this.drag.y0);
        if (!this.drag.moved && dd > 6) { this.drag.moved = true; this.showGhost(card); }
        if (this.drag.moved) {
          this.moveGhost(e.clientX, e.clientY);
          this.updateHover(e.clientX, e.clientY);
        }
      };
      const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!this.drag) return;
        const dr = this.drag;
        this.drag = null;
        this.hideGhost();
        if (dr.moved) {
          const cell = this.view.cellAt(e.clientX, e.clientY);
          const onUi = e.target && e.target.closest ? e.target.closest('.panel,.deck,.topbar') : null;
          if (cell >= 0 && !onUi) this.tryDropCard(card, cell, e.clientX, e.clientY);
          else this.clearPreview();
        } else {
          // 单击：切换为待放置状态
          if (this.mode && this.mode.id === card.id) { this.mode = null; this.clearPreview(); this.setArmed(null); }
          else { this.mode = { type: card.kind === 'tower' ? 'tower' : 'item', id: card.id }; this.setArmed(card.id); this.showModeHint(); }
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    onCardHover(card, el, enter) {
      if (enter) { this.showTip(UI.cardTip(card), el); }
      else this.hideTip();
    },
    tryDropCard(card, cell, x, y) {
      this.mode = { type: card.kind === 'tower' ? 'tower' : 'item', id: card.id };
      this.setArmed(card.id);
      this.hover = cell;
      if (card.id === 'interceptor') {
        const chk = this.sim.checkTower('interceptor', cell);
        if (!chk.ok) { UI.toast(chk.reason); this.mode = null; this.setArmed(null); this.clearPreview(); return; }
        this.mode = { type: 'aim', id: 'interceptor', cell, angle: 0 };
        this.showModeHint();
        return;
      }
      this.applyModeAt(cell, x, y);
    },
    onCanvasClick(x, y) {
      if (!this.inGame) return;
      if (this.mode && this.mode.type === 'aim') {
        const p = this.view.groundPoint(x, y);
        const cell = this.mode.cell;
        if (p) {
          const g = this.sim.g;
          const cx = g.worldX(cell), cz = g.worldZ(cell);
          let ang = Math.atan2(p.z - cz, p.x - cx);
          if (Math.hypot(p.x - cx, p.z - cz) < 0.2) ang = this.mode.angle || 0;
          const res = this.sim.placeTower('interceptor', cell, { angle: this.snapAngle(ang) });
          if (res.ok) { this.toastOk('拦截器已部署，朝向已设定'); this.mode = null; this.setArmed(null); this.clearPreview(); }
          else UI.toast(res.reason);
        }
        return;
      }
      if (this.mode) {
        const cell = this.view.cellAt(x, y);
        if (cell >= 0) { this.applyModeAt(cell, x, y); return; }
      }
      const pk = this.view.pick(x, y);
      this.select(pk);
    },
    snapAngle(a) {
      const step = Math.PI / 4;
      return Math.round(a / step) * step;
    },
    applyModeAt(cell, x, y) {
      const m = this.mode;
      if (!m) return;
      if (m.type === 'tower') {
        if (m.id === 'interceptor') {
          const chk = this.sim.checkTower('interceptor', cell);
          if (!chk.ok) { UI.toast(chk.reason); return; }
          this.mode = { type: 'aim', id: 'interceptor', cell, angle: 0 };
          this.showModeHint();
          return;
        }
        const res = this.sim.placeTower(m.id, cell);
        if (res.ok) {
          this.toastOk(`${D.TOWERS[m.id].name}已部署`);
          this.clearPreview();
          if (!this.keepMode) { this.mode = null; this.setArmed(null); }
        } else { UI.toast(res.reason); if (res.sealed) this.sealFeedback(cell); }
        this.refreshSel(true);
      } else if (m.type === 'item') {
        let target = cell;
        if (m.id === 'restore') {
          const t = this.sim.cellTower[cell];
          if (!t) { UI.toast('备份还原需要指向己方设备'); return; }
        }
        const res = this.sim.useItem(m.id, target);
        if (res.ok) {
          this.toastOk(`${D.ITEMS[m.id].name}已使用`);
          this.clearPreview();
          this.mode = null; this.setArmed(null);
        } else UI.toast(res.reason);
      }
    },
    select(pk) {
      if (pk.tower) this.selected = { type: 'tower', id: pk.tower };
      else if (pk.enemy) this.selected = { type: 'enemy', id: pk.enemy };
      else if (pk.cell != null) this.selected = { type: 'cell', cell: pk.cell };
      else this.selected = null;
      this.refreshSel(true);
    },
    updateHover(x, y) {
      if (!this.inGame) return;
      if (this.mode && this.mode.type === 'aim') {
        const p = this.view.groundPoint(x, y);
        if (p) {
          const cell = this.mode.cell;
          const g = this.sim.g;
          this.mode.angle = this.snapAngle(Math.atan2(p.z - g.worldZ(cell), p.x - g.worldX(cell)));
          this.updatePreview(cell, true);
        }
        return;
      }
      if (this.mode || this.drag) {
        const cell = this.view.cellAt(x, y);
        this.hover = cell;
        if (cell >= 0) this.updatePreview(cell, false);
        else this.clearPreview(true);
      }
      if (this.ghostEl && !this.ghostEl.classList.contains('hidden')) {}
    },
    // 预览：作用范围、可否部署、路线改写
    updatePreview(cell, aim) {
      const m = this.mode || (this.drag && this.drag.card ? { type: this.drag.card.kind === 'tower' ? 'tower' : 'item', id: this.drag.card.id } : null);
      const sim = this.sim, g = sim.g;
      if (!m) { this.clearPreview(); return; }
      const id = m.id;
      const hint = [];
      let rings = [], cells = [], cone = null, paths = null, ok = true, reason = '';
      if (m.type === 'tower' || aim) {
        const kind = m.type === 'aim' ? 'interceptor' : id;
        const chk = sim.checkTower(kind, cell);
        ok = chk.ok; reason = chk.reason || '';
        cells.push({ c: cell, ok });
        const def = D.TOWERS[kind];
        const wx = g.worldX(cell), wz = g.worldZ(cell);
        if (kind === 'interceptor') {
          const ang = aim && this.mode ? this.mode.angle || 0 : 0;
          cone = { x: wx, z: wz, ang, range: def.range, arc: 0.6, ok };
          hint.push(aim ? '移动鼠标设定朝向，单击确认（右键取消）' : '');
        }
        if (kind === 'sandbox') rings.push({ x: wx, z: wz, r: def.aoeRange, color: 0xb388ff }, { x: wx, z: wz, r: def.detectR, color: 0x8fb8ff });
        if (kind === 'repair') rings.push({ x: wx, z: wz, r: def.healR, color: 0x6ef3a5 });
        if (kind === 'honeypot') rings.push({ x: wx, z: wz, r: def.tauntR, color: 0xffd166 });
        if (kind === 'firewall' && g.type[cell] === 'node') {
          for (const n of g.nbrs4(cell)) if (g.passable[n]) cells.push({ c: n, ok: true, zone: true });
        }
        if (kind === 'firewall' || kind === 'gateway') {
          if (g.type[cell] === 'node' && ok) paths = this.previewIsolation(cell);
        }
        if (!ok && !reason) reason = '无法部署';
      } else if (m.id === 'isolator') {
        const chk = sim.checkItem('isolator', cell);
        ok = chk.ok; reason = chk.reason || '';
        cells.push({ c: cell, ok });
        if (ok) paths = this.previewIsolation(cell);
      } else if (m.id === 'downgrade') {
        const chk = sim.checkItem('downgrade', cell);
        ok = chk.ok; reason = chk.reason || '';
        if (chk.ok) { for (const c of chk.cells) cells.push({ c, ok: true }); }
        rings.push({ x: g.worldX(cell), z: g.worldZ(cell), r: D.ITEMS.downgrade.radius, color: 0xff9a3a });
      } else if (m.id === 'restore') {
        const chk = sim.checkItem('restore', cell);
        ok = chk.ok; reason = chk.reason || '';
        cells.push({ c: cell, ok });
      }
      this.view.setPreview({ cells: cells.filter((c) => c.c >= 0), rings, cone });
      if (paths) this.setPreviewPaths(paths);
      else this.setPreviewPaths(null);
      const hintEl = $('#modeHint');
      const txt = ok ? (hint.filter(Boolean).join('；') || this.okHint(m, cell)) : reason;
      if (txt) {
        hintEl.textContent = txt;
        hintEl.style.borderColor = ok ? '' : 'var(--red)';
        hintEl.classList.remove('hidden');
      }
      this.previewCell = cell;
      this.previewOk = ok;
    },
    okHint(m, cell) {
      if (m.id === 'firewall' && this.sim.g.type[cell] === 'node') return '隔离节点：查看下方预览路线（虚线）';
      if (m.id === 'gateway') return '网闸隔离此节点：查看预览路线';
      if (m.id === 'isolator') return '应急隔离器：临时隔离此节点';
      if (m.id === 'downgrade') return '协议降级：区域内链路转为旧协议（减速并显形）';
      if (m.id === 'restore') return '备份还原：恢复设备生命并解除加密';
      return '松开鼠标即可部署';
    },
    previewIsolation(cell) {
      const pv = this.sim.previewIsolate(cell);
      const paths = {};
      for (const id in pv.paths) paths[id] = pv.paths[id];
      if (!pv.ok) return null;
      return paths;
    },
    setPreviewPaths(paths) {
      this.previewPaths = paths;
      this.view.refreshRoutes(this.sim.entryPaths(), paths);
      if (this.view.previewObjs && this.view.previewObjs.length) {}
    },
    clearPreview(keepHint) {
      this.view.setPreview(null);
      if (this.previewPaths) { this.previewPaths = null; this.view.refreshRoutes(this.sim.entryPaths(), null); }
      if (!keepHint) $('#modeHint').classList.add('hidden');
    },
    showModeHint() {
      const el = $('#modeHint');
      el.textContent = this.mode && this.mode.type === 'aim' ? '拦截器：移动鼠标设定朝向，单击确认（右键取消）' : '拖到地图上放下，或单击地图；右键取消';
      el.style.borderColor = '';
      el.classList.remove('hidden');
    },
    setArmed(id) { UI.setArmed(id); },
    toastOk(msg) { UI.toast(msg, 'ok', 1600); },
    showGhost(card) {
      const g = $('#ghost');
      g.innerHTML = `<svg style="display:block;margin:0 auto 4px"><use href="#${card.icon}"/></svg>${card.name}`;
      g.classList.remove('hidden');
    },
    moveGhost(x, y) { const g = $('#ghost'); g.style.left = x + 'px'; g.style.top = y + 'px'; },
    hideGhost() { $('#ghost').classList.add('hidden'); },
    showTip(html, el) {
      const t = $('#tooltip');
      t.innerHTML = html;
      t.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      t.style.left = Math.max(10, Math.min(window.innerWidth - 380, r.left + r.width / 2 - 170)) + 'px';
      t.style.top = Math.max(10, r.top - t.offsetHeight - 10) + 'px';
      t.style.top = (r.top - 12 - t.offsetHeight) + 'px';
    },
    hideTip() { $('#tooltip').classList.add('hidden'); },

    // ---------- HUD ----------
    refreshHud(force) {
      const sim = this.sim;
      if (!sim) return;
      const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
      set('#vCompute', String(Math.floor(sim.res.compute)));
      set('#vIntel', String(Math.floor(sim.res.intel)));
      set('#vInteg', String(Math.max(0, Math.round(sim.integrity))));
      $('#barInteg').style.width = Math.max(0, sim.integrity) + '%';
      const cw = Math.max(0, sim.integrity) / 100;
      $('#barInteg').style.filter = sim.integrity < 35 ? 'saturate(1.6) brightness(1.1)' : '';
      const waveTxt = `${sim.waveNo} / ${sim.totalWaves}`;
      set('#vWave', waveTxt);
      if (sim.state === 'prep') {
        set('#waveLabel', sim.waveNo === 0 ? '首波倒计时' : '下一波倒计时');
        set('#vCountdown', `${UI.fmtTime(Math.max(0, sim.prepT))}`);
      } else if (sim.state === 'active') {
        set('#waveLabel', `第 ${sim.waveNo} 波进行中`);
        set('#vCountdown', `剩余 ${sim.enemies.size + sim.spawnQ.length} 个`);
      } else set('#waveLabel', sim.state === 'won' ? '防御成功' : '中枢失守');
      const inc = 2.0 + 0.3 * Math.max(0, sim.waveNo - 1);
      set('#incCompute', `+${inc.toFixed(1)}/秒`);
      this.updateBossBar(sim);
      if (this.waveFc !== sim.waveNo || force) { this.waveFc = sim.waveNo; UI.renderForecast(sim, this.mapDef); }
      UI.updateCards(sim);
      if (this.clock - this.lastSelRefresh > 0.25 || force) { this.lastSelRefresh = this.clock; this.refreshSel(false); }
      $('#btnNext').disabled = sim.state !== 'prep' || !!this.demo;
      $('#btnNext').classList.toggle('disabled', sim.state !== 'prep');
    },
    updateBossBar(sim) {
      const bar = $('#bossBar');
      const boss = sim.bossList().find((b) => !b.dead);
      if (!boss) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      $('#bossName').textContent = boss.def.name;
      $('#bossTitle').textContent = boss.def.title;
      $('#bossHp').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      const phases = { wanku: ['洪峰待命', '蠕虫群'], shenlou: ['伪路由', '路由风暴'], zhenying: ['潜伏', '提权', '破坏'] }[boss.bossKind] || [];
      const pIdx = boss.bossKind === 'zhenying' ? (boss.bossPhase || 0) : (boss.bossPhase || 0) ? 1 : 0;
      const hidden = boss.bossKind === 'zhenying' && boss.hiddenNow ? '（潜伏中，需检测才能被单体攻击选中）' : '';
      $('#bossPhase').textContent = `阶段：${phases[pIdx] || ''}　${hidden}`;
    },
    refreshSel(force) {
      const body = $('#selBody');
      const title = $('#selTitle');
      const sim = this.sim;
      const s = this.selected;
      if (!sim) return;
      if (!s) { title.textContent = '选中'; if (force || !this._emptySel) { body.innerHTML = '<div class="muted">点选设备、敌人或地块查看详情。右键取消当前操作。</div>'; this._emptySel = true; } return; }
      this._emptySel = false;
      if (s.type === 'tower') {
        const t = sim.towers.get(s.id);
        if (!t) { this.selected = null; this.refreshSel(true); return; }
        const d = D.TOWERS[t.kind];
        title.textContent = `${d.name} · Lv${t.level}`;
        const cls = `<span class="tag" style="color:${UD.CLS_COLOR[d.cls]}">${UD.CLS_NAME[d.cls]}</span>`;
        const brBox = t.branch ? `<div>分支：<b>${d.branches[t.branch].name}</b></div>` : '';
        const enc = sim.isEnc(t) ? `<div style="color:#d5b8ff">状态：加密中（${Math.ceil(t.encUntil - sim.t)} 秒）</div>` : '';
        const shield = t.shield > 0 ? `<div style="color:#7cf9ff">护盾 ${Math.round(t.shield)}</div>` : '';
        const blk = t.blockCap ? `<div>阻挡：${t.blockers.size} / 容量 ${t.blockCap}</div>` : '';
        const hpPct = Math.max(0, (t.hp / t.maxHp) * 100).toFixed(0);
        const node = this.sim.g.type[t.cell] === 'node' ? (this.sim.isoDevice[t.cell] === t ? '<div style="color:#ff7a8f">该节点已由本设备隔离</div>' : '') : '';
        const sk = d.skill ? `<button class="btn small" data-act="skill" ${t.skillCd > 0 || sim.isEnc(t) ? 'disabled' : ''}>${d.skill.name}${t.skillCd > 0 ? '（' + Math.ceil(t.skillCd) + 's）' : ''}</button>` : '';
        const up = t.level < 2 && d.upCost ? `<button class="btn small" data-act="upgrade">升级（算力 ${d.upCost}）</button>` : '';
        let br = '';
        if (t.level >= 2 && d.branches && !t.branch) {
          br = Object.keys(d.branches).map((k) => `<button class="btn small" data-act="branch" data-key="${k}">${d.branches[k].name}（情报 20）</button>`).join('');
          br = `<div class="muted small" style="margin-top:6px">选择分支（互斥）：</div>` + br;
        }
        const sell = `<button class="btn small danger" data-act="sell">撤下（退还 ${sim.sellPrice(t.id)} 算力）</button>`;
        body.innerHTML = `<div class="sel-title">${d.name}</div>${cls}
          <div class="hpbar"><i style="width:${hpPct}%;background:${hpPct > 50 ? '#6ef3a5' : hpPct > 25 ? '#ffd166' : '#ff5d73'}"></i></div>
          <div class="kv"><span>耐久</span><div>${Math.round(t.hp)} / ${t.maxHp}</div><span>位置</span><div>${this.cellName(t.cell)}</div></div>
          ${brBox}${blk}${enc}${shield}${node}
          <div style="margin-top:6px;color:#b5cbe0">${d.brief}</div>
          ${t.branch ? `<div class="muted small">${d.branches[t.branch].desc}</div>` : ''}
          ${d.skill ? `<div class="muted small">技能：${d.skill.desc}</div>` : ''}
          <div class="sel-actions">${sk}${up}${sell}</div>${br}`;
        body.dataset.kind = 'tower';
      } else if (s.type === 'enemy') {
        const e = sim.enemies.get(s.id);
        if (!e) { this.selected = null; this.refreshSel(true); return; }
        const def = e.def;
        title.textContent = def.name;
        const stat = [];
        if (e.hiddenNow && !e.isBoss) stat.push('伪装中（未显形）');
        if (e.isBoss && e.hiddenNow) stat.push('潜伏（需检测）');
        if (e.blocker) stat.push('被阻挡');
        if (e.slowT > 0) stat.push('减速');
        if (e.suppressT > 0) stat.push('压制');
        if (e.trapT > 0) stat.push('被困');
        if (e.shield > 0) stat.push('护盾 ' + Math.round(e.shield));
        body.innerHTML = `<div class="sel-title">${def.name}${e.isBoss ? ' · Boss' : ''}</div>
          <div class="hpbar"><i style="width:${Math.max(0, e.hp / e.maxHp * 100)}%;background:#ff5d73"></i></div>
          <div class="kv"><span>生命</span><div>${Math.max(0, Math.round(e.hp))} / ${e.maxHp}</div><span>入口</span><div>${e.entry}</div></div>
          <div>${stat.join('　') || '正常'}</div>
          <div style="margin-top:6px;color:#b5cbe0">${def.brief || (e.isBoss ? D.BOSSES[e.type].brief : '')}</div>`;
        body.dataset.kind = 'enemy';
      } else if (s.type === 'cell') {
        const c = s.cell, g = sim.g;
        const typeName = { link: '链路', old: '旧链路', node: '交换节点', plat: '设备平台', block: '障碍', entry: '入口', exit: '出口', void: '空域' }[g.type[c]] || '';
        const tower = sim.cellTower[c];
        title.textContent = typeName;
        let extra = '';
        if (g.type[c] === 'node') {
          const iso = sim.isIsolated(c);
          extra = `<div>状态：<b style="color:${iso ? '#ff7a8f' : '#6ef3a5'}">${iso ? '已隔离（不能通行）' : '直通'}</b></div>`;
          if (!iso && sim.nodeCd[c] > sim.t) extra += `<div class="muted">再次隔离冷却 ${Math.ceil(sim.nodeCd[c] - sim.t)} 秒</div>`;
        }
        if (g.type[c] === 'old') extra += '<div>旧协议：地面敌人减速，木马显形</div>';
        if (sim.downgrade.has(c)) extra += '<div>协议降级中：按旧链路计算</div>';
        if (sim.blackhole.has(c)) extra += '<div style="color:#b07cff">伪路由黑洞：暂时截断</div>';
        if (sim.lock.has(c)) extra += '<div style="color:#9fe8ff">运维环锁死：暂时截断</div>';
        const ent = g.entries.find((e) => e.cell === c) || g.exits.find((e) => e.cell === c);
        if (ent) extra += `<div>${ent.id} · ${ent.def.name}</div>`;
        body.innerHTML = `<div class="sel-title">${typeName}</div><div class="kv"><span>坐标</span><div>${this.cellName(c)}</div></div>${extra}${tower ? '<div class="muted">此处有设备，点选可查看。</div>' : ''}`;
        body.dataset.kind = 'cell';
      }
    },
    drawOverlayExtra(c, v) {
      // 节点状态字样
    },

    // ---------- 演示与导出 ----------
    installExport() {
      const self = this;
      window.videoExport = {
        runs: ['demo-1', 'demo-2', 'demo-3'],
        begin(runId, opts) {
          const fps = (opts && opts.fps) || 30;
          self.exportMode = true;
          self.exportFps = fps;
          self.exportRun = runId;
          self.exportCursor = 0;
          self.exportT = 0;
          self.endDemo(false);
          self.startDemo(runId);
          const dur = window.Demo.duration(runId);
          self.exportFrames = Math.round(dur * fps) + 1;
          self.view.resize();
          return Promise.resolve({ frames: self.exportFrames });
        },
        frame(i) {
          const target = i / self.exportFps;
          const dt = target - self.exportT;
          if (dt > 0) {
            // 按固定步长推进，保证同一帧的结果与机器速度无关
            const step = 1 / 120;
            let rem = dt;
            while (rem > 1e-9) {
              const h = Math.min(rem, step);
              self.advanceSim(h);
              rem -= h;
            }
          }
          self.exportT = target;
          self.view.frame(dt > 0 ? dt : 0, self.sim);
          self.refreshHud(true);
          return Promise.resolve();
        },
        end() {
          self.exportMode = false;
          self.endDemo(true);
          self.toLevels();
          return undefined;
        },
      };
    },
  };

  window.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})();
